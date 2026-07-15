import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173'
const projectId = process.env.PROJECT_ID || 'diagnose-gantt-project'
const now = new Date().toISOString()

const project = {
  id: projectId,
  name: 'Gantt route switch diagnosis',
  owner_id: 'diagnose-user',
  status: 'active',
  created_at: now,
  updated_at: now,
}

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
  if (pathname.includes('/critical-path')) return json({ success: true, data: { paths: [], tasks: [] } })
  return json({ success: true, data: [] })
}

async function snapshot(page, label) {
  return {
    label,
    url: page.url(),
    hash: await page.evaluate(() => location.hash),
    dashboardPages: await page.locator('[data-testid="dashboard-page"]').count(),
    dashboardEmpty: await page.locator('[data-testid="dashboard-empty-state"]').count(),
    ganttButtons: await page.locator('[data-testid="planning-start-edit"]').count(),
    routeText: (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300),
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
const consoleMessages = []
const pageErrors = []
page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => pageErrors.push(error.message))

await page.addInitScript(() => {
  localStorage.setItem('auth_token', 'diagnose-token')
  localStorage.setItem('access_token', 'diagnose-token')
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('gantt_view_mode_')) localStorage.removeItem(key)
  }
})

await page.route(`${baseUrl}/api/**`, async (route) => {
  await route.fulfill(mockResponse(route.request()))
})

const result = {
  snapshots: [],
  consoleMessages,
  pageErrors,
}

try {
  await page.goto(`${baseUrl}/#/projects/${projectId}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  result.snapshots.push(await snapshot(page, 'direct-dashboard'))

  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 20000 })
  result.snapshots.push(await snapshot(page, 'direct-gantt'))

  const dashboardLink = page.locator(`a[href="#/projects/${projectId}/dashboard"], a[href="/projects/${projectId}/dashboard"]`).first()
  const rect = await dashboardLink.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.waitForTimeout(2000)
  result.snapshots.push(await snapshot(page, 'after-coordinate-sidebar-dashboard'))
  await page.waitForTimeout(8000)
  result.snapshots.push(await snapshot(page, 'after-coordinate-sidebar-dashboard-10s'))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  result.snapshots.push(await snapshot(page, 'after-reload-on-dashboard-hash'))

  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
