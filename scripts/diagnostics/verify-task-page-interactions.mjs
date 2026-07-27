import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function prime(page) {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const consoleMessages = []
const pageErrors = []
const badResponses = []
const timings = {}
const hardTimeout = setTimeout(() => {
  console.error(JSON.stringify({
    ok: false,
    error: 'verify-task-page-interactions hard timeout',
    timings,
    consoleMessages,
    pageErrors,
    badResponses,
  }, null, 2))
  process.exit(1)
}, 180_000)

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    const text = message.text()
    if (!text.includes('React Router Future Flag Warning')) {
      consoleMessages.push(`${message.type()}: ${text}`)
    }
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('response', (response) => {
  if (response.url().includes('/api/') && response.status() >= 400) {
    badResponses.push({ status: response.status(), url: response.url() })
  }
})

async function measure(label, action) {
  const startedAt = Date.now()
  console.error(`[verify-task-page] start ${label}`)
  const result = await action()
  timings[label] = Date.now() - startedAt
  console.error(`[verify-task-page] done ${label} ${timings[label]}ms`)
  return result
}

async function clickCenter(locator) {
  const target = locator.first()
  await target.waitFor({ state: 'visible', timeout: 10000 })
  const box = await target.boundingBox()
  if (box) {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const viewport = page.viewportSize()
    if (!viewport || (x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height)) {
      await page.mouse.click(x, y)
      return
    }
  }
  await target.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }))
  const scrolledBox = await target.boundingBox()
  if (scrolledBox) {
    await page.mouse.click(scrolledBox.x + scrolledBox.width / 2, scrolledBox.y + scrolledBox.height / 2)
    return
  }
  await target.click({ timeout: 10000 })
}

async function clickFirstLeafTaskTitle(page) {
  const titleButtons = page.getByTestId('gantt-task-title-inline-edit-trigger')
  await titleButtons.first().waitFor({ state: 'attached', timeout: 10000 })
  const titles = await titleButtons.evaluateAll((items) => items.map((item, index) => ({
    index,
    text: (item.textContent || '').replace(/\s+/g, ' ').trim(),
    visible: (() => {
      const rect = item.getBoundingClientRect()
      return (
        rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
      )
    })(),
  })))
  const candidate = titles.find((item) => (
    item.visible
    && item.text
    && !item.text.endsWith('工程')
    && !item.text.endsWith('项目')
  )) ?? titles.find((item) => item.visible && item.text)
  if (!candidate) {
    const firstTitle = titleButtons.first()
    await firstTitle.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }))
    await page.waitForTimeout(100)
    await clickCenter(firstTitle)
    return 'first scrolled task'
  }
  await clickCenter(titleButtons.nth(candidate.index))
  return candidate.text
}

try {
  await prime(page)
  await measure('open_tasks_ms', async () => {
    await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
  })

  await measure('start_edit_ms', async () => {
    await clickCenter(page.getByTestId('planning-start-edit'))
    await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 8000 })
  })
  assert(await page.getByTestId('planning-save').isDisabled(), 'save should be disabled before edits')

  await measure('cancel_edit_ms', async () => {
    await clickCenter(page.getByTestId('planning-cancel'))
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 8000 })
  })

  await measure('open_detail_ms', async () => {
    await clickFirstLeafTaskTitle(page)
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'visible', timeout: 20000 })
  })
  await measure('close_detail_ms', async () => {
    await clickCenter(page.getByTestId('gantt-task-detail-panel').locator('button'))
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'hidden', timeout: 12000 })
  })

  await measure('switch_timeline_ms', async () => {
    await clickCenter(page.getByTestId('planning-view-gantt'))
    await page.getByTestId('gantt-timeline-view').waitFor({ state: 'visible', timeout: 10000 })
  })

  await measure('switch_list_ms', async () => {
    await clickCenter(page.getByTestId('planning-view-list'))
    await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 10000 })
  })

  await measure('open_scope_dialog_ms', async () => {
    await clickCenter(page.getByTestId('gantt-open-engineering-objects'))
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="gantt-engineering-objects-dialog"]')
      return element && !element.classList.contains('hidden') && element.getBoundingClientRect().width > 0
    }, null, { timeout: 10000 })
  })
  await clickCenter(page.getByTestId('gantt-engineering-objects-dialog').locator('button[aria-label]'))
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="gantt-engineering-objects-dialog"]')
    return !element || element.classList.contains('hidden')
  }, null, { timeout: 10000 })

  await measure('navigate_dashboard_ms', async () => {
    await clickCenter(page.locator(`a[href*="/projects/${projectId}/dashboard"]`))
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 10000 })
  })

  const result = {
    ok: true,
    finalUrl: page.url(),
    timings,
    consoleMessages,
    pageErrors,
    badResponses,
  }
  console.log(JSON.stringify(result, null, 2))
} finally {
  clearTimeout(hardTimeout)
  await browser.close()
}
