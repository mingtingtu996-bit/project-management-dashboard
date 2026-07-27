#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_PACKAGE = path.join(OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_SAMPLE_MATERIAL = path.join(OUTPUT_ROOT, 'real-duration-sample-material.json')
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'source-exports', 'duration-experience-samples-export.json')
const DEFAULT_MATERIAL_PREFLIGHT = path.join(OUTPUT_ROOT, 'real-duration-sample-material-preflight.json')
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    sampleMaterial: DEFAULT_SAMPLE_MATERIAL,
    output: DEFAULT_OUTPUT,
    materialPreflight: DEFAULT_MATERIAL_PREFLIGHT,
    environment: '',
    exportedBy: '',
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--collection-package') {
      options.collectionPackage = path.resolve(nextValue())
    } else if (arg === '--sample-material') {
      options.sampleMaterial = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--material-preflight') {
      options.materialPreflight = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanRealDurationSampleSourceExport({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  sampleMaterial = DEFAULT_SAMPLE_MATERIAL,
  output = DEFAULT_OUTPUT,
  materialPreflight = DEFAULT_MATERIAL_PREFLIGHT,
  environment = '',
  exportedBy = '',
  now = new Date(),
} = {}) {
  const collectionPackagePath = path.resolve(collectionPackage)
  const sampleMaterialPath = path.resolve(sampleMaterial)
  const materialPreflightPath = path.resolve(materialPreflight)
  const outputPath = path.resolve(output)
  const packagePayload = JSON.parse(await readFile(collectionPackagePath, 'utf8'))
  const materialRead = await readOptionalJsonFile(sampleMaterialPath)
  const materialPayload = materialRead.payload
  const materialPreflightRead = await readOptionalJsonFile(materialPreflightPath)
  const materialPreflightPayload = materialPreflightRead.payload
  const baselineId = text(packagePayload.baselineId ?? packagePayload.baseline_id)
  const projectId = text(packagePayload.projectId ?? packagePayload.project_id)
  const sampleRequests = readSampleRequests(packagePayload)
  const requestByStableCode = new Map(sampleRequests.map((request) => [requestStableCode(request), request]))
  const rawSamples = readSamples(materialPayload)
  const invalidSamples = []
  const validRows = []

  for (const sample of rawSamples) {
    const code = sampleStableCode(sample)
    const blockers = sampleBlockers(sample, {
      projectId,
      requestedStableCodes: new Set(requestByStableCode.keys()),
    })
    if (blockers.length > 0) {
      invalidSamples.push({
        id: text(sample.id),
        stableCode: code,
        title: text(sample.title ?? sample.standard_work_name ?? sample.standardWorkName),
        blockers,
      })
      continue
    }
    validRows.push(normalizeSampleRow(sample, {
      baselineId,
      projectId,
      request: requestByStableCode.get(code),
      collectionPackagePath,
      sampleMaterialPath,
      materialPayload,
    }))
  }

  const acceptedCountByStableCode = new Map()
  for (const row of validRows) {
    const code = text(row.standard_work_code)
    acceptedCountByStableCode.set(code, (acceptedCountByStableCode.get(code) ?? 0) + 1)
  }
  const missingStableCodes = sampleRequests
    .map((request) => {
      const code = requestStableCode(request)
      const required = Math.max(1, readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count))
      const accepted = acceptedCountByStableCode.get(code) ?? 0
      return accepted >= required ? null : code
    })
    .filter(Boolean)
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    materialPreflightRead.missing ? 'real_duration_sample_material_preflight_file_missing' : null,
    ...materialPreflightBlockers(materialPreflightPayload, { collectionPackagePath, sampleMaterialPath }),
    text(exportedBy) ? null : 'exported_by_required',
    REAL_ENVIRONMENTS.has(text(environment)) ? null : 'real_environment_required',
    sampleRequests.length > 0 ? null : 'sample_requests_required',
    materialRead.missing ? 'real_duration_sample_material_file_missing' : null,
    rawSamples.length > 0 ? null : 'real_duration_sample_material_required',
    invalidSamples.length === 0 ? null : 'invalid_real_duration_sample_material_present',
    missingStableCodes.length === 0 ? null : 'accepted_real_duration_sample_coverage_incomplete',
  ])
  const status = blockers.length === 0 ? 'ready' : 'blocked'
  const blocked = status !== 'ready'
  const sourceKind = blocked ? 'blocked_real_duration_sample_material' : 'operator_supplied_real_duration_sample_material'
  const sourceExport = {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: {
      source: 'duration_experience_samples',
      source_kind: sourceKind,
      blocked,
      table: 'public.duration_experience_samples',
      source_path: await fileRefOrMissing(sampleMaterialPath),
      material_preflight_ref: await fileRefOrMissing(materialPreflightPath),
      collection_package_ref: `${repoRelative(collectionPackagePath)}#sha256=${await sha256File(collectionPackagePath)}`,
      exported_at: now.toISOString(),
      exported_by: text(exportedBy),
      export_session_id: `real-duration-sample-source-export:${now.toISOString()}:${hashText(`${sampleMaterialPath}:${now.toISOString()}`).slice(0, 16)}`,
      environment: text(environment),
      baseline_id: baselineId,
      project_id: projectId,
      mutation_boundary: {
        readsDurationSampleCollectionPackage: true,
        readsRealDurationSampleMaterial: true,
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesDurationSamples: false,
        writesRuntimePublication: false,
        performsRollback: false,
      },
    materialPreflightRef: `real_duration_sample_material_preflight:${await fileRefOrMissing(materialPreflightPath)}`,
    },
    rows: validRows,
  }
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-source-export/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-duration-sample-source-export',
    status,
    productionReady: false,
    baselineId,
    projectId,
    sourceExportRef: `duration_experience_samples_export:${repoRelative(outputPath)}`,
    sampleMaterialRef: `real_duration_sample_material:${await fileRefOrMissing(sampleMaterialPath)}`,
    summary: {
      requiredStableCodeCount: sampleRequests.length,
      rawSampleCount: rawSamples.length,
      exportedSampleCount: validRows.length,
      invalidSampleCount: invalidSamples.length,
      missingStableCodeCount: missingStableCodes.length,
      missingStableCodes,
    },
    invalidSamples,
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsRealDurationSampleMaterial: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(sourceExport, null, 2)}\n`, 'utf8')
  await writeFile(reportPathFor(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function materialPreflightBlockers(payload, { collectionPackagePath, sampleMaterialPath }) {
  const expectedCollectionPrefix = `duration_sample_collection_package:${repoRelative(collectionPackagePath)}#sha256=`
  const expectedMaterialPrefix = `real_duration_sample_material:${repoRelative(sampleMaterialPath)}#sha256=`
  const mutationBoundary = readObject(payload?.mutationBoundary ?? payload?.mutation_boundary)
  const expectedMaterialMissingRef = `real_duration_sample_material:${repoRelative(sampleMaterialPath)}#missing`
  const sampleMaterialRef = text(payload?.sampleMaterialRef ?? payload?.sample_material_ref)
  return uniqueText([
    payload && typeof payload === 'object' ? null : 'real_duration_sample_material_preflight_required',
    text(payload?.status) === 'ready_for_source_export' ? null : 'real_duration_sample_material_preflight_not_ready',
    text(payload?.collectionPackageRef ?? payload?.collection_package_ref).startsWith(expectedCollectionPrefix)
      ? null
      : 'real_duration_sample_material_preflight_collection_package_ref_mismatch',
    sampleMaterialRef.startsWith(expectedMaterialPrefix) || sampleMaterialRef === expectedMaterialMissingRef
      ? null
      : 'real_duration_sample_material_preflight_sample_material_ref_mismatch',
    mutationBoundary.writesDurationSamples === false
      ? null
      : 'real_duration_sample_material_preflight_no_write_boundary_missing',
    mutationBoundary.writesProductionTables === false
      ? null
      : 'real_duration_sample_material_preflight_production_write_boundary_missing',
  ])
}
function readSampleRequests(payload) {
  if (Array.isArray(payload?.sampleRequests)) return payload.sampleRequests
  if (Array.isArray(payload?.sample_requests)) return payload.sample_requests
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function readSamples(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.samples)) return payload.samples
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.duration_experience_samples)) return payload.duration_experience_samples
  return []
}

