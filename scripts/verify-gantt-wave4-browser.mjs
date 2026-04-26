import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'artifacts', 'test-runs', '20260421-wave4')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const projectId = process.env.PROJECT_ID || '4cd542b4-1b59-4d66-a501-27dffc1b3a08'
const legacyAdvancedStorageKey = 'workbuddy_gantt_task_dialog_advanced'

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

function shiftDate(days) {
  const next = new Date()
  next.setDate(next.getDate() + days)
  next.setHours(0, 0, 0, 0)
  return next.toISOString().slice(0, 10)
}

const now = new Date().toISOString()

const initialTasks = [
  {
    id: 'task-base',
    project_id: projectId,
    title: '基础施工',
    name: '基础施工',
    status: 'in_progress',
    priority: 'high',
    progress: 60,
    start_date: shiftDate(-8),
    end_date: shiftDate(8),
    planned_start_date: shiftDate(-8),
    planned_end_date: shiftDate(8),
    baseline_start: shiftDate(-10),
    baseline_end: shiftDate(6),
    assignee_name: '张工',
    assignee: '张工',
    assignee_user_id: 'user-owner',
    assignee_unit: '总包单位',
    responsible_unit: '总包单位',
    participant_unit_name: '总包单位',
    participant_unit_id: 'unit-1',
    specialty_type: 'structure',
    dependencies: [],
    is_milestone: false,
    wbs_code: '1.1',
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-lagging-mild',
    project_id: projectId,
    title: '机电预埋',
    name: '机电预埋',
    status: 'in_progress',
    priority: 'medium',
    progress: 30,
    start_date: shiftDate(-10),
    end_date: shiftDate(10),
    planned_start_date: shiftDate(-10),
    planned_end_date: shiftDate(10),
    baseline_start: shiftDate(-10),
    baseline_end: shiftDate(9),
    assignee_name: '李工',
    assignee: '李工',
    assignee_user_id: 'user-editor',
    assignee_unit: '机电分包',
    responsible_unit: '机电分包',
    participant_unit_name: '机电分包',
    participant_unit_id: 'unit-2',
    specialty_type: 'electrical',
    dependencies: ['task-base'],
    is_milestone: false,
    wbs_code: '1.2',
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-lagging-moderate',
    project_id: projectId,
    title: '幕墙深化',
    name: '幕墙深化',
    status: 'in_progress',
    priority: 'medium',
    progress: 10,
    start_date: shiftDate(-10),
    end_date: shiftDate(6),
    planned_start_date: shiftDate(-10),
    planned_end_date: shiftDate(6),
    baseline_start: shiftDate(-8),
    baseline_end: shiftDate(4),
    assignee_name: '王工',
    assignee: '王工',
    assignee_user_id: 'user-editor',
    assignee_unit: '幕墙分包',
    responsible_unit: '幕墙分包',
    participant_unit_name: '幕墙分包',
    participant_unit_id: 'unit-3',
    specialty_type: 'facade',
    dependencies: ['task-lagging-mild'],
    is_milestone: false,
    wbs_code: '1.3',
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-lagging-severe',
    project_id: projectId,
    title: '设计协调',
    name: '设计协调',
    status: 'in_progress',
    priority: 'high',
    progress: 5,
    start_date: shiftDate(-12),
    end_date: shiftDate(2),
    planned_start_date: shiftDate(-12),
    planned_end_date: shiftDate(2),
    baseline_start: shiftDate(-10),
    baseline_end: shiftDate(1),
    assignee_name: '赵工',
    assignee: '赵工',
    assignee_user_id: 'user-editor',
    assignee_unit: '设计单位',
    responsible_unit: '设计单位',
    participant_unit_name: '设计单位',
    participant_unit_id: 'unit-4',
    specialty_type: 'structure',
    dependencies: ['task-lagging-moderate'],
    is_milestone: false,
    wbs_code: '1.4',
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-condition-warning',
    project_id: projectId,
    title: '首报进度任务',
    name: '首报进度任务',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    start_date: shiftDate(-1),
    end_date: shiftDate(12),
    planned_start_date: shiftDate(-1),
    planned_end_date: shiftDate(12),
    baseline_start: shiftDate(-1),
    baseline_end: shiftDate(10),
    assignee_name: '周工',
    assignee: '周工',
    assignee_user_id: 'user-editor',
    assignee_unit: '施工单位',
    responsible_unit: '施工单位',
    participant_unit_name: '施工单位',
    participant_unit_id: 'unit-5',
    specialty_type: 'structure',
    dependencies: [],
    is_milestone: false,
    wbs_code: '1.5',
    version: 1,
    created_at: now,
    updated_at: now,
  },
]

