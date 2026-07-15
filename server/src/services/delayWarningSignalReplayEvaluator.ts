import {
  summarizeDelayImpactSignals,
  type ExecutionImpactSignal,
} from './executionImpactSignals.js'

export type DelayWarningReplaySample = {
  taskId: string
  plannedEndDate?: string | null
  actualEndDate?: string | null
  beforeSignals: ExecutionImpactSignal[]
  afterSignals: ExecutionImpactSignal[]
}

export type DelayWarningReplayRecord = Record<string, unknown>

export type DelayWarningReplayCalibrationOptions = {
  currentThreshold?: number | null
  candidateThresholds?: number[]
  minPrecision?: number
  minRecall?: number
  maxFalsePositiveRate?: number
}

export type DelayWarningReplayOptions = {
  calibration?: DelayWarningReplayCalibrationOptions
}

type ReplaySideResult = {
  rawSignalCount: number
  dedupedSignalCount: number
  hasConfirmedDelaySignal: boolean
  hasUncertainRiskSignal: boolean
  warned: boolean
}

type ReplayAggregate = {
  actualDelayedCount: number
  warnedCount: number
  truePositiveCount: number
  falsePositiveCount: number
  falseNegativeCount: number
  trueNegativeCount: number
  precision: number
  recall: number
  topSourceCategories: Array<{ category: string; count: number }>
  topSeedSources: ReplayBreakdownItem[]
  topRules: ReplayBreakdownItem[]
  topResponsibilityOwners: ReplayBreakdownItem[]
}

type ReplayBreakdownItem = {
  source?: string
  rule?: string
  owner?: string
  warnedCount: number
  truePositiveCount: number
  falsePositiveCount: number
  precision: number
  weightedTruePositiveCount: number
}

export type DelayWarningReplaySampleResult = {
  taskId: string
  actualDelayed: boolean
  before: ReplaySideResult
  after: ReplaySideResult
}

type ThresholdCalibrationResult = {
  policy: 'replay_precision_recall_false_positive_guardrail'
  currentThreshold: number
  recommendedThreshold: number | null
  recommendedWarningPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold'
  candidateResults: Array<{
    threshold: number
    warnedCount: number
    truePositiveCount: number
    falsePositiveCount: number
    falseNegativeCount: number
    trueNegativeCount: number
    precision: number
    recall: number
    falsePositiveRate: number
    accepted: boolean
    rejectionReasons: string[]
    netScore: number
  }>
}

function normalizeDate(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function isActualDelayed(sample: DelayWarningReplaySample) {
  const plannedEnd = normalizeDate(sample.plannedEndDate)
  const actualEnd = normalizeDate(sample.actualEndDate)
  if (!plannedEnd || !actualEnd) return false
  return actualEnd.getTime() > plannedEnd.getTime()
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function isExecutionImpactSignal(value: unknown): value is ExecutionImpactSignal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Boolean(record.signalId ?? record.signal_id)
}

function normalizeSignal(value: unknown): ExecutionImpactSignal | null {
  if (!isExecutionImpactSignal(value)) return null
  const record = value as Record<string, unknown>
  return {
    signalId: normalizeText(record.signalId ?? record.signal_id),
    sourceAlgorithm: (normalizeText(record.sourceAlgorithm ?? record.source_algorithm) || 'condition') as ExecutionImpactSignal['sourceAlgorithm'],
    sourceEntityType: normalizeText(record.sourceEntityType ?? record.source_entity_type),
    sourceEntityId: normalizeText(record.sourceEntityId ?? record.source_entity_id),
    sourceCategory: normalizeText(record.sourceCategory ?? record.source_category) || 'unknown',
    impactOwnership: (normalizeText(record.impactOwnership ?? record.impact_ownership) || 'condition') as ExecutionImpactSignal['impactOwnership'],
    impactMode: (normalizeText(record.impactMode ?? record.impact_mode) || 'confidence_only') as ExecutionImpactSignal['impactMode'],
    impactPhase: (normalizeText(record.impactPhase ?? record.impact_phase) || 'execution') as ExecutionImpactSignal['impactPhase'],
    severity: (normalizeText(record.severity) || 'warning') as ExecutionImpactSignal['severity'],
    runtimePolicy: (normalizeText(record.runtimePolicy ?? record.runtime_policy) || 'confidence_only') as ExecutionImpactSignal['runtimePolicy'],
    confidence: normalizeNumber(record.confidence, 0.5),
    expectedDate: normalizeText(record.expectedDate ?? record.expected_date) || null,
    reason: normalizeText(record.reason),
    dedupeKey: normalizeText(record.dedupeKey ?? record.dedupe_key) || normalizeText(record.signalId ?? record.signal_id),
    metadata: readRecord(record.metadata),
    responsibility: record.responsibility as ExecutionImpactSignal['responsibility'],
    criticalityWeight: record.criticalityWeight == null && record.criticality_weight == null ? undefined : normalizeNumber(record.criticalityWeight ?? record.criticality_weight, 1),
    criticalityBasis: normalizeText(record.criticalityBasis ?? record.criticality_basis) || null,
    weightedRiskScore: record.weightedRiskScore == null && record.weighted_risk_score == null ? undefined : normalizeNumber(record.weightedRiskScore ?? record.weighted_risk_score, 0),
  }
}

function normalizeSignalArray(value: unknown): ExecutionImpactSignal[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeSignal).filter((signal): signal is ExecutionImpactSignal => Boolean(signal))
}

