#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'
import {
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_PACKAGE = path.join(DEFAULT_OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_SAMPLES = path.join(DEFAULT_OUTPUT_ROOT, 'source-exports', 'duration-experience-samples-export.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'duration-sample-coverage-evidence.json')
const ACCEPTED_SOURCE_KINDS = ['operator_supplied_real_duration_sample_material']

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    samples: DEFAULT_SAMPLES,
    output: DEFAULT_OUTPUT,
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
    } else if (arg === '--samples') {
      options.samples = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function verifyDefaultMasterPlanDurationSampleCoverage({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  samples = DEFAULT_SAMPLES,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const collectionPackagePath = collectionPackage ? path.resolve(collectionPackage) : ''
  const samplesPath = samples ? path.resolve(samples) : ''
  const outputPath = path.resolve(output)
  const packagePayload = collectionPackagePath ? JSON.parse(await readFile(collectionPackagePath, 'utf8')) : {}
  const samplesPayload = samplesPath ? JSON.parse(await readFile(samplesPath, 'utf8')) : {}
  const baselineId = text(packagePayload.baselineId ?? packagePayload.baseline_id)
  const projectId = text(packagePayload.projectId ?? packagePayload.project_id)
  const sampleRequests = readSampleRequests(packagePayload)
  const rawSamples = readSamples(samplesPayload)
  const sourceEvidence = buildSourceEvidence(samplesPayload)
  const acceptedByCode = new Map()
  const invalidSamples = []

  for (const sample of rawSamples) {
    const code = stableCode(sample)
    const blockers = sampleBlockers(sample, { projectId })
    if (blockers.length > 0) {
      invalidSamples.push({
        id: text(sample.id),
        stableCode: code,
        title: text(sample.title ?? sample.task_title ?? sample.taskTitle),
        blockers,
      })
      continue
    }
    if (!acceptedByCode.has(code)) acceptedByCode.set(code, [])
    acceptedByCode.get(code).push(sample)
  }

  const rows = sampleRequests.map((request, index) => {
    const code = text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
    const requiredAcceptedSampleCount = Math.max(1, readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count))
    const acceptedSamples = acceptedByCode.get(code) ?? []
    const acceptedDurationDays = acceptedSamples.map(actualDuration).filter((value) => value > 0).sort((left, right) => left - right)
    const missingSampleCount = Math.max(0, requiredAcceptedSampleCount - acceptedSamples.length)
    const coverageStatus = code && missingSampleCount === 0 ? 'covered' : 'missing_samples'
    return {
      index: readNumber(request.index) || index + 1,
      source: text(request.source),
      candidateRowId: text(request.candidateRowId ?? request.candidate_row_id),
      stableCode: code,
      title: text(request.title),
      executionLane: text(request.executionLane ?? request.execution_lane),
      executionPhase: text(request.executionPhase ?? request.execution_phase),
      businessTypes: uniqueText([
        ...(Array.isArray(request.businessTypes) ? request.businessTypes : []),
        request.businessType,
        request.business_type,
      ]),
      requiredAcceptedSampleCount,
      acceptedSampleCount: acceptedSamples.length,
      acceptedSampleIds: acceptedSamples.map((sample) => text(sample.id)).filter(Boolean),
      acceptedDurationDays,
      coverageStatus,
      missingSampleCount,
      sampleCollectionRequirement: coverageStatus === 'covered'
        ? ''
        : text(request.collectionRequirement ?? request.collection_requirement)
          || `Collect at least ${missingSampleCount} accepted completed-task duration sample(s) for ${code || 'missing stable code'} (${text(request.title) || 'untitled sample request'}).`,
    }
  })

  const missingStableCodeCount = rows.filter((row) => row.coverageStatus !== 'covered').length
  const acceptedMatchedSampleIds = new Set(rows.flatMap((row) => row.acceptedSampleIds))
  const collectionPackageSourceBlockers = packageSourceBlockers(packagePayload)
  const sourceMetadataBlockers = samplesPath
    ? sourceExportMetadataBlockers(samplesPayload, 'duration_samples')
    : []
  const blockers = uniqueText([
    collectionPackagePath ? null : 'duration_sample_collection_package_required',
    samplesPath ? null : 'duration_samples_export_required',
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    sampleRequests.length > 0 || text(packagePayload.status) === 'covered' ? null : 'sample_requests_required',
    ...collectionPackageSourceBlockers,
    ...sourceMetadataBlockers,
    ...sourceKindBlockers(sourceEvidence),
    invalidSamples.length === 0 ? null : 'invalid_duration_samples_present',
    missingStableCodeCount === 0 ? null : 'accepted_real_duration_sample_coverage_incomplete',
  ])
  const status = blockers.length === 0 ? 'covered' : 'blocked'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    generatedAt: now.toISOString(),
    source: 'verify-default-master-plan-duration-sample-coverage',
    status,
    evidenceLevel: status === 'covered' ? 'sample_collection_coverage_verified_l2' : 'sample_collection_coverage_blocked_l1',
    productionReady: false,
    baselineId,
    projectId,
    collectionPackageRef: collectionPackagePath ? `duration_sample_collection_package:${repoRelative(collectionPackagePath)}#sha256=${await sha256File(collectionPackagePath)}` : 'duration_sample_collection_package:missing',
    sourceEvidenceRef: samplesPath ? `duration_experience_samples_export:${repoRelative(samplesPath)}#sha256=${await sha256File(samplesPath)}` : 'duration_experience_samples_export:missing',
    sourceEvidence,
    summary: {
      requiredStableCodeCount: rows.length,
      totalRequiredAcceptedSampleCount: rows.reduce((sum, row) => sum + row.requiredAcceptedSampleCount, 0),
      rawSampleCount: rawSamples.length,
      acceptedMatchedSampleCount: acceptedMatchedSampleIds.size,
      coveredStableCodeCount: rows.filter((row) => row.coverageStatus === 'covered').length,
      missingStableCodeCount,
      invalidSampleCount: invalidSamples.length,
    },
    rows,
    invalidSamples,
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
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

function buildSourceEvidence(payload) {
  const metadata = readObject(payload?.export_metadata ?? payload?.exportMetadata ?? readObject(payload?.metadata).export)
  return {
    source: text(metadata.source),
    sourceKind: text(metadata.source_kind ?? metadata.sourceKind),
    environment: text(metadata.environment ?? metadata.source_environment ?? metadata.sourceEnvironment),
    acceptedSourceKinds: ACCEPTED_SOURCE_KINDS,
  }
}

function sourceKindBlockers(sourceEvidence) {
  const sourceKind = text(sourceEvidence.sourceKind)
  if (ACCEPTED_SOURCE_KINDS.includes(sourceKind)) return []
  return ['duration_samples_operator_supplied_real_duration_sample_export_required']
}

function sampleBlockers(sample, { projectId }) {
  const status = text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase()
  const includedInBenchmark = readBoolean(sample.included_in_benchmark ?? sample.includedInBenchmark)
  const sourceTable = text(sample.source_table ?? sample.sourceTable)
  const sourceType = text(sample.source_type ?? sample.sourceType)
  const sampleProjectId = text(sample.project_id ?? sample.projectId)
  const taskId = text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId)
  const metadata = readObject(sample.metadata)
  const metadataSource = text(metadata.source ?? metadata.source_type ?? metadata.sourceType)
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
    stableCode(sample) ? null : 'stable_code_required',
    ['active', 'accepted'].includes(status) ? null : 'sample_status_must_be_active_or_accepted',
    includedInBenchmark ? null : 'included_in_benchmark_required',
    actualDuration(sample) > 0 ? null : 'actual_duration_days_required',
    projectId && sampleProjectId === projectId ? null : 'duration_sample_project_id_mismatch',
    taskId ? null : 'duration_sample_task_identity_required',
    !sourceTable || sourceTable === 'duration_experience_samples' ? null : 'duration_sample_source_table_must_be_duration_experience_samples',
    !sourceType || sourceType === 'completed_task' ? null : 'duration_sample_source_type_must_be_completed_task',
    stagingControlledReplay ? 'real_duration_sample_must_not_be_staging_controlled_replay' : null,
    notRealProductionOutcome ? 'real_duration_sample_must_not_be_marked_not_real_production_outcome' : null,
    metadataSource === 'default_master_plan_staging_runtime_writer' ? 'real_duration_sample_source_must_not_be_staging_runtime_writer' : null,
  ].filter(Boolean)
}

function packageSourceBlockers(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const sampleRequests = readSampleRequests(payload)
  const sourceBlockers = defaultMasterPlanSourceBlockers([
    ...defaultMasterPlanStructuredSourceSignals(payload),
    ...sampleRequests.flatMap((row) => defaultMasterPlanStructuredSourceSignals(row)),
  ]).blockers.map((blocker) => `duration_sample_collection_package_${blocker}`)
  const packageBlockers = (Array.isArray(payload.blockers) ? payload.blockers : [])
    .map(text)
    .filter(Boolean)
    .filter((blocker) => !isDurationSampleCoverageClosableBlocker(blocker))
    .map((blocker) => `duration_sample_collection_package_${blocker}`)
  return uniqueText([
    ...sourceBlockers,
    ...packageBlockers,
  ])
}

function isDurationSampleCoverageClosableBlocker(blocker) {
  return [
    'accepted_real_duration_samples_required',
    'accepted_real_duration_sample_coverage_incomplete',
    'runtime_reference_days_missing_for_some_rows',
    'duration_asset_utilization_report_runtime_reference_days_missing_for_some_rows',
  ].includes(text(blocker))
}

function stableCode(sample) {
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
  return readNumber(
    sample.actual_duration
      ?? sample.actualDuration
      ?? sample.actual_duration_days
      ?? sample.actualDurationDays,
  )
}

async function sha256File(filePath) {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Duration Sample Coverage Evidence',
    '',
    `- status: ${report.status}`,
    `- evidenceLevel: ${report.evidenceLevel}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- sourceKind: ${report.sourceEvidence.sourceKind || 'missing'}`,
    `- acceptedSourceKinds: ${report.sourceEvidence.acceptedSourceKinds.join(', ')}`,
    `- requiredStableCodeCount: ${report.summary.requiredStableCodeCount}`,
    `- coveredStableCodeCount: ${report.summary.coveredStableCodeCount}`,
    `- missingStableCodeCount: ${report.summary.missingStableCodeCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false`,
    '',
    '| # | stableCode | title | required | accepted | missing | status | requirement |',
    '|---:|---|---|---:|---:|---:|---|---|',
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.index} | ${escapeTable(row.stableCode)} | ${escapeTable(row.title)} | ${row.requiredAcceptedSampleCount} | ${row.acceptedSampleCount} | ${row.missingSampleCount} | ${row.coverageStatus} | ${escapeTable(row.sampleCollectionRequirement)} |`)
  }
  if (report.rows.length === 0) lines.push('| 0 | none | none | 0 | 0 | 0 | covered | none |')
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
    'Usage: node project-testing/tools/verify-default-master-plan-duration-sample-coverage.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--samples <duration-experience-samples-export.json>]',
    '  [--output <duration-sample-coverage-evidence.json>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await verifyDefaultMasterPlanDurationSampleCoverage(options)
    console.log(JSON.stringify({
      status: report.status,
      evidenceLevel: report.evidenceLevel,
      baselineId: report.baselineId,
      projectId: report.projectId,
      requiredStableCodeCount: report.summary.requiredStableCodeCount,
      coveredStableCodeCount: report.summary.coveredStableCodeCount,
      missingStableCodeCount: report.summary.missingStableCodeCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
