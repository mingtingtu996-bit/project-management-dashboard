import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')

test('blocks duration calibration evidence when exported samples are not benchmark-accepted real outcomes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, withExportMetadata({
    samples: [
      {
        id: 'sample-ignored',
        standard_work_code: '01-01',
        actual_duration: 0,
        sample_status: 'draft',
        included_in_benchmark: false,
      },
    ],
  }, 'duration_experience_samples'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.evidenceLevel, 'candidate_asset_backed_l1')
    assert.deepEqual(evidence.blockers, [
      'duration_sample_coverage_evidence_required',
      'accepted_real_duration_samples_required',
    ])
    assert.equal(evidence.acceptedRealDurationSampleCount, 0)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds runtime-calibrated duration evidence from benchmark-accepted duration experience samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const samplesPath = path.join(root, 'samples.json')
  const coveragePath = path.join(root, 'coverage.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(samplesPath, withExportMetadata({
    samples: [
      benchmarkSample({ id: 'sample-1', stableCode: '01-01', actualDuration: 8, coldStartDays: 7 }),
      benchmarkSample({ id: 'sample-2', stableCode: '01-01', actualDuration: 10, coldStartDays: 7 }),
      benchmarkSample({ id: 'sample-3', stableCode: '01-01', actualDuration: 12, coldStartDays: 7 }),
      benchmarkSample({ id: 'sample-4', stableCode: '01-02', actualDuration: 16, coldStartDays: 14 }),
    ],
  }, 'duration_experience_samples'))
  await writeJson(coveragePath, coverageEvidenceFixture({
    rows: [
      coverageRow('01-01', ['sample-1', 'sample-2', 'sample-3']),
      coverageRow('01-02', ['sample-4']),
    ],
  }))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--coverage-evidence',
      coveragePath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'runtime_calibrated')
    assert.equal(evidence.evidenceLevel, 'runtime_calibrated_l2')
    assert.equal(evidence.acceptedRealDurationSampleCount, 4)
    assert.equal(evidence.calibratedReferenceDayCount, 2)
    assert.equal(evidence.calibrationDeltaCount, 2)
    assert.equal(evidence.runtimeReferenceDays[0].source, 'accepted_real_project_outcome')
    assert.match(evidence.sourceEvidenceRef, /^duration_experience_samples_export:/)
    assert.match(evidence.coverageEvidenceRef, /^duration_sample_coverage_evidence:/)
    assert.match(evidence.coverageEvidenceRef, /#sha256=[a-f0-9]{64}$/)
    assert.equal(evidence.mutationBoundary.readsDurationSampleCoverageEvidence, true)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--duration-calibration-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const durationGate = report.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')
    const pmGate = report.gates.find((gate) => gate.id === 'project_manager_review_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(durationGate.status, 'pass')
    assert.equal(pmGate.status, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration calibration evidence when accepted samples are outside verified sample coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const coveragePath = path.join(root, 'coverage.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, withExportMetadata({
    samples: [
      benchmarkSample({ id: 'sample-extra', stableCode: 'UNREQUESTED-CODE', actualDuration: 8, coldStartDays: 7 }),
    ],
  }, 'duration_experience_samples'))
  await writeJson(coveragePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:package.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceEvidenceRef: 'duration_experience_samples_export:samples.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rows: [
      {
        stableCode: '01-01',
        acceptedSampleIds: ['sample-1'],
        coverageStatus: 'covered',
      },
    ],
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--coverage-evidence',
      coveragePath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.evidenceLevel, 'candidate_asset_backed_l1')
    assert.match(evidence.coverageEvidenceRef, /^duration_sample_coverage_evidence:/)
    assert.match(evidence.coverageEvidenceRef, /#sha256=[a-f0-9]{64}$/)
    assert.match(evidence.blockers.join('\n'), /duration_calibration_samples_must_match_covered_sample_requests/)
    assert.equal(evidence.calibratedReferenceDayCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration calibration evidence when the source export lacks auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, {
    samples: [
      benchmarkSample({ id: 'sample-1', stableCode: '01-01', actualDuration: 8, coldStartDays: 7 }),
      benchmarkSample({ id: 'sample-2', stableCode: '01-01', actualDuration: 10, coldStartDays: 7 }),
    ],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /duration_samples_metadata_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration calibration evidence when accepted samples hide retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, withExportMetadata({
    samples: [
      {
        ...benchmarkSample({ id: 'sample-1', stableCode: '01-01', actualDuration: 8, coldStartDays: 7 }),
        sourceMetadata: {
          sourceLineage: [
            { scenarioSource: 'manual_comparison_scenario' },
          ],
        },
      },
    ],
  }, 'duration_experience_samples'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.evidenceLevel, 'candidate_asset_backed_l1')
    assert.match(evidence.blockers.join('\n'), /duration_samples_retired_or_low_information_default_master_plan_source/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration calibration evidence when accepted samples do not belong to the target project or lack runtime task identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, {
    samples: [
      benchmarkSample({
        id: 'sample-other-project',
        stableCode: '01-01',
        actualDuration: 8,
        coldStartDays: 7,
        projectId: 'project-from-other-chain',
      }),
      benchmarkSample({
        id: 'sample-missing-task',
        stableCode: '01-02',
        actualDuration: 12,
        coldStartDays: 10,
        taskId: '',
      }),
    ],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.evidenceLevel, 'candidate_asset_backed_l1')
    assert.match(evidence.blockers.join('\n'), /duration_sample_project_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /duration_sample_task_identity_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration calibration evidence when accepted samples come from staging controlled replay', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-calibration-'))
  const samplesPath = path.join(root, 'samples.json')
  const outputPath = path.join(root, 'duration-evidence.json')

  await writeJson(samplesPath, withExportMetadata({
    samples: [
      benchmarkSample({
        id: 'sample-staging-replay',
        stableCode: 'BTMP-SCH-05',
        actualDuration: 75,
        coldStartDays: 75,
        metadata: {
          source: 'default_master_plan_staging_runtime_writer',
          stagingControlledReplay: true,
          notRealProductionOutcome: true,
        },
      }),
    ],
  }, 'duration_experience_samples'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--samples',
      samplesPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--calibrated-by',
      'duration-governance-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.evidenceLevel, 'candidate_asset_backed_l1')
    assert.equal(evidence.acceptedRealDurationSampleCount, 0)
    assert.equal(evidence.calibratedReferenceDayCount, 0)
    assert.match(evidence.blockers.join('\n'), /real_duration_sample_must_not_be_staging_controlled_replay/)
    assert.match(evidence.blockers.join('\n'), /real_duration_sample_must_not_be_marked_not_real_production_outcome/)
    assert.match(evidence.blockers.join('\n'), /real_duration_sample_source_must_not_be_staging_runtime_writer/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function benchmarkSample({ id, stableCode, actualDuration, coldStartDays, projectId = 'project-1', taskId, metadata }) {
  return {
    id,
    source_table: 'duration_experience_samples',
    standard_work_code: stableCode,
    actual_duration: actualDuration,
    cold_start_reference_days: coldStartDays,
    sample_status: 'active',
    included_in_benchmark: true,
    sample_strength: 'strong',
    source_type: 'completed_task',
    project_id: projectId,
    task_id: taskId === undefined ? `task-${id}` : taskId,
    ...(metadata ? { metadata } : {}),
  }
}

function coverageEvidenceFixture({ rows }) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:package.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceEvidenceRef: 'duration_experience_samples_export:samples.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rows,
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

function coverageRow(stableCode, acceptedSampleIds) {
  return {
    stableCode,
    acceptedSampleIds,
    coverageStatus: 'covered',
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function withExportMetadata(payload, source) {
  return {
    export_metadata: {
      source,
      exported_at: '2026-07-01T08:00:00.000Z',
      exported_by: 'evidence-exporter-1',
      environment: 'staging',
    },
    ...payload,
  }
}

async function writeProfileReport(filePath) {
  await writeJson(filePath, {
    businessTypes: [
      'hotel',
      'hospital',
      'school',
      'industrial',
      'data_center',
      'transportation_hub',
      'sports_culture',
      'tod_upper_cover',
      'renovation',
      'modular_building',
    ].map((businessType, index) => ({
      businessType,
      scheduleRowCount: 32 + index,
      profileRowCount: 4,
      profilePhaseAnchorRowCount: 1,
      reviewStatus: 'candidate_master_plan_reviewable',
      profileDurationEvidenceReady: true,
      gaps: [],
    })),
  })
}

async function writeResidentialReport(filePath) {
  await writeFile(filePath, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
}
