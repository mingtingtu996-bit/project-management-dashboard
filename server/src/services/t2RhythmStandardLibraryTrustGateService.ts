export type T2RhythmStandardLibraryTrustGate = {
  source: 't2_rhythm_standard_library_live_replay_trust_gate'
  status: 'shadow_replay_ready_not_publishable' | 'not_trustworthy_for_real_schedule'
  canTrustForRealScheduleCalibration: boolean
  canEnterC1913Phase1Selection: boolean
  canAutoMaterializeTaskDependencies: false
  canAutoPublishRuntimeExperience: false
  trustBoundary: 'archived_live_shadow_replay_only' | 'blocked_live_replay_evidence'
  passedGateCodes: string[]
  blockingReasons: string[]
  selectedTemplateIds?: string[]
  releaseBlockers: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmStandardLibraryTrustGateInput = {
  status: 'blocked' | 'pass' | 'fail'
  selectedTemplateIds?: string[]
  missingArchivedJson: boolean
  evidenceMetadata: {
    missingEvidenceMetadata: boolean
  }
  sampleAvailability: {
    totalUsableSampleCount: number
    totalLiveRowsWithoutT2WindowMetadata: number
    reasonCodes: string[]
  }
  replayCoverage: {
    status: 'blocked' | 'pass' | 'fail'
    reasonCodes: string[]
  }
  annotationGapClosure?: {
    manualAnnotationCandidateCount: number
    annotationGapCount: number
    reasonCodes: string[]
  } | null
  checks: {
    readiness: {
      status: 'blocked' | 'pass' | 'fail'
      reasonCodes: string[]
    }
    taskActualReplay: {
      readyForShadow: boolean
      reasonCodes: string[]
    }
    durationExperienceReplay: {
      readyForShadow: boolean
      reasonCodes: string[]
    }
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function trustGateMutationBoundary(): T2RhythmStandardLibraryTrustGate['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function replayCoverageReleaseBlockers(report: T2RhythmStandardLibraryTrustGateInput) {
  if (report.replayCoverage.status === 'pass') return []
  const reasonCodes = new Set(report.replayCoverage.reasonCodes)
  return unique([
    'duration_bearing_window_replay_coverage_required',
    reasonCodes.has('duration_bearing_window_replay_sample_depth_missing')
      ? 'duration_bearing_window_replay_sample_depth_required'
      : '',
    reasonCodes.has('duration_bearing_window_replay_workface_diversity_missing')
      ? 'duration_bearing_window_replay_workface_diversity_required'
      : '',
  ])
}

export function evaluateT2RhythmStandardLibraryTrustGate(
  report: T2RhythmStandardLibraryTrustGateInput,
): T2RhythmStandardLibraryTrustGate {
  const passedGateCodes = unique([
    report.missingArchivedJson ? '' : 'archived_json_present',
    report.evidenceMetadata.missingEvidenceMetadata ? '' : 'live_evidence_metadata_present',
    report.checks.readiness.status === 'pass' ? 'readiness_pass' : '',
    report.sampleAvailability.totalUsableSampleCount > 0 ? 't2_replay_sample_available' : '',
    report.replayCoverage.status === 'pass' ? 'duration_bearing_window_replay_coverage_passed' : '',
    report.checks.taskActualReplay.readyForShadow || report.checks.durationExperienceReplay.readyForShadow
      ? 'shadow_replay_acceptance_passed'
      : '',
  ])
  const blockingReasons = unique([
    report.missingArchivedJson ? 'missing_archived_json' : '',
    report.evidenceMetadata.missingEvidenceMetadata ? 'missing_evidence_metadata' : '',
    report.checks.readiness.status === 'pass' ? '' : 'readiness_not_pass',
    ...report.checks.readiness.reasonCodes,
    ...report.sampleAvailability.reasonCodes,
    ...report.replayCoverage.reasonCodes,
    ...report.checks.taskActualReplay.reasonCodes,
    ...report.checks.durationExperienceReplay.reasonCodes,
    ...(report.annotationGapClosure?.reasonCodes ?? []),
    report.sampleAvailability.totalUsableSampleCount > 0 ? '' : 'usable_live_replay_samples_required',
    report.replayCoverage.status !== 'pass' ? 'duration_bearing_window_replay_coverage_required' : '',
  ])
  const shadowReplayReady = report.status === 'pass'
    && !report.missingArchivedJson
    && !report.evidenceMetadata.missingEvidenceMetadata
    && report.checks.readiness.status === 'pass'
    && report.sampleAvailability.totalUsableSampleCount > 0
    && report.replayCoverage.status === 'pass'
    && (report.checks.taskActualReplay.readyForShadow || report.checks.durationExperienceReplay.readyForShadow)

  return {
    source: 't2_rhythm_standard_library_live_replay_trust_gate',
    status: shadowReplayReady ? 'shadow_replay_ready_not_publishable' : 'not_trustworthy_for_real_schedule',
    canTrustForRealScheduleCalibration: shadowReplayReady,
    canEnterC1913Phase1Selection: shadowReplayReady,
    canAutoMaterializeTaskDependencies: false,
    canAutoPublishRuntimeExperience: false,
    trustBoundary: shadowReplayReady ? 'archived_live_shadow_replay_only' : 'blocked_live_replay_evidence',
    passedGateCodes,
    blockingReasons: shadowReplayReady ? [] : blockingReasons,
    selectedTemplateIds: unique(report.selectedTemplateIds ?? []),
    releaseBlockers: shadowReplayReady
      ? [
          'l5_canary_publish_rollback_required',
          'c19_13_phase1_multinetwork_selection_required',
          'manual_publication_approval_required',
        ]
      : unique([
          'archived_live_replay_required',
          report.sampleAvailability.totalUsableSampleCount > 0 ? '' : 'usable_live_replay_samples_required',
          report.annotationGapClosure?.manualAnnotationCandidateCount
            || report.annotationGapClosure?.annotationGapCount
            || report.sampleAvailability.totalLiveRowsWithoutT2WindowMetadata
            ? 'manual_annotation_gap_closure_required'
            : '',
          report.replayCoverage.status !== 'pass'
            ? replayCoverageReleaseBlockers(report)
            : [],
          'l5_canary_publish_rollback_required',
        ].flat()),
    mutationBoundary: trustGateMutationBoundary(),
  }
}
