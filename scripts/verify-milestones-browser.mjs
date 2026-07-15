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

const mockProject = {
  id: projectId,
  name: '示例项目',
  description: 'Milestones browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockMilestoneSummary = {
  id: projectId,
  name: '示例项目',
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
        name: '地下室施工',
        description: '节点偏差表达',
        targetDate: '2026-04-01',
        planned_date: '2026-04-01',
        current_planned_date: '2026-04-03',
        actual_date: '2026-04-04',
        progress: 100,
        status: 'completed',
        statusLabel: '已兑现',
        milestone_level: 1,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm2',
        name: '地上结构封顶',
        description: '当前推进中的节点',
        targetDate: '2026-04-06',
        planned_date: '2026-04-06',
        current_planned_date: '2026-04-08',
        actual_date: null,
        progress: 60,
        status: 'soon',
        statusLabel: '临近节点',
        parent_id: 'm1',
        milestone_level: 2,
        mapping_pending: true,
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ],
  },
}

const ganttTask = {
  id: 'm1',
  project_id: projectId,
  title: '地下室施',
  description: '关键节点任务',
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
    displayLabel: '主关键路',
  },
  alternateChains: [],
  displayTaskIds: ['m1'],
  edges: [],
  tasks: [
    {
      taskId: 'm1',
      title: '地下室施',
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

export function resolveMilestonesProjectId({
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
  projectId = resolveMilestonesProjectId({ manifest })
  return projectId
}

export function selectMilestoneIdFromSummary(summary) {
  const items = Array.isArray(summary?.milestoneOverview?.items) ? summary.milestoneOverview.items : []
  const preferred = items.find((item) => item?.id && !item?.merged_into)
  const fallback = preferred ?? items.find((item) => item?.id)
  return fallback?.id ? String(fallback.id) : ''
}

export function extractMilestoneIdFromCardTestId(testId) {
  const prefix = 'milestone-card-'
  const value = String(testId ?? '')
  return value.startsWith(prefix) ? value.slice(prefix.length) : ''
}

export function isProjectSummaryRequest(urlString, method, expectedProjectId = projectId) {
  if (method !== 'GET') return false
  const url = new URL(urlString)
  return url.pathname === `/api/projects/${encodeURIComponent(expectedProjectId)}/dashboard/project-summary`
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
        tasks: [ganttTask],
        risks: [],
        conditions: [],
        obstacles: [],
        warnings: [],
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === `/api/projects/${projectId}/dashboard/project-summary`) {
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
  const pageErrors = []
  const apiFailures = []
  let page = null
  let pageBodyText = null
  let failureScreenshot = null
  let selectedMilestoneId = 'm1'

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
      const requestMethod = route.request().method().toUpperCase()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl))
        return
      }

      const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
      try {
        const response = await route.fetch({ url: forwardUrl })
        if (isProjectSummaryRequest(forwardUrl, requestMethod) && response.ok()) {
          const payload = await response.json()
          const nextMilestoneId = selectMilestoneIdFromSummary(payload?.data ?? payload)
          if (nextMilestoneId) {
            selectedMilestoneId = nextMilestoneId
          }
          await route.fulfill(json(payload, response.status()))
          return
        }
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/milestones`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('milestones-summary-grid').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('milestone-level-group-1').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/milestones'), `Unexpected Milestones URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'milestones-page.png'), fullPage: true })

    const milestoneCard = page.locator('[data-testid^="milestone-card-"]').first()
    await milestoneCard.waitFor({ state: 'visible', timeout: 10000 })
    const milestoneCardTestId = await milestoneCard.getAttribute('data-testid')
    const domMilestoneId = extractMilestoneIdFromCardTestId(milestoneCardTestId)
    if (domMilestoneId) {
      selectedMilestoneId = domMilestoneId
    }
    assert(selectedMilestoneId, 'Unable to resolve a milestone id from project summary or DOM')
    await milestoneCard.getByRole('button').click()
    await page.getByTestId('milestone-detail-panel').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('milestone-detail-panel').getByRole('link').click()
    await page.waitForURL((url) => {
      const value = url.toString()
      return value.includes('/gantt?') && value.includes(`milestoneId=${encodeURIComponent(selectedMilestoneId)}`)
    }, { timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'milestones-to-tasks.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      tasksUrl: page.url(),
      projectId,
      selectedMilestoneId,
      detailVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'milestones-page.png'),
        tasks: join(outputDir, 'milestones-to-tasks.png'),
      },
    }

    await writeFile(join(outputDir, 'milestones-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'milestones-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      selectedMilestoneId,
      pageBodyText,
      failureScreenshot,
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
