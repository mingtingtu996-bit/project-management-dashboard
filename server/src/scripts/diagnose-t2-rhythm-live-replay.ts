import { writeJsonFile } from './jsonEvidenceUtils.js'

import {
  buildT2RhythmScheduleCandidatePackage,
  type T2RhythmScheduleCandidatePackage,
  type T2RhythmTemplateSelectionInput,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmTaskActualReplayEvidence,
  createT2RhythmTaskActualSupabaseReader,
} from '../services/t2RhythmTaskActualReplayReadModelService.js'
import type {
  T2RhythmReplayTaskActualRow,
  T2RhythmTemplateReplayEvidenceSample,
} from '../services/t2RhythmTemplateReplayEvidenceService.js'
import {
  buildT2RhythmDurationExperienceReplayEvidence,
  createT2RhythmDurationExperienceSupabaseReader,
  type T2RhythmDurationExperienceRow,
} from '../services/t2RhythmDurationExperienceReplayReadModelService.js'
import {
  buildT2RhythmTaskWindowAnnotationCandidateReport,
  type T2RhythmTaskWindowAnnotationCandidateReport,
} from '../services/t2RhythmTaskWindowAnnotationCandidateService.js'
import {
  buildT2RhythmTaskWindowAnnotationCandidateEvent,
  type T2RhythmTaskWindowAnnotationCandidateEventResult,
} from '../services/t2RhythmTaskWindowAnnotationCandidateEventService.js'
import {
  buildT2RhythmTaskWindowAnnotationReplayReadiness,
  type T2RhythmTaskWindowAnnotationReplayReadinessResult,
} from '../services/t2RhythmTaskWindowAnnotationReplayReadinessService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
  type T2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

export {
  evaluateT2RhythmStandardLibraryTrustGate,
}
export type {
  T2RhythmStandardLibraryTrustGate,
}

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'

const MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW = 2
const MINIMUM_DISTINCT_WORKFACES_PER_DURATION_BEARING_WINDOW = 3
const MAX_UNKNOWN_WINDOW_CODE_SAMPLES = 10

export type T2RhythmLiveReplayDiagnosticReaderFactoryInput = {
  projectId: string
  selectedTemplateIds: string[]
  windowCodes: string[]
  candidatePackage: T2RhythmScheduleCandidatePackage
}

export type T2RhythmLiveReplayDiagnosticReaderFactory = (
  input: T2RhythmLiveReplayDiagnosticReaderFactoryInput,
) => Promise<{
  taskActualRows?: T2RhythmReplayTaskActualRow[]
  durationExperienceRows?: T2RhythmDurationExperienceRow[]
}>

export type T2RhythmLiveReplayCheck = {
  status: DiagnosticStatus
  rowCount: number
  sourceRowCount: number
  sampleCount: number
  usableSampleCount: number
  rejectedRowCount: number
  liveRowsWithoutT2WindowMetadata: number
  rejectionReasonCodes: string[]
  unknownWindowCodeSamples: string[]
  acceptanceStatus: string | null
  readyForShadow: boolean
  readyForPublish: boolean
  reasonCodes: string[]
}

