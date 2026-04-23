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
const resumeStorageKey = `planning:draft-resume:baseline:${projectId}`
const resumeSnapshot = {
  resourceId: 'baseline-v7',
  versionLabel: 'v7',
  updatedAt: '2026-04-15T08:30:00.000Z',
  workspaceLabel: '椤圭洰鍩虹嚎',
}

const mockProject = {
  id: projectId,
  name: '璁″垝缁嗗垎娴佺▼鑱旇皟椤圭洰',
  description: 'Planning fine flows browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const baselineVersions = [
  {
    id: 'baseline-v7',
    project_id: projectId,
    version: 7,
    status: 'draft',
    title: '椤圭洰鍩虹嚎',
    description: '鍩轰簬 v6 鐢熸垚鐨勮崏绋垮揩鐓?',
    source_type: 'manual',
    source_version_id: 'baseline-v6',
    source_version_label: 'v6',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
  {
    id: 'baseline-v6',
    project_id: projectId,
    version: 6,
    status: 'confirmed',
    title: '椤圭洰鍩虹嚎',
    description: '宸茬‘璁ょ増鏈?',
    source_type: 'manual',
    confirmed_at: '2026-04-15T08:30:00.000Z',
    confirmed_by: 'user-1',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
]

const baselineDetails = {
  'baseline-v6': {
    ...baselineVersions[1],
    items: [
      {
        id: 'baseline-v6-root',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        title: '椤圭洰鍩虹嚎 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v6-l3',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-root',
        title: '缁撴瀯鏂藉伐 L3',
        source_task_id: 'task-struct',
        target_progress: 55,
        sort_order: 1,
        mapping_status: 'mapped',
        is_critical: true,
      },
    ],
  },
  'baseline-v7': {
    ...baselineVersions[0],
    items: [
      {
        id: 'baseline-v7-root',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        title: '椤圭洰鍩虹嚎 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v7-l4',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-root',
        title: '鏈堝害鏀跺彛 L4',
        source_task_id: 'task-monthly',
        sort_order: 1,
        mapping_status: 'pending',
      },
    ],
  },
}

const baselineLockResponse = {
  lock: {
    id: 'lock-v7',
    project_id: projectId,
    draft_type: 'baseline',
    resource_id: 'baseline-v7',
    locked_by: 'user-1',
    locked_at: '2026-04-15T08:30:00.000Z',
    lock_expires_at: '2099-04-15T09:00:00.000Z',
    is_locked: true,
    version: 1,
    created_at: '2026-04-15T08:30:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
}

const tasks = [
  {
    id: 'task-root',
    project_id: projectId,
    title: '涓讳綋缁撴瀯',
    wbs_level: 1,
    sort_order: 0,
    progress: 45,
    planned_start_date: '2099-09-01',
    planned_end_date: '2099-09-30',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-monthly',
    project_id: projectId,
    title: '鏈虹數瀹夎',
    parent_id: 'task-root',
    wbs_level: 2,
    sort_order: 1,
    progress: 20,
    planned_start_date: '2099-09-05',
    planned_end_date: '2099-09-25',
    created_at: now,
    updated_at: now,
  },
]

const conditions = [
  {
    id: 'condition-1',
    task_id: 'task-root',
    name: '鏉愭枡鍒板満',
    is_satisfied: false,
    created_at: now,
  },
]

const obstacles = [
  {
    id: 'obstacle-1',
    task_id: 'task-monthly',
    title: '鍦哄湴鍗忚皟',
    is_resolved: false,
    status: '澶勭悊涓?',
    created_at: now,
  },
]

const monthlyPlanDetail = {
  id: 'monthly-v9',
  project_id: projectId,
  version: 9,
  status: 'draft',
  month: '2099-09',
  title: '2099-09 鏈堝害璁″垝',
  baseline_version_id: 'baseline-v6',
  source_version_id: 'baseline-v6',
  carryover_item_count: 1,
  created_at: now,
  updated_at: now,
  items: [
    {
      id: 'monthly-item-1',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v9',
      source_task_id: 'task-root',
      title: '涓讳綋缁撴瀯',
      planned_start_date: '2099-09-01',
      planned_end_date: '2099-09-30',
      target_progress: 60,
      current_progress: 45,
      sort_order: 0,
      commitment_status: 'planned',
    },
    {
      id: 'monthly-item-2',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v9',
      source_task_id: 'task-monthly',
      title: '鏈虹數瀹夎',
      planned_start_date: '2099-09-05',
      planned_end_date: '2099-09-25',
      target_progress: 35,
      current_progress: 20,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

const monthlyPlanVersions = [
  {
    ...monthlyPlanDetail,
    items: undefined,
  },
]

const monthlyLockResponse = {
  lock: {
    id: 'monthly-lock-1',
    project_id: projectId,
    draft_type: 'monthly_plan',
    resource_id: 'monthly-v9',
    locked_by: 'user-1',
    locked_at: '2099-09-15T08:00:00.000Z',
    lock_expires_at: '2099-09-15T08:30:00.000Z',
    is_locked: true,
  },
}

const projectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '杩涜涓?',
  plannedEndDate: '2099-12-31',
  daysUntilPlannedEnd: 90,
  totalTasks: 8,
  leafTaskCount: 6,
  completedTaskCount: 2,
  inProgressTaskCount: 3,
  delayedTaskCount: 1,
  overallProgress: 48,
  milestoneProgress: 0,
  totalMilestones: 2,
  completedMilestones: 0,
  healthScore: 81,
  healthStatus: '绋冲畾',
  activeRiskCount: 1,
  riskCount: 1,
  pendingConditionCount: 1,
  activeObstacleCount: 1,
  pendingConditionTaskCount: 1,
  activeObstacleTaskCount: 1,
  attentionRequired: true,
  scheduleVarianceDays: 3,
  activeDelayRequests: 1,
  monthlyCloseStatus: '杩涜涓?',
  closeoutOverdueDays: 0,
  unreadWarningCount: 1,
  highestWarningLevel: 'warning',
  highestWarningSummary: '瀛樺湪 1 鏉℃潯浠跺緟纭',
  shiftedMilestoneCount: 0,
  criticalPathAffectedTasks: 1,
  milestoneOverview: {
    milestoneCount: 2,
    delayedMilestoneCount: 0,
    completedMilestoneCount: 0,
    upcomingMilestoneCount: 1,
  },
}

const dataQualitySummary = {
  projectId,
  month: '2099-09',
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

const progressDeviationAnalysis = {
  project_id: projectId,
  baseline_version_id: 'baseline-v6',
  monthly_plan_version_id: null,
  summary: {
    total_items: 1,
    deviated_items: 0,
    carryover_items: 0,
    unresolved_items: 0,
    baseline_items: 1,
    monthly_plan_items: 0,
    execution_items: 0,
  },
  rows: [],
  mainlines: [],
  trend_events: [],
}

const progressDeviationLock = {
  lock: {
    id: 'progress-lock-1',
    project_id: projectId,
    baseline_version_id: 'baseline-v6',
    resource_id: `${projectId}:baseline-v6`,
    locked_by: 'pm-user',
    locked_at: '2099-09-15T09:00:00.000Z',
    lock_expires_at: '2099-09-15T09:30:00.000Z',
    is_locked: true,
  },
}

const changeLogs = [
  {
    id: 'change-log-1',
    project_id: projectId,
    entity_type: 'delay_request',
    entity_id: 'delay-1',
    field_name: 'status',
    old_value: 'pending',
    new_value: 'approved',
    change_reason: '寤舵湡瀹℃壒閫氳繃',
    change_source: 'approval',
    changed_at: '2099-09-13T10:00:00.000Z',
  },
]

const criticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-root'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-root'],
    totalDurationDays: 30,
    displayLabel: '涓诲叧閿矾寰?',
  },
  alternateChains: [],
  displayTaskIds: ['task-root'],
  edges: [],
  tasks: [
    {
      taskId: 'task-root',
      title: '涓讳綋缁撴瀯',
      floatDays: 0,
      durationDays: 30,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 30,
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

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: baselineVersions })
  }

  if (pathname === '/api/task-baselines/baseline-v7') {
    return json({ success: true, data: baselineDetails['baseline-v7'] })
  }

  if (pathname === '/api/task-baselines/baseline-v6') {
    return json({ success: true, data: baselineDetails['baseline-v6'] })
  }

  if (pathname === '/api/task-baselines/baseline-v7/lock') {
    return json({ success: true, data: baselineLockResponse })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: tasks })
  }

  if (pathname === '/api/task-conditions') {
    return json({ success: true, data: conditions })
  }

  if (pathname === '/api/task-obstacles') {
    return json({ success: true, data: obstacles })
  }

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: monthlyPlanVersions })
  }

  if (pathname === `/api/monthly-plans/${monthlyPlanDetail.id}`) {
    return json({ success: true, data: monthlyPlanDetail })
  }

  if (pathname === `/api/monthly-plans/${monthlyPlanDetail.id}/lock`) {
    return json({ success: true, data: monthlyLockResponse })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: projectSummary })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: dataQualitySummary })
  }

  if (pathname === '/api/progress-deviation') {
    return json({ success: true, data: progressDeviationAnalysis })
  }

  if (pathname === '/api/progress-deviation/lock') {
    return json({ success: true, data: progressDeviationLock })
  }

  if (pathname === '/api/change-logs') {
    return json({ success: true, data: changeLogs })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: criticalPathSnapshot })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/issues'
    || pathname === '/api/warnings'
    || pathname === '/api/delay-requests'
    || pathname === '/api/tasks/progress-snapshots'
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
    await primeBrowserAuth(page)

    await page.addInitScript(({ key, snapshot }) => {
      window.localStorage.setItem(key, JSON.stringify(snapshot))
    }, { key: resumeStorageKey, snapshot: resumeSnapshot })

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

    const baselineUrl = `${baseUrl}/#/projects/${projectId}/planning/baseline`
    await page.goto(baselineUrl, { waitUntil: 'domcontentloaded' })

    const resumeDialog = page.getByTestId('planning-draft-resume-dialog')
    await resumeDialog.waitFor({ state: 'visible', timeout: 20000 })
    await page.screenshot({ path: join(outputDir, 'planning-baseline-resume-dialog.png'), fullPage: true })

    await resumeDialog.locator('button').first().click()
    await resumeDialog.waitFor({ state: 'hidden', timeout: 10000 })

    const storedResumeSnapshot = await page.evaluate((key) => window.localStorage.getItem(key), resumeStorageKey)
    assert(storedResumeSnapshot === null, 'Baseline draft resume snapshot should be cleared after discard')

    const baselineChangeLogButton = page.getByTestId('baseline-open-change-log')
    await baselineChangeLogButton.waitFor({ state: 'visible', timeout: 20000 })
    await page.screenshot({ path: join(outputDir, 'planning-baseline-page-fine-flows.png'), fullPage: true })

    await baselineChangeLogButton.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      document.querySelector('[data-testid="baseline-open-change-log"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    })
    await page.waitForFunction(
      (expectedProjectId) => window.location.hash.includes(`/projects/${expectedProjectId}/reports?view=change_log`),
      projectId,
      { timeout: 10000 },
    )
    await page.getByTestId('change-log-view').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-baseline-change-log.png'), fullPage: true })

    const changeLogUrl = page.url()
    const changeLogText = await page.getByTestId('change-log-view').innerText()
    assert(changeLogText.includes('delay_request') || changeLogText.includes('status'), 'Change log view did not render expected record summary')

    const monthlyUrl = `${baseUrl}/#/projects/${projectId}/planning/monthly?month=2099-09`
    await page.goto(monthlyUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('monthly-plan-source-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-regenerate-draft').waitFor({ state: 'visible', timeout: 10000 })

    await page.getByTestId('monthly-plan-regenerate-draft').click()
    await page.getByTestId('monthly-plan-regenerate-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-monthly-regenerate-fine-flow.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      baselineUrl,
      changeLogUrl,
      resumeDialogHandled: true,
      changeLogVisible: true,
      monthlyRegenerateDialogVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        resumeDialog: join(outputDir, 'planning-baseline-resume-dialog.png'),
        baselinePage: join(outputDir, 'planning-baseline-page-fine-flows.png'),
        changeLog: join(outputDir, 'planning-baseline-change-log.png'),
        monthlyRegenerate: join(outputDir, 'planning-monthly-regenerate-fine-flow.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-fine-flows-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-fine-flows-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
