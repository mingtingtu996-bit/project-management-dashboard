import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  planDefaultMasterPlanDurationSampleGaps,
} from './plan-default-master-plan-duration-sample-gaps.mjs'

test('reports candidate WBS rows missing accepted real duration samples without writing production state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const samplesPath = path.join(root, 'duration-samples.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, candidateBaseline([
    candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 30 }),
    candidateRow({ index: 2, code: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交', referenceDays: 100 }),
  ]))
  await writeJson(samplesPath, withExportMetadata({
    duration_experience_samples: [
      acceptedSample({ id: 'sample-1', code: 'BTMP-BASE-01', actualDuration: 29 }),
      {
        ...acceptedSample({ id: 'sample-draft', code: 'BTMP-SCH-01', actualDuration: 101 }),
        sample_status: 'draft',
        included_in_benchmark: false,
      },
    ],
  }))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      samples: samplesPath,
      output: outputPath,
      now: new Date('2026-07-02T03:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.evidenceLevel, 'sample_gap_planning_only')
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.summary.candidateRowCount, 2)
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.deepEqual(report.blockers, ['duration_sample_coverage_incomplete'])
    assert.equal(report.rows[0].coverageStatus, 'covered')
    assert.equal(report.rows[0].acceptedSampleIds[0], 'sample-1')
    assert.equal(report.rows[1].coverageStatus, 'missing_samples')
    assert.equal(report.rows[1].missingSampleCount, 1)
    assert.match(report.rows[1].sampleCollectionRequirement, /BTMP-SCH-01/)
    assert.equal(report.invalidSamples[0].id, 'sample-draft')
    assert.match(report.invalidSamples[0].blockers.join('\n'), /sample_status_must_be_active_or_accepted/)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.match(report.sourceEvidenceRef, /^duration_experience_samples_export:/)
    assert.match(report.sourceEvidenceRef, /#sha256=/)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.schemaVersion, 'workbuddy-default-master-plan-duration-sample-gap-plan/v1')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /duration_sample_coverage_incomplete/)
    assert.match(markdown, /教学楼主体结构与功能区移交/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('plans sample requirements from the candidate baseline when no duration sample export exists yet', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, candidateBaseline([
    candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 30 }),
  ]))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      output: outputPath,
      now: new Date('2026-07-02T03:05:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceEvidenceRef, 'duration_experience_samples_export:missing')
    assert.deepEqual(report.blockers, [
      'duration_samples_export_required',
      'duration_sample_coverage_incomplete',
    ])
    assert.equal(report.summary.candidateRowCount, 1)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.rows[0].sampleCollectionRequirement.includes('BTMP-BASE-01'), true)
    assert.equal(report.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses candidate refresh package target rows as the gap-planning surface when provided', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, candidateBaseline([
    candidateRow({ index: 1, code: 'BTMP-OLD-01', title: '旧候选行', referenceDays: 30 }),
  ]))
  await writeJson(refreshPackagePath, candidateRefreshPackage([
    candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 56 }),
    candidateRow({ index: 2, code: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', referenceDays: 95 }),
  ]))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      candidateRefreshPackage: refreshPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T03:08:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.candidateRowCount, 2)
    assert.equal(report.summary.gapPlanningSurface, 'candidate_refresh_package_target_replacement_rows')
    assert.equal(report.rows[0].stableCode, 'BTMP-BASE-01')
    assert.equal(report.rows[1].stableCode, 'BTMP-SCH-02')
    assert.equal(report.rows[1].title, '教学楼二次结构与普通教室粗装修')
    assert.equal(report.rows.some((row) => row.stableCode === 'BTMP-OLD-01'), false)
    assert.match(report.candidateRefreshPackageRef, /^candidate_refresh_package:/)
    assert.match(report.candidateRefreshPackageRef, /#sha256=/)
    assert.equal(report.mutationBoundary.readsCandidateRefreshPackage, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks the sample gap plan ready for duration calibration evidence when every candidate stable code is covered', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const samplesPath = path.join(root, 'duration-samples.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, candidateBaseline([
    candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 30 }),
    candidateRow({ index: 2, code: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交', referenceDays: 100 }),
  ]))
  await writeJson(samplesPath, withExportMetadata({
    samples: [
      acceptedSample({ id: 'sample-1', code: 'BTMP-BASE-01', actualDuration: 29 }),
      acceptedSample({ id: 'sample-2', code: 'BTMP-SCH-01', actualDuration: 103 }),
    ],
  }))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      samples: samplesPath,
      output: outputPath,
      now: new Date('2026-07-02T03:10:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_duration_calibration_evidence')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.missingStableCodeCount, 0)
    assert.equal(report.summary.acceptedMatchedSampleCount, 2)
    assert.equal(report.blockers.length, 0)
    assert.equal(report.rows.every((row) => row.coverageStatus === 'covered'), true)
    assert.equal(report.nextAction.builder, 'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs')
    assert.equal(report.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks staging controlled replay samples from closing duration sample gaps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const samplesPath = path.join(root, 'duration-samples.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, candidateBaseline([
    candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 30 }),
  ]))
  await writeJson(samplesPath, withExportMetadata({
    samples: [
      {
        ...acceptedSample({ id: 'sample-staging-replay', code: 'BTMP-BASE-01', actualDuration: 30 }),
        metadata: {
          stagingControlledReplay: true,
          notRealProductionOutcome: true,
          source: 'default_master_plan_staging_runtime_writer',
        },
      },
    ],
  }))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      samples: samplesPath,
      output: outputPath,
      now: new Date('2026-07-02T03:12:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.coveredStableCodeCount, 0)
    assert.equal(report.summary.missingStableCodeCount, 1)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.equal(report.rows[0].acceptedSampleCount, 0)
    assert.equal(report.rows[0].coverageStatus, 'missing_samples')
    assert.deepEqual(report.invalidSamples[0].blockers, [
      'real_duration_sample_must_not_be_staging_controlled_replay',
      'real_duration_sample_must_not_be_marked_not_real_production_outcome',
      'real_duration_sample_source_must_not_be_staging_runtime_writer',
    ])
    assert.match(report.blockers.join('\n'), /duration_sample_coverage_incomplete/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample gap planning when the candidate baseline hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-gaps-'))
  const baselinePath = path.join(root, 'candidate-baseline.json')
  const samplesPath = path.join(root, 'duration-samples.json')
  const outputPath = path.join(root, 'duration-sample-gaps.json')

  await writeJson(baselinePath, {
    ...candidateBaseline([
      {
        ...candidateRow({ index: 1, code: 'BTMP-BASE-01', title: '施工准备与现场临设完成', referenceDays: 30 }),
        sourceLineage: [
          { sourceKind: 'legacy_template_reverse_inference' },
        ],
      },
    ]),
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
  })
  await writeJson(samplesPath, withExportMetadata({
    samples: [
      acceptedSample({ id: 'sample-1', code: 'BTMP-BASE-01', actualDuration: 29 }),
    ],
  }))

  try {
    const report = await planDefaultMasterPlanDurationSampleGaps({
      candidateBaseline: baselinePath,
      samples: samplesPath,
      output: outputPath,
      now: new Date('2026-07-02T03:15:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.match(report.blockers.join('\n'), /candidate_baseline_retired_or_low_information_default_master_plan_source/)
    assert.equal(report.summary.coveredStableCodeCount, 1)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function candidateBaseline(rows) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rowCount: rows.length,
    rows,
  }
}

function candidateRefreshPackage(targetReplacementRows) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    targetReplacementRows,
  }
}

function candidateRow({ index, code, title, referenceDays }) {
  return {
    index,
    id: `row-${index}`,
    title,
    standardWorkCode: code,
    executionLane: index === 1 ? 'site_preparation' : 'teaching_building',
    executionPhase: index === 1 ? 'startup_site_setup' : 'superstructure_rhythm',
    scheduleParticipation: 'primary_schedule',
    smartReferenceDays: referenceDays,
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
  }
}

function acceptedSample({ id, code, actualDuration }) {
  return {
    id,
    source_table: 'duration_experience_samples',
    source_type: 'completed_task',
    standard_work_code: code,
    actual_duration: actualDuration,
    sample_status: 'active',
    included_in_benchmark: true,
    project_id: 'project-1',
    task_id: `task-${id}`,
  }
}

function withExportMetadata(payload) {
  return {
    export_metadata: {
      source: 'duration_experience_samples',
      exported_at: '2026-07-02T02:00:00.000Z',
      exported_by: 'duration-evidence-exporter',
      environment: 'staging',
    },
    ...payload,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
