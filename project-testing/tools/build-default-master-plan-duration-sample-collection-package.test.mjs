import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanDurationSampleCollectionPackage,
  parseArgs,
} from './build-default-master-plan-duration-sample-collection-package.mjs'

test('builds a no-write duration sample collection package from a gap plan', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, durationGapFixture())

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T06:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-duration-sample-collection-package/v1')
    assert.equal(report.status, 'samples_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.requiredStableCodeCount, 2)
    assert.equal(report.totalRequiredAcceptedSampleCount, 3)
    assert.equal(report.sampleRequests.length, 2)
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-BASE-01', 'BTMP-BASE-02'])
    assert.equal(report.sampleRequests[0].requiredAcceptedSampleCount, 1)
    assert.equal(report.sampleRequests[1].requiredAcceptedSampleCount, 2)
    assert.deepEqual(report.requiredSourceFields, [
      'project_id',
      'task_id or runtime_task_id',
      'standard_work_code or stableCode',
      'actual_duration',
      'sample_status=active|accepted',
      'included_in_benchmark=true',
      'source_type=completed_task',
    ])
    assert.match(report.nextCommands.reviewDurationSourceExport, /--phase review-duration/)
    assert.match(report.nextCommands.reviewDurationSourceExport, /source-exports-manifest\.review-duration\.json/)
    assert.match(report.nextCommands.rebuildFullSourceManifestFromExistingExports, /--phase all/)
    assert.match(report.nextCommands.rebuildFullSourceManifestFromExistingExports, /--review-export .*candidate-default-master-plan-review-export\.json/)
    assert.match(report.nextCommands.rebuildFullSourceManifestFromExistingExports, /--runtime-publications .*wbs-template-runtime-publications-export\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialTemplate, /evidence:default-master-plan:real-duration-sample-template/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialTemplate, /--collection-package .*duration-sample-collection-package\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialTemplate, /--real-evidence-gap-summary .*real-evidence-gap-summary\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialTemplate, /--collection-kit-output .*real-duration-sample-collection-kit\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialTemplate, /--output .*real-duration-sample-material\.template\.json/)
    assert.match(report.nextCommands.buildCompletedTaskExport, /evidence:default-master-plan:completed-task-export/)
    assert.match(report.nextCommands.buildCompletedTaskExport, /--raw-tasks .*raw-completed-tasks\.json/)
    assert.match(report.nextCommands.buildCompletedTaskExport, /--output .*completed-task-export\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialFromTaskExport, /evidence:default-master-plan:real-duration-sample-from-task-export/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialFromTaskExport, /--completed-task-export .*completed-task-export\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleMaterialFromTaskExport, /--output .*real-duration-sample-material\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleSourceExport, /evidence:default-master-plan:real-duration-sample-export/)
    assert.match(report.nextCommands.buildRealDurationSampleSourceExport, /--sample-material .*real-duration-sample-material\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleSourceExport, /--material-preflight .*real-duration-sample-material-preflight\.json/)
    assert.match(report.nextCommands.buildRealDurationSampleSourceExport, /--output .*duration-experience-samples-export\.json/)
    assert.match(report.nextCommands.refreshGapPlan, /evidence:default-master-plan:duration-gaps/)
    assert.equal(report.realDurationSampleMaterialContract.schemaVersion, 'workbuddy-real-duration-sample-material/v1')
    assert.equal(report.realDurationSampleMaterialContract.path, 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json')
    assert.deepEqual(report.realDurationSampleMaterialContract.requiredFields, [
      'id',
      'stableCode or standard_work_code',
      'title or standard_work_name',
      'actualDurationDays or actual_duration',
      'projectId',
      'taskId or runtime_task_id',
      'sourceType=completed_task',
      'sampleStatus=accepted|active',
      'includedInBenchmark=true',
      'evidenceRef',
    ])
    assert.equal(report.realDurationSampleMaterialContract.noWriteBoundary, 'operator_supplied_material_only_no_db_write')
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.sampleRequests.length, 2)
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /BTMP-BASE-01/)
    assert.match(markdown, /施工准备/)
    assert.match(markdown, /real-duration-sample-material\.json/)
    assert.match(markdown, /real-duration-sample-material\.template\.json/)
    assert.match(markdown, /completed-task-export/)
    assert.match(markdown, /real-duration-sample-from-task-export/)
    assert.match(markdown, /real-duration-sample-export/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks the collection package covered when the gap plan has no missing sample rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'row-1',
      title: '施工准备',
      stableCode: 'BTMP-BASE-01',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      output,
      now: new Date('2026-07-02T06:05:00.000Z'),
    })

    assert.equal(report.status, 'covered')
    assert.equal(report.requiredStableCodeCount, 0)
    assert.equal(report.sampleRequests.length, 0)
    assert.deepEqual(report.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('merges profile runtime reference-day gaps into the no-write sample collection package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    rows: [
      {
        index: 1,
        id: 'row-1',
        title: '施工准备',
        stableCode: 'BTMP-BASE-01',
        executionLane: 'site_preparation',
        executionPhase: 'startup_site_setup',
        candidateReferenceDays: 30,
        requiredAcceptedSampleCount: 1,
        acceptedSampleCount: 0,
        missingSampleCount: 1,
        coverageStatus: 'missing_samples',
        sampleCollectionRequirement: 'Collect at least 1 accepted completed-task duration sample(s) for BTMP-BASE-01 (施工准备).',
      },
    ],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'hotel',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'hotel',
            code: 'BTMP-BASE-01',
            title: '通用准备复用缺口',
            executionLane: 'site_preparation',
            executionPhase: 'startup_site_setup',
            requiredRuntimeReferenceStableCode: 'BTMP-BASE-01',
            selectedDurationDays: 30,
            sampleCollectionRequirement: 'Collect accepted real completed-project duration sample(s) for BTMP-BASE-01.',
            mutationBoundary: 'candidate_gap_planning_only_no_business_fact_write',
          },
          {
            rowGroup: 'profile',
            businessType: 'hotel',
            code: 'BTMP-HTL-02',
            title: '客房层批量精装与卫浴安装',
            executionLane: 'guestroom_fitout',
            executionPhase: 'interior_fitout_terminal',
            requiredRuntimeReferenceStableCode: 'BTMP-HTL-02',
            durationAssetStableCode: 'interior_unit_finish',
            selectedDurationDays: 150,
            t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
            sampleCollectionRequirement: 'Collect accepted real completed-project duration sample(s) for BTMP-HTL-02.',
            mutationBoundary: 'candidate_gap_planning_only_no_business_fact_write',
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      now: new Date('2026-07-02T06:08:00.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.equal(report.durationGapPlanSampleRequestCount, 1)
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 2)
    assert.equal(report.requiredStableCodeCount, 2)
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-BASE-01', 'BTMP-HTL-02'])
    assert.deepEqual(report.sampleRequests[0].requestSources.sort(), [
      'duration_sample_gap_plan',
      'profile_runtime_reference_day_gap',
    ])
    assert.deepEqual(report.sampleRequests[1].businessTypes, ['hotel'])
    assert.equal(report.sampleRequests[1].durationAssetStableCode, 'interior_unit_finish')
    assert.match(report.profileReportRef, /^default_master_plan_profile_report:/)
    assert.equal(report.mutationBoundary.readsProfileReport, true)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /profile_runtime_reference_day_gap/)
    assert.match(markdown, /BTMP-HTL-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('scopes profile runtime reference-day gaps to the target candidate business type', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    candidateBaselineRef: 'candidate_baseline_export:project-testing/reports/default-master-plan-production-readiness/candidate-baseline-baseline-1-school-items.json#sha256=test',
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'row-1',
      title: '教学楼主体结构与功能区移交',
      stableCode: 'BTMP-SCH-01',
      businessType: 'school',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'hotel',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'hotel',
            code: 'BTMP-HTL-02',
            title: '客房层批量精装与卫浴安装',
            executionLane: 'guestroom_fitout',
            executionPhase: 'interior_fitout_terminal',
            requiredRuntimeReferenceStableCode: 'BTMP-HTL-02',
            selectedDurationDays: 150,
          },
        ],
      },
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'school',
            code: 'BTMP-SCH-07',
            title: '开学移交专项准备',
            executionLane: 'school_handover',
            executionPhase: 'acceptance_handover',
            requiredRuntimeReferenceStableCode: 'BTMP-SCH-07',
            selectedDurationDays: 24,
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      now: new Date('2026-07-02T06:09:00.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.deepEqual(report.targetBusinessTypes, ['school'])
    assert.equal(report.durationGapPlanSampleRequestCount, 0)
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 1)
    assert.equal(report.profileRuntimeReferenceExcludedCount, 1)
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-SCH-07'])
    assert.deepEqual(report.sampleRequests[0].businessTypes, ['school'])

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(written.targetBusinessTypes, ['school'])
    assert.equal(written.profileRuntimeReferenceExcludedCount, 1)
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /targetBusinessTypes: school/)
    assert.doesNotMatch(markdown, /BTMP-HTL-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('can collect runtime reference-day gaps for every profile business type despite a scoped candidate gap plan', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-all-profiles-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    candidateBaselineRef: 'candidate_baseline_export:project-testing/reports/default-master-plan-production-readiness/candidate-baseline-baseline-1-school-items.json#sha256=test',
    targetBusinessType: 'school',
    rows: [],
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'hotel',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'hotel',
            code: 'BTMP-HTL-02',
            title: '客房层批量精装与卫浴安装',
            executionLane: 'guestroom_fitout',
            executionPhase: 'interior_fitout_terminal',
            requiredRuntimeReferenceStableCode: 'BTMP-HTL-02',
            selectedDurationDays: 150,
          },
        ],
      },
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'school',
            code: 'BTMP-SCH-06',
            title: '竣工验收与开学移交准备',
            executionLane: 'school_handover',
            executionPhase: 'acceptance_handover',
            requiredRuntimeReferenceStableCode: 'BTMP-SCH-06',
            selectedDurationDays: 48,
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      profileScope: 'all',
      now: new Date('2026-07-02T06:09:10.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.deepEqual(report.targetBusinessTypes, [])
    assert.equal(report.profileRuntimeReferenceScopePolicy, 'all_profile_business_types')
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 2)
    assert.equal(report.profileRuntimeReferenceExcludedCount, 0)
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-HTL-02', 'BTMP-SCH-06'])
    assert.deepEqual(report.sampleRequests.flatMap((row) => row.businessTypes).sort(), ['hotel', 'school'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile-only all scope ignores stale candidate gap-plan blockers and rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-profile-only-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'blocked',
    targetBusinessType: 'school',
    rows: [{
      index: 1,
      id: '',
      title: 'stale row with missing stable code',
      stableCode: '',
      coverageStatus: 'missing_samples',
      missingSampleCount: 1,
    }],
    blockers: ['candidate_refresh_required_before_duration_gap_planning'],
    comparisonBasis: ['manual_comparison_scenario'],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'hotel',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'hotel',
            code: 'BTMP-HTL-02',
            title: '客房层批量精装与卫浴安装',
            executionLane: 'guestroom_fitout',
            executionPhase: 'interior_fitout_terminal',
            requiredRuntimeReferenceStableCode: 'BTMP-HTL-02',
            selectedDurationDays: 150,
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      profileScope: 'all',
      useDurationGapPlanRows: false,
      now: new Date('2026-07-02T06:09:20.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.equal(report.durationGapPlanSampleRequestCount, 0)
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 1)
    assert.deepEqual(report.blockers, ['accepted_real_duration_samples_required'])
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-HTL-02'])
    assert.equal(report.sourceGuards.durationGapPlan.ignoredForProfileOnlyAllScope, true)
    assert.equal(report.mutationBoundary.readsDurationGapPlan, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile-only all scope uses explicit handoff identity instead of stale gap-plan identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-profile-only-identity-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    baselineId: 'stale-baseline',
    projectId: 'stale-project',
    targetBusinessType: 'school',
    rows: [{
      index: 1,
      id: 'stale-row',
      title: 'stale covered row',
      stableCode: 'BTMP-SCH-01',
      coverageStatus: 'covered',
      missingSampleCount: 0,
    }],
    blockers: ['candidate_refresh_required_before_duration_gap_planning'],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'school',
            code: 'BTMP-SCH-06',
            title: '竣工验收与开学移交准备',
            executionLane: 'school_handover',
            executionPhase: 'acceptance_handover',
            requiredRuntimeReferenceStableCode: 'BTMP-SCH-06',
            selectedDurationDays: 48,
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      durationAssetUtilizationReport: '',
      output,
      profileScope: 'all',
      useDurationGapPlanRows: false,
      baselineId: 'handoff-baseline',
      projectId: 'handoff-project',
      now: new Date('2026-07-02T06:09:25.000Z'),
    })

    assert.equal(report.baselineId, 'handoff-baseline')
    assert.equal(report.projectId, 'handoff-project')

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.baselineId, 'handoff-baseline')
    assert.equal(written.projectId, 'handoff-project')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses candidate row stableCode when a target profile gap matches an existing candidate row by work identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'candidate-row-1',
      title: '操场道路与校园室外配套',
      stableCode: 'BTMP-SCH-03',
      businessType: 'school',
      executionLane: 'campus_outdoor',
      executionPhase: 'outdoor_municipal_landscape',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [
          {
            rowGroup: 'profile',
            businessType: 'school',
            code: 'BTMP-SCH-05',
            title: '操场道路与校园室外配套',
            executionLane: 'campus_outdoor',
            executionPhase: 'outdoor_municipal_landscape',
            requiredRuntimeReferenceStableCode: 'BTMP-SCH-05',
            selectedDurationDays: 75,
          },
        ],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      now: new Date('2026-07-02T06:09:30.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 1)
    assert.equal(report.sampleRequests[0].stableCode, 'BTMP-SCH-03')
    assert.equal(report.sampleRequests[0].profileRuntimeReferenceStableCode, 'BTMP-SCH-05')
    assert.equal(report.sampleRequests[0].stableCodeResolution, 'candidate_gap_plan_row_match')
    assert.match(report.sampleRequests[0].collectionRequirement, /candidate stableCode BTMP-SCH-03/)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /BTMP-SCH-03/)
    assert.doesNotMatch(markdown, /\| profile_runtime_reference_day_gap \| BTMP-SCH-05 \|/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('adds duration asset utilization missing runtime reference rows as exact sample requests', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const durationAssetUtilizationReport = path.join(root, 'duration-asset-utilization-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    targetBusinessType: 'school',
    summary: {
      candidateRowCount: 2,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 2,
    },
    rows: [
      {
        index: 1,
        id: 'candidate-row-1',
        title: '操场道路与校园室外配套',
        stableCode: 'BTMP-SCH-03',
        businessType: 'school',
        executionLane: 'campus_outdoor',
        executionPhase: 'outdoor_municipal_landscape',
        coverageStatus: 'covered',
        missingSampleCount: 0,
        requiredAcceptedSampleCount: 1,
        acceptedSampleCount: 1,
      },
      {
        index: 2,
        id: 'candidate-row-2',
        title: '竣工验收与开学移交准备',
        stableCode: 'BTMP-SCH-04',
        businessType: 'school',
        executionLane: 'school_handover',
        executionPhase: 'acceptance_handover',
        coverageStatus: 'covered',
        missingSampleCount: 0,
        requiredAcceptedSampleCount: 1,
        acceptedSampleCount: 1,
      },
    ],
    blockers: [],
  })
  await writeJson(durationAssetUtilizationReport, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_asset_utilization_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    rows: [
      durationAssetUtilizationRow({
        index: 1,
        code: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        executionLane: 'campus_outdoor',
        executionPhase: 'outdoor_municipal_landscape',
        selectedDurationDays: 75,
        durationAssetStableCode: 'outdoor_utilities',
        t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
        runtimeReferenceDaysConsumed: false,
      }),
      durationAssetUtilizationRow({
        index: 2,
        code: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        executionLane: 'school_handover',
        executionPhase: 'acceptance_handover',
        selectedDurationDays: 48,
        durationAssetStableCode: 'integrated_commissioning',
        t2RhythmTemplateId: 't2-integrated-commissioning-handover-rhythm-v1',
        runtimeReferenceDaysConsumed: false,
      }),
      durationAssetUtilizationRow({
        index: 3,
        code: 'BTMP-SCH-01',
        title: '教学楼主体结构与功能区移交',
        executionLane: 'teaching_building',
        executionPhase: 'superstructure_rhythm',
        selectedDurationDays: 100,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
        runtimeReferenceDaysConsumed: true,
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      durationAssetUtilizationReport,
      output,
      now: new Date('2026-07-02T06:09:45.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.equal(report.durationGapPlanSampleRequestCount, 0)
    assert.equal(report.durationAssetUtilizationSampleRequestCount, 2)
    assert.equal(report.durationAssetUtilizationMissingRuntimeReferenceRowCount, 2)
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-SCH-05', 'BTMP-SCH-06'])
    assert.deepEqual(report.sampleRequests.map((row) => row.requestSources), [
      ['duration_asset_utilization_runtime_reference_day_gap'],
      ['duration_asset_utilization_runtime_reference_day_gap'],
    ])
    assert.match(report.sampleRequests[0].collectionRequirement, /duration asset utilization row BTMP-SCH-05/)
    assert.equal(report.sampleRequests[0].durationAssetStableCode, 'outdoor_utilities')
    assert.equal(report.sampleRequests[1].t2RhythmTemplateId, 't2-integrated-commissioning-handover-rhythm-v1')
    assert.match(report.durationAssetUtilizationReportRef, /^duration_asset_utilization_report:/)
    assert.equal(report.mutationBoundary.readsDurationAssetUtilizationReport, true)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /durationAssetUtilizationSampleRequestCount: 2/)
    assert.match(markdown, /BTMP-SCH-05/)
    assert.match(markdown, /BTMP-SCH-06/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('propagates duration asset utilization report blockers before requesting runtime samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-asset-blocker-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const durationAssetUtilizationReport = path.join(root, 'duration-asset-utilization-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    targetBusinessType: 'school',
    rows: [],
    blockers: [],
  })
  await writeJson(durationAssetUtilizationReport, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_refresh_required_before_asset_utilization_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [
      'candidate_baseline_refresh_required_before_asset_utilization_review',
      'active_standard_work_duration_seed_missing_for_some_rows',
      'active_t2_rhythm_template_missing_for_some_rows',
      'runtime_reference_days_missing_for_some_rows',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
    rows: [
      durationAssetUtilizationRow({
        index: 1,
        code: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        executionLane: 'campus_outdoor',
        executionPhase: 'outdoor_municipal_landscape',
        selectedDurationDays: 75,
        durationAssetStableCode: 'outdoor_utilities',
        t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
        runtimeReferenceDaysConsumed: false,
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      durationAssetUtilizationReport,
      output,
      now: new Date('2026-07-02T06:10:15.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(
      report.blockers.includes('duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review'),
      true,
    )
    assert.equal(
      report.blockers.includes('duration_asset_utilization_report_runtime_reference_days_missing_for_some_rows'),
      true,
    )
    assert.equal(
      report.blockers.includes('duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      true,
    )
    assert.equal(
      report.blockers.includes('duration_asset_utilization_report_active_t2_rhythm_template_missing_for_some_rows'),
      true,
    )
    assert.equal(
      report.sourceGuards.durationAssetUtilizationReport.blockers.includes('duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review'),
      true,
    )
    assert.equal(
      report.sourceGuards.durationAssetUtilizationReport.blockers.includes('duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      true,
    )

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review/)
    assert.match(markdown, /duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses duration asset utilization row identity before stale candidate row identity for profile gaps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-sample-gap-plan-school.json')
  const profileReport = path.join(root, 'profile-report.json')
  const durationAssetUtilizationReport = path.join(root, 'duration-asset-utilization-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    targetBusinessType: 'school',
    rows: [{
      index: 1,
      id: 'stale-candidate-row',
      title: '操场道路与校园室外配套',
      stableCode: 'BTMP-SCH-03',
      businessType: 'school',
      executionLane: 'campus_outdoor',
      executionPhase: 'outdoor_municipal_landscape',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      profileRuntimeReferenceDayGapRows: [{
        rowGroup: 'profile',
        businessType: 'school',
        code: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        executionLane: 'campus_outdoor',
        executionPhase: 'outdoor_municipal_landscape',
        requiredRuntimeReferenceStableCode: 'BTMP-SCH-05',
        selectedDurationDays: 75,
      }],
    }],
  })
  await writeJson(durationAssetUtilizationReport, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_asset_utilization_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    rows: [
      durationAssetUtilizationRow({
        index: 1,
        code: 'BTMP-SCH-05',
        title: '操场道路与校园室外配套',
        executionLane: 'campus_outdoor',
        executionPhase: 'outdoor_municipal_landscape',
        selectedDurationDays: 75,
        durationAssetStableCode: 'outdoor_utilities',
        t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
        runtimeReferenceDaysConsumed: false,
      }),
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      durationAssetUtilizationReport,
      output,
      now: new Date('2026-07-02T06:09:50.000Z'),
    })

    assert.equal(report.requiredStableCodeCount, 1)
    assert.equal(report.sampleRequests[0].stableCode, 'BTMP-SCH-05')
    assert.equal(report.sampleRequests[0].stableCodeResolution, 'duration_asset_utilization_row_match')
    assert.match(report.sampleRequests[0].collectionRequirement, /duration asset utilization row BTMP-SCH-05/)
    assert.deepEqual(report.sampleRequests[0].requestSources.sort(), [
      'duration_asset_utilization_runtime_reference_day_gap',
      'profile_runtime_reference_day_gap',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks collection package when the duration gap plan root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
    reviewProof: {
      sourceLineage: ['legacy_template_reverse_inference'],
    },
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'row-1',
      title: '施工准备',
      stableCode: 'BTMP-BASE-01',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      output,
      now: new Date('2026-07-02T06:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.requiredStableCodeCount, 0)
    assert.equal(report.sampleRequests.length, 0)
    assert.equal(
      report.blockers.includes('duration_gap_plan_retired_or_low_information_default_master_plan_source'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks collection package when the profile report root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'row-1',
      title: '施工准备',
      stableCode: 'BTMP-BASE-01',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    generatedAt: '2026-07-02T06:15:00.000Z',
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: {
      fallbackApplied: 'legacy_template_reverse_inference',
    },
    businessTypes: [
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      now: new Date('2026-07-02T06:15:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.requiredStableCodeCount, 0)
    assert.equal(report.sampleRequests.length, 0)
    assert.equal(
      report.blockers.includes('profile_report_retired_or_low_information_default_master_plan_source'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses explicit all-profile scope from CLI args', () => {
  const options = parseArgs([
    '--duration-gap-plan',
    'tmp/duration-gap.json',
    '--profile-report',
    'tmp/profile.json',
    '--profile-scope',
    'all',
  ])

  assert.equal(options.profileScope, 'all')
  assert.equal(options.profileReport.replace(/\\/g, '/').endsWith('tmp/profile.json'), true)
})

test('defaults CLI collection package to all-profile duration asset sampling inputs', () => {
  const options = parseArgs([])

  assert.equal(options.profileScope, 'all')
  assert.equal(options.useDurationGapPlanRows, false)
  assert.equal(
    options.profileReport.replace(/\\/g, '/').endsWith('project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json'),
    true,
  )
  assert.equal(
    options.durationAssetUtilizationReport.replace(/\\/g, '/').endsWith('project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json'),
    true,
  )
})

test('parses profile-only CLI mode as all profile scope without gap-plan rows', () => {
  const options = parseArgs(['--profile-only'])

  assert.equal(options.profileScope, 'all')
  assert.equal(options.useDurationGapPlanRows, false)
  assert.equal(options.durationAssetUtilizationReport, '')
})

test('profile-only all scope can build runtime reference-day collection package without a candidate gap plan file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-profile-only-missing-gap-'))
  const missingGapPlan = path.join(root, 'missing-duration-gap-plan.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    source: 'generate-default-master-plan-profile-report',
    businessTypes: [
      {
        businessType: 'school',
        profileRuntimeReferenceDayGapRows: [{
          rowGroup: 'profile',
          businessType: 'school',
          code: 'BTMP-SCH-06',
          title: '竣工验收与开学移交准备',
          executionLane: 'school_handover',
          executionPhase: 'acceptance_handover',
          requiredRuntimeReferenceStableCode: 'BTMP-SCH-06',
          selectedDurationDays: 48,
        }],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: missingGapPlan,
      profileReport,
      durationAssetUtilizationReport: '',
      output,
      profileScope: 'all',
      useDurationGapPlanRows: false,
      now: new Date('2026-07-02T06:17:00.000Z'),
    })

    assert.equal(report.status, 'samples_required')
    assert.equal(report.durationGapPlanRef, null)
    assert.equal(report.durationGapPlanSampleRequestCount, 0)
    assert.equal(report.profileRuntimeReferenceSampleRequestCount, 1)
    assert.deepEqual(report.blockers, ['accepted_real_duration_samples_required'])
    assert.deepEqual(report.sampleRequests.map((row) => row.stableCode), ['BTMP-SCH-06'])
    assert.equal(report.sourceGuards.durationGapPlan.missingForProfileOnlyAllScope, true)
    assert.equal(report.sourceGuards.durationGapPlan.ignoredForProfileOnlyAllScope, true)
    assert.equal(report.mutationBoundary.readsDurationGapPlan, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not treat profile review statuses as default master-plan source labels', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-sample-collection-'))
  const gapPlan = path.join(root, 'duration-gap.json')
  const profileReport = path.join(root, 'profile-report.json')
  const output = path.join(root, 'duration-sample-collection-package.json')

  await writeJson(gapPlan, {
    ...durationGapFixture(),
    status: 'ready_for_duration_calibration_evidence',
    summary: {
      candidateRowCount: 1,
      missingStableCodeCount: 0,
      coveredStableCodeCount: 1,
    },
    rows: [{
      index: 1,
      id: 'row-1',
      title: '施工准备',
      stableCode: 'BTMP-BASE-01',
      coverageStatus: 'covered',
      missingSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      acceptedSampleCount: 1,
    }],
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    source: 'generate-default-master-plan-profile-report',
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    businessTypes: [
      {
        businessType: 'school',
        reviewStatus: 'candidate_master_plan_reviewable',
        productionReadinessStatus: 'production_readiness_blocked',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        profileRuntimeReferenceDayGapRows: [],
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage({
      durationGapPlan: gapPlan,
      profileReport,
      output,
      now: new Date('2026-07-02T06:16:00.000Z'),
    })

    assert.equal(report.status, 'covered')
    assert.deepEqual(report.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function durationGapFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-gap-plan/v1',
    status: 'blocked',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    summary: {
      candidateRowCount: 2,
      requiredAcceptedSamplesPerStableCode: 1,
      coveredStableCodeCount: 0,
      missingStableCodeCount: 2,
    },
    rows: [
      {
        index: 1,
        id: 'row-1',
        title: '施工准备',
        stableCode: 'BTMP-BASE-01',
        executionLane: 'site_preparation',
        executionPhase: 'startup_site_setup',
        candidateReferenceDays: 30,
        requiredAcceptedSampleCount: 1,
        acceptedSampleCount: 0,
        missingSampleCount: 1,
        coverageStatus: 'missing_samples',
        sampleCollectionRequirement: 'Collect at least 1 accepted completed-task duration sample(s) for BTMP-BASE-01 (施工准备).',
      },
      {
        index: 2,
        id: 'row-2',
        title: '基坑支护',
        stableCode: 'BTMP-BASE-02',
        executionLane: 'foundation',
        executionPhase: 'foundation_pit_pile',
        candidateReferenceDays: 55,
        requiredAcceptedSampleCount: 2,
        acceptedSampleCount: 0,
        missingSampleCount: 2,
        coverageStatus: 'missing_samples',
        sampleCollectionRequirement: 'Collect at least 2 accepted completed-task duration sample(s) for BTMP-BASE-02 (基坑支护).',
      },
    ],
    blockers: ['duration_sample_coverage_incomplete'],
  }
}

function durationAssetUtilizationRow({
  index,
  code,
  title,
  executionLane,
  executionPhase,
  selectedDurationDays,
  durationAssetStableCode,
  t2RhythmTemplateId,
  runtimeReferenceDaysConsumed,
}) {
  return {
    index,
    code,
    title,
    executionLane,
    executionPhase,
    businessType: 'school',
    utilizationStatus: runtimeReferenceDaysConsumed
      ? 'runtime_calibrated_candidate_l2'
      : 'asset_backed_candidate_l1',
    assetGaps: runtimeReferenceDaysConsumed ? [] : ['runtime_reference_days_missing'],
    durationSelection: {
      selectedDurationDays,
      standardWorkSeed: {
        stableCode: durationAssetStableCode,
      },
      t2RhythmTemplate: {
        templateId: t2RhythmTemplateId,
      },
      runtimeReferenceDays: {
        consumed: runtimeReferenceDaysConsumed,
      },
    },
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
