import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(toolsDir, '..', '..')
const clientRoot = join(repoRoot, 'client')
const viteBin = join(clientRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const artifactRoot = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks', 'duration-assets')
const overlapPath = join(artifactRoot, 'duration-assets-overlap.json')
const requireFromServer = createRequire(join(repoRoot, 'server', 'package.json'))
const { chromium } = requireFromServer('playwright')

export const FIXTURE_TIMESTAMP = '2026-04-06T12:00:00.000Z'

const pagePath = '/admin/duration-assets'
const companyId = 'company-browser-1'
const companyArtifact = 'company-asset-browser'
const sharedArtifact = 'shared-asset-browser'
const reasonCodes = [
  'manual_review_requires_current_monitoring_window',
  'canonical_decision_fingerprint_changed_after_replay',
  'rollback_lineage_and_consumer_observation_must_remain_visible',
  'shared_scope_requires_company_admin_read_only_display',
]
const longReasonText = reasonCodes.join(', ')
const longFilterText = 'canonical reason filter with replay lineage monitoring rollback and shared scope review context'
const viewports = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
]
const fixtureKeys = new Map([
  ['/api/auth/me', 'auth'],
  ['/api/workspace', 'workspace'],
  ['/api/admin/duration-assets/review-items?age=all', 'queue'],
  ['/api/admin/duration-accuracy/summary', 'accuracy'],
  ['/api/admin/duration-accuracy/governance-read-model?limit=25', 'governance'],
  ['/api/v14231-readiness', 'readiness'],
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname).replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

export function assertLocalViteUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`Only local Vite URLs are allowed: ${value}`)
  }

  assert(parsed.protocol === 'http:' || parsed.protocol === 'https:', `Only local Vite URLs are allowed: ${value}`)
  assert(isLoopbackHost(parsed.hostname), `Only loopback Vite hosts are allowed: ${value}`)
  assert(!parsed.username && !parsed.password, 'Local Vite URL must not contain credentials')
  return parsed
}

function createVerifierConfig(options = {}) {
  const requestedPort = options.port ?? process.env.PORT ?? 4197
  let port = Number(requestedPort)
  const configuredBaseUrl = options.baseUrl ?? process.env.BASE_URL
  const baseUrlValue = String(configuredBaseUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '')
  const parsedBaseUrl = assertLocalViteUrl(baseUrlValue)

  if (configuredBaseUrl && options.port === undefined && process.env.PORT === undefined && parsedBaseUrl.port) {
    port = Number(parsedBaseUrl.port)
  }

  assert(Number.isInteger(port) && port > 0 && port < 65_536, `Invalid local Vite port: ${requestedPort}`)
  assert(parsedBaseUrl.pathname === '/' && !parsedBaseUrl.search && !parsedBaseUrl.hash, 'Local Vite URL must be an origin URL')

  return {
    baseUrl: parsedBaseUrl.origin,
    port,
    shouldStartVite: options.shouldStartVite ?? process.env.START_VITE !== 'false',
  }
}

export function resolveDurationAssetsArtifactPath(name) {
  const resolved = resolve(artifactRoot, String(name))
  const relativePath = relative(artifactRoot, resolved)
  const escapesArtifactRoot = !relativePath
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || relativePath.startsWith('../')
    || relativePath.startsWith('..\\')
    || relativePath.startsWith(`..${String.fromCharCode(47)}`)
  assert(!escapesArtifactRoot, `Browser artifact path escapes duration-assets root: ${name}`)
  return resolved
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
}

function queuePayload() {
  const base = {
    sourceKey: 'duration-review-source-browser',
    decisionFingerprint: 'a'.repeat(64),
    reviewKind: 'candidate_publication',
    proposalKey: null,
    candidateEventRef: null,
    conflictRef: null,
    publicationKey: null,
    resolvedPublicationKey: null,
    reviewPayload: null,
    status: 'open',
    assignedToUserId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    decisionReason: null,
    resolutionSource: null,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  }
  return {
    generatedAt: FIXTURE_TIMESTAMP,
    total: 2,
    items: [
      {
        ...base,
        id: 'review-company-browser',
        assetKey: 'base_duration_benchmark',
        artifactKey: companyArtifact,
        scope: { level: 'company', companyId },
        reasonCodes,
        canReview: true,
        approvalReady: true,
      },
      {
        ...base,
        id: 'review-shared-browser',
        sourceKey: 'duration-review-source-shared-browser',
        decisionFingerprint: 'b'.repeat(64),
        assetKey: 'standard_work_duration_seed',
        artifactKey: sharedArtifact,
        scope: { level: 'global' },
        reasonCodes: ['shared_scope_reference_only'],
        canReview: false,
        approvalReady: false,
      },
    ],
  }
}

