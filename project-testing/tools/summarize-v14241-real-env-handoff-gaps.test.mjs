import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack } from './build-v14241-real-env-handoff-pack.mjs'
import { buildMatrix } from './build-v14241-real-env-uat-matrix.mjs'
import { summarizeHandoffGaps } from './summarize-v14241-real-env-handoff-gaps.mjs'

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-handoff-gaps-'))
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
  return { root, matrix, matrixFile, handoff, handoffFile }
}

test('summarizes the minimum remaining staging handoff gaps without executing the matrix', async () => {
  const { root, matrixFile, handoffFile } = await fixture()
  const outputJson = join(root, 'handoff-gap-summary.staging.json')
  const outputMd = join(root, 'handoff-gap-summary.staging.md')

  const { report } = await summarizeHandoffGaps({
    handoffFile,
    matrixFile,
    releaseDir: root,
    selectedTiers: ['staging'],
    outputJson,
    outputMd,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(outputJson, 'utf8')
  const markdown = await readFile(outputMd, 'utf8')

  assert.equal(report.status, 'handoff_inputs_required')
  assert.deepEqual(report.selectedTiers, ['staging'])
  assert.equal(report.readiness.selectedReadyTierCount, 0)
  assert.equal(report.readiness.selectedTierCount, 16)
  assert.equal(report.environmentTargets[0].missingFields.includes('writeApprovalRef'), true)
  assert.equal(report.tiers.find((item) => item.id === 'REAL-UAT-07').missingScenarioFields.includes('targetRefs.documentPackageRef'), true)
  assert.equal(report.executionBoundary.commandsExecuted, 0)
  assert.match(markdown, /Scenario Tier Checklist/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('reports partial staging readiness without converting it into a tier pass', async () => {
  const { root, matrix, matrixFile, handoff, handoffFile } = await fixture()
  handoff.environmentTargets.staging = {
    apiBaseUrlRef: 'env://deploy/env/staging.env#API_BASE_URL',
    clientBaseUrlRef: 'env://deploy/env/staging.env#CLIENT_BASE_URL',
    deploymentVersionRef: 'release-ref://v1.4.24-test',
    artifactRoot: `${root}/staging-evidence`,
    writeApprovalRef: 'approval-ref://staging-write',
    cleanupOwner: 'owner://cleanup',
    retentionOwner: 'owner://retention',
    roleAccountRefs: {
      company_admin: 'secret-ref://staging/company-admin',
      project_admin: 'secret-ref://staging/project-admin',
      editor: 'secret-ref://staging/editor',
      outsider: 'secret-ref://staging/outsider',
    },
    anonPolicyRef: 'policy-ref://staging/anon',
  }
  const scenario = matrix.scenarios.find((item) => item.id === 'REAL-UAT-01')
  const tier = handoff.scenarios['REAL-UAT-01'].tiers.staging
  Object.assign(tier.targetRefs, {
    companyIdRef: 'target-ref://company',
    projectIdRef: 'target-ref://project',
    disposableCompanyRef: 'target-ref://disposable-company',
  })
  Object.assign(tier.actorRefs, {
    primaryTesterRef: 'actor-ref://primary-tester',
  })
  tier.cleanupRef = 'cleanup-ref://real-uat-01'
  tier.expectedEvidenceRefs.auditRef = 'evidence-ref://audit'
  for (const owner of scenario.evidenceOwners) {
    handoff.scenarios['REAL-UAT-01'].evidenceOwners[owner] = `owner-ref://${owner}`
  }
  await writeJson(handoffFile, handoff)

  const { report } = await summarizeHandoffGaps({
    handoffFile,
    matrixFile,
    releaseDir: root,
    selectedTiers: ['staging'],
    outputJson: join(root, 'handoff-gap-summary.staging.json'),
    outputMd: join(root, 'handoff-gap-summary.staging.md'),
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'handoff_inputs_required')
  assert.equal(report.readiness.selectedReadyTierCount, 1)
  assert.equal(report.readiness.selectedTierCount, 16)
  assert.equal(report.tiers.find((item) => item.id === 'REAL-UAT-01').readyToRun, true)
  assert.equal(report.tiers.find((item) => item.id === 'REAL-UAT-02').readyToRun, false)
  assert.match(report.nextCommands.attemptSelectedTier, /run-v14241-real-env-scenario-attempts/)
})
