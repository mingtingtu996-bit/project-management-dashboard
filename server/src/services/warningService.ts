// 预警服务 - Phase 2
// 已迁移至直接使用 Supabase SDK（不再依赖 executeSQL 包装层）

import { supabase } from './dbService.js'
import { hasChangeLog, writeLog } from './changeLogs.js'
import type { Warning, Reminder, Notification } from '../types/db.js'
import { calculateDueStatus } from './dueDateService.js'
import { generateId } from '../utils/id.js'
import {
  collapseWarningRedundancy,
  dedupeNotifications,
  escalateObstacleSeverity,
  normalizeNotificationPayload,
  resolvePendingDelayWarningSeverity,
} from './warningChainService.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import {
  acceptanceStatusLabel as getAcceptanceStatusLabel,
  ACTIVE_ACCEPTANCE_STATUSES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  acknowledgeWarningNotification,
  syncAcceptanceExpiredIssues as syncAcceptanceExpiredIssuesOnChain,
  autoEscalateRisksToIssues as autoEscalateRisksToIssuesOnChain,
  autoEscalateWarnings as autoEscalateWarningsOnChain,
  confirmWarningAsRisk as confirmWarningAsRiskOnChain,
  ensureObstacleEscalatedIssue,
  markObstacleEscalatedIssuePendingManualClose,
  muteWarningNotification,
  syncConditionExpiredIssues as syncConditionExpiredIssuesOnChain,
  syncWarningNotifications,
} from './upgradeChainService.js'
import { scanPreMilestoneWarnings as scanPreMilestoneWarningsFromService } from './preMilestoneWarningService.js'
import { logger } from '../middleware/logger.js'
import { dataQualityService } from './dataQualityService.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

export interface WarningEvaluationEvent {
  type:
    | 'obstacle'
    | 'delay_request'
    | 'delay_request_submitted'
    | 'delay_approved'
    | 'task'
  projectId?: string
  taskId?: string
  obstacle?: {
    id: string
    project_id?: string | null
    task_id?: string | null
    title?: string | null
    description?: string | null
    severity?: 'low' | 'medium' | 'high' | 'warning' | 'critical'
    status?: string | null
    expected_resolution_date?: string | null
    severity_manually_overridden?: boolean | number | string | null
    severity_escalated_at?: string | null
  }
  delayRequest?: {
    id: string
    task_id: string
    status: string
    project_id?: string | null
  }
  task?: {
    id: string
    status?: string | null
    progress?: number | null
  }
}

function normalizeObstacleSeverityForEvaluation(value?: string | null): 'warning' | 'critical' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['critical', '严重'].includes(normalized)) return 'critical'
  return 'warning'
}

function buildObstacleSeverityEscalationReason(obstacle: WarningEvaluationEvent['obstacle'], storedSeverity: string) {
  return [
    'overdue_auto_escalation',
    String(obstacle?.expected_resolution_date ?? '').trim(),
    storedSeverity,
  ].join('|')
}

function normalizeAcceptanceWarningStatus(value?: string | null) {
  return normalizeAcceptanceStatus(value)
}

function acceptanceWarningStatusLabel(value?: string | null) {
  return getAcceptanceStatusLabel(value)
}

function resolveDelayRequestEvaluationKind(
  event: WarningEvaluationEvent,
): 'submitted' | 'approved_assessment' | 'generic' {
  if (event.type === 'delay_request_submitted') return 'submitted'
  if (event.type === 'delay_approved') {
    return 'approved_assessment'
  }

  if (event.type === 'delay_request') {
    if (event.delayRequest?.status === 'pending') return 'submitted'
    if (event.delayRequest?.status === 'approved') return 'approved_assessment'
  }

  return 'generic'
}

const ACCEPTANCE_WARNING_QUERY_STATUSES = [
  ...ACTIVE_ACCEPTANCE_STATUSES,
]

function getAcceptanceWarningName(row: Record<string, unknown>) {
  return String(row.acceptance_name ?? row.plan_name ?? row.type_name ?? row.id ?? '未命名验收').trim() || '未命名验收'
}

function getAcceptanceWarningType(row: Record<string, unknown>) {
  return String(row.type_name ?? row.acceptance_type ?? '验收').trim() || '验收'
}

type ConditionWarningRow = {
  id: string
  task_id?: string | null
  name?: string | null
  target_date?: string | null
  tasks?: {
    project_id?: string | null
    title?: string | null
  } | null
}

