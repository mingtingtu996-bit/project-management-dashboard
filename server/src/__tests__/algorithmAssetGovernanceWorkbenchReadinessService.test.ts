import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetGovernanceWorkbenchReadiness,
  type AlgorithmAssetGovernanceWorkbenchReadinessInput,
} from '../services/algorithmAssetGovernanceWorkbenchReadinessService.js'
import type {
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutMatrix,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import { buildConstructionOrganizationPrecisionReplayMatrix } from '../services/constructionOrganizationPrecisionReplayMatrixService.js'
import { buildV14223CrossScopeReplayEvidenceMatrix } from '../services/crossScopeReplayEvidenceMatrixService.js'
import { buildV14223DomainReleaseRuntimeClosureMatrix } from '../services/domainReleaseRuntimeClosureMatrixService.js'
import { buildV14223FutureAssetRediscoveryGateRerunMatrix } from '../services/futureAssetRediscoveryGateRerunMatrixService.js'
import { buildV14223MetricConsumerPathCoverageMatrix } from '../services/metricConsumerPathCoverageMatrixService.js'
import { buildV14223MetricProductionSnapshotPublicationRollbackMatrix } from '../services/metricProductionSnapshotPublicationRollbackMatrixService.js'
import { buildV14223OrdinaryBusinessDtoExposureMatrix } from '../services/ordinaryBusinessDtoExposureMatrixService.js'
import { buildV14223OperableGovernanceFrontendMatrix } from '../services/operableGovernanceFrontendMatrixService.js'
import { buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix } from '../services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'

function buildCompleteWorkbenchReadinessInput(): AlgorithmAssetGovernanceWorkbenchReadinessInput {
  return {
    companyId: 'company-a',
    inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
    admissionStatus: 'pass',
    admissionSummary: {
      totalDiscoveredCount: 327,
      registeredCount: 327,
      durationRelatedAssetCount: 208,
      durationRelatedCoverageRatio: 0.6361,
      explicitGovernanceFieldCount: 327,
      conservativeGovernanceDefaultCount: 0,
    },
    reviewItems: [],
    blockers: [],
    governanceDefaultReviewItems: [],
    governanceEvidence: {
      candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
      replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
      sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
    },
    backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
    frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
    runtimeIsolationMatrix: {
      status: 'isolation_matrix_confirmed',
      canDeclareAssetIsolationComplete: true,
      requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
      rows: [{
        assetKey: 'duration.forecast.residual_overlay',
        assetType: 'forecast_residual_overlay',
        scopeType: 'company',
        status: 'confirmed',
        missingReasons: [],
      }],
    },
    parameterConsumerCoverage: {
      verifiedConsumers: ['duration.benchmark_blend_weight'],
      pendingConsumerGroups: [],
    },
    metricSourceCoverage: {
      registeredMetricSources: [
        'metricRegistryService',
        'metricRegistry',
        'progressCalculation',
        'statistics',
        'algorithm_sample_health_events',
      ],
      pendingMetricSourceGroups: [],
    },
    ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
    templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
    metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
    metricConsumerPathCoverageMatrix: buildV14223MetricConsumerPathCoverageMatrix(),
    futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
    operableGovernanceFrontendMatrix: buildV14223OperableGovernanceFrontendMatrix(),
    domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
    crossScopeReplayEvidenceMatrix: buildV14223CrossScopeReplayEvidenceMatrix(),
    constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
  }
}

function buildReadyConstructionOrganizationRuntimeCloseoutClaim(): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status: 'runtime_closeout_claim_ready',
    canClaimRuntimeCloseout: true,
    canMaterializeRuntime: false,
    totalDraftCount: 1,
    claimBasis: [
      'release_exit_handoff_linked_for_every_draft',
      'domain_writer_runtime_publication_linked_for_every_draft',
      'runtime_consumer_observation_linked_for_every_draft',
      'impact_monitoring_passed_for_every_draft',
      'rollback_execution_verified_for_every_draft',
      'saved_network_outcome_linked_for_every_draft',
      'true_per_option_E1_E3_E5_runtime_evidence_linked_for_every_draft',
      'site_adoption_of_runtime_recommended_option_linked',
    ],
    missingBeforeClaim: [],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_closeout_claim_is_a_read_only_audit_projection',
      'requires_site_adoption_of_runtime_recommended_option',
    ],
  }
}

