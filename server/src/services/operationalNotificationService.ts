import { v4 as uuidv4 } from 'uuid'

import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import type { Notification, Task } from '../types/db.js'
import type { PlanningIntegrityMappingSummary, PlanningIntegrityReport } from '../types/planning.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { MilestoneIntegrityService } from './milestoneIntegrityService.js'
import { PlanningIntegrityService } from './planningIntegrityService.js'
import { isCompletedTask, isInProgressTask } from '../utils/taskStatus.js'
import {
  insertNotification,
  listNotifications,
  updateNotificationById,
} from './notificationStore.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Keep the legacy snapshot source type in the cleanup set so old rows are
// auto-resolved after 6.4 removes the duplicate write path.
const OPERATIONAL_SIGNAL_SOURCE_TYPES = new Set([
  'task_snapshot_gap',
  'task_date_inversion',
  'task_status_progress_mismatch',
])

interface ProjectOwnerRow {
  id: string
  owner_id?: string | null
}

interface ProjectMemberRow {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

interface OperationalSignalDefinition {
  sourceEntityType: 'task_snapshot_gap' | 'task_date_inversion' | 'task_status_progress_mismatch'
  sourceEntityId: string
  type: 'snapshot_gap' | 'date_inversion' | 'status_progress_mismatch'
  severity: 'warning' | 'critical'
  title: string
  content: string
  taskId: string
  metadata: Record<string, unknown>
}

interface MappingOrphanPointerNotificationDefinition {
  sourceEntityType: 'planning_governance'
  sourceEntityId: string
  type: 'planning_gov_mapping_orphan_pointer'
  notificationType: 'system-exception'
  severity: 'warning' | 'critical'
  title: string
  content: string
  metadata: Record<string, unknown>
}

type ProjectRecipientsCache = Map<string, Promise<string[]>>

function nowIso() {
  return new Date().toISOString()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function toTimestamp(value?: string | null) {
  if (!value) return Number.NaN
  return new Date(value).getTime()
}

function isNotStartedTask(task: Partial<Task>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return status === 'pending' || status === 'todo' || status === '未开始'
}

function buildNotificationKey(signal: Pick<OperationalSignalDefinition, 'type' | 'sourceEntityType' | 'sourceEntityId'>) {
  return [signal.type, signal.sourceEntityType, signal.sourceEntityId].join('|')
}

function resolveMappingIntegritySummary(
  input: PlanningIntegrityMappingSummary | Pick<PlanningIntegrityReport, 'mapping_integrity'>,
): PlanningIntegrityMappingSummary {
  return 'mapping_integrity' in input ? input.mapping_integrity : input
}

function buildMappingOrphanPointerNotificationDefinition(
  projectId: string,
  input: PlanningIntegrityMappingSummary | Pick<PlanningIntegrityReport, 'mapping_integrity'>,
): MappingOrphanPointerNotificationDefinition | null {
  const summary = resolveMappingIntegritySummary(input)
  const pendingCount = Number(summary.baseline_pending_count ?? 0)
  const mergedCount = Number(summary.baseline_merged_count ?? 0)
  const carryoverCount = Number(summary.monthly_carryover_count ?? 0)
  const total = pendingCount + mergedCount + carryoverCount

  if (total <= 0) return null

  return {
    sourceEntityType: 'planning_governance',
    sourceEntityId: `${projectId}:mapping_orphan_pointer`,
    type: 'planning_gov_mapping_orphan_pointer',
    notificationType: 'system-exception',
    severity: pendingCount > 0 || mergedCount > 0 ? 'critical' : 'warning',
    title: '规划映射存在孤立指针',
    content: `映射孤立指针 ${total} 条，其中 baseline pending/missing ${pendingCount} 条、baseline merged ${mergedCount} 条、monthly carryover ${carryoverCount} 条。`,
    metadata: {
      category: 'planning_mapping_orphan',
      alert_kind: 'mapping_orphan_pointer',
      baseline_pending_count: pendingCount,
      baseline_merged_count: mergedCount,
      monthly_carryover_count: carryoverCount,
    },
  }
}

function detectDateInversionSignals(tasks: Task[]): OperationalSignalDefinition[] {
  const signals: OperationalSignalDefinition[] = []

  for (const task of tasks) {
    const inversions: string[] = []
    const plannedStartAt = toTimestamp(task.planned_start_date ?? null)
    const plannedEndAt = toTimestamp(task.planned_end_date ?? task.end_date ?? null)
    const actualStartAt = toTimestamp(task.start_date ?? task.actual_start_date ?? null)
    const actualEndAt = toTimestamp(task.actual_end_date ?? task.end_date ?? null)

    if (Number.isFinite(plannedStartAt) && Number.isFinite(plannedEndAt) && plannedStartAt > plannedEndAt) {
      inversions.push('planned_start_date > planned_end_date')
    }

    if (Number.isFinite(actualStartAt) && Number.isFinite(actualEndAt) && actualStartAt > actualEndAt) {
      inversions.push('actual_start_date > actual_end_date')
    }

    if (inversions.length === 0) continue

    signals.push({
      sourceEntityType: 'task_date_inversion',
      sourceEntityId: task.id,
      type: 'date_inversion',
      severity: 'critical',
      title: '任务日期存在逆序异常',
      content: `任务“${task.title}”存在日期逆序：${inversions.join('；')}。请立即修正计划/实际日期。`,
      taskId: task.id,
      metadata: {
        task_id: task.id,
        inversions,
        planned_start_date: task.planned_start_date ?? null,
        planned_end_date: task.planned_end_date ?? task.end_date ?? null,
        actual_start_date: task.start_date ?? task.actual_start_date ?? null,
        actual_end_date: task.actual_end_date ?? task.end_date ?? null,
      },
    })
  }

  return signals
}

function detectStatusProgressMismatchSignals(tasks: Task[]): OperationalSignalDefinition[] {
  const signals: OperationalSignalDefinition[] = []

  for (const task of tasks) {
    const progress = Number(task.progress ?? 0)
    const mismatches: string[] = []

    if (isCompletedTask(task) && progress < 100) {
      mismatches.push('已完成状态但进度未到 100%')
    }
    if (isNotStartedTask(task) && progress > 0) {
      mismatches.push('未开始状态但已有进度')
    }
    if (isInProgressTask(task) && progress === 0) {
      mismatches.push('进行中状态但进度仍为 0%')
    }

    if (mismatches.length === 0) continue

    signals.push({
      sourceEntityType: 'task_status_progress_mismatch',
      sourceEntityId: task.id,
      type: 'status_progress_mismatch',
      severity: 'warning',
      title: '任务状态与进度不一致',
      content: `任务“${task.title}”存在状态/进度不一致：${mismatches.join('；')}。`,
      taskId: task.id,
      metadata: {
        task_id: task.id,
        mismatches,
        task_status: task.status ?? null,
        task_progress: progress,
      },
    })
  }

  return signals
}

async function loadProjectRecipients(projectId: string): Promise<string[]> {
  const [project, members] = await Promise.all([
    executeSQLOne<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => {
        const role = normalizeProjectPermissionLevel(member.permission_level ?? member.role)
        return role === 'owner'
      })
      .map((member) => member.user_id),
  ])
}

async function getProjectRecipients(projectId: string, cache?: ProjectRecipientsCache) {
  if (!cache) {
    return await loadProjectRecipients(projectId)
  }

  const cached = cache.get(projectId)
  if (cached) {
    return await cached
  }

  const pending = loadProjectRecipients(projectId)
  cache.set(projectId, pending)
  return await pending
}

async function buildNotificationRow(
  projectId: string,
  signal: OperationalSignalDefinition,
  recipientsCache?: ProjectRecipientsCache,
): Promise<Notification | null> {
  const recipients = await getProjectRecipients(projectId, recipientsCache)
  if (recipients.length === 0) return null

  return {
    id: uuidv4(),
    project_id: projectId,
    type: signal.type,
    notification_type: 'system-exception',
    severity: signal.severity,
    level: signal.severity,
    title: signal.title,
    content: signal.content,
    is_read: false,
    is_broadcast: signal.severity === 'critical',
    source_entity_type: signal.sourceEntityType,
    source_entity_id: signal.sourceEntityId,
    category: 'system_consistency',
    task_id: signal.taskId,
    recipients,
    status: 'unread',
    metadata: {
      ...signal.metadata,
      signal_type: signal.type,
    },
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

async function buildMappingOrphanNotificationRow(
  projectId: string,
  definition: MappingOrphanPointerNotificationDefinition,
  recipientsCache?: ProjectRecipientsCache,
): Promise<Notification | null> {
  const recipients = await getProjectRecipients(projectId, recipientsCache)
  if (recipients.length === 0) return null

  const timestamp = nowIso()
  return {
    id: uuidv4(),
    project_id: projectId,
    type: definition.type,
    notification_type: definition.notificationType,
    severity: definition.severity,
    level: definition.severity,
    title: definition.title,
    content: definition.content,
    is_read: false,
    is_broadcast: definition.severity === 'critical',
    source_entity_type: definition.sourceEntityType,
    source_entity_id: definition.sourceEntityId,
    category: 'planning_mapping_orphan',
    task_id: null,
    recipients,
    status: 'unread',
    metadata: {
      ...definition.metadata,
      category: 'planning_mapping_orphan',
    },
    created_at: timestamp,
    updated_at: timestamp,
  }
}

export class OperationalNotificationService {
  private planningIntegrityService = new PlanningIntegrityService()
  private milestoneIntegrityService = new MilestoneIntegrityService()

  async syncMappingOrphanPointerNotifications(
    projectId: string,
    input: PlanningIntegrityMappingSummary | Pick<PlanningIntegrityReport, 'mapping_integrity'>,
    recipientsCache?: ProjectRecipientsCache,
  ): Promise<Notification[]> {
    const effectiveRecipientsCache = recipientsCache ?? new Map<string, Promise<string[]>>()
    const definition = buildMappingOrphanPointerNotificationDefinition(projectId, input)
    const existingRows = (await listNotifications({ projectId }))
      .filter((notification) =>
        notification.type === 'planning_gov_mapping_orphan_pointer'
        && String(notification.source_entity_type ?? '').trim() === 'planning_governance',
      )
    const existing = existingRows.find((row) => String(row.source_entity_id ?? '') === `${projectId}:mapping_orphan_pointer`)
    const timestamp = nowIso()

    if (!definition) {
      for (const row of existingRows) {
        const normalizedStatus = String(row.status ?? '').trim().toLowerCase()
        if (['resolved', 'archived', 'closed'].includes(normalizedStatus)) continue
        await updateNotificationById(String(row.id), {
          status: 'resolved',
          is_read: true,
          updated_at: timestamp,
        })
      }
      return []
    }

    const row = await buildMappingOrphanNotificationRow(projectId, definition, effectiveRecipientsCache)
    if (!row) return []

    if (!existing) {
      return [await insertNotification(row)]
    }

    const normalizedStatus = String(existing.status ?? '').trim().toLowerCase()
    const reopened = ['resolved', 'archived', 'closed'].includes(normalizedStatus)
    const patch = {
      notification_type: definition.notificationType,
      severity: definition.severity,
      level: definition.severity,
      title: definition.title,
      content: definition.content,
      is_broadcast: definition.severity === 'critical',
      category: 'planning_mapping_orphan',
      status: reopened ? 'unread' : existing.status ?? 'unread',
      is_read: reopened ? false : Boolean(existing.is_read),
      metadata: {
        ...definition.metadata,
        category: 'planning_mapping_orphan',
      },
      updated_at: timestamp,
    }
    await updateNotificationById(String(existing.id), patch)
    return [{ ...existing, ...patch }]
  }

  async collectProjectSignals(projectId: string): Promise<OperationalSignalDefinition[]> {
    const tasks = await executeSQL<Task>('SELECT * FROM tasks WHERE project_id = ?', [projectId])

    return [
      ...detectDateInversionSignals(tasks),
      ...detectStatusProgressMismatchSignals(tasks),
    ]
  }

  async syncProjectNotifications(projectId: string, recipientsCache?: ProjectRecipientsCache): Promise<Notification[]> {
    const effectiveRecipientsCache = recipientsCache ?? new Map<string, Promise<string[]>>()
    const signals = await this.collectProjectSignals(projectId)
    const existingRows = (await listNotifications({ projectId }))
      .filter((notification) => OPERATIONAL_SIGNAL_SOURCE_TYPES.has(String(notification.source_entity_type ?? '').trim()))
    const existingByKey = new Map(
      existingRows.map((row) => [
        buildNotificationKey({
          type: row.type as OperationalSignalDefinition['type'],
          sourceEntityType: row.source_entity_type as OperationalSignalDefinition['sourceEntityType'],
          sourceEntityId: String(row.source_entity_id ?? ''),
        }),
        row,
      ]),
    )

    const activeKeys = new Set<string>()
    const persisted: Notification[] = []
    const timestamp = nowIso()

    for (const signal of signals) {
      const key = buildNotificationKey(signal)
      activeKeys.add(key)
      const notification = await buildNotificationRow(projectId, signal, effectiveRecipientsCache)
      if (!notification) continue

      const existing = existingByKey.get(key)
      if (!existing) {
        persisted.push(await insertNotification(notification))
        continue
      }

      const normalizedStatus = String(existing.status ?? '').trim().toLowerCase()
      const reopened = ['resolved', 'archived', 'closed'].includes(normalizedStatus)
      const nextStatus = reopened ? 'unread' : existing.status ?? 'unread'
      const nextIsRead = reopened ? false : Boolean(existing.is_read)
      const patch = {
        notification_type: 'system-exception',
        severity: signal.severity,
        level: signal.severity,
        title: signal.title,
        content: signal.content,
        is_broadcast: signal.severity === 'critical',
        category: 'system_consistency',
        task_id: signal.taskId,
        status: nextStatus,
        is_read: nextIsRead,
        metadata: {
          ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}),
          ...signal.metadata,
          signal_type: signal.type,
        },
        resolved_at: reopened ? null : existing.resolved_at ?? null,
        updated_at: timestamp,
      } satisfies Partial<Notification>

      await updateNotificationById(existing.id, patch)
      persisted.push({
        ...existing,
        ...patch,
      } as Notification)
    }

    for (const existing of existingRows) {
      const key = buildNotificationKey({
        type: existing.type as OperationalSignalDefinition['type'],
        sourceEntityType: existing.source_entity_type as OperationalSignalDefinition['sourceEntityType'],
        sourceEntityId: String(existing.source_entity_id ?? ''),
      })
      const normalizedStatus = String(existing.status ?? '').trim().toLowerCase()
      if (activeKeys.has(key) || ['resolved', 'archived', 'closed'].includes(normalizedStatus)) {
        continue
      }

      await updateNotificationById(existing.id, {
        status: 'resolved',
        resolved_at: timestamp,
        is_read: true,
        updated_at: timestamp,
      })
    }

    return persisted
  }

  async syncAllProjectNotifications(): Promise<Notification[]> {
    const projectIds = await listActiveProjectIds()
    const CONCURRENCY = 4
    const results: Notification[] = []
    const recipientsCache: ProjectRecipientsCache = new Map()

    for (let i = 0; i < projectIds.length; i += CONCURRENCY) {
      const batch = projectIds.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(async (projectId) => {
          try {
            const integrityReport = await this.planningIntegrityService.scanProjectIntegrity(projectId)
            const notifications = await Promise.all([
              this.syncProjectNotifications(projectId, recipientsCache),
              this.syncMappingOrphanPointerNotifications(projectId, integrityReport, recipientsCache),
              this.milestoneIntegrityService.syncProjectMilestoneNotifications(
                projectId,
                integrityReport.milestone_integrity,
              ),
            ])
            return notifications.flat()
          } catch (error) {
            logger.warn('[operationalNotificationService] sync failed', {
              projectId,
              error: error instanceof Error ? error.message : String(error),
            })
            return []
          }
        }),
      )
      results.push(...batchResults.flat())
    }

    return results
  }
}
