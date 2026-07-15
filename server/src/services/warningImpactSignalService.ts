import type { Warning } from '../types/db.js'
import { generateId } from '../utils/id.js'
import { supabase } from './dbService.js'
import type { AlgorithmSeedCandidateSource } from './algorithmSeedLearningService.js'
import { normalizeAlgorithmSeedRecordPayload, type AlgorithmSeedType } from './algorithmSeedRegistry.js'
import {
  buildDelayWarningReplaySamples,
  evaluateDelayWarningSignalReplay,
  type DelayWarningReplayCalibrationOptions,
  type DelayWarningReplayRecord,
} from './delayWarningSignalReplayEvaluator.js'
import type { ExecutionImpactOwnership, ExecutionImpactSignal } from './executionImpactSignals.js'
import {
  resolveCriticalPathDelayWarningRule,
} from './riskIssueWarningRuleRegistry.js'

type WarningLevel = Warning['warning_level']
type WarningType = 'condition_due' | 'obstacle_timeout' | 'acceptance_expired' | 'delay_exceeded' | 'critical_path_delay'

export type ImpactSignalWarning = Warning & {
  source_entity_type?: string | null
  source_entity_id?: string | null
  metadata?: Record<string, unknown>
}

type ImpactSignalSummaryLike = {
  rawCount?: number | null
  dedupedCount?: number | null
  duplicates?: Array<Record<string, unknown>> | null
  signals?: ExecutionImpactSignal[] | null
  confirmedDelayDays?: number | null
  weightedConfirmedDelayDays?: number | null
  weightedRiskScore?: number | null
  criticality?: Record<string, unknown> | null
  responsibilityBreakdown?: Array<Record<string, unknown>> | null
  uncertaintyIndex?: number | null
  uncertaintyReasons?: string[] | null
}

export type BuildWarningsFromImpactSignalSummaryInput = {
  projectId: string
  taskId?: string | null
  taskTitle?: string | null
  source: 'readiness_summary' | 'duration_forecast'
  summary: ImpactSignalSummaryLike
  policy?: WarningImpactSignalPolicy
  ownerships?: ExecutionImpactOwnership[]
  includeSignalWarnings?: boolean
  includeDelayWarning?: boolean
  aggregateCompositeBlockers?: boolean
  now?: string | Date
}

type TaskSignalRow = {
  id?: string | null
  project_id?: string | null
  title?: string | null
  status?: string | null
  updated_at?: string | null
  readiness_summary?: unknown
}

type ForecastSignalRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  forecast_delay_days?: number | string | null
  delay_risk_index?: number | string | null
  generated_at?: string | null
  metadata?: unknown
}

type WarningReplayGovernanceOptions = {
  calibration?: DelayWarningReplayCalibrationOptions
}

export type ScanWarningsFromImpactSignalSummariesOptions = {
  policy?: WarningImpactSignalPolicy
  taskIds?: string[] | null
  changedSince?: string | Date | null
  limit?: number | null
}

type WarningImpactSignalGovernanceConfig = {
  defaultPolicy?: Partial<Omit<WarningImpactSignalPolicy, 'version' | 'thresholdSource'>>
  thresholdsByProjectType?: Record<string, Partial<Omit<WarningImpactSignalPolicy, 'version' | 'thresholdSource'>>>
}

type WarningImpactSignalPolicyContext = {
  projectType?: string | null
  governanceConfig?: WarningImpactSignalGovernanceConfig | null
}

export type WarningImpactSignalPolicy = {
  version: 'warning_impact_signal_policy_v1'
  thresholdSource: 'default_signal_summary' | 'governance_config' | 'historical_replay_calibration'
  criticalWeightedRiskScore: number
  warningWeightedRiskScore: number
  warningWeightedConfirmedDelayDays: number
  criticalWeightedConfirmedDelayDays: number
  uncertainRiskScoreThreshold: number
  uncertainRiskIndexThreshold: number
  uncertainReviewCadenceHours: number
  confirmedEscalationCadenceHours: number
  responsibilityConfidenceThreshold: number
}

const DEFAULT_WARNING_IMPACT_SIGNAL_POLICY: WarningImpactSignalPolicy = {
  version: 'warning_impact_signal_policy_v1',
  thresholdSource: 'default_signal_summary',
  criticalWeightedRiskScore: 0.9,
  warningWeightedRiskScore: 0.65,
  warningWeightedConfirmedDelayDays: 2,
  criticalWeightedConfirmedDelayDays: 5,
  uncertainRiskScoreThreshold: 0.35,
  uncertainRiskIndexThreshold: 0.35,
  uncertainReviewCadenceHours: 72,
  confirmedEscalationCadenceHours: 24,
  responsibilityConfidenceThreshold: 0.6,
}

export function resolveWarningImpactSignalPolicy(
  overrides: Partial<Omit<WarningImpactSignalPolicy, 'version' | 'thresholdSource'>> & {
    thresholdSource?: WarningImpactSignalPolicy['thresholdSource']
  } = {},
  context: WarningImpactSignalPolicyContext = {},
): WarningImpactSignalPolicy {
  const projectType = normalizeText(context.projectType)
  const governanceDefault = context.governanceConfig?.defaultPolicy ?? {}
  const governanceByProjectType = projectType
    ? context.governanceConfig?.thresholdsByProjectType?.[projectType] ?? {}
    : {}
  const mergedOverrides = {
    ...governanceDefault,
    ...governanceByProjectType,
    ...overrides,
  }
  const thresholdSource = overrides.thresholdSource
    ?? (Object.keys(mergedOverrides).length > 0 ? 'governance_config' : DEFAULT_WARNING_IMPACT_SIGNAL_POLICY.thresholdSource)
  return {
    ...DEFAULT_WARNING_IMPACT_SIGNAL_POLICY,
    ...mergedOverrides,
    version: 'warning_impact_signal_policy_v1',
    thresholdSource,
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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

function normalizeSignals(value: unknown): ExecutionImpactSignal[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ExecutionImpactSignal => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const record = item as Record<string, unknown>
    return Boolean(record.signalId ?? record.signal_id)
  })
}

function normalizeScanTaskIds(taskIds?: string[] | null) {
  return Array.from(new Set((taskIds ?? []).map((taskId) => normalizeText(taskId)).filter(Boolean)))
}

function normalizeScanChangedSince(value?: string | Date | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeScanLimit(value?: number | null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.floor(numeric)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeText(item)).filter(Boolean)
}

function warningCoverageKey(warning: Pick<Warning, 'project_id' | 'task_id' | 'warning_type'> & {
  source_entity_type?: string | null
  source_entity_id?: string | null
}) {
  const sourceKey = warning.source_entity_type && warning.source_entity_id
    ? `${warning.source_entity_type}:${warning.source_entity_id}`
    : warning.task_id || ''
  return [warning.project_id || '', warning.warning_type || '', sourceKey].join('|')
}

function warningTaskTypeKey(warning: Pick<Warning, 'project_id' | 'task_id' | 'warning_type'>) {
  return [warning.project_id || '', warning.warning_type || '', warning.task_id || ''].join('|')
}

function readSignalMetadata(signal?: ExecutionImpactSignal | null) {
  return readRecord(signal?.metadata)
}

