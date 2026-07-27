import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runUat04WbsBaselinePublication } from './run-v14241-real-uat04-wbs-baseline-publication.mjs'

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function matrix() {
  return {
    schemaVersion: 'test',
    scenarios: [
      {
        id: 'REAL-UAT-04',
        title: '项目创建 -> WBS -> 候选基线 -> 发布/回滚',
        priority: 'P0',
        evidenceOwners: ['planning-owner', 'runtime-publication-owner', 'rollback-owner'],
        tiers: [
          { name: 'UAT' },
          { name: 'staging' },
          { name: 'live' },
        ],
        evidenceContract: {
          requiredArtifacts: [
            'real-uat-04-wbs-baseline-publication.json',
            'runtime-publication-readback.json',
            'rollback-verification.json',
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
      'REAL-UAT-04': {
        id: 'REAL-UAT-04',
        evidenceOwners: {
          'planning-owner': '',
          'runtime-publication-owner': '',
          'rollback-owner': '',
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
        writeApprovalRef: 'approval://staging/uat04',
        cleanupOwner: 'cleanup-owner',
        retentionOwner: 'retention-owner',
        roleAccountRefs: {
          company_admin: ref,
          project_admin: ref,
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
      'REAL-UAT-04': {
        id: 'REAL-UAT-04',
        evidenceOwners: {
          'planning-owner': 'owner://planning',
          'runtime-publication-owner': 'owner://runtime',
          'rollback-owner': 'owner://rollback',
        },
        tiers: {
          staging: {
            targetRefs: {
              companyIdRef: ref,
              projectIdRef: ref,
              baselineRef: ref,
              publicationRef: ref,
            },
            actorRefs: {
              primaryTesterRef: 'actor://primary',
              planOwnerRef: 'actor://plan-owner',
            },
            expectedEvidenceRefs: {
              publicationReadbackRef: 'evidence://runtime-publication',
              rollbackVerificationRef: 'evidence://rollback',
            },
            cleanupRef: 'cleanup://uat04',
            approvalRef: 'approval://staging/uat04',
            rollbackRef: 'rollback://staging/uat04',
            monitoringRef: 'monitor://staging/uat04',
          },
        },
      },
    },
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat04-'))
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix())
  return { root, matrixFile }
}

test('blocks REAL-UAT-04 execution when the selected tier handoff is incomplete', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, incompleteHandoff(root))

  const report = await runUat04WbsBaselinePublication({
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
  assert.ok(report.blockers.some((blocker) => blocker.startsWith('scenario:targetRefs.baselineRef')))
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks REAL-UAT-04 execution when handoff is ready but explicit unlock flags are missing', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat04WbsBaselinePublication({
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

test('blocks REAL-UAT-04 execution when ready handoff refs are not locally resolvable env refs', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat04WbsBaselinePublication({
    tier: 'staging',
    handoffFile,
    matrixFile,
    releaseDir: root,
    output,
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
  assert.ok(report.blockers.includes('baselineId:unsupported_ref'))
  assert.equal(report.resolvedRefs.password.valueWrittenToReport, false)
  assert.match(written, /secret-ref:\/\/operator\/value/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})
