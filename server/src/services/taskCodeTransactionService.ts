import { getClient } from '../database.js'
import { invalidateTaskReadCache } from './dbService.js'
import { randomUUID } from 'crypto'
import { buildSequenceKey, generateTaskCodeInTransaction, ensureProjectCodeInTransaction, shouldRegenerateTaskCode, type TaskCodeInput } from './taskCodeGenerationService.js'
import { bootstrapTaskCodeRuleInTransaction } from './taskCodeRuleService.js'
import { hasAnyScopeObjectId } from './engineeringObjectService.js'
import { createLineageBatchInTransaction, recordLineageInTransaction } from './dataLineageService.js'
import { mergeWbsTaskStructureGovernanceMetadata } from './wbsTaskStructureGovernancePipelineService.js'
import {
  recordChangedExecutionFacts,
  type ExecutionFactProjectionChange,
} from './executionFactGovernanceService.js'

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
  release?: () => void
}

export interface TaskExecutionFactWriteOptions {
  correctionReason?: string | null
}

const TASK_EXECUTION_FACT_FIELDS = [
  ['actual_start_date', 'task.actual_start_date'],
  ['actual_end_date', 'task.actual_end_date'],
  ['first_progress_at', 'task.first_progress_at'],
  ['progress', 'task.progress'],
  ['status', 'task.status'],
] as const

function normalizeTaskExecutionFactValue(field: typeof TASK_EXECUTION_FACT_FIELDS[number][0], value: unknown) {
  if (field === 'progress') return Number(value ?? 0)
  if (field === 'status') return String(value ?? 'todo').trim()
  if (value === undefined || value === null || value === '') return null
  if (field === 'first_progress_at') {
    const timestamp = new Date(String(value))
    return Number.isNaN(timestamp.getTime()) ? String(value) : timestamp.toISOString()
  }
  return String(value).trim()
}

function taskExecutionFactEffectiveAt(
  field: typeof TASK_EXECUTION_FACT_FIELDS[number][0],
  value: unknown,
  observedAt: string,
) {
  if (value === null) return observedAt
  if (field === 'actual_start_date' || field === 'actual_end_date') {
    return `${String(value)}T00:00:00.000Z`
  }
  if (field === 'first_progress_at') return String(value)
  return observedAt
}

function buildTaskExecutionFactChanges(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
  observedAt: string,
): ExecutionFactProjectionChange[] {
  return TASK_EXECUTION_FACT_FIELDS.map(([field, factType]) => {
    const previousValue = previous
      ? normalizeTaskExecutionFactValue(field, previous[field])
      : null
    const nextValue = normalizeTaskExecutionFactValue(field, next[field])
    return {
      factType,
      previousValue,
      nextValue,
      force: previous === null,
      effectiveAt: taskExecutionFactEffectiveAt(field, nextValue, observedAt),
    }
  })
}

async function recordTaskExecutionFactsInTransaction(
  client: TransactionClientLike,
  input: {
    taskId: string
    projectId: string
    previous: Record<string, unknown> | null
    next: Record<string, unknown>
    version: number
    actorId?: string | null
    observedAt: string
    correctionReason?: string | null
  },
) {
  await recordChangedExecutionFacts({
    projectId: input.projectId,
    entityType: 'task',
    entityId: input.taskId,
    sourceModule: 'taskCodeTransactionService',
    sourceMutationId: `task:${input.taskId}:version:${input.version}`,
    actorUserId: input.actorId ?? null,
    observedAt: input.observedAt,
    correctionReason: input.correctionReason ?? null,
    changes: buildTaskExecutionFactChanges(input.previous, input.next, input.observedAt),
  }, {
    queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const result = await client.query(sql, params)
      return (result.rows ?? []) as T[]
    },
    isTransactionActive: () => true,
  })
}

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

const WIZARD_BATCH_TASK_INSERT_CHUNK_SIZE = 5
const WIZARD_BATCH_HISTORY_INSERT_CHUNK_SIZE = 24
const WIZARD_BATCH_HISTORY_VALUE_TYPES = [
  'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'uuid', 'timestamptz', 'jsonb',
] as const
const WIZARD_BATCH_TASK_INSERT_QUERY_TIMEOUT_MS = readPositiveIntEnv(
  'WIZARD_BATCH_TASK_INSERT_QUERY_TIMEOUT_MS',
  15_000,
)

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

function buildLocalStatementTimeoutSql(timeoutMs: number) {
  const safeTimeoutMs = Math.max(1, Math.trunc(timeoutMs))
  return `SET LOCAL statement_timeout = '${safeTimeoutMs}ms'`
}

const TASK_CODE_FORBIDDEN_FIELDS = [
  'task_code', 'task_code_version', 'task_code_rule_id', 'task_code_generated_at',
] as const

export function rejectTaskCodeFields(payload: Record<string, unknown>): string | null {
  for (const field of TASK_CODE_FORBIDDEN_FIELDS) {
    if (payload[field] !== undefined) {
      return `TASK_CODE_FIELD_FORBIDDEN: 字段 ${field} 不允许前端传入`
    }
  }
  return null
}