let tasksState = initialTasks.map((task, index) => ({
  ...task,
  sort_order: index,
}))

let taskConditionsState = [
  {
    id: 'condition-warning-1',
    task_id: 'task-condition-warning',
    project_id: projectId,
    name: '图纸审批',
    condition_name: '图纸审批',
    description: '施工图尚未确认',
    condition_type: 'drawing_ready',
    is_satisfied: false,
    status: '未满足',
    target_date: shiftDate(2),
    created_at: now,
    updated_at: now,
  },
]

const delayRequestsInitial = [
  {
    id: 'delay-approve-1',
    task_id: 'task-lagging-mild',
    project_id: projectId,
    status: 'pending',
    delay_days: 3,
    original_date: shiftDate(10),
    delayed_date: shiftDate(13),
    reason: '机电材料到货延迟',
    delay_reason: '机电材料到货延迟',
    requested_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'delay-reject-1',
    task_id: 'task-lagging-moderate',
    project_id: projectId,
    status: 'pending',
    delay_days: 2,
    original_date: shiftDate(6),
    delayed_date: shiftDate(8),
    reason: '深化图纸尚未确认',
    delay_reason: '深化图纸尚未确认',
    requested_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
]

let delayRequestsState = delayRequestsInitial.map((item) => ({ ...item }))

const project = {
  id: projectId,
  name: 'Wave4 Gantt 专项项目',
  description: 'wave4 gantt fixture',
  status: 'active',
  owner_id: 'user-owner',
  created_at: now,
  updated_at: now,
}

const baselineOptions = [
  {
    id: 'baseline-1',
    version: 1,
    title: '首版基线',
    status: 'confirmed',
  },
]

const obstacles = [
  {
    id: 'obstacle-design-1',
    task_id: 'task-lagging-severe',
    project_id: projectId,
    title: '设计图纸未确认',
    description: '设计图纸版本待确认',
    obstacle_type: '设计',
    severity: 'high',
    is_resolved: false,
    status: 'open',
    created_at: now,
    updated_at: now,
  },
]

const criticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-base', 'task-lagging-mild', 'task-lagging-moderate', 'task-lagging-severe'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-base', 'task-lagging-mild', 'task-lagging-moderate', 'task-lagging-severe'],
    totalDurationDays: 28,
    displayLabel: '主关键路径',
  },
  alternateChains: [],
  displayTaskIds: ['task-base', 'task-lagging-mild', 'task-lagging-moderate', 'task-lagging-severe'],
  edges: [
    { id: 'edge-1', fromTaskId: 'task-base', toTaskId: 'task-lagging-mild', source: 'dependency', isPrimary: true },
    { id: 'edge-2', fromTaskId: 'task-lagging-mild', toTaskId: 'task-lagging-moderate', source: 'dependency', isPrimary: true },
    { id: 'edge-3', fromTaskId: 'task-lagging-moderate', toTaskId: 'task-lagging-severe', source: 'dependency', isPrimary: true },
  ],
  tasks: initialTasks.map((task, index) => ({
    taskId: task.id,
    title: task.title,
    floatDays: index === 0 ? 0 : 1,
    durationDays: 5,
    isAutoCritical: true,
    isManualAttention: false,
    isManualInserted: false,
    chainIndex: index,
  })),
  projectDurationDays: 28,
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
    throw new Error(`Missing build artifact: ${distIndexFile}. Run "npm run build --workspace=client" first.`)
  }
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
}

