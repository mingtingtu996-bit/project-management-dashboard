import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmReplaySamplesFromTaskActuals,
  buildT2RhythmTemplateReplayEvidence,
  type T2RhythmReplayTaskActualRow,
  type T2RhythmTemplateReplayEvidenceResult,
  type T2RhythmTemplateReplayEvidenceSample,
} from './t2RhythmTemplateReplayEvidenceService.js'

export type T2RhythmTaskWindowAnnotationReplayReadinessInput = {
  projectId: string
  templateId: string
  candidatePackage: T2RhythmScheduleCandidatePackage
  taskRows: T2RhythmReplayTaskActualRow[]
  releaseRecordTarget?: string | null
  rollbackTarget?: string | null
}

export type T2RhythmTaskWindowAnnotationReplayReadinessResult = {
  source: 't2_task_window_annotation_replay_readiness'
  status: 'ready_for_shadow_replay' | 'data_collection_open' | 'candidate_conflict'
  projectId: string
  templateId: string
  taskRowsRead: number
  approvedMetadataRowCount: number
  replaySampleCount: number
  rejectedRowCount: number
  replaySamples: T2RhythmTemplateReplayEvidenceSample[]
  evidence: T2RhythmTemplateReplayEvidenceResult
  postAnnotationReplayCoverage: {
    source: 't2_post_annotation_duration_bearing_window_coverage'
    status: 'pass' | 'fail'
    minimumSamplesPerDurationBearingWindow: number
    minimumDistinctWorkfacesPerDurationBearingWindow: number
    requiredDurationBearingWindowCount: number
    coveredDurationBearingWindowCount: number
    requiredWindowCodes: string[]
    coveredWindowCodes: string[]
    missingWindowCodes: string[]
    sampleCountByWindowCode: Record<string, number>
    distinctWorkfaceCountByWindowCode: Record<string, number>
    underSampledWindowCodes: string[]
    underDiverseWorkfaceWindowCodes: string[]
    reasonCodes: string[]
  }
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  canFeedReplayEvidenceAfterNextDiagnostic: boolean
  blockingReasons: string[]
  writesStandardTaskMetadata: false
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  governance: {
    readerOnly: true
    directSeedMutationAllowed: false
    writesTaskDependencies: false
    writesPlanDates: false
    requiresL5Publication: true
  }
}

const MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW = 2
const MINIMUM_DISTINCT_WORKFACES_PER_DURATION_BEARING_WINDOW = 3

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return false
}

function readTaskMetadata(row: T2RhythmReplayTaskActualRow) {
  return {
    ...readRecord(row.metadata),
    ...readRecord(row.standard_task_metadata),
    ...readRecord(row.standardTaskMetadata),
  }
}

