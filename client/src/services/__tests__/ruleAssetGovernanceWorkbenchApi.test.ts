import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}))

const {
  executeRuleAssetGovernanceWorkbenchOperation,
  getConstructionOrganizationPlanNetworkDrafts,
  getRuleAssetGovernanceCompletionAudit,
  getRuleAssetGovernanceWorkbenchReadiness,
} = await import('../ruleAssetGovernanceWorkbenchApi')

describe('ruleAssetGovernanceWorkbenchApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not synthesize a frontend option-comparison package when the backend package is missing', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalDraftCount: 1,
      readyForReplayCount: 0,
      recommendedDrafts: {},
      items: [{
        source: 'construction_organization_plan_network_draft',
        draftNetworkKey: 'sha256:draft-only',
        candidateEventId: 'event-draft-only',
        assetKey: 'construction_organization.plan_option.option-draft-only',
        optionId: 'option-draft-only',
        selectedScenarioIds: ['pile_before_excavation'],
        readiness: 'ready_for_replay',
        edgeCount: 1,
        edges: [],
        evaluationEvidence: { evaluationStatus: 'evaluation_ready' },
        useCaseEvaluationEvidence: {},
        runtimeEngineEvidence: {
          status: 'missing_runtime_engine_evidence',
          missingEngineCodes: ['E1', 'E3', 'E5'],
          presentEngineCodes: [],
          canClaimTruePerOptionRuntimeEvaluation: false,
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
        },
      }],
    })

    const report = await getConstructionOrganizationPlanNetworkDrafts({ projectId: 'project-1', limit: 5 })

    expect(report.optionComparisonPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_option_comparison_package',
      totalOptionCount: 0,
      canAutoMaterializeSelectedOption: false,
      comparisonBasis: ['backend_option_comparison_package_missing_direct_failure'],
      options: [],
      boundaryPolicy: expect.arrayContaining([
        'frontend_does_not_synthesize_option_comparison_package',
        'backend_option_comparison_package_required',
      ]),
    }))
    expect(report.optionComparisonPackage.comparisonBasis).not.toContain('frontend_fallback_from_draft_read_model')
    expect(report.optionComparisonPackage.options).toHaveLength(0)
  })

  it('loads the v1.4.22.3 governance workbench readiness report', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      reportCode: 'v14223_rule_asset_governance_workbench_readiness',
      companyId: 'company-1',
      status: 'workbench_incomplete',
      canDeclareGovernanceWorkbenchComplete: false,
      completionScope: 'workbench_readiness_evidence_only',
      canDeclareV14223GovernanceComplete: false,
      remainingClosureGaps: [{
        key: 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
        status: 'not_proven_by_workbench_readiness',
        evidenceRequired: ['asset_type_domain_writer'],
        reason: 'A ready workbench report does not prove every domain writer and rollback path.',
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
        readyGateCount: 1,
        needsWorkGateCount: 2,
        totalGateCount: 3,
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
          details: {
            source: 'construction_organization_precision_replay_gate_detail',
            automaticOptionSelectionStatus: 'automatic_option_selection_verified',
            verifiedUseCaseProofCount: 33,
          },
        },
        {
          key: 'construction_organization_product_outcome_closeout_matrix',
          status: 'needs_work',
          evidenceRefs: ['constructionOrganizationProductOutcomeCloseoutMatrixService'],
          missingReasons: [],
          details: {
            source: 'construction_organization_product_outcome_closeout_gate_detail',
            runtimeOutcomeReadyBusinessTypeCount: 1,
            supportedBusinessTypeCount: 11,
            nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
            nextEvidenceOperations: [{
              evidenceAction: 'record_saved_network_outcome_for_business_type',
              operationAction: 'runtime_saved_outcome',
              assetType: 'construction_organization_plan_network',
            }],
            nextEvidenceWorkItems: [{
              businessType: 'hospital',
              runtimeEvidenceProjectIds: ['project-hospital'],
              runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
              runtimeEvidenceOptionIds: ['option-hospital'],
              runtimeEvidencePublicationKeys: ['publication-hospital'],
              missingReasons: ['saved_network_outcome_required'],
              nextEvidenceActions: ['record_saved_network_outcome_for_business_type'],
              nextEvidenceOperations: [{
                businessType: 'hospital',
                evidenceAction: 'record_saved_network_outcome_for_business_type',
                operationAction: 'runtime_saved_outcome',
                assetType: 'construction_organization_plan_network',
              }],
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
              operationActions: ['runtime_engine_evidence', 'runtime_saved_outcome'],
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
              }],
              executionPlanItemCount: 1,
              prefillableExecutionStepCount: 1,
              blockedExecutionStepCount: 0,
              executionReadinessStatus: 'ready_for_controlled_prefill',
              missingRuntimeAnchorReasons: [],
              totalDeficit: 2,
              requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
              boundaryPolicy: ['work_package_does_not_fabricate_runtime_evidence'],
            }],
            businessTypeRows: [{
              businessType: 'general_civil',
              status: 'product_outcome_closeout_ready',
              hasPrecisionReplayEvidence: true,
              hasRuntimeCloseoutClaim: true,
              missingReasons: [],
              nextEvidenceActions: [],
            }, {
              businessType: 'hospital',
              status: 'product_outcome_closeout_incomplete',
              hasPrecisionReplayEvidence: true,
              hasRuntimeCloseoutClaim: false,
              missingReasons: ['saved_network_outcome_required'],
              runtimeEvidenceProjectIds: ['project-hospital'],
              runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
              runtimeEvidenceOptionIds: ['option-hospital'],
              runtimeEvidencePublicationKeys: ['publication-hospital'],
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
              nextEvidenceActions: ['record_saved_network_outcome_for_business_type'],
              nextEvidenceOperations: [{
                businessType: 'hospital',
                evidenceAction: 'record_saved_network_outcome_for_business_type',
                operationAction: 'runtime_saved_outcome',
                assetType: 'construction_organization_plan_network',
              }],
            }],
          },
        },
      ],
      boundaryPolicy: ['workbench_readiness_does_not_grant_publish_rights'],
    })

    const report = await getRuleAssetGovernanceWorkbenchReadiness()

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench',
      { runtimeCache: 'off' },
    )
    expect(report.summary.totalAssetCount).toBe(348)
    expect(report.summary.durationRelatedCoverageRatio).toBe(0.6361)
    expect(report.summary.conservativeGovernanceDefaultCount).toBe(251)
    expect(report.summary.readyGateCount).toBe(1)
    expect(report.gates[0].details).toEqual(expect.objectContaining({
      source: 'construction_organization_precision_replay_gate_detail',
      automaticOptionSelectionStatus: 'automatic_option_selection_verified',
      verifiedUseCaseProofCount: 33,
    }))
    expect(report.gates[1].details).toEqual(expect.objectContaining({
      source: 'construction_organization_product_outcome_closeout_gate_detail',
      nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
      nextEvidenceOperations: [expect.objectContaining({
        evidenceAction: 'record_saved_network_outcome_for_business_type',
        operationAction: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
      })],
      nextEvidenceWorkItems: [expect.objectContaining({
        businessType: 'hospital',
        runtimeEvidenceProjectIds: ['project-hospital'],
        runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
        runtimeEvidenceOptionIds: ['option-hospital'],
        runtimeEvidencePublicationKeys: ['publication-hospital'],
        nextEvidenceOperations: [expect.objectContaining({
          businessType: 'hospital',
          evidenceAction: 'record_saved_network_outcome_for_business_type',
          operationAction: 'runtime_saved_outcome',
        })],
      })],
      nextEvidenceExecutionPlan: [expect.objectContaining({
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
        operationAction: 'runtime_engine_evidence',
        deficit: 2,
      })],
      nextEvidenceWorkPackages: [expect.objectContaining({
        source: 'construction_organization_product_outcome_evidence_work_package',
        businessType: 'hospital',
        workPackageKey: 'construction_organization_product_outcome:hospital',
        totalDeficit: 2,
        prefillableExecutionStepCount: 1,
        blockedExecutionStepCount: 0,
        executionReadinessStatus: 'ready_for_controlled_prefill',
        missingRuntimeAnchorReasons: [],
        requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
        executionSteps: [expect.objectContaining({
          source: 'construction_organization_product_outcome_evidence_work_package_step',
          operationAction: 'runtime_engine_evidence',
          canPrefillControlledOperation: true,
        })],
      })],
      businessTypeRows: expect.arrayContaining([
        expect.objectContaining({
          businessType: 'general_civil',
          status: 'product_outcome_closeout_ready',
          hasRuntimeCloseoutClaim: true,
          nextEvidenceActions: [],
        }),
        expect.objectContaining({
          businessType: 'hospital',
          status: 'product_outcome_closeout_incomplete',
          runtimeEvidenceProjectIds: ['project-hospital'],
          runtimeEvidenceDraftNetworkKeys: ['sha256:hospital'],
          runtimeEvidenceOptionIds: ['option-hospital'],
          runtimeEvidencePublicationKeys: ['publication-hospital'],
          runtimeEvidenceOptionDeficit: 2,
          runtimeEvidenceRuntimeReadyOptionDeficit: 2,
          runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: 3,
          runtimeReadyUseCaseOptionDeficits: expect.objectContaining({
            accelerationRecovery: 3,
          }),
          runtimeReadyUseCaseOptionCloseoutClaimDeficits: expect.objectContaining({
            startingLineOnboarding: 2,
          }),
          nextEvidenceOperations: [expect.objectContaining({
            businessType: 'hospital',
            evidenceAction: 'record_saved_network_outcome_for_business_type',
            operationAction: 'runtime_saved_outcome',
          })],
        }),
      ]),
    }))
    expect(report.summary.needsWorkGateCount).toBe(2)
    expect(report.summary.totalGateCount).toBe(3)
    expect(report.governanceDefaultReviewItems[0]).toEqual(expect.objectContaining({
      assetKey: 'durationContextPolicyLearningService',
      durationRelated: true,
      learningTarget: 'context_factor',
      reason: 'missing_inventory_governance_field_defaults_to_candidate_or_shadow',
    }))
    expect(report.gates[0]).toEqual(expect.objectContaining({
      key: 'frontend_admin_operations_page',
      status: 'ready',
      evidenceRefs: ['client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx'],
      missingReasons: [],
    }))
    expect(report.completionScope).toBe('workbench_readiness_evidence_only')
    expect(report.canDeclareV14223GovernanceComplete).toBe(false)
    expect(report.remainingClosureGaps[0]).toEqual(expect.objectContaining({
      key: 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
      status: 'not_proven_by_workbench_readiness',
      evidenceRequired: ['asset_type_domain_writer'],
    }))
    expect(report.runtimeMutationPolicy).toBe('none_read_only_evidence_and_gap_report')
  })

  it('submits controlled governance workbench operations without granting publish rights', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      domainWriterKey: null,
      reasons: ['domain_writer_required'],
      domainResult: null,
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      evidenceToken: 'manual-admin-evidence-1',
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'release_exit_handoff',
        assetType: 'learnable_parameter',
        evidenceToken: 'manual-admin-evidence-1',
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_blocked',
      operationAction: 'release_exit_handoff',
      assetType: 'learnable_parameter',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: false,
      reasons: ['domain_writer_required'],
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    }))
  })

  it('submits construction organization manual-review handoff drafts through the controlled operation contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      reasons: [],
      domainResult: {
        status: 'manual_review_handoff_ready',
        writesTaskDependencies: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:draft',
      readiness: 'ready_for_replay',
    }
    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'manual-review-evidence-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
      consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
      constructionOrganizationPlanNetworkDraft: draft,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'manual_review_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'manual-review-evidence-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
        consumerVerificationRefs: ['ConstructionOrganizationScenarioSummary.planNetworkDraftRecommendations'],
        constructionOrganizationPlanNetworkDraft: draft,
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_review_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
    }))
  })

  it('submits construction organization manual conflict review decisions through the controlled operation contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      status: 'operation_delegated',
      operationAction: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      reasons: [],
      domainResult: {
        status: 'manual_conflict_review_ready',
        decision: 'approved_ready_for_replay',
        writesTaskDependencies: false,
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:conflict',
      readiness: 'conflict_review_required',
    }
    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'manual-conflict-review-evidence-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
      manualConflictReviewDecision: 'approved_ready_for_replay',
      consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.conflictReviewEvidence'],
      constructionOrganizationPlanNetworkDraft: draft,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'manual_conflict_review',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'manual-conflict-review-evidence-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
        manualConflictReviewDecision: 'approved_ready_for_replay',
        consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.conflictReviewEvidence'],
        constructionOrganizationPlanNetworkDraft: draft,
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'manual_conflict_review',
      assetType: 'construction_organization_plan_network',
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
    }))
  })

  it('submits construction organization release-exit handoff evidence without dropping release record target', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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
      },
      boundaryPolicy: [
        'workbench_operation_does_not_grant_publish_rights',
        'workbench_never_writes_runtime_directly',
      ],
    })

    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:draft',
      readiness: 'ready_for_replay',
    }
    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'release-exit-evidence-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
      releaseRecordTarget: 'construction-organization-plan-network-release:sha256:draft',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:draft',
      consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.releaseExitPreparation'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      constructionOrganizationPlanNetworkDraft: draft,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'release_exit_handoff',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'release-exit-evidence-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
        releaseRecordTarget: 'construction-organization-plan-network-release:sha256:draft',
        rollbackTarget: 'construction-organization-plan-network-rollback:sha256:draft',
        consumerVerificationRefs: ['constructionOrganizationPlanNetworkDraftService.releaseExitPreparation'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
        constructionOrganizationPlanNetworkDraft: draft,
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'release_exit_handoff',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
    }))
  })

  it('submits construction organization runtime apply through the approved draft domain writer contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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

    const draft = {
      source: 'construction_organization_plan_network_draft',
      draftNetworkKey: 'sha256:draft',
      readiness: 'ready_for_replay',
    }
    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'runtime-apply-evidence-1',
      projectId: 'project-1',
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      releaseRecordTarget: 'construction-organization-plan-network-release:sha256:draft',
      rollbackTarget: 'construction-organization-plan-network-rollback:sha256:draft',
      consumerVerificationRefs: ['scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
      constructionOrganizationPlanNetworkDraft: draft,
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'runtime_apply',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-apply-evidence-1',
        projectId: 'project-1',
        domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
        releaseRecordTarget: 'construction-organization-plan-network-release:sha256:draft',
        rollbackTarget: 'construction-organization-plan-network-rollback:sha256:draft',
        consumerVerificationRefs: ['scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
        rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft'],
        constructionOrganizationPlanNetworkDraft: draft,
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_apply',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
    }))
  })

  it('submits construction organization runtime evidence events through the controlled operation contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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

    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'runtime-impact-monitoring-evidence-1',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
      consumerVerificationRefs: ['scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage'],
      impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'runtime_impact_monitoring',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-impact-monitoring-evidence-1',
        sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
        consumerVerificationRefs: ['scheduleAccelerationRuntimeService.constructionOrganizationPlanNetworkPublicationLineage'],
        impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitoringJob'],
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_impact_monitoring',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
    }))
  })

  it('submits construction organization saved network outcomes through the controlled operation contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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

    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'runtime-saved-outcome-evidence-1',
      businessType: 'hospital',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
      releaseRecordTarget: 'construction-organization-plan-network-outcome:sha256:draft',
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
      consumerVerificationRefs: ['duration_plan_network_outcomes.construction_organization_plan_network'],
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-saved-outcome-evidence-1',
        businessType: 'hospital',
        sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
        releaseRecordTarget: 'construction-organization-plan-network-outcome:sha256:draft',
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
        consumerVerificationRefs: ['duration_plan_network_outcomes.construction_organization_plan_network'],
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_saved_outcome',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
    }))
  })

  it('submits construction organization runtime engine evidence through the controlled operation contract', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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

    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      evidenceToken: 'runtime-engine-evidence-1',
      businessType: 'hospital',
      sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
      engineCode: 'critical_path_cpm',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
        evidenceToken: 'runtime-engine-evidence-1',
        businessType: 'hospital',
        sourcePublicationKey: 'construction-organization-plan-network-release:sha256:draft',
        engineCode: 'critical_path_cpm',
        predictedDurationDays: 180,
        actualDurationDays: 184,
        domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_engine_evidence',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
    }))
  })

  it('submits explicit construction organization runtime recommendation adoption decisions', async () => {
    mocks.apiPost.mockResolvedValueOnce({
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

    const result = await executeRuleAssetGovernanceWorkbenchOperation({
      action: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      companyId: 'company-1',
      projectId: 'project-1',
      businessType: 'hospital',
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
    })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/operations',
      {
        action: 'runtime_recommendation_adopt',
        assetType: 'construction_organization_plan_network',
        companyId: 'company-1',
        projectId: 'project-1',
        businessType: 'hospital',
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
      },
    )
    expect(result).toEqual(expect.objectContaining({
      status: 'operation_delegated',
      operationAction: 'runtime_recommendation_adopt',
      assetType: 'construction_organization_plan_network',
      writesRuntimeDirectly: false,
      workbenchDoesNotGrantPublishRights: true,
      delegatedToDomainWriter: true,
      domainWriterKey: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
    }))
  })

  it('loads construction organization plan-network drafts from the governance read model', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 2,
      totalDraftCount: 2,
      readyForReplayCount: 1,
      evaluationReadyCount: 1,
      partialEvaluationCount: 1,
      evidenceOnlyCount: 1,
      blockedCount: 0,
      totalEdgeCount: 3,
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
        totalDraftCount: 2,
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
          'saved_network_outcome_required',
          'true_per_option_runtime_e1_e3_e5_evidence_required',
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
        accelerationRecovery: {
          useCase: 'accelerationRecovery',
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          optionScore: 83,
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
        totalOptionCount: 2,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: 'option-ready',
          startingLineOnboarding: 'option-ready',
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
          isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          runtimeEngineEvidenceStatus: 'partial_runtime_engine_evidence',
          presentRuntimeEngineCodes: ['E1', 'E3'],
          missingRuntimeEngineCodes: ['E5'],
          canClaimTruePerOptionRuntimeEvaluation: false,
          useCaseScores: {
            newProjectPlanning: {
              rank: 1,
              optionScore: 77,
              actionability: 'actionable_candidate',
              e5RecoverableSpanDays: null,
              rankBasis: ['generated_row_projection_alignment'],
            },
            startingLineOnboarding: {
              rank: 1,
              optionScore: 68,
              actionability: 'evidence_only',
              e5RecoverableSpanDays: null,
              rankBasis: ['starting_line_decision_locked'],
            },
            accelerationRecovery: {
              rank: 1,
              optionScore: 83,
              actionability: 'actionable_candidate',
              e5RecoverableSpanDays: 4,
              rankBasis: ['e5_recovery_hint'],
            },
          },
          proposedDependencyEdgeCount: 1,
          nextGovernanceAction: 'runtime_engine_evidence_required',
          nextGovernanceReasons: ['missing_runtime_engine:E5'],
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
        manualReviewHandoff: {
          source: 'construction_organization_plan_network_manual_review_handoff_projection',
          candidateEventId: 'handoff-event-ready',
          assetKey: 'construction_organization.plan_network_handoff.ready',
          sourceModule: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
          eventStatus: 'review_required',
          runtimeEffect: 'candidate_only',
          createdAt: '2026-06-21T14:00:00.000Z',
          updatedAt: '2026-06-21T14:00:00.000Z',
          draftNetworkKey: 'sha256:ready',
          originalCandidateEventId: 'event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
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
          draftNetworkKey: 'sha256:ready',
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
          draftNetworkKey: 'sha256:ready',
          originalCandidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          requestedByUserId: 'release-user-1',
          executedAt: '2026-06-21T16:00:00.000Z',
          releaseRecordTarget: 'construction-organization-release-record:project-1',
          rollbackTarget: 'construction-organization-rollback:project-1',
          consumerVerificationRefs: ['gantt.taskDependencyReadModel'],
          impactMonitoringRefs: ['constructionOrganizationPlanNetworkImpactMonitor'],
          rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.rollback'],
          proposedDependencyEdgeCount: 1,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        releaseExitPreparation: {
          source: 'construction_organization_plan_network_release_exit_preparation',
          status: 'ready_for_domain_writer_release_exit_package',
          canMaterializeRuntime: false,
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
          proposedDependencyEdgeCount: 1,
          nodeCount: 2,
          edgeCount: 1,
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
          draftNetworkKey: 'sha256:ready',
          candidateEventId: 'event-ready',
          handoffCandidateEventId: 'handoff-event-ready',
          approvalCandidateEventId: 'approval-event-ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
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
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['draft_network_is_read_only'],
        runtimeEngineEvidence: {
          source: 'construction_organization_plan_network_runtime_engine_evidence_summary',
          status: 'partial_runtime_engine_evidence',
          publicationKey: 'construction-org-plan-network-release:project-1',
          presentEngineCodes: ['E1', 'E3'],
          missingEngineCodes: ['E5'],
          evidenceCount: 2,
          canClaimTruePerOptionRuntimeEvaluation: false,
          boundaryPolicy: ['runtime_engine_evidence_is_read_only'],
        },
        manualConflictReviewPackage: {
          source: 'construction_organization_plan_network_manual_conflict_review_package',
          status: 'manual_conflict_review_required',
          reviewPrompt: '候选施工组织关系与当前生成计划日期存在冲突，需要人工确认。',
          reviewChecklist: ['核对候选依赖是否符合当前施工组织方案。'],
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
      }],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    })

    const report = await getConstructionOrganizationPlanNetworkDrafts({ projectId: 'project-1', limit: 5 })

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-workbench/construction-organization/plan-network-drafts?projectId=project-1&limit=5',
      { runtimeCache: 'off' },
    )
    expect(report.totalDraftCount).toBe(2)
    expect(report.readyForReplayCount).toBe(1)
    expect(report.recommendedDrafts.accelerationRecovery).toEqual(expect.objectContaining({
      draftNetworkKey: 'sha256:ready',
      e5RecoverableSpanDays: 4,
      runtimeEngineEvidenceStatus: 'partial_runtime_engine_evidence',
      presentRuntimeEngineCodes: ['E1', 'E3'],
      missingRuntimeEngineCodes: ['E5'],
      canClaimTruePerOptionRuntimeEvaluation: false,
    }))
    expect(report.optionComparisonPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_option_comparison_package',
      totalOptionCount: 2,
      canAutoMaterializeSelectedOption: false,
      comparisonBasis: expect.arrayContaining([
        'read_only_plan_network_draft_use_case_evidence',
        'runtime_engine_evidence_gap_by_draft',
      ]),
    }))
    expect(report.optionComparisonPackage.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        draftNetworkKey: 'sha256:ready',
        optionId: 'option-ready',
        isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
        runtimeEngineEvidenceStatus: 'partial_runtime_engine_evidence',
        presentRuntimeEngineCodes: ['E1', 'E3'],
        missingRuntimeEngineCodes: ['E5'],
        nextGovernanceAction: 'runtime_engine_evidence_required',
        writesTaskDependencies: false,
        writesPlanDates: false,
        useCaseScores: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            rank: 1,
            optionScore: 77,
          }),
          accelerationRecovery: expect.objectContaining({
            rank: 1,
            optionScore: 83,
            e5RecoverableSpanDays: 4,
          }),
        }),
      }),
    ]))
    expect(report.items[0]).toEqual(expect.objectContaining({
      draftNetworkKey: 'sha256:ready',
      readiness: 'ready_for_replay',
      edgeCount: 1,
      runtimeEngineEvidence: expect.objectContaining({
        status: 'partial_runtime_engine_evidence',
        presentEngineCodes: ['E1', 'E3'],
        missingEngineCodes: ['E5'],
        canClaimTruePerOptionRuntimeEvaluation: false,
      }),
      evaluationEvidence: expect.objectContaining({
        evaluationStatus: 'evaluation_ready',
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(report.items[0].manualConflictReviewPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_manual_conflict_review_package',
      status: 'manual_conflict_review_required',
      proposedDependencyEdgeCount: 1,
      recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval',
      conflictReasonCodes: expect.arrayContaining([
        'candidate_network_conflicts_with_current_generated_row_dates',
      ]),
      sampleProposedDependencyEdges: expect.arrayContaining([
        expect.objectContaining({
          fromVirtualNodeId: 'foundation_pile',
          toVirtualNodeId: 'foundation_earthwork',
          writesTaskDependencies: false,
        }),
      ]),
      conflictEvidenceCount: 1,
      sampleConflictEvidence: expect.arrayContaining([
        expect.objectContaining({
          fromGeneratedRowId: 'row-foundation',
          toGeneratedRowId: 'row-earthwork',
          reason: 'fs_predecessor_finishes_after_successor_start',
          fromWindow: expect.objectContaining({
            plannedStartDate: '2026-01-10',
            plannedEndDate: '2026-01-20',
          }),
          toWindow: expect.objectContaining({
            plannedStartDate: '2026-01-12',
            plannedEndDate: '2026-01-18',
          }),
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
      ]),
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      draftNetworkKey: 'sha256:ready',
      manualConflictReviewPackage: expect.objectContaining({
        source: 'construction_organization_plan_network_manual_conflict_review_package',
        status: 'manual_conflict_review_required',
      }),
    }))
    expect(report.items[0].releaseExitPreparation).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_release_exit_preparation',
      status: 'ready_for_domain_writer_release_exit_package',
      canMaterializeRuntime: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      approvalCandidateEventId: 'approval-event-ready',
      proposedDependencyEdgeCount: 1,
    }))
    expect(report.items[0].releaseExitPreparation?.packageArtifacts).toEqual(expect.arrayContaining([
      'approved_plan_network_draft',
      'manual_review_handoff_event',
      'manual_review_approval_event',
    ]))
    expect(report.items[0].domainWriterReleaseExitReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_domain_writer_release_exit_readiness',
      status: 'blocked_pending_release_exit_evidence',
      canMaterializeRuntime: false,
      domainWriterKey: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
      releaseExitPreparationStatus: 'ready_for_domain_writer_release_exit_package',
      proposedDependencyEdgeCount: 1,
    }))
    expect(report.items[0].domainWriterReleaseExitReadiness?.requiredEvidenceBeforeDomainWriter).toEqual([
      'domain_writer_release_exit_evidence_required',
      'runtime_consumer_verification_ref_required',
      'impact_monitoring_ref_required',
      'release_record_target_required',
      'rollback_target_required',
    ])
    expect(report.items[0].releaseExitHandoff).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_release_exit_handoff_projection',
      candidateEventId: 'release-exit-handoff-event-ready',
      releaseRecordTarget: 'construction-organization-release-record:project-1',
      rollbackTarget: 'construction-organization-rollback:project-1',
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(report.runtimeMaterializationReadiness).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_materialization_readiness',
      status: 'blocked_candidate_only_after_release_exit_handoff',
      canMaterializeRuntime: false,
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
    }))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual(expect.arrayContaining([
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
      'saved_network_outcome_required',
      'true_per_option_runtime_e1_e3_e5_evidence_required',
    ]))
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).not.toEqual(expect.arrayContaining([
      'domain_writer_runtime_execution_required',
      'runtime_release_record_persistence_required',
      'runtime_consumer_observation_required',
    ]))
  })

  it('preserves runtime-ready construction organization evidence states from the backend', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      runtimeMaterializationReadiness: {
        status: 'runtime_materialization_evidence_ready',
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
        perOptionRuntimeEngineEvidenceCount: 3,
        readyForPerOptionRuntimeEngineEvidenceCount: 1,
        missingBeforeRuntime: [],
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
      runtimeCloseoutClaimsByProjectDraftNetworkKey: {
        'project-1::sha256:ready': {
          source: 'construction_organization_plan_network_runtime_closeout_claim',
          status: 'runtime_closeout_claim_ready',
          canClaimRuntimeCloseout: true,
          canMaterializeRuntime: false,
          totalDraftCount: 1,
          claimBasis: ['project_draft_scoped_closeout_claim_ready'],
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
      },
      runtimeRecommendedOption: {
        source: 'construction_organization_plan_network_runtime_recommended_option',
        status: 'runtime_recommended_option_ready',
        optionId: 'option-ready',
        draftNetworkKey: 'sha256:ready',
        publicationKey: 'construction-organization-plan-network-release:sha256:ready',
        selectedScenarioIds: ['pile_before_excavation'],
        canAutoAdoptRuntimeOption: false,
        siteDecision: {
          source: 'construction_organization_plan_network_recommendation_decision_projection',
          recommendationKind: 'construction_organization_plan_network',
          recommendationKey: 'construction_organization_plan_network:option-ready',
          actionType: 'adopted',
          optionId: 'option-ready',
          draftNetworkKey: 'sha256:ready',
          publicationKey: 'construction-organization-plan-network-release:sha256:ready',
          selectedScenarioIds: ['pile_before_excavation'],
          decidedAt: '2026-06-22T16:30:00.000Z',
          decidedBy: 'admin-1',
          siteDecisionMatchesRuntimeRecommendation: true,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
          boundaryPolicy: ['recommendation_decision_is_user_action_fact_only'],
        },
        siteDecisionMatchesRuntimeRecommendation: true,
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
        totalOptionCount: 1,
        recommendedOptionIdsByUseCase: {
          newProjectPlanning: 'option-ready',
          startingLineOnboarding: 'option-ready',
          accelerationRecovery: 'option-ready',
        },
        options: [{
          draftNetworkKey: 'sha256:ready',
          optionId: 'option-ready',
          selectedScenarioIds: ['pile_before_excavation'],
          isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          readiness: 'ready_for_replay',
          evaluationStatus: 'evaluation_ready',
          runtimeEngineEvidenceStatus: 'runtime_engine_evidence_ready',
          presentRuntimeEngineCodes: ['E1', 'E3', 'E5'],
          missingRuntimeEngineCodes: [],
          canClaimTruePerOptionRuntimeEvaluation: true,
          useCaseScores: {},
          proposedDependencyEdgeCount: 2,
          nextGovernanceAction: 'runtime_engine_evidence_ready',
          nextGovernanceReasons: [
            'true_per_option_runtime_e1_e3_e5_evidence_ready',
            'runtime_materialization_boundary_remains_read_only',
          ],
          recommendationDecision: {
            source: 'construction_organization_plan_network_recommendation_decision_projection',
            recommendationKind: 'construction_organization_plan_network',
            recommendationKey: 'construction_organization_plan_network:option-ready',
            actionType: 'adopted',
            optionId: 'option-ready',
            draftNetworkKey: 'sha256:ready',
            publicationKey: 'construction-organization-plan-network-release:sha256:ready',
            selectedScenarioIds: ['pile_before_excavation'],
            decidedAt: '2026-06-22T16:30:00.000Z',
            decidedBy: 'admin-1',
            siteDecisionMatchesRuntimeRecommendation: true,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
            boundaryPolicy: ['recommendation_decision_is_user_action_fact_only'],
          },
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
        }],
        boundaryPolicy: ['option_comparison_package_is_read_only'],
      },
      items: [],
    })

    const report = await getConstructionOrganizationPlanNetworkDrafts({ projectId: 'project-1' })

    expect(report.runtimeMaterializationReadiness.status).toBe('runtime_materialization_evidence_ready')
    expect(report.runtimeMaterializationReadiness.missingBeforeRuntime).toEqual([])
    expect(report.runtimeCloseoutClaim).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_ready',
      canClaimRuntimeCloseout: true,
      canMaterializeRuntime: false,
      missingBeforeClaim: [],
    }))
    expect(report.runtimeCloseoutClaimsByProjectDraftNetworkKey?.['project-1::sha256:ready']).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_closeout_claim',
      status: 'runtime_closeout_claim_ready',
      canClaimRuntimeCloseout: true,
      claimBasis: ['project_draft_scoped_closeout_claim_ready'],
    }))
    expect(report.runtimeRecommendedOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_recommended_option',
      status: 'runtime_recommended_option_ready',
      optionId: 'option-ready',
      draftNetworkKey: 'sha256:ready',
      publicationKey: 'construction-organization-plan-network-release:sha256:ready',
      canAutoAdoptRuntimeOption: false,
      siteDecision: expect.objectContaining({
        actionType: 'adopted',
        optionId: 'option-ready',
        siteDecisionMatchesRuntimeRecommendation: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      siteDecisionMatchesRuntimeRecommendation: true,
      recommendationBasis: expect.arrayContaining([
        'runtime_materialization_evidence_ready_for_option',
        'saved_network_outcome:accepted',
      ]),
      rejectedOptionIds: ['option-alternate'],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    }))
    expect(report.optionComparisonPackage.options[0]).toEqual(expect.objectContaining({
      runtimeEngineEvidenceStatus: 'runtime_engine_evidence_ready',
      presentRuntimeEngineCodes: ['E1', 'E3', 'E5'],
      missingRuntimeEngineCodes: [],
      canClaimTruePerOptionRuntimeEvaluation: true,
      nextGovernanceAction: 'runtime_engine_evidence_ready',
      recommendationDecision: expect.objectContaining({
        actionType: 'adopted',
        optionId: 'option-ready',
        siteDecisionMatchesRuntimeRecommendation: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      runtimeMaterializationEvidence: expect.objectContaining({
        status: 'missing_runtime_evidence',
        runtimeUseCases: ['newProjectPlanning'],
        runtimeUseCaseCoverage: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            canClaimRuntimeUseCaseEvidence: true,
          }),
          accelerationRecovery: expect.objectContaining({
            hasRuntimeEngineEvidence: false,
            canClaimRuntimeUseCaseEvidence: false,
          }),
        }),
        canClaimRuntimeMaterializationEvidence: false,
        missingBeforeRuntime: expect.arrayContaining([
          'runtime_consumer_observation_required',
          'post_materialization_impact_monitoring_result_required',
          'rollback_execution_verification_required',
          'saved_network_outcome_required',
        ]),
      }),
    }))
  })

  it('loads the v1.4.22.3 completion audit without converting diagnostics into completion', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      reportCode: 'v14223_completion_audit',
      declarationStatus: 'evidence_layer_ready',
      canDeclareChapterCompletionCandidate: false,
      canDeclareV14223GovernanceComplete: false,
      missingReasons: [
        'runtime_surface_closure_evidence_required',
        'section_14_acceptance_criteria_completion_evidence_required',
      ],
      requiredSurfaces: [
        'machine_execution_boundaries',
        'runtime_writer_consumer_monitoring_rollback',
      ],
      recordResults: [{
        surface: 'runtime_writer_consumer_monitoring_rollback',
        status: 'incomplete',
        missingReasons: ['evidence_level_not_completion_ready:evidence_layer_only'],
      }],
      boundaryPolicy: [
        'completion_audit_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      ],
    })

    const audit = await getRuleAssetGovernanceCompletionAudit()

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/rule-assets/governance-completion-audit',
      { runtimeCache: 'off' },
    )
    expect(audit).toEqual(expect.objectContaining({
      reportCode: 'v14223_completion_audit',
      declarationStatus: 'evidence_layer_ready',
      canDeclareChapterCompletionCandidate: false,
      canDeclareV14223GovernanceComplete: false,
      missingReasons: [
        'runtime_surface_closure_evidence_required',
        'section_14_acceptance_criteria_completion_evidence_required',
      ],
      requiredSurfaces: [
        'machine_execution_boundaries',
        'runtime_writer_consumer_monitoring_rollback',
      ],
      boundaryPolicy: [
        'completion_audit_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      ],
    }))
    expect(audit.recordResults[0]).toEqual(expect.objectContaining({
      surface: 'runtime_writer_consumer_monitoring_rollback',
      status: 'incomplete',
      missingReasons: ['evidence_level_not_completion_ready:evidence_layer_only'],
    }))
  })

  it('preserves current-snapshot completion status from the v1.4.22.3 completion audit', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      reportCode: 'v14223_completion_audit',
      declarationStatus: 'v14223_governance_complete_current_snapshot',
      canDeclareChapterCompletionCandidate: true,
      canDeclareV14223GovernanceComplete: true,
      missingReasons: [],
      requiredSurfaces: ['machine_execution_boundaries'],
      recordResults: [{
        surface: 'machine_execution_boundaries',
        status: 'verified',
        missingReasons: [],
      }],
      boundaryPolicy: [
        'completion_audit_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
        'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      ],
    })

    const audit = await getRuleAssetGovernanceCompletionAudit()

    expect(audit.declarationStatus).toBe('v14223_governance_complete_current_snapshot')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(true)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'completion_audit_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
    ]))
  })
})
