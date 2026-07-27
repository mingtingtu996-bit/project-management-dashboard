import {
  listAlgorithmSeedTypes,
  type AlgorithmSeedType,
} from './algorithmSeedRegistry.js'
import type { AlgorithmSeedCandidateSource, AlgorithmSeedOverrideScope } from './algorithmSeedLearningService.js'

export type AlgorithmSeedGovernanceCapability = {
  resolver: boolean
  validation: boolean
  learning: boolean
  autoGovernance: boolean
  import: boolean
  rollback: boolean
  candidateOnly: boolean
}

export type AlgorithmSeedGovernanceThreshold = {
  minSamples: number
  maxCv: number
  minConfidence: number
  minCrossProjects: number
  minCrossCompanies?: number
}

export type AlgorithmSeedGovernanceConsumerContract = {
  allowedConsumers: string[]
  forbiddenConsumers: string[]
  runtimeAuthority:
    | 'duration_baseline_context'
    | 'controlled_schedule_rhythm_context'
    | 'dependency_gate_signal'
    | 'forecast_only_bridge'
    | 'warning_threshold_policy_only'
    | 'recognition_signal_only'
    | 'calendar_or_environment_context'
    | 'governance_policy_only'
}

export type AlgorithmSeedCandidateQualityWeights = {
  sample: number
  conflict: number
  replay: number
}

export type AlgorithmSeedGovernancePolicy = {
  seedType: AlgorithmSeedType
  candidateOnly: boolean
  autoPublishEnabled: boolean
  promotionBoundary: 'auto_governance_threshold' | 'curated_seed_or_enterprise_standard_library'
  consumerContract: AlgorithmSeedGovernanceConsumerContract
  qualityWeights: AlgorithmSeedCandidateQualityWeights
  thresholds: {
    project: AlgorithmSeedGovernanceThreshold
    company: AlgorithmSeedGovernanceThreshold
    global: AlgorithmSeedGovernanceThreshold
    standardUpdate: AlgorithmSeedGovernanceThreshold
  }
  capabilities: AlgorithmSeedGovernanceCapability
}

const CANDIDATE_ONLY_SEED_TYPES = new Set<AlgorithmSeedType>([
  'standard_internal_flow',
  'cross_item_workflow',
  'process_constraint',
  'process_seasonal_sensitivity',
  'seasonal_productivity',
  'site_capacity_pressure',
  'title_weak_recognition',
  'regional_climate_rules',
  'risk_issue_warning_rule',
  'progress_deviation_cause',
  'responsibility_health_rule',
  'milestone_integrity_rule',
])

const DEFAULT_THRESHOLDS: AlgorithmSeedGovernancePolicy['thresholds'] = {
  project: { minSamples: 5, maxCv: 0.35, minConfidence: 0.75, minCrossProjects: 0 },
  company: { minSamples: 20, maxCv: 0.3, minConfidence: 0.8, minCrossProjects: 3 },
  global: { minSamples: 100, maxCv: 0.25, minConfidence: 0.85, minCrossProjects: 10, minCrossCompanies: 3 },
  standardUpdate: { minSamples: 1, maxCv: 0.35, minConfidence: 0.75, minCrossProjects: 0 },
}

const DEFAULT_QUALITY_WEIGHTS: AlgorithmSeedCandidateQualityWeights = {
  sample: 0.45,
  conflict: 0.25,
  replay: 0.30,
}

const QUALITY_WEIGHT_OVERRIDES: Partial<Record<AlgorithmSeedType, AlgorithmSeedCandidateQualityWeights>> = {
  standard_work_duration: { sample: 0.55, conflict: 0.15, replay: 0.30 },
  risk_issue_warning_rule: { sample: 0.20, conflict: 0.25, replay: 0.55 },
  standard_internal_flow: { sample: 0.25, conflict: 0.50, replay: 0.25 },
  cross_item_workflow: { sample: 0.25, conflict: 0.50, replay: 0.25 },
  process_constraint: { sample: 0.30, conflict: 0.40, replay: 0.30 },
}

