import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldUseMockApi = process.env.MOCK_API !== 'false'
const shouldStartPreview = process.env.START_PREVIEW !== 'false'

const cockpitLabel = '\u516c\u53f8\u9a7e\u9a76\u8231'
const wrongCockpitLabel = '\u516c\u53f8\u9a71\u9a76\u8231'
const projectId = '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

const mockAuthState = {
  authenticated: true,
  user: {
    id: 'company-admin-1',
    username: 'company-admin',
    display_name: '公司管理员',
    email: 'admin@example.com',
    globalRole: 'company_admin',
  },
}

const mockProject = {
  id: projectId,
  name: '\u793a\u8303\u4ea7\u4e1a\u56ed\u4e00\u671f',
  description: '\u516c\u53f8\u9a7e\u9a76\u8231\u6d4f\u89c8\u5668\u8054\u8c03\u7528\u6f14\u793a\u9879\u76ee',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockProjectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '\u8fdb\u884c\u4e2d',
  plannedEndDate: '2026-12-31',
  daysUntilPlannedEnd: 257,
  totalTasks: 8,
  leafTaskCount: 6,
  completedTaskCount: 2,
  inProgressTaskCount: 3,
  delayedTaskCount: 1,
  delayDays: 4,
  delayCount: 1,
  overallProgress: 48,
  taskProgress: 48,
  totalMilestones: 2,
  completedMilestones: 0,
  milestoneProgress: 0,
  riskCount: 1,
  activeRiskCount: 1,
  pendingConditionCount: 1,
  pendingConditionTaskCount: 1,
  activeObstacleCount: 1,
  activeObstacleTaskCount: 1,
  preMilestoneCount: 2,
  completedPreMilestoneCount: 1,
  activePreMilestoneCount: 1,
  overduePreMilestoneCount: 0,
  acceptancePlanCount: 1,
  passedAcceptancePlanCount: 0,
  inProgressAcceptancePlanCount: 1,
  failedAcceptancePlanCount: 0,
  constructionDrawingCount: 5,
  issuedConstructionDrawingCount: 4,
  reviewingConstructionDrawingCount: 1,
  attentionRequired: true,
  scheduleVarianceDays: 4,
  activeDelayRequests: 1,
  activeObstacles: 1,
  monthlyCloseStatus: '\u8fdb\u884c\u4e2d',
  closeoutOverdueDays: 0,
  unreadWarningCount: 2,
  highestWarningLevel: 'warning',
  highestWarningSummary: '\u65bd\u5de5\u4e3b\u7ebf\u5b58\u5728 1 \u9879\u5ef6\u671f\u5ba1\u6279\u5f85\u5904\u7406',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 2,
  healthScore: 72,
  healthStatus: '\u4e9a\u5065\u5eb7',
  nextMilestone: {
    id: 'milestone-1',
    name: '\u4e3b\u4f53\u7ed3\u6784\u5c01\u9876',
    targetDate: '2026-06-20',
    status: '\u8fdb\u884c\u4e2d',
    daysRemaining: 63,
  },
  milestoneOverview: {
    milestoneCount: 2,
    delayedMilestoneCount: 1,
    completedMilestoneCount: 0,
    upcomingMilestoneCount: 1,
  },
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: '\u573a\u5730\u79fb\u4ea4',
    description: '\u5b8c\u6210\u573a\u5730\u79fb\u4ea4\u4e0e\u4e34\u8bbe\u5e03\u7f6e',
    status: 'completed',
    progress: 100,
    planned_start_date: '2026-03-01',
    planned_end_date: '2026-03-10',
    start_date: '2026-03-01',
    end_date: '2026-03-10',
    created_at: now,
    updated_at: now,
    assignee_name: '\u5de5\u7a0b\u7ecf\u7406',
    assignee_user_id: 'user-1',
    is_milestone: false,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: '\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5',
    description: '\u4e3b\u697c\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5',
    status: 'in_progress',
    progress: 48,
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    start_date: '2026-03-11',
    end_date: '2026-06-30',
    created_at: now,
    updated_at: now,
    assignee_name: '\u963f\u8fbe\u662f\u7684',
    assignee_user_id: 'user-2',
    assignee_unit: '\u603b\u5305\u5355\u4f4d',
    responsible_unit: '\u603b\u5305\u5355\u4f4d',
    is_milestone: false,
  },
  {
    id: 'milestone-1',
    project_id: projectId,
    title: '\u4e3b\u4f53\u7ed3\u6784\u5c01\u9876',
    description: '\u9636\u6bb5\u6027\u5173\u952e\u8282\u70b9',
    status: 'pending',
    progress: 0,
    planned_start_date: '2026-06-20',
    planned_end_date: '2026-06-20',
    start_date: '2026-06-20',
    end_date: '2026-06-20',
    created_at: now,
    updated_at: now,
    is_milestone: true,
  },
]

