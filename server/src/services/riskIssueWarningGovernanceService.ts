// v1.4.12: Unified risk/issue/warning governance service
// Orchestrates upgrade chain, lifecycle, dedup, and summary rules.
// Does NOT replace existing warningService/upgradeChainService/issueWriteChainService.
// Wraps them with unified entry points.

import { supabase } from './dbService.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { randomUUID } from 'crypto'
import { logger } from '../middleware/logger.js'
import { getRiskIssueWarningLifecycleCutoffIso } from './riskIssueWarningRuleRegistry.js'
import {
  confirmWarningAsRisk as confirmWarningAsRiskOnUpgradeChain,
  convertRiskToIssueAtomic,
} from './upgradeChainService.js'
import {
  dedupeGovernanceSignals,
  normalizeGovernanceSignalDirectory,
  type GovernanceSignalDirectoryInput,
  type RiskIssueWarningGovernanceSignal,
} from './riskIssueWarningGovernanceSignalService.js'

// ============================================================
// Warning signature: stable natural key for dedup
// ============================================================
export interface WarningSignatureInput {
  projectId: string
  warningType: string
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  taskId?: string | null
  businessDate?: string // ISO date in Asia/Shanghai
}

export function buildWarningSignature(input: WarningSignatureInput): string {
  const businessDate = input.businessDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const sourceEntityType = input.sourceEntityType ?? input.warningType
  const sourceEntityId = input.sourceEntityId ?? input.taskId ?? ''
  return `${input.projectId}::${input.warningType}::${sourceEntityType}::${sourceEntityId}::${businessDate}`
}

export function buildSourceHash(sourceEntityType: string, sourceEntityId: string): string {
  // Simple stable hash for source identification
  return `${sourceEntityType}:${sourceEntityId}`
}

function sourceAlgorithmForWarningSource(sourceEntityType?: string | null) {
  const normalized = String(sourceEntityType ?? '').trim()
  if (['task_condition', 'task_obstacle', 'acceptance_plan'].includes(normalized)) return 'execution_impact'
  if (['data_quality', 'data_quality_finding'].includes(normalized)) return 'data_quality'
  if (['pre_milestone', 'permit', 'certificate'].includes(normalized)) return 'planning_governance'
  if (['critical_path', 'duration_forecast'].includes(normalized)) return 'duration_context'
  return 'unknown'
}

function normalizeWarningInputGovernanceSignal(input: UpsertWarningInput): RiskIssueWarningGovernanceSignal | null {
  const existing = (input.metadata as any)?.governanceSignal
  if (existing && typeof existing === 'object') return null

  const sourceEntityId = String(input.sourceEntityId ?? input.taskId ?? '').trim()
  const signals = dedupeGovernanceSignals(normalizeGovernanceSignalDirectory([{
    sourceAlgorithm: sourceAlgorithmForWarningSource(input.sourceEntityType),
    sourceId: sourceEntityId || `${input.sourceEntityType}:${input.warningType}`,
    sourceEntityId: sourceEntityId || null,
    signalType: input.warningType,
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    actionPolicy: 'create_warning',
    severity: input.severity ?? 'warning',
    runtimeEvidence: [{
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: sourceEntityId || null,
      taskId: input.taskId ?? null,
      title: input.title ?? null,
      message: input.message ?? null,
    }],
  }]))

  const signal = signals[0]
  return signal?.canCreateWarning ? signal : null
}

function mergeWarningGovernanceMetadata(
  metadata: Record<string, unknown> | undefined,
  signal: RiskIssueWarningGovernanceSignal | null,
) {
  if ((metadata as any)?.governanceSignal || !signal) return metadata ?? {}
  return {
    ...(metadata ?? {}),
    governanceSignal: {
      dedupeKey: signal.dedupeKey,
      promotionStatus: signal.promotionStatus,
      sourceAlgorithm: signal.sourceAlgorithm,
      sourceId: signal.sourceId ?? null,
      attribution: signal.attribution,
      boundaryReason: signal.boundaryReason,
      evidence: signal.evidence,
    },
  }
}

