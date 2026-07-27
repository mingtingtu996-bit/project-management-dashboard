import {
  closeIssueByRetention,
  confirmIssuePendingManualClose,
  createIssue,
  deleteIssue,
  keepIssueProcessing,
  updateIssue,
} from './dbService.js'
import {
  deleteNotificationById,
  findNotification,
  updateNotificationById,
} from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import type { Issue, Notification } from '../types/db.js'
import type { RetentionClosureContext, RiskIssueClosureOutcomeInput } from '../domain/riskIssueWorkflowPolicy.js'

function mapIssueSeverityToNotificationSeverity(severity?: Issue['severity'] | null): Notification['severity'] {
  if (severity === 'critical') return 'critical'
  if (severity === 'high' || severity === 'medium') return 'warning'
  return 'info'
}

function buildIssueNotificationType(status: Issue['status']) {
  if (status === 'closed') return 'issue_closed'
  if (status === 'open') return 'issue_created'
  return 'issue_status_changed'
}

function buildIssueNotificationContent(issue: Issue) {
  const description = String(issue.description ?? '').trim()
  if (description) return description

  if (issue.status === 'investigating') {
    return '问题已进入处理中，请持续跟进闭环。'
  }

  if (issue.status === 'resolved') {
    return '问题已转为待确认关闭，请继续核验处理结果。'
  }

  if (issue.status === 'closed') {
    return '问题已关闭，可在问题中心查看完整处理记录。'
  }

  return '问题已创建，请及时跟进处理。'
}

function buildIssueNotificationMetadata(issue: Issue, current?: Notification | null) {
  const currentMetadata =
    current && typeof current.metadata === 'object' && current.metadata !== null
      ? current.metadata
      : {}

  return {
    ...currentMetadata,
    issue_status: issue.status,
    issue_priority: issue.priority,
    issue_source_type: issue.source_type,
    issue_source_entity_type: issue.source_entity_type ?? null,
    issue_source_entity_id: issue.source_entity_id ?? issue.source_id ?? null,
    pending_manual_close: issue.pending_manual_close,
  }
}

async function syncIssueNotification(issue: Issue | null) {
  if (!issue) return

  const existing = await findNotification({
    projectId: issue.project_id,
    sourceEntityType: 'issue',
    sourceEntityId: issue.id,
  })

  if (issue.status === 'closed') {
    if (!existing) return

    await updateNotificationById(existing.id, {
      type: buildIssueNotificationType(issue.status),
      notification_type: 'business-warning',
      severity: mapIssueSeverityToNotificationSeverity(issue.severity),
      title: issue.title,
      content: buildIssueNotificationContent(issue),
      category: 'problem',
      task_id: issue.task_id ?? null,
      is_read: true,
      status: 'read',
      resolved_at: issue.closed_at ?? new Date().toISOString(),
      resolved_source: issue.closed_reason ?? 'issue_closed',
      metadata: buildIssueNotificationMetadata(issue, existing),
    }, existing)
    return
  }

  const patch = {
    type: buildIssueNotificationType(issue.status),
    notification_type: 'business-warning',
    severity: mapIssueSeverityToNotificationSeverity(issue.severity),
    title: issue.title,
    content: buildIssueNotificationContent(issue),
    category: 'problem',
    task_id: issue.task_id ?? null,
    metadata: buildIssueNotificationMetadata(issue, existing),
  }

  if (existing) {
    await updateNotificationById(existing.id, patch, existing)
    return
  }

  await notificationTouchpointService.emit({
    project_id: issue.project_id,
    type: patch.type,
    notification_type: patch.notification_type,
    severity: patch.severity,
    title: patch.title,
    content: patch.content,
    is_read: false,
    source_entity_type: 'issue',
    source_entity_id: issue.id,
    category: patch.category,
    task_id: patch.task_id,
    status: 'unread',
    metadata: patch.metadata,
    touchpoint_type: 'dashboard_todo',
    scope_type: 'project',
    dedupe_key: `issue:${issue.project_id}:${issue.id}`,
    target_route: `/projects/${issue.project_id}/risks?tab=issues`,
    target_label: '查看问题',
  })
}

export async function syncIssueNotificationInMainChain(issue: Issue | null): Promise<void> {
  await syncIssueNotification(issue)
}

export async function createIssueInMainChain(
  issue: Omit<Issue, 'id' | 'created_at' | 'updated_at'>,
): Promise<Issue> {
  const created = await createIssue(issue)
  await syncIssueNotification(created)
  return created
}

export async function updateIssueInMainChain(
  id: string,
  updates: Partial<Issue>,
  expectedVersion?: number,
): Promise<Issue | null> {
  const updated = await updateIssue(id, updates, expectedVersion)
  await syncIssueNotification(updated)
  return updated
}

export async function confirmIssuePendingManualCloseInMainChain(
  id: string,
  outcome: RiskIssueClosureOutcomeInput,
  actorId: string,
  expectedVersion?: number,
): Promise<Issue | null> {
  const updated = await confirmIssuePendingManualClose(id, outcome, actorId, expectedVersion)
  await syncIssueNotification(updated)
  return updated
}

export async function closeIssueByRetentionInMainChain(
  id: string,
  projectId: string,
  context: RetentionClosureContext = {},
  expectedVersion?: number,
): Promise<Issue | null> {
  const updated = await closeIssueByRetention(id, projectId, context, expectedVersion)
  await syncIssueNotification(updated)
  return updated
}

export async function keepIssueProcessingInMainChain(
  id: string,
  expectedVersion?: number,
): Promise<Issue | null> {
  const updated = await keepIssueProcessing(id, expectedVersion)
  await syncIssueNotification(updated)
  return updated
}

export async function deleteIssueInMainChain(id: string): Promise<void> {
  const existing = await findNotification({
    sourceEntityType: 'issue',
    sourceEntityId: id,
  })
  await deleteIssue(id)
  if (existing) {
    await deleteNotificationById(existing.id, existing)
  }
}
