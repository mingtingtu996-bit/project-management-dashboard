import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { summarizeRealEnvAttempts } from './summarize-v14241-real-env-attempts.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function attemptSummary({ tier, status, resultStatus, outputPrefix }) {
  return {
    schemaVersion: 'workbuddy/v14241-real-env-scenario-attempts-summary/v1',
    generatedAt: '2026-07-07T00:00:00.000Z',
    status: 'blocked_before_execution',
    tier,
    selectedScenarioCount: 2,
    summary: {
      passedScenarioCount: 0,
      blockedScenarioCount: 2,
      commandsExecuted: 0,
      canCloseSelectedTier: false,
      statuses: { [status]: 2 },
    },
    results: [
      {
        scenarioId: 'REAL-UAT-01',
        tier,
        status: resultStatus ?? status,
        commandsExecuted: 0,
        canCloseScenarioTier: false,
        closesRealEnvironmentTier: false,
        output: `${outputPrefix}/real-uat-01.execution.json`,
      },
      {
        scenarioId: 'REAL-UAT-02',
        tier,
        status: resultStatus ?? status,
        commandsExecuted: 0,
        canCloseScenarioTier: false,
        closesRealEnvironmentTier: false,
        output: `${outputPrefix}/real-uat-02.execution.json`,
      },
    ],
  }
}

test('summarizes blocked UAT staging solo-live and live attempts without converting them to pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-attempts-state-'))
  await writeJson(join(root, 'v14241-real-env-scenario-attempts-summary.uat.json'), attemptSummary({
    tier: 'UAT',
    status: 'blocked_missing_real_handoff_inputs',
    outputPrefix: 'project-testing/reports/release/v14241-real-env-evidence/uat/attempts',
  }))
  await writeJson(join(root, 'v14241-real-env-scenario-attempts-summary.staging.full.json'), attemptSummary({
    tier: 'staging',
    status: 'blocked_unresolvable_execution_refs',
    outputPrefix: 'project-testing/reports/release/v14241-real-env-evidence/staging/attempts',
  }))
  await writeJson(join(root, 'v14241-real-env-scenario-attempts-summary.solo-live.json'), attemptSummary({
    tier: 'solo-live',
    status: 'blocked_missing_real_handoff_inputs',
    outputPrefix: 'project-testing/reports/release/v14241-real-env-evidence/solo-live/attempts',
  }))
  await writeJson(join(root, 'v14241-real-env-scenario-attempts-summary.live.json'), attemptSummary({
    tier: 'live',
    status: 'blocked_missing_real_handoff_inputs',
    outputPrefix: 'project-testing/reports/release/v14241-real-env-evidence/live/attempts',
  }))
  await writeJson(join(root, 'v14241-real-env-staging-operator-refs-readiness.json'), {
    status: 'operator_refs_missing',
    requiredKeyCount: 67,
    filledKeyCount: 0,
    missingKeyCount: 67,
    placeholderKeyCount: 67,
    secretLeakCount: 0,
    executionBoundary: { mayAttemptStagingScenarioResolution: false },
  })
  await writeJson(join(root, 'v14241-staging-connectivity-preflight.json'), {
    status: 'pass',
    targetClass: 'local_runtime_with_staging_env_refs',
    canCloseScenarioTier: false,
  })
  await writeJson(join(root, 'v14241-real-env-target-discovery.json'), {
    status: 'real_environment_targets_not_discoverable_from_repo',
    targets: {
      localRuntimeWithStagingDataSource: { available: true },
      deployedStaging: { available: false },
      liveProduction: { available: false },
    },
    blockers: [
      'staging_env_points_to_localhost_not_deployed_staging',
      'deployed_staging_url_not_discoverable',
      'live_production_url_not_discoverable',
    ],
  })

  const report = await summarizeRealEnvAttempts({
    releaseDir: root,
    outputJson: join(root, 'current-state.json'),
    outputMd: join(root, 'current-state.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(join(root, 'current-state.json'), 'utf8')

  assert.equal(report.status, 'real_env_matrix_blocked_before_execution')
  assert.equal(report.summary.closedTierCount, 0)
  assert.equal(report.summary.selectedScenarioCount, 8)
  assert.equal(report.summary.blockedScenarioCount, 8)
  assert.equal(report.summary.commandsExecuted, 0)
  assert.equal(report.summary.outputCollisionCount, 0)
  assert.deepEqual(report.blockers, [
    'UAT:blocked_missing_real_handoff_inputs',
    'staging:operator_refs_missing:67',
    'solo-live:blocked_missing_real_handoff_inputs',
    'live:blocked_missing_real_handoff_inputs',
    'target:staging_env_points_to_localhost_not_deployed_staging',
    'target:deployed_staging_url_not_discoverable',
    'target:live_production_url_not_discoverable',
  ])
  assert.equal(report.stagingOperatorRefs.mayAttemptStagingScenarioResolution, false)
  assert.equal(report.stagingTargetBoundary.canCloseScenarioTier, false)
  assert.equal(report.targetDiscovery.deployedStaging, false)
  assert.equal(report.targetDiscovery.liveProduction, false)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('detects duplicate per-scenario output paths as evidence collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-attempt-collision-'))
  const collision = attemptSummary({
    tier: 'staging',
    status: 'blocked_unresolvable_execution_refs',
    outputPrefix: 'project-testing/reports/release/v14241-real-env-evidence/staging/attempts',
  })
  collision.results[1].output = collision.results[0].output
  await writeJson(join(root, 'v14241-real-env-scenario-attempts-summary.staging.full.json'), collision)

  const report = await summarizeRealEnvAttempts({
    releaseDir: root,
    outputJson: join(root, 'current-state.json'),
    outputMd: join(root, 'current-state.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.summary.outputCollisionCount, 1)
  assert.equal(report.tiers.find((tier) => tier.tier === 'staging').outputCollisionCount, 1)
})
