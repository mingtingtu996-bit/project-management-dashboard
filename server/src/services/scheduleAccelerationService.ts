import { logger } from '../middleware/logger.js'
import {
  buildProjectGenerationFactsSnapshot,
  readProjectGenerationFactsSnapshot,
} from './projectGenerationFactsSnapshotService.js'
import {
  getProjectCriticalPathSnapshot,
  type CriticalPathSnapshot,
} from './projectCriticalPathService.js'
import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
} from './algorithmFactContextService.js'
import {
  getDurationOutputContract,
  type DurationOutputCode,
} from './durationOutputGovernanceService.js'
import {
  recordScheduleAccelerationConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import { delayDayDelta, inclusiveDurationDays, normalizeDurationDateUtc, signedDurationDayDelta } from '../utils/durationDays.js'
import {
  addConstructionProductionDays,
  isConstructionProductionDay,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import type {
  ConstructionOrganizationScenarioSelection,
  ConstructionOrganizationScenarioSelectorInput,
} from './constructionOrganizationScenarioSelector.js'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  ensureConstructionOrganizationDecisionReportProductCloseoutReadiness,
  selectConstructionOrganizationScenario,
} from './constructionOrganizationScenarioSelector.js'
import {
  buildT2RhythmProductionCapacityCoverage,
} from './t2RhythmProductionCapacityEvidenceService.js'
import {
  SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE_FROM_RESOLVER as SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE,
  SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP_FROM_RESOLVER as SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP,
  SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP_FROM_RESOLVER as SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP,
  SCHEDULE_ACCELERATION_PROFILE_SOURCE_FROM_RESOLVER as SCHEDULE_ACCELERATION_PROFILE_SOURCE,
  getScheduleAccelerationHardConstraintTypesFromResolver,
  getScheduleAccelerationProfileSeedFromResolver,
  getScheduleAccelerationResourceCrashCapSeedFromResolver,
  getScheduleAccelerationSeasonalFactorSeedFromResolver,
  resolveDurationContributionModeFromResolver as normalizeDurationContributionMode,
} from './algorithmSeedResolver.js'
import {
  buildCalendarDayDurationMetric,
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  type DurationMetricDto,
} from './durationMetricService.js'

export { SCHEDULE_ACCELERATION_PROFILE_SOURCE_FROM_RESOLVER as SCHEDULE_ACCELERATION_PROFILE_SOURCE } from './algorithmSeedResolver.js'
export {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
} from './algorithmFactContextService.js'
export type {
  AlgorithmFactContext,
  AlgorithmFactContextPhase,
  RuntimeExecutionEvidenceObject,
  RuntimeExecutionFacts,
  RuntimeExecutionInferenceSummary,
} from './algorithmFactContextService.js'

export type ScheduleAccelerationMode = 'compare_only' | 'compression_preview' | 'reverse_cpm'
export type ScheduleAccelerationDependencyType = 'FS' | 'SS' | 'FF' | 'SF'
export type ScheduleAccelerationRowProjectionMode =
  | 'schedule_row'
  | 'gate_marker'
  | 'inline_control'
  | 'linked_projection'

export type ScheduleAccelerationDependency = {
  clientRowId: string
  dependencyType: ScheduleAccelerationDependencyType
  lagDays: number
  relationRole?: string | null
  source?: string | null
}

export type ScheduleAccelerationRow = {
  clientRowId: string
  values: Record<string, unknown>
  predecessorDependencies: ScheduleAccelerationDependency[]
  rowProjectionMode?: ScheduleAccelerationRowProjectionMode | null
  executionPhase?: string | null
  executionLane?: string | null
  durationSuggestion?: unknown
}

export type ScheduleAccelerationContext = {
  scenario?: ScheduleAccelerationScenario
  projectGenerationFacts?: Record<string, unknown> | null
  projectTypeCodes?: string[]
  methodVariantCodes?: string[]
  climateSignals?: string[]
  weatherImpactBands?: string[]
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  constructionCalendar?: ConstructionCalendarContext | null
  workCalendar?: ConstructionCalendarContext | null
  asOfDate?: string | null
  runtime?: ScheduleRuntimeRecoveryContext
}

export type ScheduleAccelerationScenario = 'baseline_target_alignment' | 'runtime_delay_recovery'

export type ScheduleRuntimeRecoveryContext = {
  progressCompletionRatio?: number | null
  inProgressTaskCount?: number | null
  blockedTaskCount?: number | null
  hardBlockerCount?: number | null
  resourcePressureScore?: number | null
  parallelDensityRatio?: number | null
  milestonePressureScore?: number | null
  forecastDelayDays?: number | null
  baselineDeviationDays?: number | null
  accelerationRecommendationAdopted?: boolean | null
  projectRemainingForecastFinishDate?: string | null
  criticalOrNearCriticalTaskCount?: number | null
  floatingTaskCount?: number | null
  scheduleState?: string | null
  localAccelerationFactor?: number | null
  t2RhythmScheduleEvidence?: Record<string, unknown> | null
  evidenceCodes?: string[]
  evidenceObjects?: import('./algorithmFactContextService.js').RuntimeExecutionEvidenceObject[]
  runtimeInferenceSummary?: import('./algorithmFactContextService.js').RuntimeExecutionInferenceSummary
}

export interface ScheduleAccelerationRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

export interface RecordScheduleAccelerationRuntimeConsumptionInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
  observedAt?: string
}

const SCHEDULE_ACCELERATION_CONSUMER_ASSET_KEYS = new Set([
  'dependency_rule_candidate',
])
const SCHEDULE_ACCELERATION_PROFILE_SEED = getScheduleAccelerationProfileSeedFromResolver()
const SCHEDULE_ACCELERATION_SEASONAL_FACTOR_SEED = getScheduleAccelerationSeasonalFactorSeedFromResolver()
const SCHEDULE_ACCELERATION_RESOURCE_CRASH_CAP_SEED = getScheduleAccelerationResourceCrashCapSeedFromResolver()

export type ScheduleTargetFeasibility = {
  mode: ScheduleAccelerationMode
  scenario: ScheduleAccelerationScenario
  targetEndDate: string
  naturalEndDate: string
  /** @deprecated Use overshoot. */
  overshootDays: number
  overshoot: DurationMetricDto
  /** @deprecated Use recoverable. */
  recoverableDays: number
  recoverable: DurationMetricDto
  /** @deprecated Use unrecoverable. */
  unrecoverableDays: number
  unrecoverable: DurationMetricDto
  verdict: 'fit' | 'tight' | 'compressible' | 'requires_scope_change' | 'infeasible'
  strategies: Array<{
    type: 'fast_track' | 'crashing' | 'scope_reduction'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
  }>
  accelerationProposal?: ScheduleAccelerationProposal
  durationOutputCode?: DurationOutputCode
  durationOutputSemanticFieldName?: string | null
  durationOutputContract?: Record<string, unknown> | null
  accelerationTargetDays?: number | null
  recoverableDaysConfidenceBand?: ScheduleAccelerationConfidenceBand
}

export type ScheduleAccelerationConfidenceBand = {
  optimisticDays: number
  expectedDays: number
  conservativeDays: number
  basis: 'schedule_acceleration_uncertainty_band' | 'schedule_acceleration_target_uncertainty_band'
  networkFallbackPolicy?: ScheduleAccelerationNetworkFallbackPolicy | null
}

type ScheduleAccelerationNetworkFallbackPolicy =
  | 'network_terminal_delta'
  | 'projected_terminal_delta'
  | 'conservative_discounted_raw_recovery'

export type ScheduleAccelerationProposal = {
  mode: 'preview_only'
  source: 'target_end_compression'
  targetEndDate: string
  naturalEndDate: string
  /** @deprecated Use overshoot. */
  overshootDays: number
  overshoot?: DurationMetricDto
  /** @deprecated Use totalRecover. */
  totalRecoverDays: number
  totalRecover?: DurationMetricDto
  /** @deprecated Use remainingGap. */
  remainingGapDays: number
  remainingGap?: DurationMetricDto
  verdict: 'draft_recoverable' | 'needs_scope_decision' | 'infeasible'
  durationOutputCode?: DurationOutputCode
  durationOutputSemanticFieldName?: string | null
  durationOutputContract?: Record<string, unknown> | null
  accelerationTargetDays?: number | null
  recoverableDaysConfidenceBand?: ScheduleAccelerationConfidenceBand
  accelerationTargetConfidenceBand?: ScheduleAccelerationConfidenceBand
  commitmentDisclaimer?: string
  actions: ScheduleAccelerationProposalAction[]
  rescheduleDraft?: ScheduleAccelerationRescheduleDraft
  protectedConstraints: Array<{
    clientRowId: string
    title: string
    reasonCode: string
    durationDays: number
    duration?: DurationMetricDto
  }>
  calculationBasis?: {
    scenario?: ScheduleAccelerationScenario
    algorithmFactContext?: ReturnType<typeof summarizeAlgorithmFactContext>
    naturalDurationDays: number
    naturalDuration?: DurationMetricDto
    totalRecoverCapRatio: number
    seasonalFactor: number
    projectTypeProfile: string
    criticalCandidateDays: number
    resourceGroupedCandidateDays: number
    hardConstraintDays: number
    hardConstraintDuration?: DurationMetricDto
    constructionOrganizationScenario?: {
      source: ConstructionOrganizationScenarioSelection['source']
      sourceVersion?: string
      recommendedScenarioIds: string[]
      confidence?: string
      resourcePolicy?: string
      boundaryPolicy?: ConstructionOrganizationScenarioSelection['boundaryPolicy']
      recommendedPlanOption?: Record<string, unknown> | null
      planOptions?: Array<Record<string, unknown>>
      planOptionComparisonPackage?: Record<string, unknown> | null
      scenarioRecommendations?: Record<string, unknown> | null
      planNetworkDraftRecommendations?: Record<string, unknown> | null
    } | null
    constructionOrganizationRecoveryFactor?: number
    fastTrackBudgetDays?: number
    fastTrackBudgetRatio?: number
    policySource?: typeof SCHEDULE_ACCELERATION_PROFILE_SOURCE
    runtimeContext?: {
      factLayer?: 'runtimeExecutionFacts'
      staticFactsRole?: 'background'
      progressCompletionRatio?: number | null
      resourcePressureScore?: number | null
      parallelDensityRatio?: number | null
      milestonePressureScore?: number | null
      forecastDelayDays?: number | null
      baselineDeviationDays?: number | null
      blockedTaskCount?: number | null
      hardBlockerCount?: number | null
      criticalOrNearCriticalTaskCount?: number | null
      floatingTaskCount?: number | null
      scheduleState?: string | null
      localAccelerationFactor?: number | null
      evidenceCodes?: string[]
      evidenceObjects?: import('./algorithmFactContextService.js').RuntimeExecutionEvidenceObject[]
      runtimeInferenceSummary?: import('./algorithmFactContextService.js').RuntimeExecutionInferenceSummary
      t2RhythmScheduleEvidence?: Record<string, unknown> | null
      networkSlackRecoveryFactor?: number
      recoveryBudgetFactor?: number
    }
    t2RhythmScheduleEvidence?: {
      source: 'schedule_acceleration_e5_readonly_context'
      evidenceRowCount: number
      selectedTemplateIds: string[]
      canEnterC1913Phase1Selection: boolean
      requiresManualReview: boolean
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      runtimeProjectRemainingEvidence?: Record<string, unknown>
      rowEvidence: Array<Record<string, unknown>>
      conflictCodes?: string[]
      productionCapacityCoverage?: Record<string, unknown>
      phase1Selection?: Record<string, unknown>
      readinessSummary?: {
        source: 'schedule_acceleration_t2_readiness_summary'
        phase1SelectionStatus: string | null
        productionCapacityCoverageStatus: string | null
        assemblyGateStatus: string | null
        standardLibraryTrustGateStatus: string | null
        standardLibraryTrustBoundary: string | null
        standardLibraryTrustBlockingReasons: string[]
        selectionReceiptCount: number | null
        selectorReceiptAuditStatus: string | null
        selectedCandidateId: string | null
        canEnterC1913Phase1Selection: boolean
        requiresManualReview: boolean
        conflictCodes: string[]
        blockingReasons: string[]
      }
    }
    networkFallbackPolicy?: ScheduleAccelerationNetworkFallbackPolicy
  }
}

export type ScheduleAccelerationRescheduleDraft = {
  mode: 'proposal_review'
  source: 'target_end_compression'
  writePolicy: 'requires_user_acceptance'
  taskDateAdjustments: Array<{
    clientRowId: string
    title: string
    currentStartDate: string | null
    currentEndDate: string | null
    proposedStartDate: string | null
    proposedEndDate: string | null
    currentDurationDays: number
    currentDuration?: DurationMetricDto
    proposedDurationDays: number
    proposedDuration?: DurationMetricDto
    recoverDays: number
    recoverDuration?: DurationMetricDto
    reschedulePolicy: 'resource_crash_preview' | 'dependency_propagation_preview'
    changedFields: string[]
    visualDiff: {
      durationDeltaDays: number
      startDeltaDays: number
      endDeltaDays: number
      barDeltaKind: 'compressed' | 'shifted' | 'unchanged'
    }
  }>
  dependencyAdjustments: Extract<ScheduleAccelerationProposalAction, { type: 'fast_track' }>['dependencyAdjustments']
  resourceAdjustments: Extract<ScheduleAccelerationProposalAction, { type: 'crashing' }>['durationAdjustments']
  operations: Array<{
    type: 'update'
    clientRowId: string
    values: Record<string, unknown>
  }>
}

export type ScheduleAccelerationProposalAction =
  | {
    type: 'fast_track'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto
    rawRecoverDays: number
    reworkRiskDiscountDays: number
    effectiveRecoverDays: number
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
    dependencyAdjustments: Array<{
      predecessorClientRowId: string
      successorClientRowId: string
      fromDependencyType: ScheduleAccelerationDependencyType
      toDependencyType: 'SS'
      lagDaysBefore: number
      lagDaysAfter: number
      effectiveLagDaysAfter: number
      rawRecoverDays: number
      effectiveRecoverDays: number
      reworkRiskDiscountDays: number
    }>
  }
  | {
    type: 'crashing'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
    durationAdjustments: Array<{
      clientRowId: string
      currentDurationDays: number
      currentDuration?: DurationMetricDto
      proposedDurationDays: number
      proposedDuration?: DurationMetricDto
      minDurationDays: number
      minDuration?: DurationMetricDto
      recoverDays: number
      recoverDuration?: DurationMetricDto
      basis: 'p50_to_p20' | 'resource_crash_preview'
    }>
    networkSlackFacts?: {
      source: 'schedule_acceleration_network_projection'
      criticalOrNearCriticalTaskCount: number
      floatingTaskCount: number
      rawCandidateRecoverDays: number
      selectedNetworkRecoverDays: number
      effectiveRecoverDays: number
      networkLimited: boolean
    }
  }
  | {
    type: 'scope_reduction'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto
    riskLevel: 'high'
    explanation: string
    decisionOptions: string[]
  }

type TargetAccelerationProfile = {
  profileCode: string
  fastTrackRatio: number
  fastTrackBudgetRatio: number
  maxFastTrackDays: number
  crashRatio: number
  totalRecoverCapRatio: number
  seasonalFactor: number
}

type RuntimeRecoveryAdjustment = {
  factor: number
  summary: ScheduleAccelerationProposal['calculationBasis']['runtimeContext']
}

type TargetAccelerationBudget = {
  recoverableDays: number
  naturalDurationDays: number
  constructionCalendar?: ConstructionCalendarContext | null
  algorithmFactContext?: ReturnType<typeof summarizeAlgorithmFactContext>
  totalRecoverCapRatio: number
  seasonalFactor: number
  projectTypeProfile: string
  fastTrackRatio: number
  fastTrackBudgetDays: number
  fastTrackBudgetRatio: number
  maxFastTrackDays: number
  crashRatio: number
  criticalCandidateDays: number
  resourceGroupedCandidateDays: number
  hardConstraintDays: number
  runtimeAdjustment?: RuntimeRecoveryAdjustment
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  constructionOrganizationRecoveryFactor: number
  t2RhythmScheduleEvidence?: NonNullable<ScheduleAccelerationProposal['calculationBasis']>['t2RhythmScheduleEvidence']
}

const HARD_CONSTRAINT_TYPES = new Set<string>(getScheduleAccelerationHardConstraintTypesFromResolver())

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildScheduleAccelerationConsumedArtifacts(input: {
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  return input.runtimeArtifactPublications
    .filter((publication) => SCHEDULE_ACCELERATION_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        runtimeConsumer: 'scheduleAccelerationService',
      },
    }))
}

export function recordScheduleAccelerationRuntimeConsumption(
  input: RecordScheduleAccelerationRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const projectId = normalizeText(input.projectId)
  return recordScheduleAccelerationConsumedArtifacts({
    queryExec: input.queryExec,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      runtimeConsumer: 'scheduleAccelerationService',
    },
    sourceEvidenceRefs: [
      ['schedule_acceleration', projectId || 'no_project'].join(':'),
    ],
    artifacts: buildScheduleAccelerationConsumedArtifacts({
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
    }),
  })
}

