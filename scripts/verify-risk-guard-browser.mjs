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

export function resolveRiskGuardProjectId({
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
  projectId = resolveRiskGuardProjectId({ manifest })
  return projectId
}

export function extractRiskGuardEntityIdFromDetailTestId(testId, entityType = 'risk') {
  const prefix = `risk-detail-open-${entityType}-`
  const value = String(testId ?? '')
  return value.startsWith(prefix) ? value.slice(prefix.length) : ''
}

function buildStalePositiveVersion(version) {
  const current = Number(version)
  if (!Number.isInteger(current) || current <= 1) return 2
  return current - 1
}

export function preparePendingRiskFixture(risks) {
  const normalizedRisks = Array.isArray(risks) ? risks : []
  const nextPendingRisk = normalizedRisks.find((risk) => Boolean(risk?.pending_manual_close))

  if (!nextPendingRisk?.id) {
    return {
      pendingRisk: null,
      patchedRisks: normalizedRisks,
      staleVersionInjected: false,
    }
  }

  const staleVersion = buildStalePositiveVersion(nextPendingRisk.version)
  return {
    pendingRisk: {
      id: String(nextPendingRisk.id),
      title: String(nextPendingRisk.title ?? ''),
      originalVersion: nextPendingRisk.version,
      staleVersion,
    },
    patchedRisks: normalizedRisks.map((risk) => (
      risk?.id === nextPendingRisk.id ? { ...risk, version: staleVersion } : risk
    )),
    staleVersionInjected: staleVersion !== nextPendingRisk.version,
  }
}

function isRisksListRequest(urlString, method) {
  if (method !== 'GET') return false
  const url = new URL(urlString)
  return url.pathname === '/api/risks'
}

function isConfirmCloseRiskRequest(urlString, method, riskId) {
  if (method !== 'POST' || !riskId) return false
  const url = new URL(urlString)
  return url.pathname === `/api/risks/${riskId}/confirm-close`
}

const mockCauseTaxonomy = {
  version: 'v1.0.0',
  entries: [
    {
      code: 'other',
      label: '其他',
      category: 'other',
      linkedDeviationReasonTypes: [],
      priority: 999,
    },
  ],
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

export function buildMockResponse(urlString, method, fixtureRisks = mockRisks) {
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
        risks: fixtureRisks,
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
        canManageTeam: true,
        canEdit: true,
      },
    })
  }

  if (pathname === '/api/cause-attributions/taxonomy') {
    return json({ success: true, data: mockCauseTaxonomy })
  }

  if (pathname === '/api/warnings') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/issues') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/risks') {
    return json({ success: true, data: fixtureRisks })
  }

  if (pathname === '/api/task-obstacles' || pathname === '/api/change-logs' || pathname === '/api/tasks' || pathname === '/api/task-conditions') {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/risks/risk-pending/confirm-close' && method === 'POST') {
    return json({
      success: false,
      error: {
        code: 'CHAIN_STATE_CHANGED',
        message: '当前记录状态或上游链路已变化，请刷新后再试。',
      },
    }, 422)
  }

  if (
    pathname === `/api/cause-attributions/projects/${projectId}/subjects/risk/risk-pending/confirm`
    && method === 'POST'
  ) {
    return json({
      success: true,
      data: {
        id: 'cause-risk-pending',
        status: 'confirmed',
      },
    }, 201)
  }

  if (pathname.startsWith('/api/risks/') && method === 'PUT') {
    return json({ success: true, data: {} })
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
  const mockPendingFixture = shouldUseMockApi ? preparePendingRiskFixture(mockRisks) : null
  let pendingRisk = mockPendingFixture?.pendingRisk ?? null
  let staleVersionInjected = mockPendingFixture?.staleVersionInjected ?? false
  let guardApiStatus = null

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1800 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)

    page.on('console', (message) => {
      if (
        message.type() === 'error'
        && !message.text().includes('409 (Conflict)')
        && !message.text().includes('422 (Unprocessable Entity)')
      ) {
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
        const response = buildMockResponse(
          requestUrl,
          requestMethod,
          mockPendingFixture?.patchedRisks ?? mockRisks,
        )
        if (isConfirmCloseRiskRequest(requestUrl, requestMethod, pendingRisk?.id)) {
          guardApiStatus = response.status
        }
        await route.fulfill(response)
        return
      }

      const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
      try {
        const response = await route.fetch({ url: forwardUrl })
        if (isConfirmCloseRiskRequest(forwardUrl, requestMethod, pendingRisk?.id)) {
          guardApiStatus = response.status()
        }
        if (isRisksListRequest(forwardUrl, requestMethod) && response.ok()) {
          const payload = await response.json()
          const risks = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
          const prepared = preparePendingRiskFixture(risks)
          if (prepared.pendingRisk?.id) {
            pendingRisk = prepared.pendingRisk
            staleVersionInjected = prepared.staleVersionInjected
            const patchedPayload = Array.isArray(payload)
              ? prepared.patchedRisks
              : { ...payload, data: prepared.patchedRisks }
            await route.fulfill(json(patchedPayload, response.status()))
            return
          }
        }
        if (
          response.status() >= 400
          && !isConfirmCloseRiskRequest(forwardUrl, requestMethod, pendingRisk?.id)
        ) {
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/risks`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('risk-summary-band').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-chain-workspace').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('risk-stream-risks').click()

    if (!pendingRisk?.id) {
      throw new Error(`No pending_manual_close risk found for project ${projectId}; risk guard requires a pending-close risk fixture`)
    }
    if (!staleVersionInjected) {
      throw new Error(`Unable to inject stale version for pending risk ${pendingRisk.id}`)
    }

    const detailTrigger = page.getByTestId(`risk-detail-open-risk-${pendingRisk.id}`).first()
    await detailTrigger.waitFor({ state: 'visible', timeout: 10000 })
    const riskDetailTestId = await detailTrigger.getAttribute('data-testid')
    const selectedRiskId = extractRiskGuardEntityIdFromDetailTestId(riskDetailTestId, 'risk')
    assert(selectedRiskId === pendingRisk.id, `Selected risk id mismatch: expected ${pendingRisk.id}, got ${selectedRiskId}`)
    await detailTrigger.click()

    const detailDialog = page.getByTestId('risk-detail-dialog')
    await detailDialog.waitFor({ state: 'visible', timeout: 10000 })
    const detailText = await detailDialog.innerText()
    assert(detailText.includes(pendingRisk.title), 'Risk detail drawer did not render expected pending-close risk')
    await page.screenshot({ path: join(outputDir, 'risk-guard-detail.png'), fullPage: true })

    await detailDialog.getByTestId(`confirm-close-risk-${pendingRisk.id}`).click()
    const structuredCloseDialog = page.getByTestId('structured-close-dialog')
    await structuredCloseDialog.waitFor({ state: 'visible', timeout: 10000 })
    await structuredCloseDialog.getByTestId('closure-result-summary').fill(
      '受控浏览器验收：验证过期版本会被关闭保护门禁拒绝。',
    )
    await structuredCloseDialog.getByTestId('structured-close-submit').click()

    const guardDialog = page.getByTestId('risk-action-guard-dialog')
    await guardDialog.waitFor({ state: 'visible', timeout: 10000 })
    const guardText = await guardDialog.innerText()
    assert(
      guardText.includes('暂不可执行') || guardText.includes('刷新') || guardText.includes('版本冲突') || guardText.includes('状态或上游链路已变化'),
      'Risk guard dialog did not render expected protection copy',
    )
    assert(
      guardApiStatus === 409 || guardApiStatus === 422,
      `Expected confirm-close to be rejected by backend guard, got ${guardApiStatus}`,
    )
    await page.screenshot({ path: join(outputDir, 'risk-guard-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl: targetUrl,
      projectId,
      pendingRisk,
      staleVersionInjected,
      guardApiStatus,
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
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText()
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'risk-guard-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      pendingRisk,
      staleVersionInjected,
      guardApiStatus,
      pageBodyText,
      failureScreenshot,
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
