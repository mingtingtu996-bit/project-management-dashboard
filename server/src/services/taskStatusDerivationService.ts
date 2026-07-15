import { getTaskLagLevel, type TaskLagLevel } from './taskLagStatusService.js'
import { delayDayDelta, signedDurationDayDelta } from '../utils/durationDays.js'
import type { ConstructionCalendarContext } from './constructionCalendar.js'

export const TASK_STATUS_DERIVATION_RULE_VERSION = 'v1.4.5-task-status-unified-p6'

export type TaskDueStatus = 'normal' | 'approaching' | 'urgent' | 'overdue'
export type TaskProgressImpactLevel = 'none' | 'warning' | 'partial' | 'blocked'
export type TaskStatusRuleSource = 'direct_fact' | 'derived_window' | 'seed_signal' | 'legacy_fallback'

export interface TaskStatusAxisEvidence {
  ruleVersion: string
  ruleKey: string
  ruleSource: TaskStatusRuleSource
  sourceFields: string[]
  [key: string]: unknown
}

export interface TaskDerivedStatus {
  status: string
  label: string
  reason: string
  evidence: TaskStatusAxisEvidence
  sourceFields: string[]
}

export interface TaskUnifiedDueStatus extends TaskDerivedStatus {
  status: TaskDueStatus
  daysUntilDue: number | null
}

export interface TaskReadinessSummaryDto {
  blockingReasons: string[]
  warningReasons: string[]
  sourceCounts: Record<string, number>
  primaryBlockerType: string | null
  impactSignalCount: number
  raw?: unknown
}

export interface TaskReadinessStatus {
  ready: boolean
  dependencyStatus: string | null
  conditionStatus: string | null
  obstacleStatus: string | null
  progressImpactLevel: TaskProgressImpactLevel | null
  blockedForProgress: boolean
  summary?: TaskReadinessSummaryDto
  evidence?: TaskStatusAxisEvidence
}

export interface TaskDuePolicy {
  urgentDays?: number | string | null
  approachingDays?: number | string | null
  source?: string | null
  policySource?: string | null
  policyId?: string | null
  policyVersion?: string | null
  seedVersion?: string | null
}

export interface TaskUnifiedStatusInput {
  status?: string | null
  progress?: number | string | null
  start_date?: string | null
  end_date?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  actual_end_date?: string | null
  ready_for_start?: boolean | number | string | null
  dependency_status?: string | null
  condition_status?: string | null
  obstacle_status?: string | null
  progress_impact_level?: string | null
  blocked_for_progress?: boolean | number | string | null
  readiness_summary?: unknown
  conditions_unmet?: number | string | null
  obstacles_active?: number | string | null
  duePolicy?: TaskDuePolicy | Record<string, unknown> | null
  due_policy?: TaskDuePolicy | Record<string, unknown> | null
  due_urgent_days?: number | string | null
  due_approaching_days?: number | string | null
  lagLevel?: unknown
  lagStatus?: unknown
  lag_level?: unknown
  lag_status?: unknown
  forecast_lag_level?: unknown
  delay_signal_status?: unknown
}

export interface TaskUnifiedStatusResult {
  lifecycleStatus: string
  businessStatus: TaskDerivedStatus
  displayStatus: string
  dueStatus: TaskUnifiedDueStatus
  lagLevel: TaskLagLevel
  lagStatus: string
  lagStatusEvidence: TaskStatusAxisEvidence
  readinessStatus: TaskReadinessStatus
  ruleVersion: string
}

export interface TaskUnifiedStatusOptions {
  currentDate?: Date
  duePolicy?: TaskDuePolicy | null
  calendar?: ConstructionCalendarContext | null
}

