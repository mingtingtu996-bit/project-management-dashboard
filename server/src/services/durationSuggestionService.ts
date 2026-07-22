// v1.4.18 + v1.4.7.4: unified duration suggestion service.
// New duration decisions must enter through this service; retired legacy duration fields are not runtime fallbacks.

import { getProjectCompanyId } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import {
  applyDurationContextToDays,
  buildDurationContext,
  scoreToDurationConfidenceLevel,
  summarizeEffectiveDurationContextContributions,
  type DurationContextFactorKey,
  type DurationContextSummary,
} from './durationContextService.js'
import { getTask, supabase } from './dbService.js'
import {
  expandTitleWeakStandardWorkSearchTextFromResolver,
  describeDurationContributionModeFromResolver,
  inferTitleWeakScaleSignalFromResolver,
  inferTitleWeakStandardWorkCodesFromResolver,
  isDurationBearingContributionModeFromResolver,
  resolveDurationContributionModeFromResolver,
  resolveStandardWorkDurationSeed,
} from './algorithmSeedResolver.js'
import { loadPublishedProgressVelocityRuntime } from './progressVelocityRuntimePublicationService.js'
import { buildProjectHealthDeviationSummary } from './projectHealthDeviationSummaryService.js'
import {
  buildProjectGenerationFactsSnapshot,
  readProjectGenerationFactsSnapshot,
  type ProjectGenerationFactsSnapshot,
} from './projectGenerationFactsSnapshotService.js'
import {
  readLiveProjectGenerationContext,
} from './projectGenerationFactsStoreService.js'
import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
  type AlgorithmFactContextPhase,
} from './algorithmFactContextService.js'
import { resolvePackageChildRhythmWindow } from './packageChildRhythmWindowService.js'
import {
  assembleDurationInput,
  type DurationInputAssemblerResult,
} from './durationInputAssemblerService.js'
import {
  getDurationOutputContract,
  type DurationOutputCode,
} from './durationOutputGovernanceService.js'
import { resolveProjectFactDurationScaling } from './durationProjectFactScaleService.js'
import {
  addConstructionProductionDays,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { recordDurationAccuracyPrediction } from './durationAlgorithmAccuracyService.js'
import {
  decideAlgorithmAssetColdStartRuntime,
  type AlgorithmAssetColdStartBaseline,
  type AlgorithmAssetColdStartRuntimeDecision,
} from './algorithmAssetColdStartBaselineService.js'
import {
  loadAlgorithmAssetLearnableParameterRuntimeValue,
} from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import { getAlgorithmAssetLearnableParameter } from './algorithmAssetLearnableParameterRegistryService.js'
import { resolveDurationContextPolicyRuntimeSelection } from './durationContextPolicySelectorService.js'
import {
  recordDurationSuggestionConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  readPlanningReplayCalibrationReadback,
  type PlanningReplayCalibrationReadback,
} from './planningReplayCalibrationService.js'
import {
  evaluateDurationPlausibility,
  type DurationPlausibilityWarning,
} from './durationEngineeringPlausibilityGuardrailService.js'
import {
  executeDurationLearningRuntimePublicationQuery,
  resolveDurationLearningRuntimePublication,
  type DurationLearningRuntimePublicationQueryExec,
  type DurationLearningRuntimeScope,
} from './durationLearningRuntimePublicationService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import {
  createDurationRuntimeConsumerObservationQueryExec,
} from './durationRuntimeConsumerObservationService.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { T2RhythmSchedulePhase1Selection } from './t2RhythmSchedulePhase1SelectionService.js'
import type { ConstructionOrganizationScenarioSelection } from './constructionOrganizationScenarioSelector.js'
import {
  loadCurrentCauseSegment,
  type DurationBenchmarkCauseSegment,
} from './durationBenchmarkCauseSegmentService.js'
import {
  mergeConstructionOrganizationLineageIntoContext,
  readConstructionOrganizationPlanNetworkRuntimeLineage,
  type ConstructionOrganizationPlanNetworkRuntimeLineage,
} from './constructionOrganizationRuntimeLineageService.js'
import { resolveDurationDayBasis } from '../utils/durationDayBasis.js'
import type { StructuredCauseCode } from '../domain/structuredCauseTaxonomy.js'

export type DurationCalibrationSource =
  | 'enterprise_override'
  | 'project_history_sample'
  | 'company_history_sample'
  | 'system_history_sample'
  | 'standard_work_duration_seed'
  | 'standard_work_duration_seed+company_history_sample'
  | 'standard_work_duration_seed+system_history_sample'
  | 'standard_work_duration_seed+project_history_sample'
  | 'standard_work_duration_seed+mixed_history_sample'
  | 'runtime_learning_publication'
  | 'cold_start_baseline'
  | 'unavailable'

export type DurationDataMaturityLevel = 'L0' | 'L1' | 'L2'
export type DurationSuggestionPurpose = 'new_task_reference' | 'execution_reference' | 'monthly_commitment_window'
type DurationMaturityEvidenceScope = 'project' | 'company' | 'system' | 'unknown'
export type DurationQuantitySource =
  | 'explicit_task_quantity'
  | 'task_saved_quantity'
  | 'engineering_object_proxy'
  | 'scope_proxy'
  | 'seed_default_quantity'
  | 'none'
export type DurationQuantityConfidence = 'high' | 'medium' | 'low' | 'unavailable'
export type DurationBoundaryRole = 'standalone_duration' | 'aggregate_parent_duration' | 'package_child_window'
export type ParentDurationBoundaryPolicy =
  | 'aggregate_package_window'
  | 'rhythm_package_window'
  | 'system_package_window'
  | 'specialty_package_window'
  | 'itempack_window'
  | 'parent_package_window'
export type DurationBusinessReasonCode =
  | 'BASED_ON_SEED_AND_COVERAGE'
  | 'USER_MUST_SELECT_TEMPLATE'
  | 'USER_MUST_SELECT_CATEGORY'
  | 'CATEGORY_HAS_NO_SEED'
  | 'AMBIGUOUS_TEMPLATE_MATCH'
  | 'TASK_GRANULARITY_TOO_COARSE'
  | 'STANDARD_WORK_MATCH_UNCERTAIN'
  | 'STANDARD_WORK_CODE_CONFLICT'
  | 'STANDARD_SEED_REFERENCE'
  | 'PROJECT_SIMILAR_TASK_RHYTHM'
  | 'PROJECT_ENVIRONMENT_BUFFER'
  | 'STANDARD_SEED_VARIANT_FALLBACK'
  | 'MONTHLY_COMMITMENT_WINDOW'
  | 'NON_DURATION_BEARING_STANDARD_WORK'
  | 'PACKAGE_CHILD_DURATION_WINDOW'
  | 'PLANNING_REPLAY_CALIBRATION'
  | 'SERVICE_UNAVAILABLE'

export interface DurationSuggestion {
  recommendedDurationDays: number | null
  conservativeDurationDays: number | null
  durationOutputCode?: DurationOutputCode
  durationOutputSemanticFieldName?: string | null
  planReferenceDays?: number | null
  contextualReferenceDays?: number | null
  remainingForecastDays?: number | null
  phaseWindowDays?: number | null
  accelerationTargetDays?: number | null
  durationOutputContract?: Record<string, unknown> | null
  confidenceLevel: 'high' | 'medium' | 'low' | 'unavailable' | 'data_pending'
  confidenceScore: number
  forecastSource: string
  durationCalibrationSource: DurationCalibrationSource
  durationProvenance: 'manual_override' | 'historical_benchmark' | 'standard_work_duration_seed' | 'runtime_learning_publication' | 'unavailable'
  businessReason: string | null
  businessReasonCode?: DurationBusinessReasonCode | null
  businessReasonCodes?: DurationBusinessReasonCode[]
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  benchmarkKey: string | null
  sampleSize?: number | null
  factorSummary?: DurationContextSummary | null
  calculationContext?: DurationContextSummary['calculationContext'] | null
  dataMaturity?: DurationDataMaturityLevel
  dataMaturityReasons?: string[]
  dataUpgradePath?: string[]
  dataUpgradeBlockedBy?: string[]
  factorAvailability?: Record<string, boolean>
  durationContributionMode?: string | null
  quantitySource?: DurationQuantitySource
  quantityConfidence?: DurationQuantityConfidence
  durationBoundaryRole?: DurationBoundaryRole | null
  parentDurationBoundaryPolicy?: ParentDurationBoundaryPolicy | string | null
  nonAdditiveWithParentDuration?: boolean
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  planDurationTruthSource?: string | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
  benchmarkCauseSegment?: {
    causeCode: StructuredCauseCode
    taxonomyVersion: string
    generatedAt: string
    sourceAsOf: string
    sampleCount: number
  } | null
}

export interface DurationSuggestionInput {
  suggestionPurpose?: DurationSuggestionPurpose | null
  taskId?: string | null
  templateNodeId?: string | null
  templateStableCode?: string | null
  engineeringCategoryId?: string | null
  wbsNodeType?: string | null
  generationDepth?: number | null
  projectId?: string | null
  companyId?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  parentStandardWorkCode?: string | null
  parentTaskTitle?: string | null
  parentDurationBoundaryPolicy?: ParentDurationBoundaryPolicy | string | null
  parentDurationPolicySource?: string | null
  parentReferenceDurationDays?: number | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowDurationDays?: number | null
  packageChildRhythmWindowRole?: string | null
  taskTitle?: string | null
  engineeringObjectId?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  actualStartDate?: string | null
  actualEndDate?: string | null
  progress?: number | null
  currentProgress?: number | null
  targetProgress?: number | null
  buildingObjectId?: string | null
  floorObjectId?: string | null
  zoneObjectId?: string | null
  coveredBuildingIds?: string[] | null
  coveredFloorIds?: string[] | null
  childTaskCount?: number | null
  taskQuantity?: number | null
  taskQuantityUnit?: string | null
  taskQuantitySource?: DurationQuantitySource | null
  defaultQuantity?: number | null
  defaultQuantityUnit?: string | null
  responsibleUnitId?: string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[] | null
  methodVariantSource?: 'template' | 'engineering_feature' | 'row_name_suggestion' | 'manual_preview' | string | null
  elementVariantCodes?: string[] | null
  elementVariantSource?: 'template' | 'engineering_feature' | 'row_name_suggestion' | 'manual_preview' | string | null
  titleInferenceSignals?: Array<Record<string, unknown>> | null
  acceptanceRequired?: boolean | null
  materialRequired?: boolean | null
  projectGenerationFacts?: Record<string, unknown> | null
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  t2RhythmScheduleCandidatePackage?: T2RhythmScheduleCandidatePackage | null
  t2RhythmScheduleCandidateNetworkEvaluation?: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  t2RhythmSchedulePhase1Selection?: T2RhythmSchedulePhase1Selection | null
  durationInputAssembly?: DurationInputAssemblerResult<DurationSuggestionInput> | null
  runtimeExecutionFacts?: Record<string, unknown> | null
  workCalendar?: ConstructionCalendarContext | null
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeEvidenceMode?: 'record' | 'no_write'
  confirmedCauseCode?: StructuredCauseCode | null
}

export interface DurationSuggestionRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

function shouldRecordDurationRuntimeConsumerEvidence(input: DurationSuggestionInput) {
  return input.runtimeEvidenceMode === 'record'
}

export interface RecordDurationSuggestionRuntimeConsumptionInput {
  queryExec?: DurationRuntimeConsumerObservationQueryExec
  runtimeArtifactPublications: readonly DurationSuggestionRuntimeArtifactPublication[]
  projectId?: string | null
  taskId?: string | null
  standardWorkCode?: string | null
  observedAt?: string
}

export interface CommittedDurationSuggestionPredictionEvidence {
  companyId: string
  projectId: string
  taskId: string
  generationBatchId?: string | null
  standardWorkCode?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  recommendedDurationDays: number
  forecastSource?: string | null
  confidenceLevel?: string | null
  confidenceScore?: number | null
  runtimeApplications: ReadonlyArray<{
    assetKey: string
    publicationKey: string
    artifactKey: string
    scopeLevel: DurationLearningRuntimeScope['level']
    industryKey?: string | null
    inputTaskIds: readonly string[]
  }>
}

const DURATION_LEARNING_RUNTIME_SCOPE_LEVELS = new Set<DurationLearningRuntimeScope['level']>([
  'project',
  'company',
  'industry',
  'global',
])

const DURATION_SUGGESTION_CONSUMER_ASSET_KEYS = new Set([
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'standard_work_duration_seed',
  'special_work_duration_seed',
])

type DurationBenchmarkRow = {
  id?: string | null
  p50_days?: number | null
  p75_days?: number | null
  p80_days?: number | null
  mean_days?: number | null
  sample_count?: number | null
  confidence_level?: 'high' | 'medium' | 'low' | null
  confidence_score?: number | null
  company_id?: string | null
  project_id?: string | null
  generated_at?: string | null
  source_window_start?: string | null
  source_as_of?: string | null
  metadata?: Record<string, unknown> | null
  variance?: number | null
  cv?: number | null
  coefficient_of_variation?: number | null
  coefficientOfVariation?: number | null
  duration_day_basis?: 'calendar_day' | 'construction_production_day' | null
  __durationLearningPublicationKey?: string | null
  __durationLearningPublicationStage?: string | null
  __durationLearningSelectionBasis?: string | null
}

type DurationOverrideRow = {
  recommended_duration_days?: number | null
  conservative_duration_days?: number | null
  reason?: string | null
}

type BenchmarkScope = 'project' | 'company' | 'system'

type DurationBenchmarkCandidate = {
  benchmark: DurationBenchmarkRow
  scope: BenchmarkScope
  benchKey: string
  contextKey: string
  sampleSize: number
  specificity: 'all' | 'specific'
}

type SuggestionTaskContextRow = {
  id?: string | null
  project_id?: string | null
  title?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  progress?: number | null
  template_node_id?: string | null
  engineering_category_id?: string | null
  wbs_node_type?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  engineering_object_id?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  participant_unit_id?: string | null
  acceptance_required?: boolean | null
  material_required?: boolean | null
  planned_quantity?: number | null
  quantity_unit?: string | null
  standard_task_metadata?: Record<string, any> | null
  parent_id?: string | null
}

type ParentDurationBoundaryContext = {
  parentStandardWorkCode: string | null
  parentTaskTitle: string | null
  parentDurationBoundaryPolicy: ParentDurationBoundaryPolicy
  parentDurationPolicySource: string | null
  parentReferenceDurationDays: number | null
}

type EngineeringObjectContextRow = {
  id?: string | null
  object_type?: string | null
  object_code?: string | null
  object_name?: string | null
  metadata?: Record<string, any> | null
}

type DurationScaleAdjustment = {
  factor: number
  reason: string | null
  source: 'quantity' | 'project_fact_scale_proxy' | 'coverage' | 'children' | 'title' | 'none'
  quantitySource: DurationQuantitySource
  quantityConfidence: DurationQuantityConfidence
  fixedDays: number
  variableDays: number
  confidence: 'high' | 'medium' | 'low' | 'unavailable'
  signals: string[]
}

type CoverageExecutionMode = 'parallel' | 'stagger' | 'sequential'
type CoverageExecutionModeSignal = {
  mode: CoverageExecutionMode
  source: string
}

type ProjectEnvironmentBuffer = {
  sampleCount: number
  averageDurationRatio: number
  delayRatio: number
  multiplier: number
  extraDays: number
  confidenceLevel: 'high' | 'medium' | 'low'
  confidenceScore: number
  reason: string
  healthScore?: number | null
  healthBandMultiplier?: number | null
  healthBandSource?: string | null
  healthConfidenceFlag?: string | null
  bufferKind?: 'project_history' | 'health_band' | 'cold_start' | 'mixed'
}

const DEFAULT_DURATION_FALLBACK: DurationSuggestion = {
  recommendedDurationDays: null,
  conservativeDurationDays: null,
  confidenceLevel: 'unavailable',
  confidenceScore: 0,
  forecastSource: 'unavailable',
  durationCalibrationSource: 'unavailable',
  durationProvenance: 'unavailable',
  businessReason: '缺少任务分类，无法匹配参考工期。',
  businessReasonCode: 'USER_MUST_SELECT_TEMPLATE',
  businessReasonCodes: ['USER_MUST_SELECT_TEMPLATE'],
  businessReasonParams: null,
  displaySummary: '暂无参考工期；缺少任务分类，先由用户填写。',
  benchmarkKey: null,
  sampleSize: 0,
  dataMaturity: 'L0',
}

function normalizeId(value: unknown) {
  return String(value ?? '').trim()
}

export function buildDurationSuggestionConsumedArtifacts(input: {
  runtimeArtifactPublications: readonly DurationSuggestionRuntimeArtifactPublication[]
  projectId?: string | null
  taskId?: string | null
  standardWorkCode?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeId(input.projectId)
  const taskId = normalizeId(input.taskId)
  const standardWorkCode = normalizeId(input.standardWorkCode)
  return input.runtimeArtifactPublications
    .filter((publication) => DURATION_SUGGESTION_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeId(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeId(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        taskId: taskId || null,
        standardWorkCode: standardWorkCode || null,
        runtimeConsumer: 'durationSuggestionService',
      },
    }))
}

export function recordDurationSuggestionRuntimeConsumption(
  input: RecordDurationSuggestionRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const queryExec = createDurationRuntimeConsumerObservationQueryExec(input.queryExec)
  const projectId = normalizeId(input.projectId)
  const taskId = normalizeId(input.taskId)
  const standardWorkCode = normalizeId(input.standardWorkCode)
  return recordDurationSuggestionConsumedArtifacts({
    queryExec,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      taskId: taskId || null,
      standardWorkCode: standardWorkCode || null,
      runtimeConsumer: 'durationSuggestionService',
    },
    sourceEvidenceRefs: [
      ['duration_suggestion', projectId || 'no_project', taskId || standardWorkCode || 'no_task'].join(':'),
    ],
    artifacts: buildDurationSuggestionConsumedArtifacts({
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
      taskId,
      standardWorkCode,
    }),
  })
}

function isDurationSuggestionRuntimePublicationStatus(value: unknown) {
  const status = normalizeId(value)
  return status === 'published' || status === 'canary' || status === 'runtime_published'
}

function buildStandardSeedRuntimePublication(
  standardSeed: Record<string, unknown> | null | undefined,
): DurationSuggestionRuntimeArtifactPublication | null {
  if (!standardSeed) return null
  const learnedPublicationKey = normalizeId(standardSeed.__durationLearningPublicationKey)
  if (learnedPublicationKey) {
    const stage = normalizeId(standardSeed.__durationLearningPublicationStage)
    return {
      assetKey: 'standard_work_duration_seed',
      publicationKey: learnedPublicationKey,
      publicationStatus: stage === 'canary' ? 'canary' : 'published',
      sourceEvidenceRefs: [`duration_learning_runtime_publications:${learnedPublicationKey}`],
      observationContext: {
        seedSource: normalizeId(standardSeed.__resolverSource),
        seedStableCode: normalizeId(standardSeed.__stableCode ?? standardSeed.stableCode ?? standardSeed.stable_code),
        selectionBasis: normalizeId(standardSeed.__durationLearningSelectionBasis),
      },
    }
  }
  const seedSource = normalizeId(standardSeed.__resolverSource)
  if (seedSource !== 'active_seed') return null
  const seedVersion = normalizeId(
    standardSeed.__seedVersion
      ?? standardSeed.seedVersion
      ?? standardSeed.seed_version
      ?? standardSeed.sourceVersion
      ?? standardSeed.source_version,
  )
  if (!seedVersion) return null
  const seedStableCode = normalizeId(standardSeed.__stableCode ?? standardSeed.stableCode ?? standardSeed.stable_code)
  return {
    assetKey: 'standard_work_duration_seed',
    publicationKey: `algorithm_seed_versions:${seedVersion}`,
    publicationStatus: 'runtime_published',
    sourceEvidenceRefs: [`algorithm_seed_versions:${seedVersion}`],
    observationContext: {
      seedSource,
      seedStableCode: seedStableCode || null,
    },
  }
}

function buildLearnedBenchmarkRuntimePublication(
  benchmark: DurationBenchmarkRow | null | undefined,
): DurationSuggestionRuntimeArtifactPublication | null {
  const publicationKey = normalizeId(benchmark?.__durationLearningPublicationKey)
  if (!publicationKey) return null
  const stage = normalizeId(benchmark?.__durationLearningPublicationStage)
  return {
    assetKey: 'base_duration_benchmark',
    publicationKey,
    publicationStatus: stage === 'canary' ? 'canary' : 'published',
    sourceEvidenceRefs: [`duration_learning_runtime_publications:${publicationKey}`],
    observationContext: {
      selectionBasis: normalizeId(benchmark?.__durationLearningSelectionBasis),
      durationDayBasis: benchmark?.duration_day_basis ?? null,
    },
  }
}

function createDurationLearningRuntimeQueryExec(
  input: DurationSuggestionInput,
): DurationLearningRuntimePublicationQueryExec | null {
  if (input.runtimeConsumerObservationQueryExec) return input.runtimeConsumerObservationQueryExec
  if (process.env.NODE_ENV === 'test') return null
  return executeDurationLearningRuntimePublicationQuery
}

async function applyLearnedStandardDurationPublication(input: {
  suggestionInput: DurationSuggestionInput
  companyId: string | null
  seed: Record<string, unknown> | null
}) {
  const stableCode = normalizeId(
    input.seed?.__stableCode
      ?? input.seed?.stableCode
      ?? input.seed?.stable_code
      ?? input.suggestionInput.standardWorkCode
      ?? input.suggestionInput.templateStableCode,
  )
  const queryExec = createDurationLearningRuntimeQueryExec(input.suggestionInput)
  if (!stableCode || !queryExec) return input.seed
  const resolution = await resolveDurationLearningRuntimePublication({
    queryExec,
    assetKey: 'standard_work_duration_seed',
    artifactKey: stableCode,
    companyId: input.companyId,
    projectId: input.suggestionInput.projectId,
    industryKey: input.suggestionInput.projectTypeCode,
  })
  if (!resolution.runtimeConsumable || !resolution.publication) return input.seed
  return {
    ...(input.seed ?? {}),
    ...resolution.publication.runtimePayload,
    stableCode,
    __stableCode: stableCode,
    __resolverSource: `duration_learning_${resolution.selectionBasis}`,
    __seedVersion: resolution.publicationKey,
    __resolverVersionId: resolution.publicationKey,
    __durationLearningPublicationKey: resolution.publicationKey,
    __durationLearningPublicationStage: resolution.publication.publicationStage,
    __durationLearningSelectionBasis: resolution.selectionBasis,
  }
}

