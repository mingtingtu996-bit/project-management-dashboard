import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
} from './durationLiveLearningProductionEvidenceGateService.js'

export type AlgorithmAssetColdStartBaselineScope = 'industry_baseline' | 'segment_baseline'

export type AlgorithmAssetColdStartAnonymizationPolicy =
  | 'k_anonymous_multi_company'
  | 'differential_privacy_aggregate'
  | 'none'

export type AlgorithmAssetColdStartSourceAggregation =
  | 'aggregate_summary_only'
  | 'contains_private_details'

export type AlgorithmAssetColdStartRuntimePublicationStatus =
  | 'candidate'
  | 'canary'
  | 'published'
  | 'runtime_rolled_back'

export type AlgorithmAssetColdStartBaseline = {
  baselineId: string
  baselineScope: AlgorithmAssetColdStartBaselineScope
  value: number
  applicableScenarioKeys: string[]
  disabledScenarioKeys?: string[]
  anonymizationPolicy: AlgorithmAssetColdStartAnonymizationPolicy
  contributingCompanyCount: number
  minCompanyCount: number
  contributingProjectCount: number
  minProjectCount: number
  singleCompanyShare: number
  maxSingleCompanyShare: number
  sourceAggregation: AlgorithmAssetColdStartSourceAggregation
  rollbackTarget?: string | null
  runtimePublicationKey?: string | null
  runtimePublicationStatus?: AlgorithmAssetColdStartRuntimePublicationStatus | null
  consumesCompanyOverrides?: boolean
  consumesProjectSampleDetails?: boolean
  consumesCandidateResults?: boolean
  consumesReplaySamples?: boolean
}

export type AlgorithmAssetColdStartBaselineUpdateInput = Pick<
  AlgorithmAssetColdStartBaseline,
  | 'baselineScope'
  | 'anonymizationPolicy'
  | 'contributingCompanyCount'
  | 'minCompanyCount'
  | 'contributingProjectCount'
  | 'minProjectCount'
  | 'singleCompanyShare'
  | 'maxSingleCompanyShare'
  | 'sourceAggregation'
  | 'rollbackTarget'
  | 'consumesCompanyOverrides'
  | 'consumesProjectSampleDetails'
  | 'consumesCandidateResults'
  | 'consumesReplaySamples'
>

export type AlgorithmAssetColdStartBaselineRejection = {
  baselineId: string
  reasons: string[]
}

export type AlgorithmAssetColdStartRuntimeDecisionStatus =
  | 'company_override'
  | 'shared_baseline_reference'
  | 'cold_start_review_required'

export type AlgorithmAssetColdStartRuntimeDecision = {
  status: AlgorithmAssetColdStartRuntimeDecisionStatus
  runtimeConsumable: boolean
  canWriteCompanyOverride: boolean
  canWriteSharedBaseline: boolean
  runtimeValue: number
  fallbackSystemSeedValue: number
  runtimeSources: string[]
  selectedBaselineId: string | null
  reasons: string[]
  rejectedBaselines: AlgorithmAssetColdStartBaselineRejection[]
}

export type AlgorithmAssetColdStartRuntimeInput = {
  companyId: string
  projectId?: string | null
  workCode: string
  scenarioKeys: string[]
  systemSeedValue: number
  companyOverrideValue?: number | null
  companyAcceptedSampleCount: number
  minCompanySamplesForOverride: number
  baselines: AlgorithmAssetColdStartBaseline[]
}

export type AlgorithmAssetColdStartBaselineUpdateDecision = {
  status: 'eligible' | 'rejected'
  updateAllowed: boolean
  reasons: string[]
}

export type AlgorithmAssetColdStartActualSampleHealth = 'accepted' | 'weak' | 'rejected'