export const TASK_STATUS_RULE_REGISTRY = {
  business: {
    priority: [
      'cancelled',
      'completed',
      'blocked_by_obstacle',
      'partial_blocked',
      'progress_warning',
      'pending_conditions',
      'ready',
      'in_progress',
      'pending',
    ],
    readinessSourceFields: ['ready_for_start', 'dependency_status', 'condition_status', 'obstacle_status'] as const,
    impactSourceFields: ['progress_impact_level', 'blocked_for_progress', 'obstacle_status'] as const,
  },
  due: {
    urgentDays: 3,
    approachingDays: 7,
    sourceFields: ['planned_end_date', 'end_date'] as const,
  },
  lag: {
    directFields: [
      'lagLevel',
      'lag_level',
      'lagStatus',
      'lag_status',
    ] as const,
    seedSignalFields: ['forecast_lag_level', 'delay_signal_status'] as const,
  },
  readiness: {
    sourceFields: [
      'ready_for_start',
      'dependency_status',
      'condition_status',
      'obstacle_status',
      'progress_impact_level',
      'blocked_for_progress',
      'conditions_unmet',
      'readiness_summary',
    ] as const,
  },
} as const

const BUSINESS_STATUS_LABELS: Record<string, string> = {
  cancelled: '已取消',
  completed: '已完成',
  blocked_by_obstacle: '受阻',
  partial_blocked: '部分受影响',
  progress_warning: '执行预警',
  pending_conditions: '待开工',
  ready: '可开工',
  in_progress: '进行中',
  pending: '未开始',
}

const LAG_STATUS_LABELS: Record<TaskLagLevel, string> = {
  none: '正常',
  mild: '轻度滞后',
  moderate: '中度滞后',
  severe: '严重滞后',
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === 'no') return false
  }
  return null
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const next = Number(value ?? fallback)
  return Number.isFinite(next) ? next : fallback
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const next = Number(value ?? fallback)
  if (!Number.isFinite(next) || next < 0) return fallback
  return Math.floor(next)
}

function normalizeLifecycleStatus(value: unknown): string {
  const normalized = normalizeKey(value)
  if (!normalized) return 'pending'
  if (['completed', 'done', '已完成'].includes(normalized)) return 'completed'
  if (['cancelled', 'canceled', 'voided', 'archived', 'deleted', '已取消'].includes(normalized)) return 'cancelled'
  if (['in_progress', 'running', '进行中'].includes(normalized)) return 'in_progress'
  if (['blocked', 'delayed', 'on_hold', '受阻'].includes(normalized)) return 'blocked'
  if (['todo', 'not_started', '未开始', '待办'].includes(normalized)) return 'todo'
  if (['pending', '待定'].includes(normalized)) return 'pending'
  return normalized
}

function normalizeProgressImpact(value: unknown): TaskProgressImpactLevel | null {
  const normalized = normalizeKey(value)
  if (normalized === 'warning') return 'warning'
  if (normalized === 'partial' || normalized === 'partial_impact') return 'partial'
  if (normalized === 'blocked' || normalized === 'block') return 'blocked'
  if (normalized === 'none' || normalized === 'clear' || normalized === 'not_applicable') return 'none'
  return null
}

function normalizeLagLevel(value: unknown): TaskLagLevel | null {
  const normalized = normalizeKey(value)
  if (['none', 'normal', '正常'].includes(normalized)) return 'none'
  if (['mild', '轻度滞后'].includes(normalized)) return 'mild'
  if (['moderate', '中度滞后'].includes(normalized)) return 'moderate'
  if (['severe', '严重滞后'].includes(normalized)) return 'severe'
  return null
}

function normalizeDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = normalizeText(value)
  if (!raw) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function uniqueSourceFields(sourceFields: string[]): string[] {
  return sourceFields.filter((field, index, arr) => field && arr.indexOf(field) === index)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(item)).filter(Boolean)
}

function addUnique(values: string[], next: string): void {
  const normalized = normalizeText(next)
  if (normalized && !values.includes(normalized)) values.push(normalized)
}

