import { v4 as uuidv4 } from 'uuid'

import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { executeSQL, executeSQLOne, listTaskProgressSnapshotsByTaskIds } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { findNotification } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { writeLog } from './changeLogs.js'
import { PlanningHealthService } from './planningHealthService.js'
import { PlanningIntegrityService } from './planningIntegrityService.js'
import { enqueueProjectHealthUpdate } from './projectHealthService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { SystemAnomalyService } from './systemAnomalyService.js'
import { detectProgressQualitySignals } from './progressAnomalyService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import type { Notification } from '../types/db.js'
import type { MonthlyPlan, Task, TaskProgressSnapshot } from '../types/db.js'
import type {
  PassiveReorderDetectionReport,
  PlanningGovernanceAlert,
  PlanningGovernanceGateLevel,
  PlanningGovernanceSignal,
  PlanningGovernanceState,
  PlanningGovernanceSnapshot,
  PlanningGovernanceSourceAlgorithm,
  PlanningGovernanceTargetSurface,
  PlanningHealthReport,
  PlanningIntegrityReport,
} from '../types/planning.js'

interface ProjectMemberRow {
  project_id: string
  user_id: string
  permission_level?: string | null
}

interface ProjectOwnerRow {
  id: string
  owner_id?: string | null
}

type ManualReorderMode = 'sequence' | 'date_shift' | 'scope_change' | 'mixed'

interface ManualReorderStartSnapshot {
  total_tasks: number
  critical_task_count: number
  milestone_task_count: number
  confirmed_baseline_count: number
  active_monthly_plan_count: number
  pending_realign_count: number
}

interface ManualReorderEndSummary {
  duration_minutes: number
  changed_task_count: number
  changed_baseline_count: number
  changed_monthly_plan_count: number
  changed_field_count: number
  change_log_count: number
}

interface ManualReorderSessionPayload extends Record<string, unknown> {
  reorder_mode: ManualReorderMode
  started_by?: string | null
  started_at: string
  note?: string | null
  start_snapshot: ManualReorderStartSnapshot
  ended_by?: string | null
  ended_at?: string | null
  end_summary?: ManualReorderEndSummary | null
  completion_note?: string | null
}

type GovernanceSeverity = 'info' | 'warning' | 'critical'

type GovernanceLinkageSourceAlgorithm =
  | 'task_condition_linkage'
  | 'drawing_package'
  | 'pre_milestone'
  | 'acceptance_flow'

type GovernanceExplanationSourceAlgorithm =
  | 'progress_deviation'
  | 'project_schedule_state'
  | 'duration_context'
  | 'task_duration_forecast'
  | 'construction_rhythm'

export interface PlanningGovernanceWbsRollupIssueInput {
  code: string
  level: 'error' | 'warning' | 'info'
  message: string
  rowId?: string | null
  parentId?: string | null
  field?: string | null
  details?: Record<string, unknown> | null
}

export interface PlanningGovernanceBaselineValidityInput {
  baselineId?: string | null
  baselineStatus?: string | null
  state: 'valid' | 'needs_realign' | 'insufficient_data' | string
  triggeredRules?: string[]
  comparedTaskCount?: number
  deviatedTaskCount?: number
  deviatedTaskRatio?: number
  shiftedMilestoneCount?: number
  averageMilestoneShiftDays?: number
  totalDurationDeviationRatio?: number
  isValid?: boolean
}

export interface PlanningGovernanceProgressAnomalyInput {
  taskId?: string | null
  code: string
  severity: GovernanceSeverity | string
  summary: string
  acknowledged?: boolean
  excludedFromVelocityLearning?: boolean
  confidenceAction?: string
  metadata?: Record<string, unknown> | null
}

export interface PlanningGovernanceTaskConstraintInput {
  taskId?: string | null
  readyForStart?: boolean | null
  dependencyStatus?: string | null
  conditionStatus?: string | null
  obstacleStatus?: string | null
  progressImpactLevel?: string | null
  blockedForProgress?: boolean | null
  dependencyCount?: number
  advisoryDependencyCount?: number
  totalDependencyCount?: number
  unmetDependencyCount?: number
  hardConditionCount?: number
  unmetHardConditionCount?: number
  openObstacleCount?: number
  sourceEventType?: string | null
  sourceEventKey?: string | null
  snapshotId?: string | null
  createdAt?: string | null
  evidence?: Record<string, unknown> | null
}

export interface PlanningGovernanceLinkageSignalInput {
  sourceAlgorithm: GovernanceLinkageSourceAlgorithm
  taskId?: string | null
  sourceId?: string | null
  boundToTask?: boolean | null
  severity?: GovernanceSeverity | string | null
  title?: string | null
  detail?: string | null
  evidence?: Record<string, unknown> | null
  targetSurface?: PlanningGovernanceTargetSurface
}

export interface PlanningGovernanceExplanationSignalInput {
  sourceAlgorithm: GovernanceExplanationSourceAlgorithm
  taskId?: string | null
  sourceId?: string | null
  severity?: GovernanceSeverity | string | null
  title?: string | null
  detail?: string | null
  evidence?: Record<string, unknown> | null
  targetSurface?: PlanningGovernanceTargetSurface
  gateLevel?: PlanningGovernanceGateLevel
}

export interface PlanningGovernanceSignalContext {
  wbsRollupIssues?: PlanningGovernanceWbsRollupIssueInput[]
  baselineValidity?: PlanningGovernanceBaselineValidityInput | PlanningGovernanceBaselineValidityInput[] | null
  progressAnomalySignals?: PlanningGovernanceProgressAnomalyInput[]
  taskConstraintSummaries?: PlanningGovernanceTaskConstraintInput[]
  linkageSignals?: PlanningGovernanceLinkageSignalInput[]
  explanationSignals?: PlanningGovernanceExplanationSignalInput[]
}

interface TaskConstraintSnapshotRow {
  id?: string | null
  task_id?: string | null
  ready_for_start?: boolean | number | string | null
  dependency_status?: string | null
  condition_status?: string | null
  obstacle_status?: string | null
  progress_impact_level?: string | null
  blocked_for_progress?: boolean | number | string | null
  readiness_summary?: unknown
  source_event_type?: string | null
  source_event_key?: string | null
  created_at?: string | null
}

interface ProjectScheduleStateRow {
  id?: string | null
  scope_type?: string | null
  scope_id?: string | null
  state?: string | null
  confidence_score?: number | string | null
  window_days?: number | string | null
  window_end_date?: string | null
  downstream_policy?: Record<string, unknown> | null
  metrics?: Record<string, unknown> | null
  evidence?: unknown
}

interface TaskDurationForecastSignalRow {
  id?: string | null
  task_id?: string | null
  forecast_delay_days?: number | string | null
  confidence_level?: string | null
  confidence_score?: number | string | null
  delay_risk_index?: number | string | null
  business_reason?: string | null
  factor_summary?: Record<string, unknown> | null
  calculation_context?: Record<string, unknown> | null
  generated_at?: string | null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

const GOVERNANCE_CLOSEOUT_THRESHOLDS = [3, 5, 7] as const
const GOVERNANCE_REORDER_THRESHOLDS = [3, 5, 7] as const

function isPlanningHealthReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PlanningHealthReport {
  if ('score' in report) {
    return true
  }
  return false
}

function isPlanningIntegrityReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PlanningIntegrityReport {
  return 'milestone_integrity' in report && 'data_integrity' in report && 'mapping_integrity' in report
}

function isPassiveReorderReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PassiveReorderDetectionReport {
  return 'windows' in report
}

function getAlertSeverity(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): 'info' | 'warning' | 'critical' {
  if (isPlanningHealthReport(report)) {
    return report.score < 60 ? 'critical' : report.score < 80 ? 'warning' : 'info'
  }

  if (isPlanningIntegrityReport(report)) {
    const blockedMilestones = report.milestone_integrity.summary.blocked
    const missingData = report.milestone_integrity.summary.missing_data
    const needsAttention = report.milestone_integrity.summary.needs_attention
    if (blockedMilestones > 0 || missingData > 0) return 'critical'
    if (needsAttention > 0) return 'warning'
    return 'info'
  }

  const triggeredWindows = isPassiveReorderReport(report) ? report.windows.filter((window) => window.triggered).length : 0
  if (triggeredWindows >= 2) return 'critical'
  if (triggeredWindows === 1) return 'warning'
  return 'info'
}

function normalizeMonthKey(value?: string | null): string | null {
  if (!value) return null
  const text = String(value).trim()
  const match = /^(\d{4})-(\d{2})$/.exec(text)
  if (match) {
    return `${match[1]}-${match[2]}`
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthSerial(value: string): number | null {
  const normalized = normalizeMonthKey(value)
  if (!normalized) return null
  const [year, monthPart] = normalized.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthPart)) return null
  return year * 12 + monthPart
}

function getLongestConsecutiveMonthStreak(months: Iterable<string>): number {
  const serials = [...new Set(Array.from(months).map((month) => monthSerial(month)).filter((value): value is number => value !== null))]
    .sort((left, right) => left - right)

  let longest = 0
  let current = 0
  let previous: number | null = null

  for (const serial of serials) {
    if (previous === null || serial === previous + 1) {
      current += 1
    } else {
      current = 1
    }
    longest = Math.max(longest, current)
    previous = serial
  }

  return longest
}

function monthBoundaryTimestamp(month: string): number | null {
  const normalized = normalizeMonthKey(month)
  if (!normalized) return null

  const [year, monthPart] = normalized.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthPart)) return null

  return Date.UTC(year, monthPart, 1, 0, 0, 0, 0)
}

