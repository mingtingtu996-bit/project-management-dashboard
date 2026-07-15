#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProductionReadinessQualification } from './default-master-plan-evidence-boundary.mjs'
import {
  defaultMasterPlanFallbackAppliedSourceSignal,
  defaultMasterPlanStructuredSourceSignals,
  defaultMasterPlanLikeSourceLabel,
  legacyDefaultMasterPlanSourceLabel,
  retiredOrLowInformationDefaultMasterPlanSource,
  supportedDefaultMasterPlanSourceLabel,
} from './default-master-plan-source-guard.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_SOURCE_MANIFEST = path.join(DEFAULT_OUTPUT_ROOT, 'source-exports', 'source-exports-manifest.json')
const DURATION_SAMPLE_SOURCE_KINDS = new Set([
  'database_table',
  'operator_supplied_real_duration_sample_material',
  'blocked_real_duration_sample_material',
])
const DEFAULT_CANDIDATE_HYGIENE = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-export-hygiene.json')
const SUPPORTED_SOURCE_MANIFEST_STRUCTURAL_DEFAULT_MASTER_PLAN_LABELS = new Set([
  'default_master_plan_staging_runtime_writer',
])
const SOURCE_EXPORT_RECORD_CONTRACTS = {
  durationSamples: {
    source: 'duration_experience_samples',
    kind: 'database_table',
    table: 'public.duration_experience_samples',
    pipelineFlag: '--duration-samples',
  },
  taskDependencies: {
    source: 'task_dependencies',
    kind: 'database_table',
    table: 'public.task_dependencies',
    pipelineFlag: '--task-dependencies',
  },
  runtimePublications: {
    source: 'wbs_template_runtime_publications',
    kind: 'database_table',
    table: 'public.wbs_template_runtime_publications',
    pipelineFlag: '--runtime-publications',
  },
  writerResult: {
    source: 'dependency_writer_result',
    kind: 'source_file',
    pipelineFlag: '--writer-result',
  },
  apiReadSmoke: {
    source: 'api_read_smoke',
    kind: 'source_file',
    pipelineFlag: '--api-read-smoke',
  },
  uiConsumptionSmoke: {
    source: 'ui_consumption_smoke',
    kind: 'source_file',
    pipelineFlag: '--ui-consumption-smoke',
  },
  criticalPathReadback: {
    source: 'critical_path_readback',
    kind: 'source_file',
    pipelineFlag: '--critical-path-readback',
  },
  rollbackVerification: {
    source: 'rollback_verification',
    kind: 'source_file',
    pipelineFlag: '--rollback-verification',
  },
}
const OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS = {
  realProductionOutcome: {
    source: 'real_production_outcome',
    kind: 'source_file',
    pipelineFlag: '--real-production-outcome',
  },
}
const SOURCE_REQUIREMENTS = [
  {
    key: 'durationCalibrationEvidence',
    label: '工期校准证据',
    fileName: 'duration-calibration-evidence.json',
    builder: 'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs',
    inputs: ['duration_experience_samples export', 'baseline id', 'project id', 'calibration actor'],
    commandTemplate: () => [
      'node',
      'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs',
      '--samples',
      '<duration_experience_samples_export.json>',
      '--baseline-id',
      '<baseline-id>',
      '--project-id',
      '<project-id>',
      '--calibrated-by',
      '<calibration-actor>',
      '--output',
      '<duration-calibration-evidence.json>',
    ],
    mutationBoundary: 'read-only source validation; does not write samples, seeds, or runtime publication',
  },
  {
    key: 'dependencyWriterEvidence',
    label: '依赖写入证据',
    fileName: 'dependency-writer-evidence.json',
    builder: 'project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs',
    inputs: ['explicit execute-mode dependency writer result', 'task_dependencies export', 'critical-path readback'],
    commandTemplate: () => [
      'node',
      'project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs',
      '--writer-result',
      '<dependency_writer_result.json>',
      '--task-dependencies',
      '<task_dependencies_export.json>',
      '--critical-path-readback',
      '<critical_path_readback.json>',
      '--baseline-id',
      '<baseline-id>',
      '--project-id',
      '<project-id>',
      '--output',
      '<dependency-writer-evidence.json>',
    ],
    mutationBoundary: 'read-only source validation; does not execute writer or write task_dependencies',
  },
  {
    key: 'runtimePublicationEvidence',
    label: '运行时发布证据',
    fileName: 'runtime-publication-evidence.json',
    builder: 'project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs',
    inputs: ['wbs_template_runtime_publications export', 'published row matching baseline/project', 'lineage refs'],
    commandTemplate: () => [
      'node',
      'project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs',
      '--runtime-publications',
      '<wbs_template_runtime_publications_export.json>',
      '--baseline-id',
      '<baseline-id>',
      '--project-id',
      '<project-id>',
      '--published-by',
      '<release-user>',
      '--duration-calibration-evidence-ref',
      '<duration-calibration-evidence.json>',
      '--dependency-writer-evidence-ref',
      '<dependency-writer-evidence.json>',
      '--output',
      '<runtime-publication-evidence.json>',
    ],
    mutationBoundary: 'read-only source validation; does not publish runtime asset or rollback',
  },
  {
    key: 'postPublishSmokeRollbackEvidence',
    label: '发布后 smoke/rollback 证据',
    fileName: 'post-publish-smoke-rollback-evidence.json',
    builder: 'project-testing/tools/build-default-master-plan-post-publish-smoke-rollback-evidence.mjs',
    inputs: ['real-environment API read smoke', 'real-environment UI consumption smoke', 'critical-path readback', 'rollback verification'],
    commandTemplate: () => [
      'node',
      'project-testing/tools/build-default-master-plan-post-publish-smoke-rollback-evidence.mjs',
      '--baseline-id',
      '<baseline-id>',
      '--project-id',
      '<project-id>',
      '--publication-key',
      '<publication-key>',
      '--environment',
      '<staging|production|live>',
      '--api-read-smoke',
      '<api-read-smoke.json>',
      '--ui-consumption-smoke',
      '<ui-consumption-smoke.json>',
      '--critical-path-readback',
      '<critical-path-readback.json>',
      '--rollback-verification',
      '<rollback-verification.json>',
      '--output',
      '<post-publish-smoke-rollback-evidence.json>',
    ],
    mutationBoundary: 'read-only source validation; does not run browser/API smoke or rollback',
  },
]

