import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:4173'
const projectId = '4cd542b4-1b59-4d66-a501-27dffc1b3a08'

const now = new Date().toISOString()

let tasksState = [
  {
    id: 'task-base',
    project_id: projectId,
    title: '基础施工',
    name: '基础施工',
    status: 'in_progress',
    priority: 'high',
    progress: 60,
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
    id: 'task-lagging-mild',
    project_id: projectId,
    title: '机电预埋',
    name: '机电预埋',
    status: 'in_progress',
    priority: 'medium',
    progress: 30,
    start_date: '2026-04-01',
    end_date: '2026-04-22',
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-22',
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

function buildMockResponse(request) {
  const url = new URL(request.url())
  const { pathname } = url

  if (pathname === '/api/auth/me') {
    return json({
      authenticated: true,
      user: {
        id: 'user-owner',
        username: 'wave4-owner',
        display_name: '波4负责人',
        email: 'wave4-owner@example.com',
        role: 'company_admin',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [{ id: projectId, name: 'Wave4 Gantt 专项项目', owner_id: 'user-owner', status: 'active', created_at: now, updated_at: now }] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: { id: projectId, name: 'Wave4 Gantt 专项项目', owner_id: 'user-owner', status: 'active', created_at: now, updated_at: now } })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: tasksState })
  }

  if (pathname.startsWith('/api/tasks/')) {
    if (request.method() === 'DELETE') {
      return json({ success: true, data: { id: pathname.split('/').pop() } })
    }
    return json({ success: true, data: tasksState[0] })
  }

  if (
    pathname === `/api/members/${projectId}/me`
    || pathname === '/api/task-baselines'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/risks'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/delay-requests'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname === `/api/projects/${projectId}/critical-path`
    || pathname === `/api/projects/${projectId}/critical-path/refresh`
    || pathname === `/api/projects/${projectId}/critical-path/overrides`
  ) {
    return json({ success: true, data: [] })
  }

  return json({ success: true, data: [] })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
const consoleMessages = []
const pageErrors = []
page.on('console', (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`))
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.route(`${baseUrl}/api/**`, async (route) => {
  await route.fulfill(buildMockResponse(route.request()))
})

await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('gantt-task-select-task-base').waitFor({ state: 'visible', timeout: 20000 })
await page.getByTestId('gantt-task-checkbox-task-base').check()
await page.getByTestId('gantt-task-checkbox-task-lagging-mild').check()
await page.getByTestId('batch-action-bar').waitFor({ state: 'visible' })
await page.screenshot({ path: 'artifacts/test-runs/20260421-wave4/debug-batch-before-click.png', fullPage: true })
await page.getByTestId('gantt-batch-delete').click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'artifacts/test-runs/20260421-wave4/debug-batch-after-click.png', fullPage: true })

const text = await page.locator('body').innerText()
console.log(JSON.stringify({
  hasBatchTitle: text.includes('批量删除任务'),
  hasConfirmText: text.includes('确定要删除选中的'),
  hasCancel: text.includes('取消'),
  consoleMessages,
  pageErrors,
}, null, 2))

await browser.close()
