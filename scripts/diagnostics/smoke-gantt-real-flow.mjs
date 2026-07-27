import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || '7a9665bb-dd41-4b03-a3dd-6c2039f9b63f'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'

function nowMs() {
  return Math.round(performance.now())
}

async function snapshot(page, label, since) {
  return {
    label,
    ms: Date.now() - since,
    url: page.url(),
    dashboardPages: await page.locator('[data-testid="dashboard-page"]').count(),
    loadingSkeletons: await page.locator('[data-testid="gantt-loading-skeleton"]').count(),
    workspaceBodies: await page.locator('[data-testid="task-workspace-body"]').count(),
    onboardingGuides: await page.locator('[data-testid="onboarding-guide"]').count(),
    startButtons: await page.locator('[data-testid="planning-start-edit"]').count(),
    saveButtons: await page.locator('[data-testid="planning-save"]').count(),
    rowText: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260),
    perf: await page.evaluate(() => window.__ganttSmokePerf),
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const consoleMessages = []
const pageErrors = []
const apiTimings = []

page.on('console', (message) => {
  const text = message.text()
  if (message.type() === 'error' || text.includes('加载甘特任务失败') || text.includes('Failed to load resource')) {
    consoleMessages.push(`${message.type()}: ${text}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.addInitScript((token) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('access_token', token)
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('gantt_view_mode_')) localStorage.removeItem(key)
  }
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('workbuddy_gantt_tasks_snapshot:')) sessionStorage.removeItem(key)
  }
  window.__ganttSmokePerf = { longTasks: [], clicks: [] }
  document.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    window.__ganttSmokePerf.clicks.push({
      time: performance.now(),
      testId: target?.dataset?.testid ?? null,
      text: target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
    })
  }, true)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__ganttSmokePerf.longTasks.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // optional browser feature
    }
  }
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  try {
    const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
    const startedAt = Date.now()
    const response = await route.fetch({ url: forwardUrl })
    const url = new URL(forwardUrl)
    apiTimings.push({
      path: url.pathname,
      query: url.search.slice(0, 120),
      status: response.status(),
      ms: Date.now() - startedAt,
    })
    await route.fulfill({ response })
  } catch (error) {
    if (String(error?.message ?? '').includes('Request context disposed')) {
      return
    }
    throw error
  }
})

const started = Date.now()
const result = {
  baseUrl,
  apiBaseUrl,
  projectId,
  apiTimings,
  snapshots: [],
  consoleMessages,
  pageErrors,
}

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
  try {
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
  } catch (error) {
    result.snapshots.push(await snapshot(page, 'gantt-start-edit-timeout', started))
    console.log(JSON.stringify(result, null, 2))
    throw error
  }
  result.snapshots.push(await snapshot(page, 'gantt-ready', started))

  const clickStart = Date.now()
  await page.getByTestId('planning-start-edit').click({ timeout: 8000 })
  await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 8000 })
  result.snapshots.push(await snapshot(page, `edit-ready-${Date.now() - clickStart}ms`, started))

  const dashboardStart = Date.now()
  await page.locator(`a[href="#/projects/${projectId}/dashboard"], a[href="/projects/${projectId}/dashboard"]`).first().click({ timeout: 8000 })
  await page.locator('[data-testid="dashboard-page"]').waitFor({ state: 'visible', timeout: 10000 })
  result.snapshots.push(await snapshot(page, `dashboard-ready-${Date.now() - dashboardStart}ms`, started))

  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
