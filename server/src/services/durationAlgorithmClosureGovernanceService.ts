import { listAlgorithmRuleAssets, type AlgorithmRuleAsset } from './algorithmRuleAssetInventoryService.js'
import { getProjectGenerationFactGovernanceDiagnostics } from './projectGenerationFactsConsumerRegistry.js'
import {
  listDurationContextFactorConsumptionMatrix,
  getDurationContextEffectiveContributionLedgerContract,
} from './durationContextGovernanceService.js'
import {
  CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS,
  CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
} from './constructionDependencyRuleSystemService.js'
import {
  PROJECT_SCENARIO_TAXONOMY_VERSION,
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
} from './projectScenarioTaxonomyService.js'
import type { AlgorithmFactContextPhase } from './algorithmFactContextService.js'
import { listDurationOutputContracts } from './durationOutputGovernanceService.js'

export const DURATION_ALGORITHM_CLOSURE_GOVERNANCE_VERSION = 'v1.4.22-duration-algorithm-closure-20260603'

export type DurationClosureStepCode =
  | 'duration_asset_inventory'
  | 'duration_quadrant_boundary'
  | 'fact_layer_closure'
  | 'construction_execution_profile_closure'
  | 'single_task_duration_chain_closure'
  | 'phase_network_policy_closure'
  | 'milestone_interface_network_closure'
  | 'dependency_network_closure'
  | 'quadrant_consistency_validation'
  | 'duration_contribution_ledger'

export type DurationClosureStepStatus = 'closed_for_current_scope'

export type DurationClosureAssetCategory =
  | 'fact_layer'
  | 'construction_execution_profile'
  | 'duration_seed'
  | 'phase_network'
  | 'dependency_network'
  | 'duration_context'
  | 'runtime_algorithm'
  | 'service_governance'
  | 'verification'
  | 'dark_asset'

export type DurationClosureAsset = {
  key: string
  category: DurationClosureAssetCategory
  source: string
  ownerServices: string[]
  role: string
  consumers: string[]
  boundaryPolicy: string[]
}

export type DurationClosureStep = {
  code: DurationClosureStepCode
  order: number
  title: string
  status: DurationClosureStepStatus
  evidenceAssets: string[]
  boundaryPolicy: string[]
}

export type DurationClosureQuadrant = {
  code:
    | 'Q1_plan_global_duration'
    | 'Q2_plan_single_task_duration'
    | 'Q3_runtime_global_duration'
    | 'Q4_runtime_single_task_duration'
  stage: 'plan_creation' | 'runtime_execution'
  durationLevel: 'global' | 'single_task'
  primaryFactLayer: 'ProjectGenerationFacts' | 'RuntimeExecutionFacts'
  backgroundFactLayer: 'ProjectGenerationFacts' | 'RuntimeExecutionFacts' | null
  algorithmFactContextPhase: AlgorithmFactContextPhase
  authorityAlgorithm: string
  ownerServices: string[]
  outputContract: string
  boundaryPolicy: string[]
}

export type MilestoneInterfaceType = {
  code: string
  label: string
  sourceHints: string[]
  releases: string[]
}

export type DurationClosureReport = {
  version: typeof DURATION_ALGORITHM_CLOSURE_GOVERNANCE_VERSION
  sourcePlan: 'docs/plans/v1.4.22算法与规则口径治理体系执行方案.md'
  scope: {
    completedStepCount: 10
    excludedSteps: ['golden_benchmark_and_parameter_calibration']
    exclusionReason: string
    recommendationPackCount: number
    projectScenarioTaxonomyVersion: typeof PROJECT_SCENARIO_TAXONOMY_VERSION
  }
  steps: DurationClosureStep[]
  assetInventory: {
    sourcePolicy: 'current_worktree_code_is_authority'
    factCount: number
    durationContextFactorCount: number
    governedAlgorithmRuleAssetCount: number
    assets: DurationClosureAsset[]
    darkAssets: DurationClosureAsset[]
  }
  quadrants: DurationClosureQuadrant[]
  factLayer: {
    projectGenerationFacts: {
      role: 'project_static_identity_and_scale'
      diagnostics: ReturnType<typeof getProjectGenerationFactGovernanceDiagnostics>
      authority: 'ProjectGenerationFacts'
      boundaryPolicy: string[]
    }
    runtimeExecutionFacts: {
      role: 'current_execution_state'
      authority: 'RuntimeExecutionFacts'
      fields: string[]
      boundaryPolicy: string[]
    }
    algorithmFactContext: {
      authority: 'AlgorithmFactContext'
      phases: AlgorithmFactContextPhase[]
      boundaryPolicy: string[]
    }
  }
  constructionExecutionProfile: {
    authority: 'ConstructionExecutionProfile'
    ownerServices: string[]
    archetypes: string[]
    boundaryPolicy: string[]
  }
  phaseNetworkPolicy: {
    authority: 'PhaseNetworkPolicy'
    ownerServices: string[]
    outputContract: string[]
    boundaryPolicy: string[]
  }
  milestoneInterfaceNetwork: {
    authority: 'MilestoneInterfaceNetwork'
    ownerServices: string[]
    notA: string[]
    interfaceTypes: MilestoneInterfaceType[]
    boundaryPolicy: string[]
  }
  dependencyNetwork: {
    version: typeof CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION
    layers: Array<{
      code: string
      source: string
      role: string
      boundaryPolicy: string[]
    }>
    boundaryPolicy: string[]
  }
  consistencyLedger: {
    authority: 'DurationQuadrantConsistencyLedger'
    compares: string[]
    anomalyTypes: Array<{ code: string; meaning: string }>
    boundaryPolicy: string[]
  }
  contributionLedger: {
    authority: 'DurationContributionLedger'
    durationContextLedgerContract: ReturnType<typeof getDurationContextEffectiveContributionLedgerContract>
    dimensions: Array<{ code: string; sourceLayer: string; owner: string }>
    boundaryPolicy: string[]
  }
  durationOutputGovernance: {
    authority: 'DurationOutputContract'
    outputCount: number
    contracts: ReturnType<typeof listDurationOutputContracts>
    boundaryPolicy: string[]
  }
}

