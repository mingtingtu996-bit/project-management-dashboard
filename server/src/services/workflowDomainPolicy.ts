import type { Issue, Risk } from '../types/db.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

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

  const nowTimestamp = (options?.now ?? new Date()).getTime()
  const createdAtTimestamp = normalizePriorityDate(issue.created_at)
  const untreatedDays = Math.max(0, Math.floor((nowTimestamp - createdAtTimestamp) / MS_PER_DAY))
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

export function buildIssueConfirmClosePatch() {
  return {
    status: 'closed',
    pending_manual_close: false,
    closed_reason: 'manual_confirmed_close',
  } satisfies Partial<Issue>
}

export function buildIssueKeepProcessingPatch() {
  return {
    status: 'investigating',
    pending_manual_close: false,
    closed_reason: null,
    closed_at: null,
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

export function buildRiskConfirmClosePatch() {
  return {
    status: 'closed',
    pending_manual_close: false,
    closed_reason: 'manual_confirmed_close',
  } satisfies Partial<Risk>
}

export function buildRiskKeepProcessingPatch() {
  return {
    status: 'mitigating',
    pending_manual_close: false,
    closed_reason: null,
    closed_at: null,
  } satisfies Partial<Risk>
}

