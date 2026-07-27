import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmReleaseClosureArtifact,
  shouldFailT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactIfRequested,
} from '../scripts/generate-t2-rhythm-release-closure.js'
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

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
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

describe('generate-t2-rhythm-release-closure', () => {
  it('writes a manual publication candidate artifact from archived evidence files', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2-release-closure-'))
    const liveReplayEvidenceFile = join(dir, 'live-replay.json')
    const phase1SelectionGateFile = join(dir, 'phase1-selector.json')
    const l5ReleaseGateFile = join(dir, 'l5-release.json')
    const outputFile = join(dir, 'release-closure.json')

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
      generatedAt: '2026-06-23T13:20:00.000Z',
      liveReplayEvidenceFile,
      phase1SelectionGateFile,
      l5ReleaseGateFile,
      outputFile,
      ...residentialSelection,
    })
    writeT2RhythmReleaseClosureArtifactIfRequested(artifact)

    expect(artifact.status).toBe('manual_publication_candidate_ready')
    expect(artifact.outputFile).toBe(outputFile)
    expect(artifact.sourceFiles).toEqual({
      liveReplayEvidenceFile,
      phase1SelectionGateFile,
      l5ReleaseGateFile,
    })
    expect(artifact.sourceEvidenceRefs).toEqual(expect.arrayContaining([
      'artifact:t2-live-replay-current.json',
      'artifact:c19-13-phase1-selector-replay.json',
      'artifact:t2-release-exit.md',
      'artifact:t2-canary-plan.md',
      'artifact:t2-consumer-verification.md',
      'artifact:t2-impact-monitoring.md',
      'artifact:t2-rollback-target.md',
      'artifact:t2-rollback-drill.md',
    ]))
    expect(artifact.provenance).toEqual(expect.objectContaining({
      source: 't2_rhythm_release_closure_artifact_provenance',
      sourceFileCoverageStatus: 'ready',
      missingSourceFileRoles: [],
    }))
    expect(artifact.provenance.inputFileDigests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'archived_live_replay',
        path: liveReplayEvidenceFile,
        sha256: sha256File(liveReplayEvidenceFile),
      }),
      expect.objectContaining({
        role: 'c19_13_phase1_multinetwork_selection',
        path: phase1SelectionGateFile,
        sha256: sha256File(phase1SelectionGateFile),
      }),
      expect.objectContaining({
        role: 'l5_canary_handoff',
        path: l5ReleaseGateFile,
        sha256: sha256File(l5ReleaseGateFile),
      }),
    ]))
    expect(artifact.provenance.standardLibrarySnapshot).toEqual(expect.objectContaining({
      seedVersion: 'v1.4.23.1-t2-division-rhythm-cold-start-20260622',
      templateCount: 196,
      systemBusinessTypeCoverageStatus: 'ready',
      standardLibraryThicknessCoverageStatus: 'ready',
      systemBusinessTypeCoverageRate: 1,
      standardLibraryThicknessCoverageRate: 1,
    }))
    expect(artifact.report.releaseAutomationGate).toEqual(expect.objectContaining({
      status: 'ready_for_manual_publication_artifact',
      canEmitReleaseArtifact: true,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
    }))
    expect(shouldFailT2RhythmReleaseClosureArtifact(artifact)).toBe(false)
    expect(existsSync(outputFile)).toBe(true)
    const saved = JSON.parse(readFileSync(outputFile, 'utf8'))
    expect(saved.status).toBe('manual_publication_candidate_ready')
    expect(saved.provenance.inputFileDigests).toHaveLength(3)
    expect(saved.sourceEvidenceRefs).toEqual(artifact.sourceEvidenceRefs)
    expect(saved.report.releaseEvidenceClosure.status).toBe('ready_not_publishable')
    expect(saved.report.releaseEvidenceRefs).toEqual(expect.arrayContaining([
      'artifact:t2-live-replay-current.json',
      'artifact:c19-13-phase1-selector-replay.json',
      'artifact:t2-release-exit.md',
      'artifact:t2-rollback-drill.md',
    ]))
  })

  it('writes a blocked artifact when archived live replay input cannot feed release closure', () => {
    const dir = mkdtempSync(join(tmpdir(), 't2-release-closure-blocked-'))
    const liveReplayEvidenceFile = join(dir, 'live-replay.json')
    const phase1SelectionGateFile = join(dir, 'phase1-selector.json')
    const l5ReleaseGateFile = join(dir, 'l5-release.json')
    const outputFile = join(dir, 'release-closure-blocked.json')

    writeJson(liveReplayEvidenceFile, {
      releaseEvidenceInput: {
        ...buildPassingLiveReplayReleaseEvidenceInput(),
        evidenceRefs: [],
        canFeedReleaseEvidenceClosure: false,
        blockingReasons: ['missing_evidence_metadata', 'release_evidence_ref_required'],
      },
    })
    writeJson(phase1SelectionGateFile, {
      phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
    })
    writeJson(l5ReleaseGateFile, {
      l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
    })

    const artifact = buildT2RhythmReleaseClosureArtifact({
      liveReplayEvidenceFile,
      phase1SelectionGateFile,
      l5ReleaseGateFile,
      outputFile,
      ...residentialSelection,
    })
    writeT2RhythmReleaseClosureArtifactIfRequested(artifact)

    expect(artifact.status).toBe('blocked')
    expect(artifact.report.releaseAutomationGate).toEqual(expect.objectContaining({
      status: 'blocked',
      canEmitReleaseArtifact: false,
      blockingReasons: expect.arrayContaining([
        'missing_evidence_metadata',
        'release_evidence_ref_required',
      ]),
    }))
    expect(artifact.report.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
    expect(shouldFailT2RhythmReleaseClosureArtifact(artifact)).toBe(true)
    const saved = JSON.parse(readFileSync(outputFile, 'utf8'))
    expect(saved.status).toBe('blocked')
    expect(saved.report.releaseAutomationGate.blockingReasons).toEqual(expect.arrayContaining([
      'missing_evidence_metadata',
      'release_evidence_ref_required',
    ]))
  })

  it('blocks a ready closure when archived source files are not attached to the artifact', () => {
    const outputFile = join(mkdtempSync(join(tmpdir(), 't2-release-closure-memory-')), 'release-closure.json')

    const artifact = buildT2RhythmReleaseClosureArtifact({
      outputFile,
      liveReplayReleaseEvidenceInput: buildPassingLiveReplayReleaseEvidenceInput(),
      phase1MultiNetworkSelectionTrustGate: buildPassingPhase1MultiNetworkSelectionTrustGate(),
      l5ReleaseGate: buildPassingL5CanaryHandoffGate(),
      ...residentialSelection,
    })

    expect(artifact.report.releaseEvidenceClosure.status).toBe('ready_not_publishable')
    expect(artifact.status).toBe('blocked')
    expect(artifact.provenance).toEqual(expect.objectContaining({
      sourceFileCoverageStatus: 'blocked',
      missingSourceFileRoles: expect.arrayContaining([
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ]),
      inputFileDigests: [],
    }))
    expect(artifact.publicationDecision).toEqual(expect.objectContaining({
      canEmitReleaseArtifact: false,
      blockingReasons: expect.arrayContaining([
        'release_closure_source_files_required',
      ]),
    }))
    expect(shouldFailT2RhythmReleaseClosureArtifact(artifact)).toBe(true)
  })
})
