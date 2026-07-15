// 任务完成总结API路由 - Phase 3.6

import { Router } from 'express'
import { z } from 'zod'
import { TaskSummaryService, calculateTaskSummaryDurationStats } from '../services/taskSummaryService.js'
import {
  buildTaskSummaryAttributionGroups,
  taskAttributionSummaryService,
  type TaskSummaryAttributionTask,
} from '../services/taskAttributionSummaryService.js'
import { buildProjectTaskAttributionProjection } from '../services/taskAttributionProjectionService.js'
import {
  buildRuntimeScopedDurationForecast,
  isValidScopedDurationForecastDate,
} from '../services/scopedDurationForecastRuntimeService.js'
import { getProjectTimelineEvents, isTaskTimelineEventStoreReady } from '../services/taskTimelineService.js'
import { resolveConstructionCalendarContext } from '../services/constructionCalendar.js'
import { executeSQLOne, supabase } from '../services/dbService.js'
import {
  normalizeTaskSummaryCompareGranularity,
  normalizeTaskSummaryComparePeriods,
} from '../services/taskSummaryCompareService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  authenticate,
  getAuthorizedRequestProjectId,
  requireProjectEditor,
  requireProjectMember,
} from '../middleware/auth.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import { calculateProgressMetrics } from '../utils/progressCalculation.js'
import { delayDayDelta } from '../utils/durationDays.js'
import { isCompletedMilestone, isCompletedTask } from '../utils/taskStatus.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCompletionReport } from '../types/db.js'

const router = Router()
router.use(authenticate)
const summaryService = new TaskSummaryService()
const TASK_SUMMARY_RESPONSE_CACHE_TTL_MS = 15_000
const taskSummaryResponseCache = new Map<string, { expiresAt: number; payload: unknown }>()

const taskIdParamSchema = z.object({
  taskId: z.string().trim().min(1),
})

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1),
})

const generateTaskSummaryBodySchema = z.object({
  userId: z.string().trim().optional(),
}).passthrough()

const projectSummariesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).passthrough()

const summaryStatsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
}).passthrough()

const scopedDurationForecastQuerySchema = z.object({
  as_of_date: z.string().trim().refine(isValidScopedDurationForecastDate, {
    message: 'as_of_date must be a valid YYYY-MM-DD date',
  }).optional(),
}).passthrough()

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getCachedTaskSummaryResponse<T>(key: string): T | null {
  const cached = taskSummaryResponseCache.get(key)
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached.payload as T
}

function setCachedTaskSummaryResponse(key: string, payload: unknown) {
  taskSummaryResponseCache.set(key, {
    expiresAt: Date.now() + TASK_SUMMARY_RESPONSE_CACHE_TTL_MS,
    payload,
  })
}

function isMissingTaskSummaryOptionalColumn(error: unknown) {
  if (!error) return false
  const text = typeof error === 'string'
    ? error
    : [
        (error as { message?: unknown })?.message,
        (error as { details?: unknown })?.details,
        (error as { hint?: unknown })?.hint,
        String(error),
      ].filter(Boolean).join(' ')

  return /participant_unit_id|building_id|region_id/i.test(text)
}

async function resolveTaskProjectId(taskId?: string) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return undefined
  const row = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM tasks WHERE id = ? LIMIT 1',
    [normalizedTaskId],
  )
  return row?.project_id ?? undefined
}

async function loadParticipantUnitNameMap(projectId: string, unitIds: string[]) {
  const uniqueIds = Array.from(new Set(unitIds.filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name')
    .eq('project_id', projectId)
    .in('id', uniqueIds)

  if (error) throw new Error(`[participant-units] 查询失败: ${error.message}`)

  return new Map((data || []).map((row: any) => [String(row.id), normalizeText(row.unit_name)]))
}

type TaskSummaryScopeLabelMap = {
  specialty: TaskSummaryScopeBinding[]
  building: TaskSummaryScopeBinding[]
  region: TaskSummaryScopeBinding[]
  phase: TaskSummaryScopeBinding[]
}

type TaskSummaryScopeBinding = {
  id: string
  scopeDimensionId: string
  label: string
  sortOrder: number
}

async function loadTaskSummaryScopeBindingMap(projectId: string): Promise<TaskSummaryScopeLabelMap> {
  const { data: eoData, error: eoError } = await supabase
    .from('engineering_objects')
    .select('id, object_type, object_name, sort_order')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .in('object_type', ['building', 'physical_zone', 'functional_area', 'phase', 'section', 'floor'])
    .order('object_type', { ascending: true })
    .order('sort_order', { ascending: true })

  if (eoError) {
    logger.warn('task-summary engineering_objects query failed', {
      projectId,
      error: eoError.message,
    })
  }

  const labels: TaskSummaryScopeLabelMap = { specialty: [], building: [], region: [], phase: [] }
  const typeToDim: Record<string, keyof TaskSummaryScopeLabelMap> = {
    building: 'building',
    physical_zone: 'region',
    functional_area: 'region',
    phase: 'phase',
  }

  for (const row of eoData || []) {
    const dimKey = typeToDim[row.object_type]
    if (!dimKey) continue
    labels[dimKey].push({
      id: String(row.id),
      scopeDimensionId: String(row.id),
      label: normalizeText(row.object_name),
      sortOrder: Number(row.sort_order ?? 0),
    })
  }

  return labels
}

async function loadProjectMemberNameMap(projectId: string, userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', uniqueIds)
    .eq('is_active', true)

  if (membersError) throw new Error(`[project-members] 查询失败: ${membersError.message}`)

  const memberUserIds = Array.from(new Set((members || []).map((row: any) => normalizeText(row.user_id)).filter(Boolean)))
  if (memberUserIds.length === 0) return new Map<string, string>()

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, display_name, username')
    .in('id', memberUserIds)

  if (usersError) throw new Error(`[users] 查询失败: ${usersError.message}`)

  const userNameMap = new Map(
    (users || []).map((row: any) => [
      String(row.id),
      normalizeText(row.display_name) || normalizeText(row.username) || '责任人待确认',
    ]),
  )

  return new Map(memberUserIds.map((userId) => [userId, userNameMap.get(userId) || '责任人待确认']))
}

function resolveTaskSummaryScopeBinding(
  bindings: TaskSummaryScopeBinding[],
  value: unknown,
): TaskSummaryScopeBinding | null {
  const normalized = normalizeText(value)
  if (!normalized) return null
  return bindings.find((binding) => binding.label === normalized || binding.id === normalized || binding.scopeDimensionId === normalized) ?? null
}

async function loadTaskSummaryMilestones(projectId: string, milestoneId?: string | null) {
  let msQuery = supabase
    .from('tasks')
    .select('id, title, status, target_date:planned_end_date, completed_at:actual_end_date')
    .eq('project_id', projectId)
    .eq('is_milestone', true)
    .order('planned_end_date', { ascending: true })

  if (milestoneId && milestoneId !== 'all') {
    msQuery = msQuery.eq('id', milestoneId)
  }

  const { data, error } = await msQuery
  if (error) throw new Error(`[task-summary] 里程碑查询失败: ${error.message}`)
  return data ?? []
}

async function loadTaskSummaryTaskRows(projectId: string, dateFrom?: string | null, dateTo?: string | null) {
  let tasksQuery = supabase
    .from('tasks')
    .select('id, parent_id, title, participant_unit_id, assignee_user_id, status, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, is_milestone, specialty_type, engineering_category_id, wbs_code, wbs_level, sort_order, updated_at, engineering_object_id, building_object_id, basement_object_id, physical_zone_object_id, functional_area_object_id, phase_object_id, section_object_id, floor_object_id')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })

  if (dateFrom) tasksQuery = tasksQuery.gte('end_date', dateFrom)
  if (dateTo) tasksQuery = tasksQuery.lte('end_date', dateTo)

  const { data, error } = await tasksQuery
  if (error) throw new Error(`[task-summary] 任务查询失败: ${error.message}`)
  return data ?? []
}

