// 任务完成总结API路由 - Phase 3.6

import { Router } from 'express'
import { z } from 'zod'
import { TaskSummaryService } from '../services/taskSummaryService.js'
import { getProjectTimelineEvents, isTaskTimelineEventStoreReady } from '../services/taskTimelineService.js'
import { executeSQL, supabase } from '../services/dbService.js'
import { getApprovedDelayRequestsByTaskIds } from '../services/delayRequests.js'
import {
  normalizeTaskSummaryCompareGranularity,
  normalizeTaskSummaryComparePeriods,
} from '../services/taskSummaryCompareService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import { isCompletedMilestone, isCompletedTask } from '../utils/taskStatus.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCompletionReport } from '../types/db.js'

const router = Router()
router.use(authenticate)
const summaryService = new TaskSummaryService()

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

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function loadParticipantUnitNameMap(unitIds: string[]) {
  const uniqueIds = Array.from(new Set(unitIds.filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name')
    .in('id', uniqueIds)

  if (error) throw new Error(`[participant-units] 查询失败: ${error.message}`)

  return new Map((data || []).map((row: any) => [String(row.id), normalizeText(row.unit_name)]))
}

function isMissingParticipantUnitIdColumn(error: unknown) {
  if (!error) return false
  const text = typeof error === 'string'
    ? error
    : [
        (error as { message?: unknown })?.message,
        (error as { details?: unknown })?.details,
        (error as { hint?: unknown })?.hint,
        String(error),
      ].filter(Boolean).join(' ')

  return /participant_unit_id/i.test(text)
}

async function fetchTaskSummaryRows(
  buildQuery: (selectClause: string) => Promise<{ data: any[] | null; error: any }>,
  primarySelect: string,
  fallbackSelect: string,
  retryLabel: string,
) : Promise<any[]> {
  const runQuery = async (selectClause: string) => {
    try {
      return await buildQuery(selectClause)
    } catch (error) {
      return { data: null, error }
    }
  }

  let result: { data: any[] | null; error: any } = await runQuery(primarySelect)

  if (isMissingParticipantUnitIdColumn(result.error)) {
    logger.warn('task-summary query missing participant_unit_id column, retrying without it', {
      retryLabel,
      error: result.error?.message,
    })
    result = await runQuery(fallbackSelect)
  }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.data ?? []
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
router.get('/tasks/:taskId/summary', validate(taskIdParamSchema, 'params'), asyncHandler(async (req, res) => {
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
router.post('/tasks/:taskId/summary/generate', validate(taskIdParamSchema, 'params'), validate(generateTaskSummaryBodySchema), asyncHandler(async (req, res) => {
  const { taskId } = req.params
  // 优先从请求头获取 userId（更安全），降级到 body
  const userId = (req.headers['x-user-id'] as string) || req.body.userId || 'system'

  logger.info('Generating task summary', { taskId, userId })

  try {
    const summary = await summaryService.generateTaskSummary(taskId, userId)

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
router.get('/projects/:projectId/summaries', validate(projectIdParamSchema, 'params'), validate(projectSummariesQuerySchema, 'query'), asyncHandler(async (req, res) => {
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
router.get('/summaries/stats', validate(summaryStatsQuerySchema, 'query'), asyncHandler(async (req, res) => {
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

// ─── 新增：项目级任务完成汇总（按里程碑分组）─────────────────
// GET /api/projects/:id/task-summary
// 查询参数: type(all|milestone|normal), milestone_id, date_from, date_to
router.get('/projects/:id/task-summary', validateIdParam, asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const { type, milestone_id, date_from, date_to } = req.query as Record<string, string>

  logger.info('Fetching project task summary', { projectId, type, milestone_id })

  const milestonesPromise = (async () => {
    let msQuery = supabase
      .from('milestones')
      .select('id, title, status, target_date, completed_at')
      .eq('project_id', projectId)
      .order('target_date', { ascending: true })

    if (milestone_id && milestone_id !== 'all') {
      msQuery = msQuery.eq('id', milestone_id)
    }

    const { data, error } = await msQuery
    if (error) throw new Error(`[task-summary] 里程碑查询失败: ${error.message}`)
    return data ?? []
  })()

  const tasksPromise = fetchTaskSummaryRows(
    async (selectClause) => {
      let tasksQuery = supabase
        .from('tasks')
        .select(selectClause)
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })

      if (date_from) {
        tasksQuery = tasksQuery.gte('end_date', date_from)
      }
      if (date_to) {
        tasksQuery = tasksQuery.lte('end_date', date_to)
      }

      const { data, error } = await tasksQuery
      return { data, error }
    },
    'id, title, assignee, assignee_unit, participant_unit_id, status, start_date, end_date, progress, is_milestone, updated_at',
    'id, title, assignee, assignee_unit, status, start_date, end_date, progress, is_milestone, updated_at',
    `task-summary:${projectId}`,
  ).then((rows) => rows.filter((task: any) => isCompletedTask(task)))

  const timelineReadyPromise = isTaskTimelineEventStoreReady(projectId)
  const monthlyFulfillmentPromise = loadMonthlyFulfillmentTrend(projectId)

  const [milestones, tasks, timelineReady, monthlyFulfillment] = await Promise.all([
    milestonesPromise,
    tasksPromise,
    timelineReadyPromise,
    monthlyFulfillmentPromise,
  ])

  const taskIds = (tasks || []).map((t: any) => t.id)
  const participantUnitIds = Array.from(
    new Set((tasks || []).map((task: any) => task.participant_unit_id).filter(Boolean)),
  )

  const [participantUnitNameMap, taskMilestoneRows, delays, timelineEvents] = await Promise.all([
    loadParticipantUnitNameMap(participantUnitIds),
    taskIds.length > 0
      ? supabase
          .from('task_milestones')
          .select('task_id, milestone_id')
          .in('task_id', taskIds)
          .then(({ data, error }) => {
            if (error) throw error
            return data ?? []
          })
      : Promise.resolve([]),
    taskIds.length > 0 ? getApprovedDelayRequestsByTaskIds(taskIds) : Promise.resolve([]),
    timelineReady ? getProjectTimelineEvents(projectId) : Promise.resolve([]),
  ])

  // 3. 获取 task_milestones 关联表 — 建立 taskId → milestoneId 映射
  let taskMsMap: Record<string, string[]> = {} // taskId → milestoneId[]
  for (const row of taskMilestoneRows) {
    if (!taskMsMap[row.task_id]) taskMsMap[row.task_id] = []
    taskMsMap[row.task_id].push(row.milestone_id)
  }

  // 4. 获取延期记录
  let delayMap: Record<string, any[]> = {}
  for (const delay of delays) {
    if (!delayMap[delay.task_id]) delayMap[delay.task_id] = []
    delayMap[delay.task_id].push(delay)
  }

  // 5. 组装分组数据（按里程碑分组）
  const groups = (milestones || []).map((ms: any) => {
    // 找出属于该里程碑的任务（通过 task_milestones）
    const msTasks = (tasks || [])
      .filter((t: any) => {
        const msIds = taskMsMap[t.id] || []
        const belongsToMs = msIds.includes(ms.id)
        if (type === 'milestone') return belongsToMs && t.is_milestone
        if (type === 'normal') return belongsToMs && !t.is_milestone
        return belongsToMs
      })
      .map((t: any) => {
        const delays = delayMap[t.id] || []
        // eslint-disable-next-line -- route-level-aggregation-approved
        const delayTotal = delays.reduce((sum: number, d: any) => sum + (d.delay_days || 0), 0)
        // 用 end_date 作为计划结束日，updated_at 作为实际完成时间
        const endDate = t.end_date as string | null
        const completedAt = t.updated_at as string | null
        const isDelayed = delayTotal > 0 || (
          endDate && completedAt && completedAt.slice(0, 10) > endDate
        )
        // 计算计划工期（start_date → end_date，单位天）
        let plannedDuration: number | null = null
        if (t.start_date && t.end_date) {
          const d1 = new Date(t.start_date).getTime()
          const d2 = new Date(t.end_date).getTime()
          plannedDuration = Math.round((d2 - d1) / 86400000)
        }
        return {
          id: t.id,
          title: t.title,
          assignee: t.assignee,
          assignee_unit: t.assignee_unit || participantUnitNameMap.get(t.participant_unit_id) || null,
          participant_unit_id: t.participant_unit_id || null,
          completed_at: completedAt?.slice(0, 10) || endDate,
          planned_end_date: endDate,
          actual_duration: null,
          planned_duration: plannedDuration,
          delay_total_days: delayTotal,
          delay_records: delays.map((d: any) => ({
            delay_days: d.delay_days,
            reason: d.reason || d.delay_reason || '未说明',
            recorded_at: d.created_at,
          })),
          status_label: isDelayed ? 'delayed' : 'on_time',
        }
      })

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
    .map((t: any) => {
      const delays = delayMap[t.id] || []
      // eslint-disable-next-line -- route-level-aggregation-approved
      const delayTotal = delays.reduce((sum: number, d: any) => sum + (d.delay_days || 0), 0)
      const endDate = t.end_date as string | null
      const completedAt = t.updated_at as string | null
      const isDelayed = delayTotal > 0 || (endDate && completedAt && completedAt.slice(0, 10) > endDate)
      return {
        id: t.id,
        title: t.title,
        assignee: t.assignee,
        assignee_unit: t.assignee_unit || participantUnitNameMap.get(t.participant_unit_id) || null,
        participant_unit_id: t.participant_unit_id || null,
        completed_at: completedAt?.slice(0, 10) || endDate,
        planned_end_date: endDate,
        actual_duration: null,
        planned_duration: null,
        delay_total_days: delayTotal,
        delay_records: delays.map((d: any) => ({
          delay_days: d.delay_days,
          reason: d.reason || d.delay_reason || '未说明',
          recorded_at: d.created_at,
        })),
        status_label: isDelayed ? 'delayed' : 'on_time',
      }
    })
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
  const allTasks = groups.flatMap((g: any) => g.tasks)
  const stats = {
    total_completed: allTasks.length,
    on_time_count: allTasks.filter((t: any) => t.status_label === 'on_time').length,
    delayed_count: allTasks.filter((t: any) => t.status_label === 'delayed').length,
    completed_milestone_count: (milestones || []).filter((m: any) => isCompletedMilestone(m)).length,
  }

  const response: ApiResponse = {
    success: true,
    data: { stats, groups, monthlyFulfillment, timeline_events: timelineEvents, timeline_ready: timelineReady },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /projects/:id/task-summary/trend — 近6个月月度完成趋势
router.get('/projects/:id/task-summary/trend', validateIdParam, asyncHandler(async (req, res) => {
  const { id: projectId } = req.params

  // 计算6个月前的日期
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10)

  // 用 end_date 作为计划完成时间，updated_at 近似实际完成时间
  const { data: rows, error } = await supabase
    .from('tasks')
    .select('end_date, updated_at, status, progress')
    .eq('project_id', projectId)
    .not('end_date', 'is', null)
    .gte('end_date', fromDate)

  if (error) throw new Error(`[trend] 查询失败: ${error.message}`)

  // JS 层按月聚合（以 end_date 的月份归类）
  const monthMap: Record<string, { month: string; total: number; on_time: number; delayed: number }> = {}
  for (const r of (rows || [])) {
    if (!isCompletedTask(r)) continue
    const endDate = r.end_date as string
    const completedAt = (r.updated_at as string)?.slice(0, 10) || endDate
    const month = endDate.slice(0, 7) // "YYYY-MM"
    if (!monthMap[month]) monthMap[month] = { month, total: 0, on_time: 0, delayed: 0 }
    monthMap[month].total++
    if (completedAt <= endDate) {
      monthMap[month].on_time++
    } else {
      monthMap[month].delayed++
    }
  }

  const data = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))
  res.json({ success: true, data, timestamp: new Date().toISOString() })
}))

// GET /projects/:id/task-summary/assignees — 责任人完成分析
router.get('/projects/:id/task-summary/assignees', validateIdParam, asyncHandler(async (req, res) => {
  const { id: projectId } = req.params

  const { data: rows, error } = await supabase
    .from('tasks')
    .select('assignee, end_date, updated_at, status, progress')
    .eq('project_id', projectId)

  if (error) throw new Error(`[assignees] 查询失败: ${error.message}`)

  // JS 层按责任人聚合（以 end_date vs updated_at 判断是否按时）
  const map: Record<string, { total: number; on_time: number; delayed: number }> = {}
  for (const r of (rows || [])) {
    if (!isCompletedTask(r)) continue
    const key = r.assignee || '未分配'
    if (!map[key]) map[key] = { total: 0, on_time: 0, delayed: 0 }
    map[key].total++
    const endDate = r.end_date as string | null
    const completedAt = (r.updated_at as string)?.slice(0, 10) || null
    if (endDate && completedAt && completedAt <= endDate) {
      map[key].on_time++
    } else {
      map[key].delayed++
    }
  }

  const data = Object.entries(map)
    .map(([assignee, v]) => ({
      assignee,
      total: v.total,
      on_time: v.on_time,
      delayed: v.delayed,
      on_time_rate: v.total > 0 ? Math.round((v.on_time / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  res.json({ success: true, data, timestamp: new Date().toISOString() })
}))

// GET /projects/:id/task-summary/compare — N段时段对比（进度变化量对比）
// 参数: periods (JSON数组，每个元素 {label, from, to})，granularity ("day"|"week"|"month")
// 返回: 每个时段的进度变化统计
router.get('/projects/:id/task-summary/compare', validateIdParam, asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const { periods: periodsStr, granularity = 'day' } = req.query as Record<string, string>

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

  // 获取所有时段覆盖的日期范围
  const allFroms = normalizedPeriods.map((p) => p.from)
  const allTos = normalizedPeriods.map((p) => p.to)
  const globalFrom = allFroms.sort()[0]
  const globalTo = allTos.sort().reverse()[0]

  // 1. 先获取项目下的所有任务ID
  const projectTasks = await fetchTaskSummaryRows(
    async (selectClause) => {
      const { data, error } = await supabase
        .from('tasks')
        .select(selectClause)
        .eq('project_id', projectId)
      return { data, error }
    },
    'id, title, assignee, assignee_unit, participant_unit_id, status',
    'id, title, assignee, assignee_unit, status',
    `task-summary-compare:${projectId}`,
  )

  const taskIds = (projectTasks || []).map(t => t.id)
  const taskMap = new Map((projectTasks || []).map(t => [t.id, t]))
  const participantUnitNameMap = await loadParticipantUnitNameMap(
    (projectTasks || []).map((task: any) => task.participant_unit_id).filter(Boolean),
  )

  // 2. 从 task_progress_snapshots 获取所有快照
  const { data: snapshots, error: snapErr } = await supabase
    .from('task_progress_snapshots')
    .select('task_id, progress, snapshot_date, notes')
    .in('task_id', taskIds)
    .gte('snapshot_date', globalFrom)
    .lte('snapshot_date', globalTo)
    .order('snapshot_date', { ascending: true })

  if (snapErr) {
    logger.warn('task_progress_snapshots query failed', { error: snapErr.message })
  }

  // 3. 获取每个任务在时段开始前的进度（作为基准）
  const taskBaselineProgress = new Map<string, number>()
  
  // 对于每个任务，找到时段开始前最后一条快照
  for (const snap of (snapshots || [])) {
    const taskId = snap.task_id as string
    const snapDate = snap.snapshot_date as string
    const progress = snap.progress as number
    
    // 如果快照日期在第一个时段开始之前，记录为基准进度
    if (snapDate < globalFrom) {
      taskBaselineProgress.set(taskId, progress)
    }
  }

  // 4. 对每个时段计算进度变化
  const results = normalizedPeriods.map((p) => {
    const { label, from, to } = p
    
    // 筛选该时段内的快照
    const periodSnapshots = (snapshots || []).filter((s: any) => {
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
        const baselineProgress = taskBaselineProgress.get(taskId) || 0
        taskChanges.set(taskId, {
          task_id: taskId,
          task_title: task?.title || '未命名任务',
          assignee: task?.assignee || participantUnitNameMap.get(task?.participant_unit_id) || task?.assignee_unit || '',
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
    // eslint-disable-next-line -- route-level-aggregation-approved
    const totalProgressChange = taskDetails.reduce((sum, t) => sum + t.progress_delta, 0)
    const tasksUpdated = taskDetails.length
    const tasksCompleted = taskDetails.filter(t => t.progress_after >= 100).length

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
        on_time: tasksCompleted,  // 兼容旧字段
        delayed: 0,               // 兼容旧字段
        total: tasksUpdated,      // 兼容旧字段
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
        end_date: '',  // 兼容旧字段
        completed_at: '',
        specialty_type: '',
        is_on_time: t.progress_delta > 0,
      })),
    }
  })

  res.json({ success: true, data: results, timestamp: new Date().toISOString() })
}))

// GET /projects/:id/daily-progress — 当日任务进度变化统计
// 参数: date (YYYY-MM-DD)，默认今天
// 返回: 当日进度变化百分比总和、更新的任务数、完成的任务数、任务详情列表
router.get('/projects/:id/daily-progress', validateIdParam, asyncHandler(async (req, res) => {
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
    .select('id, title, assignee, status, progress, updated_at')
    .eq('project_id', projectId)
    .gte('updated_at', dayStart)
    .lte('updated_at', dayEnd)

  if (taskErr) throw new Error(`[daily-progress] 查询失败: ${taskErr.message}`)

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
        assignee: task.assignee || '未分配',
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
