import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readJsonFile as readJsonEvidenceFile, writeJsonFile } from './jsonEvidenceUtils.js'

import {
  type T2RhythmReleaseClosureArtifact,
} from './generate-t2-rhythm-release-closure.js'
import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import {
  auditT2DivisionRhythmTemplateRegistry,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'

type ArtifactDigestRole =
  | 'archived_live_replay'
  | 'c19_13_phase1_multinetwork_selection'
  | 'l5_canary_handoff'

export type T2RhythmReleaseClosureArtifactVerification = {
  verificationCode: 'c19_t2_rhythm_release_closure_artifact_verification'
  status: 'pass' | 'fail'
  generatedAt: string
  artifactFile: string
  outputFile: string | null
  checks: {
    artifactStatusReady: boolean
    publicationDecisionReady: boolean
    inputDigestsMatch: boolean
    standardLibrarySnapshotCurrent: boolean
    sourceEvidenceRefsMatch: boolean
    noRuntimeWriteBoundary: boolean
    manualApprovalStillRequired: boolean
  }
  digestMismatches: Array<{
    role: ArtifactDigestRole
    path: string
    expectedSha256: string | null
    actualSha256: string | null
  }>
  standardLibrarySnapshotMismatches: string[]
  blockingReasons: string[]
}

export type T2RhythmReleaseClosureArtifactVerificationOptions = {
  artifactFile: string
  outputFile?: string | null
  generatedAt?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function readJsonFile<T>(path: string): T {
  return readJsonEvidenceFile<T>(path)
}

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function buildCurrentStandardLibrarySnapshot(selectedTemplateIds: string[]) {
  const audit = auditT2DivisionRhythmTemplateRegistry()
  const currentTemplateIds = new Set(T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => template.templateId))
  return {
    seedVersion: T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
    templateCount: audit.templateCount,
    businessTypeCount: audit.businessTypeCount,
    systemBusinessTypeCoverageStatus: audit.systemBusinessTypeCoverage.status,
    standardLibraryThicknessCoverageStatus: audit.standardLibraryThicknessCoverage.status,
    systemBusinessTypeCoverageRate: audit.systemBusinessTypeCoverage.coverageRate,
    standardLibraryThicknessCoverageRate: audit.standardLibraryThicknessCoverage.coverageRate,
    selectedTemplateIds,
    selectedTemplateCoverageStatus: selectedTemplateIds.every((templateId) => currentTemplateIds.has(templateId))
      ? 'covered_by_current_seed'
      : 'missing_from_current_seed',
    missingSelectedTemplateIds: selectedTemplateIds.filter((templateId) => !currentTemplateIds.has(templateId)),
  }
}

function buildInputDigestMismatches(artifact: T2RhythmReleaseClosureArtifact) {
  return artifact.provenance.inputFileDigests.flatMap((entry) => {
    const actualSha256 = sha256File(entry.path)
    return actualSha256 === entry.sha256
      ? []
      : [{
          role: entry.role,
          path: entry.path,
          expectedSha256: entry.sha256,
          actualSha256,
        }]
  })
}

function buildStandardLibrarySnapshotMismatches(
  artifact: T2RhythmReleaseClosureArtifact,
) {
  const archived = artifact.provenance.standardLibrarySnapshot
  const current = buildCurrentStandardLibrarySnapshot(artifact.report.selectedTemplateIds)
  return unique([
    archived.seedVersion === current.seedVersion ? '' : 'seed_version_mismatch',
    archived.templateCount === current.templateCount ? '' : 'template_count_mismatch',
    archived.businessTypeCount === current.businessTypeCount ? '' : 'business_type_count_mismatch',
    archived.systemBusinessTypeCoverageStatus === current.systemBusinessTypeCoverageStatus
      ? ''
      : 'system_business_type_coverage_status_mismatch',
    archived.standardLibraryThicknessCoverageStatus === current.standardLibraryThicknessCoverageStatus
      ? ''
      : 'standard_library_thickness_coverage_status_mismatch',
    archived.selectedTemplateCoverageStatus === current.selectedTemplateCoverageStatus
      ? ''
      : 'selected_template_coverage_status_mismatch',
    archived.missingSelectedTemplateIds.join('|') === current.missingSelectedTemplateIds.join('|')
      ? ''
      : 'missing_selected_template_ids_mismatch',
  ])
}

function hasNoRuntimeWriteBoundary(artifact: T2RhythmReleaseClosureArtifact) {
  const boundary = artifact.mutationBoundary
  return boundary.writesTaskDependencies === false
    && boundary.writesPlanDates === false
    && boundary.writesCriticalPathFacts === false
    && boundary.writesSeed === false
    && boundary.writesBaseline === false
    && boundary.writesRuntimePublications === false
    && artifact.publicationDecision.canAutoMaterializeTaskDependencies === false
    && artifact.publicationDecision.canAutoPublishRuntimeExperience === false
}

function sourceEvidenceRefsMatch(artifact: T2RhythmReleaseClosureArtifact) {
  const sourceEvidenceRefs = new Set((artifact.sourceEvidenceRefs ?? []).map(normalizeText).filter(Boolean))
  const releaseEvidenceRefs = new Set((artifact.report.releaseEvidenceRefs ?? []).map(normalizeText).filter(Boolean))
  if (sourceEvidenceRefs.size === 0 || releaseEvidenceRefs.size === 0) return false
  if (sourceEvidenceRefs.size !== releaseEvidenceRefs.size) return false
  for (const ref of sourceEvidenceRefs) {
    if (!releaseEvidenceRefs.has(ref)) return false
  }
  return true
}

export function verifyT2RhythmReleaseClosureArtifact(
  options: T2RhythmReleaseClosureArtifactVerificationOptions,
): T2RhythmReleaseClosureArtifactVerification {
  const artifactFile = normalizeText(options.artifactFile)
  const outputFile = normalizeText(options.outputFile) || null
  const artifact = readJsonFile<T2RhythmReleaseClosureArtifact>(artifactFile)
  const digestMismatches = buildInputDigestMismatches(artifact)
  const standardLibrarySnapshotMismatches = buildStandardLibrarySnapshotMismatches(artifact)
  const checks = {
    artifactStatusReady: artifact.status === 'manual_publication_candidate_ready',
    publicationDecisionReady: artifact.publicationDecision.status === 'manual_publication_candidate_ready'
      && artifact.publicationDecision.canEmitReleaseArtifact === true
      && artifact.publicationDecision.blockingReasons.length === 0,
    inputDigestsMatch: digestMismatches.length === 0,
    standardLibrarySnapshotCurrent: standardLibrarySnapshotMismatches.length === 0,
    sourceEvidenceRefsMatch: sourceEvidenceRefsMatch(artifact),
    noRuntimeWriteBoundary: hasNoRuntimeWriteBoundary(artifact),
    manualApprovalStillRequired: artifact.publicationDecision.canBypassManualApproval === false,
  }
  const blockingReasons = unique([
    checks.artifactStatusReady ? '' : 'release_closure_artifact_not_ready',
    checks.publicationDecisionReady ? '' : 'release_closure_publication_decision_not_ready',
    checks.inputDigestsMatch ? '' : 'release_closure_input_digest_mismatch',
    checks.standardLibrarySnapshotCurrent ? '' : 'release_closure_standard_library_snapshot_stale',
    checks.sourceEvidenceRefsMatch ? '' : 'release_closure_source_evidence_refs_mismatch',
    checks.noRuntimeWriteBoundary ? '' : 'release_closure_runtime_write_boundary_violation',
    checks.manualApprovalStillRequired ? '' : 'release_closure_manual_approval_boundary_missing',
  ])

  return {
    verificationCode: 'c19_t2_rhythm_release_closure_artifact_verification',
    status: blockingReasons.length === 0 ? 'pass' : 'fail',
    generatedAt: normalizeText(options.generatedAt) || new Date().toISOString(),
    artifactFile,
    outputFile,
    checks,
    digestMismatches,
    standardLibrarySnapshotMismatches,
    blockingReasons,
  }
}

export function writeT2RhythmReleaseClosureArtifactVerificationIfRequested(
  verification: T2RhythmReleaseClosureArtifactVerification,
) {
  if (!verification.outputFile) return
  writeJsonFile(verification.outputFile, verification)
}

export function shouldFailT2RhythmReleaseClosureArtifactVerification(
  verification: T2RhythmReleaseClosureArtifactVerification,
) {
  return verification.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseT2RhythmReleaseClosureArtifactVerificationOptionsFromArgs(
  argv: string[],
): T2RhythmReleaseClosureArtifactVerificationOptions {
  const args = argv.slice(2)
  return {
    artifactFile: parseStringArg(args, 'artifact-file') ?? '',
    outputFile: parseStringArg(args, 'output-file'),
    generatedAt: parseStringArg(args, 'generated-at'),
  }
}

function main() {
  const verification = verifyT2RhythmReleaseClosureArtifact(
    parseT2RhythmReleaseClosureArtifactVerificationOptionsFromArgs(process.argv),
  )
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested(verification)
  console.log(JSON.stringify(verification, null, 2))
  if (shouldFailT2RhythmReleaseClosureArtifactVerification(verification)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('verify-t2-rhythm-release-closure-artifact.ts')) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