export interface TransactionTaskInput {
  id?: string; project_id: string; title: string; description?: string | null
  status?: string; priority?: string; progress?: number
  parent_id?: string | null; wbs_level?: number; sort_order?: number
  start_date?: string | null; end_date?: string | null
  planned_start_date?: string | null; planned_end_date?: string | null
  assignee_user_id?: string | null; assignee_name?: string; participant_unit_id?: string | null
  // scope
  engineering_object_id?: string | null; phase_object_id?: string | null; section_object_id?: string | null
  building_object_id?: string | null; basement_object_id?: string | null; floor_object_id?: string | null
  physical_zone_object_id?: string | null; functional_area_object_id?: string | null
  // WBS
  engineering_category_id?: string | null; wbs_node_type?: string | null; wbs_path?: string | null
  is_leaf?: boolean | null; is_wbs_summary?: boolean | null; is_executable?: boolean | null
  standard_work_code?: string | null; standard_work_name?: string | null
  // standard
  progress_method?: string; completion_rule?: string
  drawing_required?: boolean; material_required?: boolean; acceptance_required?: boolean; quality_required?: boolean
  specialty_type?: string | null
  duration_contribution_mode?: string | null
  duration_calibration_source?: string | null; duration_provenance?: string | null
  template_id?: string | null; template_node_id?: string | null
  [key: string]: unknown
}

const TASK_COLUMNS = [
  'id','project_id','title','description','status','priority','progress',
  'parent_id','wbs_level','wbs_code','sort_order',
  'planned_start_date','planned_end_date','start_date','end_date',
  'actual_start_date','actual_end_date','first_progress_at',
  'assignee_user_id','assignee_name','participant_unit_id',
  'is_milestone','specialty_type','duration_contribution_mode','duration_calibration_source','duration_provenance',
  'engineering_object_id','phase_object_id','section_object_id','building_object_id','basement_object_id','floor_object_id','physical_zone_object_id','functional_area_object_id',
  'engineering_category_id','wbs_node_type','wbs_path','is_leaf','is_wbs_summary','is_executable',
  'standard_work_code','standard_work_name',
  'progress_method','completion_rule','drawing_required','material_required','acceptance_required','quality_required',
  'task_code','task_code_version','task_code_rule_id','task_code_generated_at',
  'standard_task_metadata','created_at','updated_at',
]

function stripLegacyTaskCacheFields(input: Record<string, unknown>) {
  const next = { ...input }
  delete next.dependencies
  delete next.is_critical
  return next
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function withFinalizedTaskCodeGovernance(input: TransactionTaskInput | Record<string, unknown>) {
  const metadata = readMetadataRecord((input as Record<string, unknown>).standard_task_metadata)
  const existingGovernance = readMetadataRecord(metadata.taskStructureGovernance)
  return {
    ...metadata,
    taskStructureGovernance: mergeWbsTaskStructureGovernanceMetadata(existingGovernance, {
      source: String(existingGovernance.source ?? ((input as Record<string, unknown>).template_id ? 'template_generate' : 'manual_task_write')),
      rollupApplied: Boolean(existingGovernance.rollupApplied),
      taskCodeFinalized: true,
      lineageExpected: Boolean(existingGovernance.lineageExpected || ((input as Record<string, unknown>).template_id && (input as Record<string, unknown>).template_node_id)),
    }),
  }
}

function createVersionMismatchError() {
  return Object.assign(new Error('VERSION_MISMATCH: 该任务已被他人修改，请刷新后重试'), {
    statusCode: 409,
    code: 'VERSION_MISMATCH',
  })
}

function createTaskReopenError(code: string, message: string, statusCode = 422) {
  return Object.assign(new Error(`${code}: ${message}`), {
    statusCode,
    code,
  })
}

function isCompletedTaskStatus(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized === 'completed'
    || normalized === '已完成'
    || normalized === 'task_completed'
    || normalized === 'milestone_completed'
}

function normalizeProgressValue(value: unknown, fallback = 0) {
  const progress = Number(value)
  return Number.isFinite(progress) ? progress : fallback
}

function applyCompletedTaskReopenGuard(
  previous: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  if (updates.status !== undefined && isCompletedTaskStatus(updates.status)) {
    updates.progress = 100
  }

  const wasCompleted = isCompletedTaskStatus(previous.status)
    || normalizeProgressValue(previous.progress) >= 100
    || Boolean(previous.actual_end_date)
  if (!wasCompleted) return

  const nextStatus = updates.status !== undefined
    ? String(updates.status ?? '')
    : String(previous.status ?? '')
  const nextProgress = updates.progress !== undefined
    ? normalizeProgressValue(updates.progress, normalizeProgressValue(previous.progress))
    : normalizeProgressValue(previous.progress)

  const requestsReopen =
    (updates.progress !== undefined && nextProgress < 100)
    || (updates.status !== undefined && !isCompletedTaskStatus(nextStatus))

  if (!requestsReopen) return

  throw Object.assign(
    new Error('TASK_REOPEN_REQUIRED: 任务已完成，回退进度必须通过专用 reopen 动作处理'),
    {
      statusCode: 422,
      code: 'TASK_REOPEN_REQUIRED',
    },
  )
}

function assertValidTaskProgress(payload: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'progress')) return
  const progress = Number(payload.progress)
  if (!Number.isFinite(progress) || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw Object.assign(new Error('TASK_PROGRESS_OUT_OF_RANGE: progress must be an integer between 0 and 100'), {
      statusCode: 400,
      code: 'TASK_PROGRESS_OUT_OF_RANGE',
    })
  }
  payload.progress = progress
}

function toChangeLogValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

function collectTaskFieldChanges(
  previous: Record<string, any>,
  next: Record<string, any>,
  updates: Record<string, unknown>,
) {
  const ignored = new Set(['updated_by'])
  const changes: Array<{ field: string; oldValue: string | number | boolean | null; newValue: string | number | boolean | null }> = []
  for (const field of Object.keys(updates)) {
    if (ignored.has(field)) continue
    const oldValue = toChangeLogValue(previous[field])
    const newValue = toChangeLogValue(next[field])
    if (oldValue === newValue) continue
    changes.push({ field, oldValue, newValue })
  }
  return changes
}

async function writeTaskChangeLogsInTransaction(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  params: {
    taskId: string
    projectId: string
    previous: Record<string, any>
    next: Record<string, any>
    updates: Record<string, unknown>
    actorId?: string | null
    changedAt: string
  },
) {
  const changes = collectTaskFieldChanges(params.previous, params.next, params.updates)
  for (const change of changes) {
    await client.query(
      `INSERT INTO change_logs (
        id, project_id, entity_type, entity_id, field_name, old_value, new_value,
        change_reason, changed_by, changed_at, change_source, action_type, action_group,
        before_snapshot, after_snapshot, metadata, visibility, retention_policy
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, 'task_update', 'edit',
        $12, $13, $14, 'internal', 'project_lifecycle'
      )`,
      [
        randomUUID(),
        params.projectId,
        'task',
        params.taskId,
        change.field,
        change.oldValue,
        change.newValue,
        'main_write_chain_update',
        params.actorId ?? null,
        params.changedAt,
        'user_save',
        JSON.stringify({ [change.field]: change.oldValue }),
        JSON.stringify({ [change.field]: change.newValue }),
        JSON.stringify({
          writer: 'taskCodeTransactionService.updateTaskWithCodeInTransaction',
          versionBefore: params.previous.version ?? null,
          versionAfter: Number(params.previous.version ?? 1) + 1,
        }),
      ],
    )
  }
}

function colValue(col: string, input: Record<string, unknown>, taskId: string, ts: string, taskCode: string, ruleVersion: string, ruleId: string | null): any {
  if (col === 'id') return taskId
  if (col === 'created_at' || col === 'updated_at') return ts
  if (col === 'task_code') return taskCode
  if (col === 'task_code_version') return ruleVersion
  if (col === 'task_code_rule_id') return ruleId
  if (col === 'task_code_generated_at') return ts
  if (col === 'standard_task_metadata') {
    const val = (input as any)[col]
    if (val === undefined || val === null) return JSON.stringify({})
    if (typeof val === 'string') return val
    return JSON.stringify(val)
  }
  if (col === 'progress_method') return (input as any)[col] ?? 'percent'
  if (col === 'completion_rule') return (input as any)[col] ?? 'progress_100'
  if (col === 'progress') return String((input as any)[col] ?? 0)
  if (col === 'status') return (input as any)[col] ?? 'todo'
  if (col === 'wbs_level') return (input as any)[col] ?? null
  if (col === 'sort_order') return (input as any)[col] ?? 0
  if (col === 'is_milestone') return String(Boolean((input as any)[col]))
  if (['drawing_required','material_required','acceptance_required','quality_required'].includes(col)) return String(Boolean((input as any)[col]))
  const val = (input as any)[col]
  if (val === undefined || val === null) return null
  if (typeof val === 'boolean') return String(val)
  return val
}

function taskCodeInputFromTask(input: TransactionTaskInput): TaskCodeInput {
  return {
    projectId: input.project_id,
    phaseObjectId: input.phase_object_id,
    sectionObjectId: input.section_object_id,
    buildingObjectId: input.building_object_id,
    basementObjectId: input.basement_object_id,
    floorObjectId: input.floor_object_id,
    physicalZoneObjectId: input.physical_zone_object_id,
    functionalAreaObjectId: input.functional_area_object_id,
    engineeringObjectId: input.engineering_object_id,
    engineeringCategoryId: input.engineering_category_id,
    standardWorkCode: input.standard_work_code,
  }
}