function buildDurationOutputContractSummary(code: DurationOutputCode) {
  const contract = getDurationOutputContract(code)
  if (!contract) return null
  return {
    code: contract.code,
    semanticFieldName: contract.semanticFieldName,
    ownerService: contract.ownerService,
    algorithmFactContextPhase: contract.algorithmFactContextPhase,
    allowedWriteTargets: contract.allowedWriteTargets,
    boundaryPolicy: contract.boundaryPolicy,
  }
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  const parsed = parseMaybeJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

function isNonEmptyRecord(value: Record<string, unknown>) {
  return Object.keys(value).length > 0
}

function readGovernedDurationSuggestionDays(suggestion: Record<string, unknown>) {
  const outputCode = normalizeText(suggestion.durationOutputCode)
  const value = outputCode === 'contextual_reference'
    ? suggestion.contextualReferenceDays
    : outputCode === 'plan_reference'
      ? suggestion.planReferenceDays
      : outputCode === 'remaining_forecast'
        ? suggestion.remainingForecastDays
        : null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readGovernedDurationCrashFloorDays(suggestion: Record<string, unknown>) {
  const candidates = [
    suggestion.conservativeDurationDays,
    suggestion.conservativeReferenceDays,
    suggestion.p80DurationDays,
    suggestion.p80ReferenceDays,
    suggestion.contextualReferenceP80Days,
    suggestion.planReferenceP80Days,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  return candidates.length > 0 ? Math.ceil(Math.max(...candidates)) : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(parseMaybeJson(value)) ? parseMaybeJson(value) as unknown[] : []
}

function uniqueStringArray(values: string[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}

function readCodeArray(value: unknown): string[] {
  return uniqueStringArray(readArray(value)
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean))
}

function uniqueUnknownStrings(values: unknown[]) {
  return uniqueStringArray(values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeText(value))
    .filter(Boolean))
}

function firstNonEmptyRecord(records: Array<Record<string, unknown>>) {
  return records.find(isNonEmptyRecord) ?? {}
}

function readProductionCapacityCoverage(value: Record<string, unknown>) {
  const direct = readRecord(value.productionCapacityCoverage ?? value.production_capacity_coverage)
  if (isNonEmptyRecord(direct)) return direct
  const scheduleTrustEvidence = readRecord(value.scheduleTrustEvidence ?? value.schedule_trust_evidence)
  return readRecord(scheduleTrustEvidence.productionCapacityCoverage ?? scheduleTrustEvidence.production_capacity_coverage)
}

function readProductionCapacityEvidence(value: Record<string, unknown>) {
  return readRecord(
    value.t2RhythmProductionCapacityEvidence
      ?? value.t2_rhythm_production_capacity_evidence
      ?? value.productionCapacityEvidence
      ?? value.production_capacity_evidence,
  )
}

function deriveProductionCapacityCoverageFromEvidence(
  candidatePackage: Record<string, unknown>,
  productionCapacityEvidence: Record<string, unknown>,
) {
  if (!isNonEmptyRecord(candidatePackage) || !isNonEmptyRecord(productionCapacityEvidence)) return {}
  if (normalizeId(candidatePackage.source) !== 't2_division_rhythm_schedule_candidate_package') return {}
  if (normalizeId(productionCapacityEvidence.source) !== 't2_rhythm_production_capacity_evidence') return {}

  return buildT2RhythmProductionCapacityCoverage({
    candidatePackage: candidatePackage as Parameters<typeof buildT2RhythmProductionCapacityCoverage>[0]['candidatePackage'],
    productionCapacityEvidence: productionCapacityEvidence as Parameters<typeof buildT2RhythmProductionCapacityCoverage>[0]['productionCapacityEvidence'],
  }) as unknown as Record<string, unknown>
}

function readPhase1Selection(value: Record<string, unknown>) {
  return readRecord(
    value.phase1Selection
      ?? value.phase1_selection
      ?? value.t2RhythmSchedulePhase1Selection
      ?? value.t2_rhythm_schedule_phase1_selection,
  )
}

function collectPhase1SelectionConflictCodes(selection: Record<string, unknown>) {
  return readArray(selection.rejectedCandidates ?? selection.rejected_candidates)
    .flatMap((candidate) => readRecord(candidate).conflictCodes ?? readRecord(candidate).conflict_codes)
}

function collectPhase1SelectionReasonCodes(selection: Record<string, unknown>) {
  return readArray(selection.rejectedCandidates ?? selection.rejected_candidates)
    .flatMap((candidate) => readRecord(candidate).reasonCodes ?? readRecord(candidate).reason_codes)
}

function collectProductionCapacityCoverageConflictCodes(coverage: Record<string, unknown>) {
  const status = normalizeId(coverage.status)
  if (status === 'evidence_incomplete') return ['production_capacity_evidence_missing']
  if (status === 'capacity_gap') return ['production_capacity_gap']
  return []
}

function readSelectionReceiptCount(value: Record<string, unknown>): number | null {
  const direct = Number(value.selectionReceiptCount ?? value.selection_receipt_count)
  if (Number.isFinite(direct) && direct >= 0) return direct
  const scheduleTrustEvidence = readRecord(value.scheduleTrustEvidence ?? value.schedule_trust_evidence)
  const fromTrustEvidence = Number(scheduleTrustEvidence.selectionReceiptCount ?? scheduleTrustEvidence.selection_receipt_count)
  if (Number.isFinite(fromTrustEvidence) && fromTrustEvidence >= 0) return fromTrustEvidence
  return null
}

function readSelectorReceiptAuditStatus(value: Record<string, unknown>): string | null {
  const direct = normalizeId(value.selectorReceiptAuditStatus ?? value.selector_receipt_audit_status)
  if (direct) return direct
  const scheduleTrustEvidence = readRecord(value.scheduleTrustEvidence ?? value.schedule_trust_evidence)
  return normalizeId(scheduleTrustEvidence.selectorReceiptAuditStatus ?? scheduleTrustEvidence.selector_receipt_audit_status)
}

function collectSelectorReceiptEvidence(value: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [
    value,
    readRecord(value.t2RhythmScheduleEvidence ?? value.t2_rhythm_schedule_evidence),
    readRecord(value.t2RhythmScheduleCandidatePackage ?? value.t2_rhythm_schedule_candidate_package),
    readRecord(value.t2RhythmScheduleCandidateNetwork ?? value.t2_rhythm_schedule_candidate_network),
    readRecord(value.t2RhythmScheduleCandidateNetworkEvaluation ?? value.t2_rhythm_schedule_candidate_network_evaluation),
  ]
  const assemblyInputChannels = readRecord(readRecord(value.durationInputAssembly ?? value.duration_input_assembly).inputChannels)
  candidates.push(
    readRecord(assemblyInputChannels.t2RhythmScheduleCandidatePackage),
    readRecord(assemblyInputChannels.t2RhythmScheduleCandidateNetwork),
    readRecord(assemblyInputChannels.t2RhythmScheduleCandidateNetworkEvaluation),
  )

  const statuses = candidates
    .map(readSelectorReceiptAuditStatus)
    .filter((status): status is string => Boolean(status))
  const counts = candidates
    .map(readSelectionReceiptCount)
    .filter((count): count is number => count != null)
  return {
    selectionReceiptCount: counts.length > 0 ? Math.max(...counts) : null,
    selectorReceiptAuditStatus: statuses.includes('missing')
      ? 'missing'
      : statuses.includes('ready') ? 'ready' : null,
  }
}

function readStandardLibraryTrustGateStatus(value: Record<string, unknown>): string | null {
  const direct = normalizeId(value.standardLibraryTrustGateStatus ?? value.standard_library_trust_gate_status)
  if (direct) return direct
  const trustGate = readRecord(
    value.t2RhythmStandardLibraryTrustGate
      ?? value.t2_rhythm_standard_library_trust_gate
      ?? value.t2_rhythm_standard_library_live_replay_trust_gate,
  )
  const trustGateStatus = normalizeId(trustGate.status)
  if (trustGateStatus) return trustGateStatus
  const channelStatus = normalizeId(value.status)
  const canTrust = value.canTrustForRealScheduleCalibration ?? value.can_trust_for_real_schedule_calibration
  if (channelStatus === 'candidate_conflict' && canTrust === false) return 'not_trustworthy_for_real_schedule'
  if (channelStatus === 'ready' && canTrust === true) return 'shadow_replay_ready_not_publishable'
  return null
}

function readStandardLibraryTrustBoundary(value: Record<string, unknown>): string | null {
  const direct = normalizeId(value.standardLibraryTrustBoundary ?? value.standard_library_trust_boundary)
  if (direct) return direct
  const trustGate = readRecord(
    value.t2RhythmStandardLibraryTrustGate
      ?? value.t2_rhythm_standard_library_trust_gate
      ?? value.t2_rhythm_standard_library_live_replay_trust_gate,
  )
  const trustGateBoundary = normalizeId(trustGate.trustBoundary ?? trustGate.trust_boundary)
  if (trustGateBoundary) return trustGateBoundary
  return normalizeId(value.trustBoundary ?? value.trust_boundary) || null
}

function readStandardLibraryTrustBlockingReasons(value: Record<string, unknown>) {
  const trustGate = readRecord(
    value.t2RhythmStandardLibraryTrustGate
      ?? value.t2_rhythm_standard_library_trust_gate
      ?? value.t2_rhythm_standard_library_live_replay_trust_gate,
  )
  return uniqueUnknownStrings([
    readArray(value.standardLibraryTrustBlockingReasons ?? value.standard_library_trust_blocking_reasons),
    readArray(trustGate.blockingReasons ?? trustGate.blocking_reasons),
  ])
}

function collectStandardLibraryTrustGateEvidence(value: Record<string, unknown>) {
  const durationInputAssembly = readRecord(value.durationInputAssembly ?? value.duration_input_assembly)
  const assemblyGate = readRecord(value.assemblyGate ?? value.assembly_gate)
  const durationAssemblyGate = readRecord(durationInputAssembly.assemblyGate ?? durationInputAssembly.assembly_gate)
  const inputChannels = readRecord(durationInputAssembly.inputChannels ?? durationInputAssembly.input_channels)
  const trustGateChannel = readRecord(
    inputChannels.t2RhythmStandardLibraryTrustGate
      ?? inputChannels.t2_rhythm_standard_library_trust_gate,
  )
  const candidates = [
    value,
    assemblyGate,
    durationAssemblyGate,
    trustGateChannel,
  ].filter(isNonEmptyRecord)
  const statuses = candidates
    .map(readStandardLibraryTrustGateStatus)
    .filter((status): status is string => Boolean(status))
  const boundaries = candidates
    .map(readStandardLibraryTrustBoundary)
    .filter((boundary): boundary is string => Boolean(boundary))
  return {
    standardLibraryTrustGateStatus: statuses.includes('not_trustworthy_for_real_schedule')
      ? 'not_trustworthy_for_real_schedule'
      : statuses.includes('missing')
        ? 'missing'
        : statuses.includes('shadow_replay_ready_not_publishable') ? 'shadow_replay_ready_not_publishable' : null,
    standardLibraryTrustBoundary: boundaries.includes('blocked_live_replay_evidence')
      ? 'blocked_live_replay_evidence'
      : boundaries.includes('archived_live_shadow_replay_only') ? 'archived_live_shadow_replay_only' : null,
    standardLibraryTrustBlockingReasons: uniqueUnknownStrings(
      candidates.flatMap(readStandardLibraryTrustBlockingReasons),
    ),
  }
}

function readSelectedPhase1CandidateId(selection: Record<string, unknown>) {
  const selectedEvaluation = readRecord(selection.selectedEvaluation ?? selection.selected_evaluation)
  return normalizeId(selection.selectedCandidateId ?? selection.selected_candidate_id ?? selectedEvaluation.candidateId)
}

function readEvaluationCandidateId(evaluation: Record<string, unknown>) {
  return normalizeId(
    evaluation.candidateId
      ?? evaluation.candidate_id
      ?? evaluation.networkCandidateId
      ?? evaluation.network_candidate_id,
  )
}

function collectPhase1SelectionCandidateMismatchCodes(
  selection: Record<string, unknown>,
  evaluation: Record<string, unknown>,
) {
  const selectedCandidateId = readSelectedPhase1CandidateId(selection)
  const evaluationCandidateId = readEvaluationCandidateId(evaluation)
  return selectedCandidateId && evaluationCandidateId && selectedCandidateId !== evaluationCandidateId
    ? ['phase1_selection_candidate_mismatch']
    : []
}

function readRowForecastSources(row: ScheduleAccelerationRow) {
  const durationForecast = readRecord(row.values.durationForecast)
  const snakeDurationForecast = readRecord(row.values.duration_forecast)
  return readRecord(
    durationForecast.forecastSources
      ?? durationForecast.forecast_sources
      ?? snakeDurationForecast.forecastSources
      ?? snakeDurationForecast.forecast_sources
      ?? row.values.forecastSources
      ?? row.values.forecast_sources,
  )
}

function buildScheduleAccelerationT2RhythmEvidence(
  rows: ScheduleAccelerationRow[],
  context?: ScheduleAccelerationContext,
): NonNullable<ScheduleAccelerationProposal['calculationBasis']>['t2RhythmScheduleEvidence'] | undefined {
  const runtimeProjectRemainingEvidence = readRecord(readRecord(context?.runtime).t2RhythmScheduleEvidence)
  const rowEvidence: Array<Record<string, unknown>> = []
  const selectedTemplateIds: unknown[] = []
  const conflictCodes: unknown[] = [runtimeProjectRemainingEvidence.conflictCodes]
  const capacityCoverages: Record<string, unknown>[] = [
    readProductionCapacityCoverage(runtimeProjectRemainingEvidence),
    readProductionCapacityCoverage(readRecord(runtimeProjectRemainingEvidence.t2RhythmScheduleCandidateNetworkEvaluation)),
    deriveProductionCapacityCoverageFromEvidence(
      readRecord(runtimeProjectRemainingEvidence.t2RhythmScheduleCandidatePackage ?? runtimeProjectRemainingEvidence.t2_rhythm_schedule_candidate_package),
      readProductionCapacityEvidence(runtimeProjectRemainingEvidence),
    ),
  ]
  const phase1Selections: Record<string, unknown>[] = [readPhase1Selection(runtimeProjectRemainingEvidence)]
  const assemblyGates: Record<string, unknown>[] = [
    readRecord(readRecord(runtimeProjectRemainingEvidence.durationInputAssembly).assemblyGate),
  ]
  const selectorReceiptEvidences: ReturnType<typeof collectSelectorReceiptEvidence>[] = [
    collectSelectorReceiptEvidence(runtimeProjectRemainingEvidence),
  ]
  const standardLibraryTrustGateEvidences: ReturnType<typeof collectStandardLibraryTrustGateEvidence>[] = [
    collectStandardLibraryTrustGateEvidence(runtimeProjectRemainingEvidence),
  ]
  const blockingReasons: unknown[] = []

  for (const row of rows) {
    const sources = readRowForecastSources(row)
    const rowT2Evidence = readRecord(sources.t2RhythmScheduleEvidence ?? sources.t2_rhythm_schedule_evidence)
    const rowPackage = readRecord(sources.t2RhythmScheduleCandidatePackage ?? sources.t2_rhythm_schedule_candidate_package)
    const rowEvaluation = readRecord(sources.t2RhythmScheduleCandidateNetworkEvaluation ?? sources.t2_rhythm_schedule_candidate_network_evaluation)
    const rowNetwork = readRecord(sources.t2RhythmScheduleCandidateNetwork ?? sources.t2_rhythm_schedule_candidate_network)
    const rowPhase1Selection = readRecord(sources.t2RhythmSchedulePhase1Selection ?? sources.t2_rhythm_schedule_phase1_selection)
    const rowProductionCapacityEvidence = readProductionCapacityEvidence(sources)
    const rowAssembly = readRecord(sources.durationInputAssembly ?? sources.duration_input_assembly)
    if (!Object.keys(rowT2Evidence).length
      && !Object.keys(rowPackage).length
      && !Object.keys(rowEvaluation).length
      && !Object.keys(rowNetwork).length
      && !Object.keys(rowPhase1Selection).length
      && !Object.keys(rowProductionCapacityEvidence).length
      && !Object.keys(rowAssembly).length) {
      continue
    }

    const evidence = {
      clientRowId: row.clientRowId,
      ...(Object.keys(rowT2Evidence).length ? { t2RhythmScheduleEvidence: rowT2Evidence } : {}),
      ...(Object.keys(rowPackage).length ? { t2RhythmScheduleCandidatePackage: rowPackage } : {}),
      ...(Object.keys(rowNetwork).length ? { t2RhythmScheduleCandidateNetwork: rowNetwork } : {}),
      ...(Object.keys(rowEvaluation).length ? { t2RhythmScheduleCandidateNetworkEvaluation: rowEvaluation } : {}),
      ...(Object.keys(rowPhase1Selection).length ? { t2RhythmSchedulePhase1Selection: rowPhase1Selection } : {}),
      ...(Object.keys(rowProductionCapacityEvidence).length ? { t2RhythmProductionCapacityEvidence: rowProductionCapacityEvidence } : {}),
      ...(Object.keys(rowAssembly).length ? { durationInputAssembly: rowAssembly } : {}),
    }
    rowEvidence.push(evidence)
    selectedTemplateIds.push(rowT2Evidence.selectedTemplateIds)
    selectedTemplateIds.push(rowPackage.selectedTemplateIds)
    selectedTemplateIds.push(rowNetwork.selectedTemplateIds)
    selectedTemplateIds.push(readRecord(rowEvaluation.scheduleTrustEvidence).selectedTemplateIds)
    selectedTemplateIds.push(readRecord(readRecord(rowAssembly.inputChannels).t2RhythmScheduleCandidatePackage).selectedTemplateIds)
    conflictCodes.push(rowT2Evidence.conflictCodes)
    conflictCodes.push(readRecord(rowNetwork.conflictSummary).conflictCodes)
    conflictCodes.push(readRecord(rowEvaluation.conflictSummary).conflictCodes)
    conflictCodes.push(collectPhase1SelectionConflictCodes(rowPhase1Selection))
    conflictCodes.push(collectPhase1SelectionCandidateMismatchCodes(rowPhase1Selection, rowEvaluation))
    conflictCodes.push(readRecord(rowAssembly.assemblyGate).conflictCodes)
    capacityCoverages.push(readProductionCapacityCoverage(rowT2Evidence))
    capacityCoverages.push(readProductionCapacityCoverage(rowNetwork))
    capacityCoverages.push(readProductionCapacityCoverage(rowEvaluation))
    capacityCoverages.push(deriveProductionCapacityCoverageFromEvidence(rowPackage, rowProductionCapacityEvidence))
    phase1Selections.push(readPhase1Selection(rowT2Evidence))
    phase1Selections.push(rowPhase1Selection)
    assemblyGates.push(readRecord(rowAssembly.assemblyGate))
    selectorReceiptEvidences.push(collectSelectorReceiptEvidence(evidence))
    standardLibraryTrustGateEvidences.push(collectStandardLibraryTrustGateEvidence(evidence))
    blockingReasons.push(readProductionCapacityCoverage(rowT2Evidence).blockingReasons)
    blockingReasons.push(readProductionCapacityCoverage(rowNetwork).blockingReasons)
    blockingReasons.push(readProductionCapacityCoverage(rowEvaluation).blockingReasons)
    blockingReasons.push(deriveProductionCapacityCoverageFromEvidence(rowPackage, rowProductionCapacityEvidence).blockingReasons)
    blockingReasons.push(collectPhase1SelectionReasonCodes(rowPhase1Selection))
    blockingReasons.push(collectPhase1SelectionCandidateMismatchCodes(rowPhase1Selection, rowEvaluation))
  }

  const hasRuntimeEvidence = Object.keys(runtimeProjectRemainingEvidence).length > 0
  if (!hasRuntimeEvidence && rowEvidence.length === 0) return undefined

  selectedTemplateIds.push(runtimeProjectRemainingEvidence.selectedTemplateIds)
  conflictCodes.push(collectPhase1SelectionCandidateMismatchCodes(
    readPhase1Selection(runtimeProjectRemainingEvidence),
    readRecord(
      runtimeProjectRemainingEvidence.t2RhythmScheduleCandidateNetworkEvaluation
        ?? runtimeProjectRemainingEvidence.t2_rhythm_schedule_candidate_network_evaluation,
    ),
  ))
  blockingReasons.push(readProductionCapacityCoverage(runtimeProjectRemainingEvidence).blockingReasons)
  blockingReasons.push(deriveProductionCapacityCoverageFromEvidence(
    readRecord(runtimeProjectRemainingEvidence.t2RhythmScheduleCandidatePackage ?? runtimeProjectRemainingEvidence.t2_rhythm_schedule_candidate_package),
    readProductionCapacityEvidence(runtimeProjectRemainingEvidence),
  ).blockingReasons)
  blockingReasons.push(collectPhase1SelectionReasonCodes(readPhase1Selection(runtimeProjectRemainingEvidence)))
  blockingReasons.push(collectPhase1SelectionCandidateMismatchCodes(
    readPhase1Selection(runtimeProjectRemainingEvidence),
    readRecord(
      runtimeProjectRemainingEvidence.t2RhythmScheduleCandidateNetworkEvaluation
        ?? runtimeProjectRemainingEvidence.t2_rhythm_schedule_candidate_network_evaluation,
    ),
  ))
  const productionCapacityCoverage = firstNonEmptyRecord(capacityCoverages)
  const normalizedConflictCodes = uniqueUnknownStrings([
    ...conflictCodes,
    collectProductionCapacityCoverageConflictCodes(productionCapacityCoverage),
  ])
  const phase1Selection = firstNonEmptyRecord(phase1Selections)
  const assemblyGate = firstNonEmptyRecord(assemblyGates)
  const selectorReceiptAuditStatuses = selectorReceiptEvidences
    .map((evidence) => evidence.selectorReceiptAuditStatus)
    .filter((status): status is string => Boolean(status))
  const selectorReceiptCounts = selectorReceiptEvidences
    .map((evidence) => evidence.selectionReceiptCount)
    .filter((count): count is number => count != null)
  const selectorReceiptAuditStatus = selectorReceiptAuditStatuses.includes('missing')
    ? 'missing'
    : selectorReceiptAuditStatuses.includes('ready') ? 'ready' : null
  const selectionReceiptCount = selectorReceiptCounts.length > 0 ? Math.max(...selectorReceiptCounts) : null
  const selectorReceiptMissing = selectorReceiptAuditStatus === 'missing'
    || (selectorReceiptAuditStatus === null && normalizeId(readRecord(phase1Selection.selectionBasis ?? phase1Selection.selection_basis).selectorReceiptRequired ?? readRecord(phase1Selection.combinationConsistencyGate ?? phase1Selection.combination_consistency_gate).selectorReceiptRequired) === 'true')
  const standardLibraryTrustGateStatuses = standardLibraryTrustGateEvidences
    .map((evidence) => evidence.standardLibraryTrustGateStatus)
    .filter((status): status is string => Boolean(status))
  const standardLibraryTrustBoundaries = standardLibraryTrustGateEvidences
    .map((evidence) => evidence.standardLibraryTrustBoundary)
    .filter((boundary): boundary is string => Boolean(boundary))
  const standardLibraryTrustGateStatus = standardLibraryTrustGateStatuses.includes('not_trustworthy_for_real_schedule')
    ? 'not_trustworthy_for_real_schedule'
    : standardLibraryTrustGateStatuses.includes('missing')
      ? 'missing'
      : standardLibraryTrustGateStatuses.includes('shadow_replay_ready_not_publishable') ? 'shadow_replay_ready_not_publishable' : null
  const standardLibraryTrustBoundary = standardLibraryTrustBoundaries.includes('blocked_live_replay_evidence')
    ? 'blocked_live_replay_evidence'
    : standardLibraryTrustBoundaries.includes('archived_live_shadow_replay_only') ? 'archived_live_shadow_replay_only' : null
  const standardLibraryTrustBlockingReasons = uniqueUnknownStrings(
    standardLibraryTrustGateEvidences.flatMap((evidence) => evidence.standardLibraryTrustBlockingReasons),
  )
  const standardLibraryTrustGateMissing = standardLibraryTrustGateStatus === 'missing'
  const standardLibraryTrustGateBlocked = standardLibraryTrustGateStatus === 'not_trustworthy_for_real_schedule'
    || standardLibraryTrustGateMissing
  const normalizedBlockingReasons = uniqueUnknownStrings(blockingReasons)
  const normalizedBlockingReasonsWithSelector = uniqueUnknownStrings([
    normalizedBlockingReasons,
    selectorReceiptMissing ? 'selector_receipt_missing' : null,
    standardLibraryTrustBlockingReasons,
    standardLibraryTrustGateMissing ? 't2_standard_library_live_replay_trust_gate_missing' : null,
    standardLibraryTrustGateMissing ? 'archived_live_replay_required' : null,
  ])
  const normalizedConflictCodesWithSelector = uniqueUnknownStrings([
    normalizedConflictCodes,
    selectorReceiptMissing ? 'selector_receipt_missing' : null,
    standardLibraryTrustGateMissing
      ? 't2_standard_library_live_replay_trust_gate_missing'
      : standardLibraryTrustGateBlocked ? 't2_standard_library_live_replay_not_trustworthy' : null,
  ])
  const runtimeCanEnter = runtimeProjectRemainingEvidence.canEnterC1913Phase1Selection === true
  const rowCanEnter = rowEvidence.some((evidence) => (
    readRecord(evidence.t2RhythmScheduleEvidence).canEnterC1913Phase1Selection === true
    || readRecord(evidence.t2RhythmScheduleCandidateNetworkEvaluation).canEnterC1913Phase1Selection === true
    || readRecord(evidence.t2RhythmSchedulePhase1Selection).status === 'phase1_selection_ready'
    || readRecord(readRecord(evidence.durationInputAssembly).assemblyGate).canEnterC1913Phase1Selection === true
  ))
  const requiresManualReview = runtimeProjectRemainingEvidence.requiresManualReview === true
    || rowEvidence.some((evidence) => (
      readRecord(evidence.t2RhythmScheduleEvidence).requiresManualReview === true
      || readRecord(evidence.t2RhythmSchedulePhase1Selection).status === 'manual_review_required'
      || readRecord(readRecord(evidence.durationInputAssembly).assemblyGate).requiresManualReview === true
    ))
    || normalizedConflictCodesWithSelector.length > 0
    || normalizedBlockingReasonsWithSelector.length > 0
  const canEnterC1913Phase1Selection = (runtimeCanEnter || rowCanEnter) && !requiresManualReview
  const readinessSummary = {
    source: 'schedule_acceleration_t2_readiness_summary' as const,
    phase1SelectionStatus: normalizeId(phase1Selection.status),
    productionCapacityCoverageStatus: normalizeId(productionCapacityCoverage.status),
    assemblyGateStatus: normalizeId(assemblyGate.status),
    standardLibraryTrustGateStatus,
    standardLibraryTrustBoundary,
    standardLibraryTrustBlockingReasons,
    selectionReceiptCount,
    selectorReceiptAuditStatus,
    selectedCandidateId: readSelectedPhase1CandidateId(phase1Selection),
    canEnterC1913Phase1Selection,
    requiresManualReview,
    conflictCodes: normalizedConflictCodesWithSelector,
    blockingReasons: normalizedBlockingReasonsWithSelector,
  }

  return {
    source: 'schedule_acceleration_e5_readonly_context',
    evidenceRowCount: Number(runtimeProjectRemainingEvidence.evidenceRowCount ?? rowEvidence.length) || rowEvidence.length,
    selectedTemplateIds: uniqueUnknownStrings(selectedTemplateIds),
    canEnterC1913Phase1Selection,
    requiresManualReview,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    ...(hasRuntimeEvidence ? { runtimeProjectRemainingEvidence } : {}),
    rowEvidence,
    ...(normalizedConflictCodesWithSelector.length > 0 ? { conflictCodes: normalizedConflictCodesWithSelector } : {}),
    ...(isNonEmptyRecord(productionCapacityCoverage) ? { productionCapacityCoverage } : {}),
    ...(isNonEmptyRecord(phase1Selection) ? { phase1Selection } : {}),
    readinessSummary,
  }
}

function normalizeRowProjectionMode(value: unknown): ScheduleAccelerationRowProjectionMode | '' {
  const mode = normalizeId(value)
  return mode === 'schedule_row'
    || mode === 'gate_marker'
    || mode === 'inline_control'
    || mode === 'linked_projection'
    ? mode
    : ''
}

function parsePlanDateTime(date: string | null) {
  if (!date) return null
  const time = Date.parse(`${date}T00:00:00.000Z`)
  return Number.isFinite(time) ? time : null
}

function comparePlanDates(left: string | null, right: string | null) {
  const leftTime = parsePlanDateTime(left)
  const rightTime = parsePlanDateTime(right)
  if (leftTime === null && rightTime === null) return 0
  if (leftTime === null) return -1
  if (rightTime === null) return 1
  return leftTime - rightTime
}

function scheduleShiftDays(from: string | null, to: string | null, calendar?: ConstructionCalendarContext | null) {
  return delayDayDelta(from, to, calendar) ?? 0
}

function hasConstructionCalendarRules(calendar?: ConstructionCalendarContext | null) {
  return Boolean(calendar?.windows?.length)
}

function resolveScheduleAccelerationCalendar(context?: ScheduleAccelerationContext | null) {
  return context?.constructionCalendar ?? context?.workCalendar ?? null
}

function addPlanDays(date: string | null, days: number, calendar?: ConstructionCalendarContext | null) {
  if (hasConstructionCalendarRules(calendar)) {
    const parsed = parseConstructionCalendarDate(date)
    if (!parsed) return null
    return addConstructionProductionDays(parsed, Math.max(1, Math.round(days) + 1), calendar)
  }

  const next = normalizeDurationDateUtc(date)
  if (!next) return null
  next.setUTCDate(next.getUTCDate() + Math.round(days))
  return next.toISOString().slice(0, 10)
}

function shiftPlanDate(date: string | null, deltaDays: number, calendar?: ConstructionCalendarContext | null) {
  const shift = Math.round(deltaDays)
  if (shift === 0) return normalizeDate(date)
  if (hasConstructionCalendarRules(calendar)) {
    const parsed = parseConstructionCalendarDate(date)
    if (!parsed) return null
    if (shift > 0) return addConstructionProductionDays(parsed, shift + 1, calendar)
    const cursor = new Date(parsed)
    let remaining = Math.abs(shift)
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      if (isConstructionProductionDay(cursor, calendar)) remaining -= 1
    }
    return cursor.toISOString().slice(0, 10)
  }

  const next = normalizeDurationDateUtc(date)
  if (!next) return null
  next.setUTCDate(next.getUTCDate() + shift)
  return next.toISOString().slice(0, 10)
}

function planSpanDays(from: string | null, to: string | null, calendar?: ConstructionCalendarContext | null) {
  if (hasConstructionCalendarRules(calendar)) {
    const start = parseConstructionCalendarDate(from)
    const end = parseConstructionCalendarDate(to)
    if (!start || !end) return 1
    return Math.max(1, productionDaysBetweenInclusive(start, end, calendar))
  }

  return inclusiveDurationDays(from, to) ?? 1
}

function readRowMetadata(row: ScheduleAccelerationRow) {
  return readRecord(row.values.standard_task_metadata ?? row.values.metadata)
}

function readRowFeatureProfile(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const projectGenerationFacts = readProjectGenerationFactsSnapshot(metadata)
  return {
    projectTypeCode: projectGenerationFacts.businessType,
    structureTypeCode: projectGenerationFacts.structureTypeCode,
    methodVariantCodes: projectGenerationFacts.methodVariantCodes,
    elementVariantCodes: projectGenerationFacts.elementVariantCodes,
    ...readRecord(metadata.featureProfile ?? metadata.feature_profile),
  }
}

function readFeatureCodeValues(value: unknown) {
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  }
  return readCodeArray(value)
}

