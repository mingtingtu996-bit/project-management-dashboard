import {
  recordDurationRuntimeConsumerRuntimeCall,
  recordDurationRuntimeConsumerObservedContractArtifacts,
  type DurationRuntimeConsumerObservedArtifact,
  type DurationRuntimeConsumerObservationQueryExec,
  type DurationRuntimeConsumerObservedArtifactsResult,
  type DurationRuntimeConsumerRuntimeCallResult,
} from './durationRuntimeConsumerObservationService.js'
import type {
  DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'

export interface RecordDurationRuntimeConsumerFacadeArtifactsInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  artifacts: readonly DurationRuntimeConsumerObservedArtifact[]
  runtimeEntryRef?: string
  callContext?: Record<string, unknown> | null
  sourceEvidenceRefs?: string[] | null
  calledAt?: string
  observedAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

export interface DurationRuntimeConsumerFacadeArtifactsResult
  extends DurationRuntimeConsumerObservedArtifactsResult {
  runtimeCallResult: DurationRuntimeConsumerRuntimeCallResult
}

export interface DurationRuntimeConsumerObservationFacadeRegistration {
  consumerKey: string
  assetKeys: readonly DurationLiveLearningAssetKey[]
}

const RUNTIME_ENTRY_REFS_BY_CONSUMER_KEY: Record<string, string> = {
  durationSuggestionService: 'durationSuggestionService:suggestDuration',
  taskDurationForecastService: 'taskDurationForecastService:forecastTaskDuration',
  projectRemainingDurationForecastService: 'projectRemainingDurationForecastService:forecastRemainingDuration',
  wbsTemplateGenerationService: 'wbsTemplateGenerationService:generateTemplate',
  scheduleAccelerationService: 'scheduleAccelerationService:buildAccelerationPlan',
  scheduleAccelerationRuntimeService: 'scheduleAccelerationRuntimeService:applyRuntimeAcceleration',
}

const FACADE_REGISTRATIONS: DurationRuntimeConsumerObservationFacadeRegistration[] = [
  {
    consumerKey: 'durationSuggestionService',
    assetKeys: [
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'standard_work_duration_seed',
      'special_work_duration_seed',
    ],
  },
  {
    consumerKey: 'taskDurationForecastService',
    assetKeys: [
      'forecast_residual_overlay',
      'forecast_confidence_weight',
    ],
  },
  {
    consumerKey: 'projectRemainingDurationForecastService',
    assetKeys: [
      'forecast_residual_overlay',
      'wbs_reference_days',
      'critical_path_rule_candidate',
    ],
  },
  {
    consumerKey: 'wbsTemplateGenerationService',
    assetKeys: [
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
    ],
  },
  {
    consumerKey: 'scheduleAccelerationService',
    assetKeys: ['dependency_rule_candidate'],
  },
  {
    consumerKey: 'scheduleAccelerationRuntimeService',
    assetKeys: ['critical_path_rule_candidate'],
  },
]

export function listDurationRuntimeConsumerObservationFacadeRegistrations():
  DurationRuntimeConsumerObservationFacadeRegistration[] {
  return FACADE_REGISTRATIONS.map((registration) => ({
    consumerKey: registration.consumerKey,
    assetKeys: [...registration.assetKeys],
  }))
}

async function recordConsumerArtifacts(
  consumerKey: string,
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const runtimeCallResult = await recordDurationRuntimeConsumerRuntimeCall({
    queryExec: input.queryExec,
    consumerKey,
    runtimeEntryRef: input.runtimeEntryRef ?? RUNTIME_ENTRY_REFS_BY_CONSUMER_KEY[consumerKey],
    callContext: input.callContext,
    sourceEvidenceRefs: input.sourceEvidenceRefs,
    calledAt: input.calledAt ?? input.observedAt,
    writesRuntimeDirectly: input.writesRuntimeDirectly,
    writesFactDirectly: input.writesFactDirectly,
  })
  const observationsResult = await recordDurationRuntimeConsumerObservedContractArtifacts({
    queryExec: input.queryExec,
    consumerKey,
    artifacts: input.artifacts,
    observedAt: input.observedAt,
    writesRuntimeDirectly: input.writesRuntimeDirectly,
    writesFactDirectly: input.writesFactDirectly,
  })

  return {
    ...observationsResult,
    runtimeCallResult,
  }
}

export function recordDurationSuggestionConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('durationSuggestionService', input)
}

export function recordTaskDurationForecastConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('taskDurationForecastService', input)
}

export function recordProjectRemainingDurationForecastConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('projectRemainingDurationForecastService', input)
}

export function recordWbsTemplateGenerationConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('wbsTemplateGenerationService', input)
}

export function recordScheduleAccelerationConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('scheduleAccelerationService', input)
}

export function recordScheduleAccelerationRuntimeConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('scheduleAccelerationRuntimeService', input)
}
