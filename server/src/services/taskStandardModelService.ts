import { hasAnyScopeObjectId } from './engineeringObjectService.js'
import { randomUUID } from 'crypto'
import {
  getClient,
  isDatabaseTransactionActive,
  registerDatabasePostCommitEffect,
} from '../database.js'
import { supabase } from './dbService.js'
import { createLineageBatchInTransaction, recordLineageInTransaction, type LineageLinkInput } from './dataLineageService.js'
import { evaluateTaskConstraint } from './taskConstraintGovernanceService.js'
import { clearCriticalPathCache } from './criticalPathHelpers.js'
import { clearProjectCriticalPathSnapshotCache } from './projectCriticalPathService.js'
import { isFormalTaskDependencyEvidence } from './taskDependencyPublicationPolicy.js'
import { getStatusLabel, getVisualTone, normalizeStatus } from './statusDictionaryService.js'
import { deriveTaskUnifiedStatus } from './taskStatusDerivationService.js'

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
  release?: () => void
}

type ReplaceTaskDependenciesOptions = {
  projectId: string
  preserveCurrentTaskFacts?: boolean
}

// ============================================================
// v1.4.3/4.4/4.5 Task standard model service
// ============================================================

/**
 * v1.4.4: Shared active task predicate.
 * Active tasks MUST have: deleted_at IS NULL, status NOT IN (cancelled, archived, voided, deleted).
 */
export function isActiveTask(task: Record<string, unknown>): boolean {
  const status = String(task.status ?? '').trim().toLowerCase()
  const deletedAt = (task as any).deleted_at
  if (deletedAt != null) return false
  const inactiveStatuses = ['cancelled', 'archived', 'voided', 'deleted', '已取消', '已归档', '已作废', '已删除']
  return !inactiveStatuses.includes(status)
}

const STANDARD_STATUSES = ['todo', 'pending', 'in_progress', 'blocked', 'completed', 'cancelled'] as const
export type StandardTaskStatus = (typeof STANDARD_STATUSES)[number]

const LEGACY_STATUS_MAP: Record<string, StandardTaskStatus> = {
  todo: 'todo',
  pending: 'pending',
  in_progress: 'in_progress',
  blocked: 'blocked',
  completed: 'completed',
  cancelled: 'cancelled',
  not_started: 'todo',
  delayed: 'blocked',
  on_hold: 'blocked',
  done: 'completed',
}

export function normalizeTaskStatus(raw: string | null | undefined): StandardTaskStatus {
  const normalized = String(raw ?? '').trim().toLowerCase()
  if (!normalized) return 'pending'
  const mapped = LEGACY_STATUS_MAP[normalized]
  if (mapped) return mapped
  throw Object.assign(new Error(`Unknown task status: ${raw}`), { code: 'TASK_STATUS_INVALID', statusCode: 400 })
}