function sampleBlockers(sample, { projectId, requestedStableCodes }) {
  const metadata = readObject(sample.metadata)
  const code = sampleStableCode(sample)
  const status = text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase()
  const includedInBenchmark = readBoolean(sample.included_in_benchmark ?? sample.includedInBenchmark)
  const sourceType = text(sample.source_type ?? sample.sourceType)
  const sampleProjectId = text(sample.project_id ?? sample.projectId)
  const taskId = text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId)
  const metadataSource = text(metadata.source ?? metadata.source_type ?? metadata.sourceType)
  const templateMaterial = readBoolean(
    sample.materialTemplate
      ?? sample.material_template
      ?? sample.templatePlaceholder
      ?? sample.template_placeholder
      ?? metadata.materialTemplate
      ?? metadata.material_template
      ?? metadata.templatePlaceholder
      ?? metadata.template_placeholder,
  )
  const stagingControlledReplay = readBoolean(
    sample.stagingControlledReplay
      ?? sample.staging_controlled_replay
      ?? metadata.stagingControlledReplay
      ?? metadata.staging_controlled_replay,
  )
  const notRealProductionOutcome = readBoolean(
    sample.notRealProductionOutcome
      ?? sample.not_real_production_outcome
      ?? metadata.notRealProductionOutcome
      ?? metadata.not_real_production_outcome,
  )
  return [
    code ? null : 'stable_code_required',
    code && requestedStableCodes.has(code) ? null : 'stable_code_not_requested_by_collection_package',
    ['active', 'accepted'].includes(status) ? null : 'sample_status_must_be_active_or_accepted',
    includedInBenchmark ? null : 'included_in_benchmark_required',
    actualDuration(sample) > 0 ? null : 'actual_duration_days_required',
    projectId && sampleProjectId === projectId ? null : 'duration_sample_project_id_mismatch',
    taskId ? null : 'duration_sample_task_identity_required',
    !sourceType || sourceType === 'completed_task' ? null : 'duration_sample_source_type_must_be_completed_task',
    text(sample.evidenceRef ?? sample.evidence_ref ?? metadata.evidenceRef ?? metadata.evidence_ref) ? null : 'real_duration_sample_evidence_ref_required',
    templateMaterial ? 'real_duration_sample_template_material_must_be_filled_before_export' : null,
    stagingControlledReplay ? 'real_duration_sample_must_not_be_staging_controlled_replay' : null,
    notRealProductionOutcome ? 'real_duration_sample_must_not_be_marked_not_real_production_outcome' : null,
    metadataSource === 'default_master_plan_staging_runtime_writer' ? 'real_duration_sample_source_must_not_be_staging_runtime_writer' : null,
  ].filter(Boolean)
}

