import { describe, expect, it } from 'vitest'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'
import type {
  ConstructionOrganizationPlanNetworkDraftReport,
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport,
  buildConstructionOrganizationProductOutcomeCloseoutProgress,
  buildConstructionOrganizationProductOutcomeCloseoutMatrix,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'

function readyRuntimeCloseoutClaim(): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
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
      'runtime_closeout_claim_does_not_grant_runtime_materialization',
      'requires_runtime_materialization_evidence_ready',
      'requires_site_adoption_of_runtime_recommended_option',
    ],
  }
}

function blockedRuntimeCloseoutClaim(missingBeforeClaim: string[]): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status: 'runtime_closeout_claim_blocked',
    canClaimRuntimeCloseout: false,
    canMaterializeRuntime: false,
    totalDraftCount: 1,
    claimBasis: [],
    missingBeforeClaim,
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
      'runtime_closeout_claim_does_not_grant_runtime_materialization',
      'requires_runtime_materialization_evidence_ready',
      'requires_site_adoption_of_runtime_recommended_option',
    ],
  }
}

function attachRuntimeCloseoutClaimToContexts<T extends Record<string, Record<string, unknown>>>(
  contexts: T,
  claimFactory: () => ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim = readyRuntimeCloseoutClaim,
): T {
  return Object.fromEntries(Object.entries(contexts).map(([businessType, context]) => [
    businessType,
    {
      ...context,
      runtimeCloseoutClaim: claimFactory(),
    },
  ])) as unknown as T
}

function attachRuntimeCloseoutClaimsByBusinessType<T extends Record<string, Record<string, unknown>>>(
  contexts: T,
  claimsByBusinessType: Record<string, ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim>,
): T {
  return Object.fromEntries(Object.entries(contexts).map(([businessType, context]) => [
    businessType,
    {
      ...context,
      runtimeCloseoutClaim: claimsByBusinessType[businessType] ?? null,
    },
  ])) as unknown as T
}

function readyRuntimeUseCaseCoverage(...useCases: string[]) {
  return Object.fromEntries(useCases.map((useCase) => [
    useCase,
    {
      hasRuntimeConsumerObservation: true,
      hasImpactMonitoringResult: true,
      hasRollbackExecutionVerification: true,
      hasSavedNetworkOutcome: true,
      hasRuntimeEngineEvidence: true,
      canClaimRuntimeUseCaseEvidence: true,
    },
  ]))
}

