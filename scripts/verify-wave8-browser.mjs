import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'artifacts', 'test-runs', '20260423-wave8')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')

function loadEnv(filePath) {
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

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const PERF_PROJECT_NAME = 'FULLAPP-PERF-300-20260423'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function nowIso() {
  return new Date().toISOString()
}

function rel(path) {
  return relative(repoRoot, path).replace(/\\/g, '/')
}

function getCurrentMonthKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonthKey(baseMonth, delta) {
  const [rawYear, rawMonth] = String(baseMonth).split('-')
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
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
  return { response, json }
}

function authHeaders(token, body) {
  return {
    Authorization: `Bearer ${token}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }
}

function unwrapApiData(json) {
  if (!json) return null
  if (json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed')
  }
  return json.data ?? json
}

async function apiRequest(pathname, { method = 'GET', token, body, allowFailure = false } = {}) {
  const { response, json } = await fetchJson(`${API_BASE}${pathname}`, {
    method,
    headers: token ? authHeaders(token, body) : body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!allowFailure && (!response.ok || json?.success === false)) {
    throw new Error(json?.error?.message || json?.message || `API ${method} ${pathname} failed: ${response.status}`)
  }

  return { response, json, data: response.ok ? unwrapApiData(json) : null }
}

async function apiLogin(username, password) {
  const { response, data } = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    allowFailure: true,
  })
  if (!response.ok || !data?.token || !data?.user) {
    throw new Error(`Login failed for ${username}`)
  }
  return { token: data.token, user: data.user }
}

async function getProjectByName(name) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, owner_id, version')
    .eq('name', name)
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

async function createProject(ownerToken, name, description) {
  const { data } = await apiRequest('/api/projects', {
    method: 'POST',
    token: ownerToken,
    body: {
      name,
      description,
      status: '进行中',
    },
  })
  return data
}

async function ensurePerfProject(ownerSession) {
  let project = await getProjectByName(PERF_PROJECT_NAME)
  if (!project) {
    project = await createProject(ownerSession.token, PERF_PROJECT_NAME, '§6 性能与批量操作专用 300 任务项目')
  }

  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id)

  if (error) throw error
  const currentCount = count ?? 0
  if (currentCount >= 300) {
    return { ...project, taskCount: currentCount }
  }

  const rows = []
  for (let index = currentCount; index < 300; index += 1) {
    const day = (index % 28) + 1
    rows.push({
      id: randomUUID(),
      project_id: project.id,
      title: `性能任务 ${index + 1}`,
      description: '§6 性能专用任务样本',
      status: index < 10 ? 'completed' : 'pending',
      progress: index < 10 ? 100 : 0,
      planned_start_date: `2026-04-${String(day).padStart(2, '0')}`,
      planned_end_date: `2026-05-${String(day).padStart(2, '0')}`,
      start_date: `2026-04-${String(day).padStart(2, '0')}`,
      end_date: `2026-05-${String(day).padStart(2, '0')}`,
      is_milestone: false,
      is_critical: index % 15 === 0,
      specialty_type: ['土建', '机电', '装饰'][index % 3],
      assignee_name: ['工程一部', '工程二部', '工程三部'][index % 3],
      created_by: ownerSession.user.id,
      sort_order: index + 1,
      wbs_level: (index % 5) + 1,
      wbs_code: `P${(index % 5) + 1}-${index + 1}`,
    })
  }

  while (rows.length > 0) {
    const batch = rows.splice(0, 150)
    const { error: insertError } = await supabase.from('tasks').insert(batch)
    if (insertError) throw insertError
  }

  return { ...project, taskCount: 300 }
}

async function findUnusedMonthlyMonth(projectId, token) {
  const { data } = await apiRequest(`/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`, { token })
  const usedMonths = new Set(
    (Array.isArray(data) ? data : [])
      .map((item) => String(item?.month ?? '').trim())
      .filter(Boolean),
  )
  const currentMonth = getCurrentMonthKey()
  for (let index = 18; index <= 36; index += 1) {
    const candidate = shiftMonthKey(currentMonth, index)
    if (!usedMonths.has(candidate)) {
      return candidate
    }
  }
  return shiftMonthKey(currentMonth, 24)
}

function attachDiagnostics(page, sink) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      sink.consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    sink.pageErrors.push(error.message)
  })
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return
    if (response.ok()) return
    sink.apiFailures.push({
      url: response.url(),
      status: response.status(),
    })
  })
}

async function newAuthedContext(browser, token, viewport) {
  const context = await browser.newContext({
    viewport,
    colorScheme: 'light',
    locale: 'zh-CN',
  })
  await context.addInitScript((authToken) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
  }, token)
  return context
}

async function timedGoto(page, url, selector, options = {}) {
  const startedAt = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: options.timeout ?? 30000 })
  } catch (error) {
    if (!options.fallbackSelectors?.length) {
      throw error
    }
    await waitForAny(page, options.fallbackSelectors, options.timeout ?? 30000)
  }
  if (options.extraWaitMs) {
    await page.waitForTimeout(options.extraWaitMs)
  }
  return Date.now() - startedAt
}

async function waitForAny(page, selectors, timeout = 30000) {
  const deadline = Date.now() + timeout
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const selector of selectors) {
      if (await page.locator(selector).count()) {
        try {
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 250 })
          return selector
        } catch {
          // continue polling
        }
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for any selector: ${selectors.join(', ')}`)
    }
    await page.waitForTimeout(120)
  }
}

