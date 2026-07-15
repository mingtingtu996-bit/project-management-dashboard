import { describe, expect, it } from 'vitest'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  selectConstructionOrganizationScenario,
} from '../services/constructionOrganizationScenarioSelector.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
} from '../services/constructionOrganizationPlanOptionProjectionService.js'
import {
  buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'

const SUPPORTED_CONSTRUCTION_ORGANIZATION_BUSINESS_TYPES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
] as const

function buildBusinessTypeSelectorInput(businessType: typeof SUPPORTED_CONSTRUCTION_ORGANIZATION_BUSINESS_TYPES[number]) {
  return {
    businessType,
    businessSubtype: businessType,
    projectTypeCode: businessType,
    structureTypeCode: businessType === 'modular_building' ? 'modular' : 'frame_core',
    methodVariantCodes: [
      businessType === 'modular_building' ? 'modular_prefab' : 'pile_foundation',
      'vertical_retaining_support',
      'no_horizontal_strut',
    ],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    functionalUsageCodes: [businessType],
    functionalCategoryCodes: [businessType],
    specialRoomTypeCodes: businessType === 'data_center'
      ? ['computer_room', 'battery_room']
      : businessType === 'hospital'
        ? ['cleanroom', 'operating_room']
        : [],
    physicalZoneTypeCodes: businessType === 'transportation_hub' || businessType === 'tod_upper_cover'
      ? ['metro_interface', 'outdoor_site']
      : ['tower', 'basement'],
    planScopeCaliber: 'full_project',
    deliveryStandard: 'completion_acceptance',
    terminalEvent: 'joint_acceptance',
    buildingCount: businessType === 'renovation' ? 1 : 3,
    totalAreaM2: businessType === 'renovation' ? 18000 : 120000,
    aboveGroundAreaM2: businessType === 'renovation' ? 15000 : 90000,
    basementLevelCount: businessType === 'renovation' ? 0 : 2,
    basementAreaM2: businessType === 'renovation' ? 0 : 26000,
    siteAreaM2: 52000,
    foundationDepthM: businessType === 'renovation' ? 0 : 5,
    standardFloorCount: businessType === 'renovation' ? 5 : 24,
    highestBuildingFloorCount: businessType === 'renovation' ? 5 : 32,
    prefabRate: businessType === 'modular_building' ? 0.55 : 0.12,
    maxSpanM: businessType === 'sports_culture' ? 28 : 12,
    supportHeightM: businessType === 'hotel' ? 9 : 4,
    hasCivilDefense: businessType !== 'renovation',
    climateSignals: ['rainy_season'],
    weatherImpactBands: ['earthwork_rain_sensitive'],
    locationFacts: { province: 'guangdong', city: 'shenzhen' },
    scopeOrganizationFacts: {
      buildingObjectCount: businessType === 'renovation' ? 1 : 3,
      sharedBasementObjectCount: businessType === 'renovation' ? 0 : 1,
      sharedBasementServiceTargetCount: businessType === 'renovation' ? 0 : 3,
      outdoorSiteObjectCount: 1,
      organizationSignals: businessType === 'renovation'
        ? ['outdoor_site_scope_present']
        : ['multi_building_scope_objects', 'shared_basement_service_range', 'outdoor_site_scope_present'],
    },
    externalInterfaceCodes: businessType === 'tod_upper_cover' || businessType === 'transportation_hub'
      ? ['metro_operation_interface']
      : [],
    hardConstraintCodes: businessType === 'renovation'
      ? ['occupied_renovation']
      : [],
    projectFeatures: { businessTypeGovernanceProbe: true },
    towerCraneCount: 2,
    constructionHoistCount: 3,
  }
}

function buildBusinessTypeGeneratedRows(businessType: typeof SUPPORTED_CONSTRUCTION_ORGANIZATION_BUSINESS_TYPES[number]) {
  return [
    {
      id: `${businessType}-foundation`,
      title: 'pile foundation works',
      stableCode: '01-02',
      executionPhase: 'foundation_pit_pile',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30',
      smartReferenceDays: 30,
    },
    {
      id: `${businessType}-earthwork`,
      title: 'bulk earthwork excavation',
      stableCode: '01-04',
      executionPhase: 'earthwork_excavation',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-07-31',
      smartReferenceDays: 31,
    },
    {
      id: `${businessType}-shared-work`,
      title: 'shared basement and primary interface release',
      stableCode: '01-05',
      executionPhase: 'basement_structure',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-10-31',
      smartReferenceDays: 92,
    },
    {
      id: `${businessType}-primary-lane`,
      title: `${businessType} primary lane superstructure and functional system`,
      stableCode: '02-01',
      executionPhase: 'superstructure_rhythm',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-11-01',
      plannedEndDate: '2027-04-30',
      smartReferenceDays: 181,
    },
    {
      id: `${businessType}-outdoor`,
      title: `${businessType} outdoor municipal road and landscape works`,
      stableCode: 'OUT-02',
      executionPhase: 'outdoor_site_municipal_landscape',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-11-15',
      plannedEndDate: '2027-02-28',
      smartReferenceDays: 106,
    },
    {
      id: `${businessType}-handoff`,
      title: `${businessType} commissioning acceptance handoff`,
      stableCode: 'ACCEPT-01',
      executionPhase: 'acceptance_handover',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2027-05-01',
      plannedEndDate: '2027-05-08',
      smartReferenceDays: 8,
    },
  ]
}

