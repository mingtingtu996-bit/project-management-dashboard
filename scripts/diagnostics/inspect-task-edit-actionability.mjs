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
  })
}

async function describeLocator(locator) {
  return locator.first().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const atPoint = document.elementFromPoint(centerX, centerY)
    const ancestors = []
    let node = element
    while (node && node instanceof HTMLElement && ancestors.length < 8) {
      const style = window.getComputedStyle(node)
      ancestors.push({
        tag: node.tagName.toLowerCase(),
        testid: node.getAttribute('data-testid'),
        className: node.className,
        rect: (() => {
          const r = node.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        })(),
        position: style.position,
        overflow: `${style.overflow}/${style.overflowX}/${style.overflowY}`,
        transform: style.transform,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
      })
      node = node.parentElement
    }
    return {
      text: element.textContent?.replace(/\s+/g, ' ').trim(),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      center: { x: centerX, y: centerY },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      atPoint: atPoint
        ? {
          tag: atPoint.tagName.toLowerCase(),
          testid: atPoint.getAttribute('data-testid'),
          text: atPoint.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
          className: atPoint instanceof HTMLElement ? atPoint.className : '',
        }
        : null,
      documentScroll: { x: window.scrollX, y: window.scrollY },
      ancestors,
    }
  })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const requests = []
page.on('request', (request) => {
  if (request.url().includes('/api/')) {
    requests.push({ type: 'request', at: Date.now(), url: request.url() })
  }
})
page.on('response', (response) => {
  if (response.url().includes('/api/')) {
    requests.push({ type: 'response', at: Date.now(), status: response.status(), url: response.url() })
  }
})

try {
  await prime(page)
  const startedAt = Date.now()
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1000)

  const startButton = page.getByTestId('planning-start-edit')
  console.log(JSON.stringify({
    phase: 'before-start-edit',
    elapsedMs: Date.now() - startedAt,
    startButton: await describeLocator(startButton),
    recentApi: requests.slice(-20).map((item) => ({ ...item, at: item.at - startedAt })),
  }, null, 2))

  const clickStartedAt = Date.now()
  await startButton.click({ timeout: 20000 })
  await page.getByTestId('planning-cancel').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(300)
  const cancelButton = page.getByTestId('planning-cancel')
  console.log(JSON.stringify({
    phase: 'after-start-edit',
    startClickMs: Date.now() - clickStartedAt,
    elapsedMs: Date.now() - startedAt,
    cancelButton: await describeLocator(cancelButton),
    recentApi: requests.slice(-30).map((item) => ({ ...item, at: item.at - startedAt })),
  }, null, 2))

  try {
    const trialStartedAt = Date.now()
    await cancelButton.click({ trial: true, timeout: 3000 })
    console.log(JSON.stringify({ phase: 'cancel-trial', ok: true, ms: Date.now() - trialStartedAt }, null, 2))
  } catch (error) {
    console.log(JSON.stringify({ phase: 'cancel-trial', ok: false, message: error.message }, null, 2))
  }

  try {
    const forceStartedAt = Date.now()
    await cancelButton.click({ force: true, timeout: 3000 })
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 5000 })
    console.log(JSON.stringify({ phase: 'cancel-force', ok: true, ms: Date.now() - forceStartedAt }, null, 2))
  } catch (error) {
    console.log(JSON.stringify({ phase: 'cancel-force', ok: false, message: error.message }, null, 2))
  }
} finally {
  await browser.close()
}
