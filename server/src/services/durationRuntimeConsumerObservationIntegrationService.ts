import {
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
} from './durationLiveLearningClosureService.js'
import {
  CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
} from './constructionOrganizationRuntimeLineageService.js'

export type DurationRuntimeConsumerObservedAssetKey =
  | DurationLiveLearningAssetKey
  | typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY

export type DurationRuntimeConsumerPublicationStatus =
  | 'published'
  | 'canary'
  | 'runtime_published'

export interface DurationRuntimeConsumerObservationIntegrationContract {
  assetKey: DurationRuntimeConsumerObservedAssetKey
  consumerKey: string
  consumerSurface: string
  acceptedPublicationStatuses: DurationRuntimeConsumerPublicationStatus[]
}

export interface DurationRuntimeConsumerObservationAdapterRegistration {
  consumerKey: string
  assetKeys: readonly DurationRuntimeConsumerObservedAssetKey[]
}

export interface DurationRuntimeConsumerObservationIntegratedContract {
  assetKey: DurationRuntimeConsumerObservedAssetKey
  consumerKey: string
  consumerSurface: string
}

export interface DurationRuntimeConsumerObservationRejectedRegistration {
  assetKey: DurationRuntimeConsumerObservedAssetKey
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
  projectCriticalPathService: 'critical_path_watch_prior',
  projectWizard: 'project_wizard_commit',
  wbsTemplateGenerationService: 'wbs_template_generation',
  scheduleAccelerationService: 'schedule_acceleration',
  scheduleAccelerationRuntimeService: 'schedule_acceleration_runtime',
}

const RUNTIME_ONLY_OBSERVATION_CONTRACTS: DurationRuntimeConsumerObservationIntegrationContract[] = [
  {
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    consumerKey: 'projectWizard',
    consumerSurface: 'project_wizard_commit',
    acceptedPublicationStatuses: [...ACCEPTED_PUBLICATION_STATUSES],
  },
  {
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    consumerKey: 'scheduleAccelerationRuntimeService',
    consumerSurface: 'schedule_acceleration_runtime',
    acceptedPublicationStatuses: [...ACCEPTED_PUBLICATION_STATUSES],
  },
]

const RUNTIME_PUBLICATION_KEY_PREFIXES_BY_ASSET: Partial<Record<DurationRuntimeConsumerObservedAssetKey, string[]>> = {
  base_duration_benchmark: [
    'duration_benchmark_runtime:',
    'duration-benchmark-runtime:',
    'learnable-parameter-runtime:duration-blend:',
    'learnable-parameter-runtime:p50-p75-blend:',
    'learnable-parameter-runtime:event-duration-blend:',
    'learnable-parameter-runtime:event-p50-p75:',
    'duration_learning_runtime:base_duration_benchmark:',
  ],
  duration_cold_start_baseline: [
    'cold_start_baseline_runtime:',
    'duration_cold_start_baseline_runtime:',
    'learnable-parameter-runtime:cold-start:',
  ],
  forecast_residual_overlay: [
    'forecast_residual_overlay_runtime:',
    'learnable-parameter-runtime:forecast-l',
  ],
  forecast_confidence_weight: [
    'forecast_confidence_weight_runtime:',
    'learnable-parameter-runtime:confidence:',
    'learnable-parameter-runtime:event-confidence-penalty:',
  ],
  standard_work_duration_seed: [
    'algorithm_seed_versions:',
    'standard_work_duration_seed_runtime:',
    'duration_learning_runtime:standard_work_duration_seed:',
  ],
  special_work_duration_seed: [
    'wbs_template_runtime:',
    'wbs-template-runtime:',
    'duration_learning_runtime:special_work_duration_seed:',
  ],
  wbs_reference_days: [
    'wbs_reference_days_runtime:',
    'duration_learning_runtime:wbs_reference_days:',
  ],
  dependency_rule_candidate: [
    'dependency_rule_runtime:',
    'dependency-rule-runtime:',
    'duration_learning_runtime:dependency_rule_candidate:',
  ],
  critical_path_rule_candidate: [
    'critical_path_rule_runtime:',
    'critical-path-rule-runtime:',
    'duration_learning_runtime:critical_path_rule_candidate:',
  ],
  construction_organization_plan_network: [
    'construction_org_plan_network_runtime:',
    'construction-organization-plan-network-runtime:',
    'construction-org-plan-network:',
    'construction-org-plan-network-release-record:',
    'construction-organization-plan-network-outcome:',
  ],
}

function normalizeConsumerKey(value: string) {
  return value.trim().replace(/\.ts$/i, '')
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
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
  const liveLearningContracts = listDurationLiveLearningManifests()
    .flatMap((manifest) => manifest.implementationAnchors.runtimeConsumers.map((consumerKey) => {
      const normalizedConsumerKey = normalizeConsumerKey(consumerKey)
      return {
        assetKey: manifest.assetKey,
        consumerKey: normalizedConsumerKey,
        consumerSurface: CONSUMER_SURFACE_BY_KEY[normalizedConsumerKey] ?? normalizedConsumerKey,
        acceptedPublicationStatuses: [...ACCEPTED_PUBLICATION_STATUSES],
      }
    }))
  return [
    ...liveLearningContracts,
    ...RUNTIME_ONLY_OBSERVATION_CONTRACTS.map((contract) => ({
      ...contract,
      acceptedPublicationStatuses: [...contract.acceptedPublicationStatuses],
    })),
  ]
}

export function listDurationRuntimeConsumerPublicationKeyPrefixesForAsset(
  assetKey: DurationRuntimeConsumerObservedAssetKey,
): string[] {
  return [...(RUNTIME_PUBLICATION_KEY_PREFIXES_BY_ASSET[assetKey] ?? [])]
}

export function isDurationRuntimeConsumerPublicationKeyAllowedForAsset(
  assetKey: DurationRuntimeConsumerObservedAssetKey,
  publicationKey: unknown,
): boolean {
  const normalizedPublicationKey = normalizeText(publicationKey)
  if (!normalizedPublicationKey) return false
  return listDurationRuntimeConsumerPublicationKeyPrefixesForAsset(assetKey)
    .some((prefix) => normalizedPublicationKey.startsWith(prefix))
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
