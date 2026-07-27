import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runUat05GanttCriticalPath } from './run-v14241-real-uat05-gantt-critical-path.mjs'

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function matrix() {
  return {
    schemaVersion: 'test',
    scenarios: [
      {
        id: 'REAL-UAT-05',
        title: 'Gantt 任务编辑/依赖/关键路径/冲突处理',
        priority: 'P0',
        evidenceOwners: ['planning-owner', 'frontend-owner', 'performance-owner'],
        tiers: [
          { name: 'UAT' },
          { name: 'staging' },
          { name: 'live' },
        ],
        evidenceContract: {
          requiredArtifacts: [
            'real-uat-05-gantt-critical-path.json',
            'critical-path-readback.json',
            'performance-gantt-p95.json',
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
      'REAL-UAT-05': {
        id: 'REAL-UAT-05',
        evidenceOwners: {
          'planning-owner': '',
          'frontend-owner': '',
          'performance-owner': '',
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
        writeApprovalRef: 'approval://staging/uat05',
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
      'REAL-UAT-05': {
        id: 'REAL-UAT-05',
        evidenceOwners: {
          'planning-owner': 'owner://planning',
          'frontend-owner': 'owner://frontend',
          'performance-owner': 'owner://performance',
        },
        tiers: {
          staging: {
            targetRefs: {
              companyIdRef: ref,
              projectIdRef: ref,
              largeProjectRef: ref,
              criticalPathReadbackRef: ref,
            },
            actorRefs: {
              primaryTesterRef: 'actor://primary',
            },
            expectedEvidenceRefs: {
              performanceThresholdRef: ref,
            },
            cleanupRef: 'cleanup://uat05',
            approvalRef: 'approval://staging/uat05',
            rollbackRef: 'rollback://staging/uat05',
            monitoringRef: 'monitor://staging/uat05',
          },
        },
      },
    },
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat05-'))
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix())
  return { root, matrixFile }
}

test('blocks REAL-UAT-05 execution when the selected tier handoff is incomplete', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, incompleteHandoff(root))

  const report = await runUat05GanttCriticalPath({
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
  assert.ok(report.blockers.some((blocker) => blocker.startsWith('scenario:targetRefs.largeProjectRef')))
  assert.ok(report.blockers.some((blocker) => blocker.startsWith('scenario:targetRefs.criticalPathReadbackRef')))
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks REAL-UAT-05 execution when handoff is ready but explicit unlock flags are missing', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat05GanttCriticalPath({
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

test('blocks REAL-UAT-05 execution when ready handoff refs are not locally resolvable env refs', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat05GanttCriticalPath({
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
  assert.ok(report.blockers.includes('largeProjectId:unsupported_ref'))
  assert.ok(report.blockers.includes('performanceThreshold:unsupported_ref'))
  assert.equal(report.resolvedRefs.password.valueWrittenToReport, false)
  assert.match(written, /secret-ref:\/\/operator\/value/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})
