import { describe, expect, it } from 'vitest'

import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

const readyReplayGateInput = {
  status: 'pass' as const,
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
    status: 'pass' as const,
    reasonCodes: [],
  },
  annotationGapClosure: {
    manualAnnotationCandidateCount: 0,
    annotationGapCount: 0,
    reasonCodes: [],
  },
  checks: {
    readiness: {
      status: 'pass' as const,
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
}

describe('t2RhythmStandardLibraryTrustGateService', () => {
  it('allows real-schedule calibration only when archived live shadow replay evidence is complete', () => {
    const gate = evaluateT2RhythmStandardLibraryTrustGate(readyReplayGateInput)

    expect(gate).toEqual(expect.objectContaining({
      source: 't2_rhythm_standard_library_live_replay_trust_gate',
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      canEnterC1913Phase1Selection: true,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'archived_live_shadow_replay_only',
      blockingReasons: [],
      passedGateCodes: expect.arrayContaining([
        'archived_json_present',
        'live_evidence_metadata_present',
        'readiness_pass',
        't2_replay_sample_available',
        'duration_bearing_window_replay_coverage_passed',
        'shadow_replay_acceptance_passed',
      ]),
      releaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
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

  it('blocks C-19.13 trust when replay samples or annotation gap closure are missing', () => {
    const gate = evaluateT2RhythmStandardLibraryTrustGate({
      ...readyReplayGateInput,
      status: 'fail',
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
        ...readyReplayGateInput.checks,
        taskActualReplay: {
          readyForShadow: false,
          reasonCodes: [
            'live_rows_without_t2_window_metadata',
            'no_t2_replay_samples',
          ],
        },
      },
    })

    expect(gate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining([
        'live_rows_without_t2_window_metadata',
        'no_t2_replay_samples',
        'remaining_annotation_gaps',
        'usable_live_replay_samples_required',
        'duration_bearing_window_replay_coverage_missing',
        'duration_bearing_window_replay_coverage_required',
      ]),
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'usable_live_replay_samples_required',
        'manual_annotation_gap_closure_required',
        'duration_bearing_window_replay_coverage_required',
        'l5_canary_publish_rollback_required',
      ]),
    }))
  })

  it('blocks C-19.13 trust when duration-bearing replay windows do not have enough per-window samples', () => {
    const gate = evaluateT2RhythmStandardLibraryTrustGate({
      ...readyReplayGateInput,
      status: 'fail',
      replayCoverage: {
        status: 'fail',
        reasonCodes: ['duration_bearing_window_replay_sample_depth_missing'],
      },
    })

    expect(gate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining([
        'duration_bearing_window_replay_sample_depth_missing',
        'duration_bearing_window_replay_coverage_required',
      ]),
      releaseBlockers: expect.arrayContaining([
        'duration_bearing_window_replay_sample_depth_required',
      ]),
    }))
  })

  it('blocks C-19.13 trust when duration-bearing replay windows do not have enough workface diversity', () => {
    const gate = evaluateT2RhythmStandardLibraryTrustGate({
      ...readyReplayGateInput,
      status: 'fail',
      replayCoverage: {
        status: 'fail',
        reasonCodes: ['duration_bearing_window_replay_workface_diversity_missing'],
      },
    })

    expect(gate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining([
        'duration_bearing_window_replay_workface_diversity_missing',
        'duration_bearing_window_replay_coverage_required',
      ]),
      releaseBlockers: expect.arrayContaining([
        'duration_bearing_window_replay_workface_diversity_required',
      ]),
    }))
  })

  it('keeps workface diversity blocked alongside sample depth and coverage blockers when replay coverage is thin', () => {
    const gate = evaluateT2RhythmStandardLibraryTrustGate({
      ...readyReplayGateInput,
      status: 'fail',
      replayCoverage: {
        status: 'fail',
        reasonCodes: [
          'duration_bearing_window_replay_coverage_missing',
          'duration_bearing_window_replay_sample_depth_missing',
          'duration_bearing_window_replay_workface_diversity_missing',
        ],
      },
    })

    expect(gate.releaseBlockers).toEqual(expect.arrayContaining([
      'duration_bearing_window_replay_coverage_required',
      'duration_bearing_window_replay_sample_depth_required',
      'duration_bearing_window_replay_workface_diversity_required',
    ]))
    expect(gate.blockingReasons).toEqual(expect.arrayContaining([
      'duration_bearing_window_replay_coverage_missing',
      'duration_bearing_window_replay_sample_depth_missing',
      'duration_bearing_window_replay_workface_diversity_missing',
    ]))
    expect(gate.canTrustForRealScheduleCalibration).toBe(false)
    expect(gate.canEnterC1913Phase1Selection).toBe(false)
  })
})
