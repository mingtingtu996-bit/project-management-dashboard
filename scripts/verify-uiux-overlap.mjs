import { access, mkdir, readFile, rm, stat } from 'node:fs/promises'
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
const outputDir = join(repoRoot, process.env.UIUX_OVERLAP_OUTPUT_DIR || 'artifacts/uiux-overlap')

const port = Number(process.env.PORT || 4173)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldStartPreview = process.env.OVERLAP_START_PREVIEW !== 'false'

function parseFilter(value) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? new Set(items) : null
}

const viewportFilter = parseFilter(process.env.UIUX_OVERLAP_VIEWPORTS)
const pageFilter = parseFilter(process.env.UIUX_OVERLAP_PAGES)

const allViewports = [
  { key: 'desktop-1440', width: 1440, height: 900 },
  { key: 'desktop-1366', width: 1366, height: 768 },
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

function startPreviewServer() {
  const child = spawn(process.execPath, [join(scriptsDir, 'serve-client-dist.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      API_HOST: new URL(apiBaseUrl).hostname,
      API_PORT: new URL(apiBaseUrl).port || '80',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-overlap:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-overlap:preview] ${chunk}`))
  return child
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
  return json?.data ?? json
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

async function newContext(browser, token, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    locale: 'zh-CN',
  })

  await context.addInitScript((authToken) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
    window.localStorage.setItem('onboarding_completed', 'true')
    window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  }, token)

  return context
}

function allPages(projects) {
  const standardId = projects.standard.id
  const largeId = projects.large.id
  const pageConfigs = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      path: projectRoute(standardId, '/dashboard'),
      ready: '[data-testid="dashboard-page"]',
    },
    {
      key: 'gantt',
      label: 'Gantt',
      path: projectRoute(standardId, '/gantt'),
      ready: '[data-testid="gantt-task-rows"], [data-testid="task-workspace-layer-l2"]',
    },
    {
      key: 'materials',
      label: 'Materials',
      path: projectRoute(standardId, '/materials'),
      ready: '[data-testid="materials-page"]',
    },
    {
      key: 'planning-baseline',
      label: 'PlanningBaseline',
      path: projectRoute(standardId, '/planning/baseline'),
      ready: '[data-testid="planning-shared-shell"]',
    },
    {
      key: 'large-gantt',
      label: 'Large-Gantt',
      path: projectRoute(largeId, '/gantt'),
      ready: '[data-testid="gantt-task-rows"], [data-testid="task-workspace-layer-l2"]',
    },
  ]

  return pageFilter
    ? pageConfigs.filter((pageConfig) => pageFilter.has(pageConfig.key))
    : pageConfigs
}

async function detectOcclusion(page) {
  return page.evaluate(() => {
    const ignoredSelector = [
      '[data-radix-popper-content-wrapper]',
      '[role="tooltip"]',
      '[aria-hidden="true"]',
      '[data-overlap-ignore="true"]',
      '[data-overlap-ignore="true"] *',
      'script',
      'style',
      'svg',
      'path',
      'defs',
      'clipPath',
    ].join(',')

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) return false
      if (element.closest(ignoredSelector)) return false
      const closedDetails = element.closest('details:not([open])')
      if (closedDetails) {
        const summary = closedDetails.querySelector('summary')
        if (!summary || (element !== summary && !summary.contains(element))) return false
      }
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        rect.width >= 8
        && rect.height >= 8
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.05
      )
    }

    function textOf(element) {
      return String(element.textContent || '').replace(/\s+/g, ' ').trim()
    }

    function hasOwnReadableText(element) {
      const text = textOf(element)
      if (text.length === 0) return false
      const childText = Array.from(element.children)
        .filter((child) => child instanceof HTMLElement)
        .map((child) => textOf(child))
        .join(' ')
      return childText.trim().length === 0 || element.matches('button, a, [role="button"], td, th, [role="cell"], [role="columnheader"]')
    }

    function isCandidate(element) {
      if (!isVisible(element)) return false
      if (element.matches('main, section, article, header, nav, aside, table, tbody, thead, tr, ul, ol')) return false
      if (element.closest('[data-overlap-ignore="true"]')) return false
      return (
        hasOwnReadableText(element)
        || element.matches('button, a, input, textarea, select, [role="button"], [role="tab"], [role="cell"], [role="columnheader"]')
      )
    }

    function describe(element) {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        role: element.getAttribute('role'),
        className: String(element.getAttribute('class') || '').slice(0, 120),
        text: textOf(element).slice(0, 100),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }
    }

    function related(a, b) {
      if (!a || !b) return true
      if (a === b || a.contains(b) || b.contains(a)) return true
      const aCell = a.closest('td, th, [role="cell"], [role="columnheader"]')
      const bCell = b.closest('td, th, [role="cell"], [role="columnheader"]')
      if (aCell && bCell && aCell === bCell) return true
      const aButton = a.closest('button, a, [role="button"]')
      const bButton = b.closest('button, a, [role="button"]')
      if (aButton && bButton && aButton === bButton) return true
      return false
    }

    function topElementAt(x, y) {
      const elements = document.elementsFromPoint(x, y)
        .filter((item) => item instanceof HTMLElement)
        .filter((item) => !item.closest(ignoredSelector))
      return elements[0] || null
    }

    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isCandidate)

    const findings = []
    const seen = new Set()

    for (const element of candidates) {
      const rect = element.getBoundingClientRect()
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + Math.min(8, rect.width / 3), rect.top + rect.height / 2],
        [rect.right - Math.min(8, rect.width / 3), rect.top + rect.height / 2],
      ].filter(([x, y]) => x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight)

      for (const [x, y] of points) {
        const top = topElementAt(x, y)
        if (!top || related(element, top)) continue
        const key = `${element.tagName}:${Math.round(rect.left)}:${Math.round(rect.top)}:${top.tagName}:${Math.round(x)}:${Math.round(y)}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({
          target: describe(element),
          coveredBy: describe(top),
          point: { x: Math.round(x), y: Math.round(y) },
        })
        break
      }
    }

    const horizontalOverflow = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    ) - window.innerWidth

    return {
      horizontalOverflow,
      findings: findings.slice(0, 20),
      candidateCount: candidates.length,
    }
  })
}

