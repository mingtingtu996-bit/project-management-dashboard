import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

export const WBS_TASK_STRUCTURE_PIPELINE_NAME = 'wbs_task_structure_governance_pipeline' as const
export const WBS_TASK_STRUCTURE_PIPELINE_CONTRACT_VERSION = 'v1.4.22-wbs-task-structure-governance-assets-20260527' as const

export type WbsTaskStructurePipelineStageName =
  | 'scope_resolution'
  | 'template_or_manual_structure_generation'
  | 'task_standard_inference'
  | 'wbs_semantic_inference'
  | 'wbs_plan_rollup'
  | 'task_code_generation'
  | 'lineage_and_snapshot'
  | 'downstream_governance_consumption'

export type WbsTaskStructurePipelineGate =
  | 'input_gate'
  | 'generation_gate'
  | 'semantic_gate'
  | 'edit_commit_gate'
  | 'write_chain_only'
  | 'post_write_traceability'
  | 'consume_or_explain_only'

export type WbsTaskStructurePipelineStage = {
  order: number
  stage: WbsTaskStructurePipelineStageName
  service: string
  role:
    | 'scope_contract'
    | 'structure_generation'
    | 'standard_work_contract'
    | 'semantic_contract'
    | 'plan_rollup_gate'
    | 'identity_finalization'
    | 'traceability_contract'
    | 'downstream_consumer_boundary'
  gate: WbsTaskStructurePipelineGate
  canRewriteStructure: boolean
}

export type WbsTaskStructureRuleAssetCategory =
  | 'template_catalog'
  | 'registry_seed'
  | 'code_consumed_rule_asset'
  | 'service_governance_asset'
  | 'downstream_diagnostic'

export type WbsTaskStructureRuleAssetRuntimeRole =
  | 'structure_writer'
  | 'duration_parameter'
  | 'dependency_candidate'
  | 'dependency_rule'
  | 'semantic_classifier'
  | 'identity_finalizer'
  | 'traceability_recorder'
  | 'diagnostic_only'
  | 'governance_only'
  | 'template_selector'
  | 'scenario_taxonomy_resolver'
  | 'building_pattern_execution_resolver'
  | 'construction_organization_scenario_selector'
  | 'construction_organization_plan_option_candidate_event_adapter'
  | 'scope_mapper'
  | 'execution_gate_deriver'
  | 'constraint_diagnostic'

export type WbsTaskStructureRuleAsset = {
  key: string
  source: string
  category: WbsTaskStructureRuleAssetCategory
  stage: WbsTaskStructurePipelineStageName
  role: string
  runtimeRole: WbsTaskStructureRuleAssetRuntimeRole
  canRewriteStructure: boolean
  downstreamOnly?: boolean
  requiredWriteContract?: boolean
  writeContractField?: string
  hardGate?: 'error_block_save'
}

export type WbsTaskStructureRuleAssetSystemLayerKey =
  | 'structure_seed_layer'
  | 'duration_seed_layer'
  | 'dependency_rule_layer'
  | 'semantic_control_layer'
  | 'identity_traceability_layer'
  | 'diagnostic_translation_layer'
  | 'asset_governance_layer'

export type WbsTaskStructureRuleAssetSystemExtraAsset = {
  key: string
  source: string
  role: string
  writesTaskStructure: boolean
}

export type WbsTaskStructureRuleAssetSystemLayer = {
  key: WbsTaskStructureRuleAssetSystemLayerKey
  name: string
  role: string
  assetKeys: readonly string[]
  extraAssets?: readonly WbsTaskStructureRuleAssetSystemExtraAsset[]
  writesTaskStructure: boolean
  maintenancePolicy: string
}

export const WBS_TASK_STRUCTURE_PIPELINE_STAGES: readonly WbsTaskStructurePipelineStage[] = [
  {
    order: 1,
    stage: 'scope_resolution',
    service: 'engineeringObjectService',
    role: 'scope_contract',
    gate: 'input_gate',
    canRewriteStructure: true,
  },
  {
    order: 2,
    stage: 'template_or_manual_structure_generation',
    service: 'wbsTemplateGenerationService/taskWriteChainService',
    role: 'structure_generation',
    gate: 'generation_gate',
    canRewriteStructure: true,
  },
  {
    order: 3,
    stage: 'task_standard_inference',
    service: 'taskStandardInferenceService/taskStandardModelService',
    role: 'standard_work_contract',
    gate: 'semantic_gate',
    canRewriteStructure: true,
  },
  {
    order: 4,
    stage: 'wbs_semantic_inference',
    service: 'wbsSemanticService',
    role: 'semantic_contract',
    gate: 'semantic_gate',
    canRewriteStructure: true,
  },
  {
    order: 5,
    stage: 'wbs_plan_rollup',
    service: 'wbsPlanRollupService',
    role: 'plan_rollup_gate',
    gate: 'edit_commit_gate',
    canRewriteStructure: true,
  },
  {
    order: 6,
    stage: 'task_code_generation',
    service: 'taskCodeGenerationService',
    role: 'identity_finalization',
    gate: 'write_chain_only',
    canRewriteStructure: false,
  },
  {
    order: 7,
    stage: 'lineage_and_snapshot',
    service: 'dataLineageService/planningSnapshotService',
    role: 'traceability_contract',
    gate: 'post_write_traceability',
    canRewriteStructure: false,
  },
  {
    order: 8,
    stage: 'downstream_governance_consumption',
    service: 'planningGovernanceService/durationForecast/progressDeviation/dataQuality',
    role: 'downstream_consumer_boundary',
    gate: 'consume_or_explain_only',
    canRewriteStructure: false,
  },
] as const