function acceptanceSemantics(signal?: ExecutionImpactSignal | null) {
  if (!signal || signal.impactOwnership !== 'acceptance') return null
  const metadata = readSignalMetadata(signal)
  const stage = normalizeText(metadata.acceptanceStage ?? metadata.acceptance_stage ?? metadata.gateStage ?? metadata.gate_stage)
    || (signal.impactPhase === 'archive' ? 'archive_document' : null)
  const cycle = normalizeText(metadata.acceptanceCycle ?? metadata.acceptance_cycle ?? metadata.rectificationCycle ?? metadata.rectification_cycle)
    || null
  if (!stage && !cycle) return null
  return {
    stage,
    cycle,
    sourceCategory: signal.sourceCategory,
  }
}

function sortedResponsibilityBreakdown(summary: ImpactSignalSummaryLike) {
  return (Array.isArray(summary.responsibilityBreakdown) ? summary.responsibilityBreakdown : [])
    .map((entry) => readRecord(entry))
    .filter((entry) => entry.ownerUnitId || entry.owner_unit_id || entry.ownerRole || entry.owner_role)
    .sort((left, right) => normalizeNumber(right.confidence, 0) - normalizeNumber(left.confidence, 0))
}

function normalizeOwner(entry: Record<string, any> | undefined | null) {
  if (!entry) return null
  return {
    ownerType: entry.ownerType ?? entry.owner_type ?? null,
    ownerUnitId: entry.ownerUnitId ?? entry.owner_unit_id ?? null,
    ownerRole: entry.ownerRole ?? entry.owner_role ?? null,
    confidence: normalizeNumber(entry.confidence, 0),
    basis: entry.basis ?? null,
  }
}

function routingMetadata(signal: ExecutionImpactSignal | null, summary: ImpactSignalSummaryLike, policy: WarningImpactSignalPolicy) {
  const direct = signal?.responsibility
  const directConfidence = normalizeNumber(direct?.confidence, Number.NaN)
  const breakdown = sortedResponsibilityBreakdown(summary)
  const eligibleOwners = breakdown
    .map(normalizeOwner)
    .filter((owner): owner is NonNullable<ReturnType<typeof normalizeOwner>> =>
      Boolean(owner)
      && Number.isFinite(owner.confidence)
      && owner.confidence >= policy.responsibilityConfidenceThreshold,
    )

  if (
    direct
    && (direct.ownerUnitId || direct.ownerRole)
    && Number.isFinite(directConfidence)
    && directConfidence >= policy.responsibilityConfidenceThreshold
  ) {
    const directOwner = {
      ownerType: direct.ownerType,
      ownerUnitId: direct.ownerUnitId ?? null,
      ownerRole: direct.ownerRole ?? null,
      confidence: directConfidence,
      basis: direct.basis,
    }
    const coOwners = eligibleOwners.filter((owner) =>
      `${owner.ownerUnitId ?? ''}|${owner.ownerRole ?? ''}` !== `${directOwner.ownerUnitId ?? ''}|${directOwner.ownerRole ?? ''}`,
    )
    const escalationOwner = coOwners.find((owner) => owner.ownerType === 'role' || owner.ownerRole === 'project_manager') ?? null
    return {
      strategy: 'responsibility_owner',
      ownerType: direct.ownerType,
      ownerUnitId: direct.ownerUnitId ?? null,
      ownerRole: direct.ownerRole ?? null,
      confidence: directConfidence,
      basis: direct.basis,
      primaryOwner: directOwner,
      coOwners: coOwners.filter((owner) => owner.ownerType !== 'role').slice(0, 3),
      escalationOwner,
    }
  }

  const best = breakdown[0]
  const confidence = normalizeNumber(best?.confidence, Number.NaN)
  if (
    best
    && (best.ownerUnitId || best.owner_unit_id || best.ownerRole || best.owner_role)
    && Number.isFinite(confidence)
    && confidence >= policy.responsibilityConfidenceThreshold
  ) {
    const primaryOwner = normalizeOwner(best)
    const primaryKey = `${primaryOwner?.ownerUnitId ?? ''}|${primaryOwner?.ownerRole ?? ''}`
    const coOwners = eligibleOwners.filter((owner) =>
      `${owner.ownerUnitId ?? ''}|${owner.ownerRole ?? ''}` !== primaryKey
      && owner.ownerType !== 'role',
    )
    const escalationOwner = eligibleOwners.find((owner) =>
      `${owner.ownerUnitId ?? ''}|${owner.ownerRole ?? ''}` !== primaryKey
      && (owner.ownerType === 'role' || owner.ownerRole === 'project_manager')
    ) ?? null
    return {
      strategy: 'responsibility_owner',
      ownerType: best.ownerType ?? best.owner_type ?? null,
      ownerUnitId: best.ownerUnitId ?? best.owner_unit_id ?? null,
      ownerRole: best.ownerRole ?? best.owner_role ?? null,
      confidence,
      basis: best.basis ?? null,
      primaryOwner,
      coOwners: coOwners.slice(0, 3),
      escalationOwner,
    }
  }

  return {
    strategy: 'project_owner',
    confidence: Number.isFinite(confidence) ? confidence : null,
    reason: 'missing_or_low_confidence_responsibility',
  }
}

function signalOwnershipRank(ownership: string) {
  const order = ['condition', 'obstacle', 'acceptance', 'dependency', 'weather', 'calendar', 'context']
  const index = order.indexOf(ownership)
  return index >= 0 ? index : order.length
}

function compositeBlockerChain(summary: ImpactSignalSummaryLike) {
  const signals = normalizeSignals(summary.signals)
  const ownerships = Array.from(new Set(signals.map((signal) => signal.impactOwnership)))
    .sort((left, right) => signalOwnershipRank(left) - signalOwnershipRank(right))
  if (ownerships.length < 2) return null
  return {
    kind: 'compound_blocker_chain',
    ownerships,
    signalCount: signals.length,
    sourceEntities: signals.map((signal) => ({
      signalId: signal.signalId,
      sourceEntityType: signal.sourceEntityType,
      sourceEntityId: signal.sourceEntityId,
      impactOwnership: signal.impactOwnership,
    })),
  }
}

function ruleQualityFromSignals(signals: ExecutionImpactSignal[]) {
  const qualities = signals
    .map((signal) => readRecord(signal.metadata?.ruleQuality ?? signal.metadata?.rule_quality))
    .filter((quality) => Object.keys(quality).length > 0)
  if (qualities.length === 0) {
    return {
      grade: 'unknown',
      runtimeRole: 'normal',
      evidenceCount: 0,
      reasons: [],
    }
  }

  const reasons: string[] = []
  let weak = false
  let strong = true
  for (const quality of qualities) {
    const sampleCount = normalizeNumber(quality.sampleCount ?? quality.sample_count, 0)
    const precision = normalizeNumber(quality.precision, 0)
    const falsePositiveRate = normalizeNumber(quality.falsePositiveRate ?? quality.false_positive_rate, 0)
    const stale = quality.stale === true
    if (sampleCount < 5) {
      weak = true
      strong = false
      reasons.push('sample_count_below_minimum')
    }
    if (precision > 0 && precision < 0.55) {
      weak = true
      strong = false
      reasons.push('precision_below_guardrail')
    }
    if (falsePositiveRate > 0.3) {
      weak = true
      strong = false
      reasons.push('false_positive_rate_above_guardrail')
    }
    if (stale) {
      weak = true
      strong = false
      reasons.push('rule_quality_stale')
    }
    if (precision < 0.75 || falsePositiveRate > 0.15 || sampleCount < 20) strong = false
  }

  const grade = weak ? 'weak' : strong ? 'strong' : 'moderate'
  return {
    grade,
    runtimeRole: grade === 'weak' ? 'explain_only' : grade === 'moderate' ? 'reviewable' : 'runtime',
    evidenceCount: qualities.length,
    reasons: Array.from(new Set(reasons)),
  }
}

