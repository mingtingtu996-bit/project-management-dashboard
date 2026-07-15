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
const closeoutFixtureProjectName = process.env.BROWSER_VERIFY_CLOSEOUT_PROJECT_NAME || 'V1424-CLOSEOUT-BROWSER-FIXTURE'
const closeoutFixtureTaskTitle = 'v1.4.24 closeout browser completed task'

const mockProject = {
  id: projectId,
  name: '城市更新项目',
  description: 'Closeout browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const closeoutPlan = {
  id: 'monthly-v2',
  project_id: projectId,
  version: 2,
  status: 'confirmed',
  month: '2020-03',
  title: '2020-03 月度计划',
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
      monthly_plan_version_id: 'monthly-v2',
      source_task_id: 'task-root',
      title: '主体结构',
      planned_start_date: '2020-03-01',
      planned_end_date: '2020-03-30',
      target_progress: 100,
      current_progress: 100,
      sort_order: 0,
      commitment_status: 'completed',
    },
    {
      id: 'closeout-item-2',
      project_id: projectId,
      monthly_plan_version_id: 'monthly-v2',
      source_task_id: 'task-leaf',
      title: '机电安装',
      planned_start_date: '2020-03-05',
      planned_end_date: '2020-03-25',
      target_progress: 40,
      current_progress: 20,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

closeoutPlan.items = closeoutPlan.items.filter((item) => item.id === 'closeout-item-2')

const closeoutVersions = [{ ...closeoutPlan, items: undefined }]

const dataQualitySummary = {
  projectId,
  month: '2020-03',
  confidence: {
    score: 86,
    flag: 'medium',
    note: '关账前建议继续核对少量跨链异常',
    timelinessScore: 88,
    anomalyScore: 84,
    consistencyScore: 86,
    coverageScore: 90,
    jumpinessScore: 82,
    activeFindingCount: 3,
    trendWarningCount: 1,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 1,
    dimensions: [],
  },
  prompt: {
    count: 1,
    summary: '仍有少量异常建议复核',
    items: [],
  },
  ownerDigest: {
    shouldNotify: true,
    severity: 'warning',
    scopeLabel: '月末关账',
    findingCount: 3,
    summary: '关账前建议复3 条异常',
  },
  findings: [],
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

export function resolvePlanningCloseoutProjectId({
  envProjectId = process.env.PROJECT_ID,
  mockApi = shouldUseMockApi,
  currentProjectId = projectId,
  manifest,
} = {}) {
  if (!envProjectId && !mockApi) {
    const manifestProjectId = manifest?.projects?.closeout?.id
    if (manifestProjectId) return manifestProjectId
    return currentProjectId
  }
  return resolveGanttProjectId({ envProjectId, mockApi, currentProjectId, manifest })
}

async function resolveProjectId(authToken) {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  const manifestProjectId = manifest?.projects?.closeout?.id
  projectId = manifestProjectId || await ensureDisposableCloseoutProject(authToken)
  return projectId
}

export function resolvePreviousMonth(nowValue = new Date()) {
  const year = nowValue.getUTCFullYear()
  const monthIndex = nowValue.getUTCMonth()
  const previous = new Date(Date.UTC(year, monthIndex - 1, 1))
  return previous.toISOString().slice(0, 7)
}

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok || payload?.success === false) {
    const message = payload?.error?.message || payload?.message || text || `HTTP ${response.status}`
    const details = payload?.error?.details ?? payload?.details ?? null
    const detailSuffix = details ? ` details=${JSON.stringify(details)}` : ''
    throw new Error(`${method} ${path} failed: ${message}${detailSuffix}`)
  }
  return payload?.data ?? payload
}

function findByName(items, keys, expectedName) {
  const normalized = String(expectedName ?? '').trim()
  return Array.isArray(items)
    ? items.find((item) => keys.some((key) => String(item?.[key] ?? '').trim() === normalized))
    : null
}

