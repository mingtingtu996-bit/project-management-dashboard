import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { maybeBuildMockAuthResponse, primeBrowserAuth } from './browser-auth-fixture.mjs'

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

const projectId = process.env.PROJECT_ID || '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

const TEXT = {
  taskTitle: '涓讳綋缁撴瀯鏂藉伐',
  notificationTitle: '浠诲姟寤舵湡鎻愰啋',
}

const mockProject = {
  id: projectId,
  name: '鎻愰啋涓績鑱旇皟椤圭洰',
  description: 'Notifications browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockTask = {
  id: 'task-1',
  project_id: projectId,
  title: TEXT.taskTitle,
  status: 'in_progress',
  progress: 48,
  start_date: '2026-03-11',
  end_date: '2026-06-30',
  planned_start_date: '2026-03-11',
  planned_end_date: '2026-06-30',
  assignee_name: '闃胯揪鏄殑',
  assignee_user_id: 'user-1',
  responsible_unit: '鎬诲寘鍗曚綅',
  created_at: now,
  updated_at: now,
}

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-1'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-1'],
    totalDurationDays: 112,
    displayLabel: '涓诲叧閿矾寰?',
  },
  alternateChains: [],
  displayTaskIds: ['task-1'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: TEXT.taskTitle,
      floatDays: 0,
      durationDays: 112,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 112,
}

const mockProjectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '杩涜涓?',
  plannedEndDate: '2026-12-31',
  daysUntilPlannedEnd: 257,
  totalTasks: 120,
  leafTaskCount: 96,
  completedTaskCount: 81,
  inProgressTaskCount: 12,
  delayedTaskCount: 3,
  delayDays: 4,
  delayCount: 3,
  overallProgress: 64,
  taskProgress: 64,
  totalMilestones: 5,
  completedMilestones: 2,
  milestoneProgress: 40,
  riskCount: 7,
  activeRiskCount: 4,
  pendingConditionCount: 3,
  pendingConditionTaskCount: 2,
  activeObstacleCount: 2,
  activeObstacleTaskCount: 2,
  preMilestoneCount: 0,
  completedPreMilestoneCount: 0,
  activePreMilestoneCount: 0,
  overduePreMilestoneCount: 0,
  acceptancePlanCount: 0,
  passedAcceptancePlanCount: 0,
  inProgressAcceptancePlanCount: 0,
  failedAcceptancePlanCount: 0,
  constructionDrawingCount: 0,
  issuedConstructionDrawingCount: 0,
  reviewingConstructionDrawingCount: 0,
  attentionRequired: true,
  scheduleVarianceDays: 4,
  activeDelayRequests: 1,
  activeObstacles: 2,
  monthlyCloseStatus: '杩涜涓?',
  closeoutOverdueDays: 0,
  unreadWarningCount: 1,
  highestWarningLevel: 'warning',
  highestWarningSummary: '寤鸿澶嶆牳涓讳綋鏂藉伐鐨勬暟鎹～鎶?',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 4,
  healthScore: 82,
  healthStatus: '鍋ュ悍',
  nextMilestone: {
    id: 'milestone-1',
    name: '鑺傜偣楠屾敹',
    targetDate: '2026-06-20',
    status: '杩涜涓?',
    daysRemaining: 63,
  },
  milestoneOverview: {
    split_count: 0,
    merged_count: 0,
    pending_mapping_count: 0,
    upcoming_count: 0,
    overdue_count: 0,
    items: [],
  },
}

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 84,
    flag: 'medium',
    note: '鏁版嵁璐ㄩ噺瀛樺湪娉㈠姩锛屽缓璁粨鍚堢幇鍦哄鏍?',
    timelinessScore: 83,
    anomalyScore: 80,
    consistencyScore: 86,
    coverageScore: 88,
    jumpinessScore: 82,
    activeFindingCount: 3,
    trendWarningCount: 1,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 1,
  },
  prompt: {
    count: 1,
    summary: '瀛樺湪 1 鏉￠渶瑕侀噸鐐瑰鏍哥殑鏁版嵁璐ㄩ噺寮傚父',
    items: [
      {
        id: 'finding-1',
        taskId: 'task-1',
        taskTitle: TEXT.taskTitle,
        ruleCode: 'PROGRESS_TIME_MISMATCH',
        severity: 'warning',
        summary: '杩涘害涓庢椂闂村彂鐢熻交寰敊浣?',
        recommendation: '澶嶆牳鏈€鏂拌繘搴﹀～鎶ユ椂闂?',
      },
    ],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'warning',
    scopeLabel: TEXT.taskTitle,
    findingCount: 3,
    summary: '寤鸿澶嶆牳涓讳綋鏂藉伐鐨勬暟鎹～鎶?',
  },
  findings: [],
}

