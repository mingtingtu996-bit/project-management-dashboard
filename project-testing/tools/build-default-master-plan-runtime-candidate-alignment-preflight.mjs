#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_CANDIDATE_BASELINE = path.join(REPORT_ROOT, 'candidate-baseline-b1b45804-c3d7-40fa-88cf-fc6da4390c61-school-items.json')
const DEFAULT_RAW_TASKS = path.join(REPORT_ROOT, 'source-exports', 'raw-completed-tasks.json')
const DEFAULT_OUTPUT = path.join(REPORT_ROOT, 'runtime-candidate-alignment-preflight.json')
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'closed', 'finished'])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateBaseline: DEFAULT_CANDIDATE_BASELINE,
    rawTasks: DEFAULT_RAW_TASKS,
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
    if (arg === '--candidate-baseline') options.candidateBaseline = path.resolve(nextValue())
    else if (arg === '--raw-tasks') options.rawTasks = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function buildDefaultMasterPlanRuntimeCandidateAlignmentPreflight({
  candidateBaseline = DEFAULT_CANDIDATE_BASELINE,
  rawTasks = DEFAULT_RAW_TASKS,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const candidateBaselinePath = path.resolve(candidateBaseline)
  const rawTasksPath = path.resolve(rawTasks)
  const outputPath = path.resolve(output)
  const candidatePayload = JSON.parse(await readFile(candidateBaselinePath, 'utf8'))
  const rawTasksPayload = JSON.parse(await readFile(rawTasksPath, 'utf8'))
  const baselineId = firstText(candidatePayload.baselineId, candidatePayload.baseline_id, rawTasksPayload.export_metadata?.baseline_id)
  const projectId = firstText(candidatePayload.projectId, candidatePayload.project_id, rawTasksPayload.export_metadata?.project_id)
  const candidateRows = readCandidateRows(candidatePayload)
  const runtimeTasks = readRuntimeTasks(rawTasksPayload)
  const candidateByTitle = new Map(candidateRows
    .map((row) => [normalizeComparableTitle(row.title), row])
    .filter(([title]) => title))
  const runtimeTasksByStableCode = new Map()
  for (const task of runtimeTasks) {
    if (!runtimeTasksByStableCode.has(task.stableCode)) runtimeTasksByStableCode.set(task.stableCode, [])
    runtimeTasksByStableCode.get(task.stableCode).push(task)
  }

  const rows = candidateRows.map((candidate, index) => {
    const matchingRuntimeTasks = runtimeTasksByStableCode.get(candidate.stableCode) ?? []
    const runtimeTask = matchingRuntimeTasks[0] ?? null
    const rowBlockers = []
    let alignmentStatus = 'matched'
    if (!runtimeTask) {
      rowBlockers.push('runtime_task_missing_for_candidate_stable_code')
      alignmentStatus = 'missing_runtime_task'
    }
    const runtimeTitle = runtimeTask?.title ?? ''
    const titleMatches = runtimeTask ? normalizeComparableTitle(runtimeTitle) === normalizeComparableTitle(candidate.title) : false
    if (runtimeTask && !titleMatches) {
      rowBlockers.push('runtime_task_title_mismatch')
      alignmentStatus = 'title_mismatch'
    }
    const matchingByRuntimeTitle = runtimeTask
      ? candidateByTitle.get(normalizeComparableTitle(runtimeTitle))
      : null
    const matchingCandidateStableCodeByRuntimeTitle = matchingByRuntimeTitle && matchingByRuntimeTitle.stableCode !== candidate.stableCode
      ? matchingByRuntimeTitle.stableCode
      : ''
    if (matchingCandidateStableCodeByRuntimeTitle) rowBlockers.push('runtime_task_title_matches_different_candidate_stable_code')
    if (runtimeTask && runtimeTask.projectId && projectId && runtimeTask.projectId !== projectId) {
      rowBlockers.push('runtime_task_project_id_mismatch')
      alignmentStatus = alignmentStatus === 'matched' ? 'project_mismatch' : alignmentStatus
    }
    const actualDateRange = runtimeTask
      ? buildDateRange(runtimeTask.actualStartDate, runtimeTask.actualEndDate)
      : null
    if (!actualDateRange) {
      rowBlockers.push('runtime_task_actual_date_range_missing')
      if (alignmentStatus === 'matched') alignmentStatus = 'actual_date_range_missing'
    }
    const actualDurationDays = actualDateRange?.durationDays ?? null
    const plannedDurationDays = candidate.smartReferenceDays || buildDateRange(candidate.plannedStart, candidate.plannedEnd)?.durationDays || null
    const durationVarianceDays = actualDurationDays !== null && plannedDurationDays !== null
      ? actualDurationDays - plannedDurationDays
      : null
    return {
      index: index + 1,
      stableCode: candidate.stableCode,
      candidateTitle: candidate.title,
      candidatePlannedStart: candidate.plannedStart,
      candidatePlannedEnd: candidate.plannedEnd,
      candidateReferenceDays: candidate.smartReferenceDays,
      runtimeTaskId: runtimeTask?.id ?? '',
      runtimeTitle,
      runtimeStatus: runtimeTask?.status ?? '',
      runtimeProjectId: runtimeTask?.projectId ?? '',
      actualStartDate: runtimeTask?.actualStartDate ?? '',
      actualEndDate: runtimeTask?.actualEndDate ?? '',
      actualDurationDays,
      plannedDurationDays,
      durationVarianceDays,
      matchingCandidateStableCodeByRuntimeTitle,
      alignmentStatus,
      recommendedAction: rowBlockers.includes('runtime_task_title_mismatch') || rowBlockers.includes('runtime_task_missing_for_candidate_stable_code')
        ? 'refresh_runtime_task_stable_code_or_collect_current_completed_task'
        : '',
      blockers: rowBlockers,
    }
  })

  const summary = {
    candidateRowCount: candidateRows.length,
    runtimeTaskCount: runtimeTasks.length,
    matchedStableCodeCount: rows.filter((row) => row.runtimeTaskId).length,
    missingRuntimeTaskCount: rows.filter((row) => row.blockers.includes('runtime_task_missing_for_candidate_stable_code')).length,
    titleMismatchCount: rows.filter((row) => row.blockers.includes('runtime_task_title_mismatch')).length,
    titleMatchedDifferentStableCodeCount: rows.filter((row) => row.matchingCandidateStableCodeByRuntimeTitle).length,
    rowsWithActualDateRangeCount: rows.filter((row) => row.actualDurationDays !== null).length,
    rowsMissingActualDateRangeCount: rows.filter((row) => row.blockers.includes('runtime_task_actual_date_range_missing')).length,
    projectMismatchCount: rows.filter((row) => row.blockers.includes('runtime_task_project_id_mismatch')).length,
  }
  const rawMutationBoundary = readRecord(rawTasksPayload.export_metadata?.mutation_boundary ?? rawTasksPayload.exportMetadata?.mutationBoundary)
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    candidateRows.length > 0 ? null : 'candidate_rows_required',
    runtimeTasks.length > 0 ? null : 'runtime_completed_tasks_required',
    summary.missingRuntimeTaskCount > 0 ? 'runtime_candidate_alignment_coverage_incomplete' : null,
    summary.titleMismatchCount > 0 ? 'runtime_candidate_title_mismatch_rows_present' : null,
    summary.rowsMissingActualDateRangeCount > 0 ? 'runtime_candidate_actual_date_range_missing' : null,
    summary.projectMismatchCount > 0 ? 'runtime_candidate_project_mismatch_rows_present' : null,
    rawMutationBoundary.writesProductionTables === true ? 'raw_tasks_export_writes_production_tables' : null,
    rawMutationBoundary.writesTasks === true ? 'raw_tasks_export_writes_tasks' : null,
    rawMutationBoundary.writesTaskDependencies === true ? 'raw_tasks_export_writes_task_dependencies' : null,
    rawMutationBoundary.writesRuntimePublication === true ? 'raw_tasks_export_writes_runtime_publication' : null,
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-runtime-candidate-alignment-preflight',
    status: blockers.length === 0 ? 'pass' : 'blocked',
    productionReady: false,
    baselineId,
    projectId,
    candidateBaselineRef: `candidate_baseline:${repoRelative(candidateBaselinePath)}`,
    rawTasksRef: `raw_completed_tasks:${repoRelative(rawTasksPath)}`,
    summary,
    rows,
    blockers,
    mutationBoundary: {
      readsCandidateBaseline: true,
      readsRawTasksExport: true,
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

function readCandidateRows(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  return rows.map((row, index) => ({
    index: readNumber(row.index) || index + 1,
    stableCode: firstText(row.standardWorkCode, row.standard_work_code, row.stableCode, row.stable_code),
    title: text(row.title),
    plannedStart: firstText(row.plannedStart, row.planned_start, row.startDate, row.start_date),
    plannedEnd: firstText(row.plannedEnd, row.planned_end, row.endDate, row.end_date),
    smartReferenceDays: readNumber(row.smartReferenceDays ?? row.smart_reference_days),
  })).filter((row) => row.stableCode)
}

function readRuntimeTasks(payload) {
  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.tasks)
      ? payload.tasks
      : []
  return rows
    .map((row) => ({
      id: text(row.id ?? row.task_id),
      projectId: firstText(row.project_id, row.projectId),
      title: text(row.title ?? row.name),
      status: text(row.status).toLowerCase(),
      stableCode: firstText(row.standard_work_code, row.standardWorkCode, row.stable_code, row.stableCode),
      actualStartDate: firstText(row.actual_start_date, row.actualStartDate, row.actual_start, row.actualStart),
      actualEndDate: firstText(row.actual_end_date, row.actualEndDate, row.actual_end, row.actualEnd),
    }))
    .filter((row) => row.stableCode && (!row.status || COMPLETED_STATUSES.has(row.status)))
}

function buildDateRange(startValue, endValue) {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end || end.getTime() < start.getTime()) return null
  const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1)
  return { start, end, durationDays }
}

