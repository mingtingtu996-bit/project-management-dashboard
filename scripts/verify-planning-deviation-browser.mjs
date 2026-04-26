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

const governanceSnapshot = {
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
      title: '瀛樺湪 1 鏉″緟琛ラ綈璐ｄ换鍗曚綅鐨勬暟鎹」',
      detail: '璇峰湪娌荤悊闈㈡澘涓‘璁ゅ苟琛ラ綈鍚庡啀閲嶆柊鏍℃牳銆?',
      source_id: `${projectId}:integrity`,
    },
  ],
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: '涓讳綋缁撴瀯鏂藉伐',
    description: '娌荤悊鑱旇皟浠诲姟',
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
    title: '寮€宸ユ潯浠跺嵆灏嗗埌鏈?',
    description: '璇风‘璁ょ幇鍦哄紑宸ユ潯浠?',
    is_acknowledged: false,
    created_at: now,
  },
]

const mockRisks = [
  {
    id: 'risk-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '缁撴瀯璧勬簮鍒囨崲椋庨櫓',
    description: '闇€瑕佸崗璋冨钩琛屽伐搴忕獥鍙?',
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
    title: '缁撴瀯绉讳氦鍋忔櫄',
    description: '璇峰叧娉ㄧЩ浜ょ獥鍙ｅ啿绐?',
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
  name: '鍋忓樊鍒嗘瀽鑱旇皟椤圭洰',
  status: 'active',
  statusLabel: '杩涜涓?',
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
  highestWarningSummary: '娌荤悊淇″彿浠嶆湁 1 鏉″緟澶勭悊',
  healthScore: 82,
}

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 87,
    flag: 'high',
    note: '娌荤悊鏁版嵁鍙洿鎺ョ敤浜庤仈璋冦€?',
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
    summary: '褰撳墠娌℃湁棰濆鏁版嵁璐ㄩ噺鎻愮ず銆?',
    items: [],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'info',
    scopeLabel: null,
    findingCount: 1,
    summary: '鏁版嵁璐ㄩ噺绋冲畾',
  },
  findings: [],
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
  rows: [],
  mainlines: [],
  trend_events: [],
}

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
  items: [],
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
      id: 'closeout-item-2',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v8',
      source_task_id: 'task-1',
      title: '涓讳綋缁撴瀯鏂藉伐',
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
    displayLabel: '涓诲叧閿矾寰?',
  },
  alternateChains: [],
  displayTaskIds: ['task-1'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: '涓讳綋缁撴瀯鏂藉伐',
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
        name: '鍋忓樊鍒嗘瀽鑱旇皟椤圭洰',
        description: 'Planning deviation browser verification fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
      }],
    })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({
      success: true,
      data: {
        id: projectId,
        name: '鍋忓樊鍒嗘瀽鑱旇皟椤圭洰',
        description: 'Planning deviation browser verification fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
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
    || pathname === '/api/delay-requests'
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/deviation`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-governance-banner').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-governance-quick-links').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-deviation-page.png'), fullPage: true })

    await page.getByTestId('planning-governance-snooze').click()
    await page.getByText('已稍后处理').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('planning-governance-recheck').click()
    await page.getByTestId('planning-governance-banner').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-deviation-snoozed.png'), fullPage: true })

    await page.getByTestId('planning-quick-link-gantt').click()
    await page.waitForFunction(() => window.location.hash.includes('/gantt'))
    await page.getByTestId('task-workspace-layer-l1').waitFor({ state: 'visible', timeout: 20000 })
    const ganttUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-deviation-to-gantt.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-quick-link-risks').click()
    await page.waitForFunction(() => window.location.hash.includes('/risks'))
    await page.getByTestId('risk-summary-band').waitFor({ state: 'visible', timeout: 20000 })
    const risksUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-deviation-to-risks.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-quick-link-change-log').click()
    await page.waitForFunction(() => window.location.hash.includes('/reports?view=change_log'))
    await page.getByTestId('change-log-view').waitFor({ state: 'visible', timeout: 20000 })
    const reportsUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-deviation-to-change-log.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-quick-link-closeout').click()
    await page.waitForFunction(() => window.location.hash.includes('/tasks/closeout'))
    await page.getByTestId('closeout-filter-bar').waitFor({ state: 'visible', timeout: 20000 })
    const closeoutUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-deviation-to-closeout.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      snoozed: true,
      ganttUrl,
      risksUrl,
      reportsUrl,
      closeoutUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-deviation-page.png'),
        snoozed: join(outputDir, 'planning-deviation-snoozed.png'),
        gantt: join(outputDir, 'planning-deviation-to-gantt.png'),
        risks: join(outputDir, 'planning-deviation-to-risks.png'),
        reports: join(outputDir, 'planning-deviation-to-change-log.png'),
        closeout: join(outputDir, 'planning-deviation-to-closeout.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-deviation-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-deviation-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