export type AlgorithmAssetColdStartLiveLearningEvidenceInput = {
  runtimeDecision: AlgorithmAssetColdStartRuntimeDecision
  actualOutcomeRecorded: boolean
  actualSampleHealth: AlgorithmAssetColdStartActualSampleHealth
  companyAcceptedSampleCount: number
  minCompanySamplesForOverride: number
  projectAcceptedSampleCount: number
  minProjectSamplesForOverlay: number
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export type AlgorithmAssetColdStartLiveLearningEvidence = {
  assetClassificationRegistered: true
  predictionEventRecorded: true
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: string[]
  runtimeConsumerUsesPublishedArtifact: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export type AlgorithmAssetColdStartLiveLearningEvidenceDecision = {
  status: 'cold_start_live_learning_ready' | 'cold_start_live_learning_not_ready'
  liveLearningEvidence: AlgorithmAssetColdStartLiveLearningEvidence
  missingReasons: string[]
}

export type AlgorithmAssetColdStartProductionSampleScope = 'company' | 'project'

export interface AlgorithmAssetColdStartProductionLiveLearningEvidenceInput {
  runtimeDecision: AlgorithmAssetColdStartRuntimeDecision
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
  minCompanySamplesForOverride: number
  minProjectSamplesForOverlay: number
}

export interface AlgorithmAssetColdStartProductionLineage {
  acceptedSampleCounts: Record<AlgorithmAssetColdStartProductionSampleScope, number>
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
}

export type AlgorithmAssetColdStartProductionLiveLearningEvidenceDecision =
  AlgorithmAssetColdStartLiveLearningEvidenceDecision & {
    productionLineage: AlgorithmAssetColdStartProductionLineage
  }

const VALID_ANONYMIZATION_POLICIES = new Set<AlgorithmAssetColdStartAnonymizationPolicy>([
  'k_anonymous_multi_company',
  'differential_privacy_aggregate',
])

const COLD_START_BASELINE_ASSET_KEY = 'duration_cold_start_baseline'

function normalizeKeys(keys: string[] | undefined) {
  return [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))].sort()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readBoolean(row: Record<string, unknown>, key: string) {
  return row[key] === true
}

function hasFiniteNumber(row: Record<string, unknown>, key: string) {
  const parsed = Number(row[key])
  return Number.isFinite(parsed)
}

function coldStartAssetKeyFromSampleRow(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  return readText(row, 'asset_key', 'assetKey')
    || readText(metadata, 'liveLearningAssetKey', 'live_learning_asset_key', 'assetKey', 'asset_key')
}

function normalizeProductionSampleScope(value: unknown): AlgorithmAssetColdStartProductionSampleScope | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'company' || normalized === 'company_override') return 'company'
  if (normalized === 'project' || normalized === 'project_overlay') return 'project'
  return null
}

function coldStartSampleScopeFromRow(row: Record<string, unknown>) {
  const metadata = readRecord(row.metadata)
  return normalizeProductionSampleScope(
    row.learning_scope
      ?? row.learningScope
      ?? metadata.learningScope
      ?? metadata.learning_scope
      ?? metadata.liveLearningScope
      ?? metadata.live_learning_scope,
  )
}

function isAcceptedColdStartSampleRow(row: Record<string, unknown>) {
  return coldStartAssetKeyFromSampleRow(row) === COLD_START_BASELINE_ASSET_KEY
    && readText(row, 'sample_status', 'sampleStatus') === 'active'
    && readBoolean(row, 'included_in_benchmark')
    && hasFiniteNumber(row, 'actual_duration')
    && Boolean(readText(row, 'completed_at', 'completedAt'))
}

function countAcceptedColdStartSamplesByScope(
  rows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
): Record<AlgorithmAssetColdStartProductionSampleScope, number> {
  const counts: Record<AlgorithmAssetColdStartProductionSampleScope, number> = {
    company: 0,
    project: 0,
  }
  for (const source of rows ?? []) {
    if (source.sourceTable !== 'duration_experience_samples') continue
    if (!isAcceptedColdStartSampleRow(source.row)) continue
    const scope = coldStartSampleScopeFromRow(source.row)
    if (!scope) continue
    counts[scope] += 1
  }
  return counts
}

function coldStartEvidenceRefsFromProductionInput(
  input: Pick<AlgorithmAssetColdStartProductionLiveLearningEvidenceInput, 'sourceRows' | 'records'>,
) {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  return collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...(input.records ?? []),
    ],
  }).productionEvidence.find((evidence) => evidence.assetKey === COLD_START_BASELINE_ASSET_KEY)
}

