import { spawn } from 'node:child_process'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { primeBrowserAuth, readFullAppTestManifest } from './browser-auth-fixture.mjs'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')
const distAssetsDir = join(repoRoot, 'client', 'dist', 'assets')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const shouldUseMockApi = process.env.MOCK_API !== 'false'
const shouldStartPreview = process.env.START_PREVIEW !== 'false'
const postTabSettledBudgetMs = Number(
  process.env.DASHBOARD_POST_TAB_SETTLED_BUDGET_MS || (shouldUseMockApi ? 2000 : 8000),
)

let projectId = process.env.PROJECT_ID || '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

function isPublicBrowserApiRequest(requestUrl, method) {
  try {
    const pathname = new URL(requestUrl).pathname
    return pathname === '/api/performance-reports' && method.toUpperCase() === 'POST'
  } catch {
    return false
  }
}

async function waitForTextSettled(page, options) {
  const {
    testId,
    loadingTexts,
    settledTexts,
    settledPatterns = [],
    timeout,
    label,
  } = options
  await page.waitForFunction(
    ({ testId, loadingTexts, settledTexts, settledPatterns }) => {
      const element = document.querySelector(`[data-testid="${testId}"]`)
      if (!element) return false
      const text = element.textContent || ''
      if (loadingTexts.some((loadingText) => text.includes(loadingText))) return false
      if (settledTexts.some((settledText) => text.includes(settledText))) return true
      return settledPatterns.some((pattern) => new RegExp(pattern).test(text))
    },
    { testId, loadingTexts, settledTexts, settledPatterns },
    { timeout },
  ).catch((error) => {
    throw new Error(`${label} did not settle within ${timeout}ms: ${error instanceof Error ? error.message : String(error)}`)
  })
}

async function waitForFocusTasksSettled(page, timeout) {
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="dashboard-focus-tasks-panel"]')
    if (!element) return false
    const text = element.textContent || ''
    if (element.querySelector('.animate-pulse')) return false
    return text.includes('共 ')
      || text.includes('获取任务失败')
      || text.includes('今日暂无待处理事项')
      || text.includes('当前筛选下没有待处理任务')
  }, null, { timeout }).catch((error) => {
    throw new Error(`Dashboard focus tasks did not settle within ${timeout}ms: ${error instanceof Error ? error.message : String(error)}`)
  })
}

function matchingRequestRecords(apiRequests, startedAt, pattern) {
  return apiRequests.filter((record) => record.startedAt >= startedAt && pattern.test(record.url))
}

function assertNoPendingRequests(records, label) {
  const pending = records.filter((record) => record.status === 'pending')
  assert(pending.length === 0, `${label} still has pending requests: ${JSON.stringify(pending)}`)
}

function assertNoFailedRequests(records, label) {
  const failed = records.filter((record) => record.status === 'failed')
  assert(failed.length === 0, `${label} has failed requests: ${JSON.stringify(failed)}`)
}