function buildDurationSuggestionRuntimeArtifactPublications(input: {
  benchmarkBlendRuntimeParameter?: BenchmarkBlendRuntimeParameter | null
  benchmark?: DurationBenchmarkRow | null
  coldStartDecision?: AlgorithmAssetColdStartRuntimeDecision | null
  coldStartBaselines?: AlgorithmAssetColdStartBaseline[]
  standardSeed?: Record<string, unknown> | null
}): DurationSuggestionRuntimeArtifactPublication[] {
  const publications: DurationSuggestionRuntimeArtifactPublication[] = []
  const seen = new Set<string>()
  const push = (publication: DurationSuggestionRuntimeArtifactPublication | null) => {
    if (!publication) return
    if (!normalizeId(publication.publicationKey)) return
    if (!isDurationSuggestionRuntimePublicationStatus(publication.publicationStatus)) return
    const key = `${publication.assetKey}:${publication.publicationKey}`
    if (seen.has(key)) return
    seen.add(key)
    publications.push(publication)
  }

  if (input.benchmarkBlendRuntimeParameter?.publicationKey) {
    push({
      assetKey: 'base_duration_benchmark',
      publicationKey: input.benchmarkBlendRuntimeParameter.publicationKey,
      publicationStatus: input.benchmarkBlendRuntimeParameter.publicationStatus,
      sourceEvidenceRefs: [
        `algorithm_learnable_parameter_runtime_publications:${input.benchmarkBlendRuntimeParameter.publicationKey}`,
      ],
      observationContext: {
        parameterKey: 'duration.benchmark_blend_weight',
        scopeLevel: input.benchmarkBlendRuntimeParameter.scopeLevel,
      },
    })
  }

  push(buildLearnedBenchmarkRuntimePublication(input.benchmark))

  if (input.benchmarkBlendRuntimeParameter?.p50P75BlendRatioPublicationKey) {
    push({
      assetKey: 'base_duration_benchmark',
      publicationKey: input.benchmarkBlendRuntimeParameter.p50P75BlendRatioPublicationKey,
      publicationStatus: input.benchmarkBlendRuntimeParameter.p50P75BlendRatioPublicationStatus,
      sourceEvidenceRefs: [
        `algorithm_learnable_parameter_runtime_publications:${input.benchmarkBlendRuntimeParameter.p50P75BlendRatioPublicationKey}`,
      ],
      observationContext: {
        parameterKey: 'duration.p50_p75_blend_ratio',
        scopeLevel: input.benchmarkBlendRuntimeParameter.p50P75BlendRatioScopeLevel,
      },
    })
  }

  const selectedColdStartBaseline = input.coldStartDecision?.status === 'shared_baseline_reference'
    && input.coldStartDecision.runtimeConsumable
    && input.coldStartDecision.selectedBaselineId
    ? input.coldStartBaselines?.find((baseline) => baseline.baselineId === input.coldStartDecision?.selectedBaselineId) ?? null
    : null
  if (selectedColdStartBaseline?.runtimePublicationKey) {
    push({
      assetKey: 'duration_cold_start_baseline',
      publicationKey: selectedColdStartBaseline.runtimePublicationKey,
      publicationStatus: selectedColdStartBaseline.runtimePublicationStatus,
      sourceEvidenceRefs: [`algorithm_cold_start_baselines:${selectedColdStartBaseline.baselineId}`],
      observationContext: {
        baselineId: selectedColdStartBaseline.baselineId,
        baselineScope: selectedColdStartBaseline.baselineScope,
      },
    })
  }

  push(buildStandardSeedRuntimePublication(input.standardSeed))

  return publications
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readPositiveRawNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readOptionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCodeArray(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').trim()
      ? String(value ?? '').split(/[,\s]+/)
      : []
  return [...new Set(raw.map((item) => normalizeId(item).toLowerCase()).filter(Boolean))]
}

function isRowNameSuggestionSource(value: unknown) {
  return normalizeId(value).toLowerCase() === 'row_name_suggestion'
}

function trustedMethodVariantCodes(input: DurationSuggestionInput) {
  return isRowNameSuggestionSource(input.methodVariantSource) ? [] : normalizeCodeArray(input.methodVariantCodes)
}

function trustedElementVariantCodes(input: DurationSuggestionInput) {
  return isRowNameSuggestionSource(input.elementVariantSource) ? [] : normalizeCodeArray(input.elementVariantCodes)
}

function hasCoreClassification(input: DurationSuggestionInput) {
  return Boolean(
    normalizeId(input.templateNodeId)
      || normalizeId(input.templateStableCode)
      || normalizeId(input.standardWorkCode)
      || normalizeId(input.engineeringCategoryId),
  )
}

function confidenceLabel(level: DurationSuggestion['confidenceLevel']) {
  if (level === 'high') return '高'
  if (level === 'medium') return '中等'
  if (level === 'low') return '较低'
  if (level === 'data_pending') return '待补齐'
  return '不可用'
}

function getMissingClassificationReason(input: DurationSuggestionInput): {
  code: DurationBusinessReasonCode
  message: string
  params: Record<string, unknown>
} {
  const hasTemplateSignal = Boolean(normalizeId(input.templateNodeId) || normalizeId(input.templateStableCode) || normalizeId(input.standardWorkCode))
  if (!hasTemplateSignal && !normalizeId(input.engineeringCategoryId)) {
    return {
      code: 'USER_MUST_SELECT_TEMPLATE',
      message: '未选择标准工序或工程分类，无法获取参考工期',
      params: { missing: ['templateNodeId', 'standardWorkCode', 'engineeringCategoryId'] },
    }
  }
  return {
    code: 'USER_MUST_SELECT_CATEGORY',
    message: '未选择工程分类，无法获取参考工期',
    params: { missing: ['engineeringCategoryId'] },
  }
}

function getNoSeedReason(input: DurationSuggestionInput): {
  code: DurationBusinessReasonCode
  message: string
  params: Record<string, unknown>
} {
  return {
    code: 'CATEGORY_HAS_NO_SEED',
    message: '该工程分类暂无已发布工期 seed，请先手填工期',
    params: {
      templateNodeId: normalizeId(input.templateNodeId) || null,
      standardWorkCode: normalizeId(input.standardWorkCode) || null,
      engineeringCategoryId: normalizeId(input.engineeringCategoryId) || null,
    },
  }
}

function normalizedWbsNodeType(input: DurationSuggestionInput) {
  return normalizeId(input.wbsNodeType).toLowerCase()
}

function getTaskGranularityGuard(input: DurationSuggestionInput, purpose: DurationSuggestionPurpose): {
  code: DurationBusinessReasonCode
  message: string
  params: Record<string, unknown>
  availabilityKey: string
} | null {
  if (purpose !== 'new_task_reference') return null
  const nodeType = normalizedWbsNodeType(input)
  if (!['summary', 'division', 'subdivision', 'phase', 'section', 'project', 'package'].includes(nodeType)) return null
  return {
    code: 'TASK_GRANULARITY_TOO_COARSE',
    message: '该行是汇总或包级任务，参考工期应由下级 process 任务汇总生成，不能直接套用单个标准工序工期。',
    params: {
      wbsNodeType: nodeType,
      standardWorkCode: normalizeId(input.standardWorkCode) || null,
      policy: 'process_rollup_required',
    },
    availabilityKey: 'task_granularity_guard',
  }
}

function getAmbiguousStandardWorkGuard(input: DurationSuggestionInput, weakStandardWorkCodes: string[]): {
  code: DurationBusinessReasonCode
  message: string
  params: Record<string, unknown>
  availabilityKey: string
} | null {
  if (normalizeId(input.standardWorkCode)) return null
  if (normalizeId(input.templateNodeId) || normalizeId(input.templateStableCode)) return null
  const uniqueCodes = Array.from(new Set(weakStandardWorkCodes.map(normalizeId).filter(Boolean)))
  if (uniqueCodes.length <= 1) return null
  return {
    code: 'STANDARD_WORK_MATCH_UNCERTAIN',
    message: '任务标题可匹配多个标准工序，系统暂不自动套用工期，需先明确标准工序或模板节点。',
    params: {
      weakStandardWorkCodes: uniqueCodes.slice(0, 8),
      taskTitle: normalizeId(input.taskTitle) || null,
      policy: 'do_not_guess_base_days_from_ambiguous_title',
    },
    availabilityKey: 'standard_work_match_guard',
  }
}

function readSeedStandardWorkCodes(seed: Record<string, unknown>) {
  const raw = seed.standardWorkCodes ?? seed.standard_work_codes
  if (Array.isArray(raw)) return raw.map(normalizeId).filter(Boolean)
  const single = normalizeId(seed.standardWorkCode ?? seed.standard_work_code)
  return single ? [single] : []
}

function getStandardWorkConflictGuard(input: DurationSuggestionInput, seed: Record<string, unknown>): {
  code: DurationBusinessReasonCode
  message: string
  params: Record<string, unknown>
  availabilityKey: string
} | null {
  const explicitCode = normalizeId(input.standardWorkCode)
  if (!explicitCode) return null
  const seedCodes = readSeedStandardWorkCodes(seed)
  if (seedCodes.length === 0 || seedCodes.includes(explicitCode)) return null
  return {
    code: 'STANDARD_WORK_CODE_CONFLICT',
    message: '任务已声明的标准工序与工期 seed 命中的工序不一致，系统不会用疑似错误的工期覆盖计划判断。',
    params: {
      standardWorkCode: explicitCode,
      seedStandardWorkCodes: seedCodes.slice(0, 8),
      seedCode: normalizeId(seed.__stableCode) || normalizeId(seed.stableCode) || null,
      policy: 'explicit_standard_work_code_must_match_duration_seed',
    },
    availabilityKey: 'standard_work_conflict_guard',
  }
}

function seedVariantCodes(seed: Record<string, unknown>, ...keys: string[]) {
  return keys.flatMap((key) => {
    const value = seed[key]
    return Array.isArray(value) ? value.map(normalizeId).filter(Boolean) : []
  })
}

function includesAnyCode(recordValues: string[], contextValues: string[]) {
  const normalizedRecordValues = recordValues.map((item) => item.toLowerCase())
  return contextValues.some((item) => normalizedRecordValues.includes(item.toLowerCase()))
}

function resolveSeedVariantFallback(input: DurationSuggestionInput, seed: Record<string, unknown>) {
  const requestedMethodVariantCodes = trustedMethodVariantCodes(input)
  const requestedElementVariantCodes = trustedElementVariantCodes(input)
  const seedMethodCodes = seedVariantCodes(seed, 'applicableMethodCodes', 'applicable_method_codes')
  const seedElementCodes = seedVariantCodes(seed, 'elementVariantCodes', 'element_variant_codes')
  const methodFallback = requestedMethodVariantCodes.length > 0 && !includesAnyCode(seedMethodCodes, requestedMethodVariantCodes)
  const elementFallback = requestedElementVariantCodes.length > 0 && !includesAnyCode(seedElementCodes, requestedElementVariantCodes)
  if (!methodFallback && !elementFallback) {
    return {
      hasFallback: false,
      penalty: 0,
      requestedMethodVariantCodes,
      requestedElementVariantCodes,
      seedMethodCodes,
      seedElementCodes,
    }
  }
  return {
    hasFallback: true,
    penalty: methodFallback && elementFallback ? 12 : 8,
    requestedMethodVariantCodes,
    requestedElementVariantCodes,
    seedMethodCodes,
    seedElementCodes,
  }
}

function buildRuntimeGuardSuggestion(
  input: DurationSuggestionInput,
  factorSummary: DurationContextSummary,
  guard: NonNullable<ReturnType<typeof getTaskGranularityGuard>>,
  purpose: DurationSuggestionPurpose,
): DurationSuggestion {
  const maturity = resolveDataMaturity(input, 0, purpose)
  return {
    recommendedDurationDays: null,
    conservativeDurationDays: null,
    confidenceLevel: 'data_pending',
    confidenceScore: 32,
    forecastSource: 'standard_work_duration_seed:runtime_guard',
    durationCalibrationSource: 'unavailable',
    durationProvenance: 'unavailable',
    businessReason: guard.message,
    businessReasonCode: guard.code,
    businessReasonCodes: [guard.code],
    businessReasonParams: guard.params,
    benchmarkKey: null,
    sampleSize: 0,
    dataMaturity: maturity.level,
    dataMaturityReasons: maturity.reasons,
    dataUpgradePath: Array.from(new Set([...maturity.upgradePath, '明确 process 级标准工序、拆分下级任务，或选择模板节点后再获取参考工期'])),
    dataUpgradeBlockedBy: Array.from(new Set([...maturity.upgradeBlockedBy, guard.code])),
    factorAvailability: {
      ...maturity.factorAvailability,
      runtime_duration_guard: true,
      [guard.availabilityKey]: true,
    },
    factorSummary: withMaturityFactorSummary(factorSummary, {
      dataMaturity: maturity.level,
      factorAvailability: {
        ...maturity.factorAvailability,
        runtime_duration_guard: true,
        [guard.availabilityKey]: true,
      },
      dataUpgradePath: maturity.upgradePath,
      dataUpgradeBlockedBy: maturity.upgradeBlockedBy,
    }),
  }
}

function readSeedDurationContributionMode(seed: Record<string, unknown>) {
  return resolveDurationContributionModeFromResolver(seed.durationContributionMode ?? seed.duration_contribution_mode)
}

function buildDisplaySummary(suggestion: DurationSuggestion) {
  if (!suggestion.recommendedDurationDays) {
    return suggestion.businessReason
      ? `暂无参考工期；${suggestion.businessReason}`
      : '暂无参考工期；当前数据不足，先由用户填写。'
  }
  const conservative = suggestion.conservativeDurationDays && suggestion.conservativeDurationDays > suggestion.recommendedDurationDays
    ? `，保守 ${suggestion.conservativeDurationDays} 天`
    : ''
  const reason = suggestion.businessReason ? `，因为${suggestion.businessReason.replace(/[。.]$/, '')}` : ''
  return `参考 ${suggestion.recommendedDurationDays} 天${conservative}；可信度${confidenceLabel(suggestion.confidenceLevel)}${reason}。`
}

function withDisplaySummary(suggestion: DurationSuggestion): DurationSuggestion {
  return {
    ...suggestion,
    displaySummary: suggestion.displaySummary ?? buildDisplaySummary(suggestion),
  }
}

function clampProgress(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function countConstructionProductionDaysInclusive(
  start?: string | null,
  end?: string | null,
  calendar?: ConstructionCalendarContext | null,
): number | null {
  if (!start || !end) return null
  const startDate = parseConstructionCalendarDate(start)
  const endDate = parseConstructionCalendarDate(end)
  if (!startDate || !endDate || endDate < startDate) return null
  return Math.max(1, productionDaysBetweenInclusive(startDate, endDate, calendar))
}

function addConstructionProductionDaysInclusive(
  start?: string | null,
  days?: number | null,
  calendar?: ConstructionCalendarContext | null,
) {
  const count = readPositiveNumber(days)
  if (!start || !count) return null
  const startDate = parseConstructionCalendarDate(start)
  if (!startDate) return null
  return addConstructionProductionDays(startDate, count, calendar)
}

function buildMonthlyCommitmentWindowSuggestion(base: DurationSuggestion, input: DurationSuggestionInput): DurationSuggestion {
  const baseDays = readPositiveNumber(base.recommendedDurationDays)
  const currentProgress = clampProgress(input.currentProgress ?? input.progress)
  const targetProgress = clampProgress(input.targetProgress)
  const windowProductionDays = countConstructionProductionDaysInclusive(input.plannedStartDate, input.plannedEndDate, input.workCalendar)

  if (!baseDays || targetProgress == null) {
    return {
      ...base,
      forecastSource: appendForecastSourceSuffix(base.forecastSource, 'monthly_commitment_window'),
      businessReason: base.businessReason ?? '本月目标进度或参考工期不足，暂不能判断本月承诺所需工期',
      businessReasonCode: 'MONTHLY_COMMITMENT_WINDOW',
      businessReasonCodes: Array.from(new Set([...(base.businessReasonCodes ?? []), 'MONTHLY_COMMITMENT_WINDOW'])),
      businessReasonParams: {
        ...(base.businessReasonParams ?? {}),
        monthlyCommitmentWindow: {
          currentProgress,
          targetProgress,
          windowProductionDays,
          windowWorkdays: windowProductionDays,
          requiredDays: null,
          feasibility: 'unknown',
        },
      },
      factorAvailability: {
        ...(base.factorAvailability ?? {}),
        monthly_commitment_window: false,
      },
      displaySummary: '本月目标窗口暂不能判断；请先确认目标进度和计划日期。',
    }
  }

  const safeCurrent = currentProgress ?? 0
  const progressDelta = Math.max(0, targetProgress - safeCurrent)
  const requiredDays = progressDelta <= 0 ? 0 : Math.max(1, Math.ceil(baseDays * (progressDelta / 100)))
  const conservativeBase = readPositiveNumber(base.conservativeDurationDays) ?? Math.ceil(baseDays * 1.25)
  const conservativeDays = progressDelta <= 0 ? 0 : Math.max(requiredDays, Math.ceil(conservativeBase * (progressDelta / 100)))
  const feasibility = progressDelta <= 0
    ? 'already_met'
    : windowProductionDays == null
      ? 'unknown'
      : requiredDays > windowProductionDays
        ? 'tight'
        : 'fit'
  const targetText = `本月目标 ${safeCurrent}% -> ${targetProgress}%`
  const windowText = windowProductionDays == null ? '当前计划窗口未完整填写' : `当前窗口约 ${windowProductionDays} 个有效施工日`
  const displaySummary = progressDelta <= 0
    ? `${targetText} 已达到或无需新增工期；${windowText}。`
    : feasibility === 'tight'
      ? `${targetText} 预计需 ${requiredDays} 个有效施工日，${windowText}，本月承诺偏紧。`
      : feasibility === 'fit'
        ? `${targetText} 预计需 ${requiredDays} 个有效施工日，${windowText}，窗口基本匹配。`
        : `${targetText} 预计需 ${requiredDays} 个有效施工日；${windowText}，请结合计划日期确认。`

  return {
    ...base,
    recommendedDurationDays: requiredDays,
    conservativeDurationDays: conservativeDays,
    forecastSource: appendForecastSourceSuffix(base.forecastSource, 'monthly_commitment_window'),
    businessReason: displaySummary,
    businessReasonCode: 'MONTHLY_COMMITMENT_WINDOW',
    businessReasonCodes: Array.from(new Set([...(base.businessReasonCodes ?? []), 'MONTHLY_COMMITMENT_WINDOW'])),
    businessReasonParams: {
      ...(base.businessReasonParams ?? {}),
      monthlyCommitmentWindow: {
        currentProgress: safeCurrent,
        targetProgress,
        progressDelta,
        baseReferenceDays: baseDays,
        requiredDays,
        conservativeDays,
        windowProductionDays,
        windowWorkdays: windowProductionDays,
        feasibility,
      },
    },
    factorAvailability: {
      ...(base.factorAvailability ?? {}),
      monthly_commitment_window: true,
    },
    factorSummary: base.factorSummary
      ? {
        ...base.factorSummary,
        factorAvailability: {
          ...(base.factorSummary.factorAvailability ?? {}),
          monthly_commitment_window: true,
        },
        calculationContext: {
          ...(base.factorSummary.calculationContext ?? {}),
          monthly_commitment_window: {
            currentProgress: safeCurrent,
            targetProgress,
            progressDelta,
            baseReferenceDays: baseDays,
            requiredDays,
            windowProductionDays,
            windowWorkdays: windowProductionDays,
            feasibility,
          },
        },
      } as DurationContextSummary
      : base.factorSummary,
    displaySummary,
  }
}

function buildBaselineMatchText(input: DurationSuggestionInput) {
  const raw = [
    input.taskTitle,
    input.standardWorkName,
    input.standardWorkCode,
    input.templateStableCode,
    input.engineeringCategoryId,
    input.wbsNodeType,
    input.projectTypeCode,
    input.structureTypeCode,
    ...trustedMethodVariantCodes(input),
    ...trustedElementVariantCodes(input),
  ].map(normalizeId).filter(Boolean).join(' ').toLowerCase()
  return raw
}

async function resolveCompanyId(input: DurationSuggestionInput) {
  const explicitCompanyId = normalizeId(input.companyId)
  if (explicitCompanyId) return explicitCompanyId

  const projectId = normalizeId(input.projectId)
  if (!projectId) return null

  try {
    return await getProjectCompanyId(projectId)
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to resolve project company; using global duration references', { projectId, error })
    return null
  }
}

function readMetadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function mergeRecords(...records: Array<Record<string, any> | null | undefined>) {
  return records.reduce<Record<string, any>>((merged, record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return merged
    return { ...merged, ...record }
  }, {})
}

function readMetadataArray(metadata: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) return value.map((item) => normalizeId(item)).filter(Boolean)
  }
  return []
}

function readNestedMetadata(metadata: Record<string, any>, key: string) {
  return readMetadataObject(metadata[key])
}

function projectGenerationFactsToDurationFeatureProfile(facts: ProjectGenerationFactsSnapshot) {
  const profile: Record<string, unknown> = {}
  const businessType = normalizeId(facts.businessType)
  const structureTypeCode = normalizeId(facts.structureTypeCode)
  const methodVariantCodes = normalizeCodeArray(facts.methodVariantCodes)
  const elementVariantCodes = normalizeCodeArray(facts.elementVariantCodes)
  const passthroughFactKeys: Array<keyof ProjectGenerationFactsSnapshot> = [
    'businessSubtype',
    'planScopeCaliber',
    'deliveryStandard',
    'terminalEvent',
    'prefabSystemCodes',
    'externalInterfaceCodes',
    'hardConstraintCodes',
    'projectFeatures',
    'detailLevel',
    'buildingCount',
    'totalAreaM2',
    'aboveGroundAreaM2',
    'basementAreaM2',
    'siteAreaM2',
    'standardFloorCount',
    'highestBuildingFloorCount',
    'basementLevelCount',
    'foundationDepthM',
    'prefabRate',
    'maxSpanM',
    'supportHeightM',
    'hasCivilDefense',
    'towerCraneCount',
    'constructionHoistCount',
    'buildingPatternCodes',
    'functionalUsageCodes',
    'floorUsageCodes',
    'functionalCategoryCodes',
    'specialRoomTypeCodes',
    'physicalZoneTypeCodes',
    'locationFacts',
  ]
  if (businessType) profile.projectTypeCode = businessType
  if (structureTypeCode) profile.structureTypeCode = structureTypeCode
  if (methodVariantCodes.length > 0) {
    profile.methodVariantCodes = methodVariantCodes
    profile.methodVariantSource = 'project_generation_facts'
  }
  if (elementVariantCodes.length > 0) {
    profile.elementVariantCodes = elementVariantCodes
    profile.elementVariantSource = 'project_generation_facts'
  }
  for (const key of passthroughFactKeys) {
    const value = facts[key]
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue
    profile[key] = value
  }
  return profile
}

function buildDurationSeedFeatureProfile(input: DurationSuggestionInput) {
  return mergeRecords(
    projectGenerationFactsToDurationFeatureProfile(buildProjectGenerationFactsSnapshot(input.projectGenerationFacts)),
    input.templateStableCode ? { templateStableCode: input.templateStableCode } : null,
    input.standardWorkCode ? { standardWorkCode: input.standardWorkCode } : null,
    input.projectTypeCode ? { projectTypeCode: input.projectTypeCode } : null,
    input.structureTypeCode ? { structureTypeCode: input.structureTypeCode } : null,
    normalizeCodeArray(input.methodVariantCodes).length > 0
      ? { methodVariantCodes: normalizeCodeArray(input.methodVariantCodes), methodVariantSource: input.methodVariantSource ?? 'duration_suggestion_input' }
      : null,
    normalizeCodeArray(input.elementVariantCodes).length > 0
      ? { elementVariantCodes: normalizeCodeArray(input.elementVariantCodes), elementVariantSource: input.elementVariantSource ?? 'duration_suggestion_input' }
      : null,
  )
}

function buildDurationContextProjectGenerationFacts(input: DurationSuggestionInput): Record<string, unknown> {
  return mergeRecords(
    readMetadataObject(input.projectGenerationFacts),
    input.projectTypeCode ? { businessType: input.projectTypeCode } : null,
    input.structureTypeCode ? { structureTypeCode: input.structureTypeCode } : null,
    normalizeCodeArray(input.methodVariantCodes).length > 0
      ? { methodVariantCodes: normalizeCodeArray(input.methodVariantCodes) }
      : null,
    normalizeCodeArray(input.elementVariantCodes).length > 0
      ? { elementVariantCodes: normalizeCodeArray(input.elementVariantCodes) }
      : null,
  )
}

function enrichDurationInputFromProjectGenerationFacts(input: DurationSuggestionInput): DurationSuggestionInput {
  const facts = buildProjectGenerationFactsSnapshot(input.projectGenerationFacts)
  if (Object.keys(facts).length === 0) return input
  const methodVariantCodes = normalizeCodeArray(input.methodVariantCodes)
  const factMethodVariantCodes = normalizeCodeArray(facts.methodVariantCodes)
  const elementVariantCodes = normalizeCodeArray(input.elementVariantCodes)
  const factElementVariantCodes = normalizeCodeArray(facts.elementVariantCodes)

  return {
    ...input,
    projectTypeCode: normalizeId(input.projectTypeCode) || normalizeId(facts.businessType) || input.projectTypeCode,
    structureTypeCode: normalizeId(input.structureTypeCode) || normalizeId(facts.structureTypeCode) || input.structureTypeCode,
    methodVariantCodes: methodVariantCodes.length > 0 ? methodVariantCodes : factMethodVariantCodes,
    methodVariantSource: normalizeId(input.methodVariantSource)
      || (factMethodVariantCodes.length > 0 ? 'project_generation_facts' : input.methodVariantSource),
    elementVariantCodes: elementVariantCodes.length > 0 ? elementVariantCodes : factElementVariantCodes,
    elementVariantSource: normalizeId(input.elementVariantSource)
      || (factElementVariantCodes.length > 0 ? 'project_generation_facts' : input.elementVariantSource),
  }
}

async function loadSuggestionTaskContext(
  taskId: string | null,
  projectId: string | null,
): Promise<SuggestionTaskContextRow | null> {
  if (!taskId || !projectId) return null

  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, project_id, title, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, template_node_id, engineering_category_id, wbs_node_type, standard_work_code, standard_work_name, engineering_object_id, building_object_id, basement_object_id, floor_object_id, physical_zone_object_id, functional_area_object_id, participant_unit_id, acceptance_required, material_required, planned_quantity, quantity_unit, standard_task_metadata, parent_id')
    .eq('id', taskId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    logger.warn('[durationSuggestionService] failed to load task suggestion context', { taskId, error })
  } else if (data) {
    return data as SuggestionTaskContextRow
  }

  try {
    const task = await getTask(taskId)
    if (!task || normalizeId(task.project_id) !== projectId) return null
    return task as SuggestionTaskContextRow
  } catch (fallbackError) {
    logger.warn('[durationSuggestionService] failed to load task suggestion context through task reader', {
      taskId,
      error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
    })
    return null
  }
}

function normalizeParentDurationBoundaryPolicy(value: unknown): ParentDurationBoundaryPolicy | null {
  const normalized = normalizeId(value).toLowerCase()
  if (
    normalized === 'aggregate_package_window'
    || normalized === 'rhythm_package_window'
    || normalized === 'system_package_window'
    || normalized === 'specialty_package_window'
    || normalized === 'itempack_window'
    || normalized === 'parent_package_window'
  ) {
    return normalized as ParentDurationBoundaryPolicy
  }
  return null
}

function normalizeParentDurationPolicySource(value: unknown) {
  const normalized = normalizeId(value).toLowerCase()
  if (!normalized) return null
  return normalized
}

function isTrustedDurationTruthAssetSource(source: unknown) {
  const normalized = normalizeParentDurationPolicySource(source)
  return normalized === 'template_duration_truth_asset'
    || normalized === 'rule_duration_truth_asset'
}

function isHardParentDurationBoundaryPolicy(policy: ParentDurationBoundaryPolicy | string | null | undefined) {
  return policy === 'rhythm_package_window'
    || policy === 'system_package_window'
    || policy === 'specialty_package_window'
    || policy === 'itempack_window'
    || policy === 'parent_package_window'
}

function readParentReferenceDurationDays(row: SuggestionTaskContextRow | null, metadata: Record<string, any>) {
  const durationSuggestion = readMetadataObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const planRollup = readMetadataObject(metadata.planRollup ?? metadata.plan_rollup)
  const floorRhythm = readMetadataObject(metadata.floorRhythm ?? metadata.floor_rhythm)
  return readPositiveNumber(
    durationSuggestion.recommendedDurationDays
    ?? durationSuggestion.recommended_duration_days
    ?? floorRhythm.totalRhythmDurationDays
    ?? floorRhythm.total_rhythm_duration_days
    ?? planRollup.referenceDurationDays
    ?? planRollup.reference_duration_days,
  ) ?? countConstructionProductionDaysInclusive(
    row?.planned_start_date ?? row?.start_date,
    row?.planned_end_date ?? row?.end_date,
  )
}

function resolveParentDurationBoundaryFromRow(
  row: SuggestionTaskContextRow | null,
): ParentDurationBoundaryContext | null {
  if (!row) return null
  const metadata = readMetadataObject(row.standard_task_metadata)
  const durationSuggestion = readMetadataObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const planRollup = readMetadataObject(metadata.planRollup ?? metadata.plan_rollup)
  const floorRhythm = readMetadataObject(metadata.floorRhythm ?? metadata.floor_rhythm)

  const explicitPolicy = normalizeParentDurationBoundaryPolicy(
    metadata.durationBoundaryPolicy
    ?? metadata.duration_boundary_policy
  )
  const explicitSource = normalizeParentDurationPolicySource(
    metadata.durationBoundaryPolicySource
    ?? metadata.duration_boundary_policy_source
  )
  const savedPolicy = normalizeParentDurationBoundaryPolicy(
    durationSuggestion.parentDurationBoundaryPolicy
    ?? durationSuggestion.parent_duration_boundary_policy
  )
  const savedSource = normalizeParentDurationPolicySource(
    durationSuggestion.durationBoundaryPolicySource
    ?? durationSuggestion.duration_boundary_policy_source
    ?? readMetadataObject(durationSuggestion.businessReasonParams ?? durationSuggestion.business_reason_params).parentDurationPolicySource
    ?? readMetadataObject(durationSuggestion.businessReasonParams ?? durationSuggestion.business_reason_params).parent_duration_policy_source
  )
  if (explicitPolicy && !isTrustedDurationTruthAssetSource(explicitSource)) return null
  if (!explicitPolicy && savedPolicy && !isTrustedDurationTruthAssetSource(savedSource)) return null
  const source = explicitPolicy ? explicitSource : savedSource
  const policy = explicitPolicy ?? savedPolicy

  if (!policy) return null

  return {
    parentStandardWorkCode: normalizeId(row.standard_work_code) || null,
    parentTaskTitle: normalizeId(row.title) || null,
    parentDurationBoundaryPolicy: policy,
    parentDurationPolicySource: source,
    parentReferenceDurationDays: readParentReferenceDurationDays(row, metadata),
  }
}

function resolveChildDurationBoundaryFromMetadata(metadata: Record<string, any>): ParentDurationBoundaryContext | null {
  const durationSuggestion = readMetadataObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const params = readMetadataObject(durationSuggestion.businessReasonParams ?? durationSuggestion.business_reason_params)
  const policy = normalizeParentDurationBoundaryPolicy(
    durationSuggestion.parentDurationBoundaryPolicy
    ?? durationSuggestion.parent_duration_boundary_policy
    ?? params.parentDurationBoundaryPolicy
    ?? params.parent_duration_boundary_policy,
  )
  if (!policy) return null
  const source = normalizeParentDurationPolicySource(params.parentDurationPolicySource ?? params.parent_duration_policy_source)
  if (!isTrustedDurationTruthAssetSource(source)) return null
  return {
    parentStandardWorkCode: normalizeId(params.parentStandardWorkCode ?? params.parent_standard_work_code) || null,
    parentTaskTitle: normalizeId(durationSuggestion.parentTaskTitle ?? durationSuggestion.parent_task_title ?? params.parentTaskTitle ?? params.parent_task_title) || null,
    parentDurationBoundaryPolicy: policy,
    parentDurationPolicySource: source,
    parentReferenceDurationDays: readPositiveNumber(
      durationSuggestion.parentReferenceDurationDays
      ?? durationSuggestion.parent_reference_duration_days
      ?? params.parentReferenceDurationDays
      ?? params.parent_reference_duration_days,
    ),
  }
}

function resolvePackageChildRhythmWindowInputFromMetadata(metadata: Record<string, any>) {
  const durationSuggestion = readMetadataObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const params = readMetadataObject(durationSuggestion.businessReasonParams ?? durationSuggestion.business_reason_params)
  const window = readMetadataObject(metadata.packageChildRhythmWindow ?? metadata.package_child_rhythm_window)
  return {
    startDay: readPositiveNumber(
      metadata.rhythmWindowStartDay
      ?? metadata.rhythm_window_start_day
      ?? window.startDay
      ?? window.start_day
      ?? durationSuggestion.packageChildRhythmWindowStartDay
      ?? durationSuggestion.package_child_rhythm_window_start_day
      ?? params.rhythmWindowStartDay
      ?? params.rhythm_window_start_day,
    ),
    endDay: readPositiveNumber(
      metadata.rhythmWindowEndDay
      ?? metadata.rhythm_window_end_day
      ?? window.endDay
      ?? window.end_day
      ?? durationSuggestion.packageChildRhythmWindowEndDay
      ?? durationSuggestion.package_child_rhythm_window_end_day
      ?? params.rhythmWindowEndDay
      ?? params.rhythm_window_end_day,
    ),
    durationDays: readPositiveNumber(
      metadata.rhythmWindowDurationDays
      ?? metadata.rhythm_window_duration_days
      ?? window.durationDays
      ?? window.duration_days
      ?? durationSuggestion.packageChildRhythmWindowDurationDays
      ?? durationSuggestion.package_child_rhythm_window_duration_days,
    ),
    role: normalizeId(
      metadata.rhythmWindowRole
      ?? metadata.rhythm_window_role
      ?? window.role
      ?? window.rhythmWindowRole
      ?? durationSuggestion.packageChildRhythmWindowRole
      ?? durationSuggestion.package_child_rhythm_window_role
      ?? params.rhythmWindowRole
      ?? params.rhythm_window_role,
    ) || null,
  }
}

async function loadParentDurationBoundaryContext(
  parentTaskId: string | null,
  projectId: string | null,
): Promise<ParentDurationBoundaryContext | null> {
  const parent = await loadSuggestionTaskContext(parentTaskId, projectId)
  return resolveParentDurationBoundaryFromRow(parent)
}

async function loadEngineeringObjectFeatureProfile(
  projectId: string | null | undefined,
  objectIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(objectIds.map(normalizeId).filter(Boolean)))
  if (ids.length === 0) return {}

  let query = (supabase as any)
    .from('engineering_objects')
    .select('id, object_type, object_code, object_name, metadata')
    .in('id', ids)

  const normalizedProjectId = normalizeId(projectId)
  if (normalizedProjectId) query = query.eq('project_id', normalizedProjectId)

  const { data, error } = await query
  if (error) {
    logger.warn('[durationSuggestionService] failed to load engineering object feature profile', { objectIds: ids, error })
    return {}
  }

  const rows = Array.isArray(data) ? data as EngineeringObjectContextRow[] : []
  return mergeRecords(...rows.map((row) => {
    const metadata = readMetadataObject(row.metadata)
    const objectType = normalizeId(row.object_type) || 'object'
    return mergeRecords(
      metadata,
      readNestedMetadata(metadata, 'featureProfile'),
      projectGenerationFactsToDurationFeatureProfile(readProjectGenerationFactsSnapshot(metadata)),
      {
        [`${objectType}ObjectCode`]: row.object_code ?? null,
        [`${objectType}ObjectName`]: row.object_name ?? null,
      },
    )
  }))
}

async function countChildTasks(
  taskId: string | null,
  projectId: string | null,
  explicitChildTaskCount?: number | null,
) {
  const explicit = Number(explicitChildTaskCount ?? 0)
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit)
  if (!taskId || !projectId) return null

  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id')
    .eq('parent_id', taskId)
    .eq('project_id', projectId)
    .not('status', 'in', '(deleted,cancelled,closed)')

  if (error || !Array.isArray(data)) return null
  return data.length
}

