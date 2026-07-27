import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || '8d0be02c-1e79-4272-a234-48792b2f32c0'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development'
const verbose = process.env.VERBOSE === '1'

const pages = [
  {
    key: 'baseline',
    url: `${baseUrl}/#/projects/${projectId}/planning/baseline`,
    readyTestId: 'baseline-open-version-records',
    requiredButtons: ['baseline-open-version-records', 'baseline-generate-draft', 'baseline-export-open'],
    safeActions: [
      { testId: 'baseline-open-version-records', expect: '[data-testid="baseline-version-records-dialog"]' },
      { testId: 'baseline-export-open', expect: '[data-testid="planning-export-dialog"]' },
      { testId: 'baseline-template-generate', optional: true, expect: '[role="dialog"]' },
      { testId: 'baseline-view-generation-candidate', optional: true, expect: '[data-testid="baseline-generation-candidate-dialog"]' },
      { testId: 'baseline-publish', optional: true, expectText: '发布项目基线' },
    ],
  },
  {
    key: 'monthly',
    url: `${baseUrl}/#/projects/${projectId}/planning/monthly`,
    readyTestId: 'monthly-plan-info-bar',
    readyAnyTestIds: ['monthly-plan-tree-block', 'monthly-plan-generate-empty'],
    requiredAnyButtons: ['monthly-plan-export-open', 'monthly-plan-generate-empty'],
    safeActions: [
      { testId: 'monthly-plan-export-open', optional: true, expect: '[data-testid="planning-export-dialog"]' },
      { testId: 'monthly-plan-confirm-draft-header', optional: true, expect: '[data-testid="monthly-plan-confirm-dialog"]' },
      { testId: 'monthly-plan-open-closeout', optional: true, expectUrlIncludes: 'view=closeout' },
    ],
  },
]

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

async function settle(page, timeout = 2500) {
  try {
    await page.waitForLoadState('networkidle', { timeout })
  } catch {
    await page.waitForTimeout(500)
  }
}

async function annotateButtons(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    return buttons
      .map((button, index) => {
        if (
          button.closest('[data-onboarding-guide-content="true"], [data-testid="onboarding-guide"], [data-testid="onboarding-daily-workflow"], .workbuddy-onboarding-panel') ||
          button.getAttribute('data-overlap-ignore') === 'true'
        ) {
          return null
        }

        button.dataset.diagButtonIndex = String(index)
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        const visible = rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.pointerEvents !== 'none'
        if (!visible) return null

        const center = {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        }
        const centerInViewport = center.x >= 0
          && center.y >= 0
          && center.x <= window.innerWidth
          && center.y <= window.innerHeight
        const hit = document.elementFromPoint(center.x, center.y)
        return {
          index,
          testId: button.dataset.testid ?? null,
          text: button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          ariaLabel: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
          disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          centerInViewport,
          centerHitInsideButton: hit ? button === hit || button.contains(hit) : false,
          hitTag: hit?.tagName ?? null,
          hitTestId: hit instanceof HTMLElement ? hit.dataset.testid ?? null : null,
          hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        }
      })
      .filter(Boolean)
  })
}

async function trialClickButtons(page, buttons) {
  const results = []
  for (const button of buttons) {
    const label = button.testId || button.ariaLabel || button.text || button.title || `button-${button.index}`
    if (button.disabled) {
      results.push({ label, skipped: true, reason: 'disabled' })
      continue
    }
    try {
      const probe = `button-${button.index}`
      await page.evaluate((descriptor) => {
        const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
        document.querySelectorAll('[data-diag-button-probe]').forEach((node) => {
          node.removeAttribute('data-diag-button-probe')
        })
        const allButtons = Array.from(document.querySelectorAll('button'))
        const candidates = allButtons.filter((candidate) => {
          if (candidate.closest('[data-onboarding-guide-content="true"], [data-testid="onboarding-guide"], [data-testid="onboarding-daily-workflow"], .workbuddy-onboarding-panel')) {
            return false
          }
          if (candidate.getAttribute('data-overlap-ignore') === 'true') return false
          if (descriptor.testId && candidate.dataset.testid !== descriptor.testId) return false
          if (!descriptor.testId && normalize(candidate.textContent) !== descriptor.text) return false
          if ((candidate.getAttribute('aria-label') ?? null) !== descriptor.ariaLabel) return false
          if ((candidate.getAttribute('title') ?? null) !== descriptor.title) return false
          return true
        })
        const candidate = candidates[0]
          ?? allButtons.find((item) => item.dataset.diagButtonIndex === String(descriptor.index))
        if (candidate) {
          candidate.setAttribute('data-diag-button-probe', descriptor.probe)
        }
      }, {
        probe,
        index: button.index,
        testId: button.testId,
        text: button.text,
        ariaLabel: button.ariaLabel ?? null,
        title: button.title ?? null,
      })
      await page.locator(`[data-diag-button-probe="${probe}"]`).click({ trial: true, timeout: 3000 })
      results.push({ label, ok: true })
    } catch (error) {
      results.push({ label, ok: false, error: error.message })
    }
  }
  return results
}

