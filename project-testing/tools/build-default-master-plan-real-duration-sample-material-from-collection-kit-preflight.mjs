#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_PACKAGE = path.join(OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_COLLECTION_KIT_PREFLIGHT = path.join(OUTPUT_ROOT, 'real-duration-sample-collection-kit-preflight.json')
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'real-duration-sample-material.json')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|placeholder/i

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    collectionKitPreflight: DEFAULT_COLLECTION_KIT_PREFLIGHT,
    output: DEFAULT_OUTPUT,
    preparedBy: '',
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
    else if (arg === '--collection-kit-preflight') options.collectionKitPreflight = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--prepared-by') options.preparedBy = nextValue()
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  collectionKitPreflight = DEFAULT_COLLECTION_KIT_PREFLIGHT,
  output = DEFAULT_OUTPUT,
  preparedBy = '',
  now = new Date(),
} = {}) {
  const collectionPackagePath = path.resolve(collectionPackage)
  const collectionKitPreflightPath = path.resolve(collectionKitPreflight)
  const outputPath = path.resolve(output)
  const collectionPayload = JSON.parse(await readFile(collectionPackagePath, 'utf8'))
  const preflightPayload = JSON.parse(await readFile(collectionKitPreflightPath, 'utf8'))
  const collectionBaselineId = text(collectionPayload.baselineId ?? collectionPayload.baseline_id)
  const collectionProjectId = text(collectionPayload.projectId ?? collectionPayload.project_id)
  const preflightBaselineId = text(preflightPayload.baselineId ?? preflightPayload.baseline_id)
  const preflightProjectId = text(preflightPayload.projectId ?? preflightPayload.project_id)
  const baselineId = collectionBaselineId || preflightBaselineId
  const projectId = collectionProjectId || preflightProjectId
  const sampleRequests = readSampleRequests(collectionPayload)
  const requestedStableCodes = new Set(sampleRequests.map(requestStableCode).filter(Boolean))
  const candidates = readMaterialSampleCandidates(preflightPayload)
  const candidateRows = candidates.map((candidate) => normalizeCandidate(candidate, { baselineId, projectId, requestedStableCodes }))
  const validRows = candidateRows.filter((row) => row.blockers.length === 0)
  const invalidRows = candidateRows.filter((row) => row.blockers.length > 0)
  const summary = readObject(preflightPayload.summary)
  const mutationBoundary = readObject(preflightPayload.mutationBoundary ?? preflightPayload.mutation_boundary)
  const preflightBlockers = arrayOfText(preflightPayload.blockers)
  const boundaryBlockers = buildPreflightBoundaryBlockers(preflightPayload, mutationBoundary)
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    text(preparedBy) && !PLACEHOLDER_PATTERN.test(text(preparedBy)) ? null : 'prepared_by_required',
    sampleRequests.length > 0 ? null : 'sample_requests_required',
    collectionBaselineId && preflightBaselineId && collectionBaselineId === preflightBaselineId ? null : collectionBaselineId && preflightBaselineId ? 'baseline_id_mismatch' : null,
    collectionProjectId && preflightProjectId && collectionProjectId === preflightProjectId ? null : collectionProjectId && preflightProjectId ? 'project_id_mismatch' : null,
    text(preflightPayload.status) === 'ready_for_real_duration_sample_material_build' ? null : 'collection_kit_preflight_not_ready',
    readBoolean(preflightPayload.productionReady ?? preflightPayload.production_ready) ? 'collection_kit_preflight_must_not_be_production_ready' : null,
    ...preflightBlockers,
    ...boundaryBlockers,
    candidates.length > 0 ? null : 'material_sample_candidates_required',
    invalidRows.length > 0 ? 'invalid_material_sample_candidates_present' : null,
    readNumber(summary.readyRowCount ?? summary.ready_row_count) === candidates.length ? null : 'collection_kit_preflight_ready_row_count_mismatch',
  ])
  const status = blockers.length === 0 ? 'material_ready' : 'blocked'
  const samples = status === 'material_ready' ? validRows.map(toMaterialSample) : []
  const wroteMaterialFile = status === 'material_ready'
  const existingMaterialFilePresent = await fileExists(outputPath)
  const existingMaterialSummary = existingMaterialFilePresent ? await summarizeExistingMaterialFile(outputPath) : emptyMaterialSummary(false)
  const collectionPackageRef = `duration_sample_collection_package:${repoRelative(collectionPackagePath)}#sha256=${await sha256File(collectionPackagePath)}`
  const collectionKitPreflightRef = `real_duration_sample_collection_kit_preflight:${repoRelative(collectionKitPreflightPath)}#sha256=${await sha256File(collectionKitPreflightPath)}`
  const collectionKitRef = text(preflightPayload.collectionKitRef ?? preflightPayload.collection_kit_ref)
  const checkedBy = text(preflightPayload.checkedBy ?? preflightPayload.checked_by)
  const material = {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight',
    materialTemplate: false,
    templateStatus: 'operator_supplied_real_duration_sample_material',
    baselineId,
    projectId,
    preparedBy: text(preparedBy),
    collectionPackageRef,
    collectionKitPreflightRef,
    sourceEvidence: {
      sourceName: 'real_duration_sample_collection_kit_preflight',
      evidenceRef: collectionKitRef || collectionKitPreflightRef,
      operatorReviewRef: checkedBy ? `collection_kit_preflight_checked_by:${checkedBy}` : '',
    },
    samples,
  }
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-from-collection-kit-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight',
    status,
    productionReady: false,
    baselineId,
    projectId,
    materialRef: `real_duration_sample_material:${repoRelative(outputPath)}`,
    materialWrite: {
      policy: wroteMaterialFile ? 'write_material_file_when_material_ready' : 'preserve_existing_material_file_when_build_blocked',
      wroteMaterialFile,
      preservedExistingMaterialFile: !wroteMaterialFile && existingMaterialFilePresent,
      skippedMaterialWriteBecause: wroteMaterialFile ? '' : 'material_build_blocked',
      existingMaterialSummary,
    },
    collectionPackageRef,
    collectionKitPreflightRef,
    summary: {
      requiredStableCodeCount: sampleRequests.length,
      sourceCandidateCount: candidates.length,
      exportedSampleCount: samples.length,
      invalidCandidateCount: invalidRows.length,
      readyRowCount: readNumber(summary.readyRowCount ?? summary.ready_row_count),
      invalidRowCount: readNumber(summary.invalidRowCount ?? summary.invalid_row_count),
      businessTypeGroupCount: readNumber(summary.businessTypeGroupCount ?? summary.business_type_group_count),
    },
    invalidCandidates: invalidRows.map((row) => ({
      id: row.id,
      stableCode: row.stableCode,
      title: row.title,
      blockers: row.blockers,
    })),
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsRealDurationSampleCollectionKitPreflight: true,
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
  if (wroteMaterialFile) {
    await writeFile(outputPath, `${JSON.stringify(material, null, 2)}\n`, 'utf8')
  }
  await writeFile(reportPathFor(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function normalizeCandidate(candidate, { baselineId, projectId, requestedStableCodes }) {
  const record = readObject(candidate)
  const metadata = readObject(record.metadata)
  const stableCode = text(record.stableCode ?? record.stable_code ?? record.standardWorkCode ?? record.standard_work_code)
  const id = text(record.id)
  const title = text(record.title ?? record.name)
  const taskId = text(record.taskId ?? record.task_id ?? record.runtimeTaskId ?? record.runtime_task_id)
  const sampleProjectId = text(record.projectId ?? record.project_id) || projectId
  const status = text(record.sampleStatus ?? record.sample_status ?? record.status).toLowerCase()
  const actualDurationDays = readNumber(record.actualDurationDays ?? record.actual_duration_days ?? record.actualDuration ?? record.actual_duration)
  const startedAt = text(record.startedAt ?? record.started_at)
  const completedAt = text(record.completedAt ?? record.completed_at)
  const sourceType = text(record.sourceType ?? record.source_type)
  const evidenceRef = text(record.evidenceRef ?? record.evidence_ref ?? metadata.evidenceRef ?? metadata.evidence_ref)
  const operatorReviewRef = text(record.operatorReviewRef ?? record.operator_review_ref ?? metadata.operatorReviewRef ?? metadata.operator_review_ref)
  const blockers = uniqueText([
    id && !PLACEHOLDER_PATTERN.test(id) ? null : 'material_sample_candidate_id_required',
    stableCode ? null : 'stable_code_required',
    stableCode && requestedStableCodes.has(stableCode) ? null : 'stable_code_not_requested_by_collection_package',
    title ? null : 'title_required',
    taskId && !PLACEHOLDER_PATTERN.test(taskId) ? null : 'task_id_required',
    actualDurationDays > 0 ? null : 'actual_duration_days_required',
    validIsoDate(startedAt) ? null : 'started_at_required',
    validIsoDate(completedAt) ? null : 'completed_at_required',
    validIsoDate(startedAt) && validIsoDate(completedAt) && startedAt <= completedAt ? null : 'completed_at_must_not_precede_started_at',
    projectId && sampleProjectId === projectId ? null : 'project_id_mismatch',
    !sourceType || sourceType === 'completed_task' ? null : 'source_type_must_be_completed_task',
    ['accepted', 'active'].includes(status) ? null : 'sample_status_must_be_accepted_or_active',
    readBoolean(record.includedInBenchmark ?? record.included_in_benchmark) ? null : 'included_in_benchmark_required',
    evidenceRef && !PLACEHOLDER_PATTERN.test(evidenceRef) ? null : 'evidence_ref_required',
    operatorReviewRef && !PLACEHOLDER_PATTERN.test(operatorReviewRef) ? null : 'operator_review_ref_required',
  ])
  return {
    id,
    stableCode,
    title,
    businessType: text(record.businessType ?? record.business_type ?? metadata.businessType ?? metadata.business_type),
    projectId: sampleProjectId,
    taskId,
    actualDurationDays,
    startedAt,
    completedAt,
    sourceType: sourceType || 'completed_task',
    sampleStatus: status || 'accepted',
    includedInBenchmark: readBoolean(record.includedInBenchmark ?? record.included_in_benchmark),
    evidenceRef,
    operatorReviewRef,
    sourceEvidence: readObject(record.sourceEvidence ?? record.source_evidence),
    metadata,
    baselineId,
    blockers,
  }
}

function toMaterialSample(row) {
  return {
    id: row.id,
    stableCode: row.stableCode,
    title: row.title,
    businessType: row.businessType,
    projectId: row.projectId,
    taskId: row.taskId,
    actualDurationDays: row.actualDurationDays,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    sourceType: 'completed_task',
    sampleStatus: 'accepted',
    includedInBenchmark: true,
    evidenceRef: row.evidenceRef,
    operatorReviewRef: row.operatorReviewRef,
    sourceEvidence: row.sourceEvidence,
    metadata: {
      ...row.metadata,
      collectionKitPreflight: true,
      materialTemplate: false,
      templatePlaceholder: false,
      baselineId: row.baselineId,
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
  }
}

function buildPreflightBoundaryBlockers(payload, mutationBoundary) {
  return uniqueText([
    mutationBoundary.writesProductionTables === false ? null : 'collection_kit_preflight_production_write_boundary_missing',
    mutationBoundary.writesTasks === false ? null : 'collection_kit_preflight_task_write_boundary_missing',
    mutationBoundary.writesTaskDependencies === false ? null : 'collection_kit_preflight_task_dependency_write_boundary_missing',
    mutationBoundary.writesDurationSamples === false ? null : 'collection_kit_preflight_duration_sample_write_boundary_missing',
    mutationBoundary.writesRuntimePublication === false ? null : 'collection_kit_preflight_runtime_publication_boundary_missing',
    mutationBoundary.invokesRuntimeWriters === false ? null : 'collection_kit_preflight_runtime_writer_boundary_missing',
    mutationBoundary.performsRollback === false ? null : 'collection_kit_preflight_rollback_boundary_missing',
    readBoolean(payload.productionReady ?? payload.production_ready) ? 'collection_kit_preflight_must_not_be_production_ready' : null,
  ])
}

async function summarizeExistingMaterialFile(filePath) {
  const payload = JSON.parse(await readFile(filePath, 'utf8'))
  const samples = readMaterialSamples(payload)
  return {
    ...emptyMaterialSummary(true),
    source: text(payload.source),
    sampleCount: samples.length,
    stableCodes: uniqueText(samples.map(sampleStableCode)).slice(0, 10),
  }
}

function emptyMaterialSummary(present) {
  return {
    present,
    source: '',
    sampleCount: 0,
    stableCodes: [],
  }
}

function readMaterialSamples(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.samples)) return payload.samples
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.duration_experience_samples)) return payload.duration_experience_samples
  return []
}

