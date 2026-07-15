import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'

export type ProjectWarningProjectionRow = {
  id: string
  project_id: string
  task_id?: string | null
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  status?: string | null
  warning_lifecycle_status?: string | null
  is_acknowledged: boolean
  title?: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  first_seen_at?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  raw_notification?: Record<string, unknown>
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeWarningLevel(value: unknown): ProjectWarningProjectionRow['warning_level'] {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'info') return 'info'
  return 'warning'
}

export function projectWarningProjectionFromNotification(row: Record<string, any>): ProjectWarningProjectionRow {
  const warningType = normalizeText(row.category ?? row.type ?? row.warning_type) || 'warning'
  const taskId = normalizeText(row.task_id)
  return {
    id: normalizeText(row.id),
    project_id: normalizeText(row.project_id),
    task_id: taskId || null,
    warning_type: warningType,
    warning_level: normalizeWarningLevel(row.severity ?? row.level ?? row.warning_level),
    status: row.status ?? null,
    warning_lifecycle_status: row.warning_lifecycle_status ?? null,
    is_acknowledged: Boolean(row.acknowledged_at),
    title: row.title ?? null,
    description: row.content ?? row.description ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    first_seen_at: row.first_seen_at ?? row.created_at ?? null,
    source_entity_type: row.source_entity_type ?? null,
    source_entity_id: row.source_entity_id ?? null,
    raw_notification: row,
  }
}

export async function listProjectWarningProjectionRows(projectId: string, limit = 1_000): Promise<ProjectWarningProjectionRow[]> {
  if (!projectId) return []
  try {
    const { data, error } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('project_id', projectId)
      .eq('source_entity_type', 'warning')
      .limit(limit)
    if (error) throw error
    return Array.isArray(data) ? data.map((row) => projectWarningProjectionFromNotification(row)) : []
  } catch (error) {
    logger.debug('[projectWarningProjectionService] warning notification projection unavailable', { projectId, error })
    return []
  }
}
