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

const mockProject = {
  id: projectId,
  name: '鍩庡競鏇存柊椤圭洰',
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
  title: '2020-03 鏈堝害璁″垝',
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
      title: '涓讳綋缁撴瀯',
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
      title: '鏈虹數瀹夎',
      planned_start_date: '2020-03-05',
      planned_end_date: '2020-03-25',
      target_progress: 40,
      current_progress: 20,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

const closeoutVersions = [{ ...closeoutPlan, items: undefined }]

const dataQualitySummary = {
  projectId,
  month: '2020-03',
  confidence: {
    score: 86,
    flag: 'medium',
    note: '鍏宠处鍓嶅缓璁户缁牳瀵瑰皯閲忚法閾惧紓甯搞€?',
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
    summary: '浠嶆湁灏戦噺寮傚父寤鸿澶嶆牳銆?',
    items: [],
  },
  ownerDigest: {
    shouldNotify: true,
    severity: 'warning',
    scopeLabel: '鏈堟湯鍏宠处',
    findingCount: 3,
    summary: '鍏宠处鍓嶅缓璁鏍?3 鏉″紓甯搞€?',
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

  if (
    pathname === '/api/tasks'
    || pathname === '/api/risks'
    || pathname === '/api/milestones'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/delay-requests'
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/closeout`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('closeout-escalation-ladder').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('closeout-filter-bar').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('closeout-grouped-list').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/planning/closeout'), `Unexpected Closeout URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-closeout-page.png'), fullPage: true })

    await page.getByTestId('closeout-item-open-closeout-item-2').click()
    await page.getByTestId('closeout-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-closeout-detail.png'), fullPage: true })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: '强制发起关账' }).click()
    await page.getByTestId('closeout-confirm-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-closeout-confirm-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
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
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
