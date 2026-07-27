import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runPlanningReadonlyProbe } from './run-v14241-real-uat06-planning-readonly.mjs'

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
    'TEST_USER_EMAIL=planning-qa@example.com',
    'TEST_USER_PASSWORD=secret-value-not-written',
  ].join('\n'), 'utf8')
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function makeHandler({ emptyPlanningData = false } = {}) {
  return (req, res) => {
    const authenticated = String(req.headers.authorization ?? '').startsWith('Bearer ')
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      json(res, 200, { data: { token: 'planning-readonly-token' } })
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
          companyProjects: [{ id: 'project-1', myRole: 'company_admin' }],
        },
      })
      return
    }
    if (req.url === '/api/planning/field-registry?projectId=project-1&surface=baseline') {
      json(res, 200, {
        data: {
          registryVersion: 'v1.4.7.1',
          surface: 'baseline',
          fields: [
            { key: 'title', validators: [{ severity: 'block_save' }], editableIn: ['baseline'] },
            { key: 'duration', validators: [], editableIn: [] },
          ],
          groups: [{ key: 'basic_plan' }],
        },
      })
      return
    }
    if (req.url === '/api/planning/field-registry?projectId=project-1&surface=monthly_plan') {
      json(res, 200, {
        data: {
          registryVersion: 'v1.4.7.1',
          surface: 'monthly_plan',
          fields: [{ key: 'target_progress', validators: [{ severity: 'block_save' }], editableIn: ['monthly_plan'] }],
          groups: [{ key: 'progress_fact' }],
        },
      })
      return
    }
    if (req.url === '/api/planning-governance?projectId=project-1') {
      json(res, 200, { data: { health: {}, mapping_integrity: {}, closeout: {}, anomaly: {} } })
      return
    }
    if (req.url === '/api/task-baselines?project_id=project-1') {
      json(res, 200, {
        data: emptyPlanningData ? [] : [{ id: 'baseline-1', status: 'confirmed', version: 1, is_current_execution: true }],
      })
      return
    }
    if (req.url === '/api/task-baselines/baseline-1?project_id=project-1') {
      json(res, 200, { data: { id: 'baseline-1', status: 'confirmed', version: 1, items: [{ id: 'bi-1' }] } })
      return
    }
    if (req.url === '/api/task-baselines/baseline-1/lock') {
      json(res, 404, { error: { code: 'NOT_FOUND' } })
      return
    }
    if (req.url === '/api/monthly-plans?project_id=project-1') {
      json(res, 200, {
        data: emptyPlanningData ? [] : [{ id: 'monthly-1', status: 'confirmed', version: 2, month: '2026-07', pending_closeout_count: 1 }],
      })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-1') {
      json(res, 200, { data: { id: 'monthly-1', status: 'confirmed', version: 2, month: '2026-07', items: [{ id: 'mi-1' }], pending_closeout_count: 1 } })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-1/lock') {
      json(res, 404, { error: { code: 'NOT_FOUND' } })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-1/closeout-summary') {
      json(res, 200, { data: { totalItems: 1, remainingCount: 1, carryoverCount: 0 } })
      return
    }
    json(res, 404, { error: { code: 'NOT_FOUND', path: req.url } })
  }
}