export const WBS_TASK_STRUCTURE_RULE_ASSETS: readonly WbsTaskStructureRuleAsset[] = [
  {
    key: 'engineeringObjectService',
    source: 'server/src/services/engineeringObjectService.ts',
    category: 'service_governance_asset',
    stage: 'scope_resolution',
    role: 'project_scope_and_engineering_object_resolution',
    runtimeRole: 'structure_writer',
    canRewriteStructure: true,
  },
  {
    key: 'wbsTemplateGenerationService',
    source: 'server/src/services/wbsTemplateGenerationService.ts',
    category: 'service_governance_asset',
    stage: 'template_or_manual_structure_generation',
    role: 'template_manual_import_row_structure_generation_orchestration',
    runtimeRole: 'structure_writer',
    canRewriteStructure: true,
  },
  {
    key: 'projectFactsToTemplateService',
    source: 'server/src/services/projectFactsToTemplateService.ts',
    category: 'service_governance_asset',
    stage: 'scope_resolution',
    role: 'project_fact_to_template_pack_selection',
    runtimeRole: 'template_selector',
    canRewriteStructure: false,
  },
  {
    key: 'projectTypeRecommendations',
    source: 'server/src/services/projectTypeRecommendations.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'business_type_default_methods_features_and_template_count_policy',
    runtimeRole: 'template_selector',
    canRewriteStructure: false,
  },
  {
    key: 'projectScenarioTaxonomyService',
    source: 'server/src/services/projectScenarioTaxonomyService.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'business_type_recommendation_pack_and_benchmark_taxonomy; delegates building-pattern execution archetype to building_pattern projection',
    runtimeRole: 'scenario_taxonomy_resolver',
    canRewriteStructure: false,
  },
  {
    key: 'buildingPatternExecutionResolver',
    source: 'server/src/services/buildingPatternExecutionResolver.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'v1474_building_pattern_to_wbs_execution_archetype_projection',
    runtimeRole: 'building_pattern_execution_resolver',
    canRewriteStructure: false,
  },
  {
    key: 'constructionOrganizationScenarioSelector',
    source: 'server/src/services/constructionOrganizationScenarioSelector.ts',
    category: 'service_governance_asset',
    stage: 'scope_resolution',
    role: 'project_fact_to_construction_organization_scenario_virtual_network_candidate_selection_for_generation_and_e5',
    runtimeRole: 'construction_organization_scenario_selector',
    canRewriteStructure: false,
  },
  {
    key: 'constructionOrganizationScenarioGovernanceService',
    source: 'server/src/services/constructionOrganizationScenarioGovernanceService.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'construction_organization_plan_options_to_algorithm_asset_candidate_events_candidate_weight_governance',
    runtimeRole: 'construction_organization_plan_option_candidate_event_adapter',
    canRewriteStructure: false,
  },
  {
    key: 'projectFeatureToItemPackMap',
    source: 'server/src/services/projectFeatureToItemPackMap.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'engineering_feature_to_template_pack_milestone_and_suppression_policy',
    runtimeRole: 'template_selector',
    canRewriteStructure: false,
  },
  {
    key: 'scopeAssignmentRulesService',
    source: 'server/src/services/scopeAssignmentRulesService.ts',
    category: 'service_governance_asset',
    stage: 'scope_resolution',
    role: 'template_pack_to_building_zone_scope_assignment_policy',
    runtimeRole: 'scope_mapper',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateProjectRecommendations',
    source: 'server/src/seeds/wbsTemplateProjectRecommendations.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'project_profile_to_required_recommended_conditional_template_combination',
    runtimeRole: 'template_selector',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateCommercialGovernanceContent',
    source: 'server/src/seeds/wbsTemplateCommercialGovernanceContent.ts',
    category: 'code_consumed_rule_asset',
    stage: 'scope_resolution',
    role: 'commercial_template_combination_playbook_and_authoring_policy_source',
    runtimeRole: 'template_selector',
    canRewriteStructure: false,
  },
  {
    key: 'chinaGb50300TemplateCatalog',
    source: 'server/src/seeds/chinaGb50300TemplateCatalog.ts',
    category: 'template_catalog',
    stage: 'template_or_manual_structure_generation',
    role: 'standard_wbs_template_catalog_and_internal_flow_resolution',
    runtimeRole: 'structure_writer',
    canRewriteStructure: true,
  },
  {
    key: 'domainWbsTemplateCatalogs',
    source: 'server/src/seeds/domainWbsTemplateCatalogs.ts',
    category: 'template_catalog',
    stage: 'template_or_manual_structure_generation',
    role: 'domain_and_zone_template_catalog_extension',
    runtimeRole: 'structure_writer',
    canRewriteStructure: true,
  },
  {
    key: 'standard_internal_flow',
    source: 'server/src/seeds/standardInternalFlowSeed.ts',
    category: 'registry_seed',
    stage: 'template_or_manual_structure_generation',
    role: 'same_parent_process_and_activity_step_sequence_rule',
    runtimeRole: 'dependency_rule',
    canRewriteStructure: true,
  },
  {
    key: 'workflow_dictionary',
    source: 'server/src/seeds/v1474WorkflowDictionarySeed.ts',
    category: 'registry_seed',
    stage: 'template_or_manual_structure_generation',
    role: 'historical_and_weak_relation_dictionary_for_governance_candidate_discovery',
    runtimeRole: 'dependency_candidate',
    canRewriteStructure: false,
  },
  {
    key: 'standard_work_duration_seed',
    source: 'server/src/seeds/standardWorkDurationSeed.ts',
    category: 'registry_seed',
    stage: 'task_standard_inference',
    role: 'process_level_smart_reference_days_and_base_days_caliber',
    runtimeRole: 'duration_parameter',
    canRewriteStructure: false,
  },
  {
    key: 'v1474ProcessConstraintSeed',
    source: 'server/src/seeds/v1474ProcessConstraintSeed.ts',
    category: 'registry_seed',
    stage: 'template_or_manual_structure_generation',
    role: 'dependency_edge_overlap_gate_and_time_source_routing',
    runtimeRole: 'dependency_rule',
    canRewriteStructure: true,
  },
  {
    key: 'v1475CrossItemWorkflowSeed',
    source: 'server/src/seeds/v1475CrossItemWorkflowSeed.ts',
    category: 'registry_seed',
    stage: 'template_or_manual_structure_generation',
    role: 'cross_item_workflow_dependency_reference',
    runtimeRole: 'dependency_rule',
    canRewriteStructure: true,
  },
  {
    key: 'v1472TitleWeakRecognitionSeed',
    source: 'server/src/seeds/v1472TitleWeakRecognitionSeed.ts',
    category: 'registry_seed',
    stage: 'task_standard_inference',
    role: 'low_confidence_standard_work_candidate_mapping',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: false,
  },
  {
    key: 'taskStandardInferenceService',
    source: 'server/src/services/taskStandardInferenceService.ts',
    category: 'service_governance_asset',
    stage: 'task_standard_inference',
    role: 'task_to_standard_work_identity_inference',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: true,
  },
  {
    key: 'taskStandardModelService',
    source: 'server/src/services/taskStandardModelService.ts',
    category: 'service_governance_asset',
    stage: 'task_standard_inference',
    role: 'construction_task_standard_model_source',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: true,
  },
  {
    key: 'durationContributionMode',
    source: 'server/src/seeds/durationContributionMode.ts',
    category: 'code_consumed_rule_asset',
    stage: 'wbs_plan_rollup',
    role: 'duration_bearing_or_non_bearing_row_classification',
    runtimeRole: 'duration_parameter',
    canRewriteStructure: false,
    requiredWriteContract: true,
    writeContractField: 'duration_contribution_mode',
    hardGate: 'error_block_save',
  },
  {
    key: 'executionNature',
    source: 'server/src/seeds/executionNature.ts',
    category: 'code_consumed_rule_asset',
    stage: 'wbs_semantic_inference',
    role: 'physical_work_inspection_waiting_record_semantic_classification',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: false,
  },
  {
    key: 'controlRoles',
    source: 'server/src/seeds/controlRoles.ts',
    category: 'code_consumed_rule_asset',
    stage: 'wbs_semantic_inference',
    role: 'quality_safety_handover_control_role_classification',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateSemanticOverrides',
    source: 'server/src/seeds/wbsTemplateSemanticOverrides.ts',
    category: 'code_consumed_rule_asset',
    stage: 'wbs_semantic_inference',
    role: 'curated_template_node_semantic_override_source',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: false,
  },
  {
    key: 'workEnvironment',
    source: 'server/src/seeds/workEnvironment.ts',
    category: 'code_consumed_rule_asset',
    stage: 'wbs_semantic_inference',
    role: 'indoor_outdoor_mixed_work_environment_classification',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: false,
  },
  {
    key: 'constructionScopeInferenceService',
    source: 'server/src/services/constructionScopeInferenceService.ts',
    category: 'service_governance_asset',
    stage: 'scope_resolution',
    role: 'construction_system_workface_scope_dimension_and_rhythm_context_inference',
    runtimeRole: 'scope_mapper',
    canRewriteStructure: false,
  },
  {
    key: 'v1475DependencyIntentTemplates',
    source: 'server/src/seeds/v1475DependencyIntentTemplates.ts',
    category: 'code_consumed_rule_asset',
    stage: 'template_or_manual_structure_generation',
    role: 'dependency_intent_reference_and_anchor_selection',
    runtimeRole: 'dependency_rule',
    canRewriteStructure: true,
  },
  {
    key: 'wbsSemanticService',
    source: 'server/src/services/wbsSemanticService.ts',
    category: 'service_governance_asset',
    stage: 'wbs_semantic_inference',
    role: 'wbs_summary_leaf_and_semantic_node_classification',
    runtimeRole: 'semantic_classifier',
    canRewriteStructure: true,
  },
  {
    key: 'wbsPlanRollupService',
    source: 'server/src/services/wbsPlanRollupService.ts',
    category: 'service_governance_asset',
    stage: 'wbs_plan_rollup',
    role: 'parent_child_plan_window_and_smart_reference_rollup_gate',
    runtimeRole: 'structure_writer',
    canRewriteStructure: true,
  },
  {
    key: 'durationSuggestionService',
    source: 'server/src/services/durationSuggestionService.ts',
    category: 'service_governance_asset',
    stage: 'task_standard_inference',
    role: 'smart_reference_suggestion_and_duration_seed_resolution',
    runtimeRole: 'duration_parameter',
    canRewriteStructure: false,
  },
  {
    key: 'wbsReferenceDaysInference',
    source: 'server/src/services/wbsReferenceDaysInference.ts',
    category: 'service_governance_asset',
    stage: 'task_standard_inference',
    role: 'template_feedback_reference_days_inference_preview_and_confirmation_support',
    runtimeRole: 'duration_parameter',
    canRewriteStructure: false,
  },
  {
    key: 'templateDurationGovernanceService',
    source: 'server/src/services/templateDurationGovernanceService.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'template_duration_benchmark_and_override_candidate_governance',
    runtimeRole: 'governance_only',
    canRewriteStructure: false,
  },
  {
    key: 'taskCodeGenerationService',
    source: 'server/src/services/taskCodeGenerationService.ts',
    category: 'service_governance_asset',
    stage: 'task_code_generation',
    role: 'final_task_code_identity_generation',
    runtimeRole: 'identity_finalizer',
    canRewriteStructure: false,
  },
  {
    key: 'taskCodeRuleService',
    source: 'server/src/services/taskCodeRuleService.ts',
    category: 'code_consumed_rule_asset',
    stage: 'task_code_generation',
    role: 'task_code_rule_source_and_code_segment_policy',
    runtimeRole: 'identity_finalizer',
    canRewriteStructure: false,
  },
  {
    key: 'taskCodeTransactionService',
    source: 'server/src/services/taskCodeTransactionService.ts',
    category: 'service_governance_asset',
    stage: 'task_code_generation',
    role: 'write_chain_only_task_code_finalization',
    runtimeRole: 'identity_finalizer',
    canRewriteStructure: false,
  },
  {
    key: 'dataLineageService',
    source: 'server/src/services/dataLineageService.ts',
    category: 'service_governance_asset',
    stage: 'lineage_and_snapshot',
    role: 'source_lineage_mapping_and_traceability',
    runtimeRole: 'traceability_recorder',
    canRewriteStructure: false,
  },
  {
    key: 'planningSnapshotService',
    source: 'server/src/services/planningSnapshotService.ts',
    category: 'service_governance_asset',
    stage: 'lineage_and_snapshot',
    role: 'confirmed_structure_snapshot_boundary',
    runtimeRole: 'traceability_recorder',
    canRewriteStructure: false,
  },
  {
    key: 'planSnapshotSeedVersions',
    source: 'server/src/services/planSnapshotSeedVersions.ts',
    category: 'service_governance_asset',
    stage: 'lineage_and_snapshot',
    role: 'plan_snapshot_seed_version_lineage_manifest',
    runtimeRole: 'traceability_recorder',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateEvidenceRefEnrichment',
    source: 'server/src/seeds/wbsTemplateEvidenceRefEnrichment.ts',
    category: 'code_consumed_rule_asset',
    stage: 'lineage_and_snapshot',
    role: 'template_node_evidence_reference_enrichment_source',
    runtimeRole: 'traceability_recorder',
    canRewriteStructure: false,
  },
  {
    key: 'dataQualityService',
    source: 'server/src/services/dataQualityService.ts',
    category: 'downstream_diagnostic',
    stage: 'downstream_governance_consumption',
    role: 'quality_finding_severity_recommendation_and_confidence_diagnostic',
    runtimeRole: 'diagnostic_only',
    canRewriteStructure: false,
    downstreamOnly: true,
  },
  {
    key: 'dataQualityRuleRegistry',
    source: 'server/src/services/dataQualityRuleRegistry.ts',
    category: 'downstream_diagnostic',
    stage: 'downstream_governance_consumption',
    role: 'data_quality_rule_dimension_severity_recommendation_registry',
    runtimeRole: 'diagnostic_only',
    canRewriteStructure: false,
    downstreamOnly: true,
  },
  {
    key: 'dataLineageGovernanceService',
    source: 'server/src/services/dataLineageGovernanceService.ts',
    category: 'downstream_diagnostic',
    stage: 'downstream_governance_consumption',
    role: 'lineage_anomaly_presentation_ai_read_and_write_boundary_governance',
    runtimeRole: 'diagnostic_only',
    canRewriteStructure: false,
    downstreamOnly: true,
  },
  {
    key: 'executionGateSeedService',
    source: 'server/src/services/executionGateSeedService.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'template_generated_start_condition_and_acceptance_gate_derivation',
    runtimeRole: 'execution_gate_deriver',
    canRewriteStructure: false,
  },
  {
    key: 'taskConstraintGovernanceService',
    source: 'server/src/services/taskConstraintGovernanceService.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'dependency_condition_obstacle_constraint_snapshot_and_execution_readiness_diagnostic',
    runtimeRole: 'constraint_diagnostic',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateFeedback',
    source: 'server/src/services/wbsTemplateFeedback.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'completed_project_template_feedback_and_reference_day_candidate_collection',
    runtimeRole: 'governance_only',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateCandidateEventService',
    source: 'server/src/services/wbsTemplateCandidateEventService.ts',
    category: 'service_governance_asset',
    stage: 'downstream_governance_consumption',
    role: 'template_generation_candidate_event_and_acceptance_rate_governance',
    runtimeRole: 'governance_only',
    canRewriteStructure: false,
  },
  {
    key: 'wbsTemplateRealProjectCoverageMatrix',
    source: 'server/src/seeds/wbsTemplateRealProjectCoverageMatrix.ts',
    category: 'code_consumed_rule_asset',
    stage: 'downstream_governance_consumption',
    role: 'real_project_template_coverage_evidence_matrix',
    runtimeRole: 'governance_only',
    canRewriteStructure: false,
  },
] as const

