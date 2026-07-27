import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const projectId = process.env.PROJECT_ID || 'diagnose-gantt-project'
const useMockApi = process.env.MOCK_API !== 'false'
const authToken = process.env.BROWSER_VERIFY_AUTH_TOKEN || (useMockApi ? 'diagnose-token' : 'dev-token-for-local-development')
const now = new Date().toISOString()

const tasks = [
  {
    id: 'task-base',
    project_id: projectId,
    title: '诊断任务 A',
    name: '诊断任务 A',
    status: 'in_progress',
    priority: 'high',
    progress: 45,
    start_date: '2026-04-01',
    end_date: '2026-04-20',
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-20',
    sort_order: 0,
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-child',
    project_id: projectId,
    title: '诊断任务 B',
    name: '诊断任务 B',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    start_date: '2026-04-21',
    end_date: '2026-04-30',
    planned_start_date: '2026-04-21',
    planned_end_date: '2026-04-30',
    sort_order: 1,
    version: 1,
    created_at: now,
    updated_at: now,
  },
]

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
}

function mockResponse(request) {
  const url = new URL(request.url())
  const pathname = url.pathname
  const project = {
    id: projectId,
    name: 'Gantt interaction diagnosis',
    owner_id: 'diagnose-user',
    status: 'active',
    created_at: now,
    updated_at: now,
  }

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: 'diagnose-user',
          username: 'diagnose-user',
          display_name: 'Diagnose User',
          email: 'diagnose@example.com',
          role: 'owner',
          permissionLevel: 'owner',
          globalRole: 'company_admin',
        },
      },
    })
  }
  if (pathname === '/api/projects') return json({ success: true, data: [project] })
  if (pathname === `/api/projects/${projectId}`) return json({ success: true, data: project })
  if (pathname === '/api/tasks') return json({ success: true, data: tasks })
  if (pathname === `/api/members/${projectId}/me`) {
    return json({ success: true, data: { user_id: 'diagnose-user', permission_level: 'owner', role: 'owner' } })
  }
  if (pathname === `/api/members/${projectId}`) return json({ success: true, data: [] })
  if (pathname.includes('/critical-path')) return json({ success: true, data: [] })
  if (
    pathname === '/api/task-baselines'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/risks'
    || pathname === '/api/issues'
    || pathname === '/api/warnings'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname.startsWith('/api/planning')
    || pathname.startsWith('/api/participant-units')
    || pathname.startsWith('/api/engineering-objects')
    || pathname.startsWith('/api/data-quality')
  ) {
    return json({ success: true, data: [] })
  }

  return json({ success: true, data: [] })
}

