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

export interface DurationRuntimeConsumerObservationAdapterRegistration {
  consumerKey: string
  assetKeys: readonly DurationLiveLearningAssetKey[]
}

export interface DurationRuntimeConsumerObservationIntegratedContract {
  assetKey: DurationLiveLearningAssetKey
  consumerKey: string
  consumerSurface: string
}

export interface DurationRuntimeConsumerObservationRejectedRegistration {
  assetKey: DurationLiveLearningAssetKey
  consumerKey: string
  reason: 'runtime_consumer_observation_integration_contract_not_declared'
}

export interface DurationRuntimeConsumerObservationIntegrationCoverageInput {
  adapterRegistrations?: readonly DurationRuntimeConsumerObservationAdapterRegistration[]
}

export interface DurationRuntimeConsumerObservationIntegrationCoverage {
  status:
    | 'runtime_consumer_observation_integration_ready'
    | 'runtime_consumer_observation_integration_not_ready'
  requiredContracts: DurationRuntimeConsumerObservationIntegratedContract[]
  integratedContracts: DurationRuntimeConsumerObservationIntegratedContract[]
  missingContracts: DurationRuntimeConsumerObservationIntegratedContract[]
  rejectedRegistrations: DurationRuntimeConsumerObservationRejectedRegistration[]
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

function integrationContractKey(contract: DurationRuntimeConsumerObservationIntegratedContract) {
  return `${contract.assetKey}::${contract.consumerKey}`
}

function toIntegratedContract(
  contract: DurationRuntimeConsumerObservationIntegrationContract,
): DurationRuntimeConsumerObservationIntegratedContract {
  return {
    assetKey: contract.assetKey,
    consumerKey: contract.consumerKey,
    consumerSurface: contract.consumerSurface,
  }
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

export function evaluateDurationRuntimeConsumerObservationIntegrationCoverage(
  input: DurationRuntimeConsumerObservationIntegrationCoverageInput = {},
): DurationRuntimeConsumerObservationIntegrationCoverage {
  const contractMap = new Map(
    listDurationRuntimeConsumerObservationIntegrationContracts()
      .map((contract) => [integrationContractKey(contract), contract]),
  )
  const integratedMap = new Map<string, DurationRuntimeConsumerObservationIntegratedContract>()
  const rejectedRegistrations: DurationRuntimeConsumerObservationRejectedRegistration[] = []

  for (const registration of input.adapterRegistrations ?? []) {
    const consumerKey = normalizeConsumerKey(registration.consumerKey)
    for (const assetKey of registration.assetKeys) {
      const contract = contractMap.get(integrationContractKey({ assetKey, consumerKey, consumerSurface: '' }))
      if (!contract) {
        rejectedRegistrations.push({
          assetKey,
          consumerKey,
          reason: 'runtime_consumer_observation_integration_contract_not_declared',
        })
        continue
      }
      integratedMap.set(integrationContractKey(contract), toIntegratedContract(contract))
    }
  }

  const requiredContracts = [...contractMap.values()].map(toIntegratedContract)
  const integratedContracts = [...integratedMap.values()]
  const integratedKeys = new Set(integratedContracts.map(integrationContractKey))
  const missingContracts = requiredContracts
    .filter((contract) => !integratedKeys.has(integrationContractKey(contract)))

  return {
    status: missingContracts.length === 0
      ? 'runtime_consumer_observation_integration_ready'
      : 'runtime_consumer_observation_integration_not_ready',
    requiredContracts,
    integratedContracts,
    missingContracts,
    rejectedRegistrations,
  }
}
