import {
  recordDurationRuntimeConsumerObservedContractArtifacts,
  type DurationRuntimeConsumerObservedArtifact,
  type DurationRuntimeConsumerObservationQueryExec,
  type DurationRuntimeConsumerObservedArtifactsResult,
} from './durationRuntimeConsumerObservationService.js'

export interface RecordDurationRuntimeConsumerFacadeArtifactsInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  artifacts: readonly DurationRuntimeConsumerObservedArtifact[]
  observedAt?: string
  writesRuntimeDirectly?: boolean
  writesFactDirectly?: boolean
}

function recordConsumerArtifacts(
  consumerKey: string,
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
): Promise<DurationRuntimeConsumerObservedArtifactsResult> {
  return recordDurationRuntimeConsumerObservedContractArtifacts({
    queryExec: input.queryExec,
    consumerKey,
    artifacts: input.artifacts,
    observedAt: input.observedAt,
    writesRuntimeDirectly: input.writesRuntimeDirectly,
    writesFactDirectly: input.writesFactDirectly,
  })
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
