import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { buildStagingHandoffRefDraft } from './build-v14241-staging-handoff-ref-draft.mjs'
import { checkStagingOperatorRefsEnv, parseEnvText } from './check-v14241-staging-operator-refs-env.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-operator-refs-'))
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
  const draft = await buildStagingHandoffRefDraft({
    handoffFile,
    matrixFile,
    draftOutput: join(root, 'staging-ref-draft.json'),
    refsEnvTemplate: join(root, 'staging-operator.refs.env.template'),
    reportJson: join(root, 'draft-package.json'),
    reportMd: join(root, 'draft-package.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  return { root, draftPackage: draft.reportJson, refsEnvFile: draft.refsEnvTemplate }
}

function filledEnvText(report, valueForKey = () => 'operator-ref://filled') {
  return report.keyResults
    .map((item) => `${item.key}=${valueForKey(item.key)}`)
    .join('\n')
}

test('parses env text without treating password-ref key names as secret values', () => {
  const parsed = parseEnvText([
    '# comment',
    'export V14241_STAGING_TEST_USER_PASSWORD_REF=secret-ref://staging/test-user',
    'V14241_STAGING_COMPANY_ID="company-1"',
  ].join('\n'))

  assert.equal(parsed.values.V14241_STAGING_TEST_USER_PASSWORD_REF, 'secret-ref://staging/test-user')
  assert.equal(parsed.values.V14241_STAGING_COMPANY_ID, 'company-1')
  assert.deepEqual(parsed.duplicateKeys, [])
})

test('empty staging refs template remains blocked and writes no operator values', async () => {
  const { root, draftPackage, refsEnvFile } = await fixture()
  const report = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson: join(root, 'refs-readiness.json'),
    outputMd: join(root, 'refs-readiness.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(join(root, 'refs-readiness.json'), 'utf8')
  const markdown = await readFile(join(root, 'refs-readiness.md'), 'utf8')

  assert.equal(report.status, 'operator_refs_missing')
  assert.equal(report.requiredKeyCount, 67)
  assert.equal(report.filledKeyCount, 0)
  assert.equal(report.missingKeyCount, 67)
  assert.equal(report.secretLeakCount, 0)
  assert.equal(report.executionBoundary.commandsExecuted, 0)
  assert.equal(report.executionBoundary.mayAttemptStagingScenarioResolution, false)
  assert.match(markdown, /May attempt staging scenario resolution: no/)
  assert.doesNotMatch(written, /secret-ref:\/\/staging\/test-user/)
})

test('filled non-secret refs can advance to staging resolution attempt precondition', async () => {
  const { root, draftPackage, refsEnvFile } = await fixture()
  const initial = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson: join(root, 'initial.json'),
    outputMd: join(root, 'initial.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  await writeFile(refsEnvFile, `${filledEnvText(initial, (key) => (
    key.endsWith('_PASSWORD_REF') ? 'secret-ref://staging/test-user-password' : 'operator-ref://filled'
  ))}\n`, 'utf8')

  const report = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson: join(root, 'refs-readiness.json'),
    outputMd: join(root, 'refs-readiness.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'operator_refs_ready_for_staging_resolution')
  assert.equal(report.filledKeyCount, report.requiredKeyCount)
  assert.equal(report.missingKeyCount, 0)
  assert.equal(report.placeholderKeyCount, 0)
  assert.equal(report.secretLeakCount, 0)
  assert.equal(report.executionBoundary.mayAttemptStagingScenarioResolution, true)
})

test('secret-like values are blocked without echoing the value', async () => {
  const { root, draftPackage, refsEnvFile } = await fixture()
  const initial = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson: join(root, 'initial.json'),
    outputMd: join(root, 'initial.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  await writeFile(refsEnvFile, `${filledEnvText(initial, (key) => (
    key === 'V14241_STAGING_COMPANY_ID' ? 'password=plain-text' : 'operator-ref://filled'
  ))}\n`, 'utf8')

  const report = await checkStagingOperatorRefsEnv({
    draftPackage,
    refsEnvFile,
    outputJson: join(root, 'refs-readiness.json'),
    outputMd: join(root, 'refs-readiness.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(join(root, 'refs-readiness.json'), 'utf8')

  assert.equal(report.status, 'operator_refs_secret_leak_detected')
  assert.equal(report.secretLeakCount, 1)
  assert.deepEqual(report.secretLeaks, [{ key: 'V14241_STAGING_COMPANY_ID', reasons: ['password_assignment_like_value'] }])
  assert.doesNotMatch(written, /plain-text/)
})
