import { listActiveProjectIds } from './activeProjectService.js'
import { notificationTouchpointService, type NotificationTouchpointInput } from './notificationTouchpointService.js'
import {
  getProjectStartReadiness,
  type ProjectStartReadinessReadModel,
} from './projectStartReadinessService.js'

export interface ProjectStartReadinessNotificationPort {
  emit(input: NotificationTouchpointInput): Promise<unknown>
  resolve(input: Pick<NotificationTouchpointInput, 'company_id' | 'project_id' | 'user_id' | 'touchpoint_type' | 'scope_type' | 'dedupe_key' | 'source_entity_type' | 'source_entity_id' | 'type' | 'resolved_source'>): Promise<boolean>
}

const defaultNotificationPort: ProjectStartReadinessNotificationPort = {
  emit: (input) => notificationTouchpointService.emit(input),
  resolve: (input) => notificationTouchpointService.resolve(input),
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return [...new Set(values.map(text).filter(Boolean))]
}

export async function syncProjectStartReadinessNotification(
  model: ProjectStartReadinessReadModel,
  port: ProjectStartReadinessNotificationPort = defaultNotificationPort,
) {
  const dedupeKey = `project-start-readiness-14d:${model.project.projectId}`
  const blockedItems = model.items.filter((item) => item.readinessState === 'blocked')
  if (blockedItems.length === 0) {
    await port.resolve({
      company_id: model.project.companyId,
      project_id: model.project.projectId,
      type: 'start_readiness_lookahead',
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      dedupe_key: dedupeKey,
      source_entity_type: 'project',
      source_entity_id: model.project.projectId,
      resolved_source: 'project_start_readiness_clear',
    })
    return { emitted: false, resolved: true, blockedTaskCount: 0 }
  }

  const recipientIds = unique(blockedItems.map((item) => item.responsibleParty?.userId ?? ''))
  const sampleActions = blockedItems.slice(0, 3).map((item) => `${item.title}: ${item.nextAction || 'resolve start blockers'}`)
  await port.emit({
    company_id: model.project.companyId,
    project_id: model.project.projectId,
    user_id: recipientIds[0] ?? model.project.ownerId,
    recipients: recipientIds,
    type: 'start_readiness_lookahead',
    notification_type: 'business-warning',
    touchpoint_type: 'dashboard_todo',
    scope_type: 'project',
    severity: 'warning',
    level: 'warning',
    title: '14-day start readiness blockers',
    content: `${blockedItems.length} task(s) planned to start in the next 14 calendar dates have blocking conditions. ${sampleActions.join('; ')}`,
    is_broadcast: recipientIds.length === 0,
    source_entity_type: 'project',
    source_entity_id: model.project.projectId,
    dedupe_key: dedupeKey,
    target_route: `/projects/${model.project.projectId}/dashboard?tab=readiness`,
    target_label: 'Open start readiness',
    action_due_at: `${model.window.fromDate}T00:00:00.000Z`,
    metadata: {
      read_model: 'projectStartReadinessService',
      as_of_date: model.window.fromDate,
      through_date: model.window.throughDate,
      blocked_task_ids: blockedItems.map((item) => item.taskId),
      blocker_task_count_by_type: model.summary.blockerTaskCountByType,
      calendar_identity: model.calendarIdentity,
    },
  })
  return { emitted: true, resolved: false, blockedTaskCount: blockedItems.length }
}

export async function syncAllProjectStartReadinessNotifications(options: {
  projectIds?: string[] | null
  dataSource?: Parameters<typeof getProjectStartReadiness>[1]['dataSource']
  resolveCalendar?: Parameters<typeof getProjectStartReadiness>[1]['resolveCalendar']
  notificationPort?: ProjectStartReadinessNotificationPort
} = {}) {
  const projectIds = await listActiveProjectIds(options.projectIds)
  const notificationPort = options.notificationPort ?? defaultNotificationPort
  let scanned = 0
  let emitted = 0
  let resolved = 0
  for (const projectId of projectIds) {
    const model = await getProjectStartReadiness({ projectId }, {
      dataSource: options.dataSource,
      resolveCalendar: options.resolveCalendar,
    })
    const result = await syncProjectStartReadinessNotification(model, notificationPort)
    scanned += 1
    emitted += result.emitted ? 1 : 0
    resolved += result.resolved ? 1 : 0
  }
  return { scanned, emitted, resolved }
}
