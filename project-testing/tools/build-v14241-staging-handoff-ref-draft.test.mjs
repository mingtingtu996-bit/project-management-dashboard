import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { runScenarioAttempts } from './run-v14241-real-env-scenario-attempts.mjs'
import { buildStagingHandoffRefDraft } from './build-v14241-staging-handoff-ref-draft.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-staging-ref-draft-'))
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

test('builds a staging-only ref draft without claiming full matrix readiness', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const result = await buildStagingHandoffRefDraft({
    handoffFile,
    matrixFile,
    draftOutput: join(root, 'staging-ref-draft.json'),
    refsEnvTemplate: join(root, 'staging-operator.refs.env.template'),
    reportJson: join(root, 'draft-package.json'),
    reportMd: join(root, 'draft-package.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const reportText = await readFile(result.reportJson, 'utf8')
  const envTemplate = await readFile(result.refsEnvTemplate, 'utf8')
  const draft = JSON.parse(await readFile(result.draftOutput, 'utf8'))

  assert.equal(result.report.before.selectedReadyTierCount, 0)
  assert.equal(result.report.afterDraft.selectedReadyTierCount, 16)
  assert.equal(result.report.afterDraft.selectedTierCount, 16)
  assert.equal(result.report.afterDraft.fullMatrixReadyToExecute, false)
  assert.equal(result.report.afterDraft.fullMatrixReadyTierCount, 16)
  assert.equal(draft.status, 'staging_ref_draft_operator_values_required')
  assert.match(draft.environmentTargets.staging.apiBaseUrlRef, /staging-operator\.refs\.env\.template#V14241_STAGING_API_BASE_URL/)
  assert.match(envTemplate, /V14241_STAGING_REAL_UAT_07_TARGET_REFS_DOCUMENT_PACKAGE_REF=/)
  assert.doesNotMatch(reportText, /password=|postgres:\/\//i)
  assert.doesNotMatch(envTemplate, /password=|postgres:\/\//i)
})

test('staging ref draft advances past missing handoff and blocks at unresolved operator refs', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const result = await buildStagingHandoffRefDraft({
    handoffFile,
    matrixFile,
    draftOutput: join(root, 'staging-ref-draft.json'),
    refsEnvTemplate: join(root, 'staging-operator.refs.env.template'),
    reportJson: join(root, 'draft-package.json'),
    reportMd: join(root, 'draft-package.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  const attempts = await runScenarioAttempts({
    tier: 'staging',
    scenarioIds: ['REAL-UAT-01', 'REAL-UAT-07'],
    releaseDir: root,
    handoffFile: result.draftOutput,
    matrixFile,
    outputJson: join(root, 'attempts.json'),
    outputMd: join(root, 'attempts.md'),
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(attempts.status, 'blocked_before_execution')
  assert.equal(attempts.summary.statuses.blocked_unresolvable_execution_refs, 2)
  assert.equal(attempts.summary.commandsExecuted, 0)
  assert.equal(attempts.summary.canCloseSelectedTier, false)
})
