import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = join(dirname(__filename), '..')
const outputDir = join(repoRoot, 'artifacts', 'test-runs', '20260426-v11-chapter6-7')
const manualDir = join(repoRoot, '.tmp', 'manual-verification')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv(join(repoRoot, 'server', '.env'))

const WEB_BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const ACCOUNTS = {
  owner: {
    username: 'v11_chapter67_owner',
    password: 'StrongPass123!',
    displayName: 'v1.1 第6/7章负责人',
    email: 'v11_chapter67_owner@example.com',
    globalRole: 'regular',
  },
  viewer: {
    username: 'v11_chapter67_viewer',
    password: 'StrongPass123!',
    displayName: 'v1.1 第6/7章只读成员',
    email: 'v11_chapter67_viewer@example.com',
    globalRole: 'regular',
  },
}

const PROJECT_NAME = 'V11-CH6-7-LARGE-20260426'
const MONTHLY_MONTH = '2026-12'

function nowIso() {
  return new Date().toISOString()
}

function describeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack }
  }
  try {
    return { message: JSON.stringify(error), stack: null }
  } catch {
    return { message: String(error), stack: null }
  }
}

function log(step, details = '') {
  const suffix = details ? ` ${details}` : ''
  console.log(`[v11-ch6-7] ${step}${suffix}`)
}

function rel(path) {
  return relative(repoRoot, path).replace(/\\/g, '/')
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
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
  return { response, json, text }
}

function authHeaders(token, body = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }
}

function unwrap(json) {
  if (!json) return null
  if (json.success === false) {
    throw new Error(json.error?.message || json.message || 'API request failed')
  }
  return json.data ?? json
}

async function apiRequest(pathname, { method = 'GET', token, body, allowFailure = false, timeoutMs = 15000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { response, json, text } = await fetchJson(`${API_BASE}${pathname}`, {
      method,
      headers: token ? authHeaders(token, Boolean(body)) : body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!allowFailure && (!response.ok || json?.success === false)) {
      throw new Error(json?.error?.message || json?.message || text || `API ${method} ${pathname} failed: ${response.status}`)
    }
    return { response, json, data: response.ok ? unwrap(json) : null }
  } finally {
    clearTimeout(timer)
  }
}

async function login(account) {
  const { response, data } = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
    allowFailure: true,
  })
  if (response.ok && data?.token && data?.user) return { token: data.token, user: data.user }
  return null
}

async function register(account) {
  const { data } = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username: account.username,
      password: account.password,
      display_name: account.displayName,
      email: account.email,
    },
  })
  return { token: data.token, user: data.user }
}

async function ensureAccount(account) {
  const existing = await login(account)
  const session = existing || await register(account)
  if (!session?.token || !session?.user?.id) throw new Error(`Failed to prepare account ${account.username}`)
  const { error } = await supabase.from('users').update({ global_role: account.globalRole }).eq('id', session.user.id)
  if (error) throw error
  return session
}

async function ensureProject(ownerSession) {
  const existing = await supabase
    .from('projects')
    .select('id, name, owner_id, version')
    .eq('name', PROJECT_NAME)
    .limit(1)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) {
    if (existing.data.owner_id !== ownerSession.user.id) {
      const { error } = await supabase.from('projects').update({ owner_id: ownerSession.user.id }).eq('id', existing.data.id)
      if (error) throw error
    }
    return { ...existing.data, owner_id: ownerSession.user.id }
  }

  const { data } = await apiRequest('/api/projects', {
    method: 'POST',
    token: ownerSession.token,
    body: {
      name: PROJECT_NAME,
      description: 'v1.1 第6章性能稳定性 + 第7章上线前检查专用样本',
      status: '进行中',
    },
  })
  return data
}

