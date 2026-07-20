#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  defaultMasterPlanFallbackAppliedSourceSignal,
  defaultMasterPlanStructuredSourceSignals,
  defaultMasterPlanLikeSourceLabel,
  legacyDefaultMasterPlanSourceLabel,
  retiredOrLowInformationDefaultMasterPlanSource,
  supportedDefaultMasterPlanSourceLabel,
} from './default-master-plan-source-guard.mjs'

const execFileAsync = promisify(execFile)
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles', 'default-master-plan-profile-samples.json')
const DEFAULT_RESIDENTIAL_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'current-default-master-plan-wbs-residential.md')
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])

const TOOLS = {
  runtimeSeedPipeline: path.join(SCRIPT_DIR, 'run-default-master-plan-runtime-seed-evidence-pipeline.mjs'),
  runtimeSeedImportExecution: path.join(SCRIPT_DIR, 'run-default-master-plan-runtime-seed-import-execution.mjs'),
  candidateHygiene: path.join(SCRIPT_DIR, 'check-default-master-plan-candidate-export-hygiene.mjs'),
  candidateRefreshPackage: path.join(SCRIPT_DIR, 'build-default-master-plan-candidate-refresh-package.mjs'),
  durationAssetUtilizationReport: path.join(SCRIPT_DIR, 'build-default-master-plan-duration-asset-utilization-report.mjs'),
  durationSampleCollection: path.join(SCRIPT_DIR, 'build-default-master-plan-duration-sample-collection-package.mjs'),
  realDurationSampleTemplate: path.join(SCRIPT_DIR, 'build-default-master-plan-real-duration-sample-material-template.mjs'),
  duration: path.join(SCRIPT_DIR, 'build-default-master-plan-duration-calibration-evidence.mjs'),
  dependency: path.join(SCRIPT_DIR, 'build-default-master-plan-dependency-writer-evidence.mjs'),
  publication: path.join(SCRIPT_DIR, 'build-default-master-plan-runtime-publication-evidence.mjs'),
  smoke: path.join(SCRIPT_DIR, 'build-default-master-plan-post-publish-smoke-rollback-evidence.mjs'),
  bundle: path.join(SCRIPT_DIR, 'build-default-master-plan-production-evidence-bundle.mjs'),
  gapSummary: path.join(SCRIPT_DIR, 'summarize-default-master-plan-real-evidence-gaps.mjs'),
  operatorHandoff: path.join(SCRIPT_DIR, 'build-default-master-plan-production-operator-handoff.mjs'),
  operatorHandoffPreflight: path.join(SCRIPT_DIR, 'check-default-master-plan-operator-handoff-preflight.mjs'),
}
function parseArgs(argv) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    profileReport: DEFAULT_PROFILE_REPORT,
    residentialReport: DEFAULT_RESIDENTIAL_REPORT,
    baselineId: null,
    projectId: null,
    publicationKey: null,
    runtimeSeedEvidencePipeline: null,
    durationSampleCollectionPackage: null,
    realDurationSampleMaterialTemplate: null,
    durationSamples: null,
    durationSampleCoverageEvidence: null,
    durationCalibratedBy: null,
    durationCalibratedAt: null,
    writerResult: null,
    taskDependencies: null,
    runtimePublications: null,
    runtimeConsumptions: null,
    publishedBy: null,
    publishedAt: null,
    environment: null,
    testedAt: null,
    apiReadSmoke: null,
    uiConsumptionSmoke: null,
    criticalPathReadback: null,
    rollbackVerification: null,
    realProductionOutcome: null,
    sourceManifest: null,
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
    } else if (arg === '--baseline-id') {
      args.baselineId = text(argv[index + 1])
      index += 1
    } else if (arg === '--project-id') {
      args.projectId = text(argv[index + 1])
      index += 1
    } else if (arg === '--publication-key') {
      args.publicationKey = text(argv[index + 1])
      index += 1
    } else if (arg === '--runtime-seed-evidence-pipeline') {
      args.runtimeSeedEvidencePipeline = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-collection-package') {
      args.durationSampleCollectionPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-duration-sample-material-template') {
      args.realDurationSampleMaterialTemplate = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-samples') {
      args.durationSamples = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-coverage-evidence') {
      args.durationSampleCoverageEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-calibrated-by') {
      args.durationCalibratedBy = text(argv[index + 1])
      index += 1
    } else if (arg === '--duration-calibrated-at') {
      args.durationCalibratedAt = text(argv[index + 1])
      index += 1
    } else if (arg === '--writer-result') {
      args.writerResult = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--task-dependencies') {
      args.taskDependencies = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-publications') {
      args.runtimePublications = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-consumptions') {
      args.runtimeConsumptions = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--published-by') {
      args.publishedBy = text(argv[index + 1])
      index += 1
    } else if (arg === '--published-at') {
      args.publishedAt = text(argv[index + 1])
      index += 1
    } else if (arg === '--environment') {
      args.environment = text(argv[index + 1])
      index += 1
    } else if (arg === '--tested-at') {
      args.testedAt = text(argv[index + 1])
      index += 1
    } else if (arg === '--api-read-smoke') {
      args.apiReadSmoke = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--ui-consumption-smoke') {
      args.uiConsumptionSmoke = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--critical-path-readback') {
      args.criticalPathReadback = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--rollback-verification') {
      args.rollbackVerification = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--real-production-outcome') {
      args.realProductionOutcome = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--source-manifest') {
      args.sourceManifest = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--fail-on-not-ready') {
      args.failOnNotReady = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs --baseline-id <id> --project-id <id> --publication-key <key> [source export args] [--output-root <dir>]`)
      process.exit(0)
    }
  }
  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readExportMetadata(payload) {
  const root = readObject(payload)
  return readObject(root.export_metadata ?? root.exportMetadata ?? readObject(root.metadata).export)
}

function extractDefaultMasterPlanSourceLabels(payload) {
  const root = readObject(payload)
  const writerRoot = readObject(root.evidence ?? root)
  const candidatePlan = readObject(writerRoot.candidate_default_master_plan ?? writerRoot.candidateDefaultMasterPlan)
  const rows = Array.isArray(root.rows)
    ? root.rows
    : Array.isArray(root.data)
      ? root.data
      : []
  const labels = [
    ...defaultMasterPlanStructuredSourceSignals(writerRoot),
    ...defaultMasterPlanStructuredSourceSignals(candidatePlan),
    ...defaultMasterPlanStructuredSourceSignals(writerRoot.sourceMetadata ?? writerRoot.source_metadata),
    ...defaultMasterPlanStructuredSourceSignals(writerRoot.runtimeLineage ?? writerRoot.runtime_lineage),
    ...defaultMasterPlanStructuredSourceSignals(writerRoot.sourceLineage ?? writerRoot.source_lineage),
    candidatePlan.generation_mode,
    candidatePlan.generationMode,
    candidatePlan.source_version_label,
    candidatePlan.sourceVersionLabel,
    writerRoot.generation_mode,
    writerRoot.generationMode,
    writerRoot.source_version_label,
    writerRoot.sourceVersionLabel,
    writerRoot.originalSource,
    writerRoot.original_source,
    writerRoot.handoff_generation_mode,
    writerRoot.handoffGenerationMode,
    writerRoot.controlledDegradation,
    writerRoot.controlled_degradation,
    defaultMasterPlanFallbackAppliedSourceSignal(writerRoot.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(writerRoot.fallback_applied),
    ...rows.flatMap((row) => {
      const record = readObject(row)
      const metadata = readObject(record.metadata ?? record.generation_metadata ?? record.generationMetadata)
      return [
        ...defaultMasterPlanStructuredSourceSignals(record),
        ...defaultMasterPlanStructuredSourceSignals(metadata),
        record.generation_mode,
        record.generationMode,
        record.source_version_label,
        record.sourceVersionLabel,
        record.source,
        record.originalSource,
        record.original_source,
        record.source_type,
        record.sourceType,
        record.handoff_generation_mode,
        record.handoffGenerationMode,
        record.controlledDegradation,
        record.controlled_degradation,
        defaultMasterPlanFallbackAppliedSourceSignal(record.fallbackApplied),
        defaultMasterPlanFallbackAppliedSourceSignal(record.fallback_applied),
        metadata.generation_mode,
        metadata.generationMode,
        metadata.source_version_label,
        metadata.sourceVersionLabel,
        metadata.source,
        metadata.originalSource,
        metadata.original_source,
        metadata.source_type,
        metadata.sourceType,
        metadata.handoff_generation_mode,
        metadata.handoffGenerationMode,
        metadata.controlledDegradation,
        metadata.controlled_degradation,
        defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallbackApplied),
        defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallback_applied),
        metadata.scenario_type,
        metadata.scenarioType,
      ]
    }),
  ].map(text).filter(Boolean)
  return [...new Set(labels)]
}

function sourcePayloadDefaultMasterPlanLabelBlockers(payload, key) {
  const labels = extractDefaultMasterPlanSourceLabels(payload)
  if (labels.some(legacyDefaultMasterPlanSourceLabel)) {
    return [`source_export_legacy_default_master_plan_label:${key}`]
  }
  if (labels.some(retiredOrLowInformationDefaultMasterPlanSource)) {
    return [`source_export_retired_or_low_information_default_master_plan_label:${key}`]
  }
  const defaultMasterPlanLikeLabels = labels.filter(defaultMasterPlanLikeSourceLabel)
  const supportedOrStagingWriter = (label) => {
    return supportedDefaultMasterPlanSourceLabel(label) || label === 'default_master_plan_staging_runtime_writer'
  }
  if (defaultMasterPlanLikeLabels.some((label) => !supportedOrStagingWriter(label))) {
    return [`source_export_unsupported_default_master_plan_label:${key}`]
  }
  return []
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

async function exists(filePath) {
  if (!filePath) return false
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function validateSourceExportMetadata(filePath) {
  const payload = await readJson(filePath)
  const metadata = readExportMetadata(payload)
  const environment = text(metadata.environment ?? metadata.source_environment ?? metadata.sourceEnvironment)
  return [
    Object.keys(metadata).length > 0 ? null : 'source_export_metadata_required',
    text(metadata.exported_at ?? metadata.exportedAt) ? null : 'source_export_exported_at_required',
    text(metadata.exported_by ?? metadata.exportedBy) ? null : 'source_export_exported_by_required',
    REAL_ENVIRONMENTS.has(environment) ? null : 'source_export_real_environment_required',
  ].filter(Boolean)
}

async function validateSourceManifest(args) {
  const sourceRecords = {}
  if (!args.sourceManifest) {
    return {
      manifest: {},
      blockers: ['source_export_manifest_required'],
      sourceRecords,
    }
  }
  if (!await exists(args.sourceManifest)) {
    return {
      manifest: {},
      blockers: ['source_export_manifest_missing'],
      sourceRecords,
    }
  }

  const manifest = await readJson(args.sourceManifest)
  const blockers = []
  if (text(manifest.status) !== 'exported') blockers.push('source_export_manifest_not_exported')
  if (text(manifest.baselineId ?? manifest.baseline_id) !== args.baselineId) {
    blockers.push('source_export_manifest_baseline_id_mismatch')
  }
  if (text(manifest.projectId ?? manifest.project_id) !== args.projectId) {
    blockers.push('source_export_manifest_project_id_mismatch')
  }
  if (args.publicationKey && text(manifest.publicationKey ?? manifest.publication_key) !== args.publicationKey) {
    blockers.push('source_export_manifest_publication_key_mismatch')
  }
  const manifestSessionId = text(manifest.exportSessionId ?? manifest.export_session_id)
  if (!manifestSessionId) blockers.push('source_export_manifest_session_id_required')
  const manifestEnvironment = text(manifest.environment ?? manifest.targetEnvironment ?? manifest.target_environment)
  if (!manifestEnvironment) {
    blockers.push('source_export_manifest_environment_required')
  } else if (args.environment && manifestEnvironment !== args.environment) {
    blockers.push('source_export_manifest_environment_mismatch')
  }

  const exports = readObject(manifest.sourceExports)
  const realProductionOutcomeRecord = readObject(exports.realProductionOutcome)
  if (Object.keys(realProductionOutcomeRecord).length > 0 && !text(args.realProductionOutcome)) {
    blockers.push('source_export_manifest_cli_arg_missing:realProductionOutcome')
  }
  for (const [key, filePath] of [
    ['durationSamples', args.durationSamples],
    ['writerResult', args.writerResult],
    ['taskDependencies', args.taskDependencies],
    ['runtimePublications', args.runtimePublications],
    ['runtimeConsumptions', args.runtimeConsumptions],
    ['apiReadSmoke', args.apiReadSmoke],
    ['uiConsumptionSmoke', args.uiConsumptionSmoke],
    ['criticalPathReadback', args.criticalPathReadback],
    ['rollbackVerification', args.rollbackVerification],
    ['realProductionOutcome', args.realProductionOutcome],
  ]) {
    if (!text(filePath)) continue
    const record = readObject(exports[key])
    sourceRecords[key] = record
    const manifestPath = text(record.path)
    if (!manifestPath) {
      blockers.push(`source_export_manifest_missing_record:${key}`)
    } else if (path.resolve(REPO_ROOT, manifestPath) !== path.resolve(filePath)) {
      blockers.push(`source_export_manifest_path_mismatch:${key}`)
    }
    const expectedHash = text(record.sha256)
    if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
      blockers.push(`source_export_manifest_sha256_required:${key}`)
    } else if (await sha256File(filePath) !== expectedHash.toLowerCase()) {
      blockers.push(`source_export_manifest_sha256_mismatch:${key}`)
    }
    if (Array.isArray(record.blockers) && record.blockers.length > 0) {
      blockers.push(`source_export_manifest_record_blocked:${key}`)
    }
    const sourcePayload = await readJson(filePath)
    blockers.push(...sourcePayloadDefaultMasterPlanLabelBlockers(sourcePayload, key))
    const sourceMetadata = readExportMetadata(sourcePayload)
    const sourceEnvironment = text(sourceMetadata.environment ?? sourceMetadata.source_environment ?? sourceMetadata.sourceEnvironment)
    if (!sourceEnvironment) {
      blockers.push(`source_export_environment_required:${key}`)
    } else if (manifestEnvironment && sourceEnvironment !== manifestEnvironment) {
      blockers.push(`source_export_environment_mismatch:${key}`)
    } else if (args.environment && sourceEnvironment !== args.environment) {
      blockers.push(`source_export_cli_environment_mismatch:${key}`)
    }
    const sourceSessionId = text(sourceMetadata.export_session_id ?? sourceMetadata.exportSessionId)
    if (!sourceSessionId) {
      blockers.push(`source_export_session_id_required:${key}`)
    } else if (manifestSessionId && sourceSessionId !== manifestSessionId) {
      blockers.push(`source_export_session_id_mismatch:${key}`)
    }
    const sourceBaselineId = text(sourceMetadata.baseline_id ?? sourceMetadata.baselineId)
    if (sourceBaselineId && sourceBaselineId !== args.baselineId) {
      blockers.push(`source_export_baseline_id_mismatch:${key}`)
    }
    const sourceProjectId = text(sourceMetadata.project_id ?? sourceMetadata.projectId)
    if (sourceProjectId && sourceProjectId !== args.projectId) {
      blockers.push(`source_export_project_id_mismatch:${key}`)
    }
    const sourcePublicationKey = text(sourceMetadata.publication_key ?? sourceMetadata.publicationKey)
    if (sourcePublicationKey && args.publicationKey && sourcePublicationKey !== args.publicationKey) {
      blockers.push(`source_export_publication_key_mismatch:${key}`)
    }
  }

  return { manifest, blockers, sourceRecords }
}

async function runTool(name, args, { allowedExitCodes = [0] } = {}) {
  const commandArgs = args.filter((arg) => text(arg))
  let result
  let exitCode = 0
  try {
    result = await execFileAsync(process.execPath, commandArgs, {
      cwd: REPO_ROOT,
      maxBuffer: 1024 * 1024 * 10,
    })
  } catch (error) {
    exitCode = Number(error?.code)
    if (!allowedExitCodes.includes(exitCode)) throw error
    result = {
      stdout: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? ''),
    }
  }
  return {
    name,
    command: [process.execPath, ...commandArgs.map((arg) => (path.isAbsolute(arg) ? repoRelative(arg) : arg))],
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode,
  }
}

async function runIfSourcesPresent({ name, requiredSources, commandArgs, outputPath, sourceManifestValidation, optional = false }) {
  const missing = []
  const sourceExportMetadataBlockers = []
  for (const [key, filePath] of requiredSources) {
    if (!text(filePath) || !await exists(filePath)) missing.push(key)
  }
  if (missing.length === 0) {
    for (const [key, filePath, validateMetadata = true] of requiredSources) {
      if (validateMetadata === false) continue
      const blockers = await validateSourceExportMetadata(filePath)
      if (blockers.length > 0) {
        sourceExportMetadataBlockers.push({
          source: key,
          blockers,
        })
      }
    }
  }
  if (sourceExportMetadataBlockers.length > 0) {
    missing.push('sourceExportMetadata')
  }
  if (missing.length > 0 || sourceManifestValidation.blockers.length > 0) {
    return {
      name,
      optional,
      ran: false,
      missing,
      sourceExportMetadataBlockers,
      outputPath,
      run: null,
    }
  }
  return {
    name,
    optional,
    ran: true,
    missing: [],
    sourceExportMetadataBlockers: [],
    outputPath,
    run: await runTool(name, commandArgs.filter((arg) => text(arg))),
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function sha256File(filePath) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

function firstExisting(...values) {
  return values.find((value) => text(value)) ?? ''
}

const args = parseArgs(process.argv.slice(2))
await fs.mkdir(args.outputRoot, { recursive: true })
const sourceManifestValidation = await validateSourceManifest(args)
const shouldBuildRuntimeSeedImportExecution = !text(args.runtimeSeedEvidencePipeline)

const evidenceFiles = {
  durationCalibrationEvidence: path.join(args.outputRoot, 'duration-calibration-evidence.json'),
  dependencyWriterEvidence: path.join(args.outputRoot, 'dependency-writer-evidence.json'),
  runtimePublicationEvidence: path.join(args.outputRoot, 'runtime-publication-evidence.json'),
  postPublishSmokeRollbackEvidence: path.join(args.outputRoot, 'post-publish-smoke-rollback-evidence.json'),
}
const supportingEvidenceFiles = {
  runtimeSeedEvidencePipeline: args.runtimeSeedEvidencePipeline
    || path.join(args.outputRoot, 'runtime-seed-evidence-pipeline.json'),
  runtimeSeedImportExecution: shouldBuildRuntimeSeedImportExecution
    ? path.join(args.outputRoot, 'runtime-seed-import-execution.json')
    : '',
  candidateHygiene: path.join(args.outputRoot, 'candidate-export-hygiene.json'),
  candidateRefreshPackage: path.join(args.outputRoot, 'candidate-refresh-package.json'),
  durationAssetUtilizationReport: path.join(args.outputRoot, 'duration-asset-utilization-report.json'),
  durationSampleCollectionPackage: args.durationSampleCollectionPackage
    || path.join(args.outputRoot, 'duration-sample-collection-package.json'),
  realDurationSampleMaterialTemplate: args.realDurationSampleMaterialTemplate
    || path.join(args.outputRoot, 'real-duration-sample-material.template.json'),
  operatorHandoff: path.join(args.outputRoot, 'operator-handoff.json'),
  operatorHandoffPreflight: path.join(args.outputRoot, 'operator-handoff-preflight.json'),
}
const profileOnlyDurationGapPlanPath = path.join(args.outputRoot, 'duration-sample-gap-plan.profile-only.json')
const supportingRuns = []
supportingRuns.push(args.runtimeSeedEvidencePipeline
  ? {
      name: 'runtimeSeedEvidencePipeline',
      command: ['provided', repoRelative(args.runtimeSeedEvidencePipeline)],
      stdout: '',
    }
  : await runTool('runtimeSeedEvidencePipeline', [
    TOOLS.runtimeSeedPipeline,
    '--profile-report', args.profileReport,
    '--output-root', args.outputRoot,
    '--output', supportingEvidenceFiles.runtimeSeedEvidencePipeline,
    '--skip-tcp',
  ]))
if (shouldBuildRuntimeSeedImportExecution) {
  supportingRuns.push(await runTool('runtimeSeedImportExecution', [
    TOOLS.runtimeSeedImportExecution,
    '--import-gate', path.join(args.outputRoot, 'runtime-seed-import-gate.json'),
    '--post-import-verification', path.join(args.outputRoot, 'runtime-seed-post-import-verification.json'),
    '--output', supportingEvidenceFiles.runtimeSeedImportExecution,
  ]))
}
supportingRuns.push(await runTool('candidateExportHygiene', [
  TOOLS.candidateHygiene,
  '--report-root', args.outputRoot,
  '--profile-report', args.profileReport,
  '--handoff', supportingEvidenceFiles.operatorHandoff,
  '--output', supportingEvidenceFiles.candidateHygiene,
  '--json',
], { allowedExitCodes: [0, 1] }))
supportingRuns.push(await runTool('candidateRefreshPackage', [
  TOOLS.candidateRefreshPackage,
  '--profile-report', args.profileReport,
  '--hygiene', supportingEvidenceFiles.candidateHygiene,
  '--output', supportingEvidenceFiles.candidateRefreshPackage,
  '--json',
]))
supportingRuns.push(await runTool('durationAssetUtilizationReport', [
  TOOLS.durationAssetUtilizationReport,
  '--candidate-refresh-package', supportingEvidenceFiles.candidateRefreshPackage,
  '--output', supportingEvidenceFiles.durationAssetUtilizationReport,
  '--json',
]))
supportingRuns.push(await runTool('durationSampleCollectionPackage', [
    TOOLS.durationSampleCollection,
    '--duration-gap-plan', profileOnlyDurationGapPlanPath,
    '--profile-report', args.profileReport,
    '--profile-only',
    '--profile-scope', 'all',
    '--output', supportingEvidenceFiles.durationSampleCollectionPackage,
    '--environment', args.environment || 'staging',
    '--exported-by', firstExisting(args.durationCalibratedBy, args.publishedBy, '<real-release-operator>'),
    ...(args.baselineId ? ['--baseline-id', args.baselineId] : []),
    ...(args.projectId ? ['--project-id', args.projectId] : []),
  ]))
supportingRuns.push(args.realDurationSampleMaterialTemplate
  ? {
      name: 'realDurationSampleMaterialTemplate',
      command: ['provided', repoRelative(args.realDurationSampleMaterialTemplate)],
      stdout: '',
    }
  : await runTool('realDurationSampleMaterialTemplate', [
    TOOLS.realDurationSampleTemplate,
    '--collection-package', supportingEvidenceFiles.durationSampleCollectionPackage,
    '--output', supportingEvidenceFiles.realDurationSampleMaterialTemplate,
    '--prepared-by', firstExisting(args.durationCalibratedBy, args.publishedBy, '<real-release-operator>'),
  ]))
const criticalPathReadback = args.criticalPathReadback
const builderPlans = [
  {
    name: 'durationCalibrationEvidence',
    requiredSources: [
      ['durationSamples', args.durationSamples],
      ['durationSampleCoverageEvidence', args.durationSampleCoverageEvidence, false],
    ],
    outputPath: evidenceFiles.durationCalibrationEvidence,
    commandArgs: [
      TOOLS.duration,
      '--samples', args.durationSamples,
      '--coverage-evidence', args.durationSampleCoverageEvidence,
      '--baseline-id', args.baselineId,
      '--project-id', args.projectId,
      '--calibrated-by', args.durationCalibratedBy,
      ...(args.durationCalibratedAt ? ['--calibrated-at', args.durationCalibratedAt] : []),
      '--output', evidenceFiles.durationCalibrationEvidence,
    ],
  },
  {
    name: 'dependencyWriterEvidence',
    requiredSources: [
      ['writerResult', args.writerResult],
      ['taskDependencies', args.taskDependencies],
      ['criticalPathReadback', criticalPathReadback],
    ],
    outputPath: evidenceFiles.dependencyWriterEvidence,
    commandArgs: [
      TOOLS.dependency,
      '--writer-result', args.writerResult,
      '--task-dependencies', args.taskDependencies,
      '--critical-path-readback', criticalPathReadback,
      '--baseline-id', args.baselineId,
      '--project-id', args.projectId,
      '--output', evidenceFiles.dependencyWriterEvidence,
    ],
  },
  {
    name: 'runtimePublicationEvidence',
    requiredSources: [
      ['runtimePublications', args.runtimePublications],
      ['runtimeConsumptions', args.runtimeConsumptions],
    ],
    outputPath: evidenceFiles.runtimePublicationEvidence,
    commandArgs: [
      TOOLS.publication,
      '--runtime-publications', args.runtimePublications,
      '--runtime-consumptions', args.runtimeConsumptions,
      '--publication-key', args.publicationKey,
      '--baseline-id', args.baselineId,
      '--project-id', args.projectId,
      '--published-by', args.publishedBy,
      ...(args.publishedAt ? ['--published-at', args.publishedAt] : []),
      '--duration-calibration-evidence-ref', repoRelative(evidenceFiles.durationCalibrationEvidence),
      '--dependency-writer-evidence-ref', repoRelative(evidenceFiles.dependencyWriterEvidence),
      '--output', evidenceFiles.runtimePublicationEvidence,
    ],
  },
  {
    name: 'postPublishSmokeRollbackEvidence',
    requiredSources: [
      ['apiReadSmoke', args.apiReadSmoke],
      ['uiConsumptionSmoke', args.uiConsumptionSmoke],
      ['criticalPathReadback', criticalPathReadback],
      ['rollbackVerification', args.rollbackVerification],
      ...(args.realProductionOutcome ? [['realProductionOutcome', args.realProductionOutcome]] : []),
    ],
    outputPath: evidenceFiles.postPublishSmokeRollbackEvidence,
    commandArgs: [
      TOOLS.smoke,
      '--baseline-id', args.baselineId,
      '--project-id', args.projectId,
      '--publication-key', args.publicationKey,
      '--environment', args.environment,
      ...(args.testedAt ? ['--tested-at', args.testedAt] : []),
      '--api-read-smoke', args.apiReadSmoke,
      '--ui-consumption-smoke', args.uiConsumptionSmoke,
      '--critical-path-readback', criticalPathReadback,
      '--rollback-verification', args.rollbackVerification,
      ...(args.realProductionOutcome ? ['--real-production-outcome', args.realProductionOutcome] : []),
      '--output', evidenceFiles.postPublishSmokeRollbackEvidence,
    ],
  },
]

const builderResults = []
for (const plan of builderPlans) {
  builderResults.push(await runIfSourcesPresent({
    ...plan,
    sourceManifestValidation,
  }))
}

const bundleArgs = [
  TOOLS.bundle,
  '--profile-report', args.profileReport,
  '--residential-report', args.residentialReport,
  '--output-root', args.outputRoot,
  '--no-default-evidence',
  '--runtime-seed-evidence-pipeline', supportingEvidenceFiles.runtimeSeedEvidencePipeline,
  '--candidate-hygiene', supportingEvidenceFiles.candidateHygiene,
  '--candidate-refresh-package', supportingEvidenceFiles.candidateRefreshPackage,
  '--duration-asset-utilization', supportingEvidenceFiles.durationAssetUtilizationReport,
  '--duration-sample-collection-package', supportingEvidenceFiles.durationSampleCollectionPackage,
]
if (args.durationSampleCoverageEvidence) {
  bundleArgs.push('--duration-sample-coverage-evidence', args.durationSampleCoverageEvidence)
}
if (args.sourceManifest) {
  bundleArgs.push('--source-manifest', args.sourceManifest)
}
for (const result of builderResults.filter((item) => item.ran)) {
  const flag = {
    durationCalibrationEvidence: '--duration-calibration-evidence',
    dependencyWriterEvidence: '--dependency-writer-evidence',
    runtimePublicationEvidence: '--runtime-publication-evidence',
    postPublishSmokeRollbackEvidence: '--post-publish-smoke-rollback-evidence',
  }[result.name]
  bundleArgs.push(flag, result.outputPath)
}
const bundleRun = await runTool('productionEvidenceBundle', bundleArgs)
const bundlePath = path.join(args.outputRoot, 'evidence-bundle.json')
const readinessPath = path.join(args.outputRoot, 'readiness.json')
const bundle = await readJson(bundlePath)
const readiness = await readJson(readinessPath)
const missingSourceExports = builderResults
  .filter((item) => !item.ran && !item.optional)
  .flatMap((item) => item.missing.map((source) => ({
    evidenceType: item.name,
    source,
    outputPath: repoRelative(item.outputPath),
  })))
if (sourceManifestValidation.blockers.length > 0) {
  missingSourceExports.unshift({
    evidenceType: 'sourceExportManifest',
    source: 'sourceExportManifest',
    outputPath: args.sourceManifest ? repoRelative(args.sourceManifest) : '',
  })
}
const sourceExportMetadataBlockers = builderResults
  .filter((item) => !item.optional)
  .flatMap((item) => item.sourceExportMetadataBlockers.map((blocker) => ({
    evidenceType: item.name,
    ...blocker,
  })))
const builderRuns = builderResults
  .filter((item) => item.ran)
  .map((item) => item.run)
const evidenceSourcesPath = path.join(args.outputRoot, 'evidence-sources-report.json')
const realEvidenceGapSummaryJsonPath = path.join(args.outputRoot, 'real-evidence-gap-summary.json')
const realEvidenceGapSummaryMarkdownPath = path.join(args.outputRoot, 'real-evidence-gap-summary.md')
const evidenceSourcesReport = {
  schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
  generatedAt: new Date().toISOString(),
  source: 'build-default-master-plan-production-evidence-pipeline',
  status: missingSourceExports.length > 0 || sourceExportMetadataBlockers.length > 0 ? 'blocked' : 'pass',
  productionReady: false,
  missingCount: missingSourceExports.length,
  missingEvidenceTypes: Array.from(new Set(
    missingSourceExports
      .map((item) => item.evidenceType)
      .filter((type) => type && type !== 'sourceExportManifest'),
  )),
  missingSourceExports,
  sourceExportMetadataBlockers,
  sourceManifestCheck: {
    sourcePath: args.sourceManifest ? repoRelative(args.sourceManifest) : '',
    status: sourceManifestValidation.blockers.length > 0 ? 'blocked' : 'pass',
    blockers: sourceManifestValidation.blockers,
  },
  mutationBoundary: {
    readsSourceExports: true,
    writesReportFiles: true,
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    invokesRuntimeWriters: false,
    writesRuntimePublication: false,
    performsRollback: false,
  },
}
await fs.writeFile(evidenceSourcesPath, `${JSON.stringify(evidenceSourcesReport, null, 2)}\n`, 'utf8')
const operatorHandoffArgs = [
  TOOLS.operatorHandoff,
  '--readiness', readinessPath,
  '--evidence-bundle', bundlePath,
  '--duration-gap-plan', profileOnlyDurationGapPlanPath,
  '--runtime-seed-evidence-pipeline', supportingEvidenceFiles.runtimeSeedEvidencePipeline,
  '--duration-sample-collection-package', supportingEvidenceFiles.durationSampleCollectionPackage,
  '--output', supportingEvidenceFiles.operatorHandoff,
  '--environment', args.environment || 'staging',
  '--exported-by', firstExisting(args.durationCalibratedBy, args.publishedBy, '<real-release-operator>'),
  '--publication-key', args.publicationKey,
  '--duration-calibration-evidence', evidenceFiles.durationCalibrationEvidence,
]
for (const [flag, value] of [
  ['--runtime-seed-import-execution', supportingEvidenceFiles.runtimeSeedImportExecution],
  ['--duration-sample-coverage-evidence', args.durationSampleCoverageEvidence],
  ['--writer-result', args.writerResult],
  ['--critical-path-readback', args.criticalPathReadback],
  ['--api-read-smoke', args.apiReadSmoke],
  ['--ui-consumption-smoke', args.uiConsumptionSmoke],
  ['--rollback-verification', args.rollbackVerification],
  ['--real-production-outcome', args.realProductionOutcome],
]) {
  if (text(value)) operatorHandoffArgs.push(flag, value)
}
const operatorHandoffRun = await runTool('productionOperatorHandoff', operatorHandoffArgs)
supportingRuns.push(operatorHandoffRun)
const operatorHandoff = await readJson(supportingEvidenceFiles.operatorHandoff)
const operatorHandoffPreflightRun = await runTool('operatorHandoffPreflight', [
  TOOLS.operatorHandoffPreflight,
  '--handoff', supportingEvidenceFiles.operatorHandoff,
  '--output', supportingEvidenceFiles.operatorHandoffPreflight,
])
supportingRuns.push(operatorHandoffPreflightRun)
const operatorHandoffPreflight = await readJson(supportingEvidenceFiles.operatorHandoffPreflight)
const gapSummaryRun = await runTool('realEvidenceGapSummary', [
  TOOLS.gapSummary,
  '--readiness', readinessPath,
  '--evidence-sources', evidenceSourcesPath,
  '--duration-calibration-evidence', evidenceFiles.durationCalibrationEvidence,
  '--runtime-seed-evidence-pipeline', supportingEvidenceFiles.runtimeSeedEvidencePipeline,
  '--duration-sample-collection-package', supportingEvidenceFiles.durationSampleCollectionPackage,
  '--real-duration-sample-material-template', supportingEvidenceFiles.realDurationSampleMaterialTemplate,
  '--duration-asset-utilization', supportingEvidenceFiles.durationAssetUtilizationReport,
  '--operator-handoff', supportingEvidenceFiles.operatorHandoff,
  '--operator-handoff-preflight', supportingEvidenceFiles.operatorHandoffPreflight,
  '--output', realEvidenceGapSummaryMarkdownPath,
  '--json-output', realEvidenceGapSummaryJsonPath,
  '--json',
])
const realEvidenceGapSummary = await readJson(realEvidenceGapSummaryJsonPath)
const reportStatus = bundle.productionReady
  ? 'production_ready_evidence_pipeline_complete'
  : bundle.status === 'staging_runtime_chain_passed'
    ? 'staging_runtime_chain_passed'
    : 'blocked'

const report = {
  schemaVersion: 'workbuddy-default-master-plan-production-evidence-pipeline/v1',
  generatedAt: new Date().toISOString(),
  source: 'build-default-master-plan-production-evidence-pipeline',
  status: reportStatus,
  productionReady: Boolean(bundle.productionReady),
  baselineId: args.baselineId,
  projectId: args.projectId,
  publicationKey: args.publicationKey,
  outputRoot: repoRelative(args.outputRoot),
  evidenceFiles: Object.fromEntries(Object.entries(evidenceFiles).map(([key, value]) => [key, repoRelative(value)])),
  supportingEvidenceFiles: Object.fromEntries(Object.entries(supportingEvidenceFiles).map(([key, value]) => [key, repoRelative(value)])),
  evidenceSources: {
    path: repoRelative(evidenceSourcesPath),
    status: evidenceSourcesReport.status,
    missingEvidenceTypes: evidenceSourcesReport.missingEvidenceTypes,
  },
  realEvidenceGapSummary: {
    jsonPath: repoRelative(realEvidenceGapSummaryJsonPath),
    markdownPath: repoRelative(realEvidenceGapSummaryMarkdownPath),
    status: realEvidenceGapSummary.status,
    productionReady: Boolean(realEvidenceGapSummary.productionReady),
    operatorHandoffPreflightStatus: text(realEvidenceGapSummary.realEvidenceGaps?.operatorHandoff?.preflightStatus),
    blockedRealGateCount: Array.isArray(realEvidenceGapSummary.blockedRealGates)
      ? realEvidenceGapSummary.blockedRealGates.length
      : 0,
  },
  operatorHandoff: {
    jsonPath: repoRelative(supportingEvidenceFiles.operatorHandoff),
    markdownPath: repoRelative(supportingEvidenceFiles.operatorHandoff).replace(/\.json$/i, '.md'),
    status: operatorHandoff.status,
    productionReady: Boolean(operatorHandoff.productionReady),
    blockerCount: Array.isArray(operatorHandoff.currentBlockers)
      ? operatorHandoff.currentBlockers.length
      : 0,
    preflightStatus: operatorHandoffPreflight.status,
  },
  missingSourceExports,
  sourceExportMetadataBlockers,
  sourceExportManifest: {
    path: args.sourceManifest ? repoRelative(args.sourceManifest) : '',
    status: text(sourceManifestValidation.manifest.status),
  },
  sourceExportManifestBlockers: sourceManifestValidation.blockers,
  builderRuns,
  supportingRuns,
  productionReadinessBlockers: Array.isArray(bundle.productionReadinessBlockers)
    ? bundle.productionReadinessBlockers
    : [],
  evidenceQualification: bundle.evidenceQualification ?? null,
  bundle: {
    path: repoRelative(bundlePath),
    status: bundle.status,
    productionReady: Boolean(bundle.productionReady),
    productionReadinessBlockers: Array.isArray(bundle.productionReadinessBlockers)
      ? bundle.productionReadinessBlockers
      : [],
    missingEvidenceTypes: bundle.missingEvidenceTypes,
    nextEvidenceActions: bundle.nextEvidenceActions,
  },
  readiness: {
    path: repoRelative(readinessPath),
    status: readiness.status,
    productionReady: Boolean(readiness.productionReady),
    runtimeEvidenceChainPassed: Boolean(readiness.runtimeEvidenceChainPassed),
    productionReadinessBlockers: Array.isArray(readiness.productionReadinessBlockers)
      ? readiness.productionReadinessBlockers
      : [],
    blockedGateCount: Array.isArray(readiness.gates) ? readiness.gates.filter((gate) => gate.status === 'blocked').length : null,
  },
  commands: {
    supporting: supportingRuns.map((run) => run.command),
    builders: builderRuns.map((run) => run.command),
    bundle: bundleRun.command,
    gapSummary: gapSummaryRun.command,
    operatorHandoff: operatorHandoffRun.command,
    operatorHandoffPreflight: operatorHandoffPreflightRun.command,
  },
  mutationBoundary: {
    readsSourceExports: true,
    invokesEvidenceBuilders: true,
    invokesRuntimeWriters: false,
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
    performsRollback: false,
  },
}

const reportPath = path.join(args.outputRoot, 'pipeline-report.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: report.status,
  productionReady: report.productionReady,
  outputRoot: report.outputRoot,
  reportPath: repoRelative(reportPath),
  missingSourceExports: report.missingSourceExports,
  evidenceFiles: report.evidenceFiles,
}, null, 2))

if (args.failOnNotReady && !report.productionReady) {
  process.exitCode = 1
}