// ============================================================
// Warning lifecycle
// ============================================================
export type WarningLifecycleStatus = 'created' | 'active' | 'acknowledged' | 'muted' | 'resolved' | 'escalated'

export function isActiveWarningLifecycle(status?: WarningLifecycleStatus | string | null): boolean {
  if (!status) return false
  return ['created', 'active'].includes(status as string)
}

export interface UpsertWarningInput {
  projectId: string
  warningType: string
  severity?: 'info' | 'warning' | 'critical'
  title?: string
  message?: string
  sourceEntityType: string
  sourceEntityId?: string | null
  taskId?: string | null
  businessDate?: string
  metadata?: Record<string, unknown>
  recipientIds?: string[]
}

export async function upsertWarningLifecycle(input: UpsertWarningInput): Promise<string | null> {
  const signature = buildWarningSignature(input)
  const sourceHash = buildSourceHash(input.sourceEntityType, input.sourceEntityId ?? input.taskId ?? '')
  const now = new Date().toISOString()
  const governanceSignal = normalizeWarningInputGovernanceSignal(input)
  const metadata = mergeWarningGovernanceMetadata(input.metadata, governanceSignal)

  // Check existing active warning with same signature
  const { data: existing } = await supabase
    .from('notifications')
    .select('id, warning_lifecycle_status, first_seen_at, resolved_at, resolved_source, metadata')
    .eq('project_id', input.projectId)
    .eq('warning_signature', signature)
    .eq('source_entity_type', 'warning')
    .maybeSingle() as any

  if (existing) {
// Same signature exists: if resolved, reopen; otherwise skip
    if (existing.warning_lifecycle_status === 'resolved') {
      const lifecycleHistory = (existing.metadata?.lifecycleHistory ?? []) as any[]
      lifecycleHistory.push({ resolvedAt: existing.resolved_at, resolvedSource: existing.resolved_source, reopenedAt: now })

      const { error } = await (supabase as any)
        .from('notifications')
        .update({
          warning_lifecycle_status: 'active',
          resolved_at: null,
          resolved_source: null,
          first_seen_at: existing.first_seen_at ?? now,
          metadata: { ...(existing.metadata ?? {}), ...metadata, lifecycleHistory },
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('project_id', input.projectId)

      if (error) {
        logger.error('Failed to reopen warning lifecycle', { error, id: existing.id })
        return null
      }
      return existing.id
    }
// Already active/acknowledged/muted/escalated: dedup, no new record
    return existing.id
  }

// No existing record: create new warning notification
  const id = randomUUID()
  try {
    await notificationTouchpointService.emit({
      id,
      project_id: input.projectId,
      source_entity_type: 'warning',
      source_entity_id: input.sourceEntityId ?? null,
      type: input.warningType,
      notification_type: 'business-warning',
      severity: input.severity ?? 'warning',
      title: input.title ?? input.warningType,
      content: input.message ?? '',
      status: 'active',
      touchpoint_type: 'dashboard_todo',
      scope_type: 'project',
      warning_lifecycle_status: 'active',
      warning_signature: signature,
      source_hash: sourceHash,
      dedupe_key: signature,
      target_route: `/projects/${input.projectId}/risks`,
      target_label: '查看风险预警',
      first_seen_at: now,
      created_at: now,
      updated_at: now,
      metadata,
      is_system: true,
    })
  } catch (error) {
    logger.error('Failed to insert warning notification', { error, input })
    return null
  }
  return id
}

function signalSubjectId(signal: RiskIssueWarningGovernanceSignal): string | null {
  const subject = String(signal.taskId ?? signal.sourceEntityId ?? signal.sourceId ?? '').trim()
  return subject || null
}

function signalTitle(signal: RiskIssueWarningGovernanceSignal): string {
  return String(signal.signalType ?? 'governance_warning').trim() || 'governance_warning'
}

export async function upsertWarningsFromGovernanceSignals(
  inputs: GovernanceSignalDirectoryInput[],
): Promise<{ warningsCreated: number; skippedSignals: number }> {
  const signals = dedupeGovernanceSignals(normalizeGovernanceSignalDirectory(inputs))
  let warningsCreated = 0
  let skippedSignals = 0

  for (const signal of signals) {
    const projectId = String(signal.projectId ?? '').trim()
    const sourceEntityId = signalSubjectId(signal)
    if (!signal.canCreateWarning || !projectId || !sourceEntityId) {
      skippedSignals++
      continue
    }

    const warningId = await upsertWarningLifecycle({
      projectId,
      warningType: signal.signalType,
      severity: signal.severity ?? 'warning',
      title: signalTitle(signal),
      message: signal.evidence.length > 0 ? JSON.stringify(signal.evidence[0]) : '',
      sourceEntityType: signal.signalType,
      sourceEntityId,
      taskId: signal.taskId ?? null,
      metadata: {
        governanceSignal: {
          dedupeKey: signal.dedupeKey,
          promotionStatus: signal.promotionStatus,
          sourceAlgorithm: signal.sourceAlgorithm,
          sourceId: signal.sourceId ?? null,
          attribution: signal.attribution,
          boundaryReason: signal.boundaryReason,
          evidence: signal.evidence,
        },
      },
    })
    if (warningId) warningsCreated++
  }

  return { warningsCreated, skippedSignals }
}

// ============================================================
// Governance acknowledge / mute (changes warning_lifecycle_status)
// ============================================================
export async function governanceAcknowledgeWarning(
  projectId: string,
  warningId: string,
  userId: string,
): Promise<boolean> {
  const now = new Date().toISOString()

  // Fetch notification to get required ack fields
  const { data: notification } = await (supabase as any)
    .from('notifications')
    .select('project_id, task_id, type, warning_signature')
    .eq('id', warningId)
    .eq('project_id', projectId)
    .eq('source_entity_type', 'warning')
    .single()

  const { error } = await (supabase as any)
    .from('notifications')
    .update({
      warning_lifecycle_status: 'acknowledged',
      acknowledged_at: now,
      updated_at: now,
    })
    .eq('id', warningId)
    .eq('source_entity_type', 'warning')
    .eq('project_id', projectId)

  if (error) {
    logger.error('Failed to governance acknowledge warning', { error, warningId })
    return false
  }

  // Record acknowledgment with correct schema fields
  if (notification) {
    await (supabase as any).from('warning_acknowledgments').insert({
      id: randomUUID(),
      user_id: userId,
      project_id: projectId,
      task_id: notification.task_id ?? null,
      warning_type: notification.type ?? 'unknown',
      warning_signature: notification.warning_signature ?? warningId,
      acked_at: now,
      created_at: now,
      updated_at: now,
    }).catch((err: unknown) => {
      logger.error('Failed to write warning_acknowledgments', { error: err, warningId })
    })
  }

  return true
}

export async function governanceMuteWarning(
  projectId: string,
  warningId: string,
  hours: number,
  userId: string,
): Promise<boolean> {
  const now = new Date().toISOString()
  const mutedUntil = new Date(Date.now() + hours * 3600000).toISOString()
  const { data: notification } = await (supabase as any)
    .from('notifications')
    .select('project_id, metadata')
    .eq('id', warningId)
    .eq('project_id', projectId)
    .eq('source_entity_type', 'warning')
    .single()
  const metadata =
    notification?.metadata && typeof notification.metadata === 'object'
      ? notification.metadata
      : {}
  const { error } = await (supabase as any)
    .from('notifications')
    .update({
      warning_lifecycle_status: 'muted',
      muted_until: mutedUntil,
      metadata: {
        ...metadata,
        governance_muted_by: userId,
        governance_muted_at: now,
        governance_muted_hours: hours,
      },
      updated_at: now,
    })
    .eq('id', warningId)
    .eq('source_entity_type', 'warning')
    .eq('project_id', projectId)

  if (error) {
    logger.error('Failed to governance mute warning', { error, warningId })
    return false
  }
  return true
}

// ============================================================
// Warning -> Risk confirmation
// ============================================================
export async function confirmWarningAsRisk(
  projectId: string,
  warningId: string,
  userId: string,
): Promise<string | null> {
  const risk = await confirmWarningAsRiskOnUpgradeChain(projectId, warningId, userId)
  return risk?.id ?? null

  /*
  const now = new Date().toISOString()

  // Fetch warning notification
  const { data: warning } = await (supabase as any)
    .from('notifications')
    .select('*')
    .eq('id', warningId)
    .eq('source_entity_type', 'warning')
    .single() as any

  if (!warning || warning.is_escalated) return null

  // Create risk
  const riskId = randomUUID()
  const { error: riskError } = await (supabase as any)
    .from('risks')
    .insert({
      id: riskId,
      project_id: warning.project_id,
      title: warning.title ?? warning.message ?? '预警升级风险',
      description: warning.message ?? '',
      level: warning.severity === 'critical' ? 'high' : 'medium',
      status: 'identified',
      source_type: 'warning_converted',
      source_id: warningId,
      source_entity_type: 'warning',
      source_entity_id: warning.source_entity_id,
      chain_id: warning.chain_id ?? randomUUID(),
      created_at: now,
      updated_at: now,
    })

  if (riskError) {
    logger.error('Failed to create risk from warning', { error: riskError, warningId })
    return null
  }

  // Mark warning as escalated
  await (supabase as any)
    .from('notifications')
    .update({
      warning_lifecycle_status: 'escalated',
      escalated_to_risk_id: riskId,
      escalated_at: now,
      is_escalated: true,
      updated_at: now,
    })
    .eq('id', warningId)
    .eq('project_id', warning.project_id)

  return riskId
  */
}

// ============================================================
// Auto escalation: warnings -> risks
// ============================================================
export async function autoEscalateWarnings(projectId?: string): Promise<number> {
  const threshold = getRiskIssueWarningLifecycleCutoffIso('warning_to_risk')
  let query = (supabase as any)
    .from('notifications')
    .select('id, project_id')
    .eq('source_entity_type', 'warning')
    .eq('warning_lifecycle_status', 'active')
    .lt('first_seen_at', threshold)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: warnings } = await query
  if (!warnings || warnings.length === 0) return 0

  let escalated = 0
  for (const w of warnings) {
    const riskId = await confirmWarningAsRisk(String(w.project_id ?? ''), w.id, 'system')
    if (riskId) {
      // Update source_type to auto_escalated
      await (supabase as any)
        .from('risks')
        .update({ source_type: 'warning_auto_escalated', updated_at: new Date().toISOString() })
        .eq('id', riskId)
        .eq('project_id', w.project_id ?? '')
      escalated++
    }
  }
  return escalated
}

// ============================================================
// Risk -> Issue conversion
// ============================================================
export async function convertRiskToIssue(
  riskId: string,
  actorId?: string,
): Promise<string | null> {
  const issue = await convertRiskToIssueAtomic(riskId, 'risk_converted')
  return issue?.id ?? null

  /*
  const now = new Date().toISOString()

  const { data: risk } = await (supabase as any)
    .from('risks')
    .select('*')
    .eq('id', riskId)
    .single() as any

  if (!risk || risk.linked_issue_id) return null

  const issueId = randomUUID()
  const { error: issueError } = await (supabase as any)
    .from('issues')
    .insert({
      id: issueId,
      project_id: risk.project_id,
      title: risk.title ?? '风险转入问题',
      description: risk.description ?? '',
      severity: risk.level === 'critical' ? 'critical' : risk.level === 'high' ? 'high' : 'medium',
      status: 'open',
      source_type: 'risk_converted',
      source_id: riskId,
      source_entity_type: 'risk',
      source_entity_id: risk.source_entity_id,
      chain_id: risk.chain_id ?? randomUUID(),
      priority: risk.level === 'high' || risk.level === 'critical' ? 'high' : 'medium',
      created_at: now,
      updated_at: now,
    })

  if (issueError) {
    logger.error('Failed to create issue from risk', { error: issueError, riskId })
    return null
  }

  // Link risk to issue
  await (supabase as any)
    .from('risks')
    .update({
      linked_issue_id: issueId,
      status: 'mitigating',
      updated_at: now,
    })
    .eq('id', riskId)
    .eq('project_id', risk.project_id)

  return issueId
  */
}

export async function autoEscalateRisksToIssues(projectId?: string): Promise<number> {
  const threshold = getRiskIssueWarningLifecycleCutoffIso('risk_to_issue')
  let query = (supabase as any)
    .from('risks')
    .select('id, project_id')
    .eq('status', 'identified')
    .is('linked_issue_id', null)
    .lt('created_at', threshold)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: risks } = await query
  if (!risks || risks.length === 0) return 0

  let escalated = 0
  for (const r of risks) {
    const issueId = await convertRiskToIssue(r.id, 'system')
    if (issueId) {
      await (supabase as any)
        .from('issues')
        .update({ source_type: 'risk_auto_escalated', updated_at: new Date().toISOString() })
        .eq('id', issueId)
        .eq('project_id', r.project_id ?? '')
      escalated++
    }
  }
  return escalated
}