export type DurationQuadrantConsistencyAnomalyType =
  | 'phase-window-underfilled'
  | 'phase-window-overstretched'
  | 'seed-vs-phase-network-mismatch'
  | 'task-rollup-vs-phase-policy-mismatch'
  | 'milestone-gate-missing'
  | 'milestone-gate-contradiction'

export type DurationQuadrantConsistencyPhaseWindow = {
  phaseCode: string
  phaseWindowDays?: number | null
  taskNetworkCriticalPathDays?: number | null
  parentRollupWindowDays?: number | null
  milestoneGateCodes?: string[] | null
  expectedMilestoneGateCodes?: string[] | null
  conflictingMilestoneGateCodes?: string[] | null
}

export type DurationQuadrantConsistencySeedWindow = {
  stableCode: string
  phaseCode?: string | null
  seedReferenceDays?: number | null
  phaseWindowDays?: number | null
}

export type DurationQuadrantConsistencyAnomaly = {
  type: DurationQuadrantConsistencyAnomalyType
  subjectCode: string
  phaseCode?: string
  severity: 'review' | 'warning'
  reason: string
  metrics: Record<string, number | string>
}

export type DurationQuadrantConsistencyLedger = {
  authority: 'DurationQuadrantConsistencyLedger'
  summary: {
    anomalyCount: number
    comparedDimensions: string[]
    phaseWindowCount: number
    seedWindowCount: number
  }
  anomalies: DurationQuadrantConsistencyAnomaly[]
  boundaryPolicy: string[]
}

export type DurationContributionLedgerInput = {
  dimensionCode: string
  days?: number | null
  sourceRef?: string | null
}

export type DurationContributionLedgerDimensionSummary = {
  dimensionCode: string
  sourceLayer: string
  owner: string
  totalDays: number
  entryCount: number
  sourceRefs: string[]
}

export type DurationContributionLedgerSummary = {
  authority: 'DurationContributionLedger'
  totalContributionDays: number
  unknownContributionDays: number
  entriesByDimension: Record<string, DurationContributionLedgerDimensionSummary>
  unknownEntries: DurationContributionLedgerInput[]
  boundaryPolicy: string[]
}

export type MilestoneInterfaceMatchInput = {
  releaseCodes?: string[] | null
  existingGateCodes?: string[] | null
}

export type MilestoneInterfaceMatchResult = {
  authority: 'MilestoneInterfaceNetwork'
  matchedInterfaces: MilestoneInterfaceType[]
  existingGateCodes: string[]
  missingGateCodes: string[]
  boundaryPolicy: string[]
}

const RUNTIME_EXECUTION_FACT_FIELDS = [
  'progressCompletionRatio',
  'inProgressTaskCount',
  'blockedTaskCount',
  'hardBlockerCount',
  'resourcePressureScore',
  'parallelDensityRatio',
  'milestonePressureScore',
  'forecastDelayDays',
  'baselineDeviationDays',
  'criticalOrNearCriticalTaskCount',
  'floatingTaskCount',
  'scheduleState',
  'localAccelerationFactor',
  'evidenceCodes',
  'evidenceObjects',
  'runtimeInferenceSummary',
]

const ALGORITHM_FACT_CONTEXT_PHASES: AlgorithmFactContextPhase[] = [
  'plan_creation',
  'baseline_generation',
  'new_task_reference',
  'monthly_plan',
  'duration_context',
  'runtime_forecast',
  'runtime_delay_recovery',
]

const STEPS: DurationClosureStep[] = [
  {
    code: 'duration_asset_inventory',
    order: 1,
    title: 'Duration algorithm, seed, factor, rule and template asset inventory',
    status: 'closed_for_current_scope',
    evidenceAssets: [
      'algorithmRuleAssetInventoryService',
      'projectGenerationFactsConsumerRegistry',
      'durationContextGovernanceService',
      'constructionDependencyRuleSystemService',
    ],
    boundaryPolicy: ['current_worktree_code_is_authority', 'user_pasted_inventory_is_reference_only'],
  },
  {
    code: 'duration_quadrant_boundary',
    order: 2,
    title: 'Four-quadrant duration boundary',
    status: 'closed_for_current_scope',
    evidenceAssets: ['AlgorithmFactContext', 'durationSuggestionService', 'taskDurationForecastService', 'monthlyPlanGenerationService'],
    boundaryPolicy: ['every_duration_algorithm_declares_stage_and_duration_level'],
  },
  {
    code: 'fact_layer_closure',
    order: 3,
    title: 'ProjectGenerationFacts / RuntimeExecutionFacts / AlgorithmFactContext fact closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['ProjectGenerationFacts', 'RuntimeExecutionFacts', 'AlgorithmFactContext'],
    boundaryPolicy: ['project_generation_facts_describe_project_static_identity', 'runtime_execution_facts_describe_current_execution_state'],
  },
  {
    code: 'construction_execution_profile_closure',
    order: 4,
    title: 'Construction execution profile closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['buildingPatternExecutionResolver', 'projectScenarioTaxonomyService'],
    boundaryPolicy: ['derived_from_project_static_facts', 'not_frontend_manual_algorithm_choice'],
  },
  {
    code: 'single_task_duration_chain_closure',
    order: 5,
    title: 'Single task and rhythm package duration chain closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['standardWorkDurationSeed', 'durationSuggestionService', 'durationContextService', 'packageChildRhythmWindowService'],
    boundaryPolicy: ['duration_seed_p50_is_reference_not_project_total', 'runtime_context_uses_algorithm_fact_context'],
  },
  {
    code: 'phase_network_policy_closure',
    order: 6,
    title: 'Phase network policy closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['projectScenarioTaxonomyService', 'wbsTemplateGenerationService.phaseChain'],
    boundaryPolicy: ['new_plan_global_duration_only', 'runtime_execution_does_not_rewrite_static_phase_policy'],
  },
  {
    code: 'milestone_interface_network_closure',
    order: 7,
    title: 'Milestone interface network closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['MilestoneInterfaceNetwork', 'v1475CrossItemWorkflowSeed', 'acceptanceTemplateService', 'pre-milestones'],
    boundaryPolicy: ['bridges_phase_network_and_task_dependency', 'not_frontend_manual_object'],
  },
  {
    code: 'dependency_network_closure',
    order: 8,
    title: 'Task dependency and process constraint network closure',
    status: 'closed_for_current_scope',
    evidenceAssets: ['constructionDependencyRuleSystemService', 'standardInternalFlowSeed', 'v1475CrossItemWorkflowSeed', 'v1475DependencyIntentTemplates', 'v1474ProcessConstraintSeed'],
    boundaryPolicy: ['dependency_creation_and_edge_timing_are_separate', 'explicit_task_dependencies_win'],
  },
  {
    code: 'quadrant_consistency_validation',
    order: 9,
    title: 'Four-quadrant consistency validation and anomaly ledger',
    status: 'closed_for_current_scope',
    evidenceAssets: ['DurationQuadrantConsistencyLedger', 'wbsPlanRollupService', 'projectCriticalPathService'],
    boundaryPolicy: ['do_not_compare_raw_sum_of_task_days_to_project_duration', 'compare_network_windows_and_rollups'],
  },
  {
    code: 'duration_contribution_ledger',
    order: 10,
    title: 'Duration contribution ledger',
    status: 'closed_for_current_scope',
    evidenceAssets: ['DurationContributionLedger', 'durationContextService.factor_contribution_ledger', 'durationContributionMode'],
    boundaryPolicy: ['explain_days_by_source_layer', 'raw_context_factors_are_not_recomputed_downstream'],
  },
]

