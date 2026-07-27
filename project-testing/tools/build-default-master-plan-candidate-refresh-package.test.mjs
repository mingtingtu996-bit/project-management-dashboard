import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildDefaultMasterPlanCandidateRefreshPackage } from './build-default-master-plan-candidate-refresh-package.mjs'

test('builds a no-write refresh package from the current profile shape mismatch', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-'))
  const reportRoot = path.join(root, 'reports')
  const candidateExport = path.join(reportRoot, 'candidate-baseline-baseline-school-school-items.json')
  const hygiene = path.join(reportRoot, 'candidate-export-hygiene.json')
  const profileReport = path.join(root, 'default-master-plan-profile-samples.json')
  const output = path.join(reportRoot, 'candidate-refresh-package.json')

  await writeJson(candidateExport, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-school',
    projectId: 'project-school',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '学校项目基线',
    rowCount: 2,
    rows: [
      candidateRow({
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        phase: 'startup_site_setup',
        lane: 'site_preparation',
        start: '2026-06-28',
        end: '2026-07-27',
        days: 30,
        profileSourceType: 'business_type_base_master_plan_profile_v1',
      }),
      candidateRow({
        code: 'BTMP-SCH-02',
        title: '实验室通风与专业机电安装',
        phase: 'mep_roughin',
        lane: 'laboratory_mep',
        start: '2026-12-15',
        end: '2027-03-14',
        days: 90,
        profileSourceType: 'business_type_master_plan_profile_v1',
      }),
    ],
  })
  await writeJson(hygiene, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'blocked',
    selectedCandidateArtifact: candidateExport,
    currentCandidate: {
      artifact: candidateExport,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      rowCount: 2,
      businessType: 'school',
      sourceVersionLabel: 'managed_frontier_default_master_plan',
    },
    profileComparison: {
      status: 'mismatch',
      businessType: 'school',
      candidateRowCount: 2,
      profileScheduleRowCount: 3,
      missingProfileRowCount: 1,
    },
    blockers: ['selected_candidate_export_profile_shape_mismatch'],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      scheduleRowCount: 3,
      baseRowCount: 1,
      profileRowCount: 2,
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          stableCode: 'summer_shutdown',
          holidayName: 'Summer shutdown',
          startDate: '2026-07-01',
          endDate: '2026-07-07',
          countsAsConstructionShutdown: true,
        }],
      },
      generatorDurationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 3,
        standardWorkDurationSeedRowCount: 3,
        t2RhythmTemplateRowCount: 3,
        projectScaleQuantityProxyRowCount: 3,
        dependencyAssetConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
      },
      baseRows: [
        profileRow({
          code: 'BTMP-BASE-01',
          title: '施工准备与现场临设完成',
          phase: 'startup_site_setup',
          lane: 'site_preparation',
          start: '2026-07-01',
          end: '2026-07-30',
          days: 30,
        }),
      ],
      profileRows: [
        profileRow({
          code: 'BTMP-SCH-02',
          title: '教学楼二次结构与普通教室粗装修',
          phase: 'secondary_structure_fitout_roughin',
          lane: 'teaching_secondary_structure',
          start: '2026-12-08',
          end: '2027-03-07',
          days: 90,
        }),
        profileRow({
          code: 'BTMP-SCH-03',
          title: '实验室通风与专业机电安装',
          phase: 'mep_roughin',
          lane: 'laboratory_mep',
          start: '2027-01-02',
          end: '2027-03-17',
          days: 75,
        }),
      ],
      dependencyAnchorRows: [
        profileRow({
          code: 'WBS-ANCHOR-01',
          title: 'Foundation stream dependency anchor',
          phase: 'foundation_pit_pile',
          lane: 'foundation',
          start: '2026-07-31',
          end: '2026-08-06',
          days: 7,
        }),
      ],
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshPackage({
      candidateExport,
      profileReport,
      hygiene,
      output,
      now: new Date('2026-07-04T15:00:00.000Z'),
    })

    assert.equal(report.status, 'refresh_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.refreshRequired, true)
    assert.equal(report.baselineId, 'baseline-school')
    assert.equal(report.projectId, 'project-school')
    assert.equal(report.businessType, 'school')
    assert.equal(report.currentCandidate.rowCount, 2)
    assert.equal(report.targetProfile.scheduleRowCount, 3)
    assert.deepEqual(report.constructionCalendar, {
      basis: 'official_construction_calendar_seed',
      windows: [{
        stableCode: 'summer_shutdown',
        holidayName: 'Summer shutdown',
        startDate: '2026-07-01',
        endDate: '2026-07-07',
        countsAsConstructionShutdown: true,
      }],
    })
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.scheduleRowCount, 3)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.dependencyAssetConsumedRowCount, 1)
    assert.equal(report.targetReplacementRows.length, 4)
    assert.equal(report.targetProfile.dependencyAnchorRowCount, 1)
    assert.equal(
      report.targetReplacementRows.find((row) => row.code === 'WBS-ANCHOR-01').profileSourceType,
      'dependency_anchor_master_plan_profile_v1',
    )
    assert.equal(report.diff.missingTargetRows.length, 2)
    assert.equal(report.diff.missingTargetRows[0].code, 'BTMP-SCH-02')
    assert.equal(report.diff.missingTargetRows[1].code, 'WBS-ANCHOR-01')
    assert.deepEqual(report.diff.codeChangedRows.map((row) => [row.fromCode, row.toCode]), [
      ['BTMP-SCH-02', 'BTMP-SCH-03'],
    ])
    assert.equal(report.operationPlan.mode, 'full_replace_candidate_baseline_items_from_profile_report')
    assert.equal(report.operationPlan.executeAllowed, false)
    assert.equal(report.operationPlan.requiredUnlock, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH')
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.targetReplacementRows.every((row) => row.candidateOnly === true), true)
    assert.equal(report.targetReplacementRows.every((row) => row.writesTasks === false), true)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.schemaVersion, 'workbuddy-default-master-plan-candidate-refresh-package/v1')
    assert.equal(written.diff.missingTargetRows[0].title, '教学楼二次结构与普通教室粗装修')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /refresh_required/)
    assert.match(markdown, /BTMP-SCH-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not require refresh when the selected candidate already matches the current profile shape', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-'))
  const reportRoot = path.join(root, 'reports')
  const candidateExport = path.join(reportRoot, 'candidate-baseline-baseline-school-school-items.json')
  const hygiene = path.join(reportRoot, 'candidate-export-hygiene.json')
  const profileReport = path.join(root, 'default-master-plan-profile-samples.json')
  const output = path.join(reportRoot, 'candidate-refresh-package.json')
  const rows = [
    profileRow({
      code: 'BTMP-BASE-01',
      title: '施工准备与现场临设完成',
      phase: 'startup_site_setup',
      lane: 'site_preparation',
      start: '2026-07-01',
      end: '2026-07-30',
      days: 30,
    }),
    profileRow({
      code: 'BTMP-SCH-01',
      title: '教学楼主体结构与功能区移交',
      phase: 'superstructure_rhythm',
      lane: 'teaching_building',
      start: '2026-09-29',
      end: '2027-01-06',
      days: 100,
    }),
  ]
  await writeJson(candidateExport, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-school',
    projectId: 'project-school',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '学校项目基线',
    rowCount: 2,
    rows: rows.map((row) => candidateRow({
      code: row.code,
      title: row.title,
      phase: row.executionPhase,
      lane: row.executionLane,
      start: row.startDate,
      end: row.endDate,
      days: row.durationDays,
      profileSourceType: row.profileSourceType,
    })),
  })
  await writeJson(hygiene, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'pass',
    selectedCandidateArtifact: candidateExport,
    currentCandidate: {
      artifact: candidateExport,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      rowCount: 2,
      businessType: 'school',
    },
    profileComparison: {
      status: 'matched',
      businessType: 'school',
      candidateRowCount: 2,
      profileScheduleRowCount: 2,
      missingProfileRowCount: 0,
    },
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      scheduleRowCount: 2,
      baseRowCount: 1,
      profileRowCount: 1,
      baseRows: [rows[0]],
      profileRows: [rows[1]],
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshPackage({
      candidateExport,
      profileReport,
      hygiene,
      output,
      now: new Date('2026-07-04T15:00:00.000Z'),
    })

    assert.equal(report.status, 'no_refresh_required')
    assert.equal(report.refreshRequired, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.diff.missingTargetRows.length, 0)
    assert.equal(report.diff.codeChangedRows.length, 0)
    assert.equal(report.operationPlan.executeAllowed, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('treats generated dependency lineage changes as refresh-relevant baseline changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-dependency-'))
  const reportRoot = path.join(root, 'reports')
  const candidateExport = path.join(reportRoot, 'candidate-baseline-baseline-school-school-items.json')
  const hygiene = path.join(reportRoot, 'candidate-export-hygiene.json')
  const profileReport = path.join(root, 'default-master-plan-profile-samples.json')
  const output = path.join(reportRoot, 'candidate-refresh-package.json')
  const baseRow = {
    ...profileRow({
      code: 'BTMP-BASE-01',
      title: 'Startup',
      phase: 'startup_site_setup',
      lane: 'site_preparation',
      start: '2026-07-01',
      end: '2026-07-30',
      days: 30,
    }),
    clientRowId: 'generated:school:BTMP-BASE-01',
  }
  const targetRow = {
    ...profileRow({
      code: 'BTMP-SCH-01',
      title: 'Teaching structure',
      phase: 'superstructure_rhythm',
      lane: 'teaching_building',
      start: '2026-08-01',
      end: '2026-10-29',
      days: 90,
    }),
    clientRowId: 'generated:school:BTMP-SCH-01',
    predecessorDependencies: [{
      clientRowId: 'generated:school:BTMP-BASE-01',
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'business_type_master_plan_profile_sequence',
    }],
  }

  await writeJson(candidateExport, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-school',
    projectId: 'project-school',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    rowCount: 2,
    rows: [
      {
        ...candidateRow({
          code: baseRow.code,
          title: baseRow.title,
          phase: baseRow.executionPhase,
          lane: baseRow.executionLane,
          start: baseRow.startDate,
          end: baseRow.endDate,
          days: baseRow.durationDays,
          profileSourceType: baseRow.profileSourceType,
        }),
        clientRowId: baseRow.clientRowId,
      },
      {
        ...candidateRow({
          code: targetRow.code,
          title: targetRow.title,
          phase: targetRow.executionPhase,
          lane: targetRow.executionLane,
          start: targetRow.startDate,
          end: targetRow.endDate,
          days: targetRow.durationDays,
          profileSourceType: targetRow.profileSourceType,
        }),
        clientRowId: targetRow.clientRowId,
      },
    ],
  })
  await writeJson(hygiene, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'pass',
    selectedCandidateArtifact: candidateExport,
    currentCandidate: {
      artifact: candidateExport,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      rowCount: 2,
      businessType: 'school',
    },
    profileComparison: { status: 'matched', businessType: 'school' },
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      scheduleRowCount: 2,
      baseRowCount: 1,
      profileRowCount: 1,
      baseRows: [baseRow],
      profileRows: [targetRow],
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshPackage({
      candidateExport,
      profileReport,
      hygiene,
      output,
      now: new Date('2026-07-10T12:30:00.000Z'),
    })

    assert.equal(report.status, 'refresh_required')
    assert.equal(report.diff.dependencyChangedRows.length, 1)
    assert.equal(report.diff.dependencyChangedRows[0].code, 'BTMP-SCH-01')
    assert.deepEqual(report.targetReplacementRows[1].predecessorDependencies, targetRow.predecessorDependencies)
    assert.equal(report.targetReplacementRows[1].clientRowId, targetRow.clientRowId)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes profile duration asset count fields into candidate refresh summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-'))
  const reportRoot = path.join(root, 'reports')
  const candidateExport = path.join(reportRoot, 'candidate-baseline-baseline-school-school-items.json')
  const hygiene = path.join(reportRoot, 'candidate-export-hygiene.json')
  const profileReport = path.join(root, 'default-master-plan-profile-samples.json')
  const output = path.join(reportRoot, 'candidate-refresh-package.json')
  const rows = [
    assetBackedProfileRow({
      code: 'BTMP-BASE-01',
      title: '???????????',
      phase: 'startup_site_setup',
      lane: 'site_preparation',
      start: '2026-07-01',
      end: '2026-07-30',
      days: 30,
      durationAssetStableCode: 'site_setup_temp_works',
      t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
      runtimeReferenceDaysConsumed: false,
      dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
    }),
    assetBackedProfileRow({
      code: 'BTMP-SCH-02',
      title: '???????????????',
      phase: 'secondary_structure_fitout_roughin',
      lane: 'teaching_secondary_structure',
      start: '2026-12-08',
      end: '2027-03-07',
      days: 90,
      durationAssetStableCode: 'masonry_infill_wall',
      t2RhythmTemplateId: 't2-school-standard-library-fitout-batch-005-rhythm-v1',
      runtimeReferenceDaysConsumed: false,
      dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
    }),
  ]

  await writeJson(candidateExport, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-school',
    projectId: 'project-school',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '??????',
    rowCount: 2,
    rows,
  })
  await writeJson(hygiene, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'pass',
    selectedCandidateArtifact: candidateExport,
    currentCandidate: {
      artifact: candidateExport,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      rowCount: 2,
      businessType: 'school',
      sourceVersionLabel: 'managed_frontier_default_master_plan',
    },
    profileComparison: {
      status: 'matched',
      businessType: 'school',
      candidateRowCount: 2,
      profileScheduleRowCount: 2,
      missingProfileRowCount: 0,
    },
    blockers: [],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      scheduleRowCount: 2,
      baseRowCount: 1,
      profileRowCount: 1,
      durationAssetRowCount: 2,
      dependencyTimingAssetConsumedRowCount: 1,
      processSeasonalDurationAssetRowCount: 1,
      constructionCalendarRowCount: 2,
      businessTypeProfileScheduleRowCount: 1,
      businessTypeSpecialtyDurationAssetRowCount: 1,
      businessTypeSpecificT2RhythmTemplateRowCount: 1,
      businessTypeRowsMissingSpecialtyDurationAssetCount: 0,
      businessTypeRowsMissingSpecificT2RhythmTemplateCount: 0,
      activeStandardWorkDurationSeedRowCount: 0,
      fallbackStandardWorkDurationSeedRowCount: 1,
      activeT2RhythmTemplateRowCount: 0,
      fallbackT2RhythmTemplateRowCount: 1,
      uniqueStandardWorkDurationSeedStableCodes: ['integrated_commissioning'],
      uniqueT2RhythmTemplateIds: ['t2-school-campus-functional-phasing-rhythm-v1'],
      businessTypeProfileBusinessTypeCodes: ['school'],
      businessTypeSpecialtyDurationAssetBusinessTypeCodes: ['school'],
      businessTypeSpecificT2RhythmBusinessTypeCodes: ['school'],
      profileDependencyEvidenceRowCount: 2,
      runtimeReferenceDaysConsumedCount: 0,
      runtimeReferenceDaysMissingCount: 2,
      durationRiskRangeRowCount: 2,
      durationRiskP20MinDays: 24,
      durationRiskP50MedianDays: 36,
      durationRiskP80MaxDays: 60,
      baseRows: [rows[0]],
      profileRows: [rows[1]],
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshPackage({
      candidateExport,
      profileReport,
      hygiene,
      output,
      now: new Date('2026-07-05T05:00:00.000Z'),
    })

    assert.equal(report.status, 'no_refresh_required')
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.scheduleRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.standardWorkDurationSeedRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.t2RhythmTemplateRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.dependencyAssetConsumedRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.dependencyTimingAssetConsumedRowCount, 1)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.processSeasonalDurationAssetRowCount, 1)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.constructionCalendarRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.businessTypeProfileScheduleRowCount, 1)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.businessTypeSpecialtyDurationAssetRowCount, 1)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.businessTypeSpecificT2RhythmTemplateRowCount, 1)
    assert.deepEqual(report.targetProfile.generatorDurationAssetUtilizationSummary.businessTypeAssetCoverage, [{
      businessType: 'school',
      profileScheduleRowCount: 1,
      specialtyDurationAssetRowCount: 1,
      specificT2RhythmTemplateRowCount: 1,
      rowsMissingSpecialtyDurationAssetCount: 0,
      rowsMissingSpecificT2RhythmTemplateCount: 0,
      activeStandardWorkDurationSeedRowCount: 0,
      fallbackStandardWorkDurationSeedRowCount: 1,
      activeT2RhythmTemplateRowCount: 0,
      fallbackT2RhythmTemplateRowCount: 1,
      uniqueStandardWorkDurationSeedStableCodes: ['integrated_commissioning'],
      uniqueT2RhythmTemplateIds: ['t2-school-campus-functional-phasing-rhythm-v1'],
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }])
    assert.deepEqual(report.targetProfile.generatorDurationAssetUtilizationSummary.businessTypeProfileBusinessTypeCodes, ['school'])
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.runtimeReferenceDaysConsumedRowCount, 0)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.rowsMissingRuntimeReferenceDaysCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.durationRiskRangeRowCount, 2)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.durationRiskP20MinDays, 24)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.durationRiskP50MedianDays, 36)
    assert.equal(report.targetProfile.generatorDurationAssetUtilizationSummary.durationRiskP80MaxDays, 60)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps duration asset lineage when packaging profile rows for candidate refresh', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-'))
  const reportRoot = path.join(root, 'reports')
  const candidateExport = path.join(reportRoot, 'candidate-baseline-baseline-school-school-items.json')
  const hygiene = path.join(reportRoot, 'candidate-export-hygiene.json')
  const profileReport = path.join(root, 'default-master-plan-profile-samples.json')
  const output = path.join(reportRoot, 'candidate-refresh-package.json')

  await writeJson(candidateExport, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-school',
    projectId: 'project-school',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '学校项目基线',
    rowCount: 0,
    rows: [],
  })
  await writeJson(hygiene, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'blocked',
    selectedCandidateArtifact: candidateExport,
    currentCandidate: {
      artifact: candidateExport,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      rowCount: 0,
      businessType: 'school',
      sourceVersionLabel: 'managed_frontier_default_master_plan',
    },
    profileComparison: {
      status: 'mismatch',
      businessType: 'school',
      candidateRowCount: 0,
      profileScheduleRowCount: 2,
      missingProfileRowCount: 2,
    },
    blockers: ['selected_candidate_export_profile_shape_mismatch'],
  })
  await writeJson(profileReport, {
    schemaVersion: 'workbuddy-default-master-plan-profile-report/v1',
    businessTypes: [{
      businessType: 'school',
      scheduleRowCount: 2,
      baseRowCount: 1,
      profileRowCount: 1,
      baseRows: [
        assetBackedProfileRow({
          code: 'BTMP-BASE-01',
          title: '施工准备与现场临设完成',
          phase: 'startup_site_setup',
          lane: 'site_preparation',
          start: '2026-07-01',
          end: '2026-07-30',
          days: 30,
          durationAssetStableCode: 'site_setup_temp_works',
          t2RhythmTemplateId: 't2-residential-basement-structure-handover-rhythm-v1',
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 30,
          runtimeReferenceDaysSource: 'accepted_real_project_outcome',
          dependencyRuleSource: '',
        }),
      ],
      profileRows: [
        assetBackedProfileRow({
          code: 'BTMP-SCH-02',
          title: '教学楼二次结构与普通教室粗装修',
          phase: 'secondary_structure_fitout_roughin',
          lane: 'teaching_secondary_structure',
          start: '2026-12-08',
          end: '2027-03-07',
          days: 90,
          durationAssetStableCode: 'masonry_infill_wall',
          t2RhythmTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 90,
          runtimeReferenceDaysSource: 'accepted_real_project_outcome',
          dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
          dependencyAssetConsumed: true,
          dependencyAssetStableCode: 'school-teaching-building-to-lab-mep',
          dependencyTimingAssetConsumed: true,
          dependencyTimingSelectedLagDays: 28,
          processSeasonalDurationAssetConsumed: true,
          processSeasonalMultiplier: 1.12,
          calendarBasis: 'official_construction_calendar_seed',
          constructionCalendarWindowCount: 2,
        }),
      ],
    }],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshPackage({
      candidateExport,
      profileReport,
      hygiene,
      output,
      now: new Date('2026-07-04T15:00:00.000Z'),
    })

    assert.equal(report.targetReplacementRows.length, 2)
    const [baseRow, schoolRow] = report.targetReplacementRows
    assert.equal(baseRow.profileSourceType, 'business_type_base_master_plan_profile_v1')
    assert.equal(schoolRow.profileSourceType, 'business_type_master_plan_profile_v1')
    assert.equal(schoolRow.durationAssetStableCode, 'masonry_infill_wall')
    assert.equal(schoolRow.t2RhythmTemplateId, 't2-residential-secondary-structure-fitout-interleave-v1')
    assert.equal(schoolRow.standardWorkDurationSeedP50Days, 8)
    assert.equal(schoolRow.t2RhythmTemplateP50Days, 26)
    assert.equal(schoolRow.runtimeReferenceDaysConsumed, true)
    assert.equal(schoolRow.runtimeReferenceDaysP50Days, 90)
    assert.equal(schoolRow.runtimeReferenceDaysSource, 'accepted_real_project_outcome')
    assert.equal(schoolRow.quantityProxySource, 'project_scale_facts')
    assert.equal(schoolRow.quantityProxyValue, 6)
    assert.equal(schoolRow.productivityDerivedDurationDays, 52)
    assert.equal(schoolRow.selectionRule, 'runtime_calibrated_reference_days_p50_candidate_l2')
    assert.equal(schoolRow.dependencyRuleSource, 'construction_task_dependency_constraint_rule_system')
    assert.equal(schoolRow.dependencyAssetConsumed, true)
    assert.equal(schoolRow.dependencyAssetStableCode, 'school-teaching-building-to-lab-mep')
    assert.equal(schoolRow.dependencyTimingAssetConsumed, true)
    assert.equal(schoolRow.dependencyTimingSelectedLagDays, 28)
    assert.equal(schoolRow.dependencyRuleLayerStack, 'cross_item_workflow + process_constraint')
    assert.equal(schoolRow.dependencyProductionWritePolicy, 'candidate_only_no_task_dependencies_write')
    assert.equal(schoolRow.processSeasonalDurationAssetConsumed, true)
    assert.equal(schoolRow.processSeasonalMultiplier, 1.12)
    assert.equal(schoolRow.calendarBasis, 'official_construction_calendar_seed')
    assert.equal(schoolRow.constructionCalendarWindowCount, 2)
    assert.equal(schoolRow.durationCalibrationSource, 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence')
    assert.equal(schoolRow.durationMaturity, 'L1')
    assert.equal(schoolRow.durationReviewGate, 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')
    assert.equal(schoolRow.durationReviewRequired, true)
    assert.equal(schoolRow.durationTruthSource, 'asset_backed_candidate_master_plan')
    assert.equal(schoolRow.phaseAnchorDependencyCount, 0)
    assert.equal(schoolRow.riskP20DurationDays, 72)
    assert.equal(schoolRow.riskP50DurationDays, 90)
    assert.equal(schoolRow.riskP80DurationDays, 118)
    assert.deepEqual(schoolRow.durationRiskRange, { p20Days: 72, p50Days: 90, p80Days: 118, uncertaintyBandDays: 46 })
    assert.equal(schoolRow.totalFloatDays, 14)
    assert.equal(schoolRow.criticalPathCandidate, false)
    assert.equal(schoolRow.earlyStartOffsetDays, 30)
    assert.equal(schoolRow.earlyFinishOffsetDays, 120)
    assert.equal(schoolRow.lateStartOffsetDays, 44)
    assert.equal(schoolRow.lateFinishOffsetDays, 134)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.diff.missingTargetRows[1].durationAssetStableCode, 'masonry_infill_wall')
    assert.equal(written.diff.missingTargetRows[1].profileSourceType, 'business_type_master_plan_profile_v1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function candidateRow({ code, title, phase, lane, start, end, days, profileSourceType }) {
  return {
    id: `item-${code}`,
    title,
    plannedStart: start,
    plannedEnd: end,
    standardWorkCode: code,
    executionPhase: phase,
    executionLane: lane,
    scheduleParticipation: 'primary_schedule',
    smartReferenceDays: days,
    source: 'managed_frontier_default_master_plan',
    profileSourceType,
    durationOutputCode: 'plan_reference',
    durationEvidence: 'candidate_default_master_plan_baseline',
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
  }
}

function profileRow({ code, title, phase, lane, start, end, days }) {
  return {
    code,
    title,
    startDate: start,
    endDate: end,
    durationDays: days,
    executionPhase: phase,
    executionLane: lane,
    profileSourceType: code.startsWith('BTMP-BASE-')
      ? 'business_type_base_master_plan_profile_v1'
      : 'business_type_master_plan_profile_v1',
  }
}

function assetBackedProfileRow({
  code,
  title,
  phase,
  lane,
  start,
  end,
  days,
  durationAssetStableCode,
  t2RhythmTemplateId,
  runtimeReferenceDaysConsumed,
  runtimeReferenceDaysP50Days,
  runtimeReferenceDaysSource,
  dependencyRuleSource,
  dependencyAssetConsumed,
  dependencyAssetStableCode,
  dependencyTimingAssetConsumed,
  dependencyTimingSelectedLagDays,
  processSeasonalDurationAssetConsumed,
  processSeasonalMultiplier,
  processSeasonalSource,
  calendarBasis,
  constructionCalendarWindowCount,
}) {
  return {
    code,
    title,
    startDate: start,
    endDate: end,
    durationDays: days,
    executionPhase: phase,
    executionLane: lane,
    durationAssetStableCode,
    t2RhythmTemplateId,
    selectedDurationDays: days,
    standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
    standardWorkDurationSeedResolverVersionId: '',
    standardWorkDurationSeedP50Days: durationAssetStableCode === 'masonry_infill_wall' ? 8 : 18,
    t2RhythmTemplateP50Days: durationAssetStableCode === 'masonry_infill_wall' ? 26 : 35,
    runtimeReferenceDaysConsumed,
    runtimeReferenceDaysEvidenceLevel: runtimeReferenceDaysConsumed ? 'runtime_calibrated_l2' : null,
    runtimeReferenceDaysP50Days,
    runtimeReferenceDaysP80Days: runtimeReferenceDaysP50Days,
    runtimeReferenceDaysSampleCount: runtimeReferenceDaysConsumed ? 1 : null,
    runtimeReferenceDaysSource,
    quantityProxySource: 'project_scale_facts',
    quantityProxyValue: durationAssetStableCode === 'masonry_infill_wall' ? 6 : 2,
    quantityProxyUnit: durationAssetStableCode === 'masonry_infill_wall' ? 'secondary_structure_zone' : 'workface',
    quantityProxyBasis: 'project scale facts',
    standardWorkDurationSeedProductivityP50PerDay: durationAssetStableCode === 'masonry_infill_wall' ? 140 : 12,
    productivityDerivedDurationDays: durationAssetStableCode === 'masonry_infill_wall' ? 52 : 30,
    selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
    dependencyRuleSource,
    dependencyAssetConsumed,
    dependencyAssetStableCode,
    dependencyTimingAssetConsumed,
    dependencyTimingSelectedLagDays,
    dependencyRuleLayerStack: dependencyRuleSource ? 'cross_item_workflow + process_constraint' : '',
    dependencyProductionWritePolicy: 'candidate_only_no_task_dependencies_write',
    processSeasonalDurationAssetConsumed,
    processSeasonalMultiplier,
    processSeasonalSource,
    calendarBasis,
    constructionCalendarWindowCount,
    durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    durationMaturity: 'L1',
    durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
    durationReviewRequired: true,
    durationTruthSource: 'asset_backed_candidate_master_plan',
    phaseAnchorDependencyCount: dependencyRuleSource ? 0 : 1,
    riskP20DurationDays: durationAssetStableCode === 'masonry_infill_wall' ? 72 : 24,
    riskP50DurationDays: days,
    riskP80DurationDays: durationAssetStableCode === 'masonry_infill_wall' ? 118 : 42,
    durationRiskRange: durationAssetStableCode === 'masonry_infill_wall'
      ? { p20Days: 72, p50Days: days, p80Days: 118, uncertaintyBandDays: 46 }
      : { p20Days: 24, p50Days: days, p80Days: 42, uncertaintyBandDays: 18 },
    totalFloatDays: durationAssetStableCode === 'masonry_infill_wall' ? 14 : 0,
    criticalPathCandidate: durationAssetStableCode !== 'masonry_infill_wall',
    earlyStartOffsetDays: durationAssetStableCode === 'masonry_infill_wall' ? 30 : 0,
    earlyFinishOffsetDays: durationAssetStableCode === 'masonry_infill_wall' ? 120 : 30,
    lateStartOffsetDays: durationAssetStableCode === 'masonry_infill_wall' ? 44 : 0,
    lateFinishOffsetDays: durationAssetStableCode === 'masonry_infill_wall' ? 134 : 30,
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
