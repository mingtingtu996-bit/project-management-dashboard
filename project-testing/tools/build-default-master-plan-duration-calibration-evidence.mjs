#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'duration-calibration-evidence.json')

function parseArgs(argv) {
  const args = {
    samples: null,
    coverageEvidence: null,
    baselineId: null,
    projectId: null,
    calibratedBy: null,
    calibratedAt: new Date().toISOString(),
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--samples') {
      args.samples = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--coverage-evidence') {
      args.coverageEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--baseline-id') {
      args.baselineId = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--project-id') {
      args.projectId = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--calibrated-by') {
      args.calibratedBy = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--calibrated-at') {
      args.calibratedAt = String(argv[index + 1] ?? '').trim()
      index += 1
    } else if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs --samples <duration_experience_samples_export.json> --coverage-evidence <duration-sample-coverage-evidence.json> --baseline-id <id> --project-id <id> --calibrated-by <actor> [--calibrated-at <iso>] [--output <json>]`)
      process.exit(0)
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readBoolean(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true'
}

function text(value) {
  return String(value ?? '').trim()
}

function readSamples(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.samples)) return payload.samples
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.duration_experience_samples)) return payload.duration_experience_samples
  return []
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

function coldStartDays(sample) {
  return readNumber(
    sample.cold_start_reference_days
      ?? sample.coldStartReferenceDays
      ?? sample.reference_days
      ?? sample.referenceDays
      ?? sample.recommended_duration_days
      ?? sample.recommendedDurationDays,
  )
}

function sampleProjectId(sample) {
  return text(sample.project_id ?? sample.projectId)
}

function sampleTaskId(sample) {
  return text(sample.task_id ?? sample.taskId ?? sample.runtime_task_id ?? sample.runtimeTaskId)
}

function sampleSourceTable(sample) {
  return text(sample.source_table ?? sample.sourceTable)
}

function sampleSourceType(sample) {
  return text(sample.source_type ?? sample.sourceType).toLowerCase()
}

function sampleMetadata(sample) {
  return sample?.metadata && typeof sample.metadata === 'object' && !Array.isArray(sample.metadata)
    ? sample.metadata
    : {}
}

function sampleRealOutcomeBlockers(sample) {
  const metadata = sampleMetadata(sample)
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
    stagingControlledReplay ? 'real_duration_sample_must_not_be_staging_controlled_replay' : null,
    notRealProductionOutcome ? 'real_duration_sample_must_not_be_marked_not_real_production_outcome' : null,
    metadataSource === 'default_master_plan_staging_runtime_writer' ? 'real_duration_sample_source_must_not_be_staging_runtime_writer' : null,
  ].filter(Boolean)
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readCoverageRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.sampleRequests)) return payload.sampleRequests
  if (Array.isArray(payload?.sample_requests)) return payload.sample_requests
  return []
}

function coverageStableCode(row) {
  return text(row.stableCode ?? row.stable_code ?? row.standardWorkCode ?? row.standard_work_code)
}

function coverageAcceptedSampleIds(row) {
  return Array.isArray(row.acceptedSampleIds)
    ? row.acceptedSampleIds.map(text).filter(Boolean)
    : Array.isArray(row.accepted_sample_ids)
      ? row.accepted_sample_ids.map(text).filter(Boolean)
      : []
}

function coverageEvidenceBlockers(payload, { baselineId, projectId, acceptedSamples }) {
  const record = readObject(payload)
  const rows = readCoverageRows(record)
  const coveredStableCodes = new Set(rows
    .filter((row) => text(row.coverageStatus ?? row.coverage_status) === 'covered')
    .map(coverageStableCode)
    .filter(Boolean))
  const coveredSampleIds = new Set(rows.flatMap(coverageAcceptedSampleIds))
  const acceptedSamplesOutsideCoveredRequests = acceptedSamples.filter((sample) => {
    const code = stableCode(sample)
    const sampleId = text(sample.id)
    return !coveredStableCodes.has(code) || (coveredSampleIds.size > 0 && sampleId && !coveredSampleIds.has(sampleId))
  })
  return [
    text(record.status) === 'covered' ? null : 'duration_sample_coverage_status_must_be_covered',
    text(record.evidenceLevel ?? record.evidence_level) === 'sample_collection_coverage_verified_l2'
      ? null
      : 'duration_sample_coverage_verified_l2_required',
    text(record.baselineId ?? record.baseline_id) === baselineId ? null : 'duration_sample_coverage_baseline_id_mismatch',
    text(record.projectId ?? record.project_id) === projectId ? null : 'duration_sample_coverage_project_id_mismatch',
    text(record.collectionPackageRef ?? record.collection_package_ref).includes('#sha256=')
      ? null
      : 'duration_sample_collection_package_hash_ref_required',
    text(record.sourceEvidenceRef ?? record.source_evidence_ref).startsWith('duration_experience_samples_export:')
      && text(record.sourceEvidenceRef ?? record.source_evidence_ref).includes('#sha256=')
      ? null
      : 'duration_sample_coverage_duration_samples_export_hash_required',
    rows.length > 0 ? null : 'duration_sample_coverage_rows_required',
    acceptedSamplesOutsideCoveredRequests.length === 0
      ? null
      : 'duration_calibration_samples_must_match_covered_sample_requests',
    ...readArray(record.blockers),
  ].filter(Boolean)
}

function isBenchmarkAcceptedSample(sample) {
  const status = text(sample.sample_status ?? sample.sampleStatus ?? sample.status).toLowerCase()
  const includedInBenchmark = readBoolean(sample.included_in_benchmark ?? sample.includedInBenchmark)
  return ['active', 'accepted'].includes(status)
    && includedInBenchmark
    && actualDuration(sample) > 0
    && stableCode(sample)
    && sampleRealOutcomeBlockers(sample).length === 0
}

function runtimeSampleIdentityBlockers(samples, projectId) {
  const blockers = []
  if (samples.some((sample) => sampleProjectId(sample) !== projectId)) {
    blockers.push('duration_sample_project_id_mismatch')
  }
  if (samples.some((sample) => !sampleTaskId(sample))) {
    blockers.push('duration_sample_task_identity_required')
  }
  if (samples.some((sample) => sampleSourceTable(sample) && sampleSourceTable(sample) !== 'duration_experience_samples')) {
    blockers.push('duration_sample_source_table_must_be_duration_experience_samples')
  }
  if (samples.some((sample) => sampleSourceType(sample) && sampleSourceType(sample) !== 'completed_task')) {
    blockers.push('duration_sample_source_type_must_be_completed_task')
  }
  return blockers
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)]
}

function median(sortedValues) {
  if (sortedValues.length === 0) return 0
  const middle = Math.floor(sortedValues.length / 2)
  if (sortedValues.length % 2 === 1) return sortedValues[middle]
  return Math.round((sortedValues[middle - 1] + sortedValues[middle]) / 2)
}

function groupSamples(samples) {
  const groups = new Map()
  for (const sample of samples) {
    const code = stableCode(sample)
    if (!groups.has(code)) groups.set(code, [])
    groups.get(code).push(sample)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function blockedEvidence({ args, blockers, sampleStats, sourceEvidenceRef, coverageEvidenceRef, readsDurationSampleCoverageEvidence }) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    status: 'blocked',
    evidenceLevel: 'candidate_asset_backed_l1',
    source: 'runtime_duration_calibration',
    acceptedRealDurationSampleCount: sampleStats.acceptedRealDurationSampleCount,
    calibratedReferenceDayCount: 0,
    calibrationDeltaCount: 0,
    calibratedBy: args.calibratedBy,
    calibratedAt: args.calibratedAt,
    sourceEvidenceRef,
    coverageEvidenceRef,
    runtimeReferenceDays: [],
    calibrationDeltas: [],
    blockers,
    mutationBoundary: {
      readsDurationExperienceSamplesExport: true,
      readsDurationSampleCoverageEvidence,
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      writesSeeds: false,
    },
  }
}

function readyEvidence({ args, acceptedSamples, sourceEvidenceRef, coverageEvidenceRef, readsDurationSampleCoverageEvidence }) {
  const runtimeReferenceDays = []
  const calibrationDeltas = []
  for (const [code, samples] of groupSamples(acceptedSamples)) {
    const sortedDurations = samples.map(actualDuration).sort((left, right) => left - right)
    const p50Days = median(sortedDurations)
    const p80Days = percentile(sortedDurations, 80)
    const coldStartValues = samples.map(coldStartDays).filter((value) => value > 0).sort((left, right) => left - right)
    const coldStart = coldStartValues.length > 0 ? median(coldStartValues) : p50Days
    runtimeReferenceDays.push({
      stableCode: code,
      p50Days,
      p80Days,
      sampleCount: samples.length,
      source: 'accepted_real_project_outcome',
      sourceSampleIds: samples.map((sample) => text(sample.id)).filter(Boolean),
    })
    calibrationDeltas.push({
      stableCode: code,
      coldStartDays: coldStart,
      calibratedDays: p50Days,
      sampleCount: samples.length,
    })
  }

  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    source: 'runtime_duration_calibration',
    acceptedRealDurationSampleCount: acceptedSamples.length,
    calibratedReferenceDayCount: runtimeReferenceDays.length,
    calibrationDeltaCount: calibrationDeltas.length,
    calibratedBy: args.calibratedBy,
    calibratedAt: args.calibratedAt,
    sourceEvidenceRef,
    coverageEvidenceRef,
    runtimeReferenceDays,
    calibrationDeltas,
    mutationBoundary: {
      readsDurationExperienceSamplesExport: true,
      readsDurationSampleCoverageEvidence,
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      writesSeeds: false,
    },
  }
}

const args = parseArgs(process.argv.slice(2))
const preflightBlockers = [
  args.samples ? null : 'samples_export_required',
  args.coverageEvidence ? null : 'duration_sample_coverage_evidence_required',
  args.baselineId ? null : 'baseline_id_required',
  args.projectId ? null : 'project_id_required',
  args.calibratedBy ? null : 'calibrated_by_required',
].filter(Boolean)
let rawSamples = []
let sourceMetadataBlockers = []
let coverageEvidencePayload = {}
let coverageEvidenceBlockerList = []
let sourceEvidenceRef = args.samples ? `duration_experience_samples_export:${repoRelative(args.samples)}` : 'duration_experience_samples_export:missing'
let coverageEvidenceRef = args.coverageEvidence ? `duration_sample_coverage_evidence:${repoRelative(args.coverageEvidence)}` : 'duration_sample_coverage_evidence:missing'
if (args.samples) {
  const hash = await sha256File(args.samples)
  sourceEvidenceRef = `${sourceEvidenceRef}#sha256=${hash}`
  const payload = JSON.parse(await fs.readFile(args.samples, 'utf8'))
  rawSamples = readSamples(payload)
  sourceMetadataBlockers = sourceExportMetadataBlockers(payload, 'duration_samples')
}
const acceptedSamples = rawSamples.filter(isBenchmarkAcceptedSample)
if (args.coverageEvidence) {
  const hash = await sha256File(args.coverageEvidence)
  coverageEvidenceRef = `${coverageEvidenceRef}#sha256=${hash}`
  coverageEvidencePayload = JSON.parse(await fs.readFile(args.coverageEvidence, 'utf8'))
  coverageEvidenceBlockerList = coverageEvidenceBlockers(coverageEvidencePayload, {
    baselineId: args.baselineId,
    projectId: args.projectId,
    acceptedSamples,
  })
}
const realOutcomeSampleBlockers = [...new Set(rawSamples.flatMap(sampleRealOutcomeBlockers))]
const sampleStats = {
  rawSampleCount: rawSamples.length,
  acceptedRealDurationSampleCount: acceptedSamples.length,
}
const readsDurationSampleCoverageEvidence = Boolean(args.coverageEvidence)
const blockers = [
  ...preflightBlockers,
  acceptedSamples.length > 0 ? null : 'accepted_real_duration_samples_required',
  ...runtimeSampleIdentityBlockers(acceptedSamples, args.projectId),
  ...realOutcomeSampleBlockers,
  ...sourceMetadataBlockers,
  ...coverageEvidenceBlockerList,
].filter(Boolean)
const evidence = blockers.length > 0
  ? blockedEvidence({ args, blockers, sampleStats, sourceEvidenceRef, coverageEvidenceRef, readsDurationSampleCoverageEvidence })
  : readyEvidence({ args, acceptedSamples, sourceEvidenceRef, coverageEvidenceRef, readsDurationSampleCoverageEvidence })

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  evidenceLevel: evidence.evidenceLevel,
  output: repoRelative(args.output),
  acceptedRealDurationSampleCount: evidence.acceptedRealDurationSampleCount,
  calibratedReferenceDayCount: evidence.calibratedReferenceDayCount,
  calibrationDeltaCount: evidence.calibrationDeltaCount,
  blockers: evidence.blockers ?? [],
}, null, 2))