function hasApprovedT2Annotation(row: T2RhythmReplayTaskActualRow) {
  const metadata = readTaskMetadata(row)
  return readBoolean(metadata.t2RhythmAnnotationApproved)
    && readBoolean(metadata.t2RhythmCanFeedReplayAfterNextDiagnostic)
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function buildPostAnnotationReplayCoverage(
  candidatePackage: T2RhythmScheduleCandidatePackage,
  samples: T2RhythmTemplateReplayEvidenceSample[],
): T2RhythmTaskWindowAnnotationReplayReadinessResult['postAnnotationReplayCoverage'] {
  const requiredWindowCodes = candidatePackage.packageWindows
    .filter((window) => window.durationBearing)
    .map((window) => window.windowCode)
  const requiredWindowCodeSet = new Set(requiredWindowCodes)
  const sampleCountByWindowCode: Record<string, number> = Object.fromEntries(
    requiredWindowCodes.map((windowCode) => [windowCode, 0]),
  )
  const workfacesByWindowCode: Record<string, Set<string>> = Object.fromEntries(
    requiredWindowCodes.map((windowCode) => [windowCode, new Set<string>()]),
  )

  for (const sample of samples) {
    if (!requiredWindowCodeSet.has(sample.windowCode)) continue
    sampleCountByWindowCode[sample.windowCode] = (sampleCountByWindowCode[sample.windowCode] ?? 0) + 1
    const workfaceKey = normalizeText(sample.workfaceKey)
    if (workfaceKey) workfacesByWindowCode[sample.windowCode]?.add(workfaceKey)
  }

  const distinctWorkfaceCountByWindowCode: Record<string, number> = Object.fromEntries(
    requiredWindowCodes.map((windowCode) => [windowCode, workfacesByWindowCode[windowCode]?.size ?? 0]),
  )
  const coveredWindowCodes = requiredWindowCodes.filter((windowCode) => (sampleCountByWindowCode[windowCode] ?? 0) > 0)
  const missingWindowCodes = requiredWindowCodes.filter((windowCode) => (sampleCountByWindowCode[windowCode] ?? 0) < 1)
  const underSampledWindowCodes = requiredWindowCodes
    .filter((windowCode) => {
      const sampleCount = sampleCountByWindowCode[windowCode] ?? 0
      return sampleCount > 0 && sampleCount < MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW
    })
  const underDiverseWorkfaceWindowCodes = requiredWindowCodes
    .filter((windowCode) => {
      const sampleCount = sampleCountByWindowCode[windowCode] ?? 0
      if (sampleCount < MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW) return false
      return (distinctWorkfaceCountByWindowCode[windowCode] ?? 0) < MINIMUM_DISTINCT_WORKFACES_PER_DURATION_BEARING_WINDOW
    })
  const reasonCodes = unique([
    missingWindowCodes.length > 0 ? 'duration_bearing_window_replay_coverage_missing' : '',
    underSampledWindowCodes.length > 0 ? 'duration_bearing_window_replay_sample_depth_missing' : '',
    underDiverseWorkfaceWindowCodes.length > 0 ? 'duration_bearing_window_replay_workface_diversity_missing' : '',
  ])

  return {
    source: 't2_post_annotation_duration_bearing_window_coverage',
    status: reasonCodes.length === 0 ? 'pass' : 'fail',
    minimumSamplesPerDurationBearingWindow: MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW,
    minimumDistinctWorkfacesPerDurationBearingWindow: MINIMUM_DISTINCT_WORKFACES_PER_DURATION_BEARING_WINDOW,
    requiredDurationBearingWindowCount: requiredWindowCodes.length,
    coveredDurationBearingWindowCount: coveredWindowCodes.length,
    requiredWindowCodes,
    coveredWindowCodes,
    missingWindowCodes,
    sampleCountByWindowCode,
    distinctWorkfaceCountByWindowCode,
    underSampledWindowCodes,
    underDiverseWorkfaceWindowCodes,
    reasonCodes,
  }
}

export function buildT2RhythmTaskWindowAnnotationReplayReadiness(
  input: T2RhythmTaskWindowAnnotationReplayReadinessInput,
): T2RhythmTaskWindowAnnotationReplayReadinessResult {
  const approvedRows = input.taskRows.filter(hasApprovedT2Annotation)
  const adapter = buildT2RhythmReplaySamplesFromTaskActuals({
    candidatePackage: input.candidatePackage,
    tasks: approvedRows,
  })
  const evidence = buildT2RhythmTemplateReplayEvidence({
    templateId: input.templateId,
    samples: adapter.samples,
  })
  const postAnnotationReplayCoverage = buildPostAnnotationReplayCoverage(input.candidatePackage, adapter.samples)
  const candidateConflict = input.candidatePackage.status === 'candidate_conflict'
    || input.candidatePackage.compatibility.status === 'candidate_conflict'
  const blockingReasons = unique([
    candidateConflict ? 'candidate_package_conflict' : '',
    approvedRows.length > 0 ? '' : 'no_approved_t2_annotation_metadata',
    adapter.samples.length > 0 ? '' : 'no_t2_replay_samples',
    ...adapter.rejectedRows.map((row) => row.reasonCode),
    ...evidence.acceptance.blockingReasons,
    ...postAnnotationReplayCoverage.reasonCodes,
    evidence.acceptance.readyForShadow ? '' : 'shadow_replay_not_ready',
    postAnnotationReplayCoverage.status === 'pass' ? '' : 'post_annotation_replay_coverage_not_ready',
  ])
  const canFeedReplayEvidenceAfterNextDiagnostic = !candidateConflict
    && evidence.acceptance.readyForShadow
    && adapter.samples.length > 0
    && postAnnotationReplayCoverage.status === 'pass'
  const status = candidateConflict
    ? 'candidate_conflict'
    : canFeedReplayEvidenceAfterNextDiagnostic
      ? 'ready_for_shadow_replay'
      : 'data_collection_open'

  return {
    source: 't2_task_window_annotation_replay_readiness',
    status,
    projectId: normalizeText(input.projectId),
    templateId: normalizeText(input.templateId),
    taskRowsRead: input.taskRows.length,
    approvedMetadataRowCount: approvedRows.length,
    replaySampleCount: adapter.samples.length,
    rejectedRowCount: adapter.rejectedRows.length,
    replaySamples: adapter.samples,
    evidence,
    postAnnotationReplayCoverage,
    releaseRecordTarget: normalizeText(input.releaseRecordTarget) || null,
    rollbackTarget: normalizeText(input.rollbackTarget) || null,
    canFeedReplayEvidenceAfterNextDiagnostic,
    blockingReasons,
    writesStandardTaskMetadata: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    governance: {
      readerOnly: true,
      directSeedMutationAllowed: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresL5Publication: true,
    },
  }
}