export const WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS: readonly WbsTaskStructureRuleAssetSystemLayer[] = [
  {
    key: 'structure_seed_layer',
    name: 'standard_and_domain_wbs_structure_seed_layer',
    role: 'defines standard work breakdown, domain packs, zones, process and activity step structure',
    assetKeys: [
        'projectFactsToTemplateService',
        'projectScenarioTaxonomyService',
        'buildingPatternExecutionResolver',
        'constructionOrganizationScenarioSelector',
        'projectTypeRecommendations',
        'projectFeatureToItemPackMap',
      'scopeAssignmentRulesService',
      'wbsTemplateProjectRecommendations',
      'wbsTemplateCommercialGovernanceContent',
      'chinaGb50300TemplateCatalog',
      'domainWbsTemplateCatalogs',
    ],
    writesTaskStructure: true,
    maintenancePolicy: 'template selection assets choose eligible packs only; structure writing still happens through template generation and write chain',
  },
  {
    key: 'duration_seed_layer',
    name: 'standard_duration_and_duration_contribution_layer',
    role: 'defines reference duration, base days eligibility and duration-bearing semantics',
    assetKeys: [
      'standard_work_duration_seed',
      'durationContributionMode',
      'durationSuggestionService',
      'wbsReferenceDaysInference',
      'templateDurationGovernanceService',
    ],
    writesTaskStructure: false,
    maintenancePolicy: 'duration seeds provide parameters only; non-bearing rows must not contribute parent smart reference days',
  },
  {
    key: 'dependency_rule_layer',
    name: 'five_layer_dependency_rule_system',
    role: 'governs same-parent flow, cross-item workflow, business-domain dependency intent and process constraints',
    assetKeys: [
      'workflow_dictionary',
      'standard_internal_flow',
      'v1475CrossItemWorkflowSeed',
      'v1475DependencyIntentTemplates',
      'v1474ProcessConstraintSeed',
    ],
    writesTaskStructure: true,
    maintenancePolicy: 'workflow_dictionary is candidate/governance only; runtime dependencies must come from curated flow, workflow, intent, or constraint assets',
  },
  {
    key: 'semantic_control_layer',
    name: 'wbs_semantic_and_control_role_layer',
    role: 'classifies executable rows, summary rows, execution nature and quality/safety/handover control roles',
    assetKeys: [
      'wbsSemanticService',
      'executionNature',
      'controlRoles',
      'v1472TitleWeakRecognitionSeed',
      'wbsTemplateSemanticOverrides',
      'workEnvironment',
      'constructionScopeInferenceService',
      'taskStandardInferenceService',
      'taskStandardModelService',
    ],
    writesTaskStructure: true,
    maintenancePolicy: 'semantic inference can support generation but weak title matches remain low-confidence candidates unless resolved to standard work',
  },
  {
    key: 'identity_traceability_layer',
    name: 'task_code_lineage_and_snapshot_layer',
    role: 'finalizes task identity and records source lineage and confirmed structure snapshots',
    assetKeys: [
      'taskCodeRuleService',
      'taskCodeGenerationService',
      'taskCodeTransactionService',
      'dataLineageService',
      'planningSnapshotService',
      'planSnapshotSeedVersions',
      'wbsTemplateEvidenceRefEnrichment',
    ],
    writesTaskStructure: false,
    maintenancePolicy: 'task code is write-chain-only; lineage and snapshots explain confirmed structure without rewriting it',
  },
  {
    key: 'diagnostic_translation_layer',
    name: 'data_quality_and_planning_translation_layer',
    role: 'diagnoses structure/fact quality and feeds planning-domain translation without direct write authority',
    assetKeys: [
      'dataQualityService',
      'dataQualityRuleRegistry',
      'dataLineageGovernanceService',
      'executionGateSeedService',
      'taskConstraintGovernanceService',
    ],
    writesTaskStructure: false,
    maintenancePolicy: 'data quality findings can become planning warnings or blockers only after planning-domain translation',
  },
  {
    key: 'asset_governance_layer',
    name: 'rule_asset_governance_and_candidate_layer',
    role: 'registers, resolves, validates, imports, learns and audits WBS-related rule assets',
    assetKeys: [
      'wbsTemplateFeedback',
      'wbsTemplateCandidateEventService',
      'constructionOrganizationScenarioGovernanceService',
      'wbsTemplateRealProjectCoverageMatrix',
    ],
    extraAssets: [
      {
        key: 'algorithmSeedRegistry',
        source: 'server/src/services/algorithmSeedRegistry.ts',
        role: 'official registry seed ledger and payload normalization',
        writesTaskStructure: false,
      },
      {
        key: 'algorithmSeedResolver',
        source: 'server/src/services/algorithmSeedResolver.ts',
        role: 'project/company/system seed and override resolution',
        writesTaskStructure: false,
      },
      {
        key: 'algorithmSeedValidationService',
        source: 'server/src/services/algorithmSeedValidationService.ts',
        role: 'seed legality, conflict and boundary validation',
        writesTaskStructure: false,
      },
      {
        key: 'algorithmSeedCandidateDiscoveryService',
        source: 'server/src/services/algorithmSeedCandidateDiscoveryService.ts',
        role: 'execution-sample candidate discovery without direct seed mutation',
        writesTaskStructure: false,
      },
      {
        key: 'algorithmSeedAutoGovernanceService',
        source: 'server/src/services/algorithmSeedAutoGovernanceService.ts',
        role: 'candidate quarantine, promotion and auto-governance boundary',
        writesTaskStructure: false,
      },
      {
        key: 'algorithmSeedImportService',
        source: 'server/src/services/algorithmSeedImportService.ts',
        role: 'seed import, versioning and rollback boundary',
        writesTaskStructure: false,
      },
      {
        key: 'wbsTemplateSeedArchitectureGovernanceService',
        source: 'server/src/services/wbsTemplateSeedArchitectureGovernanceService.ts',
        role: 'template seed architecture coverage and governance reports',
        writesTaskStructure: false,
      },
      {
        key: 'wbsSeedSemanticGovernanceService',
        source: 'server/src/services/wbsSeedSemanticGovernanceService.ts',
        role: 'WBS semantic seed coverage, conflict and candidate policy governance',
        writesTaskStructure: false,
      },
      {
        key: 'constructionDependencyRuleSystemService',
        source: 'server/src/services/constructionDependencyRuleSystemService.ts',
        role: 'five-layer dependency rule system report and boundary explanation',
        writesTaskStructure: false,
      },
      {
        key: 'wbsTemplateCatalogIndex',
        source: 'server/src/seeds/wbsTemplateCatalogIndex.ts',
        role: 'template catalog index and governance lookup support',
        writesTaskStructure: false,
      },
      {
        key: 'wbsReconciliationService',
        source: 'server/src/services/wbsReconciliationService.ts',
        role: 'legacy reconcile preview and user-edited-task preservation support',
        writesTaskStructure: false,
      },
      {
        key: 'wbsTemplatePresets',
        source: 'server/src/services/wbsTemplatePresets.ts',
        role: 'legacy suggested template preview support',
        writesTaskStructure: false,
      },
    ],
    writesTaskStructure: false,
    maintenancePolicy: 'real project feedback creates candidates and governance evidence only; promoted rules must pass registry/catalog validation',
  },
] as const