function normalizeSourceCounts(value: unknown): Record<string, number> {
  const raw = getRecord(value)
  const counts: Record<string, number> = {}
  for (const [key, count] of Object.entries(raw)) {
    const normalizedKey = normalizeText(key)
    const normalizedCount = normalizeNumber(count, Number.NaN)
    if (normalizedKey && Number.isFinite(normalizedCount) && normalizedCount > 0) {
      counts[normalizedKey] = normalizedCount
    }
  }
  return counts
}

function incrementSourceCount(counts: Record<string, number>, source: unknown): void {
  const normalized = normalizeText(source)
  if (!normalized) return
  counts[normalized] = (counts[normalized] ?? 0) + 1
}

function withRuleEvidence(
  ruleKey: string,
  ruleSource: TaskStatusRuleSource,
  evidence: Record<string, unknown>,
  sourceFields: string[],
): TaskStatusAxisEvidence {
  return {
    ...evidence,
    ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
    ruleKey,
    ruleSource,
    sourceFields: uniqueSourceFields(sourceFields),
  }
}

function normalizeReadinessSummary(
  input: TaskUnifiedStatusInput,
  readiness: {
    dependencyStatus: string | null
    conditionStatus: string | null
    obstacleStatus: string | null
    progressImpactLevel: TaskProgressImpactLevel | null
    blockedForProgress: boolean
  },
): TaskReadinessSummaryDto {
  const raw = getRecord(input.readiness_summary)
  const blockingReasons = [
    ...normalizeStringArray(raw.blockingReasons),
    ...normalizeStringArray(raw.blocking_reasons),
  ]
  const warningReasons = [
    ...normalizeStringArray(raw.warningReasons),
    ...normalizeStringArray(raw.warning_reasons),
  ]

  if (readiness.dependencyStatus === 'blocking') addUnique(blockingReasons, 'dependency')
  if (readiness.conditionStatus === 'blocking' || normalizeNumber(input.conditions_unmet) > 0) addUnique(blockingReasons, 'condition')
  if (readiness.obstacleStatus === 'blocked' || readiness.progressImpactLevel === 'blocked' || readiness.blockedForProgress) {
    addUnique(blockingReasons, 'obstacle')
  }
  if (readiness.obstacleStatus === 'warning' || normalizeNumber(raw.openObstacleCount ?? raw.open_obstacle_count) > 0) {
    addUnique(warningReasons, 'obstacle')
  }
  if (readiness.progressImpactLevel === 'warning' || readiness.progressImpactLevel === 'partial') {
    addUnique(warningReasons, 'progress_impact')
  }

  const sourceCounts = normalizeSourceCounts(raw.sourceCounts ?? raw.source_counts)
  const impactSignals = Array.isArray(raw.impactSignals)
    ? raw.impactSignals
    : Array.isArray(raw.impact_signals)
      ? raw.impact_signals
      : []
  for (const signal of impactSignals) {
    const signalRecord = getRecord(signal)
    incrementSourceCount(sourceCounts, signalRecord.sourceAlgorithm ?? signalRecord.source_algorithm ?? signalRecord.source)
  }

  const primaryBlockerType = normalizeText(raw.primaryBlockerType ?? raw.primary_blocker_type)
    || blockingReasons[0]
    || null

  return {
    blockingReasons: uniqueSourceFields(blockingReasons),
    warningReasons: uniqueSourceFields(warningReasons),
    sourceCounts,
    primaryBlockerType,
    impactSignalCount: impactSignals.length,
    ...(input.readiness_summary !== undefined ? { raw: input.readiness_summary } : {}),
  }
}