function readContextFeatureCodes(context: ScheduleAccelerationContext | undefined, key: string) {
  if (!context) return []
  if (key === 'project_type_code' || key === 'projectTypeCode') return readFeatureCodeValues(context.projectTypeCodes)
  if (key === 'method_variant_codes' || key === 'methodVariantCodes') return readFeatureCodeValues(context.methodVariantCodes)
  if (key === 'climate_signal' || key === 'climateSignals' || key === 'monthly_climate_signal') return readFeatureCodeValues(context.climateSignals)
  if (key === 'weather_impact_bands' || key === 'weatherImpactBands') return readFeatureCodeValues(context.weatherImpactBands)
  return []
}

function readProjectGenerationFactsFeatureCodes(metadata: Record<string, unknown>, key: string) {
  const facts = readProjectGenerationFactsSnapshot(metadata)
  if (key === 'project_type_code' || key === 'projectTypeCode') return readFeatureCodeValues(facts.businessType)
  if (key === 'method_variant_codes' || key === 'methodVariantCodes') return readFeatureCodeValues(facts.methodVariantCodes)
  return []
}

function readRowsProjectGenerationFacts(rows: ScheduleAccelerationRow[]) {
  for (const row of rows) {
    const facts = readProjectGenerationFactsSnapshot(readRowMetadata(row))
    if (Object.keys(facts).length > 0) return facts as Record<string, unknown>
  }
  return {}
}

function readConstructionOrganizationScenarioFromRows(rows: ScheduleAccelerationRow[]): ConstructionOrganizationScenarioSelection | null {
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const projectOrganization = readRecord(metadata.projectOrganization)
    const scenarioSelection = readRecord(projectOrganization.scenarioSelection)
    if (scenarioSelection.source === 'construction_organization_scenario_selector') {
      return scenarioSelection as unknown as ConstructionOrganizationScenarioSelection
    }
  }
  return null
}

function deriveConstructionOrganizationScenarioFromContext(
  context?: ScheduleAccelerationContext,
): ConstructionOrganizationScenarioSelection | null {
  const projectGenerationFacts = buildProjectGenerationFactsSnapshot(context?.projectGenerationFacts)
  const selectorInput: ConstructionOrganizationScenarioSelectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts(projectGenerationFacts, {
    methodVariantCodes: projectGenerationFacts.methodVariantCodes ?? context?.methodVariantCodes,
    climateSignals: projectGenerationFacts.climateSignals ?? context?.climateSignals,
    weatherImpactBands: projectGenerationFacts.weatherImpactBands ?? context?.weatherImpactBands,
  })

  const hasSelectorFacts = Object.values(selectorInput).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
    return value !== undefined && value !== null && value !== ''
  })
  if (!hasSelectorFacts) return null

  return selectConstructionOrganizationScenario(selectorInput)
}

function resolveConstructionOrganizationScenario(
  rows: ScheduleAccelerationRow[],
  context?: ScheduleAccelerationContext,
) {
  return context?.constructionOrganizationScenario
    ?? readConstructionOrganizationScenarioFromRows(rows)
    ?? deriveConstructionOrganizationScenarioFromContext(context)
}

