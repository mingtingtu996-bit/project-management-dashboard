import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  isIgnorableBrowserConsoleError,
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
const verificationMonth = resolvePlanningMonthlyVerificationMonth()
const now = new Date().toISOString()

function isIgnorableRequestFailure(errorText) {
  return typeof errorText === 'string' && errorText.includes('net::ERR_ABORTED')
}

const mockProject = {
  id: projectId,
  name: '月度计划联调项目',
  description: 'MonthlyPlan browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockBaselineVersions = [
  {
    id: 'baseline-v2',
    project_id: projectId,
    version: 2,
    status: 'confirmed',
    title: '项目基线',
    source_type: 'manual',
    confirmed_at: '2099-09-01T00:00:00.000Z',
    updated_at: '2099-09-01T00:00:00.000Z',
  },
]

const mockTasks = [
  {
    id: 'task-root',
    project_id: projectId,
    title: '主体结构',
    wbs_level: 1,
    sort_order: 0,
    progress: 45,
    planned_start_date: '2099-09-01',
    planned_end_date: '2099-09-30',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-leaf',
    project_id: projectId,
    title: '机电安装',
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

const mockConditions = [
  {
    id: 'condition-1',
    task_id: 'task-root',
    name: '材料到场',
    is_satisfied: false,
    created_at: now,
  },
]

const mockObstacles = [
  {
    id: 'obstacle-1',
    task_id: 'task-leaf',
    title: '场地协调',
    is_resolved: false,
    status: '处理中',
    created_at: now,
  },
]

const mockMonthlyPlanDetail = {
  id: 'monthly-v9',
  project_id: projectId,
  version: 9,
  status: 'draft',
  month: '2099-09',
  title: '2099-09 月度计划',
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
      source_task_id: 'task-root',
      title: '主体结构',
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
      source_task_id: 'task-leaf',
      title: '机电安装',
      planned_start_date: '2099-09-05',
      planned_end_date: '2099-09-25',
      target_progress: 35,
      current_progress: 20,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

const mockMonthlyVersions = [
  {
    ...mockMonthlyPlanDetail,
    items: undefined,
  },
]

const mockDraftLockResponse = {
  lock: {
    id: 'lock-1',
    project_id: projectId,
    draft_type: 'monthly_plan',
    resource_id: 'monthly-v9',
    locked_by: 'browser-verify-user',
    locked_at: '2099-09-15T08:00:00.000Z',
    lock_expires_at: '2099-09-15T08:30:00.000Z',
    is_locked: true,
  },
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

export function resolvePlanningMonthlyVerificationMonth({
  envMonth = process.env.BROWSER_VERIFY_MONTH,
  mockApi = shouldUseMockApi,
  nowValue = new Date(),
} = {}) {
  if (envMonth) return envMonth
  return mockApi ? '2099-09' : nowValue.toISOString().slice(0, 7)
}

export function resolvePlanningMonthlyProjectId({
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
  projectId = resolvePlanningMonthlyProjectId({ manifest })
  return projectId
}

async function clearDraftResumeSnapshots(page) {
  await page.evaluate(() => {
    try {
      const draftResumePrefix = 'planning:draft-resume:'
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(draftResumePrefix)) {
          window.localStorage.removeItem(key)
        }
      }
    } catch {
      // Opaque documents such as about:blank cannot access localStorage.
    }
  })
}

async function dismissDraftResumeDialog(page) {
  const resumeDialog = page.getByTestId('planning-draft-resume-dialog')
  const visible = await resumeDialog.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
  if (!visible) {
    return false
  }

  await resumeDialog.locator('button').filter({ hasText: '放弃本地状态' }).click()
  await resumeDialog.waitFor({ state: 'detached', timeout: 10000 })
  return true
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
        risks: [],
        conditions: mockConditions,
        obstacles: mockObstacles,
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

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: mockMonthlyVersions })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselineVersions })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/task-conditions') {
    return json({ success: true, data: mockConditions })
  }

  if (pathname === '/api/task-obstacles') {
    return json({ success: true, data: mockObstacles })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}`) {
    return json({ success: true, data: mockMonthlyPlanDetail })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}/lock`) {
    return json({ success: true, data: mockDraftLockResponse })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/issues'
    || pathname === '/api/warnings'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
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
  const consoleErrorDetails = []
  const pageErrors = []
  const apiFailures = []
  const requestFailures = []
  let page = null
  let pageBodyText = null
  let failureScreenshot = null

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)
    await page.addInitScript(() => {
      try {
        const draftResumePrefix = 'planning:draft-resume:'
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith(draftResumePrefix)) {
            window.localStorage.removeItem(key)
          }
        }
      } catch {
        // Opaque documents such as about:blank cannot access localStorage.
      }
    })

    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableBrowserConsoleError(text)) {
          consoleErrors.push(text)
          consoleErrorDetails.push({ text, location: message.location() })
        }
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('requestfailed', (request) => {
      const failure = request.failure()
      if (isIgnorableRequestFailure(failure?.errorText)) {
        return
      }
      requestFailures.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
        errorText: failure?.errorText ?? 'unknown',
      })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/monthly?month=${encodeURIComponent(verificationMonth)}`
    const freshTargetUrl = `${baseUrl}/?verify=planning-monthly-confirm${new URL(targetUrl).hash}`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-layered-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-edit-actions').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-batch-strip').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-tree-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-review-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-confirm-summary').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-reminder-banner').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/planning/monthly'), `Unexpected MonthlyPlan URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-monthly-page.png'), fullPage: true })

    await page.getByTestId('planning-selection-checkbox').first().click()
    await dismissDraftResumeDialog(page)
    await page.getByTestId('monthly-plan-edit-actions').getByText('有未保存调整').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('[data-testid="planning-page-tabs"] button').filter({ hasText: '项目基线' }).first().click()
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-monthly-unsaved-dialog.png'), fullPage: true })
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').locator('button').first().click()
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').waitFor({ state: 'detached', timeout: 10000 })

    assert(
      await page.getByTestId('monthly-plan-confirm-draft-header').isDisabled(),
      'Monthly confirm should be disabled while unsaved monthly edits are present',
    )

    await page.locator('[data-testid="planning-page-tabs"] button').filter({ hasText: '项目基线' }).first().click()
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').locator('button').filter({ hasText: '确认离开' }).click()
    await page.waitForURL(/\/planning\/baseline/, { timeout: 10000 })

    await page.goto(freshTargetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-layered-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await clearDraftResumeSnapshots(page)
    await dismissDraftResumeDialog(page)
    await page.getByTestId('monthly-plan-confirm-draft-header').waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForFunction(() => {
      const confirmButton = document.querySelector('[data-testid="monthly-plan-confirm-draft-header"]')
      return confirmButton instanceof HTMLButtonElement && !confirmButton.disabled
    }, null, { timeout: 10000 })
    await page.getByTestId('monthly-plan-confirm-draft-header').click()
    await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-monthly-confirm-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)
    assert(requestFailures.length === 0, `Browser request failures detected: ${JSON.stringify(requestFailures)}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      unsavedGuardVisible: true,
      confirmDisabledWithUnsavedChanges: true,
      confirmDialogVisible: true,
      apiFailures,
      consoleErrors,
      consoleErrorDetails,
      pageErrors,
      requestFailures,
      screenshots: {
        page: join(outputDir, 'planning-monthly-page.png'),
        unsavedDialog: join(outputDir, 'planning-monthly-unsaved-dialog.png'),
        confirmDialog: join(outputDir, 'planning-monthly-confirm-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-monthly-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'planning-monthly-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      verificationMonth,
      pageBodyText,
      failureScreenshot,
      apiFailures,
      consoleErrors,
      consoleErrorDetails,
      pageErrors,
      requestFailures,
    }
    await writeFile(join(outputDir, 'planning-monthly-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
