import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const badResponses = []
const consoleMessages = []
const pageErrors = []

page.on('response', async (response) => {
  if (!response.url().includes('/api/') || response.status() < 400) return
  let text = ''
  try {
    text = (await response.text()).slice(0, 1000)
  } catch {
    // The response body may already be consumed by the application.
  }
  badResponses.push({
    status: response.status(),
    url: response.url(),
    text,
  })
})

page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.addInitScript((token) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('access_token', token)
}, authToken)

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/milestones`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('milestones-summary-grid').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(3000)

  const result = {
    baseUrl,
    projectId,
    url: page.url(),
    badResponses,
    consoleMessages,
    pageErrors,
    hasSummaryGrid: await page.getByTestId('milestones-summary-grid').count(),
    hasUnavailableToast: (await page.locator('body').innerText()).includes('服务暂时不可用'),
    bodyText: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800),
  }
  console.log(JSON.stringify(result, null, 2))

  if (badResponses.length > 0 || pageErrors.length > 0 || result.hasUnavailableToast) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
