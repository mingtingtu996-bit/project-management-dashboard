import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { executeSQL } from './dbService.js'
import { findNotification, insertNotification, listNotifications } from './notificationStore.js'
import type { Notification } from '../types/db.js'

const DAY_MS = 24 * 60 * 60 * 1000

interface DelayRequestRow {
  id: string
  project_id?: string | null
  task_id: string
  created_at?: string | null
  requested_at?: string | null
  status: string
}

interface TaskRow {
  id: string
  project_id: string
  title?: string | null
  name?: string | null
}

interface ProjectRow {
  id: string
  owner_id?: string | null
  name?: string | null
}

interface ProjectMemberRow {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

export interface DelayRequestNotificationRunResult {
  scanned: number
  reminderCount: number
  escalationCount: number
  persistedCount: number
}

function daysSince(dateValue?: string | null): number {
  if (!dateValue) return 0
  const time = new Date(dateValue).getTime()
  if (!Number.isFinite(time)) return 0
  return Math.floor((Date.now() - time) / DAY_MS)
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function buildContent(taskTitle: string, ageDays: number, isEscalated: boolean) {
  if (isEscalated) {
    return `Delay request for "${taskTitle}" has been pending for ${ageDays} days and was escalated to the project owner.`
  }
  return `Delay request for "${taskTitle}" has been pending for ${ageDays} days. Please review it soon.`
}

function buildTitle(isEscalated: boolean) {
  return isEscalated ? 'Delay approval escalation' : 'Delay approval reminder'
}

function buildNotificationType(isEscalated: boolean) {
  return isEscalated ? 'delay_request_escalation' : 'delay_request_reminder'
}

function isNotificationRead(notification?: Pick<Notification, 'is_read' | 'status'> | null) {
  if (!notification) return false
  if (notification.is_read) return true

  const status = String(notification.status ?? '').trim().toLowerCase()
  return status === 'read' || status === 'acknowledged' || status === 'resolved' || status === 'closed'
}

export class DelayRequestNotificationService {
  async collectPendingDelayRequestNotifications(projectId?: string): Promise<Notification[]> {
    const filters: string[] = ['status = ?']
    const values: any[] = ['pending']
    if (projectId) {
      filters.push('project_id = ?')
      values.push(projectId)
    }

    const pendingRequests = (await executeSQL<DelayRequestRow>(
      `SELECT * FROM delay_requests WHERE ${filters.join(' AND ')}`,
      values,
    )) as DelayRequestRow[]

    const agedRequests = (pendingRequests || []).filter((request) => daysSince(request.created_at ?? request.requested_at) >= 3)
    if (agedRequests.length === 0) {
      return []
    }

    const projectIds = uniqueStrings(agedRequests.map((request) => request.project_id ?? null))
    const taskIds = uniqueStrings(agedRequests.map((request) => request.task_id))

    const [taskRows, projectRows, memberRows] = await Promise.all([
      taskIds.length > 0
        ? executeSQL<TaskRow>('SELECT * FROM tasks WHERE id IN (' + taskIds.map(() => '?').join(', ') + ')', taskIds)
        : Promise.resolve([] as TaskRow[]),
      projectIds.length > 0
        ? executeSQL<ProjectRow>('SELECT * FROM projects WHERE id IN (' + projectIds.map(() => '?').join(', ') + ')', projectIds)
        : Promise.resolve([] as ProjectRow[]),
      projectIds.length > 0
        ? executeSQL<ProjectMemberRow>('SELECT * FROM project_members WHERE project_id IN (' + projectIds.map(() => '?').join(', ') + ')', projectIds)
        : Promise.resolve([] as ProjectMemberRow[]),
    ])

    const taskMap = new Map(taskRows.map((task) => [task.id, task]))
    const projectMap = new Map(projectRows.map((project) => [project.id, project]))
    const memberMap = new Map<string, ProjectMemberRow[]>()

    for (const member of memberRows || []) {
      const list = memberMap.get(member.project_id) ?? []
      list.push(member)
      memberMap.set(member.project_id, list)
    }

    const notifications: Notification[] = []

    for (const request of agedRequests) {
      const createdAt = request.created_at ?? request.requested_at ?? new Date().toISOString()
      const ageDays = daysSince(createdAt)
      const isEscalated = ageDays >= 5
      const projectKey = request.project_id ?? ''
      const task = taskMap.get(request.task_id)
      const project = projectMap.get(projectKey)
      const members = memberMap.get(projectKey) ?? []

      const approverRecipients = uniqueStrings([
        ...members
          .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
          .map((member) => member.user_id),
        project?.owner_id ?? null,
      ])
      const ownerRecipients = uniqueStrings([
        project?.owner_id ?? null,
        ...members
          .filter((member) => String(member.role ?? '').trim() === 'owner')
          .map((member) => member.user_id),
      ])
      const recipients = isEscalated
        ? (ownerRecipients.length > 0 ? ownerRecipients : approverRecipients)
        : approverRecipients

      if (recipients.length === 0) {
        logger.warn('[delayRequestNotificationService] skip notification without recipients', {
          requestId: request.id,
          projectId: request.project_id,
        })
        continue
      }

      const notificationType = buildNotificationType(isEscalated)
      const existing = await findNotification({
        sourceEntityType: 'delay_request',
        sourceEntityId: request.id,
        type: notificationType,
      })
      if (existing) {
        continue
      }

      if (!isEscalated) {
        const relatedNotifications = await listNotifications({
          sourceEntityType: 'delay_request',
          sourceEntityId: request.id,
        })
        const submittedNotification = relatedNotifications.find((notification) =>
          ['delay_request_submitted', 'critical_path_delay_request_submitted'].includes(String(notification.type ?? '').trim()),
        )
        if (!isNotificationRead(submittedNotification)) {
          continue
        }
      }

      const notification: Notification = {
        id: uuidv4(),
        project_id: projectKey || null,
        type: notificationType,
        severity: isEscalated ? 'critical' : 'warning',
        title: buildTitle(isEscalated),
        content: buildContent(task?.title || task?.name || request.task_id, ageDays, isEscalated),
        is_read: false,
        is_broadcast: isEscalated,
        source_entity_type: 'delay_request',
        source_entity_id: request.id,
        recipients,
        status: 'unread',
        metadata: {
          delay_request_id: request.id,
          task_id: request.task_id,
          task_title: task?.title || task?.name || null,
          age_days: ageDays,
          stage: isEscalated ? 'escalation' : 'reminder',
        },
        created_at: new Date().toISOString(),
      }

      notifications.push(notification)
    }

    return notifications
  }

  async persistPendingDelayRequestNotifications(projectId?: string): Promise<Notification[]> {
    const notifications = await this.collectPendingDelayRequestNotifications(projectId)
    const persisted: Notification[] = []

    for (const notification of notifications) {
      const existing = await findNotification({
        sourceEntityType: notification.source_entity_type ?? 'delay_request',
        sourceEntityId: notification.source_entity_id ?? notification.id,
        type: notification.type,
      })
      if (existing) {
        continue
      }

      persisted.push(await insertNotification({
        ...notification,
        notification_type: notification.notification_type ?? 'flow-reminder',
        source_entity_type: notification.source_entity_type ?? 'delay_request',
        source_entity_id: notification.source_entity_id ?? notification.id,
        status: notification.status ?? 'unread',
        metadata: notification.metadata ?? {},
        channel: notification.channel ?? 'in_app',
      }))
    }

    return persisted
  }

  async run(projectId?: string): Promise<DelayRequestNotificationRunResult> {
    const notifications = await this.persistPendingDelayRequestNotifications(projectId)
    const reminderCount = notifications.filter((notification) => notification.type === 'delay_request_reminder').length
    const escalationCount = notifications.filter((notification) => notification.type === 'delay_request_escalation').length

    return {
      scanned: notifications.length,
      reminderCount,
      escalationCount,
      persistedCount: notifications.length,
    }
  }
}