function accuracyPayload() {
  return {
    generatedAt: FIXTURE_TIMESTAMP,
    dataStatus: 'ok',
    sourceErrors: [],
    metrics: [
      {
        engineCode: 'critical_path_cpm',
        sampleCount: 42,
        status: 'backtested',
        metricBasis: 'browser_fixture_exact_scope',
      },
    ],
  }
}

function governancePayload() {
  return {
    generatedAt: FIXTURE_TIMESTAMP,
    sourceStatus: {
      samples: 'available',
      publications: 'available',
      runtimeCalls: 'available',
      observations: 'available',
    },
    sourceErrors: {},
    samples: [],
    publications: [
      {
        publicationKey: 'publication-browser-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'stable',
        monitoringStatus: 'observed',
      },
    ],
    runtimeCalls: [
      {
        id: 'runtime-call-browser-1',
        runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
        consumerKey: 'durationSuggestionService',
        callStatus: 'called',
      },
    ],
    observations: [
      {
        id: 'observation-browser-1',
        publicationKey: 'publication-browser-1',
        assetKey: 'base_duration_benchmark',
        consumerKey: 'planning-duration-tooltip',
        observationStatus: 'observed',
      },
    ],
  }
}

function authPayload() {
  return {
    success: true,
    data: {
      authenticated: true,
      user: {
        id: 'duration-assets-browser-user',
        username: 'duration-assets-browser',
        display_name: 'Duration Assets Browser',
        globalRole: 'company_admin',
        currentCompanyId: companyId,
        currentCompanyRole: 'company_admin',
      },
    },
  }
}

function workspacePayload() {
  const company = { id: companyId, name: 'Browser Company', role: 'company_admin' }
  return {
    success: true,
    data: {
      hasCompany: true,
      currentCompany: company,
      switchableCompanies: [company],
      myProjects: [],
      recentProjects: [],
      companyProjects: [],
      joinableProjects: [],
      pendingInvitations: [],
      joinRequests: [],
      demoEntry: { available: false, label: '' },
      emptyStateReason: null,
    },
  }
}

function readinessPayload() {
  return {
    success: true,
    data: {
      generatedAt: FIXTURE_TIMESTAMP,
      source: 'intercepted_local_fixture',
      capabilities: [],
      mutationAllowed: false,
    },
  }
}

function fixturePayload(key) {
  switch (key) {
    case 'auth': return authPayload()
    case 'workspace': return workspacePayload()
    case 'queue': return queuePayload()
    case 'accuracy': return accuracyPayload()
    case 'governance': return governancePayload()
    case 'readiness': return readinessPayload()
    default: throw new Error(`Unknown duration-assets fixture key: ${key}`)
  }
}

function fixtureKeyForUrl(url) {
  return fixtureKeys.get(`${url.pathname}${url.search}`) ?? null
}

export function classifyDurationAssetsRequestPolicy({ baseUrl, method = 'GET', url }) {
  const base = assertLocalViteUrl(baseUrl)
  let target
  try {
    target = new URL(url)
  } catch {
    return { action: 'block', reason: 'malformed_request_url', fixture: null }
  }

  const normalizedMethod = String(method).toUpperCase()
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { action: 'block', reason: 'unsupported_request_protocol', fixture: null }
  }
  if (!isLoopbackHost(target.hostname)) {
    return { action: 'block', reason: 'external_request', fixture: null }
  }
  if (target.origin !== base.origin) {
    return { action: 'block', reason: 'loopback_origin_mismatch', fixture: null }
  }
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return { action: 'block', reason: 'mutation_request', fixture: null }
  }
  if (target.pathname.startsWith('/api/')) {
    const fixture = normalizedMethod === 'GET' ? fixtureKeyForUrl(target) : null
    if (fixture) return { action: 'fulfill', reason: 'fixture_api_get', fixture }
    return { action: 'block', reason: 'unknown_api_get', fixture: null }
  }
  return { action: 'allow', reason: 'loopback_vite_resource', fixture: null }
}

function pathToFileUrl(filePath) {
  return new URL(`file://${resolve(filePath).replace(/\\/g, '/')}`).href
}

function buildDurationAssetsUrl(baseUrl) {
  return `${baseUrl}/#${pagePath}`
}

