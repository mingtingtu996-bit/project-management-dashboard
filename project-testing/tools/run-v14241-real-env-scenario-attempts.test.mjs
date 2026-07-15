import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { runScenarioAttempts } from './run-v14241-real-env-scenario-attempts.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-attempts-'))
  const matrix = await buildMatrix({ releaseDir: root, now: new Date('2026-07-07T00:00:00.000Z') })
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix)
  const { handoff } = await buildHandoffPack({
    matrixFile,
    releaseDir: root,
    stagingEnvFile: join(root, 'missing-staging.env'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const handoffFile = join(root, 'handoff.json')
  await writeJson(handoffFile, handoff)
  return { root, matrixFile, handoffFile }
}

test('attempts all 16 real UAT scenarios and fails closed before execution when handoff is incomplete', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const outputJson = join(root, 'attempts.json')
  const outputMd = join(root, 'attempts.md')

  const report = await runScenarioAttempts({
    tier: 'staging',
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson,
    outputMd,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')
  const markdown = await readFile(outputMd, 'utf8')

  assert.equal(report.status, 'blocked_before_execution')
  assert.equal(report.selectedScenarioCount, 16)
  assert.equal(report.summary.passedScenarioCount, 0)
  assert.equal(report.summary.blockedScenarioCount, 16)
  assert.equal(report.summary.commandsExecuted, 0)
  assert.equal(report.summary.canCloseSelectedTier, false)
  assert.deepEqual(report.summary.statuses, { blocked_missing_real_handoff_inputs: 16 })
  assert.equal(report.results.every((item) => item.canCloseScenarioTier === false), true)
  assert.match(markdown, /Can close selected tier: no/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('can scope the scenario attempt runner to an explicit scenario subset', async () => {
  const { root, matrixFile, handoffFile } = await fixture()

  const report = await runScenarioAttempts({
    tier: 'staging',
    scenarioIds: ['REAL-UAT-07', 'REAL-UAT-16'],
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson: join(root, 'attempts.json'),
    outputMd: join(root, 'attempts.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_before_execution')
  assert.equal(report.selectedScenarioCount, 2)
  assert.deepEqual(report.results.map((item) => item.scenarioId), ['REAL-UAT-07', 'REAL-UAT-16'])
  assert.equal(report.summary.commandsExecuted, 0)
  assert.equal(report.summary.canCloseSelectedTier, false)
  assert.equal(report.results.every((item) => item.output.includes('v14241-real-env-evidence/staging/attempts/')), true)
})

test('uses the controlled staging env file for REAL-UAT-01 audit readback defaults', async () => {
  const { root, matrixFile, handoffFile } = await fixture()

  await runScenarioAttempts({
    tier: 'staging',
    scenarioIds: ['REAL-UAT-01'],
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson: join(root, 'attempts.json'),
    outputMd: join(root, 'attempts.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  const attempt = JSON.parse(await readFile(
    join(root, 'v14241-real-env-evidence', 'staging', 'attempts', 'real-uat-01.execution.json'),
    'utf8',
  ))

  assert.equal(attempt.auditReadbackSource.explicit, true)
  assert.match(attempt.auditReadbackSource.envFile, /deploy\/env\/staging\.env$/)
})

test('writes tier-specific scenario attempt files so UAT staging solo-live and live evidence cannot overwrite each other', async () => {
  const { root, matrixFile, handoffFile } = await fixture()

  const uat = await runScenarioAttempts({
    tier: 'UAT',
    scenarioIds: ['REAL-UAT-07'],
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson: join(root, 'uat-attempts.json'),
    outputMd: join(root, 'uat-attempts.md'),
    flags: {
      '--include-uat': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const staging = await runScenarioAttempts({
    tier: 'staging',
    scenarioIds: ['REAL-UAT-07'],
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson: join(root, 'staging-attempts.json'),
    outputMd: join(root, 'staging-attempts.md'),
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const soloLive = await runScenarioAttempts({
    tier: 'solo-live',
    scenarioIds: ['REAL-UAT-07'],
    releaseDir: root,
    handoffFile,
    matrixFile,
    outputJson: join(root, 'solo-live-attempts.json'),
    outputMd: join(root, 'solo-live-attempts.md'),
    flags: {
      '--include-solo-live': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.notEqual(uat.results[0].output, staging.results[0].output)
  assert.notEqual(staging.results[0].output, soloLive.results[0].output)
  assert.match(uat.results[0].output, /v14241-real-env-evidence\/uat\/attempts\/real-uat-07\.execution\.json/)
  assert.match(staging.results[0].output, /v14241-real-env-evidence\/staging\/attempts\/real-uat-07\.execution\.json/)
  assert.match(soloLive.results[0].output, /v14241-real-env-evidence\/solo-live\/attempts\/real-uat-07\.execution\.json/)
  assert.equal(existsSync(join(root, 'v14241-real-env-evidence', 'uat', 'attempts', 'real-uat-07.execution.json')), true)
  assert.equal(existsSync(join(root, 'v14241-real-env-evidence', 'staging', 'attempts', 'real-uat-07.execution.json')), true)
  assert.equal(existsSync(join(root, 'v14241-real-env-evidence', 'solo-live', 'attempts', 'real-uat-07.execution.json')), true)
})
