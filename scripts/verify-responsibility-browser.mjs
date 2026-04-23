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
  responsibilityPageTitle: '\u4efb\u52a1\u7ba1\u7406 / \u8d23\u4efb\u4e3b\u4f53',
  searchLabel: '\u8d23\u4efb\u4e3b\u4f53\u641c\u7d22',
  linkedFilterLabel: '\u4ea4\u53c9\u7b5b\u9009',
  allAssignees: '\u5168\u90e8\u8d23\u4efb\u4eba',
  addWatch: '\u52a0\u5165\u5173\u6ce8',
  confirmRecovery: '\u786e\u8ba4\u6062\u590d',
  unitAsade: '\u963f\u8428\u5fb7',
  unitTest: '\u6d4b\u8bd5\u5355\u4f4d',
  personAda: '\u963f\u8fbe\u662f\u7684',
  personLiSi: '\u674e\u56db',
  titleStructure: '\u4e3b\u4f53\u7ed3\u6784\u65bd\u5de5',
  descStructure: '\u4e3b\u697c\u4e3b\u4f53\u7ed3\u6784\u63a8\u8fdb',
  titleRoof: '\u5c4b\u9762\u9632\u6c34',
  descRoof: '\u5c4b\u9762\u8282\u70b9\u6536\u53e3',
  progressStatus: '\u8fdb\u884c\u4e2d',
  pendingStatus: '\u672a\u5f00\u59cb',
  alertDelay: '\u6d3b\u8dc3\u5ef6\u671f 1 \u9879',
  alertRisk: '\u98ce\u9669\u538b\u529b\u504f\u9ad8',
  alertGap: '\u91cd\u70b9\u627f\u8bfa\u7f3a\u53e3 1 \u9879',
}

const mockProject = {
  id: projectId,
  name: '\u8d23\u4efb\u4e3b\u4f53\u8054\u8c03\u6f14\u793a\u9879\u76ee',
  description: 'Responsibility browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockTasks = [
  {
    id: 'task-1',
    project_id: projectId,
    title: TEXT.titleStructure,
    description: TEXT.descStructure,
    status: 'in_progress',
    progress: 48,
    planned_start_date: '2026-03-11',
    planned_end_date: '2026-06-30',
    start_date: '2026-03-11',
    end_date: '2026-06-30',
    created_at: now,
    updated_at: now,
    assignee_name: TEXT.personAda,
    assignee_user_id: 'user-1',
    assignee_unit: TEXT.unitAsade,
    responsible_unit: TEXT.unitAsade,
    is_milestone: false,
  },
  {
    id: 'task-2',
    project_id: projectId,
    title: TEXT.titleRoof,
    description: TEXT.descRoof,
    status: 'pending',
    progress: 0,
    planned_start_date: '2026-07-01',
    planned_end_date: '2026-07-20',
    start_date: '2026-07-01',
    end_date: '2026-07-20',
    created_at: now,
    updated_at: now,
    assignee_name: TEXT.personLiSi,
    assignee_user_id: 'user-2',
    assignee_unit: TEXT.unitTest,
    responsible_unit: TEXT.unitTest,
    is_milestone: false,
  },
]

