import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildPgClientConfig,
  buildCandidateRefreshExecutionReport,
  evaluateCandidateRefreshExecutionGate,
  mapReplacementRowsToBaselineItems,
  parseArgs,
  runDefaultMasterPlanCandidateRefreshExecution,
} from './run-default-master-plan-candidate-refresh-execution.mjs'

test('blocks candidate baseline item refresh execution by default without writing DB rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const queries = []

  await writeJson(refreshPackage, refreshPackageFixture())
  await writeJson(preflight, preflightFixture())

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      output,
      mode: '',
      environment: 'staging',
      env: {},
      dbClientFactory: () => mockClient(queries),
      now: new Date('2026-07-04T17:00:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_blocked')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.deepEqual(report.blockers, [
      'candidate_refresh_preflight_not_ready',
      'candidate_refresh_preflight_refresh_package_hash_required',
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_execute_mode_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
    ])
    assert.equal(report.executionGatePlan.status, 'blocked')
    assert.equal(report.executionGatePlan.noAutoExecution, true)
    assert.deepEqual(report.executionGatePlan.requiredStepIds, [
      'refresh_candidate_execution_preflight',
      'set_candidate_refresh_execution_unlock',
      'run_candidate_refresh_in_execute_mode_with_allow_flag',
      'record_candidate_refresh_operator_approval_and_actor',
    ])
    assert.deepEqual(report.executionGatePlan.blockedStepIds, [
      'rerun_candidate_refresh_execution_after_gate',
    ])
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(queries.length, 0)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'candidate_refresh_execution_blocked')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_refresh_execution_blocked/)
    assert.match(markdown, /candidate_refresh_execution_unlock_required/)
    assert.match(markdown, /Execution Gate Plan/)
    assert.match(markdown, /refresh_candidate_execution_preflight/)
    assert.match(markdown, /rerun_candidate_refresh_execution_after_gate/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dry-run reports the candidate baseline item replacement plan without opening a DB client', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  let factoryCalled = false

  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      output,
      mode: 'dry-run',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: () => {
        factoryCalled = true
        return mockClient([])
      },
      now: new Date('2026-07-04T17:05:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_dry_run')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.deepEqual(report.blockers, ['candidate_refresh_execute_mode_required'])
    assert.deepEqual(report.executionGatePlan.requiredStepIds, [
      'run_candidate_refresh_in_execute_mode_with_allow_flag',
    ])
    assert.deepEqual(report.executionGatePlan.blockedStepIds, [
      'rerun_candidate_refresh_execution_after_gate',
    ])
    assert.equal(report.refreshPlan.targetReplacementRowCount, 3)
    assert.equal(report.refreshPlan.wouldDeleteExistingRows, true)
    assert.equal(report.refreshPlan.wouldInsertReplacementRows, true)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(factoryCalled, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execution when ready preflight omits target database discovery evidence', async () => {
  const packagePayload = refreshPackageFixture()
  const preflight = preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    candidateDiscovery: null,
  })

  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: packagePayload,
    preflight,
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
  })

  assert.equal(gate.executionAllowed, false)
  assert.equal(gate.blockers.includes('candidate_refresh_preflight_candidate_discovery_required'), true)
})

test('blocks execution when current database target differs from the preflight target', () => {
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    target: {
      readable: true,
      supabaseProjectRef: 'different-target-ref',
      databaseHost: 'db.different-target-ref.supabase.co',
    },
  })

  assert.equal(gate.executionAllowed, false)
  assert.equal(gate.blockers.includes('candidate_refresh_preflight_execution_target_mismatch'), true)
})

test('blocks execute mode when the authorization package and readiness seal are absent', () => {
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      expectedStagingProjectRef: 'staging-test-ref',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    target: executionTargetFixture(),
  })

  assert.equal(gate.executionAllowed, false)
  assert.equal(gate.blockers.includes('candidate_refresh_authorization_package_required'), true)
  assert.equal(gate.blockers.includes('candidate_refresh_execution_readiness_seal_required'), true)
})