const mockBaselines = [
  {
    id: 'baseline-v8',
    project_id: projectId,
    version: 8,
    status: 'confirmed',
    title: 'v8',
    confirmed_at: '2026-04-15T00:00:00.000Z',
    updated_at: '2026-04-15T00:00:00.000Z',
  },
]

const mockDeviationAnalysis = {
  project_id: projectId,
  baseline_version_id: 'baseline-v8',
  monthly_plan_version_id: null,
  summary: {
    total_items: 0,
    deviated_items: 0,
    carryover_items: 0,
    unresolved_items: 0,
    baseline_items: 0,
    monthly_plan_items: 0,
    execution_items: 0,
  },
  rows: [],
  mainlines: [],
  trend_events: [],
}

const mockTaskSummary = {
  stats: {
    total_completed: 12,
    on_time_count: 10,
    delayed_count: 2,
    completed_milestone_count: 3,
    avg_delay_days: 1.8,
  },
}

const mockTaskSummaryAssignees = [
  {
    assignee: '闃胯揪鏄殑',
    total: 4,
    on_time: 3,
    delayed: 1,
    on_time_rate: 75,
  },
  {
    assignee: '鏉庡伐',
    total: 3,
    on_time: 3,
    delayed: 0,
    on_time_rate: 100,
  },
]

const mockDailyProgress = {
  date: '2026-04-24',
  progress_change: 3.2,
  tasks_updated: 2,
  tasks_completed: 1,
  details: [
    {
      task_id: 'task-1',
      task_title: TEXT.taskTitle,
      progress_before: 45,
      progress_after: 48,
      progress_delta: 3,
      assignee: '闃胯揪鏄殑',
    },
  ],
}

const mockNotifications = [
  {
    id: 'notif-task-1',
    project_id: projectId,
    type: 'warning',
    notification_type: 'flow-reminder',
    severity: 'warning',
    title: TEXT.notificationTitle,
    content: '涓讳綋缁撴瀯鏂藉伐瀛樺湪寤舵湡椋庨櫓锛岃灏藉揩澶勭悊銆?',
    status: 'pending',
    source_entity_type: 'task',
    source_entity_id: 'task-1',
    task_id: 'task-1',
    assignee: '闃胯揪鏄殑',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'notif-risk-1',
    project_id: projectId,
    type: 'warning',
    notification_type: 'business-warning',
    severity: 'critical',
    title: '鍏抽敭棰勮',
    content: '褰撳墠椤圭洰瀛樺湪楂樹紭鍏堢骇椋庨櫓锛岃鍚屾鍏虫敞銆?',
    status: 'pending',
    source_entity_type: 'risk',
    source_entity_id: 'risk-1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'notif-report-1',
    project_id: projectId,
    type: 'info',
    notification_type: 'system-exception',
    severity: 'info',
    title: '鍙樻洿璁板綍鍒嗘瀽鎻愰啋',
    content: '寤鸿杩涘叆鎶ヨ〃鍒嗘瀽鏌ョ湅鏈€鏂板彉鏇磋褰曘€?',
    status: 'pending',
    source_entity_type: 'change_log',
    source_entity_id: 'log-1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'notif-summary-1',
    project_id: projectId,
    type: 'info',
    notification_type: 'flow-reminder',
    severity: 'info',
    title: '浠诲姟瀹屾垚鎬荤粨鎻愰啋',
    content: '褰撳墠椤圭洰宸叉湁鏂扮殑瀹屾垚鎬荤粨锛岃杩涘叆浠诲姟鎬荤粨鏌ョ湅銆?',
    status: 'pending',
    source_entity_type: 'task_summary',
    source_entity_id: 'summary-1',
    created_at: now,
    updated_at: now,
  },
]

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

