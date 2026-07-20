import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validateIdParam } from '../middleware/validation.js'
import { getClient, query as rawQuery } from '../database.js'
import { supabase } from '../services/dbService.js'
import { inclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'
import { planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'
import {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} from '../services/planningDraftLockService.js'
import {
  attachTaskFactSnapshots,
  recordBaselineSnapshotLineage,
} from '../services/planningSnapshotService.js'
import {
  evaluateBaselineConfirmationGate,
  evaluateBaselinePublishReadiness,
  evaluateProjectBaselineValidity,
  listRevisionPoolCandidates,
  PlanningRevisionPoolServiceError,
  startRevisionFromBaseline,
  submitObservationPoolItems,
} from '../services/planningRevisionPoolService.js'
import { writeLog } from '../services/changeLogs.js'
import { insertRowReturning, insertRowsReturning } from '../services/transactionInsertService.js'
import { annotateBaselineCriticalItems } from '../services/baselineGovernanceService.js'
import {
  prepareBaselineGenerationForBaseline,
  prepareBaselineGenerationForProject,
} from '../services/baselineGenerationService.js'
import {
  buildPlanningTableCommitResponse,
  buildFieldRegistryStaleResponse,
  isPlanningFieldRegistryVersionCurrent,
  summarizePlanningTableMergeGroups,
  summarizePlanningTableRealtimeRows,
} from '../services/planningTableCommitService.js'
import { broadcastPlanningTableChanged, broadcastProjectTasksChanged } from '../services/planningRealtimeEventService.js'
import {
  buildPlanningTableValidationErrorResponse,
  readPlanningTableOperationRowId as readCommitRowId,
  readPlanningTableOperationType as readCommitOperationType,
  readPlanningTableOperationValues as readCommitValues,
  validatePlanningTableCommitRequest,
} from '../services/planningTableValidationService.js'
import {
  buildTemplateGenerateCreateOperations,
  generateWbsTemplateRows,
  type WbsTemplateGenerationRuntimeArtifactPublication,
} from '../services/wbsTemplateGenerationService.js'
import {
  buildSpecialWorkDurationCandidateNodes,
} from '../services/wbsTemplateCandidateEventService.js'
import {
  persistDurationLearningRuntimeConsumptions,
} from '../services/durationLearningRuntimeConsumptionService.js'
import {
  buildWbsCandidateOutboxEvent,
  enqueueDurationLearningRuntimeEvidenceBatch,
} from '../services/durationLearningRuntimeEvidenceOutboxService.js'
import type {
  DurationLearningRuntimePublicationQueryExec,
} from '../services/durationLearningRuntimePublicationService.js'
import type { ApiResponse } from '../types/index.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import type {
  ObservationPoolReadResponse,
  ObservationPoolSubmitRequest,
  ObservationPoolSubmitResponse,
  PlanningTransitionContext,
  RevisionSubmitResponse,
} from '../types/planning.js'
import type { Milestone, PlanningDraftLockRecord, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'
import { getProjectCompanyId } from '../auth/access.js'
import {
  recordBaselinePublicationStructuredCause,
  STRUCTURED_CAUSE_TAXONOMY,
  type StructuredCauseCode,
} from '../services/structuredCauseAttributionService.js'

const router = Router()
const draftLockService = new PlanningDraftLockService()
const MAX_CREATE_ATTEMPTS = 3
const DRAFT_BASELINE_STATUSES = new Set(['draft', 'revising'])
const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])
const BUSINESS_VERSION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign', 'archived', 'closed'])
const BASELINE_DETAIL_CACHE_TTL_MS = 5000
const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已完成', '已满足', '已确认'])
const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])
const BASELINE_CHANGE_CAUSE_CODES = new Set<StructuredCauseCode>(
  STRUCTURED_CAUSE_TAXONOMY.map((entry) => entry.code),
)

type UniqueConstraintErrorLike = {
  code?: string
  message?: string
}

type TaskBaselineRowInput = Partial<TaskBaseline>

type TaskBaselineItemInput = Partial<TaskBaselineItem> & {
  id?: string
  name?: string | null
}

type BaselineDetailCacheEntry = {
  expiresAt: number
  baseline: TaskBaseline
  items: TaskBaselineItem[]
}

const baselineDetailCache = new Map<string, BaselineDetailCacheEntry>()

function getCachedBaselineDetail(id: string) {
  const cached = baselineDetailCache.get(id)
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached
}

function setCachedBaselineDetail(id: string, baseline: TaskBaseline, items: TaskBaselineItem[]) {
  baselineDetailCache.set(id, {
    expiresAt: Date.now() + BASELINE_DETAIL_CACHE_TTL_MS,
    baseline,
    items,
  })
}

function clearBaselineDetailCache(id?: string | null) {
  if (id) {
    baselineDetailCache.delete(id)
    return
  }
  baselineDetailCache.clear()
}

type PlanningCommitOperation = PlanningTableOperation

type TaskBaselineTaskRow = Pick<
  Task,
  | 'id'
  | 'parent_id'
  | 'title'
  | 'description'
  | 'project_id'
  | 'planned_start_date'
  | 'planned_end_date'
  | 'start_date'
  | 'end_date'
  | 'progress'
  | 'sort_order'
  | 'is_milestone'
  | 'baseline_item_id'
  | 'participant_unit_id'
  | 'assignee_user_id'
  | 'assignee_name'
  | 'engineering_object_id'
  | 'phase_object_id'
  | 'section_object_id'
  | 'building_object_id'
  | 'basement_object_id'
  | 'floor_object_id'
  | 'physical_zone_object_id'
  | 'functional_area_object_id'
  | 'template_id'
  | 'template_node_id'
  | 'wbs_code'
  | 'wbs_level'
  | 'engineering_category_id'
  | 'wbs_node_type'
  | 'wbs_path'
  | 'is_wbs_summary'
  | 'is_executable'
  | 'standard_work_code'
  | 'standard_work_name'
  | 'duration_calibration_source'
  | 'duration_provenance'
  | 'task_code'
  | 'task_code_version'
  | 'task_code_rule_id'
  | 'status'
>

type BaselineConditionRow = {
  is_satisfied?: boolean | number | string | null
  status?: string | null
}

type BaselineObstacleRow = {
  status?: string | null
}

type BaselineScheduleSummary = {
  total_items: number
  structure_items: number
  work_items: number
  top_level_items: number
  division_items: number
  subdivision_items: number
  construction_task_items: number
  milestone_items: number
  critical_path_items: number
  planned_start_date: string | null
  planned_end_date: string | null
  duration_days: number | null
}

const BASELINE_ITEM_SELECT = [
  'id',
  'project_id',
  'baseline_version_id',
  'parent_item_id',
  'source_task_id',
  'source_milestone_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'sort_order',
  'is_milestone',
  'is_critical',
  'is_baseline_critical',
  'mapping_status',
  'notes',
  'template_id',
  'template_node_id',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'source_chip',
  'source_reason',
  'missing_process_in_baseline',
  'scope_snapshot',
  'wbs_snapshot',
  'task_fact_snapshot',
  'task_code_snapshot',
  'status_snapshot',
  'snapshot_source',
  'snapshot_captured_at',
  'manual_override_fields',
  'generation_metadata',
  'last_generated_at',
  'created_at',
  'updated_at',
].join(',')

const BASELINE_ITEM_JSON_COLUMNS = [
  'scope_snapshot',
  'wbs_snapshot',
  'task_fact_snapshot',
  'status_snapshot',
  'manual_override_fields',
  'generation_metadata',
  'seed_versions',
] as const

type BaselineApiRow = TaskBaseline & {
  business_version_label?: string
  is_current_execution?: boolean
  summary?: BaselineScheduleSummary
}

router.use(authenticate)

function badRequest(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

type BaselinePublicationCause = {
  causeCode: StructuredCauseCode
  rawText: string
}

function parseBaselinePublicationCause(body: unknown):
  | { ok: true; value: BaselinePublicationCause }
  | { ok: false; code: string; message: string } {
  const payload = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
  const causeCode = typeof payload.cause_code === 'string' ? payload.cause_code.trim() : ''
  const rawText = typeof payload.change_reason === 'string' ? payload.change_reason.trim() : ''

  if (!causeCode || !rawText) {
    return {
      ok: false,
      code: 'BASELINE_CHANGE_CAUSE_REQUIRED',
      message: '发布项目基线前必须确认变更原因分类并保留原因原话。',
    }
  }
  if (!BASELINE_CHANGE_CAUSE_CODES.has(causeCode as StructuredCauseCode) || rawText.length > 4000) {
    return {
      ok: false,
      code: 'BASELINE_CHANGE_CAUSE_INVALID',
      message: '项目基线变更原因分类无效，或原因原话超过 4000 个字符。',
    }
  }

  return {
    ok: true,
    value: {
      causeCode: causeCode as StructuredCauseCode,
      rawText,
    },
  }
}

async function runInCurrentTransaction<T>(work: () => Promise<T>) {
  return work()
}

function normalizeBaselineRow(
  row: TaskBaselineRowInput,
  items: TaskBaselineItem[] = [],
  currentExecutionBaselineId?: string | null,
): BaselineApiRow & { items: TaskBaselineItem[] } {
  const normalizedRow = normalizeBaselineBusinessVersion(row as TaskBaseline)
  return {
    ...normalizedRow,
    business_version_label: formatBaselineBusinessVersionLabel(row),
    is_current_execution: Boolean(currentExecutionBaselineId && row.id === currentExecutionBaselineId),
    summary: buildBaselineScheduleSummary(items),
    items,
  }
}

function isDraftBaselineStatus(status?: string | null) {
  return DRAFT_BASELINE_STATUSES.has(String(status ?? '').trim())
}

function isBusinessVersionBaselineStatus(status?: string | null) {
  return BUSINESS_VERSION_BASELINE_STATUSES.has(String(status ?? '').trim())
}

function isCurrentExecutionBaselineStatus(status?: string | null) {
  return CURRENT_EXECUTION_BASELINE_STATUSES.has(String(status ?? '').trim())
}

function getNumericVersion(version?: number | string | null) {
  if (version == null || (typeof version === 'string' && version.trim() === '')) return null
  const value = Number(version)
  return Number.isFinite(value) ? value : null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  return text ? text.split(',').map((item) => normalizeText(item)).filter(Boolean) : []
}

function readBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true
  return ['true', '1', 'yes', 'y', '已复核', '确认'].includes(normalizeLower(value))
}

function isUuidLike(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function normalizeBaselineBusinessVersion<T extends Partial<TaskBaseline>>(row: T): T {
  return {
    ...row,
    version: isDraftBaselineStatus(row.status) ? null : (getNumericVersion(row.version) as any),
  }
}

function formatBaselineBusinessVersionLabel(row?: Pick<Partial<TaskBaseline>, 'version' | 'status'> | null) {
  if (!row) return 'no version'
  if (isDraftBaselineStatus(row.status)) return 'editing'
  const version = getNumericVersion(row.version)
  return version ? `v${version}` : 'no version'
}

function computeInclusiveDurationDays(startDate: string | null, endDate: string | null) {
  return inclusiveDurationDays(startDate, endDate)
}

function normalizeScheduleSummaryDate(value: unknown): { time: number; value: string } | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  const time = date.getTime()
  if (!Number.isFinite(time)) return null
  return {
    time,
    value: value instanceof Date ? date.toISOString() : String(value),
  }
}

function buildBaselineScheduleSummary(items: TaskBaselineItem[]): BaselineScheduleSummary {
  const byId = new Map(items.map((item) => [item.id, item]))
  const depthCache = new Map<string, number>()
  const resolveDepth = (item: TaskBaselineItem, seen = new Set<string>()): number => {
    if (depthCache.has(item.id)) return depthCache.get(item.id) ?? 1
    if (!item.parent_item_id || !byId.has(item.parent_item_id) || seen.has(item.id)) {
      depthCache.set(item.id, 1)
      return 1
    }
    seen.add(item.id)
    const parent = byId.get(item.parent_item_id)
    const depth = parent ? resolveDepth(parent, seen) + 1 : 1
    depthCache.set(item.id, depth)
    return depth
  }
  const childParentIds = new Set(
    items.map((item) => item.parent_item_id).filter((value): value is string => Boolean(value)),
  )
  const depthById = new Map(items.map((item) => [item.id, resolveDepth(item)]))
  const dateValues = items
    .flatMap((item) => [item.planned_start_date ?? null, item.planned_end_date ?? null])
    .map((value) => normalizeScheduleSummaryDate(value))
    .filter((value): value is { time: number; value: string } => Boolean(value))
    .sort((left, right) => left.time - right.time)
  const plannedStartDate = dateValues[0]?.value ?? null
  const plannedEndDate = dateValues[dateValues.length - 1]?.value ?? null
  // eslint-disable-next-line -- route-level-aggregation-approved
  const structureItems = items.filter((item) => childParentIds.has(item.id)).length

  return {
    total_items: items.length,
    structure_items: structureItems,
    work_items: Math.max(0, items.length - structureItems),
    // eslint-disable-next-line -- route-level-aggregation-approved
    top_level_items: items.filter((item) => !item.parent_item_id).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    division_items: items.filter((item) => (depthById.get(item.id) ?? 1) === 1 && childParentIds.has(item.id)).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    subdivision_items: items.filter((item) => (depthById.get(item.id) ?? 1) === 2).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    construction_task_items: items.filter((item) => {
      const depth = depthById.get(item.id) ?? 1
      return depth >= 3 || (depth === 1 && !childParentIds.has(item.id))
    }).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    milestone_items: items.filter((item) => Boolean(item.is_milestone)).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    critical_path_items: items.filter((item) => Boolean(item.is_critical || item.is_baseline_critical)).length,
    planned_start_date: plannedStartDate,
    planned_end_date: plannedEndDate,
    duration_days: computeInclusiveDurationDays(plannedStartDate, plannedEndDate),
  }
}

