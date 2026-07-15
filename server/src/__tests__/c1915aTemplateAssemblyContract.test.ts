import { describe, expect, it } from 'vitest'

import { assembleDurationInput } from '../services/durationInputAssemblerService.js'
import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmProductionCapacityEvidence } from '../services/t2RhythmProductionCapacityEvidenceService.js'
import { buildT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkService.js'
import { evaluateT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'
import {
  buildT2RhythmPhase1MultiNetworkSelectionTrustGate,
  selectT2RhythmSchedulePhase1Network,
} from '../services/t2RhythmSchedulePhase1SelectionService.js'
import { evaluateT2RhythmStandardLibraryTrustGate } from '../services/t2RhythmStandardLibraryTrustGateService.js'

const NO_WRITE_MUTATION_BOUNDARY = {
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesCriticalPathFacts: false,
  writesSeed: false,
  writesBaseline: false,
  writesRuntimePublications: false,
} as const

describe('C-19.15a non-live template assembly contract', () => {
  it('assembles T2 package, organization, capacity, phase-1 evaluation, selector, lineage, and no-write receipt without runtime apply', async () => {
    const liveReplayTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
      status: 'pass',
      selectedTemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
      missingArchivedJson: false,
      evidenceMetadata: {
        missingEvidenceMetadata: false,
      },
      sampleAvailability: {
        totalUsableSampleCount: 42,
        totalLiveRowsWithoutT2WindowMetadata: 0,
        reasonCodes: [],
      },
      replayCoverage: {
        status: 'pass',
        reasonCodes: [],
      },
      annotationGapClosure: {
        manualAnnotationCandidateCount: 0,
        annotationGapCount: 0,
        reasonCodes: [],
      },
      checks: {
        readiness: {
          status: 'pass',
          reasonCodes: [],
        },
        taskActualReplay: {
          readyForShadow: true,
          reasonCodes: [],
        },
        durationExperienceReplay: {
          readyForShadow: true,
          reasonCodes: [],
        },
      },
    })
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'decoration',
        divisionFamily: 'decoration_fitout',
        subdivisionFamily: 'fitout_workface_handover',
        methodVariantCodes: ['wet_area_fitout'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasFloorHandover: true,
        hasMepRoughInInterface: true,
      },
      organizationAssumptions: ['floor_by_floor_interleaving'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: [
          'project_experience',
          'system_standard_library',
          'external_knowledge_candidate',
        ],
      },
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 2,
        availableCrewStreams: 2,
        evidenceRefs: ['resource-sidecar:c1915a-fitout-crew-streams'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 2,
          workfaceKeys: ['tower-a-floor-10', 'tower-a-floor-11'],
        }],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })
    const constructionOrganizationScenario = {
      source: 'construction_organization_scenario_selector',
      scenarioId: 'fitout-interleave-option',
      assumptions: ['floor_by_floor_interleaving'] as string[],
      planNetworkPublication: null,
    }
    const candidateNetwork = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c1915a-fitout-local-contract-candidate',
      candidatePackage,
      constructionOrganization: {
        scenarioId: constructionOrganizationScenario.scenarioId,
        assumptions: constructionOrganizationScenario.assumptions,
      },
      productionCapacityEvidence,
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: [
          'project_experience',
          'system_standard_library',
          'external_knowledge_candidate',
        ],
      },
    })
    const phase1Evaluation = evaluateT2RhythmScheduleCandidateNetwork(candidateNetwork)
    const conflictedCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 1,
        availableCrewStreams: 1,
        evidenceRefs: ['resource-sidecar:c1915a-conflicted-single-workface'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 1,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 1,
          workfaceKeys: ['tower-a-floor-12'],
        }],
      },
    })
    const conflictedPriorityNetwork = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c1915a-fitout-high-priority-conflict',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-high-priority-but-under-capacity',
        assumptions: constructionOrganizationScenario.assumptions,
      },
      productionCapacityEvidence: conflictedCapacityEvidence,
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: [
          'project_experience',
          'system_standard_library',
          'external_knowledge_candidate',
        ],
      },
    })
    const conflictedPriorityEvaluation = evaluateT2RhythmScheduleCandidateNetwork(conflictedPriorityNetwork)
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c1915a-fitout-local-phase1-selection',
      evaluations: [conflictedPriorityEvaluation, phase1Evaluation],
    })
    const phase1SelectionTrustGate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection: phase1Selection,
      evidenceMode: 'archived_phase1_selector_replay',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      selectionEvidenceRefs: ['phase1-selector-replay:c1915a-fitout-local-contract'],
      scenarioCoverageCount: 1,
      minimumScenarioCoverageCount: 1,
    })

    const assembled = await assembleDurationInput({
      projectId: 'c1915a-fitout-local-contract',
      projectGenerationFacts: {
        businessType: 'residential',
        phaseWindow: 'decoration',
      },
      constructionOrganizationScenario: constructionOrganizationScenario as any,
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: candidateNetwork,
      t2RhythmScheduleCandidateNetworkEvaluation: phase1Evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
      t2RhythmStandardLibraryTrustGate: liveReplayTrustGate,
    }, {
      purpose: 'execution_reference',
    })

    expect(assembled.assemblyGate.status).toBe('candidate_conflict')
    expect(assembled.assemblyGate.canEnterC1913Phase1Selection).toBe(false)
    expect(assembled.assemblyGate.requiresManualReview).toBe(true)
    expect(assembled.assemblyGate.priorityOverrideBlocked).toBe(true)
    expect(assembled.assemblyGate.conflictCodes).toEqual(expect.arrayContaining([
      'production_capacity_evidence_missing',
      'production_parallel_workface_insufficient',
      'production_crew_stream_insufficient',
    ]))
    expect(phase1SelectionTrustGate).toEqual(expect.objectContaining({
      source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      canTrustForRealScheduleSelection: true,
      trustBoundary: 'archived_phase1_selector_replay_only',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesRuntimePublications: false,
      }),
    }))
    expect(candidatePackage).toEqual(expect.objectContaining({
      source: 't2_division_rhythm_schedule_candidate_package',
      status: 'schedulable_candidate',
      selectedTemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
    }))
    expect(candidatePackage.scheduleTrustPolicy).toEqual(expect.objectContaining({
      autoApply: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresAssemblyCompatibility: true,
      requiresL5Publication: true,
    }))
    expect(productionCapacityEvidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_evidence',
      status: 'ready',
      evidenceRefs: expect.arrayContaining([
        'resource-sidecar:c1915a-fitout-crew-streams',
        'construction_rhythm_expansion:workfaces',
        'construction_calendar:official_construction_calendar_seed',
      ]),
      productionCapacity: {
        availableParallelWorkfaces: 2,
        availableCrewStreams: 2,
        calendarBasis: 'working_day',
      },
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesRuntimePublications: false,
      }),
    }))
    expect(candidateNetwork).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network',
      status: 'schedulable_network_candidate',
      canEnterC1913Phase1Selection: true,
      requiresManualReview: false,
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      },
    }))
    expect(candidateNetwork.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'c1915a-fitout-local-contract-candidate',
      compatibilityStatus: 'compatible_candidate',
      priorityOverrideBlocked: false,
      conflictCodes: [],
      selectedTemplateSet: {
        t2TemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
        constructionOrganizationScenarioId: 'fitout-interleave-option',
        cpmEdgeIds: candidatePackage.dependencyCandidates.map((edge) => edge.edgeCode),
      },
      mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
    }))
    expect(phase1Evaluation).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      status: 'phase1_readonly_evaluation_ready',
      canEnterC1913Phase1Selection: true,
      mutationBoundary: candidateNetwork.mutationBoundary,
    }))
    expect(phase1Evaluation.scheduleTrustEvidence).toEqual(expect.objectContaining({
      topologyEvaluated: true,
      floatCalculated: true,
      selectorReceiptAuditStatus: 'ready',
      productionCapacityCoverage: expect.objectContaining({
        source: 't2_rhythm_production_capacity_coverage',
        status: 'capacity_supported',
        canEnterC1913Phase1Selection: true,
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesRuntimePublications: false,
        }),
      }),
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(phase1Selection).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_phase1_selection',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'c1915a-fitout-local-contract-candidate',
      eligibleCandidateIds: ['c1915a-fitout-local-contract-candidate'],
      mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
    }))
    expect(phase1Selection.rejectedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'c1915a-fitout-high-priority-conflict',
        status: 'candidate_conflict',
        reasonCodes: expect.arrayContaining([
          'template_assembly_conflict',
          'priority_override_blocked',
        ]),
        conflictCodes: expect.arrayContaining([
          'production_capacity_evidence_missing',
          'production_parallel_workface_insufficient',
          'production_crew_stream_insufficient',
        ]),
        priorityOverrideBlocked: true,
      }),
    ]))
    expect(phase1Selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      status: 'pass_with_manual_review_rejections',
      rejectedConflictCandidateCount: 1,
      rejectedMissingReceiptCandidateCount: 0,
      rejectedMissingSelectorReceiptCandidateCount: 0,
    }))
    expect(phase1Selection.selectionBasis.rankSignals).toEqual(expect.arrayContaining([
      'template_assembly_compatibility_receipt',
      'selector_receipt_audit_trail',
      'standard_library_live_replay_trust_gate',
      'can_enter_c19_13_phase1_selection',
    ]))
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'constructionOrganizationScenario',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 'construction_organization_scenario_selector',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidatePackage',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_division_rhythm_schedule_candidate_package',
        selectionReceiptCount: 1,
        selectorReceiptAuditStatus: 'ready',
      }),
      expect.objectContaining({
        channel: 't2RhythmProductionCapacityEvidence',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_rhythm_production_capacity_evidence',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetwork',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_rhythm_schedule_candidate_network',
        candidateId: 'c1915a-fitout-local-contract-candidate',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetworkEvaluation',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        candidateId: 'c1915a-fitout-local-contract-candidate',
      }),
      expect.objectContaining({
        channel: 't2RhythmSchedulePhase1Selection',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_rhythm_schedule_phase1_selection',
        candidateId: 'c1915a-fitout-local-contract-candidate',
      }),
      expect.objectContaining({
        channel: 't2RhythmStandardLibraryTrustGate',
        source: 'explicit_input',
        status: 'ready',
        assetSource: 't2_rhythm_standard_library_live_replay_trust_gate',
        trustBoundary: 'archived_live_shadow_replay_only',
      }),
    ]))
    expect(assembled.mutationBoundary).toEqual(NO_WRITE_MUTATION_BOUNDARY)
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      canWriteTaskDependencies: false,
      canWritePlanDates: false,
      standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      standardLibraryTrustBlockingReasons: [],
    }))
    expect(phase1Evaluation.phase1PublicationGate).toEqual(expect.objectContaining({
      status: 'blocked_pending_release_evidence',
      canEnterCanary: false,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
    }))
  })
})
