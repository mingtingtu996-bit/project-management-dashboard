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
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'real-duration-sample-material-preflight.json')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|placeholder/i

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    sampleMaterial: DEFAULT_SAMPLE_MATERIAL,
    output: DEFAULT_OUTPUT,
    checkedBy: '',
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
    if (arg === '--collection-package') options.collectionPackage = path.resolve(nextValue())
    else if (arg === '--sample-material') options.sampleMaterial = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--checked-by') options.checkedBy = nextValue()
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  sampleMaterial = DEFAULT_SAMPLE_MATERIAL,
  output = DEFAULT_OUTPUT,
  checkedBy = '',
  now = new Date(),
} = {}) {
  const collectionPackagePath = path.resolve(collectionPackage)
  const sampleMaterialPath = path.resolve(sampleMaterial)
  const outputPath = path.resolve(output)
  const collectionPayload = JSON.parse(await readFile(collectionPackagePath, 'utf8'))
  const materialRead = await readOptionalJsonFile(sampleMaterialPath)
  const materialPayload = materialRead.payload
  const baselineId = text(collectionPayload.baselineId ?? collectionPayload.baseline_id)
  const projectId = text(collectionPayload.projectId ?? collectionPayload.project_id)
  const sampleRequests = readSampleRequests(collectionPayload)
  const requestedStableCodes = new Set(sampleRequests.map(requestStableCode).filter(Boolean))
  const rawSamples = readSamples(materialPayload)
  const materialTemplate = isTemplateMaterial(materialPayload)
  const materialSourceEvidencePlaceholderFindings = sourceEvidencePlaceholderFindings(materialPayload)
  const readySamples = []
  const invalidSamples = []

  for (const sample of rawSamples) {
    const blockers = sampleBlockers(sample, { projectId, requestedStableCodes, materialTemplate })
    const summary = {
      id: text(sample.id),
      stableCode: sampleStableCode(sample),
      title: text(sample.title ?? sample.standard_work_name ?? sample.standardWorkName),
      blockers,
    }
    if (blockers.length > 0) invalidSamples.push(summary)
    else readySamples.push(summary)
  }

  const readyByStableCode = new Map()
  for (const sample of readySamples) {
    if (!readyByStableCode.has(sample.stableCode)) readyByStableCode.set(sample.stableCode, [])
    readyByStableCode.get(sample.stableCode).push(sample)
  }
  const rows = sampleRequests.map((request, index) => {
    const stableCode = requestStableCode(request)
    const requiredAcceptedSampleCount = Math.max(1, readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count))
    const ready = readyByStableCode.get(stableCode) ?? []
    const missingSampleCount = Math.max(0, requiredAcceptedSampleCount - ready.length)
    return {
      index: index + 1,
      stableCode,
      title: text(request.title),
      executionLane: text(request.executionLane ?? request.execution_lane),
      executionPhase: text(request.executionPhase ?? request.execution_phase),
      requiredAcceptedSampleCount,
      readySampleCount: ready.length,
      readySampleIds: ready.map((sample) => sample.id).filter(Boolean),
      missingSampleCount,
      coverageStatus: missingSampleCount === 0 ? 'ready' : 'missing_samples',
    }
  })
  const readyStableCodeCount = rows.filter((row) => row.coverageStatus === 'ready').length
  const missingStableCodes = rows.filter((row) => row.coverageStatus !== 'ready').map((row) => row.stableCode).filter(Boolean)
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    text(checkedBy) ? null : 'checked_by_required',
    sampleRequests.length > 0 ? null : 'sample_requests_required',
    rawSamples.length > 0 ? null : 'real_duration_sample_material_required',
    materialRead.missing ? 'real_duration_sample_material_file_missing' : null,
    materialSourceEvidencePlaceholderFindings.length > 0 ? 'material_source_evidence_placeholders_present' : null,
    materialTemplate ? 'real_duration_sample_material_template_must_be_filled' : null,
    invalidSamples.length > 0 ? 'invalid_real_duration_sample_material_present' : null,
    missingStableCodes.length > 0 ? 'accepted_real_duration_sample_material_coverage_incomplete' : null,
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-real-duration-sample-material-preflight',
    status: blockers.length === 0 ? 'ready_for_source_export' : 'blocked',
    productionReady: false,
    baselineId,
    projectId,
    checkedBy: text(checkedBy),
    collectionPackageRef: `duration_sample_collection_package:${repoRelative(collectionPackagePath)}#sha256=${await sha256File(collectionPackagePath)}`,
    sampleMaterialRef: materialRead.missing ? `real_duration_sample_material:${repoRelative(sampleMaterialPath)}#missing` : `real_duration_sample_material:${repoRelative(sampleMaterialPath)}#sha256=${await sha256File(sampleMaterialPath)}`,
    materialSourceEvidencePlaceholderFindings,
    summary: {
      requiredStableCodeCount: rows.length,
      readyStableCodeCount,
      missingStableCodeCount: missingStableCodes.length,
      rawSampleCount: rawSamples.length,
      readySampleCount: readySamples.length,
      invalidSampleCount: invalidSamples.length,
      missingStableCodes,
    },
    rows,
    invalidSamples,
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsRealDurationSampleMaterial: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function sampleBlockers(sample, { projectId, requestedStableCodes, materialTemplate }) {
  const metadata = readObject(sample.metadata)
  const code = sampleStableCode(sample)
  const status = text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase()
  const taskId = text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId)
  const evidenceRef = text(sample.evidenceRef ?? sample.evidence_ref ?? metadata.evidenceRef ?? metadata.evidence_ref)
  const sourceType = text(sample.source_type ?? sample.sourceType)
  const metadataSource = text(metadata.source ?? metadata.source_type ?? metadata.sourceType)
  const templateMarker = materialTemplate || readBoolean(sample.materialTemplate ?? sample.material_template ?? sample.templatePlaceholder ?? sample.template_placeholder ?? metadata.materialTemplate ?? metadata.material_template ?? metadata.templatePlaceholder ?? metadata.template_placeholder)
  const stagingControlledReplay = readBoolean(sample.stagingControlledReplay ?? sample.staging_controlled_replay ?? metadata.stagingControlledReplay ?? metadata.staging_controlled_replay)
  const notRealProductionOutcome = readBoolean(sample.notRealProductionOutcome ?? sample.not_real_production_outcome ?? metadata.notRealProductionOutcome ?? metadata.not_real_production_outcome)
  return uniqueText([
    code ? null : 'stable_code_required',
    code && requestedStableCodes.has(code) ? null : 'stable_code_not_requested_by_collection_package',
    text(sample.id) && !PLACEHOLDER_PATTERN.test(text(sample.id)) ? null : 'real_duration_sample_id_required',
    ['active', 'accepted'].includes(status) ? null : 'sample_status_must_be_active_or_accepted',
    readBoolean(sample.included_in_benchmark ?? sample.includedInBenchmark) ? null : 'included_in_benchmark_required',
    actualDuration(sample) > 0 ? null : 'actual_duration_days_required',
    projectId && text(sample.project_id ?? sample.projectId) === projectId ? null : 'duration_sample_project_id_mismatch',
    taskId && !PLACEHOLDER_PATTERN.test(taskId) ? null : 'duration_sample_task_identity_required',
    !sourceType || sourceType === 'completed_task' ? null : 'duration_sample_source_type_must_be_completed_task',
    evidenceRef && !PLACEHOLDER_PATTERN.test(evidenceRef) ? null : 'real_duration_sample_evidence_ref_required',
    templateMarker ? 'real_duration_sample_template_material_must_be_filled_before_export' : null,
    stagingControlledReplay ? 'real_duration_sample_must_not_be_staging_controlled_replay' : null,
    notRealProductionOutcome ? 'real_duration_sample_must_not_be_marked_not_real_production_outcome' : null,
    metadataSource === 'default_master_plan_staging_runtime_writer' ? 'real_duration_sample_source_must_not_be_staging_runtime_writer' : null,
  ])
}

