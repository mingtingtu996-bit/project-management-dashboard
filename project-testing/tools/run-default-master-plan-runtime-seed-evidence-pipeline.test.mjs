import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  buildPipelineSteps,
  buildReportPaths,
  buildRuntimeSeedEvidencePipelineReport,
  parseArgs,
} from './run-default-master-plan-runtime-seed-evidence-pipeline.mjs'

const REPORT_ROOT = path.resolve('project-testing/reports/default-master-plan-profiles')

function loadedReport(key, json) {
  return {
    path: path.join(REPORT_ROOT, `${key}.json`),
    sha256: `${key}-sha256`,
    json,
  }
}

function completedSteps() {
  return [
    'runtime_seed_governance_preflight',
    'runtime_seed_preflight',
    'runtime_seed_environment',
    'runtime_seed_coverage',
    'runtime_seed_import_gate',
  ].map((id) => ({
    id,
    command: `node ${id}.mjs`,
    reportKey: id.replace('runtime_seed_', ''),
    exitCode: 0,
    status: 'completed',
    durationMs: 1,
    stdout: '',
    stderr: '',
  }))
}

function baseReports(overrides = {}) {
  const reports = {
    governancePreflight: {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-governance-preflight/v1',
      source: 'check-default-master-plan-runtime-seed-governance-preflight',
      status: 'runtime_seed_governance_preflight_ready',
      readyForGovernedImport: true,
      seedTypesReadyForImport: [
        'standard_work_duration',
        't2_division_rhythm_template',
      ],
      blockers: [],
    },
    preflight: {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
      source: 'build-default-master-plan-runtime-seed-evidence-preflight',
      status: 'blocked',
      blockers: ['runtime_seed_evidence_missing'],
      runtimeSeedEvidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 10,
        requiredRuntimeSeedStableCodes: ['cast_in_place_formwork', 'masonry_infill_wall'],
      },
      seedSmokeImport: {
        status: 'preflight_failed',
      },
    },
    environment: {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-environment/v1',
      source: 'check-default-master-plan-runtime-seed-environment',
      status: 'blocked',
      currentRuntimeTarget: {
        targetClass: 'local_supabase',
      },
      localSupabaseTcp: {
        reachable: false,
      },
      environmentBlockers: ['local_supabase_endpoint_unreachable'],
      upstreamEvidenceBlockers: ['runtime_seed_evidence_missing'],
      repairPlan: {
        status: 'blocked',
        noAutoInstall: true,
        requiredStepIds: ['start_local_supabase'],
        blockedStepIds: ['rerun_runtime_seed_pipeline'],
        orderedSteps: [
          { id: 'start_local_supabase' },
          { id: 'rerun_runtime_seed_pipeline' },
        ],
      },
    },
    coverage: {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
      source: 'build-default-master-plan-runtime-seed-coverage-package',
      status: 'ts_seed_coverage_complete_runtime_import_still_required',
      standardWorkDurationSeedSource: {
        seedVersion: 'seed-test-v1',
      },
      coverage: {
        requiredStableCodes: ['cast_in_place_formwork', 'masonry_infill_wall'],
        coveredStableCodeCount: 2,
        missingStableCodeCount: 0,
        missingStableCodes: [],
      },
    },
    importGate: {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
      source: 'build-default-master-plan-runtime-seed-import-gate',
      status: 'runtime_seed_import_blocked',
      importGate: {
        importAllowed: false,
        importMode: 'local_active_seed_smoke_import',
        localUnlockPresent: false,
        remoteUnlockPresent: false,
      },
      coverage: {
        coveredStableCodeCount: 2,
        missingStableCodeCount: 0,
      },
      blockers: ['local_standard_duration_seed_import_unlock_required'],
      manualActions: ['WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1'],
    },
    ...overrides,
  }

  return Object.fromEntries(Object.entries(reports).map(([key, json]) => [key, loadedReport(key, json)]))
}

