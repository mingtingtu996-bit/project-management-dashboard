import { v4 as uuidv4 } from 'uuid'
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validateIdParam } from '../middleware/validation.js'
import { getClient, query as rawQuery } from '../database.js'
import { supabase } from '../services/dbService.js'
import { planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'
import {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} from '../services/planningDraftLockService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
import { PlanningIntegrityService } from '../services/planningIntegrityService.js'
import { writeLog } from '../services/changeLogs.js'
import { hasMonthlyPlanVersion } from '../services/baselineGovernanceService.js'
import { resolveMonthlyPlanGenerationSourceV1474 } from '../services/monthlyPlanGenerationService.js'
import { classifyMonthlyPlanCloseout } from '../services/monthlyPlanCloseoutService.js'
import {
  countMonthlyPlanPendingCloseoutItems,
  evaluateMonthlyPlanConfirmationReadiness,
  getMonthlyPlanFulfillmentTrend,
  getMonthlyPlanPendingCloseoutCounts,
  type MonthlyPlanConfirmationReadiness,
  type MonthlyPlanFulfillmentTrendItem,
} from '../services/monthlyPlanSummaryService.js'
import { dataQualityService } from '../services/dataQualityService.js'
import { insertRowReturning, insertRowsReturning } from '../services/transactionInsertService.js'
import {
  attachTaskFactSnapshots,
  inheritSnapshotFieldsFromBaselineItem,
  inheritSnapshotFieldsFromMonthlyPlanItem,
  recordMonthlySnapshotLineage,
} from '../services/planningSnapshotService.js'
import {
  buildPlanningTableCommitResponse,
  buildFieldRegistryStaleResponse,
  isPlanningFieldRegistryVersionCurrent,
  summarizePlanningTableMergeGroups,
  summarizePlanningTableRealtimeRows,
} from '../services/planningTableCommitService.js'
import { broadcastPlanningTableChanged } from '../services/planningRealtimeEventService.js'
import {
  buildPlanningTableValidationErrorResponse,
  readPlanningTableOperationRowId as readCommitRowId,
  readPlanningTableOperationType as readCommitOperationType,
  readPlanningTableOperationValues as readCommitValues,
  validatePlanningTableCommitRequest,
} from '../services/planningTableValidationService.js'
import type { ApiResponse } from '../types/index.js'
import type { PlanningTransitionContext } from '../types/planning.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import type { MonthlyPlan, MonthlyPlanItem, PlanningDraftLockRecord, TaskBaselineItem } from '../types/db.js'

const router = Router()
const draftLockService = new PlanningDraftLockService()
const planningIntegrityService = new PlanningIntegrityService()
const MAX_CREATE_ATTEMPTS = 3
const MONTHLY_PLAN_DETAIL_CACHE_TTL_MS = 5000

type UniqueConstraintErrorLike = {
  code?: string
  message?: string
}

type MonthlyPlanVersionRow = {
  version?: number | string | null
}

type MonthlyPlanRowInput = Partial<MonthlyPlan>
type MonthlyPlanSourceMode = 'baseline' | 'schedule' | 'mixed' | 'manual' | 'imported'

type MonthlyPlanItemInput = Partial<MonthlyPlanItem> & {
  id?: string
  name?: string | null
}

type MonthlyPlanDetailCacheEntry = {
  expiresAt: number
  plan: MonthlyPlan
  items: MonthlyPlanItem[]
}

const monthlyPlanDetailCache = new Map<string, MonthlyPlanDetailCacheEntry>()
function getCachedMonthlyPlanDetail(id: string) {
  const cached = monthlyPlanDetailCache.get(id)
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached
}

function setCachedMonthlyPlanDetail(id: string, plan: MonthlyPlan, items: MonthlyPlanItem[]) {
  monthlyPlanDetailCache.set(id, {
    expiresAt: Date.now() + MONTHLY_PLAN_DETAIL_CACHE_TTL_MS,
    plan,
    items,
  })
}

function clearMonthlyPlanDetailCache(id?: string | null) {
  if (id) {
    monthlyPlanDetailCache.delete(id)
    return
  }
  monthlyPlanDetailCache.clear()
}

type BatchSelectionRange = {
  start_sort_order?: unknown
  end_sort_order?: unknown
}

type BatchSelectionBody = {
  item_ids?: unknown
  range?: BatchSelectionRange | null
  scope?: unknown
}

type PlanningCommitOperation = PlanningTableOperation

router.use(authenticate)

function badRequest(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

function normalizeMonthlyPlanSourceMode(value: unknown): MonthlyPlanSourceMode | null {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'baseline' ||
    normalized === 'schedule' ||
    normalized === 'mixed' ||
    normalized === 'manual' ||
    normalized === 'imported'
  ) {
    return normalized
  }
  return null
}

const MONTHLY_MANUAL_OVERRIDE_FIELDS = [
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'commitment_status',
  'notes',
] as const

type MonthlyManualOverrideField = typeof MONTHLY_MANUAL_OVERRIDE_FIELDS[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeManualOverrideFields(value: unknown): Partial<Record<MonthlyManualOverrideField, boolean>> {
  if (!isRecord(value)) return {}
  return MONTHLY_MANUAL_OVERRIDE_FIELDS.reduce<Partial<Record<MonthlyManualOverrideField, boolean>>>((fields, field) => {
    if (value[field] === true) fields[field] = true
    return fields
  }, {})
}

function hasManualOverrideFields(value: unknown) {
  const fields = normalizeManualOverrideFields(value)
  return MONTHLY_MANUAL_OVERRIDE_FIELDS.some((field) => fields[field] === true)
}

function mergeManualOverrideFields(
  current: unknown,
  changedFields: Iterable<string>,
): Partial<Record<MonthlyManualOverrideField, boolean>> {
  const merged = normalizeManualOverrideFields(current)
  for (const field of changedFields) {
    if ((MONTHLY_MANUAL_OVERRIDE_FIELDS as readonly string[]).includes(field)) {
      merged[field as MonthlyManualOverrideField] = true
    }
  }
  return merged
}

function getManualOverrideFieldsFromPatch(patch: Record<string, unknown>) {
  return MONTHLY_MANUAL_OVERRIDE_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(patch, field))
}

function applyManualOverridePatch<T extends MonthlyPlanItemInput>(item: T, patch: Record<string, unknown>): T {
  const changedFields = getManualOverrideFieldsFromPatch(patch)
  if (changedFields.length === 0) return { ...item, ...patch }
  return {
    ...item,
    ...patch,
    manual_override_fields: mergeManualOverrideFields(item.manual_override_fields, changedFields),
  }
}

function normalizePlanRow(row: MonthlyPlanRowInput, items: MonthlyPlanItem[] = []): MonthlyPlan & { items: MonthlyPlanItem[] } {
  return {
    ...(row as MonthlyPlan),
    items,
  }
}

function mapMonthlyItem(
  row: MonthlyPlanItemInput,
  planVersionId: string,
  projectId: string,
  index: number,
): MonthlyPlanItem {
  return {
    id: String(row.id ?? uuidv4()),
    project_id: projectId,
    monthly_plan_version_id: planVersionId,
    baseline_item_id: row.baseline_item_id ?? null,
    carryover_from_item_id: row.carryover_from_item_id ?? null,
    source_task_id: row.source_task_id ?? null,
    title: String(row.title ?? `月度计划条目 ${index + 1}`),
    planned_start_date: row.planned_start_date ?? null,
    planned_end_date: row.planned_end_date ?? null,
    target_progress: row.target_progress ?? null,
    current_progress: row.current_progress ?? null,
    sort_order: Number(row.sort_order ?? index),
    is_milestone: Boolean(row.is_milestone),
    is_critical: Boolean(row.is_critical),
    commitment_status: row.commitment_status ?? 'planned',
    notes: row.notes ?? null,
    engineering_category_id: row.engineering_category_id ?? null,
    wbs_node_type: row.wbs_node_type ?? null,
    wbs_path: row.wbs_path ?? null,
    is_wbs_summary: row.is_wbs_summary ?? null,
    is_executable: row.is_executable ?? null,
    standard_work_code: row.standard_work_code ?? null,
    standard_work_name: row.standard_work_name ?? null,
    duration_calibration_source: row.duration_calibration_source ?? null,
    duration_provenance: row.duration_provenance ?? null,
    scope_snapshot: row.scope_snapshot ?? {},
    wbs_snapshot: row.wbs_snapshot ?? {},
    task_fact_snapshot: row.task_fact_snapshot ?? {},
    task_code_snapshot: row.task_code_snapshot ?? null,
    status_snapshot: row.status_snapshot ?? {},
    manual_override_fields: normalizeManualOverrideFields(row.manual_override_fields),
    generation_metadata: isRecord(row.generation_metadata) ? row.generation_metadata : {},
    last_generated_at: row.last_generated_at ?? null,
    snapshot_source: row.snapshot_source
      ?? (row.carryover_from_item_id
        ? 'monthly_commitment_snapshot'
        : row.baseline_item_id
          ? 'baseline_commitment_snapshot'
          : 'current_execution_fact'),
    snapshot_captured_at: row.snapshot_captured_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }
}

function isUuidLike(value?: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function normalizeMonthlyCommitField(field: string, value: unknown): Record<string, unknown> {
  if (field === 'start' || field === 'start_date') return { planned_start_date: value || null }
  if (field === 'end' || field === 'end_date') return { planned_end_date: value || null }
  if (field === 'progress' || field === 'current_progress') {
    const progress = value === '' || value === null || value === undefined ? null : Number(value)
    return { target_progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress as number))) : null }
  }
  if (field === 'milestone') return { is_milestone: Boolean(value) }
  return { [field]: value === '' ? null : value }
}