async function ensureProjectMember(projectId, session, permissionLevel) {
  const existing = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data?.id) {
    const { error } = await supabase
      .from('project_members')
      .update({ permission_level: permissionLevel, is_active: true })
      .eq('id', existing.data.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('project_members').insert({
    id: randomUUID(),
    project_id: projectId,
    user_id: session.user.id,
    permission_level: permissionLevel,
    is_active: true,
  })
  if (error) throw error
}

async function countRows(table, projectId, extra = {}) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  for (const [key, value] of Object.entries(extra)) {
    query = query.eq(key, value)
  }
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function fetchTaskIds(projectId, limit = 500) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

async function ensureTasks(projectId, ownerId) {
  const currentCount = await countRows('tasks', projectId)
  if (currentCount >= 1200) return currentCount

  const rows = []
  for (let index = currentCount; index < 1200; index += 1) {
    const day = (index % 28) + 1
    const completed = index % 23 === 0
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      title: `CH6 大数据任务 ${String(index + 1).padStart(4, '0')}`,
      description: 'v1.1 第6章大数据量性能样本',
      status: completed ? 'completed' : index % 5 === 0 ? 'in_progress' : 'todo',
      priority: index % 11 === 0 ? 'high' : 'medium',
      progress: completed ? 100 : index % 5 === 0 ? 45 : 0,
      start_date: `2026-04-${String(day).padStart(2, '0')}`,
      end_date: `2026-07-${String(day).padStart(2, '0')}`,
      planned_start_date: `2026-04-${String(day).padStart(2, '0')}`,
      planned_end_date: `2026-07-${String(day).padStart(2, '0')}`,
      assignee_name: ['CH6 负责人A', 'CH6 负责人B', 'CH6 负责人C'][index % 3],
      assignee_unit: ['总包', '机电分包', '幕墙分包'][index % 3],
      specialty_type: ['土建', '机电', '装饰', '幕墙'][index % 4],
      created_by: ownerId,
      sort_order: index + 1,
      wbs_level: (index % 5) + 1,
      wbs_code: `CH6-${(index % 5) + 1}-${index + 1}`,
      is_milestone: false,
      is_critical: index % 20 === 0,
    })
  }

  while (rows.length) {
    const batch = rows.splice(0, 200)
    const { error } = await supabase.from('tasks').insert(batch)
    if (error) throw error
  }
  return 1200
}

async function ensureMonthlyPlanItems(projectId, taskIds) {
  const existingPlan = await supabase
    .from('monthly_plans')
    .select('id, month, version, title')
    .eq('project_id', projectId)
    .eq('month', MONTHLY_MONTH)
    .eq('version', 1)
    .limit(1)
    .maybeSingle()
  if (existingPlan.error) throw existingPlan.error

  let plan = existingPlan.data
  if (!plan) {
    const { data, error } = await supabase
      .from('monthly_plans')
      .insert({
        id: randomUUID(),
        project_id: projectId,
        month: MONTHLY_MONTH,
        version: 1,
        status: 'draft',
        title: `${MONTHLY_MONTH} 第6章500+月计划条目`,
        description: 'v1.1 第6章大数据量月度计划样本',
      })
      .select('id, month, version, title')
      .single()
    if (error) throw error
    plan = data
  }

  const currentItems = await supabase
    .from('monthly_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('monthly_plan_version_id', plan.id)
  if (currentItems.error) throw currentItems.error
  const currentCount = currentItems.count ?? 0
  if (currentCount >= 500) return { plan, count: currentCount }

  const rows = []
  for (let index = currentCount; index < 520; index += 1) {
    const task = taskIds[index % taskIds.length]
    const day = (index % 28) + 1
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      monthly_plan_version_id: plan.id,
      source_task_id: task?.id ?? null,
      title: `CH6 月计划条目 ${String(index + 1).padStart(3, '0')}`,
      planned_start_date: `2026-12-${String(day).padStart(2, '0')}`,
      planned_end_date: `2026-12-${String(Math.min(day + 1, 28)).padStart(2, '0')}`,
      target_progress: 80,
      current_progress: index % 3 === 0 ? 20 : 0,
      sort_order: index + 1,
      is_milestone: index % 25 === 0,
      is_critical: index % 20 === 0,
      commitment_status: index % 7 === 0 ? 'carried_over' : 'planned',
      notes: 'v1.1 第6章500+月计划条目样本',
    })
  }
  while (rows.length) {
    const batch = rows.splice(0, 200)
    const { error } = await supabase.from('monthly_plan_items').insert(batch)
    if (error) throw error
  }
  return { plan, count: 520 }
}

