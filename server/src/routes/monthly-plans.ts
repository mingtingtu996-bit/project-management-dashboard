import { v4 as uuidv4 } from 'uuid'
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validateIdParam } from '../middleware/validation.js'
import { supabase } from '../services/dbService.js'
import { planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'
import {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} from '../services/planningDraftLockService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
import { PlanningIntegrityService } from '../services/planningIntegrityService.js'
import { writeLog } from '../services/changeLogs.js'
import {
  hasMonthlyPlanVersion,
  resolveMonthlyPlanGenerationSource,
} from '../services/baselineGovernanceService.js'
import { dataQualityService } from '../services/dataQualityService.js'
import type { ApiResponse } from '../types/index.js'
import type { PlanningTransitionContext } from '../types/planning.js'
import type { MonthlyPlan, MonthlyPlanItem, PlanningDraftLockRecord } from '../types/db.js'

const router = Router()
const draftLockService = new PlanningDraftLockService()
const planningIntegrityService = new PlanningIntegrityService()
const MAX_CREATE_ATTEMPTS = 3

type UniqueConstraintErrorLike = {
  code?: string
  message?: string
}

type MonthlyPlanVersionRow = {
  version?: number | string | null
}

type MonthlyPlanRowInput = Partial<MonthlyPlan>

type MonthlyPlanItemInput = Partial<MonthlyPlanItem> & {
  id?: string
  name?: string | null
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

type ConditionStatusRow = {
  is_satisfied?: boolean | number | string | null
  status?: string | null
}

type ObstacleStatusRow = {
  status?: string | null
}

type TaskBlockingStatusRow = {
  status?: string | null
  planned_end_date?: string | null
  end_date?: string | null
  progress?: number | null
}

router.use(authenticate)

function badRequest(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
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
    title: String(row.title ?? row.name ?? `月度计划条目 ${index + 1}`),
    planned_start_date: row.planned_start_date ?? null,
    planned_end_date: row.planned_end_date ?? null,
    target_progress: row.target_progress ?? null,
    current_progress: row.current_progress ?? null,
    sort_order: Number(row.sort_order ?? index),
    is_milestone: Boolean(row.is_milestone),
    is_critical: Boolean(row.is_critical),
    commitment_status: row.commitment_status ?? 'planned',
    notes: row.notes ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
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

async function getPlanItems(planId: string): Promise<MonthlyPlanItem[]> {
  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('*')
    .eq('monthly_plan_version_id', planId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as MonthlyPlanItem[]
}

type PlanTaskRow = {
  id: string
  title?: string | null
  name?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
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
}

type MonthlyPlanCloseoutAutoAdoptResponse = MonthlyPlanCloseoutSummaryResponse & {
  processedIds: string[]
}

type MonthlyPlanCloseoutConfirmSummaryResponse = {
  rolledInCount: number
  closedCount: number
  manualOverrideCount: number
  forcedCount: number
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
}

type ProjectBlockingIssueBreakdown = {
  conditionIssueCount: number
  obstacleIssueCount: number
  delayIssueCount: number
  mappingIssueCount: number
  requiredFieldIssueCount: number
  blockingIssueCount: number
}

async function getTasksForPlanItems(items: MonthlyPlanItem[]): Promise<PlanTaskRow[]> {
  const taskIds = [...new Set(items.map((item) => item.source_task_id).filter((taskId): taskId is string => Boolean(taskId)))]
  if (taskIds.length === 0) return []

  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,name,planned_start_date,planned_end_date,start_date,end_date,progress,status')
    .in('id', taskIds)

  if (error) throw error
  return (data ?? []) as PlanTaskRow[]
}

async function getMonthlyPlanBundle(planId: string, projectId?: string | null) {
  const plan = await getPlanRecord(planId)
  if (!plan) return null
  if (projectId && plan.project_id !== projectId) return null

  const items = await getPlanItems(planId)
  const tasks = await getTasksForPlanItems(items)
  return { plan, items, tasks }
}

function countPendingCloseoutItems(items: MonthlyPlanItem[]) {
  return items.filter((item) => String(item.commitment_status ?? 'planned') === 'planned').length
}

async function getPendingCloseoutCounts(planIds: string[]) {
  if (planIds.length === 0) return new Map<string, number>()

  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('monthly_plan_version_id,commitment_status')
    .in('monthly_plan_version_id', planIds)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ monthly_plan_version_id: string; commitment_status?: string | null }>) {
    if (String(row.commitment_status ?? 'planned') !== 'planned') continue
    counts.set(row.monthly_plan_version_id, (counts.get(row.monthly_plan_version_id) ?? 0) + 1)
  }

  return counts
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

function buildMonthlyPlanCloseoutSummary(items: MonthlyPlanItem[]): MonthlyPlanCloseoutSummaryResponse {
  const totalCount = items.length
  const processedCount = items.filter((item) => String(item.commitment_status ?? 'planned') !== 'planned').length
  const remainingCount = Math.max(totalCount - processedCount, 0)
  const autoAdoptableCount = items.filter((item) => {
    const targetProgress = typeof item.target_progress === 'number' ? item.target_progress : null
    const currentProgress = typeof item.current_progress === 'number' ? item.current_progress : null
    return (
      item.commitment_status === 'completed' ||
      (targetProgress !== null && currentProgress !== null && currentProgress >= targetProgress)
    )
  }).length

  return {
    totalCount,
    processedCount,
    remainingCount,
    autoAdoptableCount,
  }
}

function buildMonthlyPlanCloseoutConfirmSummary(items: MonthlyPlanItem[]): MonthlyPlanCloseoutConfirmSummaryResponse {
  return {
    rolledInCount: items.filter((item) => item.commitment_status === 'carried_over').length,
    closedCount: items.filter((item) => item.commitment_status === 'completed' || item.commitment_status === 'cancelled').length,
    manualOverrideCount: items.filter((item) => String(item.commitment_status ?? 'planned') === 'planned').length,
    forcedCount: 0,
  }
}

async function getProjectBlockingIssueBreakdown(projectId: string): Promise<ProjectBlockingIssueBreakdown> {
  const [conditionResult, obstacleResult, taskResult, integrity] = await Promise.all([
    supabase.from('task_conditions').select('id,is_satisfied,status').eq('project_id', projectId),
    supabase.from('task_obstacles').select('id,status').eq('project_id', projectId),
    supabase.from('tasks').select('id,status,planned_end_date,end_date,progress').eq('project_id', projectId),
    planningIntegrityService.scanProjectIntegrity(projectId),
  ])

  if (conditionResult.error) throw conditionResult.error
  if (obstacleResult.error) throw obstacleResult.error
  if (taskResult.error) throw taskResult.error

  const conditionIssueCount = (conditionResult.data ?? []).filter((row: ConditionStatusRow) => {
    if (row.is_satisfied !== null && row.is_satisfied !== undefined) {
      return !Boolean(row.is_satisfied)
    }

    const status = String(row.status ?? '').trim()
    if (!status) return true
    return !['已满足', '已确认', 'completed', 'satisfied', 'confirmed'].includes(status)
  }).length

  const obstacleIssueCount = (obstacleResult.data ?? []).filter((row: ObstacleStatusRow) => {
    const status = String(row.status ?? '').trim()
    return !['resolved', 'closed', '已解决'].includes(status)
  }).length

  const today = new Date().toISOString().slice(0, 10)
  const delayIssueCount = (taskResult.data ?? []).filter((row: TaskBlockingStatusRow) => {
    const plannedEnd = String(row.planned_end_date ?? row.end_date ?? '').trim()
    if (!plannedEnd) return false

    const status = String(row.status ?? '').trim().toLowerCase()
    if (['completed', 'done', '已完成'].includes(status)) return false
    if (typeof row.progress === 'number' && row.progress >= 100) return false

    return plannedEnd.slice(0, 10) < today
  }).length

  const mappingIssueCount =
    integrity.mapping_integrity.baseline_pending_count +
    integrity.mapping_integrity.baseline_merged_count +
    integrity.mapping_integrity.monthly_carryover_count

  const requiredFieldIssueCount =
    integrity.data_integrity.missing_participant_unit_count +
    integrity.data_integrity.missing_scope_dimension_count +
    integrity.data_integrity.missing_progress_snapshot_count

  const blockingIssueCount =
    conditionIssueCount +
    obstacleIssueCount +
    delayIssueCount +
    mappingIssueCount +
    requiredFieldIssueCount

  return {
    conditionIssueCount,
    obstacleIssueCount,
    delayIssueCount,
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
    newlyAddedCount: items.filter((item) => !item.baseline_item_id && !item.carryover_from_item_id).length,
    autoRolledInCount: items.filter((item) => item.commitment_status === 'carried_over').length,
    pendingRemovalCount: items.filter((item) => item.commitment_status === 'cancelled').length,
    milestoneCount: items.filter((item) => Boolean(item.is_milestone)).length,
    dateAdjustmentCount: 0,
    progressAdjustmentCount: 0,
    blockingIssueCount: 0,
    conditionIssueCount: 0,
    obstacleIssueCount: 0,
    delayIssueCount: 0,
    mappingIssueCount: 0,
    requiredFieldIssueCount: 0,
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
): Promise<MonthlyPlanItem[]> {
  if (!Array.isArray(items) || items.length === 0) return []

  const payload = items.map((item, index) => mapMonthlyItem(item, planId, projectId, index))
  const { data, error } = await supabase.from('monthly_plan_items').insert(payload).select('*')
  if (error) throw error
  return (data ?? []) as MonthlyPlanItem[]
}

async function cleanupMonthlyPlanDraft(planId: string) {
  const [{ error: itemsError }, { error: planError }] = await Promise.all([
    supabase.from('monthly_plan_items').delete().eq('monthly_plan_version_id', planId),
    supabase.from('monthly_plans').delete().eq('id', planId),
  ])

  if (itemsError) {
    logger.warn('[monthly-plans] failed to cleanup draft items', { planId, error: itemsError.message })
  }
  if (planError) {
    logger.warn('[monthly-plans] failed to cleanup draft version', { planId, error: planError.message })
  }
}

function canRevokeMonthlyPlan(status: string | null | undefined) {
  return ['draft', 'revising'].includes(String(status ?? '').trim())
}

async function getPlanRecord(id: string) {
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

async function hasForceCloseoutUnlock(projectId: string, planId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('planning_governance_states')
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', 'closeout_force_unlock')
    .eq('status', 'active')
    .eq('source_entity_id', planId)
    .limit(1)

  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

async function createMonthlyPlanVersion(params: {
  projectId: string
  month: string
  title: string
  description?: string | null
  baselineVersionId?: string | null
  sourceVersionId?: string | null
  sourceVersionLabel?: string | null
  carryoverItemCount?: number
  items?: MonthlyPlanItemInput[]
}) {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const version = (await getLatestVersion(params.projectId)) + 1
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('monthly_plans')
      .insert({
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
        carryover_item_count: Number(params.carryoverItemCount ?? 0),
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_CREATE_ATTEMPTS - 1) {
        continue
      }
      throw error
    }

    try {
      const createdPlan = data as MonthlyPlan
      const items = await persistPlanItems(createdPlan.id, params.projectId, params.items)
      return normalizePlanRow(createdPlan, items)
    } catch (itemError) {
      await cleanupMonthlyPlanDraft((data as MonthlyPlan).id)
      throw itemError
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
    const projectId = req.query.project_id as string | undefined
    const { data, error } = await supabase
      .from('monthly_plans')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data ?? []) as MonthlyPlan[]
    const filtered = projectId ? rows.filter((row) => row.project_id === projectId) : rows
    const pendingCloseoutCounts = await getPendingCloseoutCounts(filtered.map((row) => row.id))
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
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const items = await getPlanItems(id)
    const pendingCloseoutCount = countPendingCloseoutItems(items)
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
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim() || null
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
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim() || null
    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const summary = buildMonthlyPlanCloseoutSummary(bundle.items)
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

    const processedIds = normalizeItemIds(req.body?.processed_ids ?? req.body?.processedIds)
    const autoAdoptableIds = bundle.items
      .filter((item) => {
        const targetProgress = typeof item.target_progress === 'number' ? item.target_progress : null
        const currentProgress = typeof item.current_progress === 'number' ? item.current_progress : null
        return (
          item.commitment_status === 'completed' ||
          (targetProgress !== null && currentProgress !== null && currentProgress >= targetProgress)
        )
      })
      .map((item) => item.id)
      .filter((itemId) => !processedIds.includes(itemId))

    const summary = buildMonthlyPlanCloseoutSummary(bundle.items)
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
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim() || null
    const bundle = await getMonthlyPlanBundle(req.params.id, projectId)
    if (!bundle) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const summary = buildMonthlyPlanCloseoutConfirmSummary(bundle.items)
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

      const { error } = await supabase
        .from('monthly_plan_items')
        .update(nextItem)
        .eq('id', change.item_id)
        .eq('monthly_plan_version_id', plan.id)

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
  '/',
  requireProjectEditor((req) => req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.project_id ?? '').trim()
    const month = String(req.body?.month ?? '').trim()
    const title = String(req.body?.title ?? '').trim() || `${month || '未命名'} 月度计划`
    if (!projectId || !month) {
      return res.status(400).json(badRequest('project_id 和 month 不能为空'))
    }

    const requestedSourceVersionId = String(req.body?.source_version_id ?? '').trim() || null
    const isSnapshotSave = await hasMonthlyPlanVersion(requestedSourceVersionId)

    const resolvedSource = isSnapshotSave ? null : await resolveMonthlyPlanGenerationSource(projectId)
    const plannedItems = isSnapshotSave
      ? req.body?.items
      : resolvedSource?.items
    if ((!Array.isArray(plannedItems) || plannedItems.length === 0) && !isSnapshotSave) {
      return res.status(422).json(badRequest('当前项目还没有可用的计划来源，暂时无法生成月度草稿', 'VALIDATION_ERROR'))
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
      carryoverItemCount: isSnapshotSave
        ? req.body?.carryover_item_count ?? 0
        : (plannedItems ?? []).filter(
            (item: MonthlyPlanItemInput) => item.commitment_status === 'carried_over',
          ).length,
      items: plannedItems,
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
          confirmed_by: req.user?.id ?? null,
          updated_at: confirmedAt,
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

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
      const { data, error } = await supabase
        .from('monthly_plans')
        .update({
          status: nextStatus,
          closeout_at: closedAt,
          data_confidence_score: qualitySummary.confidence.score,
          data_confidence_flag: qualitySummary.confidence.flag,
          data_confidence_note: qualitySummary.confidence.note,
          updated_at: closedAt,
        })
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error

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
        .select('*')
        .single()

      if (error) throw error

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
        .select('*')
        .single()

      if (error) throw error

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
  '/:id/force-close',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    // Check if user is project owner
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', plan.project_id)
      .limit(1)

    if (projectError) throw projectError
    const isOwner = projectData?.[0]?.owner_id === req.user?.id

    // Check if user is admin member
    const { data: memberData, error: memberError } = await supabase
      .from('project_members')
      .select('permission_level')
      .eq('project_id', plan.project_id)
      .eq('user_id', req.user?.id ?? 'system')
      .limit(1)

    if (memberError) throw memberError
    const isAdmin = memberData?.[0]?.permission_level === 'admin'

    if (!isOwner && !isAdmin) {
      return res.status(403).json(badRequest('只有项目负责人或管理员可以强制关账', 'FORBIDDEN'))
    }

    const forceCloseEnabled = await hasForceCloseoutUnlock(plan.project_id, plan.id)
    if (!forceCloseEnabled) {
      return res.status(409).json(badRequest('当前未达到强制关账阈值', 'INVALID_STATE'))
    }

    const qualitySummary = await dataQualityService.syncProjectDataQuality(plan.project_id, plan.month)
    const closedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('monthly_plans')
      .update({
        status: 'closed',
        closeout_at: closedAt,
        data_confidence_score: qualitySummary.confidence.score,
        data_confidence_flag: qualitySummary.confidence.flag,
        data_confidence_note: qualitySummary.confidence.note,
        updated_at: closedAt,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: id,
      field_name: 'status',
      old_value: plan.status,
      new_value: 'closed',
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    await planningGovernanceService.scanProjectGovernance(plan.project_id)

    const items = await getPlanItems(id)
    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: normalizePlanRow(data, items),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
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

  await cleanupMonthlyPlanDraft(id)

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
  '/:id/items/batch-scope',
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

    const action = String(req.body?.action ?? '').trim()
    if (!['move_in', 'move_out'].includes(action)) {
      return res.status(400).json(badRequest('action 仅支持 move_in / move_out'))
    }

    const targetItems = await resolveBatchMonthlyPlanItems(plan.id, req.body ?? {})
    if (targetItems.length === 0) {
      return res.status(400).json(badRequest('未命中任何月度计划条目'))
    }

    const updatedAt = new Date().toISOString()
    const nextItems: MonthlyPlanItem[] = targetItems.map((item) => ({
      ...item,
      commitment_status: action === 'move_out'
        ? 'cancelled'
        : item.commitment_status === 'carried_over'
          ? 'carried_over'
          : 'planned',
      updated_at: updatedAt,
    }))

    const updatedItems = await updateMonthlyPlanItems(nextItems)
    await supabase.from('monthly_plans').update({ updated_at: updatedAt }).eq('id', plan.id)
    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: plan.id,
      field_name: 'batch_scope',
      old_value: targetItems.length,
      new_value: action,
      change_reason: req.body?.reason ?? null,
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    const response: ApiResponse<{
      plan: MonthlyPlan
      items: MonthlyPlanItem[]
      touched_count: number
      action: string
    }> = {
      success: true,
      data: {
        plan: { ...plan, updated_at: updatedAt },
        items: updatedItems,
        touched_count: updatedItems.length,
        action,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/:id/items/batch-shift-dates',
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

    const shiftDays = Number(req.body?.shift_days)
    if (!Number.isFinite(shiftDays) || shiftDays === 0) {
      return res.status(400).json(badRequest('shift_days 必须是非 0 数字'))
    }

    const targetItems = await resolveBatchMonthlyPlanItems(plan.id, req.body ?? {})
    if (targetItems.length === 0) {
      return res.status(400).json(badRequest('未命中任何月度计划条目'))
    }

    const updatedAt = new Date().toISOString()
    const nextItems = targetItems.map((item) => ({
      ...item,
      planned_start_date: shiftDateText(item.planned_start_date ?? null, shiftDays),
      planned_end_date: shiftDateText(item.planned_end_date ?? null, shiftDays),
      updated_at: updatedAt,
    }))

    const updatedItems = await updateMonthlyPlanItems(nextItems)
    await supabase.from('monthly_plans').update({ updated_at: updatedAt }).eq('id', plan.id)
    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: plan.id,
      field_name: 'batch_shift_dates',
      old_value: targetItems.length,
      new_value: shiftDays,
      change_reason: req.body?.reason ?? null,
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    const response: ApiResponse<{
      plan: MonthlyPlan
      items: MonthlyPlanItem[]
      touched_count: number
      shift_days: number
    }> = {
      success: true,
      data: {
        plan: { ...plan, updated_at: updatedAt },
        items: updatedItems,
        touched_count: updatedItems.length,
        shift_days: shiftDays,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/:id/items/batch-target-progress',
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

    const targetProgress = Number(req.body?.target_progress)
    if (!Number.isFinite(targetProgress) || targetProgress < 0 || targetProgress > 100) {
      return res.status(400).json(badRequest('target_progress 必须在 0-100 之间'))
    }

    const targetItems = await resolveBatchMonthlyPlanItems(plan.id, req.body ?? {})
    if (targetItems.length === 0) {
      return res.status(400).json(badRequest('未命中任何月度计划条目'))
    }

    const updatedAt = new Date().toISOString()
    const nextItems = targetItems.map((item) => ({
      ...item,
      target_progress: targetProgress,
      updated_at: updatedAt,
    }))

    const updatedItems = await updateMonthlyPlanItems(nextItems)
    await supabase.from('monthly_plans').update({ updated_at: updatedAt }).eq('id', plan.id)
    await writeLog({
      project_id: plan.project_id,
      entity_type: 'monthly_plan',
      entity_id: plan.id,
      field_name: 'batch_target_progress',
      old_value: targetItems.length,
      new_value: targetProgress,
      change_reason: req.body?.reason ?? null,
      changed_by: req.user?.id ?? null,
      change_source: 'manual_adjusted',
    })

    const response: ApiResponse<{
      plan: MonthlyPlan
      items: MonthlyPlanItem[]
      touched_count: number
      target_progress: number
    }> = {
      success: true,
      data: {
        plan: { ...plan, updated_at: updatedAt },
        items: updatedItems,
        touched_count: updatedItems.length,
        target_progress: targetProgress,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
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
      updated_at: updatedAt,
    }))

    const updatedItems = await updateMonthlyPlanItems(nextItems)
    await supabase.from('monthly_plans').update({ updated_at: updatedAt }).eq('id', plan.id)
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

router.post(
  '/:id/force-unlock',
  validateIdParam,
  requireProjectEditor(async (req) => await resolvePlanProjectId(req.params.id) ?? undefined),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    try {
      const lock = await draftLockService.forceUnlockDraftLock({
        projectId: plan.project_id,
        draftType: 'monthly_plan',
        resourceId: id,
        actorUserId: req.user?.id ?? 'system',
        reason: req.body?.reason ?? 'manual_release',
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

    const { data: plansData, error: plansError } = await supabase
      .from('monthly_plans')
      .select('id, month, status')
      .eq('project_id', projectId)
      .in('status', ['confirmed', 'closed'])
      .order('month', { ascending: false })
      .limit(months)

    if (plansError) throw plansError

    const plans = (plansData ?? []) as Array<{ id: string; month: string; status: string }>
    if (plans.length === 0) {
      const response: ApiResponse<Array<{ month: string; committedCount: number; fulfilledCount: number; rate: number }>> = {
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      }
      return res.json(response)
    }

    const planIds = plans.map((plan) => plan.id)
    const { data: itemsData, error: itemsError } = await supabase
      .from('monthly_plan_items')
      .select('monthly_plan_version_id, source_task_id, commitment_status')
      .in('monthly_plan_version_id', planIds)

    if (itemsError) throw itemsError

    const items = (itemsData ?? []) as Array<{
      monthly_plan_version_id: string
      source_task_id: string | null
      commitment_status: string | null
    }>

    const taskIds = [...new Set(items.map((item) => item.source_task_id).filter(Boolean))] as string[]
    const { data: tasksData, error: tasksError } = taskIds.length > 0
      ? await supabase.from('tasks').select('id, status, progress').in('id', taskIds)
      : { data: [], error: null }

    if (tasksError) throw tasksError

    const taskStatusMap = new Map(
      (tasksData ?? []).map((task: { id: string; status: string; progress: number | null }) => [
        task.id,
        { status: task.status, progress: task.progress },
      ])
    )

    const trendData = plans.map((plan) => {
      const planItems = items.filter(
        (item) =>
          item.monthly_plan_version_id === plan.id &&
          item.commitment_status !== 'cancelled' &&
          item.commitment_status !== null
      )
      const committedCount = planItems.length

      const fulfilledCount = planItems.filter((item) => {
        if (!item.source_task_id) return false
        const taskStatus = taskStatusMap.get(item.source_task_id)
        if (!taskStatus) return false
        const status = String(taskStatus.status ?? '').trim().toLowerCase()
        const progress = Number(taskStatus.progress ?? 0)
        return status === 'completed' || status === 'done' || status === '已完成' || progress >= 100
      }).length

      const rate = committedCount > 0 ? Math.round((fulfilledCount / committedCount) * 100) : 0

      return {
        month: plan.month,
        committedCount,
        fulfilledCount,
        rate,
      }
    })

    const response: ApiResponse<Array<{ month: string; committedCount: number; fulfilledCount: number; rate: number }>> = {
      success: true,
      data: trendData.reverse(),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
