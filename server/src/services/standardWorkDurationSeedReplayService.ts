import {
  resolveStandardWorkDurationSeed,
  type AlgorithmSeedResolveContext,
} from './algorithmSeedResolver.js'
import type { AlgorithmSeedDiscoverySample } from './algorithmSeedCandidateDiscoveryService.js'

export type StandardWorkDurationSeedReplayResolver = (
  text: string,
  context: AlgorithmSeedResolveContext,
) => Promise<Record<string, unknown> | null>

export type StandardWorkDurationSeedReplayStatus =
  | 'trusted'
  | 'needs_review'
  | 'unresolved_seed'
  | 'insufficient_samples'

export type StandardWorkDurationSeedReplayBiasDirection =
  | 'seed_underestimates_actual'
  | 'seed_overestimates_actual'
  | 'balanced'

export interface StandardWorkDurationSeedReplayOptions {
  minSamplesPerCode?: number
  toleranceRatio?: number
  trustedWithinToleranceRatio?: number
  resolver?: StandardWorkDurationSeedReplayResolver
}

export interface StandardWorkDurationSeedReplayItem {
  standardWorkCode: string
  replayContextKey: string
  sampleCount: number
  seedStableCode: string | null
  seedP50Days: number | null
  selectedConditionCode: string | null
  seedConfidence: string | null
  medianActualDays: number
  medianAbsolutePercentageError: number | null
  withinThirtyPercentRatio: number | null
  biasDirection: StandardWorkDurationSeedReplayBiasDirection | null
  replayStatus: StandardWorkDurationSeedReplayStatus
  recommendation:
    | 'keep_seed_p50'
    | 'review_p50_or_split_condition_band'
    | 'add_or_import_standard_work_duration_seed'
    | 'collect_more_samples'
  sampleIds: string[]
}

export interface StandardWorkDurationSeedReplayCalibrationQueueItem {
  standardWorkCode: string
  replayContextKey: string
  queueStatus:
    | 'manual_seed_review_required'
    | 'seed_authoring_required'
    | 'collect_more_samples'
  recommendation: StandardWorkDurationSeedReplayItem['recommendation']
  sampleCount: number
  seedStableCode: string | null
  seedP50Days: number | null
  medianActualDays: number
  medianAbsolutePercentageError: number | null
  withinThirtyPercentRatio: number | null
  biasDirection: StandardWorkDurationSeedReplayBiasDirection | null
  selectedConditionCode: string | null
  seedConfidence: string | null
  sampleIds: string[]
  promotionPolicy: 'review_required_before_seed_promotion'
  seedWritePolicy: 'never_write_seed_from_replay'
}

export interface StandardWorkDurationSeedReplayReport {
  reportCode: 'standard_work_duration_seed_p50_replay'
  generatedAt: string
  governancePolicy: {
    replayMode: 'report_only'
    seedWritePolicy: 'never_write_seed_from_replay'
    candidatePolicy: 'review_required_before_seed_promotion'
  }
  summary: {
    inputSampleCount: number
    eligibleSampleCount: number
    matchedSampleCount: number
    evaluatedCodeCount: number
    trustedCodeCount: number
    reviewRequiredCodeCount: number
    unresolvedCodeCount: number
    insufficientSampleGroupCount: number
    overallWithinThirtyPercentRatio: number | null
  }
  calibrationQueues: {
    p50ReviewCandidates: StandardWorkDurationSeedReplayCalibrationQueueItem[]
    missingSeedCandidates: StandardWorkDurationSeedReplayCalibrationQueueItem[]
    evidenceCollectionCandidates: StandardWorkDurationSeedReplayCalibrationQueueItem[]
  }
  byStandardWorkCode: StandardWorkDurationSeedReplayItem[]
}