export function assertDurationAssetsNavigationUrl(value, baseUrl, phase) {
  const target = assertLocalViteUrl(value)
  const base = assertLocalViteUrl(baseUrl)
  assert(target.origin === base.origin, `${phase}: navigation escaped the configured local Vite origin: ${value}`)
  assert(target.pathname === '/', `${phase}: navigation path is not the local Vite document: ${value}`)
  assert(!target.search, `${phase}: navigation added an outer query: ${value}`)
  const hashRoute = new URL(target.hash.slice(1), 'http://duration-assets.local')
  assert(hashRoute.pathname === pagePath, `${phase}: navigation did not stay on ${pagePath}: ${value}`)
  const queryKeys = [...hashRoute.searchParams.keys()]
  assert(queryKeys.every((key) => key === 'tab'), `${phase}: navigation added an unsupported hash query: ${value}`)
  assert(hashRoute.searchParams.getAll('tab').length <= 1, `${phase}: navigation duplicated the tab query: ${value}`)
  const tab = hashRoute.searchParams.get('tab')
  assert(!tab || ['queue', 'published', 'monitoring', 'accuracy'].includes(tab), `${phase}: navigation selected an unknown tab: ${value}`)
  return target
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
    await new Promise((wait) => setTimeout(wait, 300))
  }
  return false
}

function startVite(port) {
  return spawn(process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd: clientRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE,
    chromium.executablePath(),
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : null,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) || null
}

function recordBlockedRequest(diagnostics, request, policy) {
  const entry = {
    method: request.method(),
    url: request.url(),
    reason: policy.reason,
  }
  diagnostics.blockedRequests.push(entry)
  if (entry.method !== 'GET' && entry.method !== 'HEAD') diagnostics.mutationAttempts.push(entry)
}

function recordBlockedRedirect(diagnostics, sourceUrl, location, config) {
  let target
  try {
    target = new URL(location, sourceUrl)
  } catch {
    diagnostics.redirectTargets.push({ sourceUrl, location, reason: 'malformed_redirect_target' })
    return true
  }

  const policy = classifyDurationAssetsRequestPolicy({ baseUrl: config.baseUrl, method: 'GET', url: target.href })
  if (policy.action === 'block') {
    diagnostics.redirectTargets.push({ sourceUrl, location: target.href, reason: policy.reason })
    return true
  }
  return false
}

function isOfflineTransformedResource(url) {
  return url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/src/index.css'
    || url.pathname === '/src/App.tsx'
    || url.pathname === '/src/hooks/useStore.ts'
    || url.pathname === '/@vite/client'
}