test('reports blocked runtime seed pipeline when import gate is blocked', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports(),
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_import_blocked')
  assert.equal(report.summary.preflight.missingBusinessTypeCount, 10)
  assert.equal(report.summary.environment.localSupabaseReachable, false)
  assert.equal(report.summary.environment.repairPlan.status, 'blocked')
  assert.equal(report.summary.environment.repairPlan.noAutoInstall, true)
  assert.deepEqual(report.summary.environment.repairPlan.requiredStepIds, ['start_local_supabase'])
  assert.equal(report.summary.environment.repairPlan.orderedStepCount, 2)
  assert.deepEqual(report.summary.environment.repairPlan.orderedSteps.map((step) => step.id), [
    'start_local_supabase',
    'rerun_runtime_seed_pipeline',
  ])
  assert.equal(report.summary.coverage.coveredStableCodeCount, 2)
  assert.equal(report.summary.importGate.importAllowed, false)
  assert.deepEqual(report.blockers, ['local_standard_duration_seed_import_unlock_required'])
  assert.deepEqual(report.nextActions, ['WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1'])
  assert.equal(report.mutationBoundary.writesEvidenceReportsOnly, true)
  assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(report.mutationBoundary.writesTasks, false)
  assert.equal(report.productionReady, false)
})

test('does not treat skip-run pipeline steps as failed when summarizing existing reports', () => {
  const skippedSteps = completedSteps().map((step) => ({
    ...step,
    exitCode: null,
    status: 'skipped',
  }))
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: skippedSteps,
    loadedReports: baseReports(),
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_import_blocked')
  assert.equal(report.blockers.includes('runtime_seed_environment_failed'), false)
  assert.equal(report.blockers.includes('runtime_seed_coverage_failed'), false)
  assert.deepEqual(report.nextActions, ['WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1'])
})

test('reports allowed runtime seed pipeline only when import gate is allowed', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports({
      environment: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-environment/v1',
        source: 'check-default-master-plan-runtime-seed-environment',
        status: 'ready_for_runtime_seed_preflight_or_import',
        currentRuntimeTarget: {
          targetClass: 'local_supabase',
        },
        localSupabaseTcp: {
          reachable: true,
        },
        environmentBlockers: [],
        upstreamEvidenceBlockers: [],
        repairPlan: {
          status: 'ready_for_runtime_seed_pipeline',
          noAutoInstall: true,
          requiredStepIds: ['unlock_local_seed_import_after_review'],
          blockedStepIds: [],
          orderedSteps: [
            { id: 'start_local_supabase' },
            { id: 'rerun_runtime_seed_pipeline' },
            { id: 'unlock_local_seed_import_after_review' },
          ],
        },
      },
      importGate: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        source: 'build-default-master-plan-runtime-seed-import-gate',
        status: 'runtime_seed_import_allowed',
        importGate: {
          importAllowed: true,
          importMode: 'local_active_seed_smoke_import',
          localUnlockPresent: true,
          remoteUnlockPresent: false,
        },
        coverage: {
          coveredStableCodeCount: 2,
          missingStableCodeCount: 0,
        },
        blockers: [],
        manualActions: [],
      },
    }),
  })

  assert.equal(report.status, 'runtime_seed_import_allowed')
  assert.equal(report.summary.environment.localSupabaseReachable, true)
  assert.equal(report.summary.environment.repairPlan.status, 'ready_for_runtime_seed_pipeline')
  assert.equal(report.summary.environment.repairPlan.orderedStepCount, 3)
  assert.equal(report.summary.importGate.localUnlockPresent, true)
  assert.deepEqual(report.blockers, [])
  assert.deepEqual(report.nextActions, [
    'Run the allowed import command from runtime-seed-import-gate.json',
    'Rerun profile report and runtime seed evidence after import',
    'Run npm.cmd run evidence:default-master-plan:runtime-seed-post-import',
  ])
})