function summarizeConstructionOrganizationScenario(selection?: ConstructionOrganizationScenarioSelection | null) {
  if (!selection) return null
  const projectOrganizationPolicy = selection.factBasis?.projectOrganizationPolicy
    && typeof selection.factBasis.projectOrganizationPolicy === 'object'
    ? selection.factBasis.projectOrganizationPolicy as Record<string, unknown>
    : null
  const projectOrganizationPolicySummary = projectOrganizationPolicy
    ? {
        source: projectOrganizationPolicy.source,
        policyId: projectOrganizationPolicy.policyId,
        sourceVersion: projectOrganizationPolicy.sourceVersion,
        strategy: projectOrganizationPolicy.strategy,
        schemeFamily: projectOrganizationPolicy.schemeFamily,
        primaryInterfaceSequence: Array.isArray(projectOrganizationPolicy.primaryInterfaceSequence)
          ? projectOrganizationPolicy.primaryInterfaceSequence
          : [],
        interfaceGateTags: Array.isArray(projectOrganizationPolicy.interfaceGateTags)
          ? projectOrganizationPolicy.interfaceGateTags
          : [],
        laneRole: projectOrganizationPolicy.laneRole,
        lanePrefix: projectOrganizationPolicy.lanePrefix,
        networkPolicy: projectOrganizationPolicy.networkPolicy,
        confidence: projectOrganizationPolicy.confidence,
        rationale: projectOrganizationPolicy.rationale,
        resourcePolicy: projectOrganizationPolicy.resourcePolicy,
      }
    : null
  const summarizeUseCaseEvaluations = (option: NonNullable<ConstructionOrganizationScenarioSelection['recommendedPlanOption']>) => option.evaluation?.useCaseEvaluations
    ? {
        newProjectPlanning: option.evaluation.useCaseEvaluations.newProjectPlanning,
        startingLineOnboarding: option.evaluation.useCaseEvaluations.startingLineOnboarding,
        accelerationRecovery: option.evaluation.useCaseEvaluations.accelerationRecovery,
      }
    : null
  const summarizePlanOption = (option: NonNullable<ConstructionOrganizationScenarioSelection['recommendedPlanOption']>) => ({
    optionId: option.optionId,
    source: option.source,
    selectedScenarioIds: option.selectedScenarioIds,
    projectOrganizationScheme: option.projectOrganizationScheme,
    combinedScore: option.combinedScore,
    confidence: option.confidence,
    recoveryFactorHint: option.evaluation?.recoveryFactorHint,
    networkEvaluation: option.evaluation?.networkEvaluation
      ? {
          evaluationRole: option.evaluation.networkEvaluation.evaluationRole,
          e3NetworkBasis: option.evaluation.networkEvaluation.e3NetworkBasis,
          projectDurationDays: option.evaluation.networkEvaluation.projectDurationDays,
          criticalNodeIds: option.evaluation.networkEvaluation.criticalNodeIds,
          edgeCount: option.evaluation.networkEvaluation.edgeCount,
          e5RecoverableSpanDays: option.evaluation.networkEvaluation.e5RecoverableSpanDays,
          writesTaskDependencies: option.evaluation.networkEvaluation.writesTaskDependencies,
          writesPlanDates: option.evaluation.networkEvaluation.writesPlanDates,
          writesCriticalPathFacts: option.evaluation.networkEvaluation.writesCriticalPathFacts,
        }
      : null,
    engineEvaluationSummary: option.evaluation?.engineEvaluationSummary
      ? {
          source: option.evaluation.engineEvaluationSummary.source,
          evaluationRole: option.evaluation.engineEvaluationSummary.evaluationRole,
          e1: option.evaluation.engineEvaluationSummary.e1,
          e3: option.evaluation.engineEvaluationSummary.e3,
          e5: option.evaluation.engineEvaluationSummary.e5,
          projectOrganization: option.evaluation.engineEvaluationSummary.projectOrganization,
          boundary: option.evaluation.engineEvaluationSummary.boundary,
        }
      : null,
    generatedRowProjection: option.evaluation?.generatedRowProjection
      ? {
          source: option.evaluation.generatedRowProjection.source,
          projectionBasis: option.evaluation.generatedRowProjection.projectionBasis,
          generatedScheduleSpanDays: option.evaluation.generatedRowProjection.generatedScheduleSpanDays,
          virtualProjectDurationDays: option.evaluation.generatedRowProjection.virtualProjectDurationDays,
          spanDeltaDays: option.evaluation.generatedRowProjection.spanDeltaDays,
          dependencyAlignmentScore: option.evaluation.generatedRowProjection.dependencyAlignmentScore,
          projectionConfidence: option.evaluation.generatedRowProjection.projectionConfidence,
          mappedNodeCount: option.evaluation.generatedRowProjection.mappedNodeCount,
          generatedRowMatchCount: option.evaluation.generatedRowProjection.generatedRowMatchCount,
          unmappedNodeIds: option.evaluation.generatedRowProjection.unmappedNodeIds,
          candidateDependencyPreview: option.evaluation.generatedRowProjection.candidateDependencyPreview
            ? {
                source: option.evaluation.generatedRowProjection.candidateDependencyPreview.source,
                previewBasis: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewBasis,
                materializationReadiness: option.evaluation.generatedRowProjection.candidateDependencyPreview.materializationReadiness,
                previewEdgeCount: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewEdges.length,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.candidateDependencyPreview.unresolvedEdges.length,
                previewEdges: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewEdges,
                unresolvedEdges: option.evaluation.generatedRowProjection.candidateDependencyPreview.unresolvedEdges,
                writesTaskDependencies: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesCriticalPathFacts,
              }
            : null,
          candidateMaterializationEvaluation: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation
            ? {
                source: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.source,
                materializationBasis: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializationBasis,
                previewEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.previewEdgeCount,
                satisfiedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.satisfiedEdgeCount,
                violatedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.violatedEdgeCount,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.unresolvedEdgeCount,
                materializedNetworkSpanDays: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializedNetworkSpanDays,
                materializationScore: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializationScore,
                violationDetails: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.violationDetails,
                writesTaskDependencies: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesCriticalPathFacts,
              }
            : null,
          materializationDecision: option.evaluation.generatedRowProjection.materializationDecision
            ? {
                source: option.evaluation.generatedRowProjection.materializationDecision.source,
                decision: option.evaluation.generatedRowProjection.materializationDecision.decision,
                allowManualMaterialization: option.evaluation.generatedRowProjection.materializationDecision.allowManualMaterialization,
                reasons: option.evaluation.generatedRowProjection.materializationDecision.reasons,
                writesTaskDependencies: option.evaluation.generatedRowProjection.materializationDecision.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.materializationDecision.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.materializationDecision.writesCriticalPathFacts,
              }
            : null,
          materializationReviewPackage: option.evaluation.generatedRowProjection.materializationReviewPackage
            ? {
                source: option.evaluation.generatedRowProjection.materializationReviewPackage.source,
                packageBasis: option.evaluation.generatedRowProjection.materializationReviewPackage.packageBasis,
                optionId: option.evaluation.generatedRowProjection.materializationReviewPackage.optionId,
                status: option.evaluation.generatedRowProjection.materializationReviewPackage.status,
                allowManualReview: option.evaluation.generatedRowProjection.materializationReviewPackage.allowManualReview,
                proposedDependencyEdgeCount: option.evaluation.generatedRowProjection.materializationReviewPackage.proposedDependencyEdgeCount,
                blockedReasons: option.evaluation.generatedRowProjection.materializationReviewPackage.blockedReasons,
                proposedDependencyEdges: option.evaluation.generatedRowProjection.materializationReviewPackage.proposedDependencyEdges,
                conflictEvidence: option.evaluation.generatedRowProjection.materializationReviewPackage.conflictEvidence,
                reviewRequired: option.evaluation.generatedRowProjection.materializationReviewPackage.reviewRequired,
                writesTaskDependencies: option.evaluation.generatedRowProjection.materializationReviewPackage.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.materializationReviewPackage.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.materializationReviewPackage.writesCriticalPathFacts,
              }
            : null,
          generatedRowReferenceDurationEvidence: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence
            ? {
                source: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.source,
                durationBasis: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.durationBasis,
                matchedReferenceRowCount: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.matchedReferenceRowCount,
                totalPlanReferenceDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalPlanReferenceDays,
                totalContextualReferenceDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalContextualReferenceDays,
                totalRecommendedDurationDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalRecommendedDurationDays,
                phaseDurations: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.phaseDurations,
                writesReferenceDuration: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesReferenceDuration,
                writesPlanDates: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesPlanDates,
                writesSeed: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesSeed,
              }
            : null,
          generatedRowNetworkEvaluation: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation
            ? {
                source: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.source,
                networkBasis: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.networkBasis,
                projectedNetworkSpanDays: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.projectedNetworkSpanDays,
                previewEdgeCount: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.previewEdgeCount,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.unresolvedEdgeCount,
                criticalGeneratedRowIds: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.criticalGeneratedRowIds,
                materializationStatus: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.materializationStatus,
                rowSchedule: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.rowSchedule,
                writesTaskDependencies: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesCriticalPathFacts,
              }
            : null,
          writesTaskDependencies: option.evaluation.generatedRowProjection.writesTaskDependencies,
          writesPlanDates: option.evaluation.generatedRowProjection.writesPlanDates,
          writesCriticalPathFacts: option.evaluation.generatedRowProjection.writesCriticalPathFacts,
        }
      : null,
    useCaseEvaluations: summarizeUseCaseEvaluations(option),
    virtualNetworkTotalSpanDays: option.combinedVirtualNetwork?.totalSpanDays,
    virtualNetworkCriticalNodeIds: option.combinedVirtualNetwork?.criticalNodeIds,
    excludedScenarioIds: option.excludedScenarioIds,
    boundaryPolicy: {
      writesTaskDependencies: option.evaluation?.writesTaskDependencies,
      writesPlanDates: option.evaluation?.writesPlanDates,
      writesSeed: option.evaluation?.writesSeed,
    },
  })
  const summarizeUseCaseRecommendation = (
    recommendation: ConstructionOrganizationScenarioSelection['scenarioRecommendations'][keyof ConstructionOrganizationScenarioSelection['scenarioRecommendations']] | undefined,
  ) => recommendation
    ? {
        useCase: recommendation.useCase,
        optionId: recommendation.optionId,
        selectedScenarioIds: recommendation.selectedScenarioIds,
        recommendationBasis: recommendation.recommendationBasis,
        confidence: recommendation.confidence,
        actionability: recommendation.actionability,
        currentSubstage: recommendation.currentSubstage ?? null,
        recoveryFactorHint: recommendation.recoveryFactorHint,
        writesTaskDependencies: recommendation.writesTaskDependencies,
        writesPlanDates: recommendation.writesPlanDates,
        writesSeed: recommendation.writesSeed,
      }
    : null
  return {
    source: selection.source,
    sourceVersion: selection.sourceVersion,
    recommendedScenarioIds: selection.recommendedScenarioIds,
    projectOrganizationPolicy: projectOrganizationPolicySummary,
    factBasis: projectOrganizationPolicySummary
      ? { projectOrganizationPolicy: projectOrganizationPolicySummary }
      : null,
    recommendedPlanOption: selection.recommendedPlanOption ? summarizePlanOption(selection.recommendedPlanOption) : null,
    planOptions: (selection.planOptions ?? []).map((option) => summarizePlanOption(option)),
    planOptionComparisonPackage: selection.planOptionComparisonPackage ?? null,
    organizationDecisionReport: ensureConstructionOrganizationDecisionReportProductCloseoutReadiness(
      selection.organizationDecisionReport as unknown as Record<string, unknown> | null | undefined,
    ),
    scenarioRecommendations: selection.scenarioRecommendations
      ? {
          newProjectPlanning: summarizeUseCaseRecommendation(selection.scenarioRecommendations.newProjectPlanning),
          startingLineOnboarding: summarizeUseCaseRecommendation(selection.scenarioRecommendations.startingLineOnboarding),
          accelerationRecovery: summarizeUseCaseRecommendation(selection.scenarioRecommendations.accelerationRecovery),
        }
      : null,
    planNetworkDraftRecommendations: selection.planNetworkDraftRecommendations ?? null,
    confidence: selection.confidence,
    resourcePolicy: selection.boundaryPolicy.resourcePolicy,
    boundaryPolicy: selection.boundaryPolicy,
    candidateEvaluations: selection.candidates
      .filter((candidate) => selection.recommendedScenarioIds.includes(candidate.scenarioId))
      .map((candidate) => ({
        scenarioId: candidate.scenarioId,
        compositeScore: candidate.evaluation?.compositeScore,
        recoveryFactorHint: candidate.evaluation?.recoveryFactorHint,
        scheduleRiskLevel: candidate.evaluation?.scheduleRiskLevel,
        e1DurationBasis: candidate.evaluation?.e1DurationBasis,
        e3NetworkBasis: candidate.evaluation?.e3NetworkBasis,
        e5AccelerationBasis: candidate.evaluation?.e5AccelerationBasis,
        virtualNetworkTotalSpanDays: candidate.virtualNetwork?.totalSpanDays,
        virtualNetworkCriticalNodeIds: candidate.virtualNetwork?.criticalNodeIds,
      })),
  }
}

function resolveConstructionOrganizationRecoveryFactor(selection?: ConstructionOrganizationScenarioSelection | null) {
  if (!selection) return 1
  const accelerationRecommendationFactor = Number(selection.scenarioRecommendations?.accelerationRecovery?.recoveryFactorHint)
  if (Number.isFinite(accelerationRecommendationFactor) && accelerationRecommendationFactor > 0) {
    return Math.max(1, Math.min(1.1, accelerationRecommendationFactor))
  }
  const planOptionFactor = Number(selection.recommendedPlanOption?.evaluation?.recoveryFactorHint)
  if (Number.isFinite(planOptionFactor) && planOptionFactor > 0) {
    return Math.max(1, Math.min(1.1, planOptionFactor))
  }
  const recommendedCandidateFactors = selection.candidates
    .filter((candidate) => selection.recommendedScenarioIds.includes(candidate.scenarioId))
    .map((candidate) => Number(candidate.evaluation?.recoveryFactorHint))
    .filter((factor) => Number.isFinite(factor) && factor > 0)
  if (recommendedCandidateFactors.length > 0) {
    return Math.max(1, Math.min(1.1, Math.max(...recommendedCandidateFactors)))
  }
  const recommended = new Set(selection.recommendedScenarioIds)
  if (recommended.has('tower_lane_early_release_after_core_basement')) return 1.08
  if (recommended.has('shared_basement_first_then_tower')) return 1
  return 1
}

function readContextProjectGenerationFacts(context?: ScheduleAccelerationContext): Record<string, unknown> {
  const snapshot = buildProjectGenerationFactsSnapshot(context?.projectGenerationFacts)
  const projectTypeCodes = readFeatureCodeValues(context?.projectTypeCodes)
  const methodVariantCodes = readFeatureCodeValues(context?.methodVariantCodes)
  return {
    ...snapshot,
    ...(projectTypeCodes.length > 0 ? { businessType: projectTypeCodes[0], projectTypeCodes } : {}),
    ...(methodVariantCodes.length > 0 ? { methodVariantCodes } : {}),
    ...(context?.constructionOrganizationScenario
      ? {
          constructionOrganizationScenarioIds: context.constructionOrganizationScenario.recommendedScenarioIds,
          constructionOrganizationScenarioSource: context.constructionOrganizationScenario.source,
        }
      : {}),
  }
}

function buildScheduleAccelerationAlgorithmFactContext(params: {
  rows: ScheduleAccelerationRow[]
  scenario: ScheduleAccelerationScenario
  context?: ScheduleAccelerationContext
}) {
  return buildAlgorithmFactContext({
    phase: params.scenario === 'runtime_delay_recovery' ? 'runtime_delay_recovery' : 'plan_creation',
    rows: params.rows,
    projectGenerationFacts: readContextProjectGenerationFacts(params.context),
    runtimeExecutionFacts: params.scenario === 'runtime_delay_recovery'
      ? params.context?.runtime ?? null
      : null,
    context: params.context,
  })
}

function readRowFeatureCodes(rows: ScheduleAccelerationRow[], context: ScheduleAccelerationContext | undefined, ...keys: string[]) {
  const codes: string[] = []
  for (const row of rows) {
    const profile = readRowFeatureProfile(row)
    const metadata = readRowMetadata(row)
    for (const key of keys) {
      codes.push(...readFeatureCodeValues(row.values[key]))
      codes.push(...readFeatureCodeValues(metadata[key]))
      codes.push(...readFeatureCodeValues(profile[key]))
      codes.push(...readProjectGenerationFactsFeatureCodes(metadata, key))
      codes.push(...readContextFeatureCodes(context, key))
    }
  }
  return uniqueStringArray(codes.map((item) => item.toLowerCase()))
}

function readGeneratedRowPlanStart(row: ScheduleAccelerationRow) {
  return normalizeDate(row.values.planned_start_date ?? row.values.start_date)
}

function readGeneratedRowPlanEnd(row: ScheduleAccelerationRow) {
  return normalizeDate(row.values.planned_end_date ?? row.values.end_date)
}

function readGeneratedRowPlanDurationDays(row: ScheduleAccelerationRow, calendar?: ConstructionCalendarContext | null) {
  const status = normalizeText(row.values.status).toLowerCase()
  const progress = readOptionalNumber(row.values.progress)
  const remainingDurationDays = readOptionalNumber(row.values.remaining_duration_days ?? row.values.remainingDurationDays)
  const isRunning = status === 'in_progress'
    || Boolean(normalizeDate(row.values.actual_start_date) && !normalizeDate(row.values.actual_end_date))
    || (progress !== null && progress > 0 && progress < 100)
  if (isRunning && remainingDurationDays !== null && remainingDurationDays > 0) return Math.max(1, Math.ceil(remainingDurationDays))

  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  if (start && end) return planSpanDays(start, end, calendar)
  return 1
}

function getGeneratedRowsLatestEnd(rows: ScheduleAccelerationRow[]) {
  return rows
    .map(readGeneratedRowPlanEnd)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
    .at(-1) ?? null
}

function getGeneratedRowsEarliestStart(rows: ScheduleAccelerationRow[]) {
  return rows
    .map(readGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)[0] ?? null
}

