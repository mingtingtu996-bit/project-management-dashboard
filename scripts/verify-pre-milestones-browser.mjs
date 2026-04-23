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
  name: '涓撻」绀轰緥椤圭洰',
  description: 'Pre-milestones browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const boardPayload = {
  summary: {
    completedCount: 1,
    totalCount: 4,
    blockingCertificateType: 'land_use_planning_permit',
    expectedReadyDate: '2026-05-20',
    overdueCount: 1,
    supplementCount: 1,
    weeklyActionCount: 2,
  },
  certificates: [
    {
      id: 'cert-land',
      certificate_type: 'land_certificate',
      certificate_name: '鍦熷湴璇?',
      status: 'issued',
      current_stage: '瀹℃壒棰嗚瘉',
      planned_finish_date: '2026-05-08',
      actual_finish_date: '2026-05-07',
      approving_authority: '鑷劧璧勬簮灞€',
      next_action: '褰掓。',
      next_action_due_date: '2026-05-08',
      is_blocked: false,
      block_reason: null,
      latest_record_at: '2026-05-07',
      work_item_ids: ['work-1'],
      shared_work_item_ids: ['work-1'],
    },
    {
      id: 'cert-land-use',
      certificate_type: 'land_use_planning_permit',
      certificate_name: '鐢ㄥ湴瑙勫垝璁稿彲璇?',
      status: 'supplement_required',
      current_stage: '澶栭儴鎶ユ壒',
      planned_finish_date: '2026-05-20',
      actual_finish_date: null,
      approving_authority: '瑙勫垝灞€',
      next_action: '琛ラ綈绛剧珷璧勬枡',
      next_action_due_date: '2026-05-18',
      is_blocked: true,
      block_reason: '璧勬枡寰呰ˉ姝?',
      latest_record_at: '2026-05-09',
      work_item_ids: ['work-1'],
      shared_work_item_ids: ['work-1'],
    },
    {
      id: 'cert-engineering',
      certificate_type: 'engineering_planning_permit',
      certificate_name: '宸ョ▼瑙勫垝璁稿彲璇?',
      status: 'internal_review',
      current_stage: '鍐呴儴鎶ュ',
      planned_finish_date: '2026-05-24',
      actual_finish_date: null,
      approving_authority: '瑙勫垝灞€',
      next_action: '绛夊緟鍐呴儴浼氱',
      next_action_due_date: '2026-05-21',
      is_blocked: false,
      block_reason: null,
      latest_record_at: '2026-05-09',
      work_item_ids: ['work-2'],
      shared_work_item_ids: [],
    },
    {
      id: 'cert-construction',
      certificate_type: 'construction_permit',
      certificate_name: '鏂藉伐璁稿彲璇?',
      status: 'pending',
      current_stage: '璧勬枡鍑嗗',
      planned_finish_date: '2026-05-30',
      actual_finish_date: null,
      approving_authority: '浣忓缓灞€',
      next_action: '鏁寸悊寮€宸ヨ祫鏂?',
      next_action_due_date: '2026-05-26',
      is_blocked: false,
      block_reason: null,
      latest_record_at: '2026-05-09',
      work_item_ids: [],
      shared_work_item_ids: [],
    },
  ],
  sharedItems: [
    {
      work_item_id: 'work-1',
      item_name: '鍏变韩璧勬枡鏀堕泦',
      item_stage: '璧勬枡鍑嗗',
      status: 'internal_review',
      is_shared: true,
      certificate_types: ['land_certificate', 'land_use_planning_permit'],
      certificate_names: ['土地证', '用地规划许可证'],
      blocking_certificate_types: ['land_use_planning_permit'],
      dependency_count: 2,
      next_action: '琛ラ綈鍘熶欢鎵弿浠?',
      next_action_due_date: '2026-05-15',
      block_reason: '涓よ瘉鍏辩敤璧勬枡寰呰ˉ姝?',
      planned_finish_date: '2026-05-12',
    },
  ],
}

