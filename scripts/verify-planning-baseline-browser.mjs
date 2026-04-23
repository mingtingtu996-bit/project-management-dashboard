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
  name: '鍩庡競涓績骞垮満椤圭洰锛堜簩鏈燂級',
  description: 'Baseline browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const currentVersions = [
  {
    id: 'baseline-v7',
    project_id: projectId,
    version: 7,
    status: 'draft',
    title: '鍩庡競涓績骞垮満椤圭洰锛堜簩鏈燂級 鍩虹嚎',
    description: '基于 v6 生成的草稿快照',
    source_type: 'manual',
    source_version_id: 'baseline-v6',
    source_version_label: 'v6',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
  {
    id: 'baseline-v6',
    project_id: projectId,
    version: 6,
    status: 'confirmed',
    title: '鍩庡競涓績骞垮満椤圭洰锛堜簩鏈燂級 鍩虹嚎',
    description: '已确认版本',
    source_type: 'manual',
    confirmed_at: '2026-04-15T08:30:00.000Z',
    confirmed_by: 'user-1',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
]

const currentDetails = {
  'baseline-v6': {
    ...currentVersions[1],
    items: [
      {
        id: 'baseline-v6-root',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        title: '椤圭洰鍩虹嚎 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v6-l2',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-root',
        title: '涓讳綋宸ョ▼ L2',
        source_task_id: 'task-l2',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v6-l3',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-l2',
        title: '缁撴瀯鏂藉伐 L3',
        source_task_id: 'task-l3',
        target_progress: 55,
        sort_order: 2,
        mapping_status: 'mapped',
        is_critical: true,
      },
      {
        id: 'baseline-v6-l5',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-l3',
        title: '浜や粯鏀跺熬 L5',
        source_milestone_id: 'milestone-l5',
        planned_end_date: '2026-09-20',
        sort_order: 3,
        mapping_status: 'mapped',
        is_milestone: true,
      },
    ],
  },
  'baseline-v7': {
    ...currentVersions[0],
    items: [
      {
        id: 'baseline-v7-root',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        title: '椤圭洰鍩虹嚎 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v7-l2',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-root',
        title: '涓讳綋宸ョ▼ L2',
        source_task_id: 'task-l2',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v7-l3',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-l2',
        title: '缁撴瀯鏂藉伐 L3',
        source_task_id: 'task-l3',
        target_progress: 60,
        sort_order: 2,
        mapping_status: 'mapped',
        is_critical: true,
      },
      {
        id: 'baseline-v7-l4',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-l3',
        title: '鏈堝害鏀跺彛 L4',
        source_task_id: 'task-l4',
        sort_order: 3,
        mapping_status: 'pending',
      },
      {
        id: 'baseline-v7-l5',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-l4',
        title: '浜や粯鏀跺熬 L5',
        source_milestone_id: 'milestone-l5',
        planned_end_date: '2026-09-28',
        sort_order: 4,
        mapping_status: 'mapped',
        is_milestone: true,
      },
    ],
  },
}

const currentLock = {
  lock: {
    id: 'lock-v7',
    project_id: projectId,
    draft_type: 'baseline',
    resource_id: 'baseline-v7',
    locked_by: 'user-1',
    locked_at: '2026-04-15T08:30:00.000Z',
    lock_expires_at: '2099-04-15T09:00:00.000Z',
    is_locked: true,
    version: 1,
    created_at: '2026-04-15T08:30:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
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

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: currentVersions })
  }

  if (pathname === '/api/task-baselines/baseline-v7') {
    return json({ success: true, data: currentDetails['baseline-v7'] })
  }

  if (pathname === '/api/task-baselines/baseline-v6') {
    return json({ success: true, data: currentDetails['baseline-v6'] })
  }

  if (pathname === '/api/task-baselines/baseline-v7/lock') {
    return json({ success: true, data: currentLock })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/baseline`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('baseline-info-bar').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-version-switcher').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-diff-preview').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-open-revision-pool').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/planning/baseline'), `Unexpected Baseline URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-baseline-page.png'), fullPage: true })

    await page.getByTestId('baseline-version-chip-baseline-v6').click()
    await page.getByTestId('baseline-info-bar').getByText('只读查看态').first().waitFor({ state: 'visible', timeout: 10000 })

    const revisionPoolButton = page.getByTestId('baseline-open-revision-pool')
    await revisionPoolButton.scrollIntoViewIfNeeded()
    try {
      await revisionPoolButton.click()
    } catch {
      await revisionPoolButton.click({ force: true })
    }
    await page.waitForURL(`**/projects/${projectId}/planning/revision-pool`, { timeout: 10000 })
    await page.getByTestId('baseline-revision-source-entry').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('baseline-revision-source-entry').click()
    await page.getByTestId('baseline-revision-pool-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'planning-baseline-revision-dialog.png'), fullPage: true })
    const revisionPoolUrl = page.url()

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      revisionPoolUrl,
      revisionDialogVisible: true,
      readonlyVersionVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-baseline-page.png'),
        revisionDialog: join(outputDir, 'planning-baseline-revision-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-baseline-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-baseline-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
