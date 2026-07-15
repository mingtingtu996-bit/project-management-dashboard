import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/summarize-default-master-plan-real-evidence-gaps.mjs')

test('summarizes closed local gates and remaining real evidence gaps without production mutation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-gap-summary-'))
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceSourcesPath = path.join(root, 'evidence-sources-report.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const durationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const durationAssetUtilizationPath = path.join(root, 'duration-asset-utilization-report.json')
  const completedTaskExportReportPath = path.join(root, 'completed-task-export.report.json')
  const runtimeCandidateAlignmentPreflightPath = path.join(root, 'runtime-candidate-alignment-preflight.json')
  const runtimeTaskAlignmentRefreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const operatorHandoffPath = path.join(root, 'operator-handoff.json')
  const operatorHandoffPreflightPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcomePackagePath = path.join(root, 'real-production-outcome-package.json')
  const outputPath = path.join(root, 'real-evidence-gap-summary.md')
  const jsonOutputPath = path.join(root, 'real-evidence-gap-summary.json')

  await writeJson(readinessPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'blocked',
    productionReady: false,
    currentEvidenceLevel: 'candidate_cold_start_l1',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    inputs: {
      sourceManifest: 'project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json',
    },
    businessTypeCount: 11,
    gates: [
      { id: 'legacy_serial_template_path_removed', tier: 'local_static', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', tier: 'local_static', status: 'pass' },
      {
        id: 'project_manager_review_evidence',
        tier: 'real_candidate',
        status: 'blocked',
        blockers: ['reviewed_by_required'],
      },
      {
        id: 'runtime_duration_calibration_evidence',
        tier: 'runtime_evidence',
        status: 'blocked',
        blockers: ['accepted_real_duration_sample_count_required'],
      },
      {
        id: 'runtime_publication_evidence',
        tier: 'runtime_publication',
        status: 'blocked',
        blockers: ['runtime publication evidence file not found'],
      },
    ],
  })
  await writeJson(evidenceSourcesPath, {
    schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
    status: 'blocked',
    productionReady: false,
    missingCount: 3,
    missingEvidenceTypes: [
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ],
    candidateHygieneCheck: {
      status: 'blocked',
      totalCandidateExportCount: 2,
      ignoredCandidateExportCount: 1,
      extraEligibleCandidateExportCount: 0,
      currentCandidate: null,
      blockers: ['candidate_export_hygiene_report_missing'],
    },
    sourceManifestCheck: {
      sourcePath: 'project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json',
      status: 'blocked',
      target: {
        envFileRef: 'server/.env',
        supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
        databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
        connectionSource: 'SUPABASE_MIGRATION_URL',
      },
      blockers: [
        'source_export_manifest_phase_all_required',
        'source_export_manifest_row_count_required:reviewExport',
        'source_export_manifest_row_count_required:durationSamples',
      ],
    },
  })
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'blocked',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '',
      reviewed_item_count: 0,
      reviewed_item_ids: [],
    },
    blockers: [
      'review_export_rows_required',
      'reviewed_by_required',
    ],
  })
  await writeJson(durationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'blocked',
    evidenceLevel: 'candidate_cold_start_l1',
    acceptedRealDurationSampleCount: 0,
    calibratedReferenceDayCount: 0,
    calibrationDeltaCount: 0,
    blockers: ['accepted_real_duration_samples_required'],
  })
  await writeJson(durationAssetUtilizationPath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_asset_utilization_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    rowCount: 18,
    assetCoverage: {
      rowsWithStandardWorkSeedCount: 18,
      rowsMissingStandardWorkSeedCount: 0,
      rowsWithActiveStandardWorkSeedCount: 0,
      rowsWithFallbackStandardWorkSeedCount: 18,
      rowsWithT2RhythmTemplateCount: 18,
      rowsMissingT2RhythmTemplateCount: 0,
      rowsWithActiveT2RhythmTemplateCount: 0,
      rowsWithFallbackT2RhythmTemplateCount: 18,
      rowsWithRuntimeReferenceDaysCount: 0,
      rowsMissingRuntimeReferenceDaysCount: 18,
      rowsWithQuantityOrProductivityCount: 18,
      rowsWithDependencyEvidenceCount: 18,
      rowsWithDependencyAssetCount: 2,
      rowsWithDependencyTimingAssetCount: 17,
      rowsWithProcessSeasonalDurationAssetCount: 0,
      rowsWithConstructionCalendarCount: 18,
    },
    runtimeSeedPostImportVerification: {
      status: 'runtime_seed_post_import_blocked',
      activeStandardWorkDurationSeedReady: false,
      activeT2RhythmTemplateReady: false,
    },
    businessTypeSpecialtyAssetCoverage: {
      status: 'covered',
      profileScheduleRowCount: 6,
      specialtyDurationAssetRowCount: 6,
      specificT2RhythmTemplateRowCount: 6,
    },
    blockers: [
      'active_standard_work_duration_seed_missing_for_some_rows',
      'active_t2_rhythm_template_missing_for_some_rows',
      'runtime_reference_days_missing_for_some_rows',
    ],
  })
  await writeJson(completedTaskExportReportPath, {
    schemaVersion: 'workbuddy-default-master-plan-completed-task-export-report/v1',
    status: 'blocked',
    summary: {
      requiredStableCodeCount: 18,
      rawTaskCount: 16,
      exportedTaskCount: 0,
      candidateTaskCount: 13,
      invalidTaskCount: 3,
      titleMismatchCount: 3,
      titleMatchedDifferentStableCodeCount: 3,
      missingStableCodeCount: 5,
      missingStableCodes: [
        'BTMP-SCH-02',
        'BTMP-SCH-03',
        'BTMP-SCH-04',
        'BTMP-SCH-05',
        'BTMP-SCH-06',
      ],
    },
    invalidTasks: [
      {
        id: 'task-1',
        stableCode: 'BTMP-SCH-04',
        title: '竣工验收与开学移交准备',
        expectedTitle: '食堂宿舍装修与机电收口',
        matchingRequestedStableCodeByTitle: 'BTMP-SCH-06',
        matchingRequestedTitleByTitle: '竣工验收与开学移交准备',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['completed_task_title_mismatch'],
      },
    ],
    blockers: [
      'invalid_completed_task_rows_present',
      'completed_task_export_coverage_incomplete',
    ],
  })
  await writeJson(runtimeCandidateAlignmentPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      candidateRowCount: 18,
      runtimeTaskCount: 16,
      matchedStableCodeCount: 16,
      missingRuntimeTaskCount: 2,
      titleMismatchCount: 3,
      titleMatchedDifferentStableCodeCount: 3,
      rowsWithActualDateRangeCount: 15,
      rowsMissingActualDateRangeCount: 3,
      projectMismatchCount: 0,
    },
    rows: [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        alignmentStatus: 'title_mismatch',
        matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-03',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['runtime_task_title_mismatch'],
      },
    ],
    blockers: [
      'runtime_candidate_alignment_coverage_incomplete',
      'runtime_candidate_title_mismatch_rows_present',
      'runtime_candidate_actual_date_range_missing',
    ],
  })
  await writeJson(runtimeTaskAlignmentRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    preparedBy: 'pm-reviewer-1',
    summary: {
      actionCount: 5,
      stableCodeRefreshReviewActionCount: 3,
      missingRuntimeTaskActionCount: 2,
      actualDateRangeCollectionActionCount: 2,
      collisionReviewActionCount: 1,
    },
    actions: [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_pm_review',
        blockers: ['human_project_manager_review_required'],
      },
    ],
    blockers: ['runtime_task_alignment_operator_review_required'],
    executionControl: {
      executeAllowed: false,
    },
  })
  await writeJson(operatorHandoffPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    currentBlockers: [],
  })
  await writeJson(operatorHandoffPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-operator-handoff-preflight/v1',
    status: 'blocked',
    writeExecutionBlockedActionIds: ['runtime_seed_import_execution'],
    writeExecutionBlockedActionDetails: [{
      actionId: 'runtime_seed_import_execution',
      gate: 'runtime_seed_and_reference_days_evidence',
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
          value: '1',
          blockerCodes: ['runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required'],
        }],
        requiredFlags: [{
          flag: '--allow-import',
          blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
        }],
        operatorFields: [{
          field: '--seed-smoke-user-id',
          blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
        }],
        evidenceInputs: [{
          artifact: 'runtime-seed-post-import-verification.json',
          requiredStatus: 'runtime_seed_post_import_verified',
          blockerCodes: ['runtime_seed_import_execution_post_import_verification_file_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        ],
      },
    }],
  })
  await writeJson(realProductionOutcomePackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome-package/v1',
    status: 'real_production_outcome_required',
    productionReady: false,
    targetEnvironment: 'production',
    realProductionOutcomePath: '<real-production-outcome.json>',
    realProductionOutcomeTemplate: {
      requiredFields: [
        'schemaVersion',
        'status',
        'environment',
        'target',
        'baselineId',
        'projectId',
        'publicationKey',
        'evidenceRef',
        'acceptedBy',
        'acceptedAt',
        'approvalRef',
        'runtimePublicationEvidenceRef',
        'apiReadSmokeEvidenceRef',
        'uiConsumptionSmokeEvidenceRef',
        'criticalPathReadbackEvidenceRef',
        'rollbackEvidenceRef',
      ],
    },
    blockers: ['real_production_outcome_file_required'],
    validationBlockers: [],
  })

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--readiness',
      readinessPath,
      '--evidence-sources',
      evidenceSourcesPath,
      '--review-evidence',
      reviewEvidencePath,
      '--duration-calibration-evidence',
      durationEvidencePath,
      '--duration-asset-utilization',
      durationAssetUtilizationPath,
      '--completed-task-export-report',
      completedTaskExportReportPath,
      '--runtime-candidate-alignment-preflight',
      runtimeCandidateAlignmentPreflightPath,
      '--runtime-task-alignment-refresh-package',
      runtimeTaskAlignmentRefreshPackagePath,
      '--operator-handoff',
      operatorHandoffPath,
      '--operator-handoff-preflight',
      operatorHandoffPreflightPath,
      '--real-production-outcome-package',
      realProductionOutcomePackagePath,
      '--output',
      outputPath,
      '--json-output',
      jsonOutputPath,
      '--json',
    ], { cwd: path.resolve('.') })

    const consoleSummary = JSON.parse(stdout)
    assert.equal(consoleSummary.status, 'blocked')
    assert.equal(consoleSummary.productionReady, false)
    assert.deepEqual(consoleSummary.gateSummary, {
      total: 4,
      pass: 2,
      blocked: 2,
      fail: 0,
      completionRate: 50,
    })
    assert.equal(consoleSummary.completionRate, 50)
    assert.equal(consoleSummary.missingEvidenceCount, 3)

    const summary = JSON.parse(await readFile(jsonOutputPath, 'utf8'))
    assert.equal(summary.schemaVersion, 'workbuddy-default-master-plan-real-evidence-gap-summary/v1')
    assert.deepEqual(summary.gateSummary, consoleSummary.gateSummary)
    assert.deepEqual(summary.closedLocalGateIds, [
      'legacy_serial_template_path_removed',
      'candidate_master_plan_shape_11_business_types',
    ])
    assert.equal(summary.realEvidenceGaps.offlineDevelopmentQualityReview.reviewedItemCount, 0)
    assert.equal(summary.realEvidenceGaps.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(summary.realEvidenceGaps.candidateHygiene.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.candidateHygiene.ignoredCandidateExportCount, 1)
    assert.deepEqual(summary.realEvidenceGaps.candidateHygiene.blockers, ['candidate_export_hygiene_report_missing'])
    assert.equal(summary.realEvidenceGaps.durationCalibration.acceptedRealDurationSampleCount, 0)
    assert.deepEqual(summary.realEvidenceGaps.runtimeMaterialMissingEvidenceTypes, [
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ])
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.status, 'candidate_asset_utilization_review_required')
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.businessType, 'school')
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowCount, 18)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsWithActiveStandardWorkSeedCount, 0)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsWithFallbackStandardWorkSeedCount, 18)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsWithActiveT2RhythmTemplateCount, 0)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsWithFallbackT2RhythmTemplateCount, 18)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsWithRuntimeReferenceDaysCount, 0)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.rowsMissingRuntimeReferenceDaysCount, 18)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.runtimeSeedPostImportStatus, 'runtime_seed_post_import_blocked')
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.activeStandardWorkDurationSeedReady, false)
    assert.equal(summary.realEvidenceGaps.durationAssetUtilization.activeT2RhythmTemplateReady, false)
    assert.deepEqual(summary.realEvidenceGaps.durationAssetUtilization.blockers, [
      'active_standard_work_duration_seed_missing_for_some_rows',
      'active_t2_rhythm_template_missing_for_some_rows',
      'runtime_reference_days_missing_for_some_rows',
    ])
    assert.equal(summary.realEvidenceGaps.completedTaskExport.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.completedTaskExport.requiredStableCodeCount, 18)
    assert.equal(summary.realEvidenceGaps.completedTaskExport.rawTaskCount, 16)
    assert.equal(summary.realEvidenceGaps.completedTaskExport.exportedTaskCount, 0)
    assert.equal(summary.realEvidenceGaps.completedTaskExport.titleMismatchCount, 3)
    assert.equal(summary.realEvidenceGaps.completedTaskExport.titleMatchedDifferentStableCodeCount, 3)
    assert.equal(summary.realEvidenceGaps.completedTaskExport.missingStableCodeCount, 5)
    assert.deepEqual(summary.realEvidenceGaps.completedTaskExport.missingStableCodes, [
      'BTMP-SCH-02',
      'BTMP-SCH-03',
      'BTMP-SCH-04',
      'BTMP-SCH-05',
      'BTMP-SCH-06',
    ])
    assert.deepEqual(summary.realEvidenceGaps.completedTaskExport.invalidTaskExamples, [
      {
        id: 'task-1',
        stableCode: 'BTMP-SCH-04',
        title: '竣工验收与开学移交准备',
        expectedTitle: '食堂宿舍装修与机电收口',
        matchingRequestedStableCodeByTitle: 'BTMP-SCH-06',
        matchingRequestedTitleByTitle: '竣工验收与开学移交准备',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['completed_task_title_mismatch'],
      },
    ])
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.candidateRowCount, 18)
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.runtimeTaskCount, 16)
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.missingRuntimeTaskCount, 2)
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.titleMismatchCount, 3)
    assert.equal(summary.realEvidenceGaps.runtimeCandidateAlignment.rowsMissingActualDateRangeCount, 3)
    assert.deepEqual(summary.realEvidenceGaps.runtimeCandidateAlignment.driftExamples, [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        alignmentStatus: 'title_mismatch',
        matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-03',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['runtime_task_title_mismatch'],
      },
    ])
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.status, 'runtime_task_alignment_refresh_review_required')
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actionCount, 5)
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount, 3)
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount, 2)
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount, 2)
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount, 1)
    assert.equal(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.executeAllowed, false)
    assert.deepEqual(summary.realEvidenceGaps.runtimeTaskAlignmentRefreshPackage.actionExamples, [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_pm_review',
        blockers: ['human_project_manager_review_required'],
      },
    ])
    const runtimeAlignmentGroup = summary.prioritizedNextActionGroups.find((group) => group.id === 'runtime_task_alignment_and_duration_samples')
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.completedTaskExport.requiredStableCodeCount, 18)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.completedTaskExport.exportedTaskCount, 0)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.completedTaskExport.invalidTaskCount, 3)
    assert.deepEqual(runtimeAlignmentGroup.durationAlignmentPlan.completedTaskExport.missingStableCodes, [
      'BTMP-SCH-02',
      'BTMP-SCH-03',
      'BTMP-SCH-04',
      'BTMP-SCH-05',
      'BTMP-SCH-06',
    ])
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.completedTaskExport.invalidTaskExamples[0].stableCode, 'BTMP-SCH-04')
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.candidateRowCount, 18)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.runtimeTaskCount, 16)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.missingRuntimeTaskCount, 2)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.titleMismatchCount, 3)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.rowsMissingActualDateRangeCount, 3)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeCandidateAlignment.driftExamples[0].stableCode, 'BTMP-SCH-02')
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.status, 'runtime_task_alignment_refresh_review_required')
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.actionCount, 5)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount, 3)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount, 2)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount, 2)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.executeAllowed, false)
    assert.equal(runtimeAlignmentGroup.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.actionExamples[0].actionKind, 'review_runtime_task_stable_code_refresh')
    assert.deepEqual(summary.blockedGateActionCoverageSummary, {
      totalBlockedGateCount: 2,
      coveredBlockedGateCount: 2,
      uncoveredBlockedGateCount: 0,
      coverageRate: 100,
      coveredBlockedGateIds: [
        'runtime_duration_calibration_evidence',
        'runtime_publication_evidence',
      ],
      uncoveredBlockedGateIds: [],
      coveringActionGroupIds: [
        'runtime_task_alignment_and_duration_samples',
        'production_live_outcome_evidence',
      ],
    })
    assert.deepEqual(summary.blockedGateActionCoverage, [
      {
        gateId: 'runtime_duration_calibration_evidence',
        tier: 'runtime_evidence',
        status: 'blocked',
        blockerCount: 1,
        covered: true,
        coveredByActionGroupIds: ['runtime_task_alignment_and_duration_samples'],
        uncoveredBlockers: [],
      },
      {
        gateId: 'runtime_publication_evidence',
        tier: 'runtime_publication',
        status: 'blocked',
        blockerCount: 1,
        covered: true,
        coveredByActionGroupIds: ['production_live_outcome_evidence'],
        uncoveredBlockers: [],
      },
    ])
    assert.deepEqual(summary.realEvidenceGaps.sourceManifest.target, {
      envFileRef: 'server/.env',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
    })
    assert.equal(summary.mutationBoundary.writesProductionTables, false)
    assert.equal(summary.mutationBoundary.writesRuntimePublication, false)

    const markdown = await readFile(outputPath, 'utf8')
    assert.match(markdown, /# Default Master Plan Real Evidence Gap Summary/)
    assert.match(markdown, /Production ready: no/)
    assert.match(markdown, /Already Closed Locally/)
    assert.match(markdown, /legacy_serial_template_path_removed/)
    assert.match(markdown, /Still Blocked By Real Evidence/)
    assert.match(markdown, /Blocked Gate Action Coverage/)
    assert.match(markdown, /coverage: 2\/2 \(100%\)/)
    assert.match(markdown, /runtime_duration_calibration_evidence -> runtime_task_alignment_and_duration_samples/)
    assert.match(markdown, /runtime_publication_evidence -> production_live_outcome_evidence/)
    assert.doesNotMatch(markdown, /project_manager_review_evidence -> uncovered/)
    assert.match(markdown, /Candidate Export Hygiene/)
    assert.match(markdown, /candidate_export_hygiene_report_missing/)
    assert.match(markdown, /dependencyWriterEvidence/)
    assert.match(markdown, /Duration Asset Utilization/)
    assert.match(markdown, /activeStandardWorkDurationSeedRows: 0\/18/)
    assert.match(markdown, /activeT2RhythmTemplateRows: 0\/18/)
    assert.match(markdown, /runtimeReferenceDaysRows: 0\/18/)
    assert.match(markdown, /duration_asset_utilization_blocker: active_standard_work_duration_seed_missing_for_some_rows/)
    assert.match(markdown, /Completed Task Export Alignment/)
    assert.match(markdown, /titleMismatchCount: 3/)
    assert.match(markdown, /missingStableCodes: BTMP-SCH-02, BTMP-SCH-03, BTMP-SCH-04, BTMP-SCH-05, BTMP-SCH-06/)
    assert.match(markdown, /BTMP-SCH-04/)
    assert.match(markdown, /食堂宿舍装修与机电收口/)
    assert.match(markdown, /refresh_runtime_task_stable_code_or_collect_current_completed_task/)
    assert.match(markdown, /completed_task_export_blocker: invalid_completed_task_rows_present/)
    assert.match(markdown, /Runtime Candidate Alignment/)
    assert.match(markdown, /missingRuntimeTaskCount: 2/)
    assert.match(markdown, /rowsMissingActualDateRangeCount: 3/)
    assert.match(markdown, /runtime_candidate_alignment_blocker: runtime_candidate_title_mismatch_rows_present/)
    assert.match(markdown, /BTMP-SCH-02/)
    assert.match(markdown, /实验室通风与专业机电安装/)
    assert.match(markdown, /Runtime Task Alignment Refresh Package/)
    assert.match(markdown, /stableCodeRefreshReviewActionCount: 3/)
    assert.match(markdown, /missingRuntimeTaskActionCount: 2/)
    assert.match(markdown, /runtime_task_alignment_refresh_package_blocker: runtime_task_alignment_operator_review_required/)
    assert.match(markdown, /duration_alignment_completed_task_export_required_stable_codes: 18/)
    assert.match(markdown, /duration_alignment_runtime_candidate_title_mismatches: 3/)
    assert.match(markdown, /duration_alignment_refresh_package_actions: 5/)
    assert.match(markdown, /supabaseProjectRef: wwdrkjnbvcbfytwnnyvs/)
    assert.match(markdown, /databaseHost: db\.wwdrkjnbvcbfytwnnyvs\.supabase\.co/)
    assert.match(markdown, /source_export_manifest_phase_all_required/)
    assert.match(markdown, /reviewed_by_required/)
    assert.match(markdown, /accepted_real_duration_samples_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes runtime seed and duration sample collection blockers from production pipeline supporting evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-gap-summary-supporting-'))
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceSourcesPath = path.join(root, 'evidence-sources-report.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const durationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const runtimeSeedEvidencePipelinePath = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const runtimeSeedImportReadinessSealPath = path.join(root, 'runtime-seed-import-readiness-seal.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const realDurationSampleMaterialTemplatePath = path.join(root, 'real-duration-sample-material.template.json')
  const realDurationSampleMaterialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')
  const realDurationSampleSourceExportPath = path.join(root, 'duration-experience-samples-export.json')
  const realDurationSampleSourceExportReportPath = path.join(root, 'duration-experience-samples-export.report.json')
  const operatorHandoffPath = path.join(root, 'operator-handoff.json')
  const operatorHandoffPreflightPath = path.join(root, 'operator-handoff-preflight.json')
  const outputPath = path.join(root, 'real-evidence-gap-summary.md')
  const jsonOutputPath = path.join(root, 'real-evidence-gap-summary.json')

  await writeJson(readinessPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'blocked',
    productionReady: false,
    gates: [{
      id: 'runtime_seed_and_reference_days_evidence',
      tier: 'runtime_evidence',
      status: 'blocked',
      blockers: ['runtime_reference_days_evidence_missing'],
    }, {
      id: 'duration_sample_collection_package',
      tier: 'runtime_evidence',
      status: 'blocked',
      blockers: ['accepted_real_duration_samples_required'],
    }],
  })
  await writeJson(evidenceSourcesPath, {
    schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
    status: 'blocked',
    missingEvidenceTypes: [],
    sourceManifestCheck: {
      status: 'blocked',
      blockers: ['source_export_manifest_required'],
    },
  })
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    status: 'not_provided',
  })
  await writeJson(durationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    status: 'not_provided',
  })
  await writeJson(runtimeSeedEvidencePipelinePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    status: 'runtime_seed_import_blocked',
    blockers: [
      'runtime_reference_days_evidence_missing',
      'local_supabase_must_be_reachable_before_seed_import',
    ],
    summary: {
      preflight: {
        status: 'blocked',
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 10,
        requiredRuntimeSeedStableCodeCount: 19,
        runtimeReferenceDays: {
          readyBusinessTypeCount: 0,
          missingBusinessTypeCount: 10,
          missingBusinessTypes: ['school', 'hospital'],
          requiredRuntimeReferenceStableCodeCount: 60,
          requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01', 'BTMP-HSP-01'],
        },
      },
      coverage: {
        status: 'ts_seed_coverage_complete_runtime_import_still_required',
        requiredStableCodeCount: 19,
        coveredStableCodeCount: 19,
        missingStableCodeCount: 0,
        runtimeSeedImportRequired: true,
        runtimeSeedEvidenceAlreadyReady: false,
      },
      importGate: {
        status: 'runtime_seed_import_blocked',
        importAllowed: false,
        importRequired: true,
        blockers: ['local_supabase_must_be_reachable_before_seed_import'],
        manualActions: ['start local Supabase and rerun runtime seed environment evidence'],
      },
      environment: {
        status: 'blocked',
        targetClass: 'local_supabase',
        localSupabaseReachable: false,
        environmentBlockers: [
          'local_supabase_endpoint_unreachable',
          'docker_cli_missing_for_local_supabase',
        ],
        repairPlan: {
          status: 'blocked',
          noAutoInstall: true,
          requiredStepIds: [
            'install_or_start_docker',
            'start_local_supabase',
          ],
          blockedStepIds: [
            'rerun_runtime_seed_pipeline',
          ],
          orderedStepCount: 5,
          orderedSteps: [
            {
              id: 'install_or_start_docker',
              status: 'required',
              blockerCodes: ['docker_cli_missing_for_local_supabase'],
              commands: ['docker version'],
              verificationCommands: ['docker version'],
            },
            {
              id: 'start_local_supabase',
              status: 'required',
              blockerCodes: ['local_supabase_endpoint_unreachable'],
              commands: ['supabase start'],
              verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
            },
            {
              id: 'rerun_runtime_seed_pipeline',
              status: 'blocked_by_previous_steps',
              blockerCodes: ['local_supabase_endpoint_unreachable'],
              commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
              verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
            },
          ],
        },
      },
    },
  })
  await writeJson(runtimeSeedImportReadinessSealPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-readiness-seal/v1',
    status: 'blocked',
    productionReady: false,
    importGateStatus: 'runtime_seed_import_blocked',
    executionStatus: 'runtime_seed_import_execution_blocked',
    importCommandReady: false,
    unlock: {
      variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
      present: false,
    },
    executionControl: {
      executeReady: false,
      operatorMustRunManually: true,
      doesNotRunRuntimeSeedImport: true,
    },
    blockers: [
      'runtime_seed_import_gate_not_allowed',
      'runtime_seed_import_execution_allow_import_required',
    ],
    mutationBoundary: {
      commandsExecuted: 0,
      doesNotRunRuntimeSeedImport: true,
      doesNotConnectDatabase: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    blockers: ['accepted_real_duration_samples_required'],
    requiredStableCodeCount: 60,
    totalRequiredAcceptedSampleCount: 60,
    profileRuntimeReferenceSampleRequestCount: 60,
    durationGapPlanSampleRequestCount: 0,
    sampleRequests: [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      requiredAcceptedSampleCount: 1,
      currentAcceptedSampleCount: 0,
      businessType: 'school',
    }, {
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      requiredAcceptedSampleCount: 1,
      currentAcceptedSampleCount: 0,
      businessType: 'hospital',
    }],
  })
  await writeJson(realDurationSampleMaterialTemplatePath, {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    source: 'build-default-master-plan-real-duration-sample-material-template',
    materialTemplate: true,
    templateStatus: 'operator_input_required',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    collectionPackageRef: `duration_sample_collection_package:${durationSampleCollectionPackagePath}`,
    operatorInstructions: {
      noWriteBoundary: 'template_only_no_db_write',
      rejectedMarkers: ['materialTemplate=true'],
    },
    samples: [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      sampleStatus: 'draft',
      includedInBenchmark: false,
      metadata: {
        materialTemplate: true,
        templatePlaceholder: true,
      },
    }],
  })
  await writeJson(realDurationSampleMaterialPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-preflight/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    checkedBy: 'release-operator-1',
    collectionPackageRef: `duration_sample_collection_package:${durationSampleCollectionPackagePath}#sha256=test`,
    sampleMaterialRef: `real_duration_sample_material:${realDurationSampleMaterialTemplatePath}#sha256=test`,
    materialSourceEvidencePlaceholderFindings: [
      {
        field: 'sourceName',
        value: '<required: completed project/task source name>',
      },
    ],
    summary: {
      requiredStableCodeCount: 2,
      readyStableCodeCount: 1,
      missingStableCodeCount: 1,
      rawSampleCount: 2,
      readySampleCount: 1,
      invalidSampleCount: 1,
      missingStableCodes: ['BTMP-HSP-01'],
      readyStableCodes: ['BTMP-SCH-01'],
    },
    rows: [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 1,
      readySampleIds: ['sample-sch-01'],
      missingSampleCount: 0,
      coverageStatus: 'ready',
    }, {
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 0,
      missingSampleCount: 1,
      coverageStatus: 'missing_samples',
    }],
    invalidSamples: [{
      id: '<required: real-sample-id-for-BTMP-HSP-01>',
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      blockers: [
        'real_duration_sample_template_material_must_be_filled_before_export',
      ],
    }],
    blockers: [
      'material_source_evidence_placeholders_present',
      'real_duration_sample_material_template_must_be_filled',
      'invalid_real_duration_sample_material_present',
      'accepted_real_duration_sample_material_coverage_incomplete',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })
  await writeJson(realDurationSampleSourceExportPath, {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: {
      source: 'duration_experience_samples',
      source_kind: 'blocked_real_duration_sample_material',
      blocked: true,
      table: 'public.duration_experience_samples',
      material_preflight_ref: `real_duration_sample_material_preflight:${realDurationSampleMaterialPreflightPath}#sha256=test`,
      collection_package_ref: `${durationSampleCollectionPackagePath}#sha256=test`,
      exported_at: '2026-07-05T08:25:00.000Z',
      exported_by: '',
      environment: '',
      baseline_id: 'baseline-reviewed',
      project_id: 'project-1',
      mutation_boundary: {
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesDurationSamples: false,
        writesRuntimePublication: false,
        performsRollback: false,
      },
    },
    rows: [],
  })
  await writeJson(realDurationSampleSourceExportReportPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-source-export/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    sourceExportRef: `duration_experience_samples_export:${realDurationSampleSourceExportPath}`,
    summary: {
      requiredStableCodeCount: 2,
      rawSampleCount: 2,
      exportedSampleCount: 1,
      invalidSampleCount: 1,
      missingStableCodeCount: 1,
      missingStableCodes: ['BTMP-HSP-01'],
    },
    blockers: [
      'real_duration_sample_material_preflight_not_ready',
      'exported_by_required',
      'real_environment_required',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  })
  await writeJson(operatorHandoffPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    currentBlockers: [],
  })
  await writeJson(operatorHandoffPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-operator-handoff-preflight/v1',
    status: 'blocked',
    writeExecutionBlockedActionIds: ['runtime_seed_import_execution'],
    writeExecutionBlockedActionDetails: [{
      actionId: 'runtime_seed_import_execution',
      gate: 'runtime_seed_and_reference_days_evidence',
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
          value: '1',
          blockerCodes: ['runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required'],
        }],
        requiredFlags: [{
          flag: '--allow-import',
          blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
        }],
        operatorFields: [{
          field: '--seed-smoke-user-id',
          blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
        }],
        evidenceInputs: [{
          artifact: 'runtime-seed-post-import-verification.json',
          requiredStatus: 'runtime_seed_post_import_verified',
          blockerCodes: ['runtime_seed_import_execution_post_import_verification_file_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        ],
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--readiness',
      readinessPath,
      '--evidence-sources',
      evidenceSourcesPath,
      '--review-evidence',
      reviewEvidencePath,
      '--duration-calibration-evidence',
      durationEvidencePath,
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipelinePath,
      '--runtime-seed-import-readiness-seal',
      runtimeSeedImportReadinessSealPath,
      '--duration-sample-collection-package',
      durationSampleCollectionPackagePath,
      '--real-duration-sample-material-template',
      realDurationSampleMaterialTemplatePath,
      '--real-duration-sample-material-preflight',
      realDurationSampleMaterialPreflightPath,
      '--real-duration-sample-source-export',
      realDurationSampleSourceExportPath,
      '--real-duration-sample-source-export-report',
      realDurationSampleSourceExportReportPath,
      '--operator-handoff',
      operatorHandoffPath,
      '--operator-handoff-preflight',
      operatorHandoffPreflightPath,
      '--output',
      outputPath,
      '--json-output',
      jsonOutputPath,
      '--json',
    ], { cwd: path.resolve('.') })

    const summary = JSON.parse(await readFile(jsonOutputPath, 'utf8'))
    const markdown = await readFile(outputPath, 'utf8')

    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.status, 'runtime_seed_import_blocked')
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.targetClass, 'local_supabase')
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.localSupabaseReachable, false)
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.environmentBlockers, [
      'local_supabase_endpoint_unreachable',
      'docker_cli_missing_for_local_supabase',
    ])
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.requiredStepIds, [
      'install_or_start_docker',
      'start_local_supabase',
    ])
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.blockedStepIds, [
      'rerun_runtime_seed_pipeline',
    ])
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.environment.repairPlan.orderedSteps.map((step) => step.id), [
      'install_or_start_docker',
      'start_local_supabase',
      'rerun_runtime_seed_pipeline',
    ])
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.missingBusinessTypeCount, 10)
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.runtimeReferenceDays.missingBusinessTypes, ['school', 'hospital'])
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.coverage.missingStableCodeCount, 0)
    assert.equal(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.importRequired, true)
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedEvidencePipeline.importGate.manualActions, [
      'start local Supabase and rerun runtime seed environment evidence',
    ])
    assert.equal(
      summary.inputs.runtimeSeedImportReadinessSeal.endsWith('runtime-seed-import-readiness-seal.json'),
      true,
    )
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.productionReady, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.importGateStatus, 'runtime_seed_import_blocked')
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.executionStatus, 'runtime_seed_import_execution_blocked')
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.importCommandReady, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.unlockVariable, 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT')
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.unlockPresent, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.executeReady, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.operatorMustRunManually, true)
    assert.deepEqual(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.blockers, [
      'runtime_seed_import_gate_not_allowed',
      'runtime_seed_import_execution_allow_import_required',
    ])
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.doesNotRunRuntimeSeedImport, true)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.doesNotConnectDatabase, true)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.commandsExecuted, 0)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedVersions, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedRecords, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesAlgorithmSeedImportLogs, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesTasks, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesTaskDependencies, false)
    assert.equal(summary.realEvidenceGaps.runtimeSeedImportReadinessSeal.writesRuntimePublication, false)
    assert.equal(summary.realEvidenceGaps.durationSampleCollectionPackage.status, 'samples_required')
    assert.equal(summary.realEvidenceGaps.durationSampleCollectionPackage.requiredStableCodeCount, 60)
    assert.equal(summary.realEvidenceGaps.durationSampleCollectionPackage.profileRuntimeReferenceSampleRequestCount, 60)
    assert.equal(
      summary.inputs.realDurationSampleMaterialTemplate.endsWith('real-duration-sample-material.template.json'),
      true,
    )
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialTemplate.templateStatus, 'operator_input_required')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialTemplate.templateSampleCount, 1)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialTemplate.materialTemplate, true)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialTemplate.noWriteBoundary, 'template_only_no_db_write')
    assert.equal(
      summary.inputs.realDurationSampleMaterialPreflight.endsWith('real-duration-sample-material-preflight.json'),
      true,
    )
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.productionReady, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.baselineId, 'baseline-reviewed')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.projectId, 'project-1')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.checkedBy, 'release-operator-1')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.requiredStableCodeCount, 2)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readyStableCodeCount, 1)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.missingStableCodeCount, 1)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.invalidSampleCount, 1)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.missingStableCodes, ['BTMP-HSP-01'])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.coverageByBusinessType, [{
      businessType: 'hospital',
      requiredStableCodeCount: 1,
      readyStableCodeCount: 0,
      missingStableCodeCount: 1,
      invalidSampleCount: 1,
      missingStableCodes: ['BTMP-HSP-01'],
      readyStableCodes: [],
    }, {
      businessType: 'school',
      requiredStableCodeCount: 1,
      readyStableCodeCount: 1,
      missingStableCodeCount: 0,
      invalidSampleCount: 0,
      missingStableCodes: [],
      readyStableCodes: ['BTMP-SCH-01'],
    }])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.nextSampleCollectionTargets, [{
      priority: 1,
      businessType: 'hospital',
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 0,
      missingSampleCount: 1,
      invalidSampleCount: 1,
      nextAction: 'collect_accepted_real_duration_sample',
    }])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.readySampleExamples, [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      readySampleCount: 1,
      readySampleIds: ['sample-sch-01'],
    }])
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.materialSourceEvidencePlaceholderFindingCount, 1)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.blockers, [
      'material_source_evidence_placeholders_present',
      'real_duration_sample_material_template_must_be_filled',
      'invalid_real_duration_sample_material_present',
      'accepted_real_duration_sample_material_coverage_incomplete',
    ])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.invalidSampleExamples, [{
      id: '<required: real-sample-id-for-BTMP-HSP-01>',
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      blockers: ['real_duration_sample_template_material_must_be_filled_before_export'],
    }])
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesDurationSamples, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialPreflight.writesRuntimePublication, false)
    assert.equal(
      summary.inputs.realDurationSampleSourceExport.endsWith('duration-experience-samples-export.json'),
      true,
    )
    assert.equal(
      summary.inputs.realDurationSampleSourceExportReport.endsWith('duration-experience-samples-export.report.json'),
      true,
    )
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.productionReady, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.sourceKind, 'blocked_real_duration_sample_material')
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.blocked, true)
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.rowCount, 0)
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.exportedSampleCount, 1)
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.missingStableCodeCount, 1)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleSourceExport.missingStableCodes, ['BTMP-HSP-01'])
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.exportedBy, '')
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.environment, '')
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleSourceExport.blockers, [
      'real_duration_sample_material_preflight_not_ready',
      'exported_by_required',
      'real_environment_required',
    ])
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.writesDurationSamples, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleSourceExport.writesRuntimePublication, false)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialTemplate.sampleRequestExamples, [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      sampleStatus: 'draft',
      includedInBenchmark: false,
    }])
    assert.deepEqual(summary.realEvidenceGaps.durationSampleCollectionPackage.sampleRequestExamples, [{
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      requiredAcceptedSampleCount: 1,
      currentAcceptedSampleCount: 0,
      businessType: 'school',
    }, {
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      requiredAcceptedSampleCount: 1,
      currentAcceptedSampleCount: 0,
      businessType: 'hospital',
    }])
    assert.match(markdown, /Runtime Seed And Reference Days/)
    assert.match(markdown, /repairPlanRequiredStepIds: install_or_start_docker, start_local_supabase/)
    assert.match(markdown, /repairPlanNoAutoInstall: yes/)
    assert.match(markdown, /repairPlanOrderedStepIds: install_or_start_docker, start_local_supabase, rerun_runtime_seed_pipeline/)
    assert.match(markdown, /runtime_reference_days_evidence_missing/)
    assert.match(markdown, /local_supabase_must_be_reachable_before_seed_import/)
    assert.match(markdown, /Runtime Seed Import Readiness Seal/)
    assert.match(markdown, /importCommandReady: no/)
    assert.match(markdown, /unlockVariable: WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT/)
    assert.match(markdown, /runtime_seed_import_readiness_seal_blocker: runtime_seed_import_gate_not_allowed/)
    assert.match(markdown, /doesNotRunRuntimeSeedImport: yes/)
    assert.match(markdown, /writesAlgorithmSeedRecords: no/)
    assert.match(markdown, /Duration Sample Collection Package/)
    assert.match(markdown, /accepted_real_duration_samples_required/)
    assert.match(markdown, /Real Duration Sample Material Template/)
    assert.match(markdown, /template_only_no_db_write/)
    assert.match(markdown, /Real Duration Sample Material Preflight/)
    assert.match(markdown, /readyStableCodeCount: 1/)
    assert.match(markdown, /missingStableCodes: BTMP-HSP-01/)
    assert.match(markdown, /\| hospital \| 1 \| 0 \| 1 \| 1 \| none \| BTMP-HSP-01 \|/)
    assert.match(markdown, /\| school \| 1 \| 1 \| 0 \| 0 \| BTMP-SCH-01 \| none \|/)
    assert.match(markdown, /Next Sample Collection Targets/)
    assert.match(markdown, /\| 1 \| hospital \| BTMP-HSP-01 \| 门急诊楼主体结构与功能移交 \| 1 \| 0 \| 1 \| 1 \| collect_accepted_real_duration_sample \|/)
    assert.match(markdown, /\| BTMP-SCH-01 \| 教学楼基础与地下结构 \| 1 \| sample-sch-01 \|/)
    assert.match(markdown, /real_duration_sample_material_preflight_blocker: material_source_evidence_placeholders_present/)
    assert.match(markdown, /writesDurationSamples: no/)
    assert.match(markdown, /Real Duration Sample Source Export/)
    assert.match(markdown, /sourceKind: blocked_real_duration_sample_material/)
    assert.match(markdown, /rowCount: 0/)
    assert.match(markdown, /real_duration_sample_source_export_blocker: real_duration_sample_material_preflight_not_ready/)
    assert.match(markdown, /real_duration_sample_source_export_blocker: real_environment_required/)
    assert.match(markdown, /BTMP-SCH-01/)
    const runtimeSeedGroup = summary.prioritizedNextActionGroups.find((group) => group.id === 'runtime_seed_local_environment_and_import')
    assert.equal(runtimeSeedGroup.repairPlan.status, 'blocked')
    assert.equal(runtimeSeedGroup.repairPlan.targetClass, 'local_supabase')
    assert.deepEqual(runtimeSeedGroup.repairPlan.requiredStepIds, [
      'install_or_start_docker',
      'start_local_supabase',
    ])
    assert.deepEqual(runtimeSeedGroup.repairPlan.orderedSteps.map((step) => step.id), [
      'install_or_start_docker',
      'start_local_supabase',
      'rerun_runtime_seed_pipeline',
    ])
    const runtimeSeedPipelineExecutionCommand = summary.operatorCommandExecutionPlan.find((entry) => (
      entry.command === 'npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'
    ))
    assert.deepEqual(runtimeSeedPipelineExecutionCommand, {
      command: 'npm.cmd run evidence:default-master-plan:runtime-seed-pipeline',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_seed_local_environment_and_import'],
      commandSources: [
        'action_group_command',
        'repair_plan:rerun_runtime_seed_pipeline:command',
        'repair_plan:rerun_runtime_seed_pipeline:verification',
      ],
      duplicateCount: 3,
    })
    const runtimeSeedImportReadinessQueueCommand = summary.operatorCommandExecutionQueues.readOnlyEvidence.find((entry) => (
      entry.command === 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs'
    ))
    assert.deepEqual(runtimeSeedImportReadinessQueueCommand, {
      command: 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_seed_local_environment_and_import'],
      commandSources: ['operator_requirement:runtime_seed_import_execution:verification'],
      duplicateCount: 1,
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
    })
    assert.deepEqual(runtimeSeedGroup.operatorRequirements, [{
      actionId: 'runtime_seed_import_execution',
      gate: 'runtime_seed_and_reference_days_evidence',
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
          value: '1',
          blockerCodes: ['runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required'],
        }],
        requiredFlags: [{
          flag: '--allow-import',
          blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
        }],
        operatorFields: [{
          field: '--seed-smoke-user-id',
          blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
        }],
        evidenceInputs: [{
          artifact: 'runtime-seed-post-import-verification.json',
          requiredStatus: 'runtime_seed_post_import_verified',
          blockerCodes: ['runtime_seed_import_execution_post_import_verification_file_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        ],
      },
    }])
    assert.match(markdown, /operator_requirement_action: runtime_seed_import_execution \| runtime_seed_and_reference_days_evidence/)
    assert.match(markdown, /operator_requirement_env_unlock: runtime_seed_import_execution \| WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1/)
    assert.match(markdown, /operator_requirement_flag: runtime_seed_import_execution \| --allow-import/)
    assert.match(markdown, /operator_requirement_operator_field: runtime_seed_import_execution \| --seed-smoke-user-id/)
    assert.match(markdown, /operator_requirement_evidence_input: runtime_seed_import_execution \| runtime-seed-post-import-verification.json => runtime_seed_post_import_verified/)
    assert.match(markdown, /operator_requirement_verification_command: runtime_seed_import_execution \| node project-testing\/tools\/check-default-master-plan-runtime-seed-import-readiness\.mjs/)
    assert.match(markdown, /repair_required_step: install_or_start_docker/)
    assert.match(markdown, /repair_step: rerun_runtime_seed_pipeline \[blocked_by_previous_steps\]/)
    const durationAlignmentGroup = summary.prioritizedNextActionGroups.find((group) => group.id === 'runtime_task_alignment_and_duration_samples')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.status, 'blocked')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.requiredStableCodeCount, 2)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.readyStableCodeCount, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.missingStableCodeCount, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.checkedBy, 'release-operator-1')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].priority, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].businessType, 'hospital')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].stableCode, 'BTMP-HSP-01')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].requiredAcceptedSampleCount, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].readySampleCount, 0)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].missingSampleCount, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].invalidSampleCount, 1)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].nextAction, 'collect_accepted_real_duration_sample')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.readySampleExamples[0].stableCode, 'BTMP-SCH-01')
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.readySampleExamples[0].readySampleCount, 1)
    assert.deepEqual(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.readySampleExamples[0].readySampleIds, ['sample-sch-01'])
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.writesDurationSamples, false)
    assert.equal(durationAlignmentGroup.durationAlignmentPlan.realDurationSampleMaterialPreflight.writesRuntimePublication, false)
    assert.match(markdown, /duration_alignment_sample_preflight_status: blocked/)
    assert.match(markdown, /duration_alignment_next_sample_target: 1 \| hospital \| BTMP-HSP-01 \| 1 missing/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces candidate refresh DB repair plan in prioritized action groups', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-gap-summary-candidate-refresh-'))
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceSourcesPath = path.join(root, 'evidence-sources-report.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const durationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const operatorHandoffPath = path.join(root, 'operator-handoff.json')
  const operatorHandoffPreflightPath = path.join(root, 'operator-handoff-preflight.json')
  const candidateRefreshAuthorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const candidateRefreshExecutionReadinessSealPath = path.join(root, 'candidate-refresh-execution-readiness-seal.json')
  const candidateBaselineMaterializationReadinessSealPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')
  const outputPath = path.join(root, 'real-evidence-gap-summary.md')
  const jsonOutputPath = path.join(root, 'real-evidence-gap-summary.json')

  await writeJson(readinessPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'blocked',
    productionReady: false,
    currentEvidenceLevel: 'candidate_reviewed_l1',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    gates: [{
      id: 'candidate_refresh_execution',
      tier: 'db_dependent',
      status: 'blocked',
      blockers: [
        'candidate_refresh_db_connection_failed',
        'candidate_refresh_db_execution_failed',
      ],
    }],
  })
  await writeJson(evidenceSourcesPath, {
    schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
    status: 'blocked',
    missingEvidenceTypes: [],
    candidateHygieneCheck: {
      status: 'pass',
      totalCandidateExportCount: 1,
      ignoredCandidateExportCount: 0,
      extraEligibleCandidateExportCount: 0,
      blockers: [],
    },
    sourceManifestCheck: {
      status: 'blocked',
      target: {
        envFileRef: 'server/.env',
        supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
        databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
        connectionSource: 'SUPABASE_MIGRATION_URL',
      },
      blockers: ['candidate_refresh_db_connection_failed'],
    },
  })
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    status: 'pass',
    blockers: [],
  })
  await writeJson(durationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    status: 'not_provided',
  })
  await writeJson(operatorHandoffPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'runtime.default_master_plan.project-1',
    environment: 'staging',
    currentBlockers: [
      'candidate_baseline_refresh_required_before_runtime_publication',
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
      'candidate_baseline_materialization_unlock_required',
    ],
    candidateRefreshExecution: {
      status: 'candidate_refresh_execution_failed',
      blockers: [
        'candidate_refresh_execution_unlock_required',
        'candidate_refresh_execution_allow_refresh_required',
        'candidate_refresh_operator_approval_required',
        'candidate_refresh_db_connection_failed',
        'candidate_refresh_db_execution_failed',
      ],
      executionGatePlan: {
        status: 'blocked',
        noAutoExecution: true,
        requiredStepIds: [
          'set_candidate_refresh_execution_unlock',
          'run_candidate_refresh_in_execute_mode_with_allow_flag',
          'record_candidate_refresh_operator_approval_and_actor',
        ],
        blockedStepIds: [
          'rerun_candidate_refresh_execution_after_gate',
        ],
        orderedStepCount: 4,
        orderedSteps: [
          {
            id: 'set_candidate_refresh_execution_unlock',
            status: 'required',
            blockerCodes: ['candidate_refresh_execution_unlock_required'],
          },
          {
            id: 'run_candidate_refresh_in_execute_mode_with_allow_flag',
            status: 'required',
            blockerCodes: ['candidate_refresh_execution_allow_refresh_required'],
          },
          {
            id: 'record_candidate_refresh_operator_approval_and_actor',
            status: 'required',
            blockerCodes: ['candidate_refresh_operator_approval_required'],
          },
          {
            id: 'rerun_candidate_refresh_execution_after_gate',
            status: 'blocked_by_previous_steps',
            blockerCodes: ['candidate_refresh_execution_unlock_required'],
          },
        ],
      },
      dbRepairPlan: {
        status: 'blocked',
        failureClass: 'connection_timeout',
        noAutoCredentialRotation: true,
        requiredStepIds: [
          'confirm_candidate_refresh_target_identity',
          'repair_or_rotate_candidate_refresh_db_credentials',
        ],
        blockedStepIds: [
          'rerun_candidate_refresh_execution',
        ],
        orderedStepCount: 3,
        orderedSteps: [
          {
            id: 'confirm_candidate_refresh_target_identity',
            status: 'required',
            blockerCodes: ['candidate_refresh_db_connection_failed'],
          },
          {
            id: 'repair_or_rotate_candidate_refresh_db_credentials',
            status: 'required',
            blockerCodes: ['candidate_refresh_db_connection_failed'],
          },
          {
            id: 'rerun_candidate_refresh_execution',
            status: 'blocked_by_previous_steps',
            blockerCodes: ['candidate_refresh_db_execution_failed'],
          },
        ],
      },
      nextActions: [
        'Confirm the target database identity before rerunning candidate refresh.',
      ],
    },
  })
  await writeJson(operatorHandoffPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-operator-handoff-preflight/v1',
    status: 'blocked',
    sourceExportMode: 'supporting_non_production',
    mayRunSupportingSourceExport: true,
    mayRunProductionSourceExport: false,
    mayRunSourceExport: false,
    mayAcceptRealProductionOutcomeEvidence: false,
    mayRunProductionEvidencePipeline: false,
    placeholderFindingCount: 0,
    blockedActionDetails: [{
      actionId: 'candidate_refresh_execution',
      gate: 'candidate_baseline_refresh_execution_gate',
      blockers: [
        'candidate_refresh_execution_unlock_required',
        'candidate_refresh_execution_allow_refresh_required',
      ],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
          value: '1',
          blockerCodes: ['candidate_refresh_execution_unlock_required'],
        }],
        requiredFlags: [{
          flag: '--allow-refresh',
          blockerCodes: ['candidate_refresh_execution_allow_refresh_required'],
        }, {
          flag: '--mode',
          value: 'execute',
          blockerCodes: ['candidate_refresh_execute_mode_required'],
        }],
        operatorFields: [{
          field: '--operator-approval-ref',
          blockerCodes: ['candidate_refresh_operator_approval_required'],
        }, {
          field: '--refreshed-by',
          blockerCodes: ['candidate_refresh_refreshed_by_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs',
        ],
      },
    }, {
      actionId: 'candidate_baseline_materialization',
      gate: 'candidate_baseline_materialization_gate',
      blockers: [
        'candidate_baseline_materialization_unlock_required',
      ],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
          value: '1',
          blockerCodes: ['candidate_baseline_materialization_unlock_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
        ],
      },
    }],
    blockers: [
      'handoff_current_blockers_not_empty',
    ],
  })
  await writeJson(candidateRefreshAuthorizationPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization-package/v1',
    status: 'authorization_package_ready',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    environment: 'staging',
    preflightReady: true,
    executionStatus: 'candidate_refresh_execution_failed',
    operatorTemplateRef: 'candidate_refresh_authorization_template:tmp/candidate-refresh-authorization.operator-fill-template.json',
    packageReadinessBlockers: [],
    executionBlockers: [
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_db_execution_failed',
    ],
    nextCommands: {
      executeCandidateRefresh: 'node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs --mode execute --allow-refresh',
    },
    mutationBoundary: {
      packageOnly: true,
      doesNotMutateDatabase: true,
    },
  })
  await writeJson(candidateRefreshExecutionReadinessSealPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-readiness-seal/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    environment: 'staging',
    executionCommandReady: true,
    unlock: {
      variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      present: false,
    },
    executionControl: {
      executeReady: false,
      operatorMustRunManually: true,
    },
    blockers: [
      'candidate_refresh_execution_unlock_not_present',
    ],
    mutationBoundary: {
      doesNotConnectDatabase: true,
      commandsExecuted: 0,
      writesProductionTables: false,
    },
  })
  await writeJson(candidateBaselineMaterializationReadinessSealPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization-readiness-seal/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    environment: 'staging',
    materializationCommandReady: true,
    unlock: {
      variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      present: false,
    },
    executionControl: {
      executeReady: false,
      operatorMustRunManually: true,
    },
    blockers: [
      'candidate_baseline_materialization_unlock_not_present',
    ],
    nextCommands: {
      setUnlockPowerShell: "$env:WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION='1'",
      executeCandidateBaselineMaterialization: 'node project-testing/tools/run-default-master-plan-candidate-baseline-materialization.mjs --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --output project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json --environment staging --mode execute --allow-materialization',
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    mutationBoundary: {
      doesNotConnectDatabase: true,
      commandsExecuted: 0,
      writesCandidateBaselines: false,
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--readiness',
      readinessPath,
      '--evidence-sources',
      evidenceSourcesPath,
      '--review-evidence',
      reviewEvidencePath,
      '--duration-calibration-evidence',
      durationEvidencePath,
      '--operator-handoff',
      operatorHandoffPath,
      '--operator-handoff-preflight',
      operatorHandoffPreflightPath,
      '--candidate-refresh-authorization-package',
      candidateRefreshAuthorizationPackagePath,
      '--candidate-refresh-execution-readiness-seal',
      candidateRefreshExecutionReadinessSealPath,
      '--candidate-baseline-materialization-readiness-seal',
      candidateBaselineMaterializationReadinessSealPath,
      '--output',
      outputPath,
      '--json-output',
      jsonOutputPath,
      '--json',
    ], { cwd: path.resolve('.') })

    const summary = JSON.parse(await readFile(jsonOutputPath, 'utf8'))
    const markdown = await readFile(outputPath, 'utf8')
    const candidateRefreshGroup = summary.prioritizedNextActionGroups.find((group) => (
      group.id === 'candidate_refresh_db_execution'
    ))
    const materializationGroup = summary.prioritizedNextActionGroups.find((group) => (
      group.id === 'candidate_baseline_materialization_unlock'
    ))

    assert.equal(summary.realEvidenceGaps.operatorHandoff.candidateRefreshExecution.status, 'candidate_refresh_execution_failed')
    assert.equal(summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.status, 'authorization_package_ready')
    assert.equal(summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.preflightReady, true)
    assert.equal(summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.packageOnly, true)
    assert.equal(summary.realEvidenceGaps.candidateRefreshAuthorizationPackage.doesNotMutateDatabase, true)
    assert.equal(summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.executionCommandReady, true)
    assert.equal(summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.unlockPresent, false)
    assert.deepEqual(summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.blockers, [
      'candidate_refresh_execution_unlock_not_present',
    ])
    assert.equal(summary.realEvidenceGaps.candidateRefreshExecutionReadinessSeal.doesNotConnectDatabase, true)
    assert.equal(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.materializationCommandReady, true)
    assert.equal(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.unlockPresent, false)
    assert.deepEqual(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.blockers, [
      'candidate_baseline_materialization_unlock_not_present',
    ])
    assert.equal(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.doesNotConnectDatabase, true)
    assert.equal(summary.realEvidenceGaps.candidateBaselineMaterializationReadinessSeal.writesCandidateBaselines, false)
    assert.equal(materializationGroup.status, 'blocked')
    assert.equal(materializationGroup.materializationReadinessPlan.status, 'blocked')
    assert.equal(materializationGroup.materializationReadinessPlan.materializationCommandReady, true)
    assert.equal(materializationGroup.materializationReadinessPlan.unlockVariable, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION')
    assert.equal(materializationGroup.materializationReadinessPlan.unlockPresent, false)
    assert.equal(materializationGroup.materializationReadinessPlan.executeReady, false)
    assert.equal(materializationGroup.materializationReadinessPlan.operatorMustRunManually, true)
    assert.equal(materializationGroup.materializationReadinessPlan.doesNotConnectDatabase, true)
    assert.equal(materializationGroup.materializationReadinessPlan.commandsExecuted, 0)
    assert.equal(materializationGroup.materializationReadinessPlan.nextCommands.setUnlockPowerShell, "$env:WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION='1'")
    assert.match(
      materializationGroup.materializationReadinessPlan.nextCommands.executeCandidateBaselineMaterialization,
      /run-default-master-plan-candidate-baseline-materialization\.mjs/,
    )
    assert.equal(materializationGroup.materializationReadinessPlan.nextCommands.refreshRealEvidenceGaps, 'npm.cmd run evidence:default-master-plan:real-evidence-gaps')
    const candidateRefreshExecutionReadinessQueueCommand = summary.operatorCommandExecutionQueues.readOnlyEvidence.find((entry) => (
      entry.command === 'node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs'
    ))
    assert.deepEqual(candidateRefreshExecutionReadinessQueueCommand, {
      command: 'node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['candidate_refresh_db_execution'],
      commandSources: ['operator_requirement:candidate_refresh_execution:verification'],
      duplicateCount: 1,
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
    })
    const candidateBaselineMaterializationReadinessQueueCommand = summary.operatorCommandExecutionQueues.readOnlyEvidence.find((entry) => (
      entry.command === 'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs'
    ))
    assert.deepEqual(candidateBaselineMaterializationReadinessQueueCommand, {
      command: 'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['candidate_baseline_materialization_unlock'],
      commandSources: ['operator_requirement:candidate_baseline_materialization:verification'],
      duplicateCount: 1,
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
    })
    assert.match(markdown, /candidate_baseline_materialization_readiness_seal_blocker: candidate_baseline_materialization_unlock_not_present/)
    assert.match(markdown, /candidate_baseline_materialization_unlock \[blocked\]/)
    assert.match(markdown, /materializationReadinessPlanStatus: blocked/)
    assert.match(markdown, /materializationReadinessUnlockVariable: WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION/)
    assert.match(markdown, /materialization_next_command: setUnlockPowerShell/)
    assert.match(markdown, /materialization_next_command: executeCandidateBaselineMaterialization/)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.candidateRefreshExecution.dbRepairPlan.status, 'blocked')
    assert.equal(summary.realEvidenceGaps.operatorHandoff.candidateRefreshExecution.dbRepairPlan.failureClass, 'connection_timeout')
    assert.equal(summary.realEvidenceGaps.operatorHandoff.candidateRefreshExecution.executionGatePlan.status, 'blocked')
    assert.equal(candidateRefreshGroup.status, 'blocked')
    assert.deepEqual(candidateRefreshGroup.blockedBy, [
      'candidate_baseline_refresh_required_before_runtime_publication',
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ])
    assert.equal(candidateRefreshGroup.executionGatePlan.status, 'blocked')
    assert.equal(candidateRefreshGroup.executionGatePlan.noAutoExecution, true)
    assert.deepEqual(candidateRefreshGroup.executionGatePlan.requiredStepIds, [
      'set_candidate_refresh_execution_unlock',
      'run_candidate_refresh_in_execute_mode_with_allow_flag',
      'record_candidate_refresh_operator_approval_and_actor',
    ])
    assert.deepEqual(candidateRefreshGroup.executionGatePlan.blockedStepIds, [
      'rerun_candidate_refresh_execution_after_gate',
    ])
    assert.equal(
      candidateRefreshGroup.commands.includes('node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs'),
      true,
    )
    assert.equal(candidateRefreshGroup.dbRepairPlan.status, 'blocked')
    assert.equal(candidateRefreshGroup.dbRepairPlan.failureClass, 'connection_timeout')
    assert.equal(candidateRefreshGroup.dbRepairPlan.noAutoCredentialRotation, true)
    assert.deepEqual(candidateRefreshGroup.dbRepairPlan.requiredStepIds, [
      'confirm_candidate_refresh_target_identity',
      'repair_or_rotate_candidate_refresh_db_credentials',
    ])
    assert.deepEqual(candidateRefreshGroup.dbRepairPlan.blockedStepIds, [
      'rerun_candidate_refresh_execution',
    ])
    assert.deepEqual(candidateRefreshGroup.dbRepairPlan.orderedSteps.map((step) => step.id), [
      'confirm_candidate_refresh_target_identity',
      'repair_or_rotate_candidate_refresh_db_credentials',
      'rerun_candidate_refresh_execution',
    ])
    assert.deepEqual(candidateRefreshGroup.operatorRequirements, [{
      actionId: 'candidate_refresh_execution',
      gate: 'candidate_baseline_refresh_execution_gate',
      blockers: [
        'candidate_refresh_execution_unlock_required',
        'candidate_refresh_execution_allow_refresh_required',
      ],
      nextRequirements: {
        envUnlocks: [{
          variable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
          value: '1',
          blockerCodes: ['candidate_refresh_execution_unlock_required'],
        }],
        requiredFlags: [{
          flag: '--allow-refresh',
          blockerCodes: ['candidate_refresh_execution_allow_refresh_required'],
        }, {
          flag: '--mode',
          value: 'execute',
          blockerCodes: ['candidate_refresh_execute_mode_required'],
        }],
        operatorFields: [{
          field: '--operator-approval-ref',
          blockerCodes: ['candidate_refresh_operator_approval_required'],
        }, {
          field: '--refreshed-by',
          blockerCodes: ['candidate_refresh_refreshed_by_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs',
        ],
      },
    }])
    assert.match(markdown, /candidate_refresh_db_execution \[blocked\]/)
    assert.match(markdown, /operator_requirement_action: candidate_refresh_execution \| candidate_baseline_refresh_execution_gate/)
    assert.match(markdown, /operator_requirement_env_unlock: candidate_refresh_execution \| WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH=1/)
    assert.match(markdown, /operator_requirement_flag: candidate_refresh_execution \| --mode=execute/)
    assert.match(markdown, /operator_requirement_operator_field: candidate_refresh_execution \| --operator-approval-ref/)
    assert.match(markdown, /dbRepairPlanStatus: blocked/)
    assert.match(markdown, /dbRepairPlanFailureClass: connection_timeout/)
    assert.match(markdown, /dbRepairPlanNoAutoCredentialRotation: yes/)
    assert.match(markdown, /db_repair_required_step: confirm_candidate_refresh_target_identity/)
    assert.match(markdown, /db_repair_required_step: repair_or_rotate_candidate_refresh_db_credentials/)
    assert.match(markdown, /db_repair_blocked_step: rerun_candidate_refresh_execution/)
    assert.match(markdown, /db_repair_step: rerun_candidate_refresh_execution \[blocked_by_previous_steps\]/)
    assert.match(markdown, /executionGatePlanStatus: blocked/)
    assert.match(markdown, /executionGatePlanNoAutoExecution: yes/)
    assert.match(markdown, /execution_gate_required_step: set_candidate_refresh_execution_unlock/)
    assert.match(markdown, /execution_gate_required_step: run_candidate_refresh_in_execute_mode_with_allow_flag/)
    assert.match(markdown, /execution_gate_blocked_step: rerun_candidate_refresh_execution_after_gate/)
    assert.match(markdown, /Candidate Refresh Authorization Package/)
    assert.match(markdown, /status: authorization_package_ready/)
    assert.match(markdown, /doesNotMutateDatabase: yes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes staging controlled replay as chain-passed but still production-not-ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-gap-summary-'))
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceSourcesPath = path.join(root, 'evidence-sources-report.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const durationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const runtimeSeedEvidencePipelinePath = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const operatorHandoffPath = path.join(root, 'operator-handoff.json')
  const operatorHandoffPreflightPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcomePackagePath = path.join(root, 'real-production-outcome-package.json')
  const outputPath = path.join(root, 'real-evidence-gap-summary.md')
  const jsonOutputPath = path.join(root, 'real-evidence-gap-summary.json')

  await writeJson(readinessPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'staging_runtime_chain_passed',
    productionReady: false,
    runtimeEvidenceChainPassed: true,
    productionReadinessBlockers: [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ],
    evidenceQualification: {
      status: 'staging_controlled_replay',
      controlledReplayMarkerCount: 2,
    },
    currentEvidenceLevel: 'staging_controlled_replay_runtime_chain',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    businessTypeCount: 11,
    gates: [
      { id: 'legacy_serial_template_path_removed', tier: 'local_static', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', tier: 'local_static', status: 'pass' },
      { id: 'project_manager_review_evidence', tier: 'real_candidate', status: 'pass' },
      { id: 'runtime_duration_calibration_evidence', tier: 'runtime_evidence', status: 'pass' },
      { id: 'production_dependency_writer_evidence', tier: 'runtime_writer', status: 'pass' },
      { id: 'runtime_publication_evidence', tier: 'runtime_publication', status: 'pass' },
      { id: 'post_publish_smoke_and_rollback_evidence', tier: 'live_or_staging_smoke', status: 'pass' },
      { id: 'runtime_evidence_lineage_consistency', tier: 'runtime_lineage', status: 'pass' },
    ],
  })
  await writeJson(evidenceSourcesPath, {
    schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
    status: 'ready',
    productionReady: false,
    missingEvidenceTypes: [],
    candidateHygieneCheck: {
      status: 'pass',
      totalCandidateExportCount: 1,
      ignoredCandidateExportCount: 0,
      extraEligibleCandidateExportCount: 0,
      currentCandidate: {
        baselineId: 'baseline-1',
        projectId: 'project-1',
        fileName: 'candidate-baseline-baseline-1-school-items.json',
      },
      blockers: [],
    },
    sourceManifestCheck: {
      sourcePath: 'project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json',
      status: 'ready_for_production_evidence_pipeline',
      target: {
        envFileRef: 'server/.env',
        supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
        databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
        connectionSource: 'SUPABASE_MIGRATION_URL',
      },
      blockers: [],
    },
  })
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'pass',
    candidate_governance_review: {
      reviewed_by: 'owner-1',
      reviewed_item_count: 16,
      reviewed_item_ids: ['item-1'],
    },
    blockers: [],
  })
  await writeJson(operatorHandoffPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'runtime.default_master_plan.project-1',
    environment: 'staging',
    currentBlockers: [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ],
    deferredCurrentBlockers: {
      candidateRefreshDependent: {
        deferredBy: [
          'candidate_refresh_db_connection_failed',
        ],
        blockers: [
          'completed_task_export_invalid_completed_task_rows_present',
        ],
      },
    },
  })
  await writeJson(operatorHandoffPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-operator-handoff-preflight/v1',
    status: 'blocked',
    sourceExportMode: 'supporting_non_production',
    mayRunSupportingSourceExport: true,
    mayRunProductionSourceExport: false,
    mayAcceptRealProductionOutcomeEvidence: false,
    realProductionOutcomeEvidenceBlockers: [
      'production_or_live_target_required_for_real_production_outcome_evidence',
      'real_production_outcome_material_required',
    ],
    productionSourceExportBlockers: [
      'production_or_live_source_export_required_for_production_ready',
    ],
    mayRunSourceExport: false,
    mayRunProductionEvidencePipeline: false,
    runnableActionIds: ['source_export_collect'],
    blockedActionIds: ['production_evidence_pipeline'],
    deferredActionIds: ['pm_review_record'],
    writeExecutionRunnableActionIds: [],
    writeExecutionBlockedActionIds: ['runtime_seed_import_execution'],
    writeExecutionDeferredActionIds: [],
    writeExecutionBlockedActionDetails: [{
      actionId: 'runtime_seed_import_execution',
      gate: 'runtime_seed_and_reference_days_evidence',
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      nextRequirements: {
        requiredFlags: [{
          flag: '--allow-import',
          blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
        }],
        operatorFields: [{
          field: '--seed-smoke-user-id',
          blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        ],
      },
    }],
    blockedActionDetails: [{
      actionId: 'production_evidence_pipeline',
      gate: 'five_evidence_builders',
      blockers: [
        'handoff_not_production_ready',
        'production_or_live_source_export_required_for_production_ready',
      ],
      nextRequirements: {
        evidenceInputs: [{
          artifact: 'real-production-outcome.json',
          requiredStatus: 'pass',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        requiredEnvironmentTargets: [{
          target: 'production_or_live',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        verificationCommands: [
          'npm run evidence:default-master-plan:operator-handoff-preflight',
          'npm run evidence:default-master-plan:real-evidence-gaps',
        ],
      },
    }],
    placeholderFindingCount: 0,
    blockers: [
      'handoff_current_blockers_not_empty',
      'handoff_not_production_ready',
    ],
  })
  await writeJson(realProductionOutcomePackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome-package/v1',
    status: 'real_production_outcome_required',
    productionReady: false,
    targetEnvironment: 'production',
    realProductionOutcomePath: '<real-production-outcome.json>',
    realProductionOutcomeTemplate: {
      requiredFields: [
        'schemaVersion',
        'status',
        'environment',
        'target',
        'baselineId',
        'projectId',
        'publicationKey',
        'evidenceRef',
        'acceptedBy',
        'acceptedAt',
        'approvalRef',
        'runtimePublicationEvidenceRef',
        'apiReadSmokeEvidenceRef',
        'uiConsumptionSmokeEvidenceRef',
        'criticalPathReadbackEvidenceRef',
        'rollbackEvidenceRef',
      ],
    },
    blockers: [
      'real_production_outcome_file_required',
    ],
  })
  await writeJson(durationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    acceptedRealDurationSampleCount: 16,
    calibratedReferenceDayCount: 16,
    calibrationDeltaCount: 16,
    blockers: [],
  })
  await writeJson(runtimeSeedEvidencePipelinePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    status: 'pass',
    blockers: [],
    summary: {
      importGate: {
        status: 'not_required',
        importAllowed: false,
        importRequired: false,
        blockers: [],
      },
    },
  })

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--readiness',
      readinessPath,
      '--evidence-sources',
      evidenceSourcesPath,
      '--review-evidence',
      reviewEvidencePath,
      '--duration-calibration-evidence',
      durationEvidencePath,
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipelinePath,
      '--operator-handoff',
      operatorHandoffPath,
      '--operator-handoff-preflight',
      operatorHandoffPreflightPath,
      '--real-production-outcome-package',
      realProductionOutcomePackagePath,
      '--output',
      outputPath,
      '--json-output',
      jsonOutputPath,
      '--json',
    ], { cwd: path.resolve('.') })

    const consoleSummary = JSON.parse(stdout)
    const summary = JSON.parse(await readFile(jsonOutputPath, 'utf8'))
    const markdown = await readFile(outputPath, 'utf8')

    assert.equal(consoleSummary.status, 'staging_runtime_chain_passed')
    assert.equal(consoleSummary.productionReady, false)
    assert.equal(summary.runtimeEvidenceChainPassed, true)
    assert.deepEqual(summary.blockedRealGates, [
      {
        id: 'production_readiness',
        tier: 'production_or_live_outcome',
        status: 'blocked',
        blockers: [
          'staging_controlled_replay_not_production_ready',
          'real_production_or_live_outcome_evidence_required',
        ],
      },
    ])
    assert.equal(consoleSummary.blockedRealGateCount, 1)
    assert.equal(summary.realEvidenceGaps.candidateHygiene.status, 'pass')
    assert.equal(summary.realEvidenceGaps.candidateHygiene.totalCandidateExportCount, 1)
    assert.equal(summary.realEvidenceGaps.candidateHygiene.currentCandidate.baselineId, 'baseline-1')
    assert.equal(summary.realEvidenceGaps.operatorHandoff.placeholderFindingCount, 0)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.sourceExportMode, 'supporting_non_production')
    assert.equal(summary.realEvidenceGaps.operatorHandoff.mayRunSupportingSourceExport, true)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.mayRunProductionSourceExport, false)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.mayRunSourceExport, false)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.mayAcceptRealProductionOutcomeEvidence, false)
    assert.equal(summary.realEvidenceGaps.operatorHandoff.mayRunProductionEvidencePipeline, false)
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.runnableActionIds, [
      'source_export_collect',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.writeExecutionBlockedActionIds, [
      'runtime_seed_import_execution',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.writeExecutionBlockedActionDetails[0], {
      actionId: 'runtime_seed_import_execution',
      gate: 'runtime_seed_and_reference_days_evidence',
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      nextRequirements: {
        requiredFlags: [{
          flag: '--allow-import',
          blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
        }],
        operatorFields: [{
          field: '--seed-smoke-user-id',
          blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
        }],
        verificationCommands: [
          'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        ],
      },
    })
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.blockedActionIds, [
      'production_evidence_pipeline',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.deferredActionIds, [
      'pm_review_record',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.blockedActionDetails, [{
      actionId: 'production_evidence_pipeline',
      gate: 'five_evidence_builders',
      blockers: ['handoff_not_production_ready', 'production_or_live_source_export_required_for_production_ready'],
      nextRequirements: {
        evidenceInputs: [{
          artifact: 'real-production-outcome.json',
          requiredStatus: 'pass',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        requiredEnvironmentTargets: [{
          target: 'production_or_live',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        verificationCommands: [
          'npm run evidence:default-master-plan:operator-handoff-preflight',
          'npm run evidence:default-master-plan:real-evidence-gaps',
        ],
      },
    }])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.realProductionOutcomeEvidenceBlockers, [
      'production_or_live_target_required_for_real_production_outcome_evidence',
      'real_production_outcome_material_required',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.productionSourceExportBlockers, [
      'production_or_live_source_export_required_for_production_ready',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.currentBlockers, [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.deferredCurrentBlockers.candidateRefreshDependent.deferredBy, [
      'candidate_refresh_db_connection_failed',
    ])
    assert.deepEqual(summary.realEvidenceGaps.operatorHandoff.deferredCurrentBlockers.candidateRefreshDependent.blockers, [
      'completed_task_export_invalid_completed_task_rows_present',
    ])
    assert.equal(summary.realEvidenceGaps.realProductionOutcomePackage.status, 'real_production_outcome_required')
    assert.equal(summary.realEvidenceGaps.realProductionOutcomePackage.targetEnvironment, 'production')
    assert.equal(summary.realEvidenceGaps.realProductionOutcomePackage.requiredFieldCount, 16)
    assert.deepEqual(summary.realEvidenceGaps.realProductionOutcomePackage.blockers, [
      'real_production_outcome_file_required',
    ])
    assert.deepEqual(summary.prioritizedNextActionGroups.map((group) => group.id), [
      'runtime_task_alignment_and_duration_samples',
      'production_live_outcome_evidence',
    ])
    assert.equal(summary.prioritizedNextActionGroups[0].status, 'deferred')
    assert.deepEqual(summary.prioritizedNextActionGroups[0].deferredBy, [
      'candidate_refresh_db_connection_failed',
    ])
    assert.equal(summary.prioritizedNextActionGroups[1].status, 'blocked')
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.realProductionOutcomePackage.status, 'real_production_outcome_required')
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.realProductionOutcomePackage.targetEnvironment, 'production')
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.realProductionOutcomePackage.requiredFieldCount, 16)
    assert.deepEqual(summary.prioritizedNextActionGroups[1].productionOutcomePlan.realProductionOutcomePackage.requiredFields.slice(0, 4), [
      'schemaVersion',
      'status',
      'environment',
      'target',
    ])
    assert.deepEqual(summary.prioritizedNextActionGroups[1].productionOutcomePlan.realProductionOutcomePackage.blockers, [
      'real_production_outcome_file_required',
    ])
    assert.deepEqual(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.productionSourceExportBlockers, [
      'production_or_live_source_export_required_for_production_ready',
    ])
    assert.deepEqual(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.realProductionOutcomeEvidenceBlockers, [
      'production_or_live_target_required_for_real_production_outcome_evidence',
      'real_production_outcome_material_required',
    ])
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.mayRunProductionSourceExport, false)
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.mayAcceptRealProductionOutcomeEvidence, false)
    assert.equal(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.mayRunProductionEvidencePipeline, false)
    assert.deepEqual(summary.prioritizedNextActionGroups[1].productionOutcomePlan.operatorHandoff.blockedActionIds, [
      'production_evidence_pipeline',
    ])
    assert.deepEqual(summary.prioritizedNextActionGroups[1].operatorRequirements, [{
      actionId: 'production_evidence_pipeline',
      gate: 'five_evidence_builders',
      blockers: ['handoff_not_production_ready', 'production_or_live_source_export_required_for_production_ready'],
      nextRequirements: {
        evidenceInputs: [{
          artifact: 'real-production-outcome.json',
          requiredStatus: 'pass',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        requiredEnvironmentTargets: [{
          target: 'production_or_live',
          blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
        }],
        verificationCommands: [
          'npm run evidence:default-master-plan:operator-handoff-preflight',
          'npm run evidence:default-master-plan:real-evidence-gaps',
        ],
      },
    }])
    assert.deepEqual(summary.operatorUnblockRequirementSummary, {
      actionGroupCount: 2,
      blockedActionGroupCount: 1,
      deferredActionGroupCount: 1,
      operatorRequirementActionCount: 1,
      envUnlockCount: 0,
      requiredFlagCount: 0,
      operatorFieldCount: 0,
      evidenceInputCount: 1,
      environmentTargetCount: 1,
      verificationCommandCount: 2,
      repairRequiredStepCount: 0,
      dbRepairRequiredStepCount: 0,
      blockedPlanStepCount: 0,
      envUnlockVariables: [],
      requiredFlags: [],
      operatorFields: [],
      evidenceInputArtifacts: ['real-production-outcome.json'],
      requiredEnvironmentTargets: ['production_or_live'],
      verificationCommands: [
        'npm run evidence:default-master-plan:operator-handoff-preflight',
        'npm run evidence:default-master-plan:real-evidence-gaps',
      ],
      repairRequiredStepIds: [],
      dbRepairRequiredStepIds: [],
      blockedPlanStepIds: [],
    })
    assert.deepEqual(summary.operatorUnblockRequirementMatrix, [{
      actionGroupId: 'runtime_task_alignment_and_duration_samples',
      priority: 40,
      status: 'deferred',
      operatorRequirementActionIds: [],
      envUnlockVariables: [],
      requiredFlags: [],
      operatorFields: [],
      evidenceInputArtifacts: [],
      requiredEnvironmentTargets: [],
      verificationCommands: [],
      repairRequiredStepIds: [],
      dbRepairRequiredStepIds: [],
      blockedPlanStepIds: [],
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      priority: 50,
      status: 'blocked',
      operatorRequirementActionIds: ['production_evidence_pipeline'],
      envUnlockVariables: [],
      requiredFlags: [],
      operatorFields: [],
      evidenceInputArtifacts: ['real-production-outcome.json'],
      requiredEnvironmentTargets: ['production_or_live'],
      verificationCommands: [
        'npm run evidence:default-master-plan:operator-handoff-preflight',
        'npm run evidence:default-master-plan:real-evidence-gaps',
      ],
      repairRequiredStepIds: [],
      dbRepairRequiredStepIds: [],
      blockedPlanStepIds: [],
    }])
    assert.deepEqual(summary.operatorCommandPlanSummary, {
      actionGroupCount: 2,
      totalCommandCount: 9,
      blockedCommandCount: 5,
      deferredCommandCount: 4,
      readOnlyEvidenceCommandCount: 7,
      guardedWriteOrLiveCommandCount: 2,
      manualPrerequisiteCommandCount: 0,
    })
    assert.deepEqual(summary.operatorCommandPlan.map((entry) => ({
      actionGroupId: entry.actionGroupId,
      commandSource: entry.commandSource,
      executionReadiness: entry.executionReadiness,
      commandKind: entry.commandKind,
      command: entry.command,
    })), [{
      actionGroupId: 'runtime_task_alignment_and_duration_samples',
      commandSource: 'action_group_command',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:runtime-candidate-alignment',
    }, {
      actionGroupId: 'runtime_task_alignment_and_duration_samples',
      commandSource: 'action_group_command',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:runtime-task-alignment-refresh-package',
    }, {
      actionGroupId: 'runtime_task_alignment_and_duration_samples',
      commandSource: 'action_group_command',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:real-duration-sample-preflight',
    }, {
      actionGroupId: 'runtime_task_alignment_and_duration_samples',
      commandSource: 'action_group_command',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:real-duration-sample-export',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandSource: 'action_group_command',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:real-outcome-package',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandSource: 'action_group_command',
      executionReadiness: 'blocked',
      commandKind: 'production_or_live_guarded',
      command: 'npm run evidence:default-master-plan:export-sources',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandSource: 'action_group_command',
      executionReadiness: 'blocked',
      commandKind: 'production_or_live_guarded',
      command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandSource: 'operator_requirement:production_evidence_pipeline:verification',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:operator-handoff-preflight',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandSource: 'operator_requirement:production_evidence_pipeline:verification',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      command: 'npm run evidence:default-master-plan:real-evidence-gaps',
    }])
    assert.deepEqual(summary.operatorCommandExecutionPlanSummary, {
      actionGroupCount: 2,
      rawCommandCount: 9,
      uniqueCommandCount: 9,
      duplicateCommandCount: 0,
      blockedCommandCount: 5,
      deferredCommandCount: 4,
      readOnlyEvidenceCommandCount: 7,
      guardedWriteOrLiveCommandCount: 2,
      manualPrerequisiteCommandCount: 0,
    })
    assert.deepEqual(summary.operatorCommandExecutionPlan.map((entry) => ({
      command: entry.command,
      executionReadiness: entry.executionReadiness,
      commandKind: entry.commandKind,
      actionGroupIds: entry.actionGroupIds,
      commandSources: entry.commandSources,
      duplicateCount: entry.duplicateCount,
    })), [{
      command: 'npm run evidence:default-master-plan:runtime-candidate-alignment',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:runtime-task-alignment-refresh-package',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:real-duration-sample-preflight',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:real-duration-sample-export',
      executionReadiness: 'deferred',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:real-outcome-package',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:export-sources',
      executionReadiness: 'blocked',
      commandKind: 'production_or_live_guarded',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
      executionReadiness: 'blocked',
      commandKind: 'production_or_live_guarded',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:operator-handoff-preflight',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['operator_requirement:production_evidence_pipeline:verification'],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:real-evidence-gaps',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['operator_requirement:production_evidence_pipeline:verification'],
      duplicateCount: 1,
    }])
    assert.deepEqual(summary.operatorCommandExecutionQueueSummary, {
      totalUniqueCommandCount: 9,
      readOnlyEvidenceCommandCount: 7,
      manualPrerequisiteCommandCount: 0,
      guardedWriteOrLiveCommandCount: 2,
      autoRunAllowedCommandCount: 7,
      autoRunForbiddenCommandCount: 2,
      queueIds: [
        'read_only_evidence',
        'manual_prerequisite',
        'guarded_write_or_live',
      ],
    })
    assert.deepEqual(Object.keys(summary.operatorCommandExecutionQueues), [
      'readOnlyEvidence',
      'manualPrerequisite',
      'guardedWriteOrLive',
    ])
    assert.deepEqual(summary.operatorCommandExecutionQueues.readOnlyEvidence.map((entry) => ({
      queueId: entry.queueId,
      autoRunAllowed: entry.autoRunAllowed,
      command: entry.command,
    })), [{
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:runtime-candidate-alignment',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:runtime-task-alignment-refresh-package',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:real-duration-sample-preflight',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:real-duration-sample-export',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:real-outcome-package',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:operator-handoff-preflight',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:real-evidence-gaps',
    }])
    assert.deepEqual(summary.operatorCommandExecutionQueues.manualPrerequisite, [])
    assert.deepEqual(summary.operatorCommandExecutionQueues.guardedWriteOrLive.map((entry) => ({
      queueId: entry.queueId,
      autoRunAllowed: entry.autoRunAllowed,
      command: entry.command,
    })), [{
      queueId: 'guarded_write_or_live',
      autoRunAllowed: false,
      command: 'npm run evidence:default-master-plan:export-sources',
    }, {
      queueId: 'guarded_write_or_live',
      autoRunAllowed: false,
      command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    }])
    assert.equal(summary.nextActions[0], summary.prioritizedNextActionGroups[0].nextAction)
    assert.match(markdown, /writeExecutionBlockedActionIds: runtime_seed_import_execution/)
    assert.equal(consoleSummary.prioritizedNextActionGroupCount, 2)
    assert.equal(summary.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'), true)
    assert.match(markdown, /Runtime evidence chain passed: yes/)
    assert.match(markdown, /Candidate Export Hygiene/)
    assert.match(markdown, /totalCandidateExportCount: 1/)
    assert.match(markdown, /Operator Handoff/)
    assert.match(markdown, /placeholderFindingCount: 0/)
    assert.match(markdown, /sourceExportMode: supporting_non_production/)
    assert.match(markdown, /mayRunSupportingSourceExport: yes/)
    assert.match(markdown, /mayRunProductionSourceExport: no/)
    assert.match(markdown, /mayRunSourceExport: no/)
    assert.match(markdown, /mayAcceptRealProductionOutcomeEvidence: no/)
    assert.match(markdown, /mayRunProductionEvidencePipeline: no/)
    assert.match(markdown, /Operator Unblock Requirement Summary/)
    assert.match(markdown, /evidenceInputCount: 1/)
    assert.match(markdown, /evidence_input_artifact: real-production-outcome\.json/)
    assert.match(markdown, /required_environment_target: production_or_live/)
    assert.match(markdown, /Operator Command Plan/)
    assert.match(markdown, /totalCommandCount: 9/)
    assert.match(markdown, /Operator Command Execution Plan/)
    assert.match(markdown, /rawCommandCount: 9/)
    assert.match(markdown, /uniqueCommandCount: 9/)
    assert.match(markdown, /duplicateCommandCount: 0/)
    assert.match(markdown, /Operator Command Execution Queues/)
    assert.match(markdown, /readOnlyEvidenceCommandCount: 7/)
    assert.match(markdown, /guardedWriteOrLiveCommandCount: 2/)
    assert.match(markdown, /command_plan: production_live_outcome_evidence \| blocked \| production_or_live_guarded \| npm run evidence:default-master-plan:export-sources/)
    assert.match(markdown, /command_execution_plan: blocked \| production_or_live_guarded \| dup=1 \| npm run evidence:default-master-plan:export-sources/)
    assert.match(markdown, /command_execution_queue: read_only_evidence \| auto \| npm run evidence:default-master-plan:runtime-candidate-alignment/)
    assert.match(markdown, /command_execution_queue: guarded_write_or_live \| manual \| npm run evidence:default-master-plan:export-sources/)
    assert.match(markdown, /runnableActionIds: source_export_collect/)
    assert.match(markdown, /blockedActionIds: production_evidence_pipeline/)
    assert.match(markdown, /deferredActionIds: pm_review_record/)
    assert.match(markdown, /handoff_blocked_action: production_evidence_pipeline \| five_evidence_builders \| handoff_not_production_ready, production_or_live_source_export_required_for_production_ready/)
    assert.match(markdown, /handoff_deferred_candidateRefreshDependent_by: candidate_refresh_db_connection_failed/)
    assert.match(markdown, /handoff_deferred_candidateRefreshDependent_blocker: completed_task_export_invalid_completed_task_rows_present/)
    assert.match(markdown, /handoff_real_production_outcome_evidence_blocker: production_or_live_target_required_for_real_production_outcome_evidence/)
    assert.match(markdown, /handoff_real_production_outcome_evidence_blocker: real_production_outcome_material_required/)
    assert.match(markdown, /handoff_production_source_export_blocker: production_or_live_source_export_required_for_production_ready/)
    assert.match(markdown, /Real Production Outcome Package/)
    assert.match(markdown, /realProductionOutcomePackageStatus: real_production_outcome_required/)
    assert.match(markdown, /real_production_outcome_file_required/)
    assert.match(markdown, /requiredRealProductionOutcomeFieldCount: 16/)
    assert.match(markdown, /Prioritized Action Groups/)
    assert.match(markdown, /runtime_task_alignment_and_duration_samples \[deferred\]/)
    assert.match(markdown, /deferred_by: candidate_refresh_db_connection_failed/)
    assert.match(markdown, /production_live_outcome_evidence \[blocked\]/)
    assert.match(markdown, /production_outcome_target_environment: production/)
    assert.match(markdown, /production_outcome_required_field_count: 16/)
    assert.match(markdown, /production_outcome_required_field: schemaVersion/)
    assert.match(markdown, /production_outcome_package_blocker: real_production_outcome_file_required/)
    assert.match(markdown, /production_outcome_may_run_production_source_export: no/)
    assert.match(markdown, /production_outcome_may_accept_real_outcome: no/)
    assert.match(markdown, /production_outcome_blocked_action: production_evidence_pipeline/)
    assert.match(markdown, /operator_requirement_action: production_evidence_pipeline \| five_evidence_builders/)
    assert.match(markdown, /operator_requirement_environment_target: production_evidence_pipeline \| production_or_live/)
    assert.match(markdown, /operator_requirement_evidence_input: production_evidence_pipeline \| real-production-outcome\.json => pass/)
    assert.match(markdown, /operator_requirement_verification_command: production_evidence_pipeline \| npm run evidence:default-master-plan:real-evidence-gaps/)
    assert.match(markdown, /production_readiness \(production_or_live_outcome\): staging_controlled_replay_not_production_ready; real_production_or_live_outcome_evidence_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes no-write real duration sample collection kit for operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-gap-summary-collection-kit-'))
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceSourcesPath = path.join(root, 'evidence-sources-report.json')
  const collectionKitPath = path.join(root, 'real-duration-sample-collection-kit.json')
  const collectionKitPreflightPath = path.join(root, 'real-duration-sample-collection-kit-preflight.json')
  const materialBuildReportPath = path.join(root, 'real-duration-sample-material.report.json')
  const outputPath = path.join(root, 'real-evidence-gap-summary.md')
  const jsonOutputPath = path.join(root, 'real-evidence-gap-summary.json')

  await writeJson(readinessPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'blocked',
    productionReady: false,
    currentEvidenceLevel: 'candidate_asset_backed_l1',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    businessTypeCount: 11,
    gates: [],
  })
  await writeJson(evidenceSourcesPath, {
    schemaVersion: 'workbuddy-default-master-plan-evidence-sources/v1',
    status: 'blocked',
    missingEvidenceTypes: [],
    sourceManifestCheck: {
      status: 'blocked',
      blockers: ['source_export_manifest_required'],
    },
  })
  await writeJson(collectionKitPath, {
    schemaVersion: 'workbuddy-real-duration-sample-collection-kit/v1',
    source: 'build-default-master-plan-real-duration-sample-material-template',
    productionReady: false,
    noWriteBoundary: 'operator_collection_kit_only_no_db_write',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    preparedBy: 'release-operator-1',
    targetSource: 'real_evidence_gap_summary',
    collectionPackageRef: 'duration_sample_collection_package:duration-sample-collection-package.json',
    realEvidenceGapSummaryRef: 'real_evidence_gap_summary:real-evidence-gap-summary.json',
    collectionKitRef: `real_duration_sample_collection_kit:${collectionKitPath}`,
    summary: {
      targetCount: 3,
      businessTypeGroupCount: 2,
      missingSampleCount: 3,
      invalidSampleCount: 0,
    },
    requiredOperatorFields: [
      'sourceProjectName',
      'sourceTaskName',
      'actualDurationDays',
      'startedAt',
      'completedAt',
      'evidenceRef',
      'operatorReviewRef',
    ],
    businessTypeGroups: [{
      businessType: 'school',
      targetCount: 2,
      missingSampleCount: 2,
      invalidSampleCount: 0,
      rows: [{
        priority: 1,
        businessType: 'school',
        stableCode: 'BTMP-SCH-01',
        title: '教学楼基础与地下结构',
        requiredAcceptedSampleCount: 1,
        readySampleCount: 0,
        missingSampleCount: 1,
        invalidSampleCount: 0,
        candidateReferenceDays: 90,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-school-structure-rhythm-v1',
        profileRuntimeReferenceStableCode: 'BTMP-SCH-01',
        stableCodeResolution: 'profile_runtime_reference_day_gap',
        nextAction: 'collect_accepted_real_duration_sample',
      }, {
        priority: 2,
        businessType: 'school',
        stableCode: 'BTMP-SCH-02',
        title: '教学楼主体结构封顶',
        requiredAcceptedSampleCount: 1,
        readySampleCount: 0,
        missingSampleCount: 1,
        invalidSampleCount: 0,
        candidateReferenceDays: 180,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-school-structure-rhythm-v1',
        profileRuntimeReferenceStableCode: 'BTMP-SCH-02',
        stableCodeResolution: 'profile_runtime_reference_day_gap',
        nextAction: 'collect_accepted_real_duration_sample',
      }],
    }, {
      businessType: 'hospital',
      targetCount: 1,
      missingSampleCount: 1,
      invalidSampleCount: 0,
      rows: [{
        priority: 3,
        businessType: 'hospital',
        stableCode: 'BTMP-HSP-01',
        title: '门急诊楼主体结构与功能移交',
        requiredAcceptedSampleCount: 1,
        readySampleCount: 0,
        missingSampleCount: 1,
        invalidSampleCount: 0,
        candidateReferenceDays: 209,
        durationAssetStableCode: 'cast_in_place_formwork',
        t2RhythmTemplateId: 't2-hospital-ward-medical-tower-structure-rhythm-v1',
        profileRuntimeReferenceStableCode: 'BTMP-HSP-01',
        stableCodeResolution: 'profile_runtime_reference_day_gap',
        nextAction: 'collect_accepted_real_duration_sample',
      }],
    }],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })
  await writeJson(collectionKitPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-collection-kit-preflight/v1',
    status: 'ready_for_real_duration_sample_material_build',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    checkedBy: 'release-operator-1',
    collectionKitRef: `real_duration_sample_collection_kit:${collectionKitPath}#sha256=abc123`,
    summary: {
      targetRowCount: 3,
      readyRowCount: 3,
      invalidRowCount: 0,
      businessTypeGroupCount: 2,
    },
    blockers: [],
    mutationBoundary: {
      readsRealDurationSampleCollectionKit: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })

  await writeJson(materialBuildReportPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-from-collection-kit-preflight/v1',
    status: 'material_ready',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    materialRef: 'real_duration_sample_material:real-duration-sample-material.json',
    materialWrite: {
      policy: 'preserve_existing_material_file_when_build_blocked',
      wroteMaterialFile: false,
      preservedExistingMaterialFile: true,
      skippedMaterialWriteBecause: 'material_build_blocked',
      existingMaterialSummary: {
        source: 'build-default-master-plan-real-duration-sample-material-from-task-export',
        sampleCount: 1,
        stableCodes: ['BTMP-SCH-01'],
      },
    },
    collectionPackageRef: 'duration_sample_collection_package:duration-sample-collection-package.json#sha256=1111',
    collectionKitPreflightRef: `real_duration_sample_collection_kit_preflight:${collectionKitPreflightPath}#sha256=2222`,
    summary: {
      requiredStableCodeCount: 3,
      sourceCandidateCount: 3,
      exportedSampleCount: 3,
      invalidCandidateCount: 0,
      readyRowCount: 3,
      invalidRowCount: 0,
      businessTypeGroupCount: 2,
    },
    invalidCandidates: [],
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsRealDurationSampleCollectionKitPreflight: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--readiness',
      readinessPath,
      '--evidence-sources',
      evidenceSourcesPath,
      '--real-duration-sample-collection-kit',
      collectionKitPath,
      '--real-duration-sample-collection-kit-preflight',
      collectionKitPreflightPath,
      '--real-duration-sample-material-build-report',
      materialBuildReportPath,
      '--output',
      outputPath,
      '--json-output',
      jsonOutputPath,
      '--json',
    ], { cwd: path.resolve('.') })

    const summary = JSON.parse(await readFile(jsonOutputPath, 'utf8'))
    const markdown = await readFile(outputPath, 'utf8')

    assert.equal(
      summary.inputs.realDurationSampleCollectionKit.endsWith('real-duration-sample-collection-kit.json'),
      true,
    )
    assert.equal(summary.inputs.realDurationSampleMaterialBuildReport.endsWith('real-duration-sample-material.report.json'), true)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.status, 'material_ready')
    assert.equal(summary.inputs.realDurationSampleCollectionKitPreflight.endsWith('real-duration-sample-collection-kit-preflight.json'), true)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.status, 'operator_collection_required')
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.productionReady, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.noWriteBoundary, 'operator_collection_kit_only_no_db_write')
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.targetCount, 3)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.businessTypeGroupCount, 2)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.requiredOperatorFieldCount, 7)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.writesDurationSamples, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKit.writesRuntimePublication, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.status, 'ready_for_real_duration_sample_material_build')
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.productionReady, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.checkedBy, 'release-operator-1')
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.targetRowCount, 3)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.readyRowCount, 3)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.invalidRowCount, 0)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.businessTypeGroupCount, 2)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesDurationSamples, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.writesRuntimePublication, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.productionReady, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.exportedSampleCount, 3)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.invalidCandidateCount, 0)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.readyRowCount, 3)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.businessTypeGroupCount, 2)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.materialWritePolicy, 'preserve_existing_material_file_when_build_blocked')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.wroteMaterialFile, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.preservedExistingMaterialFile, true)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialSource, 'build-default-master-plan-real-duration-sample-material-from-task-export')
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialSampleCount, 1)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.existingMaterialStableCodes, ['BTMP-SCH-01'])
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesDurationSamples, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.writesRuntimePublication, false)
    assert.equal(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.invokesRuntimeWriters, false)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.blockers, [])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleMaterialBuildReport.invalidCandidates, [])
    assert.equal(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.invokesRuntimeWriters, false)
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleCollectionKitPreflight.blockers, [])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleCollectionKit.businessTypeGroups, [{
      businessType: 'school',
      targetCount: 2,
      missingSampleCount: 2,
      invalidSampleCount: 0,
    }, {
      businessType: 'hospital',
      targetCount: 1,
      missingSampleCount: 1,
      invalidSampleCount: 0,
    }])
    assert.deepEqual(summary.realEvidenceGaps.realDurationSampleCollectionKit.targetExamples, [{
      priority: 1,
      businessType: 'school',
      stableCode: 'BTMP-SCH-01',
      title: '教学楼基础与地下结构',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 0,
      missingSampleCount: 1,
      invalidSampleCount: 0,
      candidateReferenceDays: 90,
      durationAssetStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-school-structure-rhythm-v1',
      nextAction: 'collect_accepted_real_duration_sample',
    }, {
      priority: 2,
      businessType: 'school',
      stableCode: 'BTMP-SCH-02',
      title: '教学楼主体结构封顶',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 0,
      missingSampleCount: 1,
      invalidSampleCount: 0,
      candidateReferenceDays: 180,
      durationAssetStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-school-structure-rhythm-v1',
      nextAction: 'collect_accepted_real_duration_sample',
    }, {
      priority: 3,
      businessType: 'hospital',
      stableCode: 'BTMP-HSP-01',
      title: '门急诊楼主体结构与功能移交',
      requiredAcceptedSampleCount: 1,
      readySampleCount: 0,
      missingSampleCount: 1,
      invalidSampleCount: 0,
      candidateReferenceDays: 209,
      durationAssetStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-hospital-ward-medical-tower-structure-rhythm-v1',
      nextAction: 'collect_accepted_real_duration_sample',
    }])
    assert.match(markdown, /Real Duration Sample Collection Kit/)
    assert.match(markdown, /targetCount: 3/)
    assert.match(markdown, /businessTypeGroupCount: 2/)
    assert.match(markdown, /noWriteBoundary: operator_collection_kit_only_no_db_write/)
    assert.match(markdown, /requiredOperatorFields: sourceProjectName, sourceTaskName, actualDurationDays, startedAt, completedAt, evidenceRef, operatorReviewRef/)
    assert.match(markdown, /\| school \| 2 \| 2 \| 0 \|/)
    assert.match(markdown, /\| 1 \| school \| BTMP-SCH-01 \| 教学楼基础与地下结构 \| 90 \| cast_in_place_formwork \| t2-school-structure-rhythm-v1 \| collect_accepted_real_duration_sample \|/)
    assert.match(markdown, /Real Duration Sample Collection Kit Preflight/)
    assert.match(markdown, /readyRowCount: 3/)
    assert.match(markdown, /checkedBy: release-operator-1/)
    assert.match(markdown, /writesDurationSamples: no/)
    assert.match(markdown, /Real Duration Sample Material Build Report/)
    assert.match(markdown, /materialBuildStatus: material_ready/)
    assert.match(markdown, /materialWritePolicy: preserve_existing_material_file_when_build_blocked/)
    assert.match(markdown, /wroteMaterialFile: no/)
    assert.match(markdown, /preservedExistingMaterialFile: yes/)
    assert.match(markdown, /existingMaterialSampleCount: 1/)
    assert.match(markdown, /existingMaterialStableCodes: BTMP-SCH-01/)
    assert.match(markdown, /exportedSampleCount: 3/)
    assert.match(markdown, /invalidCandidateCount: 0/)
    assert.match(markdown, /material_build_writesDurationSamples: no/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
