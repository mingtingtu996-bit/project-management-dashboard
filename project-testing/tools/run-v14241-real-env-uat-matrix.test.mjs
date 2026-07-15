import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildExecutionReport } from './run-v14241-real-env-uat-matrix.mjs'

function scenario(id = 'REAL-UAT-99') {
  return {
    id,
    title: 'Synthetic real-env scenario',
    priority: 'P0',
    tiers: [
      { name: 'UAT', requiredInputs: ['UAT URL'] },
      { name: 'staging', requiredInputs: ['staging base URL'] },
      { name: 'solo-live', requiredInputs: ['solo-live owner and self-approval refs'] },
      { name: 'live', requiredInputs: ['live handoff declaration'] },
    ],
    evidenceContract: {
      requiredArtifacts: [
        'real-uat-99-main.json',
        'screenshots/real-uat-99/*.png',
        'real-uat-99-audit.json',
      ],
      requiredMetadata: [
        'environment',
        'baseUrl',
        'actorRefs',
        'companyId',
        'projectId',
        'cleanupOrRollbackReadback',
      ],
      rejectIf: ['local-only', 'dry-run-only', 'mock-api-only'],
    },
  }
}

async function writeMatrix(root, scenarios) {
  const matrixFile = join(root, 'matrix.json')
  await writeFile(matrixFile, `${JSON.stringify({
    schemaVersion: 'test',
    status: 'matrix_ready_execution_blocked_until_real_environment_handoff',
    scenarios,
  }, null, 2)}\n`, 'utf8')
  return matrixFile
}

async function writeScenarioEvidence(root, environment = 'staging') {
  await mkdir(join(root, 'screenshots', 'real-uat-99'), { recursive: true })
  const doc = {
    environment,
    baseUrl: 'https://staging.example.test',
    actorRefs: ['tester-ref'],
    companyId: 'company-1',
    projectId: 'project-1',
    cleanupOrRollbackReadback: { status: 'pass' },
  }
  await writeFile(join(root, 'real-uat-99-main.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  await writeFile(join(root, 'real-uat-99-audit.json'), `${JSON.stringify({ environment, status: 'pass' }, null, 2)}\n`, 'utf8')
  await writeFile(join(root, 'screenshots', 'real-uat-99', 'step.png'), 'png-placeholder', 'utf8')
}

test('blocks all tiers when real scenario evidence artifacts are missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-02')])

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_blocked_missing_real_environment_inputs')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.blockedScenarioCount, 1)
  assert.deepEqual(report.summary.byTierStatus, { blocked_missing_real_handoff_inputs: 4 })
  assert.equal(report.scenarios[0].supportingEvidence.length, 0)
})

test('passes only the tier whose real evidence environment satisfies the scenario contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario()])
  await writeScenarioEvidence(root, 'staging')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const statuses = Object.fromEntries(report.scenarios[0].tiers.map((tier) => [tier.name, tier.status]))
  assert.equal(report.status, 'real_env_matrix_partially_executed_with_blockers')
  assert.equal(statuses.UAT, 'blocked_missing_real_handoff_inputs')
  assert.equal(statuses.staging, 'passed')
  assert.equal(statuses['solo-live'], 'blocked_missing_real_handoff_inputs')
  assert.equal(statuses.live, 'blocked_missing_real_handoff_inputs')
  assert.equal(report.summary.passedTierCount, 1)
})

test('reports closeout handoff evidence as support-only, not real UAT pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-04')])
  await writeFile(join(root, 'c19-runtime-publication-release-rollback-evidence-validation.json'), JSON.stringify({ status: 'pass' }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.supportOnlyScenarioCount, 1)
  assert.equal(report.scenarios[0].status, 'blocked_missing_real_handoff_inputs_with_supporting_evidence_only')
  assert.equal(report.scenarios[0].supportingEvidence[0].classification, 'supported_by_closeout_handoff_only')
  assert.equal(report.scenarios[0].supportingEvidence[0].closesRealEnvironmentTier, false)
})