export interface StandardTaskWritePayload {
  status?: string
  progress_method?: string
  progress?: number
  planned_quantity?: number | null
  completed_quantity?: number | null
  quantity_unit?: string | null
  is_wbs_summary?: boolean | null
  is_executable?: boolean | null
  standard_task_metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface StandardTaskValidationResult {
  valid: boolean
  errors: string[]
  normalizedStatus: StandardTaskStatus | null
  normalizedPayload: Record<string, unknown>
}

/**
 * Validate and normalize a task write payload against v1.4.3 standard model rules.
 * - Reject non-percent progress_method from normal API writes
 * - Reject quantity fields from normal API writes
 * - Reject execution fields on summary rows
 * - Normalize legacy statuses
 */
export function validateTaskStandardFields(
  payload: StandardTaskWritePayload,
  mode: 'normal' | 'systemWrite' | 'importBackfill' = 'normal',
): StandardTaskValidationResult {
  const errors: string[] = []
  let normalizedStatus: StandardTaskStatus | null = null

  // Status normalization
  if (payload.status !== undefined) {
    try {
      normalizedStatus = normalizeTaskStatus(payload.status)
    } catch (e: any) {
      errors.push(e.message)
    }
  }

  // progress_method: normal writes must be percent
  if (mode === 'normal') {
    const pm = String(payload.progress_method ?? 'percent').trim()
    if (pm !== 'percent') {
      errors.push('TASK_PROGRESS_METHOD_NOT_AVAILABLE: 当前版本仅支持百分比进度模式')
    }
    if (payload.planned_quantity != null || payload.completed_quantity != null || payload.quantity_unit != null) {
      errors.push('TASK_PROGRESS_METHOD_NOT_AVAILABLE: 当前版本不支持工程量字段')
    }
  }

  // systemWrite/importBackfill quantity validation
  if ((mode === 'systemWrite' || mode === 'importBackfill') && payload.progress_method === 'quantity') {
    if (payload.planned_quantity == null || Number(payload.planned_quantity) <= 0) {
      errors.push('quantity 模式下 planned_quantity 必须 > 0')
    }
    if (!payload.quantity_unit || String(payload.quantity_unit).trim() === '') {
      errors.push('quantity 模式下 quantity_unit 必填')
    }
  }

  // Summary rows cannot write execution fields
  if (payload.is_wbs_summary && !payload.is_executable) {
    const execFields = ['progress', 'actual_start_date', 'actual_end_date', 'assignee_user_id', 'completed_quantity']
    for (const f of execFields) {
      if (payload[f] !== undefined && payload[f] !== null) {
        errors.push(`结构汇总行不允许写入执行字段: ${f}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedStatus,
    normalizedPayload: {
      ...payload,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
    },
  }
}

export async function buildStandardDTO(
  task: Record<string, unknown>,
  opts: { mode: 'list' | 'detail' },
): Promise<Record<string, unknown>> {
  const hasScope = hasAnyScopeObjectId(task)
  const hasWbs = !!(task as any).wbs_node_type || !!(task as any).engineering_category_id

  let modelStatus: 'complete' | 'partial' | 'invalid' = 'complete'
  if (!hasScope) modelStatus = 'invalid'
  else if (!hasWbs) modelStatus = 'partial'

  // Readiness: condition + obstacle + drawing + material status
  const legacyReadinessStatus = {
    conditions_pending: (task as any).condition_count > (task as any).conditions_met_count ? true : undefined,
    obstacles_active: (task as any).obstacle_count > 0 ? true : undefined,
    drawing_required: (task as any).drawing_required || undefined,
    material_required: (task as any).material_required || undefined,
  }
  const legacyReady = !legacyReadinessStatus.conditions_pending && !legacyReadinessStatus.obstacles_active && !legacyReadinessStatus.drawing_required && !legacyReadinessStatus.material_required

  // v1.4.5: Status DTO — keep status as string, add flat DTO fields alongside
  const rawStatus = String(task.status ?? '')
  const normalizedKey = await normalizeStatus('task.lifecycle', rawStatus)
  const statusLabel = getStatusLabel('task.lifecycle', normalizedKey) || normalizedKey
  const tone = getVisualTone('task.lifecycle', normalizedKey) || 'slate'

  // Derive businessStatus and displayStatus from primary fields
  const statusDerivation = deriveTaskUnifiedStatus({
    ...task,
    status: normalizedKey,
    progress: Number(task.progress ?? 0),
    conditions_unmet: (task as any).condition_count > (task as any).conditions_met_count ? ((task as any).condition_count - (task as any).conditions_met_count) : 0,
    obstacles_active: (task as any).obstacle_count ?? 0,
    ready_for_start: (task as any).ready_for_start ?? legacyReady,
  })
  const business = statusDerivation.businessStatus

  const base: Record<string, unknown> = {
    ...task,
    status: normalizedKey,
    statusDomain: 'task.lifecycle',
    statusKey: normalizedKey,
    statusLabel,
    visualTone: tone,
    semanticTone: tone,
    dictionaryVersion: 'v1.4.5',
    businessStatus: { status: business.status, label: business.label },
    displayStatus: business.label,
    statusDerivation,
    lagLevel: statusDerivation.lagLevel,
    lagStatus: statusDerivation.lagStatus,
    dueStatus: {
      status: statusDerivation.dueStatus.status,
      label: statusDerivation.dueStatus.label,
      daysUntilDue: statusDerivation.dueStatus.daysUntilDue,
    },
    standard_model_status: modelStatus,
    readiness_status: opts.mode === 'detail'
      ? {
          ready: statusDerivation.readinessStatus.ready,
          ...legacyReadinessStatus,
          ...statusDerivation.readinessStatus,
        }
      : { ready: statusDerivation.readinessStatus.ready },
  }

  // Detail mode: full execution link summary (no acceptance)
  if (opts.mode === 'detail') {
    base.task_execution_link_summary = {
      condition_count: (task as any).condition_count ?? null,
      obstacle_count: (task as any).obstacle_count ?? null,
      drawing_status: (task as any).drawing_required ? 'required' : null,
      material_status: (task as any).material_required ? 'required' : null,
    }
  }

  return base
}

export interface TaskDependencyWriteInput {
  dependencyTaskId: string
  dependencyType?: string
  lagDays?: number
  sourceType?: string
  metadata?: Record<string, unknown>
}

export interface WizardGeneratedTaskDependencyWriteInput extends TaskDependencyWriteInput {
  taskId: string
}

export interface NormalizedTaskDependencyWrite {
  dependency_task_id: string
  dependency_type: string
  lag_days: number
  required_for_start: boolean
  source_type: string
  metadata: Record<string, unknown>
}

export const TASK_DEPENDENCY_SOURCE_PRIORITY = {
  manual: 100,
  current_task_fact: 90,
  template_internal_flow: 60,
  template_cross_item_workflow: 55,
  template_dependency_intent: 50,
  template_generated: 45,
  algorithm_candidate: 10,
} as const

export type TaskDependencySourceType = keyof typeof TASK_DEPENDENCY_SOURCE_PRIORITY

const TASK_DEPENDENCY_SOURCE_ALIASES: Record<string, TaskDependencySourceType> = {
  explicit: 'manual',
  user: 'manual',
  user_manual: 'manual',
  sibling_sequence: 'template_internal_flow',
  internal_flow: 'template_internal_flow',
  cross_item_workflow: 'template_cross_item_workflow',
  dependency_intent_template: 'template_dependency_intent',
}

function normalizeTaskDependencySourceType(value: unknown): TaskDependencySourceType {
  const raw = String(value ?? '').trim()
  const normalized = raw || 'manual'
  const alias = TASK_DEPENDENCY_SOURCE_ALIASES[normalized]
  if (alias) return alias
  if (normalized in TASK_DEPENDENCY_SOURCE_PRIORITY) return normalized as TaskDependencySourceType
  return 'manual'
}

function isExplicitUserDependencySource(sourceType: string) {
  return normalizeTaskDependencySourceType(sourceType) === 'manual'
}

function normalizeTaskDependencyMetadata(
  metadata: Record<string, unknown> | undefined,
  sourceType: TaskDependencySourceType,
) {
  const normalized = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {}
  return sourceType === 'manual'
    ? {
        ...normalized,
        learningSignal: 'manual_dependency_correction',
        candidatePolicy: 'candidate_only_no_runtime_rule_mutation',
      }
    : normalized
}

function taskDependencyError(code: string, message: string, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode })
}

function assertFormalTaskDependencyInput(dependency: unknown) {
  if (!isFormalTaskDependencyEvidence(dependency)) {
    throw taskDependencyError(
      'TASK_DEPENDENCY_CANDIDATE_ONLY',
      'Unpublished heuristic dependency evidence cannot be written to task_dependencies',
    )
  }
}

export async function validateTaskDependencies(
  taskId: string,
  dependencies: TaskDependencyWriteInput[],
  projectId: string,
  transactionClient?: TransactionClientLike | null,
): Promise<{ projectId: string; dependencies: NormalizedTaskDependencyWrite[] }> {
  const scopedProjectId = String(projectId ?? '').trim()
  if (!scopedProjectId) {
    throw taskDependencyError('TASK_DEPENDENCY_PROJECT_REQUIRED', 'Expected project id is required')
  }
  dependencies.forEach(assertFormalTaskDependencyInput)
  let task: { project_id?: string | null } | null = null
  if (transactionClient) {
    const taskResult = await transactionClient.query(
      'SELECT project_id FROM tasks WHERE id = $1 AND project_id = $2 LIMIT 1',
      [taskId, scopedProjectId],
    )
    task = (taskResult.rows?.[0] as { project_id?: string | null } | undefined) ?? null
  } else {
    const { data, error: taskError } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('id', taskId)
      .eq('project_id', scopedProjectId)
      .maybeSingle()

    if (taskError) {
      throw taskDependencyError('TASK_DEPENDENCY_READ_FAILED', `Failed to read task: ${taskError.message}`, 500)
    }
    task = data as { project_id?: string | null } | null
  }
  if (!task) {
    throw taskDependencyError('NOT_FOUND', 'Task not found', 404)
  }

  const taskProjectId = String((task as any).project_id ?? '').trim()
  const normalized = dependencies.map((dep) => {
    const dependencyTaskId = String(dep.dependencyTaskId ?? '').trim()
    if (!dependencyTaskId) {
      throw taskDependencyError('TASK_DEPENDENCY_NOT_FOUND', 'Dependency task id is required')
    }
    if (dependencyTaskId === taskId) {
      throw taskDependencyError('TASK_DEPENDENCY_CYCLE', 'Task cannot depend on itself')
    }
    const sourceType = normalizeTaskDependencySourceType(dep.sourceType)
    return {
      dependency_task_id: dependencyTaskId,
      dependency_type: String(dep.dependencyType || 'FS').trim() || 'FS',
      lag_days: Number(dep.lagDays ?? 0),
      required_for_start: true,
      source_type: sourceType,
      metadata: normalizeTaskDependencyMetadata(dep.metadata, sourceType),
    }
  })

  const dependencyTaskIds = [...new Set(normalized.map((dep) => dep.dependency_task_id))]
  if (dependencyTaskIds.length > 0) {
    let dependencyTasks: Array<{ id?: string | null; project_id?: string | null }> = []
    if (transactionClient) {
      const dependencyTaskResult = await transactionClient.query(
        'SELECT id, project_id FROM tasks WHERE project_id = $1 AND id = ANY($2::uuid[])',
        [taskProjectId, dependencyTaskIds],
      )
      dependencyTasks = (dependencyTaskResult.rows ?? []) as Array<{ id?: string | null; project_id?: string | null }>
    } else {
      const { data, error: dependencyTaskError } = await supabase
        .from('tasks')
        .select('id, project_id')
        .eq('project_id', taskProjectId)
        .in('id', dependencyTaskIds)

      if (dependencyTaskError) {
        throw taskDependencyError('TASK_DEPENDENCY_READ_FAILED', `Failed to read dependency tasks: ${dependencyTaskError.message}`, 500)
      }
      dependencyTasks = (data ?? []) as Array<{ id?: string | null; project_id?: string | null }>
    }

    const dependencyTaskById = new Map(dependencyTasks.map((depTask: any) => [depTask.id, depTask]))
    for (const dependencyTaskId of dependencyTaskIds) {
      const dependencyTask = dependencyTaskById.get(dependencyTaskId) as any
      if (!dependencyTask) {
        throw taskDependencyError('TASK_DEPENDENCY_NOT_FOUND', `Dependency task not found: ${dependencyTaskId}`)
      }
      if (dependencyTask.project_id !== taskProjectId) {
        throw taskDependencyError('TASK_DEPENDENCY_CROSS_PROJECT', 'Dependency task belongs to a different project')
      }
    }
  }

  for (const dependencyTaskId of dependencyTaskIds) {
    const visited = new Set<string>([taskId])
    const queue = [dependencyTaskId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === taskId) {
        throw taskDependencyError('TASK_DEPENDENCY_CYCLE', `Cyclic dependency: ${taskId} -> ${dependencyTaskId}`)
      }
      if (visited.has(current)) continue
      visited.add(current)

      let nextDependencies: Array<{ dependency_task_id?: string | null }> = []
      if (transactionClient) {
        const nextResult = await transactionClient.query(
          `SELECT dependency_task_id
             FROM task_dependencies
            WHERE project_id = $1
              AND task_id = $2
              AND status = 'active'`,
          [taskProjectId, current],
        )
        nextDependencies = (nextResult.rows ?? []) as Array<{ dependency_task_id?: string | null }>
      } else {
        const { data, error: nextError } = await supabase
          .from('task_dependencies')
          .select('dependency_task_id')
          .eq('project_id', taskProjectId)
          .eq('task_id', current)
          .eq('status', 'active')

        if (nextError) {
          throw taskDependencyError('TASK_DEPENDENCY_READ_FAILED', `Failed to read dependency graph: ${nextError.message}`, 500)
        }
        nextDependencies = (data ?? []) as Array<{ dependency_task_id?: string | null }>
      }

      for (const nextDependency of nextDependencies as any[]) {
        const nextDependencyTaskId = String(nextDependency.dependency_task_id ?? '').trim()
        if (nextDependencyTaskId) queue.push(nextDependencyTaskId)
      }
    }
  }

  return { projectId: taskProjectId, dependencies: normalized }
}

export async function replaceTaskDependencies(
  taskId: string,
  dependencies: TaskDependencyWriteInput[],
  options: ReplaceTaskDependenciesOptions,
) {
  const projectId = String(options.projectId ?? '').trim()
  if (!projectId) {
    throw taskDependencyError('TASK_DEPENDENCY_PROJECT_REQUIRED', 'Expected project id is required')
  }
  const transactionClient = isDatabaseTransactionActive() ? await getClient() : null
  const validation = await validateTaskDependencies(taskId, dependencies, projectId, transactionClient)
  const client = transactionClient ?? await getClient()
  const hasExplicitUserWrites = validation.dependencies.some((dependency) => (
    isExplicitUserDependencySource(dependency.source_type)
  ))
  const preserveCurrentTaskFacts = options.preserveCurrentTaskFacts ?? !hasExplicitUserWrites

  try {
    await client.query('BEGIN')

    const { rows: activeDependencies } = await client.query(
      `SELECT id, dependency_task_id, source_type
         FROM task_dependencies
        WHERE task_id = $1
          AND project_id = $2
          AND status = 'active'`,
      [taskId, validation.projectId],
    )
    const activeDependencyTaskIds = new Set(
      activeDependencies.map((row: any) => String(row.dependency_task_id)).filter(Boolean),
    )
    const dependencyIdsToSupersede = preserveCurrentTaskFacts
      ? []
      : activeDependencies.map((row: any) => String(row.id)).filter(Boolean)

    if (dependencyIdsToSupersede.length > 0) {
      await client.query(
        `UPDATE data_lineage_links
            SET mapping_status = 'superseded'
          WHERE source_entity_type = 'task_dependency'
            AND source_entity_id = ANY($1::text[])
            AND mapping_status = 'active'`,
        [dependencyIdsToSupersede],
      )
    }

    if (!preserveCurrentTaskFacts) {
      await client.query(
        `UPDATE task_dependencies SET status = 'inactive', updated_at = NOW()
         WHERE task_id = $1 AND project_id = $2 AND status = 'active'`,
        [taskId, validation.projectId],
      )
      activeDependencyTaskIds.clear()
    }

    const insertedRows: any[] = []
    for (const dependency of validation.dependencies) {
      if (preserveCurrentTaskFacts && activeDependencyTaskIds.has(dependency.dependency_task_id)) {
        continue
      }

      const { rows: existingRows } = await client.query(
        `SELECT id FROM task_dependencies
         WHERE task_id = $1 AND dependency_task_id = $2 AND dependency_type = $3
           AND project_id = $4 AND status = 'inactive'
         LIMIT 1`,
        [taskId, dependency.dependency_task_id, dependency.dependency_type, validation.projectId],
      )

      let dependencyId: string
      if (existingRows.length > 0) {
        dependencyId = existingRows[0].id
        await client.query(
          `UPDATE task_dependencies SET status = 'active', lag_days = $2,
             required_for_start = $3, source_type = $4, metadata = $5, updated_at = NOW()
           WHERE id = $1 AND project_id = $6`,
          [
            dependencyId,
            dependency.lag_days,
            dependency.required_for_start,
            dependency.source_type,
            dependency.metadata,
            validation.projectId,
          ],
        )
      } else {
        dependencyId = randomUUID()
        await client.query(
          `INSERT INTO task_dependencies (
             id, project_id, task_id, dependency_task_id,
             dependency_type, lag_days, required_for_start, source_type, metadata,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7, $8, $9,
             NOW(), NOW()
           )`,
          [
            dependencyId,
            validation.projectId,
            taskId,
            dependency.dependency_task_id,
            dependency.dependency_type,
            dependency.lag_days,
            dependency.required_for_start,
            dependency.source_type,
            dependency.metadata,
          ],
        )
      }

      const { rows: [inserted] } = await client.query(
        'SELECT * FROM task_dependencies WHERE id = $1 AND project_id = $2', [dependencyId, validation.projectId],
      )
      insertedRows.push(inserted)
      activeDependencyTaskIds.add(String(inserted.dependency_task_id))

      await recordLineageInTransaction(client, {
        projectId: validation.projectId,
        sourceEntityType: 'task_dependency',
        sourceEntityId: dependencyId,
        relationType: 'depends_on',
        targetEntityType: 'task',
        targetEntityId: dependency.dependency_task_id,
        mappingStatus: 'active',
        metadata: {
          taskId,
          dependencyType: dependency.dependency_type,
          lagDays: dependency.lag_days,
          requiredForStart: dependency.required_for_start,
          sourceType: dependency.source_type,
          ...dependency.metadata,
        },
      })
    }

    await client.query('COMMIT')
    await registerDatabasePostCommitEffect('task_dependencies_replaced', async () => {
      clearCriticalPathCache(validation.projectId)
      clearProjectCriticalPathSnapshotCache(validation.projectId)
      await evaluateTaskConstraint(taskId, { projectId: validation.projectId, sourceEventType: 'task_dependencies_replaced' })
    })
    return insertedRows
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {})
    throw taskDependencyError('TASK_DEPENDENCY_WRITE_FAILED', `Failed to write task dependencies: ${error?.message ?? String(error)}`, 500)
  } finally {
    client.release()
  }
}

// workspace-isolation-capability-write-approved: projectId is required, all task reads are filtered by it, and every batched dependency value stores the same project id.
export async function replaceWizardGeneratedTaskDependenciesBatch(params: {
  projectId: string
  dependencies: WizardGeneratedTaskDependencyWriteInput[]
  actorId?: string | null
  transactionClient?: TransactionClientLike | null
}) {
  const projectId = String(params.projectId ?? '').trim()
  if (!projectId) {
    throw taskDependencyError('TASK_DEPENDENCY_PROJECT_REQUIRED', 'Project id is required')
  }
  params.dependencies.forEach(assertFormalTaskDependencyInput)

  const dependencyBySignature = new Map<string, {
    task_id: string
    dependency_task_id: string
    dependency_type: string
    lag_days: number
    required_for_start: boolean
    source_type: string
    metadata: Record<string, unknown>
  }>()
  for (const dependency of params.dependencies) {
    const taskId = String(dependency.taskId ?? '').trim()
    const dependencyTaskId = String(dependency.dependencyTaskId ?? '').trim()
    if (!taskId || !dependencyTaskId) {
      throw taskDependencyError('TASK_DEPENDENCY_NOT_FOUND', 'Task id and dependency task id are required')
    }
    if (taskId === dependencyTaskId) {
      throw taskDependencyError('TASK_DEPENDENCY_CYCLE', 'Task cannot depend on itself')
    }
    const sourceType = normalizeTaskDependencySourceType(dependency.sourceType)
    const normalizedDependency = {
      task_id: taskId,
      dependency_task_id: dependencyTaskId,
      dependency_type: String(dependency.dependencyType || 'FS').trim() || 'FS',
      lag_days: Number(dependency.lagDays ?? 0),
      required_for_start: true,
      source_type: sourceType,
      metadata: normalizeTaskDependencyMetadata(dependency.metadata, sourceType),
    }
    if (isExplicitUserDependencySource(normalizedDependency.source_type)) continue
    const signature = [
      normalizedDependency.task_id,
      normalizedDependency.dependency_task_id,
      normalizedDependency.dependency_type,
    ].join('\u0000')
    const existingDependency = dependencyBySignature.get(signature)
    if (
      !existingDependency
      || TASK_DEPENDENCY_SOURCE_PRIORITY[normalizedDependency.source_type] >= TASK_DEPENDENCY_SOURCE_PRIORITY[existingDependency.source_type]
    ) {
      dependencyBySignature.set(signature, normalizedDependency)
    }
  }

  const normalized = [...dependencyBySignature.values()]

  if (normalized.length === 0) return []

  const taskIds = [...new Set(normalized.flatMap((dependency) => [dependency.task_id, dependency.dependency_task_id]))]
  const taskProjectById = new Map<string, string>()
  if (params.transactionClient) {
    const taskRows = await params.transactionClient.query(
      'SELECT id, project_id FROM tasks WHERE project_id = $1 AND id = ANY($2)',
      [projectId, taskIds],
    )
    for (const task of (taskRows.rows ?? []) as Array<{ id?: string | null; project_id?: string | null }>) {
      taskProjectById.set(String(task.id ?? ''), String(task.project_id ?? ''))
    }
  } else {
    const taskRows = await supabase
      .from('tasks')
      .select('id, project_id')
      .eq('project_id', projectId)
      .in('id', taskIds)
    if (taskRows.error) {
      throw taskDependencyError('TASK_DEPENDENCY_READ_FAILED', `Failed to read dependency tasks: ${taskRows.error.message}`, 500)
    }
    for (const task of (taskRows.data ?? []) as Array<{ id?: string | null; project_id?: string | null }>) {
      taskProjectById.set(String(task.id ?? ''), String(task.project_id ?? ''))
    }
  }
  for (const taskId of taskIds) {
    if (!taskProjectById.has(taskId)) {
      throw taskDependencyError('TASK_DEPENDENCY_NOT_FOUND', `Dependency task not found: ${taskId}`)
    }
    if (taskProjectById.get(taskId) !== projectId) {
      throw taskDependencyError('TASK_DEPENDENCY_CROSS_PROJECT', 'Dependency task belongs to a different project')
    }
  }

  const outgoingByTask = new Map<string, Set<string>>()
  if (params.transactionClient) {
    const activeRowsResult = await params.transactionClient.query(
      "SELECT task_id, dependency_task_id FROM task_dependencies WHERE project_id = $1 AND status = 'active'",
      [projectId],
    )
    for (const row of (activeRowsResult.rows ?? []) as Array<{ task_id?: string | null; dependency_task_id?: string | null }>) {
      const taskId = String(row.task_id ?? '').trim()
      const dependencyTaskId = String(row.dependency_task_id ?? '').trim()
      if (!taskId || !dependencyTaskId) continue
      if (!outgoingByTask.has(taskId)) outgoingByTask.set(taskId, new Set())
      outgoingByTask.get(taskId)!.add(dependencyTaskId)
    }
  } else {
    const activeRowsResult = await supabase
      .from('task_dependencies')
      .select('task_id, dependency_task_id')
      .eq('project_id', projectId)
      .eq('status', 'active')
    if (activeRowsResult.error) {
      throw taskDependencyError('TASK_DEPENDENCY_READ_FAILED', `Failed to read dependency graph: ${activeRowsResult.error.message}`, 500)
    }
    for (const row of (activeRowsResult.data ?? []) as any[]) {
      const taskId = String(row.task_id ?? '').trim()
      const dependencyTaskId = String(row.dependency_task_id ?? '').trim()
      if (!taskId || !dependencyTaskId) continue
      if (!outgoingByTask.has(taskId)) outgoingByTask.set(taskId, new Set())
      outgoingByTask.get(taskId)!.add(dependencyTaskId)
    }
  }
  for (const dependency of normalized) {
    if (!outgoingByTask.has(dependency.task_id)) outgoingByTask.set(dependency.task_id, new Set())
    outgoingByTask.get(dependency.task_id)!.add(dependency.dependency_task_id)
  }
  for (const dependency of normalized) {
    const visited = new Set<string>([dependency.task_id])
    const queue = [dependency.dependency_task_id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === dependency.task_id) {
        throw taskDependencyError('TASK_DEPENDENCY_CYCLE', `Cyclic dependency: ${dependency.task_id} -> ${dependency.dependency_task_id}`)
      }
      if (visited.has(current)) continue
      visited.add(current)
      for (const next of outgoingByTask.get(current) ?? []) queue.push(next)
    }
  }

  const client = params.transactionClient ?? await getClient()
  const ownsClient = !params.transactionClient
  try {
    if (ownsClient) await client.query('BEGIN')
    const valueGroups: string[] = []
    const values: unknown[] = []
    const insertedRows = normalized.map((dependency) => {
      const id = randomUUID()
      const start = values.length + 1
      values.push(
        id,
        projectId,
        dependency.task_id,
        dependency.dependency_task_id,
        dependency.dependency_type,
        dependency.lag_days,
        dependency.required_for_start,
        dependency.source_type,
        dependency.metadata,
      )
      valueGroups.push(`($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, NOW(), NOW())`)
      return {
        id,
        project_id: projectId,
        ...dependency,
      }
    })

    await client.query(
      `INSERT INTO task_dependencies (
         id, project_id, task_id, dependency_task_id,
         dependency_type, lag_days, required_for_start, source_type, metadata,
         created_at, updated_at
       ) VALUES ${valueGroups.join(', ')}`,
      values,
    )

    const lineageLinks: LineageLinkInput[] = insertedRows.map((row) => ({
      projectId,
      sourceEntityType: 'task_dependency',
      sourceEntityId: String(row.id),
      relationType: 'depends_on',
      targetEntityType: 'task',
      targetEntityId: String(row.dependency_task_id),
      mappingStatus: 'active',
      metadata: {
        taskId: row.task_id,
        dependencyType: row.dependency_type,
        lagDays: row.lag_days,
        requiredForStart: row.required_for_start,
        sourceType: row.source_type,
        wizardBatch: true,
        ...row.metadata,
      },
    }))
    await createLineageBatchInTransaction(
      client,
      projectId,
      'wizard_task_dependency_generation',
      lineageLinks,
      params.actorId ?? undefined,
    )
    if (ownsClient) await client.query('COMMIT')
    return insertedRows
  } catch (error: any) {
    if (ownsClient) await client.query('ROLLBACK').catch(() => {})
    throw taskDependencyError('TASK_DEPENDENCY_WRITE_FAILED', `Failed to write wizard task dependencies: ${error?.message ?? String(error)}`, 500)
  } finally {
    if (ownsClient) client.release?.()
  }
}