function closeoutOverdueDays(dueTimestamp: number, now: Date): number {
  return Math.max(0, signedDurationDayDelta(new Date(dueTimestamp), now) ?? 0)
}

function buildCloseoutAlertDetail(plan: MonthlyPlan, overdueDays: number, threshold: number): string {
  const planLabel = `${plan.month}${plan.title ? ` / ${plan.title}` : ''}`
  if (threshold === 3) {
    return `Monthly plan ${planLabel} is ${overdueDays} days overdue. PM should complete closeout soon.`
  }
  if (threshold === 5) {
    return `Monthly plan ${planLabel} is ${overdueDays} days overdue. Escalate to the project owner and surface an overdue signal.`
  }
  return `Monthly plan ${planLabel} is ${overdueDays} days overdue. Project owner attention is required to finish normal closeout.`
}

function buildReorderAlertDetail(window: NonNullable<PassiveReorderDetectionReport['windows']>[number], threshold: number): string {
  const prefix =
    threshold === 3
      ? 'Passive reorder was detected. PM should review whether the change should continue.'
      : threshold === 5
        ? 'Passive reorder is continuing. Project owner attention is recommended.'
        : 'Passive reorder has reached the closeout stage. The system will end it and generate a change summary.'

  return `${prefix} Window ${window.window_days}d: ${window.event_count} changes, ${window.key_task_count ?? 0} key tasks, average offset ${window.average_offset_days ?? 0} days.`
}

function getProjectNotificationScope(kind: PlanningGovernanceAlert['kind']): 'owner' | 'owner_admin' {
  if (
    kind === 'closeout_reminder'
    || kind === 'reorder_reminder'
    || kind === 'ad_hoc_cross_month_reminder'
  ) {
    return 'owner'
  }

  return 'owner_admin'
}

function getPlanningGovernanceNotificationType(kind: PlanningGovernanceAlert['kind']) {
  switch (kind) {
    case 'health':
      return 'planning-governance-health'
    case 'integrity':
      return 'planning-governance-integrity'
    case 'anomaly':
      return 'planning-governance-anomaly'
    case 'mapping_orphan_pointer':
      return 'planning-governance-mapping'
    case 'milestone_blocked':
    case 'milestone_missing_data':
    case 'milestone_needs_attention':
      return 'planning-governance-milestone'
    case 'closeout_reminder':
    case 'closeout_escalation':
    case 'closeout_owner_attention':
      return 'planning-governance-closeout'
    case 'reorder_reminder':
    case 'reorder_escalation':
    case 'reorder_summary':
      return 'planning-governance-reorder'
    case 'ad_hoc_cross_month_reminder':
      return 'planning-governance-ad-hoc'
    default:
      return 'planning-governance'
  }
}

function getPlanningGovernanceNotificationCategory(kind: PlanningGovernanceAlert['kind']) {
  if (kind === 'mapping_orphan_pointer') {
    return 'planning_mapping_orphan'
  }

  return 'planning_governance'
}

function buildMappingOrphanPointerAlert(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert | null {
  const pendingCount = snapshot.integrity.mapping_integrity.baseline_pending_count
  const mergedCount = snapshot.integrity.mapping_integrity.baseline_merged_count
  const carryoverOrphanCount = snapshot.integrity.mapping_integrity.monthly_carryover_count
  const total = pendingCount + mergedCount + carryoverOrphanCount

  if (total === 0) return null

  const severity: PlanningGovernanceAlert['severity'] =
    pendingCount > 0 || mergedCount > 0 ? 'critical' : 'warning'

  return {
    kind: 'mapping_orphan_pointer',
    severity,
    title: '规划映射存在孤立指针',
    detail: `Mapping orphan pointers ${total}: baseline pending/missing ${pendingCount}, baseline merged ${mergedCount}, monthly carryover orphan ${carryoverOrphanCount}.`,
    source_id: `${snapshot.project_id}:mapping_orphan_pointer`,
  }
}

function buildMilestoneScenarioAlerts(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert[] {
  return snapshot.integrity.milestone_integrity.items
    .filter((item) => item.state !== 'aligned')
    .map((item) => {
      const kind =
        item.state === 'blocked'
          ? 'milestone_blocked'
          : item.state === 'missing_data'
            ? 'milestone_missing_data'
            : 'milestone_needs_attention'

      const severity: PlanningGovernanceAlert['severity'] =
        item.state === 'needs_attention' ? 'warning' : 'critical'

      const title =
        item.state === 'blocked'
          ? `${item.milestone_key} milestone blocked`
          : item.state === 'missing_data'
            ? `${item.milestone_key} milestone missing data`
            : `${item.milestone_key} milestone needs attention`

      return {
        kind,
        severity,
        title,
        detail: `Milestone ${item.milestone_key} ${item.title} has issues: ${item.issues.join('; ') || 'unknown scenario'}.`,
        source_id: `${snapshot.project_id}:milestone:${item.milestone_id}:${kind}`,
      } satisfies PlanningGovernanceAlert
    })
}

function buildGovernanceSignal(params: {
  projectId: string
  sourceAlgorithm: PlanningGovernanceSourceAlgorithm
  gateLevel: PlanningGovernanceGateLevel
  targetSurface: PlanningGovernanceTargetSurface
  title: string
  detail: string
  evidence: Record<string, unknown>
  recommendation: string
  sourceId?: string | null
  taskId?: string | null
}): PlanningGovernanceSignal {
  return {
    id: buildGovernanceStateKey([
      params.projectId,
      params.sourceAlgorithm,
      params.gateLevel,
      params.targetSurface,
      params.sourceId ?? params.title,
    ]),
    sourceAlgorithm: params.sourceAlgorithm,
    gateLevel: params.gateLevel,
    targetSurface: params.targetSurface,
    title: params.title,
    detail: params.detail,
    evidence: params.evidence,
    recommendation: params.recommendation,
    sourceId: params.sourceId ?? null,
    taskId: params.taskId ?? null,
  }
}

export interface PreConfirmGovernanceGateResult {
  projectId: string
  targetSurface: PlanningGovernanceTargetSurface
  allowed: boolean
  blocked: boolean
  blockingSignals: PlanningGovernanceSignal[]
  confirmationSignals: PlanningGovernanceSignal[]
  hintSignals: PlanningGovernanceSignal[]
}

function signalAppliesToTarget(signal: PlanningGovernanceSignal, targetSurface: PlanningGovernanceTargetSurface): boolean {
  if (signal.targetSurface === targetSurface) return true
  if (signal.targetSurface === 'planning_governance') return true
  if (targetSurface === 'baseline' && signal.targetSurface === 'task_list') return true
  if (targetSurface === 'monthly_plan' && signal.targetSurface === 'task_list') return true
  return false
}

export function evaluatePreConfirmGovernanceGate(params: {
  projectId: string
  targetSurface: PlanningGovernanceTargetSurface
  signals: PlanningGovernanceSignal[]
}): PreConfirmGovernanceGateResult {
  const scopedSignals = params.signals.filter((signal) => signalAppliesToTarget(signal, params.targetSurface))
  const blockingSignals = scopedSignals.filter((signal) => signal.gateLevel === 'block_save')
  const confirmationSignals = scopedSignals.filter((signal) => signal.gateLevel === 'confirm')
  const hintSignals = scopedSignals.filter((signal) => signal.gateLevel === 'hint' || signal.gateLevel === 'explain')

  return {
    projectId: params.projectId,
    targetSurface: params.targetSurface,
    allowed: blockingSignals.length === 0,
    blocked: blockingSignals.length > 0,
    blockingSignals,
    confirmationSignals,
    hintSignals,
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {}
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function normalizeGovernanceSeverity(value: unknown): GovernanceSeverity {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'warning'
  return 'info'
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function pushWbsRollupSignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  issues: PlanningGovernanceWbsRollupIssueInput[] = [],
) {
  issues.forEach((issue, index) => {
    const gateLevel: PlanningGovernanceGateLevel =
      issue.level === 'error'
        ? 'block_save'
        : issue.level === 'warning'
          ? 'confirm'
          : 'hint'

    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm: 'wbs_plan_rollup',
      gateLevel,
      targetSurface: 'task_list',
      title: `WBS rollup ${issue.code}`,
      detail: issue.message,
      evidence: {
        code: issue.code,
        level: issue.level,
        rowId: issue.rowId ?? null,
        parentId: issue.parentId ?? null,
        field: issue.field ?? null,
        ...(issue.details ?? {}),
      },
      recommendation:
        gateLevel === 'block_save'
          ? 'Repair WBS parent-child structure, date windows or duration contribution mode before saving the plan rows.'
          : 'Confirm WBS rollup diagnostics before publishing or confirming the plan.',
      sourceId: `${projectId}:wbs_plan_rollup:${issue.rowId ?? issue.parentId ?? issue.code}:${index}`,
      taskId: issue.rowId ?? null,
    }))
  })
}

function pushBaselineValiditySignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  baselineValidity: PlanningGovernanceSignalContext['baselineValidity'],
) {
  const items = Array.isArray(baselineValidity)
    ? baselineValidity
    : baselineValidity
      ? [baselineValidity]
      : []

  for (const item of items) {
    const state = String(item.state ?? '').trim()
    const baselineStatus = String(item.baselineStatus ?? '').trim()
    if (state === 'valid' && baselineStatus !== 'pending_realign') continue

    const gateLevel: PlanningGovernanceGateLevel =
      state === 'needs_realign' || baselineStatus === 'pending_realign'
        ? 'confirm'
        : 'hint'

    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm: 'planning_revision_pool',
      gateLevel,
      targetSurface: 'baseline',
      title: 'Baseline validity needs realignment review',
      detail:
        state === 'needs_realign' || baselineStatus === 'pending_realign'
          ? 'Baseline validity rules indicate the current baseline may need realignment before it remains a commitment anchor.'
          : 'Baseline validity has insufficient data and should be reviewed before confirmation.',
      evidence: {
        baseline_id: item.baselineId ?? null,
        baseline_status: item.baselineStatus ?? null,
        state: item.state,
        triggered_rules: item.triggeredRules ?? [],
        compared_task_count: item.comparedTaskCount ?? null,
        deviated_task_count: item.deviatedTaskCount ?? null,
        deviated_task_ratio: item.deviatedTaskRatio ?? null,
        shifted_milestone_count: item.shiftedMilestoneCount ?? null,
        average_milestone_shift_days: item.averageMilestoneShiftDays ?? null,
        total_duration_deviation_ratio: item.totalDurationDeviationRatio ?? null,
      },
      recommendation: 'Confirm whether to realign the baseline or rebuild the revision pool before publishing.',
      sourceId: `${projectId}:planning_revision_pool:${item.baselineId ?? 'project'}`,
    }))
  }
}

function pushProgressAnomalySignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  anomalySignals: PlanningGovernanceProgressAnomalyInput[] = [],
) {
  for (const signal of anomalySignals) {
    const severity = normalizeGovernanceSeverity(signal.severity)
    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm: 'progress_anomaly',
      gateLevel: severity === 'critical' ? 'confirm' : 'hint',
      targetSurface: 'planning_governance',
      title: `Progress anomaly ${signal.code}`,
      detail: signal.summary,
      evidence: {
        code: signal.code,
        severity,
        acknowledged: signal.acknowledged ?? false,
        excluded_from_velocity_learning: signal.excludedFromVelocityLearning ?? false,
        confidence_action: signal.confidenceAction ?? 'confidence_only',
        ...(signal.metadata ?? {}),
      },
      recommendation:
        severity === 'critical'
          ? 'Confirm the progress anomaly before using it as governance context; it should not directly block publication.'
          : 'Keep the progress anomaly as a data quality and confidence hint.',
      sourceId: `${projectId}:progress_anomaly:${signal.taskId ?? 'project'}:${signal.code}`,
      taskId: signal.taskId ?? null,
    }))
  }
}

function pushTaskConstraintSignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  summaries: PlanningGovernanceTaskConstraintInput[] = [],
) {
  for (const summary of summaries) {
    const dependencyStatus = String(summary.dependencyStatus ?? '').trim()
    const conditionStatus = String(summary.conditionStatus ?? '').trim()
    const progressImpactLevel = String(summary.progressImpactLevel ?? '').trim()
    const blocked =
      summary.readyForStart === false
      || dependencyStatus === 'blocking'
      || conditionStatus === 'blocking'
      || summary.blockedForProgress === true
      || progressImpactLevel === 'blocked'
    const warning =
      progressImpactLevel === 'warning'
      || progressImpactLevel === 'partial'
      || String(summary.obstacleStatus ?? '').trim() === 'warning'
      || String(summary.obstacleStatus ?? '').trim() === 'partial_impact'

    if (!blocked && !warning) continue

    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm: 'task_constraint',
      gateLevel: blocked ? 'confirm' : 'hint',
      targetSurface: 'monthly_plan',
      title: blocked ? 'Task start constraints need confirmation' : 'Task constraint warning',
      detail: blocked
        ? 'Bound task dependencies, start conditions or progress blockers are not ready.'
        : 'Task constraint context indicates a warning that should be reviewed.',
      evidence: {
        ready_for_start: summary.readyForStart ?? null,
        dependency_status: summary.dependencyStatus ?? null,
        condition_status: summary.conditionStatus ?? null,
        obstacle_status: summary.obstacleStatus ?? null,
        progress_impact_level: summary.progressImpactLevel ?? null,
        blocked_for_progress: summary.blockedForProgress ?? null,
        dependency_count: summary.dependencyCount ?? null,
        advisory_dependency_count: summary.advisoryDependencyCount ?? null,
        total_dependency_count: summary.totalDependencyCount ?? null,
        unmet_dependency_count: summary.unmetDependencyCount ?? null,
        hard_condition_count: summary.hardConditionCount ?? null,
        unmet_hard_condition_count: summary.unmetHardConditionCount ?? null,
        open_obstacle_count: summary.openObstacleCount ?? null,
        source_event_type: summary.sourceEventType ?? null,
        source_event_key: summary.sourceEventKey ?? null,
        created_at: summary.createdAt ?? null,
        ...(summary.evidence ?? {}),
      },
      recommendation: blocked
        ? 'Confirm or resolve bound start conditions before monthly plan confirmation.'
        : 'Review task constraint diagnostics as a soft governance hint.',
      sourceId: summary.sourceEventKey
        ? `${projectId}:task_constraint:${summary.sourceEventKey}`
        : `${projectId}:task_constraint:${summary.taskId ?? summary.snapshotId ?? 'project'}`,
      taskId: summary.taskId ?? null,
    }))
  }
}

function pushLinkageSignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  linkageSignals: PlanningGovernanceLinkageSignalInput[] = [],
) {
  for (const signal of linkageSignals) {
    if (signal.boundToTask !== true) continue

    const severity = normalizeGovernanceSeverity(signal.severity)
    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm: signal.sourceAlgorithm,
      gateLevel: severity === 'info' ? 'hint' : 'confirm',
      targetSurface: signal.targetSurface ?? 'monthly_plan',
      title: signal.title ?? `${signal.sourceAlgorithm} linked plan prerequisite`,
      detail: signal.detail ?? `${signal.sourceAlgorithm} has a bound plan prerequisite that needs confirmation.`,
      evidence: {
        bound_to_task: true,
        severity,
        ...(signal.evidence ?? {}),
      },
      recommendation: 'Because this business-domain signal is explicitly bound to a plan task, confirm it before plan confirmation.',
      sourceId: signal.sourceId ?? `${projectId}:${signal.sourceAlgorithm}:${signal.taskId ?? 'project'}`,
      taskId: signal.taskId ?? null,
    }))
  }
}

function pushExplanationSignals(
  signals: PlanningGovernanceSignal[],
  projectId: string,
  explanationSignals: PlanningGovernanceExplanationSignalInput[] = [],
) {
  for (const signal of explanationSignals) {
    const sourceAlgorithm = signal.sourceAlgorithm
    const gateLevel: PlanningGovernanceGateLevel =
      signal.gateLevel === 'confirm' || signal.gateLevel === 'block_save'
        ? 'hint'
        : signal.gateLevel ?? (sourceAlgorithm === 'progress_deviation' ? 'explain' : 'hint')

    signals.push(buildGovernanceSignal({
      projectId,
      sourceAlgorithm,
      gateLevel,
      targetSurface: signal.targetSurface ?? (sourceAlgorithm === 'progress_deviation' ? 'reports' : 'planning_governance'),
      title: signal.title ?? `${sourceAlgorithm} governance context`,
      detail: signal.detail ?? `${sourceAlgorithm} provides explanation or candidate context for planning governance.`,
      evidence: {
        severity: normalizeGovernanceSeverity(signal.severity),
        ...(signal.evidence ?? {}),
      },
      recommendation:
        sourceAlgorithm === 'progress_deviation'
          ? 'Use this as attribution for why health or delivery changed; do not use it as a hard publication gate.'
          : 'Use this candidate or confidence context as a planning governance hint unless a curated rule promotes it.',
      sourceId: signal.sourceId ?? `${projectId}:${sourceAlgorithm}:${signal.taskId ?? 'project'}`,
      taskId: signal.taskId ?? null,
    }))
  }
}

