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
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-production-readiness',
  'duration-sample-gap-plan.json',
)

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateBaseline: '',
    candidateRefreshPackage: '',
    samples: '',
    output: DEFAULT_OUTPUT,
    minSamplesPerStableCode: 1,
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

    if (arg === '--candidate-baseline') {
      options.candidateBaseline = path.resolve(nextValue())
    } else if (arg === '--candidate-refresh-package') {
      options.candidateRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--samples') {
      options.samples = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--min-samples-per-stable-code') {
      options.minSamplesPerStableCode = Math.max(1, Number.parseInt(nextValue(), 10) || 1)
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function planDefaultMasterPlanDurationSampleGaps({
  candidateBaseline,
  candidateRefreshPackage,
  samples,
  output = DEFAULT_OUTPUT,
  minSamplesPerStableCode = 1,
  now = new Date(),
} = {}) {
  const baselinePath = candidateBaseline ? path.resolve(candidateBaseline) : ''
  const refreshPackagePath = candidateRefreshPackage ? path.resolve(candidateRefreshPackage) : ''
  const samplesPath = samples ? path.resolve(samples) : ''
  const outputPath = path.resolve(output)
  const generatedAt = now.toISOString()
  const rootBlockers = [
    baselinePath ? null : 'candidate_baseline_export_required',
    samplesPath ? null : 'duration_samples_export_required',
  ].filter(Boolean)

  const baselinePayload = baselinePath ? JSON.parse(await readFile(baselinePath, 'utf8')) : {}
  const refreshPackagePayload = refreshPackagePath ? JSON.parse(await readFile(refreshPackagePath, 'utf8')) : {}
  const samplePayload = samplesPath ? JSON.parse(await readFile(samplesPath, 'utf8')) : {}
  const targetRows = readRefreshPackageTargetRows(refreshPackagePayload)
  const baselineId = text(refreshPackagePayload.baselineId ?? refreshPackagePayload.baseline_id ?? baselinePayload.baselineId ?? baselinePayload.baseline_id)
  const projectId = text(refreshPackagePayload.projectId ?? refreshPackagePayload.project_id ?? baselinePayload.projectId ?? baselinePayload.project_id)
  const candidateRows = targetRows.length > 0 ? targetRows : readCandidateRows(baselinePayload)
  const gapPlanningSurface = targetRows.length > 0
    ? 'candidate_refresh_package_target_replacement_rows'
    : 'candidate_baseline_export_rows'
  const rawSamples = readSamples(samplePayload)
  const candidateBaselineSourceBlockers = candidateBaselineDefaultMasterPlanSourceBlockers(baselinePayload)
  const sourceMetadataBlockers = samplesPath
    ? sourceExportMetadataBlockers(samplePayload, 'duration_samples')
    : []
  const invalidSamples = []
  const acceptedByCode = new Map()

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

  const minSamples = Math.max(1, Number(minSamplesPerStableCode) || 1)
  const rows = candidateRows.map((row) => {
    const code = text(row.standardWorkCode ?? row.standard_work_code ?? row.stableCode ?? row.stable_code)
    const acceptedSamples = acceptedByCode.get(code) ?? []
    const acceptedDurations = acceptedSamples.map(actualDuration).filter((value) => value > 0).sort((left, right) => left - right)
    const missingSampleCount = Math.max(0, minSamples - acceptedSamples.length)
    const coverageStatus = code && missingSampleCount === 0 ? 'covered' : 'missing_samples'
    return {
      index: readNumber(row.index),
      id: text(row.id),
      title: text(row.title),
      stableCode: code,
      executionLane: text(row.executionLane ?? row.execution_lane),
      executionPhase: text(row.executionPhase ?? row.execution_phase),
      scheduleParticipation: text(row.scheduleParticipation ?? row.schedule_participation),
      candidateReferenceDays: readNumber(row.smartReferenceDays ?? row.smart_reference_days ?? row.referenceDays ?? row.reference_days),
      requiredAcceptedSampleCount: minSamples,
      acceptedSampleCount: acceptedSamples.length,
      acceptedSampleIds: acceptedSamples.map((sample) => text(sample.id)).filter(Boolean),
      acceptedDurationDays: acceptedDurations,
      acceptedP50Days: median(acceptedDurations),
      coverageStatus,
      missingSampleCount,
      sampleCollectionRequirement: coverageStatus === 'covered'
        ? ''
        : `Collect at least ${missingSampleCount} accepted completed-task duration sample(s) for ${code || 'missing stable code'} (${text(row.title) || 'untitled candidate row'}).`,
    }
  })

  const missingStableCodeCount = rows.filter((row) => row.coverageStatus !== 'covered').length
  const blockers = [
    ...rootBlockers,
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    candidateRows.length > 0 ? null : 'candidate_rows_required',
    ...candidateBaselineSourceBlockers,
    ...sourceMetadataBlockers,
    missingStableCodeCount === 0 ? null : 'duration_sample_coverage_incomplete',
  ].filter(Boolean)
  const acceptedMatchedSampleIds = new Set(rows.flatMap((row) => row.acceptedSampleIds))
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-gap-plan/v1',
    generatedAt,
    source: 'plan-default-master-plan-duration-sample-gaps',
    status: blockers.length === 0 ? 'ready_for_duration_calibration_evidence' : 'blocked',
    evidenceLevel: 'sample_gap_planning_only',
    productionReady: false,
    baselineId,
    projectId,
    sourceVersionLabel: text(baselinePayload.sourceVersionLabel ?? baselinePayload.source_version_label),
    candidateBaselineRef: baselinePath ? `candidate_baseline_export:${repoRelative(baselinePath)}#sha256=${await sha256File(baselinePath)}` : 'candidate_baseline_export:missing',
    candidateRefreshPackageRef: refreshPackagePath ? `candidate_refresh_package:${repoRelative(refreshPackagePath)}#sha256=${await sha256File(refreshPackagePath)}` : '',
    sourceEvidenceRef: samplesPath ? `duration_experience_samples_export:${repoRelative(samplesPath)}#sha256=${await sha256File(samplesPath)}` : 'duration_experience_samples_export:missing',
    summary: {
      candidateRowCount: candidateRows.length,
      gapPlanningSurface,
      requiredAcceptedSamplesPerStableCode: minSamples,
      rawSampleCount: rawSamples.length,
      acceptedMatchedSampleCount: acceptedMatchedSampleIds.size,
      coveredStableCodeCount: rows.filter((row) => row.coverageStatus === 'covered').length,
      missingStableCodeCount,
      invalidSampleCount: invalidSamples.length,
    },
    rows,
    invalidSamples,
    blockers,
    nextAction: {
      builder: 'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs',
      blockedUntil: blockers.length > 0 ? 'duration_sample_coverage_complete' : null,
      command: `node project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs --samples ${repoRelative(samplesPath)} --coverage-evidence project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json --baseline-id ${baselineId || '<baselineId>'} --project-id ${projectId || '<projectId>'} --calibrated-by <real-calibrator>`,
    },
    mutationBoundary: {
      readsCandidateBaselineExport: true,
      readsCandidateRefreshPackage: Boolean(refreshPackagePath),
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

function readCandidateRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.candidateRows)) return payload.candidateRows
  return []
}

