import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { maybeBuildMockAuthResponse, primeBrowserAuth, readFullAppTestManifest } from './browser-auth-fixture.mjs'

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
const currentMonthKey = new Date().toISOString().slice(0, 7)
const previousMonthKey = (() => {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date.toISOString().slice(0, 7)
})()

const mockProject = {
  id: projectId,
  name: '任务总结联调项目',
  description: 'Task summary browser verification fixture project',
  status: 'active',
  current_phase: 'construction',
  planned_start_date: '2026-03-01',
  planned_end_date: '2026-12-31',
  created_at: now,
  updated_at: now,
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: '主体结构施工',
    status: 'completed',
    progress: 100,
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    start_date: '2026-03-11',
    end_date: '2026-06-28',
    assignee_name: '阿达是的',
    assignee_user_id: 'user-1',
    created_at: now,
    updated_at: now,
  },
]

const mockTaskSummary = {
  stats: {
    total_completed: 12,
    on_time_count: 10,
    delayed_count: 2,
    completed_milestone_count: 3,
    avg_delay_days: 1.8,
  },
  groups: [
    {
      id: 'group-1',
      name: 'Milestone A',
      status: 'completed',
      completed_at: '2026-04-08',
      planned_end_date: '2026-04-06',
      tasks: [
        {
          id: 'task-1',
          title: '施工图会审',
          assignee: '陈工',
          participant_unit_name: '总包单位',
          specialty_type: '机电安装',
          division_name: '主体结构',
          subdivision_name: '结构施工',
          building_name: '1#楼',
          region_name: '东区',
          planned_end_date: '2026-04-06',
          completed_at: '2026-04-08',
          status_label: 'delayed',
          delay_total_days: 2,
          delay_records: [
            {
              delay_days: 2,
              reason: '施工图复核意见闭合较计划延后',
              recorded_at: '2026-04-07',
            },
          ],
        },
      ],
    },
    {
      id: 'group-2',
      name: 'Milestone B',
      status: 'completed',
      completed_at: '2026-04-12',
      planned_end_date: '2026-04-12',
      tasks: [
        {
          id: 'task-2',
          title: '主体结构验收',
          assignee: '李工',
          specialty_type: '机电安装',
          division_name: '主体结构',
          subdivision_name: '结构施工',
          building_name: '1#楼',
          region_name: '东区',
          planned_end_date: '2026-04-12',
          completed_at: '2026-04-12',
          status_label: 'on_time',
          delay_total_days: 0,
        },
      ],
    },
  ],
  attribution_groups: [
    {
      id: 'division-main',
      dimension: 'division',
      dimensionLabel: '分部工程',
      value: '主体结构',
      source: 'wbs',
      sourceId: 'division-main',
      taskIds: ['task-1', 'task-2'],
      taskCount: 2,
      onTimeCount: 1,
      delayedCount: 1,
      recentCompletedAt: '2026-04-12',
      sortOrder: 1,
    },
    {
      id: 'subdivision-structure',
      dimension: 'subdivision',
      dimensionLabel: '分项工程',
      value: '结构施工',
      source: 'wbs',
      sourceId: 'subdivision-structure',
      taskIds: ['task-1', 'task-2'],
      taskCount: 2,
      onTimeCount: 1,
      delayedCount: 1,
      recentCompletedAt: '2026-04-12',
      sortOrder: 1,
    },
    {
      id: 'specialty-mep',
      dimension: 'specialty',
      dimensionLabel: '专项工程',
      value: '机电安装',
      source: 'scope_dimension',
      sourceId: 'specialty-mep',
      taskIds: ['task-1', 'task-2'],
      taskCount: 2,
      onTimeCount: 1,
      delayedCount: 1,
      recentCompletedAt: '2026-04-12',
      sortOrder: 1,
    },
    {
      id: 'building-1',
      dimension: 'building',
      dimensionLabel: '楼栋',
      value: '1#楼',
      source: 'scope_dimension',
      sourceId: 'building-1',
      taskIds: ['task-1', 'task-2'],
      taskCount: 2,
      onTimeCount: 1,
      delayedCount: 1,
      recentCompletedAt: '2026-04-12',
      sortOrder: 1,
    },
    {
      id: 'region-east',
      dimension: 'region',
      dimensionLabel: '区域',
      value: '东区',
      source: 'scope_dimension',
      sourceId: 'region-east',
      taskIds: ['task-1', 'task-2'],
      taskCount: 2,
      onTimeCount: 1,
      delayedCount: 1,
      recentCompletedAt: '2026-04-12',
      sortOrder: 1,
    },
    {
      id: 'participant-unit-main',
      dimension: 'participant_unit',
      dimensionLabel: '责任单位',
      value: '总包单位',
      source: 'participant_unit',
      sourceId: 'unit-main',
      taskIds: ['task-1'],
      taskCount: 1,
      onTimeCount: 0,
      delayedCount: 1,
      recentCompletedAt: '2026-04-08',
      sortOrder: 1,
    },
    {
      id: 'assignee-chen',
      dimension: 'assignee',
      dimensionLabel: '责任人',
      value: '陈工',
      source: 'project_member',
      sourceId: 'user-chen',
      taskIds: ['task-1'],
      taskCount: 1,
      onTimeCount: 0,
      delayedCount: 1,
      recentCompletedAt: '2026-04-08',
      sortOrder: 1,
    },
  ],
  timeline_events: [
    {
      id: 'evt-condition-1',
      kind: 'condition',
      title: '施工图会签完成',
      description: '开工条件由未满足调整为已满足',
      occurredAt: '2026-04-07T08:00:00.000Z',
      taskId: 'task-1',
      statusLabel: 'Satisfied',
    },
    {
      id: 'evt-obstacle-1',
      kind: 'obstacle',
      title: '图纸复核意见闭合',
      description: '阻碍由处理中调整为已解决',
      occurredAt: '2026-04-07T11:00:00.000Z',
      taskId: 'task-1',
      statusLabel: 'Resolved',
    },
  ],
  timeline_ready: true,
}

