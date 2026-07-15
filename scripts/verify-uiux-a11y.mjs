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
const outputDir = join(repoRoot, process.env.UIUX_A11Y_OUTPUT_DIR || 'project-ui/artifacts/uiux-a11y')
const reportPath = join(outputDir, 'a11y-report.json')

const port = Number(process.env.PORT || 4173)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldRewriteApiOrigin = process.env.UIUX_A11Y_DIRECT_API_ORIGIN === 'true'
const shouldStartPreview = process.env.A11Y_START_PREVIEW !== 'false'
const currentMonth = process.env.UIUX_A11Y_MONTH || new Date().toISOString().slice(0, 7)

const viewports = [
  { key: 'desktop-1440', width: 1440, height: 900 },
  { key: 'mobile-390', width: 390, height: 844 },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function rel(filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
}

function artifactName(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function route(pathname) {
  return `${baseUrl}/#${pathname}`
}

function projectRoute(projectId, pathname) {
  return `/projects/${projectId}${pathname}`
}

function unwrapApiData(json) {
  if (!json) return null
  if (json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed')
  }
  return json.data ?? json
}

async function apiRequest(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error?.message || json?.message || text || `API ${method} ${pathname} failed with ${response.status}`)
  }
  return unwrapApiData(json)
}

