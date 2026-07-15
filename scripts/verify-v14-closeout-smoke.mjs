import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { maybeBuildMockAuthResponse, primeBrowserAuth } from './browser-auth-fixture.mjs'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const port = Number(process.env.PORT || 4185)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const projectId = process.env.PROJECT_ID || '422ba093-7a94-4e91-a47a-c1b865185e86'
const now = new Date().toISOString()

const project = {
  id: projectId,
  name: 'v1.4 收口浏览器验证项目',
  status: 'active',
  current_phase: 'construction',
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-12-31',
  created_at: now,
  updated_at: now,
}

let task = {
  id: 'task-1',
  project_id: projectId,
  title: '主体结构钢筋绑扎',
  status: 'in_progress',
  priority: 'high',
  progress: 40,
  start_date: '2026-05-01',
  end_date: '2026-05-06',
  planned_start_date: '2026-05-01',
  planned_end_date: '2026-05-06',
  actual_start_date: '2026-05-01T00:00:00.000Z',
  assignee_name: '林工',
  assignee_user_id: 'user-1',
  participant_unit_name: '总包单位',
  wbs_code: '1.1.1',
  wbs_node_type: 'process',
  progress_method: 'percent',
  engineering_object_id: 'object-1',
  created_at: now,
  updated_at: now,
  version: 1,
}

const commitPayloads = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
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
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function ensureDistExists() {
  try {
    await access(distIndexFile)
  } catch {
    throw new Error(`Missing build artifact: ${distIndexFile}. Run npm run build --workspace=client first.`)
  }
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
  })
}

function fieldRegistry() {
  const fields = [
    ['title', 'basic_plan', '任务名称', 'text'],
    ['planned_start_date', 'basic_plan', '计划开始', 'date'],
    ['planned_end_date', 'basic_plan', '计划完成', 'date'],
    ['progress', 'progress_fact', '进度', 'percent'],
    ['assignee_user_id', 'responsibility', '责任人', 'lookup'],
    ['participant_unit_id', 'responsibility', '责任单位', 'lookup'],
  ].map(([key, group, label, dataType]) => ({
    key,
    group,
    displayGroup: group,
    mergeGroup: key === 'progress' ? 'progress_status' : key === 'title' ? 'identity' : 'schedule',
    label,
    dataType,
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  }))

  return {
    registryVersion: 'browser-smoke-v1',
    surface: 'task_list',
    generatedAt: now,
    updatedAt: now,
    groups: [],
    fields,
  }
}

function workspaceData() {
  const workspaceProject = {
    id: projectId,
    name: project.name,
    projectType: '房建',
    stage: '主体结构',
    ownerName: '张工',
    location: '上海',
    healthScore: 83,
    progress: 56,
    criticalPathCount: 2,
    lastActivityAt: now,
    myRole: 'company_admin',
  }

  return {
    hasCompany: true,
    currentCompany: {
      id: 'company-1',
      name: '华东一公司',
      role: 'company_admin',
      isCurrent: true,
    },
    switchableCompanies: [
      { id: 'company-1', name: '华东一公司', role: 'company_admin', isCurrent: true },
      { id: 'company-2', name: '华南分公司', role: 'regular', isCurrent: false },
    ],
    myProjects: [workspaceProject],
    recentProjects: [workspaceProject],
    companyProjects: [workspaceProject, { ...workspaceProject, id: 'project-2', name: '二期商业配套', myRole: 'owner' }],
    joinableProjects: [
      {
        id: 'project-3',
        name: '屋面工程专项',
        projectType: '房建',
        stage: '待开工',
        ownerName: '赵工',
        location: '杭州',
        joinRequestStatus: 'idle',
      },
    ],
    pendingInvitations: [
      {
        id: 'inv-1',
        projectId: 'project-4',
        projectName: '幕墙专项',
        inviterName: '李工',
        invitedAt: now,
        companyName: '华东一公司',
        role: 'editor',
      },
    ],
    joinRequests: [
      {
        id: 'join-1',
        projectId: 'project-5',
        projectName: '精装修样板段',
        status: 'pending',
      },
    ],
    demoEntry: { available: true, label: '产品预览', route: '/demo' },
    emptyStateReason: null,
  }
}