function collectTaskCodeScopeIds(rule: Record<string, any>, input: TaskCodeInput) {
  const scopeIds: string[] = []
  if (rule.include_phase && input.phaseObjectId) scopeIds.push(input.phaseObjectId)
  if (rule.include_section && input.sectionObjectId) scopeIds.push(input.sectionObjectId)
  if (rule.include_building && input.buildingObjectId) scopeIds.push(input.buildingObjectId)
  if (rule.include_zone && input.basementObjectId) scopeIds.push(input.basementObjectId)
  if (rule.include_floor && input.floorObjectId) scopeIds.push(input.floorObjectId)
  if (rule.include_zone && input.physicalZoneObjectId) scopeIds.push(input.physicalZoneObjectId)
  if (rule.include_zone && input.functionalAreaObjectId) scopeIds.push(input.functionalAreaObjectId)
  if (scopeIds.length === 0 && rule.include_building && input.engineeringObjectId) {
    scopeIds.push(input.engineeringObjectId)
  }
  return scopeIds
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

async function reserveTaskCodeSequencesInTransaction(
  client: TransactionClientLike,
  projectId: string,
  ruleId: string,
  seqLength: number,
  sequenceCounts: Map<string, number>,
) {
  const reservations = new Map<string, { next: number; end: number }>()
  const sequenceKeys = [...sequenceCounts.keys()]
  if (sequenceKeys.length === 0) {
    return {
      next() {
        throw Object.assign(new Error('No reserved task code sequence available'), {
          code: 'TASK_CODE_SEQUENCE_RESERVATION_EMPTY',
          statusCode: 500,
        })
      },
    }
  }

  await client.query(
    `INSERT INTO task_code_sequences (project_id, rule_id, sequence_key, current_value)
     SELECT $1, $2, unnest($3::text[]), 0
     ON CONFLICT (project_id, rule_id, sequence_key) DO NOTHING`,
    [projectId, ruleId, sequenceKeys],
  )
  const { rows = [] } = await client.query(
    `SELECT sequence_key, current_value FROM task_code_sequences
     WHERE project_id = $1 AND rule_id = $2 AND sequence_key = ANY($3::text[])
     FOR UPDATE`,
    [projectId, ruleId, sequenceKeys],
  )
  const currentBySequenceKey = new Map((rows as Array<{ sequence_key?: string | null; current_value?: number | string | null }>)
    .map((row) => [String(row.sequence_key ?? ''), Number(row.current_value ?? 0)]))
  const updateKeys: string[] = []
  const updateValues: number[] = []
  for (const sequenceKey of sequenceKeys) {
    const current = currentBySequenceKey.get(sequenceKey)
    if (!Number.isFinite(current)) {
      throw Object.assign(new Error('Reserved task code sequence was not found after insert'), {
        code: 'TASK_CODE_SEQUENCE_RESERVATION_NOT_FOUND',
        statusCode: 500,
      })
    }
    const end = Number(current) + Number(sequenceCounts.get(sequenceKey) ?? 0)
    updateKeys.push(sequenceKey)
    updateValues.push(end)
    reservations.set(sequenceKey, { next: Number(current) + 1, end })
  }
  await client.query(
    `UPDATE task_code_sequences AS seq
     SET current_value = reserved.current_value,
         updated_at = NOW()
     FROM (
       SELECT unnest($1::text[]) AS sequence_key,
              unnest($2::int[]) AS current_value
     ) AS reserved
     WHERE seq.project_id = $3
       AND seq.rule_id = $4
       AND seq.sequence_key = reserved.sequence_key`,
    [updateKeys, updateValues, projectId, ruleId],
  )
  return {
    next(sequenceKey: string) {
      const reservation = reservations.get(sequenceKey)
      if (!reservation || reservation.next > reservation.end) {
        throw Object.assign(new Error('Reserved task code sequence exhausted'), {
          code: 'TASK_CODE_SEQUENCE_RESERVATION_EXHAUSTED',
          statusCode: 500,
        })
      }
      const value = reservation.next
      reservation.next += 1
      return String(value).padStart(seqLength, '0')
    },
  }
}

export async function createTaskWithCodeInTransaction(
  input: TransactionTaskInput,
  actorId?: string | null,
): Promise<{ task: Record<string, unknown>; taskCode: string }> {
  assertValidTaskProgress(input as unknown as Record<string, unknown>)
  if (!hasAnyScopeObjectId(input as unknown as Record<string, unknown>)) {
    throw Object.assign(new Error('任务必须至少归属一个工程范围对象'), { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' })
  }

  const taskId = input.id || randomUUID()
  const client = await getClient()
  try {
    await client.query('BEGIN')

    // Generate project_code if needed
    await ensureProjectCodeInTransaction(client, input.project_id)

    // Bootstrap rule
    const rule = await bootstrapTaskCodeRuleInTransaction(client, input.project_id)

    // Generate task_code
    const taskCode = await generateTaskCodeInTransaction(client, {
      projectId: input.project_id,
      phaseObjectId: input.phase_object_id,
      sectionObjectId: input.section_object_id,
      buildingObjectId: input.building_object_id,
      basementObjectId: input.basement_object_id,
      floorObjectId: input.floor_object_id,
      physicalZoneObjectId: input.physical_zone_object_id,
      functionalAreaObjectId: input.functional_area_object_id,
      engineeringObjectId: input.engineering_object_id,
      engineeringCategoryId: input.engineering_category_id,
      standardWorkCode: input.standard_work_code,
    })

    const ts = new Date().toISOString()
    const ruleVersion = rule?.rule_version ?? 'v1'
    const ruleId = rule?.id ?? null
    input.standard_task_metadata = withFinalizedTaskCodeGovernance(input)

    // INSERT task
    const vals = TASK_COLUMNS.map(c => colValue(c, input as unknown as Record<string, unknown>, taskId, ts, taskCode, ruleVersion, ruleId))
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
    await client.query(`INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${placeholders})`, vals)

    // INSERT task_code_history
    await client.query(`INSERT INTO task_code_history (id, task_id, project_id, old_task_code, new_task_code, change_reason, changed_by, changed_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), taskId, input.project_id, null, taskCode, 'initial_generate', actorId ?? null, ts, JSON.stringify({ rule_version: ruleVersion })])

    // Lineage is tracked at template-node granularity per v1.4.6.
    if (input.template_id && input.template_node_id) {
      await recordLineageInTransaction(client, {
        projectId: input.project_id,
        sourceEntityType: 'wbs_template_node', sourceEntityId: input.template_node_id,
        relationType: 'generates',
        targetEntityType: 'task', targetEntityId: taskId,
        mappingStatus: 'active',
        metadata: { templateId: input.template_id },
      })
    }

    await recordTaskExecutionFactsInTransaction(client, {
      taskId,
      projectId: input.project_id,
      previous: null,
      next: input as unknown as Record<string, unknown>,
      version: 1,
      actorId,
      observedAt: ts,
    })

    await client.query('COMMIT')
    invalidateTaskReadCache(input.project_id)

    // Read back the created task
    const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2', [taskId, input.project_id])
    if (!rows[0]) throw new Error('Task not found after create')
    return { task: rows[0] as Record<string, unknown>, taskCode }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function createTasksWithCodeInWizardBatchTransaction(
  inputs: TransactionTaskInput[],
  actorId?: string | null,
  transactionClient?: TransactionClientLike | null,
): Promise<Array<{ task: Record<string, unknown>; taskCode: string }>> {
  if (inputs.length === 0) return []

  const projectIds = uniqueStrings(inputs.map((input) => input.project_id))
  if (projectIds.length !== 1) {
    throw Object.assign(new Error('Wizard batch task creation requires exactly one project'), {
      statusCode: 400,
      code: 'WIZARD_BATCH_PROJECT_SCOPE_INVALID',
    })
  }
  const projectId = projectIds[0]

  for (const input of inputs) {
    assertValidTaskProgress(input as unknown as Record<string, unknown>)
    if (!hasAnyScopeObjectId(input as unknown as Record<string, unknown>)) {
      throw Object.assign(new Error('任务必须至少归属一个工程范围对象'), { statusCode: 400, code: 'SCOPE_OBJECT_REQUIRED' })
    }
    input.id = input.id || randomUUID()
  }

  const client = transactionClient ?? await getClient()
  const ownsClient = !transactionClient
  try {
    if (ownsClient) await client.query('BEGIN')

    const projectCode = await ensureProjectCodeInTransaction(client, projectId)
    const rule = await bootstrapTaskCodeRuleInTransaction(client, projectId)
    const ruleVersion = rule?.rule_version ?? 'v1'
    const ruleId = rule?.id ?? null
    if (!ruleId) {
      throw Object.assign(new Error('Task code rule is missing id'), {
        statusCode: 500,
        code: 'TASK_CODE_RULE_INVALID',
      })
    }

    const taskCodeInputs = inputs.map(taskCodeInputFromTask)
    const allScopeIds = uniqueStrings(taskCodeInputs.flatMap((input) => collectTaskCodeScopeIds(rule, input)))
    const objectCodeMap = new Map<string, string>()
    if (allScopeIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id, object_code FROM engineering_objects WHERE id = ANY($1) AND project_id = $2`,
        [allScopeIds, projectId],
      )
      for (const row of rows as Array<{ id?: string | null; object_code?: string | null }>) {
        const id = String(row.id ?? '').trim()
        const code = String(row.object_code ?? '').trim()
        if (id && code) objectCodeMap.set(id, code)
      }
    }

    const categoryIds = uniqueStrings(taskCodeInputs.map((input) => input.standardWorkCode ? null : input.engineeringCategoryId))
    const categoryWorkCodeMap = new Map<string, string>()
    if (categoryIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id, standard_work_code FROM engineering_categories
         WHERE id = ANY($1) AND (project_id = $2 OR project_id IS NULL)`,
        [categoryIds, projectId],
      )
      for (const row of rows as Array<{ id?: string | null; standard_work_code?: string | null }>) {
        const id = String(row.id ?? '').trim()
        const code = String(row.standard_work_code ?? '').trim()
        if (id && code) categoryWorkCodeMap.set(id, code)
      }
    }

    const sequenceKeys = taskCodeInputs.map((input) => buildSequenceKey(input, ruleId))
    const sequenceCounts = new Map<string, number>()
    for (const key of sequenceKeys) sequenceCounts.set(key, (sequenceCounts.get(key) ?? 0) + 1)
    const sequenceReservation = await reserveTaskCodeSequencesInTransaction(
      client,
      projectId,
      ruleId,
      Number(rule.sequence_length ?? 3),
      sequenceCounts,
    )

    const ts = new Date().toISOString()
    const taskCodes = taskCodeInputs.map((input, index) => {
      const fragments: string[] = []
      if (rule.include_project) fragments.push(projectCode)
      const scopeIds = collectTaskCodeScopeIds(rule, input)
      for (const sid of scopeIds) {
        const code = objectCodeMap.get(sid)
        if (code) fragments.push(code)
      }
      if (rule.include_work_code) {
        const workCode = input.standardWorkCode
          || (input.engineeringCategoryId ? categoryWorkCodeMap.get(input.engineeringCategoryId) : null)
        if (workCode) fragments.push(String(workCode))
      }
      const prefix = fragments.join(rule.delimiter || '-')
      const seq = sequenceReservation.next(sequenceKeys[index])
      return prefix ? `${prefix}-${seq}` : seq
    })

    const insertedTaskRecords: Record<string, unknown>[] = []
    const taskInsertRows = inputs.map((input, inputIndex) => {
      input.standard_task_metadata = withFinalizedTaskCodeGovernance(input)
      const taskId = String(input.id)
      const taskCode = taskCodes[inputIndex]
      const rowValues = TASK_COLUMNS.map((column) => colValue(
        column,
        input as unknown as Record<string, unknown>,
        taskId,
        ts,
        taskCode,
        ruleVersion,
        ruleId,
      ))
      insertedTaskRecords.push(Object.fromEntries(
        TASK_COLUMNS.map((column, columnIndex) => [column, rowValues[columnIndex]]),
      ))
      return rowValues
    })
    await client.query(buildLocalStatementTimeoutSql(WIZARD_BATCH_TASK_INSERT_QUERY_TIMEOUT_MS))
    for (const rowChunk of chunkArray(taskInsertRows, WIZARD_BATCH_TASK_INSERT_CHUNK_SIZE)) {
      const valueGroups: string[] = []
      const values: unknown[] = []
      rowChunk.forEach((rowValues) => {
        const start = values.length + 1
        valueGroups.push(`(${rowValues.map((_, offset) => `$${start + offset}`).join(', ')})`)
        values.push(...rowValues)
      })
      await (client.query as any)({
        text: `INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES ${valueGroups.join(', ')}`,
        values,
        query_timeout: WIZARD_BATCH_TASK_INSERT_QUERY_TIMEOUT_MS,
      })
    }

    const historyInsertRows = inputs.map((input, index) => ([
        randomUUID(),
        input.id,
        projectId,
        null,
        taskCodes[index],
        'initial_generate',
        actorId ?? null,
        ts,
        JSON.stringify({ rule_version: ruleVersion, wizardBatch: true }),
      ]))
    for (const rowChunk of chunkArray(historyInsertRows, WIZARD_BATCH_HISTORY_INSERT_CHUNK_SIZE)) {
      const historyGroups: string[] = []
      const historyValues: unknown[] = []
      rowChunk.forEach((rowValues) => {
        const start = historyValues.length + 1
        historyGroups.push(`(${rowValues.map((_, offset) => (
          `$${start + offset}::${WIZARD_BATCH_HISTORY_VALUE_TYPES[offset]}`
        )).join(', ')})`)
        historyValues.push(...rowValues)
      })
      const projectScopeParameter = historyValues.length + 1
      await client.query(
        `INSERT INTO task_code_history (id, task_id, project_id, old_task_code, new_task_code, change_reason, changed_by, changed_at, metadata)
         SELECT history.id, history.task_id, history.project_id, history.old_task_code,
                history.new_task_code, history.change_reason, history.changed_by,
                history.changed_at, history.metadata
           FROM (VALUES ${historyGroups.join(', ')}) AS history(
             id, task_id, project_id, old_task_code, new_task_code,
             change_reason, changed_by, changed_at, metadata
           )
          WHERE history.project_id = $${projectScopeParameter}::uuid`,
        [...historyValues, projectId],
      )
    }

    const lineageLinks = inputs
      .filter((input) => input.template_id && input.template_node_id)
      .map((input) => ({
          projectId,
          sourceEntityType: 'wbs_template_node',
          sourceEntityId: String(input.template_node_id),
          relationType: 'generates',
          targetEntityType: 'task',
          targetEntityId: String(input.id),
          mappingStatus: 'active',
          metadata: { templateId: input.template_id, wizardBatch: true },
      }))
    if (lineageLinks.length > 0) {
      await createLineageBatchInTransaction(
        client,
        projectId,
        'wizard_task_generation',
        lineageLinks,
        actorId ?? undefined,
      )
    }

    for (const input of inputs) {
      await recordTaskExecutionFactsInTransaction(client, {
        taskId: String(input.id),
        projectId,
        previous: null,
        next: input as unknown as Record<string, unknown>,
        version: 1,
        actorId,
        observedAt: ts,
      })
    }

    if (ownsClient) await client.query('COMMIT')
    invalidateTaskReadCache(projectId)

    return inputs.map((input, index) => {
      const task = insertedTaskRecords[index]
      if (!task) throw new Error(`Task not found after wizard batch create: ${input.id}`)
      return { task, taskCode: taskCodes[index] }
    })
  } catch (err: any) {
    if (ownsClient) await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    if (ownsClient) client.release?.()
  }
}

export async function updateTaskWithCodeInTransaction(
  taskId: string,
  updates: Record<string, unknown>,
  expectedVersion?: number,
  actorId?: string | null,
  projectId?: string | null,
  executionFactOptions: TaskExecutionFactWriteOptions = {},
): Promise<{ task: Record<string, unknown>; taskCode: string }> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    throw Object.assign(new Error('Task update requires projectId'), { statusCode: 400, code: 'PROJECT_SCOPE_REQUIRED' })
  }
  const effectiveUpdates = stripLegacyTaskCacheFields(updates)
  assertValidTaskProgress(effectiveUpdates)
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('workbuddy.task_finalization_outbox_mode', 'canonical_inline', TRUE)")

    // Lock and read previous task
    const { rows: prevRows } = await client.query(
      'SELECT * FROM tasks WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [taskId, normalizedProjectId],
    )
    if (!prevRows[0]) throw Object.assign(new Error('Task not found'), { statusCode: 404 })
    const prev = prevRows[0] as Record<string, any>
    if (expectedVersion !== undefined && Number(prev.version ?? 1) !== Number(expectedVersion)) {
      throw createVersionMismatchError()
    }
    applyCompletedTaskReopenGuard(prev, effectiveUpdates)

    // Merge
    const merged = { ...prev, ...effectiveUpdates }
    const ts = new Date().toISOString()

    // Check if code regeneration is needed
    let taskCode = prev.task_code
    let ruleVersion = prev.task_code_version ?? 'v1'
    let ruleId = prev.task_code_rule_id ?? null

    if (shouldRegenerateTaskCode(prev, merged)) {
      const oldCode = prev.task_code
      const rule = await bootstrapTaskCodeRuleInTransaction(client, prev.project_id)
      const code = await generateTaskCodeInTransaction(client, {
        projectId: prev.project_id,
        phaseObjectId: merged.phase_object_id,
        sectionObjectId: merged.section_object_id,
        buildingObjectId: merged.building_object_id,
        basementObjectId: merged.basement_object_id,
        floorObjectId: merged.floor_object_id,
        physicalZoneObjectId: merged.physical_zone_object_id,
        functionalAreaObjectId: merged.functional_area_object_id,
        engineeringObjectId: merged.engineering_object_id,
        engineeringCategoryId: merged.engineering_category_id,
        standardWorkCode: merged.standard_work_code,
      })
      taskCode = code
      ruleVersion = rule?.rule_version ?? 'v1'
      ruleId = rule?.id ?? null

      // Update task_code fields on the merged record
      merged.task_code = code
      merged.task_code_version = ruleVersion
      merged.task_code_rule_id = ruleId
      merged.task_code_generated_at = ts

      // Write history
      await client.query(`INSERT INTO task_code_history (id, task_id, project_id, old_task_code, new_task_code, change_reason, changed_by, changed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [randomUUID(), taskId, prev.project_id, oldCode ?? null, code, 'scope_changed', actorId ?? null, ts,
          JSON.stringify({ oldTaskCodeVersion: prev.task_code_version, newTaskCodeVersion: ruleVersion, oldRuleId: prev.task_code_rule_id })])
    }
    ;(effectiveUpdates as Record<string, unknown>).standard_task_metadata = withFinalizedTaskCodeGovernance(merged)

    // UPDATE task
    const updateKeys = Object.keys(effectiveUpdates)
    const setClauses = updateKeys.map((k, i) => `${k} = $${i + 1}`)
    setClauses.push(`updated_at = $${updateKeys.length + 1}`)
    setClauses.push(`version = version + 1`)
    const setVals = [...updateKeys.map(k => (effectiveUpdates as any)[k] ?? null), ts]
    setVals.push(taskId, prev.project_id)
    const whereClauses = [`id = $${setVals.length - 1}`, `project_id = $${setVals.length}`]
    if (expectedVersion !== undefined) {
      setVals.push(expectedVersion)
      whereClauses.push(`version = $${setVals.length}`)
    }
    const updateResult = await client.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`,
      setVals,
    )
    if ((updateResult?.rowCount ?? 0) === 0) throw createVersionMismatchError()
    await writeTaskChangeLogsInTransaction(client, {
      taskId,
      projectId: prev.project_id,
      previous: prev,
      next: merged,
      updates: effectiveUpdates,
      actorId,
      changedAt: ts,
    })

    // If code changed, update code fields separately
    if (taskCode !== prev.task_code) {
      await client.query(
        'UPDATE tasks SET task_code = $1, task_code_version = $2, task_code_rule_id = $3, task_code_generated_at = $4 WHERE id = $5 AND project_id = $6',
        [taskCode, ruleVersion, ruleId, ts, taskId, prev.project_id],
      )
    }

    await recordTaskExecutionFactsInTransaction(client, {
      taskId,
      projectId: String(prev.project_id),
      previous: prev,
      next: merged,
      version: Number(prev.version ?? 1) + 1,
      actorId,
      observedAt: ts,
      correctionReason: executionFactOptions.correctionReason,
    })

    await client.query('COMMIT')
    invalidateTaskReadCache(prev.project_id)

    const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2', [taskId, prev.project_id])
    return { task: rows[0] as Record<string, unknown>, taskCode }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function reopenTaskWithCodeInTransaction(
  taskId: string,
  progress: number,
  expectedVersion?: number,
  actorId?: string | null,
  projectId?: string | null,
): Promise<{ task: Record<string, unknown>; taskCode: string }> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    throw createTaskReopenError('PROJECT_SCOPE_REQUIRED', 'Task reopen requires projectId', 400)
  }
  const normalizedProgress = Number(progress)
  if (!Number.isFinite(normalizedProgress) || !Number.isInteger(normalizedProgress) || normalizedProgress < 0 || normalizedProgress >= 100) {
    throw createTaskReopenError('TASK_REOPEN_PROGRESS_INVALID', 'reopen 后的任务进度必须是 0-99 的整数', 400)
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('workbuddy.task_finalization_outbox_mode', 'canonical_inline', TRUE)")

    const { rows: prevRows } = await client.query(
      'SELECT * FROM tasks WHERE id = $1 AND project_id = $2 FOR UPDATE',
      [taskId, normalizedProjectId],
    )
    if (!prevRows[0]) throw Object.assign(new Error('Task not found'), { statusCode: 404 })

    const prev = prevRows[0] as Record<string, any>
    if (expectedVersion !== undefined && Number(prev.version ?? 1) !== Number(expectedVersion)) {
      throw createVersionMismatchError()
    }

    const wasCompleted = isCompletedTaskStatus(prev.status)
      || normalizeProgressValue(prev.progress) >= 100
      || Boolean(prev.actual_end_date)
    if (!wasCompleted) {
      throw createTaskReopenError('TASK_REOPEN_NOT_ALLOWED', '当前任务未处于已完成状态，不能执行 reopen')
    }

    const ts = new Date().toISOString()
    const effectiveUpdates: Record<string, unknown> = {
      progress: normalizedProgress,
      status: 'in_progress',
      actual_end_date: null,
      updated_by: actorId ?? null,
    }
    const merged = { ...prev, ...effectiveUpdates }
    ;(effectiveUpdates as Record<string, unknown>).standard_task_metadata = withFinalizedTaskCodeGovernance(merged)

    const updateKeys = Object.keys(effectiveUpdates)
    const setClauses = updateKeys.map((key, index) => `${key} = $${index + 1}`)
    setClauses.push(`updated_at = $${updateKeys.length + 1}`)
    setClauses.push(`version = version + 1`)
    const setVals = [...updateKeys.map((key) => effectiveUpdates[key] ?? null), ts]
    setVals.push(taskId, prev.project_id)
    const whereClauses = [`id = $${setVals.length - 1}`, `project_id = $${setVals.length}`]
    if (expectedVersion !== undefined) {
      setVals.push(expectedVersion)
      whereClauses.push(`version = $${setVals.length}`)
    }

    const updateResult = await client.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`,
      setVals,
    )
    if ((updateResult?.rowCount ?? 0) === 0) throw createVersionMismatchError()

    await writeTaskChangeLogsInTransaction(client, {
      taskId,
      projectId: String(prev.project_id),
      previous: prev,
      next: merged,
      updates: effectiveUpdates,
      actorId,
      changedAt: ts,
    })

    await recordTaskExecutionFactsInTransaction(client, {
      taskId,
      projectId: String(prev.project_id),
      previous: prev,
      next: merged,
      version: Number(prev.version ?? 1) + 1,
      actorId,
      observedAt: ts,
    })

    await client.query('COMMIT')
    invalidateTaskReadCache(prev.project_id)

    const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2', [taskId, prev.project_id])
    return { task: rows[0] as Record<string, unknown>, taskCode: String(prev.task_code ?? '') }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
