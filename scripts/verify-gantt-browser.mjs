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

const TEXT = {
  taskTitle: '涓讳綋缁撴瀯鏂藉伐',
  taskAssignee: '闃胯揪鏄殑',
  taskUnit: '鎬诲寘鍗曚綅',
}

const mockProject = {
  id: projectId,
  name: '甘特浏览器联调项目',
  description: 'Gantt browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockTask = {
  id: 'task-1',
  project_id: projectId,
  title: TEXT.taskTitle,
  description: '涓绘ゼ涓讳綋缁撴瀯鎸佺画鎺ㄨ繘',
  status: 'in_progress',
  priority: 'high',
  progress: 48,
  start_date: '2026-03-11',
  end_date: '2026-06-30',
  planned_start_date: '2026-03-11',
  planned_end_date: '2026-06-30',
  assignee_name: TEXT.taskAssignee,
  assignee_user_id: 'user-1',
  assignee_unit: TEXT.taskUnit,
  responsible_unit: TEXT.taskUnit,
  specialty_type: 'structure',
  is_milestone: false,
  wbs_code: '1.1',
  created_at: now,
  updated_at: now,
}

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

const participantUnitsPayload = [
  {
    id: 'unit-1',
    project_id: projectId,
    unit_name: '总包单位',
    unit_type: '土建',
    contact_name: '王工',
    contact_role: '项目经理',
    contact_phone: '13800000000',
    contact_email: 'wang@example.com',
    version: 1,
    created_at: now,
    updated_at: now,
  },
]

