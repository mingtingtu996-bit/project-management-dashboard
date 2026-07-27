import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runReadonlySupportProbes } from './run-v14241-real-env-readonly-support-probes.mjs'

async function withServer(handler, fn) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    return await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

async function writeEnv(path, baseUrl) {
  await writeFile(path, [
    `API_BASE_URL=${baseUrl}`,
    `CLIENT_BASE_URL=${baseUrl}`,
    'PUBLIC_HTTPS_ORIGIN=https://staging.example.test',
    'TEST_USER_EMAIL=readonly-qa@example.com',
    'TEST_USER_PASSWORD=secret-value-not-written',
  ].join('\n'), 'utf8')
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-security-policy': "default-src 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'no-referrer',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}

function makeHandler({ slowProjectsSummary = false, localPermissionBypass = false } = {}) {
  return (req, res) => {
    const authenticated = localPermissionBypass || String(req.headers.authorization ?? '').startsWith('Bearer ')
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      if (req.headers.origin !== 'https://staging.example.test') {
        json(res, 403, { error: { code: 'CROSS_ENVIRONMENT_ORIGIN_FORBIDDEN' } })
        return
      }
      json(res, 200, { data: { token: 'eyJreadonly.header.payload' } })
      return
    }
    if (req.url === '/api/readyz') {
      json(res, 200, { status: 'ok' })
      return
    }
    if (!authenticated) {
      json(res, 401, { error: { code: 'UNAUTHORIZED' } })
      return
    }
    if (req.url === '/api/workspace') {
      json(res, 200, {
        data: {
          hasCompany: true,
          currentCompany: { id: 'company-1', role: 'company_admin' },
          myProjects: [{ id: 'project-1', myRole: 'owner' }],
          companyProjects: [{ id: 'project-1', myRole: 'company_admin' }],
        },
      })
      return
    }
    if (req.url === '/api/analytics/metrics') {
      json(res, 200, { data: [{ key: 'health_score' }] })
      return
    }
    if (req.url === '/api/members/project-1/me') {
      json(res, 200, { data: { permissionLevel: 'owner' } })
      return
    }
    if (localPermissionBypass && req.url === '/api/members/00000000-0000-4000-8000-000000000999/me') {
      json(res, 200, { data: { permissionLevel: 'owner', bypassed: true } })
      return
    }
    if (req.url === '/api/members/00000000-0000-4000-8000-000000000999/me') {
      json(res, 403, { error: { code: 'FORBIDDEN' } })
      return
    }
    if (req.url === '/api/projects/00000000-0000-4000-8000-000000000999/dashboard/project-summary') {
      json(res, 404, { error: { code: 'PROJECT_NOT_FOUND' } })
      return
    }
    if (req.url === '/api/projects/project-1/dashboard/project-summary') {
      json(res, 200, { data: { id: 'project-1', healthScore: 80 } })
      return
    }
    if (req.url === '/api/company/dashboard/company-summary') {
      json(res, 200, { data: { projectCount: 1, averageHealth: 80 } })
      return
    }
    if (req.url === '/api/company/dashboard/projects-summary') {
      setTimeout(() => {
        json(res, 200, { data: [{ id: 'project-1', healthScore: 80 }] })
      }, slowProjectsSummary ? 25 : 0)
      return
    }
    if (req.url === '/api/projects/project-1/reports/s-curve') {
      json(res, 200, { data: [{ date: '2026-07-06', planned_cumulative: 80, actual_cumulative: 78 }] })
      return
    }
    if (req.url === '/api/analytics/company-trend?metric=health_score') {
      json(res, 200, { data: { points: [{ date: '2026-07-06', value: 80 }] } })
      return
    }
    if (req.url === '/api/analytics/project-trend?projectId=project-1&metric=__not_registered__') {
      json(res, 400, { error: { code: 'VALIDATION_ERROR' } })
      return
    }
    if (req.url === '/api/analytics/company-trend?metric=health_score&groupBy=project') {
      json(res, 400, { error: { code: 'VALIDATION_ERROR' } })
      return
    }
    if (req.url === '/api/v14231-readiness') {
      json(res, 200, { data: { status: 'ready', items: [1, 2] } })
      return
    }
    if (req.url === '/api/v14231-readiness/actionable-surfaces') {
      json(res, 200, { data: { status: 'ready', items: [1] } })
      return
    }
    if (req.url === '/api/notifications/diagnostics?projectId=project-1&limit=10') {
      json(res, 200, { data: { analytics: {}, producerAudit: {}, reconciliationCoverage: {}, deliveryGovernance: {} } })
      return
    }
    if (req.url === '/api/deletion-retention/diagnostics') {
      json(res, 200, { data: { status: 'ok' } })
      return
    }
    json(res, 404, { error: { code: 'NOT_FOUND', path: req.url } })
  }
}

