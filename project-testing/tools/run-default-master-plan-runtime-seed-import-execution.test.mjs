import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  buildRuntimeSeedImportExecutionReport,
  buildRuntimeSeedImportExecutionSteps,
  evaluateRuntimeSeedImportExecutionGate,
  parseArgs,
  shouldRunCommandThroughShell,
} from './run-default-master-plan-runtime-seed-import-execution.mjs'

const REPORT_ROOT = path.resolve('project-testing/reports/default-master-plan-profiles')

function loadedImportGate(json) {
  return {
    path: path.join(REPORT_ROOT, 'runtime-seed-import-gate.json'),
    sha256: 'import-gate-sha256',
    json,
  }
}

function importGateReport(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
    source: 'build-default-master-plan-runtime-seed-import-gate',
    status: 'runtime_seed_import_allowed',
    target: {
      targetClass: 'local_supabase',
      targetFingerprint: 'local-target-fingerprint',
    },
    importGate: {
      importAllowed: true,
      importMode: 'local_active_seed_smoke_import',
      allowedCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-standard-duration-seed-smoke --expected-target-fingerprint local-target-fingerprint',
    },
    blockers: [],
    manualActions: [],
    ...overrides,
  }
}

function completedStep(id, mayWriteAlgorithmSeeds = false) {
  return {
    id,
    command: `command for ${id}`,
    mayWriteAlgorithmSeeds,
    exitCode: 0,
    status: 'completed',
    durationMs: 1,
    stdout: '',
    stderr: '',
  }
}

function postImportVerification(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-post-import-verification/v1',
    source: 'check-default-master-plan-runtime-seed-post-import',
    status: 'runtime_seed_post_import_verified',
    runtimeSeedEvidence: {
      profileRowCount: 2,
      runtimeSeedRowCount: 2,
      fallbackOrMissingSeedRowCount: 0,
      allProfileRowsRuntime: true,
    },
    runtimeT2Evidence: {
      profileRowCount: 2,
      runtimeT2RowCount: 2,
      fallbackOrMissingT2RowCount: 0,
      allProfileT2RowsRuntime: true,
    },
    blockers: [],
    mutationBoundary: {
      writesProductionTables: false,
      writesAlgorithmSeedRecords: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
    ...overrides,
  }
}

test('blocks runtime seed import execution by default even when import gate is allowed', () => {
  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: importGateReport(),
    loadedImportGate: loadedImportGate(importGateReport()),
    args: {},
    stepResults: [],
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_import_execution_blocked')
  assert.equal(report.executionControl.executionAllowed, false)
  assert.deepEqual(report.blockers, [
    'runtime_seed_import_execution_allow_import_required',
    'runtime_seed_import_seed_smoke_user_id_required',
  ])
  assert.equal(report.mutationBoundary.executesRuntimeSeedImport, false)
  assert.equal(report.mutationBoundary.writesTasks, false)
  assert.equal(report.mutationBoundary.writesTaskDependencies, false)
  assert.equal(report.mutationBoundary.writesRuntimePublication, false)
})

test('blocks runtime seed import execution when import gate is blocked', () => {
  const blockedGate = importGateReport({
    status: 'runtime_seed_import_blocked',
    importGate: {
      importAllowed: false,
      importMode: 'local_active_seed_smoke_import',
      allowedCommand: null,
    },
    blockers: ['local_supabase_must_be_reachable_before_seed_import'],
    manualActions: ['start local Supabase and rerun runtime seed environment evidence'],
  })

  const gate = evaluateRuntimeSeedImportExecutionGate({
    importGateReport: blockedGate,
    allowImport: true,
    seedSmokeUserId: 'operator-1',
  })

  assert.equal(gate.executionAllowed, false)
  assert.deepEqual(gate.blockers, ['runtime_seed_import_gate_not_allowed'])

  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: blockedGate,
    loadedImportGate: loadedImportGate(blockedGate),
    args: {
      allowImport: true,
      seedSmokeUserId: 'operator-1',
    },
    stepResults: [],
  })

  assert.equal(report.status, 'runtime_seed_import_execution_blocked')
  assert.equal(report.executionControl.executionAllowed, false)
  assert.deepEqual(report.upstreamBlockers, ['local_supabase_must_be_reachable_before_seed_import'])
  assert.deepEqual(report.nextActions, [
    'start local Supabase and rerun runtime seed environment evidence',
    'rerun runtime seed evidence pipeline until import gate is allowed',
  ])
})

test('builds governed import and post-import verification steps when execution is allowed', () => {
  const steps = buildRuntimeSeedImportExecutionSteps({
    seedSmokeUserId: 'operator-1',
  })

  assert.equal(steps.length, 4)
  assert.deepEqual(steps[0].command, [
    'npx.cmd',
    'tsx',
    'project-testing/tools/generate-default-master-plan-profile-report.mjs',
    '--import-active-standard-duration-seed-smoke',
    '--seed-smoke-user-id',
    'operator-1',
  ])
  assert.equal(steps[0].mayWriteAlgorithmSeeds, true)
  assert.deepEqual(steps.slice(1).map((step) => step.id), [
    'regenerate_profile_report',
    'runtime_seed_preflight',
    'runtime_seed_post_import',
  ])
  assert.equal(steps.slice(1).every((step) => step.mayWriteAlgorithmSeeds === false), true)
})

