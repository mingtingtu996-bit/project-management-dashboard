// v1.4.18 + v1.4.7.4: task duration forecast service.
// Forecasts are analysis records only; they never rewrite task plan dates or historical snapshots.

import { logger } from '../middleware/logger.js'
import type { DurationContextFactorKey, DurationContextSummary } from './durationContextService.js'
import { summarizeEffectiveDurationContextContributions } from './durationContextService.js'
import { getTaskDurationSuggestion } from './durationSuggestionService.js'
import { assembleDurationInput } from './durationInputAssemblerService.js'
import type { DurationAlgorithmHydratableInput } from './durationAlgorithmInputHydrationService.js'
import { supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import {
  readTaskStructuredCauseAuthority,
  type TaskStructuredCauseAuthority,
} from './taskStructuredCauseAuthorityService.js'
import {
  detectProgressAnomalySignals,
  type ProgressAnomalySignal,
  type ProgressAnomalySnapshot,
} from './progressAnomalyService.js'
import {
  type ProgressVelocityLearningResult,
} from './progressVelocityLearningService.js'
import { loadPublishedProgressVelocityRuntime } from './progressVelocityRuntimePublicationService.js'
import {
  resolveAlgorithmSeedRecords,
  type ResolvedAlgorithmSeedRecord,
} from './algorithmSeedResolver.js'
import type { AlgorithmSeedRecordPayload } from './algorithmSeedRegistry.js'
import {
  addConstructionProductionDays,
  dateInConstructionCalendarWindow,
  isSpringFestivalWindow,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  windowEndDateWithDefault,
  type ConstructionCalendarContext,
  type ConstructionCalendarWindow,
} from './constructionCalendar.js'
import { delayDayDelta, normalizeDateOnlyText, signedDurationDayDelta } from '../utils/durationDays.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import {
  buildAcceptancePlanImpactSignals,
  buildConditionImpactSignals,
  buildObstacleImpactSignals,
  summarizeDelayImpactSignals,
  type ExecutionImpactSignal,
} from './executionImpactSignals.js'
import {
  evaluateAlgorithmAssetParameterRuntimeUse,
  listAlgorithmAssetLearnableParameters,
  type AlgorithmAssetLearnableParameter,
} from './algorithmAssetLearnableParameterRegistryService.js'
import {
  loadAlgorithmAssetLearnableParameterRuntimeValue,
  type AlgorithmAssetLearnableParameterRuntimeConsumptionResult,
} from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import {
  mergeLiveProjectGenerationFactsForForecast,
  readLiveProjectGenerationFacts,
} from './projectGenerationFactsStoreService.js'
import {
  getDurationOutputContract,
  type DurationOutputCode,
} from './durationOutputGovernanceService.js'
import { recordDurationAccuracyPrediction } from './durationAlgorithmAccuracyService.js'
import {
  recordTaskDurationForecastConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import {
  readPlanningReplayCalibrationReadback,
  type PlanningReplayCalibrationReadback,
} from './planningReplayCalibrationService.js'
import {
  capDurationRelativeToBaseline,
  orderDurationBand,
  type DurationPlausibilityWarning,
} from './durationEngineeringPlausibilityGuardrailService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import {
  createDurationRuntimeConsumerObservationQueryExec,
} from './durationRuntimeConsumerObservationService.js'
import { resolveLiveTaskCriticalityProjection } from './taskCriticalityProjectionService.js'
import { listAcceptancePlanIdsCoveringTask } from './acceptancePlanTaskLinkService.js'

export interface TaskDurationForecast {
  taskId: string
  recommendedDurationDays: number | null
  executionReferenceDays?: number | null
  conservativeDurationDays: number | null
  durationOutputCode?: DurationOutputCode
  durationOutputSemanticFieldName?: string | null
  remainingForecastDays?: number | null
  optimisticRemainingDays?: number | null
  remainingDurationDays: number | null
  conservativeRemainingDays?: number | null
  forecastFinishDate: string | null
  forecastDelayDays: number
  delayRiskIndex?: number
  confidenceLevel: string
  confidenceScore: number
  forecastSource: string
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  factorSummary?: DurationContextSummary | null
  calculationContext?: DurationContextSummary['calculationContext'] | null
  dataMaturity?: 'L0' | 'L1' | 'L2'
  topFactors?: string[]
  businessFactorBadges?: BusinessFactorBadge[]
  forecastSources?: Record<string, unknown> | null
  probabilityDuration?: DurationProbabilityWindow | null
}

export interface TaskDurationForecastRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

export interface RecordTaskDurationForecastRuntimeConsumptionInput {
  queryExec?: DurationRuntimeConsumerObservationQueryExec
  forecast: TaskDurationForecast
  runtimeArtifactPublications: readonly TaskDurationForecastRuntimeArtifactPublication[]
  projectId?: string | null
  taskId?: string | null
  observedAt?: string
}

export interface DurationProbabilityWindow {
  method: 'pert_from_existing_percentiles'
  source: string
  p20RemainingDays: number
  p50RemainingDays: number
  p80RemainingDays: number
  expectedRemainingDays: number
  variance: number | null
  standardDeviationDays: number | null
  confidenceBandWidthDays: number
  plausibilityWarnings?: DurationPlausibilityWarning[]
}

type ForecastTaskRow = {
  id?: string | null
  project_id?: string | null
  template_node_id?: string | null
  wbs_node_type?: string | null
  engineering_category_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  title?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  status?: string | null
  progress?: number | null
  ready_for_start?: boolean | null
  dependency_status?: string | null
  condition_status?: string | null
  obstacle_status?: string | null
  progress_impact_level?: string | null
  blocked_for_progress?: boolean | null
  readiness_summary?: Record<string, unknown> | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  participant_unit_id?: string | null
  is_critical?: boolean | null
  total_float_days?: number | string | null
  free_float_days?: number | string | null
  successor_count?: number | string | null
  milestone_distance_days?: number | string | null
  downstream_milestone_distance_days?: number | string | null
  criticality_weight?: number | string | null
  acceptance_required?: boolean | null
  material_required?: boolean | null
  standard_task_metadata?: Record<string, unknown> | null
}

const TASK_DURATION_FORECAST_CONSUMER_ASSET_KEYS = new Set([
  'forecast_residual_overlay',
  'forecast_confidence_weight',
])

type ForecastSnapshotRow = ProgressAnomalySnapshot

type ForecastObstacleRow = {
  id?: string | null
  status?: string | null
  severity?: string | null
  created_at?: string | null
  estimated_resolve_date?: string | null
  obstacle_type?: string | null
  description?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
}

type ForecastDependencyRow = {
  dependency_task_id?: string | null
  dependency_type?: string | null
  lag_days?: number | string | null
  required_for_start?: boolean | null
  status?: string | null
}

type ForecastDependencyForecastRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  recommended_duration_days?: number | string | null
  execution_reference_days?: number | string | null
  conservative_duration_days?: number | string | null
  forecast_finish_date?: string | null
  remaining_duration_days?: number | string | null
  forecast_delay_days?: number | string | null
  confidence_level?: string | null
  confidence_score?: number | string | null
  forecast_source?: string | null
  duration_calibration_source?: string | null
  duration_provenance?: string | null
  business_reason?: string | null
  factor_summary?: Record<string, unknown> | null
  calculation_context?: Record<string, unknown> | null
  delay_risk_index?: number | string | null
  model_version?: string | null
  generated_at?: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
}

type ForecastDependencyContext = {
  dependencies: ForecastDependencyRow[]
  dependencyTasks: Map<string, ForecastTaskRow>
  dependencyForecasts: Map<string, ForecastDependencyForecastRow>
  diagnostics: {
    maxDepth: number
    depthLimitReached: boolean
    selfDependencySkippedCount: number
    repeatedDependencySkippedCount: number
  }
}

type ForecastConditionRow = {
  id?: string | null
  condition_type?: string | null
  name?: string | null
  status?: string | null
  is_satisfied?: boolean | number | string | null
  required_for_start?: boolean | null
  blocking_level?: string | null
  drawing_package_id?: string | null
  drawing_package_code?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  target_date?: string | null
  planned_date?: string | null
  expected_date?: string | null
  due_date?: string | null
  participant_unit_id?: string | null
}

type ForecastProjectEntityLinkRow = {
  id?: string | null
  project_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  target_entity_type?: string | null
  target_entity_id?: string | null
  relation_type?: string | null
  status?: string | null
  display_snapshot?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

type ForecastDrawingPackageRow = {
  id?: string | null
  package_code?: string | null
  package_name?: string | null
  status?: string | null
  requires_review?: boolean | number | string | null
  completeness_ratio?: number | string | null
  missing_required_count?: number | string | null
  current_version_drawing_id?: string | null
  schedule_impact_flag?: boolean | number | string | null
  is_ready_for_construction?: boolean | number | string | null
}

type ForecastConstructionDrawingRow = {
  id?: string | null
  package_id?: string | null
  package_code?: string | null
  drawing_name?: string | null
  status?: string | null
  review_status?: string | null
  schedule_impact_flag?: boolean | number | string | null
  is_ready_for_construction?: boolean | number | string | null
  planned_submit_date?: string | null
  planned_pass_date?: string | null
  actual_pass_date?: string | null
  drawing_date?: string | null
  review_date?: string | null
}

type ForecastCertificateWorkItemRow = {
  id?: string | null
  item_name?: string | null
  certificate_name?: string | null
  name?: string | null
  title?: string | null
  status?: string | null
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | number | string | null
  block_reason?: string | null
}

type ForecastMaterialRow = {
  id?: string | null
  actual_arrival_date?: string | null
  expected_arrival_date?: string | null
  lifecycle_status?: string | null
  record_status?: string | null
}

type ForecastAcceptancePlanRow = {
  id?: string | null
  status?: string | null
  planned_date?: string | null
  actual_date?: string | null
  gate_type?: string | null
  gate_hint?: string | null
  requirement_ready_percent?: number | string | null
  upstream_unfinished_count?: number | string | null
  blocked_requirement_count?: number | string | null
  is_blocked?: boolean | null
  is_overdue?: boolean | null
  impact_signals?: ExecutionImpactSignal[] | null
  participant_unit_id?: string | null
}

type ForecastExternalReadinessContext = {
  conditions: ForecastConditionRow[]
  materials: ForecastMaterialRow[]
  acceptancePlans: ForecastAcceptancePlanRow[]
  forecastOnlyBridgeCounts?: {
    drawingPackageScheduleImpact: number
    constructionDrawingScheduleImpact: number
    certificateWorkItemGate: number
  }
  forecastOnlyBridgeSources?: string[]
}

type ForecastCandidateKey = 'reference_ratio' | 'spi_eac' | 'recent_velocity' | 'history_velocity'
type ForecastMaturity = 'L0' | 'L1' | 'L2'
type ProgressCurveType = 'linear' | 'front_heavy' | 'back_heavy' | 's_curve'

type ForecastCandidate = {
  key: ForecastCandidateKey
  days: number
  reason: string
}

type ForecastModelProfileRow = {
  id?: string | null
  model_key?: string | null
  confidence_weight?: number | string | null
  metadata?: Record<string, unknown> | null
}

type ForecastProjectOverlayRow = {
  id?: string | null
  project_id?: string | null
  model_key?: string | null
  model_version?: string | null
  overlay_status?: string | null
  sample_count?: number | string | null
  mean_absolute_error_days?: number | string | null
  bias_error_days?: number | string | null
  threshold_overlay?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

type ForecastResidualOverlayRow = {
  id?: string | null
  overlay_key?: string | null
  publication_key?: string | null
  asset_key?: string | null
  scope_level?: string | null
  company_id?: string | null
  project_id?: string | null
  learning_target?: string | null
  learning_maturity?: string | null
  publish_anchor?: string | null
  automation_maturity?: string | null
  original_mae?: number | string | null
  overlay_mae?: number | string | null
  mae_improvement_ratio?: number | string | null
  overcompensation_ratio?: number | string | null
  residual_payload?: Record<string, unknown> | null
  writes_base_duration_seed?: boolean | null
  target_table?: string | null
  rollback_target?: Record<string, unknown> | null
  runtime_publication_status?: string | null
  rollback_execution?: Record<string, unknown> | null
  rolled_back_at?: string | null
  updated_at?: string | null
}

const RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT = 5
const RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT = 10
const PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT = 5

type ForecastModelProfile = {
  id: string | null
  modelKey: string
  modelVersion: string
  source: 'table' | 'fallback' | 'table_project_overlay'
  candidateWeights: Record<ForecastMaturity, Partial<Record<ForecastCandidateKey, number>>>
  confidenceWeight: number
  metadata: Record<string, unknown>
}

type TaskRemainingForecastParameterRuntimeGate = {
  ownerAlgorithm: 'taskDurationForecastService'
  gateSource: 'algorithmAssetLearnableParameterRuntimeConsumptionService'
  appliedRuntimeParameterCount: number
  blockedRuntimeParameterCount: number
  parameters: Array<{
    parameterKey: string
    runtimeConsumable: boolean
    status: string
    publicationKey: string | null
    publicationStatus: string | null
    scopeLevel: string | null
    reasons: string[]
    runtimeValue: number | null
    appliedToForecast: boolean
  }>
}

type ForecastTriggerContext =
  | 'daily_dashboard_refresh'
  | 'user_clicked_refresh'
  | 'task_progress_changed'
  | 'monthly_plan_regeneration'
  | 'baseline_regeneration'
  | 'api_request'
  | 'system_batch'

type ForecastPrecisionLevel = 'fast' | 'balanced' | 'accurate'
type ForecastWritePolicy = 'insert_history' | 'update_current' | 'read_only'

export type ForecastTaskDurationOptions = {
  projectId?: string | null
  visibleProjectIds?: string[] | null
  triggerContext?: ForecastTriggerContext
  precisionLevel?: ForecastPrecisionLevel
  useCache?: boolean
  writePolicy?: ForecastWritePolicy
  dependencyDepth?: number
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
}

type NormalizedForecastOptions = {
  projectId: string | null
  visibleProjectIds: string[]
  triggerContext: ForecastTriggerContext
  precisionLevel: ForecastPrecisionLevel
  useCache: boolean
  writePolicy: ForecastWritePolicy
  dependencyDepth: number
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
}

type TaskForecastWorkspaceScope = {
  projectId?: string | null
  visibleProjectIds?: string[] | null
}

type DurationSuggestionResult = Awaited<ReturnType<typeof getTaskDurationSuggestion>>

type ForecastPlanRisk = {
  overdueWorkdays: number
  daysUntilPlannedEnd: number | null
  nearDue: boolean
  riskIndexDelta: number
  confidenceDelta: number
  reason: string | null
}

type ForecastContextImpact = {
  days: number
  multiplier: number
  accelerationMultiplier: number
  confidenceDelta: number
  rawConfidenceDelta: number
  appliedFactors: Array<Record<string, unknown>>
  lowConfidenceFactorCount: number
  planReferenceFallbackRecommended: boolean
  planReferenceFallbackFactorCount: number
  businessReasons: string[]
}

type BusinessFactorBadge = {
  type: string
  label: string
  severity: 'low' | 'medium' | 'high'
}

type UnstartedOverdueRuleImpact = {
  applies: boolean
  earliestStartDate: Date
  earliestStartWaitDays: number
  knownDateCandidates: Array<{ source: string; date: string }>
  unknownBlockerCount: number
  unknownHardConditionCount: number
  unknownCriticalObstacleCount: number
  unknownDependencyFinishCount: number
  unknownMaterialArrivalCount: number
  staleKnownDateCandidateCount: number
  missedWindowWorkdays: number
  plannedStartOverdueWorkdays: number
  plannedEndOverdueWorkdays: number
  referenceStalenessRatio: number | null
  riskIndexDelta: number
  confidenceDelta: number
  rawMissedWindowConfidencePenalty: number
  effectiveMissedWindowConfidencePenalty: number
  missedWindowPenaltyDecayApplied: boolean
  missedWindowPenaltyDecayRatio: number
  missedWindowPenaltyDecayReason: string | null
  riskComponents: Record<string, number>
  reasons: string[]
  businessFactorBadges: BusinessFactorBadge[]
  policy: EarliestStartRulePolicy
}

type EarliestStartRulePolicy = {
  stableCode: string
  source: ResolvedAlgorithmSeedRecord['__resolverSource'] | 'fallback'
  riskIndexDelta: number
  confidencePenaltyBase: number
  confidencePenaltyPerFiveWorkdays: number
  springFestivalPostWindowConfidencePenaltyRatio: number
  unknownBlockerConfidencePenaltyPerItem: number
  unknownBlockerRiskIndexDeltaPerItem: number
  unknownBlockerConfidencePenaltyMax: number
  missedWindowRiskBase: number
  missedWindowRiskWindowWorkdays: number
  missedWindowOverflowRiskPerWindow: number
  criticalUnknownRiskIndexDelta: number
  dependencyUnknownRiskIndexDelta: number
  materialUnknownRiskIndexDelta: number
  unknownDateRiskIndexDeltaPerItem: number
  referenceStalenessWarningRatio: number
  referenceStalenessCriticalRatio: number
  referenceStalenessWarningConfidenceDelta: number
  referenceStalenessCriticalConfidenceDelta: number
  referenceStalenessWarningRiskIndexDelta: number
  referenceStalenessCriticalRiskIndexDelta: number
  useDependencyForecastFinish: boolean
  useMaterialExpectedArrival: boolean
  useCriticalObstacleEstimatedResolve: boolean
  useHardConditionTargetDate: boolean
  useDrawingConditionTargetDate: boolean
  useCertificateConditionTargetDate: boolean
  useAcceptanceConditionTargetDate: boolean
  doNotAddUnknownDateDays: boolean
}

type SignalForecastImpact = ReturnType<typeof buildSignalForecastImpact>

type ForecastModelResult = {
  optimisticRemainingDays: number | null
  remainingDurationDays: number | null
  conservativeRemainingDays: number | null
  forecastFinishDate: string | null
  forecastDelayDays: number
  delayRiskIndex: number
  confidenceLevel: string
  confidenceScore: number
  dataMaturity: ForecastMaturity
  topFactors: string[]
  businessFactorBadges: BusinessFactorBadge[]
  forecastSources: Record<string, unknown>
  calculationContext: Record<string, unknown>
  probabilityDuration: DurationProbabilityWindow | null
}

const OPEN_OBSTACLE_STATUSES = ['pending', 'open', 'in_progress', '\u5f85\u5904\u7406', '\u5904\u7406\u4e2d']
const CLOSED_CONDITION_STATUSES = ['deleted', 'archived', 'cancelled', 'voided']
const SATISFIED_CONDITION_STATUSES = ['met', 'satisfied', 'done', 'completed', '\u5df2\u6ee1\u8db3', '\u5df2\u5b8c\u6210']
const PASSED_ACCEPTANCE_STATUSES = ['passed', 'completed', 'closed', 'archived', '\u5df2\u901a\u8fc7', '\u901a\u8fc7']
const CLOSED_MATERIAL_STATUSES = ['archived', 'voided', 'deleted', 'inactive']
const DAY_MS = 86_400_000
const CURRENT_FORECAST_CACHE_TTL_MS = 7 * DAY_MS
const FORECAST_BATCH_CONCURRENCY = 3
const DEFAULT_DAILY_FORECAST_REFRESH_LIMIT = 500
const DEFAULT_DAILY_FORECAST_REFRESH_BATCH_SIZE = 50
const DEFAULT_DAILY_FORECAST_REFRESH_MAX_RUNTIME_MS = 45_000
const DEFAULT_DAILY_FORECAST_FRESHNESS_SLO_MS = 36 * 60 * 60 * 1000
const MAX_RUNTIME_RESIDUAL_OVERCOMPENSATION_RATIO = 0.2
const MAX_RUNTIME_RESIDUAL_CORRECTION_DAYS = 14

const DEFAULT_CANDIDATE_WEIGHTS: ForecastModelProfile['candidateWeights'] = {
  L0: { reference_ratio: 1 },
  L1: { reference_ratio: 0.3, spi_eac: 0.35, recent_velocity: 0.35 },
  L2: { reference_ratio: 0.15, spi_eac: 0.3, recent_velocity: 0.35, history_velocity: 0.2 },
}

const DEFAULT_FORECAST_MODEL_PROFILE: ForecastModelProfile = {
  id: null,
  modelKey: 'remaining_duration_forecast',
  modelVersion: 'remaining_duration_forecast_v1',
  source: 'fallback',
  candidateWeights: DEFAULT_CANDIDATE_WEIGHTS,
  confidenceWeight: 1,
  metadata: {},
}

const DEFAULT_EARLIEST_START_RULE_POLICY: EarliestStartRulePolicy = {
  stableCode: 'fallback_unstarted_overdue_default',
  source: 'fallback',
  riskIndexDelta: 0.12,
  confidencePenaltyBase: 8,
  confidencePenaltyPerFiveWorkdays: 2,
  springFestivalPostWindowConfidencePenaltyRatio: 0.5,
  unknownBlockerConfidencePenaltyPerItem: 4,
  unknownBlockerRiskIndexDeltaPerItem: 0.04,
  unknownBlockerConfidencePenaltyMax: 20,
  missedWindowRiskBase: 0.35,
  missedWindowRiskWindowWorkdays: 30,
  missedWindowOverflowRiskPerWindow: 0.08,
  criticalUnknownRiskIndexDelta: 0.2,
  dependencyUnknownRiskIndexDelta: 0.2,
  materialUnknownRiskIndexDelta: 0.15,
  unknownDateRiskIndexDeltaPerItem: 0.1,
  referenceStalenessWarningRatio: 0.5,
  referenceStalenessCriticalRatio: 1,
  referenceStalenessWarningConfidenceDelta: -8,
  referenceStalenessCriticalConfidenceDelta: -16,
  referenceStalenessWarningRiskIndexDelta: 0.06,
  referenceStalenessCriticalRiskIndexDelta: 0.12,
  useDependencyForecastFinish: true,
  useMaterialExpectedArrival: true,
  useCriticalObstacleEstimatedResolve: true,
  useHardConditionTargetDate: true,
  useDrawingConditionTargetDate: true,
  useCertificateConditionTargetDate: true,
  useAcceptanceConditionTargetDate: true,
  doNotAddUnknownDateDays: true,
}

const DEFAULT_FORECAST_OPTIONS: NormalizedForecastOptions = {
  projectId: null,
  visibleProjectIds: [],
  triggerContext: 'api_request',
  precisionLevel: 'balanced',
  useCache: false,
  writePolicy: 'insert_history',
  dependencyDepth: 1,
}

const TRIGGER_CONTEXT_DEFAULTS: Partial<Record<ForecastTriggerContext, Partial<NormalizedForecastOptions>>> = {
  daily_dashboard_refresh: { precisionLevel: 'fast', useCache: true, writePolicy: 'update_current', dependencyDepth: 1 },
  user_clicked_refresh: { precisionLevel: 'accurate', useCache: false, writePolicy: 'insert_history', dependencyDepth: 2 },
  task_progress_changed: { precisionLevel: 'balanced', useCache: false, writePolicy: 'insert_history', dependencyDepth: 1 },
  monthly_plan_regeneration: { precisionLevel: 'balanced', useCache: true, writePolicy: 'insert_history', dependencyDepth: 2 },
  baseline_regeneration: { precisionLevel: 'balanced', useCache: true, writePolicy: 'insert_history', dependencyDepth: 2 },
  system_batch: { precisionLevel: 'fast', useCache: true, writePolicy: 'update_current', dependencyDepth: 1 },
}

const FORECAST_TRIGGER_CONTEXTS = new Set<ForecastTriggerContext>([
  'daily_dashboard_refresh',
  'user_clicked_refresh',
  'task_progress_changed',
  'monthly_plan_regeneration',
  'baseline_regeneration',
  'api_request',
  'system_batch',
])

const FORECAST_PRECISION_LEVELS = new Set<ForecastPrecisionLevel>(['fast', 'balanced', 'accurate'])
const FORECAST_WRITE_POLICIES = new Set<ForecastWritePolicy>(['insert_history', 'update_current', 'read_only'])

const DEFAULT_PROGRESS_CURVE_POLICIES: Record<ProgressCurveType, Array<{ minProgress?: number; maxProgress?: number; multiplier: number }>> = {
  linear: [{ multiplier: 1 }],
  front_heavy: [
    { minProgress: 85, multiplier: 1.6 },
    { minProgress: 70, multiplier: 1.35 },
    { maxProgress: 25, multiplier: 0.95 },
    { multiplier: 1 },
  ],
  back_heavy: [
    { minProgress: 80, multiplier: 1.5 },
    { minProgress: 50, multiplier: 1.25 },
    { multiplier: 1.1 },
  ],
  s_curve: [
    { minProgress: 85, multiplier: 1.15 },
    { maxProgress: 20, multiplier: 1.15 },
    { minProgress: 35, maxProgress: 70, multiplier: 0.95 },
    { multiplier: 1 },
  ],
}

const DEFAULT_STUCK_FINISHING_POLICIES: Record<ProgressCurveType, {
  progressThreshold: number
  stuckDaysThreshold: number
  floorDays: number
  criticalStuckDaysThreshold: number
  criticalFloorDays: number
}> = {
  linear: { progressThreshold: 90, stuckDaysThreshold: 14, floorDays: 7, criticalStuckDaysThreshold: 28, criticalFloorDays: 14 },
  front_heavy: { progressThreshold: 85, stuckDaysThreshold: 7, floorDays: 5, criticalStuckDaysThreshold: 28, criticalFloorDays: 14 },
  back_heavy: { progressThreshold: 75, stuckDaysThreshold: 5, floorDays: 7, criticalStuckDaysThreshold: 21, criticalFloorDays: 14 },
  s_curve: { progressThreshold: 85, stuckDaysThreshold: 7, floorDays: 10, criticalStuckDaysThreshold: 28, criticalFloorDays: 14 },
}

type WorkCalendarHolidayWindow = ConstructionCalendarWindow & ResolvedAlgorithmSeedRecord<AlgorithmSeedRecordPayload>

type WorkCalendarContext = ConstructionCalendarContext<WorkCalendarHolidayWindow>

function normalizeForecastOptions(options?: ForecastTaskDurationOptions): NormalizedForecastOptions {
  const rawTrigger = String(options?.triggerContext ?? '').trim() as ForecastTriggerContext
  const triggerContext = FORECAST_TRIGGER_CONTEXTS.has(rawTrigger) ? rawTrigger : DEFAULT_FORECAST_OPTIONS.triggerContext
  const triggerDefaults = TRIGGER_CONTEXT_DEFAULTS[triggerContext] ?? {}
  const rawPrecision = String(options?.precisionLevel ?? '').trim() as ForecastPrecisionLevel
  const rawWritePolicy = String(options?.writePolicy ?? '').trim() as ForecastWritePolicy
  const dependencyDepth = Math.max(1, Math.min(5, Math.round(Number(
    options?.dependencyDepth ?? triggerDefaults.dependencyDepth ?? DEFAULT_FORECAST_OPTIONS.dependencyDepth,
  ) || 1)))

  return {
    projectId: normalizeId(options?.projectId) || null,
    visibleProjectIds: [...new Set((options?.visibleProjectIds ?? [])
      .map(normalizeId)
      .filter((projectId): projectId is string => Boolean(projectId)))],
    triggerContext,
    precisionLevel: FORECAST_PRECISION_LEVELS.has(rawPrecision)
      ? rawPrecision
      : triggerDefaults.precisionLevel ?? DEFAULT_FORECAST_OPTIONS.precisionLevel,
    useCache: typeof options?.useCache === 'boolean'
      ? options.useCache
      : triggerDefaults.useCache ?? DEFAULT_FORECAST_OPTIONS.useCache,
    writePolicy: FORECAST_WRITE_POLICIES.has(rawWritePolicy)
      ? rawWritePolicy
      : triggerDefaults.writePolicy ?? DEFAULT_FORECAST_OPTIONS.writePolicy,
    dependencyDepth,
    runtimeConsumerObservationQueryExec: options?.runtimeConsumerObservationQueryExec ?? null,
  }
}

function normalizeDate(value: unknown) {
  return normalizeDateOnlyText(typeof value === 'string' || value instanceof Date ? value : null)
}

function parseDate(value: unknown) {
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calendarDateText(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10)
}

function normalizeBoolean(value: unknown) {
  if (value === true || value === 1 || value === '1') return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === '\u662f'
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeId(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildTaskDurationForecastConsumedArtifacts(input: {
  forecast: TaskDurationForecast
  runtimeArtifactPublications: readonly TaskDurationForecastRuntimeArtifactPublication[]
  projectId?: string | null
  taskId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId || input.forecast.taskId)
  return input.runtimeArtifactPublications
    .filter((publication) => TASK_DURATION_FORECAST_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        taskId: taskId || null,
        forecastFinishDate: input.forecast.forecastFinishDate,
        remainingDurationDays: input.forecast.remainingDurationDays,
        confidenceLevel: input.forecast.confidenceLevel,
        confidenceScore: input.forecast.confidenceScore,
      },
    }))
}

export function recordTaskDurationForecastRuntimeConsumption(
  input: RecordTaskDurationForecastRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const queryExec = createDurationRuntimeConsumerObservationQueryExec(input.queryExec)
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId || input.forecast.taskId)
  return recordTaskDurationForecastConsumedArtifacts({
    queryExec,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      taskId: taskId || null,
      forecastFinishDate: input.forecast.forecastFinishDate,
      remainingDurationDays: input.forecast.remainingDurationDays,
      conservativeRemainingDays: input.forecast.conservativeRemainingDays ?? null,
      confidenceLevel: input.forecast.confidenceLevel,
      confidenceScore: input.forecast.confidenceScore,
    },
    sourceEvidenceRefs: [
      [
        'task_duration_forecast',
        projectId || 'no_project',
        taskId || 'no_task',
        input.forecast.forecastFinishDate ?? 'no_finish',
      ].join(':'),
    ],
    artifacts: buildTaskDurationForecastConsumedArtifacts({
      forecast: input.forecast,
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
      taskId,
    }),
  })
}

function isTaskDurationForecastRuntimePublicationStatus(value: unknown) {
  const status = normalizeText(value)
  return status === 'published' || status === 'canary' || status === 'runtime_published'
}

function runtimeGateParametersFromForecast(forecast: TaskDurationForecast) {
  const sources = asRecord(forecast.forecastSources)
  const gate = asRecord(sources?.learnableParameterRuntimeGate)
  const parameters = gate?.parameters
  return Array.isArray(parameters)
    ? parameters.filter((parameter): parameter is Record<string, unknown> => Boolean(asRecord(parameter)))
    : []
}

function buildTaskDurationForecastRuntimeArtifactPublications(
  forecast: TaskDurationForecast,
): TaskDurationForecastRuntimeArtifactPublication[] {
  const publications: TaskDurationForecastRuntimeArtifactPublication[] = []
  const seen = new Set<string>()
  const push = (publication: TaskDurationForecastRuntimeArtifactPublication | null) => {
    if (!publication) return
    if (!normalizeText(publication.publicationKey)) return
    if (!isTaskDurationForecastRuntimePublicationStatus(publication.publicationStatus)) return
    const key = `${publication.assetKey}:${publication.publicationKey}`
    if (seen.has(key)) return
    seen.add(key)
    publications.push(publication)
  }

  for (const parameter of runtimeGateParametersFromForecast(forecast)) {
    if (parameter.parameterKey !== 'forecast.confidence_weight_multiplier') continue
    if (parameter.runtimeConsumable !== true || parameter.appliedToForecast !== true) continue
    const publicationKey = normalizeText(parameter.publicationKey)
    push({
      assetKey: 'forecast_confidence_weight',
      publicationKey,
      publicationStatus: normalizeText(parameter.publicationStatus),
      sourceEvidenceRefs: [`algorithm_learnable_parameter_runtime_publications:${publicationKey}`],
      observationContext: {
        parameterKey: parameter.parameterKey,
        scopeLevel: normalizeText(parameter.scopeLevel) || null,
        runtimeValue: typeof parameter.runtimeValue === 'number' && Number.isFinite(parameter.runtimeValue)
          ? parameter.runtimeValue
          : null,
      },
    })
  }

  const residualOverlay = asRecord(asRecord(forecast.forecastSources)?.residualOverlay)
  const residualOverlayPublicationKey = normalizeText(residualOverlay?.publicationKey)
    || (normalizeText(residualOverlay?.overlayKey).startsWith('forecast_residual_overlay_runtime:')
      ? normalizeText(residualOverlay?.overlayKey)
      : '')
  if (residualOverlay?.runtimeApplied === true && residualOverlayPublicationKey) {
    push({
      assetKey: 'forecast_residual_overlay',
      publicationKey: residualOverlayPublicationKey,
      publicationStatus: normalizeText(residualOverlay.runtimePublicationStatus),
      sourceEvidenceRefs: [`duration_forecast_residual_overlays:${normalizeText(residualOverlay.overlayKey) || residualOverlayPublicationKey}`],
      observationContext: {
        overlayKey: normalizeText(residualOverlay.overlayKey) || null,
        scopeLevel: normalizeText(residualOverlay.scopeLevel) || null,
        residualCorrectionDays: typeof residualOverlay.residualCorrectionDays === 'number'
          ? residualOverlay.residualCorrectionDays
          : null,
      },
    })
  }

  return publications
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeId).filter((item): item is string => Boolean(item))
  if (typeof value === 'string') {
    return value.split(',').map(normalizeId).filter((item): item is string => Boolean(item))
  }
  return []
}