function readSignals(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const signals = normalizeSignalArray(record[key])
    if (signals.length > 0) return signals
  }
  return []
}

function normalizeSnapshotSignals(record: Record<string, unknown>, stage: 'before' | 'after') {
  const snapshots = Array.isArray(record.impact_signal_snapshots)
    ? record.impact_signal_snapshots
    : Array.isArray(record.impactSignalSnapshots)
      ? record.impactSignalSnapshots
      : []
  const stageSnapshots = snapshots
    .map(readRecord)
    .filter((snapshot) => normalizeText(snapshot.stage ?? snapshot.phase ?? snapshot.kind).toLowerCase() === stage)
    .sort((left, right) => normalizeText(left.captured_at ?? left.capturedAt).localeCompare(normalizeText(right.captured_at ?? right.capturedAt)))
  const snapshot = stage === 'before' ? stageSnapshots[0] : stageSnapshots[stageSnapshots.length - 1]
  return normalizeSignalArray(snapshot?.signals ?? snapshot?.impactSignals ?? snapshot?.impact_signals)
}

export function buildDelayWarningReplaySamples(records: DelayWarningReplayRecord[]): DelayWarningReplaySample[] {
  return records.flatMap((record) => {
    const taskId = normalizeText(record.taskId ?? record.task_id ?? record.id)
    if (!taskId) return []
    const beforeSignals = readSignals(record, 'beforeSignals', 'before_signals', 'beforeImpactSignals', 'before_impact_signals')
    const afterSignals = readSignals(record, 'afterSignals', 'after_signals', 'afterImpactSignals', 'after_impact_signals')
    return [{
      taskId,
      plannedEndDate: normalizeText(record.plannedEndDate ?? record.planned_end_date) || null,
      actualEndDate: normalizeText(record.actualEndDate ?? record.actual_end_date) || null,
      beforeSignals: beforeSignals.length > 0 ? beforeSignals : normalizeSnapshotSignals(record, 'before'),
      afterSignals: afterSignals.length > 0 ? afterSignals : normalizeSnapshotSignals(record, 'after'),
    }]
  })
}

function evaluateSide(signals: ExecutionImpactSignal[]): ReplaySideResult {
  const summary = summarizeDelayImpactSignals(signals)
  const hasConfirmedDelaySignal = summary.signals.some((signal) => (
    signal.runtimePolicy === 'deterministic'
    && signal.impactMode !== 'confidence_only'
  ))
  const hasUncertainRiskSignal = summary.signals.some((signal) => (
    signal.runtimePolicy === 'confidence_only'
    || signal.impactMode === 'confidence_only'
  ))

  return {
    rawSignalCount: summary.rawCount,
    dedupedSignalCount: summary.dedupedCount,
    hasConfirmedDelaySignal,
    hasUncertainRiskSignal,
    warned: summary.dedupedCount > 0,
  }
}