function hasRollbackTarget(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function baseBaselineReasons(input: AlgorithmAssetColdStartBaselineUpdateInput) {
  const reasons: string[] = []

  if (!VALID_ANONYMIZATION_POLICIES.has(input.anonymizationPolicy)) {
    reasons.push('anonymized_multi_company_policy_required')
  }
  if (input.sourceAggregation !== 'aggregate_summary_only') {
    reasons.push('aggregate_summary_only_required')
  }
  if (input.contributingCompanyCount < input.minCompanyCount) {
    reasons.push('company_count_below_shared_baseline_threshold')
  }
  if (input.contributingCompanyCount <= 1) {
    reasons.push('shared_baseline_requires_multi_company_aggregation')
    reasons.push('single_company_samples_cannot_update_shared_baseline')
  }
  if (input.contributingProjectCount < input.minProjectCount) {
    reasons.push('project_count_below_shared_baseline_threshold')
  }
  if (input.singleCompanyShare > input.maxSingleCompanyShare) {
    reasons.push('single_company_share_exceeds_cap')
  }
  if (!hasRollbackTarget(input.rollbackTarget)) {
    reasons.push('rollback_target_required')
  }
  if (input.consumesCompanyOverrides) reasons.push('company_override_read_forbidden')
  if (input.consumesProjectSampleDetails) reasons.push('project_sample_detail_read_forbidden')
  if (input.consumesCandidateResults) reasons.push('candidate_result_read_forbidden')
  if (input.consumesReplaySamples) reasons.push('replay_sample_detail_read_forbidden')

  return reasons
}

function scenarioReasons(baseline: AlgorithmAssetColdStartBaseline, scenarioKeys: string[]) {
  const reasons: string[] = []
  const applicableScenarioKeys = normalizeKeys(baseline.applicableScenarioKeys)
  const disabledScenarioKeys = new Set(normalizeKeys(baseline.disabledScenarioKeys))

  if (scenarioKeys.some((key) => disabledScenarioKeys.has(key))) {
    reasons.push('scenario_disabled_for_shared_baseline')
  }
  if (
    scenarioKeys.length > 0
    && applicableScenarioKeys.length > 0
    && !scenarioKeys.every((key) => applicableScenarioKeys.includes(key))
  ) {
    reasons.push('segment_applicability_mismatch')
  }

  return reasons
}

function baselineRejectionReasons(baseline: AlgorithmAssetColdStartBaseline, scenarioKeys: string[]) {
  return [
    ...baseBaselineReasons(baseline),
    ...(baseline.runtimePublicationStatus === 'runtime_rolled_back'
      ? ['runtime_rolled_back_shared_baseline_not_consumable']
      : []),
    ...scenarioReasons(baseline, scenarioKeys),
  ]
}

function baselineRank(baseline: AlgorithmAssetColdStartBaseline) {
  return baseline.baselineScope === 'segment_baseline' ? 0 : 1
}

export function evaluateAlgorithmAssetColdStartBaselineUpdate(
  input: AlgorithmAssetColdStartBaselineUpdateInput,
): AlgorithmAssetColdStartBaselineUpdateDecision {
  const reasons = baseBaselineReasons(input)
  return {
    status: reasons.length > 0 ? 'rejected' : 'eligible',
    updateAllowed: reasons.length === 0,
    reasons,
  }
}

export function decideAlgorithmAssetColdStartRuntime(
  input: AlgorithmAssetColdStartRuntimeInput,
): AlgorithmAssetColdStartRuntimeDecision {
  const reasons: string[] = []
  const scenarioKeys = normalizeKeys(input.scenarioKeys)
  const canUseCompanyOverride = input.companyAcceptedSampleCount >= input.minCompanySamplesForOverride
    && typeof input.companyOverrideValue === 'number'
    && Number.isFinite(input.companyOverrideValue)

  if (canUseCompanyOverride) {
    return {
      status: 'company_override',
      runtimeConsumable: true,
      canWriteCompanyOverride: false,
      canWriteSharedBaseline: false,
      runtimeValue: input.companyOverrideValue as number,
      fallbackSystemSeedValue: input.systemSeedValue,
      runtimeSources: ['company_override'],
      selectedBaselineId: null,
      reasons: ['company_override_has_sufficient_local_samples'],
      rejectedBaselines: [],
    }
  }

  if (input.companyAcceptedSampleCount < input.minCompanySamplesForOverride) {
    reasons.push('company_sample_count_below_override_threshold')
  } else {
    reasons.push('company_override_value_required')
  }

  const rejectedBaselines: AlgorithmAssetColdStartBaselineRejection[] = []
  const eligibleBaselines = input.baselines
    .filter((baseline) => {
      const baselineReasons = baselineRejectionReasons(baseline, scenarioKeys)
      if (baselineReasons.length > 0) {
        rejectedBaselines.push({ baselineId: baseline.baselineId, reasons: baselineReasons })
        return false
      }
      return true
    })
    .sort((a, b) => baselineRank(a) - baselineRank(b) || a.baselineId.localeCompare(b.baselineId))

  const selectedBaseline = eligibleBaselines[0]
  if (selectedBaseline) {
    return {
      status: 'shared_baseline_reference',
      runtimeConsumable: true,
      canWriteCompanyOverride: false,
      canWriteSharedBaseline: false,
      runtimeValue: selectedBaseline.value,
      fallbackSystemSeedValue: input.systemSeedValue,
      runtimeSources: ['system_seed', selectedBaseline.baselineScope],
      selectedBaselineId: selectedBaseline.baselineId,
      reasons: [...reasons, 'shared_baseline_reference_only_no_company_override_write'],
      rejectedBaselines,
    }
  }

  return {
    status: 'cold_start_review_required',
    runtimeConsumable: false,
    canWriteCompanyOverride: false,
    canWriteSharedBaseline: false,
    runtimeValue: input.systemSeedValue,
    fallbackSystemSeedValue: input.systemSeedValue,
    runtimeSources: ['system_seed'],
    selectedBaselineId: null,
    reasons: [...reasons, 'eligible_anonymized_shared_baseline_required'],
    rejectedBaselines,
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

export function evaluateAlgorithmAssetColdStartLiveLearningEvidence(
  input: AlgorithmAssetColdStartLiveLearningEvidenceInput,
): AlgorithmAssetColdStartLiveLearningEvidenceDecision {
  const missingReasons: string[] = []
  const acceptedOutcome = input.actualOutcomeRecorded && input.actualSampleHealth === 'accepted'
  const companyScopeReady = input.companyAcceptedSampleCount >= input.minCompanySamplesForOverride
  const projectScopeReady = input.projectAcceptedSampleCount >= input.minProjectSamplesForOverlay
  const runtimeSourceScopes = input.runtimeDecision.runtimeSources.flatMap((source) => {
    if (source === 'system_seed') return ['system']
    if (source === 'industry_baseline' || source === 'segment_baseline') return [source]
    if (source === 'company_override') return ['company']
    return []
  })
  const enabledLearningScopes = uniqueValues([
    ...runtimeSourceScopes,
    companyScopeReady ? 'company' : '',
    projectScopeReady ? 'project' : '',
  ])
  const runtimeConsumerUsesPublishedArtifact = input.runtimeDecision.runtimeConsumable
    && (
      input.runtimeDecision.status === 'shared_baseline_reference'
      || input.runtimeDecision.status === 'company_override'
    )

  if (!acceptedOutcome) missingReasons.push('accepted_actual_outcome_required')
  if (!runtimeConsumerUsesPublishedArtifact) {
    missingReasons.push('shared_baseline_or_company_override_runtime_required')
  }
  if (!companyScopeReady) missingReasons.push('company_scope_samples_required_for_shrinkage')
  if (!projectScopeReady) missingReasons.push('project_scope_samples_required_for_overlay')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!input.rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!input.accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  const tieredLearningPolicyRegistered = enabledLearningScopes.includes('system')
    && enabledLearningScopes.some((scope) => scope === 'industry_baseline' || scope === 'segment_baseline')
    && enabledLearningScopes.includes('company')
    && enabledLearningScopes.includes('project')
  if (!tieredLearningPolicyRegistered) {
    if (!enabledLearningScopes.includes('system')) missingReasons.push('system_seed_scope_required')
    if (!enabledLearningScopes.some((scope) => scope === 'industry_baseline' || scope === 'segment_baseline')) {
      missingReasons.push('industry_or_segment_baseline_scope_required')
    }
  }

  const liveLearningEvidence: AlgorithmAssetColdStartLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: acceptedOutcome,
    tieredLearningPolicyRegistered,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  }

  return {
    status: missingReasons.length === 0
      ? 'cold_start_live_learning_ready'
      : 'cold_start_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons: uniqueValues(missingReasons),
  }
}

export function buildAlgorithmAssetColdStartLiveLearningEvidenceFromProductionRows(
  input: AlgorithmAssetColdStartProductionLiveLearningEvidenceInput,
): AlgorithmAssetColdStartProductionLiveLearningEvidenceDecision {
  const acceptedSampleCounts = countAcceptedColdStartSamplesByScope(input.sourceRows)
  const evidenceRefs = coldStartEvidenceRefsFromProductionInput(input) ?? {
    assetKey: COLD_START_BASELINE_ASSET_KEY,
  }
  const hasAcceptedOutcome = acceptedSampleCounts.company + acceptedSampleCounts.project > 0
  const hasRuntimeConsumerObservation = Boolean(evidenceRefs.runtimeConsumerObservationRef)
  const decision = evaluateAlgorithmAssetColdStartLiveLearningEvidence({
    runtimeDecision: input.runtimeDecision,
    actualOutcomeRecorded: hasAcceptedOutcome,
    actualSampleHealth: hasAcceptedOutcome ? 'accepted' : 'rejected',
    companyAcceptedSampleCount: acceptedSampleCounts.company,
    minCompanySamplesForOverride: input.minCompanySamplesForOverride,
    projectAcceptedSampleCount: acceptedSampleCounts.project,
    minProjectSamplesForOverlay: input.minProjectSamplesForOverlay,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })
  const missingReasons = hasRuntimeConsumerObservation
    ? decision.missingReasons
    : uniqueValues([...decision.missingReasons, 'runtime_consumer_observation_required'])
  const liveLearningEvidence = {
    ...decision.liveLearningEvidence,
    runtimeConsumerUsesPublishedArtifact: decision.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact
      && hasRuntimeConsumerObservation,
  }

  return {
    ...decision,
    status: missingReasons.length === 0
      ? 'cold_start_live_learning_ready'
      : 'cold_start_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons,
    productionLineage: {
      acceptedSampleCounts,
      evidenceRefs,
    },
  }
}