export function buildGovernanceSignals(
  snapshot: PlanningGovernanceSnapshot,
  context: PlanningGovernanceSignalContext = {},
): PlanningGovernanceSignal[] {
  const signals: PlanningGovernanceSignal[] = []
  const mapping = snapshot.integrity.mapping_integrity
  const data = snapshot.integrity.data_integrity
  const system = snapshot.integrity.system_consistency

  const baselineAnchorBreaks = mapping.baseline_pending_count + mapping.baseline_merged_count
  if (baselineAnchorBreaks > 0) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'data_lineage',
      gateLevel: 'block_save',
      targetSurface: 'baseline',
      title: 'Baseline commitment anchors need repair',
      detail: `Baseline source mapping has ${mapping.baseline_pending_count} pending and ${mapping.baseline_merged_count} merged anchors.`,
      evidence: {
        baseline_pending_count: mapping.baseline_pending_count,
        baseline_merged_count: mapping.baseline_merged_count,
      },
      recommendation: 'Repair baseline source mapping before publishing or confirming the commitment baseline.',
      sourceId: `${snapshot.project_id}:data_lineage:baseline_anchor`,
    }))
  }

  if (mapping.monthly_carryover_count > 0) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'data_lineage',
      gateLevel: 'confirm',
      targetSurface: 'monthly_plan',
      title: 'Monthly carryover lineage needs confirmation',
      detail: `Monthly carryover contains ${mapping.monthly_carryover_count} items without a stable source anchor.`,
      evidence: {
        monthly_carryover_count: mapping.monthly_carryover_count,
      },
      recommendation: 'Confirm or repair carryover lineage before monthly plan confirmation.',
      sourceId: `${snapshot.project_id}:data_lineage:monthly_carryover`,
    }))
  }

  const dataIssueCount =
    data.missing_participant_unit_count +
    data.missing_scope_dimension_count +
    data.missing_progress_snapshot_count
  if (dataIssueCount > 0) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'data_quality',
      gateLevel: 'confirm',
      targetSurface: 'planning_governance',
      title: 'Planning data quality needs confirmation',
      detail: `Planning data has ${dataIssueCount} quality issues across participants, scope and progress snapshots.`,
      evidence: {
        total_tasks: data.total_tasks,
        missing_participant_unit_count: data.missing_participant_unit_count,
        missing_scope_dimension_count: data.missing_scope_dimension_count,
        missing_progress_snapshot_count: data.missing_progress_snapshot_count,
      },
      recommendation: 'Keep row-level validation in the editing surface and confirm remaining data gaps before publication.',
      sourceId: `${snapshot.project_id}:data_quality:planning_integrity`,
    }))
  }

  for (const item of snapshot.integrity.milestone_integrity.items) {
    if (item.state === 'aligned') continue

    const gateLevel: PlanningGovernanceGateLevel =
      item.gate_level ?? (item.state === 'needs_attention' ? 'confirm' : 'block_save')
    const targetSurface: PlanningGovernanceTargetSurface =
      item.target_surface ?? (gateLevel === 'block_save' ? 'baseline' : 'planning_governance')

    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'milestone_integrity',
      gateLevel,
      targetSurface,
      title: `${item.milestone_key} milestone ${item.state.replace('_', ' ')}`,
      detail: `Milestone ${item.milestone_key} ${item.title} has issues: ${item.issues.join('; ') || 'unknown scenario'}.`,
      evidence: {
        milestone_id: item.milestone_id,
        milestone_key: item.milestone_key,
        state: item.state,
        planned_date: item.planned_date,
        current_planned_date: item.current_planned_date,
        actual_date: item.actual_date,
        issues: item.issues,
        scenario_type: item.scenario_type ?? null,
        scenario_label: item.scenario_label ?? null,
        suggested_action: item.suggested_action ?? null,
        commitment_anchor: item.commitment_anchor ?? null,
        critical_context: item.critical_context ?? false,
      },
      recommendation:
        gateLevel === 'block_save'
          ? 'Repair M1-M9 milestone dates or commitment anchors before publishing the plan.'
          : item.suggested_action ?? 'Review M1-M9 milestone drift during plan governance confirmation.',
      sourceId: `${snapshot.project_id}:milestone_integrity:${item.milestone_id}`,
    }))
  }

  const systemIssueCount = system.inconsistent_milestones + system.stale_snapshot_count
  if (systemIssueCount > 0) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'planning_integrity',
      gateLevel: 'confirm',
      targetSurface: 'planning_governance',
      title: 'Planning integrity needs review',
      detail: `Planning integrity has ${system.inconsistent_milestones} inconsistent milestones and ${system.stale_snapshot_count} stale snapshots.`,
      evidence: {
        inconsistent_milestones: system.inconsistent_milestones,
        stale_snapshot_count: system.stale_snapshot_count,
      },
      recommendation: 'Review integrity diagnostics before confirmation; only explicit blocking findings should stop save.',
      sourceId: `${snapshot.project_id}:planning_integrity:system_consistency`,
    }))
  }

  for (const window of snapshot.anomaly.windows.filter((item) => item.triggered)) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'system_anomaly',
      gateLevel: window.window_days >= 5 ? 'confirm' : 'hint',
      targetSurface: 'planning_governance',
      title: `Passive reorder ${window.window_days}d window triggered`,
      detail: `Passive reorder window ${window.window_days}d has ${window.event_count} events affecting ${window.affected_task_count} tasks.`,
      evidence: {
        window_days: window.window_days,
        event_count: window.event_count,
        affected_task_count: window.affected_task_count,
        cumulative_event_count: window.cumulative_event_count,
        average_offset_days: window.average_offset_days ?? null,
        key_task_count: window.key_task_count ?? null,
      },
      recommendation:
        window.window_days >= 5
          ? 'Confirm whether passive reorder should become an explicit revision or be closed with a change summary.'
          : 'Review execution changes and continue monitoring passive reorder state.',
      sourceId: `${snapshot.project_id}:system_anomaly:passive_reorder:${window.window_days}`,
    }))
  }

  if (snapshot.health.score < 80) {
    signals.push(buildGovernanceSignal({
      projectId: snapshot.project_id,
      sourceAlgorithm: 'planning_health',
      gateLevel: snapshot.health.score < 60 ? 'explain' : 'hint',
      targetSurface: 'planning_governance',
      title: 'Planning health score needs attention',
      detail: `Planning health score is ${snapshot.health.score}/100; health score explains governance pressure but does not block save by itself.`,
      evidence: {
        score: snapshot.health.score,
        status: snapshot.health.status,
        breakdown: snapshot.health.breakdown,
      },
      recommendation: 'Use underlying block_save or confirm signals as the actual gate; keep the health score as summary context.',
      sourceId: `${snapshot.project_id}:planning_health`,
    }))
  }

  pushWbsRollupSignals(signals, snapshot.project_id, context.wbsRollupIssues)
  pushBaselineValiditySignals(signals, snapshot.project_id, context.baselineValidity)
  pushProgressAnomalySignals(signals, snapshot.project_id, context.progressAnomalySignals)
  pushTaskConstraintSignals(signals, snapshot.project_id, context.taskConstraintSummaries)
  pushLinkageSignals(signals, snapshot.project_id, context.linkageSignals)
  pushExplanationSignals(signals, snapshot.project_id, context.explanationSignals)

  return signals
}

function groupSnapshotsByTaskId(snapshots: TaskProgressSnapshot[]): Map<string, TaskProgressSnapshot[]> {
  const grouped = new Map<string, TaskProgressSnapshot[]>()
  for (const snapshot of snapshots) {
    const taskId = normalizeOptionalText(snapshot.task_id)
    if (!taskId) continue
    grouped.set(taskId, [...(grouped.get(taskId) ?? []), snapshot])
  }
  return grouped
}

function buildProgressAnomalyContextFromSnapshots(snapshots: TaskProgressSnapshot[]): PlanningGovernanceProgressAnomalyInput[] {
  const signals: PlanningGovernanceProgressAnomalyInput[] = []
  for (const [taskId, taskSnapshots] of groupSnapshotsByTaskId(snapshots).entries()) {
    for (const signal of detectProgressQualitySignals(taskSnapshots)) {
      signals.push({
        taskId,
        code: signal.code,
        severity: signal.severity,
        summary: signal.summary,
        acknowledged: signal.acknowledged,
        excludedFromVelocityLearning: signal.excludedFromVelocityLearning,
        confidenceAction: signal.confidenceAction,
        metadata: signal.metadata,
      })
    }
  }
  return signals
}

function mapConstraintSnapshotRow(row: TaskConstraintSnapshotRow): PlanningGovernanceTaskConstraintInput {
  const summary = toRecord(row.readiness_summary)
  return {
    taskId: normalizeOptionalText(row.task_id),
    readyForStart: row.ready_for_start == null ? null : toBoolean(row.ready_for_start),
    dependencyStatus: normalizeOptionalText(row.dependency_status),
    conditionStatus: normalizeOptionalText(row.condition_status),
    obstacleStatus: normalizeOptionalText(row.obstacle_status),
    progressImpactLevel: normalizeOptionalText(row.progress_impact_level),
    blockedForProgress: row.blocked_for_progress == null ? null : toBoolean(row.blocked_for_progress),
    dependencyCount: toNumberOrNull(summary.dependencyCount ?? summary.dependency_count) ?? undefined,
    advisoryDependencyCount: toNumberOrNull(summary.advisoryDependencyCount ?? summary.advisory_dependency_count) ?? undefined,
    totalDependencyCount: toNumberOrNull(summary.totalDependencyCount ?? summary.total_dependency_count) ?? undefined,
    unmetDependencyCount: toNumberOrNull(summary.unmetDependencyCount ?? summary.unmet_dependency_count) ?? undefined,
    hardConditionCount: toNumberOrNull(summary.hardConditionCount ?? summary.hard_condition_count) ?? undefined,
    unmetHardConditionCount: toNumberOrNull(summary.unmetHardConditionCount ?? summary.unmet_hard_condition_count) ?? undefined,
    openObstacleCount: toNumberOrNull(summary.openObstacleCount ?? summary.open_obstacle_count) ?? undefined,
    sourceEventType: row.source_event_type ?? null,
    sourceEventKey: row.source_event_key ?? null,
    snapshotId: row.id ?? null,
    createdAt: row.created_at ?? null,
  }
}

