import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkService.js'
import { evaluateT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'
import { buildT2RhythmProductionCapacityEvidence } from '../services/t2RhythmProductionCapacityEvidenceService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
  type T2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import {
  buildT2RhythmPhase1MultiNetworkSelectionTrustGate,
  selectT2RhythmSchedulePhase1Network,
} from '../services/t2RhythmSchedulePhase1SelectionService.js'

function readyProductionCapacityEvidence(candidatePackage: ReturnType<typeof buildT2RhythmScheduleCandidatePackage>) {
  const availableParallelWorkfaces = Math.max(1, ...candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.minimumParallelWorkfaces))
  const availableCrewStreams = Math.max(1, ...candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.recommendedCrewStreams))
  return buildT2RhythmProductionCapacityEvidence({
    resourceSidecar: {
      availableParallelWorkfaces,
      availableCrewStreams,
      evidenceRefs: [`test-capacity:${candidatePackage.selectedTemplateIds.join('+')}:resource-streams`],
    },
    constructionRhythmExpansion: {
      workfaceCandidateCount: availableParallelWorkfaces,
      dominantRhythmUnits: candidatePackage.productionFeasibilitySummaries.map((summary) => summary.workfaceUnit),
      candidates: [{
        backendConsumable: true,
        workfaceCount: availableParallelWorkfaces,
        workfaceKeys: Array.from({ length: availableParallelWorkfaces }, (_, index) => `test-workface-${index + 1}`),
      }],
    },
    constructionCalendar: {
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    },
  })
}

function buildStandardFloorEvaluation(input: {
  candidateId: string
  hasBasementHandover: boolean
  organizationAssumptions: string[]
  liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
}) {
  const candidatePackage = buildT2RhythmScheduleCandidatePackage({
    liveReplayTrustGate: input.liveReplayTrustGate,
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
      hasBasementHandover: input.hasBasementHandover,
    },
    organizationAssumptions: input.organizationAssumptions,
    selectedWorkfaceUnits: ['floor'],
    priorityAdjudication: {
      selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedBy: 'project_experience_over_system_standard_library',
      priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
    },
  })
  const network = buildT2RhythmScheduleCandidateNetwork({
    candidateId: input.candidateId,
    candidatePackage,
    constructionOrganization: {
      scenarioId: input.organizationAssumptions.includes('tower_first_without_basement_handover')
        ? 'tower-first-without-basement-handover'
        : 'basement-first-standard-floor',
      assumptions: input.organizationAssumptions,
    },
    priorityAdjudication: {
      selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedBy: 'project_experience_over_system_standard_library',
      priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
    },
    productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
  })

  return evaluateT2RhythmScheduleCandidateNetwork(network)
}

function buildBasementEvaluation(candidateId: string, liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null) {
  const candidatePackage = buildT2RhythmScheduleCandidatePackage({
    liveReplayTrustGate,
    selection: {
      businessTypeCode: 'residential',
      phaseWindow: 'basement',
      divisionFamily: 'foundation_and_basement',
      subdivisionFamily: 'basement_structure',
      methodVariantCodes: ['basement_cast_in_place'],
      scopeDimensions: ['zone', 'section'],
    },
    facts: {
      hasBasementScope: true,
      hasSupportScheme: true,
    },
    organizationAssumptions: ['basement_first_then_tower'],
    selectedWorkfaceUnits: ['zone'],
  })
  const network = buildT2RhythmScheduleCandidateNetwork({
    candidateId,
    candidatePackage,
    constructionOrganization: {
      scenarioId: 'basement-first-option',
      assumptions: ['basement_first_then_tower'],
    },
    productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
  })

  return evaluateT2RhythmScheduleCandidateNetwork(network)
}