test('records read-only support probes for isolation, security, performance, and ops without claiming matrix pass', async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-readonly-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'readonly.json')
    await writeEnv(envFile, baseUrl)

    const report = await runReadonlySupportProbes({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'support_passed')
    assert.equal(report.canCloseScenarioTier, false)
    assert.equal(report.closesRealEnvironmentTier, false)
    assert.equal(report.scenarioResults['REAL-UAT-03'].status, 'support_passed')
    assert.equal(report.scenarioResults['REAL-UAT-11'].status, 'support_passed')
    assert.equal(report.scenarioResults['REAL-UAT-12'].status, 'support_passed')
    assert.equal(report.scenarioResults['REAL-UAT-16'].status, 'support_passed')
    assert.equal(/eyJreadonly\.header\.payload/.test(written), false)
    assert.equal(/readonly-qa@example\.com|secret-value-not-written/.test(written), false)
  })
})

test('marks performance support blocked when a read endpoint exceeds the threshold', async () => {
  await withServer(makeHandler({ slowProjectsSummary: true }), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-readonly-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'readonly.json')
    await writeEnv(envFile, baseUrl)

    const report = await runReadonlySupportProbes({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
      performanceThresholdMs: 10,
    })

    assert.equal(report.status, 'support_mixed')
    assert.equal(report.scenarioResults['REAL-UAT-11'].status, 'support_blocked')
    assert.deepEqual(report.scenarioResults['REAL-UAT-11'].latencySummary.overThresholdIds, [
      'dashboard-projects-summary-latency',
    ])
    assert.equal(report.scenarioResults['REAL-UAT-03'].status, 'support_passed')
  })
})

test('marks local permission-bypass negative checks as inconclusive instead of staging security failures', async () => {
  await withServer(makeHandler({ localPermissionBypass: true }), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-readonly-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'readonly.json')
    await writeEnv(envFile, baseUrl)

    const report = await runReadonlySupportProbes({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
      authBoundaryDiagnostics: {
        classification: 'local_permission_bypass_configured',
        permissionBypassLikely: true,
        inspectedRefs: ['server/.env#runtime-auth-flags'],
        disablePermissionSystemRefs: ['server/.env#runtime-auth-flags'],
        fallbackUserRefs: [],
      },
    })

    assert.equal(report.status, 'support_inconclusive')
    assert.equal(report.authBoundaryDiagnostics.classification, 'local_permission_bypass_configured')
    assert.equal(report.scenarioResults['REAL-UAT-03'].status, 'support_inconclusive')
    assert.equal(report.scenarioResults['REAL-UAT-12'].status, 'support_inconclusive')
    assert.deepEqual(report.scenarioResults['REAL-UAT-03'].inconclusiveCheckIds.sort(), [
      'noauth-workspace-rejected',
      'random-project-member-denied',
    ].sort())
    assert.equal(
      report.scenarioResults['REAL-UAT-12'].checks.find((check) => check.id === 'noauth-protected-route-rejected').status,
      'not_applicable_local_permission_bypass',
    )
  })
})