function uncertaintyReviewTier(summary: ImpactSignalSummaryLike, policy: WarningImpactSignalPolicy) {
  const weightedRiskScore = normalizeNumber(summary.weightedRiskScore, 0)
  const uncertaintyIndex = normalizeNumber(summary.uncertaintyIndex, 0)
  const owners = sortedResponsibilityBreakdown(summary)
  const hasConfidentOwner = owners.some((owner) => normalizeNumber(owner.confidence, 0) >= policy.responsibilityConfidenceThreshold)
  const chain = compositeBlockerChain(summary)

  if ((weightedRiskScore >= 0.85 || uncertaintyIndex >= 0.8) && (hasConfidentOwner || chain)) {
    return {
      reviewTier: 'owner_confirmation',
      matched: 'uncertain_risk_owner_confirmation',
    }
  }
  if (weightedRiskScore >= policy.uncertainRiskScoreThreshold || uncertaintyIndex >= policy.uncertainRiskIndexThreshold) {
    return {
      reviewTier: 'manual_review',
      matched: 'uncertain_risk_review',
    }
  }
  return {
    reviewTier: 'observe',
    matched: 'uncertain_risk_observe',
  }
}

function policyMetadata(policy: WarningImpactSignalPolicy) {
  return {
    version: policy.version,
    thresholdSource: policy.thresholdSource,
    criticalWeightedRiskScore: policy.criticalWeightedRiskScore,
    warningWeightedRiskScore: policy.warningWeightedRiskScore,
    warningWeightedConfirmedDelayDays: policy.warningWeightedConfirmedDelayDays,
    criticalWeightedConfirmedDelayDays: policy.criticalWeightedConfirmedDelayDays,
    uncertainRiskScoreThreshold: policy.uncertainRiskScoreThreshold,
    uncertainRiskIndexThreshold: policy.uncertainRiskIndexThreshold,
    uncertainReviewCadenceHours: policy.uncertainReviewCadenceHours,
    confirmedEscalationCadenceHours: policy.confirmedEscalationCadenceHours,
    responsibilityConfidenceThreshold: policy.responsibilityConfidenceThreshold,
  }
}

function signalLevel(signal: ExecutionImpactSignal): WarningLevel {
  if (signal.runtimePolicy === 'candidate_only' || signal.runtimePolicy === 'confidence_only' || signal.impactMode === 'confidence_only') {
    return signal.severity === 'critical' && signal.confidence >= 0.65 ? 'warning' : 'info'
  }
  return signal.severity === 'critical' ? 'critical' : signal.severity === 'info' ? 'info' : 'warning'
}

function warningTypeForOwnership(ownership: ExecutionImpactOwnership): WarningType | null {
  if (ownership === 'condition' || ownership === 'dependency') return 'condition_due'
  if (ownership === 'obstacle') return 'obstacle_timeout'
  if (ownership === 'acceptance') return 'acceptance_expired'
  return null
}

function ownershipLabel(ownership: ExecutionImpactOwnership) {
  if (ownership === 'condition') return '条件'
  if (ownership === 'obstacle') return '阻碍'
  if (ownership === 'acceptance') return '验收'
  if (ownership === 'dependency') return '依赖'
  if (ownership === 'weather') return '天气'
  if (ownership === 'calendar') return '日历'
  return '上下文'
}

function titleForSignal(signal: ExecutionImpactSignal) {
  const label = ownershipLabel(signal.impactOwnership)
  if (signal.runtimePolicy === 'candidate_only') return `${label}候选信号需复核`
  if (signal.impactMode === 'start_wait') return `${label}影响开工窗口`
  if (signal.impactMode === 'finish_gate') return `${label}影响完工/移交`
  if (signal.impactMode === 'add_days' || signal.impactMode === 'multiplier') return `${label}影响施工节奏`
  return `${label}风险信号`
}

function buildSignalDescription(input: BuildWarningsFromImpactSignalSummaryInput, signal: ExecutionImpactSignal, summary: ImpactSignalSummaryLike) {
  const taskTitle = normalizeText(input.taskTitle) || normalizeText(input.taskId) || '未命名任务'
  const expectedDate = normalizeText(signal.expectedDate)
  const duplicateCount = Array.isArray(summary.duplicates) ? summary.duplicates.length : 0
  const uncertaintyReasons = normalizeStringArray(summary.uncertaintyReasons)
  return [
    `任务"${taskTitle}"存在${ownershipLabel(signal.impactOwnership)}影响信号：${signal.reason || signal.sourceCategory}`,
    expectedDate ? `预计控制日期 ${expectedDate}` : null,
    duplicateCount > 0 ? `已按 sourceEntityId/project-scope 去重 ${duplicateCount} 组重复来源` : null,
    uncertaintyReasons.length > 0 ? `不确定性：${uncertaintyReasons.join(', ')}` : null,
  ].filter(Boolean).join('；')
}

function warningSummaryMetadata(
  input: BuildWarningsFromImpactSignalSummaryInput,
  signal: ExecutionImpactSignal | null,
  summary: ImpactSignalSummaryLike,
  extra: Record<string, unknown> = {},
) {
  const policy = input.policy ?? resolveWarningImpactSignalPolicy()
  const signals = normalizeSignals(summary.signals)
  return {
    source: input.source,
    delaySignalVersion: 'impact_signal_summary_v1',
    thresholdPolicy: policyMetadata(policy),
    impactSignalSummary: {
      rawCount: normalizeNumber(summary.rawCount, normalizeSignals(summary.signals).length),
      dedupedCount: normalizeNumber(summary.dedupedCount, normalizeSignals(summary.signals).length),
      duplicateCount: Array.isArray(summary.duplicates) ? summary.duplicates.length : 0,
      confirmedDelayDays: normalizeNumber(summary.confirmedDelayDays, 0),
      weightedConfirmedDelayDays: normalizeNumber(summary.weightedConfirmedDelayDays, 0),
      weightedRiskScore: normalizeNumber(summary.weightedRiskScore, 0),
      criticality: summary.criticality ?? null,
      responsibilityBreakdown: summary.responsibilityBreakdown ?? [],
      uncertaintyIndex: normalizeNumber(summary.uncertaintyIndex, 0),
      uncertaintyReasons: normalizeStringArray(summary.uncertaintyReasons),
      sourceEntityType: signal?.sourceEntityType ?? null,
      sourceEntityId: signal?.sourceEntityId ?? null,
      dedupeKey: signal?.dedupeKey ?? null,
    },
    impactSignal: signal,
    acceptanceSemantics: acceptanceSemantics(signal),
    routing: routingMetadata(signal, summary, policy),
    compositeBlockerChain: compositeBlockerChain(summary),
    ruleQuality: ruleQualityFromSignals(signals),
    ...extra,
  }
}

