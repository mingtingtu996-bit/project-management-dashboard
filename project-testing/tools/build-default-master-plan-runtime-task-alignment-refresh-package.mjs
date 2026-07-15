#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_RUNTIME_CANDIDATE_ALIGNMENT_PREFLIGHT = path.join(REPORT_ROOT, 'runtime-candidate-alignment-preflight.json')
const DEFAULT_OUTPUT = path.join(REPORT_ROOT, 'runtime-task-alignment-refresh-package.json')

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    runtimeCandidateAlignmentPreflight: DEFAULT_RUNTIME_CANDIDATE_ALIGNMENT_PREFLIGHT,
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
    if (arg === '--runtime-candidate-alignment-preflight') {
      options.runtimeCandidateAlignmentPreflight = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--prepared-by') {
      options.preparedBy = text(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanRuntimeTaskAlignmentRefreshPackage({
  runtimeCandidateAlignmentPreflight = DEFAULT_RUNTIME_CANDIDATE_ALIGNMENT_PREFLIGHT,
  output = DEFAULT_OUTPUT,
  preparedBy = '',
  now = new Date(),
} = {}) {
  const preflightPath = path.resolve(runtimeCandidateAlignmentPreflight)
  const outputPath = path.resolve(output)
  const preflight = JSON.parse(await readFile(preflightPath, 'utf8'))
  const rows = Array.isArray(preflight.rows) ? preflight.rows.map(readRow) : []
  const runtimeTaskIdsByStableCode = new Map()
  for (const row of rows) {
    if (!row.stableCode || !row.runtimeTaskId) continue
    if (!runtimeTaskIdsByStableCode.has(row.stableCode)) runtimeTaskIdsByStableCode.set(row.stableCode, [])
    runtimeTaskIdsByStableCode.get(row.stableCode).push(row.runtimeTaskId)
  }

  const actions = []
  for (const row of rows) {
    if (row.blockers.includes('runtime_task_title_mismatch') && row.runtimeTaskId) {
      const proposedStableCode = row.matchingCandidateStableCodeByRuntimeTitle
      const collision = proposedStableCode
        && runtimeTaskIdsByStableCode.has(proposedStableCode)
        && !runtimeTaskIdsByStableCode.get(proposedStableCode).includes(row.runtimeTaskId)
      actions.push({
        index: actions.length + 1,
        stableCode: row.stableCode,
        candidateTitle: row.candidateTitle,
        runtimeTaskId: row.runtimeTaskId,
        runtimeTitle: row.runtimeTitle,
        actionKind: 'review_runtime_task_stable_code_refresh',
        currentStableCode: row.stableCode,
        proposedStableCode,
        matchingCandidateStableCodeByRuntimeTitle: proposedStableCode,
        requiresHumanReview: true,
        executeAllowed: false,
        recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_operator_review',
        blockers: uniqueText([
          'human_operator_review_required',
          collision ? 'runtime_stable_code_collision_review_required' : null,
        ]),
      })
      continue
    }
    if (row.blockers.includes('runtime_task_missing_for_candidate_stable_code')) {
      actions.push({
        index: actions.length + 1,
        stableCode: row.stableCode,
        candidateTitle: row.candidateTitle,
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        currentStableCode: row.stableCode,
        proposedStableCode: row.stableCode,
        matchingCandidateStableCodeByRuntimeTitle: '',
        requiresHumanReview: true,
        executeAllowed: false,
        recommendedOperatorAction: 'collect_current_completed_task_with_actual_dates_or_confirm_candidate_row_not_completed',
        blockers: [
          'current_completed_task_evidence_required',
          'human_operator_review_required',
        ],
      })
      continue
    }
    if (row.blockers.includes('runtime_task_actual_date_range_missing') && row.runtimeTaskId) {
      actions.push({
        index: actions.length + 1,
        stableCode: row.stableCode,
        candidateTitle: row.candidateTitle,
        runtimeTaskId: row.runtimeTaskId,
        runtimeTitle: row.runtimeTitle,
        actionKind: 'collect_runtime_task_actual_date_range',
        currentStableCode: row.stableCode,
        proposedStableCode: row.stableCode,
        matchingCandidateStableCodeByRuntimeTitle: '',
        requiresHumanReview: true,
        executeAllowed: false,
        recommendedOperatorAction: 'collect_actual_start_and_actual_finish_from_runtime_task_or_signed_source_export',
        blockers: [
          'runtime_task_actual_date_range_required',
          'human_operator_review_required',
        ],
      })
    }
  }

  const summary = {
    inputCandidateRowCount: readNumber(preflight.summary?.candidateRowCount),
    inputRuntimeTaskCount: readNumber(preflight.summary?.runtimeTaskCount),
    actionCount: actions.length,
    stableCodeRefreshReviewActionCount: actions.filter((action) => action.actionKind === 'review_runtime_task_stable_code_refresh').length,
    missingRuntimeTaskActionCount: actions.filter((action) => action.actionKind === 'collect_current_completed_task_or_confirm_scope_gap').length,
    actualDateRangeCollectionActionCount: actions.filter((action) => (
      action.actionKind === 'collect_runtime_task_actual_date_range'
      || action.actionKind === 'collect_current_completed_task_or_confirm_scope_gap'
    )).length,
    collisionReviewActionCount: actions.filter((action) => action.blockers.includes('runtime_stable_code_collision_review_required')).length,
  }
  const blockers = uniqueText([
    text(preflight.baselineId ?? preflight.baseline_id) ? null : 'baseline_id_required',
    text(preflight.projectId ?? preflight.project_id) ? null : 'project_id_required',
    actions.length > 0 ? 'runtime_task_alignment_operator_review_required' : null,
    preparedBy ? null : 'prepared_by_required',
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-runtime-task-alignment-refresh-package',
    status: actions.length > 0 ? 'runtime_task_alignment_refresh_review_required' : 'runtime_task_alignment_refresh_not_required',
    productionReady: false,
    baselineId: text(preflight.baselineId ?? preflight.baseline_id),
    projectId: text(preflight.projectId ?? preflight.project_id),
    preparedBy: text(preparedBy),
    runtimeCandidateAlignmentPreflightRef: `runtime_candidate_alignment_preflight:${repoRelative(preflightPath)}`,
    summary,
    actions,
    blockers,
    executionControl: {
      executeAllowed: false,
      reason: 'operator_review_package_only_no_automatic_task_update',
      requiredReview: 'human_operator_review_required_before_any_runtime_task_update',
    },
    mutationBoundary: {
      readsRuntimeCandidateAlignmentPreflight: true,
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

function readRow(row, index) {
  return {
    index: readNumber(row.index) || index + 1,
    stableCode: text(row.stableCode ?? row.stable_code),
    candidateTitle: text(row.candidateTitle ?? row.candidate_title),
    runtimeTaskId: text(row.runtimeTaskId ?? row.runtime_task_id),
    runtimeTitle: text(row.runtimeTitle ?? row.runtime_title),
    alignmentStatus: text(row.alignmentStatus ?? row.alignment_status),
    matchingCandidateStableCodeByRuntimeTitle: text(row.matchingCandidateStableCodeByRuntimeTitle ?? row.matching_candidate_stable_code_by_runtime_title),
    recommendedAction: text(row.recommendedAction ?? row.recommended_action),
    blockers: arrayOfText(row.blockers),
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Runtime Task Alignment Refresh Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- preparedBy: ${report.preparedBy || 'missing'}`,
    `- actionCount: ${report.summary.actionCount}`,
    `- stableCodeRefreshReviewActionCount: ${report.summary.stableCodeRefreshReviewActionCount}`,
    `- missingRuntimeTaskActionCount: ${report.summary.missingRuntimeTaskActionCount}`,
    `- actualDateRangeCollectionActionCount: ${report.summary.actualDateRangeCollectionActionCount}`,
    `- collisionReviewActionCount: ${report.summary.collisionReviewActionCount}`,
    `- executeAllowed: ${report.executionControl.executeAllowed}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '',
    'This is an operator review package with no automatic database mutation.',
    '',
    '| index | stableCode | candidateTitle | runtimeTaskId | runtimeTitle | actionKind | proposedStableCode | action | blockers |',
    '|---:|---|---|---|---|---|---|---|---|',
  ]
  for (const action of report.actions) {
    lines.push(`| ${[
      action.index,
      action.stableCode,
      action.candidateTitle,
      action.runtimeTaskId,
      action.runtimeTitle,
      action.actionKind,
      action.proposedStableCode,
      action.recommendedOperatorAction,
      action.blockers.join(', '),
    ].map(escapeTable).join(' | ')} |`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function markdownPathFor(filePath) {
  return filePath.replace(/\.json$/i, '.md')
}

function arrayOfText(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
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
  console.log('Usage: node project-testing/tools/build-default-master-plan-runtime-task-alignment-refresh-package.mjs [--runtime-candidate-alignment-preflight <json>] [--output <json>] [--prepared-by <operator-id>]')
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRuntimeTaskAlignmentRefreshPackage(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      actionCount: report.summary.actionCount,
      stableCodeRefreshReviewActionCount: report.summary.stableCodeRefreshReviewActionCount,
      missingRuntimeTaskActionCount: report.summary.missingRuntimeTaskActionCount,
      actualDateRangeCollectionActionCount: report.summary.actualDateRangeCollectionActionCount,
      collisionReviewActionCount: report.summary.collisionReviewActionCount,
      executeAllowed: report.executionControl.executeAllowed,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
