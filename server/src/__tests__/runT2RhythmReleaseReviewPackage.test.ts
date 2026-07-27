import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmReleaseReviewPackageChain,
  shouldFailT2RhythmReleaseReviewPackageChain,
  writeT2RhythmReleaseReviewPackageChainIfRequested,
} from '../scripts/run-t2-rhythm-release-review-package.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import type {
  T2RhythmPhase1MultiNetworkSelectionTrustGate,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'

const selectedTemplateIds = ['t2-residential-standard-floor-structure-rhythm-v1']

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

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
    evidenceRefs: ['artifact:t2-live-replay-current.json'],
    liveReplayTrustGate,
    canFeedReleaseEvidenceClosure: true,
    blockingReasons: [],
    mutationBoundary: liveReplayTrustGate.mutationBoundary,
  }
}

function buildBlockedLiveReplayDiagnosticWithAnnotationReviewPackage() {
  const liveReplayTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
    status: 'fail',
    selectedTemplateIds,
    missingArchivedJson: false,
    evidenceMetadata: {
      missingEvidenceMetadata: false,
    },
    sampleAvailability: {
      totalUsableSampleCount: 0,
      totalLiveRowsWithoutT2WindowMetadata: 1,
      reasonCodes: ['live_rows_without_t2_window_metadata', 'no_t2_replay_samples'],
    },
    replayCoverage: {
      status: 'fail',
      reasonCodes: ['duration_bearing_window_replay_coverage_missing'],
    },
    annotationGapClosure: {
      manualAnnotationCandidateCount: 1,
      annotationGapCount: 0,
      reasonCodes: ['manual_annotation_required_before_replay'],
    },
    checks: {
      readiness: {
        status: 'pass',
        reasonCodes: [],
      },
      taskActualReplay: {
        readyForShadow: false,
        reasonCodes: ['missing_t2_window_code'],
      },
      durationExperienceReplay: {
        readyForShadow: false,
        reasonCodes: ['duration_experience_samples_empty'],
      },
    },
  })
  return {
    reportCode: 'c19_t2_rhythm_live_replay_diagnostic',
    selectedTemplateIds,
    annotationReviewPackage: {
      source: 't2_live_replay_annotation_review_package',
      status: 'ready_for_manual_review',
      eventKey: 't2RhythmTaskWindowAnnotationCandidateEventService:t2.rhythm.task_window_annotation:project-1:t2-residential-standard-floor-structure-rhythm-v1:no_company:project-1',
      assetKey: 't2.rhythm.task_window_annotation:project-1:t2-residential-standard-floor-structure-rhythm-v1',
      projectId: 'project-1',
      templateId: selectedTemplateIds[0],
      selectedTemplateIds,
      evidenceRef: 'supabase:current-live:t2-live-replay:annotation-candidate',
      annotationCandidateCount: 1,
      annotationGapCount: 0,
      canFeedReplayEvidence: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresManualApproval: true,
      requiresReleaseExitBeforeMetadataWrite: true,
      annotationCandidates: [
        {
          taskId: 'task-concrete-pour',
          proposedWindowCode: 'superstructure:standard_floor_handover:concrete_pour',
          proposedWindowRole: 'concrete_pour',
          confidence: 'medium',
          score: 70,
          matchSignals: ['title_keyword:concrete_pour'],
          reviewReasonCodes: ['duration_outside_t2_window_band'],
          requiresManualApproval: true,
          autoWriteAllowed: false,
        },
      ],
      annotationGaps: [],
      mutationBoundary: {
        writesStandardTaskMetadata: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    },
    releaseEvidenceInput: {
      source: 't2_live_replay_release_evidence_input' as const,
      evidenceMode: 'archived_live_replay' as const,
      selectedTemplateIds,
      evidenceRefs: ['artifact:t2-live-replay-current.json'],
      liveReplayTrustGate,
      canFeedReleaseEvidenceClosure: false,
      blockingReasons: [
        'live_replay_trust_gate_not_ready',
        'manual_annotation_gap_closure_required',
      ],
      mutationBoundary: liveReplayTrustGate.mutationBoundary,
    },
  }
}

function buildPassingPhase1MultiNetworkSelectionTrustGate(): T2RhythmPhase1MultiNetworkSelectionTrustGate {
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
}