function rowsForTargetFeasibility(rows: ScheduleAccelerationRow[]) {
  const scheduleRows = rows.filter((row) => {
    const metadata = readRowMetadata(row)
    const mode = normalizeRowProjectionMode(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
      || 'schedule_row'
    return mode === 'schedule_row'
  })
  return scheduleRows.length > 0 ? scheduleRows : rows
}

function resolveTargetAccelerationProjectProfile(
  rows: ScheduleAccelerationRow[],
  context?: ScheduleAccelerationContext,
): Omit<TargetAccelerationProfile, 'seasonalFactor'> {
  const projectTypeCodes = readRowFeatureCodes(rows, context, 'project_type_code', 'projectTypeCode')
  const methodVariantCodes = readRowFeatureCodes(rows, context, 'method_variant_codes', 'methodVariantCodes')
  const projectText = projectTypeCodes.join(' ')
  const methodText = methodVariantCodes.join(' ')
  const matchedProfile = SCHEDULE_ACCELERATION_PROFILE_SEED.find((profile) => (
    profile.projectTypePatterns.some((pattern) => projectText.includes(pattern.toLowerCase()))
    || profile.methodVariantPatterns.some((pattern) => methodText.includes(pattern.toLowerCase()))
  ))
    ?? SCHEDULE_ACCELERATION_PROFILE_SEED.find((profile) => profile.profileCode === SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE)
    ?? SCHEDULE_ACCELERATION_PROFILE_SEED.at(-1)

  if (!matchedProfile) throw new Error('SCHEDULE_ACCELERATION_PROFILE_SEED must include at least one profile')

  return {
    profileCode: matchedProfile.profileCode,
    fastTrackRatio: matchedProfile.fastTrackRatio,
    fastTrackBudgetRatio: matchedProfile.fastTrackBudgetRatio,
    maxFastTrackDays: matchedProfile.maxFastTrackDays,
    crashRatio: matchedProfile.crashRatio,
    totalRecoverCapRatio: matchedProfile.totalRecoverCapRatio,
  }
}

function resolveTargetAccelerationSeasonalFactor(
  rows: ScheduleAccelerationRow[],
  context?: ScheduleAccelerationContext,
) {
  const climateCodes = readRowFeatureCodes(
    rows,
    context,
    'climate_signal',
    'climateSignals',
    'monthly_climate_signal',
    'weather_impact_bands',
    'weatherImpactBands',
  )
  const text = climateCodes.join(' ')
  const seededFactor = SCHEDULE_ACCELERATION_SEASONAL_FACTOR_SEED.reduce((factor, rule) => (
    rule.patterns.some((pattern) => text.includes(pattern.toLowerCase()))
      ? Math.min(factor, rule.factor)
      : factor
  ), 1)
  return seededFactor
}

function resolveTargetAccelerationProfile(
  rows: ScheduleAccelerationRow[],
  context?: ScheduleAccelerationContext,
): TargetAccelerationProfile {
  const projectProfile = resolveTargetAccelerationProjectProfile(rows, context)
  return {
    ...projectProfile,
    seasonalFactor: resolveTargetAccelerationSeasonalFactor(rows, context),
  }
}

function normalizeAccelerationScenario(value: unknown): ScheduleAccelerationScenario {
  const scenario = normalizeText(value)
  return scenario === 'runtime_delay_recovery' ? 'runtime_delay_recovery' : 'baseline_target_alignment'
}

function resolveNetworkSlackRecoveryFactor(params: {
  criticalOrNearCriticalTaskCount: number | null
  floatingTaskCount: number | null
}) {
  const criticalCount = Math.max(0, Math.round(params.criticalOrNearCriticalTaskCount ?? 0))
  const floatingCount = Math.max(0, Math.round(params.floatingTaskCount ?? 0))
  if (criticalCount === 0 && floatingCount === 0) return 1
  if (criticalCount === 0 && floatingCount > 0) return 1.04

  const pressureRatio = criticalCount / Math.max(1, criticalCount + floatingCount)
  if (pressureRatio >= 0.8) return 0.86
  if (pressureRatio >= 0.65) return 0.92
  if (pressureRatio <= 0.35 && floatingCount > 0) return 1.04
  if (pressureRatio <= 0.5 && floatingCount > criticalCount) return 1.02
  return 1
}

function resolveRuntimeRecoveryAdjustment(context?: ScheduleAccelerationContext): RuntimeRecoveryAdjustment {
  const runtime = context?.runtime
  if (!runtime) return { factor: 1, summary: undefined }

  let factor = 1
  const resourcePressureScore = readOptionalNumber(runtime.resourcePressureScore)
  const hardBlockerCount = readOptionalNumber(runtime.hardBlockerCount)
  const blockedTaskCount = readOptionalNumber(runtime.blockedTaskCount)
  const parallelDensityRatio = readOptionalNumber(runtime.parallelDensityRatio)
  const localAccelerationFactor = readOptionalNumber(runtime.localAccelerationFactor)
  const forecastDelayDays = readOptionalNumber(runtime.forecastDelayDays)
  const baselineDeviationDays = readOptionalNumber(runtime.baselineDeviationDays)
  const criticalOrNearCriticalTaskCount = readOptionalNumber(runtime.criticalOrNearCriticalTaskCount)
  const floatingTaskCount = readOptionalNumber(runtime.floatingTaskCount)
  const networkSlackRecoveryFactor = resolveNetworkSlackRecoveryFactor({
    criticalOrNearCriticalTaskCount,
    floatingTaskCount,
  })

  if (resourcePressureScore !== null && resourcePressureScore >= 13) factor *= 0.72
  else if (resourcePressureScore !== null && resourcePressureScore >= 6) factor *= 0.86
  if (hardBlockerCount !== null && hardBlockerCount > 0) factor *= 0.78
  else if (blockedTaskCount !== null && blockedTaskCount > 0) factor *= 0.9
  if (parallelDensityRatio !== null && parallelDensityRatio >= 1.8) factor *= 0.82
  else if (parallelDensityRatio !== null && parallelDensityRatio >= 1.35) factor *= 0.92
  factor *= networkSlackRecoveryFactor
  if (localAccelerationFactor !== null && localAccelerationFactor > 1) factor *= Math.min(1.08, Math.max(1, localAccelerationFactor))
  if ((forecastDelayDays !== null && forecastDelayDays > 0) || (baselineDeviationDays !== null && baselineDeviationDays > 0)) {
    factor *= 0.96
  }

  const recoveryBudgetFactor = Math.max(0.45, Math.min(1.08, factor))
  return {
    factor: recoveryBudgetFactor,
    summary: {
      factLayer: 'runtimeExecutionFacts',
      staticFactsRole: 'background',
      progressCompletionRatio: readOptionalNumber(runtime.progressCompletionRatio),
      resourcePressureScore,
      parallelDensityRatio,
      milestonePressureScore: readOptionalNumber(runtime.milestonePressureScore),
      forecastDelayDays,
      baselineDeviationDays,
      blockedTaskCount,
      hardBlockerCount,
      criticalOrNearCriticalTaskCount,
      floatingTaskCount,
      scheduleState: normalizeText(runtime.scheduleState) || null,
      localAccelerationFactor,
      evidenceCodes: uniqueStringArray(runtime.evidenceCodes ?? []),
      evidenceObjects: runtime.evidenceObjects ?? [],
      runtimeInferenceSummary: runtime.runtimeInferenceSummary,
      t2RhythmScheduleEvidence: runtime.t2RhythmScheduleEvidence ?? null,
      networkSlackRecoveryFactor,
      recoveryBudgetFactor,
    },
  }
}

function isTargetScheduleRow(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const projectionMode = normalizeRowProjectionMode(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
  return !projectionMode || projectionMode === 'schedule_row'
}

function isTargetDurationBearingRow(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  return normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode) === 'duration_bearing'
}

function getTargetCriticalFallbackPhases(profileCode: string) {
  const profile = SCHEDULE_ACCELERATION_PROFILE_SEED.find((item) => item.profileCode === profileCode)
    ?? SCHEDULE_ACCELERATION_PROFILE_SEED.find((item) => item.profileCode === SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE)
  return new Set(profile?.criticalFallbackPhases ?? [])
}

function isTruthyBooleanLike(value: unknown) {
  if (value === true) return true
  return normalizeText(value).toLowerCase() === 'true'
}

function hasLiveCriticalProjectionSignal(row: ScheduleAccelerationRow) {
  return isTruthyBooleanLike(row.values.is_critical)
    || readOptionalNumber(row.values.total_float_days) !== null
    || readOptionalNumber(row.values.free_float_days) !== null
}

function isLiveCriticalProjectionCandidate(row: ScheduleAccelerationRow) {
  const totalFloat = readOptionalNumber(row.values.total_float_days)
  const freeFloat = readOptionalNumber(row.values.free_float_days)
  if (isTruthyBooleanLike(row.values.is_critical)) return true
  if (totalFloat !== null && totalFloat <= 3) return true
  if (freeFloat !== null && freeFloat <= 1) return true
  return false
}

function isFloatingNetworkRow(row: ScheduleAccelerationRow) {
  const totalFloat = readOptionalNumber(row.values.total_float_days)
  return totalFloat !== null && totalFloat > 7
}

function buildNetworkSlackFacts(params: {
  rows: ScheduleAccelerationRow[]
  rawCandidateRecoverDays: number
  selectedNetworkRecoverDays: number
  effectiveRecoverDays: number
}): Extract<ScheduleAccelerationProposalAction, { type: 'crashing' }>['networkSlackFacts'] {
  return {
    source: 'schedule_acceleration_network_projection',
    criticalOrNearCriticalTaskCount: params.rows.filter(isLiveCriticalProjectionCandidate).length,
    floatingTaskCount: params.rows.filter(isFloatingNetworkRow).length,
    rawCandidateRecoverDays: params.rawCandidateRecoverDays,
    selectedNetworkRecoverDays: params.selectedNetworkRecoverDays,
    effectiveRecoverDays: params.effectiveRecoverDays,
    networkLimited: params.selectedNetworkRecoverDays < params.rawCandidateRecoverDays,
  }
}

function isHeuristicCriticalCandidate(row: ScheduleAccelerationRow, profileCode = 'general_building') {
  const metadata = readRowMetadata(row)
  if (metadata.criticalPathEligible === true || isTruthyBooleanLike(metadata.criticalPathEligible)) return true
  if (row.predecessorDependencies.some((dependency) => getDependencyAccelerationPriority(dependency) >= 4)) return true
  const phase = normalizeText(row.executionPhase ?? row.values.execution_phase ?? metadata.executionPhase)
  return getTargetCriticalFallbackPhases(profileCode).has(phase)
}

function isTargetCriticalCandidate(row: ScheduleAccelerationRow, profileCode = 'general_building') {
  if (isLiveCriticalProjectionCandidate(row)) return true
  return isHeuristicCriticalCandidate(row, profileCode)
}

function getCriticalTargetRows(
  rows: ScheduleAccelerationRow[],
  profileCode = 'general_building',
  calendar?: ConstructionCalendarContext | null,
) {
  const compressibleRows = getCompressibleTargetRows(rows, profileCode, calendar)
  const hasLiveProjection = compressibleRows.some(hasLiveCriticalProjectionSignal)
  if (hasLiveProjection) {
    const liveCriticalRows = compressibleRows.filter(isLiveCriticalProjectionCandidate)
    if (liveCriticalRows.length > 0) return liveCriticalRows
  }
  return compressibleRows.filter((row) => isHeuristicCriticalCandidate(row, profileCode))
}

function applyCriticalPathSnapshotToAccelerationRows(
  rows: ScheduleAccelerationRow[],
  snapshot: CriticalPathSnapshot | null | undefined,
) {
  if (!snapshot) return rows
  const criticalTaskIds = new Set([
    ...(snapshot.displayTaskIds ?? []),
    ...(snapshot.autoTaskIds ?? []),
  ].map(normalizeText).filter(Boolean))
  const criticalTaskById = new Map((snapshot.tasks ?? []).map((task) => [normalizeText(task.taskId), task]))
  const hasCriticalPathProjection = criticalTaskIds.size > 0 || criticalTaskById.size > 0
  if (!hasCriticalPathProjection) return rows

  return rows.map((row) => {
    const taskId = normalizeText(row.clientRowId)
    const criticalTask = criticalTaskById.get(taskId)
    const isCritical = criticalTaskIds.has(taskId)
    return {
      ...row,
      values: {
        ...row.values,
        is_critical: isCritical,
        ...(criticalTask?.floatDays != null ? { total_float_days: criticalTask.floatDays } : {}),
        ...(isCritical ? { free_float_days: 0 } : {}),
      },
    }
  })
}

export async function hydrateScheduleAccelerationRowsWithCriticalPath(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
}) {
  const projectId = normalizeText(params.projectId)
  if (!projectId || params.rows.length === 0) return params.rows
  try {
    const snapshot = await getProjectCriticalPathSnapshot(projectId)
    return applyCriticalPathSnapshotToAccelerationRows(params.rows, snapshot)
  } catch {
    return params.rows
  }
}

function readRowResourceGroup(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const resourceProfile = readRecord(metadata.resourceProfile)
  const resourceClass = normalizeText(
    resourceProfile.resourceClass
      ?? resourceProfile.resource_class
      ?? resourceProfile.primaryResourceClass
      ?? resourceProfile.primary_resource_class,
  ).toLowerCase()
  if (resourceClass) return resourceClass
  const standardWorkCode = normalizeText(metadata.standardWorkCode ?? row.values.standard_work_code).toLowerCase()
  if (standardWorkCode.includes('concrete')) return 'concrete_pour'
  if (standardWorkCode.includes('rebar')) return 'rebar'
  if (standardWorkCode.includes('formwork') || standardWorkCode.includes('模板')) return 'formwork'
  if (standardWorkCode.includes('waterproof')) return 'waterproof'
  if (standardWorkCode.includes('hvac')) return 'hvac'
  if (standardWorkCode.includes('electrical')) return 'electrical'
  const lane = normalizeText(row.executionLane ?? row.values.execution_lane ?? metadata.executionLane).toLowerCase()
  return lane || 'general_crew'
}

function getDependencyAccelerationPriority(dependency: ScheduleAccelerationDependency) {
  const source = normalizeText(dependency.source)
  if (source === 'cross_item_workflow') return 5
  if (source === 'dependency_intent_template') return 4
  if (source === 'sibling_sequence') return 3
  const role = normalizeText(dependency.relationRole)
  if (role === 'workflow' || role === 'handover' || role === 'inspection') return 2
  return 1
}

function getRowAccelerationPriority(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const durationMode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
  const projectionMode = normalizeRowProjectionMode(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadata.rowProjectionMode)
  let score = readGeneratedRowPlanDurationDays(row)
  if (durationMode === 'duration_bearing') score += 30
  if (projectionMode && projectionMode !== 'schedule_row') score -= 50
  if (row.values.is_milestone === true || row.values.is_milestone === 'true') score -= 40
  if (normalizeText(metadata.criticalPathEligible) === 'true' || metadata.criticalPathEligible === true) score += 20
  return score
}

function getRowProcessConstraintEffects(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const effects = readArray(metadata.processConstraintEffects).map((item) => readRecord(item))
  const primary = readRecord(metadata.processConstraintEffect)
  if (normalizeText(primary.constraintType)) effects.unshift(primary)
  const unique = new Map<string, Record<string, unknown>>()
  for (const effect of effects) {
    const key = `${normalizeText(effect.ruleCode)}:${normalizeText(effect.constraintType)}`
    if (key !== ':' && !unique.has(key)) unique.set(key, effect)
  }
  return [...unique.values()]
}

function getHardConstraintReason(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const explicitConstraint = normalizeText(metadata.constraintType ?? metadata.constraint_type)
  if (HARD_CONSTRAINT_TYPES.has(explicitConstraint)) return explicitConstraint
  const effects = getRowProcessConstraintEffects(row)
  return effects
    .map((effect) => normalizeText(effect.constraintType))
    .find((constraintType) => HARD_CONSTRAINT_TYPES.has(constraintType))
    ?? null
}

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function isGateReleased(row: ScheduleAccelerationRow) {
  const metadata = readRowMetadata(row)
  const status = normalizeText(
    row.values.gate_status
      ?? row.values.acceptance_status
      ?? row.values.inspection_status
      ?? metadata.gateStatus
      ?? metadata.gate_status
      ?? metadata.acceptanceStatus
      ?? metadata.acceptance_status
      ?? metadata.inspectionStatus
      ?? metadata.inspection_status,
  ).toLowerCase()
  if (['passed', 'approved', 'accepted', 'completed', 'closed', 'released', 'qualified'].includes(status)) return true
  if (row.values.acceptance_passed === true || row.values.gate_released === true) return true
  if (metadata.acceptancePassed === true || metadata.gateReleased === true) return true
  return false
}

function hasUnreleasedHoldPoint(row: ScheduleAccelerationRow) {
  if (isGateReleased(row)) return false
  const metadata = readRowMetadata(row)
  const title = getGeneratedRowTitle(row)
  const contributionMode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
  const gateRelation = normalizeText(
    row.values.gateRelation
      ?? row.values.gate_relation
      ?? metadata.gateRelation
      ?? metadata.gate_relation
      ?? metadata.internalFlowRelationKind
      ?? metadata.internal_flow_relation_kind,
  ).toLowerCase()
  const controlRoles = readRecord(metadata.controlRoles ?? metadata.control_roles)
  const roleText = [
    metadata.qualityControlRole,
    metadata.quality_control_role,
    metadata.inspectionAcceptanceRole,
    metadata.inspection_acceptance_role,
    metadata.documentEvidenceRole,
    metadata.document_evidence_role,
    controlRoles.qualityControlRole,
    controlRoles.inspectionAcceptanceRole,
    controlRoles.documentEvidenceRole,
  ].map(normalizeText).join(' ').toLowerCase()
  const text = [
    title,
    normalizeText(row.values.standard_work_name),
    normalizeText(row.values.standard_work_code),
    normalizeText(metadata.standardWorkName),
    normalizeText(metadata.standardWorkCode),
    contributionMode,
    gateRelation,
    roleText,
  ].join(' ')

  if (contributionMode === 'quality_gate' || gateRelation === 'acceptance_gate') return true
  if (includesAny(roleText, ['hidden_acceptance', 'acceptance_gate', 'special_acceptance', 'completion_acceptance', 'test_report'])) return true
  return includesAny(text, [
    'hidden_acceptance',
    'concealed',
    'pressure_test',
    'water_test',
    'closure',
    'seal',
    'firestop',
    'quality_gate',
    '隐蔽',
    '试压',
    '水压',
    '闭水',
    '封板',
    '封闭',
    '封堵',
    '验收',
  ])
}

