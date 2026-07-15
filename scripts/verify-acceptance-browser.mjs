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
  name: '验收时间轴联调项',
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
    type_name: '地基与基础验收',
    type_color: '#2563eb',
    acceptance_type: 'pre_acceptance',
    acceptance_name: '地基与基础验收',
    plan_name: '地基与基础验收',
    description: '基础分部验收准备就绪',
    planned_date: '2026-05-12',
    actual_date: null,
    building_id: '1#楼',
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
    display_badges: ['资料缺失'],
    overlay_tags: ['资料缺失'],
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
    type_name: '竣工验收备案',
    type_color: '#16a34a',
    acceptance_type: 'completion_record',
    acceptance_name: '竣工验收备案',
    plan_name: '竣工验收备案',
    description: '最终备案阶',
    planned_date: '2026-08-20',
    actual_date: null,
    building_id: '1#楼',
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
    display_badges: ['前置未满'],
    overlay_tags: ['前置未满'],
    is_blocked: true,
    block_reason_summary: '等待前序验收完成',
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
    description: '完成验收资料盖章',
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
    content: '监理已完成现场检',
    operator: '项目经理',
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
    title: '验收资料未齐',
    description: '资料准备度不足，需补齐盖章文件',
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

export function resolveAcceptanceProjectId({
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
  projectId = resolveAcceptanceProjectId({ manifest })
  return projectId
}

export function extractAcceptanceListRowTitle(rowText) {
  const ignored = new Set([
    '责任单位',
    '并行组',
    '阻塞数',
    '草稿',
    '准备中',
    '进行中',
    '已通过',
    '未开始',
    '已排期',
    '系统项',
    '自定义',
    '专项',
    '施工验收',
    '标记通过',
    '—',
    '验',
  ])
  const lines = String(rowText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const metadataIndex = lines.findIndex((line) => line.includes(' · '))
  if (metadataIndex > 0) {
    const titleBeforeMetadata = lines[metadataIndex - 1]
    if (!/^\d+$/.test(titleBeforeMetadata)) {
      return titleBeforeMetadata
    }
  }

  return lines.find((line) => (
    !ignored.has(line)
    && !/^\d+$/.test(line)
    && !line.includes(' · ')
  )) ?? ''
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

  if (pathname === `/api/projects/${projectId}/bootstrap`) {
    return json({
      success: true,
      data: {
        project: mockProject,
        tasks: [],
        risks: [],
        conditions: [],
        obstacles: [],
        warnings: mockWarnings,
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (
    pathname === '/api/tasks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
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
    const firstListRow = page.locator('[data-testid^="acceptance-list-row-"]').first()
    await firstListRow.waitFor({ state: 'visible', timeout: 10000 })
    const selectedPlanRowText = await firstListRow.innerText()
    const selectedPlanTitle = extractAcceptanceListRowTitle(selectedPlanRowText)
    assert(selectedPlanTitle, `Unable to resolve acceptance plan title from first row: ${JSON.stringify(selectedPlanRowText)}`)
    await page.screenshot({ path: join(outputDir, 'acceptance-page-list.png'), fullPage: true })

    await firstListRow.click()
    await page.getByTestId('acceptance-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    const drawerText = await page.getByTestId('acceptance-detail-drawer').innerText()
    assert(drawerText.includes(selectedPlanTitle), `Acceptance detail drawer missing selected plan title: ${selectedPlanTitle}`)
    await page.screenshot({ path: join(outputDir, 'acceptance-page-detail.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      selectedPlanTitle,
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
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'acceptance-page-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      pageBodyText,
      failureScreenshot,
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
