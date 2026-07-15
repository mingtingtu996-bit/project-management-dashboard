import {
  createAlgorithmAssetCandidateEvent,
  createAndPersistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetGovernanceQueryExec,
  PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'
import type {
  T2RhythmScheduleCandidatePackage,
} from './t2DivisionRhythmTemplateRegistryService.js'
import {
  getT2DivisionRhythmTemplate,
} from './t2DivisionRhythmTemplateRegistryService.js'
import type {
  T2RhythmTemplateReplayEvidenceResult,
} from './t2RhythmTemplateReplayEvidenceService.js'

export type T2RhythmReplayLearningCandidateInput = {
  companyId?: string | null
  projectId?: string | null
  candidatePackage: T2RhythmScheduleCandidatePackage
  replayEvidence: T2RhythmTemplateReplayEvidenceResult
  evidenceRef?: string | null
}

export type PersistT2RhythmReplayLearningCandidateInput = T2RhythmReplayLearningCandidateInput & {
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type T2RhythmReplayLearningCandidateStatus =
  | 'shadow_candidate_event_created'
  | 'data_collection_open'
  | 'candidate_conflict'
  | 'no_template_match'

export type T2RhythmReplayLearningCandidateResult = {
  status: T2RhythmReplayLearningCandidateStatus
  event?: AlgorithmAssetCandidateEvent
  blockingReasons: string[]
  governance: {
    source: 't2_rhythm_replay_learning_candidate'
    directSeedMutationAllowed: false
    autoPublishAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
    requiresL5Publication: true
  }
}

export type PersistT2RhythmReplayLearningCandidateResult = T2RhythmReplayLearningCandidateResult & {
  persistence:
    | PersistAlgorithmAssetCandidateEventResult
    | {
      persisted: false
      candidateEventId: null
      skippedReason: T2RhythmReplayLearningCandidateStatus
    }
}

function firstTemplateId(input: T2RhythmReplayLearningCandidateInput) {
  return input.replayEvidence.templateId || input.candidatePackage.selectedTemplateIds[0] || 'unknown_template'
}

function normalizeCode(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function uniqueSorted(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeCode).filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function buildExperienceTierScope(input: T2RhythmReplayLearningCandidateInput) {
  const templates = input.candidatePackage.selectedTemplateIds
    .map((templateId) => getT2DivisionRhythmTemplate(templateId))
    .filter((template): template is NonNullable<typeof template> => Boolean(template))
  const businessTypeCodes = uniqueSorted(templates.flatMap((template) => template.applicability.businessTypeCodes))
  const phaseWindows = uniqueSorted(templates.flatMap((template) => template.applicability.phaseWindows))
  const divisionFamilies = uniqueSorted(templates.flatMap((template) => template.applicability.divisionFamilies))
  const subdivisionFamilies = uniqueSorted(templates.flatMap((template) => template.applicability.subdivisionFamilies))
  const workfaceUnits = uniqueSorted(templates.map((template) => template.rhythm.workfaceUnit))
  const experienceGroupKeys = [
    ...divisionFamilies.map((family) => `T2:division:${family}`),
    ...subdivisionFamilies.map((family) => `T2:subdivision:${family}`),
    ...businessTypeCodes.flatMap((businessType) => phaseWindows.flatMap((phase) => (
      divisionFamilies.flatMap((division) => subdivisionFamilies.map((subdivision) => (
        `T2:${businessType}:${phase}:${division}:${subdivision}`
      )))
    ))),
  ]

  return {
    experienceTier: 'T2' as const,
    experienceAssetType: 't2_division_rhythm_template' as const,
    reuseScope: input.projectId ? 'project' as const : input.companyId ? 'company' as const : 'industry' as const,
    factSource: 'hybrid' as const,
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    learningScope: input.projectId ? 'project' as const : input.companyId ? 'company' as const : 'industry' as const,
    wbsNodeTypes: ['division', 'subdivision'] as const,
    businessTypeCodes,
    phaseWindows,
    divisionFamilies,
    subdivisionFamilies,
    workfaceUnits,
    experienceGroupKeys: Array.from(new Set(experienceGroupKeys)).sort((left, right) => left.localeCompare(right)),
    experienceTierRegistryCandidate: {
      tier: 'T2' as const,
      reusableAtNodeTypes: ['division', 'subdivision'] as const,
      groupKeyStrategy: 'business_type_phase_division_subdivision_workface' as const,
      prohibitsT1T3BucketMixing: true as const,
      requiredRegistry: 'experienceTierRegistry' as const,
      registryStatus: 'candidate_payload_ready_pending_registry_materialization' as const,
    },
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

function buildReleaseEvidenceClosureBlockingReasons(candidatePackage: T2RhythmScheduleCandidatePackage) {
  const closure = candidatePackage.standardLibraryReadiness.releaseEvidenceClosure
  if (closure?.status === 'ready_not_publishable') return []
  if (!closure) return ['release_evidence_closure_ready_required']

  return Array.from(new Set([
    'release_evidence_closure_ready_required',
    ...closure.blockingGateCodes.map((gateCode) => `${gateCode}_required`),
    ...closure.templateScopeMismatchCodes,
  ]))
}

function buildCandidatePayload(input: T2RhythmReplayLearningCandidateInput) {
  const templateId = firstTemplateId(input)
  return {
    source: 't2_rhythm_replay_learning_candidate',
    tier: 'T2',
    ...buildExperienceTierScope(input),
    templateId,
    selectedTemplateIds: input.candidatePackage.selectedTemplateIds,
    durationContextCandidateCount: input.candidatePackage.durationContextCandidates.length,
    dependencyCandidateCount: input.candidatePackage.dependencyCandidates.length,
    hardGateCount: input.candidatePackage.hardGates.length,
    windowCodes: input.candidatePackage.packageWindows.map((window) => window.windowCode),
    replayAcceptanceStatus: input.replayEvidence.acceptance.status,
    replayReadyForShadow: input.replayEvidence.acceptance.readyForShadow,
    replayReadyForPublish: input.replayEvidence.acceptance.readyForPublish,
    replayEvidenceRef: input.evidenceRef ?? null,
    evidenceRefs: input.replayEvidence.evidenceRefs,
    metrics: input.replayEvidence.metrics,
    sampleQualityIssueCount: input.replayEvidence.sampleQualityIssues.length,
    compatibility: {
      status: input.candidatePackage.compatibility.status,
      compatible: input.candidatePackage.compatibility.compatible,
      conflictCount: input.candidatePackage.compatibility.conflicts.length,
      priorityOverrideBlocked: input.candidatePackage.compatibility.priorityAdjudication?.priorityOverrideBlocked ?? false,
    },
    scheduleTrustPolicy: input.candidatePackage.scheduleTrustPolicy,
    governance: {
      directSeedMutationAllowed: false,
      autoPublishAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
      runtimeEffectPolicy: 'candidate_only',
      releasePath: input.replayEvidence.acceptance.governance.releasePath,
      manualReviewRequiredBeforePublish: true,
    },
  }
}

function buildCandidateEventInput(input: T2RhythmReplayLearningCandidateInput) {
  const templateId = firstTemplateId(input)
  return {
    assetKey: `t2.rhythm.template:${templateId}`,
    sourceSystem: 't2RhythmReplayLearningCandidateService',
    assetType: 'template' as const,
    companyId: input.companyId,
    projectId: input.projectId,
    candidatePayload: buildCandidatePayload(input),
    publishAnchor: 'manual_governance_required',
    automationMaturity: 'auto_shadow',
    learningMaturity: 'governed_candidate',
    learningTarget: 'template_structure',
    requestedRuntimeEffect: 'direct_effect_request' as const,
    generatedBy: 'service' as const,
    evidence: {
      replayPassed: true,
      conflictFree: true,
      rollbackTarget: `t2.rhythm.template.seed:${templateId}`,
    },
  }
}

export function buildT2RhythmReplayLearningCandidate(
  input: T2RhythmReplayLearningCandidateInput,
): T2RhythmReplayLearningCandidateResult {
  const governance = {
    source: 't2_rhythm_replay_learning_candidate' as const,
    directSeedMutationAllowed: false as const,
    autoPublishAllowed: false as const,
    writesPlanDates: false as const,
    writesTaskDependencies: false as const,
    requiresL5Publication: true as const,
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

  if (!input.replayEvidence.acceptance.readyForShadow) {
    return {
      status: 'data_collection_open',
      blockingReasons: input.replayEvidence.acceptance.blockingReasons,
      governance,
    }
  }

  const releaseEvidenceClosureBlockingReasons = buildReleaseEvidenceClosureBlockingReasons(input.candidatePackage)
  if (releaseEvidenceClosureBlockingReasons.length > 0) {
    return {
      status: 'data_collection_open',
      blockingReasons: Array.from(new Set([
        ...input.replayEvidence.acceptance.blockingReasons,
        ...releaseEvidenceClosureBlockingReasons,
      ])),
      governance,
    }
  }

  const event = createAlgorithmAssetCandidateEvent(buildCandidateEventInput(input))

  return {
    status: 'shadow_candidate_event_created',
    event,
    blockingReasons: [],
    governance,
  }
}

export async function buildAndPersistT2RhythmReplayLearningCandidate(
  input: PersistT2RhythmReplayLearningCandidateInput,
): Promise<PersistT2RhythmReplayLearningCandidateResult> {
  const candidate = buildT2RhythmReplayLearningCandidate(input)
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