async function capture(browser, token, viewport, pageConfig) {
  const context = await newContext(browser, token, viewport)
  const page = await context.newPage()
  const diagnostics = []
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      diagnostics.push(`${message.type()}: ${message.text()}`.slice(0, 500))
    }
  })
  page.on('pageerror', (error) => {
    diagnostics.push(`pageerror: ${(error.stack || error.message || String(error)).slice(0, 800)}`)
  })
  page.setDefaultTimeout(30000)
  try {
    await page.goto(route(pageConfig.path), { waitUntil: 'domcontentloaded' })
    try {
      await page.locator(pageConfig.ready).first().waitFor({ state: 'visible', timeout: 30000 })
    } catch (error) {
      const viewportDir = join(outputDir, viewport.key)
      await mkdir(viewportDir, { recursive: true })
      const failureScreenshotPath = join(viewportDir, `${pageConfig.key}-ready-failure.png`)
      await page.screenshot({ path: failureScreenshotPath, fullPage: false }).catch(() => {})
      const visibleText = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')
      const message = [
        `Ready selector did not appear for ${pageConfig.key}: ${pageConfig.ready}`,
        `URL: ${page.url()}`,
        `Screenshot: ${rel(failureScreenshotPath)}`,
        `Body: ${visibleText.replace(/\s+/g, ' ').trim().slice(0, 500)}`,
        `Diagnostics: ${diagnostics.length ? diagnostics.join(' | ') : 'none'}`,
      ].join('\n')
      throw new Error(message, { cause: error })
    }
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)

    const result = await detectOcclusion(page)
    const viewportDir = join(outputDir, viewport.key)
    await mkdir(viewportDir, { recursive: true })
    const screenshotPath = join(viewportDir, `${pageConfig.key}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const screenshotStat = await stat(screenshotPath)

    return {
      page: pageConfig.key,
      label: pageConfig.label,
      viewport: viewport.key,
      url: page.url(),
      screenshot: rel(screenshotPath),
      screenshotBytes: screenshotStat.size,
      ...result,
    }
  } finally {
    await context.close()
  }
}

async function main() {
  await access(distIndex, constants.R_OK)
  await access(manifestPath, constants.R_OK)
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  assert(await isHttpReady(`${apiBaseUrl}/api/health`), `API is not reachable at ${apiBaseUrl}/api/health`)

  let previewProcess = null
  const previewReady = await isHttpReady(baseUrl)
  if (!previewReady && shouldStartPreview) {
    previewProcess = startPreviewServer()
  }
  assert(previewReady || await waitForHttpOk(baseUrl), `Preview server is not reachable at ${baseUrl}`)

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const token = await login(manifest.accounts.owner)
  const pageConfigs = allPages(manifest.projects)
  assert(viewports.length > 0, `No overlap viewports matched ${process.env.UIUX_OVERLAP_VIEWPORTS}`)
  assert(pageConfigs.length > 0, `No overlap pages matched ${process.env.UIUX_OVERLAP_PAGES}`)

  const browser = await chromium.launch({ headless: true })
  const runs = []
  try {
    for (const viewport of viewports) {
      for (const pageConfig of pageConfigs) {
        const run = await capture(browser, token, viewport, pageConfig)
        runs.push(run)
        console.log(JSON.stringify({
          page: run.page,
          viewport: run.viewport,
          findings: run.findings.length,
          horizontalOverflow: run.horizontalOverflow,
          screenshot: run.screenshot,
        }))
      }
    }
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) previewProcess.kill()
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    runs,
    failed: runs.filter((run) => run.findings.length > 0 || run.horizontalOverflow > 2),
  }
  const summaryPath = join(outputDir, 'overlap-summary.json')
  await import('node:fs/promises').then(({ writeFile }) => writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8'))

  if (summary.failed.length > 0) {
    console.error(JSON.stringify({
      failedCount: summary.failed.length,
      summary: rel(summaryPath),
      failures: summary.failed.map((run) => ({
        page: run.page,
        viewport: run.viewport,
        findings: run.findings.slice(0, 3),
        horizontalOverflow: run.horizontalOverflow,
        screenshot: run.screenshot,
      })),
    }, null, 2))
    process.exitCode = 1
    return
  }

  console.log(JSON.stringify({
    passed: runs.length,
    summary: rel(summaryPath),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
