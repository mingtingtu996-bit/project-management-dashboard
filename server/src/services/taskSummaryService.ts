// 任务完成总结服务 - Phase 3.6（基于 Supabase PostgreSQL）

import { executeSQL, executeSQLOne } from './dbService.js'
import type { Task, TaskCompletionReport } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { delayDayDelta, inclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'
import {
  isCompletedMilestone,
  isCompletedTask,
  type TaskStatusLike,
} from '../utils/taskStatus.js'
import { buildProjectTaskAttributionProjection } from './taskAttributionProjectionService.js'
import {
  buildTaskSummaryAttributionGroups,
  taskAttributionSummaryService,
  type TaskSummaryAttributionTask,
} from './taskAttributionSummaryService.js'
import {
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  buildCalendarDayDurationMetric,
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  type DurationMetricDto,
} from './durationMetricService.js'
import { v4 as uuidv4 } from 'uuid'

export interface EfficiencyStats {
  plannedDuration: number
  actualDuration: number
  efficiencyRatio: number
  efficiencyStatus: 'fast' | 'normal' | 'slow'
}

export interface TaskSummaryDurationStats {
  plannedDuration: number
  actualDuration: number | null
  plannedDurationMetric: DurationMetricDto
  actualDurationMetric: DurationMetricDto
}

export interface TaskSummaryScopeBinding {
  id: string
  scopeDimensionId: string
  label: string
  sortOrder: number
}

export interface TaskSummaryScopeLabelMap {
  specialty: TaskSummaryScopeBinding[]
  building: TaskSummaryScopeBinding[]
  region: TaskSummaryScopeBinding[]
  phase: TaskSummaryScopeBinding[]
}

type ProjectTaskSummaryRow = Record<string, any> & TaskStatusLike & { id: string }

type TaskSummaryDurationInput = Pick<
  Task,
  'start_date' | 'end_date' | 'planned_start_date' | 'planned_end_date' | 'actual_start_date' | 'actual_end_date'
>

export function calculateTaskSummaryDurationStats(
  task: TaskSummaryDurationInput,
  calendar?: ConstructionCalendarContext | null,
  asOfDate?: string,
): TaskSummaryDurationStats {
  const plannedStart = task.planned_start_date || task.start_date
  const plannedEnd = task.planned_end_date || task.end_date
  const plannedDuration = inclusiveDurationDays(plannedStart, plannedEnd) ?? 1
  const asOf = asOfDate
    || String(task.actual_end_date ?? task.planned_end_date ?? task.end_date ?? '').slice(0, 10)
    || businessDateKey(new Date(), calendar?.timezone || 'Asia/Shanghai')
  const actualStart = parseConstructionCalendarDate(task.actual_start_date)
  const actualEnd = parseConstructionCalendarDate(task.actual_end_date)
  const rawActualDuration = actualStart && actualEnd
    ? productionDaysBetweenInclusive(actualStart, actualEnd, calendar)
    : null
  const plannedDurationMetric = buildCalendarDayDurationMetric(plannedDuration, {
    asOf,
    timezone: calendar?.timezone,
  })
  const actualDurationMetric = buildConstructionProductionDayDurationMetric(rawActualDuration, {
    asOf,
    timezone: calendar?.timezone,
    calendar,
  })
  const actualDuration = actualDurationMetric.availability === 'available'
    ? actualDurationMetric.value
    : null

  return {
    plannedDuration,
    actualDuration,
    plannedDurationMetric,
    actualDurationMetric,
  }
}

type TaskCompletionDelayInput = Partial<Pick<
  Task,
  'planned_end_date' | 'end_date' | 'actual_end_date' | 'updated_at' | 'status' | 'progress'
>>

export function calculateTaskCompletionDelayStats(
  task: TaskCompletionDelayInput,
  calendar?: ConstructionCalendarContext | null,
  asOfDate?: string,
): DelayStats {
  const plannedEndValue = task.planned_end_date || task.end_date
  const actualEndValue = task.actual_end_date || (
    isCompletedTask(task)
      ? task.updated_at
      : null
  )
  const asOf = asOfDate
    || String(actualEndValue ?? plannedEndValue ?? '').slice(0, 10)
    || businessDateKey(new Date(), calendar?.timezone || 'Asia/Shanghai')
  const plannedEnd = parseConstructionCalendarDate(plannedEndValue)
  const actualEnd = parseConstructionCalendarDate(actualEndValue)
  const isChronologicallyDelayed = Boolean(plannedEnd && actualEnd && actualEnd > plannedEnd)
  const rawDelayDays = isChronologicallyDelayed
    ? Math.max(0, delayDayDelta(plannedEndValue, actualEndValue, calendar) ?? 0)
    : 0
  const delayDurationMetric = buildConstructionProductionDayDurationMetric(rawDelayDays, {
    asOf,
    timezone: calendar?.timezone,
    calendar,
  })
  const delayDays = delayDurationMetric.availability === 'available'
    ? delayDurationMetric.value
    : null
  const delayDetails = isChronologicallyDelayed
    ? [{
        delay_date: actualEndValue ?? '',
        delay_days: delayDays,
        delay_type: 'auto_detected',
        reason: '实际完成时间晚于计划完成时间',
      }]
    : []

  return {
    totalDelayDays: delayDays,
    delayCount: isChronologicallyDelayed ? 1 : 0,
    delayDetails,
    delayDurationMetric,
  }
}

export function resolveTaskSummaryDurationAsOf(
  task: { completedAt?: string | null; plannedEndDate?: string | null },
  calendar?: ConstructionCalendarContext | null,
  now = new Date(),
) {
  return task.completedAt?.slice(0, 10)
    || task.plannedEndDate?.slice(0, 10)
    || businessDateKey(now, calendar?.timezone)
}

export function buildTaskSummaryDelayRecords(input: {
  isDelayed: boolean
  delayDays: number | null
  delayMetric: DurationMetricDto
  recordedAt: string | null
  rawDelayReason?: unknown
}) {
  if (!input.isDelayed) return []
  const rawReason = String(input.rawDelayReason ?? '').trim() || null
  return [{
    delay_days: input.delayDays,
    delay: input.delayMetric,
    reason: rawReason,
    reason_source: rawReason ? 'tasks.delay_reason' as const : null,
    display_reason: '\u5b9e\u9645\u5b8c\u6210\u65f6\u95f4\u665a\u4e8e\u8ba1\u5212\u5b8c\u6210\u65f6\u95f4',
    display_reason_source: 'derived_completion_variance' as const,
    recorded_at: input.recordedAt,
  }]
}

function resolveTaskSummaryScopeBinding(bindings: TaskSummaryScopeBinding[], value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return bindings.find((binding) => (
    binding.label === normalized
    || binding.id === normalized
    || binding.scopeDimensionId === normalized
  )) ?? null
}

export async function buildProjectTaskSummaryReadModel(
  input: {
    projectId: string
    type?: string | null
    milestones: ProjectTaskSummaryRow[]
    taskRows: ProjectTaskSummaryRow[]
    scopeBindingMap: TaskSummaryScopeLabelMap
    workCalendar?: ConstructionCalendarContext | null
    participantUnitNameMap: ReadonlyMap<string, string>
    projectMemberNameMap: ReadonlyMap<string, string>
    taskMilestoneRows: Array<{ task_id: string; milestone_id: string }>
    monthlyFulfillment: unknown
    timelineEvents: unknown[]
    timelineReady: boolean
  },
  dependencies: {
    getAttributionTotals?: (
      projectId: string,
      tasks: TaskSummaryAttributionTask[],
    ) => Promise<unknown>
  } = {},
) {
  const completedRows = input.taskRows.filter((task) => isCompletedTask(task))
  const attributionProjection = buildProjectTaskAttributionProjection(input.taskRows)
  const normalizedTaskById = new Map(input.taskRows.map((task) => {
    const taskAttribution = attributionProjection.get(String(task.id))
    const building = resolveTaskSummaryScopeBinding(input.scopeBindingMap.building, task.building_object_id)
    const region = resolveTaskSummaryScopeBinding(
      input.scopeBindingMap.region,
      task.physical_zone_object_id ?? task.functional_area_object_id,
    )
    const phase = resolveTaskSummaryScopeBinding(input.scopeBindingMap.phase, task.phase_object_id)
    const plannedEndDate = (task.planned_end_date || task.end_date) as string | null
    const taskCompleted = isCompletedTask(task)
    const actualEndDate = String(task.actual_end_date ?? '').slice(0, 10)
    const completedAt = taskCompleted ? (actualEndDate || plannedEndDate) : null
    const asOf = resolveTaskSummaryDurationAsOf({ completedAt, plannedEndDate }, input.workCalendar)
    const completionDelay = calculateTaskCompletionDelayStats({
      planned_end_date: plannedEndDate,
      actual_end_date: completedAt,
      status: task.status as Task['status'],
      progress: task.progress,
    }, input.workCalendar, asOf)
    const computedDelay = taskCompleted
      ? delayDayDelta(plannedEndDate, completedAt, input.workCalendar)
      : null
    const delayTotal = taskCompleted ? completionDelay.totalDelayDays : 0
    const isDelayed = taskCompleted && (computedDelay ?? delayTotal ?? 0) > 0
    const durationStats = calculateTaskSummaryDurationStats(task as TaskSummaryDurationInput, input.workCalendar, asOf)
    const assigneeUserId = String(task.assignee_user_id ?? '').trim()
    const participantUnitId = String(task.participant_unit_id ?? '').trim()
    const assignee = assigneeUserId ? input.projectMemberNameMap.get(assigneeUserId) ?? null : null
    const normalized = {
      id: task.id,
      title: task.title,
      assignee,
      assignee_user_id: assigneeUserId && assignee ? assigneeUserId : null,
      participant_unit_name: participantUnitId ? input.participantUnitNameMap.get(participantUnitId) ?? null : null,
      participant_unit_id: participantUnitId || null,
      parent_id: task.parent_id || null,
      phase_object_id: phase?.id ?? null,
      phase_name: phase?.label ?? null,
      phase_sort_order: phase?.sortOrder ?? 0,
      wbs_code: task.wbs_code || null,
      wbs_level: task.wbs_level ?? null,
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
      building_id: building?.id ?? null,
      building_name: building?.label ?? null,
      building_sort_order: building?.sortOrder ?? 0,
      region_id: region?.id ?? null,
      region_name: region?.label ?? null,
      region_sort_order: region?.sortOrder ?? 0,
      completed_at: completedAt?.slice(0, 10) || null,
      planned_end_date: plannedEndDate,
      actual_duration: durationStats.actualDuration,
      planned_duration: durationStats.plannedDuration,
      actual_duration_metric: durationStats.actualDurationMetric,
      planned_duration_metric: durationStats.plannedDurationMetric,
      delay_total: completionDelay.delayDurationMetric,
      delay_total_days: delayTotal,
      delay_records: buildTaskSummaryDelayRecords({
        isDelayed,
        delayDays: delayTotal,
        delayMetric: completionDelay.delayDurationMetric,
        recordedAt: completedAt,
        rawDelayReason: task.delay_reason,
      }),
      status_label: taskCompleted ? (isDelayed ? 'delayed' : 'on_time') : (String(task.status ?? '').trim() || 'pending'),
    } satisfies TaskSummaryAttributionTask & Record<string, any>
    return [String(task.id), normalized] as const
  }))

  const taskMilestones = new Map<string, string[]>()
  for (const row of input.taskMilestoneRows) {
    const milestoneIds = taskMilestones.get(row.task_id) ?? []
    milestoneIds.push(row.milestone_id)
    taskMilestones.set(row.task_id, milestoneIds)
  }
  const groups = input.milestones.map((milestone) => ({
    id: milestone.id,
    name: milestone.title,
    status: milestone.status,
    completed_at: milestone.completed_at,
    planned_end_date: milestone.target_date,
    tasks: completedRows
      .filter((task) => {
        const belongsToMilestone = (taskMilestones.get(String(task.id)) ?? []).includes(String(milestone.id))
        if (input.type === 'milestone') return belongsToMilestone && task.is_milestone
        if (input.type === 'normal') return belongsToMilestone && !task.is_milestone
        return belongsToMilestone
      })
      .map((task) => normalizedTaskById.get(String(task.id)))
      .filter(Boolean),
  }))
  const assignedTaskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task?.id)))
  const unclassifiedTasks = completedRows
    .filter((task) => !assignedTaskIds.has(task.id))
    .map((task) => normalizedTaskById.get(String(task.id)))
    .filter(Boolean)
  if (unclassifiedTasks.length > 0) {
    groups.push({
      id: 'unclassified',
      name: '\u672a\u5f52\u5c5e\u91cc\u7a0b\u7891',
      status: null,
      completed_at: null,
      planned_end_date: null,
      tasks: unclassifiedTasks,
    })
  }

  const allTasks = Array.from(normalizedTaskById.values())
  const completedSummaryTasks = completedRows
    .map((task) => normalizedTaskById.get(String(task.id)))
    .filter(Boolean) as Array<TaskSummaryAttributionTask & Record<string, any>>
  const getAttributionTotals = dependencies.getAttributionTotals
    ?? ((projectId: string, tasks: TaskSummaryAttributionTask[]) => (
      taskAttributionSummaryService.getAttributionTotals(projectId, tasks)
    ))
  const attributionTotals = await getAttributionTotals(input.projectId, allTasks)

  return {
    stats: {
      total_completed: completedSummaryTasks.length,
      on_time_count: completedSummaryTasks.filter((task) => task.status_label === 'on_time').length,
      delayed_count: completedSummaryTasks.filter((task) => task.status_label === 'delayed').length,
      completed_milestone_count: input.milestones.filter((milestone) => isCompletedMilestone(milestone)).length,
    },
    groups,
    attribution_groups: buildTaskSummaryAttributionGroups(completedSummaryTasks, input.workCalendar),
    attribution_totals: attributionTotals,
    monthlyFulfillment: input.monthlyFulfillment,
    timeline_events: input.timelineEvents,
    timeline_ready: input.timelineReady,
  }
}

