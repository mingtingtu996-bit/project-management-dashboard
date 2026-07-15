import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  isIgnorableBrowserConsoleError,
  primeBrowserAuth,
  readFullAppTestManifest,
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
  name: 'WBS 模板联调项目',
  description: 'WBS templates browser verification fixture project',
  status: '已完成',
  created_at: now,
  updated_at: now,
}

const templates = [
  {
    id: 'template-public',
    name: '公共建筑（学校/医院）WBS模板',
    description: '学校、医院及其他公共建筑工程模板',
    template_type: '公共建筑',
    node_count: 18,
    reference_days: 794,
    template_data: [
      {
        title: '主体结构',
        reference_days: 120,
        children: [
          { title: '主体框架/框剪结构施工', reference_days: 124, children: [] },
        ],
      },
    ],
  },
  {
    id: 'template-commercial',
    name: '商业办公综合体（塔楼+裙房）WBS模板',
    description: '商业办公综合体模板',
    template_type: '商业',
    node_count: 22,
    reference_days: 842,
    template_data: [
      {
        title: '地上主体结构',
        reference_days: 110,
        children: [
          { title: '塔楼核心筒/框架结构', reference_days: 112, children: [] },
        ],
      },
    ],
  },
]

const qualityReports = {
  'template-public': {
    template_id: 'template-public',
    template_name: '公共建筑（学校/医院）WBS模板',
    updated_count: 0,
    nodes: [
      {
        path: '主体结构/主体框架/框剪结构施工',
        title: '主体框架/框剪结构施工',
        is_leaf: true,
        sample_count: 12,
        mean_days: 126,
        median_days: 124,
        current_reference_days: 124,
        suggested_reference_days: 126,
      },
    ],
    feedback: {
      completed_project_count: 3,
      sample_task_count: 42,
      node_count: 18,
    },
  },
  'template-commercial': {
    template_id: 'template-commercial',
    template_name: '商业办公综合体（塔楼+裙房）WBS模板',
    updated_count: 0,
    nodes: [
      {
        path: '地上主体结构/塔楼核心筒/框架结构',
        title: '塔楼核心筒/框架结构',
        is_leaf: true,
        sample_count: 16,
        mean_days: 118,
        median_days: 116,
        current_reference_days: 112,
        suggested_reference_days: 118,
      },
    ],
    feedback: {
      completed_project_count: 4,
      sample_task_count: 56,
      node_count: 22,
    },
  },
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

export function resolveWbsTemplatesProjectId({
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
  projectId = resolveWbsTemplatesProjectId({ manifest })
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

function buildMockResponse(urlString, method) {
  const url = new URL(urlString)
  const { pathname, searchParams } = url

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      authenticated: true,
      user: {
        id: 'user-1',
        username: 'zhangsan',
        display_name: '张三',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === `/api/projects/${projectId}/critical-path`) {
    return json({
      success: true,
      data: {
        projectId,
        autoTaskIds: [],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: null,
        alternateChains: [],
        displayTaskIds: [],
        edges: [],
        tasks: [],
        projectDurationDays: 0,
      },
    })
  }

  if (pathname === '/api/planning/wbs-templates') {
    return json({ success: true, data: templates })
  }

  if (pathname === '/api/planning/wbs-templates/bootstrap/context') {
    return json({
      success: true,
      data: {
        guide: {
          mode: 'template_to_baseline',
          project_id: projectId,
          title: '计划编制启用与 WBS 模板',
          subtitle: '选择显式默认主计划入口模板，生成需复核的项目候选基线。',
          quickActions: [],
          checklist: [],
          learnMore: { title: '四层时间线', sections: [] },
        },
      },
    })
  }

  if (pathname === '/api/wbs-template-governance/template-public/reference-days') {
    return json({ success: true, data: qualityReports['template-public'] })
  }

  if (pathname === '/api/wbs-template-governance/template-commercial/reference-days') {
    return json({ success: true, data: qualityReports['template-commercial'] })
  }

  if (pathname === '/api/wbs-template-governance/template-commercial/reference-days/confirm' && method === 'POST') {
    return json({
      success: true,
      data: {
        template_id: 'template-commercial',
        reference_days: 118,
        template_data: templates[1].template_data,
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

  if (searchParams.get('project_id') === projectId && pathname.startsWith('/api/planning/wbs-templates')) {
    return json({ success: true, data: templates })
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
  let page = null
  let pageBodyText = null
  let failureScreenshot = null

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page)

    await page.addInitScript((seenKey) => {
      window.localStorage.setItem(seenKey, '1')
    }, `planning:wbs:onboarding:seen:${projectId}`)

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
      const requestMethod = route.request().method().toUpperCase()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl, requestMethod))
        return
      }

      const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
      try {
        const response = await route.fetch({ url: forwardUrl })
        const responseBody = response.status() >= 400 ? await response.text() : undefined
        if (response.status() >= 400) {
          recordApiFailure(apiFailures, {
            type: 'proxy-response',
            url: forwardUrl,
            status: response.status(),
            statusText: response.statusText(),
            body: responseBody ? responseBody.slice(0, 2000) : '',
          })
        }
        await route.fulfill(responseBody === undefined ? { response } : { response, body: responseBody })
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
    await page.getByTestId('task-list-generate-tasks').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'embedded-template-entry.png'), fullPage: true })
    await page.getByTestId('task-list-generate-tasks').click()
    await page.getByTestId('planning-modeling-workbench-dialog').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('heading', { name: '新建项目' }).waitFor({ state: 'visible', timeout: 20000 })
    await page.screenshot({ path: join(outputDir, 'embedded-template-modeling-workbench.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      projectId,
      initialUrl,
      canonicalTaskListRouteActive: initialUrl.includes(`/projects/${projectId}/gantt`),
      embeddedTemplateEntryVisible: true,
      modelingWorkbenchVisible: true,
      modelingWizardVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        entry: join(outputDir, 'embedded-template-entry.png'),
        modelingWorkbench: join(outputDir, 'embedded-template-modeling-workbench.png'),
      },
    }

    await writeFile(join(outputDir, 'wbs-templates-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText({ timeout: 2000 })
      } catch {
        pageBodyText = null
      }
      try {
        failureScreenshot = join(outputDir, 'wbs-templates-failure.png')
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
    await writeFile(join(outputDir, 'wbs-templates-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
