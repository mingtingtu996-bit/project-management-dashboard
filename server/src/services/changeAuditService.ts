// v1.4.14: Unified change audit write guard
// Normalizes change_source, enforces action_type dictionary, separates business from technical audit

import { supabase } from './dbService.js'
import { randomUUID } from 'crypto'
import { logger } from '../middleware/logger.js'
import { isDatabaseTransactionActive, query } from '../database.js'

// ============================================================
// Standard change_source values
// ============================================================
export const STANDARD_CHANGE_SOURCES = [
  'system_auto',
  'user_save',
  'user_confirm',
  'force_action',
  'high_privilege_correction',
  'approved_correction',
  'imported',
  'backfill',
  'algorithm_generated',
] as const

export type StandardChangeSource = (typeof STANDARD_CHANGE_SOURCES)[number]

const LEGACY_SOURCE_MAP: Record<string, StandardChangeSource> = {
  manual_adjusted: 'user_save',
  manual_edit: 'user_save',
  user_edit: 'user_save',
  manual_close_confirmation: 'user_confirm',
  manual_keep_processing: 'user_confirm',
  baseline_revision: 'user_confirm',
  monthly_plan_confirm: 'user_confirm',
  admin_force: 'force_action',
  force_unlock: 'force_action',
  force_close: 'force_action',
  approval: 'approved_correction',
  correction_request_approved: 'approved_correction',
  monthly_plan_correction: 'high_privilege_correction',
  baseline_correction: 'high_privilege_correction',
  admin_correction: 'high_privilege_correction',
  system: 'system_auto',
  auto: 'system_auto',
  system_generated: 'system_auto',
  scheduler: 'system_auto',
  import: 'imported',
  csv_import: 'imported',
  batch_import: 'imported',
  migration: 'backfill',
  data_backfill: 'backfill',
  legacy_migration: 'backfill',
}

export function normalizeChangeSource(raw?: string | null): StandardChangeSource {
  const normalized = String(raw ?? '').trim().toLowerCase()
  if (!normalized) return 'system_auto'
  const mapped = LEGACY_SOURCE_MAP[normalized]
  if (mapped) return mapped
  if ((STANDARD_CHANGE_SOURCES as readonly string[]).includes(normalized)) {
    return normalized as StandardChangeSource
  }
  return 'system_auto'
}

// ============================================================
// Action group classification
// ============================================================
export type ChangeActionGroup = 'create' | 'edit' | 'delete' | 'confirm' | 'auto' | 'governance' | 'import'

export interface WriteChangeLogInput {
  projectId: string
  entityType: string
  entityId: string
  actionType?: string
  actionGroup?: ChangeActionGroup
  fieldName?: string
  oldValue?: string | null
  newValue?: string | null
  changeReason?: string | null
  changeSource?: string | null
  changedBy?: string | null
  beforeSnapshot?: Record<string, unknown>
  afterSnapshot?: Record<string, unknown>
  metadata?: Record<string, unknown>
  requestId?: string
  visibility?: 'internal' | 'governance' | 'user'
}

export async function writeChangeLog(input: WriteChangeLogInput): Promise<string | null> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const normalizedSource = normalizeChangeSource(input.changeSource)
  const transactional = isDatabaseTransactionActive()

  try {
    await query(
      `INSERT INTO public.change_logs (
         id, project_id, entity_type, entity_id, action_type, action_group,
         field_name, old_value, new_value, change_reason, change_source, changed_by, changed_at,
         before_snapshot, after_snapshot, metadata, request_id, visibility,
         retention_policy
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13,
         $14::jsonb, $15::jsonb, $16::jsonb, $17, $18,
         $19
       )`,
      [
        id,
        input.projectId,
        input.entityType,
        input.entityId,
        input.actionType ?? 'field_update',
        input.actionGroup ?? 'edit',
        input.fieldName ?? input.actionType ?? 'record',
        input.oldValue ?? null,
        input.newValue ?? null,
        input.changeReason ?? null,
        normalizedSource,
        input.changedBy ?? null,
        now,
        JSON.stringify(input.beforeSnapshot ?? {}),
        JSON.stringify(input.afterSnapshot ?? {}),
        JSON.stringify(input.metadata ?? {}),
        input.requestId ?? null,
        input.visibility ?? 'internal',
        'project_lifecycle',
      ],
    )
    return id
  } catch (error) {
    logger.error('Failed to write change_log', { error, input })
    if (transactional) throw error
    return null
  }
}

export async function writeChangeLogs(inputs: WriteChangeLogInput[]): Promise<string[]> {
  const ids: string[] = []
  for (const input of inputs) {
    const id = await writeChangeLog(input)
    if (id) ids.push(id)
  }
  return ids
}

// ============================================================
// Operation log boundary: technical audit only
// ============================================================
export interface WriteOperationLogInput {
  userId?: string | null
  action: string
  resource: string
  resourceId?: string | null
  method?: string
  path?: string
  statusCode?: number
  ip?: string
  userAgent?: string
  requestBody?: unknown
  error?: string | null
  severity?: 'info' | 'warning' | 'error' | 'critical'
}

export async function writeOperationLog(input: WriteOperationLogInput): Promise<string | null> {
  const id = randomUUID()
  const now = new Date().toISOString()
  const { error } = await (supabase as any).from('operation_logs').insert({
    id,
    user_id: input.userId ?? null,
    action: input.action,
    resource: input.resource,
    resource_id: input.resourceId ?? null,
    method: input.method ?? null,
    path: input.path ?? null,
    status_code: input.statusCode ?? null,
    ip_address: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    request_body: input.requestBody ? JSON.stringify(input.requestBody) : null,
    error_message: input.error ?? null,
    audit_domain: 'technical',
    severity: input.severity ?? 'info',
    created_at: now,
  })

  if (error) {
    logger.error('Failed to write operation_log', { error })
    return null
  }
  return id
}

// ============================================================
// Utility: check if a change was made by a human (not system)
// ============================================================
export function isHumanAction(changeSource?: string | null): boolean {
  const humanSourceTypes: StandardChangeSource[] = ['user_save', 'user_confirm', 'force_action', 'high_privilege_correction', 'approved_correction']
  return humanSourceTypes.includes(normalizeChangeSource(changeSource))
}