test('blocks same-host candidate refresh when database identity differs', () => {
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
      executionTarget: executionTargetFixture({ databaseName: 'approved_staging' }),
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      expectedStagingProjectRef: 'staging-test-ref',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    target: executionTargetFixture({ databaseName: 'production' }),
  })

  assert.equal(gate.executionAllowed, false)
  assert.equal(gate.blockers.includes('candidate_refresh_preflight_execution_target_mismatch'), true)
})

test('blocks a production project ref mislabeled as staging', () => {
  const gate = evaluateCandidateRefreshExecutionGate({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
      executionTarget: executionTargetFixture({
        supabaseProjectRef: 'production-test-ref',
        databaseHost: 'db.production-test-ref.supabase.co',
      }),
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      expectedStagingProjectRef: 'staging-test-ref',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    target: executionTargetFixture({
      supabaseProjectRef: 'production-test-ref',
      databaseHost: 'db.production-test-ref.supabase.co',
    }),
  })

  assert.equal(gate.executionAllowed, false)
  assert.equal(gate.blockers.includes('candidate_refresh_target_not_approved_staging_project'), true)
})

test('verifies matching authorization package without opening a DB client in dry-run', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-auth-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  let factoryCalled = false

  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  await writeJson(authorizationPackage, authorizationPackageFixture({
    refreshPackagePath: refreshPackage,
    preflightPath: preflight,
  }))

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      authorizationPackage,
      output,
      mode: 'dry-run',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: () => {
        factoryCalled = true
        return mockClient([])
      },
      now: new Date('2026-07-04T17:06:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_dry_run')
    assert.equal(report.executionControl.authorizationPackageChecked, true)
    assert.equal(report.executionControl.authorizationPackageVerified, true)
    assert.equal(report.evidence.authorizationPackageRef.startsWith('candidate_refresh_authorization_package:'), true)
    assert.deepEqual(report.blockers, ['candidate_refresh_execute_mode_required'])
    assert.equal(factoryCalled, false)
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /authorizationPackageChecked: true/)
    assert.match(markdown, /authorizationPackageVerified: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execution when authorization package actor does not match command boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-auth-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const queries = []

  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  await writeJson(authorizationPackage, authorizationPackageFixture({
    refreshPackagePath: refreshPackage,
    preflightPath: preflight,
    refreshedBy: '22222222-2222-4222-8222-222222222222',
  }))

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      authorizationPackage,
      output,
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: () => mockClient(queries),
      now: new Date('2026-07-04T17:07:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_blocked')
    assert.equal(report.executionControl.authorizationPackageChecked, true)
    assert.equal(report.executionControl.authorizationPackageVerified, false)
    assert.equal(report.blockers.includes('candidate_refresh_authorization_refreshed_by_mismatch'), true)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(queries.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks execution when the authorization package changed after the readiness seal was created', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-stale-seal-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const readinessSeal = path.join(root, 'candidate-refresh-execution-readiness-seal.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  await writeAuthorizationAndSeal({ refreshPackage, preflight, authorizationPackage, readinessSeal })
  const authorization = JSON.parse(await readFile(authorizationPackage, 'utf8'))
  await writeJson(authorizationPackage, { ...authorization, generatedAt: '2026-07-04T16:31:00.000Z' })

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      authorizationPackage,
      readinessSeal,
      output,
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      expectedStagingProjectRef: 'staging-test-ref',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: { WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1' },
      dbClientFactory: () => mockClient([]),
    })

    assert.equal(report.status, 'candidate_refresh_execution_blocked')
    assert.equal(report.blockers.includes('candidate_refresh_execution_readiness_seal_authorization_hash_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute refreshes candidate task_baseline_items in one guarded transaction', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const readinessSeal = path.join(root, 'candidate-refresh-execution-readiness-seal.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const queries = []

  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  await writeAuthorizationAndSeal({ refreshPackage, preflight, authorizationPackage, readinessSeal })

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      authorizationPackage,
      readinessSeal,
      output,
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      expectedStagingProjectRef: 'staging-test-ref',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: () => mockClient(queries),
      idFactory: (index) => `00000000-0000-4000-8000-00000000000${index + 1}`,
      now: new Date('2026-07-04T17:10:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_completed')
    assert.equal(report.executionControl.executionAllowed, true)
    assert.equal(report.deletedRowCount, 2)
    assert.equal(report.insertedRowCount, 3)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
    assert.deepEqual(queries.map((entry) => entry.sql), [
      'BEGIN',
      'SELECT id, project_id, source_version_label, status FROM public.task_baselines WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE',
      'DELETE FROM public.task_baseline_items WHERE baseline_version_id = $1::uuid AND project_id = $2::uuid',
      'INSERT INTO public.task_baseline_items (id, project_id, baseline_version_id, parent_item_id, source_task_id, source_milestone_id, title, planned_start_date, planned_end_date, target_progress, sort_order, is_milestone, is_critical, is_baseline_critical, mapping_status, notes, template_id, template_node_id, engineering_category_id, wbs_node_type, wbs_path, is_wbs_summary, is_executable, standard_work_code, standard_work_name, duration_calibration_source, duration_provenance, generation_metadata, last_generated_at, created_at, updated_at) VALUES ...',
      'COMMIT',
      'END',
    ])
    const insertedRows = reconstructInsertedRows(queries[3])
    assert.equal(insertedRows.length, 3)
    assert.equal(insertedRows[0].standard_work_code, 'BTMP-BASE-01')
    assert.equal(insertedRows[0].generation_metadata.candidateOnly, true)
    assert.equal(insertedRows[0].generation_metadata.writesTasks, false)
    assert.equal(insertedRows[0].generation_metadata.operatorApprovalRef, 'pm-approval:baseline-school:2026-07-04')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate refresh execution when preflight points to a different refresh package hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const readinessSeal = path.join(root, 'candidate-refresh-execution-readiness-seal.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const queries = []
  const packagePayload = refreshPackageFixture()

  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: `candidate_refresh_package:${path.relative(process.cwd(), refreshPackage).replaceAll('\\', '/')}#sha256=${'0'.repeat(64)}`,
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  await writeAuthorizationAndSeal({ refreshPackage, preflight, authorizationPackage, readinessSeal })

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      targetReader: async () => executionTargetFixture(),
      refreshPackage,
      preflight,
      authorizationPackage,
      readinessSeal,
      output,
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      expectedStagingProjectRef: 'staging-test-ref',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: () => mockClient(queries),
      now: new Date('2026-07-04T17:12:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_blocked')
    assert.equal(report.executionControl.executionAllowed, false)
    assert.deepEqual(report.blockers, ['candidate_refresh_preflight_refresh_package_hash_mismatch'])
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(queries.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rolls back candidate refresh transaction when insert fails', async () => {
  const queries = []
  const report = await buildCandidateRefreshExecutionReport({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    executionResult: {
      status: 'failed',
      deletedRowCount: 2,
      insertedRowCount: 0,
      errorMessage: 'insert exploded',
      transactionRolledBack: true,
      queryLog: ['BEGIN', 'SELECT baseline', 'DELETE items', 'ROLLBACK'],
    },
    generatedAt: '2026-07-04T17:15:00.000Z',
  })

  assert.equal(report.status, 'candidate_refresh_execution_failed')
  assert.deepEqual(report.blockers, ['candidate_refresh_db_execution_failed'])
    assert.equal(report.transaction.rolledBack, true)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.dbRepairPlan.status, 'blocked')
    assert.equal(report.dbRepairPlan.failureClass, 'db_execution_or_connection_failed')
    assert.deepEqual(report.dbRepairPlan.requiredStepIds, ['confirm_candidate_refresh_target_identity', 'inspect_candidate_refresh_transaction_failure'])
    assert.deepEqual(report.dbRepairPlan.blockedStepIds, ['rerun_candidate_refresh_execution'])
    assert.equal(report.dbRepairPlan.noAutoCredentialRotation, true)
    assert.equal(queries.length, 0)
})

test('reports missing staging candidate baseline as an explicit refresh target blocker', async () => {
  const report = await buildCandidateRefreshExecutionReport({
    refreshPackage: refreshPackageFixture(),
    preflight: preflightFixture({
      status: 'ready_for_execute',
      mayExecuteCandidateRefresh: true,
      blockers: [],
    }),
    args: {
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
    },
    env: {
      WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
    },
    executionResult: {
      status: 'failed',
      deletedRowCount: 0,
      insertedRowCount: 0,
      errorCode: 'candidate_baseline_version_not_found',
      errorMessage: 'candidate baseline version not found for refresh target',
      transactionRolledBack: true,
      queryLog: ['BEGIN', 'SELECT baseline', 'ROLLBACK'],
    },
    generatedAt: '2026-07-04T17:18:00.000Z',
  })

  assert.equal(report.status, 'candidate_refresh_execution_failed')
  assert.deepEqual(report.blockers, [
    'candidate_refresh_target_baseline_not_found',
    'candidate_refresh_db_execution_failed',
  ])
  assert.equal(report.errorCode, 'candidate_baseline_version_not_found')
  assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
})

test('writes structured evidence when the database connection cannot be opened', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-exec-'))
  const refreshPackage = path.join(root, 'candidate-refresh-package.json')
  const preflight = path.join(root, 'candidate-refresh-execution-preflight.json')
  const authorizationPackage = path.join(root, 'candidate-refresh-authorization-package.json')
  const readinessSeal = path.join(root, 'candidate-refresh-execution-readiness-seal.json')
  const output = path.join(root, 'candidate-refresh-execution.json')
  const envFile = path.join(root, 'server.env')

  const packagePayload = refreshPackageFixture()
  await writeJson(refreshPackage, packagePayload)
  await writeJson(preflight, preflightFixture({
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    refreshPackageRef: refreshPackageRefFor(refreshPackage, packagePayload),
    executionTarget: {
      envFileRef: 'server.env',
      envFileSha256: 'server-env-sha256',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      databasePort: '5432',
      databaseName: 'postgres',
      databaseUser: 'postgres',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      readable: true,
    },
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
    },
  }))
  const envText = [
    'SUPABASE_MIGRATION_URL=postgresql://postgres:secret@db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432/postgres',
    'DB_CONNECTION_STRING=postgresql://workbuddy_runtime_login:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
  ].join('\n')
  await writeFile(envFile, `${envText}\n`, 'utf8')
  await writeAuthorizationAndSeal({
    refreshPackage,
    preflight,
    authorizationPackage,
    readinessSeal,
    environment: 'staging',
  })

  try {
    const report = await runDefaultMasterPlanCandidateRefreshExecution({
      refreshPackage,
      preflight,
      authorizationPackage,
      readinessSeal,
      output,
      envFile,
      mode: 'execute',
      allowRefresh: true,
      environment: 'staging',
      expectedStagingProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      dbClientFactory: async () => {
        throw Object.assign(new Error('password authentication failed for user "postgres"'), {
          code: '28P01',
        })
      },
      now: new Date('2026-07-04T17:19:00.000Z'),
    })

    assert.equal(report.status, 'candidate_refresh_execution_failed')
    assert.deepEqual(report.blockers, [
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ])
    assert.equal(report.errorCode, '28P01')
    assert.match(report.errorMessage, /password authentication failed/)
    assert.equal(report.failureClass, 'authentication_failed')
    assert.equal(report.transaction.attempted, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(report.dbRepairPlan.status, 'blocked')
    assert.equal(report.dbRepairPlan.failureClass, 'authentication_failed')
    assert.deepEqual(report.dbRepairPlan.requiredStepIds, [
      'confirm_candidate_refresh_target_identity',
      'repair_or_rotate_candidate_refresh_db_credentials',
    ])
    assert.deepEqual(report.dbRepairPlan.orderedSteps[0].commands, [
      'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
      'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
      'npm.cmd run evidence:default-master-plan:candidate-hygiene',
    ])
    assert.deepEqual(report.dbRepairPlan.blockedStepIds, ['rerun_candidate_refresh_execution'])
    assert.equal(report.dbRepairPlan.target.envFileRef.endsWith('server.env'), true)
    assert.equal(report.dbRepairPlan.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.equal(report.dbRepairPlan.target.supabaseProjectRef, 'wwdrkjnbvcbfytwnnyvs')
    assert.equal(JSON.stringify(report.dbRepairPlan).includes('secret'), false)
    assert.equal(report.target.envFileRef.endsWith('server.env'), true)
    assert.equal(report.target.envFileSha256, createHash('sha256').update(`${envText}\n`).digest('hex'))
    assert.equal(report.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.equal(report.target.databaseHost, 'db.wwdrkjnbvcbfytwnnyvs.supabase.co')
    assert.equal(report.target.databasePort, '5432')
    assert.equal(report.target.databaseName, 'postgres')
    assert.equal(report.target.databaseUser, 'postgres')
    assert.equal(report.target.supabaseProjectRef, 'wwdrkjnbvcbfytwnnyvs')
    assert.equal(report.target.hasPassword, true)
    assert.equal(report.target.envFileReadable, true)
    assert.equal(Object.values(report.target).some((value) => String(value).includes('secret')), false)
    assert.ok(report.nextActions.some((action) => action.includes('server.env')))

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'candidate_refresh_execution_failed')
    assert.deepEqual(written.blockers, [
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ])
    assert.equal(written.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.equal(written.failureClass, 'authentication_failed')
    assert.equal(written.dbRepairPlan.failureClass, 'authentication_failed')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /DB Repair Plan/)
    assert.match(markdown, /failureClass: authentication_failed/)
    assert.match(markdown, /candidate-refresh-db-repair-readiness/)
    assert.match(markdown, /repair_or_rotate_candidate_refresh_db_credentials/)
    assert.equal(markdown.includes('secret'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds pg client config with sslmode stripped so explicit TLS verifier policy is authoritative', () => {
  const config = buildPgClientConfig(
    'postgresql://workbuddy_runtime_login:secret@db.example.supabase.co:5432/postgres?sslmode=require&application_name=candidate-refresh',
    {},
  )

  assert.equal(config.connectionString.includes('sslmode='), false)
  assert.equal(config.connectionString.includes('application_name=candidate-refresh'), true)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.connectionTimeoutMillis, 12000)
  assert.equal(config.query_timeout, 30000)
  assert.equal(config.statement_timeout, 30000)
})

test('maps replacement rows into candidate-only task_baseline_items with asset lineage metadata', () => {
  const refreshPackage = refreshPackageFixture()
  refreshPackage.targetReplacementRows[1].clientRowId = 'generated:school:BTMP-SCH-02'
  refreshPackage.targetReplacementRows[1].predecessorDependencies = [{
    clientRowId: 'generated:school:BTMP-BASE-01',
    dependencyType: 'FS',
    lagDays: 0,
    intentCode: 'business_type_master_plan_profile_sequence',
  }]
  const rows = mapReplacementRowsToBaselineItems({
    rows: refreshPackage.targetReplacementRows,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    refreshedBy: '11111111-1111-4111-8111-111111111111',
    operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
    generatedAt: '2026-07-04T17:20:00.000Z',
    idFactory: (index) => `00000000-0000-4000-8000-00000000000${index + 1}`,
  })

  assert.equal(rows.length, 3)
  assert.equal(rows[1].baseline_version_id, 'baseline-school')
  assert.equal(rows[1].project_id, 'project-school')
  assert.equal(rows[1].title, '教学楼二次结构与普通教室粗装修')
  assert.equal(rows[1].mapping_status, 'pending')
  assert.equal(rows[1].standard_work_code, 'BTMP-SCH-02')
  assert.equal(rows[1].duration_calibration_source, 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence')
  assert.equal(rows[1].generation_metadata.source, 'candidate_refresh_execution')
  assert.equal(rows[1].generation_metadata.businessType, 'school')
  assert.equal(rows[1].generation_metadata.executionPhase, 'mep_roughin')
  assert.equal(rows[1].generation_metadata.clientRowId, 'generated:school:BTMP-SCH-02')
  assert.deepEqual(rows[1].generation_metadata.predecessorDependencies, [{
    clientRowId: 'generated:school:BTMP-BASE-01',
    dependencyType: 'FS',
    lagDays: 0,
    intentCode: 'business_type_master_plan_profile_sequence',
  }])
  assert.equal(rows[1].generation_metadata.candidateOnly, true)
  assert.equal(rows[1].generation_metadata.writesRuntimePublication, false)
})

test('parses candidate refresh execution CLI args', () => {
  const args = parseArgs([
    '--refresh-package',
    'tmp/candidate-refresh-package.json',
    '--preflight',
    'tmp/candidate-refresh-execution-preflight.json',
    '--authorization-package',
    'tmp/candidate-refresh-authorization-package.json',
    '--output',
    'tmp/candidate-refresh-execution.json',
    '--environment',
    'staging',
    '--operator-approval-ref',
    'approval-1',
    '--refreshed-by',
    'user-1',
    '--mode',
    'execute',
    '--allow-refresh',
    '--fail-on-blocked',
  ])

  assert.equal(args.refreshPackage.endsWith('tmp\\candidate-refresh-package.json') || args.refreshPackage.endsWith('tmp/candidate-refresh-package.json'), true)
  assert.equal(args.preflight.endsWith('tmp\\candidate-refresh-execution-preflight.json') || args.preflight.endsWith('tmp/candidate-refresh-execution-preflight.json'), true)
  assert.equal(args.authorizationPackage.endsWith('tmp\\candidate-refresh-authorization-package.json') || args.authorizationPackage.endsWith('tmp/candidate-refresh-authorization-package.json'), true)
  assert.equal(args.output.endsWith('tmp\\candidate-refresh-execution.json') || args.output.endsWith('tmp/candidate-refresh-execution.json'), true)
  assert.equal(args.environment, 'staging')
  assert.equal(args.operatorApprovalRef, 'approval-1')
  assert.equal(args.refreshedBy, 'user-1')
  assert.equal(args.mode, 'execute')
  assert.equal(args.allowRefresh, true)
  assert.equal(args.failOnBlocked, true)
})

function mockClient(queries) {
  return {
    async connect() {
      queries.push({ sql: 'CONNECT', params: [] })
    },
    async end() {
      queries.push({ sql: 'END', params: [] })
    },
    async query(sql, params = []) {
      const normalized = normalizeSql(sql)
      if (normalized === 'CONNECT' || normalized === 'END') return { rowCount: 0, rows: [] }
      if (normalized === 'SELECT id, project_id, source_version_label, status FROM public.task_baselines WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE') {
        queries.push({ sql: normalized, params })
        return {
          rowCount: 1,
          rows: [{
            id: 'baseline-school',
            project_id: 'project-school',
            source_version_label: 'managed_frontier_default_master_plan',
            status: 'draft',
          }],
        }
      }
      if (normalized.startsWith('INSERT INTO public.task_baseline_items')) {
        queries.push({ sql: 'INSERT INTO public.task_baseline_items (id, project_id, baseline_version_id, parent_item_id, source_task_id, source_milestone_id, title, planned_start_date, planned_end_date, target_progress, sort_order, is_milestone, is_critical, is_baseline_critical, mapping_status, notes, template_id, template_node_id, engineering_category_id, wbs_node_type, wbs_path, is_wbs_summary, is_executable, standard_work_code, standard_work_name, duration_calibration_source, duration_provenance, generation_metadata, last_generated_at, created_at, updated_at) VALUES ...', rawSql: normalized, params })
        return { rowCount: params.length, rows: [] }
      }
      queries.push({ sql: normalized, params })
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') return { rowCount: 0, rows: [] }
      if (normalized === 'DELETE FROM public.task_baseline_items WHERE baseline_version_id = $1::uuid AND project_id = $2::uuid') return { rowCount: 2, rows: [] }
      return { rowCount: 0, rows: [] }
    },
  }
}

function normalizeSql(sql) {
  return String(sql ?? '').replace(/\s+/g, ' ').trim()
}

function reconstructInsertedRows(queryEntry) {
  const match = /^INSERT INTO public\.task_baseline_items \(([^)]+)\) VALUES/i.exec(queryEntry.rawSql)
  const columns = match?.[1]?.split(',').map((column) => column.trim()) ?? []
  if (columns.length === 0) return []
  const rows = []
  for (let index = 0; index < queryEntry.params.length; index += columns.length) {
    const row = {}
    columns.forEach((column, columnIndex) => {
      const raw = queryEntry.params[index + columnIndex]
      row[column] = column === 'generation_metadata' && typeof raw === 'string'
        ? JSON.parse(raw)
        : raw
    })
    rows.push(row)
  }
  return rows
}

function refreshPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    source: 'build-default-master-plan-candidate-refresh-package',
    generatedAt: '2026-07-04T15:00:00.000Z',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    blockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
      executeAllowed: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      targetArtifactOnly: true,
    },
    targetReplacementRows: [
      replacementRow('BTMP-BASE-01', '施工准备与现场临设完成', 'startup_site_setup', 'site_preparation', 'business_type_base_master_plan_profile_v1'),
      replacementRow('BTMP-SCH-02', '教学楼二次结构与普通教室粗装修', 'mep_roughin', 'school_profile', 'business_type_master_plan_profile_v1'),
      replacementRow('BTMP-SCH-03', '实验室通风与专业机电安装', 'mep_roughin', 'laboratory_mep', 'business_type_master_plan_profile_v1'),
    ],
    diff: {
      currentRowCount: 2,
      targetRowCount: 3,
      missingTargetRows: [{ code: 'BTMP-SCH-02' }],
      extraCurrentRows: [],
      codeChangedRows: [{ fromCode: 'BTMP-SCH-02', toCode: 'BTMP-SCH-03' }],
      dateOrDurationChangedRows: [],
    },
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function refreshPackageRefFor(filePath, payload) {
  return `candidate_refresh_package:${path.relative(process.cwd(), filePath).replaceAll('\\', '/')}#sha256=${sha256Json(payload)}`
}

function sha256Json(payload) {
  return createHash('sha256').update(`${JSON.stringify(payload, null, 2)}\n`).digest('hex')
}

function preflightFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    source: 'check-default-master-plan-candidate-refresh-execution-preflight',
    generatedAt: '2026-07-04T16:00:00.000Z',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    refreshPlan: {
      refreshRequired: true,
      operationMode: 'full_replace_candidate_baseline_items_from_profile_report',
      targetReplacementRowCount: 3,
      targetRowsSafe: true,
      diff: {
        currentRowCount: 2,
        targetRowCount: 3,
      },
    },
    alreadyCurrent: false,
    mayExecuteCandidateRefresh: false,
    candidateDiscovery: {
      status: 'candidate_found',
      matchingBaselineFound: true,
      matchedBaselineId: 'baseline-school',
      filters: {
        projectId: 'project-school',
        environment: 'staging',
      },
      blockers: [],
    },
    executionTarget: {
      envFileRef: 'deploy/env/staging.env',
      envFileSha256: 'staging-env-sha256',
      supabaseProjectRef: 'staging-test-ref',
      databaseHost: 'db.staging-test-ref.supabase.co',
      databasePort: '5432',
      databaseName: 'postgres',
      databaseUser: 'postgres',
      connectionSource: 'DB_CONNECTION_STRING',
      readable: true,
    },
    packageBlockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    packageHardBlockers: [],
    blockers: [
      'candidate_refresh_unlock_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
      'candidate_refresh_execute_mode_required',
    ],
    executionPlan: {
      mode: '',
      environment: 'staging',
      refreshedBy: '',
      operatorApprovalRef: '',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: false,
    },
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesCandidateBaselines: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
    ...overrides,
  }
}

function executionTargetFixture(overrides = {}) {
  return {
    envFileRef: 'deploy/env/staging.env',
    envFileReadable: true,
    envFileSha256: 'staging-env-sha256',
    supabaseProjectRef: 'staging-test-ref',
    databaseHost: 'db.staging-test-ref.supabase.co',
    databasePort: '5432',
    databaseName: 'postgres',
    databaseUser: 'postgres',
    connectionSource: 'DB_CONNECTION_STRING',
    hasPassword: true,
    ...overrides,
  }
}

function authorizationPackageFixture({
  refreshPackagePath,
  preflightPath,
  operatorApprovalRef = 'pm-approval:baseline-school:2026-07-04',
  refreshedBy = '11111111-1111-4111-8111-111111111111',
  overrides = {},
} = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization-package/v1',
    source: 'build-default-master-plan-candidate-refresh-authorization-package',
    generatedAt: '2026-07-04T16:30:00.000Z',
    status: 'authorization_package_ready',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    environment: 'staging',
    preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(preflightPath)}`,
    executionRef: 'candidate_refresh_execution:tmp/candidate-refresh-execution.json',
    preflightReady: true,
    executionStatus: 'candidate_refresh_execution_blocked',
    executionCompleted: false,
    packageReadinessBlockers: [],
    executionBlockers: [],
    operatorFillTemplate: {
      schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization/v1',
      status: 'operator_confirmation_required',
      templateOnly: true,
      baselineId: 'baseline-school',
      projectId: 'project-school',
      businessType: 'school',
      environment: 'staging',
      preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(preflightPath)}`,
      approval: {
        operatorApprovalRef,
        refreshedBy,
        approvalBoundary: 'candidate_task_baseline_items_refresh_only',
      },
      execution: {
        refreshPackagePath: repoRelativeForTest(refreshPackagePath),
        mode: 'execute',
        allowRefresh: true,
        command: 'node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs --mode execute --allow-refresh',
      },
    },
    mutationBoundary: {
      packageOnly: true,
      doesNotAuthorizeExecution: true,
      doesNotMutateDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
    ...overrides,
  }
}