async function mergeSuggestionTaskContext(input: DurationSuggestionInput): Promise<DurationSuggestionInput> {
  const taskId = normalizeId(input.taskId)
  const requestedProjectId = normalizeId(input.projectId)
  const task = await loadSuggestionTaskContext(taskId, requestedProjectId)
  if (!task) return input

  const metadata = readMetadataObject(task.standard_task_metadata)
  const taskProjectGenerationFacts = readProjectGenerationFactsSnapshot(metadata)
  const taskFeatureProfile = mergeRecords(
    readNestedMetadata(metadata, 'featureProfile'),
    projectGenerationFactsToDurationFeatureProfile(taskProjectGenerationFacts),
  )
  const projectId = requestedProjectId || normalizeId(task.project_id)
  const objectFeatureProfile = await loadEngineeringObjectFeatureProfile(projectId, [
    input.engineeringObjectId ?? task.engineering_object_id,
    input.buildingObjectId ?? task.building_object_id,
    input.floorObjectId ?? task.floor_object_id,
    input.zoneObjectId ?? task.physical_zone_object_id ?? task.functional_area_object_id,
  ])
  const featureProfile = mergeRecords(taskFeatureProfile, objectFeatureProfile)
  const projectGenerationFacts = mergeRecords(
    taskProjectGenerationFacts,
    readMetadataObject(input.projectGenerationFacts),
  )
  const explicitQuantity = readPositiveRawNumber(input.taskQuantity)
  const savedQuantity = readPositiveRawNumber(task.planned_quantity)
  const quantity = explicitQuantity ?? savedQuantity
  const quantitySource: DurationQuantitySource | null = explicitQuantity
    ? 'explicit_task_quantity'
    : savedQuantity
      ? 'task_saved_quantity'
      : input.taskQuantitySource ?? null
  const childTaskCount = await countChildTasks(taskId, projectId, input.childTaskCount)
  const savedParentBoundary = resolveChildDurationBoundaryFromMetadata(metadata)
  const savedPackageChildWindow = resolvePackageChildRhythmWindowInputFromMetadata(metadata)
  const parentBoundary = normalizeParentDurationBoundaryPolicy(input.parentDurationBoundaryPolicy)
    ? null
    : savedParentBoundary ?? await loadParentDurationBoundaryContext(normalizeId(task.parent_id) || null, projectId)
  const coveredBuildingIds = normalizeCodeArray(input.coveredBuildingIds).length > 0
    ? normalizeCodeArray(input.coveredBuildingIds)
    : readMetadataArray(metadata, 'coveredBuildingIds', 'covered_building_ids')
  const coveredFloorIds = normalizeCodeArray(input.coveredFloorIds).length > 0
    ? normalizeCodeArray(input.coveredFloorIds)
    : readMetadataArray(metadata, 'coveredFloorIds', 'covered_floor_ids')

  return {
    ...input,
    projectId,
    taskTitle: normalizeId(input.taskTitle) || normalizeId(task.title),
    templateNodeId: normalizeId(input.templateNodeId) || normalizeId(task.template_node_id),
    templateStableCode: normalizeId(input.templateStableCode),
    engineeringCategoryId: normalizeId(input.engineeringCategoryId) || normalizeId(task.engineering_category_id),
    wbsNodeType: normalizeId(input.wbsNodeType) || normalizeId(task.wbs_node_type),
    standardWorkCode: normalizeId(input.standardWorkCode) || normalizeId(task.standard_work_code),
    standardWorkName: normalizeId(input.standardWorkName) || normalizeId(task.standard_work_name),
    parentStandardWorkCode: normalizeId(input.parentStandardWorkCode) || parentBoundary?.parentStandardWorkCode || null,
    parentTaskTitle: normalizeId(input.parentTaskTitle) || parentBoundary?.parentTaskTitle || null,
    parentDurationBoundaryPolicy: normalizeParentDurationBoundaryPolicy(input.parentDurationBoundaryPolicy) || parentBoundary?.parentDurationBoundaryPolicy || null,
    parentDurationPolicySource: normalizeParentDurationPolicySource(input.parentDurationPolicySource) || parentBoundary?.parentDurationPolicySource || null,
    parentReferenceDurationDays: readPositiveNumber(input.parentReferenceDurationDays) ?? parentBoundary?.parentReferenceDurationDays ?? null,
    engineeringObjectId: normalizeId(input.engineeringObjectId) || normalizeId(task.engineering_object_id),
    buildingObjectId: normalizeId(input.buildingObjectId) || normalizeId(task.building_object_id),
    floorObjectId: normalizeId(input.floorObjectId) || normalizeId(task.floor_object_id),
    zoneObjectId: normalizeId(input.zoneObjectId) || normalizeId(task.physical_zone_object_id) || normalizeId(task.functional_area_object_id),
    coveredBuildingIds,
    coveredFloorIds,
    responsibleUnitId: normalizeId(input.responsibleUnitId) || normalizeId(task.participant_unit_id),
    plannedStartDate: normalizeId(input.plannedStartDate) || normalizeId(task.planned_start_date ?? task.start_date),
    plannedEndDate: normalizeId(input.plannedEndDate) || normalizeId(task.planned_end_date ?? task.end_date),
    actualStartDate: normalizeId(input.actualStartDate) || normalizeId(task.actual_start_date),
    actualEndDate: normalizeId(input.actualEndDate) || normalizeId(task.actual_end_date),
    progress: typeof input.progress === 'number' ? input.progress : Number(task.progress ?? 0),
    acceptanceRequired: input.acceptanceRequired ?? task.acceptance_required ?? null,
    materialRequired: input.materialRequired ?? task.material_required ?? null,
    projectGenerationFacts,
    projectTypeCode: normalizeId(input.projectTypeCode) || normalizeId(featureProfile.projectTypeCode),
    structureTypeCode: normalizeId(input.structureTypeCode) || normalizeId(featureProfile.structureTypeCode),
    methodVariantCodes: normalizeCodeArray(input.methodVariantCodes).length > 0 ? normalizeCodeArray(input.methodVariantCodes) : readMetadataArray(featureProfile, 'methodVariantCodes', 'method_variant_codes'),
    methodVariantSource: normalizeId(input.methodVariantSource)
      || normalizeId(featureProfile.methodVariantSource)
      || normalizeId(featureProfile.method_variant_source),
    elementVariantCodes: normalizeCodeArray(input.elementVariantCodes).length > 0 ? normalizeCodeArray(input.elementVariantCodes) : readMetadataArray(featureProfile, 'elementVariantCodes', 'element_variant_codes'),
    elementVariantSource: normalizeId(input.elementVariantSource)
      || normalizeId(featureProfile.elementVariantSource)
      || normalizeId(featureProfile.element_variant_source)
      || normalizeId(readMetadataObject(metadata.elementVariant).source)
      || normalizeId(readMetadataObject(metadata.element_variant).source),
    taskQuantity: quantity,
    taskQuantityUnit: normalizeId(input.taskQuantityUnit) || normalizeId(task.quantity_unit),
    taskQuantitySource: quantitySource,
    childTaskCount,
    packageChildRhythmWindowStartDay: readPositiveNumber(input.packageChildRhythmWindowStartDay) ?? savedPackageChildWindow.startDay ?? null,
    packageChildRhythmWindowEndDay: readPositiveNumber(input.packageChildRhythmWindowEndDay) ?? savedPackageChildWindow.endDay ?? null,
    packageChildRhythmWindowDurationDays: readPositiveNumber(input.packageChildRhythmWindowDurationDays) ?? savedPackageChildWindow.durationDays ?? null,
    packageChildRhythmWindowRole: normalizeId(input.packageChildRhythmWindowRole) || savedPackageChildWindow.role,
  }
}

async function findBenchmark(benchKey: string, companyId: string | null): Promise<DurationBenchmarkRow | null> {
  let query = (supabase as any)
    .from('duration_benchmarks')
    .select('id, p50_days, p75_days, p80_days, mean_days, sample_count, variance, coefficient_of_variation, confidence_level, confidence_score, company_id, project_id, duration_day_basis, generated_at, source_window_start, source_as_of, metadata')
    .eq('benchmark_key', benchKey)
    .eq('is_current', true)
    .eq('is_active', true)
    .is('project_id', null)

  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw error

  return (data ?? null) as DurationBenchmarkRow | null
}

async function findProjectBenchmark(
  benchKey: string,
  companyId: string | null,
  projectId: string | null,
): Promise<DurationBenchmarkRow | null> {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return null

  let query = (supabase as any)
    .from('duration_benchmarks')
    .select('id, p50_days, p75_days, p80_days, mean_days, sample_count, variance, coefficient_of_variation, confidence_level, confidence_score, company_id, project_id, duration_day_basis, generated_at, source_window_start, source_as_of, metadata')
    .eq('benchmark_key', benchKey)
    .eq('project_id', normalizedProjectId)
    .eq('is_current', true)
    .eq('is_active', true)

  const normalizedCompanyId = normalizeId(companyId)
  query = normalizedCompanyId ? query.eq('company_id', normalizedCompanyId) : query.is('company_id', null)
  const { data, error } = await query.maybeSingle()

  if (error) throw error

  return data
    ? {
        ...(data as DurationBenchmarkRow),
        company_id: normalizedCompanyId || null,
        project_id: normalizedProjectId,
      }
    : null
}

function isTemplateUsableForContext(
  benchmark: DurationBenchmarkRow | null | undefined,
  input: DurationSuggestionInput,
  companyId: string | null,
) {
  if (!benchmark) return false
  const benchmarkCompanyId = normalizeId((benchmark as any).company_id)
  if (benchmarkCompanyId) return companyId != null && benchmarkCompanyId === companyId

  const benchmarkProjectId = normalizeId((benchmark as any).project_id)
  if (benchmarkProjectId) return benchmarkProjectId === normalizeId(input.projectId)

  return true
}

function isBenchmarkCandidateScopeConsistent(
  benchmark: DurationBenchmarkRow,
  scope: BenchmarkScope,
  input: DurationSuggestionInput,
  companyId: string | null,
) {
  const rowCompanyId = normalizeId((benchmark as any).company_id)
  const rowProjectId = normalizeId((benchmark as any).project_id)
  const inputProjectId = normalizeId(input.projectId)

  if (scope === 'project') {
    return Boolean(inputProjectId)
      && rowProjectId === inputProjectId
      && Boolean(companyId)
      && rowCompanyId === companyId
  }
  if (scope === 'company') {
    return Boolean(companyId) && rowCompanyId === companyId && !rowProjectId
  }
  if (scope === 'system') {
    return !rowCompanyId && !rowProjectId
  }
  return isTemplateUsableForContext(benchmark, input, companyId)
}

async function collectBenchmarkCandidates(params: {
  benchmarkIdentity: string
  wbsNodeType: string
  input: DurationSuggestionInput
  companyId: string | null
}): Promise<DurationBenchmarkCandidate[]> {
  for (const contextKey of buildBenchmarkContextKeys(params.input)) {
    const benchKey = [params.benchmarkIdentity, params.wbsNodeType, contextKey].join(':')
    const specificity = benchmarkContextSpecificity(contextKey)
    const candidates: DurationBenchmarkCandidate[] = []
    const occupiedScopes = new Set<BenchmarkScope>()

    const addCandidate = (benchmark: DurationBenchmarkRow | null, scope: BenchmarkScope) => {
      if (!benchmark || !isBenchmarkCandidateScopeConsistent(benchmark, scope, params.input, params.companyId)) return
      if (resolveDurationDayBasis(benchmark as Record<string, unknown>) !== 'construction_production_day') return
      const sampleSize = Number(benchmark.sample_count ?? 0)
      if (!isBenchmarkCandidateUsable(scope, sampleSize, specificity)) return
      candidates.push({
        benchmark,
        scope,
        benchKey,
        contextKey,
        sampleSize,
        specificity,
      })
      occupiedScopes.add(scope)
    }

    const queryExec = createDurationLearningRuntimeQueryExec(params.input)
    if (queryExec) {
      const resolution = await resolveDurationLearningRuntimePublication({
        queryExec,
        assetKey: 'base_duration_benchmark',
        artifactKey: benchKey,
        companyId: params.companyId,
        projectId: params.input.projectId,
        industryKey: params.input.projectTypeCode,
      })
      if (resolution.runtimeConsumable && resolution.publication) {
        const payload = resolution.publication.runtimePayload
        const scope: BenchmarkScope = resolution.publication.scopeLevel === 'project'
          ? 'project'
          : resolution.publication.scopeLevel === 'company'
            ? 'company'
            : 'system'
        addCandidate({
          p50_days: readPositiveNumber(payload.p50Days ?? payload.p50_days),
          p75_days: readPositiveNumber(payload.p75Days ?? payload.p75_days),
          p80_days: readPositiveNumber(payload.p80Days ?? payload.p80_days),
          mean_days: readPositiveNumber(payload.meanDays ?? payload.mean_days),
          sample_count: Number(payload.sampleCount ?? payload.sample_count ?? 0),
          variance: Number(payload.variance ?? payload.coefficientOfVariation ?? payload.coefficient_of_variation ?? 0),
          coefficient_of_variation: Number(payload.coefficientOfVariation ?? payload.coefficient_of_variation ?? payload.variance ?? 0),
          confidence_level: (normalizeId(payload.confidenceLevel ?? payload.confidence_level) || 'medium') as DurationBenchmarkRow['confidence_level'],
          confidence_score: Number(payload.confidenceScore ?? payload.confidence_score ?? 0),
          company_id: resolution.publication.companyId,
          project_id: resolution.publication.projectId,
          duration_day_basis: 'construction_production_day',
          metadata: {
            source: 'duration_learning_runtime_publication',
            publication_key: resolution.publicationKey,
          },
          __durationLearningPublicationKey: resolution.publicationKey,
          __durationLearningPublicationStage: resolution.publication.publicationStage,
          __durationLearningSelectionBasis: resolution.selectionBasis,
        }, scope)
      }
    }

    if (!occupiedScopes.has('project')) {
      addCandidate(await findProjectBenchmark(benchKey, params.companyId, params.input.projectId ?? null), 'project')
    }

    if (params.companyId && !occupiedScopes.has('company')) {
      addCandidate(await findBenchmark(benchKey, params.companyId), 'company')
    }

    if (!occupiedScopes.has('system')) {
      addCandidate(await findBenchmark(benchKey, null), 'system')
    }

    if (candidates.length > 0) return candidates
  }
  return []
}

function benchmarkRowFromCauseSegment(
  benchmark: DurationBenchmarkRow,
  segment: DurationBenchmarkCauseSegment,
): DurationBenchmarkRow {
  return {
    ...benchmark,
    p50_days: segment.p50Days,
    p75_days: segment.p75Days,
    p80_days: segment.p80Days,
    mean_days: segment.meanDays,
    sample_count: segment.sampleCount,
    variance: segment.variance,
    coefficient_of_variation: segment.variance,
    company_id: segment.companyId,
    project_id: segment.projectId,
    duration_day_basis: segment.durationDayBasis,
    generated_at: segment.generatedAt,
    source_window_start: segment.sourceWindowStart,
    source_as_of: segment.sourceAsOf,
  }
}

async function selectCauseAwareBenchmarkCandidates(
  candidates: DurationBenchmarkCandidate[],
  confirmedCauseCode: StructuredCauseCode | null | undefined,
) {
  const primary = candidates[0] ?? null
  if (!confirmedCauseCode || !primary) {
    return {
      candidates,
      segment: null as DurationBenchmarkCauseSegment | null,
      fallback: null as 'all_cause' | null,
    }
  }

  const benchmarkId = normalizeId(primary.benchmark.id)
  if (!benchmarkId) {
    return { candidates, segment: null, fallback: 'all_cause' as const }
  }

  try {
    const segment = await loadCurrentCauseSegment({
      benchmarkId,
      causeCode: confirmedCauseCode,
      companyId: normalizeId(primary.benchmark.company_id) || null,
      projectId: normalizeId(primary.benchmark.project_id) || null,
    }, executeDurationLearningRuntimePublicationQuery)
    if (!segment || !readPositiveNumber(segment.p50Days)) {
      return { candidates, segment: null, fallback: 'all_cause' as const }
    }
    const exactCandidate: DurationBenchmarkCandidate = {
      ...primary,
      benchmark: benchmarkRowFromCauseSegment(primary.benchmark, segment),
      sampleSize: segment.sampleCount,
    }
    return { candidates: [exactCandidate], segment, fallback: null }
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to load exact benchmark cause segment', {
      benchmarkId,
      confirmedCauseCode,
      error,
    })
    return { candidates, segment: null, fallback: 'all_cause' as const }
  }
}

async function findDurationOverride(input: {
  templateNodeId: string
  projectId: string | null
  companyId: string | null
}) {
  const overrideColumns = 'recommended_duration_days, conservative_duration_days, reason'

  if (input.projectId) {
    const { data, error } = await (supabase as any)
      .from('duration_suggestion_overrides')
      .select(overrideColumns)
      .eq('template_node_id', input.templateNodeId)
      .eq('override_status', 'active')
      .eq('project_id', input.projectId)
      .maybeSingle()

    if (error) {
      throw error
    } else if (data) {
      return data as DurationOverrideRow
    }
  }

  if (input.companyId) {
    const { data, error } = await (supabase as any)
      .from('duration_suggestion_overrides')
      .select(overrideColumns)
      .eq('template_node_id', input.templateNodeId)
      .eq('override_status', 'active')
      .eq('company_id', input.companyId)
      .is('project_id', null)
      .maybeSingle()

    if (error) {
      throw error
    } else if (data) {
      return data as DurationOverrideRow
    }
  }

  const { data, error } = await (supabase as any)
    .from('duration_suggestion_overrides')
    .select(overrideColumns)
    .eq('template_node_id', input.templateNodeId)
    .eq('override_status', 'active')
    .is('project_id', null)
    .is('company_id', null)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data ?? null) as DurationOverrideRow | null
}

function buildEmptyContext(durationSource: DurationContextSummary['calculationContext']['duration_source']): DurationContextSummary {
  return {
    contextVersion: 'v1.4.7.4',
    multiplier: 1,
    extraDays: 0,
    confidenceDelta: 0,
    rawConfidenceDelta: 0,
    adjustedBy: [],
    factors: [],
    businessReasons: [],
    hasLowConfidenceSignal: false,
    calculationContext: {
      duration_source: durationSource,
      adjusted_by: [],
      confidence_level: 'low',
      factor_summary_available: false,
    },
  }
}

function capDurationContextConfidenceDelta(value: number) {
  return Math.max(-25, Math.min(15, value))
}

async function safeBuildDurationContext(
  input: DurationSuggestionInput,
  durationSource: DurationContextSummary['calculationContext']['duration_source'],
) {
  try {
    return await buildDurationContext({
      ...input,
      durationSource,
      algorithmFactPhase: mapSuggestionPurposeToFactPhase(resolveSuggestionPurpose(input)),
      projectGenerationFacts: buildDurationContextProjectGenerationFacts(input),
      runtimeExecutionFacts: {
        ...(input.runtimeExecutionFacts ?? {}),
        progressCompletionRatio: input.progress == null ? undefined : Number(input.progress) / 100,
      },
    })
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to build duration context', { error })
    return attachAlgorithmFactContextToSummary(buildEmptyContext(durationSource), input, resolveSuggestionPurpose(input))
  }
}

function appendBusinessReasons(reason: string | null, context: DurationContextSummary) {
  const parts = [
    reason,
    ...context.businessReasons.slice(0, 3),
  ].map((item) => String(item ?? '').trim()).filter(Boolean)
  return parts.length > 0 ? parts.join('; ') : null
}

function applyDurationContextToConservativeDays(days: number | null | undefined, context: DurationContextSummary) {
  const value = Number(days ?? 0)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.max(1, Math.ceil(value * context.multiplier))
}

function mapDurationSource(source: string): DurationContextSummary['calculationContext']['duration_source'] {
  if (source === 'benchmark') return 'benchmark'
  if (source === 'manual_override' || source.startsWith('standard_work_duration_seed')) return 'standard'
  if (source === 'unavailable') return 'legacy'
  return 'legacy'
}

const NEW_TASK_BLOCKED_CONTEXT_FACTORS = new Set<DurationContextFactorKey>([
  'external_readiness',
  'progress_velocity',
  'progress_quality',
])

function resolveSuggestionPurpose(input: DurationSuggestionInput): DurationSuggestionPurpose {
  if (input.suggestionPurpose === 'execution_reference') return 'execution_reference'
  if (input.suggestionPurpose === 'monthly_commitment_window') return 'monthly_commitment_window'
  if (input.suggestionPurpose === 'new_task_reference') return 'new_task_reference'
  return 'new_task_reference'
}

function mapSuggestionPurposeToFactPhase(purpose: DurationSuggestionPurpose): AlgorithmFactContextPhase {
  if (purpose === 'execution_reference') return 'runtime_forecast'
  if (purpose === 'monthly_commitment_window') return 'monthly_plan'
  return 'new_task_reference'
}

function buildDurationSuggestionFactContext(input: DurationSuggestionInput, purpose: DurationSuggestionPurpose) {
  return buildAlgorithmFactContext({
    phase: mapSuggestionPurposeToFactPhase(purpose),
    projectGenerationFacts: buildDurationContextProjectGenerationFacts(input),
    runtimeExecutionFacts: {
      ...(input.runtimeExecutionFacts ?? {}),
      progressCompletionRatio: input.progress == null ? undefined : Number(input.progress) / 100,
    },
  })
}

function attachAlgorithmFactContextToSummary(
  context: DurationContextSummary,
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
): DurationContextSummary {
  const algorithmFactContext = buildDurationSuggestionFactContext(input, purpose)
  return {
    ...context,
    calculationContext: {
      ...context.calculationContext,
      algorithm_fact_context: summarizeAlgorithmFactContext(algorithmFactContext),
    },
  }
}

function durationContextFactorImpactScore(factor: DurationContextSummary['factors'][number]) {
  return Math.abs(Number(factor.multiplier ?? 1) - 1) * 100
    + Math.max(0, Number(factor.extraDays ?? 0))
    + Math.abs(Number(factor.confidenceDelta ?? 0))
}

function rebuildDurationContext(context: DurationContextSummary, factors: DurationContextSummary['factors']): DurationContextSummary {
  const sortedFactors = [...factors].sort((a, b) => durationContextFactorImpactScore(b) - durationContextFactorImpactScore(a))
  const allowedFactorKeys = new Set(sortedFactors.map((factor) => factor.key))
  const filteredLedger = (context.calculationContext.factor_contribution_ledger ?? [])
    .filter((entry) => allowedFactorKeys.has(entry.key))
  const summaryContext: DurationContextSummary = {
    ...context,
    factors: sortedFactors,
    calculationContext: {
      ...context.calculationContext,
      factor_contribution_ledger: filteredLedger.length > 0 ? filteredLedger : undefined,
    },
  }
  const effectiveSummary = summarizeEffectiveDurationContextContributions(summaryContext, {
    includeConfidenceOnly: true,
    includeCandidateOnly: true,
  })
  const multiplier = effectiveSummary.multiplier
  const extraDays = effectiveSummary.extraDays
  const rawConfidenceDelta = effectiveSummary.rawConfidenceDelta
  const confidenceDelta = capDurationContextConfidenceDelta(rawConfidenceDelta)
  const adjustedBy = effectiveSummary.adjustedBy.length > 0
    ? effectiveSummary.adjustedBy
    : Array.from(new Set(sortedFactors.map((factor) => factor.key))).slice(0, 3)

  return {
    ...context,
    multiplier: clamp(multiplier, 0.4, 2.5),
    extraDays: Math.min(30, extraDays),
    confidenceDelta,
    rawConfidenceDelta,
    adjustedBy,
    factors: sortedFactors,
    businessReasons: sortedFactors.slice(0, 3).map((factor) => factor.reason),
    hasLowConfidenceSignal: sortedFactors.some((factor) => factor.actionPolicy === 'confidence_only' || factor.confidenceDelta <= -10),
    calculationContext: {
      ...context.calculationContext,
      adjusted_by: adjustedBy,
      confidence_level: scoreToDurationConfidenceLevel(60 + confidenceDelta),
      factor_summary_available: sortedFactors.length > 0,
      raw_multiplier: multiplier,
      raw_extra_days: extraDays,
      raw_confidence_delta: rawConfidenceDelta,
      confidence_delta_cap: -25,
      confidence_delta_cap_applied: rawConfidenceDelta !== confidenceDelta,
      factor_contribution_ledger: effectiveSummary.contributions,
    },
  }
}

function filterDurationContextForPurpose(
  context: DurationContextSummary,
  purpose: DurationSuggestionPurpose,
): DurationContextSummary {
  if (purpose !== 'new_task_reference') return context
  const filtered = context.factors.filter((factor) => !NEW_TASK_BLOCKED_CONTEXT_FACTORS.has(factor.key))
  if (filtered.length === context.factors.length) return context
  return rebuildDurationContext(context, filtered)
}

function buildBenchmarkContextKeys(input: DurationSuggestionInput) {
  const methodCodes = trustedMethodVariantCodes(input)
  const elementCodes = trustedElementVariantCodes(input)
  const unitCode = normalizeId(input.responsibleUnitId)
  const parts = [
    normalizeId(input.projectTypeCode) ? `project=${normalizeId(input.projectTypeCode)}` : '',
    normalizeId(input.structureTypeCode) ? `structure=${normalizeId(input.structureTypeCode)}` : '',
    methodCodes.length > 0 ? `method=${methodCodes.join('+')}` : '',
    elementCodes.length > 0 ? `element=${elementCodes.join('+')}` : '',
  ].filter(Boolean)
  const baseContext = parts.length > 0 ? parts.join('|') : 'all'
  const candidates = unitCode
    ? [
      baseContext === 'all' ? `unit=${unitCode}` : `${baseContext}|unit=${unitCode}`,
      `unit=${unitCode}`,
      baseContext,
      'all',
    ]
    : [baseContext, 'all']
  return Array.from(new Set(candidates))
}

function countUniqueIds(...values: unknown[]) {
  const ids = new Set<string>()
  for (const value of values) {
    if (Array.isArray(value)) {
      value.map(normalizeId).filter(Boolean).forEach((item) => ids.add(item))
    } else {
      const id = normalizeId(value)
      if (id) ids.add(id)
    }
  }
  return ids.size
}

function normalizeCoverageExecutionMode(value: unknown): CoverageExecutionMode | null {
  const normalized = normalizeId(value).toLowerCase()
  if (!normalized) return null
  if (['parallel', 'parallel_group', 'parallel_with_previous', 'parallel_multi_tower'].includes(normalized)) return 'parallel'
  if (['stagger', 'staggered', 'flow', '流水', 'flow_sequence'].includes(normalized)) return 'stagger'
  if (['sequential', 'sequence', 'serial', 'sequential_resource_limited'].includes(normalized)) return 'sequential'
  return null
}

function readCoverageExecutionModeFromRecord(record: Record<string, any>, source: string): CoverageExecutionModeSignal | null {
  const direct = normalizeCoverageExecutionMode(
    record.coverageExecutionMode
    ?? record.coverage_execution_mode
    ?? record.buildingExecutionMode
    ?? record.building_execution_mode
    ?? record.scheduleMode
    ?? record.schedule_mode
    ?? record.executionMode
    ?? record.execution_mode,
  )
  if (direct) return { mode: direct, source }

  const patternCode = normalizeId(record.buildingPatternCode ?? record.building_pattern_code ?? record.patternCode ?? record.pattern_code).toLowerCase()
  if (patternCode === 'multi_building_parallel_flow') return { mode: 'parallel', source }

  const patternCodes = normalizeCodeArray(record.buildingPatternCodes ?? record.building_pattern_codes ?? record.patternCodes ?? record.pattern_codes)
  if (patternCodes.includes('multi_building_parallel_flow')) return { mode: 'parallel', source }

  const staggerRules = [
    ...(Array.isArray(record.buildingPatternMergedStaggerRules ?? record.building_pattern_merged_stagger_rules) ? record.buildingPatternMergedStaggerRules ?? record.building_pattern_merged_stagger_rules : []),
    ...(Array.isArray(record.staggerRules ?? record.stagger_rules) ? record.staggerRules ?? record.stagger_rules : []),
  ].map(readMetadataObject)
  if (staggerRules.some((rule) => normalizeId(rule.ruleCode ?? rule.rule_code).toLowerCase().includes('parallel'))) {
    return { mode: 'parallel', source }
  }

  return null
}

function resolveCoverageExecutionModeSignal(
  input: DurationSuggestionInput,
  seedPayload?: Record<string, any> | null,
  factorSummary?: DurationContextSummary | null,
): CoverageExecutionModeSignal | null {
  const inputSignal = readCoverageExecutionModeFromRecord(input as Record<string, any>, 'input')
    ?? readCoverageExecutionModeFromRecord(readMetadataObject(input.runtimeExecutionFacts), 'runtimeExecutionFacts')
  if (inputSignal) return inputSignal

  const workflowFactor = factorSummary?.factors.find((factor) => factor.key === 'workflow_sequence')
  const workflowSignal = readCoverageExecutionModeFromRecord(readMetadataObject(workflowFactor?.metadata), 'workflow_sequence.building_pattern')
  if (workflowSignal) return workflowSignal

  return readCoverageExecutionModeFromRecord(readMetadataObject(seedPayload), 'seed')
}

function adjustCoverageFactorByExecutionMode(factor: number, count: number, modeSignal: CoverageExecutionModeSignal | null) {
  if (!modeSignal || count <= 1 || factor <= 1) return { factor, signals: [] as string[] }
  const adjusted = modeSignal.mode === 'parallel'
    ? 1 + (count - 1) * 0.15
    : modeSignal.mode === 'stagger'
      ? 1 + (count - 1) * 0.35
      : 1 + (count - 1) * 0.7
  return {
    factor: Math.max(1, adjusted),
    signals: [
      `coverageExecutionMode=${modeSignal.mode}`,
      `coverageExecutionModeSource=${modeSignal.source}`,
    ],
  }
}

