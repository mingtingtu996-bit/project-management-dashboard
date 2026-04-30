import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const distIndex = join(repoRoot, 'client', 'dist', 'index.html')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')
const outputDir = join(repoRoot, process.env.UIUX_VISUAL_OUTPUT_DIR || 'artifacts/uiux-visual')
const manifestOutPath = join(outputDir, 'visual-manifest.json')

const port = Number(process.env.PORT || 4173)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldStartPreview = process.env.VISUAL_START_PREVIEW !== 'false'
const currentMonth = process.env.UIUX_VISUAL_MONTH || new Date().toISOString().slice(0, 7)

function parseFilter(value) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? new Set(items) : null
}

const viewportFilter = parseFilter(process.env.UIUX_VISUAL_VIEWPORTS)
const stateFilter = parseFilter(process.env.UIUX_VISUAL_STATES)

const allViewports = [
  { key: 'desktop-1440', width: 1440, height: 900, purpose: 'standard desktop' },
  { key: 'desktop-1366', width: 1366, height: 768, purpose: 'low-height desktop' },
  { key: 'tablet-768', width: 768, height: 1024, purpose: 'tablet wrapping' },
  { key: 'mobile-390', width: 390, height: 844, purpose: 'mobile dialogs and overflow' },
]

const viewports = viewportFilter
  ? allViewports.filter((viewport) => viewportFilter.has(viewport.key))
  : allViewports

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function rel(filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
}

function route(pathname) {
  return `${baseUrl}/#${pathname}`
}

function projectRoute(projectId, pathname) {
  return `/projects/${projectId}${pathname}`
}

function jsonHeaders(body = false) {
  return body ? { 'Content-Type': 'application/json' } : undefined
}

function unwrapApiData(json) {
  if (!json) return null
  if (json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed')
  }
  return json.data ?? json
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { response, json, text }
}

async function apiRequest(pathname, { method = 'GET', body } = {}) {
  const { response, json, text } = await fetchJson(`${apiBaseUrl}${pathname}`, {
    method,
    headers: jsonHeaders(Boolean(body)),
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok || json?.success === false) {
    throw new Error(json?.error?.message || json?.message || text || `API ${method} ${pathname} failed with ${response.status}`)
  }

  return unwrapApiData(json)
}

async function login(account) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: {
      username: account.username,
      password: account.password,
    },
  })
  assert(data?.token, `Login did not return token for ${account.username}`)
  return data.token
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs = 30000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

async function ensureDistExists() {
  try {
    await access(distIndex, constants.R_OK)
  } catch {
    throw new Error('client/dist/index.html is missing. Run npm run build --workspace=client before visual verification.')
  }
}