const QUADRANTS: DurationClosureQuadrant[] = [
  {
    code: 'Q1_plan_global_duration',
    stage: 'plan_creation',
    durationLevel: 'global',
    primaryFactLayer: 'ProjectGenerationFacts',
    backgroundFactLayer: null,
    algorithmFactContextPhase: 'plan_creation',
    authorityAlgorithm: 'PhaseNetworkPolicy',
    ownerServices: ['projectScenarioTaxonomyService', 'wbsTemplateGenerationService.generateWbsTemplatePhaseChainRows', 'baselineGenerationService'],
    outputContract: 'project_baseline_or_template_generation_phase_windows',
    boundaryPolicy: ['static_facts_dominate', 'phase_network_policy_owns_global_plan_creation_duration'],
  },
  {
    code: 'Q2_plan_single_task_duration',
    stage: 'plan_creation',
    durationLevel: 'single_task',
    primaryFactLayer: 'ProjectGenerationFacts',
    backgroundFactLayer: null,
    algorithmFactContextPhase: 'new_task_reference',
    authorityAlgorithm: 'durationSuggestionService',
    ownerServices: ['durationSuggestionService', 'durationContextService', 'standardWorkDurationSeed'],
    outputContract: 'task_or_itempack_reference_duration_days',
    boundaryPolicy: ['static_facts_dominate', 'single_task_reference_duration_does_not_define_project_total'],
  },
  {
    code: 'Q3_runtime_global_duration',
    stage: 'runtime_execution',
    durationLevel: 'global',
    primaryFactLayer: 'RuntimeExecutionFacts',
    backgroundFactLayer: 'ProjectGenerationFacts',
    algorithmFactContextPhase: 'runtime_delay_recovery',
    authorityAlgorithm: 'scheduleAccelerationService/monthlyPlanGenerationService',
    ownerServices: ['scheduleAccelerationService', 'scheduleAccelerationRuntimeService', 'monthlyPlanGenerationService'],
    outputContract: 'runtime_recovery_monthly_commitment_and_remaining_project_window',
    boundaryPolicy: ['runtime_facts_dominate', 'static_facts_are_background_grouping_and_scale_context'],
  },
  {
    code: 'Q4_runtime_single_task_duration',
    stage: 'runtime_execution',
    durationLevel: 'single_task',
    primaryFactLayer: 'RuntimeExecutionFacts',
    backgroundFactLayer: 'ProjectGenerationFacts',
    algorithmFactContextPhase: 'runtime_forecast',
    authorityAlgorithm: 'taskDurationForecastService/durationSuggestionService',
    ownerServices: ['taskDurationForecastService', 'durationSuggestionService', 'durationContextService'],
    outputContract: 'runtime_single_task_remaining_duration_or_new_task_reference',
    boundaryPolicy: ['runtime_facts_dominate_when_present', 'new_runtime_task_reference_still_keeps_static_profile_as_background'],
  },
]