function coverageScaleFactor(
  input: DurationSuggestionInput,
  seedPayload?: Record<string, any> | null,
  factorSummary?: DurationContextSummary | null,
) {
  const buildingCount = countUniqueIds(input.coveredBuildingIds, input.buildingObjectId)
  const floorCount = countUniqueIds(input.coveredFloorIds, input.floorObjectId)
  const buildingFactor = buildingCount >= 7 ? 2.2 : buildingCount >= 4 ? 1.8 : buildingCount >= 2 ? 1.4 : 1
  const floorFactor = floorCount >= 8 ? 2 : floorCount >= 4 ? 1.7 : floorCount >= 2 ? 1.3 : 1
  const modeSignal = resolveCoverageExecutionModeSignal(input, seedPayload, factorSummary)
  const adjustedBuilding = adjustCoverageFactorByExecutionMode(buildingFactor, buildingCount, modeSignal)
  const adjustedFloor = adjustCoverageFactorByExecutionMode(floorFactor, floorCount, modeSignal)
  const selected = Math.max(adjustedBuilding.factor, adjustedFloor.factor)
  if (selected > 1) {
    const selectedSignals = adjustedBuilding.factor >= adjustedFloor.factor ? adjustedBuilding.signals : adjustedFloor.signals
    const scopeText = adjustedBuilding.factor >= adjustedFloor.factor ? `${buildingCount} 栋楼` : `${floorCount} 层`
    return {
      factor: selected,
      reason: `覆盖 ${scopeText}`,
      signals: selectedSignals,
      maxFactor: selectedSignals.length > 0 ? 4 : 2.5,
    }
  }
  return { factor: 1, reason: null, signals: [] as string[], maxFactor: 2.5 }
}

function childTaskScaleFactor(childTaskCount?: number | null) {
  const count = Number(childTaskCount ?? 0)
  if (!Number.isFinite(count) || count <= 1) return { factor: 1, reason: null }
  if (count >= 12) return { factor: 2, reason: `包含 ${count} 个子任务` }
  if (count >= 7) return { factor: 1.7, reason: `包含 ${count} 个子任务` }
  if (count >= 3) return { factor: 1.35, reason: `包含 ${count} 个子任务` }
  return { factor: 1.15, reason: `包含 ${count} 个子任务` }
}

function normalizeQuantityUnit(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  return normalized
    .replace(/㎡|m2|平米|平方米/g, 'm²')
    .replace(/m3|立方米/g, 'm³')
    .replace(/吨/g, 't')
}

function quantityUnitsCompatible(taskUnit?: string | null, defaultUnit?: string | null) {
  const task = normalizeQuantityUnit(taskUnit)
  const standard = normalizeQuantityUnit(defaultUnit)
  return !task || !standard || task === standard
}

function hasOwnSeedField(seedPayload: Record<string, any> | null | undefined, ...keys: string[]) {
  if (!seedPayload) return false
  return keys.some((key) => Object.prototype.hasOwnProperty.call(seedPayload, key))
}

function resolveScaleFixedDays(baseDays: number | null, seedPayload?: Record<string, any> | null) {
  const declared = hasOwnSeedField(seedPayload, 'fixedDays', 'fixed_days')
  const explicitFixed = readOptionalNonNegativeNumber(seedPayload?.fixedDays ?? seedPayload?.fixed_days)
  if (declared) return Math.max(0, Math.ceil(explicitFixed ?? 0))
  return baseDays ? Math.max(1, Math.floor(baseDays * 0.2)) : 0
}

function combineScopeScaleSignals(
  coverage: ReturnType<typeof coverageScaleFactor>,
  child: ReturnType<typeof childTaskScaleFactor>,
) {
  if (coverage.factor <= 1 || child.factor <= 1) return null
  const max = Math.max(coverage.factor, child.factor)
  const min = Math.min(coverage.factor, child.factor)
  const factor = max * (1 + 0.1 * (min / max))
  const reasons = [coverage.reason, child.reason].map((item) => String(item ?? '').trim()).filter(Boolean)
  return {
    factor,
    reason: `${reasons.join(' + ')}，规模信号叠加`,
    source: 'coverage' as const,
    quantitySource: 'engineering_object_proxy' as const,
    quantityConfidence: 'medium' as const,
    signals: [...reasons, ...coverage.signals],
    maxFactor: coverage.maxFactor,
  }
}

function scaleConfidenceWeight(confidence: DurationScaleAdjustment['confidence']) {
  if (confidence === 'high') return 1
  if (confidence === 'medium') return 0.85
  if (confidence === 'low') return 0.5
  return 0
}

function applyScaleConfidenceWeight(factor: number, confidence: DurationScaleAdjustment['confidence']) {
  const weight = scaleConfidenceWeight(confidence)
  if (!Number.isFinite(factor) || factor === 1) return 1
  return 1 + ((factor - 1) * weight)
}

function appendScaleConfidenceSignals(
  signals: string[],
  rawFactor: number,
  effectiveFactor: number,
  confidence: DurationScaleAdjustment['confidence'],
) {
  if (Math.abs(rawFactor - effectiveFactor) < 0.001) return signals
  return [
    ...signals,
    `rawScaleFactor=${Number(rawFactor.toFixed(3))}`,
    `scaleConfidenceWeight=${Number(scaleConfidenceWeight(confidence).toFixed(3))}`,
  ]
}

async function resolveScaleAdjustment(
  input: DurationSuggestionInput,
  baseDays: number | null,
  seedPayload?: Record<string, any> | null,
  factorSummary?: DurationContextSummary | null,
): Promise<DurationScaleAdjustment> {
  const days = readPositiveNumber(baseDays)
  const fixedDays = resolveScaleFixedDays(days, seedPayload)
  const variableDays = Math.max(0, Number(seedPayload?.variableDays ?? seedPayload?.variable_days ?? (days ? Math.max(0, days - fixedDays) : 0)))
  const quantity = readPositiveRawNumber(input.taskQuantity)
  const defaultQuantity = readPositiveRawNumber(input.defaultQuantity ?? seedPayload?.defaultQuantity ?? seedPayload?.default_quantity)
  const defaultQuantityUnit = input.defaultQuantityUnit ?? seedPayload?.defaultQuantityUnit ?? seedPayload?.default_quantity_unit ?? null
  const explicitQuantitySource: DurationQuantitySource = input.taskQuantitySource === 'task_saved_quantity'
    ? 'task_saved_quantity'
    : 'explicit_task_quantity'
  if (quantity && defaultQuantity && quantityUnitsCompatible(input.taskQuantityUnit, defaultQuantityUnit)) {
    const batchCapacity = readPositiveRawNumber(seedPayload?.batchCapacity ?? seedPayload?.batch_capacity)
    const scopeSuggestsBatch = countUniqueIds(input.coveredBuildingIds, input.buildingObjectId) >= 2
      || countUniqueIds(input.coveredFloorIds, input.floorObjectId) >= 2
    if (batchCapacity && quantity / defaultQuantity > 2 && scopeSuggestsBatch) {
      const interBatchRatio = clamp(readPositiveRawNumber(seedPayload?.interBatchRatio ?? seedPayload?.inter_batch_ratio) ?? 0.2, 0, 0.5)
      const batchCount = Math.max(1, Math.ceil(quantity / batchCapacity))
      const factor = clamp(batchCount + Math.max(0, batchCount - 1) * interBatchRatio, 0.6, 4)
      return {
        factor,
        source: 'quantity',
        quantitySource: explicitQuantitySource,
        quantityConfidence: 'high',
        reason: `按 ${batchCount} 个施工批次约 ${Number(factor.toFixed(2))} 倍修正`,
        fixedDays,
        variableDays,
        confidence: 'high',
        signals: [
          `quantitySource=${explicitQuantitySource}`,
          `taskQuantity=${quantity}`,
          `defaultQuantity=${defaultQuantity}`,
          `batchCapacity=${batchCapacity}`,
          `batchCount=${batchCount}`,
          `interBatchRatio=${Number(interBatchRatio.toFixed(3))}`,
          `quantityUnit=${normalizeQuantityUnit(input.taskQuantityUnit) ?? normalizeQuantityUnit(defaultQuantityUnit) ?? 'unknown'}`,
        ],
      }
    }
    const exponent = readPositiveRawNumber(seedPayload?.quantityScaleExponent ?? seedPayload?.quantity_scale_exponent) ?? 0.7
    const factor = Math.max(0.6, Math.pow(quantity / defaultQuantity, exponent))
    return {
      factor,
      source: 'quantity',
      quantitySource: explicitQuantitySource,
      quantityConfidence: 'high',
      reason: `按工程量约 ${Number(factor.toFixed(2))} 倍修正`,
      fixedDays,
      variableDays,
      confidence: 'high',
      signals: [`quantitySource=${explicitQuantitySource}`, `taskQuantity=${quantity}`, `defaultQuantity=${defaultQuantity}`, `quantityScaleExponent=${Number(exponent.toFixed(3))}`, `quantityUnit=${normalizeQuantityUnit(input.taskQuantityUnit) ?? normalizeQuantityUnit(defaultQuantityUnit) ?? 'unknown'}`],
    }
  }

  const projectFactScaling = days && seedPayload
    ? resolveProjectFactDurationScaling(
      days,
      seedPayload as any,
      buildDurationSeedFeatureProfile(input) as any,
    )
    : null
  if (
    projectFactScaling
    && projectFactScaling.source
    && projectFactScaling.quantity
    && projectFactScaling.defaultQuantity
    && projectFactScaling.factor !== 1
  ) {
    const rawFactor = projectFactScaling.factor
    const confidence: DurationScaleAdjustment['confidence'] = 'medium'
    const factor = applyScaleConfidenceWeight(rawFactor, confidence)
    return {
      factor,
      source: 'project_fact_scale_proxy',
      quantitySource: 'engineering_object_proxy',
      quantityConfidence: 'medium',
      reason: `按项目静态画像约 ${Number(factor.toFixed(2))} 倍修正`,
      fixedDays: 0,
      variableDays: days ?? 0,
      confidence,
      signals: appendScaleConfidenceSignals([
        'quantitySource=engineering_object_proxy',
        `scaleBasis=${projectFactScaling.basis ?? 'unknown'}`,
        `projectScaleRatio=${Number((projectFactScaling.projectScaleRatio ?? projectFactScaling.factor).toFixed(3))}`,
        `quantity=${Number(projectFactScaling.quantity.toFixed(3))}`,
        `defaultQuantity=${Number(projectFactScaling.defaultQuantity.toFixed(3))}`,
        ...(projectFactScaling.baseline ? [`baseline=${JSON.stringify(projectFactScaling.baseline)}`] : []),
      ], rawFactor, factor, confidence),
    }
  }

  const coverage = coverageScaleFactor(input, seedPayload, factorSummary)
  const child = childTaskScaleFactor(input.childTaskCount)
  const title = await inferTitleWeakScaleSignalFromResolver(buildBaselineMatchText(input), {
    projectId: input.projectId,
    companyId: input.companyId,
    standardWorkCode: input.standardWorkCode,
    templateNodeId: input.templateNodeId,
    projectTypeCode: input.projectTypeCode,
    structureTypeCode: input.structureTypeCode,
    methodVariantCodes: trustedMethodVariantCodes(input),
    elementVariantCodes: trustedElementVariantCodes(input),
  })
  const combinedScope = combineScopeScaleSignals(coverage, child)
  const candidates = [
    combinedScope,
    { ...coverage, source: 'coverage' as const, quantitySource: 'engineering_object_proxy' as const, quantityConfidence: 'medium' as const, signals: [coverage.reason, ...coverage.signals].map((item) => String(item ?? '').trim()).filter(Boolean) },
    { ...child, source: 'children' as const, quantitySource: 'scope_proxy' as const, quantityConfidence: 'medium' as const },
    { ...title, source: 'title' as const, quantitySource: 'scope_proxy' as const, quantityConfidence: 'low' as const },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item) && item.factor !== 1)

  if (candidates.length === 0) {
    const quantitySource: DurationQuantitySource = defaultQuantity ? 'seed_default_quantity' : 'none'
    return {
      factor: 1,
      reason: null,
      source: 'none',
      quantitySource,
      quantityConfidence: defaultQuantity ? 'low' : 'unavailable',
      fixedDays,
      variableDays,
      confidence: 'unavailable',
      signals: defaultQuantity ? [`quantitySource=${quantitySource}`, `defaultQuantity=${defaultQuantity}`, `defaultQuantityUnit=${normalizeQuantityUnit(defaultQuantityUnit) ?? 'unknown'}`] : [],
    }
  }

  candidates.sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))
  const selected = candidates[0]
  const selectedSignals = 'signals' in selected ? selected.signals : undefined
  const maxFactor = 'maxFactor' in selected && Number.isFinite(Number(selected.maxFactor))
    ? Number(selected.maxFactor)
    : 2.5
  const confidence: DurationScaleAdjustment['confidence'] = selected.source === 'title' ? 'low' : 'medium'
  const rawFactor = clamp(selected.factor, 0.6, maxFactor)
  const factor = applyScaleConfidenceWeight(rawFactor, confidence)
  const baseSignals = selectedSignals
    ? [`quantitySource=${selected.quantitySource}`, ...selectedSignals]
    : selected.reason
      ? [`quantitySource=${selected.quantitySource}`, selected.reason]
      : [`quantitySource=${selected.quantitySource}`]
  return {
    factor,
    reason: selected.reason,
    source: selected.source,
    quantitySource: selected.quantitySource,
    quantityConfidence: selected.quantityConfidence,
    fixedDays,
    variableDays,
    confidence,
    signals: appendScaleConfidenceSignals(baseSignals, rawFactor, factor, confidence),
  }
}

function applyScaleToDays(days: number | null | undefined, adjustment: DurationScaleAdjustment) {
  const base = readPositiveNumber(days)
  if (!base || adjustment.factor === 1) return base
  const fixed = Math.min(base, adjustment.fixedDays)
  const variable = Math.max(0, base - fixed)
  return Math.max(1, Math.ceil(fixed + variable * adjustment.factor))
}

function appendScaleReason(reason: string | null, adjustment: DurationScaleAdjustment) {
  if (!adjustment.reason || adjustment.factor === 1) return reason
  const scaleReason = `${adjustment.reason}，已做规模修正`
  return [reason, scaleReason].map((item) => String(item ?? '').trim()).filter(Boolean).join('；')
}

function withScaleFactorSummary(base: DurationSuggestion, adjustment: DurationScaleAdjustment): DurationSuggestion {
  if (adjustment.factor === 1) return base
  const factorSummary = base.factorSummary
    ? {
      ...base.factorSummary,
      scaleFactor: Number(adjustment.factor.toFixed(3)),
      scaleConfidence: adjustment.confidence,
      scaleBasis: adjustment.source,
      scaleSignals: adjustment.signals,
      scaleReason: adjustment.reason,
    }
    : base.factorSummary

  return {
    ...base,
    factorSummary,
  }
}

function withQuantitySourceSummary(base: DurationSuggestion, adjustment: DurationScaleAdjustment): DurationSuggestion {
  const factorSummary = base.factorSummary
    ? {
      ...base.factorSummary,
      quantitySource: adjustment.quantitySource,
      quantityConfidence: adjustment.quantityConfidence,
      quantitySignals: adjustment.signals,
    }
    : base.factorSummary

  return {
    ...base,
    factorSummary,
    quantitySource: adjustment.quantitySource,
    quantityConfidence: adjustment.quantityConfidence,
    businessReasonParams: {
      ...(base.businessReasonParams ?? {}),
      quantitySource: adjustment.quantitySource,
      quantityConfidence: adjustment.quantityConfidence,
      quantitySignals: adjustment.signals,
    },
    factorAvailability: {
      ...(base.factorAvailability ?? {}),
      explicit_quantity: adjustment.quantitySource === 'explicit_task_quantity' || adjustment.quantitySource === 'task_saved_quantity',
      engineering_object_quantity_proxy: adjustment.quantitySource === 'engineering_object_proxy',
      scope_quantity_proxy: adjustment.quantitySource === 'scope_proxy',
      seed_default_quantity: adjustment.quantitySource === 'seed_default_quantity',
    },
  }
}

function applyScaleAdjustment(base: DurationSuggestion, adjustment: DurationScaleAdjustment): DurationSuggestion {
  const withQuantitySummary = withQuantitySourceSummary(base, adjustment)
  if (adjustment.factor === 1) return withQuantitySummary
  const withScaleSummary = withScaleFactorSummary(withQuantitySummary, adjustment)

  return {
    ...withScaleSummary,
    recommendedDurationDays: applyScaleToDays(base.recommendedDurationDays, adjustment),
    conservativeDurationDays: applyScaleToDays(base.conservativeDurationDays ?? base.recommendedDurationDays, adjustment),
    confidenceScore: Math.max(10, Number(base.confidenceScore ?? 50) - (adjustment.source === 'title' ? 8 : 3)),
    confidenceLevel: scoreToDurationConfidenceLevel(Math.max(10, Number(base.confidenceScore ?? 50) - (adjustment.source === 'title' ? 8 : 3))),
    businessReason: appendScaleReason(base.businessReason, adjustment),
    factorAvailability: {
      ...(base.factorAvailability ?? {}),
      explicit_quantity: adjustment.quantitySource === 'explicit_task_quantity' || adjustment.quantitySource === 'task_saved_quantity',
      engineering_object_quantity_proxy: adjustment.quantitySource === 'engineering_object_proxy',
      scope_quantity_proxy: adjustment.quantitySource === 'scope_proxy',
      seed_default_quantity: adjustment.quantitySource === 'seed_default_quantity',
      task_scale_proxy: true,
    },
  }
}

function resolveDataMaturity(
  input: DurationSuggestionInput,
  sampleSize = 0,
  purpose: DurationSuggestionPurpose = resolveSuggestionPurpose(input),
  evidenceScope: DurationMaturityEvidenceScope = 'unknown',
) {
  const reasons: string[] = []
  const upgradePath: string[] = []
  const upgradeBlockedBy: string[] = []
  const hasScopeProxy = Boolean(
    input.taskQuantity
      || input.buildingObjectId
      || input.floorObjectId
      || input.zoneObjectId
      || input.coveredBuildingIds?.length
      || input.coveredFloorIds?.length
      || input.childTaskCount,
  )
  const hasExecutionLearning = purpose === 'execution_reference'
    && Boolean(input.taskId && Number(input.progress ?? 0) > 0)
  const factorAvailability: Record<string, boolean> = {
    standard_classification: hasCoreClassification(input),
    project_benchmark: evidenceScope === 'project'
      ? sampleSize >= 5
      : evidenceScope === 'unknown' && sampleSize >= 5,
    company_benchmark: evidenceScope === 'company' ? sampleSize >= 15 : sampleSize >= 50,
    company_governed_seed: evidenceScope === 'company',
    system_benchmark: evidenceScope === 'system' && sampleSize >= 50,
    scope_proxy: hasScopeProxy,
    execution_learning: hasExecutionLearning,
    new_task_reference: purpose === 'new_task_reference',
  }

  if (!factorAvailability.standard_classification) {
    reasons.push('missing task classification')
    upgradePath.push('add a standard work code, WBS node, or engineering category')
    upgradeBlockedBy.push('missing templateNodeId / templateStableCode / standardWorkCode / engineeringCategoryId')
    return { level: 'L0' as const, reasons, upgradePath, upgradeBlockedBy, factorAvailability }
  }

  if (sampleSize >= 5 || hasScopeProxy || hasExecutionLearning || evidenceScope === 'company' || evidenceScope === 'project') {
    reasons.push(sampleSize >= 5 ? 'similar samples are available' : 'scope proxy, governed seed, or execution facts are available')
  } else {
    reasons.push('classified task with limited samples and scope data')
    upgradePath.push('collect similar completed tasks or add engineering-object coverage')
    upgradeBlockedBy.push('similar completed samples fewer than 5')
  }

  if (purpose === 'new_task_reference') {
    if (evidenceScope === 'company') {
      reasons.push('published company-governed duration seed is available for cold-start reference duration')
      return { level: 'L2' as const, reasons, upgradePath, upgradeBlockedBy, factorAvailability }
    }
    if (sampleSize < 15) upgradeBlockedBy.push('company-level samples fewer than 15')
    if (!hasScopeProxy) upgradePath.push('add engineering-object coverage, floors, quantity, or child-task scale proxy')
    return { level: evidenceScope === 'project' || sampleSize >= 5 || hasScopeProxy ? 'L1' as const : 'L0' as const, reasons, upgradePath, upgradeBlockedBy, factorAvailability }
  }

  if (sampleSize >= 15 && hasScopeProxy && hasExecutionLearning) {
    reasons.push('samples, scope, and execution facts are mature')
    return { level: 'L2' as const, reasons, upgradePath, upgradeBlockedBy, factorAvailability }
  }

  if (sampleSize < 15) upgradeBlockedBy.push('company-level samples fewer than 15')
  if (!hasExecutionLearning) upgradePath.push('collect progress snapshots and actual duration after execution starts')
  return { level: sampleSize >= 5 || hasScopeProxy || hasExecutionLearning ? 'L1' as const : 'L0' as const, reasons, upgradePath, upgradeBlockedBy, factorAvailability }
}

function withMaturityFactorSummary(
  context: DurationContextSummary,
  suggestion: Pick<DurationSuggestion, 'dataMaturity' | 'factorAvailability' | 'dataUpgradePath' | 'dataUpgradeBlockedBy'>,
): DurationContextSummary {
  return {
    ...context,
    dataMaturity: suggestion.dataMaturity,
    factorAvailability: suggestion.factorAvailability,
    upgradePath: suggestion.dataUpgradePath,
    upgradeBlockedBy: suggestion.dataUpgradeBlockedBy,
    dataDependencies: Array.from(new Set(context.factors.flatMap((factor) => factor.dataDependencies ?? []))),
  }
}

function resolveSeedEvidenceScope(seed: Record<string, any>): DurationMaturityEvidenceScope {
  if (seed.__resolverSource === 'company_override') return 'company'
  if (seed.__resolverSource === 'project_override') return 'project'
  return 'unknown'
}

function readSeedGovernanceSampleSize(seed: Record<string, any>, evidenceScope: DurationMaturityEvidenceScope) {
  const explicit = Number(seed.sampleCount ?? seed.sample_count ?? seed.governanceSampleCount ?? seed.governance_sample_count ?? 0)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  if (evidenceScope === 'company') return 15
  if (evidenceScope === 'project') return 5
  return 0
}

function benchmarkContextSpecificity(contextKey: string) {
  return contextKey === 'all' ? 'all' : 'specific'
}

function isBenchmarkCandidateUsable(
  scope: BenchmarkScope,
  sampleSize: number,
  specificity: 'all' | 'specific',
) {
  if (scope === 'project' || scope === 'company') return sampleSize >= 5
  return specificity === 'all' ? sampleSize >= 100 : sampleSize >= 50
}

type BenchmarkBlendRuntimeParameter = {
  weight: number
  publicationKey: string | null
  publicationStatus: string | null
  scopeLevel: string | null
  p50P75BlendRatio?: number | null
  p50P75BlendRatioPublicationKey?: string | null
  p50P75BlendRatioPublicationStatus?: string | null
  p50P75BlendRatioScopeLevel?: string | null
}

function benchmarkBlendWeight(sampleCount: number, runtimeWeight?: number | null) {
  if (
    typeof runtimeWeight === 'number'
    && Number.isFinite(runtimeWeight)
    && runtimeWeight >= 0
    && runtimeWeight <= 1
  ) {
    return runtimeWeight
  }
  if (sampleCount >= 20) return 0.7
  if (sampleCount >= 10) return 0.5
  if (sampleCount >= 5) return 0.3
  return 0
}

function benchmarkReferenceFromP50P75(
  p50: number,
  p75: number | null,
  runtimeParameter?: BenchmarkBlendRuntimeParameter | null,
) {
  const ratio = runtimeParameter?.p50P75BlendRatio
  if (
    p75
    && typeof ratio === 'number'
    && Number.isFinite(ratio)
    && ratio >= 0
    && ratio <= 1
  ) {
    return {
      days: Math.max(1, Math.ceil(p50 * (1 - ratio) + p75 * ratio)),
      source: 'p50_p75_runtime_publication' as const,
      ratio,
      ratioSource: 'parameter_runtime_publication' as const,
      ratioPublicationKey: runtimeParameter?.p50P75BlendRatioPublicationKey ?? null,
      ratioScopeLevel: runtimeParameter?.p50P75BlendRatioScopeLevel ?? null,
      ratioAppliedTo: 'company_benchmark_runtime_reference_only' as const,
    }
  }

  return {
    days: p50,
    source: 'p50_default' as const,
    ratio: null,
    ratioSource: null,
    ratioPublicationKey: null,
    ratioScopeLevel: null,
    ratioAppliedTo: null,
  }
}

function readBenchmarkMetadataNumber(benchmark: DurationBenchmarkRow | null | undefined, ...keys: string[]) {
  const metadata = readMetadataObject(benchmark?.metadata)
  for (const key of keys) {
    const value = readPositiveRawNumber((benchmark as any)?.[key] ?? metadata[key])
    if (value !== null) return value
  }
  return null
}

function resolveBenchmarkP80Days(benchmark: DurationBenchmarkRow | null | undefined) {
  const explicit = readPositiveNumber(benchmark?.p80_days)
  if (explicit) {
    return {
      days: explicit,
      source: 'explicit_p80' as const,
    }
  }

  const p50 = readPositiveNumber(benchmark?.p50_days)
  if (!p50) return { days: null, source: null }

  const variance = readBenchmarkMetadataNumber(
    benchmark,
    'variance',
    'cv',
    'coefficient_of_variation',
    'coefficientOfVariation',
  )
  if (variance !== null) {
    return {
      days: Math.max(p50, Math.ceil(p50 * (1 + clamp(variance, 0, 0.75) * 3.75))),
      source: 'variance_derived' as const,
    }
  }

  const p75 = readPositiveNumber(benchmark?.p75_days)
  if (p75) {
    return {
      days: Math.max(p50, p75),
      source: 'p75_fallback' as const,
    }
  }

  return {
    days: Math.ceil(p50 * 1.35),
    source: 'p50_default_spread' as const,
  }
}

function blendCompanyBenchmarkDays(
  seedDays: number | null,
  seedConservativeDays: number | null,
  benchmark: DurationBenchmarkRow | null,
  runtimeParameter?: BenchmarkBlendRuntimeParameter | null,
) {
  const seed = readPositiveNumber(seedDays)
  const p50 = readPositiveNumber(benchmark?.p50_days)
  const p75 = readPositiveNumber(benchmark?.p75_days)
  const sampleCount = Number(benchmark?.sample_count ?? 0)
  const weight = benchmarkBlendWeight(sampleCount, runtimeParameter?.weight)
  if (!seed || !p50 || weight <= 0) return null
  const benchmarkReference = benchmarkReferenceFromP50P75(p50, p75, runtimeParameter)
  const benchmarkP80 = resolveBenchmarkP80Days(benchmark)
  const seedP80 = readPositiveNumber(seedConservativeDays) ?? Math.ceil(seed * 1.35)
  const conservativeWeight = Math.min(weight, 0.5)
  return {
    days: Math.max(1, Math.ceil(seed * (1 - weight) + benchmarkReference.days * weight)),
    conservativeDays: benchmarkP80.days
      ? Math.max(1, Math.ceil(seedP80 * (1 - conservativeWeight) + benchmarkP80.days * conservativeWeight))
      : null,
    weight,
    conservativeWeight,
    p50,
    p75,
    p80: benchmarkP80.days,
    p80Source: benchmarkP80.source,
    referenceDays: benchmarkReference.days,
    referenceSource: benchmarkReference.source,
    p50P75BlendRatio: benchmarkReference.ratio,
    p50P75BlendRatioSource: benchmarkReference.ratioSource,
    p50P75BlendRatioPublicationKey: benchmarkReference.ratioPublicationKey,
    p50P75BlendRatioScopeLevel: benchmarkReference.ratioScopeLevel,
    p50P75BlendRatioAppliedTo: benchmarkReference.ratioAppliedTo,
    sampleCount,
    weightSource: runtimeParameter ? 'parameter_runtime_publication' as const : 'sample_count_heuristic' as const,
    weightPublicationKey: runtimeParameter?.publicationKey ?? null,
    weightScopeLevel: runtimeParameter?.scopeLevel ?? null,
  }
}

function buildBenchmarkBlendCandidate(
  candidate: DurationBenchmarkCandidate,
  runtimeParameter?: BenchmarkBlendRuntimeParameter | null,
) {
  const p50 = readPositiveNumber(candidate.benchmark.p50_days)
  const p75 = readPositiveNumber(candidate.benchmark.p75_days)
  if (!p50) return null
  const reference = benchmarkReferenceFromP50P75(p50, p75, runtimeParameter)
  const p80 = resolveBenchmarkP80Days(candidate.benchmark)
  const weight = benchmarkBlendWeight(candidate.sampleSize, runtimeParameter?.weight)
  if (weight <= 0) return null
  const variance = readBenchmarkMetadataNumber(
    candidate.benchmark,
    'variance',
    'cv',
    'coefficient_of_variation',
    'coefficientOfVariation',
  )
  return {
    ...candidate,
    weight,
    conservativeWeight: Math.min(weight, 0.5),
    p50,
    p75,
    p80: p80.days,
    p80Source: p80.source,
    referenceDays: reference.days,
    referenceSource: reference.source,
    p50P75BlendRatio: reference.ratio,
    p50P75BlendRatioSource: reference.ratioSource,
    p50P75BlendRatioPublicationKey: reference.ratioPublicationKey,
    p50P75BlendRatioScopeLevel: reference.ratioScopeLevel,
    p50P75BlendRatioAppliedTo: reference.ratioAppliedTo,
    variance,
    weightSource: runtimeParameter ? 'parameter_runtime_publication' as const : 'sample_count_heuristic' as const,
    weightPublicationKey: runtimeParameter?.publicationKey ?? null,
    weightScopeLevel: runtimeParameter?.scopeLevel ?? null,
  }
}