const basePersonRows = [
  {
    key: `person:${TEXT.personAda}`,
    label: TEXT.personAda,
    dimension: 'person',
    subject_user_id: 'user-1',
    subject_unit_id: null,
    primary_unit_key: `unit:${TEXT.unitAsade}`,
    primary_unit_label: TEXT.unitAsade,
    total_tasks: 1,
    completed_count: 0,
    on_time_count: 0,
    delayed_count: 1,
    active_delayed_count: 1,
    current_in_hand_count: 1,
    open_risk_count: 1,
    open_obstacle_count: 0,
    risk_pressure: 2,
    key_commitment_gap_count: 1,
    on_time_rate: 0,
    current_week_completed_count: 0,
    current_week_on_time_rate: 0,
    previous_week_completed_count: 0,
    previous_week_on_time_rate: 0,
    trend_delta: -8,
    trend_direction: 'down',
    alert_reasons: [TEXT.alertDelay, TEXT.alertRisk],
    state_level: 'abnormal',
    tasks: [
      {
        id: 'task-1',
        title: TEXT.titleStructure,
        assignee: TEXT.personAda,
        assignee_user_id: 'user-1',
        unit: TEXT.unitAsade,
        participant_unit_id: 'unit-1',
        completed: false,
        status_label: TEXT.progressStatus,
        planned_end_date: '2026-06-30',
        actual_end_date: null,
        is_delayed: true,
        is_critical: true,
        is_milestone: false,
      },
    ],
  },
  {
    key: `person:${TEXT.personLiSi}`,
    label: TEXT.personLiSi,
    dimension: 'person',
    subject_user_id: 'user-2',
    subject_unit_id: null,
    primary_unit_key: `unit:${TEXT.unitTest}`,
    primary_unit_label: TEXT.unitTest,
    total_tasks: 1,
    completed_count: 0,
    on_time_count: 0,
    delayed_count: 0,
    active_delayed_count: 0,
    current_in_hand_count: 1,
    open_risk_count: 0,
    open_obstacle_count: 0,
    risk_pressure: 0,
    key_commitment_gap_count: 0,
    on_time_rate: 100,
    current_week_completed_count: 0,
    current_week_on_time_rate: 100,
    previous_week_completed_count: 0,
    previous_week_on_time_rate: 100,
    trend_delta: 0,
    trend_direction: 'flat',
    alert_reasons: [],
    state_level: 'healthy',
    tasks: [
      {
        id: 'task-2',
        title: TEXT.titleRoof,
        assignee: TEXT.personLiSi,
        assignee_user_id: 'user-2',
        unit: TEXT.unitTest,
        participant_unit_id: 'unit-2',
        completed: false,
        status_label: TEXT.pendingStatus,
        planned_end_date: '2026-07-20',
        actual_end_date: null,
        is_delayed: false,
        is_critical: false,
        is_milestone: false,
      },
    ],
  },
]

const baseUnitRows = [
  {
    key: `unit:${TEXT.unitAsade}`,
    label: TEXT.unitAsade,
    dimension: 'unit',
    subject_user_id: null,
    subject_unit_id: 'unit-1',
    primary_unit_key: null,
    primary_unit_label: null,
    total_tasks: 1,
    completed_count: 0,
    on_time_count: 0,
    delayed_count: 1,
    active_delayed_count: 1,
    current_in_hand_count: 1,
    open_risk_count: 1,
    open_obstacle_count: 0,
    risk_pressure: 2,
    key_commitment_gap_count: 1,
    on_time_rate: 0,
    current_week_completed_count: 0,
    current_week_on_time_rate: 0,
    previous_week_completed_count: 0,
    previous_week_on_time_rate: 0,
    trend_delta: -8,
    trend_direction: 'down',
    alert_reasons: [TEXT.alertDelay, TEXT.alertGap],
    state_level: 'abnormal',
    tasks: [
      {
        id: 'task-1',
        title: TEXT.titleStructure,
        assignee: TEXT.personAda,
        assignee_user_id: 'user-1',
        unit: TEXT.unitAsade,
        participant_unit_id: 'unit-1',
        completed: false,
        status_label: TEXT.progressStatus,
        planned_end_date: '2026-06-30',
        actual_end_date: null,
        is_delayed: true,
        is_critical: true,
        is_milestone: false,
      },
    ],
  },
  {
    key: `unit:${TEXT.unitTest}`,
    label: TEXT.unitTest,
    dimension: 'unit',
    subject_user_id: null,
    subject_unit_id: 'unit-2',
    primary_unit_key: null,
    primary_unit_label: null,
    total_tasks: 1,
    completed_count: 0,
    on_time_count: 0,
    delayed_count: 0,
    active_delayed_count: 0,
    current_in_hand_count: 1,
    open_risk_count: 0,
    open_obstacle_count: 0,
    risk_pressure: 0,
    key_commitment_gap_count: 0,
    on_time_rate: 100,
    current_week_completed_count: 0,
    current_week_on_time_rate: 100,
    previous_week_completed_count: 0,
    previous_week_on_time_rate: 100,
    trend_delta: 0,
    trend_direction: 'flat',
    alert_reasons: [],
    state_level: 'healthy',
    tasks: [
      {
        id: 'task-2',
        title: TEXT.titleRoof,
        assignee: TEXT.personLiSi,
        assignee_user_id: 'user-2',
        unit: TEXT.unitTest,
        participant_unit_id: 'unit-2',
        completed: false,
        status_label: TEXT.pendingStatus,
        planned_end_date: '2026-07-20',
        actual_end_date: null,
        is_delayed: false,
        is_critical: false,
        is_milestone: false,
      },
    ],
  },
]