const CORE_ASSETS: DurationClosureAsset[] = [
  {
    key: 'ProjectGenerationFacts',
    category: 'fact_layer',
    source: 'server/src/services/projectFactsToTemplateService.ts',
    ownerServices: ['projectWizard', 'projectFactsToTemplateService', 'projectGenerationFactsSnapshotService', 'projectGenerationFactsStoreService'],
    role: 'Canonical project static identity, scale, method, scope, delivery and feature contract.',
    consumers: ['template', 'duration', 'dependency', 'context', 'baseline', 'monthlyPlan', 'forecast', 'targetCalibration'],
    boundaryPolicy: [
      'single_project_static_fact_contract',
      'project_metadata_live_store_for_forecast_reread',
      'does_not_rewrite_project_generation_facts',
      'live_store_does_not_rewrite_frozen_baseline_or_monthly_snapshots',
      'not_runtime_execution_state',
    ],
  },
  {
    key: 'RuntimeExecutionFacts',
    category: 'fact_layer',
    source: 'server/src/services/algorithmFactContextService.ts',
    ownerServices: ['algorithmFactContextService', 'runtimeExecutionInferenceService'],
    role: 'Normalized current execution state for forecast, monthly planning and recovery algorithms, including inferred resource, rhythm, milestone-pressure and evidence-object facts derived from existing execution state.',
    consumers: ['duration_context', 'runtime_forecast', 'runtime_delay_recovery', 'monthly_plan'],
    boundaryPolicy: [
      'runtime_primary_after_execution_starts',
      'does_not_rewrite_project_generation_facts',
      'inferred_runtime_facts_use_existing_execution_state_only',
      'no_manual_site_resource_or_workface_inputs_required',
    ],
  },
  {
    key: 'runtimeExecutionInferenceService',
    category: 'fact_layer',
    source: 'server/src/services/runtimeExecutionInferenceService.ts',
    ownerServices: ['runtimeExecutionInferenceService', 'scheduleAccelerationRuntimeService'],
    role: 'Commercializes RuntimeExecutionFacts 3/4/5/8 by converting existing task progress, blocker, milestone and schedule-state signals into inferred facts with confidence, contributions, source window and evidence objects.',
    consumers: ['scheduleAccelerationRuntimeService', 'projectRemainingDurationForecastService', 'scheduleAccelerationService', 'AlgorithmFactContext'],
    boundaryPolicy: [
      'existing_execution_state_only',
      'does_not_require_crew_workface_or_equipment_utilization_manual_inputs',
      'inferred_facts_can_adjust_forecast_only_with_confidence_and_downstream_policy',
      'inferred_facts_do_not_rewrite_task_dates_dependencies_or_static_project_facts',
    ],
  },
  {
    key: 'AlgorithmFactContext',
    category: 'fact_layer',
    source: 'server/src/services/algorithmFactContextService.ts',
    ownerServices: ['algorithmFactContextService'],
    role: 'Unified static/runtime fact weighting context.',
    consumers: ['baselineGenerationService', 'monthlyPlanGenerationService', 'durationContextService', 'taskDurationForecastService', 'scheduleAccelerationService'],
    boundaryPolicy: ['all_execution_phase_algorithms_use_fact_context_weights'],
  },
  {
    key: 'durationPipelineTopology',
    category: 'service_governance',
    source: 'server/src/services/durationAlgorithmClosureGovernanceService.ts',
    ownerServices: [
      'durationAlgorithmClosureGovernanceService',
      'algorithmCatalogService',
      'algorithmRuleAssetInventoryService',
    ],
    role: 'single duration pipeline topology: facts feed five engines, and engines publish governed duration outputs.',
    consumers: ['duration closure tests', 'v1.4.22 phase 1-3 algorithm catalog', 'algorithm governance diagnostics'],
    boundaryPolicy: [
      'facts_engines_outputs_must_stay_single_pipeline',
      'topology_contract_not_algorithm_seed',
      'not_company_or_project_overrideable',
      'five_duration_engines_must_be_cataloged',
    ],
  },
  {
    key: 'durationColdStartTemplateAssetView',
    category: 'service_governance',
    source: 'server/src/services/durationColdStartTemplateRegistryService.ts',
    ownerServices: [
      'durationColdStartTemplateRegistryService',
      't2DivisionRhythmTemplateRegistryService',
      'templateAssemblyCompatibilityCheckService',
      'experienceTierRegistryService',
    ],
    role: 'Read-only cold-start template asset view for C-19.15: maps T2 seeded templates to asset rows and keeps non-T2 template families visible as explicit receipt or adapter gaps.',
    consumers: ['DurationInputAssembler', 'templateAssemblyCompatibilityCheckService', 'v1.4.23.1 non-live closeout contract'],
    boundaryPolicy: [
      'read_only_template_asset_view',
      'non_t2_family_gap_rows_are_explicit_not_fake_green',
      'does_not_grant_runtime_publication_or_auto_apply',
      'no_task_dependency_plan_date_seed_baseline_or_runtime_publication_writes',
    ],
  },
  {
    key: 'projectScenarioTaxonomyService',
    category: 'construction_execution_profile',
    source: 'server/src/services/projectScenarioTaxonomyService.ts',
    ownerServices: ['projectScenarioTaxonomyService'],
    role: 'Unifies business type, recommendation pack, benchmark scenario and schedule profile.',
    consumers: ['projectFactsToTemplateService', 'wbsTemplateGenerationService'],
    boundaryPolicy: ['scenario_profile_authority', 'recommendation_pack_mapping_single_source'],
  },
  {
    key: 'buildingPatternExecutionResolver',
    category: 'construction_execution_profile',
    source: 'server/src/services/buildingPatternExecutionResolver.ts',
    ownerServices: ['buildingPatternExecutionResolver'],
    role: 'Derives construction execution archetype from building patterns and static project facts.',
    consumers: ['projectScenarioTaxonomyService', 'wbsTemplateGenerationService', 'durationContextService'],
    boundaryPolicy: ['derived_theoretical_execution_profile', 'not_manual_frontend_choice'],
  },
  {
    key: 'standardWorkDurationSeed',
    category: 'duration_seed',
    source: 'server/src/seeds/standardWorkDurationSeed.ts',
    ownerServices: ['algorithmSeedResolver', 'durationSuggestionService'],
    role: 'Standard work duration P50, productivity, project type, method and element duration factors.',
    consumers: ['durationSuggestionService', 'durationContextService', 'wbsTemplateGenerationService'],
    boundaryPolicy: ['single_task_reference_duration_seed', 'does_not_own_phase_network'],
  },
  {
    key: 'durationContextService',
    category: 'duration_context',
    source: 'server/src/services/durationContextService.ts',
    ownerServices: ['durationContextService'],
    role: 'Builds the 14-factor duration context and effective factor contribution ledger.',
    consumers: ['durationSuggestionService', 'taskDurationForecastService', 'durationExperienceService'],
    boundaryPolicy: ['context_multiplier_and_extra_days_only', 'uses_algorithm_fact_context'],
  },
  {
    key: 'constructionDependencyRuleSystemService',
    category: 'dependency_network',
    source: 'server/src/services/constructionDependencyRuleSystemService.ts',
    ownerServices: ['constructionDependencyRuleSystemService'],
    role: 'Five-layer dependency ownership and diagnostics.',
    consumers: ['wbsTemplateGenerationService', 'dependency diagnostics', 'planning governance'],
    boundaryPolicy: ['dependency_creation_and_timing_ownership_explicit'],
  },
  {
    key: 'wbsTemplateGenerationService.phaseChain',
    category: 'phase_network',
    source: 'server/src/services/wbsTemplateGenerationService.ts',
    ownerServices: ['wbsTemplateGenerationService'],
    role: 'Generates phase-chain dependencies and initial phase schedule windows.',
    consumers: ['template_generate', 'baseline_generation'],
    boundaryPolicy: ['new_plan_global_duration_only', 'phase_release_clamped_to_project_start'],
  },
  {
    key: 'durationContributionMode',
    category: 'duration_seed',
    source: 'server/src/seeds/durationContributionMode.ts',
    ownerServices: ['durationContributionMode', 'wbsPlanRollupService', 'wbsTemplateGenerationService'],
    role: 'Distinguishes duration-bearing rows from quality gates, handover markers, embedded checks, external waits and record-only rows.',
    consumers: ['wbsTemplateGenerationService', 'wbsPlanRollupService', 'durationSuggestionService', 'task UI'],
    boundaryPolicy: ['zero_duration_control_rows_not_physical_duration_tasks'],
  },
  {
    key: 'durationExperienceService',
    category: 'runtime_algorithm',
    source: 'server/src/services/durationExperienceService.ts',
    ownerServices: ['durationExperienceService'],
    role: 'Collects actual-vs-suggested duration samples for experience feedback.',
    consumers: ['durationSuggestionService', 'algorithm seed learning'],
    boundaryPolicy: ['feedback_loop_only_after_execution_evidence'],
  },
  {
    key: 'progressVelocityLearningService',
    category: 'runtime_algorithm',
    source: 'server/src/services/progressVelocityLearningService.ts',
    ownerServices: ['progressVelocityLearningService'],
    role: 'Learns project progress velocity for runtime duration context.',
    consumers: ['durationContextService', 'taskDurationForecastService'],
    boundaryPolicy: ['runtime_learning_not_static_plan_creation_authority'],
  },
  {
    key: 'durationOutputGovernanceService',
    category: 'runtime_algorithm',
    source: 'server/src/services/durationOutputGovernanceService.ts',
    ownerServices: ['durationOutputGovernanceService'],
    role: 'Semantic contract for governed duration outputs, allowed write targets and boundary policy.',
    consumers: ['wbsTemplateGoldenBenchmarkGateService', 'durationSuggestionService', 'taskDurationForecastService', 'scheduleAccelerationService', 'wbsTemplateGenerationService'],
    boundaryPolicy: ['multiple_duration_outputs_are_allowed_but_not_independent', 'fast_estimate_must_not_write_plan_reference', 'remaining_forecast_must_not_rewrite_plan_duration'],
  },
]