test('reports runtime seed import not required when active runtime seed evidence is already ready', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports({
      preflight: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
        source: 'build-default-master-plan-runtime-seed-evidence-preflight',
        status: 'runtime_seed_evidence_ready',
        blockers: [],
        runtimeSeedEvidence: {
          readyBusinessTypeCount: 1,
          missingBusinessTypeCount: 0,
          requiredRuntimeSeedStableCodes: [],
        },
        runtimeReferenceDaysEvidence: {
          readyBusinessTypeCount: 1,
          missingBusinessTypeCount: 0,
          requiredRuntimeReferenceStableCodes: [],
        },
        seedSmokeImport: {
          status: 'not_requested',
        },
      },
      coverage: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
        source: 'build-default-master-plan-runtime-seed-coverage-package',
        status: 'runtime_seed_evidence_ready_no_import_required',
        standardWorkDurationSeedSource: {
          seedVersion: 'seed-test-v1',
        },
        coverage: {
          requiredStableCodes: [],
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
          missingStableCodes: [],
        },
        importReadiness: {
          runtimeSeedImportRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
          readyForRuntimeImportAttempt: false,
        },
      },
      importGate: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        source: 'build-default-master-plan-runtime-seed-import-gate',
        status: 'runtime_seed_import_not_required',
        importGate: {
          importAllowed: false,
          importRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
          importMode: 'not_required_runtime_seed_evidence_ready',
          localUnlockPresent: false,
          remoteUnlockPresent: false,
        },
        coverage: {
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
        },
        blockers: [],
        manualActions: [],
      },
    }),
  })

  assert.equal(report.status, 'runtime_seed_import_not_required')
  assert.equal(report.summary.preflight.readyBusinessTypeCount, 1)
  assert.equal(report.summary.preflight.missingBusinessTypeCount, 0)
  assert.equal(report.summary.coverage.runtimeSeedImportRequired, false)
  assert.equal(report.summary.importGate.runtimeSeedEvidenceAlreadyReady, true)
  assert.deepEqual(report.blockers, [])
  assert.deepEqual(report.nextActions, [
    'Runtime seed evidence is already ready; continue dependency writer, runtime publication, smoke, and rollback gates',
  ])
})

test('blocks pipeline when post-import verification still reports fallback seed or T2 rows', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports({
      preflight: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
        source: 'build-default-master-plan-runtime-seed-evidence-preflight',
        status: 'runtime_seed_evidence_ready',
        blockers: [],
        runtimeSeedEvidence: {
          readyBusinessTypeCount: 1,
          missingBusinessTypeCount: 0,
          requiredRuntimeSeedStableCodes: [],
        },
        runtimeReferenceDaysEvidence: {
          readyBusinessTypeCount: 1,
          missingBusinessTypeCount: 0,
          requiredRuntimeReferenceStableCodes: [],
        },
        seedSmokeImport: {
          status: 'not_requested',
        },
      },
      coverage: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
        source: 'build-default-master-plan-runtime-seed-coverage-package',
        status: 'runtime_seed_evidence_ready_no_import_required',
        standardWorkDurationSeedSource: {
          seedVersion: 'seed-test-v1',
        },
        coverage: {
          requiredStableCodes: [],
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
          missingStableCodes: [],
        },
        importReadiness: {
          runtimeSeedImportRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
        },
      },
      importGate: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        source: 'build-default-master-plan-runtime-seed-import-gate',
        status: 'runtime_seed_import_not_required',
        importGate: {
          importAllowed: false,
          importRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
          importMode: 'not_required_runtime_seed_evidence_ready',
        },
        coverage: {
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
        },
        blockers: [],
        manualActions: [],
      },
      postImport: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-post-import-verification/v1',
        source: 'check-default-master-plan-runtime-seed-post-import',
        status: 'runtime_seed_post_import_blocked',
        runtimeSeedEvidence: {
          profileRowCount: 2,
          runtimeSeedRowCount: 1,
          fallbackOrMissingSeedRowCount: 1,
          allProfileRowsRuntime: false,
        },
        runtimeT2Evidence: {
          profileRowCount: 2,
          runtimeT2RowCount: 1,
          fallbackOrMissingT2RowCount: 1,
          allProfileT2RowsRuntime: false,
        },
        blockers: [
          'runtime_seed_post_import_profile_rows_not_all_runtime',
          'runtime_t2_post_import_profile_rows_not_all_runtime',
        ],
        mutationBoundary: {
          writesProductionTables: false,
          writesAlgorithmSeedRecords: false,
          writesTasks: false,
          writesTaskDependencies: false,
          writesRuntimePublication: false,
        },
      },
    }),
  })

  assert.equal(report.status, 'runtime_seed_post_import_blocked')
  assert.equal(report.summary.postImport.activeStandardWorkDurationSeedReady, false)
  assert.equal(report.summary.postImport.activeT2RhythmTemplateReady, false)
  assert.equal(report.blockers.includes('runtime_seed_post_import_profile_rows_not_all_runtime'), true)
  assert.equal(report.blockers.includes('runtime_t2_post_import_profile_rows_not_all_runtime'), true)
  assert.equal(report.blockers.includes('runtime_seed_post_import_verification_not_verified'), true)
  assert.equal(report.blockers.includes('runtime_seed_post_import_active_standard_work_seed_not_ready'), true)
  assert.equal(report.blockers.includes('runtime_seed_post_import_active_t2_rhythm_template_not_ready'), true)
  assert.deepEqual(report.nextActions, [
    'Rerun runtime seed import execution and post-import verification until every profile row uses active runtime standard duration seed and T2 rhythm sources',
    'Do not continue to runtime calibration or publication while post-import profile rows still use fallback seed or T2 sources',
  ])
})

