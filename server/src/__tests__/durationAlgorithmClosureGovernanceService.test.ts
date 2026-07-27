import { describe, expect, it } from 'vitest'
import {
  collectDurationAlgorithmClosureGovernanceReport,
  DURATION_ALGORITHM_CLOSURE_GOVERNANCE_VERSION,
  evaluateDurationQuadrantConsistency,
  resolveMilestoneInterfaceMatches,
  summarizeDurationContributionLedger,
} from '../services/durationAlgorithmClosureGovernanceService.js'

describe('durationAlgorithmClosureGovernanceService', () => {
  it('publishes the first ten duration-closure steps and explicitly excludes golden calibration', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()

    expect(report.version).toBe(DURATION_ALGORITHM_CLOSURE_GOVERNANCE_VERSION)
    expect(report.scope.completedStepCount).toBe(10)
    expect(report.scope.excludedSteps).toEqual([
      'golden_benchmark_and_parameter_calibration',
    ])
    expect(report.steps.map((step) => step.code)).toEqual([
      'duration_asset_inventory',
      'duration_quadrant_boundary',
      'fact_layer_closure',
      'construction_execution_profile_closure',
      'single_task_duration_chain_closure',
      'phase_network_policy_closure',
      'milestone_interface_network_closure',
      'dependency_network_closure',
      'quadrant_consistency_validation',
      'duration_contribution_ledger',
    ])
    expect(report.steps.every((step) => step.status === 'closed_for_current_scope')).toBe(true)
  })

  it('uses current code assets rather than copied text for the duration asset inventory', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()
    const assetKeys = report.assetInventory.assets.map((asset) => asset.key)

    expect(report.assetInventory.sourcePolicy).toBe('current_worktree_code_is_authority')
    expect(assetKeys).toEqual(expect.arrayContaining([
      'ProjectGenerationFacts',
      'RuntimeExecutionFacts',
      'runtimeExecutionInferenceService',
      'AlgorithmFactContext',
      'durationPipelineTopology',
      'projectScenarioTaxonomyService',
      'buildingPatternExecutionResolver',
      'standardWorkDurationSeed',
      'durationContextService',
      'constructionDependencyRuleSystemService',
      'wbsTemplateGenerationService.phaseChain',
      'durationContributionMode',
      'durationExperienceService',
      'progressVelocityLearningService',
    ]))
    const topology = report.assetInventory.assets.find((asset) => asset.key === 'durationPipelineTopology')
    expect(topology).toEqual(expect.objectContaining({
      category: 'service_governance',
      role: expect.stringContaining('single duration pipeline'),
      ownerServices: expect.arrayContaining([
        'durationAlgorithmClosureGovernanceService',
        'algorithmCatalogService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'facts_engines_outputs_must_stay_single_pipeline',
        'topology_contract_not_algorithm_seed',
      ]),
    }))
    expect(report.assetInventory.darkAssets.map((asset) => asset.key)).toEqual(expect.arrayContaining([
      'projectClimateResolver',
      'engineeringObjectFeatureProfile',
      'titleWeakRecognitionSeed',
      'earliestStartRuleSeed',
      'durationContextPolicyGovernance',
    ]))
    const projectGenerationFacts = report.assetInventory.assets.find((asset) => asset.key === 'ProjectGenerationFacts')
    expect(projectGenerationFacts?.ownerServices).toEqual(expect.arrayContaining([
      'projectGenerationFactsStoreService',
    ]))
    expect(projectGenerationFacts?.boundaryPolicy).toEqual(expect.arrayContaining([
      'project_metadata_live_store_for_forecast_reread',
      'does_not_rewrite_project_generation_facts',
      'live_store_does_not_rewrite_frozen_baseline_or_monthly_snapshots',
    ]))
    const runtimeFacts = report.assetInventory.assets.find((asset) => asset.key === 'RuntimeExecutionFacts')
    expect(runtimeFacts?.ownerServices).toEqual(expect.arrayContaining([
      'runtimeExecutionInferenceService',
    ]))
    expect(runtimeFacts?.boundaryPolicy).toEqual(expect.arrayContaining([
      'inferred_runtime_facts_use_existing_execution_state_only',
      'no_manual_site_resource_or_workface_inputs_required',
    ]))
    const runtimeInference = report.assetInventory.assets.find((asset) => asset.key === 'runtimeExecutionInferenceService')
    expect(runtimeInference).toEqual(expect.objectContaining({
      category: 'fact_layer',
      source: 'server/src/services/runtimeExecutionInferenceService.ts',
      consumers: expect.arrayContaining([
        'projectRemainingDurationForecastService',
        'scheduleAccelerationService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'existing_execution_state_only',
        'does_not_require_crew_workface_or_equipment_utilization_manual_inputs',
      ]),
    }))
  })

  it('declares the four quadrants with one fact authority and one algorithm authority per quadrant', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()

    expect(report.factLayer.runtimeExecutionFacts.fields).toEqual(expect.arrayContaining([
      'resourcePressureScore',
      'parallelDensityRatio',
      'milestonePressureScore',
      'evidenceCodes',
      'evidenceObjects',
      'runtimeInferenceSummary',
    ]))
    expect(report.quadrants).toHaveLength(4)
    expect(report.quadrants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'Q1_plan_global_duration',
        stage: 'plan_creation',
        durationLevel: 'global',
        primaryFactLayer: 'ProjectGenerationFacts',
        authorityAlgorithm: 'PhaseNetworkPolicy',
      }),
      expect.objectContaining({
        code: 'Q2_plan_single_task_duration',
        stage: 'plan_creation',
        durationLevel: 'single_task',
        primaryFactLayer: 'ProjectGenerationFacts',
        authorityAlgorithm: 'durationSuggestionService',
      }),
      expect.objectContaining({
        code: 'Q3_runtime_global_duration',
        stage: 'runtime_execution',
        durationLevel: 'global',
        primaryFactLayer: 'RuntimeExecutionFacts',
        authorityAlgorithm: 'scheduleAccelerationService/monthlyPlanGenerationService',
      }),
      expect.objectContaining({
        code: 'Q4_runtime_single_task_duration',
        stage: 'runtime_execution',
        durationLevel: 'single_task',
        primaryFactLayer: 'RuntimeExecutionFacts',
        authorityAlgorithm: 'taskDurationForecastService/durationSuggestionService',
      }),
    ]))
  })

  it('defines the phase network, milestone interface network, dependency network, and consistency ledger boundaries', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()

    expect(report.phaseNetworkPolicy.authority).toBe('PhaseNetworkPolicy')
    expect(report.phaseNetworkPolicy.ownerServices).toEqual(expect.arrayContaining([
      'projectScenarioTaxonomyService',
      'wbsTemplateGenerationService.generateWbsTemplatePhaseChainRows',
    ]))
    expect(report.phaseNetworkPolicy.boundaryPolicy).toContain('new_plan_global_duration_only')

    expect(report.milestoneInterfaceNetwork.authority).toBe('MilestoneInterfaceNetwork')
    expect(report.milestoneInterfaceNetwork.notA).toEqual(expect.arrayContaining([
      'normal_task_dependency',
      'phase_overlap_policy',
      'frontend_manual_object',
    ]))
    expect(report.milestoneInterfaceNetwork.interfaceTypes.map((item) => item.code)).toEqual(expect.arrayContaining([
      'basement_structure_to_waterproof_backfill',
      'structure_topping_to_roof_facade_mep',
      'envelope_closed_to_fitout_commissioning',
      'permanent_power_to_joint_commissioning',
      'fire_system_to_fire_acceptance',
      'completion_acceptance_to_handover_opening_production',
    ]))

    expect(report.dependencyNetwork.layers.map((layer) => layer.code)).toEqual([
      'L1_workflow_dictionary',
      'L2_standard_internal_flow',
      'L3_cross_item_workflow',
      'L4_dependency_intent_template',
      'L5_process_constraint',
    ])
    expect(report.consistencyLedger.anomalyTypes.map((item) => item.code)).toEqual(expect.arrayContaining([
      'phase-window-underfilled',
      'phase-window-overstretched',
      'seed-vs-phase-network-mismatch',
      'task-rollup-vs-phase-policy-mismatch',
      'milestone-gate-missing',
      'milestone-gate-contradiction',
    ]))
    expect(report.contributionLedger.dimensions.map((item) => item.code)).toEqual(expect.arrayContaining([
      'project_static_profile_days',
      'construction_execution_profile_days',
      'duration_seed_days',
      'dependency_lag_days',
      'milestone_gate_days',
      'runtime_execution_context_days',
    ]))
    expect(report.durationOutputGovernance.authority).toBe('DurationOutputContract')
    expect(report.durationOutputGovernance.contracts.map((contract) => contract.code)).toEqual([
      'template_fast_estimate',
      'plan_reference',
      'contextual_reference',
      'remaining_forecast',
      'project_remaining_forecast',
      'phase_window',
      'acceleration_target',
    ])
    expect(report.durationOutputGovernance.boundaryPolicy).toEqual(expect.arrayContaining([
      'duration_outputs_are_semantic_contracts_not_independent_algorithms',
      'write_targets_must_be_allowed_by_output_contract',
      'golden_replay_must_declare_duration_output_under_test',
    ]))
  })

  it('evaluates phase, task, rollup and milestone consistency anomalies without raw task-day summing', () => {
    const ledger = evaluateDurationQuadrantConsistency({
      phaseWindows: [
        {
          phaseCode: 'structure',
          phaseWindowDays: 180,
          taskNetworkCriticalPathDays: 80,
          parentRollupWindowDays: 170,
          milestoneGateCodes: [],
          expectedMilestoneGateCodes: ['structure_topping_to_roof_facade_mep'],
        },
        {
          phaseCode: 'mep',
          phaseWindowDays: 90,
          taskNetworkCriticalPathDays: 160,
          parentRollupWindowDays: 145,
          milestoneGateCodes: ['permanent_power_to_joint_commissioning'],
          conflictingMilestoneGateCodes: ['permanent_power_to_joint_commissioning'],
        },
      ],
      seedWindows: [
        {
          stableCode: 'BDT-STRUCT-PACK',
          phaseCode: 'structure',
          seedReferenceDays: 220,
          phaseWindowDays: 120,
        },
      ],
    })

    expect(ledger.summary.anomalyCount).toBeGreaterThanOrEqual(6)
    expect(ledger.anomalies.map((item) => item.type)).toEqual(expect.arrayContaining([
      'phase-window-underfilled',
      'phase-window-overstretched',
      'seed-vs-phase-network-mismatch',
      'task-rollup-vs-phase-policy-mismatch',
      'milestone-gate-missing',
      'milestone-gate-contradiction',
    ]))
    expect(ledger.boundaryPolicy).toContain('do_not_compare_raw_sum_of_task_days_to_project_duration')
    expect(ledger.summary.comparedDimensions).toEqual(expect.arrayContaining([
      'phase_network_windows',
      'task_dependency_critical_path',
      'milestone_interface_gates',
      'wbs_parent_rollups',
    ]))
  })

  it('summarizes duration contribution days by governed source layer', () => {
    const ledger = summarizeDurationContributionLedger([
      { dimensionCode: 'project_static_profile_days', days: 120, sourceRef: 'scale:A1' },
      { dimensionCode: 'duration_seed_days', days: 30, sourceRef: 'seed:BDT' },
      { dimensionCode: 'duration_seed_days', days: -5, sourceRef: 'context:suppression' },
      { dimensionCode: 'dependency_lag_days', days: 14, sourceRef: 'L5:curing_wait' },
      { dimensionCode: 'unknown_shadow_days', days: 9, sourceRef: 'legacy' },
    ])

    expect(ledger.totalContributionDays).toBe(159)
    expect(ledger.unknownContributionDays).toBe(9)
    expect(ledger.entriesByDimension.duration_seed_days.totalDays).toBe(25)
    expect(ledger.entriesByDimension.dependency_lag_days.sourceRefs).toEqual(['L5:curing_wait'])
    expect(ledger.boundaryPolicy).toContain('unknown_sources_are_reported_not_silently_merged')
  })

  it('resolves milestone interface matches from release hints and reports missing gates', () => {
    const matches = resolveMilestoneInterfaceMatches({
      releaseCodes: ['roof', 'facade', 'joint_commissioning', 'owner_handover'],
      existingGateCodes: ['permanent_power_to_joint_commissioning'],
    })

    expect(matches.matchedInterfaces.map((item) => item.code)).toEqual(expect.arrayContaining([
      'structure_topping_to_roof_facade_mep',
      'permanent_power_to_joint_commissioning',
      'completion_acceptance_to_handover_opening_production',
    ]))
    expect(matches.missingGateCodes).toEqual(expect.arrayContaining([
      'structure_topping_to_roof_facade_mep',
      'completion_acceptance_to_handover_opening_production',
    ]))
    expect(matches.boundaryPolicy).toContain('derived_from_seed_rules_acceptance_and_project_facts')
  })
})
