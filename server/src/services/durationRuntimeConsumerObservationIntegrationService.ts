import {
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'

export type DurationRuntimeConsumerPublicationStatus =
  | 'published'
  | 'canary'
  | 'runtime_published'

export interface DurationRuntimeConsumerObservationIntegrationContract {
  assetKey: DurationLiveLearningAssetKey
  consumerKey: string
  consumerSurface: string
  acceptedPublicationStatuses: DurationRuntimeConsumerPublicationStatus[]
}

const ACCEPTED_PUBLICATION_STATUSES: DurationRuntimeConsumerPublicationStatus[] = [
  'published',
  'canary',
  'runtime_published',
]

const CONSUMER_SURFACE_BY_KEY: Record<string, string> = {
  durationSuggestionService: 'duration_suggestion',
  taskDurationForecastService: 'task_duration_forecast',
  projectRemainingDurationForecastService: 'remaining_duration_forecast',
  wbsTemplateGenerationService: 'wbs_template_generation',
  scheduleAccelerationService: 'schedule_acceleration',
  scheduleAccelerationRuntimeService: 'schedule_acceleration_runtime',
}

function normalizeConsumerKey(value: string) {
  return value.trim().replace(/\.ts$/i, '')
}

export function listDurationRuntimeConsumerObservationIntegrationContracts():
  DurationRuntimeConsumerObservationIntegrationContract[] {
  return listDurationLiveLearningManifests()
    .flatMap((manifest) => manifest.implementationAnchors.runtimeConsumers.map((consumerKey) => {
      const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
      return {
        assetKey: manifest.assetKey,
        consumerKey: normalizedConsumerKey,
        consumerSurface: CONSUMER_SURFACE_BY_KEY[normalizedConsumerKey] ?? normalizedConsumerKey,
        acceptedPublicationStatuses: [...ACCEPTED_PUBLICATION_STATUSES],
      }
    }))
}
