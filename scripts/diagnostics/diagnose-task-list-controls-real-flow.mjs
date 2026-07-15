import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || '7a9665bb-dd41-4b03-a3dd-6c2039f9b63f'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'

async function buttonState(page, testId) {
  const locator = page.getByTestId(testId)
  const count = await locator.count()
  if (count === 0) return { testId, exists: false }
  const first = locator.first()
  const box = await first.boundingBox().catch(() => null)
  const disabled = await first.evaluate((node) => Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true')).catch(() => null)
  const center = box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : null
  const hit = center
    ? await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return element
          ? {
              tag: element.tagName,
              testId: element instanceof HTMLElement ? element.dataset.testid ?? null : null,
              text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
            }
          : null
      }, center)
    : null
  return { testId, exists: true, disabled, box, hit }
}

async function clickAndMeasure(page, testId, action) {
  const startedAt = Date.now()
  const state = await buttonState(page, testId)
  if (!state.exists || state.disabled) {
    return { testId, skipped: true, reason: !state.exists ? 'missing' : 'disabled', state }
  }
  await page.getByTestId(testId).first().click({ timeout: 8000 })
  const afterClickMs = Date.now() - startedAt
  const actionResult = action ? await action(afterClickMs) : {}
  return { testId, ms: Date.now() - startedAt, afterClickMs, state, ...actionResult }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const consoleMessages = []
const pageErrors = []
const apiTimings = []
const operations = []

page.on('console', (message) => {
  const text = message.text()
  if (message.type() === 'error' || text.includes('Failed to load resource')) {
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
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  try {
    const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
    const startedAt = Date.now()
    const response = await route.fetch({ url: forwardUrl })
    const url = new URL(forwardUrl)
    apiTimings.push({
      path: url.pathname,
      query: url.search.slice(0, 140),
      method: route.request().method(),
      status: response.status(),
      ms: Date.now() - startedAt,
    })
    await route.fulfill({ response })
  } catch (error) {
    if (String(error?.message ?? '').includes('Request context disposed')) return
    throw error
  }
})

const startedAt = Date.now()

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 25000 })
  operations.push({
    label: 'ready',
    ms: Date.now() - startedAt,
    buttons: await Promise.all([
      buttonState(page, 'planning-start-edit'),
      buttonState(page, 'gantt-open-baseline-governance'),
      buttonState(page, 'gantt-open-engineering-objects'),
      buttonState(page, 'gantt-open-critical-path-dialog'),
      buttonState(page, 'gantt-generate-template-tasks'),
      buttonState(page, 'gantt-open-export-dialog'),
      buttonState(page, 'gantt-scroll-to-today'),
      buttonState(page, 'planning-view-list'),
      buttonState(page, 'planning-view-card'),
      buttonState(page, 'planning-view-detail'),
      buttonState(page, 'planning-view-gantt'),
    ]),
  })

  operations.push(await clickAndMeasure(page, 'planning-view-card', async () => {
    await page.getByTestId('planning-view-list').waitFor({ state: 'visible', timeout: 5000 })
    return { activeText: await page.locator('body').innerText().then((text) => text.includes('卡片')) }
  }))
  operations.push(await clickAndMeasure(page, 'planning-view-list'))
  operations.push(await clickAndMeasure(page, 'gantt-open-export-dialog', async () => {
    await page.getByTestId('planning-export-dialog').waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Escape')
    return { dialogOpened: true }
  }))
  operations.push(await clickAndMeasure(page, 'gantt-open-engineering-objects', async () => {
    await page.getByTestId('gantt-engineering-objects-dialog').waitFor({ state: 'visible', timeout: 8000 })
    await page.keyboard.press('Escape')
    return { dialogOpened: true }
  }))
  operations.push(await clickAndMeasure(page, 'planning-start-edit', async () => {
    await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 8000 })
    return { saveVisible: true }
  }))

  const titleButton = page.getByTestId('gantt-task-title-inline-edit-trigger').first()
  const titleBefore = await titleButton.innerText().catch(() => '')
  await titleButton.click({ timeout: 8000 })
  const editor = page.locator('[data-planning-cell$=":title"] input').first()
  await editor.waitFor({ state: 'visible', timeout: 8000 })
  await editor.fill(`${titleBefore.trim()} 控件巡检`)
  await page.keyboard.press('Enter')
  await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 8000 })
  operations.push({
    label: 'inline-title-draft',
    ms: Date.now() - startedAt,
    saveDisabled: await page.getByTestId('planning-save').evaluate((node) => Boolean(node.disabled)),
    draftCountText: await page.getByTestId('gantt-task-draft-count').innerText().catch(() => null),
  })

  await page.getByTestId('planning-cancel').click({ timeout: 8000 })
  await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 8000 })
  operations.push({
    label: 'cancel-edit',
    ms: Date.now() - startedAt,
    startVisible: true,
  })

  await page.locator(`a[href="#/projects/${projectId}/dashboard"], a[href="/projects/${projectId}/dashboard"]`).first().click({ timeout: 8000 })
  await page.locator('[data-testid="dashboard-page"]').waitFor({ state: 'visible', timeout: 10000 })
  operations.push({ label: 'navigation-dashboard', ms: Date.now() - startedAt, url: page.url() })

  console.log(JSON.stringify({
    baseUrl,
    apiBaseUrl,
    projectId,
    totalMs: Date.now() - startedAt,
    apiTimings,
    operations,
    consoleMessages,
    pageErrors,
  }, null, 2))
} finally {
  await browser.close()
}