export type T2RhythmLiveReplayDiagnosticReport = {
  reportCode: 'c19_t2_rhythm_live_replay_diagnostic'
  evidenceKind: 'live_t2_rhythm_replay_probe'
  generatedAt: string
  diagnosticRunId: string
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  allowLive: boolean
  projectId: string | null
  selectedTemplateIds: string[]
  candidatePackage: {
    status: T2RhythmScheduleCandidatePackage['status']
    selectedTemplateIds: string[]
    windowCodes: string[]
    compatibilityStatus: T2RhythmScheduleCandidatePackage['compatibility']['status']
  } | null
  evidenceMetadata: {
    environment: string | null
    evidenceRef: string | null
    missingEvidenceMetadata: boolean
  }
  sampleAvailability: {
    status: DiagnosticStatus
    totalSourceRowCount: number
    totalUsableSampleCount: number
    totalRejectedRowCount: number
    totalLiveRowsWithoutT2WindowMetadata: number
    reasonCodes: string[]
  }
  replayCoverage: {
    source: 't2_live_replay_duration_bearing_window_coverage'
    status: DiagnosticStatus
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
  annotationCandidateReport: T2RhythmTaskWindowAnnotationCandidateReport | null
  annotationCandidateEventSummary: {
    status: T2RhythmTaskWindowAnnotationCandidateEventResult['status']
    eventKey: string | null
    assetKey: string | null
    lifecycleStatus: string | null
    runtimeEffectPolicy: string | null
    blockingReasons: string[]
    canWriteRuntime: boolean
    canFeedReplayEvidence: false
    governance: T2RhythmTaskWindowAnnotationCandidateEventResult['governance']
  } | null
  annotationReviewPackage: {
    source: 't2_live_replay_annotation_review_package'
    status: 'ready_for_manual_review'
    eventKey: string | null
    assetKey: string
    projectId: string | null
    templateId: string | null
    selectedTemplateIds: string[]
    evidenceRef: string | null
    annotationCandidateCount: number
    annotationGapCount: number
    canFeedReplayEvidence: false
    writesStandardTaskMetadata: false
    writesTaskDependencies: false
    writesPlanDates: false
    requiresManualApproval: true
    requiresReleaseExitBeforeMetadataWrite: true
    annotationCandidates: T2RhythmTaskWindowAnnotationCandidateReport['annotationCandidates']
    annotationGaps: T2RhythmTaskWindowAnnotationCandidateReport['annotationGaps']
    mutationBoundary: {
      writesStandardTaskMetadata: false
      writesTaskDependencies: false
      writesPlanDates: false
      writesSeed: false
      writesBaseline: false
      writesRuntimePublications: false
    }
  } | null
  annotationGapClosure: {
    source: 't2_live_replay_annotation_gap_closure'
    status: 'no_live_rows_without_t2_window_metadata' | 'manual_annotation_candidates_open' | 'data_collection_open' | 'post_annotation_replay_ready'
    taskRowsRead: number
    liveRowsWithoutT2WindowMetadata: number
    manualAnnotationCandidateCount: number
    highConfidenceCandidateCount: number
    mediumConfidenceCandidateCount: number
    lowConfidenceCandidateCount: number
    annotationGapCount: number
    approvedMetadataRowCount: number
    projectedReplaySampleCountAfterManualApproval: number
    projectedUnclosedGapCount: number
    reasonCodes: string[]
    governance: {
      readerOnly: true
      candidateOnly: true
      writesStandardTaskMetadata: false
      writesTaskDependencies: false
      writesPlanDates: false
      requiresManualApproval: true
      requiresReleaseExitBeforeMetadataWrite: true
    }
  } | null
  postAnnotationReplayReadiness: T2RhythmTaskWindowAnnotationReplayReadinessResult | null
  standardLibraryTrustGate: T2RhythmStandardLibraryTrustGate
  releaseEvidenceInput: {
    source: 't2_live_replay_release_evidence_input'
    evidenceMode: 'archived_live_replay'
    selectedTemplateIds: string[]
    evidenceRefs: string[]
    liveReplayTrustGate: T2RhythmStandardLibraryTrustGate
    canFeedReleaseEvidenceClosure: boolean
    blockingReasons: string[]
    mutationBoundary: T2RhythmStandardLibraryTrustGate['mutationBoundary']
  }
  checks: {
    readiness: {
      status: DiagnosticStatus
      reasonCodes: string[]
    }
    taskActualReplay: T2RhythmLiveReplayCheck
    durationExperienceReplay: T2RhythmLiveReplayCheck
  }
  governance: {
    readerOnly: true
    directSeedMutationAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
    requiresL5Publication: true
  }
}

export type T2RhythmLiveReplayDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  allowLive?: boolean
  projectId?: string | null
  environment?: string | null
  evidenceRef?: string | null
  selection?: T2RhythmTemplateSelectionInput
  facts?: Record<string, unknown>
  organizationAssumptions?: string[]
  selectedWorkfaceUnits?: string[]
  readerFactory?: T2RhythmLiveReplayDiagnosticReaderFactory
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c19-t2-rhythm-${now.toISOString().replace(/[:.]/g, '-')}`
}

function normalizeOutputFile(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseRepeatedStringArgs(args: string[], name: string) {
  const prefix = `--${name}=`
  return args
    .filter((item) => item.startsWith(prefix))
    .map((item) => item.slice(prefix.length))
    .map(normalizeText)
    .filter(Boolean)
}

function parseFactArgs(args: string[]) {
  const facts: Record<string, unknown> = {}
  for (const item of parseRepeatedStringArgs(args, 'fact')) {
    const [key, rawValue = 'true'] = item.split('=')
    const normalizedKey = normalizeText(key)
    if (!normalizedKey) continue
    const normalizedValue = normalizeText(rawValue).toLowerCase()
    facts[normalizedKey] = normalizedValue === 'true'
      ? true
      : normalizedValue === 'false'
        ? false
        : normalizeText(rawValue)
  }
  return facts
}

function emptyReplayCheck(status: DiagnosticStatus, reasonCodes: string[]): T2RhythmLiveReplayCheck {
  return {
    status,
    rowCount: 0,
    sourceRowCount: 0,
    sampleCount: 0,
    usableSampleCount: 0,
    rejectedRowCount: 0,
    liveRowsWithoutT2WindowMetadata: 0,
    rejectionReasonCodes: [],
    unknownWindowCodeSamples: [],
    acceptanceStatus: null,
    readyForShadow: false,
    readyForPublish: false,
    reasonCodes,
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function buildReplayCheck(params: {
  rowCount: number
  sampleCount: number
  rejectedRowCount: number
  rejectionReasonCodes: string[]
  unknownWindowCodeSamples?: Array<string | null | undefined>
  emptyRowsReasonCode: string
  acceptanceStatus: string
  readyForShadow: boolean
  readyForPublish: boolean
}) {
  const rejectionReasonCodes = unique(params.rejectionReasonCodes)
  const unknownWindowCodeSamples = unique(params.unknownWindowCodeSamples ?? [])
    .slice(0, MAX_UNKNOWN_WINDOW_CODE_SAMPLES)
  const liveRowsWithoutT2WindowMetadata = params.rejectionReasonCodes
    .filter((reasonCode) => reasonCode === 'missing_t2_window_code')
    .length
  const reasonCodes = [
    params.rowCount > 0 ? null : params.emptyRowsReasonCode,
    params.sampleCount > 0 ? null : 'no_t2_replay_samples',
    liveRowsWithoutT2WindowMetadata > 0 ? 'live_rows_without_t2_window_metadata' : null,
    params.readyForShadow ? null : 'acceptance_not_shadow_ready',
  ].filter((item): item is string => Boolean(item))
  return {
    status: reasonCodes.length === 0 ? 'pass' as const : 'fail' as const,
    rowCount: params.rowCount,
    sourceRowCount: params.rowCount,
    sampleCount: params.sampleCount,
    usableSampleCount: params.sampleCount,
    rejectedRowCount: params.rejectedRowCount,
    liveRowsWithoutT2WindowMetadata,
    rejectionReasonCodes,
    unknownWindowCodeSamples,
    acceptanceStatus: params.acceptanceStatus,
    readyForShadow: params.readyForShadow,
    readyForPublish: params.readyForPublish,
    reasonCodes: unique(reasonCodes),
  }
}

function buildSampleAvailability(
  taskActualReplay: T2RhythmLiveReplayCheck,
  durationExperienceReplay: T2RhythmLiveReplayCheck,
): T2RhythmLiveReplayDiagnosticReport['sampleAvailability'] {
  const totalSourceRowCount = taskActualReplay.sourceRowCount + durationExperienceReplay.sourceRowCount
  const totalUsableSampleCount = taskActualReplay.usableSampleCount + durationExperienceReplay.usableSampleCount
  const totalRejectedRowCount = taskActualReplay.rejectedRowCount + durationExperienceReplay.rejectedRowCount
  const totalLiveRowsWithoutT2WindowMetadata = taskActualReplay.liveRowsWithoutT2WindowMetadata
    + durationExperienceReplay.liveRowsWithoutT2WindowMetadata
  const reasonCodes = unique([
    ...taskActualReplay.reasonCodes,
    ...durationExperienceReplay.reasonCodes,
    totalSourceRowCount > 0 ? null : 'no_live_replay_source_rows',
    totalUsableSampleCount > 0 ? null : 'no_t2_replay_samples',
  ].filter((item): item is string => Boolean(item)))

  return {
    status: totalUsableSampleCount > 0 && reasonCodes.length === 0 ? 'pass' : 'fail',
    totalSourceRowCount,
    totalUsableSampleCount,
    totalRejectedRowCount,
    totalLiveRowsWithoutT2WindowMetadata,
    reasonCodes,
  }
}

function buildReplayCoverage(
  candidatePackage: T2RhythmScheduleCandidatePackage,
  samples: T2RhythmTemplateReplayEvidenceSample[],
  fallbackStatus: DiagnosticStatus = 'fail',
): T2RhythmLiveReplayDiagnosticReport['replayCoverage'] {
  const requiredWindowCodes = unique(candidatePackage.packageWindows
    .filter((window) => window.durationBearing)
    .map((window) => window.windowCode))
  const sampleCountByWindowCode = Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, 0]))
  const distinctWorkfacesByWindowCode = Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, new Set<string>()]))
  for (const sample of samples) {
    const windowCode = normalizeText(sample.windowCode)
    if (!requiredWindowCodes.includes(windowCode)) continue
    sampleCountByWindowCode[windowCode] = (sampleCountByWindowCode[windowCode] ?? 0) + 1
    const workfaceKey = normalizeText(sample.workfaceKey)
    if (workfaceKey) {
      distinctWorkfacesByWindowCode[windowCode]?.add(workfaceKey)
    }
  }
  const coveredWindowCodeSet = new Set(requiredWindowCodes
    .filter((windowCode) => (sampleCountByWindowCode[windowCode] ?? 0) > 0))
  const coveredWindowCodes = requiredWindowCodes.filter((windowCode) => coveredWindowCodeSet.has(windowCode))
  const missingWindowCodes = requiredWindowCodes.filter((windowCode) => !coveredWindowCodeSet.has(windowCode))
  const underSampledWindowCodes = requiredWindowCodes
    .filter((windowCode) => {
      const sampleCount = sampleCountByWindowCode[windowCode] ?? 0
      return sampleCount > 0 && sampleCount < MINIMUM_REPLAY_SAMPLES_PER_DURATION_BEARING_WINDOW
    })
  const distinctWorkfaceCountByWindowCode = Object.fromEntries(
    requiredWindowCodes.map((windowCode) => [windowCode, distinctWorkfacesByWindowCode[windowCode]?.size ?? 0]),
  )
  const underDiverseWorkfaceWindowCodes = requiredWindowCodes
    .filter((windowCode) => {
      const sampleCount = sampleCountByWindowCode[windowCode] ?? 0
      const distinctWorkfaceCount = distinctWorkfaceCountByWindowCode[windowCode] ?? 0
      return sampleCount > 0
        && distinctWorkfaceCount < MINIMUM_DISTINCT_WORKFACES_PER_DURATION_BEARING_WINDOW
    })
  const reasonCodes = unique([
    requiredWindowCodes.length > 0 ? '' : 'no_duration_bearing_windows_for_replay_coverage',
    missingWindowCodes.length > 0 ? 'duration_bearing_window_replay_coverage_missing' : '',
    underSampledWindowCodes.length > 0 ? 'duration_bearing_window_replay_sample_depth_missing' : '',
    underDiverseWorkfaceWindowCodes.length > 0 ? 'duration_bearing_window_replay_workface_diversity_missing' : '',
  ])
  return {
    source: 't2_live_replay_duration_bearing_window_coverage',
    status: reasonCodes.length === 0 ? 'pass' : fallbackStatus,
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

async function defaultReaderFactory(
  input: T2RhythmLiveReplayDiagnosticReaderFactoryInput,
) {
  const { supabase } = await import('../services/dbService.js')
  const query = {
    projectId: input.projectId,
    candidatePackageId: 't2_division_rhythm_schedule_candidate_package' as const,
    selectedTemplateIds: input.selectedTemplateIds,
    windowCodes: input.windowCodes,
  }
  const taskReader = createT2RhythmTaskActualSupabaseReader(supabase as any, { preserveRowsForDiagnostics: true })
  const durationExperienceReader = createT2RhythmDurationExperienceSupabaseReader(supabase as any, { preserveRowsForDiagnostics: true })
  const [taskActualRows, durationExperienceRows] = await Promise.all([
    taskReader(query),
    durationExperienceReader(query),
  ])
  return { taskActualRows, durationExperienceRows }
}

function buildReadiness(params: {
  allowLive: boolean
  outputFile: string | null
  projectId: string | null
  environment: string | null
  evidenceRef: string | null
  candidatePackage: T2RhythmScheduleCandidatePackage | null
}) {
  const reasonCodes = [
    params.allowLive ? null : 'missing_allow_live',
    params.outputFile ? null : 'missing_archived_json',
    params.projectId ? null : 'missing_project_id',
    params.environment && params.evidenceRef ? null : 'missing_evidence_metadata',
    params.candidatePackage && params.candidatePackage.status !== 'no_template_match' ? null : 'no_t2_candidate_package',
    params.candidatePackage && params.candidatePackage.compatibility.status === 'compatible_candidate' ? null : 'candidate_package_conflict',
  ].filter((item): item is string => Boolean(item))
  return {
    status: reasonCodes.length === 0 ? 'pass' as const : params.allowLive ? 'fail' as const : 'blocked' as const,
    reasonCodes,
  }
}

function summarizeAnnotationCandidateEvent(
  result: T2RhythmTaskWindowAnnotationCandidateEventResult,
): NonNullable<T2RhythmLiveReplayDiagnosticReport['annotationCandidateEventSummary']> {
  return {
    status: result.status,
    eventKey: result.event?.eventKey ?? null,
    assetKey: result.event?.assetKey ?? null,
    lifecycleStatus: result.event?.lifecycleStatus ?? null,
    runtimeEffectPolicy: result.event?.runtimeEffectPolicy ?? null,
    blockingReasons: result.blockingReasons,
    canWriteRuntime: result.event?.governanceDecision.canWriteRuntime ?? false,
    canFeedReplayEvidence: false,
    governance: result.governance,
  }
}

function buildAnnotationReviewPackage(
  result: T2RhythmTaskWindowAnnotationCandidateEventResult,
): NonNullable<T2RhythmLiveReplayDiagnosticReport['annotationReviewPackage']> | null {
  if (result.status !== 'annotation_candidate_event_created' || !result.event) return null
  const payload = result.event.candidatePayload as Record<string, unknown> | undefined
  const annotationCandidates = Array.isArray(payload?.annotationCandidates)
    ? payload.annotationCandidates as T2RhythmTaskWindowAnnotationCandidateReport['annotationCandidates']
    : []
  if (annotationCandidates.length < 1) return null
  const annotationGaps = Array.isArray(payload?.annotationGaps)
    ? payload.annotationGaps as T2RhythmTaskWindowAnnotationCandidateReport['annotationGaps']
    : []
  const selectedTemplateIds = Array.isArray(payload?.selectedTemplateIds)
    ? payload.selectedTemplateIds.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  const templateId = String(payload?.templateId ?? '').trim() || selectedTemplateIds[0] || null
  const evidenceRef = String(payload?.evidenceRef ?? '').trim() || null

  return {
    source: 't2_live_replay_annotation_review_package',
    status: 'ready_for_manual_review',
    eventKey: result.event.eventKey,
    assetKey: result.event.assetKey,
    projectId: result.event.projectId ?? null,
    templateId,
    selectedTemplateIds,
    evidenceRef,
    annotationCandidateCount: annotationCandidates.length,
    annotationGapCount: annotationGaps.length,
    canFeedReplayEvidence: false,
    writesStandardTaskMetadata: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    requiresManualApproval: true,
    requiresReleaseExitBeforeMetadataWrite: true,
    annotationCandidates,
    annotationGaps,
    mutationBoundary: {
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}

function buildAnnotationGapClosure(params: {
  taskActualReplay: T2RhythmLiveReplayCheck
  annotationCandidateReport: T2RhythmTaskWindowAnnotationCandidateReport
  postAnnotationReplayReadiness: T2RhythmTaskWindowAnnotationReplayReadinessResult
}): NonNullable<T2RhythmLiveReplayDiagnosticReport['annotationGapClosure']> {
  const manualAnnotationCandidateCount = params.annotationCandidateReport.annotationCandidateCount
  const annotationGapCount = params.annotationCandidateReport.annotationGapCount
  const projectedReplaySampleCountAfterManualApproval = manualAnnotationCandidateCount
  const projectedUnclosedGapCount = Math.max(0, annotationGapCount)
  const reasonCodes = unique([
    params.taskActualReplay.liveRowsWithoutT2WindowMetadata > 0 ? 'live_rows_without_t2_window_metadata' : '',
    manualAnnotationCandidateCount > 0 ? 'manual_annotation_required_before_replay' : '',
    annotationGapCount > 0 ? 'remaining_annotation_gaps' : '',
    params.postAnnotationReplayReadiness.canFeedReplayEvidenceAfterNextDiagnostic ? 'post_annotation_replay_ready' : '',
    params.postAnnotationReplayReadiness.approvedMetadataRowCount > 0
      && !params.postAnnotationReplayReadiness.canFeedReplayEvidenceAfterNextDiagnostic
      ? 'approved_metadata_not_shadow_ready'
      : '',
  ])
  const highConfidenceCandidateCount = params.annotationCandidateReport.annotationCandidates
    .filter((candidate) => candidate.confidence === 'high').length
  const mediumConfidenceCandidateCount = params.annotationCandidateReport.annotationCandidates
    .filter((candidate) => candidate.confidence === 'medium').length
  const lowConfidenceCandidateCount = params.annotationCandidateReport.annotationCandidates
    .filter((candidate) => candidate.confidence === 'low').length
  const status = params.taskActualReplay.liveRowsWithoutT2WindowMetadata < 1
    ? 'no_live_rows_without_t2_window_metadata'
    : params.postAnnotationReplayReadiness.canFeedReplayEvidenceAfterNextDiagnostic
      ? 'post_annotation_replay_ready'
      : manualAnnotationCandidateCount > 0
        ? 'manual_annotation_candidates_open'
        : 'data_collection_open'

  return {
    source: 't2_live_replay_annotation_gap_closure',
    status,
    taskRowsRead: params.annotationCandidateReport.taskRowsRead,
    liveRowsWithoutT2WindowMetadata: params.taskActualReplay.liveRowsWithoutT2WindowMetadata,
    manualAnnotationCandidateCount,
    highConfidenceCandidateCount,
    mediumConfidenceCandidateCount,
    lowConfidenceCandidateCount,
    annotationGapCount,
    approvedMetadataRowCount: params.postAnnotationReplayReadiness.approvedMetadataRowCount,
    projectedReplaySampleCountAfterManualApproval,
    projectedUnclosedGapCount,
    reasonCodes,
    governance: {
      readerOnly: true,
      candidateOnly: true,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresManualApproval: true,
      requiresReleaseExitBeforeMetadataWrite: true,
    },
  }
}

function attachStandardLibraryTrustGate(
  report: Omit<T2RhythmLiveReplayDiagnosticReport, 'standardLibraryTrustGate' | 'releaseEvidenceInput'>,
): T2RhythmLiveReplayDiagnosticReport {
  const selectedTemplateIds = report.candidatePackage?.selectedTemplateIds ?? []
  const standardLibraryTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
    ...report,
    selectedTemplateIds,
  })
  const evidenceRefs = unique([
    report.evidenceMetadata.evidenceRef,
    report.outputFile,
    report.diagnosticRunId ? `diagnostic-run:${report.diagnosticRunId}` : '',
  ])
  const canFeedReleaseEvidenceClosure = standardLibraryTrustGate.status === 'shadow_replay_ready_not_publishable'
    && selectedTemplateIds.length > 0
    && evidenceRefs.length > 0
    && !report.missingArchivedJson
    && !report.evidenceMetadata.missingEvidenceMetadata
  return {
    ...report,
    standardLibraryTrustGate,
    releaseEvidenceInput: {
      source: 't2_live_replay_release_evidence_input',
      evidenceMode: 'archived_live_replay',
      selectedTemplateIds,
      evidenceRefs,
      liveReplayTrustGate: standardLibraryTrustGate,
      canFeedReleaseEvidenceClosure,
      blockingReasons: canFeedReleaseEvidenceClosure
        ? []
        : unique([
            standardLibraryTrustGate.status === 'shadow_replay_ready_not_publishable' ? '' : 'live_replay_trust_gate_not_ready',
            selectedTemplateIds.length > 0 ? '' : 'selected_t2_template_required',
            report.missingArchivedJson ? 'missing_archived_json' : '',
            report.evidenceMetadata.missingEvidenceMetadata ? 'missing_evidence_metadata' : '',
            evidenceRefs.length > 0 ? '' : 'release_evidence_ref_required',
          ]),
      mutationBoundary: standardLibraryTrustGate.mutationBoundary,
    },
  }
}

export async function buildT2RhythmLiveReplayDiagnosticReport(
  options: T2RhythmLiveReplayDiagnosticOptions = {},
): Promise<T2RhythmLiveReplayDiagnosticReport> {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const outputFile = normalizeOutputFile(options.outputFile)
  const allowLive = options.allowLive === true
  const projectId = normalizeText(options.projectId) || null
  const environment = normalizeText(options.environment) || null
  const evidenceRef = normalizeText(options.evidenceRef) || null
  const candidatePackage = buildT2RhythmScheduleCandidatePackage({
    selection: options.selection ?? {},
    facts: options.facts ?? {},
    organizationAssumptions: options.organizationAssumptions ?? [],
    selectedWorkfaceUnits: options.selectedWorkfaceUnits ?? [],
  })
  const candidateSummary = {
    status: candidatePackage.status,
    selectedTemplateIds: candidatePackage.selectedTemplateIds,
    windowCodes: candidatePackage.packageWindows.map((window) => window.windowCode),
    compatibilityStatus: candidatePackage.compatibility.status,
  }
  const readiness = buildReadiness({
    allowLive,
    outputFile,
    projectId,
    environment,
    evidenceRef,
    candidatePackage,
  })
  const base = {
    reportCode: 'c19_t2_rhythm_live_replay_diagnostic' as const,
    evidenceKind: 'live_t2_rhythm_replay_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    outputFile,
    missingArchivedJson: !outputFile,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-19.15 T2 rhythm templates require archived live/staging replay against tasks and duration_experience_samples before they can be trusted beyond cold-start shadow candidates.',
    allowLive,
    projectId,
    selectedTemplateIds: candidatePackage.selectedTemplateIds,
    candidatePackage: candidateSummary,
    evidenceMetadata: {
      environment,
      evidenceRef,
      missingEvidenceMetadata: !environment || !evidenceRef,
    },
    governance: {
      readerOnly: true as const,
      directSeedMutationAllowed: false as const,
      writesPlanDates: false as const,
      writesTaskDependencies: false as const,
      requiresL5Publication: true as const,
    },
  }

  if (readiness.status !== 'pass' || !projectId) {
    const taskActualReplay = emptyReplayCheck(readiness.status, readiness.reasonCodes)
    const durationExperienceReplay = emptyReplayCheck(readiness.status, readiness.reasonCodes)
    return attachStandardLibraryTrustGate({
      ...base,
      status: readiness.status,
      sampleAvailability: buildSampleAvailability(taskActualReplay, durationExperienceReplay),
      replayCoverage: buildReplayCoverage(candidatePackage, [], readiness.status),
      annotationCandidateReport: null,
      annotationCandidateEventSummary: null,
      annotationReviewPackage: null,
      annotationGapClosure: null,
      postAnnotationReplayReadiness: null,
      checks: {
        readiness,
        taskActualReplay,
        durationExperienceReplay,
      },
    })
  }

  try {
    const readerFactory = options.readerFactory ?? defaultReaderFactory
    const rows = await readerFactory({
      projectId,
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      windowCodes: candidatePackage.packageWindows.map((window) => window.windowCode),
      candidatePackage,
    })
    const taskReplay = await buildT2RhythmTaskActualReplayEvidence({
      templateId: candidatePackage.selectedTemplateIds[0] ?? 'unknown_t2_template',
      projectId,
      candidatePackage,
      reader: async () => rows.taskActualRows ?? [],
    })
    const annotationCandidateReport = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId,
      candidatePackage,
      taskRows: rows.taskActualRows ?? [],
    })
    const annotationCandidateEvent = buildT2RhythmTaskWindowAnnotationCandidateEvent({
      projectId,
      candidatePackage,
      annotationReport: annotationCandidateReport,
      evidenceRef,
    })
    const annotationCandidateEventSummary = summarizeAnnotationCandidateEvent(annotationCandidateEvent)
    const annotationReviewPackage = buildAnnotationReviewPackage(annotationCandidateEvent)
    const postAnnotationReplayReadiness = buildT2RhythmTaskWindowAnnotationReplayReadiness({
      projectId,
      templateId: candidatePackage.selectedTemplateIds[0] ?? 'unknown_t2_template',
      candidatePackage,
      taskRows: rows.taskActualRows ?? [],
    })
    const durationExperienceReplay = await buildT2RhythmDurationExperienceReplayEvidence({
      templateId: candidatePackage.selectedTemplateIds[0] ?? 'unknown_t2_template',
      projectId,
      candidatePackage,
      reader: async () => rows.durationExperienceRows ?? [],
    })
    const taskActualReplay = buildReplayCheck({
      rowCount: taskReplay.taskRowsRead,
      sampleCount: taskReplay.adapter.samples.length,
      rejectedRowCount: taskReplay.adapter.rejectedRows.length,
      rejectionReasonCodes: taskReplay.adapter.rejectedRows.map((row) => row.reasonCode),
      unknownWindowCodeSamples: taskReplay.adapter.rejectedRows
        .filter((row) => row.reasonCode === 'unknown_t2_window_code')
        .map((row) => row.observedWindowCode),
      emptyRowsReasonCode: 'task_actual_rows_empty',
      acceptanceStatus: taskReplay.evidence.acceptance.status,
      readyForShadow: taskReplay.evidence.acceptance.readyForShadow,
      readyForPublish: taskReplay.evidence.acceptance.readyForPublish,
    })
    const durationExperienceReplayCheck = buildReplayCheck({
      rowCount: durationExperienceReplay.durationExperienceRowsRead,
      sampleCount: durationExperienceReplay.adapter.samples.length,
      rejectedRowCount: durationExperienceReplay.adapter.rejectedRows.length,
      rejectionReasonCodes: durationExperienceReplay.adapter.rejectedRows.map((row) => row.reasonCode),
      unknownWindowCodeSamples: durationExperienceReplay.adapter.rejectedRows
        .filter((row) => row.reasonCode === 'unknown_t2_window_code')
        .map((row) => row.observedWindowCode),
      emptyRowsReasonCode: 'duration_experience_samples_empty',
      acceptanceStatus: durationExperienceReplay.evidence.acceptance.status,
      readyForShadow: durationExperienceReplay.evidence.acceptance.readyForShadow,
      readyForPublish: durationExperienceReplay.evidence.acceptance.readyForPublish,
    })
    const annotationGapClosure = buildAnnotationGapClosure({
      taskActualReplay,
      annotationCandidateReport,
      postAnnotationReplayReadiness,
    })
    const sampleAvailability = buildSampleAvailability(taskActualReplay, durationExperienceReplayCheck)
    const replayCoverage = buildReplayCoverage(candidatePackage, [
      ...taskReplay.adapter.samples,
      ...durationExperienceReplay.adapter.samples,
    ])
    const replayChecksPass = taskActualReplay.status === 'pass' || durationExperienceReplayCheck.status === 'pass'
    return attachStandardLibraryTrustGate({
      ...base,
      status: replayChecksPass && replayCoverage.status === 'pass' ? 'pass' : 'fail',
      sampleAvailability,
      replayCoverage,
      annotationCandidateReport,
      annotationCandidateEventSummary,
      annotationReviewPackage,
      annotationGapClosure,
      postAnnotationReplayReadiness,
      checks: {
        readiness,
        taskActualReplay,
        durationExperienceReplay: durationExperienceReplayCheck,
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const taskActualReplay = emptyReplayCheck('fail', [`reader_failed:${reason}`])
    const durationExperienceReplay = emptyReplayCheck('fail', [`reader_failed:${reason}`])
    return attachStandardLibraryTrustGate({
      ...base,
      status: 'fail',
      sampleAvailability: buildSampleAvailability(taskActualReplay, durationExperienceReplay),
      replayCoverage: buildReplayCoverage(candidatePackage, [], 'fail'),
      annotationCandidateReport: null,
      annotationCandidateEventSummary: null,
      annotationReviewPackage: null,
      annotationGapClosure: null,
      postAnnotationReplayReadiness: null,
      checks: {
        readiness,
        taskActualReplay,
        durationExperienceReplay,
      },
    })
  }
}

export function shouldFailT2RhythmLiveReplayDiagnosticReport(
  report: T2RhythmLiveReplayDiagnosticReport,
) {
  return report.status !== 'pass'
    || report.missingArchivedJson
    || report.evidenceMetadata.missingEvidenceMetadata
    || report.checks.readiness.status !== 'pass'
    || report.replayCoverage.status !== 'pass'
    || (report.checks.taskActualReplay.status !== 'pass' && report.checks.durationExperienceReplay.status !== 'pass')
}

export function parseT2RhythmLiveReplayDiagnosticOptionsFromArgs(
  args: string[],
): Pick<T2RhythmLiveReplayDiagnosticOptions, 'allowLive' | 'projectId' | 'environment' | 'evidenceRef' | 'outputFile' | 'diagnosticRunId' | 'selection' | 'facts' | 'organizationAssumptions' | 'selectedWorkfaceUnits'> {
  return {
    allowLive: args.includes('--allow-live'),
    projectId: parseStringArg(args, 'project-id'),
    environment: parseStringArg(args, 'environment'),
    evidenceRef: parseStringArg(args, 'evidence-ref'),
    outputFile: normalizeOutputFile(parseStringArg(args, 'output-file')) ?? undefined,
    diagnosticRunId: parseStringArg(args, 'diagnostic-run-id'),
    selection: {
      businessTypeCode: parseStringArg(args, 'business-type'),
      phaseWindow: parseStringArg(args, 'phase-window'),
      divisionFamily: parseStringArg(args, 'division-family'),
      subdivisionFamily: parseStringArg(args, 'subdivision-family'),
      methodVariantCodes: parseRepeatedStringArgs(args, 'method-variant'),
      scopeDimensions: parseRepeatedStringArgs(args, 'scope-dimension'),
    },
    facts: parseFactArgs(args),
    organizationAssumptions: parseRepeatedStringArgs(args, 'organization-assumption'),
    selectedWorkfaceUnits: parseRepeatedStringArgs(args, 'workface-unit'),
  }
}

function writeReportIfRequested(report: T2RhythmLiveReplayDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildT2RhythmLiveReplayDiagnosticReport(
    parseT2RhythmLiveReplayDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailT2RhythmLiveReplayDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-t2-rhythm-live-replay.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
