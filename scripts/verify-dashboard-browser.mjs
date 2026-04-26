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

const projectId = process.env.PROJECT_ID || '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

const mockProject = {
  id: projectId,
  name: '椤圭洰鎬昏鑱旇皟椤圭洰',
  description: 'Dashboard browser verification fixture project',
  status: 'active',
  current_phase: 'construction',
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-12-31',
  created_at: now,
  updated_at: now,
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: '涓讳綋缁撴瀯鏂藉伐',
    description: '涓绘ゼ涓讳綋缁撴瀯鎺ㄨ繘',
    status: 'in_progress',
    progress: 48,
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    start_date: '2026-03-11',
    end_date: '2026-06-30',
    assignee_name: '闃胯揪鏄殑',
    assignee_user_id: 'user-1',
    assignee_unit: '鎬诲寘鍗曚綅',
    responsible_unit: '鎬诲寘鍗曚綅',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: '涓讳綋缁撴瀯灏侀《',
    description: '阶段里程碑',
    status: 'pending',
    progress: 0,
    planned_start_date: '2026-06-20',
    planned_end_date: '2026-06-20',
    start_date: '2026-06-20',
    end_date: '2026-06-20',
    is_milestone: true,
    created_at: now,
    updated_at: now,
  },
]

const mockProjectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '进行中',
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
  monthlyCloseStatus: '进行中',
  closeoutOverdueDays: 0,
  unreadWarningCount: 2,
  highestWarningLevel: 'warning',
  highestWarningSummary: '涓讳綋缁撴瀯鏂藉伐瀛樺湪 1 椤瑰欢鏈熷鎵瑰緟澶勭悊',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 2,
  healthScore: 72,
  healthStatus: '亚健康',
  nextMilestone: {
    id: 'milestone-1',
    name: '涓讳綋缁撴瀯灏侀《',
    targetDate: '2026-06-20',
    status: '进行中',
    daysRemaining: 63,
  },
  milestoneOverview: {
    milestoneCount: 2,
    delayedMilestoneCount: 1,
    completedMilestoneCount: 0,
    upcomingMilestoneCount: 1,
  },
}

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 88,
    flag: 'high',
    note: '褰撳墠鏁版嵁璐ㄩ噺绋冲畾锛屽彲浣滀负鍒嗘瀽渚濇嵁',
    timelinessScore: 92,
    anomalyScore: 86,
    consistencyScore: 89,
    coverageScore: 90,
    jumpinessScore: 83,
    activeFindingCount: 1,
    trendWarningCount: 0,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 0,
    weights: {
      timeliness: 0.3,
      anomaly: 0.25,
      consistency: 0.2,
      jumpiness: 0.1,
      coverage: 0.15,
    },
    dimensions: [
      {
        key: 'anomaly',
        label: '寮傚父妫€娴嬪懡涓巼',
        score: 86,
        weight: 0.25,
        maxContribution: 25,
        actualContribution: 21.5,
        lossContribution: 3.5,
        lossShare: 43.75,
      },
    ],
  },
  prompt: {
    count: 0,
    summary: '褰撳墠娌℃湁闇€瑕侀澶栨彁绀虹殑鏁版嵁璐ㄩ噺寮傚父',
    items: [],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'info',
    scopeLabel: null,
    findingCount: 1,
    summary: '褰撳墠椤圭洰鏁版嵁璐ㄩ噺绋冲畾',
  },
  findings: [],
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
    totalDurationDays: 111,
    displayLabel: '主关键路径',
  },
  alternateChains: [],
  displayTaskIds: ['task-1'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: '涓讳綋缁撴瀯鏂藉伐',
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

const mockDailyProgress = {
  date: '2026-04-18',
  previous_date: '2026-04-17',
  progress_change: 3.2,
  tasks_updated: 2,
  tasks_completed: 1,
  details: [
    {
      task_id: 'task-1',
      task_title: '涓讳綋缁撴瀯鏂藉伐',
      progress_before: 45,
      progress_after: 48,
      progress_delta: 3,
      assignee: '闃胯揪鏄殑',
    },
  ],
}

const mockBaselineVersions = [
  {
    id: 'baseline-v2',
    project_id: projectId,
    version: 2,
    status: 'confirmed',
    title: '椤圭洰鍩虹嚎',
    source_type: 'manual',
    confirmed_at: '2026-04-01T00:00:00.000Z',
    updated_at: now,
  },
]

const mockMonthlyPlanDetail = {
  id: 'monthly-v9',
  project_id: projectId,
  version: 9,
  status: 'draft',
  month: '2026-04',
  title: '2026-04 鏈堝害璁″垝',
  baseline_version_id: 'baseline-v2',
  source_version_id: 'baseline-v2',
  carryover_item_count: 1,
  created_at: now,
  updated_at: now,
  items: [
    {
      id: 'monthly-item-1',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v9',
      source_task_id: 'task-1',
      title: '涓讳綋缁撴瀯鏂藉伐',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-30',
      target_progress: 60,
      current_progress: 48,
      sort_order: 0,
      commitment_status: 'planned',
    },
  ],
}

const mockCloseoutPlan = {
  id: 'monthly-v8',
  project_id: projectId,
  version: 8,
  status: 'confirmed',
  month: '2026-03',
  title: '2026-03 鏈堝害璁″垝',
  baseline_version_id: 'baseline-v2',
  source_version_id: 'baseline-v2',
  carryover_item_count: 1,
  closeout_at: null,
  created_at: now,
  updated_at: now,
  items: [
    {
      id: 'closeout-item-1',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v8',
      source_task_id: 'task-1',
      title: '涓讳綋缁撴瀯鏂藉伐',
      planned_start_date: '2026-03-01',
      planned_end_date: '2026-03-30',
      target_progress: 100,
      current_progress: 100,
      sort_order: 0,
      commitment_status: 'completed',
    },
    {
      id: 'closeout-item-2',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v8',
      source_task_id: 'task-2',
      title: '涓讳綋缁撴瀯灏侀《',
      planned_start_date: '2026-03-20',
      planned_end_date: '2026-03-20',
      target_progress: 100,
      current_progress: 80,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

const mockMonthlyVersions = [
  { ...mockMonthlyPlanDetail, items: undefined },
  { ...mockCloseoutPlan, items: undefined },
]

const mockDraftLockResponse = {
  lock: {
    id: 'lock-1',
    project_id: projectId,
    draft_type: 'monthly_plan',
    resource_id: 'monthly-v9',
    locked_by: 'user-1',
    locked_at: '2026-04-18T08:00:00.000Z',
    lock_expires_at: '2026-04-18T08:30:00.000Z',
    is_locked: true,
  },
}

const mockPlanningGovernanceSnapshot = {
  project_id: projectId,
  health: {
    project_id: projectId,
    score: 82,
    status: 'healthy',
    label: '鏁翠綋绋冲畾',
    breakdown: {
      data_integrity_score: 90,
      mapping_integrity_score: 80,
      system_consistency_score: 78,
      m1_m9_score: 92,
      passive_reorder_penalty: 8,
      total_score: 82,
    },
  },
  integrity: {
    project_id: projectId,
    data_integrity: {
      total_tasks: 6,
      missing_participant_unit_count: 1,
      missing_scope_dimension_count: 0,
      missing_progress_snapshot_count: 0,
    },
    mapping_integrity: {
      baseline_pending_count: 1,
      baseline_merged_count: 0,
      monthly_carryover_count: 0,
    },
    system_consistency: {
      inconsistent_milestones: 0,
      stale_snapshot_count: 0,
    },
    milestone_integrity: {
      summary: {
        total: 9,
        aligned: 9,
        needs_attention: 0,
        missing_data: 0,
        blocked: 0,
      },
    },
  },
  anomaly: {
    project_id: projectId,
    detected_at: now,
    total_events: 1,
    windows: [
      {
        window_days: 7,
        event_count: 1,
        affected_task_count: 1,
        cumulative_event_count: 1,
        triggered: false,
        average_offset_days: 2,
        key_task_count: 1,
      },
    ],
  },
  alerts: [
    {
      kind: 'integrity',
      severity: 'warning',
      title: '瀛樺湪 1 鏉″緟琛ラ綈璐ｄ换鍗曚綅鐨勬暟鎹」',
      detail: '请在治理工作台中确认并补齐后再重新校核。',
      source_id: `${projectId}:integrity`,
    },
  ],
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

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      authenticated: true,
      user: {
        id: 'user-1',
        username: 'zhangsan',
        display_name: '寮犱笁',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: mockMonthlyVersions })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselineVersions })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/delay-requests'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: mockProjectSummary })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: mockDataQualitySummary })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/daily-progress`) {
    return json({ success: true, data: mockDailyProgress })
  }

  if (pathname === '/api/planning-governance') {
    return json({ success: true, data: mockPlanningGovernanceSnapshot, timestamp: now })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}`) {
    return json({ success: true, data: mockMonthlyPlanDetail })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}/lock`) {
    return json({ success: true, data: mockDraftLockResponse })
  }

  if (pathname === `/api/monthly-plans/${mockCloseoutPlan.id}`) {
    return json({ success: true, data: mockCloseoutPlan })
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/dashboard`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-hero-cards').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-live-panel').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/dashboard'), `Unexpected Dashboard URL: ${initialUrl}`)
    const heroCardCount = await page.locator('[data-testid^="dashboard-hero-card-"]').count()
    assert(heroCardCount === 4, `Expected 4 dashboard hero cards, received ${heroCardCount}`)
    await page.screenshot({ path: join(outputDir, 'dashboard-page-initial.png'), fullPage: true })

    await page.getByTestId('dashboard-data-quality-detail-trigger').click()
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const dialogText = await page.getByTestId('dashboard-data-quality-detail-dialog').innerText()
    assert(dialogText.includes('数据置信度维度分解'), 'Dashboard data quality dialog did not render expected title')
    await page.screenshot({ path: join(outputDir, 'dashboard-page-quality-dialog.png'), fullPage: true })
    await page.keyboard.press('Escape')

    await page.getByTestId('dashboard-open-monthly-plan').click()
    await page.waitForFunction(() => window.location.hash.includes('/planning/monthly'))
    await page.getByTestId('monthly-plan-header').waitFor({ state: 'visible', timeout: 20000 })
    const monthlyUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'dashboard-page-monthly-link.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-open-gantt-quick-link').click()
    await page.waitForFunction(() => window.location.hash.includes('/gantt'))
    await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
    const ganttUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'dashboard-page-gantt-link.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-open-closeout').click()
    await page.waitForFunction(() => window.location.hash.includes('/tasks/closeout'))
    await page.getByTestId('closeout-filter-bar').waitFor({ state: 'visible', timeout: 20000 })
    const closeoutUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'dashboard-page-closeout-link.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      heroCardCount,
      qualityDialogVisible: true,
      monthlyUrl,
      ganttUrl,
      closeoutUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'dashboard-page-initial.png'),
        qualityDialog: join(outputDir, 'dashboard-page-quality-dialog.png'),
        monthly: join(outputDir, 'dashboard-page-monthly-link.png'),
        gantt: join(outputDir, 'dashboard-page-gantt-link.png'),
        closeout: join(outputDir, 'dashboard-page-closeout-link.png'),
      },
    }

    await writeFile(join(outputDir, 'dashboard-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'dashboard-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