export interface DelayStats {
  totalDelayDays: number | null
  delayCount: number
  delayDurationMetric: DurationMetricDto
  delayDetails: Array<{
    delay_date: string
    delay_days: number | null
    delay_type: string
    reason: string
  }>
}

export interface ObstacleStats {
  obstacleCount: number
  obstaclesSummary: string
  obstacles: Array<{
    type: string
    description: string
    severity: string
    resolvedAt?: string
  }>
}

export interface TaskSummaryData {
  task_id: string
  project_id: string
  report_type: string
  title: string
  summary: string
  planned_duration: number
  actual_duration: number
  efficiency_ratio: number
  efficiency_status: string
  total_delay_days: number
  delay_count: number
  delay_details: string
  obstacle_count: number
  obstacles_summary: string
  // P2-001修复: 添加质量评分字段
  quality_score?: number
  quality_notes?: string
  highlights: string
  issues: string
  lessons_learned: string
}

export class TaskSummaryService {

  /**
   * 生成任务完成总结
   */
  async generateTaskSummary(taskId: string, projectId: string, userId?: string): Promise<TaskCompletionReport> {
    // 获取任务信息
    const task = await executeSQLOne<Task>(
      'SELECT * FROM tasks WHERE id = ? AND project_id = ? LIMIT 1',
      [taskId, projectId]
    )

    if (!task) {
      throw new Error('任务不存在')
    }

    logger.info('开始生成任务总结', { taskId, taskName: task.title })

    // 计算效率统计
    const efficiencyStats = await this.calculateEfficiencyStats(task)

    // 计算延期统计
    const delayStats = await this.calculateDelayStats(taskId, projectId)

    // 计算阻碍统计
    const obstacleStats = await this.calculateObstacleStats(taskId, projectId)

    // P2-001修复: 计算质量评分
    const qualityStats = this.calculateQualityScore(efficiencyStats, delayStats, obstacleStats)

    // 生成总结内容
    const taskName = task.title
    const summaryData: TaskSummaryData = {
      task_id: task.id,
      project_id: task.project_id,
      report_type: 'task',
      title: `${taskName} 完成总结`,
      summary: `任务 "${taskName}" 已完成，本报告汇总了任务执行过程中的关键数据和经验教训。`,
      planned_duration: efficiencyStats.plannedDuration,
      actual_duration: efficiencyStats.actualDuration,
      efficiency_ratio: efficiencyStats.efficiencyRatio,
      efficiency_status: efficiencyStats.efficiencyStatus,
      total_delay_days: delayStats.totalDelayDays,
      delay_count: delayStats.delayCount,
      delay_details: JSON.stringify(delayStats.delayDetails),
      obstacle_count: obstacleStats.obstacleCount,
      obstacles_summary: obstacleStats.obstaclesSummary,
      // P2-001修复: 添加质量评分
      quality_score: qualityStats.score,
      quality_notes: qualityStats.notes,
      highlights: this.generateHighlights(efficiencyStats, delayStats),
      issues: this.generateIssues(delayStats, obstacleStats),
      lessons_learned: this.generateLessonsLearned(efficiencyStats, delayStats, obstacleStats)
    }

    // 检查是否已存在总结报告
    const existingReport = await executeSQLOne<any>(
      'SELECT * FROM task_completion_reports WHERE task_id = ? AND project_id = ? LIMIT 1',
      [taskId, task.project_id]
    )

    let report: TaskCompletionReport
    const now = new Date().toISOString()

    if (existingReport) {
      // 更新已有报告
      await executeSQL(
        `UPDATE task_completion_reports SET
           title = ?, summary = ?, planned_duration = ?, actual_duration = ?,
           efficiency_ratio = ?, efficiency_status = ?, total_delay_days = ?,
           delay_count = ?, delay_details = ?, obstacle_count = ?,
           obstacles_summary = ?, quality_score = ?, quality_notes = ?,
           highlights = ?, issues = ?, lessons_learned = ?,
           generated_by = ?, generated_at = ?, updated_at = ?
         WHERE id = ? AND project_id = ?`,
        [
          summaryData.title, summaryData.summary,
          summaryData.planned_duration, summaryData.actual_duration,
          summaryData.efficiency_ratio, summaryData.efficiency_status,
          summaryData.total_delay_days, summaryData.delay_count,
          summaryData.delay_details, summaryData.obstacle_count,
          summaryData.obstacles_summary,
          summaryData.quality_score ?? null, summaryData.quality_notes ?? null,
          summaryData.highlights, summaryData.issues, summaryData.lessons_learned,
          userId ?? null, now, now,
          existingReport.id, task.project_id
        ]
      )

      report = { ...existingReport, ...summaryData, generated_by: userId, generated_at: now, updated_at: now }
      logger.info('更新任务总结报告', { reportId: existingReport.id, taskId })
    } else {
      // 创建新报告
      const newId = uuidv4()
      await executeSQL(
        `INSERT INTO task_completion_reports
           (id, task_id, project_id, report_type, title, summary,
            planned_duration, actual_duration, efficiency_ratio, efficiency_status,
            total_delay_days, delay_count, delay_details, obstacle_count,
            obstacles_summary, quality_score, quality_notes,
            highlights, issues, lessons_learned,
            generated_by, generated_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newId, summaryData.task_id, summaryData.project_id, summaryData.report_type,
          summaryData.title, summaryData.summary,
          summaryData.planned_duration, summaryData.actual_duration,
          summaryData.efficiency_ratio, summaryData.efficiency_status,
          summaryData.total_delay_days, summaryData.delay_count,
          summaryData.delay_details, summaryData.obstacle_count,
          summaryData.obstacles_summary,
          summaryData.quality_score ?? null, summaryData.quality_notes ?? null,
          summaryData.highlights, summaryData.issues, summaryData.lessons_learned,
          userId ?? null, now, now, now
        ]
      )

      report = {
        id: newId,
        ...summaryData,
        generated_by: userId,
        generated_at: now,
        created_at: now,
        updated_at: now
      } as any
      logger.info('创建任务总结报告', { reportId: newId, taskId })
    }

    return report
  }

  /**
   * 计算质量评分
   * P2-001修复: 实现多维度质量评分算法
   * 评分维度：效率(40%) + 延期(30%) + 阻碍(30%)
   */
  private calculateQualityScore(
    efficiency: EfficiencyStats,
    delays: DelayStats,
    obstacles: ObstacleStats
  ): { score: number; notes: string } {
    // 效率评分 (40%权重)
    let efficiencyScore = 70 // 基础分
    if (efficiency.efficiencyStatus === 'fast') {
      efficiencyScore = 95
    } else if (efficiency.efficiencyStatus === 'normal') {
      efficiencyScore = 80
    } else {
      efficiencyScore = 60
    }

    // 延期评分 (30%权重)
    let delayScore = 100 // 无延期满分
    if (delays.totalDelayDays > 0) {
      // 每延期1天扣5分，最低40分
      delayScore = Math.max(40, 100 - delays.totalDelayDays * 5)
    }

    // 阻碍评分 (30%权重)
    let obstacleScore = 100 // 无阻碍满分
    if (obstacles.obstacleCount > 0) {
      // 每个阻碍扣10分，最低40分
      obstacleScore = Math.max(40, 100 - obstacles.obstacleCount * 10)
    }

    // 加权计算总分
    const totalScore = Math.round(
      efficiencyScore * 0.4 + delayScore * 0.3 + obstacleScore * 0.3
    )

    // 生成质量评语
    let notes = ''
    if (totalScore >= 90) {
      notes = '任务执行质量优秀，各项指标表现良好。'
    } else if (totalScore >= 75) {
      notes = '任务执行质量良好，部分指标有改进空间。'
    } else if (totalScore >= 60) {
      notes = '任务执行基本合格，建议关注后续阻碍闭合。'
    } else {
      notes = '任务执行偏弱，建议复盘原因并制定改进措施。'
    }

    // 添加具体扣分项说明
    const deductions: string[] = []
    if (efficiencyScore < 80) {
      deductions.push(`效率偏低(${efficiencyScore}分)`)
    }
    if (delayScore < 100) {
      deductions.push(`延期影响(${delayScore}分)`)
    }
    if (obstacleScore < 100) {
      deductions.push(`阻碍较多(${obstacleScore}分)`)
    }

    if (deductions.length > 0) {
      notes += ` 扣分项：${deductions.join('、')}。`
    }

    return { score: totalScore, notes }
  }

  /**
   * 计算效率统计
   * BIZ-013: 效率计算除零保护
   */
  async calculateEfficiencyStats(task: Task): Promise<EfficiencyStats> {
    const {
      plannedDuration: plannedDurationDays,
      actualDuration: actualDurationDays,
    } = calculateTaskSummaryDurationStats(task)

    // 获取进度快照计算实际效率
    const snapshots = await executeSQL<any>(
      'SELECT * FROM task_progress_history WHERE task_id = ? ORDER BY created_at ASC',
      [task.id]
    )

    let efficiencyRatio = 1.0
    let efficiencyStatus: 'fast' | 'normal' | 'slow' = 'normal'

    if (snapshots && snapshots.length > 1) {
      // 基准效率（每天应完成的进度百分比）
      const baselineEfficiency = plannedDurationDays / 100

      // 计算实际效率（基于进度快照）
      let totalPhaseDuration = 0
      let totalProgressDelta = 0

      for (let i = 1; i < snapshots.length; i++) {
        const prevSnapshot = snapshots[i - 1]
        const currSnapshot = snapshots[i]

        const progressDelta = (currSnapshot.progress || 0) - (prevSnapshot.progress || 0)
        const phaseDuration = signedDurationDayDelta(prevSnapshot.created_at, currSnapshot.created_at) ?? 0

        // BIZ-013修复：添加除零保护
        if (progressDelta !== 0) {
          totalPhaseDuration += phaseDuration
          totalProgressDelta += progressDelta
        }
      }

      // BIZ-013修复：防止除零错误
      const actualEfficiency = totalProgressDelta !== 0
        ? totalPhaseDuration / totalProgressDelta
        : actualDurationDays

      // 计算效率比
      efficiencyRatio = actualEfficiency !== 0
        ? baselineEfficiency / actualEfficiency
        : 1

      // BIZ-013修复：安全检查
      if (isNaN(efficiencyRatio) || !isFinite(efficiencyRatio)) {
        efficiencyRatio = 1.0
      }
    }

    // 判断效率状态
    if (efficiencyRatio > 1.1) {
      efficiencyStatus = 'fast'  // 提前
    } else if (efficiencyRatio < 0.9) {
      efficiencyStatus = 'slow'   // 偏慢
    } else {
      efficiencyStatus = 'normal' // 正常
    }

    return {
      plannedDuration: plannedDurationDays,
      actualDuration: actualDurationDays,
      efficiencyRatio: Number(efficiencyRatio.toFixed(2)),
      efficiencyStatus
    }
  }

  /**
   * 计算延期统计
   */
  async calculateDelayStats(taskId: string, projectId: string): Promise<DelayStats> {
    const task = await executeSQLOne<any>(
      'SELECT id, project_id, standard_work_code, template_node_id, planned_end_date, end_date, actual_end_date, updated_at, status, progress FROM tasks WHERE id = ? AND project_id = ? LIMIT 1',
      [taskId, projectId],
    )
    if (!task) {
      return {
        totalDelayDays: null,
        delayCount: 0,
        delayDetails: [],
        delayDurationMetric: buildConstructionProductionDayDurationMetric(null, {
          asOf: businessDateKey(new Date()),
          calendar: null,
        }),
      }
    }

    const calendar = await resolveConstructionCalendarContext({
      projectId: task.project_id ?? null,
      standardWorkCode: task.standard_work_code ?? null,
      templateNodeId: task.template_node_id ?? null,
      onError: (error) => logger.warn('[taskSummaryService] construction calendar unavailable for delay stats', {
        taskId,
        projectId: task.project_id,
        error: error instanceof Error ? error.message : String(error),
      }),
    })

    return calculateTaskCompletionDelayStats(task, calendar)
  }

  /**
   * 计算阻碍统计
   */
  async calculateObstacleStats(taskId: string, projectId: string): Promise<ObstacleStats> {
    const obstacles = await executeSQL<any>(
      'SELECT id, obstacle_type, description, severity, status, resolved_at, created_at FROM task_obstacles WHERE task_id = ? AND project_id = ? ORDER BY created_at DESC',
      [taskId, projectId]
    )

    const obstacleCount = obstacles?.length || 0
    const obstaclesSummary = obstacleCount > 0
      ? `任务执行过程中共遇到 ${obstacleCount} 个阻碍，主要集中在${this.getObstacleTypesSummary(obstacles || [])}等方面。`
      : '任务执行顺利，未记录到阻碍。'

    const formattedObstacles = (obstacles || []).map((obs: any) => ({
      type: obs.obstacle_type,
      description: obs.description,
      severity: obs.severity,
      resolvedAt: obs.resolved_at
    }))

    return {
      obstacleCount,
      obstaclesSummary,
      obstacles: formattedObstacles
    }
  }

  /**
   * 获取阻碍类型汇总
   */
  private getObstacleTypesSummary(obstacles: any[]): string {
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const typeCount = obstacles.reduce((acc: Record<string, number>, obs: any) => {
      acc[obs.obstacle_type] = (acc[obs.obstacle_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(typeCount)
      .map(([type, count]) => `${type}（${count}次）`)
      .join('、')
  }

  /**
   * 生成亮点
   */
  private generateHighlights(
    efficiency: EfficiencyStats,
    delays: DelayStats
  ): string {
    const highlights: string[] = []

    if (efficiency.efficiencyStatus === 'fast') {
      highlights.push(`任务提前完成，效率比达到 ${efficiency.efficiencyRatio}`)
    }

    if (delays.delayCount === 0) {
      highlights.push('任务按期完成，无延期记录')
    }

    if (highlights.length === 0) {
      highlights.push('任务顺利达到100%完成')
    }

    return highlights.join('；') + '。'
  }

  /**
   * 生成问题
   */
  private generateIssues(
    delays: DelayStats,
    obstacles: ObstacleStats
  ): string {
    const issues: string[] = []

    if (delays.totalDelayDays > 0) {
      issues.push(`任务累计延期 ${delays.totalDelayDays} 天，共 ${delays.delayCount} 次延期`)
    }

    if (obstacles.obstacleCount > 0) {
      issues.push(`执行过程中遇到 ${obstacles.obstacleCount} 个阻碍，影响了任务进度`)
    }

    if (issues.length === 0) {
      return '未发现明显问题。'
    }

    return issues.join('；') + '。'
  }

  /**
   * 生成经验教训
   */
  private generateLessonsLearned(
    efficiency: EfficiencyStats,
    delays: DelayStats,
    obstacles: ObstacleStats
  ): string {
    const lessons: string[] = []

    if (efficiency.efficiencyStatus === 'fast') {
      lessons.push('执行效率较高，可总结推广成功做法')
    } else if (efficiency.efficiencyStatus === 'slow') {
      lessons.push('复盘效率偏差原因，优化资源和施工组织')
    }

    if (delays.delayCount > 0) {
      lessons.push('加强计划释放与延期预警')
    }

    if (obstacles.obstacleCount > 0) {
      lessons.push('前置准备和现场阻碍需提前治理')
    }

    if (lessons.length === 0) {
      lessons.push('执行平稳，继续保持现有组织模式')
    }

    return lessons.join('；') + '。'
  }

  /**
   * 获取任务总结
   */
  async getTaskSummary(taskId: string): Promise<TaskCompletionReport | null> {
    const report = await executeSQLOne<TaskCompletionReport>(
      'SELECT * FROM task_completion_reports WHERE task_id = ? LIMIT 1',
      [taskId]
    )

    return report ?? null
  }

  /**
   * 获取项目总结列表（支持分页）
   * P1-003修复: 添加分页支持
   */
  async getProjectSummaries(
    projectId: string,
    pagination?: { limit: number; offset: number }
  ): Promise<{ summaries: TaskCompletionReport[]; total: number }> {
    // 获取总数
    const countResult = await executeSQLOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM task_completion_reports WHERE project_id = ?',
      [projectId]
    )
    const total = countResult?.cnt || 0

    const reports = pagination
      ? await executeSQL<TaskCompletionReport>(
        'SELECT * FROM task_completion_reports WHERE project_id = ? ORDER BY generated_at DESC LIMIT ? OFFSET ?',
        [projectId, pagination.limit, pagination.offset],
      )
      : await executeSQL<TaskCompletionReport>(
        'SELECT * FROM task_completion_reports WHERE project_id = ? ORDER BY generated_at DESC',
        [projectId],
      )

    return {
      summaries: reports || [],
      total
    }
  }

  /**
   * 获取总结统计数据（Dashboard卡片用）
   */
  async getSummaryStats(projectId: string) {
    // 获取已完成任务总数
    const completedResult = await executeSQLOne<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND progress = 100",
      [projectId]
    )

    // 获取已生成总结的报告
    const reports = await executeSQL<any>(
      'SELECT efficiency_ratio, efficiency_status, total_delay_days FROM task_completion_reports WHERE project_id = ?',
      [projectId]
    )

    // 计算平均效率比
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const efficiencySum = reports?.reduce((sum: number, r: any) => sum + (r.efficiency_ratio || 0), 0) || 0
    const avgEfficiency = reports && reports.length > 0
      ? (efficiencySum / reports.length).toFixed(2)
      : '1.00'

    // 统计延期任务数
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    const delayedTasks = reports?.filter((r: any) => r.total_delay_days > 0).length || 0

    // 统计高效任务数
    const fastTasks = reports?.filter((r: any) => r.efficiency_status === 'fast').length || 0

    // 统计低效任务数
    const slowTasks = reports?.filter((r: any) => r.efficiency_status === 'slow').length || 0

    return {
      totalCompleted: completedResult?.cnt || 0,
      totalReports: reports?.length || 0,
      avgEfficiencyRatio: parseFloat(avgEfficiency),
      delayedTasks,
      fastTasks,
      slowTasks
    }
  }
}
