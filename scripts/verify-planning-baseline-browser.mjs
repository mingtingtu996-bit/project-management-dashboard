import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  isIgnorableBrowserConsoleError,
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
const baselineReadyText = process.env.BROWSER_VERIFY_BASELINE_READY_TEXT || '分部工程'
const generatedBaselineItemTitle = process.env.BROWSER_VERIFY_BASELINE_GENERATED_TITLE || '新增机电安装施工'
const now = new Date().toISOString()

const mockProject = {
  id: projectId,
  name: '城市中心广场项目（二期）',
  description: 'Baseline browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const currentVersions = [
  {
    id: 'baseline-v7',
    project_id: projectId,
    version: null,
    status: 'draft',
    title: '城市中心广场项目（二期）基线',
    description: '基于 v6 生成的待发布新版快照',
    source_type: 'manual',
    source_version_id: 'baseline-v6',
    source_version_label: 'v6',
    business_version_label: '待发布新版',
    is_current_execution: false,
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  },
  {
    id: 'baseline-v6',
    project_id: projectId,
    version: 6,
    status: 'confirmed',
    title: '城市中心广场项目（二期）基线',
    description: '已确认版本',
    source_type: 'manual',
    confirmed_at: '2026-04-15T08:30:00.000Z',
    confirmed_by: 'user-1',
    business_version_label: 'v6',
    is_current_execution: true,
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
        title: '项目总进度计划 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v6-l2',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-root',
        title: '主体工程 L2',
        source_task_id: 'task-l2',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v6-l3',
        project_id: projectId,
        baseline_version_id: 'baseline-v6',
        parent_item_id: 'baseline-v6-l2',
        title: '结构施工 L3',
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
        title: '交付收尾 L5',
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
        title: '项目总进度计划 L1',
        source_task_id: 'task-root',
        sort_order: 0,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v7-l2',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-root',
        title: '主体工程 L2',
        source_task_id: 'task-l2',
        sort_order: 1,
        mapping_status: 'mapped',
      },
      {
        id: 'baseline-v7-l3',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-l2',
        title: '结构施工 L3',
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
        title: '月度收口 L4',
        source_task_id: 'task-l4',
        sort_order: 3,
        mapping_status: 'pending',
      },
      {
        id: 'baseline-v7-l5',
        project_id: projectId,
        baseline_version_id: 'baseline-v7',
        parent_item_id: 'baseline-v7-l4',
        title: '交付收尾 L5',
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

export function resolvePlanningBaselineProjectId({
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
  projectId = resolvePlanningBaselineProjectId({ manifest })
  return projectId
}

async function detectBaselineEditorOverlap(page) {
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

    function intersects(a, b) {
      const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return horizontal > 2 && vertical > 2
    }

    const inputs = Array.from(document.querySelectorAll('[data-baseline-editor-cell]'))
      .filter((element) => element instanceof HTMLElement)

    const issues = []
    for (const input of inputs) {
      const inputRect = rectOf(input)
      const row = input.closest('[style*="grid-template-columns"]')
      if (row instanceof HTMLElement) {
        const rowRect = rectOf(row)
        if (
          inputRect.left < rowRect.left - 2
          || inputRect.right > rowRect.right + 2
          || inputRect.top < rowRect.top - 2
          || inputRect.bottom > rowRect.bottom + 2
        ) {
          issues.push({
            type: 'input-outside-row',
            cell: input.getAttribute('data-baseline-editor-cell'),
            inputRect,
            rowRect,
          })
        }
      }
    }

    for (let index = 0; index < inputs.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < inputs.length; nextIndex += 1) {
        const left = inputs[index]
        const right = inputs[nextIndex]
        if (left.closest('[style*="grid-template-columns"]') !== right.closest('[style*="grid-template-columns"]')) {
          continue
        }
        const leftRect = rectOf(left)
        const rightRect = rectOf(right)
        if (intersects(leftRect, rightRect)) {
          issues.push({
            type: 'input-overlap',
            left: left.getAttribute('data-baseline-editor-cell'),
            right: right.getAttribute('data-baseline-editor-cell'),
            leftRect,
            rightRect,
          })
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
        tasks: [],
        risks: [],
        conditions: [],
        obstacles: [],
        warnings: [],
        issues: [],
        taskProgressSnapshots: [],
      },
    })
  }

  if (pathname === `/api/members/${projectId}/me`) {
    return json({
      success: true,
      data: {
        permissionLevel: 'owner',
        globalRole: 'company_admin',
        canEdit: true,
        canManageTeam: true,
      },
    })
  }

  if (
    pathname === '/api/tasks'
    || pathname === '/api/risks'
    || pathname === '/api/milestones'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
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

  if (pathname === '/api/task-baselines/generate') {
    const generatedId = 'baseline-v8'
    const generatedVersion = {
      id: generatedId,
      project_id: projectId,
      version: null,
      status: 'draft',
      title: '城市中心广场项目（二期）基线新版',
      description: '系统根据当前任务列表排期自动生成的待发布新版总进度计划。',
      source_type: 'current_schedule',
      source_version_id: 'baseline-v6',
      source_version_label: 'v6',
      business_version_label: '待发布新版',
      is_current_execution: false,
      created_at: '2026-04-16T08:00:00.000Z',
      updated_at: '2026-04-16T08:00:00.000Z',
    }
    const generatedDetail = {
      ...generatedVersion,
      items: [
        ...currentDetails['baseline-v6'].items.map((item, index) => ({
          ...item,
          id: `${generatedId}-item-${index + 1}`,
          baseline_version_id: generatedId,
          parent_item_id: item.parent_item_id
            ? `${generatedId}-item-${currentDetails['baseline-v6'].items.findIndex((candidate) => candidate.id === item.parent_item_id) + 1}`
            : undefined,
        })),
        {
          id: `${generatedId}-item-new-1`,
          project_id: projectId,
          baseline_version_id: generatedId,
          title: '新增机电安装施工',
          planned_start_date: '2026-08-01',
          planned_end_date: '2026-09-15',
          sort_order: 99,
          mapping_status: 'pending',
          notes: 'ϵͳ飺ǰбʩ°߲ݰ',
        },
      ],
    }
    currentDetails[generatedId] = generatedDetail
    if (!currentVersions.some((version) => version.id === generatedId)) {
      currentVersions.unshift(generatedVersion)
    }
    return json({ success: true, data: generatedDetail }, 201)
  }

  if (pathname === '/api/task-baselines/baseline-v7/lock') {
    return json({ success: true, data: currentLock })
  }

  if (pathname === '/api/task-baselines/baseline-v8') {
    return json({ success: true, data: currentDetails['baseline-v8'] })
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

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)
    await page.addInitScript(() => {
      const draftResumePrefix = 'planning:draft-resume:'
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(draftResumePrefix)) {
          window.localStorage.removeItem(key)
        }
      }
    })

    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableBrowserConsoleError(text)) {
          consoleErrors.push(text)
        }
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/baseline`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    const resumeDialog = page.getByTestId('planning-draft-resume-dialog')
    const hasResumeDialog = await resumeDialog.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
    if (hasResumeDialog) {
      await resumeDialog.locator('button').first().click()
      await resumeDialog.waitFor({ state: 'detached', timeout: 10000 })
    }
    await page.getByTestId('planning-layered-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-version-bar').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('baseline-tree-editor').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText(baselineReadyText).first().waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/planning/baseline'), `Unexpected Baseline URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'planning-baseline-page.png'), fullPage: true })

    assert(
      await page.getByTestId('baseline-version-switcher').count() === 0,
      'Baseline page should not render the old sticky version inspector',
    )
    assert(
      await page.getByTestId('baseline-diff-preview').count() === 0,
      'Baseline page should not render the old diff preview panel',
    )
    assert(
      await page.getByTestId('baseline-revision-record-summary').count() === 0,
      'Baseline page should not render the old revision record panel',
    )

    await page.getByTestId('baseline-open-version-records').click()
    await page.getByTestId('baseline-version-records-dialog').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText('历史基线').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText('版本差异').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText('发布留痕').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(outputDir, 'planning-baseline-records-dialog.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByTestId('baseline-version-records-dialog').waitFor({ state: 'detached', timeout: 10000 })

    await page.getByTestId('baseline-generate-draft').click()
    const validationStripVisible = await page.getByTestId('baseline-validation-strip')
      .waitFor({ state: 'visible', timeout: shouldUseMockApi ? 20000 : 3000 })
      .then(() => true)
      .catch(() => false)
    assert(
      validationStripVisible || !shouldUseMockApi,
      'Mock Baseline generation should surface validation issues',
    )
    await page.locator('[data-baseline-editor-cell]').first().waitFor({
      state: 'visible',
      timeout: shouldUseMockApi ? 10000 : 45000,
    })
    await page.getByText('总进度计划表').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('任务名称').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('计划开始').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('计划完成').first().waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('计划工期').first().waitFor({ state: 'visible', timeout: 10000 })
    assert(await page.getByText('责任单位/人').count() === 0, 'Baseline schedule table should not show assignee column')
    assert(await page.getByText('状态/差异').count() === 0, 'Baseline schedule table should not show status/diff column')
    assert(await page.getByTestId('baseline-bottom-bar').count() === 0, 'Baseline edit mode should not render a sticky bottom bar')
    if (shouldUseMockApi || process.env.BROWSER_VERIFY_GENERATED_TITLE) {
      await page.waitForFunction((title) =>
        Array.from(document.querySelectorAll('input')).some((input) => input.value === title),
      generatedBaselineItemTitle)
    } else {
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('[data-baseline-editor-cell]'))
          .some((element) => element instanceof HTMLInputElement && element.value.trim().length > 0),
      )
    }
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(outputDir, 'planning-baseline-edit-page.png'), fullPage: true })
    const editorOverlapIssues = await detectBaselineEditorOverlap(page)
    assert(
      editorOverlapIssues.length === 0,
      `Baseline editor overlap detected: ${JSON.stringify(editorOverlapIssues.slice(0, 5))}`,
    )

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      readonlyVersionVisible: true,
      versionRecordsDialogVisible: true,
      generatedBaselineEditable: true,
      validationStripVisible,
      editorOverlapIssues,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'planning-baseline-page.png'),
        records: join(outputDir, 'planning-baseline-records-dialog.png'),
        edit: join(outputDir, 'planning-baseline-edit-page.png'),
      },
    }

    await writeFile(join(outputDir, 'planning-baseline-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failureScreenshot = join(outputDir, 'planning-baseline-failure.png')
    try {
      pageBodyText = await page?.locator('body').innerText()
    } catch {}
    await page?.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {})
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      pageBodyText,
      apiFailures,
      consoleErrors,
      pageErrors,
      failureScreenshot,
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