function blendBenchmarkCandidates(
  seedDays: number | null,
  seedConservativeDays: number | null,
  candidates: DurationBenchmarkCandidate[],
  runtimeParameter?: BenchmarkBlendRuntimeParameter | null,
) {
  const seed = readPositiveNumber(seedDays)
  if (!seed || candidates.length === 0) return null
  const blendCandidates = candidates
    .map((candidate) => buildBenchmarkBlendCandidate(
      candidate,
      candidate.scope === 'company' ? runtimeParameter : null,
    ))
    .filter((candidate): candidate is NonNullable<ReturnType<typeof buildBenchmarkBlendCandidate>> => Boolean(candidate))
  if (blendCandidates.length === 0) return null

  const rawWeightSum = blendCandidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  const totalWeight = Math.min(0.85, rawWeightSum)
  const days = Math.max(1, Math.ceil(
    seed * (1 - totalWeight)
    + blendCandidates.reduce((sum, candidate) => (
      sum + candidate.referenceDays * totalWeight * (candidate.weight / rawWeightSum)
    ), 0),
  ))

  const seedP80 = readPositiveNumber(seedConservativeDays) ?? Math.ceil(seed * 1.35)
  const conservativeCandidates = blendCandidates.filter((candidate) => candidate.p80)
  const conservativeRawWeightSum = conservativeCandidates.reduce((sum, candidate) => sum + candidate.conservativeWeight, 0)
  const conservativeWeight = Math.min(0.65, conservativeRawWeightSum)
  const conservativeDays = conservativeCandidates.length > 0 && conservativeRawWeightSum > 0
    ? Math.max(1, Math.ceil(
      seedP80 * (1 - conservativeWeight)
      + conservativeCandidates.reduce((sum, candidate) => (
        sum + Number(candidate.p80) * conservativeWeight * (candidate.conservativeWeight / conservativeRawWeightSum)
      ), 0),
    ))
    : null

  const primaryCandidate = blendCandidates[0]
  const companyCandidate = blendCandidates.find((candidate) => candidate.scope === 'company') ?? null
  const distributionCandidate = companyCandidate ?? primaryCandidate
  return {
    days,
    conservativeDays,
    weight: totalWeight,
    conservativeWeight,
    sampleCount: blendCandidates.reduce((sum, candidate) => sum + candidate.sampleSize, 0),
    scopes: Array.from(new Set(blendCandidates.map((candidate) => candidate.scope))),
    candidateCount: blendCandidates.length,
    candidates: blendCandidates,
    primaryCandidate,
    companyCandidate,
    distributionCandidate,
  }
}

async function loadBenchmarkBlendRuntimeParameter(
  companyId: string | null | undefined,
  projectId: string | null | undefined,
  trafficSubjectKey?: string | null,
): Promise<BenchmarkBlendRuntimeParameter | null> {
  if (!companyId) return null
  let benchmarkWeight: BenchmarkBlendRuntimeParameter | null = null
  const registered = getAlgorithmAssetLearnableParameter('duration.benchmark_blend_weight')
  const deterministicValue = typeof registered?.currentValue === 'number' ? registered.currentValue : 0.55
  try {
    const canary = await resolveDurationContextPolicyRuntimeSelection({
      parameterKey: 'duration.benchmark_blend_weight',
      deterministicValue,
      companyId,
      projectId: projectId ?? null,
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationSuggestionService.company_benchmark_blend',
        scopeBoundary: projectId ? 'project' : 'company',
        stopConditionKeys: [
          'duration_benchmark_blend_overcompensation_rate',
          'duration_benchmark_blend_mae_regression',
          'duration_benchmark_blend_scope_drift',
        ],
        monitoringWindowHours: 72,
        trafficSubjectKey: normalizeId(trafficSubjectKey) || normalizeId(projectId),
      },
    })
    if (
      canary.runtimeApplied
      && Number.isFinite(canary.selectedValue)
      && canary.selectedValue >= 0
      && canary.selectedValue <= 1
    ) {
      benchmarkWeight = {
        weight: canary.selectedValue,
        publicationKey: canary.publicationKey,
        publicationStatus: canary.publicationStatus,
        scopeLevel: canary.scopeLevel,
      }
    }
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to load canary benchmark blend parameter', {
      companyId,
      projectId,
      error,
    })
  }
  if (!benchmarkWeight) {
    try {
      const stable = await resolveDurationContextPolicyRuntimeSelection({
        parameterKey: 'duration.benchmark_blend_weight',
        deterministicValue,
        companyId,
        projectId: projectId ?? null,
      })
      if (
        stable.runtimeApplied
        && Number.isFinite(stable.selectedValue)
        && stable.selectedValue >= 0
        && stable.selectedValue <= 1
      ) {
        benchmarkWeight = {
          weight: stable.selectedValue,
          publicationKey: stable.publicationKey,
          publicationStatus: stable.publicationStatus,
          scopeLevel: stable.scopeLevel,
        }
      }
    } catch (error) {
      logger.warn('[durationSuggestionService] failed to load stable benchmark blend parameter', {
        companyId,
        projectId,
        error,
      })
    }
  }
  if (!benchmarkWeight) return null

  try {
    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.p50_p75_blend_ratio',
      companyId,
      projectId: projectId ?? null,
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationSuggestionService.company_benchmark_p50_p75_blend',
        scopeBoundary: 'company',
        stopConditionKeys: [
          'duration_p50_p75_overcompensation_rate',
          'duration_p50_p75_mae_regression',
        ],
        monitoringWindowHours: 72,
      },
    })
    if (
      result.runtimeConsumable
      && typeof result.runtimeValue === 'number'
      && Number.isFinite(result.runtimeValue)
      && result.runtimeValue >= 0
      && result.runtimeValue <= 1
    ) {
      return {
        ...benchmarkWeight,
        p50P75BlendRatio: result.runtimeValue,
        p50P75BlendRatioPublicationKey: result.publicationKey,
        p50P75BlendRatioPublicationStatus: result.publicationStatus,
        p50P75BlendRatioScopeLevel: result.scopeLevel,
      }
    }
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to load learnable benchmark P50/P75 blend parameter', {
      companyId,
      projectId,
      error,
    })
  }

  return benchmarkWeight
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeId).filter((item): item is string => Boolean(item))
  const text = normalizeId(value)
  return text ? text.split(/[,\s]+/).map(normalizeId).filter((item): item is string => Boolean(item)) : []
}

function mapColdStartAnonymizationPolicy(value: unknown): AlgorithmAssetColdStartBaseline['anonymizationPolicy'] {
  const policy = normalizeId(value)
  if (policy === 'differential_privacy_aggregate') return 'differential_privacy_aggregate'
  return 'k_anonymous_multi_company'
}

function readRollbackTarget(value: unknown) {
  if (typeof value === 'string') return normalizeId(value)
  const record = readMetadataObject(value)
  return normalizeId(record.ref ?? record.id ?? record.rollbackTarget ?? record.rollback_target)
}

function mapColdStartBaselineRow(row: Record<string, unknown>): AlgorithmAssetColdStartBaseline | null {
  const runtimePublicationStatus = normalizeId(row.runtime_publication_status) as AlgorithmAssetColdStartBaseline['runtimePublicationStatus']
  if (runtimePublicationStatus === 'runtime_rolled_back') return null

  const baselineValue = readMetadataObject(row.baseline_value)
  const evidenceSummary = readMetadataObject(row.evidence_summary)
  const value = readPositiveNumber(
    baselineValue.p50Days
      ?? baselineValue.p50_days
      ?? baselineValue.durationDays
      ?? baselineValue.duration_days
      ?? baselineValue.value
      ?? row.value,
  )
  if (!value) return null
  const baselineScope = normalizeId(row.scope_level) === 'industry_baseline' ? 'industry_baseline' : 'segment_baseline'
  const minCompanyCount = Math.max(2, Math.round(readPositiveNumber(row.minimum_company_count ?? evidenceSummary.minCompanyCount ?? evidenceSummary.min_company_count) ?? 3))
  const minProjectCount = Math.max(2, Math.round(readPositiveNumber(row.minimum_project_count ?? evidenceSummary.minProjectCount ?? evidenceSummary.min_project_count) ?? 10))
  const maxSingleCompanyShare = readPositiveNumber(row.max_single_company_share ?? evidenceSummary.maxSingleCompanyShare ?? evidenceSummary.max_single_company_share) ?? 0.4
  const segmentKey = normalizeId(row.segment_key)
  return {
    baselineId: normalizeId(row.id) ?? [normalizeId(row.baseline_key), segmentKey].filter(Boolean).join(':'),
    baselineScope,
    value,
    applicableScenarioKeys: readStringList(evidenceSummary.applicableScenarioKeys ?? evidenceSummary.applicable_scenario_keys ?? segmentKey),
    disabledScenarioKeys: readStringList(row.disabled_scenarios ?? evidenceSummary.disabledScenarioKeys ?? evidenceSummary.disabled_scenario_keys),
    anonymizationPolicy: mapColdStartAnonymizationPolicy(row.anonymization_policy ?? evidenceSummary.anonymizationPolicy ?? evidenceSummary.anonymization_policy),
    contributingCompanyCount: Math.round(readPositiveNumber(evidenceSummary.contributingCompanyCount ?? evidenceSummary.contributing_company_count) ?? minCompanyCount),
    minCompanyCount,
    contributingProjectCount: Math.round(readPositiveNumber(evidenceSummary.contributingProjectCount ?? evidenceSummary.contributing_project_count) ?? minProjectCount),
    minProjectCount,
    singleCompanyShare: readPositiveNumber(evidenceSummary.singleCompanyShare ?? evidenceSummary.single_company_share) ?? 1,
    maxSingleCompanyShare,
    sourceAggregation: normalizeId(evidenceSummary.sourceAggregation ?? evidenceSummary.source_aggregation) === 'contains_private_details'
      ? 'contains_private_details'
      : 'aggregate_summary_only',
    rollbackTarget: readRollbackTarget(row.rollback_target ?? evidenceSummary.rollbackTarget ?? evidenceSummary.rollback_target) ?? null,
    runtimePublicationKey: normalizeId(row.publication_key ?? evidenceSummary.publicationKey ?? evidenceSummary.publication_key) || null,
    runtimePublicationStatus: runtimePublicationStatus || null,
    consumesCompanyOverrides: Boolean(evidenceSummary.consumesCompanyOverrides ?? evidenceSummary.consumes_company_overrides),
    consumesProjectSampleDetails: Boolean(evidenceSummary.consumesProjectSampleDetails ?? evidenceSummary.consumes_project_sample_details),
    consumesCandidateResults: Boolean(evidenceSummary.consumesCandidateResults ?? evidenceSummary.consumes_candidate_results),
    consumesReplaySamples: Boolean(evidenceSummary.consumesReplaySamples ?? evidenceSummary.consumes_replay_samples),
  }
}

async function loadColdStartBaselines(baselineKey: string | null): Promise<AlgorithmAssetColdStartBaseline[]> {
  if (!baselineKey) return []
  try {
    const { data, error } = await (supabase as any)
      .from('algorithm_cold_start_baselines')
      .select('*')
      .eq('baseline_key', baselineKey)
    if (error) throw error
    return (Array.isArray(data) ? data : [])
      .map((row) => mapColdStartBaselineRow(row as Record<string, unknown>))
      .filter((baseline): baseline is AlgorithmAssetColdStartBaseline => Boolean(baseline))
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to load cold-start baselines', {
      baselineKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

function buildColdStartScenarioKeys(input: DurationSuggestionInput) {
  return [
    normalizeId(input.projectTypeCode),
    normalizeId(input.structureTypeCode),
    ...readStringList(input.methodVariantCodes),
  ].filter((key): key is string => Boolean(key))
}

function coldStartConservativeDays(baseDays: number, p80: number | null, runtimeValue: number) {
  const conservative = readPositiveNumber(p80)
  if (!conservative || !baseDays) return Math.ceil(runtimeValue * 1.35)
  return Math.max(runtimeValue, Math.ceil(conservative * (runtimeValue / baseDays)))
}

function coldStartRuntimeSource(decision: AlgorithmAssetColdStartRuntimeDecision | null) {
  if (!decision || decision.status !== 'shared_baseline_reference') return null
  return decision.runtimeSources.find((source) => source === 'segment_baseline' || source === 'industry_baseline') ?? null
}

function resolveSeedReferenceDuration(seedPayload: Record<string, unknown>) {
  const p50 = readPositiveNumber(
    seedPayload.defaultDaysP50
      ?? seedPayload.default_days_p50
      ?? seedPayload.defaultDays,
  )
  const mean = readPositiveNumber(
    seedPayload.meanDays
      ?? seedPayload.mean_days
      ?? seedPayload.defaultDaysMean
      ?? seedPayload.default_days_mean
      ?? seedPayload.defaultMeanDays
      ?? seedPayload.default_mean_days,
  )
  if (mean) {
    return {
      days: mean,
      anchor: 'mean' as const,
      p50,
      mean,
    }
  }

  const p80 = readPositiveNumber(seedPayload.defaultDaysP80 ?? seedPayload.default_days_p80)
  const explicitPairAnchor = normalizeId(
    seedPayload.recommendedDurationAnchor
      ?? seedPayload.recommended_duration_anchor
      ?? seedPayload.referenceDurationAnchor
      ?? seedPayload.reference_duration_anchor,
  )
  const usePairAnchor = explicitPairAnchor === 'p50_p80'
    || explicitPairAnchor === 'p50_p80_expected'
    || seedPayload.useP50P80Reference === true
    || seedPayload.use_p50_p80_reference === true
  const forceP50Anchor = explicitPairAnchor === 'p50'
    || explicitPairAnchor === 'median'
    || seedPayload.useP50P80Reference === false
    || seedPayload.use_p50_p80_reference === false
  if (p50 && p80 && (usePairAnchor || !forceP50Anchor)) {
    return {
      days: Math.max(p50, Math.ceil(p50 * 0.7 + p80 * 0.3)),
      anchor: 'p50_p80' as const,
      p50,
      mean: null,
    }
  }

  return {
    days: p50,
    anchor: p50 ? 'p50' as const : null,
    p50,
    mean: null,
  }
}

function sanitizeSeedP80(baseDays: number | null, p80: number | null, ratioBaseDays?: number | null) {
  const base = readPositiveNumber(baseDays)
  const ratioBase = readPositiveNumber(ratioBaseDays) ?? base
  const conservative = readPositiveNumber(p80)
  if (!base) {
    return {
      conservativeDays: conservative,
      confidencePenalty: 0,
      metadata: {},
    }
  }
  if (!conservative) {
    return {
      conservativeDays: Math.ceil(base * 1.35),
      confidencePenalty: 0,
      metadata: {},
    }
  }
  if (conservative < base) {
    const raisedSeedP80 = Math.ceil(base * 1.35)
    return {
      conservativeDays: raisedSeedP80,
      confidencePenalty: 6,
      metadata: {
        seedP80RatioRaised: true,
        originalSeedP80: conservative,
        raisedSeedP80,
      },
    }
  }
  const ratio = ratioBase ? conservative / ratioBase : conservative / base
  if (ratio <= 2.5) {
    return {
      conservativeDays: conservative,
      confidencePenalty: 0,
      metadata: {},
    }
  }
  return {
    conservativeDays: Math.max(base, Math.ceil((ratioBase ?? base) * 2.5)),
    confidencePenalty: 10,
    metadata: {
      seedP80RatioCapped: true,
      seedP80Ratio: Number(ratio.toFixed(3)),
      originalSeedP80: conservative,
      cappedSeedP80: Math.max(base, Math.ceil((ratioBase ?? base) * 2.5)),
    },
  }
}

function resolveHealthBandMinimum(summary: Awaited<ReturnType<typeof buildProjectHealthDeviationSummary>>) {
  const businessHealthScore = readFiniteNumber(summary.businessHealthScore)
  const legacyHealthScore = readFiniteNumber(summary.healthScore)
  const source = businessHealthScore != null
    ? 'project_daily_snapshot'
    : summary.caliberVersion && summary.caliberVersion !== 'legacy'
      ? 'project_health_summary'
      : null
  const score = businessHealthScore ?? (source ? legacyHealthScore : null)

  if (score == null) return null
  const confidenceFlag = normalizeId(summary.healthConfidenceFlag).toLowerCase()
  if (confidenceFlag === 'unavailable') return null

  const normalizedScore = clamp(score, 0, 100)
  if (normalizedScore < 60) {
    return {
      score: Number(normalizedScore.toFixed(1)),
      multiplier: 1.3,
      source,
      confidenceFlag: confidenceFlag || null,
      reason: '项目健康度低于 60，保守工期按高风险环境预留',
    }
  }
  if (normalizedScore < 80) {
    return {
      score: Number(normalizedScore.toFixed(1)),
      multiplier: 1.15,
      source,
      confidenceFlag: confidenceFlag || null,
      reason: '项目健康度处于 60-80，保守工期按一般波动环境预留',
    }
  }
  return {
    score: Number(normalizedScore.toFixed(1)),
    multiplier: 1,
    source,
    confidenceFlag: confidenceFlag || null,
    reason: '项目健康度高于 80，作为稳定执行证据，不额外抬升参考工期',
  }
}

async function buildProjectEnvironmentBufferWithHealth(input: DurationSuggestionInput, baseDays: number): Promise<ProjectEnvironmentBuffer | null> {
  const projectId = normalizeId(input.projectId)
  if (!projectId || !baseDays) return null

  let healthBand: ReturnType<typeof resolveHealthBandMinimum> = null
  try {
    healthBand = resolveHealthBandMinimum(await buildProjectHealthDeviationSummary(projectId))
  } catch (error) {
    logger.warn('[durationSuggestionService] project health band unavailable for environment buffer', { projectId, error })
  }

  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, status')
    .eq('project_id', projectId)
    .not('actual_end_date', 'is', null)

  if (error || !Array.isArray(data)) {
    if (error) logger.warn('[durationSuggestionService] failed to query project environment buffer', { error })
    return healthBand
      ? {
        sampleCount: 0,
        averageDurationRatio: 1,
        delayRatio: 0,
        multiplier: healthBand.multiplier,
        extraDays: Math.min(5, Math.max(1, Math.ceil(baseDays * (healthBand.multiplier - 1) * 0.65))),
        confidenceLevel: 'low',
        confidenceScore: 48,
        reason: healthBand.reason,
        healthScore: healthBand.score,
        healthBandMultiplier: healthBand.multiplier,
        healthBandSource: healthBand.source,
        healthConfidenceFlag: healthBand.confidenceFlag,
      }
      : null
  }

  const currentTaskId = normalizeId(input.taskId)
  const ratios: number[] = []
  for (const row of data as Array<Record<string, unknown>>) {
    if (normalizeId(row.id) && normalizeId(row.id) === currentTaskId) continue
    const plannedStart = normalizeId(row.planned_start_date)
    const plannedEnd = normalizeId(row.planned_end_date)
    const actualStart = normalizeId(row.actual_start_date)
    const actualEnd = normalizeId(row.actual_end_date)
    const plannedDays = plannedStart && plannedEnd
      ? countConstructionProductionDaysInclusive(plannedStart, plannedEnd, input.workCalendar)
      : null
    const actualDays = actualStart && actualEnd
      ? countConstructionProductionDaysInclusive(actualStart, actualEnd, input.workCalendar)
      : null
    if (!plannedDays || !actualDays) continue
    ratios.push(clamp(actualDays / plannedDays, 0.5, 2.5))
  }

  const isColdStart = ratios.length < 5 && !healthBand

  const averageDurationRatio = ratios.length > 0
    ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
    : 1
  const delayRatio = ratios.length > 0
    ? ratios.filter((ratio) => ratio > 1.15).length / ratios.length
    : 0
  const confidenceLevel = ratios.length >= 12 ? 'high' : ratios.length >= 5 ? 'medium' : 'low'
  const confidenceScore = confidenceLevel === 'high' ? 68 : confidenceLevel === 'medium' ? 56 : 48
  const rhythmMultiplier = averageDurationRatio > 1.08 || delayRatio >= 0.45
    ? clamp(averageDurationRatio, 1, 1.2)
    : 1
  const coldStartMultiplier = isColdStart ? 1.08 : 1
  const multiplier = Math.max(rhythmMultiplier, healthBand?.multiplier ?? 1, coldStartMultiplier)
  const extraDays = multiplier > 1
    ? Math.min(5, Math.max(1, Math.ceil(baseDays * (multiplier - 1) * 0.65)))
    : 0

  if (extraDays <= 0 && confidenceLevel !== 'high' && !healthBand && !isColdStart) return null

  const reasonParts = [
    extraDays > 0 && rhythmMultiplier > 1
      ? '本项目近期已完成任务显示整体执行环境偏慢，已作为 L1 项目环境缓冲'
      : ratios.length >= 12
        ? '本项目近期已完成任务显示整体执行环境较稳定，已作为 L1 置信度依据'
        : null,
    isColdStart ? '项目已完成样本不足 5 条且暂无有效健康度数据，保守工期加入新项目磨合余量' : null,
    healthBand?.reason,
  ].filter(Boolean)

  const bufferKind: ProjectEnvironmentBuffer['bufferKind'] = healthBand && rhythmMultiplier > 1
    ? 'mixed'
    : healthBand
      ? 'health_band'
      : isColdStart
        ? 'cold_start'
        : 'project_history'

  return {
    sampleCount: ratios.length,
    averageDurationRatio: Number(averageDurationRatio.toFixed(3)),
    delayRatio: Number(delayRatio.toFixed(3)),
    multiplier: Number(multiplier.toFixed(3)),
    extraDays,
    confidenceLevel,
    confidenceScore,
    reason: reasonParts.length > 0
      ? reasonParts.join('; ')
      : '项目健康度已作为保守工期安全余量依据',
    healthScore: healthBand?.score ?? null,
    healthBandMultiplier: healthBand?.multiplier ?? null,
    healthBandSource: healthBand?.source ?? null,
    healthConfidenceFlag: healthBand?.confidenceFlag ?? null,
    bufferKind,
  }
}

function withDurationContext(
  base: DurationSuggestion,
  context: DurationContextSummary,
  options?: { keepRecommendedDays?: boolean },
): DurationSuggestion {
  const keepRecommendedDays = options?.keepRecommendedDays === true
  const nextScore = clamp(Number(base.confidenceScore ?? 50) + context.confidenceDelta, 10, 95)
  const recommendedDurationDays = keepRecommendedDays
    ? base.recommendedDurationDays
    : applyDurationContextToDays(base.recommendedDurationDays, context)
  const conservativeDurationDays = applyDurationContextToConservativeDays(
    base.conservativeDurationDays ?? base.recommendedDurationDays,
    context,
  )
  const factorSummary = withMaturityFactorSummary(context, base)

  return {
    ...base,
    recommendedDurationDays,
    conservativeDurationDays,
    confidenceScore: nextScore,
    confidenceLevel: scoreToDurationConfidenceLevel(nextScore),
    forecastSource: context.adjustedBy.length > 0
      ? `${base.forecastSource}+v1474_context`
      : base.forecastSource,
    businessReason: appendBusinessReasons(base.businessReason, context),
    factorSummary,
    calculationContext: {
      ...context.calculationContext,
      duration_source: mapDurationSource(base.forecastSource),
    },
  }
}

function appendReason(reason: string | null, addition: string | null | undefined) {
  const values = [reason, addition].map((item) => String(item ?? '').trim()).filter(Boolean)
  return values.length > 0 ? Array.from(new Set(values)).join('; ') : null
}

function confidenceAtLeastMedium(level: ProjectEnvironmentBuffer['confidenceLevel']) {
  return level === 'medium' || level === 'high'
}

function hasProjectBaselineCalibrationContext(context: DurationContextSummary | null | undefined) {
  if (!context) return false
  const calculationContext = context.calculationContext ?? {}
  const adjustedBy = [
    ...(Array.isArray(context.adjustedBy) ? context.adjustedBy : []),
    ...(Array.isArray((calculationContext as any).adjusted_by) ? (calculationContext as any).adjusted_by : []),
  ].map((item) => normalizeId(item))
  if (adjustedBy.includes('project_baseline_calibration')) return true
  if ((calculationContext as any).project_baseline_calibration_applied === true) return true
  if ((context.factorAvailability as any)?.project_baseline_calibration === true) return true
  return (context.factors ?? []).some((factor) => factor.key === 'project_baseline_calibration')
}

function dampenEnvironmentMultiplierAfterPriorProjectRhythm(multiplier: number, hasPriorProjectRhythm: boolean) {
  const normalized = Math.max(1, Number(multiplier ?? 1))
  if (!hasPriorProjectRhythm || normalized <= 1) return Number(normalized.toFixed(3))
  return Number(Math.max(1, 1 + (normalized - 1) * 0.4).toFixed(3))
}

function applyMultiplierBeforeContextExtraDays(
  days: number | null | undefined,
  multiplier: number,
  context: DurationContextSummary | null | undefined,
) {
  const current = readPositiveNumber(days)
  if (!current) return current
  const contextMultiplier = Number(context?.multiplier ?? 1)
  const contextExtraDays = Number(context?.extraDays ?? 0)
  if (
    Number.isFinite(contextMultiplier)
    && contextMultiplier > 0
    && Number.isFinite(contextExtraDays)
    && contextExtraDays > 0
  ) {
    const daysBeforeContext = Math.max(1, (current - contextExtraDays) / contextMultiplier)
    return Math.max(1, Math.ceil(daysBeforeContext * multiplier * contextMultiplier + contextExtraDays))
  }
  return Math.max(1, Math.ceil(current * multiplier))
}

function withEstimatedPlannedEndDate(input: DurationSuggestionInput, baseDays: number | null | undefined) {
  if (normalizeId(input.plannedEndDate) || !normalizeId(input.plannedStartDate)) return input
  const estimatedEnd = addConstructionProductionDaysInclusive(input.plannedStartDate, baseDays, input.workCalendar)
  return estimatedEnd ? { ...input, plannedEndDate: estimatedEnd } : input
}

function calendarContextSummary(calendar?: ConstructionCalendarContext | null) {
  const hasOfficialCalendar = calendar?.basis === 'official_construction_calendar_seed'
  return {
    basis: hasOfficialCalendar ? 'official_construction_calendar_seed' : 'calendar_day_no_shutdown_context',
    rawBasis: calendar?.basis ?? 'calendar_day',
    windowCount: calendar?.windows.length ?? 0,
    shutdownWindowCount: calendar?.windows.filter((window) => {
      const flag = String(
        (window as Record<string, unknown>).countsAsConstructionShutdown
          ?? (window as Record<string, unknown>).counts_as_construction_shutdown
          ?? '',
      ).toLowerCase()
      return flag === 'true' || flag === '1' || flag === 'yes'
    }).length ?? 0,
  }
}

function withDurationCalendarContext(suggestion: DurationSuggestion, input: DurationSuggestionInput): DurationSuggestion {
  const durationCalendar = calendarContextSummary(input.workCalendar)
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    duration_calendar: durationCalendar,
  } as DurationSuggestion['calculationContext']
  const factorAvailability = {
    ...(suggestion.factorAvailability ?? {}),
    construction_calendar_shutdown_context: durationCalendar.basis === 'official_construction_calendar_seed',
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        construction_calendar_shutdown_context: durationCalendar.basis === 'official_construction_calendar_seed',
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        duration_calendar: durationCalendar,
      },
    } as DurationContextSummary
    : suggestion.factorSummary

  return {
    ...suggestion,
    factorAvailability,
    factorSummary,
    calculationContext,
  }
}

function readT2RhythmScheduleCandidateContext(input: DurationSuggestionInput) {
  const candidatePackage = input.t2RhythmScheduleCandidatePackage
  if (candidatePackage?.source !== 't2_division_rhythm_schedule_candidate_package') return null
  const compatibility = candidatePackage.compatibility
  const priorityAdjudication = compatibility.priorityAdjudication
  return {
    source: candidatePackage.source,
    tier: candidatePackage.tier,
    status: candidatePackage.status,
    selectedTemplateIds: candidatePackage.selectedTemplateIds,
    templateCount: candidatePackage.templateCount,
    durationBearingWindowCount: candidatePackage.durationBearingWindowCount,
    durationContextCandidateCount: candidatePackage.durationContextCandidates.length,
    dependencyCandidateCount: candidatePackage.dependencyCandidates.length,
    candidateDependencyEdgeCount: candidatePackage.candidateDependencyEdgeCount,
    hardGateCount: candidatePackage.hardGateCount,
    compatibility: {
      status: compatibility.status,
      compatible: compatibility.compatible,
      conflictCount: compatibility.conflicts.length,
      conflictCodes: compatibility.conflicts.map((conflict) => conflict.conflictCode),
      priorityOverrideBlocked: priorityAdjudication?.priorityOverrideBlocked ?? false,
      assemblyFeasibilityRequired: priorityAdjudication?.assemblyFeasibilityRequired ?? true,
      selectedTemplateId: priorityAdjudication?.selectedTemplateId ?? null,
      selectedBy: priorityAdjudication?.selectedBy ?? null,
    },
    scheduleTrustPolicy: candidatePackage.scheduleTrustPolicy,
    scheduleTrustSummaries: (candidatePackage.scheduleTrustSummaries ?? []).slice(0, 8).map((summary) => ({
      sourceTemplateId: summary.sourceTemplateId,
      criticalPathRoles: summary.criticalPathRoles.slice(0, 6),
      durationDrivers: summary.durationDrivers.slice(0, 8),
      workfaceReadinessSignals: summary.workfaceReadinessSignals.slice(0, 8),
      assemblyRiskTags: summary.assemblyRiskTags.slice(0, 8),
      replayAdmission: summary.replayAdmission,
    })),
    durationContextCandidates: candidatePackage.durationContextCandidates.slice(0, 8).map((candidate) => ({
      sourceTemplateId: candidate.sourceTemplateId,
      windowCode: candidate.windowCode,
      recommendedDurationDays: candidate.recommendedDurationDays,
      planReferenceDays: candidate.planReferenceDays,
      planDurationTruthSource: candidate.planDurationTruthSource,
      governanceStatus: candidate.governanceStatus,
      sourceType: candidate.sourceType,
      autoApply: candidate.autoApply,
    })),
  }
}