function makeWarning(input: {
  projectId: string
  taskId?: string | null
  warningType: WarningType
  level: WarningLevel
  title: string
  description: string
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  metadata?: Record<string, unknown>
  now?: string | Date
}): ImpactSignalWarning {
  const createdAt = input.now instanceof Date
    ? input.now.toISOString()
    : normalizeText(input.now) || new Date().toISOString()
  return {
    id: generateId(),
    project_id: input.projectId,
    task_id: input.taskId || undefined,
    warning_type: input.warningType,
    warning_level: input.level,
    title: input.title,
    description: input.description,
    is_acknowledged: false,
    created_at: createdAt,
    source_entity_type: input.sourceEntityType ?? null,
    source_entity_id: input.sourceEntityId ?? input.taskId ?? null,
    metadata: input.metadata,
  }
}

function delayLevelFromSummary(summary: ImpactSignalSummaryLike, policy: WarningImpactSignalPolicy): WarningLevel {
  const weightedDelayDays = normalizeNumber(summary.weightedConfirmedDelayDays, normalizeNumber(summary.confirmedDelayDays, 0))
  const weightedRiskScore = normalizeNumber(summary.weightedRiskScore, 0)
  const criticality = readRecord(summary.criticality)
  if (
    weightedDelayDays >= policy.criticalWeightedConfirmedDelayDays
    || (weightedDelayDays > 0 && criticality.isCritical === true && weightedRiskScore >= policy.criticalWeightedRiskScore)
  ) return 'critical'
  if (
    weightedDelayDays >= policy.warningWeightedConfirmedDelayDays
    || (weightedDelayDays > 0 && (criticality.isCritical === true || weightedRiskScore >= policy.warningWeightedRiskScore))
  ) return 'warning'
  const rule = resolveCriticalPathDelayWarningRule(weightedDelayDays)
  if (rule?.level === 'critical') return 'critical'
  if (rule?.level === 'warning') return 'warning'
  if (rule?.level === 'info') return 'info'
  if (weightedDelayDays >= 5) return 'critical'
  if (weightedDelayDays >= 2) return 'warning'
  return 'info'
}

function strongestSignal(signals: ExecutionImpactSignal[]): ExecutionImpactSignal | null {
  const rank = (signal: ExecutionImpactSignal) => {
    const severity = signal.severity === 'critical' ? 3 : signal.severity === 'warning' ? 2 : 1
    const runtime = signal.runtimePolicy === 'deterministic' ? 3 : signal.runtimePolicy === 'candidate_only' ? 2 : 1
    const mode = signal.impactMode === 'start_wait' || signal.impactMode === 'finish_gate' ? 3 : signal.impactMode === 'confidence_only' ? 1 : 2
    return severity * 100 + runtime * 10 + mode + signal.confidence
  }
  return [...signals].sort((left, right) => rank(right) - rank(left))[0] ?? null
}

function buildConfirmedDelayWarning(input: BuildWarningsFromImpactSignalSummaryInput, signals: ExecutionImpactSignal[]): ImpactSignalWarning | null {
  const policy = input.policy ?? resolveWarningImpactSignalPolicy()
  const confirmedDelayDays = normalizeNumber(input.summary.confirmedDelayDays, 0)
  const weightedConfirmedDelayDays = normalizeNumber(input.summary.weightedConfirmedDelayDays, confirmedDelayDays)
  if (confirmedDelayDays <= 0 && weightedConfirmedDelayDays <= 0) return null
  const primarySignal = strongestSignal(signals)
  const isCritical = Boolean(input.summary.criticality?.isCritical)
  const warningType: WarningType = isCritical ? 'critical_path_delay' : 'delay_exceeded'
  const level = delayLevelFromSummary(input.summary, policy)
  const taskTitle = normalizeText(input.taskTitle) || normalizeText(input.taskId) || '未命名任务'
  const delayDays = confirmedDelayDays || weightedConfirmedDelayDays

  return makeWarning({
    projectId: input.projectId,
    taskId: input.taskId,
    warningType,
    level,
    title: `确定延期预警：预计延期 ${delayDays} 天`,
    description: [
      `任务"${taskTitle}"基于 impactSignalSummary 判定为确定延期 ${delayDays} 天`,
      isCritical ? '关键路径/低浮时权重已计入预警级别' : null,
      `加权风险分 ${normalizeNumber(input.summary.weightedRiskScore, 0)}`,
    ].filter(Boolean).join('；'),
    sourceEntityType: primarySignal?.sourceEntityType,
    sourceEntityId: primarySignal?.sourceEntityId,
    metadata: warningSummaryMetadata(input, primarySignal, input.summary, {
      delayCertainty: 'confirmed_delay',
      thresholdDecision: {
        matched: level === 'critical' ? 'confirmed_delay_critical' : level === 'warning' ? 'confirmed_delay_warning' : 'confirmed_delay_info',
        weightedConfirmedDelayDays,
        weightedRiskScore: normalizeNumber(input.summary.weightedRiskScore, 0),
        isCritical,
      },
      reNotificationPolicy: {
        cadenceHours: policy.confirmedEscalationCadenceHours,
        escalationEligible: true,
      },
    }),
    now: input.now,
  })
}

function buildUncertainDelayRiskWarning(input: BuildWarningsFromImpactSignalSummaryInput, signals: ExecutionImpactSignal[]): ImpactSignalWarning | null {
  const policy = input.policy ?? resolveWarningImpactSignalPolicy()
  const confirmedDelayDays = normalizeNumber(input.summary.confirmedDelayDays, 0)
  if (confirmedDelayDays > 0) return null
  const weightedRiskScore = normalizeNumber(input.summary.weightedRiskScore, 0)
  const uncertaintyIndex = normalizeNumber(input.summary.uncertaintyIndex, 0)
  if (signals.length === 0 || (weightedRiskScore <= 0 && uncertaintyIndex <= 0)) return null
  if (weightedRiskScore < policy.uncertainRiskScoreThreshold && uncertaintyIndex < policy.uncertainRiskIndexThreshold) return null
  const primarySignal = strongestSignal(signals)
  const taskTitle = normalizeText(input.taskTitle) || normalizeText(input.taskId) || '未命名任务'
  const tier = uncertaintyReviewTier(input.summary, policy)
  const level: WarningLevel = signals.some((signal) => signal.runtimePolicy === 'deterministic' && signal.impactMode !== 'confidence_only')
    ? 'warning'
    : 'info'

  return makeWarning({
    projectId: input.projectId,
    taskId: input.taskId,
    warningType: 'delay_exceeded',
    level,
    title: '延期不确定风险：需观察或复核',
    description: `任务"${taskTitle}"存在不确定延期风险，当前仅消费 impactSignalSummary 的候选/低置信/过期 seed 信号，不按确定延期处理`,
    sourceEntityType: primarySignal?.sourceEntityType,
    sourceEntityId: primarySignal?.sourceEntityId,
    metadata: warningSummaryMetadata(input, primarySignal, input.summary, {
      delayCertainty: 'uncertain_risk',
      thresholdDecision: {
        matched: tier.matched,
        reviewTier: tier.reviewTier,
        weightedRiskScore,
        uncertaintyIndex,
      },
      reNotificationPolicy: {
        cadenceHours: policy.uncertainReviewCadenceHours,
        escalationEligible: false,
      },
    }),
    now: input.now,
  })
}

