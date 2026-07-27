import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmScheduleCandidatePackage,
  type T2RhythmPhase1MultiNetworkSelectionTrustGate,
  type T2RhythmScheduleCandidatePackageInput,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildAndPersistT2RhythmReplayLearningCandidate,
  buildT2RhythmReplayLearningCandidate,
} from '../services/t2RhythmReplayLearningCandidateService.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import { buildT2RhythmTemplateReplayEvidence } from '../services/t2RhythmTemplateReplayEvidenceService.js'

const compatibleCandidatePackageInput: T2RhythmScheduleCandidatePackageInput = {
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
}

function buildCompatibleCandidatePackage() {
  return buildT2RhythmScheduleCandidatePackage(compatibleCandidatePackageInput)
}

function buildReleaseReadyCandidatePackage() {
  const baseCandidatePackage = buildCompatibleCandidatePackage()
  const selectedTemplateIds = baseCandidatePackage.selectedTemplateIds
  const liveReplayTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
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
  const phase1MultiNetworkSelectionTrustGate: T2RhythmPhase1MultiNetworkSelectionTrustGate = {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate' as const,
    status: 'phase1_multinetwork_selection_ready_not_publishable' as const,
    evidenceMode: 'archived_phase1_selector_replay' as const,
    trustBoundary: 'archived_phase1_selector_replay_only' as const,
    canTrustForRealScheduleSelection: true,
    readySelectionCount: 15,
    minimumSelectionCount: 15,
    scenarioCoverageCount: 15,
    minimumScenarioCoverageCount: 15,
    eligibleCandidateCount: 15,
    rejectedConflictCandidateCount: 15,
    selectedTemplateIds,
    selectionEvidenceRefs: ['artifact:c19-13-phase1-selector-replay.json'],
    releaseBlockers: [],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
  const l5ReleaseGate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
    trustGate: liveReplayTrustGate,
    selectedTemplateIds,
    releaseScope: {
      scopeType: 'project',
      projectId: 'project-t2-standard-library-canary',
    },
    l5Evidence: {
      releaseExitApproved: true,
      releaseExitEvidenceRefs: ['artifact:t2-release-exit.md'],
      canaryPlanApproved: true,
      canaryEvidenceRefs: ['artifact:t2-canary-plan.md'],
      canaryMinimumSampleCount: 30,
      canaryDurationDays: 14,
      canaryBlastRadius: {
        maxProjectCount: 1,
        maxCompanyCount: 1,
        maxTemplateCount: 3,
        scopeLocked: true,
      },
      canarySuccessCriteria: {
        minimumP80CaptureRate: 0.85,
        maximumMedianAbsoluteErrorDays: 2,
        maximumGateSlipMedianDays: 2,
        maximumDependencyViolationRate: 0.05,
      },
      runtimeConsumerVerified: true,
      runtimeConsumerEvidenceRefs: ['artifact:t2-consumer-verification.md'],
      impactMonitoringReady: true,
      impactMonitoringEvidenceRefs: ['artifact:t2-impact-monitoring.md'],
      impactMonitoringMetrics: [
        {
          metricCode: 't2_p80_capture_rate',
          comparator: 'gte',
          threshold: 0.85,
          windowDays: 14,
        },
      ],
      rollbackTargetReady: true,
      rollbackEvidenceRefs: ['artifact:t2-rollback-target.md'],
      rollbackDrill: {
        executed: true,
        recoveryTimeMinutes: 20,
        rollbackTargetVersion: 'v1.4.23.1-t2-division-rhythm-cold-start-20260622',
        evidenceRefs: ['artifact:t2-rollback-drill.md'],
      },
    },
  })

  return buildT2RhythmScheduleCandidatePackage({
    ...compatibleCandidatePackageInput,
    liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate,
  })
}

function buildShadowReplayEvidence(candidatePackage = buildCompatibleCandidatePackage()) {
  const window = candidatePackage.durationContextCandidates[0]

  const samples = Array.from({ length: 12 }, (_, index) => {
    const day = index + 1
    const startDay = String(day).padStart(2, '0')
    const endDay = String(day + window.recommendedDurationDays - 1).padStart(2, '0')
    return {
      sampleId: `sample-${index + 1}`,
      projectId: 'project-a1',
      workfaceKey: `tower-a-floor-${index + 1}`,
      windowCode: window.windowCode,
      plannedWindowDurationDays: window.recommendedDurationDays,
      templateP80WindowDurationDays: window.recommendedDurationDays,
      plannedGateDate: `2026-05-${endDay}`,
      actualGateDate: `2026-05-${endDay}`,
      actualStartDate: `2026-05-${startDay}`,
      actualEndDate: `2026-05-${endDay}`,
      dependencySatisfied: true,
      evidenceRef: `duration_experience_samples:sample-${index + 1}`,
    }
  })

  return buildT2RhythmTemplateReplayEvidence({
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    samples,
  })
}

