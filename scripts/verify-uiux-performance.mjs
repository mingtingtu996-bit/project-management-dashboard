import { randomUUID } from 'node:crypto'
import { constants, existsSync, readFileSync } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const distIndex = join(repoRoot, 'client', 'dist', 'index.html')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')
const outputDir = join(repoRoot, 'artifacts', 'uiux-performance')
const summaryPath = join(outputDir, 'performance-summary.json')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv(join(repoRoot, 'server', '.env'))

const port = Number(process.env.PORT || 4174)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldStartPreview = process.env.PERFORMANCE_START_PREVIEW !== 'false'
const perfProjectName = process.env.UIUX_PERFORMANCE_PROJECT_NAME || 'UIUX-PERF-TIMELINE-120-20260429'
const perfTaskTarget = Number(process.env.UIUX_PERFORMANCE_TASK_COUNT || 120)

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

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

async function ensureDistExists() {
  await access(distIndex, constants.R_OK)
}

async function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 160)}`)
  }
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error?.message || json?.message || text || `${url} returned ${response.status}`)
  }
  return json
}

async function apiRequest(pathname, { method = 'GET', body, token } = {}) {
  const json = await fetchJson(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return json.data ?? json
}

async function login(account) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
  })
  assert(data?.token && data?.user?.id, `Login did not return token/user for ${account.username}`)
  return { token: data.token, user: data.user }
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
  const apiUrl = new URL(apiBaseUrl)
  const child = spawn(process.execPath, [join(scriptsDir, 'serve-client-dist.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      API_HOST: apiUrl.hostname,
      API_PORT: apiUrl.port || '80',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-performance:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-performance:preview] ${chunk}`))
  return child
}

async function ensurePerformanceProject(ownerSession) {
  assert(supabaseUrl && supabaseServiceKey, 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY for performance fixture seeding')
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: existingProjects, error: findError } = await supabase
    .from('projects')
    .select('id, name, owner_id, version')
    .eq('name', perfProjectName)
    .limit(1)
  if (findError) throw findError

  let project = existingProjects?.[0] ?? null
  if (!project) {
    project = await apiRequest('/api/projects', {
      method: 'POST',
      token: ownerSession.token,
      body: {
        name: perfProjectName,
        description: 'UIUX v1.3 performance timeline fixture',
        status: '进行中',
      },
    })
  }

  const { count, error: countError } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)
  if (countError) throw countError

  const currentCount = count ?? 0
  if (currentCount >= perfTaskTarget) {
    return { ...project, taskCount: currentCount }
  }

  const rows = []
  for (let index = currentCount; index < perfTaskTarget; index += 1) {
    const startDay = (index % 20) + 1
    const endDay = Math.min(28, startDay + 5 + (index % 8))
    rows.push({
      id: randomUUID(),
      project_id: project.id,
      title: `UIUX 性能横道任务 ${index + 1}`,
      description: 'UIUX v1.3 性能复核专用任务样本',
      status: index % 9 === 0 ? 'in_progress' : index % 13 === 0 ? 'completed' : 'pending',
      progress: index % 13 === 0 ? 100 : index % 9 === 0 ? 45 : 0,
      planned_start_date: `2026-04-${String(startDay).padStart(2, '0')}`,
      planned_end_date: `2026-05-${String(endDay).padStart(2, '0')}`,
      start_date: `2026-04-${String(startDay).padStart(2, '0')}`,
      end_date: `2026-05-${String(endDay).padStart(2, '0')}`,
      is_milestone: index % 25 === 0,
      is_critical: index % 12 === 0,
      specialty_type: ['土建', '机电', '装饰'][index % 3],
      assignee_name: ['工程一部', '工程二部', '工程三部'][index % 3],
      created_by: ownerSession.user.id,
      sort_order: index + 1,
      wbs_level: (index % 4) + 1,
      wbs_code: `UX${(index % 4) + 1}-${index + 1}`,
    })
  }

  while (rows.length > 0) {
    const batch = rows.splice(0, 100)
    const { error: insertError } = await supabase.from('tasks').insert(batch)
    if (insertError) throw insertError
  }

  return { ...project, taskCount: perfTaskTarget }
}

async function newContext(browser, token) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') diagnostics.consoleErrors.push(text)
    if (
      message.type() === 'warning'
      && /(unique "key"|each child in a list|forced reflow|layout thrash|layout shift loop)/i.test(text)
    ) {
      diagnostics.consoleWarnings.push(text)
    }
  })

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message)
  })

  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/')) return
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    diagnostics.apiFailures.push({
      type: 'requestfailed',
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown',
    })
  })

  page.on('response', (response) => {
    if (!response.url().includes('/api/') || response.url().includes('/api/performance-reports')) return
    if (response.status() < 400) return
    diagnostics.apiFailures.push({ type: 'response', url: response.url(), status: response.status() })
  })
}