async function ensureDisposableCloseoutProject(authToken) {
  const projects = await apiRequest('/api/projects', { token: authToken })
  const existing = findByName(projects, ['name', 'project_name'], closeoutFixtureProjectName)
  if (existing?.id) return existing.id

  const project = await apiRequest('/api/projects', {
    method: 'POST',
    token: authToken,
    body: {
      name: closeoutFixtureProjectName,
      description: 'Disposable v1.4.24 planning closeout browser fixture.',
      status: '进行中',
      metadata: {
        fixture: 'v1424-planning-closeout-browser',
        disposable: true,
      },
    },
  })
  assert(project?.id, 'Failed to create disposable planning closeout project')
  return project.id
}

async function ensureCloseoutParticipantUnit(authToken) {
  const unitName = 'v1.4.24 closeout browser unit'
  const units = await apiRequest(`/api/participant-units?projectId=${encodeURIComponent(projectId)}`, { token: authToken })
  const existing = findByName(units, ['unit_name', 'name'], unitName)
  if (existing?.id) return existing

  const unit = await apiRequest('/api/participant-units', {
    method: 'POST',
    token: authToken,
    body: {
      project_id: projectId,
      unit_name: unitName,
      unit_type: '总包',
    },
  })
  assert(unit?.id, 'Failed to create closeout participant unit')
  return unit
}

async function ensureCloseoutEngineeringObject(authToken) {
  const objectName = 'v1.4.24 closeout browser workface'
  const objects = await apiRequest(`/api/engineering-objects?projectId=${encodeURIComponent(projectId)}`, { token: authToken })
  const existing = findByName(objects, ['object_name', 'name'], objectName)
  if (existing?.id) return existing

  const object = await apiRequest('/api/engineering-objects', {
    method: 'POST',
    token: authToken,
    body: {
      projectId,
      objectType: 'functional_area',
      objectName,
      parentId: null,
      sortOrder: 1,
      metadata: {
        fixture: 'v1424-planning-closeout-browser',
        disposable: true,
      },
    },
  })
  assert(object?.id, 'Failed to create closeout engineering object')
  return object
}

function isCleanCloseoutTask(task, participantUnitId, engineeringObjectId) {
  return Boolean(
    task?.id
      && String(task.title ?? '').trim() === closeoutFixtureTaskTitle
      && String(task.participant_unit_id ?? '') === participantUnitId
      && String(task.engineering_object_id ?? '') === engineeringObjectId
      && String(task.status ?? '').trim().toLowerCase() === 'completed'
      && Number(task.progress ?? 0) >= 100,
  )
}

async function ensureCloseoutSourceTask(authToken, participantUnitId, engineeringObjectId) {
  const tasks = await apiRequest(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, { token: authToken })
  const existing = Array.isArray(tasks)
    ? tasks.find((task) => String(task?.title ?? '').trim() === closeoutFixtureTaskTitle)
    : null
  if (isCleanCloseoutTask(existing, participantUnitId, engineeringObjectId)) return existing

  if (existing?.id) {
    const updated = await apiRequest(`/api/tasks/${existing.id}`, {
      method: 'PUT',
      token: authToken,
      body: {
        title: closeoutFixtureTaskTitle,
        status: 'completed',
        progress: 100,
        start_date: '2026-06-01',
        end_date: '2026-06-05',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-05',
        participant_unit_id: participantUnitId,
        engineering_object_id: engineeringObjectId,
        specialty_type: '土建',
        version: existing.version,
      },
    })
    if (isCleanCloseoutTask(updated, participantUnitId, engineeringObjectId)) return updated
  }

  const created = await apiRequest('/api/tasks', {
    method: 'POST',
    token: authToken,
    body: {
      project_id: projectId,
      title: closeoutFixtureTaskTitle,
      status: 'completed',
      progress: 100,
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-05',
      participant_unit_id: participantUnitId,
      engineering_object_id: engineeringObjectId,
      specialty_type: '土建',
      is_milestone: false,
    },
  })
  assert(isCleanCloseoutTask(created, participantUnitId, engineeringObjectId), 'Created closeout task is not integrity-clean')
  return created
}

