import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRuntimeCandidateAlignmentPreflight,
  parseArgs,
} from './build-default-master-plan-runtime-candidate-alignment-preflight.mjs'

test('parseArgs accepts candidate baseline, raw task export, and output paths', () => {
  const candidateBaselinePath = path.join('tmp', 'candidate-baseline.json')
  const rawTasksPath = path.join('tmp', 'raw-completed-tasks.json')
  const outputPath = path.join('tmp', 'runtime-candidate-alignment-preflight.json')

  const options = parseArgs([
    '--candidate-baseline',
    candidateBaselinePath,
    '--raw-tasks',
    rawTasksPath,
    '--output',
    outputPath,
  ])

  assert.equal(options.candidateBaseline, path.resolve(candidateBaselinePath))
  assert.equal(options.rawTasks, path.resolve(rawTasksPath))
  assert.equal(options.output, path.resolve(outputPath))
})

test('blocks when runtime completed tasks drift from candidate stableCode and title alignment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-candidate-alignment-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const rawTasksPath = path.join(root, 'raw-completed-tasks.json')
  const outputPath = path.join(root, 'runtime-candidate-alignment-preflight.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(rawTasksPath, rawCompletedTasksFixture([
    runtimeTask({
      id: 'runtime-task-1',
      title: '教学楼主体结构与功能区移交',
      standardWorkCode: 'BTMP-SCH-01',
      actualStartDate: '2026-09-25T16:00:00.000Z',
      actualEndDate: '2027-01-02T16:00:00.000Z',
    }),
    runtimeTask({
      id: 'runtime-task-2',
      title: '实验室通风与专业机电安装',
      standardWorkCode: 'BTMP-SCH-02',
      actualStartDate: '2026-12-14T16:00:00.000Z',
      actualEndDate: '2027-03-13T16:00:00.000Z',
    }),
    runtimeTask({
      id: 'runtime-task-3',
      title: '竣工验收与开学移交准备',
      standardWorkCode: 'BTMP-SCH-04',
      actualStartDate: '2027-09-15T16:00:00.000Z',
      actualEndDate: '2027-10-29T16:00:00.000Z',
    }),
  ]))

  try {
    const report = await buildDefaultMasterPlanRuntimeCandidateAlignmentPreflight({
      candidateBaseline: candidateBaselinePath,
      rawTasks: rawTasksPath,
      output: outputPath,
      now: new Date('2026-07-06T16:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.summary.candidateRowCount, 6)
    assert.equal(report.summary.runtimeTaskCount, 3)
    assert.equal(report.summary.matchedStableCodeCount, 3)
    assert.equal(report.summary.missingRuntimeTaskCount, 3)
    assert.equal(report.summary.titleMismatchCount, 2)
    assert.equal(report.summary.titleMatchedDifferentStableCodeCount, 2)
    assert.equal(report.summary.rowsWithActualDateRangeCount, 3)
    assert.equal(report.summary.rowsMissingActualDateRangeCount, 3)
    assert.equal(report.blockers.includes('runtime_candidate_title_mismatch_rows_present'), true)
    assert.equal(report.blockers.includes('runtime_candidate_alignment_coverage_incomplete'), true)
    assert.equal(report.rows.find((row) => row.stableCode === 'BTMP-SCH-02')?.alignmentStatus, 'title_mismatch')
    assert.equal(report.rows.find((row) => row.stableCode === 'BTMP-SCH-02')?.matchingCandidateStableCodeByRuntimeTitle, 'BTMP-SCH-03')
    assert.equal(report.rows.find((row) => row.stableCode === 'BTMP-SCH-03')?.alignmentStatus, 'missing_runtime_task')
    assert.equal(report.rows.find((row) => row.stableCode === 'BTMP-SCH-04')?.matchingCandidateStableCodeByRuntimeTitle, 'BTMP-SCH-06')
    assert.equal(report.rows.find((row) => row.stableCode === 'BTMP-SCH-01')?.actualDurationDays, 100)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.summary.titleMismatchCount, 2)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Candidate Alignment Preflight/)
    assert.match(markdown, /BTMP-SCH-02/)
    assert.match(markdown, /title_mismatch/)
    assert.match(markdown, /refresh_runtime_task_stable_code_or_collect_current_completed_task/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes when every candidate row has a matching runtime completed task title and date range', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-candidate-alignment-pass-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const rawTasksPath = path.join(root, 'raw-completed-tasks.json')
  const outputPath = path.join(root, 'runtime-candidate-alignment-preflight.json')

  await writeJson(candidateBaselinePath, {
    ...candidateBaselineFixture(),
    rows: candidateBaselineFixture().rows.slice(0, 2),
    rowCount: 2,
  })
  await writeJson(rawTasksPath, rawCompletedTasksFixture([
    runtimeTask({
      id: 'runtime-task-1',
      title: '教学楼主体结构与功能区移交',
      standardWorkCode: 'BTMP-SCH-01',
    }),
    runtimeTask({
      id: 'runtime-task-2',
      title: '教学楼二次结构与普通教室粗装修',
      standardWorkCode: 'BTMP-SCH-02',
    }),
  ]))

  try {
    const report = await buildDefaultMasterPlanRuntimeCandidateAlignmentPreflight({
      candidateBaseline: candidateBaselinePath,
      rawTasks: rawTasksPath,
      output: outputPath,
      now: new Date('2026-07-06T16:05:00.000Z'),
    })

    assert.equal(report.status, 'pass')
    assert.deepEqual(report.blockers, [])
    assert.equal(report.summary.matchedStableCodeCount, 2)
    assert.equal(report.summary.titleMismatchCount, 0)
    assert.equal(report.summary.missingRuntimeTaskCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function candidateBaselineFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    rowCount: 6,
    rows: [
      candidateRow(1, 'BTMP-SCH-01', '教学楼主体结构与功能区移交', '2026-09-26', '2027-01-03', 100),
      candidateRow(2, 'BTMP-SCH-02', '教学楼二次结构与普通教室粗装修', '2026-12-15', '2027-03-14', 90),
      candidateRow(3, 'BTMP-SCH-03', '实验室通风与专业机电安装', '2027-02-03', '2027-05-18', 105),
      candidateRow(4, 'BTMP-SCH-04', '食堂宿舍装修与机电收口', '2027-03-25', '2027-07-22', 120),
      candidateRow(5, 'BTMP-SCH-05', '操场道路与校园室外配套', '2027-03-05', '2027-05-18', 75),
      candidateRow(6, 'BTMP-SCH-06', '竣工验收与开学移交准备', '2027-09-16', '2027-10-30', 45),
    ],
  }
}

function candidateRow(index, stableCode, title, plannedStart, plannedEnd, smartReferenceDays) {
  return {
    index,
    id: `candidate-row-${index}`,
    title,
    standardWorkCode: stableCode,
    plannedStart,
    plannedEnd,
    smartReferenceDays,
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
  }
}

function rawCompletedTasksFixture(rows) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: {
      source: 'raw_completed_tasks',
      source_kind: 'database_table',
      environment: 'staging',
      baseline_id: 'baseline-1',
      project_id: 'project-1',
      mutation_boundary: {
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    },
    rows,
  }
}

function runtimeTask({
  id,
  title,
  standardWorkCode,
  projectId = 'project-1',
  actualStartDate = '2026-09-25T16:00:00.000Z',
  actualEndDate = '2027-01-02T16:00:00.000Z',
}) {
  return {
    id,
    project_id: projectId,
    title,
    status: 'completed',
    standard_work_code: standardWorkCode,
    actual_start_date: actualStartDate,
    actual_end_date: actualEndDate,
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