function mergeRecords(...records: Array<Record<string, unknown> | null | undefined>) {
  return records.reduce<Record<string, unknown>>((merged, record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return merged
    return { ...merged, ...record }
  }, {})
}

function maxDate(left: Date | null | undefined, right: Date | null | undefined) {
  if (!left) return right ?? null
  if (!right) return left
  return right > left ? right : left
}

function calendarDeltaDays(start: Date, end: Date) {
  return signedDurationDayDelta(start, end) ?? 0
}

function productionWaitDays(start: Date, end: Date, calendar?: WorkCalendarContext | null) {
  if (end <= start) return 0
  return Math.max(0, productionDaysBetweenInclusive(start, end, calendar) - 1)
}

function delayProductionDaysAfter(plannedEnd: Date | null, forecastFinish: Date | null, calendar?: WorkCalendarContext | null) {
  return Math.max(0, delayDayDelta(plannedEnd, forecastFinish, calendar) ?? 0)
}

function springFestivalPenaltyDecay(params: {
  plannedStart: Date | null
  plannedEnd: Date | null
  today: Date
  calendar: WorkCalendarContext
  policy: EarliestStartRulePolicy
}) {
  const ratio = params.policy.springFestivalPostWindowConfidencePenaltyRatio
  if (ratio <= 0 || ratio >= 1) {
    return {
      applied: false,
      ratio: 1,
      reason: null as string | null,
      windowCode: null as string | null,
    }
  }

  const springWindow = params.calendar.windows.find((window) => (
    isSpringFestivalWindow(window)
    && (dateInConstructionCalendarWindow(params.plannedStart, window) || dateInConstructionCalendarWindow(params.plannedEnd, window))
  ))
  if (!springWindow) {
    return { applied: false, ratio: 1, reason: null as string | null, windowCode: null as string | null }
  }

  const end = windowEndDateWithDefault(springWindow)
  if (!end || params.today <= end) {
    return { applied: false, ratio: 1, reason: null as string | null, windowCode: normalizeId(springWindow.holidayCode ?? (springWindow as any).holiday_code ?? springWindow.stableCode) }
  }

  return {
    applied: true,
    ratio,
    reason: 'spring_festival_post_window_penalty_decay',
    windowCode: normalizeId(springWindow.holidayCode ?? (springWindow as any).holiday_code ?? springWindow.stableCode),
  }
}

