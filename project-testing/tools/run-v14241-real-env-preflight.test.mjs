import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { runPreflight } from './run-v14241-real-env-preflight.mjs'

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
    'TEST_USER_EMAIL=qa@example.com',
    'TEST_USER_PASSWORD=secret-value-not-written',
  ].join('\n'), 'utf8')
}

test('passes read-only preflight against a reachable API and client without writing raw token', async () => {
  await withServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>ok</html>')
      return
    }
    if (req.url === '/api/readyz') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: { token: 'eyJtest.header.payload', user: { id: 'user-1' } } }))
      return
    }
    if (req.url === '/api/workspace') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: { currentCompanyId: 'company-1' } }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }))
  }, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-preflight-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'preflight.json')
    await writeEnv(envFile, baseUrl)

    const report = await runPreflight({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'pass')
    assert.equal(report.summary.passedCheckCount, 4)
    assert.equal(report.canCloseScenarioTier, false)
    assert.equal(/eyJtest\.header\.payload/.test(written), false)
    assert.equal(/secret-value-not-written/.test(written), false)
    assert.match(written, /<redacted>/)
  })
})

test('blocks preflight when reachable services do not satisfy required checks', async () => {
  await withServer((req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', path: req.url } }))
  }, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-preflight-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'preflight.json')
    await writeEnv(envFile, baseUrl)

    const report = await runPreflight({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.failedCheckCount > 0, true)
    assert.equal(report.boundary.scenarioEvidenceStillRequired, true)
  })
})

test('falls back from TEST_USER_EMAIL to TEST_USERNAME without writing credential values', async () => {
  await withServer((req, res) => {
    if (req.url === '/' || req.url === '/api/readyz') {
      res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html' : 'application/json' })
      res.end(req.url === '/' ? '<html>ok</html>' : JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const parsed = JSON.parse(body)
        if (parsed.username === 'login-name') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ data: { token: 'eyJfallback.header.payload', user: { id: 'user-2' } } }))
        } else {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS' } }))
        }
      })
      return
    }
    if (req.url === '/api/workspace') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: { currentCompanyId: 'company-2' } }))
      return
    }
    res.writeHead(404)
    res.end()
  }, async (baseUrl) => {
    const root = await mkdtemp(join(tmpdir(), 'workbuddy-v14241-preflight-'))
    const envFile = join(root, 'staging.env')
    const output = join(root, 'preflight.json')
    await writeFile(envFile, [
      `API_BASE_URL=${baseUrl}`,
      `CLIENT_BASE_URL=${baseUrl}`,
      'TEST_USER_EMAIL=wrong@example.com',
      'TEST_USERNAME=login-name',
      'TEST_USER_PASSWORD=secret-value-not-written',
    ].join('\n'), 'utf8')

    const report = await runPreflight({
      envFile,
      output,
      now: new Date('2026-07-06T00:00:00.000Z'),
    })
    const written = await readFile(output, 'utf8')

    assert.equal(report.status, 'pass')
    assert.deepEqual(report.checks.find((check) => check.id === 'auth-login').credentialRefsTried, [
      'env://deploy/env/staging.env#TEST_USER_EMAIL',
      'env://deploy/env/staging.env#TEST_USERNAME',
    ])
    assert.equal(/wrong@example\.com|login-name|secret-value-not-written/.test(written), false)
    assert.equal(/eyJfallback\.header\.payload/.test(written), false)
  })
})