function buildBusinessStatus(
  input: TaskUnifiedStatusInput,
  lifecycleStatus: string,
  readinessStatus: TaskReadinessStatus,
): TaskDerivedStatus {
  const progress = normalizeNumber(input.progress)
  const conditionsUnmet = normalizeNumber(input.conditions_unmet)
  const obstaclesActive = normalizeNumber(input.obstacles_active)
  const progressImpact = readinessStatus.progressImpactLevel

  if (lifecycleStatus === 'cancelled') {
    return derived('cancelled', '任务已取消', { status: input.status }, ['status'])
  }

  if (lifecycleStatus === 'completed' || progress >= 100 || input.actual_end_date) {
    return derived(
      'completed',
      '任务已完成或进度达到100%',
      { status: input.status, progress: input.progress, actual_end_date: input.actual_end_date },
      ['status', 'progress', 'actual_end_date'],
    )
  }

  if (progressImpact === 'blocked' || readinessStatus.blockedForProgress || lifecycleStatus === 'blocked') {
    return derived(
      'blocked_by_obstacle',
      '约束治理判定任务推进受阻',
      {
        progress_impact_level: input.progress_impact_level,
        blocked_for_progress: input.blocked_for_progress,
        obstacle_status: input.obstacle_status,
        status: input.status,
      },
      ['progress_impact_level', 'blocked_for_progress', 'obstacle_status', 'status'],
    )
  }

  if (progressImpact === 'partial') {
    return derived(
      'partial_blocked',
      '约束治理判定任务部分受影响',
      { progress_impact_level: input.progress_impact_level, obstacle_status: input.obstacle_status },
      ['progress_impact_level', 'obstacle_status'],
    )
  }

  if (progressImpact === 'warning' || readinessStatus.obstacleStatus === 'warning') {
    return derived(
      'progress_warning',
      '约束治理判定任务存在执行预警',
      { progress_impact_level: input.progress_impact_level, obstacle_status: input.obstacle_status },
      ['progress_impact_level', 'obstacle_status'],
    )
  }

  const dependencyBlocking = readinessStatus.dependencyStatus === 'blocking'
  const conditionBlocking = readinessStatus.conditionStatus === 'blocking'
  const notReady = readinessStatus.ready === false || dependencyBlocking || conditionBlocking || conditionsUnmet > 0
  if ((lifecycleStatus === 'todo' || lifecycleStatus === 'pending') && notReady) {
    return derived(
      'pending_conditions',
      '开工前置依赖或条件尚未满足',
      {
        ready_for_start: input.ready_for_start,
        dependency_status: input.dependency_status,
        condition_status: input.condition_status,
        readiness_summary: input.readiness_summary,
        conditions_unmet: input.conditions_unmet,
      },
      ['ready_for_start', 'dependency_status', 'condition_status', 'readiness_summary', 'conditions_unmet'],
    )
  }

  if (obstaclesActive > 0) {
    return derived('progress_warning', 'active obstacles require impact review from active obstacle count', { obstacles_active: input.obstacles_active }, ['obstacles_active'])
  }

  if ((lifecycleStatus === 'todo' || lifecycleStatus === 'pending') && readinessStatus.ready === true) {
    return derived(
      'ready',
      '开工约束已满足',
      {
        ready_for_start: input.ready_for_start,
        dependency_status: input.dependency_status,
        condition_status: input.condition_status,
        obstacle_status: input.obstacle_status,
      },
      ['ready_for_start', 'dependency_status', 'condition_status', 'obstacle_status'],
    )
  }

  if (progress > 0 || lifecycleStatus === 'in_progress') {
    return derived('in_progress', '任务正在推进', { status: input.status, progress: input.progress }, ['status', 'progress'])
  }


  return derived('pending', '任务尚未开始', { status: input.status }, ['status'])
}

function derived(
  status: string,
  reason: string,
  evidence: Record<string, unknown>,
  sourceFields: string[],
): TaskDerivedStatus {
  const normalizedSourceFields = uniqueSourceFields(sourceFields)
  return {
    status,
    label: BUSINESS_STATUS_LABELS[status] ?? status,
    reason,
    evidence: withRuleEvidence(`business.${status}`, 'direct_fact', evidence, normalizedSourceFields),
    sourceFields: normalizedSourceFields,
  }
}

