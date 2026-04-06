// 任务完成总结API路由 - Phase 3.6

import { Router } from 'express'
import { TaskSummaryService } from '../services/taskSummaryService.js'
import { getProjectTimelineEvents, isTaskTimelineEventStoreReady } from '../services/taskTimelineService.js'
import { executeSQL, supabase } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validateIdParam } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCompletionReport } from '../types/db.js'

const router = Router()
router.use(authenticate)
const summaryService = new TaskSummaryService()

// 获取任务总结
router.get('/tasks/:taskId/summary', asyncHandler(async (req, res) => {
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
router.post('/tasks/:taskId/summary/generate', asyncHandler(async (req, res) => {
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
router.get('/projects/:projectId/summaries', asyncHandler(async (req, res) => {
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
router.get('/summaries/stats', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string

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

  // 1. 从 milestones 表获取项目里程碑
  //    milestones 表字段: id, title, target_date, status, completed_at
  let msQuery = supabase
    .from('milestones')
    .select('id, title, status, target_date, completed_at')
    .eq('project_id', projectId)
    .order('target_date', { ascending: true })

  if (milestone_id && milestone_id !== 'all') {
    msQuery = msQuery.eq('id', milestone_id)
  }

  const { data: milestones, error: msErr } = await msQuery
  if (msErr) throw new Error(`[task-summary] 里程碑查询失败: ${msErr.message}`)

  // 2. 获取已完成任务（兼容中英文状态值）
  //    tasks 表字段: id, title, assignee, status, start_date, end_date, progress, is_milestone
  let tasksQuery = supabase
    .from('tasks')
    .select('id, title, assignee, assignee_unit, status, start_date, end_date, progress, is_milestone, updated_at')
    .eq('project_id', projectId)
    .in('status', ['已完成', 'completed'])
    .order('updated_at', { ascending: false })

  if (date_from) {
    tasksQuery = tasksQuery.gte('end_date', date_from)
  }
  if (date_to) {
    tasksQuery = tasksQuery.lte('end_date', date_to)
  }
  const { data: tasks, error: taskErr } = await tasksQuery
  if (taskErr) throw new Error(`[task-summary] 任务查询失败: ${taskErr.message}`)

  // 3. 获取 task_milestones 关联表 — 建立 taskId → milestoneId 映射
  const taskIds = (tasks || []).map((t: any) => t.id)
  let taskMsMap: Record<string, string[]> = {} // taskId → milestoneId[]
  if (taskIds.length > 0) {
    const { data: tmRows } = await supabase
      .from('task_milestones')
      .select('task_id, milestone_id')
      .in('task_id', taskIds)
    if (tmRows) {
      for (const row of tmRows) {
        if (!taskMsMap[row.task_id]) taskMsMap[row.task_id] = []
        taskMsMap[row.task_id].push(row.milestone_id)
      }
    }
  }

  // 4. 获取延期记录
  let delayMap: Record<string, any[]> = {}
  if (taskIds.length > 0) {
    const { data: delays } = await supabase
      .from('task_delay_history')
      .select('task_id, delay_days, reason, delay_reason, created_at')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
    if (delays) {
      for (const d of delays) {
        if (!delayMap[d.task_id]) delayMap[d.task_id] = []
        delayMap[d.task_id].push(d)
      }
    }
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
          assignee_unit: t.assignee_unit,
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
      const delayTotal = delays.reduce((sum: number, d: any) => sum + (d.delay_days || 0), 0)
      const endDate = t.end_date as string | null
      const completedAt = t.updated_at as string | null
      const isDelayed = delayTotal > 0 || (endDate && completedAt && completedAt.slice(0, 10) > endDate)
      return {
        id: t.id,
        title: t.title,
        assignee: t.assignee,
        assignee_unit: t.assignee_unit,
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
    completed_milestone_count: (milestones || []).filter((m: any) =>
      m.status === '已完成' || m.status === 'completed'
    ).length,
  }

  const timelineReady = await isTaskTimelineEventStoreReady(projectId)
  const timelineEvents = timelineReady ? await getProjectTimelineEvents(projectId) : []

  const response: ApiResponse = {
    success: true,
    data: { stats, groups, timeline_events: timelineEvents, timeline_ready: timelineReady },
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
    .select('end_date, updated_at')
    .eq('project_id', projectId)
    .in('status', ['已完成', 'completed'])
    .not('end_date', 'is', null)
    .gte('end_date', fromDate)

  if (error) throw new Error(`[trend] 查询失败: ${error.message}`)

  // JS 层按月聚合（以 end_date 的月份归类）
  const monthMap: Record<string, { month: string; total: number; on_time: number; delayed: number }> = {}
  for (const r of (rows || [])) {
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
    .select('assignee, end_date, updated_at')
    .eq('project_id', projectId)
    .in('status', ['已完成', 'completed'])

  if (error) throw new Error(`[assignees] 查询失败: ${error.message}`)

  // JS 层按责任人聚合（以 end_date vs updated_at 判断是否按时）
  const map: Record<string, { total: number; on_time: number; delayed: number }> = {}
  for (const r of (rows || [])) {
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
// 参数: periods (JSON数组，每个元素 {label, from, to})，granularity ("day"|"week")
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

  // 校验每个时段
  for (const p of periods) {
    if (!p.from || !p.to || !p.label) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PERIODS', message: '每个时段需要 from, to, label' },
        timestamp: new Date().toISOString(),
      })
    }
  }

  // 获取所有时段覆盖的日期范围
  const allFroms = periods.map((p) => p.from)
  const allTos = periods.map((p) => p.to)
  const globalFrom = allFroms.sort()[0]
  const globalTo = allTos.sort().reverse()[0]

  // 1. 先获取项目下的所有任务ID
  const { data: projectTasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, title, assignee, status')
    .eq('project_id', projectId)

  if (tasksErr) {
    logger.warn('project tasks query failed', { error: tasksErr.message })
  }

  const taskIds = (projectTasks || []).map(t => t.id)
  const taskMap = new Map((projectTasks || []).map(t => [t.id, t]))

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
  const results = periods.map((p) => {
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
          assignee: task?.assignee || '',
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

  // 1. 获取当日更新的所有任务（包括进度变化）
  // 使用 task_progress_snapshots 表记录每日进度快照
  const { data: snapshots, error: snapErr } = await supabase
    .from('task_progress_snapshots')
    .select(`
      task_id,
      progress,
      snapshot_date,
      tasks!inner(id, title, assignee, status, progress as current_progress)
    `)
    .eq('tasks.project_id', projectId)
    .eq('snapshot_date', targetDate)

  if (snapErr) {
    // 如果快照表不存在或为空，降级为从 tasks 表获取当日更新的任务
    logger.warn('task_progress_snapshots query failed, falling back to tasks table', { error: snapErr.message })
  }

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

  for (const task of (updatedTasks || [])) {
    // 简化计算：当天更新的任务，进度变化基于当前状态
    // 对于已完成的任务，假设进度从更新前变为100%
    // 对于进行中的任务，假设进度有变化（实际应该从快照表对比）
    
    const currentProgress = task.progress || 0
    const isCompleted = task.status === '已完成' || task.status === 'completed'
    
    // 尝试从快照获取之前的进度
    const prevSnapshot = (snapshots || []).find((s: any) => s.task_id === task.id) as any
    const prevProgress = prevSnapshot?.progress ?? Math.max(0, currentProgress - 10) // 降级：假设进度增加10%
    
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
    progress_change: totalProgressChange,
    tasks_updated: details.length,
    tasks_completed: tasksCompleted,
    details: details.sort((a, b) => Math.abs(b.progress_delta) - Math.abs(a.progress_delta)),
  }

  res.json({ success: true, data: result, timestamp: new Date().toISOString() })
}))

export default router
