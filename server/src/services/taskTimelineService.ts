import { executeSQL } from './dbService.js'
import { logger } from '../middleware/logger.js'

export type TaskTimelineEventKind = 'task' | 'milestone' | 'condition' | 'obstacle'

export interface TaskTimelineEventDTO {
  id: string
  kind: TaskTimelineEventKind
  title: string
  description: string
  occurredAt: string
  taskId?: string
  statusLabel?: string
}

export interface PersistedTaskTimelineEventRow {
  id: string
  task_id?: string | null
  event_type?: string | null
  title?: string | null
  description?: string | null
  status_label?: string | null
  occurred_at?: string | null
  created_at?: string | null
}

function normalizeKind(value: unknown): TaskTimelineEventKind {
  const kind = String(value ?? '').trim()
  if (kind === 'milestone' || kind === 'condition' || kind === 'obstacle') return kind
  return 'task'
}

function normalizeText(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function mapPersistedTaskTimelineEvent(row: PersistedTaskTimelineEventRow): TaskTimelineEventDTO {
  return {
    id: String(row.id ?? ''),
    kind: normalizeKind(row.event_type),
    title: normalizeText(row.title, '未命名事件'),
    description: normalizeText(row.description, '暂无说明'),
    occurredAt: String(row.occurred_at ?? row.created_at ?? ''),
    taskId: row.task_id ? String(row.task_id) : undefined,
    statusLabel: row.status_label ? String(row.status_label) : undefined,
  }
}

export async function getProjectTimelineEvents(projectId: string): Promise<TaskTimelineEventDTO[]> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return []

  try {
    const rows = await executeSQL<PersistedTaskTimelineEventRow>(
      `SELECT id, task_id, event_type, title, description, status_label, occurred_at, created_at
       FROM task_timeline_events
       WHERE project_id = ?
       ORDER BY occurred_at DESC, created_at DESC`,
      [normalizedProjectId],
    )

    return (rows || []).map(mapPersistedTaskTimelineEvent)
  } catch (error) {
    logger.warn('Failed to load persisted task timeline events', {
      projectId: normalizedProjectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function isTaskTimelineEventStoreReady(projectId: string): Promise<boolean> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return false

  try {
    await executeSQL(
      `SELECT id
       FROM task_timeline_events
       WHERE project_id = ?
       LIMIT 1`,
      [normalizedProjectId],
    )
    return true
  } catch (error) {
    logger.warn('Task timeline store probe failed', {
      projectId: normalizedProjectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