describe('t2RhythmReplayLearningCandidateService', () => {
  it('keeps accepted T2 replay evidence in data collection until the release evidence closure is ready', () => {
    const candidatePackage = buildCompatibleCandidatePackage()
    const replayEvidence = buildShadowReplayEvidence()

    const result = buildT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
      evidenceRef: 'artifacts/t2/live-replay/project-a1.json',
    })

    expect(result.status).toBe('data_collection_open')
    expect(result.event).toBeUndefined()
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'release_evidence_closure_ready_required',
    ]))
  })

  it('turns accepted T2 replay evidence into a governed template candidate event without runtime writes', () => {
    const candidatePackage = buildReleaseReadyCandidatePackage()
    const replayEvidence = buildShadowReplayEvidence(candidatePackage)

    const result = buildT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
      evidenceRef: 'artifacts/t2/live-replay/project-a1.json',
    })

    expect(result.status).toBe('shadow_candidate_event_created')
    expect(result.blockingReasons).toEqual([])
    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 't2.rhythm.template:t2-residential-standard-floor-structure-rhythm-v1',
      sourceSystem: 't2RhythmReplayLearningCandidateService',
      assetType: 'template',
      scopeType: 'project',
      companyId: 'company-a',
      projectId: 'project-a1',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_shadow',
      learningMaturity: 'governed_candidate',
      learningTarget: 'template_structure',
      runtimeEffectPolicy: 'candidate_only',
      lifecycleStatus: 'review_required',
    }))
    expect(result.event?.governanceDecision).toEqual(expect.objectContaining({
      canWriteRuntime: false,
      runtimeAction: 'shadow_compare_only',
    }))
    expect(result.event?.candidatePayload).toEqual(expect.objectContaining({
      source: 't2_rhythm_replay_learning_candidate',
      tier: 'T2',
      experienceTier: 'T2',
      reuseScope: 'project',
      learningScope: 'project',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedTemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      wbsNodeTypes: ['division', 'subdivision'],
      experienceGroupKeys: expect.arrayContaining([
        'T2:division:superstructure',
        'T2:subdivision:standard_floor_handover',
      ]),
      experienceTierRegistryCandidate: expect.objectContaining({
        tier: 'T2',
        reusableAtNodeTypes: ['division', 'subdivision'],
        groupKeyStrategy: 'business_type_phase_division_subdivision_workface',
        prohibitsT1T3BucketMixing: true,
      }),
      replayAcceptanceStatus: 'shadow_candidate',
      replayEvidenceRef: 'artifacts/t2/live-replay/project-a1.json',
      metrics: expect.objectContaining({
        sampleCount: 12,
        comparableWorkfaceWindowCount: 12,
        p80CaptureRate: 1,
      }),
      scheduleTrustPolicy: expect.objectContaining({
        autoApply: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        requiresL5Publication: true,
      }),
      governance: expect.objectContaining({
        directSeedMutationAllowed: false,
        autoPublishAllowed: false,
        writesPlanDates: false,
        writesTaskDependencies: false,
        requiresL5Publication: true,
      }),
    }))
  })

  it('keeps thin replay evidence in data collection instead of creating a candidate event', () => {
    const candidatePackage = buildReleaseReadyCandidatePackage()
    const window = candidatePackage.durationContextCandidates[0]
    const replayEvidence = buildT2RhythmTemplateReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      samples: [{
        sampleId: 'thin-sample',
        windowCode: window.windowCode,
        plannedWindowDurationDays: window.recommendedDurationDays,
        templateP80WindowDurationDays: window.recommendedDurationDays,
        actualStartDate: '2026-05-01',
        actualEndDate: '2026-05-04',
        dependencySatisfied: true,
        evidenceRef: 'duration_experience_samples:thin-sample',
      }],
    })

    const result = buildT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
    })

    expect(result.status).toBe('data_collection_open')
    expect(result.event).toBeUndefined()
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'sample_gate_not_met',
    ]))
    expect(result.governance).toEqual(expect.objectContaining({
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
    }))
  })

  it('blocks candidate event creation when the selected T2 package has assembly conflicts', () => {
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
    const replayEvidence = buildShadowReplayEvidence(buildCompatibleCandidatePackage())

    const result = buildT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.event).toBeUndefined()
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      't2_candidate_package_conflict',
      'priority_override_blocked_by_assembly_conflict',
    ]))
  })

  it('persists accepted T2 replay candidates through the unified candidate event table only', async () => {
    const candidatePackage = buildReleaseReadyCandidatePackage()
    const replayEvidence = buildShadowReplayEvidence(candidatePackage)
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 't2-candidate-event-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await buildAndPersistT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
      evidenceRef: 'artifacts/t2/live-replay/project-a1.json',
      queryExec,
    })

    expect(result.status).toBe('shadow_candidate_event_created')
    expect(result.persistence).toEqual({
      persisted: true,
      candidateEventId: 't2-candidate-event-row-id',
    })
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('runtime_publications')
  })

  it('does not persist thin or conflicted T2 replay candidates', async () => {
    const candidatePackage = buildReleaseReadyCandidatePackage()
    const window = candidatePackage.durationContextCandidates[0]
    const replayEvidence = buildT2RhythmTemplateReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      samples: [{
        sampleId: 'thin-sample',
        windowCode: window.windowCode,
        plannedWindowDurationDays: window.recommendedDurationDays,
        templateP80WindowDurationDays: window.recommendedDurationDays,
        actualStartDate: '2026-05-01',
        actualEndDate: '2026-05-04',
        dependencySatisfied: true,
        evidenceRef: 'duration_experience_samples:thin-sample',
      }],
    })
    const calls: Array<{ sql: string, params: unknown[] }> = []

    const result = await buildAndPersistT2RhythmReplayLearningCandidate({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      replayEvidence,
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
        calls.push({ sql, params })
        return [] as T[]
      },
    })

    expect(result.status).toBe('data_collection_open')
    expect(result.event).toBeUndefined()
    expect(result.persistence).toEqual({
      persisted: false,
      candidateEventId: null,
      skippedReason: 'data_collection_open',
    })
    expect(calls).toEqual([])
  })
})
