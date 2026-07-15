import { describe, expect, it } from 'vitest'

import {
  collectDurationContextGovernanceReport,
  evaluateDurationContextCombinationStressMatrix,
  evaluateDurationContextFactorAttribution,
  listDurationContextFactorAutomationPolicies,
  listDurationContextFactorConsumptionMatrix,
  validateDurationContextSummaryContract,
} from '../services/durationContextGovernanceService.js'

describe('durationContextGovernanceService', () => {
  it('documents every duration context factor with an explicit downstream consumption policy', () => {
    const matrix = listDurationContextFactorConsumptionMatrix()
    const keys = matrix.map((entry) => entry.factorKey).sort()

    expect(keys).toEqual([
      'calendar_missing',
      'external_readiness',
      'pm_recovery_compensation',
      'process_constraint',
      'process_seasonal_sensitivity',
      'productivity_compensation',
      'progress_quality',
      'progress_velocity',
      'project_baseline_calibration',
      'project_schedule_state',
      'resource_conflict',
      'seasonal_productivity',
      'weather_forecast_impact',
      'workflow_sequence',
    ].sort())
    expect(matrix.every((entry) => entry.runtimeEffect.length > 0)).toBe(true)
    expect(matrix.find((entry) => entry.factorKey === 'resource_conflict')).toMatchObject({
      forecastDaysConsumption: 'extra_days_and_multiplier_cap',
      governancePriority: 'P1',
    })
    expect(matrix.find((entry) => entry.factorKey === 'productivity_compensation')).toMatchObject({
      productivityConsumption: 'controlled_positive_compensation',
      requiresPublishedCalibrationForRuntimeOverlay: true,
    })
  })

  it('summarizes backend-only governance gaps without requiring a frontend report', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.reportCode).toBe('duration_context_factor_governance')
    expect(report.frontendExposurePolicy).toBe('backend_admin_api_only')
    expect(report.summary.totalFactors).toBe(14)
    expect(report.summary.directForecastConsumerCount).toBeGreaterThan(0)
    expect(report.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'duration_context_factor_consumption_matrix',
        priority: 'P1',
      }),
    ]))
  })

  it('publishes a factor automation policy that separates automated replay from runtime auto-publish', () => {
    const policies = listDurationContextFactorAutomationPolicies()
    const report = collectDurationContextGovernanceReport()

    expect(policies.map((policy) => policy.factorKey).sort()).toEqual(
      listDurationContextFactorConsumptionMatrix().map((entry) => entry.factorKey).sort(),
    )
    expect(report.factorAutomationPolicies).toEqual(policies)
    expect(report.summary.autoPublishEligibleFactorCount).toBeGreaterThan(0)
    expect(report.summary.manualRuntimePromotionFactorCount).toBeGreaterThan(0)

    expect(policies.find((policy) => policy.factorKey === 'productivity_compensation')).toEqual(expect.objectContaining({
      riskTier: 'low',
      runtimeAutoPublishEligible: true,
      allowedAutomationStages: expect.arrayContaining(['shadow_run', 'audit_replay', 'threshold_evolution_candidate', 'runtime_auto_publish']),
      runtimeActivationBoundary: 'published_only_runtime_consumption',
    }))

    for (const factorKey of ['weather_forecast_impact', 'process_constraint', 'workflow_sequence', 'project_schedule_state'] as const) {
      expect(policies.find((policy) => policy.factorKey === factorKey)).toEqual(expect.objectContaining({
        riskTier: 'high',
        runtimeAutoPublishEligible: false,
        allowedAutomationStages: expect.arrayContaining(['candidate_discovery', 'shadow_run', 'audit_replay', 'governance_report']),
        runtimeActivationBoundary: 'manual_runtime_promotion_required',
      }))
    }
  })

  it('documents the policy learning feedback loop without granting runtime mutation authority', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.policyLearningContract).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
      decisionLogTable: 'duration_context_policy_decisions',
      parameterTable: 'duration_context_policy_parameters',
      canaryCandidateTable: 'duration_context_policy_canary_candidates',
      policyVersionTable: 'duration_context_policy_versions',
      decisionLoggingPolicy: 'persist_recommendation_state_action_and_guardrails_on_calibration_run_without_runtime_mutation',
      delayedRewardBackfillPolicy: 'evaluate_pending_decisions_after_target_reward_date_from_project_productivity_calibration_evidence',
      offlineReplayPolicy: 'backend_admin_candidate_report_only; persist_decisions_optional; never_updates_published_runtime_rows',
      parameterLearningPolicy: 'learn_state_bucket_action_weights_from_evaluated_decisions_as_candidate_parameters_only',
      learnedPolicyReplayPolicy: 'compare_candidate_learned_weights_against_rule_baseline_rewards_for_canary_review_only',
      canaryGatePolicy: 'generate_low_risk_auto_publish_gate_candidates_without_runtime_publication',
      canaryApprovalPolicy: 'zero_human_review_when_scope_samples_and_mae_gate_pass; company_admin_review_required_when_gate_misses_or_manual_override',
      policyVersionRegistryPolicy: 'duration_context_policy_versions_tracks_auto_gate_or_manual_canary_published_rolled_back_expired_versions_as_registry_only',
      rollbackPolicy: 'auto_or_manual_rollback_records_version_status_and_reason_without_recomputing_runtime_p',
      runtimeSelectorPolicy: 'readonly_selector_explain_only; never_changes_duration_context_p_or_factor_outputs',
      approvedCanaryShadowReplayPolicy: 'selector_matched_canary_versions_are_replayed_against_evaluated_decisions_without_runtime_mutation',
      canaryActivationReadinessPolicy: 'shadow_replay_guardrail_gate_for_controlled_runtime_trial_review_only',
      canaryTrialReleasePlanPolicy: 'build_review_required_controlled_trial_release_plan_without_runtime_activation',
      coldStartLearningPolicy: 'gate_learning_automation_by_0_7_30_60_90_day_real_project_evidence_without_runtime_mutation',
      productionBoundary: 'rule_layer_remains_authoritative_high_risk_manual_promotion',
    }))
  })

  it('registers earliest-start and readiness target-date bridges as external_readiness forecast-only sub-rules', () => {
    const report = collectDurationContextGovernanceReport()

    const externalReadiness = report.factorConsumptionMatrix.find((entry) => entry.factorKey === 'external_readiness')
    expect(externalReadiness?.forecastOnlySubRules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'earliest_start_rule',
        parentFactorKey: 'external_readiness',
        consumptionMode: 'forecast_only',
        runtimeAuthority: 'extra_days_bridge_only',
      }),
      expect.objectContaining({
        code: 'acceptance_finish_gate',
        sourceTables: expect.arrayContaining(['acceptance_plans']),
        consumptionMode: 'forecast_only',
      }),
      expect.objectContaining({
        code: 'certificate_condition_target_date',
        sourceTables: expect.arrayContaining(['task_conditions']),
        consumptionMode: 'forecast_only',
      }),
      expect.objectContaining({
        code: 'drawing_condition_target_date',
        sourceTables: expect.arrayContaining(['task_conditions']),
        consumptionMode: 'forecast_only',
      }),
      expect.objectContaining({
        code: 'drawing_package_schedule_impact',
        sourceTables: expect.arrayContaining(['drawing_packages', 'construction_drawings', 'task_conditions']),
        consumptionMode: 'forecast_only',
      }),
      expect.objectContaining({
        code: 'certificate_work_item_gate',
        sourceTables: expect.arrayContaining(['certificate_work_items', 'pre_milestones', 'task_conditions']),
        consumptionMode: 'forecast_only',
      }),
    ]))
    expect(externalReadiness?.notes.join(' ')).toContain('earliest_start_rule is not a standalone duration context factor')
  })

  it('publishes an input coverage audit for all schedule-impact business domains', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.summary.inputCoverageDomainCount).toBeGreaterThanOrEqual(12)
    expect(report.inputCoverageAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domainCode: 'drawing_package_schedule_impact',
        canonicalRuntimePath: 'external_readiness.forecast_only',
        coverageStatus: 'bridged',
      }),
      expect.objectContaining({
        domainCode: 'certificate_work_item_gate',
        canonicalRuntimePath: 'external_readiness.forecast_only',
        coverageStatus: 'bridged',
      }),
      expect.objectContaining({
        domainCode: 'risk_issue_warning',
        coverageStatus: 'governance_only',
      }),
      expect.objectContaining({
        domainCode: 'change_log',
        coverageStatus: 'governance_only',
      }),
    ]))
  })

  it('includes project health and environment buffer as a backend governance signal without adding a runtime factor', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.summary.totalFactors).toBe(14)
    expect(report.nonFactorGovernanceSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'project_environment_health_buffer',
        owningService: 'durationSuggestionService',
        sourceServices: expect.arrayContaining(['projectHealthDeviationSummaryService']),
        frontendExposurePolicy: 'backend_admin_api_only',
        runtimeAuthority: 'suggestion_buffer_only',
      }),
    ]))
  })

  it('declares runtime promotion gateways for risks warnings and change logs without adding a fifteenth factor', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.summary.totalFactors).toBe(14)
    expect(report.runtimePromotionGateways).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceDomain: 'risk_issue_warning',
        defaultRuntimeAuthority: 'governance_only',
        promotionRequired: true,
        allowedRuntimeTargets: expect.arrayContaining([
          'task_conditions',
          'task_obstacles',
          'acceptance_plans',
          'project_schedule_states',
          'project_weather_forecasts',
        ]),
      }),
      expect.objectContaining({
        sourceDomain: 'change_log',
        defaultRuntimeAuthority: 'governance_only',
        promotionRequired: true,
        allowedRuntimeTargets: expect.arrayContaining([
          'task_baseline_versions',
          'task_dependencies',
          'task_conditions',
          'task_obstacles',
        ]),
      }),
    ]))
  })

  it('publishes the standardized backend explain package contract', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.explainPackageContract).toEqual(expect.objectContaining({
      version: 'duration_context_explain_v1',
      frontendExposurePolicy: 'backend_admin_api_only',
      fields: expect.arrayContaining([
        'primaryDrivers',
        'companionSignals',
        'suppressedSignals',
        'scopeComposition',
        'calibration',
        'pSemantics',
      ]),
      sourceFields: expect.arrayContaining([
        'factor_contribution_ledger',
        'causal_dedupe',
        'readiness_graph',
        'project_schedule_state_composition',
      ]),
    }))
  })

  it('documents downstream consumers that must use the effective contribution ledger for recomputation', () => {
    const report = collectDurationContextGovernanceReport()

    expect(report.effectiveContributionLedgerContract).toEqual(expect.objectContaining({
      sourceField: 'calculationContext.factor_contribution_ledger',
      recomputationPolicy: 'do_not_recompute_duration_or_productivity_from_raw_context_factors',
      consumers: expect.arrayContaining([
        expect.objectContaining({
          service: 'highFidelitySyntheticStressService',
          requiredFor: expect.arrayContaining(['independent_productivity']),
        }),
        expect.objectContaining({
          service: 'durationSuggestionService',
          requiredFor: expect.arrayContaining(['filtered_context_rebuild']),
        }),
      ]),
    }))
  })

  it('evaluates post-run factor attribution from predicted drivers versus observed deviation causes', () => {
    const result = evaluateDurationContextFactorAttribution([
      {
        caseId: 'forecast-hit',
        predictedTopFactorKeys: ['external_readiness', 'resource_conflict'],
        observedCauseFactorKeys: ['external_readiness'],
        actualDeviationDays: 5,
      },
      {
        caseId: 'forecast-over-penalty',
        predictedTopFactorKeys: ['weather_forecast_impact'],
        observedCauseFactorKeys: ['progress_velocity'],
        actualDeviationDays: 0,
      },
      {
        caseId: 'forecast-missed',
        predictedTopFactorKeys: ['progress_velocity'],
        observedCauseFactorKeys: ['resource_conflict'],
        actualDeviationDays: 4,
      },
    ])

    expect(result.summary).toEqual(expect.objectContaining({
      totalCases: 3,
      matchedCaseCount: 1,
      missedCaseCount: 1,
      overPenaltyCaseCount: 1,
      hitRate: 0.333,
      overPenaltyRate: 0.333,
      missedRate: 0.333,
    }))
    expect(result.factorStats.external_readiness).toEqual(expect.objectContaining({
      predictedCount: 1,
      observedCount: 1,
      matchedCount: 1,
    }))
    expect(result.factorStats.weather_forecast_impact.overPenaltyCount).toBe(1)
    expect(result.caseResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        caseId: 'forecast-over-penalty',
        classification: 'over_penalty',
        overPenaltyFactorKeys: ['weather_forecast_impact'],
      }),
      expect.objectContaining({
        caseId: 'forecast-missed',
        classification: 'missed_driver',
        missedFactorKeys: ['resource_conflict'],
      }),
    ]))
  })

  it('publishes a pairwise and triple combination stress matrix for high-risk factor interactions', () => {
    const matrix = evaluateDurationContextCombinationStressMatrix()

    expect(matrix.summary).toEqual(expect.objectContaining({
      matrixCode: 'duration_context_combination_regression_matrix',
      totalScenarios: expect.any(Number),
      pairwiseScenarioCount: expect.any(Number),
      tripleScenarioCount: expect.any(Number),
      backendExposurePolicy: 'backend_admin_api_only',
    }))
    expect(matrix.summary.totalScenarios).toBeGreaterThanOrEqual(6)
    expect(matrix.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scenarioCode: 'readiness_resource_weather',
        factorKeys: expect.arrayContaining(['external_readiness', 'resource_conflict', 'weather_forecast_impact']),
        guardrails: expect.arrayContaining([
          'use_factor_contribution_ledger_not_raw_factor_multiplication',
          'cap_extra_days_at_synthesis_layer',
        ]),
      }),
      expect.objectContaining({
        scenarioCode: 'schedule_state_resource_velocity',
        factorKeys: expect.arrayContaining(['project_schedule_state', 'resource_conflict', 'progress_velocity']),
        expectedFailureMode: expect.stringContaining('local acceleration'),
      }),
    ]))
  })

  it('validates duration context JSON contracts before persisted summaries can be replayed', () => {
    const validSummary = {
      contextVersion: 'v1.4.7.4',
      multiplier: 1.08,
      extraDays: 2,
      confidenceDelta: -4,
      adjustedBy: ['external_readiness'],
      factors: [],
      businessReasons: [],
      hasLowConfidenceSignal: false,
      calculationContext: {
        duration_source: 'standard',
        adjusted_by: ['external_readiness'],
        confidence_level: 'medium',
        factor_summary_available: true,
        factor_contribution_ledger: [
          {
            key: 'external_readiness',
            label: 'External readiness',
            multiplier: 1,
            extraDays: 2,
            confidenceDelta: -4,
            actionPolicy: 'candidate_only',
            source: 'task_fact',
            contributionMode: 'extra_days',
            scopeFingerprint: 'project-1:task-1',
            sourceEntityKeys: ['task_condition:condition-1'],
            dedupeKey: 'external_readiness:task_condition:condition-1',
            dataDependencies: ['task_conditions'],
            reason: 'drawing package not ready',
          },
        ],
        explain_package: {
          version: 'duration_context_explain_v1',
          primaryDrivers: [],
          companionSignals: [],
          suppressedSignals: [],
          inputCoverage: {},
        },
      },
    }

    expect(validateDurationContextSummaryContract(validSummary)).toEqual(expect.objectContaining({
      valid: true,
      errors: [],
      warnings: [],
    }))

    const invalidSummary = {
      ...validSummary,
      calculationContext: {
        ...validSummary.calculationContext,
        factor_contribution_ledger: [
          {
            key: 'made_up_factor',
            multiplier: 'fast',
            extraDays: -3,
            actionPolicy: 'auto_apply',
          },
        ],
        explain_package: {
          primaryDrivers: [],
        },
      },
    }

    const invalid = validateDurationContextSummaryContract(invalidSummary)
    expect(invalid.valid).toBe(false)
    expect(invalid.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_factor_key' }),
      expect.objectContaining({ code: 'invalid_ledger_number' }),
      expect.objectContaining({ code: 'invalid_explain_package_version' }),
    ]))
  })
})
