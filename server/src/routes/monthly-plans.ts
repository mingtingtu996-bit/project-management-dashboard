import { v4 as uuidv4 } from 'uuid'
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validateIdParam } from '../middleware/validation.js'
import { supabase } from '../services/dbService.js'
import { planningStateMachine, PlanningStateTransitionError } from '../services/planningStateMachine.js'
import {
  PlanningDraftLockService,
  PlanningDraftLockServiceError,
} from '../services/planningDraftLockService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
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
  const [conditionResult, obstacleResult] = await Promise.all([
    supabase.from('task_conditions').select('id,is_satisfied').eq('project_id', projectId),
    supabase.from('task_obstacles').select('id,status').eq('project_id', projectId),
  ])

  if (conditionResult.error) throw conditionResult.error
  if (obstacleResult.error) throw obstacleResult.error

  const pendingConditions = (conditionResult.data ?? []).filter((row: ConditionStatusRow) => {
    if (row.is_satisfied !== null && row.is_satisfied !== undefined) {
      return !Boolean(row.is_satisfied)
    }

    const status = String(row.status ?? '').trim()
    if (!status) return true
    return !['已满足', '已确认', 'completed', 'satisfied', 'confirmed'].includes(status)
  }).length

  const activeObstacles = (obstacleResult.data ?? []).filter((row: ObstacleStatusRow) => {
    const status = String(row.status ?? '').trim()
    return !['resolved', 'closed', '已解决'].includes(status)
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
  asyncHandler(async (req, res) => {
    const projectId = req.query.project_id as string | undefined
    const { data, error } = await supabase
      .from('monthly_plans')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data ?? []) as MonthlyPlan[]
    const filtered = projectId ? rows.filter((row) => row.project_id === projectId) : rows
    const response: ApiResponse<MonthlyPlan[]> = {
      success: true,
      data: filtered,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.get(
  '/:id',
  validateIdParam,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const items = await getPlanItems(id)
    const response: ApiResponse<MonthlyPlan & { items: MonthlyPlanItem[] }> = {
      success: true,
      data: normalizePlanRow(plan, items),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/',
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
    }
  })
)

router.post(
  '/:id/close',
  validateIdParam,
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
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const plan = await getPlanRecord(id)
    if (!plan) {
      return res.status(404).json(badRequest('月度计划不存在', 'NOT_FOUND'))
    }

    const actorRole = await draftLockService.getProjectRole(plan.project_id, req.user?.id ?? 'system')
    if (actorRole !== 'owner') {
      return res.status(403).json(badRequest('只有项目负责人可以强制关账', 'FORBIDDEN'))
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

router.get(
  '/:id/lock',
  validateIdParam,
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

export default router
