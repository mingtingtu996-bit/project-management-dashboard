import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { buildHandoffPack, evaluateHandoffReadiness } from './build-v14241-real-env-handoff-pack.mjs'

function oneScenarioMatrix() {
  return {
    schemaVersion: 'test',
    scenarios: [
      {
        id: 'REAL-UAT-01',
        title: 'Company create switch',
        priority: 'P0',
        evidenceOwners: ['frontend-owner', 'auth-owner'],
        tiers: [
          { name: 'UAT' },
          { name: 'staging' },
          { name: 'solo-live' },
          { name: 'live' },
        ],
        evidenceContract: {
          requiredArtifacts: [
            'real-uat-01-company-create-switch.json',
            'audit-company-create-switch.json',
          ],
        },
      },
    ],
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

test('builds a candidate handoff pack that is blocked until scenario refs and owners are filled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-handoff-'))
  const matrixFile = join(root, 'matrix.json')
  const envFile = join(root, 'staging.env')
  await writeJson(matrixFile, oneScenarioMatrix())
  await writeFile(envFile, [
    'API_BASE_URL=https://staging.example.test/api',
    'CLIENT_BASE_URL=https://staging.example.test',
    'TEST_USER_EMAIL=qa@example.com',
    'TEST_USER_PASSWORD=secret-ref-value',
  ].join('\n'), 'utf8')

  const { handoff, readiness } = await buildHandoffPack({
    matrixFile,
    releaseDir: root,
    stagingEnvFile: envFile,
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(handoff.schemaVersion, 'workbuddy/v14241-real-env-handoff/v1')
  assert.equal(handoff.executionBoundary.commandsExecuted, 0)
  assert.match(handoff.environmentTargets.staging.apiBaseUrlRef, /API_BASE_URL$/)
  assert.match(handoff.environmentTargets.staging.clientBaseUrlRef, /CLIENT_BASE_URL$/)
  assert.match(handoff.environmentTargets.staging.credentialRefs.testUserEmailRef, /TEST_USER_EMAIL$/)
  assert.equal(readiness.status, 'fail')
  assert.equal(readiness.readyToExecuteMatrix, false)
  assert.equal(readiness.readyScenarioCount, 0)
  assert.equal(readiness.secretLeakCount, 0)
  assert.equal(readiness.scenarios[0].tiers.length, 4)
})

test('passes readiness only when every tier has environment, scenario, owner, and control refs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-handoff-'))
  const matrix = oneScenarioMatrix()
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix)
  const { handoff } = await buildHandoffPack({
    matrixFile,
    releaseDir: root,
    stagingEnvFile: join(root, 'missing.env'),
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  handoff.environmentTargets.UAT = {
    baseUrlRef: 'url://uat',
    deploymentVersionRef: 'deploy://uat/v1',
    artifactRoot: 'artifact://uat',
    recordingOwner: 'owner://qa',
    retentionOwner: 'owner://records',
    roleAccountRefs: {
      owner: 'acct://owner',
      company_admin: 'acct://company-admin',
      project_admin: 'acct://project-admin',
      editor: 'acct://editor',
      outsider: 'acct://outsider',
    },
    anonPolicyRef: 'policy://anon',
  }
  handoff.environmentTargets.staging = {
    apiBaseUrlRef: 'url://staging-api',
    clientBaseUrlRef: 'url://staging-client',
    deploymentVersionRef: 'deploy://staging/v1',
    artifactRoot: 'artifact://staging',
    writeApprovalRef: 'approval://staging',
    cleanupOwner: 'owner://cleanup',
    retentionOwner: 'owner://records',
    roleAccountRefs: {
      company_admin: 'acct://company-admin',
      project_admin: 'acct://project-admin',
      editor: 'acct://editor',
      outsider: 'acct://outsider',
    },
    anonPolicyRef: 'policy://anon',
  }
  handoff.environmentTargets.live = {
    baseUrlRef: 'url://live',
    deploymentVersionRef: 'deploy://live/v1',
    liveHandoffDeclarationRef: 'handoff://live',
    approvalRef: 'approval://live',
    rollbackOwner: 'owner://rollback',
    monitoringOwner: 'owner://monitoring',
    retentionPath: 'records://live',
    artifactRoot: 'artifact://live',
  }
  handoff.environmentTargets['solo-live'] = {
    baseUrlRef: 'url://solo-live',
    deploymentVersionRef: 'deploy://solo-live/v1',
    selfApprovalRef: 'approval://solo-live-self',
    rollbackOwner: 'owner://solo-live-rollback',
    monitoringOwner: 'owner://solo-live-monitoring',
    rollbackPlanRef: 'rollback://solo-live',
    monitoringPlanRef: 'monitoring://solo-live',
    artifactRoot: 'artifact://solo-live',
  }
  handoff.scenarios['REAL-UAT-01'].evidenceOwners = {
    'frontend-owner': 'owner://frontend',
    'auth-owner': 'owner://auth',
  }
  for (const tierName of ['UAT', 'staging', 'solo-live', 'live']) {
    const tier = handoff.scenarios['REAL-UAT-01'].tiers[tierName]
    tier.targetRefs.companyIdRef = `company://${tierName}`
    tier.targetRefs.projectIdRef = `project://${tierName}`
    tier.targetRefs.disposableCompanyRef = `company-disposable://${tierName}`
    tier.actorRefs.primaryTesterRef = `tester://${tierName}`
    tier.expectedEvidenceRefs.auditRef = `audit://${tierName}`
    tier.cleanupRef = `cleanup://${tierName}`
    tier.approvalRef = `approval://${tierName}`
    tier.rollbackRef = `rollback://${tierName}`
    tier.monitoringRef = `monitoring://${tierName}`
  }

  const readiness = evaluateHandoffReadiness({
    handoff,
    matrix,
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(readiness.status, 'pass')
  assert.equal(readiness.readyToExecuteMatrix, true)
  assert.equal(readiness.readyScenarioCount, 1)
  assert.equal(readiness.readyTierCount, 4)
})

test('fails readiness when inline secret-like values are placed in the handoff', async () => {
  const matrix = oneScenarioMatrix()
  const handoff = {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    environmentTargets: {
      UAT: {},
      staging: { authToken: 'eyJabc.def.ghi' },
      live: {},
    },
    scenarios: {
      'REAL-UAT-01': {
        evidenceOwners: {},
        tiers: {
          UAT: {},
          staging: {},
          live: {},
        },
      },
    },
  }

  const readiness = evaluateHandoffReadiness({
    handoff,
    matrix,
    now: new Date('2026-07-06T00:00:00.000Z'),
  })

  assert.equal(readiness.status, 'fail')
  assert.equal(readiness.secretLeakCount > 0, true)
})