function clampProgress(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function positiveCeil(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function candidateDays(value: number | null | undefined) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null
  return Math.max(1, Math.min(365, Math.ceil(Number(value))))
}

function remainingForecastRelativeBaselineDays(
  task: ForecastTaskRow | null,
  calendar: WorkCalendarContext,
  referenceTotal: number | null,
) {
  return plannedProductionDurationDays(task, calendar)
    ?? positiveCeil(referenceTotal)
    ?? null
}

function capTaskRemainingForecastDays(params: {
  days: number | null
  baselineDays: number | null
  task: ForecastTaskRow | null
  ruleId: string
}): { days: number | null, warnings: DurationPlausibilityWarning[] } {
  const capped = capDurationRelativeToBaseline({
    engineCode: 'task_remaining_forecast',
    durationDays: params.days,
    baselineDays: params.baselineDays,
    multiplier: 10,
    minCapDays: 30,
    ruleId: params.ruleId,
    message: 'Task remaining forecast exceeds 10x the planned/reference duration and was clamped for forecast stability.',
    taskId: params.task?.id ?? null,
    title: params.task?.title ?? null,
    standardWorkCode: params.task?.standard_work_code ?? null,
  })
  return { days: capped.durationDays, warnings: capped.warnings }
}

function smoothStep(value: number) {
  const x = clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

function inverseSmoothStep(progressRatio: number) {
  const target = clamp(progressRatio, 0, 1)
  let low = 0
  let high = 1
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2
    if (smoothStep(mid) < target) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function backHeavyRemainingEffortRatio(linearRemaining: number) {
  if (linearRemaining <= 0) return 0
  const structuralTailRatio = 0.1
  const variableRatio = 1 - structuralTailRatio
  return clamp(
    structuralTailRatio + variableRatio * (linearRemaining ** 0.75),
    linearRemaining,
    1,
  )
}

function remainingEffortRatioForCurve(curveType: ProgressCurveType, progress: number) {
  const linearRemaining = clamp((100 - progress) / 100, 0, 1)
  if (linearRemaining <= 0) return 0
  if (curveType === 'linear') return linearRemaining
  if (curveType === 'front_heavy') {
    return clamp(linearRemaining ** 1.15, 0.02, 1)
  }
  if (curveType === 'back_heavy') {
    return backHeavyRemainingEffortRatio(linearRemaining)
  }
  if (curveType === 's_curve') {
    const elapsedRatio = inverseSmoothStep(clamp(progress / 100, 0, 1))
    return clamp(1 - elapsedRatio, 0.02, 1)
  }
  return linearRemaining
}

function curveAwareVelocityDays(linearRemainingDays: number, curveType: ProgressCurveType, progress: number) {
  const linearRemaining = clamp((100 - progress) / 100, 0, 1)
  if (linearRemaining <= 0) return linearRemainingDays
  const curveRemaining = remainingEffortRatioForCurve(curveType, progress)
  return linearRemainingDays * clamp(curveRemaining / linearRemaining, 0.5, 2)
}

function readPositiveFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readFirstPositiveNumber(records: Array<Record<string, unknown> | null | undefined>, keys: string[]) {
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const parsed = readPositiveFiniteNumber(record[key])
      if (parsed !== null) return parsed
    }
  }
  return null
}

function readDurationDistributionSource(records: Array<Record<string, unknown> | null | undefined>) {
  for (const record of records) {
    const source = normalizeId(record?.source ?? record?.distributionSource ?? record?.distribution_source)
    if (source) return source
  }
  return 'duration_benchmarks'
}

function buildProbabilityDurationWindow(params: {
  calculationContext?: Record<string, unknown> | null
  businessReasonParams?: Record<string, unknown> | null
  recommendedDurationDays: number | null
  conservativeDurationDays: number | null
  progress: number
  remainingDurationDays: number | null
  progressCurveType?: ProgressCurveType
  progressCurveMultiplier?: number
}): DurationProbabilityWindow | null {
  if (params.remainingDurationDays === null) return null
  const calculationContext = asRecord(params.calculationContext)
  const businessReasonParams = asRecord(params.businessReasonParams)
  const nestedDistributions = [
    asRecord(calculationContext?.durationDistribution),
    asRecord(calculationContext?.duration_distribution),
    asRecord(calculationContext?.standardDurationDistribution),
    asRecord(calculationContext?.standard_duration_distribution),
    asRecord(calculationContext?.benchmarkDistribution),
    asRecord(calculationContext?.benchmark_distribution),
  ]
  const records = [
    ...nestedDistributions,
    calculationContext,
    businessReasonParams,
  ]
  const p50 = readFirstPositiveNumber(records, [
    'p50',
    'p50Days',
    'p50_days',
    'benchmarkP50',
    'benchmark_p50',
    'companyBenchmarkP50',
    'company_benchmark_p50',
    'mean',
    'companyBenchmarkMean',
    'company_benchmark_mean',
  ]) ?? readPositiveFiniteNumber(params.recommendedDurationDays)
  const p80 = readFirstPositiveNumber(records, [
    'p80',
    'p80Days',
    'p80_days',
    'benchmarkP80',
    'benchmark_p80',
    'companyBenchmarkP80',
    'company_benchmark_p80',
    'conservativeDays',
    'conservative_days',
  ]) ?? readPositiveFiniteNumber(params.conservativeDurationDays)
  if (p50 === null || p80 === null) return null

  const variance = readFirstPositiveNumber(records, [
    'variance',
    'weightedVariance',
    'weighted_variance',
    'benchmarkVariance',
    'benchmark_variance',
    'companyBenchmarkVariance',
    'company_benchmark_variance',
    'benchmarkCv',
    'benchmark_cv',
    'cv',
    'coefficientOfVariation',
    'coefficient_of_variation',
  ])
  const explicitP20 = readFirstPositiveNumber(records, [
    'p20',
    'p20Days',
    'p20_days',
    'companyBenchmarkP20',
    'company_benchmark_p20',
  ])
  const derivedP20 = variance !== null
    ? Math.max(1, Math.floor(p50 * (1 - clamp(variance, 0.02, 0.45) * 2.5)))
    : Math.max(1, Math.floor(p50 - Math.max(1, p80 - p50) * 0.75))
  const rawP20 = explicitP20 ?? derivedP20
  const orderedBand = orderDurationBand({
    engineCode: 'task_remaining_forecast',
    p20Days: rawP20,
    p50Days: p50,
    p80Days: Math.max(p50, p80),
  })
  const p20 = orderedBand.band.p20Days ?? Math.min(p50, rawP20)
  const orderedP50 = orderedBand.band.p50Days ?? p50
  const orderedP80 = orderedBand.band.p80Days ?? Math.max(p50, p80)
  const remainingRatio = remainingEffortRatioForCurve(params.progressCurveType ?? 'linear', params.progress)
  if (remainingRatio <= 0) return null
  const curveMultiplierValue = Math.max(0.1, Number(params.progressCurveMultiplier ?? 1) || 1)
  const toRemainingDays = (days: number) => {
    const curveAwareBase = candidateDays(days * remainingRatio)
    return curveAwareBase === null ? 0 : candidateDays(curveAwareBase * curveMultiplierValue) ?? 0
  }
  const p20RemainingDays = toRemainingDays(p20)
  const p50RemainingDays = toRemainingDays(orderedP50)
  const p80RemainingDays = Math.max(p50RemainingDays, toRemainingDays(orderedP80))
  if (p20RemainingDays <= 0 || p50RemainingDays <= 0 || p80RemainingDays <= 0) return null
  const expectedRemainingDays = Math.max(
    1,
    Math.ceil((p20RemainingDays + 4 * p50RemainingDays + p80RemainingDays) / 6),
  )
  const standardDeviationDays = variance !== null
    ? round(Math.max(0, p50 * Math.sqrt(clamp(variance, 0, 1)) * remainingRatio * curveMultiplierValue))
    : round(Math.max(0, (p80RemainingDays - p20RemainingDays) / 6))

  return {
    method: 'pert_from_existing_percentiles',
    source: readDurationDistributionSource(records),
    p20RemainingDays,
    p50RemainingDays,
    p80RemainingDays,
    expectedRemainingDays,
    variance: variance === null ? null : round(variance, 4),
    standardDeviationDays,
    confidenceBandWidthDays: Math.max(0, p80RemainingDays - p20RemainingDays),
    plausibilityWarnings: orderedBand.warnings,
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function plannedProductionDurationDays(task: ForecastTaskRow | null, calendar?: WorkCalendarContext | null) {
  const start = parseDate(task?.planned_start_date ?? task?.start_date)
  const end = parseDate(task?.planned_end_date ?? task?.end_date)
  if (start && end && end >= start) return Math.max(1, productionDaysBetweenInclusive(start, end, calendar))
  return null
}

function readTaskSemanticMetadata(task: ForecastTaskRow | null | undefined) {
  const metadata = asRecord(task?.standard_task_metadata)
  const controlRoles = asRecord(metadata?.controlRoles)
  const legacyControlRoles = asRecord(metadata?.control_roles)
  const durationContributionMode = normalizeId(
    metadata?.durationContributionMode
      ?? metadata?.duration_contribution_mode
      ?? metadata?.durationMode
      ?? metadata?.duration_mode,
  )
  const qualityControlRole = normalizeId(
    metadata?.qualityControlRole
      ?? metadata?.quality_control_role
      ?? controlRoles?.qualityControlRole
      ?? legacyControlRoles?.quality_control_role,
  )
  const inspectionAcceptanceRole = normalizeId(
    metadata?.inspectionAcceptanceRole
      ?? metadata?.inspection_acceptance_role
      ?? controlRoles?.inspectionAcceptanceRole
      ?? legacyControlRoles?.inspection_acceptance_role,
  )
  const documentEvidenceRole = normalizeId(
    metadata?.documentEvidenceRole
      ?? metadata?.document_evidence_role
      ?? controlRoles?.documentEvidenceRole
      ?? legacyControlRoles?.document_evidence_role,
  )

  return {
    metadata,
    durationContributionMode,
    qualityControlRole,
    inspectionAcceptanceRole,
    documentEvidenceRole,
  }
}

function includesTextAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function resolveTaskGateStatusDateSemantic(task: ForecastTaskRow | null | undefined) {
  const semantic = readTaskSemanticMetadata(task)
  const title = String(task?.title ?? task?.standard_work_name ?? '').trim()
  const text = `${title} ${semantic.durationContributionMode ?? ''} ${semantic.qualityControlRole ?? ''} ${semantic.inspectionAcceptanceRole ?? ''} ${semantic.documentEvidenceRole ?? ''}`
  const gateMode = ['quality_gate', 'handover_marker', 'external_wait', 'record_only'].includes(semantic.durationContributionMode ?? '')
  const gateRole = semantic.qualityControlRole === 'acceptance_gate'
    || semantic.inspectionAcceptanceRole === 'hidden_acceptance'
    || semantic.inspectionAcceptanceRole === 'special_acceptance'
    || semantic.inspectionAcceptanceRole === 'completion_acceptance'
    || semantic.documentEvidenceRole === 'handover_document'
    || semantic.documentEvidenceRole === 'inspection_record'
    || semantic.documentEvidenceRole === 'test_report'
  const gateText = includesTextAny(text, [
    'acceptance',
    'handover',
    'archive',
    'filing',
    'permit',
    'certificate',
    '验收',
    '移交',
    '交接',
    '交付',
    '资料',
    '归档',
    '组卷',
    '备案',
    '签认',
    '报告',
    '记录',
    '放行',
    '合格',
  ])
  const applies = Boolean((gateMode || gateRole || task?.acceptance_required) && gateText)

  return {
    applies,
    taskSemanticMode: applies ? 'gate_status_date' as const : 'execution_progress' as const,
    gateRelation: applies ? 'acceptance_gate' as const : null,
    durationContributionMode: semantic.durationContributionMode,
    qualityControlRole: semantic.qualityControlRole,
    inspectionAcceptanceRole: semantic.inspectionAcceptanceRole,
    documentEvidenceRole: semantic.documentEvidenceRole,
  }
}

function taskForecastWorkspaceProjectIds(workspaceScope: TaskForecastWorkspaceScope) {
  const projectId = normalizeId(workspaceScope.projectId)
  if (projectId) return [projectId]
  return [...new Set((workspaceScope.visibleProjectIds ?? [])
    .map(normalizeId)
    .filter((value): value is string => Boolean(value)))]
}

function applyTaskForecastWorkspaceScope(query: any, workspaceScope: TaskForecastWorkspaceScope) {
  const projectIds = taskForecastWorkspaceProjectIds(workspaceScope)
  if (projectIds.length === 0) throw new Error('TASK_DURATION_FORECAST_PROJECT_SCOPE_REQUIRED')
  return projectIds.length === 1
    ? query.eq('project_id', projectIds[0])
    : query.in('project_id', projectIds)
}

async function loadTask(
  taskId: string,
  workspaceScope: TaskForecastWorkspaceScope,
): Promise<ForecastTaskRow | null> {
  const query = (supabase as any)
    .from('tasks')
    .select('id, project_id, template_node_id, wbs_node_type, engineering_category_id, standard_work_code, standard_work_name, title, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, status, progress, ready_for_start, dependency_status, condition_status, obstacle_status, progress_impact_level, blocked_for_progress, readiness_summary, building_object_id, basement_object_id, floor_object_id, physical_zone_object_id, functional_area_object_id, participant_unit_id, is_critical, total_float_days, free_float_days, successor_count, milestone_distance_days, downstream_milestone_distance_days, criticality_weight, acceptance_required, material_required, standard_task_metadata')
    .eq('id', taskId)
  const { data, error } = await applyTaskForecastWorkspaceScope(query, workspaceScope)
    .maybeSingle()

  if (error) {
    logger.warn('[taskDurationForecastService] failed to load task', { taskId, error })
    return null
  }

  if (!data) throw new Error('TASK_DURATION_FORECAST_PROJECT_SCOPE_MISMATCH')
  return data as ForecastTaskRow
}

async function buildForecastProjectGenerationFactInput(task: ForecastTaskRow | null) {
  const frozenFacts = readProjectGenerationFactsSnapshot(task?.standard_task_metadata)
  const liveFacts = await readLiveProjectGenerationFacts(task?.project_id)
  const facts = mergeLiveProjectGenerationFactsForForecast(frozenFacts, liveFacts)
  const methodVariantCodes = readStringList(facts.methodVariantCodes)
  return {
    projectGenerationFacts: Object.keys(facts).length > 0 ? facts : null,
    projectTypeCode: normalizeId(facts.businessType),
    structureTypeCode: normalizeId(facts.structureTypeCode),
    methodVariantCodes: methodVariantCodes.length > 0 ? methodVariantCodes : null,
  }
}

function buildForecastRuntimeExecutionFacts(
  task: ForecastTaskRow | null,
  snapshots?: ForecastSnapshotRow[] | null,
  obstacles?: ForecastObstacleRow[] | null,
) {
  const progress = typeof task?.progress === 'number' ? task.progress : Number(task?.progress ?? 0)
  const criticalProjection = resolveLiveTaskCriticalityProjection(task)
  const hardObstacleCount = obstacles?.filter((row) => {
    const severity = normalizeId(row.severity).toLowerCase()
    return severity.includes('critical')
      || severity.includes('severe')
      || severity.includes('high')
      || severity.includes('major')
      || severity.includes('严重')
      || severity.includes('高')
  }).length ?? 0
  return {
    progressCompletionRatio: Number.isFinite(progress) ? progress / 100 : undefined,
    blockedTaskCount: obstacles?.length ?? (task?.blocked_for_progress ? 1 : 0),
    hardBlockerCount: hardObstacleCount,
    scheduleState: normalizeId(task?.obstacle_status) || normalizeId(task?.condition_status) || normalizeId(task?.dependency_status) || null,
    evidenceCodes: [
      snapshots && snapshots.length > 0 ? 'progress_snapshots' : null,
      obstacles && obstacles.length > 0 ? 'open_obstacles' : null,
      criticalProjection.isCritical ? 'critical_task' : null,
    ].filter((item): item is string => Boolean(item)),
  }
}

async function loadProgressSnapshots(taskId: string): Promise<ForecastSnapshotRow[]> {
  const { data, error } = await (supabase as any)
    .from('task_progress_snapshots')
    .select('task_id, progress, snapshot_date, created_at, notes, event_source')
    .eq('task_id', taskId)
    .order('snapshot_date', { ascending: true })
    .limit(80)

  if (error) {
    logger.warn('[taskDurationForecastService] failed to load task progress snapshots', { taskId, error })
    return []
  }

  return Array.isArray(data) ? data as ForecastSnapshotRow[] : []
}

async function loadOpenObstacles(taskId: string): Promise<ForecastObstacleRow[]> {
  const { data, error } = await (supabase as any)
    .from('task_obstacles')
    .select('id, status, severity, created_at, estimated_resolve_date, obstacle_type, description, source_entity_type, source_entity_id')
    .eq('task_id', taskId)
    .in('status', OPEN_OBSTACLE_STATUSES)

  if (error) {
    logger.warn('[taskDurationForecastService] failed to load task obstacles', { taskId, error })
    return []
  }

  return Array.isArray(data) ? data as ForecastObstacleRow[] : []
}

async function countOpenObstacles(taskId: string) {
  const { data } = await (supabase as any)
    .from('task_obstacles')
    .select('id, status')
    .eq('task_id', taskId)
    .in('status', OPEN_OBSTACLE_STATUSES)

  return Array.isArray(data) ? data.length : 0
}

async function loadActiveDependencies(taskId: string, projectId?: string | null): Promise<ForecastDependencyRow[]> {
  const normalizedProjectId = normalizeId(projectId)
  try {
    let query = (supabase as any)
      .from('task_dependencies')
      .select('dependency_task_id, dependency_type, lag_days, required_for_start, status')
      .eq('task_id', taskId)
      .eq('status', 'active')
    if (normalizedProjectId) query = query.eq('project_id', normalizedProjectId)
    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data as ForecastDependencyRow[] : []
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load task dependencies', { taskId, error })
    return []
  }
}

async function loadDependencyTasks(
  taskIds: string[],
  projectId: string,
): Promise<Map<string, ForecastTaskRow>> {
  if (taskIds.length === 0) return new Map()
  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, project_id, title, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, status, progress, ready_for_start, dependency_status, condition_status, obstacle_status, progress_impact_level, blocked_for_progress, readiness_summary')
    .in('id', taskIds)
    .eq('project_id', projectId)

  if (error) {
    logger.warn('[taskDurationForecastService] failed to load dependency tasks', { taskIds, error })
    return new Map()
  }

  return new Map((Array.isArray(data) ? data : []).map((task: ForecastTaskRow) => [String(task.id ?? ''), task]))
}

async function loadCurrentDependencyForecasts(
  taskIds: string[],
  projectId: string,
): Promise<Map<string, ForecastDependencyForecastRow>> {
  if (taskIds.length === 0) return new Map()
  try {
    const { data, error } = await (supabase as any)
      .from('task_duration_forecasts')
      .select('task_id, forecast_finish_date, remaining_duration_days, forecast_delay_days, created_at')
      .in('task_id', taskIds)
      .eq('project_id', projectId)
      .eq('is_current', true)
    if (error) throw error
    return new Map((Array.isArray(data) ? data : [])
      .map((forecast: ForecastDependencyForecastRow) => [String(forecast.task_id ?? ''), forecast]))
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load dependency forecasts', { taskIds, error })
    return new Map()
  }
}

async function loadCurrentForecast(
  taskId: string,
  workspaceScope: TaskForecastWorkspaceScope,
): Promise<ForecastDependencyForecastRow | null> {
  try {
    const query = (supabase as any)
      .from('task_duration_forecasts')
      .select('id, project_id, task_id, recommended_duration_days, execution_reference_days, conservative_duration_days, remaining_duration_days, forecast_finish_date, forecast_delay_days, confidence_level, confidence_score, forecast_source, duration_calibration_source, duration_provenance, business_reason, factor_summary, calculation_context, delay_risk_index, model_version, generated_at, created_at, metadata')
      .eq('task_id', taskId)
      .eq('is_current', true)
    const { data, error } = await applyTaskForecastWorkspaceScope(query, workspaceScope)
      .maybeSingle()
    if (error) throw error
    return data ?? null
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load current task forecast', { taskId, error })
    return null
  }
}

async function loadCurrentForecasts(
  taskIds: string[],
  workspaceScope: TaskForecastWorkspaceScope,
): Promise<Map<string, ForecastDependencyForecastRow>> {
  const uniqueTaskIds = [...new Set(taskIds.map(normalizeId).filter((id): id is string => Boolean(id)))]
  if (uniqueTaskIds.length === 0) return new Map()
  const visibleProjectIds = taskForecastWorkspaceProjectIds(workspaceScope)
  if (visibleProjectIds.length === 0) throw new Error('TASK_DURATION_FORECAST_PROJECT_SCOPE_REQUIRED')

  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    try {
      const result = await rawQuery(
        `SELECT id::text AS id,
                project_id::text AS project_id,
                task_id::text AS task_id,
                recommended_duration_days,
                execution_reference_days,
                conservative_duration_days,
                remaining_duration_days,
                forecast_finish_date,
                forecast_delay_days,
                confidence_level,
                confidence_score,
                forecast_source,
                duration_calibration_source,
                duration_provenance,
                business_reason,
                factor_summary,
                calculation_context,
                delay_risk_index,
                model_version,
                generated_at,
                created_at,
                metadata
          FROM public.task_duration_forecasts
          WHERE project_id = ANY($1::uuid[])
            AND task_id = ANY($2::uuid[])
            AND is_current = true`,
        [visibleProjectIds, uniqueTaskIds],
      )
      return new Map((result.rows as ForecastDependencyForecastRow[])
        .map((forecast) => [normalizeId(forecast.task_id), forecast] as const)
        .filter((entry): entry is [string, ForecastDependencyForecastRow] => Boolean(entry[0])))
    } catch (error) {
      logger.warn('[taskDurationForecastService] direct current forecast lookup failed; falling back to Supabase', { taskIds: uniqueTaskIds, error })
    }
  }

  try {
    const query = (supabase as any)
      .from('task_duration_forecasts')
      .select('id, project_id, task_id, recommended_duration_days, execution_reference_days, conservative_duration_days, remaining_duration_days, forecast_finish_date, forecast_delay_days, confidence_level, confidence_score, forecast_source, duration_calibration_source, duration_provenance, business_reason, factor_summary, calculation_context, delay_risk_index, model_version, generated_at, created_at, metadata')
      .in('task_id', uniqueTaskIds)
      .eq('is_current', true)
    const { data, error } = await applyTaskForecastWorkspaceScope(query, workspaceScope)
    if (error) throw error
    return new Map((Array.isArray(data) ? data : [])
      .map((forecast: ForecastDependencyForecastRow) => [normalizeId(forecast.task_id), forecast] as const)
      .filter((entry): entry is [string, ForecastDependencyForecastRow] => Boolean(entry[0])))
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load current task forecasts', { taskIds: uniqueTaskIds, error })
    return new Map()
  }
}

function readNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isFreshCurrentForecast(forecast: ForecastDependencyForecastRow | null | undefined) {
  if (!forecast) return false
  const timestampValue = forecast.generated_at ?? forecast.created_at
  if (!timestampValue) return false
  const timestamp = new Date(String(timestampValue))
  if (Number.isNaN(timestamp.getTime())) return false
  return Date.now() - timestamp.getTime() <= CURRENT_FORECAST_CACHE_TTL_MS
}

function normalizeForecastRecord(value: unknown): Record<string, unknown> | null {
  return asRecord(value)
}

function normalizeProbabilityDurationWindow(value: unknown): DurationProbabilityWindow | null {
  const record = asRecord(value)
  if (!record || record.method !== 'pert_from_existing_percentiles') return null
  const source = normalizeId(record.source)
  const p20RemainingDays = readNullableNumber(record.p20RemainingDays ?? record.p20_remaining_days)
  const p50RemainingDays = readNullableNumber(record.p50RemainingDays ?? record.p50_remaining_days)
  const p80RemainingDays = readNullableNumber(record.p80RemainingDays ?? record.p80_remaining_days)
  const expectedRemainingDays = readNullableNumber(record.expectedRemainingDays ?? record.expected_remaining_days)
  const confidenceBandWidthDays = readNullableNumber(record.confidenceBandWidthDays ?? record.confidence_band_width_days)
  if (!source || p20RemainingDays === null || p50RemainingDays === null || p80RemainingDays === null || expectedRemainingDays === null || confidenceBandWidthDays === null) {
    return null
  }
  return {
    method: 'pert_from_existing_percentiles',
    source,
    p20RemainingDays,
    p50RemainingDays,
    p80RemainingDays,
    expectedRemainingDays,
    variance: readNullableNumber(record.variance),
    standardDeviationDays: readNullableNumber(record.standardDeviationDays ?? record.standard_deviation_days),
    confidenceBandWidthDays,
  }
}

function remainingForecastOutputContractSummary() {
  const contract = getDurationOutputContract('remaining_forecast')
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

function withRemainingForecastOutputContract(forecast: TaskDurationForecast): TaskDurationForecast {
  const contract = remainingForecastOutputContractSummary()
  if (!contract) return forecast
  return {
    ...forecast,
    durationOutputCode: contract.code as DurationOutputCode,
    durationOutputSemanticFieldName: contract.semanticFieldName,
    remainingForecastDays: forecast.remainingDurationDays,
    calculationContext: {
      ...(forecast.calculationContext ?? {}),
      durationOutputContract: contract,
    } as TaskDurationForecast['calculationContext'],
  }
}

function buildTaskRemainingForecastSeedLineage(task: ForecastTaskRow | null, suggestion: DurationSuggestionResult) {
  return {
    standardWorkCode: normalizeId(task?.standard_work_code),
    standardWorkCodeSource: normalizeId(task?.standard_work_code) ? 'task.standard_work_code' : null,
    benchmarkKey: normalizeId(suggestion.benchmarkKey),
    forecastSource: normalizeId(suggestion.forecastSource),
    durationCalibrationSource: normalizeId(suggestion.durationCalibrationSource),
    durationProvenance: normalizeId(suggestion.durationProvenance),
  }
}

function buildTaskRemainingForecastNetworkLineage(task: ForecastTaskRow | null, forecastDates: ForecastModelResult) {
  const dependencyPropagation = forecastDates.forecastSources?.dependencyPropagation
  const dependencyRecord = dependencyPropagation && typeof dependencyPropagation === 'object'
    ? dependencyPropagation as Record<string, unknown>
    : {}
  const templateNodeId = normalizeId(task?.template_node_id)
  const criticalProjection = resolveLiveTaskCriticalityProjection(task)
  const criticalPathMembership = criticalProjection.isCritical
  return {
    wbsTemplateVersion: templateNodeId ? `template-node:${templateNodeId}` : null,
    wbsNodeType: normalizeId(task?.wbs_node_type),
    engineeringCategoryId: normalizeId(task?.engineering_category_id),
    dependencyRuleVersion: normalizeId(dependencyRecord.ruleVersion ?? dependencyRecord.rule_version),
    criticalPathMembership,
    criticalPathInputHash: [
      normalizeId(task?.id) ?? 'unknown_task',
      criticalPathMembership ? 'critical' : 'non_critical',
      `float:${normalizeId(task?.total_float_days) ?? 'unknown'}`,
      `successors:${normalizeId(task?.successor_count) ?? 'unknown'}`,
    ].join('|'),
  }
}

function taskRemainingForecastRuntimeConsumptionState(forecastDates: ForecastModelResult) {
  const residualOverlay = asRecord(forecastDates.forecastSources?.residualOverlay)
  return residualOverlay?.runtimeApplied === true
    ? 'residual_overlay_published'
    : 'runtime_snapshot'
}

function taskRemainingForecastDedupeDateKey(value: string) {
  const normalized = normalizeDate(value)
  return normalized ?? value.slice(0, 10)
}

async function recordTaskRemainingForecastPredictionEvent(params: {
  taskId: string
  task: ForecastTaskRow | null
  suggestion: DurationSuggestionResult
  forecastDates: ForecastModelResult
  forecastCalculationContext: Record<string, unknown>
  modelProfile: ForecastModelProfile
  options: NormalizedForecastOptions
  generatedAt: string
}) {
  try {
    await recordDurationAccuracyPrediction({
      engineCode: 'task_remaining_forecast',
      outputKind: 'remaining_duration_forecast',
      projectId: params.task?.project_id ?? null,
      taskId: params.taskId,
      dedupeKey: [
        normalizeId(params.task?.project_id) ?? 'no_project',
        params.taskId,
        'remaining_duration_forecast',
        params.options.triggerContext,
        taskRemainingForecastDedupeDateKey(params.generatedAt),
      ].join(':'),
      predictionBasis: params.suggestion.forecastSource,
      predictionSource: 'taskDurationForecastService',
      modelVersion: params.modelProfile.modelVersion,
      predictedAt: params.generatedAt,
      predictedFinishDate: params.forecastDates.forecastFinishDate,
      predictedDurationDays: params.forecastDates.remainingDurationDays,
      runtimeConsumptionState: taskRemainingForecastRuntimeConsumptionState(params.forecastDates),
      seedLineage: buildTaskRemainingForecastSeedLineage(params.task, params.suggestion),
      networkLineage: buildTaskRemainingForecastNetworkLineage(params.task, params.forecastDates),
      predictionContext: {
        sourceService: 'taskDurationForecastService',
        triggerContext: params.options.triggerContext,
        writePolicy: params.options.writePolicy,
        precisionLevel: params.options.precisionLevel,
        forecastSource: params.suggestion.forecastSource,
        durationOutputCode: 'remaining_forecast',
        remainingDurationDays: params.forecastDates.remainingDurationDays,
        forecastDelayDays: params.forecastDates.forecastDelayDays,
        delayRiskIndex: params.forecastDates.delayRiskIndex,
        dataMaturity: params.forecastDates.dataMaturity,
        forecastSources: params.forecastDates.forecastSources,
        learnableParameterRegistry: params.forecastDates.forecastSources?.learnableParameterRegistry ?? null,
        calculationContext: params.forecastCalculationContext,
      },
    })
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to record v1.4.22.4 task remaining forecast prediction event', {
      taskId: params.taskId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function mapCurrentForecastToTaskDurationForecast(taskId: string, forecast: ForecastDependencyForecastRow): TaskDurationForecast {
  const metadata = normalizeForecastRecord(forecast.metadata) ?? {}
  const factorSummary = normalizeForecastRecord(forecast.factor_summary) as unknown as DurationContextSummary | null
  const calculationContext = normalizeForecastRecord(forecast.calculation_context) as DurationContextSummary['calculationContext'] | null
  const forecastSources = normalizeForecastRecord(metadata.forecastSources)
  const topFactors = readStringList(metadata.topFactors)
  const badges = Array.isArray(metadata.businessFactorBadges)
    ? metadata.businessFactorBadges.filter((badge): badge is BusinessFactorBadge => Boolean(badge && typeof badge === 'object'))
    : undefined
  const dataMaturity = ['L0', 'L1', 'L2'].includes(String(metadata.dataMaturity ?? ''))
    ? metadata.dataMaturity as TaskDurationForecast['dataMaturity']
    : undefined
  const executionReferenceDays = readNullableNumber(forecast.execution_reference_days)
    ?? readNullableNumber(forecast.recommended_duration_days)

  return withRemainingForecastOutputContract({
    taskId: normalizeId(forecast.task_id) ?? taskId,
    recommendedDurationDays: executionReferenceDays,
    executionReferenceDays,
    conservativeDurationDays: readNullableNumber(forecast.conservative_duration_days),
    optimisticRemainingDays: readNullableNumber(metadata.optimisticRemainingDays),
    remainingDurationDays: readNullableNumber(forecast.remaining_duration_days),
    conservativeRemainingDays: readNullableNumber(metadata.conservativeRemainingDays),
    forecastFinishDate: normalizeDate(forecast.forecast_finish_date),
    forecastDelayDays: readNullableNumber(forecast.forecast_delay_days) ?? 0,
    delayRiskIndex: readNullableNumber(forecast.delay_risk_index) ?? readNullableNumber(metadata.delayRiskIndex) ?? undefined,
    confidenceLevel: normalizeId(forecast.confidence_level) ?? 'medium',
    confidenceScore: readNullableNumber(forecast.confidence_score) ?? 50,
    forecastSource: normalizeId(forecast.forecast_source) ?? 'cached_current',
    durationCalibrationSource: normalizeId(forecast.duration_calibration_source),
    durationProvenance: normalizeId(forecast.duration_provenance),
    businessReason: normalizeId(forecast.business_reason),
    factorSummary,
    calculationContext,
    dataMaturity,
    topFactors,
    businessFactorBadges: badges,
    forecastSources,
    probabilityDuration: normalizeProbabilityDurationWindow(metadata.probabilityDuration),
  })
}

function buildProjectForecastThresholdOverlay(errors: number[]) {
  const sampleCount = errors.length
  const absoluteErrors = errors.map((value) => Math.abs(value))
  const meanAbsoluteErrorDays = absoluteErrors.reduce((sum, value) => sum + value, 0) / Math.max(sampleCount, 1)
  const biasErrorDays = errors.reduce((sum, value) => sum + value, 0) / Math.max(sampleCount, 1)
  const confidenceWeightMultiplier = meanAbsoluteErrorDays >= 10
    ? 0.82
    : meanAbsoluteErrorDays >= 6
      ? 0.9
      : meanAbsoluteErrorDays >= 3
        ? 0.96
        : 1
  const shouldLeanOnExecutionFacts = biasErrorDays >= 3 || meanAbsoluteErrorDays >= 6
  const candidateWeights = shouldLeanOnExecutionFacts
    ? {
      L0: { reference_ratio: 1 },
      L1: { reference_ratio: 0.2, spi_eac: 0.35, recent_velocity: 0.45 },
      L2: { reference_ratio: 0.1, spi_eac: 0.25, recent_velocity: 0.4, history_velocity: 0.25 },
    }
    : null

  return {
    sampleCount,
    meanAbsoluteErrorDays: Number(meanAbsoluteErrorDays.toFixed(2)),
    biasErrorDays: Number(biasErrorDays.toFixed(2)),
    thresholdOverlay: {
      confidenceWeightMultiplier,
      candidateWeights,
      calibrationBasis: 'forecast_error_backfill',
      policy: 'project_candidate_overlay_no_global_seed_mutation',
    },
  }
}

async function refreshProjectForecastOverlay(params: {
  projectId: string | null
  modelKey?: string | null
  modelVersion?: string | null
}) {
  const projectId = normalizeId(params.projectId)
  const modelKey = normalizeId(params.modelKey) ?? DEFAULT_FORECAST_MODEL_PROFILE.modelKey
  const modelVersion = normalizeId(params.modelVersion) ?? DEFAULT_FORECAST_MODEL_PROFILE.modelVersion
  if (!projectId) return

  try {
    const { data, error } = await (supabase as any)
      .from('task_duration_forecasts')
      .select('forecast_error_days, model_version, metadata')
      .eq('project_id', projectId)
    if (error) throw error

    const errors = (Array.isArray(data) ? data : [])
      .filter((row) => (normalizeId(row.model_version) ?? modelVersion) === modelVersion)
      .map((row) => readNullableNumber(row.forecast_error_days))
      .filter((value): value is number => typeof value === 'number')
      .slice(-50)
    if (errors.length === 0) return

    const overlay = buildProjectForecastThresholdOverlay(errors)
    const payload = {
      project_id: projectId,
      model_key: modelKey,
      model_version: modelVersion,
      overlay_status: overlay.sampleCount >= 5 ? 'active_candidate' : 'candidate',
      sample_count: overlay.sampleCount,
      mean_absolute_error_days: overlay.meanAbsoluteErrorDays,
      bias_error_days: overlay.biasErrorDays,
      threshold_overlay: overlay.thresholdOverlay,
      metadata: {
        generatedBy: 'taskDurationForecastService.refreshProjectForecastOverlay',
        samplePolicy: 'completed_tasks_with_forecast_error_days',
        maxSampleWindow: 50,
      },
      updated_at: new Date().toISOString(),
    }
    const overlayTable = (supabase as any).from('duration_forecast_project_overlays')
    if (typeof overlayTable.upsert === 'function') {
      await overlayTable.upsert(payload, {
        onConflict: 'project_id,model_key,model_version',
        ignoreDuplicates: false,
      })
    } else {
      await overlayTable.insert(payload)
    }
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to refresh project forecast overlay', { projectId, modelKey, modelVersion, error })
  }
}

async function backfillForecastErrorIfCompleted(task: ForecastTaskRow | null, currentForecast: ForecastDependencyForecastRow | null, calendar: WorkCalendarContext) {
  const taskId = normalizeId(task?.id)
  const forecastId = normalizeId(currentForecast?.id)
  const actualEnd = parseDate(task?.actual_end_date)
  const forecastFinish = parseDate(currentForecast?.forecast_finish_date)
  if (!taskId || !forecastId || !actualEnd || !forecastFinish) return

  const errorDays = forecastFinish <= actualEnd
    ? delayProductionDaysAfter(forecastFinish, actualEnd, calendar)
    : -delayProductionDaysAfter(actualEnd, forecastFinish, calendar)
  const absoluteErrorDays = Math.abs(errorDays)

  const metadata = currentForecast?.metadata && typeof currentForecast.metadata === 'object'
    ? { ...currentForecast.metadata }
    : {}

  await (supabase as any)
    .from('task_duration_forecasts')
    .update({
      forecast_error_days: errorDays,
      forecast_error_recorded_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        forecastErrorDays: errorDays,
        absoluteForecastErrorDays: absoluteErrorDays,
        forecastErrorRecordedAt: new Date().toISOString(),
        actualEndDate: actualEnd.toISOString().slice(0, 10),
        forecastFinishDateForError: forecastFinish.toISOString().slice(0, 10),
        modelCalibrationCandidate: absoluteErrorDays >= 3,
        modelCalibrationReason: absoluteErrorDays >= 3
          ? '预测完成日与实际完成日偏差达到校准阈值，进入后续模型误差复盘样本。'
          : null,
      },
    })
    .eq('id', forecastId)

  const modelVersion = normalizeId(currentForecast?.model_version)
    ?? normalizeId((metadata as Record<string, unknown>).modelVersion)
    ?? DEFAULT_FORECAST_MODEL_PROFILE.modelVersion
  await refreshProjectForecastOverlay({
    projectId: normalizeId(task?.project_id) ?? normalizeId(currentForecast?.project_id),
    modelKey: DEFAULT_FORECAST_MODEL_PROFILE.modelKey,
    modelVersion,
  })
}

async function loadDependencyContext(
  taskId: string,
  task: ForecastTaskRow | null,
  maxDepth = 1,
): Promise<ForecastDependencyContext> {
  const normalizedProjectId = normalizeId(task?.project_id)
  if (!normalizedProjectId) throw new Error('TASK_DURATION_FORECAST_PROJECT_SCOPE_REQUIRED')
  const dependencyDepth = Math.max(1, Math.min(5, Math.round(maxDepth || 1)))
  const dependencies: ForecastDependencyRow[] = []
  const visitedTaskIds = new Set<string>([taskId])
  const visitedEdges = new Set<string>()
  let selfDependencySkippedCount = 0
  let repeatedDependencySkippedCount = 0
  let frontier = [taskId]

  for (let depth = 0; depth < dependencyDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: string[] = []

    for (const currentTaskId of frontier) {
      const currentDependencies = await loadActiveDependencies(currentTaskId, normalizedProjectId)

      for (const dependency of currentDependencies) {
        const dependencyTaskId = normalizeId(dependency.dependency_task_id)
        if (!dependencyTaskId) continue
        if (dependencyTaskId === currentTaskId) {
          selfDependencySkippedCount += 1
          continue
        }
        if (dependencyTaskId === taskId) {
          repeatedDependencySkippedCount += 1
          continue
        }

        const edgeKey = `${currentTaskId}->${dependencyTaskId}`
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey)
          dependencies.push({
            ...dependency,
            lag_days: depth > 0 ? 0 : dependency.lag_days,
          })
        } else {
          repeatedDependencySkippedCount += 1
        }

        if (!visitedTaskIds.has(dependencyTaskId)) {
          visitedTaskIds.add(dependencyTaskId)
          nextFrontier.push(dependencyTaskId)
        } else if (depth > 0) {
          repeatedDependencySkippedCount += 1
        }
      }
    }

    frontier = nextFrontier
  }
  const depthLimitReached = frontier.length > 0

  const dependencyTaskIds = Array.from(new Set(dependencies
    .map((dependency) => normalizeId(dependency.dependency_task_id))
    .filter((id): id is string => Boolean(id && id !== taskId))))
  const [dependencyTasks, dependencyForecasts] = await Promise.all([
    loadDependencyTasks(dependencyTaskIds, normalizedProjectId),
    loadCurrentDependencyForecasts(dependencyTaskIds, normalizedProjectId),
  ])

  return {
    dependencies,
    dependencyTasks,
    dependencyForecasts,
    diagnostics: {
      maxDepth: dependencyDepth,
      depthLimitReached,
      selfDependencySkippedCount,
      repeatedDependencySkippedCount,
    },
  }
}

async function loadExternalReadinessContext(
  taskId: string,
  projectId: string,
): Promise<ForecastExternalReadinessContext> {
  const [conditions, materials, acceptancePlans, forecastOnlyBridges] = await Promise.all([
    (supabase as any)
      .from('task_conditions')
      .select('id, condition_type, name, status, is_satisfied, required_for_start, blocking_level, drawing_package_id, drawing_package_code, source_entity_type, source_entity_id, target_date, planned_date, expected_date, due_date, participant_unit_id')
      .eq('task_id', taskId)
      .then((result: any) => Array.isArray(result.data) ? result.data as ForecastConditionRow[] : [], (error: unknown) => {
        logger.warn('[taskDurationForecastService] failed to load task conditions', { taskId, error })
        return []
      }),
    (supabase as any)
      .from('project_materials')
      .select('id, actual_arrival_date, expected_arrival_date, lifecycle_status, record_status')
      .eq('linked_task_id', taskId)
      .eq('project_id', projectId)
      .then((result: any) => Array.isArray(result.data) ? result.data as ForecastMaterialRow[] : [], (error: unknown) => {
        logger.warn('[taskDurationForecastService] failed to load linked project materials', { taskId, error })
        return []
      }),
    loadForecastAcceptancePlans(taskId, projectId),
    loadForecastOnlyBridgeConditions(taskId, projectId),
  ])

  return {
    conditions: [...conditions, ...forecastOnlyBridges.conditions],
    materials,
    acceptancePlans,
    forecastOnlyBridgeCounts: forecastOnlyBridges.counts,
    forecastOnlyBridgeSources: forecastOnlyBridges.sources,
  }
}

async function loadForecastAcceptancePlans(taskId: string, projectId: string) {
  try {
    const acceptancePlanIds = await listAcceptancePlanIdsCoveringTask(projectId, taskId)
    if (acceptancePlanIds.length === 0) return [] as ForecastAcceptancePlanRow[]

    const { data, error } = await (supabase as any)
      .from('acceptance_plans')
      .select('id, status, planned_date, actual_date, gate_type, gate_hint, requirement_ready_percent, upstream_unfinished_count, blocked_requirement_count, is_blocked, is_overdue, impact_signals, participant_unit_id')
      .eq('project_id', projectId)
      .in('id', acceptancePlanIds)

    if (error) throw error
    return Array.isArray(data) ? data as ForecastAcceptancePlanRow[] : []
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load linked acceptance plans', { taskId, error })
    return []
  }
}

async function loadWorkCalendar(task: ForecastTaskRow | null): Promise<WorkCalendarContext> {
  return resolveConstructionCalendarContext({
    projectId: task?.project_id ?? null,
    standardWorkCode: task?.standard_work_code ?? null,
    templateNodeId: task?.template_node_id ?? null,
    onError: (error) => logger.warn('[taskDurationForecastService] failed to load work calendar seed', { taskId: task?.id, error }),
  }) as Promise<WorkCalendarContext>
}

function parseEarliestStartRulePolicy(
  record: ResolvedAlgorithmSeedRecord<AlgorithmSeedRecordPayload> | null | undefined,
): EarliestStartRulePolicy {
  if (!record) return DEFAULT_EARLIEST_START_RULE_POLICY

  const knownDateSources = asRecord(record.knownDateSources ?? record.known_date_sources) ?? {}
  const missedStartPolicy = asRecord(record.missedStartPolicy ?? record.missed_start_policy) ?? {}
  const unknownBlockerPenalty = asRecord(record.unknownBlockerPenalty ?? record.unknown_blocker_penalty) ?? {}
  const riskPolicy = asRecord(record.unstartedOverdueRiskPolicy ?? record.unstarted_overdue_risk_policy) ?? {}
  const stalenessPolicy = asRecord(record.referenceStalenessPolicy ?? record.reference_staleness_policy) ?? {}
  const forecastPolicy = asRecord(record.forecastPolicy ?? record.forecast_policy) ?? {}

  return {
    stableCode: normalizeId(record.__stableCode) ?? DEFAULT_EARLIEST_START_RULE_POLICY.stableCode,
    source: record.__resolverSource ?? 'fallback',
    riskIndexDelta: clamp(readNumber(missedStartPolicy.riskIndexDelta ?? missedStartPolicy.risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.riskIndexDelta), 0, 0.85),
    confidencePenaltyBase: Math.max(0, readNumber(missedStartPolicy.confidencePenaltyBase ?? missedStartPolicy.confidence_penalty_base, DEFAULT_EARLIEST_START_RULE_POLICY.confidencePenaltyBase)),
    confidencePenaltyPerFiveWorkdays: Math.max(0, readNumber(missedStartPolicy.confidencePenaltyPerFiveWorkdays ?? missedStartPolicy.confidence_penalty_per_five_workdays, DEFAULT_EARLIEST_START_RULE_POLICY.confidencePenaltyPerFiveWorkdays)),
    springFestivalPostWindowConfidencePenaltyRatio: clamp(readNumber(
      missedStartPolicy.springFestivalPostWindowConfidencePenaltyRatio
        ?? missedStartPolicy.spring_festival_post_window_confidence_penalty_ratio,
      DEFAULT_EARLIEST_START_RULE_POLICY.springFestivalPostWindowConfidencePenaltyRatio,
    ), 0, 1),
    unknownBlockerConfidencePenaltyPerItem: Math.max(0, readNumber(unknownBlockerPenalty.confidencePenaltyPerItem ?? unknownBlockerPenalty.confidence_penalty_per_item, DEFAULT_EARLIEST_START_RULE_POLICY.unknownBlockerConfidencePenaltyPerItem)),
    unknownBlockerRiskIndexDeltaPerItem: clamp(readNumber(unknownBlockerPenalty.riskIndexDeltaPerItem ?? unknownBlockerPenalty.risk_index_delta_per_item, DEFAULT_EARLIEST_START_RULE_POLICY.unknownBlockerRiskIndexDeltaPerItem), 0, 0.25),
    unknownBlockerConfidencePenaltyMax: Math.max(0, readNumber(unknownBlockerPenalty.confidencePenaltyMax ?? unknownBlockerPenalty.confidence_penalty_max, DEFAULT_EARLIEST_START_RULE_POLICY.unknownBlockerConfidencePenaltyMax)),
    missedWindowRiskBase: clamp(readNumber(riskPolicy.missedWindowRiskBase ?? riskPolicy.missed_window_risk_base, DEFAULT_EARLIEST_START_RULE_POLICY.missedWindowRiskBase), 0, 1),
    missedWindowRiskWindowWorkdays: Math.max(1, readNumber(riskPolicy.missedWindowRiskWindowWorkdays ?? riskPolicy.missed_window_risk_window_workdays, DEFAULT_EARLIEST_START_RULE_POLICY.missedWindowRiskWindowWorkdays)),
    missedWindowOverflowRiskPerWindow: clamp(readNumber(riskPolicy.missedWindowOverflowRiskPerWindow ?? riskPolicy.missed_window_overflow_risk_per_window, DEFAULT_EARLIEST_START_RULE_POLICY.missedWindowOverflowRiskPerWindow), 0, 0.25),
    criticalUnknownRiskIndexDelta: clamp(readNumber(riskPolicy.criticalUnknownRiskIndexDelta ?? riskPolicy.critical_unknown_risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.criticalUnknownRiskIndexDelta), 0, 0.5),
    dependencyUnknownRiskIndexDelta: clamp(readNumber(riskPolicy.dependencyUnknownRiskIndexDelta ?? riskPolicy.dependency_unknown_risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.dependencyUnknownRiskIndexDelta), 0, 0.5),
    materialUnknownRiskIndexDelta: clamp(readNumber(riskPolicy.materialUnknownRiskIndexDelta ?? riskPolicy.material_unknown_risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.materialUnknownRiskIndexDelta), 0, 0.5),
    unknownDateRiskIndexDeltaPerItem: clamp(readNumber(riskPolicy.unknownDateRiskIndexDeltaPerItem ?? riskPolicy.unknown_date_risk_index_delta_per_item, DEFAULT_EARLIEST_START_RULE_POLICY.unknownDateRiskIndexDeltaPerItem), 0, 0.25),
    referenceStalenessWarningRatio: Math.max(0, readNumber(stalenessPolicy.warningRatio ?? stalenessPolicy.warning_ratio, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessWarningRatio)),
    referenceStalenessCriticalRatio: Math.max(0, readNumber(stalenessPolicy.criticalRatio ?? stalenessPolicy.critical_ratio, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessCriticalRatio)),
    referenceStalenessWarningConfidenceDelta: Math.min(0, readNumber(stalenessPolicy.warningConfidenceDelta ?? stalenessPolicy.warning_confidence_delta, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessWarningConfidenceDelta)),
    referenceStalenessCriticalConfidenceDelta: Math.min(0, readNumber(stalenessPolicy.criticalConfidenceDelta ?? stalenessPolicy.critical_confidence_delta, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessCriticalConfidenceDelta)),
    referenceStalenessWarningRiskIndexDelta: clamp(readNumber(stalenessPolicy.warningRiskIndexDelta ?? stalenessPolicy.warning_risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessWarningRiskIndexDelta), 0, 0.5),
    referenceStalenessCriticalRiskIndexDelta: clamp(readNumber(stalenessPolicy.criticalRiskIndexDelta ?? stalenessPolicy.critical_risk_index_delta, DEFAULT_EARLIEST_START_RULE_POLICY.referenceStalenessCriticalRiskIndexDelta), 0, 0.5),
    useDependencyForecastFinish: normalizeBoolean(knownDateSources.dependencyForecastFinish ?? knownDateSources.dependency_forecast_finish ?? true),
    useMaterialExpectedArrival: normalizeBoolean(knownDateSources.materialExpectedArrival ?? knownDateSources.material_expected_arrival ?? true),
    useCriticalObstacleEstimatedResolve: normalizeBoolean(knownDateSources.criticalObstacleEstimatedResolve ?? knownDateSources.critical_obstacle_estimated_resolve ?? true),
    useHardConditionTargetDate: normalizeBoolean(knownDateSources.hardConditionTargetDate ?? knownDateSources.hard_condition_target_date ?? true),
    useDrawingConditionTargetDate: normalizeBoolean(knownDateSources.drawingConditionTargetDate ?? knownDateSources.drawing_condition_target_date ?? true),
    useCertificateConditionTargetDate: normalizeBoolean(knownDateSources.certificateConditionTargetDate ?? knownDateSources.certificate_condition_target_date ?? true),
    useAcceptanceConditionTargetDate: normalizeBoolean(knownDateSources.acceptanceConditionTargetDate ?? knownDateSources.acceptance_condition_target_date ?? true),
    doNotAddUnknownDateDays: normalizeBoolean(forecastPolicy.doNotAddUnknownDateDays ?? forecastPolicy.do_not_add_unknown_date_days ?? true),
  }
}

async function loadEarliestStartRule(task: ForecastTaskRow | null): Promise<EarliestStartRulePolicy> {
  try {
    const records = await resolveAlgorithmSeedRecords<AlgorithmSeedRecordPayload>('earliest_start_rule', {
      projectId: task?.project_id ?? null,
      standardWorkCode: task?.standard_work_code ?? null,
      templateNodeId: task?.template_node_id ?? null,
    })
    const record = records.find((item) => String(item.scenario ?? '').trim() === 'unstarted_overdue')
      ?? records.find((item) => item.__stableCode === 'unstarted_overdue_default')
      ?? records[0]
      ?? null
    return parseEarliestStartRulePolicy(record)
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load earliest start rule seed', { taskId: task?.id, error })
    return DEFAULT_EARLIEST_START_RULE_POLICY
  }
}

function readWeightMap(value: unknown): ForecastModelProfile['candidateWeights'] {
  if (!value || typeof value !== 'object') return DEFAULT_CANDIDATE_WEIGHTS
  const raw = value as Record<string, Record<string, unknown>>
  const next: ForecastModelProfile['candidateWeights'] = { L0: {}, L1: {}, L2: {} }

  for (const maturity of ['L0', 'L1', 'L2'] as ForecastMaturity[]) {
    const source = raw[maturity] ?? raw[maturity.toLowerCase()]
    for (const key of ['reference_ratio', 'spi_eac', 'recent_velocity', 'history_velocity'] as ForecastCandidateKey[]) {
      const parsed = Number(source?.[key])
      if (Number.isFinite(parsed) && parsed >= 0) next[maturity][key] = parsed
    }
    if (Object.keys(next[maturity]).length === 0) next[maturity] = DEFAULT_CANDIDATE_WEIGHTS[maturity]
  }

  return next
}

function parseForecastModelProfile(row: ForecastModelProfileRow | null | undefined): ForecastModelProfile {
  if (!row) return DEFAULT_FORECAST_MODEL_PROFILE
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const weights = (metadata as any).candidateWeights ?? (metadata as any).candidate_weights ?? (metadata as any).weights
  const confidenceWeight = Number(row.confidence_weight ?? (metadata as any).confidenceWeight ?? (metadata as any).confidence_weight ?? 1)

  return {
    id: normalizeId(row.id),
    modelKey: normalizeId(row.model_key) ?? DEFAULT_FORECAST_MODEL_PROFILE.modelKey,
    modelVersion: normalizeId((metadata as any).modelVersion ?? (metadata as any).model_version) ?? DEFAULT_FORECAST_MODEL_PROFILE.modelVersion,
    source: 'table',
    candidateWeights: readWeightMap(weights),
    confidenceWeight: Number.isFinite(confidenceWeight) && confidenceWeight > 0 ? confidenceWeight : 1,
    metadata,
  }
}

function applyProjectForecastOverlay(profile: ForecastModelProfile, row: ForecastProjectOverlayRow | null | undefined): ForecastModelProfile {
  if (!row) return profile
  const overlay = row.threshold_overlay && typeof row.threshold_overlay === 'object' ? row.threshold_overlay : {}
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const confidenceWeightMultiplier = Number((overlay as any).confidenceWeightMultiplier ?? (overlay as any).confidence_weight_multiplier ?? 1)
  const candidateWeights = (overlay as any).candidateWeights ?? (overlay as any).candidate_weights
  const sampleCount = Math.max(0, Math.floor(Number(row.sample_count ?? 0)))
  if (!Number.isFinite(sampleCount) || sampleCount < PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT) {
    return {
      ...profile,
      metadata: {
        ...profile.metadata,
        projectOverlay: {
          id: row.id ?? null,
          status: row.overlay_status ?? null,
          runtimeApplied: false,
          ignoredReason: 'project_forecast_overlay_sample_gate_not_met',
          sampleCount: Number.isFinite(sampleCount) ? sampleCount : 0,
          minSampleCount: PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT,
          meanAbsoluteErrorDays: readNullableNumber(row.mean_absolute_error_days),
          biasErrorDays: readNullableNumber(row.bias_error_days),
          thresholdOverlay: overlay,
          metadata,
        },
      },
    }
  }
  const confidenceWeight = Number.isFinite(confidenceWeightMultiplier) && confidenceWeightMultiplier > 0
    ? clamp(profile.confidenceWeight * confidenceWeightMultiplier, 0.5, 1.2)
    : profile.confidenceWeight

  return {
    ...profile,
    source: 'table_project_overlay',
    candidateWeights: candidateWeights ? readWeightMap(candidateWeights) : profile.candidateWeights,
    confidenceWeight,
    metadata: {
      ...profile.metadata,
      projectOverlay: {
        id: row.id ?? null,
        status: row.overlay_status ?? null,
        runtimeApplied: true,
        sampleCount,
        minSampleCount: PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT,
        meanAbsoluteErrorDays: readNullableNumber(row.mean_absolute_error_days),
        biasErrorDays: readNullableNumber(row.bias_error_days),
        thresholdOverlay: overlay,
        metadata,
      },
    },
  }
}

function runtimeValueForTaskRemainingForecastParameter(
  parameter: AlgorithmAssetLearnableParameter,
  profile: ForecastModelProfile,
) {
  if (parameter.parameterKey === 'forecast.L0.candidate_weight') return profile.candidateWeights.L0
  if (parameter.parameterKey === 'forecast.L1.candidate_weight') return profile.candidateWeights.L1
  if (parameter.parameterKey === 'forecast.L2.candidate_weight') return profile.candidateWeights.L2
  if (parameter.parameterKey === 'forecast.progress_curve_multiplier') {
    return asRecord(profile.metadata.progressCurvePolicies)
      ?? asRecord(profile.metadata.progress_curve_policies)
      ?? asRecord(profile.metadata.progressCurveMultipliers)
      ?? asRecord(profile.metadata.progress_curve_multipliers)
      ?? DEFAULT_PROGRESS_CURVE_POLICIES
  }
  if (parameter.parameterKey === 'forecast.confidence_penalty') {
    return {
      confidenceWeight: profile.confidenceWeight,
    }
  }
  if (parameter.parameterKey === 'forecast.confidence_weight_multiplier') return profile.confidenceWeight
  return parameter.currentValue
}

function buildTaskRemainingForecastLearnableParameterRegistry(profile: ForecastModelProfile) {
  const parameters = listAlgorithmAssetLearnableParameters()
    .filter((parameter) => parameter.ownerAlgorithm === 'taskDurationForecastService')
    .map((parameter) => {
      const decision = evaluateAlgorithmAssetParameterRuntimeUse({
        parameterKey: parameter.parameterKey,
        scopeType: parameter.scopePolicy,
        evidence: {
          sampleCount: 0,
          replayPassed: false,
          conflictFree: false,
          rollbackTarget: null,
        },
      })
      return {
        parameterKey: parameter.parameterKey,
        learningTarget: parameter.learningTarget,
        learningMaturity: parameter.learningMaturity,
        publishAnchor: parameter.publishAnchor,
        automationMaturity: parameter.automationMaturity,
        scopePolicy: parameter.scopePolicy,
        riskLevel: parameter.riskLevel,
        maxDeltaPerRelease: parameter.maxDeltaPerRelease,
        rollbackTarget: parameter.rollbackTarget,
        runtimeConsumable: decision.runtimeConsumable,
        runtimeStatus: decision.status,
        runtimeDecisionReasons: decision.reasons,
        runtimeValue: runtimeValueForTaskRemainingForecastParameter(parameter, profile),
      }
    })

  return {
    ownerAlgorithm: 'taskDurationForecastService',
    registrySource: 'algorithmAssetLearnableParameterRegistryService',
    parameterKeys: parameters.map((parameter) => parameter.parameterKey),
    parameters,
  }
}

async function loadTaskRemainingForecastRuntimeParameterResult(params: {
  parameterKey: string
  projectId: string | null
  companyId: string | null
}) {
  const baseInput = {
    parameterKey: params.parameterKey,
    companyId: params.companyId,
    projectId: params.projectId,
    allowSystemScope: true,
  }
  const stableResult = await loadAlgorithmAssetLearnableParameterRuntimeValue(baseInput)
  if (stableResult.runtimeConsumable || !stableResult.reasons.includes('runtime_parameter_publication_not_found')) {
    return stableResult
  }

  const canaryResult = await loadAlgorithmAssetLearnableParameterRuntimeValue({
    ...baseInput,
    consumptionMode: 'canary',
    canaryRuntimeBoundary: {
      consumerKey: 'taskDurationForecastService.remaining_duration_forecast',
      scopeBoundary: params.projectId ? 'project' : params.companyId ? 'company' : 'system',
      stopConditionKeys: [
        'task_remaining_forecast_mae_regression',
        'task_remaining_forecast_bias_regression',
        'task_remaining_forecast_overcompensation_rate',
      ],
      monitoringWindowHours: 72,
    },
  })

  return canaryResult.runtimeConsumable ? canaryResult : stableResult
}

async function loadTaskRemainingForecastParameterRuntimeGate(task?: ForecastTaskRow | null): Promise<TaskRemainingForecastParameterRuntimeGate> {
  const forecastParameters = listAlgorithmAssetLearnableParameters()
    .filter((parameter) => parameter.ownerAlgorithm === 'taskDurationForecastService')
  const results: AlgorithmAssetLearnableParameterRuntimeConsumptionResult[] = []
  const projectId = normalizeId(task?.project_id)
  const companyId = await loadProjectCompanyId(projectId)

  for (const parameter of forecastParameters) {
    try {
      results.push(await loadTaskRemainingForecastRuntimeParameterResult({
        parameterKey: parameter.parameterKey,
        projectId,
        companyId,
      }))
    } catch (error) {
      logger.warn('[taskDurationForecastService] failed to load learnable forecast parameter runtime gate', {
        parameterKey: parameter.parameterKey,
        error,
      })
      results.push({
        status: 'runtime_parameter_blocked',
        runtimeConsumable: false,
        parameterKey: parameter.parameterKey,
        runtimeValue: null,
        consumptionMode: 'stable',
        publicationKey: null,
        publicationStatus: null,
        scopeLevel: null,
        companyId: null,
        projectId: null,
        rollbackTarget: null,
        reasons: ['runtime_parameter_gate_unavailable'],
        writesSeedRuntimeDirectly: false,
      })
    }
  }

  const parameters = results.map((result) => ({
    parameterKey: result.parameterKey,
    runtimeConsumable: result.runtimeConsumable,
    status: result.status,
    publicationKey: result.publicationKey,
    publicationStatus: result.publicationStatus,
    scopeLevel: result.scopeLevel,
    reasons: result.reasons,
    runtimeValue: typeof result.runtimeValue === 'number' && Number.isFinite(result.runtimeValue)
      ? result.runtimeValue
      : null,
    appliedToForecast: false as const,
  }))

  return {
    ownerAlgorithm: 'taskDurationForecastService',
    gateSource: 'algorithmAssetLearnableParameterRuntimeConsumptionService',
    appliedRuntimeParameterCount: 0,
    blockedRuntimeParameterCount: parameters.filter((parameter) => !parameter.runtimeConsumable).length,
    parameters,
  }
}

function applyTaskRemainingForecastRuntimeParameters(
  profile: ForecastModelProfile,
  gate: TaskRemainingForecastParameterRuntimeGate,
): { modelProfile: ForecastModelProfile; runtimeGate: TaskRemainingForecastParameterRuntimeGate } {
  let nextProfile = profile
  let appliedCount = 0
  const parameters = gate.parameters.map((parameter) => {
    if (
      parameter.parameterKey === 'forecast.confidence_weight_multiplier'
      && parameter.runtimeConsumable
      && typeof parameter.runtimeValue === 'number'
      && Number.isFinite(parameter.runtimeValue)
      && parameter.runtimeValue > 0
    ) {
      const beforeConfidenceWeight = nextProfile.confidenceWeight
      const afterConfidenceWeight = clamp(beforeConfidenceWeight * parameter.runtimeValue, 0.5, 1.2)
      nextProfile = {
        ...nextProfile,
        confidenceWeight: afterConfidenceWeight,
        metadata: {
          ...nextProfile.metadata,
          runtimeLearnableParameters: {
            ...(asRecord(nextProfile.metadata.runtimeLearnableParameters) ?? {}),
            [parameter.parameterKey]: {
              publicationKey: parameter.publicationKey,
              publicationStatus: parameter.publicationStatus,
              scopeLevel: parameter.scopeLevel,
              runtimeValue: parameter.runtimeValue,
              beforeConfidenceWeight,
              afterConfidenceWeight,
            },
          },
        },
      }
      appliedCount += 1
      return { ...parameter, appliedToForecast: true }
    }

    return parameter
  })

  return {
    modelProfile: nextProfile,
    runtimeGate: {
      ...gate,
      appliedRuntimeParameterCount: appliedCount,
      blockedRuntimeParameterCount: parameters.filter((parameter) => !parameter.runtimeConsumable).length,
      parameters,
    },
  }
}

async function loadProjectForecastOverlay(task: ForecastTaskRow | null, profile: ForecastModelProfile): Promise<ForecastProjectOverlayRow | null> {
  const projectId = normalizeId(task?.project_id)
  if (!projectId) return null
  try {
    const { data, error } = await (supabase as any)
      .from('duration_forecast_project_overlays')
      .select('id, project_id, model_key, model_version, overlay_status, sample_count, mean_absolute_error_days, bias_error_days, threshold_overlay, metadata')
      .eq('project_id', projectId)
      .eq('model_key', profile.modelKey)
      .eq('model_version', profile.modelVersion)
      .maybeSingle()
    if (error) throw error
    return (data as ForecastProjectOverlayRow | null) ?? null
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load project forecast overlay', { projectId, taskId: task?.id, error })
    return null
  }
}

async function loadForecastModelProfile(task: ForecastTaskRow | null): Promise<ForecastModelProfile> {
  const wbsType = normalizeId(task?.wbs_node_type) ?? 'process'
  const modelKeys = [`remaining_duration_forecast_${wbsType}`, 'remaining_duration_forecast']
  try {
    const { data, error } = await (supabase as any)
      .from('duration_forecast_model_profiles')
      .select('id, model_key, confidence_weight, metadata')
      .in('model_key', modelKeys)
      .eq('model_status', 'active')
    if (error) throw error
    const rows = Array.isArray(data) ? data as ForecastModelProfileRow[] : []
    const specific = rows.find((row) => normalizeId(row.model_key) === modelKeys[0])
    const fallback = rows.find((row) => normalizeId(row.model_key) === 'remaining_duration_forecast')
    const profile = parseForecastModelProfile(specific ?? fallback ?? null)
    const overlay = await loadProjectForecastOverlay(task, profile)
    return applyProjectForecastOverlay(profile, overlay)
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load forecast model profile', { taskId: task?.id, error })
    return DEFAULT_FORECAST_MODEL_PROFILE
  }
}

async function loadProjectCompanyId(projectId: string | null): Promise<string | null> {
  if (!projectId) return null
  try {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select('company_id')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw error
    return normalizeId((data as { company_id?: unknown } | null)?.company_id)
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load project company for residual overlay', { projectId, error })
    return null
  }
}

async function loadTaskStructuredCauseAuthority(taskId: string, projectId: string): Promise<TaskStructuredCauseAuthority> {
  const companyId = await loadProjectCompanyId(projectId)
  if (!companyId) {
    return {
      state: 'unavailable',
      causeCode: null,
      taxonomyVersion: 'v1.0.0',
      reasonCodes: ['structured_cause_company_unavailable'],
    }
  }
  return (await readTaskStructuredCauseAuthority({ companyId, projectId, taskId })).authority
}

async function queryForecastResidualOverlays(filters: {
  scopeLevel: 'project' | 'company'
  projectId?: string | null
  companyId?: string | null
}): Promise<ForecastResidualOverlayRow[]> {
  try {
    let query = (supabase as any)
      .from('duration_forecast_residual_overlays')
      .select('id, overlay_key, publication_key, asset_key, scope_level, company_id, project_id, learning_target, learning_maturity, publish_anchor, automation_maturity, original_mae, overlay_mae, mae_improvement_ratio, overcompensation_ratio, residual_payload, writes_base_duration_seed, target_table, rollback_target, runtime_publication_status, rollback_execution, rolled_back_at, updated_at')
      .eq('learning_target', 'forecast_residual')
      .eq('target_table', 'duration_forecast_residual_overlays')
      .eq('writes_base_duration_seed', false)
      .in('asset_key', ['task_remaining_forecast', 'remaining_duration_forecast'])
      .eq('scope_level', filters.scopeLevel)
      .order('updated_at', { ascending: false })

    if (filters.scopeLevel === 'project') {
      if (!filters.projectId) return []
      query = query.eq('project_id', filters.projectId)
    } else {
      if (!filters.companyId) return []
      query = query.eq('company_id', filters.companyId)
    }

    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data as ForecastResidualOverlayRow[] : []
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to load forecast residual overlays', { filters, error })
    return []
  }
}

async function loadForecastResidualOverlays(task: ForecastTaskRow | null): Promise<ForecastResidualOverlayRow[]> {
  const projectId = normalizeId(task?.project_id)
  if (!projectId) return []

  const projectRows = await queryForecastResidualOverlays({ scopeLevel: 'project', projectId })
  const companyId = await loadProjectCompanyId(projectId)
  const companyRows = await queryForecastResidualOverlays({ scopeLevel: 'company', companyId })

  return [...projectRows, ...companyRows]
}

function residualOverlayCorrectionDays(row: ForecastResidualOverlayRow): number | null {
  const payload = asRecord(row.residual_payload) ?? {}
  const rawCorrection = readNullableNumber(
    payload.residualCorrectionDays
      ?? payload.residual_correction_days
      ?? payload.correctionDays
      ?? payload.correction_days,
  )
  if (rawCorrection == null || rawCorrection === 0) return null
  return round(clamp(rawCorrection, -MAX_RUNTIME_RESIDUAL_CORRECTION_DAYS, MAX_RUNTIME_RESIDUAL_CORRECTION_DAYS))
}

function residualOverlaySampleCount(row: ForecastResidualOverlayRow) {
  const payload = asRecord(row.residual_payload) ?? {}
  const evidence = asRecord(payload.evidence)
  return Math.max(
    0,
    Math.floor(
      readNullableNumber(
        payload.sampleCount
          ?? payload.sample_count
          ?? evidence?.sampleCount
          ?? evidence?.sample_count
          ?? 0,
      ) ?? 0,
    ),
  )
}

function residualOverlayMeetsSampleGate(row: ForecastResidualOverlayRow) {
  const sampleCount = residualOverlaySampleCount(row)
  if (normalizeId(row.scope_level) === 'company') return sampleCount >= RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT
  return sampleCount >= RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT
}

function isRuntimeConsumableResidualOverlay(row: ForecastResidualOverlayRow) {
  const learningMaturity = normalizeId(row.learning_maturity)
  const publishAnchor = normalizeId(row.publish_anchor)
  const automationMaturity = normalizeId(row.automation_maturity)
  const runtimePublicationStatus = normalizeId(row.runtime_publication_status)
  const improvementRatio = readNullableNumber(row.mae_improvement_ratio) ?? 0
  const overcompensationRatio = readNullableNumber(row.overcompensation_ratio) ?? 1

  return (
    row.writes_base_duration_seed === false
    && normalizeId(row.target_table) === 'duration_forecast_residual_overlays'
    && normalizeId(row.learning_target) === 'forecast_residual'
    && runtimePublicationStatus !== 'runtime_rolled_back'
    && residualOverlayCorrectionDays(row) != null
    && improvementRatio > 0
    && overcompensationRatio <= MAX_RUNTIME_RESIDUAL_OVERCOMPENSATION_RATIO
    && (learningMaturity === 'guarded_live_tuning' || learningMaturity === 'system_curated_learning')
    && (
      publishAnchor === 'guarded_runtime_auto_publish'
      || publishAnchor === 'trusted_source_auto_publish'
      || publishAnchor === 'system_curated_publish'
    )
    && (automationMaturity === 'auto_canary' || automationMaturity === 'auto_publish')
  )
}

function chooseRuntimeResidualOverlay(rows: ForecastResidualOverlayRow[]) {
  const ignoredOverlayKeys = rows
    .filter((row) => !isRuntimeConsumableResidualOverlay(row) || !residualOverlayMeetsSampleGate(row))
    .map((row) => normalizeId(row.overlay_key))
    .filter((key): key is string => Boolean(key))
  const eligible = rows
    .filter((row) => isRuntimeConsumableResidualOverlay(row) && residualOverlayMeetsSampleGate(row))
    .sort((left, right) => {
      const leftScopeRank = normalizeId(left.scope_level) === 'company' ? 2 : 1
      const rightScopeRank = normalizeId(right.scope_level) === 'company' ? 2 : 1
      if (leftScopeRank !== rightScopeRank) return rightScopeRank - leftScopeRank
      const leftImprovement = readNullableNumber(left.mae_improvement_ratio) ?? 0
      const rightImprovement = readNullableNumber(right.mae_improvement_ratio) ?? 0
      if (leftImprovement !== rightImprovement) return rightImprovement - leftImprovement
      const leftOvercompensation = readNullableNumber(left.overcompensation_ratio) ?? 1
      const rightOvercompensation = readNullableNumber(right.overcompensation_ratio) ?? 1
      return leftOvercompensation - rightOvercompensation
    })

  return {
    overlay: eligible[0] ?? null,
    ignoredOverlayKeys,
  }
}

function applyForecastResidualOverlay(params: {
  forecastDates: ForecastModelResult
  task: ForecastTaskRow | null
  overlays: ForecastResidualOverlayRow[]
  workCalendar: WorkCalendarContext
}): ForecastModelResult {
  const beforeRemainingDurationDays = params.forecastDates.remainingDurationDays
  if (beforeRemainingDurationDays == null || beforeRemainingDurationDays <= 0 || params.overlays.length === 0) {
    return params.forecastDates
  }

  const { overlay, ignoredOverlayKeys } = chooseRuntimeResidualOverlay(params.overlays)
  if (!overlay) {
    return {
      ...params.forecastDates,
      forecastSources: {
        ...params.forecastDates.forecastSources,
        residualOverlay: {
          runtimeApplied: false,
          ignoredOverlayKeys,
        },
      },
      calculationContext: {
        ...params.forecastDates.calculationContext,
        residual_overlay: {
          runtimeApplied: false,
          ignoredOverlayKeys,
        },
      },
    }
  }

  const residualCorrectionDays = residualOverlayCorrectionDays(overlay)
  if (residualCorrectionDays == null) return params.forecastDates

  const afterRemainingDurationDays = Math.max(0, candidateDays(beforeRemainingDurationDays + residualCorrectionDays) ?? beforeRemainingDurationDays)
  const today = startOfUtcDay(new Date())
  const progress = clampProgress(params.task?.progress)
  const plannedStart = parseDate(params.task?.planned_start_date ?? params.task?.start_date)
  const actualStart = parseDate(params.task?.actual_start_date)
  const startAnchor = progress > 0
    ? today
    : plannedStart && plannedStart > today
      ? plannedStart
      : actualStart ?? today
  const plannedEnd = parseDate(params.task?.planned_end_date ?? params.task?.end_date)
  const forecastFinish = afterRemainingDurationDays > 0
    ? parseDate(addConstructionProductionDays(startAnchor, afterRemainingDurationDays, params.workCalendar))
    : startAnchor
  const forecastFinishDate = forecastFinish?.toISOString().slice(0, 10) ?? params.forecastDates.forecastFinishDate
  const forecastDelayDays = delayProductionDaysAfter(plannedEnd, forecastFinish, params.workCalendar)
  const overlayKey = normalizeId(overlay.overlay_key)
  const publicationKey = normalizeText(overlay.publication_key)
    || (normalizeText(overlayKey).startsWith('forecast_residual_overlay_runtime:')
      ? normalizeText(overlayKey)
      : '')
  const residualOverlay = {
    runtimeApplied: true,
    overlayKey,
    publicationKey: publicationKey || null,
    assetKey: normalizeId(overlay.asset_key),
    scopeLevel: normalizeId(overlay.scope_level),
    sampleCount: residualOverlaySampleCount(overlay),
    minSampleCount: normalizeId(overlay.scope_level) === 'company'
      ? RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT
      : RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT,
    ignoredOverlayKeys,
    beforeRemainingDurationDays,
    afterRemainingDurationDays,
    residualCorrectionDays,
    originalMae: readNullableNumber(overlay.original_mae),
    overlayMae: readNullableNumber(overlay.overlay_mae),
    maeImprovementRatio: readNullableNumber(overlay.mae_improvement_ratio),
    overcompensationRatio: readNullableNumber(overlay.overcompensation_ratio),
    learningMaturity: normalizeId(overlay.learning_maturity),
    publishAnchor: normalizeId(overlay.publish_anchor),
    automationMaturity: normalizeId(overlay.automation_maturity),
    runtimePublicationStatus: normalizeId(overlay.runtime_publication_status),
    rolledBackAt: overlay.rolled_back_at ?? null,
    rollbackTarget: overlay.rollback_target ?? {},
    targetTable: normalizeId(overlay.target_table),
    writesBaseDurationSeed: overlay.writes_base_duration_seed,
  }

  return {
    ...params.forecastDates,
    remainingDurationDays: afterRemainingDurationDays,
    forecastFinishDate,
    forecastDelayDays,
    forecastSources: {
      ...params.forecastDates.forecastSources,
      residualOverlay,
      forecastPaths: {
        ...(asRecord(params.forecastDates.forecastSources.forecastPaths) ?? {}),
        recommended: {
          ...(asRecord(asRecord(params.forecastDates.forecastSources.forecastPaths)?.recommended) ?? {}),
          remainingDays: afterRemainingDurationDays,
        },
      },
    },
    calculationContext: {
      ...params.forecastDates.calculationContext,
      residual_overlay: residualOverlay,
      remaining_duration_forecast: {
        ...(asRecord(params.forecastDates.calculationContext.remaining_duration_forecast) ?? {}),
        residualOverlay,
      },
    },
  }
}

function readForecastPlanningReplayCorrectionDays(readback: PlanningReplayCalibrationReadback | null | undefined) {
  if (!readback || readback.status !== 'ready') return null
  if (readback.writePolicy !== 'candidate_overlay_only_no_fact_mutation') return null
  const parsed = Number(readback.e2ResidualCorrectionDays)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(7, Math.ceil(parsed))
}

async function loadPlanningReplayCalibrationReadbackForForecast(task: ForecastTaskRow | null) {
  const projectId = normalizeId(task?.project_id)
  if (!projectId) return null
  if (
    !normalizeId(task?.standard_work_code)
    && !normalizeId(task?.standard_work_name)
    && !normalizeId(task?.engineering_category_id)
  ) return null
  try {
    return await readPlanningReplayCalibrationReadback({
      projectId,
      standardWorkCode: task?.standard_work_code ?? null,
      standardWorkName: task?.standard_work_name ?? task?.title ?? null,
      engineeringCategoryId: task?.engineering_category_id ?? null,
    })
  } catch (error) {
    logger.warn('[taskDurationForecastService] planning replay calibration readback unavailable', {
      projectId,
      taskId: task?.id,
      standardWorkCode: task?.standard_work_code,
      error,
    })
    return null
  }
}

async function applyPlanningReplayCalibrationReadbackToForecast(params: {
  forecastDates: ForecastModelResult
  task: ForecastTaskRow | null
  workCalendar: WorkCalendarContext
}): Promise<ForecastModelResult> {
  const beforeRemainingDurationDays = params.forecastDates.remainingDurationDays
  if (beforeRemainingDurationDays == null || beforeRemainingDurationDays <= 0) return params.forecastDates

  const readback = await loadPlanningReplayCalibrationReadbackForForecast(params.task)
  const correctionDays = readForecastPlanningReplayCorrectionDays(readback)
  if (!readback || correctionDays == null) return params.forecastDates

  const afterRemainingDurationDays = Math.max(0, candidateDays(beforeRemainingDurationDays + correctionDays) ?? beforeRemainingDurationDays)
  const today = startOfUtcDay(new Date())
  const progress = clampProgress(params.task?.progress)
  const plannedStart = parseDate(params.task?.planned_start_date ?? params.task?.start_date)
  const actualStart = parseDate(params.task?.actual_start_date)
  const startAnchor = progress > 0
    ? today
    : plannedStart && plannedStart > today
      ? plannedStart
      : actualStart ?? today
  const plannedEnd = parseDate(params.task?.planned_end_date ?? params.task?.end_date)
  const forecastFinish = afterRemainingDurationDays > 0
    ? parseDate(addConstructionProductionDays(startAnchor, afterRemainingDurationDays, params.workCalendar))
    : startAnchor
  const forecastFinishDate = forecastFinish?.toISOString().slice(0, 10) ?? params.forecastDates.forecastFinishDate
  const forecastDelayDays = delayProductionDaysAfter(plannedEnd, forecastFinish, params.workCalendar)
  const delayRiskIndex = round(clamp(
    Math.max(Number(params.forecastDates.delayRiskIndex ?? 0), forecastDelayDays / 14),
    0,
    1,
  ))
  const readbackContext = {
    applied: true,
    source: 'planningReplayCalibrationService',
    writePolicy: readback.writePolicy,
    coarseProcessKey: readback.coarseProcessKey,
    acceptedSampleCount: readback.acceptedSampleCount,
    evidenceRefs: readback.evidenceRefs,
    beforeRemainingDurationDays,
    afterRemainingDurationDays,
    e2ResidualCorrectionDays: correctionDays,
    originalMae: readback.originalMae,
    replayMae: readback.replayMae,
    maeImprovement: readback.maeImprovement,
    overcompensationRate: readback.overcompensationRate,
  }
  const topFactor = `回放校准显示该粗工序历史预测误差可补 ${correctionDays} 天，已按候选 overlay 修正剩余工期。`

  return {
    ...params.forecastDates,
    remainingDurationDays: afterRemainingDurationDays,
    forecastFinishDate,
    forecastDelayDays,
    delayRiskIndex,
    topFactors: uniqueTopFactors([
      topFactor,
      ...params.forecastDates.topFactors,
    ]),
    forecastSources: {
      ...params.forecastDates.forecastSources,
      planningReplayCalibrationReadback: readbackContext,
      forecastPaths: {
        ...(asRecord(params.forecastDates.forecastSources.forecastPaths) ?? {}),
        recommended: {
          ...(asRecord(asRecord(params.forecastDates.forecastSources.forecastPaths)?.recommended) ?? {}),
          remainingDays: afterRemainingDurationDays,
        },
      },
    },
    calculationContext: {
      ...params.forecastDates.calculationContext,
      planning_replay_calibration_readback: readbackContext,
      remaining_duration_forecast: {
        ...(asRecord(params.forecastDates.calculationContext.remaining_duration_forecast) ?? {}),
        planningReplayCalibrationReadback: readbackContext,
      },
    },
  }
}

function buildT2RhythmForecastContext(calculationContext: unknown, factorSummary?: DurationContextSummary | null) {
  const context = asRecord(calculationContext)
  const factorContext = asRecord(factorSummary?.calculationContext)
  const read = (key: string) => asRecord(context?.[key]) ?? asRecord(factorContext?.[key])
  const t2Package = read('t2RhythmScheduleCandidatePackage')
  const networkEvaluation = read('t2RhythmScheduleCandidateNetworkEvaluation')
  const durationInputAssembly = read('durationInputAssembly')
  const result: Record<string, unknown> = {}
  if (t2Package) result.t2RhythmScheduleCandidatePackage = t2Package
  if (networkEvaluation) result.t2RhythmScheduleCandidateNetworkEvaluation = networkEvaluation
  if (durationInputAssembly) result.durationInputAssembly = durationInputAssembly
  return Object.keys(result).length > 0 ? result : null
}

function withT2RhythmForecastContext(params: {
  forecastDates: ForecastModelResult
  suggestion: DurationSuggestionResult
}): ForecastModelResult {
  const context = buildT2RhythmForecastContext(
    params.suggestion.calculationContext,
    params.suggestion.factorSummary ?? null,
  )
  if (!context) return params.forecastDates

  return {
    ...params.forecastDates,
    forecastSources: {
      ...params.forecastDates.forecastSources,
      ...context,
    },
    calculationContext: {
      ...params.forecastDates.calculationContext,
      ...context,
      remaining_duration_forecast: {
        ...(asRecord(params.forecastDates.calculationContext.remaining_duration_forecast) ?? {}),
        ...context,
      },
    },
  }
}

function durationInputAssemblyContextFromAssembler(
  assembled: Awaited<ReturnType<typeof assembleDurationInput>>,
) {
  return {
    source: 'duration_input_assembler',
    inputChannels: assembled.inputChannels,
    sourceLineage: assembled.sourceLineage.map((lineage) => ({
      channel: lineage.channel,
      source: lineage.source,
      status: lineage.status,
      tier: lineage.tier ?? null,
      candidateId: lineage.candidateId ?? null,
      selectedTemplateIds: lineage.selectedTemplateIds ?? [],
      assetSource: lineage.assetSource ?? null,
    })),
    assemblyGate: assembled.assemblyGate,
    mutationBoundary: assembled.mutationBoundary,
  }
}

function mergeDurationInputAssemblyContext(
  upstream: Record<string, unknown> | null | undefined,
  local: Record<string, unknown> | null | undefined,
) {
  if (!upstream || Object.keys(upstream).length === 0) return local ?? null
  if (!local || Object.keys(local).length === 0) return upstream
  const upstreamChannels = asRecord(upstream.inputChannels)
  const localChannels = asRecord(local.inputChannels)
  const lineageByChannel = new Map<string, Record<string, unknown>>()
  for (const lineage of [
    ...(Array.isArray(local.sourceLineage) ? local.sourceLineage : []),
    ...(Array.isArray(upstream.sourceLineage) ? upstream.sourceLineage : []),
  ]) {
    const record = asRecord(lineage)
    const channel = normalizeText(record?.channel)
    if (channel) lineageByChannel.set(channel, record)
  }
  return {
    ...local,
    ...upstream,
    source: normalizeText(upstream.source) || normalizeText(local.source) || 'duration_input_assembler',
    inputChannels: {
      ...(localChannels ?? {}),
      ...(upstreamChannels ?? {}),
    },
    sourceLineage: [...lineageByChannel.values()],
    assemblyGate: asRecord(upstream.assemblyGate) ?? asRecord(local.assemblyGate) ?? {},
    mutationBoundary: {
      ...(asRecord(local.mutationBoundary) ?? {}),
      ...(asRecord(upstream.mutationBoundary) ?? {}),
    },
  }
}

function hasSidecarSource(value: unknown, source: string) {
  return asRecord(value)?.source === source
}

function readTypedSidecar<T>(value: unknown, source: string): T | undefined {
  return hasSidecarSource(value, source) ? value as T : undefined
}

function readDurationAssemblySidecars(suggestion: DurationSuggestionResult): Partial<DurationAlgorithmHydratableInput> {
  const context = asRecord(suggestion.calculationContext)
  const factorContext = asRecord(suggestion.factorSummary?.calculationContext)
  const read = (key: string) => asRecord(context?.[key]) ?? asRecord(factorContext?.[key])
  const constructionOrganizationScenario = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['constructionOrganizationScenario']>
  >(read('constructionOrganizationScenario'), 'construction_organization_scenario_selector')
  const t2RhythmScheduleCandidatePackage = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmScheduleCandidatePackage']>
  >(read('t2RhythmScheduleCandidatePackage'), 't2_division_rhythm_schedule_candidate_package')
  const t2RhythmProductionCapacityEvidence = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmProductionCapacityEvidence']>
  >(read('t2RhythmProductionCapacityEvidence'), 't2_rhythm_production_capacity_evidence')
  const t2RhythmScheduleCandidateNetwork = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmScheduleCandidateNetwork']>
  >(read('t2RhythmScheduleCandidateNetwork'), 't2_rhythm_schedule_candidate_network')
  const t2RhythmScheduleCandidateNetworkEvaluation = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmScheduleCandidateNetworkEvaluation']>
  >(read('t2RhythmScheduleCandidateNetworkEvaluation'), 't2_rhythm_schedule_candidate_network_phase1_evaluation')
  const t2RhythmSchedulePhase1Selection = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmSchedulePhase1Selection']>
  >(read('t2RhythmSchedulePhase1Selection'), 't2_rhythm_schedule_phase1_selection')
  const t2RhythmStandardLibraryTrustGate = readTypedSidecar<
    NonNullable<DurationAlgorithmHydratableInput['t2RhythmStandardLibraryTrustGate']>
  >(read('t2RhythmStandardLibraryTrustGate'), 't2_rhythm_standard_library_live_replay_trust_gate')
  return {
    ...(constructionOrganizationScenario ? { constructionOrganizationScenario } : {}),
    ...(t2RhythmScheduleCandidatePackage ? { t2RhythmScheduleCandidatePackage } : {}),
    ...(t2RhythmProductionCapacityEvidence ? { t2RhythmProductionCapacityEvidence } : {}),
    ...(t2RhythmScheduleCandidateNetwork ? { t2RhythmScheduleCandidateNetwork } : {}),
    ...(t2RhythmScheduleCandidateNetworkEvaluation ? { t2RhythmScheduleCandidateNetworkEvaluation } : {}),
    ...(t2RhythmSchedulePhase1Selection ? { t2RhythmSchedulePhase1Selection } : {}),
    ...(t2RhythmStandardLibraryTrustGate ? { t2RhythmStandardLibraryTrustGate } : {}),
    durationExperienceSignals: read('durationExperienceSignals'),
    criticalPathEvidence: read('criticalPathEvidence'),
  }
}

async function buildE2DurationInputAssemblyContext(input: Record<string, unknown>, suggestion: DurationSuggestionResult) {
  const runtimeExecutionFacts = asRecord(input.runtimeExecutionFacts)
  const assemblyInput: DurationAlgorithmHydratableInput & Record<string, unknown> = {
    ...input,
    actualExecutionFacts: {
      source: 'runtime_execution_facts',
      ...(runtimeExecutionFacts ?? {}),
    },
    ...readDurationAssemblySidecars(suggestion),
  }
  const assembled = await assembleDurationInput(assemblyInput, {
    purpose: 'runtime_forecast',
  })
  return durationInputAssemblyContextFromAssembler(assembled)
}

function withDurationInputAssemblyForecastContext(params: {
  forecastDates: ForecastModelResult
  durationInputAssembly: Record<string, unknown> | null
}): ForecastModelResult {
  if (!params.durationInputAssembly) return params.forecastDates
  const existing = asRecord(params.forecastDates.forecastSources.durationInputAssembly)
    ?? asRecord(params.forecastDates.calculationContext.durationInputAssembly)
  const durationInputAssembly = mergeDurationInputAssemblyContext(existing, params.durationInputAssembly)
  if (!durationInputAssembly) return params.forecastDates
  return {
    ...params.forecastDates,
    forecastSources: {
      ...params.forecastDates.forecastSources,
      durationInputAssembly,
    },
    calculationContext: {
      ...params.forecastDates.calculationContext,
      durationInputAssembly,
      remaining_duration_forecast: {
        ...(asRecord(params.forecastDates.calculationContext.remaining_duration_forecast) ?? {}),
        durationInputAssembly,
      },
    },
  }
}

function snapshotDate(snapshot: ForecastSnapshotRow) {
  return parseDate(snapshot.snapshot_date ?? snapshot.created_at ?? null)
}

function normalizeSnapshots(snapshots: ForecastSnapshotRow[]) {
  return snapshots
    .map((snapshot) => ({
      ...snapshot,
      progress: clampProgress(snapshot.progress),
      date: snapshotDate(snapshot),
    }))
    .filter((snapshot): snapshot is ForecastSnapshotRow & { progress: number; date: Date } => Boolean(snapshot.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

function buildReferenceRatioCandidate(
  totalDurationDays: number | null,
  progress: number,
  curveType: ProgressCurveType = 'linear',
): ForecastCandidate | null {
  const duration = positiveCeil(totalDurationDays)
  if (!duration) return null
  const remainingRatio = remainingEffortRatioForCurve(curveType, progress)
  return {
    key: 'reference_ratio',
    days: progress > 0 ? Math.max(1, Math.ceil(duration * remainingRatio)) : duration,
    reason: curveType === 'linear'
      ? 'Reference duration remaining ratio.'
      : `Reference duration remaining ratio adjusted by ${curveType} progress curve.`,
  }
}

function buildSpiCandidate(
  task: ForecastTaskRow | null,
  totalDurationDays: number | null,
  progress: number,
  now: Date,
  calendar?: WorkCalendarContext | null,
  curveType: ProgressCurveType = 'linear',
): ForecastCandidate | null {
  if (progress <= 0 || progress >= 100) return null
  const actualStart = parseDate(task?.actual_start_date)
  if (!actualStart) return null

  const plannedTotal = plannedProductionDurationDays(task, calendar) ?? positiveCeil(totalDurationDays)
  if (!plannedTotal) return null

  const today = startOfUtcDay(now)
  const elapsedDays = Math.max(1, productionDaysBetweenInclusive(actualStart, today, calendar))
  const plannedValue = clamp((elapsedDays / plannedTotal) * 100, 1, 100)
  const spi = clamp(progress / plannedValue, 0.1, 2)
  const estimatedAtCompletionDays = plannedTotal / spi
  const linearRemaining = candidateDays(estimatedAtCompletionDays - elapsedDays)
    ?? (plannedValue >= 100 && progress < 100
      ? candidateDays(plannedTotal * ((100 - progress) / 100))
      : null)
  const remaining = linearRemaining === null
    ? null
    : candidateDays(curveAwareVelocityDays(linearRemaining, curveType, progress))
  if (!remaining) return null

  return {
    key: 'spi_eac',
    days: remaining,
    reason: curveType === 'linear'
      ? `SPI/EAC forecast, SPI=${round(spi)}`
      : `SPI/EAC forecast, SPI=${round(spi)}, adjusted by ${curveType} progress curve.`,
  }
}

function buildRecentVelocityCandidate(
  snapshots: ForecastSnapshotRow[],
  anomalySignals: ProgressAnomalySignal[],
  progress: number,
  now: Date,
  calendar?: WorkCalendarContext | null,
  curveType: ProgressCurveType = 'linear',
): ForecastCandidate | null {
  if (progress <= 0 || progress >= 100) return null
  if (anomalySignals.some((signal) => signal.code === 'month_end_burst' || signal.code === 'progress_jump')) {
    return null
  }

  const ordered = normalizeSnapshots(snapshots)
  if (ordered.length < 3) return null

  const today = startOfUtcDay(now)
  const recentWindowStart = new Date(today)
  recentWindowStart.setUTCDate(recentWindowStart.getUTCDate() - 14)
  const recent = ordered.filter((snapshot) => snapshot.date >= recentWindowStart && snapshot.date <= today)
  const stableWindow = recent.length >= 3 ? recent : ordered.slice(-3)
  if (stableWindow.length < 3) return null
  const anchor = stableWindow[0]
  if (!anchor) return null

  const dayGap = Math.max(1, productionDaysBetweenInclusive(anchor.date, today, calendar))
  const progressDelta = progress - anchor.progress
  if (progressDelta <= 0.5) return null

  const dailySpeed = progressDelta / dayGap
  if (!Number.isFinite(dailySpeed) || dailySpeed < 0.05) return null

  const remaining = candidateDays(curveAwareVelocityDays((100 - progress) / dailySpeed, curveType, progress))
  if (!remaining) return null

  return {
    key: 'recent_velocity',
    days: remaining,
    reason: curveType === 'linear'
      ? `Recent progress velocity ${round(dailySpeed)} percentage points/day.`
      : `Recent progress velocity ${round(dailySpeed)} percentage points/day adjusted by ${curveType} progress curve.`,
  }
}

function buildHistoryVelocityCandidate(
  referenceCandidate: ForecastCandidate | null,
  velocityLearning: ProgressVelocityLearningResult | null,
): ForecastCandidate | null {
  if (!referenceCandidate || !velocityLearning || velocityLearning.sampleCount < 2) return null
  if (velocityLearning.confidenceLevel === 'low' && velocityLearning.actionPolicy === 'confidence_only') return null

  const remaining = candidateDays(referenceCandidate.days * velocityLearning.multiplier)
  if (!remaining) return null

  return {
    key: 'history_velocity',
    days: remaining,
    reason: `Similar completed tasks multiplier ${round(velocityLearning.multiplier)}.`,
  }
}

function hasPublishedProjectBaselineCalibration(factorSummary: DurationContextSummary | null | undefined) {
  return Array.isArray(factorSummary?.factors) && factorSummary.factors.some((factor) => (
    factor.key === 'project_baseline_calibration'
    && asRecord(factor.metadata)?.runtimeAuthority === 'published_parameter_only'
  ))
}

function readCurveFromProfileMapping(task: ForecastTaskRow | null, profile?: ForecastModelProfile | null): ProgressCurveType | null {
  const mappings = asRecord(profile?.metadata?.progressCurveMappings)
    ?? asRecord(profile?.metadata?.progress_curve_mappings)
  if (!mappings) return null

  const taskFacts = {
    standardWorkCode: normalizeId(task?.standard_work_code),
    engineeringCategoryId: normalizeId(task?.engineering_category_id),
    templateNodeId: normalizeId(task?.template_node_id),
  }

  for (const curveType of ['linear', 'front_heavy', 'back_heavy', 's_curve'] as ProgressCurveType[]) {
    const mapping = asRecord(mappings[curveType])
    if (!mapping) continue
    const standardWorkCodes = readStringList(mapping.standardWorkCodes ?? mapping.standard_work_codes)
    const standardWorkCodePrefixes = readStringList(mapping.standardWorkCodePrefixes ?? mapping.standard_work_code_prefixes)
    const engineeringCategoryIds = readStringList(mapping.engineeringCategoryIds ?? mapping.engineering_category_ids)
    const templateNodeIds = readStringList(mapping.templateNodeIds ?? mapping.template_node_ids)

    if (taskFacts.standardWorkCode && standardWorkCodes.includes(taskFacts.standardWorkCode)) return curveType
    if (taskFacts.standardWorkCode && standardWorkCodePrefixes.some((prefix) => taskFacts.standardWorkCode?.startsWith(prefix))) return curveType
    if (taskFacts.engineeringCategoryId && engineeringCategoryIds.includes(taskFacts.engineeringCategoryId)) return curveType
    if (taskFacts.templateNodeId && templateNodeIds.includes(taskFacts.templateNodeId)) return curveType
  }

  return null
}

function resolveProgressCurve(task: ForecastTaskRow | null, profile?: ForecastModelProfile | null): ProgressCurveType {
  const configured = readCurveFromProfileMapping(task, profile)
  if (configured) return configured

  const text = [
    task?.standard_work_code,
    task?.standard_work_name,
    task?.title,
  ].map((item) => String(item ?? '').toLowerCase()).join(' ')

  if (
    text.includes('rebar')
    || text.includes('masonry')
    || text.includes('plaster')
    || text.includes('waterproof')
    || text.includes('\u94a2\u7b4b')
    || text.includes('\u780c\u4f53')
    || text.includes('\u62b9\u7070')
    || text.includes('\u9632\u6c34')
  ) return 'front_heavy'

  if (
    text.includes('acceptance')
    || text.includes('commission')
    || text.includes('closeout')
    || text.includes('punch')
    || text.includes('\u9a8c\u6536')
    || text.includes('\u8c03\u8bd5')
    || text.includes('\u6536\u5c3e')
    || text.includes('\u79fb\u4ea4')
  ) return 'back_heavy'

  if (
    text.includes('mep')
    || text.includes('installation')
    || text.includes('fitout')
    || text.includes('\u673a\u7535')
    || text.includes('\u5b89\u88c5')
    || text.includes('\u88c5\u9970')
  ) return 's_curve'

  return 'linear'
}

function readCurvePolicy(profile: ForecastModelProfile | null | undefined, curveType: ProgressCurveType) {
  const policies = asRecord(profile?.metadata?.progressCurvePolicies)
    ?? asRecord(profile?.metadata?.progress_curve_policies)
    ?? asRecord(profile?.metadata?.progressCurveMultipliers)
    ?? asRecord(profile?.metadata?.progress_curve_multipliers)
  const custom = Array.isArray(policies?.[curveType]) ? policies?.[curveType] as Array<Record<string, unknown>> : null
  if (!custom) return DEFAULT_PROGRESS_CURVE_POLICIES[curveType]

  const parsed = custom
    .map((entry) => ({
      minProgress: entry.minProgress == null && entry.min_progress == null ? undefined : readNumber(entry.minProgress ?? entry.min_progress, 0),
      maxProgress: entry.maxProgress == null && entry.max_progress == null ? undefined : readNumber(entry.maxProgress ?? entry.max_progress, 100),
      multiplier: readNumber(entry.multiplier, 1),
    }))
    .filter((entry) => Number.isFinite(entry.multiplier) && entry.multiplier > 0)

  return parsed.length > 0 ? parsed : DEFAULT_PROGRESS_CURVE_POLICIES[curveType]
}

function curveMultiplier(curveType: ProgressCurveType, progress: number, profile?: ForecastModelProfile | null) {
  const policy = readCurvePolicy(profile, curveType)
  const match = policy.find((entry) => (
    (entry.minProgress == null || progress >= entry.minProgress)
    && (entry.maxProgress == null || progress <= entry.maxProgress)
  ))
  return match?.multiplier ?? 1
}

function readStuckPolicy(profile: ForecastModelProfile | null | undefined, curveType: ProgressCurveType) {
  const policies = asRecord(profile?.metadata?.stuckFinishingPolicies)
    ?? asRecord(profile?.metadata?.stuck_finishing_policies)
  const custom = asRecord(policies?.[curveType])
  if (!custom) return DEFAULT_STUCK_FINISHING_POLICIES[curveType]

  const fallback = DEFAULT_STUCK_FINISHING_POLICIES[curveType]
  return {
    progressThreshold: readNumber(custom.progressThreshold ?? custom.progress_threshold, fallback.progressThreshold),
    stuckDaysThreshold: readNumber(custom.stuckDaysThreshold ?? custom.stuck_days_threshold, fallback.stuckDaysThreshold),
    floorDays: readNumber(custom.floorDays ?? custom.floor_days, fallback.floorDays),
    criticalStuckDaysThreshold: readNumber(custom.criticalStuckDaysThreshold ?? custom.critical_stuck_days_threshold, fallback.criticalStuckDaysThreshold),
    criticalFloorDays: readNumber(custom.criticalFloorDays ?? custom.critical_floor_days, fallback.criticalFloorDays),
  }
}

function detectPolicyStuckFinishing(
  snapshots: ForecastSnapshotRow[],
  curveType: ProgressCurveType,
  profile?: ForecastModelProfile | null,
) {
  const policy = readStuckPolicy(profile, curveType)
  const ordered = normalizeSnapshots(snapshots)
  const latest = ordered[ordered.length - 1]
  if (!latest || latest.progress < policy.progressThreshold || latest.progress >= 100) return null

  let plateauStart = latest
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    if (Math.abs(ordered[index].progress - latest.progress) > 0.001) break
    plateauStart = ordered[index]
  }

  const stuckDays = calendarDeltaDays(startOfUtcDay(plateauStart.date), startOfUtcDay(latest.date))
  if (stuckDays < policy.stuckDaysThreshold) return null

  const critical = stuckDays >= policy.criticalStuckDaysThreshold
  return {
    floorDays: critical ? policy.criticalFloorDays : policy.floorDays,
    stuckDays,
    severity: critical ? 'critical' : 'warning',
    progressThreshold: policy.progressThreshold,
    stuckDaysThreshold: policy.stuckDaysThreshold,
    policySource: 'model_profile_or_default',
  }
}

function stuckFinishingFloorDays(
  anomalySignals: ProgressAnomalySignal[],
  snapshots: ForecastSnapshotRow[],
  curveType: ProgressCurveType,
  profile?: ForecastModelProfile | null,
) {
  const policyResult = detectPolicyStuckFinishing(snapshots, curveType, profile)
  if (policyResult) return policyResult

  const stuck = anomalySignals.find((signal) => signal.code === 'stuck_finishing')
  if (!stuck) return { floorDays: 0, stuckDays: 0, severity: null as string | null }
  const stuckDays = Number(stuck.metadata?.stuck_days ?? 0)
  const policy = readStuckPolicy(profile, curveType)
  const floorDays = stuck.severity === 'critical' || stuckDays >= policy.criticalStuckDaysThreshold
    ? policy.criticalFloorDays
    : policy.floorDays
  return {
    floorDays,
    stuckDays,
    severity: stuck.severity,
    progressThreshold: policy.progressThreshold,
    stuckDaysThreshold: policy.stuckDaysThreshold,
    policySource: 'progress_anomaly_signal',
  }
}

function obstacleTypeImpact(obstacle: ForecastObstacleRow) {
  const text = `${obstacle.obstacle_type ?? ''} ${obstacle.description ?? ''}`.toLowerCase()
  const matches = (tokens: string[]) => tokens.some((token) => text.includes(token))
  if (matches(['safety', 'quality', 'collapse', '\u5b89\u5168', '\u8d28\u91cf', '\u584c', '\u4e8b\u6545'])) {
    return { type: 'safety_quality', days: 3 }
  }
  if (matches(['labor', 'crew', 'resource', '\u4eba\u5458', '\u52b3\u52a8', '\u73ed\u7ec4', '\u8d44\u6e90'])) {
    return { type: 'labor_resource', days: 2 }
  }
  if (matches(['material', 'procurement', 'supplier', '\u6750\u6599', '\u91c7\u8d2d', '\u4f9b\u5e94'])) {
    return { type: 'material_procurement', days: 2 }
  }
  if (matches(['drawing', 'design', 'rfi', '\u56fe\u7eb8', '\u8bbe\u8ba1', '\u53d8\u66f4'])) {
    return { type: 'drawing_design', days: 2 }
  }
  if (matches(['weather', 'rain', 'temperature', '\u5929\u6c14', '\u96e8', '\u6e29\u5ea6', '\u51ac\u671f'])) {
    return { type: 'weather', days: 2 }
  }
  if (matches(['acceptance', 'inspection', 'permit', 'certificate', '\u9a8c\u6536', '\u68c0\u67e5', '\u8bc1\u7167', '\u624b\u7eed'])) {
    return { type: 'acceptance_permit', days: 2 }
  }
  if (matches(['access', 'site', 'interface', '\u573a\u5730', '\u5de5\u4f5c\u9762', '\u4ea4\u63a5', '\u901a\u9053'])) {
    return { type: 'site_access', days: 1 }
  }
  return { type: 'general', days: 0 }
}

function obstacleImpactDays(obstacles: ForecastObstacleRow[], now: Date) {
  let additiveDays = 0
  let criticalCount = 0
  let majorCount = 0
  let confidenceOnlyCount = 0
  let criticalWithoutResolveDateCount = 0
  let blockingResolveDate: Date | null = null
  const typeBreakdown: Record<string, { count: number; days: number }> = {}

  for (const obstacle of obstacles) {
    const severity = String(obstacle.severity ?? '').toLowerCase()
    const isCritical = severity.includes('critical')
      || severity.includes('severe')
      || severity.includes('\u4e25\u91cd')
    const isMajor = isCritical
      || severity.includes('high')
      || severity.includes('major')
      || severity.includes('\u9ad8')
      || severity.includes('\u4e2d')

    if (isCritical) {
      criticalCount += 1
      additiveDays += 3
      const estimatedResolveDate = parseDate(obstacle.estimated_resolve_date)
      if (estimatedResolveDate && estimatedResolveDate > startOfUtcDay(now)) {
        blockingResolveDate = maxDate(blockingResolveDate, estimatedResolveDate)
      } else {
        criticalWithoutResolveDateCount += 1
      }
    } else if (isMajor) {
      majorCount += 1
      additiveDays += 1
    } else {
      confidenceOnlyCount += 1
    }

    const typeImpact = obstacleTypeImpact(obstacle)
    additiveDays += typeImpact.days
    typeBreakdown[typeImpact.type] = {
      count: (typeBreakdown[typeImpact.type]?.count ?? 0) + 1,
      days: (typeBreakdown[typeImpact.type]?.days ?? 0) + typeImpact.days,
    }

    const createdAt = parseDate(obstacle.created_at)
    if (createdAt) {
      const ageDays = calendarDeltaDays(startOfUtcDay(createdAt), startOfUtcDay(now))
      if (ageDays >= 30) {
        additiveDays += 2
        confidenceOnlyCount += 1
      } else if (ageDays >= 14) additiveDays += 2
      else if (ageDays >= 7) additiveDays += 1
    }
  }

  const multiplier = criticalCount > 0 && obstacles.length > 1
    ? 1.5
    : criticalCount > 0
      ? 1.3
      : majorCount >= 2
        ? 1.3
        : obstacles.length > 0
          ? 1.15
          : 1

  const days = Math.min(14, Math.ceil(additiveDays))

  return {
    days,
    additiveDays: days,
    multiplier,
    confidenceOnlyCount,
    criticalWithoutResolveDateCount,
    blockingResolveDate,
    criticalCount,
    majorCount,
    count: obstacles.length,
    typeBreakdown,
    impactModeBreakdown: {
      add_days: days,
      multiplier,
      blocking_start: blockingResolveDate ? blockingResolveDate.toISOString().slice(0, 10) : null,
      confidence_only_count: confidenceOnlyCount,
    },
  }
}

function isCompletedTaskLike(task: ForecastTaskRow | null | undefined) {
  return isCompletedTask({
    status: task?.status,
    progress: clampProgress(task?.progress),
    actual_end_date: task?.actual_end_date,
  })
}

function dependencyExpectedFinishDate(
  dependencyTaskId: string,
  dependencyTask: ForecastTaskRow | null | undefined,
  dependencyForecast: ForecastDependencyForecastRow | null | undefined,
  now: Date,
  calendar?: WorkCalendarContext | null,
) {
  if (isCompletedTaskLike(dependencyTask)) {
    const finishDate = parseDate(dependencyTask?.actual_end_date) ?? parseDate(dependencyTask?.planned_end_date ?? dependencyTask?.end_date)
    return { finishDate, source: 'dependency_actual_finish', isStale: false, forecastAgeDays: null as number | null }
  }

  const forecastFinish = parseDate(dependencyForecast?.forecast_finish_date)
  if (forecastFinish) {
    const createdAt = parseDate(dependencyForecast?.created_at)
    const forecastAgeDays = createdAt ? calendarDeltaDays(startOfUtcDay(createdAt), startOfUtcDay(now)) : null
    const isStale = forecastAgeDays != null && forecastAgeDays > 1
    return {
      finishDate: forecastFinish,
      source: isStale ? 'stale_dependency_forecast' : 'current_dependency_forecast',
      isStale,
      forecastAgeDays,
    }
  }

  const plannedEnd = parseDate(dependencyTask?.planned_end_date ?? dependencyTask?.end_date)
  const today = startOfUtcDay(now)
  if (plannedEnd && plannedEnd > today) {
    return { finishDate: plannedEnd, source: 'dependency_planned_finish', isStale: false, forecastAgeDays: null as number | null }
  }

  const progress = clampProgress(dependencyTask?.progress)
  const plannedTotal = plannedProductionDurationDays(dependencyTask ?? null, calendar) ?? 1
  const fallbackRemaining = buildReferenceRatioCandidate(plannedTotal, progress)?.days ?? 1
  return {
    finishDate: parseDate(addConstructionProductionDays(today, fallbackRemaining, calendar)),
    source: 'dependency_task_fact',
    isStale: false,
    forecastAgeDays: null as number | null,
  }
}

function dependencyExpectedStartDate(
  dependencyTask: ForecastTaskRow | null | undefined,
  now: Date,
) {
  const actualStart = parseDate(dependencyTask?.actual_start_date)
  if (actualStart) {
    return { startDate: actualStart, source: 'dependency_actual_start', isStale: false, forecastAgeDays: null as number | null }
  }

  const plannedStart = parseDate(dependencyTask?.planned_start_date ?? dependencyTask?.start_date)
  if (plannedStart) {
    return { startDate: plannedStart, source: 'dependency_planned_start', isStale: false, forecastAgeDays: null as number | null }
  }

  if (clampProgress(dependencyTask?.progress) > 0) {
    return { startDate: startOfUtcDay(now), source: 'dependency_inferred_started', isStale: false, forecastAgeDays: null as number | null }
  }

  return { startDate: null as Date | null, source: 'dependency_start_unknown', isStale: false, forecastAgeDays: null as number | null }
}

function normalizeDependencyType(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized === 'SS' || normalized === 'FF' || normalized === 'SF' ? normalized : 'FS'
}

function normalizeLagDays(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function isProductionDay(date: Date, calendar?: WorkCalendarContext | null) {
  return productionDaysBetweenInclusive(date, date, calendar) > 0
}

function subtractConstructionProductionDays(date: Date, days: number, calendar?: WorkCalendarContext | null) {
  const cursor = startOfUtcDay(date)
  let remaining = Math.max(0, Math.trunc(days))
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (isProductionDay(cursor, calendar)) remaining -= 1
  }
  return cursor
}

function applyDependencyLag(anchor: Date, lagDays: number, calendar?: WorkCalendarContext | null) {
  if (lagDays === 0) return anchor
  if (lagDays > 0) {
    return parseDate(addConstructionProductionDays(anchor, lagDays + 1, calendar)) ?? anchor
  }
  return subtractConstructionProductionDays(anchor, Math.abs(lagDays), calendar)
}

function remainingFloorUntilFinish(startAnchor: Date, requiredFinish: Date, selfExecutionDays: number, calendar?: WorkCalendarContext | null) {
  if (requiredFinish <= startAnchor) return selfExecutionDays
  return Math.max(selfExecutionDays, productionDaysBetweenInclusive(startAnchor, requiredFinish, calendar))
}

function dependencyPropagationImpactDays(params: {
  context: ForecastDependencyContext
  startAnchor: Date
  selfExecutionDays: number | null
  now: Date
  calendar?: WorkCalendarContext | null
}) {
  const blockingDependencies: Array<Record<string, unknown>> = []
  let maxFloorRemainingDays = 0
  let maxWaitDays = 0
  let staleForecastCount = 0

  for (const dependency of params.context.dependencies) {
    if (dependency.required_for_start === false) continue
    if (normalizeStatus(dependency.status || 'active') !== 'active') continue

    const dependencyTaskId = normalizeId(dependency.dependency_task_id)
    if (!dependencyTaskId) continue

    const dependencyTask = params.context.dependencyTasks.get(dependencyTaskId)
    if (isCompletedTaskLike(dependencyTask)) continue

    const selfExecutionDays = params.selfExecutionDays ?? 1
    const dependencyType = normalizeDependencyType(dependency.dependency_type)
    const lagDays = normalizeLagDays(dependency.lag_days)

    if (dependencyType === 'SS') {
      const expected = dependencyExpectedStartDate(dependencyTask, params.now)
      const startDate = expected.startDate
      if (!startDate) continue
      const availableStart = applyDependencyLag(startDate, lagDays, params.calendar)
      const waitDays = productionWaitDays(params.startAnchor, availableStart, params.calendar)
      const floorRemainingDays = waitDays + selfExecutionDays

      maxWaitDays = Math.max(maxWaitDays, waitDays)
      maxFloorRemainingDays = Math.max(maxFloorRemainingDays, floorRemainingDays)
      blockingDependencies.push({
        dependencyTaskId,
        dependencyType,
        constraintType: 'start',
        lagDays,
        expectedStartDate: startDate.toISOString().slice(0, 10),
        availableStartDate: availableStart.toISOString().slice(0, 10),
        waitDays,
        floorRemainingDays,
        source: expected.source,
        forecastAgeDays: expected.forecastAgeDays,
      })
      continue
    }

    if (dependencyType === 'SF') {
      const expected = dependencyExpectedStartDate(dependencyTask, params.now)
      const startDate = expected.startDate
      if (!startDate) continue
      const requiredFinish = applyDependencyLag(startDate, lagDays, params.calendar)
      const floorRemainingDays = remainingFloorUntilFinish(params.startAnchor, requiredFinish, selfExecutionDays, params.calendar)

      maxFloorRemainingDays = Math.max(maxFloorRemainingDays, floorRemainingDays)
      blockingDependencies.push({
        dependencyTaskId,
        dependencyType,
        constraintType: 'finish',
        lagDays,
        expectedStartDate: startDate.toISOString().slice(0, 10),
        requiredFinishDate: requiredFinish.toISOString().slice(0, 10),
        waitDays: 0,
        floorRemainingDays,
        source: expected.source,
        forecastAgeDays: expected.forecastAgeDays,
      })
      continue
    }

    const expected = dependencyExpectedFinishDate(
      dependencyTaskId,
      dependencyTask,
      params.context.dependencyForecasts.get(dependencyTaskId),
      params.now,
      params.calendar,
    )
    const finishDate = expected.finishDate
    if (!finishDate) continue
    if (expected.isStale) staleForecastCount += 1

    if (dependencyType === 'FF') {
      const requiredFinish = applyDependencyLag(finishDate, lagDays, params.calendar)
      const floorRemainingDays = remainingFloorUntilFinish(params.startAnchor, requiredFinish, selfExecutionDays, params.calendar)

      maxFloorRemainingDays = Math.max(maxFloorRemainingDays, floorRemainingDays)
      blockingDependencies.push({
        dependencyTaskId,
        dependencyType,
        constraintType: 'finish',
        lagDays,
        expectedFinishDate: finishDate.toISOString().slice(0, 10),
        requiredFinishDate: requiredFinish.toISOString().slice(0, 10),
        waitDays: 0,
        floorRemainingDays,
        source: expected.source,
        forecastAgeDays: expected.forecastAgeDays,
      })
      continue
    }

    const availableStart = applyDependencyLag(finishDate, lagDays, params.calendar)
    const waitDays = productionWaitDays(params.startAnchor, availableStart, params.calendar)
    const floorRemainingDays = waitDays + selfExecutionDays

    maxWaitDays = Math.max(maxWaitDays, waitDays)
    maxFloorRemainingDays = Math.max(maxFloorRemainingDays, floorRemainingDays)
    blockingDependencies.push({
      dependencyTaskId,
      dependencyType,
      constraintType: 'start',
      lagDays,
      expectedFinishDate: finishDate.toISOString().slice(0, 10),
      availableStartDate: availableStart.toISOString().slice(0, 10),
      waitDays,
      floorRemainingDays,
      source: expected.source,
      forecastAgeDays: expected.forecastAgeDays,
    })
  }

  return {
    count: blockingDependencies.length,
    maxWaitDays,
    floorRemainingDays: maxFloorRemainingDays || null,
    staleForecastCount,
    blockingDependencies,
    diagnostics: params.context.diagnostics,
  }
}

function dependencyDiagnosticReasons(diagnostics: ForecastDependencyContext['diagnostics']) {
  return uniqueTopFactors([
    diagnostics.depthLimitReached
      ? `依赖链超过 ${diagnostics.maxDepth} 层，系统仅参考前 ${diagnostics.maxDepth} 层前置任务。`
      : null,
    diagnostics.selfDependencySkippedCount > 0
      ? '⵽ϵϵͳ޸'
      : null,
    diagnostics.repeatedDependencySkippedCount > 0
      ? '⵽ظѭϵϵͳѰԤ⣬ʵṹ'
      : null,
  ])
}

function isConditionSatisfied(condition: ForecastConditionRow) {
  if (normalizeBoolean(condition.is_satisfied)) return true
  return SATISFIED_CONDITION_STATUSES.includes(normalizeStatus(condition.status))
}

function isConditionRelevant(condition: ForecastConditionRow) {
  return !CLOSED_CONDITION_STATUSES.includes(normalizeStatus(condition.status))
}

function conditionTargetDate(condition: ForecastConditionRow) {
  return parseDate(condition.target_date ?? condition.planned_date ?? condition.expected_date ?? condition.due_date)
}

function conditionStartGateSource(condition: ForecastConditionRow) {
  const text = `${condition.condition_type ?? ''} ${condition.name ?? ''} ${condition.source_entity_type ?? ''}`.toLowerCase()
  if (text.includes('drawing') || text.includes('\u56fe\u7eb8') || Boolean(condition.drawing_package_id || condition.drawing_package_code)) {
    return 'drawing_condition_target_date'
  }
  if (text.includes('certificate') || text.includes('permit') || text.includes('license') || text.includes('\u8bc1\u7167') || text.includes('\u8bb8\u53ef')) {
    return 'certificate_condition_target_date'
  }
  if (text.includes('acceptance') || text.includes('\u9a8c\u6536')) {
    return 'acceptance_condition_target_date'
  }
  return 'hard_condition_target_date'
}

function externalReadinessImpactDays(context: ForecastExternalReadinessContext, now: Date) {
  const today = startOfUtcDay(now)
  const conditions = context.conditions.filter(isConditionRelevant)
  const unmetConditions = conditions.filter((condition) => condition.required_for_start !== false && !isConditionSatisfied(condition))
  const hardUnmetConditions = unmetConditions.filter((condition) => {
    const blockingLevel = normalizeStatus(condition.blocking_level)
    return !blockingLevel || blockingLevel === 'hard' || blockingLevel === 'blocked'
  })
  const drawingConditionCount = unmetConditions.filter((condition) => {
    const text = `${condition.condition_type ?? ''} ${condition.name ?? ''} ${condition.source_entity_type ?? ''}`.toLowerCase()
    return text.includes('drawing') || text.includes('\u56fe\u7eb8') || Boolean(condition.drawing_package_id || condition.drawing_package_code)
  }).length
  const materialConditionCount = unmetConditions.filter((condition) => {
    const text = `${condition.condition_type ?? ''} ${condition.name ?? ''} ${condition.source_entity_type ?? ''}`.toLowerCase()
    return text.includes('material') || text.includes('\u6750\u6599')
  }).length
  const conditionStartDateCandidates = hardUnmetConditions
    .map((condition) => ({
      source: conditionStartGateSource(condition),
      date: conditionTargetDate(condition),
    }))
    .filter((candidate): candidate is { source: string; date: Date } => Boolean(candidate.date && candidate.date >= today))
  const staleConditionTargetDateCount = hardUnmetConditions.filter((condition) => {
    const target = conditionTargetDate(condition)
    return Boolean(target && target < today)
  }).length
  const hardConditionWithoutUsableDateCount = hardUnmetConditions.filter((condition) => {
    const target = conditionTargetDate(condition)
    return !target || target < today
  }).length

  const pendingMaterials = context.materials.filter((material) => {
    if (material.actual_arrival_date) return false
    const lifecycleStatus = normalizeStatus(material.lifecycle_status)
    const recordStatus = normalizeStatus(material.record_status)
    return !CLOSED_MATERIAL_STATUSES.includes(lifecycleStatus) && !CLOSED_MATERIAL_STATUSES.includes(recordStatus)
  })
  const overdueMaterials = pendingMaterials.filter((material) => {
    const expected = parseDate(material.expected_arrival_date)
    return Boolean(expected && expected < today)
  })
  const pendingMaterialsWithoutExpectedDate = pendingMaterials.filter((material) => !parseDate(material.expected_arrival_date))
  const materialBlockingStartDate = pendingMaterials.reduce<Date | null>((latest, material) => {
    const expected = parseDate(material.expected_arrival_date)
    return expected && expected > today ? maxDate(latest, expected) : latest
  }, null)

  const pendingAcceptancePlans = context.acceptancePlans.filter((plan) => {
    if (plan.actual_date) return false
    return !PASSED_ACCEPTANCE_STATUSES.includes(normalizeStatus(plan.status))
  })
  const overdueAcceptancePlans = pendingAcceptancePlans.filter((plan) => {
    const planned = parseDate(plan.planned_date)
    return Boolean(planned && planned < today)
  })
  const pendingAcceptanceWithoutPlannedDate = pendingAcceptancePlans.filter((plan) => !parseDate(plan.planned_date))
  const acceptanceFinishLagDate = pendingAcceptancePlans.reduce<Date | null>((latest, plan) => {
    const planned = parseDate(plan.planned_date)
    return planned && planned > today ? maxDate(latest, planned) : latest
  }, null)

  const days = Math.min(14,
    (hardUnmetConditions.length * 2)
    + drawingConditionCount
    + materialConditionCount
    + (pendingMaterials.length * 2)
    + overdueMaterials.length,
  )

  return {
    days,
    additiveDays: days,
    conditionStartDateCandidates,
    blockingStartDate: materialBlockingStartDate,
    acceptanceFinishLagDate,
    confidenceOnlyCount: unmetConditions.length > 0 && hardUnmetConditions.length === 0 ? unmetConditions.length : 0,
    unknownStartBlockerCount: hardConditionWithoutUsableDateCount + pendingMaterialsWithoutExpectedDate.length + pendingAcceptanceWithoutPlannedDate.length + overdueMaterials.length + overdueAcceptancePlans.length,
    unmetConditionCount: unmetConditions.length,
    hardUnmetConditionCount: hardUnmetConditions.length,
    hardConditionWithoutUsableDateCount,
    staleConditionTargetDateCount,
    drawingConditionCount,
    materialConditionCount,
    pendingMaterialCount: pendingMaterials.length,
    overdueMaterialCount: overdueMaterials.length,
    pendingMaterialWithoutExpectedDateCount: pendingMaterialsWithoutExpectedDate.length,
    pendingAcceptanceCount: pendingAcceptancePlans.length,
    overdueAcceptanceCount: overdueAcceptancePlans.length,
    pendingAcceptanceWithoutPlannedDateCount: pendingAcceptanceWithoutPlannedDate.length,
    staleKnownDateCandidateCount: staleConditionTargetDateCount + overdueMaterials.length + overdueAcceptancePlans.length,
    forecastOnlyBridgeCounts: context.forecastOnlyBridgeCounts ?? {
      drawingPackageScheduleImpact: 0,
      constructionDrawingScheduleImpact: 0,
      certificateWorkItemGate: 0,
    },
    forecastOnlyBridgeSources: context.forecastOnlyBridgeSources ?? [],
    impactModeBreakdown: {
      add_days: days,
      condition_blocking_dates: conditionStartDateCandidates.map((candidate) => ({
        source: candidate.source,
        date: candidate.date.toISOString().slice(0, 10),
      })),
      blocking_start: materialBlockingStartDate ? materialBlockingStartDate.toISOString().slice(0, 10) : null,
      finish_lag: acceptanceFinishLagDate ? acceptanceFinishLagDate.toISOString().slice(0, 10) : null,
      confidence_only_count: unmetConditions.length > 0 && hardUnmetConditions.length === 0 ? unmetConditions.length : 0,
      stale_known_date_count: staleConditionTargetDateCount + overdueMaterials.length + overdueAcceptancePlans.length,
      forecast_only_bridge_sources: context.forecastOnlyBridgeSources ?? [],
    },
  }
}

function buildExternalReadinessImpactSignals(
  context: ForecastExternalReadinessContext,
  obstacleRows: ForecastObstacleRow[],
  externalImpact: ReturnType<typeof externalReadinessImpactDays>,
  obstacleImpact: ReturnType<typeof obstacleImpactDays>,
  forecastDelayDays?: number | null,
  task?: ForecastTaskRow | null,
) {
  const taskOwnerUnitId = normalizeId(task?.participant_unit_id)
  const conditionSignals = buildConditionImpactSignals(context.conditions.map((condition) => ({
    ...condition,
    participant_unit_id: condition.participant_unit_id ?? taskOwnerUnitId,
  })))
  const obstacleSignals = buildObstacleImpactSignals(obstacleRows)
  const acceptanceSignals = context.acceptancePlans.flatMap((plan) => {
    if (Array.isArray(plan.impact_signals) && plan.impact_signals.length > 0) return plan.impact_signals
    return buildAcceptancePlanImpactSignals({
      planId: normalizeId(plan.id) || '',
      status: plan.status,
      plannedDate: plan.planned_date,
      upstreamUnfinishedCount: Number(plan.upstream_unfinished_count ?? 0),
      blockedRequirementCount: Number(plan.blocked_requirement_count ?? 0),
      requirementReadyPercent: Number(plan.requirement_ready_percent ?? 100),
      isOverdue: Boolean(plan.is_overdue),
      gateHint: plan.gate_hint ?? plan.gate_type,
      participantUnitId: plan.participant_unit_id ?? taskOwnerUnitId,
    })
  })

  const criticalProjection = resolveLiveTaskCriticalityProjection(task)
  return summarizeDelayImpactSignals([
    ...conditionSignals,
    ...obstacleSignals,
    ...acceptanceSignals,
  ], {
    forecastDelayDays,
    unknownBlockerCount: Number(externalImpact.unknownStartBlockerCount ?? 0)
      + Number(obstacleImpact.criticalWithoutResolveDateCount ?? 0),
    staleKnownDateCount: Number(externalImpact.staleKnownDateCandidateCount ?? 0),
    taskCriticality: {
      isCritical: criticalProjection.isCritical,
      totalFloatDays: task?.total_float_days ?? null,
      freeFloatDays: task?.free_float_days ?? null,
      successorCount: task?.successor_count ?? null,
      milestoneDistanceDays: task?.milestone_distance_days ?? task?.downstream_milestone_distance_days ?? null,
      criticalityWeight: task?.criticality_weight,
      basis: criticalProjection.basis,
    },
  })
}

function buildSignalForecastImpact(
  impactSignalSummary: ReturnType<typeof buildExternalReadinessImpactSignals>,
  startAnchor: Date,
  calendar: WorkCalendarContext,
) {
  let addDays = 0
  let startWaitDays = 0
  let acceptanceFinishWaitDays = 0
  let confidenceOnlyCount = 0
  const addDaysByOwnership: Record<string, number> = {}
  const modeBreakdown: Record<string, number> = {
    add_days: 0,
    multiplier: 0,
    start_wait: 0,
    finish_gate: 0,
    confidence_only: 0,
  }
  const ownershipBreakdown: Record<string, number> = {}
  const knownDateCandidates: Array<{ signalId: string; source: string; date: string; waitDays: number }> = []

  for (const signal of impactSignalSummary.signals) {
    modeBreakdown[signal.impactMode] = (modeBreakdown[signal.impactMode] ?? 0) + 1
    ownershipBreakdown[signal.impactOwnership] = (ownershipBreakdown[signal.impactOwnership] ?? 0) + 1
    if (signal.impactMode === 'confidence_only' || signal.runtimePolicy === 'confidence_only') {
      confidenceOnlyCount += 1
      continue
    }

    const expectedDate = parseDate(signal.expectedDate)
    if ((signal.impactMode === 'start_wait' || signal.impactMode === 'finish_gate') && expectedDate && expectedDate >= startOfUtcDay(startAnchor)) {
      const waitDays = productionWaitDays(startAnchor, expectedDate, calendar)
      knownDateCandidates.push({
        signalId: signal.signalId,
        source: `${signal.sourceAlgorithm}:${signal.sourceCategory}`,
        date: expectedDate.toISOString().slice(0, 10),
        waitDays,
      })
      if (signal.impactMode === 'finish_gate') {
        acceptanceFinishWaitDays = Math.max(acceptanceFinishWaitDays, waitDays)
      } else {
        startWaitDays = Math.max(startWaitDays, waitDays)
      }
      continue
    }

    if (signal.impactMode === 'add_days') {
      const signalAddDays = signal.severity === 'critical' ? 3 : signal.severity === 'warning' ? 2 : 1
      addDays += signalAddDays
      addDaysByOwnership[signal.impactOwnership] = (addDaysByOwnership[signal.impactOwnership] ?? 0) + signalAddDays
    }
  }

  return {
    addDays: Math.min(14, addDays),
    addDaysByOwnership,
    startWaitDays,
    acceptanceFinishWaitDays,
    acceptanceFinishRemainingDays: acceptanceFinishWaitDays > 0 ? acceptanceFinishWaitDays + 1 : 0,
    confidenceOnlyCount,
    uncertaintyIndex: impactSignalSummary.uncertaintyIndex,
    knownDateCandidates,
    modeBreakdown,
    ownershipBreakdown,
  }
}

function chooseMaturity(
  candidates: ForecastCandidate[],
  snapshots: ForecastSnapshotRow[],
  task: ForecastTaskRow | null,
  velocityLearning: ProgressVelocityLearningResult | null,
  now: Date,
  calendar?: WorkCalendarContext | null,
): ForecastMaturity {
  if (velocityLearning && velocityLearning.sampleCount >= 2 && velocityLearning.confidenceLevel !== 'low') return 'L2'
  const hasExecutionCandidate = candidates.some((candidate) => candidate.key === 'spi_eac' || candidate.key === 'recent_velocity')
  const actualStart = parseDate(task?.actual_start_date)
  const elapsedDays = actualStart ? productionDaysBetweenInclusive(actualStart, now, calendar) : 0
  if (hasExecutionCandidate || snapshots.length >= 3 || elapsedDays >= 7) return 'L1'
  return 'L0'
}

function weightForCandidate(candidate: ForecastCandidate, maturity: ForecastMaturity, profile: ForecastModelProfile) {
  return Number(profile.candidateWeights[maturity]?.[candidate.key] ?? DEFAULT_CANDIDATE_WEIGHTS[maturity]?.[candidate.key] ?? 0)
}

function weightedCandidateDays(candidates: ForecastCandidate[], maturity: ForecastMaturity, profile: ForecastModelProfile) {
  const weighted = candidates
    .map((candidate) => ({ candidate, weight: weightForCandidate(candidate, maturity, profile) }))
    .filter((item) => item.weight > 0)

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) return null
  const normalizedWeights = weighted.map((item) => ({
    candidate: item.candidate,
    normalizedWeight: item.weight / totalWeight,
  }))

  return {
    days: normalizedWeights.reduce((sum, item) => sum + item.candidate.days * item.normalizedWeight, 0),
    curveAdjustedDays: (curve: number) => normalizedWeights.reduce((sum, item) => (
      sum + item.candidate.days * item.normalizedWeight * curve
    ), 0),
    weights: normalizedWeights.map((item) => ({
      key: item.candidate.key,
      days: item.candidate.days,
      weight: round(item.normalizedWeight, 3),
      reason: item.candidate.reason,
    })),
  }
}

function biasAwareTailCandidates(
  candidates: ForecastCandidate[],
  curveType: ProgressCurveType,
  progress: number,
  referenceCandidate: ForecastCandidate | null,
) {
  if (!referenceCandidate) return candidates
  const shouldReserveTail = curveType === 'back_heavy' || (curveType === 's_curve' && progress >= 85)
  if (!shouldReserveTail) return candidates
  const floorDays = referenceCandidate.days
  const filtered = candidates.filter((candidate) => (
    candidate.key === 'reference_ratio'
    || candidate.days >= floorDays
  ))
  return filtered.length > 0 ? filtered : candidates
}

function candidateSpreadSignal(candidates: ForecastCandidate[], maturity: ForecastMaturity, profile: ForecastModelProfile) {
  const positiveDays = candidates
    .filter((candidate) => weightForCandidate(candidate, maturity, profile) > 0)
    .map((candidate) => candidate.days)
    .filter((days) => Number.isFinite(days) && days > 0)
  if (positiveDays.length < 2) {
    return { ratio: null as number | null, confidenceDelta: 0, riskIndexDelta: 0, reason: null as string | null }
  }

  const minDays = Math.min(...positiveDays)
  const maxDays = Math.max(...positiveDays)
  const ratio = round(maxDays / minDays)
  if (ratio > 3) {
    return {
      ratio,
      confidenceDelta: -18,
      riskIndexDelta: 0.08,
      reason: 'ͬԤ·ϴ󣬽ʵֳ',
    }
  }
  if (ratio > 2) {
    return {
      ratio,
      confidenceDelta: -10,
      riskIndexDelta: 0,
      reason: '不同预测路径存在明显差异，预测可信度已下调。',
    }
  }

  return { ratio, confidenceDelta: 0, riskIndexDelta: 0, reason: null as string | null }
}

function contextImpactFromFactorSummary(factorSummary?: DurationContextSummary | null): ForecastContextImpact {
  const factors = Array.isArray(factorSummary?.factors) ? factorSummary.factors : []
  const effectiveContext = factorSummary && factorSummary.calculationContext?.factor_contribution_ledger?.length
    ? summarizeEffectiveDurationContextContributions(factorSummary, {
      includeConfidenceOnly: true,
      includeCandidateOnly: true,
    })
    : null
  const effectiveByKey = new Map<DurationContextFactorKey, typeof effectiveContext extends null ? never : NonNullable<typeof effectiveContext>['contributions'][number]>()
  effectiveContext?.contributions.forEach((entry) => {
    if (!effectiveByKey.has(entry.key)) effectiveByKey.set(entry.key, entry)
  })
  const appliedFactors: Array<Record<string, unknown>> = []
  let days = 0
  let multiplierImpact = 1
  let accelerationMultiplier = 1
  const rawConfidenceDelta = effectiveContext
    ? effectiveContext.rawConfidenceDelta
    : Number(factorSummary?.rawConfidenceDelta ?? factorSummary?.confidenceDelta ?? 0) || 0
  const confidenceDelta = effectiveContext
    ? effectiveContext.confidenceDelta
    : Number(factorSummary?.confidenceDelta ?? 0) || 0
  let lowConfidenceFactorCount = 0
  let planReferenceFallbackFactorCount = 0

  for (const factor of factors) {
    const key = String(factor.key ?? '')
    const effective = effectiveByKey.get(key as DurationContextFactorKey)
    const extraDays = Math.max(0, Number((effective?.extraDays ?? factor.extraDays) ?? 0) || 0)
    const multiplier = Number((effective?.multiplier ?? factor.multiplier) ?? 1)
    const factorConfidenceDelta = Number((effective?.confidenceDelta ?? factor.confidenceDelta) ?? 0) || 0
    const actionPolicy = String(effective?.actionPolicy ?? factor.actionPolicy ?? '')
    const confidenceOnly = actionPolicy === 'confidence_only'
    const metadata = factor.metadata && typeof factor.metadata === 'object' ? factor.metadata as Record<string, unknown> : {}
    const planReferenceFallbackRecommended = metadata.planReferenceFallbackRecommended === true
      || metadata.plan_reference_fallback_recommended === true
      || metadata.planReferenceFallbackPolicy === 'plan_reference_ratio_only'
      || metadata.plan_reference_fallback_policy === 'plan_reference_ratio_only'

    if (confidenceOnly || factorConfidenceDelta <= -10) lowConfidenceFactorCount += 1
    if (planReferenceFallbackRecommended) planReferenceFallbackFactorCount += 1

    let factorDays = 0
    if (!confidenceOnly) {
      if (['resource_conflict', 'workflow_sequence', 'process_constraint'].includes(key)) {
        factorDays += extraDays
        if (extraDays <= 0 && Number.isFinite(multiplier) && multiplier > 1.01) {
          multiplierImpact = Math.max(multiplierImpact, Math.min(multiplier, 1.25))
        }
      }
      if (key === 'external_readiness') {
        // Conditions, materials, acceptance plans and obstacles are counted by dedicated task facts below.
        factorDays += Math.min(2, extraDays)
      }
      if (key === 'project_schedule_state' && Number.isFinite(multiplier) && multiplier > 0 && multiplier < 0.999) {
        accelerationMultiplier = Math.min(accelerationMultiplier, Math.max(0.85, multiplier))
      }
    }

    if (factorDays > 0 || factorConfidenceDelta !== 0 || confidenceOnly) {
      appliedFactors.push({
        key,
        label: factor.label ?? key,
        days: factorDays,
        confidenceDelta: factorConfidenceDelta,
        actionPolicy,
        contributionMode: effective?.contributionMode ?? null,
        suppressedByFactorKey: effective?.suppressedByFactorKey ?? null,
        planReferenceFallbackRecommended,
        reason: factor.reason ?? null,
      })
    }

    days += factorDays
  }

  return {
    days: Math.min(10, Math.max(0, Math.ceil(days))),
    multiplier: round(multiplierImpact),
    accelerationMultiplier: round(accelerationMultiplier),
    confidenceDelta: clamp(confidenceDelta, -25, 15),
    rawConfidenceDelta,
    appliedFactors,
    lowConfidenceFactorCount,
    planReferenceFallbackRecommended: planReferenceFallbackFactorCount > 0,
    planReferenceFallbackFactorCount,
    businessReasons: Array.isArray(factorSummary?.businessReasons) ? factorSummary.businessReasons.slice(0, 3) : [],
  }
}

function buildPlanRisk(plannedEnd: Date | null, progress: number, forecastFinish: Date | null, now: Date, calendar?: WorkCalendarContext | null): ForecastPlanRisk {
  if (!plannedEnd || progress >= 100) {
    return { overdueWorkdays: 0, daysUntilPlannedEnd: null, nearDue: false, riskIndexDelta: 0, confidenceDelta: 0, reason: null }
  }

  const today = startOfUtcDay(now)
  const plannedEndDay = startOfUtcDay(plannedEnd)
  const overdueWorkdays = plannedEndDay < today
    ? delayProductionDaysAfter(plannedEndDay, today, calendar)
    : 0
  const daysUntilPlannedEnd = plannedEndDay >= today
    ? productionDaysBetweenInclusive(today, plannedEndDay, calendar)
    : null
  const forecastDelay = delayProductionDaysAfter(plannedEnd, forecastFinish, calendar)
  const nearDue = !overdueWorkdays && daysUntilPlannedEnd != null && daysUntilPlannedEnd <= 3 && forecastDelay > 0

  if (overdueWorkdays > 0) {
    return {
      overdueWorkdays,
      daysUntilPlannedEnd,
      nearDue: false,
      riskIndexDelta: clamp(0.12 + overdueWorkdays / 28, 0, 0.35),
      confidenceDelta: -Math.min(18, 6 + overdueWorkdays),
      reason: `任务已超过计划完成日 ${overdueWorkdays} 个有效施工日。`,
    }
  }

  if (nearDue) {
    return {
      overdueWorkdays: 0,
      daysUntilPlannedEnd,
      nearDue: true,
      riskIndexDelta: 0.12,
      confidenceDelta: -6,
      reason: `距离计划完成日仅剩 ${daysUntilPlannedEnd} 个有效施工日，但系统仍预测存在剩余工作。`,
    }
  }

  return { overdueWorkdays: 0, daysUntilPlannedEnd, nearDue: false, riskIndexDelta: 0, confidenceDelta: 0, reason: null }
}

function isUnstartedOverdueScenario(params: {
  progress: number
  actualStart: Date | null
  plannedStart: Date | null
  plannedEnd: Date | null
  today: Date
}) {
  if (params.progress > 0 || params.actualStart) return false
  return Boolean(
    (params.plannedStart && params.plannedStart < params.today)
    || (params.plannedEnd && params.plannedEnd < params.today),
  )
}

function knownDependencyStartCandidates(dependencyImpact: ReturnType<typeof dependencyPropagationImpactDays>) {
  return dependencyImpact.blockingDependencies
    .filter((dependency) => dependency['constraintType'] !== 'finish')
    .map((dependency) => parseDate(dependency['availableStartDate']))
    .filter((date): date is Date => Boolean(date))
    .map((date) => ({ source: 'dependency_forecast_finish', date }))
}

function uniqueIds(values: Array<unknown>) {
  return [...new Set(values.map(normalizeId).filter((value): value is string => Boolean(value)))]
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function loadRowsByIds<T>(table: string, select: string, ids: string[]): Promise<T[]> {
  const unique = uniqueIds(ids)
  if (unique.length === 0) return []
  const rows: T[] = []
  for (const chunk of chunkArray(unique, 50)) {
    try {
      const result = await (supabase as any)
        .from(table)
        .select(select)
        .in('id', chunk)
      if (Array.isArray(result.data)) rows.push(...result.data as T[])
    } catch (error) {
      logger.warn('[taskDurationForecastService] failed to load linked forecast-only source rows', { table, ids: chunk, error })
    }
  }
  return rows
}

function isOpenProjectEntityLink(link: ForecastProjectEntityLinkRow) {
  return normalizeStatus(link.status || 'active') === 'active'
}

function linkedSourceIds(links: ForecastProjectEntityLinkRow[], sourceTypes: string[]) {
  const sourceTypeSet = new Set(sourceTypes)
  return uniqueIds(links
    .filter(isOpenProjectEntityLink)
    .filter((link) => sourceTypeSet.has(normalizeStatus(link.source_entity_type)))
    .map((link) => link.source_entity_id))
}

function drawingSourceDate(row: ForecastConstructionDrawingRow) {
  return normalizeDate(row.planned_pass_date ?? row.planned_submit_date ?? row.drawing_date ?? row.review_date)
}

function isDrawingSourceReady(row: ForecastConstructionDrawingRow) {
  if (normalizeBoolean(row.is_ready_for_construction)) return true
  if (row.actual_pass_date) return true
  const status = normalizeStatus(row.status)
  const reviewStatus = normalizeStatus(row.review_status)
  return ['approved', 'passed', 'issued', '已通过', '通过', '已出图'].includes(status)
    || ['approved', 'passed', '已通过', '通过'].includes(reviewStatus)
}

function isDrawingSourceScheduleImpact(row: ForecastConstructionDrawingRow) {
  if (normalizeBoolean(row.schedule_impact_flag)) return true
  return !isDrawingSourceReady(row) && Boolean(drawingSourceDate(row))
}

function isDrawingPackageReady(row: ForecastDrawingPackageRow) {
  if (normalizeBoolean(row.is_ready_for_construction)) return true
  const status = normalizeStatus(row.status)
  return ['approved', 'passed', 'issued', 'ready', 'completed', '已通过', '通过', '已出图', '已完成'].includes(status)
}

function pickLatestDate(values: Array<unknown>) {
  return values
    .map(parseDate)
    .filter((date): date is Date => Boolean(date))
    .reduce<Date | null>((latest, date) => maxDate(latest, date), null)
    ?.toISOString()
    .slice(0, 10) ?? null
}

function buildDrawingBridgeConditions(params: {
  links: ForecastProjectEntityLinkRow[]
  packages: ForecastDrawingPackageRow[]
  drawings: ForecastConstructionDrawingRow[]
}): { conditions: ForecastConditionRow[]; packageCount: number; drawingCount: number } {
  const directlyLinkedPackageIds = new Set(linkedSourceIds(params.links, ['drawing_package']))
  const directlyLinkedDrawingIds = new Set(linkedSourceIds(params.links, ['construction_drawing']))
  const drawingsByPackageId = new Map<string, ForecastConstructionDrawingRow[]>()
  for (const drawing of params.drawings) {
    const packageId = normalizeId(drawing.package_id)
    if (!packageId) continue
    const current = drawingsByPackageId.get(packageId) ?? []
    current.push(drawing)
    drawingsByPackageId.set(packageId, current)
  }

  const packageConditions = params.packages.flatMap((pkg): ForecastConditionRow[] => {
    const packageId = normalizeId(pkg.id)
    if (!packageId || !directlyLinkedPackageIds.has(packageId) || isDrawingPackageReady(pkg)) return []
    const packageDrawings = drawingsByPackageId.get(packageId) ?? []
    const scheduleImpact = normalizeBoolean(pkg.schedule_impact_flag)
      || Number(pkg.missing_required_count ?? 0) > 0
      || packageDrawings.some(isDrawingSourceScheduleImpact)
    if (!scheduleImpact) return []
    const date = pickLatestDate(packageDrawings.map(drawingSourceDate))
    if (!date) return []
    return [{
      id: `forecast-bridge:drawing-package:${packageId}`,
      condition_type: 'drawing',
      name: normalizeText(pkg.package_name) || normalizeText(pkg.package_code) || 'Drawing package schedule gate',
      status: 'open',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      drawing_package_id: packageId,
      drawing_package_code: pkg.package_code ?? null,
      source_entity_type: 'drawing_package',
      source_entity_id: packageId,
      target_date: date,
    }]
  })

  const drawingConditions = params.drawings.flatMap((drawing): ForecastConditionRow[] => {
    const drawingId = normalizeId(drawing.id)
    if (!drawingId || !directlyLinkedDrawingIds.has(drawingId) || isDrawingSourceReady(drawing) || !isDrawingSourceScheduleImpact(drawing)) return []
    const date = drawingSourceDate(drawing)
    if (!date) return []
    return [{
      id: `forecast-bridge:construction-drawing:${drawingId}`,
      condition_type: 'drawing',
      name: normalizeText(drawing.drawing_name) || 'Construction drawing schedule gate',
      status: 'open',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: 'hard',
      drawing_package_id: drawing.package_id ?? null,
      drawing_package_code: drawing.package_code ?? null,
      source_entity_type: 'construction_drawing',
      source_entity_id: drawingId,
      target_date: date,
    }]
  })

  return {
    conditions: [...packageConditions, ...drawingConditions],
    packageCount: packageConditions.length,
    drawingCount: drawingConditions.length,
  }
}

function certificateSourceDate(row: ForecastCertificateWorkItemRow) {
  return normalizeDate(row.planned_finish_date ?? row.next_action_due_date)
}

function isCertificateWorkItemClosed(row: ForecastCertificateWorkItemRow) {
  if (row.actual_finish_date) return true
  return ['approved', 'issued', 'closed', 'completed', 'voided', 'expired', '已取得', '已完成', '已关闭'].includes(normalizeStatus(row.status))
}

function buildCertificateBridgeConditions(rows: ForecastCertificateWorkItemRow[]): ForecastConditionRow[] {
  return rows.flatMap((row): ForecastConditionRow[] => {
    const id = normalizeId(row.id)
    if (!id || isCertificateWorkItemClosed(row)) return []
    const date = certificateSourceDate(row)
    if (!date && !normalizeBoolean(row.is_blocked)) return []
    return [{
      id: `forecast-bridge:certificate-work-item:${id}`,
      condition_type: 'certificate',
      name: normalizeText(row.item_name ?? row.certificate_name ?? row.name ?? row.title) || 'Certificate work item gate',
      status: 'open',
      is_satisfied: false,
      required_for_start: true,
      blocking_level: normalizeBoolean(row.is_blocked) ? 'blocked' : 'hard',
      source_entity_type: 'certificate_work_item',
      source_entity_id: id,
      target_date: date,
    }]
  })
}

async function loadForecastOnlyBridgeConditions(taskId: string, projectId: string): Promise<{
  conditions: ForecastConditionRow[]
  counts: NonNullable<ForecastExternalReadinessContext['forecastOnlyBridgeCounts']>
  sources: string[]
}> {
  const links = await (supabase as any)
    .from('project_entity_links')
    .select('id, project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type, status, display_snapshot, metadata')
    .eq('target_entity_type', 'task')
    .eq('target_entity_id', taskId)
    .eq('project_id', projectId)
    .then((result: any) => Array.isArray(result.data) ? result.data as ForecastProjectEntityLinkRow[] : [], (error: unknown) => {
      logger.warn('[taskDurationForecastService] failed to load task entity links for forecast-only readiness bridges', { taskId, error })
      return []
    })

  const drawingPackageIds = linkedSourceIds(links, ['drawing_package'])
  const directDrawingIds = linkedSourceIds(links, ['construction_drawing'])
  const certificateWorkItemIds = linkedSourceIds(links, ['certificate_work_item', 'pre_milestone'])

  const [packages, directDrawings, certificateWorkItems] = await Promise.all([
    loadRowsByIds<ForecastDrawingPackageRow>(
      'drawing_packages',
      'id, package_code, package_name, status, requires_review, completeness_ratio, missing_required_count, current_version_drawing_id, schedule_impact_flag, is_ready_for_construction',
      drawingPackageIds,
    ),
    loadRowsByIds<ForecastConstructionDrawingRow>(
      'construction_drawings',
      'id, package_id, package_code, drawing_name, status, review_status, schedule_impact_flag, is_ready_for_construction, planned_submit_date, planned_pass_date, actual_pass_date, drawing_date, review_date',
      directDrawingIds,
    ),
    loadRowsByIds<ForecastCertificateWorkItemRow>(
      'certificate_work_items',
      'id, item_name, certificate_name, name, title, status, planned_finish_date, actual_finish_date, next_action_due_date, is_blocked, block_reason',
      certificateWorkItemIds,
    ),
  ])
  const packageDrawings = await loadRowsByIds<ForecastConstructionDrawingRow>(
    'construction_drawings',
    'id, package_id, package_code, drawing_name, status, review_status, schedule_impact_flag, is_ready_for_construction, planned_submit_date, planned_pass_date, actual_pass_date, drawing_date, review_date',
    packages.map((pkg) => pkg.current_version_drawing_id),
  )

  const drawingBridge = buildDrawingBridgeConditions({
    links,
    packages,
    drawings: [...directDrawings, ...packageDrawings],
  })
  const certificateConditions = buildCertificateBridgeConditions(certificateWorkItems)
  const sources = [
    drawingBridge.packageCount > 0 ? 'drawing_package_schedule_impact' : null,
    drawingBridge.drawingCount > 0 ? 'construction_drawing_schedule_impact' : null,
    certificateConditions.length > 0 ? 'certificate_work_item_gate' : null,
  ].filter((value): value is string => Boolean(value))

  return {
    conditions: [...drawingBridge.conditions, ...certificateConditions],
    counts: {
      drawingPackageScheduleImpact: drawingBridge.packageCount,
      constructionDrawingScheduleImpact: drawingBridge.drawingCount,
      certificateWorkItemGate: certificateConditions.length,
    },
    sources,
  }
}

function buildUnstartedOverdueRuleImpact(params: {
  applies: boolean
  policy: EarliestStartRulePolicy
  plannedStart: Date | null
  plannedEnd: Date | null
  startAnchor: Date
  today: Date
  obstacleImpact: ReturnType<typeof obstacleImpactDays>
  externalImpact: ReturnType<typeof externalReadinessImpactDays>
  signalImpact?: SignalForecastImpact
  dependencyImpact: ReturnType<typeof dependencyPropagationImpactDays>
  calendar: WorkCalendarContext
  baseExecutionDays: number | null
}): UnstartedOverdueRuleImpact {
  if (!params.applies) {
    return {
      applies: false,
      earliestStartDate: params.startAnchor,
      earliestStartWaitDays: 0,
      knownDateCandidates: [],
      unknownBlockerCount: 0,
      unknownHardConditionCount: 0,
      unknownCriticalObstacleCount: 0,
      unknownDependencyFinishCount: 0,
      unknownMaterialArrivalCount: 0,
      staleKnownDateCandidateCount: 0,
      missedWindowWorkdays: 0,
      plannedStartOverdueWorkdays: 0,
      plannedEndOverdueWorkdays: 0,
      referenceStalenessRatio: null,
      riskIndexDelta: 0,
      confidenceDelta: 0,
      rawMissedWindowConfidencePenalty: 0,
      effectiveMissedWindowConfidencePenalty: 0,
      missedWindowPenaltyDecayApplied: false,
      missedWindowPenaltyDecayRatio: 1,
      missedWindowPenaltyDecayReason: null,
      riskComponents: {},
      reasons: [],
      businessFactorBadges: [],
      policy: params.policy,
    }
  }

  const knownDateCandidates: Array<{ source: string; date: Date }> = []
  if (params.policy.useDependencyForecastFinish) {
    knownDateCandidates.push(...knownDependencyStartCandidates(params.dependencyImpact))
  }
  for (const candidate of params.externalImpact.conditionStartDateCandidates ?? []) {
    const source = String(candidate.source ?? '')
    const allowed = (
      (source === 'hard_condition_target_date' && params.policy.useHardConditionTargetDate)
      || (source === 'drawing_condition_target_date' && params.policy.useDrawingConditionTargetDate)
      || (source === 'certificate_condition_target_date' && params.policy.useCertificateConditionTargetDate)
      || (source === 'acceptance_condition_target_date' && params.policy.useAcceptanceConditionTargetDate)
    )
    if (allowed) knownDateCandidates.push({ source, date: candidate.date })
  }
  if (params.policy.useMaterialExpectedArrival && params.externalImpact.blockingStartDate) {
    knownDateCandidates.push({ source: 'material_expected_arrival', date: params.externalImpact.blockingStartDate })
  }
  if (params.policy.useCriticalObstacleEstimatedResolve && params.obstacleImpact.blockingResolveDate) {
    knownDateCandidates.push({ source: 'critical_obstacle_estimated_resolve', date: params.obstacleImpact.blockingResolveDate })
  }
  for (const candidate of params.signalImpact?.knownDateCandidates ?? []) {
    const date = parseDate(candidate.date)
    if (!date) continue
    const source = candidate.source.includes('obstacle:')
      ? 'critical_obstacle_estimated_resolve'
      : candidate.source.includes('condition:material')
        ? 'material_expected_arrival'
        : candidate.source.includes('condition:drawing')
          ? 'drawing_condition_target_date'
          : candidate.source.includes('condition:certificate')
            ? 'certificate_condition_target_date'
            : candidate.source.includes('condition:acceptance')
              ? 'acceptance_condition_target_date'
              : candidate.source.includes('acceptance:')
                ? 'acceptance_condition_target_date'
                : 'hard_condition_target_date'
    knownDateCandidates.push({ source, date })
  }

  const earliestStartDate = knownDateCandidates.reduce<Date>(
    (latest, candidate) => maxDate(latest, candidate.date) ?? latest,
    params.startAnchor,
  )
  const earliestStartWaitDays = productionWaitDays(params.startAnchor, earliestStartDate, params.calendar)
  const plannedStartOverdue = params.plannedStart && params.plannedStart < params.today
    ? delayProductionDaysAfter(params.plannedStart, params.today, params.calendar)
    : 0
  const plannedEndOverdue = params.plannedEnd && params.plannedEnd < params.today
    ? delayProductionDaysAfter(params.plannedEnd, params.today, params.calendar)
    : 0
  const missedWindowWorkdays = Math.max(plannedStartOverdue, plannedEndOverdue)
  const referenceStalenessRatio = params.baseExecutionDays && params.baseExecutionDays > 0
    ? round(missedWindowWorkdays / params.baseExecutionDays)
    : null
  const stalenessIsCritical = referenceStalenessRatio != null && referenceStalenessRatio > params.policy.referenceStalenessCriticalRatio
  const stalenessIsWarning = referenceStalenessRatio != null && referenceStalenessRatio > params.policy.referenceStalenessWarningRatio
  const referenceStalenessConfidenceDelta = stalenessIsCritical
    ? params.policy.referenceStalenessCriticalConfidenceDelta
    : stalenessIsWarning
      ? params.policy.referenceStalenessWarningConfidenceDelta
      : 0
  const referenceStalenessRiskIndexDelta = stalenessIsCritical
    ? params.policy.referenceStalenessCriticalRiskIndexDelta
    : stalenessIsWarning
      ? params.policy.referenceStalenessWarningRiskIndexDelta
      : 0
  const unknownCriticalObstacleCount = Number(params.obstacleImpact.criticalWithoutResolveDateCount ?? 0)
  const unknownDependencyFinishCount = params.dependencyImpact.blockingDependencies
    .filter((dependency) => dependency['source'] === 'dependency_task_fact')
    .length
  const unknownMaterialArrivalCount = Number(params.externalImpact.pendingMaterialWithoutExpectedDateCount ?? 0)
  const unknownHardConditionCount = Number(params.externalImpact.hardConditionWithoutUsableDateCount ?? 0)
  const staleKnownDateCandidateCount = Number(params.externalImpact.staleKnownDateCandidateCount ?? 0)
  const unknownBlockerCount = params.policy.doNotAddUnknownDateDays
    ? Number(params.externalImpact.unknownStartBlockerCount ?? 0) + unknownCriticalObstacleCount + unknownDependencyFinishCount
    : 0
  const unknownBlockerConfidencePenalty = Math.min(
    params.policy.unknownBlockerConfidencePenaltyMax,
    unknownBlockerCount * params.policy.unknownBlockerConfidencePenaltyPerItem,
  )
  const missedWindowOverflowRisk = missedWindowWorkdays > params.policy.missedWindowRiskWindowWorkdays
    ? Math.ceil((missedWindowWorkdays - params.policy.missedWindowRiskWindowWorkdays) / params.policy.missedWindowRiskWindowWorkdays)
      * params.policy.missedWindowOverflowRiskPerWindow
    : 0
  const rawMissedWindowConfidencePenalty = params.policy.confidencePenaltyBase
    + (Math.ceil(missedWindowWorkdays / 5) * params.policy.confidencePenaltyPerFiveWorkdays)
  const penaltyDecay = springFestivalPenaltyDecay({
    plannedStart: params.plannedStart,
    plannedEnd: params.plannedEnd,
    today: params.today,
    calendar: params.calendar,
    policy: params.policy,
  })
  const effectiveMissedWindowConfidencePenalty = penaltyDecay.applied
    ? Math.ceil(rawMissedWindowConfidencePenalty * penaltyDecay.ratio)
    : rawMissedWindowConfidencePenalty
  const confidenceDelta = -Math.min(
    35,
    effectiveMissedWindowConfidencePenalty
      + unknownBlockerConfidencePenalty,
  ) + referenceStalenessConfidenceDelta
  const riskComponents = {
    base: params.policy.riskIndexDelta,
    missedWindow: clamp(
      (missedWindowWorkdays / params.policy.missedWindowRiskWindowWorkdays) * params.policy.missedWindowRiskBase,
      0,
      params.policy.missedWindowRiskBase,
    ),
    missedWindowOverflow: missedWindowOverflowRisk,
    criticalObstacleUnknownDate: unknownCriticalObstacleCount > 0 ? params.policy.criticalUnknownRiskIndexDelta : 0,
    dependencyUnknownFinish: unknownDependencyFinishCount > 0 ? params.policy.dependencyUnknownRiskIndexDelta : 0,
    materialUnknownArrival: unknownMaterialArrivalCount > 0 ? params.policy.materialUnknownRiskIndexDelta : 0,
    unknownDateItems: Math.min(0.35, unknownBlockerCount * params.policy.unknownDateRiskIndexDeltaPerItem),
    staleKnownDateCandidates: Math.min(0.2, staleKnownDateCandidateCount * params.policy.unknownDateRiskIndexDeltaPerItem),
    referenceStaleness: referenceStalenessRiskIndexDelta,
  }
  const riskIndexDelta = clamp(
    Object.values(riskComponents).reduce((sum, value) => sum + value, 0),
    0,
    0.9,
  )
  const blockingSourceLabels: Record<string, string> = {
    hard_condition_target_date: '开工硬条件目标时间',
    drawing_condition_target_date: '图纸条件目标时间',
    certificate_condition_target_date: '证照条件目标时间',
    acceptance_condition_target_date: '验收/移交条件目标时间',
    dependency_forecast_finish: '前置任务预计完成时间',
    material_expected_arrival: '材料预计到场时间',
    critical_obstacle_estimated_resolve: '关键阻碍预计解除时间',
  }
  const activeBlockingSources = Array.from(new Set(
    knownDateCandidates
      .filter((candidate) => calendarDateText(candidate.date) === calendarDateText(earliestStartDate))
      .map((candidate) => blockingSourceLabels[candidate.source] ?? candidate.source),
  ))
  const overdueReason = params.plannedStart
    ? `任务原计划 ${calendarDateText(params.plannedStart)} 开工，已逾期 ${plannedStartOverdue} 个有效施工日未开工。`
    : `任务尚未实际开工，已错过计划窗口 ${missedWindowWorkdays} 个有效施工日。`
  const blockedByReason = earliestStartWaitDays > 0
    ? `最早可开工日被${activeBlockingSources.join('、') || '现场条件'}推迟至 ${calendarDateText(earliestStartDate)}。`
    : '当前没有明确日期会继续推迟最早可开工日，按今天起算参考工期。'

  return {
    applies: true,
    earliestStartDate,
    earliestStartWaitDays,
    knownDateCandidates: knownDateCandidates.map((candidate) => ({
      source: candidate.source,
      date: calendarDateText(candidate.date),
    })),
    unknownBlockerCount,
    unknownHardConditionCount,
    unknownCriticalObstacleCount,
    unknownDependencyFinishCount,
    unknownMaterialArrivalCount,
    staleKnownDateCandidateCount,
    missedWindowWorkdays,
    plannedStartOverdueWorkdays: plannedStartOverdue,
    plannedEndOverdueWorkdays: plannedEndOverdue,
    referenceStalenessRatio,
    riskIndexDelta,
    confidenceDelta,
    rawMissedWindowConfidencePenalty,
    effectiveMissedWindowConfidencePenalty,
    missedWindowPenaltyDecayApplied: penaltyDecay.applied,
    missedWindowPenaltyDecayRatio: penaltyDecay.ratio,
    missedWindowPenaltyDecayReason: penaltyDecay.reason,
    riskComponents,
    reasons: uniqueTopFactors([
      overdueReason,
      plannedEndOverdue > 0
        ? `任务计划完成日也已逾期 ${plannedEndOverdue} 个有效施工日，未开工风险已升级。`
        : null,
      blockedByReason,
      unknownBlockerCount > 0
        ? `有 ${unknownBlockerCount} 项开工相关问题缺少明确日期，系统只降低预测可信度，不凭空增加工期。`
        : null,
      staleKnownDateCandidateCount > 0
        ? `有 ${staleKnownDateCandidateCount} 项已过期但未解除的开工日期事实，系统按失效日期处理，不继续作为最早开工日。`
        : null,
      stalenessIsWarning
        ? '任务久未开工，参考工期基于较早计划窗口，预测可信度已下调。'
        : null,
    ]),
    businessFactorBadges: [
      {
        type: plannedEndOverdue > 0 ? 'unstarted_overdue_completion_window' : 'unstarted_overdue_days',
        label: plannedEndOverdue > 0
          ? `计划完成日已逾期 ${plannedEndOverdue} 个有效施工日且仍未开工`
          : `已逾期 ${missedWindowWorkdays} 个有效施工日未开工`,
        severity: plannedEndOverdue > 0 || missedWindowWorkdays >= 10 ? 'high' : 'medium',
      },
      earliestStartWaitDays > 0
        ? {
          type: 'awaiting_earliest_start',
          label: `等待${activeBlockingSources.join('、') || '现场条件'}解除`,
          severity: 'medium' as const,
        }
        : null,
      unknownBlockerCount > 0
        ? {
          type: 'unknown_start_blocker_dates',
          label: `${unknownBlockerCount} 项开工问题缺少明确日期`,
          severity: 'medium' as const,
        }
        : null,
      staleKnownDateCandidateCount > 0
        ? {
          type: 'stale_start_blocker_dates',
          label: `${staleKnownDateCandidateCount} 项开工日期已过期未解除`,
          severity: 'medium' as const,
        }
        : null,
      stalenessIsWarning
        ? {
          type: 'execution_reference_stale',
          label: '参考工期基于较早计划窗口',
          severity: stalenessIsCritical ? 'high' as const : 'medium' as const,
        }
        : null,
    ].filter((item): item is BusinessFactorBadge => Boolean(item)),
    policy: params.policy,
  }
}

function scoreToForecastConfidenceLevel(score: number) {
  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  if (score > 0) return 'low'
  return 'unavailable'
}

function computeForecastConfidenceScore(params: {
  referenceConfidenceScore: number | null
  maturity: ForecastMaturity
  candidates: ForecastCandidate[]
  snapshots: ForecastSnapshotRow[]
  anomalySignals: ProgressAnomalySignal[]
  obstacleImpact: ReturnType<typeof obstacleImpactDays>
  externalImpact: ReturnType<typeof externalReadinessImpactDays>
  dependencyImpact: ReturnType<typeof dependencyPropagationImpactDays>
  contextImpact: ForecastContextImpact
  planRisk: ForecastPlanRisk
  workCalendar: WorkCalendarContext
  modelProfile: ForecastModelProfile
  progress: number
}) {
  let score = clamp(Number(params.referenceConfidenceScore ?? 50), 10, 90)
  if (params.maturity === 'L2') score += 8
  if (params.maturity === 'L0') score -= 15
  if (params.candidates.length >= 3) score += 5
  if (params.candidates.length <= 1) score -= 8

  const normalizedSnapshots = normalizeSnapshots(params.snapshots)
  if (params.progress > 0 && params.progress < 100) {
    if (normalizedSnapshots.length >= 3) score += 4
    else score -= 10
  }

  const anomalyPenalty = params.anomalySignals.reduce((sum, signal) => {
    if (signal.severity === 'critical') return sum + 18
    if (signal.severity === 'warning') return sum + 12
    return sum + 8
  }, 0)
  score -= Math.min(25, anomalyPenalty)
  score -= Math.min(20, params.obstacleImpact.days * 1.5 + params.obstacleImpact.criticalCount * 4)
  score -= Math.min(18, params.externalImpact.days)
  score -= Math.min(12, params.dependencyImpact.maxWaitDays * 0.5)
  score -= Math.min(10, Number(params.dependencyImpact.staleForecastCount ?? 0) * 4)
  score -= Math.min(8, Number(params.obstacleImpact.confidenceOnlyCount ?? 0) * 2)
  score -= Math.min(8, Number(params.externalImpact.confidenceOnlyCount ?? 0) * 2)
  score += params.contextImpact.confidenceDelta
  score += params.planRisk.confidenceDelta
  score += params.workCalendar.basis === 'official_construction_calendar_seed' ? 2 : -3
  score = 50 + ((score - 50) * params.modelProfile.confidenceWeight)

  return Math.round(clamp(score, 5, 95))
}

function uniqueTopFactors(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))).slice(0, 8)
}

async function buildRemainingForecastModel(params: {
  taskId: string
  task: ForecastTaskRow | null
  input: Record<string, unknown>
  recommendedDurationDays: number | null
  conservativeDurationDays: number | null
  referenceConfidenceLevel?: string | null
  referenceConfidenceScore?: number | null
  factorSummary?: DurationContextSummary | null
  calculationContext?: DurationContextSummary['calculationContext'] | null
  businessReasonParams?: Record<string, unknown> | null
  snapshots: ForecastSnapshotRow[]
  obstacles: ForecastObstacleRow[]
  dependencyContext: ForecastDependencyContext
  externalReadiness: ForecastExternalReadinessContext
  workCalendar: WorkCalendarContext
  velocityLearning: ProgressVelocityLearningResult | null
  modelProfile: ForecastModelProfile
  earliestStartRule: EarliestStartRulePolicy
  forecastOptions: NormalizedForecastOptions
  now?: Date
}): Promise<ForecastModelResult> {
  const now = params.now ?? new Date()
  const today = startOfUtcDay(now)
  const progress = clampProgress(params.input.progress)
  const plannedEnd = parseDate(params.input.plannedEndDate)
  const actualEnd = parseDate(params.input.actualEndDate)
  const plannedStart = parseDate(params.input.plannedStartDate)
  const actualStart = parseDate(params.input.actualStartDate)
  const isUnstartedOverdue = isUnstartedOverdueScenario({
    progress,
    actualStart,
    plannedStart,
    plannedEnd,
    today,
  })
  const loadedLearnableParameterRuntimeGate = await loadTaskRemainingForecastParameterRuntimeGate(params.task)
  const runtimeParameterApplication = applyTaskRemainingForecastRuntimeParameters(
    params.modelProfile,
    loadedLearnableParameterRuntimeGate,
  )
  const modelProfile = runtimeParameterApplication.modelProfile
  const learnableParameterRuntimeGate = runtimeParameterApplication.runtimeGate
  const learnableParameterRegistry = buildTaskRemainingForecastLearnableParameterRegistry(modelProfile)

  if (isCompletedTask({
    status: params.task?.status,
    progress,
    actual_end_date: params.input.actualEndDate as string | null | undefined,
  })) {
    const finish = actualEnd ?? plannedEnd ?? today
    const forecastDelayDays = delayProductionDaysAfter(plannedEnd, finish, params.workCalendar)
    return {
      optimisticRemainingDays: 0,
      remainingDurationDays: 0,
      conservativeRemainingDays: 0,
      forecastFinishDate: finish.toISOString().slice(0, 10),
      forecastDelayDays,
      delayRiskIndex: forecastDelayDays > 0 ? clamp(forecastDelayDays / 14, 0, 1) : 0,
      confidenceLevel: params.referenceConfidenceLevel ?? 'high',
      confidenceScore: clamp(Number(params.referenceConfidenceScore ?? 90), 50, 95),
      dataMaturity: 'L1',
      businessFactorBadges: [],
      topFactors: ['任务已经完成，预测结果以实际完成日期为准。'],
      probabilityDuration: null,
      forecastSources: {
        candidates: [],
        completed: true,
        calendarBasis: params.workCalendar.basis,
        forecastOptions: params.forecastOptions,
        modelProfile: {
          id: modelProfile.id,
          key: modelProfile.modelKey,
          version: modelProfile.modelVersion,
          source: modelProfile.source,
        },
        learnableParameterRegistry,
        learnableParameterRuntimeGate,
      },
      calculationContext: {
        ...params.calculationContext,
        remaining_duration_forecast: { completed: true },
      },
    }
  }

  const anomalySignals = detectProgressAnomalySignals(params.snapshots)
  const referenceTotal = positiveCeil(params.recommendedDurationDays)
    ?? plannedProductionDurationDays(params.task, params.workCalendar)
    ?? positiveCeil(params.conservativeDurationDays)
  const curveType = resolveProgressCurve(params.task, modelProfile)
  const referenceCandidate = buildReferenceRatioCandidate(referenceTotal, progress, curveType)
  const rawCandidates = [
    referenceCandidate,
    buildSpiCandidate(params.task, referenceTotal, progress, now, params.workCalendar, curveType),
    buildRecentVelocityCandidate(params.snapshots, anomalySignals, progress, now, params.workCalendar, curveType),
    buildHistoryVelocityCandidate(referenceCandidate, params.velocityLearning),
  ].filter((candidate): candidate is ForecastCandidate => Boolean(candidate))
  const contextImpact = contextImpactFromFactorSummary(params.factorSummary)
  const taskSemantic = resolveTaskGateStatusDateSemantic(params.task)
  const referenceOnlyCandidates = rawCandidates.filter((candidate) => candidate.key === 'reference_ratio')
  const candidatePool = contextImpact.planReferenceFallbackRecommended || taskSemantic.applies
    ? referenceOnlyCandidates
    : rawCandidates
  const candidates = biasAwareTailCandidates(candidatePool, curveType, progress, referenceCandidate)

  const maturity = chooseMaturity(candidates, params.snapshots, params.task, params.velocityLearning, now, params.workCalendar)
  const weighted = weightedCandidateDays(candidates, maturity, modelProfile)
  const weightedBaseDays = weighted?.days ?? referenceCandidate?.days ?? positiveCeil(referenceTotal) ?? null
  const curve = isUnstartedOverdue ? 1 : curveMultiplier(curveType, progress, modelProfile)
  const curveAdjustedBaseDays = weighted?.curveAdjustedDays(curve)
    ?? (weightedBaseDays == null ? null : weightedBaseDays * curve)
  const rawObstacleImpact = obstacleImpactDays(params.obstacles, now)
  const stuckFloor = stuckFinishingFloorDays(anomalySignals, params.snapshots, curveType, modelProfile)
  const executionMultiplier = isUnstartedOverdue ? 1 : Math.max(1, contextImpact.multiplier)
  const scheduleStateAccelerationMultiplier = isUnstartedOverdue ? 1 : contextImpact.accelerationMultiplier
  const adjustedBase = curveAdjustedBaseDays ? Math.max(1, Math.ceil(curveAdjustedBaseDays * executionMultiplier * scheduleStateAccelerationMultiplier)) : null
  const unstartedBaseExecutionDays = isUnstartedOverdue
    ? positiveCeil(params.recommendedDurationDays) ?? positiveCeil(referenceTotal) ?? adjustedBase
    : null
  const startAnchor = progress > 0
    ? today
    : plannedStart && plannedStart > today
      ? plannedStart
      : actualStart ?? today
  const rawExternalImpact = externalReadinessImpactDays(params.externalReadiness, now)
  const dependencyImpact = dependencyPropagationImpactDays({
    context: params.dependencyContext,
    startAnchor,
    selfExecutionDays: unstartedBaseExecutionDays ?? adjustedBase,
    now,
    calendar: params.workCalendar,
  })
  const provisionalForecastFinish = adjustedBase == null
    ? null
    : parseDate(addConstructionProductionDays(startAnchor, adjustedBase, params.workCalendar))
  const provisionalForecastDelayDays = delayProductionDaysAfter(plannedEnd, provisionalForecastFinish, params.workCalendar)
  const impactSignalSummary = buildExternalReadinessImpactSignals(
    params.externalReadiness,
    params.obstacles,
    rawExternalImpact,
    rawObstacleImpact,
    provisionalForecastDelayDays,
    params.task,
  )
  const signalImpact = buildSignalForecastImpact(impactSignalSummary, startAnchor, params.workCalendar)
  const obstacleSignalAddDays = Math.min(14, signalImpact.addDaysByOwnership.obstacle ?? 0)
  const externalSignalAddDays = Math.max(0, signalImpact.addDays - obstacleSignalAddDays)
  const obstacleImpact = {
    ...rawObstacleImpact,
    days: obstacleSignalAddDays,
    additiveDays: obstacleSignalAddDays,
    multiplier: 1,
    blockingResolveDate: null as Date | null,
    confidenceOnlyCount: params.obstacles.length > 0 ? signalImpact.confidenceOnlyCount : 0,
    impactModeBreakdown: {
      ...rawObstacleImpact.impactModeBreakdown,
      add_days: obstacleSignalAddDays,
      multiplier: 1,
      blocking_start: null,
      confidence_only_count: params.obstacles.length > 0 ? signalImpact.confidenceOnlyCount : 0,
    },
  }
  const externalImpact = {
    ...rawExternalImpact,
    days: externalSignalAddDays,
    additiveDays: externalSignalAddDays,
    blockingStartDate: null as Date | null,
    acceptanceFinishLagDate: null as Date | null,
    confidenceOnlyCount: Math.max(0, signalImpact.confidenceOnlyCount - obstacleImpact.confidenceOnlyCount),
    impactModeBreakdown: {
      ...rawExternalImpact.impactModeBreakdown,
      add_days: externalSignalAddDays,
      blocking_start: null,
      finish_lag: null,
      confidence_only_count: Math.max(0, signalImpact.confidenceOnlyCount - obstacleImpact.confidenceOnlyCount),
      signal_modes: signalImpact.modeBreakdown,
      signal_ownership: signalImpact.ownershipBreakdown,
    },
  }
  const obstacleBlockingWaitDays = 0
  const externalBlockingWaitDays = signalImpact.startWaitDays
  const acceptanceFinishWaitDays = signalImpact.acceptanceFinishWaitDays
  const acceptanceFinishRemainingDays = signalImpact.acceptanceFinishRemainingDays
  const unstartedRuleImpact = buildUnstartedOverdueRuleImpact({
    applies: isUnstartedOverdue,
    policy: params.earliestStartRule,
    plannedStart,
    plannedEnd,
    startAnchor,
    today,
    obstacleImpact,
    externalImpact,
    signalImpact,
    dependencyImpact,
    calendar: params.workCalendar,
    baseExecutionDays: unstartedBaseExecutionDays ?? adjustedBase,
  })
  const hardStartWaitDays = unstartedRuleImpact.applies ? unstartedRuleImpact.earliestStartWaitDays : Math.max(
    dependencyImpact.maxWaitDays,
    obstacleBlockingWaitDays,
    externalBlockingWaitDays,
  )
  const dependencyFloorRemainingDays = unstartedRuleImpact.applies ? 0 : dependencyImpact.floorRemainingDays ?? 0
  const additiveSiteDays = unstartedRuleImpact.applies ? 0 : obstacleImpact.days + externalImpact.days + contextImpact.days
  const baseWithSiteFactors = adjustedBase == null
    ? null
    : adjustedBase + additiveSiteDays + Math.max(obstacleBlockingWaitDays, externalBlockingWaitDays)
  const hardFloorRemainingDays = adjustedBase == null
    ? null
    : hardStartWaitDays + adjustedBase
  const mainRemaining = unstartedRuleImpact.applies
    ? unstartedBaseExecutionDays == null
      ? null
      : unstartedRuleImpact.earliestStartWaitDays + unstartedBaseExecutionDays
    : adjustedBase == null
      ? null
      : Math.max(
      stuckFloor.floorDays,
      baseWithSiteFactors ?? 0,
      hardFloorRemainingDays
        ? hardFloorRemainingDays + additiveSiteDays
        : 0,
      dependencyFloorRemainingDays,
      acceptanceFinishRemainingDays,
      )
  const optimisticExecutionDays = referenceCandidate?.days ?? adjustedBase
  const optimisticRemaining = unstartedRuleImpact.applies
    ? unstartedBaseExecutionDays == null
      ? mainRemaining
      : unstartedRuleImpact.earliestStartWaitDays + unstartedBaseExecutionDays
    : referenceCandidate
    ? Math.max(
      stuckFloor.floorDays,
      hardStartWaitDays + optimisticExecutionDays,
      dependencyFloorRemainingDays,
      acceptanceFinishRemainingDays,
    )
    : mainRemaining
  const conservativeBaseline = params.conservativeDurationDays
    ? buildReferenceRatioCandidate(params.conservativeDurationDays, progress, curveType)?.days ?? null
    : null
  const conservativeExecutionDays = unstartedRuleImpact.applies
    ? positiveCeil(params.conservativeDurationDays) ?? (unstartedBaseExecutionDays ? Math.ceil(unstartedBaseExecutionDays * 1.15) : 0)
    : Math.max(
      conservativeBaseline ? Math.ceil(conservativeBaseline * curve * executionMultiplier) : 0,
      adjustedBase ? Math.ceil(adjustedBase * 1.15) : 0,
    )
  const conservativeConfidenceBuffer = (maturity === 'L0' ? 3 : 0)
    + (contextImpact.lowConfidenceFactorCount > 0 ? 2 : 0)
    + Math.min(4, obstacleImpact.confidenceOnlyCount + externalImpact.confidenceOnlyCount)
  const conservativeRemaining = unstartedRuleImpact.applies
    ? mainRemaining == null
      ? null
      : Math.max(mainRemaining, unstartedRuleImpact.earliestStartWaitDays + conservativeExecutionDays)
    : mainRemaining == null
      ? null
      : Math.max(
      mainRemaining,
      hardStartWaitDays + conservativeExecutionDays + additiveSiteDays + conservativeConfidenceBuffer,
      dependencyFloorRemainingDays,
      acceptanceFinishRemainingDays + conservativeConfidenceBuffer,
      stuckFloor.floorDays ? stuckFloor.floorDays + 3 : 0,
      )

  const rawRemainingDurationDays = mainRemaining == null ? null : candidateDays(mainRemaining)
  const relativeBaselineDays = remainingForecastRelativeBaselineDays(params.task, params.workCalendar, referenceTotal)
  const recommendedCap = capTaskRemainingForecastDays({
    days: rawRemainingDurationDays,
    baselineDays: relativeBaselineDays,
    task: params.task,
    ruleId: 'duration.max.task_remaining_relative_to_plan',
  })
  const remainingDurationDays = recommendedCap.days
  const probabilityDuration = buildProbabilityDurationWindow({
    calculationContext: params.calculationContext as Record<string, unknown> | null,
    businessReasonParams: params.businessReasonParams,
    recommendedDurationDays: params.recommendedDurationDays,
    conservativeDurationDays: params.conservativeDurationDays,
    progress,
    remainingDurationDays,
    progressCurveType: curveType,
    progressCurveMultiplier: curve,
  })
  const forecastFinish = remainingDurationDays == null
    ? null
    : parseDate(addConstructionProductionDays(startAnchor, remainingDurationDays, params.workCalendar))
  const forecastFinishDate = forecastFinish?.toISOString().slice(0, 10) ?? null
  const forecastDelayDays = delayProductionDaysAfter(plannedEnd, forecastFinish, params.workCalendar)
  const planRisk = buildPlanRisk(plannedEnd, progress, forecastFinish, now, params.workCalendar)
  impactSignalSummary.confirmedDelayDays = impactSignalSummary.dedupedCount > 0 ? forecastDelayDays : 0
  impactSignalSummary.weightedConfirmedDelayDays = round(
    impactSignalSummary.confirmedDelayDays * Number(impactSignalSummary.criticality?.criticalityWeight ?? 1),
  )
  const candidateSpread = candidateSpreadSignal(candidates, maturity, modelProfile)
  const dependencyDiagnostics = dependencyDiagnosticReasons(dependencyImpact.diagnostics)
  const forecastConfidenceScore = Math.round(clamp(computeForecastConfidenceScore({
    referenceConfidenceScore: params.referenceConfidenceScore ?? null,
    maturity,
    candidates,
    snapshots: params.snapshots,
    anomalySignals,
    obstacleImpact,
    externalImpact,
    dependencyImpact,
    contextImpact,
    planRisk,
    workCalendar: params.workCalendar,
    modelProfile,
    progress,
  })
    + unstartedRuleImpact.confidenceDelta
    + candidateSpread.confidenceDelta
    - (dependencyDiagnostics.length > 0 ? 8 : 0), 5, 95))
  const forecastConfidenceLevel = scoreToForecastConfidenceLevel(forecastConfidenceScore)
  const delayRiskIndex = round(clamp(
    (forecastDelayDays / 14)
    + (unstartedRuleImpact.applies ? 0 : obstacleImpact.days / 14)
    + (unstartedRuleImpact.applies ? 0 : externalImpact.days / 20)
    + (unstartedRuleImpact.applies ? 0 : contextImpact.days / 20)
    + (dependencyImpact.maxWaitDays / 21)
    + planRisk.riskIndexDelta
    + unstartedRuleImpact.riskIndexDelta
    + (stuckFloor.floorDays > 0 ? 0.25 : 0)
    + (dependencyImpact.staleForecastCount > 0 ? 0.06 : 0)
    + (contextImpact.lowConfidenceFactorCount > 0 ? 0.08 : 0)
    + candidateSpread.riskIndexDelta
    + Math.min(0.18, impactSignalSummary.uncertaintyIndex * 0.18)
    + (maturity === 'L0' ? 0.08 : 0),
    0,
    1,
  ))

  const topFactors = uniqueTopFactors([
    ...unstartedRuleImpact.reasons,
    candidates.find((candidate) => candidate.key === 'spi_eac' && referenceCandidate && candidate.days > referenceCandidate.days * 1.2)
      ? '实际进展慢于计划节奏，预计剩余时间需要上调。'
      : null,
    candidates.find((candidate) => candidate.key === 'recent_velocity' && referenceCandidate && candidate.days > referenceCandidate.days * 1.3)
      ? '最近进度快照显示现场推进速度偏慢。'
      : null,
    stuckFloor.floorDays > 0
      ? `任务在收尾阶段已停滞 ${stuckFloor.stuckDays || '多'} 天，已启用长尾兜底。`
      : null,
    !unstartedRuleImpact.applies && obstacleImpact.count > 0
      ? `存在 ${obstacleImpact.count} 项未关闭阻碍，已计入执行缓冲和风险判断。`
      : null,
    !unstartedRuleImpact.applies && Object.entries(obstacleImpact.typeBreakdown).find(([type, value]) => type !== 'general' && value.count > 0)
      ? '阻碍类型会直接影响现场剩余工期。'
      : null,
    dependencyImpact.count > 0
      ? `有 ${dependencyImpact.count} 项前置任务未完成，最早可继续施工时间被后移。`
      : null,
    dependencyImpact.staleForecastCount > 0
      ? '部分前置任务预测不是当天结果，预测可信度已下调。'
      : null,
    !unstartedRuleImpact.applies && externalImpact.hardUnmetConditionCount > 0
      ? `还有 ${externalImpact.hardUnmetConditionCount} 项关键开工条件未满足，已计入执行缓冲。`
      : null,
    !unstartedRuleImpact.applies && externalImpact.pendingMaterialCount > 0
      ? `有 ${externalImpact.pendingMaterialCount} 项关联材料尚未就绪。`
      : null,
    !unstartedRuleImpact.applies && externalImpact.pendingAcceptanceCount > 0
      ? `有 ${externalImpact.pendingAcceptanceCount} 项关联验收事项尚未闭合。`
      : null,
    curve !== 1
      ? `系统按当前工序节奏特征修正了剩余工期。`
      : null,
    params.velocityLearning && params.velocityLearning.sampleCount >= 2
      ? `已参考 ${params.velocityLearning.sampleCount} 条同类已完成任务速度样本。`
      : null,
    !unstartedRuleImpact.applies && contextImpact.days > 0
      ? `现场上下文因素增加 ${contextImpact.days} 天执行缓冲。`
      : null,
    contextImpact.lowConfidenceFactorCount > 0
      ? '部分现场信号质量不足，预测可信度已下调。'
      : null,
    candidateSpread.reason,
    contextImpact.planReferenceFallbackRecommended
      ? '进度质量异常较重，执行进度候选已限制为计划参考比例路径。'
      : null,
    planRisk.reason,
    ...dependencyDiagnostics,
    ...contextImpact.businessReasons,
  ])
  const businessFactorBadges: BusinessFactorBadge[] = [
    ...unstartedRuleImpact.businessFactorBadges,
    candidateSpread.reason
      ? {
        type: 'forecast_candidate_spread',
        label: `预测路径差异 ${candidateSpread.ratio} 倍`,
        severity: (candidateSpread.riskIndexDelta > 0 ? 'high' : 'medium') as BusinessFactorBadge['severity'],
      }
      : null,
    dependencyDiagnostics.length > 0
      ? {
        type: 'dependency_structure_diagnostic',
        label: '依赖关系需要核实',
        severity: 'medium' as const,
      }
      : null,
    contextImpact.planReferenceFallbackRecommended
      ? {
        type: 'progress_quality_plan_reference_fallback',
        label: '进度数据异常，按计划参考比例预测',
        severity: 'high' as const,
      }
      : null,
  ].filter((item): item is BusinessFactorBadge => Boolean(item))

  const forecastSources = {
    dataMaturity: maturity,
    taskSemanticMode: taskSemantic.taskSemanticMode,
    gateRelation: taskSemantic.gateRelation,
    taskSemanticBasis: {
      durationContributionMode: taskSemantic.durationContributionMode,
      qualityControlRole: taskSemantic.qualityControlRole,
      inspectionAcceptanceRole: taskSemantic.inspectionAcceptanceRole,
      documentEvidenceRole: taskSemantic.documentEvidenceRole,
      linearExecutionCandidatesSuppressed: taskSemantic.applies,
      suppressionPolicy: taskSemantic.applies
        ? 'gate_status_date_semantics_do_not_use_spi_eac_or_velocity_extrapolation'
        : null,
    },
    candidates: candidates.map((candidate) => ({ key: candidate.key, days: candidate.days, reason: candidate.reason })),
    candidateSpread,
    weights: weighted?.weights ?? [],
    weightedBaseRemainingDays: weightedBaseDays == null ? null : round(weightedBaseDays),
    curveType,
    curveMultiplier: curve,
    executionMultiplier,
    hardStartWaitDays,
    siteStartWaitDays: Math.max(obstacleBlockingWaitDays, externalBlockingWaitDays),
    acceptanceFinishWaitDays,
    acceptanceFinishRemainingDays,
    additiveSiteDays,
    impactModeBreakdown: {
      obstacle: obstacleImpact.impactModeBreakdown,
      externalReadiness: externalImpact.impactModeBreakdown,
      context: {
        add_days: contextImpact.days,
        multiplier: contextImpact.multiplier,
        acceleration_multiplier: contextImpact.accelerationMultiplier,
        confidence_delta: contextImpact.confidenceDelta,
      },
      dependency: {
        blocking_start_wait_days: dependencyImpact.maxWaitDays,
        stale_forecast_count: dependencyImpact.staleForecastCount,
      },
    },
    forecastPaths: {
      optimistic: {
        basis: unstartedRuleImpact.applies ? '最早可开工日 + 参考工期' : '参考工期 + 硬性起算等待',
        remainingDays: optimisticRemaining == null ? null : candidateDays(optimisticRemaining),
      },
      recommended: {
        basis: unstartedRuleImpact.applies ? '最早可开工日 + 执行参考工期' : '候选加权 + 工序曲线 + 现场影响',
        remainingDays: remainingDurationDays,
      },
      conservative: {
        basis: unstartedRuleImpact.applies ? '最早可开工日 + 保守参考工期' : '保守参考工期 + 全部现场风险 + 低置信缓冲',
        remainingDays: conservativeRemaining == null ? null : candidateDays(conservativeRemaining),
      },
    },
    probabilityDuration,
    unstartedOverdueRule: {
      applies: unstartedRuleImpact.applies,
      stableCode: unstartedRuleImpact.policy.stableCode,
      source: unstartedRuleImpact.policy.source,
      earliestStartDate: calendarDateText(unstartedRuleImpact.earliestStartDate),
      earliestStartWaitDays: unstartedRuleImpact.earliestStartWaitDays,
      knownDateCandidates: unstartedRuleImpact.knownDateCandidates,
      unknownBlockerCount: unstartedRuleImpact.unknownBlockerCount,
      unknownHardConditionCount: unstartedRuleImpact.unknownHardConditionCount,
      unknownCriticalObstacleCount: unstartedRuleImpact.unknownCriticalObstacleCount,
      unknownDependencyFinishCount: unstartedRuleImpact.unknownDependencyFinishCount,
      unknownMaterialArrivalCount: unstartedRuleImpact.unknownMaterialArrivalCount,
      staleKnownDateCandidateCount: unstartedRuleImpact.staleKnownDateCandidateCount,
      missedWindowWorkdays: unstartedRuleImpact.missedWindowWorkdays,
      plannedStartOverdueWorkdays: unstartedRuleImpact.plannedStartOverdueWorkdays,
      plannedEndOverdueWorkdays: unstartedRuleImpact.plannedEndOverdueWorkdays,
      referenceStalenessRatio: unstartedRuleImpact.referenceStalenessRatio,
      confidenceDelta: unstartedRuleImpact.confidenceDelta,
      rawMissedWindowConfidencePenalty: unstartedRuleImpact.rawMissedWindowConfidencePenalty,
      effectiveMissedWindowConfidencePenalty: unstartedRuleImpact.effectiveMissedWindowConfidencePenalty,
      missedWindowPenaltyDecayApplied: unstartedRuleImpact.missedWindowPenaltyDecayApplied,
      missedWindowPenaltyDecayRatio: unstartedRuleImpact.missedWindowPenaltyDecayRatio,
      missedWindowPenaltyDecayReason: unstartedRuleImpact.missedWindowPenaltyDecayReason,
      riskIndexDelta: unstartedRuleImpact.riskIndexDelta,
      riskComponents: unstartedRuleImpact.riskComponents,
      businessFactorBadges: unstartedRuleImpact.businessFactorBadges,
      noSyntheticUnknownDateDays: unstartedRuleImpact.policy.doNotAddUnknownDateDays,
    },
    obstacleImpactDays: obstacleImpact.days,
    obstacleCount: obstacleImpact.count,
    obstacleTypeBreakdown: obstacleImpact.typeBreakdown,
    externalReadinessImpactDays: externalImpact.days,
    externalReadiness: externalImpact,
    contextImpactDays: contextImpact.days,
    scheduleStateAccelerationMultiplier,
    contextImpact,
    planReferenceFallbackRecommended: contextImpact.planReferenceFallbackRecommended,
    planReferenceFallbackFactorCount: contextImpact.planReferenceFallbackFactorCount,
    dependencyPropagationImpactDays: dependencyImpact.maxWaitDays,
    dependencyPropagation: dependencyImpact,
    dependencyDiagnostics: dependencyImpact.diagnostics,
    planRisk,
    stuckFinishingFloorDays: stuckFloor.floorDays,
    snapshotCount: params.snapshots.length,
    anomalySignals: anomalySignals.map((signal) => ({
      code: signal.code,
      severity: signal.severity,
      metadata: signal.metadata,
    })),
    velocityLearning: params.velocityLearning
      ? {
        confidenceLevel: params.velocityLearning.confidenceLevel,
        confidenceScore: params.velocityLearning.confidenceScore,
        sampleCount: params.velocityLearning.sampleCount,
        multiplier: params.velocityLearning.multiplier,
        actionPolicy: params.velocityLearning.actionPolicy,
        groupKey: params.velocityLearning.groupKey,
      }
      : null,
    calendarBasis: params.workCalendar.basis,
    calendarWindowCount: params.workCalendar.windows.length,
    forecastOptions: params.forecastOptions,
    impactSignals: impactSignalSummary.signals,
    impactSignalSummary: {
      rawCount: impactSignalSummary.rawCount,
      dedupedCount: impactSignalSummary.dedupedCount,
      duplicates: impactSignalSummary.duplicates,
      confirmedDelayDays: impactSignalSummary.confirmedDelayDays,
      weightedConfirmedDelayDays: impactSignalSummary.weightedConfirmedDelayDays,
      weightedRiskScore: impactSignalSummary.weightedRiskScore,
      criticality: impactSignalSummary.criticality,
      responsibilityBreakdown: impactSignalSummary.responsibilityBreakdown,
      uncertaintyIndex: impactSignalSummary.uncertaintyIndex,
      uncertaintyReasons: impactSignalSummary.uncertaintyReasons,
    },
    confidenceInputs: {
      referenceConfidenceScore: params.referenceConfidenceScore ?? null,
      forecastConfidenceScore,
      forecastConfidenceLevel,
      modelConfidenceWeight: modelProfile.confidenceWeight,
    },
    modelProfile: {
      id: modelProfile.id,
      key: modelProfile.modelKey,
      version: modelProfile.modelVersion,
      source: modelProfile.source,
      runtimeLearnableParameters: asRecord(modelProfile.metadata.runtimeLearnableParameters) ?? null,
      projectOverlay: asRecord(modelProfile.metadata.projectOverlay) ?? null,
    },
    learnableParameterRegistry,
    learnableParameterRuntimeGate,
  }
  const durationPlausibilityWarnings = [
    ...(((params.calculationContext as any)?.durationPlausibilityWarnings ?? []) as DurationPlausibilityWarning[]),
    ...(probabilityDuration?.plausibilityWarnings ?? []),
    ...recommendedCap.warnings,
  ]
  const optimisticCap = capTaskRemainingForecastDays({
    days: optimisticRemaining == null ? null : candidateDays(optimisticRemaining),
    baselineDays: relativeBaselineDays,
    task: params.task,
    ruleId: 'duration.max.task_remaining_optimistic_relative_to_plan',
  })
  const conservativeCap = capTaskRemainingForecastDays({
    days: conservativeRemaining == null ? null : candidateDays(conservativeRemaining),
    baselineDays: relativeBaselineDays,
    task: params.task,
    ruleId: 'duration.max.task_remaining_conservative_relative_to_plan',
  })
  durationPlausibilityWarnings.push(...optimisticCap.warnings, ...conservativeCap.warnings)
  const optimisticRemainingDays = optimisticCap.days == null || remainingDurationDays == null
    ? optimisticCap.days
    : Math.min(optimisticCap.days, remainingDurationDays)
  const conservativeRemainingDays = conservativeCap.days == null || remainingDurationDays == null
    ? conservativeCap.days
    : Math.max(remainingDurationDays, conservativeCap.days)
  if (
    optimisticCap.days != null
    && optimisticRemainingDays != null
    && optimisticRemainingDays !== optimisticCap.days
  ) {
    durationPlausibilityWarnings.push({
      ruleId: 'duration.forecast_paths.optimistic_order',
      severity: 'warning',
      engineCode: 'task_remaining_forecast',
      message: 'Optimistic remaining forecast was ordered so it does not exceed the recommended remaining forecast.',
      originalDays: optimisticCap.days,
      adjustedDays: optimisticRemainingDays,
      taskId: params.task?.id ?? params.taskId,
      title: params.task?.title ?? null,
      standardWorkCode: params.task?.standard_work_code ?? null,
      metadata: {
        recommendedRemainingDays: remainingDurationDays,
      },
    })
  }

  forecastSources.forecastPaths.optimistic.remainingDays = optimisticRemainingDays
  forecastSources.forecastPaths.conservative.remainingDays = conservativeRemainingDays

  return {
    optimisticRemainingDays,
    remainingDurationDays,
    conservativeRemainingDays,
    forecastFinishDate,
    forecastDelayDays,
    delayRiskIndex,
    confidenceLevel: forecastConfidenceLevel,
    confidenceScore: forecastConfidenceScore,
    dataMaturity: maturity,
    topFactors,
    businessFactorBadges,
    forecastSources,
    probabilityDuration,
    calculationContext: {
      ...params.calculationContext,
      remaining_duration_forecast: forecastSources,
      probability_duration: probabilityDuration,
      ...(durationPlausibilityWarnings.length > 0 ? { durationPlausibilityWarnings } : {}),
      delay_risk_index: delayRiskIndex,
      delay_uncertainty_index: impactSignalSummary.uncertaintyIndex,
      top_factors: topFactors,
      business_factor_badges: businessFactorBadges,
    },
  }
}

async function refreshTaskDurationForecast(
  taskId: string,
  task: ForecastTaskRow | null,
  options: NormalizedForecastOptions,
): Promise<TaskDurationForecast> {
  const projectId = normalizeId(task?.project_id)
  if (!projectId) throw new Error('TASK_DURATION_FORECAST_PROJECT_SCOPE_REQUIRED')
  const factInput = await buildForecastProjectGenerationFactInput(task)
  let input = {
    suggestionPurpose: 'execution_reference' as const,
    taskId,
    templateNodeId: task?.template_node_id ?? null,
    wbsNodeType: task?.wbs_node_type ?? 'process',
    engineeringCategoryId: task?.engineering_category_id ?? null,
    standardWorkCode: task?.standard_work_code ?? null,
    standardWorkName: task?.standard_work_name ?? null,
    taskTitle: task?.title ?? null,
    projectId: task?.project_id ?? null,
    plannedStartDate: task?.planned_start_date ?? task?.start_date ?? null,
    plannedEndDate: task?.planned_end_date ?? task?.end_date ?? null,
    actualStartDate: task?.actual_start_date ?? null,
    actualEndDate: task?.actual_end_date ?? null,
    progress: typeof task?.progress === 'number' ? task.progress : Number(task?.progress ?? 0),
    buildingObjectId: task?.building_object_id ?? null,
    floorObjectId: task?.floor_object_id ?? null,
    zoneObjectId: task?.physical_zone_object_id ?? task?.functional_area_object_id ?? null,
    responsibleUnitId: task?.participant_unit_id ?? null,
    acceptanceRequired: task?.acceptance_required ?? null,
    materialRequired: task?.material_required ?? null,
    projectGenerationFacts: factInput.projectGenerationFacts,
    projectTypeCode: factInput.projectTypeCode,
    structureTypeCode: factInput.structureTypeCode,
    methodVariantCodes: factInput.methodVariantCodes,
    structuredCauseAuthority: null as TaskStructuredCauseAuthority | null,
    runtimeExecutionFacts: buildForecastRuntimeExecutionFacts(task),
  }

  const snapshotsPromise = loadProgressSnapshots(taskId)
  const obstaclesPromise = loadOpenObstacles(taskId)
  const dependencyContextPromise = loadDependencyContext(taskId, task, options.dependencyDepth)
  const externalReadinessPromise = loadExternalReadinessContext(taskId, projectId)
  const workCalendarPromise = loadWorkCalendar(task)
  const velocityLearningPromise = loadPublishedProgressVelocityRuntime({
      projectId: task?.project_id ?? null,
      consumerKey: 'taskDurationForecastService.history_velocity',
    }).catch((error) => {
      logger.warn('[taskDurationForecastService] published progress velocity unavailable', { taskId, error })
      return null
    })
  const modelProfilePromise = loadForecastModelProfile(task)
  const earliestStartRulePromise = loadEarliestStartRule(task)
  const currentForecastPromise = loadCurrentForecast(taskId, { projectId })
  const structuredCauseAuthorityPromise = loadTaskStructuredCauseAuthority(taskId, projectId)
  const [snapshots, obstacles, structuredCauseAuthority] = await Promise.all([
    snapshotsPromise,
    obstaclesPromise,
    structuredCauseAuthorityPromise,
  ])
  input = {
    ...input,
    structuredCauseAuthority,
    runtimeExecutionFacts: buildForecastRuntimeExecutionFacts(task, snapshots, obstacles),
  }
  const [suggestion, dependencyContext, externalReadiness, workCalendar, velocityLearning, modelProfile, earliestStartRule, currentForecast] = await Promise.all([
    getTaskDurationSuggestion(input),
    dependencyContextPromise,
    externalReadinessPromise,
    workCalendarPromise,
    velocityLearningPromise,
    modelProfilePromise,
    earliestStartRulePromise,
    currentForecastPromise,
  ])
  const effectiveVelocityLearning = hasPublishedProjectBaselineCalibration(suggestion.factorSummary)
    ? null
    : velocityLearning
  let forecastDates = await buildRemainingForecastModel({
    taskId,
    task,
    input,
    recommendedDurationDays: suggestion.recommendedDurationDays,
    conservativeDurationDays: suggestion.conservativeDurationDays,
    referenceConfidenceLevel: suggestion.confidenceLevel,
    referenceConfidenceScore: suggestion.confidenceScore,
    factorSummary: suggestion.factorSummary ?? null,
    calculationContext: suggestion.calculationContext ?? null,
    businessReasonParams: asRecord(suggestion.businessReasonParams),
    snapshots,
    obstacles,
    dependencyContext,
    externalReadiness,
    workCalendar,
    velocityLearning: effectiveVelocityLearning,
    modelProfile,
    earliestStartRule,
    forecastOptions: options,
  })
  const residualOverlays = await loadForecastResidualOverlays(task)
  forecastDates = applyForecastResidualOverlay({
    forecastDates,
    task,
    overlays: residualOverlays,
    workCalendar,
  })
  forecastDates = await applyPlanningReplayCalibrationReadbackToForecast({
    forecastDates,
    task,
    workCalendar,
  })
  forecastDates = withT2RhythmForecastContext({
    forecastDates,
    suggestion,
  })
  let e2DurationInputAssembly: Record<string, unknown> | null = null
  try {
    e2DurationInputAssembly = await buildE2DurationInputAssemblyContext(input, suggestion)
  } catch (error) {
    logger.warn('[taskDurationForecastService] duration input assembly unavailable for E2 remaining forecast', { taskId, error })
  }
  forecastDates = withDurationInputAssemblyForecastContext({
    forecastDates,
    durationInputAssembly: e2DurationInputAssembly,
  })

  await backfillForecastErrorIfCompleted(task, currentForecast, workCalendar)
  const durationOutputContract = remainingForecastOutputContractSummary()
  const executionReferenceDays = suggestion.recommendedDurationDays
  const forecastCalculationContext = {
    ...(forecastDates.calculationContext ?? {}),
    execution_reference_days: executionReferenceDays,
    reference_duration_lifecycle: {
      executionReferenceDays,
      storageField: 'task_duration_forecasts.execution_reference_days',
      recommendedDurationDaysPolicy: 'new_task_reference_only_not_written_by_execution_forecast',
    },
    ...(durationOutputContract ? { durationOutputContract } : {}),
  }

  const forecastPayload = {
    project_id: task?.project_id ?? null,
    task_id: taskId,
    execution_reference_days: executionReferenceDays,
    conservative_duration_days: suggestion.conservativeDurationDays,
    remaining_duration_days: forecastDates.remainingDurationDays,
    forecast_finish_date: forecastDates.forecastFinishDate,
    forecast_delay_days: forecastDates.forecastDelayDays,
    confidence_level: forecastDates.confidenceLevel,
    confidence_score: forecastDates.confidenceScore,
    forecast_source: suggestion.forecastSource,
    forecast_model_profile_id: modelProfile.id,
    model_version: modelProfile.modelVersion,
    weight_profile: {
      candidateWeights: modelProfile.candidateWeights,
      source: modelProfile.source,
      confidenceWeight: modelProfile.confidenceWeight,
    },
    delay_risk_index: forecastDates.delayRiskIndex,
    duration_calibration_source: suggestion.durationCalibrationSource,
    duration_provenance: suggestion.durationProvenance,
    benchmark_key: suggestion.benchmarkKey,
    business_reason: forecastDates.topFactors[0] ?? suggestion.businessReason,
    factor_summary: suggestion.factorSummary ?? null,
    calculation_context: forecastCalculationContext,
    metadata: {
      durationOutputCode: durationOutputContract?.code ?? 'remaining_forecast',
      durationOutputSemanticFieldName: durationOutputContract?.semanticFieldName ?? 'remainingForecastDays',
      executionReferenceDays,
      recommendedDurationDaysPolicy: 'new_task_reference_only_not_written_by_execution_forecast',
      optimisticRemainingDays: forecastDates.optimisticRemainingDays,
      conservativeRemainingDays: forecastDates.conservativeRemainingDays,
      probabilityDuration: forecastDates.probabilityDuration,
      delayRiskIndex: forecastDates.delayRiskIndex,
      dataMaturity: forecastDates.dataMaturity,
      topFactors: forecastDates.topFactors,
      businessFactorBadges: forecastDates.businessFactorBadges,
      forecastSources: forecastDates.forecastSources,
      planningReplayCalibrationReadback: forecastDates.forecastSources.planningReplayCalibrationReadback ?? null,
      t2RhythmScheduleCandidatePackage: forecastDates.forecastSources.t2RhythmScheduleCandidatePackage ?? null,
      t2RhythmScheduleCandidateNetworkEvaluation: forecastDates.forecastSources.t2RhythmScheduleCandidateNetworkEvaluation ?? null,
      durationInputAssembly: forecastDates.forecastSources.durationInputAssembly ?? null,
      referenceConfidenceLevel: suggestion.confidenceLevel,
      referenceConfidenceScore: suggestion.confidenceScore,
      forecastOptions: options,
    },
    is_current: true,
    generated_at: new Date().toISOString(),
  }

  await recordTaskRemainingForecastPredictionEvent({
    taskId,
    task,
    suggestion,
    forecastDates,
    forecastCalculationContext,
    modelProfile,
    options,
    generatedAt: String(forecastPayload.generated_at),
  })

  if (options.writePolicy !== 'read_only') {
    const currentForecastId = normalizeId(currentForecast?.id)
    if (options.writePolicy === 'update_current' && currentForecastId) {
      await (supabase as any)
        .from('task_duration_forecasts')
        .update(forecastPayload)
        .eq('id', currentForecastId)
    } else {
      await (supabase as any)
        .from('task_duration_forecasts')
        .update({ is_current: false })
        .eq('task_id', taskId)
        .eq('is_current', true)

      await (supabase as any)
        .from('task_duration_forecasts')
        .insert(forecastPayload)
    }
  }

  logger.info('Duration forecast refreshed', { taskId, source: suggestion.forecastSource, triggerContext: options.triggerContext })

  const forecast = withRemainingForecastOutputContract({
    taskId,
    recommendedDurationDays: executionReferenceDays,
    executionReferenceDays,
    conservativeDurationDays: suggestion.conservativeDurationDays,
    optimisticRemainingDays: forecastDates.optimisticRemainingDays,
    remainingDurationDays: forecastDates.remainingDurationDays,
    conservativeRemainingDays: forecastDates.conservativeRemainingDays,
    probabilityDuration: forecastDates.probabilityDuration,
    forecastFinishDate: forecastDates.forecastFinishDate,
    forecastDelayDays: forecastDates.forecastDelayDays,
    delayRiskIndex: forecastDates.delayRiskIndex,
    confidenceLevel: forecastDates.confidenceLevel,
    confidenceScore: forecastDates.confidenceScore,
    forecastSource: suggestion.forecastSource,
    durationCalibrationSource: suggestion.durationCalibrationSource,
    durationProvenance: suggestion.durationProvenance,
    businessReason: forecastDates.topFactors[0] ?? suggestion.businessReason,
    factorSummary: suggestion.factorSummary ?? null,
    calculationContext: forecastCalculationContext as unknown as TaskDurationForecast['calculationContext'],
    dataMaturity: forecastDates.dataMaturity,
    topFactors: forecastDates.topFactors,
    businessFactorBadges: forecastDates.businessFactorBadges,
    forecastSources: forecastDates.forecastSources,
  })
  return forecast
}

export async function forecastTaskDuration(taskId: string, options?: ForecastTaskDurationOptions): Promise<TaskDurationForecast> {
  const normalizedOptions = normalizeForecastOptions(options)
  if (normalizedOptions.useCache) {
    const currentForecast = await loadCurrentForecast(taskId, normalizedOptions)
    if (isFreshCurrentForecast(currentForecast)) {
      return mapCurrentForecastToTaskDurationForecast(taskId, currentForecast)
    }
  }

  const task = await loadTask(taskId, normalizedOptions)
  const forecast = await refreshTaskDurationForecast(taskId, task, normalizedOptions)
  const runtimeArtifactPublications = buildTaskDurationForecastRuntimeArtifactPublications(forecast)
  const artifacts = buildTaskDurationForecastConsumedArtifacts({
    forecast,
    runtimeArtifactPublications,
    projectId: task?.project_id ?? null,
    taskId: forecast.taskId,
  })
  try {
    const projectIdForEvidence = normalizeText(task?.project_id)
    const taskIdForEvidence = normalizeText(forecast.taskId)
    await recordTaskDurationForecastConsumedArtifacts({
      queryExec: createDurationRuntimeConsumerObservationQueryExec(
        normalizedOptions.runtimeConsumerObservationQueryExec,
      ),
      callContext: {
        projectId: projectIdForEvidence || null,
        taskId: taskIdForEvidence || null,
        forecastFinishDate: forecast.forecastFinishDate,
        remainingDurationDays: forecast.remainingDurationDays,
        conservativeRemainingDays: forecast.conservativeRemainingDays ?? null,
        confidenceLevel: forecast.confidenceLevel,
        confidenceScore: forecast.confidenceScore,
        runtimeAssetMode: artifacts.length > 0 ? 'published_artifact' : 'no_published_artifact',
        runtimeArtifactCount: artifacts.length,
      },
      sourceEvidenceRefs: [
        [
          'task_duration_forecast',
          projectIdForEvidence || 'no_project',
          taskIdForEvidence || 'no_task',
          forecast.forecastFinishDate ?? 'no_finish',
        ].join(':'),
      ],
      artifacts,
    })
  } catch (error) {
    logger.warn('[taskDurationForecastService] failed to record task duration runtime consumer evidence', {
      taskId: forecast.taskId,
      projectId: task?.project_id ?? null,
      error,
    })
  }
  return forecast
}

function toGovernedDurationForecastSignal(forecast: TaskDurationForecast) {
  const durationOutputCode = forecast.durationOutputCode ?? 'remaining_forecast'
  const durationOutputSemanticFieldName = forecast.durationOutputSemanticFieldName ?? 'remainingForecastDays'
  const remainingForecastDays = forecast.remainingForecastDays ?? null

  return {
    taskId: forecast.taskId,
    durationOutputCode,
    durationOutputSemanticFieldName,
    remainingForecastDays,
    conservativeDurationDays: forecast.conservativeDurationDays,
    forecastFinishDate: forecast.forecastFinishDate,
    forecastDelayDays: forecast.forecastDelayDays,
    delayRiskIndex: forecast.delayRiskIndex ?? null,
    confidenceLevel: forecast.confidenceLevel,
    confidenceScore: forecast.confidenceScore,
    businessReason: forecast.businessReason,
    dataMaturity: forecast.dataMaturity ?? null,
    topFactors: forecast.topFactors ?? null,
    businessFactorBadges: forecast.businessFactorBadges ?? null,
  }
}

export async function analyzeTaskDelayRiskWithDurationForecast(
  taskId: string,
  workspaceScope: TaskForecastWorkspaceScope,
) {
  const normalizedScope = normalizeForecastOptions(workspaceScope)
  const [task, forecast, obstacleCount] = await Promise.all([
    loadTask(taskId, normalizedScope),
    forecastTaskDuration(taskId, normalizedScope),
    countOpenObstacles(taskId),
  ])

  const progress = clampProgress(task?.progress)
  const forecastDelayDays = Number(forecast.forecastDelayDays ?? 0)
  const delayRiskIndex = forecast.delayRiskIndex ?? Math.max(
    0,
    Math.min(1, (forecastDelayDays / 14) + (obstacleCount * 0.12) + (progress < 30 && forecastDelayDays > 0 ? 0.15 : 0)),
  )
  const delayRisk = delayRiskIndex >= 0.7 ? 'high' : delayRiskIndex >= 0.4 ? 'medium' : 'low'
  const riskFactors = [
    forecastDelayDays > 0 ? `预计完成时间可能比当前计划晚 ${forecastDelayDays} 天。` : null,
    obstacleCount > 0 ? `当前还有 ${obstacleCount} 项未关闭阻碍可能影响执行。` : null,
    ...(forecast.topFactors ?? []),
    forecast.factorSummary?.businessReasons?.[0] ?? null,
  ].filter(Boolean)

  return {
    task_id: taskId,
    task_title: String(task?.title ?? ''),
    progress_deviation: 0,
    durationOutputCode: forecast.durationOutputCode ?? 'remaining_forecast',
    durationOutputSemanticFieldName: forecast.durationOutputSemanticFieldName ?? 'remainingForecastDays',
    remainingForecastDays: forecast.remainingForecastDays ?? null,
    obstacle_count: obstacleCount,
    delay_probability: Math.round(delayRiskIndex * 100) / 100,
    delay_risk_index: Math.round(delayRiskIndex * 100) / 100,
    delay_risk: delayRisk,
    risk_level: delayRisk,
    risk_factors: riskFactors,
    recommendations: delayRisk === 'high'
      ? ['优先核查关键阻碍、材料就绪、验收时间轴状态和当前现场推进节奏。']
      : ['继续跟踪当前执行节奏，必要时在任务详情查看剩余工期预测。'],
    duration_forecast: toGovernedDurationForecastSignal(forecast),
  }
}

export async function forecastBatchTasks(taskIds: string[], options?: ForecastTaskDurationOptions): Promise<TaskDurationForecast[]> {
  const uniqueTaskIds = [...new Set(taskIds.map(normalizeId).filter((id): id is string => Boolean(id)))]
  const results: Array<TaskDurationForecast | null> = Array(uniqueTaskIds.length).fill(null)
  const normalizedOptions = normalizeForecastOptions({
    triggerContext: options?.triggerContext ?? 'system_batch',
    ...options,
  })

  let cursor = 0
  const worker = async () => {
    while (cursor < uniqueTaskIds.length) {
      const index = cursor
      cursor += 1
      const id = uniqueTaskIds[index]
      try {
        results[index] = await forecastTaskDuration(id, normalizedOptions)
      } catch (err) {
        logger.error('Failed to forecast task duration', { taskId: id, error: err })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FORECAST_BATCH_CONCURRENCY, uniqueTaskIds.length) }, () => worker()),
  )

  return results.filter((forecast): forecast is TaskDurationForecast => Boolean(forecast))
}