const DARK_ASSETS: DurationClosureAsset[] = [
  {
    key: 'projectClimateResolver',
    category: 'dark_asset',
    source: 'server/src/services/projectClimateResolver.ts',
    ownerServices: ['projectClimateResolver', 'durationContextService'],
    role: 'Infers climate region and construction weather seasonality from project location.',
    consumers: ['seasonal_productivity', 'weather_forecast_impact'],
    boundaryPolicy: ['must_not_conflict_with_locationFacts', 'external_weather_facts_override_static_climate_seed'],
  },
  {
    key: 'engineeringObjectFeatureProfile',
    category: 'dark_asset',
    source: 'server/src/services/durationContextService.ts',
    ownerServices: ['durationContextService'],
    role: 'Merges task engineering-object local feature profile into runtime context.',
    consumers: ['durationContextService', 'taskDurationForecastService'],
    boundaryPolicy: ['local_task_scope_profile_background_only', 'does_not_override_project_generation_facts'],
  },
  {
    key: 'titleWeakRecognitionSeed',
    category: 'dark_asset',
    source: 'server/src/seeds/v1472TitleWeakRecognitionSeed.ts',
    ownerServices: ['algorithmSeedResolver', 'durationSuggestionService'],
    role: 'Infers standard work code from title when task code is missing.',
    consumers: ['durationSuggestionService', 'algorithmSeedCandidateDiscoveryService'],
    boundaryPolicy: ['weak_fallback_only', 'never_overrides_standard_work_code'],
  },
  {
    key: 'earliestStartRuleSeed',
    category: 'dark_asset',
    source: 'server/src/seeds/v1418EarliestStartRuleSeed.ts',
    ownerServices: ['durationContextService', 'taskDurationForecastService'],
    role: 'Internal earliest-start and readiness timing rule for unstarted/runtime tasks.',
    consumers: ['external_readiness', 'taskDurationForecastService'],
    boundaryPolicy: ['internal_subrule_not_standalone_duration_context_factor'],
  },
  {
    key: 'durationContextPolicyGovernance',
    category: 'dark_asset',
    source: 'server/src/services/durationContextPolicy*Service.ts',
    ownerServices: ['durationContextPolicySelectorService', 'durationContextPolicyLearningService', 'durationContextPolicyCanaryApprovalService'],
    role: 'Canary, learning, replay and policy governance around duration context.',
    consumers: ['duration context governance routes', 'policy learning jobs'],
    boundaryPolicy: ['governs_policy_activation_only', 'does_not_change_raw_factor_contract'],
  },
]

const MILESTONE_INTERFACE_TYPES: MilestoneInterfaceType[] = [
  {
    code: 'basement_structure_to_waterproof_backfill',
    label: 'Basement structure completion releases waterproofing, backfill and MEP trunk work.',
    sourceHints: ['phase_chain', 'cross_item_workflow', 'acceptance_gate'],
    releases: ['waterproof', 'backfill', 'mep_trunk'],
  },
  {
    code: 'structure_topping_to_roof_facade_mep',
    label: 'Structure topping or segmented structure completion releases roof, facade, masonry and MEP follow-on work.',
    sourceHints: ['phase_chain', 'cross_item_workflow', 'standard_internal_flow'],
    releases: ['roof', 'facade', 'masonry', 'mep_follow_on'],
  },
  {
    code: 'envelope_closed_to_fitout_commissioning',
    label: 'Envelope and door/window closure releases fit-out wet work, equipment installation and commissioning environment.',
    sourceHints: ['cross_item_workflow', 'handover_marker'],
    releases: ['fitout_wet_work', 'equipment_installation', 'commissioning_environment'],
  },
  {
    code: 'permanent_power_to_joint_commissioning',
    label: 'Permanent power energization releases single-system commissioning, joint commissioning and trial operation.',
    sourceHints: ['external_interface', 'acceptance_plan', 'cross_item_workflow'],
    releases: ['single_system_commissioning', 'joint_commissioning', 'trial_operation'],
  },
  {
    code: 'fire_system_to_fire_acceptance',
    label: 'Fire system completion releases fire detection, fire acceptance and occupancy gate.',
    sourceHints: ['cross_item_workflow', 'acceptance_template', 'pre_milestone'],
    releases: ['fire_detection', 'fire_acceptance', 'occupancy_release'],
  },
  {
    code: 'completion_acceptance_to_handover_opening_production',
    label: 'Completion acceptance or specialty acceptance releases handover, opening or production validation terminal event.',
    sourceHints: ['terminalEvent', 'deliveryStandard', 'acceptance_record'],
    releases: ['owner_handover', 'trial_opening', 'production_validation'],
  },
]