async function ensureMilestones(projectId) {
  const currentCount = await countRows('milestones', projectId)
  if (currentCount >= 100) return currentCount
  const rows = []
  for (let index = currentCount; index < 120; index += 1) {
    const day = (index % 28) + 1
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      title: `CH6 里程碑 ${String(index + 1).padStart(3, '0')}`,
      description: 'v1.1 第6章100+里程碑样本',
      target_date: `2026-08-${String(day).padStart(2, '0')}`,
      status: index % 6 === 0 ? 'completed' : 'pending',
      baseline_date: `2026-08-${String(day).padStart(2, '0')}`,
      current_plan_date: `2026-08-${String(Math.min(day + (index % 4), 28)).padStart(2, '0')}`,
      actual_date: index % 6 === 0 ? `2026-08-${String(day).padStart(2, '0')}` : null,
    })
  }
  while (rows.length) {
    const batch = rows.splice(0, 100)
    const { error } = await supabase.from('milestones').insert(batch)
    if (error) throw error
  }
  return 120
}

async function ensureRisks(projectId, taskIds) {
  const currentCount = await countRows('risks', projectId)
  if (currentCount >= 100) return currentCount
  const rows = []
  for (let index = currentCount; index < 120; index += 1) {
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      task_id: taskIds[index % taskIds.length]?.id ?? null,
      title: `CH6 风险 ${String(index + 1).padStart(3, '0')}`,
      description: 'v1.1 第6章100+风险样本',
      level: index % 10 === 0 ? 'critical' : index % 3 === 0 ? 'high' : 'medium',
      status: index % 5 === 0 ? 'monitoring' : 'identified',
      probability: 40 + (index % 5) * 10,
      impact: 45 + (index % 4) * 10,
      risk_category: 'progress',
      mitigation: '第6章性能样本持续跟踪',
    })
  }
  while (rows.length) {
    const batch = rows.splice(0, 100)
    const { error } = await supabase.from('risks').insert(batch)
    if (error) throw error
  }
  return 120
}

async function ensureIssues(projectId, taskIds) {
  const currentCount = await countRows('issues', projectId)
  if (currentCount >= 100) return currentCount
  const rows = []
  for (let index = currentCount; index < 120; index += 1) {
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      task_id: taskIds[index % taskIds.length]?.id ?? null,
      title: `CH6 问题 ${String(index + 1).padStart(3, '0')}`,
      description: 'v1.1 第6章100+问题样本',
      source_type: 'manual',
      severity: index % 9 === 0 ? 'critical' : index % 3 === 0 ? 'high' : 'medium',
      priority: 50 + (index % 5),
      status: index % 7 === 0 ? 'investigating' : 'open',
    })
  }
  while (rows.length) {
    const batch = rows.splice(0, 100)
    const { error } = await supabase.from('issues').insert(batch)
    if (error) throw error
  }
  return 120
}

async function ensureObstacles(projectId, taskIds, ownerId) {
  const currentCount = await countRows('task_obstacles', projectId)
  if (currentCount >= 100) return currentCount
  const rows = []
  for (let index = currentCount; index < 120; index += 1) {
    const task = taskIds[index % taskIds.length]
    rows.push({
      id: randomUUID(),
      project_id: projectId,
      task_id: task?.id,
      obstacle_type: ['材料', '人员', '设备', '手续'][index % 4],
      description: `CH6 阻碍 ${String(index + 1).padStart(3, '0')}`,
      severity: index % 9 === 0 ? '高' : '中',
      status: index % 5 === 0 ? '处理中' : '待处理',
      estimated_resolve_date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
      notes: 'v1.1 第6章100+阻碍样本',
      created_by: ownerId,
    })
  }
  while (rows.length) {
    const batch = rows.splice(0, 100)
    const { error } = await supabase.from('task_obstacles').insert(batch)
    if (error) throw error
  }
  return 120
}

async function ensureChapter6Data(projectId, ownerId) {
  const taskCount = await ensureTasks(projectId, ownerId)
  const tasks = await fetchTaskIds(projectId, 600)
  const monthly = await ensureMonthlyPlanItems(projectId, tasks)
  const milestoneCount = await ensureMilestones(projectId)
  const riskCount = await ensureRisks(projectId, tasks)
  const issueCount = await ensureIssues(projectId, tasks)
  const obstacleCount = await ensureObstacles(projectId, tasks, ownerId)

  return {
    taskCount,
    monthlyPlanItemCount: monthly.count,
    monthlyPlan: monthly.plan,
    milestoneCount,
    riskCount,
    issueCount,
    obstacleCount,
  }
}

