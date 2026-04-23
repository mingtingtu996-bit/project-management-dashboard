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

const mockProject = {
  id: projectId,
  name: '鏈堝害璁″垝鑱旇皟椤圭洰',
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
    title: '椤圭洰鍩虹嚎',
    source_type: 'manual',
    confirmed_at: '2099-09-01T00:00:00.000Z',
    updated_at: '2099-09-01T00:00:00.000Z',
  },
]

const mockTasks = [
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
    id: 'task-leaf',
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

const mockConditions = [
  {
    id: 'condition-1',
    task_id: 'task-root',
    name: '鏉愭枡鍒板満',
    is_satisfied: false,
    created_at: now,
  },
]

const mockObstacles = [
  {
    id: 'obstacle-1',
    task_id: 'task-leaf',
    title: '鍦哄湴鍗忚皟',
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
  title: '2099-09 鏈堝害璁″垝',
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
      source_task_id: 'task-leaf',
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
    locked_by: 'user-1',
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

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
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
    || pathname === '/api/delay-requests'
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/monthly?month=2099-09`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-layered-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-source-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-batch-strip').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-tree-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-review-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-confirm-summary').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-reminder-banner').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/planning/monthly'), `Unexpected MonthlyPlan URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-monthly-page.png'), fullPage: true })

    await page.getByTestId('planning-selection-checkbox').first().click()
    await page.getByText('草稿已调整').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('button', { name: '去看项目基线' }).click()
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-monthly-unsaved-dialog.png'), fullPage: true })
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').getByRole('button', { name: '取消' }).click()
    await page.getByTestId('monthly-plan-unsaved-changes-dialog').waitFor({ state: 'detached', timeout: 10000 })

    await page.getByRole('button', { name: '标准确认入口' }).click()
    await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-monthly-confirm-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      unsavedGuardVisible: true,
      confirmDialogVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-monthly-page.png'),
        unsavedDialog: join(outputDir, 'planning-monthly-unsaved-dialog.png'),
        confirmDialog: join(outputDir, 'planning-monthly-confirm-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-monthly-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