async function selectCloseoutSourceTask(authToken) {
  const tasks = await apiRequest(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, { token: authToken })
  const task = Array.isArray(tasks)
    ? tasks.find((item) => String(item?.title ?? '').trim() === closeoutFixtureTaskTitle)
      || tasks.find((item) => item?.id && item?.title)
    : null
  if (!task?.id) {
    throw new Error(`No source task available for closeout fixture project ${projectId}`)
  }
  return task
}

async function resolveMonthlyPlanSourceVersionId(authToken) {
  const candidateProjectIds = [projectId]
  const manifest = await readFullAppTestManifest().catch(() => null)
  for (const candidateId of [
    manifest?.projects?.standard?.id,
    manifest?.projects?.large?.id,
    manifest?.projects?.empty?.id,
  ]) {
    if (candidateId && !candidateProjectIds.includes(candidateId)) {
      candidateProjectIds.push(candidateId)
    }
  }

  for (const candidateId of candidateProjectIds) {
    const plans = await apiRequest(`/api/monthly-plans?project_id=${encodeURIComponent(candidateId)}`, { token: authToken })
    const sourcePlan = Array.isArray(plans) ? plans.find((plan) => plan?.id) : null
    if (sourcePlan?.id) return sourcePlan.id
  }

  throw new Error('No existing monthly plan is available as a snapshot source for closeout fixture creation')
}

