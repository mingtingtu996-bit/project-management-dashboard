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
  name: '风险问题联调项目',
  description: 'RiskManagement browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockWarnings = [
  {
    id: 'warning-1',
    task_id: 'task-1',
    source_type: 'condition_expired',
    chain_id: 'chain-summary-1',
    warning_type: 'condition_due',
    warning_level: 'warning',
    title: '开工条件即将到期',
    description: '任务A的开工条件待确认',
    is_acknowledged: false,
    created_at: '2026-04-01T08:00:00.000Z',
  },
  {
    id: 'warning-2',
    task_id: 'task-2',
    source_type: 'obstacle_escalated',
    warning_type: 'obstacle_timeout',
    warning_level: 'warning',
    title: '阻碍已持续多天',
    description: '任务B材料未到',
    is_acknowledged: false,
    created_at: '2026-04-01T09:00:00.000Z',
  },
]

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
    linked_issue_id: 'issue-1',
    created_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
    version: 3,
  },
]

const mockIssues = [
  {
    id: 'issue-1',
    project_id: projectId,
    task_id: 'task-1',
    title: '结构面移交偏晚',
    description: '需要协调下游工序重新排产',
    source_type: 'risk_converted',
    chain_id: 'chain-summary-1',
    source_entity_type: 'risk',
    source_entity_id: 'risk-1',
    severity: 'high',
    priority: 3,
    status: 'investigating',
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    version: 1,
  },
]

