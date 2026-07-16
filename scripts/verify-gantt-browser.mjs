import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const TEXT = {
  taskTitle: process.env.BROWSER_VERIFY_TASK_TITLE || '主体结构施工',
  taskAssignee: process.env.BROWSER_VERIFY_TASK_ASSIGNEE || '阿达是的',
  taskUnit: process.env.BROWSER_VERIFY_TASK_UNIT || '总包单位',
  newTaskTitle: process.env.BROWSER_VERIFY_NEW_TASK_TITLE || '新增现场施工任务',
}

const mockProject = {
  id: projectId,
  name: '甘特浏览器联调项目',
  description: 'Gantt browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: `${TEXT.taskTitle} - long timeline row label for visual overlap verification`,
    description: '主楼主体结构持续推进',
    status: 'in_progress',
    priority: 'high',
    progress: 48,
    start_date: '2026-03-11',
    end_date: '2026-06-30',
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    assignee_name: TEXT.taskAssignee,
    assignee_user_id: 'user-1',
    participant_unit_name: TEXT.taskUnit,
    specialty_type: 'structure',
    is_milestone: false,
    wbs_code: '1.1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: 'Construction drawing review completion and handover coordination package',
    description: 'Long label stress row',
    status: 'todo',
    priority: 'medium',
    progress: 0,
    start_date: '2026-02-22',
    end_date: '2026-03-14',
    planned_start_date: '2026-02-22',
    planned_end_date: '2026-03-14',
    assignee_name: '王工',
    participant_unit_name: '业主工程管理部',
    specialty_type: 'design',
    is_milestone: false,
    wbs_code: '1.2.1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-3',
    project_id: projectId,
    title: 'Basement structure construction with extended contractor and owner labels',
    description: 'Long label stress row',
    status: 'in_progress',
    priority: 'high',
    progress: 65,
    start_date: '2026-03-21',
    end_date: '2026-05-30',
    planned_start_date: '2026-03-21',
    planned_end_date: '2026-05-30',
    assignee_name: '王工',
    participant_unit_name: '中建一局总包项目部',
    specialty_type: 'structure',
    is_milestone: false,
    wbs_code: '2.1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'task-4',
    project_id: projectId,
    title: 'Mechanical and electrical pipeline pre-embedding milestone coordination',
    description: 'Long label stress row',
    status: 'todo',
    priority: 'high',
    progress: 10,
    start_date: '2026-04-20',
    end_date: '2026-07-04',
    planned_start_date: '2026-04-20',
    planned_end_date: '2026-07-04',
    assignee_name: '陈设总',
    participant_unit_name: '华东建筑设计院',
    specialty_type: 'mep',
    is_milestone: false,
    wbs_code: '3.1',
    created_at: now,
    updated_at: now,
  },
]

const mockTask = mockTasks[0]

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: ['task-1'],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: ['task-1'],
    totalDurationDays: 112,
    displayLabel: '主关键路径',
  },
  alternateChains: [],
  displayTaskIds: ['task-1'],
  edges: [],
  tasks: [
    {
      taskId: 'task-1',
      title: TEXT.taskTitle,
      floatDays: 0,
      durationDays: 112,
      isAutoCritical: true,
      isManualAttention: false,
      isManualInserted: false,
      chainIndex: 0,
    },
  ],
  projectDurationDays: 112,
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

export function resolveGanttProjectId({
  envProjectId = process.env.PROJECT_ID,
  mockApi = shouldUseMockApi,
  currentProjectId = projectId,
  manifest,
} = {}) {
  if (envProjectId || mockApi) {
    return currentProjectId
  }

  const manifestProjectId = manifest?.projects?.standard?.id || manifest?.projects?.large?.id || manifest?.projects?.empty?.id
  assert(manifestProjectId, 'MOCK_API=false requires a project id in .tmp/full-app-test-env/manifest.json')
  return manifestProjectId
}

export function resolveGanttDetailTarget({
  mockApi = shouldUseMockApi,
  fixtureTitle = TEXT.taskTitle,
  fixtureAssignee = TEXT.taskAssignee,
  firstVisibleTitle,
  explicitFixtureTitle = Boolean(process.env.BROWSER_VERIFY_TASK_TITLE),
  explicitFixtureAssignee = Boolean(process.env.BROWSER_VERIFY_TASK_ASSIGNEE),
} = {}) {
  return {
    title: mockApi || explicitFixtureTitle ? fixtureTitle : firstVisibleTitle,
    expectedAssignee: mockApi || explicitFixtureAssignee ? fixtureAssignee : null,
  }
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId
  const manifest = await readFullAppTestManifest()
  projectId = resolveGanttProjectId({ manifest })
  return projectId
}