function mapBaselineItem(
  row: TaskBaselineItemInput,
  baselineVersionId: string,
  projectId: string,
  index: number,
): TaskBaselineItem {
  return {
    id: String(row.id ?? uuidv4()),
    project_id: projectId,
    baseline_version_id: baselineVersionId,
    parent_item_id: row.parent_item_id ?? null,
    source_task_id: row.source_task_id ?? null,
    source_milestone_id: row.source_milestone_id ?? null,
    title: String(row.title ?? `基线条目 ${index + 1}`),
    planned_start_date: row.planned_start_date ?? null,
    planned_end_date: row.planned_end_date ?? null,
    target_progress: row.target_progress ?? null,
    sort_order: Number(row.sort_order ?? index),
    is_milestone: Boolean(row.is_milestone),
    is_critical: Boolean(row.is_critical),
    is_baseline_critical: Boolean(row.is_baseline_critical),
    mapping_status: row.mapping_status ?? 'mapped',
    notes: row.notes ?? null,
    template_id: row.template_id ?? null,
    template_node_id: row.template_node_id ?? null,
    engineering_category_id: row.engineering_category_id ?? null,
    wbs_node_type: row.wbs_node_type ?? null,
    wbs_path: row.wbs_path ?? null,
    is_wbs_summary: row.is_wbs_summary ?? null,
    is_executable: row.is_executable ?? null,
    standard_work_code: row.standard_work_code ?? null,
    standard_work_name: row.standard_work_name ?? null,
    duration_calibration_source: row.duration_calibration_source ?? null,
    duration_provenance: row.duration_provenance ?? null,
    source_chip: row.source_chip ?? null,
    source_reason: row.source_reason ?? null,
    missing_process_in_baseline: row.missing_process_in_baseline ?? null,
    scope_snapshot: row.scope_snapshot ?? {},
    wbs_snapshot: row.wbs_snapshot ?? {},
    task_fact_snapshot: row.task_fact_snapshot ?? {},
    task_code_snapshot: row.task_code_snapshot ?? null,
    status_snapshot: row.status_snapshot ?? {},
    snapshot_source: row.snapshot_source ?? 'current_execution_fact',
    snapshot_captured_at: row.snapshot_captured_at ?? null,
    manual_override_fields: row.manual_override_fields ?? {},
    generation_metadata: row.generation_metadata ?? {},
    last_generated_at: row.last_generated_at ?? null,
    seed_versions: row.seed_versions ?? [],
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }
}

function normalizeBaselineCommitField(field: string, value: unknown): Record<string, unknown> {
  if (field === 'start' || field === 'start_date') return { planned_start_date: value || null }
  if (field === 'end' || field === 'end_date') return { planned_end_date: value || null }
  if (field === 'milestone') return { is_milestone: Boolean(value) }
  return { [field]: value === '' ? null : value }
}

function normalizeBaselineCommitValues(values: Record<string, unknown>) {
  return Object.entries(values).reduce<Record<string, unknown>>((patch, [field, value]) => {
    Object.assign(patch, normalizeBaselineCommitField(field, value))
    return patch
  }, {})
}

function removeBaselineItemWithDescendants(items: TaskBaselineItemInput[], rowId: string) {
  const removedIds = new Set<string>([rowId])
  let changed = true
  while (changed) {
    changed = false
    for (const item of items) {
      const itemId = String(item.id ?? '').trim()
      if (!itemId || removedIds.has(itemId)) continue
      if (item.parent_item_id && removedIds.has(item.parent_item_id)) {
        removedIds.add(itemId)
        changed = true
      }
    }
  }
  return items.filter((item) => !removedIds.has(String(item.id ?? '').trim()))
}

function applyBaselineCommitOperations(
  currentItems: TaskBaselineItem[],
  operations: PlanningCommitOperation[],
) {
  const tempIdMap = new Map<string, string>()
  let items: TaskBaselineItemInput[] = currentItems.map((item) => ({ ...item }))
  const resolveRowId = (value: unknown) => {
    const rowId = String(value ?? '').trim()
    return rowId ? tempIdMap.get(rowId) ?? rowId : ''
  }

  for (const operation of operations) {
    const operationType = readCommitOperationType(operation)

    if (operationType === 'create_row') {
      const clientRowId = String(operation.clientRowId ?? operation.tempId ?? '').trim()
      const generatedId = isUuidLike(clientRowId) ? clientRowId : uuidv4()
      if (clientRowId) tempIdMap.set(clientRowId, generatedId)
      const values = normalizeBaselineCommitValues(readCommitValues(operation))
      items.push({
        ...values,
        id: generatedId,
        parent_item_id: operation.parentId === undefined ? (values.parent_item_id as string | null | undefined) ?? null : String(operation.parentId ?? '').trim() || null,
        sort_order: Number.isFinite(Number(operation.sortOrder)) ? Number(operation.sortOrder) : items.length,
      } as TaskBaselineItemInput)
      continue
    }

    if (operationType === 'delete_row') {
      const rowId = resolveRowId(readCommitRowId(operation))
      if (rowId) items = removeBaselineItemWithDescendants(items, rowId)
      continue
    }

    const rowId = resolveRowId(readCommitRowId(operation))
    if (!rowId) continue

    items = items.map((item) => {
      if (String(item.id ?? '') !== rowId) return item

      if (operationType === 'update_cell') {
        const field = String(operation.field ?? '').trim()
        return field ? { ...item, ...normalizeBaselineCommitField(field, operation.value) } : item
      }

      if (operationType === 'update_row') {
        return { ...item, ...normalizeBaselineCommitValues(readCommitValues(operation)) }
      }

      if (operationType === 'move_row' || operationType === 'indent_row' || operationType === 'outdent_row') {
        const parentId = operation.parentId !== undefined ? resolveRowId(operation.parentId) || null : undefined
        return {
          ...item,
          ...(operation.parentId !== undefined ? { parent_item_id: parentId } : {}),
          ...(operation.sortOrder !== undefined && Number.isFinite(Number(operation.sortOrder))
            ? { sort_order: Number(operation.sortOrder) }
            : {}),
        }
      }

      if (operationType === 'mark_milestone') {
        return { ...item, is_milestone: Boolean(operation.isMilestone) }
      }

      return item
    })
  }

  const normalizedItems = items.map((item, index) => ({
    ...item,
    parent_item_id: item.parent_item_id && tempIdMap.has(item.parent_item_id)
      ? tempIdMap.get(item.parent_item_id) ?? null
      : item.parent_item_id ?? null,
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
  }))

  return { items: normalizedItems, tempIdMap }
}

async function expandBaselineTemplateGenerateOperations(
  projectId: string,
  operations: PlanningCommitOperation[],
  runtimePublicationQueryExec: DurationLearningRuntimePublicationQueryExec,
) {
  const expanded: PlanningCommitOperation[] = []
  const generationContexts: Array<{
    operation: PlanningCommitOperation
    generated: Awaited<ReturnType<typeof generateWbsTemplateRows>>
    runtimeArtifactPublications: WbsTemplateGenerationRuntimeArtifactPublication[]
  }> = []
  for (const operation of operations) {
    if (readCommitOperationType(operation) !== 'template_generate') {
      expanded.push(operation)
      continue
    }

    const runtimeArtifactPublications: WbsTemplateGenerationRuntimeArtifactPublication[] = []
    const generated = await generateWbsTemplateRows({
      projectId,
      surface: 'baseline',
      runtimeEvidenceMode: 'no_write',
      operation,
      runtimePublicationQueryExec,
      runtimeArtifactPublications,
    })
    generationContexts.push({ operation, generated, runtimeArtifactPublications })
    logGeneratedTemplateRowsRenderBudget(generated.rows, operation, projectId)
    expanded.push(
      ...buildTemplateGenerateCreateOperations(generated.rows)
        .filter((item) => readCommitOperationType(item) === 'create_row')
        .map((item) => {
          const values = readCommitValues(item)
          return {
            ...item,
            values: {
              ...values,
              target_progress: values.target_progress ?? values.progress ?? 0,
              mapping_status: values.mapping_status ?? 'pending',
            },
          }
        }),
    )
  }
  return { operations: expanded, generationContexts }
}