export async function listCurrentTaskDurationForecasts(
  taskIds: string[],
  options: { maxAgeMs?: number | null } & TaskForecastWorkspaceScope,
): Promise<TaskDurationForecast[]> {
  const uniqueTaskIds = [...new Set(taskIds.map(normalizeId).filter((id): id is string => Boolean(id)))]
  const forecastMap = await loadCurrentForecasts(uniqueTaskIds, options)
  const maxAgeMs = options?.maxAgeMs ?? null
  return uniqueTaskIds
    .map((taskId) => {
      const forecast = forecastMap.get(taskId)
      if (!forecast) return null
      if (typeof maxAgeMs === 'number') {
        const timestampValue = forecast.generated_at ?? forecast.created_at
        const timestamp = timestampValue ? new Date(String(timestampValue)) : null
        if (!timestamp || Number.isNaN(timestamp.getTime()) || Date.now() - timestamp.getTime() > maxAgeMs) return null
      }
      return mapCurrentForecastToTaskDurationForecast(taskId, forecast)
    })
    .filter((forecast): forecast is TaskDurationForecast => Boolean(forecast))
}

export type DailyTaskDurationForecastRefreshOptions = {
  limit?: number
  batchSize?: number
  maxRuntimeMs?: number
  freshnessSloMs?: number
}