function buildMockResponse(request) {
  const url = new URL(request.url())
  const { pathname, searchParams } = url
  const method = request.method()
  let body = {}
  try {
    body = request.postDataJSON() ?? {}
  } catch {
    body = {}
  }

  if (pathname === '/api/auth/me') {
    return json({
      authenticated: true,
      user: {
        id: 'user-owner',
        username: 'wave4-owner',
        display_name: '波4负责人',
        email: 'wave4-owner@example.com',
        role: 'company_admin',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [project] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: project })
  }

  if (pathname === '/api/tasks') {
    return json({
      success: true,
      data: tasksState
        .slice()
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)),
    })
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/)
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1])
    const current = tasksState.find((task) => task.id === taskId) ?? null
    if (!current) {
      return json({ success: false, error: { message: 'TASK_NOT_FOUND' } }, 404)
    }

    if (method === 'GET') {
      return json({ success: true, data: current })
    }

    if (method === 'PUT') {
      const updated = {
        ...current,
        ...body,
        updated_at: new Date().toISOString(),
        version: Number(current.version ?? 1) + 1,
      }
      tasksState = tasksState.map((task) => (task.id === taskId ? updated : task))
      return json({ success: true, data: updated })
    }

    if (method === 'DELETE') {
      tasksState = tasksState.filter((task) => task.id !== taskId)
      delayRequestsState = delayRequestsState.filter((item) => item.task_id !== taskId)
      return json({ success: true, data: { id: taskId } })
    }
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: baselineOptions })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: criticalPathSnapshot })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/refresh`) {
    return json({ success: true, data: criticalPathSnapshot })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/overrides`) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/task-obstacles') {
    const taskId = searchParams.get('taskId')
    const scopedProjectId = searchParams.get('projectId')
    if (scopedProjectId) {
      return json({ success: true, data: obstacles.filter((item) => item.project_id === scopedProjectId) })
    }
    return json({ success: true, data: taskId ? obstacles.filter((item) => item.task_id === taskId) : obstacles })
  }

  if (pathname === '/api/task-conditions') {
    const taskId = searchParams.get('taskId')
    const scopedProjectId = searchParams.get('projectId')
    const filtered = taskConditionsState.filter((item) => {
      if (taskId && item.task_id !== taskId) return false
      if (scopedProjectId && item.project_id !== scopedProjectId) return false
      return true
    })
    return json({ success: true, data: filtered })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/delay-requests') {
    if (method === 'GET') {
      const taskId = searchParams.get('taskId')
      const scopedProjectId = searchParams.get('projectId')
      const filtered = delayRequestsState.filter((item) => {
        if (taskId && item.task_id !== taskId) return false
        if (scopedProjectId && item.project_id !== scopedProjectId) return false
        return true
      })
      return json({ success: true, data: filtered })
    }

    if (method === 'POST') {
      const next = {
        id: `delay-${Date.now()}`,
        status: 'pending',
        requested_at: new Date().toISOString(),
        ...body,
      }
      delayRequestsState = [next, ...delayRequestsState]
      return json({ success: true, data: next }, 201)
    }
  }

  const delayReviewMatch = pathname.match(/^\/api\/delay-requests\/([^/]+)\/(approve|reject|withdraw)$/)
  if (delayReviewMatch && method === 'POST') {
    const [, requestId, action] = delayReviewMatch
    const current = delayRequestsState.find((item) => item.id === requestId)
    if (!current) {
      return json({ success: false, error: { message: 'DELAY_REQUEST_NOT_FOUND' } }, 404)
    }
    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'withdrawn'
    const updated = {
      ...current,
      status: nextStatus,
      reviewed_at: new Date().toISOString(),
    }
    delayRequestsState = delayRequestsState.map((item) => (item.id === requestId ? updated : item))
    if (action === 'approve') {
      tasksState = tasksState.map((task) => (
        task.id === current.task_id
          ? {
              ...task,
              planned_end_date: current.delayed_date,
              end_date: current.delayed_date,
              updated_at: new Date().toISOString(),
              version: Number(task.version ?? 1) + 1,
            }
          : task
      ))
    }
    return json({ success: true, data: updated })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({
      success: true,
      members: [
        {
          userId: 'user-owner',
          displayName: '项目负责人',
          permissionLevel: 'owner',
        },
        {
          userId: 'user-editor',
          displayName: '项目编辑',
          permissionLevel: 'editor',
        },
      ],
    })
  }

  if (pathname === `/api/members/${projectId}/me`) {
    return json({
      success: true,
      data: {
        permissionLevel: 'owner',
        globalRole: 'company_admin',
        canEdit: true,
        canManageTeam: true,
      },
    })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()

  let previewProcess = null
  if (!(await isHttpReady(baseUrl))) {
    previewProcess = startPreviewServer()
  }

  const previewReady = await waitForHttpOk(baseUrl, 20000)
  if (!previewReady) {
    throw new Error(`Preview server is not reachable at ${baseUrl}`)
  }

  const browser = await chromium.launch({ headless: true })
  const summary = {
    baseUrl,
    projectId,
    checks: [],
    screenshots: [],
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    page.setDefaultTimeout(30000)

    await page.route(`${baseUrl}/api/**`, async (route) => {
      await route.fulfill(buildMockResponse(route.request()))
    })

    await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('gantt-task-select-task-base').waitFor({ state: 'visible', timeout: 20000 })

    await page.screenshot({ path: join(outputDir, 'wave4-gantt-list.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-list.png')

    await page.getByTestId('gantt-business-status-chip-task-lagging-mild').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-business-status-chip-task-lagging-moderate').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-business-status-chip-task-lagging-severe').waitFor({ state: 'visible' })
    summary.checks.push('lagging chips visible in list view')

    const orderBeforeDrag = await page.locator('[id^="gantt-task-row-"]').evaluateAll((nodes) => nodes.map((node) => node.id))
    assert(orderBeforeDrag[0] === 'gantt-task-row-task-base', `unexpected initial order: ${orderBeforeDrag.join(',')}`)
    const dragHandle = page.getByTestId('gantt-task-drag-handle-task-lagging-moderate')
    const dragHandleBox = await dragHandle.boundingBox()
    const targetRowBox = await page.locator('#gantt-task-row-task-base').boundingBox()
    assert(dragHandleBox, 'missing drag handle box for moderate task')
    assert(targetRowBox, 'missing target row box for base task')
    await page.mouse.move(dragHandleBox.x + dragHandleBox.width / 2, dragHandleBox.y + dragHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetRowBox.x + 60, targetRowBox.y + 16, { steps: 18 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const orderAfterDrag = await page.locator('[id^="gantt-task-row-"]').evaluateAll((nodes) => nodes.map((node) => node.id))
    assert(orderAfterDrag[0] === 'gantt-task-row-task-lagging-moderate', `drag reorder failed: ${orderAfterDrag.join(',')}`)
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-drag-sort.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-drag-sort.png')
    summary.checks.push('drag sorting reorders gantt rows')

    await page.getByTestId('gantt-task-select-task-lagging-severe').click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu').waitFor({ state: 'visible' })
    for (const testId of [
      'gantt-task-context-menu-edit',
      'gantt-task-context-menu-conditions',
      'gantt-task-context-menu-obstacles',
      'gantt-task-context-menu-add-child',
      'gantt-task-context-menu-rename',
      'gantt-task-context-menu-delete',
    ]) {
      await page.getByTestId(testId).waitFor({ state: 'visible' })
    }
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-context-menu.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-context-menu.png')
    summary.checks.push('context menu core actions visible')

    for (const testId of [
      'gantt-task-context-menu-mark-completed',
      'gantt-task-context-menu-mark-critical',
      'gantt-task-context-menu-insert-before',
      'gantt-task-context-menu-insert-after',
      'gantt-task-context-menu-remove-critical',
    ]) {
      await page.getByTestId(testId).waitFor({ state: 'visible' })
    }
    summary.checks.push('context menu advanced actions visible')

    await page.getByTestId('gantt-task-context-menu-delete').click()
    await page.getByTestId('gantt-delete-protection-dialog').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-delete-guard.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-delete-guard.png')
    await page.getByRole('button', { name: '取消' }).click()
    await page.getByTestId('gantt-delete-protection-dialog').waitFor({ state: 'detached' })
    summary.checks.push('context menu delete opens guarded delete dialog')

    await page.getByTestId('gantt-task-select-task-lagging-severe').click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-task-context-menu-add-child').click()
    await page.getByText('上级任务：设计协调').waitFor({ state: 'visible' })
    const advancedToggle = page.getByRole('button', { name: /高级选项/ })
    await advancedToggle.waitFor({ state: 'visible' })
    assert((await advancedToggle.getAttribute('aria-expanded')) === 'false', 'advanced section should default collapsed')
    await advancedToggle.click()
    assert((await advancedToggle.getAttribute('aria-expanded')) === 'true', 'advanced section should expand')
    await advancedToggle.click()
    assert((await advancedToggle.getAttribute('aria-expanded')) === 'false', 'advanced section should collapse')
    const persistedValue = await page.evaluate((key) => window.localStorage.getItem(key), legacyAdvancedStorageKey)
    assert(persistedValue === null, `advanced state should not use legacy localStorage, got ${persistedValue}`)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })

    await page.getByTestId('gantt-task-select-task-lagging-severe').click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu-add-child').click()
    await advancedToggle.waitFor({ state: 'visible' })
    assert((await advancedToggle.getAttribute('aria-expanded')) === 'false', 'advanced section should stay collapsed on the next task dialog')
    await page.keyboard.press('Escape')
    summary.checks.push('task dialog advanced options default collapsed without legacy localStorage')

    await page.getByTestId('gantt-task-select-task-lagging-severe').click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu-obstacles').click()
    const drawingsLink = page.getByRole('link', { name: /查看相关图纸/ })
    await drawingsLink.waitFor({ state: 'visible' })
    const href = await drawingsLink.getAttribute('href')
    assert(href?.includes(`/projects/${projectId}/drawings`), `unexpected drawings link href: ${href}`)
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-obstacle-dialog.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-obstacle-dialog.png')
    await page.keyboard.press('Escape')
    summary.checks.push('design obstacle dialog links to drawings page')

    const baseCheckbox = page.getByTestId('gantt-task-checkbox-task-base')
    const mildCheckbox = page.getByTestId('gantt-task-checkbox-task-lagging-mild')
    await baseCheckbox.check()
    await mildCheckbox.check()
    await page.getByTestId('batch-action-bar').waitFor({ state: 'visible' })
    await page.getByText('已选 2 项').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-multi-select.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-multi-select.png')
    await page.getByTestId('batch-action-bar-clear').click()
    assert(!(await baseCheckbox.isChecked()), 'base checkbox should clear after batch clear')
    assert(!(await mildCheckbox.isChecked()), 'mild checkbox should clear after batch clear')
    await baseCheckbox.check()
    await mildCheckbox.check()
    await page.getByTestId('batch-action-bar').waitFor({ state: 'visible' })
    summary.checks.push('multi-select batch bar count and clear action stay wired')
    await page.getByTestId('gantt-batch-delete').click()
    await page.getByText('批量删除任务').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-batch-delete-confirm.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-batch-delete-confirm.png')
    await page.getByRole('button', { name: '取消' }).click()
    await page.getByText('批量删除任务').waitFor({ state: 'detached' })
    await page.getByTestId('batch-action-bar-clear').click()
    await page.getByText('已选 2 项').waitFor({ state: 'hidden' })
    summary.checks.push('batch delete opens the shared confirm dialog')

    const conditionWarningRow = page.locator('#gantt-task-row-task-condition-warning')
    await conditionWarningRow.waitFor({ state: 'visible' })
    await conditionWarningRow.scrollIntoViewIfNeeded()
    await page.getByTestId('gantt-task-select-task-condition-warning').click()
    const progressPanel = page.getByTestId('gantt-progress-entry-panel')
    await progressPanel.waitFor({ state: 'visible' })
    await progressPanel.getByLabel('录进展数值').fill('20')
    await progressPanel.getByTestId('gantt-progress-save').click()
    const conditionWarningModal = page.getByTestId('condition-warning-modal')
    await conditionWarningModal.waitFor({ state: 'visible' })
    await conditionWarningModal.getByText('首报进度任务').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-condition-warning.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-condition-warning.png')
    await page.getByRole('button', { name: '稍后处理' }).click()
    await page.getByTestId('condition-warning-modal').waitFor({ state: 'detached' })
    summary.checks.push('first progress advance opens condition warning modal for unmet conditions')

    await page.getByTestId('gantt-task-select-task-lagging-mild').click()
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-delay-request-approve').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-delay-request-approve').click()
    await page.getByTestId('gantt-delay-request-approve').waitFor({ state: 'detached' })

    await page.getByTestId('gantt-task-select-task-lagging-moderate').click()
    await page.getByTestId('gantt-delay-request-reject').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-delay-request-reject').click()
    await page.getByText('最近一次已驳回').waitFor({ state: 'visible' })
    summary.checks.push('task detail panel approve/reject delay review actions stay wired')

    await page.getByTestId('gantt-switch-timeline-view').click()
    await page.getByTestId('gantt-timeline-view').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-timeline-scale-day').click()
    await page.getByTestId('gantt-timeline-scale-month').click()
    await page.getByTestId('gantt-timeline-compare-baseline').click()
    await page.getByTestId('gantt-timeline-baseline-select').waitFor({ state: 'visible' })
    const dependencyPathCount = await page.locator('[data-testid="gantt-timeline-view"] svg path').count()
    assert(dependencyPathCount >= 2, `expected dependency paths in timeline, got ${dependencyPathCount}`)
    await page.screenshot({ path: join(outputDir, 'wave4-gantt-timeline.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-timeline.png')
    summary.checks.push('timeline scale/compare controls and dependency rendering available')

    const mobilePage = await browser.newPage({ viewport: { width: 900, height: 1200 } })
    mobilePage.setDefaultTimeout(30000)
    await mobilePage.route(`${baseUrl}/api/**`, async (route) => {
      await route.fulfill(buildMockResponse(route.request()))
    })
    await mobilePage.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    await mobilePage.getByTestId('gantt-task-select-task-base').waitFor({ state: 'visible', timeout: 20000 })
    await mobilePage.getByTestId('gantt-switch-timeline-view').click()
    await mobilePage.getByTestId('gantt-timeline-mobile-fallback').waitFor({ state: 'visible' })
    await mobilePage.screenshot({ path: join(outputDir, 'wave4-gantt-mobile-fallback.png'), fullPage: true })
    summary.screenshots.push('wave4-gantt-mobile-fallback.png')
    summary.checks.push('mobile timeline fallback visible under 1024px')
    await mobilePage.close()

    await writeFile(join(outputDir, 'wave4-gantt-summary.json'), JSON.stringify(summary, null, 2))
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill('SIGTERM')
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