function getCompressibleTargetRows(
  rows: ScheduleAccelerationRow[],
  profileCode = 'general_building',
  calendar?: ConstructionCalendarContext | null,
) {
  return rows
    .filter((row) => (
      isTargetScheduleRow(row)
      && isTargetDurationBearingRow(row)
      && !getHardConstraintReason(row)
      && !hasUnreleasedHoldPoint(row)
      && readGeneratedRowPlanDurationDays(row, calendar) >= 3
    ))
    .sort((left, right) => {
      const criticalDiff = Number(isTargetCriticalCandidate(right, profileCode)) - Number(isTargetCriticalCandidate(left, profileCode))
      if (criticalDiff !== 0) return criticalDiff
      return getRowAccelerationPriority(right) - getRowAccelerationPriority(left)
    })
}

function sumResourceGroupedCandidateDays(rows: ScheduleAccelerationRow[], calendar?: ConstructionCalendarContext | null) {
  const grouped = new Map<string, number>()
  for (const row of rows) {
    const resourceGroup = readRowResourceGroup(row)
    const durationDays = readGeneratedRowPlanDurationDays(row, calendar)
    grouped.set(resourceGroup, Math.max(grouped.get(resourceGroup) ?? 0, durationDays))
  }
  return [...grouped.values()].reduce((sum, days) => sum + days, 0)
}

function getRowCrashRatio(row: ScheduleAccelerationRow, profile: TargetAccelerationBudget) {
  const resourceGroup = readRowResourceGroup(row)
  const resourceCap = SCHEDULE_ACCELERATION_RESOURCE_CRASH_CAP_SEED.find((rule) => (
    rule.resourceGroups.includes(resourceGroup)
  ))?.crashRatioCap ?? SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP
  return Math.max(SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP, Math.min(profile.crashRatio, resourceCap))
}

function estimateRecoverableTargetBudget(params: {
  rows: ScheduleAccelerationRow[]
  naturalStartDate: string | null
  naturalEndDate: string
  overshootDays: number
  context?: ScheduleAccelerationContext
}): TargetAccelerationBudget {
  const scenario = normalizeAccelerationScenario(params.context?.scenario)
  const algorithmFactContext = summarizeAlgorithmFactContext(buildScheduleAccelerationAlgorithmFactContext({
    rows: params.rows,
    scenario,
    context: params.context,
  }))
  const profile = resolveTargetAccelerationProfile(params.rows, params.context)
  const constructionCalendar = resolveScheduleAccelerationCalendar(params.context)
  const naturalDurationDays = Math.max(1, planSpanDays(
    params.naturalStartDate ?? params.naturalEndDate,
    params.naturalEndDate,
    constructionCalendar,
  ))
  const compressibleRows = getCompressibleTargetRows(params.rows, profile.profileCode, constructionCalendar)
  const criticalRows = getCriticalTargetRows(params.rows, profile.profileCode, constructionCalendar)
  const candidateRows = criticalRows.length > 0 ? criticalRows : compressibleRows
  const criticalCandidateDays = candidateRows.reduce((sum, row) => sum + readGeneratedRowPlanDurationDays(row, constructionCalendar), 0)
  const resourceGroupedCandidateDays = sumResourceGroupedCandidateDays(candidateRows, constructionCalendar)
  const hardConstraintDays = params.rows.reduce((sum, row) => (
    getHardConstraintReason(row) ? sum + readGeneratedRowPlanDurationDays(row, constructionCalendar) : sum
  ), 0)
  const naturalFastTrackBudget = Math.round(naturalDurationDays * profile.fastTrackBudgetRatio * profile.seasonalFactor)
  const criticalFastTrackBudgetCap = criticalCandidateDays > 0
    ? Math.max(1, Math.round(criticalCandidateDays * profile.fastTrackBudgetRatio * profile.seasonalFactor))
    : naturalFastTrackBudget
  const fastTrackBudget = Math.min(naturalFastTrackBudget, criticalFastTrackBudgetCap)
  const crashBudget = Math.round(resourceGroupedCandidateDays * profile.crashRatio * profile.seasonalFactor)
  const totalCap = Math.round(naturalDurationDays * profile.totalRecoverCapRatio * profile.seasonalFactor)
  const runtimeAdjustment = scenario === 'runtime_delay_recovery'
    ? resolveRuntimeRecoveryAdjustment(params.context)
    : undefined
  const constructionOrganizationScenario = resolveConstructionOrganizationScenario(params.rows, params.context)
  const constructionOrganizationRecoveryFactor = resolveConstructionOrganizationRecoveryFactor(constructionOrganizationScenario)
  const t2RhythmScheduleEvidence = buildScheduleAccelerationT2RhythmEvidence(params.rows, params.context)
  const conservativeBudget = Math.round(
    Math.max(0, Math.min(totalCap, fastTrackBudget + crashBudget))
      * (runtimeAdjustment?.factor ?? 1)
      * constructionOrganizationRecoveryFactor,
  )
  return {
    recoverableDays: Math.min(params.overshootDays, conservativeBudget),
    naturalDurationDays,
    constructionCalendar,
    algorithmFactContext,
    totalRecoverCapRatio: profile.totalRecoverCapRatio,
    seasonalFactor: profile.seasonalFactor,
    projectTypeProfile: profile.profileCode,
    fastTrackRatio: profile.fastTrackRatio,
    fastTrackBudgetDays: fastTrackBudget,
    fastTrackBudgetRatio: profile.fastTrackBudgetRatio,
    maxFastTrackDays: profile.maxFastTrackDays,
    crashRatio: profile.crashRatio,
    criticalCandidateDays,
    resourceGroupedCandidateDays,
    hardConstraintDays,
    runtimeAdjustment,
    constructionOrganizationScenario,
    constructionOrganizationRecoveryFactor,
    t2RhythmScheduleEvidence,
  }
}

function buildTargetFeasibilityStrategies(params: {
  rows: ScheduleAccelerationRow[]
  overshootDays: number
  recoverableDays: number
  unrecoverableDays: number
  budget: TargetAccelerationBudget
  proposal?: ScheduleAccelerationProposal
}): ScheduleTargetFeasibility['strategies'] {
  if (params.overshootDays <= 0) return []
  if (params.proposal) {
    return params.proposal.actions.map((action) => ({
      type: action.type,
      affectedRowIds: action.affectedRowIds,
      recoverDays: action.recoverDays,
      riskLevel: action.riskLevel,
      explanation: action.explanation,
    }))
  }
  const criticalRows = getCriticalTargetRows(
    params.rows,
    params.budget.projectTypeProfile,
    params.budget.constructionCalendar,
  )
  const durationRows = criticalRows.length > 0
    ? criticalRows
    : getCompressibleTargetRows(
      params.rows,
      params.budget.projectTypeProfile,
      params.budget.constructionCalendar,
    )
  const affectedRowIds = durationRows.slice(0, 12).map((row) => row.clientRowId)
  const fastTrackDays = Math.min(
    params.recoverableDays,
    Math.max(1, params.budget.fastTrackBudgetDays),
  )
  const crashDays = Math.min(
    Math.max(0, params.recoverableDays - fastTrackDays),
    Math.max(1, Math.round(params.budget.resourceGroupedCandidateDays * params.budget.crashRatio * params.budget.seasonalFactor)),
  )
  const remainingDecisionDays = Math.max(params.unrecoverableDays, params.overshootDays - fastTrackDays - crashDays)
  return [
    {
      type: 'fast_track',
      affectedRowIds,
      recoverDays: fastTrackDays,
      riskLevel: params.overshootDays > 90 ? 'medium' : 'low',
      explanation: '优先检查主体、机电、装饰、调试之间可搭接的依赖关系，生成穿插预览，不直接修改任务日期。',
    },
    {
      type: 'crashing',
      affectedRowIds,
      recoverDays: crashDays,
      riskLevel: params.overshootDays > 60 ? 'high' : 'medium',
      explanation: '仅对可压缩的实体施工任务模拟增加资源后的工期下探，养护、检测报告、法定验收等待不压缩。',
    },
    {
      type: 'scope_reduction',
      affectedRowIds: [],
      recoverDays: remainingDecisionDays,
      riskLevel: 'high',
      explanation: '若搭接和赶工仍不足，需要由项目负责人决策减少范围、调整交付批次或修订目标竣工日期。',
    },
  ]
}

function resolveTargetFeasibilityVerdict(params: {
  overshootDays: number
  targetBeforeStart: boolean
  naturalDurationDays: number
  unrecoverableDays: number
}): ScheduleTargetFeasibility['verdict'] {
  return params.overshootDays === 0
    ? 'fit'
    : params.targetBeforeStart
      ? 'infeasible'
      : params.overshootDays <= Math.max(30, Math.round(params.naturalDurationDays * 0.08))
        ? 'tight'
        : params.unrecoverableDays === 0
          ? 'compressible'
          : params.unrecoverableDays <= Math.max(30, Math.round(params.naturalDurationDays * 0.08))
            ? 'requires_scope_change'
            : 'infeasible'
}

function confidenceAdjustedUnrecoverableDays(params: {
  overshootDays: number
  deterministicUnrecoverableDays: number
  recoverableBand?: ScheduleAccelerationConfidenceBand | null
}) {
  const conservativeRecoverableDays = params.recoverableBand?.conservativeDays
  if (conservativeRecoverableDays == null) return params.deterministicUnrecoverableDays
  return Math.max(
    params.deterministicUnrecoverableDays,
    Math.max(0, params.overshootDays - conservativeRecoverableDays),
  )
}

function getGeneratedRowTitle(row: ScheduleAccelerationRow) {
  return normalizeText(row.values.title ?? row.values.name ?? row.clientRowId)
}

