import type {
  Issue,
  Risk,
  RiskIssueClosureEffectiveness,
  RiskIssueClosureResultCode,
} from '../types/db.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

const ISSUE_SOURCE_WEIGHT: Record<Issue['source_type'], number> = {
  manual: 1,
  risk_converted: 2,
  risk_auto_escalated: 2,
  obstacle_escalated: 3,
  condition_expired: 4,
  source_deleted: 1,
}

const ISSUE_SEVERITY_WEIGHT: Record<Issue['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export const PROTECTED_RISK_SOURCE_TYPES = new Set<NonNullable<Risk['source_type']>>([
  'warning_converted',
  'warning_auto_escalated',
])

export const PROTECTED_ISSUE_SOURCE_TYPES = new Set<Issue['source_type']>([
  'risk_converted',
  'risk_auto_escalated',
  'obstacle_escalated',
  'condition_expired',
])

function clampPriority(value: number) {
  return Math.min(100, Math.max(1, Math.round(value)))
}

function normalizePriorityDate(value?: string | null) {
  const date = new Date(String(value ?? ''))
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

export function isProtectedRiskRecord(risk: Partial<Risk>) {
  return Boolean(risk.linked_issue_id) || PROTECTED_RISK_SOURCE_TYPES.has(String(risk.source_type ?? '') as Risk['source_type'])
}

export function isProtectedIssueRecord(issue: Partial<Issue>) {
  return PROTECTED_ISSUE_SOURCE_TYPES.has(String(issue.source_type ?? '') as Issue['source_type'])
}

export function getIssueBasePriority(sourceType: Issue['source_type'], severity: Issue['severity']) {
  return ISSUE_SOURCE_WEIGHT[sourceType] * ISSUE_SEVERITY_WEIGHT[severity]
}

export function computeDynamicIssuePriority(
  issue: Pick<Issue, 'source_type' | 'severity' | 'created_at' | 'status' | 'priority'>,
  options?: {
    now?: Date
    isLocked?: boolean
  },
) {
  if (options?.isLocked) {
    return clampPriority(Number(issue.priority ?? 1))
  }

  const basePriority = getIssueBasePriority(issue.source_type, issue.severity)
  if (issue.status === 'closed') {
    return clampPriority(basePriority)
  }

  const now = options?.now ?? new Date()
  const createdAtTimestamp = normalizePriorityDate(issue.created_at)
  const untreatedDays = Math.max(0, signedDurationDayDelta(new Date(createdAtTimestamp), now) ?? 0)
  const upliftSteps = Math.min(5, Math.floor(untreatedDays / 7))
  const upliftFactor = 1 + upliftSteps * 0.1

  return clampPriority(basePriority * upliftFactor)
}

export function buildIssuePendingManualClosePatch(issue: Pick<Issue, 'status'>) {
  return {
    status: issue.status === 'closed' ? 'closed' : 'resolved',
    pending_manual_close: true,
    closed_reason: null,
    closed_at: null,
  } satisfies Partial<Issue>
}

export type RiskIssueClosureOutcomeInput = {
  resultCode: Exclude<RiskIssueClosureResultCode, 'retention_close' | 'legacy_close'>
  resultSummary: string
  effectiveness: RiskIssueClosureEffectiveness
  evidenceRefs?: string[]
  causeAttributionId?: string | null
}

export type RetentionClosureContext = {
  actorId?: string | null
  evidenceRefs?: string[]
  recordedAt?: string
  resultSummary?: string
}

function buildStructuredClosureOutcomePatch(outcome: RiskIssueClosureOutcomeInput, actorId: string) {
  return {
    closure_result_code: outcome.resultCode,
    closure_result_summary: String(outcome.resultSummary ?? '').trim(),
    closure_effectiveness: outcome.effectiveness,
    closure_evidence_refs: [...new Set(outcome.evidenceRefs ?? [])],
    closure_cause_attribution_id: outcome.causeAttributionId ?? null,
    closed_by: actorId || null,
    closure_recorded_at: new Date().toISOString(),
  }
}

function clearStructuredClosureOutcomePatch() {
  return {
    closure_result_code: null,
    closure_result_summary: null,
    closure_effectiveness: null,
    closure_evidence_refs: [],
    closure_cause_attribution_id: null,
    closed_by: null,
    closure_recorded_at: null,
  }
}

function buildRetentionClosureOutcomePatch(context: RetentionClosureContext = {}) {
  const recordedAt = context.recordedAt ?? new Date().toISOString()
  return {
    status: 'closed' as const,
    pending_manual_close: false,
    closed_reason: 'retention_close',
    closed_at: recordedAt,
    closure_result_code: 'retention_close' as const,
    closure_result_summary: String(
      context.resultSummary ?? 'Closed by deletion retention governance instead of physical deletion.',
    ).trim(),
    closure_effectiveness: 'undetermined' as const,
    closure_evidence_refs: [...new Set(context.evidenceRefs ?? [])],
    closure_cause_attribution_id: null,
    closed_by: context.actorId || null,
    closure_recorded_at: recordedAt,
  }
}

export function buildIssueRetentionClosePatch(context: RetentionClosureContext = {}) {
  return buildRetentionClosureOutcomePatch(context) satisfies Partial<Issue>
}

export function buildRiskRetentionClosePatch(context: RetentionClosureContext = {}) {
  return buildRetentionClosureOutcomePatch(context) satisfies Partial<Risk>
}

export function buildIssueConfirmClosePatch(outcome: RiskIssueClosureOutcomeInput, actorId: string) {
  return {
    status: 'closed',
    pending_manual_close: false,
    closed_reason: 'manual_confirmed_close',
    ...buildStructuredClosureOutcomePatch(outcome, actorId),
  } satisfies Partial<Issue>
}

export function buildIssueKeepProcessingPatch() {
  return {
    status: 'investigating',
    pending_manual_close: false,
    closed_reason: null,
    closed_at: null,
    ...clearStructuredClosureOutcomePatch(),
  } satisfies Partial<Issue>
}

export function buildRiskPendingManualClosePatch() {
  return {
    status: 'mitigating',
    pending_manual_close: true,
    closed_reason: null,
    closed_at: null,
  } satisfies Partial<Risk>
}

export function buildRiskSourceResolvedAutoClosePatch(context: {
  taskId: string
  recordedAt?: string
}) {
  const recordedAt = context.recordedAt ?? new Date().toISOString()
  return {
    status: 'closed',
    pending_manual_close: false,
    closed_reason: 'source_resolved_auto',
    closed_at: recordedAt,
    closure_result_code: 'resolved',
    closure_result_summary: 'Delay-source risk closed automatically after the linked task completed.',
    closure_effectiveness: 'resolved',
    closure_evidence_refs: [`task:${context.taskId}:completed`],
    closure_cause_attribution_id: null,
    closed_by: null,
    closure_recorded_at: recordedAt,
  } satisfies Partial<Risk>
}

export function buildRiskConfirmClosePatch(outcome: RiskIssueClosureOutcomeInput, actorId: string) {
  return {
    status: 'closed',
    pending_manual_close: false,
    closed_reason: 'manual_confirmed_close',
    ...buildStructuredClosureOutcomePatch(outcome, actorId),
  } satisfies Partial<Risk>
}

export function buildRiskKeepProcessingPatch() {
  return {
    status: 'mitigating',
    pending_manual_close: false,
    closed_reason: null,
    closed_at: null,
    ...clearStructuredClosureOutcomePatch(),
  } satisfies Partial<Risk>
}