const scopeDimensionsPayload = {
  project_id: projectId,
  sections: [
    {
      key: 'building',
      label: '建筑维度',
      description: '楼栋 / 建筑类型',
      options: ['1#楼', '2#楼'],
      selected: ['1#楼'],
    },
    {
      key: 'specialty',
      label: '专业维度',
      description: '专项工程 / 专业分类',
      options: ['结构', '机电', '幕墙'],
      selected: ['结构'],
    },
    {
      key: 'phase',
      label: '阶段维度',
      description: '项目阶段 / 里程碑阶段',
      options: ['主体施工', '装饰装修'],
      selected: ['主体施工'],
    },
    {
      key: 'region',
      label: '区域维度',
      description: '片区 / 标段 / 区域分区',
      options: ['A区', 'B区'],
      selected: ['A区'],
    },
  ],
  dictionary: {
    building: ['1#楼', '2#楼'],
    specialty: ['结构', '机电', '幕墙'],
    phase: ['主体施工', '装饰装修'],
    region: ['A区', 'B区'],
  },
  rows: [
    { id: 'scope-building-1', dimension_key: 'building', label: '1#楼', is_active: true, sort_order: 1, version: 1 },
    { id: 'scope-specialty-1', dimension_key: 'specialty', label: '结构', is_active: true, sort_order: 1, version: 1 },
    { id: 'scope-phase-1', dimension_key: 'phase', label: '主体施工', is_active: true, sort_order: 1, version: 1 },
    { id: 'scope-region-1', dimension_key: 'region', label: 'A区', is_active: true, sort_order: 1, version: 1 },
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
    return json({ success: true, data: [mockTask] })
  }

  if (pathname === '/api/participant-units') {
    return json({ success: true, data: participantUnitsPayload })
  }

  if (pathname === '/api/scope-dimensions' || pathname === `/api/scope-dimensions/${projectId}`) {
    return json({ success: true, data: scopeDimensionsPayload })
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
  ) {
    return json({ success: true, data: [] })
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
  const authHeaderFailures = []

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
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
      const requestPath = new URL(requestUrl).pathname
      const requiresBearerAuth = [
        '/api/tasks',
        '/api/task-conditions',
        '/api/task-obstacles',
        '/api/delay-requests',
        '/api/task-baselines',
        '/api/participant-units',
        '/api/scope-dimensions',
      ].some((prefix) => requestPath.startsWith(prefix))
      const authorization = route.request().headers().authorization || ''
      if (requiresBearerAuth && authorization !== 'Bearer browser-verify-token') {
        authHeaderFailures.push({ url: requestUrl, authorization })
      }

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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/gantt`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-workspace-layer-l2').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('gantt-task-select-task-1').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/gantt'), `Unexpected Gantt URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'gantt-page-initial.png'), fullPage: true })

    await page.getByTestId('gantt-switch-timeline-view').click()
    await page.getByText('横道图视图').first().waitFor({ state: 'visible', timeout: 10000 })
    assert(page.url().includes('view=timeline'), `Timeline URL state was not written: ${page.url()}`)
    await page.screenshot({ path: join(outputDir, 'gantt-page-timeline.png'), fullPage: true })

    await page.getByTestId('gantt-switch-list-view').click()
    await page.getByTestId('gantt-task-select-task-1').waitFor({ state: 'visible', timeout: 10000 })
    assert(!page.url().includes('view=timeline'), `List view did not clear timeline URL state: ${page.url()}`)

    await page.getByRole('button', { name: '新建任务' }).click()
    const taskDialog = page.getByRole('dialog').filter({ hasText: '新建任务' })
    await taskDialog.waitFor({ state: 'visible', timeout: 10000 })
    await taskDialog.getByRole('button', { name: '高级选项' }).click()
    await taskDialog.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await taskDialog.getByRole('button', { name: /保存/ }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('gantt-task-participant-unit-select').click()
    await page.getByRole('option', { name: '手工输入' }).click()
    await taskDialog.getByRole('button', { name: '维护台账' }).click()
    const unitDialog = page.getByRole('dialog').filter({ hasText: '参建单位台账' })
    await unitDialog.waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'gantt-participant-units-dialog.png'), fullPage: true })
    const unitDialogText = await unitDialog.innerText({ timeout: 10000 })
    assert(unitDialogText.includes('总包单位'), `Participant units dialog missing loaded unit. Text: ${unitDialogText}`)
    await page.screenshot({ path: join(outputDir, 'gantt-task-dialog-scroll.png'), fullPage: true })
    await unitDialog.getByRole('button', { name: '关闭', exact: true }).click()
    await unitDialog.waitFor({ state: 'hidden', timeout: 10000 })
    await taskDialog.getByRole('button', { name: '取消', exact: true }).click()
    await taskDialog.waitFor({ state: 'hidden', timeout: 10000 })

    await page.getByTestId('gantt-open-scope-dimensions').click()
    const scopeDialog = page.getByTestId('gantt-scope-dimensions-dialog')
    await scopeDialog.waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('建筑维度').waitFor({ state: 'visible', timeout: 10000 })
    const scopeScrollable = await scopeDialog.evaluate((node) => {
      const scrollContainer = node.querySelector('.overflow-y-auto')
      return Boolean(scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight)
    })
    assert(scopeScrollable, 'Scope dimensions dialog body is not scrollable')
    await scopeDialog.evaluate((node) => {
      const scrollContainer = node.querySelector('.overflow-y-auto')
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight
    })
    await scopeDialog.getByRole('button', { name: '保存范围' }).waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'gantt-scope-dimensions-dialog.png'), fullPage: true })
    await page.keyboard.press('Escape')

    await page.getByTestId('gantt-task-select-task-1').click()
    await page.getByTestId('gantt-task-detail-panel').waitFor({ state: 'visible', timeout: 10000 })

    const panelText = await page.getByTestId('gantt-task-detail-panel').innerText()
    assert(panelText.includes(TEXT.taskTitle), `Task detail panel missing title: ${TEXT.taskTitle}`)
    assert(panelText.includes(TEXT.taskAssignee), `Task detail panel missing assignee: ${TEXT.taskAssignee}`)
    await page.screenshot({ path: join(outputDir, 'gantt-page-detail.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(authHeaderFailures.length === 0, `API auth headers missing: ${JSON.stringify(authHeaderFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      viewSwitchVerified: true,
      taskDialogFooterReachable: true,
      participantUnitsLoaded: true,
      scopeDimensionsScrollable: true,
      detailVisible: true,
      apiFailures,
      authHeaderFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'gantt-page-initial.png'),
        timeline: join(outputDir, 'gantt-page-timeline.png'),
        taskDialog: join(outputDir, 'gantt-task-dialog-scroll.png'),
        participantUnits: join(outputDir, 'gantt-participant-units-dialog.png'),
        scopeDimensions: join(outputDir, 'gantt-scope-dimensions-dialog.png'),
        detail: join(outputDir, 'gantt-page-detail.png'),
      },
    }

    await writeFile(join(outputDir, 'gantt-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      authHeaderFailures,
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

