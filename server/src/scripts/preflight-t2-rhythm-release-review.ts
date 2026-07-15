import { readFileSync } from 'node:fs'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

import type {
  T2RhythmReleaseClosureArtifact,
} from './generate-t2-rhythm-release-closure.js'
import type {
  T2RhythmReleaseClosureArtifactVerification,
} from './verify-t2-rhythm-release-closure-artifact.js'

export type T2RhythmManualReleaseReviewPreflightOptions = {
  artifactFile?: string | null
  verificationFile?: string | null
  outputFile?: string | null
}

export type T2RhythmManualReleaseReviewPreflight = {
  preflightCode: 'c19_t2_rhythm_manual_release_review_preflight'
  status: 'ready_for_manual_release_review' | 'blocked'
  generatedAt: string
  artifactFile: string | null
  verificationFile: string | null
  outputFile: string | null
  checks: {
    artifactVerified: boolean
    releaseEvidenceClosureReady: boolean
    allRequiredEvidenceGatesReady: boolean
    manualApprovalGatePresent: boolean
    sourceEvidenceRefsVerified: boolean
    runtimeWritersClosed: boolean
    sourceFilesDigestVerified: boolean
    standardLibrarySnapshotVerified: boolean
  }
  reviewPackage: {
    packageType: 't2_manual_release_review_preflight'
    canProceedToManualReview: boolean
    canAutoPublishRuntimeExperience: false
    canMaterializeTaskDependencies: false
    selectedTemplateIds: string[]
    releaseEvidenceRefs: string[]
    requiredReviewerActions: string[]
    artifactFile: string | null
    verificationFile: string | null
  }
  blockingReasons: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function readJson<T>(path: string | null | undefined): T | null {
  const normalized = normalizeText(path)
  if (!normalized) return null
  return readJsonFile<T>(normalized)
}

function closedMutationBoundary(): T2RhythmManualReleaseReviewPreflight['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function runtimeWritersClosed(artifact: T2RhythmReleaseClosureArtifact | null) {
  const boundary = artifact?.mutationBoundary
  return Boolean(
    boundary
      && boundary.writesTaskDependencies === false
      && boundary.writesPlanDates === false
      && boundary.writesCriticalPathFacts === false
      && boundary.writesSeed === false
      && boundary.writesBaseline === false
      && boundary.writesRuntimePublications === false
      && artifact?.publicationDecision?.canAutoMaterializeTaskDependencies === false
      && artifact?.publicationDecision?.canAutoPublishRuntimeExperience === false,
  )
}

function manualApprovalGatePresent(artifact: T2RhythmReleaseClosureArtifact | null) {
  const manualGateCodes = artifact?.report?.releaseAutomationGate?.requiredManualGateCodes ?? []
  return Boolean(
    artifact?.publicationDecision?.canBypassManualApproval === false
      && manualGateCodes.includes('manual_publication_approval_required')
      && manualGateCodes.includes('manual_promotion_after_canary_required')
      && manualGateCodes.includes('domain_writer_runtime_publication_required'),
  )
}

function allRequiredEvidenceGatesReady(artifact: T2RhythmReleaseClosureArtifact | null) {
  const closure = artifact?.report?.releaseEvidenceClosure
  const requiredGateCodes = closure?.requiredGateCodes ?? []
  const readyGateCodes = closure?.readyGateCodes ?? []
  return requiredGateCodes.length === 3
    && requiredGateCodes.every((gateCode) => readyGateCodes.includes(gateCode))
    && (closure?.blockingGateCodes ?? []).length === 0
    && (closure?.templateScopeMismatchCodes ?? []).length === 0
}

export function buildT2RhythmManualReleaseReviewPreflight(
  options: T2RhythmManualReleaseReviewPreflightOptions,
): T2RhythmManualReleaseReviewPreflight {
  const artifactFile = normalizeText(options.artifactFile) || null
  const verificationFile = normalizeText(options.verificationFile) || null
  const outputFile = normalizeText(options.outputFile) || null
  const artifact = readJson<T2RhythmReleaseClosureArtifact>(artifactFile)
  const verification = readJson<T2RhythmReleaseClosureArtifactVerification>(verificationFile)
  const checks = {
    artifactVerified: verification?.status === 'pass',
    releaseEvidenceClosureReady: artifact?.report?.releaseEvidenceClosure?.status === 'ready_not_publishable',
    allRequiredEvidenceGatesReady: allRequiredEvidenceGatesReady(artifact),
    manualApprovalGatePresent: manualApprovalGatePresent(artifact),
    sourceEvidenceRefsVerified: verification?.checks?.sourceEvidenceRefsMatch === true,
    runtimeWritersClosed: runtimeWritersClosed(artifact),
    sourceFilesDigestVerified: verification?.checks?.inputDigestsMatch === true,
    standardLibrarySnapshotVerified: verification?.checks?.standardLibrarySnapshotCurrent === true,
  }
  const blockingReasons = unique([
    artifact ? '' : 'release_closure_artifact_required',
    verification ? '' : 'release_closure_artifact_verification_file_required',
    checks.artifactVerified ? '' : 'release_closure_artifact_verification_required',
    ...(verification?.blockingReasons ?? []),
    checks.releaseEvidenceClosureReady ? '' : 'release_evidence_closure_ready_required',
    checks.allRequiredEvidenceGatesReady ? '' : 'release_evidence_gate_closure_required',
    checks.manualApprovalGatePresent ? '' : 'release_review_manual_approval_gate_required',
    checks.sourceEvidenceRefsVerified ? '' : 'release_review_source_evidence_refs_verification_required',
    checks.runtimeWritersClosed ? '' : 'release_review_runtime_writers_must_remain_closed',
    checks.sourceFilesDigestVerified ? '' : 'release_review_source_file_digest_verification_required',
    checks.standardLibrarySnapshotVerified ? '' : 'release_review_standard_library_snapshot_verification_required',
  ])
  const status = blockingReasons.length === 0 ? 'ready_for_manual_release_review' : 'blocked'

  return {
    preflightCode: 'c19_t2_rhythm_manual_release_review_preflight',
    status,
    generatedAt: new Date().toISOString(),
    artifactFile,
    verificationFile,
    outputFile,
    checks,
    reviewPackage: {
      packageType: 't2_manual_release_review_preflight',
      canProceedToManualReview: status === 'ready_for_manual_release_review',
      canAutoPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      selectedTemplateIds: artifact?.report?.selectedTemplateIds ?? [],
      releaseEvidenceRefs: artifact?.report?.releaseEvidenceRefs ?? [],
      requiredReviewerActions: [
        'review_release_closure_artifact',
        'review_release_closure_artifact_verification',
        'approve_or_reject_l5_canary_handoff',
        'confirm_domain_writer_runtime_publication_remains_disabled',
      ],
      artifactFile,
      verificationFile,
    },
    blockingReasons,
    mutationBoundary: closedMutationBoundary(),
  }
}

export function writeT2RhythmManualReleaseReviewPreflightIfRequested(
  preflight: T2RhythmManualReleaseReviewPreflight,
) {
  if (!preflight.outputFile) return
  writeJsonFile(preflight.outputFile, preflight)
}

export function shouldFailT2RhythmManualReleaseReviewPreflight(
  preflight: T2RhythmManualReleaseReviewPreflight,
) {
  return preflight.status !== 'ready_for_manual_release_review'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseT2RhythmManualReleaseReviewPreflightOptionsFromArgs(
  argv: string[],
): T2RhythmManualReleaseReviewPreflightOptions {
  const args = argv.slice(2)
  return {
    artifactFile: parseStringArg(args, 'artifact-file'),
    verificationFile: parseStringArg(args, 'verification-file'),
    outputFile: parseStringArg(args, 'output-file'),
  }
}

function main() {
  const preflight = buildT2RhythmManualReleaseReviewPreflight(
    parseT2RhythmManualReleaseReviewPreflightOptionsFromArgs(process.argv),
  )
  writeT2RhythmManualReleaseReviewPreflightIfRequested(preflight)
  console.log(JSON.stringify(preflight, null, 2))
  if (shouldFailT2RhythmManualReleaseReviewPreflight(preflight)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('preflight-t2-rhythm-release-review.ts')) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