async function login(account) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
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
    throw new Error('client/dist/index.html is missing. Run npm run build --workspace=client before a11y verification.')
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

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-a11y:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-a11y:preview] ${chunk}`))
  return child
}

function isIgnorableConsoleError(message) {
  if (message === 'Failed to load resource: net::ERR_CONNECTION_CLOSED') return true
  return (
    typeof message === 'string'
    && message.includes("WebSocket connection to 'ws://")
    && message.includes('/ws?')
    && message.includes('ERR_CONNECTION_REFUSED')
  )
}

function isIgnorableRequestFailure(request) {
  return request.failure()?.errorText === 'net::ERR_ABORTED'
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!isIgnorableConsoleError(text)) diagnostics.consoleErrors.push(text)
  })

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message)
  })

  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/')) return
    if (isIgnorableRequestFailure(request)) return
    diagnostics.apiFailures.push({
      type: 'requestfailed',
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown',
    })
  })

  page.on('response', (response) => {
    if (!response.url().includes('/api/') || response.status() < 400) return
    diagnostics.apiFailures.push({
      type: 'response',
      url: response.url(),
      status: response.status(),
    })
  })
}

async function newContext(browser, token, viewport, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    locale: 'zh-CN',
    reducedMotion,
  })

  await context.route(`${baseUrl}/api/**`, async (route) => {
    const requestUrl = route.request().url()
    const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
    let fulfilled = false
    try {
      const response = await route.fetch({ url: forwardUrl })
      await route.fulfill({ response })
      fulfilled = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (fulfilled || message.includes('Route is already handled')) return
      try {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'BROWSER_PROXY_ERROR',
              message,
            },
          }),
        })
      } catch (fulfillError) {
        const fulfillMessage = fulfillError instanceof Error ? fulfillError.message : String(fulfillError)
        if (fulfillMessage.includes('Route is already handled')) return
        throw fulfillError
      }
    }
  })

  await context.addInitScript(({ authToken, apiOrigin, rewriteApiOrigin }) => {
    if (rewriteApiOrigin) {
      const nativeFetch = window.fetch.bind(window)
      window.fetch = (input, init) => {
        if (typeof input === 'string' && input.startsWith('/api/')) {
          return nativeFetch(`${apiOrigin}${input}`, init)
        }

        if (input instanceof Request) {
          const requestUrl = new URL(input.url)
          if (requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/')) {
            return nativeFetch(new Request(`${apiOrigin}${requestUrl.pathname}${requestUrl.search}`, input), init)
          }
        }

        return nativeFetch(input, init)
      }
    }

    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
    window.localStorage.setItem('onboarding_workspace_completed', 'true')
    window.localStorage.setItem('onboarding_project_completed', 'true')
    window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  }, { authToken: token, apiOrigin: apiBaseUrl, rewriteApiOrigin: shouldRewriteApiOrigin })

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

async function captureFailureArtifact(page, viewportKey, stateKey, diagnostics) {
  const basename = artifactName(viewportKey, stateKey, 'failure')
  const screenshotPath = join(outputDir, `${basename}.png`)
  let screenshot = null
  let bodyText = ''
  let title = ''

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true })
    screenshot = rel(screenshotPath)
  } catch (error) {
    diagnostics.screenshotError = error instanceof Error ? error.message : String(error)
  }

  try {
    title = await page.title()
  } catch {
    title = ''
  }

  try {
    bodyText = (await page.locator('body').innerText({ timeout: 1000 })).replace(/\s+/g, ' ').slice(0, 2000)
  } catch (error) {
    diagnostics.bodyTextError = error instanceof Error ? error.message : String(error)
  }

  return {
    screenshot,
    title,
    bodyText,
    currentUrl: page.url(),
  }
}

function pages(projectId) {
  return [
    { key: 'company-cockpit', session: 'admin', path: '/company', any: ['[data-testid="company-cockpit-page"]'] },
    { key: 'dashboard', path: projectRoute(projectId, '/dashboard'), any: ['[data-testid="dashboard-page"]'] },
    { key: 'reports', path: projectRoute(projectId, '/reports?view=progress'), any: ['[data-testid="reports-module-tabs"]'] },
    { key: 'risk-management', path: projectRoute(projectId, '/risks'), any: ['[data-testid="risk-summary-band"]'] },
    { key: 'gantt-view', path: projectRoute(projectId, '/gantt'), any: ['[data-testid="gantt-task-rows"]'] },
    { key: 'planning-workspace', path: projectRoute(projectId, '/planning'), any: ['[data-testid="planning-shared-shell"]'] },
    { key: 'planning-baseline', path: projectRoute(projectId, '/planning/baseline'), any: ['[data-testid="planning-shared-shell"]'] },
    { key: 'planning-monthly', path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`), any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'] },
    { key: 'planning-closeout', path: projectRoute(projectId, `/planning/monthly?view=closeout&month=${currentMonth}`), any: ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-empty-state"]'] },
    { key: 'materials', path: projectRoute(projectId, '/materials'), any: ['[data-testid="materials-page"]'] },
    { key: 'milestones', path: projectRoute(projectId, '/milestones'), any: ['[data-testid="milestones-summary-grid"]'] },
    { key: 'acceptance-timeline', path: projectRoute(projectId, '/acceptance'), any: ['[data-testid="acceptance-summary-panel"]', '[data-testid="acceptance-flow-board"]'] },
    { key: 'pre-milestones', path: projectRoute(projectId, '/pre-milestones'), any: ['[data-testid="pre-milestones-page"]'] },
    { key: 'drawings', path: projectRoute(projectId, '/drawings'), any: ['[data-testid="drawings-page"]'] },
    { key: 'notifications', path: '/notifications', any: ['[data-testid="notifications-page"]'] },
    { key: 'task-summary', path: projectRoute(projectId, '/task-summary'), any: ['[data-testid="task-summary-page"]'] },
    { key: 'responsibility-view', path: projectRoute(projectId, '/responsibility'), any: ['[data-testid="responsibility-page"]'] },
  ]
}

function keyboardOverlays(projectId) {
  return [
    {
      key: 'gantt-scope-dialog',
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      open: async (page) => {
        await page.getByTestId('gantt-generation-template-menu').click()
        await page.getByTestId('gantt-open-engineering-objects').click()
      },
      target: '[data-testid="gantt-engineering-objects-dialog"]',
      closed: '[data-testid="gantt-engineering-objects-dialog"]',
    },
    {
      key: 'baseline-more-columns-popover',
      path: projectRoute(projectId, '/planning/baseline'),
      any: ['[data-testid="planning-shared-shell"]'],
      open: async (page) => page.getByTestId('planning-more-columns-trigger').click(),
      target: '[data-testid="planning-more-columns-popover"]',
      closed: '[data-testid="planning-more-columns-popover"]',
    },
    {
      key: 'monthly-confirm-dialog',
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      open: async (page) => page.getByTestId('monthly-plan-standard-confirm-entry').click(),
      target: '[data-testid="monthly-plan-confirm-dialog"]',
      closed: '[data-testid="monthly-plan-confirm-dialog"]',
    },
    {
      key: 'closeout-detail-process-entry',
      path: projectRoute(projectId, `/planning/monthly?view=closeout&month=${currentMonth}`),
      any: ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-escalation-ladder"]', '[data-testid="closeout-empty-state"]'],
      open: async (page) => {
        const openItem = page.locator('[data-testid^="closeout-item-open-"]').first()
        if (await openItem.count()) {
          await openItem.waitFor({ state: 'visible', timeout: 20000 })
          await openItem.click()
        } else {
          await page.getByTestId('closeout-empty-state').waitFor({ state: 'visible', timeout: 20000 })
        }
      },
      target: '[data-testid="closeout-single-process-entry"], [data-testid="closeout-empty-state"]',
      closed: '[data-testid="closeout-single-process-entry"]',
      optionalOverlay: true,
    },
  ]
}

async function evaluateAccessibility(page) {
  return page.evaluate(() => {
    const failures = {
      namelessControls: [],
      unlabeledFields: [],
      namelessDialogs: [],
      contrast: [],
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && !element.closest('[aria-hidden="true"], [hidden]')
      )
    }

    function textOf(element) {
      return String(element.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function byIdText(ids) {
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((element) => textOf(element))
        .join(' ')
        .trim()
    }

    function accessibleName(element) {
      const labelledBy = element.getAttribute('aria-labelledby')
      if (labelledBy && byIdText(labelledBy)) return byIdText(labelledBy)
      const ariaLabel = element.getAttribute('aria-label')
      if (ariaLabel?.trim()) return ariaLabel.trim()
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if (element.labels && Array.from(element.labels).some((label) => textOf(label))) {
          return Array.from(element.labels).map((label) => textOf(label)).join(' ')
        }
      }
      const alt = element.getAttribute('alt')
      if (alt?.trim()) return alt.trim()
      const title = element.getAttribute('title')
      if (title?.trim()) return title.trim()
      return textOf(element)
    }

    function describe(element) {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        testId: element.getAttribute('data-testid'),
        className: String(element.getAttribute('class') || '').slice(0, 120),
        text: textOf(element).slice(0, 80),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      }
    }

    const controlSelector = [
      'button',
      'a[href]',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="switch"]',
      'input',
      'select',
      'textarea',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const controls = Array.from(document.querySelectorAll(controlSelector))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true')

    for (const element of controls) {
      if (!accessibleName(element)) failures.namelessControls.push(describe(element))
      if (failures.namelessControls.length >= 8) break
    }

    const fields = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)

    for (const element of fields) {
      const labelledBy = element.getAttribute('aria-labelledby')
      const labelled = (
        element.getAttribute('aria-label')?.trim()
        || (labelledBy && byIdText(labelledBy))
        || ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.labels && element.labels.length > 0)
      )
      if (!labelled) failures.unlabeledFields.push(describe(element))
      if (failures.unlabeledFields.length >= 8) break
    }

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)

    for (const dialog of dialogs) {
      if (!accessibleName(dialog)) failures.namelessDialogs.push(describe(dialog))
      if (failures.namelessDialogs.length >= 8) break
    }

    function parseRgb(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
      if (parts.length < 3 || parts.slice(0, 3).some((item) => Number.isNaN(item))) return null
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
    }

    function luminance({ r, g, b }) {
      const values = [r, g, b].map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
    }

    function contrastRatio(foreground, background) {
      const light = Math.max(luminance(foreground), luminance(background))
      const dark = Math.min(luminance(foreground), luminance(background))
      return (light + 0.05) / (dark + 0.05)
    }

    function effectiveBackground(element) {
      let current = element
      while (current && current instanceof HTMLElement) {
        const color = parseRgb(window.getComputedStyle(current).backgroundColor)
        if (color && color.a > 0.95) return color
        current = current.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }

    const contrastTargets = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], [class*="Badge"], [data-slot="badge"], .badge, [role="alert"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => textOf(element).length > 0)

    for (const element of contrastTargets) {
      const style = window.getComputedStyle(element)
      const foreground = parseRgb(style.color)
      const background = effectiveBackground(element)
      if (!foreground || foreground.a < 0.95) continue
      const ratio = contrastRatio(foreground, background)
      const fontSize = Number.parseFloat(style.fontSize)
      const fontWeight = Number.parseInt(style.fontWeight, 10)
      const largeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 600)
      const threshold = largeText ? 3 : 4.5
      if (ratio + 0.01 < threshold) {
        failures.contrast.push({ ...describe(element), ratio: Number(ratio.toFixed(2)), threshold })
      }
      if (failures.contrast.length >= 8) break
    }

    return {
      focusableCount: controls.length,
      dialogCount: dialogs.length,
      failures,
    }
  })
}

async function checkKeyboardPath(page, stateKey) {
  const visited = []
  let currentFocus = null

  await page.keyboard.press('Home').catch(() => {})
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(20)
    const active = await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        text: String(element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
        boxShadow: style.boxShadow !== 'none',
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        isDocumentFallback: element === document.body || element === document.documentElement,
      }
    })
    if (active) {
      currentFocus = active
      if (!active.isDocumentFallback) visited.push(active)
    }
  }

  assert(visited.length >= 3, `${stateKey} keyboard path found too few focus targets: ${visited.length}`)
  const invisible = visited.find((item) => !item.visible)
  assert(!invisible, `${stateKey} focused an invisible element: ${JSON.stringify(invisible)}`)
  const withoutFocusStyle = visited.find((item) => !item.outline && !item.boxShadow)
  assert(!withoutFocusStyle, `${stateKey} focused element lacks visible focus style: ${JSON.stringify(withoutFocusStyle)}`)

  const beforeBack = currentFocus ?? visited[visited.length - 1]
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(20)
  const afterBack = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return null
    return {
      tag: element.tagName.toLowerCase(),
      testId: element.getAttribute('data-testid'),
      text: String(element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    }
  })
  assert(JSON.stringify(afterBack) !== JSON.stringify(beforeBack), `${stateKey} Shift+Tab did not move focus backward`)

  return { visitedCount: visited.length, sample: visited.slice(0, 8) }
}

async function checkReducedMotion(browser, token, projectId) {
  const viewport = { key: 'reduced-motion', width: 1440, height: 900 }
  const context = await newContext(browser, token, viewport, { reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(route(projectRoute(projectId, '/dashboard')), { waitUntil: 'domcontentloaded' })
    await waitForAny(page, ['[data-testid="dashboard-page"]'])
    await page.waitForTimeout(250)
    const result = await page.evaluate(() => {
      const reduceMatches = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const animated = Array.from(document.querySelectorAll('body *'))
        .filter((element) => element instanceof HTMLElement)
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          const style = window.getComputedStyle(element)
          const duration = style.animationDuration
            .split(',')
            .some((value) => Number.parseFloat(value) > 0)
          return style.animationName !== 'none' && duration
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute('data-testid'),
          className: String(element.getAttribute('class') || '').slice(0, 120),
          animationName: window.getComputedStyle(element).animationName,
          animationDuration: window.getComputedStyle(element).animationDuration,
        }))
      return { reduceMatches, animated }
    })
    assert(result.reduceMatches, 'Reduced-motion media query did not match in reduced-motion browser context')
    assert(result.animated.length === 0, `Reduced-motion context still has active CSS animations: ${JSON.stringify(result.animated)}`)
    return result
  } finally {
    await context.close()
  }
}

async function capturePageA11y(browser, sessions, viewport, state) {
  const token = state.session === 'admin' ? sessions.adminToken : sessions.ownerToken
  const context = await newContext(browser, token, viewport)
  const page = await context.newPage()
  const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
  attachDiagnostics(page, diagnostics)

  try {
    page.setDefaultTimeout(30000)
    console.log(`[uiux-a11y] checking page ${state.key} at ${viewport.key}`)
    await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
    await waitForAny(page, state.any)
    await page.waitForTimeout(250)

    const accessibility = await evaluateAccessibility(page)
    const keyboard = await checkKeyboardPath(page, state.key)
    const failures = Object.entries(accessibility.failures).filter(([, items]) => items.length > 0)
    assert(failures.length === 0, `${state.key} accessibility failures at ${viewport.key}: ${JSON.stringify(accessibility.failures)}`)
    assert(diagnostics.apiFailures.length === 0, `${state.key} API failures at ${viewport.key}: ${JSON.stringify(diagnostics.apiFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `${state.key} page errors at ${viewport.key}: ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `${state.key} console errors at ${viewport.key}: ${diagnostics.consoleErrors.join(' | ')}`)
    console.log(`[uiux-a11y] passed page ${state.key} at ${viewport.key}`)

    return {
      viewport: viewport.key,
      key: state.key,
      url: page.url(),
      accessibility,
      keyboard,
      diagnostics,
      status: 'passed',
    }
  } catch (error) {
    const failureArtifact = await captureFailureArtifact(page, viewport.key, state.key, diagnostics)
    return {
      viewport: viewport.key,
      key: state.key,
      url: page.url(),
      diagnostics,
      failureArtifact,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await context.close()
  }
}

async function checkOverlayKeyboard(browser, sessions, viewport, state) {
  const context = await newContext(browser, sessions.ownerToken, viewport)
  const page = await context.newPage()
  const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
  attachDiagnostics(page, diagnostics)

  try {
    page.setDefaultTimeout(30000)
    console.log(`[uiux-a11y] checking overlay ${state.key} at ${viewport.key}`)
    await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
    await waitForAny(page, state.any)
    await state.open(page)
    await page.locator(state.target).first().waitFor({ state: 'visible', timeout: 20000 })
    const legacyForceCloseCount = await page.locator('[data-testid*="force-close"]').count()
    assert(legacyForceCloseCount === 0, `${state.key} exposed ${legacyForceCloseCount} legacy force-close controls`)
    if (state.optionalOverlay && await page.getByTestId('closeout-empty-state').count()) {
      assert(diagnostics.apiFailures.length === 0, `${state.key} API failures at ${viewport.key}: ${JSON.stringify(diagnostics.apiFailures)}`)
      assert(diagnostics.pageErrors.length === 0, `${state.key} page errors at ${viewport.key}: ${diagnostics.pageErrors.join(' | ')}`)
      assert(diagnostics.consoleErrors.length === 0, `${state.key} console errors at ${viewport.key}: ${diagnostics.consoleErrors.join(' | ')}`)
      return { viewport: viewport.key, key: state.key, status: 'passed', diagnostics, mode: 'empty-state' }
    }
    await page.keyboard.press('Tab')
    await page.waitForTimeout(20)
    const focusedInside = await page.evaluate((selector) => {
      const target = document.querySelector(selector)
      const active = document.activeElement
      return Boolean(target && active && target.contains(active))
    }, state.target)
    assert(focusedInside || state.key.includes('popover') || state.key.includes('dropdown'), `${state.key} did not move focus into overlay`)
    await page.keyboard.press('Escape')
    await page.locator(state.closed).first().waitFor({ state: 'hidden', timeout: 10000 })

    assert(diagnostics.apiFailures.length === 0, `${state.key} API failures at ${viewport.key}: ${JSON.stringify(diagnostics.apiFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `${state.key} page errors at ${viewport.key}: ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `${state.key} console errors at ${viewport.key}: ${diagnostics.consoleErrors.join(' | ')}`)

    console.log(`[uiux-a11y] passed overlay ${state.key} at ${viewport.key}`)
    return { viewport: viewport.key, key: state.key, status: 'passed', diagnostics }
  } catch (error) {
    const failureArtifact = await captureFailureArtifact(page, viewport.key, state.key, diagnostics)
    return {
      viewport: viewport.key,
      key: state.key,
      url: page.url(),
      status: 'failed',
      diagnostics,
      failureArtifact,
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
  assert(await isHttpReady(`${apiBaseUrl}/api/readyz`), `API is not ready at ${apiBaseUrl}/api/readyz`)

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

  const browser = await chromium.launch({ headless: true })
  const runs = []
  const overlayRuns = []
  let reducedMotion = null

  try {
    for (const viewport of viewports) {
      for (const state of pages(projectId)) {
        const result = await capturePageA11y(browser, sessions, viewport, state)
        runs.push(result)
        await writeFile(reportPath, `${JSON.stringify({
          generatedAt: new Date().toISOString(),
          baseUrl,
          apiBaseUrl,
          projectId,
          currentMonth,
          viewports,
          runs,
          overlayRuns,
          reducedMotion,
        }, null, 2)}\n`, 'utf8')
        if (result.status !== 'passed') throw new Error(result.error || `${state.key} failed at ${viewport.key}`)
      }
    }

    for (const viewport of viewports) {
      for (const state of keyboardOverlays(projectId)) {
        const result = await checkOverlayKeyboard(browser, sessions, viewport, state)
        overlayRuns.push(result)
        await writeFile(reportPath, `${JSON.stringify({
          generatedAt: new Date().toISOString(),
          baseUrl,
          apiBaseUrl,
          projectId,
          currentMonth,
          viewports,
          runs,
          overlayRuns,
          reducedMotion,
        }, null, 2)}\n`, 'utf8')
        if (result.status !== 'passed') throw new Error(result.error || `${state.key} failed at ${viewport.key}`)
      }
    }

    reducedMotion = await checkReducedMotion(browser, sessions.ownerToken, projectId)
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) previewProcess.kill()
  }

  const failed = [...runs, ...overlayRuns].filter((item) => item.status !== 'passed')
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    projectId,
    currentMonth,
    viewportCount: viewports.length,
    pageCount: pages(projectId).length,
    overlayCount: keyboardOverlays(projectId).length,
    pageRunCount: runs.length,
    overlayRunCount: overlayRuns.length,
    failed: failed.length,
    passed: runs.length + overlayRuns.length - failed.length,
    reducedMotion,
    report: rel(reportPath),
  }

  await writeFile(join(outputDir, 'a11y-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeFile(reportPath, `${JSON.stringify({
    ...summary,
    viewports,
    runs,
    overlayRuns,
  }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
