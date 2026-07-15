import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const taskUrl = `${baseUrl}/#/projects/${projectId}/gantt`
const dashboardUrl = `${baseUrl}/#/projects/${projectId}/dashboard`

async function prime(page) {
  await primeBrowserAuth(page)
  await page.addInitScript(() => {
    window.__routeDiagnostics = {
      clicks: [],
      hashChanges: [],
      popStates: [],
      pushStates: [],
      replaceStates: [],
    }
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState
    window.history.pushState = function pushState(...args) {
      window.__routeDiagnostics.pushStates.push({
        args: args.map((item) => String(item)),
        beforeHash: location.hash,
      })
      return originalPushState.apply(this, args)
    }
    window.history.replaceState = function replaceState(...args) {
      window.__routeDiagnostics.replaceStates.push({
        args: args.map((item) => String(item)),
        beforeHash: location.hash,
      })
      return originalReplaceState.apply(this, args)
    }
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button,[role="button"]') : null
      window.__routeDiagnostics.clicks.push({
        phase: 'capture',
        defaultPrevented: event.defaultPrevented,
        target: target ? {
          tag: target.tagName,
          text: (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: target.getAttribute('href'),
        } : null,
        hash: location.hash,
      })
    }, true)
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button,[role="button"]') : null
      window.__routeDiagnostics.clicks.push({
        phase: 'bubble',
        defaultPrevented: event.defaultPrevented,
        target: target ? {
          tag: target.tagName,
          text: (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          href: target.getAttribute('href'),
        } : null,
        hash: location.hash,
      })
    })
    window.addEventListener('hashchange', (event) => {
      window.__routeDiagnostics.hashChanges.push({
        oldURL: event.oldURL,
        newURL: event.newURL,
        hash: location.hash,
      })
    }, true)
    window.addEventListener('popstate', () => {
      window.__routeDiagnostics.popStates.push({ hash: location.hash })
    }, true)
    localStorage.setItem('onboarding_workspace_completed', 'true')
    localStorage.setItem('onboarding_project_completed', 'true')
    localStorage.setItem('onboarding_notifications_completed', 'true')
    localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  })
}

async function state(page, label) {
  return {
    label,
    url: page.url(),
    hash: await page.evaluate(() => location.hash),
    title: await page.title(),
    dashboardCount: await page.locator('[data-testid="dashboard-page"]').count(),
    dashboardTitleCount: await page.locator('[data-testid="dashboard-page-title"]').count(),
    ganttBodyCount: await page.locator('[data-testid="task-workspace-body"]').count(),
    ganttRowsCount: await page.locator('[data-testid="gantt-task-rows"]').count(),
    skeletonCount: await page.locator('[data-testid="gantt-loading-skeleton"], [data-testid="page-skeleton"]').count(),
    mainText: (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500),
    diagnostics: await page.evaluate(() => window.__routeDiagnostics),
    resources: await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /Dashboard|GanttView|src\/pages/.test(name))
      .slice(-20)),
  }
}

async function clickCenter(locator) {
  await locator.first().scrollIntoViewIfNeeded()
  const box = await locator.first().boundingBox()
  if (!box) throw new Error('Cannot click target without a bounding box')
  await locator.first().page().mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const consoleMessages = []
const pageErrors = []
const badResponses = []

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('response', (response) => {
  if (response.url().includes('/api/') && response.status() >= 400) {
    badResponses.push({ status: response.status(), url: response.url() })
  }
})

try {
  await prime(page)
  await page.goto(taskUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const states = [await state(page, 'task-initial')]

  await clickCenter(page.locator(`a[href*="/projects/${projectId}/dashboard"]`))
  await page.waitForTimeout(3000)
  states.push(await state(page, 'after-sidebar-click-dashboard'))

  await page.evaluate((nextHash) => {
    location.hash = nextHash
  }, `#/projects/${projectId}/milestones`)
  await page.waitForTimeout(3000)
  states.push(await state(page, 'after-manual-hash-milestones'))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  states.push(await state(page, 'after-reload-current-hash'))

  const directPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await prime(directPage)
  await directPage.goto(dashboardUrl, { waitUntil: 'domcontentloaded' })
  await directPage.waitForTimeout(3000)
  states.push(await state(directPage, 'direct-dashboard-new-page'))
  await directPage.close()

  console.log(JSON.stringify({ states, consoleMessages, pageErrors, badResponses }, null, 2))
} finally {
  await browser.close()
}
