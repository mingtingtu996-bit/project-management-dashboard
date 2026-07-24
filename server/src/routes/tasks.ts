// Tasks API 路由

import { randomUUID } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  validate,
  validateIdParam,
  taskSchema,
  taskUpdateSchema,
  validateTaskDateWindow,
} from '../middleware/validation.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Task } from '../types/db.js'
import { executeSQL, supabase as db } from '../services/dbService.js'
import {
  getClient,
  isDatabaseTransactionActive,
  query as rawQuery,
  registerDatabasePostCommitEffect,
  withDatabaseTransaction,
} from '../database.js'
import { buildStandardDTO } from '../services/taskStandardModelService.js'
import { sanitizeTaskForClient } from '../services/taskDtoService.js'
import { rejectTaskCodeFields } from '../services/taskCodeTransactionService.js'
import { recordAcceptancePlanExecutionFacts } from '../services/acceptancePlanExecutionFactService.js'
import {
  replaceTaskDependencies,
  replaceWizardGeneratedTaskDependenciesBatch,
} from '../services/taskStandardModelService.js'
import { loadBaselineProjectionMap } from '../services/taskBaselineProjectionService.js'
import {
  broadcastPlanningTableChanged,
  broadcastProjectTasksChanged,
  broadcastTaskChanged,
} from '../services/planningRealtimeEventService.js'
import {
  buildPlanningTableCommitResponse,
  buildFieldRegistryStaleResponse,
  isPlanningFieldRegistryVersionCurrent,
  summarizePlanningTableMergeGroups,
} from '../services/planningTableCommitService.js'
import { writeChangeLog } from '../services/changeAuditService.js'
import {
  buildPlanningTableValidationErrorResponse,
  readPlanningTableOperationRowId as readOperationRowId,
  readPlanningTableOperationType as readOperationType,
  readPlanningTableOperationValues as readOperationValues,
  validatePlanningTableCommitRequest,
} from '../services/planningTableValidationService.js'
import {
  closeTaskInMainChain,
  createTaskInMainChain,
  createTasksInWizardBatch,
  deleteTaskInMainChain,
  reopenTaskInMainChain,
  updateTaskInMainChain,
} from '../services/taskWriteChainService.js'
import { ExecutionFactIntent } from '../services/planningScheduleGovernanceService.js'
import {
  generateWbsTemplateRows,
  listWbsTemplateCatalog,
  recordWbsTemplateGenerationRuntimeConsumption,
  type GeneratedTemplateDependency,
  type GeneratedTemplateRow,
  type WbsTemplateGenerationRuntimeArtifactPublication,
} from '../services/wbsTemplateGenerationService.js'
import {
  TASK_PLAN_DRILLDOWN_ROW_LIMIT,
  buildTaskPlanDrilldownScope,
  governTaskPlanDrilldownOperation,
  resolveTaskPlanDrilldownLevel,
  resolveTaskPlanDrilldownRecommendation,
  resolveTaskPlanDrilldownStep,
  summarizeProjectExecutionPlanRows,
} from '../services/taskPlanDrilldownPolicyService.js'
import {
  buildSpecialWorkDurationCandidateNodes,
} from '../services/wbsTemplateCandidateEventService.js'
import { persistDurationLearningRuntimeConsumptions } from '../services/durationLearningRuntimeConsumptionService.js'
import {
  buildGeneratedDurationPredictionOutboxEvents,
  buildWbsCandidateOutboxEvent,
  enqueueDurationLearningRuntimeEvidenceBatch,
} from '../services/durationLearningRuntimeEvidenceOutboxService.js'
import {
  buildDefaultMasterPlanVisibilityFeedback,
  buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback,
  persistDefaultMasterPlanVisibilityFeedbackCandidate,
} from '../services/defaultMasterPlanVisibilityFeedbackService.js'
import { evaluateTaskConstraint } from '../services/taskConstraintGovernanceService.js'
import {
  getProjectCriticalPathSnapshot,
  recalculateProjectCriticalPath,
} from '../services/projectCriticalPathService.js'
import {
  attachTasksLagStatus,
  type TaskLagFields,
} from '../services/taskLagStatusService.js'
import {
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
  acceptanceStatusLabel,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import { getProjectCompanyId } from '../auth/access.js'
import {
  createTaskBatchUpdateJob,
  getTaskBatchUpdateJob,
  scheduleTaskBatchUpdateJob,
  type TaskBatchUpdateJob,
} from '../services/taskBatchUpdateService.js'
import {
  buildTaskCommitReplaySummary,
  buildTaskCommitRequestHash,
  completeTaskCommitRequest,
  reserveTaskCommitRequest,
  type TaskCommitReplaySummary,
} from '../services/taskCommitIdempotencyService.js'

const router = Router()
const supabase = new SupabaseService()
const ACCEPTANCE_IMPACT_QUERY_BATCH_SIZE = 200
const ACCEPTANCE_IMPACT_PROJECT_SCAN_THRESHOLD = 200
const TASK_PROGRESS_SNAPSHOTS_CACHE_TTL_MS = 10_000
const TASK_PROGRESS_SNAPSHOTS_READ_TIMEOUT_MS = 12_000
const TASK_PROGRESS_SNAPSHOTS_DIRECT_SQL_ENABLED = process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true'
const TASK_LIST_SURFACE_COLUMNS = [
  'id',
  'project_id',
  'title',
  'description',
  'status',
  'priority',
  'start_date',
  'end_date',
  'planned_start_date',
  'planned_end_date',
  'actual_start_date',
  'actual_end_date',
  'progress',
  'assignee',
  'participant_unit_id',
  'is_milestone',
  'version',
  'updated_at',
  'created_at',
  'milestone_id',
  'milestone_level',
  'milestone_order',
  'wbs_code',
  'wbs_level',
  'sort_order',
  'specialty_type',
  'parent_id',
  'assignee_name',
  'assignee_user_id',
  'template_node_id',
  'baseline_start',
  'baseline_end',
  'baseline_is_critical',
  'is_critical',
  'total_float_days',
  'free_float_days',
  'criticality_weight',
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_leaf',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'progress_method',
  'material_required',
  'acceptance_required',
  'standard_task_metadata',
] as const
const TASK_LIST_SURFACE_RESPONSE_FIELDS = new Set<string>([
  ...TASK_LIST_SURFACE_COLUMNS,
  'dependencies',
  'participant_unit_name',
  'engineering_category_name',
  'engineering_category_type',
  'category_type',
  'lagLevel',
  'lagStatus',
  'statusLabel',
  'displayStatus',
  'duration_risk_p20_days',
  'duration_risk_p50_days',
  'duration_risk_p80_days',
  'duration_risk_range',
])
const TASK_RESPONSE_FORBIDDEN_FIELDS = new Set<string>()
const TASK_REQUEST_STRIPPED_FIELDS = ['dependencies', 'is_critical'] as const
const taskProgressSnapshotsCache = new Map<string, { expiresAt: number; payload: any[] }>()
const taskProgressSnapshotsInFlight = new Map<string, Promise<any[]>>()

function stripTaskRequestOnlyFields<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  for (const field of TASK_REQUEST_STRIPPED_FIELDS) {
    delete next[field]
  }
  return next
}

function pickTaskListSurfaceResponseFields(task: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of TASK_LIST_SURFACE_RESPONSE_FIELDS) {
    if (TASK_RESPONSE_FORBIDDEN_FIELDS.has(field)) continue
    if (Object.prototype.hasOwnProperty.call(task, field)) {
      result[field] = task[field]
    }
  }
  return result
}

type TaskWithParticipantUnit = Task & {
  participant_unit_name?: string | null
}

type TaskDependencyProjectionRow = {
  task_id?: string | null
  dependency_task_id?: string | null
}

type AcceptanceImpactSummaryItem = {
  id: string
  name: string
  status: string
  statusLabel: string
}

type TaskAcceptanceImpactFields = {
  acceptance_impact_count?: number
  acceptance_impact_summary?: AcceptanceImpactSummaryItem[]
}

type TaskWithLagStatus = TaskWithParticipantUnit & TaskLagFields & TaskAcceptanceImpactFields

type CriticalPathChangeSummary = {
  changed: boolean
  enteredTaskIds: string[]
  leftTaskIds: string[]
}

type ParticipantUnitRecord = {
  id: string
  unit_name: string
}

type AcceptanceImpactPlanRow = {
  id: string
  acceptance_name?: string | null
  plan_name?: string | null
  name?: string | null
  type_name?: string | null
  acceptance_type?: string | null
  status?: string | null
}

type AcceptanceTaskLinkRow = {
  source_entity_id?: string | null
  target_entity_id?: string | null
}

type TaskDeleteProtectionSummary = {
  child_task_count: number
  condition_count: number
  obstacle_count: number
  acceptance_plan_count: number
  has_execution_trail: boolean
  has_baseline_link?: boolean
  baseline_item_id?: string | null
}

type TaskDeleteRetentionDecision = {
  decision?: string
  resolvedAction?: string
  executionMode?: string
  requiresUserConfirmation?: boolean
  canPhysicalDelete?: boolean
  reasonCode?: string
  reason?: string
  referenceSummary?: Record<string, number>
  suggestedAction?: Record<string, unknown>
  decisionToken?: string
}