function sampleStableCode(sample) {
  return text(sample.stableCode ?? sample.stable_code ?? sample.standardWorkCode ?? sample.standard_work_code ?? sample.wbsStableCode ?? sample.wbs_stable_code)
}

function readMaterialSampleCandidates(payload) {
  if (Array.isArray(payload?.materialSampleCandidates)) return payload.materialSampleCandidates
  if (Array.isArray(payload?.material_sample_candidates)) return payload.material_sample_candidates
  if (Array.isArray(payload?.samples)) return payload.samples
  return []
}

function readSampleRequests(payload) {
  if (Array.isArray(payload?.sampleRequests)) return payload.sampleRequests
  if (Array.isArray(payload?.sample_requests)) return payload.sample_requests
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function requestStableCode(request) {
  return text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function reportPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.report.json') : `${outputPath}.report.json`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.report.md') : `${outputPath}.report.md`
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Real Duration Sample Material From Collection Kit Preflight',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- exportedSampleCount: ${report.summary.exportedSampleCount}`,
    `- invalidCandidateCount: ${report.summary.invalidCandidateCount}`,
    `- materialWritePolicy: ${report.materialWrite.policy}`,
    `- wroteMaterialFile: ${report.materialWrite.wroteMaterialFile}`,
    `- preservedExistingMaterialFile: ${report.materialWrite.preservedExistingMaterialFile}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false, invokesRuntimeWriters=false, performsRollback=false',
  ]
  if (report.invalidCandidates.length > 0) {
    lines.push('', '## Invalid Candidates', '', '| id | stableCode | blockers |', '|---|---|---|')
    for (const row of report.invalidCandidates) {
      lines.push(`| ${escapeTable(row.id)} | ${escapeTable(row.stableCode)} | ${escapeTable(row.blockers.join(', '))} |`)
    }
  }
  return `${lines.join('\n')}\n`
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value))
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function arrayOfText(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
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
    'Usage: node project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--collection-kit-preflight <real-duration-sample-collection-kit-preflight.json>]',
    '  [--output <real-duration-sample-material.json>]',
    '  --prepared-by <actor-id>',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      exportedSampleCount: report.summary.exportedSampleCount,
      invalidCandidateCount: report.summary.invalidCandidateCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
