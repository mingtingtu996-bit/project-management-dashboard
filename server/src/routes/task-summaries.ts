// 任务完成总结API路由 - Phase 3.6

import { Router } from 'express'
import { z } from 'zod'
import {
  TaskSummaryService,
  buildProjectTaskSummaryReadModel,
  buildTaskSummaryDelayRecords,
  resolveTaskSummaryDurationAsOf,
  type TaskSummaryScopeLabelMap,
} from '../services/taskSummaryService.js'
import {
  buildRuntimeScopedDurationForecast,
  isValidScopedDurationForecastDate,
  isValidScopedDurationForecastSimulationSeed,
} from '../services/scopedDurationForecastRuntimeService.js'
import { getProjectTimelineEvents, isTaskTimelineEventStoreReady } from '../services/taskTimelineService.js'
import {
  getTaskSummaryAssigneeRows,
  getTaskSummaryCompletionTrend,
  getTaskSummaryMonthlyPlanFulfillmentTrend,
  getTaskSummaryProjectMemberNameMap,
  resolveTaskSummaryTrendWindow,
} from '../services/projectExecutionSummaryService.js'
import { resolveConstructionCalendarContext } from '../services/constructionCalendar.js'
import { executeSQLOne, supabase } from '../services/dbService.js'
import {
  buildTaskSummaryCompareResults,
  getTaskActualEndDate,
  getTaskPlannedEndDate,
  isTaskDelayedByPeriodEnd,
  normalizeTaskSummaryCompareGranularity,
  normalizeTaskSummaryComparePeriods,
  resolveDailyTaskProgressWindow,
} from '../services/taskSummaryCompareService.js'
import { getDailyTaskProgressReadModel } from '../services/taskSummaryDailyProgressService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  authenticate,
  getAuthorizedRequestProjectId,
  requireProjectEditor,
  requireProjectMember,
} from '../middleware/auth.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCompletionReport } from '../types/db.js'

export {
  buildTaskSummaryDelayRecords,
  getTaskActualEndDate,
  getTaskPlannedEndDate,
  isTaskDelayedByPeriodEnd,
  resolveTaskSummaryDurationAsOf,
}

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
  target_date: z.string().trim().refine(isValidScopedDurationForecastDate, {
    message: 'target_date must be a valid YYYY-MM-DD date',
  }).optional(),
  simulation_seed: z.string().trim().refine(isValidScopedDurationForecastSimulationSeed, {
    message: 'simulation_seed must be a valid 1-128 character seed',
  }).optional(),
}).passthrough().superRefine((query, context) => {
  if (query.target_date && !query.simulation_seed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['simulation_seed'],
      message: 'simulation_seed is required when target_date is provided',
    })
  }
})

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
    .select('id, parent_id, title, participant_unit_id, assignee_user_id, status, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, delay_reason, is_milestone, specialty_type, engineering_category_id, wbs_code, wbs_level, sort_order, updated_at, engineering_object_id, building_object_id, basement_object_id, physical_zone_object_id, functional_area_object_id, phase_object_id, section_object_id, floor_object_id')
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
    const targetDate = normalizeText(req.query.target_date) || undefined
    const simulationSeed = normalizeText(req.query.simulation_seed) || undefined
    const cacheKey = [
      'scoped-duration-forecast',
      projectId,
      asOfDate ?? 'current',
      targetDate ?? 'no-target',
      simulationSeed ?? 'no-seed',
    ].join(':')
    const cachedResponse = getCachedTaskSummaryResponse<ApiResponse>(cacheKey)
    if (cachedResponse) return res.json(cachedResponse)

    const result = await buildRuntimeScopedDurationForecast(projectId, {
      asOfDate,
      targetDate,
      simulationSeed,
    })
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
  const monthlyFulfillmentPromise = getTaskSummaryMonthlyPlanFulfillmentTrend(projectId)

  const [milestones, taskRows, scopeBindingMap, workCalendar, timelineReady, monthlyFulfillment] = await Promise.all([
    milestonesPromise,
    tasksPromise,
    scopeBindingMapPromise,
    workCalendarPromise,
    timelineReadyPromise,
    monthlyFulfillmentPromise,
  ])

  const taskIds = (taskRows || []).map((task: any) => task.id)
  const participantUnitIds = Array.from(
    new Set((taskRows || []).map((task: any) => task.participant_unit_id).filter(Boolean)),
  )
  const assigneeUserIds = Array.from(
    new Set((taskRows || []).map((task: any) => task.assignee_user_id).filter(Boolean)),
  )

  const [participantUnitNameMap, projectMemberNameMap, taskMilestoneRows, timelineEvents] = await Promise.all([
    loadParticipantUnitNameMap(projectId, participantUnitIds),
    getTaskSummaryProjectMemberNameMap(projectId, assigneeUserIds),
    loadTaskSummaryTaskMilestones(projectId, taskIds),
    timelineReady ? getProjectTimelineEvents(projectId) : Promise.resolve([]),
  ])
  const data = await buildProjectTaskSummaryReadModel({
    projectId,
    type,
    milestones,
    taskRows,
    scopeBindingMap,
    workCalendar,
    participantUnitNameMap,
    projectMemberNameMap,
    taskMilestoneRows,
    monthlyFulfillment,
    timelineEvents,
    timelineReady,
  })

  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  setCachedTaskSummaryResponse(cacheKey, response)
  res.json(response)
}))