function normalizeTimelineDate(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseTimelineProjectionFlag(input: unknown) {
  return String(input ?? '').trim().toLowerCase() === 'true'
}

function parseFalseFlag(input: unknown) {
  return ['false', '0', 'off', 'no'].includes(String(input ?? '').trim().toLowerCase())
}

function normalizeProjectCacheKey(projectId: unknown) {
  return String(projectId ?? '').trim()
}

function clearTaskProgressSnapshotsCache(projectId?: string | null) {
  const normalizedProjectId = normalizeProjectCacheKey(projectId)
  if (!normalizedProjectId) {
    taskProgressSnapshotsCache.clear()
    taskProgressSnapshotsInFlight.clear()
    return
  }
  taskProgressSnapshotsCache.delete(normalizedProjectId)
  taskProgressSnapshotsInFlight.delete(normalizedProjectId)
}

async function loadTaskProgressSnapshots(projectId: string) {
  const normalizedProjectId = normalizeProjectCacheKey(projectId)
  const cached = taskProgressSnapshotsCache.get(normalizedProjectId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload
  }

  const pending = taskProgressSnapshotsInFlight.get(normalizedProjectId)
  if (pending) return pending

  const promise = (async () => {
    if (TASK_PROGRESS_SNAPSHOTS_DIRECT_SQL_ENABLED) {
      try {
        const result = await rawQuery(
          `SELECT s.*
             FROM public.task_progress_snapshots s
             INNER JOIN public.tasks t ON t.id = s.task_id
            WHERE t.project_id = $1
            ORDER BY s.task_id ASC, s.snapshot_date DESC, s.created_at DESC`,
          [normalizedProjectId],
        )
        return result.rows as any[]
      } catch (error) {
        logger.warn('[tasks] progress snapshots direct query failed, falling back to REST batches', {
          projectId: normalizedProjectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const { data: taskRows, error: taskError } = await db
      .from('tasks')
      .select('id')
      .eq('project_id', normalizedProjectId)

    if (taskError) {
      throw new Error(`获取项目任务失败: ${taskError.message}`)
    }

    const taskIds = (taskRows ?? []).map((row: any) => String(row.id)).filter(Boolean)
    if (taskIds.length === 0) return []

    const BATCH_SIZE = 200
    const allSnapshots: any[] = []
    for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
      const batch = taskIds.slice(i, i + BATCH_SIZE)
      const { data: snapshotRows, error: snapshotError } = await db
        .from('task_progress_snapshots')
        .select('*')
        .in('task_id', batch)

      if (snapshotError) {
        throw new Error(`获取任务进度快照失败: ${snapshotError.message}`)
      }
      if (snapshotRows) allSnapshots.push(...snapshotRows)
    }

    allSnapshots.sort((a, b) => {
      const cmp1 = String(a.task_id).localeCompare(String(b.task_id))
      if (cmp1 !== 0) return cmp1
      const cmp2 = String(b.snapshot_date).localeCompare(String(a.snapshot_date))
      if (cmp2 !== 0) return cmp2
      return String(b.created_at).localeCompare(String(a.created_at))
    })

    return allSnapshots
  })()

  taskProgressSnapshotsInFlight.set(normalizedProjectId, promise)
  try {
    const payload = await promise
    taskProgressSnapshotsCache.set(normalizedProjectId, {
      expiresAt: Date.now() + TASK_PROGRESS_SNAPSHOTS_CACHE_TTL_MS,
      payload,
    })
    return payload
  } finally {
    taskProgressSnapshotsInFlight.delete(normalizedProjectId)
  }
}

function compareTimelineOrder(left: Task, right: Task) {
  const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
  const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
  if (leftSort !== rightSort) return leftSort - rightSort

  const leftLevel = Number.isFinite(Number(left.wbs_level)) ? Number(left.wbs_level) : Number.MAX_SAFE_INTEGER
  const rightLevel = Number.isFinite(Number(right.wbs_level)) ? Number(right.wbs_level) : Number.MAX_SAFE_INTEGER
  if (leftLevel !== rightLevel) return leftLevel - rightLevel

  const leftDate =
    normalizeTimelineDate(left.start_date)
    ?? normalizeTimelineDate(left.planned_start_date)
    ?? normalizeTimelineDate(left.end_date)
    ?? normalizeTimelineDate(left.created_at)
    ?? '9999-12-31'
  const rightDate =
    normalizeTimelineDate(right.start_date)
    ?? normalizeTimelineDate(right.planned_start_date)
    ?? normalizeTimelineDate(right.end_date)
    ?? normalizeTimelineDate(right.created_at)
    ?? '9999-12-31'

  const dateCompare = leftDate.localeCompare(rightDate)
  if (dateCompare !== 0) return dateCompare

  const leftWbs = String(left.wbs_code ?? '')
  const rightWbs = String(right.wbs_code ?? '')
  const wbsCompare = leftWbs.localeCompare(rightWbs, 'zh-CN', { numeric: true, sensitivity: 'base' })
  if (wbsCompare !== 0) return wbsCompare

  const leftTitle = String(left.title ?? '')
  const rightTitle = String(right.title ?? '')
  const titleCompare = leftTitle.localeCompare(rightTitle, 'zh-CN', { sensitivity: 'base' })
  if (titleCompare !== 0) return titleCompare

  return String(left.id ?? '').localeCompare(String(right.id ?? ''), 'en', { sensitivity: 'base' })
}

async function attachTimelineProjectionFields(
  tasks: TaskWithParticipantUnit[],
  options: {
    includeTimelineProjection: boolean
    baselineVersionId?: string | null
  },
) {
  if (!options.includeTimelineProjection) {
    return tasks
  }

  const baselineMap =
    options.baselineVersionId && options.baselineVersionId.trim()
      ? await loadBaselineProjectionMap(options.baselineVersionId.trim())
      : new Map<string, { baseline_start: string | null; baseline_end: string | null; baseline_is_critical: boolean | null }>()

  return tasks.map((task) => {
    const baseline = baselineMap.get(task.id)
    return {
      ...task,
      baseline_start: baseline?.baseline_start ?? null,
      baseline_end: baseline?.baseline_end ?? null,
      baseline_is_critical: baseline?.baseline_is_critical ?? null,
    }
  })
}

function parseExpectedVersion(input: unknown) {
  if (input === undefined || input === null || input === '') return undefined
  const version = Number(input)
  return Number.isInteger(version) && version > 0 ? version : null
}

function normalizeUnitLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAcceptanceImpactName(row: AcceptanceImpactPlanRow) {
  return String(
    row.acceptance_name
    ?? row.plan_name
    ?? row.name
    ?? row.type_name
    ?? row.acceptance_type
    ?? '验收计划',
  ).trim() || '验收计划'
}

function toAcceptanceImpactItem(row: AcceptanceImpactPlanRow): AcceptanceImpactSummaryItem {
  const status = normalizeAcceptanceStatus(row.status)
  return {
    id: String(row.id),
    name: normalizeAcceptanceImpactName(row),
    status,
    statusLabel: acceptanceStatusLabel(status),
  }
}

function addAcceptanceImpact(
  map: Map<string, AcceptanceImpactSummaryItem[]>,
  taskId: string | null | undefined,
  row: AcceptanceImpactPlanRow | null | undefined,
) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId || !row?.id) return
  const existing = map.get(normalizedTaskId) ?? []
  if (!existing.some((item) => item.id === String(row.id))) {
    existing.push(toAcceptanceImpactItem(row))
  }
  map.set(normalizedTaskId, existing)
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function readTaskRouteRows<T>(
  executeSqlReader: () => Promise<T[]>,
  postgresReader: () => Promise<T[]>,
): Promise<T[]> {
  if (process.env.NODE_ENV === 'test') {
    return await executeSqlReader()
  }
  return await postgresReader()
}

function fixedQuestionTokens(values: readonly unknown[]) {
  return values.map(() => '?').join(', ')
}

async function readAcceptancePlansForProject(projectId: string) {
  return await readTaskRouteRows<AcceptanceImpactPlanRow>(
    () => executeSQL<AcceptanceImpactPlanRow>(
      `SELECT id,
              acceptance_name,
              NULL::text AS plan_name,
              NULL::text AS name,
              type_name,
              acceptance_type,
              status
         FROM acceptance_plans
        WHERE project_id = ?
        ORDER BY planned_date ASC, created_at ASC`,
      [projectId],
    ),
    async () => {
      const result = await rawQuery(
        `SELECT id,
                acceptance_name,
                NULL::text AS plan_name,
                NULL::text AS name,
                type_name,
                acceptance_type,
                status
           FROM public.acceptance_plans
          WHERE project_id::text = $1
          ORDER BY planned_date ASC, created_at ASC`,
        [projectId],
      )
      return result.rows as AcceptanceImpactPlanRow[]
    },
  )
}

async function readAcceptanceTaskLinksForProject(projectId: string) {
  return await readTaskRouteRows<AcceptanceTaskLinkRow>(
    () => executeSQL<AcceptanceTaskLinkRow>(
      `SELECT source_entity_id, target_entity_id
         FROM project_entity_links
        WHERE project_id = ?
          AND source_entity_type = 'acceptance_plan'
          AND target_entity_type = 'task'
          AND relation_type = 'covers_task'
          AND status = 'active'`,
      [projectId],
    ),
    async () => {
      const result = await rawQuery(
        `SELECT source_entity_id, target_entity_id
           FROM public.project_entity_links
          WHERE project_id::text = $1
            AND source_entity_type = 'acceptance_plan'
            AND target_entity_type = 'task'
            AND relation_type = 'covers_task'
            AND status = 'active'`,
        [projectId],
      )
      return result.rows as AcceptanceTaskLinkRow[]
    },
  )
}

async function readAcceptanceTaskLinksForTaskIds(projectId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []
  const taskTokens = fixedQuestionTokens(taskIds)
  return await readTaskRouteRows<AcceptanceTaskLinkRow>(
    () => executeSQL<AcceptanceTaskLinkRow>(
      `SELECT source_entity_id, target_entity_id
         FROM project_entity_links
        WHERE project_id = ?
          AND source_entity_type = 'acceptance_plan'
          AND target_entity_type = 'task'
          AND relation_type = 'covers_task'
          AND status = 'active'
          AND target_entity_id IN (${taskTokens})`,
      [projectId, ...taskIds],
    ),
    async () => {
      const result = await rawQuery(
        `SELECT source_entity_id, target_entity_id
           FROM public.project_entity_links
          WHERE project_id::text = $1
            AND source_entity_type = 'acceptance_plan'
            AND target_entity_type = 'task'
            AND relation_type = 'covers_task'
            AND status = 'active'
            AND target_entity_id = ANY($2::text[])`,
        [projectId, taskIds],
      )
      return result.rows as AcceptanceTaskLinkRow[]
    },
  )
}

async function readAcceptancePlansByIds(projectId: string, planIds: string[]) {
  if (planIds.length === 0) return []
  const planTokens = fixedQuestionTokens(planIds)
  return await readTaskRouteRows<AcceptanceImpactPlanRow>(
    () => executeSQL<AcceptanceImpactPlanRow>(
      `SELECT id,
              acceptance_name,
              NULL::text AS plan_name,
              NULL::text AS name,
              type_name,
              acceptance_type,
              status
         FROM acceptance_plans
        WHERE project_id = ? AND id IN (${planTokens})
        ORDER BY planned_date ASC, created_at ASC`,
      [projectId, ...planIds],
    ),
    async () => {
      const result = await rawQuery(
        `SELECT id,
                acceptance_name,
                NULL::text AS plan_name,
                NULL::text AS name,
                type_name,
                acceptance_type,
                status
           FROM public.acceptance_plans
          WHERE project_id::text = $1
            AND id::text = ANY($2::text[])
          ORDER BY planned_date ASC, created_at ASC`,
        [projectId, planIds],
      )
      return result.rows as AcceptanceImpactPlanRow[]
    },
  )
}

async function readParticipantUnitForTask(unitId: string, projectId: string) {
  return await readTaskRouteRows<{ id: string; unit_name: string }>(
    () => executeSQL<{ id: string; unit_name: string }>(
      'SELECT id, unit_name FROM participant_units WHERE id = ? AND project_id = ?',
      [unitId, projectId],
    ),
    async () => {
      const result = await rawQuery(
        'SELECT id, unit_name FROM public.participant_units WHERE id::text = $1 AND project_id::text = $2',
        [unitId, projectId],
      )
      return result.rows as Array<{ id: string; unit_name: string }>
    },
  )
}

async function readParticipantUnitsByIds(unitIds: string[]) {
  if (unitIds.length === 0) return []
  const unitTokens = fixedQuestionTokens(unitIds)
  return await readTaskRouteRows<{ id: string; unit_name: string; project_id: string | null }>(
    () => executeSQL<{ id: string; unit_name: string; project_id: string | null }>(
      `SELECT id, unit_name, project_id FROM participant_units WHERE id IN (${unitTokens})`,
      unitIds,
    ),
    async () => {
      const result = await rawQuery(
        'SELECT id, unit_name, project_id FROM public.participant_units WHERE id::text = ANY($1::text[])',
        [unitIds],
      )
      return result.rows as Array<{ id: string; unit_name: string; project_id: string | null }>
    },
  )
}

async function readTaskDependenciesByTaskIds(projectId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []
  const taskTokens = fixedQuestionTokens(taskIds)
  return await readTaskRouteRows<TaskDependencyProjectionRow>(
    () => executeSQL<TaskDependencyProjectionRow>(
      `SELECT task_id, dependency_task_id
         FROM task_dependencies
        WHERE project_id = ?
          AND task_id IN (${taskTokens})
          AND status = 'active'
        ORDER BY created_at ASC, id ASC`,
      [projectId, ...taskIds],
    ),
    async () => {
      const result = await rawQuery(
        `SELECT task_id, dependency_task_id
           FROM public.task_dependencies
          WHERE project_id::text = $1
            AND task_id::text = ANY($2::text[])
            AND status = 'active'
          ORDER BY created_at ASC, id ASC`,
        [projectId, taskIds],
      )
      return result.rows as TaskDependencyProjectionRow[]
    },
  )
}

async function loadAcceptanceImpactMap(projectId: string, taskIds: string[]) {
  const impactMap = new Map<string, AcceptanceImpactSummaryItem[]>()
  const uniqueTaskIds = [...new Set(taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean))]
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId || uniqueTaskIds.length === 0) return impactMap

  const taskIdSet = new Set(uniqueTaskIds)
  if (uniqueTaskIds.length > ACCEPTANCE_IMPACT_PROJECT_SCAN_THRESHOLD) {
    const plans = await readAcceptancePlansForProject(normalizedProjectId)
    const linkRows = await readAcceptanceTaskLinksForProject(normalizedProjectId)
    const linkedPlanMap = new Map(plans.map((row) => [String(row.id), row]))
    for (const link of linkRows) {
      const targetTaskId = String(link.target_entity_id ?? '').trim()
      if (!taskIdSet.has(targetTaskId)) continue
      addAcceptanceImpact(
        impactMap,
        targetTaskId,
        linkedPlanMap.get(String(link.source_entity_id ?? '').trim()),
      )
    }

    return impactMap
  }

  const taskIdBatches = chunkValues(uniqueTaskIds, ACCEPTANCE_IMPACT_QUERY_BATCH_SIZE)
  const linkRows: AcceptanceTaskLinkRow[] = []

  for (const taskIdBatch of taskIdBatches) {
    linkRows.push(...await readAcceptanceTaskLinksForTaskIds(normalizedProjectId, taskIdBatch))
  }

  const linkedPlanIds = [
    ...new Set(linkRows.map((row) => String(row.source_entity_id ?? '').trim()).filter(Boolean)),
  ]
  if (linkedPlanIds.length > 0) {
    const linkedPlans: AcceptanceImpactPlanRow[] = []
    for (const planIdBatch of chunkValues(linkedPlanIds, ACCEPTANCE_IMPACT_QUERY_BATCH_SIZE)) {
      linkedPlans.push(...await readAcceptancePlansByIds(normalizedProjectId, planIdBatch))
    }
    const linkedPlanMap = new Map(linkedPlans.map((row) => [String(row.id), row]))
    for (const link of linkRows) {
      addAcceptanceImpact(
        impactMap,
        link.target_entity_id,
        linkedPlanMap.get(String(link.source_entity_id ?? '').trim()),
      )
    }
  }

  return impactMap
}

async function attachAcceptanceImpactSummaries<T extends TaskWithParticipantUnit>(
  tasks: T[],
  projectId?: string | null,
): Promise<Array<T & TaskAcceptanceImpactFields>> {
  const normalizedProjectId = String(projectId ?? tasks[0]?.project_id ?? '').trim()
  if (!normalizedProjectId || tasks.length === 0) {
    return tasks.map((task) => ({
      ...task,
      acceptance_impact_count: 0,
      acceptance_impact_summary: [],
    }))
  }

  const impactMap = await loadAcceptanceImpactMap(
    normalizedProjectId,
    tasks.map((task) => task.id),
  )

  return tasks.map((task) => {
    const items = impactMap.get(task.id) ?? []
    return {
      ...task,
      acceptance_impact_count: items.length,
      acceptance_impact_summary: items,
    }
  })
}

function withoutAcceptanceImpactSummaries<T extends TaskWithParticipantUnit>(
  tasks: T[],
): Array<T & TaskAcceptanceImpactFields> {
  return tasks.map((task) => ({
    ...task,
    acceptance_impact_count: 0,
    acceptance_impact_summary: [],
  }))
}

async function attachOptionalAcceptanceImpactSummaries<T extends TaskWithParticipantUnit>(
  tasks: T[],
  projectId?: string | null,
): Promise<Array<T & TaskAcceptanceImpactFields>> {
  try {
    return await attachAcceptanceImpactSummaries(tasks, projectId)
  } catch (error) {
    logger.warn('[tasks] failed to attach acceptance impact summaries', {
      projectId: projectId ?? tasks[0]?.project_id ?? null,
      taskCount: tasks.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return withoutAcceptanceImpactSummaries(tasks)
  }
}

const batchTaskUpdateSchema = z.object({
  project_id: z.string().trim().min(1),
  task_ids: z.array(z.string().trim().min(1)).min(1),
  status: z.string().trim().optional().nullable(),
  assignee_name: z.string().trim().optional().nullable(),
  assignee_user_id: z.string().trim().optional().nullable(),
  participant_unit_id: z.string().trim().optional().nullable(),
  dateShiftDays: z.number().int().optional().nullable(),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
}).strict()

const actualTimeCorrectionSchema = z.object({
  version: z.number().int().positive().optional(),
  actual_start_date: z.string().trim().optional().nullable(),
  actual_end_date: z.string().trim().optional().nullable(),
  first_progress_at: z.string().trim().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
}).strict().superRefine((data, ctx) => {
  const hasActualField = data.actual_start_date !== undefined
    || data.actual_end_date !== undefined
    || data.first_progress_at !== undefined
  if (!hasActualField) {
    ctx.addIssue({
      code: 'custom',
      message: 'actual_start_date、actual_end_date 或 first_progress_at 至少需要提供一项',
      path: ['actual_start_date'],
    })
  }
  if (data.actual_start_date && data.actual_end_date && data.actual_start_date > data.actual_end_date) {
    ctx.addIssue({
      code: 'custom',
      message: 'actual_start_date 不能晚于 actual_end_date',
      path: ['actual_end_date'],
    })
  }
})

type PlanningCommitOperation = PlanningTableOperation

type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'blocked' | 'todo' | 'in_progress'

const TASK_COMMIT_FORBIDDEN_FIELDS = new Set([
  'actual_start_date',
  'actual_end_date',
  'first_progress_at',
  'acceptance_impact_summary',
  'acceptance_impact_count',
  'validation_hint',
  'quality_hint',
  'template_node_id',
  'generation_batch_id',
  'is_critical',
  'duration',
  'task_code',
  'task_code_version',
  'task_code_rule_id',
  'task_code_generated_at',
  'responsible_unit',
  'assignee_unit',
])

const TASK_COMMIT_CREATE_SYSTEM_FIELDS = new Set([
  'template_node_id',
])

function normalizeCommitDate(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeCommitNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCommitBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return false
  return !['0', 'false', 'no', 'n', '否'].includes(text)
}

function normalizeCommitPriority(value: unknown): TaskPriority {
  const text = String(value ?? '').trim()
  return text === 'critical' || text === 'high' || text === 'low' ? text : 'medium'
}

function normalizeCommitStatus(value: unknown): TaskStatus {
  const text = String(value ?? '').trim()
  if (
    text === 'pending'
    || text === 'completed'
    || text === 'cancelled'
    || text === 'blocked'
    || text === 'todo'
    || text === 'in_progress'
  ) {
    return text
  }
  return 'todo'
}

function normalizePlanningFieldPatch(
  input: Record<string, unknown>,
  options: { allowCreateSystemFields?: boolean } = {},
) {
  const patch: Record<string, unknown> = {}

  for (const [field, rawValue] of Object.entries(input)) {
    if (
      TASK_COMMIT_FORBIDDEN_FIELDS.has(field)
      && !(options.allowCreateSystemFields && TASK_COMMIT_CREATE_SYSTEM_FIELDS.has(field))
    ) {
      continue
    }

    if (field === 'title') {
      const title = String(rawValue ?? '').trim()
      if (title) patch.title = title
      continue
    }

    if (field === 'start' || field === 'start_date' || field === 'planned_start_date') {
      const date = normalizeCommitDate(rawValue)
      patch.start_date = date
      patch.planned_start_date = date
      continue
    }

    if (field === 'end' || field === 'end_date' || field === 'planned_end_date') {
      const date = normalizeCommitDate(rawValue)
      patch.end_date = date
      patch.planned_end_date = date
      continue
    }

    if (field === 'progress') {
      const progress = normalizeCommitNumber(rawValue)
      if (progress !== null) {
        const clamped = Math.max(0, Math.min(100, Math.round(progress)))
        patch.progress = clamped
        patch.status = clamped >= 100 ? 'completed' : clamped > 0 ? 'in_progress' : 'todo'
      }
      continue
    }

    if (field === 'milestone' || field === 'is_milestone') {
      const isMilestone = normalizeCommitBoolean(rawValue)
      patch.is_milestone = isMilestone
      patch.milestone_level = isMilestone ? 3 : null
      continue
    }

    if (field === 'unit') {
      continue
    }

    if (field === 'assignee') {
      const assignee = String(rawValue ?? '').trim()
      patch.assignee_name = assignee || null
      patch.assignee = assignee || null
      patch.assignee_user_id = null
      continue
    }

    patch[field] = rawValue === '' ? null : rawValue
  }

  return patch
}

function buildCreateTaskPayload(projectId: string, values: Record<string, unknown>, actorId?: string | null) {
  const patch = normalizePlanningFieldPatch(values, { allowCreateSystemFields: true })
  const title = String(patch.title ?? '').trim()
  const startDate = normalizeCommitDate(patch.start_date ?? patch.planned_start_date)
  const endDate = normalizeCommitDate(patch.end_date ?? patch.planned_end_date)
  if (!title || !startDate || !endDate) {
    throw Object.assign(new Error('新增任务必须包含任务名称、计划开始、计划完成'), {
      code: 'TASK_COMMIT_REQUIRED_FIELDS_MISSING',
      statusCode: 400,
    })
  }

  return {
    ...patch,
    project_id: projectId,
    title,
    start_date: startDate,
    end_date: endDate,
    planned_start_date: startDate,
    planned_end_date: endDate,
    progress: normalizeCommitNumber(patch.progress) ?? 0,
    status: normalizeCommitStatus(patch.status),
    priority: normalizeCommitPriority(patch.priority),
    created_by: actorId ?? null,
  }
}

function buildGeneratedTemplateTaskPayload(
  projectId: string,
  row: GeneratedTemplateRow,
  parentId: string | null,
  actorId?: string | null,
) {
  const values = row.values
  const title = String(values.title ?? '').trim()
  const startDate = normalizeCommitDate(values.start_date ?? values.planned_start_date)
  const endDate = normalizeCommitDate(values.end_date ?? values.planned_end_date)
  if (!title || !startDate || !endDate) {
    throw Object.assign(new Error('模板生成任务必须包含任务名称、计划开始、计划完成'), {
      code: 'TEMPLATE_GENERATE_REQUIRED_FIELDS_MISSING',
      statusCode: 400,
    })
  }

  return {
    ...values,
    project_id: projectId,
    title,
    parent_id: parentId,
    sort_order: row.sortOrder,
    start_date: startDate,
    end_date: endDate,
    planned_start_date: startDate,
    planned_end_date: endDate,
    progress: normalizeCommitNumber(values.progress) ?? 0,
    status: normalizeCommitStatus(values.status),
    priority: normalizeCommitPriority(values.priority),
    task_source: 'template',
    created_by: actorId ?? null,
  }
}

function readStringArrayFromGeneratedValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

function readGeneratedTemplateArray(row: GeneratedTemplateRow, key: 'precondition_templates' | 'acceptance_checkpoints') {
  const direct = readStringArrayFromGeneratedValue(row.values?.[key])
  if (direct.length > 0) return direct
  const standardTaskMetadata = row.values?.standard_task_metadata
  if (!standardTaskMetadata || typeof standardTaskMetadata !== 'object' || Array.isArray(standardTaskMetadata)) return []
  const metadataKey = key === 'precondition_templates' ? 'preconditionTemplates' : 'acceptanceCheckpoints'
  return readStringArrayFromGeneratedValue((standardTaskMetadata as Record<string, unknown>)[metadataKey])
}

function normalizeDependencyType(value: unknown): GeneratedTemplateDependency['dependencyType'] {
  const dependencyType = String(value ?? '').trim().toUpperCase()
  if (dependencyType === 'SS' || dependencyType === 'FF' || dependencyType === 'SF') return dependencyType
  return 'FS'
}

function manualDependencyCorrectionMetadata() {
  return {
    source: 'planning_table_manual_predecessor_edit',
    learningSignal: 'manual_dependency_correction',
    candidatePolicy: 'candidate_only_no_runtime_rule_mutation',
  }
}

function readOperationDependencySpecs(operation: PlanningTableOperation) {
  const raw = Array.isArray(operation.predecessorDependencies)
    ? operation.predecessorDependencies
    : []
  return raw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    const dependencyTaskId = String(
      record.dependencyTaskId
      ?? record.dependency_task_id
      ?? record.taskId
      ?? record.task_id
      ?? record.clientRowId
      ?? record.client_row_id
      ?? '',
    ).trim()
    if (!dependencyTaskId) return null
    return {
      dependencyTaskId,
      dependencyType: normalizeDependencyType(record.dependencyType ?? record.dependency_type),
      lagDays: Number(record.lagDays ?? record.lag_days ?? 0) || 0,
      sourceType: 'manual',
      metadata: manualDependencyCorrectionMetadata(),
    }
  }).filter((item): item is {
    dependencyTaskId: string
    dependencyType: GeneratedTemplateDependency['dependencyType']
    lagDays: number
    sourceType: string
    metadata: ReturnType<typeof manualDependencyCorrectionMetadata>
  } => Boolean(item))
}

function mapGeneratedDependencySourceType(source: GeneratedTemplateDependency['source'] | string | null | undefined) {
  if (source === 'sibling_sequence' || source === 'internal_flow') return 'template_internal_flow'
  if (source === 'cross_item_workflow') return 'template_cross_item_workflow'
  if (source === 'dependency_intent_template') return 'template_dependency_intent'
  if (source === 'duration_learning_runtime_publication') return 'duration_learning_runtime_publication'
  return 'template_generated'
}

function generatedDependencyMetadata(dependency: GeneratedTemplateDependency) {
  const raw = dependency as GeneratedTemplateDependency & Record<string, unknown>
  const evidence = readGeneratedTemplateRecord(raw.dependencyRuleEvidence)
  const sequencingBasis = String(raw.sequencingBasis ?? '').trim()
  const publicationKey = String(raw.publicationKey ?? '').trim() || null
  return {
    source: String(raw.source ?? '').trim() || 'generated_dependency_network',
    intentCode: String(raw.intentCode ?? '').trim() || null,
    predecessorStableCode: String(raw.predecessorStableCode ?? '').trim() || null,
    sequencingBasis: sequencingBasis || null,
    governanceGapCode: String(raw.governanceGapCode ?? '').trim() || null,
    dependencyRuleEvidence: Object.keys(evidence).length > 0 ? evidence : null,
    publicationKey,
    artifactKey: String(raw.artifactKey ?? '').trim() || null,
    publicationStage: String(raw.publicationStage ?? '').trim() || null,
    selectionBasis: String(raw.selectionBasis ?? '').trim() || null,
    learningPolicy: sequencingBasis
      ? 'candidate_only_until_dependency_rule_replay_publication'
      : publicationKey
        ? 'published_duration_learning_runtime_dependency'
        : 'published_or_template_generated_dependency',
  }
}

function buildGeneratedTemplateDependencyWrites(
  row: GeneratedTemplateRow,
  generatedIdByClientRowId: Map<string, string>,
  tempIdMap: Map<string, string>,
) {
  return row.predecessorDependencies
    .map((dependency) => {
      const dependencyTaskId = generatedIdByClientRowId.get(dependency.clientRowId) ?? tempIdMap.get(dependency.clientRowId)
      if (!dependencyTaskId) return null
      return {
        dependencyTaskId,
        dependencyType: normalizeDependencyType(dependency.dependencyType),
        lagDays: Number(dependency.lagDays ?? 0) || 0,
        sourceType: mapGeneratedDependencySourceType(dependency.source),
        metadata: generatedDependencyMetadata(dependency),
      }
    })
    .filter((item): item is {
      dependencyTaskId: string
      dependencyType: GeneratedTemplateDependency['dependencyType']
      lagDays: number
      sourceType: string
      metadata: ReturnType<typeof generatedDependencyMetadata>
    } => Boolean(item))
}

function readPreviewRowClientIds(operation: PlanningTableOperation) {
  if (!Array.isArray(operation.previewRows)) return null
  const ids = operation.previewRows
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return ''
      return String((row as Record<string, unknown>).clientRowId ?? '').trim()
    })
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