function buildMockResponse(urlString, method) {
  const url = new URL(urlString)
  const { pathname } = url
  const authResponse = maybeBuildMockAuthResponse(pathname, json)

  if (authResponse) {
    return authResponse
  }

  if (pathname === '/api/notifications' && method === 'GET') {
    return json({ success: true, data: mockNotifications })
  }

  if (
    pathname === '/api/notifications/read-all'
    || pathname === '/api/notifications/acknowledge-group'
    || pathname === '/api/notifications/notif-task-1/acknowledge'
    || pathname === '/api/notifications/notif-risk-1/acknowledge'
    || pathname === '/api/notifications/notif-report-1/acknowledge'
    || pathname === '/api/notifications/notif-summary-1/acknowledge'
    || pathname === '/api/notifications/notif-task-1/mute'
    || pathname === '/api/notifications/notif-risk-1/mute'
    || pathname === '/api/notifications/notif-report-1/mute'
    || pathname === '/api/notifications/notif-summary-1/mute'
  ) {
    return json({ success: true, data: { ok: true } })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: [mockTask] })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: mockProjectSummary })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: mockDataQualitySummary })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselines })
  }

  if (pathname === '/api/progress-deviation') {
    return json({ success: true, data: mockDeviationAnalysis })
  }

  if (pathname === '/api/progress-deviation/lock') {
    return json({
      success: true,
      data: {
        lock: {
          id: 'lock-1',
          project_id: projectId,
          baseline_version_id: 'baseline-v8',
          resource_id: `${projectId}:baseline-v8`,
          locked_by: 'pm-user',
          locked_at: now,
          lock_expires_at: now,
          is_locked: true,
        },
      },
    })
  }

  if (pathname === '/api/change-logs') {
    return json({
      success: true,
      data: [
        {
          id: 'log-1',
          project_id: projectId,
          entity_type: 'task',
          entity_id: 'task-1',
          field_name: 'planned_end_date',
          old_value: '2026-04-10',
          new_value: '2026-04-13',
          change_reason: '椤哄欢鏂藉伐绐楀彛',
          change_source: 'manual_adjusted',
          changed_at: now,
        },
      ],
    })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary`) {
    return json({ success: true, data: mockTaskSummary })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/assignees`) {
    return json({ success: true, data: mockTaskSummaryAssignees })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/compare`) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/daily-progress`) {
    return json({ success: true, data: mockDailyProgress })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/delay-requests'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: [] })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/refresh`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/overrides`) {
    return json({ success: true, data: [] })
  }

  return json({ success: true, data: [] })
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

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page)

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
      const requestMethod = route.request().method().toUpperCase()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl, requestMethod))
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

    await page.goto(`${baseUrl}/#/notifications`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('notifications-summary-total').waitFor({ state: 'visible', timeout: 20000 })

    const bodyText = await page.locator('body').innerText()
    assert(bodyText.includes('提醒中心'), 'Notifications page title is missing')
    assert(bodyText.includes(TEXT.notificationTitle), `Missing notification title: ${TEXT.notificationTitle}`)
    await page.screenshot({ path: join(outputDir, 'notifications-page-initial.png'), fullPage: true })

    await page.getByTestId('notification-go-process-notif-task-1').click()
    await page.waitForURL((current) => current.hash.includes('/gantt'), { timeout: 10000 })
    await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('gantt-task-select-task-1').waitFor({ state: 'visible', timeout: 20000 })
    const ganttUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'notifications-page-process-link.png'), fullPage: true })

    await page.goto(`${baseUrl}/#/notifications`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('notification-go-process-notif-risk-1').click()
    await page.waitForURL((current) => current.hash.includes(`/projects/${projectId}/risks`), { timeout: 10000 })
    await page.getByTestId('risk-summary-band').waitFor({ state: 'visible', timeout: 20000 })
    const risksUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'notifications-page-risk-link.png'), fullPage: true })

    await page.goto(`${baseUrl}/#/notifications`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('notification-go-process-notif-report-1').click()
    await page.waitForFunction(
      (expectedProjectId) => window.location.hash.includes(`/projects/${expectedProjectId}/reports?view=change_log`),
      projectId,
      { timeout: 10000 },
    )
    await page.getByTestId('change-log-view').waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(
      () => document.body.innerText.includes('变更记录分析'),
      undefined,
      { timeout: 10000 },
    )
    const reportsUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'notifications-page-reports-link.png'), fullPage: true })

    await page.goto(`${baseUrl}/#/notifications`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('notification-go-process-notif-summary-1').click()
    await page.waitForFunction(
      (expectedProjectId) => window.location.hash.includes(`/projects/${expectedProjectId}/task-summary`),
      projectId,
      { timeout: 10000 },
    )
    await page.getByTestId('task-summary-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('task-summary-results-section').waitFor({ state: 'visible', timeout: 20000 })
    const taskSummaryUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'notifications-page-task-summary-link.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      notificationsUrl: `${baseUrl}/#/notifications`,
      ganttUrl,
      risksUrl,
      reportsUrl,
      taskSummaryUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'notifications-page-initial.png'),
        processLink: join(outputDir, 'notifications-page-process-link.png'),
        riskLink: join(outputDir, 'notifications-page-risk-link.png'),
        reportsLink: join(outputDir, 'notifications-page-reports-link.png'),
        taskSummaryLink: join(outputDir, 'notifications-page-task-summary-link.png'),
      },
    }

    await writeFile(join(outputDir, 'notifications-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'notifications-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