function logGeneratedTemplateRowsRenderBudget(
  rows: Array<{ values?: Record<string, unknown> }>,
  operation: PlanningCommitOperation,
  projectId?: string,
) {
  const rawBatchesForBudget = Array.isArray(operation.generationBatches)
    ? operation.generationBatches
    : Array.isArray(operation.generation_batches)
      ? operation.generation_batches
      : []
  const normalizedBatches = rawBatchesForBudget.map((batch) => (
    batch && typeof batch === 'object' && !Array.isArray(batch)
      ? batch as Record<string, unknown>
      : {}
  ))
  const rowLimit = normalizedBatches
    .map((batch) => Number(batch.rowLimit ?? batch.row_limit))
    .find((value) => Number.isFinite(value) && value > 0)
    ?? 500
  const exceedsOperationBudget = normalizedBatches.some((batch) => (
    batch.rowLimitExceeded === true || batch.row_limit_exceeded === true
  ))
  if (rows.length > rowLimit || exceedsOperationBudget) {
    logger.warn('[task-baselines] template generation exceeds render budget; committing full generated rows', {
      projectId: projectId ?? null,
      generatedRowCount: rows.length,
      rowLimit,
      rowLimitPolicy: operation.rowLimitPolicy ?? operation.row_limit_policy ?? null,
      generationBatchId: operation.generationBatchId ?? operation.generation_batch_id ?? null,
    })
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as UniqueConstraintErrorLike
  const message = String(candidate.message ?? '')
  return candidate.code === '23505' || /duplicate key|unique constraint/i.test(message)
}

async function getNextBusinessVersion(projectId: string, ignoreBaselineId?: string | null): Promise<number> {
  const baselines = await listProjectBaselines(projectId)
  // eslint-disable-next-line -- route-level-aggregation-approved
  const latest = baselines.reduce((max, baseline) => {
    if (ignoreBaselineId && baseline.id === ignoreBaselineId) return max
    if (!isBusinessVersionBaselineStatus(baseline.status)) return max
    const version = getNumericVersion(baseline.version)
    return version == null ? max : Math.max(max, version)
  }, 0)
  return latest + 1
}

async function getBaselineItems(baselineId: string, projectId?: string | null): Promise<TaskBaselineItem[]> {
  const resolvedProjectId = projectId ?? (await getBaselineRecord(baselineId))?.project_id ?? null
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = resolvedProjectId
        ? await rawQuery(
            `SELECT ${BASELINE_ITEM_SELECT}
               FROM public.task_baseline_items
              WHERE baseline_version_id = $1
                AND project_id = $2
              ORDER BY sort_order ASC`,
            [baselineId, resolvedProjectId],
          )
        : await rawQuery(
            `SELECT ${BASELINE_ITEM_SELECT}
               FROM public.task_baseline_items
              WHERE baseline_version_id = $1
              ORDER BY sort_order ASC`,
            [baselineId],
          )
      return attachBaselineEngineeringCategoryInfo(result.rows as TaskBaselineItem[])
    } catch (error) {
      logger.warn('[task-baselines] direct baseline item read failed, falling back to Supabase REST', {
        baselineId,
        projectId: resolvedProjectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let query = supabase
    .from('task_baseline_items')
    .select(BASELINE_ITEM_SELECT)
    .eq('baseline_version_id', baselineId)

  if (resolvedProjectId) {
    query = query.eq('project_id', resolvedProjectId)
  }

  query = query.order('sort_order', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return attachBaselineEngineeringCategoryInfo(((data ?? []) as unknown) as TaskBaselineItem[])
}

async function getBaselineItemsWithClient(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  baselineId: string,
  projectId: string,
): Promise<TaskBaselineItem[]> {
  const result = await client.query(
    `SELECT ${BASELINE_ITEM_SELECT}
       FROM public.task_baseline_items
      WHERE baseline_version_id = $1
        AND project_id = $2
      ORDER BY sort_order ASC`,
    [baselineId, projectId],
  )
  return attachBaselineEngineeringCategoryInfo(result.rows as TaskBaselineItem[])
}

async function attachBaselineEngineeringCategoryInfo(items: TaskBaselineItem[]): Promise<TaskBaselineItem[]> {
  const categoryIds = Array.from(new Set(
    items
      .map((item) => item.engineering_category_id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  ))
  if (categoryIds.length === 0) return items

  let categories: Array<{ id: string; category_type?: string | null; category_name?: string | null }> = []
  if (process.env.NODE_ENV !== 'test') {
    try {
      const placeholders = categoryIds.map((_, index) => `$${index + 1}`).join(', ')
      const result = await rawQuery(
        `SELECT id, category_type, category_name FROM public.engineering_categories WHERE id IN (${placeholders})`,
        categoryIds,
      )
      categories = result.rows as Array<{ id: string; category_type?: string | null; category_name?: string | null }>
    } catch (error) {
      logger.warn('[task-baselines] direct engineering category read failed, falling back to Supabase REST', {
        categoryCount: categoryIds.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (categories.length === 0) {
    const { data, error } = await supabase
      .from('engineering_categories')
      .select('id, category_type, category_name')
      .in('id', categoryIds)
    if (error) throw error
    categories = data ?? []
  }

  const categoriesById = new Map(categories.map((category) => [
    String(category.id),
    {
      engineering_category_type: category.category_type as string | null,
      engineering_category_name: category.category_name as string | null,
    },
  ]))

  return items.map((item) => {
    const category = item.engineering_category_id ? categoriesById.get(item.engineering_category_id) : null
    if (!category) return item
    return {
      ...item,
      engineering_category_type: item.engineering_category_type ?? category.engineering_category_type,
      engineering_category_name: item.engineering_category_name ?? category.engineering_category_name,
    }
  })
}

function isClosedExecutionTask(task: Pick<Task, 'status'>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return ['closed', 'cancelled', 'canceled', 'deleted', 'removed'].includes(status)
}

function resolveTaskPlanDate(
  task: Pick<Task, 'planned_start_date' | 'planned_end_date' | 'start_date' | 'end_date'>,
  side: 'start' | 'end',
) {
  return side === 'start'
    ? task.planned_start_date ?? task.start_date ?? null
    : task.planned_end_date ?? task.end_date ?? null
}

function buildGeneratedBaselineItemsFromTasks(
  tasks: TaskBaselineTaskRow[],
  currentBaselineItems: TaskBaselineItem[],
): TaskBaselineItemInput[] {
  const activeTasks = tasks.filter((task) => !isClosedExecutionTask(task))
  const currentByTaskId = new Map(
    currentBaselineItems
      .filter((item) => item.source_task_id)
      .map((item) => [item.source_task_id as string, item]),
  )
  const generatedItemIdByTaskId = new Map(activeTasks.map((task) => [task.id, uuidv4()]))

  return activeTasks.map((task, index) => {
    const currentItem = currentByTaskId.get(task.id)
    const plannedStartDate = resolveTaskPlanDate(task, 'start')
    const plannedEndDate = resolveTaskPlanDate(task, 'end')
    const parentItemId = task.parent_id ? generatedItemIdByTaskId.get(task.parent_id) ?? null : null
    const isNewTask = !currentItem
    const dateChanged = Boolean(
      currentItem &&
      (currentItem.planned_start_date !== plannedStartDate || currentItem.planned_end_date !== plannedEndDate),
    )

    return {
      id: generatedItemIdByTaskId.get(task.id),
      parent_item_id: parentItemId,
      source_task_id: task.id,
      source_milestone_id: null,
      template_id: task.template_id ?? currentItem?.template_id ?? null,
      template_node_id: task.template_node_id ?? currentItem?.template_node_id ?? null,
      engineering_category_id: task.engineering_category_id ?? currentItem?.engineering_category_id ?? null,
      wbs_node_type: task.wbs_node_type ?? currentItem?.wbs_node_type ?? null,
      wbs_path: task.wbs_path ?? currentItem?.wbs_path ?? null,
      is_wbs_summary: task.is_wbs_summary ?? currentItem?.is_wbs_summary ?? null,
      is_executable: task.is_executable ?? currentItem?.is_executable ?? null,
      standard_work_code: task.standard_work_code ?? currentItem?.standard_work_code ?? null,
      standard_work_name: task.standard_work_name ?? currentItem?.standard_work_name ?? null,
      duration_calibration_source: task.duration_calibration_source ?? currentItem?.duration_calibration_source ?? null,
      duration_provenance: task.duration_provenance ?? currentItem?.duration_provenance ?? null,
      title: task.title || currentItem?.title || `施工任务 ${index + 1}`,
      planned_start_date: plannedStartDate,
      planned_end_date: plannedEndDate,
      target_progress: null,
      sort_order: Number.isFinite(Number(task.sort_order)) ? Number(task.sort_order) : index,
      is_milestone: Boolean(task.is_milestone ?? currentItem?.is_milestone),
      is_critical: Boolean(currentItem?.is_critical),
      is_baseline_critical: Boolean(currentItem?.is_baseline_critical),
      mapping_status: isNewTask ? 'pending' : 'mapped',
      notes: isNewTask
        ? 'System suggestion: current task list has new construction tasks and they were added to the new baseline draft.'
        : dateChanged
          ? 'System suggestion: planned dates were updated from the current task schedule.'
          : currentItem?.notes ?? null,
    }
  })
}

function getBaselineCompareKey(item: Pick<TaskBaselineItem, 'source_task_id' | 'source_milestone_id' | 'title'>) {
  return item.source_task_id?.trim() || item.source_milestone_id?.trim() || item.title.trim()
}

function summarizeBaselineDiff(currentItems: TaskBaselineItem[], previousItems: TaskBaselineItem[]) {
  const previousByKey = new Map(previousItems.map((item) => [getBaselineCompareKey(item), item]))
  const matchedKeys = new Set<string>()

  let modifiedItemCount = 0
  let milestoneChangeCount = 0
  let criticalPathChangeCount = 0
  let mappingAffectedCount = 0

  for (const current of currentItems) {
    const key = getBaselineCompareKey(current)
    const previous = previousByKey.get(key)

    if (!previous) {
      modifiedItemCount += 1
      if (current.is_critical) {
        // eslint-disable-next-line -- route-level-aggregation-approved
        criticalPathChangeCount += 1
      }
      if (current.mapping_status && current.mapping_status !== 'mapped') {
        mappingAffectedCount += 1
      }
      continue
    }

    matchedKeys.add(key)

    const isModified =
      previous.title !== current.title ||
      previous.planned_start_date !== current.planned_start_date ||
      previous.planned_end_date !== current.planned_end_date ||
      previous.target_progress !== current.target_progress ||
      previous.mapping_status !== current.mapping_status ||
      previous.is_critical !== current.is_critical

    const isMilestoneChange =
      Boolean(current.is_milestone || previous.is_milestone) &&
      previous.planned_end_date !== current.planned_end_date

    const affectsCriticalPath =
      Boolean(current.is_critical || previous.is_critical) ||
      isMilestoneChange ||
      previous.mapping_status !== current.mapping_status

    const mappingAffected =
      previous.mapping_status !== current.mapping_status ||
      current.mapping_status === 'missing' ||
      previous.mapping_status === 'missing'

    if (isModified) modifiedItemCount += 1
    // eslint-disable-next-line -- route-level-aggregation-approved
    if (isMilestoneChange) milestoneChangeCount += 1
    // eslint-disable-next-line -- route-level-aggregation-approved
    if (affectsCriticalPath) criticalPathChangeCount += 1
    if (mappingAffected) mappingAffectedCount += 1
  }

  for (const previous of previousItems) {
    const key = getBaselineCompareKey(previous)
    if (matchedKeys.has(key)) continue
    modifiedItemCount += 1
    if (previous.is_critical) {
      // eslint-disable-next-line -- route-level-aggregation-approved
      criticalPathChangeCount += 1
    }
    if (previous.mapping_status && previous.mapping_status !== 'mapped') {
      mappingAffectedCount += 1
    }
  }

  return {
    modifiedItemCount,
    milestoneChangeCount,
    criticalPathChangeCount,
    mappingAffectedCount,
  }
}

type BaselineDiffCellKey = 'title' | 'start' | 'end' | 'progress'
type BaselineDiffKind = 'added' | 'modified' | 'removed' | 'milestone_changed'

type BaselineDiffItem = {
  id: string
  kind: BaselineDiffKind
  title: string
  before: string
  after: string
  note?: string
  rowId?: string
  sourceRowId?: string
  field?: BaselineDiffCellKey
}

type BaselineGenerationCandidateReason = {
  code: 'milestone_shift' | 'finish_shift' | 'affected_tasks' | 'structure_change'
  label: string
  detail: string
  severity: 'info' | 'warning'
}

type BaselineGenerationCandidate = {
  baselineId: string
  projectId: string
  sourceVersionLabel: string
  candidateVersionLabel: string
  recommended: boolean
  summary: string
  reasons: BaselineGenerationCandidateReason[]
  metrics: {
    baselineTaskCount: number
    candidateTaskCount: number
    affectedTaskCount: number
    affectedTaskRatio: number
    addedItemCount: number
    removedItemCount: number
    changedItemCount: number
    structureChangeRatio: number
    milestoneMaxShiftDays: number
    totalFinishShiftDays: number
  }
  diffCounts: Record<BaselineDiffKind | 'total', number>
  diffItems: BaselineDiffItem[]
}

type BaselineDiffField = {
  label: string
  before: string
  after: string
  cell: BaselineDiffCellKey
  milestoneOnly?: boolean
}

function normalizeBaselineDiffText(value?: string | null) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function addBaselineDiffKey(keys: string[], prefix: string, value?: string | null) {
  const normalized = normalizeBaselineDiffText(value)
  if (normalized) keys.push(`${prefix}:${normalized}`)
}

function getBaselineDiffIdentityKeys(item: TaskBaselineItem, wbsLabel: string) {
  const keys: string[] = []
  addBaselineDiffKey(keys, 'source-task', item.source_task_id)
  addBaselineDiffKey(keys, 'source-milestone', item.source_milestone_id)
  addBaselineDiffKey(keys, 'template-node', item.template_node_id)
  addBaselineDiffKey(keys, 'wbs-path', item.wbs_path)

  const title = normalizeBaselineDiffText(item.title)
  if (title) {
    if (wbsLabel) keys.push(`wbs-label:${wbsLabel}:${title}`)
    if (item.standard_work_code) keys.push(`standard:${normalizeBaselineDiffText(item.standard_work_code)}:${title}`)
    keys.push(`title:${title}`)
  }

  return keys
}

function buildBaselineWbsLabels(items: TaskBaselineItem[]) {
  const sortedItems = [...items].sort((left, right) => {
    const orderDiff = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'zh-CN')
  })
  const existingIds = new Set(sortedItems.map((item) => item.id))
  const childrenByParent = new Map<string | null, TaskBaselineItem[]>()

  sortedItems.forEach((item) => {
    const parentId = item.parent_item_id && existingIds.has(item.parent_item_id) ? item.parent_item_id : null
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(item)
    childrenByParent.set(parentId, siblings)
  })

  const labels = new Map<string, string>()
  const visited = new Set<string>()

  function visit(parentId: string | null, prefix: string) {
    const children = childrenByParent.get(parentId) ?? []
    children.forEach((item, index) => {
      if (visited.has(item.id)) return
      visited.add(item.id)
      const label = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      labels.set(item.id, label)
      visit(item.id, label)
    })
  }

  visit(null, '')
  sortedItems.forEach((item) => {
    if (!labels.has(item.id)) labels.set(item.id, String(labels.size + 1))
  })
  return labels
}

function formatBaselineDiffValue(value?: string | number | boolean | null) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function formatBaselineDiffProgress(value?: number | null) {
  return value === null || value === undefined ? '-' : `${value}%`
}

function formatBaselineDiffDate(value?: string | null) {
  return value ? value.slice(0, 10) : '-'
}

function getBaselineCriticalValue(item: TaskBaselineItem) {
  return Boolean(item.is_critical ?? item.is_baseline_critical)
}

function formatBaselineItemSummary(item: TaskBaselineItem, wbsLabel: string) {
  const dates = `${formatBaselineDiffDate(item.planned_start_date)} → ${formatBaselineDiffDate(item.planned_end_date)}`
  const flags = [
    item.is_milestone ? 'milestone' : null,
    getBaselineCriticalValue(item) ? '关键线路' : null,
  ].filter(Boolean)
  return [`${wbsLabel} ${item.title}`, dates, ...flags].join(' · ')
}

function getBaselineDiffFields(before: TaskBaselineItem, after: TaskBaselineItem): BaselineDiffField[] {
  const beforeType = before.wbs_node_type ?? (before as any).engineering_category_type ?? null
  const afterType = after.wbs_node_type ?? (after as any).engineering_category_type ?? null
  const fields: BaselineDiffField[] = [
    {
      label: 'title',
      before: formatBaselineDiffValue(before.title),
      after: formatBaselineDiffValue(after.title),
      cell: 'title',
    },
    {
      label: 'planned_start_date',
      before: formatBaselineDiffDate(before.planned_start_date),
      after: formatBaselineDiffDate(after.planned_start_date),
      cell: 'start',
    },
    {
      label: 'planned_end_date',
      before: formatBaselineDiffDate(before.planned_end_date),
      after: formatBaselineDiffDate(after.planned_end_date),
      cell: 'end',
    },
    {
      label: 'target_progress',
      before: formatBaselineDiffProgress(before.target_progress),
      after: formatBaselineDiffProgress(after.target_progress),
      cell: 'progress',
    },
    {
      label: 'is_milestone',
      before: formatBaselineDiffValue(Boolean(before.is_milestone)),
      after: formatBaselineDiffValue(Boolean(after.is_milestone)),
      cell: 'title',
      milestoneOnly: true,
    },
    {
      label: 'is_critical',
      before: formatBaselineDiffValue(getBaselineCriticalValue(before)),
      after: formatBaselineDiffValue(getBaselineCriticalValue(after)),
      cell: 'title',
    },
    {
      label: 'mapping_status',
      before: formatBaselineDiffValue(before.mapping_status),
      after: formatBaselineDiffValue(after.mapping_status),
      cell: 'title',
    },
    {
      label: 'wbs_node_type',
      before: formatBaselineDiffValue(beforeType),
      after: formatBaselineDiffValue(afterType),
      cell: 'title',
    },
  ]

  return fields.filter((field) => field.before !== field.after)
}

function buildBaselineDiffItems(
  fromItems: TaskBaselineItem[],
  toItems: TaskBaselineItem[],
): BaselineDiffItem[] {
  const fromLabels = buildBaselineWbsLabels(fromItems)
  const toLabels = buildBaselineWbsLabels(toItems)
  const fromIndex = new Map<string, TaskBaselineItem[]>()
  const unmatchedFromIds = new Set(fromItems.map((item) => item.id))
  const fromById = new Map(fromItems.map((item) => [item.id, item]))

  fromItems.forEach((item) => {
    getBaselineDiffIdentityKeys(item, fromLabels.get(item.id) ?? '').forEach((key) => {
      const bucket = fromIndex.get(key) ?? []
      bucket.push(item)
      fromIndex.set(key, bucket)
    })
  })

  const diffItems: BaselineDiffItem[] = []
  toItems.forEach((target) => {
    const match = getBaselineDiffIdentityKeys(target, toLabels.get(target.id) ?? '')
      .flatMap((key) => fromIndex.get(key) ?? [])
      .find((candidate) => unmatchedFromIds.has(candidate.id))

    if (!match) {
      diffItems.push({
        id: `added-${target.id}`,
        kind: 'added',
        title: target.title,
        before: '-',
        after: formatBaselineItemSummary(target, toLabels.get(target.id) ?? ''),
        note: 'Current version added this planning row.',
        rowId: target.id,
        field: 'title',
      })
      return
    }

    unmatchedFromIds.delete(match.id)
    const changedFields = getBaselineDiffFields(match, target)
    if (changedFields.length === 0) return
    diffItems.push({
      id: `changed-${target.id}`,
      kind: changedFields.every((field) => field.milestoneOnly) ? 'milestone_changed' : 'modified',
      title: target.title,
      before: formatBaselineItemSummary(match, fromLabels.get(match.id) ?? ''),
      after: formatBaselineItemSummary(target, toLabels.get(target.id) ?? ''),
      note: changedFields.map((field) => `${field.label}: ${field.before} → ${field.after}`).join('；'),
      rowId: target.id,
      sourceRowId: match.id,
      field: changedFields[0]?.cell ?? 'title',
    })
  })

  unmatchedFromIds.forEach((sourceId) => {
    const source = fromById.get(sourceId)
    if (!source) return
    diffItems.push({
      id: `removed-${source.id}`,
      kind: 'removed',
      title: source.title,
      before: formatBaselineItemSummary(source, fromLabels.get(source.id) ?? ''),
      after: '-',
      note: 'Current version removed this planning row.',
      sourceRowId: source.id,
    })
  })

  return diffItems
}

function buildBaselineDiffCounts(items: BaselineDiffItem[]) {
  // eslint-disable-next-line -- route-level-aggregation-approved
  return items.reduce(
    (counts, item) => {
      counts[item.kind] += 1
      counts.total += 1
      return counts
    },
    { total: 0, added: 0, modified: 0, removed: 0, milestone_changed: 0 } as Record<BaselineDiffKind | 'total', number>,
  )
}

const BASELINE_GENERATION_TASK_SELECT = [
  'id',
  'project_id',
  'parent_id',
  'title',
  'description',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'progress',
  'sort_order',
  'is_milestone',
  'baseline_item_id',
  'participant_unit_id',
  'assignee_user_id',
  'assignee_name',
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'template_id',
  'template_node_id',
  'wbs_code',
  'wbs_level',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'task_code',
  'task_code_version',
  'task_code_rule_id',
  'status',
].join(',')

function sortBaselineGenerationTasks(tasks: TaskBaselineTaskRow[]) {
  return tasks
    .filter((task) => task.id && task.title)
    .sort((left, right) => {
      const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
      const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
      if (leftSort !== rightSort) return leftSort - rightSort
      return String(resolveTaskPlanDate(left, 'start') ?? '').localeCompare(String(resolveTaskPlanDate(right, 'start') ?? ''))
    })
}

async function getBaselineGenerationTaskRows(projectId: string) {
  const taskResult = await supabase
    .from('tasks')
    .select(BASELINE_GENERATION_TASK_SELECT)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (taskResult.error) throw taskResult.error
  return sortBaselineGenerationTasks((taskResult.data ?? []) as unknown as TaskBaselineTaskRow[])
}

function hydrateGeneratedBaselineCandidateItems(
  projectId: string,
  baselineId: string,
  items: TaskBaselineItemInput[],
): TaskBaselineItem[] {
  return items.map((item, index) => ({
    project_id: projectId,
    baseline_version_id: `${baselineId}:candidate`,
    sort_order: index,
    mapping_status: 'pending',
    ...item,
    id: item.id ?? `candidate-${index + 1}`,
    title: item.title ?? `候选计划行 ${index + 1}`,
  })) as TaskBaselineItem[]
}

function getLatestBaselineEndDate(items: TaskBaselineItem[]) {
  return items
    .map((item) => item.planned_end_date ?? null)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => String(right).localeCompare(String(left)))[0] ?? null
}

function isBaselineWorkItem(item: TaskBaselineItem) {
  return item.is_executable !== false && item.is_wbs_summary !== true
}

function getBaselineMilestoneMaxShiftDays(sourceItems: TaskBaselineItem[], candidateItems: TaskBaselineItem[]) {
  const sourceByKey = new Map(
    sourceItems
      .filter((item) => item.is_milestone)
      .map((item) => [getBaselineCompareKey(item), item]),
  )

  return candidateItems
    .filter((item) => item.is_milestone)
    // eslint-disable-next-line -- route-level-aggregation-approved
    .reduce((maxShift, item) => {
      const source = sourceByKey.get(getBaselineCompareKey(item))
      if (!source) return maxShift
      return Math.max(maxShift, Math.abs(signedDurationDayDelta(source.planned_end_date, item.planned_end_date) ?? 0))
    }, 0)
}

function buildBaselineGenerationCandidate(
  baseline: TaskBaseline,
  sourceItems: TaskBaselineItem[],
  candidateItems: TaskBaselineItem[],
): BaselineGenerationCandidate {
  const diffItems = buildBaselineDiffItems(sourceItems, candidateItems)
  const diffCounts = buildBaselineDiffCounts(diffItems)
  // eslint-disable-next-line -- route-level-aggregation-approved
  const baselineTaskCount = Math.max(sourceItems.filter(isBaselineWorkItem).length, 1)
  // eslint-disable-next-line -- route-level-aggregation-approved
  const candidateTaskCount = candidateItems.filter(isBaselineWorkItem).length
  const affectedTaskCount = diffItems.length
  const affectedTaskRatio = affectedTaskCount / baselineTaskCount
  const addedItemCount = diffCounts.added
  const removedItemCount = diffCounts.removed
  const changedItemCount = diffCounts.modified + diffCounts.milestone_changed
  const structureChangeRatio = (addedItemCount + removedItemCount) / baselineTaskCount
  const totalFinishShiftDays = Math.abs(signedDurationDayDelta(
    getLatestBaselineEndDate(sourceItems),
    getLatestBaselineEndDate(candidateItems),
  ) ?? 0)
  const milestoneMaxShiftDays = getBaselineMilestoneMaxShiftDays(sourceItems, candidateItems)

  const reasons: BaselineGenerationCandidateReason[] = []
  if (milestoneMaxShiftDays > 3) {
    reasons.push({
      code: 'milestone_shift',
      label: 'Key milestone shifted',
      detail: `Key milestone max shift is ${milestoneMaxShiftDays} days, exceeding the 3 day threshold.`,
      severity: 'warning',
    })
  }
  if (totalFinishShiftDays > 7) {
    reasons.push({
      code: 'finish_shift',
      label: 'Total finish date shifted',
      detail: `Total finish date shifted by ${totalFinishShiftDays} days, exceeding the 7 day threshold.`,
      severity: 'warning',
    })
  }
  if (affectedTaskRatio > 0.15) {
    reasons.push({
      code: 'affected_tasks',
      label: 'Affected task ratio is high',
      detail: `Affected planning rows account for ${Math.round(affectedTaskRatio * 100)}%, exceeding the 15% threshold.`,
      severity: 'warning',
    })
  }
  if (structureChangeRatio > 0.1) {
    reasons.push({
      code: 'structure_change',
      label: 'Task structure changed significantly',
      detail: `Added or removed rows account for ${Math.round(structureChangeRatio * 100)}%, exceeding the 10% threshold.`,
      severity: 'warning',
    })
  }

  const recommended = reasons.length > 0
  return {
    baselineId: baseline.id,
    projectId: baseline.project_id,
    sourceVersionLabel: formatBaselineBusinessVersionLabel(baseline),
    candidateVersionLabel: 'new baseline draft',
    recommended,
    summary: recommended
      ? `Detected ${diffCounts.total} planning differences. Generate a new baseline draft for review.`
      : 'Current task list is close to the project baseline. No new baseline version is required.',
    reasons,
    metrics: {
      baselineTaskCount,
      candidateTaskCount,
      affectedTaskCount,
      affectedTaskRatio,
      addedItemCount,
      removedItemCount,
      changedItemCount,
      structureChangeRatio,
      milestoneMaxShiftDays,
      totalFinishShiftDays,
    },
    diffCounts,
    diffItems: diffItems.slice(0, 20),
  }
}

async function getComparisonBaseline(projectId: string, currentBaselineId: string) {
  const baselines = await listProjectBaselines(projectId)
  return (
    baselines
      .filter((baseline) => baseline.id !== currentBaselineId && baseline.status === 'confirmed')
      .sort((left, right) => (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0))[0] ?? null
  )
}

async function evaluateRuntimeBaselineValidity(projectId: string, items: TaskBaselineItem[]) {
  const taskIds = Array.from(new Set(items.map((item) => item.source_task_id).filter(Boolean))) as string[]
  const milestoneIds = Array.from(new Set(items.map((item) => item.source_milestone_id).filter(Boolean))) as string[]
  const emptyResult = { data: [], error: null } as const

  const [taskResult, milestoneResult] = await Promise.all([
    taskIds.length > 0
      ? supabase
          .from('tasks')
          .select('id, project_id, planned_start_date, planned_end_date, start_date, end_date')
          .eq('project_id', projectId)
          .in('id', taskIds)
      : Promise.resolve(emptyResult),
    milestoneIds.length > 0
      ? supabase
          .from('tasks')
          .select('id, project_id, baseline_date:baseline_end, current_plan_date:planned_end_date')
          .eq('project_id', projectId)
          .eq('is_milestone', true)
          .in('id', milestoneIds)
      : Promise.resolve(emptyResult),
  ])

  if (taskResult.error) throw taskResult.error
  if (milestoneResult.error) throw milestoneResult.error

  return evaluateProjectBaselineValidity({
    baselineItems: items,
    tasks: (taskResult.data ?? []) as Array<{
      id: string
      planned_start_date?: string | null
      planned_end_date?: string | null
      start_date?: string | null
      end_date?: string | null
    }>,
    milestones: (milestoneResult.data ?? []) as Array<{
      id: string
      baseline_date?: string | null
      current_plan_date?: string | null
    }>,
  })
}

function buildBaselineValidityMessage(validity: {
  deviatedTaskRatio: number
  shiftedMilestoneCount: number
  averageMilestoneShiftDays: number
  totalDurationDeviationRatio: number
  triggeredRules: string[]
}) {
  const ruleLabels: Record<string, string> = {
    task_deviation_ratio: '任务偏差率超过 40%',
    milestone_shift: '里程碑偏移达到 3 个且平均偏移超过 30 天',
    duration_deviation: '总工期偏差超过 10%',
  }
  const triggeredSummary = validity.triggeredRules
    .map((rule) => ruleLabels[rule] ?? rule)
    .join('；')

  return `Baseline validity has crossed the realignment threshold: deviated task ratio ${Math.round(
    validity.deviatedTaskRatio * 100,
  )}%, shifted milestones ${validity.shiftedMilestoneCount}, average ${Math.round(
    validity.averageMilestoneShiftDays,
  )} days, total duration deviation ${Math.round(validity.totalDurationDeviationRatio * 100)}%. Triggered rules: ${triggeredSummary}. Please realign or revise before confirming.`
}

async function persistBaselineItems(
  baselineId: string,
  projectId: string,
  items: TaskBaselineItemInput[] | undefined,
  client?: any,
): Promise<TaskBaselineItem[]> {
  if (!Array.isArray(items) || items.length === 0) return []

  const idMap = new Map<string, string>()
  items.forEach((item) => {
    if (!item.id) return
    idMap.set(item.id, isUuidLike(item.id) ? item.id : uuidv4())
  })
  const payload = items.map((item, index) =>
    mapBaselineItem(
      {
        ...item,
        id: item.id ? idMap.get(item.id) ?? item.id : undefined,
        parent_item_id: item.parent_item_id ? idMap.get(item.parent_item_id) ?? item.parent_item_id : null,
      },
      baselineId,
      projectId,
      index,
    ),
  )
  if (client) {
    return insertRowsReturning<TaskBaselineItem>(client, 'task_baseline_items', payload, {
      jsonColumns: BASELINE_ITEM_JSON_COLUMNS,
    })
  }
  const { data, error } = await supabase.from('task_baseline_items').insert(payload).select('*')
  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

const SNAPSHOT_FIELD_NAMES = [
  'scope_snapshot',
  'wbs_snapshot',
  'task_fact_snapshot',
  'task_code_snapshot',
  'status_snapshot',
  'snapshot_source',
  'snapshot_captured_at',
  'manual_override_fields',
  'generation_metadata',
  'last_generated_at',
  'seed_versions',
] as const

function hasSnapshotPayload(item: Partial<TaskBaselineItem>) {
  if (item.snapshot_captured_at) return true
  if (item.task_code_snapshot) return true
  return ['scope_snapshot', 'wbs_snapshot', 'task_fact_snapshot', 'status_snapshot'].some((field) => {
    const value = item[field as keyof TaskBaselineItem]
    return Boolean(
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length > 0,
    )
  })
}

function sameBaselineItemSource(left: Partial<TaskBaselineItem>, right: Partial<TaskBaselineItem>) {
  const leftTaskId = String(left.source_task_id ?? '').trim()
  const rightTaskId = String(right.source_task_id ?? '').trim()
  const leftMilestoneId = String(left.source_milestone_id ?? '').trim()
  const rightMilestoneId = String(right.source_milestone_id ?? '').trim()
  if (leftTaskId || rightTaskId) return leftTaskId === rightTaskId
  if (leftMilestoneId || rightMilestoneId) return leftMilestoneId === rightMilestoneId
  return true
}

function copySnapshotFields<T extends TaskBaselineItemInput>(item: T, snapshotSource: Partial<TaskBaselineItem>): T {
  const next = { ...item } as T
  for (const field of SNAPSHOT_FIELD_NAMES) {
    const value = (snapshotSource as Record<string, unknown>)[field]
    ;(next as Record<string, unknown>)[field] = value ?? (
      ['scope_snapshot', 'wbs_snapshot', 'task_fact_snapshot', 'status_snapshot'].includes(field)
        ? {}
        : field === 'seed_versions'
          ? []
          : field === 'manual_override_fields'
            ? {}
            : field === 'generation_metadata'
              ? null
              : field === 'last_generated_at'
                ? null
        : null
    )
  }
  return next
}

function buildBaselineConfirmationGateMessage(gate: ReturnType<typeof evaluateBaselineConfirmationGate>) {
  const summary = gate.blockers
    .map((blocker) => `${blocker.code}: ${blocker.detail}`)
    .join('；')
  return `Baseline confirmation gate failed: ${summary}`
}

async function preserveBaselineDraftSnapshots(
  projectId: string,
  items: TaskBaselineItemInput[] | undefined,
  previousItems: TaskBaselineItem[],
): Promise<TaskBaselineItemInput[] | undefined> {
  if (!Array.isArray(items) || items.length === 0) return items

  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const previousByTaskId = new Map(
    previousItems
      .filter((item) => item.source_task_id)
      .map((item) => [String(item.source_task_id), item]),
  )
  const previousByMilestoneId = new Map(
    previousItems
      .filter((item) => item.source_milestone_id)
      .map((item) => [String(item.source_milestone_id), item]),
  )

  const preserved = items.map((item) => {
    if (hasSnapshotPayload(item)) return item

    const previousBySameId = item.id ? previousById.get(item.id) ?? null : null
    const previous =
      previousBySameId && sameBaselineItemSource(item, previousBySameId)
        ? previousBySameId
        : item.source_task_id
          ? previousByTaskId.get(String(item.source_task_id)) ?? null
          : item.source_milestone_id
            ? previousByMilestoneId.get(String(item.source_milestone_id)) ?? null
            : null

    return previous && hasSnapshotPayload(previous) ? copySnapshotFields(item, previous) : item
  })

  const missingIndexes: number[] = []
  const missingItems: TaskBaselineItemInput[] = []
  preserved.forEach((item, index) => {
    if (!item.source_task_id || hasSnapshotPayload(item)) return
    missingIndexes.push(index)
    missingItems.push(item)
  })

  if (missingItems.length === 0) return preserved
  const enrichedMissingItems = await attachTaskFactSnapshots(projectId, missingItems)
  const nextItems = [...preserved]
  missingIndexes.forEach((itemIndex, missingIndex) => {
    nextItems[itemIndex] = enrichedMissingItems[missingIndex]
  })
  return nextItems
}

async function replaceBaselineDraftItems(
  baselineId: string,
  projectId: string,
  items: TaskBaselineItemInput[] | undefined,
  client?: any,
  previousItemsInput?: TaskBaselineItem[],
): Promise<TaskBaselineItem[]> {
  const previousItems = previousItemsInput ?? await getBaselineItems(baselineId, projectId)
  const snapshotItems = await preserveBaselineDraftSnapshots(projectId, items, previousItems)
  if (client) {
    await client.query(
      `DELETE FROM public.task_baseline_items
        WHERE baseline_version_id = $1
          AND project_id = $2`,
      [baselineId, projectId],
    )
    const persisted = await persistBaselineItems(baselineId, projectId, snapshotItems, client)
    return persisted
  }

  const { error: deleteError } = await supabase
    .from('task_baseline_items')
    .delete()
    .eq('baseline_version_id', baselineId)
    .eq('project_id', projectId)

  if (deleteError) throw deleteError
  const persisted = await persistBaselineItems(baselineId, projectId, snapshotItems)
  clearBaselineDetailCache(baselineId)
  return persisted
}

async function cleanupBaselineDraft(baselineId: string, projectId: string) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `task-baseline-draft:${projectId}:${baselineId}`,
    ])
    await client.query(
      `DELETE FROM public.task_baseline_items
        WHERE baseline_version_id = $1
          AND project_id = $2`,
      [baselineId, projectId],
    )
    const deleted = await client.query(
      `DELETE FROM public.task_baselines
        WHERE id = $1
          AND project_id = $2
          AND status = ANY($3::text[])
      RETURNING id`,
      [baselineId, projectId, [...DRAFT_BASELINE_STATUSES]],
    )
    if (deleted.rows.length !== 1) {
      throw new PlanningStateTransitionError('VERSION_CONFLICT', 'Baseline draft state changed before rollback')
    }
    await client.query('COMMIT')
    clearBaselineDetailCache(baselineId)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function getBaselineRecord(id: string) {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery('SELECT * FROM public.task_baselines WHERE id = $1 LIMIT 1', [id])
      return (result.rows[0] as TaskBaseline | undefined) ?? null
    } catch (error) {
      logger.warn('[task-baselines] direct baseline record read failed, falling back to Supabase REST', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data, error } = await supabase.from('task_baselines').select('*').eq('id', id).limit(1)
  if (error) throw error
  return (data?.[0] as TaskBaseline | undefined) ?? null
}

async function listProjectBaselines(projectId: string): Promise<TaskBaseline[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        'SELECT * FROM public.task_baselines WHERE project_id = $1 ORDER BY created_at DESC',
        [projectId],
      )
      return result.rows as TaskBaseline[]
    } catch (error) {
      logger.warn('[task-baselines] direct project baseline list read failed, falling back to Supabase REST', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data, error } = await supabase.from('task_baselines').select('*').eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as TaskBaseline[]
}

async function getCurrentExecutionBaselineId(projectId: string): Promise<string | null> {
  const baselines = await listProjectBaselines(projectId)
  return (
    baselines
      .filter((baseline) => isCurrentExecutionBaselineStatus(baseline.status) && getNumericVersion(baseline.version) != null)
      .sort((left, right) => {
        const versionDiff = (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0)
        if (versionDiff !== 0) return versionDiff
        return String(right.confirmed_at ?? right.updated_at ?? '').localeCompare(String(left.confirmed_at ?? left.updated_at ?? ''))
      })[0]?.id ?? null
  )
}

async function getBaselineConfirmationSourceItems(baseline: TaskBaseline): Promise<TaskBaselineItem[]> {
  const explicitSourceId = String((baseline as any).source_version_id ?? '').trim()
  if (explicitSourceId && explicitSourceId !== baseline.id) {
    return getBaselineItems(explicitSourceId, baseline.project_id)
  }

  const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
  if (currentExecutionBaselineId && currentExecutionBaselineId !== baseline.id) {
    return getBaselineItems(currentExecutionBaselineId, baseline.project_id)
  }

  return []
}

async function buildLatestExecutionBaselineRequiredResponse(baseline: TaskBaseline) {
  const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
  if (!currentExecutionBaselineId || currentExecutionBaselineId !== baseline.id) {
    return badRequest('latest execution baseline is required', 'LATEST_BASELINE_REQUIRED')
  }
  return null
}

async function persistBaselinePublication(params: {
  baseline: TaskBaseline
  items: TaskBaselineItem[]
  nextStatus: TaskBaseline['status']
  currentBusinessVersion: number | null
  confirmedAt: string
  confirmedBy: string | null
  governanceMetadata?: Record<string, unknown> | null
  projectId: string
  cause: BaselinePublicationCause
}): Promise<{
  baseline: TaskBaseline
  items: TaskBaselineItem[]
  archivedBaselines: TaskBaseline[]
}> {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `task-baseline-publish:${params.projectId}`,
    ])
    const currentResult = await client.query(
      `SELECT *
         FROM public.task_baselines
        WHERE id = $1
          AND project_id = $2
        FOR UPDATE`,
      [params.baseline.id, params.projectId],
    )
    const current = currentResult.rows[0] as TaskBaseline | undefined
    if (
      !current
      || current.status !== params.baseline.status
      || getNumericVersion(current.version) !== params.currentBusinessVersion
    ) {
      throw new PlanningStateTransitionError('VERSION_CONFLICT', 'Baseline changed before confirmation')
    }

    const projectScopeResult = await client.query(
      'SELECT company_id FROM public.projects WHERE id = $1 LIMIT 1',
      [params.projectId],
    )
    const companyId = String(projectScopeResult.rows[0]?.company_id ?? '').trim()
    if (!companyId) {
      throw Object.assign(new Error('Project company scope was not found for baseline publication.'), {
        code: 'BASELINE_PROJECT_COMPANY_SCOPE_REQUIRED',
        statusCode: 409,
      })
    }

    let nextVersion = params.currentBusinessVersion
    if (params.nextStatus === 'confirmed') {
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version), 0)::int AS latest_version
           FROM public.task_baselines
          WHERE project_id = $1
            AND id <> $2
            AND status = ANY($3::text[])`,
        [params.projectId, params.baseline.id, [...BUSINESS_VERSION_BASELINE_STATUSES]],
      )
      nextVersion = Number(versionResult.rows[0]?.latest_version ?? 0) + 1
    }

    const updateResult = await client.query(
      `UPDATE public.task_baselines
          SET version = $3,
              status = $4,
              confirmed_at = $5,
              confirmed_by = $6,
              governance_metadata = $7::jsonb,
              updated_at = $5
        WHERE id = $1
          AND project_id = $2
          AND status = $8
          AND version IS NOT DISTINCT FROM $9
      RETURNING *`,
      [
        params.baseline.id,
        params.projectId,
        nextVersion,
        params.nextStatus,
        params.confirmedAt,
        params.confirmedBy,
        JSON.stringify(params.governanceMetadata ?? current.governance_metadata ?? null),
        params.baseline.status,
        params.currentBusinessVersion,
      ],
    )
    const updatedBaseline = updateResult.rows[0] as TaskBaseline | undefined
    if (!updatedBaseline) {
      throw new PlanningStateTransitionError('VERSION_CONFLICT', 'Baseline changed before confirmation')
    }

    let nextItems = params.items
    let archivedBaselines: TaskBaseline[] = []
    if (params.nextStatus === 'confirmed') {
      nextItems = await annotateBaselineCriticalItems(params.baseline, params.items, client)
      const archiveResult = await client.query(
        `SELECT *
           FROM public.task_baselines
          WHERE project_id = $1
            AND id <> $2
            AND status = ANY($3::text[])
          FOR UPDATE`,
        [params.projectId, params.baseline.id, ['confirmed', 'pending_realign']],
      )
      archivedBaselines = archiveResult.rows as TaskBaseline[]
      if (archivedBaselines.length > 0) {
        await client.query(
          `UPDATE public.task_baselines
              SET status = 'archived',
                  updated_at = $3
            WHERE project_id = $1
              AND id <> $2
              AND status = ANY($4::text[])
          RETURNING *`,
          [params.projectId, params.baseline.id, params.confirmedAt, ['confirmed', 'pending_realign']],
        )
      }
    }

    await recordBaselinePublicationStructuredCause({
      companyId,
      projectId: params.projectId,
      baselineId: params.baseline.id,
      previousStatus: params.baseline.status,
      nextStatus: params.nextStatus,
      causeCode: params.cause.causeCode,
      rawText: params.cause.rawText,
      actorId: params.confirmedBy ?? '',
    }, {
      queryExec: (sql, values) => client.query(sql, values),
      withTransaction: runInCurrentTransaction,
    })

    await client.query('COMMIT')
    clearBaselineDetailCache(params.baseline.id)
    for (const archivedBaseline of archivedBaselines) {
      clearBaselineDetailCache(archivedBaseline.id)
    }
    return {
      baseline: updatedBaseline,
      items: nextItems,
      archivedBaselines,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function countProjectBlockingIssues(projectId: string): Promise<number> {
  const [conditionResult, obstacleResult] = await Promise.all([
    supabase.from('task_conditions').select('id,is_satisfied').eq('project_id', projectId),
    supabase.from('task_obstacles').select('id,status').eq('project_id', projectId),
  ])

  if (conditionResult.error) throw conditionResult.error
  if (obstacleResult.error) throw obstacleResult.error

  const pendingConditions = (conditionResult.data ?? []).filter((row: BaselineConditionRow) => {
    if (row.is_satisfied !== null && row.is_satisfied !== undefined) {
      return !Boolean(row.is_satisfied)
    }

    const status = String(row.status ?? '').trim()
    if (!status) return true
    return !SATISFIED_CONDITION_STATUSES.has(status)
  }).length

  const activeObstacles = (obstacleResult.data ?? []).filter((row: BaselineObstacleRow) => {
    const status = String(row.status ?? '').trim()
    return !RESOLVED_OBSTACLE_STATUSES.has(status)
  }).length

  return pendingConditions + activeObstacles
}

async function buildTransitionContext(projectId: string, expectedVersion: number): Promise<PlanningTransitionContext> {
  const blockingIssueCount = await countProjectBlockingIssues(projectId)
  return {
    version: expectedVersion,
    expected_version: expectedVersion,
    blocking_issue_count: blockingIssueCount,
    has_blocking_issues: blockingIssueCount > 0,
  }
}

async function createBaselineVersion(params: {
  projectId: string
  title: string
  description?: string | null
  sourceType?: TaskBaseline['source_type']
  sourceVersionId?: string | null
  sourceVersionLabel?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  items?: TaskBaselineItemInput[]
  actorUserId?: string | null
}) {
  const snapshotItems = await attachTaskFactSnapshots(params.projectId, params.items ?? [])
  const comparisonBaseline = await getComparisonBaseline(params.projectId, '')
  const comparisonItems = comparisonBaseline ? await getBaselineItems(comparisonBaseline.id) : []
  const currentExecutionBaselineId = await getCurrentExecutionBaselineId(params.projectId)

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const now = new Date().toISOString()
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const createdBaseline = await insertRowReturning<TaskBaseline>(client, 'task_baselines', {
        id: uuidv4(),
        project_id: params.projectId,
        version: null,
        status: 'draft',
        title: params.title,
        description: params.description ?? null,
        source_type: params.sourceType ?? 'current_schedule',
        source_version_id: params.sourceVersionId ?? null,
        source_version_label: params.sourceVersionLabel ?? null,
        effective_from: params.effectiveFrom ?? null,
        effective_to: params.effectiveTo ?? null,
        created_at: now,
        updated_at: now,
      })
      const items = await persistBaselineItems(createdBaseline.id, params.projectId, snapshotItems, client)
      await recordBaselineSnapshotLineage(params.projectId, items, params.actorUserId, client)
      await client.query('COMMIT')
      const summary = summarizeBaselineDiff(items, comparisonItems)
      const normalized = normalizeBaselineRow({ ...createdBaseline, ...summary }, items, currentExecutionBaselineId)
      setCachedBaselineDetail(createdBaseline.id, createdBaseline, items)
      return normalized
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (isUniqueConstraintError(error) && attempt < MAX_CREATE_ATTEMPTS - 1) {
        continue
      }
      throw error
    } finally {
      client.release()
    }
  }

  throw new Error('failed to create baseline after retrying unique code allocation')
}

function mapPlanningTransitionError(error: unknown) {
  if (error instanceof PlanningStateTransitionError) {
    return error
  }
  return null
}

router.get(
  '/',
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim()
    const filtered = await listProjectBaselines(projectId)
    const currentExecutionBaselineId = (
      filtered
        .filter((baseline) => isCurrentExecutionBaselineStatus(baseline.status) && getNumericVersion(baseline.version) != null)
        .sort((left, right) => {
          const versionDiff = (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0)
          if (versionDiff !== 0) return versionDiff
          return String(right.confirmed_at ?? right.updated_at ?? '').localeCompare(String(left.confirmed_at ?? left.updated_at ?? ''))
        })[0]?.id ?? null
    )
    const response: ApiResponse<BaselineApiRow[]> = {
      success: true,
      data: filtered.map((row) => ({
        ...normalizeBaselineBusinessVersion(row),
        business_version_label: formatBaselineBusinessVersionLabel(row),
        is_current_execution: Boolean(currentExecutionBaselineId && row.id === currentExecutionBaselineId),
      })),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/generate',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
    if (!projectId) {
      return res.status(400).json(badRequest('project_id 不能为空'))
    }

    const generation = await prepareBaselineGenerationForProject({
      projectId,
    })
    const sourceBaseline = generation.sourceBaseline
    const taskRows = generation.taskRows

    if (taskRows.length === 0) {
      return res.status(422).json(badRequest('当前任务列表为空，无法生成项目基线草稿', 'EMPTY_TASK_LIST'))
    }

    const generated = await createBaselineVersion({
      projectId,
      title: `${sourceBaseline?.title || 'baseline'} generated version`,
      description: '系统根据当前任务列表生成的待发布项目基线草稿。',
      sourceType: 'current_schedule',
      sourceVersionId: sourceBaseline?.id ?? null,
      sourceVersionLabel: sourceBaseline ? formatBaselineBusinessVersionLabel(sourceBaseline) : null,
      effectiveFrom: sourceBaseline?.effective_from ?? null,
      effectiveTo: sourceBaseline?.effective_to ?? null,
      items: generation.generatedItems,
      actorUserId: req.user?.id ?? null,
    })

    const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
      success: true,
      data: {
        ...generated,
        generationCandidate: generation.candidate,
        algorithmVersion: 'v1.4.7.4',
      } as BaselineApiRow & { items: TaskBaselineItem[] },
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  }),
)

router.get(
  '/:id/generation-candidate',
  validateIdParam,
  requireProjectMember(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const latestGuard = await buildLatestExecutionBaselineRequiredResponse(baseline)
    if (latestGuard) {
      return res.status(409).json(latestGuard)
    }

    const generation = await prepareBaselineGenerationForBaseline(baseline.id, { projectId: baseline.project_id })

    if (generation.taskRows.length === 0) {
      return res.status(422).json(badRequest('当前任务列表为空，无法生成项目基线候选', 'EMPTY_TASK_LIST'))
    }

    const response: ApiResponse<BaselineGenerationCandidate> = {
      success: true,
      data: generation.candidate as unknown as BaselineGenerationCandidate,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/:id/diff',
  validateIdParam,
  requireProjectMember(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const compareToId = String(req.query.compareTo ?? req.query.compare_to ?? '').trim()
    const comparisonBaseline = compareToId
      ? await getBaselineRecord(compareToId)
      : await getComparisonBaseline(baseline.project_id, baseline.id)

    if (!comparisonBaseline) {
      return res.status(compareToId ? 404 : 422).json(badRequest(
        compareToId ? 'comparison baseline not found' : 'no comparable project baseline is available',
        compareToId ? 'NOT_FOUND' : 'COMPARISON_BASELINE_UNAVAILABLE',
      ))
    }
    if (comparisonBaseline.project_id !== baseline.project_id) {
      return res.status(400).json(badRequest('只能对比同一项目下的基线版本', 'PROJECT_MISMATCH'))
    }

    const [fromItems, toItems] = await Promise.all([
      getBaselineItems(comparisonBaseline.id),
      getBaselineItems(baseline.id),
    ])
    const items = buildBaselineDiffItems(fromItems, toItems)

    const response: ApiResponse = {
      success: true,
      data: {
        baselineId: baseline.id,
        compareToBaselineId: comparisonBaseline.id,
        fromVersionLabel: formatBaselineBusinessVersionLabel(comparisonBaseline),
        toVersionLabel: formatBaselineBusinessVersionLabel(baseline),
        counts: buildBaselineDiffCounts(items),
        items,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/:id',
  validateIdParam,
  requireProjectMember(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const cached = getCachedBaselineDetail(id)
    const baseline = cached?.baseline ?? await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const items = cached?.items ?? await getBaselineItems(id, baseline.project_id)
    if (!cached) {
      setCachedBaselineDetail(id, baseline, items)
    }
    const comparisonBaseline = await getComparisonBaseline(baseline.project_id, baseline.id)
    const comparisonItems = comparisonBaseline ? await getBaselineItems(comparisonBaseline.id) : []
    const summary = summarizeBaselineDiff(items, comparisonItems)
    const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
    const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
      success: true,
      data: normalizeBaselineRow({ ...baseline, ...summary }, items, currentExecutionBaselineId),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/generate-version',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const latestGuard = await buildLatestExecutionBaselineRequiredResponse(baseline)
    if (latestGuard) {
      return res.status(409).json(latestGuard)
    }

    const generation = await prepareBaselineGenerationForBaseline(baseline.id, { projectId: baseline.project_id })
    const taskRows = generation.taskRows

    if (taskRows.length === 0) {
      return res.status(422).json(badRequest('当前任务列表为空，无法生成新版基线。', 'EMPTY_TASK_LIST'))
    }

    const generated = await createBaselineVersion({
      projectId: baseline.project_id,
      title: `${baseline.title || 'baseline'} generated version`,
      description: 'Generated from current schedule baseline candidate.',
      sourceType: 'current_schedule',
      sourceVersionId: baseline.id,
      sourceVersionLabel: formatBaselineBusinessVersionLabel(baseline),
      effectiveFrom: baseline.effective_from ?? null,
      effectiveTo: baseline.effective_to ?? null,
      items: generation.generatedItems,
      actorUserId: req.user?.id ?? null,
    })

    await writeLog({
      project_id: baseline.project_id,
      entity_type: 'baseline',
      entity_id: generated.id,
      field_name: 'generated_version',
      old_value: formatBaselineBusinessVersionLabel(baseline),
      new_value: '待发布新版',
      changed_by: req.user?.id ?? null,
      change_source: 'system_auto',
    })

    const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
      success: true,
      data: {
        ...generated,
        generationCandidate: generation.candidate,
        algorithmVersion: 'v1.4.7.4',
      } as BaselineApiRow & { items: TaskBaselineItem[] },
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  }),
)

router.post(
  '/',
  requireProjectEditor((req) => req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? '').trim()
    const title = String(req.body?.title ?? '').trim() || '项目基线'
    if (!projectId) {
      return res.status(400).json(badRequest('project_id 不能为空'))
    }

    const baseline = await createBaselineVersion({
      projectId,
      title,
      description: req.body?.description ?? null,
      sourceType: req.body?.source_type ?? 'current_schedule',
      sourceVersionId: req.body?.source_version_id ?? null,
      sourceVersionLabel: req.body?.source_version_label ?? null,
      effectiveFrom: req.body?.effective_from ?? null,
      effectiveTo: req.body?.effective_to ?? null,
      items: req.body?.items,
      actorUserId: req.user?.id ?? null,
    })

    const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
      success: true,
      data: baseline,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.put(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    if (!isDraftBaselineStatus(baseline.status)) {
      return res.status(409).json(badRequest('已发布的项目基线不可直接覆盖，请先进入编辑后再保存。', 'INVALID_STATE'))
    }

    const updatedAt = new Date().toISOString()
    const previousItems = await getBaselineItems(id, baseline.project_id)
    const previousItemCount = previousItems.length
    const client = await getClient()
    let data: TaskBaseline
    let items: TaskBaselineItem[]
    try {
      await client.query('BEGIN')
      const updateResult = await client.query(
        `UPDATE public.task_baselines
            SET title = $3,
                description = $4,
                effective_from = $5,
                effective_to = $6,
                updated_at = $7
          WHERE id = $1
            AND project_id = $2
            AND status IN ('draft', 'revising')
          RETURNING *`,
        [
          id,
          baseline.project_id,
          String(req.body?.title ?? baseline.title).trim() || baseline.title,
          req.body?.description ?? baseline.description ?? null,
          req.body?.effective_from ?? baseline.effective_from ?? null,
          req.body?.effective_to ?? baseline.effective_to ?? null,
          updatedAt,
        ],
      )
      const updatedBaseline = updateResult.rows[0] as TaskBaseline | undefined
      if (!updatedBaseline) {
        await client.query('ROLLBACK')
        return res.status(409).json(badRequest(
          '项目基线状态已变化，请刷新后重试。',
          'INVALID_STATE',
        ))
      }
      data = updatedBaseline
      items = await replaceBaselineDraftItems(
        id,
        baseline.project_id,
        Array.isArray(req.body?.items) ? req.body.items : [],
        client,
        previousItems,
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    clearBaselineDetailCache(id)

    await writeLog({
      project_id: baseline.project_id,
      entity_type: 'baseline',
      entity_id: id,
      field_name: 'draft_saved',
      old_value: String(previousItemCount),
      new_value: String(items.length),
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
    const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
      success: true,
      data: normalizeBaselineRow(data, items, currentExecutionBaselineId),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/:id/commit',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    const projectId = String(req.body?.projectId ?? req.body?.project_id ?? baseline.project_id).trim()
    if (projectId !== baseline.project_id) {
      return res.status(403).json(badRequest('提交项目与基线不匹配', 'PROJECT_MISMATCH'))
    }
    if (!isDraftBaselineStatus(baseline.status)) {
      return res.status(409).json(badRequest('已发布的项目基线不可直接保存，请先生成新版草稿。', 'INVALID_STATE'))
    }
    if (!isPlanningFieldRegistryVersionCurrent(req.body?.fieldRegistryVersion)) {
      return res.status(409).json(buildFieldRegistryStaleResponse(req.body?.fieldRegistryVersion))
    }

    const validation = validatePlanningTableCommitRequest(
      {
        ...req.body,
        projectId,
        surface: 'baseline',
      },
      {
        expectedSurface: 'baseline',
        allowEmptyOperations: true,
        enforceFieldRegistryVersion: false,
      },
    )
    if (!validation.ok || !validation.request) {
      return res.status(400).json(buildPlanningTableValidationErrorResponse(
        validation.issues,
        'BASELINE_COMMIT_INVALID_REQUEST',
      ))
    }

    const durationLearningRuntimeQueryExec: DurationLearningRuntimePublicationQueryExec = async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) => {
      // database-query-dynamic-approved: the canonical 315 publication resolver owns fixed parameterized SELECTs; the baseline route only supplies its transaction executor.
      const result = await rawQuery(sql, params as any[])
      return (result.rows ?? []) as T[]
    }
    const expandedTemplateOperations = await expandBaselineTemplateGenerateOperations(
      projectId,
      validation.request.operations as PlanningCommitOperation[],
      durationLearningRuntimeQueryExec,
    )
    const operations = expandedTemplateOperations.operations
    if (operations.length === 0) {
      const rows = await getBaselineItems(id)
      const response: ApiResponse = {
        success: true,
        data: buildPlanningTableCommitResponse({
          surface: 'baseline',
          resourceId: id,
          rows,
          operations: [],
          createdRowCount: 0,
          deletedRowCount: 0,
          changedRowCount: 0,
          validationIssues: validation.issues,
        }),
        timestamp: new Date().toISOString(),
      }
      return res.json(response)
    }

    const updatedAt = new Date().toISOString()
    const companyId = expandedTemplateOperations.generationContexts.length > 0
      ? await getProjectCompanyId(projectId)
      : null
    if (expandedTemplateOperations.generationContexts.length > 0 && !companyId) {
      throw Object.assign(new Error('Baseline template generation requires project company scope for duration learning lineage.'), {
        code: 'BASELINE_TEMPLATE_DURATION_LEARNING_COMPANY_SCOPE_REQUIRED',
      })
    }

    let currentItems: TaskBaselineItem[] = []
    let rows: TaskBaselineItem[] = []
    let tempIdMap = new Map<string, string>()
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const lockedBaseline = await client.query(
        `SELECT *
           FROM public.task_baselines
          WHERE id = $1
            AND project_id = $2
            AND status IN ('draft', 'revising')
          FOR UPDATE`,
        [id, baseline.project_id],
      )
      if (lockedBaseline.rows.length !== 1) {
        throw Object.assign(new Error('Baseline draft state changed before commit.'), {
          statusCode: 409,
          code: 'INVALID_STATE',
        })
      }

      currentItems = await getBaselineItemsWithClient(client, id, baseline.project_id)
      const applied = applyBaselineCommitOperations(currentItems, operations)
      tempIdMap = applied.tempIdMap
      rows = await replaceBaselineDraftItems(
        id,
        baseline.project_id,
        applied.items,
        client,
        currentItems,
      )
      const baselineUpdate = await client.query(
        `UPDATE public.task_baselines
            SET updated_at = $3
          WHERE id = $1
            AND project_id = $2
            AND status IN ('draft', 'revising')
          RETURNING id`,
        [id, baseline.project_id, updatedAt],
      )
      if (baselineUpdate.rows.length !== 1) {
        throw Object.assign(new Error('Baseline draft state changed before commit.'), {
          statusCode: 409,
          code: 'INVALID_STATE',
        })
      }

      const transactionDurationLearningRuntimeQueryExec: DurationLearningRuntimePublicationQueryExec = async <T = Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) => {
        // database-query-dynamic-approved: canonical 315 trusted-consumption writers own fixed parameterized SQL; this adapter binds them to the baseline materialization transaction.
        const result = await client.query(sql, params as any[])
        return (result.rows ?? []) as T[]
      }
      for (const generationContext of expandedTemplateOperations.generationContexts) {
        const generated = generationContext.generated
        const runtimeArtifactPublications = generationContext.runtimeArtifactPublications
        await persistDurationLearningRuntimeConsumptions({
          queryExec: transactionDurationLearningRuntimeQueryExec,
          build: {
            companyId: companyId!,
            projectId,
            consumerKey: 'wbsTemplateGenerationService',
            consumerSurface: 'baseline_commit',
            generationBatchId: generated.generationBatchId,
            templateIds: generated.templateIds,
            rows: generated.rows,
            runtimeArtifactPublications,
            subjectType: 'baseline_item',
            subjectIdByClientRowId: tempIdMap,
          },
        })
        const operation = generationContext.operation
        const operationRecord = operation as Record<string, unknown>
        const generatedItemIds = generated.rows
          .map((row) => tempIdMap.get(row.clientRowId))
          .filter((itemId): itemId is string => Boolean(itemId))
        const wbsCandidateAnchorItemId = generatedItemIds[0]
        await enqueueDurationLearningRuntimeEvidenceBatch({
          queryExec: transactionDurationLearningRuntimeQueryExec,
          events: wbsCandidateAnchorItemId
            ? [buildWbsCandidateOutboxEvent({
                companyId: companyId!,
                projectId,
                subjectType: 'baseline_item',
                subjectId: wbsCandidateAnchorItemId,
                runtimeArtifactPublications,
                candidate: {
                  companyId: companyId!,
                  projectId,
                  surface: 'baseline',
                  generationBatchId: generated.generationBatchId,
                  templateId: String(operationRecord.templateId ?? ''),
                  selectedNodeIds: Array.isArray(operationRecord.selectedNodeIds) ? operationRecord.selectedNodeIds : [],
                  scope: operationRecord.scope && typeof operationRecord.scope === 'object'
                    ? operationRecord.scope as Record<string, unknown>
                    : {},
                  attachUnderRowId: String(operationRecord.attachUnderRowId ?? ''),
                  generatedRowCount: generated.rows.length,
                  retainedRowCount: generated.rows.length,
                  rejectedRowCount: 0,
                  generatedEntityIds: generatedItemIds,
                  durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generated.rows),
                  actorId: req.user?.id ?? null,
                  metadata: {
                    baselineId: id,
                    generationDepth: generated.generationDepth,
                    retainedRowCount: generated.rows.length,
                    source: 'baseline_commit',
                    ...(generated.durationAssetUtilizationSummary
                      ? { durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary }
                      : {}),
                  },
                  scheduleTrustGate: generated.scheduleTrustGate,
                },
              })]
            : [],
        })
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
    clearBaselineDetailCache(id)

    // eslint-disable-next-line -- route-level-aggregation-approved
    const deletedRowCount = operations.filter((operation) => readCommitOperationType(operation) === 'delete_row').length
    // eslint-disable-next-line -- route-level-aggregation-approved
    const createdRowCount = tempIdMap.size
    const realtimeRows = summarizePlanningTableRealtimeRows(operations, tempIdMap)
    const revision = Date.now()
    const commitResponse = buildPlanningTableCommitResponse({
      surface: 'baseline',
      resourceId: id,
      revision,
      rows,
      operations,
      createdRowCount,
      deletedRowCount,
      changedRowCount: operations.length,
      validationIssues: validation.issues,
      realtimeEvents: ['planning.table.changed'],
      tempIdMap,
    })

    await writeLog({
      project_id: baseline.project_id,
      entity_type: 'baseline',
      entity_id: id,
      field_name: 'draft_committed',
      old_value: String(currentItems.length),
      new_value: String(rows.length),
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
      action_type: 'baseline_commit',
      action_group: 'edit',
      metadata: {
        surface: 'baseline',
        source: 'baseline_commit',
        operationCount: operations.length,
        governanceSummary: commitResponse.governanceSummary,
        mergeGroupSummary: summarizePlanningTableMergeGroups(operations),
      },
      visibility: 'user',
    })

    broadcastPlanningTableChanged({
      projectId: baseline.project_id,
      surface: 'baseline',
      resourceId: id,
      changedRowIds: realtimeRows.changedRowIds,
      deletedRowIds: realtimeRows.deletedRowIds,
      source: 'baseline_commit',
      revision,
    })
    const response: ApiResponse = {
      success: true,
      data: commitResponse,
      timestamp: updatedAt,
    }
    res.json(response)
  }),
)

router.delete(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    if (!isDraftBaselineStatus(baseline.status)) {
      return res.status(409).json(badRequest('已发布的项目基线不可取消。', 'INVALID_STATE'))
    }

    // v1.4.15: retention decision must block unsafe physical deletes.
    const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
    const retention = await enforceRetentionOrBlock({ entityType: 'task_baseline', entityId: id, projectId: baseline.project_id ?? null, userId: req.user?.id ?? null, userAction: 'delete' })
    if (retention.blocked) {
      return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
    }

    await cleanupBaselineDraft(id, baseline.project_id)

    const response: ApiResponse<{ deleted: true; id: string }> = {
      success: true,
      data: { deleted: true, id },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/:id/publish',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const expectedVersion = getNumericVersion(req.body?.version)

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    const currentBusinessVersion = getNumericVersion(baseline.version)
    if (currentBusinessVersion != null && expectedVersion != null && currentBusinessVersion !== expectedVersion) {
      return res.status(409).json(badRequest('版本号已变化，请刷新后重试', 'VERSION_CONFLICT'))
    }
    const publicationCause = parseBaselinePublicationCause(req.body)
    if (publicationCause.ok === false) {
      return res.status(400).json(badRequest(publicationCause.message, publicationCause.code))
    }

    try {
      await draftLockService.acquireDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
      })
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }

    try {
      let items = await getBaselineItems(id)
      const readiness = evaluateBaselinePublishReadiness(items)
      if (!readiness.isReady) {
        return res.status(422).json(
          badRequest(
            `Baseline readiness is insufficient: scheduled ${Math.round(readiness.scheduledRatio * 100)}%, mapped ${Math.round(readiness.mappedRatio * 100)}%`,
            'VALIDATION_ERROR',
          ),
        )
      }
      const sourceItems = await getBaselineConfirmationSourceItems(baseline)
      const confirmationGate = evaluateBaselineConfirmationGate({ baselineItems: items, sourceItems })
      if (!confirmationGate.isReady) {
        return res
          .status(422)
          .json(badRequest(buildBaselineConfirmationGateMessage(confirmationGate), 'BASELINE_CONFIRMATION_GATE_FAILED'))
      }
      const validity = await evaluateRuntimeBaselineValidity(baseline.project_id, items)
      if (validity.state === 'needs_realign') {
        return res
          .status(422)
          .json(badRequest(buildBaselineValidityMessage(validity), 'REQUIRES_REALIGNMENT'))
      }
      const transitionContext = await buildTransitionContext(baseline.project_id, expectedVersion ?? 0)
      const transitionEvent = baseline.status === 'revising' ? 'SUBMIT_REVISION' : 'CONFIRM'
      const nextStatus = planningStateMachine.transition(baseline.status, transitionEvent, {
        ...transitionContext,
        revision_ready: transitionEvent === 'SUBMIT_REVISION' ? true : undefined,
      })
      const confirmedAt = new Date().toISOString()
      const publication = await persistBaselinePublication({
        baseline,
        items,
        nextStatus,
        currentBusinessVersion,
        confirmedAt,
        confirmedBy: req.user?.id ?? null,
        projectId: baseline.project_id,
        cause: publicationCause.value,
      })
      const data = publication.baseline
      items = publication.items

      await Promise.all(publication.archivedBaselines.map((archivedBaseline) => writeLog({
        project_id: archivedBaseline.project_id,
        entity_type: 'baseline',
        entity_id: archivedBaseline.id,
        field_name: 'status',
        old_value: archivedBaseline.status,
        new_value: 'archived',
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })))
      broadcastPlanningTableChanged({
        projectId: baseline.project_id,
        surface: 'baseline',
        resourceId: id,
        changedRowIds: items.map((item) => item.id),
        source: 'baseline_publish',
        revision: confirmedAt,
      })

      const responseData = normalizeBaselineRow(
        data,
        items,
        nextStatus === 'confirmed' ? id : await getCurrentExecutionBaselineId(baseline.project_id),
      ) as BaselineApiRow & {
        items: TaskBaselineItem[]
      }
      const response: ApiResponse<BaselineApiRow & {
        items: TaskBaselineItem[]
      }> = {
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    } finally {
      try {
        await draftLockService.releaseDraftLock({
          projectId: baseline.project_id,
          draftType: 'baseline',
          resourceId: id,
          actorUserId: req.user?.id ?? 'system',
          actorRole: await draftLockService.getProjectRole(baseline.project_id, req.user?.id ?? 'system'),
          reason: 'manual_release',
        })
      } catch (error) {
        if (!(error instanceof PlanningDraftLockServiceError) || error.code !== 'NOT_FOUND') {
          logger.warn('[task-baselines] failed to release draft lock after publish', { baselineId: id, error })
        }
      }
    }
  })
)

router.post(
  '/:id/confirm',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const expectedVersion = getNumericVersion(req.body?.version)

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    const currentBusinessVersion = getNumericVersion(baseline.version)
    if (currentBusinessVersion != null && expectedVersion != null && currentBusinessVersion !== expectedVersion) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }
    const publicationCause = parseBaselinePublicationCause(req.body)
    if (publicationCause.ok === false) {
      return res.status(400).json(badRequest(publicationCause.message, publicationCause.code))
    }

    try {
      await draftLockService.acquireDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
      })
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }

    try {
      let items = await getBaselineItems(id)
      const readiness = evaluateBaselinePublishReadiness(items)
      if (!readiness.isReady) {
        return res.status(422).json(
          badRequest(
            `Baseline readiness is insufficient: scheduled ${Math.round(readiness.scheduledRatio * 100)}%, mapped ${Math.round(readiness.mappedRatio * 100)}%`,
            'VALIDATION_ERROR',
          ),
        )
      }
      const sourceItems = await getBaselineConfirmationSourceItems(baseline)
      const confirmationGate = evaluateBaselineConfirmationGate({ baselineItems: items, sourceItems })
      if (!confirmationGate.isReady) {
        return res
          .status(422)
          .json(badRequest(buildBaselineConfirmationGateMessage(confirmationGate), 'BASELINE_CONFIRMATION_GATE_FAILED'))
      }
      const validity = await evaluateRuntimeBaselineValidity(baseline.project_id, items)
      if (validity.state === 'needs_realign') {
        return res
          .status(422)
          .json(badRequest(buildBaselineValidityMessage(validity), 'REQUIRES_REALIGNMENT'))
      }
      const transitionContext = await buildTransitionContext(baseline.project_id, expectedVersion ?? 0)
      const transitionEvent = baseline.status === 'revising' ? 'SUBMIT_REVISION' : 'CONFIRM'
      const nextStatus = planningStateMachine.transition(baseline.status, transitionEvent, {
        ...transitionContext,
        revision_ready: transitionEvent === 'SUBMIT_REVISION' ? true : undefined,
      })
      const confirmedAt = new Date().toISOString()
      const publication = await persistBaselinePublication({
        baseline,
        items,
        nextStatus,
        currentBusinessVersion,
        confirmedAt,
        confirmedBy: req.user?.id ?? null,
        projectId: baseline.project_id,
        cause: publicationCause.value,
      })
      const data = publication.baseline
      items = publication.items

      await Promise.all(publication.archivedBaselines.map((archivedBaseline) => writeLog({
        project_id: archivedBaseline.project_id,
        entity_type: 'baseline',
        entity_id: archivedBaseline.id,
        field_name: 'status',
        old_value: archivedBaseline.status,
        new_value: 'archived',
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })))
      broadcastPlanningTableChanged({
        projectId: baseline.project_id,
        surface: 'baseline',
        resourceId: id,
        changedRowIds: items.map((item) => item.id),
        source: 'baseline_publish',
        revision: confirmedAt,
      })

      const responseData = normalizeBaselineRow(
        data,
        items,
        nextStatus === 'confirmed' ? id : await getCurrentExecutionBaselineId(baseline.project_id),
      ) as BaselineApiRow & {
        items: TaskBaselineItem[]
      }
      const response: ApiResponse<BaselineApiRow & {
        items: TaskBaselineItem[]
      }> = {
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    } finally {
      try {
        await draftLockService.releaseDraftLock({
          projectId: baseline.project_id,
          draftType: 'baseline',
          resourceId: id,
          actorUserId: req.user?.id ?? 'system',
          actorRole: await draftLockService.getProjectRole(baseline.project_id, req.user?.id ?? 'system'),
          reason: 'manual_release',
        })
      } catch (error) {
        if (!(error instanceof PlanningDraftLockServiceError) || error.code !== 'NOT_FOUND') {
          logger.warn('[task-baselines] failed to release draft lock after confirm', { baselineId: id, error })
        }
      }
    }
  })
)

router.post(
  '/:id/queue-realignment',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const expectedVersion = getNumericVersion(req.body?.version)

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    const currentBusinessVersion = getNumericVersion(baseline.version)
    if (currentBusinessVersion != null && expectedVersion != null && currentBusinessVersion !== expectedVersion) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(baseline.status, 'QUEUE_REALIGNMENT', {
        realignment_required: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_baselines')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .eq('project_id', baseline.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearBaselineDetailCache(id)

      await writeLog({
        project_id: baseline.project_id,
        entity_type: 'baseline',
        entity_id: id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getBaselineItems(id)
      const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
      const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
        success: true,
        data: normalizeBaselineRow(data, items, currentExecutionBaselineId),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    }
  })
)

router.post(
  '/:id/resolve-realignment',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const expectedVersion = getNumericVersion(req.body?.version)

    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }
    const currentBusinessVersion = getNumericVersion(baseline.version)
    if (currentBusinessVersion != null && expectedVersion != null && currentBusinessVersion !== expectedVersion) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(baseline.status, 'RESOLVE_REALIGNMENT', {
        realignment_resolved: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_baselines')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .eq('project_id', baseline.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearBaselineDetailCache(id)

      await writeLog({
        project_id: baseline.project_id,
        entity_type: 'baseline',
        entity_id: id,
        field_name: 'status',
        old_value: baseline.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getBaselineItems(id)
      const currentExecutionBaselineId = await getCurrentExecutionBaselineId(baseline.project_id)
      const response: ApiResponse<BaselineApiRow & { items: TaskBaselineItem[] }> = {
        success: true,
        data: normalizeBaselineRow(data, items, currentExecutionBaselineId),
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const planningError = mapPlanningTransitionError(error)
      if (planningError) {
        return res.status(409).json(badRequest(planningError.message, planningError.code))
      }
      throw error
    }
  })
)

router.get(
  '/:id/revision-pool',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const data = await listRevisionPoolCandidates(baseline.id, baseline.project_id)
    const response: ApiResponse<ObservationPoolReadResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/revision-pool',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const data = await submitObservationPoolItems({
        baseline,
        payload: {
          project_id: baseline.project_id,
          baseline_version_id: baseline.id,
          items: Array.isArray(req.body?.items) ? req.body.items : [],
        } satisfies ObservationPoolSubmitRequest,
      })

      const response: ApiResponse<ObservationPoolSubmitResponse> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    } catch (error) {
      if (error instanceof PlanningRevisionPoolServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.post(
  '/:id/revisions',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const baseline = await getBaselineRecord(req.params.id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const data: RevisionSubmitResponse = await startRevisionFromBaseline({
        baseline,
        actorUserId: req.user?.id ?? null,
        reason: String(req.body?.reason ?? '').trim() || 'manual_revision',
        sourceCandidateIds: Array.isArray(req.body?.source_candidate_ids)
          ? req.body.source_candidate_ids.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
          : Array.isArray(req.body?.sourceCandidateIds)
            ? req.body.sourceCandidateIds.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
            : undefined,
        idempotencyKey: String(
          req.headers['idempotency-key']
          ?? req.body?.idempotency_key
          ?? req.body?.idempotencyKey
          ?? '',
        ).trim() || null,
      })

      const response: ApiResponse<RevisionSubmitResponse> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    } catch (error) {
      if (error instanceof PlanningRevisionPoolServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.get(
  '/:id/lock',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    const lock = await draftLockService.getDraftLock(baseline.project_id, 'baseline', id)
    if (!lock) {
      return res.status(404).json(badRequest('draft lock not found', 'NOT_FOUND'))
    }

    const response: ApiResponse<{ lock: PlanningDraftLockRecord }> = {
      success: true,
      data: { lock },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/lock',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const baseline = await getBaselineRecord(req.params.id)
    return baseline?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const baseline = await getBaselineRecord(id)
    if (!baseline) {
      return res.status(404).json(badRequest('项目基线不存在', 'NOT_FOUND'))
    }

    try {
      const lock = await draftLockService.acquireDraftLock({
        projectId: baseline.project_id,
        draftType: 'baseline',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
      })
      const response: ApiResponse<{ lock: PlanningDraftLockRecord }> = {
        success: true,
        data: { lock },
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: unknown) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

async function getBaselineProjectId(baselineId: string): Promise<string | undefined> {
  if (!baselineId) return undefined
  const { data } = await supabase
    .from('task_baselines')
    .select('project_id')
    .eq('id', baselineId)
    .maybeSingle()
  return (data as any)?.project_id ?? undefined
}

// ============================================================
// v1.4.7.3 §12.5: Baseline diff endpoint
// GET /api/task-baselines/:id/diff?compareTo=current
// ============================================================
router.get(
  '/:id/diff',
  requireProjectMember((req) => {
    return getBaselineProjectId(String(req.params.id ?? '').trim())
  }),
  asyncHandler(async (req, res) => {
    const baselineId = String(req.params.id ?? '').trim()

    if (!baselineId) {
      return res.status(400).json(badRequest('id is required'))
    }

    // Fetch baseline
    const { data: baseline, error: baselineError } = await supabase
      .from('task_baselines')
      .select('*')
      .eq('id', baselineId)
      .single()

    if (baselineError || !baseline) {
      return res.status(404).json(badRequest('baseline not found', 'NOT_FOUND'))
    }

    // Fetch items
    const { data: items, error: itemsError } = await supabase
      .from('task_baseline_items')
      .select('*')
      .eq('baseline_version_id', baselineId)
      .eq('project_id', baseline.project_id)
      .order('sort_order', { ascending: true })

    if (itemsError) throw itemsError

    // Fetch comparison data if requested
    let compareLabel = '当前任务列表'
    let diffItems: any[] = (items ?? []).map((item: any) => ({
      ...item,
      diffType: 'unchanged' as const,
      fromVersionLabel: formatBaselineBusinessVersionLabel(baseline),
      toVersionLabel: '当前任务列表',
    }))

    const compareTo = String(req.query.compareTo ?? '').trim()
    if (compareTo === 'current') {
      // Compare with current execution baseline
      const { data: currentExecution } = await supabase
        .from('task_baselines')
        .select('*')
        .eq('project_id', baseline.project_id)
        .in('status', ['confirmed', 'pending_realign'])
        .order('version', { ascending: false })
        .limit(1)

      if (currentExecution?.[0] && currentExecution[0].id !== baselineId) {
        const currentBaseline = currentExecution[0]
        compareLabel = formatBaselineBusinessVersionLabel(currentBaseline)

        const { data: currentItems } = await supabase
          .from('task_baseline_items')
          .select('*')
          .eq('baseline_version_id', currentBaseline.id)
          .eq('project_id', baseline.project_id)

        const currentBySourceTask = new Map((currentItems ?? []).map((ci: any) => [ci.source_task_id, ci]))
        const baselineSourceIds = new Set((items ?? []).map((bi: any) => bi.source_task_id).filter(Boolean))

        diffItems = (items ?? []).map((item: any) => {
          const current = currentBySourceTask.get(item.source_task_id)
          if (!current) return { ...item, diffType: 'removed' as const, fromVersionLabel: formatBaselineBusinessVersionLabel(baseline), toVersionLabel: compareLabel }
          const changed: string[] = []
          if (item.title !== current.title) changed.push('title')
          if (item.planned_start_date !== current.planned_start_date) changed.push('planned_start_date')
          if (item.planned_end_date !== current.planned_end_date) changed.push('planned_end_date')
          return {
            ...item,
            diffType: changed.length > 0 ? 'changed_fields' as const : 'unchanged' as const,
            changedFields: changed,
            currentValues: changed.length > 0 ? { title: current.title, planned_start_date: current.planned_start_date, planned_end_date: current.planned_end_date } : undefined,
            fromVersionLabel: formatBaselineBusinessVersionLabel(baseline),
            toVersionLabel: compareLabel,
          }
        })

        // Add items only in current baseline
        const added = (currentItems ?? [])
          .filter((ci: any) => ci.source_task_id && !baselineSourceIds.has(ci.source_task_id))
          .map((ci: any) => ({ ...ci, diffType: 'added' as const, fromVersionLabel: formatBaselineBusinessVersionLabel(baseline), toVersionLabel: compareLabel }))
        diffItems = [...diffItems, ...added]
      }
    }

    res.json({
      success: true,
      data: { baselineId, fromVersionLabel: formatBaselineBusinessVersionLabel(baseline), toVersionLabel: compareLabel, items: diffItems },
      timestamp: new Date().toISOString(),
    })
  }),
)

export default router