test('builds governed import step from import gate allowed command when provided', () => {
  const steps = buildRuntimeSeedImportExecutionSteps({
    seedSmokeUserId: 'operator-1',
    importCommandBase: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke',
  })

  assert.equal(steps.length, 4)
  assert.deepEqual(steps[0].command, [
    'npx.cmd',
    'tsx',
    'project-testing/tools/generate-default-master-plan-profile-report.mjs',
    '--import-active-duration-asset-seeds-smoke',
    '--seed-smoke-user-id',
    'operator-1',
  ])
  assert.equal(steps[0].mayWriteAlgorithmSeeds, true)
})

test('preserves quoted env target binding for import and profile regeneration', () => {
  const command = 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke --env-file "tmp/staging env.env" --expected-env-file-sha256 abc123 --expected-target-fingerprint target123'
  const steps = buildRuntimeSeedImportExecutionSteps({
    seedSmokeUserId: 'operator-1',
    importCommandBase: command,
  })

  assert.equal(steps[0].command.includes('tmp/staging env.env'), true)
  assert.deepEqual(steps[1].command.slice(-6), [
    '--env-file',
    'tmp/staging env.env',
    '--expected-env-file-sha256',
    'abc123',
    '--expected-target-fingerprint',
    'target123',
  ])
})

test('reports completed execution only after every allowed step completes', () => {
  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: importGateReport(),
    loadedImportGate: loadedImportGate(importGateReport()),
    postImportVerificationReport: postImportVerification(),
    args: {
      allowImport: true,
      seedSmokeUserId: 'operator-1',
    },
    stepResults: [
      completedStep('runtime_seed_import', true),
      completedStep('regenerate_profile_report'),
      completedStep('runtime_seed_preflight'),
      completedStep('runtime_seed_post_import'),
    ],
  })

  assert.equal(report.status, 'runtime_seed_import_execution_completed')
  assert.equal(report.postImportVerification.activeStandardWorkDurationSeedReady, true)
  assert.equal(report.postImportVerification.activeT2RhythmTemplateReady, true)
  assert.equal(report.executionControl.executionAllowed, true)
  assert.deepEqual(report.blockers, [])
  assert.equal(report.mutationBoundary.executesRuntimeSeedImport, true)
  assert.equal(report.mutationBoundary.writesTasks, false)
  assert.equal(report.mutationBoundary.writesTaskDependencies, false)
  assert.equal(report.mutationBoundary.writesRuntimePublication, false)
})

test('blocks completed-looking execution when post-import verification still reports fallback seed or T2 rows', () => {
  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: importGateReport(),
    loadedImportGate: loadedImportGate(importGateReport()),
    postImportVerificationReport: postImportVerification({
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
    }),
    args: {
      allowImport: true,
      seedSmokeUserId: 'operator-1',
    },
    stepResults: [
      completedStep('runtime_seed_import', true),
      completedStep('regenerate_profile_report'),
      completedStep('runtime_seed_preflight'),
      completedStep('runtime_seed_post_import'),
    ],
  })

  assert.equal(report.status, 'runtime_seed_import_execution_post_import_blocked')
  assert.equal(report.postImportVerification.activeStandardWorkDurationSeedReady, false)
  assert.equal(report.postImportVerification.activeT2RhythmTemplateReady, false)
  assert.equal(report.blockers.includes('runtime_seed_post_import_profile_rows_not_all_runtime'), true)
  assert.equal(report.blockers.includes('runtime_t2_post_import_profile_rows_not_all_runtime'), true)
  assert.equal(report.blockers.includes('runtime_seed_post_import_verification_not_verified'), true)
  assert.deepEqual(report.nextActions, [
    'Fix runtime seed post-import verification before treating import execution as completed.',
    'Rerun runtime seed import execution after profile rows consume active runtime standard duration seed and T2 rhythm sources.',
  ])
})

test('failed import step prevents stale post-import success claim', () => {
  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: importGateReport(),
    args: {
      allowImport: true,
      seedSmokeUserId: 'operator-1',
    },
    stepResults: [
      {
        id: 'runtime_seed_import',
        command: 'import command',
        mayWriteAlgorithmSeeds: true,
        exitCode: 1,
        status: 'failed',
        durationMs: 1,
        stdout: '',
        stderr: 'import failed',
      },
    ],
  })

  assert.equal(report.status, 'runtime_seed_import_execution_failed')
  assert.deepEqual(report.blockers, ['runtime_seed_import_failed'])
  assert.deepEqual(report.nextActions, [
    'Fix failed runtime seed import execution step(s): runtime_seed_import',
    'Rerun runtime seed import execution after resolving the failed step.',
  ])
})

test('parses runtime seed import execution CLI args', () => {
  const args = parseArgs([
    '--import-gate',
    'tmp/runtime-seed-import-gate.json',
    '--output',
    'tmp/runtime-seed-import-execution.json',
    '--allow-import',
    '--seed-smoke-user-id',
    'operator-1',
    '--skip-run',
    '--fail-on-blocked',
  ])

  assert.equal(args.importGate.endsWith('tmp\\runtime-seed-import-gate.json') || args.importGate.endsWith('tmp/runtime-seed-import-gate.json'), true)
  assert.equal(args.output.endsWith('tmp\\runtime-seed-import-execution.json') || args.output.endsWith('tmp/runtime-seed-import-execution.json'), true)
  assert.equal(args.allowImport, true)
  assert.equal(args.seedSmokeUserId, 'operator-1')
  assert.equal(args.skipRun, true)
  assert.equal(args.failOnBlocked, true)
})

test('uses shell for Windows cmd shims to avoid spawn EINVAL', () => {
  assert.equal(
    shouldRunCommandThroughShell(['npx.cmd', '--version']),
    process.platform === 'win32',
  )
  assert.equal(shouldRunCommandThroughShell([process.execPath, '--version']), false)
})
