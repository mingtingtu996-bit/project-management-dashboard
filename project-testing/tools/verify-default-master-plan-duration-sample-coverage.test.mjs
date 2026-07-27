import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  verifyDefaultMasterPlanDurationSampleCoverage,
} from './verify-default-master-plan-duration-sample-coverage.mjs'

test('blocks when accepted real samples do not cover every collection package stableCode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-BASE-01', title: '施工准备与现场临设完成' }),
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(samples, samplesExportFixture([
    acceptedSample({ id: 'sample-1', stableCode: 'BTMP-BASE-01', actualDuration: 29 }),
    {
      ...acceptedSample({ id: 'sample-draft', stableCode: 'BTMP-SCH-05', actualDuration: 75 }),
      sample_status: 'draft',
      included_in_benchmark: false,
    },
  ]))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-04T13:10:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 2)
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(report.blockers, [
      'invalid_duration_samples_present',
      'accepted_real_duration_sample_coverage_incomplete',
    ])
    assert.equal(report.rows[0].coverageStatus, 'covered')
    assert.deepEqual(report.rows[0].acceptedSampleIds, ['sample-1'])
    assert.equal(report.rows[1].coverageStatus, 'missing_samples')
    assert.equal(report.rows[1].missingSampleCount, 1)
    assert.match(report.rows[1].sampleCollectionRequirement, /BTMP-SCH-05/)
    assert.equal(report.invalidSamples[0].id, 'sample-draft')
    assert.match(report.invalidSamples[0].blockers.join('\n'), /sample_status_must_be_active_or_accepted/)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.match(report.collectionPackageRef, /^duration_sample_collection_package:/)
    assert.match(report.sourceEvidenceRef, /^duration_experience_samples_export:/)
    assert.match(report.sourceEvidenceRef, /#sha256=/)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.summary.missingStableCodeCount, 1)
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /accepted_real_duration_sample_coverage_incomplete/)
    assert.match(markdown, /操场道路与校园室外配套/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks collection package coverage verified when every requested stableCode has accepted real samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-BASE-01', title: '施工准备与现场临设完成' }),
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(samples, samplesExportFixture([
    acceptedSample({ id: 'sample-1', stableCode: 'BTMP-BASE-01', actualDuration: 29 }),
    acceptedSample({ id: 'sample-2', stableCode: 'BTMP-SCH-05', actualDuration: 76 }),
  ]))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-04T13:20:00.000Z'),
    })

    assert.equal(report.status, 'covered')
    assert.equal(report.evidenceLevel, 'sample_collection_coverage_verified_l2')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.requiredStableCodeCount, 2)
    assert.equal(report.summary.coveredStableCodeCount, 2)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.summary.acceptedMatchedSampleCount, 2)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.rows.every((row) => row.coverageStatus === 'covered'), true)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'covered')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks database-table duration exports from closing operator real sample coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(samples, samplesExportFixture([
    acceptedSample({ id: 'sample-db-sch-05', stableCode: 'BTMP-SCH-05', actualDuration: 76 }),
  ], { sourceKind: 'database_table' }))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-05T07:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.summary.invalidSampleCount, 0)
    assert.deepEqual(report.blockers, ['duration_samples_operator_supplied_real_duration_sample_export_required'])
    assert.equal(report.sourceEvidence.sourceKind, 'database_table')
    assert.deepEqual(report.sourceEvidence.acceptedSourceKinds, ['operator_supplied_real_duration_sample_material'])

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /duration_samples_operator_supplied_real_duration_sample_export_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not mark coverage verified when the collection package has non-sample blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, {
    ...collectionPackageFixture([
      sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
    ]),
    status: 'blocked',
    blockers: [
      'duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review',
      'accepted_real_duration_samples_required',
    ],
  })
  await writeJson(samples, samplesExportFixture([
    acceptedSample({ id: 'sample-1', stableCode: 'BTMP-SCH-05', actualDuration: 76 }),
  ]))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-04T13:25:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.evidenceLevel, 'sample_collection_coverage_blocked_l1')
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(
      report.blockers.includes('duration_sample_collection_package_duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review'),
      true,
    )
    assert.equal(report.blockers.includes('accepted_real_duration_sample_coverage_incomplete'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects staging controlled replay samples as accepted real duration coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(samples, samplesExportFixture([
    {
      ...acceptedSample({ id: 'sample-staging-replay', stableCode: 'BTMP-SCH-05', actualDuration: 75 }),
      metadata: {
        source: 'default_master_plan_staging_runtime_writer',
        stagingControlledReplay: true,
        notRealProductionOutcome: true,
      },
    },
  ]))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-04T13:30:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.coveredStableCodeCount, 0)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(report.rows[0].acceptedSampleIds, [])
    assert.equal(report.rows[0].coverageStatus, 'missing_samples')
    assert.equal(report.invalidSamples[0].id, 'sample-staging-replay')
    assert.match(report.invalidSamples[0].blockers.join('\n'), /real_duration_sample_must_not_be_staging_controlled_replay/)
    assert.match(report.invalidSamples[0].blockers.join('\n'), /real_duration_sample_must_not_be_marked_not_real_production_outcome/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks covered evidence when the duration sample export contains non-real replay samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-coverage-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const samples = path.join(root, 'duration-experience-samples-export.json')
  const output = path.join(root, 'duration-sample-coverage-evidence.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套' }),
  ]))
  await writeJson(samples, samplesExportFixture([
    acceptedSample({ id: 'sample-real', stableCode: 'BTMP-SCH-05', actualDuration: 76 }),
    {
      ...acceptedSample({ id: 'sample-staging-other', stableCode: 'BTMP-BASE-12', actualDuration: 60 }),
      metadata: {
        source: 'default_master_plan_staging_runtime_writer',
        stagingControlledReplay: true,
        notRealProductionOutcome: true,
      },
    },
  ]))

  try {
    const report = await verifyDefaultMasterPlanDurationSampleCoverage({
      collectionPackage,
      samples,
      output,
      now: new Date('2026-07-04T13:40:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(report.blockers, ['invalid_duration_samples_present'])
    assert.equal(report.rows[0].coverageStatus, 'covered')
    assert.deepEqual(report.rows[0].acceptedSampleIds, ['sample-real'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function collectionPackageFixture(sampleRequests) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    generatedAt: '2026-07-04T12:00:00.000Z',
    source: 'build-default-master-plan-duration-sample-collection-package',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: sampleRequests.length,
    totalRequiredAcceptedSampleCount: sampleRequests.reduce((sum, row) => sum + row.requiredAcceptedSampleCount, 0),
    profileRuntimeReferenceSampleRequestCount: sampleRequests.length,
    sampleRequests,
    blockers: ['accepted_real_duration_samples_required'],
    mutationBoundary: {
      readsDurationGapPlan: true,
      readsProfileReport: true,
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }
}

function sampleRequest({ stableCode, title }) {
  return {
    source: 'profile_runtime_reference_day_gap',
    candidateRowId: stableCode,
    stableCode,
    title,
    executionLane: 'school_handover',
    executionPhase: 'acceptance_handover',
    candidateReferenceDays: 75,
    acceptedSampleCount: 0,
    requiredAcceptedSampleCount: 1,
    collectionRequirement: `Collect accepted real completed-project duration sample(s) for ${stableCode} (${title}).`,
    businessType: 'school',
    businessTypes: ['school'],
  }
}

function samplesExportFixture(samples, { sourceKind = 'operator_supplied_real_duration_sample_material' } = {}) {
  return {
    export_metadata: {
      source: 'duration_experience_samples',
      source_kind: sourceKind,
      exported_at: '2026-07-04T13:00:00.000Z',
      exported_by: 'duration-evidence-exporter',
      environment: 'staging',
    },
    duration_experience_samples: samples,
  }
}

function acceptedSample({ id, stableCode, actualDuration }) {
  return {
    id,
    source_table: 'duration_experience_samples',
    source_type: 'completed_task',
    standard_work_code: stableCode,
    actual_duration: actualDuration,
    sample_status: 'active',
    included_in_benchmark: true,
    project_id: 'project-1',
    task_id: `task-${id}`,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
