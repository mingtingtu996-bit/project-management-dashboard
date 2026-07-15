#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import {
  normalizeRealProductionOutcomeEvidence,
  validateRealProductionOutcomeFile,
} from './default-master-plan-real-outcome-evidence.mjs'
import { readDefaultMasterPlanEnvTarget } from './default-master-plan-env-target.mjs'
import { buildPgClientConfig } from './run-default-master-plan-candidate-refresh-execution.mjs'
import {
  defaultMasterPlanLikeSourceLabel,
  defaultMasterPlanFallbackAppliedSourceSignal,
  defaultMasterPlanStructuredSourceSignals,
  legacyDefaultMasterPlanSourceLabel,
  retiredOrLowInformationDefaultMasterPlanSource,
  supportedDefaultMasterPlanSourceLabel,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/source-exports')
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])
const EXPORT_PHASES = new Set(['all', 'duration'])
const COMPLETED_TASK_STATUS_VALUES = ['completed', 'complete', 'done', 'closed', 'finished']
const DURATION_SAMPLE_SOURCE_KINDS = new Set([
  'database_table',
  'operator_supplied_real_duration_sample_material',
  'blocked_real_duration_sample_material',
])
const DB_EXPORTS = [
  {
    key: 'durationSamples',
    option: 'durationSamples',
    fileName: 'duration-experience-samples-export.json',
    table: 'duration_experience_samples',
    sourceName: 'duration_experience_samples',
    rowArrayKey: 'duration_experience_samples',
    filters: [
      { column: 'project_id', option: 'projectId' },
    ],
    orderCandidates: ['completed_at', 'actual_end_date', 'created_at', 'updated_at'],
  },
  {
    key: 'rawCompletedTasks',
    option: 'rawCompletedTasks',
    fileName: 'raw-completed-tasks.json',
    table: 'tasks',
    sourceName: 'raw_completed_tasks',
    rowArrayKey: 'tasks',
    selectColumnCandidates: [
      'id',
      'task_id',
      'runtime_task_id',
      'project_id',
      'title',
      'name',
      'task_name',
      'status',
      'task_status',
      'standard_work_code',
      'stable_code',
      'wbs_stable_code',
      'actual_duration_days',
      'actual_duration',
      'actual_start_date',
      'started_at',
      'actual_start',
      'actual_end_date',
      'completed_at',
      'actual_finish',
      'actual_end',
      'evidence_ref',
      'source_type',
      'material_template',
      'template_placeholder',
      'staging_controlled_replay',
      'not_real_production_outcome',
      'metadata',
      'updated_at',
      'created_at',
    ],
    filters: [
      { column: 'project_id', option: 'projectId' },
    ],
    valueFilters: [
      {
        columnCandidates: ['status', 'task_status'],
        values: COMPLETED_TASK_STATUS_VALUES,
        blockerKey: 'completed_task_status',
      },
    ],
    requiredNotNullColumnGroups: [
      {
        columnCandidates: ['actual_start_date', 'started_at', 'actual_start'],
        blockerKey: 'completed_task_actual_start',
      },
      {
        columnCandidates: ['actual_end_date', 'completed_at', 'actual_finish', 'actual_end'],
        blockerKey: 'completed_task_actual_end',
      },
    ],
    orderCandidates: ['actual_end_date', 'completed_at', 'updated_at', 'created_at'],
    limit: 200,
  },
  {
    key: 'taskDependencies',
    option: 'taskDependencies',
    fileName: 'task-dependencies-export.json',
    table: 'task_dependencies',
    sourceName: 'task_dependencies',
    rowArrayKey: 'task_dependencies',
    filters: [
      { column: 'project_id', option: 'projectId' },
    ],
    orderCandidates: ['created_at', 'updated_at'],
  },
  {
    key: 'runtimePublications',
    option: 'runtimePublications',
    fileName: 'wbs-template-runtime-publications-export.json',
    table: 'wbs_template_runtime_publications',
    sourceName: 'wbs_template_runtime_publications',
    rowArrayKey: 'wbs_template_runtime_publications',
    filters: [
      { column: 'project_id', option: 'projectId' },
      { column: 'publication_key', option: 'publicationKey' },
      { column: 'accepted_baseline_id', option: 'baselineId', optionalColumn: true },
    ],
    orderCandidates: ['published_at', 'created_at', 'updated_at'],
  },
]

