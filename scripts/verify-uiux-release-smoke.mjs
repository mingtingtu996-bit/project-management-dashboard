import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
const outputDir = join(repoRoot, process.env.UIUX_RELEASE_SMOKE_OUTPUT_DIR || 'project-ui/artifacts/uiux-release-smoke')
const summaryPath = join(outputDir, 'release-smoke-summary.json')

const port = Number(process.env.PORT || 4173)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const currentMonth = process.env.UIUX_RELEASE_MONTH || new Date().toISOString().slice(0, 7)
const shouldStartPreview = process.env.RELEASE_SMOKE_START_PREVIEW !== 'false'

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

function isIgnorableConsoleError(message) {
  if (message === 'Failed to load resource: net::ERR_ABORTED') return true
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

function isIgnorablePageError(error) {
  return error?.message === 'signal is aborted without reason'
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!isIgnorableConsoleError(text)) diagnostics.consoleErrors.push(text)
  })

  page.on('pageerror', (error) => {
    if (isIgnorablePageError(error)) return
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

async function ensureFile(filePath, message) {
  try {
    await access(filePath, constants.R_OK)
  } catch {
    throw new Error(message)
  }
}

async function readManifest() {
  await ensureFile(manifestPath, 'Missing .tmp/full-app-test-env/manifest.json. Run npm run prepare:test-env:full-app first.')
  return JSON.parse(await readFile(manifestPath, 'utf8'))
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
  return json.data ?? json
}

async function apiLogin(account) {
  const data = await fetchJson(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password }),
  })
  assert(data?.token, `API login did not return token for ${account.username}`)
  return data
}

