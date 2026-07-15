#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const READINESS_CHECKER = path.join(SCRIPT_DIR, 'check-default-master-plan-production-readiness.mjs')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles', 'default-master-plan-profile-samples.json')
const DEFAULT_RESIDENTIAL_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'current-default-master-plan-wbs-residential.md')
const DEFAULT_RUNTIME_EVIDENCE_FILES = {
  durationCalibrationEvidence: 'duration-calibration-evidence.json',
  dependencyWriterEvidence: 'dependency-writer-evidence.json',
  runtimePublicationEvidence: 'runtime-publication-evidence.json',
  postPublishSmokeRollbackEvidence: 'post-publish-smoke-rollback-evidence.json',
}
const DEFAULT_SUPPORTING_EVIDENCE_FILES = {
  runtimeSeedEvidencePipeline: 'runtime-seed-evidence-pipeline.json',
  durationSampleCollectionPackage: 'duration-sample-collection-package.json',
  durationSampleCoverageEvidence: 'duration-sample-coverage-evidence.json',
}
const DEFAULT_SOURCE_MANIFEST = path.join('source-exports', 'source-exports-manifest.json')

const REQUIRED_EVIDENCE_ARGS = [
  ['durationCalibrationEvidence', '--duration-calibration-evidence'],
  ['dependencyWriterEvidence', '--dependency-writer-evidence'],
  ['runtimePublicationEvidence', '--runtime-publication-evidence'],
  ['postPublishSmokeRollbackEvidence', '--post-publish-smoke-rollback-evidence'],
]
const EVIDENCE_BUILDERS = {
  durationCalibrationEvidence: 'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs',
  dependencyWriterEvidence: 'project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs',
  runtimePublicationEvidence: 'project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs',
  postPublishSmokeRollbackEvidence: 'project-testing/tools/build-default-master-plan-post-publish-smoke-rollback-evidence.mjs',
}
const SUPPORTING_EVIDENCE_ARGS = [
  ['runtimeSeedEvidencePipeline', '--runtime-seed-evidence-pipeline'],
  ['durationSampleCollectionPackage', '--duration-sample-collection-package'],
  ['durationSampleCoverageEvidence', '--duration-sample-coverage-evidence'],
]
const SUPPORTING_EVIDENCE_BUILDERS = {
  runtimeSeedEvidencePipeline: 'project-testing/tools/run-default-master-plan-runtime-seed-evidence-pipeline.mjs',
  durationSampleCollectionPackage: 'project-testing/tools/build-default-master-plan-duration-sample-collection-package.mjs',
  durationSampleCoverageEvidence: 'project-testing/tools/verify-default-master-plan-duration-sample-coverage.mjs',
}
const ALL_EVIDENCE_BUILDERS = {
  ...EVIDENCE_BUILDERS,
  ...SUPPORTING_EVIDENCE_BUILDERS,
}
const EVIDENCE_ACTIONS = {
  durationCalibrationEvidence: {
    gate: 'runtime_duration_calibration_evidence',
    builder: EVIDENCE_BUILDERS.durationCalibrationEvidence,
    requiredInputs: [
      'duration_experience_samples export for the target project',
      'source export metadata with exported_at, exported_by, and staging/production/live environment',
      'accepted active benchmark samples with runtime task identity and actual duration',
      'calibration actor and timestamp',
    ],
    mutationBoundary: 'read-only evidence normalization; does not write samples, seeds, or runtime publication',
  },
  dependencyWriterEvidence: {
    gate: 'production_dependency_writer_evidence',
    builder: EVIDENCE_BUILDERS.dependencyWriterEvidence,
    requiredInputs: [
      'explicit execute-mode dependency writer result',
      'task_dependencies export from the same execution chain',
      'critical-path readback for the same baseline and project',
      'source export metadata on writer result, task_dependencies export, and critical-path readback',
    ],
    mutationBoundary: 'read-only post-execute evidence normalization; does not execute writer, write task_dependencies, or recalculate critical path',
  },
  runtimePublicationEvidence: {
    gate: 'runtime_publication_evidence',
    builder: EVIDENCE_BUILDERS.runtimePublicationEvidence,
    requiredInputs: [
      'wbs_template_runtime_publications export',
      'source export metadata with exported_at, exported_by, and staging/production/live environment',
      'published default master-plan row matching baseline and project',
      'lineage refs for duration calibration and dependency writer evidence',
    ],
    mutationBoundary: 'read-only evidence normalization; does not publish runtime asset or rollback',
  },
  postPublishSmokeRollbackEvidence: {
    gate: 'post_publish_smoke_and_rollback_evidence',
    builder: EVIDENCE_BUILDERS.postPublishSmokeRollbackEvidence,
    requiredInputs: [
      'real-environment API read smoke with baseline/project/publication identity',
      'real-environment UI consumption smoke with baseline/project/publication identity',
      'critical-path readback and rollback verification for the same publication',
      'source export metadata on each smoke/readback/rollback evidence file',
    ],
    mutationBoundary: 'read-only evidence packaging; does not run browser/API smoke or rollback',
  },
}

