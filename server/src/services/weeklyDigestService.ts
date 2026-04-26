import { supabase } from './dbService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import type { WeeklyDigest } from '../types/db.js'

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: Date): number {
  return Math.round((b.getTime() - new Date(a).getTime()) / 86400000)
}

function getWeightedProgress(tasks: Array<{ progress?: number | null; planned_start_date?: string | null; planned_end_date?: string | null }>): number {
  if (!tasks.length) return 0
  const getWeight = (t: typeof tasks[0]) => {
    if (!t.planned_start_date || !t.planned_end_date) return 1
    return Math.max(1, Math.round(
      (new Date(t.planned_end_date).getTime() - new Date(t.planned_start_date).getTime()) / 86400000
    ))
  }
  const totalWeight = tasks.reduce((s, t) => s + getWeight(t), 0)
  return Math.round(tasks.reduce((s, t) => s + (t.progress || 0) * getWeight(t), 0) / (totalWeight || 1))
}

function isActiveObstacle(row: { status?: string | null; resolved_at?: string | null }): boolean {
  if (row.resolved_at) return false
  const status = String(row.status ?? '').trim().toLowerCase()
  if (!status) return true
  return ['active', 'resolving', '待处理', '处理中'].includes(status)
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
    const weekEndIso = new Date(weekEndDate.getTime() + 86400000).toISOString()

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
    const overallProgress = getWeightedProgress(tasks)

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

    // 3. 健康度（最新记录）
    const { data: healthRows } = await supabase
      .from('project_health_history')
      .select('health_score')
      .eq('project_id', projectId)
      .order('recorded_at', { ascending: false })
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
    const criticalTasks = tasks.filter(t => criticalTaskIdsSet.has(t.id) && t.status !== 'completed' && t.status !== '已完成')
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
    const criticalMilestones = (milestoneRows || []).filter((m: { id: string }) => criticalTaskIdsSet.has(m.id))
    const nearestMs = (criticalMilestones[0] as { title: string; planned_end_date: string } | undefined)
    const criticalNearestMilestone = nearestMs?.title ?? null
    const criticalNearestDelayDays = nearestMs ? daysBetween(nearestMs.planned_end_date, today) : null

    // 6. Top 5 偏差任务（未完成且有计划结束日期，按延期天数降序）
    const incompleteTasks = tasks.filter(t =>
      t.status !== 'completed' && t.status !== '已完成' && t.planned_end_date
    )
    const withDelay = incompleteTasks
      .map(t => ({ ...t, delayDays: daysBetween(t.planned_end_date!, today) }))
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
      .select('subject_id, subject_name, subject_type')
      .eq('project_id', projectId)
      .eq('is_active', true)
    const abnormalResponsibilities = ((alertRows || []) as Array<{ subject_id: string; subject_name: string; subject_type: string }>).map(r => ({
      subject_id: r.subject_id,
      name: r.subject_name,
      type: r.subject_type,
    }))

    // 8. 本周新增风险/阻碍
    const { data: newRisks } = await supabase
      .from('risks')
      .select('severity')
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
    const maxRiskLevel = (newRisks || []).reduce<string | null>((best, r: { severity?: string | null }) => {
      const s = r.severity ?? ''
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

  async generateForAllProjects(): Promise<void> {
    const { data: projects } = await supabase.from('projects').select('id, status')
    const activeProjects = ((projects || []) as Array<{ id: string; status?: string | null }>)
      .filter(p => isProjectActiveStatus(p.status))
    await Promise.allSettled(activeProjects.map(p => this.generateForProject(p.id)))
  }
}

export const weeklyDigestService = new WeeklyDigestService()
