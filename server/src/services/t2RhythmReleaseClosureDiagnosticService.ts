import {
  buildT2RhythmScheduleCandidatePackage,
  type T2RhythmPhase1MultiNetworkSelectionTrustGate,
  type T2RhythmReleaseEvidenceClosure,
  type T2RhythmScheduleCandidatePackage,
  type T2RhythmScheduleCandidatePackageInput,
} from './t2DivisionRhythmTemplateRegistryService.js'
import type {
  T2RhythmStandardLibraryL5ReleaseGate,
} from './t2RhythmStandardLibraryL5ReleaseGateService.js'
import type {
  T2RhythmStandardLibraryTrustGate,
} from './t2RhythmStandardLibraryTrustGateService.js'

export type T2RhythmLiveReplayReleaseEvidenceInput = {
  source: 't2_live_replay_release_evidence_input'
  evidenceMode: 'archived_live_replay'
  selectedTemplateIds: string[]
  evidenceRefs: string[]
  liveReplayTrustGate: T2RhythmStandardLibraryTrustGate
  canFeedReleaseEvidenceClosure: boolean
  blockingReasons: string[]
  mutationBoundary: T2RhythmStandardLibraryTrustGate['mutationBoundary']
}

export type T2RhythmReleaseClosureDiagnosticInput =
  Omit<T2RhythmScheduleCandidatePackageInput, 'liveReplayTrustGate' | 'phase1MultiNetworkSelectionTrustGate' | 'l5ReleaseGate'> & {
    reportId?: string | null
    generatedAt?: string | null
    liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
    liveReplayReleaseEvidenceInput?: T2RhythmLiveReplayReleaseEvidenceInput | null
    phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
    l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
  }

export type T2RhythmReleaseClosureDiagnosticReport = {
  source: 't2_rhythm_release_closure_diagnostic_report'
  reportId: string
  generatedAt: string
  status: 'ready_not_publishable' | 'blocked'
  selectedTemplateIds: string[]
  candidatePackageStatus: T2RhythmScheduleCandidatePackage['status']
  selectionCoverageStatus: T2RhythmScheduleCandidatePackage['selectionCoverage']['status']
  releaseEvidenceClosure: T2RhythmReleaseEvidenceClosure
  gateScopeMatrix: Array<{
    gateCode: T2RhythmReleaseEvidenceClosure['requiredGateCodes'][number]
    status: string
    selectedTemplateIds: string[]
    expectedTemplateIds: string[]
    coversCurrentSelection: boolean
    evidenceRefCount: number
    evidenceRefs: string[]
    blockingReasons: string[]
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      writesRuntimePublications: false
    }
  }>
  releaseAutomationGate: {
    source: 't2_rhythm_release_closure_automation_gate'
    status: 'ready_for_manual_publication_artifact' | 'blocked'
    canEmitReleaseArtifact: boolean
    canBypassManualApproval: false
    canAutoMaterializeTaskDependencies: false
    canAutoPublishRuntimeExperience: false
    requiredManualGateCodes: string[]
    blockingReasons: string[]
    artifactMode: 'v1_4_22_style_manual_publication_candidate'
  }
  releaseBlockers: string[]
  releaseEvidenceRefs: string[]
  mutationBoundary: T2RhythmReleaseEvidenceClosure['mutationBoundary']
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function coversAll(gateTemplateIds: string[], expectedTemplateIds: string[]) {
  const gateScope = new Set(gateTemplateIds.map(normalizeText).filter(Boolean))
  return expectedTemplateIds.length > 0
    && expectedTemplateIds.every((templateId) => gateScope.has(normalizeText(templateId)))
}

function noWriteMutationBoundary(): T2RhythmReleaseClosureDiagnosticReport['gateScopeMatrix'][number]['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function liveReplayEvidenceBlockingReasons(
  releaseEvidenceInput: T2RhythmLiveReplayReleaseEvidenceInput | null | undefined,
) {
  if (!releaseEvidenceInput) return []
  return unique([
    ...releaseEvidenceInput.blockingReasons,
    releaseEvidenceInput.canFeedReleaseEvidenceClosure ? '' : 'live_replay_release_evidence_input_not_feedable',
    releaseEvidenceInput.evidenceRefs.length > 0 ? '' : 'release_evidence_ref_required',
  ])
}