function parseArgs(argv) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    profileReport: DEFAULT_PROFILE_REPORT,
    residentialReport: DEFAULT_RESIDENTIAL_REPORT,
    runtimeSeedEvidencePipeline: null,
    durationCalibrationEvidence: null,
    durationSampleCollectionPackage: null,
    durationSampleCoverageEvidence: null,
    dependencyWriterEvidence: null,
    runtimePublicationEvidence: null,
    postPublishSmokeRollbackEvidence: null,
    sourceManifest: null,
    useDefaultEvidence: true,
    failOnNotReady: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--profile-report') {
      args.profileReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--residential-report') {
      args.residentialReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-seed-evidence-pipeline') {
      args.runtimeSeedEvidencePipeline = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-calibration-evidence') {
      args.durationCalibrationEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-collection-package') {
      args.durationSampleCollectionPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-coverage-evidence') {
      args.durationSampleCoverageEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--dependency-writer-evidence') {
      args.dependencyWriterEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-publication-evidence') {
      args.runtimePublicationEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--post-publish-smoke-rollback-evidence') {
      args.postPublishSmokeRollbackEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--source-manifest') {
      args.sourceManifest = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--no-default-evidence') {
      args.useDefaultEvidence = false
    } else if (arg === '--fail-on-not-ready') {
      args.failOnNotReady = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs [--output-root <dir>] [--profile-report <json>] [--residential-report <md>] [--runtime-seed-evidence-pipeline <json>] [--duration-sample-collection-package <json>] [--duration-sample-coverage-evidence <json>] [--duration-calibration-evidence <json>] [--dependency-writer-evidence <json>] [--runtime-publication-evidence <json>] [--post-publish-smoke-rollback-evidence <json>] [--source-manifest <json>] [--fail-on-not-ready]`)
      process.exit(0)
    }
  }
  return args
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function applyDefaultRuntimeEvidencePaths(args) {
  if (!args.useDefaultEvidence) return args
  for (const [key, fileName] of Object.entries(DEFAULT_RUNTIME_EVIDENCE_FILES)) {
    if (args[key]) continue
    const defaultPath = path.join(args.outputRoot, fileName)
    if (await fileExists(defaultPath)) {
      args[key] = defaultPath
    }
  }
  for (const [key, fileName] of Object.entries(DEFAULT_SUPPORTING_EVIDENCE_FILES)) {
    if (args[key]) continue
    const defaultPath = path.join(args.outputRoot, fileName)
    if (await fileExists(defaultPath)) {
      args[key] = defaultPath
    }
  }
  if (!args.sourceManifest) {
    const defaultPath = path.join(args.outputRoot, DEFAULT_SOURCE_MANIFEST)
    if (await fileExists(defaultPath)) {
      args.sourceManifest = defaultPath
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

async function fileHash(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function evidenceFileRecord(type, filePath) {
  if (!filePath) return null
  try {
    const stat = await fs.stat(filePath)
    return {
      type,
      path: repoRelative(filePath),
      exists: true,
      sizeBytes: stat.size,
      sha256: await fileHash(filePath),
      expectedBuilder: ALL_EVIDENCE_BUILDERS[type] ?? null,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return {
      type,
      path: repoRelative(filePath),
      exists: false,
      sizeBytes: 0,
      sha256: null,
      expectedBuilder: ALL_EVIDENCE_BUILDERS[type] ?? null,
    }
  }
}

async function sourceManifestRecord(filePath) {
  if (!filePath) {
    return {
      path: '',
      exists: false,
      sha256: null,
      blockers: ['source_export_manifest_required'],
    }
  }
  try {
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'))
    const stat = await fs.stat(filePath)
    const blockers = [
      String(payload.status ?? '').trim() === 'exported' ? null : 'source_export_manifest_not_exported',
      String(payload.exportSessionId ?? payload.export_session_id ?? '').trim() ? null : 'source_export_manifest_session_id_required',
    ].filter(Boolean)
    return {
      path: repoRelative(filePath),
      exists: true,
      sizeBytes: stat.size,
      sha256: await fileHash(filePath),
      status: String(payload.status ?? '').trim(),
      exportSessionId: String(payload.exportSessionId ?? payload.export_session_id ?? '').trim(),
      blockers,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return {
      path: repoRelative(filePath),
      exists: false,
      sha256: null,
      blockers: ['source_export_manifest_missing'],
    }
  }
}

function buildCheckerArgs(args) {
  const checkerArgs = [
    READINESS_CHECKER,
    '--profile-report',
    args.profileReport,
    '--residential-report',
    args.residentialReport,
    '--output-root',
    args.outputRoot,
  ]
  for (const [key, cliArg] of REQUIRED_EVIDENCE_ARGS) {
    if (args[key]) checkerArgs.push(cliArg, args[key])
  }
  for (const [key, cliArg] of SUPPORTING_EVIDENCE_ARGS) {
    if (args[key]) checkerArgs.push(cliArg, args[key])
  }
  if (args.sourceManifest) checkerArgs.push('--source-manifest', args.sourceManifest)
  return checkerArgs
}

const args = await applyDefaultRuntimeEvidencePaths(parseArgs(process.argv.slice(2)))
await fs.mkdir(args.outputRoot, { recursive: true })

const checkerArgs = buildCheckerArgs(args)
const checkerResult = await execFileAsync(process.execPath, checkerArgs, {
  cwd: REPO_ROOT,
  maxBuffer: 1024 * 1024 * 10,
})
const readinessJsonPath = path.join(args.outputRoot, 'readiness.json')
const readinessMarkdownPath = path.join(args.outputRoot, 'readiness.md')
const readinessReport = JSON.parse(await fs.readFile(readinessJsonPath, 'utf8'))
const evidenceFiles = (await Promise.all(REQUIRED_EVIDENCE_ARGS.map(([key]) => evidenceFileRecord(key, args[key]))))
  .filter((item) => item && item.exists)
const supportingEvidenceFiles = (await Promise.all(SUPPORTING_EVIDENCE_ARGS.map(([key]) => evidenceFileRecord(key, args[key]))))
  .filter((item) => item && item.exists)
const sourceManifest = await sourceManifestRecord(args.sourceManifest)
const missingEvidenceTypes = REQUIRED_EVIDENCE_ARGS
  .filter(([key]) => !args[key] || !evidenceFiles.some((item) => item.type === key))
  .map(([key]) => key)
const nextEvidenceActions = missingEvidenceTypes.map((type) => ({
  type,
  ...EVIDENCE_ACTIONS[type],
}))
const productionReady = Boolean(readinessReport.productionReady) && sourceManifest.blockers.length === 0
const status = productionReady
  ? 'production_ready_evidence_bundle_complete'
  : readinessReport.status === 'staging_runtime_chain_passed' && sourceManifest.blockers.length === 0
    ? 'staging_runtime_chain_passed'
    : 'blocked'
const bundle = {
  schemaVersion: 'workbuddy-default-master-plan-production-evidence-bundle/v1',
  generatedAt: new Date().toISOString(),
  source: 'build-default-master-plan-production-evidence-bundle',
  status,
  productionReady,
  outputRoot: repoRelative(args.outputRoot),
  profileReport: repoRelative(args.profileReport),
  residentialReport: repoRelative(args.residentialReport),
  evidenceFiles,
  supportingEvidenceFiles,
  sourceManifest,
  sourceManifestBlockers: sourceManifest.blockers,
  productionReadinessBlockers: Array.isArray(readinessReport.productionReadinessBlockers)
    ? readinessReport.productionReadinessBlockers
    : [],
  evidenceQualification: readinessReport.evidenceQualification ?? null,
  evidenceBuilderIndex: REQUIRED_EVIDENCE_ARGS.map(([key]) => ({
    type: key,
    builder: EVIDENCE_BUILDERS[key] ?? null,
    requiredForRuntime: true,
  })),
  supportingEvidenceBuilderIndex: SUPPORTING_EVIDENCE_ARGS.map(([key]) => ({
    type: key,
    builder: SUPPORTING_EVIDENCE_BUILDERS[key] ?? null,
  })),
  missingEvidenceTypes,
  nextEvidenceActions,
  readinessReport: {
    status: readinessReport.status,
    productionReady: Boolean(readinessReport.productionReady),
    runtimeEvidenceChainPassed: Boolean(readinessReport.runtimeEvidenceChainPassed),
    productionReadinessBlockers: Array.isArray(readinessReport.productionReadinessBlockers)
      ? readinessReport.productionReadinessBlockers
      : [],
    currentEvidenceLevel: readinessReport.currentEvidenceLevel,
    requiredEvidenceLevel: readinessReport.requiredEvidenceLevel,
    jsonPath: repoRelative(readinessJsonPath),
    markdownPath: repoRelative(readinessMarkdownPath),
    blockedGateCount: Array.isArray(readinessReport.gates)
      ? readinessReport.gates.filter((gate) => gate.status === 'blocked').length
      : null,
    failingGateCount: Array.isArray(readinessReport.gates)
      ? readinessReport.gates.filter((gate) => gate.status === 'fail').length
      : null,
  },
  checker: {
    command: [process.execPath, ...checkerArgs.map((arg) => repoRelative(arg).startsWith('..') ? arg : repoRelative(arg))],
    stdout: checkerResult.stdout,
  },
  mutationBoundary: {
    readsLocalReports: true,
    readsEvidenceFiles: true,
    invokesRuntimeWriters: false,
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  },
}

const bundlePath = path.join(args.outputRoot, 'evidence-bundle.json')
await fs.writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: bundle.status,
  productionReady: bundle.productionReady,
  outputRoot: bundle.outputRoot,
  bundlePath: repoRelative(bundlePath),
  readinessJsonPath: bundle.readinessReport.jsonPath,
  missingEvidenceTypes: bundle.missingEvidenceTypes,
}, null, 2))

if (args.failOnNotReady && !bundle.productionReady) {
  process.exitCode = 1
}