async function findClickableIndexByText(page, text) {
  return page.evaluate((needle) => {
    const elements = Array.from(document.querySelectorAll('button, [role="button"]'))
    let fuzzyIndex = -1

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]
      const label = ((element.innerText || element.textContent || '')).replace(/\s+/g, ' ').trim()
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      const isEnabled = !(element instanceof HTMLButtonElement) || !element.disabled
      if (!isVisible || !isEnabled) continue
      if (label === needle) {
        return index
      }
      if (fuzzyIndex === -1 && label.includes(needle)) {
        fuzzyIndex = index
      }
    }

    return fuzzyIndex
  }, text)
}

async function hasButtonText(page, text) {
  return (await findClickableIndexByText(page, text)) >= 0
}

async function clickButtonByText(page, text) {
  const targetIndex = await findClickableIndexByText(page, text)
  if (targetIndex < 0) return false
  await page.locator('button, [role="button"]').nth(targetIndex).click()
  return true
}

async function waitForButtonText(page, text, timeout = 15000) {
  const deadline = Date.now() + timeout
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await hasButtonText(page, text)) {
      return true
    }
    if (Date.now() > deadline) {
      return false
    }
    await page.waitForTimeout(200)
  }
}

async function screenshot(page, name) {
  const path = join(outputDir, name)
  await page.screenshot({ path, fullPage: true })
  return rel(path)
}

