import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  maybeBuildMockAuthResponse,
  primeBrowserAuth,
  readFullAppTestManifest,
  resolveBrowserVerifyAuthToken,
} from './browser-auth-fixture.mjs'
import { recordApiFailure, resolveGanttProjectId } from './verify-gantt-browser.mjs'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldUseMockApi = process.env.MOCK_API !== 'false'
const shouldStartPreview = process.env.START_PREVIEW !== 'false'

let projectId = process.env.PROJECT_ID || '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

const mockProject = {
  id: projectId,
  name: '报表联调项目',
  description: 'Reports browser verification fixture project',
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
    title: '主体施工',
    status: 'in_progress',
    progress: 58,
    planned_end_date: '2026-04-10',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: '节点验收',
    status: 'completed',
    progress: 100,
    planned_end_date: '2026-04-05',
    is_milestone: true,
    created_at: now,
    updated_at: now,
  },
]

const mockRisks = [
  {
    id: 'risk-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '材料到货延迟',
    level: 'high',
    status: 'active',
    risk_source: '渚涘簲閾?',
    description: '关键材料还在路上',
    created_at: now,
    updated_at: now,
  },
]

const mockConditions = [
  {
    id: 'cond-1',
    task_id: 'task-1',
    status: 'open',
    title: '图纸未确',
    created_at: now,
    updated_at: now,
  },
]

const mockObstacles = [
  {
    id: 'obs-1',
    task_id: 'task-1',
    severity: 'high',
    status: 'active',
    title: '现场协调受阻',
    created_at: now,
    updated_at: now,
  },
]

const mockProjectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '进行',
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
  activeDelayedTasks: 1,
  activeObstacles: 2,
  monthlyCloseStatus: '进行',
  closeoutOverdueDays: 0,
  unreadWarningCount: 1,
  highestWarningLevel: 'warning',
  highestWarningSummary: '建议复核主体施工的数据填',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 4,
  healthScore: 82,
  healthStatus: '健康',
  nextMilestone: {
    id: 'milestone-1',
    name: '节点验收',
    targetDate: '2026-06-20',
    status: '进行',
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
    note: '数据质量存在波动，建议结合现场复',
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
    summary: '存在 1 条需要重点复核的数据质量异常',
    items: [
      {
        id: 'finding-1',
        taskId: 'task-1',
        taskTitle: '主体施工',
        ruleCode: 'PROGRESS_TIME_MISMATCH',
        severity: 'warning',
        summary: '进度与时间发生轻微错',
        recommendation: '复核最新进度填报时',
      },
    ],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'warning',
    scopeLabel: '主体施工',
    findingCount: 3,
    summary: '建议复核主体施工的数据填',
  },
  findings: [],
}

const mockMaterialSummary = {
  overview: {
    totalExpectedCount: 8,
    onTimeCount: 6,
    arrivalRate: 75,
  },
  byUnit: [
    {
      participantUnitId: 'unit-1',
      participantUnitName: '幕墙单位',
      specialtyTypes: ['幕墙'],
      totalExpectedCount: 3,
      onTimeCount: 2,
      arrivalRate: 67,
    },
    {
      participantUnitId: 'unit-2',
      participantUnitName: '机电单位',
      specialtyTypes: ['机电'],
      totalExpectedCount: 5,
      onTimeCount: 4,
      arrivalRate: 80,
    },
  ],
  monthlyTrend: [
    { month: '2025-11', totalExpectedCount: 1, onTimeCount: 1, arrivalRate: 100 },
    { month: '2025-12', totalExpectedCount: 1, onTimeCount: 1, arrivalRate: 100 },
    { month: '2026-01', totalExpectedCount: 1, onTimeCount: 0, arrivalRate: 0 },
    { month: '2026-02', totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 },
    { month: '2026-03', totalExpectedCount: 1, onTimeCount: 1, arrivalRate: 100 },
    { month: '2026-04', totalExpectedCount: 2, onTimeCount: 2, arrivalRate: 100 },
  ],
}

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-1', 'task-2'],
  manualAttentionTaskIds: ['task-1'],
  manualInsertedTaskIds: ['task-2'],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-1', 'task-2'],
    totalDurationDays: 12,
    displayLabel: '主关键路',
  },
  alternateChains: [
    {
      id: 'chain-2',
      source: 'auto',
      taskIds: ['task-3'],
      totalDurationDays: 4,
      displayLabel: '备选路',
    },
  ],
  displayTaskIds: ['task-1', 'task-2', 'task-3', 'task-4'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: '主体施工',
      floatDays: 0,
      durationDays: 7,
      isAutoCritical: true,
      isManualAttention: true,
      isManualInserted: false,
      chainIndex: 0,
    },
    {
      taskId: 'task-2',
      title: '节点验收',
      floatDays: 0,
      durationDays: 5,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: true,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 12,
}