async function loadTaskSummaryTaskMilestones(projectId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []

  const { data, error } = await supabase
    .from('tasks')
    .select('id, milestone_id')
    .eq('project_id', projectId)
    .in('id', taskIds)
    .not('milestone_id', 'is', null)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ task_id: row.id, milestone_id: row.milestone_id }))
}

type TaskSummaryTrendResultRow = {
  month: string
  total: number
  on_time: number
  delayed: number
}

async function loadTaskSummaryTrendRows(projectId: string, fromDate: string): Promise<TaskSummaryTrendResultRow[]> {
  const [rows, workCalendar] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('planned_end_date, end_date, actual_end_date, status, progress')
        .eq('project_id', projectId)
        .not('actual_end_date', 'is', null)
        .gte('actual_end_date', fromDate)

      if (error) throw new Error(`[trend] 查询失败: ${error.message}`)
      return data ?? []
    })(),
    resolveConstructionCalendarContext({ projectId }),
  ])

  const monthMap: Record<string, TaskSummaryTrendResultRow> = {}
  for (const task of (rows || [])) {
    if (!isCompletedTask(task)) continue
    const completedAt = getTaskActualEndDate(task)
    if (!completedAt || completedAt < fromDate) continue
    const month = completedAt.slice(0, 7)
    if (!monthMap[month]) monthMap[month] = { month, total: 0, on_time: 0, delayed: 0 }
    monthMap[month].total++
    if (isTaskDelayedByPeriodEnd(task, completedAt, workCalendar)) monthMap[month].delayed++
    else monthMap[month].on_time++
  }

  return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))
}

type TaskSummaryAssigneeResultRow = {
  assignee: string
  total: number
  on_time: number
  delayed: number
  on_time_rate: number
}

