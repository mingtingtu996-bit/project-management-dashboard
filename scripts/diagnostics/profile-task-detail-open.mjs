import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`
const withEditPrelude = process.env.WITH_EDIT_PRELUDE === 'true'

async function prime(page) {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    window.__taskDetailProbe = { clicks: [], mutations: [], longTasks: [] }
    document.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('[data-testid]') : null
      window.__taskDetailProbe.clicks.push({
        at: performance.now(),
        testId: target?.getAttribute('data-testid'),
        text: target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
      })
    }, true)
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('[data-testid="gantt-task-detail-panel"]')
      if (panel) {
        const rect = panel.getBoundingClientRect()
        window.__taskDetailProbe.mutations.push({
          at: performance.now(),
          panelText: panel.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        })
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    if ('PerformanceObserver' in window) {
      try {
        const perfObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__taskDetailProbe.longTasks.push({
              at: entry.startTime,
              duration: entry.duration,
            })
          }
        })
        perfObserver.observe({ type: 'longtask', buffered: true })
      } catch {
        // ignored in browsers without longtask support
      }
    }
  })
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

async function pickVisibleTaskTitle() {
  const titleButtons = page.getByTestId('gantt-task-title-inline-edit-trigger')
  await titleButtons.first().waitFor({ state: 'attached', timeout: 10000 })
  const candidates = await titleButtons.evaluateAll((items) => items.map((item, index) => {
    const rect = item.getBoundingClientRect()
    const text = (item.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      index,
      text,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: (
        rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
      ),
    }
  }))
  const candidate = candidates.find((item) => item.visible && item.text) ?? candidates.find((item) => item.text)
  if (!candidate) throw new Error('No task title candidate')
  if (candidate.visible) return candidate
  await titleButtons.nth(candidate.index).scrollIntoViewIfNeeded()
  return await titleButtons.nth(candidate.index).evaluate((item, index) => {
    const rect = item.getBoundingClientRect()
    const text = (item.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      index,
      text,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: (
        rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
      ),
    }
  }, candidate.index)
}

async function clickCenter(testId) {
  const locator = page.getByTestId(testId).first()
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  const box = await locator.boundingBox()
  if (!box) throw new Error(`No box for ${testId}`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

try {
  await prime(page)
  const startedAt = Date.now()
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(2000)
  const preludeStartedAt = Date.now()
  if (withEditPrelude) {
    await clickCenter('planning-start-edit')
    await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 8000 })
    await clickCenter('planning-cancel')
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 8000 })
  }
  const preludeFinishedAt = Date.now()
  const candidate = await pickVisibleTaskTitle()
  const beforeBox = Date.now()
  const box = candidate.rect
  const afterBox = Date.now()
  const beforePanelCount = await page.getByTestId('gantt-task-detail-panel').count()
  if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) throw new Error('No task title bounding box')
  const beforeHitTest = Date.now()
  const hitBeforeClick = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return element ? {
      tag: element.tagName,
      testId: element instanceof HTMLElement ? element.getAttribute('data-testid') : null,
      text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160),
      className: element instanceof HTMLElement ? element.className : '',
    } : null
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const afterHitTest = Date.now()
  const beforeMouse = Date.now()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const afterMouse = Date.now()
  let panelError = null
  try {
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="gantt-task-detail-panel"]')), null, { timeout: 20000 })
  } catch (error) {
    panelError = error.message
  }
  const afterPanel = Date.now()
  const probe = await page.evaluate(() => window.__taskDetailProbe)
  const bodyPreview = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
  console.log(JSON.stringify({
    ok: !panelError,
    panelError,
    withEditPrelude,
    timings: {
      pageReadyMs: preludeStartedAt - startedAt,
      preludeMs: preludeFinishedAt - preludeStartedAt,
      pickAndBoxMs: afterBox - preludeFinishedAt,
      hitTestMs: afterHitTest - beforeHitTest,
      mouseClickMs: afterMouse - beforeMouse,
      panelAppearMs: afterPanel - afterMouse,
    },
    beforePanelCount,
    candidate,
    titleBox: box,
    hitBeforeClick,
    probe,
    bodyPreview: bodyPreview.replace(/\s+/g, ' ').trim().slice(0, 1000),
    recentApi: requests.slice(-30).map((item) => ({ ...item, at: item.at - startedAt })),
  }, null, 2))
} finally {
  await browser.close()
}
