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
  name: '风险保护弹窗联调项目',
  description: 'Risk guard browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockRisks = [
  {
    id: 'risk-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '塔楼结构进度风险',
    description: '现场资源切换导致结构施工受限',
    source_type: 'obstacle_escalated',
    chain_id: 'chain-summary-1',
    level: 'high',
    probability: 70,
    impact: 80,
    status: 'mitigating',
    created_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
    version: 3,
  },
  {
    id: 'risk-pending',
    project_id: projectId,
    task_id: 'task-2',
    title: '待人工关闭风险',
    description: '上游来源已变化，需要人工确认是否关闭',
    source_type: 'source_deleted',
    chain_id: 'chain-pending-1',
    level: 'medium',
    probability: 45,
    impact: 55,
    status: 'mitigating',
    pending_manual_close: true,
    created_at: '2026-04-05T00:00:00.000Z',
    updated_at: '2026-04-06T00:00:00.000Z',
    version: 4,
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

function buildMockResponse(urlString, method) {
  const url = new URL(urlString)
  const { pathname } = url

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: mockProject })
  }

  if (pathname === '/api/warnings') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/issues') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/risks') {
    return json({ success: true, data: mockRisks })
  }

  if (pathname === '/api/task-obstacles' || pathname === '/api/change-logs' || pathname === '/api/tasks' || pathname === '/api/task-conditions') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/risks/risk-pending' && method === 'PUT') {
    return json({
      success: false,
      error: {
        code: 'CHAIN_STATE_CHANGED',
        message: '当前记录状态或上游链路已变化，请刷新后再试。',
      },
    }, 422)
  }

  if (pathname.startsWith('/api/risks/') && method === 'PUT') {
    return json({ success: true, data: {} })
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
      if (message.type() === 'error' && !message.text().includes('422 (Unprocessable Entity)')) {
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/risks`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('risk-summary-band').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-chain-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-stream-risks').click()

    const detailTrigger = page.getByTestId('risk-detail-open-risk-risk-pending').first()
    await detailTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await detailTrigger.click()

    const detailDialog = page.getByTestId('risk-detail-dialog')
    await detailDialog.waitFor({ state: 'visible', timeout: 10000 })
    const detailText = await detailDialog.innerText()
    assert(detailText.includes('待人工关闭风险'), 'Risk detail drawer did not render expected pending-close risk')
    await page.screenshot({ path: join(outputDir, 'risk-guard-detail.png'), fullPage: true })

    await detailDialog.getByTestId('confirm-close-risk-risk-pending').click()
    const guardDialog = page.getByTestId('risk-action-guard-dialog')
    await guardDialog.waitFor({ state: 'visible', timeout: 10000 })
    const guardText = await guardDialog.innerText()
    assert(guardText.includes('暂不可执行') || guardText.includes('状态或上游链路已变化'), 'Risk guard dialog did not render expected protection copy')
    await page.screenshot({ path: join(outputDir, 'risk-guard-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl: targetUrl,
      detailVisible: true,
      guardDialogVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        detail: join(outputDir, 'risk-guard-detail.png'),
        guardDialog: join(outputDir, 'risk-guard-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'risk-guard-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'risk-guard-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