const CONSISTENCY_ANOMALIES = [
  {
    code: 'phase-window-underfilled',
    meaning: 'Phase window is materially longer than the task-network critical path, indicating conservative phase policy or insufficient task expansion.',
  },
  {
    code: 'phase-window-overstretched',
    meaning: 'Task-network critical path is materially longer than the phase window, indicating conflicting seed, dependency or release assumptions.',
  },
  {
    code: 'seed-vs-phase-network-mismatch',
    meaning: 'Single-task or rhythm-package P50 does not fit the phase network window.',
  },
  {
    code: 'task-rollup-vs-phase-policy-mismatch',
    meaning: 'Parent WBS rollup conflicts with the phase network policy.',
  },
  {
    code: 'milestone-gate-missing',
    meaning: 'A known cross-phase handover or release relation lacks a milestone interface gate.',
  },
  {
    code: 'milestone-gate-contradiction',
    meaning: 'A milestone interface gate conflicts with a task dependency or phase release relation.',
  },
]

const CONTRIBUTION_DIMENSIONS = [
  { code: 'project_static_profile_days', sourceLayer: 'ProjectGenerationFacts', owner: 'projectGenerationFactsSnapshotService' },
  { code: 'construction_execution_profile_days', sourceLayer: 'ConstructionExecutionProfile', owner: 'buildingPatternExecutionResolver/projectScenarioTaxonomyService' },
  { code: 'duration_seed_days', sourceLayer: 'standardWorkDurationSeed', owner: 'durationSuggestionService' },
  { code: 'dependency_lag_days', sourceLayer: 'DependencyNetwork', owner: 'constructionDependencyRuleSystemService' },
  { code: 'milestone_gate_days', sourceLayer: 'MilestoneInterfaceNetwork', owner: 'MilestoneInterfaceNetwork' },
  { code: 'runtime_execution_context_days', sourceLayer: 'RuntimeExecutionFacts', owner: 'AlgorithmFactContext/durationContextService' },
]

const CONSISTENCY_LEDGER_BOUNDARY_POLICY = [
  'do_not_compare_raw_sum_of_task_days_to_project_duration',
  'compare_network_windows_and_rollups',
  'report_anomalies_without_mutating_schedule',
]

const CONTRIBUTION_LEDGER_BOUNDARY_POLICY = [
  'explain_days_by_source_layer',
  'effective_context_ledger_is_replay_source',
  'raw_context_factors_are_not_recomputed_downstream',
  'unknown_sources_are_reported_not_silently_merged',
]

const MILESTONE_INTERFACE_BOUNDARY_POLICY = [
  'bridges_phase_network_and_task_dependency',
  'derived_from_seed_rules_acceptance_and_project_facts',
  'business_visible_gate_backend_governed_network',
]

function mapDependencyLayers() {
  const sourceByLayer: Record<string, string> = {
    workflow_sequence_dictionary: 'server/src/seeds/v1474WorkflowDictionarySeed.ts',
    same_parent_internal_flow: 'server/src/seeds/standardInternalFlowSeed.ts',
    cross_item_workflow: 'server/src/seeds/v1475CrossItemWorkflowSeed.ts',
    cross_business_domain_dependency_intent: 'server/src/seeds/v1475DependencyIntentTemplates.ts',
    process_constraint: 'server/src/seeds/v1474ProcessConstraintSeed.ts',
  }
  const codeByLayer: Record<string, string> = {
    workflow_sequence_dictionary: 'L1_workflow_dictionary',
    same_parent_internal_flow: 'L2_standard_internal_flow',
    cross_item_workflow: 'L3_cross_item_workflow',
    cross_business_domain_dependency_intent: 'L4_dependency_intent_template',
    process_constraint: 'L5_process_constraint',
  }
  return CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS.map((layer) => ({
    code: codeByLayer[layer.key] ?? layer.key,
    source: sourceByLayer[layer.key] ?? layer.technicalSources.join(' + '),
    role: layer.name,
    boundaryPolicy: [
      ...layer.owns,
      ...layer.doesNotOwn,
    ],
  }))
}

function finiteNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCodeSet(values: readonly unknown[] | null | undefined) {
  return new Set((values ?? []).map(normalizeCode).filter(Boolean))
}

function pushConsistencyAnomaly(
  anomalies: DurationQuadrantConsistencyAnomaly[],
  anomaly: DurationQuadrantConsistencyAnomaly,
) {
  anomalies.push(anomaly)
}

function isMaterialWindowGap(leftDays: number, rightDays: number, ratioThreshold: number, minGapDays: number) {
  const smaller = Math.max(Math.min(leftDays, rightDays), 1)
  const larger = Math.max(leftDays, rightDays)
  return larger - smaller >= minGapDays && larger / smaller >= ratioThreshold
}