function buildCompositeBlockerWarning(input: BuildWarningsFromImpactSignalSummaryInput, signals: ExecutionImpactSignal[]): ImpactSignalWarning | null {
  const chain = compositeBlockerChain({
    ...input.summary,
    signals,
  })
  if (!chain) return null
  const primarySignal = strongestSignal(signals)
  const warningType = warningTypeForOwnership(chain.ownerships[0] as ExecutionImpactOwnership)
  if (!warningType) return null
  const level: WarningLevel = signals.some((signal) => signal.severity === 'critical') ? 'critical' : 'warning'
  const taskTitle = normalizeText(input.taskTitle) || normalizeText(input.taskId) || 'Unnamed task'

  return makeWarning({
    projectId: input.projectId,
    taskId: input.taskId,
    warningType,
    level,
    title: 'Composite blocker chain warning',
    description: `Task "${taskTitle}" has a compound condition/obstacle/acceptance impact chain; it is aggregated into one main warning to avoid double counting.`,
    sourceEntityType: 'impact_signal_chain',
    sourceEntityId: normalizeText(input.taskId) || primarySignal?.sourceEntityId || null,
    metadata: warningSummaryMetadata(input, primarySignal, {
      ...input.summary,
      signals,
    }, {
      delayCertainty: 'composite_blocker_chain',
      compositeBlockerChain: chain,
      thresholdDecision: {
        matched: 'composite_blocker_chain',
        ownerships: chain.ownerships,
        signalCount: chain.signalCount,
      },
    }),
    now: input.now,
  })
}

function dedupeWarningsBySignal(warnings: ImpactSignalWarning[]) {
  const rank = (warning: ImpactSignalWarning) => warning.warning_level === 'critical' ? 3 : warning.warning_level === 'warning' ? 2 : 1
  const byKey = new Map<string, ImpactSignalWarning>()
  for (const warning of warnings) {
    const metadata = readRecord(warning.metadata)
    const summary = readRecord(metadata.impactSignalSummary)
    const key = [
      warning.project_id,
      warning.warning_type,
      warning.source_entity_type ?? summary.sourceEntityType ?? '',
      warning.source_entity_id ?? summary.sourceEntityId ?? warning.task_id ?? '',
      summary.dedupeKey ?? '',
    ].join('|')
    const current = byKey.get(key)
    if (!current || rank(warning) > rank(current)) {
      byKey.set(key, warning)
    }
  }
  return Array.from(byKey.values())
}

export function buildWarningsFromImpactSignalSummary(input: BuildWarningsFromImpactSignalSummaryInput): ImpactSignalWarning[] {
  const allowedOwnerships = input.ownerships ? new Set(input.ownerships) : null
  const signals = normalizeSignals(input.summary.signals)
    .filter((signal) => !allowedOwnerships || allowedOwnerships.has(signal.impactOwnership))
  const warnings: ImpactSignalWarning[] = []

  if (input.includeSignalWarnings !== false) {
    const compositeWarning = input.aggregateCompositeBlockers
      ? buildCompositeBlockerWarning(input, signals)
      : null
    if (compositeWarning) {
      warnings.push(compositeWarning)
    } else {
      for (const signal of signals) {
        const warningType = warningTypeForOwnership(signal.impactOwnership)
        if (!warningType) continue
        warnings.push(makeWarning({
          projectId: input.projectId,
          taskId: input.taskId,
          warningType,
          level: signalLevel(signal),
          title: titleForSignal(signal),
          description: buildSignalDescription(input, signal, input.summary),
          sourceEntityType: signal.sourceEntityType,
          sourceEntityId: signal.sourceEntityId,
          metadata: warningSummaryMetadata(input, signal, input.summary, {
            delayCertainty: signal.runtimePolicy === 'deterministic' && signal.impactMode !== 'confidence_only'
              ? 'deterministic_signal'
              : 'uncertain_signal',
          }),
          now: input.now,
        }))
      }
    }
  }

  if (input.includeDelayWarning !== false) {
    const confirmed = buildConfirmedDelayWarning(input, signals)
    if (confirmed) {
      warnings.push(confirmed)
    } else {
      const uncertain = buildUncertainDelayRiskWarning(input, signals)
      if (uncertain) warnings.push(uncertain)
    }
  }

  return dedupeWarningsBySignal(warnings)
}

export function buildImpactSignalWarningDebugReport(input: BuildWarningsFromImpactSignalSummaryInput) {
  const policy = input.policy ?? resolveWarningImpactSignalPolicy()
  const signals = normalizeSignals(input.summary.signals)
  const warnings = buildWarningsFromImpactSignalSummary({
    ...input,
    policy,
  })

  return {
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    source: input.source,
    rawSignalCount: normalizeNumber(input.summary.rawCount, signals.length),
    dedupedSignalCount: normalizeNumber(input.summary.dedupedCount, signals.length),
    suppressedDuplicateCount: Array.isArray(input.summary.duplicates) ? input.summary.duplicates.length : 0,
    rawSignals: signals.map((signal) => ({
      signalId: signal.signalId,
      sourceAlgorithm: signal.sourceAlgorithm,
      impactOwnership: signal.impactOwnership,
      impactMode: signal.impactMode,
      runtimePolicy: signal.runtimePolicy,
      sourceEntityType: signal.sourceEntityType,
      sourceEntityId: signal.sourceEntityId,
      dedupeKey: signal.dedupeKey,
      weightedRiskScore: normalizeNumber(signal.weightedRiskScore, 0),
      confidence: normalizeNumber(signal.confidence, 0),
    })),
    suppressedDuplicates: Array.isArray(input.summary.duplicates) ? input.summary.duplicates : [],
    emittedWarnings: warnings.map((warning) => ({
      id: warning.id,
      warningType: warning.warning_type,
      warningLevel: warning.warning_level,
      taskId: warning.task_id ?? null,
      sourceEntityType: warning.source_entity_type ?? null,
      sourceEntityId: warning.source_entity_id ?? null,
      delayCertainty: readRecord(warning.metadata).delayCertainty ?? null,
    })),
    decisions: warnings.map((warning) => {
      const metadata = readRecord(warning.metadata)
      const thresholdPolicy = readRecord(metadata.thresholdPolicy)
      return {
        warningType: warning.warning_type,
        warningLevel: warning.warning_level,
        sourceEntityType: warning.source_entity_type ?? null,
        sourceEntityId: warning.source_entity_id ?? null,
        thresholdSource: thresholdPolicy.thresholdSource ?? policy.thresholdSource,
        thresholdDecision: metadata.thresholdDecision ?? null,
        routing: metadata.routing ?? null,
      }
    }),
    policy: policyMetadata(policy),
  }
}