// ============================================================
// Obstacle -> Issue escalation
// ============================================================
export async function ensureIssueFromObstacle(obstacle: Record<string, unknown>): Promise<string | null> {
  const obstacleId = String(obstacle.id ?? '')
  const projectId = String(obstacle.project_id ?? '').trim()
  // Check for existing active issue from this obstacle
  const { data: existing } = await (supabase as any)
    .from('issues')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_entity_type', 'task_obstacle')
    .eq('source_entity_id', obstacleId)
    .eq('status', 'open')
    .maybeSingle() as any

  if (existing) return existing.id

  const now = new Date().toISOString()
  const issueId = randomUUID()
  const severity = obstacle.severity === 'critical' || obstacle.severity === '严重' ? 'critical' : 'medium'

  const { error } = await (supabase as any)
    .from('issues')
    .insert({
      id: issueId,
      project_id: obstacle.project_id,
      title: `阻碍上卷：${obstacle.title ?? obstacle.description ?? '未命名阻碍'}`,
      description: String(obstacle.description ?? ''),
      severity,
      status: 'open',
      source_type: 'obstacle_escalated',
      source_id: obstacleId,
      source_entity_type: 'task_obstacle',
      source_entity_id: obstacleId,
      chain_id: randomUUID(),
      priority: severity === 'critical' ? 'high' : 'medium',
      created_at: now,
      updated_at: now,
    })

  if (error) {
    logger.error('Failed to create issue from obstacle', { error, obstacleId })
    return null
  }
  return issueId
}

