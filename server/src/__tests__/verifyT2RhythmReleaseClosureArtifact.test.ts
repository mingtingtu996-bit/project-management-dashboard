import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactIfRequested,
} from '../scripts/generate-t2-rhythm-release-closure.js'
import {
  shouldFailT2RhythmReleaseClosureArtifactVerification,
  verifyT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested,
} from '../scripts/verify-t2-rhythm-release-closure-artifact.js'
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

function buildReadyArtifactFixture() {
  const dir = mkdtempSync(join(tmpdir(), 't2-release-closure-verify-'))
  const liveReplayEvidenceFile = join(dir, 'live-replay.json')
  const phase1SelectionGateFile = join(dir, 'phase1-selector.json')
  const l5ReleaseGateFile = join(dir, 'l5-release.json')
  const artifactFile = join(dir, 'release-closure.json')
  const verificationOutputFile = join(dir, 'release-closure-verification.json')

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
    generatedAt: '2026-06-23T13:35:00.000Z',
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

  return {
    dir,
    artifact,
    artifactFile,
    liveReplayEvidenceFile,
    verificationOutputFile,
  }
}

describe('verify-t2-rhythm-release-closure-artifact', () => {
  it('passes a current artifact whose source file digests and standard-library snapshot still match', () => {
    const fixture = buildReadyArtifactFixture()
    const verification = verifyT2RhythmReleaseClosureArtifact({
      artifactFile: fixture.artifactFile,
      outputFile: fixture.verificationOutputFile,
    })
    writeT2RhythmReleaseClosureArtifactVerificationIfRequested(verification)

    expect(verification).toEqual(expect.objectContaining({
      verificationCode: 'c19_t2_rhythm_release_closure_artifact_verification',
      status: 'pass',
      artifactFile: fixture.artifactFile,
    }))
    expect(verification.checks).toEqual(expect.objectContaining({
      artifactStatusReady: true,
      publicationDecisionReady: true,
      inputDigestsMatch: true,
      standardLibrarySnapshotCurrent: true,
      sourceEvidenceRefsMatch: true,
      noRuntimeWriteBoundary: true,
      manualApprovalStillRequired: true,
    }))
    expect(verification.blockingReasons).toEqual([])
    expect(shouldFailT2RhythmReleaseClosureArtifactVerification(verification)).toBe(false)
    expect(existsSync(fixture.verificationOutputFile)).toBe(true)
    const saved = JSON.parse(readFileSync(fixture.verificationOutputFile, 'utf8'))
    expect(saved.status).toBe('pass')
  })

  it('fails when an archived evidence file is changed after the artifact was generated', () => {
    const fixture = buildReadyArtifactFixture()
    writeJson(fixture.liveReplayEvidenceFile, {
      releaseEvidenceInput: {
        ...buildPassingLiveReplayReleaseEvidenceInput(),
        evidenceRefs: ['artifact:t2-live-replay-tampered.json'],
      },
    })

    const verification = verifyT2RhythmReleaseClosureArtifact({
      artifactFile: fixture.artifactFile,
    })

    expect(verification.status).toBe('fail')
    expect(verification.checks.inputDigestsMatch).toBe(false)
    expect(verification.digestMismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'archived_live_replay',
        path: fixture.liveReplayEvidenceFile,
      }),
    ]))
    expect(verification.blockingReasons).toEqual(expect.arrayContaining([
      'release_closure_input_digest_mismatch',
    ]))
    expect(shouldFailT2RhythmReleaseClosureArtifactVerification(verification)).toBe(true)
  })

  it('fails when the artifact standard-library snapshot is stale', () => {
    const fixture = buildReadyArtifactFixture()
    const staleArtifact = JSON.parse(readFileSync(fixture.artifactFile, 'utf8'))
    staleArtifact.provenance.standardLibrarySnapshot.templateCount = 195
    staleArtifact.provenance.standardLibrarySnapshot.seedVersion = 'stale-t2-seed'
    writeJson(fixture.artifactFile, staleArtifact)

    const verification = verifyT2RhythmReleaseClosureArtifact({
      artifactFile: fixture.artifactFile,
    })

    expect(verification.status).toBe('fail')
    expect(verification.checks.standardLibrarySnapshotCurrent).toBe(false)
    expect(verification.standardLibrarySnapshotMismatches).toEqual(expect.arrayContaining([
      'seed_version_mismatch',
      'template_count_mismatch',
    ]))
    expect(verification.blockingReasons).toEqual(expect.arrayContaining([
      'release_closure_standard_library_snapshot_stale',
    ]))
  })

  it('fails when source evidence refs diverge from release evidence refs', () => {
    const fixture = buildReadyArtifactFixture()
    const staleArtifact = JSON.parse(readFileSync(fixture.artifactFile, 'utf8'))
    staleArtifact.sourceEvidenceRefs = ['artifact:t2-live-replay-current.json', 'artifact:t2-extra-source']
    writeJson(fixture.artifactFile, staleArtifact)

    const verification = verifyT2RhythmReleaseClosureArtifact({
      artifactFile: fixture.artifactFile,
    })

    expect(verification.status).toBe('fail')
    expect(verification.checks.sourceEvidenceRefsMatch).toBe(false)
    expect(verification.blockingReasons).toEqual(expect.arrayContaining([
      'release_closure_source_evidence_refs_mismatch',
    ]))
  })
})
