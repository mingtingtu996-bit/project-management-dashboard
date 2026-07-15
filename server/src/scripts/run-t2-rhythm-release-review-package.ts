import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile as readJsonEvidenceFile, resolveEvidencePath, writeJsonFile } from './jsonEvidenceUtils.js'

import type {
  T2RhythmLiveReplayDiagnosticReport,
} from './diagnose-t2-rhythm-live-replay.js'
import {
  buildT2RhythmReleaseClosureArtifact,
  type T2RhythmReleaseClosureArtifactOptions,
  writeT2RhythmReleaseClosureArtifactIfRequested,
} from './generate-t2-rhythm-release-closure.js'
import {
  buildT2RhythmManualReleaseReviewPreflight,
  writeT2RhythmManualReleaseReviewPreflightIfRequested,
} from './preflight-t2-rhythm-release-review.js'
import {
  verifyT2RhythmReleaseClosureArtifact,
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested,
} from './verify-t2-rhythm-release-closure-artifact.js'

export type T2RhythmReleaseReviewPackageChainOptions =
  Omit<T2RhythmReleaseClosureArtifactOptions, 'outputFile'> & {
    outputDir?: string | null
    artifactFile?: string | null
    verificationFile?: string | null
    preflightFile?: string | null
    manifestFile?: string | null
  }