function deriveReadinessStatus(input: TaskUnifiedStatusInput): TaskReadinessStatus {
  const readyFlag = normalizeBoolean(input.ready_for_start)
  const dependencyStatus = normalizeText(input.dependency_status) || null
  const conditionStatus = normalizeText(input.condition_status) || null
  const obstacleStatus = normalizeText(input.obstacle_status) || null
  const progressImpactLevel = normalizeProgressImpact(input.progress_impact_level)
  const blockedForProgress = normalizeBoolean(input.blocked_for_progress) === true
  const normalizedSummary = normalizeReadinessSummary(input, {
    dependencyStatus,
    conditionStatus,
    obstacleStatus,
    progressImpactLevel,
    blockedForProgress,
  })

  const fallbackBlocked =
    dependencyStatus === 'blocking'
    || conditionStatus === 'blocking'
    || obstacleStatus === 'blocked'
    || progressImpactLevel === 'blocked'
    || blockedForProgress
    || normalizeNumber(input.conditions_unmet) > 0
  const ready = readyFlag ?? !fallbackBlocked
  const ruleKey = ready ? 'readiness.ready' : 'readiness.blocked'
  const sourceFields = getPresentSourceFields(input, TASK_STATUS_RULE_REGISTRY.readiness.sourceFields)

  return {
    ready,
    dependencyStatus,
    conditionStatus,
    obstacleStatus,
    progressImpactLevel: progressImpactLevel ?? 'none',
    blockedForProgress,
    evidence: withRuleEvidence(
      ruleKey,
      'direct_fact',
      {
        ready_for_start: input.ready_for_start,
        dependency_status: input.dependency_status,
        condition_status: input.condition_status,
        obstacle_status: input.obstacle_status,
        progress_impact_level: input.progress_impact_level,
        blocked_for_progress: input.blocked_for_progress,
        conditions_unmet: input.conditions_unmet,
      },
      sourceFields,
    ),
    summary: normalizedSummary,
  }
}

function normalizeDuePolicy(
  input: TaskUnifiedStatusInput,
  options: TaskUnifiedStatusOptions,
): {
  urgentDays: number
  approachingDays: number
  source: string
  policyId: string | null
  policyVersion: string | null
  seedVersion: string | null
  sourceFields: string[]
} {
  const rawPolicy = getRecord(options.duePolicy ?? input.duePolicy ?? input.due_policy)
  const urgentDays = normalizePositiveInteger(
    rawPolicy.urgentDays ?? rawPolicy.urgent_days ?? input.due_urgent_days,
    TASK_STATUS_RULE_REGISTRY.due.urgentDays,
  )
  const approachingDays = normalizePositiveInteger(
    rawPolicy.approachingDays ?? rawPolicy.approaching_days ?? input.due_approaching_days,
    TASK_STATUS_RULE_REGISTRY.due.approachingDays,
  )
  const sourceFields = [
    ...(options.duePolicy || input.duePolicy ? ['duePolicy'] : []),
    ...(input.due_policy ? ['due_policy'] : []),
    ...(input.due_urgent_days !== undefined && input.due_urgent_days !== null ? ['due_urgent_days'] : []),
    ...(input.due_approaching_days !== undefined && input.due_approaching_days !== null ? ['due_approaching_days'] : []),
  ]

  return {
    urgentDays,
    approachingDays: Math.max(urgentDays, approachingDays),
    source: normalizeText(rawPolicy.policySource ?? rawPolicy.source) || 'registry_default',
    policyId: normalizeText(rawPolicy.policyId ?? rawPolicy.policy_id) || null,
    policyVersion: normalizeText(rawPolicy.policyVersion ?? rawPolicy.policy_version) || null,
    seedVersion: normalizeText(rawPolicy.seedVersion ?? rawPolicy.seed_version) || null,
    sourceFields: uniqueSourceFields(sourceFields),
  }
}