type ObstacleWarningRow = {
  id: string
  task_id?: string | null
  obstacle_type?: string | null
  description?: string | null
  severity?: string | null
  status?: string | null
  expected_resolution_date?: string | null
  created_at?: string | null
  tasks?: {
    project_id?: string | null
    title?: string | null
  } | null
}

type DelayWarningTaskRow = {
  id: string
  project_id?: string | null
  title?: string | null
  delay_count?: number | null
  milestones?: { name?: string | null } | Array<{ name?: string | null }> | null
}

type PendingDelayTaskRow = {
  task_id?: string | null
}

function resolveMilestoneName(
  milestones: DelayWarningTaskRow['milestones'],
): string | null {
  if (Array.isArray(milestones)) {
    return String(milestones[0]?.name ?? '').trim() || null
  }

  if (milestones && typeof milestones === 'object') {
    return String(milestones.name ?? '').trim() || null
  }

  return null
}

export class WarningService {
  /**
   * 扫描条件到期预警
   * 预警规则：条件解决前3天/1天提醒
   */
  async scanConditionWarnings(projectId?: string): Promise<Warning[]> {
    const now = new Date().toISOString()

    // 查询未满足且 target_date > now 的条件（JOIN tasks 获取 project_id）
    let condQuery = supabase
      .from('task_conditions')
      .select('id, task_id, name, target_date, tasks!inner(project_id, title)')
      .eq('is_satisfied', false)
      .gt('target_date', now)

    if (projectId) {
      condQuery = condQuery.eq('tasks.project_id', projectId)
    }

    const { data: conditionsRaw } = await condQuery
    const conditions = ((conditionsRaw || []) as ConditionWarningRow[]).map((c) => ({
      id: c.id,
      task_id: c.task_id,
      condition_name: c.name,
      target_date: c.target_date,
      project_id: c.tasks?.project_id || '',
      task_title: c.tasks?.title || '',
    }))

    const warnings: Warning[] = []

    for (const condition of conditions) {
      const dueResult = calculateDueStatus(condition.target_date, {
        overdueLabel: '已逾期',
        dueLabel: '天后到期',
        todayLabel: '今天到期',
      })

      if (dueResult.due_status === 'normal' || dueResult.due_status === 'overdue') continue

      const isUrgent = dueResult.due_status === 'urgent'

      warnings.push({
        id: generateId(),
        project_id: condition.project_id,
        task_id: condition.task_id,
        warning_type: 'condition_due',
        warning_level: isUrgent ? 'critical' : 'warning',
        title: isUrgent ? '开工窗口即将关闭（紧急）' : '开工窗口即将关闭',
        description: `任务"${condition.task_title}"的开工窗口${dueResult.due_label}，当前条件"${condition.condition_name}"仍未满足${isUrgent ? '，请立即处理' : ''}`,
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      })
    }

    return warnings
  }

  async scanCriticalPathStagnationWarnings(projectId?: string): Promise<Warning[]> {
    const projectIds = projectId
      ? [projectId]
      : (
        ((await supabase.from('projects').select('id, status')).data ?? []) as Array<{ id: string; status?: string | null }>
      )
        .filter((row) => isProjectActiveStatus(row.status))
        .map((row) => String(row.id))

    if (projectIds.length === 0) return []

    const warnings: Warning[] = []

    for (const currentProjectId of projectIds) {
      const criticalPathSnapshot = await getProjectCriticalPathSnapshot(currentProjectId)
      const criticalTaskIds = criticalPathSnapshot.displayTaskIds
      if (!criticalTaskIds.length) continue

      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('id, project_id, title, progress, status')
        .eq('project_id', currentProjectId)
        .in('id', criticalTaskIds)
        .neq('status', 'completed')
        .neq('status', '已完成')

      if (taskError) throw new Error(taskError.message)

      const criticalTasks = (tasks || []) as Array<{
        id: string
        project_id: string
        title: string
        progress?: number | null
        status?: string | null
      }>
      if (!criticalTasks.length) continue

      const taskIds = criticalTasks.map((task) => task.id)
      const { data: snapshots, error: snapshotError } = await supabase
        .from('task_progress_snapshots')
        .select('task_id, progress, snapshot_date, created_at')
        .in('task_id', taskIds)
        .order('snapshot_date', { ascending: false })

      if (snapshotError) throw new Error(snapshotError.message)

      const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000
      const baselineProgress = new Map<string, number>()

      for (const snapshot of (snapshots || []) as Array<Record<string, unknown>>) {
        const taskId = String(snapshot.task_id ?? '')
        if (!taskId || baselineProgress.has(taskId)) continue
        const snapshotAt = new Date(String(snapshot.snapshot_date ?? snapshot.created_at ?? '')).getTime()
        if (!Number.isFinite(snapshotAt) || snapshotAt > threshold) continue
        baselineProgress.set(taskId, Number(snapshot.progress ?? 0))
      }

      warnings.push(
        ...criticalTasks
          .filter((task) => baselineProgress.has(task.id) && Number(task.progress ?? 0) === baselineProgress.get(task.id))
          .map((task) => ({
            id: generateId(),
            project_id: task.project_id,
            task_id: task.id,
            warning_type: 'critical_path_stagnation',
            warning_level: 'critical' as const,
            title: '关键路径任务连续 7 天无进度变化',
            description: `关键路径任务"${task.title}"近 7 天进度没有变化，请立即处理`,
            is_acknowledged: false,
            created_at: new Date().toISOString(),
          })),
      )
    }

    return warnings
  }

