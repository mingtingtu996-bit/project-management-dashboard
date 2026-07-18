import {
  recordDurationRuntimeConsumerRuntimeCall,
  recordDurationRuntimeConsumerObservedContractArtifacts,
  type DurationRuntimeConsumerObservedArtifact,
  type DurationRuntimeConsumerObservationQueryExec,
  type DurationRuntimeConsumerObservedArtifactsResult,
  type DurationRuntimeConsumerRuntimeCallResult,
} from './durationRuntimeConsumerObservationService.js'
import type {
  DurationRuntimeConsumerObservedAssetKey,
} from './durationRuntimeConsumerObservationIntegrationService.js'
import {
  CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
} from './constructionOrganizationRuntimeLineageService.js'

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
  assetKeys: readonly DurationRuntimeConsumerObservedAssetKey[]
}

const RUNTIME_ENTRY_REFS_BY_CONSUMER_KEY: Record<string, string> = {
  durationSuggestionService: 'durationSuggestionService:getTaskDurationSuggestion',
  taskDurationForecastService: 'taskDurationForecastService:forecastTaskDuration',
  projectRemainingDurationForecastService: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
  projectCriticalPathService: 'projectCriticalPathService:resolveCriticalPathLearningPublications',
  projectWizard: 'projectWizard:commitWizardGeneration',
  wbsTemplateGenerationService: 'wbsTemplateGenerationService:generateWbsTemplateRows',
  scheduleAccelerationService: 'scheduleAccelerationService:evaluateRuntimeDelayRecoveryWithCriticalPath',
  scheduleAccelerationRuntimeService: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
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
    consumerKey: 'projectCriticalPathService',
    assetKeys: ['critical_path_rule_candidate'],
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
    assetKeys: [
      'critical_path_rule_candidate',
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    ],
  },
  {
    consumerKey: 'projectWizard',
    assetKeys: [
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    ],
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
  const sourceEvidenceRefs = Array.from(new Set((input.sourceEvidenceRefs ?? [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)))
  const runtimeCallResult = await recordDurationRuntimeConsumerRuntimeCall({
    queryExec: input.queryExec,
    consumerKey,
    runtimeEntryRef: input.runtimeEntryRef ?? RUNTIME_ENTRY_REFS_BY_CONSUMER_KEY[consumerKey],
    callContext: {
      ...(input.callContext ?? {}),
      runtimeAssetMode: input.artifacts.length > 0 ? 'published_artifact' : 'no_published_artifact',
      runtimeArtifactCount: input.artifacts.length,
    },
    sourceEvidenceRefs,
    calledAt: input.calledAt ?? input.observedAt,
    writesRuntimeDirectly: input.writesRuntimeDirectly,
    writesFactDirectly: input.writesFactDirectly,
  })
  const observationsResult = await recordDurationRuntimeConsumerObservedContractArtifacts({
    queryExec: input.queryExec,
    consumerKey,
    artifacts: input.artifacts.map((artifact) => {
      const artifactSourceEvidenceRefs = Array.from(new Set((artifact.sourceEvidenceRefs ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)))
      return {
        ...artifact,
        sourceEvidenceRefs: artifactSourceEvidenceRefs.length > 0
          ? [
            ...sourceEvidenceRefs,
            ...artifactSourceEvidenceRefs,
          ]
          : artifact.sourceEvidenceRefs,
      }
    }),
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

export function recordProjectCriticalPathConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('projectCriticalPathService', input)
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

export function recordProjectWizardConsumedArtifacts(
  input: RecordDurationRuntimeConsumerFacadeArtifactsInput,
) {
  return recordConsumerArtifacts('projectWizard', input)
}
