import { query as rawQuery } from '../database.js'
import type { Notification } from '../types/db.js'
import { updateNotificationById } from './notificationStore.js'
import { clearAttentionSummaryCache } from './todoTouchpointService.js'

type ReconcileOptions = {
  projectId?: string | null
  limit?: number
}

type SourceResolver = {
  table: string
  resolvedStatuses: Set<string>
}

const SOURCE_RESOLVERS: Record<string, SourceResolver> = {
  task: { table: 'tasks', resolvedStatuses: new Set(['completed', 'done', 'closed', 'resolved']) },
  risk: { table: 'risks', resolvedStatuses: new Set(['closed', 'resolved', 'mitigated']) },
  issue: { table: 'issues', resolvedStatuses: new Set(['closed', 'resolved', 'done']) },
  project_material: { table: 'project_materials', resolvedStatuses: new Set(['arrived', 'delivered', 'closed', 'resolved']) },
  task_condition: { table: 'task_conditions', resolvedStatuses: new Set(['satisfied', 'met', 'completed', 'closed', 'resolved']) },
  task_obstacle: { table: 'task_obstacles', resolvedStatuses: new Set(['cleared', 'resolved', 'closed', 'removed']) },
  acceptance_plan: { table: 'acceptance_plans', resolvedStatuses: new Set(['passed', 'accepted', 'completed', 'closed', 'resolved']) },
}

export type NotificationReconciliationCoverageEntry = {
  sourceEntityType: string
  table: string
  resolvedStatuses: string[]
  autoResolve: true
  mutatesSourceFacts: false
}

export function getNotificationReconciliationCoverageMatrix() {
  const entries: NotificationReconciliationCoverageEntry[] = Object.entries(SOURCE_RESOLVERS)
    .map(([sourceEntityType, resolver]) => ({
      sourceEntityType,
      table: resolver.table,
      resolvedStatuses: [...resolver.resolvedStatuses].sort(),
      autoResolve: true as const,
      mutatesSourceFacts: false as const,
    }))
    .sort((left, right) => left.sourceEntityType.localeCompare(right.sourceEntityType))

  return {
    policy: 'conservative_source_status_only',
    mutatesSourceFacts: false,
    coveredSourceTypes: entries.map((entry) => entry.sourceEntityType),
    entries,
  }
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

async function loadSourceStatus(sourceEntityType: string, sourceEntityId: string, projectId: string) {
  const resolver = SOURCE_RESOLVERS[sourceEntityType]
  if (!resolver) return null

  const result = await loadSourceStatusRow(sourceEntityType, sourceEntityId, projectId)
  const row = result.rows?.[0]
  if (!row) return null
  const status = normalizeStatus(row.status)
  return {
    status,
    resolved: resolver.resolvedStatuses.has(status),
  }
}

function loadSourceStatusRow(sourceEntityType: string, sourceEntityId: string, projectId: string) {
  switch (sourceEntityType) {
    case 'task':
      return rawQuery(
        `SELECT id, status
           FROM public.tasks
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'risk':
      return rawQuery(
        `SELECT id, status
           FROM public.risks
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'issue':
      return rawQuery(
        `SELECT id, status
           FROM public.issues
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'project_material':
      return rawQuery(
        `SELECT id,
                CASE
                  WHEN actual_arrival_date IS NOT NULL THEN 'arrived'
                  ELSE COALESCE(lifecycle_status, record_status, '')
                END AS status
           FROM public.project_materials
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'task_condition':
      return rawQuery(
        `SELECT id, status
           FROM public.task_conditions
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'task_obstacle':
      return rawQuery(
        `SELECT id, status
           FROM public.task_obstacles
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    case 'acceptance_plan':
      return rawQuery(
        `SELECT id, status
           FROM public.acceptance_plans
          WHERE id::text = $1::text
            AND project_id::text = $2::text
          LIMIT 1`,
        [sourceEntityId, projectId],
      )
    default:
      return Promise.resolve({ rows: [] })
  }
}

export async function reconcileResolvedNotifications(options: ReconcileOptions = {}) {
  const limit = Math.min(Math.max(Number(options.limit ?? 500), 1), 2000)
  const projectId = String(options.projectId ?? '').trim() || null
  const result = await rawQuery(
    `SELECT id, project_id, source_entity_type, source_entity_id, metadata
       FROM public.notifications
      WHERE COALESCE(lifecycle_status, 'active') = 'active'
        AND source_entity_type IS NOT NULL
        AND source_entity_id IS NOT NULL
        AND ($1::text IS NULL OR project_id::text = $1::text)
      ORDER BY updated_at ASC NULLS FIRST, created_at ASC
      LIMIT $2`,
    [projectId, limit],
  )

  let resolved = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const notification of (result.rows ?? []) as Notification[]) {
    const sourceEntityType = String(notification.source_entity_type ?? '').trim()
    const sourceEntityId = String(notification.source_entity_id ?? '').trim()
    const notificationProjectId = String(notification.project_id ?? '').trim()
    if (!notificationProjectId) {
      skipped += 1
      continue
    }
    const source = await loadSourceStatus(sourceEntityType, sourceEntityId, notificationProjectId)
    if (!source?.resolved) {
      skipped += 1
      continue
    }

    await updateNotificationById(notification.id, {
      lifecycle_status: 'resolved',
      status: 'read',
      is_read: true,
      resolved_at: now,
      resolved_source: 'source_reconciliation',
      reconciled_at: now,
      reconciliation_source_status: source.status,
      metadata: {
        ...((notification.metadata && typeof notification.metadata === 'object') ? notification.metadata : {}),
        reconciliation_source_status: source.status,
        reconciled_at: now,
      },
      updated_at: now,
    } as Partial<Notification>, notification)
    resolved += 1
  }

  if (resolved > 0) clearAttentionSummaryCache()

  return {
    scanned: (result.rows ?? []).length,
    resolved,
    skipped,
  }
}