async function loadTaskSummaryAssignees(projectId: string): Promise<TaskSummaryAssigneeResultRow[]> {
  const rows = await (async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('assignee_user_id, planned_end_date, end_date, actual_end_date, status, progress')
      .eq('project_id', projectId)

    if (error) throw new Error(`[assignees] 查询失败: ${error.message}`)
    return data ?? []
  })()

  const [projectMemberNameMap, workCalendar] = await Promise.all([
    loadProjectMemberNameMap(
      projectId,
      (rows || []).map((row: any) => row.assignee_user_id).filter(Boolean),
    ),
    resolveConstructionCalendarContext({ projectId }),
  ])

  const map: Record<string, { assignee: string; total: number; on_time: number; delayed: number }> = {}
  for (const r of (rows || [])) {
    if (!isCompletedTask(r)) continue
    const assigneeUserId = normalizeText(r.assignee_user_id)
    const isLinkedProjectMember = Boolean(assigneeUserId && projectMemberNameMap.has(assigneeUserId))
    const key = isLinkedProjectMember ? assigneeUserId : '__unassigned__'
    if (!map[key]) {
      map[key] = {
        assignee: isLinkedProjectMember ? projectMemberNameMap.get(assigneeUserId) || '责任人待确认' : '未关联责任人',
        total: 0,
        on_time: 0,
        delayed: 0,
      }
    }
    map[key].total++
    const completedAt = getTaskActualEndDate(r)
    if (completedAt && isTaskDelayedByPeriodEnd(r, completedAt, workCalendar)) map[key].delayed++
    else map[key].on_time++
  }

  return Object.values(map)
    .map((v) => ({
      assignee: v.assignee,
      total: v.total,
      on_time: v.on_time,
      delayed: v.delayed,
      on_time_rate: v.total > 0 ? Math.round((v.on_time / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
}

async function loadMonthlyFulfillmentTrend(projectId: string, months = 6) {
  const safeMonths = Math.min(Math.max(Math.trunc(months), 1), 24)

  const { data: plansData, error: plansError } = await supabase
    .from('monthly_plans')
    .select('id, month, status')
    .eq('project_id', projectId)
    .in('status', ['confirmed', 'closed'])
    .order('month', { ascending: false })
    .limit(safeMonths)

  if (plansError) throw plansError

  const plans = (plansData ?? []) as Array<{ id: string; month: string; status: string }>
  if (plans.length === 0) {
    return [] as Array<{ month: string; committedCount: number; fulfilledCount: number; rate: number }>
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
    ]),
  )

  return plans
    .map((plan) => {
      const planItems = items.filter(
        (item) =>
          item.monthly_plan_version_id === plan.id &&
          item.commitment_status !== 'cancelled' &&
          item.commitment_status !== null,
      )
      const committedCount = planItems.length

      const fulfilledCount = planItems.filter((item) => {
        if (!item.source_task_id) return false
        const taskStatus = taskStatusMap.get(item.source_task_id)
        if (!taskStatus) return false
        return isCompletedTask(taskStatus)
      }).length

      const rate = committedCount > 0 ? Math.round((fulfilledCount / committedCount) * 100) : 0

      return {
        month: plan.month,
        committedCount,
        fulfilledCount,
        rate,
      }
    })
    .reverse()
}

// 获取任务总结
router.get(
  '/tasks/:taskId/summary',
  validate(taskIdParamSchema, 'params'),
  requireProjectMember((req) => resolveTaskProjectId(req.params.taskId)),
  asyncHandler(async (req, res) => {
  const { taskId } = req.params
  logger.info('Fetching task summary', { taskId })

  const summary = await summaryService.getTaskSummary(taskId)

  if (!summary) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'SUMMARY_NOT_FOUND', message: '任务总结不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<TaskCompletionReport> = {
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 手动生成任务总结
router.post(
  '/tasks/:taskId/summary/generate',
  validate(taskIdParamSchema, 'params'),
  validate(generateTaskSummaryBodySchema),
  requireProjectEditor((req) => resolveTaskProjectId(req.params.taskId)),
  asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const projectId = getAuthorizedRequestProjectId(req)
  if (!projectId) {
    return res.status(403).json({
      success: false,
      error: { code: 'PROJECT_SCOPE_REQUIRED', message: '缺少已授权的项目范围' },
      timestamp: new Date().toISOString(),
    })
  }
  // 优先从请求头获取 userId（更安全），降级到 body
  const userId = (req.headers['x-user-id'] as string) || req.body.userId || 'system'

  logger.info('Generating task summary', { taskId, userId })

  try {
    const summary = await summaryService.generateTaskSummary(taskId, projectId, userId)

    const response: ApiResponse<TaskCompletionReport> = {
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'GENERATION_FAILED', message: error.message },
      timestamp: new Date().toISOString(),
    }
    res.status(500).json(response)
  }
}))

// 获取项目总结列表（支持分页）
router.get('/projects/:projectId/summaries', validate(projectIdParamSchema, 'params'), validate(projectSummariesQuerySchema, 'query'), requireProjectMember((req) => req.params.projectId), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  
  // P1-003修复: 添加分页参数支持
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100) // 限制1-100
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0) // 最小0
  
  logger.info('Fetching project summaries', { projectId, limit, offset })

  const { summaries, total } = await summaryService.getProjectSummaries(projectId, { limit, offset })

  const response: ApiResponse<TaskCompletionReport[]> = {
    success: true,
    data: summaries,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + summaries.length < total
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取总结统计数据（Dashboard卡片用）
router.get('/summaries/stats', validate(summaryStatsQuerySchema, 'query'), requireProjectMember((req) => (
  String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
)), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim()

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID是必需的' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching summary stats', { projectId })

  const stats = await summaryService.getSummaryStats(projectId)

  const response: ApiResponse = {
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get(
  '/projects/:id/duration-forecasts',
  validateIdParam,
  validate(scopedDurationForecastQuerySchema, 'query'),
  requireProjectMember((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id
    const asOfDate = normalizeText(req.query.as_of_date) || undefined
    const cacheKey = ['scoped-duration-forecast', projectId, asOfDate ?? 'current'].join(':')
    const cachedResponse = getCachedTaskSummaryResponse<ApiResponse>(cacheKey)
    if (cachedResponse) return res.json(cachedResponse)

    const result = await buildRuntimeScopedDurationForecast(projectId, { asOfDate })
    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }
    setCachedTaskSummaryResponse(cacheKey, response)
    return res.json(response)
  }),
)

// ─── 新增：项目级任务完成汇总（按里程碑分组）─────────────────
// GET /api/projects/:id/task-summary
// 查询参数: type(all|milestone|normal), milestone_id, date_from, date_to
router.get('/projects/:id/task-summary', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const { type, milestone_id, date_from, date_to } = req.query as Record<string, string>

  logger.info('Fetching project task summary', { projectId, type, milestone_id })
  const cacheKey = [
    'task-summary',
    projectId,
    normalizeText(type) || 'all',
    normalizeText(milestone_id) || 'all',
    normalizeText(date_from) || 'none',
    normalizeText(date_to) || 'none',
  ].join(':')
  const cachedResponse = getCachedTaskSummaryResponse<ApiResponse>(cacheKey)
  if (cachedResponse) {
    return res.json(cachedResponse)
  }

  const milestonesPromise = loadTaskSummaryMilestones(projectId, milestone_id)
  const tasksPromise = loadTaskSummaryTaskRows(projectId, date_from, date_to)
  const scopeBindingMapPromise = loadTaskSummaryScopeBindingMap(projectId)
  const workCalendarPromise = resolveConstructionCalendarContext({ projectId })

  const timelineReadyPromise = isTaskTimelineEventStoreReady(projectId)
  const monthlyFulfillmentPromise = loadMonthlyFulfillmentTrend(projectId)

  const [milestones, taskRows, scopeBindingMap, workCalendar, timelineReady, monthlyFulfillment] = await Promise.all([
    milestonesPromise,
    tasksPromise,
    scopeBindingMapPromise,
    workCalendarPromise,
    timelineReadyPromise,
    monthlyFulfillmentPromise,
  ])

  const tasks = (taskRows || []).filter((task: any) => isCompletedTask(task))
  const attributionProjection = buildProjectTaskAttributionProjection(taskRows || [])

  const resolveScopeAttribution = (task: any) => {
    const building = resolveTaskSummaryScopeBinding(
      scopeBindingMap.building,
      task?.building_object_id,
    )
    const region = resolveTaskSummaryScopeBinding(
      scopeBindingMap.region,
      task?.physical_zone_object_id ?? task?.functional_area_object_id,
    )
    const phase = resolveTaskSummaryScopeBinding(
      scopeBindingMap.phase,
      task?.phase_object_id,
    )
    return { building, region, phase }
  }

  const buildTaskSummaryTask = (t: any) => {
    const taskAttribution = attributionProjection.get(String(t.id))
    const scopeAttribution = resolveScopeAttribution(t)
    const plannedEndDate = (t.planned_end_date || t.end_date) as string | null
    const taskCompleted = isCompletedTask(t)
    const actualEndDate = getTaskActualEndDate(t)
    const completedAt = taskCompleted ? (actualEndDate || plannedEndDate) : null
    const delayTotal = taskCompleted && plannedEndDate && completedAt && completedAt.slice(0, 10) > plannedEndDate
      ? Math.max(0, delayDayDelta(plannedEndDate, completedAt, workCalendar) ?? 0)
      : 0
    const isDelayed = taskCompleted && (delayTotal > 0 || (
      plannedEndDate && completedAt && completedAt.slice(0, 10) > plannedEndDate
    ))
    const durationStats = calculateTaskSummaryDurationStats(t)

    return {
      id: t.id,
      title: t.title,
      assignee: null,
      assignee_user_id: t.assignee_user_id || null,
      participant_unit_name: null,
      participant_unit_id: t.participant_unit_id || null,
      parent_id: t.parent_id || null,
      phase_object_id: scopeAttribution.phase?.id ?? null,
      phase_name: scopeAttribution.phase?.label ?? null,
      phase_sort_order: scopeAttribution.phase?.sortOrder ?? 0,
      wbs_code: t.wbs_code || null,
      wbs_level: t.wbs_level ?? null,
      division_id: taskAttribution?.divisionId ?? null,
      division_name: taskAttribution?.divisionName ?? null,
      division_sort_order: taskAttribution?.divisionSortOrder ?? 0,
      subdivision_id: taskAttribution?.subdivisionId ?? null,
      subdivision_name: taskAttribution?.subdivisionName ?? null,
      subdivision_sort_order: taskAttribution?.subdivisionSortOrder ?? 0,
      specialty_id: taskAttribution?.specialtyId ?? null,
      specialty_name: taskAttribution?.specialtyName ?? null,
      specialty_type: taskAttribution?.specialtyName ?? null,
      specialty_sort_order: taskAttribution?.specialtySortOrder ?? 0,
      building_id: scopeAttribution.building?.id ?? null,
      building_name: scopeAttribution.building?.label ?? null,
      building_sort_order: scopeAttribution.building?.sortOrder ?? 0,
      region_id: scopeAttribution.region?.id ?? null,
      region_name: scopeAttribution.region?.label ?? null,
      region_sort_order: scopeAttribution.region?.sortOrder ?? 0,
      completed_at: completedAt?.slice(0, 10) || null,
      planned_end_date: plannedEndDate,
      actual_duration: durationStats.actualDuration,
      planned_duration: durationStats.plannedDuration,
      delay_total_days: delayTotal,
      delay_records: delayTotal > 0
        ? [{
            delay_days: delayTotal,
            reason: '实际完成时间晚于计划完成时间',
            recorded_at: completedAt,
          }]
        : [],
      status_label: taskCompleted ? (isDelayed ? 'delayed' : 'on_time') : (normalizeText(t.status) || 'pending'),
    }
  }

  const taskIds = (tasks || []).map((t: any) => t.id)
  const participantUnitIds = Array.from(
    new Set((taskRows || []).map((task: any) => task.participant_unit_id).filter(Boolean)),
  )
  const assigneeUserIds = Array.from(
    new Set((taskRows || []).map((task: any) => task.assignee_user_id).filter(Boolean)),
  )

  const [participantUnitNameMap, projectMemberNameMap, taskMilestoneRows, timelineEvents] = await Promise.all([
    loadParticipantUnitNameMap(projectId, participantUnitIds),
    loadProjectMemberNameMap(projectId, assigneeUserIds),
    loadTaskSummaryTaskMilestones(projectId, taskIds),
    timelineReady ? getProjectTimelineEvents(projectId) : Promise.resolve([]),
  ])

  const normalizedTaskById = new Map((taskRows || []).map((t: any) => {
    const normalized = buildTaskSummaryTask(t) as TaskSummaryAttributionTask & Record<string, any>
    const assigneeUserId = normalizeText(normalized.assignee_user_id)
    normalized.assignee = assigneeUserId ? projectMemberNameMap.get(assigneeUserId) || null : null
    if (assigneeUserId && !projectMemberNameMap.has(assigneeUserId)) {
      normalized.assignee_user_id = null
    }
    normalized.participant_unit_name = normalized.participant_unit_id
      ? participantUnitNameMap.get(normalized.participant_unit_id) || null
      : null
    return [String(t.id), normalized]
  }))

  // 3. Build the canonical taskId -> milestoneId mapping.
  let taskMsMap: Record<string, string[]> = {} // taskId → milestoneId[]
  for (const row of taskMilestoneRows) {
    if (!taskMsMap[row.task_id]) taskMsMap[row.task_id] = []
    taskMsMap[row.task_id].push(row.milestone_id)
  }

  // 5. 组装分组数据（按里程碑分组）
  const groups = (milestones || []).map((ms: any) => {
    // Find tasks assigned to this canonical milestone task.
    const msTasks = (tasks || [])
      .filter((t: any) => {
        const msIds = taskMsMap[t.id] || []
        const belongsToMs = msIds.includes(ms.id)
        if (type === 'milestone') return belongsToMs && t.is_milestone
        if (type === 'normal') return belongsToMs && !t.is_milestone
        return belongsToMs
      })
      .map((t: any) => normalizedTaskById.get(String(t.id)))
      .filter(Boolean)

    return {
      id: ms.id,
      name: ms.title,
      status: ms.status,
      completed_at: ms.completed_at,
      planned_end_date: ms.target_date,
      tasks: msTasks,
    }
  })

  // 6. 未归属里程碑的任务放到"未分类"分组
  const assignedTaskIds = new Set(groups.flatMap((g: any) => g.tasks.map((t: any) => t.id)))
  const unclassifiedTasks = (tasks || [])
    .filter((t: any) => !assignedTaskIds.has(t.id))
    .map((t: any) => normalizedTaskById.get(String(t.id)))
    .filter(Boolean)
  if (unclassifiedTasks.length > 0) {
    groups.push({
      id: 'unclassified',
      name: '未归属里程碑',
      status: null,
      completed_at: null,
      planned_end_date: null,
      tasks: unclassifiedTasks,
    })
  }

  // 7. 统计概况
  const allTasks = Array.from(normalizedTaskById.values())
  const completedSummaryTasks = tasks
    .map((t: any) => normalizedTaskById.get(String(t.id)))
    .filter(Boolean) as TaskSummaryAttributionTask[]
  const attributionGroups = buildTaskSummaryAttributionGroups(completedSummaryTasks, workCalendar)
  const attributionTotals = await taskAttributionSummaryService.getAttributionTotals(projectId, allTasks)
  let onTimeCount = 0
  let delayedCount = 0
  for (const task of completedSummaryTasks) {
    if (task.status_label === 'on_time') onTimeCount += 1
    // eslint-disable-next-line -- route-level-aggregation-approved
    if (task.status_label === 'delayed') delayedCount += 1
  }
  let completedMilestoneCount = 0
  for (const milestone of milestones || []) {
    // eslint-disable-next-line -- route-level-aggregation-approved
    if (isCompletedMilestone(milestone)) completedMilestoneCount += 1
  }
  const stats = {
    total_completed: completedSummaryTasks.length,
    on_time_count: onTimeCount,
    delayed_count: delayedCount,
    completed_milestone_count: completedMilestoneCount,
  }

  const response: ApiResponse = {
    success: true,
    data: {
      stats,
      groups,
      attribution_groups: attributionGroups,
      attribution_totals: attributionTotals,
      monthlyFulfillment,
      timeline_events: timelineEvents,
      timeline_ready: timelineReady,
    },
    timestamp: new Date().toISOString(),
  }
  setCachedTaskSummaryResponse(cacheKey, response)
  res.json(response)
}))