const mockBaselines = [
  {
    id: 'baseline-v7',
    project_id: projectId,
    version: 7,
    status: 'confirmed',
    title: 'v7',
    confirmed_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
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
    total_items: 4,
    deviated_items: 3,
    carryover_items: 1,
    unresolved_items: 1,
    baseline_items: 2,
    monthly_plan_items: 1,
    execution_items: 1,
  },
  rows: [
    {
      id: 'row-1',
      title: '基线任务A',
      mainline: 'baseline',
      planned_progress: 60,
      actual_progress: 52,
      actual_date: '2026-04-13',
      deviation_days: 3,
      deviation_rate: 12,
      status: 'delayed',
      reason: '基线版本切换后需要重新确',
      mapping_status: 'mapping_pending',
    },
    {
      id: 'row-2',
      title: '月度兑现B',
      mainline: 'monthly_plan',
      planned_progress: 80,
      actual_progress: 74,
      actual_date: '2026-04-14',
      deviation_days: -2,
      deviation_rate: -8,
      status: 'in_progress',
      reason: '版本切换后进度回',
      mapping_status: 'merged_into',
      merged_into: {
        group_id: 'group-1',
        target_item_id: 'row-3',
        title: '姹囧叆鑺傜偣C',
        item_ids: ['row-2'],
      },
    },
    {
      id: 'row-3',
      title: '鎵ц鑺傜偣C',
      mainline: 'execution',
      planned_progress: 90,
      actual_progress: 88,
      actual_date: '2026-04-15',
      deviation_days: 1,
      deviation_rate: 2,
      status: 'in_progress',
      reason: '执行中节',
      child_group: {
        group_id: 'group-2',
        parent_item_id: 'row-3',
        parent_title: '鎵ц鑺傜偣C',
        child_count: 2,
        last_completed_date: '2026-04-15',
        children: [
          { id: 'row-3-a', title: '瀛愰」1', actual_date: '2026-04-15', status: 'completed' },
          { id: 'row-3-b', title: '瀛愰」2', actual_date: null, status: 'in_progress' },
        ],
      },
    },
  ],
  mainlines: [
    {
      key: 'baseline',
      label: '基线偏差',
      summary: { total_items: 1, deviated_items: 1, delayed_items: 1, unresolved_items: 1 },
      rows: [
        {
          id: 'row-1',
          title: '基线任务A',
          mainline: 'baseline',
          planned_progress: 60,
          actual_progress: 52,
          actual_date: '2026-04-13',
          deviation_days: 3,
          deviation_rate: 12,
          status: 'delayed',
          reason: '基线版本切换后需要重新确',
          mapping_status: 'mapping_pending',
        },
      ],
    },
    {
      key: 'monthly_plan',
      label: '月度完成情况',
      summary: { total_items: 1, deviated_items: 1, delayed_items: 0, unresolved_items: 0 },
      rows: [
        {
          id: 'row-2',
          title: '月度兑现B',
          mainline: 'monthly_plan',
          planned_progress: 80,
          actual_progress: 74,
          actual_date: '2026-04-14',
          deviation_days: -2,
          deviation_rate: -8,
          status: 'in_progress',
          reason: '版本切换后进度回',
          mapping_status: 'merged_into',
          merged_into: {
            group_id: 'group-1',
            target_item_id: 'row-3',
            title: '姹囧叆鑺傜偣C',
            item_ids: ['row-2'],
          },
        },
      ],
    },
    {
      key: 'execution',
      label: '执行偏差',
      summary: { total_items: 2, deviated_items: 1, delayed_items: 0, unresolved_items: 0 },
      rows: [
        {
          id: 'row-3',
          title: '鎵ц鑺傜偣C',
          mainline: 'execution',
          planned_progress: 90,
          actual_progress: 88,
          actual_date: '2026-04-15',
          deviation_days: 1,
          deviation_rate: 2,
          status: 'in_progress',
          reason: '执行中节',
          child_group: {
            group_id: 'group-2',
            parent_item_id: 'row-3',
            parent_title: '鎵ц鑺傜偣C',
            child_count: 2,
            last_completed_date: '2026-04-15',
            children: [
              { id: 'row-3-a', title: '瀛愰」1', actual_date: '2026-04-15', status: 'completed' },
              { id: 'row-3-b', title: '瀛愰」2', actual_date: null, status: 'in_progress' },
            ],
          },
        },
      ],
    },
  ],
  trend_events: [
    {
      event_type: 'baseline_version_switch',
      marker_type: 'vertical_line',
      switch_date: '2026-04-15',
      from_version: 'v7',
      to_version: 'v8',
      explanation: '2026-04-15 before v7 / after v8',
    },
  ],
}