const watchlistState = [
  {
    id: 'watch-1',
    project_id: projectId,
    dimension: 'person',
    subject_key: `person:${TEXT.personAda}`,
    subject_label: TEXT.personAda,
    subject_user_id: 'user-1',
    subject_unit_id: null,
    status: 'cleared',
    created_at: now,
    updated_at: now,
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildResponsibilityPayload() {
  const personRows = clone(basePersonRows)
  const unitRows = clone(baseUnitRows)
  const watchlist = clone(watchlistState)
  const watchMap = new Map(watchlist.map((item) => [`${item.dimension}:${item.subject_key}`, item]))

  for (const row of [...personRows, ...unitRows]) {
    const watch = watchMap.get(`${row.dimension}:${row.key}`) ?? null
    row.watch_id = watch?.id ?? null
    row.watch_status = watch?.status ?? null
    row.alert_state_id = watch ? `alert-${row.key}` : null
    row.last_message_id = watch ? `message-${row.key}` : null
    row.suggest_recovery_confirmation = watch?.status === 'suggested_to_clear'
  }

  return {
    project_id: projectId,
    generated_at: new Date().toISOString(),
    person_rows: personRows,
    unit_rows: unitRows,
    watchlist,
  }
}

function updateWatchStatus({
  dimension,
  subject_key,
  subject_label,
  subject_user_id = null,
  subject_unit_id = null,
  status,
}) {
  const existing = watchlistState.find((item) => item.dimension === dimension && item.subject_key === subject_key)
  if (existing) {
    existing.status = status
    existing.updated_at = new Date().toISOString()
    if (subject_label) existing.subject_label = subject_label
    existing.subject_user_id = subject_user_id
    existing.subject_unit_id = subject_unit_id
    return existing
  }

  const watch = {
    id: `watch-${watchlistState.length + 1}`,
    project_id: projectId,
    dimension,
    subject_key,
    subject_label,
    subject_user_id,
    subject_unit_id,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  watchlistState.push(watch)
  return watch
}

function buildMockResponse(route, requestBody) {
  const requestUrl = route.request().url()
  const requestMethod = route.request().method().toUpperCase()
  const url = new URL(requestUrl)
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
    return json({ success: true, data: mockTasks })
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

  if (pathname === `/api/projects/${projectId}/responsibility` && requestMethod === 'GET') {
    return json({ success: true, data: buildResponsibilityPayload() })
  }

  if (pathname === `/api/projects/${projectId}/responsibility/watchlist` && requestMethod === 'POST') {
    updateWatchStatus({ ...requestBody, status: 'suggested_to_clear' })
    return json({ success: true, data: { ok: true } })
  }

  if (pathname === `/api/projects/${projectId}/responsibility/watchlist/clear` && requestMethod === 'POST') {
    updateWatchStatus({ ...requestBody, status: 'cleared' })
    return json({ success: true, data: { ok: true } })
  }

  if (pathname === `/api/projects/${projectId}/responsibility/watchlist/confirm-recovery` && requestMethod === 'POST') {
    updateWatchStatus({ ...requestBody, status: 'cleared' })
    return json({ success: true, data: { ok: true } })
  }

  return json({ success: true, data: [] })
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

function countRows(page) {
  return page.getByTestId('responsibility-row').count()
}

function findRow(page, label) {
  return page.getByTestId('responsibility-row').filter({ hasText: label }).first()
}

async function selectFilter(page, optionText) {
  await page.getByLabel(TEXT.linkedFilterLabel).click()
  await page.getByRole('option', { name: optionText, exact: true }).click()
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

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const requestUrl = route.request().url()
      const request = route.request()

      if (shouldUseMockApi) {
        const rawBody = request.postData()
        const requestBody = rawBody ? JSON.parse(rawBody) : undefined
        await route.fulfill(buildMockResponse(route, requestBody))
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/responsibility?dimension=unit`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('responsibility-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('heading', { name: TEXT.responsibilityPageTitle }).waitFor({ state: 'visible', timeout: 20000 })

    const currentUrl = page.url()
    assert(currentUrl.includes('/responsibility'), `Unexpected browser URL after navigation: ${currentUrl}`)

    const initialRows = await countRows(page)
    assert(initialRows === 2, `Expected 2 responsibility rows on initial load, got ${initialRows}`)
    await page.screenshot({ path: join(outputDir, 'responsibility-initial.png'), fullPage: true })

    const searchInput = page.getByLabel(TEXT.searchLabel)
    await searchInput.fill(TEXT.unitAsade)
    await page.waitForTimeout(300)

    const searchedRows = await countRows(page)
    assert(searchedRows === 1, `Search should reduce rows to 1, got ${searchedRows}`)
    await findRow(page, TEXT.unitAsade).waitFor({ state: 'visible', timeout: 5000 })
    await page.screenshot({ path: join(outputDir, 'responsibility-search.png'), fullPage: true })

    await searchInput.fill('')
    await page.waitForTimeout(300)

    await selectFilter(page, TEXT.personAda)
    await page.waitForTimeout(300)

    const filteredRows = await countRows(page)
    assert(filteredRows === 1, `Linked filter should reduce rows to 1, got ${filteredRows}`)
    const filteredRow = findRow(page, TEXT.unitAsade)
    await filteredRow.waitFor({ state: 'visible', timeout: 5000 })
    await page.screenshot({ path: join(outputDir, 'responsibility-linked-filter.png'), fullPage: true })

    await selectFilter(page, TEXT.allAssignees)
    await page.waitForTimeout(300)

    const resetRows = await countRows(page)
    assert(resetRows === 2, `Resetting linked filter should restore rows to 2, got ${resetRows}`)

    await page.goto(`${baseUrl}/#/projects/${projectId}/responsibility?dimension=person`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('responsibility-page').waitFor({ state: 'visible', timeout: 20000 })

    const targetRow = findRow(page, TEXT.personAda)
    await targetRow.waitFor({ state: 'visible', timeout: 5000 })
    await targetRow.getByRole('button', { name: TEXT.addWatch }).click()
    await targetRow.getByRole('button', { name: TEXT.confirmRecovery }).waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'responsibility-recovery-pending.png'), fullPage: true })

    await targetRow.getByRole('button', { name: TEXT.confirmRecovery }).click()
    await targetRow.getByRole('button', { name: TEXT.addWatch }).waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'responsibility-recovery-cleared.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      url: currentUrl,
      initialRows,
      searchedRows,
      filteredRows,
      resetRows,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'responsibility-initial.png'),
        search: join(outputDir, 'responsibility-search.png'),
        linkedFilter: join(outputDir, 'responsibility-linked-filter.png'),
        recoveryPending: join(outputDir, 'responsibility-recovery-pending.png'),
        recoveryCleared: join(outputDir, 'responsibility-recovery-cleared.png'),
      },
    }

    await writeFile(join(outputDir, 'responsibility-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'responsibility-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