const ledgerPayload = {
  items: [
    {
      id: 'work-1',
      project_id: projectId,
      item_code: 'W-001',
      item_name: '鍏变韩璧勬枡鏀堕泦',
      item_stage: '璧勬枡鍑嗗',
      status: 'internal_review',
      planned_finish_date: '2026-05-12',
      actual_finish_date: null,
      approving_authority: '瀹℃壒灞€',
      is_shared: true,
      next_action: '琛ラ綈鍘熶欢鎵弿浠?',
      next_action_due_date: '2026-05-15',
      is_blocked: true,
      block_reason: '涓よ瘉鍏辩敤璧勬枡寰呰ˉ姝?',
      sort_order: 1,
      notes: '鍏堣ˉ鎵弿浠?',
      latest_record_at: '2026-05-09',
      certificate_ids: ['cert-land', 'cert-land-use'],
      created_at: '2026-05-08T00:00:00.000Z',
      updated_at: '2026-05-09T00:00:00.000Z',
    },
  ],
  totals: {
    overdueCount: 1,
    blockedCount: 1,
    supplementCount: 1,
  },
}

const detailPayload = {
  certificate: boardPayload.certificates[1],
  workItems: [ledgerPayload.items[0]],
  dependencies: [
    {
      id: 'dep-1',
      project_id: projectId,
      predecessor_type: 'certificate',
      predecessor_id: 'cert-land-use',
      successor_type: 'work_item',
      successor_id: 'work-1',
      dependency_kind: 'hard',
      notes: null,
      created_at: '2026-05-08T00:00:00.000Z',
    },
  ],
  records: [
    {
      id: 'record-1',
      project_id: projectId,
      target_type: 'certificate',
      target_id: 'cert-land-use',
      record_type: 'supplement_required',
      from_status: 'internal_review',
      to_status: 'supplement_required',
      content: '琛ユ璧勬枡閫€鍥?',
      recorded_at: '2026-05-09T00:00:00.000Z',
      recorded_by: 'system',
    },
  ],
  dependencyMatrix: [
    {
      certificate_id: 'cert-land',
      certificate_type: 'land_certificate',
      certificate_name: '鍦熷湴璇?',
      cells: [
        {
          work_item_id: 'work-1',
          work_item_name: '鍏变韩璧勬枡鏀堕泦',
          status: 'satisfied',
          dependency_kind: 'hard',
          is_shared: true,
        },
      ],
    },
    {
      certificate_id: 'cert-land-use',
      certificate_type: 'land_use_planning_permit',
      certificate_name: '鐢ㄥ湴瑙勫垝璁稿彲璇?',
      cells: [
        {
          work_item_id: 'work-1',
          work_item_name: '鍏变韩璧勬枡鏀堕泦',
          status: 'blocked',
          dependency_kind: 'hard',
          is_shared: true,
        },
      ],
    },
  ],
  linkedWarnings: [
    {
      id: 'warning-link',
      project_id: projectId,
      task_id: 'cert-land-use',
      warning_type: 'permit_expiry',
      warning_level: 'critical',
      title: '璇佺収棰勮',
      description: '褰撳墠璇佺収瀛樺湪鍒版湡鎻愰啋',
      is_acknowledged: false,
      created_at: '2026-05-10T00:00:00.000Z',
    },
  ],
  linkedIssues: [
    {
      id: 'issue-link',
      project_id: projectId,
      task_id: null,
      title: '鍏宠仈闂',
      description: '鐢辫仈鍔ㄩ璀﹀崌绾ц€屾潵',
      severity: 'high',
      status: 'open',
      source_type: 'manual',
      source_id: 'warning-link',
      chain_id: 'warning-link',
      pending_manual_close: false,
      version: 1,
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
    },
  ],
  linkedRisks: [
    {
      id: 'risk-link',
      project_id: projectId,
      task_id: null,
      title: '鍏宠仈椋庨櫓',
      description: '鐢辫仈鍔ㄩ棶棰樼户缁崌绾?',
      level: 'high',
      status: 'identified',
      source_type: 'manual',
      source_id: 'issue-link',
      chain_id: 'issue-link',
      linked_issue_id: 'issue-link',
      pending_manual_close: false,
      closed_reason: null,
      closed_at: null,
      version: 1,
      created_at: '2026-05-10T00:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z',
    },
  ],
}