export function transformOfflineViteResource(url, body, diagnostics) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const withoutExternalFonts = body.replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/gi, '')
    const withoutHmrClient = withoutExternalFonts.replace(/<script\b[^>]*\bsrc=["'][^"']*\/@vite\/client[^"']*["'][^>]*><\/script>\s*/gi, '')
    if (withoutHmrClient !== body) diagnostics.transforms.document += 1
    return withoutHmrClient
  }
  if (url.pathname === '/src/index.css') {
    const withoutExternalFonts = body.replace(/@import\s+url\(["']https:\/\/fonts\.googleapis\.com[^)]*\);?\s*/gi, '')
    if (withoutExternalFonts !== body) diagnostics.transforms.stylesheet += 1
    return withoutExternalFonts
  }
  if (url.pathname === '/src/App.tsx') {
    const projectSync = /(function syncProjectsForKey\([^)]*\)\s*\{)[\s\S]*?(\n\}\s*\nfunction isDashboardProjectRoutePath)/
    assert(projectSync.test(body), 'Local Vite App source no longer contains its expected project sync function')
    diagnostics.transforms.projectSync += 1
    return body.replace(projectSync, '$1\n  return Promise.resolve([])$2')
  }
  if (url.pathname === '/src/hooks/useStore.ts') {
    assert(/return\s+["']websocket["']/.test(body), 'Local Vite connection-mode source no longer contains its expected websocket default')
    diagnostics.transforms.connectionMode += 1
    return body.replace(/return\s+["']websocket["']/, "return 'polling'")
  }
  if (url.pathname === '/@vite/client') {
    diagnostics.transforms.hmrClient = (diagnostics.transforms.hmrClient ?? 0) + 1
    return [
      'const noop = () => {}',
      'const styleNodes = new Map()',
      'const hotContext = { accept: noop, acceptExports: noop, dispose: noop, prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} }',
      'export function createHotContext() { return hotContext }',
      'export function injectQuery(url, queryToInject) {',
      "  if (url[0] !== '.' && url[0] !== '/') return url",
      "  const pathname = url.replace(/[?#].*$/, '')",
      "  const { search, hash } = new URL(url, 'http://vite.local')",
      "  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '')",
      '}',
      'export function updateStyle(id, content) {',
      '  let style = styleNodes.get(id)',
      '  if (!style) {',
      "    style = document.createElement('style')",
      "    style.setAttribute('data-vite-dev-id', id)",
      '    document.head.appendChild(style)',
      '    styleNodes.set(id, style)',
      '  }',
      '  style.textContent = content',
      '}',
      'export function removeStyle(id) {',
      '  const style = styleNodes.get(id)',
      '  if (style) style.remove()',
      '  styleNodes.delete(id)',
      '}',
      'export class ErrorOverlay {}',
    ].join('\n')
  }
  return body
}

async function fulfillOfflineViteResource(route, url, diagnostics, config) {
  const response = await route.fetch({ maxRedirects: 0 })
  const status = response.status()
  if (status >= 300 && status < 400) {
    const location = response.headers().location
    const blocked = location && recordBlockedRedirect(diagnostics, url.href, location, config)
    if (blocked) {
      await route.abort('blockedbyclient')
      return
    }
    await route.fulfill({ response })
    return
  }

  const body = transformOfflineViteResource(url, await response.text(), diagnostics)
  await route.fulfill({
    status,
    contentType: response.headers()['content-type'] || 'text/plain; charset=utf-8',
    body,
  })
}

async function installRoutes(page, config, diagnostics) {
  await page.routeWebSocket('**/*', async (websocket) => {
    diagnostics.webSocketAttempts.push({ url: websocket.url(), reason: 'websocket_creation_blocked' })
    await websocket.close({ code: 1008, reason: 'local-browser-network-policy' })
  })

  await page.route('**/*', async (route) => {
    const request = route.request()
    const requestUrl = new URL(request.url())
    const policy = classifyDurationAssetsRequestPolicy({
      baseUrl: config.baseUrl,
      method: request.method(),
      url: requestUrl.href,
    })
    diagnostics.requests.push(`${request.method()} ${requestUrl.pathname}${requestUrl.search}`)

    if (policy.action === 'block') {
      recordBlockedRequest(diagnostics, request, policy)
      await route.abort('blockedbyclient')
      return
    }
    if (policy.action === 'fulfill') {
      diagnostics.intercepts[policy.fixture] += 1
      await route.fulfill(json(fixturePayload(policy.fixture)))
      return
    }
    if (request.method() === 'GET' && isOfflineTransformedResource(requestUrl)) {
      await fulfillOfflineViteResource(route, requestUrl, diagnostics, config)
      return
    }
    await route.continue()
  })
}

async function collectOverlapState(page) {
  return page.evaluate(({ expectedReason }) => {
    const intersectsViewport = (rect) => (
      rect.width > 0
      && rect.height > 0
      && rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight
    )
    const isVisible = (element, rect) => {
      const style = window.getComputedStyle(element)
      return element.getClientRects().length > 0
        && intersectsViewport(rect)
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && !element.closest('[hidden], [aria-hidden="true"]')
    }
    const toRect = (rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })
    const intersection = (left, right) => {
      const width = Math.min(left.right, right.right) - Math.max(left.left, right.left)
      const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
      return width > 1 && height > 1 && width * height > 4 ? { width, height } : null
    }
    const pageShell = document.querySelector('.page-shell')
    if (!pageShell) return { controls: [], issues: [{ kind: 'missing-page-shell' }], longReason: null }

    const selector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="combobox"]',
      '[role="textbox"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')
    const controls = [...document.body.querySelectorAll(selector)].flatMap((element, index) => {
      const rect = element.getBoundingClientRect()
      if (element.getAttribute('data-overlap-ignore') === 'true'
        || element.getAttribute('role') === 'tabpanel'
        || !isVisible(element, rect)) return []
      return [{
        element,
        key: element.getAttribute('aria-label')
          || element.getAttribute('data-testid')
          || element.id
          || element.textContent?.trim().slice(0, 80)
          || `${element.tagName.toLowerCase()}-${index}`,
        rect: toRect(rect),
      }]
    })

    const issues = []
    for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
        const left = controls[leftIndex]
        const right = controls[rightIndex]
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue
        const overlap = intersection(left.rect, right.rect)
        if (overlap) {
          issues.push({
            kind: 'visible-control-intersection',
            left: left.key,
            right: right.key,
            overlap,
          })
        }
      }
    }

    const reasonCell = [...document.querySelectorAll('td')].find((element) => element.textContent?.trim() === expectedReason)
    let longReason = null
    if (reasonCell) {
      const range = document.createRange()
      range.selectNodeContents(reasonCell)
      const rect = range.getBoundingClientRect()
      if (isVisible(reasonCell, rect)) {
        longReason = toRect(rect)
        for (const control of controls) {
          if (control.element.contains(reasonCell) || reasonCell.contains(control.element)) continue
          const overlap = intersection(longReason, control.rect)
          if (overlap) {
            issues.push({
              kind: 'long-reason-control-intersection',
              control: control.key,
              overlap,
            })
          }
        }
      }
    }

    return {
      controls: controls.map(({ key, rect }) => ({ key, rect })),
      issues,
      longReason,
    }
  }, { expectedReason: longReasonText })
}

async function collectFirstViewportState(page) {
  return page.evaluate(() => {
    const intersectsViewport = (rect) => (
      rect.width > 0
      && rect.height > 0
      && rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight
    )
    const root = document.querySelector('.page-shell')
    if (!root) return { pageShellIntersectsViewport: false, meaningfulVisibleDescendants: 0 }
    const rootRect = root.getBoundingClientRect()
    const meaningfulSelector = 'h1, h2, h3, p, td, th, label, button, a[href], input, select, textarea, [role], [aria-label]'
    const meaningfulVisibleDescendants = [...root.querySelectorAll(meaningfulSelector)].filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const text = element.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('value') || ''
      return Boolean(text)
        && intersectsViewport(rect)
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && !element.closest('[hidden], [aria-hidden="true"]')
    }).length
    return {
      pageShellIntersectsViewport: intersectsViewport(rootRect),
      meaningfulVisibleDescendants,
    }
  })
}