export type DailyTaskDurationForecastRefreshResult = {
  scanned: number
  refreshed: number
  failed: number
  skippedByTimeBudget: number
  batchSize: number
  maxRuntimeMs: number
  durationMs: number
  batchesAttempted: number
  freshnessSloMs: number
  staleCurrentForecastsBefore: number
  staleCurrentForecastsAfter: number
  freshCurrentForecastsAfter: number
  freshnessSloMet: boolean
  timeBudgetExceeded: boolean
}

function normalizeDailyRefreshOptions(options?: DailyTaskDurationForecastRefreshOptions) {
  return {
    limit: Math.max(1, Math.min(1000, Number(options?.limit ?? DEFAULT_DAILY_FORECAST_REFRESH_LIMIT))),
    batchSize: Math.max(1, Math.min(100, Number(options?.batchSize ?? DEFAULT_DAILY_FORECAST_REFRESH_BATCH_SIZE))),
    maxRuntimeMs: Math.max(0, Number(options?.maxRuntimeMs ?? DEFAULT_DAILY_FORECAST_REFRESH_MAX_RUNTIME_MS)),
    freshnessSloMs: Math.max(1, Number(options?.freshnessSloMs ?? DEFAULT_DAILY_FORECAST_FRESHNESS_SLO_MS)),
  }
}