const SOURCE_EXPORTER = {
  tool: 'project-testing/tools/export-default-master-plan-production-sources.mjs',
  commandTemplate: [
    'node',
    'project-testing/tools/export-default-master-plan-production-sources.mjs',
    '--baseline-id',
    '<baseline-id>',
    '--project-id',
    '<project-id>',
    '--publication-key',
    '<publication-key>',
    '--environment',
    '<staging|production|live>',
    '--exported-by',
    '<operator>',
    '--writer-result',
    '<dependency-writer-result.json>',
    '--critical-path-readback',
    '<critical-path-readback.json>',
    '--api-read-smoke',
    '<api-read-smoke.json>',
    '--ui-consumption-smoke',
    '<ui-consumption-smoke.json>',
    '--rollback-verification',
    '<rollback-verification.json>',
    '--real-production-outcome',
    '<real-production-outcome.json>',
    '--output-root',
    '<source-export-output-root>',
  ],
  mutationBoundary: 'read-only source export collection; reads database and supplied files, does not execute writer, write task_dependencies, publish runtime, run smoke, or rollback',
}

const ENTRY_TEMPLATE_PREFLIGHT = {
  tool: 'project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
  commandTemplate: [
    'node',
    'project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
  ],
  executeCommandTemplate: [
    'node',
    'project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
    '--execute',
    '--installed-by',
    '<operator>',
  ],
  mutationBoundary: 'dry-run reads wbs_templates only; execute mode upserts explicit system entry templates only and does not generate baselines, tasks, task_dependencies, runtime publication, smoke, or rollback',
}

const CANDIDATE_HYGIENE = {
  tool: 'project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
  commandTemplate: [
    'node',
    'project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
    '--report-root',
    '<default-master-plan-production-readiness-dir>',
    '--handoff',
    '<operator-handoff.json>',
    '--output',
    '<candidate-export-hygiene.json>',
  ],
  mutationBoundary: 'read-only local report hygiene; does not write baselines, tasks, task_dependencies, runtime publication, smoke, rollback, or database state',
}

