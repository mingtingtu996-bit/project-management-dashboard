import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const consoleMessages = []
const pageErrors = []
const requests = []

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('response', async (response) => {
  const url = response.url()
  if (!url.includes('/api/')) return
  if (response.status() >= 400) {
    requests.push({ status: response.status(), url })
  }
})

async function summarizePage(label) {
  const links = await page.locator('a').evaluateAll((items) => items
    .map((item) => {
      const box = item.getBoundingClientRect()
      return {
        text: (item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        href: item.getAttribute('href'),
        box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        pointerEvents: getComputedStyle(item).pointerEvents,
        visible: box.width > 0 && box.height > 0,
      }
    })
    .filter((item) => item.visible && item.href)
    .slice(0, 80))
  const blockerSamples = await page.evaluate(() => {
    const samples = []
    const targets = Array.from(document.querySelectorAll('a[href*="/dashboard"], a[href*="/milestones"], a[href*="/planning/monthly"]')).slice(0, 8)
    for (const target of targets) {
      const box = target.getBoundingClientRect()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const top = document.elementFromPoint(x, y)
      samples.push({
        targetText: (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        targetHref: target.getAttribute('href'),
        point: { x: Math.round(x), y: Math.round(y) },
        topTag: top?.tagName,
        topText: (top?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        topClass: top?.getAttribute('class'),
        topTestId: top?.getAttribute('data-testid'),
      })
    }
    return samples
  })
  return {
    label,
    url: page.url(),
    hash: await page.evaluate(() => location.hash),
    title: await page.title(),
    bodyPreview: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240),
    dashboardCount: await page.locator('[data-testid="dashboard-page"]').count(),
    ganttStartEditCount: await page.locator('[data-testid="planning-start-edit"]').count(),
    links,
    blockerSamples,
    openLayers: await page.evaluate(() => Array.from(document.querySelectorAll('[data-state="open"], [role="dialog"], [data-radix-popper-content-wrapper], [aria-modal="true"]'))
      .map((node) => {
        const element = node
        const box = element.getBoundingClientRect()
        return {
          tag: element.tagName,
          role: element.getAttribute('role'),
          ariaModal: element.getAttribute('aria-modal'),
          ariaHidden: element.getAttribute('aria-hidden'),
          testId: element.getAttribute('data-testid'),
          className: element.getAttribute('class'),
          text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        }
      })),
  }
}

async function clickByHref(label, hrefPart) {
  const before = page.url()
  const locator = page.locator(`a[href*="${hrefPart}"]`).first()
  const count = await locator.count()
  if (!count) {
    return { label, before, error: `no link for ${hrefPart}` }
  }
  const box = await locator.boundingBox()
  const target = await locator.evaluate((element) => ({
    text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
    href: element.getAttribute('href'),
  }))
  try {
    await locator.scrollIntoViewIfNeeded()
    const clickBox = await locator.boundingBox()
    if (!clickBox) throw new Error('target link has no clickable box')
    await page.mouse.click(clickBox.x + clickBox.width / 2, clickBox.y + clickBox.height / 2)
  } catch (error) {
    return {
      label,
      target,
      box,
      before,
      error: error instanceof Error ? error.message : String(error),
      after: page.url(),
      openLayers: await page.evaluate(() => Array.from(document.querySelectorAll('[data-state="open"], [role="dialog"], [aria-modal="true"]'))
        .map((node) => {
          const element = node
          const box = element.getBoundingClientRect()
          return {
            tag: element.tagName,
            role: element.getAttribute('role'),
            ariaModal: element.getAttribute('aria-modal'),
            ariaHidden: element.getAttribute('aria-hidden'),
            testId: element.getAttribute('data-testid'),
            className: element.getAttribute('class'),
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
          }
        })),
    }
  }
  await page.waitForTimeout(2500)
  return {
    label,
    target,
    box,
    before,
    after: page.url(),
    hash: await page.evaluate(() => location.hash),
    dashboardCount: await page.locator('[data-testid="dashboard-page"]').count(),
    ganttStartEditCount: await page.locator('[data-testid="planning-start-edit"]').count(),
    bodyPreview: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 220),
  }
}

try {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  })
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const initial = await summarizePage('initial-tasks')
  const clicks = []
  clicks.push(await clickByHref('to-dashboard', `/projects/${projectId}/dashboard`))
  clicks.push(await clickByHref('to-milestones', `/projects/${projectId}/milestones`))
  clicks.push(await clickByHref('to-monthly', `/projects/${projectId}/planning/monthly`))

  console.log(JSON.stringify({
    baseUrl,
    projectId,
    initial,
    clicks,
    consoleMessages,
    pageErrors,
    badResponses: requests,
  }, null, 2))
} finally {
  await browser.close()
}