function normalizeSampleRow(sample, {
  baselineId,
  projectId,
  request,
  collectionPackagePath,
  sampleMaterialPath,
  materialPayload,
}) {
  const metadata = readObject(sample.metadata)
  const sourceEvidence = readObject(materialPayload.sourceEvidence ?? materialPayload.source_evidence)
  const code = sampleStableCode(sample)
  return {
    id: text(sample.id),
    project_id: projectId,
    task_id: text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId),
    template_node_id: null,
    wbs_node_type: 'item_work',
    generation_depth: null,
    parent_template_node_id: null,
    parent_standard_work_code: null,
    standard_work_code: code,
    standard_work_name: text(sample.standard_work_name ?? sample.standardWorkName ?? sample.title ?? request?.title),
    engineering_category_id: null,
    planned_duration: readNumber(sample.planned_duration ?? sample.plannedDuration ?? request?.candidateReferenceDays ?? request?.candidate_reference_days),
    actual_duration: actualDuration(sample),
    started_at: text(sample.started_at ?? sample.startedAt),
    completed_at: text(sample.completed_at ?? sample.completedAt),
    source_type: 'completed_task',
    sample_strength: text(sample.sample_strength ?? sample.sampleStrength) || 'strong',
    sample_status: text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase() || 'accepted',
    confidence_level: text(sample.confidence_level ?? sample.confidenceLevel) || 'medium',
    confidence_score: readNumber(sample.confidence_score ?? sample.confidenceScore) || 70,
    included_in_benchmark: true,
    metadata: {
      ...metadata,
      source: 'operator_supplied_real_duration_sample_material',
      sourceEvidence,
      evidenceRef: text(sample.evidenceRef ?? sample.evidence_ref ?? metadata.evidenceRef ?? metadata.evidence_ref),
      baselineId,
      requestCandidateRowId: text(request?.candidateRowId ?? request?.candidate_row_id),
      businessType: text(request?.businessType ?? request?.business_type),
      businessTypes: uniqueText([
        request?.businessType,
        request?.business_type,
        ...(Array.isArray(request?.businessTypes) ? request.businessTypes : []),
        ...(Array.isArray(request?.business_types) ? request.business_types : []),
      ]),
      requestSources: uniqueText([
        request?.source,
        ...(Array.isArray(request?.requestSources) ? request.requestSources : []),
        ...(Array.isArray(request?.request_sources) ? request.request_sources : []),
      ]),
      durationAssetStableCode: text(request?.durationAssetStableCode ?? request?.duration_asset_stable_code),
      t2RhythmTemplateId: text(request?.t2RhythmTemplateId ?? request?.t2_rhythm_template_id),
      profileRuntimeReferenceStableCode: text(request?.profileRuntimeReferenceStableCode ?? request?.profile_runtime_reference_stable_code),
      stableCodeResolution: text(request?.stableCodeResolution ?? request?.stable_code_resolution),
      collectionPackageRef: `${repoRelative(collectionPackagePath)}`,
      sampleMaterialRef: `${repoRelative(sampleMaterialPath)}`,
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
    superseded_by: null,
    duration_calibration_source: 'operator_supplied_real_duration_sample_material',
    learning_scope: 'project',
    learning_scope_source: 'operator_verified_completed_task',
  }
}

