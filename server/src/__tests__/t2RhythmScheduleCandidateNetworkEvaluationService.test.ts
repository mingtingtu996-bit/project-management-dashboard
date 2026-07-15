import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmScheduleCandidateNetwork } from '../services/t2RhythmScheduleCandidateNetworkService.js'
import {
  evaluateT2RhythmScheduleCandidateNetwork,
} from '../services/t2RhythmScheduleCandidateNetworkEvaluationService.js'
import { buildT2RhythmProductionCapacityEvidence } from '../services/t2RhythmProductionCapacityEvidenceService.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

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
    },
  })
}

describe('t2RhythmScheduleCandidateNetworkEvaluationService', () => {
  it('evaluates a compatible T2 candidate network as read-only C-19.13 phase-1 schedule evidence', () => {
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
      productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
    })

    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)

    expect(evaluation.source).toBe('t2_rhythm_schedule_candidate_network_phase1_evaluation')
    expect(evaluation.status).toBe('phase1_readonly_evaluation_ready')
    expect(evaluation.canEnterC1913Phase1Selection).toBe(true)
    expect(evaluation.networkSpanDays).toBeGreaterThanOrEqual(1)
    expect(evaluation.topologicalOrder.length).toBe(network.nodes.length)
    expect(evaluation.criticalWindowCodes.length).toBeGreaterThanOrEqual(1)
    expect(evaluation.nodeEvaluations[0]).toEqual(expect.objectContaining({
      windowCode: expect.any(String),
      earliestStartDay: expect.any(Number),
      earliestFinishDay: expect.any(Number),
      totalFloatDays: expect.any(Number),
      isCritical: expect.any(Boolean),
    }))
    expect(evaluation.selectionReceipts).toEqual(network.selectionReceipts)
    expect(evaluation.selectionReceipts[0]).toEqual(expect.objectContaining({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectionStatus: 'selected_explicit_match',
      selectorPurity: expect.objectContaining({
        allExplicitDimensionsMatched: true,
        noT1T3Leakage: true,
      }),
    }))
    expect(evaluation.scheduleTrustEvidence).toEqual(expect.objectContaining({
      selectedTemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      standardLibraryReadinessStatus: 'shadow_candidate_ready_not_publishable',
      standardLibraryPrecisionStatus: 'ready',
      standardLibraryBreadthStatus: 'ready',
      standardLibraryDepthStatus: 'ready',
      selectionReceiptCount: network.selectionReceipts.length,
      selectorReceiptAuditStatus: 'ready',
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
      ]),
      topologyEvaluated: true,
      floatCalculated: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(evaluation.standardLibraryReadiness).toEqual(network.standardLibraryReadiness)
    expect(evaluation.phase1PublicationGate).toEqual(expect.objectContaining({
      status: 'blocked_pending_release_evidence',
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
      ]),
    }))
    expect(evaluation.templateAssemblyCompatibilityReceipt).toEqual(network.templateAssemblyCompatibilityReceipt)
    expect(evaluation.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'c19-13-t2-standard-floor-option',
      compatibilityStatus: 'compatible_candidate',
      priorityOverrideBlocked: false,
      conflictCodes: [],
      blockedTemplateIds: [],
      manualReviewReasons: [],
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesRuntimePublications: false,
      }),
    }))
    expect(evaluation.mutationBoundary).toEqual(network.mutationBoundary)
  })

  it('surfaces L5 canary handoff readiness without treating phase-1 evaluation as runtime publication', () => {
    const trustGate = evaluateT2RhythmStandardLibraryTrustGate({
      status: 'pass',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
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
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate: trustGate,
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
      candidateId: 'c19-13-t2-standard-floor-option-l5-ready',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-standard-floor',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
    })
    const l5ReleaseGate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
      trustGate,
      selectedTemplateIds: network.selectedTemplateIds,
      releaseScope: {
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000001',
        scopeType: 'project',
      },
      l5Evidence: {
        releaseExitApproved: true,
        releaseExitEvidenceRefs: ['release-exit:t2-standard-library:approved'],
        canaryPlanApproved: true,
        canaryEvidenceRefs: ['canary:t2-standard-library:7d-project-scope'],
        canaryMinimumSampleCount: 24,
        canaryDurationDays: 7,
        canaryBlastRadius: {
          maxProjectCount: 1,
          maxCompanyCount: 1,
          maxTemplateCount: 2,
          scopeLocked: true,
        },
        canarySuccessCriteria: {
          minimumP80CaptureRate: 0.8,
          maximumMedianAbsoluteErrorDays: 3,
          maximumGateSlipMedianDays: 2,
          maximumDependencyViolationRate: 0.02,
        },
        runtimeConsumerVerified: true,
        runtimeConsumerEvidenceRefs: ['consumer:durationInputAssembler:t2-standard-library'],
        impactMonitoringReady: true,
        impactMonitoringEvidenceRefs: ['monitor:t2-standard-library:mape-drift'],
        impactMonitoringMetrics: [
          { metricCode: 'median_absolute_error_days', comparator: 'lte', threshold: 3, windowDays: 7 },
          { metricCode: 'p80_capture_rate', comparator: 'gte', threshold: 0.8, windowDays: 7 },
        ],
        rollbackTargetReady: true,
        rollbackEvidenceRefs: ['rollback:t2-standard-library:previous-shadow-version'],
        rollbackDrill: {
          executed: true,
          recoveryTimeMinutes: 30,
          rollbackTargetVersion: 't2-standard-library-shadow-v0',
          evidenceRefs: ['rollback-drill:t2-standard-library:verified'],
        },
      },
    })

    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network, {
      l5ReleaseGate,
    })

    expect(evaluation.status).toBe('phase1_readonly_evaluation_ready')
    expect(evaluation.scheduleTrustEvidence).toEqual(expect.objectContaining({
      standardLibraryTrustGateStatus: 'shadow_replay_ready_not_publishable',
      standardLibraryTrustBoundary: 'archived_live_shadow_replay_only',
      canTrustForRealScheduleCalibration: true,
      standardLibraryTrustGateReleaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
      ]),
      releaseBlockers: expect.not.arrayContaining(['archived_live_replay_required']),
    }))
    expect(evaluation.standardLibraryReadiness.liveReplayTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      trustBoundary: 'archived_live_shadow_replay_only',
      canTrustForRealScheduleCalibration: true,
    }))
    expect(evaluation.phase1PublicationGate).toEqual(expect.objectContaining({
      status: 'canary_handoff_ready_not_published',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      l5ReleaseGateStatus: 'l5_canary_handoff_ready',
      releaseBlockers: expect.arrayContaining([
        'manual_promotion_after_canary_required',
        'domain_writer_runtime_publication_required',
      ]),
      releasePackage: expect.objectContaining({
        packageType: 't2_standard_library_canary_handoff',
        releaseMode: 'canary_only',
        canaryPlan: expect.objectContaining({
          minimumSampleCount: 24,
          durationDays: 7,
          blastRadius: expect.objectContaining({
            maxProjectCount: 1,
            maxCompanyCount: 1,
            maxTemplateCount: 2,
            scopeLocked: true,
          }),
          successCriteria: expect.objectContaining({
            minimumP80CaptureRate: 0.8,
            maximumMedianAbsoluteErrorDays: 3,
            maximumGateSlipMedianDays: 2,
            maximumDependencyViolationRate: 0.02,
          }),
        }),
        impactMonitoringPlan: expect.objectContaining({
          metrics: expect.arrayContaining([
            expect.objectContaining({ metricCode: 'median_absolute_error_days', comparator: 'lte', threshold: 3, windowDays: 7 }),
            expect.objectContaining({ metricCode: 'p80_capture_rate', comparator: 'gte', threshold: 0.8, windowDays: 7 }),
          ]),
        }),
        rollbackPlan: expect.objectContaining({
          drillExecuted: true,
          recoveryTimeMinutes: 30,
          rollbackTargetVersion: 't2-standard-library-shadow-v0',
          drillEvidenceRefs: ['rollback-drill:t2-standard-library:verified'],
        }),
      }),
    }))
    expect(evaluation.phase1PublicationGate.releasePackage?.evidenceRefs).toEqual(expect.arrayContaining([
      'release-exit:t2-standard-library:approved',
      'canary:t2-standard-library:7d-project-scope',
      'consumer:durationInputAssembler:t2-standard-library',
      'monitor:t2-standard-library:mape-drift',
      'rollback:t2-standard-library:previous-shadow-version',
      'rollback-drill:t2-standard-library:verified',
    ]))
    expect(evaluation.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
    })
  })

  it('preserves T2 rhythm window anchors when computing phase-1 span so long-cycle templates are not compressed', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const templateId = 't2-residential-basement-structure-handover-rhythm-v1'
    const templateWindows = candidatePackage.packageWindows.filter((window) => window.templateId === templateId)
    const templateAnchorSpan = Math.max(...templateWindows.map((window) => window.endDay))
      - Math.min(...templateWindows.map((window) => window.startDay))
      + 1
    const durationBearingAnchorSpan = Math.max(...templateWindows.filter((window) => window.durationBearing).map((window) => window.endDay))
      - Math.min(...templateWindows.filter((window) => window.durationBearing).map((window) => window.startDay))
      + 1
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-t2-basement-long-cycle-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
    })

    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)

    expect(evaluation.status).toBe('phase1_readonly_evaluation_ready')
    expect(evaluation.networkSpanDays).toBeGreaterThanOrEqual(templateAnchorSpan)
    expect(evaluation.networkSpanDays).toBeGreaterThanOrEqual(durationBearingAnchorSpan)
    expect(evaluation.nodeEvaluations.find((node) => node.role === 'basement_acceptance_closeout')).toEqual(expect.objectContaining({
      earliestStartDay: expect.any(Number),
      earliestFinishDay: Math.max(...templateWindows.map((window) => window.endDay)),
    }))
  })

  it('keeps conflicted T2 candidate networks out of phase-1 schedule evaluation', () => {
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
    })
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: 'c19-13-t2-conflicted-option',
      candidatePackage,
      constructionOrganization: {
        scenarioId: 'tower-first-option',
        assumptions: ['tower_first_without_basement_handover'],
      },
      productionCapacityEvidence: readyProductionCapacityEvidence(candidatePackage),
    })

    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)

    expect(evaluation.status).toBe('candidate_conflict')
    expect(evaluation.canEnterC1913Phase1Selection).toBe(false)
    expect(evaluation.nodeEvaluations).toEqual([])
    expect(evaluation.conflictSummary.conflictCount).toBeGreaterThan(0)
    expect(evaluation.templateAssemblyCompatibilityReceipt).toEqual(network.templateAssemblyCompatibilityReceipt)
    expect(evaluation.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      conflictCodes: expect.arrayContaining(['t2_candidate_conflict']),
      blockedTemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      manualReviewReasons: expect.arrayContaining([
        expect.stringContaining('tower_first_without_basement_handover'),
      ]),
    }))
    expect(evaluation.scheduleTrustEvidence.topologyEvaluated).toBe(false)
    expect(evaluation.scheduleTrustEvidence.writesTaskDependencies).toBe(false)
    expect(evaluation.scheduleTrustEvidence.writesPlanDates).toBe(false)
  })
})
