import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport,
} from './build-default-master-plan-real-duration-sample-material-from-task-export.mjs'
import {
  checkDefaultMasterPlanRealDurationSampleMaterialPreflight,
} from './check-default-master-plan-real-duration-sample-material-preflight.mjs'

test('builds accepted real duration sample material from completed task export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-task-material-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExport = path.join(root, 'completed-task-export.json')
  const output = path.join(root, 'real-duration-sample-material.json')
  const preflightOutput = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))
  await writeJson(completedTaskExport, {
    schemaVersion: 'workbuddy-completed-task-export/v1',
    exportedAt: '2026-07-06T10:00:00.000Z',
    exportedBy: 'operator-1',
    rows: [
      completedTask({
        id: 'task-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        startedAt: '2026-03-01',
        completedAt: '2026-05-14',
      }),
      completedTask({
        id: 'task-sch-06',
        stableCode: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        startedAt: '2026-05-15',
        completedAt: '2026-07-01',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport({
      collectionPackage,
      completedTaskExport,
      output,
      sourceName: 'school completed task export',
      evidenceRef: 'completed-task-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:duration-samples-reviewed',
      preparedBy: 'operator-1',
      now: new Date('2026-07-06T10:05:00.000Z'),
    })

    assert.equal(report.status, 'material_ready')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.summary.exportedSampleCount, 2)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const material = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(material.schemaVersion, 'workbuddy-real-duration-sample-material/v1')
    assert.equal(material.materialTemplate, false)
    assert.equal(material.templateStatus, 'operator_supplied_real_duration_sample_material')
    assert.equal(material.sourceEvidence.sourceName, 'school completed task export')
    assert.equal(material.samples.length, 2)
    assert.equal(material.samples[0].id, 'real-duration-sample:task-sch-05:BTMP-SCH-05')
    assert.equal(material.samples[0].taskId, 'task-sch-05')
    assert.equal(material.samples[0].stableCode, 'BTMP-SCH-05')
    assert.equal(material.samples[0].actualDurationDays, 75)
    assert.equal(material.samples[0].sampleStatus, 'accepted')
    assert.equal(material.samples[0].includedInBenchmark, true)
    assert.equal(material.samples[0].metadata.source, 'operator_supplied_completed_task_export')
    assert.equal(material.samples[0].metadata.materialTemplate, false)
    assert.equal(material.samples[0].metadata.stagingControlledReplay, false)
    assert.equal(material.samples[0].metadata.notRealProductionOutcome, false)

    const preflight = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial: output,
      output: preflightOutput,
      checkedBy: 'operator-1',
      now: new Date('2026-07-06T10:06:00.000Z'),
    })

    assert.equal(preflight.status, 'ready_for_source_export')
    assert.deepEqual(preflight.blockers, [])
    assert.equal(preflight.summary.readyStableCodeCount, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks task export material when tasks are incomplete or evidence refs are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-task-material-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExport = path.join(root, 'completed-task-export.json')
  const output = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
  ]))
  await writeJson(completedTaskExport, {
    rows: [
      {
        id: 'task-sch-05',
        projectId: 'project-1',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        status: 'in_progress',
        startedAt: '2026-03-01',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport({
      collectionPackage,
      completedTaskExport,
      output,
      sourceName: '',
      evidenceRef: '',
      operatorReviewRef: '',
      preparedBy: '',
      now: new Date('2026-07-06T10:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedSampleCount, 0)
    assert.equal(report.summary.invalidTaskCount, 1)
    assert.equal(report.blockers.includes('source_name_required'), true)
    assert.equal(report.blockers.includes('source_evidence_ref_required'), true)
    assert.equal(report.blockers.includes('operator_review_ref_required'), true)
    assert.equal(report.blockers.includes('prepared_by_required'), true)
    assert.equal(report.blockers.includes('invalid_completed_task_rows_present'), true)
    assert.equal(report.blockers.includes('accepted_real_duration_sample_material_coverage_incomplete'), true)

    const material = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(material.materialTemplate, false)
    assert.equal(material.samples.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps valid material samples when completed task export is partial but not coverage-complete', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-task-material-partial-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExport = path.join(root, 'completed-task-export.json')
  const output = path.join(root, 'real-duration-sample-material.json')
  const preflightOutput = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))
  await writeJson(completedTaskExport, {
    schemaVersion: 'workbuddy-completed-task-export/v1',
    status: 'blocked',
    rows: [
      completedTask({
        id: 'task-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        startedAt: '2026-03-01',
        completedAt: '2026-05-14',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport({
      collectionPackage,
      completedTaskExport,
      output,
      sourceName: 'completed_task_export',
      evidenceRef: 'completed-task-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:duration-samples-reviewed',
      preparedBy: 'operator-1',
      now: new Date('2026-07-06T12:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedSampleCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.deepEqual(report.blockers, ['accepted_real_duration_sample_material_coverage_incomplete'])

    const material = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(material.samples.length, 1)
    assert.equal(material.samples[0].stableCode, 'BTMP-SCH-05')
    assert.equal(material.samples[0].actualDurationDays, 75)

    const preflight = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial: output,
      output: preflightOutput,
      checkedBy: 'operator-1',
      now: new Date('2026-07-06T12:11:00.000Z'),
    })
    assert.equal(preflight.status, 'blocked')
    assert.equal(preflight.summary.rawSampleCount, 1)
    assert.equal(preflight.summary.readyStableCodeCount, 1)
    assert.deepEqual(preflight.blockers, ['accepted_real_duration_sample_material_coverage_incomplete'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks task export material when stable code matches a different requested title', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-task-material-title-drift-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExport = path.join(root, 'completed-task-export.json')
  const output = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', candidateReferenceDays: 95 }),
    sampleRequest({ stableCode: 'BTMP-SCH-03', title: '实验室通风与专业机电安装', candidateReferenceDays: 90 }),
  ]))
  await writeJson(completedTaskExport, {
    rows: [
      completedTask({
        id: 'stale-task-sch-02',
        stableCode: 'BTMP-SCH-02',
        title: '实验室通风与专业机电安装',
        startedAt: '2026-12-14',
        completedAt: '2027-03-13',
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromTaskExport({
      collectionPackage,
      completedTaskExport,
      output,
      sourceName: 'completed_task_export',
      evidenceRef: 'completed-task-export:school-project-2026#sha256=abc123',
      operatorReviewRef: 'pm-review:duration-samples-reviewed',
      preparedBy: 'operator-1',
      now: new Date('2026-07-06T14:20:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.invalidTaskCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 2)
    assert.equal(report.summary.titleMismatchCount, 1)
    assert.equal(report.summary.titleMatchedDifferentStableCodeCount, 1)
    assert.equal(report.blockers.includes('invalid_completed_task_rows_present'), true)
    assert.deepEqual(report.invalidTasks[0].blockers, ['completed_task_title_mismatch'])
    assert.equal(report.invalidTasks[0].expectedTitle, '教学楼二次结构与普通教室粗装修')
    assert.equal(report.invalidTasks[0].matchingRequestedStableCodeByTitle, 'BTMP-SCH-03')
    assert.equal(report.invalidTasks[0].recommendedAction, 'refresh_runtime_task_stable_code_or_collect_current_completed_task')

    const material = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(material.samples.length, 0)
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

function completedTask({ id, stableCode, title, startedAt, completedAt }) {
  return {
    id,
    projectId: 'project-1',
    stableCode,
    title,
    status: 'completed',
    startedAt,
    completedAt,
    sourceType: 'completed_task',
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