async function restoreShellScroll(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 })
    for (const element of document.querySelectorAll('*')) {
      const style = window.getComputedStyle(element)
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) element.scrollTop = 0
      if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth) element.scrollLeft = 0
    }
    const table = document.querySelector('[data-testid="duration-assets-table-overflow"]')
    if (table) table.scrollLeft = 0
  })
}

async function verifyViewport(browser, config, name, width, height, overlapEvidence) {
  let context = null
  let page = null
  const diagnostics = {
    requests: [],
    mutationAttempts: [],
    blockedRequests: [],
    redirectTargets: [],
    webSocketAttempts: [],
    consoleErrors: [],
    pageErrors: [],
    responseFailures: [],
    transforms: { document: 0, stylesheet: 0, connectionMode: 0, projectSync: 0, hmrClient: 0 },
    intercepts: { auth: 0, workspace: 0, queue: 0, accuracy: 0, governance: 0, readiness: 0 },
  }

  try {
    context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: 'block',
    })
    page = await context.newPage()
    page.setDefaultTimeout(30_000)
    await page.clock.setFixedTime(FIXTURE_TIMESTAMP)
    await page.addInitScript(({ activeCompanyId }) => {
      window.localStorage.setItem('auth_token', 'duration-assets-browser-token')
      window.localStorage.setItem('access_token', 'duration-assets-browser-token')
      window.localStorage.setItem('current_company_id', activeCompanyId)
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    }, { activeCompanyId: companyId })
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 300 && response.status() < 400) {
        const location = response.headers().location
        if (location) recordBlockedRedirect(diagnostics, response.url(), location, config)
      }
      if (response.status() >= 400) {
        diagnostics.responseFailures.push({ url: response.url(), status: response.status() })
      }
    })
    await installRoutes(page, config, diagnostics)

    const initialUrl = buildDurationAssetsUrl(config.baseUrl)
    assertDurationAssetsNavigationUrl(initialUrl, config.baseUrl, `${name}: initial`)
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded' })
    assertDurationAssetsNavigationUrl(page.url(), config.baseUrl, `${name}: post-navigation`)
    try {
      await page.locator('.page-shell').waitFor({ state: 'visible' })
    } catch (error) {
      throw new Error([
        error instanceof Error ? error.message : String(error),
        `consoleErrors=${JSON.stringify(diagnostics.consoleErrors)}`,
        `pageErrors=${JSON.stringify(diagnostics.pageErrors)}`,
        `responseFailures=${JSON.stringify(diagnostics.responseFailures)}`,
        `requests=${JSON.stringify(diagnostics.requests)}`,
      ].join('; '))
    }
    await page.getByTestId('duration-assets-table-overflow').waitFor({ state: 'visible' })
    await page.evaluate(async () => {
      const paths = ['/api/auth/me', '/api/workspace', '/api/v14231-readiness']
      const responses = await Promise.all(paths.map((path) => fetch(path)))
      if (responses.some((response) => !response.ok)) throw new Error('Local shell fixture request failed')
    })

    const firstViewport = await collectFirstViewportState(page)
    assert(firstViewport.pageShellIntersectsViewport, `${name}: page shell does not intersect the first viewport`)
    assert(firstViewport.meaningfulVisibleDescendants > 5, `${name}: first viewport lacks meaningful visible descendants`)

    const tabs = page.locator('.page-shell [role="tab"]')
    const tabExpectations = [companyArtifact, 'publication-browser-1', 'durationSuggestionService:getTaskDurationSuggestion', 'critical_path_cpm']
    assert((await tabs.count()) === tabExpectations.length, `${name}: duration asset tabs are incomplete`)
    for (const [index, expectedText] of tabExpectations.entries()) {
      await tabs.nth(index).click()
      await page.getByText(expectedText, { exact: true }).first().waitFor({ state: 'visible' })
    }
    await tabs.nth(0).click()

    const sharedRow = page.locator('tr').filter({ hasText: sharedArtifact })
    await sharedRow.waitFor({ state: 'visible' })
    assert((await sharedRow.getByRole('button').count()) === 0, `${name}: shared row exposes mutation controls`)
    assert((await sharedRow.innerText()).includes(sharedArtifact), `${name}: shared row is not visible as a read-only item`)

    const filterInputs = page.locator('.page-shell input:not(#duration-asset-decision-notes)')
    assert((await filterInputs.count()) >= 2, `${name}: duration asset filter controls are missing`)
    await filterInputs.nth(1).fill(longFilterText)
    const filterOverlapState = await collectOverlapState(page)
    let reasonOverlapState = filterOverlapState
    if (!reasonOverlapState.longReason) {
      await page.getByText(longReasonText, { exact: true }).scrollIntoViewIfNeeded()
      reasonOverlapState = await collectOverlapState(page)
    }
    assert(reasonOverlapState.longReason, `${name}: long reason text was not visible for overlap inspection`)

    await restoreShellScroll(page)
    const bodyLayout = await page.evaluate(() => {
      const viewportWidth = window.innerWidth
      const tableContainer = document.querySelector('[data-testid="duration-assets-table-overflow"]')
      const tableContainerRect = tableContainer?.getBoundingClientRect()
      const tableContainerStyle = tableContainer ? window.getComputedStyle(tableContainer) : null
      const tableScrollContainer = tableContainer?.querySelector('div.relative.w-full.overflow-auto')
      const tableScrollContainerStyle = tableScrollContainer ? window.getComputedStyle(tableScrollContainer) : null
      const pageShellRect = document.querySelector('.page-shell')?.getBoundingClientRect()
      const offenders = [...document.body.querySelectorAll('*')].map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      }).filter((item) => item.right > viewportWidth + 1 || item.left < -1)
        .sort((left, right) => right.width - left.width)
        .slice(0, 12)
      return {
        bodyWidth: document.body.scrollWidth,
        viewportWidth,
        scrollX: window.scrollX,
        pageShellWithinViewport: Boolean(pageShellRect)
          && pageShellRect.left >= -1
          && pageShellRect.right <= viewportWidth + 1,
        tableContainer: tableContainerRect ? {
          left: Math.round(tableContainerRect.left),
          right: Math.round(tableContainerRect.right),
          width: Math.round(tableContainerRect.width),
          overflowX: tableContainerStyle?.overflowX,
          scrollWidth: tableContainer?.scrollWidth,
          clientWidth: tableContainer?.clientWidth,
          scrollContainerOverflowX: tableScrollContainerStyle?.overflowX,
          scrollContainerScrollWidth: tableScrollContainer?.scrollWidth,
          scrollContainerClientWidth: tableScrollContainer?.clientWidth,
        } : null,
        offenders,
      }
    })
    const bodyWidth = bodyLayout.bodyWidth
    if (width === 390) {
      assert(bodyWidth <= width + 1, `${name}: body width ${bodyWidth} exceeds viewport ${width}: ${JSON.stringify(bodyLayout)}`)
      assert(bodyLayout.pageShellWithinViewport, `${name}: page shell exceeds viewport: ${JSON.stringify(bodyLayout)}`)
    }

    await page.locator('#duration-asset-decision-notes').fill('Browser-reviewed company evidence')
    const companyRow = page.locator('tr').filter({ hasText: companyArtifact })
    const companyButtons = companyRow.getByRole('button')
    assert((await companyButtons.count()) > 0, `${name}: company row does not expose an approval control`)
    await companyButtons.first().click()
    await page.getByTestId('duration-assets-decision-dialog').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.getByTestId('duration-assets-decision-dialog').waitFor({ state: 'hidden' })
    await restoreShellScroll(page)
    await page.waitForTimeout(100)

    const postDialogOverlapState = await collectOverlapState(page)
    const overlapIssues = [
      ...filterOverlapState.issues,
      ...reasonOverlapState.issues,
      ...postDialogOverlapState.issues,
    ]
    overlapEvidence.viewports.push({
      name,
      width,
      height,
      filterStateControlCount: filterOverlapState.controls.length,
      reasonStateControlCount: reasonOverlapState.controls.length,
      postDialogControlCount: postDialogOverlapState.controls.length,
      longReason: reasonOverlapState.longReason,
      issues: overlapIssues,
    })
    assert(overlapIssues.length === 0, `${name}: visible control overlap detected: ${JSON.stringify(overlapIssues.slice(0, 5))}`)

    const screenshotPath = resolveDurationAssetsArtifactPath(`duration-assets-${name}.png`)
    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false })
    assert(screenshot.length > 5_000, `${name}: screenshot is unexpectedly blank`)
    assertDurationAssetsNavigationUrl(page.url(), config.baseUrl, `${name}: final`)

    for (const [key, count] of Object.entries(diagnostics.intercepts)) {
      assert(count > 0, `${name}: ${key} endpoint was not intercepted`)
    }
    assert(diagnostics.transforms.connectionMode > 0, `${name}: local connection mode was not made network-free`)
    assert(diagnostics.transforms.projectSync > 0, `${name}: local App project sync was not made network-free`)
    assert(diagnostics.mutationAttempts.length === 0, `${name}: intercepted mutation attempt ${JSON.stringify(diagnostics.mutationAttempts)}`)
    assert(diagnostics.blockedRequests.length === 0, `${name}: blocked request ${JSON.stringify(diagnostics.blockedRequests)}`)
    assert(diagnostics.redirectTargets.length === 0, `${name}: blocked redirect target ${JSON.stringify(diagnostics.redirectTargets)}`)
    assert(diagnostics.webSocketAttempts.length === 0, `${name}: blocked WebSocket creation ${JSON.stringify(diagnostics.webSocketAttempts)}`)
    assert(diagnostics.responseFailures.length === 0, `${name}: response failures ${JSON.stringify(diagnostics.responseFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `${name}: page errors ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `${name}: console errors ${diagnostics.consoleErrors.join(' | ')}`)

    return {
      name,
      width,
      height,
      bodyWidth,
      initialUrl,
      finalUrl: page.url(),
      screenshot: relative(repoRoot, screenshotPath).replace(/\\/g, '/'),
      requests: diagnostics.requests,
      intercepts: diagnostics.intercepts,
    }
  } finally {
    try {
      if (page) await page.close()
    } finally {
      if (context) await context.close()
    }
  }
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolveWait) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.removeListener('exit', onExit)
      child.removeListener('error', onExit)
      resolveWait(result)
    }
    const onExit = () => finish(true)
    const timeout = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
    child.once('error', onExit)
  })
}

