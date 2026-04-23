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

const governanceSnapshot = {
  project_id: projectId,
  health: {
    project_id: projectId,
    score: 76,
    status: 'warning',
    label: '浜氬仴搴?',
    breakdown: {
      data_integrity_score: 88,
      mapping_integrity_score: 74,
      system_consistency_score: 69,
      m1_m9_score: 91,
      passive_reorder_penalty: 12,
      total_score: 76,
    },
  },
  integrity: {
    project_id: projectId,
    data_integrity: {
      total_tasks: 4,
      missing_participant_unit_count: 1,
      missing_scope_dimension_count: 0,
      missing_progress_snapshot_count: 1,
    },
    mapping_integrity: {
      baseline_pending_count: 2,
      baseline_merged_count: 1,
      monthly_carryover_count: 0,
    },
    system_consistency: {
      inconsistent_milestones: 1,
      stale_snapshot_count: 0,
    },
    milestone_integrity: {
      summary: {
        total: 9,
        aligned: 8,
        needs_attention: 1,
        missing_data: 0,
        blocked: 0,
      },
    },
  },
  anomaly: {
    project_id: projectId,
    detected_at: now,
    total_events: 10,
    windows: [
      {
        window_days: 3,
        event_count: 10,
        affected_task_count: 4,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      },
    ],
  },
  alerts: [
    {
      kind: 'anomaly',
      severity: 'warning',
      title: '鍏抽敭浠诲姟绐楀彛琚姩閲嶆帓',
      detail: '3 澶╃獥鍙ｅ唴绱 10 娆″彉鍔紝骞冲潎鍋忕Щ 8 澶╋紝璇疯繘鍏ヤ慨璁㈠€欓€夌粺涓€澶勭悊銆?',
      source_id: `${projectId}:anomaly`,
    },
  ],
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

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      authenticated: true,
      user: {
        id: 'user-1',
        username: 'zhangsan',
        display_name: '寮犱笁',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({
      success: true,
      data: [{
        id: projectId,
        name: '璁″垝淇鍊欓€夎仈璋冮」鐩?',
        description: 'Planning revision browser verification fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
      }],
    })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({
      success: true,
      data: {
        id: projectId,
        name: '璁″垝淇鍊欓€夎仈璋冮」鐩?',
        description: 'Planning revision browser verification fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    })
  }

  if (pathname === '/api/planning-governance') {
    return json({ success: true, data: governanceSnapshot, timestamp: now })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/revision-pool`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('planning-governance-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('planning-revision-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-revision-source-entry').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'planning-revision-page.png'), fullPage: true })

    await page.getByTestId('baseline-revision-source-entry').click()
    await page.getByTestId('baseline-revision-pool-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('baseline-revision-candidate-item').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('baseline-revision-add-to-basket').click()
    await page.getByTestId('baseline-revision-basket').getByText(governanceSnapshot.alerts[0].title).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('baseline-revision-mark-deferred').click()
    await page.getByTestId('baseline-revision-deferred-reason').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('baseline-revision-enter-draft').click()
    await page.getByTestId('baseline-revision-deeplink-context').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-revision-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      deeplinkContextVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-revision-page.png'),
        dialog: join(outputDir, 'planning-revision-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-revision-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-revision-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