async function primeAuthSession(page, session) {
  const currentCompanyId = session.user?.currentCompanyId ?? null
  await page.addInitScript(({ token, companyId }) => {
    window.localStorage.setItem('auth_token', token)
    window.localStorage.setItem('access_token', token)
    if (companyId) window.localStorage.setItem('current_company_id', companyId)
    else window.localStorage.removeItem('current_company_id')
  }, { token: session.token, companyId: currentCompanyId })
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
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-release-smoke:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-release-smoke:preview] ${chunk}`))
  return child
}

async function waitForAny(page, selectors, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first()
      if (await locator.isVisible().catch(() => false)) return selector
    }
    await page.waitForTimeout(150)
  }
  throw new Error(`Timed out waiting for any selector: ${selectors.join(', ')}`)
}

async function waitForAll(page, selectors) {
  for (const selector of selectors) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30000 })
  }
}

function mainPages(projectId) {
  return [
    {
      key: 'company-cockpit',
      path: '/company',
      any: ['[data-testid="company-cockpit-page"]'],
    },
    {
      key: 'dashboard',
      path: projectRoute(projectId, '/dashboard'),
      any: ['[data-testid="dashboard-page"]'],
      must: [
        '[data-testid="dashboard-decision-overview"]',
        '[data-testid="dashboard-health-weakness-panel"]',
        '[data-testid="dashboard-action-panel"]',
        '[data-testid="dashboard-snapshot-panel"]',
      ],
    },
    {
      key: 'milestones',
      path: projectRoute(projectId, '/milestones'),
      any: ['[data-testid="milestones-summary-grid"]'],
    },
    {
      key: 'planning-baseline',
      path: projectRoute(projectId, '/planning/baseline'),
      any: ['[data-testid="planning-shared-shell"]'],
      must: ['[data-testid="baseline-version-bar"]', '[data-testid="baseline-tree-editor"]'],
    },
    {
      key: 'planning-monthly',
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      must: ['[data-testid="planning-page-tabs"]'],
    },
    {
      key: 'gantt-view',
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      must: ['[data-testid="gantt-task-rows"]'],
    },
    {
      key: 'task-summary',
      path: projectRoute(projectId, '/task-summary'),
      any: ['[data-testid="task-summary-page"]'],
      must: ['[data-testid="task-summary-results-section"]'],
    },
    {
      key: 'responsibility-view',
      path: projectRoute(projectId, '/responsibility'),
      any: ['[data-testid="responsibility-page"]'],
    },
    {
      key: 'risk-management',
      path: projectRoute(projectId, '/risks'),
      any: ['[data-testid="risk-summary-band"]'],
      must: ['[data-testid="risk-chain-workspace"]'],
    },
    {
      key: 'reports',
      path: projectRoute(projectId, '/reports?view=progress'),
      any: ['[data-testid="reports-module-tabs"]'],
      must: ['[data-testid="reports-current-metrics"]'],
    },
    {
      key: 'pre-milestones',
      path: projectRoute(projectId, '/pre-milestones'),
      any: ['[data-testid="pre-milestones-page"]'],
      must: ['[data-testid="pre-milestones-tab-board"]'],
    },
    {
      key: 'drawings',
      path: projectRoute(projectId, '/drawings'),
      any: ['[data-testid="drawings-page"]'],
      must: ['[data-testid="drawing-package-board"]'],
    },
    {
      key: 'materials',
      path: projectRoute(projectId, '/materials'),
      any: ['[data-testid="materials-page"]'],
      must: ['[data-testid="materials-toolbar-card"]'],
    },
    {
      key: 'acceptance-timeline',
      path: projectRoute(projectId, '/acceptance'),
      any: ['[data-testid="acceptance-summary-panel"]', '[data-testid="acceptance-flow-board"]'],
    },
    {
      key: 'notifications',
      path: `/notifications?projectId=${projectId}`,
      any: ['[data-testid="notifications-page"]'],
      must: ['[data-testid="notifications-summary-total"]'],
    },
  ]
}

function overlayStates(projectId) {
  return [
    {
      key: 'gantt-scope-dialog',
      path: projectRoute(projectId, '/gantt'),
      ready: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => {
        await page.getByTestId('gantt-generation-template-menu').click()
        await page.getByTestId('gantt-open-engineering-objects').click()
        await page.getByTestId('gantt-engineering-objects-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'gantt-critical-path-dialog',
      path: projectRoute(projectId, '/gantt'),
      ready: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => {
        await page.getByTestId('gantt-critical-path-summary-chip').click()
        await page.getByTestId('critical-path-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'baseline-more-columns-popover',
      path: projectRoute(projectId, '/planning/baseline'),
      ready: ['[data-testid="planning-shared-shell"]'],
      action: async (page) => {
        await page.getByTestId('planning-more-columns-trigger').click()
        await page.getByTestId('planning-more-columns-popover').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
    {
      key: 'monthly-confirm-dialog',
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      ready: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      action: async (page) => {
        await page.getByTestId('monthly-plan-standard-confirm-entry').click()
        await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible', timeout: 20000 })
      },
    },
  ]
}

async function assertHealthyPage(page, key, diagnostics) {
  const bodyText = await page.locator('body').innerText({ timeout: 10000 })
  assert(bodyText.trim().length > 20, `${key} rendered a nearly blank page`)
  assert(!(await page.getByTestId('login-dialog').isVisible().catch(() => false)), `${key} unexpectedly shows login dialog`)
  assert(diagnostics.apiFailures.length === 0, `${key} API failures: ${JSON.stringify(diagnostics.apiFailures)}`)
  assert(diagnostics.pageErrors.length === 0, `${key} page errors: ${diagnostics.pageErrors.join(' | ')}`)
  assert(diagnostics.consoleErrors.length === 0, `${key} console errors: ${diagnostics.consoleErrors.join(' | ')}`)
}

async function saveScreenshot(page, key) {
  const filePath = join(outputDir, `${key}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  return rel(filePath)
}