function readForecastTimestampMs(forecast: Record<string, unknown> | null | undefined) {
  const timestampValue = forecast?.generated_at ?? forecast?.created_at
  const timestamp = timestampValue ? new Date(String(timestampValue)).getTime() : NaN
  return Number.isFinite(timestamp) ? timestamp : null
}

function countFreshForecastRows(
  forecastMap: Map<string, Record<string, unknown>>,
  taskIds: string[],
  freshnessSloMs: number,
  nowMs = Date.now(),
) {
  let fresh = 0
  let stale = 0
  for (const taskId of taskIds) {
    const timestampMs = readForecastTimestampMs(forecastMap.get(taskId))
    if (timestampMs != null && nowMs - timestampMs <= freshnessSloMs) {
      fresh += 1
    } else {
      stale += 1
    }
  }
  return { fresh, stale }
}

function emptyDailyRefreshResult(
  params: ReturnType<typeof normalizeDailyRefreshOptions>,
  startedAtMs: number,
  overrides: Partial<DailyTaskDurationForecastRefreshResult> = {},
): DailyTaskDurationForecastRefreshResult {
  return {
    scanned: 0,
    refreshed: 0,
    failed: 0,
    skippedByTimeBudget: 0,
    batchSize: params.batchSize,
    maxRuntimeMs: params.maxRuntimeMs,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    batchesAttempted: 0,
    freshnessSloMs: params.freshnessSloMs,
    staleCurrentForecastsBefore: 0,
    staleCurrentForecastsAfter: 0,
    freshCurrentForecastsAfter: 0,
    freshnessSloMet: true,
    timeBudgetExceeded: false,
    ...overrides,
  }
}