function parseArgs(argv) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    durationCalibrationEvidence: null,
    dependencyWriterEvidence: null,
    runtimePublicationEvidence: null,
    postPublishSmokeRollbackEvidence: null,
    sourceManifest: DEFAULT_SOURCE_MANIFEST,
    candidateHygiene: null,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-calibration-evidence') {
      args.durationCalibrationEvidence = path.resolve(argv[index + 1] ?? '')
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
    } else if (arg === '--candidate-hygiene') {
      args.candidateHygiene = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/check-default-master-plan-evidence-sources.mjs [--output-root <dir>] [--duration-calibration-evidence <json>] [--dependency-writer-evidence <json>] [--runtime-publication-evidence <json>] [--post-publish-smoke-rollback-evidence <json>] [--source-manifest <json>] [--candidate-hygiene <json>] [--json]`)
      process.exit(0)
    }
  }

  return args
}

async function checkCandidateHygiene(filePath) {
  const state = await fileState(filePath)
  const payload = state.exists ? await readJsonIfExists(filePath) : null
  const root = readObject(payload)
  const boundary = readObject(root.mutationBoundary ?? root.mutation_boundary)
  const blockers = []

  if (!state.exists) {
    blockers.push('candidate_export_hygiene_report_missing')
  } else {
    if (root.schemaVersion !== 'workbuddy-default-master-plan-candidate-export-hygiene/v1') {
      blockers.push('candidate_export_hygiene_schema_version_invalid')
    }
    if (String(root.status ?? '').trim() !== 'pass') {
      blockers.push('candidate_export_hygiene_not_pass')
    }
    blockers.push(...arrayOfStrings(root.blockers))
    if (readNumber(root.totalCandidateExportCount) !== 1) {
      blockers.push('candidate_export_hygiene_single_current_candidate_required')
    }
    if (arrayOfStrings(root.ignoredCandidateExports).length > 0) {
      blockers.push('candidate_export_hygiene_ignored_exports_must_be_deleted')
    }
    if (arrayOfStrings(root.extraEligibleCandidateExports).length > 0) {
      blockers.push('candidate_export_hygiene_extra_eligible_exports_present')
    }
    if (!readObject(root.currentCandidate).baselineId) {
      blockers.push('candidate_export_hygiene_current_candidate_required')
    }
    for (const flag of [
      'writesProductionTables',
      'writesTasks',
      'writesTaskDependencies',
      'invokesRuntimeWriters',
      'writesRuntimePublication',
      'performsRollback',
    ]) {
      if (readBoolean(boundary[flag])) blockers.push(`candidate_export_hygiene_${flag}_must_be_false`)
    }
  }

  return {
    sourcePath: filePath ? repoRelative(filePath) : null,
    exists: state.exists,
    sizeBytes: state.sizeBytes,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    totalCandidateExportCount: readNumber(root.totalCandidateExportCount),
    ignoredCandidateExportCount: Array.isArray(root.ignoredCandidateExports) ? root.ignoredCandidateExports.length : 0,
    extraEligibleCandidateExportCount: Array.isArray(root.extraEligibleCandidateExports) ? root.extraEligibleCandidateExports.length : 0,
    currentCandidate: readObject(root.currentCandidate),
    blockers: [...new Set(blockers)],
    mutationBoundary: {
      readsLocalReports: readBoolean(boundary.readsLocalReports),
      writesReportFiles: readBoolean(boundary.writesReportFiles),
      writesProductionTables: readBoolean(boundary.writesProductionTables),
      writesTasks: readBoolean(boundary.writesTasks),
      writesTaskDependencies: readBoolean(boundary.writesTaskDependencies),
      invokesRuntimeWriters: readBoolean(boundary.invokesRuntimeWriters),
      writesRuntimePublication: readBoolean(boundary.writesRuntimePublication),
      performsRollback: readBoolean(boundary.performsRollback),
    },
  }
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

async function fileState(filePath) {
  if (!filePath) {
    return { exists: false, sizeBytes: 0 }
  }
  try {
    const stat = await fs.stat(filePath)
    return { exists: stat.isFile(), sizeBytes: stat.size }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, sizeBytes: 0 }
    throw error
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readBoolean(value) {
  return value === true || value === 'true'
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function manifestRecordDefaultMasterPlanLabelBlockers(record, key) {
  const sourceRecord = readObject(record)
  const labels = [
    ...defaultMasterPlanStructuredSourceSignals(sourceRecord),
    ...defaultMasterPlanStructuredSourceSignals(sourceRecord.sourceMetadata ?? sourceRecord.source_metadata),
    ...defaultMasterPlanStructuredSourceSignals(sourceRecord.runtimeLineage ?? sourceRecord.runtime_lineage),
    ...defaultMasterPlanStructuredSourceSignals(sourceRecord.sourceLineage ?? sourceRecord.source_lineage),
    sourceRecord.generationMode,
    sourceRecord.generation_mode,
    sourceRecord.sourceVersionLabel,
    sourceRecord.source_version_label,
    sourceRecord.originalSource,
    sourceRecord.original_source,
    sourceRecord.sourceType,
    sourceRecord.source_type,
    sourceRecord.generationSource,
    sourceRecord.generation_source,
    sourceRecord.handoffGenerationMode,
    sourceRecord.handoff_generation_mode,
    sourceRecord.controlledDegradation,
    sourceRecord.controlled_degradation,
    defaultMasterPlanFallbackAppliedSourceSignal(sourceRecord.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(sourceRecord.fallback_applied),
    sourceRecord.scenarioType,
    sourceRecord.scenario_type,
  ].map((value) => String(value ?? '').trim()).filter(Boolean)
  if (labels.some(legacyDefaultMasterPlanSourceLabel)) {
    return [`source_export_manifest_legacy_default_master_plan_label:${key}`]
  }
  if (labels.some(retiredOrLowInformationDefaultMasterPlanSource)) {
    return [`source_export_manifest_retired_or_low_information_default_master_plan_label:${key}`]
  }
  const defaultMasterPlanLikeLabels = labels.filter(defaultMasterPlanLikeSourceLabel)
  const supportedManifestLabel = (label) => {
    return supportedDefaultMasterPlanSourceLabel(label)
      || SUPPORTED_SOURCE_MANIFEST_STRUCTURAL_DEFAULT_MASTER_PLAN_LABELS.has(label)
  }
  if (defaultMasterPlanLikeLabels.some((label) => !supportedManifestLabel(label))) {
    return [`source_export_manifest_unsupported_default_master_plan_label:${key}`]
  }
  return []
}

function sourceManifestPipelineBlockers(manifest, sourceManifestPath) {
  const args = Array.isArray(manifest.pipelineArgs) ? manifest.pipelineArgs.map((item) => String(item)) : []
  if (args.length === 0) return ['source_export_manifest_pipeline_args_required']

  const blockers = []
  const expectedFlagValues = [
    ['--baseline-id', String(manifest.baselineId ?? manifest.baseline_id ?? '').trim()],
    ['--project-id', String(manifest.projectId ?? manifest.project_id ?? '').trim()],
    ['--publication-key', String(manifest.publicationKey ?? manifest.publication_key ?? '').trim()],
    ['--environment', String(manifest.environment ?? '').trim()],
  ]
  for (const [flag, expectedValue] of expectedFlagValues) {
    if (!expectedValue) continue
    const flagIndex = args.indexOf(flag)
    if (flagIndex === -1) {
      blockers.push(`source_export_manifest_pipeline_arg_missing:${flag}`)
      continue
    }
    const actualValue = String(args[flagIndex + 1] ?? '').trim()
    if (actualValue !== expectedValue) {
      blockers.push(`source_export_manifest_pipeline_arg_value_mismatch:${flag}`)
    }
  }

  const expectedManifestPath = repoRelative(sourceManifestPath)
  const sourceManifestFlagIndex = args.indexOf('--source-manifest')
  if (sourceManifestFlagIndex === -1) {
    blockers.push('source_export_manifest_pipeline_arg_missing:--source-manifest')
  } else {
    const actualPath = String(args[sourceManifestFlagIndex + 1] ?? '').trim()
    if (!actualPath || path.resolve(REPO_ROOT, actualPath) !== path.resolve(REPO_ROOT, expectedManifestPath)) {
      blockers.push('source_export_manifest_pipeline_arg_path_mismatch:--source-manifest')
    }
  }

  const exports = readObject(manifest.sourceExports)
  const contracts = {
    ...SOURCE_EXPORT_RECORD_CONTRACTS,
    ...Object.fromEntries(Object.entries(OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS).filter(([key]) => Object.keys(readObject(exports[key])).length > 0)),
  }
  for (const [key, contract] of Object.entries(contracts)) {
    const record = readObject(exports[key])
    const exportPath = String(record.path ?? '').trim()
    if (!exportPath) continue
    const flagIndex = args.indexOf(contract.pipelineFlag)
    if (flagIndex === -1) {
      blockers.push(`source_export_manifest_pipeline_arg_missing:${contract.pipelineFlag}`)
      continue
    }
    const actualPath = String(args[flagIndex + 1] ?? '').trim()
    if (!actualPath || path.resolve(REPO_ROOT, actualPath) !== path.resolve(REPO_ROOT, exportPath)) {
      blockers.push(`source_export_manifest_pipeline_arg_path_mismatch:${contract.pipelineFlag}`)
    }
  }
  return blockers
}

function sourceManifestRecordBlockers(manifest) {
  const exports = readObject(manifest.sourceExports)
  const blockers = []
  for (const [key, contract] of Object.entries(SOURCE_EXPORT_RECORD_CONTRACTS)) {
    const record = readObject(exports[key])
    if (Object.keys(record).length === 0) {
      blockers.push(`source_export_manifest_missing_record:${key}`)
      continue
    }
    const source = String(record.source ?? '').trim()
    const kind = String(record.kind ?? '').trim()
    const table = String(record.table ?? '').trim()
    const exportPath = String(record.path ?? '').trim()
    const sha256 = String(record.sha256 ?? '').trim()
    const rowCount = Number(record.rowCount ?? record.row_count ?? 0)
    const recordBlockers = Array.isArray(record.blockers) ? record.blockers : []
    const blockedDurationSampleRecord = key === 'durationSamples'
      && (kind === 'blocked_real_duration_sample_material' || recordBlockers.includes('blocked_real_duration_sample_material'))
    if (source !== contract.source) blockers.push(`source_export_manifest_source_mismatch:${key}`)
    if (sourceManifestRecordKindMismatch(key, kind, contract)) blockers.push(`source_export_manifest_kind_mismatch:${key}`)
    if (contract.table && table !== contract.table) blockers.push(`source_export_manifest_table_mismatch:${key}`)
    if (!exportPath) blockers.push(`source_export_manifest_path_required:${key}`)
    if (!/^[a-f0-9]{64}$/i.test(sha256)) blockers.push(`source_export_manifest_sha256_required:${key}`)
    if ((!Number.isFinite(rowCount) || rowCount <= 0) && !blockedDurationSampleRecord) blockers.push(`source_export_manifest_row_count_required:${key}`)
    if (recordBlockers.length > 0) blockers.push(`source_export_manifest_record_blocked:${key}`)
    blockers.push(...manifestRecordDefaultMasterPlanLabelBlockers(record, key))
  }
  for (const [key, contract] of Object.entries(OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS)) {
    const record = readObject(exports[key])
    if (Object.keys(record).length === 0) continue
    const source = String(record.source ?? '').trim()
    const kind = String(record.kind ?? '').trim()
    const exportPath = String(record.path ?? '').trim()
    const sha256 = String(record.sha256 ?? '').trim()
    const rowCount = Number(record.rowCount ?? record.row_count ?? 0)
    if (source !== contract.source) blockers.push(`source_export_manifest_source_mismatch:${key}`)
    if (kind !== contract.kind) blockers.push(`source_export_manifest_kind_mismatch:${key}`)
    if (!exportPath) blockers.push(`source_export_manifest_path_required:${key}`)
    if (!/^[a-f0-9]{64}$/i.test(sha256)) blockers.push(`source_export_manifest_sha256_required:${key}`)
    if (!Number.isFinite(rowCount) || rowCount <= 0) blockers.push(`source_export_manifest_row_count_required:${key}`)
    if (Array.isArray(record.blockers) && record.blockers.length > 0) blockers.push(`source_export_manifest_record_blocked:${key}`)
    blockers.push(...manifestRecordDefaultMasterPlanLabelBlockers(record, key))
  }
  return blockers
}

function sourceManifestRecordKindMismatch(key, kind, contract) {
  if (key !== 'durationSamples') return kind !== contract.kind
  return !DURATION_SAMPLE_SOURCE_KINDS.has(kind)
}

function sourceManifestHasExplicitBlockers(root) {
  if (String(root.status ?? '').trim() !== 'blocked') return false
  if (Array.isArray(root.blockers) && root.blockers.length > 0) return true
  const exports = readObject(root.sourceExports)
  return Object.values(exports).some((record) => {
    const sourceRecord = readObject(record)
    return Array.isArray(sourceRecord.blockers) && sourceRecord.blockers.length > 0
  })
}

async function checkSourceManifest(filePath) {
  const state = await fileState(filePath)
  const manifest = state.exists ? await readJsonIfExists(filePath) : null
  const root = readObject(manifest)
  const boundary = readObject(root.mutationBoundary ?? root.mutation_boundary)
  const blockers = []
  if (!state.exists) {
    blockers.push('source_export_manifest_missing')
  } else {
    if (root.schemaVersion !== 'workbuddy-default-master-plan-production-source-exports/v1') {
      blockers.push('source_export_manifest_schema_version_invalid')
    }
    if (String(root.status ?? '').trim() !== 'exported' && !sourceManifestHasExplicitBlockers(root)) {
      blockers.push('source_export_manifest_not_exported')
    }
    if (!String(root.exportSessionId ?? root.export_session_id ?? '').trim()) blockers.push('source_export_manifest_session_id_required')
    if (String(root.phase ?? '').trim() !== 'all') blockers.push('source_export_manifest_phase_all_required')
    if (!String(root.baselineId ?? root.baseline_id ?? '').trim()) blockers.push('source_export_manifest_baseline_id_required')
    if (!String(root.projectId ?? root.project_id ?? '').trim()) blockers.push('source_export_manifest_project_id_required')
    if (!String(root.publicationKey ?? root.publication_key ?? '').trim()) blockers.push('source_export_manifest_publication_key_required')
    if (!['staging', 'production', 'live'].includes(String(root.environment ?? '').trim())) blockers.push('source_export_manifest_real_environment_required')
    if (Array.isArray(root.blockers) && root.blockers.length > 0) blockers.push('source_export_manifest_blockers_not_empty')
    if (!readBoolean(boundary.readsDatabase)) blockers.push('source_export_manifest_readsDatabase_required')
    if (!readBoolean(boundary.readsSourceFiles)) blockers.push('source_export_manifest_readsSourceFiles_required')
    for (const flag of [
      'writesProductionTables',
      'writesTasks',
      'writesTaskDependencies',
      'invokesRuntimeWriters',
      'writesRuntimePublication',
      'performsRollback',
    ]) {
      if (readBoolean(boundary[flag])) blockers.push(`source_export_manifest_${flag}_must_be_false`)
    }
    blockers.push(...sourceManifestRecordBlockers(root))
    blockers.push(...sourceManifestPipelineBlockers(root, filePath))
  }
  const evidenceQualification = buildProductionReadinessQualification([
    { label: 'sourceManifest', value: root },
  ])

  const structuralStatus = blockers.length === 0 ? 'ready' : 'blocked'
  const qualifiedProductionPipelineStatus = structuralStatus === 'ready' && evidenceQualification.blockers.length === 0
    ? 'ready'
    : 'blocked'
  const status = structuralStatus === 'blocked'
    ? 'blocked'
    : qualifiedProductionPipelineStatus === 'ready'
      ? 'ready_for_production_evidence_pipeline'
      : 'ready_for_staging_evidence_pipeline'

  return {
    sourcePath: filePath ? repoRelative(filePath) : null,
    exists: state.exists,
    sizeBytes: state.sizeBytes,
    status,
    structuralStatus,
    qualifiedProductionPipelineStatus,
    target: readObject(root.target),
    blockers,
    productionReadinessBlockers: evidenceQualification.blockers,
    evidenceQualification,
    mutationBoundary: {
      readsDatabase: readBoolean(boundary.readsDatabase),
      readsSourceFiles: readBoolean(boundary.readsSourceFiles),
      writesProductionTables: readBoolean(boundary.writesProductionTables),
      writesTasks: readBoolean(boundary.writesTasks),
      writesTaskDependencies: readBoolean(boundary.writesTaskDependencies),
      invokesRuntimeWriters: readBoolean(boundary.invokesRuntimeWriters),
      writesRuntimePublication: readBoolean(boundary.writesRuntimePublication),
      performsRollback: readBoolean(boundary.performsRollback),
    },
  }
}

const args = parseArgs(process.argv.slice(2))
await fs.mkdir(args.outputRoot, { recursive: true })
args.candidateHygiene ??= path.join(args.outputRoot, 'candidate-export-hygiene.json')

const sourceChecks = []
for (const item of SOURCE_REQUIREMENTS) {
  const sourcePath = args[item.key] ?? path.join(args.outputRoot, item.fileName)
  const state = await fileState(sourcePath)
  sourceChecks.push({
    ...item,
    sourcePath: sourcePath ? repoRelative(sourcePath) : null,
    exists: state.exists,
    sizeBytes: state.sizeBytes,
    builder: item.builder,
  })
}

const missing = sourceChecks.filter((item) => !item.exists)
const sourceManifestCheck = await checkSourceManifest(args.sourceManifest)
const candidateHygieneCheck = await checkCandidateHygiene(args.candidateHygiene)
const sourceKitStructurallyReady = missing.length === 0
  && sourceManifestCheck.structuralStatus === 'ready'
  && candidateHygieneCheck.status === 'pass'
const ready = sourceKitStructurallyReady && sourceManifestCheck.qualifiedProductionPipelineStatus === 'ready'
const reportStatus = !sourceKitStructurallyReady
  ? 'blocked'
  : ready
    ? 'ready'
    : 'ready_with_staging_blockers'

const report = {
  schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
  generatedAt: new Date().toISOString(),
  source: 'check-default-master-plan-evidence-sources',
  status: reportStatus,
  productionReady: false,
  outputRoot: repoRelative(args.outputRoot),
  missingCount: missing.length,
  missingEvidenceTypes: missing.map((item) => item.key),
  sourceChecks,
  candidateHygieneCheck,
  sourceManifestCheck,
  productionReadinessBlockers: sourceManifestCheck.productionReadinessBlockers,
  sourceKit: {
    entryTemplatePreflight: ENTRY_TEMPLATE_PREFLIGHT,
    candidateHygiene: CANDIDATE_HYGIENE,
    sourceExporter: SOURCE_EXPORTER,
    builders: SOURCE_REQUIREMENTS.map((item) => ({
      key: item.key,
      builder: item.builder,
      label: item.label,
      requiredInputs: item.inputs,
      commandTemplate: item.commandTemplate(),
    })),
  },
  mutationBoundary: {
    readsOnly: true,
    writesFiles: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  },
}

const reportPath = path.join(args.outputRoot, 'evidence-sources-report.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (args.json) {
  console.log(JSON.stringify({
    status: report.status,
    missingCount: report.missingCount,
    missingEvidenceTypes: report.missingEvidenceTypes,
    sourceManifestStatus: report.sourceManifestCheck.status,
    sourceManifestStructuralStatus: report.sourceManifestCheck.structuralStatus,
    qualifiedProductionPipelineStatus: report.sourceManifestCheck.qualifiedProductionPipelineStatus,
    candidateHygieneStatus: report.candidateHygieneCheck.status,
    candidateHygieneBlockers: report.candidateHygieneCheck.blockers,
    sourceManifestBlockers: report.sourceManifestCheck.blockers,
    productionReadinessBlockers: report.productionReadinessBlockers,
    reportPath: repoRelative(reportPath),
  }, null, 2))
} else {
  console.log(`# Default Master Plan Evidence Sources`)
  console.log(`Status: ${report.status}`)
  console.log(`Missing: ${report.missingCount}`)
  for (const item of sourceChecks) {
    console.log(`- ${item.key}: ${item.exists ? 'present' : 'missing'}${item.sourcePath ? ` (${item.sourcePath})` : ''}`)
  }
  console.log(`Candidate hygiene: ${candidateHygieneCheck.status}${candidateHygieneCheck.sourcePath ? ` (${candidateHygieneCheck.sourcePath})` : ''}`)
  for (const blocker of candidateHygieneCheck.blockers) {
    console.log(`  - ${blocker}`)
  }
  console.log(`Source manifest: ${sourceManifestCheck.status}${sourceManifestCheck.sourcePath ? ` (${sourceManifestCheck.sourcePath})` : ''}`)
  for (const blocker of sourceManifestCheck.blockers) {
    console.log(`  - ${blocker}`)
  }
  console.log(`Report: ${repoRelative(reportPath)}`)
}