async function ensureCloseoutFixture(authToken) {
  if (shouldUseMockApi) {
    return {
      source: 'mock',
      month: '2020-03',
      planId: closeoutPlan.id,
      created: false,
      confirmed: true,
    }
  }

  const month = process.env.BROWSER_VERIFY_CLOSEOUT_MONTH || resolvePreviousMonth()
  const participantUnit = await ensureCloseoutParticipantUnit(authToken)
  const engineeringObject = await ensureCloseoutEngineeringObject(authToken)
  await ensureCloseoutSourceTask(authToken, participantUnit.id, engineeringObject.id)
  const sourceTask = await selectCloseoutSourceTask(authToken)
  const plans = await apiRequest(`/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`, { token: authToken })
  const existingConfirmed = Array.isArray(plans)
    ? plans.find((plan) => plan?.month === month && plan?.status === 'confirmed')
    : null
  if (existingConfirmed?.id) {
    const detail = await apiRequest(`/api/monthly-plans/${existingConfirmed.id}?project_id=${encodeURIComponent(projectId)}`, { token: authToken })
    if (Array.isArray(detail?.items) && detail.items.length > 0) {
      return {
        source: 'existing-confirmed',
        month,
        planId: existingConfirmed.id,
        sourceTask: { id: sourceTask.id, title: sourceTask.title },
        created: false,
        confirmed: true,
      }
    }
  }

  const existingDraft = Array.isArray(plans)
    ? plans.find((plan) => plan?.month === month && plan?.status === 'draft')
    : null
  let draft = null
  if (existingDraft?.id) {
    const detail = await apiRequest(`/api/monthly-plans/${existingDraft.id}?project_id=${encodeURIComponent(projectId)}`, { token: authToken })
    if (Array.isArray(detail?.items) && detail.items.length > 0) {
      draft = existingDraft
    }
  }
  draft ??= await apiRequest('/api/monthly-plans', {
    method: 'POST',
    token: authToken,
    body: {
      project_id: projectId,
      month,
      title: `${month} v1.4.24 closeout browser fixture`,
      items: [
        {
          source_task_id: sourceTask.id,
          title: sourceTask.title,
          planned_start_date: sourceTask.planned_start_date ?? sourceTask.start_date ?? `${month}-01`,
          planned_end_date: sourceTask.planned_end_date ?? sourceTask.end_date ?? `${month}-15`,
          target_progress: 100,
          current_progress: Number(sourceTask.progress ?? 100),
          sort_order: 0,
          commitment_status: 'planned',
        },
      ],
    },
  })

  if (!draft?.id || !Number.isFinite(Number(draft.version))) {
    throw new Error(`Unable to prepare closeout draft for ${projectId}/${month}`)
  }

  const confirmed = await apiRequest(`/api/monthly-plans/${draft.id}/confirm`, {
    method: 'POST',
    token: authToken,
    body: {
      version: Number(draft.version),
      month: draft.month ?? month,
    },
  })

  const reusedDraft = draft?.id === existingDraft?.id
  return {
    source: reusedDraft ? 'existing-draft-confirmed' : 'created-draft-confirmed',
    month,
    planId: confirmed?.id ?? draft.id,
    sourceTask: { id: sourceTask.id, title: sourceTask.title },
    created: !reusedDraft,
    confirmed: true,
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

  if (pathname === `/api/projects/${projectId}/bootstrap`) {
    return json({
      success: true,
      data: {
        project: mockProject,
        tasks: [],
        risks: [],
        conditions: [],
        obstacles: [],
        warnings: [],
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === `/api/members/${projectId}/me`) {
    return json({
      success: true,
      data: {
        permissionLevel: 'owner',
        globalRole: 'company_admin',
        canManageTeam: true,
        canEdit: true,
      },
    })
  }

  if (
    pathname === '/api/tasks'
    || pathname === '/api/risks'
    || pathname === '/api/milestones'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: closeoutVersions })
  }

  if (pathname === `/api/monthly-plans/${closeoutPlan.id}`) {
    return json({ success: true, data: closeoutPlan })
  }

  if (pathname === `/api/monthly-plans/${closeoutPlan.id}/close`) {
    return json({ success: true, data: { ...closeoutPlan, status: 'closed', closeout_at: now } })
  }

  if (pathname === '/api/data-quality/project-summary') {
    return json({ success: true, data: dataQualitySummary })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  const authToken = shouldUseMockApi ? null : await resolveBrowserVerifyAuthToken()
  await resolveProjectId(authToken)
  const closeoutFixture = await ensureCloseoutFixture(authToken)

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
  let selectedCloseoutItemId = 'closeout-item-2'

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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/monthly?view=closeout&month=${encodeURIComponent(closeoutFixture.month)}`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('closeout-escalation-ladder').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('closeout-filter-bar').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('closeout-grouped-list').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(
      initialUrl.includes('/planning/monthly') && initialUrl.includes('view=closeout'),
      `Unexpected Closeout URL: ${initialUrl}`,
    )
    await page.screenshot({ path: join(outputDir, 'planning-closeout-page.png'), fullPage: true })

    const closeoutItem = page.locator('[data-testid^="closeout-item-open-"]').first()
    await closeoutItem.waitFor({ state: 'visible', timeout: 10000 })
    const closeoutItemTestId = await closeoutItem.getAttribute('data-testid')
    selectedCloseoutItemId = String(closeoutItemTestId ?? '').replace(/^closeout-item-open-/, '') || selectedCloseoutItemId
    await closeoutItem.click()
    await page.getByTestId('closeout-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-closeout-detail.png'), fullPage: true })
    await page.keyboard.press('Escape')

    await page.getByTestId('closeout-single-process-entry').click()
    await page.getByTestId('closeout-confirm-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-closeout-confirm-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      projectId,
      selectedCloseoutItemId,
      closeoutFixture,
      detailVisible: true,
      confirmDialogVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-closeout-page.png'),
        detail: join(outputDir, 'planning-closeout-detail.png'),
        confirmDialog: join(outputDir, 'planning-closeout-confirm-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-closeout-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'planning-closeout-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      selectedCloseoutItemId,
      closeoutFixture,
      pageBodyText,
      failureScreenshot,
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-closeout-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
