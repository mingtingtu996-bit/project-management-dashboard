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
  taskAssignee: '闃胯揪鏄殑',
  taskUnit: '鎬诲寘鍗曚綅',
  changeReason: '椤哄欢鏂藉伐绐楀彛',
}

const mockProject = {
  id: projectId,
  name: '鐢樼壒鍙樻洿璁板綍鑱旇皟椤圭洰',
  description: 'Gantt to reports change log browser verification fixture project',
  status: 'active',
  current_phase: 'construction',
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-12-31',
  created_at: now,
  updated_at: now,
}

const mockTask = {
  id: 'task-1',
  project_id: projectId,
  title: TEXT.taskTitle,
  description: '涓绘ゼ涓讳綋缁撴瀯鎸佺画鎺ㄨ繘',
  status: 'in_progress',
  priority: 'high',
  progress: 48,
  start_date: '2026-03-11',
  end_date: '2026-06-30',
  planned_start_date: '2026-03-11',
  planned_end_date: '2026-06-30',
  assignee_name: TEXT.taskAssignee,
  assignee_user_id: 'user-1',
  assignee_unit: TEXT.taskUnit,
  responsible_unit: TEXT.taskUnit,
  specialty_type: 'structure',
  is_milestone: false,
  wbs_code: '1.1',
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
    displayLabel: '主关键路径',
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
  statusLabel: '进行中',
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
  monthlyCloseStatus: '进行中',
  closeoutOverdueDays: 0,
  unreadWarningCount: 1,
  highestWarningLevel: 'warning',
  highestWarningSummary: '建议复核主体施工的数据填报',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 4,
  healthScore: 82,
  healthStatus: '鍋ュ悍',
  nextMilestone: {
    id: 'milestone-1',
    name: '鑺傜偣楠屾敹',
    targetDate: '2026-06-20',
    status: '进行中',
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
    note: '数据质量存在波动，建议结合现场复核。',
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
        summary: '进度与时间发生轻微错位',
        recommendation: '复核最新进度填报时间',
      },
    ],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'warning',
    scopeLabel: TEXT.taskTitle,
    findingCount: 3,
    summary: '建议复核主体施工的数据填报',
  },
  findings: [],
}

const mockChangeLogs = [
  {
    id: 'log-1',
    project_id: projectId,
    entity_type: 'task',
    entity_id: 'task-1',
    field_name: 'planned_end_date',
    old_value: '2026-04-10',
    new_value: '2026-04-13',
    change_reason: TEXT.changeReason,
    change_source: 'manual_adjusted',
    changed_at: '2026-04-12T10:00:00.000Z',
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

function buildMockResponse(urlString) {
  const url = new URL(urlString)
  const { pathname } = url
  const authResponse = maybeBuildMockAuthResponse(pathname, json)

  if (authResponse) {
    return authResponse
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

  if (pathname === '/api/change-logs') {
    return json({ success: true, data: mockChangeLogs })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: mockProjectSummary })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: mockDataQualitySummary })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/progress-deviation') {
    return json({
      success: true,
      data: {
        project_id: projectId,
        baseline_version_id: null,
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
      },
    })
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
    return json({
      success: true,
      members: [
        {
          userId: 'user-1',
          displayName: TEXT.taskAssignee,
          permissionLevel: 'owner',
        },
      ],
    })
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/gantt`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('gantt-task-select-task-1').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('gantt-task-select-task-1').click()
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'gantt-change-log-source.png'), fullPage: true })

    const detailText = await page.getByTestId('gantt-task-detail-panel').innerText()
    assert(detailText.includes(TEXT.taskTitle), `Task detail panel missing title: ${TEXT.taskTitle}`)
    assert(detailText.includes(TEXT.taskAssignee), `Task detail panel missing assignee: ${TEXT.taskAssignee}`)

    await page.getByTestId('gantt-open-change-log').click()
    await page.waitForFunction(
      (expectedProjectId) => window.location.hash.includes(`/projects/${expectedProjectId}/reports?view=change_log&taskId=task-1`),
      projectId,
      { timeout: 10000 },
    )
    await page.getByTestId('change-log-view').waitFor({ state: 'visible', timeout: 10000 })
    const reportsUrl = page.url()
    const changeLogText = await page.getByTestId('change-log-view').innerText()
    assert(reportsUrl.includes('/reports?view=change_log&taskId=task-1'), `Unexpected reports URL: ${reportsUrl}`)
    assert(changeLogText.includes(TEXT.changeReason), 'Change log view did not render expected task change record')
    await page.screenshot({ path: join(outputDir, 'gantt-change-log-target.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      targetUrl,
      reportsUrl,
      changeLogVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        source: join(outputDir, 'gantt-change-log-source.png'),
        target: join(outputDir, 'gantt-change-log-target.png'),
      },
    }

    await writeFile(join(outputDir, 'gantt-change-log-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'gantt-change-log-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