function readRefreshPackageTargetRows(payload) {
  if (Array.isArray(payload?.targetReplacementRows)) return payload.targetReplacementRows
  if (Array.isArray(payload?.target_replacement_rows)) return payload.target_replacement_rows
  return []
}

function candidateBaselineDefaultMasterPlanSourceBlockers(payload) {
  return defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(payload))
    .blockers
    .map((blocker) => `candidate_baseline_${blocker}`)
}

function readSamples(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.samples)) return payload.samples
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.duration_experience_samples)) return payload.duration_experience_samples
  return []
}

function sampleBlockers(sample, { projectId }) {
  const status = text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase()
  const includedInBenchmark = readBoolean(sample.included_in_benchmark ?? sample.includedInBenchmark)
  const metadata = readObject(sample.metadata)
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
  const metadataSource = text(metadata.source ?? metadata.source_type ?? metadata.sourceType)
  const sourceTable = text(sample.source_table ?? sample.sourceTable)
  const sourceType = text(sample.source_type ?? sample.sourceType)
  const sampleProjectId = text(sample.project_id ?? sample.projectId)
  const taskId = text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId)
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

function median(sortedValues) {
  if (sortedValues.length === 0) return 0
  const middle = Math.floor(sortedValues.length / 2)
  if (sortedValues.length % 2 === 1) return sortedValues[middle]
  return Math.round((sortedValues[middle - 1] + sortedValues[middle]) / 2)
}

function readBoolean(value) {
  return value === true || text(value).toLowerCase() === 'true'
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function sha256File(filePath) {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Duration Sample Gap Plan',
    '',
    `- status: ${report.status}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- productionReady: ${report.productionReady}`,
    `- evidenceLevel: ${report.evidenceLevel}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesDurationSamples=false, writesRuntimePublication=false`,
    '',
    '| # | title | stableCode | referenceDays | acceptedSamples | missingSamples | status | requirement |',
    '|---:|---|---|---:|---:|---:|---|---|',
  ]
  for (const row of report.rows) {
    lines.push([
      row.index,
      escapeTable(row.title),
      escapeTable(row.stableCode),
      row.candidateReferenceDays,
      row.acceptedSampleCount,
      row.missingSampleCount,
      row.coverageStatus,
      escapeTable(row.sampleCollectionRequirement),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }
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
  return path.relative(REPO_ROOT, filePath).replaceAll('\\', '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/plan-default-master-plan-duration-sample-gaps.mjs --candidate-baseline <candidate-baseline-export.json> --samples <duration_experience_samples_export.json> [--output <json>] [--min-samples-per-stable-code 1]`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await planDefaultMasterPlanDurationSampleGaps(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      candidateRowCount: report.summary.candidateRowCount,
      coveredStableCodeCount: report.summary.coveredStableCodeCount,
      missingStableCodeCount: report.summary.missingStableCodeCount,
      invalidSampleCount: report.summary.invalidSampleCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