export function buildImpactSignalCoverageSummary(input: {
  taskIds: string[]
  impactWarnings: Array<Pick<Warning, 'project_id' | 'task_id' | 'warning_type'> & {
    source_entity_type?: string | null
    source_entity_id?: string | null
  }>
  legacyWarnings: Array<Pick<Warning, 'project_id' | 'task_id' | 'warning_type'> & {
    source_entity_type?: string | null
    source_entity_id?: string | null
  }>
}) {
  const impactTaskIds = new Set(input.impactWarnings.map((warning) => normalizeText(warning.task_id)).filter(Boolean))
  const exactImpactKeys = new Set(input.impactWarnings.map(warningCoverageKey))
  const taskTypeImpactKeys = new Set(input.impactWarnings.map(warningTaskTypeKey))
  let legacyGapFillCount = 0
  let suppressedLegacyDuplicateCount = 0

  for (const warning of input.legacyWarnings) {
    if (exactImpactKeys.has(warningCoverageKey(warning)) || taskTypeImpactKeys.has(warningTaskTypeKey(warning))) {
      suppressedLegacyDuplicateCount += 1
    } else {
      legacyGapFillCount += 1
    }
  }

  const legacyGapTaskIds = new Set(
    input.legacyWarnings
      .filter((warning) => !exactImpactKeys.has(warningCoverageKey(warning)) && !taskTypeImpactKeys.has(warningTaskTypeKey(warning)))
      .map((warning) => normalizeText(warning.task_id))
      .filter(Boolean),
  )

  const coveredTaskIds = new Set([...impactTaskIds, ...legacyGapTaskIds])
  return {
    taskCount: input.taskIds.length,
    impactCoveredTaskCount: impactTaskIds.size,
    legacyGapFillCount,
    suppressedLegacyDuplicateCount,
    uncoveredTaskCount: input.taskIds.filter((taskId) => !coveredTaskIds.has(normalizeText(taskId))).length,
  }
}

export function buildImpactSignalWarningLifecyclePlan(input: {
  activeWarnings: ImpactSignalWarning[]
  currentWarnings: ImpactSignalWarning[]
}) {
  const currentByKey = new Map(input.currentWarnings.map((warning) => [warningCoverageKey(warning), warning]))
  const actions: Array<{
    warningId: string
    action: 'resolve' | 'downgrade'
    reason: 'impact_signal_disappeared' | 'impact_signal_severity_downgraded'
    nextLevel?: WarningLevel
    sourceEntityType?: string | null
    sourceEntityId?: string | null
  }> = []
  const levelRank = (level?: WarningLevel | null) => level === 'critical' ? 3 : level === 'warning' ? 2 : level === 'info' ? 1 : 0

  for (const active of input.activeWarnings) {
    const metadata = readRecord(active.metadata)
    if (metadata.delaySignalVersion !== 'impact_signal_summary_v1') continue
    const current = currentByKey.get(warningCoverageKey(active))
    if (!current) {
      actions.push({
        warningId: active.id,
        action: 'resolve',
        reason: 'impact_signal_disappeared',
        sourceEntityType: active.source_entity_type ?? null,
        sourceEntityId: active.source_entity_id ?? null,
      })
      continue
    }
    if (levelRank(current.warning_level) < levelRank(active.warning_level)) {
      actions.push({
        warningId: active.id,
        action: 'downgrade',
        reason: 'impact_signal_severity_downgraded',
        nextLevel: current.warning_level,
        sourceEntityType: active.source_entity_type ?? null,
        sourceEntityId: active.source_entity_id ?? null,
      })
    }
  }

  return {
    activeCount: input.activeWarnings.length,
    currentCount: input.currentWarnings.length,
    actions,
  }
}

export function buildReplayThresholdCandidate(report: Record<string, any>, options: {
  projectId: string
  minSampleCount?: number
}) {
  const calibration = readRecord(report.evaluation?.thresholdCalibration)
  const shadowCalibration = readRecord(report.shadowCalibration)
  const sampleCount = normalizeNumber(report.sampleCount, normalizeNumber(report.evaluation?.sampleCount, 0))
  const recommendedThreshold = calibration.recommendedThreshold ?? shadowCalibration.recommendedThreshold ?? null
  const candidateResults = Array.isArray(calibration.candidateResults) ? calibration.candidateResults : []
  const recommendedResult = candidateResults.find((item: any) => item.threshold === recommendedThreshold) ?? null
  const minSampleCount = options.minSampleCount ?? 1

  return {
    projectId: options.projectId,
    status: sampleCount >= minSampleCount && recommendedThreshold != null ? 'candidate' : 'insufficient_sample',
    approvalMode: 'manual_approval_required',
    recommendedPolicy: calibration.recommendedWarningPolicy
      ?? shadowCalibration.recommendedPolicy
      ?? 'confirmed_or_weighted_risk_score_at_least_threshold',
    recommendedThreshold,
    currentThreshold: calibration.currentThreshold ?? shadowCalibration.currentThreshold ?? null,
    sampleCount,
    evidence: {
      netAssessment: report.warningPolicy?.netAssessment ?? report.evaluation?.delta?.netAssessment ?? null,
      projectedWarningDelta: shadowCalibration.projectedWarningDelta ?? null,
      projectedFalsePositiveDelta: shadowCalibration.projectedFalsePositiveDelta ?? null,
      candidateResult: recommendedResult,
    },
  }
}

function slugSeedPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'unknown'
}