async function findChromeExecutablePath() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const directCandidates = [
    process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    process.env.CHROME_EXECUTABLE_PATH,
    home ? join(home, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter(Boolean)

  for (const candidate of directCandidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  const puppeteerChromeRoot = home ? join(home, '.cache', 'puppeteer', 'chrome') : null
  if (puppeteerChromeRoot && existsSync(puppeteerChromeRoot)) {
    const versions = await readdir(puppeteerChromeRoot, { withFileTypes: true })
    const orderedVersions = versions
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()

    for (const version of orderedVersions) {
      const candidate = join(puppeteerChromeRoot, version, 'chrome-win64', 'chrome.exe')
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

async function launchBrowser(channel) {
  try {
    const browser = await chromium.launch({ channel, headless: true })
    return { ok: true, browser, detail: `${channel}-channel` }
  } catch (error) {
    if (channel === 'chrome') {
      const executablePath = await findChromeExecutablePath()
      if (executablePath) {
        try {
          const browser = await chromium.launch({ executablePath, headless: true })
          return { ok: true, browser, detail: relative(repoRoot, executablePath).replace(/\\/g, '/') }
        } catch (fallbackError) {
          return {
            ok: false,
            error: `${error instanceof Error ? error.message : String(error)}\nFallback executable failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          }
        }
      }
    }

    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function buildAssetSummary() {
  const assetsDir = join(repoRoot, 'client', 'dist', 'assets')
  const files = existsSync(assetsDir)
    ? await readdir(assetsDir, { withFileTypes: true })
    : []
  const rows = []
  for (const entry of files) {
    if (!entry.isFile()) continue
    const path = join(assetsDir, entry.name)
    const fileStat = await stat(path)
    rows.push({
      name: entry.name,
      bytes: fileStat.size,
      kb: Number((fileStat.size / 1024).toFixed(1)),
    })
  }
  rows.sort((a, b) => b.bytes - a.bytes)
  return {
    largestAssets: rows.slice(0, 10),
    noObviousRegression: rows[0]?.bytes < 500 * 1024 && rows.filter((item) => item.bytes > 300 * 1024).length <= 2,
  }
}

function isGanttRefreshRequest(url, projectId) {
  return (
    (url.includes('/api/tasks?') && url.includes(`projectId=${projectId}`))
    || url.includes(`/api/task-conditions?projectId=${projectId}`)
    || url.includes(`/api/task-obstacles?projectId=${projectId}`)
    || url.includes(`/api/delay-requests?projectId=${projectId}`)
  )
}

async function main() {
  await ensureDir(outputDir)

  const manifest = await readJson(manifestPath)
  const ownerSession = await apiLogin(manifest.accounts.owner.username, manifest.accounts.owner.password)
  const adminSession = await apiLogin(manifest.accounts.companyAdmin.username, manifest.accounts.companyAdmin.password)
  const perfProject = await ensurePerfProject(ownerSession)
  const monthlyGenerationMonth = await findUnusedMonthlyMonth(manifest.projects.standard.id, ownerSession.token)

  const summary = {
    generatedAt: nowIso(),
    baseUrl: BASE_URL,
    apiBaseUrl: API_BASE,
    projects: {
      standard: manifest.projects.standard,
      large: manifest.projects.large,
      empty: manifest.projects.empty,
      perf300: perfProject,
    },
    browsers: {},
    checks: {},
    screenshots: {},
    failedChecks: [],
  }

  const record = (key, payload) => {
    summary.checks[key] = payload
    if (payload.pass === false || payload.status === 'blocked') {
      summary.failedChecks.push(key)
    }
  }

  const dashboardFallbackSelectors = [
    '[data-testid="dashboard-page"]',
    '[data-testid="dashboard-critical-path-summary"]',
    '[data-testid="dashboard-empty-state"]',
    '[data-testid="dashboard-governance-signal"]',
  ]
  const reportsFallbackSelectors = [
    '[data-testid="reports-current-metrics"]',
    '[data-testid="reports-deviation-lock-card"]',
    '[data-testid="reports-critical-path-summary"]',
    'text=偏差分析暂不可用',
    'text=暂无偏差分析数据',
  ]

  const edgeLaunch = await launchBrowser('msedge')
  summary.browsers.edge = edgeLaunch.ok ? edgeLaunch.detail ?? 'available' : edgeLaunch.error
  const chromeLaunch = await launchBrowser('chrome')
  summary.browsers.chrome = chromeLaunch.ok ? chromeLaunch.detail ?? 'available' : chromeLaunch.error
  if (chromeLaunch.ok) {
    await chromeLaunch.browser.close()
  }
  record('chrome-main-flow-availability', {
    pass: chromeLaunch.ok,
    status: chromeLaunch.ok ? 'ready' : 'blocked',
    detail: chromeLaunch.ok ? `Chrome ready via ${chromeLaunch.detail ?? 'channel'}` : chromeLaunch.error,
  })

  if (!edgeLaunch.ok) {
    throw new Error(`Edge browser unavailable: ${edgeLaunch.error}`)
  }

  const edge = edgeLaunch.browser

  try {
    // Edge main flow + responsive widths
    for (const viewport of [
      { width: 1920, height: 1080, key: 'desktop-1920' },
      { width: 1366, height: 768, key: 'desktop-1366' },
      { width: 375, height: 812, key: 'mobile-375' },
    ]) {
      const adminContext = await newAuthedContext(edge, adminSession.token, viewport)
      const ownerContext = await newAuthedContext(edge, ownerSession.token, viewport)
      const adminPage = await adminContext.newPage()
      const ownerPage = await ownerContext.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(adminPage, diagnostics)
      attachDiagnostics(ownerPage, diagnostics)

      await timedGoto(adminPage, `${BASE_URL}/#/company`, '[data-testid="company-project-card"]', { extraWaitMs: 250 })
      const newProjectVisible = await adminPage.getByText('新建项目').first().isVisible()

      await timedGoto(ownerPage, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/dashboard`, '[data-testid="dashboard-global-summary"]', {
        extraWaitMs: 250,
        fallbackSelectors: dashboardFallbackSelectors,
      })
      const quickLinkVisible = await ownerPage.locator('[data-testid="dashboard-open-gantt-quick-link"]').isVisible()

      if (viewport.width === 375) {
        await ownerPage.locator('button[aria-label="打开导航菜单"]').click()
        await ownerPage.waitForSelector('#app-sidebar', { state: 'visible' })
      }

      summary.screenshots[`company-${viewport.key}`] = await screenshot(adminPage, `wave8-company-${viewport.key}.png`)
      summary.screenshots[`dashboard-${viewport.key}`] = await screenshot(ownerPage, `wave8-dashboard-${viewport.key}.png`)

      record(`edge-main-flow-${viewport.key}`, {
        pass: newProjectVisible && quickLinkVisible && diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0,
        viewport,
        diagnostics,
      })

      await adminContext.close()
      await ownerContext.close()
    }

    // Accessibility: skip link / login dialog focus trap / focus restore
    {
      const context = await edge.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await page.goto(`${BASE_URL}/#/company?login=1`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="login-dialog"]')

      await page.keyboard.press('Shift+Tab')
      const skipLinkText = await page.locator('a.skip-link').textContent()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      const focusStates = []
      for (let i = 0; i < 4; i += 1) {
        await page.keyboard.press('Tab')
        focusStates.push(await page.evaluate(() => {
          const el = document.activeElement
          return {
            tag: el?.tagName || null,
            insideDialog: Boolean(el?.closest('[data-testid="login-dialog"]')),
            label: el?.getAttribute('aria-label') || (el?.textContent || '').trim().slice(0, 20),
          }
        }))
      }

      await context.close()

      record('accessibility-skiplink-and-dialog-focus', {
        pass: skipLinkText?.includes('跳到主要内容') && focusStates.every((item) => item.insideDialog),
        skipLinkText,
        focusStates,
        diagnostics,
      })
    }

    {
      const context = await edge.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' })
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/#/company`, { waitUntil: 'domcontentloaded' })
      const headerButtons = page.locator('header button')
      const count = await headerButtons.count()
      await headerButtons.nth(count - 1).click()
      await page.locator('[role="menuitem"]').filter({ hasText: '登录' }).click()
      await page.waitForSelector('[data-testid="login-dialog"]')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const active = await page.evaluate(() => {
        const el = document.activeElement
        return {
          tag: el?.tagName || null,
          aria: el?.getAttribute('aria-label') || null,
        }
      })
      await context.close()
      record('dialog-focus-restore', {
        pass: active?.tag === 'BUTTON',
        active,
      })
    }

    // Performance timings
    {
      const context = await newAuthedContext(edge, adminSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const ms = await timedGoto(page, `${BASE_URL}/#/company`, '[data-testid="company-project-overview-title"]', { extraWaitMs: 300 })
      summary.screenshots.companyColdStart = await screenshot(page, 'wave8-company-cold-start.png')
      record('company-cockpit-cold-start', { pass: ms < 3000, ms, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const ms = await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/dashboard`, '[data-testid="dashboard-global-summary"]', {
        extraWaitMs: 300,
        fallbackSelectors: dashboardFallbackSelectors,
      })
      summary.screenshots.dashboardPerf = await screenshot(page, 'wave8-dashboard-perf.png')
      record('dashboard-first-screen', { pass: ms <= 2000, ms, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const ms = await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.large.id}/gantt`, '[data-testid="gantt-task-rows"]', { extraWaitMs: 500 })
      summary.screenshots.gantt1000 = await screenshot(page, 'wave8-gantt-1000.png')
      record('gantt-1000-load', { pass: ms <= 5000, ms, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const ms = await timedGoto(page, `${BASE_URL}/#/projects/${perfProject.id}/gantt`, '[data-testid="gantt-task-rows"]')
      const firstCheckbox = page.locator('[data-testid^="gantt-task-checkbox-"]').first()
      await firstCheckbox.click()
      const checked = await firstCheckbox.isChecked()
      summary.screenshots.gantt300 = await screenshot(page, 'wave8-gantt-300.png')
      record('gantt-300-first-render', { pass: ms < 1000 && checked, ms, checked, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/reports`, '[data-testid="reports-module-tabs"]', { extraWaitMs: 400 })
      const deviationEntry = page.locator('[data-testid="analysis-entry-deviation"]')
      const startedAt = Date.now()
      if (await deviationEntry.count()) {
        await deviationEntry.first().click()
      }
      await waitForAny(page, [
        '[data-testid="reports-current-metrics"]',
        '[data-testid="deviation-filter-chips"]',
        '[data-testid="reports-deviation-lock-card"]',
        '[data-testid="reports-critical-path-summary"]',
        'text=偏差分析暂不可用',
        'text=暂无偏差分析数据',
      ])
      const ms = Date.now() - startedAt
      summary.screenshots.reports = await screenshot(page, 'wave8-reports-deviation.png')
      record('reports-query', { pass: ms <= 3000, ms, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await page.goto(`${BASE_URL}/#/projects/${manifest.projects.standard.id}/planning/monthly?month=${monthlyGenerationMonth}`, { waitUntil: 'domcontentloaded' })
      await waitForAny(page, [
        '[data-testid="monthly-plan-tree-block"]',
        '[data-testid="monthly-plan-review-block"]',
        'text=尚未生成月度草稿',
        'text=生成本月草稿',
        'text=改为按当前任务列表预编制',
      ], 20000)

      if (await hasButtonText(page, '改为按当前任务列表预编制')) {
        await clickButtonByText(page, '改为按当前任务列表预编制')
      } else if (await hasButtonText(page, '基于当前任务列表生成')) {
        await clickButtonByText(page, '基于当前任务列表生成')
      }

      let generated = null
      if (await waitForButtonText(page, '生成本月草稿', 15000)) {
        const startedAt = Date.now()
        const clicked = await clickButtonByText(page, '生成本月草稿')
        if (!clicked) {
          throw new Error('Could not click visible 生成本月草稿 action')
        }
        await waitForAny(page, [
          '[data-testid="monthly-plan-tree-block"]',
          '[data-testid="monthly-plan-review-block"]',
          'button:has-text("保存草稿快照")',
          'text=已生成月度草稿',
        ])
        generated = { month: monthlyGenerationMonth, ms: Date.now() - startedAt }
      }
      summary.screenshots.monthly = await screenshot(page, 'wave8-monthly-generated.png')
      record('monthly-generate', {
        pass: Boolean(generated && generated.ms <= 3000),
        ...(generated || { month: null, ms: null }),
        diagnostics,
      })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/gantt`, '[data-testid="gantt-task-rows"]', { extraWaitMs: 300 })
      await page.locator('[data-testid="gantt-open-critical-path-dialog"]').click()
      await page.waitForSelector('[data-testid="critical-path-dialog"]')
      const refreshButton = page
        .locator('[data-testid="critical-path-dialog"] button')
        .filter({ hasText: '刷新快照' })
        .first()
      await refreshButton.waitFor({ state: 'visible' })
      const refreshButtonHandle = await refreshButton.elementHandle()
      await page.waitForFunction((button) => Boolean(button && !button.disabled), refreshButtonHandle)
      const startedAt = Date.now()
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes(`/api/projects/${manifest.projects.standard.id}/critical-path/refresh`)
          && response.request().method() === 'POST'),
        refreshButton.click(),
      ])
      const ms = Date.now() - startedAt
      summary.screenshots.criticalPath = await screenshot(page, 'wave8-critical-path-dialog.png')
      record('cpm-refresh', { pass: ms <= 2000, ms, diagnostics })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await timedGoto(page, `${BASE_URL}/#/projects/${perfProject.id}/gantt`, '[data-testid="gantt-task-rows"]', { extraWaitMs: 250 })
      const checkboxes = page.locator('[data-testid^="gantt-task-checkbox-"]')
      const total = Math.min(await checkboxes.count(), 105)
      for (let index = 0; index < total; index += 1) {
        await checkboxes.nth(index).check()
      }
      const startedAt = Date.now()
      await page.locator('[data-testid="gantt-batch-complete"]').click()
      await page.waitForFunction(() => {
        const bar = document.querySelector('[data-testid="batch-action-bar"]')
        return !bar || !bar.className.includes('translate-y-0')
      })
      const ms = Date.now() - startedAt
      summary.screenshots.batch = await screenshot(page, 'wave8-gantt-batch-complete.png')
      record('batch-complete-100-plus', { pass: ms <= 5000, ms, selectedCount: total, diagnostics })
      await context.close()
    }

    // Stability checks
    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const reportRequests = []
      page.on('requestfinished', (request) => {
        if (!request.url().includes('/api/')) return
        if (request.url().includes('/reports') || request.url().includes('/critical-path') || request.url().includes('/project-summary')) {
          reportRequests.push({ url: request.url(), at: Date.now() })
        }
      })
      await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/reports?view=deviation`, '[data-testid="reports-module-tabs"]', {
        extraWaitMs: 1000,
        fallbackSelectors: reportsFallbackSelectors,
      })
      const before = reportRequests.length
      await page.waitForTimeout(4000)
      const after = reportRequests.length
      record('reports-no-recalc-storm', {
        pass: after - before <= 1 && diagnostics.consoleErrors.length === 0,
        requestsAfterSettled: after - before,
        diagnostics,
      })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      const ganttRequests = []
      page.on('request', (request) => {
        if (
          isGanttRefreshRequest(request.url(), manifest.projects.standard.id)
          && page.url().includes(`#/projects/${manifest.projects.standard.id}/gantt`)
        ) {
          ganttRequests.push({ url: request.url(), at: Date.now() })
        }
      })
      await timedGoto(page, `${BASE_URL}/#/projects/${manifest.projects.standard.id}/gantt`, '[data-testid="gantt-task-rows"]', { extraWaitMs: 200 })
      const startCount = ganttRequests.length
      await page.waitForTimeout(4500)
      const mountedRefreshCount = ganttRequests.length - startCount
      await page.goto(`${BASE_URL}/#/projects/${manifest.projects.standard.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      const leaveCount = ganttRequests.length
      await page.waitForTimeout(4500)
      const afterLeaveCount = ganttRequests.length - leaveCount
      record('interval-cleanup-after-unmount', {
        pass: mountedRefreshCount >= 1 && afterLeaveCount === 0,
        mountedRefreshCount,
        afterLeaveCount,
        diagnostics,
      })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await page.route(`**/api/dashboard/project-summary*`, async (route) => {
        await sleep(1400)
        await route.continue()
      })
      await page.goto(`${BASE_URL}/#/projects/${manifest.projects.standard.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(120)
      await page.goto(`${BASE_URL}/#/projects/${manifest.projects.standard.id}/reports`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="reports-module-tabs"]')
      await page.waitForTimeout(1800)
      const noisy = diagnostics.consoleErrors.filter((message) => /unmounted|setState|state update/i.test(message))
      record('route-switch-request-cancel', {
        pass: noisy.length === 0 && diagnostics.pageErrors.length === 0,
        noisyConsoleErrors: noisy,
        diagnostics,
      })
      await context.close()
    }

    {
      const context = await newAuthedContext(edge, ownerSession.token, { width: 1366, height: 768 })
      const page = await context.newPage()
      const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
      attachDiagnostics(page, diagnostics)
      await page.goto(`${BASE_URL}/#/projects/${manifest.projects.standard.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(80)
      await page.evaluate(({ standardId, largeId }) => {
        window.location.hash = `#/projects/${standardId}/dashboard`
        window.setTimeout(() => {
          window.location.hash = `#/projects/${largeId}/dashboard`
        }, 20)
      }, {
        standardId: manifest.projects.standard.id,
        largeId: manifest.projects.large.id,
      })
      await page.waitForSelector('[data-testid="dashboard-page"]')
      try {
        await page.waitForFunction((projectName) => {
          return document.querySelector('header')?.textContent?.includes(projectName) ?? false
        }, manifest.projects.large.name, { timeout: 3000 })
      } catch {
        // Fall through to the final assertion so the summary captures the observed header text.
      }
      const activeProject = await page.locator('header').textContent()
      record('fast-project-switch-race-control', {
        pass: activeProject?.includes(manifest.projects.large.name) && diagnostics.consoleErrors.length === 0,
        activeProject,
        diagnostics,
      })
      await context.close()
    }

    const assetSummary = await buildAssetSummary()
    record('build-asset-size-regression', {
      pass: assetSummary.noObviousRegression,
      assetSummary,
    })

    const summaryPath = join(outputDir, 'wave8-browser-summary.json')
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    console.log(summaryPath)

    if (summary.failedChecks.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await edge.close()
  }
}

main().catch(async (error) => {
  const path = join(outputDir, 'wave8-browser-summary.error.json')
  const payload = {
    generatedAt: nowIso(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }
  await ensureDir(outputDir)
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(path)
  process.exitCode = 1
})