function manualGateCodes(releaseBlockers: string[]) {
  return unique(releaseBlockers.filter((blocker) => [
    'manual_publication_approval_required',
    'manual_promotion_after_canary_required',
    'domain_writer_runtime_publication_required',
  ].includes(blocker)))
}

function buildLiveReplayGateRow(input: {
  expectedTemplateIds: string[]
  releaseEvidenceClosure: T2RhythmReleaseEvidenceClosure
  liveReplayReleaseEvidenceInput?: T2RhythmLiveReplayReleaseEvidenceInput | null
  liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
}): T2RhythmReleaseClosureDiagnosticReport['gateScopeMatrix'][number] {
  const releaseEvidenceInput = input.liveReplayReleaseEvidenceInput ?? null
  const gate = releaseEvidenceInput?.liveReplayTrustGate ?? input.liveReplayTrustGate ?? null
  const blockingReasons = liveReplayEvidenceBlockingReasons(releaseEvidenceInput)
  const evidenceRefs = unique([
    ...(releaseEvidenceInput?.evidenceRefs ?? []),
    ...(releaseEvidenceInput ? [] : (gate?.passedGateCodes ?? []).map((code) => `live-replay:${code}`)),
  ])
  const selectedTemplateIds = releaseEvidenceInput?.selectedTemplateIds ?? gate?.selectedTemplateIds ?? []
  const readyForCurrentSelection = input.releaseEvidenceClosure.readyGateCodes.includes('archived_live_replay')
    && blockingReasons.length === 0
    && evidenceRefs.length > 0
    && coversAll(selectedTemplateIds, input.expectedTemplateIds)

  return {
    gateCode: 'archived_live_replay',
    status: gate?.status ?? 'missing',
    selectedTemplateIds,
    expectedTemplateIds: input.expectedTemplateIds,
    coversCurrentSelection: readyForCurrentSelection,
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    blockingReasons,
    mutationBoundary: gate?.mutationBoundary ?? noWriteMutationBoundary(),
  }
}

function buildPhase1GateRow(input: {
  expectedTemplateIds: string[]
  releaseEvidenceClosure: T2RhythmReleaseEvidenceClosure
  phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
}): T2RhythmReleaseClosureDiagnosticReport['gateScopeMatrix'][number] {
  const gate = input.phase1MultiNetworkSelectionTrustGate ?? null
  const evidenceRefs = unique(gate?.selectionEvidenceRefs ?? [])
  return {
    gateCode: 'c19_13_phase1_multinetwork_selection',
    status: gate?.status ?? 'missing',
    selectedTemplateIds: gate?.selectedTemplateIds ?? [],
    expectedTemplateIds: input.expectedTemplateIds,
    coversCurrentSelection: input.releaseEvidenceClosure.readyGateCodes.includes('c19_13_phase1_multinetwork_selection')
      && evidenceRefs.length > 0
      && coversAll(gate?.selectedTemplateIds ?? [], input.expectedTemplateIds),
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    blockingReasons: gate?.releaseBlockers ?? [],
    mutationBoundary: gate?.mutationBoundary ?? noWriteMutationBoundary(),
  }
}

function buildL5GateRow(input: {
  expectedTemplateIds: string[]
  releaseEvidenceClosure: T2RhythmReleaseEvidenceClosure
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
}): T2RhythmReleaseClosureDiagnosticReport['gateScopeMatrix'][number] {
  const gate = input.l5ReleaseGate ?? null
  const evidenceRefs = unique([
    ...(gate?.releasePackage?.evidenceRefs ?? []),
    ...(gate?.releasePackage?.rollbackTargetEvidenceRefs ?? []),
    ...(gate?.releasePackage?.consumerVerificationEvidenceRefs ?? []),
    ...(gate?.releasePackage?.impactMonitoringEvidenceRefs ?? []),
  ])
  return {
    gateCode: 'l5_canary_handoff',
    status: gate?.status ?? 'missing',
    selectedTemplateIds: gate?.releasePackage?.selectedTemplateIds ?? [],
    expectedTemplateIds: input.expectedTemplateIds,
    coversCurrentSelection: input.releaseEvidenceClosure.readyGateCodes.includes('l5_canary_handoff')
      && evidenceRefs.length > 0
      && coversAll(gate?.releasePackage?.selectedTemplateIds ?? [], input.expectedTemplateIds),
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    blockingReasons: gate?.releaseBlockers ?? [],
    mutationBoundary: gate?.mutationBoundary ?? noWriteMutationBoundary(),
  }
}