function sourceEvidencePlaceholderFindings(payload) {
  const sourceEvidence = readObject(payload?.sourceEvidence ?? payload?.source_evidence)
  const findings = []
  for (const [field, value] of Object.entries(sourceEvidence)) {
    const normalized = text(value)
    if (normalized && PLACEHOLDER_PATTERN.test(normalized)) findings.push({ field, value: normalized })
  }
  return findings
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

function requestStableCode(request) {
  return text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
}

function sampleStableCode(sample) {
  return text(sample.standard_work_code ?? sample.standardWorkCode ?? sample.stable_code ?? sample.stableCode ?? sample.wbs_stable_code ?? sample.wbsStableCode)
}

function actualDuration(sample) {
  return readNumber(sample.actual_duration ?? sample.actualDuration ?? sample.actual_duration_days ?? sample.actualDurationDays)
}

function isTemplateMaterial(payload) {
  return readBoolean(payload?.materialTemplate ?? payload?.material_template)
    || text(payload?.templateStatus ?? payload?.template_status) === 'operator_input_required'
    || text(payload?.source) === 'build-default-master-plan-real-duration-sample-material-template'
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function readOptionalJsonFile(filePath) {
  try {
    return { payload: JSON.parse(await readFile(filePath, 'utf8')), missing: false }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { payload: {}, missing: true }
    throw error
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Real Duration Sample Material Preflight',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- requiredStableCodeCount: ${report.summary.requiredStableCodeCount}`,
    `- readyStableCodeCount: ${report.summary.readyStableCodeCount}`,
    `- invalidSampleCount: ${report.summary.invalidSampleCount}`,
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

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
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
    'Usage: node project-testing/tools/check-default-master-plan-real-duration-sample-material-preflight.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--sample-material <real-duration-sample-material.json>]',
    '  [--output <real-duration-sample-material-preflight.json>]',
    '  --checked-by <actor-id>',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      requiredStableCodeCount: report.summary.requiredStableCodeCount,
      readyStableCodeCount: report.summary.readyStableCodeCount,
      invalidSampleCount: report.summary.invalidSampleCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