const mockDeviationLock = {
  lock: {
    id: 'lock-1',
    project_id: projectId,
    baseline_version_id: 'baseline-v8',
    resource_id: `${projectId}:baseline-v8`,
    locked_by: 'pm-user',
    locked_at: '2026-04-15T09:00:00.000Z',
    lock_expires_at: '2026-04-15T09:30:00.000Z',
    is_locked: true,
  },
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
    change_reason: '顺延施工窗口',
    change_source: 'manual_adjusted',
    changed_at: '2026-04-12T10:00:00.000Z',
  },
  {
    id: 'log-2',
    project_id: projectId,
    entity_type: 'task',
    entity_id: 'task-2',
    field_name: 'planned_end_date',
    old_value: '2026-04-10',
    new_value: '2026-04-13',
    change_reason: '计划后移信号已复核',
    change_source: 'system_signal',
    changed_at: '2026-04-13T10:00:00.000Z',
  },
  {
    id: 'log-3',
    project_id: projectId,
    entity_type: 'task_condition',
    entity_id: 'condition-1',
    field_name: 'is_satisfied',
    old_value: '0',
    new_value: '1',
    change_reason: '任务开工自动闭',
    change_source: 'system_auto',
    changed_at: '2026-04-14T10:00:00.000Z',
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

export function resolveReportsProjectId({
  envProjectId = process.env.PROJECT_ID,
  mockApi = shouldUseMockApi,
  currentProjectId = projectId,
  manifest,
} = {}) {
  return resolveGanttProjectId({ envProjectId, mockApi, currentProjectId, manifest })
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  projectId = resolveReportsProjectId({ manifest })
  return projectId
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

  if (pathname === `/api/projects/${projectId}/bootstrap`) {
    return json({
      success: true,
      data: {
        project: mockProject,
        tasks: mockTasks,
        risks: mockRisks,
        conditions: mockConditions,
        obstacles: mockObstacles,
        warnings: [],
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/risks') {
    return json({ success: true, data: mockRisks })
  }

  if (pathname === '/api/task-conditions') {
    return json({ success: true, data: mockConditions })
  }

  if (pathname === '/api/task-obstacles') {
    return json({ success: true, data: mockObstacles })
  }

  if (
    pathname === '/api/warnings'
    || pathname === '/api/issues'
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

  if (pathname === `/api/projects/${projectId}/materials/summary`) {
    return json({ success: true, data: mockMaterialSummary })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselines })
  }

  if (pathname === '/api/progress-deviation') {
    return json({ success: true, data: mockDeviationAnalysis })
  }

  if (pathname === '/api/progress-deviation/lock') {
    return json({ success: true, data: mockDeviationLock })
  }

  if (pathname === '/api/change-logs') {
    return json({ success: true, data: mockChangeLogs })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  await resolveProjectId()
  const authToken = shouldUseMockApi ? null : await resolveBrowserVerifyAuthToken()

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
  let page = null
  let pageBodyText = null
  let failureScreenshot = null

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)

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
        if (response.status() >= 400) {
          recordApiFailure(apiFailures, {
            type: 'proxy-response',
            url: forwardUrl,
            status: response.status(),
            statusText: response.statusText(),
          })
        }
        await route.fulfill({ response })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recordApiFailure(apiFailures, { type: 'proxy-error', url: forwardUrl, message })
        await route.fulfill(json({
          success: false,
          error: {
            code: 'BROWSER_PROXY_ERROR',
            message,
          },
        }, 502))
      }
    })

    const targetUrl = `${baseUrl}/#/projects/${projectId}/reports?view=progress_deviation`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('reports-module-tabs').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('reports-current-metrics').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('reports-critical-path-summary').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('reports-delay-statistics').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/reports?view=progress_deviation'), `Unexpected Reports URL: ${initialUrl}`)
    await page.getByTestId('deviation-filter-chips').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('deviation-detail-table').waitFor({ state: 'visible', timeout: 10000 })
    const deviationText = await page.getByTestId('deviation-detail-table').innerText()
    assert(deviationText.trim().length > 0, 'Reports progress deviation table rendered empty text')
    const deviationUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'reports-page-progress-deviation.png'), fullPage: true })

    await page.getByTestId('analysis-entry-risk').click()
    await page.waitForFunction(() => window.location.hash.includes('/reports?view=risk'))
    await page.getByTestId('reports-risk-matrix').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('analysis-entry-risk').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('活跃风险').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('reports-material-arrival-summary').waitFor({ state: 'visible', timeout: 10000 })
    const riskMaterialSummaryText = await page.getByTestId('reports-material-arrival-summary').innerText()
    assert(riskMaterialSummaryText.trim().length > 0, 'Reports material arrival summary rendered empty text')
    const riskUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'reports-page-risk.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      progressDeviationVisible: true,
      materialSummaryVisible: true,
      riskUrl,
      deviationUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        risk: join(outputDir, 'reports-page-risk.png'),
        progressDeviation: join(outputDir, 'reports-page-progress-deviation.png'),
      },
    }

    await writeFile(join(outputDir, 'reports-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'reports-page-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      pageBodyText,
      failureScreenshot,
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'reports-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill()
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
