import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..')
const outputDir = join(repoRoot, '.tmp', 'manual-verification')

const WEB_BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const monthKey = new Date().toISOString().slice(0, 7)
const requestedChecks = new Set(
  String(process.env.VERIFY_CHECKS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

function shouldRunCheck(name) {
  return requestedChecks.size === 0 || requestedChecks.has(name)
}

function log(step, details = '') {
  const suffix = details ? ` ${details}` : ''
  console.log(`[v2-live] ${step}${suffix}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { response, json }
}

function authHeaders(token, body) {
  return {
    Authorization: `Bearer ${token}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function apiRequest(pathname, { method = 'GET', token, body, allowFailure = false } = {}) {
  const { response, json } = await fetchJson(`${API_BASE}${pathname}`, {
    method,
    headers: token ? authHeaders(token, body) : body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!allowFailure && (!response.ok || json?.success === false)) {
    const error = new Error(
      json?.error?.message
      || json?.message
      || `API ${method} ${pathname} failed with ${response.status}`,
    )
    error.status = response.status
    error.payload = json
    error.request = { method, pathname, body }
    throw error
  }

  return { response, json }
}

async function ensureHealth() {
  const [{ response: webResponse }, { response: apiResponse }] = await Promise.all([
    fetchJson(WEB_BASE),
    fetchJson(`${API_BASE}/api/health`),
  ])
  assert(webResponse.ok, `前端服务不可达：${WEB_BASE}`)
  assert(apiResponse.ok, `后端服务不可达：${API_BASE}/api/health`)
}

function plusDays(dateText, days) {
  const date = new Date(dateText)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

async function registerUser(prefix) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const username = `${prefix}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, '_')
  const password = 'StrongPass123!'
  const displayName = `${prefix}-${suffix}`
  const { json } = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      display_name: displayName,
      email: `${username}@example.com`,
    },
  })
  const payload = json?.data ?? json
  assert(payload?.token, `注册用户 ${username} 未返回 token`)
  return {
    username,
    password,
    displayName,
    token: payload.token,
    user: payload.user,
  }
}

async function createProject(token, suffix) {
  const { json } = await apiRequest('/api/projects', {
    method: 'POST',
    token,
    body: {
      name: `v2-live-${suffix}`,
      description: 'v2 单页真实联调项目',
      status: '进行中',
    },
  })
  return json.data
}

async function createParticipantUnit(token, projectId, unitName, unitType = '分包') {
  const { json } = await apiRequest('/api/participant-units', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      unit_name: unitName,
      unit_type: unitType,
    },
  })
  return json.data
}

async function deleteParticipantUnit(token, unitId) {
  await apiRequest(`/api/participant-units/${unitId}`, {
    method: 'DELETE',
    token,
  })
}

async function createTask(token, projectId, input) {
  const { json } = await apiRequest('/api/tasks', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      title: input.title,
      status: input.status ?? 'in_progress',
      progress: input.progress ?? 0,
      start_date: input.startDate,
      end_date: input.endDate,
      planned_start_date: input.startDate,
      planned_end_date: input.endDate,
      participant_unit_id: input.participantUnitId ?? null,
      responsible_unit: input.responsibleUnit ?? input.assigneeUnit ?? null,
      assignee_name: input.assigneeName ?? null,
      assignee_unit: input.assigneeUnit ?? null,
      specialty_type: input.specialtyType ?? null,
      phase_id: input.phaseId ?? projectId,
      is_milestone: input.isMilestone ?? false,
      milestone_level: input.milestoneLevel ?? null,
    },
  })
  return json.data
}

async function createMaterial(token, projectId, input) {
  const { json } = await apiRequest(`/api/projects/${projectId}/materials`, {
    method: 'POST',
    token,
    body: {
      participant_unit_id: input.participantUnitId ?? null,
      material_name: input.materialName,
      specialty_type: input.specialtyType ?? null,
      requires_sample_confirmation: input.requiresSampleConfirmation ?? false,
      sample_confirmed: input.sampleConfirmed ?? false,
      expected_arrival_date: input.expectedArrivalDate,
      actual_arrival_date: input.actualArrivalDate ?? null,
      requires_inspection: input.requiresInspection ?? false,
      inspection_done: input.inspectionDone ?? false,
    },
  })
  return json.data
}

async function getTask(token, taskId) {
  const { json } = await apiRequest(`/api/tasks/${taskId}`, { token })
  return json.data
}

async function updateTask(token, taskId, patch) {
  const current = await getTask(token, taskId)
  const { json } = await apiRequest(`/api/tasks/${taskId}`, {
    method: 'PUT',
    token,
    body: {
      ...patch,
      version: current.version,
    },
  })
  return json.data
}

async function createObstacle(token, projectId, taskId, title, obstacleType = '设计') {
  const { json } = await apiRequest('/api/task-obstacles', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      task_id: taskId,
      title,
      severity: '中',
      obstacle_type: obstacleType,
    },
  })
  return json.data
}

async function createBaseline(token, projectId, title, tasks) {
  const { json } = await apiRequest('/api/task-baselines', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      title,
      items: tasks.map((task, index) => ({
        source_task_id: task.id,
        title: task.title,
        planned_start_date: task.planned_start_date,
        planned_end_date: task.planned_end_date,
        sort_order: index,
        mapping_status: 'mapped',
      })),
    },
  })
  return json.data
}

async function confirmBaseline(token, baselineId, version) {
  const { json } = await apiRequest(`/api/task-baselines/${baselineId}/confirm`, {
    method: 'POST',
    token,
    body: { version },
  })
  return json.data
}

async function createMonthlyPlan(token, projectId, month) {
  const { json } = await apiRequest('/api/monthly-plans', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      month,
      title: `${month} 月度计划`,
    },
  })
  return json.data
}

async function confirmMonthlyPlan(token, planId, version, month) {
  const { json } = await apiRequest(`/api/monthly-plans/${planId}/confirm`, {
    method: 'POST',
    token,
    body: { version, month },
  })
  return json.data
}

async function createDrawingPackage(token, projectId, suffix) {
  const { json } = await apiRequest('/api/construction-drawings/packages', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      package_name: `联调主体结构包-${suffix}`,
      package_code: `JG-${suffix.slice(-4)}`,
      discipline_type: 'structure',
      document_purpose: '施工执行',
    },
  })
  return json.data
}

async function createAcceptancePlan(token, projectId, taskId, suffix) {
  const { json } = await apiRequest('/api/acceptance-plans', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      task_id: taskId,
      name: `联调专项验收-${suffix}`,
      acceptance_type: '其他',
      planned_date: plusDays(new Date().toISOString().slice(0, 10), 15),
      status: 'draft',
      scope_level: 'specialty',
      type_name: '专项验收',
      phase: '施工验收',
    },
  })
  return json.data
}

async function createInvitation(token, projectId, permissionLevel = 'viewer') {
  const { json } = await apiRequest('/api/invitations', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      permission_level: permissionLevel,
      max_uses: 1,
    },
  })
  return json.data
}

async function executeJob(token, jobName) {
  const { json } = await apiRequest(`/api/jobs/${jobName}/execute`, {
    method: 'POST',
    token,
  })
  return json.data ?? json
}

async function deleteProject(token, projectId) {
  await apiRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    token,
    allowFailure: true,
  })
}

async function saveScreenshot(page, name) {
  const filePath = join(outputDir, name)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

function attachDiagnostics(page) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedResponses: [],
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message)
  })

  page.on('response', async (response) => {
    const url = response.url()
    if (!url.includes('/api/')) return
    if (response.status() < 400) return
    diagnostics.failedResponses.push(`${response.status()} ${response.request().method()} ${url}`)
  })

  return diagnostics
}

async function settlePage(page, timeoutMs = 15000) {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs })
  } catch {
    await wait(1200)
  }
}

function assertDiagnostics(name, diagnostics) {
  assert(diagnostics.consoleErrors.length === 0, `${name} 控制台报错: ${diagnostics.consoleErrors.join(' | ')}`)
  assert(diagnostics.pageErrors.length === 0, `${name} 页面异常: ${diagnostics.pageErrors.join(' | ')}`)
  assert(diagnostics.failedResponses.length === 0, `${name} 接口失败: ${diagnostics.failedResponses.join(' | ')}`)
}

async function closeBlockingDialogs(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dialogs = page.locator('[role="dialog"]')
    const count = await dialogs.count()
    let visibleDialog = null
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = dialogs.nth(index)
      if (await candidate.isVisible().catch(() => false)) {
        visibleDialog = candidate
        break
      }
    }

    if (!visibleDialog) return

    let dismissed = false
    const ariaCloseButton = visibleDialog.locator('button[aria-label*="关闭"]').first()
    if ((await ariaCloseButton.count()) > 0) {
      await ariaCloseButton.evaluate((element) => element.click())
      dismissed = true
    }

    if (!dismissed) {
      const actionButton = visibleDialog.getByRole('button', {
        name: /关闭|取消|返回首页|返回|知道了|稍后处理/,
      }).first()
      if ((await actionButton.count()) > 0) {
        await actionButton.evaluate((element) => element.click())
        dismissed = true
      }
    }

    if (!dismissed) {
      await page.keyboard.press('Escape').catch(() => {})
    }

    await wait(400)
  }
}

async function openObstacleDialog(page, taskId) {
  await closeBlockingDialogs(page)
  const row = page.locator(`#gantt-task-row-${taskId}`)
  await row.waitFor({ timeout: 30000 })
  await row.scrollIntoViewIfNeeded()
  await row.click({ button: 'right' })
  await page.getByRole('button', { name: '进行中阻碍' }).click()
  const dialog = page.locator('[role="dialog"]').filter({ hasText: '阻碍记录' }).first()
  await dialog.waitFor({ timeout: 15000 })
  return dialog
}

async function runCheck(context, name, fn) {
  const page = await context.newPage()
  const diagnostics = attachDiagnostics(page)
  try {
    const data = await fn(page, diagnostics)
    assertDiagnostics(name, diagnostics)
    return {
      name,
      ok: true,
      ...data,
      consoleErrors: diagnostics.consoleErrors,
      pageErrors: diagnostics.pageErrors,
      failedResponses: diagnostics.failedResponses,
    }
  } catch (error) {
    const screenshot = await saveScreenshot(page, `${name}-failure.png`).catch(() => null)
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      screenshot,
      consoleErrors: diagnostics.consoleErrors,
      pageErrors: diagnostics.pageErrors,
      failedResponses: diagnostics.failedResponses,
    }
  } finally {
    await page.close()
  }
}

async function main() {
  await ensureDir(outputDir)
  await ensureHealth()

  const suffix = `${Date.now()}`
  const owner = await registerUser('v2owner')
  const invitee = await registerUser('v2viewer')

  const project = await createProject(owner.token, suffix)
  log('project created', project.id)
  const generalUnit = await createParticipantUnit(owner.token, project.id, '总包单位', '总包')
  const materialUnit = await createParticipantUnit(owner.token, project.id, '机电分包')
  const retiredUnit = await createParticipantUnit(owner.token, project.id, `联调电梯分包-${suffix}`)

  const taskFoundation = await createTask(owner.token, project.id, {
    title: `联调主体结构任务-${suffix}`,
    startDate: plusDays('2026-04-20', 0),
    endDate: plusDays('2026-05-05', 0),
    progress: 35,
    assigneeName: '张工',
    assigneeUnit: generalUnit.unit_name,
    participantUnitId: generalUnit.id,
    specialtyType: 'structure',
  })
  const taskMep = await createTask(owner.token, project.id, {
    title: `联调机电任务-${suffix}`,
    startDate: plusDays('2026-04-22', 0),
    endDate: plusDays('2026-05-10', 0),
    progress: 20,
    assigneeName: '李工',
    assigneeUnit: materialUnit.unit_name,
    participantUnitId: materialUnit.id,
    specialtyType: 'mep',
  })
  const milestone = await createTask(owner.token, project.id, {
    title: `联调封顶里程碑-${suffix}`,
    startDate: plusDays('2026-05-15', 0),
    endDate: plusDays('2026-05-15', 0),
    progress: 0,
    assigneeName: '赵工',
    assigneeUnit: generalUnit.unit_name,
    participantUnitId: generalUnit.id,
    specialtyType: 'structure',
    isMilestone: true,
    milestoneLevel: 1,
  })
  const taskMaterial = await createTask(owner.token, project.id, {
    title: `联调幕墙任务-${suffix}`,
    startDate: plusDays('2026-04-24', 0),
    endDate: plusDays('2026-04-30', 0),
    progress: 15,
    assigneeName: '王工',
    assigneeUnit: materialUnit.unit_name,
    participantUnitId: materialUnit.id,
    specialtyType: 'curtain',
  })

  const baselineDraft = await createBaseline(owner.token, project.id, '联调基线 V1', [taskFoundation, taskMep, taskMaterial, milestone])
  const baseline = await confirmBaseline(owner.token, baselineDraft.id, baselineDraft.version)
  const monthlyDraft = await createMonthlyPlan(owner.token, project.id, monthKey)
  const monthly = await confirmMonthlyPlan(owner.token, monthlyDraft.id, monthlyDraft.version, monthlyDraft.month)
  const drawingPackage = await createDrawingPackage(owner.token, project.id, suffix)
  const acceptancePlan = await createAcceptancePlan(owner.token, project.id, taskFoundation.id, suffix)
  await createObstacle(owner.token, project.id, taskFoundation.id, `联调设计阻碍-${suffix}`, '设计')
  await createObstacle(owner.token, project.id, taskMep.id, `联调材料阻碍-${suffix}`, '材料')
  await updateTask(owner.token, taskFoundation.id, {
    progress: 10,
    planned_start_date: plusDays('2026-04-01', 0),
    planned_end_date: plusDays('2026-04-10', 0),
    start_date: plusDays('2026-04-01', 0),
    end_date: plusDays('2026-04-10', 0),
    specialty_type: 'structure',
  })
  const materialOnTime = await createMaterial(owner.token, project.id, {
    participantUnitId: materialUnit.id,
    materialName: `联调铝型材-${suffix}`,
    specialtyType: '幕墙',
    requiresSampleConfirmation: true,
    sampleConfirmed: true,
    expectedArrivalDate: plusDays('2026-04-22', 0),
    actualArrivalDate: plusDays('2026-04-21', 0),
    requiresInspection: true,
    inspectionDone: true,
  })
  const materialUpcoming = await createMaterial(owner.token, project.id, {
    participantUnitId: materialUnit.id,
    materialName: `联调结构胶-${suffix}`,
    specialtyType: '幕墙',
    expectedArrivalDate: plusDays('2026-04-21', 0),
  })
  const materialRetiredUnit = await createMaterial(owner.token, project.id, {
    participantUnitId: retiredUnit.id,
    materialName: `联调电梯导轨-${suffix}`,
    specialtyType: '电梯',
    expectedArrivalDate: plusDays('2026-04-23', 0),
  })
  await deleteParticipantUnit(owner.token, retiredUnit.id)

  const invitation = await createInvitation(owner.token, project.id, 'viewer')
  const shouldRunMaterialReminderJob = shouldRunCheck('materials-reminder-job') || shouldRunCheck('notifications')
  const materialReminderRun = shouldRunMaterialReminderJob
    ? await executeJob(owner.token, 'materialArrivalReminderJob')
    : null

  const browser = await chromium.launch({ headless: true })
  const ownerContext = await browser.newContext({ viewport: { width: 1520, height: 960 } })
  await ownerContext.addInitScript((authToken) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
  }, owner.token)

  const inviteeContext = await browser.newContext({ viewport: { width: 1520, height: 960 } })
  await inviteeContext.addInitScript((authToken) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
  }, invitee.token)

  const summary = {
    projectId: project.id,
    baselineId: baseline.id,
    monthlyPlanId: monthly.id,
    invitationCode: invitation.invitationCode,
    checks: [],
    screenshots: [],
    materials: {
      participantUnitId: materialUnit.id,
      participantUnitName: materialUnit.unit_name,
      createdMaterialIds: [materialOnTime.id, materialUpcoming.id, materialRetiredUnit.id],
      reminderRun: materialReminderRun?.result ?? materialReminderRun,
    },
  }

  const pushCheck = async (context, name, fn) => {
    if (!shouldRunCheck(name)) {
      return
    }
    summary.checks.push(await runCheck(context, name, fn))
  }

  try {
    if (shouldRunCheck('materials-reminder-job')) {
      const reminderNotificationCount = Number(materialReminderRun?.result?.notifications ?? 0)
      summary.checks.push({
        name: 'materials-reminder-job',
        ok: reminderNotificationCount > 0,
        notifications: reminderNotificationCount,
        reminderCount: Number(materialReminderRun?.result?.reminderCount ?? 0),
        overdueCount: Number(materialReminderRun?.result?.overdueCount ?? 0),
      })
      assert(reminderNotificationCount > 0, '材料到场提醒任务未生成通知')
    }

    await pushCheck(ownerContext, 'company-cockpit', async (page) => {
      await page.goto(`${WEB_BASE}/#/company`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('company-cockpit-page').waitFor({ state: 'visible', timeout: 20000 })
      const accessDenied = page.getByTestId('company-cockpit-access-denied')
      const projectCard = page.getByText(project.name).first()
      const isDenied = await accessDenied.isVisible().catch(() => false)
      if (!isDenied) {
        await projectCard.waitFor({ state: 'visible', timeout: 20000 })
      }
      const screenshot = await saveScreenshot(page, 'v2-live-company-cockpit.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot, accessMode: isDenied ? 'access-denied' : 'company-admin' }
    })

    await pushCheck(ownerContext, 'monitoring', async (page) => {
      await page.goto(`${WEB_BASE}/#/monitoring`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('monitoring-dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('monitoring-dashboard-stats').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('monitoring-tabpanel-api').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('monitoring-tab-performance').click()
      await page
        .locator('[data-testid="monitoring-tabpanel-performance"], [data-testid="monitoring-tabpanel-performance-empty"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
      await page.getByTestId('monitoring-tab-errors').click()
      await page
        .locator('[data-testid="monitoring-tabpanel-errors"], [data-testid="monitoring-tabpanel-errors-empty"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
      const screenshot = await saveScreenshot(page, 'v2-live-monitoring.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'dashboard', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('dashboard-weekly-digest').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('dashboard-critical-path-summary').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-dashboard.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'notifications', async (page) => {
      await page.goto(`${WEB_BASE}/#/notifications?projectId=${project.id}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('notifications-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('notifications-summary-total').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(/材料到场提醒|材料逾期未到/).first().waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-notifications.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'gantt-list-and-links', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/gantt?view=list&highlight=${taskFoundation.id}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
      const foundationRow = page.locator(`#gantt-task-row-${taskFoundation.id}`)
      await foundationRow.waitFor({ state: 'visible', timeout: 20000 })
      const delayedChip = page.getByText(/延期\d+天/).first()
      const overdueCard = page.getByText(/延期任务|逾期任务/).first()
      const delayedChipVisible = await delayedChip.isVisible().catch(() => false)
      if (!delayedChipVisible) {
        await overdueCard.waitFor({ state: 'visible', timeout: 20000 })
      }
      await foundationRow.waitFor({ state: 'visible', timeout: 20000 })
      if (false) {
      await page.getByText('主体结构').first().waitFor({ state: 'visible', timeout: 20000 })
      }
      const obstacleDialog = await openObstacleDialog(page, taskFoundation.id)
      const drawingsLink = obstacleDialog.getByRole('link', { name: /查看相关图纸/ })
      await drawingsLink.waitFor({ state: 'visible', timeout: 10000 })
      const href = await drawingsLink.getAttribute('href')
      assert(href?.includes(`/projects/${project.id}/drawings?specialty=structure`), `阻碍跳转链接异常: ${href}`)
      const screenshot = await saveScreenshot(page, 'v2-live-gantt-list.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot, obstacleDrawingsHref: href }
    })

    await pushCheck(ownerContext, 'gantt-timeline-baseline', async (page) => {
      const url = `${WEB_BASE}/#/projects/${project.id}/gantt?view=timeline&compare=baseline&baselineVersionId=${baseline.id}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('gantt-timeline-view').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText('基线对比').first().waitFor({ state: 'visible', timeout: 20000 })
      await page.locator(`#gantt-task-row-${taskFoundation.id}`).waitFor({ state: 'visible', timeout: 20000 })
      await page.locator(`#gantt-task-row-${taskMep.id}`).waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-gantt-timeline-baseline.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'materials', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/materials`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('materials-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(materialOnTime.material_name).first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(materialUpcoming.material_name).first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('materials-unassigned-banner').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText('模板预填').first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText('批量录入').first().waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-materials.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'materials-deep-link', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/gantt?view=list&highlight=${taskMep.id}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
      const obstacleDialog = await openObstacleDialog(page, taskMep.id)
      const materialLink = obstacleDialog.getByRole('link', { name: /查看相关材料/ }).first()
      await materialLink.waitFor({ state: 'visible', timeout: 10000 })
      const href = await materialLink.getAttribute('href')
      assert(href?.includes(`/projects/${project.id}/materials?unit=${encodeURIComponent(materialUnit.id)}`), `材料阻碍跳转链接异常: ${href}`)
      await materialLink.click()
      await page.getByTestId('materials-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(materialOnTime.material_name).first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(materialUpcoming.material_name).first().waitFor({ state: 'visible', timeout: 20000 })
      const unassignedVisible = await page.getByTestId('materials-unassigned-banner').isVisible().catch(() => false)
      assert(!unassignedVisible, '材料跳转后仍显示无归属单位分组提示')
      assert(page.url().includes(`unit=${encodeURIComponent(materialUnit.id)}`), `材料页未保留单位筛选参数: ${page.url()}`)
      const screenshot = await saveScreenshot(page, 'v2-live-materials-deep-link.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot, materialHref: href }
    })

    await pushCheck(ownerContext, 'reports', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/reports?view=execution`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('reports-module-tabs').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('reports-current-metrics').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('analysis-entry-risk').click()
      await page.getByTestId('reports-material-arrival-summary').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(materialUnit.unit_name).first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('analysis-entry-progress_deviation').click()
      await page.getByTestId('deviation-filter-chips').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-reports.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'responsibility', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/responsibility?dimension=unit`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('responsibility-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText('总包单位').first().waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-responsibility.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'pre-milestones', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/pre-milestones`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('pre-milestones-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('pre-milestones-overview').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('pre-milestones-board').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-pre-milestones.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'drawings', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/drawings`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('drawings-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('drawing-package-board').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByText(drawingPackage.package.package_name).first().waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-drawings.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'acceptance', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/acceptance`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('acceptance-summary-panel').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('acceptance-view-list').click()
      await page.getByText(acceptancePlan.acceptance_name || acceptancePlan.name).first().waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-acceptance.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'planning-baseline', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/planning/baseline`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('baseline-info-bar').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('baseline-version-switcher').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-planning-baseline.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'planning-monthly', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/planning/monthly?month=${monthly.month}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('planning-layered-workspace').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('monthly-plan-tree-block').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-planning-monthly.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'planning-deviation', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/planning/deviation`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('planning-governance-banner').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-planning-deviation.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(inviteeContext, 'join-project', async (page) => {
      await page.goto(`${WEB_BASE}/#/join/${invitation.invitationCode}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('join-project-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('join-project-valid-state').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('join-project-accept').click()
      await page.getByTestId('join-project-joined-state').waitFor({ state: 'visible', timeout: 20000 })
      const screenshot = await saveScreenshot(page, 'v2-live-join-project.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })

    await pushCheck(ownerContext, 'team-members', async (page) => {
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/team`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('team-members-page').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('team-management-panel').waitFor({ state: 'visible', timeout: 20000 })
      const displayNameVisible = await page.getByText(invitee.displayName).first().isVisible().catch(() => false)
      if (!displayNameVisible) {
        await page.getByText(invitee.username).first().waitFor({ state: 'visible', timeout: 20000 })
      }
      const screenshot = await saveScreenshot(page, 'v2-live-team-members.png')
      summary.screenshots.push(screenshot)
      return { url: page.url(), screenshot }
    })
  } finally {
    await ownerContext.close()
    await inviteeContext.close()
    await browser.close()
    await deleteProject(owner.token, project.id).catch(() => {})
  }

  const hasFailure = summary.checks.some((check) => !check.ok)
  const outputFile = join(outputDir, 'v2-live-browser-summary.json')
  await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
  if (hasFailure) {
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  await ensureDir(outputDir).catch(() => {})
  const failureFile = join(outputDir, 'v2-live-browser-summary.failure.json')
  const payload = {
    error: error instanceof Error ? error.message : String(error),
    status: error?.status ?? null,
    request: error?.request ?? null,
    payload: error?.payload ?? null,
  }
  await writeFile(failureFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8').catch(() => {})
  console.error(JSON.stringify(payload, null, 2))
  process.exitCode = 1
})