function projectSummary() {
  return {
    id: projectId,
    name: project.name,
    status: 'active',
    statusLabel: '进行中',
    plannedStartDate: '2026-03-01',
    plannedEndDate: '2026-12-31',
    daysUntilPlannedEnd: 120,
    totalTasks: 8,
    leafTaskCount: 6,
    completedTaskCount: 3,
    inProgressTaskCount: 2,
    delayedTaskCount: 1,
    delayDays: 2,
    delayCount: 1,
    overallProgress: 56,
    taskProgress: 56,
    totalMilestones: 2,
    completedMilestones: 1,
    milestoneProgress: 50,
    riskCount: 1,
    activeRiskCount: 1,
    activeIssueCount: 1,
    pendingConditionCount: 1,
    pendingConditionTaskCount: 1,
    activeObstacleCount: 1,
    activeObstacleTaskCount: 1,
    preMilestoneCount: 1,
    completedPreMilestoneCount: 0,
    activePreMilestoneCount: 1,
    overduePreMilestoneCount: 0,
    acceptancePlanCount: 1,
    passedAcceptancePlanCount: 0,
    inProgressAcceptancePlanCount: 1,
    failedAcceptancePlanCount: 0,
    constructionDrawingCount: 4,
    issuedConstructionDrawingCount: 3,
    reviewingConstructionDrawingCount: 1,
    healthScore: 83,
    healthStatus: '健康',
    nextMilestone: null,
    milestoneOverview: {},
  }
}

function dataQualitySummary() {
  return {
    projectId,
    month: '2026-05',
    confidence: {
      score: 91,
      flag: 'high',
      note: '当前数据可靠性较高，可用于项目判断。',
      timelinessScore: 92,
      anomalyScore: 90,
      consistencyScore: 91,
      coverageScore: 93,
      jumpinessScore: 89,
      weights: {
        timeliness: 0.3,
        anomaly: 0.25,
        consistency: 0.2,
        jumpiness: 0.1,
        coverage: 0.15,
      },
      activeFindingCount: 0,
      trendWarningCount: 0,
      anomalyFindingCount: 0,
      crossCheckFindingCount: 0,
      dimensions: [
        {
          key: 'timeliness',
          label: '填报及时性',
          score: 92,
          weight: 0.3,
          maxContribution: 30,
          actualContribution: 27.6,
          lossContribution: 2.4,
          lossShare: 27,
        },
      ],
    },
    prompt: { count: 0, summary: '暂无数据质量异常', items: [] },
    ownerDigest: { shouldNotify: false, severity: 'info', scopeLabel: null, findingCount: 0, summary: '数据质量稳定' },
    findings: [],
  }
}

function notificationAnalytics() {
  return {
    totalCount: 4,
    byTouchpointType: { business_warning: 2, flow_reminder: 1, dashboard_todo: 1 },
    byNotificationType: { risk_warning: 2, task_reminder: 1, todo: 1 },
    byLifecycleStatus: { active: 4 },
    dedupeKeyCount: 3,
    dedupeCoverageRate: 75,
    duplicateDedupeKeyRate: 33,
    userStateCount: 4,
    readRate: 50,
    acknowledgedRate: 25,
    muteRate: 25,
    hiddenRate: 0,
    actionConversionRate: 25,
    metricValues: {
      notification_total_count: 4,
      notification_read_rate: 50,
      notification_mute_rate: 25,
      notification_dedupe_coverage_rate: 75,
      notification_action_conversion_rate: 25,
    },
  }
}

function commitResponse(postData) {
  const payload = postData ? JSON.parse(postData) : {}
  commitPayloads.push(payload)
  const updateOperation = (payload.operations ?? []).find((operation) => operation.rowId === task.id)
  const values = updateOperation?.values ?? {}
  task = {
    ...task,
    ...values,
    progress: values.progress ?? task.progress,
    status: values.status ?? task.status,
    actual_end_date: values.progress === 100 || values.status === 'completed' ? now : task.actual_end_date,
    updated_at: now,
    version: task.version + 1,
  }

  return {
    success: true,
    surface: 'task_list',
    resourceId: projectId,
    revision: 2,
    fieldRegistryVersion: 'browser-smoke-v1',
    rows: [task],
    validationIssues: [],
    governanceSummary: {
      changedRowCount: 1,
      createdRowCount: 0,
      updatedRowCount: 1,
      deletedRowCount: 0,
      dateAdjustmentCount: 0,
      progressAdjustmentCount: 1,
      milestoneChangeCount: 0,
      dependencyChangeCount: 0,
    },
    deletionResults: [],
    criticalPathChangeSummary: { changed: false, enteredTaskIds: [], leftTaskIds: [] },
    realtimeEvents: [],
    tempIdMap: {},
  }
}