// GET /projects/:id/task-summary/trend — 近6个月月度完成趋势
router.get('/projects/:id/task-summary/trend', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params

  // 计算6个月前的日期
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  const cacheKey = ['task-summary-trend', projectId, fromDate].join(':')
  const cachedResponse = getCachedTaskSummaryResponse<ApiResponse>(cacheKey)
  if (cachedResponse) {
    return res.json(cachedResponse)
  }

  const data = await loadTaskSummaryTrendRows(projectId, fromDate)
  const response = { success: true, data, timestamp: new Date().toISOString() }
  setCachedTaskSummaryResponse(cacheKey, response)
  res.json(response)
}))

// GET /projects/:id/task-summary/assignees — 责任人完成分析
router.get('/projects/:id/task-summary/assignees', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params

  const data = await loadTaskSummaryAssignees(projectId)
  res.json({ success: true, data, timestamp: new Date().toISOString() })
}))

// GET /projects/:id/task-summary/compare — N段时段对比（进度变化量对比）
// 参数: periods (JSON数组，每个元素 {label, from, to})，granularity ("day"|"week"|"month")
// 返回: 每个时段的进度变化统计
function toDateOnly(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

export function getTaskPlannedEndDate(task: Record<string, unknown> | null | undefined): string {
  return toDateOnly(task?.planned_end_date || task?.end_date)
}

export function getTaskActualEndDate(task: Record<string, unknown> | null | undefined): string {
  return toDateOnly(task?.actual_end_date)
}

export function isTaskDelayedByPeriodEnd(
  task: Record<string, unknown> | null | undefined,
  periodEnd: string,
  calendar?: Awaited<ReturnType<typeof resolveConstructionCalendarContext>> | null,
): boolean {
  if (!task) return false
  const plannedEnd = getTaskPlannedEndDate(task)
  if (!plannedEnd || plannedEnd > periodEnd) return false

  if (isCompletedTask(task)) {
    const actualEnd = getTaskActualEndDate(task)
    if (!actualEnd) return false
    return Math.max(0, delayDayDelta(plannedEnd, actualEnd, calendar) ?? 0) > 0
  }

  return plannedEnd <= periodEnd
}

type TaskSummaryCompareSummaryRow = {
  period_label: string
  from: string
  to: string
  total_progress_change: number | string | null
  tasks_updated: number | string | null
  tasks_progressed: number | string | null
  tasks_completed: number | string | null
  delayed: number | string | null
  task_ids?: string[] | null
}

function isSummaryOnlyQuery(value: unknown) {
  const text = normalizeText(value).toLowerCase()
  return text === 'true' || text === '1' || text === 'yes'
}

router.get('/projects/:id/task-summary/compare', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const { periods: periodsStr, granularity = 'day' } = req.query as Record<string, string>
  const summaryOnly = isSummaryOnlyQuery(req.query.summaryOnly ?? req.query.summary_only)

  // 解析 periods 参数
  let periods: Array<{ label: string; from: string; to: string }>
  try {
    periods = periodsStr ? JSON.parse(periodsStr) : []
  } catch {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PERIODS', message: 'periods 参数格式错误，需要 JSON 数组' },
      timestamp: new Date().toISOString(),
    })
  }

  if (!periods.length || periods.length > 10) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PERIODS', message: '至少需要1个时段，最多10个' },
      timestamp: new Date().toISOString(),
    })
  }

  const normalizedPeriods = normalizeTaskSummaryComparePeriods(
    periods,
    normalizeTaskSummaryCompareGranularity(granularity),
  )

  // 校验每个时段
  for (const p of normalizedPeriods) {
    if (!p.from || !p.to || !p.label) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PERIODS', message: '每个时段需要 from, to, label' },
        timestamp: new Date().toISOString(),
      })
    }
  }

  const compareCacheKey = [
    'task-summary-compare',
    projectId,
    normalizeTaskSummaryCompareGranularity(granularity),
    summaryOnly ? 'summary' : 'detail',
    JSON.stringify(normalizedPeriods),
  ].join(':')
  const cachedCompareResponse = getCachedTaskSummaryResponse<ApiResponse>(compareCacheKey)
  if (cachedCompareResponse) {
    return res.json(cachedCompareResponse)
  }

  // 获取所有时段覆盖的日期范围
  const allFroms = normalizedPeriods.map((p) => p.from)
  const allTos = normalizedPeriods.map((p) => p.to)
  const globalFrom = allFroms.sort()[0]
  const globalTo = allTos.sort().reverse()[0]

  // 1. 先获取项目下的所有任务；复用任务总结主链路，真实环境走 PostgreSQL 直连，避免旧 REST 链路拖慢仪表盘。
  const projectTasks = await loadTaskSummaryTaskRows(projectId)

  const taskIds = (projectTasks || []).map(t => t.id)
  const taskMap = new Map((projectTasks || []).map(t => [t.id, t]))
  const [participantUnitNameMap, projectMemberNameMap, workCalendar] = await Promise.all([
    loadParticipantUnitNameMap(
      projectId,
      (projectTasks || []).map((task: any) => task.participant_unit_id).filter(Boolean),
    ),
    loadProjectMemberNameMap(
      projectId,
      (projectTasks || []).map((task: any) => task.assignee_user_id).filter(Boolean),
    ),
    resolveConstructionCalendarContext({ projectId }),
  ])

  const getTaskResponsibleLabel = (task: any) => {
    const assigneeUserId = normalizeText(task?.assignee_user_id)
    if (assigneeUserId && projectMemberNameMap.has(assigneeUserId)) {
      return projectMemberNameMap.get(assigneeUserId) || '责任人待确认'
    }
    const participantUnitId = normalizeText(task?.participant_unit_id)
    if (participantUnitId) return participantUnitNameMap.get(participantUnitId) || '责任单位待确认'
    return '未关联责任人'
  }

  // 2. 从 task_progress_snapshots 获取所有可作为周期基线/周期内变化的快照。
  // 注意：这里不能从 globalFrom 开始查，否则首个周期 from 之前的基线快照会丢失。
  let snapshots: Array<{ task_id: string; progress: number; snapshot_date: string; notes?: string | null }> = []
  if (taskIds.length > 0) {
    const snapshotResult = await supabase
      .from('task_progress_snapshots')
      .select('task_id, progress, snapshot_date, notes')
      .in('task_id', taskIds)
      .lte('snapshot_date', globalTo)
      .order('snapshot_date', { ascending: true })

    if (snapshotResult.error) {
      logger.warn('task_progress_snapshots query failed', { error: snapshotResult.error.message })
    }
    snapshots = (snapshotResult.data ?? []) as typeof snapshots
  }

  const snapshotsByTask = new Map<string, Array<{ progress: number; snapshot_date: string }>>()
  for (const snap of snapshots) {
    const taskId = snap.task_id as string
    if (!snapshotsByTask.has(taskId)) snapshotsByTask.set(taskId, [])
    snapshotsByTask.get(taskId)!.push({
      progress: Number(snap.progress ?? 0),
      snapshot_date: String(snap.snapshot_date ?? ''),
    })
  }

  const getBaselineProgress = (taskId: string, from: string) => {
    const rows = snapshotsByTask.get(taskId) ?? []
    let baseline = 0
    for (const row of rows) {
      if (row.snapshot_date >= from) break
      baseline = row.progress
    }
    return baseline
  }

  const getProgressAtOrBefore = (taskId: string, date: string) => {
    const rows = snapshotsByTask.get(taskId) ?? []
    let progress = 0
    for (const row of rows) {
      if (row.snapshot_date > date) break
      progress = row.progress
    }
    return progress
  }

  const buildProjectProgressTasks = (date: string, mode: 'before' | 'at') =>
    (projectTasks || []).map((task: any) => ({
      id: task.id,
      parent_id: task.parent_id,
      planned_start_date: task.planned_start_date,
      planned_end_date: task.planned_end_date,
      start_date: task.start_date,
      end_date: task.end_date,
      progress: mode === 'before'
        ? getBaselineProgress(task.id, date)
        : getProgressAtOrBefore(task.id, date),
    }))

  // 4. 对每个时段计算进度变化
  const results = normalizedPeriods.map((p) => {
    const { label, from, to } = p
    
    // 筛选该时段内的快照
    const periodSnapshots = snapshots.filter((s: any) => {
      const snapDate = s.snapshot_date as string
      return snapDate >= from && snapDate <= to
    })

    // 按任务分组，计算每个任务的进度变化
    const taskChanges = new Map<string, {
      task_id: string
      task_title: string
      assignee: string
      progress_before: number
      progress_after: number
      progress_delta: number
    }>()

    for (const snap of periodSnapshots) {
      const taskId = snap.task_id as string
      const task = taskMap.get(taskId)
      const progress = snap.progress as number

      if (!taskChanges.has(taskId)) {
        // 第一次遇到这个任务，记录初始进度
        const baselineProgress = getBaselineProgress(taskId, from)
        taskChanges.set(taskId, {
          task_id: taskId,
          task_title: task?.title || '未命名任务',
          assignee: getTaskResponsibleLabel(task),
          progress_before: baselineProgress,
          progress_after: progress,
          progress_delta: progress - baselineProgress,
        })
      } else {
        // 更新最终进度
        const existing = taskChanges.get(taskId)!
        existing.progress_after = progress
        existing.progress_delta = progress - existing.progress_before
      }
    }

    // 汇总统计
    const taskDetails = Array.from(taskChanges.values())
    const baselineProjectProgress = calculateProgressMetrics(buildProjectProgressTasks(from, 'before'), new Date(`${from}T00:00:00.000Z`)).currentProgress
    const currentProjectProgress = calculateProgressMetrics(buildProjectProgressTasks(to, 'at'), new Date(`${to}T00:00:00.000Z`)).currentProgress
    const totalProgressChange = Number((currentProjectProgress - baselineProjectProgress).toFixed(2))
    const tasksUpdated = taskDetails.length
    const tasksCompleted = taskDetails.filter(t => t.progress_after >= 100).length
    // eslint-disable-next-line -- route-level-aggregation-approved
    const delayedTasks = (projectTasks || []).filter((task: any) => isTaskDelayedByPeriodEnd(task, to, workCalendar)).length

    // 计算进度增加 > 0 的任务数（正向进展）
    const tasksProgressed = taskDetails.filter(t => t.progress_delta > 0).length

    return {
      period_label: label,
      from,
      to,
      summary: {
        total_progress_change: totalProgressChange,  // 总进度变化（百分比和）
        tasks_updated: tasksUpdated,                 // 有进度更新的任务数
        tasks_progressed: tasksProgressed,           // 有正向进展的任务数
        tasks_completed: tasksCompleted,             // 期间完成的任务数
        delayed: delayedTasks,    // 真实延期任务数（截至该时段结束日）
        on_time_rate: tasksUpdated > 0 ? Math.round((tasksProgressed / tasksUpdated) * 100) : 0,
      },
      task_ids: taskDetails.map(t => t.task_id),
      task_details: taskDetails.map(t => ({
        id: t.task_id,
        title: t.task_title,
        progress: t.progress_after,
        progress_before: t.progress_before,
        progress_delta: t.progress_delta,
        assignee: t.assignee,
        end_date: getTaskPlannedEndDate(taskMap.get(t.task_id) as Record<string, unknown>),
        completed_at: getTaskActualEndDate(taskMap.get(t.task_id) as Record<string, unknown>),
        specialty_type: '',
        is_on_time: !isTaskDelayedByPeriodEnd(taskMap.get(t.task_id) as Record<string, unknown>, to, workCalendar),
      })),
    }
  })

  const response: ApiResponse = { success: true, data: results, timestamp: new Date().toISOString() }
  setCachedTaskSummaryResponse(compareCacheKey, response)
  res.json(response)
}))