const mockTaskSummaryAssignees = [
  {
    assignee: '阿达是的',
    total: 4,
    on_time: 3,
    delayed: 1,
    on_time_rate: 75,
  },
  {
    assignee: '李工',
    total: 3,
    on_time: 3,
    delayed: 0,
    on_time_rate: 100,
  },
]

const mockTaskSummaryTrend = [
  { month: previousMonthKey, total: 8, on_time: 6, delayed: 2 },
  { month: currentMonthKey, total: 12, on_time: 10, delayed: 2 },
]

const mockDailyProgress = {
  date: '2026-04-24',
  progress_change: 3.2,
  tasks_updated: 2,
  tasks_completed: 1,
  details: [
    {
      task_id: 'task-1',
      task_title: '主体结构施工',
      progress_before: 97,
      progress_after: 100,
      progress_delta: 3,
      assignee: '阿达是的',
    },
  ],
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  const manifestProjectId = manifest.projects?.standard?.id ?? manifest.projects?.large?.id ?? manifest.projects?.empty?.id
  assert(manifestProjectId, 'Full-app manifest does not contain a project id')
  projectId = manifestProjectId
  return projectId
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

  if (pathname === `/api/projects/${projectId}/bootstrap`) {
    return json({
      success: true,
      data: {
        project: mockProject,
        tasks: mockTasks,
        risks: [],
        conditions: [],
        obstacles: [],
        warnings: [],
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: mockTasks })
  }

  if (
    pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary`) {
    return json({ success: true, data: mockTaskSummary })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/trend`) {
    return json({ success: true, data: mockTaskSummaryTrend })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/duration-forecasts`) {
    return json({
      success: true,
      data: {
        projectId,
        asOfDate: now.slice(0, 10),
        dimensions: {
          division: [],
          subdivision: [],
          specialty: [],
          building: [],
          region: [],
          phase: [],
          section: [],
          floor: [],
          participant_unit: [],
          assignee: [],
        },
        summary: {
          groupCount: 0,
          readyCount: 0,
          degradedCount: 0,
          insufficientDataCount: 0,
        },
      },
    })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/assignees`) {
    return json({ success: true, data: mockTaskSummaryAssignees })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/task-summary/compare`) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/task-summaries/projects/${projectId}/daily-progress`) {
    return json({ success: true, data: mockDailyProgress })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  await resolveProjectId()

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    page.setDefaultTimeout(30000)
    const browserAuthToken = await primeBrowserAuth(page)

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
        const headers = { ...route.request().headers() }
        if (browserAuthToken) {
          headers.authorization = `Bearer ${browserAuthToken}`
        }
        const response = await route.fetch({ url: forwardUrl, headers })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/task-summary`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-summary-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('task-summary-results-section').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('task-summary-summary-list-section').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/task-summary'), `Unexpected TaskSummary URL: ${initialUrl}`)

    const resultsText = await page.getByTestId('task-summary-results-section').innerText()
    assert(
      resultsText.includes('完成任务') && resultsText.includes('按时完成率') && resultsText.includes('本月完成') && resultsText.includes('较上月'),
      'TaskSummary results section did not render metric cards',
    )

    const summaryText = await page.getByTestId('task-summary-summary-list-section').innerText()
    assert(summaryText.includes('总结列表'), 'TaskSummary summary list title did not render')
    assert(
      summaryText.includes('分部工程')
        && summaryText.includes('分项工程')
        && summaryText.includes('专项工程')
        && summaryText.includes('责任单位')
        && summaryText.includes('责任人'),
      'TaskSummary attribution dimension tabs did not render',
    )
    assert(await page.getByPlaceholder('搜索归属、任务、责任人...').count() === 1, 'TaskSummary summary list search input did not render')
    assert(await page.getByTestId('task-summary-attribution-trigger').count() === 0, 'TaskSummary attribution trigger should be removed')
    assert(!(await page.locator('body').innerText()).includes('查看'), 'TaskSummary rows should not render task process shortcut buttons')
    assert(!(await page.locator('body').innerText()).includes('月度兑现'), 'TaskSummary should not render monthly fulfillment')

    if (shouldUseMockApi) {
      const divisionRow = page.getByTestId('task-summary-attribution-row-division-main')
      await divisionRow.waitFor({ state: 'visible', timeout: 20000 })
      const divisionRowText = await divisionRow.innerText()
      assert(
        divisionRowText.includes('主体结构') && divisionRowText.includes('任务 2/2') && divisionRowText.includes('按时率'),
        'TaskSummary attribution ledger card did not render expected summary fields',
      )
      assert(
        summaryText.includes('完成任务') && summaryText.includes('按时') && summaryText.includes('延期'),
        'TaskSummary summary list did not render attribution footer totals',
      )

      await divisionRow.click()
      const attributionText = await page.getByTestId('task-summary-attribution-panel').innerText()
      const attributionDetailText = await page.getByTestId('task-summary-attribution-row-division-main-detail').innerText()
      assert(
        attributionText.includes('归属完成复盘') && attributionText.includes('分部工程 · 主体结构'),
        'TaskSummary attribution replay panel did not render selected attribution',
      )
      assert(
        attributionText.includes('归属完成过程') && attributionText.includes('完成收口') && attributionDetailText.includes('所含任务明细台账'),
        'TaskSummary attribution replay panel did not render process compression and detail ledger handoff',
      )

      await page.getByTestId('task-summary-row-task-1').click()
      const detailText = await page.getByTestId('task-summary-detail-panel').innerText()
      assert(
        detailText.includes('完成结果') && detailText.includes('变化摘要') && detailText.includes('完成过程') && detailText.includes('过程结论'),
        'TaskSummary detail panel did not render process replay sections',
      )
      assert(detailText.includes('开工条件') && detailText.includes('阻碍处理') && detailText.includes('并行'), 'TaskSummary detail panel did not render grouped process events')
      assert(detailText.includes('延期说明') && detailText.includes('施工图复核意见闭合较计划延后'), 'TaskSummary detail panel did not render completion result delay reason')
      assert(detailText.includes('Satisfied') && detailText.includes('Resolved'), 'TaskSummary detail panel should render source process status labels')

      await page.getByRole('tab', { name: '专项工程' }).click()
      assert((await page.getByTestId('task-summary-summary-list-section').innerText()).includes('机电安装'), 'TaskSummary specialty ledger did not render after tab switch')
    } else {
      const attributionRows = page.locator('[data-testid^="task-summary-attribution-row-"]')
      assert(await attributionRows.count() > 0, 'TaskSummary attribution ledger rows did not render')
      const firstAttributionRow = attributionRows.first()
      const firstAttributionRowTestId = await firstAttributionRow.getAttribute('data-testid')
      assert(Boolean(firstAttributionRowTestId), 'TaskSummary attribution row should expose data-testid for expanded detail')
      await firstAttributionRow.click()
      const attributionText = await page.getByTestId('task-summary-attribution-panel').innerText()
      const attributionDetailText = await page.getByTestId(`${firstAttributionRowTestId}-detail`).innerText()
      assert(
        attributionText.includes('归属完成复盘') && attributionText.includes('归属完成过程') && attributionDetailText.includes('所含任务明细台账'),
        'TaskSummary attribution replay panel did not render for real project data',
      )
      assert(await page.getByTestId('task-summary-export').count() === 1, 'TaskSummary export action did not render')
    }

    await page.screenshot({ path: join(outputDir, 'task-summary-page.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      resultsSectionVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'task-summary-page.png'),
      },
    }

    await writeFile(join(outputDir, 'task-summary-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'task-summary-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
