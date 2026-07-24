import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(toolsDir, '..', '..')
const clientRoot = join(repoRoot, 'client')
const viteBin = join(clientRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const artifactRoot = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks', 'duration-assets')
const overlapPath = join(artifactRoot, 'duration-assets-overlap.json')
const requireFromServer = createRequire(join(repoRoot, 'server', 'package.json'))
const { chromium } = requireFromServer('playwright')

const port = Number(process.env.PORT || 4197)
const baseUrl = String(process.env.BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '')
const shouldStartVite = process.env.START_VITE !== 'false'
const pagePath = '/admin/duration-assets'
const generatedAt = new Date().toISOString()
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertLocalViteUrl(value) {
  const parsed = new URL(value)
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  assert(parsed.protocol === 'http:', `Only local Vite URLs are allowed: ${value}`)
  assert(localHosts.has(parsed.hostname), `Only loopback Vite hosts are allowed: ${value}`)
  assert(!parsed.username && !parsed.password, 'Local Vite URL must not contain credentials')
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
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
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function startVite() {
  return spawn(process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd: clientRoot,
    env: {
      ...process.env,
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    createdAt: generatedAt,
    updatedAt: generatedAt,
  }
  return {
    generatedAt,
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
    generatedAt,
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
    generatedAt,
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
      generatedAt,
      source: 'intercepted_local_fixture',
      capabilities: [],
      mutationAllowed: false,
    },
  }
}

async function installRoutes(page, diagnostics) {
  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' })
  })
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const requestKey = `${request.method()} ${url.pathname}`
    diagnostics.requests.push(requestKey)

    if (request.method() !== 'GET') {
      diagnostics.mutationAttempts.push(requestKey)
      await route.fulfill(json({ success: false, error: { code: 'LOCAL_BROWSER_WRITE_BLOCKED' } }, 409))
      return
    }
    if (url.pathname === '/api/auth/me') {
      diagnostics.intercepts.auth += 1
      await route.fulfill(json(authPayload()))
      return
    }
    if (url.pathname === '/api/workspace') {
      diagnostics.intercepts.workspace += 1
      await route.fulfill(json(workspacePayload()))
      return
    }
    if (url.pathname === '/api/admin/duration-assets/review-items') {
      diagnostics.intercepts.queue += 1
      await route.fulfill(json(queuePayload()))
      return
    }
    if (url.pathname === '/api/admin/duration-accuracy/summary') {
      diagnostics.intercepts.accuracy += 1
      await route.fulfill(json(accuracyPayload()))
      return
    }
    if (url.pathname === '/api/admin/duration-accuracy/governance-read-model') {
      diagnostics.intercepts.governance += 1
      await route.fulfill(json(governancePayload()))
      return
    }
    if (url.pathname === '/api/v14231-readiness' || url.pathname.startsWith('/api/v14231-readiness/')) {
      diagnostics.intercepts.readiness += 1
      await route.fulfill(json(readinessPayload()))
      return
    }
    await route.fulfill(json({ success: true, data: [] }))
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
      return intersectsViewport(rect)
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
    const intersection = (a, b) => {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return width > 0.5 && height > 0.5 ? { width, height } : null
    }
    const root = document.querySelector('.page-shell')
    if (!root) return { controls: [], issues: [{ kind: 'missing-page-shell' }], longReason: null }
    const selector = 'button, input, select, textarea, [role="tab"], [role="combobox"]'
    const controls = [...root.querySelectorAll(selector)].flatMap((element, index) => {
      const rect = element.getBoundingClientRect()
      if (!isVisible(element, rect)) return []
      return [{
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
        const overlap = intersection(controls[leftIndex].rect, controls[rightIndex].rect)
        if (overlap) {
          issues.push({
            kind: 'visible-control-intersection',
            left: controls[leftIndex].key,
            right: controls[rightIndex].key,
            overlap,
          })
        }
      }
    }
    const reasonCell = [...root.querySelectorAll('td')].find((element) => element.textContent?.trim() === expectedReason)
    let longReason = null
    if (reasonCell) {
      const range = document.createRange()
      range.selectNodeContents(reasonCell)
      const rect = range.getBoundingClientRect()
      if (isVisible(reasonCell, rect)) {
        longReason = toRect(rect)
        for (const control of controls) {
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
    return { controls, issues, longReason }
  }, { expectedReason: longReasonText })
}

async function verifyViewport(browser, name, width, height, overlapEvidence) {
  const page = await browser.newPage({ viewport: { width, height } })
  const diagnostics = {
    requests: [],
    mutationAttempts: [],
    consoleErrors: [],
    pageErrors: [],
    responseFailures: [],
    intercepts: { auth: 0, workspace: 0, queue: 0, accuracy: 0, governance: 0, readiness: 0 },
  }
  page.setDefaultTimeout(30_000)
  await page.addInitScript(({ activeCompanyId }) => {
    const NativeWebSocket = window.WebSocket
    class LocalNotificationSocket extends EventTarget {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3

      constructor(url) {
        super()
        this.url = String(url)
        this.readyState = LocalNotificationSocket.CONNECTING
        this.protocol = ''
        this.extensions = ''
        this.bufferedAmount = 0
        this.binaryType = 'blob'
        this.onopen = null
        this.onmessage = null
        this.onerror = null
        this.onclose = null
        window.setTimeout(() => {
          this.readyState = LocalNotificationSocket.OPEN
          const event = new Event('open')
          this.dispatchEvent(event)
          if (typeof this.onopen === 'function') this.onopen(event)
        }, 0)
      }

      send() {}

      close() {
        this.readyState = LocalNotificationSocket.CLOSED
        const event = new CloseEvent('close', { code: 1000, reason: 'local-browser-check' })
        this.dispatchEvent(event)
        if (typeof this.onclose === 'function') this.onclose(event)
      }
    }
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        return String(args[0]).includes('/ws?channels=')
          ? new LocalNotificationSocket(args[0])
          : Reflect.construct(Target, args)
      },
    })
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
    if (response.url().includes('/api/') && response.status() >= 400) {
      diagnostics.responseFailures.push({ url: response.url(), status: response.status() })
    }
  })
  await installRoutes(page, diagnostics)

  try {
    await page.goto(`${baseUrl}/#${pagePath}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '工期资产治理' }).waitFor({ state: 'visible' })
    await page.getByTestId('duration-assets-table-overflow').waitFor({ state: 'visible' })
    await page.evaluate(async () => {
      const paths = ['/api/auth/me', '/api/workspace', '/api/v14231-readiness']
      const responses = await Promise.all(paths.map((path) => fetch(path)))
      if (responses.some((response) => !response.ok)) throw new Error('Local shell fixture request failed')
    })

    const firstViewport = await page.evaluate(() => {
      const root = document.querySelector('.page-shell')
      const rect = root?.getBoundingClientRect()
      const visibleNodes = root
        ? [...root.querySelectorAll('*')].filter((element) => {
          const nodeRect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return nodeRect.width > 0 && nodeRect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        }).length
        : 0
      return {
        textLength: document.body.innerText.trim().length,
        rootWidth: rect?.width || 0,
        rootHeight: rect?.height || 0,
        visibleNodes,
      }
    })
    assert(firstViewport.textLength > 100, `${name}: first viewport is blank`)
    assert(firstViewport.rootWidth > 0 && firstViewport.rootHeight > 0, `${name}: page shell has no rendered area`)
    assert(firstViewport.visibleNodes > 10, `${name}: insufficient visible content`)

    const tabs = [
      ['审核队列', companyArtifact],
      ['已发布', 'publication-browser-1'],
      ['监控', 'durationSuggestionService:getTaskDurationSuggestion'],
      ['准确度', 'critical_path_cpm'],
    ]
    for (const [tabName, expectedText] of tabs) {
      const tab = page.getByRole('tab', { name: tabName })
      await tab.waitFor({ state: 'visible' })
      await tab.click()
      await page.getByText(expectedText, { exact: true }).first().waitFor({ state: 'visible' })
    }
    await page.getByRole('tab', { name: '审核队列' }).click()

    const sharedRow = page.locator('tr').filter({ hasText: sharedArtifact })
    await sharedRow.waitFor({ state: 'visible' })
    assert((await sharedRow.getByRole('button').count()) === 0, `${name}: shared row exposes mutation controls`)
    assert((await sharedRow.innerText()).includes('只读'), `${name}: shared row is not labeled read-only`)

    await page.getByLabel('原因筛选').fill(longFilterText)
    const filterOverlapState = await collectOverlapState(page)
    let reasonOverlapState = filterOverlapState
    if (!reasonOverlapState.longReason) {
      await page.getByText(longReasonText, { exact: true }).scrollIntoViewIfNeeded()
      reasonOverlapState = await collectOverlapState(page)
    }
    const overlapIssues = [...filterOverlapState.issues, ...reasonOverlapState.issues]
    overlapEvidence.viewports.push({
      name,
      width,
      height,
      filterStateControlCount: filterOverlapState.controls.length,
      reasonStateControlCount: reasonOverlapState.controls.length,
      longReason: reasonOverlapState.longReason,
      issues: overlapIssues,
    })
    assert(reasonOverlapState.longReason, `${name}: long reason text was not visible for overlap inspection`)
    assert(overlapIssues.length === 0, `${name}: visible control overlap detected: ${JSON.stringify(overlapIssues.slice(0, 5))}`)

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    if (width === 390) {
      assert(bodyWidth <= width + 1, `${name}: body width ${bodyWidth} exceeds viewport ${width}`)
    }

    await page.getByLabel('决策备注').fill('Browser-reviewed company evidence')
    const companyRow = page.locator('tr').filter({ hasText: companyArtifact })
    await companyRow.getByRole('button', { name: /批准/ }).click()
    await page.getByTestId('duration-assets-decision-dialog').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.getByTestId('duration-assets-decision-dialog').waitFor({ state: 'hidden' })
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
    await page.waitForTimeout(100)

    const screenshotPath = join(artifactRoot, `duration-assets-${name}.png`)
    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false })
    assert(screenshot.length > 5_000, `${name}: screenshot is unexpectedly blank`)

    for (const [key, count] of Object.entries(diagnostics.intercepts)) {
      assert(count > 0, `${name}: ${key} endpoint was not intercepted`)
    }
    assert(diagnostics.mutationAttempts.length === 0, `${name}: intercepted mutation attempt ${JSON.stringify(diagnostics.mutationAttempts)}`)
    assert(diagnostics.responseFailures.length === 0, `${name}: API response failures ${JSON.stringify(diagnostics.responseFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `${name}: page errors ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `${name}: console errors ${diagnostics.consoleErrors.join(' | ')}`)

    return {
      name,
      width,
      height,
      bodyWidth,
      screenshot: relative(repoRoot, screenshotPath).replace(/\\/g, '/'),
      requests: diagnostics.requests,
      intercepts: diagnostics.intercepts,
    }
  } finally {
    await page.close()
  }
}

async function main() {
  assertLocalViteUrl(baseUrl)
  assert(Number.isInteger(port) && port > 0 && port < 65_536, `Invalid local Vite port: ${port}`)
  await mkdir(artifactRoot, { recursive: true })

  let viteProcess = null
  let browser = null
  let viteOutput = ''
  const overlapEvidence = {
    schemaVersion: 'workbuddy/duration-assets-overlap/v1',
    status: 'running',
    artifactRoot: 'project-testing/artifacts/browser-checks/duration-assets',
    viewports: [],
  }

  try {
    const alreadyReady = await isHttpReady(baseUrl)
    if (!alreadyReady && shouldStartVite) {
      await access(viteBin)
      viteProcess = startVite()
      viteProcess.stdout?.on('data', (chunk) => { viteOutput += String(chunk) })
      viteProcess.stderr?.on('data', (chunk) => { viteOutput += String(chunk) })
    }
    assert(alreadyReady || await waitForHttp(baseUrl), `Local Vite server is not reachable at ${baseUrl}: ${viteOutput.trim()}`)

    const executablePath = resolveBrowserExecutable()
    assert(executablePath, 'No local Chromium-compatible browser executable is available')
    browser = await chromium.launch({ headless: true, executablePath })
    const results = []
    for (const [name, width, height] of viewports) {
      results.push(await verifyViewport(browser, name, width, height, overlapEvidence))
    }
    overlapEvidence.status = 'passed'
    console.log(JSON.stringify({
      status: 'passed',
      baseUrl,
      mutationBoundary: 'intercepted-local-fixtures-no-writes',
      results,
      overlapEvidence: relative(repoRoot, overlapPath).replace(/\\/g, '/'),
    }, null, 2))
  } catch (error) {
    overlapEvidence.status = 'failed'
    overlapEvidence.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    await writeFile(overlapPath, `${JSON.stringify(overlapEvidence, null, 2)}\n`, 'utf8')
    if (browser) await browser.close()
    if (viteProcess) viteProcess.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