export type WbsTaskStructureGovernanceMetadataInput = {
  source: 'template_generate' | 'manual_task_write' | 'import' | 'baseline_generate' | 'monthly_plan_generate' | string
  rollupApplied?: boolean
  taskCodeFinalized?: boolean
  lineageExpected?: boolean
  compactProfile?: boolean
}

export type WbsTaskStructureRuleAssetInventoryCandidate = {
  key: string
  source: string
}

export type WbsTaskStructureGovernanceProfile = {
  contractVersion: typeof WBS_TASK_STRUCTURE_PIPELINE_CONTRACT_VERSION
  assetKeys: string[]
  layerKeys: WbsTaskStructureRuleAssetSystemLayerKey[]
  requiredWriteContractFields: string[]
  assetProfileHash: string
}

export type WbsTaskStructureGovernanceMetadata = {
  pipeline: typeof WBS_TASK_STRUCTURE_PIPELINE_NAME
  contractVersion: typeof WBS_TASK_STRUCTURE_PIPELINE_CONTRACT_VERSION
  source: string
  stages: Array<{
    order: number
    stage: WbsTaskStructurePipelineStageName
    service: string
    gate: WbsTaskStructurePipelineGate
    canRewriteStructure: boolean
  }>
  rollupApplied: boolean
  taskCodeFinalized: boolean
  taskCodeFinalization: 'write_chain_only'
  lineageExpected: boolean
  downstreamAlgorithmsCanRewriteStructure: false
  downstreamPolicy: 'consume_or_explain_only'
  dataQualityRole: 'diagnose_and_recommend_only'
  dataQualityCanBlockDirectly: false
  ruleAssets?: Array<{
    key: string
    source: string
    category: WbsTaskStructureRuleAssetCategory
    stage: WbsTaskStructurePipelineStageName
    role: string
    runtimeRole: WbsTaskStructureRuleAssetRuntimeRole
    canRewriteStructure: boolean
    downstreamOnly: boolean
    requiredWriteContract: boolean
    writeContractField: string | null
    hardGate: 'error_block_save' | null
  }>
  ruleAssetSystemLayers?: Array<{
    key: WbsTaskStructureRuleAssetSystemLayerKey
    name: string
    role: string
    assetKeys: string[]
    extraAssets: Array<WbsTaskStructureRuleAssetSystemExtraAsset>
    writesTaskStructure: boolean
    maintenancePolicy: string
  }>
  ruleAssetProfile?: WbsTaskStructureGovernanceProfile
}