export function evaluateDurationQuadrantConsistency(input: {
  phaseWindows?: DurationQuadrantConsistencyPhaseWindow[] | null
  seedWindows?: DurationQuadrantConsistencySeedWindow[] | null
}): DurationQuadrantConsistencyLedger {
  const anomalies: DurationQuadrantConsistencyAnomaly[] = []
  const phaseWindows = input.phaseWindows ?? []
  const seedWindows = input.seedWindows ?? []

  for (const phase of phaseWindows) {
    const phaseCode = normalizeCode(phase.phaseCode) || 'unknown_phase'
    const phaseWindowDays = finiteNumber(phase.phaseWindowDays)
    const taskNetworkCriticalPathDays = finiteNumber(phase.taskNetworkCriticalPathDays)
    const parentRollupWindowDays = finiteNumber(phase.parentRollupWindowDays)

    if (phaseWindowDays !== null && taskNetworkCriticalPathDays !== null) {
      if (
        phaseWindowDays > taskNetworkCriticalPathDays
        && isMaterialWindowGap(phaseWindowDays, taskNetworkCriticalPathDays, 1.5, 21)
      ) {
        pushConsistencyAnomaly(anomalies, {
          type: 'phase-window-underfilled',
          subjectCode: phaseCode,
          phaseCode,
          severity: 'review',
          reason: 'Phase network window is materially longer than the dependency critical path window.',
          metrics: { phaseWindowDays, taskNetworkCriticalPathDays },
        })
      }
      if (
        taskNetworkCriticalPathDays > phaseWindowDays
        && isMaterialWindowGap(taskNetworkCriticalPathDays, phaseWindowDays, 1.25, 14)
      ) {
        pushConsistencyAnomaly(anomalies, {
          type: 'phase-window-overstretched',
          subjectCode: phaseCode,
          phaseCode,
          severity: 'warning',
          reason: 'Task dependency critical path is materially longer than the phase network window.',
          metrics: { phaseWindowDays, taskNetworkCriticalPathDays },
        })
      }
    }

    if (
      phaseWindowDays !== null
      && parentRollupWindowDays !== null
      && isMaterialWindowGap(phaseWindowDays, parentRollupWindowDays, 1.2, 21)
    ) {
      pushConsistencyAnomaly(anomalies, {
        type: 'task-rollup-vs-phase-policy-mismatch',
        subjectCode: phaseCode,
        phaseCode,
        severity: 'review',
        reason: 'WBS parent rollup window materially conflicts with the phase network policy window.',
        metrics: { phaseWindowDays, parentRollupWindowDays },
      })
    }

    const milestoneGateCodes = normalizeCodeSet(phase.milestoneGateCodes)
    for (const expectedGateCode of normalizeCodeSet(phase.expectedMilestoneGateCodes)) {
      if (milestoneGateCodes.has(expectedGateCode)) continue
      pushConsistencyAnomaly(anomalies, {
        type: 'milestone-gate-missing',
        subjectCode: expectedGateCode,
        phaseCode,
        severity: 'warning',
        reason: 'Expected milestone interface gate is absent from the phase/task network bridge.',
        metrics: { expectedGateCode },
      })
    }
    for (const conflictingGateCode of normalizeCodeSet(phase.conflictingMilestoneGateCodes)) {
      if (!milestoneGateCodes.has(conflictingGateCode)) continue
      pushConsistencyAnomaly(anomalies, {
        type: 'milestone-gate-contradiction',
        subjectCode: conflictingGateCode,
        phaseCode,
        severity: 'warning',
        reason: 'Milestone interface gate conflicts with the current phase release or dependency relation.',
        metrics: { conflictingGateCode },
      })
    }
  }

  for (const seed of seedWindows) {
    const seedReferenceDays = finiteNumber(seed.seedReferenceDays)
    const phaseWindowDays = finiteNumber(seed.phaseWindowDays)
    const stableCode = normalizeCode(seed.stableCode) || 'unknown_seed_window'
    if (
      seedReferenceDays === null
      || phaseWindowDays === null
      || !isMaterialWindowGap(seedReferenceDays, phaseWindowDays, 1.35, 14)
    ) {
      continue
    }
    pushConsistencyAnomaly(anomalies, {
      type: 'seed-vs-phase-network-mismatch',
      subjectCode: stableCode,
      phaseCode: normalizeCode(seed.phaseCode) || undefined,
      severity: 'review',
      reason: 'Single-task or rhythm-package seed reference days do not fit the owning phase network window.',
      metrics: { seedReferenceDays, phaseWindowDays },
    })
  }

  return {
    authority: 'DurationQuadrantConsistencyLedger',
    summary: {
      anomalyCount: anomalies.length,
      comparedDimensions: ['phase_network_windows', 'task_dependency_critical_path', 'milestone_interface_gates', 'wbs_parent_rollups'],
      phaseWindowCount: phaseWindows.length,
      seedWindowCount: seedWindows.length,
    },
    anomalies,
    boundaryPolicy: CONSISTENCY_LEDGER_BOUNDARY_POLICY,
  }
}

export function summarizeDurationContributionLedger(entries: DurationContributionLedgerInput[]): DurationContributionLedgerSummary {
  const dimensionByCode = new Map(CONTRIBUTION_DIMENSIONS.map((dimension) => [dimension.code, dimension]))
  const entriesByDimension: Record<string, DurationContributionLedgerDimensionSummary> = Object.fromEntries(
    CONTRIBUTION_DIMENSIONS.map((dimension) => [dimension.code, {
      dimensionCode: dimension.code,
      sourceLayer: dimension.sourceLayer,
      owner: dimension.owner,
      totalDays: 0,
      entryCount: 0,
      sourceRefs: [],
    }]),
  )
  const unknownEntries: DurationContributionLedgerInput[] = []
  let totalContributionDays = 0
  let unknownContributionDays = 0

  for (const entry of entries) {
    const days = finiteNumber(entry.days) ?? 0
    const dimension = dimensionByCode.get(entry.dimensionCode)
    if (!dimension) {
      unknownEntries.push(entry)
      unknownContributionDays += days
      continue
    }
    const summary = entriesByDimension[dimension.code]
    summary.totalDays += days
    summary.entryCount += 1
    const sourceRef = normalizeCode(entry.sourceRef)
    if (sourceRef && !summary.sourceRefs.includes(sourceRef)) summary.sourceRefs.push(sourceRef)
    totalContributionDays += days
  }

  return {
    authority: 'DurationContributionLedger',
    totalContributionDays,
    unknownContributionDays,
    entriesByDimension,
    unknownEntries,
    boundaryPolicy: CONTRIBUTION_LEDGER_BOUNDARY_POLICY,
  }
}