function requestStableCode(request) {
  return text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
}

function sampleStableCode(sample) {
  return text(
    sample.standard_work_code
      ?? sample.standardWorkCode
      ?? sample.stable_code
      ?? sample.stableCode
      ?? sample.wbs_stable_code
      ?? sample.wbsStableCode,
  )
}

function actualDuration(sample) {
  return readNumber(sample.actual_duration ?? sample.actualDuration ?? sample.actual_duration_days ?? sample.actualDurationDays)
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}
async function fileRefOrMissing(filePath) {
  try {
    return `${repoRelative(filePath)}#sha256=${await sha256File(filePath)}`
  } catch (error) {
    if (error && error.code === 'ENOENT') return `${repoRelative(filePath)}#missing`
    throw error
  }
}

async function readOptionalJsonFile(filePath) {
  try {
    return { payload: JSON.parse(await readFile(filePath, 'utf8')), missing: false }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { payload: null, missing: true }
    throw error
  }
}


function hashText(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function reportPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.json')
  return `${outputPath}.report.json`
}

function markdownPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.md')
  return `${outputPath}.report.md`
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Real Duration Sample Source Export',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- exportedSampleCount: ${report.summary.exportedSampleCount}`,
    `- invalidSampleCount: ${report.summary.invalidSampleCount}`,
    `- missingStableCodeCount: ${report.summary.missingStableCodeCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false',
  ]
  if (report.invalidSamples.length > 0) {
    lines.push('', '## Invalid Samples', '', '| id | stableCode | blockers |', '|---|---|---|')
    for (const sample of report.invalidSamples) {
      lines.push(`| ${escapeTable(sample.id)} | ${escapeTable(sample.stableCode)} | ${escapeTable(sample.blockers.join(', '))} |`)
    }
  }
  return `${lines.join('\n')}\n`
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function readBoolean(value) {
  return value === true || text(value).toLowerCase() === 'true'
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--sample-material <real-duration-sample-material.json>]',
    '  [--output <duration-experience-samples-export.json>]',
    '  [--material-preflight <real-duration-sample-material-preflight.json>]',
    '  --environment <staging|production|live>',
    '  --exported-by <actor-id>',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      exportedSampleCount: report.summary.exportedSampleCount,
      invalidSampleCount: report.summary.invalidSampleCount,
      missingStableCodeCount: report.summary.missingStableCodeCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