export function getWbsTaskStructurePipelineStage(stage: WbsTaskStructurePipelineStageName) {
  return WBS_TASK_STRUCTURE_PIPELINE_STAGES.find((item) => item.stage === stage) ?? null
}

function stableHash12(value: unknown) {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${text.length.toString(16).padStart(4, '0')}`.slice(0, 12)
}

export function buildWbsTaskStructureGovernanceProfile(): WbsTaskStructureGovernanceProfile {
  const assetKeys = WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => asset.key)
  const layerKeys = WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => layer.key)
  const requiredWriteContractFields = WBS_TASK_STRUCTURE_RULE_ASSETS
    .filter((asset) => asset.requiredWriteContract && asset.writeContractField)
    .map((asset) => asset.writeContractField!)
  const profileBasis = {
    contractVersion: WBS_TASK_STRUCTURE_PIPELINE_CONTRACT_VERSION,
    assetKeys,
    layerKeys,
    requiredWriteContractFields,
  }

  return {
    ...profileBasis,
    assetProfileHash: `wbs-assets-${stableHash12(profileBasis)}`,
  }
}

function likelyWbsRuleAsset(candidate: WbsTaskStructureRuleAssetInventoryCandidate) {
  const text = `${candidate.key} ${candidate.source}`.toLowerCase()
  return [
    'wbs',
    'duration',
    'flow',
    'workflow',
    'constraint',
    'dependency',
    'template',
    'semantic',
    'lineage',
    'snapshot',
    'gate',
    'scope',
  ].some((keyword) => text.includes(keyword))
}

export function diagnoseWbsTaskStructureRuleAssetInventory(
  candidates: readonly WbsTaskStructureRuleAssetInventoryCandidate[],
) {
  const registeredKeys = new Set(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => asset.key))
  const missingLikelyAssets = candidates
    .filter((candidate) => likelyWbsRuleAsset(candidate) && !registeredKeys.has(candidate.key))
    .map((candidate) => ({
      ...candidate,
      reason: 'likely_wbs_rule_asset_not_registered' as const,
    }))

  return {
    scannedAssetCount: candidates.length,
    missingLikelyAssetCount: missingLikelyAssets.length,
    missingLikelyAssets,
  }
}

export function getWbsRuleAssetGovernanceMetrics() {
  const workflowDictionary = WBS_TASK_STRUCTURE_RULE_ASSETS.find((asset) => asset.key === 'workflow_dictionary')!
  return {
    workflowDictionary: {
      runtimeRole: workflowDictionary.runtimeRole,
      canRewriteStructure: workflowDictionary.canRewriteStructure,
      directRuntimeDependencyWritesAllowed: false,
      candidateGovernanceMetrics: [
        'weak_keyword_match_ratio',
        'curated_internal_flow_promotion_rate',
        'curated_cross_item_workflow_promotion_rate',
        'dependency_intent_template_promotion_rate',
        'unresolved_candidate_count',
      ],
    },
  }
}

function serializeRuleAssetsForMetadata() {
  return WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => ({
    key: asset.key,
    source: asset.source,
    category: asset.category,
    stage: asset.stage,
    role: asset.role,
    runtimeRole: asset.runtimeRole,
    canRewriteStructure: asset.canRewriteStructure,
    downstreamOnly: Boolean(asset.downstreamOnly),
    requiredWriteContract: Boolean(asset.requiredWriteContract),
    writeContractField: asset.writeContractField ?? null,
    hardGate: asset.hardGate ?? null,
  }))
}

function serializeRuleAssetSystemLayersForMetadata() {
  return WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => ({
    key: layer.key,
    name: layer.name,
    role: layer.role,
    assetKeys: [...layer.assetKeys],
    extraAssets: (layer.extraAssets ?? []).map((asset) => ({ ...asset })),
    writesTaskStructure: layer.writesTaskStructure,
    maintenancePolicy: layer.maintenancePolicy,
  }))
}

export function buildWbsTaskStructureGovernanceMetadata(input: WbsTaskStructureGovernanceMetadataInput): WbsTaskStructureGovernanceMetadata {
  const baseMetadata: Omit<WbsTaskStructureGovernanceMetadata, 'ruleAssets' | 'ruleAssetSystemLayers' | 'ruleAssetProfile'> = {
    pipeline: WBS_TASK_STRUCTURE_PIPELINE_NAME,
    contractVersion: WBS_TASK_STRUCTURE_PIPELINE_CONTRACT_VERSION,
    source: input.source,
    stages: WBS_TASK_STRUCTURE_PIPELINE_STAGES.map((stage) => ({
      order: stage.order,
      stage: stage.stage,
      service: stage.service,
      gate: stage.gate,
      canRewriteStructure: stage.canRewriteStructure,
    })),
    rollupApplied: Boolean(input.rollupApplied),
    taskCodeFinalized: Boolean(input.taskCodeFinalized),
    taskCodeFinalization: 'write_chain_only',
    lineageExpected: Boolean(input.lineageExpected),
    downstreamAlgorithmsCanRewriteStructure: false,
    downstreamPolicy: 'consume_or_explain_only',
    dataQualityRole: 'diagnose_and_recommend_only',
    dataQualityCanBlockDirectly: false,
  }

  if (input.compactProfile) {
    return {
      ...baseMetadata,
      ruleAssetProfile: buildWbsTaskStructureGovernanceProfile(),
    }
  }

  return {
    ...baseMetadata,
    ruleAssets: serializeRuleAssetsForMetadata(),
    ruleAssetSystemLayers: serializeRuleAssetSystemLayersForMetadata(),
  }
}

export function mergeWbsTaskStructureGovernanceMetadata(
  previous: unknown,
  input: WbsTaskStructureGovernanceMetadataInput,
) {
  const previousRecord = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {}
  const next = buildWbsTaskStructureGovernanceMetadata({
    source: input.source || String(previousRecord.source ?? 'manual_task_write'),
    rollupApplied: input.rollupApplied ?? Boolean(previousRecord.rollupApplied),
    taskCodeFinalized: input.taskCodeFinalized ?? Boolean(previousRecord.taskCodeFinalized),
    lineageExpected: input.lineageExpected ?? Boolean(previousRecord.lineageExpected),
  })
  return {
    ...previousRecord,
    ...next,
  }
}

export type PersistWbsTaskStructureGovernanceCandidateEventInput = WbsTaskStructureGovernanceMetadataInput & {
  companyId?: string | null
  projectId?: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export async function persistWbsTaskStructureGovernanceCandidateEvent(
  input: PersistWbsTaskStructureGovernanceCandidateEventInput,
) {
  const metadata = buildWbsTaskStructureGovernanceMetadata({
    source: input.source,
    rollupApplied: input.rollupApplied,
    taskCodeFinalized: input.taskCodeFinalized,
    lineageExpected: input.lineageExpected,
    compactProfile: input.compactProfile,
  })

  return createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: 'wbs.task_structure.rule_asset_profile',
    sourceSystem: 'wbsTaskStructureGovernancePipelineService',
    assetType: 'template',
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: metadata,
    learningTarget: 'template_structure',
    learningMaturity: 'governed_candidate',
    publishAnchor: 'candidate_only',
    automationMaturity: 'manual_required',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    queryExec: input.queryExec,
  })
}