async function uiLogin(page, account, { redirect = '/company', readyTestId = 'company-cockpit-page' } = {}) {
  await page.goto(route(`/workspace?login=1&redirect=${encodeURIComponent(redirect)}`), { waitUntil: 'domcontentloaded' })
  await page.getByTestId('login-dialog').waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('#login-username').fill(account.username)
  await page.locator('#login-password').fill(account.password)
  await page.getByTestId('login-dialog').getByRole('button', { name: /^登录$/ }).click()
  await page.getByTestId('login-dialog').waitFor({ state: 'hidden', timeout: 30000 })
  await page.getByTestId(readyTestId).waitFor({ state: 'visible', timeout: 30000 })
  const tokenPresent = await page.evaluate(() => Boolean(window.localStorage.getItem('auth_token')))
  assert(tokenPresent, 'UI login completed without auth_token')
}

async function switchProjectFromCompany(page, projectId) {
  await page.goto(route('/company'), { waitUntil: 'domcontentloaded' })
  await page.getByTestId('company-project-overview').waitFor({ state: 'visible', timeout: 30000 })
  await page.locator(`a[href$="#/projects/${projectId}/dashboard"], a[href$="/#/projects/${projectId}/dashboard"]`).first().click()
  await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 30000 })
  assert(page.url().includes(`/projects/${projectId}/dashboard`), `Project switch landed on unexpected URL: ${page.url()}`)
}

async function runMainPageSmoke(page, projectId, summary, states = mainPages(projectId)) {
  for (const state of states) {
    const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
    attachDiagnostics(page, diagnostics)
    await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
    const matched = await waitForAny(page, state.any)
    if (state.must?.length) await waitForAll(page, state.must)
    await page.waitForTimeout(250)
    await assertHealthyPage(page, state.key, diagnostics)
    const screenshot = await saveScreenshot(page, `page-${state.key}`)
    summary.pages.push({ key: state.key, path: state.path, matched, screenshot, status: 'passed' })
  }
}

async function runOverlaySmoke(page, projectId, summary) {
  for (const state of overlayStates(projectId)) {
    const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
    attachDiagnostics(page, diagnostics)
    await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
    await waitForAny(page, state.ready)
    await state.action(page)
    await page.waitForTimeout(250)
    await assertHealthyPage(page, state.key, diagnostics)
    const screenshot = await saveScreenshot(page, `overlay-${state.key}`)
    await page.keyboard.press('Escape')
    summary.overlays.push({ key: state.key, path: state.path, screenshot, status: 'passed' })
  }
}

async function runNonDestructiveOperation(page, projectId, summary) {
  await page.goto(route(projectRoute(projectId, '/dashboard')), { waitUntil: 'domcontentloaded' })
  await page.getByLabel('打开命令面板').first().click()
  const search = page.getByTestId('command-palette-search')
  await search.waitFor({ state: 'visible', timeout: 20000 })
  await search.fill('FULLAPP')
  const value = await search.inputValue()
  assert(value === 'FULLAPP', `Search input value mismatch: ${value}`)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '命令面板' }).waitFor({ state: 'hidden', timeout: 5000 })
  summary.nonDestructiveOperation = { name: 'command-palette-search-fill', value, status: 'passed' }
}

async function uiLogout(page) {
  await page.getByRole('button', { name: '打开用户菜单' }).click()
  await page.getByRole('menuitem', { name: /退出登录/ }).click()
  await page.getByTestId('login-dialog').waitFor({ state: 'visible', timeout: 30000 })
  const tokenPresent = await page.evaluate(() => Boolean(window.localStorage.getItem('auth_token')))
  assert(!tokenPresent, 'Logout did not clear auth_token')
  return { loginDialogVisible: true, tokenCleared: true, status: 'passed' }
}

async function newReleaseContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'zh-CN',
  })
  await context.addInitScript(() => {
    window.localStorage.removeItem('auth_token')
    window.localStorage.removeItem('access_token')
    window.localStorage.removeItem('current_company_id')
    window.localStorage.setItem('onboarding_workspace_completed', 'true')
    window.localStorage.setItem('onboarding_project_completed', 'true')
    window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  })
  return context
}