export function buildT2RhythmReleaseClosureDiagnosticReport(
  input: T2RhythmReleaseClosureDiagnosticInput,
): T2RhythmReleaseClosureDiagnosticReport {
  const liveReplayTrustGate = input.liveReplayReleaseEvidenceInput?.liveReplayTrustGate
    ?? input.liveReplayTrustGate
    ?? null
  const candidatePackage = buildT2RhythmScheduleCandidatePackage({
    ...input,
    liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: input.l5ReleaseGate,
  })
  const releaseEvidenceClosure = candidatePackage.standardLibraryReadiness.releaseEvidenceClosure
    ?? {
      source: 't2_rhythm_release_evidence_closure',
      status: 'blocked',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      requiredGateCodes: [
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ],
      readyGateCodes: [],
      blockingGateCodes: [
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ],
      templateScopeMismatchCodes: [],
      trustBoundary: 'blocked_release_evidence',
      releaseEvidenceRefs: [],
      canUseForRealScheduleCalibration: false,
      canUseForRealScheduleSelection: false,
      canEnterL5Canary: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      mutationBoundary: noWriteMutationBoundary(),
    } satisfies T2RhythmReleaseEvidenceClosure

  const gateScopeMatrix = [
    buildLiveReplayGateRow({
      expectedTemplateIds: candidatePackage.selectedTemplateIds,
      releaseEvidenceClosure,
      liveReplayReleaseEvidenceInput: input.liveReplayReleaseEvidenceInput,
      liveReplayTrustGate,
    }),
    buildPhase1GateRow({
      expectedTemplateIds: candidatePackage.selectedTemplateIds,
      releaseEvidenceClosure,
      phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate,
    }),
    buildL5GateRow({
      expectedTemplateIds: candidatePackage.selectedTemplateIds,
      releaseEvidenceClosure,
      l5ReleaseGate: input.l5ReleaseGate,
    }),
  ]
  const gateScopeBlockers = unique(gateScopeMatrix.flatMap((row) => row.coversCurrentSelection ? [] : row.blockingReasons))
  const scopeMismatchBlockers = releaseEvidenceClosure.templateScopeMismatchCodes
  const missingGateBlockers = releaseEvidenceClosure.blockingGateCodes.map((code) => `${code}_required`)
  const releaseBlockers = unique([
    ...candidatePackage.standardLibraryReadiness.releaseBlockers,
    ...gateScopeBlockers,
    ...scopeMismatchBlockers,
    ...missingGateBlockers,
  ])
  const readyForManualPublicationArtifact = releaseEvidenceClosure.status === 'ready_not_publishable'
    && gateScopeMatrix.every((row) => row.coversCurrentSelection)
  const releaseEvidenceRefs = unique([
    ...releaseEvidenceClosure.releaseEvidenceRefs,
    ...gateScopeMatrix.flatMap((row) => row.evidenceRefs),
  ])

  return {
    source: 't2_rhythm_release_closure_diagnostic_report',
    reportId: normalizeText(input.reportId) || 't2-release-closure-diagnostic',
    generatedAt: normalizeText(input.generatedAt) || new Date().toISOString(),
    status: readyForManualPublicationArtifact ? 'ready_not_publishable' : 'blocked',
    selectedTemplateIds: candidatePackage.selectedTemplateIds,
    candidatePackageStatus: candidatePackage.status,
    selectionCoverageStatus: candidatePackage.selectionCoverage.status,
    releaseEvidenceClosure,
    gateScopeMatrix,
    releaseAutomationGate: {
      source: 't2_rhythm_release_closure_automation_gate',
      status: readyForManualPublicationArtifact ? 'ready_for_manual_publication_artifact' : 'blocked',
      canEmitReleaseArtifact: readyForManualPublicationArtifact,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      requiredManualGateCodes: manualGateCodes(candidatePackage.standardLibraryReadiness.releaseBlockers),
      blockingReasons: readyForManualPublicationArtifact ? [] : releaseBlockers,
      artifactMode: 'v1_4_22_style_manual_publication_candidate',
    },
    releaseBlockers,
    releaseEvidenceRefs,
    mutationBoundary: releaseEvidenceClosure.mutationBoundary,
  }
}