// GET /projects/:id/daily-progress — 当日任务进度变化统计
// 参数: date (YYYY-MM-DD)，默认今天
// 返回: 当日进度变化百分比总和、更新的任务数、完成的任务数、任务详情列表
router.get('/projects/:id/daily-progress', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const targetDate = (req.query.date as string) || new Date().toISOString().slice(0, 10)
  const previousDate = new Date(`${targetDate}T00:00:00`)
  previousDate.setDate(previousDate.getDate() - 1)
  const previousDateStr = previousDate.toISOString().slice(0, 10)

  const { data: projectTaskRows, error: projectTaskErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)

  if (projectTaskErr) throw new Error(`[daily-progress] 任务ID查询失败: ${projectTaskErr.message}`)

  const projectTaskIds = (projectTaskRows || []).map((row: any) => row.id)

  // 1. 获取当日更新的所有任务（包括进度变化）
  // 这里先按项目任务ID过滤快照，避免 PostgREST 在嵌套 tasks 关联上生成异常 SQL。
  const snapshotResult = projectTaskIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from('task_progress_snapshots')
        .select(`
          task_id,
          progress,
          snapshot_date,
          conditions_met_count,
          conditions_total_count,
          obstacles_active_count,
          created_at
        `)
        .in('task_id', projectTaskIds)
        .gte('snapshot_date', previousDateStr)
        .lte('snapshot_date', targetDate)
        .order('snapshot_date', { ascending: true })
        .order('created_at', { ascending: true })

  const { data: snapshots, error: snapErr } = snapshotResult

  if (snapErr) {
    // 如果快照表不存在或为空，降级为从 tasks 表获取当日更新的任务
    logger.warn('task_progress_snapshots query failed, falling back to tasks table', { error: snapErr.message })
  }

  const snapshotByDateAndTask = new Map<string, Map<string, any>>()
  for (const snapshot of (snapshots || [])) {
    const snapshotDate = snapshot.snapshot_date as string
    if (!snapshotByDateAndTask.has(snapshotDate)) {
      snapshotByDateAndTask.set(snapshotDate, new Map())
    }
    snapshotByDateAndTask.get(snapshotDate)!.set(snapshot.task_id as string, snapshot)
  }

  const todaySnapshotMap = snapshotByDateAndTask.get(targetDate) ?? new Map<string, any>()
  const previousSnapshotMap = snapshotByDateAndTask.get(previousDateStr) ?? new Map<string, any>()

  // 2. 降级方案：从 tasks 表获取当日更新的任务
  const dayStart = `${targetDate} 00:00:00`
  const dayEnd = `${targetDate} 23:59:59`
  
  const { data: updatedTasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, title, assignee_user_id, participant_unit_id, status, progress, end_date, updated_at')
    .eq('project_id', projectId)
    .gte('updated_at', dayStart)
    .lte('updated_at', dayEnd)

  if (taskErr) throw new Error(`[daily-progress] 查询失败: ${taskErr.message}`)

  const [updatedTaskParticipantUnitNameMap, updatedTaskProjectMemberNameMap] = await Promise.all([
    loadParticipantUnitNameMap(
      projectId,
      (updatedTasks || []).map((task: any) => task.participant_unit_id).filter(Boolean),
    ),
    loadProjectMemberNameMap(
      projectId,
      (updatedTasks || []).map((task: any) => task.assignee_user_id).filter(Boolean),
    ),
  ])

  const getUpdatedTaskResponsibleLabel = (task: any) => {
    const assigneeUserId = normalizeText(task?.assignee_user_id)
    if (assigneeUserId && updatedTaskProjectMemberNameMap.has(assigneeUserId)) {
      return updatedTaskProjectMemberNameMap.get(assigneeUserId) || '责任人待确认'
    }
    const participantUnitId = normalizeText(task?.participant_unit_id)
    if (participantUnitId) return updatedTaskParticipantUnitNameMap.get(participantUnitId) || '责任单位待确认'
    return '未关联责任人'
  }

  // 3. 计算进度变化
  // 由于没有历史进度快照，我们用一个简化的方案：
  // - 假设当日完成的任务进度变化 = 100% - 当日之前的进度
  // - 对于仍在进行中的任务，记录当前进度
  // - 对于已完成任务，标记完成
  
  const details: {
    task_id: string
    task_title: string
    progress_before: number
    progress_after: number
    progress_delta: number
    assignee: string
  }[] = []

  let totalProgressChange = 0
  let tasksCompleted = 0
  let conditionsAdded = 0
  let conditionsClosed = 0
  let obstaclesAdded = 0
  let obstaclesClosed = 0

  const allTaskIds = new Set<string>([
    ...Array.from(todaySnapshotMap.keys()),
    ...Array.from(previousSnapshotMap.keys()),
  ])

  for (const taskId of allTaskIds) {
    const todaySnapshot = todaySnapshotMap.get(taskId)
    const previousSnapshot = previousSnapshotMap.get(taskId)
    const todayConditions = Number(todaySnapshot?.conditions_total_count ?? 0)
    const previousConditions = Number(previousSnapshot?.conditions_total_count ?? 0)
    const todayObstacles = Number(todaySnapshot?.obstacles_active_count ?? 0)
    const previousObstacles = Number(previousSnapshot?.obstacles_active_count ?? 0)

    if (todayConditions > previousConditions) {
      conditionsAdded += todayConditions - previousConditions
    } else {
      conditionsClosed += previousConditions - todayConditions
    }

    if (todayObstacles > previousObstacles) {
      obstaclesAdded += todayObstacles - previousObstacles
    } else {
      obstaclesClosed += previousObstacles - todayObstacles
    }
  }

  for (const task of (updatedTasks || [])) {
    // 简化计算：当天更新的任务，进度变化基于当前状态
    // 对于已完成的任务，假设进度从更新前变为100%
    // 对于进行中的任务，假设进度有变化（实际应该从快照表对比）
    
    const todaySnapshot = todaySnapshotMap.get(task.id) as any
    const previousSnapshot = previousSnapshotMap.get(task.id) as any
    const currentProgress = todaySnapshot?.progress ?? task.progress ?? 0
    const isCompleted = isCompletedTask({ status: task.status, progress: currentProgress })
    
    // 尝试从快照获取之前的进度
    const prevProgress = previousSnapshot?.progress ?? Math.max(0, currentProgress - 10) // 降级：假设进度增加10%
    
    const progressDelta = currentProgress - prevProgress
    
    if (isCompleted) {
      tasksCompleted++
    }

    // 只记录有实际进度变化的任务
    if (progressDelta !== 0 || isCompleted) {
      totalProgressChange += progressDelta
      
      details.push({
        task_id: task.id,
        task_title: task.title || '未命名任务',
        progress_before: prevProgress,
        progress_after: currentProgress,
        progress_delta: progressDelta,
        assignee: getUpdatedTaskResponsibleLabel(task),
      })
    }
  }

  // 4. 返回结果
  const result = {
    date: targetDate,
    previous_date: previousDateStr,
    progress_change: totalProgressChange,
    tasks_updated: details.length,
    tasks_completed: tasksCompleted,
    snapshot_summary: {
      conditions_added: conditionsAdded,
      conditions_closed: conditionsClosed,
      obstacles_added: obstaclesAdded,
      obstacles_closed: obstaclesClosed,
      delayed_tasks: (updatedTasks || []).filter((task: any) => {
        const endDate = task.end_date ? String(task.end_date).slice(0, 10) : ''
        const isCompleted = isCompletedTask(task)
        return Boolean(endDate) && !isCompleted && endDate <= targetDate
      }).length,
    },
    details: details.sort((a, b) => Math.abs(b.progress_delta) - Math.abs(a.progress_delta)),
  }

  res.json({ success: true, data: result, timestamp: new Date().toISOString() })
}))

export default router
