import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { buildHandoffFillPackage } from './build-v14241-real-env-handoff-fill-package.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-fill-'))
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

test('builds a v14241 handoff fill package from the current readiness gaps', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const outputJson = join(root, 'fill-package.json')
  const outputMd = join(root, 'fill-package.md')
  const templateOutput = join(root, 'operator-template.json')

  const report = await buildHandoffFillPackage({
    handoffFile,
    matrixFile,
    outputJson,
    outputMd,
    templateOutput,
    releaseDir: root,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')
  const markdown = await readFile(outputMd, 'utf8')
  const template = JSON.parse(await readFile(templateOutput, 'utf8'))

  assert.equal(report.status, 'handoff_inputs_required')
  assert.equal(report.readiness.readyToExecuteMatrix, false)
  assert.equal(report.readiness.readyTierCount, 0)
  assert.equal(report.readiness.tierCount, 64)
  assert.equal(report.environmentTargets.find((item) => item.tier === 'staging').missingFields.includes('writeApprovalRef'), true)
  assert.equal(report.scenarios.length, 16)
  assert.equal(report.scenarios.find((item) => item.id === 'REAL-UAT-07').tiers.find((tier) => tier.tier === 'staging').missingScenarioFields.includes('targetRefs.documentPackageRef'), true)
  assert.equal(template.status, 'operator_fill_required')
  assert.match(markdown, /Environment Targets To Fill/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('keeps operator template as refs-only guidance and does not authorize execution', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const report = await buildHandoffFillPackage({
    handoffFile,
    matrixFile,
    outputJson: join(root, 'fill-package.json'),
    outputMd: join(root, 'fill-package.md'),
    templateOutput: join(root, 'operator-template.json'),
    releaseDir: root,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.executionBoundary.packageOnly, true)
  assert.equal(report.executionBoundary.commandsExecuted, 0)
  assert.equal(report.executionBoundary.doesNotAuthorizeExecution, true)
  assert.equal(report.secretPolicy.rawSecretsForbidden, true)
  assert.match(report.nextCommands.checkFilledTemplate, /check-v14241-real-env-handoff-file/)
})
