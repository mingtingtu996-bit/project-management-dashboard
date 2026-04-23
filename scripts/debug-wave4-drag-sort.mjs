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
  {
    id: 'task-lagging-moderate',
    project_id: projectId,
    title: '幕墙深化',
    name: '幕墙深化',
    status: 'in_progress',
    priority: 'medium',
    progress: 10,
    start_date: '2026-04-01',
    end_date: '2026-04-23',
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-23',
    sort_order: 2,
    version: 1,
    created_at: now,
    updated_at: now,
  },
]
const taskUpdateCalls = []

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
  let body = {}
  try {
    body = request.postDataJSON() ?? {}
  } catch {
    body = {}
  }

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
    return json({ success: true, data: tasksState.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) })
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/)
  if (taskMatch && request.method() === 'PUT') {
    const taskId = decodeURIComponent(taskMatch[1])
    taskUpdateCalls.push({ taskId, body })
    tasksState = tasksState.map((task) => task.id === taskId ? { ...task, ...body, updated_at: new Date().toISOString() } : task)
    return json({ success: true, data: tasksState.find((task) => task.id === taskId) })
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
await page.route(`${baseUrl}/api/**`, async (route) => {
  await route.fulfill(buildMockResponse(route.request()))
})

await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('gantt-task-select-task-base').waitFor({ state: 'visible', timeout: 20000 })

const before = await page.locator('[id^="gantt-task-row-"]').evaluateAll((nodes) => nodes.map((node) => node.id))

const handle = page.getByTestId('gantt-task-drag-handle-task-lagging-moderate')
const handleMetaBefore = await handle.evaluate((node) => ({
  outerHTML: node.outerHTML,
  tabIndex: node.tabIndex,
  role: node.getAttribute('role'),
  ariaDescribedBy: node.getAttribute('aria-describedby'),
}))
await handle.focus()
const focusedTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
await page.keyboard.press('Space')
await page.keyboard.press('ArrowUp')
await page.keyboard.press('ArrowUp')
await page.keyboard.press('Space')
await page.waitForTimeout(500)

const afterKeyboard = await page.locator('[id^="gantt-task-row-"]').evaluateAll((nodes) => nodes.map((node) => node.id))

const handleBox = await handle.boundingBox()
const targetBox = await page.locator('#gantt-task-row-task-base').boundingBox()
if (handleBox && targetBox) {
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + 60, targetBox.y + 16, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

const afterPointer = await page.locator('[id^="gantt-task-row-"]').evaluateAll((nodes) => nodes.map((node) => node.id))

await page.screenshot({ path: 'artifacts/test-runs/20260421-wave4/debug-drag-after.png', fullPage: true })

console.log(JSON.stringify({ before, afterKeyboard, afterPointer, handleMetaBefore, focusedTestId, taskUpdateCalls }, null, 2))

await browser.close()