// ============================================================
// Condition/acceptance expired -> Issue escalation
// ============================================================
export async function ensureIssueFromExpiredCondition(condition: Record<string, unknown>): Promise<string | null> {
  const conditionId = String(condition.id ?? '')
  const projectId = String(condition.project_id ?? '').trim()
  const { data: existing } = await (supabase as any)
    .from('issues')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_entity_type', 'task_condition')
    .eq('source_entity_id', conditionId)
    .eq('status', 'open')
    .maybeSingle() as any

  if (existing) return existing.id

  const now = new Date().toISOString()
  const issueId = randomUUID()

  const { error } = await (supabase as any)
    .from('issues')
    .insert({
      id: issueId,
      project_id: condition.project_id,
      title: `开工条件过期：${condition.name ?? condition.condition_name ?? '未命名条件'}`,
      description: String(condition.description ?? '开工条件已过期仍未满足'),
      severity: 'medium',
      status: 'open',
      source_type: 'condition_expired',
      source_id: conditionId,
      source_entity_type: 'task_condition',
      source_entity_id: conditionId,
      chain_id: randomUUID(),
      priority: 'medium',
      created_at: now,
      updated_at: now,
    })

  if (error) {
    logger.error('Failed to create issue from condition', { error, conditionId })
    return null
  }
  return issueId
}

