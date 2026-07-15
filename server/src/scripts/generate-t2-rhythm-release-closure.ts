import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readJsonFile as readJsonEvidenceFile, writeJsonFile } from './jsonEvidenceUtils.js'

import {
  buildT2RhythmReleaseClosureDiagnosticReport,
  type T2RhythmLiveReplayReleaseEvidenceInput,
  type T2RhythmReleaseClosureDiagnosticInput,
  type T2RhythmReleaseClosureDiagnosticReport,
} from '../services/t2RhythmReleaseClosureDiagnosticService.js'
import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import {
  auditT2DivisionRhythmTemplateRegistry,
  type T2RhythmPhase1MultiNetworkSelectionTrustGate,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'
import type {
  T2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'

export type T2RhythmReleaseClosureArtifactOptions =
  Omit<T2RhythmReleaseClosureDiagnosticInput, 'liveReplayReleaseEvidenceInput' | 'phase1MultiNetworkSelectionTrustGate' | 'l5ReleaseGate'> & {
    liveReplayEvidenceFile?: string | null
    phase1SelectionGateFile?: string | null
    l5ReleaseGateFile?: string | null
    outputFile?: string | null
    liveReplayReleaseEvidenceInput?: T2RhythmLiveReplayReleaseEvidenceInput | null
    phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
    l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
  }

export type T2RhythmReleaseClosureArtifact = {
  artifactCode: 'c19_t2_rhythm_release_closure_artifact'
  status: 'manual_publication_candidate_ready' | 'blocked'
  generatedAt: string
  outputFile: string | null
  missingOutputFile: boolean
  sourceFiles: {
    liveReplayEvidenceFile: string | null
    phase1SelectionGateFile: string | null
    l5ReleaseGateFile: string | null
  }
  provenance: {
    source: 't2_rhythm_release_closure_artifact_provenance'
    sourceFileCoverageStatus: 'ready' | 'blocked'
    missingSourceFileRoles: Array<'archived_live_replay' | 'c19_13_phase1_multinetwork_selection' | 'l5_canary_handoff'>
    inputFileDigests: Array<{
      role: 'archived_live_replay' | 'c19_13_phase1_multinetwork_selection' | 'l5_canary_handoff'
      path: string
      sha256: string
    }>
    standardLibrarySnapshot: {
      seedVersion: string
      templateCount: number
      businessTypeCount: number
      systemBusinessTypeCoverageStatus: 'ready' | 'blocked'
      standardLibraryThicknessCoverageStatus: 'ready' | 'needs_expansion'
      systemBusinessTypeCoverageRate: number
      standardLibraryThicknessCoverageRate: number
      selectedTemplateIds: string[]
      selectedTemplateCoverageStatus: 'covered_by_current_seed' | 'missing_from_current_seed'
      missingSelectedTemplateIds: string[]
    }
  }
  report: T2RhythmReleaseClosureDiagnosticReport
  sourceEvidenceRefs: string[]
  publicationDecision: {
    source: 't2_rhythm_release_closure_artifact_publication_decision'
    status: 'manual_publication_candidate_ready' | 'blocked'
    canEmitReleaseArtifact: boolean
    canBypassManualApproval: false
    canAutoMaterializeTaskDependencies: false
    canAutoPublishRuntimeExperience: false
    blockingReasons: string[]
  }
  mutationBoundary: T2RhythmReleaseClosureDiagnosticReport['mutationBoundary']
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function readJsonFile(path: string | null | undefined) {
  const normalized = normalizeText(path)
  if (!normalized) return null
  return readJsonEvidenceFile(normalized)
}

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sourceFileRoleEntries(options: T2RhythmReleaseClosureArtifactOptions) {
  return [
    {
      role: 'archived_live_replay' as const,
      path: normalizeText(options.liveReplayEvidenceFile),
    },
    {
      role: 'c19_13_phase1_multinetwork_selection' as const,
      path: normalizeText(options.phase1SelectionGateFile),
    },
    {
      role: 'l5_canary_handoff' as const,
      path: normalizeText(options.l5ReleaseGateFile),
    },
  ]
}

function buildInputFileDigests(options: T2RhythmReleaseClosureArtifactOptions) {
  return sourceFileRoleEntries(options)
    .filter((entry) => Boolean(entry.path))
    .map((entry) => ({
      role: entry.role,
      path: entry.path,
      sha256: sha256File(entry.path),
    }))
}

function buildMissingSourceFileRoles(options: T2RhythmReleaseClosureArtifactOptions) {
  return sourceFileRoleEntries(options)
    .filter((entry) => !entry.path)
    .map((entry) => entry.role)
}

function buildStandardLibrarySnapshot(selectedTemplateIds: string[]) {
  const audit = auditT2DivisionRhythmTemplateRegistry()
  const currentTemplateIds = new Set(T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => template.templateId))
  const missingSelectedTemplateIds = selectedTemplateIds
    .filter((templateId) => !currentTemplateIds.has(templateId))
  return {
    seedVersion: T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
    templateCount: audit.templateCount,
    businessTypeCount: audit.businessTypeCount,
    systemBusinessTypeCoverageStatus: audit.systemBusinessTypeCoverage.status,
    standardLibraryThicknessCoverageStatus: audit.standardLibraryThicknessCoverage.status,
    systemBusinessTypeCoverageRate: audit.systemBusinessTypeCoverage.coverageRate,
    standardLibraryThicknessCoverageRate: audit.standardLibraryThicknessCoverage.coverageRate,
    selectedTemplateIds,
    selectedTemplateCoverageStatus: missingSelectedTemplateIds.length === 0
      ? 'covered_by_current_seed' as const
      : 'missing_from_current_seed' as const,
    missingSelectedTemplateIds,
  }
}

function extractLiveReplayReleaseEvidenceInput(
  payload: unknown,
): T2RhythmLiveReplayReleaseEvidenceInput | null {
  const value = payload as {
    releaseEvidenceInput?: T2RhythmLiveReplayReleaseEvidenceInput
    liveReplayReleaseEvidenceInput?: T2RhythmLiveReplayReleaseEvidenceInput
    source?: string
  } | null
  if (!value) return null
  if (value.releaseEvidenceInput) return value.releaseEvidenceInput
  if (value.liveReplayReleaseEvidenceInput) return value.liveReplayReleaseEvidenceInput
  return value.source === 't2_live_replay_release_evidence_input'
    ? value as T2RhythmLiveReplayReleaseEvidenceInput
    : null
}

function extractPhase1MultiNetworkSelectionTrustGate(
  payload: unknown,
): T2RhythmPhase1MultiNetworkSelectionTrustGate | null {
  const value = payload as {
    phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate
    source?: string
  } | null
  if (!value) return null
  if (value.phase1MultiNetworkSelectionTrustGate) return value.phase1MultiNetworkSelectionTrustGate
  return value.source === 't2_rhythm_phase1_multinetwork_selection_trust_gate'
    ? value as T2RhythmPhase1MultiNetworkSelectionTrustGate
    : null
}

function extractL5ReleaseGate(payload: unknown): T2RhythmStandardLibraryL5ReleaseGate | null {
  const value = payload as {
    l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate
    source?: string
  } | null
  if (!value) return null
  if (value.l5ReleaseGate) return value.l5ReleaseGate
  return value.source === 't2_rhythm_standard_library_l5_release_gate'
    ? value as T2RhythmStandardLibraryL5ReleaseGate
    : null
}

export function buildT2RhythmReleaseClosureArtifact(
  options: T2RhythmReleaseClosureArtifactOptions,
): T2RhythmReleaseClosureArtifact {
  const outputFile = normalizeText(options.outputFile) || null
  const generatedAt = normalizeText(options.generatedAt) || new Date().toISOString()
  const liveReplayReleaseEvidenceInput = options.liveReplayReleaseEvidenceInput
    ?? extractLiveReplayReleaseEvidenceInput(readJsonFile(options.liveReplayEvidenceFile))
  const phase1MultiNetworkSelectionTrustGate = options.phase1MultiNetworkSelectionTrustGate
    ?? extractPhase1MultiNetworkSelectionTrustGate(readJsonFile(options.phase1SelectionGateFile))
  const l5ReleaseGate = options.l5ReleaseGate
    ?? extractL5ReleaseGate(readJsonFile(options.l5ReleaseGateFile))
  const report = buildT2RhythmReleaseClosureDiagnosticReport({
    ...options,
    generatedAt,
    liveReplayReleaseEvidenceInput,
    phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate,
  })
  const blockingReasons = unique([
    ...report.releaseAutomationGate.blockingReasons,
    outputFile ? '' : 'release_closure_output_file_required',
  ])
  const missingSourceFileRoles = buildMissingSourceFileRoles(options)
  const provenance = {
    source: 't2_rhythm_release_closure_artifact_provenance' as const,
    sourceFileCoverageStatus: missingSourceFileRoles.length === 0 ? 'ready' as const : 'blocked' as const,
    missingSourceFileRoles,
    inputFileDigests: buildInputFileDigests(options),
    standardLibrarySnapshot: buildStandardLibrarySnapshot(report.selectedTemplateIds),
  }
  const provenanceBlockers = unique([
    missingSourceFileRoles.length === 0 ? '' : 'release_closure_source_files_required',
    provenance.standardLibrarySnapshot.selectedTemplateCoverageStatus === 'covered_by_current_seed'
      ? ''
      : 'selected_t2_template_missing_from_current_seed',
  ])
  const canEmitReleaseArtifact = report.releaseAutomationGate.canEmitReleaseArtifact
    && Boolean(outputFile)
    && provenance.sourceFileCoverageStatus === 'ready'
    && provenance.standardLibrarySnapshot.selectedTemplateCoverageStatus === 'covered_by_current_seed'
  const status = canEmitReleaseArtifact ? 'manual_publication_candidate_ready' : 'blocked'

  return {
    artifactCode: 'c19_t2_rhythm_release_closure_artifact',
    status,
    generatedAt,
    outputFile,
    missingOutputFile: !outputFile,
    sourceFiles: {
      liveReplayEvidenceFile: normalizeText(options.liveReplayEvidenceFile) || null,
      phase1SelectionGateFile: normalizeText(options.phase1SelectionGateFile) || null,
      l5ReleaseGateFile: normalizeText(options.l5ReleaseGateFile) || null,
    },
    provenance,
    report,
    sourceEvidenceRefs: [...report.releaseEvidenceRefs],
    publicationDecision: {
      source: 't2_rhythm_release_closure_artifact_publication_decision',
      status,
      canEmitReleaseArtifact,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      blockingReasons: canEmitReleaseArtifact ? [] : unique([
        ...blockingReasons,
        ...provenanceBlockers,
      ]),
    },
    mutationBoundary: report.mutationBoundary,
  }
}

export function writeT2RhythmReleaseClosureArtifactIfRequested(
  artifact: T2RhythmReleaseClosureArtifact,
) {
  if (!artifact.outputFile) return
  writeJsonFile(artifact.outputFile, artifact)
}

export function shouldFailT2RhythmReleaseClosureArtifact(
  artifact: T2RhythmReleaseClosureArtifact,
) {
  return artifact.status !== 'manual_publication_candidate_ready'
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

export function parseT2RhythmReleaseClosureArtifactOptionsFromArgs(
  argv: string[],
): T2RhythmReleaseClosureArtifactOptions {
  const args = argv.slice(2)
  return {
    reportId: parseStringArg(args, 'report-id'),
    generatedAt: parseStringArg(args, 'generated-at'),
    liveReplayEvidenceFile: parseStringArg(args, 'live-replay-evidence-file'),
    phase1SelectionGateFile: parseStringArg(args, 'phase1-selection-gate-file'),
    l5ReleaseGateFile: parseStringArg(args, 'l5-release-gate-file'),
    outputFile: parseStringArg(args, 'output-file'),
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

function main() {
  const artifact = buildT2RhythmReleaseClosureArtifact(
    parseT2RhythmReleaseClosureArtifactOptionsFromArgs(process.argv),
  )
  writeT2RhythmReleaseClosureArtifactIfRequested(artifact)
  console.log(JSON.stringify(artifact, null, 2))
  if (shouldFailT2RhythmReleaseClosureArtifact(artifact)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('generate-t2-rhythm-release-closure.ts')) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