test('records REAL-UAT-04 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-04')])
  await writeFile(join(root, 'v14241-real-uat04-wbs-baseline-publication.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-04',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat04_wbs_baseline_publication_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('records REAL-UAT-05 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-05')])
  await writeFile(join(root, 'v14241-real-uat05-gantt-critical-path.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-05',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat05_gantt_critical_path_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('uses passing scenario attempt summaries to close the matching tier only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-05')])
  await writeFile(join(root, 'v14241-real-env-scenario-attempts-summary.staging.full.json'), JSON.stringify({
    status: 'passed',
    tier: 'staging',
    selectedScenarioCount: 1,
    summary: {
      passedScenarioCount: 1,
      blockedScenarioCount: 0,
      commandsExecuted: 4,
      canCloseSelectedTier: true,
      statuses: { passed: 1 },
    },
    results: [
      {
        scenarioId: 'REAL-UAT-05',
        tier: 'staging',
        status: 'passed',
        commandsExecuted: 4,
        canCloseScenarioTier: true,
        output: 'evidence/staging/attempts/real-uat-05.execution.json',
      },
    ],
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const statuses = Object.fromEntries(report.scenarios[0].tiers.map((tier) => [tier.name, tier.status]))
  assert.equal(report.status, 'real_env_matrix_partially_executed_with_blockers')
  assert.equal(statuses.UAT, 'blocked_missing_real_handoff_inputs')
  assert.equal(statuses.staging, 'passed')
  assert.equal(statuses['solo-live'], 'blocked_missing_real_handoff_inputs')
  assert.equal(statuses.live, 'blocked_missing_real_handoff_inputs')
  assert.equal(report.summary.passedTierCount, 1)
  assert.equal(report.scenarios[0].tiers.find((tier) => tier.name === 'staging').attemptSummary.canCloseScenarioTier, true)
})

test('treats REAL-UAT-02 local browser invite/join replay as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-02')])
  await writeFile(join(root, 'v14241-real-uat02-local-browser-support.json'), JSON.stringify({
    status: 'support_passed',
    scenarioId: 'REAL-UAT-02',
    environment: 'local_browser_mock_api',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.supportOnlyScenarioCount, 1)
  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'local_browser_invite_join_role_support')
  assert.ok(support)
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('records REAL-UAT-02 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-02')])
  await writeFile(join(root, 'v14241-real-uat02-invite-join-role.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-02',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat02_invite_join_role_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('accepts example-domain test email as a usable staging credential key without accepting placeholders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-02')])
  const envFile = join(root, 'staging.env')
  await writeFile(envFile, [
    'API_BASE_URL=https://staging.example.test/api',
    'CLIENT_BASE_URL=https://staging.example.test',
    'SUPABASE_URL=https://supabase.example.test',
    'SUPABASE_ANON_KEY=anon-ref',
    'SUPABASE_SERVICE_ROLE_KEY=service-ref',
    'DATABASE_URL=db-ref',
    'DIRECT_DATABASE_URL=direct-db-ref',
    'TEST_USER_EMAIL=qa@example.com',
    'TEST_USER_PASSWORD=<placeholder>',
    'TEST_COMPANY_NAME=UAT Company',
    'TEST_PROJECT_NAME=UAT Project',
  ].join('\n'), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [envFile],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.envReadiness.staging.missingKeys.includes('TEST_USER_EMAIL'), false)
  assert.equal(report.envReadiness.staging.missingKeys.includes('TEST_USER_PASSWORD'), true)
})

test('includes full real-env handoff readiness separately from closeout handoff readiness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-02')])
  await writeFile(join(root, 'handoff-readiness.json'), JSON.stringify({
    status: 'pass',
    readyToRun: true,
    gateCount: 4,
    readyGateCount: 4,
  }, null, 2), 'utf8')
  await writeFile(join(root, 'v14241-real-env-handoff-readiness.json'), JSON.stringify({
    status: 'fail',
    readyToExecuteMatrix: false,
    scenarioCount: 16,
    readyScenarioCount: 0,
    tierCount: 48,
    readyTierCount: 0,
    blockedTierCount: 48,
    secretLeakCount: 0,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.handoffReadiness.status, 'pass')
  assert.equal(report.realEnvHandoffReadiness.status, 'fail')
  assert.equal(report.realEnvHandoffReadiness.readyToExecuteMatrix, false)
  assert.equal(report.realEnvHandoffReadiness.readyTierCount, 0)
})