function makeMultiProjectHandler() {
  return (req, res) => {
    const authenticated = String(req.headers.authorization ?? '').startsWith('Bearer ')
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      json(res, 200, { data: { token: 'planning-readonly-token' } })
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
          companyProjects: [
            { id: 'project-empty', myRole: 'company_admin' },
            { id: 'project-with-plans', myRole: 'company_admin' },
          ],
        },
      })
      return
    }
    if (req.url?.startsWith('/api/planning/field-registry?projectId=project-with-plans')) {
      const surface = req.url.includes('surface=monthly_plan') ? 'monthly_plan' : 'baseline'
      json(res, 200, {
        data: {
          registryVersion: 'v1.4.7.1',
          surface,
          fields: [{ key: 'title', validators: [{ severity: 'block_save' }], editableIn: [surface] }],
          groups: [{ key: 'basic_plan' }],
        },
      })
      return
    }
    if (req.url === '/api/planning-governance?projectId=project-with-plans') {
      json(res, 200, { data: { health: {}, mapping_integrity: {}, closeout: {} } })
      return
    }
    if (req.url === '/api/task-baselines?project_id=project-empty' || req.url === '/api/monthly-plans?project_id=project-empty') {
      json(res, 200, { data: [] })
      return
    }
    if (req.url === '/api/task-baselines?project_id=project-with-plans') {
      json(res, 200, { data: [{ id: 'baseline-2', status: 'confirmed', version: 1 }] })
      return
    }
    if (req.url === '/api/monthly-plans?project_id=project-with-plans') {
      json(res, 200, { data: [{ id: 'monthly-2', status: 'confirmed', version: 1, pending_closeout_count: 0 }] })
      return
    }
    if (req.url === '/api/task-baselines/baseline-2?project_id=project-with-plans') {
      json(res, 200, { data: { id: 'baseline-2', status: 'confirmed', version: 1, items: [{ id: 'bi-2' }] } })
      return
    }
    if (req.url === '/api/task-baselines/baseline-2/lock') {
      json(res, 404, { error: { code: 'NOT_FOUND' } })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-2') {
      json(res, 200, { data: { id: 'monthly-2', status: 'confirmed', version: 1, month: '2026-07', items: [{ id: 'mi-2' }] } })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-2/lock') {
      json(res, 404, { error: { code: 'NOT_FOUND' } })
      return
    }
    if (req.url === '/api/monthly-plans/monthly-2/closeout-summary') {
      json(res, 200, { data: { totalItems: 1, remainingCount: 0, carryoverCount: 0 } })
      return
    }
    json(res, 404, { error: { code: 'NOT_FOUND', path: req.url } })
  }
}

test('records REAL-UAT-06 planning read-only support without claiming scenario-tier pass', async () => {
  await withServer(makeHandler(), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat06-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat06.json')
    await writeEnv(envFile, baseUrl)

    const report = await runPlanningReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'support_passed')
    assert.equal(report.canCloseScenarioTier, false)
    assert.equal(report.closesRealEnvironmentTier, false)
    assert.equal(report.summary.passedRequiredCheckCount, report.summary.requiredCheckCount)
    assert.equal(report.selectedTargetRefs.baselineId, 'baseline-1')
    assert.equal(report.selectedTargetRefs.monthlyPlanId, 'monthly-1')
    assert.equal(/planning-readonly-token|planning-qa@example\.com|secret-value-not-written/.test(written), false)
  })
})

test('blocks REAL-UAT-06 support when readable planning data is absent', async () => {
  await withServer(makeHandler({ emptyPlanningData: true }), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat06-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat06.json')
    await writeEnv(envFile, baseUrl)

    const report = await runPlanningReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })

    assert.equal(report.status, 'support_blocked')
    assert.deepEqual(report.summary.missingDataReasons.sort(), [
      'no_readable_baseline_versions',
      'no_readable_monthly_plans',
    ].sort())
    assert.equal(report.summary.failedRequiredCheckIds.length, 0)
  })
})

test('selects a later workspace project when the first project has no planning data', async () => {
  await withServer(makeMultiProjectHandler(), async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-uat06-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'uat06.json')
    await writeEnv(envFile, baseUrl)

    const report = await runPlanningReadonlyProbe({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
      maxProjectCandidates: 2,
    })

    assert.equal(report.status, 'support_passed')
    assert.equal(report.selectedTargetRefs.projectId, 'project-with-plans')
    const selection = report.checks.find((check) => check.id === 'planning-project-candidate-selection')
    assert.equal(selection.result.bodySummary.scannedCount, 2)
    assert.equal(selection.result.bodySummary.selectedReason, 'found_project_with_baseline_and_monthly_plan')
  })
})
