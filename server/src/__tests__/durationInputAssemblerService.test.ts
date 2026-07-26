import { describe, expect, it, vi } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkService.js'
import { evaluateT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'
import { selectT2RhythmSchedulePhase1Network } from '../services/t2RhythmSchedulePhase1SelectionService.js'
import { assembleDurationInput } from '../services/durationInputAssemblerService.js'
import { buildT2RhythmProductionCapacityEvidence } from '../services/t2RhythmProductionCapacityEvidenceService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

const metadataState = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
}))

function createBuilder(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  const rows = () => {
    const source = table === 'projects' ? metadataState.projects : []
    return source.filter((row) => filters.every((filter) => row[filter.column] === filter.value))
  }
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
  }
  return builder
}

const dbMocks = vi.hoisted(() => ({
  from: vi.fn((table: string) => createBuilder(table)),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: dbMocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

function buildCompatibleT2Assets() {
  const standardLibraryTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
    missingArchivedJson: false,
    evidenceMetadata: {
      missingEvidenceMetadata: false,
    },
    sampleAvailability: {
      totalUsableSampleCount: 24,
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
        readyForShadow: false,
        reasonCodes: [],
      },
    },
  })
  const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
    resourceSidecar: {
      availableCrewStreams: 2,
      evidenceRefs: ['resource_sidecar:crew-streams'],
    },
    constructionRhythmExpansion: {
      workfaceCandidateCount: 2,
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
  const candidatePackage = buildT2RhythmScheduleCandidatePackage({
    liveReplayTrustGate: standardLibraryTrustGate,
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
    candidateId: 'c19-13-compatible-t2-network',
    candidatePackage,
    constructionOrganization: {
      scenarioId: 'basement-first-option',
      assumptions: ['basement_first_then_tower'],
    },
    productionCapacityEvidence,
  })
  return {
    candidatePackage,
    productionCapacityEvidence,
    network,
    evaluation: evaluateT2RhythmScheduleCandidateNetwork(network),
    standardLibraryTrustGate,
  }
}

function buildConflictingT2Assets() {
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
    candidateId: 'c19-13-conflicting-t2-network',
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
  return {
    candidatePackage,
    network,
    evaluation: evaluateT2RhythmScheduleCandidateNetwork(network),
  }
}

describe('durationInputAssemblerService', () => {
  it('propagates consumer-produced asset receipts without granting write authority', async () => {
    const receipt = {
      consumer: 'wizard_master_plan',
      assetType: 'standard_work_duration',
      stableCode: 'duration.concrete.structure',
      role: 'stable_runtime' as const,
      effectiveSource: 'system_stable' as const,
      versionId: 'system-v2',
      publicationKey: 'publication-system-v2',
      status: 'effective_applied' as const,
      changedFields: ['duration' as const],
      targetRowIds: ['row-1'],
      reasonCodes: [],
      rollbackTarget: 'system-v1',
    }

    const assembled = await assembleDurationInput({
      projectGenerationFacts: { businessType: 'residential' },
      assetConsumptionReceipts: [receipt],
    })

    expect(assembled.assetConsumptionReceipts).toEqual([receipt])
    expect(assembled.assetConsumptionSummary).toEqual(expect.objectContaining({
      totalCount: 1,
      effectiveAppliedCount: 1,
      effectiveStableCodes: ['duration.concrete.structure'],
    }))
    expect(assembled.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('restores wizard asset receipts from hydrated project generation facts for downstream consumers', async () => {
    const receipt = {
      consumer: 'wizard_master_plan',
      assetType: 'standard_work_duration',
      stableCode: 'duration.concrete.structure',
      role: 'stable_runtime' as const,
      effectiveSource: 'project_stable' as const,
      versionId: 'project-duration-v3',
      publicationKey: 'duration-publication-v3',
      status: 'effective_applied' as const,
      changedFields: ['duration' as const, 'dates' as const],
      targetRowIds: ['task-1'],
      reasonCodes: [],
      rollbackTarget: 'project-duration-v2',
    }

    const assembled = await assembleDurationInput({
      projectGenerationFacts: {
        businessType: 'residential',
        wizard_generation_duration_asset_consumption_receipts: [receipt],
      },
    })

    expect(assembled.assetConsumptionReceipts).toEqual([receipt])
    expect(assembled.assetConsumptionSummary).toEqual(expect.objectContaining({
      effectiveAppliedCount: 1,
      effectiveStableCodes: ['duration.concrete.structure'],
    }))
  })

  it('defaults missing asset receipts to an empty receipt-derived summary', async () => {
    const assembled = await assembleDurationInput({
      projectGenerationFacts: { businessType: 'residential' },
    })

    expect(assembled.assetConsumptionReceipts).toEqual([])
    expect(assembled.assetConsumptionSummary).toEqual(expect.objectContaining({
      totalCount: 0,
      effectiveAppliedCount: 0,
      advisoryUsedCount: 0,
      evidenceOnlyCount: 0,
      notApplicableCount: 0,
      blockedByConflictCount: 0,
      effectiveStableCodes: [],
    }))
  })

  it('assembles T2 package, network, and phase-1 evaluation as separate read-only L3 input channels', async () => {
    const { candidatePackage, productionCapacityEvidence, network, evaluation, standardLibraryTrustGate } = buildCompatibleT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-compatible-single-option',
      evaluations: [evaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-compatible',
      projectGenerationFacts: {
        businessType: 'residential',
        totalAreaM2: 60000,
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
      t2RhythmStandardLibraryTrustGate: standardLibraryTrustGate,
    }, {
      purpose: 'execution_reference',
    })

    expect(assembled.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      totalAreaM2: 60000,
    }))
    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidatePackage')
    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidateNetwork')
    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidateNetworkEvaluation')
    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmSchedulePhase1Selection')
    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmStandardLibraryTrustGate')
    expect(assembled.t2RhythmScheduleCandidatePackage).toBe(candidatePackage)
    expect(assembled.t2RhythmProductionCapacityEvidence).toBe(productionCapacityEvidence)
    expect(assembled.t2RhythmScheduleCandidateNetwork).toBe(network)
    expect(assembled.t2RhythmScheduleCandidateNetworkEvaluation).toBe(evaluation)
    expect(assembled.t2RhythmSchedulePhase1Selection).toBe(phase1Selection)
    expect((assembled as any).t2RhythmStandardLibraryTrustGate).toBe(standardLibraryTrustGate)

    expect(assembled.inputChannels.projectGenerationFacts).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
    }))
    expect(assembled.inputChannels.t2RhythmScheduleCandidatePackage).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T2',
      selectionReceiptCount: 1,
      selectorReceiptAuditStatus: 'ready',
    }))
    expect(assembled.inputChannels.t2RhythmScheduleCandidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T2',
      selectionReceiptCount: 1,
      selectorReceiptAuditStatus: 'ready',
    }))
    expect(assembled.inputChannels.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T2',
      assetSource: 't2_rhythm_production_capacity_evidence',
    }))
    expect(assembled.inputChannels.t2RhythmSchedulePhase1Selection).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T2',
      candidateId: 'c19-13-compatible-t2-network',
      assetSource: 't2_rhythm_schedule_phase1_selection',
    }))
    expect((assembled.inputChannels as any).t2RhythmStandardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T2',
      assetSource: 't2_rhythm_standard_library_live_replay_trust_gate',
      canTrustForRealScheduleCalibration: true,
      trustBoundary: 'archived_live_shadow_replay_only',
    }))
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidatePackage',
        source: 'explicit_input',
        assetSource: 't2_division_rhythm_schedule_candidate_package',
        selectionReceiptCount: 1,
        selectorReceiptAuditStatus: 'ready',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetworkEvaluation',
        source: 'explicit_input',
        assetSource: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        candidateId: 'c19-13-compatible-t2-network',
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
        channel: 't2RhythmSchedulePhase1Selection',
        source: 'explicit_input',
        assetSource: 't2_rhythm_schedule_phase1_selection',
        candidateId: 'c19-13-compatible-t2-network',
      }),
      expect.objectContaining({
        channel: 't2RhythmStandardLibraryTrustGate',
        source: 'explicit_input',
        assetSource: 't2_rhythm_standard_library_live_replay_trust_gate',
        status: 'ready',
        canTrustForRealScheduleCalibration: true,
        trustBoundary: 'archived_live_shadow_replay_only',
      }),
    ]))
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'compatible_candidate',
      canEnterC1913Phase1Selection: true,
      requiresManualReview: false,
      priorityOverrideBlocked: false,
      conflictCodes: [],
      standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      standardLibraryTrustBlockingReasons: [],
    }))
    expect(assembled.assemblyGate.productionCapacityEvidenceStatus).toBe('ready')
    expect(assembled.assemblyGate.productionCapacityMissingEvidenceCodes).toEqual([])
    expect(assembled.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('blocks C-19.13 entry when the T2 standard-library live replay trust gate is not trustworthy', async () => {
    const { candidatePackage, productionCapacityEvidence, network, evaluation } = buildCompatibleT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-compatible-but-untrusted-live-replay',
      evaluations: [evaluation],
    })
    const untrustedGate = evaluateT2RhythmStandardLibraryTrustGate({
      status: 'fail',
      missingArchivedJson: false,
      evidenceMetadata: {
        missingEvidenceMetadata: false,
      },
      sampleAvailability: {
        totalUsableSampleCount: 0,
        totalLiveRowsWithoutT2WindowMetadata: 9,
        reasonCodes: [
          'live_rows_without_t2_window_metadata',
          'no_t2_replay_samples',
        ],
      },
      replayCoverage: {
        status: 'fail',
        reasonCodes: ['duration_bearing_window_replay_coverage_missing'],
      },
      annotationGapClosure: {
        manualAnnotationCandidateCount: 0,
        annotationGapCount: 9,
        reasonCodes: ['remaining_annotation_gaps'],
      },
      checks: {
        readiness: {
          status: 'pass',
          reasonCodes: [],
        },
        taskActualReplay: {
          readyForShadow: false,
          reasonCodes: ['no_t2_replay_samples'],
        },
        durationExperienceReplay: {
          readyForShadow: false,
          reasonCodes: ['duration_experience_samples_empty'],
        },
      },
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-untrusted-live-replay',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
      t2RhythmStandardLibraryTrustGate: untrustedGate,
    }, {
      purpose: 'execution_reference',
    })

    expect((assembled.inputChannels as any).t2RhythmStandardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'candidate_conflict',
      tier: 'T2',
      canTrustForRealScheduleCalibration: false,
      trustBoundary: 'blocked_live_replay_evidence',
    }))
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      standardLibraryTrustGateStatus: 'not_trustworthy_for_real_schedule',
      standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('t2_standard_library_live_replay_not_trustworthy')
    expect((assembled.assemblyGate as any).standardLibraryTrustBlockingReasons).toEqual(expect.arrayContaining([
      'no_t2_replay_samples',
      'remaining_annotation_gaps',
      'usable_live_replay_samples_required',
      'duration_bearing_window_replay_coverage_missing',
      'duration_bearing_window_replay_coverage_required',
    ]))
    expect(assembled.assemblyGate.canWriteTaskDependencies).toBe(false)
    expect(assembled.assemblyGate.canWritePlanDates).toBe(false)
  })

  it('blocks C-19.13 entry when T2 schedule assets are missing the standard-library live replay trust gate', async () => {
    const { candidatePackage, productionCapacityEvidence, network, evaluation } = buildCompatibleT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-compatible-but-missing-live-replay-gate',
      evaluations: [evaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-missing-live-replay-trust-gate',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
    }, {
      purpose: 'execution_reference',
    })

    expect((assembled.inputChannels as any).t2RhythmStandardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 'missing',
      status: 'missing',
    }))
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      standardLibraryTrustGateStatus: 'missing',
      standardLibraryTrustBoundary: 'blocked_live_replay_evidence',
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('t2_standard_library_live_replay_trust_gate_missing')
    expect((assembled.assemblyGate as any).standardLibraryTrustBlockingReasons).toEqual(expect.arrayContaining([
      't2_standard_library_live_replay_trust_gate_missing',
      'archived_live_replay_required',
    ]))
    expect(assembled.assemblyGate.canWriteTaskDependencies).toBe(false)
    expect(assembled.assemblyGate.canWritePlanDates).toBe(false)
  })

  it('surfaces partial T2 production capacity evidence as a separate manual-review assembly gate reason', async () => {
    const partialProductionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })
    const { candidatePackage, network, evaluation } = buildCompatibleT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-compatible-with-partial-capacity-evidence',
      evaluations: [evaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-partial-capacity-evidence',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: partialProductionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
    }, {
      purpose: 'execution_reference',
    })

    expect(assembled.inputChannels.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'candidate_conflict',
      tier: 'T2',
      assetSource: 't2_rhythm_production_capacity_evidence',
    }))
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      productionCapacityEvidenceStatus: 'partial',
      productionCapacityMissingEvidenceCodes: ['crew_stream_capacity_missing'],
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('production_capacity_evidence_missing')
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 't2RhythmProductionCapacityEvidence',
        status: 'candidate_conflict',
      }),
    ]))
  })

  it('blocks C-19.13 entry when T2 schedule assets require project-side production capacity evidence but none is supplied', async () => {
    const { candidatePackage, network, evaluation, standardLibraryTrustGate } = buildCompatibleT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-compatible-without-capacity-evidence',
      evaluations: [evaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-missing-capacity-evidence',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
      t2RhythmStandardLibraryTrustGate: standardLibraryTrustGate,
    }, {
      purpose: 'execution_reference',
    })

    expect(candidatePackage.productionFeasibilitySummaries.length).toBeGreaterThan(0)
    expect(assembled.inputChannels.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 'missing',
      status: 'missing',
    }))
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      productionCapacityEvidenceStatus: null,
      productionCapacityMissingEvidenceCodes: ['production_capacity_evidence_missing'],
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('production_capacity_evidence_missing')
    expect(assembled.assemblyGate.canWriteTaskDependencies).toBe(false)
    expect(assembled.assemblyGate.canWritePlanDates).toBe(false)
  })

  it('blocks stale phase-1 selector handoffs when the selected candidate does not match the supplied evaluation', async () => {
    const { candidatePackage, productionCapacityEvidence, network, evaluation, standardLibraryTrustGate } = buildCompatibleT2Assets()
    const otherNetwork = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-compatible-other-network',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence,
    })
    const otherEvaluation = evaluateT2RhythmScheduleCandidateNetwork(otherNetwork)
    const stalePhase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-stale-selection-handoff',
      evaluations: [otherEvaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-stale-selector-handoff',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmProductionCapacityEvidence: productionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: stalePhase1Selection,
      t2RhythmStandardLibraryTrustGate: standardLibraryTrustGate,
    }, {
      purpose: 'execution_reference',
    })

    expect(stalePhase1Selection.selectedCandidateId).toBe('c19-13-compatible-other-network')
    expect(evaluation.candidateId).toBe('c19-13-compatible-t2-network')
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      priorityOverrideBlocked: false,
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('phase1_selection_candidate_mismatch')
    expect(assembled.assemblyGate.canWriteTaskDependencies).toBe(false)
    expect(assembled.assemblyGate.canWritePlanDates).toBe(false)
  })

  it('assembles derived T2 production capacity evidence from project metadata sidecars as a read-only L3 channel', async () => {
    metadataState.projects = [{
      id: 'project-t2-raw-capacity',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          totalAreaM2: 60000,
        },
        resourceSidecar: {
          availableCrewStreams: 4,
          evidenceRefs: ['resource_sidecar:project-t2-raw-capacity'],
        },
        constructionRhythmExpansion: {
          workfaceCandidateCount: 2,
          candidates: [{
            backendConsumable: true,
            workfaceKeys: ['building-a-floor-10', 'building-a-floor-11'],
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
      },
    }]
    dbMocks.from.mockClear()

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-raw-capacity',
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(assembled.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_evidence',
      status: 'ready',
      productionCapacity: expect.objectContaining({
        availableParallelWorkfaces: 2,
        availableCrewStreams: 4,
        calendarBasis: 'working_day',
      }),
    }))
    expect(assembled.inputChannels.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 'project_metadata',
      status: 'ready',
      tier: 'T2',
      assetSource: 't2_rhythm_production_capacity_evidence',
    }))
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 't2RhythmProductionCapacityEvidence',
        source: 'project_metadata',
        status: 'ready',
      }),
    ]))
    expect(assembled.projectGenerationFacts).not.toHaveProperty('resourceSidecar')
    expect(assembled.mutationBoundary.writesTaskDependencies).toBe(false)
    expect(dbMocks.from).toHaveBeenCalledWith('projects')
  })

  it('keeps conflicting T2 assemblies out of C-19.13 automatic selection even when priority picked a template', async () => {
    const { candidatePackage, network, evaluation } = buildConflictingT2Assets()
    const phase1Selection = selectT2RhythmSchedulePhase1Network({
      selectionId: 'c19-13-phase1-conflict-only',
      evaluations: [evaluation],
    })

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-conflict',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
      t2RhythmSchedulePhase1Selection: phase1Selection,
    }, {
      purpose: 'schedule_acceleration',
    })

    expect(assembled.t2RhythmScheduleCandidateNetwork?.status).toBe('candidate_conflict')
    expect(assembled.t2RhythmScheduleCandidateNetworkEvaluation?.status).toBe('candidate_conflict')
    expect(assembled.assemblyGate).toEqual(expect.objectContaining({
      status: 'candidate_conflict',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: true,
      priorityOverrideBlocked: true,
    }))
    expect(assembled.assemblyGate.conflictCodes).toContain('construction_organization_t2_assumption_conflict')
    expect(assembled.assemblyGate.canWriteTaskDependencies).toBe(false)
    expect(assembled.assemblyGate.canWritePlanDates).toBe(false)
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetwork',
        status: 'candidate_conflict',
      }),
      expect.objectContaining({
        channel: 't2RhythmScheduleCandidateNetworkEvaluation',
        status: 'candidate_conflict',
      }),
      expect.objectContaining({
        channel: 't2RhythmSchedulePhase1Selection',
        status: 'candidate_conflict',
      }),
    ]))
    expect(assembled.t2RhythmSchedulePhase1Selection).toEqual(expect.objectContaining({
      status: 'manual_review_required',
      selectedCandidateId: null,
      combinationConsistencyGate: expect.objectContaining({
        status: 'blocked',
        rejectedConflictCandidateCount: 1,
      }),
    }))
  })

  it('assembles actual, experience, and critical-path facts as read-only L3 channels', async () => {
    const assembled = await assembleDurationInput({
      projectId: 'project-unified-duration-inputs',
      projectGenerationFacts: {
        businessType: 'residential',
      },
      actualExecutionFacts: {
        source: 'runtime_execution_facts',
        taskId: 'task-actual-1',
        actualStartDate: '2026-06-01',
        actualEndDate: '2026-06-10',
        progressCompletionRatio: 1,
      },
      durationExperienceSignals: {
        source: 'duration_experience_samples',
        experienceTier: 'T1',
        experienceAssetType: 'process_duration',
        sampleCount: 12,
        evidenceRefs: ['duration_experience_samples:sample-1'],
      },
      criticalPathEvidence: {
        source: 'critical_path_cpm',
        engineCode: 'E3',
        criticalPathInputHash: 'critical-path-hash-1',
        primaryChainTaskIds: ['task-actual-1'],
      },
    }, {
      purpose: 'runtime_forecast',
    })

    expect((assembled as any).actualExecutionFacts).toEqual(expect.objectContaining({
      source: 'runtime_execution_facts',
      taskId: 'task-actual-1',
    }))
    expect((assembled as any).durationExperienceSignals).toEqual(expect.objectContaining({
      source: 'duration_experience_samples',
      experienceTier: 'T1',
      experienceAssetType: 'process_duration',
    }))
    expect((assembled as any).criticalPathEvidence).toEqual(expect.objectContaining({
      source: 'critical_path_cpm',
      engineCode: 'E3',
    }))
    expect((assembled.inputChannels as any).actualExecutionFacts).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      assetSource: 'runtime_execution_facts',
    }))
    expect((assembled.inputChannels as any).durationExperienceSignals).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      tier: 'T1',
      assetSource: 'duration_experience_samples',
    }))
    expect((assembled.inputChannels as any).criticalPathEvidence).toEqual(expect.objectContaining({
      source: 'explicit_input',
      status: 'ready',
      assetSource: 'critical_path_cpm',
    }))
    expect(assembled.sourceLineage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'actualExecutionFacts',
        source: 'explicit_input',
        assetSource: 'runtime_execution_facts',
      }),
      expect.objectContaining({
        channel: 'durationExperienceSignals',
        source: 'explicit_input',
        tier: 'T1',
        assetSource: 'duration_experience_samples',
      }),
      expect.objectContaining({
        channel: 'criticalPathEvidence',
        source: 'explicit_input',
        assetSource: 'critical_path_cpm',
      }),
    ]))
    expect(assembled.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('strips T2 assets from project facts while preserving construction organization lineage facts', async () => {
    const { candidatePackage, network, evaluation } = buildCompatibleT2Assets()

    const assembled = await assembleDurationInput({
      projectId: 'project-t2-lineage',
      projectGenerationFacts: {
        businessType: 'residential',
        t2RhythmScheduleCandidatePackage: candidatePackage,
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          planNetworkPublication: {
            assetKey: 'construction_organization_plan_network',
            publicationKey: 'construction-org-plan-network-release:project-t2-lineage',
          },
        },
      },
      t2RhythmScheduleCandidatePackage: candidatePackage,
      t2RhythmScheduleCandidateNetwork: network,
      t2RhythmScheduleCandidateNetworkEvaluation: evaluation,
    }, {
      purpose: 'new_task_reference',
    })

    expect(assembled.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidatePackage')
    expect(assembled.projectGenerationFacts).toEqual(expect.objectContaining({
      constructionOrganizationScenario: expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        planNetworkPublication: expect.objectContaining({
          publicationKey: 'construction-org-plan-network-release:project-t2-lineage',
        }),
      }),
    }))
  })
})
