import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactIfRequested,
} from '../scripts/generate-t2-rhythm-release-closure.js'
import {
  verifyT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested,
} from '../scripts/verify-t2-rhythm-release-closure-artifact.js'
import {
  buildT2RhythmManualReleaseReviewPreflight,
  shouldFailT2RhythmManualReleaseReviewPreflight,
  writeT2RhythmManualReleaseReviewPreflightIfRequested,
} from '../scripts/preflight-t2-rhythm-release-review.js'
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

function buildVerifiedArtifactFixture() {
  const dir = mkdtempSync(join(tmpdir(), 't2-release-preflight-'))
  const liveReplayEvidenceFile = join(dir, 'live-replay.json')
  const phase1SelectionGateFile = join(dir, 'phase1-selector.json')
  const l5ReleaseGateFile = join(dir, 'l5-release.json')
  const artifactFile = join(dir, 'release-closure.json')
  const verificationFile = join(dir, 'release-closure-verification.json')
  const preflightFile = join(dir, 'release-review-preflight.json')

  writeJson(liveReplayEvidenceFile, {
    releaseEvidenceInput: buildPassingLiveReplayReleaseEvidenceInput(),
  })
  writeJson(phase1SelectionGateFile, {
    phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
  })
  writeJson(l5ReleaseGateFile, {
    l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
  })

  const artifact = buildT2RhythmReleaseClosureArtifact({
    reportId: 't2-release-closure-artifact-current',
    generatedAt: '2026-06-23T13:45:00.000Z',
    liveReplayEvidenceFile,
    phase1SelectionGateFile,
    l5ReleaseGateFile,
    outputFile: artifactFile,
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
  writeT2RhythmReleaseClosureArtifactIfRequested(artifact)

  const verification = verifyT2RhythmReleaseClosureArtifact({
    artifactFile,
    outputFile: verificationFile,
  })
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested(verification)

  return {
    artifactFile,
    verificationFile,
    preflightFile,
  }
}

describe('preflight-t2-rhythm-release-review', () => {
  it('marks a verified artifact ready for manual release review without opening runtime writers', () => {
    const fixture = buildVerifiedArtifactFixture()
    const preflight = buildT2RhythmManualReleaseReviewPreflight({
      artifactFile: fixture.artifactFile,
      verificationFile: fixture.verificationFile,
      outputFile: fixture.preflightFile,
    })
    writeT2RhythmManualReleaseReviewPreflightIfRequested(preflight)

    expect(preflight).toEqual(expect.objectContaining({
      preflightCode: 'c19_t2_rhythm_manual_release_review_preflight',
      status: 'ready_for_manual_release_review',
      artifactFile: fixture.artifactFile,
      verificationFile: fixture.verificationFile,
    }))
    expect(preflight.checks).toEqual(expect.objectContaining({
      artifactVerified: true,
      releaseEvidenceClosureReady: true,
      allRequiredEvidenceGatesReady: true,
      manualApprovalGatePresent: true,
      sourceEvidenceRefsVerified: true,
      runtimeWritersClosed: true,
      sourceFilesDigestVerified: true,
      standardLibrarySnapshotVerified: true,
    }))
    expect(preflight.reviewPackage).toEqual(expect.objectContaining({
      packageType: 't2_manual_release_review_preflight',
      canProceedToManualReview: true,
      canAutoPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      requiredReviewerActions: expect.arrayContaining([
        'review_release_closure_artifact',
        'approve_or_reject_l5_canary_handoff',
        'confirm_domain_writer_runtime_publication_remains_disabled',
      ]),
    }))
    expect(preflight.blockingReasons).toEqual([])
    expect(preflight.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
    expect(shouldFailT2RhythmManualReleaseReviewPreflight(preflight)).toBe(false)
    const saved = JSON.parse(readFileSync(fixture.preflightFile, 'utf8'))
    expect(saved.status).toBe('ready_for_manual_release_review')
  })

  it('blocks manual release review when the artifact verification failed', () => {
    const fixture = buildVerifiedArtifactFixture()
    const failedVerification = JSON.parse(readFileSync(fixture.verificationFile, 'utf8'))
    failedVerification.status = 'fail'
    failedVerification.blockingReasons = ['release_closure_input_digest_mismatch']
    writeJson(fixture.verificationFile, failedVerification)

    const preflight = buildT2RhythmManualReleaseReviewPreflight({
      artifactFile: fixture.artifactFile,
      verificationFile: fixture.verificationFile,
    })

    expect(preflight.status).toBe('blocked')
    expect(preflight.checks.artifactVerified).toBe(false)
    expect(preflight.blockingReasons).toEqual(expect.arrayContaining([
      'release_closure_input_digest_mismatch',
      'release_closure_artifact_verification_required',
    ]))
    expect(preflight.reviewPackage.canProceedToManualReview).toBe(false)
    expect(shouldFailT2RhythmManualReleaseReviewPreflight(preflight)).toBe(true)
  })

  it('blocks manual release review when runtime writers are opened in the artifact', () => {
    const fixture = buildVerifiedArtifactFixture()
    const artifact = JSON.parse(readFileSync(fixture.artifactFile, 'utf8'))
    artifact.mutationBoundary.writesRuntimePublications = true
    artifact.publicationDecision.canAutoPublishRuntimeExperience = true
    writeJson(fixture.artifactFile, artifact)

    const preflight = buildT2RhythmManualReleaseReviewPreflight({
      artifactFile: fixture.artifactFile,
      verificationFile: fixture.verificationFile,
    })

    expect(preflight.status).toBe('blocked')
    expect(preflight.checks.runtimeWritersClosed).toBe(false)
    expect(preflight.blockingReasons).toEqual(expect.arrayContaining([
      'release_review_runtime_writers_must_remain_closed',
    ]))
    expect(preflight.reviewPackage.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('blocks manual release review when source evidence refs are not verified', () => {
    const fixture = buildVerifiedArtifactFixture()
    const verification = JSON.parse(readFileSync(fixture.verificationFile, 'utf8'))
    verification.checks.sourceEvidenceRefsMatch = false
    verification.blockingReasons = [...verification.blockingReasons, 'release_closure_source_evidence_refs_mismatch']
    verification.status = 'fail'
    writeJson(fixture.verificationFile, verification)

    const preflight = buildT2RhythmManualReleaseReviewPreflight({
      artifactFile: fixture.artifactFile,
      verificationFile: fixture.verificationFile,
    })

    expect(preflight.status).toBe('blocked')
    expect(preflight.checks.sourceEvidenceRefsVerified).toBe(false)
    expect(preflight.blockingReasons).toEqual(expect.arrayContaining([
      'release_review_source_evidence_refs_verification_required',
    ]))
  })
})
