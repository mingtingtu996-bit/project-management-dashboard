import { v4 as uuidv4 } from 'uuid'

import { query as rawQuery } from '../database.js'
import { loadCoveredTaskIdsByAcceptancePlanIds } from './acceptancePlanTaskLinkService.js'
import { logger } from '../middleware/logger.js'
import type { Issue, Notification, Risk, Warning } from '../types/db.js'
import {
  createIssue as dbCreateIssue,
  createRisk as dbCreateRisk,
  getIssue as dbGetIssue,
  getRisk as dbGetRisk,
  getMembers,
  supabase,
  updateIssue as dbUpdateIssue,
  updateRisk as dbUpdateRisk,
} from './dbService.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import {
  buildIssuePendingManualClosePatch,
  buildRiskPendingManualClosePatch,
  buildRiskSourceResolvedAutoClosePatch,
  computeDynamicIssuePriority,
  getIssueBasePriority,
  isProtectedIssueRecord,
  isProtectedRiskRecord,
} from './workflowDomainPolicy.js'
import {
  acceptanceStatusLabel as getAcceptanceStatusLabel,
  ACTIVE_ACCEPTANCE_STATUSES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import { getRiskIssueWarningLifecycleThresholdMs } from './riskIssueWarningRuleRegistry.js'
import {
  resolveProjectBusinessDateBuckets,
  type ProjectBusinessDateBucket,
} from './projectBusinessDateService.js'

const WARNING_SOURCE_ENTITY_TYPE = 'warning'
const ACTIVE_WARNING_STATUSES = new Set(['active', 'acknowledged', 'muted', 'unread'])
const ESCALATED_WARNING_STATUSES = new Set(['escalated'])
const CLOSED_WARNING_STATUSES = new Set(['resolved', 'archived', 'closed'])

type WarningNotificationRecord = Notification & {
  chain_id?: string | null
  first_seen_at?: string | null
  acknowledged_at?: string | null
  muted_until?: string | null
  escalated_to_risk_id?: string | null
  escalated_at?: string | null
  is_escalated?: boolean | null
  resolved_at?: string | null
  resolved_source?: string | null
  warning_lifecycle_status?: string | null
}

interface WarningAcknowledgmentRow {
  id?: string
  user_id: string
  project_id?: string | null
  task_id?: string | null
  warning_type: string
  warning_signature: string
  acked_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function nowIso() {
  return new Date().toISOString()
}

export type ExpiredIssueSyncOptions = {
  now?: Date
}

function scopeQueryToProjectIds(query: any, field: string, projectIds: string[]) {
  if (projectIds.length === 0) return query
  if (projectIds.length === 1) return query.eq(field, projectIds[0])
  return query.in(field, projectIds)
}

function uniqueRecipients(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

import { buildWarningNaturalKey, buildWarningSignature } from '../utils/warningSignature.js'

function warningDay(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return (normalized || nowIso()).slice(0, 10)
}

function addHours(value: string | Date, hours: number) {
  const next = new Date(value)
  next.setTime(next.getTime() + hours * 60 * 60 * 1000)
  return next.toISOString()
}

function isFuture(value?: string | null) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

function normalizeStatus(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function readRecord(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function warningRoutingMetadata(warning: Warning) {
  return readRecord(readRecord((warning as any).metadata).routing)
}

async function isTaskCompleted(taskId?: string | null, projectId?: string | null) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return false

  let query = supabase
    .from('tasks')
    .select('status, progress')
    .eq('id', normalizedTaskId)
  if (projectId) {
    query = query.eq('project_id', projectId)
  }
  const { data, error } = await query.limit(1)

  if (error) throw new Error(error.message)
  const row = ((data ?? [])[0] ?? null) as { status?: string | null; progress?: number | null } | null
  if (!row) return false

  const status = normalizeStatus(row.status)
  return status === 'completed' || status === '已完成' || Number(row.progress ?? 0) >= 100
}

async function inferResolvedSource(notification: WarningNotificationRecord): Promise<string> {
  if (await isTaskCompleted(notification.task_id ?? null, notification.project_id ?? null)) {
    return 'task_completed'
  }

  switch (warningCategory(notification)) {
    case 'condition_due':
      return 'condition_satisfied'
    case 'obstacle_timeout':
      return 'obstacle_resolved'
    case 'delay_exceeded':
      return 'delay_condition_cleared'
    case 'acceptance_expired':
      return 'acceptance_progressed'
    case 'critical_path_stagnation':
      return 'critical_path_recovered'
    case 'permit_expiry':
      return 'permit_progressed'
    case 'progress_deviation':
      return 'progress_recovered'
    default:
      return 'source_cleared'
  }
}

function normalizeAcceptancePlanStatus(value?: string | null) {
  return normalizeAcceptanceStatus(value)
}

function acceptanceStatusLabel(value?: string | null) {
  return getAcceptanceStatusLabel(value)
}

function getAcceptancePlanLabel(plan: {
  acceptance_name?: string | null
  plan_name?: string | null
  type_name?: string | null
  id?: string | null
}) {
  return String(plan.acceptance_name ?? plan.plan_name ?? plan.type_name ?? plan.id ?? '未命名验收').trim() || '未命名验收'
}

function getAcceptanceTypeLabel(plan: {
  type_name?: string | null
  acceptance_type?: string | null
}) {
  return String(plan.type_name ?? plan.acceptance_type ?? '验收').trim() || '验收'
}

function normalizeWarningLevel(value?: string | null): Warning['warning_level'] {
  const level = normalizeStatus(value)
  if (level === 'critical') return 'critical'
  if (level === 'info') return 'info'
  return 'warning'
}

function severityRank(level?: string | null) {
  if (normalizeWarningLevel(level) === 'critical') return 3
  if (normalizeWarningLevel(level) === 'warning') return 2
  return 1
}

function warningIdentityFromNotification(notification: Partial<WarningNotificationRecord>) {
  if (notification.source_entity_type === WARNING_SOURCE_ENTITY_TYPE && notification.source_entity_id) {
    return String(notification.source_entity_id)
  }

  return buildWarningSignature({
    project_id: notification.project_id ?? '',
    task_id: notification.task_id ?? undefined,
    warning_type: notification.category ?? notification.type ?? '',
    created_at: notification.first_seen_at ?? notification.created_at ?? undefined,
  })
}

function warningNaturalKeyFromNotification(notification: Partial<WarningNotificationRecord>) {
  const originalSource = warningOriginalSourceIdentityFromNotification(notification)
  return buildWarningNaturalKey({
    project_id: notification.project_id ?? '',
    task_id: notification.task_id ?? undefined,
    warning_type: notification.category ?? notification.type ?? '',
    source_entity_type: originalSource?.sourceEntityType,
    source_entity_id: originalSource?.sourceEntityId,
  })
}

function parseSourceIdentityFromSourceKey(sourceKey?: string | null) {
  const normalized = String(sourceKey ?? '').trim()
  const separatorIndex = normalized.indexOf(':')
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) return null
  return {
    sourceEntityType: normalized.slice(0, separatorIndex),
    sourceEntityId: normalized.slice(separatorIndex + 1),
  }
}

function warningOriginalSourceIdentityFromNotification(notification: Partial<WarningNotificationRecord>) {
  const category = warningCategory(notification)
  const sourceHash = String((notification as any).source_hash ?? '').trim()
  if (category && sourceHash.startsWith(`${category}:`)) {
    const parsed = parseSourceIdentityFromSourceKey(sourceHash.slice(category.length + 1))
    if (parsed) return parsed
  }

  const signature = String(notification.warning_signature ?? notification.source_entity_id ?? '').trim()
  const signatureParts = signature.split('|')
  if (signatureParts.length >= 3 && (!category || signatureParts[0] === category)) {
    const parsed = parseSourceIdentityFromSourceKey(signatureParts.slice(1, -1).join('|'))
    if (parsed) return parsed
  }

  return null
}

function isPersistedWarningRow(notification: Partial<WarningNotificationRecord>) {
  if (notification.source_entity_type !== WARNING_SOURCE_ENTITY_TYPE) return false
  if (notification.type === 'warning_acknowledged') return false
  return Boolean(notification.category || notification.type)
}

async function listWarningAcknowledgments(userId: string, projectId?: string) {
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      const params: unknown[] = [userId]
      const projectFilter = projectId ? ' AND project_id = $2' : ''
      if (projectId) params.push(projectId)
      const result = await rawQuery(
        `SELECT *
           FROM public.warning_acknowledgments
          WHERE user_id = $1${projectFilter}`,
        params,
      )
      return (result.rows ?? []) as WarningAcknowledgmentRow[]
    } catch (error) {
      logger.warn('[upgradeChainService] direct warning acknowledgment read failed; falling back to Supabase REST', {
        userId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let query = supabase
    .from('warning_acknowledgments')
    .select('*')
    .eq('user_id', userId)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as WarningAcknowledgmentRow[]
}

async function upsertWarningAcknowledgment(
  notification: WarningNotificationRecord,
  userId?: string | null,
  ackedAt: string = nowIso(),
) {
  if (!userId) return

  const row: WarningAcknowledgmentRow = {
    user_id: userId,
    project_id: notification.project_id ?? null,
    task_id: notification.task_id ?? null,
    warning_type: warningCategory(notification),
    warning_signature: warningIdentityFromNotification(notification),
    acked_at: ackedAt,
    updated_at: ackedAt,
  }

  const { error } = await supabase.from('warning_acknowledgments').upsert(row, {
    onConflict: 'user_id,warning_signature',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(error.message)
}

function warningCategory(notification: Partial<WarningNotificationRecord>) {
  return String(notification.category ?? notification.type ?? '').trim()
}

function deriveRiskCategory(warningType: string): Risk['category'] {
  if (warningType.includes('delay')) return 'schedule'
  if (warningType.includes('acceptance')) return 'external'
  if (warningType.includes('obstacle')) return 'resource'
  if (warningType.includes('permit')) return 'external'
  return 'technical'
}

function mapWarningLevelToRiskLevel(level?: string | null): Risk['level'] {
  const normalized = normalizeWarningLevel(level)
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'high'
  return 'medium'
}

function mapRiskLevelToIssueSeverity(level?: string | null): Issue['severity'] {
  const normalized = normalizeStatus(level)
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'low') return 'low'
  return 'medium'
}

function getRiskProbabilityImpact(level: Risk['level']) {
  if (level === 'critical') return { probability: 90, impact: 90 }
  if (level === 'high') return { probability: 75, impact: 75 }
  if (level === 'low') return { probability: 30, impact: 30 }
  return { probability: 60, impact: 60 }
}

function shouldResetWarningWindow(existing: Partial<WarningNotificationRecord>, warning: Warning) {
  const existingNaturalKey = warningNaturalKeyFromNotification(existing)
  const incomingNaturalKey = buildWarningNaturalKey(warning)
  if (existingNaturalKey === incomingNaturalKey) return false
  return severityRank(warning.warning_level) > severityRank(existing.severity)
}

async function fetchWarningNotificationById(projectId: string, id: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', id)
    .eq('project_id', projectId)
    .eq('source_entity_type', WARNING_SOURCE_ENTITY_TYPE)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data as WarningNotificationRecord
}

async function fetchRiskById(projectId: string, id: string) {
  const { data, error } = await supabase
    .from('risks')
    .select('*')
    .eq('id', id)
    .eq('project_id', projectId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data as Risk
}

async function fetchIssueById(id: string) {
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data as Issue
}

function normalizeObstacleIssueSeverity(value?: string | null): Issue['severity'] {
  const normalized = normalizeStatus(value)
  if (['critical', '严重'].includes(normalized)) return 'critical'
  if (['high', '高'].includes(normalized)) return 'high'
  if (['low', '低'].includes(normalized)) return 'low'
  return 'medium'
}

function buildObstacleIssueTitle(obstacle: {
  title?: string | null
  description?: string | null
}) {
  const label = String(obstacle.title ?? obstacle.description ?? '未命名阻碍').trim()
  return `阻碍升级为问题：${label || '未命名阻碍'}`
}

function buildObstacleIssueDescription(obstacle: {
  description?: string | null
  title?: string | null
}) {
  const label = String(obstacle.description ?? obstacle.title ?? '该阻碍已升级为正式问题，请持续跟进处理').trim()
  return label || '该阻碍已升级为正式问题，请持续跟进处理'
}

function isDelayWarningToken(value?: string | null) {
  return String(value ?? '').trim().toLowerCase().includes('delay')
}

async function markRiskPendingManualCloseForResolvedWarning(notification: WarningNotificationRecord) {
  if (!notification.escalated_to_risk_id) return

  const risk = await dbGetRisk(notification.escalated_to_risk_id)
  if (!risk) return
  if (risk.linked_issue_id || risk.pending_manual_close || risk.status === 'closed') return
  if (risk.source_type !== 'warning_auto_escalated') return

  await dbUpdateRisk(risk.id, buildRiskPendingManualClosePatch(), risk.version, 'system_auto')
}

export async function closeDelaySourceRisksForCompletedTask(taskId: string, projectId: string) {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return []
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) throw new Error('delay source risk close requires projectId')

  const { data: warningRows, error: warningError } = await supabase
    .from('notifications')
    .select('id, type, category')
    .eq('project_id', normalizedProjectId)
    .eq('source_entity_type', WARNING_SOURCE_ENTITY_TYPE)
    .eq('task_id', normalizedTaskId)

  if (warningError) throw new Error(warningError.message)

  const delayWarningIds = new Set(
    ((warningRows ?? []) as Array<Record<string, unknown>>)
      .filter((row) => isDelayWarningToken(String(row.category ?? row.type ?? '')))
      .map((row) => String(row.id ?? '').trim())
      .filter(Boolean),
  )

  if (delayWarningIds.size === 0) return []

  const { data: riskRows, error: riskError } = await supabase
    .from('risks')
    .select('*')
    .eq('project_id', normalizedProjectId)
    .eq('task_id', normalizedTaskId)
    .eq('source_entity_type', WARNING_SOURCE_ENTITY_TYPE)
    .in('status', ['identified', 'mitigating'])

  if (riskError) throw new Error(riskError.message)

  const closed: Risk[] = []
  for (const row of (riskRows ?? []) as Risk[]) {
    const sourceId = String(row.source_id ?? '').trim()
    const sourceEntityId = String(row.source_entity_id ?? '').trim()
    const isDelaySource = delayWarningIds.has(sourceId) || delayWarningIds.has(sourceEntityId)
    if (!isDelaySource) continue
    if (row.linked_issue_id || row.pending_manual_close || row.status === 'closed') continue

    const updated = await dbUpdateRisk(
      row.id,
      buildRiskSourceResolvedAutoClosePatch({ taskId: normalizedTaskId }),
      row.version,
      'system_auto',
    )
    if (updated) closed.push(updated)
  }

  return closed
}

async function invokeRpc<T>(fn: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) throw new Error(error.message)
  return data as T
}

async function listWarningNotifications(projectId?: string) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('source_entity_type', WARNING_SOURCE_ENTITY_TYPE)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as WarningNotificationRecord[]).filter(isPersistedWarningRow)
}

async function getOwnerRecipients(projectId?: string | null) {
  if (!projectId) return []
  const members = await getMembers(projectId)
  return uniqueRecipients(
    members
      .filter((member) => member.permission_level === 'owner')
      .map((member) => member.user_id),
  )
}

async function getDirectTaskRecipient(projectId: string, taskId?: string | null) {
  if (!projectId || !taskId) return null
  const { data, error } = await supabase
    .from('tasks')
    .select('assignee_user_id, assignee_id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  const value = String((data as Record<string, unknown> | null)?.assignee_user_id ?? (data as Record<string, unknown> | null)?.assignee_id ?? '').trim()
  return value || null
}

async function getParticipantUnitRecipients(ownerUnitId?: string | null) {
  const normalizedUnitId = String(ownerUnitId ?? '').trim()
  if (!normalizedUnitId) return []

  const { data, error } = await supabase
    .from('participant_unit_members')
    .select('user_id')
    .eq('participant_unit_id', normalizedUnitId)

  if (error) {
    logger.warn('[upgradeChain] participant unit recipient lookup failed', {
      ownerUnitId: normalizedUnitId,
      error: error.message,
    })
    return []
  }

  return uniqueRecipients(
    ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => String(row.user_id ?? '').trim()),
  )
}

type WarningRecipientResolver = {
  getOwnerRecipients: typeof getOwnerRecipients
  getDirectTaskRecipient: typeof getDirectTaskRecipient
  getParticipantUnitRecipients: typeof getParticipantUnitRecipients
}

export type WarningRecipientLookupKind = 'owner_project' | 'direct_task' | 'participant_unit'

export type WarningRecipientLookupTelemetryEvent = {
  lookupKind: WarningRecipientLookupKind
  cacheKey: string
  cacheHit: boolean
}

export type WarningNotificationSyncOptions = {
  onRecipientLookup?: (event: WarningRecipientLookupTelemetryEvent) => void
  writeConcurrency?: number
}

const DEFAULT_WARNING_NOTIFICATION_WRITE_CONCURRENCY = 8

function normalizeWarningNotificationWriteConcurrency(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_WARNING_NOTIFICATION_WRITE_CONCURRENCY
  return Math.max(1, Math.min(32, Math.trunc(parsed)))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(items.length, normalizeWarningNotificationWriteConcurrency(concurrency))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

const defaultWarningRecipientResolver: WarningRecipientResolver = {
  getOwnerRecipients,
  getDirectTaskRecipient,
  getParticipantUnitRecipients,
}

function createWarningRecipientResolverCache(options: WarningNotificationSyncOptions = {}): WarningRecipientResolver {
  const ownerRecipientsByProjectId = new Map<string, Promise<string[]>>()
  const directTaskRecipientByProjectAndTask = new Map<string, Promise<string | null>>()
  const unitRecipientsByUnitId = new Map<string, Promise<string[]>>()

  const emitLookup = (event: WarningRecipientLookupTelemetryEvent) => {
    options.onRecipientLookup?.(event)
  }

  return {
    getOwnerRecipients(projectId?: string | null) {
      const normalizedProjectId = String(projectId ?? '').trim()
      if (!normalizedProjectId) return Promise.resolve([])

      let cached = ownerRecipientsByProjectId.get(normalizedProjectId)
      emitLookup({
        lookupKind: 'owner_project',
        cacheKey: normalizedProjectId,
        cacheHit: Boolean(cached),
      })
      if (!cached) {
        cached = getOwnerRecipients(normalizedProjectId)
        ownerRecipientsByProjectId.set(normalizedProjectId, cached)
      }
      return cached
    },
    getDirectTaskRecipient(projectId: string, taskId?: string | null) {
      const normalizedProjectId = String(projectId ?? '').trim()
      const normalizedTaskId = String(taskId ?? '').trim()
      if (!normalizedProjectId || !normalizedTaskId) return Promise.resolve(null)
      const scopedCacheKey = `${normalizedProjectId}:${normalizedTaskId}`

      let cached = directTaskRecipientByProjectAndTask.get(scopedCacheKey)
      emitLookup({
        lookupKind: 'direct_task',
        cacheKey: normalizedTaskId,
        cacheHit: Boolean(cached),
      })
      if (!cached) {
        cached = getDirectTaskRecipient(normalizedProjectId, normalizedTaskId)
        directTaskRecipientByProjectAndTask.set(scopedCacheKey, cached)
      }
      return cached
    },
    getParticipantUnitRecipients(ownerUnitId?: string | null) {
      const normalizedUnitId = String(ownerUnitId ?? '').trim()
      if (!normalizedUnitId) return Promise.resolve([])

      let cached = unitRecipientsByUnitId.get(normalizedUnitId)
      emitLookup({
        lookupKind: 'participant_unit',
        cacheKey: normalizedUnitId,
        cacheHit: Boolean(cached),
      })
      if (!cached) {
        cached = getParticipantUnitRecipients(normalizedUnitId)
        unitRecipientsByUnitId.set(normalizedUnitId, cached)
      }
      return cached
    },
  }
}

async function resolveWarningRecipients(
  warning: Warning,
  recipientResolver: WarningRecipientResolver = defaultWarningRecipientResolver,
) {
  const routing = warningRoutingMetadata(warning)
  if (routing.strategy === 'responsibility_owner' && routing.ownerUnitId) {
    const unitRecipients = await recipientResolver.getParticipantUnitRecipients(String(routing.ownerUnitId))
    if (unitRecipients.length > 0) return unitRecipients
  }

  const ownerRecipients = await recipientResolver.getOwnerRecipients(warning.project_id)
  const directTaskRecipient = await recipientResolver.getDirectTaskRecipient(warning.project_id, warning.task_id ?? null)

  if (warning.warning_type === 'critical_path_delay') {
    if (warning.warning_level === 'info') {
      return directTaskRecipient ? [directTaskRecipient] : ownerRecipients
    }
    return ownerRecipients.length > 0 ? ownerRecipients : (directTaskRecipient ? [directTaskRecipient] : [])
  }

  if (directTaskRecipient) return [directTaskRecipient]
  return ownerRecipients
}

async function upsertWarningNotification(
  warning: Warning,
  existing?: WarningNotificationRecord | null,
  recipientResolver: WarningRecipientResolver = defaultWarningRecipientResolver,
) {
  const timestamp = nowIso()
  const warningSignature = buildWarningSignature(warning)
  const nextChainId = existing?.chain_id || uuidv4()
  const resetWindow = existing ? shouldResetWarningWindow(existing, warning) : false
  const nextFirstSeenAt = resetWindow ? timestamp : existing?.first_seen_at || warning.created_at || timestamp
  const nextAcknowledgedAt = resetWindow ? null : existing?.acknowledged_at ?? null
  const nextMutedUntil = resetWindow ? null : existing?.muted_until ?? null
  const recipients = await resolveWarningRecipients(warning, recipientResolver)
  // v1.4.12: lifecycle status driven by governance, not personal ack
  const lifecycleStatus = existing?.is_escalated
    ? 'escalated'
    : existing?.warning_lifecycle_status === 'acknowledged'
      ? 'acknowledged'
      : nextMutedUntil && isFuture(nextMutedUntil)
        ? 'muted'
        : 'active'

  // Legacy status for notification reading state (kept for backward compat)
  const nextStatus = existing?.is_escalated
    ? 'escalated'
    : nextMutedUntil && isFuture(nextMutedUntil)
      ? 'muted'
      : nextAcknowledgedAt
        ? 'acknowledged'
        : 'active'

  const row = {
    id: existing?.id || uuidv4(),
    project_id: warning.project_id,
    type: warning.warning_type,
    notification_type: 'business-warning',
    severity: warning.warning_level,
    title: warning.title,
    content: warning.description,
    is_read: nextAcknowledgedAt ? 1 : 0,
    is_broadcast: warning.warning_level === 'critical',
    source_entity_type: WARNING_SOURCE_ENTITY_TYPE,
    source_entity_id: warningSignature,
    source_hash: `${warning.warning_type}:${warning.source_entity_type && warning.source_entity_id ? `${warning.source_entity_type}:${warning.source_entity_id}` : warning.task_id ?? warning.project_id ?? ''}`,
    warning_signature: warningSignature,
    warning_lifecycle_status: lifecycleStatus,
    category: warning.warning_type,
    task_id: warning.task_id ?? null,
    recipients,
    metadata: (warning as any).metadata ?? null,
    status: nextStatus,
    chain_id: nextChainId,
    first_seen_at: nextFirstSeenAt,
    acknowledged_at: nextAcknowledgedAt,
    muted_until: nextMutedUntil,
    escalated_to_risk_id: existing?.escalated_to_risk_id ?? null,
    escalated_at: existing?.escalated_at ?? null,
    is_escalated: existing?.is_escalated ?? false,
    resolved_at: null,
    resolved_source: null,
    created_at: existing?.created_at || warning.created_at || timestamp,
    updated_at: timestamp,
  }

  if (existing) {
    const { error } = await supabase
      .from('notifications')
      .update(row)
      .eq('id', existing.id)
      .eq('project_id', warning.project_id)
    if (error) throw new Error(error.message)
    return (await fetchWarningNotificationById(warning.project_id, row.id)) as WarningNotificationRecord
  }

  return await notificationTouchpointService.emit({
      ...row,
      is_read: Boolean(row.is_read),
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      dedupe_key: warningSignature,
      target_route: `/projects/${warning.project_id}/risks`,
      target_label: '查看风险预警',
    }) as WarningNotificationRecord
}

// buildWarningNaturalKey and buildWarningSignature re-exported from shared util
export { buildWarningNaturalKey, buildWarningSignature } from '../utils/warningSignature.js'

export function notificationToWarning(notification: WarningNotificationRecord): Warning {
  return {
    id: notification.id,
    project_id: notification.project_id,
    task_id: notification.task_id ?? undefined,
    warning_signature: warningIdentityFromNotification(notification),
    warning_type: warningCategory(notification),
    warning_level: normalizeWarningLevel(notification.severity),
    title: notification.title,
    description: notification.content,
    is_acknowledged: Boolean(notification.acknowledged_at),
    created_at: notification.first_seen_at || notification.created_at,
    updated_at: notification.updated_at,
    first_seen_at: notification.first_seen_at || notification.created_at,
    acknowledged_at: notification.acknowledged_at ?? null,
    muted_until: notification.muted_until ?? null,
    escalated_to_risk_id: notification.escalated_to_risk_id ?? null,
    escalated_at: notification.escalated_at ?? null,
    is_escalated: Boolean(notification.is_escalated),
    chain_id: notification.chain_id ?? null,
    status: String(notification.status ?? 'active'),
    resolved_source: notification.resolved_source ?? null,
  }
}

export function applyWarningAcknowledgments(
  warnings: Warning[],
  acknowledgments: WarningAcknowledgmentRow[],
) {
  const ackedAtBySignature = new Map(
    acknowledgments.map((row) => [String(row.warning_signature ?? ''), row.acked_at ?? row.updated_at ?? nowIso()]),
  )

  return warnings.map((warning) => {
    const signature = warning.warning_signature ?? buildWarningSignature(warning)
    const ackedAt = ackedAtBySignature.get(signature)
    if (!ackedAt) return warning

    const status = String(warning.status ?? '').trim().toLowerCase()
    if (['resolved', 'closed', 'archived', 'escalated'].includes(status)) {
      return warning
    }

    return {
      ...warning,
      warning_signature: signature,
      is_acknowledged: true,
      acknowledged_at: warning.acknowledged_at ?? ackedAt,
      status: warning.status === 'muted' ? 'muted' : 'acknowledged',
    }
  })
}

export async function loadAcknowledgedWarningsForUser(userId: string, projectId?: string) {
  return await listWarningAcknowledgments(userId, projectId)
}

export function isProtectedWarning(notification: Partial<WarningNotificationRecord>) {
  return Boolean(notification.is_escalated || notification.escalated_to_risk_id)
}

export function isProtectedRisk(risk: Partial<Risk>) {
  return isProtectedRiskRecord(risk)
}

export function isProtectedIssue(issue: Partial<Issue>) {
  return isProtectedIssueRecord(issue)
}

export async function syncWarningNotifications(
  warnings: Warning[],
  projectId?: string,
  options: WarningNotificationSyncOptions = {},
) {
  const existing = await listWarningNotifications(projectId)
  const existingBySignature = new Map(existing.map((item) => [warningIdentityFromNotification(item), item]))
  const existingByNaturalKey = new Map(existing.map((item) => [warningNaturalKeyFromNotification(item), item]))
  const recipientResolver = createWarningRecipientResolverCache(options)
  const activeSignatures = new Set<string>()
  const activeNaturalKeys = new Set<string>()
  const writeItems = warnings.map((warning) => {
    const signature = buildWarningSignature(warning)
    const naturalKey = buildWarningNaturalKey(warning)
    activeSignatures.add(signature)
    activeNaturalKeys.add(naturalKey)
    return { warning, signature, naturalKey }
  })

  const synced = await mapWithConcurrency(
    writeItems,
    normalizeWarningNotificationWriteConcurrency(options.writeConcurrency),
    async ({ warning, signature, naturalKey }) => {
      const row = await upsertWarningNotification(
        { ...warning, warning_signature: signature },
        existingBySignature.get(signature) ?? existingByNaturalKey.get(naturalKey) ?? null,
        recipientResolver,
      )
      return notificationToWarning(row)
    },
  )

  const timestamp = nowIso()
  for (const item of existing) {
    const signature = warningIdentityFromNotification(item)
    const naturalKey = warningNaturalKeyFromNotification(item)
    const status = normalizeStatus(item.status)
    if (activeSignatures.has(signature)) continue
    if (activeNaturalKeys.has(naturalKey)) continue
    if (CLOSED_WARNING_STATUSES.has(status) || ESCALATED_WARNING_STATUSES.has(status)) continue

    const resolvedSource = await inferResolvedSource(item)
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'resolved',
        warning_lifecycle_status: 'resolved',
        resolved_at: timestamp,
        resolved_source: resolvedSource,
        updated_at: timestamp,
      })
      .eq('id', item.id)
      .eq('project_id', item.project_id)

    if (error) throw new Error(error.message)
    await markRiskPendingManualCloseForResolvedWarning(item)
  }

  return synced.sort((left, right) => {
    const rankDiff = severityRank(right.warning_level) - severityRank(left.warning_level)
    if (rankDiff !== 0) return rankDiff
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
  })
}

export async function acknowledgeWarningNotification(projectId: string, id: string, userId?: string | null) {
  const warning = await fetchWarningNotificationById(projectId, id)
  if (!warning || !isPersistedWarningRow(warning)) return null

  const timestamp = nowIso()
  const { error } = await supabase
    .from('notifications')
    .update({
      acknowledged_at: timestamp,
      muted_until: null,
      status: 'acknowledged',
      is_read: 1,
      updated_at: timestamp,
    })
    .eq('id', id)
    .eq('project_id', warning.project_id)

  if (error) throw new Error(error.message)
  await upsertWarningAcknowledgment(warning, userId, timestamp)
  return await fetchWarningNotificationById(projectId, id)
}

export async function muteWarningNotification(projectId: string, id: string, hours = 24, userId?: string | null) {
  const warning = await fetchWarningNotificationById(projectId, id)
  if (!warning || !isPersistedWarningRow(warning)) return null

  const timestamp = nowIso()
  const mutedUntil = addHours(timestamp, hours)
  const { error } = await supabase
    .from('notifications')
    .update({
      muted_until: mutedUntil,
      status: 'muted',
      is_read: 0,
      updated_at: timestamp,
    })
    .eq('id', id)
    .eq('project_id', warning.project_id)

  if (error) throw new Error(error.message)
  await upsertWarningAcknowledgment(warning, userId, timestamp)
  return await fetchWarningNotificationById(projectId, id)
}

async function createRiskFromWarningAtomic(
  notification: WarningNotificationRecord,
  sourceType: Risk['source_type'],
  actorId?: string | null,
) {
  const severity = normalizeWarningLevel(notification.severity)
  const level = severity === 'critical' ? 'critical' : severity === 'warning' ? 'high' : 'medium'
  const probability = severity === 'critical' ? 90 : severity === 'warning' ? 75 : 60
  const impact = severity === 'critical' ? 90 : severity === 'warning' ? 75 : 50
  return await dbCreateRisk({
    project_id: notification.project_id,
    task_id: notification.task_id ?? null,
    title: notification.title,
    description: notification.content,
    level,
    probability,
    impact,
    status: 'identified',
    source_type: sourceType,
    source_id: notification.id,
    source_entity_type: 'warning',
    source_entity_id: notification.id,
    chain_id: notification.chain_id ?? null,
    created_by: actorId ?? null,
  })
}

export async function confirmWarningAsRisk(projectId: string, id: string, _actorId?: string) {
  const notification = await fetchWarningNotificationById(projectId, id)
  if (!notification || !isPersistedWarningRow(notification)) return null

  if (notification.escalated_to_risk_id) {
    return await fetchRiskById(projectId, notification.escalated_to_risk_id)
  }

  const risk = await createRiskFromWarningAtomic(notification, 'warning_converted', _actorId ?? null)
  if (!risk) return null
  await upsertWarningAcknowledgment(notification, _actorId ?? null)
  logger.info('[upgradeChain] warning escalated to risk', {
    warning_id: notification.id,
    risk_id: risk.id,
    source_type: 'warning_converted',
  })
  return risk
}

export async function autoEscalateWarnings(projectId?: string) {
  const warnings = await listWarningNotifications(projectId)
  const timestamp = Date.now()
  const createdRisks: Risk[] = []

  for (const warning of warnings) {
    if (warning.escalated_to_risk_id || warning.is_escalated) continue
    // v1.4.12: use warning_lifecycle_status for governance; personal ack does NOT pause escalation
    const lifecycle = (warning as any).warning_lifecycle_status ?? warning.status
    if (!ACTIVE_WARNING_STATUSES.has(normalizeStatus(lifecycle) || 'active')) continue
    if ((warning as any).warning_lifecycle_status === 'acknowledged') continue
    if ((warning as any).warning_lifecycle_status === 'muted') continue

    const firstSeenAt = new Date(warning.first_seen_at || warning.created_at).getTime()
    if (!Number.isFinite(firstSeenAt)) continue
    const thresholdMs = getRiskIssueWarningLifecycleThresholdMs('warning_to_risk')
    if (timestamp - firstSeenAt < thresholdMs) continue

    const risk = await createRiskFromWarningAtomic(warning, 'warning_auto_escalated')
    if (!risk) continue
    createdRisks.push(risk)
  }

  return createdRisks
}

async function listConditionExpiredIssues(projectId?: string) {
  let query = supabase
    .from('issues')
    .select('*')
    .eq('source_type', 'condition_expired')
    .eq('source_entity_type', 'task_condition')

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Issue[]
}

async function listAcceptanceExpiredIssues(projectId?: string) {
  let query = supabase
    .from('issues')
    .select('*')
    .eq('source_type', 'condition_expired')
    .eq('source_entity_type', 'acceptance_plan')

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Issue[]
}

export async function syncConditionExpiredIssues(projectId?: string, options: ExpiredIssueSyncOptions = {}) {
  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const dateBuckets = await resolveProjectBusinessDateBuckets(supabase as any, projectId, now)
  const data: Record<string, unknown>[] = []
  for (const bucket of dateBuckets) {
    let query = supabase
      .from('task_conditions')
      .select('id, task_id, name, target_date, tasks!inner(project_id, title)')
      .eq('is_satisfied', false)
      .lt('target_date', bucket.businessDate)
    query = scopeQueryToProjectIds(query, 'tasks.project_id', bucket.projectIds)

    const { data: rows, error } = await query
    if (error) throw new Error(error.message)
    data.push(...((rows ?? []) as Record<string, unknown>[]))
  }

  const existingIssues = await listConditionExpiredIssues(projectId)
  const existingByConditionId = new Map(
    existingIssues
      .filter((issue) => issue.status !== 'closed')
      .map((issue) => [String(issue.source_entity_id ?? issue.source_id ?? ''), issue]),
  )

  const created: Issue[] = []
  for (const row of data ?? []) {
    const conditionId = String((row as any).id)
    if (existingByConditionId.has(conditionId)) continue

    const issue = await dbCreateIssue({
      project_id: String((row as any).tasks?.project_id ?? ''),
      task_id: String((row as any).task_id ?? ''),
      title: `开工条件已过期：${String((row as any).name ?? '未命名条件')}`,
      description: `任务“${String((row as any).tasks?.title ?? '')}”的开工窗口已关闭，条件仍未满足。`,
      source_type: 'condition_expired',
      source_id: conditionId,
      source_entity_type: 'task_condition',
      source_entity_id: conditionId,
      chain_id: uuidv4(),
      severity: 'critical',
      priority: computeDynamicIssuePriority({
        source_type: 'condition_expired',
        severity: 'critical',
        created_at: timestamp,
        status: 'open',
        priority: getIssueBasePriority('condition_expired', 'critical'),
      }),
      pending_manual_close: false,
      status: 'open',
      closed_reason: null,
      closed_at: null,
      version: 1,
    })
    created.push(issue)
  }

  return created
}

export async function syncAcceptanceExpiredIssues(projectId?: string, options: ExpiredIssueSyncOptions = {}) {
  const now = options.now ?? new Date()
  const timestamp = now.toISOString()
  const dateBuckets = await resolveProjectBusinessDateBuckets(supabase as any, projectId, now)
  const data: Record<string, unknown>[] = []
  for (const bucket of dateBuckets) {
    let query = supabase
      .from('acceptance_plans')
      .select('id, project_id, acceptance_name, acceptance_type, type_name, planned_date, status')
      .in('status', [...ACTIVE_ACCEPTANCE_STATUSES])
      .lt('planned_date', bucket.businessDate)
    query = scopeQueryToProjectIds(query, 'project_id', bucket.projectIds)

    const { data: rows, error } = await query
    if (error) throw new Error(error.message)
    data.push(...((rows ?? []) as Record<string, unknown>[]))
  }
  const coveredTaskIdsByPlanId = await loadCoveredTaskIdsByAcceptancePlanIds(
    (data ?? []).map((row: any) => String(row.id ?? '')),
    projectId,
  )

  const existingIssues = await listAcceptanceExpiredIssues(projectId)
  const existingByPlanId = new Map(
    existingIssues
      .filter((issue) => issue.status !== 'closed')
      .map((issue) => [String(issue.source_entity_id ?? issue.source_id ?? ''), issue]),
  )

  const created: Issue[] = []
  for (const row of data ?? []) {
    const planId = String((row as any).id ?? '').trim()
    if (!planId || existingByPlanId.has(planId)) continue

    const planName = getAcceptancePlanLabel(row as any)
    const typeName = getAcceptanceTypeLabel(row as any)
    const plannedDate = String((row as any).planned_date ?? '').trim()
    const statusLabel = acceptanceStatusLabel((row as any).status)
    const linkedTaskId = coveredTaskIdsByPlanId.get(planId)?.[0] ?? null

    const issue = await dbCreateIssue({
      project_id: String((row as any).project_id ?? ''),
      task_id: linkedTaskId,
      title: `验收已逾期：${planName}`,
      description: `${typeName}“${planName}”计划于${plannedDate || '未设置日期'}完成，当前状态为${statusLabel}，已自动升级到问题主链。`,
      source_type: 'condition_expired',
      source_id: planId,
      source_entity_type: 'acceptance_plan',
      source_entity_id: planId,
      chain_id: uuidv4(),
      severity: 'critical',
      priority: computeDynamicIssuePriority({
        source_type: 'condition_expired',
        severity: 'critical',
        created_at: timestamp,
        status: 'open',
        priority: getIssueBasePriority('condition_expired', 'critical'),
      }),
      pending_manual_close: false,
      status: 'open',
      closed_reason: null,
      closed_at: null,
      version: 1,
    })
    created.push(issue)
  }

  return created
}

export async function ensureObstacleEscalatedIssue(obstacle: {
  id: string
  project_id?: string | null
  task_id?: string | null
  severity?: string | null
  status?: string | null
  title?: string | null
  description?: string | null
}) {
  const obstacleId = String(obstacle.id ?? '').trim()
  const projectId = String(obstacle.project_id ?? '').trim()
  if (!obstacleId || !projectId) return null

  const normalizedStatus = normalizeStatus(obstacle.status)
  if (['resolved', '已解决'].includes(normalizedStatus)) return null

  const severity = normalizeObstacleIssueSeverity(obstacle.severity)
  const title = buildObstacleIssueTitle(obstacle)
  const description = buildObstacleIssueDescription(obstacle)

  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('project_id', projectId)
    .eq('source_type', 'obstacle_escalated')
    .or(`source_id.eq.${obstacleId},source_entity_id.eq.${obstacleId}`)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const existing = ((data ?? []) as Issue[]).find((issue) => issue.status !== 'closed') ?? null
  const priority = computeDynamicIssuePriority({
    source_type: 'obstacle_escalated',
    severity,
    created_at: existing?.created_at ?? nowIso(),
    status: existing?.status ?? 'open',
    priority: getIssueBasePriority('obstacle_escalated', severity),
  })

  if (existing) {
    return await dbUpdateIssue(existing.id, {
      title,
      description,
      severity,
      priority,
      pending_manual_close: false,
      status: existing.status === 'resolved' ? 'investigating' : existing.status,
      closed_reason: null,
      closed_at: null,
    }, existing.version, 'system_auto')
  }

  return await dbCreateIssue({
    project_id: projectId,
    task_id: obstacle.task_id ?? null,
    title,
    description,
    source_type: 'obstacle_escalated',
    source_id: obstacleId,
    source_entity_type: 'task_obstacle',
    source_entity_id: obstacleId,
    chain_id: uuidv4(),
    severity,
    priority,
    pending_manual_close: false,
    status: 'open',
    closed_reason: null,
    closed_at: null,
    version: 1,
  })
}

export async function markObstacleEscalatedIssuePendingManualClose(obstacleId: string, projectId?: string | null) {
  if (!obstacleId) return []

  let query = supabase
    .from('issues')
    .select('*')
    .eq('source_type', 'obstacle_escalated')
    .or(`source_id.eq.${obstacleId},source_entity_id.eq.${obstacleId}`)
    .in('status', ['open', 'investigating'])
  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)

  const updated: Issue[] = []
  for (const row of (data ?? []) as Issue[]) {
    if (row.pending_manual_close) continue
    const next = await dbUpdateIssue(
      row.id,
      buildIssuePendingManualClosePatch(row),
      row.version,
      'system_auto',
    )
    if (next) updated.push(next)
  }

  return updated
}

export async function convertRiskToIssueAtomic(
  riskId: string,
  sourceType: Extract<Issue['source_type'], 'risk_converted' | 'risk_auto_escalated'>,
  overrides?: Partial<Pick<Issue, 'title' | 'description' | 'severity' | 'priority'>>,
) {
  const risk = await dbGetRisk(riskId)
  const effectiveSeverity = overrides?.severity ?? mapRiskLevelToIssueSeverity(risk?.level)
  const effectivePriority = overrides?.priority ?? computeDynamicIssuePriority({
    source_type: sourceType,
    severity: effectiveSeverity,
    created_at: risk?.created_at ?? nowIso(),
    status: 'open',
    priority: getIssueBasePriority(sourceType, effectiveSeverity),
  })
  if (!risk) return null
  return await dbCreateIssue({
    project_id: risk.project_id,
    task_id: risk.task_id ?? null,
    title: overrides?.title ?? risk.title,
    description: overrides?.description ?? risk.description ?? null,
    source_type: sourceType,
    source_id: riskId,
    source_entity_type: 'risk',
    source_entity_id: riskId,
    chain_id: risk.chain_id ?? null,
    severity: effectiveSeverity,
    priority: effectivePriority,
    pending_manual_close: false,
    status: 'open',
    closed_reason: null,
    closed_at: null,
    version: 1,
  })
}

export async function autoEscalateRisksToIssues(projectId?: string) {
  let query = supabase
    .from('risks')
    .select('*')
    .eq('status', 'identified')
    .is('linked_issue_id', null)
    .order('created_at', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const threshold = Date.now() - getRiskIssueWarningLifecycleThresholdMs('risk_to_issue')
  const createdIssues: Issue[] = []

  for (const risk of (data ?? []) as Risk[]) {
    const createdAt = new Date(risk.created_at).getTime()
    if (!Number.isFinite(createdAt) || createdAt > threshold) continue

    const issue = await convertRiskToIssueAtomic(risk.id, 'risk_auto_escalated')
    if (!issue) continue
    createdIssues.push(issue)
  }

  return createdIssues
}

export async function closeWarningNotification(projectId: string, id: string) {
  const warning = await fetchWarningNotificationById(projectId, id)
  if (!warning || !isPersistedWarningRow(warning)) return null
  if (isProtectedWarning(warning)) return warning

  const timestamp = nowIso()
  const { error } = await supabase
    .from('notifications')
    .update({
      status: 'closed',
      warning_lifecycle_status: 'resolved',
      resolved_at: timestamp,
      resolved_source: 'manual_closed',
      updated_at: timestamp,
    })
    .eq('id', id)
    .eq('project_id', warning.project_id)

  if (error) throw new Error(error.message)
  return await fetchWarningNotificationById(projectId, id)
}

export async function markSourceDeletedOnDownstream(sourceEntityType: string, sourceEntityId: string) {
  if (!sourceEntityType || !sourceEntityId) return

  try {
    await invokeRpc<number>('mark_source_deleted_on_downstream_atomic', {
      p_source_entity_type: sourceEntityType,
      p_source_entity_id: sourceEntityId,
    })
  } catch (error) {
    logger.warn('[upgradeChain] failed to mark downstream issues as source_deleted', {
      sourceEntityType,
      sourceEntityId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
