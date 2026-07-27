#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_KIT = path.join(OUTPUT_ROOT, 'real-duration-sample-collection-kit.json')
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'real-duration-sample-collection-kit-preflight.json')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|placeholder/i

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionKit: DEFAULT_COLLECTION_KIT,
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
    if (arg === '--collection-kit') options.collectionKit = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--checked-by') options.checkedBy = nextValue()
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight({
  collectionKit = DEFAULT_COLLECTION_KIT,
  output = DEFAULT_OUTPUT,
  checkedBy = '',
  now = new Date(),
} = {}) {
  const collectionKitPath = path.resolve(collectionKit)
  const outputPath = path.resolve(output)
  const kitPayload = JSON.parse(await readFile(collectionKitPath, 'utf8'))
  const baselineId = text(kitPayload.baselineId ?? kitPayload.baseline_id)
  const projectId = text(kitPayload.projectId ?? kitPayload.project_id)
  const groups = readGroups(kitPayload)
  const rows = groups.flatMap((group) => readRows(group).map((row) => ({ group, row })))
  const readyRows = []
  const invalidRows = []

  for (const { group, row } of rows) {
    const normalized = normalizeRow(row, group, { baselineId, projectId })
    if (normalized.blockers.length > 0) invalidRows.push(normalized)
    else readyRows.push(normalized)
  }

  const boundaryBlockers = kitBoundaryBlockers(kitPayload)
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    text(checkedBy) ? null : 'checked_by_required',
    groups.length > 0 ? null : 'business_type_groups_required',
    rows.length > 0 ? null : 'collection_kit_rows_required',
    invalidRows.length > 0 ? 'invalid_collection_kit_rows_present' : null,
    ...boundaryBlockers,
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-collection-kit-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-real-duration-sample-collection-kit-preflight',
    status: blockers.length === 0 ? 'ready_for_real_duration_sample_material_build' : 'blocked',
    productionReady: false,
    baselineId,
    projectId,
    checkedBy: text(checkedBy),
    collectionKitRef: `real_duration_sample_collection_kit:${repoRelative(collectionKitPath)}#sha256=${await sha256File(collectionKitPath)}`,
    summary: {
      targetRowCount: rows.length,
      readyRowCount: readyRows.length,
      invalidRowCount: invalidRows.length,
      businessTypeGroupCount: groups.length,
    },
    materialSampleCandidates: readyRows.map(toMaterialSampleCandidate),
    invalidRows: invalidRows.map((row) => ({
      priority: row.priority,
      businessType: row.businessType,
      stableCode: row.stableCode,
      title: row.title,
      blockers: row.blockers,
    })),
    blockers,
    mutationBoundary: {
      readsRealDurationSampleCollectionKit: true,
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

function normalizeRow(row, group, { baselineId, projectId }) {
  const record = readObject(row)
  const operatorFields = readObject(record.operatorFields ?? record.operator_fields)
  const stableCode = text(record.stableCode ?? record.stable_code)
  const title = text(record.title ?? record.name)
  const sourceTaskId = text(operatorFields.sourceTaskId ?? operatorFields.source_task_id)
  const sourceTaskName = text(operatorFields.sourceTaskName ?? operatorFields.source_task_name)
  const actualDurationDays = readNumber(operatorFields.actualDurationDays ?? operatorFields.actual_duration_days)
  const startedAt = text(operatorFields.startedAt ?? operatorFields.started_at)
  const completedAt = text(operatorFields.completedAt ?? operatorFields.completed_at)
  const evidenceRef = text(operatorFields.evidenceRef ?? operatorFields.evidence_ref)
  const operatorReviewRef = text(operatorFields.operatorReviewRef ?? operatorFields.operator_review_ref)
  const blockers = uniqueText([
    stableCode ? null : 'stable_code_required',
    title ? null : 'title_required',
    sourceTaskId && !PLACEHOLDER_PATTERN.test(sourceTaskId) ? null : 'source_task_id_required',
    sourceTaskName && !PLACEHOLDER_PATTERN.test(sourceTaskName) ? null : 'source_task_name_required',
    actualDurationDays > 0 ? null : 'actual_duration_days_required',
    validIsoDate(startedAt) ? null : 'started_at_required',
    validIsoDate(completedAt) ? null : 'completed_at_required',
    validIsoDate(startedAt) && validIsoDate(completedAt) && startedAt <= completedAt ? null : 'completed_at_must_not_precede_started_at',
    evidenceRef && !PLACEHOLDER_PATTERN.test(evidenceRef) ? null : 'evidence_ref_required',
    operatorReviewRef && !PLACEHOLDER_PATTERN.test(operatorReviewRef) ? null : 'operator_review_ref_required',
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
  ])
  return {
    priority: readNumber(record.priority),
    businessType: text(record.businessType ?? record.business_type ?? group.businessType ?? group.business_type) || 'unknown',
    stableCode,
    projectId,
    title,
    sourceProjectName: text(operatorFields.sourceProjectName ?? operatorFields.source_project_name),
    sourceTaskName,
    sourceTaskId,
    actualDurationDays,
    startedAt,
    completedAt,
    evidenceRef,
    operatorReviewRef,
    candidateReferenceDays: readNumber(record.candidateReferenceDays ?? record.candidate_reference_days),
    durationAssetStableCode: text(record.durationAssetStableCode ?? record.duration_asset_stable_code),
    t2RhythmTemplateId: text(record.t2RhythmTemplateId ?? record.t2_rhythm_template_id),
    blockers,
  }
}

function toMaterialSampleCandidate(row) {
  return {
    id: `operator-real-duration:${row.stableCode}:${row.sourceTaskId}`,
    stableCode: row.stableCode,
    title: row.title,
    businessType: row.businessType,
    projectId: row.projectId,
    taskId: row.sourceTaskId,
    actualDurationDays: row.actualDurationDays,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    sourceType: 'completed_task',
    sampleStatus: 'accepted',
    includedInBenchmark: true,
    evidenceRef: row.evidenceRef,
    operatorReviewRef: row.operatorReviewRef,
    sourceEvidence: {
      sourceProjectName: row.sourceProjectName,
      sourceTaskName: row.sourceTaskName,
      sourceTaskId: row.sourceTaskId,
    },
    metadata: {
      collectionKitPreflight: true,
      candidateReferenceDays: row.candidateReferenceDays,
      durationAssetStableCode: row.durationAssetStableCode,
      t2RhythmTemplateId: row.t2RhythmTemplateId,
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
  }
}

function kitBoundaryBlockers(payload) {
  const mutationBoundary = readObject(payload.mutationBoundary ?? payload.mutation_boundary)
  return uniqueText([
    readBoolean(payload.productionReady ?? payload.production_ready) ? 'collection_kit_must_not_be_production_ready' : null,
    text(payload.noWriteBoundary ?? payload.no_write_boundary) === 'operator_collection_kit_only_no_db_write'
      ? null
      : 'collection_kit_no_write_boundary_required',
    mutationBoundary.writesProductionTables === false ? null : 'collection_kit_production_write_boundary_missing',
    mutationBoundary.writesTasks === false ? null : 'collection_kit_task_write_boundary_missing',
    mutationBoundary.writesTaskDependencies === false ? null : 'collection_kit_task_dependency_write_boundary_missing',
    mutationBoundary.writesDurationSamples === false ? null : 'collection_kit_duration_sample_write_boundary_missing',
    mutationBoundary.writesRuntimePublication === false ? null : 'collection_kit_runtime_publication_boundary_missing',
    mutationBoundary.invokesRuntimeWriters === false ? null : 'collection_kit_runtime_writer_boundary_missing',
    mutationBoundary.performsRollback === false ? null : 'collection_kit_rollback_boundary_missing',
  ])
}

function readGroups(payload) {
  if (Array.isArray(payload?.businessTypeGroups)) return payload.businessTypeGroups
  if (Array.isArray(payload?.business_type_groups)) return payload.business_type_groups
  return []
}

function readRows(group) {
  if (Array.isArray(group?.rows)) return group.rows
  return []
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Real Duration Sample Collection Kit Preflight',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- targetRowCount: ${report.summary.targetRowCount}`,
    `- readyRowCount: ${report.summary.readyRowCount}`,
    `- invalidRowCount: ${report.summary.invalidRowCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false, invokesRuntimeWriters=false, performsRollback=false',
  ]
  if (report.invalidRows.length > 0) {
    lines.push('', '## Invalid Rows', '', '| priority | stableCode | title | blockers |', '|---:|---|---|---|')
    for (const row of report.invalidRows) {
      lines.push(`| ${row.priority} | ${escapeTable(row.stableCode)} | ${escapeTable(row.title)} | ${escapeTable(row.blockers.join(', '))} |`)
    }
  }
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.md')
  return `${outputPath}.md`
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readBoolean(value) {
  return value === true || value === 'true'
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value))
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function escapeTable(value) {
  return text(value).replace(/\|/g, '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs',
    '  [--collection-kit <real-duration-sample-collection-kit.json>]',
    '  [--output <real-duration-sample-collection-kit-preflight.json>]',
    '  [--checked-by <operator-id>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      targetRowCount: report.summary.targetRowCount,
      readyRowCount: report.summary.readyRowCount,
      invalidRowCount: report.summary.invalidRowCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
