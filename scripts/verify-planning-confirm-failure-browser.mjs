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
let confirmAttempts = 0
let monthlyStatus = 'draft'

const mockProject = {
  id: projectId,
  name: '鏈堝害纭澶辫触鑱旇皟椤圭洰',
  description: 'Planning confirm failure browser verification fixture project',
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
  carryover_item_count: 0,
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
  ],
}

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

function getMonthlyVersion() {
  return {
    ...mockMonthlyPlanDetail,
    status: monthlyStatus,
    items: undefined,
  }
}

function getMonthlyDetail() {
  return {
    ...mockMonthlyPlanDetail,
    status: monthlyStatus,
  }
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

function buildMockResponse(urlString, method) {
  const url = new URL(urlString)
  const { pathname } = url

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === '/api/monthly-plans') {
    return json({ success: true, data: [getMonthlyVersion()] })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: mockBaselineVersions })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/task-conditions' || pathname === '/api/task-obstacles' || pathname === '/api/risks' || pathname === '/api/issues' || pathname === '/api/warnings' || pathname === '/api/delay-requests' || pathname === '/api/change-logs' || pathname === '/api/tasks/progress-snapshots') {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}`) {
    return json({ success: true, data: getMonthlyDetail() })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}/lock`) {
    return json({ success: true, data: mockDraftLockResponse })
  }

  if (pathname === `/api/monthly-plans/${mockMonthlyPlanDetail.id}/confirm` && method === 'POST') {
    confirmAttempts += 1
    if (confirmAttempts === 1) {
      return json({
        success: false,
        error: {
          code: 'MONTHLY_CONFIRM_FAILED',
          message: '鏈堝害璁″垝纭澶辫触锛岃鍏堟鏌ュ紓甯告憳瑕佸悗閲嶈瘯銆?',
        },
      }, 422)
    }
    monthlyStatus = 'confirmed'
    return json({
      success: true,
      data: {
        ...mockMonthlyPlanDetail,
        status: 'confirmed',
      },
    })
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
      if (message.type() === 'error' && !message.text().includes('422 (Unprocessable Entity)') && !message.text().includes('WebSocket connection')) {
        consoleErrors.push(message.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const requestUrl = route.request().url()
      const requestMethod = route.request().method().toUpperCase()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl, requestMethod))
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
    await page.getByTestId('monthly-plan-source-block').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('monthly-plan-standard-confirm-entry').click()
    await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible', timeout: 10000 })

    await page.getByRole('button', { name: '确认月度计划' }).click()
    const confirmDialog = page.getByTestId('monthly-plan-confirm-dialog')
    await confirmDialog.getByText('确认失败', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await confirmDialog.getByRole('button', { name: '重新尝试' }).waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-confirm-failure-dialog.png'), fullPage: true })

    await confirmDialog.getByRole('button', { name: '重新尝试' }).click()
    await confirmDialog.waitFor({ state: 'hidden', timeout: 10000 })
    await page.getByText('已确认查看态').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.screenshot({ path: join(outputDir, 'planning-confirm-failure-recovered.png'), fullPage: true })

    assert(confirmAttempts === 2, `Expected 2 confirm attempts, received ${confirmAttempts}`)
    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      targetUrl,
      confirmAttempts,
      failureVisible: true,
      recoveredToReadonly: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        failureDialog: join(outputDir, 'planning-confirm-failure-dialog.png'),
        recoveredState: join(outputDir, 'planning-confirm-failure-recovered.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-confirm-failure-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-confirm-failure-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