async function forceTerminateProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    await new Promise((resolveForce) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const timeout = setTimeout(resolveForce, 5_000)
      killer.once('exit', () => {
        clearTimeout(timeout)
        resolveForce()
      })
      killer.once('error', () => {
        clearTimeout(timeout)
        resolveForce()
      })
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

async function stopViteProcess(viteProcess, options = {}) {
  if (!viteProcess || viteProcess.exitCode !== null || viteProcess.signalCode !== null) return
  const graceTimeoutMs = options.graceTimeoutMs ?? 5_000
  const forceTimeoutMs = options.forceTimeoutMs ?? 5_000

  try {
    if (process.platform !== 'win32' && viteProcess.pid) {
      process.kill(-viteProcess.pid, 'SIGTERM')
    } else {
      viteProcess.kill('SIGTERM')
    }
  } catch {
    viteProcess.kill('SIGTERM')
  }

  if (await waitForChildExit(viteProcess, graceTimeoutMs)) return
  await forceTerminateProcessTree(viteProcess)
  assert(await waitForChildExit(viteProcess, forceTimeoutMs), `Vite process ${viteProcess.pid ?? 'unknown'} did not exit after forced termination`)
}

function createOnceAsync(callback) {
  let pending = null
  return () => {
    if (!pending) pending = Promise.resolve().then(callback)
    return pending
  }
}

export function installVerifierSignalHandlers(cleanup, signalTarget = process) {
  let handling = false
  const handle = (signal) => {
    if (handling) return
    handling = true
    void cleanup().catch((error) => {
      console.error(error)
    }).finally(() => {
      signalTarget.exitCode = signal === 'SIGINT' ? 130 : 143
      if (signalTarget === process) process.exit(signalTarget.exitCode)
    })
  }
  const handlers = new Map([
    ['SIGINT', () => handle('SIGINT')],
    ['SIGTERM', () => handle('SIGTERM')],
  ])
  for (const [signal, handler] of handlers) signalTarget.once(signal, handler)
  return () => {
    for (const [signal, handler] of handlers) signalTarget.removeListener(signal, handler)
  }
}

export async function runVerifierCleanup({ writeEvidence, closeBrowser, stopVite, removeSignalHandlers }) {
  const failures = []
  const runStep = async (step) => {
    if (!step) return
    try {
      await step()
    } catch (error) {
      failures.push(error)
    }
  }

  try {
    await runStep(writeEvidence)
  } finally {
    try {
      await runStep(closeBrowser)
    } finally {
      try {
        await runStep(stopVite)
      } finally {
        await runStep(removeSignalHandlers)
      }
    }
  }

  if (failures.length) throw new AggregateError(failures, 'Duration-assets verifier cleanup failed')
}

export async function runDurationAssetsAdminUiVerifier(options = {}) {
  const config = createVerifierConfig(options)
  const safeOverlapPath = resolveDurationAssetsArtifactPath('duration-assets-overlap.json')
  await mkdir(artifactRoot, { recursive: true })

  let viteProcess = null
  let browser = null
  let viteOutput = ''
  let runError = null
  let removeSignalHandlers = () => {}
  const overlapEvidence = {
    schemaVersion: 'workbuddy/duration-assets-overlap/v1',
    status: 'running',
    artifactRoot: 'project-testing/artifacts/browser-checks/duration-assets',
    viewports: [],
  }
  const cleanup = createOnceAsync(() => runVerifierCleanup({
    writeEvidence: () => writeFile(safeOverlapPath, `${JSON.stringify(overlapEvidence, null, 2)}\n`, 'utf8'),
    closeBrowser: () => browser?.close(),
    stopVite: () => stopViteProcess(viteProcess),
    removeSignalHandlers: () => removeSignalHandlers(),
  }))
  removeSignalHandlers = installVerifierSignalHandlers(cleanup)

  try {
    const alreadyReady = await isHttpReady(config.baseUrl)
    if (!alreadyReady && config.shouldStartVite) {
      await access(viteBin)
      viteProcess = startVite(config.port)
      viteProcess.stdout?.on('data', (chunk) => { viteOutput += String(chunk) })
      viteProcess.stderr?.on('data', (chunk) => { viteOutput += String(chunk) })
    }
    assert(alreadyReady || await waitForHttp(config.baseUrl), `Local Vite server is not reachable at ${config.baseUrl}: ${viteOutput.trim()}`)

    const executablePath = resolveBrowserExecutable()
    assert(executablePath, 'No local Chromium-compatible browser executable is available')
    browser = await chromium.launch({ headless: true, executablePath })
    const results = []
    for (const [name, width, height] of viewports) {
      results.push(await verifyViewport(browser, config, name, width, height, overlapEvidence))
    }
    overlapEvidence.status = 'passed'
    return {
      status: 'passed',
      baseUrl: config.baseUrl,
      mutationBoundary: 'intercepted-local-fixtures-no-writes',
      results,
      overlapEvidence: relative(repoRoot, overlapPath).replace(/\\/g, '/'),
    }
  } catch (error) {
    runError = error
    overlapEvidence.status = 'failed'
    overlapEvidence.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    let cleanupError = null
    try {
      await cleanup()
    } catch (error) {
      cleanupError = error
    }
    if (cleanupError && !runError) throw cleanupError
  }
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  runDurationAssetsAdminUiVerifier().then((result) => {
    console.log(JSON.stringify(result, null, 2))
  }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