export function buildReplayThresholdAlgorithmSeedCandidate(report: Record<string, any>, options: {
  projectId: string
  minSampleCount?: number
}) {
  const thresholdCandidate = buildReplayThresholdCandidate(report, options)
  if (thresholdCandidate.status !== 'candidate' || thresholdCandidate.recommendedThreshold == null) return null
  const calibration = readRecord(report.evaluation?.thresholdCalibration)
  const candidateResults = Array.isArray(calibration.candidateResults) ? calibration.candidateResults : []
  const recommendedResult = candidateResults.find((item: any) => item.threshold === thresholdCandidate.recommendedThreshold) ?? {}
  const currentResult = candidateResults.find((item: any) => item.threshold === thresholdCandidate.currentThreshold) ?? {}
  const stableCode = `learned:risk_issue_warning_rule:${slugSeedPart(options.projectId)}:delay-warning-threshold`
  const ruleCode = `delay_warning_replay_threshold_${slugSeedPart(options.projectId)}`
  const sampleCount = Math.max(0, Math.trunc(normalizeNumber(thresholdCandidate.sampleCount, 0)))
  const precision = normalizeNumber(recommendedResult.precision, 0)
  const recall = normalizeNumber(recommendedResult.recall, 0)
  const falsePositiveCount = normalizeNumber(recommendedResult.falsePositiveCount, 0)
  const warnedCount = normalizeNumber(recommendedResult.warnedCount, 0)
  const falsePositiveRate = warnedCount > 0 ? Math.max(0, Math.min(1, falsePositiveCount / warnedCount)) : 0
  const confidence = Math.round(Math.max(0, Math.min(1, (precision * 0.45) + (recall * 0.45) + ((1 - falsePositiveRate) * 0.1))) * 1000) / 1000
  const evidenceSourceKeys = [`delay_warning_signal_replay:${options.projectId}`]
  const candidatePayload = normalizeAlgorithmSeedRecordPayload('risk_issue_warning_rule', {
    stableCode,
    ruleCode,
    sourceStandard: 'warning_replay',
    sourceVersion: 'v1.4.19-delay-warning-replay-candidate',
    sourceClauseRef: 'warning_replay.delay_warning_threshold',
    evidenceSourceKeys,
    webVerified: false,
    reviewNeeded: true,
    isActive: false,
    status: 'candidate_only',
    confidence,
    recommendedPolicy: thresholdCandidate.recommendedPolicy,
    recommendedThreshold: thresholdCandidate.recommendedThreshold,
    currentThreshold: thresholdCandidate.currentThreshold,
    thresholdSource: 'historical_replay_calibration',
    signalConsumptionPolicy: {
      inputContract: 'impactSignalSummary_only',
      duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      confirmedDelaySignalStatuses: ['confirmed_delay'],
      uncertainRiskSignalStatuses: ['uncertain_risk'],
      forbiddenDirectReads: ['task_conditions', 'task_obstacles', 'acceptance_plans', 'tasks'],
    },
    promotionPolicy: 'candidate_only_until_manual_warning_policy_review',
    replayEvidence: {
      sampleCount,
      recommendedResult,
      currentResult,
      netAssessment: thresholdCandidate.evidence.netAssessment,
      projectedWarningDelta: thresholdCandidate.evidence.projectedWarningDelta,
      projectedFalsePositiveDelta: thresholdCandidate.evidence.projectedFalsePositiveDelta,
    },
  })

  return {
    seedType: 'risk_issue_warning_rule' as AlgorithmSeedType,
    stableCode,
    candidatePayload,
    candidateSource: 'project_history' as AlgorithmSeedCandidateSource,
    projectId: options.projectId,
    companyId: null,
    sampleCount,
    variance: falsePositiveRate,
    confidenceLevel: confidence >= 0.8 ? 'high' as const : confidence >= 0.6 ? 'medium' as const : 'low' as const,
    evidenceSummary: {
      source: 'delay_warning_signal_replay',
      sampleCount,
      replayWindowDays: normalizeNumber(report.evaluation?.thresholdCalibration?.replayWindowDays, 0) || null,
      replayCaseCount: sampleCount,
      replayTruePositiveRate: recall,
      replayFalsePositiveRate: falsePositiveRate,
      precision,
      recall,
      recommendedThreshold: thresholdCandidate.recommendedThreshold,
      currentThreshold: thresholdCandidate.currentThreshold,
      recommendedPolicy: thresholdCandidate.recommendedPolicy,
      candidateResult: recommendedResult,
      currentResult,
      netAssessment: thresholdCandidate.evidence.netAssessment,
      runtimeEffect: 'candidate_only_until_manual_warning_policy_review',
      evidenceSourceKeys,
    },
    actionPolicy: 'candidate_only' as const,
  }
}

export function buildRuleQualityUpdatesFromWarnings(warnings: ImpactSignalWarning[]) {
  const updates = new Map<string, Record<string, unknown>>()
  for (const warning of warnings) {
    const metadata = readRecord(warning.metadata)
    const signal = readRecord(metadata.impactSignal)
    const signalMetadata = readRecord(signal.metadata)
    const ruleCode = normalizeText(signalMetadata.ruleCode ?? signalMetadata.rule_code ?? metadata.ruleCode ?? metadata.rule_code)
    if (!ruleCode) continue
    const seedSource = normalizeText(
      signalMetadata.seedSource
      ?? signalMetadata.seed_source
      ?? signalMetadata.sourceStandard
      ?? signalMetadata.source_standard
      ?? signal.sourceEntityType
      ?? 'unknown',
    )
    const ruleQuality = readRecord(metadata.ruleQuality)
    const key = `${warning.project_id}|${ruleCode}`
    if (!updates.has(key)) {
      updates.set(key, {
        projectId: warning.project_id,
        taskId: warning.task_id ?? null,
        warningId: warning.id,
        ruleCode,
        seedSource,
        qualityGrade: ruleQuality.grade ?? 'unknown',
        runtimeRole: ruleQuality.runtimeRole ?? 'normal',
        sourceEntityType: signal.sourceEntityType ?? warning.source_entity_type ?? null,
        sourceEntityId: signal.sourceEntityId ?? warning.source_entity_id ?? null,
        reasons: Array.isArray(ruleQuality.reasons) ? ruleQuality.reasons : [],
        evidenceCount: normalizeNumber(ruleQuality.evidenceCount, 0),
      })
    }
  }
  return Array.from(updates.values())
}

export function buildOwnerConfirmationRequests(warnings: ImpactSignalWarning[]) {
  return warnings.flatMap((warning) => {
    const metadata = readRecord(warning.metadata)
    const thresholdDecision = readRecord(metadata.thresholdDecision)
    if (metadata.delayCertainty !== 'uncertain_risk' || thresholdDecision.reviewTier !== 'owner_confirmation') {
      return []
    }
    const routing = readRecord(metadata.routing)
    const owner = readRecord(routing.primaryOwner)
    const ownerUnitId = normalizeText(owner.ownerUnitId ?? owner.owner_unit_id ?? routing.ownerUnitId ?? routing.owner_unit_id)
    const ownerRole = normalizeText(owner.ownerRole ?? owner.owner_role ?? routing.ownerRole ?? routing.owner_role)
    return [{
      projectId: warning.project_id,
      taskId: warning.task_id ?? null,
      warningId: warning.id,
      ownerUnitId: ownerUnitId || null,
      ownerRole: ownerRole || null,
      confirmationType: 'delay_uncertainty_owner_confirmation',
      status: 'pending',
      sourceEntityType: warning.source_entity_type ?? null,
      sourceEntityId: warning.source_entity_id ?? null,
      evidence: {
        weightedRiskScore: thresholdDecision.weightedRiskScore ?? null,
        uncertaintyIndex: thresholdDecision.uncertaintyIndex ?? null,
        reviewTier: thresholdDecision.reviewTier ?? null,
      },
    }]
  })
}

export function buildResponsibilityEscalationPlan(warning: ImpactSignalWarning, options: {
  now?: string | Date
  coOwnerAfterHours?: number
  escalationAfterHours?: number
}) {
  const metadata = readRecord(warning.metadata)
  const routing = readRecord(metadata.routing)
  const primaryOwner = normalizeOwner(readRecord(routing.primaryOwner)) ?? normalizeOwner(routing)
  const coOwners = Array.isArray(routing.coOwners)
    ? routing.coOwners.map((owner) => normalizeOwner(readRecord(owner))).filter(Boolean)
    : []
  const escalationOwner = normalizeOwner(readRecord(routing.escalationOwner))
  const now = options.now instanceof Date ? options.now : new Date(normalizeText(options.now) || Date.now())
  const createdAt = new Date(normalizeText(warning.created_at) || now.toISOString())
  const ageHours = Number.isFinite(createdAt.getTime())
    ? Math.max(0, (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000))
    : 0
  const coOwnerAfterHours = options.coOwnerAfterHours ?? 24
  const escalationAfterHours = options.escalationAfterHours ?? 48
  const stage = ageHours >= escalationAfterHours && escalationOwner
    ? 'escalation_owner'
    : ageHours >= coOwnerAfterHours && coOwners.length > 0
      ? 'co_owner'
      : 'primary_owner'
  const recipients = [
    primaryOwner,
    ...(ageHours >= coOwnerAfterHours ? coOwners : []),
    ...(ageHours >= escalationAfterHours && escalationOwner ? [escalationOwner] : []),
  ].filter(Boolean)

  return {
    warningId: warning.id,
    projectId: warning.project_id,
    taskId: warning.task_id ?? null,
    stage,
    ageHours: Math.round(ageHours * 100) / 100,
    recipients,
  }
}