function deriveDueStatus(
  input: TaskUnifiedStatusInput,
  lifecycleStatus: string,
  options: TaskUnifiedStatusOptions,
): TaskUnifiedDueStatus {
  const duePolicy = normalizeDuePolicy(input, options)
  const plannedEnd = input.planned_end_date || input.end_date || null
  const terminal = lifecycleStatus === 'completed' || lifecycleStatus === 'cancelled' || normalizeNumber(input.progress) >= 100
  if (!plannedEnd || terminal) {
    return {
      status: 'normal',
      label: '--',
      reason: terminal ? '任务已结束，不参与到期窗口判定' : '未设置计划截止日期',
      evidence: { status: input.status, progress: input.progress, planned_end_date: plannedEnd, duePolicy } as any,
      sourceFields: ['status', 'progress', 'planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue: null,
    }
  }

  const planned = normalizeDate(plannedEnd)
  if (!planned) {
    return {
      status: 'normal',
      label: '--',
      reason: '计划截止日期无效',
      evidence: { planned_end_date: plannedEnd, duePolicy } as any,
      sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue: null,
    }
  }

  const now = options.currentDate ?? new Date()
  const daysUntilDue = options.calendar
    ? -(delayDayDelta(planned, now, options.calendar) ?? 0)
    : signedDurationDayDelta(now, planned) ?? 0
  if (daysUntilDue < 0) {
    return {
      status: 'overdue',
      label: `逾期 ${Math.abs(daysUntilDue)}天`,
      reason: `已逾期 ${Math.abs(daysUntilDue)}天`,
      evidence: { daysUntilDue, plannedEndDate: plannedEnd, duePolicy } as any,
      sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue,
    }
  }
  if (daysUntilDue === 0) {
    return {
      status: 'urgent',
      label: '今天截止',
      reason: '今天截止',
      evidence: { daysUntilDue, plannedEndDate: plannedEnd, duePolicy } as any,
      sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue,
    }
  }
  if (daysUntilDue <= duePolicy.urgentDays) {
    return {
      status: 'urgent',
      label: `${daysUntilDue}天后`,
      reason: `${daysUntilDue}天后到期`,
      evidence: { daysUntilDue, plannedEndDate: plannedEnd, duePolicy } as any,
      sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue,
    }
  }
  if (daysUntilDue <= duePolicy.approachingDays) {
    return {
      status: 'approaching',
      label: `${daysUntilDue}天后`,
      reason: `${daysUntilDue}天后到期`,
      evidence: { daysUntilDue, plannedEndDate: plannedEnd, duePolicy } as any,
      sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
      daysUntilDue,
    }
  }
  return {
    status: 'normal',
    label: `${daysUntilDue}天后`,
    reason: '按计划推进',
    evidence: { daysUntilDue, plannedEndDate: plannedEnd, duePolicy } as any,
    sourceFields: ['planned_end_date', 'end_date', ...duePolicy.sourceFields],
    daysUntilDue,
  }
}

function deriveLagStatus(input: TaskUnifiedStatusInput): { lagLevel: TaskLagLevel; lagStatus: string } {
  const explicitLevel =
    normalizeLagLevel(input.forecast_lag_level)
    ?? normalizeLagLevel(input.delay_signal_status)
    ?? normalizeLagLevel(input.lagLevel)
    ?? normalizeLagLevel(input.lag_level)
    ?? normalizeLagLevel(input.lagStatus)
    ?? normalizeLagLevel(input.lag_status)

  const lagLevel = explicitLevel ?? getTaskLagLevel({
    status: input.status ?? null,
    progress: normalizeNumber(input.progress),
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    planned_start_date: input.planned_start_date ?? null,
    planned_end_date: input.planned_end_date ?? null,
    lagLevel: input.lagLevel ?? input.lag_level,
    lagStatus: input.lagStatus ?? input.lag_status,
  } as any) ?? 'none'

  return {
    lagLevel,
    lagStatus: LAG_STATUS_LABELS[lagLevel],
  }
}

function withDueStatusRuleEvidence(dueStatus: TaskUnifiedDueStatus): TaskUnifiedDueStatus {
  const sourceFields = uniqueSourceFields(dueStatus.sourceFields.length > 0
    ? dueStatus.sourceFields
    : [...TASK_STATUS_RULE_REGISTRY.due.sourceFields])
  const duePolicy = getRecord(dueStatus.evidence.duePolicy)
  return {
    ...dueStatus,
    evidence: withRuleEvidence(
      `due.${dueStatus.status}`,
      'derived_window',
      {
        ...dueStatus.evidence,
        urgentDays: duePolicy.urgentDays ?? TASK_STATUS_RULE_REGISTRY.due.urgentDays,
        approachingDays: duePolicy.approachingDays ?? TASK_STATUS_RULE_REGISTRY.due.approachingDays,
        policySource: duePolicy.source ?? 'registry_default',
        policyId: duePolicy.policyId ?? null,
        policyVersion: duePolicy.policyVersion ?? null,
        seedVersion: duePolicy.seedVersion ?? null,
      },
      sourceFields,
    ),
    sourceFields,
  }
}

function getPresentSourceFields(
  input: TaskUnifiedStatusInput,
  fields: readonly (keyof TaskUnifiedStatusInput)[],
): string[] {
  return fields
    .filter((field) => input[field] !== undefined && input[field] !== null && normalizeText(input[field]) !== '')
    .map((field) => String(field))
}

function deriveLagStatusEvidence(input: TaskUnifiedStatusInput): TaskStatusAxisEvidence {
  const seedSignalFields = getPresentSourceFields(input, TASK_STATUS_RULE_REGISTRY.lag.seedSignalFields)
  if (seedSignalFields.length > 0) {
    return withRuleEvidence(
      'lag.forecast_signal',
      'seed_signal',
      {
        forecast_lag_level: input.forecast_lag_level,
        delay_signal_status: input.delay_signal_status,
      },
      seedSignalFields,
    )
  }

  const directFields = getPresentSourceFields(input, TASK_STATUS_RULE_REGISTRY.lag.directFields)
  if (directFields.length > 0) {
    return withRuleEvidence(
      'lag.direct_fact',
      'direct_fact',
      {
        lagLevel: input.lagLevel,
        lag_level: input.lag_level,
        lagStatus: input.lagStatus,
        lag_status: input.lag_status,
      },
      directFields,
    )
  }

  return withRuleEvidence(
    'lag.legacy_fallback',
    'legacy_fallback',
    {
      status: input.status,
      progress: input.progress,
      start_date: input.start_date,
      end_date: input.end_date,
      planned_start_date: input.planned_start_date,
      planned_end_date: input.planned_end_date,
    },
    ['status', 'progress', 'start_date', 'end_date', 'planned_start_date', 'planned_end_date'],
  )
}

export function deriveTaskUnifiedStatus(
  input: TaskUnifiedStatusInput,
  options: TaskUnifiedStatusOptions = {},
): TaskUnifiedStatusResult {
  const lifecycleStatus = normalizeLifecycleStatus(input.status)
  const readinessStatus = deriveReadinessStatus(input)
  const businessStatus = buildBusinessStatus(input, lifecycleStatus, readinessStatus)
  const dueStatus = withDueStatusRuleEvidence(deriveDueStatus(input, lifecycleStatus, options))
  const lag = deriveLagStatus(input)
  const lagStatusEvidence = deriveLagStatusEvidence(input)

  return {
    lifecycleStatus,
    businessStatus,
    displayStatus: businessStatus.label,
    dueStatus,
    lagLevel: lag.lagLevel,
    lagStatus: lag.lagStatus,
    lagStatusEvidence,
    readinessStatus,
    ruleVersion: TASK_STATUS_DERIVATION_RULE_VERSION,
  }
}