function buildTargetProtectedConstraints(rows: ScheduleAccelerationRow[], calendar?: ConstructionCalendarContext | null) {
  return rows
    .map((row) => {
      const reasonCode = getHardConstraintReason(row)
      if (!reasonCode) return null
      return {
        clientRowId: row.clientRowId,
        title: getGeneratedRowTitle(row),
        reasonCode,
        durationDays: readGeneratedRowPlanDurationDays(row, calendar),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12)
}

function buildFastTrackProposalAction(params: {
  rows: ScheduleAccelerationRow[]
  recoverBudgetDays: number
  overshootDays: number
  profile: TargetAccelerationBudget
}): Extract<ScheduleAccelerationProposalAction, { type: 'fast_track' }> {
  const rowById = new Map(params.rows.map((row) => [row.clientRowId, row]))
  const rawDependencyAdjustments = params.rows
    .flatMap((row) => row.predecessorDependencies.map((dependency) => ({ row, dependency })))
    .filter(({ row, dependency }) => {
      if (getHardConstraintReason(row)) return false
      if (dependency.dependencyType !== 'FS' && dependency.dependencyType !== 'SS') return false
      const predecessor = rowById.get(dependency.clientRowId)
      if (predecessor && getHardConstraintReason(predecessor)) return false
      if (hasUnreleasedHoldPoint(row) || (predecessor && hasUnreleasedHoldPoint(predecessor))) return false
      return getDependencyAccelerationPriority(dependency) >= 2
    })
    .sort((left, right) => (
      (getDependencyAccelerationPriority(right.dependency) * 100 + getRowAccelerationPriority(right.row))
      - (getDependencyAccelerationPriority(left.dependency) * 100 + getRowAccelerationPriority(left.row))
    ))
    .slice(0, 8)
    .map(({ row, dependency }) => {
      const currentLag = Number(dependency.lagDays ?? 0) || 0
      const overlapDays = Math.max(1, Math.min(
        params.profile.maxFastTrackDays,
        Math.ceil(readGeneratedRowPlanDurationDays(row, params.profile.constructionCalendar) * params.profile.fastTrackRatio * params.profile.seasonalFactor),
      ))
      return {
        predecessorClientRowId: dependency.clientRowId,
        successorClientRowId: row.clientRowId,
        fromDependencyType: dependency.dependencyType,
        toDependencyType: 'SS' as const,
        lagDaysBefore: currentLag,
        lagDaysAfter: Math.min(currentLag, 0) - overlapDays,
      }
    })

  const rawRecoverDays = rawDependencyAdjustments.reduce((sum, item) => (
    sum + Math.max(1, item.lagDaysBefore - item.lagDaysAfter)
  ), 0)
  const budgetedRecoverDays = Math.min(params.recoverBudgetDays, rawRecoverDays)
  const reworkRiskRatio = rawRecoverDays >= 8
    ? 0.3
    : rawDependencyAdjustments.length >= 2
      ? 0.25
      : 0.2
  const budgetDiscountDays = budgetedRecoverDays > 0
    ? Math.min(budgetedRecoverDays, Math.max(1, Math.ceil(budgetedRecoverDays * reworkRiskRatio)))
    : 0
  const effectiveRecoverDays = Math.max(
    rawDependencyAdjustments.length > 0 ? 1 : 0,
    budgetedRecoverDays - budgetDiscountDays,
  )
  let remainingEffectiveRecoverDays = effectiveRecoverDays
  const dependencyAdjustments = rawDependencyAdjustments.map((item) => {
    const itemRawRecoverDays = Math.max(1, item.lagDaysBefore - item.lagDaysAfter)
    const itemEffectiveRecoverDays = remainingEffectiveRecoverDays > 0
      ? Math.min(itemRawRecoverDays, Math.max(1, remainingEffectiveRecoverDays))
      : 0
    remainingEffectiveRecoverDays = Math.max(0, remainingEffectiveRecoverDays - itemEffectiveRecoverDays)
    return {
      ...item,
      effectiveLagDaysAfter: item.lagDaysBefore - itemEffectiveRecoverDays,
      rawRecoverDays: itemRawRecoverDays,
      effectiveRecoverDays: itemEffectiveRecoverDays,
      reworkRiskDiscountDays: Math.max(0, itemRawRecoverDays - itemEffectiveRecoverDays),
    }
  })

  const affectedRowIds = uniqueStringArray(dependencyAdjustments.flatMap((item) => [
    item.predecessorClientRowId,
    item.successorClientRowId,
  ])).slice(0, 16)
  return {
    type: 'fast_track',
    affectedRowIds,
    recoverDays: effectiveRecoverDays,
    rawRecoverDays,
    reworkRiskDiscountDays: Math.max(0, rawRecoverDays - effectiveRecoverDays),
    effectiveRecoverDays,
    riskLevel: params.overshootDays > 90 || budgetDiscountDays > 0 ? 'medium' : 'low',
    explanation: '优先选择模板显式依赖中的主线衔接和可分区移交关系，预览把部分前后置关系改为穿插搭接；这里只生成草案，不自动改任务日期。',
    dependencyAdjustments,
  }
}

function buildCrashingProposalAction(params: {
  rows: ScheduleAccelerationRow[]
  recoverBudgetDays: number
  overshootDays: number
  profile: TargetAccelerationBudget
}): Extract<ScheduleAccelerationProposalAction, { type: 'crashing' }> {
  const criticalRows = getCriticalTargetRows(
    params.rows,
    params.profile.projectTypeProfile,
    params.profile.constructionCalendar,
  )

  const rawCandidates = criticalRows
    .slice(0, 12)
    .map((row) => {
      const currentDurationDays = readGeneratedRowPlanDurationDays(row, params.profile.constructionCalendar)
      const suggestion = readRecord(row.durationSuggestion ?? row.values.duration_suggestion)
      const governedReferenceDays = readGovernedDurationSuggestionDays(suggestion)
      const governedCrashFloorDays = readGovernedDurationCrashFloorDays(suggestion)
      const minFromSuggestion = governedCrashFloorDays != null
        ? Math.min(currentDurationDays, governedCrashFloorDays)
        : governedReferenceDays != null
        ? Math.max(1, Math.floor(governedReferenceDays * 0.8))
        : null
      const rowCrashRatio = getRowCrashRatio(row, params.profile)
      const minDurationDays = Math.max(1, minFromSuggestion ?? Math.floor(currentDurationDays * (1 - rowCrashRatio)))
      const proposedDurationDays = Math.max(
        minDurationDays,
        currentDurationDays - Math.max(1, Math.round(currentDurationDays * rowCrashRatio * params.profile.seasonalFactor)),
      )
      return {
        row,
        resourceGroup: readRowResourceGroup(row),
        clientRowId: row.clientRowId,
        currentDurationDays,
        proposedDurationDays,
        minDurationDays,
        recoverDays: Math.max(0, currentDurationDays - proposedDurationDays),
        basis: 'resource_crash_preview' as const,
      }
    })
    .filter((item) => item.recoverDays > 0)

  const byResourceGroup = new Map<string, typeof rawCandidates>()
  for (const candidate of rawCandidates) {
    byResourceGroup.set(candidate.resourceGroup, [
      ...(byResourceGroup.get(candidate.resourceGroup) ?? []),
      candidate,
    ])
  }

  const bestRawCandidateByOtherGroup = (excludedGroup: string) => [...byResourceGroup.entries()]
    .filter(([group]) => group !== excludedGroup)
    .map(([, candidates]) => [...candidates].sort((left, right) => right.recoverDays - left.recoverDays)[0])
    .filter((candidate): candidate is typeof rawCandidates[number] => Boolean(candidate))

  const toDurationAdjustments = (candidates: typeof rawCandidates) => candidates.map((candidate) => ({
    clientRowId: candidate.clientRowId,
    currentDurationDays: candidate.currentDurationDays,
    proposedDurationDays: candidate.proposedDurationDays,
    minDurationDays: candidate.minDurationDays,
    recoverDays: candidate.recoverDays,
    basis: candidate.basis,
  }))

  const networkRecoverDaysForCandidates = (candidates: typeof rawCandidates) => {
    if (candidates.length === 0) return 0
    const draft = buildTargetRescheduleDraft({
      rows: params.rows,
      actions: [{
        type: 'crashing',
        affectedRowIds: candidates.map((candidate) => candidate.clientRowId),
        recoverDays: candidates.reduce((sum, candidate) => sum + candidate.recoverDays, 0),
        riskLevel: params.overshootDays > 60 ? 'high' : 'medium',
        explanation: '',
        durationAdjustments: toDurationAdjustments(candidates),
      }],
      calendar: params.profile.constructionCalendar,
    })
    return estimateNetworkRecoverDaysFromDraft({
      rows: params.rows,
      draft,
      calendar: params.profile.constructionCalendar,
    }) ?? 0
  }

  const selectedCandidates = [...byResourceGroup.entries()]
    .map(([group, candidates]) => {
      const otherGroupCandidates = bestRawCandidateByOtherGroup(group)
      return [...candidates]
        .map((candidate) => ({
          candidate,
          networkRecoverDays: networkRecoverDaysForCandidates([candidate, ...otherGroupCandidates]),
        }))
        .sort((left, right) => {
          const networkDiff = right.networkRecoverDays - left.networkRecoverDays
          if (networkDiff !== 0) return networkDiff
          return right.candidate.recoverDays - left.candidate.recoverDays
        })[0]?.candidate ?? null
    })
    .filter((candidate): candidate is typeof rawCandidates[number] => Boolean(candidate))

  const hasResourceChoice = [...byResourceGroup.values()].some((candidates) => candidates.length > 1)
  const selectedNetworkRecoverDays = networkRecoverDaysForCandidates(selectedCandidates)
  const effectiveCandidates = selectedNetworkRecoverDays > 0 || !hasResourceChoice ? selectedCandidates : []
  const durationAdjustments = toDurationAdjustments(effectiveCandidates)
  const rawRecoverDays = durationAdjustments.reduce((sum, item) => sum + item.recoverDays, 0)
  const recoverDays = Math.min(params.recoverBudgetDays, rawRecoverDays, selectedNetworkRecoverDays)
  const networkSlackFacts = buildNetworkSlackFacts({
    rows: params.rows,
    rawCandidateRecoverDays: rawRecoverDays,
    selectedNetworkRecoverDays,
    effectiveRecoverDays: recoverDays,
  })
  return {
    type: 'crashing',
    affectedRowIds: durationAdjustments.map((item) => item.clientRowId),
    recoverDays,
    riskLevel: params.overshootDays > 60 ? 'high' : 'medium',
    explanation: '仅对 duration_bearing 的实体施工/安装任务做资源赶工预览，养护、检测报告、法定验收等待等硬约束保持不压缩。',
    durationAdjustments,
    networkSlackFacts,
  }
}

function buildTargetRescheduleDraft(params: {
  rows: ScheduleAccelerationRow[]
  actions: ScheduleAccelerationProposalAction[]
  calendar?: ConstructionCalendarContext | null
}): ScheduleAccelerationRescheduleDraft | undefined {
  const rowById = new Map(params.rows.map((row) => [row.clientRowId, row]))
  const fastTrack = params.actions.find((action): action is Extract<ScheduleAccelerationProposalAction, { type: 'fast_track' }> => action.type === 'fast_track')
  const crashing = params.actions.find((action): action is Extract<ScheduleAccelerationProposalAction, { type: 'crashing' }> => action.type === 'crashing')
  const resourceAdjustments = crashing?.durationAdjustments ?? []

  const taskDateAdjustments = resourceAdjustments
    .map((adjustment) => {
      const row = rowById.get(adjustment.clientRowId)
      if (!row) return null

      const currentStartDate = readGeneratedRowPlanStart(row)
      const currentEndDate = readGeneratedRowPlanEnd(row)
      const proposedStartDate = currentStartDate
      const proposedEndDate = currentStartDate
        ? addPlanDays(currentStartDate, Math.max(0, adjustment.proposedDurationDays - 1), params.calendar)
        : currentEndDate
      const changedFields = [
        proposedStartDate !== currentStartDate ? 'planned_start_date' : null,
        proposedEndDate !== currentEndDate ? 'planned_end_date' : null,
      ].filter((item): item is string => Boolean(item))

      if (changedFields.length === 0 && adjustment.recoverDays <= 0) return null

      const durationDeltaDays = adjustment.proposedDurationDays - adjustment.currentDurationDays
      const startDeltaDays = scheduleShiftDays(currentStartDate, proposedStartDate, params.calendar)
      const endDeltaDays = scheduleShiftDays(currentEndDate, proposedEndDate, params.calendar)
      return {
        clientRowId: adjustment.clientRowId,
        title: getGeneratedRowTitle(row),
        currentStartDate,
        currentEndDate,
        proposedStartDate,
        proposedEndDate,
        currentDurationDays: adjustment.currentDurationDays,
        proposedDurationDays: adjustment.proposedDurationDays,
        recoverDays: adjustment.recoverDays,
        reschedulePolicy: 'resource_crash_preview' as const,
        changedFields,
        visualDiff: {
          durationDeltaDays,
          startDeltaDays,
          endDeltaDays,
          barDeltaKind: durationDeltaDays < 0
            ? 'compressed' as const
            : (startDeltaDays !== 0 || endDeltaDays !== 0 ? 'shifted' as const : 'unchanged' as const),
        },
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const dependencyAdjustments = fastTrack?.dependencyAdjustments ?? []
  const taskDateAdjustmentById = new Map(taskDateAdjustments.map((adjustment) => [adjustment.clientRowId, adjustment]))
  const dependencyPropagationAdjustments = dependencyAdjustments
    .map((adjustment) => {
      const row = rowById.get(adjustment.successorClientRowId)
      if (!row || taskDateAdjustmentById.has(adjustment.successorClientRowId)) return null

      const currentStartDate = readGeneratedRowPlanStart(row)
      const currentEndDate = readGeneratedRowPlanEnd(row)
      if (!currentStartDate || !currentEndDate) return null

      const predecessorAdjustment = taskDateAdjustmentById.get(adjustment.predecessorClientRowId)
      const predecessorRecoverDays = predecessorAdjustment
        ? Math.max(0, -predecessorAdjustment.visualDiff.endDeltaDays)
        : 0
      const dependencyRecoverDays = Math.max(0, adjustment.effectiveRecoverDays)
      const recoverDays = Math.max(0, predecessorRecoverDays + dependencyRecoverDays)
      if (recoverDays <= 0) return null

      const currentDurationDays = readGeneratedRowPlanDurationDays(row, params.calendar)
      const proposedStartDate = shiftPlanDate(currentStartDate, -recoverDays, params.calendar)
      const proposedEndDate = proposedStartDate
        ? addPlanDays(proposedStartDate, Math.max(0, currentDurationDays - 1), params.calendar)
        : currentEndDate
      const changedFields = [
        proposedStartDate !== currentStartDate ? 'planned_start_date' : null,
        proposedEndDate !== currentEndDate ? 'planned_end_date' : null,
      ].filter((item): item is string => Boolean(item))
      if (changedFields.length === 0) return null

      const startDeltaDays = scheduleShiftDays(currentStartDate, proposedStartDate, params.calendar)
      const endDeltaDays = scheduleShiftDays(currentEndDate, proposedEndDate, params.calendar)
      return {
        clientRowId: adjustment.successorClientRowId,
        title: getGeneratedRowTitle(row),
        currentStartDate,
        currentEndDate,
        proposedStartDate,
        proposedEndDate,
        currentDurationDays,
        proposedDurationDays: currentDurationDays,
        recoverDays,
        reschedulePolicy: 'dependency_propagation_preview' as const,
        changedFields,
        visualDiff: {
          durationDeltaDays: 0,
          startDeltaDays,
          endDeltaDays,
          barDeltaKind: 'shifted' as const,
        },
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const allTaskDateAdjustments = [...taskDateAdjustments, ...dependencyPropagationAdjustments]
  if (allTaskDateAdjustments.length === 0 && dependencyAdjustments.length === 0) return undefined

  return {
    mode: 'proposal_review',
    source: 'target_end_compression',
    writePolicy: 'requires_user_acceptance',
    taskDateAdjustments: allTaskDateAdjustments,
    dependencyAdjustments,
    resourceAdjustments,
    operations: allTaskDateAdjustments.map((adjustment) => ({
      type: 'update',
      clientRowId: adjustment.clientRowId,
      values: {
        ...(adjustment.proposedStartDate && adjustment.proposedStartDate !== adjustment.currentStartDate
          ? { planned_start_date: adjustment.proposedStartDate }
          : {}),
        ...(adjustment.proposedEndDate && adjustment.proposedEndDate !== adjustment.currentEndDate
          ? { planned_end_date: adjustment.proposedEndDate }
          : {}),
        duration_reschedule_source: 'target_end_compression',
        duration_reschedule_policy: adjustment.reschedulePolicy,
        duration_reschedule_recover_days: adjustment.recoverDays,
        duration_reschedule_current_duration_days: adjustment.currentDurationDays,
        duration_reschedule_proposed_duration_days: adjustment.proposedDurationDays,
      },
    })),
  }
}

function latestPlanDate(dates: Array<string | null>) {
  return dates
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
    .at(-1) ?? null
}

function getDependencyKey(predecessorClientRowId: string, successorClientRowId: string) {
  return `${predecessorClientRowId}::${successorClientRowId}`
}

function getNetworkDependencyStartConstraint(params: {
  predecessor: { start: string; end: string }
  dependency: ScheduleAccelerationDependency
  successorDurationDays: number
  calendar?: ConstructionCalendarContext | null
}) {
  const lagDays = Math.round(Number(params.dependency.lagDays ?? 0) || 0)
  switch (params.dependency.dependencyType) {
    case 'SS':
      return shiftPlanDate(params.predecessor.start, lagDays, params.calendar)
    case 'FF':
      return shiftPlanDate(params.predecessor.end, lagDays - Math.max(0, params.successorDurationDays - 1), params.calendar)
    case 'SF':
      return shiftPlanDate(params.predecessor.start, lagDays - Math.max(0, params.successorDurationDays - 1), params.calendar)
    case 'FS':
    default:
      return shiftPlanDate(params.predecessor.end, lagDays + 1, params.calendar)
  }
}

function evaluateAccelerationNetworkTerminalFinish(params: {
  rows: ScheduleAccelerationRow[]
  draft?: ScheduleAccelerationRescheduleDraft
  proposed: boolean
  calendar?: ConstructionCalendarContext | null
}) {
  const rowById = new Map(params.rows.map((row) => [row.clientRowId, row]))
  const proposedDurationByRowId = new Map<string, number>()
  const proposedDependencyByEdge = new Map<string, ScheduleAccelerationDependency>()
  if (params.proposed && params.draft) {
    for (const adjustment of params.draft.resourceAdjustments) {
      proposedDurationByRowId.set(adjustment.clientRowId, adjustment.proposedDurationDays)
    }
    for (const adjustment of params.draft.dependencyAdjustments) {
      proposedDependencyByEdge.set(
        getDependencyKey(adjustment.predecessorClientRowId, adjustment.successorClientRowId),
        {
          clientRowId: adjustment.predecessorClientRowId,
          dependencyType: adjustment.toDependencyType,
          lagDays: adjustment.effectiveLagDaysAfter,
          relationRole: 'workflow',
          source: 'schedule_acceleration_preview',
        },
      )
    }
  }

  const resolved = new Map<string, { start: string; end: string }>()
  const resolving = new Set<string>()

  const resolveNode = (clientRowId: string): { start: string; end: string } | null => {
    const cached = resolved.get(clientRowId)
    if (cached) return cached
    if (resolving.has(clientRowId)) return null
    const row = rowById.get(clientRowId)
    if (!row) return null
    const fallbackStart = readGeneratedRowPlanStart(row)
    const fallbackEnd = readGeneratedRowPlanEnd(row)
    if (!fallbackStart || !fallbackEnd) return null
    resolving.add(clientRowId)

    const durationDays = Math.max(
      1,
      Math.round(proposedDurationByRowId.get(clientRowId) ?? readGeneratedRowPlanDurationDays(row, params.calendar)),
    )
    const dependencyStartConstraints = row.predecessorDependencies
      .map((dependency) => {
        const predecessor = resolveNode(dependency.clientRowId)
        if (!predecessor) return null
        const proposedDependency = proposedDependencyByEdge.get(getDependencyKey(dependency.clientRowId, clientRowId))
        return getNetworkDependencyStartConstraint({
          predecessor,
          dependency: proposedDependency ?? dependency,
          successorDurationDays: durationDays,
          calendar: params.calendar,
        })
      })
      .filter((date): date is string => Boolean(date))

    const start = dependencyStartConstraints.length > 0
      ? latestPlanDate(dependencyStartConstraints)
      : fallbackStart
    const end = start ? addPlanDays(start, Math.max(0, durationDays - 1), params.calendar) : fallbackEnd
    resolving.delete(clientRowId)
    if (!start || !end) return null
    const result = { start, end }
    resolved.set(clientRowId, result)
    return result
  }

  const terminalFinish = latestPlanDate(params.rows.map((row) => resolveNode(row.clientRowId)?.end ?? null))
  return terminalFinish
}

function estimateNetworkRecoverDaysFromDraft(params: {
  rows: ScheduleAccelerationRow[]
  draft?: ScheduleAccelerationRescheduleDraft
  calendar?: ConstructionCalendarContext | null
}) {
  if (!params.draft?.operations?.length) return null
  const baselineTerminalFinish = evaluateAccelerationNetworkTerminalFinish({
    rows: params.rows,
    proposed: false,
    calendar: params.calendar,
  })
  const proposedTerminalFinish = evaluateAccelerationNetworkTerminalFinish({
    rows: params.rows,
    draft: params.draft,
    proposed: true,
    calendar: params.calendar,
  })
  if (!baselineTerminalFinish || !proposedTerminalFinish) return null
  return Math.max(0, scheduleShiftDays(proposedTerminalFinish, baselineTerminalFinish, params.calendar))
}

function estimateTerminalRecoverDaysFromDraft(params: {
  rows: ScheduleAccelerationRow[]
  draft?: ScheduleAccelerationRescheduleDraft
  naturalEndDate: string
  rawRecoverDays: number
  calendar?: ConstructionCalendarContext | null
}) {
  const discountedRawRecoverDays = Math.max(0, Math.ceil(params.rawRecoverDays * 0.75))
  if (!params.draft?.operations?.length) {
    return {
      recoverDays: discountedRawRecoverDays,
      networkFallbackPolicy: 'conservative_discounted_raw_recovery' as const,
    }
  }

  const networkRecoverDays = estimateNetworkRecoverDaysFromDraft({
    rows: params.rows,
    draft: params.draft,
    calendar: params.calendar,
  })
  if (networkRecoverDays !== null) {
    return {
      recoverDays: Math.min(params.rawRecoverDays, networkRecoverDays),
      networkFallbackPolicy: 'network_terminal_delta' as const,
    }
  }

  const proposedEndByRowId = new Map<string, string>()
  for (const operation of params.draft.operations) {
    const proposedEndDate = normalizeDate(operation.values.planned_end_date)
    if (proposedEndDate) proposedEndByRowId.set(operation.clientRowId, proposedEndDate)
  }
  if (proposedEndByRowId.size === 0) {
    return {
      recoverDays: discountedRawRecoverDays,
      networkFallbackPolicy: 'conservative_discounted_raw_recovery' as const,
    }
  }

  const projectedEndDate = params.rows
    .map((row) => proposedEndByRowId.get(row.clientRowId) ?? readGeneratedRowPlanEnd(row))
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
    .at(-1) ?? null
  if (!projectedEndDate) {
    return {
      recoverDays: discountedRawRecoverDays,
      networkFallbackPolicy: 'conservative_discounted_raw_recovery' as const,
    }
  }

  const terminalRecoverDays = Math.max(0, scheduleShiftDays(projectedEndDate, params.naturalEndDate, params.calendar))
  return {
    recoverDays: Math.min(params.rawRecoverDays, terminalRecoverDays),
    networkFallbackPolicy: 'projected_terminal_delta' as const,
  }
}

function buildRecoverableDaysConfidenceBand(
  expectedDays: number,
  networkFallbackPolicy?: ScheduleAccelerationNetworkFallbackPolicy | null,
): ScheduleAccelerationConfidenceBand {
  const uncertaintyRatio = networkFallbackPolicy === 'conservative_discounted_raw_recovery' ? 0.3 : 0.15
  return {
    optimisticDays: Math.max(expectedDays, Math.ceil(expectedDays * (1 + uncertaintyRatio))),
    expectedDays,
    conservativeDays: Math.max(0, Math.floor(expectedDays * (1 - uncertaintyRatio))),
    basis: 'schedule_acceleration_uncertainty_band',
    networkFallbackPolicy: networkFallbackPolicy ?? null,
  }
}

function buildAccelerationTargetConfidenceBand(params: {
  naturalDurationDays: number
  accelerationTargetDays: number
  recoverableBand: ScheduleAccelerationConfidenceBand
}): ScheduleAccelerationConfidenceBand {
  return {
    optimisticDays: Math.max(1, params.naturalDurationDays - params.recoverableBand.optimisticDays),
    expectedDays: params.accelerationTargetDays,
    conservativeDays: Math.max(1, params.naturalDurationDays - params.recoverableBand.conservativeDays),
    basis: 'schedule_acceleration_target_uncertainty_band',
    networkFallbackPolicy: params.recoverableBand.networkFallbackPolicy ?? null,
  }
}

function buildTargetAccelerationProposal(params: {
  rows: ScheduleAccelerationRow[]
  scenario: ScheduleAccelerationScenario
  targetEndDate: string
  naturalEndDate: string
  overshootDays: number
  recoverableDays: number
  unrecoverableDays: number
  verdict: ScheduleTargetFeasibility['verdict']
  budget: TargetAccelerationBudget
}): ScheduleAccelerationProposal | undefined {
  if (params.overshootDays <= 0) return undefined
  const seededFastTrackBudget = Math.max(0, Math.min(
    params.recoverableDays,
    Math.round(params.budget.fastTrackBudgetDays),
  ))
  const fastTrackBudget = seededFastTrackBudget > 0
    ? seededFastTrackBudget
    : Math.max(0, Math.round(params.recoverableDays * params.budget.fastTrackBudgetRatio))
  const fastTrack = buildFastTrackProposalAction({
    rows: params.rows,
    recoverBudgetDays: fastTrackBudget,
    overshootDays: params.overshootDays,
    profile: params.budget,
  })
  const crashBudget = Math.max(0, params.recoverableDays - fastTrack.recoverDays)
  const crashing = buildCrashingProposalAction({
    rows: params.rows,
    recoverBudgetDays: crashBudget,
    overshootDays: params.overshootDays,
    profile: params.budget,
  })
  const fallbackRecoverDays = fastTrack.recoverDays + crashing.recoverDays > 0
    ? 0
    : Math.min(params.overshootDays, Math.max(0, params.recoverableDays))
  const rawRecoverDays = Math.min(params.overshootDays, fastTrack.recoverDays + crashing.recoverDays + fallbackRecoverDays)
  const draftActions: ScheduleAccelerationProposalAction[] = [fastTrack, crashing]
  const rescheduleDraft = buildTargetRescheduleDraft({
    rows: params.rows,
    actions: draftActions,
    calendar: params.budget.constructionCalendar,
  })
  const terminalRecovery = estimateTerminalRecoverDaysFromDraft({
    rows: params.rows,
    draft: rescheduleDraft,
    naturalEndDate: params.naturalEndDate,
    rawRecoverDays,
    calendar: params.budget.constructionCalendar,
  })
  const totalRecoverDays = terminalRecovery.recoverDays
  const remainingGapDays = Math.max(0, params.overshootDays - totalRecoverDays)
  const effectiveRescheduleDraft = totalRecoverDays > 0 ? rescheduleDraft : undefined
  const durationOutputContract = buildDurationOutputContractSummary('acceleration_target')
  const accelerationTargetDays = Math.max(1, params.budget.naturalDurationDays - totalRecoverDays)
  const recoverableDaysConfidenceBand = buildRecoverableDaysConfidenceBand(
    totalRecoverDays,
    terminalRecovery.networkFallbackPolicy,
  )
  const confidenceRemainingGapDays = confidenceAdjustedUnrecoverableDays({
    overshootDays: params.overshootDays,
    deterministicUnrecoverableDays: remainingGapDays,
    recoverableBand: recoverableDaysConfidenceBand,
  })
  const accelerationTargetConfidenceBand = buildAccelerationTargetConfidenceBand({
    naturalDurationDays: params.budget.naturalDurationDays,
    accelerationTargetDays,
    recoverableBand: recoverableDaysConfidenceBand,
  })
  const effectiveFastTrackRecoverDays = Math.min(fastTrack.recoverDays, totalRecoverDays)
  const effectiveCrashingRecoverDays = Math.min(
    fallbackRecoverDays > 0 ? fallbackRecoverDays : crashing.recoverDays,
    Math.max(0, totalRecoverDays - effectiveFastTrackRecoverDays),
  )
  const effectiveFastTrack = {
    ...fastTrack,
    recoverDays: effectiveFastTrackRecoverDays,
  }
  const effectiveCrashing = {
    ...crashing,
    recoverDays: effectiveCrashingRecoverDays,
  }
  const actions: ScheduleAccelerationProposalAction[] = [
    effectiveFastTrack,
    fallbackRecoverDays > 0
      ? {
        ...effectiveCrashing,
        recoverDays: effectiveCrashingRecoverDays,
        explanation: `${crashing.explanation} 当前模板片段缺少足够的显式可调依赖或长工序，先按项目级资源赶工预算形成预览，应用前必须由负责人指定具体任务。`,
      }
      : effectiveCrashing,
    {
      type: 'scope_reduction',
      affectedRowIds: [],
      recoverDays: remainingGapDays,
      riskLevel: 'high',
      explanation: remainingGapDays > 0
        ? '搭接和资源赶工预览后仍存在缺口，需要项目负责人决策交付范围、分批交付、增加施工面或修订目标日期。'
        : '当前缺口可通过搭接和资源赶工草案覆盖；范围调整保留为兜底决策项，待负责人确认。',
      decisionOptions: [
        '按楼栋、楼层或业态分批交付',
        '减少非关键专项或后置低优先级范围',
        '增加施工面、班组或关键资源投入',
        '修订目标竣工日期并重新比对自然排期',
      ],
    },
  ]
  return {
    mode: 'preview_only',
    source: 'target_end_compression',
    targetEndDate: params.targetEndDate,
    naturalEndDate: params.naturalEndDate,
    overshootDays: params.overshootDays,
    totalRecoverDays,
    remainingGapDays,
    durationOutputCode: 'acceleration_target',
    durationOutputSemanticFieldName: durationOutputContract?.semanticFieldName ?? 'accelerationTargetDays',
    durationOutputContract,
    accelerationTargetDays,
    recoverableDaysConfidenceBand,
    accelerationTargetConfidenceBand,
    verdict: remainingGapDays === 0 && confidenceRemainingGapDays === 0
      ? 'draft_recoverable'
      : params.verdict === 'infeasible'
        ? 'infeasible'
        : 'needs_scope_decision',
    commitmentDisclaimer: '预案默认来源于模板和算法估算，实际可追回时间需结合现场资源到位、协同施工约束和项目事实复核。',
    actions,
    rescheduleDraft: effectiveRescheduleDraft,
    protectedConstraints: buildTargetProtectedConstraints(params.rows, params.budget.constructionCalendar),
    calculationBasis: {
      scenario: params.scenario,
      algorithmFactContext: params.budget.algorithmFactContext,
      naturalDurationDays: params.budget.naturalDurationDays,
      totalRecoverCapRatio: params.budget.totalRecoverCapRatio,
      seasonalFactor: params.budget.seasonalFactor,
      projectTypeProfile: params.budget.projectTypeProfile,
      criticalCandidateDays: params.budget.criticalCandidateDays,
      resourceGroupedCandidateDays: params.budget.resourceGroupedCandidateDays,
      hardConstraintDays: params.budget.hardConstraintDays,
      constructionOrganizationScenario: summarizeConstructionOrganizationScenario(params.budget.constructionOrganizationScenario),
      constructionOrganizationRecoveryFactor: params.budget.constructionOrganizationRecoveryFactor,
      fastTrackBudgetDays: params.budget.fastTrackBudgetDays,
      fastTrackBudgetRatio: params.budget.fastTrackBudgetRatio,
      policySource: SCHEDULE_ACCELERATION_PROFILE_SOURCE,
      runtimeContext: params.budget.runtimeAdjustment?.summary,
      t2RhythmScheduleEvidence: params.budget.t2RhythmScheduleEvidence,
      networkFallbackPolicy: terminalRecovery.networkFallbackPolicy,
    },
  }
}

function evaluateScheduleTargetFeasibilityInternal(params: {
  rows: ScheduleAccelerationRow[]
  targetEndDate: string | null | undefined
  scenario?: ScheduleAccelerationScenario
  mode?: ScheduleAccelerationMode
  context?: ScheduleAccelerationContext
}): ScheduleTargetFeasibility | undefined {
  const targetEndDate = normalizeDate(params.targetEndDate)
  if (!targetEndDate || params.rows.length === 0) return undefined
  const scenario = params.scenario ?? params.context?.scenario ?? 'baseline_target_alignment'
  const comparableRows = rowsForTargetFeasibility(params.rows)
  const runtimeForecastFinishDate = scenario === 'runtime_delay_recovery'
    ? normalizeDate(params.context?.runtime?.projectRemainingForecastFinishDate)
    : null
  const naturalEndDate = runtimeForecastFinishDate ?? getGeneratedRowsLatestEnd(comparableRows)
  if (!naturalEndDate) return undefined
  const calendar = resolveScheduleAccelerationCalendar(params.context)
  const overshootDays = Math.max(0, signedDurationDayDelta(targetEndDate, naturalEndDate) ?? 0)
  const productionOvershootDays = Math.max(0, scheduleShiftDays(targetEndDate, naturalEndDate, calendar))
  const asOf = normalizeDate(params.context?.asOfDate) ?? businessDateKey(new Date(), calendar?.timezone)
  const naturalStartDate = getGeneratedRowsEarliestStart(comparableRows)
  const budget = estimateRecoverableTargetBudget({
    rows: comparableRows,
    naturalStartDate,
    naturalEndDate,
    overshootDays: productionOvershootDays,
    context: {
      ...params.context,
      scenario: params.scenario ?? params.context?.scenario,
    },
  })
  const recoverableBudgetDays = productionOvershootDays > 0 ? budget.recoverableDays : 0
  const naturalDurationDays = Math.max(1, planSpanDays(
    naturalStartDate ?? naturalEndDate,
    naturalEndDate,
    budget.constructionCalendar,
  ))
  const targetBeforeStart = naturalStartDate ? comparePlanDates(targetEndDate, naturalStartDate) < 0 : false
  const preliminaryUnrecoverableDays = Math.max(0, productionOvershootDays - recoverableBudgetDays)
  const preliminaryVerdict = resolveTargetFeasibilityVerdict({
    overshootDays: productionOvershootDays,
    targetBeforeStart,
    naturalDurationDays,
    unrecoverableDays: preliminaryUnrecoverableDays,
  })
  const accelerationProposal = buildTargetAccelerationProposal({
    rows: comparableRows,
    scenario,
    targetEndDate,
    naturalEndDate,
    overshootDays: productionOvershootDays,
    recoverableDays: recoverableBudgetDays,
    unrecoverableDays: preliminaryUnrecoverableDays,
    verdict: preliminaryVerdict,
    budget,
  })
  const recoverableDays = accelerationProposal
    ? accelerationProposal.totalRecoverDays
    : recoverableBudgetDays
  const unrecoverableDays = Math.max(0, productionOvershootDays - recoverableDays)
  const recoverableDaysConfidenceBand = accelerationProposal?.recoverableDaysConfidenceBand
    ?? buildRecoverableDaysConfidenceBand(recoverableDays, null)
  const verdictUnrecoverableDays = confidenceAdjustedUnrecoverableDays({
    overshootDays: productionOvershootDays,
    deterministicUnrecoverableDays: unrecoverableDays,
    recoverableBand: recoverableDaysConfidenceBand,
  })
  const verdict = resolveTargetFeasibilityVerdict({
    overshootDays: productionOvershootDays,
    targetBeforeStart,
    naturalDurationDays,
    unrecoverableDays: verdictUnrecoverableDays,
  })
  const overshoot = buildCalendarDayDurationMetric(overshootDays, {
    asOf,
    timezone: calendar?.timezone,
  })
  const recoverable = buildConstructionProductionDayDurationMetric(recoverableDays, {
    asOf,
    timezone: calendar?.timezone,
    calendar,
  })
  const unrecoverable = buildConstructionProductionDayDurationMetric(unrecoverableDays, {
    asOf,
    timezone: calendar?.timezone,
    calendar,
  })
  const productionDuration = (value: number | null | undefined) => (
    buildConstructionProductionDayDurationMetric(value, {
      asOf,
      timezone: calendar?.timezone,
      calendar,
    })
  )
  const durationAdjustmentWithMetrics = (
    adjustment: Extract<ScheduleAccelerationProposalAction, { type: 'crashing' }>['durationAdjustments'][number],
  ) => ({
    ...adjustment,
    currentDuration: productionDuration(adjustment.currentDurationDays),
    proposedDuration: productionDuration(adjustment.proposedDurationDays),
    minDuration: productionDuration(adjustment.minDurationDays),
    recoverDuration: productionDuration(adjustment.recoverDays),
  })
  const accelerationProposalWithMetrics = accelerationProposal
    ? {
        ...accelerationProposal,
        overshootDays,
        overshoot,
        totalRecover: recoverable,
        remainingGap: unrecoverable,
        actions: accelerationProposal.actions.map((action) => ({
          ...action,
          recoverDuration: productionDuration(action.recoverDays),
          ...(action.type === 'crashing'
            ? { durationAdjustments: action.durationAdjustments.map(durationAdjustmentWithMetrics) }
            : {}),
        })),
        rescheduleDraft: accelerationProposal.rescheduleDraft
          ? {
              ...accelerationProposal.rescheduleDraft,
              taskDateAdjustments: accelerationProposal.rescheduleDraft.taskDateAdjustments.map((adjustment) => ({
                ...adjustment,
                currentDuration: productionDuration(adjustment.currentDurationDays),
                proposedDuration: productionDuration(adjustment.proposedDurationDays),
                recoverDuration: productionDuration(adjustment.recoverDays),
              })),
              resourceAdjustments: accelerationProposal.rescheduleDraft.resourceAdjustments
                .map(durationAdjustmentWithMetrics),
            }
          : undefined,
        protectedConstraints: accelerationProposal.protectedConstraints.map((constraint) => ({
          ...constraint,
          duration: productionDuration(constraint.durationDays),
        })),
        calculationBasis: accelerationProposal.calculationBasis
          ? {
              ...accelerationProposal.calculationBasis,
              naturalDuration: productionDuration(accelerationProposal.calculationBasis.naturalDurationDays),
              hardConstraintDuration: productionDuration(accelerationProposal.calculationBasis.hardConstraintDays),
            }
          : undefined,
      }
    : undefined
  const result: ScheduleTargetFeasibility = {
    mode: params.mode ?? 'compare_only',
    scenario,
    targetEndDate,
    naturalEndDate,
    overshootDays,
    overshoot,
    recoverableDays,
    recoverable,
    unrecoverableDays,
    unrecoverable,
    verdict,
    strategies: buildTargetFeasibilityStrategies({
      rows: comparableRows,
      overshootDays,
      recoverableDays,
      unrecoverableDays,
      budget,
      proposal: accelerationProposal,
    }).map((strategy) => ({
      ...strategy,
      recoverDuration: productionDuration(strategy.recoverDays),
    })),
    recoverableDaysConfidenceBand,
  }
  result.accelerationProposal = accelerationProposalWithMetrics
  if (result.accelerationProposal) {
    result.durationOutputCode = result.accelerationProposal.durationOutputCode
    result.durationOutputSemanticFieldName = result.accelerationProposal.durationOutputSemanticFieldName
    result.durationOutputContract = result.accelerationProposal.durationOutputContract
    result.accelerationTargetDays = result.accelerationProposal.accelerationTargetDays
  }
  return result
}

export function evaluateScheduleTargetFeasibility(params: {
  rows: ScheduleAccelerationRow[]
  targetEndDate: string | null | undefined
  mode?: ScheduleAccelerationMode
  context?: ScheduleAccelerationContext
}): ScheduleTargetFeasibility | undefined {
  return evaluateScheduleTargetFeasibilityInternal({
    ...params,
    scenario: params.context?.scenario ?? 'baseline_target_alignment',
  })
}

export function evaluateBaselineTargetAlignment(params: {
  rows: ScheduleAccelerationRow[]
  targetEndDate: string | null | undefined
  mode?: ScheduleAccelerationMode
  context?: Omit<ScheduleAccelerationContext, 'scenario' | 'runtime'>
}): ScheduleTargetFeasibility | undefined {
  return evaluateScheduleTargetFeasibilityInternal({
    rows: params.rows,
    targetEndDate: params.targetEndDate,
    mode: params.mode,
    scenario: 'baseline_target_alignment',
    context: params.context,
  })
}

export function evaluateRuntimeDelayRecovery(params: {
  rows: ScheduleAccelerationRow[]
  targetEndDate: string | null | undefined
  mode?: ScheduleAccelerationMode
  context?: Omit<ScheduleAccelerationContext, 'scenario'> & { runtime?: ScheduleRuntimeRecoveryContext }
}): ScheduleTargetFeasibility | undefined {
  return evaluateScheduleTargetFeasibilityInternal({
    rows: params.rows,
    targetEndDate: params.targetEndDate,
    mode: params.mode ?? 'compression_preview',
    scenario: 'runtime_delay_recovery',
    context: {
      ...params.context,
      scenario: 'runtime_delay_recovery',
    },
  })
}

export async function evaluateRuntimeDelayRecoveryWithCriticalPath(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
  targetEndDate: string | null | undefined
  mode?: ScheduleAccelerationMode
  context?: Omit<ScheduleAccelerationContext, 'scenario'> & { runtime?: ScheduleRuntimeRecoveryContext }
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly ScheduleAccelerationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
}): Promise<ScheduleTargetFeasibility | undefined> {
  const rows = await hydrateScheduleAccelerationRowsWithCriticalPath({
    projectId: params.projectId,
    rows: params.rows,
  })
  const feasibility = evaluateRuntimeDelayRecovery({
    rows,
    targetEndDate: params.targetEndDate,
    mode: params.mode,
    context: params.context,
  })

  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  if (params.runtimeConsumerObservationQueryExec) {
    try {
      await recordScheduleAccelerationConsumedArtifacts({
        queryExec: params.runtimeConsumerObservationQueryExec,
        observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
        callContext: {
          projectId: normalizeText(params.projectId) || null,
          runtimeConsumer: 'scheduleAccelerationService',
        },
        sourceEvidenceRefs: [
          ['schedule_acceleration', normalizeText(params.projectId) || 'no_project'].join(':'),
        ],
        artifacts: buildScheduleAccelerationConsumedArtifacts({
          runtimeArtifactPublications,
          projectId: params.projectId,
        }),
      })
    } catch (error) {
      if (params.runtimeConsumerErrorHandler) {
        params.runtimeConsumerErrorHandler(error)
      } else {
        logger.warn('[scheduleAccelerationService] failed to record schedule acceleration runtime consumer evidence', {
          projectId: params.projectId,
          error,
        })
      }
    }
  }

  return feasibility
}