const mockNotifications = [
  {
    id: 'notif-1',
    project_id: projectId,
    type: 'warning',
    notification_type: 'flow-reminder',
    severity: 'warning',
    title: '\u5ef6\u671f\u5ba1\u6279\u5f85\u5904\u7406',
    content: '\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5\u5b58\u5728 1 \u6761\u5ef6\u671f\u5ba1\u6279\u5f85\u5904\u7406\uff0c\u8bf7\u8fdb\u5165\u4efb\u52a1\u5217\u8868\u5904\u7406\u3002',
    status: 'pending',
    source_entity_type: 'delay_request',
    source_entity_id: 'delay-1',
    task_id: 'task-2',
    assignee: '\u963f\u8fbe\u662f\u7684',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'notif-2',
    project_id: projectId,
    type: 'warning',
    notification_type: 'business-warning',
    severity: 'critical',
    title: '\u5173\u952e\u8def\u5f84\u53d7\u5f71\u54cd',
    content: '\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5\u5f71\u54cd\u5173\u952e\u8def\u5f84 2 \u9879\uff0c\u8bf7\u4f18\u5148\u5904\u7406\u3002',
    status: 'pending',
    source_entity_type: 'critical_path',
    source_entity_id: 'critical-1',
    task_id: 'task-2',
    assignee: '\u963f\u8fbe\u662f\u7684',
    created_at: now,
    updated_at: now,
  },
]

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-2'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-2'],
    totalDurationDays: 111,
    displayLabel: '\u4e3b\u5173\u952e\u8def\u5f84',
  },
  alternateChains: [],
  displayTaskIds: ['task-2'],
  edges: [],
  tasks: [
    {
      taskId: 'task-2',
      title: '\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5',
      floatDays: 0,
      durationDays: 111,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 111,
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
}

function buildMockResponse(urlString) {
  const url = new URL(urlString)
  const { pathname, searchParams } = url

  if (pathname === '/api/auth/me') {
    return json({ success: true, ...mockAuthState })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === '/api/dashboard/projects-summary') {
    return json({ success: true, data: [mockProjectSummary] })
  }

  if (pathname === '/api/health-score/avg-history') {
    return json({
      success: true,
      data: {
        thisMonth: 72,
        lastMonth: 69,
        change: 3,
        lastMonthPeriod: '2026-03',
      },
    })
  }

  if (pathname === '/api/risks' || pathname === '/api/issues') {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: [] })
  }

  if (pathname === '/api/tasks') {
    const queryProjectId = searchParams.get('projectId')
    return json({ success: true, data: queryProjectId === projectId ? mockTasks : [] })
  }

  if (
    pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/delay-requests'
    || pathname === '/api/change-logs'
    || pathname === '/api/task-baselines'
    || pathname === `/api/projects/${projectId}/critical-path/overrides`
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/tasks/progress-snapshots') {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
  }

  if (pathname === '/api/notifications') {
    const queryProjectId = searchParams.get('projectId')
    const data = queryProjectId
      ? mockNotifications.filter((item) => item.project_id === queryProjectId)
      : mockNotifications
    return json({ success: true, data })
  }

  if (pathname === '/api/notifications/acknowledge-group' || pathname === '/api/notifications/read-all') {
    return json({ success: true, data: { ok: true } })
  }

  if (pathname.startsWith('/api/notifications/')) {
    return json({ success: true, data: { ok: true } })
  }

  return json({ success: true, data: [] })
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