function buildPassingLiveReplayTrustGate() {
  return evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
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

describe('t2RhythmSchedulePhase1SelectionService', () => {
  it('rejects higher-priority assembly conflicts before ranking C-19.13 phase-1 networks', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const conflictedHighPriority = buildStandardFloorEvaluation({
      candidateId: 'tower-first-high-priority-conflict',
      hasBasementHandover: false,
      organizationAssumptions: ['tower_first_without_basement_handover'],
      liveReplayTrustGate,
    })
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'basement-first-compatible-standard-floor',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const compatibleBasement = buildBasementEvaluation('basement-compatible-long-cycle', liveReplayTrustGate)

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-residential-options',
      evaluations: [
        conflictedHighPriority,
        compatibleBasement,
        compatibleStandardFloor,
      ],
    })

    expect(selection.source).toBe('t2_rhythm_schedule_phase1_selection')
    expect(selection.status).toBe('phase1_selection_ready')
    expect(selection.selectedCandidateId).toBe('basement-first-compatible-standard-floor')
    expect(selection.selectedEvaluation?.candidateId).toBe('basement-first-compatible-standard-floor')
    expect(selection.selectedEvaluation?.selectionReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectionStatus: 'selected_explicit_match',
        selectorPurity: expect.objectContaining({
          allExplicitDimensionsMatched: true,
          noT1T3Leakage: true,
        }),
      }),
    ]))
    expect(selection.eligibleCandidateIds).toEqual([
      'basement-first-compatible-standard-floor',
      'basement-compatible-long-cycle',
    ])
    expect(selection.rejectedCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'tower-first-high-priority-conflict',
        status: 'candidate_conflict',
        reasonCodes: expect.arrayContaining([
          'template_assembly_conflict',
          'priority_override_blocked',
        ]),
        conflictCodes: expect.arrayContaining(['t2_candidate_conflict']),
      }),
    ]))
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      receiptRequired: true,
      liveReplayTrustGateRequired: true,
      status: 'pass_with_manual_review_rejections',
      rejectedConflictCandidateCount: 1,
      rejectedMissingReceiptCandidateCount: 0,
      rejectedLiveReplayTrustGateCandidateCount: 0,
    }))
    expect(selection.selectionBasis).toEqual(expect.objectContaining({
      strategy: 'assembly_compatible_then_shorter_span',
      assemblyFeasibilityRequired: true,
      linearPriorityCanOverrideAssemblyConflict: false,
      selectorReceiptRequired: true,
      liveReplayTrustGateRequired: true,
    }))
    expect(selection.selectionBasis.rankSignals).toEqual(expect.arrayContaining([
      'selector_receipt_audit_trail',
      'standard_library_live_replay_trust_gate',
    ]))
    expect(selection.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('converts archived phase-1 selector replay results into a template-scoped release evidence gate', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const conflictedHighPriority = buildStandardFloorEvaluation({
      candidateId: 'tower-first-high-priority-conflict',
      hasBasementHandover: false,
      organizationAssumptions: ['tower_first_without_basement_handover'],
      liveReplayTrustGate,
    })
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'basement-first-compatible-standard-floor',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-selector-archive',
      evaluations: [
        conflictedHighPriority,
        compatibleStandardFloor,
      ],
    })

    const gate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection,
      evidenceMode: 'archived_phase1_selector_replay',
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [
        'archived-selector-replay:c19-13-phase1-selector-archive:2026-06-23',
      ],
      minimumSelectionCount: 1,
      minimumScenarioCoverageCount: 1,
    })

    expect(gate).toEqual(expect.objectContaining({
      source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      evidenceMode: 'archived_phase1_selector_replay',
      trustBoundary: 'archived_phase1_selector_replay_only',
      canTrustForRealScheduleSelection: true,
      readySelectionCount: 1,
      minimumSelectionCount: 1,
      scenarioCoverageCount: 1,
      minimumScenarioCoverageCount: 1,
      eligibleCandidateCount: 1,
      rejectedConflictCandidateCount: 1,
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [
        'archived-selector-replay:c19-13-phase1-selector-archive:2026-06-23',
      ],
      releaseBlockers: [],
    }))
    expect(gate.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
    const selectorBackedPackage = buildT2RhythmScheduleCandidatePackage({
      phase1MultiNetworkSelectionTrustGate: gate,
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
    expect(selectorBackedPackage.standardLibraryReadiness.releaseEvidenceClosure).toEqual(expect.objectContaining({
      readyGateCodes: ['c19_13_phase1_multinetwork_selection'],
      blockingGateCodes: expect.arrayContaining([
        'archived_live_replay',
        'l5_canary_handoff',
      ]),
      templateScopeMismatchCodes: [],
    }))
  })

  it('keeps selector replay trust gates blocked when archived evidence refs or scenario coverage are incomplete', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const conflictedHighPriority = buildStandardFloorEvaluation({
      candidateId: 'tower-first-high-priority-conflict',
      hasBasementHandover: false,
      organizationAssumptions: ['tower_first_without_basement_handover'],
      liveReplayTrustGate,
    })
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'basement-first-compatible-standard-floor',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-selector-blocked-archive',
      evaluations: [
        conflictedHighPriority,
        compatibleStandardFloor,
      ],
    })

    const representativeOnlyGate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection,
      evidenceMode: 'representative_shadow_probe_not_release_evidence',
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [
        'representative-selector-probe:c19-13-phase1-selector-blocked-archive',
      ],
      minimumSelectionCount: 1,
      scenarioCoverageCount: 1,
      minimumScenarioCoverageCount: 1,
    })
    const missingRefsGate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection,
      evidenceMode: 'archived_phase1_selector_replay',
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [],
      minimumSelectionCount: 1,
      scenarioCoverageCount: 1,
      minimumScenarioCoverageCount: 1,
    })
    const thinScenarioCoverageGate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection,
      evidenceMode: 'archived_phase1_selector_replay',
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [
        'archived-selector-replay:c19-13-phase1-selector-blocked-archive:2026-06-26',
      ],
      minimumSelectionCount: 1,
      scenarioCoverageCount: 0,
      minimumScenarioCoverageCount: 2,
    })

    expect(representativeOnlyGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule_selection',
      trustBoundary: 'representative_shadow_probe_only',
      canTrustForRealScheduleSelection: false,
      releaseBlockers: expect.arrayContaining([
        'c19_13_phase1_multinetwork_selection_required',
        'archived_phase1_selector_replay_required',
      ]),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
    expect(missingRefsGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule_selection',
      trustBoundary: 'archived_phase1_selector_replay_only',
      canTrustForRealScheduleSelection: false,
      releaseBlockers: expect.arrayContaining([
        'c19_13_phase1_multinetwork_selection_required',
        'selector_replay_evidence_ref_required',
      ]),
    }))
    expect(thinScenarioCoverageGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule_selection',
      trustBoundary: 'archived_phase1_selector_replay_only',
      canTrustForRealScheduleSelection: false,
      scenarioCoverageCount: 0,
      minimumScenarioCoverageCount: 2,
      releaseBlockers: expect.arrayContaining([
        'c19_13_phase1_multinetwork_selection_required',
        'scenario_coverage_required',
      ]),
    }))
  })

  it('keeps selector replay trust gates blocked when no conflict candidate was rejected', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'basement-first-compatible-standard-floor',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-selector-no-rejected-conflict',
      evaluations: [compatibleStandardFloor],
    })

    const gate = buildT2RhythmPhase1MultiNetworkSelectionTrustGate({
      selection,
      evidenceMode: 'archived_phase1_selector_replay',
      selectedTemplateIds: compatibleStandardFloor.scheduleTrustEvidence.selectedTemplateIds,
      selectionEvidenceRefs: [
        'archived-selector-replay:c19-13-phase1-selector-no-rejected-conflict:2026-06-26',
      ],
      minimumSelectionCount: 1,
      scenarioCoverageCount: 1,
      minimumScenarioCoverageCount: 1,
    })

    expect(selection.status).toBe('phase1_selection_ready')
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      status: 'pass',
      rejectedConflictCandidateCount: 0,
    }))
    expect(gate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule_selection',
      trustBoundary: 'archived_phase1_selector_replay_only',
      canTrustForRealScheduleSelection: false,
      rejectedConflictCandidateCount: 0,
      releaseBlockers: expect.arrayContaining([
        'c19_13_phase1_multinetwork_selection_required',
        'rejected_conflict_candidate_required',
      ]),
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

  it('blocks automatic selection when the assembly compatibility receipt is missing', () => {
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'legacy-compatible-without-receipt',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
    })
    const legacyWithoutReceipt = {
      ...compatibleStandardFloor,
      templateAssemblyCompatibilityReceipt: undefined,
    }

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-legacy-receipt-required',
      evaluations: [legacyWithoutReceipt as any],
    })

    expect(selection.status).toBe('manual_review_required')
    expect(selection.selectedCandidateId).toBeNull()
    expect(selection.eligibleCandidateIds).toEqual([])
    expect(selection.rejectedCandidates).toEqual([
      expect.objectContaining({
        candidateId: 'legacy-compatible-without-receipt',
        status: 'receipt_missing',
        reasonCodes: expect.arrayContaining(['template_assembly_receipt_missing']),
      }),
    ])
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      receiptRequired: true,
      status: 'blocked',
      rejectedMissingReceiptCandidateCount: 1,
    }))
  })

  it('blocks automatic selection when selector receipts are missing from a legacy phase-1 evaluation', () => {
    const compatibleStandardFloor = buildStandardFloorEvaluation({
      candidateId: 'legacy-compatible-without-selector-receipts',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
    })
    const legacyWithoutSelectorReceipts = {
      ...compatibleStandardFloor,
      selectionReceipts: [],
      scheduleTrustEvidence: {
        ...compatibleStandardFloor.scheduleTrustEvidence,
        selectionReceiptCount: 0,
        selectorReceiptAuditStatus: 'missing',
      },
    }

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-selector-receipts-required',
      evaluations: [legacyWithoutSelectorReceipts as any],
    })

    expect(selection.status).toBe('manual_review_required')
    expect(selection.selectedCandidateId).toBeNull()
    expect(selection.eligibleCandidateIds).toEqual([])
    expect(selection.rejectedCandidates).toEqual([
      expect.objectContaining({
        candidateId: 'legacy-compatible-without-selector-receipts',
        status: 'selector_receipt_missing',
        reasonCodes: expect.arrayContaining(['selector_receipt_missing']),
      }),
    ])
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      receiptRequired: true,
      selectorReceiptRequired: true,
      status: 'blocked',
      rejectedMissingSelectorReceiptCandidateCount: 1,
    }))
  })

  it('blocks automatic selection when archived/live replay trust gate is missing', () => {
    const compatibleButUntrusted = buildStandardFloorEvaluation({
      candidateId: 'compatible-standard-floor-without-live-replay-trust',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
    })

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-live-replay-trust-required',
      evaluations: [compatibleButUntrusted],
    })

    expect(selection.status).toBe('manual_review_required')
    expect(selection.selectedCandidateId).toBeNull()
    expect(selection.eligibleCandidateIds).toEqual([])
    expect(selection.rejectedCandidates).toEqual([
      expect.objectContaining({
        candidateId: 'compatible-standard-floor-without-live-replay-trust',
        status: 'not_phase1_ready',
        reasonCodes: expect.arrayContaining(['live_replay_trust_gate_not_ready']),
        conflictCodes: [],
      }),
    ])
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      liveReplayTrustGateRequired: true,
      rejectedLiveReplayTrustGateCandidateCount: 1,
      status: 'blocked',
    }))
    expect(selection.selectionBasis).toEqual(expect.objectContaining({
      liveReplayTrustGateRequired: true,
    }))
    expect(selection.selectionBasis.rankSignals).toEqual(expect.arrayContaining([
      'standard_library_live_replay_trust_gate',
    ]))
  })

  it('uses critical-window coverage as the stable tie-breaker when eligible candidates have the same span', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const alphabeticalButThinner = buildStandardFloorEvaluation({
      candidateId: 'a-shorter-id-but-fewer-critical-windows',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const richerCriticalWindowCoverage = buildBasementEvaluation(
      'z-longer-id-but-richer-critical-windows',
      liveReplayTrustGate,
    )
    const tiedThinEvaluation = {
      ...alphabeticalButThinner,
      networkSpanDays: 42,
      criticalWindowCodes: ['single-critical-window'],
    }
    const tiedRicherEvaluation = {
      ...richerCriticalWindowCoverage,
      networkSpanDays: 42,
      criticalWindowCodes: ['foundation-start', 'structure-transfer', 'handover-gate'],
    }

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-critical-window-tiebreak',
      evaluations: [
        tiedThinEvaluation,
        tiedRicherEvaluation,
      ] as any,
    })

    expect(selection.status).toBe('phase1_selection_ready')
    expect(selection.eligibleCandidateIds).toEqual([
      'z-longer-id-but-richer-critical-windows',
      'a-shorter-id-but-fewer-critical-windows',
    ])
    expect(selection.selectedCandidateId).toBe('z-longer-id-but-richer-critical-windows')
    expect(selection.selectionBasis.rankSignals).toEqual(expect.arrayContaining([
      'network_span_days',
      'critical_window_count',
    ]))
    expect(selection.combinationConsistencyGate.status).toBe('pass')
    expect(selection.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('uses candidate id as the final deterministic tie-breaker after span and critical-window coverage match', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const laterCandidateId = buildStandardFloorEvaluation({
      candidateId: 'z-later-candidate-id',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const earlierCandidateId = buildBasementEvaluation('a-earlier-candidate-id', liveReplayTrustGate)
    const tiedLater = {
      ...laterCandidateId,
      networkSpanDays: 42,
      criticalWindowCodes: ['same-critical-window'],
    }
    const tiedEarlier = {
      ...earlierCandidateId,
      networkSpanDays: 42,
      criticalWindowCodes: ['same-critical-window'],
    }

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-candidate-id-tiebreak',
      evaluations: [
        tiedLater,
        tiedEarlier,
      ] as any,
    })

    expect(selection.status).toBe('phase1_selection_ready')
    expect(selection.eligibleCandidateIds).toEqual([
      'a-earlier-candidate-id',
      'z-later-candidate-id',
    ])
    expect(selection.selectedCandidateId).toBe('a-earlier-candidate-id')
  })

  it('sorts rejected candidates by review priority instead of preserving input order', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const selectorReceiptMissing = buildStandardFloorEvaluation({
      candidateId: 'c-selector-receipt-missing',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
      liveReplayTrustGate,
    })
    const liveReplayGateMissing = buildStandardFloorEvaluation({
      candidateId: 'd-live-replay-gate-missing',
      hasBasementHandover: true,
      organizationAssumptions: ['basement_first_then_tower'],
    })
    const assemblyReceiptMissing = buildBasementEvaluation('b-assembly-receipt-missing', liveReplayTrustGate)
    const assemblyConflict = buildStandardFloorEvaluation({
      candidateId: 'a-assembly-conflict',
      hasBasementHandover: false,
      organizationAssumptions: ['tower_first_without_basement_handover'],
      liveReplayTrustGate,
    })

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-rejection-priority',
      evaluations: [
        {
          ...selectorReceiptMissing,
          selectionReceipts: [],
          scheduleTrustEvidence: {
            ...selectorReceiptMissing.scheduleTrustEvidence,
            selectionReceiptCount: 0,
            selectorReceiptAuditStatus: 'missing',
          },
        },
        liveReplayGateMissing,
        {
          ...assemblyReceiptMissing,
          templateAssemblyCompatibilityReceipt: undefined,
        },
        assemblyConflict,
      ] as any,
    })

    expect(selection.status).toBe('manual_review_required')
    expect(selection.rejectedCandidates.map((candidate) => candidate.candidateId)).toEqual([
      'a-assembly-conflict',
      'b-assembly-receipt-missing',
      'c-selector-receipt-missing',
      'd-live-replay-gate-missing',
    ])
    expect(selection.rejectedCandidates.map((candidate) => candidate.status)).toEqual([
      'candidate_conflict',
      'receipt_missing',
      'selector_receipt_missing',
      'not_phase1_ready',
    ])
  })

  it('counts rejection buckets by primary review status without double-counting assembly conflicts as live replay gaps', () => {
    const conflictedWithoutLiveReplayTrust = buildStandardFloorEvaluation({
      candidateId: 'assembly-conflict-without-live-replay-trust',
      hasBasementHandover: false,
      organizationAssumptions: ['tower_first_without_basement_handover'],
    })

    const selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-primary-rejection-buckets',
      evaluations: [conflictedWithoutLiveReplayTrust],
    })

    expect(selection.status).toBe('manual_review_required')
    expect(selection.rejectedCandidates).toEqual([
      expect.objectContaining({
        candidateId: 'assembly-conflict-without-live-replay-trust',
        status: 'candidate_conflict',
        reasonCodes: expect.arrayContaining([
          'template_assembly_conflict',
          'priority_override_blocked',
          'live_replay_trust_gate_not_ready',
        ]),
      }),
    ])
    expect(selection.combinationConsistencyGate).toEqual(expect.objectContaining({
      status: 'blocked',
      rejectedConflictCandidateCount: 1,
      rejectedMissingReceiptCandidateCount: 0,
      rejectedMissingSelectorReceiptCandidateCount: 0,
      rejectedLiveReplayTrustGateCandidateCount: 0,
    }))
  })
})