test('keeps pipeline blocked on runtime reference-days even when runtime seed import is not required', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports({
      preflight: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
        source: 'build-default-master-plan-runtime-seed-evidence-preflight',
        status: 'blocked',
        blockers: ['runtime_reference_days_evidence_missing'],
        runtimeSeedEvidence: {
          readyBusinessTypeCount: 1,
          missingBusinessTypeCount: 0,
          requiredRuntimeSeedStableCodes: [],
        },
        runtimeReferenceDaysEvidence: {
          readyBusinessTypeCount: 0,
          missingBusinessTypeCount: 1,
          missingBusinessTypes: ['school'],
          requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01', 'BTMP-SCH-02'],
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
        seedSmokeImport: {
          status: 'not_requested',
        },
      },
      coverage: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
        source: 'build-default-master-plan-runtime-seed-coverage-package',
        status: 'runtime_seed_evidence_ready_no_import_required',
        standardWorkDurationSeedSource: {
          seedVersion: 'seed-test-v1',
        },
        coverage: {
          requiredStableCodes: [],
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
          missingStableCodes: [],
        },
        importReadiness: {
          runtimeSeedImportRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
          readyForRuntimeImportAttempt: false,
        },
      },
      importGate: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        source: 'build-default-master-plan-runtime-seed-import-gate',
        status: 'runtime_seed_import_not_required',
        importGate: {
          importAllowed: false,
          importRequired: false,
          runtimeSeedEvidenceAlreadyReady: true,
          importMode: 'not_required_runtime_seed_evidence_ready',
          localUnlockPresent: false,
          remoteUnlockPresent: false,
        },
        coverage: {
          coveredStableCodeCount: 0,
          missingStableCodeCount: 0,
        },
        blockers: [],
        manualActions: [],
      },
    }),
  })

  assert.equal(report.status, 'runtime_reference_days_evidence_required')
  assert.equal(report.summary.preflight.readyBusinessTypeCount, 1)
  assert.equal(report.summary.preflight.runtimeReferenceDays.missingBusinessTypeCount, 1)
  assert.deepEqual(report.summary.preflight.runtimeReferenceDays.requiredRuntimeReferenceStableCodes, [
    'BTMP-SCH-01',
    'BTMP-SCH-02',
  ])
  assert.deepEqual(report.blockers, ['runtime_reference_days_evidence_missing'])
  assert.deepEqual(report.nextActions, [
    'Build or refresh duration sample collection package for missing runtime reference-days',
    'Collect accepted real completed-task duration samples for required stable codes: BTMP-SCH-01, BTMP-SCH-02',
    'Run duration sample coverage verification and build runtime_calibrated_l2 duration-calibration-evidence.json',
    'Rerun profile report with --duration-calibration-evidence before dependency writer or runtime publication',
  ])
  assert.equal(report.mutationBoundary.writesDurationSamples, false)
  assert.equal(report.mutationBoundary.writesRuntimePublication, false)
})