function mapProjectScheduleStateRow(row: ProjectScheduleStateRow): PlanningGovernanceExplanationSignalInput | null {
  const state = normalizeOptionalText(row.state)
  if (!state || state === 'normal') return null

  return {
    sourceAlgorithm: 'project_schedule_state',
    sourceId: row.id ? `project_schedule_state:${row.id}` : null,
    severity: state === 'blocked' || state === 'overcompressed' ? 'warning' : 'info',
    title: `Project schedule state ${state}`,
    detail: `Project schedule state is ${state} for ${row.scope_type ?? 'project'} scope.`,
    evidence: {
      scope_type: row.scope_type ?? null,
      scope_id: row.scope_id ?? null,
      state,
      confidence_score: toNumberOrNull(row.confidence_score),
      window_days: toNumberOrNull(row.window_days),
      window_end_date: row.window_end_date ?? null,
      downstream_policy: row.downstream_policy ?? {},
      metrics: row.metrics ?? {},
      evidence: row.evidence ?? null,
    },
  }
}

function mapDurationForecastRow(row: TaskDurationForecastSignalRow): PlanningGovernanceExplanationSignalInput[] {
  const forecastDelayDays = toNumberOrNull(row.forecast_delay_days) ?? 0
  const confidenceScore = toNumberOrNull(row.confidence_score)
  const delayRiskIndex = toNumberOrNull(row.delay_risk_index)
  const shouldEmitForecast =
    forecastDelayDays > 0
    || (delayRiskIndex !== null && delayRiskIndex >= 0.6)
    || String(row.confidence_level ?? '').trim().toLowerCase() === 'low'
  const signals: PlanningGovernanceExplanationSignalInput[] = []

  if (shouldEmitForecast) {
    signals.push({
      sourceAlgorithm: 'task_duration_forecast',
      sourceId: row.id ? `task_duration_forecast:${row.id}` : null,
      taskId: row.task_id ?? null,
      severity: forecastDelayDays >= 7 || (delayRiskIndex !== null && delayRiskIndex >= 0.8) ? 'warning' : 'info',
      title: 'Task duration forecast needs review',
      detail: `Current duration forecast indicates ${forecastDelayDays} delay days.`,
      evidence: {
        forecast_delay_days: forecastDelayDays,
        confidence_level: row.confidence_level ?? null,
        confidence_score: confidenceScore,
        delay_risk_index: delayRiskIndex,
        business_reason: row.business_reason ?? null,
        generated_at: row.generated_at ?? null,
      },
    })
  }

  if (row.factor_summary || row.calculation_context) {
    signals.push({
      sourceAlgorithm: 'duration_context',
      sourceId: row.id ? `duration_context:${row.id}` : null,
      taskId: row.task_id ?? null,
      severity: 'info',
      title: 'Duration context explanation available',
      detail: 'Duration context explains why the forecast changed and remains candidate or confidence context.',
      evidence: {
        factor_summary: row.factor_summary ?? {},
        calculation_context: row.calculation_context ?? {},
        forecast_delay_days: forecastDelayDays,
      },
    })
  }

  return signals
}

async function collectPlanningGovernanceSignalContext(params: {
  projectId: string
  monthlyPlans: MonthlyPlan[]
  snapshots: TaskProgressSnapshot[]
}): Promise<PlanningGovernanceSignalContext> {
  const baselineRows = await executeSQL<{ id: string; status?: string | null }>(
    'SELECT id, status FROM task_baselines WHERE project_id = ?',
    [params.projectId],
  )
  const taskConstraintRows = await executeSQL<TaskConstraintSnapshotRow>(
    'SELECT * FROM task_constraint_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 100',
    [params.projectId],
  )
  const scheduleStateRows = await executeSQL<ProjectScheduleStateRow>(
    'SELECT * FROM project_schedule_states WHERE project_id = ? ORDER BY window_end_date DESC, created_at DESC LIMIT 20',
    [params.projectId],
  )
  const durationForecastRows = await executeSQL<TaskDurationForecastSignalRow>(
    'SELECT * FROM task_duration_forecasts WHERE project_id = ? AND is_current = true ORDER BY forecast_delay_days DESC, generated_at DESC LIMIT 50',
    [params.projectId],
  )

  return {
    baselineValidity: [
      ...baselineRows
        .filter((row) => String(row.status ?? '').trim() === 'pending_realign')
        .map((row) => ({
          baselineId: row.id,
          baselineStatus: row.status ?? null,
          state: 'needs_realign' as const,
          triggeredRules: ['task_deviation_ratio'],
          isValid: false,
        })),
      ...params.monthlyPlans
        .filter((row) => String(row.status ?? '').trim() === 'pending_realign')
        .map((row) => ({
          baselineId: `monthly_plan:${row.id}`,
          baselineStatus: row.status ?? null,
          state: 'needs_realign' as const,
          triggeredRules: ['task_deviation_ratio'],
          isValid: false,
        })),
    ],
    progressAnomalySignals: buildProgressAnomalyContextFromSnapshots(params.snapshots),
    taskConstraintSummaries: taskConstraintRows.map(mapConstraintSnapshotRow),
    explanationSignals: [
      ...scheduleStateRows.map(mapProjectScheduleStateRow).filter((signal): signal is PlanningGovernanceExplanationSignalInput => Boolean(signal)),
      ...durationForecastRows.flatMap(mapDurationForecastRow),
    ],
  }
}

export function buildCloseoutGovernanceAlerts(params: {
  projectId: string
  plans: MonthlyPlan[]
  now?: Date
}): PlanningGovernanceAlert[] {
  const now = params.now ?? new Date()
  const alerts: PlanningGovernanceAlert[] = []

  for (const plan of params.plans) {
    if (String(plan.status ?? '').trim() !== 'confirmed') continue
    if (plan.closeout_at) continue

    const dueTimestamp = monthBoundaryTimestamp(plan.month)
    if (dueTimestamp === null) continue

    const overdueDays = closeoutOverdueDays(dueTimestamp, now)
    if (overdueDays < GOVERNANCE_CLOSEOUT_THRESHOLDS[0]) continue

    for (const threshold of GOVERNANCE_CLOSEOUT_THRESHOLDS) {
      if (overdueDays < threshold) continue

      const kind =
        threshold === 3
          ? 'closeout_reminder'
          : threshold === 5
            ? 'closeout_escalation'
            : 'closeout_owner_attention'

      alerts.push({
        kind,
        severity: threshold === 3 ? 'warning' : 'critical',
        title:
          threshold === 3
            ? '月度计划关账超期提醒'
            : threshold === 5
              ? '月度计划关账超期升级'
              : 'Monthly plan closeout owner attention',
        detail: buildCloseoutAlertDetail(plan, overdueDays, threshold),
        source_id: `${params.projectId}:monthly_plan:${plan.id}:closeout:${threshold}`,
      })
    }
  }

  return alerts
}

export function buildExecutionReorderGovernanceAlerts(params: {
  projectId: string
  anomaly: PassiveReorderDetectionReport
  now?: Date
}): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []
  const windows = new Map(params.anomaly.windows.map((window) => [window.window_days, window]))

  for (const threshold of GOVERNANCE_REORDER_THRESHOLDS) {
    const window = windows.get(threshold)
    if (!window?.triggered) continue

    const kind =
      threshold === 3
        ? 'reorder_reminder'
        : threshold === 5
          ? 'reorder_escalation'
          : 'reorder_summary'

    alerts.push({
      kind,
      severity: threshold === 3 ? 'warning' : 'critical',
      title:
        threshold === 3
          ? 'Passive reorder day 3 reminder'
          : threshold === 5
            ? 'Passive reorder day 5 escalation'
            : 'Passive reorder ended and generated a change summary',
      detail: buildReorderAlertDetail(window, threshold),
      source_id: `${params.projectId}:passive_reorder:${threshold}`,
    })
  }

  return alerts
}