function buildMockResponse(urlString, method = 'GET', postData = null) {
  const url = new URL(urlString)
  const pathname = url.pathname
  const authResponse = maybeBuildMockAuthResponse(pathname, json)
  if (authResponse) return authResponse

  if (pathname === '/api/workspace') return json({ success: true, data: workspaceData() })
  if (pathname === '/api/projects') return json({ success: true, data: [project] })
  if (pathname === `/api/projects/${projectId}`) return json({ success: true, data: project })
  if (pathname === '/api/dashboard/project-summary') return json({ success: true, data: projectSummary() })
  if (pathname === `/api/health-score/${projectId}`) {
    return json({
      success: true,
      data: {
        score: 83,
        details: {
          totalScore: 83,
          businessHealthScore: 83,
          reliabilityScore: 91,
          progressDeliveryScore: 84,
          taskExecutionScore: 82,
          milestoneDeliveryScore: 86,
          riskControlScore: 80,
          dataTrustScore: 91,
        },
      },
    })
  }
  if (pathname === '/api/data-quality/project-summary') return json({ success: true, data: dataQualitySummary() })
  if (pathname === '/api/notifications/analytics') return json({ success: true, data: notificationAnalytics() })
  if (pathname === `/api/projects/${projectId}/dashboard/today-progress`) return json({ success: true, data: [] })
  if (pathname === `/api/projects/${projectId}/weekly-digest/latest`) return json({ success: true, data: null })
  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/trend`) return json({ success: true, data: [] })
  if (pathname === `/api/monthly-plans/projects/${projectId}/fulfillment-trend`) return json({ success: true, data: [] })
  if (pathname === '/api/planning/field-registry') return json({ success: true, data: fieldRegistry() })
  if (pathname === '/api/tasks') return json({ success: true, data: [task] })
  if (pathname === '/api/tasks/commit' && method === 'POST') return json({ success: true, data: commitResponse(postData) })
  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: [{ userId: 'user-1', displayName: '林工', permissionLevel: 'owner' }] })
  }
  if (pathname === `/api/projects/${projectId}/critical-path` || pathname === `/api/projects/${projectId}/critical-path/refresh`) {
    return json({
      success: true,
      data: {
        projectId,
        autoTaskIds: [task.id],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: { id: 'chain-1', source: 'auto', taskIds: [task.id], totalDurationDays: 6, displayLabel: '主关键路径' },
        alternateChains: [],
        displayTaskIds: [task.id],
        edges: [],
        tasks: [{ taskId: task.id, title: task.title, floatDays: 0, durationDays: 6, isAutoCritical: true }],
        projectDurationDays: 6,
      },
    })
  }
  if (
    pathname === '/api/task-baselines'
    || pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname === '/api/participant-units'
    || pathname === `/api/projects/${projectId}/critical-path/overrides`
  ) {
    return json({ success: true, data: [] })
  }
  if (pathname === '/api/engineering-objects') {
    return json({
      success: true,
      data: [
        {
          id: 'object-1',
          project_id: projectId,
          object_name: '主体结构',
          object_code: 'OBJ-001',
          object_type: '专业工程',
          status: 'active',
        },
      ],
    })
  }
  if (pathname === '/api/data-quality/live-check') {
    return json({ success: true, data: { count: 0, summary: '当前草稿未发现交叉矛盾。', items: [] } })
  }

  return json({ success: true, data: [] })
}

async function editTaskProgressThroughDialog(page, rowId, progress) {
  const titleCell = page.locator(`[data-planning-cell="${rowId}:title"]`)
  await titleCell.waitFor({ state: 'visible' })
  await titleCell.hover()

  const editButton = titleCell.locator('button[aria-label="编辑名称"]').first()
  await editButton.waitFor({ state: 'attached' })
  await editButton.evaluate((button) => {
    if (button instanceof HTMLElement) button.click()
  })

  const dialog = page.getByRole('dialog').first()
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
  } catch (error) {
    const debug = await titleCell.locator('button').evaluateAll((buttons) => buttons.map((button, index) => ({
      index,
      text: button.textContent,
      ariaLabel: button.getAttribute('aria-label'),
      disabled: button instanceof HTMLButtonElement ? button.disabled : false,
      className: button.getAttribute('class'),
    })))
    throw new Error(`Task edit dialog did not open. Row action buttons: ${JSON.stringify(debug)}`)
  }
  await dialog.getByRole('button', { name: /高级选项/ }).click()

  const progressInput = dialog.locator('input[type="number"]').first()
  await progressInput.waitFor({ state: 'visible' })
  await progressInput.fill(String(progress))
  await dialog.getByRole('button', { name: /^保存$/ }).click()
  await page.getByTestId('gantt-task-draft-count').waitFor({ state: 'visible' })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()

  let previewProcess = null
  const previewAlreadyReady = await isHttpReady(baseUrl)
  if (!previewAlreadyReady) previewProcess = startPreviewServer()
  const previewReady = previewAlreadyReady || await waitForHttpOk(baseUrl, 20000)
  if (!previewReady) throw new Error(`Preview server is not reachable at ${baseUrl}`)

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const pageErrors = []

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page)

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route(`${baseUrl}/api/**`, async (route) => {
      await route.fulfill(buildMockResponse(route.request().url(), route.request().method(), route.request().postData()))
    })

    await page.goto(`${baseUrl}/#/workspace`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('workspace-normal').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-quick-metrics').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-recent-projects').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-my-projects').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-pending').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-joinable').waitFor({ state: 'visible' })
    await page.getByTestId('workspace-preview-entry').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'v14-smoke-workspace.png'), fullPage: true })

    await page.goto(`${baseUrl}/#/projects/${projectId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('dashboard-page').waitFor({ state: 'visible' })
    await page.getByText('业务健康 83分').waitFor({ state: 'visible' })
    await page.getByText('数据可靠性 91%').waitFor({ state: 'visible' })
    await page.getByTestId('dashboard-data-quality-detail-trigger').click()
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'v14-smoke-dashboard-health.png'), fullPage: true })

    const analyticsEnvelope = await page.evaluate(async () => {
      const response = await fetch('/api/notifications/analytics?projectId=422ba093-7a94-4e91-a47a-c1b865185e86&limit=20')
      return response.json()
    })
    const analytics = analyticsEnvelope.data ?? analyticsEnvelope
    assert(analytics.totalCount === 4, `Unexpected notification analytics total: ${analytics.totalCount}`)
    assert(analytics.metricValues.notification_total_count === 4, 'Missing notification_total_count metric')
    assert(analytics.metricValues.notification_dedupe_coverage_rate === 75, 'Missing notification dedupe metric')

    await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible' })
    await page.getByText(task.title).first().waitFor({ state: 'visible' })
    await page.getByTestId('planning-start-edit').click()
    await editTaskProgressThroughDialog(page, task.id, 100)
    await page.getByTestId('planning-save').waitFor({ state: 'visible' })
    const editDebug = await page.evaluate((rowId) => ({
      activeElementCell: document.activeElement?.getAttribute('data-planning-cell') ?? null,
      progressCellCount: document.querySelectorAll(`[data-planning-cell="${rowId}:progress"]`).length,
      draftCountText: document.querySelector('[data-testid="gantt-task-draft-count"]')?.textContent ?? null,
      saveDisabled: (document.querySelector('[data-testid="planning-save"]') instanceof HTMLButtonElement)
        ? document.querySelector('[data-testid="planning-save"]').disabled
        : null,
      tableTextSample: document.querySelector('[data-planning-tree-table="true"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 500) ?? null,
    }), task.id)
    assert(
      !(await page.getByTestId('planning-save').isDisabled()),
      `Planning save stayed disabled after task dialog edit: ${JSON.stringify(editDebug)}`,
    )
    const commitResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith('/api/tasks/commit') && response.request().method() === 'POST'
    ))
    await page.getByTestId('planning-save').click()
    await commitResponsePromise
    await page.screenshot({ path: join(outputDir, 'v14-smoke-gantt-completion.png'), fullPage: true })

    assert(commitPayloads.length === 1, `Expected one task commit payload, got ${commitPayloads.length}`)
    const operations = commitPayloads[0]?.operations ?? []
    const completionOperation = operations.find((operation) => operation.rowId === task.id)
    assert(completionOperation, 'Task completion operation was not submitted')
    assert(completionOperation.values?.progress === 100, `Expected progress 100, got ${completionOperation.values?.progress}`)
    assert(completionOperation.values?.status === 'completed', `Expected completed status, got ${completionOperation.values?.status}`)

    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: 'mock-api-production-build',
      baseUrl,
      workspace: {
        normalState: true,
        sections: ['quickMetrics', 'recentProjects', 'myProjects', 'pendingPanel', 'joinableSection', 'previewEntry'],
      },
      dashboard: {
        businessHealthText: '业务健康 83分',
        reliabilityText: '数据可靠性 91%',
        dataQualityDialogOpened: true,
      },
      notificationAnalytics: analytics,
      taskCompletionCommit: {
        submitted: true,
        operation: completionOperation,
      },
      screenshots: {
        workspace: join(outputDir, 'v14-smoke-workspace.png'),
        dashboard: join(outputDir, 'v14-smoke-dashboard-health.png'),
        ganttCompletion: join(outputDir, 'v14-smoke-gantt-completion.png'),
      },
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'v14-closeout-smoke.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await browser.close()
    if (previewProcess) previewProcess.kill()
  }
}

main().catch(async (error) => {
  const failure = {
    mode: 'mock-api-production-build',
    baseUrl,
    error: error instanceof Error ? error.message : String(error),
    commitPayloads,
  }
  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'v14-closeout-smoke.failure.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
  console.error(JSON.stringify(failure, null, 2))
  process.exitCode = 1
})