test('treats staging connectivity preflight as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-01')])
  await writeFile(join(root, 'v14241-staging-connectivity-preflight.json'), JSON.stringify({
    status: 'pass',
    environment: 'staging',
    targetClass: 'local_runtime_with_staging_env_refs',
    canSupportScenarioIds: ['REAL-UAT-01'],
    canCloseScenarioTier: false,
    summary: {
      passedCheckCount: 4,
      requiredCheckCount: 4,
      failedCheckIds: [],
      missingCheckIds: [],
    },
    boundary: {
      localRuntimeWithStagingEnvRefsIsNotDeployedStaging: true,
      scenarioEvidenceStillRequired: true,
    },
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.stagingPreflight.status, 'pass')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.scenarios[0].supportingEvidence.some((item) => item.classification === 'staging_connectivity_preflight_passed'), true)
  assert.equal(report.scenarios[0].supportingEvidence.find((item) => item.classification === 'staging_connectivity_preflight_passed').closesRealEnvironmentTier, false)
})

test('records REAL-UAT-01 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-01')])
  await writeFile(join(root, 'v14241-real-uat01-company-create-switch.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-01',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat01_company_create_switch_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('treats REAL-UAT-09 read-only BI probe as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-09')])
  await writeFile(join(root, 'v14241-real-uat09-bi-ssot-readonly.json'), JSON.stringify({
    status: 'support_passed',
    scenarioId: 'REAL-UAT-09',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.scenarios[0].supportingEvidence.some((item) => item.classification === 'real_uat09_bi_ssot_readonly_support'), true)
  assert.equal(report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat09_bi_ssot_readonly_support').closesRealEnvironmentTier, false)
})

test('treats multi-scenario read-only probes as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-03'), scenario('REAL-UAT-11'), scenario('REAL-UAT-12'), scenario('REAL-UAT-16')])
  await writeFile(join(root, 'v14241-real-env-readonly-support-probes.json'), JSON.stringify({
    status: 'support_passed',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    scenarioResults: {
      'REAL-UAT-03': { status: 'support_passed' },
      'REAL-UAT-11': { status: 'support_passed' },
      'REAL-UAT-12': { status: 'support_passed' },
      'REAL-UAT-16': { status: 'support_passed' },
    },
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  for (const scenario of report.scenarios) {
    assert.equal(scenario.status, 'blocked_missing_real_handoff_inputs_with_supporting_evidence_only')
    assert.equal(scenario.supportingEvidence.some((item) => item.classification.startsWith('real_env_readonly_')), true)
    assert.equal(scenario.supportingEvidence.find((item) => item.classification.startsWith('real_env_readonly_')).closesRealEnvironmentTier, false)
  }
})

test('records REAL-UAT-03 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-03')])
  await writeFile(join(root, 'v14241-real-uat03-rls-role-matrix.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-03',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat03_rls_role_matrix_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('treats strict-auth local read-only probes as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-03'), scenario('REAL-UAT-12')])
  await writeFile(join(root, 'v14241-real-env-readonly-support-probes.strict-auth-local.json'), JSON.stringify({
    status: 'support_passed',
    targetClass: 'strict_auth_local_runtime_with_staging_env_refs',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
    scenarioResults: {
      'REAL-UAT-03': { status: 'support_passed' },
      'REAL-UAT-12': { status: 'support_passed' },
    },
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.supportOnlyScenarioCount, 2)
  assert.equal(report.scenarios[0].supportingEvidence.some((item) => item.classification === 'strict_local_readonly_isolation_support'), true)
  assert.equal(report.scenarios[1].supportingEvidence.some((item) => item.classification === 'strict_local_readonly_security_negative_support'), true)
  for (const scenarioResult of report.scenarios) {
    for (const support of scenarioResult.supportingEvidence) {
      assert.equal(support.closesRealEnvironmentTier, false)
    }
  }
})

