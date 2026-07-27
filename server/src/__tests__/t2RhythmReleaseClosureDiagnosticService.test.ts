import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmReleaseClosureDiagnosticReport,
} from '../services/t2RhythmReleaseClosureDiagnosticService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import type {
  T2RhythmPhase1MultiNetworkSelectionTrustGate,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'

const selectedTemplateIds = ['t2-residential-standard-floor-structure-rhythm-v1']

function buildPassingLiveReplayReleaseEvidenceInput() {
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

  return {
    source: 't2_live_replay_release_evidence_input' as const,
    evidenceMode: 'archived_live_replay' as const,
    selectedTemplateIds,
    evidenceRefs: [
      'artifact:t2-live-replay-current.json',
      'diagnostic-run:c19-t2-rhythm-live-replay-current',
    ],
    liveReplayTrustGate,
    canFeedReleaseEvidenceClosure: true,
    blockingReasons: [],
    mutationBoundary: liveReplayTrustGate.mutationBoundary,
  }
}

function buildPassingPhase1MultiNetworkSelectionTrustGate(
  templateIds = selectedTemplateIds,
): T2RhythmPhase1MultiNetworkSelectionTrustGate {
  return {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: 'phase1_multinetwork_selection_ready_not_publishable',
    evidenceMode: 'archived_phase1_selector_replay',
    trustBoundary: 'archived_phase1_selector_replay_only',
    canTrustForRealScheduleSelection: true,
    readySelectionCount: 15,
    minimumSelectionCount: 15,
    scenarioCoverageCount: 15,
    minimumScenarioCoverageCount: 15,
    eligibleCandidateCount: 15,
    rejectedConflictCandidateCount: 15,
    selectedTemplateIds: templateIds,
    selectionEvidenceRefs: [
      'artifact:c19-13-phase1-selector-replay.json',
    ],
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
}

function buildPassingL5CanaryHandoffGate(templateIds = selectedTemplateIds) {
  const liveReplayTrustGate = buildPassingLiveReplayReleaseEvidenceInput().liveReplayTrustGate
  return evaluateT2RhythmStandardLibraryL5ReleaseGate({
    trustGate: liveReplayTrustGate,
    selectedTemplateIds: templateIds,
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
}

const residentialSelection = {
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

describe('buildT2RhythmReleaseClosureDiagnosticReport', () => {
  it('emits a ready-not-publishable release artifact when all gates cover the current selected T2 templates', () => {
    const liveReplayReleaseEvidenceInput = buildPassingLiveReplayReleaseEvidenceInput()
    const report = buildT2RhythmReleaseClosureDiagnosticReport({
      reportId: 't2-release-closure-current',
      generatedAt: '2026-06-23T12:50:00.000Z',
      liveReplayReleaseEvidenceInput,
      phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
      l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
      ...residentialSelection,
    })

    expect(report).toEqual(expect.objectContaining({
      source: 't2_rhythm_release_closure_diagnostic_report',
      reportId: 't2-release-closure-current',
      status: 'ready_not_publishable',
      selectedTemplateIds,
      candidatePackageStatus: 'schedulable_candidate',
    }))
    expect(report.releaseEvidenceClosure).toEqual(expect.objectContaining({
      status: 'ready_not_publishable',
      selectedTemplateIds,
      readyGateCodes: [
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ],
      blockingGateCodes: [],
      templateScopeMismatchCodes: [],
    }))
    expect(report.gateScopeMatrix.every((row) => row.coversCurrentSelection)).toBe(true)
    expect(report.releaseAutomationGate).toEqual(expect.objectContaining({
      status: 'ready_for_manual_publication_artifact',
      canEmitReleaseArtifact: true,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      requiredManualGateCodes: expect.arrayContaining([
        'manual_publication_approval_required',
        'manual_promotion_after_canary_required',
        'domain_writer_runtime_publication_required',
      ]),
    }))
    expect(report.releaseEvidenceRefs).toEqual(expect.arrayContaining([
      'artifact:t2-live-replay-current.json',
      'artifact:c19-13-phase1-selector-replay.json',
      'artifact:t2-release-exit.md',
      'artifact:t2-rollback-drill.md',
    ]))
    expect(report.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('blocks the release artifact when a ready selector replay gate covers a different T2 template scope', () => {
    const report = buildT2RhythmReleaseClosureDiagnosticReport({
      liveReplayReleaseEvidenceInput: buildPassingLiveReplayReleaseEvidenceInput(),
      phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate([
        't2-hospital-cleanroom-medical-system-commissioning-v1',
      ]),
      l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
      ...residentialSelection,
    })

    expect(report.status).toBe('blocked')
    expect(report.releaseEvidenceClosure).toEqual(expect.objectContaining({
      status: 'blocked',
      blockingGateCodes: expect.arrayContaining(['c19_13_phase1_multinetwork_selection']),
      templateScopeMismatchCodes: expect.arrayContaining([
        'c19_13_phase1_selector_template_scope_mismatch',
      ]),
    }))
    expect(report.gateScopeMatrix).toContainEqual(expect.objectContaining({
      gateCode: 'c19_13_phase1_multinetwork_selection',
      coversCurrentSelection: false,
    }))
    expect(report.releaseAutomationGate).toEqual(expect.objectContaining({
      status: 'blocked',
      canEmitReleaseArtifact: false,
      blockingReasons: expect.arrayContaining([
        'c19_13_phase1_selector_template_scope_mismatch',
      ]),
    }))
    expect(report.mutationBoundary.writesTaskDependencies).toBe(false)
    expect(report.mutationBoundary.writesRuntimePublications).toBe(false)
  })

  it('blocks the release artifact when archived live replay metadata cannot feed release evidence closure', () => {
    const liveReplayReleaseEvidenceInput = {
      ...buildPassingLiveReplayReleaseEvidenceInput(),
      evidenceRefs: [],
      canFeedReleaseEvidenceClosure: false,
      blockingReasons: ['missing_evidence_metadata', 'release_evidence_ref_required'],
    }
    const report = buildT2RhythmReleaseClosureDiagnosticReport({
      liveReplayReleaseEvidenceInput,
      phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
      l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
      ...residentialSelection,
    })

    expect(report.status).toBe('blocked')
    expect(report.releaseAutomationGate).toEqual(expect.objectContaining({
      status: 'blocked',
      canEmitReleaseArtifact: false,
      blockingReasons: expect.arrayContaining([
        'missing_evidence_metadata',
        'release_evidence_ref_required',
      ]),
    }))
    expect(report.gateScopeMatrix).toContainEqual(expect.objectContaining({
      gateCode: 'archived_live_replay',
      evidenceRefCount: 0,
      coversCurrentSelection: false,
      blockingReasons: expect.arrayContaining([
        'missing_evidence_metadata',
        'release_evidence_ref_required',
      ]),
    }))
    expect(report.releaseEvidenceClosure.canAutoMaterializeTaskDependencies).toBe(false)
    expect(report.releaseEvidenceClosure.canAutoPublishRuntimeExperience).toBe(false)
  })
})