function buildReadyConstructionOrganizationProductOutcomeCloseoutMatrix(
  precisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix(),
) {
  return buildConstructionOrganizationProductOutcomeCloseoutMatrix({
    precisionReplayMatrix,
    runtimeEvidenceContextsByBusinessType: Object.fromEntries(
      precisionReplayMatrix.businessTypes.map((row, index) => [
        row.businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [
            `draft-${row.businessType}-recommended`,
            `draft-${row.businessType}-foundation-alt`,
            `draft-${row.businessType}-release-alt`,
          ],
          optionIds: [
            `option-${row.businessType}-recommended`,
            `option-${row.businessType}-foundation-alt`,
            `option-${row.businessType}-release-alt`,
          ],
          publicationKeys: [`construction-org-plan-network:project-${index + 1}:option-${row.businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
          runtimeReadyOptionCloseoutClaimCount: 3,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 3,
            accelerationRecovery: 3,
          },
          runtimeReadyUseCaseOptionCloseoutClaimCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 3,
            accelerationRecovery: 3,
          },
          runtimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
        },
      ]),
    ),
    runtimeCloseoutClaimsByBusinessType: Object.fromEntries(
      precisionReplayMatrix.businessTypes.map((row) => [
        row.businessType,
        buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
      ]),
    ),
  })
}

describe('algorithmAssetGovernanceWorkbenchReadinessService', () => {
  it('keeps the backend operations workbench read-only and reports remaining closure gaps', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 76,
        conservativeGovernanceDefaultCount: 251,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [{
        assetKey: 'durationContextPolicyLearningService',
        sourcePath: 'server/src/services/durationContextPolicyLearningService.ts',
        durationRelated: true,
        learningTarget: 'context_factor',
        learningMaturity: 'shadow_report_only',
        publishAnchor: 'candidate_only',
        automationMaturity: 'auto_shadow',
        reason: 'missing_inventory_governance_field_defaults_to_candidate_or_shadow',
      }],
      governanceEvidence: {
        candidateEvents: {
          totalCount: 3,
          reviewRequiredCount: 1,
          quarantinedCount: 1,
          replayReadyCount: 1,
        },
        replayRuns: {
          totalCount: 2,
          passedCount: 1,
          blockedCount: 1,
          failedCount: 0,
        },
        sampleHealth: {
          totalCount: 6,
          acceptedCount: 3,
          weakCount: 2,
          rejectedCount: 1,
          benchmarkEligibleCount: 3,
        },
      },
      backendWorkbenchEvidenceRefs: [
        'GET /api/planning/algorithm-seeds/rule-assets/governance-workbench',
        'algorithmAssetGovernanceDashboardEvidenceService',
      ],
      frontendAdminPageEvidenceRefs: [],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_incomplete',
        canDeclareAssetIsolationComplete: false,
        requiredSurfaces: [
          'runtime_writer',
          'runtime_consumer',
          'runtime_cache',
          'async_job',
          'rollback_writer',
        ],
        rows: [{
          assetKey: 'wbs.template.runtime',
          assetType: 'wbs_template',
          scopeType: 'company',
          status: 'incomplete',
          missingReasons: ['runtime_writer_isolation_required'],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: [
          'duration.benchmark_blend_weight',
          'duration.p50_p75_blend_ratio',
          'duration.context.weather_multiplier',
          'duration.context.site_pressure_multiplier',
          'forecast.confidence_weight_multiplier',
        ],
        pendingConsumerGroups: ['other_parameter_production_consumers'],
      },
      metricSourceCoverage: {
        registeredMetricSources: ['algorithm_sample_health_events'],
        pendingMetricSourceGroups: ['more_metric_sources'],
      },
    })

    expect(readiness).toEqual(expect.objectContaining({
      reportCode: 'v14223_rule_asset_governance_workbench_readiness',
      companyId: 'company-a',
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      frontendExposurePolicy: 'backend_admin_governance_only',
      runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report',
    }))
    expect(readiness.summary).toEqual(expect.objectContaining({
      durationRelatedAssetCount: 208,
      durationRelatedCoverageRatio: 0.6361,
      explicitGovernanceFieldCount: 76,
      conservativeGovernanceDefaultCount: 251,
      governanceDefaultReviewItemCount: 1,
      readyGateCount: 4,
      needsWorkGateCount: 16,
      totalGateCount: 20,
    }))
    expect(readiness.governanceDefaultReviewItems).toEqual([expect.objectContaining({
      assetKey: 'durationContextPolicyLearningService',
      durationRelated: true,
      learningTarget: 'context_factor',
      reason: 'missing_inventory_governance_field_defaults_to_candidate_or_shadow',
    })])
    expect(readiness.remainingClosureGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'complete_operable_governance_frontend',
        evidenceRequired: expect.arrayContaining([
          'company_admin_operation_ui',
          'frontend_operation_api_contract',
          'domain_handoff_result_display',
        ]),
      }),
      expect.objectContaining({
        key: 'metric_consumer_path_coverage',
        evidenceRequired: expect.arrayContaining([
          'dashboard_summary_cards',
          'reports_trend_routes',
          'metric_runtime_consumer_gate',
        ]),
      }),
    ]))
    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'backend_operations_workbench',
        status: 'ready',
      }),
      expect.objectContaining({
        key: 'admission_governance_defaults',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'durationContextPolicyLearningService:missing_inventory_governance_field_defaults_to_candidate_or_shadow',
        ]),
      }),
      expect.objectContaining({
        key: 'frontend_admin_operations_page',
        status: 'needs_work',
        missingReasons: expect.arrayContaining(['frontend_admin_operations_page_evidence_required']),
      }),
      expect.objectContaining({
        key: 'runtime_asset_isolation_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining(['wbs.template.runtime:runtime_writer_isolation_required']),
      }),
      expect.objectContaining({
        key: 'parameter_runtime_consumers',
        status: 'needs_work',
        missingReasons: ['other_parameter_production_consumers'],
      }),
      expect.objectContaining({
        key: 'metric_source_coverage',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'more_metric_sources',
          'metric_source_not_covered:metricRegistryService',
          'metric_source_not_covered:metricRegistry',
          'metric_source_not_covered:progressCalculation',
          'metric_source_not_covered:statistics',
        ]),
      }),
      expect.objectContaining({
        key: 'metric_production_snapshot_publication_rollback_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'metric_production_snapshot_publication_rollback_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'metric_consumer_path_coverage_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'metric_consumer_path_coverage_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'future_asset_rediscovery_gate_rerun_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'future_asset_rediscovery_gate_rerun_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'operable_governance_frontend_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'operable_governance_frontend_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'domain_release_runtime_closure_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'domain_release_runtime_closure_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'cross_scope_replay_evidence_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'cross_scope_replay_evidence_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'construction_organization_precision_replay_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'construction_organization_precision_replay_matrix_required',
        ]),
      }),
      expect.objectContaining({
        key: 'construction_organization_runtime_closeout_claim',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'construction_organization_runtime_closeout_claim_required',
        ]),
      }),
    ]))
    expect(readiness.boundaryPolicy).toEqual(expect.arrayContaining([
      'workbench_readiness_does_not_grant_publish_rights',
      'dashboard_or_workbench_summary_is_not_runtime_writer_evidence',
      'incomplete_gates_remain_review_required',
    ]))
  })

  it('marks the workbench ready when every workbench gate has direct evidence without declaring v1.4.22.3 complete', () => {
    const constructionOrganizationPrecisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix()
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
      metricConsumerPathCoverageMatrix: buildV14223MetricConsumerPathCoverageMatrix(),
      futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
      operableGovernanceFrontendMatrix: buildV14223OperableGovernanceFrontendMatrix(),
      domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
      crossScopeReplayEvidenceMatrix: buildV14223CrossScopeReplayEvidenceMatrix(),
      constructionOrganizationPrecisionReplayMatrix,
      constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
      constructionOrganizationProductOutcomeCloseoutMatrix: buildReadyConstructionOrganizationProductOutcomeCloseoutMatrix(
        constructionOrganizationPrecisionReplayMatrix,
      ),
    })

    expect(readiness.status).toBe('workbench_ready')
    expect(readiness.canDeclareGovernanceWorkbenchComplete).toBe(true)
    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'domain_release_runtime_closure_matrix',
        status: 'ready',
        evidenceRefs: ['domainReleaseRuntimeClosureMatrixService'],
        missingReasons: [],
      }),
      expect.objectContaining({
        key: 'cross_scope_replay_evidence_matrix',
        status: 'ready',
        evidenceRefs: ['crossScopeReplayEvidenceMatrixService'],
        missingReasons: [],
      }),
      expect.objectContaining({
        key: 'metric_consumer_path_coverage_matrix',
        status: 'ready',
        evidenceRefs: ['metricConsumerPathCoverageMatrixService'],
        missingReasons: [],
      }),
    ]))
    expect(readiness.completionScope).toBe('workbench_readiness_evidence_only')
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('complete_operable_governance_frontend')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('ordinary_business_page_dto_technical_field_exposure_matrix')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('all_template_write_surfaces_legacy_scope_sanitizer')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('metric_production_snapshot_publish_rollback_closure')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('metric_consumer_path_coverage')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('future_assets_rediscovery_and_gate_rerun')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('cross_company_cross_project_replay_evidence')
    expect(readiness.boundaryPolicy).toEqual(expect.arrayContaining([
      'metric_consumer_matrix_is_current_snapshot_only',
      'new_metric_consumer_path_must_reenter_review_required',
    ]))
  })

  it('keeps construction-organization precision replay as a readiness gate instead of a loose sidecar asset', () => {
    const withoutMatrix = buildAlgorithmAssetGovernanceWorkbenchReadiness(
      buildCompleteWorkbenchReadinessInput(),
    )
    const withMatrix = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...buildCompleteWorkbenchReadinessInput(),
      constructionOrganizationPrecisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
    })

    expect(withoutMatrix.status).toBe('workbench_incomplete')
    expect(withoutMatrix.canDeclareGovernanceWorkbenchComplete).toBe(false)
    expect(withoutMatrix.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_precision_replay_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'construction_organization_precision_replay_matrix_required',
        ]),
      }),
    ]))
    expect(withoutMatrix.remainingClosureGaps.map((gap) => gap.key))
      .toContain('construction_organization_precision_replay_matrix')

    expect(withMatrix.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_precision_replay_matrix',
        status: 'ready',
        evidenceRefs: ['constructionOrganizationPrecisionReplayMatrixService'],
        missingReasons: [],
        details: expect.objectContaining({
          source: 'construction_organization_precision_replay_gate_detail',
          matrixStatus: 'precision_replay_matrix_ready',
          automaticOptionSelectionStatus: 'automatic_option_selection_verified',
          supportedBusinessTypeCount: 11,
          replayedBusinessTypeCount: 11,
          totalUseCaseProofCount: 33,
          verifiedUseCaseProofCount: 33,
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          mismatchReasons: [],
          boundaryPolicy: expect.arrayContaining([
            'candidate_projection_not_runtime_saved_outcome',
            'automatic_option_selection_proof_does_not_grant_auto_materialization',
          ]),
        }),
      }),
    ]))
    expect(withMatrix.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('construction_organization_precision_replay_matrix')
    expect(withMatrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'construction_organization_precision_replay_is_candidate_projection_not_runtime_saved_outcome',
      'construction_organization_precision_replay_does_not_grant_auto_materialization',
    ]))
  })

  it('keeps construction-organization runtime closeout claim as a global product-readiness gate', () => {
    const {
      constructionOrganizationRuntimeCloseoutClaim: _omittedRuntimeCloseoutClaim,
      ...completeInputWithoutRuntimeCloseoutClaim
    } = buildCompleteWorkbenchReadinessInput()
    const withoutClaim = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...completeInputWithoutRuntimeCloseoutClaim,
      constructionOrganizationPrecisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
    })
    const withClaim = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...buildCompleteWorkbenchReadinessInput(),
      constructionOrganizationPrecisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
    })

    expect(withoutClaim.status).toBe('workbench_incomplete')
    expect(withoutClaim.canDeclareGovernanceWorkbenchComplete).toBe(false)
    expect(withoutClaim.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_runtime_closeout_claim',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'construction_organization_runtime_closeout_claim_required',
        ]),
      }),
    ]))
    expect(withoutClaim.remainingClosureGaps.map((gap) => gap.key))
      .toContain('construction_organization_runtime_closeout_claim')

    expect(withClaim.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_runtime_closeout_claim',
        status: 'ready',
        evidenceRefs: ['constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim'],
        missingReasons: [],
      }),
    ]))
    expect(withClaim.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('construction_organization_runtime_closeout_claim')
    expect(withClaim.boundaryPolicy).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_is_a_read_only_audit_projection',
      'requires_site_adoption_of_runtime_recommended_option',
      'construction_organization_runtime_closeout_claim_does_not_grant_auto_materialization',
    ]))
  })

  it('requires construction-organization product outcome closeout across all supported business types', () => {
    const precisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix()
    const incompleteProductOutcomeMatrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix,
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-1'],
          draftNetworkKeys: ['draft-general_civil'],
          optionIds: ['option-general_civil'],
          publicationKeys: ['construction-org-plan-network:project-1:option-general_civil'],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 1,
          runtimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
      },
    })
    const readyProductOutcomeMatrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix,
      runtimeEvidenceContextsByBusinessType: Object.fromEntries(
        precisionReplayMatrix.businessTypes.map((row, index) => [
          row.businessType,
          {
          projectIds: [`project-${index + 1}`],
            draftNetworkKeys: [
              `draft-${row.businessType}-recommended`,
              `draft-${row.businessType}-foundation-alt`,
              `draft-${row.businessType}-release-alt`,
            ],
            optionIds: [
              `option-${row.businessType}-recommended`,
              `option-${row.businessType}-foundation-alt`,
              `option-${row.businessType}-release-alt`,
            ],
            publicationKeys: [`construction-org-plan-network:project-${index + 1}:option-${row.businessType}`],
            evidenceSources: ['runtime'],
            useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
            optionCount: 3,
            runtimeReadyOptionCount: 3,
            runtimeReadyOptionCloseoutClaimCount: 3,
            runtimeReadyUseCaseOptionCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 3,
            },
            runtimeReadyUseCaseOptionCloseoutClaimCounts: {
              newProjectPlanning: 3,
              startingLineOnboarding: 3,
              accelerationRecovery: 3,
            },
            runtimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
          },
        ]),
      ),
      runtimeCloseoutClaimsByBusinessType: Object.fromEntries(
        precisionReplayMatrix.businessTypes.map((row) => [
          row.businessType,
          buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
        ]),
      ),
    })

    const withoutProductOutcomeMatrix = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...buildCompleteWorkbenchReadinessInput(),
      constructionOrganizationPrecisionReplayMatrix: precisionReplayMatrix,
      constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
    })
    const withIncompleteProductOutcomeMatrix = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...buildCompleteWorkbenchReadinessInput(),
      constructionOrganizationPrecisionReplayMatrix: precisionReplayMatrix,
      constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
      constructionOrganizationProductOutcomeCloseoutMatrix: incompleteProductOutcomeMatrix,
    } as AlgorithmAssetGovernanceWorkbenchReadinessInput & Record<string, unknown>)
    const withReadyProductOutcomeMatrix = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      ...buildCompleteWorkbenchReadinessInput(),
      constructionOrganizationPrecisionReplayMatrix: precisionReplayMatrix,
      constructionOrganizationRuntimeCloseoutClaim: buildReadyConstructionOrganizationRuntimeCloseoutClaim(),
      constructionOrganizationProductOutcomeCloseoutMatrix: readyProductOutcomeMatrix,
    } as AlgorithmAssetGovernanceWorkbenchReadinessInput & Record<string, unknown>)

    expect(withoutProductOutcomeMatrix.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_product_outcome_closeout_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'construction_organization_product_outcome_closeout_matrix_required',
        ]),
      }),
    ]))
    expect(withoutProductOutcomeMatrix.canDeclareGovernanceWorkbenchComplete).toBe(false)
    expect(withoutProductOutcomeMatrix.remainingClosureGaps.map((gap) => gap.key))
      .toContain('construction_organization_product_outcome_closeout_matrix')

    expect(withIncompleteProductOutcomeMatrix.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_product_outcome_closeout_matrix',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'general_civil:runtime_option_network_coverage_required',
          'hospital:runtime_closeout_claim_by_business_type_required',
        ]),
        details: expect.objectContaining({
          source: 'construction_organization_product_outcome_closeout_gate_detail',
          status: 'product_outcome_closeout_incomplete',
          runtimeOutcomeReadyBusinessTypeCount: 0,
          supportedBusinessTypeCount: 11,
          productOutcomeCloseoutProgress: expect.objectContaining({
            source: 'construction_organization_product_outcome_closeout_progress',
            status: 'product_outcome_closeout_incomplete',
            canDeclareConstructionOrganizationProductOutcomeCloseout: false,
            runtimeOutcomeReadyBusinessTypeCount: 0,
            missingBusinessTypes: expect.arrayContaining(['general_civil', 'hospital']),
            nextEvidenceWorkItemCount: expect.any(Number),
            nextEvidenceWorkPackageCount: expect.any(Number),
            useCaseCoverage: expect.objectContaining({
              newProjectPlanning: expect.objectContaining({
                readyBusinessTypeCount: 0,
                missingBusinessTypes: expect.arrayContaining(['general_civil']),
              }),
            }),
            mutationBoundary: expect.objectContaining({
              writesTaskDependencies: false,
              writesPlanDates: false,
            }),
          }),
          nextEvidenceActions: expect.arrayContaining([
            'collect_runtime_option_network_evidence_for_business_type',
            'collect_runtime_closeout_claim_for_business_type',
          ]),
          businessTypeRows: expect.arrayContaining([
            expect.objectContaining({
              businessType: 'general_civil',
              status: 'product_outcome_closeout_incomplete',
              hasPrecisionReplayEvidence: true,
              hasRuntimeCloseoutClaimEvidence: true,
              hasRuntimeCloseoutClaim: false,
              runtimeEvidenceOptionCount: 1,
              runtimeEvidenceOptionDeficit: 2,
              runtimeEvidenceRuntimeReadyOptionDeficit: 3,
              runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: 3,
              runtimeReadyUseCaseOptionDeficits: {
                newProjectPlanning: 3,
                startingLineOnboarding: 3,
                accelerationRecovery: 3,
              },
              runtimeReadyUseCaseOptionCloseoutClaimDeficits: {
                newProjectPlanning: 3,
                startingLineOnboarding: 3,
                accelerationRecovery: 3,
              },
              hasRequiredRuntimeOptionNetworkCoverage: false,
              missingReasons: expect.arrayContaining([
                'runtime_option_network_coverage_required',
              ]),
              nextEvidenceActions: expect.arrayContaining([
                'collect_runtime_option_network_evidence_for_business_type',
              ]),
            }),
            expect.objectContaining({
              businessType: 'hospital',
              status: 'product_outcome_closeout_incomplete',
              hasPrecisionReplayEvidence: true,
              hasRuntimeCloseoutClaim: false,
              missingReasons: expect.arrayContaining([
                'runtime_closeout_claim_by_business_type_required',
              ]),
              nextEvidenceActions: expect.arrayContaining([
                'collect_runtime_closeout_claim_for_business_type',
              ]),
            }),
          ]),
          nextEvidenceExecutionPlan: expect.arrayContaining([
            expect.objectContaining({
              businessType: 'general_civil',
              useCase: null,
              evidenceAction: 'collect_runtime_option_network_evidence_for_business_type',
              operationAction: 'runtime_engine_evidence',
              deficit: 2,
            }),
            expect.objectContaining({
              businessType: 'general_civil',
              useCase: 'newProjectPlanning',
              evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
              operationAction: 'runtime_engine_evidence',
              deficit: 3,
            }),
          ]),
          nextEvidenceWorkPackages: expect.arrayContaining([
            expect.objectContaining({
              source: 'construction_organization_product_outcome_evidence_work_package',
              businessType: 'general_civil',
              status: 'evidence_work_package_open',
              workPackageKey: 'construction_organization_product_outcome:general_civil',
              totalDeficit: expect.any(Number),
              prefillableExecutionStepCount: expect.any(Number),
              blockedExecutionStepCount: expect.any(Number),
              executionReadinessStatus: expect.any(String),
              missingRuntimeAnchorReasons: expect.any(Array),
              requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
              executionSteps: expect.arrayContaining([
                expect.objectContaining({
                  source: 'construction_organization_product_outcome_evidence_work_package_step',
                  workPackageKey: 'construction_organization_product_outcome:general_civil',
                  businessType: 'general_civil',
                  operationAction: 'runtime_engine_evidence',
                  canPrefillControlledOperation: true,
                }),
              ]),
              boundaryPolicy: expect.arrayContaining([
                'work_package_does_not_fabricate_runtime_evidence',
              ]),
            }),
          ]),
          workbenchOperationSuggestionReport: expect.objectContaining({
            source: 'construction_organization_closeout_workbench_operation_suggestion_report',
            status: 'controlled_operation_suggestions_available',
            suggestions: expect.arrayContaining([
              expect.objectContaining({
                source: 'construction_organization_closeout_workbench_operation_suggestion',
                action: 'runtime_consumer_observation',
                businessType: 'general_civil',
                canSubmitControlledOperation: true,
                operationPayload: expect.objectContaining({
                  action: 'runtime_consumer_observation',
                  assetType: 'construction_organization_plan_network',
                  domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
                }),
              }),
              expect.objectContaining({
                action: 'runtime_engine_evidence',
                engineCode: 'standard_duration_reference',
                canSubmitControlledOperation: false,
                missingRequiredFields: expect.arrayContaining([
                  'predictedDurationDays',
                  'actualDurationDays',
                ]),
              }),
            ]),
            boundaryPolicy: expect.arrayContaining([
              'operation_suggestions_do_not_execute_workbench_operations',
              'publication_anchor_required_before_runtime_evidence_payloads',
            ]),
          }),
        }),
      }),
    ]))

    expect(withReadyProductOutcomeMatrix.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'construction_organization_product_outcome_closeout_matrix',
        status: 'ready',
        evidenceRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService'],
        missingReasons: [],
        details: expect.objectContaining({
          source: 'construction_organization_product_outcome_closeout_gate_detail',
          status: 'product_outcome_closeout_ready',
          runtimeOutcomeReadyBusinessTypeCount: 11,
          supportedBusinessTypeCount: 11,
          nextEvidenceActions: [],
          productOutcomeCloseoutProgress: expect.objectContaining({
            source: 'construction_organization_product_outcome_closeout_progress',
            status: 'product_outcome_closeout_ready',
            canDeclareConstructionOrganizationProductOutcomeCloseout: true,
            runtimeOutcomeReadyBusinessTypeCount: 11,
            readyBusinessTypes: expect.arrayContaining(['general_civil', 'hospital']),
            missingBusinessTypes: [],
            nextEvidenceWorkItemCount: 0,
            nextEvidenceWorkPackageCount: 0,
          }),
        }),
      }),
    ]))
    expect(withReadyProductOutcomeMatrix.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('construction_organization_product_outcome_closeout_matrix')
  })

  it('removes the ordinary business DTO exposure gap only when a complete DTO matrix is provided', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
    })

    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ordinary_business_dto_exposure_matrix',
        status: 'ready',
      }),
    ]))
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('ordinary_business_page_dto_technical_field_exposure_matrix')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key)).toEqual(expect.arrayContaining([
      'complete_operable_governance_frontend',
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
    ]))
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
  })

  it('removes the template write-surface legacy scope gap only when the sanitizer matrix is complete', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
    })

    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'template_write_surface_legacy_scope_sanitizer_matrix',
        status: 'ready',
      }),
    ]))
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('all_template_write_surfaces_legacy_scope_sanitizer')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key)).toEqual(expect.arrayContaining([
      'complete_operable_governance_frontend',
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
    ]))
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
  })

  it('keeps metric source coverage incomplete when current metric-caliber assets are not explicitly covered', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: ['algorithm_sample_health_events'],
        pendingMetricSourceGroups: [],
      },
    })

    expect(readiness.status).toBe('workbench_incomplete')
    expect(readiness.canDeclareGovernanceWorkbenchComplete).toBe(false)
    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'metric_source_coverage',
        status: 'needs_work',
        missingReasons: expect.arrayContaining([
          'metric_source_not_covered:metricRegistryService',
          'metric_source_not_covered:metricRegistry',
          'metric_source_not_covered:progressCalculation',
          'metric_source_not_covered:statistics',
        ]),
      }),
    ]))
    expect(readiness.boundaryPolicy).toEqual(expect.arrayContaining([
      'metric_source_registration_is_not_runtime_consumer_or_publish_evidence',
    ]))
  })

  it('removes the metric production snapshot publish rollback gap only when the closure matrix is complete', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
    })

    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'metric_production_snapshot_publication_rollback_matrix',
        status: 'ready',
      }),
    ]))
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('metric_production_snapshot_publish_rollback_closure')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key)).toEqual(expect.arrayContaining([
      'complete_operable_governance_frontend',
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
      'future_assets_rediscovery_and_gate_rerun',
    ]))
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
  })

  it('removes the future asset rediscovery gap only when the current-snapshot rerun matrix is complete', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/AdminRuleAssetGovernanceWorkbench.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
      futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
    })

    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'future_asset_rediscovery_gate_rerun_matrix',
        status: 'ready',
      }),
    ]))
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('future_assets_rediscovery_and_gate_rerun')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key)).toEqual(expect.arrayContaining([
      'complete_operable_governance_frontend',
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
    ]))
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
    expect(readiness.boundaryPolicy).toEqual(expect.arrayContaining([
      'future_asset_rerun_matrix_is_current_snapshot_only',
      'ready_matrix_is_not_future_asset_whitelist',
    ]))
  })

  it('removes the operable governance frontend gap only when the controlled-operation frontend matrix is complete', () => {
    const readiness = buildAlgorithmAssetGovernanceWorkbenchReadiness({
      companyId: 'company-a',
      inventorySummary: { totalAssetCount: 348, algorithmSeedCount: 18 },
      admissionStatus: 'pass',
      admissionSummary: {
        totalDiscoveredCount: 327,
        registeredCount: 327,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 327,
        conservativeGovernanceDefaultCount: 0,
      },
      reviewItems: [],
      blockers: [],
      governanceDefaultReviewItems: [],
      governanceEvidence: {
        candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
        replayRuns: { totalCount: 1, passedCount: 1, blockedCount: 0, failedCount: 0 },
        sampleHealth: { totalCount: 1, acceptedCount: 1, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 1 },
      },
      backendWorkbenchEvidenceRefs: ['GET /api/planning/algorithm-seeds/rule-assets/governance-workbench'],
      frontendAdminPageEvidenceRefs: ['client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx'],
      runtimeIsolationMatrix: {
        status: 'isolation_matrix_confirmed',
        canDeclareAssetIsolationComplete: true,
        requiredSurfaces: ['runtime_writer', 'runtime_consumer', 'runtime_cache', 'async_job', 'rollback_writer'],
        rows: [{
          assetKey: 'duration.forecast.residual_overlay',
          assetType: 'forecast_residual_overlay',
          scopeType: 'company',
          status: 'confirmed',
          missingReasons: [],
        }],
      },
      parameterConsumerCoverage: {
        verifiedConsumers: ['duration.benchmark_blend_weight'],
        pendingConsumerGroups: [],
      },
      metricSourceCoverage: {
        registeredMetricSources: [
          'metricRegistryService',
          'metricRegistry',
          'progressCalculation',
          'statistics',
          'algorithm_sample_health_events',
        ],
        pendingMetricSourceGroups: [],
      },
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
      futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
      operableGovernanceFrontendMatrix: buildV14223OperableGovernanceFrontendMatrix(),
    })

    expect(readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'operable_governance_frontend_matrix',
        status: 'ready',
        evidenceRefs: ['operableGovernanceFrontendMatrixService'],
        missingReasons: [],
      }),
    ]))
    expect(readiness.remainingClosureGaps.map((gap) => gap.key))
      .not.toContain('complete_operable_governance_frontend')
    expect(readiness.remainingClosureGaps.map((gap) => gap.key)).toEqual(expect.arrayContaining([
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
    ]))
    expect(readiness.canDeclareV14223GovernanceComplete).toBe(false)
    expect(readiness.boundaryPolicy).toEqual(expect.arrayContaining([
      'operable_frontend_does_not_grant_publish_rights',
      'complete_operable_frontend_is_not_all_domain_writer_completion',
    ]))
  })
})