function withT2RhythmScheduleCandidateContext(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const t2Context = readT2RhythmScheduleCandidateContext(input)
  if (!t2Context) return suggestion
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    t2RhythmScheduleCandidatePackage: t2Context,
  } as DurationSuggestion['calculationContext']
  const factorAvailability = {
    ...(suggestion.factorAvailability ?? {}),
    t2_rhythm_schedule_candidate_package: true,
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        t2_rhythm_schedule_candidate_package: true,
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        t2RhythmScheduleCandidatePackage: t2Context,
      },
    } as DurationContextSummary
    : suggestion.factorSummary

  return {
    ...suggestion,
    factorAvailability,
    factorSummary,
    calculationContext,
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      t2RhythmScheduleCandidatePackageStatus: t2Context.status,
      t2RhythmScheduleCandidateAutoApply: t2Context.scheduleTrustPolicy.autoApply,
      t2RhythmScheduleCandidateWritesTaskDependencies: t2Context.scheduleTrustPolicy.writesTaskDependencies,
      t2RhythmScheduleCandidateWritesPlanDates: t2Context.scheduleTrustPolicy.writesPlanDates,
      t2RhythmScheduleCandidateSelectedTemplateIds: t2Context.selectedTemplateIds,
    },
  }
}

function readT2RhythmScheduleCandidateNetworkEvaluationContext(input: DurationSuggestionInput) {
  const evaluation = input.t2RhythmScheduleCandidateNetworkEvaluation
  if (evaluation?.source !== 't2_rhythm_schedule_candidate_network_phase1_evaluation') return null
  const selectionReceipts = Array.isArray(evaluation.selectionReceipts) ? evaluation.selectionReceipts : []
  const selectionReceiptCount = typeof evaluation.scheduleTrustEvidence.selectionReceiptCount === 'number'
    ? evaluation.scheduleTrustEvidence.selectionReceiptCount
    : selectionReceipts.length
  const selectorReceiptAuditStatus = evaluation.scheduleTrustEvidence.selectorReceiptAuditStatus
    ?? (selectionReceiptCount > 0 ? 'ready' : 'missing')
  const standardLibraryReadiness = evaluation.standardLibraryReadiness ?? {
    status: evaluation.scheduleTrustEvidence.standardLibraryReadinessStatus ?? 'unknown_legacy_evaluation_without_standard_library_readiness',
    precisionStatus: evaluation.scheduleTrustEvidence.standardLibraryPrecisionStatus ?? 'unknown',
    breadthStatus: evaluation.scheduleTrustEvidence.standardLibraryBreadthStatus ?? 'unknown',
    depthStatus: evaluation.scheduleTrustEvidence.standardLibraryDepthStatus ?? 'unknown',
    canEnterC1913Phase1Selection: evaluation.canEnterC1913Phase1Selection,
    canAutoMaterializeTaskDependencies: false,
    canAutoPublishRuntimeExperience: false,
    liveReplayTrustGate: null,
    releaseBlockers: evaluation.scheduleTrustEvidence.releaseBlockers ?? [
      'standard_library_readiness_missing_from_legacy_evaluation',
    ],
  }
  const phase1PublicationGate = evaluation.phase1PublicationGate ?? {
    status: 'blocked_pending_release_evidence',
    canPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: false,
    releaseBlockers: standardLibraryReadiness.releaseBlockers,
  }
  const scheduleTrustEvidence = evaluation.scheduleTrustEvidence
  const liveReplayTrustGate = standardLibraryReadiness.liveReplayTrustGate ?? null
  const standardLibraryTrustGateStatus = liveReplayTrustGate?.status
    ?? scheduleTrustEvidence.standardLibraryTrustGateStatus
    ?? 'missing'
  const standardLibraryTrustBoundary = liveReplayTrustGate?.trustBoundary
    ?? scheduleTrustEvidence.standardLibraryTrustBoundary
    ?? null
  const canTrustForRealScheduleCalibration = liveReplayTrustGate?.canTrustForRealScheduleCalibration
    ?? scheduleTrustEvidence.canTrustForRealScheduleCalibration
    ?? false
  const standardLibraryTrustGateReleaseBlockers = liveReplayTrustGate?.releaseBlockers
    ?? scheduleTrustEvidence.standardLibraryTrustGateReleaseBlockers
    ?? []
  return {
    source: evaluation.source,
    tier: evaluation.tier,
    candidateId: evaluation.candidateId,
    status: evaluation.status,
    canEnterC1913Phase1Selection: evaluation.canEnterC1913Phase1Selection,
    networkSpanDays: evaluation.networkSpanDays,
    topologicalOrder: evaluation.topologicalOrder.slice(0, 16),
    criticalNodeIds: evaluation.criticalNodeIds.slice(0, 16),
    criticalWindowCodes: evaluation.criticalWindowCodes.slice(0, 16),
    criticalNodeCount: evaluation.criticalNodeIds.length,
    nodeEvaluationCount: evaluation.nodeEvaluations.length,
    nodeEvaluations: evaluation.nodeEvaluations.slice(0, 8).map((node) => ({
      nodeId: node.nodeId,
      windowCode: node.windowCode,
      role: node.role,
      earliestStartDay: node.earliestStartDay,
      earliestFinishDay: node.earliestFinishDay,
      latestStartDay: node.latestStartDay,
      latestFinishDay: node.latestFinishDay,
      totalFloatDays: node.totalFloatDays,
      isCritical: node.isCritical,
    })),
    conflictSummary: evaluation.conflictSummary,
    scheduleTrustEvidence: {
      selectedTemplateIds: scheduleTrustEvidence.selectedTemplateIds,
      durationBearingNodeCount: scheduleTrustEvidence.durationBearingNodeCount,
      dependencyEdgeCount: scheduleTrustEvidence.dependencyEdgeCount,
      hardGateCount: scheduleTrustEvidence.hardGateCount,
      compatibilityStatus: scheduleTrustEvidence.compatibilityStatus,
      replayRequiredBeforePublish: scheduleTrustEvidence.replayRequiredBeforePublish,
      standardLibraryReadinessStatus: standardLibraryReadiness.status,
      standardLibraryPrecisionStatus: standardLibraryReadiness.precisionStatus,
      standardLibraryBreadthStatus: standardLibraryReadiness.breadthStatus,
      standardLibraryDepthStatus: standardLibraryReadiness.depthStatus,
      standardLibraryTrustGateStatus,
      standardLibraryTrustBoundary,
      canTrustForRealScheduleCalibration,
      standardLibraryTrustGateReleaseBlockers,
      selectionReceiptCount,
      selectorReceiptAuditStatus,
      releaseBlockers: standardLibraryReadiness.releaseBlockers,
      topologyEvaluated: scheduleTrustEvidence.topologyEvaluated,
      floatCalculated: scheduleTrustEvidence.floatCalculated,
      writesTaskDependencies: scheduleTrustEvidence.writesTaskDependencies,
      writesPlanDates: scheduleTrustEvidence.writesPlanDates,
    },
    selectionReceipts: selectionReceipts.slice(0, 8).map((receipt) => ({
      templateId: receipt.templateId,
      selectionStatus: receipt.selectionStatus,
      rank: receipt.rank,
      selectorScore: receipt.selectorScore,
      selectionBasis: receipt.selectionBasis,
      unmatchedExplicitDimensions: receipt.unmatchedExplicitDimensions,
      selectorPurity: receipt.selectorPurity,
      mutationBoundary: receipt.mutationBoundary,
    })),
    standardLibraryReadiness,
    phase1PublicationGate,
    mutationBoundary: evaluation.mutationBoundary,
  }
}

function withT2RhythmScheduleCandidateNetworkEvaluationContext(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const evaluationContext = readT2RhythmScheduleCandidateNetworkEvaluationContext(input)
  if (!evaluationContext) return suggestion
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    t2RhythmScheduleCandidateNetworkEvaluation: evaluationContext,
  } as DurationSuggestion['calculationContext']
  const factorAvailability = {
    ...(suggestion.factorAvailability ?? {}),
    t2_rhythm_schedule_candidate_network_phase1_evaluation: true,
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        t2_rhythm_schedule_candidate_network_phase1_evaluation: true,
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        t2RhythmScheduleCandidateNetworkEvaluation: evaluationContext,
      },
    } as DurationContextSummary
    : suggestion.factorSummary

  return {
    ...suggestion,
    factorAvailability,
    factorSummary,
    calculationContext,
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      t2RhythmScheduleCandidateNetworkEvaluationStatus: evaluationContext.status,
      t2RhythmScheduleCandidateNetworkCanEnterC1913Phase1Selection: evaluationContext.canEnterC1913Phase1Selection,
      t2RhythmScheduleCandidateNetworkSpanDays: evaluationContext.networkSpanDays,
      t2RhythmScheduleCandidateNetworkCriticalWindowCodes: evaluationContext.criticalWindowCodes,
      t2RhythmScheduleCandidateNetworkWritesTaskDependencies: evaluationContext.mutationBoundary.writesTaskDependencies,
      t2RhythmScheduleCandidateNetworkWritesPlanDates: evaluationContext.mutationBoundary.writesPlanDates,
      t2RhythmScheduleCandidateNetworkWritesCriticalPathFacts: evaluationContext.mutationBoundary.writesCriticalPathFacts,
      t2RhythmScheduleCandidateNetworkSelectionReceiptCount: evaluationContext.scheduleTrustEvidence.selectionReceiptCount,
      t2RhythmScheduleCandidateNetworkSelectorReceiptAuditStatus: evaluationContext.scheduleTrustEvidence.selectorReceiptAuditStatus,
      t2RhythmScheduleCandidateNetworkStandardLibraryReadinessStatus: evaluationContext.standardLibraryReadiness.status,
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustGateStatus: evaluationContext.scheduleTrustEvidence.standardLibraryTrustGateStatus,
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustBoundary: evaluationContext.scheduleTrustEvidence.standardLibraryTrustBoundary,
      t2RhythmScheduleCandidateNetworkCanTrustForRealScheduleCalibration: evaluationContext.scheduleTrustEvidence.canTrustForRealScheduleCalibration,
      t2RhythmScheduleCandidateNetworkStandardLibraryTrustGateReleaseBlockers: evaluationContext.scheduleTrustEvidence.standardLibraryTrustGateReleaseBlockers,
      t2RhythmScheduleCandidateNetworkPhase1PublicationGateStatus: evaluationContext.phase1PublicationGate.status,
      t2RhythmScheduleCandidateNetworkCanPublishRuntimeExperience: evaluationContext.phase1PublicationGate.canPublishRuntimeExperience,
      t2RhythmScheduleCandidateNetworkCanMaterializeTaskDependencies: evaluationContext.phase1PublicationGate.canMaterializeTaskDependencies,
      t2RhythmScheduleCandidateNetworkReleaseBlockers: evaluationContext.phase1PublicationGate.releaseBlockers,
    },
  }
}

function readT2RhythmSchedulePhase1SelectionContext(input: DurationSuggestionInput) {
  const selection = input.t2RhythmSchedulePhase1Selection
  if (selection?.source !== 't2_rhythm_schedule_phase1_selection') return null
  return {
    source: selection.source,
    selectionId: selection.selectionId,
    status: selection.status,
    selectedCandidateId: selection.selectedCandidateId,
    eligibleCandidateIds: selection.eligibleCandidateIds.slice(0, 12),
    rejectedCandidateCount: selection.rejectedCandidates.length,
    rejectedCandidates: selection.rejectedCandidates.slice(0, 8).map((candidate) => ({
      candidateId: candidate.candidateId,
      status: candidate.status,
      reasonCodes: candidate.reasonCodes,
      conflictCodes: candidate.conflictCodes,
      priorityOverrideBlocked: candidate.priorityOverrideBlocked,
    })),
    combinationConsistencyGate: selection.combinationConsistencyGate,
    selectionBasis: selection.selectionBasis,
    mutationBoundary: selection.mutationBoundary,
  }
}

function withT2RhythmSchedulePhase1SelectionContext(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const selectionContext = readT2RhythmSchedulePhase1SelectionContext(input)
  if (!selectionContext) return suggestion
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    t2RhythmSchedulePhase1Selection: selectionContext,
  } as DurationSuggestion['calculationContext']
  const factorAvailability = {
    ...(suggestion.factorAvailability ?? {}),
    t2_rhythm_schedule_phase1_selection: true,
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        t2_rhythm_schedule_phase1_selection: true,
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        t2RhythmSchedulePhase1Selection: selectionContext,
      },
    } as DurationContextSummary
    : suggestion.factorSummary

  return {
    ...suggestion,
    factorAvailability,
    factorSummary,
    calculationContext,
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      t2RhythmSchedulePhase1SelectionStatus: selectionContext.status,
      t2RhythmSchedulePhase1SelectedCandidateId: selectionContext.selectedCandidateId,
      t2RhythmSchedulePhase1RejectedCandidateCount: selectionContext.rejectedCandidateCount,
      t2RhythmSchedulePhase1WritesTaskDependencies: selectionContext.mutationBoundary.writesTaskDependencies,
      t2RhythmSchedulePhase1WritesPlanDates: selectionContext.mutationBoundary.writesPlanDates,
      t2RhythmSchedulePhase1LinearPriorityCanOverrideAssemblyConflict:
        selectionContext.selectionBasis.linearPriorityCanOverrideAssemblyConflict,
    },
  }
}

function readDurationInputAssemblyContext(input: DurationSuggestionInput) {
  const assembly = input.durationInputAssembly
  if (!assembly) return null
  return {
    source: 'DurationInputAssembler',
    inputChannels: assembly.inputChannels,
    sourceLineage: assembly.sourceLineage.map((lineage) => ({
      channel: lineage.channel,
      source: lineage.source,
      status: lineage.status,
      tier: lineage.tier ?? null,
      candidateId: lineage.candidateId ?? null,
      selectedTemplateIds: lineage.selectedTemplateIds ?? [],
      assetSource: lineage.assetSource ?? null,
    })),
    assemblyGate: assembly.assemblyGate,
    mutationBoundary: assembly.mutationBoundary,
  }
}

function withDurationInputAssemblyContext(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const assemblyContext = readDurationInputAssemblyContext(input)
  if (!assemblyContext) return suggestion
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    durationInputAssembly: assemblyContext,
  } as DurationSuggestion['calculationContext']
  const factorAvailability = {
    ...(suggestion.factorAvailability ?? {}),
    duration_input_assembler: true,
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        duration_input_assembler: true,
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        durationInputAssembly: assemblyContext,
      },
    } as DurationContextSummary
    : suggestion.factorSummary

  return {
    ...suggestion,
    factorAvailability,
    factorSummary,
    calculationContext,
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      durationInputAssemblyGateStatus: assemblyContext.assemblyGate.status,
      durationInputAssemblyCanEnterC1913Phase1Selection: assemblyContext.assemblyGate.canEnterC1913Phase1Selection,
      durationInputAssemblyRequiresManualReview: assemblyContext.assemblyGate.requiresManualReview,
      durationInputAssemblyPriorityOverrideBlocked: assemblyContext.assemblyGate.priorityOverrideBlocked,
      durationInputAssemblyConflictCodes: assemblyContext.assemblyGate.conflictCodes,
      durationInputAssemblyWritesTaskDependencies: assemblyContext.mutationBoundary.writesTaskDependencies,
      durationInputAssemblyWritesPlanDates: assemblyContext.mutationBoundary.writesPlanDates,
      durationInputAssemblyWritesCriticalPathFacts: assemblyContext.mutationBoundary.writesCriticalPathFacts,
    },
  }
}

async function rebuildNewTaskReferenceContext(
  input: DurationSuggestionInput,
  baseDays: number | null,
  durationSource: DurationContextSummary['calculationContext']['duration_source'],
) {
  const contextInput = withEstimatedPlannedEndDate(input, baseDays)
  return filterDurationContextForPurpose(
    attachAlgorithmFactContextToSummary(
      await safeBuildDurationContext(contextInput, durationSource),
      contextInput,
      resolveSuggestionPurpose(input),
    ),
    resolveSuggestionPurpose(input),
  )
}

function appendBusinessReasonCode(
  suggestion: DurationSuggestion,
  code: DurationBusinessReasonCode,
  params?: Record<string, unknown>,
): Pick<DurationSuggestion, 'businessReasonCode' | 'businessReasonCodes' | 'businessReasonParams'> {
  return {
    businessReasonCode: code,
    businessReasonCodes: Array.from(new Set([...(suggestion.businessReasonCodes ?? []), code])),
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      ...(params ?? {}),
    },
  }
}

function appendForecastSourceSuffix(source: string, suffix: string) {
  return source.includes(suffix) ? source : `${source}+${suffix}`
}

function readSuggestionPlanningReplayAdjustmentDays(readback: PlanningReplayCalibrationReadback | null | undefined) {
  if (!readback || readback.status !== 'ready') return null
  if (readback.writePolicy !== 'candidate_overlay_only_no_fact_mutation') return null
  const parsed = Number(readback.e1DurationAdjustmentDays)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(7, Math.ceil(parsed))
}

async function loadPlanningReplayCalibrationReadbackForSuggestion(input: DurationSuggestionInput) {
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null
  if (
    !normalizeId(input.standardWorkCode)
    && !normalizeId(input.standardWorkName)
    && !normalizeId(input.engineeringCategoryId)
  ) return null
  try {
    return await readPlanningReplayCalibrationReadback({
      projectId,
      standardWorkCode: input.standardWorkCode,
      standardWorkName: input.standardWorkName ?? input.taskTitle,
      engineeringCategoryId: input.engineeringCategoryId,
    })
  } catch (error) {
    logger.warn('[durationSuggestionService] planning replay calibration readback unavailable', {
      projectId,
      taskId: input.taskId,
      standardWorkCode: input.standardWorkCode,
      error,
    })
    return null
  }
}

async function applyPlanningReplayCalibrationReadbackToSuggestion(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
): Promise<DurationSuggestion> {
  if (purpose !== 'new_task_reference' && purpose !== 'execution_reference') return suggestion
  if (suggestion.durationProvenance === 'manual_override') return suggestion
  const recommended = readPositiveNumber(suggestion.recommendedDurationDays)
  if (!recommended) return suggestion

  const readback = await loadPlanningReplayCalibrationReadbackForSuggestion(input)
  const adjustmentDays = readSuggestionPlanningReplayAdjustmentDays(readback)
  if (!readback || adjustmentDays == null) return suggestion

  const conservativeBase = readPositiveNumber(suggestion.conservativeDurationDays ?? suggestion.recommendedDurationDays)
  const readbackContext = {
    applied: true,
    source: 'planningReplayCalibrationService',
    writePolicy: readback.writePolicy,
    coarseProcessKey: readback.coarseProcessKey,
    acceptedSampleCount: readback.acceptedSampleCount,
    originalMae: readback.originalMae,
    replayMae: readback.replayMae,
    maeImprovement: readback.maeImprovement,
    overcompensationRate: readback.overcompensationRate,
    e1DurationAdjustmentDays: adjustmentDays,
    evidenceRefs: readback.evidenceRefs,
  }
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      factorAvailability: {
        ...(suggestion.factorSummary.factorAvailability ?? {}),
        planning_replay_calibration_readback: true,
      },
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        planning_replay_calibration_readback: readbackContext,
      },
    } as DurationContextSummary
    : suggestion.factorSummary
  const calculationContext = {
    ...(suggestion.calculationContext ?? {}),
    planning_replay_calibration_readback: readbackContext,
  } as DurationSuggestion['calculationContext']

  return {
    ...suggestion,
    recommendedDurationDays: recommended + adjustmentDays,
    conservativeDurationDays: conservativeBase ? conservativeBase + adjustmentDays : recommended + adjustmentDays,
    forecastSource: appendForecastSourceSuffix(suggestion.forecastSource, 'planning_replay_calibration'),
    businessReason: appendReason(
      suggestion.businessReason,
      `回放校准显示该粗工序历史误差可补 ${adjustmentDays} 天，已按候选 overlay 方式修正参考工期`,
    ),
    ...appendBusinessReasonCode(suggestion, 'PLANNING_REPLAY_CALIBRATION', {
      planningReplayCalibrationAdjustmentDays: adjustmentDays,
      planningReplayCalibrationWritePolicy: readback.writePolicy,
      planningReplayCalibrationEvidenceRefs: readback.evidenceRefs,
      planningReplayCalibrationAcceptedSampleCount: readback.acceptedSampleCount,
      planningReplayCalibrationCoarseProcessKey: readback.coarseProcessKey,
      planningReplayCalibrationOriginalMae: readback.originalMae,
      planningReplayCalibrationReplayMae: readback.replayMae,
      planningReplayCalibrationMaeImprovement: readback.maeImprovement,
      planningReplayCalibrationOvercompensationRate: readback.overcompensationRate,
    }),
    displaySummary: null,
    factorAvailability: {
      ...(suggestion.factorAvailability ?? {}),
      planning_replay_calibration_readback: true,
    },
    factorSummary,
    calculationContext,
  }
}

function normalizeDurationBoundaryInput(input: DurationSuggestionInput): ParentDurationBoundaryContext | null {
  const policy = normalizeParentDurationBoundaryPolicy(input.parentDurationBoundaryPolicy)
  if (!policy) return null
  if (!isHardParentDurationBoundaryPolicy(policy)) return null
  const source = normalizeParentDurationPolicySource(input.parentDurationPolicySource)
  if (!isTrustedDurationTruthAssetSource(source)) return null
  return {
    parentStandardWorkCode: normalizeId(input.parentStandardWorkCode) || null,
    parentTaskTitle: normalizeId(input.parentTaskTitle) || null,
    parentDurationBoundaryPolicy: policy,
    parentDurationPolicySource: source,
    parentReferenceDurationDays: readPositiveNumber(input.parentReferenceDurationDays),
  }
}

function withParentDurationBoundaryContext(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const context = normalizeDurationBoundaryInput(input)
  if (!context) return suggestion
  const independentReferenceDurationDays = readPositiveNumber(suggestion.recommendedDurationDays)
  if (!independentReferenceDurationDays) return suggestion
  const independentConservativeDurationDays = readPositiveNumber(suggestion.conservativeDurationDays ?? suggestion.recommendedDurationDays)
  const parentWindowDays = readPositiveNumber(context.parentReferenceDurationDays)
  const rhythmWindow = resolvePackageChildRhythmWindow({
    taskTitle: input.taskTitle ?? input.standardWorkName,
    standardWorkCode: input.standardWorkCode ?? input.templateStableCode,
    parentStandardWorkCode: context.parentStandardWorkCode,
    parentDurationBoundaryPolicy: context.parentDurationBoundaryPolicy,
    parentReferenceDurationDays: parentWindowDays,
    metadata: {
      packageChildRhythmWindow: {
        startDay: input.packageChildRhythmWindowStartDay,
        endDay: input.packageChildRhythmWindowEndDay,
        durationDays: input.packageChildRhythmWindowDurationDays,
        role: input.packageChildRhythmWindowRole,
      },
    },
  })
  const hasRhythmWindow = Boolean(rhythmWindow)
  const packageChildPlanDurationDays = rhythmWindow?.durationDays
    ?? (parentWindowDays ? null : independentReferenceDurationDays)
  const packageChildConservativeDays = packageChildPlanDurationDays
    ? Math.max(packageChildPlanDurationDays, hasRhythmWindow ? packageChildPlanDurationDays : (independentConservativeDurationDays ?? packageChildPlanDurationDays))
    : null
  const parentWindowApplied = Boolean(parentWindowDays)
  const parentWindowCapped = Boolean(parentWindowDays && (
    independentReferenceDurationDays > parentWindowDays
      || (independentConservativeDurationDays ?? independentReferenceDurationDays) > parentWindowDays
  ))
  const noRhythmAllocation = Boolean(parentWindowApplied && !hasRhythmWindow && !packageChildPlanDurationDays)

  const reason = hasRhythmWindow
    ? '该工序位于父级包内，参考工期来自包内排布；独立工序标准工期仅保留为审计依据'
    : parentWindowApplied
      ? '该工序位于父级包内，但尚未取得包内分配；不使用独立工序标准工期冒充最终计划工期'
      : '该工序位于父级包内，父级包窗口待明确；当前参考工期先作为排布参考，最终仍纳入父级包窗口约束'
  const params = {
    parentStandardWorkCode: context.parentStandardWorkCode,
    parentTaskTitle: context.parentTaskTitle,
    parentDurationBoundaryPolicy: context.parentDurationBoundaryPolicy,
    parentDurationPolicySource: context.parentDurationPolicySource,
    parentReferenceDurationDays: context.parentReferenceDurationDays,
    independentReferenceDurationDays,
    independentConservativeDurationDays,
    packageChildPlanDurationDays,
    packageChildConservativeDurationDays: packageChildConservativeDays,
    parentWindowApplied,
    parentWindowCapped,
    packageChildRhythmWindowApplied: hasRhythmWindow,
    rhythmWindowStartDay: rhythmWindow?.startDay ?? null,
    rhythmWindowEndDay: rhythmWindow?.endDay ?? null,
    rhythmWindowRole: rhythmWindow?.role ?? null,
    rhythmWindowSource: rhythmWindow?.source ?? null,
    rhythmWindowConfidence: rhythmWindow?.confidence ?? null,
    noRhythmAllocation,
    planDurationTruthSource: hasRhythmWindow
      ? 'parent_package_rhythm_window'
      : parentWindowApplied
        ? 'parent_package_window_pending_rhythm_allocation'
        : 'package_child_duration_reference',
    nonAdditiveWithParentDuration: true,
  }
  const parentTitleText = context.parentTaskTitle ? `“${context.parentTaskTitle}”` : ''
  const parentDaysText = context.parentReferenceDurationDays ? `（父级参考 ${context.parentReferenceDurationDays} 天）` : ''
  const displaySummary = hasRhythmWindow && packageChildPlanDurationDays
    ? `参考工期 ${packageChildPlanDurationDays} 天（第 ${rhythmWindow!.startDay}-${rhythmWindow!.endDay} 天），已纳入父级${parentTitleText}${parentDaysText}计划窗口；计划表以父级包窗口为约束。`
    : parentWindowApplied
      ? `父级${parentTitleText}${parentDaysText}包窗口已明确，但该子工序尚未取得包内分配；不展示独立工序工期为最终计划工期。`
      : `参考工期 ${packageChildPlanDurationDays} 天，父级${parentTitleText}包窗口待明确；计划表以父级包窗口为最终约束。`

  return {
    ...suggestion,
    recommendedDurationDays: packageChildPlanDurationDays,
    conservativeDurationDays: packageChildConservativeDays ?? packageChildPlanDurationDays,
    businessReason: appendReason(suggestion.businessReason, reason),
    ...appendBusinessReasonCode(suggestion, 'PACKAGE_CHILD_DURATION_WINDOW', params),
    forecastSource: appendForecastSourceSuffix(suggestion.forecastSource, 'package_child_window'),
    durationBoundaryRole: 'package_child_window',
    parentDurationBoundaryPolicy: context.parentDurationBoundaryPolicy,
    nonAdditiveWithParentDuration: true,
    parentReferenceDurationDays: context.parentReferenceDurationDays,
    parentTaskTitle: context.parentTaskTitle,
    independentReferenceDurationDays,
    packageChildPlanDurationDays,
    planDurationTruthSource: params.planDurationTruthSource,
    displaySummary,
    factorAvailability: {
      ...(suggestion.factorAvailability ?? {}),
      parent_duration_boundary: true,
      package_child_duration_window: true,
      parent_package_window_plan_truth: parentWindowApplied,
      package_child_rhythm_window: hasRhythmWindow,
      package_child_rhythm_window_pending: noRhythmAllocation,
    },
    factorSummary: suggestion.factorSummary
      ? {
        ...suggestion.factorSummary,
        factorAvailability: {
          ...(suggestion.factorSummary.factorAvailability ?? {}),
          parent_duration_boundary: true,
          package_child_duration_window: true,
          parent_package_window_plan_truth: parentWindowApplied,
          package_child_rhythm_window: hasRhythmWindow,
          package_child_rhythm_window_pending: noRhythmAllocation,
        },
        parentDurationBoundary: params,
      }
      : suggestion.factorSummary,
  }
}

function logDurationSuggestionRun(
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
  suggestion: DurationSuggestion,
) {
  logger.info('[durationSuggestionService] duration suggestion evaluated', {
    taskId: normalizeId(input.taskId) || null,
    projectId: normalizeId(input.projectId) || null,
    purpose,
    dataMaturity: suggestion.dataMaturity ?? null,
    dataMaturityReasons: suggestion.dataMaturityReasons ?? [],
    confidenceLevel: suggestion.confidenceLevel,
    durationProvenance: suggestion.durationProvenance,
    businessReasonCode: suggestion.businessReasonCode ?? null,
    factorAvailability: suggestion.factorAvailability ?? null,
  })
}