function filterGeneratedRowsForPreviewSelection(rows: GeneratedTemplateRow[], operation: PlanningTableOperation) {
  const keepIds = readPreviewRowClientIds(operation)
  if (!keepIds) return rows
  return rows
    .filter((row) => keepIds.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: row.predecessorClientRowIds.filter((clientRowId) => keepIds.has(clientRowId)),
      predecessorDependencies: row.predecessorDependencies.filter((dependency) => keepIds.has(dependency.clientRowId)),
    }))
}

async function persistDeletedGeneratedMasterPlanVisibilityFeedback(
  task: Record<string, unknown>,
  actorId: string | null,
) {
  const projectId = String(task.project_id ?? task.projectId ?? '').trim()
  if (!projectId) return

  try {
    const companyId = await getProjectCompanyId(projectId)
    const deleteVisibilityFeedback = buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback({
      task,
      companyId,
      actorId,
      adjustment: 'hide',
    })
    await persistDefaultMasterPlanVisibilityFeedbackCandidate(deleteVisibilityFeedback)
  } catch (error) {
    logger.warn('[tasks] failed to persist generated master-plan visibility deletion feedback', {
      projectId,
      taskId: task.id ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function logGeneratedTemplateCommitRenderBudget(rows: GeneratedTemplateRow[], operation: PlanningTableOperation, projectId: string) {
  const rawBatches: unknown[] = Array.isArray(operation.generationBatches)
    ? operation.generationBatches
    : Array.isArray(operation.generation_batches)
      ? operation.generation_batches
      : []
  const rowLimit = rawBatches
    .map((batch) => batch && typeof batch === 'object' && !Array.isArray(batch) ? Number((batch as Record<string, unknown>).rowLimit ?? (batch as Record<string, unknown>).row_limit) : NaN)
    .find((value) => Number.isFinite(value) && value > 0)
    ?? 500
  const exceedsOperationBudget = rawBatches.some((batch) => (
    batch && typeof batch === 'object' && !Array.isArray(batch)
      ? (batch as Record<string, unknown>).rowLimitExceeded === true || (batch as Record<string, unknown>).row_limit_exceeded === true
      : false
  ))
  if (rows.length <= rowLimit && !exceedsOperationBudget) return

  logger.warn('[tasks.commit] template generation exceeds render budget; committing full generated rows', {
    projectId,
    generatedRowCount: rows.length,
    rowLimit,
    rowLimitPolicy: operation.rowLimitPolicy ?? operation.row_limit_policy ?? null,
    generationBatchId: operation.generationBatchId ?? operation.generation_batch_id ?? null,
  })
}

function conditionTemplateLabel(code: string) {
  const labels: Record<string, string> = {
    workface_available: '工作面具备施工条件',
    safety_technical_disclosure_done: '安全技术交底完成',
    material_accepted: '材料到场并验收合格',
    survey_control_ready: '测量控制线复核完成',
    previous_hidden_acceptance_done: '前序隐蔽验收完成',
    installation_completed: '安装完成并具备调试条件',
  }
  return labels[code] ?? code
}

function conditionTemplateType(code: string) {
  if (code === 'material_accepted') return 'material'
  if (code === 'survey_control_ready' || code === 'previous_hidden_acceptance_done') return 'preceding'
  if (code === 'installation_completed') return 'equipment'
  return 'other'
}

type GeneratedTemplateTaskConditionInsert = {
  id: string
  taskId: string
  projectId: string
  conditionType: string
  conditionCode: string
  name: string
  description: string
  isSatisfied: boolean
  requiredForStart: boolean
  blockingLevel: string
  sourceType: string
  inferenceConfidence: string
  inferenceReason: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

type GeneratedTemplateAcceptancePlanInsert = {
  id: string
  taskId: string
  projectId: string
  planName: string
  acceptanceName: string
  acceptanceType: string
  buildingObjectId: unknown
  scopeLevel: unknown
  participantUnitId: unknown
  description: string
  plannedDate: unknown
  status: string
  isCustom: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

async function insertGeneratedTemplateTaskCondition(row: GeneratedTemplateTaskConditionInsert) {
  await executeSQL(
    `INSERT INTO task_conditions (
       id, task_id, project_id, condition_type, condition_code, name, description,
       is_satisfied, required_for_start, blocking_level, source_type,
       inference_confidence, inference_reason, created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.taskId,
      row.projectId,
      row.conditionType,
      row.conditionCode,
      row.name,
      row.description,
      row.isSatisfied,
      row.requiredForStart,
      row.blockingLevel,
      row.sourceType,
      row.inferenceConfidence,
      row.inferenceReason,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
    ],
  )
  return true
}

async function insertGeneratedTemplateAcceptancePlan(row: GeneratedTemplateAcceptancePlanInsert) {
  const write = async () => {
    await executeSQL(
      `INSERT INTO acceptance_plans (
         id, project_id, plan_name, acceptance_name, acceptance_type,
         building_object_id, scope_level, participant_unit_id, description,
         planned_date, status, is_custom, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.projectId,
        row.planName,
        row.acceptanceName,
        row.acceptanceType,
        row.buildingObjectId ?? null,
        row.scopeLevel ?? null,
        row.participantUnitId ?? null,
        row.description,
        row.plannedDate ?? null,
        row.status,
        row.isCustom,
        row.createdBy,
        row.createdAt,
        row.updatedAt,
      ],
    )

    await executeSQL(
      `INSERT INTO project_entity_links (
         project_id, source_entity_type, source_entity_id, target_entity_type,
         target_entity_id, relation_type, relation_strength, status, created_at, updated_at
       ) VALUES (?, 'acceptance_plan', ?, 'task', ?, 'covers_task', 'explicit', 'active', ?, ?)`,
      [row.projectId, row.id, row.taskId, row.createdAt, row.updatedAt],
    )
    await recordAcceptancePlanExecutionFacts({
      projectId: row.projectId,
      planId: row.id,
      previous: null,
      next: {
        status: row.status,
        actual_date: null,
      },
      sourceModule: 'tasks',
      sourceMutationId: `tasks:template-acceptance-plan:${row.id}:create`,
      observedAt: row.createdAt,
      actorUserId: row.createdBy,
      forceInitial: true,
    })
    return true
  }
  if (isDatabaseTransactionActive()) return write()
  return withDatabaseTransaction(write)
}

function readGeneratedTemplateMetadata(row: GeneratedTemplateRow) {
  const metadata = row.values?.standard_task_metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function readGeneratedTemplateRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function isGeneratedTemplateMajorAcceptanceRow(row: GeneratedTemplateRow) {
  const values = row.values ?? {}
  const metadata = readGeneratedTemplateMetadata(row)
  const planItemKind = String(metadata.planItemKind ?? metadata.plan_item_kind ?? values.plan_item_kind ?? '').trim().toLowerCase()
  const acceptanceLinkRule = readGeneratedTemplateRecord(metadata.acceptanceLinkRule ?? metadata.acceptance_link_rule)
  const linkedProjectionSource = readGeneratedTemplateRecord(metadata.linkedProjectionSource ?? metadata.linked_projection_source)
  const sourceType = String(linkedProjectionSource.sourceType ?? linkedProjectionSource.source_type ?? '').trim().toLowerCase()

  return planItemKind === 'linked_projection'
    || Boolean(metadata.isAcceptanceMilestone ?? metadata.is_acceptance_milestone)
    || Object.keys(acceptanceLinkRule).length > 0
    || sourceType === 'acceptance_plan'
    || sourceType === 'acceptance_timeline'
}

function inferGeneratedTemplateAcceptanceType(row: GeneratedTemplateRow) {
  const values = row.values ?? {}
  const metadata = readGeneratedTemplateMetadata(row)
  const explicit = String(
    metadata.acceptanceType
    ?? metadata.acceptance_type
    ?? values.acceptance_type
    ?? '',
  ).trim()
  if (explicit) return explicit

  const title = String(values.title ?? values.standard_work_name ?? '').toLowerCase()
  if (title.includes('消防')) return 'fire_acceptance'
  if (title.includes('竣工') || title.includes('联合验收')) return 'completion'
  if (title.includes('电梯')) return 'elevator_acceptance'
  if (title.includes('专项') || title.includes('人防') || title.includes('节能')) return 'special'
  return 'template_major_acceptance'
}

function getTemplateAcceptancePlanNames(row: GeneratedTemplateRow) {
  if (!isGeneratedTemplateMajorAcceptanceRow(row)) return []
  const values = row.values ?? {}
  const taskTitle = String(values.title ?? values.standard_work_name ?? '').trim()
  if (taskTitle) return [taskTitle]
  const checkpoints = readGeneratedTemplateArray(row, 'acceptance_checkpoints')
  return checkpoints.length > 0 ? [checkpoints[checkpoints.length - 1]] : []
}

async function instantiateGeneratedTemplateTaskLinks(params: {
  projectId: string
  taskId: string
  row: GeneratedTemplateRow
  actorId?: string | null
}) {
  const values = params.row.values ?? {}
  const isExecutable = values.is_executable !== false && values.is_wbs_summary !== true
  if (!isExecutable) return { conditionCount: 0, acceptanceCount: 0 }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const taskTitle = String(values.title ?? '').trim()
  const preconditions = readGeneratedTemplateArray(params.row, 'precondition_templates')
  let conditionCount = 0
  for (const code of preconditions) {
    const inserted = await insertGeneratedTemplateTaskCondition({
      id: randomUUID(),
      taskId: params.taskId,
      projectId: params.projectId,
      conditionType: conditionTemplateType(code),
      conditionCode: code,
      name: conditionTemplateLabel(code),
      description: taskTitle ? `由标准工序“${taskTitle}”自动生成` : '由标准工序模板自动生成',
      isSatisfied: false,
      requiredForStart: true,
      blockingLevel: code === 'material_accepted' || code === 'previous_hidden_acceptance_done' ? 'hard' : 'soft',
      sourceType: 'template',
      inferenceConfidence: 'high',
      inferenceReason: 'v1.4.7.2 template precondition',
      createdBy: params.actorId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    if (inserted) conditionCount += 1
  }

  const acceptancePlanNames = getTemplateAcceptancePlanNames(params.row)
  let acceptanceCount = 0
  for (const planName of acceptancePlanNames) {
    const inserted = await insertGeneratedTemplateAcceptancePlan({
      id: randomUUID(),
      taskId: params.taskId,
      projectId: params.projectId,
      planName,
      acceptanceName: planName,
      acceptanceType: inferGeneratedTemplateAcceptanceType(params.row),
      buildingObjectId: values.building_object_id ?? null,
      scopeLevel: values.wbs_node_type ?? values.category_type ?? null,
      participantUnitId: values.participant_unit_id ?? null,
      description: taskTitle ? `由标准工序“${taskTitle}”自动挂接` : '由标准工序模板自动挂接',
      plannedDate: values.planned_end_date ?? values.end_date ?? null,
      status: 'draft',
      isCustom: false,
      createdBy: params.actorId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    if (inserted) acceptanceCount += 1
  }

  if (conditionCount > 0) {
    await registerDatabasePostCommitEffect('evaluate_template_generated_task_constraint', async () => {
      await evaluateTaskConstraint(params.taskId, { projectId: params.projectId, sourceEventType: 'template_generated_conditions' })
    })
  }

  return { conditionCount, acceptanceCount }
}

function broadcastTaskApiWrite(params: {
  projectId?: string | null
  taskId?: string | null
  changedFields?: string[]
  deleted?: boolean
}) {
  const projectId = String(params.projectId ?? '').trim()
  const taskId = String(params.taskId ?? '').trim()
  if (!projectId || !taskId) return

  clearTaskProgressSnapshotsCache(projectId)

  const revision = Date.now()
  broadcastProjectTasksChanged({
    projectId,
    changedTaskIds: params.deleted ? [] : [taskId],
    deletedTaskIds: params.deleted ? [taskId] : [],
    source: 'task_api',
    revision,
  })

  if (!params.deleted) {
    broadcastTaskChanged({
      projectId,
      taskId,
      changedFields: params.changedFields ?? [],
      source: 'task_api',
      revision,
    })
  }
}

function emptyCriticalPathChangeSummary(): CriticalPathChangeSummary {
  return {
    changed: false,
    enteredTaskIds: [],
    leftTaskIds: [],
  }
}

function compareCriticalPathTaskIds(
  previousTaskIds: Set<string>,
  nextTaskIds: Set<string>,
): CriticalPathChangeSummary {
  const enteredTaskIds = [...nextTaskIds].filter((taskId) => !previousTaskIds.has(taskId)).sort()
  const leftTaskIds = [...previousTaskIds].filter((taskId) => !nextTaskIds.has(taskId)).sort()

  return {
    changed: enteredTaskIds.length > 0 || leftTaskIds.length > 0,
    enteredTaskIds,
    leftTaskIds,
  }
}

async function loadCriticalPathDisplayTaskIdSet(projectId: string): Promise<Set<string> | null> {
  try {
    const snapshot = await getProjectCriticalPathSnapshot(projectId)
    return new Set((snapshot.displayTaskIds ?? []).map((taskId) => String(taskId)).filter(Boolean))
  } catch (error) {
    logger.warn('[tasks] failed to read critical path snapshot before task-list commit', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function summarizeCriticalPathChangeAfterTaskCommit(
  projectId: string,
  previousTaskIds: Set<string> | null,
): Promise<CriticalPathChangeSummary> {
  if (!previousTaskIds) {
    return emptyCriticalPathChangeSummary()
  }

  try {
    const result = await recalculateProjectCriticalPath(projectId)
    return compareCriticalPathTaskIds(
      previousTaskIds,
      new Set((result.snapshot.displayTaskIds ?? []).map((taskId) => String(taskId)).filter(Boolean)),
    )
  } catch (error) {
    logger.warn('[tasks] failed to recalculate critical path after task-list commit', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return emptyCriticalPathChangeSummary()
  }
}

function buildTaskDeleteProtectionResponse(task: Task, summary: TaskDeleteProtectionSummary): ApiResponse {
  const hasBaselineLink = Boolean(summary.has_baseline_link)
  return {
    success: false,
    error: {
      code: 'TASK_DELETE_PROTECTED',
      message: hasBaselineLink
        ? '该施工任务已关联项目基线，请先处理基线关联后再删除。'
        : '该任务已形成下级或关联记录，请先处理关联记录后再删除。',
      details: {
        entity_type: 'task',
        entity_id: task.id,
        status: task.status,
        progress: Number(task.progress ?? 0),
        baseline_item_id: summary.baseline_item_id ?? null,
        close_action: {
          method: 'POST',
          endpoint: `/api/tasks/${task.id}/close`,
          label: '关闭此记录',
        },
        ...summary,
      },
    },
    timestamp: new Date().toISOString(),
  }
}

function readRetentionReferenceCount(refs: Record<string, number> | undefined, key: string) {
  const value = Number(refs?.[key] ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function isAutoPhysicalTaskDeleteRetention(retention: TaskDeleteRetentionDecision) {
  return retention.canPhysicalDelete === true &&
    retention.resolvedAction === 'physical_delete' &&
    retention.executionMode === 'auto_execute'
}

function buildTaskDeleteRetentionReasonCode(retention: TaskDeleteRetentionDecision) {
  if (
    retention.executionMode === 'reject' ||
    retention.decision === 'reject' ||
    retention.resolvedAction === 'reject'
  ) {
    return 'RETENTION_REJECTED'
  }
  return 'RETENTION_CONFIRMATION_REQUIRED'
}

function buildTaskDeleteRetentionMessage(retention: TaskDeleteRetentionDecision) {
  if (typeof retention.reason === 'string' && retention.reason.trim()) {
    return retention.reason.trim()
  }
  if (buildTaskDeleteRetentionReasonCode(retention) === 'RETENTION_REJECTED') {
    return '该施工任务受删除保留规则保护，不能删除。'
  }
  return '该施工任务仍有关联或历史记录，需要保留处置确认，不能在普通删除中直接物理删除。'
}

function buildTaskDeleteRetentionSummary(task: Task, retention: TaskDeleteRetentionDecision) {
  const refs = retention.referenceSummary ?? {}
  const taskProgress = Number(task.progress ?? 0)
  const hasHistoryReference =
    readRetentionReferenceCount(refs, 'task_progress_snapshots') > 0 ||
    readRetentionReferenceCount(refs, 'data_lineage_links') > 0 ||
    readRetentionReferenceCount(refs, 'monthly_plan_items') > 0 ||
    readRetentionReferenceCount(refs, 'task_baseline_items') > 0 ||
    readRetentionReferenceCount(refs, 'change_logs') > 0 ||
    readRetentionReferenceCount(refs, 'warnings') > 0 ||
    readRetentionReferenceCount(refs, 'notifications') > 0

  return {
    entity_type: 'task',
    entity_id: task.id,
    status: task.status,
    progress: Number.isFinite(taskProgress) ? taskProgress : 0,
    reason_code: retention.reasonCode ?? null,
    reason: retention.reason ?? null,
    resolved_action: retention.resolvedAction ?? null,
    execution_mode: retention.executionMode ?? null,
    requires_user_confirmation: retention.requiresUserConfirmation === true,
    decision_token: retention.decisionToken ?? null,
    reference_summary: refs,
    suggested_action: retention.suggestedAction ?? {},
    child_task_count: readRetentionReferenceCount(refs, 'child_tasks'),
    condition_count: readRetentionReferenceCount(refs, 'task_conditions'),
    obstacle_count: readRetentionReferenceCount(refs, 'task_obstacles'),
    acceptance_plan_count: readRetentionReferenceCount(refs, 'acceptance_plans'),
    has_execution_trail:
      hasHistoryReference ||
      taskProgress > 0 ||
      !['pending', 'todo'].includes(String(task.status ?? '').trim().toLowerCase()),
    has_baseline_link: Boolean(task.baseline_item_id) || readRetentionReferenceCount(refs, 'task_baseline_items') > 0,
    baseline_item_id: task.baseline_item_id ?? null,
    close_action: {
      method: 'POST',
      endpoint: `/api/tasks/${task.id}/close`,
      label: '关闭此记录',
    },
  }
}

async function executeTaskDeleteRetention(
  task: Task,
  actorId: string | null,
  options: {
    requestId?: string | null
    source?: string
    surface?: string | null
  } = {},
): Promise<TaskDeleteRetentionDecision> {
  const { executeRetention } = await import('../services/deletionRetentionGovernanceService.js')
  const taskName = String(task.title ?? task.id ?? '').trim()
  const metadata: Record<string, unknown> = {
    source: options.source ?? 'task_api',
  }
  if (options.surface) metadata.surface = options.surface
  return executeRetention({
    entityType: 'task',
    entityId: task.id,
    projectId: task.project_id ?? null,
    entityNameSnapshot: taskName || null,
    userId: actorId,
    actorId,
    userAction: 'delete',
    requestId: options.requestId ?? null,
    metadata,
  }) as Promise<TaskDeleteRetentionDecision>
}

async function decorateTaskWithParticipantUnit(task: Task): Promise<TaskWithParticipantUnit> {
  const taskUnitName = normalizeUnitLabel(task.participant_unit_name)

  const base: TaskWithParticipantUnit = {
    ...task,
    participant_unit_name: normalizeUnitLabel(task.participant_unit_name) || null,
  }

  if (!task.participant_unit_id) {
    return taskUnitName
      ? { ...base, participant_unit_name: taskUnitName }
      : base
  }

  const taskProjectId = normalizeUnitLabel(task.project_id)
  if (!taskProjectId) {
    return base
  }

  const matched = await readParticipantUnitForTask(task.participant_unit_id, taskProjectId)

  const unitName = matched[0]?.unit_name?.trim() || taskUnitName || null
  return {
    ...base,
    participant_unit_name: unitName,
  }
}

async function decorateTasksWithParticipantUnits(tasks: Task[]) {
  const taskMap = new Map<string, TaskWithParticipantUnit>()
  const participantUnitIds = Array.from(
    new Set(tasks.map((task) => task.participant_unit_id).filter((value): value is string => Boolean(value))),
  )

  let participantUnitNameMap = new Map<string, string>()
  if (participantUnitIds.length > 0) {
    const rows = await readParticipantUnitsByIds(participantUnitIds)
    participantUnitNameMap = new Map(
      rows.flatMap((row) => {
        const projectScopedKey = `${String(row.id)}:${normalizeUnitLabel(row.project_id)}`
        return [
          [projectScopedKey, String(row.unit_name ?? '')],
          [String(row.id), String(row.unit_name ?? '')],
        ] as const
      }),
    )
  }

  for (const task of tasks) {
    const taskProjectId = normalizeUnitLabel(task.project_id)
    const unitName = task.participant_unit_id && taskProjectId
      ? participantUnitNameMap.get(`${task.participant_unit_id}:${taskProjectId}`) || participantUnitNameMap.get(task.participant_unit_id) || null
      : null
    taskMap.set(task.id, {
      ...task,
      participant_unit_name: unitName || normalizeUnitLabel(task.participant_unit_name) || null,
    })
  }

  return Array.from(taskMap.values())
}

async function attachTaskDependencyProjection<T extends Task>(tasks: T[], projectId?: string | null): Promise<T[]> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId || tasks.length === 0) return tasks

  const taskIds = [...new Set(tasks.map((task) => String(task.id ?? '').trim()).filter(Boolean))]
  if (taskIds.length === 0) return tasks

  const rows = await readTaskDependenciesByTaskIds(normalizedProjectId, taskIds)
  const dependenciesByTaskId = new Map<string, string[]>()
  for (const row of rows) {
    const taskId = String(row.task_id ?? '').trim()
    const dependencyTaskId = String(row.dependency_task_id ?? '').trim()
    if (!taskId || !dependencyTaskId) continue
    dependenciesByTaskId.set(taskId, [...(dependenciesByTaskId.get(taskId) ?? []), dependencyTaskId])
  }

  return tasks.map((task) => ({
    ...task,
    dependencies: dependenciesByTaskId.get(task.id) ?? [],
  }))
}

async function decorateTaskResponse(task: Task): Promise<TaskWithLagStatus> {
  const taskWithParticipantUnit = await decorateTaskWithParticipantUnit(task)

  // v1.4.1: Enrich with engineering object names/codes for display
  const objectIds = [
    (task as any).building_object_id,
    (task as any).basement_object_id,
    (task as any).physical_zone_object_id,
    (task as any).functional_area_object_id,
    (task as any).phase_object_id,
    (task as any).section_object_id,
    (task as any).floor_object_id,
  ].filter(Boolean) as string[]

  if (objectIds.length > 0) {
    const { data: eoRows } = await db
      .from('engineering_objects')
      .select('id, object_name, object_code, object_type')
      .in('id', objectIds)

    const eoMap = new Map((eoRows ?? []).map((r: any) => [r.id, r]))

    const enriched: any = { ...taskWithParticipantUnit }
    const bldObj = eoMap.get((task as any).building_object_id)
    if (bldObj) enriched.building_name = bldObj.object_name

    const basementObj = eoMap.get((task as any).basement_object_id)
    if (basementObj) enriched.basement_name = basementObj.object_name

    const physicalZoneObj = eoMap.get((task as any).physical_zone_object_id)
    if (physicalZoneObj) enriched.physical_zone_name = physicalZoneObj.object_name

    const functionalAreaObj = eoMap.get((task as any).functional_area_object_id)
    if (functionalAreaObj) enriched.functional_area_name = functionalAreaObj.object_name

    const phaseObj = eoMap.get((task as any).phase_object_id)
    if (phaseObj) {
      enriched.phase_name = phaseObj.object_name
      enriched.phase_object_code = phaseObj.object_code
    }

    const sectionObj = eoMap.get((task as any).section_object_id)
    if (sectionObj) enriched.section_name = sectionObj.object_name

    const floorObj = eoMap.get((task as any).floor_object_id)
    if (floorObj) enriched.floor_name = floorObj.object_name

    // v1.4.3: apply standard DTO before returning
    const dto2 = await buildStandardDTO(enriched, { mode: 'detail' })
    const [withAcceptanceImpact] = await attachAcceptanceImpactSummaries(
      [sanitizeTaskForClient(dto2) as unknown as TaskWithParticipantUnit],
      task.project_id,
    )
    return withAcceptanceImpact as TaskWithLagStatus
  }

  const dto = await buildStandardDTO(taskWithParticipantUnit as unknown as Record<string, unknown>, { mode: 'detail' })
  const [withAcceptanceImpact] = await attachAcceptanceImpactSummaries(
    [sanitizeTaskForClient(dto) as unknown as TaskWithParticipantUnit],
    task.project_id,
  )
  return withAcceptanceImpact as TaskWithLagStatus
}

async function loadTaskDeleteProtectionSummary(task: Task): Promise<TaskDeleteProtectionSummary | null> {
  const [childTasks, conditions, obstacles, acceptancePlans] = await Promise.all([
    executeSQL<{ id: string }>('SELECT id FROM tasks WHERE parent_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM task_conditions WHERE task_id = ?', [task.id]),
    executeSQL<{ id: string }>('SELECT id FROM task_obstacles WHERE task_id = ?', [task.id]),
    executeSQL<{ id: string }>(
      `SELECT source_entity_id AS id
         FROM project_entity_links
        WHERE project_id = ?
          AND source_entity_type = 'acceptance_plan'
          AND target_entity_type = 'task'
          AND target_entity_id = ?
          AND relation_type = 'covers_task'
          AND status = 'active'`,
      [task.project_id, task.id],
    ),
  ])

  const hasBaselineLink = Boolean(task.baseline_item_id)

  const summary: TaskDeleteProtectionSummary = {
    child_task_count: childTasks.length,
    condition_count: conditions.length,
    obstacle_count: obstacles.length,
    acceptance_plan_count: acceptancePlans.length,
    has_execution_trail:
      Number(task.progress ?? 0) > 0 ||
      !['pending', 'todo'].includes(String(task.status ?? '').trim().toLowerCase()),
    has_baseline_link: hasBaselineLink,
    baseline_item_id: task.baseline_item_id ?? null,
  }

  const hasBlockingRecords =
    summary.child_task_count > 0 ||
    summary.condition_count > 0 ||
    summary.obstacle_count > 0 ||
    summary.acceptance_plan_count > 0 ||
    summary.has_execution_trail ||
    hasBaselineLink

  return hasBlockingRecords ? summary : null
}

// 所有路由都需要认证
router.use(authenticate)

// 获取任务列表
router.get('/', requireProjectMember(req => (req.query.projectId ?? req.query.project_id) as string | undefined), asyncHandler(async (req, res) => {
  const projectId = (req.query.projectId ?? req.query.project_id) as string | undefined
  const baselineVersionId = typeof req.query.baseline_version_id === 'string'
    ? req.query.baseline_version_id.trim()
    : ''
  const includeTimelineProjection =
    parseTimelineProjectionFlag(req.query.timeline_projection) || Boolean(baselineVersionId)
  const includeAcceptanceImpact = !parseFalseFlag(req.query.acceptance_impact)
  const surface = typeof req.query.surface === 'string' ? req.query.surface.trim() : ''

  logger.info('Fetching tasks', { projectId, baselineVersionId: baselineVersionId || null, includeTimelineProjection, includeAcceptanceImpact, surface: surface || null })
  
  const tasks = await supabase.getTasks(projectId, {
    columns: surface === 'task_list' ? TASK_LIST_SURFACE_COLUMNS : undefined,
  })
  const sortedTasks = [...tasks].sort(compareTimelineOrder)
  const decoratedTasks = await decorateTasksWithParticipantUnits(sortedTasks)
  const dependencyProjectedTasks = await attachTaskDependencyProjection(decoratedTasks, projectId)
  const projectedTasks = await attachTimelineProjectionFields(dependencyProjectedTasks, {
    includeTimelineProjection,
    baselineVersionId: baselineVersionId || null,
  })
  const impactDecoratedTasks = includeAcceptanceImpact
    ? await attachOptionalAcceptanceImpactSummaries(projectedTasks, projectId)
    : withoutAcceptanceImpactSummaries(projectedTasks)
  const response: ApiResponse<TaskWithLagStatus[]> = {
    success: true,
    data: await Promise.all(impactDecoratedTasks.map(async (t) => {
      const dto = sanitizeTaskForClient(await buildStandardDTO(t as unknown as Record<string, unknown>, { mode: 'list' }))
      return (surface === 'task_list' ? pickTaskListSurfaceResponseFields(dto) : dto) as unknown as TaskWithLagStatus
    })),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取项目所有任务的进度快照（用于连续滞后分析）
router.get('/progress-snapshots', requireProjectMember(req => req.query.projectId as string | undefined), asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching progress snapshots', { projectId })

  const snapshots = await runWithRequestBudget(
    {
      operation: 'tasks.progress_snapshots',
      timeoutMs: TASK_PROGRESS_SNAPSHOTS_READ_TIMEOUT_MS,
    },
    async () => loadTaskProgressSnapshots(projectId),
  )

  const response: ApiResponse = {
    success: true,
    data: snapshots,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/batch-update/jobs/:jobId', asyncHandler(async (req, res, next) => {
  const job = await getTaskBatchUpdateJob(req.params.jobId)
  if (!job) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_BATCH_JOB_NOT_FOUND', message: '批量更新作业不存在' },
      timestamp: new Date().toISOString(),
    }
    res.status(404).json(response)
    return
  }
  res.locals.taskBatchUpdateJob = job
  next()
}), requireProjectMember((req) => {
  const job = req.res?.locals.taskBatchUpdateJob as TaskBatchUpdateJob | undefined
  return job?.projectId
}), asyncHandler(async (_req, res) => {
  const job = res.locals.taskBatchUpdateJob as TaskBatchUpdateJob
  const response: ApiResponse = {
    success: true,
    data: {
      job_id: job.id,
      project_id: job.projectId,
      status: job.status,
      accepted_count: job.acceptedCount,
      succeeded_count: job.succeededCount,
      failed_count: job.failedCount,
      processing: job.status === 'pending' || job.status === 'running',
      updated_task_ids: (job.items ?? [])
        .filter((item) => item.status === 'succeeded')
        .map((item) => item.taskId),
      items: (job.items ?? []).map((item) => ({
        task_id: item.taskId,
        status: item.status,
        expected_version: item.expectedVersion,
        result_version: item.resultVersion,
        target_patch: item.targetPatch,
        error_code: item.errorCode,
        error_message: item.errorMessage,
        attempt_count: item.attemptCount,
        completed_at: item.completedAt,
      })),
      created_at: job.createdAt,
      started_at: job.startedAt,
      completed_at: job.completedAt,
      updated_at: job.updatedAt,
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id/plan-drilldown-context', validateIdParam, requireProjectMember(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const parentTask = await supabase.getTask(req.params.id)
  if (!parentTask) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '父任务不存在' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }

  const projectId = String(parentTask.project_id ?? '').trim()
  const [catalog, projectTasks] = await Promise.all([
    listWbsTemplateCatalog({ includeNodes: true }),
    supabase.getTasks(projectId),
  ])
  const drilldownCatalogs = catalog.templates.map((template) => (
    template.id === catalog.builtIn.templateId && !(template.nodes?.length)
      ? { ...template, nodes: catalog.builtIn.nodes }
      : template
  ))
  const currentLevel = resolveTaskPlanDrilldownLevel(parentTask as unknown as Record<string, unknown>)
  const step = resolveTaskPlanDrilldownStep(currentLevel)
  const response: ApiResponse = {
    success: true,
    data: {
      parentTask: sanitizeTaskForClient(await buildStandardDTO(parentTask as unknown as Record<string, unknown>, { mode: 'detail' })),
      scope: buildTaskPlanDrilldownScope(parentTask as unknown as Record<string, unknown>),
      currentLevel,
      nextLevel: step?.nextLevel ?? null,
      generationDepth: step?.generationDepth ?? null,
      includeActivitySteps: step?.includeActivitySteps ?? false,
      rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
      recommendation: resolveTaskPlanDrilldownRecommendation(
        parentTask as unknown as Record<string, unknown>,
        drilldownCatalogs,
      ),
      ...summarizeProjectExecutionPlanRows(projectTasks),
      mutationBoundary: 'read_only_context_no_task_or_dependency_write',
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个任务
router.get('/:id', validateIdParam, requireProjectMember(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task', { id })
  
  // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
  const task = await supabase.getTask(id)
  
  if (!task) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const responseTask = task ? await decorateTaskResponse(task) : null

  const response: ApiResponse<TaskWithLagStatus> = {
    success: true,
    data: responseTask as TaskWithLagStatus,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// v1.4.7.1: unified task-list edit commit endpoint.
router.post('/commit', requireProjectEditor(req => req.body.projectId), asyncHandler(async (req, res) => {
  const validation = validatePlanningTableCommitRequest(req.body, {
    expectedSurface: 'task_list',
    enforceFieldRegistryVersion: false,
    requireUuidProjectId: true,
  })
  if (!validation.ok || !validation.request) {
    const validationCode = validation.issues.some((issue) => issue.code === 'RESPONSIBLE_UNIT_LOOKUP_REQUIRED')
      ? 'RESPONSIBLE_UNIT_LOOKUP_REQUIRED'
      : 'TASK_COMMIT_INVALID_REQUEST'
    return res.status(400).json(buildPlanningTableValidationErrorResponse(
      validation.issues,
      validationCode,
    ))
  }

  const body = validation.request
  const projectId = String(body.projectId)
  const actorId = typeof req.user?.id === 'string' ? req.user.id : null
  const bodyRequestId = typeof body.clientContext?.requestId === 'string'
    ? body.clientContext.requestId.trim()
    : ''
  const headerRequestId = String(req.get('Idempotency-Key') ?? '').trim()
  if (bodyRequestId.length > 200 || headerRequestId.length > 200) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency key must not exceed 200 characters.',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  if (bodyRequestId && headerRequestId && bodyRequestId !== headerRequestId) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'IDEMPOTENCY_KEY_MISMATCH',
        message: 'The request body and Idempotency-Key header do not match.',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const requestId = headerRequestId || bodyRequestId || randomUUID()
  const requestHash = buildTaskCommitRequestHash({
    projectId,
    actorId,
    surface: body.surface,
    resourceId: body.resourceId ?? body.surfaceId ?? null,
    fieldRegistryVersion: body.fieldRegistryVersion,
    operations: body.operations,
  })

  if (!isPlanningFieldRegistryVersionCurrent(body.fieldRegistryVersion)) {
    return res.status(409).json(buildFieldRegistryStaleResponse(body.fieldRegistryVersion))
  }

  const changedTaskIds = new Set<string>()
  const deletedTaskIds = new Set<string>()
  const deletionResults: Array<Record<string, unknown>> = []
  const changedFieldsByTaskId = new Map<string, Set<string>>()
  const tempIdMap = new Map<string, string>()
  const commitTaskStateById = new Map<string, Task>()
  let previousCriticalPathTaskIds = new Set<string>()
  let replaySummary: TaskCommitReplaySummary | null = null
  let completedSummary: TaskCommitReplaySummary | null = null
  const resolveCommitRowId = (value: unknown) => {
    const rowId = String(value ?? '').trim()
    return rowId ? tempIdMap.get(rowId) ?? rowId : ''
  }

  const markChanged = (taskId: string, fields: string[] = []) => {
    if (!taskId) return
    changedTaskIds.add(taskId)
    const existing = changedFieldsByTaskId.get(taskId) ?? new Set<string>()
    for (const field of fields) existing.add(field)
    changedFieldsByTaskId.set(taskId, existing)
  }

  const loadCommitTask = async (taskId: string) => {
    const cached = commitTaskStateById.get(taskId)
    if (cached) return cached
    const task = await supabase.getTask(taskId)
    if (task) commitTaskStateById.set(taskId, task)
    return task
  }

  const rememberCommitTask = (task: Task | null | undefined) => {
    if (task?.id) commitTaskStateById.set(String(task.id), task)
  }

  try {
    await withDatabaseTransaction(async () => {
      const reservation = await reserveTaskCommitRequest({
        projectId,
        requestId,
        requestHash,
        requestedBy: actorId,
      })
      if (reservation.kind === 'replay') {
        replaySummary = reservation.summary
        for (const [clientRowId, taskId] of Object.entries(reservation.summary.tempIdMap)) {
          tempIdMap.set(clientRowId, taskId)
        }
        deletionResults.push(...reservation.summary.deletionResults)
        return
      }

      previousCriticalPathTaskIds = await loadCriticalPathDisplayTaskIdSet(projectId)
      for (const operation of body.operations) {
      const operationType = readOperationType(operation)

      if (operationType === 'template_generate') {
        const requestedAttachUnderRowId = String(
          operation.attachUnderRowId ?? operation.attach_under_row_id ?? '',
        ).trim()
        let generationOperation = operation
        let externalParentContext: {
          id: string
          clientRowId: string
          wbsNodeType: 'item_work' | 'process'
          wbsCode: string
          wbsPath: string
          childCount: number
        } | null = null
        if (requestedAttachUnderRowId) {
          const parentTask = await loadCommitTask(requestedAttachUnderRowId)
          if (!parentTask) {
            throw Object.assign(new Error('Task-plan drilldown parent task was not found.'), {
              statusCode: 404,
              code: 'TASK_PLAN_DRILLDOWN_PARENT_NOT_FOUND',
            })
          }
          if (String(parentTask.project_id ?? '') !== projectId) {
            throw Object.assign(new Error('Task-plan drilldown parent belongs to another project.'), {
              statusCode: 409,
              code: 'TASK_PLAN_DRILLDOWN_PROJECT_MISMATCH',
            })
          }
          generationOperation = governTaskPlanDrilldownOperation(
            parentTask as unknown as Record<string, unknown>,
            operation as unknown as Record<string, unknown>,
          ) as PlanningTableOperation
          const currentLevel = resolveTaskPlanDrilldownLevel(parentTask as unknown as Record<string, unknown>)
          const projectTasks = await supabase.getTasks(projectId)
          externalParentContext = {
            id: requestedAttachUnderRowId,
            clientRowId: requestedAttachUnderRowId,
            wbsNodeType: currentLevel === 'master_control' ? 'item_work' : 'process',
            wbsCode: String(parentTask.wbs_code ?? parentTask.wbs_level ?? '1').trim() || '1',
            wbsPath: String(parentTask.wbs_path ?? `/${requestedAttachUnderRowId}`).trim() || `/${requestedAttachUnderRowId}`,
            childCount: projectTasks.filter((task) => String(task.parent_id ?? '') === requestedAttachUnderRowId).length,
          }
        }
        const durationLearningRuntimeQueryExec = async <T = Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ): Promise<T[]> => {
          // database-query-dynamic-approved: the canonical 315 publication resolver owns fixed parameterized SELECTs; the task commit route only supplies its transaction executor.
          const result = await rawQuery(sql, params as any[])
          return (result.rows ?? []) as T[]
        }
        const runtimeArtifactPublications: WbsTemplateGenerationRuntimeArtifactPublication[] = []
        const generated = await generateWbsTemplateRows({
          projectId,
          surface: 'task_list',
          runtimeEvidenceMode: 'no_write',
          operation: generationOperation,
          runtimePublicationQueryExec: durationLearningRuntimeQueryExec,
          runtimeArtifactPublications,
        })
        const generatedRows = filterGeneratedRowsForPreviewSelection(generated.rows, generationOperation)
        logGeneratedTemplateCommitRenderBudget(generatedRows, generationOperation, projectId)
        const generatedIdByClientRowId = new Map<string, string>()

        if (externalParentContext) {
          const transactionClient = await getClient()
          try {
            const taskCreateItems = generatedRows.map((row) => {
              const externalParentId = row.parentClientRowId
                ? null
                : resolveCommitRowId(row.parentRowId) || externalParentContext!.id
              return {
                clientRowId: row.clientRowId,
                parentClientRowId: row.parentClientRowId ?? externalParentId,
                payload: buildGeneratedTemplateTaskPayload(projectId, row, externalParentId, actorId),
              }
            })
            const createdTaskResults = await createTasksInWizardBatch(taskCreateItems as any, actorId, {
              deferPostCreateEffects: true,
              postCreateEffectReason: 'task_plan_selected_parent_drilldown',
              trustPrevalidatedScope: true,
              skipStandardInference: true,
              transactionClient,
              externalParentContext,
            })
            for (let index = 0; index < generatedRows.length; index += 1) {
              const row = generatedRows[index]
              const createdTaskId = createdTaskResults[index].task.id
              rememberCommitTask(createdTaskResults[index].task)
              generatedIdByClientRowId.set(row.clientRowId, createdTaskId)
              tempIdMap.set(row.clientRowId, createdTaskId)
            }
            const dependencyWrites = generatedRows.flatMap((row) => {
              const taskId = generatedIdByClientRowId.get(row.clientRowId)
              if (!taskId) return []
              return buildGeneratedTemplateDependencyWrites(row, generatedIdByClientRowId, tempIdMap)
                .map((dependency) => ({ taskId, ...dependency }))
            })
            await replaceWizardGeneratedTaskDependenciesBatch({
              projectId,
              dependencies: dependencyWrites,
              actorId,
              transactionClient,
            })
          } finally {
            transactionClient.release?.()
          }

          for (const row of generatedRows) {
            const createdTaskId = generatedIdByClientRowId.get(row.clientRowId)
            if (!createdTaskId) continue
            const createPayload = buildGeneratedTemplateTaskPayload(
              projectId,
              row,
              resolveCommitRowId(row.parentRowId) || externalParentContext.id,
              actorId,
            )
            markChanged(createdTaskId, Object.keys(createPayload))
            const linkSummary = await instantiateGeneratedTemplateTaskLinks({
              projectId,
              taskId: createdTaskId,
              row,
              actorId,
            })
            if (linkSummary.conditionCount > 0) markChanged(createdTaskId, ['template_precondition_links'])
            if (linkSummary.acceptanceCount > 0) markChanged(createdTaskId, ['template_acceptance_links'])
          }
          if (generatedRows.some((row) => row.predecessorDependencies.length > 0)) {
            for (const taskId of generatedIdByClientRowId.values()) markChanged(taskId, ['predecessor_task_ids'])
          }
        } else {
          for (const row of generatedRows) {
            const parentId = row.parentClientRowId
              ? generatedIdByClientRowId.get(row.parentClientRowId) ?? tempIdMap.get(row.parentClientRowId) ?? null
              : resolveCommitRowId(row.parentRowId) || null
            const createPayload = buildGeneratedTemplateTaskPayload(projectId, row, parentId, actorId)
            const result = await createTaskInMainChain(createPayload as any, actorId)
            const createdTaskId = result.task.id
            rememberCommitTask(result.task)
            tempIdMap.set(row.clientRowId, createdTaskId)
            generatedIdByClientRowId.set(row.clientRowId, createdTaskId)
            markChanged(createdTaskId, Object.keys(createPayload))
            const linkSummary = await instantiateGeneratedTemplateTaskLinks({
              projectId,
              taskId: createdTaskId,
              row,
              actorId,
            })
            if (linkSummary.conditionCount > 0) markChanged(createdTaskId, ['template_precondition_links'])
            if (linkSummary.acceptanceCount > 0) markChanged(createdTaskId, ['template_acceptance_links'])
          }

          for (const row of generatedRows) {
            if (row.predecessorDependencies.length === 0) continue
            const taskId = generatedIdByClientRowId.get(row.clientRowId)
            if (!taskId) continue
            const dependencyWrites = buildGeneratedTemplateDependencyWrites(row, generatedIdByClientRowId, tempIdMap)
            if (dependencyWrites.length === 0) continue
            await replaceTaskDependencies(taskId, dependencyWrites, { projectId })
            markChanged(taskId, ['predecessor_task_ids'])
          }
        }
        const companyId = await getProjectCompanyId(projectId)
        if (!companyId) {
          throw Object.assign(new Error('Task template generation requires project company scope for duration learning lineage.'), {
            code: 'TASK_TEMPLATE_DURATION_LEARNING_COMPANY_SCOPE_REQUIRED',
          })
        }
        await recordWbsTemplateGenerationRuntimeConsumption({
          queryExec: durationLearningRuntimeQueryExec,
          projectId,
          generation: generated,
          runtimeArtifactPublications,
          inputTaskIds: [...generatedIdByClientRowId.values()],
          inputSubjectIdByClientRowId: generatedIdByClientRowId,
          subjectType: 'task',
        })
        await persistDurationLearningRuntimeConsumptions({
          queryExec: durationLearningRuntimeQueryExec,
          build: {
            companyId,
            projectId,
            consumerKey: 'wbsTemplateGenerationService',
            consumerSurface: 'task_list_commit',
            generationBatchId: generated.generationBatchId,
            templateIds: generated.templateIds,
            rows: generatedRows,
            runtimeArtifactPublications,
            subjectType: 'task',
            subjectIdByClientRowId: generatedIdByClientRowId,
          },
        })
        const generatedTaskIds = Array.from(generatedIdByClientRowId.values())
        const durationLearningEvidenceEvents = buildGeneratedDurationPredictionOutboxEvents({
          companyId,
          projectId,
          generationBatchId: generated.generationBatchId,
          rows: generatedRows,
          runtimeArtifactPublications,
          subjectType: 'task',
          subjectIdByClientRowId: generatedIdByClientRowId,
        })
        const wbsCandidateAnchorTaskId = generatedTaskIds[0]
        if (wbsCandidateAnchorTaskId) {
          durationLearningEvidenceEvents.push(buildWbsCandidateOutboxEvent({
            companyId,
            projectId,
            subjectType: 'task',
            subjectId: wbsCandidateAnchorTaskId,
            runtimeArtifactPublications,
            candidate: {
              companyId,
              projectId,
              surface: 'task_list',
              generationBatchId: generated.generationBatchId,
              templateId: String((generationOperation as Record<string, unknown>).templateId ?? ''),
              selectedNodeIds: Array.isArray((generationOperation as Record<string, unknown>).selectedNodeIds)
                ? (generationOperation as Record<string, unknown>).selectedNodeIds as unknown[]
                : [],
              scope: ((generationOperation as Record<string, unknown>).scope && typeof (generationOperation as Record<string, unknown>).scope === 'object')
                ? (generationOperation as Record<string, unknown>).scope as Record<string, unknown>
                : {},
              attachUnderRowId: String((generationOperation as Record<string, unknown>).attachUnderRowId ?? ''),
              generatedRowCount: generated.rows.length,
              retainedRowCount: generatedRows.length,
              rejectedRowCount: Math.max(0, generated.rows.length - generatedRows.length),
              generatedEntityIds: generatedTaskIds,
              durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows),
              actorId,
              metadata: {
                generationDepth: generated.generationDepth,
                generatedRowCount: generated.rows.length,
                retainedRowCount: generatedRows.length,
                source: 'task_list_commit',
                ...(generated.durationAssetUtilizationSummary
                  ? { durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary }
                  : {}),
              },
              scheduleTrustGate: generated.scheduleTrustGate,
            },
          }))
        }
        await enqueueDurationLearningRuntimeEvidenceBatch({
          queryExec: durationLearningRuntimeQueryExec,
          events: durationLearningEvidenceEvents,
        })
        if (generated.masterPlanVisibilitySummary) {
          const visibilityFeedback = buildDefaultMasterPlanVisibilityFeedback({
            projectId,
            companyId,
            businessType: generated.masterPlanVisibilitySummary.businessType,
            generationBatchId: generated.generationBatchId,
            actorId,
            explicitReview: Array.isArray(generationOperation.previewRows),
            generatedRows: generated.rows,
            retainedClientRowIds: generatedRows.map((row) => row.clientRowId),
          })
          await registerDatabasePostCommitEffect('persist_default_master_plan_visibility_feedback', async () => {
            await persistDefaultMasterPlanVisibilityFeedbackCandidate(visibilityFeedback).catch((error) => {
              logger.warn('[tasks.commit] failed to persist default master-plan visibility feedback', {
                projectId,
                generationBatchId: generated.generationBatchId,
                error: error instanceof Error ? error.message : String(error),
              })
            })
          })
        }
        continue
      }

      if (operationType === 'create_row') {
        const values = readOperationValues(operation)
        if (operation.parentId !== undefined) {
          const requestedParentId = String(operation.parentId || '').trim()
          values.parent_id = requestedParentId
            ? tempIdMap.get(requestedParentId) ?? requestedParentId
            : null
        }
        if (operation.sortOrder !== undefined) values.sort_order = normalizeCommitNumber(operation.sortOrder)
        const createPayload = buildCreateTaskPayload(projectId, values, actorId)
        const result = await createTaskInMainChain(createPayload, actorId)
        const createdTaskId = result.task.id
        rememberCommitTask(result.task)
        const clientRowId = String(operation.clientRowId ?? operation.tempId ?? '').trim()
        if (clientRowId) tempIdMap.set(clientRowId, createdTaskId)
        markChanged(createdTaskId, Object.keys(createPayload))
        continue
      }

      if (operationType === 'update_cell') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        const field = String(operation.field ?? '').trim()
        if (!taskId || !field) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue
        const patch = normalizePlanningFieldPatch({ [field]: operation.value })
        if (Object.keys(patch).length === 0) continue
        const result = await updateTaskInMainChain(taskId, { ...patch, updated_by: actorId } as Partial<Task>, current.version ?? undefined)
        rememberCommitTask(result?.task)
        markChanged(taskId, Object.keys(patch))
        continue
      }

      if (operationType === 'update_row') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        if (!taskId) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue
        const patch = normalizePlanningFieldPatch(readOperationValues(operation))
        if (Object.keys(patch).length === 0) continue
        const result = await updateTaskInMainChain(taskId, { ...patch, updated_by: actorId } as Partial<Task>, current.version ?? undefined)
        rememberCommitTask(result?.task)
        markChanged(taskId, Object.keys(patch))
        continue
      }

      if (operationType === 'delete_row') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        if (!taskId) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue

        const protectionSummary = await loadTaskDeleteProtectionSummary(current)
        if (protectionSummary) {
          deletionResults.push({
            rowId: taskId,
            action: 'refused',
            reasonCode: 'TASK_DELETE_PROTECTED',
            summary: protectionSummary,
          })
          continue
        }

        const retention = await executeTaskDeleteRetention(current, actorId, {
          requestId,
          source: 'task_list_commit',
          surface: 'task_list',
        })
        if (!isAutoPhysicalTaskDeleteRetention(retention)) {
          deletionResults.push({
            rowId: taskId,
            action: 'refused',
            reasonCode: buildTaskDeleteRetentionReasonCode(retention),
            message: buildTaskDeleteRetentionMessage(retention),
            summary: buildTaskDeleteRetentionSummary(current, retention),
          })
          continue
        }

        await deleteTaskInMainChain(taskId, projectId, actorId)
        await registerDatabasePostCommitEffect('persist_deleted_master_plan_visibility_feedback', async () => {
          await persistDeletedGeneratedMasterPlanVisibilityFeedback(current as unknown as Record<string, unknown>, actorId)
        })
        commitTaskStateById.delete(taskId)
        deletedTaskIds.add(taskId)
        deletionResults.push({
          rowId: taskId,
          action: 'deleted',
          retention: {
            reasonCode: retention.reasonCode ?? null,
            resolvedAction: retention.resolvedAction ?? null,
            executionMode: retention.executionMode ?? null,
          },
        })
        continue
      }

      if (operationType === 'move_row' || operationType === 'indent_row' || operationType === 'outdent_row') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        if (!taskId) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue
        const patch: Record<string, unknown> = {}
        if (operation.parentId !== undefined) patch.parent_id = resolveCommitRowId(operation.parentId) || null
        if (operation.sortOrder !== undefined) patch.sort_order = normalizeCommitNumber(operation.sortOrder)
        if (Object.keys(patch).length === 0) continue
        const result = await updateTaskInMainChain(taskId, { ...patch, updated_by: actorId } as Partial<Task>, current.version ?? undefined)
        rememberCommitTask(result?.task)
        markChanged(taskId, Object.keys(patch))
        continue
      }

      if (operationType === 'mark_milestone') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        if (!taskId) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue
        const isMilestone = normalizeCommitBoolean(operation.isMilestone)
        const result = await updateTaskInMainChain(taskId, {
          is_milestone: isMilestone,
          milestone_level: isMilestone ? Number(operation.milestoneLevel ?? 3) : null,
          updated_by: actorId,
        } as Partial<Task>, current.version ?? undefined)
        rememberCommitTask(result?.task)
        markChanged(taskId, ['is_milestone', 'milestone_level'])
        continue
      }

      if (operationType === 'set_predecessors') {
        const taskId = resolveCommitRowId(readOperationRowId(operation))
        if (!taskId) continue
        const current = await loadCommitTask(taskId)
        if (!current || String(current.project_id) !== projectId) continue
        const dependencySpecs = readOperationDependencySpecs(operation)
        const dependencyWrites = dependencySpecs.length > 0
          ? dependencySpecs
            .map((dependency) => ({
              ...dependency,
              dependencyTaskId: resolveCommitRowId(dependency.dependencyTaskId),
            }))
            .filter((dependency) => Boolean(dependency.dependencyTaskId))
          : (Array.isArray(operation.predecessorTaskIds)
              ? operation.predecessorTaskIds.map((value) => resolveCommitRowId(value)).filter(Boolean)
              : []
            ).map((dependencyTaskId) => ({
              dependencyTaskId,
              dependencyType: 'FS' as const,
              lagDays: 0,
              sourceType: 'manual',
              metadata: manualDependencyCorrectionMetadata(),
            }))
        await replaceTaskDependencies(taskId, dependencyWrites, {
          projectId,
          preserveCurrentTaskFacts: false,
        })
        markChanged(taskId, ['predecessor_task_ids'])
      }
      }

      if (changedTaskIds.size > 0 || deletedTaskIds.size > 0 || deletionResults.length > 0) {
        const auditPreview = buildPlanningTableCommitResponse({
          surface: 'task_list',
          resourceId: null,
          revision: Date.now(),
          rows: [],
          operations: body.operations,
          // eslint-disable-next-line -- route-level-aggregation-approved
          createdRowCount: tempIdMap.size,
          // eslint-disable-next-line -- route-level-aggregation-approved
          deletedRowCount: deletedTaskIds.size,
          // eslint-disable-next-line -- route-level-aggregation-approved
          changedRowCount: changedTaskIds.size + deletedTaskIds.size,
          deletionResults,
          validationIssues: validation.issues,
          criticalPathChangeSummary: emptyCriticalPathChangeSummary(),
          realtimeEvents: ['planning.table.changed', 'project.tasks.changed', 'task.changed'],
          tempIdMap,
        })
        await writeChangeLog({
          projectId,
          entityType: 'task_list',
          entityId: projectId,
          actionType: 'task_list_commit',
          actionGroup: 'edit',
          fieldName: 'planning_table_commit',
          oldValue: null,
          newValue: String(changedTaskIds.size + deletedTaskIds.size),
          changeSource: 'user_save',
          changedBy: actorId,
          requestId: requestId ?? undefined,
          visibility: 'user',
          metadata: {
            surface: 'task_list',
            source: 'task_list_commit',
            operationCount: body.operations.length,
            changedTaskIds: [...changedTaskIds],
            deletedTaskIds: [...deletedTaskIds],
            tempIdMap: Object.fromEntries(tempIdMap.entries()),
            deletionResults,
            governanceSummary: auditPreview.data.governanceSummary,
            mergeGroupSummary: summarizePlanningTableMergeGroups(body.operations),
            criticalPathChangeSummary: emptyCriticalPathChangeSummary(),
          },
        })
      }

      completedSummary = buildTaskCommitReplaySummary({
        changedTaskIds,
        deletedTaskIds,
        tempIdMap,
        deletionResults,
      })
      await completeTaskCommitRequest({
        projectId,
        requestId,
        requestHash,
        summary: completedSummary,
      })
    })

    const tasks = await supabase.getTasks(projectId)
    const sortedTasks = [...tasks].sort(compareTimelineOrder)
    const decoratedTasks = await decorateTasksWithParticipantUnits(sortedTasks)
    const dependencyProjectedTasks = await attachTaskDependencyProjection(decoratedTasks, projectId)
    const rows = attachTasksLagStatus(dependencyProjectedTasks)
    const responseRows = await Promise.all(rows.map(async (task) => sanitizeTaskForClient(
      await buildStandardDTO(task as unknown as Record<string, unknown>, { mode: 'list' }),
    ) as unknown as TaskWithLagStatus))
    const revision = Date.now()
    const criticalPathChangeSummary = replaySummary
      ? emptyCriticalPathChangeSummary()
      : await summarizeCriticalPathChangeAfterTaskCommit(
        projectId,
        previousCriticalPathTaskIds,
      )
    const responseSummary = replaySummary ?? completedSummary ?? {
      createdRowCount: 0,
      deletedRowCount: 0,
      changedRowCount: 0,
      tempIdMap: {},
      deletionResults: [],
    }
    const commitResponse = buildPlanningTableCommitResponse({
      surface: 'task_list',
      resourceId: null,
      revision,
      rows: responseRows,
      operations: body.operations,
      // eslint-disable-next-line -- route-level-aggregation-approved
      createdRowCount: responseSummary.createdRowCount,
      // eslint-disable-next-line -- route-level-aggregation-approved
      deletedRowCount: responseSummary.deletedRowCount,
      // eslint-disable-next-line -- route-level-aggregation-approved
      changedRowCount: responseSummary.changedRowCount,
      deletionResults,
      validationIssues: validation.issues,
      criticalPathChangeSummary,
      realtimeEvents: replaySummary
        ? []
        : ['planning.table.changed', 'project.tasks.changed', 'task.changed'],
      tempIdMap,
    })
    commitResponse.requestId = requestId
    commitResponse.idempotentReplay = Boolean(replaySummary)
    commitResponse.data.requestId = requestId
    commitResponse.data.idempotentReplay = Boolean(replaySummary)

    if (!replaySummary && (changedTaskIds.size > 0 || deletedTaskIds.size > 0)) {
      clearTaskProgressSnapshotsCache(projectId)
    }

    if (!replaySummary) {
      broadcastProjectTasksChanged({
        projectId,
        changedTaskIds: [...changedTaskIds],
        deletedTaskIds: [...deletedTaskIds],
        source: 'task_list_commit',
        revision,
      })
      broadcastPlanningTableChanged({
        projectId,
        surface: 'task_list',
        resourceId: null,
        changedRowIds: [...changedTaskIds],
        deletedRowIds: [...deletedTaskIds],
        source: 'task_list_commit',
        revision,
      })
      for (const [taskId, fields] of changedFieldsByTaskId.entries()) {
        broadcastTaskChanged({
          projectId,
          taskId,
          changedFields: [...fields],
          source: 'task_list_commit',
          revision,
        })
      }
    }

    res.json(commitResponse satisfies ApiResponse)
  } catch (error: any) {
    const statusCode = Number(error?.statusCode ?? 500)
    return res.status(statusCode).json({
      success: false,
      error: {
        code: error?.code ?? 'TASK_COMMIT_FAILED',
        message: error?.message ?? '任务表格保存失败',
      },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
}))

// v1.4.4 middleware: reject task_code fields before validation
function rejectTaskCodeMiddleware(req: any, res: any, next: any) {
  const err = rejectTaskCodeFields(req.body)
  if (err) return res.status(400).json({ success: false, error: { code: 'TASK_CODE_FIELD_FORBIDDEN', message: err }, timestamp: new Date().toISOString() })
  next()
}

// 创建任务
router.post('/', requireProjectEditor(req => req.body.project_id), rejectTaskCodeMiddleware, validate(taskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task', { body: req.body, project_id: req.body.project_id, title: req.body.title })

  // 修复：确保 created_by 为有效 UUID 或 null，删除空字符串/undefined
  const taskBody = stripTaskRequestOnlyFields({ ...req.body })
  if (!taskBody.created_by && !taskBody.user_id) {
    delete taskBody.created_by
    delete taskBody.user_id
  }

  try {
    const { task, participantUnit } = await createTaskInMainChain({
      ...taskBody,
      created_by: req.user?.id,
    }, req.user?.id ?? null)
    const responseTask = await decorateTaskResponse({
      ...task,
      participant_unit_id: participantUnit?.id ?? task.participant_unit_id ?? null,
      participant_unit_name: participantUnit?.unit_name ?? task.participant_unit_name ?? null,
    })
    broadcastTaskApiWrite({
      projectId: task.project_id,
      taskId: task.id,
      changedFields: Object.keys(taskBody),
    })
  
    const response: ApiResponse<TaskWithLagStatus> = {
      success: true,
      data: responseTask,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  } catch (err) {
    logger.error('创建任务失败', { 
      error: (err as Error).message,
      stack: (err as Error).stack,
      taskBody: JSON.stringify(taskBody),
    })
    throw err
  }
}))

// 更新任务
router.put('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), rejectTaskCodeMiddleware, validate(taskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params

  const { version } = req.body
  const updates = stripTaskRequestOnlyFields({ ...req.body })
  delete updates.version
  delete updates.force
  const appliedUpdates = { ...updates, updated_by: req.user?.id }

  logger.info('Updating task', { id, version })

  try {
    // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
    const oldTask = await supabase.getTask(id)
    const mergedDateValidation = validateTaskDateWindow(
      {
        planned_start_date: 'planned_start_date' in updates
          ? updates.planned_start_date
          : oldTask?.planned_start_date ?? oldTask?.start_date ?? null,
        start_date: 'start_date' in updates
          ? updates.start_date
          : oldTask?.start_date ?? oldTask?.planned_start_date ?? null,
        planned_end_date: 'planned_end_date' in updates
          ? updates.planned_end_date
          : oldTask?.planned_end_date ?? oldTask?.end_date ?? null,
        end_date: 'end_date' in updates
          ? updates.end_date
          : oldTask?.end_date ?? oldTask?.planned_end_date ?? null,
      },
      { requireBothDates: true },
    )
    if (!mergedDateValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: mergedDateValidation.issues[0]?.message || '任务日期校验失败',
          details: mergedDateValidation.issues,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const result = await updateTaskInMainChain(id, appliedUpdates, version)
    const task = result?.task ?? null
    const participantUnit = result?.participantUnit ?? null

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const responseTask = await decorateTaskResponse({
      ...task,
      participant_unit_id: participantUnit?.id ?? task.participant_unit_id ?? null,
      participant_unit_name: participantUnit?.unit_name ?? task.participant_unit_name ?? null,
    })
    broadcastTaskApiWrite({
      projectId: task.project_id,
      taskId: task.id,
      changedFields: Object.keys(updates),
    })

    const response: ApiResponse<TaskWithLagStatus> = {
      success: true,
      data: responseTask,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    if (
      error?.code === 'TASK_CONDITIONS_UNMET'
      || error?.code === 'TASK_REOPEN_REQUIRED'
      || error?.code === 'TASK_REOPEN_NOT_ALLOWED'
      || error?.code === 'TASK_REOPEN_PROGRESS_REQUIRED'
      || error?.code === 'TASK_REOPEN_PROGRESS_INVALID'
      || error?.code === 'INVALID_TASK_PROGRESS'
      || error?.statusCode === 422
      || error?.statusCode === 400
    ) {
      const response: ApiResponse = {
        success: false,
        error: { code: error.code || 'TASK_UPDATE_REJECTED', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode || 422).json(response)
    }

    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

router.post('/:id/actual-time-correction', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), validate(actualTimeCorrectionSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const body = req.body as z.infer<typeof actualTimeCorrectionSchema>
  const patch: Record<string, unknown> = {
    updated_by: req.user?.id,
  }
  for (const field of ['actual_start_date', 'actual_end_date', 'first_progress_at'] as const) {
    if (body[field] !== undefined) {
      const value = String(body[field] ?? '').trim()
      patch[field] = value || null
    }
  }

  const eventDate = String(
    patch.actual_end_date
    ?? patch.actual_start_date
    ?? patch.first_progress_at
    ?? '',
  ).slice(0, 10) || null

  const result = await updateTaskInMainChain(id, patch as Partial<Task>, body.version, {
    executionFactIntent: ExecutionFactIntent.SystemBackfill,
    executionFactEventDate: eventDate,
    executionFactCorrectionReason: body.reason ?? null,
    allowManualActualDates: true,
  })
  const task = result?.task ?? null
  const participantUnit = result?.participantUnit ?? null

  if (!task) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const responseTask = await decorateTaskResponse({
    ...task,
    participant_unit_id: participantUnit?.id ?? task.participant_unit_id ?? null,
    participant_unit_name: participantUnit?.unit_name ?? task.participant_unit_name ?? null,
  })
  broadcastTaskApiWrite({
    projectId: task.project_id,
    taskId: task.id,
    changedFields: Object.keys(patch).filter((field) => field !== 'updated_by'),
  })

  const response: ApiResponse<TaskWithLagStatus> = {
    success: true,
    data: responseTask,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/batch-update', rejectTaskCodeMiddleware, validate(batchTaskUpdateSchema), requireProjectEditor(async (req) => {
  return req.body.project_id
}), asyncHandler(async (req, res) => {
  const {
    project_id: projectId,
    task_ids: taskIds,
    status,
    assignee_name: assigneeName,
    assignee_user_id: assigneeUserId,
    participant_unit_id: participantUnitId,
    dateShiftDays,
    idempotency_key: bodyIdempotencyKey,
  } = req.body as z.infer<typeof batchTaskUpdateSchema>

  logger.info('Batch updating tasks', {
    projectId,
    taskCount: taskIds.length,
    hasStatus: Boolean(status),
    hasAssignee: Boolean(assigneeUserId || assigneeName),
    hasParticipantUnit: Boolean(participantUnitId),
    dateShiftDays: Number(dateShiftDays ?? 0) || 0,
  })

  const uniqueTaskIds = [...new Set(taskIds)]
  const actorId = req.user?.id ?? null
  const headerIdempotencyKey = String(req.get('Idempotency-Key') ?? '').trim()
  if (headerIdempotencyKey.length > 200) {
    throw Object.assign(new Error('Idempotency-Key 不能超过 200 个字符'), {
      code: 'INVALID_IDEMPOTENCY_KEY',
      statusCode: 400,
    })
  }
  const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey || randomUUID()
  const job = await createTaskBatchUpdateJob({
    projectId,
    taskIds: uniqueTaskIds,
    requestedBy: actorId,
    idempotencyKey,
    status,
    assigneeName,
    assigneeUserId,
    participantUnitId,
    dateShiftDays,
  })
  if (job.status === 'pending' || job.status === 'running') {
    scheduleTaskBatchUpdateJob(job.id)
  }

  const response: ApiResponse = {
    success: true,
    data: {
      project_id: projectId,
      job_id: job.id,
      status: job.status,
      accepted_count: job.acceptedCount,
      updated_task_ids: [],
      updated_count: job.succeededCount,
      failed_count: job.failedCount,
      processing: job.status === 'pending' || job.status === 'running',
    },
    timestamp: new Date().toISOString(),
  }
  res.status(202).json(response)
}))

// 删除任务
router.delete('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task', { id })

  const existing = await supabase.getTask(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const protectionSummary = await loadTaskDeleteProtectionSummary(existing)
  if (protectionSummary) {
    return res.status(422).json(buildTaskDeleteProtectionResponse(existing, protectionSummary))
  }

  // v1.4.15: evaluate retention decision and write event record.
  const retention = await executeTaskDeleteRetention(existing, req.user?.id ?? null, {
    source: 'task_api_delete',
  })

  if (!isAutoPhysicalTaskDeleteRetention(retention)) {
    const { buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
    return res.status(buildRetentionBlockedHttpStatus(retention as any)).json({
      success: false,
      error: buildRetentionBlockedApiError(buildTaskDeleteRetentionMessage(retention), retention as any, {
        details: buildTaskDeleteRetentionSummary(existing, retention),
      }),
      timestamp: new Date().toISOString(),
    })
  }

  await deleteTaskInMainChain(id, String(existing.project_id), req.user?.id ?? null)
  await persistDeletedGeneratedMasterPlanVisibilityFeedback(
    existing as unknown as Record<string, unknown>,
    req.user?.id ?? null,
  )
  broadcastTaskApiWrite({
    projectId: existing.project_id,
    taskId: id,
    deleted: true,
  })

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/close', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }

  const existing = await supabase.getTask(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  logger.info('Closing task instead of deleting it', { id, version: version ?? existing.version })
  let closedTask: Task | null = null
  try {
    closedTask = (await closeTaskInMainChain(id, version ?? existing.version, req.user?.id ?? null))?.task ?? null
  } catch (error: any) {
    if (error?.message && String(error.message).includes('VERSION_MISMATCH')) {
      return res.status(409).json({
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      })
    }
    throw error
  }

  if (!closedTask) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const responseTask = await decorateTaskResponse(closedTask)
  broadcastTaskApiWrite({
    projectId: closedTask.project_id,
    taskId: closedTask.id,
    changedFields: ['status', 'progress'],
  })

  const response: ApiResponse<TaskWithLagStatus> = {
    success: true,
    data: responseTask,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/reopen', validateIdParam, requireProjectEditor(async (req) => {
  const task = await supabase.getTask(req.params.id)
  return task?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }

  const progress = Number(req.body?.progress)
  if (!Number.isInteger(progress) || progress < 0 || progress >= 100) {
    return res.status(400).json({
      success: false,
      error: { code: 'TASK_REOPEN_PROGRESS_INVALID', message: 'reopen 必须提供 0-99 的整数进度' },
      timestamp: new Date().toISOString(),
    })
  }

  const existing = await supabase.getTask(id)
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    })
  }

  let reopenedTask: Task | null = null
  try {
    reopenedTask = (await reopenTaskInMainChain(id, progress, version ?? existing.version, req.user?.id ?? null))?.task ?? null
  } catch (error: any) {
    if (error?.message && String(error.message).includes('VERSION_MISMATCH')) {
      return res.status(409).json({
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      })
    }
    if (error?.code || error?.statusCode) {
      return res.status(error.statusCode || 422).json({
        success: false,
        error: { code: error.code || 'TASK_REOPEN_FAILED', message: error.message || '任务 reopen 失败' },
        timestamp: new Date().toISOString(),
      })
    }
    throw error
  }

  if (!reopenedTask) {
    return res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    })
  }

  const responseTask = await decorateTaskResponse(reopenedTask)
  broadcastTaskApiWrite({
    projectId: reopenedTask.project_id,
    taskId: reopenedTask.id,
    changedFields: ['status', 'progress'],
  })

  res.json({
    success: true,
    data: responseTask,
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse<TaskWithLagStatus>)
}))

export default router
