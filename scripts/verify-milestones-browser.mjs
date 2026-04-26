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
  name: '绀轰緥椤圭洰',
  description: 'Milestones browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockMilestoneSummary = {
  id: projectId,
  name: '绀轰緥椤圭洰',
  milestoneOverview: {
    stats: {
      total: 3,
      pending: 1,
      completed: 1,
      overdue: 1,
      upcomingSoon: 1,
      completionRate: 33,
    },
    items: [
      {
        id: 'm1',
        name: '鍦颁笅瀹ゆ柦宸?',
        description: '鑺傜偣鍋忓樊琛ㄨ揪',
        targetDate: '2026-04-01',
        planned_date: '2026-04-01',
        current_planned_date: '2026-04-03',
        actual_date: '2026-04-04',
        progress: 100,
        status: 'completed',
        statusLabel: '宸插厬鐜?',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm2',
        name: '鍦颁笂缁撴瀯灏侀《',
        description: '褰撳墠鎺ㄨ繘涓殑鑺傜偣',
        targetDate: '2026-04-06',
        planned_date: '2026-04-06',
        current_planned_date: '2026-04-08',
        actual_date: null,
        progress: 60,
        status: 'soon',
        statusLabel: '涓磋繎鑺傜偣',
        parent_id: 'm1',
        mapping_pending: true,
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ],
  },
}

const ganttTask = {
  id: 'm1',
  project_id: projectId,
  title: '鍦颁笅瀹ゆ柦宸?',
  description: '鍏抽敭鑺傜偣浠诲姟',
  status: 'completed',
  progress: 100,
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-04-04',
  start_date: '2026-03-01',
  end_date: '2026-04-04',
  is_milestone: true,
  created_at: now,
  updated_at: now,
}

const criticalPathSnapshot = {
  projectId,
  autoTaskIds: ['m1'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['m1'],
    totalDurationDays: 34,
    displayLabel: '涓诲叧閿矾寰?',
  },
  alternateChains: [],
  displayTaskIds: ['m1'],
  edges: [],
  tasks: [
    {
      taskId: 'm1',
      title: '鍦颁笅瀹ゆ柦宸?',
      floatDays: 0,
      durationDays: 34,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 34,
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

  if (pathname === '/api/dashboard/project-summary') {
    return json({ success: true, data: mockMilestoneSummary })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: [ganttTask] })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/delay-requests'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname === '/api/task-baselines'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: [] })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/milestones`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('milestone-health-summary').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('milestone-child-group').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/milestones'), `Unexpected Milestones URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'milestones-page.png'), fullPage: true })

    await page.getByRole('button', { name: '鍦颁笅瀹ゆ柦宸? '}).click()
    await page.getByRole('button', { name: '进入任务管理' }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByRole('button', { name: '进入任务管理' }).click()
    await page.waitForURL((url) => url.toString().includes('/gantt?highlight=m1'), { timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'milestones-to-gantt.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      ganttUrl: page.url(),
      detailVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'milestones-page.png'),
        gantt: join(outputDir, 'milestones-to-gantt.png'),
      },
    }

    await writeFile(join(outputDir, 'milestones-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'milestones-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
