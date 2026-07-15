import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runBiSsotReadonlyProbe } from './run-v14241-real-uat09-bi-ssot-readonly.mjs'

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
    'TEST_USER_EMAIL=bi-qa@example.com',
    'TEST_USER_PASSWORD=secret-value-not-written',
  ].join('\n'), 'utf8')
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function happyPathHandler(req, res) {
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    json(res, 200, { data: { token: 'eyJbi.header.payload' } })
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
    json(res, 200, { data: [{ key: 'overall_progress', frontendVisible: true }] })
    return
  }
  if (req.url === '/api/projects/project-1/dashboard/project-summary') {
    json(res, 200, {
      data: {
        id: 'project-1',
        name: 'Project One',
        overallProgress: 42,
        healthScore: 76,
        snapshot: { mode: 'project_daily_snapshot' },
      },
    })
    return
  }
  if (req.url === '/api/company/dashboard/projects-summary') {
    json(res, 200, { data: [{ id: 'project-1', overallProgress: 42, healthScore: 76 }] })
    return
  }
  if (req.url === '/api/company/dashboard/company-summary') {
    json(res, 200, {
      data: {
        statusCounts: { active: 1 },
        projects: [{ id: 'project-1' }],
        healthHistory: [{ date: '2026-07-06', score: 76 }],
      },
    })
    return
  }
  if (req.url === '/api/analytics/project-trend?projectId=project-1&metric=overall_progress') {
    json(res, 200, { data: { granularity: 'day', points: [{ date: '2026-07-06', value: 42 }] } })
    return
  }
  if (req.url === '/api/analytics/company-trend?metric=overall_progress') {
    json(res, 200, { data: { granularity: 'day', points: [{ date: '2026-07-06', value: 42 }] } })
    return
  }
  if (req.url === '/api/projects/project-1/reports/s-curve') {
    json(res, 200, { data: [{ date: '2026-07-06', planned_cumulative: 45, actual_cumulative: 42 }] })
    return
  }
  json(res, 404, { error: { code: 'NOT_FOUND', path: req.url } })
}

test('records REAL-UAT-09 read-only support evidence without leaking credentials or claiming tier pass', async () => {
  await withServer(happyPathHandler, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat09-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat09.json')
    await writeEnv(envFile, baseUrl)

    const report = await runBiSsotReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'support_passed')
    assert.equal(report.scenarioId, 'REAL-UAT-09')
    assert.equal(report.canCloseScenarioTier, false)
    assert.equal(report.closesRealEnvironmentTier, false)
    assert.equal(report.summary.passedRequiredCheckCount, report.summary.requiredCheckCount)
    assert.equal(report.selectedTargetRefs.projectId, 'project-1')
    assert.equal(/eyJbi\.header\.payload/.test(written), false)
    assert.equal(/secret-value-not-written|bi-qa@example\.com/.test(written), false)
  })
})

test('blocks support probe when workspace has no readable project', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      json(res, 200, { data: { token: 'eyJempty.header.payload' } })
      return
    }
    if (req.url === '/api/workspace') {
      json(res, 200, {
        data: {
          hasCompany: true,
          currentCompany: { id: 'company-1', role: 'company_admin' },
          myProjects: [],
          companyProjects: [],
        },
      })
      return
    }
    if (req.url === '/api/analytics/metrics') {
      json(res, 200, { data: [{ key: 'overall_progress' }] })
      return
    }
    json(res, 404, { error: { code: 'NOT_FOUND', path: req.url } })
  }, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat09-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat09.json')
    await writeEnv(envFile, baseUrl)

    const report = await runBiSsotReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })

    assert.equal(report.status, 'support_blocked')
    assert.equal(report.summary.failedRequiredCheckIds.includes('dashboard-project-summary'), true)
    assert.equal(report.summary.failedRequiredCheckIds.includes('reports-s-curve'), true)
    assert.equal(report.canCloseScenarioTier, false)
  })
})

test('records slow read warnings without blocking BI SSOT read support', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/company/dashboard/projects-summary') {
      setTimeout(() => {
        json(res, 200, { data: [{ id: 'project-1', overallProgress: 42, healthScore: 76 }] })
      }, 25)
      return
    }
    happyPathHandler(req, res)
  }, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat09-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat09.json')
    await writeEnv(envFile, baseUrl)

    const report = await runBiSsotReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
      readWarningThresholdMs: 10,
      readTimeoutMs: 1000,
    })

    assert.equal(report.status, 'support_passed')
    assert.deepEqual(report.summary.slowReadWarningIds, ['dashboard-projects-summary'])
    const slowCheck = report.checks.find((check) => check.id === 'dashboard-projects-summary')
    assert.equal(slowCheck.warning.code, 'READ_LATENCY_OVER_WARNING_THRESHOLD')
    assert.equal(slowCheck.warning.boundary.includes('REAL-UAT-11'), true)
  })
})