function suggestionOutputKind(purpose: DurationSuggestionPurpose) {
  if (purpose === 'execution_reference') return 'execution_reference_duration'
  if (purpose === 'monthly_commitment_window') return 'monthly_commitment_reference_duration'
  return 'new_task_reference_duration'
}

function runtimeConsumptionStateForSuggestion(suggestion: DurationSuggestion) {
  const source = normalizeId(suggestion.forecastSource).toLowerCase()
  if (suggestion.durationProvenance === 'manual_override') return 'manual_override'
  if (source.includes('residual_overlay_published')) return 'residual_overlay_published'
  if (source.includes('residual_overlay_canary')) return 'residual_overlay_canary'
  if (suggestion.businessReasonParams?.companyBenchmarkBlendWeight != null) return 'company_blend'
  if (source.includes('cold_start_baseline')) return 'cold_start_baseline'
  if (source.includes('standard_work_duration_seed')) return 'seed_only'
  if (suggestion.durationCalibrationSource === 'standard_work_duration_seed+company_history_sample') return 'company_blend'
  if (suggestion.durationCalibrationSource === 'company_history_sample') return 'company_blend'
  if (suggestion.durationProvenance === 'historical_benchmark') return 'cold_start_baseline'
  return 'seed_only'
}

function standardWorkCodeSource(input: DurationSuggestionInput) {
  if (normalizeId(input.standardWorkCode)) return 'explicit_standard_work_code'
  if (normalizeId(input.templateStableCode)) return 'template_stable_code'
  if (normalizeId(input.templateNodeId)) return 'template_node'
  if (normalizeId(input.engineeringCategoryId)) return 'engineering_category'
  return 'unknown_or_weak_match'
}

function buildSuggestionDedupeKey(
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
  suggestion: DurationSuggestion,
) {
  const scope = normalizeId(input.projectId) ?? normalizeId(input.companyId) ?? 'global'
  const entity = normalizeId(input.taskId)
    ?? normalizeId(input.templateNodeId)
    ?? normalizeId(input.templateStableCode)
    ?? normalizeId(input.standardWorkCode)
    ?? normalizeId(input.engineeringCategoryId)
    ?? normalizeId(suggestion.benchmarkKey)
    ?? 'unscoped'
  return [
    scope,
    entity,
    purpose,
    suggestion.durationOutputCode ?? 'contextual_reference',
    normalizeId(suggestion.forecastSource) ?? 'unknown_source',
  ].join(':')
}

function buildSuggestionSeedLineage(input: DurationSuggestionInput, suggestion: DurationSuggestion) {
  return {
    standardWorkDurationSeedVersion: suggestion.businessReasonParams?.seedVersion ?? null,
    standardWorkDurationSeedStableCode: suggestion.businessReasonParams?.seedStableCode ?? normalizeId(suggestion.benchmarkKey) ?? null,
    standardWorkCode: normalizeId(input.standardWorkCode) ?? null,
    standardWorkCodeSource: standardWorkCodeSource(input),
    durationCalibrationSource: suggestion.durationCalibrationSource,
    durationProvenance: suggestion.durationProvenance,
  }
}

type SuggestionConstructionOrganizationEvidenceLineage = ConstructionOrganizationPlanNetworkRuntimeLineage & {
  businessType: string
}

function readSuggestionBusinessType(value: unknown) {
  const metadata = readMetadataObject(value)
  return normalizeId(
    metadata.businessType
      ?? metadata.business_type
      ?? metadata.businessTypeCode
      ?? metadata.business_type_code
      ?? metadata.projectTypeCode
      ?? metadata.project_type_code,
  ) || null
}

async function resolveSuggestionConstructionOrganizationEvidenceLineage(
  input: DurationSuggestionInput,
): Promise<SuggestionConstructionOrganizationEvidenceLineage | null> {
  let lineage =
    readConstructionOrganizationPlanNetworkRuntimeLineage(
      input.projectGenerationFacts,
      'durationSuggestionService.projectGenerationFacts',
    )
    ?? readConstructionOrganizationPlanNetworkRuntimeLineage(
      input.constructionOrganizationScenario,
      'durationSuggestionService.constructionOrganizationScenario',
    )
  let businessType =
    readSuggestionBusinessType(input.projectGenerationFacts)
    || normalizeId(input.projectTypeCode)
    || null

  const projectId = normalizeId(input.projectId)
  if ((!lineage || !businessType) && projectId) {
    const context = await readLiveProjectGenerationContext(projectId)
    lineage = lineage
      ?? readConstructionOrganizationPlanNetworkRuntimeLineage(
        context.constructionOrganizationScenario,
        'durationSuggestionService.projectMetadata.constructionOrganizationScenario',
      )
      ?? readConstructionOrganizationPlanNetworkRuntimeLineage(
        context.projectGenerationFacts,
        'durationSuggestionService.projectMetadata.projectGenerationFacts',
      )
    businessType =
      businessType
      || readSuggestionBusinessType(context.projectGenerationFacts)
  }

  if (!lineage || !businessType) return null
  return {
    ...lineage,
    businessType,
  }
}

function buildSuggestionNetworkLineage(
  input: DurationSuggestionInput,
  constructionOrganizationLineage?: SuggestionConstructionOrganizationEvidenceLineage | null,
) {
  const baseLineage = {
    wbsTemplateVersion: normalizeId(input.templateNodeId)
      ? `template-node:${normalizeId(input.templateNodeId)}`
      : normalizeId(input.templateStableCode)
        ? `template-stable:${normalizeId(input.templateStableCode)}`
        : null,
    dependencyRuleVersion: null,
    criticalPathInputHash: null,
    wbsNodeType: normalizeId(input.wbsNodeType) ?? null,
    engineeringCategoryId: normalizeId(input.engineeringCategoryId) ?? null,
  }
  const merged = mergeConstructionOrganizationLineageIntoContext(baseLineage, constructionOrganizationLineage)
  if (!constructionOrganizationLineage) return merged
  return {
    ...merged,
    businessType: constructionOrganizationLineage.businessType,
  }
}

async function recordDurationSuggestionPredictionEvent(
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
  suggestion: DurationSuggestion,
) {
  if (!suggestion.recommendedDurationDays) return
  try {
    const constructionOrganizationLineage = await resolveSuggestionConstructionOrganizationEvidenceLineage(input)
    const predictionContext = mergeConstructionOrganizationLineageIntoContext({
      sourceService: 'durationSuggestionService',
      suggestionPurpose: purpose,
      forecastSource: suggestion.forecastSource,
      confidenceLevel: suggestion.confidenceLevel,
      confidenceScore: suggestion.confidenceScore,
      conservativeDurationDays: suggestion.conservativeDurationDays,
      benchmarkKey: suggestion.benchmarkKey,
      businessReasonCode: suggestion.businessReasonCode ?? null,
      durationOutputCode: suggestion.durationOutputCode ?? null,
      calculationContext: suggestion.calculationContext ?? {},
    }, constructionOrganizationLineage)
    await recordDurationAccuracyPrediction({
      engineCode: 'standard_duration_reference',
      outputKind: suggestionOutputKind(purpose),
      projectId: input.projectId,
      taskId: input.taskId,
      dedupeKey: buildSuggestionDedupeKey(input, purpose, suggestion),
      predictionBasis: suggestion.forecastSource,
      predictionSource: 'durationSuggestionService',
      modelVersion: 'durationSuggestionService.v1.4.22.4',
      predictedStartDate: input.plannedStartDate,
      predictedFinishDate: input.plannedEndDate,
      predictedDurationDays: suggestion.recommendedDurationDays,
      runtimeConsumptionState: runtimeConsumptionStateForSuggestion(suggestion),
      seedLineage: buildSuggestionSeedLineage(input, suggestion),
      networkLineage: buildSuggestionNetworkLineage(input, constructionOrganizationLineage),
      predictionContext: constructionOrganizationLineage
        ? {
          ...predictionContext,
          businessType: constructionOrganizationLineage.businessType,
        }
        : predictionContext,
    })
  } catch (error) {
    logger.warn('[durationSuggestionService] failed to record duration prediction event', {
      projectId: input.projectId,
      taskId: input.taskId,
      purpose,
      error,
    })
  }
}

export async function recordCommittedDurationSuggestionPredictionEvidence(
  input: CommittedDurationSuggestionPredictionEvidence,
) {
  const companyId = normalizeId(input.companyId)
  const projectId = normalizeId(input.projectId)
  const taskId = normalizeId(input.taskId)
  const recommendedDurationDays = readPositiveNumber(input.recommendedDurationDays)
  const normalizedRuntimeApplications = input.runtimeApplications
    .map((application) => ({
      assetKey: normalizeId(application.assetKey),
      publicationKey: normalizeId(application.publicationKey),
      artifactKey: normalizeId(application.artifactKey),
      scopeLevel: normalizeId(application.scopeLevel),
      industryKey: normalizeId(application.industryKey) || null,
      inputTaskIds: Array.from(new Set(application.inputTaskIds.map(normalizeId).filter(Boolean))).sort(),
    }))
  const runtimeApplications = normalizedRuntimeApplications.filter((application) => (
      application.assetKey
      && application.publicationKey
      && application.artifactKey
      && DURATION_LEARNING_RUNTIME_SCOPE_LEVELS.has(
        application.scopeLevel as DurationLearningRuntimeScope['level'],
      )
      && (application.scopeLevel !== 'industry' || Boolean(application.industryKey))
      && application.inputTaskIds.includes(taskId)
    ))
  if (
    !companyId
    || !projectId
    || !taskId
    || !recommendedDurationDays
    || runtimeApplications.length === 0
    || runtimeApplications.length !== normalizedRuntimeApplications.length
  ) {
    throw new Error('committed_duration_prediction_lineage_invalid')
  }
  const runtimePublicationKeys = Array.from(new Set(
    runtimeApplications.map((application) => application.publicationKey),
  )).sort()
  const generationBatchId = normalizeId(input.generationBatchId) || null
  const forecastSource = normalizeId(input.forecastSource) || 'duration_learning_runtime_publication'
  const result = await recordDurationAccuracyPrediction({
    engineCode: 'standard_duration_reference',
    outputKind: 'new_task_reference_duration',
    projectId,
    taskId,
    dedupeKey: [
      projectId,
      taskId,
      generationBatchId ?? 'no_batch',
      ...runtimePublicationKeys,
    ].join(':'),
    predictionBasis: forecastSource,
    predictionSource: 'durationSuggestionService.committed_materialization',
    modelVersion: 'durationSuggestionService.v1.4.22.4',
    predictedStartDate: input.plannedStartDate,
    predictedFinishDate: input.plannedEndDate,
    predictedDurationDays: recommendedDurationDays,
    runtimeConsumptionState: 'duration_learning_runtime_publication',
    predictionContext: {
      sourceService: 'durationSuggestionService',
      sourceWriter: 'committed_materialization_durable_evidence',
      companyId,
      projectId,
      taskId,
      generationBatchId,
      standardWorkCode: normalizeId(input.standardWorkCode) || null,
      confidenceLevel: normalizeId(input.confidenceLevel) || null,
      confidenceScore: Number.isFinite(Number(input.confidenceScore)) ? Number(input.confidenceScore) : null,
      runtimePublicationKeys,
      runtimeApplications,
    },
    seedLineage: {
      standardWorkCode: normalizeId(input.standardWorkCode) || null,
      runtimeApplications,
    },
  })
  if (!result) throw new Error('duration_accuracy_prediction_not_persisted')
  return result
}

async function applyProjectExecutionEnvironment(
  base: DurationSuggestion,
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
): Promise<DurationSuggestion> {
  if (purpose !== 'new_task_reference' && purpose !== 'execution_reference') return base
  if (base.durationProvenance === 'manual_override') return base
  const recommended = readPositiveNumber(base.recommendedDurationDays)
  if (!recommended || !normalizeId(input.projectId) || !hasCoreClassification(input)) return base

  let next: DurationSuggestion = base
  const contextDetails: Record<string, unknown> = {}
  const contextAvailability: Record<string, boolean> = {}
  const maturityReasons: string[] = []
  let changed = false

  try {
    const learning = hasProjectBaselineCalibrationContext(next.factorSummary)
      ? null
      : await loadPublishedProgressVelocityRuntime({
        projectId: input.projectId,
        companyId: input.companyId,
        consumerKey: 'durationSuggestionService.similar_task_rhythm',
      })
    if (learning && learning.sampleCount >= 1) {
      const multiplier = clamp(Number(learning.multiplier ?? 1), 0.75, 1.35)
      const reason = `本项目已发布的同类任务节奏参数约为 ${Number(multiplier.toFixed(2))} 倍，已作为受控 L1 运行参数`
      const canApplyRecommended = learning.confidenceLevel === 'high' && learning.actionPolicy === 'auto_apply'
      const canPartialApplyRecommended = !canApplyRecommended
        && learning.confidenceLevel === 'medium'
        && learning.sampleCount >= 5
        && multiplier > 1.1
      const canAdjustConservative = canApplyRecommended || learning.confidenceLevel === 'medium' || learning.actionPolicy === 'candidate_only'
      const conservativeBase = readPositiveNumber(next.conservativeDurationDays ?? next.recommendedDurationDays)
      const currentRecommended = readPositiveNumber(next.recommendedDurationDays) ?? recommended
      const adjustedRecommended = canApplyRecommended
        ? applyMultiplierBeforeContextExtraDays(currentRecommended, multiplier, next.factorSummary)
        : canPartialApplyRecommended
          ? applyMultiplierBeforeContextExtraDays(currentRecommended, clamp(1 + (multiplier - 1) * 0.5, 1, 1.15), next.factorSummary)
          : currentRecommended
      const adjustedConservative = conservativeBase && canAdjustConservative
        ? Math.max(conservativeBase, Math.ceil(conservativeBase * Math.max(1, multiplier)), Math.ceil(adjustedRecommended * Math.max(1.15, multiplier)))
        : conservativeBase
      const scoreDelta = canApplyRecommended ? 4 : learning.confidenceLevel === 'medium' ? 0 : -5
      const confidenceScore = clamp(Number(next.confidenceScore ?? 50) + scoreDelta, 10, 95)

      next = {
        ...next,
        recommendedDurationDays: adjustedRecommended,
        conservativeDurationDays: adjustedConservative,
        confidenceScore,
        confidenceLevel: scoreToDurationConfidenceLevel(confidenceScore),
        businessReason: appendReason(next.businessReason, reason),
        ...appendBusinessReasonCode(next, 'PROJECT_SIMILAR_TASK_RHYTHM', {
          sampleCount: learning.sampleCount,
          confidenceLevel: learning.confidenceLevel,
          matchLevel: (learning.metadata as any)?.matchLevel ?? null,
          groupKey: learning.groupKey,
          similarTaskRecommendedAdjusted: canApplyRecommended || canPartialApplyRecommended,
          similarTaskRecommendedAdjustmentMode: canApplyRecommended ? 'full' : canPartialApplyRecommended ? 'partial' : 'none',
          similarTaskRecommendedMultiplier: canApplyRecommended
            ? multiplier
            : canPartialApplyRecommended
              ? Number(clamp(1 + (multiplier - 1) * 0.5, 1, 1.15).toFixed(3))
              : 1,
        }),
        displaySummary: null,
      }
      changed = true
      contextAvailability.similar_task_rhythm = true
      maturityReasons.push('project-level similar-task rhythm is available')
      contextDetails.similarTaskRhythm = {
        source: 'progressVelocityRuntimePublicationService',
        confidenceLevel: learning.confidenceLevel,
        confidenceScore: learning.confidenceScore,
        actionPolicy: learning.actionPolicy,
        sampleCount: learning.sampleCount,
        multiplier,
        groupKey: learning.groupKey,
        learningScope: (learning.metadata as any)?.learningScope ?? null,
      }
    }
  } catch (error) {
    logger.warn('[durationSuggestionService] similar task rhythm unavailable', { error })
  }

  try {
    const environment = await buildProjectEnvironmentBufferWithHealth(input, readPositiveNumber(next.recommendedDurationDays) ?? recommended)
    if (environment) {
      if (purpose === 'execution_reference' && environment.bufferKind === 'cold_start') {
        return changed
          ? {
            ...next,
            forecastSource: appendForecastSourceSuffix(next.forecastSource, 'project_execution_context'),
            dataMaturity: next.dataMaturity === 'L2' ? 'L2' : 'L1',
            dataMaturityReasons: Array.from(new Set([...(next.dataMaturityReasons ?? []), ...maturityReasons])),
            factorAvailability: {
              ...(next.factorAvailability ?? {}),
              project_execution_context: true,
              ...contextAvailability,
            },
            factorSummary: next.factorSummary
              ? {
                ...next.factorSummary,
                dataMaturity: next.dataMaturity === 'L2' ? 'L2' : 'L1',
                factorAvailability: {
                  ...(next.factorSummary.factorAvailability ?? {}),
                  project_execution_context: true,
                  ...contextAvailability,
                },
                projectExecutionContext: {
                  source: 'projectExecutionEnvironment',
                  ...contextDetails,
                },
              } as DurationContextSummary
              : next.factorSummary,
          }
          : base
      }
      const conservativeBase = readPositiveNumber(next.conservativeDurationDays ?? next.recommendedDurationDays)
      const recommendedBase = readPositiveNumber(next.recommendedDurationDays)
      const hasSimilarTaskRhythm = contextAvailability.similar_task_rhythm === true
      const hasBaselineCalibrationRhythm = hasProjectBaselineCalibrationContext(next.factorSummary)
      const hasPriorProjectRhythm = hasSimilarTaskRhythm || hasBaselineCalibrationRhythm
      const effectiveEnvironmentMultiplier = dampenEnvironmentMultiplierAfterPriorProjectRhythm(
        environment.multiplier,
        hasPriorProjectRhythm,
      )
      const shouldAdjustRecommended = effectiveEnvironmentMultiplier > 1.1
        && confidenceAtLeastMedium(environment.confidenceLevel)
        && environment.sampleCount >= 5
      const recommendedMultiplier = shouldAdjustRecommended
        ? clamp(effectiveEnvironmentMultiplier * 0.5 + 0.5, 1, 1.1)
        : 1
      const adjustedRecommended = recommendedBase && shouldAdjustRecommended
        ? Math.max(recommendedBase, Math.ceil(recommendedBase * recommendedMultiplier))
        : recommendedBase
      const adjustedConservative = conservativeBase
        ? Math.max(conservativeBase, Math.ceil(conservativeBase * effectiveEnvironmentMultiplier), conservativeBase + environment.extraDays)
        : conservativeBase
      const confidenceDelta = environment.extraDays > 0 ? -3 : 2
      const confidenceScore = clamp(Number(next.confidenceScore ?? 50) + confidenceDelta, 10, 95)

      next = {
        ...next,
        recommendedDurationDays: adjustedRecommended,
        conservativeDurationDays: adjustedConservative,
        confidenceScore,
        confidenceLevel: scoreToDurationConfidenceLevel(confidenceScore),
        businessReason: appendReason(next.businessReason, environment.reason),
        ...appendBusinessReasonCode(next, 'PROJECT_ENVIRONMENT_BUFFER', {
          sampleCount: environment.sampleCount,
          averageDurationRatio: environment.averageDurationRatio,
          delayRatio: environment.delayRatio,
          multiplier: environment.multiplier,
          environmentMultiplier: environment.multiplier,
          effectiveEnvironmentMultiplier,
          environmentDampenedBySimilarTaskRhythm: hasSimilarTaskRhythm && effectiveEnvironmentMultiplier < environment.multiplier,
          environmentDampenedByPriorProjectRhythm: hasPriorProjectRhythm && effectiveEnvironmentMultiplier < environment.multiplier,
          environmentDampenedByBaselineCalibration: hasBaselineCalibrationRhythm && effectiveEnvironmentMultiplier < environment.multiplier,
          recommendedMultiplier,
          recommendedAdjusted: shouldAdjustRecommended,
          bufferKind: environment.bufferKind ?? null,
          healthScore: environment.healthScore ?? null,
          healthBandMultiplier: environment.healthBandMultiplier ?? null,
          healthBandSource: environment.healthBandSource ?? null,
        }),
        displaySummary: null,
      }
      changed = true
      contextAvailability.project_environment_buffer = true
      maturityReasons.push('project-level execution environment buffer is available')
      contextDetails.projectEnvironmentBuffer = environment
    }
  } catch (error) {
    logger.warn('[durationSuggestionService] project environment buffer unavailable', { error })
  }

  if (!changed) return base

  return {
    ...next,
    forecastSource: appendForecastSourceSuffix(next.forecastSource, 'project_execution_context'),
    dataMaturity: next.dataMaturity === 'L2' ? 'L2' : 'L1',
    dataMaturityReasons: Array.from(new Set([...(next.dataMaturityReasons ?? []), ...maturityReasons])),
    factorAvailability: {
      ...(next.factorAvailability ?? {}),
      project_execution_context: true,
      ...contextAvailability,
    },
    factorSummary: next.factorSummary
      ? {
        ...next.factorSummary,
        dataMaturity: next.dataMaturity === 'L2' ? 'L2' : 'L1',
        factorAvailability: {
          ...(next.factorSummary.factorAvailability ?? {}),
          project_execution_context: true,
          ...contextAvailability,
        },
        projectExecutionContext: {
          source: 'projectExecutionEnvironment',
          ...contextDetails,
        },
      } as DurationContextSummary
      : next.factorSummary,
  }
}

async function finalizeSuggestion(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
  purpose: DurationSuggestionPurpose,
) {
  const contextualSuggestion = await applyProjectExecutionEnvironment(suggestion, input, purpose)
  const boundedSuggestion = withParentDurationBoundaryContext(contextualSuggestion, input)
  const replayCalibratedSuggestion = await applyPlanningReplayCalibrationReadbackToSuggestion(boundedSuggestion, input, purpose)
  const plausibleSuggestion = withEngineeringPlausibilityGuardrails(replayCalibratedSuggestion, input)
  const finalSuggestion = withDisplaySummary(
    purpose === 'monthly_commitment_window'
      ? buildMonthlyCommitmentWindowSuggestion(plausibleSuggestion, input)
      : plausibleSuggestion,
  )
  const t2ContextualSuggestion = withT2RhythmScheduleCandidateContext(finalSuggestion, input)
  const t2NetworkEvaluationSuggestion = withT2RhythmScheduleCandidateNetworkEvaluationContext(t2ContextualSuggestion, input)
  const t2Phase1SelectionSuggestion = withT2RhythmSchedulePhase1SelectionContext(t2NetworkEvaluationSuggestion, input)
  const assembledInputSuggestion = withDurationInputAssemblyContext(t2Phase1SelectionSuggestion, input)
  const calendarAwareSuggestion = withDurationCalendarContext(assembledInputSuggestion, input)
  const governedSuggestion = withDurationOutputContract(calendarAwareSuggestion)
  logDurationSuggestionRun(input, purpose, governedSuggestion)
  if (input.runtimeEvidenceMode === 'record') {
    await recordDurationSuggestionPredictionEvent(input, purpose, governedSuggestion)
  }
  return governedSuggestion
}

function withDurationOutputContract(suggestion: DurationSuggestion): DurationSuggestion {
  const contract = getDurationOutputContract('contextual_reference')
  if (!contract) return suggestion
  const contractSummary = {
    code: contract.code,
    semanticFieldName: contract.semanticFieldName,
    ownerService: contract.ownerService,
    algorithmFactContextPhase: contract.algorithmFactContextPhase,
    allowedWriteTargets: contract.allowedWriteTargets,
    boundaryPolicy: contract.boundaryPolicy,
  }
  const calculationContext = {
    ...(suggestion.factorSummary?.calculationContext ?? {}),
    ...(suggestion.calculationContext ?? {}),
    durationOutputContract: contractSummary,
  } as DurationSuggestion['calculationContext']
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        durationOutputContract: contractSummary,
      },
    }
    : suggestion.factorSummary

  return {
    ...suggestion,
    durationOutputCode: contract.code,
    durationOutputSemanticFieldName: contract.semanticFieldName,
    durationOutputContract: contractSummary,
    contextualReferenceDays: suggestion.recommendedDurationDays,
    factorSummary,
    calculationContext,
  }
}

function withEngineeringPlausibilityGuardrails(
  suggestion: DurationSuggestion,
  input: DurationSuggestionInput,
): DurationSuggestion {
  const recommended = readPositiveNumber(suggestion.recommendedDurationDays)
  if (!recommended) return suggestion
  const conservative = readPositiveNumber(suggestion.conservativeDurationDays ?? suggestion.recommendedDurationDays)
  const recommendedGuard = evaluateDurationPlausibility({
    engineCode: 'duration_suggestion',
    durationDays: recommended,
    title: input.taskTitle ?? input.standardWorkName,
    standardWorkCode: input.standardWorkCode ?? input.templateStableCode,
    standardWorkName: input.standardWorkName,
    taskId: input.taskId,
    clamp: true,
  })
  const conservativeGuard = conservative
    ? evaluateDurationPlausibility({
      engineCode: 'duration_suggestion',
      durationDays: conservative,
      title: input.taskTitle ?? input.standardWorkName,
      standardWorkCode: input.standardWorkCode ?? input.templateStableCode,
      standardWorkName: input.standardWorkName,
      taskId: input.taskId,
      clamp: true,
    })
    : { durationDays: null, warnings: [] as DurationPlausibilityWarning[] }
  const warnings = [...recommendedGuard.warnings, ...conservativeGuard.warnings]
  if (warnings.length === 0) return suggestion
  const nextRecommended = recommendedGuard.durationDays ?? recommended
  const nextConservative = Math.max(
    nextRecommended,
    conservativeGuard.durationDays ?? conservative ?? nextRecommended,
  )
  const calculationContext = {
    ...(suggestion.calculationContext ?? {}),
    durationPlausibilityWarnings: [
      ...(((suggestion.calculationContext as any)?.durationPlausibilityWarnings ?? []) as DurationPlausibilityWarning[]),
      ...warnings,
    ],
  } as DurationSuggestion['calculationContext']
  const factorSummary = suggestion.factorSummary
    ? {
      ...suggestion.factorSummary,
      calculationContext: {
        ...suggestion.factorSummary.calculationContext,
        durationPlausibilityWarnings: [
          ...(((suggestion.factorSummary.calculationContext as any)?.durationPlausibilityWarnings ?? []) as DurationPlausibilityWarning[]),
          ...warnings,
        ],
      },
    } as DurationContextSummary
    : suggestion.factorSummary
  return {
    ...suggestion,
    recommendedDurationDays: nextRecommended,
    conservativeDurationDays: nextConservative,
    calculationContext,
    factorSummary,
    businessReason: appendReason(suggestion.businessReason, '已通过工程合理性护栏校验参考工期'),
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      durationPlausibilityWarnings: warnings,
    },
    displaySummary: null,
  }
}