describe('constructionOrganizationProductOutcomeCloseoutMatrixService', () => {
  it('builds the product closeout matrix from the shared plan network report projection', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 3,
      totalDraftCount: 3,
      readyForReplayCount: 3,
      evaluationReadyCount: 3,
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil',
          draftNetworkKey: 'draft-general-civil',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
            runtimeUseCases: ['newProjectPlanning', 'accelerationRecovery'],
            runtimeUseCaseCoverage: readyRuntimeUseCaseCoverage('newProjectPlanning', 'accelerationRecovery'),
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'evidence_only' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [{
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-general-civil',
        optionId: 'option-general-civil',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number]],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })

    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      hasRuntimeCloseoutClaimEvidence: true,
      hasRealRuntimeEvidenceSource: true,
      runtimeEvidenceOptionCount: 1,
      runtimeEvidenceRuntimeReadyOptionCount: 1,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 1,
      runtimeReadyUseCaseOptionCounts: expect.objectContaining({
        newProjectPlanning: 1,
        startingLineOnboarding: 0,
        accelerationRecovery: 1,
      }),
      runtimeReadyUseCaseOptionCloseoutClaimCounts: expect.objectContaining({
        newProjectPlanning: 1,
        startingLineOnboarding: 0,
        accelerationRecovery: 1,
      }),
      runtimeEvidenceUseCases: ['newProjectPlanning', 'accelerationRecovery'],
      missingReasons: expect.arrayContaining([
        'runtime_use_case_coverage_required:startingLineOnboarding',
      ]),
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not count evidence-only product entry scores as runtime-ready use-case coverage', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil',
          draftNetworkKey: 'draft-general-civil',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 80, actionability: 'evidence_only' },
            accelerationRecovery: { optionScore: 70, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [{
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-general-civil',
        optionId: 'option-general-civil',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number]],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((row) => row.businessType === 'general_civil')

    expect(row?.runtimeReadyUseCaseOptionCounts.startingLineOnboarding).toBe(0)
    expect(row?.runtimeReadyUseCaseOptionCloseoutClaimCounts.startingLineOnboarding).toBe(0)
    expect(row?.runtimeEvidenceUseCases).not.toContain('startingLineOnboarding')
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_use_case_coverage_required:startingLineOnboarding',
    ]))
  })

  it('does not count product entry coverage unless runtime evidence declares full-chain coverage for that use case', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil',
          draftNetworkKey: 'draft-general-civil',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
            runtimeUseCases: ['accelerationRecovery'],
            runtimeUseCaseCoverage: {
              accelerationRecovery: {
                hasRuntimeConsumerObservation: true,
                hasImpactMonitoringResult: false,
                hasRollbackExecutionVerification: true,
                hasSavedNetworkOutcome: true,
                hasRuntimeEngineEvidence: true,
                canClaimRuntimeUseCaseEvidence: false,
              },
            },
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 80, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 70, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [{
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-general-civil',
        optionId: 'option-general-civil',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number]],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((row) => row.businessType === 'general_civil')

    expect(row?.runtimeReadyUseCaseOptionCounts).toEqual(expect.objectContaining({
      newProjectPlanning: 0,
      startingLineOnboarding: 0,
      accelerationRecovery: 0,
    }))
    expect(row?.runtimeReadyUseCaseOptionCloseoutClaimCounts).toEqual(expect.objectContaining({
      newProjectPlanning: 0,
      startingLineOnboarding: 0,
      accelerationRecovery: 0,
    }))
    expect(row?.runtimeEvidenceUseCases).toEqual([])
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_use_case_coverage_required:newProjectPlanning',
      'runtime_use_case_coverage_required:startingLineOnboarding',
      'runtime_use_case_coverage_required:accelerationRecovery',
    ]))
  })

  it('does not let ready draft closeout claims override a blocked project-scoped closeout claim', () => {
    const readyDraftClaim = readyRuntimeCloseoutClaim()
    const blockedSelectedProjectClaim = blockedRuntimeCloseoutClaim([
      'site_adoption_of_runtime_recommended_option_required',
    ])
    const selectedDraftNetworkKeys = [
      'selected-draft-network-a',
      'selected-draft-network-b',
      'selected-draft-network-c',
    ]
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalReviewPackageItems: 4,
      totalDraftCount: 4,
      readyForReplayCount: 4,
      evaluationReadyCount: 4,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 4,
      totalManualReviewHandoffCount: 4,
      linkedManualReviewHandoffCount: 4,
      totalManualReviewApprovalCount: 4,
      linkedManualReviewApprovalCount: 4,
      totalReleaseExitHandoffCount: 4,
      linkedReleaseExitHandoffCount: 4,
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: blockedSelectedProjectClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-selected-blocked': blockedSelectedProjectClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: Object.fromEntries(
        selectedDraftNetworkKeys.map((draftNetworkKey) => [draftNetworkKey, readyDraftClaim]),
      ),
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 3,
        options: ['selected-option-a', 'selected-option-b', 'selected-option-c'].map((optionId, index) => ({
            optionId,
            draftNetworkKey: selectedDraftNetworkKeys[index],
            runtimeMaterializationEvidence: {
              canClaimRuntimeMaterializationEvidence: true,
            },
            useCaseScores: {
              newProjectPlanning: { optionScore: 90 - index, actionability: 'actionable_candidate' },
              startingLineOnboarding: { optionScore: 88 - index, actionability: 'actionable_candidate' },
              accelerationRecovery: { optionScore: 86 - index, actionability: 'actionable_candidate' },
            },
        })),
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: ['selected-option-a', 'selected-option-b', 'selected-option-c'].map((optionId, index) => ({
          projectId: 'project-selected-blocked',
          businessType: 'general_civil',
          draftNetworkKey: selectedDraftNetworkKeys[index],
          optionId,
          runtimeEngineEvidence: {
            publicationKey: `publication-selected-${index + 1}`,
          },
      })) as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((row) => row.businessType === 'general_civil')

    expect(row?.runtimeEvidenceProjectIds).toEqual(['project-selected-blocked'])
    expect(row).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      hasRuntimeCloseoutClaimEvidence: false,
      runtimeClaimStatus: 'runtime_closeout_claim_blocked',
      runtimeClaimMissingReasons: [
        'site_adoption_of_runtime_recommended_option_required',
      ],
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_by_business_type_required',
      'site_adoption_of_runtime_recommended_option_required',
    ]))
  })

  it('does not treat engine-only prediction evidence as a real runtime source before closeout evidence is complete', () => {
    const runtimeClaim = blockedRuntimeCloseoutClaim([
      'site_adoption_of_runtime_recommended_option_required',
      'runtime_consumer_observation_required',
      'saved_network_outcome_required',
      'post_materialization_impact_monitoring_result_required',
      'rollback_execution_verification_required',
    ])
    const report = {
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil',
          draftNetworkKey: 'draft-general-civil',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [{
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-general-civil',
        optionId: 'option-general-civil',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number]],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      hasRuntimeCloseoutClaimEvidence: false,
      hasRealRuntimeEvidenceSource: false,
      runtimeEvidenceSources: [],
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.runtimeEvidenceSources).not.toContain('runtime')
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_by_business_type_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not reuse project-level ready closeout claims for a draft without its own closeout claim', () => {
    const projectRuntimeClaim = readyRuntimeCloseoutClaim()
    const report = {
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: projectRuntimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': projectRuntimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {},
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil',
          draftNetworkKey: 'draft-general-civil',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [{
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-general-civil',
        optionId: 'option-general-civil',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number]],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      hasRuntimeCloseoutClaimEvidence: false,
      hasRealRuntimeEvidenceSource: false,
      runtimeEvidenceSources: [],
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_by_business_type_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not close a business type when only one of three runtime-ready draft networks has a draft-scoped closeout claim', () => {
    const draftClaim = readyRuntimeCloseoutClaim()
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 3,
      totalDraftCount: 3,
      readyForReplayCount: 3,
      evaluationReadyCount: 3,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 3,
      totalManualReviewHandoffCount: 3,
      linkedManualReviewHandoffCount: 3,
      totalManualReviewApprovalCount: 3,
      linkedManualReviewApprovalCount: 3,
      totalReleaseExitHandoffCount: 3,
      linkedReleaseExitHandoffCount: 3,
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: draftClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': draftClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil-a': draftClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 3,
        options: ['a', 'b', 'c'].map((suffix) => ({
          optionId: `option-general-civil-${suffix}`,
          draftNetworkKey: `draft-general-civil-${suffix}`,
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        })),
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: ['a', 'b', 'c'].map((suffix) => ({
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: `draft-general-civil-${suffix}`,
        optionId: `option-general-civil-${suffix}`,
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number])),
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      hasRuntimeCloseoutClaimEvidence: true,
      hasRealRuntimeEvidenceSource: true,
      runtimeEvidenceOptionCount: 3,
      runtimeEvidenceRuntimeReadyOptionCount: 3,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 1,
      hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: false,
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_ready_option_closeout_claim_coverage_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not count runtime-ready option evidence when the option draft key conflicts with the item draft key', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
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
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil-a': runtimeClaim,
        'draft-general-civil-b': runtimeClaim,
        'draft-general-civil-c': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 3,
        options: ['a', 'b', 'c'].map((suffix) => ({
          optionId: `option-general-civil-${suffix}`,
          draftNetworkKey: `draft-foreign-${suffix}`,
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        })),
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: ['a', 'b', 'c'].map((suffix) => ({
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: `draft-general-civil-${suffix}`,
        optionId: `option-general-civil-${suffix}`,
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number])),
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      runtimeEvidenceOptionCount: 3,
      hasRequiredRuntimeOptionNetworkCoverage: true,
      runtimeEvidenceRuntimeReadyOptionCount: 0,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
      runtimeReadyUseCaseOptionCounts: {
        newProjectPlanning: 0,
        startingLineOnboarding: 0,
        accelerationRecovery: 0,
      },
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_ready_option_network_coverage_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not count legacy option-id fallback when the option id maps to multiple draft networks', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: 'project-1',
      totalReviewPackageItems: 3,
      totalDraftCount: 3,
      readyForReplayCount: 3,
      evaluationReadyCount: 3,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 3,
      totalManualReviewHandoffCount: 3,
      linkedManualReviewHandoffCount: 3,
      totalManualReviewApprovalCount: 3,
      linkedManualReviewApprovalCount: 3,
      totalReleaseExitHandoffCount: 3,
      linkedReleaseExitHandoffCount: 3,
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-1': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil-a': runtimeClaim,
        'draft-general-civil-b': runtimeClaim,
        'draft-general-civil-c': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 1,
        options: [{
          optionId: 'option-general-civil-shared',
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        }],
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: ['a', 'b', 'c'].map((suffix) => ({
        projectId: 'project-1',
        businessType: 'general_civil',
        draftNetworkKey: `draft-general-civil-${suffix}`,
        optionId: 'option-general-civil-shared',
        runtimeEngineEvidence: {
          publicationKey: 'publication-general-civil',
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number])),
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      runtimeEvidenceOptionCount: 3,
      hasRequiredRuntimeOptionNetworkCoverage: true,
      runtimeEvidenceRuntimeReadyOptionCount: 0,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
      runtimeReadyUseCaseOptionCounts: {
        newProjectPlanning: 0,
        startingLineOnboarding: 0,
        accelerationRecovery: 0,
      },
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_ready_option_network_coverage_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not combine runtime option coverage from different projects into one business-type closeout', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalReviewPackageItems: 3,
      totalDraftCount: 3,
      readyForReplayCount: 3,
      evaluationReadyCount: 3,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 3,
      totalManualReviewHandoffCount: 3,
      linkedManualReviewHandoffCount: 3,
      totalManualReviewApprovalCount: 3,
      linkedManualReviewApprovalCount: 3,
      totalReleaseExitHandoffCount: 3,
      linkedReleaseExitHandoffCount: 3,
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-a': runtimeClaim,
        'project-b': runtimeClaim,
        'project-c': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil-a': runtimeClaim,
        'draft-general-civil-b': runtimeClaim,
        'draft-general-civil-c': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 3,
        options: ['a', 'b', 'c'].map((suffix) => ({
          optionId: `option-general-civil-${suffix}`,
          draftNetworkKey: `draft-general-civil-${suffix}`,
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        })),
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: ['a', 'b', 'c'].map((suffix) => ({
        projectId: `project-${suffix}`,
        businessType: 'general_civil',
        draftNetworkKey: `draft-general-civil-${suffix}`,
        optionId: `option-general-civil-${suffix}`,
        runtimeEngineEvidence: {
          publicationKey: `publication-general-civil-${suffix}`,
        },
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number])),
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      runtimeEvidenceOptionCount: 1,
      runtimeEvidenceRuntimeReadyOptionCount: 1,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 1,
      hasRequiredRuntimeOptionNetworkCoverage: false,
      hasRequiredRuntimeReadyOptionNetworkCoverage: false,
      hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: false,
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_option_network_coverage_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not reuse a closeout claim from another project for the selected runtime evidence context', () => {
    const runtimeClaim = readyRuntimeCloseoutClaim()
    const report = {
      source: 'construction_organization_plan_network_draft_read_model',
      companyId: 'company-1',
      projectId: null,
      totalReviewPackageItems: 4,
      totalDraftCount: 4,
      readyForReplayCount: 4,
      evaluationReadyCount: 4,
      partialEvaluationCount: 0,
      evidenceOnlyCount: 0,
      blockedCount: 0,
      totalEdgeCount: 4,
      totalManualReviewHandoffCount: 4,
      linkedManualReviewHandoffCount: 4,
      totalManualReviewApprovalCount: 4,
      linkedManualReviewApprovalCount: 4,
      totalReleaseExitHandoffCount: 4,
      linkedReleaseExitHandoffCount: 4,
      runtimeMaterializationReadiness: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeMaterializationReadiness'],
      runtimeCloseoutClaim: runtimeClaim,
      runtimeCloseoutClaimLineage: {
        workPackageKey: null,
        useCase: null,
        evidenceAction: null,
      },
      runtimeCloseoutClaimsByProject: {
        'project-claim-only': runtimeClaim,
      },
      runtimeCloseoutClaimsByDraftNetworkKey: {
        'draft-general-civil-claim-only': runtimeClaim,
      },
      runtimeRecommendedOption: {} as ConstructionOrganizationPlanNetworkDraftReport['runtimeRecommendedOption'],
      recommendedDrafts: {} as ConstructionOrganizationPlanNetworkDraftReport['recommendedDrafts'],
      optionComparisonPackage: {
        source: 'construction_organization_plan_network_option_comparison_package',
        optionCount: 3,
        options: ['a', 'b', 'c'].map((suffix) => ({
          optionId: `option-general-civil-${suffix}`,
          draftNetworkKey: `draft-general-civil-${suffix}`,
          runtimeMaterializationEvidence: {
            canClaimRuntimeMaterializationEvidence: true,
          },
          useCaseScores: {
            newProjectPlanning: { optionScore: 90, actionability: 'actionable_candidate' },
            startingLineOnboarding: { optionScore: 88, actionability: 'actionable_candidate' },
            accelerationRecovery: { optionScore: 86, actionability: 'actionable_candidate' },
          },
        })),
      } as unknown as ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage'],
      items: [
        ...['a', 'b', 'c'].map((suffix) => ({
          projectId: 'project-runtime-options',
          businessType: 'general_civil',
          draftNetworkKey: `draft-general-civil-${suffix}`,
          optionId: `option-general-civil-${suffix}`,
          runtimeEngineEvidence: {
            publicationKey: `publication-general-civil-${suffix}`,
          },
        } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number])),
        {
          projectId: 'project-claim-only',
          businessType: 'general_civil',
          draftNetworkKey: 'draft-general-civil-claim-only',
          optionId: 'option-general-civil-claim-only',
          runtimeEngineEvidence: {
            publicationKey: 'publication-general-civil-claim-only',
          },
        } as unknown as ConstructionOrganizationPlanNetworkDraftReport['items'][number],
      ],
      boundaryPolicy: ['plan_network_draft_is_not_runtime_materialization'],
    } satisfies ConstructionOrganizationPlanNetworkDraftReport

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      planNetworkReport: report,
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      runtimeEvidenceOptionCount: 3,
      runtimeEvidenceRuntimeReadyOptionCount: 3,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: 0,
      hasRuntimeCloseoutClaimEvidence: false,
      hasRealRuntimeEvidenceSource: false,
      hasRuntimeCloseoutClaim: false,
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_by_business_type_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('does not fallback to a business-type aggregate claim when a runtime evidence context is selected without a scoped claim', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-selected'],
          draftNetworkKeys: ['draft-selected-a', 'draft-selected-b', 'draft-selected-c'],
          optionIds: ['option-selected-a', 'option-selected-b', 'option-selected-c'],
          publicationKeys: ['publication-selected'],
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
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: readyRuntimeCloseoutClaim(),
      },
    })
    const row = matrix.rows.find((candidate) => candidate.businessType === 'general_civil')

    expect(row).toEqual(expect.objectContaining({
      hasRuntimeCloseoutClaimEvidence: false,
      hasRealRuntimeEvidenceSource: false,
      hasRuntimeCloseoutClaim: false,
      status: 'product_outcome_closeout_incomplete',
    }))
    expect(row?.missingReasons).toEqual(expect.arrayContaining([
      'runtime_closeout_claim_by_business_type_required',
    ]))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('projects product outcome closeout progress without changing matrix readiness', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-1'],
          draftNetworkKeys: ['draft-general-civil'],
          optionIds: ['option-general-civil'],
          publicationKeys: ['publication-general-civil'],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 1,
          runtimeCloseoutClaim: readyRuntimeCloseoutClaim(),
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: readyRuntimeCloseoutClaim(),
      },
    })

    const progress = buildConstructionOrganizationProductOutcomeCloseoutProgress(matrix)

    expect(progress).toEqual(expect.objectContaining({
      source: 'construction_organization_product_outcome_closeout_progress',
      status: 'product_outcome_closeout_incomplete',
      canDeclareConstructionOrganizationProductOutcomeCloseout: false,
      supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      precisionReplayReadyBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      runtimeOutcomeReadyBusinessTypeCount: 0,
      readyBusinessTypes: [],
      missingBusinessTypes: expect.arrayContaining(['general_civil', 'hospital']),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_option_network_evidence_for_business_type',
        'collect_runtime_closeout_claim_for_business_type',
      ]),
      nextEvidenceWorkItemCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      nextEvidenceWorkPackageCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      prefillableWorkPackageCount: 1,
      blockedWorkPackageCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length - 1,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
      boundaryPolicy: expect.arrayContaining([
        'progress_projection_is_read_only',
        'progress_projection_does_not_replace_product_outcome_closeout_matrix',
      ]),
    }))
    expect(progress.useCaseCoverage.newProjectPlanning).toEqual(expect.objectContaining({
      readyBusinessTypeCount: 0,
      missingBusinessTypes: expect.arrayContaining(['general_civil']),
    }))
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
  })

  it('keeps product outcome closeout incomplete until every supported business type has runtime closeout evidence', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: readyRuntimeCloseoutClaim(),
      },
    })

    expect(matrix).toEqual(expect.objectContaining({
      source: 'construction_organization_product_outcome_closeout_matrix',
      status: 'product_outcome_closeout_incomplete',
      canDeclareConstructionOrganizationProductOutcomeCloseout: false,
      supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      runtimeOutcomeReadyBusinessTypeCount: 0,
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_closeout_claim_for_business_type',
      ]),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(matrix.rows).toHaveLength(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      hasPrecisionReplayEvidence: true,
      hasRuntimeCloseoutClaimEvidence: true,
      hasRuntimeCloseoutClaim: false,
      hasRealRuntimeEvidenceSource: false,
      missingReasons: ['real_runtime_evidence_source_required'],
      nextEvidenceActions: ['collect_real_runtime_evidence_for_business_type'],
    }))
    expect(matrix.rows.find((row) => row.businessType === 'hospital')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      hasPrecisionReplayEvidence: true,
      hasRuntimeCloseoutClaim: false,
      missingReasons: expect.arrayContaining([
        'runtime_closeout_claim_by_business_type_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_closeout_claim_for_business_type',
      ]),
      nextEvidenceOperations: [],
    }))
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'hospital:runtime_closeout_claim_by_business_type_required',
      'modular_building:runtime_closeout_claim_by_business_type_required',
    ]))
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'precision_replay_is_not_runtime_product_outcome',
      'single_project_runtime_closeout_does_not_prove_all_business_types',
      'product_outcome_closeout_does_not_grant_auto_materialization',
    ]))
  })

  it('does not map missing runtime closeout claim projections to recommendation adoption operations', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
    })
    const hospital = matrix.rows.find((row) => row.businessType === 'hospital')

    expect(hospital).toEqual(expect.objectContaining({
      missingReasons: expect.arrayContaining([
        'runtime_closeout_claim_by_business_type_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_closeout_claim_for_business_type',
      ]),
    }))
    expect(hospital?.nextEvidenceOperations.some((operation) =>
      operation.evidenceAction === 'collect_runtime_closeout_claim_for_business_type')).toBe(false)
    expect(matrix.nextEvidenceOperations.some((operation) =>
      operation.evidenceAction === 'collect_runtime_closeout_claim_for_business_type')).toBe(false)
  })

  it('does not map runtime closeout-claim coverage deficits to direct recommendation adoption operations', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [`sha256:${businessType}`],
          optionIds: [`option-${businessType}`],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
          runtimeReadyOptionCloseoutClaimCount: 0,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 3,
            accelerationRecovery: 3,
          },
          runtimeReadyUseCaseOptionCloseoutClaimCounts: {
            newProjectPlanning: 0,
            startingLineOnboarding: 0,
            accelerationRecovery: 0,
          },
        },
      ]),
    ))
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })
    const generalCivil = matrix.rows.find((row) => row.businessType === 'general_civil')

    expect(generalCivil).toEqual(expect.objectContaining({
      missingReasons: expect.arrayContaining([
        'runtime_ready_option_closeout_claim_coverage_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
      ]),
    }))
    const closeoutProjectionActions = new Set([
      'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
      'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
    ])
    expect(generalCivil?.nextEvidenceOperations.some((operation) =>
      closeoutProjectionActions.has(operation.evidenceAction))).toBe(false)
    expect(matrix.nextEvidenceExecutionPlan.some((item) =>
      closeoutProjectionActions.has(item.evidenceAction))).toBe(false)
    expect(matrix.nextEvidenceWorkPackages.flatMap((item) => item.executionSteps).some((step) =>
      closeoutProjectionActions.has(step.evidenceAction))).toBe(false)
  })

  it('maps blocked runtime closeout gaps to controlled next evidence operations', () => {
    const generalCivilClaim = blockedRuntimeCloseoutClaim([
      'runtime_consumer_observation_required',
      'saved_network_outcome_required',
      'true_per_option_E1_E3_E5_runtime_evidence_required',
      'site_adoption_of_runtime_recommended_option_required',
    ])
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-1'],
          draftNetworkKeys: ['sha256:general-civil'],
          optionIds: ['option-general-civil'],
          publicationKeys: ['publication-general-civil'],
          runtimeCloseoutClaim: generalCivilClaim,
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: generalCivilClaim,
      },
    })

    expect(matrix.nextEvidenceOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceAction: 'record_runtime_consumer_observation_for_business_type',
        operationAction: 'runtime_consumer_observation',
        assetType: 'construction_organization_plan_network',
      }),
      expect.objectContaining({
        evidenceAction: 'record_saved_network_outcome_for_business_type',
        operationAction: 'runtime_saved_outcome',
        assetType: 'construction_organization_plan_network',
      }),
      expect.objectContaining({
        evidenceAction: 'record_E1_E3_E5_runtime_accuracy_for_business_type',
        operationAction: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
      }),
      expect.objectContaining({
        evidenceAction: 'record_site_adoption_for_business_type',
        operationAction: 'runtime_recommendation_adopt',
        assetType: 'construction_organization_plan_network',
      }),
    ]))
    expect(matrix.nextEvidenceWorkItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessType: 'general_civil',
        runtimeEvidenceProjectIds: ['project-1'],
        runtimeEvidenceDraftNetworkKeys: ['sha256:general-civil'],
        runtimeEvidenceOptionIds: ['option-general-civil'],
        runtimeEvidencePublicationKeys: ['publication-general-civil'],
        missingReasons: expect.arrayContaining([
          'saved_network_outcome_required',
        ]),
        nextEvidenceOperations: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'general_civil',
            operationAction: 'runtime_saved_outcome',
          }),
        ]),
      }),
    ]))
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      runtimeClaimStatus: 'runtime_closeout_claim_blocked',
      runtimeEvidenceProjectIds: ['project-1'],
      runtimeEvidenceDraftNetworkKeys: ['sha256:general-civil'],
      runtimeEvidenceOptionIds: ['option-general-civil'],
      runtimeEvidencePublicationKeys: ['publication-general-civil'],
      nextEvidenceOperations: expect.arrayContaining([
        expect.objectContaining({
          businessType: 'general_civil',
          evidenceAction: 'record_saved_network_outcome_for_business_type',
          operationAction: 'runtime_saved_outcome',
        }),
      ]),
    }))
  })

  it('exposes numeric A/B/C runtime evidence deficits per business type and product entry', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-1'],
          draftNetworkKeys: ['draft-a'],
          optionIds: ['option-a'],
          publicationKeys: ['publication-a'],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 1,
          runtimeReadyOptionCount: 1,
          runtimeReadyOptionCloseoutClaimCount: 0,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 1,
            startingLineOnboarding: 2,
            accelerationRecovery: 0,
          },
          runtimeReadyUseCaseOptionCloseoutClaimCounts: {
            newProjectPlanning: 0,
            startingLineOnboarding: 1,
            accelerationRecovery: 0,
          },
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: readyRuntimeCloseoutClaim(),
      },
    })

    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
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
    }))
    expect(matrix.nextEvidenceWorkItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessType: 'general_civil',
        runtimeEvidenceOptionDeficit: 2,
        runtimeEvidenceRuntimeReadyOptionDeficit: 2,
        runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: 3,
        runtimeReadyUseCaseOptionDeficits: expect.objectContaining({
          accelerationRecovery: 3,
        }),
        runtimeReadyUseCaseOptionCloseoutClaimDeficits: expect.objectContaining({
          startingLineOnboarding: 2,
        }),
      }),
    ]))
    expect(matrix.nextEvidenceExecutionPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessType: 'general_civil',
        useCase: 'newProjectPlanning',
        evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
        operationAction: 'runtime_engine_evidence',
        requiredCount: 3,
        currentCount: 1,
        deficit: 2,
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }),
    ]))
    expect(matrix.nextEvidenceExecutionPlan.some((item) =>
      item.evidenceAction === 'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type')).toBe(false)
    expect(matrix.nextEvidenceWorkPackages).toEqual(expect.arrayContaining([expect.objectContaining({
      source: 'construction_organization_product_outcome_evidence_work_package',
      workPackageKey: 'construction_organization_product_outcome:general_civil',
      businessType: 'general_civil',
      status: 'evidence_work_package_open',
      runtimeEvidenceProjectIds: ['project-1'],
      runtimeEvidenceDraftNetworkKeys: ['draft-a'],
      runtimeEvidenceOptionIds: ['option-a'],
      runtimeEvidencePublicationKeys: ['publication-a'],
      executionPlanItemCount: 5,
      prefillableExecutionStepCount: 5,
      blockedExecutionStepCount: 0,
      executionReadinessStatus: 'ready_for_controlled_prefill',
      missingRuntimeAnchorReasons: [],
      totalDeficit: 10,
      operationActions: expect.arrayContaining([
        'runtime_engine_evidence',
      ]),
      executionSteps: expect.arrayContaining([
        expect.objectContaining({
          source: 'construction_organization_product_outcome_evidence_work_package_step',
          workPackageKey: 'construction_organization_product_outcome:general_civil',
          businessType: 'general_civil',
          useCase: 'newProjectPlanning',
          evidenceAction: 'collect_runtime_ready_use_case_option_evidence_for_business_type',
          operationAction: 'runtime_engine_evidence',
          currentCount: 1,
          deficit: 2,
          runtimeEvidenceProjectIds: ['project-1'],
          runtimeEvidenceDraftNetworkKeys: ['draft-a'],
          runtimeEvidencePublicationKeys: ['publication-a'],
          canPrefillControlledOperation: true,
          executionStatus: 'ready_for_controlled_prefill',
          missingRuntimeAnchors: [],
        }),
      ]),
      useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
      requiredAttributionDimensions: ['businessType', 'draftNetworkKey', 'publicationKey'],
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
      boundaryPolicy: expect.arrayContaining([
        'work_package_is_auditable_guidance_only',
        'work_package_does_not_fabricate_runtime_evidence',
        'work_package_requires_strict_business_type_draft_publication_attribution',
      ]),
    })]))
  })

  it('marks evidence work-package steps blocked when runtime anchors are missing', () => {
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType: {
        hospital: blockedRuntimeCloseoutClaim([
          'saved_network_outcome_required',
          'true_per_option_E1_E3_E5_runtime_evidence_required',
        ]),
      },
    })

    expect(matrix.nextEvidenceWorkPackages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessType: 'hospital',
        status: 'evidence_work_package_open',
        executionReadinessStatus: 'blocked_missing_runtime_anchors',
        prefillableExecutionStepCount: 0,
        blockedExecutionStepCount: expect.any(Number),
        missingRuntimeAnchorReasons: [
          'projectId_anchor_required',
          'draftNetworkKey_anchor_required',
          'publicationKey_anchor_required',
        ],
        executionSteps: expect.arrayContaining([
          expect.objectContaining({
            businessType: 'hospital',
            canPrefillControlledOperation: false,
            executionStatus: 'blocked_missing_runtime_anchors',
            missingRuntimeAnchors: ['projectId', 'draftNetworkKey', 'publicationKey'],
          }),
        ]),
      }),
    ]))
  })

  it('maps runtime business type attribution gaps to explicit product outcome evidence actions', () => {
    const generalCivilClaim = blockedRuntimeCloseoutClaim([
      'runtime_business_type_attribution_required',
    ])
    const hospitalClaim = blockedRuntimeCloseoutClaim([
      'runtime_business_type_conflict:general_civil',
    ])
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeEvidenceContextsByBusinessType: {
        general_civil: {
          projectIds: ['project-1'],
          draftNetworkKeys: ['sha256:general-civil'],
          optionIds: ['option-general-civil'],
          publicationKeys: ['publication-general-civil'],
          runtimeCloseoutClaim: generalCivilClaim,
        },
        hospital: {
          projectIds: ['project-2'],
          draftNetworkKeys: ['sha256:hospital'],
          optionIds: ['option-hospital'],
          publicationKeys: ['publication-hospital'],
          runtimeCloseoutClaim: hospitalClaim,
        },
      },
      runtimeCloseoutClaimsByBusinessType: {
        general_civil: generalCivilClaim,
        hospital: hospitalClaim,
      },
    })

    expect(matrix.nextEvidenceActions).toEqual(expect.arrayContaining([
      'resolve_runtime_business_type_attribution_for_business_type',
      'resolve_runtime_business_type_conflict_for_business_type',
    ]))
    expect(matrix.nextEvidenceActions).not.toContain('resolve_product_outcome_closeout_evidence_for_business_type')
    expect(matrix.nextEvidenceOperations.some((operation) =>
      operation.evidenceAction === 'resolve_runtime_business_type_attribution_for_business_type')).toBe(false)
    expect(matrix.nextEvidenceOperations.some((operation) =>
      operation.evidenceAction === 'resolve_runtime_business_type_conflict_for_business_type')).toBe(false)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      missingReasons: expect.arrayContaining([
        'runtime_business_type_attribution_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'resolve_runtime_business_type_attribution_for_business_type',
      ]),
    }))
    expect(matrix.rows.find((row) => row.businessType === 'hospital')).toEqual(expect.objectContaining({
      missingReasons: expect.arrayContaining([
        'runtime_business_type_conflict:general_civil',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'resolve_runtime_business_type_conflict_for_business_type',
      ]),
    }))
    expect(matrix.nextEvidenceWorkItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessType: 'general_civil',
        nextEvidenceActions: expect.arrayContaining([
          'resolve_runtime_business_type_attribution_for_business_type',
        ]),
        nextEvidenceOperations: [],
      }),
      expect.objectContaining({
        businessType: 'hospital',
        nextEvidenceActions: expect.arrayContaining([
          'resolve_runtime_business_type_conflict_for_business_type',
        ]),
        nextEvidenceOperations: [],
      }),
    ]))
  })

  it('declares product outcome closeout only when all replayed business types have ready runtime claims', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [`sha256:${businessType}`],
          optionIds: [`option-${businessType}`],
          publicationKeys: [`publication-${businessType}`],
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
        },
      ]),
    ))
    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_ready')
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(true)
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length)
    expect(matrix.missingReasons).toEqual([])
    expect(matrix.nextEvidenceActions).toEqual([])
  })

  it('does not declare product outcome closeout when runtime evidence covers only one product entry point', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [`sha256:${businessType}`],
          optionIds: [`option-${businessType}`],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
        },
      ]),
    ))

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      runtimeEvidenceUseCases: [],
      missingReasons: expect.arrayContaining([
        'runtime_use_case_coverage_required:newProjectPlanning',
        'runtime_use_case_coverage_required:startingLineOnboarding',
        'runtime_use_case_coverage_required:accelerationRecovery',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_use_case_evidence_for_business_type',
      ]),
      nextEvidenceOperations: expect.arrayContaining([
        expect.objectContaining({
          evidenceAction: 'collect_runtime_use_case_evidence_for_business_type',
          operationAction: 'runtime_engine_evidence',
          assetType: 'construction_organization_plan_network',
        }),
      ]),
    }))
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'general_civil:runtime_use_case_coverage_required:newProjectPlanning',
      'hospital:runtime_use_case_coverage_required:startingLineOnboarding',
    ]))
  })

  it('does not accept runtime use-case coverage that is not backed by runtime-ready option evidence', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [
            `sha256:${businessType}:recommended`,
            `sha256:${businessType}:foundation-alt`,
            `sha256:${businessType}:release-alt`,
          ],
          optionIds: [
            `option-${businessType}-recommended`,
            `option-${businessType}-foundation-alt`,
            `option-${businessType}-release-alt`,
          ],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
          runtimeReadyOptionCloseoutClaimCount: 3,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 0,
            accelerationRecovery: 0,
          },
          runtimeReadyUseCaseOptionCloseoutClaimCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 0,
            accelerationRecovery: 0,
          },
        },
      ]),
    ))

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      runtimeEvidenceUseCases: ['newProjectPlanning'],
      hasRequiredRuntimeUseCaseCoverage: false,
      hasRequiredRuntimeReadyUseCaseOptionCoverage: false,
      missingReasons: expect.arrayContaining([
        'runtime_use_case_coverage_required:startingLineOnboarding',
        'runtime_use_case_coverage_required:accelerationRecovery',
        'runtime_ready_use_case_option_coverage_required:startingLineOnboarding',
        'runtime_ready_use_case_option_coverage_required:accelerationRecovery',
      ]),
    }))
  })

  it('does not declare product outcome closeout when runtime evidence contains only one plan option', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [`sha256:${businessType}`],
          optionIds: [`option-${businessType}`],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 1,
        },
      ]),
    ))

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      runtimeEvidenceOptionCount: 1,
      hasRequiredRuntimeOptionNetworkCoverage: false,
      missingReasons: expect.arrayContaining([
        'runtime_option_network_coverage_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_option_network_evidence_for_business_type',
      ]),
      nextEvidenceOperations: expect.arrayContaining([
        expect.objectContaining({
          evidenceAction: 'collect_runtime_option_network_evidence_for_business_type',
          operationAction: 'runtime_engine_evidence',
          assetType: 'construction_organization_plan_network',
        }),
      ]),
    }))
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'general_civil:runtime_option_network_coverage_required',
      'hospital:runtime_option_network_coverage_required',
    ]))
  })

  it('does not declare product outcome closeout when only one option has real runtime materialization evidence', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [
            `sha256:${businessType}:recommended`,
            `sha256:${businessType}:foundation-alt`,
            `sha256:${businessType}:release-alt`,
          ],
          optionIds: [
            `option-${businessType}-recommended`,
            `option-${businessType}-foundation-alt`,
            `option-${businessType}-release-alt`,
          ],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 1,
        },
      ]),
    ))

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      runtimeEvidenceOptionCount: 3,
      runtimeEvidenceRuntimeReadyOptionCount: 1,
      hasRequiredRuntimeOptionNetworkCoverage: true,
      hasRequiredRuntimeReadyOptionNetworkCoverage: false,
      missingReasons: expect.arrayContaining([
        'runtime_ready_option_network_coverage_required',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_ready_option_network_evidence_for_business_type',
      ]),
    }))
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'general_civil:runtime_ready_option_network_coverage_required',
      'hospital:runtime_ready_option_network_coverage_required',
    ]))
  })

  it('does not declare product outcome closeout when runtime-ready options do not cover every product entry point', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimToContexts(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [
            `sha256:${businessType}:new-project`,
            `sha256:${businessType}:starting-line`,
            `sha256:${businessType}:acceleration`,
          ],
          optionIds: [
            `option-${businessType}-new-project`,
            `option-${businessType}-starting-line`,
            `option-${businessType}-acceleration`,
          ],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 1,
            startingLineOnboarding: 1,
            accelerationRecovery: 1,
          },
        },
      ]),
    ))

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.rows.find((row) => row.businessType === 'general_civil')).toEqual(expect.objectContaining({
      status: 'product_outcome_closeout_incomplete',
      runtimeEvidenceRuntimeReadyOptionCount: 3,
      runtimeReadyUseCaseOptionCounts: {
        newProjectPlanning: 1,
        startingLineOnboarding: 1,
        accelerationRecovery: 1,
      },
      hasRequiredRuntimeReadyUseCaseOptionCoverage: false,
      missingReasons: expect.arrayContaining([
        'runtime_ready_use_case_option_coverage_required:newProjectPlanning',
        'runtime_ready_use_case_option_coverage_required:startingLineOnboarding',
        'runtime_ready_use_case_option_coverage_required:accelerationRecovery',
      ]),
      nextEvidenceActions: expect.arrayContaining([
        'collect_runtime_ready_use_case_option_evidence_for_business_type',
      ]),
    }))
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'general_civil:runtime_ready_use_case_option_coverage_required:newProjectPlanning',
      'hospital:runtime_ready_use_case_option_coverage_required:startingLineOnboarding',
    ]))
  })

  it('does not declare product outcome closeout from ready claims without real runtime evidence source', () => {
    const runtimeCloseoutClaimsByBusinessType = Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType) => [
        businessType,
        readyRuntimeCloseoutClaim(),
      ]),
    )
    const runtimeEvidenceContextsByBusinessType = attachRuntimeCloseoutClaimsByBusinessType(Object.fromEntries(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map((businessType, index) => [
        businessType,
        {
          projectIds: [`fixture-project-${index + 1}`],
          draftNetworkKeys: [`sha256:${businessType}`],
          optionIds: [`option-${businessType}`],
          publicationKeys: [`publication-${businessType}`],
          evidenceSources: ['fixture'],
        },
      ]),
    ), runtimeCloseoutClaimsByBusinessType)

    const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrix({
      precisionReplayMatrix: buildConstructionOrganizationPrecisionReplayMatrix(),
      runtimeCloseoutClaimsByBusinessType,
      runtimeEvidenceContextsByBusinessType,
    })

    expect(matrix.status).toBe('product_outcome_closeout_incomplete')
    expect(matrix.canDeclareConstructionOrganizationProductOutcomeCloseout).toBe(false)
    expect(matrix.runtimeOutcomeReadyBusinessTypeCount).toBe(0)
    expect(matrix.missingReasons).toEqual(expect.arrayContaining([
      'general_civil:real_runtime_evidence_source_required',
      'hospital:real_runtime_evidence_source_required',
    ]))
    expect(matrix.nextEvidenceActions).toEqual(expect.arrayContaining([
      'collect_real_runtime_evidence_for_business_type',
    ]))
    expect(matrix.nextEvidenceOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceAction: 'collect_real_runtime_evidence_for_business_type',
        operationAction: 'runtime_engine_evidence',
        assetType: 'construction_organization_plan_network',
      }),
    ]))
  })
})
