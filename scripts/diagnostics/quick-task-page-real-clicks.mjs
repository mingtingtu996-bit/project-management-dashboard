import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`

async function prime(page) {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    window.__quickProbe = { clicks: [] }
    document.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('[data-testid], a[href]') : null
      window.__quickProbe.clicks.push({
        at: performance.now(),
        testId: target instanceof HTMLElement ? target.getAttribute('data-testid') : null,
        href: target instanceof HTMLAnchorElement ? target.getAttribute('href') : null,
        text: target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80),
      })
    }, true)
  })
}

function visibleCenter({ selector, matchText }) {
  const items = Array.from(document.querySelectorAll(selector))
  const isMatchingTarget = (item) => {
    if (!(item instanceof HTMLElement)) return false
    const textOk = matchText ? (item.textContent || '').includes(matchText) : true
    const rect = item.getBoundingClientRect()
    return textOk && rect.width > 0 && rect.height > 0
  }
  let candidate = items.find((item) => {
    if (!isMatchingTarget(item)) return false
    const rect = item.getBoundingClientRect()
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
  })
  if (!candidate) {
    candidate = items.find(isMatchingTarget)
    if (candidate instanceof HTMLElement) {
      candidate.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }
  if (!candidate) return null
  const rect = candidate.getBoundingClientRect()
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    text: candidate.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
    testId: candidate.getAttribute('data-testid'),
    href: candidate.getAttribute('href'),
  }
}

async function clickVisible(page, selector, matchText) {
  const target = await page.evaluate(visibleCenter, { selector, matchText })
  if (!target) throw new Error(`No visible target for ${selector} ${matchText ?? ''}`)
  await page.mouse.click(target.x, target.y)
  return target
}

async function waitVisible(page, selector, timeout = 10000) {
  await page.waitForFunction((sel) => {
    const element = document.querySelector(sel)
    if (!(element instanceof HTMLElement)) return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
  }, selector, { timeout })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const requests = []
page.on('request', (request) => {
  if (request.url().includes('/api/')) requests.push({ type: 'request', at: Date.now(), url: request.url() })
})
page.on('response', (response) => {
  if (response.url().includes('/api/')) requests.push({ type: 'response', at: Date.now(), status: response.status(), url: response.url() })
})

const timings = {}
async function measure(label, fn) {
  const start = Date.now()
  await fn()
  timings[label] = Date.now() - start
}

try {
  await prime(page)
  const start = Date.now()
  await measure('open_tasks_ms', async () => {
    await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="gantt-task-rows"]')), null, { timeout: 20000 })
  })
  await page.waitForTimeout(250)
  await measure('edit_click_to_save_visible_ms', async () => {
    await clickVisible(page, '[data-testid="planning-start-edit"]')
    await waitVisible(page, '[data-testid="planning-save"]')
  })
  await measure('cancel_click_to_edit_visible_ms', async () => {
    await clickVisible(page, '[data-testid="planning-cancel"]')
    await waitVisible(page, '[data-testid="planning-start-edit"]')
  })
  await measure('detail_click_to_panel_ms', async () => {
    await clickVisible(page, '[data-testid="gantt-task-title-inline-edit-trigger"]')
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="gantt-task-detail-panel"]')), null, { timeout: 20000 })
  })
  await measure('close_detail_ms', async () => {
    await page.evaluate(() => {
      const closeButton = document.querySelector('[data-testid="gantt-task-detail-panel-close"]')
      if (!(closeButton instanceof HTMLElement)) throw new Error('Missing detail panel close button')
      closeButton.click()
    })
    await page.waitForFunction(() => !document.querySelector('[data-testid="gantt-task-detail-panel"]'), null, { timeout: 10000 })
  })
  await measure('scope_dialog_ms', async () => {
    await clickVisible(page, '[data-testid="gantt-open-engineering-objects"]')
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="gantt-engineering-objects-dialog"]')
      if (!(element instanceof HTMLElement)) return false
      return !element.classList.contains('hidden') && element.getBoundingClientRect().width > 0
    }, null, { timeout: 10000 })
  })
  await measure('close_scope_dialog_ms', async () => {
    await clickVisible(page, '[data-testid="gantt-engineering-objects-dialog"] button[aria-label]')
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="gantt-engineering-objects-dialog"]')
      return !element || element.classList.contains('hidden')
    }, null, { timeout: 10000 })
  })
  await measure('navigate_dashboard_ms', async () => {
    await clickVisible(page, `a[href*="/projects/${projectId}/dashboard"]`, '仪表盘')
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="dashboard-page"]')), null, { timeout: 10000 })
  })
  console.log(JSON.stringify({
    ok: true,
    finalUrl: page.url(),
    timings,
    probe: await page.evaluate(() => window.__quickProbe),
    recentApi: requests.slice(-30).map((item) => ({ ...item, at: item.at - start })),
  }, null, 2))
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error.message, timings, url: page.url(), recentApi: requests.slice(-40) }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