function categoryBreakdown(samples: DelayWarningReplaySample[], side: 'beforeSignals' | 'afterSignals') {
  const counts = new Map<string, number>()
  for (const sample of samples) {
    const summary = summarizeDelayImpactSignals(sample[side])
    for (const signal of summary.signals) {
      const category = String(signal.sourceCategory || 'unknown')
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
}

function metadataText(signal: ExecutionImpactSignal, ...keys: string[]) {
  for (const key of keys) {
    const value = signal.metadata?.[key]
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function signalSeedSource(signal: ExecutionImpactSignal) {
  return metadataText(signal, 'sourceStandard', 'source_standard', 'seedSource', 'seed_source')
    || (signal.sourceEntityType === 'algorithm_seed' ? String(signal.sourceEntityId).split(':')[0] : signal.sourceEntityType)
    || 'unknown'
}

function signalRule(signal: ExecutionImpactSignal) {
  return metadataText(signal, 'ruleCode', 'rule_code', 'gateCode', 'gate_code', 'conditionCode', 'condition_code')
    || signal.sourceEntityId
    || signal.signalId
}

function signalOwner(signal: ExecutionImpactSignal) {
  const ownerUnitId = signal.responsibility?.ownerUnitId
    || metadataText(signal, 'ownerUnitId', 'owner_unit_id', 'participantUnitId', 'participant_unit_id')
  const ownerRole = signal.responsibility?.ownerRole
    || metadataText(signal, 'ownerRole', 'owner_role', 'responsibilityRole', 'responsibility_role')
  return `${ownerUnitId || 'unassigned'}|${ownerRole || 'unassigned'}`
}

function signalWeight(signal: ExecutionImpactSignal) {
  const weight = Number(signal.criticalityWeight ?? signal.metadata?.criticalityWeight ?? 1)
  return Number.isFinite(weight) && weight > 0 ? round(weight, 2) : 1
}

function metricBreakdown(
  samples: DelayWarningReplaySample[],
  side: 'beforeSignals' | 'afterSignals',
  dimension: 'source' | 'rule' | 'owner',
): ReplayBreakdownItem[] {
  const counts = new Map<string, ReplayBreakdownItem>()

  for (const sample of samples) {
    const actualDelayed = isActualDelayed(sample)
    const summary = summarizeDelayImpactSignals(sample[side])
    const seenInSample = new Set<string>()
    for (const signal of summary.signals) {
      const key = dimension === 'source'
        ? signalSeedSource(signal)
        : dimension === 'rule'
          ? signalRule(signal)
          : signalOwner(signal)
      const sampleKey = `${sample.taskId}:${key}`
      if (seenInSample.has(sampleKey)) continue
      seenInSample.add(sampleKey)

      const current = counts.get(key) ?? {
        [dimension]: key,
        warnedCount: 0,
        truePositiveCount: 0,
        falsePositiveCount: 0,
        precision: 0,
        weightedTruePositiveCount: 0,
      } as ReplayBreakdownItem
      current.warnedCount += 1
      if (actualDelayed) {
        current.truePositiveCount += 1
        current.weightedTruePositiveCount = round(current.weightedTruePositiveCount + signalWeight(signal), 2)
      } else {
        current.falsePositiveCount += 1
      }
      current.precision = current.warnedCount > 0 ? round(current.truePositiveCount / current.warnedCount) : 0
      counts.set(key, current)
    }
  }

  return Array.from(counts.values())
    .sort((left, right) => right.warnedCount - left.warnedCount || right.truePositiveCount - left.truePositiveCount)
    .slice(0, 10)
}

function aggregateResults(
  sampleResults: DelayWarningReplaySampleResult[],
  samples: DelayWarningReplaySample[],
  side: 'before' | 'after',
): ReplayAggregate {
  let actualDelayedCount = 0
  let warnedCount = 0
  let truePositiveCount = 0
  let falsePositiveCount = 0
  let falseNegativeCount = 0
  let trueNegativeCount = 0

  for (const result of sampleResults) {
    const actualDelayed = result.actualDelayed
    const warned = result[side].warned
    if (actualDelayed) actualDelayedCount += 1
    if (warned) warnedCount += 1
    if (actualDelayed && warned) truePositiveCount += 1
    if (!actualDelayed && warned) falsePositiveCount += 1
    if (actualDelayed && !warned) falseNegativeCount += 1
    if (!actualDelayed && !warned) trueNegativeCount += 1
  }

  return {
    actualDelayedCount,
    warnedCount,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    trueNegativeCount,
    precision: warnedCount > 0 ? round(truePositiveCount / warnedCount) : 0,
    recall: actualDelayedCount > 0 ? round(truePositiveCount / actualDelayedCount) : 0,
    topSourceCategories: categoryBreakdown(samples, side === 'before' ? 'beforeSignals' : 'afterSignals'),
    topSeedSources: metricBreakdown(samples, side === 'before' ? 'beforeSignals' : 'afterSignals', 'source'),
    topRules: metricBreakdown(samples, side === 'before' ? 'beforeSignals' : 'afterSignals', 'rule'),
    topResponsibilityOwners: metricBreakdown(samples, side === 'before' ? 'beforeSignals' : 'afterSignals', 'owner'),
  }
}

function netAssessment(params: {
  recallDelta: number
  falsePositiveDelta: number
}) {
  if (params.recallDelta > 0 && params.falsePositiveDelta <= 0) return 'hit_rate_improved_without_more_false_positives'
  if (params.recallDelta > 0 && params.falsePositiveDelta > 0) return 'hit_rate_improved_with_more_false_positives'
  if (params.recallDelta === 0 && params.falsePositiveDelta > 0) return 'no_hit_rate_gain_with_more_false_positives'
  if (params.recallDelta < 0) return 'hit_rate_regressed'
  return 'no_material_change'
}

function warningScore(signals: ExecutionImpactSignal[]) {
  const summary = summarizeDelayImpactSignals(signals)
  return normalizeNumber(summary.weightedRiskScore, 0)
}

function normalizeThresholds(options?: DelayWarningReplayCalibrationOptions) {
  const configured = Array.isArray(options?.candidateThresholds)
    ? options.candidateThresholds
    : [0, 0.35, 0.55, 0.75, 0.95]
  return Array.from(new Set(configured.map((value) => round(Math.max(0, normalizeNumber(value, 0)), 2))))
    .sort((left, right) => left - right)
}

function calibrateThresholds(
  samples: DelayWarningReplaySample[],
  options?: DelayWarningReplayCalibrationOptions,
): ThresholdCalibrationResult {
  const minPrecision = options?.minPrecision ?? 0.6
  const minRecall = options?.minRecall ?? 0.5
  const maxFalsePositiveRate = options?.maxFalsePositiveRate ?? 0.4
  const thresholds = normalizeThresholds(options)
  const delayedCount = samples.filter(isActualDelayed).length
  const notDelayedCount = samples.length - delayedCount
  const scored = samples.map((sample) => ({
    sample,
    actualDelayed: isActualDelayed(sample),
    score: warningScore(sample.afterSignals),
  }))

  const candidateResults = thresholds.map((threshold) => {
    let warnedCount = 0
    let truePositiveCount = 0
    let falsePositiveCount = 0
    let falseNegativeCount = 0
    let trueNegativeCount = 0
    for (const item of scored) {
      const warned = item.score > 0 && item.score >= threshold
      if (warned) warnedCount += 1
      if (item.actualDelayed && warned) truePositiveCount += 1
      if (!item.actualDelayed && warned) falsePositiveCount += 1
      if (item.actualDelayed && !warned) falseNegativeCount += 1
      if (!item.actualDelayed && !warned) trueNegativeCount += 1
    }
    const precision = warnedCount > 0 ? round(truePositiveCount / warnedCount) : 0
    const recall = delayedCount > 0 ? round(truePositiveCount / delayedCount) : 0
    const falsePositiveRate = notDelayedCount > 0 ? round(falsePositiveCount / notDelayedCount) : 0
    const rejectionReasons = [
      precision < minPrecision ? 'precision_below_minimum' : null,
      recall < minRecall ? 'recall_below_minimum' : null,
      falsePositiveRate > maxFalsePositiveRate ? 'false_positive_rate_above_guardrail' : null,
      warnedCount === 0 ? 'no_warnings_at_threshold' : null,
    ].filter((reason): reason is string => Boolean(reason))
    return {
      threshold,
      warnedCount,
      truePositiveCount,
      falsePositiveCount,
      falseNegativeCount,
      trueNegativeCount,
      precision,
      recall,
      falsePositiveRate,
      accepted: rejectionReasons.length === 0,
      rejectionReasons,
      netScore: round(recall * 2 + precision - falsePositiveRate),
    }
  })

  const accepted = candidateResults
    .filter((item) => item.accepted)
    .sort((left, right) => right.netScore - left.netScore || left.falsePositiveRate - right.falsePositiveRate || left.threshold - right.threshold)
  const fallback = [...candidateResults]
    .sort((left, right) => right.netScore - left.netScore || left.falsePositiveRate - right.falsePositiveRate || left.threshold - right.threshold)
  const recommended = accepted[0] ?? fallback[0] ?? null

  return {
    policy: 'replay_precision_recall_false_positive_guardrail',
    currentThreshold: round(normalizeNumber(options?.currentThreshold, thresholds[0] ?? 0), 2),
    recommendedThreshold: recommended ? recommended.threshold : null,
    recommendedWarningPolicy: 'confirmed_or_weighted_risk_score_at_least_threshold',
    candidateResults,
  }
}

export function evaluateDelayWarningSignalReplay(samples: DelayWarningReplaySample[], options: DelayWarningReplayOptions = {}) {
  const sampleResults = samples.map((sample) => ({
    taskId: sample.taskId,
    actualDelayed: isActualDelayed(sample),
    before: evaluateSide(sample.beforeSignals),
    after: evaluateSide(sample.afterSignals),
  }) satisfies DelayWarningReplaySampleResult)

  const before = aggregateResults(sampleResults, samples, 'before')
  const after = aggregateResults(sampleResults, samples, 'after')
  const recallDelta = round(after.recall - before.recall)
  const precisionDelta = round(after.precision - before.precision)
  const falsePositiveDelta = after.falsePositiveCount - before.falsePositiveCount

  return {
    sampleCount: samples.length,
    before,
    after,
    delta: {
      recallDelta,
      precisionDelta,
      falsePositiveDelta,
      netAssessment: netAssessment({ recallDelta, falsePositiveDelta }),
    },
    sampleResults,
    thresholdCalibration: options.calibration
      ? calibrateThresholds(samples, options.calibration)
      : undefined,
  }
}
