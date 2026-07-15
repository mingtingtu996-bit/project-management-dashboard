import { query } from '../database.js'
import { logger } from '../middleware/logger.js'
import type {
  ChangeLogEntityType,
  HasChangeLogParams,
  WriteLifecycleLogParams,
  WriteLogParams,
  WriteStatusTransitionLogParams,
} from '../types/changeLogs.js'
import { normalizeChangeSource, writeChangeLog, type ChangeActionGroup } from './changeAuditService.js'
import { broadcastRealtimeEvent } from './realtimeServer.js'

export type {
  ChangeLogEntityType,
  ChangeSource,
  HasChangeLogParams,
  WriteLifecycleLogParams,
  WriteLogParams,
  WriteStatusTransitionLogParams,
} from '../types/changeLogs.js'

// Legacy callers keep best-effort semantics, but persistence uses the backend audit boundary.
export async function writeLog(params: WriteLogParams): Promise<void> {
  try {
    if (!params.project_id) {
      logger.warn('[changeLogs.writeLog] missing project scope, skipping business audit', { params })
      return
    }

    const actionGroup = ['create', 'edit', 'delete', 'confirm', 'auto', 'governance', 'import']
      .includes(String(params.action_group ?? ''))
      ? params.action_group as ChangeActionGroup
      : 'edit'
    const id = await writeChangeLog({
      projectId: params.project_id,
      entityType: params.entity_type,
      entityId: params.entity_id,
      actionType: params.action_type ?? 'field_update',
      actionGroup,
      fieldName: params.field_name,
      oldValue: params.old_value != null ? String(params.old_value) : null,
      newValue: params.new_value != null ? String(params.new_value) : null,
      changeReason: params.change_reason ?? null,
      changedBy: params.changed_by ?? null,
      changeSource: params.change_source ?? 'manual_adjusted',
      beforeSnapshot: params.before_snapshot ?? {},
      afterSnapshot: params.after_snapshot ?? {},
      metadata: params.metadata ?? {},
      visibility: params.visibility ?? 'internal',
    })

    if (id) {
      broadcastRealtimeEvent({
        channel: 'project',
        type: 'project.changed',
        projectId: params.project_id,
        entityType: params.entity_type,
        entityId: params.entity_id,
        payload: {
          fieldName: params.field_name,
          changeSource: params.change_source ?? 'manual_adjusted',
        },
      })
    }
  } catch (error) {
    logger.warn('[changeLogs.writeLog] audit write failed; continuing legacy best-effort caller', { error, params })
  }
}

export async function writeLogs(logs: WriteLogParams[]): Promise<void> {
  await Promise.all(logs.map(writeLog))
}

export async function writeStatusTransitionLog(params: WriteStatusTransitionLogParams): Promise<void> {
  await writeLog({
    project_id: params.project_id ?? null,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    field_name: 'status',
    old_value: params.old_status ?? null,
    new_value: params.new_status,
    change_reason: params.change_reason ?? null,
    changed_by: params.changed_by ?? null,
    change_source: params.change_source ?? 'manual_adjusted',
  })
}

export async function writeLifecycleLog(params: WriteLifecycleLogParams): Promise<void> {
  await writeLog({
    project_id: params.project_id ?? null,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    field_name: 'lifecycle',
    old_value: null,
    new_value: params.action,
    change_reason: params.change_reason ?? null,
    changed_by: params.changed_by ?? null,
    change_source: params.change_source ?? 'manual_adjusted',
  })
}

export async function getEntityLogs(
  entityType: ChangeLogEntityType,
  entityId: string,
): Promise<any[]> {
  try {
    const result = await query(
      'SELECT * FROM public.change_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY changed_at DESC',
      [entityType, entityId],
    )
    return result.rows
  } catch (error) {
    logger.warn('[changeLogs.getEntityLogs] query failed', { error, entityType, entityId })
    return []
  }
}

const HUMAN_CHANGE_SOURCES = [
  'manual_adjusted',
  'user_save',
  'user_confirm',
  'force_action',
  'high_privilege_correction',
  'approved_correction',
]

export async function hasManualEdit(entityType: ChangeLogEntityType, entityId: string): Promise<boolean> {
  try {
    const normalizedSources = [...new Set(HUMAN_CHANGE_SOURCES.map(normalizeChangeSource))]
    const result = await query(
      'SELECT id FROM public.change_logs WHERE entity_type = $1 AND entity_id = $2 AND change_source = ANY($3::text[]) LIMIT 1',
      [entityType, entityId, normalizedSources],
    )
    return result.rows.length > 0
  } catch {
    return false
  }
}

export async function hasChangeLog(params: HasChangeLogParams): Promise<boolean> {
  try {
    const where = ['entity_type = $1', 'entity_id = $2', 'field_name = $3']
    const values: unknown[] = [params.entity_type, params.entity_id, params.field_name]

    if (params.new_value !== undefined) {
      values.push(params.new_value != null ? String(params.new_value) : null)
      where.push(`new_value IS NOT DISTINCT FROM $${values.length}`)
    }
    if (params.change_source) {
      values.push(normalizeChangeSource(params.change_source))
      where.push(`change_source = $${values.length}`)
    }
    if (params.change_reason !== undefined) {
      values.push(params.change_reason ?? null)
      where.push(`change_reason IS NOT DISTINCT FROM $${values.length}`)
    }

    const result = await query(
      `SELECT id FROM public.change_logs WHERE ${where.join(' AND ')} LIMIT 1`,
      values,
    )
    return result.rows.length > 0
  } catch (error) {
    logger.warn('[changeLogs.hasChangeLog] query failed; treating as absent', { error, params })
    return false
  }
}
