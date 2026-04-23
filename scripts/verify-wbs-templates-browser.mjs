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
const onboardingSeenKey = `planning:wbs:onboarding:seen:${projectId}`

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

  if (pathname === '/api/planning/wbs-templates') {
    return json({ success: true, data: templates })
  }

  if (pathname === '/api/planning/wbs-templates/bootstrap/context') {
    return json({
      success: true,
      data: {
        guide: {
          mode: 'completed_project_to_template',
          project_id: projectId,
          title: '计划编制启用与 WBS 模板',
          subtitle: '把已跑通的项目沉淀成可复用模板资产。',
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
    || pathname === '/api/delay-requests'
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

    await page.addInitScript((seenKey) => {
      window.localStorage.setItem(seenKey, '1')
    }, onboardingSeenKey)

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
        await route.fulfill(buildMockResponse(requestUrl, requestMethod))
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/wbs-templates`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('wbs-templates-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('wbs-template-list').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('wbs-template-quality-panel').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('wbs-template-card-template-public').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'wbs-templates-page.png'), fullPage: true })

    const commercialCard = page.getByTestId('wbs-template-card-template-commercial')
    await commercialCard.click()
    await commercialCard.getByRole('heading', { name: '商业办公综合体（塔楼+裙房）WBS模板' }).waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('wbs-template-selected-suggestion-count').getByText('已选 1 / 1').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('wbs-template-apply-feedback').click()
    await page.getByText('已确认采纳建议').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'wbs-templates-quality-panel.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      qualityPanelVisible: true,
      feedbackApplied: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'wbs-templates-page.png'),
        qualityPanel: join(outputDir, 'wbs-templates-quality-panel.png'),
      },
    }

    await writeFile(join(outputDir, 'wbs-templates-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'wbs-templates-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