export type T2RhythmReleaseReviewPackageChain = {
  chainCode: 'c19_t2_rhythm_release_review_package_chain'
  status: 'ready_for_manual_release_review' | 'blocked'
  generatedAt: string
  outputDir: string
  artifactFile: string
  verificationFile: string
  preflightFile: string
  manifestFile: string
  steps: Array<{
    stepCode:
      | 'generate_release_closure_artifact'
      | 'verify_release_closure_artifact'
      | 'preflight_manual_release_review'
    status: string
    outputFile: string
    blockingReasons: string[]
  }>
  checks: {
    artifactReady: boolean
    verificationPassed: boolean
    preflightReady: boolean
    manifestWritten: boolean
    runtimeWritersClosed: boolean
  }
  reviewPackage: {
    packageType: 't2_release_review_package_chain'
    canProceedToManualReview: boolean
    canAutoPublishRuntimeExperience: false
    canMaterializeTaskDependencies: false
    selectedTemplateIds: string[]
    releaseEvidenceRefs: string[]
    requiredReviewerActions: string[]
  }
  liveReplayAnnotationReviewPackage: T2RhythmLiveReplayDiagnosticReport['annotationReviewPackage']
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

function readJsonFile(path: string | null | undefined) {
  const normalized = normalizeText(path)
  if (!normalized) return null
  return readJsonEvidenceFile(normalized)
}

function extractLiveReplayAnnotationReviewPackage(
  payload: unknown,
): T2RhythmLiveReplayDiagnosticReport['annotationReviewPackage'] {
  const value = payload as {
    annotationReviewPackage?: T2RhythmLiveReplayDiagnosticReport['annotationReviewPackage']
    report?: {
      annotationReviewPackage?: T2RhythmLiveReplayDiagnosticReport['annotationReviewPackage']
    }
  } | null
  return value?.annotationReviewPackage ?? value?.report?.annotationReviewPackage ?? null
}

function noWriteMutationBoundary(): T2RhythmReleaseReviewPackageChain['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function resolveOutputPaths(options: T2RhythmReleaseReviewPackageChainOptions) {
  const outputDir = normalizeText(options.outputDir) || 'artifacts/t2-rhythm-release-review-package'
  return {
    outputDir,
    artifactFile: normalizeText(options.artifactFile) || join(outputDir, 'release-closure-artifact.json'),
    verificationFile: normalizeText(options.verificationFile) || join(outputDir, 'release-closure-verification.json'),
    preflightFile: normalizeText(options.preflightFile) || join(outputDir, 'manual-release-review-preflight.json'),
    manifestFile: normalizeText(options.manifestFile) || join(outputDir, 'release-review-package-manifest.json'),
  }
}

function runtimeWritersClosed(chain: Pick<T2RhythmReleaseReviewPackageChain, 'mutationBoundary' | 'reviewPackage'>) {
  const boundary = chain.mutationBoundary
  return boundary.writesTaskDependencies === false
    && boundary.writesPlanDates === false
    && boundary.writesCriticalPathFacts === false
    && boundary.writesSeed === false
    && boundary.writesBaseline === false
    && boundary.writesRuntimePublications === false
    && chain.reviewPackage.canAutoPublishRuntimeExperience === false
    && chain.reviewPackage.canMaterializeTaskDependencies === false
}

export function buildT2RhythmReleaseReviewPackageChain(
  options: T2RhythmReleaseReviewPackageChainOptions,
): T2RhythmReleaseReviewPackageChain {
  const paths = resolveOutputPaths(options)
  mkdirSync(paths.outputDir, { recursive: true })

  const generatedAt = normalizeText(options.generatedAt) || new Date().toISOString()
  const artifact = buildT2RhythmReleaseClosureArtifact({
    ...options,
    generatedAt,
    outputFile: paths.artifactFile,
  })
  writeT2RhythmReleaseClosureArtifactIfRequested(artifact)

  const verification = verifyT2RhythmReleaseClosureArtifact({
    artifactFile: paths.artifactFile,
    outputFile: paths.verificationFile,
    generatedAt,
  })
  writeT2RhythmReleaseClosureArtifactVerificationIfRequested(verification)

  const preflight = buildT2RhythmManualReleaseReviewPreflight({
    artifactFile: paths.artifactFile,
    verificationFile: paths.verificationFile,
    outputFile: paths.preflightFile,
  })
  writeT2RhythmManualReleaseReviewPreflightIfRequested(preflight)
  const liveReplayAnnotationReviewPackage = extractLiveReplayAnnotationReviewPackage(
    readJsonFile(options.liveReplayEvidenceFile),
  )

  const steps: T2RhythmReleaseReviewPackageChain['steps'] = [
    {
      stepCode: 'generate_release_closure_artifact',
      status: artifact.status,
      outputFile: paths.artifactFile,
      blockingReasons: artifact.publicationDecision.blockingReasons,
    },
    {
      stepCode: 'verify_release_closure_artifact',
      status: verification.status,
      outputFile: paths.verificationFile,
      blockingReasons: verification.blockingReasons,
    },
    {
      stepCode: 'preflight_manual_release_review',
      status: preflight.status,
      outputFile: paths.preflightFile,
      blockingReasons: preflight.blockingReasons,
    },
  ]
  const reviewPackage = {
    packageType: 't2_release_review_package_chain' as const,
    canProceedToManualReview: preflight.reviewPackage.canProceedToManualReview,
    canAutoPublishRuntimeExperience: false as const,
    canMaterializeTaskDependencies: false as const,
    selectedTemplateIds: preflight.reviewPackage.selectedTemplateIds,
    releaseEvidenceRefs: preflight.reviewPackage.releaseEvidenceRefs,
    requiredReviewerActions: unique([
      ...preflight.reviewPackage.requiredReviewerActions,
      liveReplayAnnotationReviewPackage
        ? 'review_live_replay_annotation_candidates_before_replay_release'
        : '',
    ]),
  }
  const mutationBoundary = noWriteMutationBoundary()
  const blockingReasons = unique(steps.flatMap((step) => step.blockingReasons))
  const status: T2RhythmReleaseReviewPackageChain['status'] = artifact.status === 'manual_publication_candidate_ready'
    && verification.status === 'pass'
    && preflight.status === 'ready_for_manual_release_review'
    && blockingReasons.length === 0
    ? 'ready_for_manual_release_review'
    : 'blocked'
  const chainWithoutChecks = {
    chainCode: 'c19_t2_rhythm_release_review_package_chain' as const,
    status,
    generatedAt,
    outputDir: paths.outputDir,
    artifactFile: paths.artifactFile,
    verificationFile: paths.verificationFile,
    preflightFile: paths.preflightFile,
    manifestFile: paths.manifestFile,
    steps,
    reviewPackage,
    liveReplayAnnotationReviewPackage,
    blockingReasons,
    mutationBoundary,
  }
  const chain: T2RhythmReleaseReviewPackageChain = {
    ...chainWithoutChecks,
    checks: {
      artifactReady: artifact.status === 'manual_publication_candidate_ready',
      verificationPassed: verification.status === 'pass',
      preflightReady: preflight.status === 'ready_for_manual_release_review',
      manifestWritten: Boolean(paths.manifestFile),
      runtimeWritersClosed: runtimeWritersClosed(chainWithoutChecks),
    },
  }
  writeT2RhythmReleaseReviewPackageChainIfRequested(chain)
  return chain
}

export function writeT2RhythmReleaseReviewPackageChainIfRequested(
  chain: T2RhythmReleaseReviewPackageChain,
) {
  if (!chain.manifestFile) return
  mkdirSync(resolveEvidencePath(chain.outputDir), { recursive: true })
  writeJsonFile(chain.manifestFile, chain)
}

export function shouldFailT2RhythmReleaseReviewPackageChain(
  chain: T2RhythmReleaseReviewPackageChain,
) {
  return chain.status !== 'ready_for_manual_release_review'
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

export function parseT2RhythmReleaseReviewPackageChainOptionsFromArgs(
  argv: string[],
): T2RhythmReleaseReviewPackageChainOptions {
  const args = argv.slice(2)
  return {
    reportId: parseStringArg(args, 'report-id'),
    generatedAt: parseStringArg(args, 'generated-at'),
    outputDir: parseStringArg(args, 'output-dir'),
    artifactFile: parseStringArg(args, 'artifact-file'),
    verificationFile: parseStringArg(args, 'verification-file'),
    preflightFile: parseStringArg(args, 'preflight-file'),
    manifestFile: parseStringArg(args, 'manifest-file'),
    liveReplayEvidenceFile: parseStringArg(args, 'live-replay-evidence-file'),
    phase1SelectionGateFile: parseStringArg(args, 'phase1-selection-gate-file'),
    l5ReleaseGateFile: parseStringArg(args, 'l5-release-gate-file'),
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
  const chain = buildT2RhythmReleaseReviewPackageChain(
    parseT2RhythmReleaseReviewPackageChainOptionsFromArgs(process.argv),
  )
  console.log(JSON.stringify(chain, null, 2))
  if (shouldFailT2RhythmReleaseReviewPackageChain(chain)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('run-t2-rhythm-release-review-package.ts')) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