let currentDetail = structuredClone(detailPayload)

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

  if (pathname === `/api/projects/${projectId}/pre-milestones/board`) {
    return json({ success: true, data: boardPayload })
  }

  if (pathname === `/api/projects/${projectId}/pre-milestones/ledger`) {
    return json({ success: true, data: ledgerPayload })
  }

  if (pathname === `/api/projects/${projectId}/pre-milestones/cert-land-use/detail`) {
    return json({ success: true, data: currentDetail })
  }

  if (pathname === `/api/projects/${projectId}/pre-milestones/cert-land-use/escalate-issue`) {
    currentDetail = {
      ...currentDetail,
      linkedIssues: [
        ...currentDetail.linkedIssues,
        {
          id: 'issue-created',
          project_id: projectId,
          task_id: null,
          title: '新增证照问题',
          description: '由证照详情抽屉一键升级',
          severity: 'high',
          status: 'open',
          source_type: 'manual',
          source_id: null,
          chain_id: 'issue-created',
          pending_manual_close: false,
          version: 1,
          created_at: '2026-05-10T01:00:00.000Z',
          updated_at: '2026-05-10T01:00:00.000Z',
        },
      ],
    }
    return json({ success: true, data: currentDetail.linkedIssues.at(-1) })
  }

  if (pathname === `/api/projects/${projectId}/pre-milestones/cert-land-use/escalate-risk`) {
    currentDetail = {
      ...currentDetail,
      linkedRisks: [
        ...currentDetail.linkedRisks,
        {
          id: 'risk-created',
          project_id: projectId,
          task_id: null,
          title: '新增证照风险',
          description: '由证照详情抽屉一键升级',
          level: 'high',
          status: 'identified',
          source_type: 'manual',
          source_id: null,
          chain_id: 'risk-created',
          linked_issue_id: null,
          pending_manual_close: false,
          closed_reason: null,
          closed_at: null,
          version: 1,
          created_at: '2026-05-10T01:05:00.000Z',
          updated_at: '2026-05-10T01:05:00.000Z',
        },
      ],
    }
    return json({ success: true, data: currentDetail.linkedRisks.at(-1) })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  currentDetail = structuredClone(detailPayload)

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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/pre-milestones`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('pre-milestones-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('pre-milestones-overview').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('pre-milestones-board').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('pre-milestones-ledger').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    assert(initialUrl.includes('/pre-milestones'), `Unexpected PreMilestones URL: ${initialUrl}`)
    await page.screenshot({ path: join(outputDir, 'pre-milestones-page.png'), fullPage: true })

    await page.getByTestId('pre-milestones-go-drawings').click()
    await page.waitForFunction(() => window.location.hash.includes('/drawings'))
    await page.getByTestId('drawings-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('drawings-search-input').waitFor({ state: 'visible', timeout: 20000 })
    const drawingsUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'pre-milestones-to-drawings.png'), fullPage: true })

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('pre-milestones-page').waitFor({ state: 'visible', timeout: 20000 })

    await page.getByTestId('pre-milestones-certificate-cert-land-use').click()
    await page.getByTestId('certificate-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('linked-warnings').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('linked-issues').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('linked-risks').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('certificate-detail-drawer').getByRole('button', { name: '升级为问题' }).click()
    await page.getByText('新增证照问题').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'pre-milestones-detail-drawer.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      drawingsUrl,
      detailVisible: true,
      issueEscalationVisible: true,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'pre-milestones-page.png'),
        drawings: join(outputDir, 'pre-milestones-to-drawings.png'),
        detail: join(outputDir, 'pre-milestones-detail-drawer.png'),
      },
    }

    await writeFile(join(outputDir, 'pre-milestones-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'pre-milestones-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