async function main() {
  await ensureFile(distIndex, 'client/dist/index.html is missing. Run npm run build --workspace=client first.')
  const manifest = await readManifest()
  const projectId = manifest.projects?.standard?.id
  const adminAccount = manifest.accounts?.companyAdmin
  const projectAccount = manifest.accounts?.owner || adminAccount
  assert(projectId, 'Manifest is missing projects.standard.id')
  assert(adminAccount?.username && adminAccount?.password, 'Manifest is missing company admin account credentials')
  assert(projectAccount?.username && projectAccount?.password, 'Manifest is missing project account credentials')

  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  let preview = null
  if (shouldStartPreview) {
    preview = startPreviewServer()
    assert(await waitForHttpOk(baseUrl, 30000), `Preview server did not become ready at ${baseUrl}`)
  }
  assert(await waitForHttpOk(`${apiBaseUrl}/api/readyz`, 30000), `API did not become ready at ${apiBaseUrl}`)

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    projectId,
    adminAccount: adminAccount.username,
    projectAccount: projectAccount.username,
    month: currentMonth,
    pages: [],
    overlays: [],
    nonDestructiveOperation: null,
    logout: null,
    diagnostics: [],
    status: 'running',
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const adminContext = await newReleaseContext(browser)
    const page = await adminContext.newPage()
    page.setDefaultTimeout(30000)

    const loginDiagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
    attachDiagnostics(page, loginDiagnostics)
    const adminSession = await apiLogin(adminAccount)
    await primeAuthSession(page, adminSession)
    await page.goto(route('/company'), { waitUntil: 'domcontentloaded' })
    await page.getByTestId('company-cockpit-page').waitFor({ state: 'visible', timeout: 30000 })
    await assertHealthyPage(page, 'ui-login', loginDiagnostics)
    summary.login = { mode: 'api-token', username: adminAccount.username, status: 'passed' }
    summary.loginScreenshot = await saveScreenshot(page, 'login-company')

    await switchProjectFromCompany(page, projectId)
    summary.projectSwitch = { projectId, status: 'passed', url: page.url() }
    summary.projectSwitchScreenshot = await saveScreenshot(page, 'project-switch-dashboard')

    const pageStates = mainPages(projectId)
    await runMainPageSmoke(page, projectId, summary, pageStates.filter((state) => state.key === 'company-cockpit'))
    summary.adminLogoutAfterProjectSwitch = await uiLogout(page)
    await adminContext.close()

    const projectContext = await newReleaseContext(browser)
    const projectPage = await projectContext.newPage()
    projectPage.setDefaultTimeout(30000)
    const projectLoginDiagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
    attachDiagnostics(projectPage, projectLoginDiagnostics)
    const projectSession = await apiLogin(projectAccount)
    await primeAuthSession(projectPage, projectSession)
    await projectPage.goto(route(projectRoute(projectId, '/dashboard')), { waitUntil: 'domcontentloaded' })
    await projectPage.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 30000 })
    await assertHealthyPage(projectPage, 'project-ui-login', projectLoginDiagnostics)
    summary.projectLogin = { mode: 'api-token', username: projectAccount.username, status: 'passed' }

    await runMainPageSmoke(projectPage, projectId, summary, pageStates.filter((state) => state.key !== 'company-cockpit'))
    await runOverlaySmoke(projectPage, projectId, summary)
    await runNonDestructiveOperation(projectPage, projectId, summary)
    summary.logout = await uiLogout(projectPage)
    await projectContext.close()

    summary.status = 'passed'
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    console.log(`UIUX release smoke passed: pages=${summary.pages.length}, overlays=${summary.overlays.length}`)
    console.log(`Summary: ${rel(summaryPath)}`)
  } catch (error) {
    summary.status = 'failed'
    summary.error = error instanceof Error ? error.stack || error.message : String(error)
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    throw error
  } finally {
    await browser.close()
    if (preview) preview.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