async function waitForAny(page, selectors, timeout = 10000) {
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
    await page.waitForTimeout(120)
  }
  throw new Error(`Timed out waiting for any selector: ${selectors.join(', ')}`)
}

async function measureScrollResponsiveness(page) {
  return page.evaluate(async () => {
    const target = document.scrollingElement || document.documentElement
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight)
    const frameDeltas = []
    let lastFrame = performance.now()

    const frames = new Promise((resolve) => {
      let count = 0
      const tick = (now) => {
        frameDeltas.push(now - lastFrame)
        lastFrame = now
        count += 1
        if (count >= 36) resolve()
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

    for (let index = 0; index < 10; index += 1) {
      target.scrollTop = Math.min(maxScrollTop, target.scrollTop + 320)
      await new Promise((resolve) => setTimeout(resolve, 24))
    }
    await frames

    const avgFrameMs = frameDeltas.reduce((sum, item) => sum + item, 0) / Math.max(1, frameDeltas.length)
    const maxFrameMs = Math.max(0, ...frameDeltas)
    return {
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
      scrollTop: target.scrollTop,
      avgFrameMs: Number(avgFrameMs.toFixed(2)),
      maxFrameMs: Number(maxFrameMs.toFixed(2)),
    }
  })
}

async function visibleLoaderCount(page) {
  return page.locator([
    '[data-testid="page-skeleton"]',
    '[data-testid="gantt-loading-skeleton"]',
    '[data-testid*="loading-skeleton"]',
  ].join(',')).evaluateAll((nodes) => nodes.filter((node) => {
    if (!(node instanceof HTMLElement)) return false
    const rect = node.getBoundingClientRect()
    const style = window.getComputedStyle(node)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }).length)
}

async function verifyHeavyPage(page, state) {
  const startedAt = Date.now()
  await page.goto(route(state.path), { waitUntil: 'domcontentloaded', timeout: 30000 })
  const matchedSelector = await waitForAny(page, state.any, 10000)
  const firstVisibleMs = Date.now() - startedAt
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(250)
  const settledMs = Date.now() - startedAt
  const body = await page.evaluate(() => ({
    textLength: document.body.innerText.trim().length,
    elementCount: document.body.querySelectorAll('*').length,
  }))
  const loaders = await visibleLoaderCount(page)
  const scroll = await measureScrollResponsiveness(page)

  assert(firstVisibleMs <= 10000, `${state.key} exceeded 10s first visible load: ${firstVisibleMs}ms`)
  assert(body.textLength > 40 && body.elementCount > 20, `${state.key} appears blank: ${JSON.stringify(body)}`)
  assert(loaders === 0, `${state.key} still has visible loading skeletons after settling: ${loaders}`)
  assert(scroll.maxFrameMs < 250, `${state.key} scroll responsiveness max frame too high: ${JSON.stringify(scroll)}`)

  return {
    key: state.key,
    path: state.path,
    matchedSelector,
    firstVisibleMs,
    settledMs,
    body,
    loaders,
    scroll,
    status: 'passed',
  }
}

async function verifyGanttTimeline(page, project) {
  const startedAt = Date.now()
  await page.goto(route(projectRoute(project.id, '/gantt?view=timeline&scale=week')), { waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitForAny(page, ['[data-testid="gantt-timeline-view"]', '[data-testid="gantt-timeline-too-many"]'], 10000)
  assert(await page.getByTestId('gantt-timeline-view').count(), 'Gantt 50+ timeline rendered the too-many fallback instead of the interactive timeline')

  const visibleRows = await page.locator('[id^="gantt-task-row-"]').count()
  assert(visibleRows > 0, 'Gantt 50+ timeline rendered zero visible rows')
  assert(project.taskCount >= 50, `Performance fixture has fewer than 50 tasks: ${project.taskCount}`)

  await page.getByTestId('gantt-timeline-scale-day').click()
  await page.waitForTimeout(120)

  const scroller = page.locator('[data-testid="gantt-timeline-view"] .relative.overflow-auto').first()
  await scroller.waitFor({ state: 'visible', timeout: 5000 })
  const before = await scroller.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  await scroller.hover()
  await page.mouse.wheel(900, 0)
  await page.waitForTimeout(180)
  const after = await scroller.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  assert(before.scrollWidth > before.clientWidth, `Gantt timeline is not horizontally scrollable: ${JSON.stringify(before)}`)
  assert(after.scrollLeft > before.scrollLeft, `Gantt timeline horizontal pan did not move: before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`)

  await page.getByTestId('gantt-timeline-scale-month').click()
  await page.waitForTimeout(120)
  await page.getByTestId('gantt-timeline-scale-week').click()
  await page.waitForTimeout(120)

  return {
    key: 'gantt-50-plus-timeline',
    projectId: project.id,
    taskCount: project.taskCount,
    loadMs: Date.now() - startedAt,
    visibleRows,
    scrollBefore: before,
    scrollAfter: after,
    status: 'passed',
  }
}

async function main() {
  await ensureDistExists()
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const manifest = await readJson(manifestPath)
  assert(await isHttpReady(`${apiBaseUrl}/api/health`), `API is not reachable at ${apiBaseUrl}/api/health`)

  const ownerSession = await login(manifest.accounts.owner)
  const adminSession = await login(manifest.accounts.companyAdmin)
  const perfProject = await ensurePerformanceProject(ownerSession)

  let previewProcess = null
  const previewAlreadyReady = await isHttpReady(baseUrl)
  if (!previewAlreadyReady && shouldStartPreview) previewProcess = startPreviewServer()
  const previewReady = previewAlreadyReady || await waitForHttpOk(baseUrl, 30000)
  assert(previewReady, `Preview server is not reachable at ${baseUrl}`)

  const heavyPages = [
    { key: 'company-cockpit', session: 'admin', path: '/company', any: ['[data-testid="company-cockpit-page"]'] },
    { key: 'dashboard', session: 'owner', path: projectRoute(manifest.projects.standard.id, '/dashboard'), any: ['[data-testid="dashboard-page"]'] },
    { key: 'reports', session: 'owner', path: projectRoute(manifest.projects.standard.id, '/reports?view=progress'), any: ['[data-testid="reports-module-tabs"]'] },
    { key: 'gantt-view', session: 'owner', path: projectRoute(manifest.projects.standard.id, '/gantt'), any: ['[data-testid="gantt-task-rows"]'] },
    { key: 'planning', session: 'owner', path: projectRoute(manifest.projects.standard.id, '/planning'), any: ['[data-testid="planning-shared-shell"]'] },
  ]

  const browser = await chromium.launch({ headless: true })
  const results = []
  const diagnostics = { consoleErrors: [], consoleWarnings: [], pageErrors: [], apiFailures: [], interceptedPerformanceReports: 0 }

  try {
    for (const state of heavyPages) {
      const token = state.session === 'admin' ? adminSession.token : ownerSession.token
      const context = await newContext(browser, token)
      const page = await context.newPage()
      attachDiagnostics(page, diagnostics)
      await page.route('**/api/performance-reports', async (routeRequest) => {
        diagnostics.interceptedPerformanceReports += 1
        await routeRequest.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { accepted: true, intercepted: true } }),
        })
      })
      try {
        results.push(await verifyHeavyPage(page, state))
      } finally {
        await context.close()
      }
    }

    const context = await newContext(browser, ownerSession.token)
    const page = await context.newPage()
    attachDiagnostics(page, diagnostics)
    await page.route('**/api/performance-reports', async (routeRequest) => {
      diagnostics.interceptedPerformanceReports += 1
      await routeRequest.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { accepted: true, intercepted: true } }),
      })
    })
    try {
      results.push(await verifyGanttTimeline(page, perfProject))
    } finally {
      await context.close()
    }

    assert(diagnostics.pageErrors.length === 0, `Page errors: ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `Console errors: ${diagnostics.consoleErrors.join(' | ')}`)
    assert(diagnostics.consoleWarnings.length === 0, `React key/layout warnings: ${diagnostics.consoleWarnings.join(' | ')}`)
    assert(diagnostics.apiFailures.length === 0, `API failures: ${JSON.stringify(diagnostics.apiFailures)}`)
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) previewProcess.kill()
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    standardProjectId: manifest.projects.standard.id,
    performanceProject: {
      id: perfProject.id,
      name: perfProject.name,
      taskCount: perfProject.taskCount,
    },
    heavyPageCount: heavyPages.length,
    passed: results.length,
    failed: 0,
    diagnostics,
    results,
  }

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...summary, summary: rel(summaryPath) }, null, 2))
}

main().catch(async (error) => {
  await mkdir(outputDir, { recursive: true }).catch(() => {})
  const failure = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    failed: 1,
    error: error instanceof Error ? error.message : String(error),
  }
  await writeFile(summaryPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8').catch(() => {})
  console.error(failure.error)
  process.exitCode = 1
})
