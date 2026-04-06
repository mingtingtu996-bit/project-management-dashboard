// 预警服务 - Phase 2
// 已迁移至直接使用 Supabase SDK（不再依赖 executeSQL 包装层）

import { supabase } from './dbService.js'
import type { Warning, Reminder, Notification } from '../types/db.js'
import { calculateDueStatus } from './dueDateService.js'
import { generateId } from '../utils/id.js'

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
    const conditions = (conditionsRaw || []).map((c: any) => ({
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

      if (dueResult.due_status === 'normal') continue

      const isUrgent = dueResult.due_status === 'urgent' || dueResult.due_status === 'overdue'

      warnings.push({
        id: generateId(),
        project_id: condition.project_id,
        task_id: condition.task_id,
        warning_type: 'condition_expired',
        warning_level: isUrgent ? 'critical' : 'warning',
        title: isUrgent ? '条件即将到期（紧急）' : '条件即将到期',
        description: `任务"${condition.task_title}"的条件"${condition.condition_name}"${dueResult.due_label}${isUrgent ? '，请立即处理' : ''}`,
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      })
    }

    return warnings
  }

  /**
   * 扫描阻碍超时预警
   * 预警规则：阻碍超过3天/7天弹窗提醒
   */
  async scanObstacleWarnings(projectId?: string): Promise<Warning[]> {
    // status 不等于 '已解决'：Supabase 用 .neq()
    let obsQuery = supabase
      .from('task_obstacles')
      .select('id, task_id, obstacle_type, description, severity, status, created_at, tasks!inner(project_id, title)')
      .neq('status', '已解决')

    if (projectId) {
      obsQuery = obsQuery.eq('tasks.project_id', projectId)
    }

    const { data: obstaclesRaw } = await obsQuery
    const obstacles = (obstaclesRaw || []).map((o: any) => ({
      id: o.id,
      task_id: o.task_id,
      obstacle_type: o.obstacle_type,
      obstacle_desc: o.description,
      severity: o.severity,
      status: o.status,
      created_at: o.created_at,
      project_id: o.tasks?.project_id || '',
      task_title: o.tasks?.title || '',
    }))

    const warnings: Warning[] = []
    const now = new Date()

    for (const obstacle of obstacles) {
      const createdAt = new Date(obstacle.created_at)
      const daysElapsed = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

      // 3天预警
      if (daysElapsed >= 3 && daysElapsed < 7) {
        warnings.push({
          id: generateId(),
          project_id: obstacle.project_id,
          task_id: obstacle.task_id,
          warning_type: 'obstacle_timeout',
          warning_level: 'warning',
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
    const now = new Date().toISOString()

    // status IN ('待验收', '验收中')：Supabase 用 .in()
    let acQuery = supabase
      .from('acceptance_plans')
      .select('id, project_id, task_id, plan_name, acceptance_type, planned_date, status')
      .in('status', ['待验收', '验收中'])
      .gt('planned_date', now)

    if (projectId) {
      acQuery = acQuery.eq('project_id', projectId)
    }

    const { data: acceptances } = await acQuery

    const warnings: Warning[] = []

    for (const acceptance of (acceptances || [])) {
      const dueResult = calculateDueStatus((acceptance as any).planned_date, {
        urgentDays: 3,
        approachingDays: 7,
        overdueLabel: '已延期',
        dueLabel: '天后到期',
        todayLabel: '今天到期',
      })

      if (dueResult.due_status === 'normal') continue

      const daysUntil = dueResult.days_until_due ?? 0
      let warningLevel: 'info' | 'warning' | 'critical' = 'info'

      if (dueResult.due_status === 'overdue' || dueResult.due_status === 'urgent') {
        warningLevel = daysUntil <= 1 ? 'critical' : 'warning'
      } else if (dueResult.due_status === 'approaching') {
        warningLevel = 'info'
      }

      warnings.push({
        id: generateId(),
        project_id: (acceptance as any).project_id,
        task_id: (acceptance as any).task_id,
        warning_type: 'acceptance_expired',
        warning_level: warningLevel,
        title: '验收即将到期',
        description: `${(acceptance as any).acceptance_type}验收"${(acceptance as any).plan_name}"${dueResult.due_label}`,
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

    const warnings: Warning[] = []
    const now = new Date()

    for (const task of (tasks || [])) {
      const t = task as any
      const delayCount = t.delay_count || 0

      let warningLevel: 'warning' | 'critical' = 'warning'
      let title = '延期次数较多'

      if (delayCount >= 5) {
        warningLevel = 'critical'
        title = '频繁延期 - 需立即关注'
      } else if (delayCount >= 3) {
        warningLevel = 'warning'
        title = '连续延期 - 需关注'
      }

      let description = `任务"${t.title}"已延期${delayCount}次`
      const milestoneName = t.milestones?.name
      if (milestoneName) {
        description += `，属于里程碑"${milestoneName}"`
      }
      description += '，建议尽快调整计划或采取措施'

      warnings.push({
        id: generateId(),
        project_id: t.project_id || '',
        task_id: t.id,
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
      if (warning.warning_type === 'condition_expired') {
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
    const warnings = [
      ...await this.scanConditionWarnings(projectId),
      ...await this.scanObstacleWarnings(projectId),
      ...await this.scanAcceptanceWarnings(projectId),
      ...await this.scanDelayExceededWarnings(projectId),
    ]

    const notifications: Notification[] = []
    const now = new Date()

    for (const warning of warnings) {
      let type = 'system'

      switch (warning.warning_type) {
        case 'condition_expired':
          type = 'condition_reminder'
          break
        case 'obstacle_timeout':
          type = warning.warning_level === 'critical' ? 'obstacle_7day' : 'obstacle_3day'
          break
        case 'acceptance_expired':
          type = 'acceptance_approaching'
          break
      }

      notifications.push({
        id: generateId(),
        project_id: warning.project_id,
        type,
        severity: warning.warning_level,
        title: warning.title,
        content: warning.description,
        is_read: false,
        is_broadcast: warning.warning_level === 'critical',
        source_entity_type: 'task',
        source_entity_id: warning.task_id,
        created_at: now.toISOString(),
      })
    }

    return notifications
  }
}
