import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmScheduleCandidateNetwork,
} from '../services/t2RhythmScheduleCandidateNetworkService.js'
import {
  buildT2RhythmProductionCapacityEvidence,
} from '../services/t2RhythmProductionCapacityEvidenceService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

function buildPassingLiveReplayTrustGate(selectedTemplateIds: string[] = []) {
  return evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
    selectedTemplateIds,
    missingArchivedJson: false,
    evidenceMetadata: {
      missingEvidenceMetadata: false,
    },
    sampleAvailability: {
      totalUsableSampleCount: 36,
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
}

describe('t2RhythmScheduleCandidateNetworkService', () => {
  it('keeps a compatible T2 rhythm package in manual review until production capacity evidence supports phase-1 scheduling', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-t2-standard-floor-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-standard-floor',
        assumptions: ['basement_first_then_tower'],
      },
    })

    expect(network.source).toBe('t2_rhythm_schedule_candidate_network')
    expect(network.status).toBe('candidate_conflict')
    expect(network.canEnterC1913Phase1Selection).toBe(false)
    expect(network.requiresManualReview).toBe(true)
    expect(network.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
    })
    expect(network.nodes.length).toBe(candidatePackage.packageWindows.length)
    expect(network.edges.length).toBe(candidatePackage.dependencyCandidates.length)
    expect(network.gates.length).toBe(candidatePackage.hardGates.length)
    expect(network.selectionReceipts).toEqual(candidatePackage.selectionReceipts)
    expect(network.selectionReceipts[0]).toEqual(expect.objectContaining({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectionStatus: 'selected_explicit_match',
      selectorPurity: expect.objectContaining({
        allExplicitDimensionsMatched: true,
        noT1T3Leakage: true,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesRuntimePublications: false,
      }),
    }))
    expect(network.nodes[0]).toEqual(expect.objectContaining({
      nodeId: expect.stringContaining('t2-residential-standard-floor-structure-rhythm-v1'),
      tier: 'T2',
      durationDays: expect.any(Number),
      durationSource: 'parent_package_rhythm_window',
      autoApply: false,
    }))
    expect(network.edges[0]).toEqual(expect.objectContaining({
      relation: expect.stringMatching(/FS|SS|FF/),
      tier: 'T2',
      mandatory: expect.any(Boolean),
      autoApply: false,
    }))
    expect(network.scheduleTrustEvidence).toEqual(expect.objectContaining({
      selectedTemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      durationBearingNodeCount: candidatePackage.durationBearingWindowCount,
      hardGateCount: candidatePackage.hardGateCount,
      compatibilityStatus: 'candidate_conflict',
      replayRequiredBeforePublish: true,
      standardLibraryReadinessStatus: 'shadow_candidate_ready_not_publishable',
      standardLibraryPrecisionStatus: 'ready',
      standardLibraryBreadthStatus: 'ready',
      standardLibraryDepthStatus: 'ready',
      selectionReceiptCount: candidatePackage.selectionReceipts.length,
      selectorReceiptAuditStatus: 'ready',
      productionFeasibility: expect.objectContaining({
        calendarBasis: 'working_day',
        minimumParallelWorkfaces: 1,
        recommendedCrewStreams: 1,
        resourceReadinessSignals: expect.arrayContaining(['workface_unit:floor']),
        calendarConstraintSignals: expect.arrayContaining(['working_day_calendar_required']),
      }),
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
      ]),
    }))
    expect(network.scheduleTrustEvidence.productionCapacityCoverage).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_coverage',
      status: 'evidence_incomplete',
      canEnterC1913Phase1Selection: false,
      blockingReasons: expect.arrayContaining(['production_capacity_evidence_missing']),
    }))
    expect(network.standardLibraryReadiness).toEqual(expect.objectContaining({
      status: 'shadow_candidate_ready_not_publishable',
      precisionStatus: 'ready',
      breadthStatus: 'ready',
      depthStatus: 'ready',
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
    }))
    expect(network.assemblyCompatibility.status).toBe('candidate_conflict')
    expect(network.assemblyCompatibility.explanation).toEqual(expect.objectContaining({
      productionCapacityChecked: true,
      productionCapacityEvidenceStatus: null,
      productionCapacityMissingEvidenceCodes: ['production_capacity_evidence_missing'],
    }))
    expect(network.conflictSummary.conflictCodes).toEqual(expect.arrayContaining([
      'production_capacity_evidence_missing',
    ]))
    expect(network.assemblyCompatibility.canWriteTaskDependencies).toBe(false)
    expect(network.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'c19-13-t2-standard-floor-option',
      selectedTemplateSet: {
        t2TemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        constructionOrganizationScenarioId: 'basement-first-standard-floor',
        cpmEdgeIds: candidatePackage.dependencyCandidates.map((edge) => edge.edgeCode),
      },
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: false,
      conflictCodes: ['production_capacity_evidence_missing'],
      blockedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      manualReviewReasons: [
        'T2 production capacity evidence is required before automatic selection for template t2-residential-standard-floor-structure-rhythm-v1.',
      ],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
  })

  it('keeps conflicted T2 rhythm packages as manual-review network candidates only', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: false,
      },
      organizationAssumptions: ['tower_first_without_basement_handover'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-t2-conflicted-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'tower-first-option',
        assumptions: ['tower_first_without_basement_handover'],
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(network.status).toBe('candidate_conflict')
    expect(network.canEnterC1913Phase1Selection).toBe(false)
    expect(network.requiresManualReview).toBe(true)
    expect(network.assemblyCompatibility.priorityOverrideBlocked).toBe(true)
    expect(network.conflictSummary.conflictCodes).toEqual(expect.arrayContaining([
      't2_candidate_conflict',
    ]))
    expect(network.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'c19-13-t2-conflicted-option',
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining(['t2_candidate_conflict']),
      blockedTemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      manualReviewReasons: expect.arrayContaining([
        expect.stringContaining('tower_first_without_basement_handover'),
      ]),
    }))
    expect(network.mutationBoundary.writesTaskDependencies).toBe(false)
    expect(network.mutationBoundary.writesPlanDates).toBe(false)
  })

  it('blocks phase-1 network admission when production capacity is below T2 feasibility assumptions', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    })

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-fitout-low-capacity-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-low-capacity',
        assumptions: ['floor_by_floor_interleaving'],
      },
      productionCapacity: {
        availableParallelWorkfaces: 1,
        availableCrewStreams: 1,
        calendarBasis: 'calendar_day',
      },
    })

    expect(network.status).toBe('candidate_conflict')
    expect(network.canEnterC1913Phase1Selection).toBe(false)
    expect(network.requiresManualReview).toBe(true)
    expect(network.conflictSummary.conflictCodes).toEqual(expect.arrayContaining([
      'production_parallel_workface_insufficient',
      'production_crew_stream_insufficient',
      'production_calendar_basis_mismatch',
    ]))
    expect(network.assemblyCompatibility.explanation).toEqual(expect.objectContaining({
      productionCapacityChecked: true,
      checkedSources: expect.arrayContaining(['production_capacity']),
    }))
  })

  it('blocks phase-1 network admission when production capacity evidence is partial instead of silently skipping crew checks', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 2,
          workfaceKeys: ['floor-01', 'floor-02'],
        }],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    expect(productionCapacityEvidence.status).toBe('partial')
    expect(productionCapacityEvidence.missingEvidenceCodes).toEqual(['crew_stream_capacity_missing'])

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-fitout-partial-capacity-evidence-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-partial-capacity-evidence',
        assumptions: ['floor_by_floor_interleaving'],
      },
      productionCapacityEvidence,
    })

    expect(network.status).toBe('candidate_conflict')
    expect(network.canEnterC1913Phase1Selection).toBe(false)
    expect(network.requiresManualReview).toBe(true)
    expect(network.conflictSummary.conflictCodes).toEqual(expect.arrayContaining([
      'production_capacity_evidence_missing',
    ]))
    expect(network.productionCapacityEvidence).toEqual(expect.objectContaining({
      status: 'partial',
      missingEvidenceCodes: ['crew_stream_capacity_missing'],
    }))
    expect(network.assemblyCompatibility.explanation).toEqual(expect.objectContaining({
      productionCapacityChecked: true,
      productionCapacityEvidenceStatus: 'partial',
    }))
  })

  it('admits phase-1 network candidates when ready production capacity evidence supports T2 rhythm assumptions', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate([
      't2-residential-secondary-structure-fitout-interleave-v1',
    ])
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
    })
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableCrewStreams: 2,
        evidenceRefs: ['resource-sidecar:project-a:crew-streams'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 2,
          workfaceKeys: ['floor-01', 'floor-02'],
        }],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-fitout-ready-capacity-evidence-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-ready-capacity-evidence',
        assumptions: ['floor_by_floor_interleaving'],
      },
      productionCapacityEvidence,
    })

    expect(network.status).toBe('schedulable_network_candidate')
    expect(network.canEnterC1913Phase1Selection).toBe(true)
    expect(network.conflictSummary.conflictCodes).toEqual([])
    expect(network.productionCapacityEvidence).toEqual(expect.objectContaining({
      status: 'ready',
      productionCapacity: {
        availableParallelWorkfaces: 2,
        availableCrewStreams: 2,
        calendarBasis: 'working_day',
      },
    }))
    expect(network.assemblyCompatibility.explanation).toEqual(expect.objectContaining({
      productionCapacityChecked: true,
      productionCapacityEvidenceStatus: 'ready',
      productionCapacityMissingEvidenceCodes: [],
    }))
    expect(network.scheduleTrustEvidence.productionCapacityCoverage).toEqual(expect.objectContaining({
      status: 'capacity_supported',
      canEnterC1913Phase1Selection: true,
      requiredParallelWorkfaces: 2,
      availableParallelWorkfaces: 2,
      requiredCrewStreams: 2,
      availableCrewStreams: 2,
      calendarBasisRequired: 'working_day',
      calendarBasisAvailable: 'working_day',
      blockingReasons: [],
    }))
    expect(network.scheduleTrustEvidence).toEqual(expect.objectContaining({
      standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      canTrustForRealScheduleCalibration: true,
      standardLibraryTrustGateReleaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'manual_publication_approval_required',
      ]),
      releaseBlockers: expect.not.arrayContaining(['archived_live_replay_required']),
    }))
    expect(network.standardLibraryReadiness.liveReplayTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
    }))
  })

  it('carries project selection coverage gaps when no T2 template can be matched', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'nonexistent_subdivision_for_cold_start_gap',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })

    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-t2-no-match-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-standard-floor',
        assumptions: ['basement_first_then_tower'],
      },
    })

    expect(network.status).toBe('no_template_match')
    expect(network.canEnterC1913Phase1Selection).toBe(false)
    expect(network.requiresManualReview).toBe(true)
    expect(network.nodes).toEqual([])
    expect(network.edges).toEqual([])
    expect(network.gates).toEqual([])
    expect(network.selectionCoverage).toEqual(expect.objectContaining({
      status: 'no_template_match',
      canEnterC1913Phase1Selection: false,
      missingSelectorDimensions: ['subdivisionFamily'],
      gapReasons: expect.arrayContaining([
        'no_t2_template_matches_requested_selection',
        'missing_subdivision_family_coverage',
      ]),
    }))
    expect(network.standardLibraryReadiness).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      releaseBlockers: expect.arrayContaining(['project_selection_no_template_match']),
    }))
    expect(network.scheduleTrustEvidence).toEqual(expect.objectContaining({
      selectionCoverageStatus: 'no_template_match',
      selectionCoverageGapReasons: expect.arrayContaining(['missing_subdivision_family_coverage']),
      releaseBlockers: expect.arrayContaining(['project_selection_no_template_match']),
    }))
  })
})