function repoRelativeForTest(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll('\\', '/')
}

function replacementRow(code, title, executionPhase, executionLane, profileSourceType) {
  return {
    index: Number(code.split('-').at(-1)) || 1,
    code,
    title,
    executionPhase,
    executionLane,
    startDate: '2026-07-01',
    endDate: '2026-07-30',
    durationDays: 30,
    profileSourceType,
    durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    businessType: 'school',
    source: 'candidate_refresh_package_from_profile_report',
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesProductionDependencies: false,
    writesRuntimePublication: false,
  }
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function writeAuthorizationAndSeal({
  refreshPackage,
  preflight,
  authorizationPackage,
  readinessSeal,
  environment = 'staging',
}) {
  await writeJson(authorizationPackage, authorizationPackageFixture({
    refreshPackagePath: refreshPackage,
    preflightPath: preflight,
  }))
  const [authorizationRaw, preflightRaw] = await Promise.all([
    readFile(authorizationPackage, 'utf8'),
    readFile(preflight, 'utf8'),
  ])
  await writeJson(readinessSeal, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-readiness-seal/v1',
    source: 'check-default-master-plan-candidate-refresh-execution-readiness',
    status: 'ready_for_candidate_refresh_execution',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    environment,
    authorizationPackageRef: `candidate_refresh_authorization_package:${repoRelativeForTest(authorizationPackage)}#sha256=${createHash('sha256').update(authorizationRaw).digest('hex')}`,
    preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(preflight)}#sha256=${createHash('sha256').update(preflightRaw).digest('hex')}`,
    executionControl: {
      executeReady: true,
    },
  })
}
