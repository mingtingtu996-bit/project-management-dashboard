import {
  createAlgorithmAssetCandidateEvent,
  createAndPersistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetGovernanceQueryExec,
  PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'
import {
  getT2DivisionRhythmTemplate,
  type T2RhythmScheduleCandidatePackage,
} from './t2DivisionRhythmTemplateRegistryService.js'
import type {
  T2RhythmTaskWindowAnnotationCandidateReport,
} from './t2RhythmTaskWindowAnnotationCandidateService.js'

export type T2RhythmTaskWindowAnnotationCandidateEventInput = {
  companyId?: string | null
  projectId?: string | null
  candidatePackage: T2RhythmScheduleCandidatePackage
  annotationReport: T2RhythmTaskWindowAnnotationCandidateReport
  evidenceRef?: string | null
}

export type PersistT2RhythmTaskWindowAnnotationCandidateEventInput =
  T2RhythmTaskWindowAnnotationCandidateEventInput & {
    queryExec?: AlgorithmAssetGovernanceQueryExec
  }

export type T2RhythmTaskWindowAnnotationCandidateEventStatus =
  | 'annotation_candidate_event_created'
  | 'annotation_data_collection_open'
  | 'candidate_conflict'
  | 'no_template_match'

export type T2RhythmTaskWindowAnnotationCandidateEventResult = {
  status: T2RhythmTaskWindowAnnotationCandidateEventStatus
  event?: AlgorithmAssetCandidateEvent
  blockingReasons: string[]
  governance: {
    source: 't2_task_window_annotation_candidate_event'
    readerOnly: true
    writesStandardTaskMetadata: false
    writesPlanDates: false
    writesTaskDependencies: false
    canFeedReplayEvidence: false
    requiresManualApproval: true
  }
}

export type PersistT2RhythmTaskWindowAnnotationCandidateEventResult =
  T2RhythmTaskWindowAnnotationCandidateEventResult & {
    persistence:
      | PersistAlgorithmAssetCandidateEventResult
      | {
        persisted: false
        candidateEventId: null
        skippedReason: T2RhythmTaskWindowAnnotationCandidateEventStatus
      }
  }

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function uniqueSorted(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeCode).filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function firstTemplateId(input: T2RhythmTaskWindowAnnotationCandidateEventInput) {
  return input.candidatePackage.selectedTemplateIds[0] || 'unknown_template'
}

function resolveProjectId(input: T2RhythmTaskWindowAnnotationCandidateEventInput) {
  return normalizeText(input.projectId) || normalizeText(input.annotationReport.projectId)
}

function buildExperienceTierScope(input: T2RhythmTaskWindowAnnotationCandidateEventInput) {
  const projectId = resolveProjectId(input)
  const companyId = normalizeText(input.companyId)
  const templates = input.candidatePackage.selectedTemplateIds
    .map((templateId) => getT2DivisionRhythmTemplate(templateId))
    .filter((template): template is NonNullable<typeof template> => Boolean(template))
  const businessTypeCodes = uniqueSorted(templates.flatMap((template) => template.applicability.businessTypeCodes))
  const phaseWindows = uniqueSorted(templates.flatMap((template) => template.applicability.phaseWindows))
  const divisionFamilies = uniqueSorted(templates.flatMap((template) => template.applicability.divisionFamilies))
  const subdivisionFamilies = uniqueSorted(templates.flatMap((template) => template.applicability.subdivisionFamilies))

  return {
    experienceTier: 'T2' as const,
    experienceAssetType: 't2_division_rhythm_template' as const,
    reuseScope: projectId ? 'project' as const : companyId ? 'company' as const : 'industry' as const,
    learningScope: projectId ? 'project' as const : companyId ? 'company' as const : 'industry' as const,
    wbsNodeTypes: ['division', 'subdivision'] as const,
    businessTypeCodes,
    phaseWindows,
    divisionFamilies,
    subdivisionFamilies,
    experienceGroupKeys: Array.from(new Set([
      ...divisionFamilies.map((family) => `T2:division:${family}`),
      ...subdivisionFamilies.map((family) => `T2:subdivision:${family}`),
    ])).sort((left, right) => left.localeCompare(right)),
  }
}

function buildConflictBlockingReasons(candidatePackage: T2RhythmScheduleCandidatePackage) {
  const reasons: string[] = []
  if (candidatePackage.status === 'candidate_conflict' || candidatePackage.compatibility.status === 'candidate_conflict') {
    reasons.push('t2_candidate_package_conflict')
  }
  if (candidatePackage.compatibility.priorityAdjudication?.priorityOverrideBlocked) {
    reasons.push('priority_override_blocked_by_assembly_conflict')
  }
  for (const conflict of candidatePackage.compatibility.conflicts) {
    reasons.push(conflict.conflictCode)
  }
  return Array.from(new Set(reasons))
}

function buildCandidatePayload(input: T2RhythmTaskWindowAnnotationCandidateEventInput) {
  const templateId = firstTemplateId(input)
  return {
    source: 't2_task_window_annotation_candidate_event',
    tier: 'T2',
    companyId: normalizeText(input.companyId) || null,
    projectId: resolveProjectId(input) || null,
    ...buildExperienceTierScope(input),
    templateId,
    selectedTemplateIds: input.candidatePackage.selectedTemplateIds,
    candidatePackageStatus: input.candidatePackage.status,
    annotationReportSource: input.annotationReport.source,
    annotationReportStatus: input.annotationReport.status,
    annotationCandidateCount: input.annotationReport.annotationCandidateCount,
    annotationGapCount: input.annotationReport.annotationGapCount,
    canFeedReplayEvidence: false,
    evidenceRef: input.evidenceRef ?? null,
    annotationCandidates: input.annotationReport.annotationCandidates.map((candidate) => ({
      taskId: candidate.taskId,
      proposedWindowCode: candidate.proposedWindowCode,
      proposedWindowRole: candidate.proposedWindowRole,
      confidence: candidate.confidence,
      score: candidate.score,
      matchSignals: candidate.matchSignals,
      reviewReasonCodes: candidate.reviewReasonCodes,
      requiresManualApproval: true,
      autoWriteAllowed: false,
    })),
    annotationGaps: input.annotationReport.annotationGaps,
    scheduleTrustPolicy: input.candidatePackage.scheduleTrustPolicy,
    governance: {
      readerOnly: true,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      candidateOnly: true,
      requiresManualApproval: true,
      manualApprovalRequiredBeforeMetadataWrite: true,
      runtimeEffectPolicy: 'candidate_only',
    },
  }
}

function buildCandidateEventInput(input: T2RhythmTaskWindowAnnotationCandidateEventInput) {
  const templateId = firstTemplateId(input)
  const projectId = resolveProjectId(input)
  return {
    assetKey: `t2.rhythm.task_window_annotation:${projectId || 'unknown_project'}:${templateId}`,
    sourceSystem: 't2RhythmTaskWindowAnnotationCandidateEventService',
    assetType: 'template' as const,
    companyId: normalizeText(input.companyId) || null,
    projectId: projectId || null,
    candidatePayload: buildCandidatePayload(input),
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'manual_required',
    learningMaturity: 'governed_candidate',
    learningTarget: 'template_structure',
    requestedRuntimeEffect: 'candidate_only' as const,
    generatedBy: 'service' as const,
    evidence: {
      replayPassed: false,
      conflictFree: true,
      rollbackTarget: `t2.rhythm.task_window_annotation.review:${templateId}`,
    },
  }
}

export function buildT2RhythmTaskWindowAnnotationCandidateEvent(
  input: T2RhythmTaskWindowAnnotationCandidateEventInput,
): T2RhythmTaskWindowAnnotationCandidateEventResult {
  const governance = {
    source: 't2_task_window_annotation_candidate_event' as const,
    readerOnly: true as const,
    writesStandardTaskMetadata: false as const,
    writesPlanDates: false as const,
    writesTaskDependencies: false as const,
    canFeedReplayEvidence: false as const,
    requiresManualApproval: true as const,
  }

  if (input.candidatePackage.status === 'no_template_match') {
    return {
      status: 'no_template_match',
      blockingReasons: ['no_t2_template_match'],
      governance,
    }
  }

  const conflictReasons = buildConflictBlockingReasons(input.candidatePackage)
  if (conflictReasons.length > 0) {
    return {
      status: 'candidate_conflict',
      blockingReasons: conflictReasons,
      governance,
    }
  }

  if (input.annotationReport.annotationCandidateCount < 1) {
    return {
      status: 'annotation_data_collection_open',
      blockingReasons: ['no_manual_annotation_candidates'],
      governance,
    }
  }

  const event = createAlgorithmAssetCandidateEvent(buildCandidateEventInput(input))

  return {
    status: 'annotation_candidate_event_created',
    event,
    blockingReasons: [],
    governance,
  }
}

export async function buildAndPersistT2RhythmTaskWindowAnnotationCandidateEvent(
  input: PersistT2RhythmTaskWindowAnnotationCandidateEventInput,
): Promise<PersistT2RhythmTaskWindowAnnotationCandidateEventResult> {
  const candidate = buildT2RhythmTaskWindowAnnotationCandidateEvent(input)
  if (!candidate.event) {
    return {
      ...candidate,
      persistence: {
        persisted: false,
        candidateEventId: null,
        skippedReason: candidate.status,
      },
    }
  }

  const persisted = await createAndPersistAlgorithmAssetCandidateEvent({
    ...buildCandidateEventInput(input),
    queryExec: input.queryExec,
  })

  return {
    ...candidate,
    event: persisted.event,
    persistence: persisted.persistence,
  }
}
