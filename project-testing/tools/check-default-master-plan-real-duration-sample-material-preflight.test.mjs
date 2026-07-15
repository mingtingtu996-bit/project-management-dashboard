import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  checkDefaultMasterPlanRealDurationSampleMaterialPreflight,
} from './check-default-master-plan-real-duration-sample-material-preflight.mjs'
import {
  checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight,
} from './check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs'

test('blocks template placeholder material before real duration sample export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-material-preflight-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.template.json')
  const output = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(sampleMaterial, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    materialTemplate: true,
    sourceEvidence: {
      sourceName: '<required: completed project/task source name>',
      evidenceRef: '<required: operator-reviewed source evidence ref>',
    },
    samples: [templateSample({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' })],
  })

  try {
    const report = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial,
      output,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-05T08:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 1)
    assert.equal(report.summary.readyStableCodeCount, 0)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(report.blockers, [
      'material_source_evidence_placeholders_present',
      'real_duration_sample_material_template_must_be_filled',
      'invalid_real_duration_sample_material_present',
      'accepted_real_duration_sample_material_coverage_incomplete',
    ])
    assert.match(report.invalidSamples[0].blockers.join('\n'), /real_duration_sample_template_material_must_be_filled_before_export/)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /material_source_evidence_placeholders_present/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks operator real duration sample material ready when every requested stableCode is covered', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-material-preflight-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备' }),
  ]))
  await writeJson(sampleMaterial, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    sourceEvidence: {
      sourceName: 'operator_verified_completed_school_project',
      evidenceRef: 'operator-reviewed-sample-ledger:school-closeout-2026-07-05',
      operatorReviewRef: 'pm-review:real-duration-samples-2026-07-05',
    },
    samples: [
      realSample({ id: 'real-sample-sch-05', stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', actualDurationDays: 76 }),
      realSample({ id: 'real-sample-sch-06', stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', actualDurationDays: 49 }),
    ],
  })

  try {
    const report = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial,
      output,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-05T08:10:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_source_export')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 2)
    assert.equal(report.summary.readyStableCodeCount, 2)
    assert.equal(report.summary.invalidSampleCount, 0)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.rows.every((row) => row.coverageStatus === 'ready'), true)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes a blocked report instead of throwing when real sample material is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-material-preflight-missing-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '???????????' }),
  ]))

  try {
    const report = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial,
      output,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-05T08:20:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 1)
    assert.equal(report.summary.rawSampleCount, 0)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.blockers.includes('real_duration_sample_material_file_missing'), true)
    assert.equal(report.blockers.includes('real_duration_sample_material_required'), true)
    assert.equal(report.blockers.includes('accepted_real_duration_sample_material_coverage_incomplete'), true)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'blocked')
    assert.equal(written.blockers.includes('real_duration_sample_material_file_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks a filled real duration sample collection kit ready for material build without writing samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-collection-kit-preflight-'))
  const collectionKit = path.join(root, 'real-duration-sample-collection-kit.filled.json')
  const output = path.join(root, 'real-duration-sample-collection-kit-preflight.json')

  await writeJson(collectionKit, collectionKitFixture({
    groups: [{
      businessType: 'school',
      rows: [
        collectionKitRow({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', sourceTaskId: 'task-sch-05', actualDurationDays: 76 }),
        collectionKitRow({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', sourceTaskId: 'task-sch-06', actualDurationDays: 49 }),
      ],
    }],
  }))

  try {
    const report = await checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight({
      collectionKit,
      output,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-08T04:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_real_duration_sample_material_build')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.targetRowCount, 2)
    assert.equal(report.summary.readyRowCount, 2)
    assert.equal(report.summary.invalidRowCount, 0)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.materialSampleCandidates.length, 2)
    assert.deepEqual(report.materialSampleCandidates.map((sample) => sample.stableCode), ['BTMP-SCH-05', 'BTMP-SCH-06'])
    assert.equal(report.materialSampleCandidates[0].actualDurationDays, 76)
    assert.equal(report.materialSampleCandidates[0].taskId, 'task-sch-05')
    assert.equal(report.materialSampleCandidates[0].evidenceRef, 'operator-evidence:BTMP-SCH-05')
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(report.mutationBoundary.performsRollback, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'ready_for_real_duration_sample_material_build')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /ready_for_real_duration_sample_material_build/)
    assert.match(markdown, /readyRowCount: 2/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a filled real duration sample collection kit when operator fields remain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-collection-kit-preflight-blocked-'))
  const collectionKit = path.join(root, 'real-duration-sample-collection-kit.filled.json')
  const output = path.join(root, 'real-duration-sample-collection-kit-preflight.json')

  await writeJson(collectionKit, collectionKitFixture({
    groups: [{
      businessType: 'school',
      rows: [
        collectionKitRow({
          stableCode: 'BTMP-SCH-05',
          title: '操场道路与校园室外配套',
          sourceTaskId: '<required:string>',
          actualDurationDays: 0,
          evidenceRef: '<required:string>',
        }),
      ],
    }],
  }))

  try {
    const report = await checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight({
      collectionKit,
      output,
      checkedBy: '',
      now: new Date('2026-07-08T04:06:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.targetRowCount, 1)
    assert.equal(report.summary.readyRowCount, 0)
    assert.equal(report.summary.invalidRowCount, 1)
    assert.equal(report.blockers.includes('checked_by_required'), true)
    assert.equal(report.blockers.includes('invalid_collection_kit_rows_present'), true)
    assert.deepEqual(report.invalidRows[0].blockers, [
      'source_task_id_required',
      'actual_duration_days_required',
      'evidence_ref_required',
    ])
    assert.equal(report.materialSampleCandidates.length, 0)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})


function collectionPackageFixture(sampleRequests) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    generatedAt: '2026-07-05T07:55:00.000Z',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sampleRequests,
    blockers: ['accepted_real_duration_samples_required'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function sampleRequest({ stableCode, title }) {
  return {
    stableCode,
    title,
    candidateReferenceDays: 75,
    requiredAcceptedSampleCount: 1,
    businessType: 'school',
    businessTypes: ['school'],
  }
}

function templateSample({ stableCode, title }) {
  return {
    id: `<required: real-sample-id-for-${stableCode}>`,
    stableCode,
    title,
    projectId: 'project-1',
    taskId: `<required: completed-task-id-for-${stableCode}>`,
    actualDurationDays: null,
    sourceType: 'completed_task',
    sampleStatus: 'draft',
    includedInBenchmark: false,
    evidenceRef: `<required: operator-evidence-ref-for-${stableCode}>`,
    metadata: {
      materialTemplate: true,
      templatePlaceholder: true,
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
  }
}

function realSample({ id, stableCode, title, actualDurationDays }) {
  return {
    id,
    stableCode,
    title,
    projectId: 'project-1',
    taskId: `task-${id}`,
    actualDurationDays,
    startedAt: '2027-03-01',
    completedAt: '2027-05-15',
    sourceType: 'completed_task',
    sampleStatus: 'accepted',
    includedInBenchmark: true,
    evidenceRef: `operator-evidence:${id}`,
  }
}

function collectionKitFixture({ groups }) {
  const targetCount = groups.reduce((sum, group) => sum + group.rows.length, 0)
  return {
    schemaVersion: 'workbuddy-real-duration-sample-collection-kit/v1',
    generatedAt: '2026-07-08T03:55:00.000Z',
    productionReady: false,
    noWriteBoundary: 'operator_collection_kit_only_no_db_write',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    preparedBy: 'release-operator-1',
    targetSource: 'real_evidence_gap_summary',
    summary: {
      targetCount,
      businessTypeGroupCount: groups.length,
      missingSampleCount: targetCount,
      invalidSampleCount: 0,
    },
    businessTypeGroups: groups.map((group) => ({
      businessType: group.businessType,
      targetCount: group.rows.length,
      missingSampleCount: group.rows.length,
      invalidSampleCount: 0,
      rows: group.rows,
    })),
    mutationBoundary: {
      writesProductionTables: false,
      writesDurationSamples: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }
}

function collectionKitRow({ stableCode, title, sourceTaskId, actualDurationDays, evidenceRef }) {
  return {
    priority: Number(stableCode.split('-').at(-1) ?? 1),
    businessType: 'school',
    stableCode,
    title,
    requiredAcceptedSampleCount: 1,
    readySampleCount: 0,
    missingSampleCount: 1,
    invalidSampleCount: 0,
    candidateReferenceDays: 75,
    durationAssetStableCode: 'outdoor_utilities',
    t2RhythmTemplateId: 't2-school-campus-outdoor-rhythm-v1',
    nextAction: 'collect_accepted_real_duration_sample',
    operatorFields: {
      sourceProjectName: 'operator_verified_completed_school_project',
      sourceTaskName: title,
      sourceTaskId,
      actualDurationDays,
      startedAt: '2027-03-01',
      completedAt: '2027-05-15',
      evidenceRef: evidenceRef ?? `operator-evidence:${stableCode}`,
      operatorReviewRef: 'pm-review:real-duration-samples-2026-07-08',
    },
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