export function buildAdHocCarryoverGovernanceAlerts(params: {
  projectId: string
  tasks: Task[]
  snapshots: TaskProgressSnapshot[]
  now?: Date
}): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []
  const snapshotsByTask = new Map<string, Set<string>>()

  for (const snapshot of params.snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue

    const planningSourceType = String(snapshot.planning_source_type ?? 'execution').trim()
    if (!['execution', 'current_schedule'].includes(planningSourceType)) continue

    const month = normalizeMonthKey(snapshot.snapshot_date ?? snapshot.created_at)
    if (!month) continue

    if (!snapshotsByTask.has(taskId)) {
      snapshotsByTask.set(taskId, new Set())
    }

    snapshotsByTask.get(taskId)!.add(month)
  }

  for (const task of params.tasks) {
    const sourceType = String(task.task_source ?? '').trim().toLowerCase()
    const isAdHoc =
      sourceType === 'ad_hoc' ||
      (!sourceType && !task.monthly_plan_item_id && !task.baseline_item_id)

    if (!isAdHoc) continue

    const taskMonths = snapshotsByTask.get(task.id)
    const monthCount = taskMonths ? getLongestConsecutiveMonthStreak(taskMonths) : 0
    if (monthCount < 3) continue

    alerts.push({
      kind: 'ad_hoc_cross_month_reminder',
      severity: 'warning',
      title: 'Ad hoc task missing monthly plan mapping',
      detail: `Task "${task.title}" has been executed as ad_hoc for ${monthCount} months and is not linked to a monthly plan. Please include it in monthly planning.`,
      source_id: `${params.projectId}:task:${task.id}:ad_hoc:month3`,
      task_id: task.id,
    })
  }

  return alerts
}

function buildGovernanceStateKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => Boolean(part))
    .join(':')
}

