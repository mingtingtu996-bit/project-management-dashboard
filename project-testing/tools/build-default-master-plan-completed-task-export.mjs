#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_PACKAGE = path.join(OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_RAW_TASKS = path.join(OUTPUT_ROOT, 'source-exports', 'raw-completed-tasks.json')
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'source-exports', 'completed-task-export.json')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|placeholder/i
const COMPLETED_STATUSES = new Set(['completed', 'complete', 'done', 'closed', 'finished'])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    rawTasks: DEFAULT_RAW_TASKS,
    output: DEFAULT_OUTPUT,
    sourceName: '',
    evidenceRef: '',
    operatorReviewRef: '',
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
    if (arg === '--collection-package') options.collectionPackage = path.resolve(nextValue())
    else if (arg === '--raw-tasks') options.rawTasks = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--source-name') options.sourceName = nextValue()
    else if (arg === '--evidence-ref') options.evidenceRef = nextValue()
    else if (arg === '--operator-review-ref') options.operatorReviewRef = nextValue()
    else if (arg === '--exported-by') options.exportedBy = nextValue()
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function buildDefaultMasterPlanCompletedTaskExport({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  rawTasks = DEFAULT_RAW_TASKS,
  output = DEFAULT_OUTPUT,
  sourceName = '',
  evidenceRef = '',
  operatorReviewRef = '',
  exportedBy = '',
  now = new Date(),
} = {}) {
  const collectionPackagePath = path.resolve(collectionPackage)
  const rawTasksPath = path.resolve(rawTasks)
  const outputPath = path.resolve(output)
  const collectionPayload = JSON.parse(await readFile(collectionPackagePath, 'utf8'))
  const rawTasksPayload = JSON.parse(await readFile(rawTasksPath, 'utf8'))
  const baselineId = text(collectionPayload.baselineId ?? collectionPayload.baseline_id)
  const projectId = text(collectionPayload.projectId ?? collectionPayload.project_id)
  const sampleRequests = readSampleRequests(collectionPayload)
  const requestedStableCodes = new Set(sampleRequests.map(requestStableCode).filter(Boolean))
  const sampleRequestByStableCode = new Map(sampleRequests.map((request) => [requestStableCode(request), request]))
  const sampleRequestByTitle = new Map(sampleRequests
    .map((request) => [normalizeComparableTitle(request.title), request])
    .filter(([title]) => title))
  const rawRows = readTaskRows(rawTasksPayload)
  const invalidTasks = []
  const ignoredTasks = []
  const validTasksByStableCode = new Map()

  for (const row of rawRows) {
    const stableCode = taskStableCode(row)
    if (!stableCode || !requestedStableCodes.has(stableCode)) {
      ignoredTasks.push({
        id: taskIdentity(row),
        stableCode,
        title: taskTitle(row),
        reason: stableCode ? 'stable_code_not_requested' : 'stable_code_missing',
      })
      continue
    }
    const request = sampleRequestByStableCode.get(stableCode)
    const blockers = completedTaskBlockers(row, { projectId, stableCode, expectedTitle: text(request?.title) })
    if (blockers.length > 0) {
      const titleDrift = buildTitleDriftDiagnostic(row, request, sampleRequestByTitle)
      invalidTasks.push({
        id: taskIdentity(row),
        stableCode,
        title: taskTitle(row),
        ...titleDrift,
        blockers,
      })
      continue
    }
    if (!validTasksByStableCode.has(stableCode)) validTasksByStableCode.set(stableCode, [])
    validTasksByStableCode.get(stableCode).push(row)
  }

  const candidateRows = []
  const coverageRows = sampleRequests.map((request, index) => {
    const stableCode = requestStableCode(request)
    const requiredAcceptedSampleCount = Math.max(1, readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count))
    const matchingRows = validTasksByStableCode.get(stableCode) ?? []
    const selectedRows = matchingRows.slice(0, requiredAcceptedSampleCount)
    const missingTaskCount = Math.max(0, requiredAcceptedSampleCount - selectedRows.length)
    for (const row of selectedRows) {
      candidateRows.push(normalizeCompletedTaskRow(row, {
        request,
        baselineId,
        projectId,
        rawTasksPath,
        evidenceRef: text(evidenceRef),
        operatorReviewRef: text(operatorReviewRef),
      }))
    }
    return {
      index: index + 1,
      stableCode,
      title: text(request.title),
      executionLane: text(request.executionLane ?? request.execution_lane),
      executionPhase: text(request.executionPhase ?? request.execution_phase),
      requiredAcceptedSampleCount,
      matchedCompletedTaskCount: matchingRows.length,
      selectedTaskIds: selectedRows.map(taskIdentity).filter(Boolean),
      missingTaskCount,
      coverageStatus: missingTaskCount === 0 ? 'covered' : 'missing_completed_tasks',
    }
  })
  const missingStableCodes = coverageRows.filter((row) => row.coverageStatus !== 'covered').map((row) => row.stableCode).filter(Boolean)
  const titleMismatchCount = invalidTasks.filter((task) => task.blockers.includes('completed_task_title_mismatch')).length
  const titleMatchedDifferentStableCodeCount = invalidTasks.filter((task) => text(task.matchingRequestedStableCodeByTitle)).length
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    sampleRequests.length > 0 ? null : 'sample_requests_required',
    text(sourceName) && !PLACEHOLDER_PATTERN.test(text(sourceName)) ? null : 'source_name_required',
    text(evidenceRef) && !PLACEHOLDER_PATTERN.test(text(evidenceRef)) ? null : 'source_evidence_ref_required',
    text(operatorReviewRef) && !PLACEHOLDER_PATTERN.test(text(operatorReviewRef)) ? null : 'operator_review_ref_required',
    text(exportedBy) && !PLACEHOLDER_PATTERN.test(text(exportedBy)) ? null : 'exported_by_required',
    invalidTasks.length > 0 ? 'invalid_completed_task_rows_present' : null,
    missingStableCodes.length > 0 ? 'completed_task_export_coverage_incomplete' : null,
  ])
  const status = blockers.length === 0 ? 'completed_task_export_ready' : 'blocked'
  const rows = candidateRows
  const exportPayload = {
    schemaVersion: 'workbuddy-completed-task-export/v1',
    generatedAt: now.toISOString(),
    exportedAt: now.toISOString(),
    source: 'build-default-master-plan-completed-task-export',
    status,
    productionReady: false,
    baselineId,
    projectId,
    exportedBy: text(exportedBy),
    collectionPackageRef: `duration_sample_collection_package:${repoRelative(collectionPackagePath)}#sha256=${await sha256File(collectionPackagePath)}`,
    rawTasksRef: `raw_completed_tasks:${repoRelative(rawTasksPath)}#sha256=${await sha256File(rawTasksPath)}`,
    sourceEvidence: {
      sourceName: text(sourceName),
      evidenceRef: text(evidenceRef),
      operatorReviewRef: text(operatorReviewRef),
    },
    rows,
  }
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-completed-task-export/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-completed-task-export',
    status,
    productionReady: false,
    baselineId,
    projectId,
    completedTaskExportRef: `completed_task_export:${repoRelative(outputPath)}`,
    collectionPackageRef: exportPayload.collectionPackageRef,
    rawTasksRef: exportPayload.rawTasksRef,
    summary: {
      requiredStableCodeCount: coverageRows.length,
      rawTaskCount: rawRows.length,
      exportedTaskCount: rows.length,
      candidateTaskCount: candidateRows.length,
      invalidTaskCount: invalidTasks.length,
      ignoredTaskCount: ignoredTasks.length,
      titleMismatchCount,
      titleMatchedDifferentStableCodeCount,
      missingStableCodeCount: missingStableCodes.length,
      missingStableCodes,
    },
    rows: coverageRows,
    invalidTasks,
    ignoredTasks,
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
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
  await writeFile(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8')
  await writeFile(reportPathFor(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildTitleDriftDiagnostic(row, request, sampleRequestByTitle) {
  const actualTitle = taskTitle(row)
  const expectedTitle = text(request?.title)
  if (completedTaskTitleMatches(actualTitle, expectedTitle)) return {}
  const matchingRequest = sampleRequestByTitle.get(normalizeComparableTitle(actualTitle))
  const matchingStableCode = matchingRequest ? requestStableCode(matchingRequest) : ''
  return {
    expectedTitle,
    matchingRequestedStableCodeByTitle: matchingStableCode && matchingStableCode !== requestStableCode(request) ? matchingStableCode : '',
    matchingRequestedTitleByTitle: matchingStableCode ? text(matchingRequest.title) : '',
    recommendedAction: matchingStableCode && matchingStableCode !== requestStableCode(request)
      ? 'refresh_runtime_task_stable_code_or_collect_current_completed_task'
      : 'refresh_runtime_task_title_or_collect_matching_completed_task',
  }
}

function normalizeCompletedTaskRow(row, {
  request,
  baselineId,
  projectId,
  rawTasksPath,
  evidenceRef,
  operatorReviewRef,
}) {
  const metadata = readObject(row.metadata)
  const stableCode = requestStableCode(request)
  const actualDurationDays = resolveActualDurationDays(row)
  return {
    id: taskIdentity(row),
    projectId,
    stableCode,
    title: taskTitle(row) || text(request.title),
    status: 'completed',
    startedAt: actualStartDate(row),
    completedAt: actualEndDate(row),
    actualDurationDays,
    sourceType: 'completed_task',
    evidenceRef: text(row.evidenceRef ?? row.evidence_ref ?? metadata.evidenceRef ?? metadata.evidence_ref) || evidenceRef,
    metadata: {
      source: 'operator_reviewed_completed_task_export',
      materialTemplate: false,
      templatePlaceholder: false,
      baselineId,
      rawTasksRef: repoRelative(rawTasksPath),
      operatorReviewRef,
      requestCandidateRowId: text(request.candidateRowId ?? request.candidate_row_id),
      businessType: text(request.businessType ?? request.business_type),
      businessTypes: uniqueText([
        request.businessType,
        request.business_type,
        ...(Array.isArray(request.businessTypes) ? request.businessTypes : []),
        ...(Array.isArray(request.business_types) ? request.business_types : []),
      ]),
      executionPhase: text(request.executionPhase ?? request.execution_phase),
      executionLane: text(request.executionLane ?? request.execution_lane),
      requestSources: uniqueText([
        request.source,
        ...(Array.isArray(request.requestSources) ? request.requestSources : []),
        ...(Array.isArray(request.request_sources) ? request.request_sources : []),
      ]),
      durationAssetStableCode: text(request.durationAssetStableCode ?? request.duration_asset_stable_code),
      t2RhythmTemplateId: text(request.t2RhythmTemplateId ?? request.t2_rhythm_template_id),
      profileRuntimeReferenceStableCode: text(request.profileRuntimeReferenceStableCode ?? request.profile_runtime_reference_stable_code),
      stableCodeResolution: text(request.stableCodeResolution ?? request.stable_code_resolution),
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
  }
}

function completedTaskBlockers(row, { projectId, stableCode, expectedTitle = '' }) {
  const metadata = readObject(row.metadata)
  const status = text(row.status ?? row.taskStatus ?? row.task_status).toLowerCase()
  const taskId = taskIdentity(row)
  const title = taskTitle(row)
  const sourceType = text(row.sourceType ?? row.source_type)
  const rowProjectId = text(row.projectId ?? row.project_id)
  const templateMarker = readBoolean(row.materialTemplate ?? row.material_template ?? row.templatePlaceholder ?? row.template_placeholder ?? metadata.materialTemplate ?? metadata.material_template ?? metadata.templatePlaceholder ?? metadata.template_placeholder)
  const stagingControlledReplay = readBoolean(row.stagingControlledReplay ?? row.staging_controlled_replay ?? metadata.stagingControlledReplay ?? metadata.staging_controlled_replay)
  const notRealProductionOutcome = readBoolean(row.notRealProductionOutcome ?? row.not_real_production_outcome ?? metadata.notRealProductionOutcome ?? metadata.not_real_production_outcome)
  const metadataSource = text(metadata.source ?? metadata.source_type ?? metadata.sourceType)
  return uniqueText([
    stableCode ? null : 'stable_code_required',
    taskId && !PLACEHOLDER_PATTERN.test(taskId) ? null : 'completed_task_identity_required',
    COMPLETED_STATUSES.has(status) ? null : 'completed_task_status_must_be_completed',
    projectId && rowProjectId === projectId ? null : 'completed_task_project_id_mismatch',
    completedTaskTitleMatches(title, expectedTitle) ? null : 'completed_task_title_mismatch',
    resolveActualDurationDays(row) > 0 ? null : 'completed_task_actual_duration_required',
    !sourceType || sourceType === 'completed_task' ? null : 'completed_task_source_type_must_be_completed_task',
    templateMarker ? 'completed_task_must_not_be_template_material' : null,
    stagingControlledReplay ? 'completed_task_must_not_be_staging_controlled_replay' : null,
    notRealProductionOutcome ? 'completed_task_must_not_be_marked_not_real_production_outcome' : null,
    metadataSource === 'default_master_plan_staging_runtime_writer' ? 'completed_task_source_must_not_be_staging_runtime_writer' : null,
  ])
}

function completedTaskTitleMatches(title, expectedTitle) {
  const normalizedTitle = normalizeComparableTitle(title)
  const normalizedExpectedTitle = normalizeComparableTitle(expectedTitle)
  return !normalizedTitle || !normalizedExpectedTitle || normalizedTitle === normalizedExpectedTitle
}

function normalizeComparableTitle(value) {
  return text(value).replace(/\s+/g, '').toLowerCase()
}

function resolveActualDurationDays(row) {
  const explicit = readNumber(row.actualDurationDays ?? row.actual_duration_days ?? row.actualDuration ?? row.actual_duration)
  if (explicit > 0) return explicit
  const start = parseDate(actualStartDate(row))
  const end = parseDate(actualEndDate(row))
  if (!start || !end || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

function actualStartDate(row) {
  return text(row.startedAt ?? row.started_at ?? row.actualStartDate ?? row.actual_start_date ?? row.actualStart ?? row.actual_start)
}

function actualEndDate(row) {
  return text(row.completedAt ?? row.completed_at ?? row.actualEndDate ?? row.actual_end_date ?? row.actualFinish ?? row.actual_finish ?? row.actualEnd ?? row.actual_end)
}

function parseDate(value) {
  const raw = text(value)
  if (!raw) return null
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw)
  return Number.isFinite(date.getTime()) ? date : null
}

function readSampleRequests(payload) {
  if (Array.isArray(payload?.sampleRequests)) return payload.sampleRequests
  if (Array.isArray(payload?.sample_requests)) return payload.sample_requests
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function readTaskRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.tasks)) return payload.tasks
  if (Array.isArray(payload?.completedTasks)) return payload.completedTasks
  if (Array.isArray(payload?.completed_tasks)) return payload.completed_tasks
  return []
}

function requestStableCode(request) {
  return text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
}

function taskStableCode(task) {
  return text(task.stableCode ?? task.stable_code ?? task.standardWorkCode ?? task.standard_work_code ?? task.wbsStableCode ?? task.wbs_stable_code)
}

function taskIdentity(task) {
  return text(task.taskId ?? task.task_id ?? task.id ?? task.runtimeTaskId ?? task.runtime_task_id)
}

function taskTitle(task) {
  return text(task.title ?? task.name ?? task.taskName ?? task.task_name)
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

function reportPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.json')
  return `${outputPath}.report.json`
}

function markdownPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.md')
  return `${outputPath}.report.md`
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Completed Task Export',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- rawTaskCount: ${report.summary.rawTaskCount}`,
    `- exportedTaskCount: ${report.summary.exportedTaskCount}`,
    `- invalidTaskCount: ${report.summary.invalidTaskCount}`,
    `- ignoredTaskCount: ${report.summary.ignoredTaskCount}`,
    `- missingStableCodeCount: ${report.summary.missingStableCodeCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '- mutationBoundary: writesTasks=false, writesDurationSamples=false, writesTaskDependencies=false, writesRuntimePublication=false',
  ]
  if (report.invalidTasks.length > 0) {
    lines.push('', '## Invalid Tasks', '', '| id | stableCode | title | expectedTitle | matchingRequestedStableCodeByTitle | recommendedAction | blockers |', '|---|---|---|---|---|---|---|')
    for (const task of report.invalidTasks) {
      lines.push(`| ${escapeTable(task.id)} | ${escapeTable(task.stableCode)} | ${escapeTable(task.title)} | ${escapeTable(task.expectedTitle)} | ${escapeTable(task.matchingRequestedStableCodeByTitle)} | ${escapeTable(task.recommendedAction)} | ${escapeTable(task.blockers.join(', '))} |`)
    }
  }
  return `${lines.join('\n')}\n`
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
    'Usage: node project-testing/tools/build-default-master-plan-completed-task-export.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--raw-tasks <raw-completed-tasks.json>]',
    '  [--output <completed-task-export.json>]',
    '  --source-name <raw task source name>',
    '  --evidence-ref <operator-reviewed raw task evidence ref>',
    '  --operator-review-ref <review record ref>',
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
    const report = await buildDefaultMasterPlanCompletedTaskExport(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      exportedTaskCount: report.summary.exportedTaskCount,
      invalidTaskCount: report.summary.invalidTaskCount,
      missingStableCodeCount: report.summary.missingStableCodeCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