export function recordApiFailure(apiFailures, failure) {
  const normalized = {
    type: failure.type || 'response',
    url: failure.url,
    status: failure.status,
    statusText: failure.statusText,
    message: failure.message,
    body: failure.body,
    code: failure.code,
    details: failure.details,
  }
  const key = JSON.stringify(normalized)
  if (!apiFailures.some((item) => JSON.stringify(item) === key)) {
    apiFailures.push(normalized)
  }
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
}

async function detectTimelineOverlap(page) {
  return page.evaluate(() => {
    function rectOf(element) {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }

    function overlaps(a, b) {
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return horizontal > 2 && vertical > 2
    }

    const issues = []
    const rows = Array.from(document.querySelectorAll('[id^="gantt-task-row-"]'))
      .filter((element) => element instanceof HTMLElement)

    for (const row of rows) {
      const rowRect = rectOf(row)
      const cells = Array.from(row.children).filter((element) => element instanceof HTMLElement)
      for (const cell of cells) {
        const cellRect = rectOf(cell)
        if (
          cellRect.left < rowRect.left - 2
          || cellRect.right > rowRect.right + 2
          || cellRect.top < rowRect.top - 2
          || cellRect.bottom > rowRect.bottom + 2
        ) {
          issues.push({
            type: 'timeline-cell-outside-row',
            row: row.id,
            text: String(cell.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            cellRect,
            rowRect,
          })
        }
      }

      for (let index = 0; index < cells.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < cells.length; nextIndex += 1) {
          const left = rectOf(cells[index])
          const right = rectOf(cells[nextIndex])
          if (overlaps(left, right)) {
            issues.push({
              type: 'timeline-cell-overlap',
              row: row.id,
              leftText: String(cells[index].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              rightText: String(cells[nextIndex].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              left,
              right,
            })
          }
        }
      }
    }

    return issues
  })
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

export function buildMockResponse(urlString, method = 'GET', postData = null) {
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

  if (pathname === '/api/tasks') {
    if (method === 'POST') {
      const draft = postData ? JSON.parse(postData) : {}
      return json({
        success: true,
        data: {
          id: 'task-created-browser-check',
          project_id: projectId,
          title: draft.title || TEXT.newTaskTitle,
          description: draft.description ?? '',
          status: draft.status || 'todo',
          priority: draft.priority || 'medium',
          progress: draft.progress ?? 0,
          start_date: draft.start_date,
          end_date: draft.end_date,
          planned_start_date: draft.planned_start_date ?? draft.start_date,
          planned_end_date: draft.planned_end_date ?? draft.end_date,
          assignee_name: draft.assignee ?? '',
          assignee_user_id: draft.assignee_user_id ?? null,
          participant_unit_id: draft.participant_unit_id ?? null,
          participant_unit_name: draft.participant_unit_name ?? null,
          parent_id: draft.parent_id ?? null,
          dependencies: draft.dependencies ?? [],
          is_milestone: false,
          version: 1,
          created_at: now,
          updated_at: now,
        },
      }, 201)
    }
    return json({ success: true, data: mockTasks })
  }

  if (pathname === '/api/data-quality/live-check') {
    return json({ success: true, data: { count: 0, summary: '当前草稿未发现交叉矛盾。', items: [] } })
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

  if (pathname === `/api/members/${projectId}/me`) {
    return json({
      success: true,
      data: {
        permissionLevel: 'owner',
        globalRole: 'company_admin',
        canManageTeam: true,
        canEdit: true,
      },
    })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({
      success: true,
      members: [
        {
          userId: 'user-1',
          displayName: TEXT.taskAssignee,
          permissionLevel: 'owner',
        },
      ],
    })
  }

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/refresh`) {
    return json({ success: true, data: mockCriticalPathSnapshot })
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
    await primeBrowserAuth(page)

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('response', (response) => {
      if (!response.url().includes('/api/') || response.status() < 400) return
      recordApiFailure(apiFailures, {
        type: 'response',
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      })
    })

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const requestUrl = route.request().url()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl, route.request().method(), route.request().postData()))
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/gantt`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 20000 })
    const taskTitleButtons = page.getByTestId('gantt-task-title-inline-edit-trigger')
    const firstVisibleTaskTitleButton = taskTitleButtons.first()
    await firstVisibleTaskTitleButton.waitFor({ state: 'visible', timeout: 20000 })
    const firstVisibleTaskTitle = (await firstVisibleTaskTitleButton.innerText()).trim()
    const detailTarget = resolveGanttDetailTarget({ firstVisibleTitle: firstVisibleTaskTitle })
    const firstTaskTitleButton = detailTarget.title === firstVisibleTaskTitle
      ? firstVisibleTaskTitleButton
      : taskTitleButtons.filter({ hasText: detailTarget.title }).first()
    await firstTaskTitleButton.waitFor({ state: 'visible', timeout: 20000 })
    const firstTaskTitle = (await firstTaskTitleButton.innerText()).trim()
    assert(firstTaskTitle, 'Gantt first task title is empty')

    const initialUrl = page.url()
    assert(initialUrl.includes('/gantt'), `Unexpected Gantt URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'gantt-page-initial.png'), fullPage: true })

    const legacyCreateTaskCount = await page.getByTestId('gantt-create-task').count()
    assert(legacyCreateTaskCount === 0, 'v1.4.7.1 task list should not expose the legacy direct create-task button')

    const taskRows = page.getByTestId('gantt-task-rows')
    await taskRows.getByTestId('planning-start-edit').click()
    await page.getByTestId('planning-save').waitFor({ state: 'visible', timeout: 10000 })
    assert(
      await page.getByTestId('planning-save').isDisabled(),
      'Save edit should stay disabled until the task-table draft has changes',
    )
    await page.screenshot({ path: join(outputDir, 'gantt-page-after-start-draft.png'), fullPage: true })
    await page.getByTestId('planning-cancel').click()
    await taskRows.getByTestId('planning-start-edit').waitFor({ state: 'visible', timeout: 10000 })

    await firstTaskTitleButton.click()
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'visible', timeout: 10000 })

    const panelText = await page.getByTestId('gantt-task-detail-panel').innerText()
    assert(panelText.includes(firstTaskTitle), `Task detail panel missing title: ${firstTaskTitle}`)
    if (detailTarget.expectedAssignee) {
      assert(
        panelText.includes(detailTarget.expectedAssignee),
        `Task detail panel missing assignee: ${detailTarget.expectedAssignee}. Panel text: ${panelText}`,
      )
    }
    await page.screenshot({ path: join(outputDir, 'gantt-page-detail.png'), fullPage: true })

    await page.getByTestId('gantt-task-detail-panel').locator('button').first().click()
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'hidden', timeout: 10000 })
    await page.getByTestId('planning-view-gantt').click()
    await page.getByTestId('gantt-timeline-view').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('gantt-timeline-scale-day').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(outputDir, 'gantt-page-timeline-day.png'), fullPage: true })
    const timelineOverlapIssues = await detectTimelineOverlap(page)
    assert(
      timelineOverlapIssues.length === 0,
      `Gantt timeline overlap detected: ${JSON.stringify(timelineOverlapIssues.slice(0, 5))}`,
    )

    await page.getByTestId('planning-view-list').click()
    await page.getByTestId('gantt-task-rows').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('gantt-timeline-view').waitFor({ state: 'hidden', timeout: 10000 })
    const listUrl = page.url()
    assert(!listUrl.includes('view=timeline'), `Gantt list switch kept stale timeline query: ${listUrl}`)
    await page.screenshot({ path: join(outputDir, 'gantt-page-back-to-list.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      firstTaskTitle,
      detailVisible: true,
      legacyCreateTaskHidden: legacyCreateTaskCount === 0,
      taskDraftEntryVisible: true,
      timelineOverlapIssues,
      listUrl,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'gantt-page-initial.png'),
        afterStartDraft: join(outputDir, 'gantt-page-after-start-draft.png'),
        detail: join(outputDir, 'gantt-page-detail.png'),
        timelineDay: join(outputDir, 'gantt-page-timeline-day.png'),
        backToList: join(outputDir, 'gantt-page-back-to-list.png'),
      },
    }

    await writeFile(join(outputDir, 'gantt-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'gantt-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