// workspace-isolation-system-job-approved: daily service-role scheduler scans active tasks across projects, then carries each selected project scope into forecast reads and writes.
export async function refreshDailyActiveTaskDurationForecasts(
  options?: DailyTaskDurationForecastRefreshOptions,
): Promise<DailyTaskDurationForecastRefreshResult> {
  const startedAtMs = Date.now()
  const params = normalizeDailyRefreshOptions(options)
  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, project_id')
    .in('status', ['todo', 'pending', 'in_progress', 'blocked'])
    .lt('progress', 100)
    .is('actual_end_date', null)
    .order('updated_at', { ascending: false })
    .limit(params.limit)

  if (error) {
    logger.warn('[taskDurationForecastService] failed to load active tasks for daily duration forecast refresh', { error })
    return emptyDailyRefreshResult(params, startedAtMs, { failed: 1, freshnessSloMet: false })
  }

  const taskRows = (data ?? []) as Array<{ id?: string | null, project_id?: string | null }>
  const taskIds: string[] = [...new Set(taskRows
    .map((row: { id?: string | null }) => String(row.id ?? '').trim())
    .filter((id): id is string => Boolean(id)))]
  if (taskIds.length === 0) return emptyDailyRefreshResult(params, startedAtMs)
  const visibleProjectIds = [...new Set(taskRows
    .map((row) => normalizeId(row.project_id))
    .filter((projectId): projectId is string => Boolean(projectId)))]
  if (visibleProjectIds.length === 0) {
    return emptyDailyRefreshResult(params, startedAtMs, { failed: taskIds.length, freshnessSloMet: false })
  }

  const freshnessBefore = countFreshForecastRows(
    await loadCurrentForecasts(taskIds, { visibleProjectIds }),
    taskIds,
    params.freshnessSloMs,
    startedAtMs,
  )
  let refreshed = 0
  let failed = 0
  let skippedByTimeBudget = 0
  let batchesAttempted = 0

  for (let index = 0; index < taskIds.length; index += params.batchSize) {
    const elapsedMs = Date.now() - startedAtMs
    if (elapsedMs >= params.maxRuntimeMs) {
      skippedByTimeBudget = taskIds.length - index
      break
    }

    const batch = taskIds.slice(index, index + params.batchSize)
    batchesAttempted += 1
    try {
      const forecasts = await forecastBatchTasks(batch, {
        triggerContext: 'daily_dashboard_refresh',
        useCache: false,
        visibleProjectIds,
      })
      refreshed += forecasts.length
      failed += Math.max(0, batch.length - forecasts.length)
    } catch (error) {
      failed += batch.length
      logger.warn('[taskDurationForecastService] daily duration forecast batch failed', {
        taskIds: batch,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const finishedAtMs = Date.now()
  const freshnessAfter = countFreshForecastRows(
    await loadCurrentForecasts(taskIds, { visibleProjectIds }),
    taskIds,
    params.freshnessSloMs,
    finishedAtMs,
  )
  return {
    scanned: taskIds.length,
    refreshed,
    failed,
    skippedByTimeBudget,
    batchSize: params.batchSize,
    maxRuntimeMs: params.maxRuntimeMs,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    batchesAttempted,
    freshnessSloMs: params.freshnessSloMs,
    staleCurrentForecastsBefore: freshnessBefore.stale,
    staleCurrentForecastsAfter: freshnessAfter.stale,
    freshCurrentForecastsAfter: freshnessAfter.fresh,
    freshnessSloMet: freshnessAfter.stale === 0,
    timeBudgetExceeded: skippedByTimeBudget > 0,
  }
}