export async function ensureIssueFromExpiredAcceptance(acceptance: Record<string, unknown>): Promise<string | null> {
  const planId = String(acceptance.id ?? '')
  const projectId = String(acceptance.project_id ?? '').trim()
  const { data: existing } = await (supabase as any)
    .from('issues')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_entity_type', 'acceptance_plan')
    .eq('source_entity_id', planId)
    .eq('status', 'open')
    .maybeSingle() as any

  if (existing) return existing.id

  const now = new Date().toISOString()
  const issueId = randomUUID()

  const { error } = await (supabase as any)
    .from('issues')
    .insert({
      id: issueId,
      project_id: acceptance.project_id,
      title: `验收逾期：${acceptance.acceptance_name ?? acceptance.name ?? '未命名验收'}`,
      description: String(acceptance.description ?? '验收逾期未完成'),
      severity: 'medium',
      status: 'open',
      source_type: 'condition_expired',
      source_id: planId,
      source_entity_type: 'acceptance_plan',
      source_entity_id: planId,
      chain_id: randomUUID(),
      priority: 'medium',
      created_at: now,
      updated_at: now,
    })

  if (error) {
    logger.error('Failed to create issue from acceptance', { error, planId })
    return null
  }
  return issueId
}

// ============================================================
// Source resolved / deleted
// ============================================================
export async function markSourceResolved(
  sourceEntityType: string,
  sourceEntityId: string,
  projectId?: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  // Close active warnings from this source
  let warningQuery = (supabase as any)
    .from('notifications')
    .update({
      warning_lifecycle_status: 'resolved',
      resolved_at: now,
      resolved_source: 'source_resolved',
      updated_at: now,
    })
    .eq('source_entity_type', 'warning')
    .or(`source_entity_id.eq.${sourceEntityId},source_hash.eq.${buildSourceHash(sourceEntityType, sourceEntityId)}`)
    .in('warning_lifecycle_status', ['active', 'acknowledged', 'muted', 'created'])
  if (projectId) warningQuery = warningQuery.eq('project_id', projectId)
  await warningQuery

  // Mark risks/issues as pending_manual_close
  let riskQuery = (supabase as any)
    .from('risks')
    .update({ pending_manual_close: true, updated_at: now })
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .in('status', ['identified', 'mitigating'])
  if (projectId) riskQuery = riskQuery.eq('project_id', projectId)
  await riskQuery

  let issueQuery = (supabase as any)
    .from('issues')
    .update({ pending_manual_close: true, updated_at: now })
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .in('status', ['open', 'investigating'])
  if (projectId) issueQuery = issueQuery.eq('project_id', projectId)
  await issueQuery
}

