import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRealDurationSampleSourceExport,
} from './build-default-master-plan-real-duration-sample-source-export.mjs'
import {
  checkDefaultMasterPlanRealDurationSampleMaterialPreflight,
} from './check-default-master-plan-real-duration-sample-material-preflight.mjs'
import {
  verifyDefaultMasterPlanDurationSampleCoverage,
} from './verify-default-master-plan-duration-sample-coverage.mjs'

test('builds a no-write real duration sample source export that closes requested stableCode coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-samples-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'duration-experience-samples-export.json')
  const coverageOutput = path.join(root, 'duration-sample-coverage-evidence.json')
  const materialPreflight = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({
      stableCode: 'BTMP-SCH-05',
      title: '操场道路与校园室外配套',
      candidateReferenceDays: 75,
      durationAssetStableCode: 'outdoor_utilities',
      t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
      profileRuntimeReferenceStableCode: 'BTMP-SCH-05',
      stableCodeResolution: 'duration_asset_utilization_row',
      requestSources: ['duration_asset_utilization_runtime_reference_day_gap'],
    }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))
  await writeJson(sampleMaterial, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    sourceEvidence: {
      sourceName: 'operator_verified_completed_school_project',
      evidenceRef: 'operator-reviewed-sample-ledger:school-closeout-2026-07-05',
    },
    samples: [
      realSample({
        id: 'real-sample-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        actualDurationDays: 76,
        taskId: 'real-task-sch-05',
      }),
      realSample({
        id: 'real-sample-sch-06',
        stableCode: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        actualDurationDays: 49,
        taskId: 'real-task-sch-06',
      }),
    ],
  })

  try {
  await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
    collectionPackage,
    sampleMaterial,
    output: materialPreflight,
    checkedBy: 'release-operator-1',
    now: new Date('2026-07-05T02:09:00.000Z'),
  })
    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport({
      collectionPackage,
      sampleMaterial,
      output,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      materialPreflight,
      now: new Date('2026-07-05T02:10:00.000Z'),
    })

    assert.equal(report.status, 'ready')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 2)
    assert.equal(report.summary.exportedSampleCount, 2)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const sourceExport = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(sourceExport.schemaVersion, 'workbuddy-default-master-plan-source-export/v1')
    assert.equal(sourceExport.export_metadata.source, 'duration_experience_samples')
    assert.equal(sourceExport.export_metadata.source_kind, 'operator_supplied_real_duration_sample_material')
    assert.equal(sourceExport.export_metadata.environment, 'staging')
    assert.match(sourceExport.export_metadata.source_path, /real-duration-sample-material\.json#sha256=/)
    assert.equal(sourceExport.rows.length, 2)
    assert.match(sourceExport.export_metadata.material_preflight_ref, /real-duration-sample-material-preflight\.json#sha256=/)
    assert.equal(sourceExport.rows[0].standard_work_code, 'BTMP-SCH-05')
    assert.equal(sourceExport.rows[0].actual_duration, 76)
    assert.equal(sourceExport.rows[0].sample_status, 'accepted')
    assert.equal(sourceExport.rows[0].included_in_benchmark, true)
    assert.equal(sourceExport.rows[0].metadata.notRealProductionOutcome, false)
    assert.equal(sourceExport.rows[0].metadata.stagingControlledReplay, false)
    assert.equal(sourceExport.rows[0].metadata.businessType, 'school')
    assert.deepEqual(sourceExport.rows[0].metadata.businessTypes, ['school'])
    assert.equal(sourceExport.rows[0].metadata.durationAssetStableCode, 'outdoor_utilities')
    assert.equal(sourceExport.rows[0].metadata.t2RhythmTemplateId, 't2-school-campus-functional-phasing-rhythm-v1')
    assert.equal(sourceExport.rows[0].metadata.profileRuntimeReferenceStableCode, 'BTMP-SCH-05')
    assert.equal(sourceExport.rows[0].metadata.stableCodeResolution, 'duration_asset_utilization_row')
    assert.deepEqual(sourceExport.rows[0].metadata.requestSources, ['duration_asset_utilization_runtime_reference_day_gap'])

    const coverage = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples: output,
      output: coverageOutput,
      now: new Date('2026-07-05T02:11:00.000Z'),
    })
    assert.equal(coverage.status, 'covered')
    assert.equal(coverage.summary.coveredStableCodeCount, 2)
    assert.deepEqual(coverage.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source export when supplied material contains staging replay markers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-samples-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'duration-experience-samples-export.json')
  const coverageOutput = path.join(root, 'duration-sample-coverage-evidence.json')
  const materialPreflight = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
  ]))
  await writeJson(sampleMaterial, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    samples: [{
      ...realSample({
        id: 'staging-sample-sch-05',
        stableCode: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        actualDurationDays: 75,
        taskId: 'staging-task-sch-05',
      }),
      metadata: {
        source: 'default_master_plan_staging_runtime_writer',
        stagingControlledReplay: true,
        notRealProductionOutcome: true,
      },
    }],
  })

  try {
    await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial,
      output: materialPreflight,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-05T02:19:00.000Z'),
    })

    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport({
      collectionPackage,
      sampleMaterial,
      output,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      materialPreflight,
      now: new Date('2026-07-05T02:20:00.000Z'),
    })

    assert.equal(report.summary.exportedSampleCount, 0)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(new Set(report.blockers), new Set([
      'invalid_real_duration_sample_material_present',
      'accepted_real_duration_sample_coverage_incomplete',
      'real_duration_sample_material_preflight_not_ready',
    ]))
    assert.match(report.invalidSamples[0].blockers.join('\n'), /real_duration_sample_must_not_be_staging_controlled_replay/)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)

    const sourceExport = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(sourceExport.export_metadata.source_kind, 'blocked_real_duration_sample_material')
    assert.equal(sourceExport.export_metadata.blocked, true)
    assert.equal(sourceExport.rows.length, 0)

    const coverage = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples: output,
      output: coverageOutput,
      now: new Date('2026-07-05T02:21:00.000Z'),
    })
    assert.equal(coverage.status, 'blocked')
    assert.equal(coverage.blockers.includes('duration_samples_operator_supplied_real_duration_sample_export_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes blocked source export report when real duration sample material file is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-samples-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'duration-experience-samples-export.json')
  const materialPreflight = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '???????????', candidateReferenceDays: 75 }),
  ]))

  try {
    await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial,
      output: materialPreflight,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-05T02:29:00.000Z'),
    })

    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport({
      collectionPackage,
      sampleMaterial,
      output,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      materialPreflight,
      now: new Date('2026-07-05T02:30:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.rawSampleCount, 0)
    assert.equal(report.blockers.includes('real_duration_sample_material_file_missing'), true)
    assert.equal(report.blockers.includes('real_duration_sample_material_required'), true)
    assert.equal(report.blockers.includes('real_duration_sample_material_preflight_sample_material_ref_mismatch'), false)

    const sourceExport = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(sourceExport.export_metadata.source_kind, 'blocked_real_duration_sample_material')
    assert.equal(sourceExport.export_metadata.blocked, true)
    assert.match(sourceExport.export_metadata.source_path, /real-duration-sample-material\.json#missing/)
    assert.equal(sourceExport.rows.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes blocked source export report when real duration sample material preflight file is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-samples-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterial = path.join(root, 'real-duration-sample-material.json')
  const output = path.join(root, 'duration-experience-samples-export.json')
  const materialPreflight = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '???????????', candidateReferenceDays: 75 }),
  ]))
  await writeJson(sampleMaterial, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    samples: [realSample({
      id: 'real-sample-sch-05',
      stableCode: 'BTMP-SCH-05',
      title: '???????????',
      actualDurationDays: 76,
      taskId: 'real-task-sch-05',
    })],
  })

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport({
      collectionPackage,
      sampleMaterial,
      output,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      materialPreflight,
      now: new Date('2026-07-05T02:40:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedSampleCount, 1)
    assert.equal(report.blockers.includes('real_duration_sample_material_preflight_file_missing'), true)
    assert.equal(report.blockers.includes('real_duration_sample_material_preflight_required'), true)

    const sourceExport = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(sourceExport.export_metadata.source_kind, 'blocked_real_duration_sample_material')
    assert.match(sourceExport.export_metadata.material_preflight_ref, /real-duration-sample-material-preflight\.json#missing/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function collectionPackageFixture(sampleRequests) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    generatedAt: '2026-07-05T02:00:00.000Z',
    source: 'build-default-master-plan-duration-sample-collection-package',
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

function sampleRequest({
  stableCode,
  title,
  candidateReferenceDays,
  durationAssetStableCode,
  t2RhythmTemplateId,
  profileRuntimeReferenceStableCode,
  stableCodeResolution,
  requestSources,
}) {
  return {
    source: 'duration_asset_utilization_runtime_reference_day_gap',
    candidateRowId: stableCode,
    stableCode,
    title,
    executionLane: 'school_handover',
    executionPhase: 'acceptance_handover',
    candidateReferenceDays,
    requiredAcceptedSampleCount: 1,
    businessType: 'school',
    businessTypes: ['school'],
    durationAssetStableCode,
    t2RhythmTemplateId,
    profileRuntimeReferenceStableCode,
    stableCodeResolution,
    requestSources,
  }
}

function realSample({ id, stableCode, title, actualDurationDays, taskId }) {
  return {
    id,
    stableCode,
    title,
    actualDurationDays,
    projectId: 'project-1',
    taskId,
    startedAt: '2027-03-01',
    completedAt: '2027-05-15',
    sourceType: 'completed_task',
    sampleStatus: 'accepted',
    includedInBenchmark: true,
    evidenceRef: `operator-evidence:${id}`,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