async function waitForMatchingRequestsSettled(apiRequests, startedAt, pattern, timeout, label) {
  const deadline = Date.now() + timeout
  let records = matchingRequestRecords(apiRequests, startedAt, pattern)
  while (Date.now() < deadline) {
    records = matchingRequestRecords(apiRequests, startedAt, pattern)
    if (records.length > 0 && records.every((record) => record.status !== 'pending')) {
      return records
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  records = matchingRequestRecords(apiRequests, startedAt, pattern)
  assertNoPendingRequests(records, label)
  return records
}

async function assertLiveDistAuthEnabled() {
  if (shouldUseMockApi) return

  const disabledPermissionBundles = []
  const files = await readdir(distAssetsDir).catch(() => [])
  await Promise.all(files
    .filter((fileName) => fileName.endsWith('.js'))
    .map(async (fileName) => {
      const filePath = join(distAssetsDir, fileName)
      const source = await readFile(filePath, 'utf8')
      const isApiOrPermissionBundle = source.includes('auth_token')
        || source.includes('access_token')
        || source.includes('workbuddy:auth-session-expired')
      const hasDisabledPermissionFlag = /new Set\(\["1","true","yes","on"\]\)\.has\("true"\.trim\(\)\.toLowerCase\(\)\)/.test(source)
      if (isApiOrPermissionBundle && hasDisabledPermissionFlag) {
        disabledPermissionBundles.push(fileName)
      }
    }))

  if (disabledPermissionBundles.length > 0) {
    throw new Error(
      `MOCK_API=false requires client/dist built with VITE_DISABLE_PERMISSION_SYSTEM=false; detected permission-disabled bundle(s): ${disabledPermissionBundles.join(', ')}. Rebuild with: cmd.exe /d /c "set VITE_DISABLE_PERMISSION_SYSTEM=false&& npm.cmd run build --workspace=client"`,
    )
  }
}

const mockProject = {
  id: projectId,
  name: '项目总览联调项目',
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
    title: '主体结构施工',
    description: '主楼主体结构推进',
    status: 'in_progress',
    progress: 48,
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    start_date: '2026-03-11',
    end_date: '2026-06-30',
    assignee_name: '阿达是的',
    assignee_user_id: 'user-1',
    participant_unit_name: '总包单位',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: '主体结构封顶',
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
  plannedProgress: 60,
  progressDeviation: -12,
  progressGap: 12,
  summaryAsOf: now,
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
  activeDelayedTasks: 1,
  activeObstacles: 1,
  monthlyCloseStatus: '进行中',
  closeoutOverdueDays: 0,
  unreadWarningCount: 2,
  highestWarningLevel: 'warning',
  highestWarningSummary: '主体结构施工存在 1 项延期审批待处理',
  shiftedMilestoneCount: 1,
  criticalPathAffectedTasks: 2,
  healthScore: 72,
  healthStatus: '亚健康',
  nextMilestone: {
    id: 'milestone-1',
    name: '主体结构封顶',
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

const mockHealthScore = {
  score: 72,
  status: '亚健康',
  businessHealthScore: 72,
  reliabilityScore: 88,
  details: {
    progressDeliveryScore: 58,
    executionStabilityScore: 76,
    criticalTargetScore: 69,
    businessExceptionScore: 82,
    planGovernanceScore: 74,
    taskExecutionScore: 76,
    milestoneDeliveryScore: 69,
    riskControlScore: 82,
    dataTrustScore: 88,
    reliabilityScore: 88,
    businessHealthScore: 72,
    healthConfidenceScore: 88,
    capReasons: ['1 项关键节点延期', '1 个阻碍任务未解除'],
    totalScore: 72,
  },
}

const mockRemainingForecast = {
  projectId,
  status: 'ready',
  degraded: false,
  degradationReason: null,
  message: null,
  rowsEvaluated: 6,
  projectRemainingForecast: {
    durationOutputCode: 'project_remaining_forecast',
    durationOutputSemanticFieldName: 'projectRemainingForecastDays',
    projectRemainingForecastDays: 160,
    forecastFinishDate: '2027-01-18',
    targetEndDate: '2026-12-31',
    targetGapDays: 18,
    rowsEvaluated: 6,
    calculationContext: {
      primaryLayer: 'runtimeExecutionFacts',
      criticalPath: {
        remainingTaskCount: 2,
        latestCriticalFinishDate: '2027-01-18',
      },
      monthlyCommitments: {
        activeCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-12-20',
      },
      externalInterfaces: {
        hardGateCount: 1,
        latestGateFinishDate: '2026-12-31',
      },
    },
  },
  constructionOrganizationProductOutcomeCloseoutProgress: null,
}

const mockFocusTasks = {
  items: [
    {
      id: 'task-1',
      title: '主体结构施工',
      status: 'in_progress',
      statusLabel: '进行中',
      progress: 48,
      assignee: '阿达是的',
      assigneeUnit: '总包单位',
      daysUntilDue: -4,
      dueStatus: 'overdue',
      dueLabel: '逾期 4 天',
      isTodayTodo: true,
    },
  ],
  stats: {
    total: 1,
    overdue: 1,
    urgent: 0,
    approaching: 0,
    normal: 0,
  },
}

const mockTaskTrend = [
  { month: '2026-02', total: 8, on_time: 6, delayed: 2 },
  { month: '2026-03', total: 10, on_time: 7, delayed: 3 },
  { month: '2026-04', total: 12, on_time: 9, delayed: 3 },
]

const mockFulfillmentTrend = [
  { month: '2026-02', committedCount: 8, fulfilledCount: 6, rate: 75 },
  { month: '2026-03', committedCount: 10, fulfilledCount: 7, rate: 70 },
  { month: '2026-04', committedCount: 12, fulfilledCount: 9, rate: 75 },
]

const mockWeeklyDigest = {
  id: 'digest-1',
  project_id: projectId,
  week_start: '2026-04-20',
  generated_at: now,
  overall_progress: 48,
  health_score: 72,
  progress_change: 3,
  completed_tasks_count: 2,
  completed_milestones_count: 0,
  critical_tasks_count: 3,
  critical_blocked_count: 1,
  critical_nearest_milestone: '主体结构封顶',
  critical_nearest_delay_days: 2,
  top_delayed_tasks: [{ task_id: 'task-1', title: '主体结构施工', assignee: '阿达是的', delay_days: 4 }],
  abnormal_responsibilities: [{ subject_id: 'unit-1', name: '总包单位', type: '施工' }],
  new_risks_count: 1,
  new_obstacles_count: 1,
  max_risk_level: 'warning',
}

const mockCompareSnapshot = [
  {
    period_label: '昨天',
    from: '2026-04-17',
    to: '2026-04-17',
    summary: {
      total_progress_change: 1.2,
      tasks_updated: 1,
      tasks_progressed: 1,
      tasks_completed: 0,
      total: 6,
      on_time: 4,
      delayed: 2,
      on_time_rate: 67,
    },
    task_ids: ['task-1'],
    task_details: [],
  },
  {
    period_label: '今天',
    from: '2026-04-18',
    to: '2026-04-18',
    summary: {
      total_progress_change: 3.2,
      tasks_updated: 2,
      tasks_progressed: 2,
      tasks_completed: 1,
      total: 6,
      on_time: 5,
      delayed: 1,
      on_time_rate: 83,
    },
    task_ids: ['task-1', 'task-2'],
    task_details: [],
  },
]

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 88,
    flag: 'high',
    note: '当前数据质量稳定，可作为分析依据',
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
        label: '异常检测命中率',
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
    summary: '当前没有需要额外提示的数据质量异常',
    items: [],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'info',
    scopeLabel: null,
    findingCount: 1,
    summary: '当前项目数据质量稳定',
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
      title: '主体结构施工',
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
      task_title: '主体结构施工',
      progress_before: 45,
      progress_after: 48,
      progress_delta: 3,
      assignee: '阿达是的',
    },
  ],
}

const mockTodayProgressItems = [
  {
    id: 'today-progress-1',
    taskId: 'task-1',
    title: '主体结构施工',
    previousProgress: 45,
    currentProgress: 55,
    delta: 10,
    changedAt: now,
  },
  {
    id: 'today-progress-2',
    taskId: 'task-2',
    title: '地下室结构施工',
    previousProgress: 20,
    currentProgress: 35,
    delta: 15,
    changedAt: now,
  },
]

const mockBaselineVersions = [
  {
    id: 'baseline-v2',
    project_id: projectId,
    version: 2,
    status: 'confirmed',
    title: '项目基线',
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
  title: '2026-04 月度计划',
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
      title: '主体结构施工',
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
  title: '2026-03 月度计划',
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
      title: '主体结构施工',
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
      title: '主体结构封顶',
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
    label: '整体稳定',
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
      title: '存在 1 条待补齐责任单位的数据项',
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

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  const manifestProjectId = manifest.projects?.standard?.id || manifest.projects?.large?.id || manifest.projects?.empty?.id
  assert(manifestProjectId, 'MOCK_API=false requires a project id in .tmp/full-app-test-env/manifest.json')
  projectId = manifestProjectId
  return projectId
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
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/projects/${projectId}/dashboard/project-summary`) {
    return json({ success: true, data: mockProjectSummary })
  }

  if (pathname === `/api/health-score/${projectId}`) {
    return json({ success: true, data: mockHealthScore })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: mockDataQualitySummary })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/daily-progress`) {
    return json({ success: true, data: mockDailyProgress })
  }

  if (pathname === `/api/projects/${projectId}/dashboard/today-progress`) {
    return json({ success: true, data: mockTodayProgressItems })
  }

  if (pathname === `/api/projects/${projectId}/dashboard/focus-tasks`) {
    return json({ success: true, data: mockFocusTasks })
  }

  if (pathname === `/api/projects/${projectId}/schedule-acceleration/remaining-forecast`) {
    return json({ success: true, data: mockRemainingForecast })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/trend`) {
    return json({ success: true, data: mockTaskTrend })
  }

  if (pathname === `/api/monthly-plans/projects/${projectId}/fulfillment-trend`) {
    return json({ success: true, data: mockFulfillmentTrend })
  }

  if (pathname === `/api/projects/${projectId}/weekly-digest/latest`) {
    return json({ success: true, data: mockWeeklyDigest })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/compare`) {
    return json({ success: true, data: mockCompareSnapshot })
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
  await assertLiveDistAuthEnabled()
  await resolveProjectId()

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
  const authHeaderFailures = []
  const apiRequests = []
  const pendingApiRequests = new Map()

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    })
    await primeBrowserAuth(page)

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('request', (request) => {
      if (!request.url().includes('/api/')) return
      if (
        !shouldUseMockApi
        && !isPublicBrowserApiRequest(request.url(), request.method())
        && !request.headers().authorization
      ) {
        authHeaderFailures.push({
          method: request.method(),
          url: request.url().replace(baseUrl, ''),
        })
      }
      const record = {
        method: request.method(),
        url: request.url(),
        startedAt: Date.now(),
        durationMs: null,
        statusCode: null,
        status: 'pending',
      }
      apiRequests.push(record)
      pendingApiRequests.set(request, record)
    })

    page.on('response', (response) => {
      const record = pendingApiRequests.get(response.request())
      if (record) {
        record.durationMs = Date.now() - record.startedAt
        record.statusCode = response.status()
        record.status = 'finished'
        pendingApiRequests.delete(response.request())
      }
      if (!response.url().includes('/api/') || response.status() < 400) return
      apiFailures.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
      })
    })

    page.on('requestfailed', (request) => {
      const record = pendingApiRequests.get(request)
      if (record) {
        record.durationMs = Date.now() - record.startedAt
        record.status = 'failed'
        record.failureText = request.failure()?.errorText ?? 'request failed'
        pendingApiRequests.delete(request)
      }
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
    await page.getByTestId('dashboard-decision-overview').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-health-weakness-panel').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('dashboard-action-panel').waitFor({ state: 'visible', timeout: 20000 })
    const firstScreenBudgetMs = shouldUseMockApi ? 750 : 2500
    await page.waitForTimeout(firstScreenBudgetMs)
    const firstScreenCutoff = Date.now()

    const initialUrl = page.url()
    assert(initialUrl.includes('/dashboard'), `Unexpected Dashboard URL: ${initialUrl}`)
    const initialText = await page.getByTestId('dashboard-decision-overview').innerText()
    const hasProgressDeviation = initialText.includes('进度偏差 -12%')
    const hasNullPlanFallback = initialText.includes('等待计划进度口径')
      && /计划\s+--/.test(initialText)
      && /偏差\s+--/.test(initialText)
    assert(hasProgressDeviation || hasNullPlanFallback, `Dashboard conclusion did not expose progress deviation or null-plan fallback: ${initialText}`)
    if (hasNullPlanFallback) {
      assert(!initialText.includes('基本按计划'), `Dashboard null-plan fallback was reported as on track: ${initialText}`)
      assert(!/计划应到\s+0%/.test(initialText), `Dashboard null-plan fallback rendered planned progress as 0%: ${initialText}`)
      assert(!/偏差\s+0%/.test(initialText), `Dashboard null-plan fallback rendered deviation as 0%: ${initialText}`)
    }
    assert(await page.getByTestId('dashboard-project-remaining-forecast').count() === 0, 'Remaining forecast card mounted inside the first-screen budget')
    assert(await page.getByTestId('dashboard-focus-tasks-panel').count() === 0, 'Focus tasks panel mounted before execution tab activation')
    assert(await page.getByTestId('dashboard-monthly-trend').count() === 0, 'Monthly trend mounted before trend tab activation')
    assert(await page.getByTestId('dashboard-weekly-digest').count() === 0, 'Weekly digest mounted before trend tab activation')
    assert(await page.getByTestId('dashboard-hero-cards').count() === 0, 'Old Dashboard four-card metric wall is still mounted')
    const supportText = await page.getByTestId('dashboard-snapshot-panel').innerText()
    assert(supportText.includes('预测详情'), `Dashboard support area did not expose forecast details tab: ${supportText}`)
    assert(supportText.includes('趋势与周报'), `Dashboard support area did not expose trend digest tab: ${supportText}`)
    assert(supportText.includes('执行明细'), `Dashboard support area did not expose execution detail tab: ${supportText}`)
    assert(!supportText.includes('摘要指标'), `Dashboard support area still exposes old summary metrics tab: ${supportText}`)

    const firstScreenRequests = apiRequests.filter((record) => record.startedAt <= firstScreenCutoff)
    const firstScreenHeavyRequests = firstScreenRequests.filter((record) => (
      /remaining-forecast|focus-tasks|today-progress|fulfillment-trend|weekly-digest|task-summary\/trend|task-summary\/compare/.test(record.url)
    ))
    const firstScreenPendingRequests = firstScreenRequests.filter((record) => record.status === 'pending')
    assert(firstScreenHeavyRequests.length === 0, `Heavy Dashboard requests were issued inside the first-screen budget: ${JSON.stringify(firstScreenHeavyRequests)}`)
    assert(firstScreenPendingRequests.length === 0, `Initial Dashboard requests still pending at ${firstScreenBudgetMs}ms cutoff: ${JSON.stringify(firstScreenPendingRequests)}`)
    await page.screenshot({ path: join(outputDir, 'dashboard-page-initial.png'), fullPage: true })
    const forecastDefaultStartedAt = firstScreenCutoff

    await page.getByTestId('dashboard-project-remaining-forecast').waitFor({ state: 'visible', timeout: 15000 })
    const forecastRequests = await waitForMatchingRequestsSettled(
      apiRequests,
      forecastDefaultStartedAt,
      /remaining-forecast/,
      postTabSettledBudgetMs,
      'Dashboard forecast default tab',
    )
    assert(forecastRequests.length > 0, 'Dashboard forecast default tab did not issue a remaining forecast request after the first-screen budget')
    assertNoFailedRequests(forecastRequests, 'Dashboard forecast default tab')
    await waitForTextSettled(page, {
      testId: 'dashboard-project-remaining-forecast',
      loadingTexts: ['读取预测详情'],
      settledTexts: [
        '预测完工',
        '项目剩余工期读取失败',
        '项目剩余工期预测暂不可用',
        '项目剩余工期预测使用缓存参考',
      ],
      timeout: postTabSettledBudgetMs,
      label: 'Dashboard forecast default tab',
    })
    const forecastSettledAt = Date.now()
    const forecastText = await page.getByTestId('dashboard-project-remaining-forecast').innerText()
    await page.screenshot({ path: join(outputDir, 'dashboard-page-forecast.png'), fullPage: true })

    const qualityTrigger = page.getByTestId('dashboard-data-quality-detail-trigger')
    await qualityTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(() => {
      const trigger = document.querySelector('[data-testid="dashboard-data-quality-detail-trigger"]')
      return /数据可靠性\s+\d+%/.test(trigger?.textContent ?? '')
    }, null, { timeout: 20000 })
    await qualityTrigger.click()
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const dialogText = await page.getByTestId('dashboard-data-quality-detail-dialog').innerText()
    assert(dialogText.includes('数据可靠性维度分解'), 'Dashboard data quality dialog did not render expected title')
    await page.screenshot({ path: join(outputDir, 'dashboard-page-quality-dialog.png'), fullPage: true })
    await page.getByLabel('关闭对话框').click()
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'hidden', timeout: 10000 })

    const trendTabStartedAt = Date.now()
    await page.getByRole('tab', { name: /趋势与周报/ }).click()
    await page.getByTestId('dashboard-monthly-trend').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('dashboard-weekly-digest').waitFor({ state: 'visible', timeout: 10000 })
    const compareReportsHref = await page.getByTestId('dashboard-compare-reports-link').getAttribute('href')
    assert(compareReportsHref?.includes('/reports?view=progress_deviation'), `Unexpected compare reports link: ${compareReportsHref}`)
    const trendRequests = await waitForMatchingRequestsSettled(
      apiRequests,
      trendTabStartedAt,
      /task-summary\/trend|fulfillment-trend|weekly-digest|task-summary\/compare/,
      postTabSettledBudgetMs,
      'Dashboard trend support tab',
    )
    const trendSettledAt = Date.now()
    assertNoFailedRequests(trendRequests, 'Dashboard trend support tab')
    await page.screenshot({ path: join(outputDir, 'dashboard-page-trend-support.png'), fullPage: true })

    const executionTabStartedAt = Date.now()
    await page.getByRole('tab', { name: /执行明细/ }).click()
    await page.getByTestId('dashboard-focus-tasks-panel').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('dashboard-live-panel').waitFor({ state: 'visible', timeout: 10000 })
    await waitForFocusTasksSettled(page, postTabSettledBudgetMs)
    await waitForTextSettled(page, {
      testId: 'dashboard-live-panel',
      loadingTexts: ['今日进展加载中'],
      settledTexts: [
        '今日进展暂不可用',
        '今日暂无进度变化',
      ],
      settledPatterns: ['\\d+%\\s*→\\s*\\d+%'],
      timeout: postTabSettledBudgetMs,
      label: 'Dashboard today progress',
    })
    const executionSettledAt = Date.now()
    const focusTasksText = await page.getByTestId('dashboard-focus-tasks-panel').innerText()
    const todayProgressText = await page.getByTestId('dashboard-live-panel').innerText()
    const executionRequests = matchingRequestRecords(apiRequests, executionTabStartedAt, /focus-tasks|today-progress/)
    assertNoPendingRequests(executionRequests, 'Dashboard execution tab')
    assertNoFailedRequests(executionRequests, 'Dashboard execution tab')
    await page.screenshot({ path: join(outputDir, 'dashboard-page-row3-split.png'), fullPage: true })

    await page.getByText('业务健康指标').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('执行稳定度').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('任务执行情况').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'dashboard-page-execution-health.png'), fullPage: true })

    assert(authHeaderFailures.length === 0, `Live Dashboard verify sent protected API requests without Authorization. client/dist may have been built with VITE_DISABLE_PERMISSION_SYSTEM=true; rebuild with: cmd.exe /d /c "set VITE_DISABLE_PERMISSION_SYSTEM=false&& npm.cmd run build --workspace=client". Missing auth requests: ${JSON.stringify(authHeaderFailures)}`)
    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      qualityDialogVisible: true,
      compareReportsHref,
      apiWaterfall: {
        firstScreenRequestCount: firstScreenRequests.length,
        firstScreenPendingRequestCount: firstScreenPendingRequests.length,
        firstScreenHeavyRequestCount: firstScreenHeavyRequests.length,
        firstScreenBudgetMs,
        totalRequestCount: apiRequests.length,
        requests: apiRequests.map((record) => ({
          method: record.method,
          url: record.url.replace(baseUrl, ''),
          durationMs: record.durationMs,
          statusCode: record.statusCode,
          status: record.status,
        })),
      },
      postTabSettledState: {
        budgetMs: postTabSettledBudgetMs,
        forecast: {
          settledMs: forecastSettledAt - forecastDefaultStartedAt,
          text: forecastText,
          requests: forecastRequests.map((record) => ({
            method: record.method,
            url: record.url.replace(baseUrl, ''),
            durationMs: record.durationMs,
            statusCode: record.statusCode,
            status: record.status,
          })),
        },
        execution: {
          settledMs: executionSettledAt - executionTabStartedAt,
          focusTasksText,
          todayProgressText,
          requests: executionRequests.map((record) => ({
            method: record.method,
            url: record.url.replace(baseUrl, ''),
            durationMs: record.durationMs,
            statusCode: record.statusCode,
            status: record.status,
          })),
        },
        trendSupport: {
          settledMs: trendSettledAt - trendTabStartedAt,
          requests: trendRequests.map((record) => ({
            method: record.method,
            url: record.url.replace(baseUrl, ''),
            durationMs: record.durationMs,
            statusCode: record.statusCode,
            status: record.status,
          })),
        },
      },
      authHeaderFailures,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'dashboard-page-initial.png'),
        qualityDialog: join(outputDir, 'dashboard-page-quality-dialog.png'),
        forecast: join(outputDir, 'dashboard-page-forecast.png'),
        trendSupport: join(outputDir, 'dashboard-page-trend-support.png'),
        row3Split: join(outputDir, 'dashboard-page-row3-split.png'),
        executionHealth: join(outputDir, 'dashboard-page-execution-health.png'),
      },
    }

    await writeFile(join(outputDir, 'dashboard-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      authHeaderFailures,
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