const mockObstacles = [
  {
    id: 'obstacle-1',
    task_id: 'task-3',
    description: '材料未到',
    obstacle_type: 'material',
    severity: 'medium',
    status: 'active',
    responsible_person: '张三',
    responsible_unit: '总包单位',
    expected_resolution_date: '2026-04-05T00:00:00.000Z',
    resolution_notes: '',
    resolved_at: '',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
]

const mockChangeLogs = [
  {
    id: 'log-1',
    project_id: projectId,
    entity_type: 'warning',
    entity_id: 'warning-1',
    field_name: 'status',
    old_value: 'open',
    new_value: 'acknowledged',
    change_reason: '人工确认',
    change_source: 'manual_adjusted',
    changed_at: '2026-04-15T10:00:00.000Z',
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

  if (
    pathname === '/api/tasks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/delay-requests'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/warnings') {
    return json({ success: true, data: mockWarnings })
  }

  if (pathname === '/api/issues') {
    return json({ success: true, data: mockIssues })
  }

  if (pathname === '/api/risks') {
    return json({ success: true, data: mockRisks })
  }

  if (pathname === '/api/task-obstacles') {
    return json({ success: true, data: mockObstacles })
  }

  if (pathname === '/api/change-logs') {
    return json({ success: true, data: mockChangeLogs })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/risks`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('risk-summary-band').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-chain-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-stream-risks').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/risks'), `Unexpected RiskManagement URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'risk-management-page-summary.png'), fullPage: true })

    await page.getByTestId('risk-stream-risks').click()
    const detailTrigger = page.locator('[data-testid="risk-detail-open-risk-risk-1"]').first()
    await detailTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await detailTrigger.click()
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const detailText = await page.getByTestId('risk-detail-dialog').innerText()
    assert(detailText.includes('查看全链'), 'Risk detail drawer did not render expected chain action')
    assert(detailText.includes('chain-summary-1'), 'Risk detail drawer did not render expected chain id')
    await page.screenshot({ path: join(outputDir, 'risk-management-page-detail.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'hidden', timeout: 10000 })

    const linkedIssueTrigger = page.locator('[data-testid="risk-open-linked-issue-risk-1"]').first()
    await linkedIssueTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await linkedIssueTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'risk-management-page-linked-issue.png'), fullPage: true })

    const upstreamRiskTrigger = page.getByTestId('risk-detail-dialog').getByTestId('risk-open-upstream-risk-issue-1')
    await upstreamRiskTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await upstreamRiskTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'risk-management-page-upstream-risk.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'hidden', timeout: 10000 })
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, undefined, { timeout: 10000 })

    const problemStreamTrigger = page.getByTestId('risk-stream-issues')
    await problemStreamTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await problemStreamTrigger.click()
    await page.waitForTimeout(200)
    const issueDetailTrigger = page.locator('[data-testid="risk-detail-open-issue-issue-1"]').first()
    await issueDetailTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await issueDetailTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const issueDetailText = await page.getByTestId('risk-detail-dialog').innerText()
    assert(issueDetailText.includes('查看上游风险'), 'Issue detail dialog did not expose upstream risk action')
    assert(issueDetailText.includes('查看全链'), 'Issue detail dialog did not expose chain action')
    await page.screenshot({ path: join(outputDir, 'risk-management-page-issue-detail.png'), fullPage: true })

    const issueChainTrigger = page.getByTestId('risk-detail-dialog').getByTestId('risk-open-chain-issue-issue-1')
    await issueChainTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await issueChainTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-chain-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const issueChainText = await page.getByTestId('risk-chain-dialog').innerText()
    assert(issueChainText.length > 0, 'Issue chain dialog rendered empty content')
    assert(issueChainText.includes('塔楼结构进度风险'), 'Issue chain dialog did not render expected upstream risk')
    await page.screenshot({ path: join(outputDir, 'risk-management-page-issue-chain.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByTestId('risk-chain-dialog').waitFor({ state: 'hidden', timeout: 10000 })

    const directUpstreamRiskTrigger = page.getByTestId('risk-detail-dialog').getByTestId('risk-open-upstream-risk-issue-1')
    await directUpstreamRiskTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await directUpstreamRiskTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-detail-dialog').getByText('塔楼结构进度风险').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'risk-management-page-problem-to-upstream-risk.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByTestId('risk-detail-dialog').waitFor({ state: 'hidden', timeout: 10000 })
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, undefined, { timeout: 10000 })

    const riskStreamTrigger = page.getByTestId('risk-stream-risks')
    await riskStreamTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await riskStreamTrigger.click()
    await page.waitForTimeout(200)

    const chainTrigger = page.getByTestId('risk-chain-workspace').getByTestId('risk-open-chain-risk-risk-1').first()
    await chainTrigger.waitFor({ state: 'visible', timeout: 10000 })
    await chainTrigger.scrollIntoViewIfNeeded()
    await chainTrigger.evaluate((node) => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
    await page.getByTestId('risk-chain-dialog').waitFor({ state: 'visible', timeout: 10000 })
    const chainText = await page.getByTestId('risk-chain-dialog').innerText()
    assert(chainText.includes('开工条件即将到期'), 'Risk chain dialog did not render linked warning')
    assert(chainText.includes('塔楼结构进度风险'), 'Risk chain dialog did not render linked risk')
    assert(chainText.includes('结构面移交偏晚'), 'Risk chain dialog did not render linked issue')
    assert(chainText.includes('人工确认'), 'Risk chain dialog did not render linked change log')
    await page.screenshot({ path: join(outputDir, 'risk-management-page-chain.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      detailVisible: true,
      chainVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        summary: join(outputDir, 'risk-management-page-summary.png'),
        detail: join(outputDir, 'risk-management-page-detail.png'),
        linkedIssue: join(outputDir, 'risk-management-page-linked-issue.png'),
        upstreamRisk: join(outputDir, 'risk-management-page-upstream-risk.png'),
        issueDetail: join(outputDir, 'risk-management-page-issue-detail.png'),
        issueChain: join(outputDir, 'risk-management-page-issue-chain.png'),
        problemToUpstreamRisk: join(outputDir, 'risk-management-page-problem-to-upstream-risk.png'),
        chain: join(outputDir, 'risk-management-page-chain.png'),
      },
    }

    await writeFile(join(outputDir, 'risk-management-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'risk-management-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