export async function getTaskDurationSuggestion(input: DurationSuggestionInput): Promise<DurationSuggestion> {
  let normalizedInput: DurationSuggestionInput = input
  const assembledInput = await assembleDurationInput(input, {
    purpose: input.suggestionPurpose === 'execution_reference'
      ? 'execution_reference'
      : input.suggestionPurpose === 'monthly_commitment_window'
        ? 'monthly_plan'
        : 'new_task_reference',
    allowLiveProjectReread: input.suggestionPurpose === 'execution_reference',
  })
  const hydratedInput = {
    ...assembledInput,
    durationInputAssembly: assembledInput as DurationInputAssemblerResult<DurationSuggestionInput>,
  }
  const taskMergedInput = await mergeSuggestionTaskContext(enrichDurationInputFromProjectGenerationFacts(hydratedInput))
  const wbsNodeType = taskMergedInput.wbsNodeType ?? 'process'
  const projectId = normalizeId(taskMergedInput.projectId) || null
  const suggestionPurpose = resolveSuggestionPurpose(taskMergedInput)
  normalizedInput = { ...taskMergedInput, projectId, wbsNodeType, suggestionPurpose }
  const workCalendar = normalizedInput.workCalendar ?? await resolveConstructionCalendarContext({
    projectId,
    standardWorkCode: normalizedInput.standardWorkCode,
    templateNodeId: normalizedInput.templateNodeId,
    onError: (error) => logger.warn('[durationSuggestionService] failed to load construction calendar context', {
      projectId,
      standardWorkCode: normalizedInput.standardWorkCode,
      templateNodeId: normalizedInput.templateNodeId,
      error,
    }),
  })
  normalizedInput = { ...normalizedInput, workCalendar }

  try {
    const companyId = await resolveCompanyId(normalizedInput)
    normalizedInput = { ...normalizedInput, companyId: companyId ?? normalizedInput.companyId }
    const factorSummary = filterDurationContextForPurpose(
      attachAlgorithmFactContextToSummary(
        await safeBuildDurationContext(normalizedInput, 'standard'),
        normalizedInput,
        suggestionPurpose,
      ),
      suggestionPurpose,
    )
    const unavailableMaturity = resolveDataMaturity(normalizedInput, 0, suggestionPurpose)
    const finalizeSuggestionWithRuntimeEvidence = async (
      suggestion: DurationSuggestion,
      runtimeArtifactPublications: readonly DurationSuggestionRuntimeArtifactPublication[],
    ) => {
      const governedSuggestion = await finalizeSuggestion(suggestion, normalizedInput, suggestionPurpose)
      if (!shouldRecordDurationRuntimeConsumerEvidence(normalizedInput)) return governedSuggestion
      const artifacts = buildDurationSuggestionConsumedArtifacts({
        runtimeArtifactPublications,
        projectId: normalizedInput.projectId,
        taskId: normalizedInput.taskId,
        standardWorkCode: normalizedInput.standardWorkCode,
      })
      try {
        const projectIdForEvidence = normalizeId(normalizedInput.projectId)
        const taskIdForEvidence = normalizeId(normalizedInput.taskId)
        const standardWorkCodeForEvidence = normalizeId(normalizedInput.standardWorkCode)
        await recordDurationSuggestionConsumedArtifacts({
          queryExec: createDurationRuntimeConsumerObservationQueryExec(
            normalizedInput.runtimeConsumerObservationQueryExec,
          ),
          callContext: {
            projectId: projectIdForEvidence || null,
            taskId: taskIdForEvidence || null,
            standardWorkCode: standardWorkCodeForEvidence || null,
            runtimeConsumer: 'durationSuggestionService',
            runtimeAssetMode: artifacts.length > 0 ? 'published_artifact' : 'no_published_artifact',
            runtimeArtifactCount: artifacts.length,
          },
          sourceEvidenceRefs: [
            [
              'duration_suggestion',
              projectIdForEvidence || 'no_project',
              taskIdForEvidence || standardWorkCodeForEvidence || 'no_task',
            ].join(':'),
          ],
          artifacts,
        })
      } catch (error) {
        logger.warn('[durationSuggestionService] failed to record duration runtime consumer evidence', {
          projectId: normalizedInput.projectId,
          taskId: normalizedInput.taskId,
          standardWorkCode: normalizedInput.standardWorkCode,
          error,
        })
      }
      return governedSuggestion
    }

    if (!hasCoreClassification(normalizedInput)) {
      const reason = getMissingClassificationReason(normalizedInput)
      const suggestion = withDurationOutputContract(withDisplaySummary({
        ...DEFAULT_DURATION_FALLBACK,
        businessReason: reason.message,
        businessReasonCode: reason.code,
        businessReasonCodes: [reason.code],
        businessReasonParams: reason.params,
        dataMaturity: unavailableMaturity.level,
        dataMaturityReasons: unavailableMaturity.reasons,
        dataUpgradePath: unavailableMaturity.upgradePath,
        dataUpgradeBlockedBy: unavailableMaturity.upgradeBlockedBy,
        factorAvailability: unavailableMaturity.factorAvailability,
        factorSummary: withMaturityFactorSummary(factorSummary, {
          dataMaturity: unavailableMaturity.level,
          factorAvailability: unavailableMaturity.factorAvailability,
          dataUpgradePath: unavailableMaturity.upgradePath,
          dataUpgradeBlockedBy: unavailableMaturity.upgradeBlockedBy,
        }),
        calculationContext: {
          ...factorSummary.calculationContext,
          duration_source: 'legacy',
        },
      }))
      logDurationSuggestionRun(normalizedInput, suggestionPurpose, suggestion)
      return suggestion
    }

    const granularityGuard = getTaskGranularityGuard(normalizedInput, suggestionPurpose)
    if (granularityGuard) {
      return finalizeSuggestion(
        buildRuntimeGuardSuggestion(normalizedInput, factorSummary, granularityGuard, suggestionPurpose),
        normalizedInput,
        suggestionPurpose,
      )
    }

    if (normalizedInput.templateNodeId) {
      const override = await findDurationOverride({
        templateNodeId: normalizedInput.templateNodeId,
        projectId,
        companyId,
      })

      const overrideDays = readPositiveNumber(override?.recommended_duration_days)
      if (overrideDays) {
        const conservativeOverrideDays = Math.max(
          overrideDays,
          readPositiveNumber(override?.conservative_duration_days) ?? overrideDays,
        )
        const maturity = resolveDataMaturity(normalizedInput, 1, suggestionPurpose)
        return finalizeSuggestion(withDurationContext({
          recommendedDurationDays: overrideDays,
          conservativeDurationDays: conservativeOverrideDays,
          confidenceLevel: 'high',
          confidenceScore: 90,
          forecastSource: 'manual_override',
          durationCalibrationSource: 'enterprise_override',
        durationProvenance: 'manual_override',
        businessReason: override?.reason ?? '已使用管理员确认的参考工期',
        businessReasonCode: 'STANDARD_SEED_REFERENCE',
        businessReasonCodes: ['STANDARD_SEED_REFERENCE'],
        businessReasonParams: { source: 'manual_override', conservativeSource: override?.conservative_duration_days ? 'manual_override' : 'recommended_override_floor' },
        benchmarkKey: null,
          sampleSize: 1,
          dataMaturity: maturity.level,
          dataMaturityReasons: maturity.reasons,
          dataUpgradePath: maturity.upgradePath,
          dataUpgradeBlockedBy: maturity.upgradeBlockedBy,
          factorAvailability: maturity.factorAvailability,
        }, factorSummary, { keepRecommendedDays: true }), normalizedInput, suggestionPurpose)
      }
    }

    const benchmarkIdentity = normalizedInput.templateNodeId
      ?? normalizedInput.templateStableCode
      ?? normalizedInput.standardWorkCode
      ?? normalizedInput.engineeringCategoryId
      ?? 'all'
    const allCauseBenchmarkCandidates = await collectBenchmarkCandidates({
      benchmarkIdentity,
      wbsNodeType,
      input: normalizedInput,
      companyId,
    })
    const causeAwareBenchmarkSelection = await selectCauseAwareBenchmarkCandidates(
      allCauseBenchmarkCandidates,
      normalizedInput.confirmedCauseCode,
    )
    const benchmarkCandidates = causeAwareBenchmarkSelection.candidates
    const benchmarkCauseSegment = causeAwareBenchmarkSelection.segment
    const benchmarkCauseFallback = causeAwareBenchmarkSelection.fallback
    const primaryBenchmarkCandidate = benchmarkCandidates[0] ?? null
    const companyBenchmarkCandidate = benchmarkCandidates.find((candidate) => candidate.scope === 'company') ?? null
    const benchmark = primaryBenchmarkCandidate?.benchmark ?? null
    const matchedBenchKey = primaryBenchmarkCandidate?.benchKey ?? [benchmarkIdentity, wbsNodeType, 'all'].join(':')
    const benchmarkScope: BenchmarkScope = primaryBenchmarkCandidate?.scope ?? 'system'
    const matchedBenchmarkContextKey = primaryBenchmarkCandidate?.contextKey ?? 'all'
    const benchmarkSampleSize = primaryBenchmarkCandidate?.sampleSize ?? 0
    const benchmarkSpecificity = primaryBenchmarkCandidate?.specificity ?? benchmarkContextSpecificity(matchedBenchmarkContextKey)
    const benchmarkUsable = benchmarkCandidates.length > 0
    const broadSystemBenchmark = benchmarkCandidates.length === 0
      ? await findBenchmark([benchmarkIdentity, wbsNodeType, 'all'].join(':'), null)
      : null
    const benchmarkGeneralizationSkipped = Boolean(
      broadSystemBenchmark
      && Number(broadSystemBenchmark.sample_count ?? 0) > 0
      && Number(broadSystemBenchmark.sample_count ?? 0) < 100
      && isTemplateUsableForContext(broadSystemBenchmark, normalizedInput, companyId),
    )

    const baselineMatchText = buildBaselineMatchText(normalizedInput)
    const resolvedBaselineMatchText = await expandTitleWeakStandardWorkSearchTextFromResolver(baselineMatchText, {
      projectId,
      companyId,
    })
    const weakStandardWorkCodes = await inferTitleWeakStandardWorkCodesFromResolver(baselineMatchText, {
      projectId,
      companyId,
    })
    const ambiguousStandardWorkGuard = getAmbiguousStandardWorkGuard(normalizedInput, weakStandardWorkCodes)
    if (ambiguousStandardWorkGuard) {
      return finalizeSuggestion(
        buildRuntimeGuardSuggestion(normalizedInput, factorSummary, ambiguousStandardWorkGuard, suggestionPurpose),
        normalizedInput,
        suggestionPurpose,
      )
    }
    const trustedMethodCodes = trustedMethodVariantCodes(normalizedInput)
    const trustedElementCodes = trustedElementVariantCodes(normalizedInput)
    const seedFeatureProfile = mergeRecords(
      buildDurationSeedFeatureProfile(normalizedInput),
      trustedMethodCodes.length > 0 ? { methodVariantCodes: trustedMethodCodes } : null,
      trustedElementCodes.length > 0 ? { elementVariantCodes: trustedElementCodes } : null,
    )
    const resolvedStandardSeed = await resolveStandardWorkDurationSeed(resolvedBaselineMatchText || baselineMatchText, {
      projectId,
      companyId,
      standardWorkCode: normalizedInput.standardWorkCode,
      standardWorkCodes: Array.from(new Set([
        ...(normalizedInput.standardWorkCode ? [normalizedInput.standardWorkCode] : []),
        ...(normalizedInput.templateStableCode ? [normalizedInput.templateStableCode] : []),
        ...weakStandardWorkCodes,
      ])),
      templateNodeId: normalizedInput.templateNodeId,
      methodVariantCodes: trustedMethodCodes,
      elementVariantCodes: trustedElementCodes,
      projectTypeCode: normalizedInput.projectTypeCode,
      structureTypeCode: normalizedInput.structureTypeCode,
      applicableGranularity: normalizedInput.wbsNodeType === 'summary' ? 'summary' : 'task',
      featureProfile: seedFeatureProfile,
    })
    const standardSeed = await applyLearnedStandardDurationPublication({
      suggestionInput: normalizedInput,
      companyId,
      seed: resolvedStandardSeed as Record<string, unknown> | null,
    })
    if (standardSeed) {
      const standardWorkConflictGuard = getStandardWorkConflictGuard(normalizedInput, standardSeed as Record<string, unknown>)
      if (standardWorkConflictGuard) {
        return finalizeSuggestion(
          buildRuntimeGuardSuggestion(normalizedInput, factorSummary, standardWorkConflictGuard, suggestionPurpose),
          normalizedInput,
          suggestionPurpose,
        )
      }
      const durationContributionMode = readSeedDurationContributionMode(standardSeed as Record<string, unknown>)
      if (durationContributionMode && !isDurationBearingContributionModeFromResolver(durationContributionMode)) {
        const seedEvidenceScope = resolveSeedEvidenceScope(standardSeed as any)
        const seedSampleSize = readSeedGovernanceSampleSize(standardSeed as any, seedEvidenceScope)
        const maturity = resolveDataMaturity(normalizedInput, seedSampleSize, suggestionPurpose, seedEvidenceScope)
        return finalizeSuggestionWithRuntimeEvidence(withDurationContext({
          recommendedDurationDays: null,
          conservativeDurationDays: null,
          confidenceLevel: (standardSeed as any).confidence ?? 'medium',
          confidenceScore: (standardSeed as any).confidence === 'high' ? 72 : (standardSeed as any).confidence === 'low' ? 38 : 56,
          forecastSource: 'standard_work_duration_seed:non_duration_bearing',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'unavailable',
          businessReason: `该标准工序为${describeDurationContributionModeFromResolver(durationContributionMode)}，不生成独立参考工期`,
          businessReasonCode: 'NON_DURATION_BEARING_STANDARD_WORK',
          businessReasonCodes: ['NON_DURATION_BEARING_STANDARD_WORK'],
          businessReasonParams: {
            seedSource: (standardSeed as any).__resolverSource ?? 'standard_work_duration_seed',
            durationContributionMode,
            durationContributionModeLabel: describeDurationContributionModeFromResolver(durationContributionMode),
          },
          benchmarkKey: `standard_work_duration:${(standardSeed as any).__stableCode ?? (standardSeed as any).stableCode}`,
          sampleSize: 0,
          dataMaturity: maturity.level,
          dataMaturityReasons: maturity.reasons,
          dataUpgradePath: maturity.upgradePath,
          dataUpgradeBlockedBy: maturity.upgradeBlockedBy,
          factorAvailability: {
            ...maturity.factorAvailability,
            standard_work_duration_seed: true,
            duration_contribution_mode: true,
          },
          durationContributionMode,
        }, factorSummary), buildDurationSuggestionRuntimeArtifactPublications({
          standardSeed: standardSeed as Record<string, unknown>,
        }))
      }
      const seedReference = resolveSeedReferenceDuration(standardSeed as Record<string, unknown>)
      const baseDays = seedReference.days
      const p80 = readPositiveNumber((standardSeed as any).defaultDaysP80 ?? (standardSeed as any).default_days_p80)
      const seedStableCode = (standardSeed as any).__stableCode ?? (standardSeed as any).stableCode
      const standardBenchmarkKey = `standard_work_duration:${seedStableCode}`
      const coldStartBaselines = suggestionPurpose === 'new_task_reference'
        ? await loadColdStartBaselines(standardBenchmarkKey)
        : []
      const coldStartDecision = baseDays
        ? decideAlgorithmAssetColdStartRuntime({
          companyId: companyId ?? 'unknown_company',
          projectId: normalizedInput.projectId ?? null,
          workCode: normalizeId(seedStableCode) ?? normalizeId(normalizedInput.standardWorkCode) ?? 'unknown_work_code',
          scenarioKeys: buildColdStartScenarioKeys(normalizedInput),
          systemSeedValue: baseDays,
          companyOverrideValue: companyBenchmarkCandidate ? readPositiveNumber(companyBenchmarkCandidate.benchmark.p50_days) : null,
          companyAcceptedSampleCount: companyBenchmarkCandidate?.sampleSize ?? 0,
          minCompanySamplesForOverride: 5,
          baselines: coldStartBaselines,
        })
        : null
      const coldStartRuntimeBaselineScope = coldStartRuntimeSource(coldStartDecision)
      const coldStartBaselineApplied = coldStartDecision?.status === 'shared_baseline_reference'
        && coldStartDecision.runtimeConsumable
        && Boolean(coldStartRuntimeBaselineScope)
      const coldStartBaseDays = coldStartBaselineApplied
        ? Math.max(1, Math.ceil(coldStartDecision.runtimeValue))
        : baseDays
      const coldStartP80 = coldStartBaselineApplied && coldStartBaseDays && baseDays
        ? coldStartConservativeDays(baseDays, p80, coldStartBaseDays)
        : p80
      const canBlendBenchmark = benchmarkCandidates.length > 0
        && benchmarkUsable
        && (suggestionPurpose === 'new_task_reference' || suggestionPurpose === 'execution_reference')
      const benchmarkBlendRuntimeParameter = companyBenchmarkCandidate
        && canBlendBenchmark
        ? await loadBenchmarkBlendRuntimeParameter(
            companyId,
            normalizedInput.projectId ?? null,
            normalizeId(normalizedInput.taskId) || normalizeId(normalizedInput.standardWorkCode),
          )
        : null
      const benchmarkBlend = canBlendBenchmark
        ? blendBenchmarkCandidates(coldStartBaseDays, coldStartP80, benchmarkCandidates, benchmarkBlendRuntimeParameter)
        : null
      const benchmarkBlendScopeLabel = benchmarkBlend?.scopes.length
        ? benchmarkBlend.scopes.map((scope) => (
          scope === 'company' ? '公司' : scope === 'system' ? '系统' : '项目'
        )).join(' / ')
        : benchmarkScope === 'company'
          ? '公司'
          : benchmarkScope === 'system'
            ? '系统'
            : '项目'
      const benchmarkBlendCalibrationSource: DurationCalibrationSource = benchmarkBlend
        ? benchmarkBlend.scopes.length > 1
          ? 'standard_work_duration_seed+mixed_history_sample'
          : benchmarkBlend.scopes[0] === 'company'
            ? 'standard_work_duration_seed+company_history_sample'
            : benchmarkBlend.scopes[0] === 'system'
              ? 'standard_work_duration_seed+system_history_sample'
              : 'standard_work_duration_seed+project_history_sample'
        : coldStartBaselineApplied ? 'cold_start_baseline' : 'standard_work_duration_seed'
      const effectiveBaseDays = benchmarkBlend?.days ?? coldStartBaseDays
      const sanitizedP80 = sanitizeSeedP80(
        effectiveBaseDays,
        benchmarkBlend?.conservativeDays ?? coldStartP80,
        seedReference.p50 ?? baseDays,
      )
      const seedEvidenceScope = resolveSeedEvidenceScope(standardSeed as any)
      const seedSampleSize = readSeedGovernanceSampleSize(standardSeed as any, seedEvidenceScope)
      const maturity = resolveDataMaturity(normalizedInput, seedSampleSize, suggestionPurpose, seedEvidenceScope)
      const scale = await resolveScaleAdjustment(normalizedInput, effectiveBaseDays, standardSeed as any, factorSummary)
      const scaledRecommended = applyScaleToDays(effectiveBaseDays, scale)
      const scaledConservative = applyScaleToDays(sanitizedP80.conservativeDays, scale)
      const baseConfidenceScore = (standardSeed as any).confidence === 'high' ? 74 : (standardSeed as any).confidence === 'low' ? 42 : 60
      const variantFallback = resolveSeedVariantFallback(normalizedInput, standardSeed as Record<string, unknown>)
      const confidenceScore = Math.max(10, baseConfidenceScore - sanitizedP80.confidencePenalty - variantFallback.penalty)
      const shouldRebuildContextWithEstimatedEnd = suggestionPurpose === 'new_task_reference'
        && Boolean(normalizeId(normalizedInput.plannedStartDate))
        && !normalizeId(normalizedInput.plannedEndDate)
      const effectiveFactorSummary = shouldRebuildContextWithEstimatedEnd
        ? await rebuildNewTaskReferenceContext(normalizedInput, scaledRecommended, 'standard')
        : factorSummary
      const variantFallbackReason = variantFallback.hasFallback
        ? '未匹配到对应施工方法/构件变体的专项 seed，当前使用通用参考工期'
        : null
      const coldStartBaselineReason = coldStartBaselineApplied
        ? `已引用匿名共享冷启动基线 ${coldStartDecision?.selectedBaselineId}`
        : null
      const seedBusinessReason = appendReason(
        appendReason(
          appendScaleReason(
            appendReason(
              (standardSeed as any).benchmarkBasis || '按标准工序默认工期给出参考',
              coldStartBaselineReason,
            ),
            scale,
          ),
          benchmarkBlend ? `已融合 ${benchmarkBlend.sampleCount} 条${benchmarkBlendScopeLabel}历史工期样本` : null,
        ),
        variantFallbackReason,
      )
      const benchmarkMetadataCandidate = benchmarkBlend?.companyCandidate ?? benchmarkBlend?.primaryCandidate ?? null
      const benchmarkDistributionCandidate = benchmarkBlend?.distributionCandidate ?? null
      const benchmarkDurationDistribution = benchmarkDistributionCandidate
        ? {
          p50: benchmarkDistributionCandidate.p50,
          p75: benchmarkDistributionCandidate.p75,
          p80: benchmarkDistributionCandidate.p80,
          mean: readPositiveNumber(benchmarkDistributionCandidate.benchmark.mean_days) ?? benchmarkDistributionCandidate.p50,
          variance: benchmarkDistributionCandidate.variance,
          dayBasis: 'construction_production_day',
          source: 'duration_benchmarks',
          scope: benchmarkDistributionCandidate.scope,
          sampleCount: benchmarkDistributionCandidate.sampleSize,
        }
        : null
      const effectiveFactorSummaryWithBenchmarkDistribution = benchmarkDurationDistribution
        ? {
          ...effectiveFactorSummary,
          calculationContext: {
            ...effectiveFactorSummary.calculationContext,
            durationDistribution: benchmarkDurationDistribution,
          },
        } as DurationContextSummary
        : effectiveFactorSummary
      const baseForecastSource = coldStartBaselineApplied
        ? 'standard_work_duration_seed+cold_start_baseline'
        : 'standard_work_duration_seed'
      const standardForecastSource = scale.factor === 1 ? baseForecastSource : appendForecastSourceSuffix(baseForecastSource, 'scale_proxy')
      const runtimeArtifactPublications = buildDurationSuggestionRuntimeArtifactPublications({
        benchmarkBlendRuntimeParameter,
        benchmark: benchmarkDistributionCandidate?.benchmark ?? null,
        coldStartDecision,
        coldStartBaselines,
        standardSeed: standardSeed as Record<string, unknown>,
      })
      return finalizeSuggestionWithRuntimeEvidence(withQuantitySourceSummary(withScaleFactorSummary(withDurationContext({
        recommendedDurationDays: scaledRecommended,
        conservativeDurationDays: scaledConservative,
        confidenceLevel: (standardSeed as any).confidence ?? 'medium',
        confidenceScore,
        forecastSource: standardForecastSource,
        durationCalibrationSource: benchmarkBlendCalibrationSource,
        durationProvenance: coldStartBaselineApplied ? 'historical_benchmark' : 'standard_work_duration_seed',
        businessReason: seedBusinessReason,
        businessReasonCode: variantFallback.hasFallback ? 'STANDARD_SEED_VARIANT_FALLBACK' : scale.factor === 1 ? 'STANDARD_SEED_REFERENCE' : 'BASED_ON_SEED_AND_COVERAGE',
        businessReasonCodes: [variantFallback.hasFallback ? 'STANDARD_SEED_VARIANT_FALLBACK' : scale.factor === 1 ? 'STANDARD_SEED_REFERENCE' : 'BASED_ON_SEED_AND_COVERAGE'],
        businessReasonParams: {
          seedSource: (standardSeed as any).__resolverSource ?? 'standard_work_duration_seed',
          seedVersion: (standardSeed as any).__seedVersion ?? (standardSeed as any).seedVersion ?? (standardSeed as any).sourceVersion ?? null,
          seedStableCode: seedStableCode ?? null,
          seedReferenceAnchor: seedReference.anchor,
          seedP50Days: seedReference.p50,
          seedMeanDays: seedReference.mean,
          coldStartBaselineStatus: coldStartDecision?.status ?? 'cold_start_not_evaluated',
          coldStartBaselineId: coldStartDecision?.selectedBaselineId ?? null,
          coldStartBaselineScope: coldStartRuntimeBaselineScope,
          coldStartBaselineRuntimeValue: coldStartBaselineApplied ? coldStartBaseDays : null,
          coldStartBaselineRuntimeSources: coldStartDecision?.runtimeSources ?? [],
          coldStartBaselineReasons: coldStartDecision?.reasons ?? [],
          seedVariantFallback: variantFallback.hasFallback,
          seedVariantFallbackPenalty: variantFallback.penalty,
          requestedMethodVariantCodes: variantFallback.requestedMethodVariantCodes,
          requestedElementVariantCodes: variantFallback.requestedElementVariantCodes,
          seedMethodVariantCodes: variantFallback.seedMethodCodes,
          seedElementVariantCodes: variantFallback.seedElementCodes,
          scaleFactor: scale.factor,
          scaleBasis: scale.source,
          scaleSignals: scale.signals,
          quantitySource: scale.quantitySource,
          quantityConfidence: scale.quantityConfidence,
          ...sanitizedP80.metadata,
          companyBenchmarkBlendWeight: benchmarkBlend?.weight,
          companyBenchmarkConservativeBlendWeight: benchmarkBlend?.conservativeWeight,
          companyBenchmarkP50: benchmarkMetadataCandidate?.p50,
          companyBenchmarkP75: benchmarkMetadataCandidate?.p75,
          companyBenchmarkP80: benchmarkMetadataCandidate?.p80,
          companyBenchmarkP80Source: benchmarkMetadataCandidate?.p80Source,
          companyBenchmarkVariance: benchmarkMetadataCandidate?.variance,
          companyBenchmarkReferenceDays: benchmarkMetadataCandidate?.referenceDays,
          companyBenchmarkReferenceSource: benchmarkMetadataCandidate?.referenceSource,
          companyBenchmarkP50P75BlendRatio: benchmarkMetadataCandidate?.p50P75BlendRatio,
          companyBenchmarkP50P75BlendRatioSource: benchmarkMetadataCandidate?.p50P75BlendRatioSource,
          companyBenchmarkP50P75BlendRatioPublicationKey: benchmarkMetadataCandidate?.p50P75BlendRatioPublicationKey,
          companyBenchmarkP50P75BlendRatioScopeLevel: benchmarkMetadataCandidate?.p50P75BlendRatioScopeLevel,
          companyBenchmarkP50P75BlendRatioAppliedTo: benchmarkMetadataCandidate?.p50P75BlendRatioAppliedTo,
          companyBenchmarkSampleCount: benchmarkMetadataCandidate?.sampleSize,
          companyBenchmarkBlendWeightSource: benchmarkMetadataCandidate?.weightSource,
          companyBenchmarkBlendWeightPublicationKey: benchmarkMetadataCandidate?.weightPublicationKey,
          companyBenchmarkBlendWeightScopeLevel: benchmarkMetadataCandidate?.weightScopeLevel,
          benchmarkBlendScope: benchmarkBlend?.scopes.length === 1 ? benchmarkBlend.scopes[0] : benchmarkBlend ? 'mixed' : null,
          benchmarkBlendScopes: benchmarkBlend?.scopes,
          benchmarkBlendCandidateCount: benchmarkBlend?.candidateCount,
          benchmarkBlendWeight: benchmarkBlend?.weight,
          benchmarkConservativeBlendWeight: benchmarkBlend?.conservativeWeight,
          benchmarkP50: benchmarkDistributionCandidate?.p50,
          benchmarkP75: benchmarkDistributionCandidate?.p75,
          benchmarkP80: benchmarkDistributionCandidate?.p80,
          benchmarkP80Source: benchmarkDistributionCandidate?.p80Source,
          benchmarkVariance: benchmarkDistributionCandidate?.variance,
          benchmarkDurationDayBasis: benchmarkDistributionCandidate ? 'construction_production_day' : null,
          benchmarkReferenceDays: benchmarkDistributionCandidate?.referenceDays,
          benchmarkReferenceSource: benchmarkDistributionCandidate?.referenceSource,
          benchmarkSampleCount: benchmarkBlend?.sampleCount,
          benchmarkBlendWeightSource: benchmarkMetadataCandidate?.weightSource,
          benchmarkGeneralizationSkipped,
          benchmarkCauseFallback,
        },
        benchmarkCauseSegment: benchmarkCauseSegment
          ? {
              causeCode: benchmarkCauseSegment.causeCode,
              taxonomyVersion: benchmarkCauseSegment.taxonomyVersion,
              generatedAt: benchmarkCauseSegment.generatedAt,
              sourceAsOf: benchmarkCauseSegment.sourceAsOf,
              sampleCount: benchmarkCauseSegment.sampleCount,
            }
          : null,
        benchmarkKey: standardBenchmarkKey,
        sampleSize: 0,
        dataMaturity: maturity.level,
        dataMaturityReasons: maturity.reasons,
        dataUpgradePath: maturity.upgradePath,
        dataUpgradeBlockedBy: maturity.upgradeBlockedBy,
        factorAvailability: {
          ...maturity.factorAvailability,
          standard_work_duration_seed: true,
          cold_start_baseline: coldStartBaselineApplied,
          seed_variant_specific_match: !variantFallback.hasFallback,
          task_scale_proxy: scale.factor !== 1,
        },
        durationContributionMode: durationContributionMode ?? 'duration_bearing',
      }, effectiveFactorSummaryWithBenchmarkDistribution), scale), scale), runtimeArtifactPublications)
    }

    const noSeedReason = getNoSeedReason(normalizedInput)
    const dataPendingSuggestion = withDurationOutputContract(withDisplaySummary({
      ...DEFAULT_DURATION_FALLBACK,
      confidenceLevel: 'data_pending',
      forecastSource: 'data_pending',
      businessReason: noSeedReason.message,
      businessReasonCode: noSeedReason.code,
      businessReasonCodes: [noSeedReason.code],
      businessReasonParams: {
        ...noSeedReason.params,
        benchmarkCauseFallback,
      },
      benchmarkCauseSegment: benchmarkCauseSegment
        ? {
            causeCode: benchmarkCauseSegment.causeCode,
            taxonomyVersion: benchmarkCauseSegment.taxonomyVersion,
            generatedAt: benchmarkCauseSegment.generatedAt,
            sourceAsOf: benchmarkCauseSegment.sourceAsOf,
            sampleCount: benchmarkCauseSegment.sampleCount,
          }
        : null,
      dataMaturity: unavailableMaturity.level,
      dataMaturityReasons: unavailableMaturity.reasons,
      dataUpgradePath: unavailableMaturity.upgradePath,
      dataUpgradeBlockedBy: unavailableMaturity.upgradeBlockedBy,
      factorAvailability: unavailableMaturity.factorAvailability,
      factorSummary: withMaturityFactorSummary(factorSummary, {
        dataMaturity: unavailableMaturity.level,
        factorAvailability: unavailableMaturity.factorAvailability,
        dataUpgradePath: unavailableMaturity.upgradePath,
        dataUpgradeBlockedBy: unavailableMaturity.upgradeBlockedBy,
      }),
      calculationContext: {
        ...factorSummary.calculationContext,
        duration_source: 'legacy',
      },
    }))
    logDurationSuggestionRun(normalizedInput, suggestionPurpose, dataPendingSuggestion)
    return dataPendingSuggestion
  } catch (error) {
    logger.error('Failed to get duration suggestion', { error })
    const fallbackContext = filterDurationContextForPurpose(
      await safeBuildDurationContext(normalizedInput, 'legacy'),
      suggestionPurpose,
    )
    const maturity = resolveDataMaturity(normalizedInput, 0, suggestionPurpose)
    return withDurationOutputContract(withDisplaySummary({
      ...DEFAULT_DURATION_FALLBACK,
      businessReason: '缺少工期依据，需手动填写',
      dataMaturity: maturity.level,
      dataMaturityReasons: maturity.reasons,
      dataUpgradePath: maturity.upgradePath,
      dataUpgradeBlockedBy: maturity.upgradeBlockedBy,
      factorAvailability: maturity.factorAvailability,
      factorSummary: fallbackContext,
    }))
  }
}