export async function markSourceDeleted(
  sourceEntityType: string,
  sourceEntityId: string,
  projectId?: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  // Mark warnings as resolved with source_deleted
  let warningQuery = (supabase as any)
    .from('notifications')
    .update({
      warning_lifecycle_status: 'resolved',
      resolved_at: now,
      resolved_source: 'source_deleted',
      updated_at: now,
    })
    .eq('source_entity_type', 'warning')
    .or(`source_entity_id.eq.${sourceEntityId},source_hash.eq.${buildSourceHash(sourceEntityType, sourceEntityId)}`)
    .in('warning_lifecycle_status', ['active', 'acknowledged', 'muted', 'created'])
  if (projectId) warningQuery = warningQuery.eq('project_id', projectId)
  await warningQuery

  // Mark risks with source_deleted
  let riskQuery = (supabase as any)
    .from('risks')
    .update({ source_type: 'source_deleted', updated_at: now })
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
  if (projectId) riskQuery = riskQuery.eq('project_id', projectId)
  await riskQuery

  let issueQuery = (supabase as any)
    .from('issues')
    .update({ source_type: 'source_deleted', updated_at: now })
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
  if (projectId) issueQuery = issueQuery.eq('project_id', projectId)
  await issueQuery
}

// ============================================================
// Unified summary for Dashboard / Reports
// ============================================================
export interface RiskIssueWarningSummary {
  activeWarningCount: number
  activeRiskCount: number
  activeIssueCount: number
  pendingCloseRisks: number
  pendingCloseIssues: number
  warningTrend: Array<{ date: string; count: number }>
}

