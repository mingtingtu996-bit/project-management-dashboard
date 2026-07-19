import { supabase } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { calculateProgressMetrics } from '../utils/progressCalculation.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { delayDayDelta, signedDurationDayDelta } from '../utils/durationDays.js'
import {
  resolveConstructionCalendarContext,
} from './constructionCalendar.js'
import type { WeeklyDigest } from '../types/db.js'
import { runScopedBatch } from './scopedBatchRunner.js'

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export class WeeklyDigestService {
  async generateForProject(projectId: string): Promise<void> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekStart = getWeekStart(today)
    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(today)
    const prevWeekStartDate = new Date(weekStartDate)
    prevWeekStartDate.setDate(prevWeekStartDate.getDate() - 7)
    const weekStartIso = weekStartDate.toISOString()
    const weekEndDateExclusive = new Date(weekEndDate)
    weekEndDateExclusive.setUTCDate(weekEndDateExclusive.getUTCDate() + 1)
    const weekEndIso = weekEndDateExclusive.toISOString()
    const calendar = await resolveConstructionCalendarContext({ projectId })

    // Load critical task IDs
    const criticalTaskIdsSet = await getCriticalPathTaskIds(projectId)

    // 1. 当前整体加权进度
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('progress, planned_start_date, planned_end_date, status, assignee, title, id')
      .eq('project_id', projectId)
    const tasks = (allTasks || []) as Array<{
      id: string; title: string; progress?: number | null; status?: string | null
      planned_start_date?: string | null; planned_end_date?: string | null
      assignee?: string | null
    }>
    const progressMetrics = calculateProgressMetrics(tasks)
    const overallProgress = progressMetrics.currentProgress

    // 2. 上周进度（从上周 digest 取）
    const { data: prevDigestRows } = await supabase
      .from('weekly_digests')
      .select('overall_progress, week_start')
      .eq('project_id', projectId)
      .lt('week_start', weekStart)
      .order('week_start', { ascending: false })
      .limit(1)
    const prevProgress = (prevDigestRows?.[0] as WeeklyDigest | undefined)?.overall_progress ?? null
    const progressChange = prevProgress !== null ? Number((overallProgress - Number(prevProgress)).toFixed(2)) : null

    // 3. 健康度（最新项目日快照）
    const { data: healthRows } = await supabase
      .from('project_daily_snapshot')
      .select('health_score')
      .eq('project_id', projectId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
    const healthScore = (healthRows?.[0] as { health_score?: number | null } | undefined)?.health_score ?? null

    // 4. 本周完成任务和里程碑
    const { data: snapshotRows } = await supabase
      .from('task_progress_snapshots')
      .select('event_type')
      .eq('project_id', projectId)
      .gte('created_at', weekStartIso)
      .lt('created_at', weekEndIso)
      .in('event_type', ['task_completed', 'milestone_completed'])
    const completedTasksCount = (snapshotRows || []).filter((r: { event_type: string }) => r.event_type === 'task_completed').length
    const completedMilestonesCount = (snapshotRows || []).filter((r: { event_type: string }) => r.event_type === 'milestone_completed').length

    // 5. 关键路径状态
    const criticalTasks = tasks.filter((task) => criticalTaskIdsSet.has(task.id) && !isCompletedTask(task))
    const criticalTasksCount = criticalTasks.length
    const criticalTaskIds = criticalTasks.map((task) => task.id)
    let criticalBlockedCount = 0

    if (criticalTaskIds.length > 0) {
      const { data: obstacleRows } = await supabase
        .from('task_obstacles')
        .select('task_id, status, resolved_at')
        .eq('project_id', projectId)
        .in('task_id', criticalTaskIds)

      criticalBlockedCount = new Set(
        ((obstacleRows || []) as Array<{ task_id?: string | null; status?: string | null; resolved_at?: string | null }>)
          .filter((row) => row.task_id && isActiveObstacle(row))
          .map((row) => String(row.task_id)),
      ).size
    }

    // 最近关键里程碑
    const { data: milestoneRows } = await supabase
      .from('tasks')
      .select('id, title, planned_end_date, status')
      .eq('project_id', projectId)
      .eq('is_milestone', true)
      .neq('status', 'completed')
      .neq('status', '已完成')
      .not('planned_end_date', 'is', null)
      .order('planned_end_date', { ascending: true })
    const criticalMilestones = (milestoneRows || []).filter((m: { id: string; status?: string | null; progress?: number | null }) =>
      criticalTaskIdsSet.has(m.id) && !isCompletedTask(m),
    )
    const nearestMs = (criticalMilestones[0] as { title: string; planned_end_date: string } | undefined)
    const criticalNearestMilestone = nearestMs?.title ?? null
    const criticalNearestCalendarDelta = nearestMs
      ? signedDurationDayDelta(nearestMs.planned_end_date, today)
      : null
    const criticalNearestDelayDays = nearestMs
      ? (criticalNearestCalendarDelta !== null && criticalNearestCalendarDelta > 0
          ? delayDayDelta(nearestMs.planned_end_date, today, calendar) ?? 0
          : criticalNearestCalendarDelta ?? 0)
      : null

    // 6. Top 5 偏差任务（未完成且有计划结束日期，按延期天数降序）
    const incompleteTasks = tasks.filter((task) => !isCompletedTask(task) && Boolean(task.planned_end_date))
    const withDelay = incompleteTasks
      .map(t => ({ ...t, delayDays: delayDayDelta(t.planned_end_date!, today, calendar) ?? 0 }))
      .filter(t => t.delayDays > 0)
      .sort((a, b) => b.delayDays - a.delayDays)
      .slice(0, 5)
    const topDelayedTasks = withDelay.map(t => ({
      task_id: t.id,
      title: t.title,
      assignee: t.assignee ?? undefined,
      delay_days: t.delayDays,
    }))

    // 7. 责任主体异常（本周处于 active 异常的记录）
    const { data: alertRows } = await supabase
      .from('responsibility_alert_states')
      .select('dimension, subject_key, subject_label, subject_user_id, subject_unit_id, current_level')
      .eq('project_id', projectId)
      .eq('current_level', 'abnormal')
    const abnormalResponsibilities = ((alertRows || []) as Array<{
      dimension?: string | null
      subject_key?: string | null
      subject_label?: string | null
      subject_id?: string | null
      subject_name?: string | null
      subject_type?: string | null
    }>).map(r => ({
      subject_id: r.subject_key ?? r.subject_id ?? '',
      name: r.subject_label ?? r.subject_name ?? '',
      type: r.dimension ?? r.subject_type ?? '',
    }))

    // 8. 本周新增风险/阻碍
    const { data: newRisks } = await supabase
      .from('risks')
      .select('severity, level')
      .eq('project_id', projectId)
      .gte('created_at', weekStartIso)
      .lt('created_at', weekEndIso)
    const { data: newObstacles } = await supabase
      .from('task_obstacles')
      .select('id')
      .eq('project_id', projectId)
      .gte('created_at', weekStartIso)
      .lt('created_at', weekEndIso)
    const newRisksCount = (newRisks || []).length
    const newObstaclesCount = (newObstacles || []).length

    const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const maxRiskLevel = (newRisks || []).reduce<string | null>((best, r: { severity?: string | null; level?: string | null }) => {
      const s = r.severity ?? r.level ?? ''
      if (!best) return s
      return (severityOrder[s] ?? 0) > (severityOrder[best] ?? 0) ? s : best
    }, null)

    // 9. UPSERT
    await supabase.from('weekly_digests').upsert({
      project_id: projectId,
      week_start: weekStart,
      generated_at: new Date().toISOString(),
      overall_progress: overallProgress,
      health_score: healthScore,
      progress_change: progressChange,
      completed_tasks_count: completedTasksCount,
      completed_milestones_count: completedMilestonesCount,
      critical_tasks_count: criticalTasksCount,
      critical_blocked_count: criticalBlockedCount,
      critical_nearest_milestone: criticalNearestMilestone,
      critical_nearest_delay_days: criticalNearestDelayDays,
      top_delayed_tasks: topDelayedTasks,
      abnormal_responsibilities: abnormalResponsibilities,
      new_risks_count: newRisksCount,
      new_obstacles_count: newObstaclesCount,
      max_risk_level: maxRiskLevel,
    }, { onConflict: 'project_id,week_start' })
  }

  async generateForAllProjects(projectIds?: string[] | null): Promise<void> {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    await runScopedBatch({
      operationName: 'weekly_digest_generation',
      scopeIds: activeProjectIds,
      operation: (projectId) => this.generateForProject(projectId),
    })
  }
}

export const weeklyDigestService = new WeeklyDigestService()
