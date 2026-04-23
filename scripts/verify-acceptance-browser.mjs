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
  name: '楠屾敹鏃堕棿杞磋仈璋冮」鐩?',
  description: 'Acceptance timeline browser verification fixture project',
  status: 'active',
  current_phase: 'construction',
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-12-31',
  created_at: now,
  updated_at: now,
}

const mockPlans = [
  {
    id: 'plan-1',
    project_id: projectId,
    task_id: 'task-1',
    type_id: 'pre_acceptance',
    type_name: '鍦板熀涓庡熀纭€楠屾敹',
    type_color: '#2563eb',
    acceptance_type: 'pre_acceptance',
    acceptance_name: '鍦板熀涓庡熀纭€楠屾敹',
    plan_name: '鍦板熀涓庡熀纭€楠屾敹',
    description: '鍩虹鍒嗛儴楠屾敹鍑嗗灏辩华',
    planned_date: '2026-05-12',
    actual_date: null,
    building_id: '1#妤?',
    scope_level: 'building',
    participant_unit_id: 'unit-1',
    status: 'preparing',
    phase: 'preparation',
    phase_code: 'preparation',
    phase_order: 1,
    sort_order: 1,
    predecessor_plan_ids: [],
    successor_plan_ids: ['plan-2'],
    requirement_ready_percent: 80,
    upstream_unfinished_count: 0,
    downstream_block_count: 1,
    can_submit: false,
    is_overdue: false,
    days_to_due: 14,
    display_badges: ['璧勬枡缂哄け'],
    overlay_tags: ['璧勬枡缂哄け'],
    is_blocked: false,
    block_reason_summary: null,
    warning_level: 'warning',
    is_custom: false,
    documents: [],
    is_system: true,
    created_at: now,
    updated_at: now,
    created_by: 'tester',
    responsible_user_id: 'user-1',
  },
  {
    id: 'plan-2',
    project_id: projectId,
    task_id: 'task-2',
    type_id: 'completion_record',
    type_name: '绔ｅ伐楠屾敹澶囨',
    type_color: '#16a34a',
    acceptance_type: 'completion_record',
    acceptance_name: '绔ｅ伐楠屾敹澶囨',
    plan_name: '绔ｅ伐楠屾敹澶囨',
    description: '鏈€缁堝妗堥樁娈?',
    planned_date: '2026-08-20',
    actual_date: null,
    building_id: '1#妤?',
    scope_level: 'project',
    participant_unit_id: 'unit-1',
    status: 'not_started',
    phase: 'filing_archive',
    phase_code: 'filing_archive',
    phase_order: 4,
    sort_order: 4,
    predecessor_plan_ids: ['plan-1'],
    successor_plan_ids: [],
    requirement_ready_percent: 100,
    upstream_unfinished_count: 1,
    downstream_block_count: 0,
    can_submit: false,
    is_overdue: false,
    days_to_due: 60,
    display_badges: ['鍓嶇疆鏈弧瓒?'],
    overlay_tags: ['鍓嶇疆鏈弧瓒?'],
    is_blocked: true,
    block_reason_summary: '绛夊緟鍓嶅簭楠屾敹瀹屾垚',
    warning_level: 'info',
    is_custom: false,
    documents: [],
    is_system: true,
    created_at: now,
    updated_at: now,
    created_by: 'tester',
    responsible_user_id: 'user-2',
  },
]

const mockRequirements = [
  {
    id: 'req-1',
    plan_id: 'plan-1',
    requirement_type: 'external',
    source_entity_type: 'task_condition',
    source_entity_id: 'cond-1',
    description: '瀹屾垚楠屾敹璧勬枡鐩栫珷',
    status: 'open',
    created_at: now,
    updated_at: now,
  },
]

const mockDependencies = [
  {
    id: 'dep-1',
    project_id: projectId,
    source_plan_id: 'plan-1',
    target_plan_id: 'plan-2',
    dependency_type: 'strong',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
]

const mockRecords = [
  {
    id: 'record-1',
    plan_id: 'plan-1',
    record_type: 'note',
    content: '鐩戠悊宸插畬鎴愮幇鍦烘鏌?',
    operator: '椤圭洰缁忕悊',
    record_date: '2026-04-18',
    attachments: [],
    created_at: now,
    updated_at: now,
  },
]

const mockWarnings = [
  {
    id: 'warning-1',
    task_id: 'task-1',
    warning_signature: 'acceptance-warning-1',
    warning_type: 'acceptance',
    warning_level: 'warning',
    title: '楠屾敹璧勬枡鏈綈',
    description: '璧勬枡鍑嗗搴︿笉瓒筹紝闇€琛ラ綈鐩栫珷鏂囦欢',
    is_acknowledged: false,
    status: 'open',
    source_entity_type: 'acceptance_plan',
    source_entity_id: 'plan-1',
    created_at: now,
  },
]

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
  const { pathname, searchParams } = url
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
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname === '/api/delay-requests'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/acceptance-plans/flow-snapshot') {
    return json({
      success: true,
      data: {
        catalogs: [],
        plans: mockPlans,
        dependencies: mockDependencies,
        requirements: mockRequirements,
        records: mockRecords,
      },
    })
  }

  if (pathname === '/api/acceptance-plans') {
    return json({ success: true, data: mockPlans })
  }

  if (pathname === '/api/acceptance-requirements' && searchParams.get('planId') === 'plan-1') {
    return json({ success: true, data: mockRequirements })
  }

  if (pathname === '/api/acceptance-requirements') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/acceptance-dependencies' && searchParams.get('planId') === 'plan-1') {
    return json({ success: true, data: mockDependencies })
  }

  if (pathname === '/api/acceptance-dependencies') {
    return json({ success: true, data: mockDependencies })
  }

  if (pathname === '/api/acceptance-records' && searchParams.get('planId') === 'plan-1') {
    return json({ success: true, data: mockRecords })
  }

  if (pathname === '/api/acceptance-records') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/warnings') {
    return json({ success: true, data: mockWarnings })
  }

  if (pathname === '/api/issues' || pathname === '/api/risks') {
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/acceptance`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('acceptance-summary-panel').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('acceptance-filter-panel').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('acceptance-view-graph').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('acceptance-flow-board').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/acceptance'), `Unexpected AcceptanceTimeline URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'acceptance-page-graph.png'), fullPage: true })

    await page.getByTestId('acceptance-view-list').click()
    await page.getByTestId('acceptance-list-row-plan-1').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'acceptance-page-list.png'), fullPage: true })

    await page.getByTestId('acceptance-list-row-plan-1').click()
    await page.getByTestId('acceptance-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    const drawerText = await page.getByTestId('acceptance-detail-drawer').innerText()
    assert(drawerText.includes('鍦板熀涓庡熀纭€楠屾敹'), 'Acceptance detail drawer missing selected plan title')
    await page.screenshot({ path: join(outputDir, 'acceptance-page-detail.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      listViewVisible: true,
      detailDrawerVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        graph: join(outputDir, 'acceptance-page-graph.png'),
        list: join(outputDir, 'acceptance-page-list.png'),
        detail: join(outputDir, 'acceptance-page-detail.png'),
      },
    }

    await writeFile(join(outputDir, 'acceptance-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'acceptance-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