function startPreviewServer() {
  const child = spawn(process.execPath, [join(scriptsDir, 'serve-client-dist.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      API_HOST: new URL(apiBaseUrl).hostname,
      API_PORT: new URL(apiBaseUrl).port || '80',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-visual:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-visual:preview] ${chunk}`))
  return child
}

function isIgnorableConsoleError(message) {
  if (message === 'Failed to load resource: net::ERR_CONNECTION_CLOSED') return true
  if (message === 'Failed to load resource: net::ERR_PROXY_CONNECTION_FAILED') return true
  return (
    typeof message === 'string'
    && message.includes("WebSocket connection to 'ws://")
    && message.includes('/ws?')
    && message.includes('ERR_CONNECTION_REFUSED')
  )
}

function attachDiagnostics(page, diagnostics) {
  function describeRequest(request) {
    const headers = request.headers()
    const postData = request.postData()
    return {
      method: request.method(),
      contentType: headers['content-type'],
      postData: postData ? postData.slice(0, 1000) : null,
    }
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableConsoleError(text)) diagnostics.consoleErrors.push(text)
    }
  })

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message)
  })

  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/')) return
    diagnostics.apiFailures.push({
      type: 'requestfailed',
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown',
      request: describeRequest(request),
    })
  })

  page.on('response', (response) => {
    if (!response.url().includes('/api/')) return
    if (response.status() < 400) return
    const request = response.request()
    diagnostics.apiFailures.push({
      type: 'response',
      url: response.url(),
      status: response.status(),
      request: describeRequest(request),
    })
  })
}

async function newContext(browser, token, viewport, { onboardingComplete = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    locale: 'zh-CN',
  })

  await context.addInitScript(({ authToken, completeOnboarding }) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
    if (completeOnboarding) {
      window.localStorage.setItem('onboarding_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    } else {
      window.localStorage.removeItem('onboarding_completed')
      window.localStorage.removeItem('onboarding_daily_workflow_dismissed')
    }
  }, { authToken: token, completeOnboarding: onboardingComplete })

  return context
}

async function waitForAny(page, selectors, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first()
      if (await locator.count()) {
        try {
          await locator.waitFor({ state: 'visible', timeout: 500 })
          return selector
        } catch {
          // keep polling
        }
      }
    }
    await page.waitForTimeout(160)
  }
  throw new Error(`Timed out waiting for any selector: ${selectors.join(', ')}`)
}

async function waitForAll(page, selectors, timeout = 30000) {
  for (const selector of selectors) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout })
  }
}

async function runVisualChecks(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    )
    const main = document.querySelector('main')
    const mainOverflow = main ? main.scrollWidth - main.clientWidth : 0

    function isVisible(element) {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
      )
    }

    function hasOverflowContainer(element) {
      let current = element.parentElement
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current)
        const overflowX = style.overflowX
        if (['auto', 'scroll', 'hidden', 'clip'].includes(overflowX)) return true
        current = current.parentElement
      }
      return false
    }

    const outOfViewport = Array.from(document.querySelectorAll('body *'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => {
        const tagName = element.tagName.toLowerCase()
        if (['svg', 'path', 'g', 'line', 'rect', 'circle', 'defs', 'clipPath'].includes(tagName)) return false
        if (element.closest('[data-radix-popper-content-wrapper]')) return false
        if (hasOverflowContainer(element)) return false
        const rect = element.getBoundingClientRect()
        return rect.left < -2 || rect.right > viewportWidth + 2
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute('data-testid'),
          className: String(element.getAttribute('class') || '').slice(0, 140),
          text: String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })

    const overflowingButtons = Array.from(document.querySelectorAll('button, a[role="button"], [data-slot="button"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => String(element.textContent || '').replace(/\s+/g, '').length > 0)
      .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        text: String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))

    return {
      viewportWidth,
      documentWidth,
      horizontalOverflowPx: documentWidth - viewportWidth,
      mainOverflowPx: mainOverflow,
      outOfViewport,
      overflowingButtons,
    }
  })
}

async function takeCheckedScreenshot(page, path) {
  await page.screenshot({ path, fullPage: true })
  const fileStat = await stat(path)
  assert(fileStat.size > 4096, `Screenshot appears too small or blank: ${rel(path)} (${fileStat.size} bytes)`)
}

function mainPages(projectId) {
  return [
    {
      key: 'company-cockpit',
      name: 'CompanyCockpit',
      session: 'admin',
      path: '/company',
      any: ['[data-testid="company-cockpit-page"]'],
      must: ['[data-testid="company-project-grid"]'],
    },
    {
      key: 'dashboard',
      name: 'Dashboard',
      path: projectRoute(projectId, '/dashboard'),
      any: ['[data-testid="dashboard-page"]'],
      must: ['[data-testid="dashboard-hero-cards"]', '[data-testid="dashboard-live-panel"]'],
      check: async (page) => {
        const count = await page.locator('[data-testid^="dashboard-hero-card-"]').count()
        assert(count === 4, `Dashboard expected 4 metric cards, got ${count}`)
      },
    },
    {
      key: 'reports',
      name: 'Reports',
      path: projectRoute(projectId, '/reports?view=progress'),
      any: ['[data-testid="reports-module-tabs"]'],
      must: ['[data-testid="reports-current-metrics"]', '[data-testid="reports-trend-panel"]'],
    },
    {
      key: 'risk-management',
      name: 'RiskManagement',
      path: projectRoute(projectId, '/risks'),
      any: ['[data-testid="risk-summary-band"]'],
      must: ['[data-testid="risk-chain-workspace"]'],
    },
    {
      key: 'gantt-view',
      name: 'GanttView',
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      must: ['[data-testid="gantt-task-rows"]'],
    },
    {
      key: 'planning-workspace',
      name: 'PlanningWorkspace',
      path: projectRoute(projectId, '/planning'),
      any: ['[data-testid="planning-shared-shell"]'],
      must: ['[data-testid="planning-page-tabs"]'],
    },
    {
      key: 'planning-baseline',
      name: 'Baseline',
      path: projectRoute(projectId, '/planning/baseline'),
      any: ['[data-testid="planning-shared-shell"]'],
      must: ['[data-testid="planning-page-tabs"]'],
    },
    {
      key: 'planning-monthly',
      name: 'MonthlyPlan',
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      must: ['[data-testid="planning-page-tabs"]'],
    },
    {
      key: 'planning-closeout',
      name: 'Closeout',
      path: projectRoute(projectId, `/tasks/closeout?month=${currentMonth}`),
      any: ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-escalation-ladder"]', '[data-testid="closeout-empty-state"]'],
      must: ['[data-testid="planning-page-tabs"]'],
    },
    {
      key: 'materials',
      name: 'Materials',
      path: projectRoute(projectId, '/materials'),
      any: ['[data-testid="materials-page"]'],
      must: ['[data-testid="materials-toolbar-card"]'],
      check: async (page) => {
        const count = await page.locator('[data-testid^="materials-metric-"]').count()
        assert(count === 4, `Materials expected 4 metric cards, got ${count}`)
      },
    },
    {
      key: 'milestones',
      name: 'Milestones',
      path: projectRoute(projectId, '/milestones'),
      any: ['[data-testid="milestones-summary-grid"]'],
    },
    {
      key: 'acceptance-timeline',
      name: 'AcceptanceTimeline',
      path: projectRoute(projectId, '/acceptance'),
      any: ['[data-testid="acceptance-summary-panel"]', '[data-testid="acceptance-flow-board"]'],
    },
    {
      key: 'pre-milestones',
      name: 'PreMilestones',
      path: projectRoute(projectId, '/pre-milestones'),
      any: ['[data-testid="pre-milestones-page"]'],
      must: ['[data-testid="pre-milestones-tab-board"]', '[data-testid="pre-milestones-tab-ledger"]'],
    },
    {
      key: 'drawings',
      name: 'Drawings',
      path: projectRoute(projectId, '/drawings'),
      any: ['[data-testid="drawings-page"]'],
    },
    {
      key: 'notifications',
      name: 'Notifications',
      path: '/notifications',
      any: ['[data-testid="notifications-page"]'],
    },
    {
      key: 'task-summary',
      name: 'TaskSummary',
      path: projectRoute(projectId, '/task-summary'),
      any: ['[data-testid="task-summary-page"]'],
      must: ['[data-testid="task-summary-results-section"]'],
    },
    {
      key: 'responsibility-view',
      name: 'ResponsibilityView',
      path: projectRoute(projectId, '/responsibility'),
      any: ['[data-testid="responsibility-page"]'],
    },
    {
      key: 'onboarding',
      name: 'Onboarding',
      path: projectRoute(projectId, '/dashboard'),
      onboardingComplete: false,
      any: ['[data-testid="onboarding-guide"]', '[data-testid="onboarding-daily-workflow"]'],
    },
  ]
}

function overlayStates(projectId) {
  return [
    {
      key: 'gantt-scope-dialog',
      name: 'Gantt scope dimensions Dialog',
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => {
        await page.getByTestId('gantt-open-scope-dimensions').click()
        await page.getByTestId('gantt-scope-dimensions-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'gantt-critical-path-dialog',
      name: 'Gantt critical path Dialog',
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => {
        await page.getByTestId('gantt-open-critical-path-dialog').click()
        await page.getByTestId('critical-path-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'baseline-more-columns-popover',
      name: 'Baseline more columns Popover',
      path: projectRoute(projectId, '/planning/baseline'),
      any: ['[data-testid="planning-shared-shell"]'],
      action: async (page) => {
        await page.getByTestId('planning-more-columns-trigger').click()
        await page.getByTestId('planning-more-columns-popover').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'monthly-confirm-dialog',
      name: 'Monthly confirm Dialog',
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      action: async (page) => {
        await page.getByTestId('monthly-plan-standard-confirm-entry').click()
        await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'closeout-more-actions-dropdown',
      name: 'Closeout more actions Dropdown',
      path: projectRoute(projectId, `/tasks/closeout?month=${currentMonth}`),
      any: ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-escalation-ladder"]', '[data-testid="closeout-empty-state"]'],
      action: async (page) => {
        const moreActions = page.getByTestId('closeout-more-actions').first()
        await moreActions.waitFor({ state: 'visible', timeout: 20000 })
        await moreActions.click()
        await page.getByTestId('closeout-force-close-entry').first().waitFor({ state: 'visible', timeout: 20000 })
      },
    },
  ]
}

async function captureState(browser, sessions, viewport, state) {
  const token = state.session === 'admin' ? sessions.adminToken : sessions.ownerToken
  const context = await newContext(browser, token, viewport, {
    onboardingComplete: state.onboardingComplete !== false,
  })
  const page = await context.newPage()
  const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
  attachDiagnostics(page, diagnostics)

  try {
    page.setDefaultTimeout(30000)
    await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
    await waitForAny(page, state.any)
    if (state.must?.length) {
      await waitForAll(page, state.must)
    }
    if (state.action) {
      await state.action(page)
    }
    if (state.check) {
      await state.check(page)
    }
    await page.waitForTimeout(250)

    const visual = await runVisualChecks(page)
    assert(visual.horizontalOverflowPx <= 2, `${state.key} has document horizontal overflow ${visual.horizontalOverflowPx}px at ${viewport.key}`)
    assert(visual.outOfViewport.length === 0, `${state.key} has off-viewport elements at ${viewport.key}: ${JSON.stringify(visual.outOfViewport)}`)
    assert(visual.overflowingButtons.length === 0, `${state.key} has overflowing button text at ${viewport.key}: ${JSON.stringify(visual.overflowingButtons)}`)

    assert(diagnostics.apiFailures.length === 0, `${state.key} API failures at ${viewport.key}: ${JSON.stringify(diagnostics.apiFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `${state.key} page errors at ${viewport.key}: ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `${state.key} console errors at ${viewport.key}: ${diagnostics.consoleErrors.join(' | ')}`)

    const viewportDir = join(outputDir, viewport.key)
    await mkdir(viewportDir, { recursive: true })
    const screenshotPath = join(viewportDir, `${state.key}.png`)
    await takeCheckedScreenshot(page, screenshotPath)

    return {
      viewport: viewport.key,
      key: state.key,
      name: state.name,
      url: page.url(),
      screenshot: rel(screenshotPath),
      visual,
      diagnostics,
      status: 'passed',
    }
  } catch (error) {
    const failurePath = join(outputDir, viewport.key, `${state.key}.failure.png`)
    await mkdir(dirname(failurePath), { recursive: true })
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {})
    return {
      viewport: viewport.key,
      key: state.key,
      name: state.name,
      url: page.url(),
      screenshot: rel(failurePath),
      diagnostics,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await context.close()
  }
}

async function main() {
  await ensureDistExists()
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const projectId = manifest.projects?.standard?.id
  assert(projectId, `Missing standard project id in ${rel(manifestPath)}`)

  const apiReady = await isHttpReady(`${apiBaseUrl}/api/health`)
  assert(apiReady, `API is not reachable at ${apiBaseUrl}/api/health`)

  let previewProcess = null
  const previewAlreadyReady = await isHttpReady(baseUrl)
  if (!previewAlreadyReady && shouldStartPreview) {
    previewProcess = startPreviewServer()
  }
  const previewReady = previewAlreadyReady || await waitForHttpOk(baseUrl, 30000)
  assert(previewReady, `Preview server is not reachable at ${baseUrl}`)

  const sessions = {
    ownerToken: await login(manifest.accounts.owner),
    adminToken: await login(manifest.accounts.companyAdmin),
  }

  assert(viewports.length > 0, `No visual viewports matched filter: ${process.env.UIUX_VISUAL_VIEWPORTS}`)

  const allStates = [
    ...mainPages(projectId),
    ...overlayStates(projectId),
  ]
  const states = stateFilter
    ? allStates.filter((state) => stateFilter.has(state.key))
    : allStates
  assert(states.length > 0, `No visual states matched filter: ${process.env.UIUX_VISUAL_STATES}`)

  const browser = await chromium.launch({ headless: true })
  const runs = []
  try {
    for (const viewport of viewports) {
      for (const state of states) {
        const result = await captureState(browser, sessions, viewport, state)
        runs.push(result)
        await writeFile(manifestOutPath, `${JSON.stringify({
          generatedAt: new Date().toISOString(),
          baseUrl,
          apiBaseUrl,
          projectId,
          currentMonth,
          viewports,
          states: states.map((item) => ({ key: item.key, name: item.name })),
          runs,
        }, null, 2)}\n`, 'utf8')
        if (result.status !== 'passed') {
          throw new Error(result.error || `${state.key} failed at ${viewport.key}`)
        }
      }
    }
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill()
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    projectId,
    currentMonth,
    viewportCount: viewports.length,
    mainPageCount: mainPages(projectId).length,
    overlayStateCount: overlayStates(projectId).length,
    screenshotCount: runs.length,
    passed: runs.length,
    failed: 0,
    manifest: rel(manifestOutPath),
  }

  await writeFile(join(outputDir, 'visual-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