// GET /projects/:id/task-summary/trend — 近6个月月度完成趋势
router.get('/projects/:id/task-summary/trend', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const asOf = new Date()
  const { fromDate } = resolveTaskSummaryTrendWindow({ months: 6, asOf })

  const cacheKey = ['task-summary-trend', projectId, fromDate].join(':')
  const cachedResponse = getCachedTaskSummaryResponse<ApiResponse>(cacheKey)
  if (cachedResponse) {
    return res.json(cachedResponse)
  }

  const data = await getTaskSummaryCompletionTrend(projectId, { months: 6, asOf })
  const response = { success: true, data, timestamp: asOf.toISOString() }
  setCachedTaskSummaryResponse(cacheKey, response)
  res.json(response)
}))

// GET /projects/:id/task-summary/assignees — 责任人完成分析
router.get('/projects/:id/task-summary/assignees', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params

  const data = await getTaskSummaryAssigneeRows(projectId)
  res.json({ success: true, data, timestamp: new Date().toISOString() })
}))

// GET /projects/:id/task-summary/compare — N段时段对比（进度变化量对比）
// 参数: periods (JSON数组，每个元素 {label, from, to})，granularity ("day"|"week"|"month")
// 返回: 每个时段的进度变化统计
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
  const allTos = normalizedPeriods.map((p) => p.to)
  const globalTo = allTos.sort().reverse()[0]

  // 1. 先获取项目下的所有任务；复用任务总结主链路，真实环境走 PostgreSQL 直连，避免旧 REST 链路拖慢仪表盘。
  const projectTasks = await loadTaskSummaryTaskRows(projectId)

  const taskIds = (projectTasks || []).map(t => t.id)
  const [participantUnitNameMap, projectMemberNameMap, workCalendar] = await Promise.all([
    loadParticipantUnitNameMap(
      projectId,
      (projectTasks || []).map((task: any) => task.participant_unit_id).filter(Boolean),
    ),
    getTaskSummaryProjectMemberNameMap(
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
  // Query all snapshots up to the period end so the service can resolve the first baseline.
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

  const results = buildTaskSummaryCompareResults({
    periods: normalizedPeriods,
    tasks: projectTasks,
    snapshots,
    resolveResponsibleLabel: getTaskResponsibleLabel,
    workCalendar,
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
  const workCalendar = await resolveConstructionCalendarContext({ projectId })
  const {
    targetDate,
    previousDate,
    dayStartInclusive,
    dayEndExclusive,
  } = resolveDailyTaskProgressWindow({
    date: req.query.date as string | undefined,
    timezone: workCalendar.timezone,
  })

  const result = await getDailyTaskProgressReadModel({
    projectId,
    targetDate,
    previousDate,
    dayStartInclusive,
    dayEndExclusive,
  })

  res.json({ success: true, data: result, timestamp: new Date().toISOString() })
}))

export default router