async function getInteractionSnapshot(page, testId) {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`)
    if (!(element instanceof HTMLElement)) return { exists: false }
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    const stack = document.elementsFromPoint(x, y).slice(0, 8).map((item) => {
      const node = item instanceof HTMLElement ? item : null
      const style = node ? getComputedStyle(node) : null
      return {
        tag: item.tagName,
        testId: node?.dataset.testid ?? null,
        id: item.id || null,
        className: typeof item.className === 'string' ? item.className.slice(0, 120) : '',
        pointerEvents: style?.pointerEvents ?? null,
        position: style?.position ?? null,
        zIndex: style?.zIndex ?? null,
        inert: node?.inert ?? false,
        ariaHidden: node?.getAttribute('aria-hidden'),
        text: item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
      }
    })
    const ancestors = []
    let current = element
    while (current && ancestors.length < 8) {
      const style = getComputedStyle(current)
      ancestors.push({
        tag: current.tagName,
        testId: current.dataset.testid ?? null,
        id: current.id || null,
        className: current.className.slice(0, 120),
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        transform: style.transform,
        inert: current.inert,
        ariaHidden: current.getAttribute('aria-hidden'),
      })
      current = current.parentElement
    }
    return {
      exists: true,
      text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      disabled: element.hasAttribute('disabled'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hitTag: hit?.tagName ?? null,
      hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
      hitTestId: hit instanceof HTMLElement ? hit.dataset.testid ?? null : null,
      stack,
      ancestors,
      url: location.href,
    }
  }, testId)
}

async function settleBeforeReset(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 })
  } catch {
    // Background telemetry or long polling should not block the diagnostic reset.
  }
  await page.waitForTimeout(250)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const consoleMessages = []
const pageErrors = []

page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.addInitScript((token) => {
  try {
    window.localStorage.setItem('auth_token', token)
    window.localStorage.setItem('access_token', token)
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('gantt_view_mode_')) window.localStorage.removeItem(key)
    }
  } catch {
    // Some transient browser documents do not expose localStorage.
  }
  window.__ganttInteractionDiag = { clicks: [], longTasks: [] }
  document.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    window.__ganttInteractionDiag.clicks.push({
      time: performance.now(),
      testId: target?.dataset?.testid ?? null,
      tag: target?.tagName ?? null,
      text: target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
    })
  }, true)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__ganttInteractionDiag.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // ignored in browsers without longtask support
    }
  }
}, authToken)

await page.route(`${baseUrl}/api/**`, async (route) => {
  try {
    if (useMockApi) {
      await route.fulfill(mockResponse(route.request()))
      return
    }

    const forwardUrl = route.request().url().replace(baseUrl, apiBaseUrl)
    const response = await route.fetch({ url: forwardUrl })
    await route.fulfill({ response })
  } catch (error) {
    if (String(error?.message ?? '').includes('Request context disposed')) {
      return
    }
    throw error
  }
})

const result = {
  baseUrl,
  apiBaseUrl,
  mode: useMockApi ? 'mock-api' : 'proxy-api',
  projectId,
  actions: [],
  consoleMessages,
  pageErrors,
}

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
  try {
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
  } catch (error) {
    result.actions.push({ action: 'reload-before-dashboard-check', ok: false, error: error.message })
    console.log(JSON.stringify(result, null, 2))
    throw error
  }
  result.initialStartEdit = await getInteractionSnapshot(page, 'planning-start-edit')

  try {
    await page.getByTestId('planning-start-edit').click({ trial: true, timeout: 3000 })
    result.actions.push({ action: 'trial-click-start-edit', ok: true })
  } catch (error) {
    result.actions.push({ action: 'trial-click-start-edit', ok: false, error: error.message })
  }

  try {
    const rect = result.initialStartEdit.rect
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
    result.actions.push({ action: 'coordinate-click-start-edit', ok: true })
  } catch (error) {
    result.actions.push({ action: 'coordinate-click-start-edit', ok: false, error: error.message })
  }

  result.afterCoordinateClick = await page.evaluate(() => ({
    url: location.href,
    saveButtons: document.querySelectorAll('[data-testid="planning-save"]').length,
    startButtons: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
    diag: window.__ganttInteractionDiag,
  }))

  if (result.afterCoordinateClick.saveButtons > 0 && result.afterCoordinateClick.startButtons === 0) {
    await settleBeforeReset(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
    result.actions.push({ action: 'reload-before-real-click-start-edit', ok: true })
  }

  try {
    await page.getByTestId('planning-start-edit').click({ timeout: 5000 })
    result.actions.push({ action: 'real-click-start-edit', ok: true })
  } catch (error) {
    result.actions.push({ action: 'real-click-start-edit', ok: false, error: error.message })
  }

  result.afterRealClick = await page.evaluate(() => ({
    url: location.href,
    saveButtons: document.querySelectorAll('[data-testid="planning-save"]').length,
    startButtons: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
    bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
    diag: window.__ganttInteractionDiag,
  }))

  if (result.afterRealClick.saveButtons > 0 && result.afterRealClick.startButtons === 0) {
    await settleBeforeReset(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
    result.actions.push({ action: 'reload-before-dom-click-start-edit', ok: true })
  }

  try {
    await page.getByTestId('planning-start-edit').evaluate((element) => {
      if (element instanceof HTMLElement) element.click()
    }, { timeout: 5000 })
    result.actions.push({ action: 'dom-click-start-edit', ok: true })
  } catch (error) {
    result.actions.push({ action: 'dom-click-start-edit', ok: false, error: error.message })
  }

  result.afterDomClick = await page.evaluate(() => ({
    url: location.href,
    saveButtons: document.querySelectorAll('[data-testid="planning-save"]').length,
    startButtons: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
    diag: window.__ganttInteractionDiag,
  }))

  await settleBeforeReset(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
  const dashboardLink = page.locator(`a[href="#/projects/${projectId}/dashboard"], a[href="/projects/${projectId}/dashboard"]`).first()
  result.dashboardLinkCount = await dashboardLink.count()
  if (result.dashboardLinkCount > 0) {
    result.dashboardLinkBefore = await dashboardLink.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).slice(0, 8).map((item) => {
        const node = item instanceof HTMLElement ? item : null
        const style = node ? getComputedStyle(node) : null
        return {
          tag: item.tagName,
          testId: node?.dataset.testid ?? null,
          id: item.id || null,
          className: typeof item.className === 'string' ? item.className.slice(0, 120) : '',
          pointerEvents: style?.pointerEvents ?? null,
          position: style?.position ?? null,
          zIndex: style?.zIndex ?? null,
          text: item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        }
      })
      return {
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: element.getAttribute('href'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitTag: hit?.tagName ?? null,
        hitText: hit?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
        stack,
      }
    })
    try {
      const rect = result.dashboardLinkBefore.rect
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
      await page.waitForTimeout(1000)
      result.actions.push({ action: 'coordinate-click-dashboard-link', ok: true })
    } catch (error) {
      result.actions.push({ action: 'coordinate-click-dashboard-link', ok: false, error: error.message })
    }
    result.afterDashboardCoordinateClick = await page.evaluate(() => ({
      url: location.href,
      hash: location.hash,
      dashboardPages: document.querySelectorAll('[data-testid="dashboard-page"]').length,
      startButtons: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
      diag: window.__ganttInteractionDiag,
    }))

    await settleBeforeReset(page)
    await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })

    try {
      await dashboardLink.click({ timeout: 5000 })
      result.actions.push({ action: 'real-click-dashboard-link', ok: true })
    } catch (error) {
      result.actions.push({ action: 'real-click-dashboard-link', ok: false, error: error.message })
    }
    try {
      await dashboardLink.evaluate((element) => {
        if (element instanceof HTMLElement) element.click()
      }, { timeout: 5000 })
      result.actions.push({ action: 'dom-click-dashboard-link', ok: true })
    } catch (error) {
      result.actions.push({ action: 'dom-click-dashboard-link', ok: false, error: error.message })
    }
    await page.waitForTimeout(1000)
    result.afterDashboardClick = await page.evaluate(() => ({
      url: location.href,
      hash: location.hash,
      dashboardPages: document.querySelectorAll('[data-testid="dashboard-page"]').length,
      startButtons: document.querySelectorAll('[data-testid="planning-start-edit"]').length,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
      diag: window.__ganttInteractionDiag,
    }))
  }

  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