function parseDate(value) {
  const normalized = text(value)
  if (!normalized) return null
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function renderMarkdown(report) {
  const lines = [
    '# Runtime Candidate Alignment Preflight',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- candidateRowCount: ${report.summary.candidateRowCount}`,
    `- runtimeTaskCount: ${report.summary.runtimeTaskCount}`,
    `- matchedStableCodeCount: ${report.summary.matchedStableCodeCount}`,
    `- missingRuntimeTaskCount: ${report.summary.missingRuntimeTaskCount}`,
    `- titleMismatchCount: ${report.summary.titleMismatchCount}`,
    `- titleMatchedDifferentStableCodeCount: ${report.summary.titleMatchedDifferentStableCodeCount}`,
    `- rowsWithActualDateRangeCount: ${report.summary.rowsWithActualDateRangeCount}`,
    `- rowsMissingActualDateRangeCount: ${report.summary.rowsMissingActualDateRangeCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '',
    '| stableCode | candidateTitle | runtimeTaskId | runtimeTitle | status | actualDurationDays | durationVarianceDays | action | blockers |',
    '|---|---|---|---|---|---:|---:|---|---|',
  ]
  for (const row of report.rows) {
    lines.push([
      escapeTable(row.stableCode),
      escapeTable(row.candidateTitle),
      escapeTable(row.runtimeTaskId),
      escapeTable(row.runtimeTitle),
      escapeTable(row.alignmentStatus),
      row.actualDurationDays ?? '',
      row.durationVarianceDays ?? '',
      escapeTable(row.recommendedAction),
      escapeTable(row.blockers.join(', ')),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeComparableTitle(value) {
  return text(value).replace(/\s+/g, '')
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/build-default-master-plan-runtime-candidate-alignment-preflight.mjs [--candidate-baseline <json>] [--raw-tasks <json>] [--output <json>]`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRuntimeCandidateAlignmentPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      candidateRowCount: report.summary.candidateRowCount,
      runtimeTaskCount: report.summary.runtimeTaskCount,
      titleMismatchCount: report.summary.titleMismatchCount,
      missingRuntimeTaskCount: report.summary.missingRuntimeTaskCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