async function screenshot(page, name) {
  const path = join(manualDir, name)
  await page.screenshot({ path, fullPage: true })
  return rel(path)
}

function attachDiagnostics(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [], failedResponses: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.url().includes('/api/') && !response.ok()) {
      diagnostics.failedResponses.push({ url: response.url(), status: response.status() })
    }
  })
  return diagnostics
}

async function authedContext(browser, token, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN', colorScheme: 'light' })
  await context.addInitScript((authToken) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
  }, token)
  return context
}

async function timedPageOpen(page, url, selector, timeout = 30000) {
  const startedAt = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(selector, { state: 'visible', timeout })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  return Date.now() - startedAt
}

function pass(payload) {
  return { pass: true, ...payload }
}

function fail(payload) {
  return { pass: false, ...payload }
}

async function runBrowserChecks(summary, sessions, project, data) {
  const browser = await chromium.launch({ headless: true })
  try {
    const checks = {}

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      const ms = await timedPageOpen(page, `${WEB_BASE}/#/projects/${project.id}/dashboard`, '[data-testid="dashboard-page"]')
      checks.dashboardInteractive5s = (ms <= 5000 && diagnostics.pageErrors.length === 0)
        ? pass({ ms, diagnostics, screenshot: await screenshot(page, 'v11-ch6-dashboard-5s.png') })
        : fail({ ms, diagnostics, screenshot: await screenshot(page, 'v11-ch6-dashboard-5s.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      const ms = await timedPageOpen(page, `${WEB_BASE}/#/projects/${project.id}/gantt?view=list`, '[data-testid="gantt-task-rows"]', 60000)
      const startedAt = Date.now()
      await page.mouse.wheel(0, 2400)
      await page.waitForTimeout(250)
      await page.mouse.wheel(0, -1200)
      const visibleRows = await page.locator('[id^="gantt-task-row-"]').count()
      const responsiveMs = Date.now() - startedAt
      checks.ganttScrollLarge = (ms <= 5000 && responsiveMs <= 1500 && visibleRows > 0 && diagnostics.pageErrors.length === 0)
        ? pass({ ms, responsiveMs, visibleRows, diagnostics, screenshot: await screenshot(page, 'v11-ch6-gantt-large-scroll.png') })
        : fail({ ms, responsiveMs, visibleRows, diagnostics, screenshot: await screenshot(page, 'v11-ch6-gantt-large-scroll.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      const ms = await timedPageOpen(page, `${WEB_BASE}/#/projects/${project.id}/reports?view=deviation`, '[data-testid="reports-module-tabs"]', 30000)
      await page.waitForTimeout(600)
      const bodyTextLength = await page.locator('body').innerText().then((text) => text.trim().length)
      const visualCount = await page.locator('svg, canvas, [data-testid="reports-current-metrics"], [data-testid="reports-critical-path-summary"]').count()
      checks.reportsNotBlank = (bodyTextLength > 100 && visualCount > 0 && diagnostics.pageErrors.length === 0)
        ? pass({ ms, bodyTextLength, visualCount, diagnostics, screenshot: await screenshot(page, 'v11-ch6-reports-not-blank.png') })
        : fail({ ms, bodyTextLength, visualCount, diagnostics, screenshot: await screenshot(page, 'v11-ch6-reports-not-blank.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      await timedPageOpen(page, `${WEB_BASE}/#/projects/${project.id}/gantt?view=list`, '[data-testid="gantt-task-rows"]', 60000)
      const checkboxes = page.locator('[data-testid^="gantt-task-checkbox-"]')
      const total = Math.min(await checkboxes.count(), 5)
      for (let index = 0; index < total; index += 1) {
        await checkboxes.nth(index).check()
      }
      const startedAt = Date.now()
      const batchBar = page.getByTestId('gantt-batch-action-bar')
      await batchBar.waitFor({ state: 'visible', timeout: 10000 })
      await batchBar.getByPlaceholder('例如 3 或 -2').fill('1')
      const applyButton = batchBar.getByTestId('gantt-batch-apply')
      const disabledBeforeClick = await applyButton.isDisabled()
      let batchResponse = null
      let feedbackVisible = false
      let loadingObserved = false
      if (!disabledBeforeClick) {
        const batchResponsePromise = page.waitForResponse((response) =>
          response.url().includes('batch-update') && response.request().method() === 'POST',
          { timeout: 15000 },
        ).catch(() => null)
        await applyButton.click()
        const buttonHandle = await applyButton.elementHandle()
        if (buttonHandle) {
          loadingObserved = await page
            .waitForFunction(
              (button) => button.getAttribute('aria-busy') === 'true' || button.hasAttribute('disabled'),
              buttonHandle,
              { timeout: 2000 },
            )
            .then(() => true)
            .catch(() => false)
        }
        batchResponse = await batchResponsePromise
        feedbackVisible = await page
          .getByText(/批量更新已提交|批量更新已受理|已处理 \d+ 个任务/)
          .first()
          .waitFor({ state: 'visible', timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      }
      const batchText = await batchBar.innerText().catch(() => '')
      const ms = Date.now() - startedAt
      const batchStatus = batchResponse?.status() ?? null
      const submissionAccepted = feedbackVisible || (batchStatus !== null && batchStatus < 400)
      checks.bulkOperationFeedback = (total > 0 && !disabledBeforeClick && loadingObserved && submissionAccepted && ms <= 15000 && diagnostics.pageErrors.length === 0)
        ? pass({ selectedCount: total, ms, batchStatus, loadingObserved, feedbackVisible, batchText, diagnostics, screenshot: await screenshot(page, 'v11-ch6-bulk-feedback.png') })
        : fail({ selectedCount: total, ms, batchStatus, disabledBeforeClick, loadingObserved, feedbackVisible, batchText, diagnostics, screenshot: await screenshot(page, 'v11-ch6-bulk-feedback.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      await page.route('**/api/dashboard/project-summary**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'CH6 injected 500' } }),
        })
      })
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.getByText(/加载失败|服务暂时不可用|项目摘要加载失败/).first().waitFor({ state: 'visible', timeout: 10000 })
      const loadingCount = await page.locator('text=/加载中|Loading/i').count()
      checks.api500Prompt = pass({ loadingCount, diagnostics, screenshot: await screenshot(page, 'v11-ch6-api-500.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      await page.route('**/api/dashboard/project-summary**', async (route) => {
        await page.waitForTimeout(700)
        await route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'CH6 injected timeout' } }),
        })
      })
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.getByText(/加载失败|服务暂时不可用|项目摘要加载失败|timeout/i).first().waitFor({ state: 'visible', timeout: 10000 })
      const loadingCount = await page.locator('text=/加载中|Loading/i').count()
      checks.apiTimeoutPrompt = pass({ loadingCount, diagnostics, screenshot: await screenshot(page, 'v11-ch6-api-timeout.png') })
      await context.close()
    }

    {
      const context = await authedContext(browser, sessions.owner.token)
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      let saveRequests = 0
      await page.route('**/api/monthly-plans', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        saveRequests += 1
        await page.waitForTimeout(700)
        await route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'CH6 save timeout' } }),
        })
      })
      await timedPageOpen(
        page,
        `${WEB_BASE}/#/projects/${project.id}/planning/monthly?month=${data.monthlyPlan.month}`,
        '[data-testid="monthly-plan-tree-block"], [data-testid="monthly-plan-review-block"]',
        30000,
      )
      const saveButton = page.getByTestId('monthly-plan-save-draft-header')
      await saveButton.waitFor({ state: 'visible', timeout: 15000 })
      await Promise.all([
        saveButton.click(),
        saveButton.click().catch(() => null),
      ])
      await page.getByText(/保存草稿失败|草稿保存失败|timeout/i).first().waitFor({ state: 'visible', timeout: 12000 })
      const treeStillVisible = await page.locator('[data-testid="monthly-plan-tree-block"], [data-testid="monthly-plan-review-block"]').first().isVisible()
      checks.duplicateSaveAndDraftPreserved = (saveRequests === 1 && treeStillVisible)
        ? pass({ saveRequests, treeStillVisible, diagnostics, screenshot: await screenshot(page, 'v11-ch6-duplicate-save-timeout.png') })
        : fail({ saveRequests, treeStillVisible, diagnostics, screenshot: await screenshot(page, 'v11-ch6-duplicate-save-timeout.png') })
      await context.close()
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
      await context.addInitScript(() => {
        window.localStorage.setItem('auth_token', 'expired-token-for-chapter-6')
        window.localStorage.setItem('access_token', 'expired-token-for-chapter-6')
      })
      const page = await context.newPage()
      const diagnostics = attachDiagnostics(page)
      await page.goto(`${WEB_BASE}/#/projects/${project.id}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.getByText(/登录后继续|登录后继续查看项目|前往登录入口/).first().waitFor({ state: 'visible', timeout: 15000 })
      const loginTrigger = page.getByRole('button', { name: /登录后继续|前往登录入口|登录/ }).first()
      await loginTrigger.click()
      await page.getByTestId('login-dialog').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('#login-username').fill(ACCOUNTS.owner.username)
      await page.locator('#login-password').fill(ACCOUNTS.owner.password)
      await page.getByTestId('login-dialog').getByRole('button', { name: /^登录$/ }).click()
      await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
      checks.expiredLoginRelogin = pass({ diagnostics, screenshot: await screenshot(page, 'v11-ch6-expired-login-relogin.png') })
      await context.close()
    }

    const unauthorized = await apiRequest('/api/tasks', {
      method: 'POST',
      token: sessions.viewer.token,
      body: {
        project_id: project.id,
        title: 'CH6 viewer forbidden write',
        status: 'todo',
        progress: 0,
        start_date: '2026-10-01',
        end_date: '2026-10-02',
        planned_start_date: '2026-10-01',
        planned_end_date: '2026-10-02',
      },
      allowFailure: true,
    })
    checks.viewerWriteForbidden = unauthorized.response.status === 403
      ? pass({ status: unauthorized.response.status, body: unauthorized.json })
      : fail({ status: unauthorized.response.status, body: unauthorized.json })

    summary.chapter6.browserChecks = checks
  } finally {
    await browser.close()
  }
}

async function timeApi(pathname, token) {
  const startedAt = Date.now()
  const result = await apiRequest(pathname, { token, allowFailure: true, timeoutMs: 8000 })
  return {
    path: pathname,
    status: result.response.status,
    ok: result.response.ok,
    ms: Date.now() - startedAt,
    message: result.json?.error?.message || result.json?.message || null,
  }
}

async function runApiStabilityChecks(summary, token, projectId) {
  const endpoints = [
    `/api/dashboard/project-summary?projectId=${encodeURIComponent(projectId)}`,
    `/api/tasks?projectId=${encodeURIComponent(projectId)}`,
    `/api/task-obstacles?projectId=${encodeURIComponent(projectId)}`,
    `/api/issues?project_id=${encodeURIComponent(projectId)}`,
    `/api/projects/${projectId}/data-quality-summary`,
  ]
  const runs = []
  for (const endpoint of endpoints) {
    runs.push(await timeApi(endpoint, token))
  }
  summary.chapter6.apiStability = {
    pass: runs.every((item) => item.ok && item.ms <= 8000),
    runs,
  }
}

async function runShell(command, logName) {
  await ensureDir(outputDir)
  const startedAt = Date.now()
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]
  return await new Promise((resolve) => {
    const child = spawn(shell, args, { cwd: repoRoot, env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('close', async (code) => {
      const logPath = join(outputDir, logName)
      await writeFile(logPath, `${stdout}\n${stderr ? `\n--- STDERR ---\n${stderr}` : ''}`, 'utf8')
      resolve({
        command,
        code,
        ms: Date.now() - startedAt,
        log: rel(logPath),
        tail: `${stdout}\n${stderr}`.split(/\r?\n/).slice(-20).join('\n'),
      })
    })
  })
}

async function listFilesRecursive(root) {
  const files = []
  if (!existsSync(root)) return files
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(full))
    } else {
      const info = await stat(full)
      files.push({ path: rel(full), bytes: info.size, modifiedAt: info.mtime.toISOString() })
    }
  }
  return files
}

function classifyGitStatusLine(line) {
  const file = line.slice(3).trim().replace(/^"|"$/g, '')
  const normalized = file.replace(/\\/g, '/')
  const sourcePrefixes = [
    'client/src/',
    'server/src/',
    'server/migrations/',
    'scripts/',
    'docs/plans/',
    'client/vite.config.ts',
    'client/vitest.config.ts',
    'package.json',
    'package-lock.json',
  ]
  const generatedPrefixes = ['.tmp/', 'artifacts/', 'tmp-', 'client/testlog', 'client/vitest-', 'server-tsc.', '.claude/']
  const generatedNames = [
    'EXECUTION_PROGRESS.json',
    'PROJECT_STATUS.md',
    'apply_b1.sh',
    'fix_cards.js',
    'fix_quotes.js',
    'fix_quotes.py',
    'server/run-migration-017.mjs',
    "fs.writeFileSync('tmp-v11-live.exit'",
  ]

  const releaseIncluded = sourcePrefixes.some((prefix) => normalized.startsWith(prefix) || normalized === prefix)
  const generatedOrExcluded = generatedPrefixes.some((prefix) => normalized.startsWith(prefix)) || generatedNames.includes(normalized)
  return {
    status: line.slice(0, 2),
    file,
    releaseIncluded,
    generatedOrExcluded,
  }
}

async function createDbSnapshot(summary) {
  const tables = ['projects', 'tasks', 'monthly_plans', 'monthly_plan_items', 'milestones', 'risks', 'issues', 'task_obstacles', 'schema_migrations']
  const rowCounts = {}
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    rowCounts[table] = error ? { error: error.message } : count
  }

  const migrations = await supabase
    .from('schema_migrations')
    .select('filename, version, checksum, applied_at')
    .order('filename', { ascending: true })

  const snapshot = {
    generatedAt: nowIso(),
    type: 'pre-release-logical-snapshot',
    note: '用于 v1.1 第7章上线前检查：记录 migration ledger 与关键业务表行数；生产物理备份仍以 Supabase/PITR 或发布平台快照为准。',
    rowCounts,
    migrations: migrations.error ? { error: migrations.error.message } : migrations.data,
  }
  const path = join(outputDir, 'database-pre-release-snapshot.json')
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  summary.chapter7.databaseSnapshot = {
    pass: !migrations.error,
    path: rel(path),
    rowCounts,
    migrationCount: Array.isArray(migrations.data) ? migrations.data.length : null,
  }
}

async function runChapter7Checks(summary) {
  const envStatus = await runShell('npm run env:status', 'chapter7-env-status.log')
  const build = await runShell('npm run build', 'chapter7-build.log')
  const migratePlan = await runShell('npm run migrate:plan --workspace=server', 'chapter7-migrate-plan.log')
  const gitStatus = await runShell('git status --short', 'chapter7-git-status.log')

  const statusLines = gitStatus.tail
    .split(/\r?\n/)
    .concat(readFileSync(join(outputDir, 'chapter7-git-status.log'), 'utf8').split(/\r?\n/))
    .filter((line, index, array) => line.trim() && array.indexOf(line) === index)
  const classified = statusLines.map(classifyGitStatusLine)
  const sourceFiles = classified.filter((item) => item.releaseIncluded)
  const excludedFiles = classified.filter((item) => item.generatedOrExcluded && !item.releaseIncluded)
  const reviewRequired = classified.filter((item) => !item.releaseIncluded && !item.generatedOrExcluded)

  const releaseBoundary = {
    generatedAt: nowIso(),
    rule: '发布包只纳入 v1.1 源码、脚本、migration、测试方案与签收台账；运行日志、截图、临时调试文件和本地代理配置不纳入发布包。',
    releaseIncludedCount: sourceFiles.length,
    excludedGeneratedCount: excludedFiles.length,
    reviewRequiredCount: reviewRequired.length,
    releaseIncluded: sourceFiles,
    excludedGenerated: excludedFiles,
    reviewRequired,
  }
  const boundaryPath = join(outputDir, 'release-file-boundary.json')
  await writeFile(boundaryPath, `${JSON.stringify(releaseBoundary, null, 2)}\n`, 'utf8')

  const envText = readFileSync(join(outputDir, 'chapter7-env-status.log'), 'utf8')
  const migrateText = readFileSync(join(outputDir, 'chapter7-migrate-plan.log'), 'utf8')
  const supabaseConfigured = Boolean(SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY))
  const databaseConnectionVerified = migratePlan.code === 0 && /待执行 migration:\s*0/.test(migrateText)

  summary.chapter7.commands = {
    envStatus,
    build,
    migratePlan,
  }
  summary.chapter7.releaseBoundary = {
    pass: reviewRequired.length === 0,
    path: rel(boundaryPath),
    releaseIncludedCount: sourceFiles.length,
    excludedGeneratedCount: excludedFiles.length,
    reviewRequired,
  }
  summary.chapter7.migrationOrder = {
    pass: migratePlan.code === 0 && /待执行 migration:\s*0/.test(migrateText),
    evidence: migratePlan.log,
  }
  summary.chapter7.environment = {
    pass: envStatus.code === 0
      && envText.includes('VITE_API_BASE_URL=/api')
      && envText.includes('CORS_ORIGIN=')
      && supabaseConfigured
      && databaseConnectionVerified,
    evidence: envStatus.log,
    apiBase: API_BASE,
    webBase: WEB_BASE,
    supabaseConfigured,
    databaseConnectionVerified,
  }
  summary.chapter7.rollbackPlan = {
    pass: true,
    strategy: [
      '代码回滚：从发布 tag 或主干前一提交执行 revert，并重新部署前端/后端。',
      '数据库回滚：本次 109-114 均为兼容型 ADD COLUMN / RLS / schema reconcile，失败时优先保留兼容字段并回滚代码；若必须回退结构，先使用 database-pre-release-snapshot.json 对账，再执行人工审定的反向 SQL。',
      '运行态回滚：回滚后执行 migrate:plan、diag:rls、diag:health、v2 live browser smoke，确认无 pending migration 与核心链路可用。',
    ],
  }

  await createDbSnapshot(summary)
}

function collectPassFail(value, path = []) {
  const failures = []
  if (!value || typeof value !== 'object') return failures
  if (Object.prototype.hasOwnProperty.call(value, 'pass') && value.pass !== true) {
    failures.push(path.join('.') || 'root')
  }
  for (const [key, nested] of Object.entries(value)) {
    if (nested && typeof nested === 'object') {
      failures.push(...collectPassFail(nested, [...path, key]))
    }
  }
  return failures
}

async function main() {
  await ensureDir(outputDir)
  await ensureDir(manualDir)

  const summary = {
    generatedAt: nowIso(),
    baseUrl: WEB_BASE,
    apiBaseUrl: API_BASE,
    chapter6: {},
    chapter7: {},
    failedChecks: [],
  }

  const ownerSession = await ensureAccount(ACCOUNTS.owner)
  const viewerSession = await ensureAccount(ACCOUNTS.viewer)
  log('accounts ready')
  const project = await ensureProject(ownerSession)
  await ensureProjectMember(project.id, ownerSession, 'owner')
  await ensureProjectMember(project.id, viewerSession, 'viewer')
  log('project ready', project.id)

  const data = await ensureChapter6Data(project.id, ownerSession.user.id)
  log('chapter 6 data ready', JSON.stringify({
    taskCount: data.taskCount,
    monthlyPlanItemCount: data.monthlyPlanItemCount,
    milestoneCount: data.milestoneCount,
    riskCount: data.riskCount,
    issueCount: data.issueCount,
    obstacleCount: data.obstacleCount,
  }))
  summary.project = { id: project.id, name: project.name }
  summary.chapter6.fixture = {
    pass: data.taskCount >= 1000
      && data.monthlyPlanItemCount >= 500
      && data.milestoneCount >= 100
      && data.riskCount >= 100
      && data.issueCount >= 100
      && data.obstacleCount >= 100,
    ...data,
  }

  await runApiStabilityChecks(summary, ownerSession.token, project.id)
  log('api stability checks done')
  await runBrowserChecks(summary, { owner: ownerSession, viewer: viewerSession }, project, data)
  log('browser checks done')
  await runChapter7Checks(summary)
  log('chapter 7 checks done')

  summary.failedChecks = collectPassFail(summary)
  const summaryPath = join(outputDir, 'chapter6-7-summary.json')
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(summaryPath)

  if (summary.failedChecks.length > 0) {
    process.exitCode = 1
  }
}

main().catch(async (error) => {
  await ensureDir(outputDir)
  const errorPath = join(outputDir, 'chapter6-7-summary.error.json')
  const described = describeError(error)
  await writeFile(errorPath, `${JSON.stringify({
    generatedAt: nowIso(),
    message: described.message,
    stack: described.stack,
  }, null, 2)}\n`, 'utf8')
  console.error(errorPath)
  process.exitCode = 1
})
