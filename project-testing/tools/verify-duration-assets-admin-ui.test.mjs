import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))
const verifierPath = join(toolsDir, 'verify-duration-assets-admin-ui.mjs')
const verifierUrl = pathToFileURL(verifierPath).href

function runModule(code, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: join(toolsDir, '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      START_VITE: 'false',
      BASE_URL: 'https://example.com',
      ...env,
    },
  })
}

test('duration assets browser verifier remains deterministic and local-only', () => {
  const source = readFileSync(verifierPath, 'utf8')

  assert.match(source, /1440\s*,\s*900/)
  assert.match(source, /390\s*,\s*844/)
  assert.match(source, /\/admin\/duration-assets/)
  assert.match(source, /page\.route\(/)
  assert.match(source, /duration-assets-overlap/)
  assert.match(source, /assertLocalViteUrl/)
  assert.match(source, /process\.env\.BASE_URL/)
  assert.match(source, /process\.env\.START_VITE/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /localhost/)
  assert.match(source, /\/api\/auth\/me/)
  assert.match(source, /\/api\/workspace/)
  assert.match(source, /\/api\/admin\/duration-assets\/review-items/)
  assert.match(source, /\/api\/admin\/duration-accuracy/)
  assert.match(source, /readiness/)
  assert.match(source, /page\.clock\.setFixedTime\(FIXTURE_TIMESTAMP\)/)
  assert.match(source, /getAttribute\('data-overlap-ignore'\) === 'true'/)
  assert.match(source, /getAttribute\('role'\) === 'tabpanel'/)
  assert.match(
    source,
    /join\(repoRoot,\s*'project-testing',\s*'artifacts',\s*'browser-checks',\s*'duration-assets'\)/,
  )
  assert.match(source, /requireFromServer\('playwright'\)/)
  assert.doesNotMatch(source, /page\.setContent\(/)
  assert.doesNotMatch(source, /staging|production/i)
})

test('duration assets browser verifier imports without running its CLI entrypoint', () => {
  const result = runModule(`await import(${JSON.stringify(verifierUrl)}); process.stdout.write('imported')`)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'imported')
})

test('duration assets browser verifier rejects non-loopback URLs through its exported policy', () => {
  const result = runModule(`
    const { FIXTURE_TIMESTAMP, assertLocalViteUrl } = await import(${JSON.stringify(verifierUrl)})
    if (FIXTURE_TIMESTAMP !== '2026-04-06T12:00:00.000Z') throw new Error('fixture timestamp is not fixed')
    let rejected = false
    try {
      assertLocalViteUrl('https://example.com')
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('external URL was accepted')
    const accepted = assertLocalViteUrl('https://127.0.0.1:4197')
    if (accepted.origin !== 'https://127.0.0.1:4197') throw new Error('loopback URL was not normalized')
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier accepts only the expected initial and tab-qualified final navigation URLs', () => {
  const result = runModule(`
    const { assertDurationAssetsNavigationUrl } = await import(${JSON.stringify(verifierUrl)})
    const baseUrl = 'http://127.0.0.1:4197'
    assertDurationAssetsNavigationUrl(baseUrl + '/#/admin/duration-assets', baseUrl, 'initial')
    assertDurationAssetsNavigationUrl(baseUrl + '/#/admin/duration-assets?tab=queue', baseUrl, 'final')
    let rejected = false
    try {
      assertDurationAssetsNavigationUrl(baseUrl + '/#/admin/duration-assets?tab=legacy', baseUrl, 'final')
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('unknown final tab was accepted')
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier denies external, unknown API, and mutation requests through its policy', () => {
  const result = runModule(`
    const { classifyDurationAssetsRequestPolicy } = await import(${JSON.stringify(verifierUrl)})
    const baseUrl = 'http://127.0.0.1:4197'
    const external = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'GET', url: 'https://example.com/app.js' })
    const unknownApi = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'GET', url: baseUrl + '/api/unknown' })
    const mutation = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'POST', url: baseUrl + '/api/auth/me' })
    const fixture = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'GET', url: baseUrl + '/api/auth/me' })
    const queueFixture = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'GET', url: baseUrl + '/api/admin/duration-assets/review-items?age=all' })
    const bareQueue = classifyDurationAssetsRequestPolicy({ baseUrl, method: 'GET', url: baseUrl + '/api/admin/duration-assets/review-items' })
    if (external.action !== 'block' || external.reason !== 'external_request') throw new Error(JSON.stringify(external))
    if (unknownApi.action !== 'block' || unknownApi.reason !== 'unknown_api_get') throw new Error(JSON.stringify(unknownApi))
    if (mutation.action !== 'block' || mutation.reason !== 'mutation_request') throw new Error(JSON.stringify(mutation))
    if (fixture.action !== 'fulfill' || fixture.fixture !== 'auth') throw new Error(JSON.stringify(fixture))
    if (queueFixture.action !== 'fulfill' || queueFixture.fixture !== 'queue') throw new Error(JSON.stringify(queueFixture))
    if (bareQueue.action !== 'block' || bareQueue.reason !== 'unknown_api_get') throw new Error(JSON.stringify(bareQueue))
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier makes Vite-emitted realtime source network-free regardless of quote style', () => {
  const result = runModule(`
    const { transformOfflineViteResource } = await import(${JSON.stringify(verifierUrl)})
    const diagnostics = { transforms: { document: 0, stylesheet: 0, connectionMode: 0 } }
    const body = transformOfflineViteResource(
      new URL('http://127.0.0.1:4197/src/hooks/useStore.ts'),
      'function resolveInitialConnectionMode() { return "websocket" }',
      diagnostics,
    )
    if (!body.includes("return 'polling'")) throw new Error(body)
    if (diagnostics.transforms.connectionMode !== 1) throw new Error(JSON.stringify(diagnostics))
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier strips Vite HMR client injection regardless of attribute order', () => {
  const result = runModule(`
    const { transformOfflineViteResource } = await import(${JSON.stringify(verifierUrl)})
    const diagnostics = { transforms: { document: 0, stylesheet: 0, connectionMode: 0 } }
    const body = transformOfflineViteResource(
      new URL('http://127.0.0.1:4197/'),
      '<link href="https://fonts.googleapis.com/css2?family=Local" rel="stylesheet"><script src="/@vite/client" type="module"></script><main>app</main>',
      diagnostics,
    )
    if (body.includes('/@vite/client') || body.includes('fonts.googleapis.com')) throw new Error(body)
    if (diagnostics.transforms.document !== 1) throw new Error(JSON.stringify(diagnostics))
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier disables only the unrelated App project sync source', () => {
  const result = runModule(`
    const { transformOfflineViteResource } = await import(${JSON.stringify(verifierUrl)})
    const diagnostics = { transforms: { document: 0, stylesheet: 0, connectionMode: 0, projectSync: 0 } }
    const body = transformOfflineViteResource(
      new URL('http://127.0.0.1:4197/src/App.tsx'),
      'function syncProjectsForKey(syncKey) {\\n  return fetchProjectsFromApi().finally(() => {})\\n}\\n\\nfunction isDashboardProjectRoutePath(pathname) { return true }',
      diagnostics,
    )
    if (!body.includes('return Promise.resolve([])') || body.includes('fetchProjectsFromApi().finally')) throw new Error(body)
    if (diagnostics.transforms.projectSync !== 1) throw new Error(JSON.stringify(diagnostics))
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier neutralizes the local Vite HMR client before it can open a socket', () => {
  const result = runModule(`
    const { transformOfflineViteResource } = await import(${JSON.stringify(verifierUrl)})
    const diagnostics = { transforms: { hmrClient: 0 } }
    const body = transformOfflineViteResource(
      new URL('http://127.0.0.1:4197/@vite/client'),
      'const socket = new WebSocket(import.meta.url)'
        + '; import.meta.hot = { accept() {} }',
      diagnostics,
    )
    if (!body.includes('export function injectQuery') || !body.includes('export function createHotContext') || !body.includes("document.createElement('style')") || !body.includes('style.textContent = content') || body.includes('new WebSocket') || diagnostics.transforms.hmrClient !== 1) {
      throw new Error(JSON.stringify({ body, diagnostics }))
    }
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier confines artifacts and runs every cleanup step after a failure', () => {
  const result = runModule(`
    const { resolveDurationAssetsArtifactPath, runVerifierCleanup } = await import(${JSON.stringify(verifierUrl)})
    const inside = resolveDurationAssetsArtifactPath('duration-assets-desktop.png')
    if (!inside.replaceAll('\\\\', '/').endsWith('/project-testing/artifacts/browser-checks/duration-assets/duration-assets-desktop.png')) {
      throw new Error('inside artifact path was not retained')
    }
    let rejected = false
    try {
      resolveDurationAssetsArtifactPath('../../outside.png')
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error('artifact traversal was accepted')
    const calls = []
    let cleanupFailed = false
    try {
      await runVerifierCleanup({
        writeEvidence: async () => { calls.push('evidence'); throw new Error('evidence failure') },
        closeBrowser: async () => { calls.push('browser') },
        stopVite: async () => { calls.push('vite') },
        removeSignalHandlers: () => { calls.push('signals') },
      })
    } catch {
      cleanupFailed = true
    }
    if (!cleanupFailed || calls.join(',') !== 'evidence,browser,vite,signals') throw new Error(JSON.stringify(calls))
  `)

  assert.equal(result.status, 0, result.stderr)
})

test('duration assets browser verifier reports invalid CLI configuration with a nonzero exit', () => {
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: join(toolsDir, '..', '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      START_VITE: 'false',
      BASE_URL: 'https://example.com',
    },
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /Only loopback Vite hosts are allowed|Only local Vite URLs are allowed/)
})