function summaryWithSignals(summary: Record<string, any>, signals: ExecutionImpactSignal[]): ImpactSignalSummaryLike {
  return {
    ...summary,
    signals: normalizeSignals(summary.signals).length > 0 ? normalizeSignals(summary.signals) : signals,
    uncertaintyReasons: normalizeStringArray(summary.uncertaintyReasons ?? summary.uncertainty_reasons),
  }
}

function readinessImpactSummary(row: TaskSignalRow): ImpactSignalSummaryLike | null {
  const readiness = readRecord(row.readiness_summary)
  const summary = readRecord(readiness.impactSignalSummary ?? readiness.impact_signal_summary)
  const signals = normalizeSignals(readiness.impactSignals ?? readiness.impact_signals)
  if (signals.length === 0 && Object.keys(summary).length === 0) return null
  return summaryWithSignals(summary, signals)
}

function forecastImpactSummary(row: ForecastSignalRow): ImpactSignalSummaryLike | null {
  const metadata = readRecord(row.metadata)
  const forecastSources = readRecord(metadata.forecastSources ?? metadata.forecast_sources)
  const summary = readRecord(forecastSources.impactSignalSummary ?? forecastSources.impact_signal_summary)
  const signals = normalizeSignals(forecastSources.impactSignals ?? forecastSources.impact_signals)
  if (signals.length === 0 && Object.keys(summary).length === 0) return null
  return summaryWithSignals({
    confirmedDelayDays: row.forecast_delay_days ?? summary.confirmedDelayDays,
    ...summary,
  }, signals)
}

async function loadTaskSignalRows(
  projectId?: string,
  options: ScanWarningsFromImpactSignalSummariesOptions = {},
): Promise<TaskSignalRow[]> {
  const taskIds = normalizeScanTaskIds(options.taskIds)
  if (options.taskIds && taskIds.length === 0) return []
  const changedSince = normalizeScanChangedSince(options.changedSince)
  const limit = normalizeScanLimit(options.limit)
  let query = (supabase as any)
    .from('tasks')
    .select('id, project_id, title, status, readiness_summary, updated_at')
  if (projectId) query = query.eq('project_id', projectId)
  if (taskIds.length > 0) query = query.in('id', taskIds)
  if (changedSince) query = query.gte('updated_at', changedSince)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data as TaskSignalRow[] : []
}

async function loadForecastSignalRows(
  projectId?: string,
  options: ScanWarningsFromImpactSignalSummariesOptions = {},
): Promise<ForecastSignalRow[]> {
  const taskIds = normalizeScanTaskIds(options.taskIds)
  if (options.taskIds && taskIds.length === 0) return []
  const changedSince = normalizeScanChangedSince(options.changedSince)
  const limit = normalizeScanLimit(options.limit)
  let query = (supabase as any)
    .from('task_duration_forecasts')
    .select('id, project_id, task_id, forecast_delay_days, delay_risk_index, metadata, generated_at, is_current')
    .eq('is_current', true)
  if (projectId) query = query.eq('project_id', projectId)
  if (taskIds.length > 0) query = query.in('task_id', taskIds)
  if (changedSince) query = query.gte('generated_at', changedSince)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data as ForecastSignalRow[] : []
}

export async function scanWarningsFromImpactSignalSummaries(
  projectId?: string,
  options: ScanWarningsFromImpactSignalSummariesOptions = {},
): Promise<ImpactSignalWarning[]> {
  const [tasks, forecasts] = await Promise.all([
    loadTaskSignalRows(projectId, options),
    loadForecastSignalRows(projectId, options),
  ])
  const taskById = new Map(tasks.map((task) => [normalizeText(task.id), task]))
  const taskHasReadinessSummary = new Set<string>()
  const warnings: ImpactSignalWarning[] = []

  for (const task of tasks) {
    const summary = readinessImpactSummary(task)
    if (!summary) continue
    const taskId = normalizeText(task.id)
    if (taskId) taskHasReadinessSummary.add(taskId)
    warnings.push(...buildWarningsFromImpactSignalSummary({
      projectId: normalizeText(task.project_id) || projectId || '',
      taskId,
      taskTitle: task.title,
      source: 'readiness_summary',
      summary,
      policy: options.policy,
      ownerships: ['condition', 'obstacle', 'dependency'],
      includeDelayWarning: false,
    }))
  }

  for (const forecast of forecasts) {
    const summary = forecastImpactSummary(forecast)
    if (!summary) continue
    const taskId = normalizeText(forecast.task_id)
    const task = taskById.get(taskId)
    warnings.push(...buildWarningsFromImpactSignalSummary({
      projectId: normalizeText(forecast.project_id) || normalizeText(task?.project_id) || projectId || '',
      taskId,
      taskTitle: task?.title,
      source: 'duration_forecast',
      summary,
      policy: options.policy,
      ownerships: taskHasReadinessSummary.has(taskId) ? ['acceptance'] : ['condition', 'obstacle', 'acceptance', 'dependency'],
      includeDelayWarning: true,
    }))
  }

  return dedupeWarningsBySignal(warnings).filter((warning) => Boolean(warning.project_id))
}

export function buildDelayWarningReplayGovernanceReport(
  records: DelayWarningReplayRecord[],
  options: WarningReplayGovernanceOptions = {},
) {
  const samples = buildDelayWarningReplaySamples(records)
  const evaluation = evaluateDelayWarningSignalReplay(samples, options)
  const threshold = evaluation.thresholdCalibration?.recommendedThreshold ?? null
  const currentThreshold = evaluation.thresholdCalibration?.currentThreshold ?? null
  const candidate = evaluation.thresholdCalibration?.candidateResults.find((item) => item.threshold === threshold)
  const current = evaluation.thresholdCalibration?.candidateResults.find((item) => item.threshold === currentThreshold)
  return {
    sampleCount: samples.length,
    generatedAt: new Date().toISOString(),
    evaluation,
    shadowCalibration: evaluation.thresholdCalibration
      ? {
        appliedMode: 'shadow_only',
        currentThreshold,
        recommendedThreshold: threshold,
        recommendedPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold',
        projectedWarningDelta: (candidate?.warnedCount ?? 0) - (current?.warnedCount ?? 0),
        projectedFalsePositiveDelta: (candidate?.falsePositiveCount ?? 0) - (current?.falsePositiveCount ?? 0),
        projectedRecallDelta: (candidate?.recall ?? 0) - (current?.recall ?? 0),
      }
      : null,
    warningPolicy: {
      policy: 'confirmed_or_weighted_risk_score_at_least_threshold',
      thresholdSource: evaluation.thresholdCalibration ? 'historical_replay_calibration' : 'default_signal_summary',
      appliedMode: evaluation.thresholdCalibration ? 'shadow_only' : 'default_runtime',
      recommendedThreshold: threshold,
      currentThreshold,
      netAssessment: evaluation.delta.netAssessment,
    },
  }
}
