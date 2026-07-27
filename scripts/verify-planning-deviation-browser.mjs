import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  isIgnorableBrowserConsoleError,
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
  name: '偏差分析联调项目',
  description: 'Planning deviation browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const governanceSnapshot = {
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
    total_events: 2,
    windows: [
      {
        window_days: 7,
        event_count: 2,
        affected_task_count: 1,
        cumulative_event_count: 2,
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
      detail: '请在治理面板中确认并补齐后再重新校核',
      source_id: `${projectId}:integrity`,
    },
  ],
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: '主体结构施工',
    description: '治理联调任务',
    status: 'in_progress',
    progress: 52,
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-05-15',
    start_date: '2026-04-01',
    end_date: '2026-05-15',
    created_at: now,
    updated_at: now,
  },
]

const mockWarnings = [
  {
    id: 'warning-1',
    task_id: 'task-1',
    source_type: 'condition_expired',
    warning_type: 'condition_due',
    warning_level: 'warning',
    title: '开工条件即将到',
    description: '请确认现场开工条',
    is_acknowledged: false,
    created_at: now,
  },
]

const mockRisks = [
  {
    id: 'risk-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '结构资源切换风险',
    description: '需要协调平行工序窗',
    level: 'high',
    probability: 70,
    impact: 80,
    status: 'mitigating',
    created_at: now,
    updated_at: now,
    version: 1,
  },
]

const mockIssues = [
  {
    id: 'issue-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '结构移交偏晚',
    description: '请关注移交窗口冲',
    severity: 'high',
    priority: 3,
    status: 'investigating',
    created_at: now,
    updated_at: now,
    version: 1,
  },
]

const mockProjectSummary = {
  id: projectId,
  name: '偏差分析联调项目',
  status: 'active',
  statusLabel: '进行',
  overallProgress: 52,
  taskProgress: 52,
  totalTasks: 6,
  leafTaskCount: 5,
  completedTaskCount: 2,
  inProgressTaskCount: 2,
  delayedTaskCount: 1,
  delayDays: 3,
  activeRiskCount: 1,
  activeObstacleCount: 0,
  pendingConditionTaskCount: 1,
  highestWarningSummary: '治理信号仍有 1 条待处理',
  healthScore: 82,
}

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 87,
    flag: 'high',
    note: '治理数据可直接用于联调',
    timelinessScore: 90,
    anomalyScore: 84,
    consistencyScore: 86,
    coverageScore: 88,
    jumpinessScore: 82,
    activeFindingCount: 1,
    trendWarningCount: 0,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 0,
    dimensions: [],
  },
  prompt: {
    count: 0,
    summary: '当前没有额外数据质量提示',
    items: [],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'info',
    scopeLabel: null,
    findingCount: 1,
    summary: '数据质量稳定',
  },
  findings: [],
}

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

const mockExecutionDeviationRow = {
  id: 'execution-row-1',
  title: '主体结构施工',
  mainline: 'execution',
  planned_progress: 72,
  actual_progress: 58,
  actual_date: '2026-04-15',
  deviation_days: 4,
  deviation_rate: 14,
  status: 'delayed',
  reason: '现场资源切换导致执行进度低于计划',
}