test('treats REAL-UAT-06 planning read-only probe as support-only evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-06')])
  await writeFile(join(root, 'v14241-real-uat06-planning-readonly.json'), JSON.stringify({
    status: 'support_passed',
    scenarioId: 'REAL-UAT-06',
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(report.summary.supportOnlyScenarioCount, 1)
  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat06_planning_readonly_support')
  assert.ok(support)
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('records REAL-UAT-06 executable attempt without converting blocked handoff to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-06')])
  await writeFile(join(root, 'v14241-real-uat06-plan-state-machine.execution.json'), JSON.stringify({
    status: 'blocked_missing_real_handoff_inputs',
    scenarioId: 'REAL-UAT-06',
    tier: 'staging',
    commandsExecuted: 0,
    canCloseScenarioTier: false,
    closesRealEnvironmentTier: false,
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'real_uat06_plan_state_machine_execution_attempt')
  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  assert.equal(support.status, 'support_artifact_present_not_passing')
  assert.equal(support.closesRealEnvironmentTier, false)
})

test('records REAL-UAT-07 through REAL-UAT-16 executable attempts without converting blocked handoff to pass', async () => {
  const attempts = {
    'REAL-UAT-07': ['v14241-real-uat07-document-chain.execution.json', 'real_uat07_document_chain_execution_attempt'],
    'REAL-UAT-08': ['v14241-real-uat08-business-loop.execution.json', 'real_uat08_business_loop_execution_attempt'],
    'REAL-UAT-09': ['v14241-real-uat09-bi-ssot.execution.json', 'real_uat09_bi_ssot_execution_attempt'],
    'REAL-UAT-10': ['v14241-real-uat10-import-export.execution.json', 'real_uat10_import_export_execution_attempt'],
    'REAL-UAT-11': ['v14241-real-uat11-performance-pressure.execution.json', 'real_uat11_performance_pressure_execution_attempt'],
    'REAL-UAT-12': ['v14241-real-uat12-security-negative.execution.json', 'real_uat12_security_negative_execution_attempt'],
    'REAL-UAT-13': ['v14241-real-uat13-release-rollback.execution.json', 'real_uat13_release_rollback_execution_attempt'],
    'REAL-UAT-14': ['v14241-real-uat14-backup-migration.execution.json', 'real_uat14_backup_migration_execution_attempt'],
    'REAL-UAT-15': ['v14241-real-uat15-observability-incident.execution.json', 'real_uat15_observability_incident_execution_attempt'],
    'REAL-UAT-16': ['v14241-real-uat16-support-ops.execution.json', 'real_uat16_support_ops_execution_attempt'],
  }

  for (const [scenarioId, [artifactName, classification]] of Object.entries(attempts)) {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
    const matrixFile = await writeMatrix(root, [scenario(scenarioId)])
    await writeFile(join(root, artifactName), JSON.stringify({
      status: 'blocked_missing_real_handoff_inputs',
      scenarioId,
      tier: 'staging',
      commandsExecuted: 0,
      canCloseScenarioTier: false,
      closesRealEnvironmentTier: false,
    }, null, 2), 'utf8')

    const report = await buildExecutionReport({
      matrixFile,
      releaseDir: root,
      evidenceRoot: root,
      envFilePaths: [],
      now: new Date('2026-07-06T00:00:00.000Z'),
    })

    const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === classification)
    assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
    assert.equal(report.summary.passedTierCount, 0)
    assert.ok(support, `${classification} should be present`)
    assert.equal(support.status, 'support_artifact_present_not_passing')
    assert.equal(support.closesRealEnvironmentTier, false)
  }
})

test('reads nested routeEvidenceAssessment status for pressure support artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-matrix-'))
  const matrixFile = await writeMatrix(root, [scenario('REAL-UAT-11')])
  await writeFile(join(root, 'performance-pressure-evidence.json'), JSON.stringify({
    routeEvidenceAssessment: {
      status: 'pass',
      scenarios: [{ projectCount: 500, status: 'pass' }],
    },
  }, null, 2), 'utf8')

  const report = await buildExecutionReport({
    matrixFile,
    releaseDir: root,
    evidenceRoot: root,
    envFilePaths: [],
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(report.status, 'real_env_matrix_not_executed_support_only')
  assert.equal(report.summary.passedTierCount, 0)
  const support = report.scenarios[0].supportingEvidence.find((item) => item.classification === 'supporting_release_artifact_only')
  assert.ok(support)
  assert.equal(support.status, 'supporting_release_artifact_only')
  assert.equal(support.artifacts[0].status, 'pass')
  assert.equal(support.closesRealEnvironmentTier, false)
})
