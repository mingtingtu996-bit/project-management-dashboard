import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanCompletedTaskExport,
} from './build-default-master-plan-completed-task-export.mjs'
import {
  buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport,
} from './build-default-master-plan-real-duration-sample-material-from-task-export.mjs'

test('builds a no-write completed task export that can feed real duration sample material', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-completed-task-export-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const rawTasks = path.join(root, 'raw-tasks.json')
  const output = path.join(root, 'completed-task-export.json')
  const materialOutput = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))
  await writeJson(rawTasks, {
    schemaVersion: 'workbuddy-raw-task-export/v1',
    rows: [
      rawTask({
        id: 'task-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-05-14',
      }),
      rawTask({
        id: 'task-sch-06',
        stableCode: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        actualStartDate: '2026-05-15',
        actualEndDate: '2026-07-01',
      }),
      rawTask({
        id: 'task-unrelated',
        stableCode: 'BTMP-OTHER-01',
        title: '非采集范围任务',
        actualStartDate: '2026-01-01',
        actualEndDate: '2026-01-10',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanCompletedTaskExport({
      collectionPackage,
      rawTasks,
      output,
      sourceName: 'school production tasks export',
      evidenceRef: 'tasks-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:completed-tasks-reviewed',
      exportedBy: 'operator-1',
      now: new Date('2026-07-06T11:00:00.000Z'),
    })

    assert.equal(report.status, 'completed_task_export_ready')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.summary.rawTaskCount, 3)
    assert.equal(report.summary.exportedTaskCount, 2)
    assert.equal(report.summary.ignoredTaskCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)

    const exported = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exported.schemaVersion, 'workbuddy-completed-task-export/v1')
    assert.equal(exported.sourceEvidence.sourceName, 'school production tasks export')
    assert.equal(exported.rows.length, 2)
    assert.equal(exported.rows[0].id, 'task-sch-05')
    assert.equal(exported.rows[0].projectId, 'project-1')
    assert.equal(exported.rows[0].stableCode, 'BTMP-SCH-05')
    assert.equal(exported.rows[0].actualDurationDays, 75)
    assert.equal(exported.rows[0].sourceType, 'completed_task')
    assert.equal(exported.rows[0].metadata.materialTemplate, false)
    assert.equal(exported.rows[0].metadata.stagingControlledReplay, false)
    assert.equal(exported.rows[0].metadata.notRealProductionOutcome, false)

    const materialReport = await buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport({
      collectionPackage,
      completedTaskExport: output,
      output: materialOutput,
      sourceName: 'school production tasks export',
      evidenceRef: 'tasks-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:completed-tasks-reviewed',
      preparedBy: 'operator-1',
      now: new Date('2026-07-06T11:05:00.000Z'),
    })
    assert.equal(materialReport.status, 'material_ready')
    assert.equal(materialReport.summary.exportedSampleCount, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks completed task export when evidence refs are missing or tasks are not usable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-completed-task-export-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const rawTasks = path.join(root, 'raw-tasks.json')
  const output = path.join(root, 'completed-task-export.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
  ]))
  await writeJson(rawTasks, {
    rows: [{
      id: 'task-sch-05',
      projectId: 'project-1',
      stableCode: 'BTMP-SCH-05',
      title: '操场道路与校园室外配套',
      status: 'in_progress',
      actualStartDate: '2026-03-01',
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCompletedTaskExport({
      collectionPackage,
      rawTasks,
      output,
      sourceName: '',
      evidenceRef: '',
      operatorReviewRef: '',
      exportedBy: '',
      now: new Date('2026-07-06T11:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedTaskCount, 0)
    assert.equal(report.summary.invalidTaskCount, 1)
    assert.equal(report.blockers.includes('source_name_required'), true)
    assert.equal(report.blockers.includes('source_evidence_ref_required'), true)
    assert.equal(report.blockers.includes('operator_review_ref_required'), true)
    assert.equal(report.blockers.includes('exported_by_required'), true)
    assert.equal(report.blockers.includes('invalid_completed_task_rows_present'), true)
    assert.equal(report.blockers.includes('completed_task_export_coverage_incomplete'), true)

    const exported = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exported.rows.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps valid completed task rows in a blocked partial export for downstream gap diagnostics', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-completed-task-export-partial-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const rawTasks = path.join(root, 'raw-tasks.json')
  const output = path.join(root, 'completed-task-export.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))
  await writeJson(rawTasks, {
    schemaVersion: 'workbuddy-raw-task-export/v1',
    rows: [
      rawTask({
        id: 'task-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-05-14',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanCompletedTaskExport({
      collectionPackage,
      rawTasks,
      output,
      sourceName: 'school production tasks export',
      evidenceRef: 'tasks-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:completed-tasks-reviewed',
      exportedBy: 'operator-1',
      now: new Date('2026-07-06T12:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedTaskCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.deepEqual(report.blockers, ['completed_task_export_coverage_incomplete'])

    const exported = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exported.status, 'blocked')
    assert.equal(exported.rows.length, 1)
    assert.equal(exported.rows[0].stableCode, 'BTMP-SCH-05')
    assert.equal(exported.rows[0].actualDurationDays, 75)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks completed task export when stable code matches a different task title', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-completed-task-export-title-drift-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const rawTasks = path.join(root, 'raw-tasks.json')
  const output = path.join(root, 'completed-task-export.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', candidateReferenceDays: 95 }),
    sampleRequest({ stableCode: 'BTMP-SCH-03', title: '实验室通风与专业机电安装', candidateReferenceDays: 90 }),
  ]))
  await writeJson(rawTasks, {
    rows: [
      rawTask({
        id: 'stale-task-sch-02',
        stableCode: 'BTMP-SCH-02',
        title: '实验室通风与专业机电安装',
        actualStartDate: '2026-12-14',
        actualEndDate: '2027-03-13',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanCompletedTaskExport({
      collectionPackage,
      rawTasks,
      output,
      sourceName: 'raw_completed_tasks',
      evidenceRef: 'raw_completed_tasks:project-testing/reports/default-master-plan-production-readiness/source-exports/raw-completed-tasks.json#sha256=abc123',
      operatorReviewRef: 'pm-review:completed-tasks-reviewed',
      exportedBy: 'operator-1',
      now: new Date('2026-07-06T13:55:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.invalidTaskCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 2)
    assert.equal(report.summary.titleMismatchCount, 1)
    assert.equal(report.summary.titleMatchedDifferentStableCodeCount, 1)
    assert.equal(report.blockers.includes('invalid_completed_task_rows_present'), true)
    assert.equal(report.blockers.includes('completed_task_export_coverage_incomplete'), true)
    assert.deepEqual(report.invalidTasks[0].blockers, ['completed_task_title_mismatch'])
    assert.equal(report.invalidTasks[0].expectedTitle, '教学楼二次结构与普通教室粗装修')
    assert.equal(report.invalidTasks[0].matchingRequestedStableCodeByTitle, 'BTMP-SCH-03')
    assert.equal(report.invalidTasks[0].matchingRequestedTitleByTitle, '实验室通风与专业机电安装')
    assert.equal(report.invalidTasks[0].recommendedAction, 'refresh_runtime_task_stable_code_or_collect_current_completed_task')
    assert.deepEqual(report.rows[0].selectedTaskIds, [])
    assert.deepEqual(report.rows[1].selectedTaskIds, [])

    const exported = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exported.rows.length, 0)
    const markdown = await readFile(output.replace(/\.json$/, '.report.md'), 'utf8')
    assert.match(markdown, /expectedTitle/)
    assert.match(markdown, /BTMP-SCH-03/)
    assert.match(markdown, /refresh_runtime_task_stable_code_or_collect_current_completed_task/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function collectionPackageFixture(sampleRequests) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sampleRequests,
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function sampleRequest({ stableCode, title, candidateReferenceDays }) {
  return {
    source: 'profile_runtime_reference_day_gap',
    candidateRowId: stableCode,
    stableCode,
    title,
    executionLane: 'school_handover',
    executionPhase: 'acceptance_handover',
    candidateReferenceDays,
    requiredAcceptedSampleCount: 1,
    businessType: 'school',
    businessTypes: ['school'],
    durationAssetStableCode: 'outdoor_utilities',
    t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
    profileRuntimeReferenceStableCode: stableCode,
    stableCodeResolution: 'profile_runtime_reference_day_gap',
    requestSources: ['profile_runtime_reference_day_gap'],
  }
}

function rawTask({ id, stableCode, title, actualStartDate, actualEndDate }) {
  return {
    id,
    project_id: 'project-1',
    standard_work_code: stableCode,
    title,
    status: 'completed',
    actual_start_date: actualStartDate,
    actual_end_date: actualEndDate,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
