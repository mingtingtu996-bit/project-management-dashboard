import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runUat03RlsRoleMatrix } from './run-v14241-real-uat03-rls-role-matrix.mjs'

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function matrix() {
  return {
    schemaVersion: 'test',
    scenarios: [
      {
        id: 'REAL-UAT-03',
        title: '跨公司/跨项目隔离与 RLS 负向矩阵',
        priority: 'P0',
        evidenceOwners: ['security-owner', 'database-owner', 'backend-owner'],
        tiers: [
          { name: 'UAT' },
          { name: 'staging' },
          { name: 'live' },
        ],
        evidenceContract: {
          requiredArtifacts: [
            'real-uat-03-rls-role-matrix.json',
            'cross-tenant-negative-readback.json',
            'cleanup-readback.json',
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
      'REAL-UAT-03': {
        id: 'REAL-UAT-03',
        evidenceOwners: {
          'security-owner': '',
          'database-owner': '',
          'backend-owner': '',
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
        writeApprovalRef: 'approval://staging/uat03',
        cleanupOwner: 'cleanup-owner',
        retentionOwner: 'retention-owner',
        roleAccountRefs: {
          company_admin: 'role://company-admin',
          project_admin: 'role://project-admin',
          editor: 'role://editor',
          outsider: 'role://outsider',
        },
        anonPolicyRef: 'policy://anon',
        credentialRefs: {},
      },
      live: {},
    },
    scenarios: {
      'REAL-UAT-03': {
        id: 'REAL-UAT-03',
        evidenceOwners: {
          'security-owner': 'owner://security',
          'database-owner': 'owner://database',
          'backend-owner': 'owner://backend',
        },
        tiers: {
          staging: {
            targetRefs: {
              companyIdRef: ref,
              projectIdRef: ref,
              secondCompanyRef: ref,
              secondProjectRef: ref,
            },
            actorRefs: {
              primaryTesterRef: 'actor://primary',
              roleMatrixAccountRefsRef: ref,
            },
            expectedEvidenceRefs: {
              cleanupRef: 'cleanup://uat03',
            },
            cleanupRef: 'cleanup://uat03',
            approvalRef: 'approval://staging/uat03',
            rollbackRef: 'rollback://staging/uat03',
            monitoringRef: 'monitor://staging/uat03',
          },
        },
      },
    },
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat03-'))
  const matrixFile = join(root, 'matrix.json')
  await writeJson(matrixFile, matrix())
  return { root, matrixFile }
}

function envRef(path, key) {
  return `env://${path.replace(/\\/g, '/')}#${key}`
}

async function writeEnv(path, values) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'), 'utf8')
}

function readyEnvHandoff(root, refs) {
  const handoff = readyHandoff(root, refs.API_BASE_URL)
  handoff.environmentTargets.staging.apiBaseUrlRef = refs.API_BASE_URL
  handoff.environmentTargets.staging.clientBaseUrlRef = refs.CLIENT_BASE_URL
  handoff.environmentTargets.staging.credentialRefs.testUserPasswordRef = refs.TEST_PASSWORD
  handoff.scenarios['REAL-UAT-03'].tiers.staging.targetRefs.companyIdRef = refs.COMPANY_ID
  handoff.scenarios['REAL-UAT-03'].tiers.staging.targetRefs.projectIdRef = refs.PROJECT_ID
  handoff.scenarios['REAL-UAT-03'].tiers.staging.targetRefs.secondCompanyRef = refs.SECOND_COMPANY_ID
  handoff.scenarios['REAL-UAT-03'].tiers.staging.targetRefs.secondProjectRef = refs.SECOND_PROJECT_ID
  handoff.scenarios['REAL-UAT-03'].tiers.staging.actorRefs.roleMatrixAccountRefsRef = refs.ROLE_MATRIX
  return handoff
}

async function withMockUat03Api(assertions, options = {}) {
  const primaryProjectId = options.primaryProjectId ?? 'primary-project'
  const defaultDeniedProjectId = options.deniedProjectId ?? 'second-project'
  const ownerAccessibleProjectId = options.ownerAccessibleProjectId ?? null
  const permissionsByUser = new Map([
    ['owner-user', 'owner'],
    ['editor-user', 'editor'],
    ['outsider-user', 'outsider'],
  ])
  const tokens = new Map()
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const bodyText = Buffer.concat(chunks).toString('utf8')
    const body = bodyText ? JSON.parse(bodyText) : {}
    const url = new URL(req.url, 'http://127.0.0.1')
    res.setHeader('content-type', 'application/json')

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const permission = permissionsByUser.get(body.username)
      if (!permission || body.password !== 'shared-test-pass') {
        res.writeHead(401)
        res.end(JSON.stringify({ error: 'invalid credentials' }))
        return
      }
      const token = `token-${permission}`
      tokens.set(token, permission)
      res.end(JSON.stringify({ data: { token } }))
      return
    }

    const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const permission = tokens.get(auth)
    const sameProjectMatch = url.pathname === `/api/members/${primaryProjectId}/me`
    if (req.method === 'GET' && sameProjectMatch && ['owner', 'editor'].includes(permission)) {
      res.end(JSON.stringify({ data: { permissionLevel: permission } }))
      return
    }
    if (req.method === 'GET' && sameProjectMatch && permission === 'outsider') {
      res.writeHead(403)
      res.end(JSON.stringify({ error: 'project membership required' }))
      return
    }
    if (req.method === 'GET' && sameProjectMatch && !permission) {
      res.writeHead(401)
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    if (req.method === 'GET' && ownerAccessibleProjectId && url.pathname === `/api/members/${ownerAccessibleProjectId}/me`) {
      if (permission === 'owner') {
        res.end(JSON.stringify({ data: { permissionLevel: 'owner' } }))
        return
      }
      res.writeHead(403)
      res.end(JSON.stringify({ error: 'cross tenant denied' }))
      return
    }
    if (req.method === 'GET' && url.pathname === `/api/members/${defaultDeniedProjectId}/me`) {
      res.writeHead(403)
      res.end(JSON.stringify({ error: 'cross tenant denied' }))
      return
    }
    if (req.method === 'PATCH' && url.pathname === `/api/members/${primaryProjectId}/outsider-id`) {
      res.writeHead(403)
      res.end(JSON.stringify({ error: 'outsider write denied' }))
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'not found', path: url.pathname }))
  })

  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  try {
    const { port } = server.address()
    await assertions(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

test('blocks REAL-UAT-03 execution when the selected tier handoff is incomplete', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, incompleteHandoff(root))

  const report = await runUat03RlsRoleMatrix({
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
  assert.ok(report.blockers.some((blocker) => blocker.startsWith('scenario:targetRefs.secondCompanyRef')))
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('blocks REAL-UAT-03 execution when handoff is ready but explicit unlock flags are missing', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat03RlsRoleMatrix({
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

test('blocks REAL-UAT-03 execution when ready handoff refs are not locally resolvable env refs', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  await writeJson(handoffFile, readyHandoff(root))

  const report = await runUat03RlsRoleMatrix({
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
  assert.ok(report.blockers.includes('roleMatrixAccountRefs:unsupported_ref'))
  assert.equal(report.resolvedRefs.roleMatrixAccountRefs.valueWrittenToReport, false)
  assert.match(written, /secret-ref:\/\/operator\/value/)
  assert.doesNotMatch(written, /password=|postgres:\/\//i)
})

test('runs REAL-UAT-03 with controlled staging owner/editor/outsider account matrix and shared password ref', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  const artifactRoot = join(root, 'evidence', 'staging')
  const cleanupReadbackFile = join(artifactRoot, 'operator-readbacks', 'real-uat-03-cleanup-readback.json')
  const envFile = join(root, 'refs.env')
  const roleMatrix = {
    owner: { username: 'owner-user', userId: 'owner-id' },
    editor: { username: 'editor-user', userId: 'editor-id' },
    outsider: { username: 'outsider-user', userId: 'outsider-id' },
  }

  await withMockUat03Api(async (baseUrl) => {
    await writeEnv(envFile, {
      API_BASE_URL: baseUrl,
      CLIENT_BASE_URL: baseUrl,
      TEST_PASSWORD: 'shared-test-pass',
      COMPANY_ID: 'primary-company',
      PROJECT_ID: 'primary-project',
      SECOND_COMPANY_ID: 'second-company',
      SECOND_PROJECT_ID: 'second-project',
      ROLE_MATRIX: JSON.stringify(roleMatrix),
    })
    await writeJson(handoffFile, readyEnvHandoff(root, {
      API_BASE_URL: envRef(envFile, 'API_BASE_URL'),
      CLIENT_BASE_URL: envRef(envFile, 'CLIENT_BASE_URL'),
      TEST_PASSWORD: envRef(envFile, 'TEST_PASSWORD'),
      COMPANY_ID: envRef(envFile, 'COMPANY_ID'),
      PROJECT_ID: envRef(envFile, 'PROJECT_ID'),
      SECOND_COMPANY_ID: envRef(envFile, 'SECOND_COMPANY_ID'),
      SECOND_PROJECT_ID: envRef(envFile, 'SECOND_PROJECT_ID'),
      ROLE_MATRIX: envRef(envFile, 'ROLE_MATRIX'),
    }))
    await writeJson(cleanupReadbackFile, {
      status: 'pass',
      environment: 'staging',
      scenarioId: 'REAL-UAT-03',
    })

    const report = await runUat03RlsRoleMatrix({
      tier: 'staging',
      handoffFile,
      matrixFile,
      releaseDir: root,
      output,
      artifactRoot,
      cleanupReadbackFile,
      flags: {
        '--include-staging': true,
        '--confirm-real-handoff': true,
        '--allow-write': true,
      },
      now: new Date('2026-07-07T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'passed')
    assert.equal(report.canCloseScenarioTier, true)
    assert.equal(report.commandsExecuted, 11)
    assert.equal(report.resolvedRefs.accounts.project_admin.userIdRef, 'owner-id')
    assert.equal(report.resolvedRefs.accounts.outsider.userIdRef, 'outsider-id')
    assert.doesNotMatch(written, /shared-test-pass|password=|postgres:\/\//i)
  })
})

test('provisions disposable foreign tenant for REAL-UAT-03 when handoff foreign company ref is not executable', async () => {
  const { root, matrixFile } = await fixtureRoot()
  const handoffFile = join(root, 'handoff.json')
  const output = join(root, 'report.json')
  const artifactRoot = join(root, 'evidence', 'staging')
  const cleanupReadbackFile = join(artifactRoot, 'operator-readbacks', 'real-uat-03-cleanup-readback.json')
  const envFile = join(root, 'refs.env')
  const roleMatrix = {
    owner: { username: 'owner-user', userId: 'owner-id' },
    editor: { username: 'editor-user', userId: 'editor-id' },
    outsider: { username: 'outsider-user', userId: 'outsider-id' },
  }

  await withMockUat03Api(async (baseUrl) => {
    await writeEnv(envFile, {
      API_BASE_URL: baseUrl,
      CLIENT_BASE_URL: baseUrl,
      TEST_PASSWORD: 'shared-test-pass',
      COMPANY_ID: 'primary-company',
      PROJECT_ID: 'primary-project',
      SECOND_COMPANY_ID: 'controlled-staging-ref://foreign-company-not-provisioned',
      SECOND_PROJECT_ID: 'handoff-accessible-project',
      ROLE_MATRIX: JSON.stringify(roleMatrix),
    })
    await writeJson(handoffFile, readyEnvHandoff(root, {
      API_BASE_URL: envRef(envFile, 'API_BASE_URL'),
      CLIENT_BASE_URL: envRef(envFile, 'CLIENT_BASE_URL'),
      TEST_PASSWORD: envRef(envFile, 'TEST_PASSWORD'),
      COMPANY_ID: envRef(envFile, 'COMPANY_ID'),
      PROJECT_ID: envRef(envFile, 'PROJECT_ID'),
      SECOND_COMPANY_ID: envRef(envFile, 'SECOND_COMPANY_ID'),
      SECOND_PROJECT_ID: envRef(envFile, 'SECOND_PROJECT_ID'),
      ROLE_MATRIX: envRef(envFile, 'ROLE_MATRIX'),
    }))
    await writeJson(cleanupReadbackFile, {
      status: 'pass',
      environment: 'staging',
      scenarioId: 'REAL-UAT-03',
    })

    const provisionCalls = []
    const report = await runUat03RlsRoleMatrix({
      tier: 'staging',
      handoffFile,
      matrixFile,
      releaseDir: root,
      output,
      artifactRoot,
      cleanupReadbackFile,
      auditEnvFile: envFile,
      foreignTargetProvisioner: async () => {
        provisionCalls.push('called')
        return {
          status: 'pass',
          companyId: 'foreign-company',
          projectId: 'foreign-project',
          cleanup: { status: 'pass' },
          evidence: { companyId: 'foreign-company', projectId: 'foreign-project' },
        }
      },
      flags: {
        '--include-staging': true,
        '--confirm-real-handoff': true,
        '--allow-write': true,
      },
      now: new Date('2026-07-07T00:00:00.000Z'),
    })

    assert.equal(report.status, 'passed')
    assert.deepEqual(provisionCalls, ['called'])
    assert.equal(report.checks.find((check) => check.id === 'disposable-foreign-target')?.status, 'pass')
    assert.equal(report.evidenceArtifacts.disposableForeignTarget.status, 'pass')
  }, { deniedProjectId: 'foreign-project', ownerAccessibleProjectId: 'handoff-accessible-project' })
})