async function runSafeAction(page, action) {
  const locator = page.getByTestId(action.testId)
  const count = await locator.count()
  if (count === 0) {
    return action.optional
      ? { testId: action.testId, skipped: true, reason: 'not_present' }
      : { testId: action.testId, ok: false, error: 'button_not_found' }
  }

  const button = locator.first()
  const disabled = await button.evaluate((node) => Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'))
  if (disabled) {
    return { testId: action.testId, skipped: true, reason: 'disabled' }
  }

  const beforeUrl = page.url()
  try {
    await button.click({ timeout: 5000 })
    if (action.expect) {
      await page.locator(action.expect).first().waitFor({ state: 'visible', timeout: 8000 })
      await page.keyboard.press('Escape')
      await page.locator(action.expect).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined)
    } else if (action.expectText) {
      await page.getByText(action.expectText).first().waitFor({ state: 'visible', timeout: 8000 })
      await page.keyboard.press('Escape')
    } else if (action.expectUrlIncludes) {
      await page.waitForFunction((needle) => location.href.includes(needle), action.expectUrlIncludes, { timeout: 8000 })
      await page.goto(beforeUrl, { waitUntil: 'domcontentloaded' })
      await settle(page)
    }
    return { testId: action.testId, ok: true }
  } catch (error) {
    return { testId: action.testId, ok: false, error: error.message }
  }
}

async function inspectPage(page, pageConfig) {
  await page.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByTestId(pageConfig.readyTestId).waitFor({ state: 'visible', timeout: 30000 })
  await settle(page)
  await page.waitForFunction(
    () => !document.body.innerText.includes('月度计划加载中') && !document.body.innerText.includes('总进度计划加载中'),
    null,
    { timeout: 30000 },
  ).catch(() => undefined)
  await settle(page)
  if (pageConfig.readyAnyTestIds?.length) {
    await page.waitForFunction(
      (testIds) => testIds.some((testId) => document.querySelector(`[data-testid="${testId}"]`)),
      pageConfig.readyAnyTestIds,
      { timeout: 30000 },
    ).catch(() => undefined)
    await settle(page)
  }

  const buttons = await annotateButtons(page)
  const trialClicks = await trialClickButtons(page, buttons)

  const requiredCounts = pageConfig.requiredButtons
    ? await Promise.all(pageConfig.requiredButtons.map(async (testId) => ({ testId, count: await page.getByTestId(testId).count() })))
    : []
  const missingRequired = requiredCounts.filter((item) => item.count === 0).map((item) => item.testId)
  const requiredAnyCounts = pageConfig.requiredAnyButtons
    ? await Promise.all(pageConfig.requiredAnyButtons.map(async (testId) => ({ testId, count: await page.getByTestId(testId).count() })))
    : []

  const safeActions = []
  for (const action of pageConfig.safeActions) {
    safeActions.push(await runSafeAction(page, action))
  }

  const bodySummary = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1000))

  return {
    key: pageConfig.key,
    url: page.url(),
    buttonCount: buttons.length,
    buttons,
    trialClicks,
    missingRequired,
    requiredCounts,
    requiredAnyCounts,
    safeActions,
    bodySummary,
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const apiTimings = []
const badResponses = []
const consoleMessages = []
const pageErrors = []
const requestFailures = []

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('requestfailed', (request) => {
  const failure = request.failure()
  requestFailures.push({ url: request.url(), errorText: failure?.errorText ?? '' })
})
page.on('response', (response) => {
  const url = response.url()
  if (url.includes('/api/') && response.status() >= 400) {
    badResponses.push({ status: response.status(), url })
  }
})

await page.addInitScript((token) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('access_token', token)
  localStorage.setItem('onboarding_workspace_completed', 'true')
  localStorage.setItem('onboarding_project_completed', 'true')
  localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  try {
    const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
    const startedAt = Date.now()
    const response = await route.fetch({ url: forwardUrl, timeout: 45000 })
    const url = new URL(forwardUrl)
    apiTimings.push({
      method: route.request().method(),
      path: url.pathname,
      query: url.search.slice(0, 120),
      status: response.status(),
      ms: Date.now() - startedAt,
    })
    await route.fulfill({ response })
  } catch (error) {
    if (String(error?.message ?? '').includes('Request context disposed')) return
    throw error
  }
})