describe('constructionOrganizationScenarioSelector', () => {
  it('keeps construction organization candidates governable across the 11 supported business types', () => {
    for (const businessType of SUPPORTED_CONSTRUCTION_ORGANIZATION_BUSINESS_TYPES) {
      const selection = selectConstructionOrganizationScenario(buildBusinessTypeSelectorInput(businessType))

      expect(selection.frontendInputRequired, businessType).toBe(false)
      expect(selection.planOptions.length, businessType).toBeGreaterThan(0)
      expect(selection.recommendedPlanOption.selectedScenarioIds.length, businessType).toBeGreaterThan(0)
      expect(selection.scenarioRecommendations.newProjectPlanning.optionId, businessType).toBeTruthy()
      expect(selection.scenarioRecommendations.startingLineOnboarding.actionability, businessType).toBe('evidence_only')
      expect(selection.scenarioRecommendations.accelerationRecovery.optionId, businessType).toBeTruthy()
      expect(selection.organizationDecisionReport, businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_decision_report',
        reportRole: 'product_best_scheme_read_model',
        optionCount: selection.planOptions.length,
        candidateCount: selection.candidates.length,
        recommendedPlanOptionId: selection.recommendedPlanOption.optionId,
        recommendedScenarioIds: selection.recommendedScenarioIds,
        selectedByUseCase: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            source: 'construction_organization_use_case_decision_report',
            useCase: 'new_project_planning',
            optionId: selection.scenarioRecommendations.newProjectPlanning.optionId,
            selectedScenarioIds: selection.scenarioRecommendations.newProjectPlanning.selectedScenarioIds,
            virtualProjectDurationDays: expect.any(Number),
            nextGovernanceAction: 'generated_row_projection_required',
            boundaryPolicy: expect.objectContaining({
              candidateOnly: true,
              resourcesAreSidecarSignals: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            }),
          }),
          startingLineOnboarding: expect.objectContaining({
            useCase: 'starting_line_onboarding',
            optionId: selection.scenarioRecommendations.startingLineOnboarding.optionId,
            actionability: 'evidence_only',
          }),
          accelerationRecovery: expect.objectContaining({
            useCase: 'acceleration_recovery',
            optionId: selection.scenarioRecommendations.accelerationRecovery.optionId,
            e5RecoverableSpanDays: expect.any(Number),
            recoveryFactorHint: expect.any(Number),
          }),
        }),
        decisionSignals: expect.objectContaining({
          usesExistingWizardFactsOnly: true,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
          decisionFactKeys: expect.arrayContaining(['projectOrganizationPolicy']),
          contextFactKeys: expect.arrayContaining(['businessType']),
        }),
        engineEvidence: expect.objectContaining({
          e1: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
          e3: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
          e5: 'bounded_recovery_factor_hint',
        }),
        productCloseoutReadiness: expect.objectContaining({
          source: 'construction_organization_product_closeout_readiness_from_decision_report',
          status: 'candidate_recommendation_only_runtime_closeout_required',
          canDeclareConstructionOrganizationProductOutcomeCloseout: false,
          requiredCloseoutEvidence: expect.arrayContaining([
            'constructionOrganizationProductOutcomeCloseoutMatrixService',
            'constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim',
          ]),
          missingBeforeProductCloseout: expect.arrayContaining([
            'real_runtime_evidence_source_required',
            'runtime_use_case_coverage_required',
            'runtime_option_network_coverage_required',
            'site_adoption_of_runtime_recommended_option_required',
          ]),
          boundaryPolicy: expect.objectContaining({
            readOnlyCandidateReport: true,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          }),
        }),
        boundaryPolicy: expect.objectContaining({
          candidateOnly: true,
          readOnlyBestScheme: true,
          runtimeMaterializationRequiresGovernance: true,
          resourcesAreSidecarSignals: true,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }))
      expect(selection.planOptionComparisonPackage, businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_option_comparison_package',
        totalOptionCount: selection.planOptions.length,
        recommendedOptionIdsByUseCase: expect.objectContaining({
          newProjectPlanning: selection.scenarioRecommendations.newProjectPlanning.optionId,
          startingLineOnboarding: selection.scenarioRecommendations.startingLineOnboarding.optionId,
          accelerationRecovery: selection.scenarioRecommendations.accelerationRecovery.optionId,
        }),
        canAutoMaterializeSelectedOption: false,
        options: expect.arrayContaining([
          expect.objectContaining({
            optionId: selection.recommendedPlanOption.optionId,
            nextGovernanceAction: 'generated_row_projection_required',
            nextGovernanceReasons: expect.arrayContaining([
              'generated_row_projection_required_before_manual_review_handoff',
            ]),
          }),
        ]),
      }))
      expect(selection.boundaryPolicy.resourcePolicy, businessType).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
      expect(selection.factBasis, businessType).toEqual(expect.objectContaining({
        businessType,
        projectTypeCode: businessType,
        usesExistingWizardFactsOnly: true,
        projectOrganizationPolicy: expect.objectContaining({
          source: 'project_construction_organization_policy_seed',
          policyId: expect.any(String),
          strategy: expect.any(String),
          schemeFamily: expect.any(String),
          primaryInterfaceSequence: expect.arrayContaining([expect.any(String)]),
          interfaceGateTags: expect.arrayContaining([expect.any(String)]),
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
      }))
      expect(selection.scenarioRecommendations.newProjectPlanning.recommendationBasis, businessType).toEqual(expect.arrayContaining([
        'business_type_project_organization_policy',
        'policy_scheme_family_selected',
        'primary_interface_sequence_applied',
      ]))
      expect(selection.recommendedPlanOption.selectionReasons, businessType).toEqual(expect.arrayContaining([
        'business_type_project_organization_policy',
      ]))
      expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage.consumedFactKeys, businessType).toEqual(
        expect.arrayContaining(['projectOrganizationPolicy']),
      )
      for (const option of selection.planOptions) {
        expect(option.evaluation.networkEvaluation.projectDurationDays, `${businessType}:${option.optionId}`).toBeGreaterThan(0)
        expect(option.evaluation.networkEvaluation.writesTaskDependencies, `${businessType}:${option.optionId}`).toBe(false)
        expect(option.evaluation.networkEvaluation.writesPlanDates, `${businessType}:${option.optionId}`).toBe(false)
        expect(option.evaluation.networkEvaluation.writesCriticalPathFacts, `${businessType}:${option.optionId}`).toBe(false)
        expect(option.evaluation.engineEvaluationSummary, `${businessType}:${option.optionId}`).toEqual(expect.objectContaining({
          source: 'construction_organization_plan_option_engine_evaluation_summary',
          evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution',
          e1: expect.objectContaining({
            input: 'selected_virtual_work_packages',
            output: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
            writesReferenceDuration: false,
          }),
          e3: expect.objectContaining({
            input: 'combined_virtual_dependency_network',
            output: 'virtual_cpm_duration_and_critical_nodes',
            projectDurationDays: option.evaluation.networkEvaluation.projectDurationDays,
            criticalNodeCount: option.evaluation.networkEvaluation.criticalNodeIds.length,
            writesCriticalPathSnapshot: false,
          }),
          e5: expect.objectContaining({
            input: 'use_case_acceleration_recovery_evaluation',
            output: 'bounded_recovery_factor_hint',
            recoveryFactorHint: option.evaluation.recoveryFactorHint,
            recoverableSpanDays: option.evaluation.networkEvaluation.e5RecoverableSpanDays,
            writesAccelerationDraft: false,
          }),
          boundary: expect.objectContaining({
            candidateOnly: true,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesCriticalPathFacts: false,
          }),
        }))
        expect(option.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage.consumedFactKeys, `${businessType}:${option.optionId}`).toEqual(
          expect.arrayContaining(['businessType', 'projectTypeCode', 'scopeOrganizationFacts']),
        )
        expect(option.evaluation.useCaseEvaluations?.accelerationRecovery.factCoverage.resourcePolicy, `${businessType}:${option.optionId}`).toBe(
          'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        )
      }
    }
  })

  it('projects every supported business type into reviewable plan-network evidence for the three product use cases', () => {
    for (const businessType of SUPPORTED_CONSTRUCTION_ORGANIZATION_BUSINESS_TYPES) {
      const selection = selectConstructionOrganizationScenario(buildBusinessTypeSelectorInput(businessType))
      const projected = projectConstructionOrganizationSelectionToGeneratedRows(
        selection,
        buildBusinessTypeGeneratedRows(businessType),
      )
      const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection

      expect(projection?.candidateDependencyPreview?.previewEdges.length, businessType).toBeGreaterThan(0)
      expect(projection?.generatedRowNetworkEvaluation?.previewEdgeCount, businessType).toBeGreaterThan(0)
      expect(projected.planNetworkDraftRecommendations?.newProjectPlanning, businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'new_project_planning',
        evaluationStatus: 'evaluation_ready',
        e1: expect.objectContaining({ writesReferenceDuration: false }),
        e3: expect.objectContaining({
          previewEdgeCount: expect.any(Number),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
        e5: expect.objectContaining({ writesAccelerationDraft: false }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }))
      expect(projected.planNetworkDraftRecommendations?.newProjectPlanning.e3?.previewEdgeCount ?? 0, businessType).toBeGreaterThan(0)
      expect(projected.planNetworkDraftRecommendations?.startingLineOnboarding, businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'starting_line_onboarding',
      }))
      expect(projected.planNetworkDraftRecommendations?.accelerationRecovery, businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'acceleration_recovery',
        e5: expect.objectContaining({
          e5RecoverableSpanDays: expect.any(Number),
          writesAccelerationDraft: false,
        }),
      }))
      expect(projected.planOptionComparisonPackage.options, businessType).toEqual(expect.arrayContaining([
        expect.objectContaining({
          optionId: projected.recommendedPlanOption.optionId,
          nextGovernanceAction: expect.stringMatching(/^(manual_review_handoff|blocked)$/),
          nextGovernanceReasons: expect.arrayContaining([expect.any(String)]),
          systemRecommendationBasis: expect.objectContaining({
            source: 'construction_organization_plan_option_system_recommendation_basis',
            recommendationRole: 'read_only_candidate_ranking_from_e1_e3_e5_and_generated_row_projection',
            recommendedForUseCases: expect.arrayContaining(['newProjectPlanning']),
            rankingSignals: expect.arrayContaining([
              'candidate_option_e1_e3_e5_summary',
              'generated_row_projection_alignment',
              'generated_row_candidate_network_cpm',
            ]),
            e1: expect.objectContaining({
              hasGeneratedRowReferenceEvidence: true,
              writesReferenceDuration: false,
            }),
            e3: expect.objectContaining({
              previewEdgeCount: expect.any(Number),
              writesCriticalPathFacts: false,
            }),
            e5: expect.objectContaining({
              e5RecoverableSpanDays: expect.any(Number),
              writesAccelerationDraft: false,
            }),
            materialization: expect.objectContaining({
              decision: expect.any(String),
              allowManualMaterialization: expect.any(Boolean),
            }),
            boundaryPolicy: expect.objectContaining({
              candidateOnly: true,
              readOnlyRecommendation: true,
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesSeed: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            }),
          }),
        }),
      ]))
    }
  })

  it('uses foundation form candidates from project features when method variants only contain structure method', () => {
    const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
      },
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 22000,
      foundationDepthM: 8,
      standardFloorCount: 24,
      highestBuildingFloorCount: 28,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      scopeOrganizationFacts: {
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
      },
    })

    const selection = selectConstructionOrganizationScenario(selectorInput)

    expect(selection.factBasis.methodVariantCodes).toEqual(expect.arrayContaining([
      'cast_in_situ',
      'bored_pile',
      'diaphragm_wall',
      'pile_foundation',
      'vertical_retaining_support',
    ]))
    expect(selection.candidates.find((candidate) => candidate.scenarioId === 'pile_before_excavation')?.selectionReasons).toEqual(
      expect.arrayContaining(['pile_foundation_fact_present']),
    )
    expect(selection.recommendedPlanOption.evaluation.networkEvaluation).toEqual(expect.objectContaining({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
  })

  it('carries generated-row date conflict evidence into manual review packages', () => {
    const selection = selectConstructionOrganizationScenario(buildBusinessTypeSelectorInput('general_civil'))
    const projected = projectConstructionOrganizationSelectionToGeneratedRows(
      selection,
      [
        {
          id: 'row-foundation',
          title: 'pile foundation works',
          stableCode: '01-02',
          executionPhase: 'foundation_pit_pile',
          rowProjectionMode: 'schedule_row',
          durationContributionMode: 'duration_bearing',
          plannedStartDate: '2026-06-10',
          plannedEndDate: '2026-06-30',
          smartReferenceDays: 21,
        },
        {
          id: 'row-earthwork',
          title: 'bulk earthwork excavation',
          stableCode: '01-04',
          executionPhase: 'earthwork_excavation',
          rowProjectionMode: 'schedule_row',
          durationContributionMode: 'duration_bearing',
          plannedStartDate: '2026-06-15',
          plannedEndDate: '2026-07-10',
          smartReferenceDays: 26,
        },
        {
          id: 'row-basement',
          title: 'shared basement and primary interface release',
          stableCode: '01-05',
          executionPhase: 'basement_structure',
          rowProjectionMode: 'schedule_row',
          durationContributionMode: 'duration_bearing',
          plannedStartDate: '2026-07-11',
          plannedEndDate: '2026-09-30',
          smartReferenceDays: 82,
        },
        {
          id: 'row-tower',
          title: 'tower lane superstructure',
          stableCode: '02-01',
          executionPhase: 'superstructure_rhythm',
          rowProjectionMode: 'schedule_row',
          durationContributionMode: 'duration_bearing',
          plannedStartDate: '2026-09-01',
          plannedEndDate: '2027-02-28',
          smartReferenceDays: 181,
        },
      ],
    )

    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    expect(projection?.candidateMaterializationEvaluation?.violatedEdgeCount).toBeGreaterThan(0)
    expect(projection?.materializationReviewPackage?.status).toBe('blocked_by_violations')
    expect(projection?.materializationReviewPackage?.conflictEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromGeneratedRowId: 'row-foundation',
        toGeneratedRowId: 'row-earthwork',
        dependencyType: 'FS',
        reason: 'fs_predecessor_finishes_after_successor_start',
        fromWindow: expect.objectContaining({
          plannedEndDate: '2026-06-30',
        }),
        toWindow: expect.objectContaining({
          plannedStartDate: '2026-06-15',
        }),
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ]))
  })

  it('models outdoor/site works as a first-class organization option instead of only a context signal', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'municipal_road', 'landscape'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      siteAreaM2: 76000,
      foundationDepthM: 5,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      scopeOrganizationFacts: {
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        outdoorSiteObjectCount: 1,
        organizationSignals: [
          'multi_building_scope_objects',
          'shared_basement_service_range',
          'outdoor_site_scope_present',
        ],
      },
    })

    expect(selection.candidates.map((candidate) => candidate.category)).toEqual(expect.arrayContaining([
      'outdoor_site_release',
    ]))
    expect(selection.candidates.map((candidate) => candidate.scenarioId)).toEqual(expect.arrayContaining([
      'outdoor_site_early_release_after_basement_backfill',
      'outdoor_site_after_primary_structure',
    ]))
    expect(selection.recommendedPlanOption.selectedScenarioIds).toEqual(expect.arrayContaining([
      'outdoor_site_early_release_after_basement_backfill',
    ]))
    expect(selection.recommendedPlanOption.combinedVirtualNetwork.nodes.map((node) => node.phase)).toEqual(expect.arrayContaining([
      'outdoor',
    ]))
    expect(selection.recommendedPlanOption.combinedVirtualNetwork.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        intent: 'selected_basement_tower_release_before_selected_outdoor_site_release',
      }),
    ]))

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-31',
      },
      {
        id: 'row-basement',
        title: 'shared basement structure and backfill',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
      },
      {
        id: 'row-outdoor',
        title: 'outdoor municipal road and landscape works',
        stableCode: 'OUT-02',
        executionPhase: 'outdoor_site_municipal_landscape',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-15',
        plannedEndDate: '2027-02-28',
      },
      {
        id: 'row-handoff',
        title: 'completion acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
      },
    ])

    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    expect(projection?.phaseCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'outdoor',
        generatedRowIds: expect.arrayContaining(['row-outdoor']),
      }),
    ]))
    expect(projection?.candidateDependencyPreview?.previewEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toGeneratedRowIds: expect.arrayContaining(['row-outdoor']),
        intent: 'basement_backfill_release_before_outdoor_site_start',
      }),
    ]))
    expect(projected.planNetworkDraftRecommendations?.newProjectPlanning?.e3?.previewEdgeCount ?? 0).toBeGreaterThan(0)
    expect(projected.planNetworkDraftRecommendations?.accelerationRecovery?.e5).toEqual(expect.objectContaining({
      writesAccelerationDraft: false,
    }))
  })

  it('keeps one wizard fact set consumable by new planning, starting-line onboarding, and E5 without runtime writes before governance', () => {
    const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts({
      businessType: 'general_civil',
      businessSubtype: 'residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'frame_shear',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      functionalUsageCodes: ['residential'],
      physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
      planScopeCaliber: 'full_project',
      deliveryStandard: 'completion_acceptance',
      terminalEvent: 'joint_acceptance',
      buildingCount: 3,
      totalAreaM2: 98100,
      aboveGroundAreaM2: 72000,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      siteAreaM2: 52000,
      foundationDepthM: 5,
      standardFloorCount: 26,
      highestBuildingFloorCount: 32,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      towerCraneCount: 2,
      constructionHoistCount: 3,
      onboardingMode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'basement_structure_acceptance'],
      scopeOrganizationFacts: {
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        outdoorSiteObjectCount: 1,
        organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range', 'outdoor_site_scope_present'],
      },
    })
    const projected = projectConstructionOrganizationSelectionToGeneratedRows(
      selectConstructionOrganizationScenario(selectorInput),
      buildBusinessTypeGeneratedRows('general_civil'),
    )
    const recommended = projected.recommendedPlanOption
    const projection = recommended.evaluation.generatedRowProjection
    const reviewPackage = projection?.materializationReviewPackage

    expect(projected.scenarioRecommendations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({ optionId: recommended.optionId }),
      startingLineOnboarding: expect.objectContaining({
        useCase: 'starting_line_onboarding',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      accelerationRecovery: expect.objectContaining({ optionId: expect.any(String) }),
    }))
    expect(recommended.evaluation.useCaseEvaluations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        factCoverage: expect.objectContaining({
          usesExistingWizardFactsOnly: true,
          consumedFactKeys: expect.arrayContaining(['businessType', 'projectTypeCode', 'scopeOrganizationFacts']),
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
      }),
      startingLineOnboarding: expect.objectContaining({
        useCase: 'starting_line_onboarding',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      accelerationRecovery: expect.objectContaining({
        e5RecoverableSpanDays: expect.any(Number),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
    }))
    expect(projection?.candidateDependencyPreview).toEqual(expect.objectContaining({
      previewBasis: 'virtual_dependency_edges_mapped_to_generated_wbs_row_carriers',
      previewEdges: expect.arrayContaining([expect.objectContaining({
        materializationStatus: 'preview_only',
        writesTaskDependencies: false,
      })]),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(projection?.generatedRowNetworkEvaluation).toEqual(expect.objectContaining({
      previewEdgeCount: expect.any(Number),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(reviewPackage).toEqual(expect.objectContaining({
      allowManualReview: true,
      reviewRequired: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))

    const draft = buildConstructionOrganizationPlanNetworkDraftFromReviewPackageItem({
      candidateEventId: 'candidate-event-1',
      assetKey: 'construction_organization.plan_option.general_civil_product_goal',
      sourceModule: 'constructionOrganizationScenarioGovernanceService',
      companyId: 'company-1',
      projectId: 'project-1',
      eventStatus: 'review_required',
      runtimeEffect: 'candidate_only',
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
      optionId: recommended.optionId,
      selectedScenarioIds: projected.recommendedScenarioIds,
      reviewPackage: reviewPackage as NonNullable<typeof reviewPackage>,
      materializationDecision: projection?.materializationDecision ?? null,
      candidateDependencyPreview: projection?.candidateDependencyPreview
        ? {
            source: projection.candidateDependencyPreview.source,
            materializationReadiness: projection.candidateDependencyPreview.materializationReadiness,
            previewEdgeCount: projection.candidateDependencyPreview.previewEdges.length,
            unresolvedEdgeCount: projection.candidateDependencyPreview.unresolvedEdges.length,
            writesTaskDependencies: projection.candidateDependencyPreview.writesTaskDependencies,
            writesPlanDates: projection.candidateDependencyPreview.writesPlanDates,
            writesCriticalPathFacts: projection.candidateDependencyPreview.writesCriticalPathFacts,
          }
        : null,
      engineEvaluationSummary: recommended.evaluation.engineEvaluationSummary,
      generatedRowReferenceDurationEvidence: projection?.generatedRowReferenceDurationEvidence ?? null,
      generatedRowNetworkEvaluation: projection?.generatedRowNetworkEvaluation ?? null,
      useCaseEvaluations: recommended.evaluation.useCaseEvaluations ?? null,
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
      },
    })

    expect(draft).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_draft',
      readiness: 'ready_for_replay',
      edgeCount: reviewPackage?.proposedDependencyEdgeCount,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
      useCaseEvaluationEvidence: expect.objectContaining({
        newProjectPlanning: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }),
        startingLineOnboarding: expect.objectContaining({
          useCase: 'starting_line_onboarding',
          writesTaskDependencies: false,
        }),
        accelerationRecovery: expect.objectContaining({
          useCase: 'acceleration_recovery',
          writesTaskDependencies: false,
        }),
      }),
    }))
  })

  it('selects a foundation and basement release scenario from existing project facts without new frontend inputs', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      towerCraneCount: 1,
      constructionHoistCount: 1,
    })

    expect(selection.source).toBe('construction_organization_scenario_selector')
    expect(selection.frontendInputRequired).toBe(false)
    expect(selection.boundaryPolicy).toEqual(expect.objectContaining({
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    }))
    expect(selection.recommendedScenarioIds).toEqual(expect.arrayContaining([
      'pile_before_excavation',
      'shared_basement_first_then_tower',
    ]))
    expect(selection.recommendedPlanOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option',
      selectedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'shared_basement_first_then_tower',
      ]),
      confidence: selection.confidence,
      evaluation: expect.objectContaining({
        evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
        e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
        e3NetworkBasis: 'combined_virtual_dependency_network_not_persisted',
        e5AccelerationBasis: 'plan_option_recovery_factor_hint',
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
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      combinedVirtualNetwork: expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
        totalSpanDays: expect.any(Number),
        criticalNodeIds: expect.any(Array),
      }),
    }))
    expect(selection.recommendedPlanOption.combinedVirtualNetwork.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        intent: 'selected_foundation_sequence_before_selected_basement_tower_release',
        dependencyType: 'FS',
      }),
    ]))
    expect(selection.candidates.map((candidate) => candidate.scenarioId)).toEqual(expect.arrayContaining([
      'pile_before_excavation',
      'excavation_before_pile',
      'tower_lane_early_release_after_core_basement',
      'shared_basement_first_then_tower',
    ]))
    expect(selection.candidates.find((candidate) => candidate.scenarioId === 'pile_before_excavation')).toEqual(expect.objectContaining({
      feasibility: 'recommended',
      evaluation: expect.objectContaining({
        evaluationRole: 'candidate_network_score_for_e1_e3_e5',
        e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
        e3NetworkBasis: 'virtual_dependency_network_not_persisted',
        e5AccelerationBasis: 'scenario_recovery_factor_hint',
        compositeScore: expect.any(Number),
        scheduleRiskLevel: expect.any(String),
      }),
      virtualNetworkHints: expect.objectContaining({
        dependencyIntents: expect.arrayContaining(['pile_before_earthwork_bulk_excavation']),
      }),
    }))
    expect(selection.candidates.find((candidate) => candidate.scenarioId === 'excavation_before_pile')).toEqual(expect.objectContaining({
      feasibility: 'rejected',
      rejectionReasons: expect.arrayContaining(['rainy_deep_pit_without_horizontal_support']),
    }))
    expect(selection.factBasis).toEqual(expect.objectContaining({
      usesExistingWizardFactsOnly: true,
      towerCraneCount: 1,
      constructionHoistCount: 1,
    }))
  })

  it('scores every candidate through a virtual network evaluation without materializing dependencies', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
    })

    expect(selection.boundaryPolicy.virtualNetworkPolicy).toBe('scenario_candidates_are_evaluated_as_virtual_networks_before_any_write')
    expect(selection.recommendedScenarioIds).toEqual(['pile_before_excavation', 'shared_basement_first_then_tower'])
    expect(selection.recommendedPlanOption.selectedScenarioIds).toEqual(selection.recommendedScenarioIds)
    expect(selection.recommendedPlanOption.excludedScenarioIds).toEqual(expect.arrayContaining([
      'excavation_before_pile',
      'tower_lane_early_release_after_core_basement',
    ]))
    expect(selection.recommendedPlanOption.combinedVirtualNetwork.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'foundation_pile',
      'release_shared_basement',
    ]))
    for (const candidate of selection.candidates) {
      expect(candidate.evaluation).toEqual(expect.objectContaining({
        evaluationRole: 'candidate_network_score_for_e1_e3_e5',
        compositeScore: candidate.score,
        e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
        e3NetworkBasis: 'virtual_dependency_network_not_persisted',
        e5AccelerationBasis: 'scenario_recovery_factor_hint',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }))
      expect(candidate.virtualNetworkHints.evaluationRole).toBe('candidate_virtual_network_only')
      expect(candidate.virtualNetwork).toEqual(expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
        totalSpanDays: expect.any(Number),
        criticalNodeIds: expect.any(Array),
      }))
      expect(candidate.virtualNetwork.nodes.length).toBeGreaterThan(0)
      expect(candidate.virtualNetwork.dependencies.length).toBeGreaterThan(0)
    }
  })

  it('does not let crane or hoist counts change the selected construction organization scenario', () => {
    const baseFacts = {
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      foundationDepthM: 5,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
    }

    const scarceResources = selectConstructionOrganizationScenario({
      ...baseFacts,
      towerCraneCount: 1,
      constructionHoistCount: 1,
    })
    const abundantResources = selectConstructionOrganizationScenario({
      ...baseFacts,
      towerCraneCount: 3,
      constructionHoistCount: 3,
    })

    expect(scarceResources.recommendedScenarioIds).toEqual(abundantResources.recommendedScenarioIds)
    expect(scarceResources.boundaryPolicy.resourcePolicy).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
    expect(abundantResources.boundaryPolicy.resourcePolicy).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
  })

  it('uses virtual network span when choosing between basement release scenarios', () => {
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

    const towerEarly = selection.candidates.find((candidate) => candidate.scenarioId === 'tower_lane_early_release_after_core_basement')!
    const basementFirst = selection.candidates.find((candidate) => candidate.scenarioId === 'shared_basement_first_then_tower')!

    expect(towerEarly.virtualNetwork.totalSpanDays).toBeLessThan(basementFirst.virtualNetwork.totalSpanDays)
    expect(selection.recommendedScenarioIds).toContain('tower_lane_early_release_after_core_basement')
    expect(selection.recommendedScenarioIds).not.toContain('shared_basement_first_then_tower')
  })

  it('builds multiple comparable plan options and selects the best option without extra frontend inputs', () => {
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
      towerCraneCount: 1,
      constructionHoistCount: 1,
    })

    expect(selection.frontendInputRequired).toBe(false)
    expect(selection.planOptions.length).toBeGreaterThanOrEqual(2)
    expect(selection.planOptions.map((option) => option.optionId)).toEqual(expect.arrayContaining([
      'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
      'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
    ]))
    expect(selection.recommendedPlanOption.optionId).toBe('construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement')
    expect(selection.recommendedPlanOption.selectedScenarioIds).toEqual([
      'pile_before_excavation',
      'tower_lane_early_release_after_core_basement',
    ])
    expect(selection.recommendedPlanOption.combinedScore).toBeGreaterThan(
      selection.planOptions.find((option) => option.optionId === 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower')!.combinedScore,
    )
    expect(selection.planOptionComparisonPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option_comparison_package',
      totalOptionCount: selection.planOptions.length,
      recommendedOptionIdsByUseCase: expect.objectContaining({
        newProjectPlanning: selection.scenarioRecommendations.newProjectPlanning.optionId,
        startingLineOnboarding: selection.scenarioRecommendations.startingLineOnboarding.optionId,
        accelerationRecovery: selection.scenarioRecommendations.accelerationRecovery.optionId,
      }),
      canAutoMaterializeSelectedOption: false,
      comparisonBasis: expect.arrayContaining([
        'candidate_option_e1_e3_e5_summary',
        'use_case_specific_recommendation_scores',
        'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      ]),
      options: expect.arrayContaining([
        expect.objectContaining({
          optionId: selection.recommendedPlanOption.optionId,
          selectedScenarioIds: selection.recommendedPlanOption.selectedScenarioIds,
          isRecommendedFor: expect.arrayContaining(['newProjectPlanning']),
          e3: expect.objectContaining({
            projectDurationDays: expect.any(Number),
            edgeCount: expect.any(Number),
            writesCriticalPathFacts: false,
          }),
          e5: expect.objectContaining({
            recoveryFactorHint: expect.any(Number),
            e5RecoverableSpanDays: expect.any(Number),
            writesAccelerationDraft: false,
          }),
          boundaryPolicy: expect.objectContaining({
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          }),
        }),
      ]),
    }))
    for (const option of selection.planOptions) {
      expect(option.combinedVirtualNetwork).toEqual(expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
        totalSpanDays: expect.any(Number),
      }))
      expect(option.evaluation).toEqual(expect.objectContaining({
        evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
        networkEvaluation: expect.objectContaining({
          evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5',
          projectDurationDays: expect.any(Number),
          networkSchedule: expect.arrayContaining([
            expect.objectContaining({
              nodeId: expect.any(String),
              startDay: expect.any(Number),
              finishDay: expect.any(Number),
              totalFloatDays: expect.any(Number),
              isCritical: expect.any(Boolean),
            }),
          ]),
        }),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }))
      expect(option.evaluation.useCaseEvaluations).toEqual(expect.objectContaining({
        newProjectPlanning: expect.objectContaining({
          useCase: 'new_project_planning',
          optionId: option.optionId,
          actionability: 'actionable_candidate',
          rankBasis: expect.arrayContaining(['default_new_project_planning_option']),
          factCoverage: expect.objectContaining({
            source: 'wizard_project_generation_fact_coverage',
            consumedFactKeys: expect.arrayContaining([
              'businessType',
              'projectTypeCode',
              'methodVariantCodes',
              'buildingPatternCodes',
              'buildingCount',
              'basementLevelCount',
              'foundationDepthM',
            ]),
            sidecarFactKeys: expect.arrayContaining(['towerCraneCount', 'constructionHoistCount']),
            resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
          }),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }),
        startingLineOnboarding: expect.objectContaining({
          useCase: 'starting_line_onboarding',
          optionId: option.optionId,
          actionability: 'evidence_only',
          rankBasis: expect.arrayContaining(['no_starting_line_context']),
        }),
        accelerationRecovery: expect.objectContaining({
          useCase: 'acceleration_recovery',
          optionId: option.optionId,
          rankBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
          e5RecoverableSpanDays: option.evaluation.networkEvaluation.e5RecoverableSpanDays,
          recoveryFactorHint: option.evaluation.recoveryFactorHint,
        }),
      }))
    }
  })

  it('uses the broader wizard fact surface when scoring construction organization options', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      businessSubtype: 'hospital',
      projectTypeCode: 'hospital',
      detailLevel: 'detailed',
      structureTypeCode: 'steel_structure',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      prefabSystemCodes: ['prefab_pc'],
      elementVariantCodes: ['steel_structure'],
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation', 'occupied_renovation'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      functionalUsageCodes: ['hospital'],
      floorUsageCodes: ['refuge_floor'],
      functionalCategoryCodes: ['cleanroom'],
      specialRoomTypeCodes: ['icu'],
      physicalZoneTypeCodes: ['outdoor_site_plan'],
      planScopeCaliber: 'full_project_master',
      deliveryStandard: 'production_ready',
      terminalEvent: 'completion_acceptance',
      totalAreaM2: 180000,
      aboveGroundAreaM2: 130000,
      buildingCount: 3,
      standardFloorCount: 32,
      highestBuildingFloorCount: 38,
      basementLevelCount: 2,
      basementAreaM2: 32000,
      siteAreaM2: 76000,
      foundationDepthM: 6,
      prefabRate: 0.35,
      maxSpanM: 21,
      supportHeightM: 9,
      hasCivilDefense: true,
      projectFeatures: {
        cleanroomGrade: 'iso7',
      },
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
    })

    expect(selection.factBasis).toEqual(expect.objectContaining({
      businessSubtype: 'hospital',
      detailLevel: 'detailed',
      structureTypeCode: 'steel_structure',
      totalAreaM2: 180000,
      aboveGroundAreaM2: 130000,
      siteAreaM2: 76000,
      standardFloorCount: 32,
      highestBuildingFloorCount: 38,
      prefabRate: 0.35,
      maxSpanM: 21,
      supportHeightM: 9,
      hasCivilDefense: true,
      functionalUsageCodes: ['hospital'],
      floorUsageCodes: ['refuge_floor'],
      functionalCategoryCodes: ['cleanroom'],
      specialRoomTypeCodes: ['icu'],
      physicalZoneTypeCodes: ['outdoor_site_plan'],
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation', 'occupied_renovation'],
      projectFeatures: expect.objectContaining({
        cleanroomGrade: 'iso7',
      }),
      derivedOrganizationSignals: expect.objectContaining({
        highRise: true,
        largeBasement: true,
        largeProjectScale: true,
        prefabOrSteel: true,
        complexPublicUse: true,
        outdoorOrSiteInterface: true,
        externalInterfaceConstraint: true,
        nonStopOrOccupiedConstraint: true,
        highRiskTemporaryWorks: true,
      }),
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage).toEqual(expect.objectContaining({
      consumedFactKeys: expect.arrayContaining([
        'detailLevel',
        'externalInterfaceCodes',
        'hardConstraintCodes',
        'projectFeatures',
      ]),
    }))
    expect(selection.planOptions.length).toBeGreaterThanOrEqual(2)
    expect(selection.recommendedPlanOption.evaluation.networkEvaluation.projectDurationDays).toBeGreaterThan(0)
  })

  it('attaches the business-type scheme family to every comparable option as E1 E3 E5 candidate evidence', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'hospital',
      businessSubtype: 'hospital',
      projectTypeCode: 'hospital',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      functionalUsageCodes: ['hospital'],
      functionalCategoryCodes: ['cleanroom'],
      specialRoomTypeCodes: ['operating_room'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 32000,
      foundationDepthM: 6,
      highestBuildingFloorCount: 28,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
    })

    expect(selection.planOptions.length).toBeGreaterThanOrEqual(2)
    for (const option of selection.planOptions) {
      expect(option.projectOrganizationScheme).toEqual(expect.objectContaining({
        source: 'project_organization_policy_scheme_candidate',
        evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
        policyId: 'project-organization-hospital-functional-campus-v1',
        strategy: 'hospital_functional_building_interface_gate_network',
        schemeFamily: 'functional_campus_medical_specialty_gate',
        primaryInterfaceSequence: expect.arrayContaining([
          'functional_building_release',
          'clean_area_release',
          'medical_gas_interface',
        ]),
        interfaceGateTags: expect.arrayContaining([
          'cleanroom_gate',
          'medical_gas_gate',
          'special_acceptance_gate',
        ]),
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }))
      expect(option.evaluation.engineEvaluationSummary.projectOrganization).toEqual(expect.objectContaining({
        schemeFamily: 'functional_campus_medical_specialty_gate',
        primaryInterfaceSequence: expect.arrayContaining(['functional_building_release']),
        interfaceGateTags: expect.arrayContaining(['cleanroom_gate']),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }))
    }
    expect(selection.recommendedPlanOption.projectOrganizationScheme).toEqual(
      selection.planOptions.find((option) => option.optionId === selection.recommendedPlanOption.optionId)?.projectOrganizationScheme,
    )
  })

  it('normalizes wizard-collected facts from projectGenerationFacts and projectFeatures before scoring', () => {
    const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts({
      businessType: 'general_civil',
      projectTypeCode: 'hospital',
      detailLevel: 'planning_skeleton',
      projectFeatures: {
        methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
        buildingPatternCodes: ['multi_tower_shared_podium'],
        buildingCount: 3,
        basementLevelCount: 2,
        basementAreaM2: 28000,
        foundationDepthM: 5,
        highestBuildingFloorCount: 30,
        climateSignals: ['rainy_season'],
        weatherImpactBands: ['earthwork_rain_sensitive'],
        scopeOrganizationFacts: {
          source: 'wizard_scope_objects',
          buildingObjectCount: 3,
          sharedBasementObjectCount: 1,
          sharedBasementServiceTargetCount: 3,
          organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
        },
        towerCraneCount: 2,
        constructionHoistCount: 3,
      },
    }, {
      onboardingMode: 'starting_line',
      onboardingSubstage: 'foundation',
    })

    expect(selectorInput).toEqual(expect.objectContaining({
      businessType: 'general_civil',
      projectTypeCode: 'hospital',
      detailLevel: 'planning_skeleton',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 28000,
      foundationDepthM: 5,
      highestBuildingFloorCount: 30,
      climateSignals: ['rainy_season'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      towerCraneCount: 2,
      constructionHoistCount: 3,
      onboardingMode: 'starting_line',
      onboardingSubstage: 'foundation',
    }))

    const selection = selectConstructionOrganizationScenario(selectorInput)

    expect(selection.factBasis).toEqual(expect.objectContaining({
      usesExistingWizardFactsOnly: true,
      businessType: 'general_civil',
      projectTypeCode: 'hospital',
      scopeOrganizationFacts: expect.objectContaining({
        source: 'wizard_scope_objects',
        sharedBasementServiceTargetCount: 3,
      }),
      resourceRole: 'sidecar_feasibility_signal',
    }))
    expect(selection.recommendedScenarioIds).toEqual(expect.arrayContaining([
      'pile_before_excavation',
      'shared_basement_first_then_tower',
    ]))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'actionable_candidate',
      factCoverage: expect.objectContaining({
        consumedFactKeys: expect.arrayContaining([
          'projectTypeCode',
          'scopeOrganizationFacts',
          'onboardingMode',
          'onboardingSubstage',
        ]),
        sidecarFactKeys: expect.arrayContaining(['towerCraneCount', 'constructionHoistCount']),
      }),
    }))
  })

  it('hydrates construction organization facts from stored snake_case project_generation_facts', () => {
    const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts({
      project_generation_facts: {
        business_type: 'general_civil',
        business_subtype: 'residential',
        project_type_code: 'residential',
        structure_type_code: 'frame_shear',
        plan_scope_caliber: 'general_contract',
        delivery_standard: 'full_fitout',
        terminal_event: 'owner_handover',
        detail_level: 'planning_skeleton',
        method_variant_codes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
        prefab_system_codes: ['pc_facade'],
        element_variant_codes: ['pcf_facade'],
        external_interface_codes: ['metro_operation_interface'],
        hard_constraint_codes: ['non_stop_operation'],
        building_pattern_codes: ['multi_tower_shared_podium'],
        functional_usage_codes: ['residential'],
        physical_zone_type_codes: ['outdoor_site_plan'],
        building_count: 3,
        total_area_m2: 98100,
        above_ground_area_m2: 72100,
        basement_level_count: 2,
        basement_area_m2: 26000,
        site_area_m2: 51000,
        foundation_depth_m: 5,
        standard_floor_count: 26,
        highest_building_floor_count: 30,
        prefab_rate: 0.32,
        max_span_m: 21,
        support_height_m: 9,
        has_civil_defense: true,
        climate_signals: ['plum_rain'],
        weather_impact_bands: ['earthwork_rain_sensitive'],
        location_facts: {
          provinceCode: 'zhejiang',
          climateSignals: ['plum_rain'],
        },
        scope_organization_facts: {
          source: 'engineering_objects',
          buildingObjectCount: 3,
          sharedBasementObjectCount: 1,
          sharedBasementServiceTargetCount: 3,
          sharedPodiumObjectCount: 1,
          outdoorSiteObjectCount: 1,
          organizationSignals: [
            'multi_building_scope_objects',
            'shared_basement_service_range',
            'shared_podium_service_range',
            'outdoor_site_scope_present',
          ],
        },
        tower_crane_count: 2,
        construction_hoist_count: 3,
        onboarding_mode: 'starting_line',
        onboarding_substage: 'foundation',
        onboarding_passed_milestones: ['pile_foundation_acceptance'],
        onboarding_phase_progress: {
          foundation: { progress: 60 },
        },
      },
    })

    expect(selectorInput).toEqual(expect.objectContaining({
      businessType: 'general_civil',
      businessSubtype: 'residential',
      projectTypeCode: 'residential',
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'full_fitout',
      terminalEvent: 'owner_handover',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      prefabSystemCodes: ['pc_facade'],
      elementVariantCodes: ['pcf_facade'],
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      totalAreaM2: 98100,
      foundationDepthM: 5,
      prefabRate: 0.32,
      maxSpanM: 21,
      supportHeightM: 9,
      hasCivilDefense: true,
      climateSignals: ['plum_rain'],
      weatherImpactBands: ['earthwork_rain_sensitive'],
      towerCraneCount: 2,
      constructionHoistCount: 3,
      onboardingMode: 'starting_line',
      onboardingSubstage: 'foundation',
      onboardingPassedMilestones: ['pile_foundation_acceptance'],
      onboardingPhaseProgress: {
        foundation: { progress: 60 },
      },
    }))

    const selection = selectConstructionOrganizationScenario(selectorInput)

    expect(selection.factBasis).toEqual(expect.objectContaining({
      usesExistingWizardFactsOnly: true,
      scopeOrganizationFacts: expect.objectContaining({
        source: 'engineering_objects',
        sharedBasementServiceTargetCount: 3,
        outdoorSiteObjectCount: 1,
      }),
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage).toEqual(expect.objectContaining({
      decisionFactKeys: expect.arrayContaining([
        'scopeOrganizationFacts',
        'methodVariantCodes',
        'prefabSystemCodes',
        'externalInterfaceCodes',
        'hardConstraintCodes',
        'buildingCount',
        'basementLevelCount',
        'foundationDepthM',
        'climateSignals',
        'weatherImpactBands',
      ]),
      contextFactKeys: expect.arrayContaining([
        'businessType',
        'projectTypeCode',
        'planScopeCaliber',
        'deliveryStandard',
        'terminalEvent',
        'detailLevel',
        'locationFacts',
      ]),
      consumedFactKeys: expect.arrayContaining([
        'planScopeCaliber',
        'deliveryStandard',
        'terminalEvent',
        'scopeOrganizationFacts',
        'methodVariantCodes',
        'prefabSystemCodes',
        'externalInterfaceCodes',
        'hardConstraintCodes',
        'buildingCount',
        'basementLevelCount',
        'foundationDepthM',
        'climateSignals',
        'weatherImpactBands',
        'locationFacts',
      ]),
      sidecarFactKeys: expect.arrayContaining(['towerCraneCount', 'constructionHoistCount']),
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'not_actionable_after_current_phase',
      currentSubstage: 'foundation',
      rankBasis: expect.arrayContaining([
        'starting_line_passed_foundation_or_basement_milestone',
      ]),
      factCoverage: expect.objectContaining({
        consumedFactKeys: expect.arrayContaining([
          'onboardingMode',
          'onboardingSubstage',
          'onboardingPassedMilestones',
          'onboardingPhaseProgress',
        ]),
      }),
    }))
  })

  it('consumes scope organization relationships from wizard scope objects as decision facts, not resource constraints', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 22000,
      foundationDepthM: 5,
      scopeOrganizationFacts: {
        source: 'wizard_scope_objects',
        scopeObjectCount: 6,
        buildingObjectCount: 3,
        basementObjectCount: 1,
        sharedBasementObjectCount: 1,
        sharedPodiumObjectCount: 1,
        outdoorSiteObjectCount: 1,
        serviceRelationCount: 4,
        servedRelationCount: 3,
        sharedBasementServiceTargetCount: 3,
        sharedScopeServiceTargetCount: 6,
        sharedBasementServiceTargetKindCounts: { building: 3 },
        sharedScopeServiceTargetKindCounts: { building: 5, independent_engineering_zone: 1 },
        organizationSignals: [
          'multi_building_scope_objects',
          'shared_basement_service_range',
          'shared_basement_serves_multiple_buildings',
          'shared_podium_service_range',
          'shared_scope_serves_independent_engineering_zone',
          'outdoor_site_scope_present',
        ],
      },
    })

    expect(selection.factBasis).toEqual(expect.objectContaining({
      scopeOrganizationFacts: expect.objectContaining({
        source: 'wizard_scope_objects',
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedPodiumObjectCount: 1,
        outdoorSiteObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        organizationSignals: expect.arrayContaining([
          'multi_building_scope_objects',
          'shared_basement_service_range',
          'shared_podium_service_range',
          'outdoor_site_scope_present',
        ]),
      }),
      derivedOrganizationSignals: expect.objectContaining({
        scopeSharedBasement: true,
        scopeSharedBasementAcrossBuildings: true,
        scopeSharedPodium: true,
        scopeSharedScopeServesIndependentEngineeringZone: true,
        scopeOutdoorSite: true,
      }),
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage).toEqual(expect.objectContaining({
      consumedFactKeys: expect.arrayContaining(['scopeOrganizationFacts']),
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    }))
    expect(selection.recommendedScenarioIds).toEqual(expect.arrayContaining(['shared_basement_first_then_tower']))
  })

  it('publishes use-case recommendations for new project, starting-line onboarding, and acceleration from the same wizard facts', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
      onboardingMode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPhaseProgress: {
        'building-1': { currentFloor: 'L12', progress: 42 },
      },
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
    })

    expect(selection.scenarioRecommendations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        useCase: 'new_project_planning',
        optionId: selection.recommendedPlanOption.optionId,
        actionability: 'actionable_candidate',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      startingLineOnboarding: expect.objectContaining({
        useCase: 'starting_line_onboarding',
        optionId: expect.any(String),
        actionability: 'not_actionable_after_current_phase',
        currentSubstage: 'main_structure',
        recommendationBasis: expect.arrayContaining([
          'starting_line_current_phase_past_foundation_or_basement',
          'starting_line_passed_milestones_present',
          'starting_line_phase_progress_present',
        ]),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      accelerationRecovery: expect.objectContaining({
        useCase: 'acceleration_recovery',
        optionId: expect.any(String),
        actionability: 'actionable_candidate',
        recommendationBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
    }))
    expect(selection.factBasis).toEqual(expect.objectContaining({
      onboardingMode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
      onboardingPhaseProgress: {
        'building-1': { currentFloor: 'L12', progress: 42 },
      },
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      useCase: 'starting_line_onboarding',
      optionId: selection.recommendedPlanOption.optionId,
      actionability: 'not_actionable_after_current_phase',
      currentSubstage: 'main_structure',
      rankBasis: expect.arrayContaining([
        'starting_line_current_phase_past_foundation_or_basement',
        'starting_line_passed_milestones_present',
        'starting_line_phase_progress_present',
      ]),
    }))
  })

  it('keeps starting-line recommendation evidence-only when onboarding context is absent', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })

    expect(selection.scenarioRecommendations.newProjectPlanning).toEqual(expect.objectContaining({
      actionability: 'actionable_candidate',
      optionId: selection.recommendedPlanOption.optionId,
    }))
    expect(selection.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'evidence_only',
      recommendationBasis: expect.arrayContaining(['no_starting_line_context']),
      optionId: selection.recommendedPlanOption.optionId,
    }))
    expect(selection.scenarioRecommendations.accelerationRecovery).toEqual(expect.objectContaining({
      actionability: 'actionable_candidate',
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.newProjectPlanning.factCoverage.missingFactKeys).not.toEqual(
      expect.arrayContaining([
        'onboardingMode',
        'onboardingSubstage',
        'onboardingPassedMilestones',
        'onboardingPhaseProgress',
      ]),
    )
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding.factCoverage.missingFactKeys).toEqual(
      expect.arrayContaining([
        'onboardingMode',
        'onboardingSubstage',
        'onboardingPassedMilestones',
        'onboardingPhaseProgress',
      ]),
    )
  })

  it('keeps starting-line recommendation evidence-only when mode is present but current stage is missing', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
      onboardingMode: 'starting_line',
    })

    expect(selection.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'evidence_only',
      optionId: selection.recommendedPlanOption.optionId,
      recommendationBasis: expect.arrayContaining([
        'onboarding_mode_starting_line',
        'starting_line_current_stage_missing',
      ]),
    }))
    expect(selection.scenarioRecommendations.startingLineOnboarding.recommendationBasis).not.toEqual(
      expect.arrayContaining(['starting_line_current_phase_allows_organization_candidate']),
    )
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'evidence_only',
      rankBasis: expect.arrayContaining([
        'onboarding_mode_starting_line',
        'starting_line_current_stage_missing',
      ]),
      factCoverage: expect.objectContaining({
        consumedFactKeys: expect.arrayContaining(['onboardingMode']),
        missingFactKeys: expect.arrayContaining([
          'onboardingSubstage',
          'onboardingPassedMilestones',
          'onboardingPhaseProgress',
        ]),
      }),
    }))
  })

  it('does not let starting-line onboarding inherit the acceleration-recovery option before the project has passed foundation decisions', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy', 'earthwork_rain'],
      onboardingMode: 'starting_line',
      onboardingSubstage: 'foundation',
    })

    expect(selection.scenarioRecommendations.newProjectPlanning.optionId).toBe(selection.recommendedPlanOption.optionId)
    expect(selection.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'actionable_candidate',
      optionId: selection.scenarioRecommendations.newProjectPlanning.optionId,
      recommendationBasis: expect.arrayContaining(['starting_line_current_phase_allows_organization_candidate']),
    }))
    expect(selection.scenarioRecommendations.accelerationRecovery.optionId).not.toBe(
      selection.scenarioRecommendations.startingLineOnboarding.optionId,
    )
  })

  it('selects the observed tower-lane option for starting-line onboarding when live progress proves tower early release', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy', 'earthwork_rain'],
      scopeOrganizationFacts: {
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
      },
      onboardingMode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPhaseProgress: {
        'building-a': { currentFloor: 'L12', progress: 42, status: 'in_progress' },
      },
    })

    expect(selection.scenarioRecommendations.newProjectPlanning.optionId).toBe(selection.recommendedPlanOption.optionId)
    expect(selection.scenarioRecommendations.newProjectPlanning.selectedScenarioIds).toEqual(
      expect.arrayContaining(['shared_basement_first_then_tower']),
    )
    expect(selection.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'not_actionable_after_current_phase',
      selectedScenarioIds: expect.arrayContaining(['tower_lane_early_release_after_core_basement']),
      recommendationBasis: expect.arrayContaining([
        'starting_line_tower_lane_progress_observed',
        'selected_by_starting_line_observed_progress',
      ]),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
    }))
    expect(selection.scenarioRecommendations.startingLineOnboarding.optionId).not.toBe(
      selection.scenarioRecommendations.newProjectPlanning.optionId,
    )
    const startingLineOption = selection.planOptions.find((option) => (
      option.optionId === selection.scenarioRecommendations.startingLineOnboarding.optionId
    ))
    expect(startingLineOption?.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      optionId: selection.scenarioRecommendations.startingLineOnboarding.optionId,
      rankBasis: expect.arrayContaining([
        'starting_line_tower_lane_progress_observed',
        'selected_by_starting_line_observed_progress',
      ]),
    }))

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-09-20',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure after basement in saved starting-line schedule',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-09-25',
        plannedEndDate: '2027-03-31',
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-04-01',
        plannedEndDate: '2027-04-08',
      },
    ])

    expect(projected.scenarioRecommendations.newProjectPlanning.selectedScenarioIds).toEqual(
      expect.arrayContaining(['shared_basement_first_then_tower']),
    )
    expect(projected.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      optionId: selection.scenarioRecommendations.startingLineOnboarding.optionId,
      selectedScenarioIds: expect.arrayContaining(['tower_lane_early_release_after_core_basement']),
      recommendationBasis: expect.arrayContaining([
        'starting_line_tower_lane_progress_observed',
        'selected_by_starting_line_observed_progress',
      ]),
    }))
    expect(projected.planNetworkDraftRecommendations?.startingLineOnboarding).toEqual(expect.objectContaining({
      optionId: selection.scenarioRecommendations.startingLineOnboarding.optionId,
      useCase: 'starting_line_onboarding',
    }))
  })

  it('uses Step5 passed milestones as starting-line decision locks and fact coverage evidence', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy', 'earthwork_rain'],
      onboardingMode: 'starting_line',
      onboardingSubstage: 'foundation',
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
      onboardingPhaseProgress: {
        basement: { progress: 100, status: 'accepted' },
      },
    })

    expect(selection.scenarioRecommendations.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'not_actionable_after_current_phase',
      currentSubstage: 'foundation',
      recommendationBasis: expect.arrayContaining([
        'starting_line_passed_foundation_or_basement_milestone',
        'starting_line_passed_milestones_present',
        'starting_line_phase_progress_present',
      ]),
    }))
    expect(selection.recommendedPlanOption.evaluation.useCaseEvaluations?.startingLineOnboarding).toEqual(expect.objectContaining({
      actionability: 'not_actionable_after_current_phase',
      rankBasis: expect.arrayContaining([
        'starting_line_passed_foundation_or_basement_milestone',
      ]),
      factCoverage: expect.objectContaining({
        consumedFactKeys: expect.arrayContaining([
          'onboardingMode',
          'onboardingSubstage',
          'onboardingPassedMilestones',
          'onboardingPhaseProgress',
        ]),
      }),
    }))
  })

  it('projects plan-option virtual nodes onto generated WBS row carriers without writing schedule facts', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-foundation',
        title: '桩基础施工',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-07-15',
      },
      {
        id: 'row-basement',
        title: '地下室结构施工',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-16',
        plannedEndDate: '2026-10-15',
      },
      {
        id: 'row-tower',
        title: '主体结构施工',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-10-16',
        plannedEndDate: '2027-04-30',
      },
      {
        id: 'row-gate',
        title: '结构验收移交',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
      },
    ])

    expect(projected.recommendedPlanOption.evaluation.generatedRowProjection).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option_generated_row_projection',
      projectionBasis: 'generated_wbs_rows_mapped_to_virtual_plan_option_nodes',
      generatedRowMatchCount: 4,
      projectionConfidence: expect.stringMatching(/^(high|medium)$/),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(projected.recommendedPlanOption.evaluation.generatedRowProjection?.phaseCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'foundation',
        generatedRowIds: expect.arrayContaining(['row-foundation']),
      }),
      expect.objectContaining({
        phase: 'basement',
        generatedRowIds: expect.arrayContaining(['row-basement']),
      }),
      expect.objectContaining({
        phase: 'tower',
        generatedRowIds: expect.arrayContaining(['row-tower']),
      }),
    ]))
    expect(projected.recommendedPlanOption.evaluation.generatedRowProjection?.candidateDependencyPreview).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_dependency_preview',
      previewBasis: 'virtual_dependency_edges_mapped_to_generated_wbs_row_carriers',
      materializationReadiness: expect.objectContaining({
        source: 'construction_organization_candidate_materialization_readiness',
        readiness: 'ready_for_manual_materialization_preview',
        reasons: expect.arrayContaining(['all_virtual_dependency_edges_have_generated_row_carriers']),
        previewEdgeCount: expect.any(Number),
        unresolvedEdgeCount: 0,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      previewEdges: expect.arrayContaining([
        expect.objectContaining({
          fromVirtualNodeId: expect.any(String),
          toVirtualNodeId: expect.any(String),
          fromGeneratedRowIds: expect.arrayContaining([expect.any(String)]),
          toGeneratedRowIds: expect.arrayContaining([expect.any(String)]),
          dependencyType: expect.stringMatching(/^(FS|SS)$/),
          lagDays: expect.any(Number),
          intent: expect.any(String),
          materializationStatus: 'preview_only',
          writesTaskDependencies: false,
        }),
      ]),
      unresolvedEdges: [],
    }))
    expect(projected.planOptions[0].evaluation.generatedRowProjection?.generatedScheduleSpanDays).toBeGreaterThan(0)
  })

  it('uses coarse planning-skeleton rows as review carriers without producing same-row dependency previews', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
      climateSignals: ['rainy_season'],
      physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-01',
        title: '地基与基础',
        stableCode: '01',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-09-30',
      },
      {
        id: 'row-02',
        title: '主体结构',
        stableCode: '02',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-10-01',
        plannedEndDate: '2027-04-30',
      },
      {
        id: 'row-outdoor',
        title: '室外总平',
        stableCode: 'OUT',
        executionPhase: 'outdoor_municipal_landscape',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-03-01',
        plannedEndDate: '2027-05-30',
      },
      {
        id: 'row-handoff',
        title: '竣工验收移交',
        stableCode: 'ACCEPT',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-06-01',
        plannedEndDate: '2027-06-10',
      },
    ])

    const preview = projected.recommendedPlanOption.evaluation.generatedRowProjection?.candidateDependencyPreview
    expect(preview?.previewEdges.length).toBeGreaterThan(0)
    expect(preview?.previewEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromGeneratedRowIds: expect.arrayContaining(['row-01']),
        toGeneratedRowIds: expect.arrayContaining(['row-02']),
        writesTaskDependencies: false,
      }),
    ]))
    expect(preview?.previewEdges.some((edge) => (
      edge.fromGeneratedRowIds.some((fromId) => edge.toGeneratedRowIds.includes(fromId))
    ))).toBe(false)
    expect(projected.planNetworkDraftRecommendations?.newProjectPlanning?.e3?.previewEdgeCount ?? 0).toBeGreaterThan(0)
  })

  it('projects generated-row E1 reference duration evidence without treating virtual durations as runtime E1 output', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-foundation',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-07-15',
        smartReferenceDays: 45,
        durationSuggestion: {
          recommendedDurationDays: 42,
          planReferenceDays: 45,
          contextualReferenceDays: 44,
        },
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork_excavation',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-16',
        plannedEndDate: '2026-08-15',
        smartReferenceDays: 31,
        durationSuggestion: {
          recommendedDurationDays: 30,
          planReferenceDays: 31,
          contextualReferenceDays: 30,
        },
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-16',
        plannedEndDate: '2026-11-15',
        smartReferenceDays: 92,
        durationSuggestion: {
          recommendedDurationDays: 88,
          planReferenceDays: 92,
          contextualReferenceDays: 90,
        },
      },
      {
        id: 'row-tower',
        title: 'tower lane superstructure',
        stableCode: '02-01',
        executionPhase: 'tower_superstructure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-16',
        plannedEndDate: '2027-05-31',
        smartReferenceDays: 197,
        durationSuggestion: {
          recommendedDurationDays: 190,
          planReferenceDays: 197,
          contextualReferenceDays: 194,
        },
      },
      {
        id: 'row-handoff',
        title: 'basement to tower handoff acceptance',
        stableCode: 'ACCEPT-01',
        executionPhase: 'handoff_acceptance',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-06-01',
        plannedEndDate: '2027-06-08',
        smartReferenceDays: 8,
        durationSuggestion: {
          recommendedDurationDays: 8,
          planReferenceDays: 8,
          contextualReferenceDays: 8,
        },
      },
    ])

    expect(projected.recommendedPlanOption.evaluation.engineEvaluationSummary.e1.output).toBe(
      'virtual_work_package_duration_proxy_pending_generated_row_projection',
    )
    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    expect(projection?.generatedRowReferenceDurationEvidence).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_reference_duration_projection',
      durationBasis: 'generated_row_plan_dates_and_plan_reference_days',
      matchedReferenceRowCount: expect.any(Number),
      totalPlanReferenceDays: expect.any(Number),
      writesReferenceDuration: false,
      writesPlanDates: false,
      writesSeed: false,
    }))
    expect(projection?.generatedRowReferenceDurationEvidence?.matchedReferenceRowCount).toBeGreaterThan(0)
    expect(projection?.generatedRowReferenceDurationEvidence?.phaseDurations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'foundation',
        planReferenceDays: 45,
        contextualReferenceDays: 44,
        recommendedDurationDays: 42,
        generatedRowIds: expect.arrayContaining(['row-foundation']),
      }),
      expect.objectContaining({
        phase: 'tower',
        planReferenceDays: 197,
        contextualReferenceDays: 194,
        recommendedDurationDays: 190,
        generatedRowIds: expect.arrayContaining(['row-tower']),
      }),
    ]))
    expect(projection?.gapReasons).toContain('generated_row_reference_duration_projection_attached')
  })

  it('evaluates a read-only generated-row candidate network for each plan option', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-foundation',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
        smartReferenceDays: 30,
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-04',
        executionPhase: 'earthwork_excavation',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-31',
        smartReferenceDays: 31,
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
        smartReferenceDays: 92,
      },
      {
        id: 'row-tower',
        title: 'tower lane superstructure',
        stableCode: '02-01',
        executionPhase: 'tower_superstructure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
        smartReferenceDays: 181,
      },
      {
        id: 'row-handoff',
        title: 'basement to tower handoff acceptance',
        stableCode: 'ACCEPT-01',
        executionPhase: 'handoff_acceptance',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
        smartReferenceDays: 8,
      },
    ])

    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    expect(projection?.generatedRowNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
      projectedNetworkSpanDays: expect.any(Number),
      criticalGeneratedRowIds: expect.arrayContaining([expect.any(String)]),
      unresolvedEdgeCount: 0,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(projection?.generatedRowNetworkEvaluation?.projectedNetworkSpanDays).toBeGreaterThan(300)
    expect(projection?.generatedRowNetworkEvaluation?.rowSchedule).toEqual(expect.arrayContaining([
      expect.objectContaining({
        generatedRowId: 'row-foundation',
        durationDays: 30,
        isCritical: expect.any(Boolean),
      }),
      expect.objectContaining({
        generatedRowId: 'row-tower',
        durationDays: 181,
        isCritical: expect.any(Boolean),
      }),
    ]))
    expect(projection?.generatedRowNetworkEvaluation?.materializationStatus).toBe('fully_mapped_read_only')
  })

  it('marks candidate dependency preview ready only when every virtual edge maps to generated row carriers', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      detailLevel: 'planning_skeleton',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-foundation',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-04',
        executionPhase: 'earthwork_excavation',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-31',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
      },
      {
        id: 'row-tower',
        title: 'tower lane superstructure',
        stableCode: '02-01',
        executionPhase: 'tower_superstructure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
      },
      {
        id: 'row-handoff',
        title: 'basement to tower handoff acceptance',
        stableCode: 'ACCEPT-01',
        executionPhase: 'handoff_acceptance',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
      },
    ])

    const preview = projected.recommendedPlanOption.evaluation.generatedRowProjection?.candidateDependencyPreview
    expect(preview).toEqual(expect.objectContaining({
      unresolvedEdges: [],
      materializationReadiness: expect.objectContaining({
        source: 'construction_organization_candidate_materialization_readiness',
        readiness: 'ready_for_manual_materialization_preview',
        reasons: expect.arrayContaining(['all_virtual_dependency_edges_have_generated_row_carriers']),
        previewEdgeCount: expect.any(Number),
        unresolvedEdgeCount: 0,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect(projected.recommendedPlanOption.evaluation.generatedRowProjection?.materializationReviewPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_materialization_review_package',
      packageBasis: 'manual_review_package_from_generated_row_preview_edges',
      optionId: projected.recommendedPlanOption.optionId,
      status: 'ready_for_manual_review',
      allowManualReview: true,
      proposedDependencyEdgeCount: expect.any(Number),
      proposedDependencyEdges: expect.arrayContaining([
        expect.objectContaining({
          operation: 'propose_create_dependency',
          writesTaskDependencies: false,
        }),
      ]),
      reviewRequired: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(
      projected.recommendedPlanOption.evaluation.generatedRowProjection?.materializationReviewPackage?.proposedDependencyEdgeCount ?? 0,
    ).toBeGreaterThan(0)
  })

  it('lets generated-row projection reselect the normal plan option when the assembled schedule proves a different organization', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })
    expect(selection.recommendedPlanOption.optionId).toBe(
      'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
    )

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-09-20',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure after basement',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-09-25',
        plannedEndDate: '2027-03-31',
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-04-01',
        plannedEndDate: '2027-04-08',
      },
    ])

    const towerEarly = projected.planOptions.find((option) => option.optionId.includes('tower_lane_early_release_after_core_basement'))!
    const basementFirst = projected.planOptions.find((option) => option.optionId.includes('shared_basement_first_then_tower'))!

    expect(projected.recommendedPlanOption.optionId).toBe(
      'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
    )
    expect(projected.recommendedScenarioIds).toEqual([
      'pile_before_excavation',
      'shared_basement_first_then_tower',
    ])
    expect(projected.scenarioRecommendations.newProjectPlanning.optionId).toBe(projected.recommendedPlanOption.optionId)
    expect(projected.scenarioRecommendations.startingLineOnboarding.optionId).toBe(projected.recommendedPlanOption.optionId)
    expect(basementFirst.evaluation.generatedRowProjection?.dependencyAlignmentScore).toBeGreaterThan(
      towerEarly.evaluation.generatedRowProjection?.dependencyAlignmentScore ?? 0,
    )
    expect(projected.planNetworkDraftRecommendations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        optionId: projected.recommendedPlanOption.optionId,
        readiness: expect.stringMatching(/^(ready_for_manual_review|ready_for_manual_materialization|needs_generated_row_carrier|evidence_only|blocked_by_violations|missing_generated_row_projection)$/),
      }),
      accelerationRecovery: expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        optionId: projected.scenarioRecommendations.accelerationRecovery.optionId,
      }),
    }))
    expect(projected.recommendedPlanOption.evaluation.generatedRowProjection?.gapReasons).toEqual(
      expect.arrayContaining(['selected_by_generated_row_projection_alignment']),
    )
  })

  it('uses read-only candidate materialization evaluation when generated-row preview edges contradict a plan option', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-09-20',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure starts too early for basement-first',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-15',
        plannedEndDate: '2027-03-31',
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-04-01',
        plannedEndDate: '2027-04-08',
      },
    ])

    const towerEarly = projected.planOptions.find((option) => option.optionId.includes('tower_lane_early_release_after_core_basement'))!
    const basementFirst = projected.planOptions.find((option) => option.optionId.includes('shared_basement_first_then_tower'))!

    expect(towerEarly.evaluation.generatedRowProjection?.candidateMaterializationEvaluation).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_materialization_evaluation',
      materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates',
      satisfiedEdgeCount: expect.any(Number),
      violatedEdgeCount: 0,
      materializationScore: expect.any(Number),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(basementFirst.evaluation.generatedRowProjection?.candidateMaterializationEvaluation).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_materialization_evaluation',
      violatedEdgeCount: expect.any(Number),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(
      towerEarly.evaluation.generatedRowProjection?.candidateMaterializationEvaluation?.materializationScore ?? 0,
    ).toBeGreaterThan(
      basementFirst.evaluation.generatedRowProjection?.candidateMaterializationEvaluation?.materializationScore ?? 0,
    )
    expect(projected.recommendedPlanOption.optionId).toBe(
      'construction_org_option:pile_before_excavation+tower_lane_early_release_after_core_basement',
    )
  })

  it('refreshes the acceleration use-case with generated-row network recovery evidence after projection', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-09-20',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure starts before basement-first can release',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-15',
        plannedEndDate: '2027-03-31',
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-04-01',
        plannedEndDate: '2027-04-08',
      },
    ])

    const acceleration = projected.scenarioRecommendations.accelerationRecovery
    const accelerationOption = projected.planOptions.find((option) => option.optionId === acceleration.optionId)

    expect(acceleration.recommendationBasis).toEqual(expect.arrayContaining([
      'generated_row_network_recovery_evidence',
      'selected_by_projected_acceleration_recovery_score',
    ]))
    expect(accelerationOption?.evaluation.useCaseEvaluations?.accelerationRecovery).toEqual(expect.objectContaining({
      optionId: acceleration.optionId,
      rankBasis: expect.arrayContaining([
        'generated_row_network_recovery_evidence',
        'selected_by_projected_acceleration_recovery_score',
      ]),
    }))
    expect(accelerationOption?.evaluation.generatedRowProjection?.generatedRowNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(accelerationOption?.evaluation.generatedRowProjection?.materializationDecision).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_materialization_decision',
      decision: expect.stringMatching(/^(ready_for_manual_materialization|needs_generated_row_carrier|evidence_only|blocked_by_violations)$/),
      allowManualMaterialization: expect.any(Boolean),
      reasons: expect.any(Array),
    }))
  })

  it('scores every projected comparison option from generated-row evidence, not only the selected option', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-09-20',
      },
      {
        id: 'row-tower',
        title: 'tower superstructure starts before basement-first can release',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-15',
        plannedEndDate: '2027-03-31',
      },
      {
        id: 'row-handoff',
        title: 'structure acceptance handoff',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-04-01',
        plannedEndDate: '2027-04-08',
      },
    ])

    expect(projected.planOptionComparisonPackage.options.length).toBeGreaterThan(1)
    for (const option of projected.planOptionComparisonPackage.options) {
      expect(option.systemRecommendationBasis.rankingSignals).toEqual(expect.arrayContaining([
        'generated_row_projection_alignment',
        'generated_row_candidate_network_cpm',
      ]))
      expect(option.useCaseScores.newProjectPlanning?.rankBasis).toEqual(expect.arrayContaining([
        'generated_row_projection_evaluated',
      ]))
      expect(option.useCaseScores.startingLineOnboarding?.rankBasis).toEqual(expect.arrayContaining([
        'generated_row_projection_evaluated',
      ]))
      expect(option.useCaseScores.accelerationRecovery?.rankBasis).toEqual(expect.arrayContaining([
        'generated_row_projection_evaluated',
      ]))
    }
  })

  it('keeps generated-row dependency evidence visible when dates block runtime materialization', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
      foundationDepthM: 3.5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation starts before pile completion',
        stableCode: '01-03',
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-05',
        plannedEndDate: '2026-07-30',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-05',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
      },
      {
        id: 'row-tower',
        title: 'tower lane superstructure',
        stableCode: '02-01',
        executionPhase: 'tower_superstructure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
      },
      {
        id: 'row-handoff',
        title: 'basement to tower handoff acceptance',
        stableCode: 'ACCEPT-01',
        executionPhase: 'handoff_acceptance',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
      },
    ])

    const reviewPackage = projected.recommendedPlanOption.evaluation.generatedRowProjection?.materializationReviewPackage

    expect(reviewPackage).toEqual(expect.objectContaining({
      status: 'blocked_by_violations',
      allowManualReview: false,
      proposedDependencyEdgeCount: expect.any(Number),
      blockedReasons: expect.arrayContaining(['candidate_preview_edges_violate_generated_row_dates']),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(reviewPackage?.proposedDependencyEdgeCount ?? 0).toBeGreaterThan(0)
    expect(reviewPackage?.proposedDependencyEdgeCount ?? 0).toBeLessThanOrEqual(
      (projected.recommendedPlanOption.evaluation.generatedRowProjection?.candidateDependencyPreview?.previewEdges.length ?? 0) * 4,
    )
    expect(reviewPackage?.proposedDependencyEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'propose_create_dependency',
        writesTaskDependencies: false,
      }),
    ]))
  })

  it('keeps candidate dependency evidence bounded when generated rows contain many same-phase carriers', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })
    const rows = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `row-pile-${index + 1}`,
        title: `pile foundation works ${index + 1}`,
        stableCode: `01-02-${index + 1}`,
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `row-earthwork-${index + 1}`,
        title: `bulk earthwork excavation ${index + 1}`,
        stableCode: `01-03-${index + 1}`,
        executionPhase: 'earthwork',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-05',
        plannedEndDate: '2026-07-30',
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `row-basement-${index + 1}`,
        title: `shared basement structure ${index + 1}`,
        stableCode: `01-05-${index + 1}`,
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `row-tower-${index + 1}`,
        title: `tower lane superstructure ${index + 1}`,
        stableCode: `02-01-${index + 1}`,
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
      })),
      {
        id: 'row-handoff',
        title: 'basement to tower handoff acceptance',
        stableCode: 'ACCEPT-01',
        executionPhase: 'acceptance_handover',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2027-05-01',
        plannedEndDate: '2027-05-08',
      },
    ]

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, rows)
    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    const previewEdgeCount = projection?.candidateDependencyPreview?.previewEdges.length ?? 0
    const proposedDependencyEdgeCount = projection?.materializationReviewPackage?.proposedDependencyEdgeCount ?? 0

    expect(previewEdgeCount).toBeGreaterThan(0)
    expect(proposedDependencyEdgeCount).toBeGreaterThan(0)
    expect(proposedDependencyEdgeCount).toBeLessThanOrEqual(previewEdgeCount * 4)
  })

  it('keeps terminal handoff-only gaps as evidence so buildable preview edges can continue to manual conflict review', () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      buildingCount: 3,
      basementLevelCount: 2,
      basementAreaM2: 26000,
      foundationDepthM: 5,
    })

    const projected = projectConstructionOrganizationSelectionToGeneratedRows(selection, [
      {
        id: 'row-pile',
        title: 'pile foundation works',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      },
      {
        id: 'row-earthwork',
        title: 'bulk earthwork excavation',
        stableCode: '01-05',
        executionPhase: 'earthwork_excavation',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-31',
      },
      {
        id: 'row-basement',
        title: 'whole shared basement structure',
        stableCode: '01-07',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-10-31',
      },
      {
        id: 'row-tower',
        title: 'tower lane superstructure',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-11-01',
        plannedEndDate: '2027-04-30',
      },
    ])

    const projection = projected.recommendedPlanOption.evaluation.generatedRowProjection
    expect(projection?.candidateDependencyPreview?.unresolvedEdges).toEqual([])
    expect(projection?.candidateDependencyPreview?.materializationReadiness).toEqual(expect.objectContaining({
      unresolvedEdgeCount: 0,
      reasons: expect.not.arrayContaining(['unresolved_virtual_dependency_edges']),
    }))
    expect(projection?.gapReasons).toEqual(expect.arrayContaining([
      'terminal_handoff_virtual_edges_kept_as_evidence_without_generated_row_carrier',
    ]))
    expect(projection?.materializationReviewPackage?.blockedReasons).toEqual(expect.not.arrayContaining([
      'unresolved_virtual_dependency_edges',
      'candidate_preview_edges_unresolved',
    ]))
    expect(projection?.materializationReviewPackage?.proposedDependencyEdgeCount ?? 0).toBeGreaterThan(0)
  })
})