const mockProgressDeviation = {
  project_id: projectId,
  baseline_version_id: 'baseline-v2',
  monthly_plan_version_id: 'monthly-v9',
  version_lock: null,
  summary: {
    total_items: 1,
    deviated_items: 1,
    carryover_items: 0,
    unresolved_items: 0,
    baseline_items: 1,
    monthly_plan_items: 1,
    execution_items: 1,
  },
  rows: [mockExecutionDeviationRow],
  mainlines: [
    {
      key: 'execution',
      label: '执行偏差',
      summary: { total_items: 1, deviated_items: 1, delayed_items: 1, unresolved_items: 0 },
      rows: [mockExecutionDeviationRow],
    },
  ],
  trend_events: [],
}

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
  items: [],
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
      id: 'closeout-item-2',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v8',
      source_task_id: 'task-1',
      title: '主体结构施工',
      planned_start_date: '2026-03-01',
      planned_end_date: '2026-03-30',
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

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-1'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-1'],
    totalDurationDays: 45,
    displayLabel: '主关键路',
  },
  alternateChains: [],
  displayTaskIds: ['task-1'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: '主体结构施工',
      floatDays: 0,
      durationDays: 45,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 45,
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

export function resolvePlanningDeviationProjectId({
  envProjectId = process.env.PROJECT_ID,
  mockApi = shouldUseMockApi,
  currentProjectId = projectId,
  manifest,
} = {}) {
  return resolveGanttProjectId({ envProjectId, mockApi, currentProjectId, manifest })
}

export function resolvePlanningDeviationRoutes(targetProjectId) {
  const encodedProjectId = encodeURIComponent(targetProjectId)
  return {
    retiredPath: `/projects/${encodedProjectId}/planning/deviation`,
    canonicalPath: `/projects/${encodedProjectId}/reports?view=progress_deviation`,
  }
}

export function resolveDefaultPlanningDeviationRows(analysis) {
  const mainlines = Array.isArray(analysis?.mainlines) ? analysis.mainlines : []
  const executionMainline = mainlines.find((mainline) => mainline?.key === 'execution')
  if (Array.isArray(executionMainline?.rows)) {
    return executionMainline.rows
  }

  const rows = Array.isArray(analysis?.rows) ? analysis.rows : []
  return rows.filter((row) => row?.mainline === 'execution')
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  projectId = resolvePlanningDeviationProjectId({ manifest })
  return projectId
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
    return json({
      success: true,
      data: [{
        id: projectId,
        name: '偏差分析联调项目',
        description: 'Planning deviation browser verification fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
      }],
    })
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
        conditions: [],
        obstacles: [],
        warnings: mockWarnings,
        issues: mockIssues,
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === '/api/planning-governance') {
    return json({ success: true, data: governanceSnapshot, timestamp: now })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: mockProjectSummary })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: mockDataQualitySummary })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselineVersions })
  }

  if (pathname === '/api/progress-deviation') {
    return json({ success: true, data: mockProgressDeviation })
  }

  if (pathname === '/api/progress-deviation/lock') {
    return json({ success: true, data: null })
  }

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: mockMonthlyVersions })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}`) {
    return json({ success: true, data: mockMonthlyPlanDetail })
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

  if (
    pathname === '/api/milestones'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/risks') {
    return json({ success: true, data: mockRisks })
  }

  if (pathname === '/api/issues') {
    return json({ success: true, data: mockIssues })
  }

  if (pathname === '/api/warnings') {
    return json({ success: true, data: mockWarnings })
  }

  if (
    pathname === '/api/task-conditions'
    || pathname === '/api/milestones'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/change-logs'
  ) {
    return json({ success: true, data: [] })
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
        const text = message.text()
        if (!isIgnorableBrowserConsoleError(text)) {
          consoleErrors.push(text)
        }
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
        const responseBody = response.status() >= 400 ? await response.text() : undefined
        if (response.status() >= 400) {
          recordApiFailure(apiFailures, {
            type: 'proxy-response',
            url: forwardUrl,
            status: response.status(),
            statusText: response.statusText(),
            body: responseBody ? responseBody.slice(0, 2000) : '',
          })
        }
        await route.fulfill(responseBody === undefined ? { response } : { response, body: responseBody })
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

    const routes = resolvePlanningDeviationRoutes(projectId)
    const retiredUrl = `${baseUrl}/#${routes.retiredPath}`
    await page.goto(retiredUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '页面不存在' }).waitFor({ state: 'visible', timeout: 20000 })
    const retiredWorkspaceCount = await page.getByTestId('planning-governance-workspace').count()
    assert(retiredWorkspaceCount === 0, 'Retired planning governance workspace must not reappear')
    await page.screenshot({ path: join(outputDir, 'planning-deviation-retired-route.png'), fullPage: true })

    const canonicalUrl = `${baseUrl}/#${routes.canonicalPath}`
    await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('deviation-shell').waitFor({ state: 'visible', timeout: 20000 })
    const deviationTable = page.getByTestId('deviation-detail-table')
    await deviationTable.waitFor({ state: 'visible', timeout: 20000 })
    const deviationRowCount = await deviationTable.locator('tr[role="button"]').count()
    const emptyStateVisible = await deviationTable.getByText('暂无详情表数据').isVisible().catch(() => false)
    if (shouldUseMockApi) {
      const expectedRowCount = resolveDefaultPlanningDeviationRows(mockProgressDeviation).length
      assert(expectedRowCount > 0, 'Mock progress deviation fixture must contain execution rows')
      assert(
        deviationRowCount === expectedRowCount,
        `Mock progress deviation row mismatch: expected ${expectedRowCount}, got ${deviationRowCount}`,
      )
    } else {
      assert(
        deviationRowCount > 0 || emptyStateVisible,
        'Canonical progress deviation report must render detail rows or its controlled empty state',
      )
    }
    const reportsUrl = page.url()
    assert(reportsUrl.includes(routes.canonicalPath), `Unexpected canonical deviation URL: ${reportsUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-deviation-report.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      retiredUrl,
      retiredRouteNotFound: true,
      reportsUrl,
      deviationRowCount,
      emptyStateVisible,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        retiredRoute: join(outputDir, 'planning-deviation-retired-route.png'),
        reports: join(outputDir, 'planning-deviation-report.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-deviation-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText({ timeout: 2000 })
      } catch {
        pageBodyText = null
      }
      try {
        failureScreenshot = join(outputDir, 'planning-deviation-failure.png')
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
    await writeFile(join(outputDir, 'planning-deviation-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
