import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runUat01CompanyCreateSwitch } from './run-v14241-real-uat01-company-create-switch.mjs'

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function matrix() {
  return {
    schemaVersion: 'test',
    scenarios: [
      {
        id: 'REAL-UAT-01',
        title: '登录/会话/创建公司后自动切换',
        priority: 'P0',
        evidenceOwners: ['frontend-owner', 'auth-owner', 'uat-tester', 'cleanup-owner'],
        tiers: [
          { name: 'UAT' },
          { name: 'staging' },
          { name: 'live' },
        ],
        evidenceContract: {
          requiredArtifacts: [
            'real-uat-01-company-create-switch.json',
            'screenshots/company-create-switch/*.png',
            'audit-company-create-switch.json',
          ],
        },
      },
    ],
  }
}

function incompleteHandoff(root) {
  return {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    releaseDir: root,
    environmentTargets: {
      UAT: {},
      staging: {
        apiBaseUrlRef: 'env://deploy/env/staging.env#API_BASE_URL',
        clientBaseUrlRef: 'env://deploy/env/staging.env#CLIENT_BASE_URL',
        artifactRoot: `${root}/evidence/staging`,
        credentialRefs: {},
        roleAccountRefs: {},
      },
      live: {},
    },
    scenarios: {
      'REAL-UAT-01': {
        id: 'REAL-UAT-01',
        evidenceOwners: {
          'frontend-owner': '',
          'auth-owner': '',
          'uat-tester': '',
          'cleanup-owner': '',
        },
        tiers: {
          staging: {
            targetRefs: {},
            actorRefs: {},
            expectedEvidenceRefs: {},
            cleanupRef: '',
          },
        },
      },
    },
  }
}

function readyHandoff(root, ref = 'secret-ref://operator/value') {
  return {
    schemaVersion: 'workbuddy/v14241-real-env-handoff/v1',
    releaseDir: root,
    environmentTargets: {
      UAT: {},
      staging: {
        apiBaseUrlRef: ref,
        clientBaseUrlRef: ref,
        deploymentVersionRef: 'deploy://staging/v1',
        artifactRoot: `${root}/evidence/staging`,
        writeApprovalRef: 'approval://staging/uat01',
        cleanupOwner: 'cleanup-owner',
        retentionOwner: 'retention-owner',
        roleAccountRefs: {
          company_admin: ref,
          project_admin: 'role://project-admin',
          editor: 'role://editor',
          outsider: 'role://outsider',
        },
        anonPolicyRef: 'policy://anon',
        credentialRefs: {
          testUserEmailRef: ref,
          testUserPasswordRef: ref,
        },
      },
      live: {},
    },
    scenarios: {
      'REAL-UAT-01': {
        id: 'REAL-UAT-01',
        evidenceOwners: {
          'frontend-owner': 'owner://frontend',
          'auth-owner': 'owner://auth',
          'uat-tester': 'owner://tester',
          'cleanup-owner': 'owner://cleanup',
        },
        tiers: {
          staging: {
            targetRefs: {
              companyIdRef: 'target://company',
              projectIdRef: 'target://project',
              disposableCompanyRef: 'target://disposable-company',
            },
            actorRefs: {
              primaryTesterRef: 'actor://primary',
            },
            expectedEvidenceRefs: {
              auditRef: 'audit://workspace/company-create',
            },
            cleanupRef: 'cleanup://uat01',
            approvalRef: 'approval://staging/uat01',
            rollbackRef: 'rollback://staging/uat01',
            monitoringRef: 'monitor://staging/uat01',
          },
        },
      },
    },
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat01-'))
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix())
  return { root, matrixFile }
}

test('blocks REAL-UAT-01 execution when the selected tier handoff is incomplete', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, incompleteHandoff(root))

  const report = await runUat01CompanyCreateSwitch({
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(output, 'utf8')

  assert.equal(report.status, 'blocked_missing_real_handoff_inputs')
  assert.equal(report.commandsExecuted, 0)
  assert.equal(report.canCloseScenarioTier, false)
  assert.ok(report.blockers.some((blocker) => blocker.startsWith('scenario:targetRefs.companyIdRef')))
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks REAL-UAT-01 execution when handoff is ready but explicit write unlock flags are missing', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat01CompanyCreateSwitch({
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
    now: new Date('2026-07-07T00:00:00.000Z'),
  })

  assert.equal(report.status, 'blocked_missing_execution_unlock')
  assert.equal(report.commandsExecuted, 0)
  assert.deepEqual(report.blockers, [
    'missing --include-staging',
    'missing --confirm-real-handoff',
    'missing --allow-write',
  ])
})

test('blocks REAL-UAT-01 execution when ready handoff refs are not locally resolvable env refs', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  const auditEnvFile = join(root, 'staging-diagnostics.env')
  await writeJson(handoffFile, readyHandoff(root))
  await writeFile(auditEnvFile, [
    'SUPABASE_URL=https://example.supabase.co',
    'SUPABASE_SERVICE_KEY=service-secret-must-not-leak',
    '',
  ].join('\n'), 'utf8')

  const report = await runUat01CompanyCreateSwitch({
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
    auditEnvFile,
    flags: {
      '--include-staging': true,
      '--confirm-real-handoff': true,
      '--allow-write': true,
    },
    now: new Date('2026-07-07T00:00:00.000Z'),
  })
  const written = await readFile(output, 'utf8')

  assert.equal(report.status, 'blocked_unresolvable_execution_refs')
  assert.equal(report.commandsExecuted, 0)
  assert.ok(report.blockers.includes('apiBase:unsupported_ref'))
  assert.equal(report.resolvedRefs.password.valueWrittenToReport, false)
  assert.equal(report.auditReadbackSource.explicit, true)
  assert.match(report.auditReadbackSource.envFile, /staging-diagnostics\.env$/)
  assert.match(written, /secret-ref:\/\/operator\/value/)
  assert.doesNotMatch(written, /service-secret-must-not-leak/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})