test('keeps runtime reference-day collection actions visible while runtime seed import is also blocked', () => {
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: completedSteps(),
    loadedReports: baseReports({
      preflight: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
        source: 'build-default-master-plan-runtime-seed-evidence-preflight',
        status: 'blocked',
        blockers: ['runtime_seed_evidence_missing', 'runtime_reference_days_evidence_missing'],
        runtimeSeedEvidence: {
          readyBusinessTypeCount: 0,
          missingBusinessTypeCount: 1,
          requiredRuntimeSeedStableCodes: ['BTMP-SCH-01'],
        },
        runtimeReferenceDaysEvidence: {
          readyBusinessTypeCount: 0,
          missingBusinessTypeCount: 1,
          missingBusinessTypes: ['school'],
          requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01'],
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
        seedSmokeImport: {
          status: 'preflight_failed',
        },
      },
    }),
  })

  assert.equal(report.status, 'runtime_seed_import_blocked')
  assert.equal(report.blockers.includes('runtime_reference_days_evidence_missing'), true)
  assert.deepEqual(report.nextActions, [
    'Build or refresh duration sample collection package for missing runtime reference-days',
    'Collect accepted real completed-task duration samples for required stable codes: BTMP-SCH-01',
    'Run duration sample coverage verification and build runtime_calibrated_l2 duration-calibration-evidence.json',
    'Rerun profile report with --duration-calibration-evidence before dependency writer or runtime publication',
    'WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1',
  ])
})

test('reports failed pipeline and suppresses stale import guidance when a step fails', () => {
  const steps = completedSteps()
  const environmentStepIndex = steps.findIndex((step) => step.id === 'runtime_seed_environment')
  steps[environmentStepIndex] = {
    ...steps[environmentStepIndex],
    exitCode: 1,
    status: 'failed',
    stderr: 'environment check failed',
  }

  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults: steps,
    loadedReports: baseReports({
      importGate: {
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        source: 'build-default-master-plan-runtime-seed-import-gate',
        status: 'runtime_seed_import_allowed',
        importGate: {
          importAllowed: true,
          importMode: 'local_active_seed_smoke_import',
          localUnlockPresent: true,
          remoteUnlockPresent: false,
        },
        coverage: {
          coveredStableCodeCount: 2,
          missingStableCodeCount: 0,
        },
        blockers: [],
        manualActions: [],
      },
    }),
  })

  assert.equal(report.status, 'runtime_seed_evidence_pipeline_failed')
  assert.deepEqual(report.blockers, ['runtime_seed_environment_failed'])
  assert.deepEqual(report.nextActions, [
    'Fix failed pipeline step(s): runtime_seed_environment',
    'Rerun runtime seed evidence pipeline after step failures are resolved',
  ])
})

test('parses runtime seed evidence pipeline CLI args', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/default-master-plan-audit/default-master-plan-profile-samples.json',
    '--output-root',
    'tmp/default-master-plan-audit/runtime-seed-pipeline',
    '--output',
    'tmp/runtime-seed-pipeline.json',
    '--env-file',
    'deploy/env/staging.env',
    '--operator-approval-ref',
    'approval-1',
    '--skip-tcp',
    '--skip-run',
    '--fail-on-blocked',
  ])

  assert.equal(args.profileReport.endsWith('tmp\\default-master-plan-audit\\default-master-plan-profile-samples.json') || args.profileReport.endsWith('tmp/default-master-plan-audit/default-master-plan-profile-samples.json'), true)
  assert.equal(args.outputRoot.endsWith('tmp\\default-master-plan-audit\\runtime-seed-pipeline') || args.outputRoot.endsWith('tmp/default-master-plan-audit/runtime-seed-pipeline'), true)
  assert.equal(args.output.endsWith('tmp\\runtime-seed-pipeline.json') || args.output.endsWith('tmp/runtime-seed-pipeline.json'), true)
  assert.deepEqual(args.envFiles, ['deploy/env/staging.env'])
  assert.equal(args.operatorApprovalRef, 'approval-1')
  assert.equal(args.skipTcp, true)
  assert.equal(args.skipRun, true)
  assert.equal(args.failOnBlocked, true)
})