function defaultConsumerContract(seedType: AlgorithmSeedType): AlgorithmSeedGovernanceConsumerContract {
  if (seedType === 'standard_work_duration') {
    return {
      allowedConsumers: ['durationContextService', 'taskDurationForecastService', 'baselineGenerationService'],
      forbiddenConsumers: ['warningService', 'riskIssueWarningGovernanceService'],
      runtimeAuthority: 'duration_baseline_context',
    }
  }
  if (seedType === 'building_pattern') {
    return {
      allowedConsumers: [
        'buildingPatternScheduleTrustService',
        'durationContextService',
        'taskDurationForecastService',
        'baselineGenerationService',
      ],
      forbiddenConsumers: [
        'constructionDependencyRuleSystemService',
        'taskDependencyGenerationService',
        'warningService',
        'riskIssueWarningGovernanceService',
      ],
      runtimeAuthority: 'controlled_schedule_rhythm_context',
    }
  }
  if (seedType === 'risk_issue_warning_rule') {
    return {
      allowedConsumers: ['warningService', 'warningImpactSignalService', 'riskIssueWarningGovernanceService', 'upgradeChainService'],
      forbiddenConsumers: ['durationContextService', 'taskDurationForecastService', 'baselineGenerationService'],
      runtimeAuthority: 'warning_threshold_policy_only',
    }
  }
  if (seedType === 'standard_internal_flow' || seedType === 'cross_item_workflow' || seedType === 'process_constraint') {
    return {
      allowedConsumers: [
        'constructionDependencyRuleSystemService',
        'durationContextService',
        'executionGateSeedService',
        'taskDurationForecastService',
        'wbsTemplateGenerationService',
      ],
      forbiddenConsumers: ['warningService'],
      runtimeAuthority: 'dependency_gate_signal',
    }
  }
  if (seedType === 'earliest_start_rule') {
    return {
      allowedConsumers: ['taskDurationForecastService', 'durationContextGovernanceService'],
      forbiddenConsumers: ['warningService', 'baselineGenerationService'],
      runtimeAuthority: 'forecast_only_bridge',
    }
  }
  if (seedType === 'workflow_dictionary' || seedType === 'title_weak_recognition') {
    return {
      allowedConsumers: ['taskStandardInferenceService', 'constructionScopeInferenceService', 'wbsTemplateGenerationService'],
      forbiddenConsumers: ['warningService', 'taskDurationForecastService'],
      runtimeAuthority: 'recognition_signal_only',
    }
  }
  if (seedType === 'work_calendar' || seedType === 'regional_climate_rules' || seedType === 'seasonal_productivity' || seedType === 'process_seasonal_sensitivity') {
    return {
      allowedConsumers: ['durationContextService', 'taskDurationForecastService', 'projectClimateResolver'],
      forbiddenConsumers: ['warningService'],
      runtimeAuthority: 'calendar_or_environment_context',
    }
  }
  return {
    allowedConsumers: ['algorithmSeedResolver', 'algorithmSeedAutoGovernanceService'],
    forbiddenConsumers: [],
    runtimeAuthority: 'governance_policy_only',
  }
}

function buildPolicy(seedType: AlgorithmSeedType): AlgorithmSeedGovernancePolicy {
  const candidateOnly = CANDIDATE_ONLY_SEED_TYPES.has(seedType)
  const capabilities: AlgorithmSeedGovernanceCapability = {
    resolver: true,
    validation: true,
    learning: true,
    autoGovernance: true,
    import: true,
    rollback: true,
    candidateOnly,
  }

  return {
    seedType,
    candidateOnly,
    autoPublishEnabled: !candidateOnly,
    promotionBoundary: candidateOnly
      ? 'curated_seed_or_enterprise_standard_library'
      : 'auto_governance_threshold',
    consumerContract: defaultConsumerContract(seedType),
    qualityWeights: QUALITY_WEIGHT_OVERRIDES[seedType] ?? DEFAULT_QUALITY_WEIGHTS,
    thresholds: DEFAULT_THRESHOLDS,
    capabilities,
  }
}

export function getAlgorithmSeedGovernancePolicy(seedType: AlgorithmSeedType): AlgorithmSeedGovernancePolicy {
  return buildPolicy(seedType)
}

export function getAlgorithmSeedGovernanceCapabilityMatrix(): Record<AlgorithmSeedType, AlgorithmSeedGovernanceCapability> {
  return Object.fromEntries(
    listAlgorithmSeedTypes().map((seedType) => [seedType, getAlgorithmSeedGovernancePolicy(seedType).capabilities]),
  ) as Record<AlgorithmSeedType, AlgorithmSeedGovernanceCapability>
}

export function isAlgorithmSeedCandidateOnly(seedType: AlgorithmSeedType) {
  return getAlgorithmSeedGovernancePolicy(seedType).candidateOnly
}

export function getAlgorithmSeedGovernanceThreshold(
  seedType: AlgorithmSeedType,
  scopeType: AlgorithmSeedOverrideScope | null,
  candidateSource?: AlgorithmSeedCandidateSource | string | null,
) {
  const policy = getAlgorithmSeedGovernancePolicy(seedType)
  if (candidateSource === 'standard_update') {
    return { ...policy.thresholds.standardUpdate, source: 'standard_update' as const }
  }
  if (scopeType === 'company') return { ...policy.thresholds.company, source: 'default' as const }
  if (scopeType === 'project') return { ...policy.thresholds.project, source: 'default' as const }
  return { ...policy.thresholds.global, source: 'default' as const }
}