export function resolveMilestoneInterfaceMatches(input: MilestoneInterfaceMatchInput): MilestoneInterfaceMatchResult {
  const releaseCodes = normalizeCodeSet(input.releaseCodes)
  const existingGateCodes = [...normalizeCodeSet(input.existingGateCodes)]
  const existingGateCodeSet = new Set(existingGateCodes)
  const matchedInterfaces = MILESTONE_INTERFACE_TYPES.filter((item) => (
    item.releases.some((releaseCode) => releaseCodes.has(releaseCode))
  ))
  const missingGateCodes = matchedInterfaces
    .map((item) => item.code)
    .filter((code) => !existingGateCodeSet.has(code))

  return {
    authority: 'MilestoneInterfaceNetwork',
    matchedInterfaces,
    existingGateCodes,
    missingGateCodes,
    boundaryPolicy: MILESTONE_INTERFACE_BOUNDARY_POLICY,
  }
}

export function collectDurationAlgorithmClosureGovernanceReport(): DurationClosureReport {
  const factDiagnostics = getProjectGenerationFactGovernanceDiagnostics()
  const durationContextFactors = listDurationContextFactorConsumptionMatrix()
  const governedAssets: AlgorithmRuleAsset[] = listAlgorithmRuleAssets()
  const durationContextLedgerContract = getDurationContextEffectiveContributionLedgerContract()
  const durationOutputContracts = listDurationOutputContracts()

  return {
    version: DURATION_ALGORITHM_CLOSURE_GOVERNANCE_VERSION,
    sourcePlan: 'docs/plans/v1.4.22算法与规则口径治理体系执行方案.md',
    scope: {
      completedStepCount: 10,
      excludedSteps: ['golden_benchmark_and_parameter_calibration'],
      exclusionReason: 'Golden replay and parameter calibration are deliberately left out of this closure pass.',
      recommendationPackCount: REAL_PROJECT_RECOMMENDATION_PACK_KEYS.length,
      projectScenarioTaxonomyVersion: PROJECT_SCENARIO_TAXONOMY_VERSION,
    },
    steps: STEPS,
    assetInventory: {
      sourcePolicy: 'current_worktree_code_is_authority',
      factCount: factDiagnostics.factCount,
      durationContextFactorCount: durationContextFactors.length,
      governedAlgorithmRuleAssetCount: governedAssets.length,
      assets: CORE_ASSETS,
      darkAssets: DARK_ASSETS,
    },
    quadrants: QUADRANTS,
    factLayer: {
      projectGenerationFacts: {
        role: 'project_static_identity_and_scale',
        diagnostics: factDiagnostics,
        authority: 'ProjectGenerationFacts',
        boundaryPolicy: ['wizard_inputs_normalized_once', 'static_facts_dominate_plan_creation', 'static_facts_are_background_in_runtime'],
      },
      runtimeExecutionFacts: {
        role: 'current_execution_state',
        authority: 'RuntimeExecutionFacts',
        fields: RUNTIME_EXECUTION_FACT_FIELDS,
        boundaryPolicy: ['runtime_facts_dominate_execution_prediction', 'runtime_facts_do_not_rewrite_static_profile'],
      },
      algorithmFactContext: {
        authority: 'AlgorithmFactContext',
        phases: ALGORITHM_FACT_CONTEXT_PHASES,
        boundaryPolicy: ['single_static_runtime_weight_entrypoint', 'services_do_not_pick_weights_locally'],
      },
    },
    constructionExecutionProfile: {
      authority: 'ConstructionExecutionProfile',
      ownerServices: ['buildingPatternExecutionResolver', 'projectScenarioTaxonomyService'],
      archetypes: [
        'highrise_cast_in_place_tower',
        'lowrise_multi_building_parallel',
        'prefab_concrete_supply_chain',
        'steel_assembly_fast_track',
        'mic_modular_fast_track',
        'general_construction',
      ],
      boundaryPolicy: ['derived_from_project_static_facts', 'execution_phase_changes_go_through_runtime_facts'],
    },
    phaseNetworkPolicy: {
      authority: 'PhaseNetworkPolicy',
      ownerServices: ['projectScenarioTaxonomyService', 'wbsTemplateGenerationService.generateWbsTemplatePhaseChainRows'],
      outputContract: ['phase_release_policy', 'phase_chain_dependency', 'phase_chain_schedule_window'],
      boundaryPolicy: ['new_plan_global_duration_only', 'not_runtime_field_execution_state', 'phase_release_may_overlap_but_must_not_start_before_project_start'],
    },
    milestoneInterfaceNetwork: {
      authority: 'MilestoneInterfaceNetwork',
      ownerServices: ['wbsTemplateGenerationService', 'constructionDependencyRuleSystemService', 'acceptanceTemplateService', 'pre-milestones'],
      notA: ['normal_task_dependency', 'phase_overlap_policy', 'frontend_manual_object'],
      interfaceTypes: MILESTONE_INTERFACE_TYPES,
      boundaryPolicy: ['bridges_phase_network_and_task_dependency', 'derived_from_seed_rules_acceptance_and_project_facts', 'business_visible_gate_backend_governed_network'],
    },
    dependencyNetwork: {
      version: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
      layers: mapDependencyLayers(),
      boundaryPolicy: ['explicit_task_dependencies_win', 'dependency_creation_and_edge_timing_are_separate', 'process_constraint_never_creates_dependency'],
    },
    consistencyLedger: {
      authority: 'DurationQuadrantConsistencyLedger',
      compares: ['phase_network_windows', 'task_dependency_critical_path', 'milestone_interface_gates', 'wbs_parent_rollups'],
      anomalyTypes: CONSISTENCY_ANOMALIES,
      boundaryPolicy: ['do_not_compare_raw_sum_of_task_days_to_project_duration', 'compare_network_windows_and_rollups'],
    },
    contributionLedger: {
      authority: 'DurationContributionLedger',
      durationContextLedgerContract,
      dimensions: CONTRIBUTION_DIMENSIONS,
      boundaryPolicy: ['explain_days_by_source_layer', 'effective_context_ledger_is_replay_source', 'raw_context_factors_are_not_recomputed_downstream'],
    },
    durationOutputGovernance: {
      authority: 'DurationOutputContract',
      outputCount: durationOutputContracts.length,
      contracts: durationOutputContracts,
      boundaryPolicy: [
        'duration_outputs_are_semantic_contracts_not_independent_algorithms',
        'write_targets_must_be_allowed_by_output_contract',
        'golden_replay_must_declare_duration_output_under_test',
      ],
    },
  }
}