test('routes runtime seed pipeline steps and reports through the requested output root', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/default-master-plan-audit/default-master-plan-profile-samples.json',
    '--output-root',
    'tmp/default-master-plan-audit/runtime-seed-pipeline',
  ])
  const reportPaths = buildReportPaths(args)
  const steps = buildPipelineSteps({ ...args, reportPaths })

  assert.equal(reportPaths.preflight.endsWith('tmp\\default-master-plan-audit\\runtime-seed-pipeline\\runtime-seed-evidence-preflight.json') || reportPaths.preflight.endsWith('tmp/default-master-plan-audit/runtime-seed-pipeline/runtime-seed-evidence-preflight.json'), true)
  assert.equal(reportPaths.governancePreflight.endsWith('tmp\\default-master-plan-audit\\runtime-seed-pipeline\\runtime-seed-governance-preflight.json') || reportPaths.governancePreflight.endsWith('tmp/default-master-plan-audit/runtime-seed-pipeline/runtime-seed-governance-preflight.json'), true)
  assert.equal(args.output.endsWith('tmp\\default-master-plan-audit\\runtime-seed-pipeline\\runtime-seed-evidence-pipeline.json') || args.output.endsWith('tmp/default-master-plan-audit/runtime-seed-pipeline/runtime-seed-evidence-pipeline.json'), true)

  const governancePreflightStep = steps.find((step) => step.id === 'runtime_seed_governance_preflight')
  const preflightStep = steps.find((step) => step.id === 'runtime_seed_preflight')
  const environmentStep = steps.find((step) => step.id === 'runtime_seed_environment')
  const coverageStep = steps.find((step) => step.id === 'runtime_seed_coverage')
  const importGateStep = steps.find((step) => step.id === 'runtime_seed_import_gate')

  assert.deepEqual(governancePreflightStep.command.slice(-2), [
    '--output',
    reportPaths.governancePreflight,
  ])
  assert.deepEqual(preflightStep.command.slice(-4), [
    '--profile-report',
    args.profileReport,
    '--output',
    reportPaths.preflight,
  ])
  assert.deepEqual(environmentStep.command.slice(-6), [
    '--profile-report',
    args.profileReport,
    '--runtime-seed-preflight',
    reportPaths.preflight,
    '--output',
    reportPaths.environment,
  ])
  assert.deepEqual(coverageStep.command.slice(-6), [
    '--runtime-seed-preflight',
    reportPaths.preflight,
    '--governance-preflight',
    reportPaths.governancePreflight,
    '--output',
    reportPaths.coverage,
  ])
  assert.deepEqual(importGateStep.command.slice(-6), [
    '--environment-report',
    reportPaths.environment,
    '--coverage-package',
    reportPaths.coverage,
    '--output',
    reportPaths.importGate,
  ])
})

test('passes environment and operator flags to the appropriate pipeline steps', () => {
  const steps = buildPipelineSteps({
    envFiles: ['deploy/env/staging.env'],
    operatorApprovalRef: 'approval-1',
    skipTcp: true,
  })
  const environmentStep = steps.find((step) => step.id === 'runtime_seed_environment')
  const importGateStep = steps.find((step) => step.id === 'runtime_seed_import_gate')

  assert.deepEqual(environmentStep.command.slice(-3), ['--env-file', 'deploy/env/staging.env', '--skip-tcp'])
  assert.deepEqual(importGateStep.command.slice(-2), ['--operator-approval-ref', 'approval-1'])
})