async function waitForHashUrl(page, hashSegment) {
  await page.waitForURL((current) => current.hash.includes(hashSegment), { timeout: 10000 })
}

async function ensureDistExists() {
  try {
    await access(distIndexFile)
  } catch {
    throw new Error(`Missing build artifact: ${distIndexFile}. Run "pnpm --dir client build" first.`)
  }
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()

  let previewProcess = null
  const previewAlreadyReady = await isHttpReady(baseUrl)

  if (!previewAlreadyReady && shouldStartPreview) {
    previewProcess = startPreviewServer()
  }

  const previewReady = previewAlreadyReady || await waitForHttpOk(baseUrl, 20000)
  if (!previewReady) {
    throw new Error(`Preview server is not reachable at ${baseUrl}`)
  }

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const pageErrors = []
  const apiFailures = []
  let result = null

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    page.setDefaultTimeout(30000)

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const requestUrl = route.request().url()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl))
        return
      }

      const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
      try {
        const response = await route.fetch({ url: forwardUrl })
        await route.fulfill({ response })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        apiFailures.push({ url: forwardUrl, message })
        await route.fulfill(json({
          success: false,
          error: {
            code: 'BROWSER_PROXY_ERROR',
            message,
          },
        }, 502))
      }
    })

    console.log('[company-cockpit-check] goto company')
    await page.goto(`${baseUrl}/#/company`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('company-cockpit-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('company-signal-ranking').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('company-project-overview').waitFor({ state: 'visible', timeout: 20000 })

    const companyBodyText = await page.locator('body').innerText()
    assert(companyBodyText.includes(cockpitLabel), `Missing label: ${cockpitLabel}`)
    assert(!companyBodyText.includes(wrongCockpitLabel), `Found wrong label: ${wrongCockpitLabel}`)

    const initialUrl = page.url()
    assert(initialUrl.includes('/#/company'), `Unexpected cockpit URL: ${initialUrl}`)

    const ganttLinks = page.getByTestId('company-project-gantt-link')
    const ganttCount = await ganttLinks.count()
    assert(ganttCount > 0, 'Company cockpit rendered zero task-list links')

    const reminderButtons = page.getByTestId('company-signal-reminder-button')
    const reminderCount = await reminderButtons.count()
    assert(reminderCount > 0, 'Company cockpit rendered zero reminder buttons')

    await page.screenshot({ path: join(outputDir, 'company-cockpit-initial.png'), fullPage: true })

    console.log('[company-cockpit-check] click gantt')
    await ganttLinks.first().click()
    await waitForHashUrl(page, '/gantt')
    await page.locator('[data-testid="task-workspace-layer-l2"], [data-testid="gantt-loading-skeleton"]').first().waitFor({
      state: 'visible',
      timeout: 20000,
    })
    const ganttUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'company-cockpit-gantt-link.png'), fullPage: true })

    console.log('[company-cockpit-check] back to company')
    await page.goto(`${baseUrl}/#/company`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('company-signal-ranking').waitFor({ state: 'visible', timeout: 20000 })

    console.log('[company-cockpit-check] click notifications')
    await page.getByTestId('company-signal-reminder-button').first().click()
    await waitForHashUrl(page, '/notifications')
    await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('notifications-summary-total').waitFor({ state: 'visible', timeout: 20000 })
    const notificationsUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'company-cockpit-notifications-link.png'), fullPage: true })

    result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      ganttCount,
      reminderCount,
      ganttUrl,
      notificationsUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'company-cockpit-initial.png'),
        gantt: join(outputDir, 'company-cockpit-gantt-link.png'),
        notifications: join(outputDir, 'company-cockpit-notifications-link.png'),
      },
    }

    await writeFile(join(outputDir, 'company-cockpit-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'company-cockpit-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()

    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill()
    }
  }

  return result
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

