import { describe, expect, it } from 'vitest'
import {
  ALGORITHM_RULE_ASSET_INVENTORY,
  evaluateAlgorithmAssetAdmissionGate,
  getAlgorithmRuleAsset,
  getAlgorithmRuleAssetInventoryDiagnostics,
  listAlgorithmRuleAssets,
} from '../services/algorithmRuleAssetInventoryService.js'
import { listAlgorithmSeedTypes } from '../services/algorithmSeedRegistry.js'

describe('algorithmRuleAssetInventoryService', () => {
  it('classifies every governed algorithm seed type as algorithm_seed lifecycle', () => {
    const assetsByKey = new Map(listAlgorithmRuleAssets().map((asset) => [asset.key, asset]))

    for (const seedType of listAlgorithmSeedTypes()) {
      expect(assetsByKey.get(seedType), `${seedType} must be inventoried`).toEqual(expect.objectContaining({
        lifecycleType: 'algorithm_seed',
        algorithmSeedType: seedType,
        governanceSystem: 'algorithm_seed_lifecycle',
        recommendation: 'keep_in_algorithm_seed_lifecycle',
        capabilities: expect.objectContaining({
          resolver: true,
          validation: true,
          import: true,
          rollback: true,
        }),
        boundaryPolicy: expect.arrayContaining([
          'auto_governance_local_status_requires_release_execution_before_runtime_override',
        ]),
      }))
    }
  })

  it('keeps independent governance registries outside the algorithm seed lifecycle', () => {
    expect(getAlgorithmRuleAsset('dataQualityRuleRegistry')).toEqual(expect.objectContaining({
      lifecycleType: 'data_quality',
      governanceSystem: 'data_quality_governance',
      recommendation: 'keep_independent_governance',
    }))
    expect(getAlgorithmRuleAsset('notificationTouchpointRules')).toEqual(expect.objectContaining({
      lifecycleType: 'notification_policy',
      governanceSystem: 'notification_governance',
      recommendation: 'keep_independent_governance',
    }))
    expect(getAlgorithmRuleAsset('metricRegistry')).toEqual(expect.objectContaining({
      lifecycleType: 'metric_registry',
      governanceSystem: 'metric_registry',
      recommendation: 'keep_independent_governance',
    }))
    expect(getAlgorithmRuleAsset('taskStatusRuleRegistry')).toEqual(expect.objectContaining({
      lifecycleType: 'status_registry',
      governanceSystem: 'task_status_derivation',
      recommendation: 'keep_independent_governance',
    }))
    expect(getAlgorithmRuleAsset('policyTemplateReleaseImpactMonitoringJob')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'policy_template_release_execution',
      ownerService: 'policyTemplateReleaseImpactMonitoringJob',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining([
        'stable_policy_runs_are_monitored_after_publication',
        'monitoring_failure_records_rollback_event',
        'does_not_write_template_runtime_publications_or_seed_tables',
      ]),
    }))
  })

  it('marks WBS/template and weather boundary assets as diagnostics or seed candidates instead of active seed records', () => {
    expect(getAlgorithmRuleAsset('wbsTaskStructureRuleAssets')).toEqual(expect.objectContaining({
      lifecycleType: 'template_catalog',
      governanceSystem: 'wbs_task_structure_governance',
      recommendation: 'diagnostic_bridge_only',
      boundaryPolicy: expect.arrayContaining([
        'semantic_findings_bridge_to_algorithm_asset_candidates_only',
        'structure_profile_candidate_events_do_not_write_runtime',
        'dependency_replay_calibration_candidates_do_not_write_task_dependencies',
      ]),
    }))
    expect(getAlgorithmRuleAsset('v1475DependencyIntentTemplates')).toEqual(expect.objectContaining({
      lifecycleType: 'candidate_for_algorithm_seed',
      governanceSystem: 'construction_dependency_rule_system',
      recommendation: 'evaluate_before_seed_inclusion',
    }))
    expect(getAlgorithmRuleAsset('weatherForecastImpactPolicy')).toEqual(expect.objectContaining({
      lifecycleType: 'candidate_for_algorithm_seed',
      governanceSystem: 'weather_forecast_impact',
      recommendation: 'evaluate_before_seed_inclusion',
      boundaryPolicy: expect.arrayContaining(['forecast_fact_candidate_only']),
    }))
  })

  it('registers the WBS template golden benchmark as an independent blocking gate', () => {
    expect(getAlgorithmRuleAsset('wbsTemplateGoldenBenchmarkGate')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'wbs_template_golden_benchmark_gate',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining(['blocks_template_schedule_regression']),
    }))
  })

  it('registers the WBS template recommendation accuracy matrix as a governed calibration report', () => {
    expect(getAlgorithmRuleAsset('wbsTemplateRecommendationAccuracyMatrixService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'wbs_template_recommendation_accuracy_matrix',
      ownerService: 'wbsTemplateRecommendationAccuracyMatrixService',
      recommendation: 'keep_independent_governance',
      learningTarget: 'governance_report',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      boundaryPolicy: expect.arrayContaining([
        'accuracy_matrix_controls_commercial_readiness_not_direct_parameter_tuning',
        'failed_or_missing_packs_remain_candidate_only_until_replay_passes',
        'calibration_candidates_must_enter_algorithm_asset_governance_before_runtime_effect',
      ]),
    }))
  })

  it('registers the duration algorithm closure report as the first-ten-step governance outlet', () => {
    expect(getAlgorithmRuleAsset('durationAlgorithmClosureGovernance')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'duration_algorithm_closure_governance',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'v1.4.22 duration closure tests',
        'algorithm governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'covers_first_ten_duration_closure_steps',
        'excludes_golden_benchmark_parameter_calibration',
      ]),
    }))
  })

  it('registers the algorithm asset admission gate as the mandatory intake check', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetAdmissionGate')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_admission_gate',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithm governance diagnostics',
        'golden benchmark preflight',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'blocks_unregistered_project_facts',
        'blocks_unregistered_duration_context_factors',
        'blocks_uninventoried_algorithm_seed_types',
      ]),
    }))
  })

  it('registers seed candidates seed overrides and duration overrides in the unified asset view', () => {
    expect(getAlgorithmRuleAsset('algorithmSeedUpgradeCandidateSurface')).toEqual(expect.objectContaining({
      source: 'algorithm_seed_upgrade_candidates',
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_seed_candidate_governance_surface',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmSeedCandidateDiscoveryService',
        'algorithmSeedLearningService',
        'algorithmSeedAutoGovernanceService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'candidate_rows_are_governance_inputs_not_runtime_publications',
        'candidate_promotion_requires_publish_anchor_release_exit_domain_writer_and_rollback',
        'candidate_surface_must_preserve_company_project_scope',
      ]),
    }))
    expect(getAlgorithmRuleAsset('algorithmSeedOverrideSurface')).toEqual(expect.objectContaining({
      source: 'algorithm_seed_overrides',
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_seed_override_runtime_surface',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmSeedResolver',
        'algorithmSeedLearningService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'seed_override_rows_require_company_or_project_scope',
        'seed_override_runtime_consumption_requires_release_record_consumer_verification_and_rollback',
        'local_auto_published_status_cannot_write_seed_override',
      ]),
    }))
    expect(getAlgorithmRuleAsset('durationSuggestionOverrideSurface')).toEqual(expect.objectContaining({
      source: 'duration_suggestion_overrides',
      lifecycleType: 'service_governance',
      governanceSystem: 'duration_suggestion_override_governance_surface',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'durationSuggestionService',
        'manualDurationCorrectionService',
        'templateDurationGovernanceService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'duration_override_rows_are_project_or_company_scoped',
        'manual_duration_corrections_are_business_governance_not_algorithm_self_publish',
        'duration_override_surface_does_not_modify_system_seed_or_standard_work_duration',
      ]),
    }))
  })

  it('registers the v1.4.22.3 governance protocol as the unified publish gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetGovernanceProtocol')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_governance_protocol',
      ownerService: 'algorithmAssetGovernanceProtocolService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmSeedAutoGovernanceService',
        'v14AssetAdmissionAutomationService',
        'rule asset governance adapters',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'publish_anchor_and_automation_maturity_are_required_for_runtime_publish',
        'manual_anchors_cannot_be_bypassed_by_single_candidate',
        'llm_generated_payloads_default_to_candidate_or_review',
        'anchor_upgrade_is_versioned_governance_asset',
      ]),
    }))
  })

  it('exposes distinct learning maturity classes in the rule asset inventory', () => {
    const assetsByLearningMaturity = new Map(
      listAlgorithmRuleAssets()
        .filter((asset) => asset.learningMaturity)
        .map((asset) => [asset.learningMaturity, asset]),
    )

    expect([...assetsByLearningMaturity.keys()].sort()).toEqual([
      'frozen_constant',
      'governed_candidate',
      'guarded_live_tuning',
      'shadow_report_only',
      'system_curated_learning',
    ].sort())

    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterRegistryService')).toEqual(expect.objectContaining({
      learningMaturity: 'frozen_constant',
      learningTarget: 'governance_report',
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetReplayService')).toEqual(expect.objectContaining({
      learningMaturity: 'shadow_report_only',
      learningTarget: 'governance_report',
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterSuggestionService')).toEqual(expect.objectContaining({
      learningMaturity: 'governed_candidate',
      learningTarget: 'candidate_weight',
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterRuntimeConsumptionService')).toEqual(expect.objectContaining({
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetColdStartBaselineService')).toEqual(expect.objectContaining({
      learningMaturity: 'system_curated_learning',
      learningTarget: 'base_duration',
    }))
  })

  it('registers the anchor upgrade strategy service as a versioned governance asset', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetAnchorUpgradeStrategyService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_anchor_upgrade_strategy',
      ownerService: 'algorithmAssetAnchorUpgradeStrategyService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetGovernanceProtocolService',
        'platform exception governance',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'anchor_upgrade_generates_versioned_candidate_only',
        'single_candidate_or_single_replay_cannot_upgrade_manual_anchor',
        'does_not_modify_publish_anchor_or_runtime',
      ]),
    }))
  })

  it('registers the automation maturity service as an unlock package generator', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetAutomationMaturityService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_automation_maturity',
      ownerService: 'algorithmAssetAutomationMaturityService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetGovernanceProtocolService',
        'platform exception governance',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'manual_assets_generate_unlock_packages_not_runtime_writes',
        'shadow_and_canary_suggestions_are_not_publish_permission',
        'does_not_modify_publish_anchor_automation_maturity_or_runtime',
      ]),
    }))
  })

  it('registers the asset isolation matrix as the runtime isolation evidence gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetIsolationMatrixService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_isolation_matrix',
      ownerService: 'algorithmAssetIsolationMatrixService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'v1.4.22.3 governance gate',
        'platform exception governance',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'dashboard_summary_is_not_runtime_isolation_proof',
        'writer_consumer_cache_async_rollback_scopes_must_be_verified_per_asset_type',
        'does_not_write_runtime_or_modify_publish_anchor',
      ]),
    }))
  })

  it('registers the algorithm asset explanation chain as governance metadata only', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetExplanationChainService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_explanation_chain',
      ownerService: 'algorithmAssetExplanationChainService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetGovernanceProtocolService',
        'algorithm governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'business_reason_is_preserved_not_rewritten',
        'explanation_chain_is_governance_metadata_not_runtime_writer',
        'runtime_write_still_requires_release_exit_domain_writer_consumer_monitoring_and_rollback',
      ]),
    }))
  })

  it('registers the governance dashboard evidence service as company-scoped backend summary only', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetGovernanceDashboardEvidenceService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_governance_dashboard_evidence',
      ownerService: 'algorithmAssetGovernanceDashboardEvidenceService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithm seed governance dashboard route',
        'company admin governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'dashboard_evidence_filters_by_current_company_id',
        'system_observation_and_other_company_rows_are_excluded',
        'sample_health_summary_is_observable_without_runtime_write',
      ]),
    }))
  })

  it('registers the v1.4.22.3 candidate event adapter as the multi-source learning intake', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetCandidateEventAdapter')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_candidate_event_adapter',
      ownerService: 'algorithmAssetCandidateEventAdapterService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetGovernanceProtocolService',
        'algorithmSeedCandidateDiscoveryService',
        'wbsTemplateCandidateEventService',
        'durationContextPolicyLearningService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'all_learning_entries_must_create_candidate_event_before_runtime_publish',
        'missing_scope_defaults_to_system_observation',
        'legacy_scope_fields_quarantine_candidate',
        'legacy_local_publication_status_requires_review',
        'candidate_event_adapter_does_not_write_runtime',
      ]),
    }))
  })

  it('registers the v1.4.22.3 conflict service as the existing-rule protection gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetConflictService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_conflict_arbitration',
      ownerService: 'algorithmAssetConflictService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetCandidateEventAdapterService',
        'asset publish gate tests',
        'rule asset governance adapters',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'existing_active_or_published_rule_requires_unified_publication_evidence',
        'unverified_published_rule_enters_legacy_audit_before_runtime_arbitration',
        'manual_anchor_existing_rules_block_candidate_overwrite',
        'project_candidate_cannot_replace_company_or_system_rule',
        'same_scope_publish_requires_rollback_target',
      ]),
    }))
  })

  it('registers the v1.4.22.3 replay service as the offline evidence normalization gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetReplayService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_replay_evidence',
      ownerService: 'algorithmAssetReplayService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetCandidateEventAdapterService',
        'algorithmAssetConflictService',
        'asset publish gate tests',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'replay_samples_must_match_candidate_company_or_project_scope',
        'replay_summary_includes_original_actual_overlay_mae_and_overcompensation',
        'shadow_report_only_replay_cannot_write_runtime',
        'replay_service_does_not_write_runtime',
      ]),
    }))
  })

  it('registers the v1.4.22.3 release-exit service as the final handoff gate before runtime adapters', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetReleaseExitService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_release_exit',
      ownerService: 'algorithmAssetReleaseExitService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetGovernanceProtocolService',
        'algorithmAssetReplayService',
        'algorithmAssetConflictService',
        'domain release adapters',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'release_exit_requires_explicit_domain_adapter',
        'release_exit_requires_impact_monitoring_for_all_runtime_handoffs',
        'manual_anchor_conflicts_cannot_handoff_to_runtime_adapter',
        'system_publish_requires_platform_policy_monitoring_and_release_exit',
        'release_exit_service_builds_package_only_and_does_not_write_runtime',
      ]),
    }))
  })

  it('registers the v1.4.22.3 promotion and rollback completion gate as a runtime-claim guard', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetPromotionRollbackGateService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_asset_promotion_rollback_gate',
      ownerService: 'algorithmAssetPromotionRollbackGateService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetReleaseExitService',
        'domain release adapters',
        'runtime consumers',
        'asset publish gate tests',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'release_exit_handoff_is_not_runtime_publication',
        'promotion_requires_domain_writer_release_record_consumer_verification_monitoring_and_rollback',
        'rollback_audit_is_not_runtime_rollback',
        'rollback_requires_domain_writer_disable_and_consumer_no_longer_reads_version',
        'promotion_rollback_gate_does_not_write_runtime',
      ]),
    }))
  })

  it('registers the policy template release adapter as the certificate and acceptance domain release bridge', () => {
    expect(getAlgorithmRuleAsset('policyTemplateReleaseAdapterService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'policy_template_release_adapter',
      ownerService: 'policyTemplateReleaseAdapterService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'certificateTemplatePolicyUpdateService',
        'acceptanceTemplatePolicyUpdateService',
        'algorithmAssetReleaseExitService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'policy_template_release_adapter_requires_release_exit_package',
        'certificate_and_acceptance_policy_release_targets_system_seed_only',
        'policy_template_release_records_embed_rollback_target',
        'policy_template_release_adapter_does_not_write_algorithm_seed_records',
      ]),
    }))
    expect(getAlgorithmRuleAsset('policyTemplateReleaseExecutionService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'policy_template_release_execution',
      ownerService: 'policyTemplateReleaseExecutionService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'policyTemplateReleaseAdapterService',
        'certificateTemplatePolicyUpdateService',
        'acceptanceTemplatePolicyUpdateService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'policy_template_release_execution_requires_ready_release_record',
        'policy_template_release_execution_persists_audit_run_and_execution_event_records',
        'policy_template_release_execution_stable_runs_write_template_entity_runtime_publication',
        'policy_template_release_execution_rollbacks_disable_template_entity_runtime_publication',
        'policy_template_stable_loaders_require_active_runtime_projection',
        'policy_template_release_execution_records_rollback_and_monitoring_events',
        'policy_template_release_execution_does_not_write_seed_runtime',
      ]),
    }))
  })

  it('registers the v1.4.22.3 sample health service as the no-silent-drop gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetSampleHealthService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_sample_health_governance',
      ownerService: 'algorithmAssetSampleHealthService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetReplayService',
        'duration learning governance',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'completed_samples_must_be_accepted_weak_or_rejected_with_reason',
        'missing_dates_or_work_code_must_not_be_silently_dropped',
        'weak_samples_can_feed_candidate_evidence_not_high_weight_benchmark',
        'sample_health_service_does_not_write_runtime',
      ]),
    }))
    expect(getAlgorithmRuleAsset('businessCompletionSampleHealthAdapterService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_sample_health_governance',
      ownerService: 'businessCompletionSampleHealthAdapterService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'acceptance flow governance',
        'drawing version governance',
        'certificate milestone governance',
        'material handover governance',
        'quality rectification governance',
        'risk issue closeout governance',
        'algorithmAssetSampleHealthService',
      ]),
      boundaryPolicy: expect.arrayContaining([
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
      ]),
    }))
  })

  it('registers the v1.4.22.3 learnable parameter registry as the frozen-by-default gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterRegistryService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_learnable_parameter_registry',
      ownerService: 'algorithmAssetLearnableParameterRegistryService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'durationContextPolicyParameterLearningService',
        'algorithmAssetGovernanceProtocolService',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'unregistered_parameters_default_to_frozen_constant',
        'registered_parameters_require_scope_risk_evidence_delta_and_rollback',
        'high_risk_model_weights_remain_governed_candidates',
        'learnable_parameter_registry_does_not_write_runtime',
      ]),
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterSuggestionService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_learnable_parameter_suggestion_governance',
      ownerService: 'algorithmAssetLearnableParameterSuggestionService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetLearnableParameterRegistryService',
        'algorithmAssetCandidateEventAdapterService',
        'algorithmAssetReleaseExitService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'parameter_suggestions_must_pass_registry_scope_evidence_delta_and_rollback',
        'parameter_suggestions_write_candidate_events_only',
        'parameter_suggestion_release_requires_release_exit_and_domain_adapter',
        'parameter_suggestion_service_does_not_write_runtime',
      ]),
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterReleaseExecutionService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_learnable_parameter_release_execution',
      ownerService: 'algorithmAssetLearnableParameterReleaseExecutionService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetLearnableParameterSuggestionService',
        'algorithmAssetReleaseExitService',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'parameter_runtime_publication_requires_ready_release_exit_package',
        'parameter_runtime_publication_writes_parameter_publication_table_only',
        'parameter_runtime_rollback_marks_publication_rolled_back',
        'parameter_release_execution_does_not_write_algorithm_seed_or_standard_work_duration',
      ]),
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterImpactMonitoringJob')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_learnable_parameter_impact_monitoring',
      ownerService: 'algorithmAssetLearnableParameterImpactMonitoringJob',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetLearnableParameterReleaseExecutionService',
        'algorithm_learnable_parameter_runtime_publications',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'parameter_impact_monitoring_reads_parameter_publications_only',
        'parameter_impact_monitoring_uses_frozen_governance_canary_stop_conditions_as_default_thresholds',
        'parameter_impact_monitoring_records_monitoring_events',
        'parameter_impact_monitoring_failed_threshold_marks_parameter_publication_rolled_back',
        'governance_canary_stop_conditions_not_runtime_self_published',
        'parameter_impact_monitoring_does_not_write_algorithm_seed_or_standard_work_duration',
      ]),
    }))
    expect(getAlgorithmRuleAsset('algorithmAssetLearnableParameterRuntimeConsumptionService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_learnable_parameter_runtime_consumption',
      ownerService: 'algorithmAssetLearnableParameterRuntimeConsumptionService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'durationSuggestionService',
        'durationContextService',
        'taskDurationForecastService',
        'algorithmAssetLearnableParameterRegistryService',
        'algorithm_learnable_parameter_runtime_publications',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'parameter_runtime_consumption_reads_parameter_publications_only',
        'parameter_runtime_consumption_requires_registry_and_scope_match',
        'parameter_runtime_consumption_ignores_rolled_back_publications',
        'parameter_runtime_consumption_defaults_to_stable_published_only',
        'parameter_runtime_consumption_canary_requires_explicit_runtime_boundary',
        'duration_p50_p75_blend_ratio_canary_only_affects_company_benchmark_runtime_reference',
        'forecast_confidence_weight_multiplier_only_tunes_remaining_forecast_confidence',
        'parameter_runtime_consumption_blocks_manual_or_high_risk_parameters',
        'parameter_runtime_consumption_does_not_write_algorithm_seed_or_standard_work_duration',
      ]),
    }))
  })

  it('registers the v1.4.22.3 cold-start baseline service as the anonymous shared-baseline gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetColdStartBaselineService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_cold_start_baseline_governance',
      ownerService: 'algorithmAssetColdStartBaselineService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'algorithmAssetSampleHealthService',
        'duration learning governance',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'cold_start_baseline_requires_anonymized_multi_company_aggregation',
        'single_company_samples_cannot_update_shared_baseline',
        'company_runtime_cannot_read_other_company_detail_samples',
        'cold_start_baseline_persistence_writes_anonymized_shared_baseline_only',
        'shared_baseline_reference_cannot_write_company_override',
        'cold_start_baseline_runtime_publication_status_tracks_candidate_canary_published_and_rolled_back',
        'cold_start_baseline_rollback_marks_baseline_runtime_rolled_back',
        'cold_start_baseline_consumer_ignores_runtime_rolled_back_baselines',
        'cold_start_baseline_writer_does_not_mutate_duration_seed_algorithm_seed_or_company_override',
      ]),
    }))
  })

  it('registers the v1.4.22.3 forecast residual overlay service as the no-base-seed-mutation gate', () => {
    expect(getAlgorithmRuleAsset('algorithmAssetForecastResidualOverlayService')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'algorithm_forecast_residual_overlay_governance',
      ownerService: 'algorithmAssetForecastResidualOverlayService',
      recommendation: 'keep_independent_governance',
      consumers: expect.arrayContaining([
        'taskDurationForecastService',
        'algorithmAssetReplayService',
        'asset governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'forecast_error_writes_to_residual_overlay_not_standard_work_duration_seed',
        'forecast_residual_overlay_requires_scoped_replay_evidence',
        'forecast_residual_overlay_publication_sample_gate_matches_runtime_consumer_gate',
        'shadow_report_only_overlay_cannot_write_runtime',
        'forecast_residual_overlay_runtime_publication_status_tracks_candidate_canary_published_and_rolled_back',
        'forecast_residual_overlay_rollback_marks_overlay_runtime_rolled_back',
        'forecast_residual_overlay_consumer_ignores_runtime_rolled_back_overlays',
        'forecast_residual_overlay_writer_does_not_mutate_duration_seed_or_algorithm_seed',
      ]),
    }))
  })

  it('registers duration output and input hydration governance as independent service assets', () => {
    expect(getAlgorithmRuleAsset('durationOutputGovernance')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'duration_output_governance',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining([
        'fast_template_estimate_cannot_write_plan_reference',
        'fast_template_requires_explicit_plan_reference_promotion_audit',
        'duration_output_write_gate_must_guard_plan_task_duration',
        'duration_output_promotion_policy_must_reject_unapproved_outputs',
        'remaining_forecast_cannot_rewrite_plan_reference',
        'golden_replay_must_declare_duration_output',
      ]),
    }))
    expect(getAlgorithmRuleAsset('durationAlgorithmInputHydration')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'duration_algorithm_input_hydration',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining([
        'hydrates_project_generation_facts_before_duration_calculation',
        'does_not_mutate_project_or_task_records',
      ]),
    }))
  })

  it('registers the duration pipeline topology as governance, not as a seed or override', () => {
    expect(getAlgorithmRuleAsset('durationPipelineTopology')).toEqual(expect.objectContaining({
      lifecycleType: 'service_governance',
      governanceSystem: 'duration_pipeline_topology',
      recommendation: 'keep_independent_governance',
      role: expect.stringContaining('single duration pipeline'),
      consumers: expect.arrayContaining([
        'v1.4.22 phase 1-3 algorithm catalog',
        'duration closure tests',
        'algorithm governance diagnostics',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'topology_contract_not_algorithm_seed',
        'not_company_or_project_overrideable',
        'facts_engines_outputs_must_stay_single_pipeline',
        'five_duration_engines_must_be_cataloged',
      ]),
    }))
  })

  it('auto-registers full-repo discovered v1.4.22 phase 1-3 assets in the rule asset inventory', () => {
    expect(getAlgorithmRuleAsset('acceptanceTimelineTemplateSeed')).toEqual(expect.objectContaining({
      source: 'server/src/seeds/acceptanceTimelineTemplateSeed.ts',
      recommendation: 'evaluate_before_seed_inclusion',
      boundaryPolicy: expect.arrayContaining(['auto_discovered_phase_1_3_asset']),
    }))
    expect(getAlgorithmRuleAsset('durationContextPolicyLearningService')).toEqual(expect.objectContaining({
      source: 'server/src/services/durationContextPolicyLearningService.ts',
      lifecycleType: 'service_governance',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining(['auto_discovered_phase_1_3_asset']),
    }))
    expect(getAlgorithmRuleAsset('algorithmSeedCandidateDiscoveryJob')).toEqual(expect.objectContaining({
      source: 'server/src/jobs/algorithmSeedCandidateDiscoveryJob.ts',
      lifecycleType: 'service_governance',
      recommendation: 'keep_independent_governance',
      boundaryPolicy: expect.arrayContaining(['auto_discovered_phase_1_3_asset']),
    }))
  })

  it('reports inventory diagnostics without duplicate keys or missing seed coverage', () => {
    const diagnostics = getAlgorithmRuleAssetInventoryDiagnostics()

    expect(diagnostics.summary.totalAssetCount).toBe(ALGORITHM_RULE_ASSET_INVENTORY.length)
    expect(diagnostics.summary.algorithmSeedCount).toBe(listAlgorithmSeedTypes().length)
    expect(diagnostics.gaps.missingAlgorithmSeedTypes).toEqual([])
    expect(diagnostics.gaps.duplicateAssetKeys).toEqual([])
    expect(diagnostics.summary.candidateForAlgorithmSeedCount).toBeGreaterThanOrEqual(2)
    expect(diagnostics.assetsByLifecycleType.algorithm_seed.length).toBe(listAlgorithmSeedTypes().length)
    expect(diagnostics.assetsByRecommendation.keep_independent_governance.length).toBeGreaterThanOrEqual(5)
    expect(diagnostics.gaps.algorithmSeedAssetsMissingCapabilities).toEqual([])
  })

  it('publishes a blocking admission gate for new governed fields factors seeds and rule assets', () => {
    const gate = evaluateAlgorithmAssetAdmissionGate()

    expect(gate.status).toBe('pass')
    expect(gate.summary).toEqual(expect.objectContaining({
      projectFactUncoveredCount: 0,
      projectFactWithoutGenerationConsumerCount: 0,
      durationFactorMissingConsumerCount: 0,
      durationFactorMissingAutomationPolicyCount: 0,
      algorithmSeedMissingAssetCount: 0,
      duplicateRuleAssetKeyCount: 0,
    }))
    expect(gate.blockers).toEqual([])
    expect(gate.requiredFor).toEqual(expect.arrayContaining([
      'adding_project_generation_fact',
      'adding_duration_context_factor',
      'adding_algorithm_seed_type',
      'adding_rule_or_governance_asset',
      'before_golden_benchmark_replay',
    ]))
    expect(gate.boundaryPolicy).toEqual(expect.arrayContaining([
      'new_project_fact_requires_consumer_matrix_entry',
      'new_duration_context_factor_requires_consumption_matrix_and_automation_policy',
      'new_algorithm_seed_requires_rule_asset_inventory_entry',
      'golden_replay_must_run_after_asset_admission_passes',
    ]))
  })
})
