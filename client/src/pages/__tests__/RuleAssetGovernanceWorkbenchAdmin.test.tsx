import { act } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeRuleAssetGovernanceWorkbenchOperation: vi.fn(),
  fetchV14231ActionableSurface: vi.fn(),
  getConstructionOrganizationPlanNetworkDrafts: vi.fn(),
  getStructuredCauseQualityMetrics: vi.fn(),
  getRuleAssetGovernanceWorkbenchReadiness: vi.fn(),
}))

vi.mock('@/services/ruleAssetGovernanceWorkbenchApi', () => ({
  executeRuleAssetGovernanceWorkbenchOperation: mocks.executeRuleAssetGovernanceWorkbenchOperation,
  getConstructionOrganizationPlanNetworkDrafts: mocks.getConstructionOrganizationPlanNetworkDrafts,
  getStructuredCauseQualityMetrics: mocks.getStructuredCauseQualityMetrics,
  getRuleAssetGovernanceWorkbenchReadiness: mocks.getRuleAssetGovernanceWorkbenchReadiness,
}))

vi.mock('@/services/v14231ReadinessApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/v14231ReadinessApi')>('@/services/v14231ReadinessApi')
  return {
    ...actual,
    fetchV14231ActionableSurface: mocks.fetchV14231ActionableSurface,
  }
})

const { default: RuleAssetGovernanceWorkbenchAdmin } = await import('../RuleAssetGovernanceWorkbenchAdmin')

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    const text = container.textContent || ''
    if (expected.every((item) => text.includes(item))) return
  }

  throw new Error(`Timed out waiting for: ${expected.join(', ')}\nCurrent text: ${container.textContent || ''}`)
}

function readClientSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate ${relativePath}`)
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function runtimeRecommendedOptionDraftReport() {
  return {
    source: 'construction_organization_plan_network_draft_read_model',
    companyId: 'company-1',
    projectId: 'project-1',
    totalReviewPackageItems: 0,
    totalDraftCount: 0,
    readyForReplayCount: 0,
    evaluationReadyCount: 0,
    partialEvaluationCount: 0,
    evidenceOnlyCount: 0,
    blockedCount: 0,
    totalEdgeCount: 0,
    totalManualReviewHandoffCount: 0,
    linkedManualReviewHandoffCount: 0,
    totalManualReviewApprovalCount: 0,
    linkedManualReviewApprovalCount: 0,
    totalReleaseExitHandoffCount: 0,
    linkedReleaseExitHandoffCount: 0,
    runtimeRecommendedOption: {
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      draftNetworkKey: 'sha256:ready',
      publicationKey: 'construction-organization-plan-network-release:sha256:ready',
      selectedScenarioIds: ['pile_before_excavation'],
      canAutoAdoptRuntimeOption: false,
      siteDecision: null,
      siteDecisionMatchesRuntimeRecommendation: null,
      recommendationBasis: [
        'runtime_materialization_evidence_ready_for_option',
        'ranked_by_acceleration_recovery_score_after_runtime_evidence_gate',
      ],
      rejectedOptionIds: [],
      rejectedReasonsByOptionId: {},
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
      boundaryPolicy: ['runtime_recommended_option_is_read_only'],
    },
    recommendedDrafts: {
      newProjectPlanning: null,
      startingLineOnboarding: null,
      accelerationRecovery: null,
    },
    optionComparisonPackage: {
      source: 'construction_organization_plan_network_option_comparison_package',
      totalOptionCount: 0,
      recommendedOptionIdsByUseCase: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      canAutoMaterializeSelectedOption: false,
      comparisonBasis: [],
      options: [],
      boundaryPolicy: ['option_comparison_package_is_read_only'],
    },
    items: [],
    boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
  }
}

describe('RuleAssetGovernanceWorkbenchAdmin', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.fetchV14231ActionableSurface.mockImplementation(async (key: string) => ({
      key,
      status: 'stable_action',
      boundaryPolicy: {
        canUseAsStableAction: true,
        writesRuntimePublication: false,
        declaresProductionReady: false,
        requiresLiveEvidenceForUpgrade: false,
      },
    }))
    mocks.getRuleAssetGovernanceWorkbenchReadiness.mockResolvedValue({
      reportCode: 'v14223_rule_asset_governance_workbench_readiness',
      companyId: 'company-1',
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      completionScope: 'workbench_readiness_evidence_only',
      canDeclareV14223GovernanceComplete: false,
      remainingClosureGaps: [{
        key: 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
        status: 'not_proven_by_workbench_readiness',
        evidenceRequired: ['asset_type_domain_writer', 'runtime_consumer_verification'],
        reason: 'A controlled frontend does not prove every domain writer and rollback path.',
      }],
      frontendExposurePolicy: 'backend_admin_governance_only',
      runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report',
      summary: {
        totalAssetCount: 348,
        algorithmSeedCount: 18,
        totalDiscoveredCount: 327,
        registeredCount: 327,
        reviewItemCount: 0,
        blockerCount: 0,
        durationRelatedAssetCount: 208,
        durationRelatedCoverageRatio: 0.6361,
        explicitGovernanceFieldCount: 76,
        conservativeGovernanceDefaultCount: 251,
        governanceDefaultReviewItemCount: 1,
        candidateReviewRequiredCount: 1,
        replayBlockedOrFailedCount: 1,
        sampleHealthWeakOrRejectedCount: 3,
        readyGateCount: 5,
        needsWorkGateCount: 1,
        totalGateCount: 6,
      },
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
      gates: [
        {
          key: 'frontend_admin_operations_page',
          status: 'ready',
          evidenceRefs: ['client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx'],
          missingReasons: [],
        },
        {
          key: 'runtime_asset_isolation_matrix',
          status: 'needs_work',
          evidenceRefs: ['algorithmAssetIsolationMatrixService'],
          missingReasons: ['wbs.template.runtime:runtime_writer_isolation_required'],
        },
        {
          key: 'metric_production_snapshot_publication_rollback_matrix',
          status: 'ready',
          evidenceRefs: ['metricProductionSnapshotPublicationRollbackMatrixService'],
          missingReasons: [],
        },
        {
          key: 'future_asset_rediscovery_gate_rerun_matrix',
          status: 'ready',
          evidenceRefs: ['futureAssetRediscoveryGateRerunMatrixService'],
          missingReasons: [],
        },
        {
          key: 'operable_governance_frontend_matrix',
          status: 'ready',
          evidenceRefs: ['operableGovernanceFrontendMatrixService'],
          missingReasons: [],
        },
        {
          key: 'construction_organization_precision_replay_matrix',
          status: 'ready',
          evidenceRefs: ['constructionOrganizationPrecisionReplayMatrixService'],
          missingReasons: [],
          details: {
            source: 'construction_organization_precision_replay_gate_detail',
            automaticOptionSelectionStatus: 'automatic_option_selection_verified',
            supportedBusinessTypeCount: 11,
            replayedBusinessTypeCount: 11,
            totalUseCaseProofCount: 33,
            verifiedUseCaseProofCount: 33,
            useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
            mismatchReasons: [],
          },
        },
        {
          key: 'construction_organization_product_outcome_closeout_matrix',
          status: 'needs_work',
          evidenceRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService'],
          missingReasons: [],
          details: {
            source: 'construction_organization_product_outcome_closeout_gate_detail',
            status: 'product_outcome_closeout_incomplete',
            supportedBusinessTypeCount: 11,
            precisionReplayReadyBusinessTypeCount: 11,
            runtimeOutcomeReadyBusinessTypeCount: 1,
            missingReasons: [],
            nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
            nextEvidenceOperations: [{
              evidenceAction: 'record_saved_network_outcome_for_business_type',
              operationAction: 'runtime_saved_outcome',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'record_runtime_consumer_observation_for_business_type',
              operationAction: 'runtime_consumer_observation',
              assetType: 'construction_organization_plan_network',
            }],
            nextEvidenceExecutionPlan: [{
              source: 'construction_organization_product_outcome_evidence_execution_plan_item',
              businessType: 'hospital',
              useCase: 'newProjectPlanning',
              evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
              operationAction: 'runtime_engine_evidence',
              assetType: 'construction_organization_plan_network',
              requiredCount: 3,
              currentCount: 1,
              deficit: 2,
            }],
            nextEvidenceWorkPackages: [{
              source: 'construction_organization_product_outcome_evidence_work_package',
              workPackageKey: 'construction_organization_product_outcome:hospital',
              businessType: 'hospital',
              status: 'evidence_work_package_open',
              runtimeEvidenceProjectIds: ['project-hospital'],
              runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
              runtimeEvidenceOptionIds: ['option-hospital'],
              runtimeEvidencePublicationKeys: ['publication-hospital'],
              operationActions: ['runtime_engine_evidence', 'runtime_saved_outcome', 'runtime_consumer_observation'],
              executionSteps: [{
                source: 'construction_organization_product_outcome_evidence_work_package_step',
                workPackageKey: 'construction_organization_product_outcome:hospital',
                businessType: 'hospital',
                useCase: 'newProjectPlanning',
                evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
                operationAction: 'runtime_engine_evidence',
                assetType: 'construction_organization_plan_network',
                requiredCount: 3,
                currentCount: 1,
                deficit: 2,
                runtimeEvidenceProjectIds: ['project-hospital'],
                runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
                runtimeEvidenceOptionIds: ['option-hospital'],
                runtimeEvidencePublicationKeys: ['publication-hospital'],
                canPrefillControlledOperation: true,
              }, {
                source: 'construction_organization_product_outcome_evidence_work_package_step',
                workPackageKey: 'construction_organization_product_outcome:hospital',
                businessType: 'hospital',
                useCase: 'accelerationRecovery',
                evidenceAction: 'record_runtime_consumer_observation_for_business_type',
                operationAction: 'runtime_consumer_observation',
                assetType: 'construction_organization_plan_network',
                requiredCount: 1,
                currentCount: 0,
                deficit: 1,
                runtimeEvidenceProjectIds: ['project-hospital'],
                runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
                runtimeEvidenceOptionIds: ['option-hospital'],
                runtimeEvidencePublicationKeys: ['publication-hospital'],
                canPrefillControlledOperation: true,
              }],
              executionPlanItemCount: 1,
              prefillableExecutionStepCount: 2,
              blockedExecutionStepCount: 0,
              executionReadinessStatus: 'ready_for_controlled_prefill',
              missingRuntimeAnchorReasons: [],
              totalDeficit: 3,
              requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
              boundaryPolicy: ['work_package_does_not_fabricate_runtime_evidence'],
            }],
            nextEvidenceWorkItems: [{
              businessType: 'hospital',
              runtimeEvidenceProjectIds: ['project-hospital'],
              runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
              runtimeEvidenceOptionIds: ['option-hospital'],
              runtimeEvidencePublicationKeys: ['publication-hospital'],
              missingReasons: ['runtime_closeout_claim_by_business_type_required'],
              nextEvidenceActions: [
                'collect_runtime_closeout_claim_for_business_type',
                'resolve_runtime_business_type_attribution_for_business_type',
                'resolve_runtime_business_type_conflict_for_business_type',
              ],
            nextEvidenceOperations: [{
              businessType: 'hospital',
              evidenceAction: 'record_saved_network_outcome_for_business_type',
              operationAction: 'runtime_saved_outcome',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
              operationAction: 'runtime_engine_evidence',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'record_impact_monitoring_for_business_type',
              operationAction: 'runtime_impact_monitoring',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'record_rollback_evidence_for_business_type',
              operationAction: 'runtime_rollback_execution',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'resolve_runtime_business_type_attribution_for_business_type',
              operationAction: 'runtime_recommendation_adopt',
              assetType: 'construction_organization_plan_network',
            }, {
              businessType: 'hospital',
              evidenceAction: 'resolve_runtime_business_type_conflict_for_business_type',
              operationAction: 'runtime_recommendation_adopt',
              assetType: 'construction_organization_plan_network',
            }],
          }],
            businessTypeRows: [
              {
                businessType: 'general_civil',
                status: 'product_outcome_closeout_ready',
                hasPrecisionReplayEvidence: true,
                hasRuntimeCloseoutClaim: true,
                missingReasons: [],
              },
              {
                businessType: 'hospital',
                status: 'product_outcome_closeout_incomplete',
                hasPrecisionReplayEvidence: true,
                hasRuntimeCloseoutClaim: false,
                missingReasons: ['runtime_closeout_claim_by_business_type_required'],
                runtimeEvidenceOptionDeficit: 2,
                runtimeEvidenceRuntimeReadyOptionDeficit: 2,
                runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: 3,
                runtimeReadyUseCaseOptionDeficits: {
                  newProjectPlanning: 2,
                  startingLineOnboarding: 1,
                  accelerationRecovery: 3,
                },
                runtimeReadyUseCaseOptionCloseoutClaimDeficits: {
                  newProjectPlanning: 3,
                  startingLineOnboarding: 2,
                  accelerationRecovery: 3,
                },
                runtimeEvidenceProjectIds: ['project-hospital'],
                runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
                runtimeEvidenceOptionIds: ['option-hospital'],
                runtimeEvidencePublicationKeys: ['publication-hospital'],
                nextEvidenceOperations: [{
                  businessType: 'hospital',
                evidenceAction: 'record_saved_network_outcome_for_business_type',
                operationAction: 'runtime_saved_outcome',
                assetType: 'construction_organization_plan_network',
              }, {
                businessType: 'hospital',
                evidenceAction: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
                operationAction: 'runtime_engine_evidence',
                assetType: 'construction_organization_plan_network',
              }, {
                businessType: 'hospital',
                evidenceAction: 'record_impact_monitoring_for_business_type',
                operationAction: 'runtime_impact_monitoring',
                assetType: 'construction_organization_plan_network',
              }, {
                businessType: 'hospital',
                evidenceAction: 'record_rollback_evidence_for_business_type',
                operationAction: 'runtime_rollback_execution',
                assetType: 'construction_organization_plan_network',
              }],
            },
            ],
          },
        },
      ],
      boundaryPolicy: [
        'workbench_readiness_does_not_grant_publish_rights',
        'dashboard_or_workbench_summary_is_not_runtime_writer_evidence',
        'operable_frontend_does_not_grant_publish_rights',
      ],
    })
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValue({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
      reasons: ['domain_writer_required', 'consumer_verification_required'],
      domainResult: null,
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 0,
      linkedManualReviewHandoffCount: 0,
      totalManualReviewApprovalCount: 0,
      linkedManualReviewApprovalCount: 0,
      totalReleaseExitHandoffCount: 0,
      linkedReleaseExitHandoffCount: 0,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_pending_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 0,
        domainWriterReleaseExitReadinessCount: 0,
        releaseExitHandoffCandidateCount: 0,
        linkedReleaseExitHandoffCount: 0,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 0,
        runtimeConsumerObservationCount: 0,
        readyForRuntimeConsumerObservationCount: 0,
        runtimeImpactMonitoringResultCount: 0,
        readyForRuntimeImpactMonitoringResultCount: 0,
        rollbackExecutionVerificationCount: 0,
        readyForRollbackExecutionVerificationCount: 0,
        savedNetworkOutcomeCount: 0,
        readyForSavedNetworkOutcomeCount: 0,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: ['release_exit_handoff_candidate_event_required'],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: {
          useCase: 'newProjectPlanning',
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          optionScore: 73,
          actionability: 'actionable_candidate',
          e5RecoverableSpanDays: 3,
          recommendationBasis: ['selected_from_plan_network_draft_use_case_evaluation'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesAccelerationDraft: false,
        },
        startingLineOnboarding: null,
        accelerationRecovery: {
          useCase: 'accelerationRecovery',
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          optionScore: 79,
          actionability: 'actionable_candidate',
          e5RecoverableSpanDays: 4,
          recommendationBasis: ['selected_from_plan_network_draft_use_case_evaluation'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesAccelerationDraft: false,
        },
      },
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        totalOptionCount: 1,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: 'option-ready',
          startingLineOnboarding: null,
          accelerationRecovery: 'option-ready',
        },
        canAutoMaterializeSelectedOption: false,
        comparisonBasis: [
          'read_only_plan_network_draft_use_case_evidence',
          'runtime_engine_evidence_gap_by_draft',
        ],
        options: [{
          source: 'construction_organization_plan_network_option_comparison_item',
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          isRecommendedFor: ['newProjectPlanning', 'accelerationRecovery'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          runtimeEngineEvidenceStatus: 'missing_runtime_engine_evidence',
          presentRuntimeEngineCodes: [],
          missingRuntimeEngineCodes: ['E1', 'E3', 'E5'],
          canClaimTruePerOptionRuntimeEvaluation: false,
          useCaseScores: {
            newProjectPlanning: {
              rank: 1,
              optionScore: 73,
              actionability: 'actionable_candidate',
              e5RecoverableSpanDays: 3,
              rankBasis: ['selected_from_plan_network_draft_use_case_evaluation'],
            },
            startingLineOnboarding: null,
            accelerationRecovery: {
              rank: 1,
              optionScore: 79,
              actionability: 'actionable_candidate',
              e5RecoverableSpanDays: 4,
              rankBasis: ['selected_from_plan_network_draft_use_case_evaluation'],
            },
          },
          proposedDependencyEdgeCount: 1,
          nextGovernanceAction: 'manual_review_handoff',
          nextGovernanceReasons: ['ready_for_manual_review_handoff'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesAccelerationDraft: false,
        }],
        boundaryPolicy: ['option_comparison_package_is_read_only'],
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:ready',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-ready',
        optionId: 'option-ready',
        selectedScenarioIds: ['pile_before_excavation'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [{
          edgeId: 'edge-1',
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          fromVirtualNodeId: 'foundation-work',
          toVirtualNodeId: 'earthwork-work',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 30 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: null,
        manualReviewApproval: null,
        releaseExitHandoff: null,
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'manual_review_handoff_required',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:ready',
          handoffCandidateEventId: null,
          approvalCandidateEventId: null,
          requiredBeforeRuntime: ['manual_review_handoff_required'],
          reasons: ['manual_review_handoff_required'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: null,
        domainWriterReleaseExitReadiness: null,
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })
    mocks.getStructuredCauseQualityMetrics.mockResolvedValue({
      companyId: 'company-1',
      projectId: 'project-1',
      policy: {
        minimumSampleCount: 20,
        otherRateRevisionThresholdPercent: 20,
        prefillModificationRateRevisionThresholdPercent: 30,
      },
      otherRate: {
        metricKey: 'structured_cause_other_rate',
        numerator: 6,
        denominator: 25,
        value: 24,
        availability: 'ready',
      },
      prefillModificationRate: {
        metricKey: 'structured_cause_prefill_modification_rate',
        numerator: 7,
        denominator: 20,
        value: 35,
        availability: 'ready',
      },
      revisionSignals: [
        {
          candidateType: 'taxonomy_revision',
          reasonCode: 'structured_cause_other_rate_above_threshold',
          metricKey: 'structured_cause_other_rate',
          observedPercent: 24,
          thresholdPercent: 20,
          sampleCount: 25,
        },
        {
          candidateType: 'inference_rule_revision',
          reasonCode: 'structured_cause_prefill_modification_rate_above_threshold',
          metricKey: 'structured_cause_prefill_modification_rate',
          observedPercent: 35,
          thresholdPercent: 30,
          sampleCount: 20,
        },
      ],
    })
  })

  it('keeps an explicit link to the unified duration assets published tab', () => {
    expect(readClientSource('src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx')).toContain('/admin/duration-assets?tab=published')
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  it('renders a backend-admin controlled workbench with gate evidence and operation blockers', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '规则资产治理工作台',
      '后台治理入口',
      '348',
      '18',
      '工期相关',
      '63.61%',
      '四元字段',
      '76',
      '保守默认',
      '251',
      'durationContextPolicyLearningService',
      'context_factor',
      'frontend_admin_operations_page',
      'runtime_asset_isolation_matrix',
      '指标闭环矩阵',
      'metric_production_snapshot_publication_rollback_matrix',
      '未来资产重跑门禁',
      'future_asset_rediscovery_gate_rerun_matrix',
      '可操作前端矩阵',
      'operable_governance_frontend_matrix',
      '施工组织精度回放',
      '自动择优 33/33',
      '11/11 业态',
      '施工组织结果闭口',
      '结果闭口 1/11 业态',
      '已闭口业态 general_civil',
      '缺口业态 hospital',
      '下一步补证 收集运行闭口证据、补齐业态归因、处理业态冲突',
      '受控操作 hospital/runtime_saved_outcome',
      'hospital/runtime_engine_evidence',
      'hospital/runtime_impact_monitoring',
      '等 6 项',
      '证据项目 hospital/project-hospital',
      '补证清单 hospital/project-hospital',
      '发布锚点 hospital/publication-hospital',
      'A/B/C 缺口 hospital: 运行网络缺 2，运行就绪缺 2，采纳闭口缺 3',
      '入口缺口 hospital: 新建项目缺 2/采纳缺 3，起跑线缺 1/采纳缺 2，赶工恢复缺 3/采纳缺 3',
      '执行队列 hospital/新建项目/补齐入口 A/B/C 运行证据 缺 2',
      '证据工作包 hospital/证据工作包缺 3',
      '包内步骤 hospital/新建项目/runtime_engine_evidence 缺 2',
      '包执行状态 hospital/可预填 2/阻断 0/ready_for_controlled_prefill',
      'product_outcome_closeout_incomplete',
      'runtime_writer_isolation_required',
      '剩余闭环缺口',
      'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
      'asset_type_domain_writer',
      '不写 runtime',
      '施工组织草案池',
      'option-ready',
      '可送审',
      '候选方案对比包',
      '新建项目 #1 · 73分',
      '赶工恢复 #1 · 79分 · 可恢复 4 天',
      '缺运行证据 E1 / E3 / E5',
      '下一步：manual_review_handoff',
      '受控操作交接',
      '提交受控操作',
    ])

    const evidenceTokenInput = container.querySelector<HTMLInputElement>('input[name="evidenceToken"]')
    if (!evidenceTokenInput) throw new Error('Missing evidence token input')

    await act(async () => {
      setInputValue(evidenceTokenInput, 'manual-admin-evidence-1')
    })

    const operationButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /提交受控操作/.test(button.textContent || ''),
    )
    if (!operationButton) throw new Error('Missing controlled operation button')

    await act(async () => {
      operationButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      evidenceToken: 'manual-admin-evidence-1',
    }))
    await waitForText(container, [
      'operation_blocked',
      'domain_writer_required',
      'consumer_verification_required',
      'workbench_operation_does_not_grant_publish_rights',
    ])

    const publishButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
      /发布|回滚|批准/.test(button.textContent || '')
        && !/填入补证操作/.test(button.textContent || ''),
    )
    expect(publishButtons).toHaveLength(0)
  })

  it('does not list raw runtime closeout evidence as a completed product outcome closeout', async () => {
    const baseReport = await mocks.getRuleAssetGovernanceWorkbenchReadiness()
    mocks.getRuleAssetGovernanceWorkbenchReadiness.mockResolvedValueOnce({
      ...baseReport,
      gates: baseReport.gates.map((gate: any) => {
        if (gate.key !== 'construction_organization_product_outcome_closeout_matrix') return gate
        return {
          ...gate,
          details: {
            ...gate.details,
            runtimeOutcomeReadyBusinessTypeCount: 0,
            businessTypeRows: [{
              businessType: 'general_civil',
              status: 'product_outcome_closeout_incomplete',
              hasPrecisionReplayEvidence: true,
              hasRuntimeCloseoutClaimEvidence: true,
              hasRuntimeCloseoutClaim: false,
              missingReasons: ['runtime_ready_option_closeout_claim_coverage_required'],
            }],
          },
        }
      }),
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '结果闭口 0/11 业态',
      '缺口业态 general_civil',
      'product_outcome_closeout_incomplete',
    ])
    expect(container.textContent).not.toContain('已闭口业态 general_civil')
  })

  it('prefills a controlled operation from product outcome next-evidence work items without submitting', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '补证清单 hospital/project-hospital',
      '发布锚点 hospital/publication-hospital',
    ])

    const fillButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作/.test(button.textContent || ''),
    )
    if (!fillButton) throw new Error('Missing next-evidence work item fill button')

    await act(async () => {
      fillButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_saved_outcome')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-release-record-target')?.value)
      .toBe('construction-organization-plan-network-outcome:publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-domain-writer')?.value)
      .toBe('constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-org-product-outcome:hospital:runtime_saved_outcome:publication-hospital')
  })

  it('renders backend operation suggestions and prefills the exact suggestion payload without submitting', async () => {
    const baseReport = await mocks.getRuleAssetGovernanceWorkbenchReadiness()
    mocks.getRuleAssetGovernanceWorkbenchReadiness.mockResolvedValueOnce({
      ...baseReport,
      gates: baseReport.gates.map((gate: any) => {
        if (gate.key !== 'construction_organization_product_outcome_closeout_matrix') return gate
        return {
          ...gate,
          details: {
            ...gate.details,
            workbenchOperationSuggestionReport: {
              source: 'construction_organization_closeout_workbench_operation_suggestion_report',
              status: 'controlled_operation_suggestions_available',
              suggestionCount: 2,
              submittableSuggestionCount: 1,
              blockedSuggestionCount: 1,
              suggestions: [{
                source: 'construction_organization_closeout_workbench_operation_suggestion',
                action: 'runtime_consumer_observation',
                businessType: 'hospital',
                workPackageKey: 'construction_organization_product_outcome:hospital',
                useCase: null,
                evidenceAction: 'record_runtime_consumer_observation_for_business_type',
                engineCode: null,
                canSubmitControlledOperation: true,
                missingRequiredFields: [],
                operationPayload: {
                  action: 'runtime_consumer_observation',
                  assetType: 'construction_organization_plan_network',
                  evidenceToken: 'construction-organization-closeout:hospital:runtime_consumer_observation:publication-hospital-recommended:draft-hospital-recommended',
                  workPackageKey: 'construction_organization_product_outcome:hospital',
                  useCase: null,
                  evidenceAction: 'record_runtime_consumer_observation_for_business_type',
                  businessType: 'hospital',
                  companyId: 'company-1',
                  projectId: 'project-hospital',
                  requestedByUserId: 'user-admin',
                  domainWriterKey: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
                  sourcePublicationKey: 'publication-hospital-recommended',
                  optionId: 'option-hospital-recommended',
                  draftNetworkKey: 'draft-hospital-recommended',
                  releaseRecordTarget: 'option-hospital-recommended',
                  rollbackTarget: 'draft-hospital-recommended',
                  executedAt: '2026-06-24T12:00:00.000Z',
                  consumerVerificationRefs: [
                    'constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkPackages',
                    'constructionOrganizationProductOutcome:hospital',
                  ],
                  impactMonitoringRefs: ['constructionOrganizationPlanNetworkRuntimeEvidenceJob.impactMonitoring'],
                  rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
                  selectedScenarioIds: ['pile_before_excavation', 'tower_early_release'],
                },
                bridgeMutationBoundary: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesBaseline: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
                boundaryPolicy: ['operation_suggestion_is_prefill_only'],
              }, {
                source: 'construction_organization_closeout_workbench_operation_suggestion',
                action: 'runtime_engine_evidence',
                businessType: 'hospital',
                workPackageKey: 'construction_organization_product_outcome:hospital',
                useCase: null,
                evidenceAction: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
                engineCode: 'critical_path_cpm',
                canSubmitControlledOperation: false,
                missingRequiredFields: ['predictedDurationDays', 'actualDurationDays'],
                operationPayload: {
                  action: 'runtime_engine_evidence',
                  assetType: 'construction_organization_plan_network',
                  evidenceToken: 'construction-organization-closeout:hospital:runtime_engine_evidence:critical_path_cpm:publication-hospital-recommended:draft-hospital-recommended',
                  workPackageKey: 'construction_organization_product_outcome:hospital',
                  evidenceAction: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
                  businessType: 'hospital',
                  companyId: 'company-1',
                  projectId: 'project-hospital',
                  domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
                  sourcePublicationKey: 'publication-hospital-recommended',
                  optionId: 'option-hospital-recommended',
                  draftNetworkKey: 'draft-hospital-recommended',
                  engineCode: 'critical_path_cpm',
                },
                bridgeMutationBoundary: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesSeed: false,
                  writesBaseline: false,
                  writesCriticalPathFacts: false,
                  writesAccelerationDraft: false,
                },
                boundaryPolicy: ['operation_suggestion_is_prefill_only'],
              }],
              bridgeMutationBoundary: {
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesSeed: false,
                writesBaseline: false,
                writesCriticalPathFacts: false,
                writesAccelerationDraft: false,
              },
              boundaryPolicy: ['operation_suggestion_does_not_execute_workbench_operations'],
            },
          },
        }
      }),
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '建议桥 controlled_operation_suggestions_available',
      '填入建议 hospital/记录消费观察',
      '缺字段 predictedDurationDays、actualDurationDays',
    ])

    const blockedSuggestionButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入建议 hospital\/补齐 E1\/E3\/E5 运行证据\/critical_path_cpm/.test(button.textContent || ''),
    )
    expect(blockedSuggestionButton).toBeTruthy()
    expect(blockedSuggestionButton?.hasAttribute('disabled')).toBe(true)

    const fillSuggestionButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入建议 hospital\/记录消费观察/.test(button.textContent || ''),
    )
    if (!fillSuggestionButton) throw new Error('Missing operation suggestion prefill button')

    await act(async () => {
      fillSuggestionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_consumer_observation')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-organization-closeout:hospital:runtime_consumer_observation:publication-hospital-recommended:draft-hospital-recommended')
    expect(container.querySelector<HTMLInputElement>('#operation-company-id')?.value).toBe('company-1')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-requested-by-user-id')?.value).toBe('user-admin')
    expect(container.querySelector<HTMLInputElement>('#operation-executed-at')?.value).toBe('2026-06-24T12:00:00.000Z')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value)
      .toBe('publication-hospital-recommended')
    expect(container.querySelector<HTMLInputElement>('#operation-option-id')?.value).toBe('option-hospital-recommended')
    expect(container.querySelector<HTMLInputElement>('#operation-draft-network-key')?.value).toBe('draft-hospital-recommended')
    expect(container.querySelector<HTMLInputElement>('#operation-release-record-target')?.value).toBe('option-hospital-recommended')
    expect(container.querySelector<HTMLInputElement>('#operation-rollback-target')?.value).toBe('draft-hospital-recommended')
    expect(container.querySelector<HTMLTextAreaElement>('#operation-consumer-refs')?.value)
      .toContain('constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkPackages')
    expect(container.querySelector<HTMLTextAreaElement>('#operation-selected-scenario-ids')?.value)
      .toBe('pile_before_excavation\ntower_early_release')
  })

  it('shows every controlled operation for a product outcome work item as a separate prefill action', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '填入补证操作 hospital/记录保存结果',
      '填入补证操作 hospital/补齐 E1/E3/E5 运行证据',
      '填入补证操作 hospital/记录影响监测',
      '填入补证操作 hospital/记录回滚证据',
    ])
    expect(container.textContent).not.toContain('填入补证操作 hospital/补齐业态归因')
    expect(container.textContent).not.toContain('填入补证操作 hospital/处理业态冲突')

    const engineButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作 hospital\/补齐 E1\/E3\/E5 运行证据/.test(button.textContent || ''),
    )
    if (!engineButton) throw new Error('Missing runtime engine evidence prefill button')

    await act(async () => {
      engineButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_engine_evidence')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-domain-writer')?.value)
      .toBe('constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital')
    expect(container.querySelector<HTMLSelectElement>('#operation-engine-code')?.value).toBe('critical_path_cpm')
    expect(container.querySelector<HTMLInputElement>('#operation-engine-duration')?.value).toBe('1')
    expect(container.querySelector<HTMLInputElement>('input[name="actualDurationDays"]')?.value).toBe('1')
  })

  it('prefills a controlled operation from product outcome execution plan items without submitting', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '执行队列 hospital/新建项目/补齐入口 A/B/C 运行证据 缺 2',
      '填入执行队列 hospital/新建项目/补齐入口 A/B/C 运行证据/E1',
      '填入执行队列 hospital/新建项目/补齐入口 A/B/C 运行证据/E3',
      '填入执行队列 hospital/新建项目/补齐入口 A/B/C 运行证据/E5',
    ])

    const executionPlanButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入执行队列 hospital\/新建项目\/补齐入口 A\/B\/C 运行证据\/E1/.test(button.textContent || ''),
    )
    if (!executionPlanButton) throw new Error('Missing execution-plan prefill button')

    await act(async () => {
      executionPlanButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_engine_evidence')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-domain-writer')?.value)
      .toBe('constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital')
    expect(container.querySelector<HTMLSelectElement>('#operation-engine-code')?.value).toBe('standard_duration_reference')
  })

  it('prefills a controlled operation from product outcome evidence work-package steps without submitting', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '包内步骤 hospital/新建项目/runtime_engine_evidence 缺 2',
      '填入工作包步骤 hospital/新建项目/runtime_engine_evidence/E1',
      '填入工作包步骤 hospital/新建项目/runtime_engine_evidence/E3',
      '填入工作包步骤 hospital/新建项目/runtime_engine_evidence/E5',
    ])

    const packageStepButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入工作包步骤 hospital\/新建项目\/runtime_engine_evidence\/E5/.test(button.textContent || ''),
    )
    if (!packageStepButton) throw new Error('Missing work-package step prefill button')

    await act(async () => {
      packageStepButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_engine_evidence')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-domain-writer')?.value)
      .toBe('constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital')
    expect(container.querySelector<HTMLSelectElement>('#operation-engine-code')?.value).toBe('schedule_acceleration_target')
  })

  it('prefills runtime consumer observation from product outcome work-package steps without treating it as engine evidence', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      'hospital/赶工恢复/runtime_consumer_observation 缺 1',
      '填入工作包步骤 hospital/赶工恢复/runtime_consumer_observation-',
    ])

    const packageStepButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入工作包步骤 hospital\/赶工恢复\/runtime_consumer_observation/.test(button.textContent || ''),
    )
    if (!packageStepButton) throw new Error('Missing runtime consumer observation work-package step prefill button')

    await act(async () => {
      packageStepButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_consumer_observation')
    expect(container.querySelector<HTMLSelectElement>('#operation-asset-type')?.value).toBe('construction_organization_plan_network')
    expect(container.querySelector<HTMLInputElement>('#operation-business-type')?.value).toBe('hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-domain-writer')?.value)
      .toBe('durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts')
    expect(container.querySelector<HTMLInputElement>('#operation-evidence-token')?.value)
      .toBe('construction-org-product-outcome:hospital:runtime_consumer_observation:publication-hospital')
  })

  it('submits product outcome work-package lineage with the controlled operation payload', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      reasons: [],
      domainResult: {
        status: 'runtime_engine_evidence_recorded',
        engineCode: 'schedule_acceleration_target',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: ['workbench_never_writes_runtime_directly'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '填入工作包步骤 hospital/新建项目/runtime_engine_evidence/E5',
      '提交受控操作',
    ])

    const packageStepButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入工作包步骤 hospital\/新建项目\/runtime_engine_evidence\/E5/.test(button.textContent || ''),
    )
    if (!packageStepButton) throw new Error('Missing work-package step prefill button')

    await act(async () => {
      packageStepButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /提交受控操作/.test(button.textContent || ''),
    )
    if (!submitButton) throw new Error('Missing controlled operation submit button')

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_engine_evidence:publication-hospital',
      workPackageKey: 'construction_organization_product_outcome:hospital',
      useCase: 'newProjectPlanning',
      evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
      businessType: 'hospital',
      projectId: 'project-hospital',
      sourcePublicationKey: 'publication-hospital',
      engineCode: 'schedule_acceleration_target',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    }))
  })

  it('does not prefill recommendation adoption for product outcome attribution projection gaps', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '施工组织结果闭口',
    ])

    const attributionButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作 hospital\/补齐业态归因/.test(button.textContent || ''),
    )

    expect(attributionButton).toBeUndefined()
    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('release_exit_handoff')
  })

  it('prefills monitoring and rollback evidence requirements from product outcome work items', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '填入补证操作 hospital/记录影响监测',
      '填入补证操作 hospital/记录回滚证据',
    ])

    const monitoringButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作 hospital\/记录影响监测/.test(button.textContent || ''),
    )
    if (!monitoringButton) throw new Error('Missing runtime impact monitoring prefill button')

    await act(async () => {
      monitoringButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_impact_monitoring')
    expect(container.querySelector<HTMLInputElement>('#operation-project-id')?.value).toBe('project-hospital')
    expect(container.querySelector<HTMLInputElement>('#operation-source-publication')?.value).toBe('publication-hospital')
    expect(container.querySelector<HTMLTextAreaElement>('#operation-consumer-refs')?.value)
      .toBe('constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkItems')
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="impactMonitoringRefs"]')?.value)
      .toBe('constructionOrganizationPlanNetworkRuntimeEvidenceService.impactMonitoring')

    const rollbackButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作 hospital\/记录回滚证据/.test(button.textContent || ''),
    )
    if (!rollbackButton) throw new Error('Missing runtime rollback execution prefill button')

    await act(async () => {
      rollbackButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('#operation-action')?.value).toBe('runtime_rollback_execution')
    expect(container.querySelector<HTMLInputElement>('#operation-rollback-target')?.value)
      .toBe('construction-organization-plan-network-rollback:publication-hospital')
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="rollbackWriterRefs"]')?.value)
      .toBe('constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft')
    expect(container.querySelector<HTMLTextAreaElement>('#operation-rollback-reason')?.value)
      .toBe('product outcome closeout rollback evidence for hospital/publication-hospital')
  })

  it('refreshes readiness and plan-network drafts after a delegated product outcome evidence operation is submitted', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      reasons: [],
      domainResult: {
        status: 'saved_network_outcome_recorded',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '填入补证操作 hospital/记录保存结果',
      '提交受控操作',
    ])
    expect(mocks.getRuleAssetGovernanceWorkbenchReadiness).toHaveBeenCalledTimes(1)
    expect(mocks.getConstructionOrganizationPlanNetworkDrafts).toHaveBeenCalledTimes(1)

    const fillButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /填入补证操作 hospital\/记录保存结果/.test(button.textContent || ''),
    )
    if (!fillButton) throw new Error('Missing runtime saved outcome prefill button')

    await act(async () => {
      fillButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /提交受控操作/.test(button.textContent || ''),
    )
    if (!submitButton) throw new Error('Missing controlled operation submit button')

    await act(async () => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      businessType: 'hospital',
      projectId: 'project-hospital',
      sourcePublicationKey: 'publication-hospital',
      releaseRecordTarget: 'construction-organization-plan-network-outcome:publication-hospital',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      evidenceToken: 'construction-org-product-outcome:hospital:runtime_saved_outcome:publication-hospital',
    }))
    expect(mocks.getRuleAssetGovernanceWorkbenchReadiness).toHaveBeenCalledTimes(2)
    expect(mocks.getConstructionOrganizationPlanNetworkDrafts).toHaveBeenCalledTimes(2)
  })

  it('shows runtime-ready construction organization evidence without presenting it as a blocker', async () => {
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValue({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 2,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_candidate_only_after_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 1,
        linkedReleaseExitHandoffCount: 1,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 1,
        runtimeConsumerObservationCount: 1,
        readyForRuntimeConsumerObservationCount: 1,
        runtimeImpactMonitoringResultCount: 1,
        readyForRuntimeImpactMonitoringResultCount: 1,
        rollbackExecutionVerificationCount: 1,
        readyForRollbackExecutionVerificationCount: 1,
        savedNetworkOutcomeCount: 1,
        readyForSavedNetworkOutcomeCount: 1,
        perOptionRuntimeEngineEvidenceCount: 3,
        readyForPerOptionRuntimeEngineEvidenceCount: 1,
        missingBeforeRuntime: [],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      runtimeCloseoutClaim: {
        source: 'construction_organization_plan_network_runtime_closeout_claim',
        status: 'runtime_closeout_claim_ready',
        canClaimRuntimeCloseout: true,
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        claimBasis: [
          'release_exit_handoff_linked_for_every_draft',
          'domain_writer_runtime_publication_linked_for_every_draft',
          'runtime_consumer_observation_linked_for_every_draft',
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
        boundaryPolicy: ['runtime_closeout_claim_is_a_read_only_audit_projection'],
      },
      runtimeRecommendedOption: {
        source: 'construction_organization_plan_network_runtime_recommended_option',
        status: 'runtime_recommended_option_ready',
        optionId: 'option-ready',
        draftNetworkKey: 'sha256:ready',
        publicationKey: 'construction-organization-plan-network-release:sha256:ready',
        selectedScenarioIds: ['pile_before_excavation'],
        canAutoAdoptRuntimeOption: false,
        recommendationBasis: [
          'runtime_materialization_evidence_ready_for_option',
          'saved_network_outcome:accepted',
          'ranked_by_acceleration_recovery_score_after_runtime_evidence_gate',
        ],
        rejectedOptionIds: ['option-alternate'],
        rejectedReasonsByOptionId: {
          'option-alternate': ['runtime_consumer_observation_required'],
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_recommended_option_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        totalOptionCount: 1,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: 'option-ready',
          startingLineOnboarding: 'option-ready',
          accelerationRecovery: 'option-ready',
        },
        canAutoMaterializeSelectedOption: false,
        comparisonBasis: ['runtime_engine_evidence_gap_by_draft'],
        options: [{
          source: 'construction_organization_plan_network_option_comparison_item',
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          runtimeEngineEvidenceStatus: 'runtime_engine_evidence_ready',
          presentRuntimeEngineCodes: ['E1', 'E3', 'E5'],
          missingRuntimeEngineCodes: [],
          canClaimTruePerOptionRuntimeEvaluation: true,
          useCaseScores: {
            newProjectPlanning: null,
            startingLineOnboarding: null,
            accelerationRecovery: null,
          },
          proposedDependencyEdgeCount: 2,
          nextGovernanceAction: 'runtime_engine_evidence_ready',
          nextGovernanceReasons: [
            'true_per_option_runtime_e1_e3_e5_evidence_ready',
            'runtime_materialization_boundary_remains_read_only',
          ],
          runtimeMaterializationEvidence: {
            source: 'construction_organization_plan_network_option_runtime_materialization_evidence',
            status: 'missing_runtime_evidence',
            publicationKey: 'construction-organization-plan-network-release:sha256:ready',
            runtimeUseCases: ['newProjectPlanning'],
            runtimeUseCaseCoverage: {
              newProjectPlanning: {
                hasRuntimeConsumerObservation: true,
                hasImpactMonitoringResult: true,
                hasRollbackExecutionVerification: true,
                hasSavedNetworkOutcome: true,
                hasRuntimeEngineEvidence: true,
                canClaimRuntimeUseCaseEvidence: true,
              },
              accelerationRecovery: {
                hasRuntimeConsumerObservation: true,
                hasImpactMonitoringResult: true,
                hasRollbackExecutionVerification: true,
                hasSavedNetworkOutcome: true,
                hasRuntimeEngineEvidence: false,
                canClaimRuntimeUseCaseEvidence: false,
              },
            },
            missingBeforeRuntime: [
              'runtime_consumer_observation_required',
              'post_materialization_impact_monitoring_result_required',
              'rollback_execution_verification_required',
              'saved_network_outcome_required',
            ],
            hasReleaseExitHandoff: true,
            hasRuntimePublication: true,
            hasRuntimeConsumerObservation: false,
            hasImpactMonitoringResult: false,
            hasRollbackExecutionVerification: false,
            hasSavedNetworkOutcome: false,
            hasRuntimeEngineEvidence: true,
            canClaimRuntimeMaterializationEvidence: false,
            boundaryPolicy: ['option_runtime_materialization_evidence_is_read_only'],
          },
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesAccelerationDraft: false,
        }],
        boundaryPolicy: ['option_comparison_package_is_read_only'],
      },
      items: [],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '候选方案对比包',
      'option-ready',
      '运行证据已齐',
      '缺运行物化证据 消费观测 / 影响监控 / 回滚验证 / 保存结果',
      '新建项目运行入口已齐',
      '赶工恢复缺三引擎回测',
      '下一步：runtime_materialization_evidence_required',
      '运行期物化：已交接候选但仍阻断',
      '运行闭环声明：运行证据与站点采纳已齐，可作为产品声明依据',
      '运行推荐方案：option-ready',
      '站点决策：暂无采纳或拒绝记录',
      '采纳推荐方案',
      '不采纳',
    ])
  })

  it('lets admins explicitly adopt a runtime recommended construction organization option without auto materializing it', async () => {
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce(runtimeRecommendedOptionDraftReport())
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      reasons: [],
      domainResult: {
        status: 'recommendation_decision_recorded',
        actionType: 'adopted',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '运行推荐方案：option-ready',
      '站点决策：暂无采纳或拒绝记录',
      '采纳推荐方案',
      '不采纳',
    ])

    const adoptButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /采纳推荐方案/.test(button.textContent || ''),
    )
    if (!adoptButton) throw new Error('Missing runtime recommendation adopt button')

    await act(async () => {
      adoptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      companyId: 'company-1',
      projectId: 'project-1',
      evidenceToken: 'construction-org-runtime-recommendation:runtime_recommendation_adopt:option-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:ready',
      optionId: 'option-ready',
      draftNetworkKey: 'sha256:ready',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'sha256:ready',
      selectedScenarioIds: ['pile_before_excavation'],
      consumerVerificationRefs: [
        'constructionOrganizationPlanNetworkDraftService.runtimeRecommendedOption',
        'constructionOrganizationPlanNetworkRuntimeEvidenceService.recommendationDecision',
      ],
    }))
    await waitForText(container, ['operation_delegated', 'recordRecommendationDecision'])
  })

  it('lets admins explicitly decline a runtime recommended construction organization option without auto materializing it', async () => {
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce(runtimeRecommendedOptionDraftReport())
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_decline',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      reasons: [],
      domainResult: {
        status: 'recommendation_decision_recorded',
        actionType: 'declined',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '运行推荐方案：option-ready',
      '站点决策：暂无采纳或拒绝记录',
      '采纳推荐方案',
      '不采纳',
    ])

    const declineButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /不采纳/.test(button.textContent || ''),
    )
    if (!declineButton) throw new Error('Missing runtime recommendation decline button')

    await act(async () => {
      declineButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_recommendation_decline',
      assetType: 'construction_organization_plan_network',
      companyId: 'company-1',
      projectId: 'project-1',
      evidenceToken: 'construction-org-runtime-recommendation:runtime_recommendation_decline:option-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:ready',
      releaseRecordTarget: 'option-ready',
      rollbackTarget: 'sha256:ready',
      selectedScenarioIds: ['pile_before_excavation'],
      consumerVerificationRefs: [
        'constructionOrganizationPlanNetworkDraftService.runtimeRecommendedOption',
        'constructionOrganizationPlanNetworkRuntimeEvidenceService.recommendationDecision',
      ],
    }))
    await waitForText(container, ['operation_delegated', 'recordRecommendationDecision'])
  })

  it('gates construction organization publication without disabling stable evidence actions', async () => {
    mocks.fetchV14231ActionableSurface.mockImplementation(async (key: string) => {
      const publicationGated = [
        'construction_organization_runtime_publication_action',
        'rule_asset_stable_publication_action',
        'rule_asset_template_replacement_action',
      ].includes(key)
      return {
        key,
        status: publicationGated ? 'needs-gating' : 'stable_action',
        permissionGate: 'action-specific permission and evidence required',
        boundaryPolicy: {
          canUseAsStableAction: !publicationGated,
          writesRuntimePublication: false,
          declaresProductionReady: false,
          requiresLiveEvidenceForUpgrade: publicationGated,
        },
      }
    })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce(runtimeRecommendedOptionDraftReport())

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      '运行推荐方案：option-ready',
      '采纳推荐方案',
      '不采纳',
      '提交受控操作',
    ])

    const actionSelect = container.querySelector<HTMLSelectElement>('select[name="action"]')
    if (!actionSelect) throw new Error('Missing action select')

    await act(async () => {
      actionSelect.value = 'runtime_apply'
      actionSelect.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    const adoptButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /采纳推荐方案/.test(button.textContent || ''),
    )
    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /提交受控操作/.test(button.textContent || ''),
    )
    if (!adoptButton || !submitButton) throw new Error('Missing guarded operation buttons')

    expect(adoptButton.disabled).toBe(false)
    expect(submitButton.disabled).toBe(true)

    await act(async () => {
      adoptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledTimes(1)
    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_recommendation_adopt',
    }))
  })

  it('consumes project cause-quality metrics as read-only taxonomy and inference-rule candidates', async () => {
    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })
    await waitForText(container, ['规则资产治理工作台', '施工组织草案池'])
    expect(mocks.getStructuredCauseQualityMetrics).not.toHaveBeenCalled()

    const projectInput = container.querySelector('#construction-organization-draft-project') as HTMLInputElement
    await act(async () => {
      setInputValue(projectInput, 'project-1')
      await flush()
    })

    await waitForText(container, [
      '归因质量',
      '其他项占比 24.00%',
      '预填修改率 35.00%',
      '建议修订原因分类',
      '建议修订推断规则',
    ])
    expect(mocks.getStructuredCauseQualityMetrics).toHaveBeenCalledWith('project-1')
    expect(container.textContent).not.toContain('自动改写历史归因')
  })

  it('lets admins send a ready construction organization draft to manual review without pasting JSON', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      reasons: [],
      domainResult: { status: 'manual_review_handoff_ready' },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, ['施工组织草案池', 'option-ready', '送人工审阅'])

    const reviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /送人工审阅/.test(button.textContent || ''),
    )
    if (!reviewButton) throw new Error('Missing manual review handoff button')

    await act(async () => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-manual-review:sha256:ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.evaluationEvidence',
      ],
      constructionOrganizationPlanNetworkDraft: expect.objectContaining({
        draftNetworkKey: 'sha256:ready',
        readiness: 'ready_for_replay',
      }),
    }))
    await waitForText(container, ['operation_delegated', 'manualReviewHandoff'])
  })

  it('lets admins approve construction organization conflict review before manual review approval', async () => {
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      ...runtimeRecommendedOptionDraftReport(),
      totalDraftCount: 1,
      evaluationReadyCount: 1,
      totalEdgeCount: 1,
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:conflict',
        candidateEventId: 'candidate-conflict',
        assetKey: 'construction_organization.plan_option.option-conflict',
        optionId: 'option-conflict',
        businessType: 'general_civil',
        selectedScenarioIds: ['pile_before_excavation'],
        readiness: 'conflict_review_required',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [
          'candidate_network_conflicts_with_current_generated_row_dates',
          'requires_manual_conflict_review_before_replay',
        ],
        edges: [{
          edgeId: 'edge-conflict-1',
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          fromVirtualNodeId: 'foundation_pile',
          toVirtualNodeId: 'foundation_earthwork',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: {},
          e3: {},
          e5: {},
          evidenceGaps: [],
          boundaryPolicy: ['candidate_only'],
        },
        reviewPackageStatus: 'review_required',
        reviewRequired: true,
        manualConflictReviewPackage: {
          source: 'construction_organization_plan_network_manual_conflict_review_package',
          status: 'manual_conflict_review_required',
          reviewPrompt: '候选施工组织关系与当前生成计划日期存在冲突，需要人工确认。',
          reviewChecklist: [
            '核对候选依赖是否符合当前施工组织方案和现场业务顺序。',
            '确认批准后仍只是进入 ready_for_replay，不会直接写入真实依赖或计划日期。',
          ],
          conflictReasonCodes: [
            'candidate_network_conflicts_with_current_generated_row_dates',
            'requires_manual_conflict_review_before_replay',
          ],
          proposedDependencyEdgeCount: 1,
          sampleProposedDependencyEdges: [{
            edgeId: 'edge-conflict-1',
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation_pile',
            toVirtualNodeId: 'foundation_earthwork',
            operation: 'propose_create_dependency',
            writesTaskDependencies: false,
          }],
          conflictEvidenceCount: 1,
          sampleConflictEvidence: [{
            edgeId: 'edge-conflict-1',
            fromGeneratedRowId: 'row-foundation',
            toGeneratedRowId: 'row-earthwork',
            dependencyType: 'FS',
            lagDays: 0,
            intent: 'pile_before_earthwork_bulk_excavation',
            fromVirtualNodeId: 'foundation_pile',
            toVirtualNodeId: 'foundation_earthwork',
            reason: 'fs_predecessor_finishes_after_successor_start',
            fromWindow: {
              startDay: 10,
              finishDay: 20,
              plannedStartDate: '2026-01-10',
              plannedEndDate: '2026-01-20',
            },
            toWindow: {
              startDay: 12,
              finishDay: 18,
              plannedStartDate: '2026-01-12',
              plannedEndDate: '2026-01-18',
            },
            writesTaskDependencies: false,
            writesPlanDates: false,
          }],
          allowedDecisions: ['approved_ready_for_replay', 'rejected_needs_plan_date_adjustment'],
          recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['manual_conflict_review_package_is_read_only'],
        },
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-1',
          assetKey: 'construction_organization.plan_network_handoff.option-conflict',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService',
          eventStatus: 'manual_review_handoff_ready',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          draftNetworkKey: 'sha256:conflict',
          originalCandidateEventId: 'candidate-conflict',
          optionId: 'option-conflict',
          selectedScenarioIds: ['pile_before_excavation'],
          requestedByUserId: null,
          executedAt: null,
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        manualConflictReviewDecision: null,
        manualReviewApproval: null,
        releaseExitHandoff: null,
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          draftNetworkKey: 'sha256:conflict',
          status: 'release_exit_blocked',
          canPrepareReleaseExit: false,
          requiredBeforeRuntime: ['manual_review_approval_required'],
          reasons: ['manual_review_approval_required'],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
          boundaryPolicy: ['release_exit_required'],
        },
        releaseExitPreparation: null,
        domainWriterReleaseExitReadiness: null,
        runtimeEngineEvidence: {
          source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
          status: 'runtime_engine_evidence_missing',
          publicationKey: null,
          presentEngineCodes: [],
          missingEngineCodes: ['standard_duration_reference', 'critical_path_cpm', 'schedule_acceleration_target'],
          evidenceCount: 0,
          canClaimTruePerOptionRuntimeEvaluation: false,
          boundaryPolicy: ['runtime_engine_evidence_required'],
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_is_candidate_only'],
      }],
    })
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      reasons: [],
      domainResult: { status: 'manual_conflict_review_ready' },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      'option-conflict',
      '待冲突复核',
      '需人工冲突复核',
      'foundation_pile -> foundation_earthwork FS',
      '日期冲突证据：1 条',
      'row-foundation -> row-earthwork FS',
      '前置 2026-01-10~2026-01-20 / 后续 2026-01-12~2026-01-18',
      'fs_predecessor_finishes_after_successor_start',
      '人工冲突复核通过',
    ])

    const reviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /人工冲突复核通过/.test(button.textContent || ''),
    )
    if (!reviewButton) throw new Error('Missing manual conflict review button')

    await act(async () => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-manual-conflict-review:sha256:conflict',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      manualConflictReviewDecision: 'approved_ready_for_replay',
      constructionOrganizationPlanNetworkDraft: expect.objectContaining({
        draftNetworkKey: 'sha256:conflict',
        readiness: 'conflict_review_required',
      }),
    }))
    await waitForText(container, ['operation_delegated', 'manualConflictReview'])
  })

  it('shows release-exit blockers for already handoff construction organization drafts', async () => {
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_candidate_only_after_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 1,
        linkedReleaseExitHandoffCount: 1,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 0,
        runtimeConsumerObservationCount: 0,
        readyForRuntimeConsumerObservationCount: 0,
        runtimeImpactMonitoringResultCount: 0,
        readyForRuntimeImpactMonitoringResultCount: 0,
        rollbackExecutionVerificationCount: 0,
        readyForRollbackExecutionVerificationCount: 0,
        savedNetworkOutcomeCount: 0,
        readyForSavedNetworkOutcomeCount: 0,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: [
          'domain_writer_runtime_execution_required',
          'runtime_consumer_observation_required',
          'post_materialization_impact_monitoring_result_required',
          'runtime_release_record_persistence_required',
          'rollback_execution_verification_required',
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:already-handoff',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-handoff',
        optionId: 'option-handoff',
        selectedScenarioIds: ['shared_basement_first_then_tower'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 30 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-event-ready',
          assetKey: 'construction_organization.plan_network_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T14:00:00.000Z',
          updatedAt: '2026-06-21T14:00:00.000Z',
          draftNetworkKey: 'sha256:already-handoff',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-handoff',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'user-1',
          executedAt: '2026-06-21T13:00:00.000Z',
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'release_exit_blocked',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:already-handoff',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          requiredBeforeRuntime: [
            'domain_writer_release_exit_required',
            'runtime_consumer_verification_required',
            'impact_monitoring_required',
            'rollback_target_required',
          ],
          reasons: ['domain_writer_release_exit_required'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: {
          source: 'construction_organization_plan_network_release_exit_preparation',
          status: 'ready_for_domain_writer_release_exit_package',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:already-handoff',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-handoff',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          proposedDependencyEdgeCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          proposedDependencyEdges: [],
          evaluationEvidence: {
            evaluationStatus: 'evaluation_ready',
            e1: { matchedReferenceRowCount: 2 },
            e3: { projectedNetworkSpanDays: 30 },
            e5: { e5RecoverableSpanDays: 4 },
            evidenceGaps: [],
            boundaryPolicy: ['evaluation_evidence_is_read_only'],
          },
          useCaseEvaluationEvidence: {},
          packageArtifacts: [
            'approved_plan_network_draft',
            'manual_review_handoff_event',
            'manual_review_approval_event',
          ],
          requiredBeforeRuntime: [
            'domain_writer_release_exit_required',
            'runtime_consumer_verification_required',
            'impact_monitoring_required',
            'release_record_required',
            'rollback_target_required',
          ],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
          boundaryPolicy: ['release_exit_preparation_is_candidate_only'],
        },
        domainWriterReleaseExitReadiness: {
          source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
          status: 'blocked_pending_release_exit_evidence',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:already-handoff',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-handoff',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          releaseExitPreparationStatus: 'ready_for_domain_writer_release_exit_package',
          proposedDependencyEdgeCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          requiredEvidenceBeforeDomainWriter: [
            'domain_writer_release_exit_evidence_required',
            'runtime_consumer_verification_ref_required',
            'impact_monitoring_ref_required',
            'release_record_target_required',
            'rollback_target_required',
          ],
          packageArtifacts: [
            'approved_plan_network_draft',
            'manual_review_handoff_event',
            'manual_review_approval_event',
          ],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
          boundaryPolicy: ['domain_writer_release_exit_readiness_is_read_only'],
        },
        manualReviewApproval: {
          source: 'construction_organization_plan_network_manual_review_approval_projection',
          candidateEventId: 'approval-event-ready',
          assetKey: 'construction_organization.plan_network_approval.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          eventStatus: 'approved',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T15:00:00.000Z',
          updatedAt: '2026-06-21T15:00:00.000Z',
          draftNetworkKey: 'sha256:already-handoff',
          handoffCandidateEventId: 'handoff-event-ready',
          approvedByUserId: 'approver-1',
          approvedAt: '2026-06-21T15:00:00.000Z',
          approvalDecision: 'approved_for_release_exit_preparation',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitHandoff: {
          source: 'construction_organization_plan_network_release_exit_handoff_projection',
          candidateEventId: 'release-exit-handoff-event-ready',
          assetKey: 'construction_organization.plan_network_release_exit_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T16:00:00.000Z',
          updatedAt: '2026-06-21T16:00:00.000Z',
          draftNetworkKey: 'sha256:already-handoff',
          originalCandidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-handoff',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'release-user-1',
          executedAt: '2026-06-21T16:00:00.000Z',
          releaseRecordTarget: 'construction-organization-plan-network-release:sha256:already-handoff',
          rollbackTarget: 'construction-organization-plan-network-rollback:sha256:already-handoff',
          consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, [
      'option-handoff',
      '已交接候选',
      '已批准',
      'release-exit-handoff-event-ready',
      'release-exit 未就绪',
      'release-exit 准备包已形成',
      'domain-writer release-exit 未就绪',
      '运行期物化：已交接候选但仍阻断',
      'domain_writer_runtime_execution_required',
      '1 条候选依赖',
      'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      'domain_writer_release_exit_required',
      'runtime_consumer_verification_ref_required',
      'rollback_target_required',
    ])
    expect(container.textContent).not.toContain('manual_review_approval_required')
  })

  it('submits approved construction organization drafts to release-exit handoff with explicit evidence refs', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      reasons: [],
      domainResult: {
        status: 'release_exit_handoff_ready',
        canMaterializeRuntime: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 0,
      linkedReleaseExitHandoffCount: 0,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_pending_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 0,
        linkedReleaseExitHandoffCount: 0,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 0,
        runtimeConsumerObservationCount: 0,
        readyForRuntimeConsumerObservationCount: 0,
        runtimeImpactMonitoringResultCount: 0,
        readyForRuntimeImpactMonitoringResultCount: 0,
        rollbackExecutionVerificationCount: 0,
        readyForRollbackExecutionVerificationCount: 0,
        savedNetworkOutcomeCount: 0,
        readyForSavedNetworkOutcomeCount: 0,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: [
          'release_exit_handoff_candidate_event_required',
          'domain_writer_runtime_execution_required',
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:release-ready',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-release',
        optionId: 'option-release',
        selectedScenarioIds: ['shared_basement_first_then_tower'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [{
          edgeId: 'edge-1',
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          fromVirtualNodeId: 'foundation-work',
          toVirtualNodeId: 'earthwork-work',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 30 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-event-ready',
          assetKey: 'construction_organization.plan_network_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T14:00:00.000Z',
          updatedAt: '2026-06-21T14:00:00.000Z',
          draftNetworkKey: 'sha256:release-ready',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-release',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'user-1',
          executedAt: '2026-06-21T13:00:00.000Z',
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        manualReviewApproval: {
          source: 'construction_organization_plan_network_manual_review_approval_projection',
          candidateEventId: 'approval-event-ready',
          assetKey: 'construction_organization.plan_network_approval.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          eventStatus: 'approved',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T15:00:00.000Z',
          updatedAt: '2026-06-21T15:00:00.000Z',
          draftNetworkKey: 'sha256:release-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvedByUserId: 'approver-1',
          approvedAt: '2026-06-21T15:00:00.000Z',
          approvalDecision: 'approved_for_release_exit_preparation',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitHandoff: null,
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'release_exit_blocked',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:release-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          requiredBeforeRuntime: [
            'domain_writer_release_exit_required',
            'runtime_consumer_verification_required',
            'impact_monitoring_required',
            'release_record_required',
            'rollback_target_required',
          ],
          reasons: ['domain_writer_release_exit_required'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: {
          source: 'construction_organization_plan_network_release_exit_preparation',
          status: 'ready_for_domain_writer_release_exit_package',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:release-ready',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-release',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          proposedDependencyEdgeCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          proposedDependencyEdges: [],
          evaluationEvidence: {
            evaluationStatus: 'evaluation_ready',
            e1: { matchedReferenceRowCount: 2 },
            e3: { projectedNetworkSpanDays: 30 },
            e5: { e5RecoverableSpanDays: 4 },
            evidenceGaps: [],
            boundaryPolicy: ['evaluation_evidence_is_read_only'],
          },
          useCaseEvaluationEvidence: {},
          packageArtifacts: ['approved_plan_network_draft'],
          requiredBeforeRuntime: [
            'domain_writer_release_exit_required',
            'runtime_consumer_verification_required',
            'impact_monitoring_required',
            'release_record_required',
            'rollback_target_required',
          ],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
          boundaryPolicy: ['release_exit_preparation_is_candidate_only'],
        },
        domainWriterReleaseExitReadiness: {
          source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
          status: 'blocked_pending_release_exit_evidence',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:release-ready',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-release',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          releaseExitPreparationStatus: 'ready_for_domain_writer_release_exit_package',
          proposedDependencyEdgeCount: 1,
          nodeCount: 2,
          edgeCount: 1,
          requiredEvidenceBeforeDomainWriter: [
            'domain_writer_release_exit_evidence_required',
            'runtime_consumer_verification_ref_required',
            'impact_monitoring_ref_required',
            'release_record_target_required',
            'rollback_target_required',
          ],
          packageArtifacts: ['approved_plan_network_draft'],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          },
          boundaryPolicy: ['domain_writer_release_exit_readiness_is_read_only'],
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, ['option-release', '提交 release-exit 交接'])

    const handoffButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /提交 release-exit 交接/.test(button.textContent || ''),
    )
    if (!handoffButton) throw new Error('Missing release-exit handoff button')

    await act(async () => {
      handoffButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-release-exit:sha256:release-ready',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      releaseRecordTarget: 'construction-organization-plan-network-release:sha256:release-ready',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:release-ready',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'constructionOrganizationPlanNetworkDraftService.releaseExitPreparation',
      ],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      constructionOrganizationPlanNetworkDraft: expect.objectContaining({
        draftNetworkKey: 'sha256:release-ready',
        releaseExitPreparation: expect.objectContaining({
          status: 'ready_for_domain_writer_release_exit_package',
        }),
      }),
    }))
    await waitForText(container, ['operation_delegated', 'releaseExitHandoff'])
  })

  it('lets admins record construction organization runtime engine evidence from the draft row', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      reasons: [],
      domainResult: {
        status: 'runtime_engine_evidence_recorded',
        engineCode: 'critical_path_cpm',
        writesTaskDependencies: false,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_candidate_only_after_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 1,
        linkedReleaseExitHandoffCount: 1,
        domainWriterRuntimeExecutionCount: 1,
        readyForDomainWriterExecutionCount: 1,
        runtimeConsumerObservationCount: 1,
        readyForRuntimeConsumerObservationCount: 1,
        runtimeImpactMonitoringResultCount: 1,
        readyForRuntimeImpactMonitoringResultCount: 1,
        rollbackExecutionVerificationCount: 1,
        readyForRollbackExecutionVerificationCount: 1,
        savedNetworkOutcomeCount: 1,
        readyForSavedNetworkOutcomeCount: 1,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: ['true_per_option_runtime_e1_e3_e5_evidence_required'],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:runtime-applied',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-runtime',
        optionId: 'option-runtime',
        selectedScenarioIds: ['shared_basement_first_then_tower'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 45 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-event-ready',
          assetKey: 'construction_organization.plan_network_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T14:00:00.000Z',
          updatedAt: '2026-06-21T14:00:00.000Z',
          draftNetworkKey: 'sha256:runtime-applied',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-runtime',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'user-1',
          executedAt: '2026-06-21T13:00:00.000Z',
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        manualReviewApproval: {
          source: 'construction_organization_plan_network_manual_review_approval_projection',
          candidateEventId: 'approval-event-ready',
          assetKey: 'construction_organization.plan_network_approval.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          eventStatus: 'approved',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T15:00:00.000Z',
          updatedAt: '2026-06-21T15:00:00.000Z',
          draftNetworkKey: 'sha256:runtime-applied',
          handoffCandidateEventId: 'handoff-event-ready',
          approvedByUserId: 'approver-1',
          approvedAt: '2026-06-21T15:00:00.000Z',
          approvalDecision: 'approved_for_release_exit_preparation',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitHandoff: {
          source: 'construction_organization_plan_network_release_exit_handoff_projection',
          candidateEventId: 'release-exit-handoff-event-ready',
          assetKey: 'construction_organization.plan_network_release_exit_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T16:00:00.000Z',
          updatedAt: '2026-06-21T16:00:00.000Z',
          draftNetworkKey: 'sha256:runtime-applied',
          originalCandidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-runtime',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'release-user-1',
          executedAt: '2026-06-21T16:00:00.000Z',
          releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-applied',
          rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-applied',
          consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'release_exit_blocked',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:runtime-applied',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          requiredBeforeRuntime: ['true_per_option_runtime_e1_e3_e5_evidence_required'],
          reasons: ['true_per_option_runtime_e1_e3_e5_evidence_required'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: null,
        domainWriterReleaseExitReadiness: null,
        runtimeEngineEvidence: {
          source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
          status: 'missing_runtime_engine_evidence',
          publicationKey: 'construction-organization-plan-network-release:sha256:runtime-applied',
          presentEngineCodes: [],
          missingEngineCodes: ['E1', 'E3', 'E5'],
          evidenceCount: 0,
          canClaimTruePerOptionRuntimeEvaluation: false,
          boundaryPolicy: ['runtime_engine_evidence_is_read_only'],
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, ['option-runtime', '记录引擎证据'])

    const evidenceButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /记录引擎证据/.test(button.textContent || ''),
    )
    if (!evidenceButton) throw new Error('Missing runtime engine evidence button')

    await act(async () => {
      evidenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-runtime-engine:sha256:runtime-applied:critical_path_cpm',
      companyId: 'company-1',
      projectId: 'project-1',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:runtime-applied',
      engineCode: 'critical_path_cpm',
      predictedDurationDays: 45,
      actualDurationDays: 45,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    }))
    await waitForText(container, ['operation_delegated', 'recordRuntimeEngineEvidence'])
  })

  it('executes controlled runtime apply for a release-exit construction organization draft with engine evidence', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      reasons: [],
      domainResult: {
        status: 'runtime_apply_ready',
        canMaterializeRuntime: true,
        writesTaskDependencies: true,
        writesPlanDates: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'runtime_materialization_evidence_ready',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 1,
        linkedReleaseExitHandoffCount: 1,
        domainWriterRuntimeExecutionCount: 0,
        readyForDomainWriterExecutionCount: 1,
        runtimeConsumerObservationCount: 0,
        readyForRuntimeConsumerObservationCount: 0,
        runtimeImpactMonitoringResultCount: 0,
        readyForRuntimeImpactMonitoringResultCount: 0,
        rollbackExecutionVerificationCount: 0,
        readyForRollbackExecutionVerificationCount: 0,
        savedNetworkOutcomeCount: 0,
        readyForSavedNetworkOutcomeCount: 0,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: ['domain_writer_runtime_execution_required'],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        totalOptionCount: 0,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: null,
          startingLineOnboarding: null,
          accelerationRecovery: null,
        },
        canAutoMaterializeSelectedOption: false,
        comparisonBasis: ['runtime_engine_evidence_gap_by_draft'],
        options: [],
        boundaryPolicy: ['option_comparison_package_is_read_only'],
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:runtime-ready',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-runtime-ready',
        optionId: 'option-runtime-ready',
        selectedScenarioIds: ['shared_basement_first_then_tower'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [{
          edgeId: 'edge-1',
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 30 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-event-ready',
          assetKey: 'construction_organization.plan_network_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T14:00:00.000Z',
          updatedAt: '2026-06-21T14:00:00.000Z',
          draftNetworkKey: 'sha256:runtime-ready',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-runtime-ready',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'user-1',
          executedAt: '2026-06-21T13:00:00.000Z',
          reviewOperation: 'manual_review_dependency_proposal',
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        manualReviewApproval: {
          source: 'construction_organization_plan_network_manual_review_approval_projection',
          candidateEventId: 'approval-event-ready',
          assetKey: 'construction_organization.plan_network_approval.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
          eventStatus: 'approved',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T15:00:00.000Z',
          updatedAt: '2026-06-21T15:00:00.000Z',
          draftNetworkKey: 'sha256:runtime-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvedByUserId: 'approver-1',
          approvedAt: '2026-06-21T15:00:00.000Z',
          approvalDecision: 'approved_for_release_exit_preparation',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitHandoff: {
          source: 'construction_organization_plan_network_release_exit_handoff_projection',
          candidateEventId: 'release-exit-event-ready',
          assetKey: 'construction_organization.plan_network_release_exit_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          eventStatus: 'release_exit_handoff_ready',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-22T01:50:00.000Z',
          updatedAt: '2026-06-22T01:50:00.000Z',
          draftNetworkKey: 'sha256:runtime-ready',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-runtime-ready',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'release-manager-1',
          executedAt: '2026-06-22T01:50:00.000Z',
          releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-ready',
          rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-ready',
          consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.releaseExitPreparation'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        runtimeEngineEvidence: {
          source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
          status: 'missing_runtime_engine_evidence',
          requiredEngineCodes: ['E1', 'E3', 'E5'],
          presentEngineCodes: [],
          missingEngineCodes: ['E1', 'E3', 'E5'],
          publicationKey: null,
          sampleCount: 0,
        },
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'release_exit_blocked',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:runtime-ready',
          requiredBeforeRuntime: [],
          reasons: [],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: null,
        domainWriterReleaseExitReadiness: null,
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, ['option-runtime-ready', '执行受控物化'])

    const applyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /执行受控物化/.test(button.textContent || ''),
    )
    if (!applyButton) throw new Error('Missing runtime apply button')

    await act(async () => {
      applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-runtime-apply:sha256:runtime-ready',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      releaseRecordTarget: 'construction-organization-plan-network-release:sha256:runtime-ready',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:runtime-ready',
      consumerVerificationRefs: [
        'ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations',
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      constructionOrganizationPlanNetworkDraft: expect.objectContaining({
        draftNetworkKey: 'sha256:runtime-ready',
        releaseExitHandoff: expect.objectContaining({
          candidateEventId: 'release-exit-event-ready',
        }),
      }),
    }))
    await waitForText(container, ['operation_delegated', 'applyApprovedDraft'])
  })

  it('records runtime monitoring and rollback evidence for an applied construction organization plan network', async () => {
    mocks.executeRuleAssetGovernanceWorkbenchOperation
      .mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        reasons: [],
        domainResult: {
          status: 'runtime_event_recorded',
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        boundaryPolicy: [
          'workbench_operation_does_not_grant_publish_rights',
          'workbench_never_writes_runtime_directly',
        ],
      })
      .mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'runtime_rollback_execution',
        assetType: 'construction_organization_plan_network',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        reasons: [],
        domainResult: {
          status: 'runtime_event_recorded',
          eventType: 'rollback_execution',
          eventStatus: 'rollback_executed',
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        boundaryPolicy: [
          'workbench_operation_does_not_grant_publish_rights',
          'workbench_never_writes_runtime_directly',
        ],
      })
      .mockResolvedValueOnce({
        status: 'operation_delegated',
        operationAction: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
        writesRuntimeDirectly: false,
        workbenchDoesNotGrantPublishRights: true,
        delegatedToDomainWriter: true,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
        reasons: [],
        domainResult: {
          status: 'saved_network_outcome_recorded',
          outcomeStatus: 'accepted',
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
        boundaryPolicy: [
          'workbench_operation_does_not_grant_publish_rights',
          'workbench_never_writes_runtime_directly',
        ],
      })
    mocks.getConstructionOrganizationPlanNetworkDrafts.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 1,
      totalDraftCount: 1,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 1,
      totalManualReviewHandoffCount: 1,
      linkedManualReviewHandoffCount: 1,
      totalManualReviewApprovalCount: 1,
      linkedManualReviewApprovalCount: 1,
      totalReleaseExitHandoffCount: 1,
      linkedReleaseExitHandoffCount: 1,
      runtimeMaterializationReadiness: {
        source: 'construction_organization_plan_network_runtime_materialization_readiness',
        status: 'blocked_candidate_only_after_release_exit_handoff',
        canMaterializeRuntime: false,
        totalDraftCount: 1,
        releaseExitPreparationCount: 1,
        domainWriterReleaseExitReadinessCount: 1,
        releaseExitHandoffCandidateCount: 1,
        linkedReleaseExitHandoffCount: 1,
        domainWriterRuntimeExecutionCount: 1,
        readyForDomainWriterExecutionCount: 1,
        runtimeConsumerObservationCount: 1,
        readyForRuntimeConsumerObservationCount: 1,
        runtimeImpactMonitoringResultCount: 0,
        readyForRuntimeImpactMonitoringResultCount: 0,
        rollbackExecutionVerificationCount: 0,
        readyForRollbackExecutionVerificationCount: 0,
        savedNetworkOutcomeCount: 0,
        readyForSavedNetworkOutcomeCount: 0,
        perOptionRuntimeEngineEvidenceCount: 0,
        readyForPerOptionRuntimeEngineEvidenceCount: 0,
        missingBeforeRuntime: [
          'post_materialization_impact_monitoring_result_required',
          'rollback_execution_verification_required',
        ],
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['runtime_materialization_readiness_is_read_only'],
      },
      recommendedDrafts: {
        newProjectPlanning: null,
        startingLineOnboarding: null,
        accelerationRecovery: null,
      },
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        totalOptionCount: 0,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: null,
          startingLineOnboarding: null,
          accelerationRecovery: null,
        },
        canAutoMaterializeSelectedOption: false,
        comparisonBasis: ['runtime_engine_evidence_gap_by_draft'],
        options: [],
        boundaryPolicy: ['option_comparison_package_is_read_only'],
      },
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:applied',
        candidateEventId: 'event-ready',
        assetKey: 'construction_organization.plan_option.option-applied',
        optionId: 'option-applied',
        businessType: 'hospital',
        selectedScenarioIds: ['shared_basement_first_then_tower'],
        readiness: 'ready_for_replay',
        nodeCount: 2,
        edgeCount: 1,
        blockedReasons: [],
        edges: [{
          edgeId: 'edge-1',
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          dependencyType: 'FS',
          lagDays: 0,
          intent: 'pile_before_earthwork_bulk_excavation',
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }],
        evaluationEvidence: {
          evaluationStatus: 'evaluation_ready',
          e1: { matchedReferenceRowCount: 2 },
          e3: { projectedNetworkSpanDays: 30 },
          e5: { e5RecoverableSpanDays: 4 },
          evidenceGaps: [],
          boundaryPolicy: ['evaluation_evidence_is_read_only'],
        },
        reviewPackageStatus: 'ready_for_manual_review',
        reviewRequired: true,
        manualReviewHandoff: null,
        manualReviewApproval: null,
        releaseExitHandoff: {
          source: 'construction_organization_plan_network_release_exit_handoff_projection',
          candidateEventId: 'release-exit-event-ready',
          assetKey: 'construction_organization.plan_network_release_exit_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
          eventStatus: 'release_exit_handoff_ready',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-22T01:50:00.000Z',
          updatedAt: '2026-06-22T01:50:00.000Z',
          draftNetworkKey: 'sha256:applied',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-applied',
          selectedScenarioIds: ['shared_basement_first_then_tower'],
          requestedByUserId: 'release-manager-1',
          executedAt: '2026-06-22T01:50:00.000Z',
          releaseRecordTarget: 'construction-organization-plan-network-release:sha256:applied',
          rollbackTarget: 'construction-organization-plan-network-rollback:sha256:applied',
          consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.releaseExitPreparation'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        runtimeEngineEvidence: {
          source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
          status: 'partial_runtime_engine_evidence',
          requiredEngineCodes: ['E1', 'E3', 'E5'],
          presentEngineCodes: ['E1'],
          missingEngineCodes: ['E3', 'E5'],
          publicationKey: 'construction-organization-plan-network-release:sha256:applied',
          sampleCount: 1,
        },
        releaseExitAssessment: {
          source: 'construction_organization_plan_network_release_exit_assessment',
          status: 'release_exit_blocked',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:applied',
          requiredBeforeRuntime: [],
          reasons: [],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['release_exit_assessment_is_read_only'],
        },
        releaseExitPreparation: null,
        domainWriterReleaseExitReadiness: null,
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    await act(async () => {
      root.render(<RuleAssetGovernanceWorkbenchAdmin />)
    })

    await waitForText(container, ['option-applied', '记录影响监控', '记录回滚执行', '记录保存结果'])

    const monitoringButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /记录影响监控/.test(button.textContent || ''),
    )
    const rollbackButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /记录回滚执行/.test(button.textContent || ''),
    )
    const savedOutcomeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      /记录保存结果/.test(button.textContent || ''),
    )
    if (!monitoringButton || !rollbackButton || !savedOutcomeButton) throw new Error('Missing runtime evidence buttons')

    await act(async () => {
      monitoringButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })
    await act(async () => {
      rollbackButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })
    await act(async () => {
      savedOutcomeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-impact-monitoring:sha256:applied',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      optionId: 'option-applied',
      draftNetworkKey: 'sha256:applied',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:applied',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      consumerVerificationRefs: [
        'scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage',
      ],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
    }))
    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'runtime_rollback_execution',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-rollback-execution:sha256:applied',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      optionId: 'option-applied',
      draftNetworkKey: 'sha256:applied',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:applied',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:applied',
      rollbackReason: 'manual_governance_runtime_rollback_verification',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
    }))
    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenNthCalledWith(3, expect.objectContaining({
      action: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'construction-org-saved-outcome:sha256:applied',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
      optionId: 'option-applied',
      draftNetworkKey: 'sha256:applied',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:applied',
      releaseRecordTarget: 'construction-organization-plan-network-outcome:sha256:applied',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      consumerVerificationRefs: ['duration_plan_network_outcomes.construction_organization_plan_network'],
    }))
  })

  it('prioritizes the already-materialized state before offering runtime apply again', () => {
    const workbenchSource = readClientSource('src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx')

    expect(workbenchSource).toContain('{alreadyRuntimeApplied ? (')
    expect(workbenchSource).toContain('已受控物化')
    expect(workbenchSource).toContain('记录影响监控')
    expect(workbenchSource).toContain('记录回滚执行')
    expect(workbenchSource).toContain('记录保存结果')
    expect(workbenchSource).toContain("canRuntimeApply ? '执行受控物化'")
  })

  it('registers the high-permission admin route without exposing it in ordinary project navigation', () => {
    const appSource = readClientSource('src/App.tsx')
    const navigationSource = readClientSource('src/config/navigation.ts')
    const workbenchSource = readClientSource('src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx')

    expect(appSource).toContain("const RuleAssetGovernanceWorkbenchAdmin = lazy(() => import('@/pages/RuleAssetGovernanceWorkbenchAdmin'))")
    expect(appSource).toContain('path="/admin/rule-assets/governance-workbench"')
    expect(navigationSource).not.toContain('/admin/rule-assets/governance-workbench')
    expect(workbenchSource).toContain('manual_review_handoff')
    expect(workbenchSource).toContain('construction_organization_plan_network')
    expect(workbenchSource).toContain('getConstructionOrganizationPlanNetworkDrafts')
    expect(workbenchSource).toContain('submitConstructionOrganizationDraft')
    expect(workbenchSource).toContain('linkedManualReviewHandoffCount')
    expect(workbenchSource).toContain('collect_runtime_ready_use_case_option_evidence_for_business_type')
    expect(workbenchSource).toContain('补齐入口 A/B/C 运行证据')
    expect(workbenchSource).toContain('已送审')
  })
})