export type StandardWorkDurationSeedLearningScopeEvidence =
  | 'global'
  | 'industry'
  | 'company'
  | 'project'
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export interface StandardWorkDurationSeedLiveLearningEvidenceInput {
  replayReport: StandardWorkDurationSeedReplayReport
  actualOutcomeEventRecorded: boolean
  approvedReplayCandidateRecorded: boolean
  enabledLearningScopes: readonly StandardWorkDurationSeedLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact: boolean
  seedPublicationWriterReady: boolean
  seedVersionLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface StandardWorkDurationSeedLiveLearningEvidence {
  assetClassificationRegistered: true
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: Array<'global' | 'industry' | 'company' | 'project'>
  runtimeConsumerUsesPublishedArtifact: boolean
  trustedReplayOrReviewCandidatePresent: boolean
  approvedReplayCandidateRecorded: boolean
  seedReplayReportOnly: boolean
  seedWritePolicyPreserved: boolean
  seedPublicationWriterReady: boolean
  seedVersionLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface StandardWorkDurationSeedLiveLearningEvidenceDecision {
  status: 'standard_work_seed_live_learning_ready' | 'standard_work_seed_live_learning_not_ready'
  liveLearningEvidence: StandardWorkDurationSeedLiveLearningEvidence
  missingReasons: string[]
}

type ReplaySample = {
  sample: AlgorithmSeedDiscoverySample
  standardWorkCode: string
  actualDuration: number
  context: AlgorithmSeedResolveContext
  contextKey: string
}

const DEFAULT_MIN_SAMPLES_PER_CODE = 5
const DEFAULT_TOLERANCE_RATIO = 0.3
const DEFAULT_TRUSTED_WITHIN_TOLERANCE_RATIO = 0.8

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizePositiveDays(value: unknown) {
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? days : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.map(normalizeText).filter(Boolean)))
  const text = normalizeText(value)
  return text ? Array.from(new Set(text.split(/[,\s|+]+/).map(normalizeText).filter(Boolean))) : []
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function roundRatio(value: number) {
  return Number(value.toFixed(6))
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

const STANDARD_DURATION_LEARNING_SCOPE_ORDER = ['global', 'industry', 'company', 'project'] as const

function normalizeStandardDurationLearningScopes(
  scopes: readonly StandardWorkDurationSeedLearningScopeEvidence[] | undefined,
): Array<typeof STANDARD_DURATION_LEARNING_SCOPE_ORDER[number]> {
  const normalized = new Set<typeof STANDARD_DURATION_LEARNING_SCOPE_ORDER[number]>()
  for (const scope of scopes ?? []) {
    const value = normalizeLower(scope)
    if (value === 'system' || value === 'global') normalized.add('global')
    if (value === 'industry' || value === 'industry_baseline' || value === 'segment_baseline') normalized.add('industry')
    if (value === 'company') normalized.add('company')
    if (value === 'project') normalized.add('project')
  }
  return STANDARD_DURATION_LEARNING_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function readMetadata(sample: AlgorithmSeedDiscoverySample) {
  return readRecord(sample.metadata)
}

function readConditionSelector(sample: AlgorithmSeedDiscoverySample) {
  const metadata = readMetadata(sample)
  return {
    ...readRecord(metadata.condition_selector),
    ...readRecord(metadata.conditionSelector),
    depthBand: metadata.depth_band ?? metadata.depthBand ?? readRecord(metadata.condition_selector).depthBand ?? readRecord(metadata.conditionSelector).depthBand,
    diameterBand: metadata.diameter_band ?? metadata.diameterBand ?? readRecord(metadata.condition_selector).diameterBand ?? readRecord(metadata.conditionSelector).diameterBand,
    geologyBand: metadata.geology_band ?? metadata.geologyBand ?? readRecord(metadata.condition_selector).geologyBand ?? readRecord(metadata.conditionSelector).geologyBand,
    facadeSystemBand: metadata.facade_system_band ?? metadata.facadeSystemBand ?? readRecord(metadata.condition_selector).facadeSystemBand ?? readRecord(metadata.conditionSelector).facadeSystemBand,
    formworkSystemBand: metadata.formwork_system_band ?? metadata.formworkSystemBand ?? readRecord(metadata.condition_selector).formworkSystemBand ?? readRecord(metadata.conditionSelector).formworkSystemBand,
    concretePlacementBand: metadata.concrete_placement_band ?? metadata.concretePlacementBand ?? readRecord(metadata.condition_selector).concretePlacementBand ?? readRecord(metadata.conditionSelector).concretePlacementBand,
    heightBand: metadata.height_band ?? metadata.heightBand ?? readRecord(metadata.condition_selector).heightBand ?? readRecord(metadata.conditionSelector).heightBand,
    locationBand: metadata.location_band ?? metadata.locationBand ?? readRecord(metadata.condition_selector).locationBand ?? readRecord(metadata.conditionSelector).locationBand,
    renovationBand: metadata.renovation_band ?? metadata.renovationBand ?? readRecord(metadata.condition_selector).renovationBand ?? readRecord(metadata.conditionSelector).renovationBand,
    workfaceBand: metadata.workface_band ?? metadata.workfaceBand ?? readRecord(metadata.condition_selector).workfaceBand ?? readRecord(metadata.conditionSelector).workfaceBand,
  }
}

function conditionSignal(selectorKey: string, value: unknown) {
  const normalized = normalizeLower(value)
  if (!normalized) return null
  const map: Record<string, Record<string, string>> = {
    depthBand: {
      short: 'short_depth',
      standard: 'standard_depth',
      deep: 'deep_depth',
    },
    diameterBand: {
      standard: 'standard_diameter',
      large: 'large_diameter',
    },
    geologyBand: {
      normal: 'normal_geology',
      complex: 'complex_geology',
    },
    facadeSystemBand: {
      unitized: 'unitized_curtain_wall',
      stone: 'stone_curtain_wall',
      glass: 'glass_curtain_wall',
      metal: 'metal_panel_curtain_wall',
      stick: 'stick_curtain_wall',
    },
    formworkSystemBand: {
      aluminum: 'aluminum_formwork',
      large_form: 'large_formwork',
      timber: 'timber_formwork',
      climbing: 'climbing_formwork',
      prefab: 'prefab',
    },
    concretePlacementBand: {
      pump: 'pumped_concrete',
      bucket: 'bucket_concrete',
      mass: 'mass_concrete',
    },
    heightBand: {
      low_rise: 'low_rise',
      high_rise: 'high_rise',
    },
    locationBand: {
      indoor: 'indoor',
      outdoor: 'outdoor',
    },
    renovationBand: {
      new_build: 'new_build',
      renovation: 'renovation',
    },
    workfaceBand: {
      open: 'open_workface',
      constrained: 'constrained_workface',
    },
  }
  return map[selectorKey]?.[normalized] ?? normalized
}

function buildConditionSignals(sample: AlgorithmSeedDiscoverySample) {
  const selector = readConditionSelector(sample)
  return Array.from(new Set(Object.entries(selector)
    .map(([key, value]) => conditionSignal(key, value))
    .filter((value): value is string => Boolean(value))))
}

function buildContext(sample: AlgorithmSeedDiscoverySample, standardWorkCode: string): AlgorithmSeedResolveContext {
  const metadata = readMetadata(sample)
  const methodVariantCodes = readArray(metadata.method_variant_codes ?? metadata.methodVariantCodes)
  const elementVariantCodes = readArray(metadata.element_variant_codes ?? metadata.elementVariantCodes)
  const conditionSignals = buildConditionSignals(sample)
  return {
    standardWorkCode,
    standardWorkCodes: [standardWorkCode],
    projectId: normalizeText(sample.project_id),
    companyId: normalizeText(sample.company_id ?? metadata.company_id),
    projectTypeCode: normalizeText(metadata.project_type_code ?? metadata.projectTypeCode),
    structureTypeCode: normalizeText(metadata.structure_type_code ?? metadata.structureTypeCode),
    methodVariantCodes,
    elementVariantCodes,
    scopeDimensions: Array.from(new Set([
      ...readArray(metadata.scope_dimensions ?? metadata.scopeDimensions),
      ...conditionSignals,
    ])),
    contextKeywords: Array.from(new Set([
      normalizeText(sample.standard_work_name),
      ...readArray(metadata.context_keywords ?? metadata.contextKeywords),
    ].filter(Boolean))),
    primaryWorkfaceType: normalizeText(metadata.primary_workface_type ?? metadata.primaryWorkfaceType),
    workEnvironment: normalizeText(metadata.work_environment ?? metadata.workEnvironment),
  }
}

function buildReplayContextKey(context: AlgorithmSeedResolveContext) {
  const parts = [
    context.projectTypeCode ? `project=${context.projectTypeCode}` : '',
    context.structureTypeCode ? `structure=${context.structureTypeCode}` : '',
    context.methodVariantCodes?.length ? `method=${context.methodVariantCodes.join('+')}` : '',
    context.elementVariantCodes?.length ? `element=${context.elementVariantCodes.join('+')}` : '',
    context.scopeDimensions?.length ? `condition=${context.scopeDimensions.join('+')}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('|') : 'standard'
}

function normalizeSample(sample: AlgorithmSeedDiscoverySample): ReplaySample | null {
  const standardWorkCode = normalizeText(sample.standard_work_code)
  const actualDuration = normalizePositiveDays(sample.actual_duration)
  if (!standardWorkCode || !actualDuration) return null
  const context = buildContext(sample, standardWorkCode)
  return {
    sample,
    standardWorkCode,
    actualDuration,
    context,
    contextKey: normalizeText(readMetadata(sample).benchmark_context_key) || buildReplayContextKey(context),
  }
}

function readSeedP50(seed: Record<string, unknown> | null) {
  const days = normalizePositiveDays(seed?.defaultDaysP50 ?? seed?.default_days_p50 ?? seed?.defaultDays ?? seed?.default_days)
  return days && days > 0 ? days : null
}

function resolveBiasDirection(medianActualDays: number, seedP50Days: number, toleranceRatio: number): StandardWorkDurationSeedReplayBiasDirection {
  const deviation = (medianActualDays - seedP50Days) / seedP50Days
  if (Math.abs(deviation) <= toleranceRatio) return 'balanced'
  return deviation > 0 ? 'seed_underestimates_actual' : 'seed_overestimates_actual'
}

async function buildReplayItem(
  group: ReplaySample[],
  options: Required<Pick<StandardWorkDurationSeedReplayOptions, 'minSamplesPerCode' | 'toleranceRatio' | 'trustedWithinToleranceRatio' | 'resolver'>>,
): Promise<StandardWorkDurationSeedReplayItem> {
  const first = group[0]
  const actualDurations = group.map((item) => item.actualDuration)
  const medianActualDays = median(actualDurations)
  const sampleIds = group.map((item) => normalizeText(item.sample.id)).filter(Boolean)
  if (group.length < options.minSamplesPerCode) {
    return {
      standardWorkCode: first.standardWorkCode,
      replayContextKey: first.contextKey,
      sampleCount: group.length,
      seedStableCode: null,
      seedP50Days: null,
      selectedConditionCode: null,
      seedConfidence: null,
      medianActualDays,
      medianAbsolutePercentageError: null,
      withinThirtyPercentRatio: null,
      biasDirection: null,
      replayStatus: 'insufficient_samples',
      recommendation: 'collect_more_samples',
      sampleIds,
    }
  }

  const seed = await options.resolver(
    normalizeText(first.sample.standard_work_name) || first.standardWorkCode,
    first.context,
  )
  const seedP50Days = readSeedP50(seed)
  if (!seed || !seedP50Days) {
    return {
      standardWorkCode: first.standardWorkCode,
      replayContextKey: first.contextKey,
      sampleCount: group.length,
      seedStableCode: null,
      seedP50Days: null,
      selectedConditionCode: null,
      seedConfidence: null,
      medianActualDays,
      medianAbsolutePercentageError: null,
      withinThirtyPercentRatio: null,
      biasDirection: null,
      replayStatus: 'unresolved_seed',
      recommendation: 'add_or_import_standard_work_duration_seed',
      sampleIds,
    }
  }

  const absolutePercentageErrors = actualDurations.map((days) => Math.abs(days - seedP50Days) / seedP50Days)
  const withinToleranceCount = absolutePercentageErrors.filter((value) => value <= options.toleranceRatio).length
  const medianAbsolutePercentageError = median(absolutePercentageErrors)
  const withinThirtyPercentRatio = withinToleranceCount / group.length
  const biasDirection = resolveBiasDirection(medianActualDays, seedP50Days, options.toleranceRatio)
  const replayStatus: StandardWorkDurationSeedReplayStatus = (
    medianAbsolutePercentageError <= options.toleranceRatio
    && withinThirtyPercentRatio >= options.trustedWithinToleranceRatio
  ) ? 'trusted' : 'needs_review'

  return {
    standardWorkCode: first.standardWorkCode,
    replayContextKey: first.contextKey,
    sampleCount: group.length,
    seedStableCode: normalizeText(seed.stableCode ?? seed.__stableCode ?? seed.seedRuleId) || null,
    seedP50Days,
    selectedConditionCode: normalizeText(seed.selectedConditionCode) || null,
    seedConfidence: normalizeText(seed.confidence) || null,
    medianActualDays,
    medianAbsolutePercentageError,
    withinThirtyPercentRatio: roundRatio(withinThirtyPercentRatio),
    biasDirection,
    replayStatus,
    recommendation: replayStatus === 'trusted' ? 'keep_seed_p50' : 'review_p50_or_split_condition_band',
    sampleIds,
  }
}

function buildCalibrationQueueItem(
  item: StandardWorkDurationSeedReplayItem,
  queueStatus: StandardWorkDurationSeedReplayCalibrationQueueItem['queueStatus'],
): StandardWorkDurationSeedReplayCalibrationQueueItem {
  return {
    standardWorkCode: item.standardWorkCode,
    replayContextKey: item.replayContextKey,
    queueStatus,
    recommendation: item.recommendation,
    sampleCount: item.sampleCount,
    seedStableCode: item.seedStableCode,
    seedP50Days: item.seedP50Days,
    medianActualDays: item.medianActualDays,
    medianAbsolutePercentageError: item.medianAbsolutePercentageError,
    withinThirtyPercentRatio: item.withinThirtyPercentRatio,
    biasDirection: item.biasDirection,
    selectedConditionCode: item.selectedConditionCode,
    seedConfidence: item.seedConfidence,
    sampleIds: item.sampleIds,
    promotionPolicy: 'review_required_before_seed_promotion',
    seedWritePolicy: 'never_write_seed_from_replay',
  }
}

function buildCalibrationQueues(items: StandardWorkDurationSeedReplayItem[]): StandardWorkDurationSeedReplayReport['calibrationQueues'] {
  return {
    p50ReviewCandidates: items
      .filter((item) => item.replayStatus === 'needs_review')
      .map((item) => buildCalibrationQueueItem(item, 'manual_seed_review_required')),
    missingSeedCandidates: items
      .filter((item) => item.replayStatus === 'unresolved_seed')
      .map((item) => buildCalibrationQueueItem(item, 'seed_authoring_required')),
    evidenceCollectionCandidates: items
      .filter((item) => item.replayStatus === 'insufficient_samples')
      .map((item) => buildCalibrationQueueItem(item, 'collect_more_samples')),
  }
}

export async function replayStandardWorkDurationSeedAgainstSamples(
  samples: AlgorithmSeedDiscoverySample[],
  options: StandardWorkDurationSeedReplayOptions = {},
): Promise<StandardWorkDurationSeedReplayReport> {
  const normalized = samples.map(normalizeSample).filter((item): item is ReplaySample => Boolean(item))
  const groups = new Map<string, ReplaySample[]>()
  for (const item of normalized) {
    const key = `${item.standardWorkCode}::${item.contextKey}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  const requiredOptions = {
    minSamplesPerCode: options.minSamplesPerCode ?? DEFAULT_MIN_SAMPLES_PER_CODE,
    toleranceRatio: options.toleranceRatio ?? DEFAULT_TOLERANCE_RATIO,
    trustedWithinToleranceRatio: options.trustedWithinToleranceRatio ?? DEFAULT_TRUSTED_WITHIN_TOLERANCE_RATIO,
    resolver: options.resolver ?? resolveStandardWorkDurationSeed,
  }
  const byStandardWorkCode = await Promise.all([...groups.values()].map((group) => buildReplayItem(group, requiredOptions)))
  const calibrationQueues = buildCalibrationQueues(byStandardWorkCode)
  const matchedItems = byStandardWorkCode.filter((item) => item.seedP50Days != null && item.withinThirtyPercentRatio != null)
  const matchedSampleCount = matchedItems.reduce((sum, item) => sum + item.sampleCount, 0)
  const withinToleranceSampleCount = matchedItems.reduce((sum, item) => (
    sum + Math.round((item.withinThirtyPercentRatio ?? 0) * item.sampleCount)
  ), 0)

  return {
    reportCode: 'standard_work_duration_seed_p50_replay',
    generatedAt: new Date().toISOString(),
    governancePolicy: {
      replayMode: 'report_only',
      seedWritePolicy: 'never_write_seed_from_replay',
      candidatePolicy: 'review_required_before_seed_promotion',
    },
    summary: {
      inputSampleCount: samples.length,
      eligibleSampleCount: normalized.length,
      matchedSampleCount,
      evaluatedCodeCount: byStandardWorkCode.length,
      trustedCodeCount: byStandardWorkCode.filter((item) => item.replayStatus === 'trusted').length,
      reviewRequiredCodeCount: byStandardWorkCode.filter((item) => item.replayStatus === 'needs_review').length,
      unresolvedCodeCount: byStandardWorkCode.filter((item) => item.replayStatus === 'unresolved_seed').length,
      insufficientSampleGroupCount: byStandardWorkCode.filter((item) => item.replayStatus === 'insufficient_samples').length,
      overallWithinThirtyPercentRatio: matchedSampleCount > 0
        ? roundRatio(withinToleranceSampleCount / matchedSampleCount)
        : null,
    },
    calibrationQueues,
    byStandardWorkCode,
  }
}

export function evaluateStandardWorkDurationSeedLiveLearningEvidence(
  input: StandardWorkDurationSeedLiveLearningEvidenceInput,
): StandardWorkDurationSeedLiveLearningEvidenceDecision {
  const report = input.replayReport
  const missingReasons: string[] = []
  const enabledLearningScopes = normalizeStandardDurationLearningScopes(input.enabledLearningScopes)
  const tieredLearningPolicyRegistered = STANDARD_DURATION_LEARNING_SCOPE_ORDER
    .every((scope) => enabledLearningScopes.includes(scope))
  const queueItems = [
    ...report.calibrationQueues.p50ReviewCandidates,
    ...report.calibrationQueues.missingSeedCandidates,
    ...report.calibrationQueues.evidenceCollectionCandidates,
  ]
  const seedReplayReportOnly = report.governancePolicy.replayMode === 'report_only'
  const seedWritePolicyPreserved = report.governancePolicy.seedWritePolicy === 'never_write_seed_from_replay'
    && queueItems.every((item) => item.seedWritePolicy === 'never_write_seed_from_replay')
  const predictionEventRecorded = report.reportCode === 'standard_work_duration_seed_p50_replay'
    && report.summary.evaluatedCodeCount > 0
  const actualOutcomeEventRecorded = input.actualOutcomeEventRecorded
    && report.summary.eligibleSampleCount > 0
  const trustedReplayOrReviewCandidatePresent = report.byStandardWorkCode.some((item) => (
    item.replayStatus === 'trusted' || item.replayStatus === 'needs_review'
  ))
    || report.calibrationQueues.p50ReviewCandidates.length > 0
    || report.calibrationQueues.missingSeedCandidates.length > 0

  if (!predictionEventRecorded) missingReasons.push('standard_work_seed_replay_report_required')
  if (!actualOutcomeEventRecorded) missingReasons.push('actual_outcome_event_required')
  if (!trustedReplayOrReviewCandidatePresent) missingReasons.push('trusted_replay_or_review_candidate_required')
  if (!input.approvedReplayCandidateRecorded) missingReasons.push('approved_replay_candidate_required')
  if (!seedReplayReportOnly) missingReasons.push('replay_must_remain_report_only')
  if (!seedWritePolicyPreserved) missingReasons.push('seed_write_policy_must_remain_never_write_from_replay')
  if (!input.seedPublicationWriterReady) missingReasons.push('seed_publication_writer_required')
  if (!input.seedVersionLineageRecorded) missingReasons.push('seed_version_lineage_required')
  if (!tieredLearningPolicyRegistered) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!input.runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!input.rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  const liveLearningEvidence: StandardWorkDurationSeedLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded,
    actualOutcomeEventRecorded,
    tieredLearningPolicyRegistered,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: input.runtimeConsumerUsesPublishedArtifact,
    trustedReplayOrReviewCandidatePresent,
    approvedReplayCandidateRecorded: input.approvedReplayCandidateRecorded,
    seedReplayReportOnly,
    seedWritePolicyPreserved,
    seedPublicationWriterReady: input.seedPublicationWriterReady,
    seedVersionLineageRecorded: input.seedVersionLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  }

  return {
    status: missingReasons.length === 0
      ? 'standard_work_seed_live_learning_ready'
      : 'standard_work_seed_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons: uniqueValues(missingReasons),
  }
}
