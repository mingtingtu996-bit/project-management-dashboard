import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const api = []
const consoleMessages = []
const errors = []

async function buttonProbe(testId) {
  const locator = page.getByTestId(testId)
  const count = await locator.count()
  if (count === 0) return { testId, exists: false }

  const button = locator.first()
  const disabled = await button.evaluate((node) => Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'))
  const box = await button.boundingBox().catch(() => null)
  let trialOk = false
  let trialError = null
  if (!disabled) {
    try {
      await button.click({ trial: true, timeout: 3000 })
      trialOk = true
    } catch (error) {
      trialError = String(error?.message ?? error).split('\n')[0]
    }
  }

  return {
    testId,
    exists: true,
    disabled,
    trialOk,
    trialError,
    box: box ? {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    } : null,
  }
}

page.on('console', (message) => {
  if (['error', 'warning', 'log', 'debug'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => errors.push(error.message))

await page.addInitScript((token) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('access_token', token)
  localStorage.setItem('onboarding_workspace_completed', 'true')
  localStorage.setItem('onboarding_project_completed', 'true')
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('gantt_view_mode_')) localStorage.removeItem(key)
  }
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
  const startedAt = Date.now()
  try {
    const response = await route.fetch({ url: forwardUrl, timeout: 30_000 })
    const url = new URL(forwardUrl)
    api.push({
      method: route.request().method(),
      path: url.pathname,
      query: url.search.slice(0, 120),
      status: response.status(),
      ms: Date.now() - startedAt,
    })
    await route.fulfill({ response })
  } catch (error) {
    const url = new URL(forwardUrl)
    api.push({
      method: route.request().method(),
      path: url.pathname,
      query: url.search.slice(0, 120),
      error: String(error?.message ?? error),
      ms: Date.now() - startedAt,
    })
    await route.abort('failed')
  }
})

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(Number(process.env.WAIT_MS ?? 26_000))

  const result = await page.evaluate(() => ({
    url: location.href,
    hash: location.hash,
    loadingSkeletons: document.querySelectorAll('[data-testid="gantt-loading-skeleton"]').length,
    startEdit: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
    workspace: document.querySelectorAll('[data-testid="task-workspace-body"]').length,
    alerts: Array.from(document.querySelectorAll('[role="alert"], .text-destructive'))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 10),
    body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200),
  }))
  const controls = await Promise.all([
    buttonProbe('task-list-add-first-row'),
    buttonProbe('task-list-empty-import'),
    buttonProbe('task-list-generate-tasks'),
    buttonProbe('gantt-open-export-dialog'),
    buttonProbe('gantt-open-engineering-objects'),
  ])

  let addFirstRowResult = null
  if (await page.getByTestId('task-list-add-first-row').count()) {
    try {
      await page.getByTestId('task-list-add-first-row').click({ timeout: 5000 })
      await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 5000 })
      addFirstRowResult = {
        ok: true,
        saveVisible: await page.getByTestId('planning-save').count(),
        cancelVisible: await page.getByTestId('planning-cancel').count(),
      }
      await page.getByTestId('planning-cancel').click({ timeout: 5000 })
    } catch (error) {
      addFirstRowResult = {
        ok: false,
        error: String(error?.message ?? error).split('\n')[0],
      }
    }
  }

  let dashboardNavigation = null
  const dashboardLink = page.locator(`a[href="#/projects/${projectId}/dashboard"], a[href="/projects/${projectId}/dashboard"]`).first()
  if (await dashboardLink.count()) {
    try {
      await dashboardLink.click({ timeout: 5000 })
      await page.locator('[data-testid="dashboard-page"]').waitFor({ state: 'visible', timeout: 8000 })
      dashboardNavigation = {
        ok: true,
        url: page.url(),
        dashboardPages: await page.locator('[data-testid="dashboard-page"]').count(),
      }
    } catch (error) {
      dashboardNavigation = {
        ok: false,
        url: page.url(),
        error: String(error?.message ?? error).split('\n')[0],
      }
    }
  }

  console.log(JSON.stringify({
    baseUrl,
    apiBaseUrl,
    projectId,
    result,
    controls,
    addFirstRowResult,
    dashboardNavigation,
    api,
    errors,
    consoleMessages: consoleMessages.slice(-30),
  }, null, 2))
} finally {
  await browser.close()
}