// ============================================================
// Unified business warning sync: scan all sources
// ============================================================
export async function syncBusinessWarnings(projectId?: string): Promise<{
  warningsCreated: number
  risksEscalated: number
  issuesCreated: number
}> {
  const projectFilter = projectId ? { project_id: projectId } : {}
  let warningsCreated = 0
  let risksEscalated = 0
  let issuesCreated = 0
  const warningSignals: GovernanceSignalDirectoryInput[] = []

  // 1. Scan expired conditions -> condition_expired issues
  const { data: expiredConditions } = await (supabase as any)
    .from('task_conditions')
    .select('*')
    .eq('is_satisfied', false)
    .lt('target_date', new Date().toISOString().slice(0, 10))
    .in('status', ['active', 'pending', 'open'])
    .match(projectId ? { project_id: projectId } : {})
    .limit(500) as any

  if (expiredConditions?.length) {
    for (const condition of expiredConditions) {
      const issueId = await ensureIssueFromExpiredCondition(condition)
      if (issueId) issuesCreated++
      // Also generate a warning
      const warningId = await upsertWarningLifecycle({
        projectId: condition.project_id,
        warningType: 'condition_due',
        severity: 'warning',
        title: `开工条件过期：${condition.name ?? condition.condition_name ?? ''}`,
        message: condition.description ?? '开工条件已过期仍未满足',
        sourceEntityType: 'task_condition',
        sourceEntityId: condition.id,
        taskId: condition.task_id,
      })
      if (warningId) warningsCreated++
    }
  }

  // 2. Scan acceptance plans for overdue items
  const { data: overdueAcceptances } = await (supabase as any)
    .from('acceptance_plans')
    .select('*')
    .lt('planned_date', new Date().toISOString().slice(0, 10))
    .in('status', ['draft', 'in_progress', 'pending', 'active'])
    .match(projectId ? { project_id: projectId } : {})
    .limit(500) as any

  if (overdueAcceptances?.length) {
    for (const acceptance of overdueAcceptances) {
      const warningId = await upsertWarningLifecycle({
        projectId: acceptance.project_id,
        warningType: 'acceptance_expired',
        severity: 'warning',
        title: `验收逾期：${acceptance.acceptance_name ?? acceptance.name ?? ''}`,
        message: acceptance.description ?? '验收计划已逾期',
        sourceEntityType: 'acceptance_plan',
        sourceEntityId: acceptance.id,
      })
      if (warningId) warningsCreated++
    }
  }

  // 3. Auto-escalate stale warnings -> risks
  risksEscalated += await autoEscalateWarnings(projectId)

  // 4. Auto-escalate stale risks -> issues
  issuesCreated += await autoEscalateRisksToIssues(projectId)

  // 5. Un-mute expired muted warnings
  const now = new Date().toISOString()
  const { data: expiredMutes } = await (supabase as any)
    .from('notifications')
    .select('id')
    .eq('source_entity_type', 'warning')
    .eq('warning_lifecycle_status', 'muted')
    .lt('muted_until', now)
    .match(projectId ? { project_id: projectId } : {})
    .limit(500) as any

  if (expiredMutes?.length) {
    await (supabase as any)
      .from('notifications')
      .update({ warning_lifecycle_status: 'active', muted_until: null, updated_at: now })
      .in('id', expiredMutes.map((n: any) => n.id))
  }

  logger.info('syncBusinessWarnings completed', { projectId, warningsCreated, risksEscalated, issuesCreated })
  return { warningsCreated, risksEscalated, issuesCreated }
}

export async function buildRiskIssueWarningSummary(projectId: string): Promise<RiskIssueWarningSummary> {
  const [warningsResult, risksResult, issuesResult] = await Promise.all([
    (supabase as any)
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('source_entity_type', 'warning')
      .in('warning_lifecycle_status', ['active', 'created']),
    (supabase as any)
      .from('risks')
      .select('id, pending_manual_close', { count: 'exact' })
      .eq('project_id', projectId)
      .in('status', ['identified', 'mitigating']),
    (supabase as any)
      .from('issues')
      .select('id, pending_manual_close', { count: 'exact' })
      .eq('project_id', projectId)
      .in('status', ['open', 'investigating']),
  ])

  return {
    activeWarningCount: warningsResult?.count ?? 0,
    activeRiskCount: risksResult?.count ?? 0,
    activeIssueCount: issuesResult?.count ?? 0,
    pendingCloseRisks: (risksResult?.data ?? []).filter((r: any) => r.pending_manual_close).length,
    pendingCloseIssues: (issuesResult?.data ?? []).filter((i: any) => i.pending_manual_close).length,
    warningTrend: [],
  }
}
