import { describe, expect, it } from 'vitest'
import {
  selectConstructionOrganizationScenario,
} from '../services/constructionOrganizationScenarioSelector.js'
import {
  buildConstructionOrganizationExperienceAssetDispositionMatrix,
  persistConstructionOrganizationScenarioCandidateEvents,
} from '../services/constructionOrganizationScenarioGovernanceService.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
} from '../services/constructionOrganizationPlanOptionProjectionService.js'
import { assessExperienceTierCandidatePayload } from '../services/experienceTierRegistryService.js'

function createQueryRecorder() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: `construction-org-candidate-${calls.length}` }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('constructionOrganizationScenarioGovernanceService', () => {
  it('declares object-level disposition for construction organization profile seeds and plan-option experience assets', () => {
    const matrix = buildConstructionOrganizationExperienceAssetDispositionMatrix()

    expect(matrix).toEqual(expect.objectContaining({
      matrixCode: 'c1912_construction_organization_experience_asset_disposition',
      status: 'non_live_object_disposition_closed',
      canDeclareNonLiveObjectDispositionClosed: true,
    }))
    expect(matrix.rows.map((row) => row.objectKey)).toEqual([
      'construction_organization_profile_seed_candidate',
      'construction_organization_plan_option_experience_asset',
    ])
    for (const row of matrix.rows) {
      expect(row).toEqual(expect.objectContaining({
        ownerService: 'constructionOrganizationScenarioGovernanceService',
        experienceTier: 'T3',
        experienceAssetType: 'construction_organization_profile',
        lifecycleDisposition: 'governed_candidate_event',
        registryDisposition: 'experience_tier_registry_candidate_registered',
        seedDisposition: 'not_algorithm_seed_do_not_write_algorithm_seed_records',
        runtimeDisposition: 'not_runtime_reader_or_writer_until_release_exit',
      }))
      expect(row.mutationBoundary).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesRuntimePublication: false,
        readsRuntimeReader: false,
      })
    }
    expect(matrix.liveOnlyTail).toEqual(expect.arrayContaining([
      'runtime_reader_live_replay',
      'manual_conflict_review_decision',
      'runtime_publication_apply',
      'rollback',
    ]))
  })

  it('persists construction organization plan options as governed candidate-weight events without runtime mutation', async () => {
    const { calls, queryExec } = createQueryRecorder()
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
      climateSignals: [],
      weatherImpactBands: [],
    })

    const projectedSelection = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-foundation',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
        smartReferenceDays: 30,
        durationSuggestion: {
          recommendedDurationDays: 28,
          planReferenceDays: 30,
          contextualReferenceDays: 29,
        },
      },
      {
        id: 'row-basement',
        title: 'basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-09-15',
        smartReferenceDays: 77,
        durationSuggestion: {
          recommendedDurationDays: 75,
          planReferenceDays: 77,
          contextualReferenceDays: 76,
        },
      },
      {
        id: 'row-tower',
        title: 'tower superstructure',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-09-20',
        plannedEndDate: '2027-03-20',
        smartReferenceDays: 182,
        durationSuggestion: {
          recommendedDurationDays: 180,
          planReferenceDays: 182,
          contextualReferenceDays: 181,
        },
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-03-21',
        plannedEndDate: '2027-03-28',
        smartReferenceDays: 8,
        durationSuggestion: {
          recommendedDurationDays: 8,
          planReferenceDays: 8,
          contextualReferenceDays: 8,
        },
      },
    ])

    const result = await persistConstructionOrganizationScenarioCandidateEvents({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      selection: projectedSelection,
      queryExec,
    })

    expect(result.persistedEventCount).toBe(projectedSelection.planOptions.length)
    expect(result.events[0]).toEqual(expect.objectContaining({
      assetKey: expect.stringMatching(/^construction_organization\.plan_option\./),
      sourceSystem: 'constructionOrganizationScenarioGovernanceService',
      assetType: 'rule',
      learningTarget: 'candidate_weight',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      runtimeEffectPolicy: 'candidate_only',
      lifecycleStatus: 'review_required',
    }))
    expect(result.events[0].governanceDecision.canWriteRuntime).toBe(false)
    expect(result.events[0].candidatePayload).toEqual(expect.objectContaining({
      experienceTier: 'T3',
      experienceAssetType: 'construction_organization_profile',
      wbsNodeTypes: ['project'],
      experienceGroupKeys: expect.arrayContaining([
        expect.stringMatching(/^T3:construction_organization:/),
      ]),
      experienceTierRegistryCandidate: expect.objectContaining({
        tier: 'T3',
        requiredRegistry: 'experienceTierRegistry',
        groupKeyStrategy: 'business_type_scale_region_delivery_model',
        prohibitsT1T2BucketMixing: true,
      }),
      experienceAssetDisposition: expect.objectContaining({
        matrixCode: 'c1912_construction_organization_experience_asset_disposition',
        status: 'non_live_object_disposition_closed',
        objectKeys: [
          'construction_organization_profile_seed_candidate',
          'construction_organization_plan_option_experience_asset',
        ],
        liveOnlyTail: expect.arrayContaining(['runtime_publication_apply', 'rollback']),
      }),
    }))
    expect(assessExperienceTierCandidatePayload(result.events[0].candidatePayload)).toEqual(expect.objectContaining({
      status: 'tier_candidate_valid',
      tier: 'T3',
      rejectedReasons: [],
    }))

    const candidateInsert = calls.find((call) =>
      call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      expect.stringMatching(/^construction_organization\.plan_option\./),
      'constructionOrganizationScenarioGovernanceService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
    ]))
    expect(candidateInsert?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        recommendedPlanOptionId: projectedSelection.recommendedPlanOption.optionId,
        scenarioRecommendations: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            useCase: 'new_project_planning',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
          accelerationRecovery: expect.objectContaining({
            useCase: 'acceleration_recovery',
            recommendationBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
        }),
        option: expect.objectContaining({
          optionId: projectedSelection.planOptions[0].optionId,
          selectedScenarioIds: projectedSelection.planOptions[0].selectedScenarioIds,
          projectOrganizationScheme: expect.objectContaining({
            source: 'project_organization_policy_scheme_candidate',
            evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
            policyId: 'project-organization-general-civil-multi-building-v1',
            schemeFamily: 'shared_works_then_multi_building_lane',
            resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          }),
          generatedRowProjection: expect.objectContaining({
            dependencyAlignmentScore: expect.any(Number),
            candidateDependencyPreview: expect.objectContaining({
              source: 'construction_organization_candidate_dependency_preview',
              materializationReadiness: expect.objectContaining({
                source: 'construction_organization_candidate_materialization_readiness',
                readiness: expect.stringMatching(/^(ready_for_manual_materialization_preview|needs_generated_row_carrier|evidence_only)$/),
                previewEdgeCount: expect.any(Number),
                unresolvedEdgeCount: expect.any(Number),
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesCriticalPathFacts: false,
              }),
              previewEdgeCount: expect.any(Number),
              unresolvedEdgeCount: expect.any(Number),
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            candidateMaterializationEvaluation: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_evaluation',
              materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates',
              previewEdgeCount: expect.any(Number),
              satisfiedEdgeCount: expect.any(Number),
              violatedEdgeCount: expect.any(Number),
              unresolvedEdgeCount: expect.any(Number),
              materializationScore: expect.any(Number),
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            materializationDecision: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_decision',
              decision: expect.stringMatching(/^(ready_for_manual_materialization|needs_generated_row_carrier|evidence_only|blocked_by_violations)$/),
              allowManualMaterialization: expect.any(Boolean),
              reasons: expect.any(Array),
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            materializationReviewPackage: expect.objectContaining({
              source: 'construction_organization_candidate_materialization_review_package',
              packageBasis: 'manual_review_package_from_generated_row_preview_edges',
              status: expect.stringMatching(/^(ready_for_manual_review|needs_generated_row_carrier|evidence_only|blocked_by_violations)$/),
              proposedDependencyEdgeCount: expect.any(Number),
              proposedDependencyEdges: expect.any(Array),
              reviewRequired: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
            generatedRowReferenceDurationEvidence: expect.objectContaining({
              source: 'generated_wbs_row_reference_duration_projection',
              durationBasis: 'generated_row_plan_dates_and_plan_reference_days',
              matchedReferenceRowCount: expect.any(Number),
              totalPlanReferenceDays: expect.any(Number),
              writesReferenceDuration: false,
              writesPlanDates: false,
              writesSeed: false,
            }),
            generatedRowNetworkEvaluation: expect.objectContaining({
              source: 'generated_wbs_row_candidate_network_cpm',
              networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
              projectedNetworkSpanDays: expect.any(Number),
              criticalGeneratedRowIds: expect.arrayContaining([expect.any(String)]),
              previewEdgeCount: expect.any(Number),
              unresolvedEdgeCount: expect.any(Number),
              materializationStatus: expect.stringMatching(/^(fully_mapped_read_only|partial_mapping_read_only|no_mapped_edges)$/),
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
            }),
          }),
          useCaseEvaluations: expect.objectContaining({
            newProjectPlanning: expect.objectContaining({
              useCase: 'new_project_planning',
              factCoverage: expect.objectContaining({
                source: 'wizard_project_generation_fact_coverage',
                usesExistingWizardFactsOnly: true,
                consumedFactKeys: expect.arrayContaining(['projectTypeCode', 'methodVariantCodes', 'buildingCount']),
                resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
              }),
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            }),
            startingLineOnboarding: expect.objectContaining({
              useCase: 'starting_line_onboarding',
              actionability: 'evidence_only',
            }),
            accelerationRecovery: expect.objectContaining({
              useCase: 'acceleration_recovery',
              rankBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
              e5RecoverableSpanDays: expect.any(Number),
            }),
          }),
          networkEvaluation: expect.objectContaining({
            evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5',
            e3NetworkBasis: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
            projectDurationDays: expect.any(Number),
            criticalNodeIds: expect.any(Array),
            e5RecoverableSpanDays: expect.any(Number),
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
          }),
          engineEvaluationSummary: expect.objectContaining({
            source: 'construction_organization_plan_option_engine_evaluation_summary',
            evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution',
            e1: expect.objectContaining({
              input: 'selected_virtual_work_packages',
              output: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
              selectedScenarioIds: projectedSelection.planOptions[0].selectedScenarioIds,
              writesReferenceDuration: false,
            }),
            e3: expect.objectContaining({
              input: 'combined_virtual_dependency_network',
              output: 'virtual_cpm_duration_and_critical_nodes',
              projectDurationDays: projectedSelection.planOptions[0].evaluation.networkEvaluation.projectDurationDays,
              criticalNodeCount: projectedSelection.planOptions[0].evaluation.networkEvaluation.criticalNodeIds.length,
              edgeCount: projectedSelection.planOptions[0].evaluation.networkEvaluation.edgeCount,
              writesCriticalPathSnapshot: false,
            }),
            e5: expect.objectContaining({
              input: 'use_case_acceleration_recovery_evaluation',
              output: 'bounded_recovery_factor_hint',
              recoveryFactorHint: projectedSelection.planOptions[0].evaluation.recoveryFactorHint,
              recoverableSpanDays: projectedSelection.planOptions[0].evaluation.networkEvaluation.e5RecoverableSpanDays,
              writesAccelerationDraft: false,
            }),
            projectOrganization: expect.objectContaining({
              schemeFamily: 'shared_works_then_multi_building_lane',
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
            }),
            boundary: expect.objectContaining({
              candidateOnly: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
            }),
          }),
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
        }),
      }),
    ]))

    const writeSql = calls
      .map((call) => call.sql.toLowerCase())
      .filter((sql) => sql.includes('insert') || sql.includes('update') || sql.includes('delete'))
      .join('\n')
    expect(writeSql).toContain('algorithm_asset_candidate_events')
    expect(writeSql).not.toContain('task_dependencies')
    expect(writeSql).not.toContain('algorithm_seed_records')
    expect(writeSql).not.toContain('algorithm_seed_versions')
    expect(writeSql).not.toContain('critical_path')
    expect(writeSql).not.toContain('baseline')
  })
})
