import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { checkOperatorHandoff } from './check-v14241-real-env-handoff-file.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-check-'))
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

test('checks an operator handoff file without mutating environment or claiming readiness', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const outputJson = join(root, 'readiness.json')
  const outputMd = join(root, 'readiness.md')

  const report = await checkOperatorHandoff({
    handoffFile,
    matrixFile,
    outputJson,
    outputMd,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')

  assert.equal(report.status, 'fail')
  assert.equal(report.readyToExecuteMatrix, false)
  assert.equal(report.readyTierCount, 0)
  assert.equal(report.tierCount, 48)
  assert.equal(report.executionBoundary.readOnly, true)
  assert.equal(report.executionBoundary.commandsExecuted, 0)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('reports failure when operator handoff contains inline secret-like values without echoing them', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const handoff = JSON.parse(await readFile(handoffFile, 'utf8'))
  handoff.environmentTargets.staging.authToken = 'eyJabc.def.ghi'
  await writeJson(handoffFile, handoff)

  const outputJson = join(root, 'readiness.json')
  const report = await checkOperatorHandoff({
    handoffFile,
    matrixFile,
    outputJson,
    outputMd: join(root, 'readiness.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')

  assert.equal(report.status, 'fail')
  assert.equal(report.readyToExecuteMatrix, false)
  assert.equal(report.secretLeakCount > 0, true)
  assert.doesNotMatch(written, /eyJabc\.def\.ghi/)
})