const FILE_EXPORTS = [
  {
    key: 'writerResult',
    option: 'writerResult',
    fileName: 'dependency-writer-result-export.json',
    sourceName: 'dependency_writer_result',
  },
  {
    key: 'criticalPathReadback',
    option: 'criticalPathReadback',
    fileName: 'critical-path-readback-export.json',
    sourceName: 'critical_path_readback',
  },
  {
    key: 'apiReadSmoke',
    option: 'apiReadSmoke',
    fileName: 'api-read-smoke-export.json',
    sourceName: 'api_read_smoke',
  },
  {
    key: 'uiConsumptionSmoke',
    option: 'uiConsumptionSmoke',
    fileName: 'ui-consumption-smoke-export.json',
    sourceName: 'ui_consumption_smoke',
  },
  {
    key: 'rollbackVerification',
    option: 'rollbackVerification',
    fileName: 'rollback-verification-export.json',
    sourceName: 'rollback_verification',
  },
  {
    key: 'realProductionOutcome',
    option: 'realProductionOutcome',
    fileName: 'real-production-outcome-export.json',
    sourceName: 'real_production_outcome',
  },
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    phase: 'all',
    baselineId: '',
    projectId: '',
    publicationKey: '',
    environment: '',
    exportedBy: '',
    durationSamples: '',
    rawCompletedTasks: '',
    taskDependencies: '',
    runtimePublications: '',
    writerResult: '',
    criticalPathReadback: '',
    apiReadSmoke: '',
    uiConsumptionSmoke: '',
    rollbackVerification: '',
    realProductionOutcome: '',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      index += 1
      return value
    }

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--output-root') {
      options.outputRoot = path.resolve(nextValue())
    } else if (arg === '--phase') {
      options.phase = nextValue()
    } else if (arg === '--baseline-id') {
      options.baselineId = nextValue()
    } else if (arg === '--project-id') {
      options.projectId = nextValue()
    } else if (arg === '--publication-key') {
      options.publicationKey = nextValue()
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--duration-samples') {
      options.durationSamples = path.resolve(nextValue())
    } else if (arg === '--raw-completed-tasks') {
      options.rawCompletedTasks = path.resolve(nextValue())
    } else if (arg === '--task-dependencies') {
      options.taskDependencies = path.resolve(nextValue())
    } else if (arg === '--runtime-publications') {
      options.runtimePublications = path.resolve(nextValue())
    } else if (arg === '--writer-result') {
      options.writerResult = path.resolve(nextValue())
    } else if (arg === '--critical-path-readback') {
      options.criticalPathReadback = path.resolve(nextValue())
    } else if (arg === '--api-read-smoke') {
      options.apiReadSmoke = path.resolve(nextValue())
    } else if (arg === '--ui-consumption-smoke') {
      options.uiConsumptionSmoke = path.resolve(nextValue())
    } else if (arg === '--rollback-verification') {
      options.rollbackVerification = path.resolve(nextValue())
    } else if (arg === '--real-production-outcome') {
      options.realProductionOutcome = path.resolve(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function exportDefaultMasterPlanProductionSources({
  envFile = DEFAULT_ENV_FILE,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  phase = 'all',
  baselineId = '',
  projectId = '',
  publicationKey = '',
  environment = '',
  exportedBy = '',
  durationSamples = '',
  rawCompletedTasks = '',
  taskDependencies = '',
  runtimePublications = '',
  writerResult = '',
  criticalPathReadback = '',
  apiReadSmoke = '',
  uiConsumptionSmoke = '',
  rollbackVerification = '',
  realProductionOutcome = '',
  queryExec = null,
  now = new Date(),
} = {}) {
  const normalized = {
    envFile: path.resolve(envFile),
    outputRoot: path.resolve(outputRoot),
    phase: text(phase) || 'all',
    baselineId: text(baselineId),
    projectId: text(projectId),
    publicationKey: text(publicationKey),
    environment: text(environment),
    exportedBy: text(exportedBy),
    durationSamples: text(durationSamples),
    rawCompletedTasks: text(rawCompletedTasks),
    taskDependencies: text(taskDependencies),
    runtimePublications: text(runtimePublications),
    writerResult: text(writerResult),
    criticalPathReadback: text(criticalPathReadback),
    apiReadSmoke: text(apiReadSmoke),
    uiConsumptionSmoke: text(uiConsumptionSmoke),
    rollbackVerification: text(rollbackVerification),
    realProductionOutcome: text(realProductionOutcome),
    exportSessionId: buildExportSessionId({
      baselineId,
      projectId,
      publicationKey,
      phase,
      now,
    }),
  }

  await mkdir(normalized.outputRoot, { recursive: true })
  const target = await readDefaultMasterPlanEnvTarget(normalized.envFile, { repoRoot: REPO_ROOT })
  normalized.target = target
  const selectedExports = selectExportsForPhase(normalized.phase, normalized)
  const sourceFilePreflightBlockers = selectedExports
    ? await sourceFileEnvironmentPreflightBlockers(selectedExports.fileExports, normalized)
    : []
  const realProductionOutcomeBlockers = selectedExports?.requiresPublicationKey
    && isProductionReadyEnvironment(normalized.environment)
    && normalized.realProductionOutcome
    ? [
      ...await validateRealProductionOutcomeFile(normalized.realProductionOutcome, {
        targetEnvironment: normalized.environment,
        baselineId: normalized.baselineId,
        projectId: normalized.projectId,
        publicationKey: normalized.publicationKey,
      }),
      ...await realProductionOutcomeMaterialRefPreflightBlockers(normalized),
    ]
    : []
  const preflightBlockers = [
    selectedExports ? null : 'export_phase_invalid',
    normalized.baselineId ? null : 'baseline_id_required',
    normalized.projectId ? null : 'project_id_required',
    selectedExports?.requiresPublicationKey && !normalized.publicationKey ? 'publication_key_required' : null,
    REAL_ENVIRONMENTS.has(normalized.environment) ? null : 'real_environment_required',
    normalized.exportedBy ? null : 'exported_by_required',
    selectedExports?.requiresPublicationKey
      && isProductionReadyEnvironment(normalized.environment)
      && !normalized.realProductionOutcome
      ? 'real_production_outcome_required'
      : null,
    ...sourceFilePreflightBlockers,
    ...realProductionOutcomeBlockers,
  ].filter(Boolean)

  const manifest = {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: preflightBlockers.length > 0 ? 'blocked' : 'exported',
    generatedAt: now.toISOString(),
    exportSessionId: normalized.exportSessionId,
    baselineId: normalized.baselineId,
    projectId: normalized.projectId,
    publicationKey: normalized.publicationKey,
    phase: normalized.phase,
    environment: normalized.environment,
    exportedBy: normalized.exportedBy,
    target,
    outputRoot: repoRelative(normalized.outputRoot),
    sourceExports: {},
    blockers: [...preflightBlockers],
    pipelineArgs: [],
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      readsExistingSourceExports: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  if (preflightBlockers.length > 0) {
    await writeManifest(normalized.outputRoot, manifest)
    return manifest
  }

  const missingDbExports = selectedExports.dbExports.filter((config) => !text(normalized[config.option]))
  let exec = null
  if (missingDbExports.length > 0) {
    try {
      exec = queryExec ?? (await createPgQueryExec(normalized.envFile))
    } catch (error) {
      manifest.blockers.push(`source_database_connection_failed:${errorBlockerMessage(error)}`)
      manifest.status = 'blocked'
      await writeManifest(normalized.outputRoot, manifest)
      return manifest
    }
  }
  try {
    for (const config of selectedExports.dbExports) {
      const record = text(normalized[config.option])
        ? await registerExistingDbExport({ config, options: normalized })
        : await exportDbSource({
            queryExec: exec,
            config,
            options: normalized,
            now,
          })
      manifest.sourceExports[config.key] = record
      manifest.blockers.push(...record.blockers.map((blocker) => `${config.key}:${blocker}`))
      if (text(normalized[config.option])) manifest.mutationBoundary.readsExistingSourceExports = true
    }

    for (const config of selectedExports.fileExports) {
      const record = await exportFileSource({
        config,
        options: normalized,
        now,
      })
      manifest.sourceExports[config.key] = record
      manifest.blockers.push(...record.blockers.map((blocker) => `${config.key}:${blocker}`))
    }

    manifest.blockers.push(...realProductionOutcomeRuntimePublicationRefBlockers(normalized.environment, manifest.sourceExports))
    manifest.status = manifest.blockers.length > 0 ? 'blocked' : 'exported'
    manifest.pipelineArgs = buildPipelineArgs(manifest)
    await writeManifest(normalized.outputRoot, manifest)
    return manifest
  } finally {
    await closeQueryExec(exec)
  }
}

async function sourceFileEnvironmentPreflightBlockers(fileExports, options) {
  const blockers = []
  for (const config of fileExports) {
    if (config.key === 'realProductionOutcome') continue
    const inputPath = options[config.option]
    if (!inputPath) continue
    let payload = {}
    try {
      payload = readObject(JSON.parse(await readFile(inputPath, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    const sourceEnvironment = sourceFileDeclaredEnvironment(payload)
    if (sourceEnvironment && sourceEnvironment !== options.environment) {
      blockers.push(`${config.key}:source_file_environment_mismatch`)
    }
    const sourceTargetEnvironment = sourceFileDeclaredTargetEnvironment(payload)
    if (sourceTargetEnvironment && sourceTargetEnvironment !== options.environment) {
      blockers.push(`${config.key}:source_file_target_environment_mismatch`)
    }
    const sourceIdentity = sourceFileDeclaredIdentity(payload)
    if (sourceIdentity.baselineId && sourceIdentity.baselineId !== options.baselineId) {
      blockers.push(`${config.key}:source_file_baseline_id_mismatch`)
    }
    if (sourceIdentity.projectId && sourceIdentity.projectId !== options.projectId) {
      blockers.push(`${config.key}:source_file_project_id_mismatch`)
    }
    if (sourceIdentity.publicationKey && sourceIdentity.publicationKey !== options.publicationKey) {
      blockers.push(`${config.key}:source_file_publication_key_mismatch`)
    }
    for (const blocker of sourceFileDefaultMasterPlanLabelBlockers(payload)) {
      blockers.push(`${config.key}:${blocker}`)
    }
  }
  return blockers
}

async function realProductionOutcomeMaterialRefPreflightBlockers(options) {
  const outcome = await readJsonFileIfPresent(options.realProductionOutcome)
  if (Object.keys(outcome).length === 0) return []
  const expectedRefs = [
    [
      'api_read_smoke',
      text(outcome.apiReadSmokeEvidenceRef ?? outcome.api_read_smoke_evidence_ref),
      await sourceExportEvidenceRefFor('api_read_smoke_export', options.apiReadSmoke),
    ],
    [
      'ui_consumption_smoke',
      text(outcome.uiConsumptionSmokeEvidenceRef ?? outcome.ui_consumption_smoke_evidence_ref),
      await sourceExportEvidenceRefFor('ui_consumption_smoke_export', options.uiConsumptionSmoke),
    ],
    [
      'critical_path_readback',
      text(outcome.criticalPathReadbackEvidenceRef ?? outcome.critical_path_readback_evidence_ref),
      await sourceExportEvidenceRefFor('critical_path_readback_export', options.criticalPathReadback),
    ],
    [
      'rollback',
      text(outcome.rollbackEvidenceRef ?? outcome.rollback_evidence_ref),
      await sourceExportEvidenceRefFor('rollback_verification_export', options.rollbackVerification),
    ],
  ]
  return expectedRefs.flatMap(([kind, actual, expected]) => {
    if (!expected) return [`real_production_outcome_${kind}_evidence_ref_source_required`]
    return actual === expected ? [] : [`real_production_outcome_${kind}_evidence_ref_mismatch`]
  })
}

function realProductionOutcomeRuntimePublicationRefBlockers(environment, sourceExports) {
  if (!isProductionReadyEnvironment(environment)) return []
  const evidence = readObject(sourceExports.realProductionOutcome?.realProductionOutcomeEvidence)
  if (Object.keys(evidence).length === 0) return []
  const runtimePublications = readObject(sourceExports.runtimePublications)
  const actual = text(evidence.runtimePublicationEvidenceRef ?? evidence.runtime_publication_evidence_ref)
  const expected = runtimePublications.path && runtimePublications.sha256
    ? `wbs_template_runtime_publications_export:${runtimePublications.path}#sha256=${runtimePublications.sha256}`
    : ''
  if (!expected) return ['real_production_outcome_runtime_publication_evidence_ref_source_required']
  return actual === expected ? [] : ['real_production_outcome_runtime_publication_evidence_ref_mismatch']
}

async function sourceExportEvidenceRefFor(prefix, filePath) {
  if (!filePath) return ''
  try {
    const sha256 = await sha256File(filePath)
    return `${prefix}:${repoRelative(filePath)}#sha256=${sha256}`
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

async function readJsonFileIfPresent(filePath) {
  if (!filePath) return {}
  try {
    return readObject(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function sourceFileDeclaredEnvironment(payload) {
  const record = readObject(payload)
  const metadata = readObject(record.export_metadata ?? record.exportMetadata ?? readObject(record.metadata).export)
  return text(
    metadata.environment
      ?? metadata.source_environment
      ?? metadata.sourceEnvironment
      ?? record.environment
      ?? record.targetEnvironment
      ?? record.target_environment
      ?? record.runtimeEnvironment
      ?? record.runtime_environment
      ?? record.releaseEnvironment
      ?? record.release_environment,
  )
}

function sourceFileDeclaredTargetEnvironment(payload) {
  const record = readObject(payload)
  const metadata = readObject(record.export_metadata ?? record.exportMetadata ?? readObject(record.metadata).export)
  const target = readObject(record.target ?? record.environmentTarget ?? record.environment_target ?? metadata.target)
  return text(
    target.environment
      ?? target.targetEnvironment
      ?? target.target_environment
      ?? target.runtimeEnvironment
      ?? target.runtime_environment,
  )
}

function sourceFileDeclaredIdentity(payload) {
  const record = readObject(payload)
  const metadata = readObject(record.export_metadata ?? record.exportMetadata ?? readObject(record.metadata).export)
  return {
    baselineId: text(
      metadata.baseline_id
        ?? metadata.baselineId
        ?? record.baselineId
        ?? record.baseline_id
        ?? record.acceptedBaselineId
        ?? record.accepted_baseline_id,
    ),
    projectId: text(
      metadata.project_id
        ?? metadata.projectId
        ?? record.projectId
        ?? record.project_id,
    ),
    publicationKey: text(
      metadata.publication_key
        ?? metadata.publicationKey
        ?? record.publicationKey
        ?? record.publication_key
        ?? record.runtimePublicationKey
        ?? record.runtime_publication_key,
    ),
  }
}

function extractDefaultMasterPlanSourceLabels(payload) {
  const record = readObject(payload)
  const candidatePlan = readObject(record.candidate_default_master_plan ?? record.candidateDefaultMasterPlan)
  const rows = Array.isArray(record.rows)
    ? record.rows
    : Array.isArray(record.data)
      ? record.data
      : []
  const labels = [
    ...defaultMasterPlanStructuredSourceSignals(record),
    ...defaultMasterPlanStructuredSourceSignals(candidatePlan),
    ...defaultMasterPlanStructuredSourceSignals(record.sourceMetadata ?? record.source_metadata),
    ...defaultMasterPlanStructuredSourceSignals(record.runtimeLineage ?? record.runtime_lineage),
    ...defaultMasterPlanStructuredSourceSignals(record.sourceLineage ?? record.source_lineage),
    candidatePlan.generation_mode,
    candidatePlan.generationMode,
    candidatePlan.source_version_label,
    candidatePlan.sourceVersionLabel,
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
    ...rows.flatMap((row) => {
      const rowRecord = readObject(row)
      const metadata = readObject(rowRecord.metadata ?? rowRecord.generation_metadata ?? rowRecord.generationMetadata)
      return [
        ...defaultMasterPlanStructuredSourceSignals(rowRecord),
        ...defaultMasterPlanStructuredSourceSignals(metadata),
        rowRecord.generation_mode,
        rowRecord.generationMode,
        rowRecord.source_version_label,
        rowRecord.sourceVersionLabel,
        rowRecord.source,
        rowRecord.originalSource,
        rowRecord.original_source,
        rowRecord.source_type,
        rowRecord.sourceType,
        rowRecord.handoff_generation_mode,
        rowRecord.handoffGenerationMode,
        rowRecord.controlledDegradation,
        rowRecord.controlled_degradation,
        defaultMasterPlanFallbackAppliedSourceSignal(rowRecord.fallbackApplied),
        defaultMasterPlanFallbackAppliedSourceSignal(rowRecord.fallback_applied),
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

function sourceFileDefaultMasterPlanLabelBlockers(payload) {
  const labels = extractDefaultMasterPlanSourceLabels(payload)
  if (labels.some(legacyDefaultMasterPlanSourceLabel)) {
    return ['source_file_legacy_default_master_plan_label']
  }
  if (labels.some(retiredOrLowInformationDefaultMasterPlanSource)) {
    return ['source_file_retired_or_low_information_default_master_plan_label']
  }
  const defaultMasterPlanLikeLabels = labels.filter(defaultMasterPlanLikeSourceLabel)
  if (defaultMasterPlanLikeLabels.some((label) => !supportedDefaultMasterPlanSourceLabel(label))) {
    return ['source_file_unsupported_default_master_plan_label']
  }
  return []
}

async function exportDbSource({ queryExec, config, options, now }) {
  const outputPath = path.join(options.outputRoot, config.fileName)
  const blockers = []
  let rows = []
  try {
    const table = await readTableColumns(queryExec, 'public', config.table)
    if (!table.exists) {
      blockers.push(`table_missing:public.${config.table}`)
    } else {
      const query = buildSelectQuery(config, table.columns, options)
      if (query.blockers.length > 0) {
        blockers.push(...query.blockers)
      } else {
        rows = await queryExec(query.sql, query.params)
      }
    }
  } catch (error) {
    blockers.push(`db_query_failed:${errorBlockerMessage(error)}`)
  }

  const payload = {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: buildExportMetadata({
    sourceName: config.sourceName,
    options,
    target: options.target,
    now,
      sourceKind: 'database_table',
      table: `public.${config.table}`,
    }),
    rows,
    [config.rowArrayKey]: rows,
  }
      await writeJson(outputPath, payload)
  const sha256 = await sha256File(outputPath)
  return {
    source: config.sourceName,
    kind: 'database_table',
    table: `public.${config.table}`,
    path: repoRelative(outputPath),
    sha256,
    rowCount: rows.length,
    blockers,
  }
}

async function registerExistingDbExport({ config, options }) {
  const sourcePath = options[config.option]
  const outputPath = path.join(options.outputRoot, config.fileName)
  const blockers = []
  let payload = {}
  try {
    payload = readObject(JSON.parse(await readFile(sourcePath, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      blockers.push('source_export_file_missing')
    } else {
      throw error
    }
  }

  const metadata = readObject(payload.export_metadata ?? payload.exportMetadata)
  const rows = Array.isArray(payload[config.rowArrayKey])
    ? payload[config.rowArrayKey]
    : Array.isArray(payload.rows)
      ? payload.rows
      : []
  const source = text(metadata.source ?? payload.source)
  const kind = text(metadata.source_kind ?? metadata.sourceKind ?? payload.kind)
  const table = text(metadata.table ?? payload.table)
  if (source !== config.sourceName) blockers.push('source_export_source_mismatch')
  blockers.push(...existingDbExportKindBlockers(config, kind, metadata))
  if (table !== `public.${config.table}`) blockers.push('source_export_table_mismatch')
  if (text(metadata.baseline_id ?? metadata.baselineId) && text(metadata.baseline_id ?? metadata.baselineId) !== options.baselineId) {
    blockers.push('source_export_baseline_id_mismatch')
  }
  if (text(metadata.project_id ?? metadata.projectId) && text(metadata.project_id ?? metadata.projectId) !== options.projectId) {
    blockers.push('source_export_project_id_mismatch')
  }
  if (text(metadata.publication_key ?? metadata.publicationKey) && text(metadata.publication_key ?? metadata.publicationKey) !== options.publicationKey) {
    blockers.push('source_export_publication_key_mismatch')
  }
  if (text(metadata.environment) && text(metadata.environment) !== options.environment) {
    blockers.push('source_export_environment_mismatch')
  }

  if (path.resolve(sourcePath) !== path.resolve(outputPath)) {
    await writeJson(outputPath, payload)
  }
  const sha256 = await sha256File(outputPath)
  return {
    source: config.sourceName,
    kind,
    table: `public.${config.table}`,
    sourcePath: repoRelative(sourcePath),
    path: repoRelative(outputPath),
    sha256,
    rowCount: rows.length,
    blockers,
  }
}

function existingDbExportKindBlockers(config, kind, metadata) {
  if (config.key !== 'durationSamples') {
    return kind === 'database_table' ? [] : ['source_export_kind_mismatch']
  }
  if (!DURATION_SAMPLE_SOURCE_KINDS.has(kind)) {
    return ['source_export_kind_mismatch']
  }
  if (kind === 'blocked_real_duration_sample_material' || metadata.blocked === true) {
    return ['blocked_real_duration_sample_material']
  }
  return []
}

async function exportFileSource({ config, options, now }) {
  const inputPath = options[config.option]
  const outputPath = path.join(options.outputRoot, config.fileName)
  const blockers = []
  let payload = {}
  let sourceSha256 = ''
  if (!inputPath) {
    blockers.push('source_file_required')
  } else {
    try {
      payload = readObject(JSON.parse(await readFile(inputPath, 'utf8')))
      sourceSha256 = await sha256File(inputPath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        blockers.push('source_file_missing')
      } else {
        throw error
      }
    }
  }
  const sourcePath = inputPath ? repoRelative(inputPath) : null
  const exportPayload = config.key === 'realProductionOutcome' && sourcePath && sourceSha256
    ? {
        ...payload,
        evidenceRef: `real_production_outcome_export:${sourcePath}#sha256=${sourceSha256}`,
      }
    : payload

  const wrappedPayload = {
    ...exportPayload,
    export_metadata: buildExportMetadata({
    sourceName: config.sourceName,
    options,
    target: options.target,
    now,
      sourceKind: 'source_file',
      sourcePath,
    }),
  }
  await writeJson(outputPath, wrappedPayload)
  const sha256 = await sha256File(outputPath)
  return {
    source: config.sourceName,
    kind: 'source_file',
    sourcePath,
    ...(config.key === 'realProductionOutcome' && sourceSha256 ? { sourceSha256 } : {}),
    ...(config.key === 'realProductionOutcome' ? { realProductionOutcomeEvidence: normalizeRealProductionOutcomeEvidence(wrappedPayload) } : {}),
    path: repoRelative(outputPath),
    sha256,
    rowCount: Object.keys(payload).length > 0 ? 1 : 0,
    blockers,
  }
}

function buildPipelineArgs(manifest) {
  const sourceExports = manifest.sourceExports
  const args = [
    'node',
    'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    '--baseline-id', manifest.baselineId,
    '--project-id', manifest.projectId,
    '--publication-key', manifest.publicationKey,
    '--environment', manifest.environment,
    '--duration-calibrated-by', manifest.exportedBy,
    '--published-by', manifest.exportedBy,
    '--source-manifest', sourceManifestPathForManifest(manifest),
  ]
  const mappings = [
    ['--duration-samples', sourceExports.durationSamples],
    ['--writer-result', sourceExports.writerResult],
    ['--task-dependencies', sourceExports.taskDependencies],
    ['--runtime-publications', sourceExports.runtimePublications],
    ['--api-read-smoke', sourceExports.apiReadSmoke],
    ['--ui-consumption-smoke', sourceExports.uiConsumptionSmoke],
    ['--critical-path-readback', sourceExports.criticalPathReadback],
    ['--rollback-verification', sourceExports.rollbackVerification],
    ['--real-production-outcome', sourceExports.realProductionOutcome],
  ]
  for (const [flag, record] of mappings) {
    if (record?.path) args.push(flag, record.path)
  }
  return args
}

function selectExportsForPhase(phase, options = {}) {
  if (!EXPORT_PHASES.has(phase)) return null
  if (phase === 'duration') {
    return {
      requiresPublicationKey: false,
      dbExports: DB_EXPORTS.filter((config) => ['durationSamples', 'rawCompletedTasks'].includes(config.key)),
      fileExports: [],
    }
  }
  return {
    requiresPublicationKey: true,
    dbExports: DB_EXPORTS,
    fileExports: FILE_EXPORTS.filter((config) => {
      if (config.key !== 'realProductionOutcome') return true
      return isProductionReadyEnvironment(options.environment) || Boolean(text(options.realProductionOutcome))
    }),
  }
}

function isProductionReadyEnvironment(value) {
  return ['production', 'live'].includes(text(value).toLowerCase())
}

function buildExportMetadata({ sourceName, options, target, now, sourceKind, table = null, sourcePath = null }) {
  return {
    source: sourceName,
    source_kind: sourceKind,
    table,
    source_path: sourcePath,
    exported_at: now.toISOString(),
    exported_by: options.exportedBy,
    export_session_id: options.exportSessionId,
    environment: options.environment,
    baseline_id: options.baselineId,
    project_id: options.projectId,
    publication_key: options.publicationKey,
    target,
    mutation_boundary: {
      readsDatabase: sourceKind === 'database_table',
      readsSourceFile: sourceKind === 'source_file',
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}

function buildExportSessionId({ baselineId, projectId, publicationKey, phase, now }) {
  const fingerprint = createHash('sha256')
    .update([
      text(baselineId),
      text(projectId),
      text(publicationKey),
      text(phase) || 'all',
      now.toISOString(),
    ].join('|'))
    .digest('hex')
    .slice(0, 16)
  return `default-master-plan-source-export:${now.toISOString()}:${fingerprint}`
}

async function readTableColumns(queryExec, schemaName, tableName) {
  const rows = await queryExec(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position`,
    [schemaName, tableName],
  )
  const columns = rows.map((row) => text(row.column_name)).filter(Boolean)
  return {
    exists: columns.length > 0,
    columns: new Set(columns),
  }
}

function buildSelectQuery(config, columns, options) {
  const where = []
  const params = []
  const blockers = []
  const selectedColumns = config.selectColumnCandidates
    ? selectedColumnList(config.selectColumnCandidates, columns)
    : []
  if (config.selectColumnCandidates && selectedColumns.length === 0) {
    blockers.push(`select_columns_missing:${config.table}`)
  }
  for (const filter of config.filters) {
    if (!columns.has(filter.column)) {
      if (filter.optionalColumn) continue
      blockers.push(`column_missing:${config.table}.${filter.column}`)
      continue
    }
    const value = filter.value ?? options[filter.option]
    if (!text(value)) {
      blockers.push(`filter_value_missing:${filter.column}`)
      continue
    }
    params.push(value)
    if (filter.optionalNull) {
      where.push(`(${quoteIdent(filter.column)} = $${params.length} OR ${quoteIdent(filter.column)} IS NULL)`)
    } else {
      where.push(`${quoteIdent(filter.column)} = $${params.length}`)
    }
  }
  for (const filter of config.valueFilters ?? []) {
    const column = firstExistingColumn(filter.columnCandidates, columns)
    if (!column) {
      blockers.push(`column_group_missing:${config.table}.${filter.blockerKey}`)
      continue
    }
    const placeholders = []
    for (const value of filter.values ?? []) {
      params.push(value)
      placeholders.push(`$${params.length}`)
    }
    if (placeholders.length === 0) {
      blockers.push(`filter_values_missing:${filter.blockerKey}`)
      continue
    }
    where.push(`${quoteIdent(column)} IN (${placeholders.join(', ')})`)
  }
  for (const requirement of config.requiredNotNullColumnGroups ?? []) {
    const column = firstExistingColumn(requirement.columnCandidates, columns)
    if (!column) {
      blockers.push(`column_group_missing:${config.table}.${requirement.blockerKey}`)
      continue
    }
    where.push(`${quoteIdent(column)} IS NOT NULL`)
  }

  const orderColumn = config.orderCandidates.find((column) => columns.has(column))
  const orderBy = orderColumn ? ` ORDER BY ${quoteIdent(orderColumn)} DESC` : ''
  const selectClause = selectedColumns.length > 0 ? selectedColumns.map(quoteIdent).join(', ') : '*'
  const limit = Number.isInteger(config.limit) && config.limit > 0 ? config.limit : 500
  return {
    blockers,
    sql: `SELECT ${selectClause} FROM public.${quoteIdent(config.table)}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''}${orderBy} LIMIT ${limit}`,
    params,
  }
}

function selectedColumnList(candidates, columns) {
  const selected = []
  for (const column of candidates ?? []) {
    if (columns.has(column) && !selected.includes(column)) selected.push(column)
  }
  return selected
}

function firstExistingColumn(candidates, columns) {
  for (const column of candidates ?? []) {
    if (columns.has(column)) return column
  }
  return ''
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'))
  const connectionString = text(env.SUPABASE_MIGRATION_URL) || text(env.DB_CONNECTION_STRING)
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for default master-plan source exports')
  }
  const client = new pg.Client(buildSourceExportPgClientConfig(connectionString, env))
  await client.connect()
  const exec = async (sql, params = []) => {
    const result = await client.query(sql, params)
    return result.rows
  }
  exec.close = async () => {
    await client.end()
  }
  return exec
}

export function buildSourceExportPgClientConfig(connectionString, env = {}) {
  return buildPgClientConfig(connectionString, env)
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') {
    await queryExec.close()
  }
}

async function writeManifest(outputRoot, manifest) {
  const manifestPath = path.join(outputRoot, sourceManifestFileNameForPhase(manifest.phase))
  await writeJson(manifestPath, manifest)
}

function sourceManifestFileNameForPhase(phase) {
  return text(phase) === 'all'
    ? 'source-exports-manifest.json'
    : `source-exports-manifest.${text(phase)}.json`
}

function sourceManifestPathForManifest(manifest) {
  return `${manifest.outputRoot}/${sourceManifestFileNameForPhase(manifest.phase)}`
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return String(value ?? '').trim()
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function errorBlockerMessage(error) {
  return text(error instanceof Error ? error.message : error)
    .replace(/\s+/g, ' ')
    .slice(0, 160)
    || 'unknown_error'
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log([
      'Usage: node project-testing/tools/export-default-master-plan-production-sources.mjs',
      '  --baseline-id <id> --project-id <id> --publication-key <key>',
      '  --environment <staging|production|live> --exported-by <actor>',
      '  [--phase all|duration] [--env-file <path>] [--output-root <dir>]',
      '  [--writer-result <json>] [--critical-path-readback <json>]',
      '  [--api-read-smoke <json>] [--ui-consumption-smoke <json>] [--rollback-verification <json>]',
      '  [--real-production-outcome <json>]',
    ].join('\n'))
    process.exit(0)
  }
  const manifest = await exportDefaultMasterPlanProductionSources(options)
  console.log(JSON.stringify({
    status: manifest.status,
    outputRoot: manifest.outputRoot,
    manifestPath: sourceManifestPathForManifest(manifest),
    blockers: manifest.blockers,
    pipelineArgs: manifest.pipelineArgs,
  }, null, 2))
}
