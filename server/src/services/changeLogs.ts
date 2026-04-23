// changeLogs.ts —— 变更记录写入服务骨架
// 10.2a-a-impl 建立基础 writeLog() 方法；完整接线在 10.2b 中落地。
// 当前已接入：admin_force（强制解除条件）、approval（延期审批通过）

import { supabase } from './dbService.js'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../middleware/logger.js'
import { broadcastRealtimeEvent } from './realtimeServer.js'

export type ChangeLogEntityType =
  | 'task'
  | 'risk'
  | 'issue'
  | 'delay_request'
  | 'milestone'
  | 'project_material'
  | 'monthly_plan'
  | 'baseline'
  | 'planning_governance'
  | 'task_condition'
  | 'task_obstacle'

export type ChangeSource =
  | 'system_auto'
  | 'manual_adjusted'
  | 'manual_close_confirmation'
  | 'manual_keep_processing'
  | 'admin_force'
  | 'approval'
  | 'monthly_plan_correction'
  | 'baseline_revision'

export interface WriteLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  field_name: string
  old_value?: string | number | boolean | null
  new_value?: string | number | boolean | null
  change_reason?: string | null
  changed_by?: string | null
  change_source?: ChangeSource
}

export interface WriteStatusTransitionLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  old_status?: string | null
  new_status: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}

export interface WriteLifecycleLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  action: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}

export interface HasChangeLogParams {
  entity_type: ChangeLogEntityType
  entity_id: string
  field_name: string
  new_value?: string | number | boolean | null
  change_source?: ChangeSource
  change_reason?: string | null
}

/**
 * 写入一条变更记录。
 * 失败时仅 warn，不抛出，避免阻断主业务链路。
 */
export async function writeLog(params: WriteLogParams): Promise<void> {
  try {
    const row = {
      id: uuidv4(),
      project_id: params.project_id ?? null,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: params.field_name,
      old_value: params.old_value != null ? String(params.old_value) : null,
      new_value: params.new_value != null ? String(params.new_value) : null,
      change_reason: params.change_reason ?? null,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
      changed_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('change_logs').insert(row)
    if (error) {
      logger.warn('[changeLogs.writeLog] 写入失败，降级跳过', { error: error.message, params })
    } else if (params.project_id) {
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
  } catch (err) {
    logger.warn('[changeLogs.writeLog] 异常，降级跳过', { err, params })
  }
}

/**
 * 批量写入变更记录（事务场景，如延期审批通过副作用链）。
 * 任一条写入失败时仅 warn，不影响其他条目写入。
 */
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

/**
 * 查询某实体的全部变更记录（按时间倒序）。
 */
export async function getEntityLogs(
  entityType: ChangeLogEntityType,
  entityId: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('change_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('changed_at', { ascending: false })
  if (error) {
    logger.warn('[changeLogs.getEntityLogs] 查询失败', { error: error.message })
    return []
  }
  return data ?? []
}

/**
 * 判断某 risk 实体是否曾被人工编辑过（§1.2 自动闭合条件用）。
 * 通过 change_logs 中是否存在 entity_type='risk' AND entity_id=? 来判定。
 * 不新增 is_manually_edited 字段。
 */
export async function hasManualEdit(entityType: ChangeLogEntityType, entityId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('change_logs')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('change_source', 'manual_adjusted')
    .limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

export async function hasChangeLog(params: HasChangeLogParams): Promise<boolean> {
  try {
    let query = supabase
      .from('change_logs')
      .select('id')
      .eq('entity_type', params.entity_type)
      .eq('entity_id', params.entity_id)
      .eq('field_name', params.field_name)
      .limit(1)

    if (params.new_value !== undefined) {
      query = query.eq('new_value', params.new_value != null ? String(params.new_value) : null)
    }
    if (params.change_source) {
      query = query.eq('change_source', params.change_source)
    }
    if (params.change_reason !== undefined) {
      query = query.eq('change_reason', params.change_reason ?? null)
    }

    const { data, error } = await query
    if (error) {
      logger.warn('[changeLogs.hasChangeLog] 查询失败，降级为不存在', { error: error.message, params })
      return false
    }
    return (data ?? []).length > 0
  } catch (err) {
    logger.warn('[changeLogs.hasChangeLog] 异常，降级为不存在', { err, params })
    return false
  }
}