export function buildCloseoutGovernanceStates(params: {
  projectId: string
  plans: MonthlyPlan[]
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []

  for (const plan of params.plans) {
    if (String(plan.status ?? '').trim() !== 'confirmed') continue
    if (plan.closeout_at) continue

    const dueTimestamp = monthBoundaryTimestamp(plan.month)
    if (dueTimestamp === null) continue

    const overdueDays = closeoutOverdueDays(dueTimestamp, now)
    if (overdueDays < GOVERNANCE_CLOSEOUT_THRESHOLDS[0]) continue

    for (const threshold of GOVERNANCE_CLOSEOUT_THRESHOLDS) {
      if (overdueDays < threshold) continue

      const kind =
        threshold === 3
          ? 'closeout_reminder'
          : threshold === 5
            ? 'closeout_overdue_signal'
            : 'closeout_owner_attention'

      states.push({
        id: uuidv4(),
        project_id: params.projectId,
        state_key: buildGovernanceStateKey([params.projectId, 'monthly_plan', plan.id, kind]),
        category: 'closeout',
        kind,
        status: threshold === 7 ? 'active' : 'active',
        severity: threshold === 3 ? 'warning' : 'critical',
        title:
          threshold === 3
            ? '月度计划关账提醒'
            : threshold === 5
              ? '月度计划关账超期信号'
              : 'Monthly plan closeout owner attention',
        detail: buildCloseoutAlertDetail(plan, overdueDays, threshold),
        threshold_day: threshold,
        dashboard_signal: threshold === 5,
        payload: {
          monthly_plan_id: plan.id,
          month: plan.month,
          overdue_days: overdueDays,
          threshold_day: threshold,
          owner_attention_required: threshold === 7,
          dashboard_signal: threshold === 5,
        },
        source_entity_type: 'monthly_plan',
        source_entity_id: plan.id,
        active_from: now.toISOString(),
        resolved_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
    }
  }

  return states
}

export function buildExecutionReorderGovernanceStates(params: {
  projectId: string
  anomaly: PassiveReorderDetectionReport
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []
  const windows = new Map(params.anomaly.windows.map((window) => [window.window_days, window]))

  for (const threshold of GOVERNANCE_REORDER_THRESHOLDS) {
    const window = windows.get(threshold)
    if (!window?.triggered) continue

    const kind =
      threshold === 3
        ? 'reorder_reminder'
        : threshold === 5
          ? 'reorder_escalation'
          : 'reorder_summary'

    states.push({
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildGovernanceStateKey([params.projectId, 'passive_reorder', threshold, kind]),
      category: 'reorder',
      kind,
      status: threshold === 7 ? 'resolved' : 'active',
      severity: threshold === 3 ? 'warning' : 'critical',
      title:
        threshold === 3
          ? '被动重排提醒'
          : threshold === 5
            ? '被动重排升级'
            : '被动重排已自动结束并生成变更摘要',
      detail: buildReorderAlertDetail(window, threshold),
      threshold_day: threshold,
      dashboard_signal: false,
      payload: {
        window_days: window.window_days,
        event_count: window.event_count,
        affected_task_count: window.affected_task_count,
        average_offset_days: window.average_offset_days ?? 0,
        key_task_count: window.key_task_count ?? 0,
        automatic_closeout: threshold === 7,
        change_summary_generated: threshold === 7,
      },
      source_entity_type: 'change_log',
      source_entity_id: buildGovernanceStateKey([params.projectId, 'passive_reorder', threshold]),
      active_from: now.toISOString(),
      resolved_at: threshold === 7 ? now.toISOString() : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return states
}

export function buildAdHocCarryoverGovernanceStates(params: {
  projectId: string
  tasks: Task[]
  snapshots: TaskProgressSnapshot[]
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []
  const snapshotsByTask = new Map<string, Set<string>>()

  for (const snapshot of params.snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue

    const planningSourceType = String(snapshot.planning_source_type ?? 'execution').trim()
    if (!['execution', 'current_schedule'].includes(planningSourceType)) continue

    const month = normalizeMonthKey(snapshot.snapshot_date ?? snapshot.created_at)
    if (!month) continue

    if (!snapshotsByTask.has(taskId)) {
      snapshotsByTask.set(taskId, new Set())
    }

    snapshotsByTask.get(taskId)!.add(month)
  }

  for (const task of params.tasks) {
    const sourceType = String(task.task_source ?? '').trim().toLowerCase()
    const isAdHoc =
      sourceType === 'ad_hoc' ||
      (!sourceType && !task.monthly_plan_item_id && !task.baseline_item_id)

    if (!isAdHoc) continue

    const taskMonths = snapshotsByTask.get(task.id)
    const monthCount = taskMonths ? getLongestConsecutiveMonthStreak(taskMonths) : 0
    if (monthCount < 3) continue

    states.push({
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildGovernanceStateKey([params.projectId, 'task', task.id, 'ad_hoc_cross_month']),
      category: 'ad_hoc',
      kind: 'ad_hoc_cross_month_reminder',
      status: 'active',
      severity: 'warning',
      title: 'Ad hoc task missing monthly plan mapping',
      detail: `Task "${task.title}" has been executed as ad_hoc for ${monthCount} months and is not linked to a monthly plan. Please include it in monthly planning.`,
      threshold_day: monthCount,
      dashboard_signal: false,
      payload: {
        task_id: task.id,
        consecutive_months: monthCount,
        task_source: sourceType || 'ad_hoc',
      },
      source_entity_type: 'task',
      source_entity_id: task.id,
      active_from: now.toISOString(),
      resolved_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return states
}

function buildManualReorderStateKey(projectId: string) {
  return buildGovernanceStateKey([projectId, 'manual_reorder_session'])
}

function normalizeManualReorderMode(value: unknown): ManualReorderMode {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'sequence') return 'sequence'
  if (normalized === 'date_shift') return 'date_shift'
  if (normalized === 'scope_change') return 'scope_change'
  return 'mixed'
}

function parseManualReorderPayload(value: unknown): ManualReorderSessionPayload | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  return {
    reorder_mode: normalizeManualReorderMode(record.reorder_mode),
    started_by: typeof record.started_by === 'string' ? record.started_by : null,
    started_at: String(record.started_at ?? ''),
    note: typeof record.note === 'string' ? record.note : null,
    start_snapshot: (record.start_snapshot as ManualReorderStartSnapshot) ?? {
      total_tasks: 0,
      critical_task_count: 0,
      milestone_task_count: 0,
      confirmed_baseline_count: 0,
      active_monthly_plan_count: 0,
      pending_realign_count: 0,
    },
    ended_by: typeof record.ended_by === 'string' ? record.ended_by : null,
    ended_at: typeof record.ended_at === 'string' ? record.ended_at : null,
    end_summary: (record.end_summary as ManualReorderEndSummary | null | undefined) ?? null,
    completion_note: typeof record.completion_note === 'string' ? record.completion_note : null,
  }
}

async function collectManualReorderStartSnapshot(projectId: string): Promise<ManualReorderStartSnapshot> {
  const tasks = await executeSQL<Task>('SELECT id, is_milestone FROM tasks WHERE project_id = ?', [projectId])
  const baselines = await executeSQL<{ id: string; status?: string | null }>(
    'SELECT id, status FROM task_baselines WHERE project_id = ?',
    [projectId],
  )
  const monthlyPlans = await executeSQL<{ id: string; status?: string | null }>(
    'SELECT id, status FROM monthly_plans WHERE project_id = ?',
    [projectId],
  )
  const criticalTaskIds = await getCriticalPathTaskIds(projectId)

  return {
    total_tasks: tasks.length,
    critical_task_count: tasks.filter((task) => criticalTaskIds.has(task.id)).length,
    milestone_task_count: tasks.filter((task) => Boolean(task.is_milestone)).length,
    confirmed_baseline_count: baselines.filter((row) => String(row.status ?? '').trim() === 'confirmed').length,
    active_monthly_plan_count: monthlyPlans.filter((row) => ['draft', 'confirmed', 'pending_realign', 'revising'].includes(String(row.status ?? '').trim())).length,
    pending_realign_count: [
      ...baselines.filter((row) => String(row.status ?? '').trim() === 'pending_realign'),
      ...monthlyPlans.filter((row) => String(row.status ?? '').trim() === 'pending_realign'),
    ].length,
  }
}

async function collectManualReorderEndSummary(projectId: string, startedAt: string): Promise<ManualReorderEndSummary> {
  const logs = await executeSQL<{
    entity_type?: string | null
    entity_id?: string | null
    field_name?: string | null
    changed_at?: string | null
  }>(
    'SELECT entity_type, entity_id, field_name, changed_at FROM change_logs WHERE project_id = ? ORDER BY changed_at ASC',
    [projectId],
  )

  const startedAtValue = new Date(startedAt).getTime()
  const scopedLogs = logs.filter((row) => {
    const changedAtValue = new Date(String(row.changed_at ?? '')).getTime()
    return Number.isFinite(changedAtValue) && changedAtValue >= startedAtValue
  })

  const taskIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'task')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const baselineIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'baseline')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const monthlyPlanIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'monthly_plan')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const fieldNames = new Set(
    scopedLogs
      .map((row) => String(row.field_name ?? '').trim())
      .filter(Boolean),
  )

  return {
    duration_minutes: Math.max(0, Math.round((Date.now() - startedAtValue) / 60000)),
    changed_task_count: taskIds.size,
    changed_baseline_count: baselineIds.size,
    changed_monthly_plan_count: monthlyPlanIds.size,
    changed_field_count: fieldNames.size,
    change_log_count: scopedLogs.length,
  }
}

async function listActiveManualReorderStates(projectId: string): Promise<PlanningGovernanceState[]> {
  return await executeSQL<PlanningGovernanceState>(
    'SELECT * FROM planning_governance_states WHERE project_id = ? AND category = ? AND kind = ? AND status = ? ORDER BY created_at DESC',
    [projectId, 'reorder', 'manual_reorder_session', 'active'],
  )
}

async function syncPlanningGovernanceStates(projectId: string, states: PlanningGovernanceState[]): Promise<PlanningGovernanceState[]> {
  const now = new Date().toISOString()
  const existing = await executeSQL<PlanningGovernanceState>('SELECT * FROM planning_governance_states WHERE project_id = ?', [projectId])
  const existingByKey = new Map(existing.map((row) => [row.state_key, row]))
  const currentKeys = new Set(states.map((state) => state.state_key))
  const persisted: PlanningGovernanceState[] = []

  for (const state of states) {
    const prior = existingByKey.get(state.state_key)
    const row: PlanningGovernanceState = {
      ...state,
      id: prior?.id ?? state.id ?? uuidv4(),
      active_from: prior?.active_from ?? state.active_from ?? now,
      resolved_at: state.status === 'resolved' ? (state.resolved_at ?? now) : null,
      created_at: prior?.created_at ?? state.created_at ?? now,
      updated_at: now,
    }

    await executeSQL(
      `INSERT INTO planning_governance_states
        (id, project_id, state_key, category, kind, status, severity, title, detail, threshold_day, dashboard_signal, payload, source_entity_type, source_entity_id, active_from, resolved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         project_id = excluded.project_id,
         category = excluded.category,
         kind = excluded.kind,
         status = excluded.status,
         severity = excluded.severity,
         title = excluded.title,
         detail = excluded.detail,
         threshold_day = excluded.threshold_day,
         dashboard_signal = excluded.dashboard_signal,
         payload = excluded.payload,
         source_entity_type = excluded.source_entity_type,
         source_entity_id = excluded.source_entity_id,
         active_from = excluded.active_from,
         resolved_at = excluded.resolved_at,
         updated_at = excluded.updated_at`,
      [
        row.id,
        row.project_id,
        row.state_key,
        row.category,
        row.kind,
        row.status,
        row.severity,
        row.title,
        row.detail,
        row.threshold_day ?? null,
        row.dashboard_signal ? 1 : 0,
        row.payload ?? {},
        row.source_entity_type ?? null,
        row.source_entity_id ?? null,
        row.active_from ?? null,
        row.resolved_at ?? null,
        row.created_at,
        row.updated_at,
      ],
    )

    persisted.push(row)
  }

  for (const row of existing) {
    if (currentKeys.has(row.state_key) || row.status !== 'active') continue

    const resolvedAt = now
    await executeSQL(
      'UPDATE planning_governance_states SET status = ?, resolved_at = ?, updated_at = ? WHERE state_key = ?',
      ['resolved', resolvedAt, resolvedAt, row.state_key],
    )
  }

  return persisted
}

async function upsertPlanningGovernanceState(state: PlanningGovernanceState): Promise<PlanningGovernanceState> {
  await executeSQL(
    `INSERT INTO planning_governance_states
      (id, project_id, state_key, category, kind, status, severity, title, detail, threshold_day, dashboard_signal, payload, source_entity_type, source_entity_id, active_from, resolved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(state_key) DO UPDATE SET
       project_id = excluded.project_id,
       category = excluded.category,
       kind = excluded.kind,
       status = excluded.status,
       severity = excluded.severity,
       title = excluded.title,
       detail = excluded.detail,
       threshold_day = excluded.threshold_day,
       dashboard_signal = excluded.dashboard_signal,
       payload = excluded.payload,
       source_entity_type = excluded.source_entity_type,
       source_entity_id = excluded.source_entity_id,
       active_from = excluded.active_from,
       resolved_at = excluded.resolved_at,
       updated_at = excluded.updated_at`,
    [
      state.id,
      state.project_id,
      state.state_key,
      state.category,
      state.kind,
      state.status,
      state.severity,
      state.title,
      state.detail,
      state.threshold_day ?? null,
      state.dashboard_signal ? 1 : 0,
      state.payload ?? {},
      state.source_entity_type ?? null,
      state.source_entity_id ?? null,
      state.active_from ?? null,
      state.resolved_at ?? null,
      state.created_at,
      state.updated_at,
    ],
  )

  return state
}

export function buildAlerts(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []

  if (snapshot.health.score < 80) {
    alerts.push({
      kind: 'health',
      severity: getAlertSeverity(snapshot.health),
      title: 'Planning health needs attention',
      detail: `Health score is ${snapshot.health.score}/100. M1-M9 score ${snapshot.health.breakdown.m1_m9_score}, passive reorder penalty ${snapshot.health.breakdown.passive_reorder_penalty}.`,
      source_id: `${snapshot.project_id}:health`,
    })
  }

  const integritySummary = snapshot.integrity
  const dataIssues =
    integritySummary.data_integrity.missing_participant_unit_count +
    integritySummary.data_integrity.missing_scope_dimension_count +
    integritySummary.data_integrity.missing_progress_snapshot_count
  const mappingIssues =
    integritySummary.mapping_integrity.baseline_pending_count +
    integritySummary.mapping_integrity.baseline_merged_count +
    integritySummary.mapping_integrity.monthly_carryover_count
  const milestoneIssues =
    integritySummary.milestone_integrity.summary.blocked +
    integritySummary.milestone_integrity.summary.missing_data +
    integritySummary.milestone_integrity.summary.needs_attention
  const systemIssues = integritySummary.system_consistency.inconsistent_milestones + integritySummary.system_consistency.stale_snapshot_count

  if (dataIssues > 0 || mappingIssues > 0 || milestoneIssues > 0 || systemIssues > 0) {
    alerts.push({
      kind: 'integrity',
      severity: getAlertSeverity(snapshot.integrity),
      title: 'Planning integrity needs review',
      detail: `Data issues ${dataIssues}, mapping issues ${mappingIssues}, milestone issues ${milestoneIssues}, system issues ${systemIssues}.`,
      source_id: `${snapshot.project_id}:integrity`,
    })
  }

  const mappingOrphanAlert = buildMappingOrphanPointerAlert(snapshot)
  if (mappingOrphanAlert) {
    alerts.push(mappingOrphanAlert)
  }

  alerts.push(...buildMilestoneScenarioAlerts(snapshot))

  const triggeredWindows = snapshot.anomaly.windows.filter((window) => window.triggered)
  if (triggeredWindows.length > 0) {
    alerts.push({
      kind: 'anomaly',
      severity: getAlertSeverity(snapshot.anomaly),
      title: 'Passive reorder detected',
      detail: triggeredWindows
        .map((window) => `${window.window_days}d window: ${window.event_count} events, ${window.key_task_count ?? 0} key tasks, average offset ${window.average_offset_days ?? 0} days`)
        .join(' | '),
      source_id: `${snapshot.project_id}:anomaly`,
    })
  }

  return alerts
}

async function getProjectRecipients(projectId: string, scope: 'owner' | 'owner_admin' = 'owner_admin'): Promise<string[]> {
  const project = await executeSQLOne<ProjectOwnerRow>(
    'SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1',
    [projectId],
  )
  const members = await executeSQL<ProjectMemberRow>(
    'SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?',
    [projectId],
  )

  const ownerRecipients = uniqueStrings([project?.owner_id ?? null])
  if (scope === 'owner') {
    if (ownerRecipients.length > 0) {
      return ownerRecipients
    }
  }

  return uniqueStrings([
    ...ownerRecipients,
    ...((members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level) === 'owner')
      .map((member) => member.user_id)),
  ])
}

async function persistAlertNotification(projectId: string, alert: PlanningGovernanceAlert): Promise<Notification | null> {
  const recipients = await getProjectRecipients(projectId, getProjectNotificationScope(alert.kind))
  if (recipients.length === 0) return null
  const notificationCategory = getPlanningGovernanceNotificationCategory(alert.kind)

  const existing = await findNotification({
    projectId,
    sourceEntityType: 'planning_governance',
    sourceEntityId: alert.source_id,
    type: `planning_gov_${alert.kind}`,
  })

  if (existing) return existing

  const now = new Date().toISOString()
  return await notificationTouchpointService.emit({
    id: uuidv4(),
    project_id: projectId,
    type: `planning_gov_${alert.kind}`,
    notification_type: getPlanningGovernanceNotificationType(alert.kind),
    severity: alert.severity,
    title: alert.title,
    content: alert.detail,
    is_read: false,
    is_broadcast: alert.severity === 'critical',
    source_entity_type: 'planning_governance',
    source_entity_id: alert.source_id,
    category: notificationCategory,
    task_id: alert.task_id ?? null,
    recipients,
    status: 'unread',
    touchpoint_type: 'dashboard_todo',
    scope_type: 'project',
    dedupe_key: `planning_governance:${projectId}:${alert.kind}:${alert.source_id}`,
    target_route: `/projects/${projectId}/planning`,
    target_label: 'View planning governance',
    metadata: {
      category: notificationCategory,
      alert_kind: alert.kind,
    },
    created_at: now,
  })
}

export class PlanningGovernanceService {
  private healthService = new PlanningHealthService()
  private integrityService = new PlanningIntegrityService()
  private anomalyService = new SystemAnomalyService()

  async startProjectReorderSession(params: {
    projectId: string
    actorUserId?: string | null
    reorderMode?: string | null
    note?: string | null
  }): Promise<PlanningGovernanceState> {
    const existing = (await listActiveManualReorderStates(params.projectId))[0] ?? null
    if (existing) {
      throw Object.assign(new Error('当前项目已有进行中的主动重排会话'), {
        code: 'MANUAL_REORDER_ALREADY_ACTIVE',
        statusCode: 409,
      })
    }

    const now = new Date().toISOString()
    const payload: ManualReorderSessionPayload = {
      reorder_mode: normalizeManualReorderMode(params.reorderMode),
      started_by: params.actorUserId ?? null,
      started_at: now,
      note: params.note ?? null,
      start_snapshot: await collectManualReorderStartSnapshot(params.projectId),
      ended_by: null,
      ended_at: null,
      end_summary: null,
      completion_note: null,
    }

    const state: PlanningGovernanceState = {
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildManualReorderStateKey(params.projectId),
      category: 'reorder',
      kind: 'manual_reorder_session' as PlanningGovernanceState['kind'],
      status: 'active',
      severity: 'info',
      title: 'Manual reorder in progress',
      detail: `Manual reorder has started in ${payload.reorder_mode} mode.`,
      threshold_day: null,
      dashboard_signal: false,
      payload,
      source_entity_type: 'planning_governance',
      source_entity_id: buildManualReorderStateKey(params.projectId),
      active_from: now,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    }

    const persisted = await upsertPlanningGovernanceState(state)
    await writeLog({
      project_id: params.projectId,
      entity_type: 'planning_governance',
      entity_id: params.projectId,
      field_name: 'manual_reorder_session',
      old_value: null,
      new_value: 'active',
      change_reason: params.note ?? null,
      changed_by: params.actorUserId ?? null,
      change_source: 'manual_adjusted',
    })
    return persisted
  }

  async finishProjectReorderSession(params: {
    projectId: string
    actorUserId?: string | null
    note?: string | null
  }): Promise<PlanningGovernanceState> {
    const current = (await listActiveManualReorderStates(params.projectId))[0] ?? null
    if (!current) {
      throw Object.assign(new Error('当前项目没有进行中的主动重排会话'), {
        code: 'MANUAL_REORDER_NOT_ACTIVE',
        statusCode: 404,
      })
    }

    const now = new Date().toISOString()
    const currentPayload = parseManualReorderPayload(current.payload)
    const startedAt = currentPayload?.started_at || current.active_from || current.created_at
    const nextPayload: ManualReorderSessionPayload = {
      reorder_mode: currentPayload?.reorder_mode ?? 'mixed',
      started_by: currentPayload?.started_by ?? null,
      started_at: startedAt,
      note: currentPayload?.note ?? null,
      start_snapshot: currentPayload?.start_snapshot ?? await collectManualReorderStartSnapshot(params.projectId),
      ended_by: params.actorUserId ?? null,
      ended_at: now,
      end_summary: await collectManualReorderEndSummary(params.projectId, startedAt),
      completion_note: params.note ?? null,
    }

    const resolvedState: PlanningGovernanceState = {
      ...current,
      category: 'reorder',
      kind: 'manual_reorder_session' as PlanningGovernanceState['kind'],
      status: 'resolved',
      severity: 'info',
      detail: `Manual reorder has ended and affected ${nextPayload.end_summary?.changed_task_count ?? 0} tasks.`,
      payload: nextPayload,
      resolved_at: now,
      updated_at: now,
    }

    const persisted = await upsertPlanningGovernanceState(resolvedState)
    await writeLog({
      project_id: params.projectId,
      entity_type: 'planning_governance',
      entity_id: params.projectId,
      field_name: 'manual_reorder_session',
      old_value: 'active',
      new_value: 'resolved',
      change_reason: params.note ?? null,
      changed_by: params.actorUserId ?? null,
      change_source: 'manual_adjusted',
    })
    return persisted
  }

  async scanProjectGovernance(projectId: string): Promise<PlanningGovernanceSnapshot> {
    const health = await this.healthService.evaluateProjectHealth(projectId)
    const integrity = await this.integrityService.scanProjectIntegrity(projectId)
    const anomaly = await this.anomalyService.scanProjectPassiveReorder(projectId)
    const monthlyPlans = await executeSQL<MonthlyPlan>('SELECT * FROM monthly_plans WHERE project_id = ?', [projectId])
    const taskRows = await executeSQL<Task>(
      `SELECT id,
              title,
              monthly_plan_item_id,
              baseline_item_id
         FROM tasks
        WHERE project_id = ?`,
      [projectId],
    )
    const tasks = taskRows.map((task) => ({
      ...task,
      task_source: task.monthly_plan_item_id
        ? 'monthly_plan'
        : task.baseline_item_id
          ? 'baseline'
          : 'ad_hoc',
    }))
    const manualReorderStates = await listActiveManualReorderStates(projectId)

    const taskIds = tasks.map((task) => task.id)
    const snapshots = await listTaskProgressSnapshotsByTaskIds(taskIds)
    const signalContext = await collectPlanningGovernanceSignalContext({
      projectId,
      monthlyPlans,
      snapshots,
    })

    const snapshot: PlanningGovernanceSnapshot = {
      project_id: projectId,
      health,
      integrity,
      anomaly,
      alerts: [],
      states: [],
      governanceSignals: [],
    }

    const states = [
      ...buildCloseoutGovernanceStates({ projectId, plans: monthlyPlans }),
      ...buildExecutionReorderGovernanceStates({ projectId, anomaly }),
      ...buildAdHocCarryoverGovernanceStates({ projectId, tasks, snapshots }),
      ...manualReorderStates,
    ]
    snapshot.alerts = [
      ...buildAlerts(snapshot),
      ...buildCloseoutGovernanceAlerts({ projectId, plans: monthlyPlans }),
      ...buildExecutionReorderGovernanceAlerts({ projectId, anomaly }),
      ...buildAdHocCarryoverGovernanceAlerts({ projectId, tasks, snapshots }),
    ]
    snapshot.states = await syncPlanningGovernanceStates(projectId, states)
    snapshot.governanceSignals = buildGovernanceSignals(snapshot, signalContext)
    return snapshot
  }

  async scanAllProjectGovernance(projectIds?: string[] | null): Promise<PlanningGovernanceSnapshot[]> {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    const reports: PlanningGovernanceSnapshot[] = []

    for (const projectId of activeProjectIds) {
      reports.push(await this.scanProjectGovernance(projectId))
    }

    return reports
  }

  async persistProjectGovernanceNotifications(projectId?: string, projectIds?: string[] | null): Promise<Notification[]> {
    const reports = projectId
      ? [await this.scanProjectGovernance(projectId)]
      : await this.scanAllProjectGovernance(projectIds)

    const persisted: Notification[] = []
    for (const report of reports) {
      for (const alert of report.alerts) {
        const notification = await persistAlertNotification(report.project_id, alert)
        if (notification) {
          persisted.push(notification)
        }
      }
      enqueueProjectHealthUpdate(report.project_id, 'planning_governance_notification')
    }

    return persisted
  }
}

export const planningGovernanceService = new PlanningGovernanceService()
