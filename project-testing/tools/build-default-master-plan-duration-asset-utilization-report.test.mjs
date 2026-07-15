import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const SCRIPT = path.resolve('project-testing/tools/build-default-master-plan-duration-asset-utilization-report.mjs')

test('builds a no-write per-row duration asset utilization report from candidate refresh rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    targetProfile: {
      generatorDurationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 2,
        projectScaleQuantityProxyRowCount: 2,
        dependencyAssetConsumedRowCount: 1,
        dependencyTimingAssetConsumedRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        constructionCalendarRowCount: 2,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingRuntimeReferenceDaysCount: 1,
        durationRiskRangeRowCount: 2,
        durationRiskP20MinDays: 24,
        durationRiskP50MedianDays: 36,
        durationRiskP80MaxDays: 60,
        criticalPathCandidateRowCount: 1,
        floatCalculatedRowCount: 2,
        businessTypeProfileScheduleRowCount: 1,
        businessTypeSpecialtyDurationAssetRowCount: 1,
        businessTypeSpecificT2RhythmTemplateRowCount: 1,
        businessTypeRowsMissingSpecialtyDurationAssetCount: 0,
        businessTypeRowsMissingSpecificT2RhythmTemplateCount: 0,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        businessTypeProfileBusinessTypeCodes: ['school'],
        businessTypeSpecialtyDurationAssetBusinessTypeCodes: ['school'],
        businessTypeSpecificT2RhythmBusinessTypeCodes: ['school'],
        businessTypeAssetCoverage: [{
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
        }],
      },
    },
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        executionLane: 'site_preparation',
        durationDays: 30,
        durationAssetStableCode: 'site_setup_temp_works',
        t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
        selectedDurationDays: 30,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        t2RhythmTemplateP50Days: 36,
        riskP20DurationDays: 24,
        riskP50DurationDays: 30,
        riskP80DurationDays: 42,
        durationRiskRange: { p20Days: 24, p50Days: 30, p80Days: 42, uncertaintyBandDays: 18 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        earlyStartOffsetDays: 0,
        earlyFinishOffsetDays: 30,
        lateStartOffsetDays: 0,
        lateFinishOffsetDays: 30,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysP50Days: 30,
        runtimeReferenceDaysSampleCount: 1,
        runtimeReferenceDaysSource: 'accepted_real_project_outcome',
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        productivityDerivedDurationDays: 16,
        selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 0,
        dependencyAssetConsumed: false,
        dependencyTimingAssetConsumed: false,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
      {
        index: 2,
        code: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        executionPhase: 'acceptance_handover',
        executionLane: 'school_handover',
        durationDays: 30,
        durationAssetStableCode: 'integrated_commissioning',
        t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
        selectedDurationDays: 48,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 12,
        t2RhythmTemplateP50Days: 48,
        riskP20DurationDays: 36,
        riskP50DurationDays: 48,
        riskP80DurationDays: 60,
        durationRiskRange: { p20Days: 36, p50Days: 48, p80Days: 60, uncertaintyBandDays: 24 },
        totalFloatDays: 14,
        criticalPathCandidate: false,
        earlyStartOffsetDays: 30,
        earlyFinishOffsetDays: 78,
        lateStartOffsetDays: 44,
        lateFinishOffsetDays: 92,
        runtimeReferenceDaysConsumed: false,
        runtimeReferenceDaysEvidenceLevel: null,
        runtimeReferenceDaysP50Days: null,
        runtimeReferenceDaysSampleCount: null,
        quantityProxyValue: 2,
        quantityProxyUnit: 'handover_zone',
        productivityDerivedDurationDays: 20,
        selectionRule: 'max_seed_t2_productivity_candidate_l1',
        dependencyAssetConsumed: true,
        dependencyAssetStableCode: 'school-commissioning-to-handover',
        dependencyTimingAssetConsumed: true,
        dependencyTimingSelectedLagDays: 21,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalMultiplier: 1.08,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-duration-asset-utilization-report/v1')
    assert.equal(report.status, 'candidate_asset_utilization_review_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.businessType, 'school')
    assert.equal(report.rowCount, 2)
    assert.equal(report.assetCoverage.rowsWithStandardWorkSeedCount, 2)
    assert.equal(report.assetCoverage.rowsWithActiveStandardWorkSeedCount, 0)
    assert.equal(report.assetCoverage.rowsWithFallbackStandardWorkSeedCount, 2)
    assert.equal(report.assetCoverage.rowsWithT2RhythmTemplateCount, 2)
    assert.equal(report.assetCoverage.rowsWithActiveT2RhythmTemplateCount, 0)
    assert.equal(report.assetCoverage.rowsWithFallbackT2RhythmTemplateCount, 2)
    assert.equal(report.assetCoverage.rowsWithRuntimeReferenceDaysCount, 1)
    assert.equal(report.assetCoverage.rowsMissingRuntimeReferenceDaysCount, 1)
    assert.equal(report.assetCoverage.rowsWithQuantityOrProductivityCount, 2)
    assert.equal(report.assetCoverage.rowsWithDependencyEvidenceCount, 2)
    assert.equal(report.assetCoverage.rowsWithDependencyAssetCount, 1)
    assert.equal(report.assetCoverage.rowsMissingDependencyAssetCount, 1)
    assert.equal(report.assetCoverage.rowsWithDependencyTimingAssetCount, 1)
    assert.equal(report.assetCoverage.rowsMissingDependencyTimingAssetCount, 1)
    assert.equal(report.assetCoverage.rowsWithProcessSeasonalDurationAssetCount, 1)
    assert.equal(report.assetCoverage.rowsWithConstructionCalendarCount, 2)
    assert.equal(report.assetCoverage.rowsWithDurationRiskRangeCount, 2)
    assert.equal(report.assetCoverage.rowsWithInvalidDurationRiskRangeCount, 0)
    assert.equal(report.assetCoverage.rowsWithCriticalPathEvidenceCount, 2)
    assert.equal(report.assetCoverage.rowsWithFloatCalculatedCount, 2)
    assert.equal(report.assetCoverage.rowsMissingCriticalPathEvidenceCount, 0)
    assert.equal(report.assetCoverage.criticalPathCandidateRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.scheduleRowCount, 2)
    assert.equal(report.generatorDurationAssetUtilizationSummary.dependencyAssetConsumedRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.dependencyTimingAssetConsumedRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.processSeasonalDurationAssetRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.constructionCalendarRowCount, 2)
    assert.equal(report.generatorDurationAssetUtilizationSummary.runtimeReferenceDaysRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.runtimeReferenceDaysConsumedRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.rowsMissingRuntimeReferenceDaysCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.durationRiskRangeRowCount, 2)
    assert.equal(report.generatorDurationAssetUtilizationSummary.durationRiskP20MinDays, 24)
    assert.equal(report.generatorDurationAssetUtilizationSummary.durationRiskP50MedianDays, 36)
    assert.equal(report.generatorDurationAssetUtilizationSummary.durationRiskP80MaxDays, 60)
    assert.equal(report.generatorDurationAssetUtilizationSummary.criticalPathCandidateRowCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.floatCalculatedRowCount, 2)
    assert.deepEqual(report.businessTypeSpecialtyAssetCoverage, {
      source: 'generator_duration_asset_utilization_summary',
      status: 'covered',
      profileScheduleRowCount: 1,
      specialtyDurationAssetRowCount: 1,
      specificT2RhythmTemplateRowCount: 1,
      rowsMissingSpecialtyDurationAssetCount: 0,
      rowsMissingSpecificT2RhythmTemplateCount: 0,
      profileBusinessTypeCodes: ['school'],
      specialtyDurationAssetBusinessTypeCodes: ['school'],
      specificT2RhythmBusinessTypeCodes: ['school'],
    })
    assert.deepEqual(report.businessTypeAssetCoverage, [{
      source: 'generator_duration_asset_utilization_summary',
      status: 'covered',
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
    assert.equal(report.blockers.includes('runtime_reference_days_missing_for_some_rows'), true)
    assert.equal(report.blockers.includes('active_standard_work_duration_seed_missing_for_some_rows'), true)
    assert.equal(report.blockers.includes('active_t2_rhythm_template_missing_for_some_rows'), true)
    assert.equal(report.rows[0].durationSelection.runtimeReferenceDays.consumed, true)
    assert.equal(report.rows[0].durationSelection.dependencyEvidence.startAnchor, true)
    assert.equal(report.rows[0].durationSelection.dependencyEvidence.anchorType, 'project_start_anchor')
    assert.deepEqual(report.rows[0].durationSelection.durationRiskRange, { p20Days: 24, p50Days: 30, p80Days: 42, uncertaintyBandDays: 18 })
    assert.deepEqual(report.rows[1].durationSelection.durationRiskRange, { p20Days: 36, p50Days: 48, p80Days: 60, uncertaintyBandDays: 24 })
    assert.deepEqual(report.rows[0].durationSelection.criticalPathEvidence, {
      criticalPathCandidate: true,
      totalFloatDays: 0,
      earlyStartOffsetDays: 0,
      earlyFinishOffsetDays: 30,
      lateStartOffsetDays: 0,
      lateFinishOffsetDays: 30,
    })
    assert.equal(report.rows[1].durationSelection.criticalPathEvidence.totalFloatDays, 14)
    assert.equal(report.rows[0].durationSelection.dependencyAsset.consumed, false)
    assert.equal(report.rows[1].durationSelection.dependencyAsset.consumed, true)
    assert.equal(report.rows[1].durationSelection.dependencyTimingAsset.consumed, true)
    assert.equal(report.rows[1].durationSelection.processSeasonalAsset.consumed, true)
    assert.equal(report.rows[1].durationSelection.constructionCalendar.consumed, true)
    assert.equal(report.rows[0].utilizationStatus, 'runtime_calibrated_candidate_l2')
    assert.deepEqual(report.rows[1].assetGaps, ['runtime_reference_days_missing'])
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /BTMP-BASE-01/)
    assert.match(markdown, /runtime_reference_days_missing/)
    assert.match(markdown, /generatorDurationAssetUtilizationSummary/)
    assert.match(markdown, /dependencyAssetConsumedRowCount=1/)
    assert.match(markdown, /dependencyTimingAssetConsumedRowCount=1/)
    assert.match(markdown, /processSeasonalDurationAssetRowCount=1/)
    assert.match(markdown, /constructionCalendarRowCount=2/)
    assert.match(markdown, /runtimeReferenceDaysRowCount=1/)
    assert.match(markdown, /runtimeReferenceDaysConsumedRowCount=1/)
    assert.match(markdown, /rowsMissingRuntimeReferenceDaysCount=1/)
    assert.match(markdown, /durationRiskRangeRowCount=2/)
    assert.match(markdown, /durationRiskP20MinDays=24/)
    assert.match(markdown, /durationRiskP50MedianDays=36/)
    assert.match(markdown, /durationRiskP80MaxDays=60/)
    assert.match(markdown, /criticalPathCandidateRowCount=1/)
    assert.match(markdown, /floatCalculatedRowCount=2/)
    assert.match(markdown, /businessTypeSpecialtyAssetCoverage: status=covered/)
    assert.match(markdown, /businessTypeAssetCoverage/)
    assert.match(markdown, /school: status=covered/)
    assert.match(markdown, /fallbackStandardWorkDurationSeedRowCount=1/)
    assert.match(markdown, /rowsWithActiveStandardWorkSeed: 0/)
    assert.match(markdown, /rowsWithActiveT2RhythmTemplate: 0/)
    assert.match(markdown, /active_standard_work_duration_seed_missing_for_some_rows/)
    assert.match(markdown, /active_t2_rhythm_template_missing_for_some_rows/)
    assert.match(markdown, /uniqueT2RhythmTemplateIds=t2-school-campus-functional-phasing-rhythm-v1/)
    assert.match(markdown, /specialtyDurationAssetRowCount=1/)
    assert.match(markdown, /profileBusinessTypeCodes=school/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not count incomplete runtime reference-day flags as calibrated utilization', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-incomplete-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        executionLane: 'site_preparation',
        durationDays: 30,
        durationAssetStableCode: 'site_setup_temp_works',
        t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
        selectedDurationDays: 30,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        t2RhythmTemplateP50Days: 36,
        riskP20DurationDays: 24,
        riskP50DurationDays: 30,
        riskP80DurationDays: 42,
        durationRiskRange: { p20Days: 24, p50Days: 30, p80Days: 42, uncertaintyBandDays: 18 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: '',
        runtimeReferenceDaysP50Days: null,
        runtimeReferenceDaysSampleCount: 0,
        runtimeReferenceDaysSource: 'staging_runtime_writer',
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        productivityDerivedDurationDays: 16,
        selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.assetCoverage.rowsWithRuntimeReferenceDaysCount, 0)
    assert.equal(report.assetCoverage.rowsMissingRuntimeReferenceDaysCount, 1)
    assert.equal(report.rows[0].durationSelection.runtimeReferenceDays.consumed, false)
    assert.equal(report.rows[0].durationSelection.runtimeReferenceDays.flaggedConsumed, true)
    assert.deepEqual(report.rows[0].assetGaps, ['runtime_reference_days_incomplete'])
    assert.equal(report.rows[0].utilizationStatus, 'asset_backed_candidate_l1')
    assert.equal(report.blockers.includes('runtime_reference_days_missing_for_some_rows'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses verified runtime seed post-import evidence to close active seed and T2 blockers without changing no-write boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-post-import-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const postImportVerification = path.join(root, 'runtime-seed-post-import-verification.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-SCH-01',
        title: '教学楼主体结构与功能区移交',
        executionPhase: 'superstructure_rhythm',
        executionLane: 'teaching_building',
        durationDays: 120,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
        selectedDurationDays: 120,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 5,
        t2RhythmTemplateResolverSource: 'ts_seed_fallback',
        t2RhythmTemplateP50Days: 8,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysP50Days: 120,
        runtimeReferenceDaysSampleCount: 2,
        runtimeReferenceDaysSource: 'accepted_real_project_outcome',
        quantityProxyValue: 24,
        quantityProxyUnit: 'floor_workface',
        productivityDerivedDurationDays: 120,
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        phaseAnchorDependencyCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })
  await writeJson(postImportVerification, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-post-import-verification/v1',
    source: 'check-default-master-plan-runtime-seed-post-import',
    status: 'runtime_seed_post_import_verified',
    runtimeSeedEvidence: {
      profileRowCount: 1,
      runtimeSeedRowCount: 1,
      fallbackOrMissingSeedRowCount: 0,
      allProfileRowsRuntime: true,
      requiredStableCodeCount: 1,
      missingRuntimeStableCodeCount: 0,
      importControlEvidenceReady: true,
      preflightReady: true,
      coverageComplete: true,
    },
    runtimeT2Evidence: {
      profileRowCount: 1,
      runtimeT2RowCount: 1,
      fallbackOrMissingT2RowCount: 0,
      allProfileT2RowsRuntime: true,
    },
    blockers: [],
    mutationBoundary: {
      writesProductionTables: false,
      writesAlgorithmSeedRecords: false,
      writesRuntimePublication: false,
      writesTasks: false,
      writesTaskDependencies: false,
    },
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--runtime-seed-post-import-verification',
      postImportVerification,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.runtimeSeedPostImportVerification.status, 'runtime_seed_post_import_verified')
    assert.equal(report.runtimeSeedPostImportVerification.activeStandardWorkDurationSeedReady, true)
    assert.equal(report.runtimeSeedPostImportVerification.activeT2RhythmTemplateReady, true)
    assert.equal(report.blockers.includes('active_standard_work_duration_seed_missing_for_some_rows'), false)
    assert.equal(report.blockers.includes('active_t2_rhythm_template_missing_for_some_rows'), false)
    assert.equal(report.productionReady, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runtimeSeedPostImportVerification: status=runtime_seed_post_import_verified/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps active seed and T2 blockers when post-import evidence violates no-write boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-post-import-blocked-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const postImportVerification = path.join(root, 'runtime-seed-post-import-verification.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-SCH-01',
        title: '教学楼主体结构与功能区移交',
        executionPhase: 'superstructure_rhythm',
        executionLane: 'teaching_building',
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 5,
        t2RhythmTemplateResolverSource: 'ts_seed_fallback',
        t2RhythmTemplateP50Days: 8,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysP50Days: 120,
        runtimeReferenceDaysSampleCount: 2,
        runtimeReferenceDaysSource: 'accepted_real_project_outcome',
        quantityProxyValue: 24,
        productivityDerivedDurationDays: 120,
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        phaseAnchorDependencyCount: 1,
      },
    ],
  })
  await writeJson(postImportVerification, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-post-import-verification/v1',
    source: 'check-default-master-plan-runtime-seed-post-import',
    status: 'runtime_seed_post_import_verified',
    runtimeSeedEvidence: {
      profileRowCount: 1,
      runtimeSeedRowCount: 1,
      fallbackOrMissingSeedRowCount: 0,
      allProfileRowsRuntime: true,
    },
    runtimeT2Evidence: {
      profileRowCount: 1,
      runtimeT2RowCount: 1,
      fallbackOrMissingT2RowCount: 0,
      allProfileT2RowsRuntime: true,
    },
    blockers: [],
    mutationBoundary: {
      writesProductionTables: true,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--runtime-seed-post-import-verification',
      postImportVerification,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.runtimeSeedPostImportVerification.activeStandardWorkDurationSeedReady, false)
    assert.equal(report.runtimeSeedPostImportVerification.activeT2RhythmTemplateReady, false)
    assert.deepEqual(
      report.runtimeSeedPostImportVerification.mutationBoundary.writeBoundaryViolationFields,
      ['writesProductionTables'],
    )
    assert.equal(report.blockers.includes('active_standard_work_duration_seed_missing_for_some_rows'), true)
    assert.equal(report.blockers.includes('active_t2_rhythm_template_missing_for_some_rows'), true)
    assert.equal(report.blockers.includes('runtime_seed_post_import_mutation_boundary_write_violation'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('flags business-type and phase semantic mismatches in duration assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-semantic-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        executionLane: 'site_preparation',
        durationDays: 30,
        durationAssetStableCode: 'site_setup_temp_works',
        t2RhythmTemplateId: 't2-residential-basement-structure-handover-rhythm-v1',
        selectedDurationDays: 30,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        t2RhythmTemplateP50Days: 56,
        riskP20DurationDays: 24,
        riskP50DurationDays: 30,
        riskP80DurationDays: 42,
        durationRiskRange: { p20Days: 24, p50Days: 30, p80Days: 42, uncertaintyBandDays: 18 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        runtimeReferenceDaysConsumed: false,
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        productivityDerivedDurationDays: 16,
        selectionRule: 'project_scale_productivity_or_formula_asset_backed_candidate_l1',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 0,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
      {
        index: 2,
        code: 'BTMP-SCH-06',
        title: '竣工验收与开学移交准备',
        executionPhase: 'acceptance_handover',
        executionLane: 'school_handover',
        durationDays: 48,
        durationAssetStableCode: 'interior_public_finish',
        t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
        selectedDurationDays: 48,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 12,
        t2RhythmTemplateP50Days: 48,
        riskP20DurationDays: 36,
        riskP50DurationDays: 48,
        riskP80DurationDays: 60,
        durationRiskRange: { p20Days: 36, p50Days: 48, p80Days: 60, uncertaintyBandDays: 24 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        runtimeReferenceDaysConsumed: false,
        quantityProxyValue: 4,
        quantityProxyUnit: 'system_zone',
        productivityDerivedDurationDays: 24,
        selectionRule: 'project_scale_productivity_or_formula_asset_backed_candidate_l1',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.assetCoverage.rowsWithT2BusinessTypeMismatchCount, 1)
    assert.equal(report.assetCoverage.rowsWithDurationAssetPhaseMismatchCount, 1)
    assert.equal(report.blockers.includes('t2_business_type_mismatch_for_some_rows'), true)
    assert.equal(report.blockers.includes('duration_asset_phase_mismatch_for_some_rows'), true)
    assert.deepEqual(new Set(report.rows[0].assetGaps), new Set([
      'runtime_reference_days_missing',
      't2_business_type_mismatch',
    ]))
    assert.deepEqual(new Set(report.rows[1].assetGaps), new Set([
      'runtime_reference_days_missing',
      'duration_asset_phase_mismatch',
    ]))

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /t2_business_type_mismatch/)
    assert.match(markdown, /duration_asset_phase_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts data-center shell readiness T2 as superstructure duration evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-dc-shell-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-data-center',
    projectId: 'project-data-center',
    businessType: 'data_center',
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-DTC-01',
        title: '机房楼主体结构与设备层移交',
        executionPhase: 'superstructure_rhythm',
        executionLane: 'data_center_structure',
        durationDays: 115,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-data-center-shell-room-readiness-rhythm-v1',
        selectedDurationDays: 115,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 10,
        t2RhythmTemplateP50Days: 54,
        riskP20DurationDays: 92,
        riskP50DurationDays: 115,
        riskP80DurationDays: 138,
        durationRiskRange: { p20Days: 92, p50Days: 115, p80Days: 138, uncertaintyBandDays: 46 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        runtimeReferenceDaysConsumed: false,
        quantityProxyValue: 12,
        quantityProxyUnit: 'zone',
        productivityDerivedDurationDays: 90,
        selectionRule: 'project_scale_productivity_or_formula_asset_backed_candidate_l1',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 1,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.assetCoverage.rowsWithT2PhaseMismatchCount, 0)
    assert.equal(report.blockers.includes('t2_phase_mismatch_for_some_rows'), false)
    assert.deepEqual(report.rows[0].assetGaps, ['runtime_reference_days_missing'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks utilization review when the candidate refresh package still requires baseline refresh', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-utilization-refresh-required-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
    diff: {
      missingTargetRows: [{ code: 'BTMP-SCH-06' }],
      extraCurrentRows: [],
      codeChangedRows: [{ currentCode: 'OLD-SCH-01', targetCode: 'BTMP-SCH-01' }],
      dateOrDurationChangedRows: [],
    },
    targetReplacementRows: [
      {
        index: 1,
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        executionLane: 'site_preparation',
        durationDays: 30,
        durationAssetStableCode: 'site_setup_temp_works',
        t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
        selectedDurationDays: 30,
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        t2RhythmTemplateP50Days: 36,
        riskP20DurationDays: 24,
        riskP50DurationDays: 30,
        riskP80DurationDays: 42,
        durationRiskRange: { p20Days: 24, p50Days: 30, p80Days: 42, uncertaintyBandDays: 18 },
        totalFloatDays: 0,
        criticalPathCandidate: true,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysP50Days: 30,
        runtimeReferenceDaysSampleCount: 1,
        runtimeReferenceDaysSource: 'accepted_real_project_outcome',
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        productivityDerivedDurationDays: 16,
        selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L2',
        durationReviewGate: '',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        phaseAnchorDependencyCount: 0,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    ],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.status, 'candidate_refresh_required_before_asset_utilization_review')
    assert.equal(report.refreshGate.refreshRequired, true)
    assert.equal(report.refreshGate.missingTargetRowCount, 1)
    assert.equal(report.refreshGate.codeChangedRowCount, 1)
    assert.equal(
      report.blockers.includes('candidate_baseline_refresh_required_before_asset_utilization_review'),
      true,
    )

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_baseline_refresh_required_before_asset_utilization_review/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not count bare calendar-day metadata as consumed construction calendar', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-calendar-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    status: 'no_refresh_required',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    generatorDurationAssetUtilizationSummary: {
      source: 'default_master_plan_duration_asset_utilization_summary',
      constructionCalendarRowCount: 1,
    },
    targetReplacementRows: [{
      index: 1,
      code: 'BTMP-BASE-01',
      title: '施工准备与现场临设完成',
      executionPhase: 'startup_site_setup',
      executionLane: 'site_preparation',
      selectedDurationDays: 30,
      durationAssetStableCode: 'site_setup_temp_works',
      t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
      standardWorkDurationSeedP50Days: 8,
      t2RhythmTemplateP50Days: 36,
      quantityProxyValue: 1,
      phaseAnchorDependencyCount: 0,
      calendarBasis: 'calendar_day',
      constructionCalendarWindowCount: 0,
      durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    }],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.assetCoverage.rowsWithConstructionCalendarCount, 0)
    assert.equal(report.assetCoverage.rowsMissingConstructionCalendarCount, 1)
    assert.equal(report.generatorDurationAssetUtilizationSummary.constructionCalendarRowCount, 0)
    assert.equal(report.rows[0].durationSelection.constructionCalendar.consumed, false)
    assert.equal(report.rows[0].durationSelection.constructionCalendar.basis, 'calendar_day')
    assert.equal(report.rows[0].durationSelection.constructionCalendar.windowCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('flags construction calendar boundary violations when row dates land inside shutdown windows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-duration-asset-calendar-boundary-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'duration-asset-utilization-report.json')

  await mkdir(root, { recursive: true })
  await writeJson(refreshPackage, {
    status: 'no_refresh_required',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
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
    targetReplacementRows: [{
      index: 1,
      code: 'BTMP-BASE-01',
      title: '施工准备与现场临设完成',
      executionPhase: 'startup_site_setup',
      executionLane: 'site_preparation',
      startDate: '2026-07-03',
      endDate: '2026-07-20',
      selectedDurationDays: 12,
      durationAssetStableCode: 'site_setup_temp_works',
      t2RhythmTemplateId: 't2-school-standard-library-foundation-interface-001-rhythm-v1',
      standardWorkDurationSeedP50Days: 8,
      t2RhythmTemplateP50Days: 36,
      quantityProxyValue: 1,
      phaseAnchorDependencyCount: 0,
      calendarBasis: 'official_construction_calendar_seed',
      constructionCalendarWindowCount: 1,
      durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    }],
  })

  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      '--candidate-refresh-package',
      refreshPackage,
      '--output',
      output,
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.assetCoverage.rowsWithConstructionCalendarBoundaryViolationCount, 1)
    assert.equal(
      report.blockers.includes('construction_calendar_boundary_violation_for_some_rows'),
      true,
    )
    assert.equal(
      report.rows[0].assetGaps.includes('construction_calendar_boundary_violation'),
      true,
    )
    assert.equal(report.rows[0].durationSelection.constructionCalendar.boundaryViolation, true)
    assert.deepEqual(report.rows[0].durationSelection.constructionCalendar.boundaryViolationFields, ['startDate'])

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /construction_calendar_boundary_violation_for_some_rows/)
    assert.match(markdown, /construction_calendar_boundary_violation/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
