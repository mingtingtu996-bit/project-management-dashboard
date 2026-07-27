import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { primeBrowserAuth } from '../browser-auth-fixture.mjs'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const outputDir = join(process.cwd(), 'project-testing', 'artifacts', 'browser-checks')

const pages = [
  ['workspace', '/#/workspace'],
  ['company', '/#/company'],
  ['dashboard', `/#/projects/${projectId}/dashboard`],
  ['gantt', `/#/projects/${projectId}/gantt`],
  ['baseline', `/#/projects/${projectId}/planning/baseline`],
  ['monthly', `/#/projects/${projectId}/planning/monthly`],
  ['risks', `/#/projects/${projectId}/risks`],
  ['milestones', `/#/projects/${projectId}/milestones`],
  ['acceptance', `/#/projects/${projectId}/acceptance`],
  ['pre-milestones', `/#/projects/${projectId}/pre-milestones`],
  ['reports', `/#/projects/${projectId}/reports`],
  ['task-summary', `/#/projects/${projectId}/task-summary`],
  ['responsibility', `/#/projects/${projectId}/responsibility`],
  ['drawings', `/#/projects/${projectId}/drawings`],
  ['materials', `/#/projects/${projectId}/materials`],
  ['notifications', '/#/notifications'],
  ['monitoring', '/#/monitoring'],
]

function isIgnorableConsole(message) {
  return message.includes('[vite]') ||
    message.includes('React DevTools') ||
    message.includes('Sentry') ||
    message.includes('WebSocket connection') ||
    message.includes('Download the React DevTools')
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const results = []

  for (const [name, path] of pages) {
    const page = await context.newPage()
    await primeBrowserAuth(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
      window.localStorage.setItem('onboarding_notifications_completed', 'true')
    })

    const apiRequests = new Map()
    const consoleErrors = []
    const pageErrors = []
    const badResponses = []
    const startedAt = Date.now()
    const url = `${baseUrl}${path}`

    page.on('request', (request) => {
      const requestUrl = request.url()
      if (requestUrl.includes('/api/')) {
        apiRequests.set(request, { url: requestUrl, method: request.method(), startedAt: Date.now() })
      }
    })

    page.on('response', (response) => {
      const request = response.request()
      const entry = apiRequests.get(request)
      if (entry) {
        entry.status = response.status()
        entry.finishedAt = Date.now()
        entry.ms = entry.finishedAt - entry.startedAt
      }
      if (response.status() >= 400) {
        badResponses.push({
          status: response.status(),
          method: request.method(),
          url: response.url(),
        })
      }
    })

    page.on('requestfailed', (request) => {
      const entry = apiRequests.get(request)
      if (entry) {
        entry.failed = request.failure()?.errorText || 'request failed'
        entry.finishedAt = Date.now()
        entry.ms = entry.finishedAt - entry.startedAt
      }
      badResponses.push({
        status: null,
        method: request.method(),
        url: request.url(),
        failed: request.failure()?.errorText || 'request failed',
      })
    })

    page.on('console', (message) => {
      const text = message.text()
      if ((message.type() === 'error' || message.type() === 'warning') && !isIgnorableConsole(text)) {
        consoleErrors.push({
          type: message.type(),
          text,
          location: message.location(),
        })
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    await page.waitForTimeout(800)

    const routeRequests = Array.from(apiRequests.entries())
      .map(([, entry]) => entry)
      .filter((entry) => entry.url.includes('/api/'))
      .sort((left, right) => (right.ms || 0) - (left.ms || 0))

    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    const visibleButtons = await page.locator('button:visible').count().catch(() => 0)
    const visibleInputs = await page.locator('input:visible, textarea:visible, [role="combobox"]:visible').count().catch(() => 0)

    results.push({
      name,
      url,
      loadMs: Date.now() - startedAt,
      title: await page.title().catch(() => ''),
      bodyPreview: bodyText.replace(/\s+/g, ' ').slice(0, 180),
      visibleButtons,
      visibleInputs,
      apiFailures: routeRequests.filter((entry) => entry.failed || Number(entry.status) >= 400),
      badResponses,
      slowApis: routeRequests.filter((entry) => (entry.ms || 0) >= 1_000).slice(0, 8),
      maxApiMs: routeRequests[0]?.ms ?? 0,
      consoleErrors,
      pageErrors,
    })

    await page.close()
  }

  await browser.close()
  await mkdir(outputDir, { recursive: true })
  const outputPath = join(outputDir, `real-pages-performance-${Date.now()}.json`)
  await writeFile(outputPath, JSON.stringify({ baseUrl, projectId, results }, null, 2), 'utf8')

  const summary = results.map((item) => ({
    page: item.name,
    loadMs: item.loadMs,
    maxApiMs: item.maxApiMs,
    failures: item.apiFailures.length + item.badResponses.length,
    badResponses: item.badResponses.map((response) => ({
      status: response.status,
      method: response.method,
      url: response.url.replace(baseUrl, ''),
      failed: response.failed,
    })).slice(0, 6),
    consoleErrors: item.consoleErrors.length,
    slowApis: item.slowApis.map((api) => ({
      ms: api.ms,
      status: api.status,
      url: api.url.replace(baseUrl, ''),
    })),
  }))

  console.log(JSON.stringify({ outputPath, summary }, null, 2))

  const failed = results.filter((item) => item.apiFailures.length > 0 || item.badResponses.length > 0 || item.consoleErrors.length > 0 || item.pageErrors.length > 0)
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