function buildPassingL5CanaryHandoffGate() {
  return evaluateT2RhythmStandardLibraryL5ReleaseGate({
    trustGate: buildPassingLiveReplayReleaseEvidenceInput().liveReplayTrustGate,
    selectedTemplateIds,
    releaseScope: {
      scopeType: 'project',
      projectId: 'project-t2-canary',
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

function writePassingSourceFiles(dir: string) {
  const liveReplayEvidenceFile = join(dir, 'live-replay.json')
  const phase1SelectionGateFile = join(dir, 'phase1-selector.json')
  const l5ReleaseGateFile = join(dir, 'l5-release.json')

  writeJson(liveReplayEvidenceFile, {
    releaseEvidenceInput: buildPassingLiveReplayReleaseEvidenceInput(),
  })
  writeJson(phase1SelectionGateFile, {
    phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
  })
  writeJson(l5ReleaseGateFile, {
    l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
  })

  return {
    liveReplayEvidenceFile,
    phase1SelectionGateFile,
    l5ReleaseGateFile,
  }
}

function buildReadyOptions(dir: string) {
  return {
    ...writePassingSourceFiles(dir),
    outputDir: join(dir, 'review-package'),
    generatedAt: '2026-06-23T14:30:00.000Z',
    reportId: 't2-release-review-chain-current',
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
}

describe('run-t2-rhythm-release-review-package', () => {
  it('runs artifact generation, verification, and preflight into a manifest without opening runtime writers', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2-release-review-chain-'))
    const chain = buildT2RhythmReleaseReviewPackageChain(buildReadyOptions(dir))
    writeT2RhythmReleaseReviewPackageChainIfRequested(chain)

    expect(chain).toEqual(expect.objectContaining({
      chainCode: 'c19_t2_rhythm_release_review_package_chain',
      status: 'ready_for_manual_release_review',
      outputDir: join(dir, 'review-package'),
    }))
    expect(chain.steps.map((step) => step.status)).toEqual([
      'manual_publication_candidate_ready',
      'pass',
      'ready_for_manual_release_review',
    ])
    expect(chain.checks).toEqual(expect.objectContaining({
      artifactReady: true,
      verificationPassed: true,
      preflightReady: true,
      manifestWritten: true,
      runtimeWritersClosed: true,
    }))
    expect(chain.reviewPackage).toEqual(expect.objectContaining({
      canProceedToManualReview: true,
      canAutoPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
    }))
    expect(chain.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
    expect(shouldFailT2RhythmReleaseReviewPackageChain(chain)).toBe(false)

    const savedManifest = JSON.parse(readFileSync(chain.manifestFile, 'utf8'))
    const savedPreflight = JSON.parse(readFileSync(chain.preflightFile, 'utf8'))
    expect(savedManifest.status).toBe('ready_for_manual_release_review')
    expect(savedPreflight.status).toBe('ready_for_manual_release_review')
  })

  it('keeps the chained package blocked when one archived evidence source is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2-release-review-chain-blocked-'))
    const options = buildReadyOptions(dir)
    const chain = buildT2RhythmReleaseReviewPackageChain({
      ...options,
      l5ReleaseGateFile: null,
    })
    writeT2RhythmReleaseReviewPackageChainIfRequested(chain)

    expect(chain.status).toBe('blocked')
    expect(chain.steps.map((step) => step.status)).toEqual([
      'blocked',
      'fail',
      'blocked',
    ])
    expect(chain.checks).toEqual(expect.objectContaining({
      artifactReady: false,
      verificationPassed: false,
      preflightReady: false,
      runtimeWritersClosed: true,
    }))
    expect(chain.blockingReasons).toEqual(expect.arrayContaining([
      'release_closure_source_files_required',
      'release_closure_artifact_verification_required',
      'release_evidence_gate_closure_required',
    ]))
    expect(chain.reviewPackage.canProceedToManualReview).toBe(false)
    expect(chain.reviewPackage.canAutoPublishRuntimeExperience).toBe(false)
    expect(shouldFailT2RhythmReleaseReviewPackageChain(chain)).toBe(true)
  })

  it('carries live replay annotation review package handoff into the blocked manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2-release-review-chain-annotation-'))
    const options = buildReadyOptions(dir)
    writeJson(options.liveReplayEvidenceFile, buildBlockedLiveReplayDiagnosticWithAnnotationReviewPackage())

    const chain = buildT2RhythmReleaseReviewPackageChain(options)
    writeT2RhythmReleaseReviewPackageChainIfRequested(chain)

    expect(chain.status).toBe('blocked')
    expect(chain.liveReplayAnnotationReviewPackage).toEqual(expect.objectContaining({
      source: 't2_live_replay_annotation_review_package',
      status: 'ready_for_manual_review',
      assetKey: 't2.rhythm.task_window_annotation:project-1:t2-residential-standard-floor-structure-rhythm-v1',
      annotationCandidateCount: 1,
      canFeedReplayEvidence: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresManualApproval: true,
      requiresReleaseExitBeforeMetadataWrite: true,
    }))
    expect(chain.reviewPackage.requiredReviewerActions).toEqual(expect.arrayContaining([
      'review_live_replay_annotation_candidates_before_replay_release',
    ]))
    expect(chain.blockingReasons).toEqual(expect.arrayContaining([
      'manual_annotation_gap_closure_required',
      'live_replay_trust_gate_not_ready',
    ]))

    const savedManifest = JSON.parse(readFileSync(chain.manifestFile, 'utf8'))
    expect(savedManifest.liveReplayAnnotationReviewPackage.annotationCandidateCount).toBe(1)
  })
})
