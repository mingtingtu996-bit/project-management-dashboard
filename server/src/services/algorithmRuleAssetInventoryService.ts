import {
  ALGORITHM_SEED_REGISTRY,
  listAlgorithmSeedTypes,
  type AlgorithmSeedType,
} from './algorithmSeedRegistry.js'
import {
  type AlgorithmSeedGovernanceCapability,
  getAlgorithmSeedGovernancePolicy,
} from './algorithmSeedGovernancePolicyService.js'
import {
  getProjectGenerationFactGovernanceDiagnostics,
  listProjectGenerationFactConsumers,
} from './projectGenerationFactsConsumerRegistry.js'
import {
  GOVERNED_DURATION_CONTEXT_FACTOR_KEYS,
  listDurationContextFactorAutomationPolicies,
  listDurationContextFactorConsumptionMatrix,
} from './durationContextGovernanceService.js'
import {
  discoverV14AssetSources,
  type V14DiscoveredAssetSource,
} from './v14AssetDiscoveryService.js'
import type {
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetLearningMaturity,
  AlgorithmAssetLearningTarget,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'

export const ALGORITHM_RULE_ASSET_INVENTORY_VERSION = 'v1.4.24-rule-asset-inventory-20260527'

export type AlgorithmRuleAssetLifecycleType =
  | 'algorithm_seed'
  | 'template_catalog'
  | 'notification_policy'
  | 'data_quality'
  | 'metric_registry'
  | 'field_registry'
  | 'status_registry'
  | 'reminder_policy'
  | 'lineage_governance'
  | 'drawing_review_rule'
  | 'service_governance'
  | 'candidate_for_algorithm_seed'

export type AlgorithmRuleAssetRecommendation =
  | 'keep_in_algorithm_seed_lifecycle'
  | 'keep_independent_governance'
  | 'diagnostic_bridge_only'
  | 'evaluate_before_seed_inclusion'

export type AlgorithmRuleAsset = {
  key: string
  name: string
  source: string
  lifecycleType: AlgorithmRuleAssetLifecycleType
  governanceSystem: string
  ownerService: string
  role: string
  consumers: string[]
  recommendation: AlgorithmRuleAssetRecommendation
  reason: string
  boundaryPolicy: string[]
  algorithmSeedType?: AlgorithmSeedType
  recordCount?: number
  capabilities?: AlgorithmSeedGovernanceCapability
  learningTarget?: AlgorithmAssetLearningTarget
  learningMaturity?: AlgorithmAssetLearningMaturity
  publishAnchor?: AlgorithmAssetPublishAnchor
  automationMaturity?: AlgorithmAssetAutomationMaturity
}

export type ListAlgorithmRuleAssetOptions = {
  lifecycleType?: AlgorithmRuleAssetLifecycleType | null
  recommendation?: AlgorithmRuleAssetRecommendation | null
}

export type AlgorithmRuleAssetInventoryDiagnostics = {
  version: string
  summary: {
    totalAssetCount: number
    algorithmSeedCount: number
    independentGovernanceCount: number
    diagnosticBridgeCount: number
    candidateForAlgorithmSeedCount: number
    countsByLifecycleType: Record<AlgorithmRuleAssetLifecycleType, number>
    countsByRecommendation: Record<AlgorithmRuleAssetRecommendation, number>
  }
  gaps: {
    duplicateAssetKeys: string[]
    missingAlgorithmSeedTypes: AlgorithmSeedType[]
    algorithmSeedAssetsMissingSeedType: string[]
    algorithmSeedAssetsMissingCapabilities: string[]
  }
  assetsByLifecycleType: Record<AlgorithmRuleAssetLifecycleType, AlgorithmRuleAsset[]>
  assetsByRecommendation: Record<AlgorithmRuleAssetRecommendation, AlgorithmRuleAsset[]>
  assets: AlgorithmRuleAsset[]
}

export type AlgorithmAssetAdmissionGateBlockerCode =
  | 'project_fact_without_consumer'
  | 'project_fact_without_generation_consumer'
  | 'duration_context_factor_without_consumption_matrix'
  | 'duration_context_factor_without_primary_consumer'
  | 'duration_context_factor_without_runtime_effect'
  | 'duration_context_factor_without_automation_policy'
  | 'algorithm_seed_without_rule_asset'
  | 'algorithm_seed_asset_without_capability'
  | 'duplicate_rule_asset_key'

export type AlgorithmAssetAdmissionGateBlocker = {
  code: AlgorithmAssetAdmissionGateBlockerCode
  subjects: string[]
  detail: string
}

export type AlgorithmAssetAdmissionGate = {
  gateCode: 'algorithm_asset_admission_gate'
  status: 'pass' | 'block'
  requiredFor: Array<
    | 'adding_project_generation_fact'
    | 'adding_duration_context_factor'
    | 'adding_algorithm_seed_type'
    | 'adding_rule_or_governance_asset'
    | 'before_golden_benchmark_replay'
  >
  summary: {
    projectFactUncoveredCount: number
    projectFactWithoutGenerationConsumerCount: number
    durationFactorCount: number
    durationFactorMissingConsumerCount: number
    durationFactorMissingAutomationPolicyCount: number
    algorithmSeedMissingAssetCount: number
    algorithmSeedMissingCapabilityCount: number
    duplicateRuleAssetKeyCount: number
  }
  blockers: AlgorithmAssetAdmissionGateBlocker[]
  boundaryPolicy: string[]
}

const LIFECYCLE_TYPES: AlgorithmRuleAssetLifecycleType[] = [
  'algorithm_seed',
  'template_catalog',
  'notification_policy',
  'data_quality',
  'metric_registry',
  'field_registry',
  'status_registry',
  'reminder_policy',
  'lineage_governance',
  'drawing_review_rule',
  'service_governance',
  'candidate_for_algorithm_seed',
]

const RECOMMENDATIONS: AlgorithmRuleAssetRecommendation[] = [
  'keep_in_algorithm_seed_lifecycle',
  'keep_independent_governance',
  'diagnostic_bridge_only',
  'evaluate_before_seed_inclusion',
]

function uniqueStrings(values: readonly unknown[] | undefined) {
  if (!values) return []
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function buildAlgorithmSeedAssets(): AlgorithmRuleAsset[] {
  return ALGORITHM_SEED_REGISTRY.map((entry) => {
    const policy = getAlgorithmSeedGovernancePolicy(entry.seedType)
    return {
      key: entry.seedType,
      name: entry.meta.seedScope || entry.seedType,
      source: `algorithm_seed_records.${entry.seedType}`,
      lifecycleType: 'algorithm_seed',
      governanceSystem: 'algorithm_seed_lifecycle',
      ownerService: 'algorithmSeedResolver/algorithmSeedValidationService/algorithmSeedLearningService/algorithmSeedAutoGovernanceService/algorithmSeedImportService',
      role: entry.meta.relationshipRole || entry.meta.seedScope || 'governed_algorithm_seed',
      consumers: uniqueStrings(entry.meta.downstreamRuleTypes),
      recommendation: 'keep_in_algorithm_seed_lifecycle',
      reason: 'Governed by services 27-31: resolver, validation, learning, auto-governance, import, versioning, and rollback.',
      boundaryPolicy: uniqueStrings([
        ...(entry.meta.boundaryPolicy ?? []),
        'auto_governance_local_status_requires_release_execution_before_runtime_override',
      ]),
      algorithmSeedType: entry.seedType,
      recordCount: entry.records.length,
      capabilities: policy.capabilities,
    } satisfies AlgorithmRuleAsset
  })
}

const NON_SEED_RULE_ASSETS: AlgorithmRuleAsset[] = [
  {
    key: 'dataQualityRuleRegistry',
    name: 'Data quality rule registry',
    source: 'server/src/services/dataQualityRuleRegistry.ts',
    lifecycleType: 'data_quality',
    governanceSystem: 'data_quality_governance',
    ownerService: 'dataQualityService/dataQualityGovernanceService',
    role: 'quality finding dimension, severity, recommendation and owner digest policy registry',
    consumers: ['dataQualityService', 'dataQualityGovernanceService', 'projectExecutionSummaryService'],
    recommendation: 'keep_independent_governance',
    reason: 'Data-quality findings are runtime diagnostics and recommendations, not algorithm seed overrides.',
    boundaryPolicy: ['does_not_create_algorithm_seed_records', 'does_not_mutate_schedule_facts', 'own_data_quality_lifecycle'],
  },
  {
    key: 'notificationTouchpointRules',
    name: 'Notification touchpoint projection rules',
    source: 'server/src/services/notificationTouchpointRules.ts',
    lifecycleType: 'notification_policy',
    governanceSystem: 'notification_governance',
    ownerService: 'todoTouchpointService/notification services',
    role: 'notification projection, action due date, dedupe and attention touchpoint policy',
    consumers: ['todoTouchpointService', 'weeklyDigestService', 'notification routes'],
    recommendation: 'keep_independent_governance',
    reason: 'Notification projection rules govern user attention delivery and should not be imported as algorithm seeds.',
    boundaryPolicy: ['notification_delivery_only', 'does_not_create_business_facts', 'does_not_change_schedule_or_warning_thresholds'],
  },
  {
    key: 'materialArrivalReminderRule',
    name: 'Material arrival reminder rule',
    source: 'server/src/services/materialArrivalReminderRuleRegistry.ts',
    lifecycleType: 'reminder_policy',
    governanceSystem: 'material_arrival_reminder_governance',
    ownerService: 'materialArrivalReminderService',
    role: 'material reminder window, recipient, cadence, dedupe and quiet-overdue policy',
    consumers: ['materialArrivalReminderService', 'weeklyDigestService'],
    recommendation: 'keep_independent_governance',
    reason: 'Reminder policies create notifications only; they are not schedule, warning or seed authority.',
    boundaryPolicy: ['notification_only', 'does_not_create_risk_issue_warning', 'does_not_mutate_material_or_task_facts'],
  },
  {
    key: 'scheduler',
    name: 'Scheduled governance job orchestrator',
    source: 'server/src/scheduler.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'scheduled_governance_job_orchestration',
    ownerService: 'scheduler',
    role: 'central scheduler for data quality, snapshots, warnings, retention, template policy, climate, weather, duration replay and seed candidate governance jobs',
    consumers: ['background jobs', 'governance diagnostics', 'project snapshots', 'notification lifecycle'],
    recommendation: 'keep_independent_governance',
    reason: 'The scheduler orchestrates governed background jobs and must be visible in the asset ledger, but it does not define an algorithm, seed, or user-facing metric formula.',
    boundaryPolicy: ['orchestration_only', 'does_not_define_algorithm_formula', 'does_not_create_seed_records', 'company_or_project_jobs_must_filter_scope_in_called_services'],
  },
  {
    key: 'algorithmSeedUpgradeCandidateSurface',
    name: 'Algorithm seed upgrade candidate surface',
    source: 'algorithm_seed_upgrade_candidates',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_seed_candidate_governance_surface',
    ownerService: 'algorithmSeedCandidateDiscoveryService/algorithmSeedLearningService/algorithmSeedAutoGovernanceService',
    role: 'project and company scoped candidate table for discovered seed upgrades, learning proposals and governed candidate-only findings before release-exit',
    consumers: [
      'algorithmSeedCandidateDiscoveryService',
      'algorithmSeedLearningService',
      'algorithmSeedAutoGovernanceService',
      'regionalClimateRuleCandidateService',
      'projectHealthService',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Candidate rows are governance inputs and replay evidence; they must not be treated as published seed records or runtime overrides until the v1.4.22.3 release chain proves scope, conflict, writer, consumer, monitoring and rollback.',
    boundaryPolicy: [
      'candidate_rows_are_governance_inputs_not_runtime_publications',
      'candidate_promotion_requires_publish_anchor_release_exit_domain_writer_and_rollback',
      'candidate_surface_must_preserve_company_project_scope',
      'candidate_surface_does_not_write_algorithm_seed_records_or_overrides',
      'local_auto_published_status_is_not_runtime_publication',
    ],
  },
  {
    key: 'algorithmSeedOverrideSurface',
    name: 'Algorithm seed override runtime surface',
    source: 'algorithm_seed_overrides',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_seed_override_runtime_surface',
    ownerService: 'algorithmSeedResolver/algorithmSeedLearningService',
    role: 'scoped seed override read surface for project and company runtime resolution after explicit governance publication',
    consumers: [
      'algorithmSeedResolver',
      'algorithmSeedLearningService',
      'duration algorithms',
      'planning algorithms',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Seed override rows may be consumed by the resolver only after scope and release evidence are valid; local auto-governance status or candidate confidence cannot write this surface directly.',
    boundaryPolicy: [
      'seed_override_rows_require_company_or_project_scope',
      'seed_override_runtime_consumption_requires_release_record_consumer_verification_and_rollback',
      'local_auto_published_status_cannot_write_seed_override',
      'seed_override_surface_is_not_system_seed_mutation',
      'seed_override_writer_must_be_asset_type_specific',
    ],
  },
  {
    key: 'durationSuggestionOverrideSurface',
    name: 'Duration suggestion override governance surface',
    source: 'duration_suggestion_overrides',
    lifecycleType: 'service_governance',
    governanceSystem: 'duration_suggestion_override_governance_surface',
    ownerService: 'manualDurationCorrectionService/templateDurationGovernanceService/durationSuggestionService',
    role: 'project or company scoped duration override surface for manual corrections and template duration governance, separate from system seed and standard duration mutation',
    consumers: [
      'durationSuggestionService',
      'manualDurationCorrectionService',
      'templateDurationGovernanceService',
      'duration algorithm diagnostics',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Duration suggestion overrides are scoped business governance records and must not be upgraded into algorithm self-publication, system seed changes, standard_work_duration rewrites or historical snapshot edits.',
    boundaryPolicy: [
      'duration_override_rows_are_project_or_company_scoped',
      'manual_duration_corrections_are_business_governance_not_algorithm_self_publish',
      'duration_override_surface_does_not_modify_system_seed_or_standard_work_duration',
      'duration_override_runtime_effect_requires_scope_and_audit_evidence',
      'duration_override_surface_does_not_rewrite_confirmed_plan_or_history',
    ],
  },
  {
    key: 'policyTemplateReleaseImpactMonitoringJob',
    name: 'Policy template release impact monitoring job',
    source: 'server/src/jobs/policyTemplateReleaseImpactMonitoringJob.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'policy_template_release_execution',
    ownerService: 'policyTemplateReleaseImpactMonitoringJob',
    role: 'scheduled v1.4.22.3 post-release monitor that records stable policy template impact checks and rollback events after threshold violations',
    consumers: [
      'scheduler',
      'policyTemplateReleaseExecutionService',
      'certificateTemplatePolicyUpdateService',
      'acceptanceTemplatePolicyUpdateService',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The job turns policy template release impact monitoring into a scheduled execution path: it records monitoring events for stable certificate / acceptance policy runs and records rollback events when thresholds fail, without writing template entity runtime publications or seed records.',
    boundaryPolicy: [
      'stable_policy_runs_are_monitored_after_publication',
      'monitoring_failure_records_rollback_event',
      'does_not_write_template_runtime_publications_or_seed_tables',
      'candidate_runs_remain_admin_audit_only',
    ],
  },
  {
    key: 'metricRegistry',
    name: 'Metric registry',
    source: 'server/src/services/metricRegistryService.ts',
    lifecycleType: 'metric_registry',
    governanceSystem: 'metric_registry',
    ownerService: 'metricRegistryService/projectExecutionSummaryService/project_daily_snapshot',
    role: 'BI metric definition, source and caliber registry',
    consumers: ['Dashboard', 'Reports', 'CompanyCockpit', 'projectExecutionSummaryService'],
    recommendation: 'keep_independent_governance',
    reason: 'Metric definitions are the BI truth registry and must stay separate from algorithm seed override semantics.',
    boundaryPolicy: ['metric_definition_only', 'no_runtime_rule_promotion', 'summary_and_snapshot_are_truth_sources'],
  },
  {
    key: 'planningFieldRegistry',
    name: 'Planning field registry',
    source: 'server/src/services/planningFieldRegistryService.ts',
    lifecycleType: 'field_registry',
    governanceSystem: 'planning_field_registry',
    ownerService: 'planningFieldRegistryService',
    role: 'planning field schema, labels and visibility registry',
    consumers: ['planning routes', 'planning UI metadata'],
    recommendation: 'keep_independent_governance',
    reason: 'Field registries describe schema and UI metadata; they are not learnable algorithm rules.',
    boundaryPolicy: ['schema_metadata_only', 'does_not_create_seed_candidates'],
  },
  {
    key: 'projectGenerationFacts',
    name: 'Project generation facts',
    source: 'server/src/services/projectGenerationFactsConsumerRegistry.ts',
    lifecycleType: 'field_registry',
    governanceSystem: 'project_generation_fact_governance',
    ownerService: 'projectFactsToTemplateService/projectWizard/wbsTemplateGenerationService',
    role: 'canonical wizard-to-generation fact contract and downstream consumer matrix',
    consumers: listProjectGenerationFactConsumers(),
    recommendation: 'keep_independent_governance',
    reason: 'Project facts are the single normalized input contract for template recommendation, WBS generation, duration scaling, dependency scheduling, context factors, baseline and monthly planning; they are not learnable algorithm seed records.',
    boundaryPolicy: ['wizard_inputs_normalized_once', 'removed_legacy_aliases_not_accepted', 'every_canonical_fact_requires_declared_consumer'],
  },
  {
    key: 'wbsTemplateGoldenBenchmarkGate',
    name: 'WBS template golden benchmark gate',
    source: 'server/src/services/wbsTemplateGoldenBenchmarkGateService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'wbs_template_golden_benchmark_gate',
    ownerService: 'wbsTemplateGoldenBenchmarkGateService/wbsTemplateGenerationService/projectScenarioTaxonomyService',
    role: 'blocking verification contract for 13 real-project template coverage, deep coverage, schedule duration tolerance, dependency pass rate and row-count bounds',
    consumers: ['WBS template governance tests', 'WBS generation release checks', 'project scenario taxonomy', 'template recommendation governance'],
    recommendation: 'keep_independent_governance',
    reason: 'The golden benchmark compares generated outcomes against real-project acceptance thresholds; it governs release quality and should not be imported as an algorithm seed.',
    boundaryPolicy: ['blocks_template_schedule_regression', 'pure_verification_no_runtime_mutation', 'real_project_matrix_is_required_scope'],
  },
  {
    key: 'wbsTemplateRecommendationAccuracyMatrixService',
    name: 'WBS template recommendation accuracy matrix',
    source: 'server/src/services/wbsTemplateRecommendationAccuracyMatrixService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'wbs_template_recommendation_accuracy_matrix',
    ownerService: 'wbsTemplateRecommendationAccuracyMatrixService',
    role: 'v1.4.22.4 recommendation-pack accuracy ledger that converts 13 real-project replay results into commercial-ready, candidate-only and blocked calibration queues',
    learningTarget: 'governance_report',
    learningMaturity: 'shadow_report_only',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    consumers: [
      'wbsTemplateGoldenBenchmarkGateService',
      'projectScenarioTaxonomyService',
      'duration commercial readiness diagnostics',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The matrix governs industry/recommendation-pack accuracy readiness and calibration queues from replay evidence. It is a v1.4.22.4 precision ledger consumed by v1.4.22.3 governance, not a parameter tuner or runtime writer.',
    boundaryPolicy: [
      'accuracy_matrix_controls_commercial_readiness_not_direct_parameter_tuning',
      'failed_or_missing_packs_remain_candidate_only_until_replay_passes',
      'calibration_candidates_must_enter_algorithm_asset_governance_before_runtime_effect',
      'does_not_write_plan_dates_dependencies_seed_records_or_runtime_overrides',
      'v14224_proves_accuracy_v14223_controls_publishability',
    ],
  },
  {
    key: 'durationAlgorithmClosureGovernance',
    name: 'Duration algorithm closure governance report',
    source: 'server/src/services/durationAlgorithmClosureGovernanceService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'duration_algorithm_closure_governance',
    ownerService: 'durationAlgorithmClosureGovernanceService',
    role: 'first-ten-step duration closure ledger for assets, quadrants, fact layers, execution profile, phase network, milestone interface network, dependency network, consistency ledger and contribution ledger',
    consumers: ['v1.4.22 duration closure tests', 'algorithm governance diagnostics', 'duration algorithm implementation closure'],
    recommendation: 'keep_independent_governance',
    reason: 'This report is the governance outlet for duration-algorithm closure; it explains and verifies boundaries but does not learn seed records or mutate runtime plans.',
    boundaryPolicy: [
      'covers_first_ten_duration_closure_steps',
      'excludes_golden_benchmark_parameter_calibration',
      'does_not_create_algorithm_seed_records',
      'pure_governance_report_no_runtime_mutation',
    ],
  },
  {
    key: 'algorithmAssetAdmissionGate',
    name: 'Algorithm asset admission gate',
    source: 'server/src/services/algorithmRuleAssetInventoryService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_admission_gate',
    ownerService: 'algorithmRuleAssetInventoryService/projectGenerationFactsConsumerRegistry/durationContextGovernanceService',
    role: 'mandatory intake gate for new project facts, duration context factors, algorithm seed types and governed rule assets before golden replay or runtime publication',
    consumers: ['algorithm governance diagnostics', 'golden benchmark preflight', 'release checks'],
    recommendation: 'keep_independent_governance',
    reason: 'The gate blocks unregistered fields, factors, seed types and duplicate rule assets without becoming a seed or mutating runtime plans.',
    boundaryPolicy: [
      'blocks_unregistered_project_facts',
      'blocks_unregistered_duration_context_factors',
      'blocks_uninventoried_algorithm_seed_types',
      'blocks_duplicate_rule_asset_keys',
      'pure_governance_report_no_runtime_mutation',
    ],
  },
  {
    key: 'algorithmAssetGovernanceProtocol',
    name: 'Algorithm asset governance protocol',
    source: 'server/src/services/algorithmAssetGovernanceProtocolService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_governance_protocol',
    ownerService: 'algorithmAssetGovernanceProtocolService',
    role: 'v1.4.22.3 unified publish-anchor, automation-maturity and learning-maturity protocol for multi-source rule asset candidates',
    consumers: [
      'algorithmSeedAutoGovernanceService',
      'v14AssetAdmissionAutomationService',
      'rule asset governance adapters',
      'asset publish gate tests',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The protocol normalizes candidate events and publish requests across seed, WBS, certificate, weather and duration learning entries, without becoming a business algorithm or runtime writer.',
    boundaryPolicy: [
      'publish_anchor_and_automation_maturity_are_required_for_runtime_publish',
      'missing_fields_default_to_candidate_only_manual_required',
      'manual_anchors_cannot_be_bypassed_by_single_candidate',
      'llm_generated_payloads_default_to_candidate_or_review',
      'anchor_upgrade_is_versioned_governance_asset',
      'pure_protocol_no_direct_runtime_mutation',
    ],
  },
  {
    key: 'algorithmAssetAnchorUpgradeStrategyService',
    name: 'Algorithm asset anchor upgrade strategy service',
    source: 'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_anchor_upgrade_strategy',
    ownerService: 'algorithmAssetAnchorUpgradeStrategyService',
    role: 'versioned strategy evaluator for converting manual publish anchors into controlled automation candidates',
    consumers: [
      'algorithmAssetGovernanceProtocolService',
      'platform exception governance',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Anchor upgrades are governance assets: the service can generate versioned upgrade candidates from registered strategy, threshold, impact, rollback and audit evidence, but never modifies publish anchors or runtime by itself.',
    boundaryPolicy: [
      'anchor_upgrade_generates_versioned_candidate_only',
      'single_candidate_or_single_replay_cannot_upgrade_manual_anchor',
      'requires_strategy_version_threshold_impact_rollback_and_audit',
      'does_not_modify_publish_anchor_or_runtime',
      'llm_cannot_approve_anchor_upgrade',
    ],
  },
  {
    key: 'algorithmAssetAutomationMaturityService',
    name: 'Algorithm asset automation maturity service',
    source: 'server/src/services/algorithmAssetAutomationMaturityService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_automation_maturity',
    ownerService: 'algorithmAssetAutomationMaturityService',
    role: 'v1.4.22.3 unlock package generator for manual-required rule assets to produce verification needs, shadow and canary suggestions without runtime writes',
    consumers: [
      'algorithmAssetGovernanceProtocolService',
      'platform exception governance',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Automation maturity review is a governance package: it can suggest evidence collection, shadow comparison and canary readiness, but it never modifies publish anchors, automation maturity or runtime by itself.',
    boundaryPolicy: [
      'manual_assets_generate_unlock_packages_not_runtime_writes',
      'shadow_and_canary_suggestions_are_not_publish_permission',
      'requires_versioned_anchor_upgrade_before_release_gate',
      'does_not_modify_publish_anchor_automation_maturity_or_runtime',
      'pure_governance_report_no_runtime_mutation',
    ],
  },
  {
    key: 'algorithmAssetExplanationChainService',
    name: 'Algorithm asset explanation chain service',
    source: 'server/src/services/algorithmAssetExplanationChainService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_explanation_chain',
    ownerService: 'algorithmAssetExplanationChainService',
    role: 'v1.4.22.3 versioned explanation-chain contract for algorithm asset governance metadata and preserved business reasons',
    consumers: [
      'algorithmAssetGovernanceProtocolService',
      'rule asset governance adapters',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service standardizes explanation-chain metadata for governed algorithm assets while preserving existing businessReason fields and never acting as a runtime writer.',
    boundaryPolicy: [
      'business_reason_is_preserved_not_rewritten',
      'explanation_chain_is_governance_metadata_not_runtime_writer',
      'runtime_write_still_requires_release_exit_domain_writer_consumer_monitoring_and_rollback',
      'explanation_chain_does_not_modify_publish_anchor_or_automation_maturity',
    ],
  },
  {
    key: 'algorithmAssetGovernanceDashboardEvidenceService',
    name: 'Algorithm asset governance dashboard evidence service',
    source: 'server/src/services/algorithmAssetGovernanceDashboardEvidenceService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_governance_dashboard_evidence',
    ownerService: 'algorithmAssetGovernanceDashboardEvidenceService',
    role: 'v1.4.22.3 company-scoped backend governance evidence summary for candidate, replay and sample-health records',
    consumers: [
      'algorithm seed governance dashboard route',
      'company admin governance diagnostics',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service summarizes governance evidence for the current company only, proving dashboard observability without exposing other companies or writing runtime rules.',
    boundaryPolicy: [
      'dashboard_evidence_filters_by_current_company_id',
      'system_observation_and_other_company_rows_are_excluded',
      'sample_health_summary_is_observable_without_runtime_write',
      'dashboard_evidence_service_does_not_publish_or_mutate_runtime',
    ],
  },
  {
    key: 'algorithmAssetIsolationMatrixService',
    name: 'Algorithm asset isolation matrix service',
    source: 'server/src/services/algorithmAssetIsolationMatrixService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_isolation_matrix',
    ownerService: 'algorithmAssetIsolationMatrixService',
    role: 'v1.4.22.3 runtime isolation matrix gate requiring writer, consumer, cache, async job and rollback evidence per scoped asset type',
    consumers: [
      'v1.4.22.3 governance gate',
      'platform exception governance',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service prevents dashboard-only isolation from being reported as full runtime isolation by requiring explicit per-surface evidence for each runtime asset type; it reports evidence gaps and never writes runtime state.',
    boundaryPolicy: [
      'dashboard_summary_is_not_runtime_isolation_proof',
      'writer_consumer_cache_async_rollback_scopes_must_be_verified_per_asset_type',
      'not_applicable_surfaces_require_reason_and_evidence_ref',
      'does_not_write_runtime_or_modify_publish_anchor',
    ],
  },
  {
    key: 'algorithmAssetCandidateEventAdapter',
    name: 'Algorithm asset candidate event adapter',
    source: 'server/src/services/algorithmAssetCandidateEventAdapterService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_candidate_event_adapter',
    ownerService: 'algorithmAssetCandidateEventAdapterService',
    role: 'v1.4.22.3 multi-source learning intake adapter that normalizes seed, WBS, certificate, weather and duration candidates before governance protocol evaluation',
    consumers: [
      'algorithmAssetGovernanceProtocolService',
      'algorithmSeedCandidateDiscoveryService',
      'wbsTemplateCandidateEventService',
      'durationContextPolicyLearningService',
      'certificateTemplatePolicyUpdateService',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The adapter converts local learning outputs into scoped candidate events and delegates publish decisions to the governance protocol instead of allowing local services to write runtime rules directly.',
    boundaryPolicy: [
      'all_learning_entries_must_create_candidate_event_before_runtime_publish',
      'missing_scope_defaults_to_system_observation',
      'legacy_scope_fields_quarantine_candidate',
      'legacy_local_publication_status_requires_review',
      'llm_generated_candidate_defaults_to_review',
      'candidate_event_adapter_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetConflictService',
    name: 'Algorithm asset conflict arbitration service',
    source: 'server/src/services/algorithmAssetConflictService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_conflict_arbitration',
    ownerService: 'algorithmAssetConflictService',
    role: 'v1.4.22.3 conflict arbitration gate that protects only publication-evidence-backed active/published rules, manual anchors and scope boundaries before candidate promotion',
    consumers: [
      'algorithmAssetCandidateEventAdapterService',
      'asset publish gate tests',
      'rule asset governance adapters',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service arbitrates candidate events against existing active or published rules so local learning outputs cannot overwrite scoped runtime rules without unified publication evidence, anchor, scope, consumer, monitoring and rollback checks.',
    boundaryPolicy: [
      'existing_active_or_published_rule_requires_unified_publication_evidence',
      'unverified_published_rule_enters_legacy_audit_before_runtime_arbitration',
      'manual_anchor_existing_rules_block_candidate_overwrite',
      'project_candidate_cannot_replace_company_or_system_rule',
      'same_scope_publish_requires_rollback_target',
      'conflict_service_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetReplayService',
    name: 'Algorithm asset replay evidence service',
    source: 'server/src/services/algorithmAssetReplayService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_replay_evidence',
    ownerService: 'algorithmAssetReplayService',
    role: 'v1.4.22.3 offline replay normalizer that turns scoped samples into original/actual/overlay error evidence for candidate promotion gates',
    learningTarget: 'governance_report',
    learningMaturity: 'shadow_report_only',
    publishAnchor: 'candidate_only',
    automationMaturity: 'auto_shadow',
    consumers: [
      'algorithmAssetCandidateEventAdapterService',
      'algorithmAssetConflictService',
      'asset publish gate tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service summarizes replay evidence, rejects out-of-scope samples and feeds candidate governance without becoming a business algorithm or writing runtime rules.',
    boundaryPolicy: [
      'replay_samples_must_match_candidate_company_or_project_scope',
      'replay_summary_includes_original_actual_overlay_mae_and_overcompensation',
      'shadow_report_only_replay_cannot_write_runtime',
      'existing_active_or_published_rule_requires_unified_publication_evidence',
      'replay_service_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetReleaseExitService',
    name: 'Algorithm asset release-exit service',
    source: 'server/src/services/algorithmAssetReleaseExitService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_release_exit',
    ownerService: 'algorithmAssetReleaseExitService',
    role: 'v1.4.22.3 final release-exit gate that builds explicit handoff packages for domain runtime adapters after publish anchor, replay, conflict, impact monitoring and rollback checks',
    consumers: [
      'algorithmAssetGovernanceProtocolService',
      'algorithmAssetReplayService',
      'algorithmAssetConflictService',
      'domain release adapters',
      'asset publish gate tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service separates candidate governance from runtime mutation by requiring an explicit target adapter, rollback support, conflict clearance, impact monitoring and platform policy before any release handoff can proceed.',
    boundaryPolicy: [
      'release_exit_requires_explicit_domain_adapter',
      'release_exit_requires_publish_gate_replay_conflict_and_rollback',
      'release_exit_requires_impact_monitoring_for_all_runtime_handoffs',
      'manual_anchor_conflicts_cannot_handoff_to_runtime_adapter',
      'system_publish_requires_platform_policy_monitoring_and_release_exit',
      'release_exit_service_builds_package_only_and_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetPromotionRollbackGateService',
    name: 'Algorithm asset promotion and rollback completion gate service',
    source: 'server/src/services/algorithmAssetPromotionRollbackGateService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_asset_promotion_rollback_gate',
    ownerService: 'algorithmAssetPromotionRollbackGateService',
    role: 'v1.4.22.3 runtime-claim guard that prevents release-exit handoff, rollback target or audit events from being misreported as completed runtime promotion or rollback',
    consumers: [
      'algorithmAssetReleaseExitService',
      'domain release adapters',
      'runtime consumers',
      'asset publish gate tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The gate only evaluates whether promotion or rollback completion may be declared: promotion needs domain writer execution, release record, consumer verification, impact monitoring and rollback target; rollback needs writer disable/degrade execution plus consumer verification that the rolled-back version is no longer read.',
    boundaryPolicy: [
      'release_exit_handoff_is_not_runtime_publication',
      'promotion_requires_domain_writer_release_record_consumer_verification_monitoring_and_rollback',
      'rollback_audit_is_not_runtime_rollback',
      'rollback_requires_domain_writer_disable_and_consumer_no_longer_reads_version',
      'promotion_rollback_gate_does_not_write_runtime',
    ],
  },
  {
    key: 'policyTemplateReleaseAdapterService',
    name: 'Policy template release adapter service',
    source: 'server/src/services/policyTemplateReleaseAdapterService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'policy_template_release_adapter',
    ownerService: 'policyTemplateReleaseAdapterService',
    role: 'v1.4.22.3 domain release bridge for certificate and acceptance trusted-source policy template publications after release-exit handoff',
    consumers: [
      'certificateTemplatePolicyUpdateService',
      'acceptanceTemplatePolicyUpdateService',
      'algorithmAssetReleaseExitService',
      'policy template release tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service converts ready release-exit packages into certificate or acceptance policy publication records with rollback metadata, and blocks local auto-publish runs that have not passed the unified release-exit gate.',
    boundaryPolicy: [
      'policy_template_release_adapter_requires_release_exit_package',
      'certificate_and_acceptance_policy_release_targets_system_seed_only',
      'policy_template_release_records_embed_rollback_target',
      'policy_template_release_adapter_blocks_mismatched_domain_or_adapter',
      'policy_template_release_adapter_does_not_write_algorithm_seed_records',
    ],
  },
  {
    key: 'policyTemplateReleaseExecutionService',
    name: 'Policy template release execution service',
    source: 'server/src/services/policyTemplateReleaseExecutionService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'policy_template_release_execution',
    ownerService: 'policyTemplateReleaseExecutionService',
    role: 'v1.4.22.3 audit-run, execution-event, and template-entity runtime publication / rollback projection service for certificate and acceptance policy template release records after domain adapter approval',
    consumers: [
      'policyTemplateReleaseAdapterService',
      'certificateTemplatePolicyUpdateService',
      'acceptanceTemplatePolicyUpdateService',
      'policy template release tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service persists ready certificate or acceptance policy release records to audit run tables, records release publication / rollback / impact-monitoring events, writes stable PolicyOps runs to the policy_template_entity_runtime_publications projection, disables those projection rows on rollback, and keeps stable template loaders behind projection status checks without becoming an algorithm seed publisher or bypassing release-exit gates.',
    boundaryPolicy: [
      'policy_template_release_execution_requires_ready_release_record',
      'policy_template_release_execution_persists_audit_run_and_execution_event_records',
      'policy_template_release_execution_stable_runs_write_template_entity_runtime_publication',
      'policy_template_release_execution_rollbacks_disable_template_entity_runtime_publication',
      'policy_template_stable_loaders_require_active_runtime_projection',
      'policy_template_release_execution_records_rollback_and_monitoring_events',
      'policy_template_release_execution_does_not_write_seed_runtime',
    ],
  },
  {
    key: 'algorithmAssetSampleHealthService',
    name: 'Algorithm asset sample health service',
    source: 'server/src/services/algorithmAssetSampleHealthService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_sample_health_governance',
    ownerService: 'algorithmAssetSampleHealthService',
    role: 'v1.4.22.3 sample health classifier that records accepted, weak and rejected learning samples with downgrade or rejection reasons',
    consumers: [
      'algorithmAssetReplayService',
      'duration learning governance',
      'asset governance diagnostics',
      'sample health governance summaries',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service makes completion-sample quality visible before replay or learning so missing dates, missing work codes and weak samples cannot be silently dropped from the self-learning loop.',
    boundaryPolicy: [
      'completed_samples_must_be_accepted_weak_or_rejected_with_reason',
      'missing_dates_or_work_code_must_not_be_silently_dropped',
      'weak_samples_can_feed_candidate_evidence_not_high_weight_benchmark',
      'sample_health_summary_must_include_cold_start_and_long_tail_freeze',
      'sample_health_service_does_not_write_runtime',
    ],
  },
  {
    key: 'businessCompletionSampleHealthAdapterService',
    name: 'Business completion sample health adapter service',
    source: 'server/src/services/businessCompletionSampleHealthAdapterService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_sample_health_governance',
    ownerService: 'businessCompletionSampleHealthAdapterService',
    role: 'v1.4.22.3 adapter with domain-specific builders that map drawing version, certificate milestone, material handover, quality rectification and risk issue closeout completion facts into sample health evidence without making them duration benchmarks; drawing package current-version changes, certificate work item completions, project material actual-arrival changes, acceptance rectifying-to-passed status changes and issue confirm-close actions are production event paths wired into this adapter',
    consumers: [
      'acceptance flow governance',
      'drawing version governance',
      'certificate milestone governance',
      'material handover governance',
      'quality rectification governance',
      'risk issue closeout governance',
      'algorithmAssetSampleHealthService',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'Non-duration business completion facts can contribute governance evidence through generic and domain-specific sampling entrypoints, but must not become duration benchmark samples, runtime facts, or automatic rule publications.',
    boundaryPolicy: [
      'non_duration_completion_samples_are_not_duration_benchmarks',
      'business_completion_samples_write_sample_health_only',
      'business_completion_sample_adapter_preserves_domain_metadata',
      'business_completion_sample_adapter_has_domain_specific_entrypoints',
      'drawing_version_current_version_event_writes_sample_health_only',
      'certificate_work_item_completion_event_writes_sample_health_only',
      'certificate_work_item_batch_completion_event_writes_sample_health_only',
      'project_material_actual_arrival_event_writes_sample_health_only',
      'acceptance_rectifying_to_passed_event_writes_quality_rectification_sample_health_only',
      'issue_confirm_close_event_writes_sample_health_only',
      'domain_specific_business_completion_builders_do_not_grant_runtime_publish',
      'business_completion_sample_adapter_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetLearnableParameterRegistryService',
    name: 'Algorithm asset learnable parameter registry service',
    source: 'server/src/services/algorithmAssetLearnableParameterRegistryService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_learnable_parameter_registry',
    ownerService: 'algorithmAssetLearnableParameterRegistryService',
    role: 'v1.4.22.3 learnable-parameter registry that freezes unregistered algorithm parameters and gates registered parameters by scope, risk, evidence, delta and rollback',
    learningTarget: 'governance_report',
    learningMaturity: 'frozen_constant',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'manual_required',
    consumers: [
      'durationContextPolicyParameterLearningService',
      'algorithmAssetGovernanceProtocolService',
      'asset governance diagnostics',
      'duration and forecast learning adapters',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service records which weights, thresholds, multipliers, blend ratios and canary stop conditions are learnable, and prevents runtime consumption of unregistered or under-evidenced parameter updates.',
    boundaryPolicy: [
      'unregistered_parameters_default_to_frozen_constant',
      'registered_parameters_require_scope_risk_evidence_delta_and_rollback',
      'high_risk_model_weights_remain_governed_candidates',
      'guarded_live_tuning_parameters_only_affect_new_results',
      'learnable_parameter_registry_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetLearnableParameterSuggestionService',
    name: 'Algorithm asset learnable parameter suggestion service',
    source: 'server/src/services/algorithmAssetLearnableParameterSuggestionService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_learnable_parameter_suggestion_governance',
    ownerService: 'algorithmAssetLearnableParameterSuggestionService',
    role: 'v1.4.22.3 bridge that turns scoped learnable parameter suggestions into governed candidate events and release-exit handoff packages',
    learningTarget: 'candidate_weight',
    learningMaturity: 'governed_candidate',
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_review_package',
    consumers: [
      'algorithmAssetLearnableParameterRegistryService',
      'algorithmAssetCandidateEventAdapterService',
      'algorithmAssetReleaseExitService',
      'durationContextPolicyParameterLearningService',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service closes the gap between registry definitions and concrete parameter suggestion instances, while keeping under-evidenced or high-risk suggestions in review and never writing runtime directly.',
    boundaryPolicy: [
      'parameter_suggestions_must_pass_registry_scope_evidence_delta_and_rollback',
      'parameter_suggestions_write_candidate_events_only',
      'parameter_suggestion_release_requires_release_exit_and_domain_adapter',
      'high_risk_parameter_suggestions_remain_review_packages',
      'parameter_suggestion_service_does_not_write_runtime',
    ],
  },
  {
    key: 'algorithmAssetLearnableParameterReleaseExecutionService',
    name: 'Algorithm asset learnable parameter release execution service',
    source: 'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_learnable_parameter_release_execution',
    ownerService: 'algorithmAssetLearnableParameterReleaseExecutionService',
    role: 'v1.4.22.3 scoped parameter-runtime publication and rollback audit service for ready learnable-parameter release-exit packages',
    consumers: [
      'algorithmAssetLearnableParameterSuggestionService',
      'algorithmAssetReleaseExitService',
      'durationContextPolicyParameterLearningService',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service consumes only ready release-exit handoff packages, writes parameter runtime publication and release-event audit rows, marks rollback state on those rows, and explicitly avoids algorithm seed, standard_work_duration or business runtime table mutation.',
    boundaryPolicy: [
      'parameter_runtime_publication_requires_ready_release_exit_package',
      'parameter_runtime_publication_writes_parameter_publication_table_only',
      'parameter_runtime_rollback_marks_publication_rolled_back',
      'parameter_release_execution_records_release_and_rollback_events',
      'parameter_release_execution_does_not_write_algorithm_seed_or_standard_work_duration',
    ],
  },
  {
    key: 'algorithmAssetLearnableParameterImpactMonitoringJob',
    name: 'Algorithm asset learnable parameter impact monitoring job',
    source: 'server/src/jobs/algorithmAssetLearnableParameterImpactMonitoringJob.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_learnable_parameter_impact_monitoring',
    ownerService: 'algorithmAssetLearnableParameterImpactMonitoringJob',
    role: 'v1.4.22.3 scheduled post-release monitoring job for scoped learnable parameter runtime publications',
    consumers: [
      'algorithmAssetLearnableParameterReleaseExecutionService',
      'algorithm_learnable_parameter_runtime_publications',
      'scheduler',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The job reads scoped parameter publication records, records impact-monitoring events, uses frozen governance.canary_stop_conditions registry defaults as fallback stop-condition thresholds when no domain evaluator is injected, and on failed thresholds delegates rollback to the parameter release execution service without touching algorithm seed, standard_work_duration or business runtime tables. The governance.canary_stop_conditions parameter is not runtime self-published by this job.',
    boundaryPolicy: [
      'parameter_impact_monitoring_reads_parameter_publications_only',
      'parameter_impact_monitoring_uses_frozen_governance_canary_stop_conditions_as_default_thresholds',
      'parameter_impact_monitoring_records_monitoring_events',
      'parameter_impact_monitoring_failed_threshold_marks_parameter_publication_rolled_back',
      'parameter_impact_monitoring_scheduled_after_parameter_publication',
      'governance_canary_stop_conditions_not_runtime_self_published',
      'parameter_impact_monitoring_does_not_write_algorithm_seed_or_standard_work_duration',
    ],
  },
  {
    key: 'algorithmAssetLearnableParameterRuntimeConsumptionService',
    name: 'Algorithm asset learnable parameter runtime consumption service',
    source: 'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_learnable_parameter_runtime_consumption',
    ownerService: 'algorithmAssetLearnableParameterRuntimeConsumptionService',
    role: 'v1.4.22.3 read-only runtime consumption gate for scoped learnable parameter publications',
    learningTarget: 'context_factor',
    learningMaturity: 'guarded_live_tuning',
    publishAnchor: 'guarded_runtime_auto_publish',
    automationMaturity: 'auto_canary',
    consumers: [
      'durationSuggestionService',
      'durationContextService',
      'taskDurationForecastService',
      'algorithmAssetLearnableParameterRegistryService',
      'algorithm_learnable_parameter_runtime_publications',
      'asset governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service reads scoped parameter runtime publication rows, re-checks registration, scope, evidence, delta, rollback and publication status, defaults stable consumers to published rows only, requires explicit canary runtime boundaries for canary rows, exposes bounded parameter values to durationSuggestionService and durationContextService, lets durationSuggestionService use duration.p50_p75_blend_ratio only through a canary boundary for company benchmark runtime references, lets taskDurationForecastService record blocked gate evidence for manually governed high-risk forecast parameters without applying those publications to model weights, and lets taskDurationForecastService consume forecast.confidence_weight_multiplier only as a bounded confidence-weight multiplier without writing algorithm seed, standard_work_duration or task facts.',
    boundaryPolicy: [
      'parameter_runtime_consumption_reads_parameter_publications_only',
      'parameter_runtime_consumption_requires_registry_and_scope_match',
      'parameter_runtime_consumption_ignores_rolled_back_publications',
      'parameter_runtime_consumption_defaults_to_stable_published_only',
      'parameter_runtime_consumption_canary_requires_explicit_runtime_boundary',
      'duration_p50_p75_blend_ratio_canary_only_affects_company_benchmark_runtime_reference',
      'forecast_confidence_weight_multiplier_only_tunes_remaining_forecast_confidence',
      'parameter_runtime_consumption_blocks_manual_or_high_risk_parameters',
      'parameter_runtime_consumption_does_not_write_algorithm_seed_or_standard_work_duration',
    ],
  },
  {
    key: 'algorithmAssetColdStartBaselineService',
    name: 'Algorithm asset cold-start baseline service',
    source: 'server/src/services/algorithmAssetColdStartBaselineService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_cold_start_baseline_governance',
    ownerService: 'algorithmAssetColdStartBaselineService',
    role: 'v1.4.22.3 cold-start governance service that lets small companies consume anonymized industry or segment baselines without reading other companies private artifacts',
    learningTarget: 'base_duration',
    learningMaturity: 'system_curated_learning',
    publishAnchor: 'system_curated_publish',
    automationMaturity: 'auto_publish',
    consumers: [
      'algorithmAssetSampleHealthService',
      'durationSuggestionService',
      'duration learning governance',
      'asset governance diagnostics',
      'cold-start baseline governance summaries',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service validates anonymous multi-company shared baselines and runtime cold-start decisions while preventing single-company samples or private company artifacts from updating shared baselines.',
    boundaryPolicy: [
      'cold_start_baseline_requires_anonymized_multi_company_aggregation',
      'single_company_samples_cannot_update_shared_baseline',
      'company_runtime_cannot_read_other_company_detail_samples',
      'cold_start_baseline_persistence_writes_anonymized_shared_baseline_only',
      'shared_baseline_reference_cannot_write_company_override',
      'cold_start_baseline_runtime_publication_status_tracks_candidate_canary_published_and_rolled_back',
      'cold_start_baseline_rollback_marks_baseline_runtime_rolled_back',
      'cold_start_baseline_consumer_ignores_runtime_rolled_back_baselines',
      'cold_start_baseline_writer_does_not_mutate_duration_seed_algorithm_seed_or_company_override',
    ],
  },
  {
    key: 'algorithmAssetForecastResidualOverlayService',
    name: 'Algorithm asset forecast residual overlay service',
    source: 'server/src/services/algorithmAssetForecastResidualOverlayService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'algorithm_forecast_residual_overlay_governance',
    ownerService: 'algorithmAssetForecastResidualOverlayService',
    role: 'v1.4.22.3 forecast residual overlay governance service that separates forecast error learning from base duration seed convergence',
    consumers: [
      'taskDurationForecastService',
      'algorithmAssetReplayService',
      'asset governance diagnostics',
      'duration forecast overlay governance summaries',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The service turns forecast finish-date error samples into scoped residual overlay evidence and keeps MAE improvements out of standard_work_duration seed mutation paths.',
    boundaryPolicy: [
      'forecast_error_writes_to_residual_overlay_not_standard_work_duration_seed',
      'forecast_residual_overlay_requires_scoped_replay_evidence',
      'forecast_residual_overlay_publication_sample_gate_matches_runtime_consumer_gate',
      'shadow_report_only_overlay_cannot_write_runtime',
      'forecast_residual_overlay_candidate_payload_forbids_base_seed_mutation',
      'forecast_residual_overlay_runtime_publication_status_tracks_candidate_canary_published_and_rolled_back',
      'forecast_residual_overlay_rollback_marks_overlay_runtime_rolled_back',
      'forecast_residual_overlay_consumer_ignores_runtime_rolled_back_overlays',
      'forecast_residual_overlay_writer_does_not_mutate_duration_seed_or_algorithm_seed',
    ],
  },
  {
    key: 'durationOutputGovernance',
    name: 'Duration output governance',
    source: 'server/src/services/durationOutputGovernanceService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'duration_output_governance',
    ownerService: 'durationOutputGovernanceService',
    role: 'semantic contract for plan, template, runtime forecast, phase-window and acceleration duration outputs',
    consumers: ['duration algorithm diagnostics', 'golden benchmark runtime gate', 'duration suggestion services'],
    recommendation: 'keep_independent_governance',
    reason: 'Duration outputs may have different business meanings, but their write targets and boundaries must be governed so they do not become independent hidden algorithms.',
    boundaryPolicy: [
      'multiple_duration_outputs_are_allowed_but_not_independent',
      'fast_template_estimate_cannot_write_plan_reference',
      'fast_template_requires_explicit_plan_reference_promotion_audit',
      'duration_output_write_gate_must_guard_plan_task_duration',
      'duration_output_promotion_policy_must_reject_unapproved_outputs',
      'remaining_forecast_cannot_rewrite_plan_reference',
      'golden_replay_must_declare_duration_output',
    ],
  },
  {
    key: 'durationAlgorithmInputHydration',
    name: 'Duration algorithm input hydration',
    source: 'server/src/services/durationAlgorithmInputHydrationService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'duration_algorithm_input_hydration',
    ownerService: 'durationAlgorithmInputHydrationService/durationSuggestionService',
    role: 'shared project-fact hydration entrypoint before duration algorithms consume task or project inputs',
    consumers: ['durationSuggestionService', 'new task reference duration', 'runtime duration reference'],
    recommendation: 'keep_independent_governance',
    reason: 'Hydration is an input-normalization service, not a learnable algorithm seed. It prevents route-level duration callers from each inventing their own project-fact loading path.',
    boundaryPolicy: [
      'hydrates_project_generation_facts_before_duration_calculation',
      'explicit_input_facts_override_loaded_project_metadata',
      'does_not_mutate_project_or_task_records',
    ],
  },
  {
    key: 'durationPipelineTopology',
    name: 'Duration pipeline topology contract',
    source: 'server/src/services/durationAlgorithmClosureGovernanceService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'duration_pipeline_topology',
    ownerService: 'durationAlgorithmClosureGovernanceService/algorithmCatalogService/algorithmRuleAssetInventoryService',
    role: 'single duration pipeline topology from ProjectGenerationFacts and RuntimeExecutionFacts through five engines into governed duration outputs',
    consumers: [
      'v1.4.22 phase 1-3 algorithm catalog',
      'duration closure tests',
      'algorithm governance diagnostics',
    ],
    recommendation: 'keep_independent_governance',
    reason: 'The pipeline topology is an architecture and governance contract. It records fact-engine-output ownership and must not become a learnable seed, company override, or runtime mutation path.',
    boundaryPolicy: [
      'topology_contract_not_algorithm_seed',
      'not_company_or_project_overrideable',
      'facts_engines_outputs_must_stay_single_pipeline',
      'five_duration_engines_must_be_cataloged',
      'seed_registry_only_contains_versioned_learnable_parameters',
      'overrides_only_apply_to_scoped_seed_or_policy_parameters',
    ],
  },
  {
    key: 'taskStatusRuleRegistry',
    name: 'Task status derivation rule registry',
    source: 'server/src/services/taskStatusDerivationService.ts',
    lifecycleType: 'status_registry',
    governanceSystem: 'task_status_derivation',
    ownerService: 'taskStatusDerivationService',
    role: 'business, due, lag and readiness status derivation outlet',
    consumers: ['BusinessStatusService', 'Gantt', 'Dashboard focus task projections', 'frontend taskBusinessStatus helpers'],
    recommendation: 'keep_independent_governance',
    reason: 'Status derivation is an output contract over loaded facts and seed signals; it should not become a seed import target.',
    boundaryPolicy: ['status_projection_only', 'does_not_overwrite_task_status', 'seed_signals_are_evidence_only'],
  },
  {
    key: 'dataLineageGovernanceRules',
    name: 'Data lineage and AI governance rules',
    source: 'server/src/services/dataLineageGovernanceService.ts',
    lifecycleType: 'lineage_governance',
    governanceSystem: 'data_lineage_governance',
    ownerService: 'dataLineageGovernanceService',
    role: 'AI governance and lineage presentation rules',
    consumers: ['dataLineageService', 'planningSnapshotService', 'audit views'],
    recommendation: 'keep_independent_governance',
    reason: 'Lineage governance explains provenance and AI usage boundaries; it is not a construction algorithm seed.',
    boundaryPolicy: ['traceability_only', 'does_not_promote_runtime_rules'],
  },
  {
    key: 'drawingReviewRules',
    name: 'Drawing review rules',
    source: 'drawing_review_rules table + server/src/services/drawingPackageService.ts',
    lifecycleType: 'drawing_review_rule',
    governanceSystem: 'drawing_package_governance',
    ownerService: 'drawingPackageService/drawing-review-rules route',
    role: 'project/global drawing review mode and package evaluation policy',
    consumers: ['drawingPackageService', 'drawing packages routes', 'construction drawings routes'],
    recommendation: 'keep_independent_governance',
    reason: 'Drawing review rules are project/global review policies with CRUD lifecycle, not seed import/version rollback records.',
    boundaryPolicy: ['drawing_review_only', 'project_rules_can_override_global_rules', 'does_not_create_algorithm_seed_records'],
  },
  {
    key: 'certificateTemplateSeed',
    name: 'Certificate template seeds',
    source: 'server/src/seeds/certificateTemplateSeed.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'certificate_template_governance',
    ownerService: 'certificateTemplateService',
    role: 'pre-construction certificate template catalog and apply boundary',
    consumers: ['certificateTemplateService', 'PreMilestones'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'Certificate templates are authored and applied through template governance, not algorithm seed learning.',
    boundaryPolicy: ['template_apply_only', 'does_not_overwrite_project_generation_facts'],
  },
  {
    key: 'chinaGb50300TemplateCatalog',
    name: 'China GB50300 template catalog',
    source: 'server/src/seeds/chinaGb50300TemplateCatalog.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'wbs_template_governance',
    ownerService: 'wbsTemplateGenerationService',
    role: 'standard WBS structure, GB50300 quality gate and internal-flow source catalog',
    consumers: ['wbsTemplateGenerationService', 'executionGateSeedService', 'constructionDependencyRuleSystemService'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'The catalog writes WBS structure and gate metadata; only curated internal-flow extracts enter algorithm_seed lifecycle.',
    boundaryPolicy: ['template_catalog_authority', 'seed_extracts_must_be_explicit', 'diagnostic_bridge_to_algorithm_seed_only'],
  },
  {
    key: 'domainWbsTemplateCatalogs',
    name: 'Domain WBS template catalogs',
    source: 'server/src/seeds/domainWbsTemplateCatalogs.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'wbs_template_governance',
    ownerService: 'wbsTemplateGenerationService/projectFactsToTemplateService',
    role: 'domain, specialty, zone and project-type WBS template catalog extensions',
    consumers: ['wbsTemplateGenerationService', 'projectFactsToTemplateService', 'constructionDependencyRuleSystemService'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'Domain catalogs select and write structure; they should not be governed by algorithm seed import/rollback as a whole.',
    boundaryPolicy: ['template_catalog_authority', 'structure_writer', 'algorithm_seed_bridge_only_for_curated_extracts'],
  },
  {
    key: 'wbsTemplateCommercialGovernanceContent',
    name: 'WBS template commercial governance content',
    source: 'server/src/seeds/wbsTemplateCommercialGovernanceContent.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'wbs_template_governance',
    ownerService: 'wbsSeedSemanticGovernanceService/wbsTemplateCandidateEventService',
    role: 'template applicability, golden case, feedback and authoring policy source',
    consumers: ['wbs template governance tests', 'wbsSeedSemanticGovernanceService', 'wbsTemplateCandidateEventService'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'Commercial template governance manages template authoring and evidence quality, not algorithm seed runtime overrides.',
    boundaryPolicy: ['template_authoring_governance', 'feedback_candidates_need_review', 'no_direct_runtime_seed_promotion'],
  },
  {
    key: 'wbsTaskStructureRuleAssets',
    name: 'WBS task structure rule asset system',
    source: 'server/src/services/wbsTaskStructureGovernancePipelineService.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'wbs_task_structure_governance',
    ownerService: 'wbsTaskStructureGovernancePipelineService',
    role: 'meta-inventory for WBS structure, duration, dependency, semantic, identity and diagnostic assets',
    consumers: ['task write chain', 'WBS generation diagnostics', 'planning governance diagnostics', 'algorithm_asset_candidate_events'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'This is already a WBS rule-asset inventory and should bridge to algorithm seeds diagnostically, not duplicate their lifecycle.',
    boundaryPolicy: [
      'meta_inventory_only',
      'downstream_algorithms_consume_or_explain_only',
      'semantic_findings_bridge_to_algorithm_asset_candidates_only',
      'structure_profile_candidate_events_do_not_write_runtime',
      'dependency_replay_calibration_candidates_do_not_write_task_dependencies',
    ],
  },
  {
    key: 'scopeAssignmentRulesService',
    name: 'Scope assignment rules',
    source: 'server/src/services/scopeAssignmentRulesService.ts',
    lifecycleType: 'template_catalog',
    governanceSystem: 'wbs_task_structure_governance',
    ownerService: 'scopeAssignmentRulesService/project wizard',
    role: 'template pack to building/zone scope assignment policy',
    consumers: ['project wizard', 'wbsTemplateGenerationService', 'wbsTaskStructureGovernancePipelineService'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'Scope assignment chooses where template packs apply; it is not a duration, warning or dependency seed record.',
    boundaryPolicy: ['scope_mapping_only', 'does_not_create_dependencies_or_durations'],
  },
  {
    key: 'constructionDependencyRuleSystem',
    name: 'Construction dependency rule system',
    source: 'server/src/services/constructionDependencyRuleSystemService.ts',
    lifecycleType: 'service_governance',
    governanceSystem: 'construction_dependency_rule_system',
    ownerService: 'constructionDependencyRuleSystemService',
    role: 'five-layer dependency rule ownership, maturity and diagnostic view',
    consumers: ['dependency diagnostics', 'WBS governance metadata'],
    recommendation: 'diagnostic_bridge_only',
    reason: 'The service coordinates and reports dependency-rule ownership; raw governed records stay in their underlying seed/catalog sources.',
    boundaryPolicy: ['meta_system_only', 'does_not_duplicate_seed_records', 'explicit_task_dependencies_win'],
  },
  {
    key: 'v1475DependencyIntentTemplates',
    name: 'Dependency intent templates',
    source: 'server/src/seeds/v1475DependencyIntentTemplates.ts',
    lifecycleType: 'candidate_for_algorithm_seed',
    governanceSystem: 'construction_dependency_rule_system',
    ownerService: 'constructionDependencyRuleSystemService/wbsTemplateGenerationService',
    role: 'cross-business dependency intent reference and anchor selection',
    consumers: ['constructionDependencyRuleSystemService', 'wbsTemplateGenerationService', 'task dependency generation'],
    recommendation: 'evaluate_before_seed_inclusion',
    reason: 'Dependency intent templates can generate confirmed business constraints, but need a dedicated seed contract before joining services 27-31.',
    boundaryPolicy: ['business_constraint_only', 'physical_construction_mainline_rejected', 'explicit_task_dependencies_win'],
  },
  {
    key: 'weatherForecastImpactPolicy',
    name: 'Weather forecast impact policy',
    source: 'server/src/services/weatherForecastImpactService.ts',
    lifecycleType: 'candidate_for_algorithm_seed',
    governanceSystem: 'weather_forecast_impact',
    ownerService: 'weatherForecastImpactService/taskDurationForecastService',
    role: 'forecast weather fact classification, multiplier and confidence policy',
    consumers: ['durationContextService', 'taskDurationForecastService', 'progressDeviationCauseRegistry'],
    recommendation: 'evaluate_before_seed_inclusion',
    reason: 'Weather forecast impact rules consume live forecast facts and currently emit candidate/confidence signals; static multiplier governance could become a future seed only after evaluation.',
    boundaryPolicy: ['forecast_fact_candidate_only', 'confidence_only_until_curated', 'weather_facts_override_static_climate_seed'],
  },
]

function lifecycleTypeForAutoDiscoveredAsset(asset: V14DiscoveredAssetSource): AlgorithmRuleAssetLifecycleType {
  const path = asset.sourcePath.toLowerCase()
  if (asset.assetType === 'data_admission_asset') return 'data_quality'
  if (asset.assetType === 'metric_admission_asset') return 'metric_registry'
  if (path.includes('notification')) return 'notification_policy'
  if (path.includes('reminder')) return 'reminder_policy'
  if (path.includes('lineage')) return 'lineage_governance'
  if (path.includes('status')) return 'status_registry'
  if (path.includes('drawing')) return 'drawing_review_rule'
  if (asset.assetType === 'rule_seed_asset' && path.includes('/seeds/')) return 'candidate_for_algorithm_seed'
  if (path.includes('template') || path.includes('wbs') || path.includes('catalog')) return 'template_catalog'
  return 'service_governance'
}

function recommendationForAutoDiscoveredAsset(lifecycleType: AlgorithmRuleAssetLifecycleType): AlgorithmRuleAssetRecommendation {
  if (lifecycleType === 'candidate_for_algorithm_seed') return 'evaluate_before_seed_inclusion'
  if (lifecycleType === 'template_catalog' || lifecycleType === 'drawing_review_rule') return 'diagnostic_bridge_only'
  return 'keep_independent_governance'
}

function ruleAssetGovernanceText(asset: Pick<
  AlgorithmRuleAsset,
  | 'key'
  | 'source'
  | 'lifecycleType'
  | 'governanceSystem'
  | 'ownerService'
  | 'role'
  | 'reason'
  | 'boundaryPolicy'
  | 'consumers'
>) {
  return [
    asset.key,
    asset.source,
    asset.lifecycleType,
    asset.governanceSystem,
    asset.ownerService,
    asset.role,
    asset.reason,
    ...asset.boundaryPolicy,
    ...asset.consumers,
  ].join(' ').toLowerCase()
}

function learningTargetForRuleAsset(asset: AlgorithmRuleAsset): AlgorithmAssetLearningTarget {
  const text = ruleAssetGovernanceText(asset)
  const identityText = [
    asset.key,
    asset.source,
    asset.lifecycleType,
    asset.governanceSystem,
    asset.ownerService,
  ].join(' ').toLowerCase()
  const pureGovernanceControlPlane = /(scheduler|governanceprotocol|anchorupgradestrategy|automationmaturity|candidateeventadapter|conflict|explanationchain|governancedashboardevidence|isolationmatrix|promotionrollbackgate|releaseexit|completionaudit|requirementcoverageaudit|workbenchreadiness|workbenchoperation|rerunmatrix|closurematrix|coverage_matrix|evidence_matrix)/.test(identityText)

  if (asset.lifecycleType === 'metric_registry' || /metric|summary|snapshot|trend|analytics|dashboard|cockpit|statistics|progresscalculation/.test(identityText)) {
    return 'metric_caliber'
  }
  if (asset.lifecycleType === 'data_quality' || asset.lifecycleType === 'lineage_governance') {
    return 'governance_report'
  }
  if (asset.lifecycleType === 'field_registry' || asset.lifecycleType === 'status_registry') {
    return 'governance_report'
  }
  if (pureGovernanceControlPlane) {
    return 'governance_report'
  }
  if (/forecast|residual/.test(identityText)) return 'forecast_residual'
  if (/weather|climate|site|resource|context/.test(identityText)) return 'context_factor'
  if (/duration|baseline|calendar|productivity|acceleration/.test(identityText)) return 'base_duration'
  if (/dependency|critical|schedule|planning|monthly|milestone/.test(identityText)) return 'dependency_order'
  if (/wbs|template|catalog|certificate|acceptance|drawing/.test(identityText)) return 'template_structure'
  if (/risk|warning|health|issue/.test(identityText)) return 'risk_warning'
  if (/forecast|residual/.test(text)) return 'forecast_residual'
  if (/weather|climate|site|resource|context/.test(text)) return 'context_factor'
  if (/duration|baseline|calendar|productivity|acceleration/.test(text)) return 'base_duration'
  if (/dependency|critical|schedule|planning|monthly|milestone/.test(text)) return 'dependency_order'
  if (/wbs|template|catalog|certificate|acceptance|drawing/.test(text)) return 'template_structure'
  if (/risk|warning|health|issue/.test(text)) return 'risk_warning'
  if (/governance|scheduler|job|audit|gate|matrix|protocol|registry/.test(text)) {
    return 'governance_report'
  }
  return 'governance_report'
}

function governanceFieldsForRuleAsset(asset: AlgorithmRuleAsset): Pick<
  AlgorithmRuleAsset,
  'learningTarget' | 'learningMaturity' | 'publishAnchor' | 'automationMaturity'
> {
  const learningTarget = learningTargetForRuleAsset(asset)

  if (learningTarget === 'metric_caliber') {
    return {
      learningTarget,
      learningMaturity: 'frozen_constant',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
    }
  }

  if (learningTarget === 'governance_report') {
    return {
      learningTarget,
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    }
  }

  if (asset.lifecycleType === 'algorithm_seed' || asset.lifecycleType === 'candidate_for_algorithm_seed') {
    return {
      learningTarget,
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    }
  }

  return {
    learningTarget,
    learningMaturity: 'shadow_report_only',
    publishAnchor: 'candidate_only',
    automationMaturity: 'auto_shadow',
  }
}

function withExplicitGovernanceFields(asset: AlgorithmRuleAsset): AlgorithmRuleAsset {
  const defaults = governanceFieldsForRuleAsset(asset)
  return {
    ...asset,
    learningTarget: asset.learningTarget ?? defaults.learningTarget,
    learningMaturity: asset.learningMaturity ?? defaults.learningMaturity,
    publishAnchor: asset.publishAnchor ?? defaults.publishAnchor,
    automationMaturity: asset.automationMaturity ?? defaults.automationMaturity,
    boundaryPolicy: uniqueStrings([
      ...asset.boundaryPolicy,
      'four_field_governance_boundary_is_explicit_in_rule_asset_inventory',
      'explicit_inventory_governance_fields_do_not_grant_runtime_publish_rights',
    ]),
  }
}

function learningTargetForAutoDiscoveredAsset(asset: V14DiscoveredAssetSource): AlgorithmAssetLearningTarget {
  const identityText = [
    asset.assetKey,
    asset.assetType,
    asset.sourcePath,
    asset.runtimeEffect,
  ].join(' ').toLowerCase()
  const text = [
    identityText,
    ...asset.consumers,
  ].join(' ').toLowerCase()
  const pureGovernanceControlPlane = /(scheduler|governanceprotocol|anchorupgradestrategy|automationmaturity|candidateeventadapter|conflict|explanationchain|governancedashboardevidence|isolationmatrix|promotionrollbackgate|releaseexit|completionaudit|requirementcoverageaudit|workbenchreadiness|workbenchoperation|rerunmatrix|closurematrix|coverage_matrix|evidence_matrix|auditservice|matrixservice|readinessservice)/.test(identityText)

  if (asset.assetType === 'metric_admission_asset' || /metric|summary|snapshot|trend|analytics|dashboard|cockpit|statistics|progresscalculation/.test(identityText)) {
    return 'metric_caliber'
  }
  if (asset.assetType === 'data_admission_asset' || /dataquality|data-quality|data_quality|lineage/.test(identityText)) {
    return 'governance_report'
  }
  if (asset.assetType === 'background_governance_job') {
    return 'governance_report'
  }
  if (/forecast|residual/.test(identityText)) return 'forecast_residual'
  if (/weather|climate|site|resource|context/.test(identityText)) return 'context_factor'
  if (/duration|baseline|calendar|productivity|acceleration/.test(identityText)) return 'base_duration'
  if (/dependency|critical|schedule|planning|monthly|milestone/.test(identityText)) return 'dependency_order'
  if (/wbs|template|catalog|certificate|acceptance|drawing/.test(identityText)) return 'template_structure'
  if (/risk|warning|health|issue/.test(identityText)) return 'risk_warning'
  if (pureGovernanceControlPlane || /scheduler|job|governance/.test(identityText)) {
    return 'governance_report'
  }
  if (/forecast|residual/.test(text)) return 'forecast_residual'
  if (/weather|climate|site|resource|context/.test(text)) return 'context_factor'
  if (/duration|baseline|calendar|productivity|acceleration/.test(text)) return 'base_duration'
  if (/dependency|critical|schedule|planning|monthly|milestone/.test(text)) return 'dependency_order'
  if (/wbs|template|catalog|certificate|acceptance|drawing/.test(text)) return 'template_structure'
  if (/risk|warning|health|issue/.test(text)) return 'risk_warning'
  return 'governance_report'
}

function governanceFieldsForAutoDiscoveredAsset(asset: V14DiscoveredAssetSource): Pick<
  AlgorithmRuleAsset,
  'learningTarget' | 'learningMaturity' | 'publishAnchor' | 'automationMaturity'
> {
  const learningTarget = learningTargetForAutoDiscoveredAsset(asset)

  if (learningTarget === 'metric_caliber' || learningTarget === 'governance_report') {
    return {
      learningTarget,
      learningMaturity: learningTarget === 'metric_caliber' ? 'frozen_constant' : 'shadow_report_only',
      publishAnchor: 'manual_governance_required',
      automationMaturity: learningTarget === 'metric_caliber' ? 'manual_required' : 'auto_review_package',
    }
  }

  return {
    learningTarget,
    learningMaturity: 'shadow_report_only',
    publishAnchor: 'candidate_only',
    automationMaturity: 'auto_shadow',
  }
}

function buildAutoDiscoveredRuleAssets(curatedAssets: readonly AlgorithmRuleAsset[]): AlgorithmRuleAsset[] {
  const curatedKeys = new Set(curatedAssets.map((asset) => asset.key))
  const curatedSources = new Set(curatedAssets.map((asset) => asset.source))

  return discoverV14AssetSources()
    .filter((asset) => !curatedKeys.has(asset.assetKey) && !curatedSources.has(asset.sourcePath))
    .map((asset): AlgorithmRuleAsset => {
      const lifecycleType = lifecycleTypeForAutoDiscoveredAsset(asset)
      const recommendation = recommendationForAutoDiscoveredAsset(lifecycleType)
      const governanceFields = governanceFieldsForAutoDiscoveredAsset(asset)
      return {
        key: asset.assetKey,
        name: asset.assetKey,
        source: asset.sourcePath,
        lifecycleType,
        governanceSystem: `v14_auto_discovered_${lifecycleType}`,
        ownerService: asset.assetKey,
        role: asset.runtimeEffect,
        ...governanceFields,
        consumers: asset.consumers,
        recommendation,
        reason: 'Auto-registered by the v1.4.22 phase 1-3 full-repo asset scan. This catalog entry records current code facts and does not publish the asset into runtime by itself.',
        boundaryPolicy: uniqueStrings([
          'auto_discovered_phase_1_3_asset',
          `scope_policy:${asset.scopePolicy}`,
          `runtime_effect:${asset.runtimeEffect}`,
          recommendation === 'evaluate_before_seed_inclusion'
            ? 'candidate_only_until_curated'
            : 'catalog_only_until_curated',
          'ordinary_business_frontend_must_not_expose_asset_fields',
        ]),
      }
    })
}

const CURATED_RULE_ASSET_INVENTORY: readonly AlgorithmRuleAsset[] = [
  ...buildAlgorithmSeedAssets(),
  ...NON_SEED_RULE_ASSETS,
].map(withExplicitGovernanceFields)

export const ALGORITHM_RULE_ASSET_INVENTORY: readonly AlgorithmRuleAsset[] = [
  ...CURATED_RULE_ASSET_INVENTORY,
  ...buildAutoDiscoveredRuleAssets(CURATED_RULE_ASSET_INVENTORY).map(withExplicitGovernanceFields),
]

function groupByLifecycleType(assets: readonly AlgorithmRuleAsset[]) {
  const grouped = Object.fromEntries(LIFECYCLE_TYPES.map((type) => [type, []])) as Record<AlgorithmRuleAssetLifecycleType, AlgorithmRuleAsset[]>
  for (const asset of assets) grouped[asset.lifecycleType].push(asset)
  return grouped
}

function groupByRecommendation(assets: readonly AlgorithmRuleAsset[]) {
  const grouped = Object.fromEntries(RECOMMENDATIONS.map((type) => [type, []])) as Record<AlgorithmRuleAssetRecommendation, AlgorithmRuleAsset[]>
  for (const asset of assets) grouped[asset.recommendation].push(asset)
  return grouped
}

function duplicateKeys(assets: readonly AlgorithmRuleAsset[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const asset of assets) {
    if (seen.has(asset.key)) duplicates.add(asset.key)
    seen.add(asset.key)
  }
  return [...duplicates].sort()
}

export function listAlgorithmRuleAssets(options: ListAlgorithmRuleAssetOptions = {}) {
  return ALGORITHM_RULE_ASSET_INVENTORY.filter((asset) => (
    (!options.lifecycleType || asset.lifecycleType === options.lifecycleType)
    && (!options.recommendation || asset.recommendation === options.recommendation)
  ))
}

export function getAlgorithmRuleAsset(key: string) {
  return ALGORITHM_RULE_ASSET_INVENTORY.find((asset) => asset.key === key) ?? null
}

export function getAlgorithmRuleAssetInventoryDiagnostics(): AlgorithmRuleAssetInventoryDiagnostics {
  const assets = listAlgorithmRuleAssets()
  const assetsByLifecycleType = groupByLifecycleType(assets)
  const assetsByRecommendation = groupByRecommendation(assets)
  const algorithmSeedTypes = listAlgorithmSeedTypes()
  const inventoriedSeedTypes = new Set(
    assets
      .filter((asset) => asset.lifecycleType === 'algorithm_seed' && asset.algorithmSeedType)
      .map((asset) => asset.algorithmSeedType as AlgorithmSeedType),
  )

  const countsByLifecycleType = Object.fromEntries(
    LIFECYCLE_TYPES.map((type) => [type, assetsByLifecycleType[type].length]),
  ) as Record<AlgorithmRuleAssetLifecycleType, number>
  const countsByRecommendation = Object.fromEntries(
    RECOMMENDATIONS.map((type) => [type, assetsByRecommendation[type].length]),
  ) as Record<AlgorithmRuleAssetRecommendation, number>

  return {
    version: ALGORITHM_RULE_ASSET_INVENTORY_VERSION,
    summary: {
      totalAssetCount: assets.length,
      algorithmSeedCount: assetsByLifecycleType.algorithm_seed.length,
      independentGovernanceCount: assetsByRecommendation.keep_independent_governance.length,
      diagnosticBridgeCount: assetsByRecommendation.diagnostic_bridge_only.length,
      candidateForAlgorithmSeedCount: assetsByLifecycleType.candidate_for_algorithm_seed.length,
      countsByLifecycleType,
      countsByRecommendation,
    },
    gaps: {
      duplicateAssetKeys: duplicateKeys(assets),
      missingAlgorithmSeedTypes: algorithmSeedTypes.filter((seedType) => !inventoriedSeedTypes.has(seedType)),
      algorithmSeedAssetsMissingSeedType: assets
        .filter((asset) => asset.lifecycleType === 'algorithm_seed' && !asset.algorithmSeedType)
        .map((asset) => asset.key),
      algorithmSeedAssetsMissingCapabilities: assets
        .filter((asset) => asset.lifecycleType === 'algorithm_seed' && (
          !asset.capabilities
          || !asset.capabilities.resolver
          || !asset.capabilities.validation
          || !asset.capabilities.import
          || !asset.capabilities.rollback
        ))
        .map((asset) => asset.key),
    },
    assetsByLifecycleType,
    assetsByRecommendation,
    assets,
  }
}

function pushAdmissionBlocker(
  blockers: AlgorithmAssetAdmissionGateBlocker[],
  code: AlgorithmAssetAdmissionGateBlockerCode,
  subjects: readonly unknown[],
  detail: string,
) {
  const normalizedSubjects = uniqueStrings(subjects)
  if (normalizedSubjects.length === 0) return
  blockers.push({ code, subjects: normalizedSubjects, detail })
}

export function evaluateAlgorithmAssetAdmissionGate(): AlgorithmAssetAdmissionGate {
  const factDiagnostics = getProjectGenerationFactGovernanceDiagnostics()
  const inventoryDiagnostics = getAlgorithmRuleAssetInventoryDiagnostics()
  const factorMatrix = listDurationContextFactorConsumptionMatrix()
  const factorAutomationPolicies = listDurationContextFactorAutomationPolicies()
  const factorMatrixByKey = new Map(factorMatrix.map((entry) => [entry.factorKey, entry]))
  const factorAutomationPolicyKeys = new Set(factorAutomationPolicies.map((policy) => policy.factorKey))
  const blockers: AlgorithmAssetAdmissionGateBlocker[] = []

  const missingFactorMatrixKeys = GOVERNED_DURATION_CONTEXT_FACTOR_KEYS
    .filter((factorKey) => !factorMatrixByKey.has(factorKey))
  const factorsWithoutConsumers = factorMatrix
    .filter((entry) => entry.primaryConsumers.length === 0)
    .map((entry) => entry.factorKey)
  const factorsWithoutRuntimeEffect = factorMatrix
    .filter((entry) => entry.runtimeEffect.trim().length === 0)
    .map((entry) => entry.factorKey)
  const missingAutomationPolicyKeys = GOVERNED_DURATION_CONTEXT_FACTOR_KEYS
    .filter((factorKey) => !factorAutomationPolicyKeys.has(factorKey))

  pushAdmissionBlocker(
    blockers,
    'project_fact_without_consumer',
    factDiagnostics.uncoveredFactKeys,
    'Every ProjectGenerationFacts field must declare at least one downstream consumer.',
  )
  pushAdmissionBlocker(
    blockers,
    'project_fact_without_generation_consumer',
    factDiagnostics.fieldsWithoutGenerationConsumer,
    'Every canonical project fact must either affect template generation or have an explicit generation-facing consumer.',
  )
  pushAdmissionBlocker(
    blockers,
    'duration_context_factor_without_consumption_matrix',
    missingFactorMatrixKeys,
    'Every DurationContextFactorKey must have a consumption matrix entry before runtime use or replay calibration.',
  )
  pushAdmissionBlocker(
    blockers,
    'duration_context_factor_without_primary_consumer',
    factorsWithoutConsumers,
    'Every duration context factor must declare primary consumers.',
  )
  pushAdmissionBlocker(
    blockers,
    'duration_context_factor_without_runtime_effect',
    factorsWithoutRuntimeEffect,
    'Every duration context factor must document its runtime effect.',
  )
  pushAdmissionBlocker(
    blockers,
    'duration_context_factor_without_automation_policy',
    missingAutomationPolicyKeys,
    'Every duration context factor must declare automation and runtime-promotion policy.',
  )
  pushAdmissionBlocker(
    blockers,
    'algorithm_seed_without_rule_asset',
    inventoryDiagnostics.gaps.missingAlgorithmSeedTypes,
    'Every AlgorithmSeedType must be registered in the rule asset inventory.',
  )
  pushAdmissionBlocker(
    blockers,
    'algorithm_seed_asset_without_capability',
    inventoryDiagnostics.gaps.algorithmSeedAssetsMissingCapabilities,
    'Every algorithm seed asset must expose resolver, validation, import and rollback capability policy.',
  )
  pushAdmissionBlocker(
    blockers,
    'duplicate_rule_asset_key',
    inventoryDiagnostics.gaps.duplicateAssetKeys,
    'Rule and governance asset keys must stay unique.',
  )

  return {
    gateCode: 'algorithm_asset_admission_gate',
    status: blockers.length > 0 ? 'block' : 'pass',
    requiredFor: [
      'adding_project_generation_fact',
      'adding_duration_context_factor',
      'adding_algorithm_seed_type',
      'adding_rule_or_governance_asset',
      'before_golden_benchmark_replay',
    ],
    summary: {
      projectFactUncoveredCount: factDiagnostics.uncoveredFactKeys.length,
      projectFactWithoutGenerationConsumerCount: factDiagnostics.fieldsWithoutGenerationConsumer.length,
      durationFactorCount: factorMatrix.length,
      durationFactorMissingConsumerCount: factorsWithoutConsumers.length,
      durationFactorMissingAutomationPolicyCount: missingAutomationPolicyKeys.length,
      algorithmSeedMissingAssetCount: inventoryDiagnostics.gaps.missingAlgorithmSeedTypes.length,
      algorithmSeedMissingCapabilityCount: inventoryDiagnostics.gaps.algorithmSeedAssetsMissingCapabilities.length,
      duplicateRuleAssetKeyCount: inventoryDiagnostics.gaps.duplicateAssetKeys.length,
    },
    blockers,
    boundaryPolicy: [
      'new_project_fact_requires_consumer_matrix_entry',
      'new_duration_context_factor_requires_consumption_matrix_and_automation_policy',
      'new_algorithm_seed_requires_rule_asset_inventory_entry',
      'new_rule_asset_key_must_be_unique',
      'golden_replay_must_run_after_asset_admission_passes',
      'admission_gate_reports_only_and_does_not_mutate_runtime_plans',
    ],
  }
}