  async scanCriticalPathDelayWarnings(projectId?: string): Promise<Warning[]> {
    const projectIds = projectId
      ? [projectId]
      : (
        ((await supabase.from('projects').select('id, status')).data ?? []) as Array<{ id: string; status?: string | null }>
      )
        .filter((row) => isProjectActiveStatus(row.status))
        .map((row) => String(row.id))

    if (projectIds.length === 0) return []

    const warnings: Warning[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const currentProjectId of projectIds) {
      const criticalPathSnapshot = await getProjectCriticalPathSnapshot(currentProjectId)
      const criticalTaskIds = criticalPathSnapshot.displayTaskIds
      if (!criticalTaskIds.length) continue

      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, project_id, title, planned_end_date, status')
        .eq('project_id', currentProjectId)
        .in('id', criticalTaskIds)
        .neq('status', 'completed')
        .neq('status', '已完成')
        .not('planned_end_date', 'is', null)

      if (error) throw new Error(error.message)

      for (const task of (tasks || []) as Array<{ id: string; project_id: string; title: string; planned_end_date: string; status?: string | null }>) {
        const endDate = new Date(task.planned_end_date)
        endDate.setHours(0, 0, 0, 0)
        const delayDays = Math.round((today.getTime() - endDate.getTime()) / 86400000)
        if (delayDays <= 0) continue

        let level: 'info' | 'warning' | 'critical'
        let title: string
        if (delayDays >= 20) {
          level = 'critical'
          title = `关键路径任务已延期 ${delayDays} 天（严重）`
        } else if (delayDays >= 10) {
          level = 'warning'
          title = `关键路径任务已延期 ${delayDays} 天`
        } else {
          level = 'info'
          title = `关键路径任务已延期 ${delayDays} 天（关注）`
        }

        warnings.push({
          id: generateId(),
          project_id: task.project_id,
          task_id: task.id,
          warning_type: 'critical_path_delay',
          warning_level: level,
          title,
          description: `关键路径任务"${task.title}"已超出计划完成日期 ${delayDays} 天`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    return warnings
  }

  async scanProgressTrendWarnings(projectId?: string): Promise<Warning[]> {
    return await dataQualityService.scanTrendWarnings(projectId)
  }

  /**
   * 扫描阻碍超时预警
   * 预警规则：阻碍超过3天/7天弹窗提醒
   */
  async scanObstacleWarnings(projectId?: string): Promise<Warning[]> {
    // status 不等于 '已解决'：Supabase 用 .neq()
    let obsQuery = supabase
      .from('task_obstacles')
      .select('id, task_id, obstacle_type, description, severity, status, expected_resolution_date, created_at, tasks!inner(project_id, title)')
      .neq('status', '已解决')

    if (projectId) {
      obsQuery = obsQuery.eq('tasks.project_id', projectId)
    }

    const { data: obstaclesRaw } = await obsQuery
    const obstacles = ((obstaclesRaw || []) as ObstacleWarningRow[]).map((o) => ({
      id: o.id,
      task_id: o.task_id,
      obstacle_type: o.obstacle_type,
      obstacle_desc: o.description,
      severity: o.severity,
      status: o.status,
      expected_resolution_date: o.expected_resolution_date ?? null,
      created_at: o.created_at,
      project_id: o.tasks?.project_id || '',
      task_title: o.tasks?.title || '',
    }))

    const warnings: Warning[] = []
    const now = new Date()

    for (const obstacle of obstacles) {
      const createdAt = new Date(obstacle.created_at)
      const daysElapsed = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      const escalation = escalateObstacleSeverity({
        severity: normalizeObstacleSeverityForEvaluation(obstacle.severity),
        status: obstacle.status,
        expected_resolution_date: obstacle.expected_resolution_date,
        now: now.toISOString(),
      })
      const warningLevel = escalation.severity === 'critical' ? 'critical' : 'warning'

      // 3天预警
      if (daysElapsed >= 3 && daysElapsed < 7) {
        warnings.push({
          id: generateId(),
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          warning_type: 'obstacle_timeout',
          warning_level: warningLevel,
          title: '阻碍已持续3天',
          description: `任务"${obstacle.task_title}"的阻碍"${obstacle.obstacle_desc}"已持续${daysElapsed}天，请尽快处理`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }

      // 7天严重预警
      if (daysElapsed >= 7) {
        warnings.push({
          id: generateId(),
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          warning_type: 'obstacle_timeout',
          warning_level: 'critical',
          title: '阻碍已持续7天以上',
          description: `任务"${obstacle.task_title}"的阻碍"${obstacle.obstacle_desc}"已持续${daysElapsed}天，需立即处理`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    return warnings
  }

  /**
   * 扫描验收到期预警
   * 预警规则：验收到期前7天/3天/1天提醒
   */
  async scanAcceptanceWarnings(projectId?: string): Promise<Warning[]> {
    let acQuery = supabase
      .from('acceptance_plans')
      .select('id, project_id, task_id, acceptance_name, acceptance_type, type_name, planned_date, status')
      .in('status', ACCEPTANCE_WARNING_QUERY_STATUSES)

    if (projectId) {
      acQuery = acQuery.eq('project_id', projectId)
    }

    const { data: acceptances } = await acQuery
    const warnings: Warning[] = []

    for (const acceptance of (acceptances || [])) {
      const row = acceptance as Record<string, unknown>
      const plannedDate = String(row.planned_date ?? '').trim()
      const normalizedStatus = normalizeAcceptanceWarningStatus(String(row.status ?? ''))
      const acceptanceName = getAcceptanceWarningName(row)
      const acceptanceType = getAcceptanceWarningType(row)

      if (normalizedStatus === 'rectifying') {
        const rectificationDue = plannedDate
          ? calculateDueStatus(plannedDate, {
            urgentDays: 3,
            approachingDays: 7,
            overdueLabel: '已逾期',
            dueLabel: '天后到期',
            todayLabel: '今天到期',
          })
          : null

        const overdue = rectificationDue?.due_status === 'overdue'
        warnings.push({
          id: generateId(),
          project_id: String(row.project_id ?? ''),
          task_id: row.task_id ? String(row.task_id) : undefined,
          warning_type: 'acceptance_expired',
          warning_level: overdue ? 'critical' : 'warning',
          title: overdue ? '验收整改已逾期' : '验收整改待处理',
          description: plannedDate
            ? `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，${rectificationDue?.due_label || '请尽快处理'}`
            : `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，请尽快补正`,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
        continue
      }

      if (!plannedDate) continue

      const dueResult = calculateDueStatus(plannedDate, {
        urgentDays: 3,
        approachingDays: 7,
        overdueLabel: '已逾期',
        dueLabel: '天后到期',
        todayLabel: '今天到期',
      })

      if (dueResult.due_status === 'normal') continue

      const daysUntil = dueResult.days_until_due ?? 0
      const warningLevel: 'info' | 'warning' | 'critical' =
        dueResult.due_status === 'approaching'
          ? 'info'
          : dueResult.due_status === 'overdue' || daysUntil <= 1
            ? 'critical'
            : 'warning'

      warnings.push({
        id: generateId(),
        project_id: String(row.project_id ?? ''),
        task_id: row.task_id ? String(row.task_id) : undefined,
        warning_type: 'acceptance_expired',
        warning_level: warningLevel,
        title: dueResult.due_status === 'overdue' ? '验收已逾期' : '验收即将到期',
        description: `${acceptanceType}“${acceptanceName}”当前为${acceptanceWarningStatusLabel(String(row.status ?? ''))}，${dueResult.due_label}`,
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      })
    }

    return warnings
  }

  /**
   * 扫描延期超次预警
   * 预警规则：任务延期次数超过N次自动升级预警级别
   * - 3-4次延期 → warning级别
   * - ≥5次延期 → critical级别
   */
  async scanDelayExceededWarnings(projectId?: string): Promise<Warning[]> {
    // status NOT IN ('已完成', '已取消')：Supabase 用两个 .neq()
    let taskQuery = supabase
      .from('tasks')
      .select('id, project_id, title, planned_end_date, status, delay_count, milestones(name)')
      .gte('delay_count', 3)
      .neq('status', '已完成')
      .neq('status', '已取消')
      .order('delay_count', { ascending: false })

    if (projectId) {
      taskQuery = taskQuery.eq('project_id', projectId)
    }

    const { data: tasks } = await taskQuery
    const taskRows = (tasks || []) as DelayWarningTaskRow[]
    const taskIds = taskRows.map((task) => task.id)
    let pendingTaskIds = new Set<string>()

    if (taskIds.length > 0) {
      const { data: pendingRows } = await supabase
        .from('delay_requests')
        .select('task_id')
        .in('task_id', taskIds)
        .eq('status', 'pending')

      pendingTaskIds = new Set(
        ((pendingRows || []) as PendingDelayTaskRow[])
          .map((row) => String(row.task_id ?? '').trim())
          .filter(Boolean),
      )
    }

    const warnings: Warning[] = []
    const now = new Date()

    for (const task of taskRows) {
      const delayCount = Number(task.delay_count ?? 0)

      let warningLevel: 'info' | 'warning' | 'critical' = 'warning'
      let title = '延期次数较多'

      if (delayCount >= 5) {
        warningLevel = 'critical'
        title = '频繁延期 - 需立即关注'
      } else if (delayCount >= 3) {
        warningLevel = 'warning'
        title = '连续延期 - 需关注'
      }

      if (pendingTaskIds.has(task.id)) {
        const pendingSeverity = resolvePendingDelayWarningSeverity({
          warning_level: warningLevel,
          has_pending_request: true,
        })
        warningLevel = pendingSeverity.severity
        title = pendingSeverity.note || '延期审批中'
      }

      let description = `任务"${task.title}"已延期${delayCount}次`
      const milestoneName = resolveMilestoneName(task.milestones)
      if (milestoneName) {
        description += `，属于里程碑"${milestoneName}"`
      }
      if (pendingTaskIds.has(task.id)) {
        description += '，延期审批中'
      }
      description += '，建议尽快调整计划或采取措施'

      warnings.push({
        id: generateId(),
        project_id: task.project_id || '',
        task_id: task.id,
        warning_type: 'delay_exceeded',
        warning_level: warningLevel,
        title,
        description,
        is_acknowledged: false,
        created_at: now.toISOString(),
      })
    }

    return warnings
  }

  async scanPreMilestoneWarnings(projectId?: string): Promise<Warning[]> {
    return scanPreMilestoneWarningsFromService(projectId)
  }

  /**
   * 生成弹窗提醒
   */
  async generateReminders(projectId?: string): Promise<Reminder[]> {
    const conditionWarnings = await this.scanConditionWarnings(projectId)
    const obstacleWarnings = await this.scanObstacleWarnings(projectId)
    const acceptanceWarnings = await this.scanAcceptanceWarnings(projectId)

    const reminders: Reminder[] = []
    const now = new Date()

    // P0-1: 条件到期提醒（1天/3天弹窗）
    for (const warning of conditionWarnings) {
      if (warning.warning_type === 'condition_due') {
        const daysMatch = warning.description.match(/将于(\d+)天/)
        const days = daysMatch ? parseInt(daysMatch[1]) : 0
        reminders.push({
          id: generateId(),
          project_id: warning.project_id,
          task_id: warning.task_id,
          reminder_type: days <= 1 ? 'condition_1day' : 'condition_3day',
          reminder_level: warning.warning_level,
          title: warning.title,
          content: warning.description,
          is_dismissed: false,
          trigger_date: now.toISOString(),
          created_at: now.toISOString(),
        })
      }
    }

    // 阻碍提醒（3天/7天弹窗）
    for (const warning of obstacleWarnings) {
      if (warning.warning_type === 'obstacle_timeout') {
        const daysMatch = warning.description.match(/已持续(\d+)天/)
        if (daysMatch) {
          const days = parseInt(daysMatch[1])
          reminders.push({
            id: generateId(),
            project_id: warning.project_id,
            task_id: warning.task_id,
            reminder_type: days >= 7 ? 'obstacle_7day' : 'obstacle_3day',
            reminder_level: warning.warning_level,
            title: warning.title,
            content: warning.description,
            is_dismissed: false,
            trigger_date: now.toISOString(),
            created_at: now.toISOString(),
          })
        }
      }
    }

    // P0-1: 验收到期提醒（1天/3天/7天弹窗）
    for (const warning of acceptanceWarnings) {
      if (warning.warning_type === 'acceptance_expired') {
        const daysMatch = warning.description.match(/将于(\d+)天/)
        const days = daysMatch ? parseInt(daysMatch[1]) : 0
        let reminderType = 'acceptance_7day'
        if (days <= 1) reminderType = 'acceptance_1day'
        else if (days <= 3) reminderType = 'acceptance_3day'
        reminders.push({
          id: generateId(),
          project_id: warning.project_id,
          task_id: warning.task_id,
          reminder_type: reminderType,
          reminder_level: warning.warning_level,
          title: warning.title,
          content: warning.description,
          is_dismissed: false,
          trigger_date: now.toISOString(),
          created_at: now.toISOString(),
        })
      }
    }

    return reminders
  }

  /**
   * 生成通知
   */
  async generateNotifications(projectId?: string): Promise<Notification[]> {
    const warnings = await this.scanAll(projectId)

    return dedupeNotifications(
      warnings.map((warning) =>
        normalizeNotificationPayload({
          ...warning,
          category: warning.warning_type,
          source_entity_id: warning.task_id,
        }),
      ),
    ) as Notification[]
  }

  async scanAll(projectId?: string): Promise<Warning[]> {
    const [conditionWarnings, obstacleWarnings, acceptanceWarnings, delayExceededWarnings, preMilestoneWarnings, criticalPathStagnationWarnings, criticalPathDelayWarnings, progressTrendWarnings] = await Promise.all([
      this.scanConditionWarnings(projectId),
      this.scanObstacleWarnings(projectId),
      this.scanAcceptanceWarnings(projectId),
      this.scanDelayExceededWarnings(projectId),
      this.scanPreMilestoneWarnings(projectId),
      this.scanCriticalPathStagnationWarnings(projectId),
      this.scanCriticalPathDelayWarnings(projectId),
      this.scanProgressTrendWarnings(projectId),
    ])

    return collapseWarningRedundancy([
      ...conditionWarnings,
      ...obstacleWarnings,
      ...acceptanceWarnings,
      ...delayExceededWarnings,
      ...preMilestoneWarnings,
      ...criticalPathStagnationWarnings,
      ...criticalPathDelayWarnings,
      ...progressTrendWarnings,
    ])
  }

  async syncActiveWarnings(projectId?: string): Promise<Warning[]> {
    const warnings = await this.scanAll(projectId)
    return await syncWarningNotifications(warnings, projectId)
  }

  async acknowledgeWarning(id: string, actorId?: string) {
    return acknowledgeWarningNotification(id, actorId)
  }

  async muteWarning(id: string, hours = 24, actorId?: string) {
    return muteWarningNotification(id, hours, actorId)
  }

  async confirmWarningAsRisk(id: string, actorId?: string) {
    return confirmWarningAsRiskOnChain(id, actorId)
  }

  async syncConditionExpiredIssues(projectId?: string) {
    return await syncConditionExpiredIssuesOnChain(projectId)
  }

  async syncAcceptanceExpiredIssues(projectId?: string) {
    return await syncAcceptanceExpiredIssuesOnChain(projectId)
  }

  async autoEscalateWarnings(projectId?: string) {
    return await autoEscalateWarningsOnChain(projectId)
  }

  async autoEscalateRisksToIssues(projectId?: string) {
    return await autoEscalateRisksToIssuesOnChain(projectId)
  }

  async evaluate(event: WarningEvaluationEvent): Promise<{
    severity?: 'info' | 'warning' | 'critical'
    note?: string | null
    escalated?: boolean
    resolved?: boolean
  }> {
    if (event.type === 'obstacle' && event.obstacle) {
      const obstacle = event.obstacle
      const result = escalateObstacleSeverity({
        severity: normalizeObstacleSeverityForEvaluation(obstacle.severity),
        status: obstacle.status,
        expected_resolution_date: obstacle.expected_resolution_date,
        now: new Date().toISOString(),
      })

      if (result.escalated && obstacle.id) {
        if (Boolean(obstacle.severity_manually_overridden)) {
          return {
            severity: result.severity === 'critical' ? 'critical' : 'warning',
            escalated: false,
          }
        }

        const nextSeverity = result.severity
        const storedSeverity = nextSeverity === 'critical' ? '严重' : obstacle.severity ?? '中'
        const escalationReason = buildObstacleSeverityEscalationReason(obstacle, storedSeverity)
        const escalationTimestamp = new Date().toISOString()
        const hasEscalationTimestamp = Boolean(obstacle.severity_escalated_at)
        const hasEscalationMarker = hasEscalationTimestamp || await hasChangeLog({
          entity_type: 'task_obstacle',
          entity_id: obstacle.id,
          field_name: 'severity_auto_escalation',
          new_value: storedSeverity,
          change_source: 'system_auto',
          change_reason: escalationReason,
        })

        if (String(obstacle.severity ?? '').trim() !== storedSeverity) {
          const { error } = await supabase
            .from('task_obstacles')
            .update({
              severity: storedSeverity,
              severity_escalated_at: obstacle.severity_escalated_at ?? escalationTimestamp,
              severity_manually_overridden: false,
              updated_at: escalationTimestamp,
            })
            .eq('id', obstacle.id)

          if (error) {
            throw new Error(error.message)
          }

          await writeLog({
            entity_type: 'task_obstacle',
            entity_id: obstacle.id,
            field_name: 'severity',
            old_value: obstacle.severity ?? null,
            new_value: storedSeverity,
            change_source: 'system_auto',
            change_reason: escalationReason,
          })
        } else if (!obstacle.severity_escalated_at) {
          const { error } = await supabase
            .from('task_obstacles')
            .update({
              severity_escalated_at: escalationTimestamp,
              severity_manually_overridden: false,
              updated_at: escalationTimestamp,
            })
            .eq('id', obstacle.id)

          if (error) {
            throw new Error(error.message)
          }
        }

        if (!hasEscalationMarker) {
          await writeLog({
            entity_type: 'task_obstacle',
            entity_id: obstacle.id,
            field_name: 'severity_auto_escalation',
            old_value: null,
            new_value: storedSeverity,
            change_source: 'system_auto',
            change_reason: escalationReason,
          })
        }

        await ensureObstacleEscalatedIssue({
          id: obstacle.id,
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          severity: storedSeverity,
          status: obstacle.status,
          description: obstacle.description ?? null,
        })
      }

      // GAP-10.2g-01: 阻碍解决后，触发关联 obstacle_escalated issue 的来源解除联动
      const resolvedStatuses = ['已解决', 'resolved']
      if (obstacle.id && resolvedStatuses.includes(String(obstacle.status ?? '').toLowerCase())) {
        try {
          await markObstacleEscalatedIssuePendingManualClose(obstacle.id)
        } catch (linkErr) {
          // 联动失败不阻断主链，仅记录
          console.warn('[warningService] obstacle->issue 来源解除联动失败', linkErr)
        }
      }

      return {
        severity: result.severity === 'critical' ? 'critical' : 'warning',
        escalated: result.escalated,
      }
    }

    if (
      ['delay_request', 'delay_request_submitted', 'delay_approved'].includes(event.type)
      && event.delayRequest
    ) {
      const evaluationKind = resolveDelayRequestEvaluationKind(event)
      if (evaluationKind === 'approved_assessment') {
        return {
          severity: 'warning',
          note: '延期审批通过，已进入后续评估链',
          escalated: false,
        }
      }

      const pending = event.delayRequest.status === 'pending'
      const downgraded = resolvePendingDelayWarningSeverity({
        warning_level: 'warning',
        has_pending_request: pending,
      })

      return {
        severity: downgraded.severity,
        note: downgraded.note,
        escalated: false,
      }
    }

    if (event.type === 'task' && ['completed', '已完成'].includes(String(event.task?.status ?? ''))) {
      return { resolved: true }
    }

    return {}
  }
}