function normalizeMonthlyCommitValues(values: Record<string, unknown>) {
  return Object.entries(values).reduce<Record<string, unknown>>((patch, [field, value]) => {
    Object.assign(patch, normalizeMonthlyCommitField(field, value))
    return patch
  }, {})
}

function applyMonthlyCommitOperations(
  currentItems: MonthlyPlanItem[],
  operations: PlanningCommitOperation[],
) {
  const tempIdMap = new Map<string, string>()
  let items: MonthlyPlanItemInput[] = currentItems.map((item) => ({ ...item }))

  for (const operation of operations) {
    const operationType = readCommitOperationType(operation)

    if (operationType === 'create_row') {
      const clientRowId = String(operation.clientRowId ?? operation.tempId ?? '').trim()
      const generatedId = isUuidLike(clientRowId) ? clientRowId : uuidv4()
      if (clientRowId) tempIdMap.set(clientRowId, generatedId)
      const values = normalizeMonthlyCommitValues(readCommitValues(operation))
      items.push({
        ...values,
        id: generatedId,
        sort_order: Number.isFinite(Number(operation.sortOrder)) ? Number(operation.sortOrder) : items.length,
        source_chip: 'new',
        source_reason: 'Manually added in monthly plan draft.',
        manual_override_fields: mergeManualOverrideFields({}, Object.keys(values)),
      } as MonthlyPlanItemInput)
      continue
    }

    if (operationType === 'delete_row') {
      const rowId = readCommitRowId(operation)
      if (rowId) items = items.filter((item) => String(item.id ?? '').trim() !== rowId)
      continue
    }

    const rowId = readCommitRowId(operation)
    if (!rowId) continue

    items = items.map((item) => {
      if (String(item.id ?? '') !== rowId) return item

      if (operationType === 'update_cell') {
        const field = String(operation.field ?? '').trim()
        return field ? applyManualOverridePatch(item, normalizeMonthlyCommitField(field, operation.value)) : item
      }

      if (operationType === 'update_row') {
        return applyManualOverridePatch(item, normalizeMonthlyCommitValues(readCommitValues(operation)))
      }

      if (operationType === 'move_row') {
        return {
          ...item,
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

  return {
    items: items.map((item, index) => ({
      ...item,
      sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index,
    })),
    tempIdMap,
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as UniqueConstraintErrorLike
  const message = String(candidate.message ?? '')
  return candidate.code === '23505' || /duplicate key|unique constraint/i.test(message)
}

async function getLatestVersion(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from('monthly_plans')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  const latest = (data?.[0] as MonthlyPlanVersionRow | undefined)?.version
  return Number(latest ?? 0)
}

async function getPlanItems(planId: string, projectId?: string | null): Promise<MonthlyPlanItem[]> {
  const resolvedProjectId = projectId ?? (await resolvePlanProjectId(planId))
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = resolvedProjectId
        ? await rawQuery(
            'SELECT * FROM public.monthly_plan_items WHERE monthly_plan_version_id = $1 AND project_id = $2 ORDER BY sort_order ASC',
            [planId, resolvedProjectId],
          )
        : await rawQuery(
            'SELECT * FROM public.monthly_plan_items WHERE monthly_plan_version_id = $1 ORDER BY sort_order ASC',
            [planId],
          )
      return attachMonthlyEngineeringCategoryInfo(result.rows as MonthlyPlanItem[])
    } catch (error) {
      logger.warn('[monthly-plans] direct plan item read failed, falling back to Supabase REST', {
        planId,
        projectId: resolvedProjectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let query = supabase
    .from('monthly_plan_items')
    .select('*')
    .eq('monthly_plan_version_id', planId)

  if (resolvedProjectId) {
    query = query.eq('project_id', resolvedProjectId)
  }

  query = query.order('sort_order', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return attachMonthlyEngineeringCategoryInfo((data ?? []) as MonthlyPlanItem[])
}

async function attachMonthlyEngineeringCategoryInfo(items: MonthlyPlanItem[]): Promise<MonthlyPlanItem[]> {
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
      logger.warn('[monthly-plans] direct engineering category read failed, falling back to Supabase REST', {
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

type PlanTaskRow = {
  id: string
  title?: string | null
  name?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_end_date?: string | null
  progress?: number | null
  status?: string | null
}

type MonthlyPlanChangeSummaryResponse = {
  addedCount: number
  removedCount: number
  dateShiftCount: number
  progressAdjustmentCount: number
  milestoneAdjustCount: number
  totalChangeCount: number
  threshold: number
  isLargeScale: boolean
}

type MonthlyPlanCloseoutSummaryResponse = {
  totalCount: number
  processedCount: number
  remainingCount: number
  autoAdoptableCount: number
  completedCount: number
  carryoverCount: number
  cancelledCount: number
  attentionCount: number
}

type MonthlyPlanCloseoutAutoAdoptResponse = MonthlyPlanCloseoutSummaryResponse & {
  processedIds: string[]
}

type MonthlyPlanCloseoutConfirmSummaryResponse = {
  rolledInCount: number
  closedCount: number
  manualOverrideCount: number
  archiveConfirmationCount: number
  attentionCount: number
}

type MonthlyPlanCorrectionChangeInput = {
  item_id: string
  planned_start_date?: string | null
  planned_end_date?: string | null
  target_progress?: number | null
  notes?: string | null
  commitment_status?: MonthlyPlanItem['commitment_status']
}

type MonthlyPlanCorrectionPayload = {
  monthly_plan_id?: string
  monthly_plan_version?: number
  reason?: string
  requested_changes?: MonthlyPlanCorrectionChangeInput[]
  requested_by?: string | null
  requested_at?: string
  approved_by?: string | null
  approved_at?: string
  executed_by?: string | null
  executed_at?: string
  workflow_state?: 'requested' | 'approved' | 'executed'
  touched_item_ids?: string[]
} & Record<string, unknown>

type MonthlyPlanCorrectionRequestResponse = {
  correctionId: string
  planId: string
  status: 'requested'
  changeCount: number
}

type MonthlyPlanCorrectionReviewResponse = {
  correctionId: string
  planId: string
  status: 'approved' | 'executed'
  changeCount: number
  touchedCount?: number
}

type MonthlyPlanConfirmSummaryResponse = {
  totalItemCount: number
  newlyAddedCount: number
  autoRolledInCount: number
  pendingRemovalCount: number
  milestoneCount: number
  dateAdjustmentCount: number
  progressAdjustmentCount: number
  blockingIssueCount: number
  conditionIssueCount: number
  obstacleIssueCount: number
  delayIssueCount: number
  mappingIssueCount: number
  requiredFieldIssueCount: number
  confirmationReadiness: MonthlyPlanConfirmationReadiness
}

type ProjectBlockingIssueBreakdown = {
  conditionIssueCount: number
  obstacleIssueCount: number
  delayIssueCount: number
  mappingIssueCount: number
  requiredFieldIssueCount: number
  blockingIssueCount: number
}

async function getTasksForPlanItems(projectId: string, items: MonthlyPlanItem[]): Promise<PlanTaskRow[]> {
  const taskIds = [...new Set(items.map((item) => item.source_task_id).filter((taskId): taskId is string => Boolean(taskId)))]
  if (taskIds.length === 0) return []

  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,planned_start_date,planned_end_date,start_date,end_date,actual_end_date,progress,status,engineering_category_id,wbs_node_type')
    .eq('project_id', projectId)
    .in('id', taskIds)

  if (error) throw error
  return (data ?? []) as PlanTaskRow[]
}

async function getMonthlyPlanBundle(planId: string, projectId?: string | null) {
  const plan = await getPlanRecord(planId)
  if (!plan) return null
  if (projectId && plan.project_id !== projectId) return null

  const items = await getPlanItems(planId)
  const tasks = await getTasksForPlanItems(plan.project_id, items)
  return { plan, items, tasks }
}

function buildMonthlyPlanChangeSummary(items: MonthlyPlanItem[], tasks: PlanTaskRow[]): MonthlyPlanChangeSummaryResponse {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  let addedCount = 0
  let removedCount = 0
  let dateShiftCount = 0
  let progressAdjustmentCount = 0
  let milestoneAdjustCount = 0

  for (const item of items) {
    const task = item.source_task_id ? taskMap.get(item.source_task_id) ?? null : null
    const taskStart = task?.planned_start_date ?? task?.start_date ?? null
    const taskEnd = task?.planned_end_date ?? task?.end_date ?? null
    const itemStart = item.planned_start_date ?? null
    const itemEnd = item.planned_end_date ?? null
    const taskProgress = typeof task?.progress === 'number' ? task.progress : null
    const itemProgress = typeof item.target_progress === 'number' ? item.target_progress : null

    if (!item.baseline_item_id && !item.carryover_from_item_id) {
      addedCount += 1
    }
    if (item.commitment_status === 'cancelled') {
      removedCount += 1
    }
    if (task && (taskStart !== itemStart || taskEnd !== itemEnd)) {
      dateShiftCount += 1
    }
    if (task && itemProgress !== taskProgress) {
      progressAdjustmentCount += 1
    } else if (!task && itemProgress !== null) {
      progressAdjustmentCount += 1
    }
    if (item.is_milestone && (taskStart !== itemStart || taskEnd !== itemEnd || itemProgress !== taskProgress)) {
      // eslint-disable-next-line -- route-level-aggregation-approved
      milestoneAdjustCount += 1
    }
  }

  const totalChangeCount =
    addedCount + removedCount + dateShiftCount + progressAdjustmentCount + milestoneAdjustCount
  const threshold = 5

  return {
    addedCount,
    removedCount,
    dateShiftCount,
    progressAdjustmentCount,
    milestoneAdjustCount,
    totalChangeCount,
    threshold,
    isLargeScale: totalChangeCount >= threshold,
  }
}

function buildMonthlyPlanCloseoutSummary(items: MonthlyPlanItem[], tasks: PlanTaskRow[] = []): MonthlyPlanCloseoutSummaryResponse {
  const result = classifyMonthlyPlanCloseout(items, tasks)
  return result.summary
}

function buildMonthlyPlanCloseoutConfirmSummary(items: MonthlyPlanItem[], tasks: PlanTaskRow[] = []): MonthlyPlanCloseoutConfirmSummaryResponse {
  const result = classifyMonthlyPlanCloseout(items, tasks)
  return {
    rolledInCount: result.summary.carryoverCount,
    closedCount: result.summary.completedCount + result.summary.cancelledCount,
    // eslint-disable-next-line -- route-level-aggregation-approved
    manualOverrideCount: items.filter((item) => hasManualOverrideFields(item.manual_override_fields)).length,
    archiveConfirmationCount: 0,
    attentionCount: result.summary.attentionCount,
  }
}

async function getProjectBlockingIssueBreakdown(projectId: string): Promise<ProjectBlockingIssueBreakdown> {
  const integrity = await planningIntegrityService.scanProjectIntegrity(projectId)

  const mappingIssueCount =
    integrity.mapping_integrity.baseline_pending_count +
    integrity.mapping_integrity.baseline_merged_count +
    integrity.mapping_integrity.monthly_carryover_count

  const requiredFieldIssueCount =
    integrity.data_integrity.missing_participant_unit_count +
    integrity.data_integrity.missing_scope_dimension_count +
    integrity.data_integrity.missing_progress_snapshot_count

  const blockingIssueCount = mappingIssueCount + requiredFieldIssueCount

  return {
    conditionIssueCount: 0,
    obstacleIssueCount: 0,
    delayIssueCount: 0,
    mappingIssueCount,
    requiredFieldIssueCount,
    blockingIssueCount,
  }
}

async function buildMonthlyPlanConfirmSummary(
  items: MonthlyPlanItem[],
  tasks: PlanTaskRow[],
  projectId?: string | null,
): Promise<MonthlyPlanConfirmSummaryResponse> {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const summary: MonthlyPlanConfirmSummaryResponse = {
    totalItemCount: items.length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    newlyAddedCount: items.filter((item) => !item.baseline_item_id && !item.carryover_from_item_id).length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    autoRolledInCount: items.filter((item) => item.commitment_status === 'carried_over').length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    pendingRemovalCount: items.filter((item) => item.commitment_status === 'cancelled').length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    milestoneCount: items.filter((item) => Boolean(item.is_milestone)).length,
    dateAdjustmentCount: 0,
    progressAdjustmentCount: 0,
    blockingIssueCount: 0,
    conditionIssueCount: 0,
    obstacleIssueCount: 0,
    delayIssueCount: 0,
    mappingIssueCount: 0,
    requiredFieldIssueCount: 0,
    confirmationReadiness: evaluateMonthlyPlanConfirmationReadiness(items),
  }

  for (const item of items) {
    const task = item.source_task_id ? taskMap.get(item.source_task_id) ?? null : null
    const taskStart = task?.planned_start_date ?? task?.start_date ?? null
    const taskEnd = task?.planned_end_date ?? task?.end_date ?? null
    const itemStart = item.planned_start_date ?? null
    const itemEnd = item.planned_end_date ?? null
    const taskProgress = typeof task?.progress === 'number' ? task.progress : null
    const itemProgress = typeof item.target_progress === 'number' ? item.target_progress : null

    if (task && (taskStart !== itemStart || taskEnd !== itemEnd)) {
      summary.dateAdjustmentCount += 1
    }
    if (task && itemProgress !== taskProgress) {
      summary.progressAdjustmentCount += 1
    } else if (!task && itemProgress !== null) {
      summary.progressAdjustmentCount += 1
    }
  }

  if (projectId) {
    const blockingSummary = await getProjectBlockingIssueBreakdown(projectId)
    summary.blockingIssueCount = blockingSummary.blockingIssueCount
    summary.conditionIssueCount = blockingSummary.conditionIssueCount
    summary.obstacleIssueCount = blockingSummary.obstacleIssueCount
    summary.delayIssueCount = blockingSummary.delayIssueCount
    summary.mappingIssueCount = blockingSummary.mappingIssueCount
    summary.requiredFieldIssueCount = blockingSummary.requiredFieldIssueCount
  }

  return summary
}

async function persistPlanItems(
  planId: string,
  projectId: string,
  items: MonthlyPlanItemInput[] | undefined,
  client?: any,
  generatedAt?: string | null,
): Promise<MonthlyPlanItem[]> {
  if (!Array.isArray(items) || items.length === 0) return []

  const payload = items.map((item, index) => mapMonthlyItem(
    generatedAt ? { ...item, last_generated_at: item.last_generated_at ?? generatedAt } : item,
    planId,
    projectId,
    index,
  ))
  if (client) {
    return insertRowsReturning<MonthlyPlanItem>(client, 'monthly_plan_items', payload)
  }
  const { data, error } = await supabase.from('monthly_plan_items').insert(payload).select('*')
  if (error) throw error
  return (data ?? []) as MonthlyPlanItem[]
}

function normalizeId(value: unknown): string | null {
  const id = String(value ?? '').trim()
  return id || null
}

async function loadBaselineItemsById(projectId: string, baselineItemIds: string[]) {
  if (baselineItemIds.length === 0) return new Map<string, TaskBaselineItem>()

  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('*')
    .eq('project_id', projectId)
    .in('id', baselineItemIds)

  if (error) throw error
  return new Map(((data ?? []) as TaskBaselineItem[]).map((item) => [item.id, item]))
}

async function loadMonthlyPlanItemsById(projectId: string, monthlyPlanItemIds: string[]) {
  if (monthlyPlanItemIds.length === 0) return new Map<string, MonthlyPlanItem>()

  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('*')
    .eq('project_id', projectId)
    .in('id', monthlyPlanItemIds)

  if (error) throw error
  return new Map(((data ?? []) as MonthlyPlanItem[]).map((item) => [item.id, item]))
}

async function enrichMonthlyPlanItemsWithSnapshots(
  projectId: string,
  items: MonthlyPlanItemInput[] | undefined,
): Promise<MonthlyPlanItemInput[] | undefined> {
  if (!Array.isArray(items) || items.length === 0) return items

  const baselineItemIds = [
    ...new Set(items.map((item) => normalizeId(item.baseline_item_id)).filter((id): id is string => Boolean(id))),
  ]
  const carryoverItemIds = [
    ...new Set(items.map((item) => normalizeId(item.carryover_from_item_id)).filter((id): id is string => Boolean(id))),
  ]
  const [baselineItemsById, carryoverItemsById] = await Promise.all([
    loadBaselineItemsById(projectId, baselineItemIds),
    loadMonthlyPlanItemsById(projectId, carryoverItemIds),
  ])

  const inheritedItems = items.map((item) => {
    const carryoverItemId = normalizeId(item.carryover_from_item_id)
    const carryoverItem = carryoverItemId ? carryoverItemsById.get(carryoverItemId) : null
    if (carryoverItem) {
      return {
        ...item,
        ...inheritSnapshotFieldsFromMonthlyPlanItem(carryoverItem),
      }
    }

    const baselineItemId = normalizeId(item.baseline_item_id)
    const baselineItem = baselineItemId ? baselineItemsById.get(baselineItemId) : null
    return baselineItem
      ? {
          ...item,
          ...inheritSnapshotFieldsFromBaselineItem(baselineItem),
        }
      : item
  })

  const directFactIndexes: number[] = []
  const directFactItems: MonthlyPlanItemInput[] = []
  inheritedItems.forEach((item, index) => {
    const carryoverItemId = normalizeId(item.carryover_from_item_id)
    if (carryoverItemId && carryoverItemsById.has(carryoverItemId)) return
    const baselineItemId = normalizeId(item.baseline_item_id)
    if (baselineItemId && baselineItemsById.has(baselineItemId)) return
    if (!normalizeId(item.source_task_id)) return
    directFactIndexes.push(index)
    directFactItems.push(item)
  })

  if (directFactItems.length === 0) return inheritedItems

  const enrichedDirectItems = await attachTaskFactSnapshots(projectId, directFactItems)
  const nextItems = [...inheritedItems]
  directFactIndexes.forEach((itemIndex, directIndex) => {
    nextItems[itemIndex] = enrichedDirectItems[directIndex]
  })
  // v1.4.7.3 §12.3: mark items whose source tasks are missing from baseline
  const monthlySourceTaskIds = new Set(nextItems.map((item) => normalizeId(item.source_task_id)).filter(Boolean))
  const baselineProcessItems = Array.from(baselineItemsById.values()).filter(
    (bi) => bi.wbs_node_type === 'process' || bi.is_executable,
  )
  const missingProcessIds = baselineProcessItems
    .filter((bi) => !monthlySourceTaskIds.has(bi.source_task_id))
    .map((bi) => bi.source_task_id)
    .filter(Boolean)

  if (missingProcessIds.length > 0) {
    for (const item of nextItems) {
      if (item.is_executable || item.wbs_node_type === 'process') {
        ;(item as any).missing_process_in_baseline = missingProcessIds.includes(item.source_task_id)
      }
    }
  }

  return nextItems
}

async function cleanupMonthlyPlanDraft(planId: string, projectId?: string | null) {
  let itemDeleteQuery = supabase.from('monthly_plan_items').delete().eq('monthly_plan_version_id', planId)
  let planDeleteQuery = supabase.from('monthly_plans').delete().eq('id', planId)
  if (projectId) {
    itemDeleteQuery = itemDeleteQuery.eq('project_id', projectId)
    planDeleteQuery = planDeleteQuery.eq('project_id', projectId)
  }
  const [{ error: itemsError }, { error: planError }] = await Promise.all([
    itemDeleteQuery,
    planDeleteQuery,
  ])

  if (itemsError) {
    logger.warn('[monthly-plans] failed to cleanup draft items', { planId, error: itemsError.message })
  }
  if (planError) {
    logger.warn('[monthly-plans] failed to cleanup draft version', { planId, error: planError.message })
  }
  clearMonthlyPlanDetailCache(planId)
}

async function replaceMonthlyPlanDraftItems(
  planId: string,
  projectId: string,
  items: MonthlyPlanItemInput[] | undefined,
): Promise<MonthlyPlanItem[]> {
  const snapshotItems = await enrichMonthlyPlanItemsWithSnapshots(projectId, items)
  const { error: deleteError } = await supabase
    .from('monthly_plan_items')
    .delete()
    .eq('monthly_plan_version_id', planId)
    .eq('project_id', projectId)

  if (deleteError) throw deleteError
  const persisted = await persistPlanItems(planId, projectId, snapshotItems)
  clearMonthlyPlanDetailCache(planId)
  return persisted
}

function canRevokeMonthlyPlan(status: string | null | undefined) {
  return ['draft', 'revising'].includes(String(status ?? '').trim())
}

async function getPlanRecord(id: string) {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery('SELECT * FROM public.monthly_plans WHERE id = $1 LIMIT 1', [id])
      return (result.rows[0] as MonthlyPlan | undefined) ?? null
    } catch (error) {
      logger.warn('[monthly-plans] direct plan record read failed, falling back to Supabase REST', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data, error } = await supabase.from('monthly_plans').select('*').eq('id', id).limit(1)
  if (error) throw error
  return (data?.[0] as MonthlyPlan | undefined) ?? null
}

async function resolvePlanProjectId(planId: string) {
  return (await getPlanRecord(planId))?.project_id ?? null
}

function normalizeItemIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

function shiftDateText(value: string | null | undefined, shiftDays: number) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return value
  parsed.setUTCDate(parsed.getUTCDate() + shiftDays)
  return parsed.toISOString().slice(0, 10)
}

async function resolveBatchMonthlyPlanItems(planId: string, body: BatchSelectionBody) {
  const items = await getPlanItems(planId)
  const itemIds = normalizeItemIds(body.item_ids)

  if (itemIds.length > 0) {
    return items.filter((item) => itemIds.includes(item.id))
  }

  if (body.range && typeof body.range === 'object') {
    const start = Number(body.range.start_sort_order)
    const end = Number(body.range.end_sort_order)
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const min = Math.min(start, end)
      const max = Math.max(start, end)
      return items.filter((item) => {
        const sortOrder = Number(item.sort_order ?? 0)
        return sortOrder >= min && sortOrder <= max
      })
    }
  }

  if (body.scope === 'all') {
    return items
  }

  return []
}

async function updateMonthlyPlanItems(items: MonthlyPlanItem[]) {
  if (items.length === 0) return []
  const { data, error } = await supabase.from('monthly_plan_items').upsert(items).select('*')
  if (error) throw error
  return (data ?? []) as MonthlyPlanItem[]
}

async function countProjectBlockingIssues(projectId: string): Promise<number> {
  const breakdown = await getProjectBlockingIssueBreakdown(projectId)
  return breakdown.blockingIssueCount
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

async function createMonthlyPlanVersion(params: {
  projectId: string
  month: string
  title: string
  description?: string | null
  baselineVersionId?: string | null
  sourceVersionId?: string | null
  sourceVersionLabel?: string | null
  sourceMode?: MonthlyPlanSourceMode | null
  carryoverItemCount?: number
  generationSummary?: unknown
  items?: MonthlyPlanItemInput[]
  actorUserId?: string | null
}) {
  const snapshotItems = await enrichMonthlyPlanItemsWithSnapshots(params.projectId, params.items)

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const version = (await getLatestVersion(params.projectId)) + 1
    const now = new Date().toISOString()
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const sourceMode = params.sourceMode ?? (params.baselineVersionId ? 'baseline' : 'schedule')
      const createdPlan = await insertRowReturning<MonthlyPlan>(client, 'monthly_plans', {
        id: uuidv4(),
        project_id: params.projectId,
        version,
        status: 'draft',
        month: params.month,
        title: params.title,
        description: params.description ?? null,
        baseline_version_id: params.baselineVersionId ?? null,
        source_version_id: params.sourceVersionId ?? null,
        source_version_label: params.sourceVersionLabel ?? null,
        source_mode: sourceMode,
        temporary_without_baseline: sourceMode === 'schedule' && !params.baselineVersionId,
        generation_cutoff_at: now,
        carryover_item_count: Number(params.carryoverItemCount ?? 0),
        governance_metadata: params.generationSummary
          ? {
              algorithm_version: 'v1.4.7.4',
              generation_summary: params.generationSummary,
            }
          : {},
        created_at: now,
        updated_at: now,
      })
      const items = await persistPlanItems(
        createdPlan.id,
        params.projectId,
        snapshotItems,
        client,
        params.generationSummary ? now : null,
      )
      await recordMonthlySnapshotLineage(params.projectId, items, params.actorUserId, client)
      await client.query('COMMIT')
      setCachedMonthlyPlanDetail(createdPlan.id, createdPlan, items)
      return normalizePlanRow(createdPlan, items)
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

  throw new Error('创建月度计划失败，请稍后重试')
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
    let filtered: MonthlyPlan[]
    if (process.env.NODE_ENV !== 'test') {
      try {
        const result = await rawQuery(
          'SELECT * FROM public.monthly_plans WHERE project_id = $1 ORDER BY created_at DESC',
          [projectId],
        )
        filtered = result.rows as MonthlyPlan[]
      } catch (error) {
        logger.warn('[monthly-plans] direct monthly plan list read failed, falling back to Supabase REST', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
        const fallback = await supabase
          .from('monthly_plans')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        if (fallback.error) throw fallback.error
        filtered = (fallback.data ?? []) as MonthlyPlan[]
      }
    } else {
      const { data, error } = await supabase
        .from('monthly_plans')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      filtered = (data ?? []) as MonthlyPlan[]
    }

    const pendingCloseoutCounts = await getMonthlyPlanPendingCloseoutCounts(filtered.map((row) => row.id))
    const response: ApiResponse<MonthlyPlan[]> = {
      success: true,
      data: filtered.map((row) => ({
        ...row,
        pending_closeout_count: pendingCloseoutCounts.get(row.id) ?? row.pending_closeout_count ?? 0,
      })),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id',
  validateIdParam,
  requireProjectMember(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const cached = getCachedMonthlyPlanDetail(id)
    const plan = cached?.plan ?? await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const items = cached?.items ?? await getPlanItems(id, plan.project_id)
    if (!cached) {
      setCachedMonthlyPlanDetail(id, plan, items)
    }
    const pendingCloseoutCount = countMonthlyPlanPendingCloseoutItems(items)
    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: {
        ...normalizePlanRow(plan, items),
        pending_closeout_count: pendingCloseoutCount,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id/change-summary',
  validateIdParam,
  requireProjectMember(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const projectId = await resolvePlanProjectId(req.params.id)
    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const summary = buildMonthlyPlanChangeSummary(bundle.items, bundle.tasks)
    const response: ApiResponse<MonthlyPlanChangeSummaryResponse> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id/closeout-summary',
  validateIdParam,
  requireProjectMember(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const projectId = await resolvePlanProjectId(req.params.id)
    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const summary = buildMonthlyPlanCloseoutSummary(bundle.items, bundle.tasks)
    const response: ApiResponse<MonthlyPlanCloseoutSummaryResponse> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/:id/closeout-auto-adopt',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const projectId = await resolvePlanProjectId(req.params.id)
    if (!projectId) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const closeoutResult = classifyMonthlyPlanCloseout(bundle.items, bundle.tasks)
    const persistedItems = await updateMonthlyPlanItems(closeoutResult.items)
    clearMonthlyPlanDetailCache(req.params.id)
    const persistedResult = classifyMonthlyPlanCloseout(persistedItems, bundle.tasks)
    const processedIds = normalizeItemIds(req.body?.processed_ids ?? req.body?.processedIds)
    const autoAdoptableIds = persistedResult.decisions
      .filter((decision) => decision.classification !== 'needs_attention')
      .map((decision) => decision.itemId)
      .filter((itemId) => !processedIds.includes(itemId))
    const summary = persistedResult.summary
    const response: ApiResponse<MonthlyPlanCloseoutAutoAdoptResponse> = {
      success: true,
      data: {
        ...summary,
        processedIds: autoAdoptableIds,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id/closeout-confirm-summary',
  validateIdParam,
  requireProjectMember(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const projectId = await resolvePlanProjectId(req.params.id)
    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const summary = buildMonthlyPlanCloseoutConfirmSummary(bundle.items, bundle.tasks)
    const response: ApiResponse<MonthlyPlanCloseoutConfirmSummaryResponse> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

function normalizeCorrectionChanges(value: unknown): MonthlyPlanCorrectionChangeInput[] {
  if (!Array.isArray(value)) return []
  return value
    .map<MonthlyPlanCorrectionChangeInput | null>((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const itemId = String(candidate.item_id ?? candidate.itemId ?? '').trim()
      if (!itemId) return null

      const normalized: MonthlyPlanCorrectionChangeInput = {
        item_id: itemId,
        planned_start_date: candidate.planned_start_date === undefined ? undefined : (candidate.planned_start_date as string | null),
        planned_end_date: candidate.planned_end_date === undefined ? undefined : (candidate.planned_end_date as string | null),
        target_progress:
          candidate.target_progress === undefined || candidate.target_progress === null
            ? undefined
            : Number(candidate.target_progress),
        notes: candidate.notes === undefined ? undefined : String(candidate.notes ?? '').trim() || null,
        commitment_status: ['planned', 'carried_over', 'completed', 'cancelled'].includes(String(candidate.commitment_status ?? ''))
          ? (String(candidate.commitment_status) as MonthlyPlanItem['commitment_status'])
          : undefined,
      }

      return normalized
    })
    .filter((item): item is MonthlyPlanCorrectionChangeInput => item !== null)
}

async function loadMonthlyPlanCorrectionState(planId: string, requestId: string) {
  const stateKey = `monthly_plan_correction:${planId}:${requestId}`
  const { data, error } = await supabase
    .from('planning_governance_states')
    .select('*')
    .eq('state_key', stateKey)
    .limit(1)

  if (error) throw error
  return (data?.[0] as {
    id: string
    project_id: string
    state_key: string
    status: string
    kind: string
    payload?: MonthlyPlanCorrectionPayload | null
    source_entity_id?: string | null
    source_entity_type?: string | null
  } | undefined) ?? null
}

router.post(
  '/:id/correction-request',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const plan = await getPlanRecord(req.params.id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const requestedChanges = normalizeCorrectionChanges(req.body?.changes ?? req.body?.requested_changes)
    const reason = String(req.body?.reason ?? req.body?.summary ?? '').trim() || '月度计划修正请求'
    const correctionId = uuidv4()
    const now = new Date().toISOString()

    const { error } = await supabase.from('planning_governance_states').insert({
      id: uuidv4(),
      project_id: plan.project_id,
      state_key: `monthly_plan_correction:${plan.id}:${correctionId}`,
      category: 'ad_hoc',
      kind: 'monthly_plan_correction_request',
      status: 'active',
      severity: 'warning',
      title: `月度计划修正请求 v${plan.version}`,
      detail: reason,
      payload: {
        monthly_plan_id: plan.id,
        monthly_plan_version: plan.version,
        reason,
        requested_changes: requestedChanges,
        requested_by: req.user?.id ?? null,
        requested_at: now,
        workflow_state: 'requested',
      },
      source_entity_type: 'monthly_plan',
      source_entity_id: plan.id,
      active_from: now,
      created_at: now,
      updated_at: now,
    })

    if (error) throw error

    const response: ApiResponse<MonthlyPlanCorrectionRequestResponse> = {
      success: true,
      data: {
        correctionId,
        planId: plan.id,
        status: 'requested',
        changeCount: requestedChanges.length,
      },
      timestamp: now,
    }
    res.status(201).json(response)
  })
)

router.post(
  '/:id/correction-request/:requestId/approve',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const plan = await getPlanRecord(req.params.id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const correction = await loadMonthlyPlanCorrectionState(req.params.id, String(req.params.requestId ?? '').trim())
    if (!correction) {
      return res.status(404).json(badRequest('修正请求不存在', 'NOT_FOUND'))
    }

    const now = new Date().toISOString()
    const payload: MonthlyPlanCorrectionPayload = {
      ...(correction.payload ?? {}),
      approved_by: req.user?.id ?? null,
      approved_at: now,
      workflow_state: 'approved',
    }

    const { error } = await supabase
      .from('planning_governance_states')
      .update({
        payload,
        updated_at: now,
      })
      .eq('state_key', correction.state_key)
      .eq('project_id', plan.project_id)

    if (error) throw error

    const response: ApiResponse<MonthlyPlanCorrectionReviewResponse> = {
      success: true,
      data: {
        correctionId: String(req.params.requestId ?? '').trim(),
        planId: plan.id,
        status: 'approved',
        changeCount: Array.isArray(payload.requested_changes) ? payload.requested_changes.length : 0,
      },
      timestamp: now,
    }
    res.json(response)
  })
)

router.post(
  '/:id/correction-request/:requestId/execute',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const plan = await getPlanRecord(req.params.id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const correction = await loadMonthlyPlanCorrectionState(req.params.id, String(req.params.requestId ?? '').trim())
    if (!correction) {
      return res.status(404).json(badRequest('修正请求不存在', 'NOT_FOUND'))
    }

    const payload: MonthlyPlanCorrectionPayload = correction.payload ?? {}
    if (!payload.approved_at) {
      return res.status(409).json(badRequest('修正请求尚未审批，不能执行', 'INVALID_STATE'))
    }

    const requestedChanges = normalizeCorrectionChanges(payload.requested_changes)
    if (requestedChanges.length === 0) {
      return res.status(400).json(badRequest('修正请求没有可执行的变更', 'VALIDATION_ERROR'))
    }

    const updatedAt = new Date().toISOString()
    const touchedIds: string[] = []
    const existingItemsById = new Map((await getPlanItems(plan.id)).map((item) => [item.id, item]))

    for (const change of requestedChanges) {
      const nextItem: Partial<MonthlyPlanItem> = {
        updated_at: updatedAt,
      }

      if (change.planned_start_date !== undefined) nextItem.planned_start_date = change.planned_start_date
      if (change.planned_end_date !== undefined) nextItem.planned_end_date = change.planned_end_date
      if (change.target_progress !== undefined && Number.isFinite(change.target_progress)) {
        nextItem.target_progress = Math.max(0, Math.min(100, Number(change.target_progress)))
      }
      if (change.notes !== undefined) nextItem.notes = change.notes
      if (change.commitment_status !== undefined) nextItem.commitment_status = change.commitment_status
      const manualFields = getManualOverrideFieldsFromPatch(nextItem as Record<string, unknown>)
      if (manualFields.length > 0) {
        nextItem.manual_override_fields = mergeManualOverrideFields(
          existingItemsById.get(change.item_id)?.manual_override_fields,
          manualFields,
        )
      }

      const { error } = await supabase
        .from('monthly_plan_items')
        .update(nextItem)
        .eq('id', change.item_id)
        .eq('monthly_plan_version_id', plan.id)
        .eq('project_id', plan.project_id)

      if (error) throw error
      touchedIds.push(change.item_id)
    }

    const nextStatus = plan.status === 'confirmed' ? 'revising' : plan.status
    const { error: planUpdateError } = await supabase
      .from('monthly_plans')
      .update({
        status: nextStatus,
        updated_at: updatedAt,
      })
      .eq('id', plan.id)
      .eq('project_id', plan.project_id)

    if (planUpdateError) throw planUpdateError

    const resolvedPayload = {
      ...payload,
      executed_by: req.user?.id ?? null,
      executed_at: updatedAt,
      workflow_state: 'executed',
      touched_item_ids: touchedIds,
    }

    const { error: correctionUpdateError } = await supabase
      .from('planning_governance_states')
      .update({
        status: 'resolved',
        payload: resolvedPayload,
        resolved_at: updatedAt,
        updated_at: updatedAt,
      })
      .eq('state_key', correction.state_key)
      .eq('project_id', plan.project_id)

    if (correctionUpdateError) throw correctionUpdateError

    const items = await getPlanItems(plan.id)
    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: normalizePlanRow({ ...plan, status: nextStatus, updated_at: updatedAt }, items),
      timestamp: updatedAt,
    }
    res.json(response)
  })
)

router.post(
  '/generate',
  requireProjectEditor((req) => req.body?.project_id ?? req.body?.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
    const month = String(req.body?.month ?? '').trim()
    const title = String(req.body?.title ?? '').trim() || `${month || 'unnamed'} monthly plan`
    if (!projectId || !month) {
      return res.status(400).json(badRequest('project_id 和 month 不能为空'))
    }

    const resolvedSource = await resolveMonthlyPlanGenerationSourceV1474(projectId, month)
    const plannedItems = resolvedSource?.items
    if (!Array.isArray(plannedItems)) {
      return res.status(422).json(badRequest('当前项目还没有可用的计划来源，暂时无法生成月度计划', 'VALIDATION_ERROR'))
    }

    const plan = await createMonthlyPlanVersion({
      projectId,
      month,
      title,
      description: req.body?.description ?? null,
      baselineVersionId: resolvedSource?.baselineVersionId ?? null,
      sourceVersionId: resolvedSource?.sourceVersionId ?? null,
      sourceVersionLabel: resolvedSource?.sourceVersionLabel ?? null,
      sourceMode: resolvedSource?.mode ?? null,
      carryoverItemCount: (plannedItems ?? []).filter(
        (item: MonthlyPlanItemInput) => item.commitment_status === 'carried_over',
      ).length,
      generationSummary: resolvedSource?.generationSummary ?? null,
      items: plannedItems,
      actorUserId: req.user?.id ?? null,
    })

    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: plan,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.post(
  '/',
  requireProjectEditor((req) => req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? '').trim()
    const month = String(req.body?.month ?? '').trim()
    const title = String(req.body?.title ?? '').trim() || `${month || 'unnamed'} monthly plan`
    if (!projectId || !month) {
      return res.status(400).json(badRequest('project_id 和 month 不能为空'))
    }

    const requestedSourceVersionId = String(req.body?.source_version_id ?? '').trim() || null
    const isSnapshotSave = await hasMonthlyPlanVersion(requestedSourceVersionId)

    const resolvedSource = isSnapshotSave ? null : await resolveMonthlyPlanGenerationSourceV1474(projectId, month)
    const plannedItems = isSnapshotSave
      ? req.body?.items
      : resolvedSource?.items
    if (!Array.isArray(plannedItems)) {
      return res.status(422).json(badRequest('当前项目还没有可用的计划来源，暂时无法生成月度计划', 'VALIDATION_ERROR'))
    }

    const plan = await createMonthlyPlanVersion({
      projectId,
      month,
      title,
      description: req.body?.description ?? null,
      baselineVersionId: isSnapshotSave ? req.body?.baseline_version_id ?? null : resolvedSource?.baselineVersionId ?? null,
      sourceVersionId: isSnapshotSave ? requestedSourceVersionId : resolvedSource?.sourceVersionId ?? null,
      sourceVersionLabel: isSnapshotSave
        ? req.body?.source_version_label ?? null
        : resolvedSource?.sourceVersionLabel ?? null,
      sourceMode: isSnapshotSave
        ? normalizeMonthlyPlanSourceMode(req.body?.source_mode) ?? (req.body?.baseline_version_id ? 'baseline' : 'manual')
        : resolvedSource?.mode ?? null,
      carryoverItemCount: isSnapshotSave
        ? req.body?.carryover_item_count ?? 0
        : (plannedItems ?? []).filter(
            (item: MonthlyPlanItemInput) => item.commitment_status === 'carried_over',
          ).length,
      generationSummary: isSnapshotSave ? null : resolvedSource?.generationSummary ?? null,
      items: plannedItems,
      actorUserId: req.user?.id ?? null,
    })

    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: plan,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.post(
  '/:id/commit',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const plan = await getPlanRecord(req.params.id)
    return plan?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }
    const projectId = String(req.body?.projectId ?? req.body?.project_id ?? plan.project_id).trim()
    if (projectId !== plan.project_id) {
      return res.status(403).json(badRequest('提交项目与月度计划不匹配', 'PROJECT_MISMATCH'))
    }
    if (!canRevokeMonthlyPlan(plan.status)) {
      return res.status(409).json(badRequest('已确认或已关账的月度计划不可直接保存草稿', 'INVALID_STATE'))
    }
    if (!isPlanningFieldRegistryVersionCurrent(req.body?.fieldRegistryVersion)) {
      return res.status(409).json(buildFieldRegistryStaleResponse(req.body?.fieldRegistryVersion))
    }

    const validation = validatePlanningTableCommitRequest(
      {
        ...req.body,
        projectId,
        surface: 'monthly_plan',
      },
      {
        expectedSurface: 'monthly_plan',
        allowEmptyOperations: true,
        enforceFieldRegistryVersion: false,
      },
    )
    if (!validation.ok || !validation.request) {
      return res.status(400).json(buildPlanningTableValidationErrorResponse(
        validation.issues,
        'MONTHLY_PLAN_COMMIT_INVALID_REQUEST',
      ))
    }

    const operations = validation.request.operations as PlanningCommitOperation[]
    if (operations.some((operation) => readCommitOperationType(operation) === 'template_generate')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEMPLATE_GENERATE_NOT_ALLOWED_ON_MONTHLY_PLAN',
          message: '月度计划不能直接从模板生成，只能从任务列表或基线生成',
        },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }
    if (operations.length === 0) {
      const rows = await getPlanItems(id)
      const response: ApiResponse = {
        success: true,
        data: buildPlanningTableCommitResponse({
          surface: 'monthly_plan',
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

    const currentItems = await getPlanItems(id)
    const { items: nextItems, tempIdMap } = applyMonthlyCommitOperations(currentItems, operations)
    const rows = await replaceMonthlyPlanDraftItems(id, plan.project_id, nextItems)
    const updatedAt = new Date().toISOString()
    await supabase
      .from('monthly_plans')
      .update({ updated_at: updatedAt })
      .eq('id', id)
      .eq('project_id', plan.project_id)
    clearMonthlyPlanDetailCache(id)

    // eslint-disable-next-line -- route-level-aggregation-approved
    const deletedRowCount = operations.filter((operation) => readCommitOperationType(operation) === 'delete_row').length
    const realtimeRows = summarizePlanningTableRealtimeRows(operations, tempIdMap)
    const revision = Date.now()
    const commitResponse = buildPlanningTableCommitResponse({
      surface: 'monthly_plan',
      resourceId: id,
      revision,
      rows,
      operations,
      // eslint-disable-next-line -- route-level-aggregation-approved
      createdRowCount: tempIdMap.size,
      deletedRowCount,
      changedRowCount: operations.length,
      validationIssues: validation.issues,
      realtimeEvents: ['planning.table.changed'],
      tempIdMap,
    })

    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: id,
      field_name: 'draft_committed',
      old_value: String(currentItems.length),
      new_value: String(rows.length),
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
      action_type: 'monthly_plan_commit',
      action_group: 'edit',
      metadata: {
        surface: 'monthly_plan',
        source: 'monthly_plan_commit',
        operationCount: operations.length,
        governanceSummary: commitResponse.governanceSummary,
        mergeGroupSummary: summarizePlanningTableMergeGroups(operations),
      },
      visibility: 'user',
    })

    broadcastPlanningTableChanged({
      projectId: plan.project_id,
      surface: 'monthly_plan',
      resourceId: id,
      changedRowIds: realtimeRows.changedRowIds,
      deletedRowIds: realtimeRows.deletedRowIds,
      source: 'monthly_plan_commit',
      revision,
    })
    const response: ApiResponse = {
      success: true,
      data: commitResponse,
      timestamp: updatedAt,
    }
    res.json(response)
  })
)

router.post(
  '/:id/confirm',
  validateIdParam,
  requireProjectEditor(async (req) => {
    const plan = await getPlanRecord(req.params.id)
    return plan?.project_id
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    const month = String(req.body?.month ?? '').trim()
    if (!Number.isFinite(version) || !month) {
      return res.status(400).json(badRequest('version 和 month 不能为空'))
    }

    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }
    if (plan.version !== version || plan.month !== month) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      await draftLockService.acquireDraftLock({
        projectId: plan.project_id,
        draftType: 'monthly_plan',
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
      const transitionContext = await buildTransitionContext(plan.project_id, version)
      const transitionEvent = plan.status === 'revising' ? 'SUBMIT_REVISION' : 'CONFIRM'
      const nextStatus = planningStateMachine.transition(plan.status, transitionEvent, {
        ...transitionContext,
        revision_ready: transitionEvent === 'SUBMIT_REVISION' ? true : undefined,
      })
      const confirmedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('monthly_plans')
        .update({
          status: nextStatus,
          confirmed_at: confirmedAt,
          confirmed_snapshot_at: confirmedAt,
          confirmed_by: req.user?.id ?? null,
          updated_at: confirmedAt,
        })
        .eq('id', id)
        .eq('project_id', plan.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearMonthlyPlanDetailCache(id)

      await writeLog({
        project_id: plan.project_id,
        entity_type: 'monthly_plan',
        entity_id: id,
        field_name: 'status',
        old_value: plan.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getPlanItems(id)
      const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
        success: true,
        data: normalizePlanRow(data, items),
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
          projectId: plan.project_id,
          draftType: 'monthly_plan',
          resourceId: id,
          actorUserId: req.user?.id ?? 'system',
          actorRole: await draftLockService.getProjectRole(plan.project_id, req.user?.id ?? 'system'),
          reason: 'manual_release',
        })
      } catch (error) {
        if (!(error instanceof PlanningDraftLockServiceError) || error.code !== 'NOT_FOUND') {
          logger.warn('[monthly-plans] failed to release draft lock after confirm', { planId: id, error })
        }
      }
    }
  })
)

router.post(
  '/:id/close',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    const month = String(req.body?.month ?? '').trim()
    if (!Number.isFinite(version) || !month) {
      return res.status(400).json(badRequest('version 和 month 不能为空'))
    }

    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }
    if (plan.version !== version || plan.month !== month) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const qualitySummary = await dataQualityService.syncProjectDataQuality(plan.project_id, month)
      const transitionContext = await buildTransitionContext(plan.project_id, version)
      const nextStatus = planningStateMachine.transition(plan.status, 'CLOSE_MONTH', transitionContext)
      const closedAt = new Date().toISOString()
      const bundle = await getMonthlyPlanBundle(id, plan.project_id)
      const closeoutResult = bundle
        ? classifyMonthlyPlanCloseout(bundle.items, bundle.tasks, closedAt)
        : classifyMonthlyPlanCloseout([], [], closedAt)
      if (closeoutResult.items.length > 0) {
        await updateMonthlyPlanItems(closeoutResult.items)
      }
      clearMonthlyPlanDetailCache(id)
      const { data, error } = await supabase
        .from('monthly_plans')
        .update({
          status: nextStatus,
          closeout_at: closedAt,
          carryover_item_count: closeoutResult.summary.carryoverCount,
          pending_closeout_count: closeoutResult.summary.remainingCount,
          data_confidence_score: qualitySummary.confidence.score,
          data_confidence_flag: qualitySummary.confidence.flag,
          data_confidence_note: qualitySummary.confidence.note,
          governance_metadata: {
            ...(isRecord(plan.governance_metadata) ? plan.governance_metadata : {}),
            closeout_summary: {
              algorithm_version: 'v1.4.7.4',
              classified_at: closedAt,
              ...closeoutResult.summary,
            },
          },
          updated_at: closedAt,
        })
        .eq('id', id)
        .eq('project_id', plan.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearMonthlyPlanDetailCache(id)

      await writeLog({
        project_id: plan.project_id,
        entity_type: 'monthly_plan',
        entity_id: id,
        field_name: 'status',
        old_value: plan.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getPlanItems(id)
      const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
        success: true,
        data: normalizePlanRow(data, items),
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
  '/:id/queue-realignment',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    if (!Number.isFinite(version)) {
      return res.status(400).json(badRequest('version 不能为空'))
    }

    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }
    if (plan.version !== version) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(plan.status, 'QUEUE_REALIGNMENT', {
        realignment_required: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('monthly_plans')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .eq('project_id', plan.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearMonthlyPlanDetailCache(id)

      await writeLog({
        project_id: plan.project_id,
        entity_type: 'monthly_plan',
        entity_id: id,
        field_name: 'status',
        old_value: plan.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getPlanItems(id)
      const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
        success: true,
        data: normalizePlanRow(data, items),
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
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const version = Number(req.body?.version)
    if (!Number.isFinite(version)) {
      return res.status(400).json(badRequest('version 不能为空'))
    }

    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }
    if (plan.version !== version) {
      return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
    }

    try {
      const nextStatus = planningStateMachine.transition(plan.status, 'RESOLVE_REALIGNMENT', {
        realignment_resolved: true,
      })
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from('monthly_plans')
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq('id', id)
        .eq('project_id', plan.project_id)
        .select('*')
        .single()

      if (error) throw error

      clearMonthlyPlanDetailCache(id)

      await writeLog({
        project_id: plan.project_id,
        entity_type: 'monthly_plan',
        entity_id: id,
        field_name: 'status',
        old_value: plan.status,
        new_value: nextStatus,
        changed_by: req.user?.id ?? null,
        change_source: 'manual_adjusted',
      })

      const items = await getPlanItems(id)
      const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
        success: true,
        data: normalizePlanRow(data, items),
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

const revokeMonthlyPlanHandler = asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = Number(req.body?.version)
  if (!Number.isFinite(version)) {
    return res.status(400).json(badRequest('version 不能为空'))
  }

  const plan = await getPlanRecord(id)
  if (!plan) {
    return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
  }
  if (plan.version !== version) {
    return res.status(409).json(badRequest('版本号已发生变化，请刷新后重试', 'VERSION_CONFLICT'))
  }
  if (!canRevokeMonthlyPlan(plan.status)) {
    return res
      .status(409)
      .json(badRequest('仅草稿态或修订中的月度计划支持撤销', 'INVALID_STATE'))
  }

  const items = await getPlanItems(id)

  try {
    await draftLockService.releaseDraftLock({
      projectId: plan.project_id,
      draftType: 'monthly_plan',
      resourceId: id,
      actorUserId: req.user?.id ?? 'system',
      actorRole: await draftLockService.getProjectRole(plan.project_id, req.user?.id ?? 'system'),
      reason: 'manual_release',
    })
  } catch (error) {
    if (!(error instanceof PlanningDraftLockServiceError) || error.code !== 'NOT_FOUND') {
      throw error
    }
  }

  await cleanupMonthlyPlanDraft(id, plan.project_id)

  await writeLog({
    project_id: plan.project_id,
    entity_type: 'monthly_plan',
    entity_id: id,
    field_name: 'status',
    old_value: plan.status,
    new_value: 'revoked',
    change_reason: req.body?.reason ?? 'manual_revoke',
    changed_by: req.user?.id ?? null,
    change_source: 'manual_adjusted',
  })

  const response: ApiResponse<{
    id: string
    status: 'revoked'
    version: number
    removed_item_count: number
  }> = {
    success: true,
    data: {
      id,
      status: 'revoked',
      version,
      removed_item_count: items.length,
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
})

router.post(
  '/:id/revoke',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  revokeMonthlyPlanHandler,
)

router.post(
  '/:id/void',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  revokeMonthlyPlanHandler,
)

router.post(
  '/:id/items/batch-notes',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const plan = await getPlanRecord(req.params.id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    if (!['draft'].includes(String(plan.status ?? ''))) {
      return res.status(409).json(badRequest('仅草稿态月度计划支持批量操作', 'INVALID_STATE'))
    }

    const notes =
      req.body?.notes === null || req.body?.notes === undefined
        ? null
        : String(req.body.notes).trim()
    if (notes !== null && notes.length === 0) {
      return res.status(400).json(badRequest('notes 不能为空字符串，清空请传 null'))
    }

    const targetItems = await resolveBatchMonthlyPlanItems(plan.id, req.body ?? {})
    if (targetItems.length === 0) {
      return res.status(400).json(badRequest('未命中任何月度计划条目'))
    }

    const updatedAt = new Date().toISOString()
    const nextItems = targetItems.map((item) => ({
      ...item,
      notes,
      manual_override_fields: mergeManualOverrideFields(item.manual_override_fields, ['notes']),
      updated_at: updatedAt,
    }))

    const updatedItems = await updateMonthlyPlanItems(nextItems)
    await supabase.from('monthly_plans').update({ updated_at: updatedAt }).eq('id', plan.id).eq('project_id', plan.project_id)
    clearMonthlyPlanDetailCache(plan.id)
    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: plan.id,
      field_name: 'batch_notes',
      old_value: targetItems.length,
      new_value: notes,
      change_reason: req.body?.reason ?? null,
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    const response: ApiResponse<{
      plan: MonthlyPlan
      items: MonthlyPlanItem[]
      touched_count: number
      notes: string | null
    }> = {
      success: true,
      data: {
        plan: { ...plan, updated_at: updatedAt },
        items: updatedItems,
        touched_count: updatedItems.length,
        notes,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/:id/lock',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const lock = await draftLockService.getDraftLock(plan.project_id, 'monthly_plan', id)
    if (!lock) {
      return res.status(404).json(badRequest('草稿锁不存在', 'NOT_FOUND'))
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
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    try {
      const lock = await draftLockService.acquireDraftLock({
        projectId: plan.project_id,
        draftType: 'monthly_plan',
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

router.get(
  '/projects/:projectId/fulfillment-trend',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params
    const months = Number(req.query.months ?? 6)
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      return res.status(400).json(badRequest('months 必须在 1-24 之间'))
    }

    const trendData = await getMonthlyPlanFulfillmentTrend(projectId, months)

    const response: ApiResponse<MonthlyPlanFulfillmentTrendItem[]> = {
      success: true,
      data: trendData,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