const result = {
  baseUrl,
  apiBaseUrl,
  projectId,
  pages: [],
  apiTimings,
  badResponses,
  consoleMessages,
  pageErrors,
  requestFailures,
}

function summarizePageResult(pageResult) {
  return {
    key: pageResult.key,
    url: pageResult.url,
    buttonCount: pageResult.buttonCount,
    buttons: pageResult.buttons.map((button) => ({
      label: normalizeText(button.testId || button.ariaLabel || button.text || button.title || `button-${button.index}`),
      disabled: button.disabled,
      hitOk: button.centerHitInsideButton,
    })),
    missingRequired: pageResult.missingRequired,
    requiredCounts: pageResult.requiredCounts,
    requiredAnyCounts: pageResult.requiredAnyCounts,
    trialFailures: pageResult.trialClicks
      .filter((item) => item.ok === false)
      .map((item) => ({ label: item.label, error: item.error.split('\n')[0] })),
    safeActions: pageResult.safeActions.map((item) => ({
      testId: item.testId,
      ok: item.ok === true,
      skipped: item.skipped === true,
      reason: item.reason,
      error: item.error ? item.error.split('\n')[0] : undefined,
    })),
    bodySummary: pageResult.bodySummary,
  }
}

try {
  for (const pageConfig of pages) {
    result.pages.push(await inspectPage(page, pageConfig))
  }

  const failures = result.pages.flatMap((pageResult) => [
    ...pageResult.missingRequired.map((testId) => `${pageResult.key}: missing required ${testId}`),
    ...(pageResult.requiredAnyCounts.length > 0 && pageResult.requiredAnyCounts.every((item) => item.count === 0)
      ? [`${pageResult.key}: missing all alternate required buttons ${pageResult.requiredAnyCounts.map((item) => item.testId).join(', ')}`]
      : []),
    ...pageResult.trialClicks.filter((item) => item.ok === false).map((item) => `${pageResult.key}: trial ${item.label}: ${item.error}`),
    ...pageResult.safeActions.filter((item) => item.ok === false).map((item) => `${pageResult.key}: safe ${item.testId}: ${item.error}`),
  ])
  const hitFailures = result.pages.flatMap((pageResult) => (
    pageResult.buttons
      .filter((button) => !button.disabled && button.centerInViewport && !button.centerHitInsideButton)
      .map((button) => `${pageResult.key}: hit ${button.testId || button.text || button.index} -> ${button.hitTag}/${button.hitText}`)
  ))
  if (failures.length > 0 || hitFailures.length > 0 || badResponses.length > 0 || pageErrors.length > 0) {
    process.exitCode = 1
  }
  const summary = {
    baseUrl,
    apiBaseUrl,
    projectId,
    pages: result.pages.map(summarizePageResult),
    apiTimings,
    badResponses,
    consoleMessages,
    pageErrors,
    requestFailures,
    failures,
    hitFailures,
  }
  console.log(JSON.stringify(verbose ? { ...result, failures, hitFailures } : summary, null, 2))
} finally {
  await browser.close()
}
