import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const port = Number(process.env.PORT || 4192)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const projectId = 'project-v14221-performance'
const companyId = 'company-v14221-performance'
const now = new Date().toISOString()

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

async function waitForHttpOk(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function ensureDistExists() {
  try {
    await access(distIndexFile)
  } catch {
    throw new Error(`Missing build artifact: ${distIndexFile}. Run npm run build --workspace=client first.`)
  }
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      VITE_DISABLE_PERMISSION_SYSTEM: 'false',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
  })
}

function makeTask(index) {
  const isStructure = index % 16 === 0
  const building = Math.floor(index / 120) + 1
  return {
    id: `perf-task-${index + 1}`,
    project_id: projectId,
    title: index === 777 ? '性能搜索目标任务' : `校园精细级任务 ${String(index + 1).padStart(4, '0')}`,
    name: index === 777 ? '性能搜索目标任务' : `校园精细级任务 ${String(index + 1).padStart(4, '0')}`,
    status: index % 11 === 0 ? '进行中' : '未开始',
    progress: index % 11 === 0 ? 36 : 0,
    start_date: '2026-06-01',
    end_date: '2026-06-12',
    planned_start_date: '2026-06-01',
    planned_end_date: '2026-06-12',
    wbs_code: `${Math.floor(index / 100) + 1}.${(index % 100) + 1}`,
    wbs_node_type: isStructure ? 'section' : 'task',
    category_type: isStructure ? 'division' : 'process',
    is_executable: !isStructure,
    parent_id: index > 0 ? `perf-task-${Math.max(1, index - (index % 16 || 16) + 1)}` : null,
    sort_order: index,
    building_object_id: `building-${building}`,
    floor_object_id: `floor-${(index % 30) + 1}`,
    zone_object_id: null,
    created_at: now,
    updated_at: now,
  }
}

const tasks = Array.from({ length: 3200 }, (_, index) => makeTask(index))
const apiCalls = []
const apiFailures = []

const user = {
  id: 'user-v14221-performance',
  username: 'v14221-performance',
  display_name: 'v1.4.22.1 性能验收用户',
  email: 'v14221-performance@example.com',
  role: 'owner',
  globalRole: 'company_admin',
  currentCompanyId: companyId,
  metadata: {},
}

function buildMockResponse(urlString, method = 'GET', postData = null) {
  const url = new URL(urlString)
  const { pathname } = url
  const body = postData ? JSON.parse(postData) : null
  apiCalls.push({ method, pathname })

  if (pathname === '/api/auth/me') {
    return json({ success: true, authenticated: true, user })
  }

  if (pathname === '/api/workspace') {
    return json({
      success: true,
      data: {
        hasCompany: true,
        currentCompany: { id: companyId, name: '性能验收公司', role: 'company_admin', isCurrent: true },
        myProjects: [{ id: projectId, name: '60万㎡校园精细级性能项目', status: '进行中', metadata: {} }],
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [{ id: projectId, name: '60万㎡校园精细级性能项目', status: '进行中', metadata: {} }] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({ success: true, data: { id: projectId, name: '60万㎡校园精细级性能项目', status: '进行中', metadata: {} } })
  }

  if (pathname === '/api/tasks') {
    return json({ success: true, data: tasks })
  }

  if (
    pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/risks'
    || pathname === '/api/task-baselines'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
    || pathname === '/api/data-quality/project-summary'
    || pathname === '/api/data-quality/live-check'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: [{ userId: user.id, displayName: user.display_name, permissionLevel: 'owner' }] })
  }

  if (pathname === `/api/projects/${projectId}/critical-path` || pathname === `/api/projects/${projectId}/critical-path/refresh`) {
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
        calculatedAt: now,
      },
    })
  }

  if (pathname === `/api/projects/${projectId}/critical-path/overrides`) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/planning/field-registry') {
    return json({ success: true, data: { registryVersion: 'v14221-performance', fields: [], groups: [] } })
  }

  if (pathname === '/api/dashboard/project-summary') {
    return json({
      success: true,
      data: {
        id: projectId,
        name: '60万㎡校园精细级性能项目',
        totalTasks: tasks.length,
        leafTaskCount: tasks.length,
        inProgressTaskCount: 291,
        completedTaskCount: 0,
        overdueTaskCount: 0,
        laggedTaskCount: 0,
        activeObstacleTaskCount: 0,
        pendingConditionTaskCount: 0,
        planningGovernance: { governancePhase: 'active' },
      },
    })
  }

  if (pathname === '/api/tasks/bulk-scope') {
    return json({ success: true, data: { updated: body?.taskIds?.length ?? 0 } })
  }

  return json({ success: true, data: [] })
}

async function measureRecommendationPerformance() {
  const { buildTemplateRecommendation } = await import('../server/src/services/projectFactsToTemplateService.ts')

  const scenarios = [
    {
      key: 'campus_600000_detailed',
      thresholdMs: 8000,
      memoryThresholdMb: 200,
      minRows: 2800,
      maxRows: 3600,
      facts: {
        businessType: 'school',
        methodVariantCodes: ['cast_in_situ'],
        projectFeatures: {},
        geographicContext: ['north_china'],
        overallConstraints: [],
        complexityLevel: 'high_complex',
        detailLevel: 'detailed',
        buildingCount: 62,
        totalAreaM2: 600000,
      },
    },
    {
      key: 'complex_280000_detailed',
      thresholdMs: 6000,
      memoryThresholdMb: 200,
      minRows: 2200,
      maxRows: 2800,
      facts: {
        businessType: 'general_civil',
        businessSubtype: 'civil_complex',
        methodVariantCodes: ['cast_in_situ'],
        projectFeatures: { commercial_arcade: true },
        geographicContext: ['urban_core'],
        overallConstraints: [],
        complexityLevel: 'complex',
        detailLevel: 'detailed',
        buildingCount: 36,
        totalAreaM2: 280000,
      },
    },
  ]

  return scenarios.map((scenario) => {
    const before = process.memoryUsage().heapUsed
    const startedAt = performance.now()
    const recommendation = buildTemplateRecommendation(scenario.facts)
    const elapsedMs = Math.round(performance.now() - startedAt)
    const after = process.memoryUsage().heapUsed
    const heapDeltaMb = Math.max(0, (after - before) / 1024 / 1024)
    const detailedRows = recommendation.expectedRowCount.detailed
    assert(elapsedMs < scenario.thresholdMs, `${scenario.key} generation exceeded ${scenario.thresholdMs}ms: ${elapsedMs}ms`)
    assert(heapDeltaMb < scenario.memoryThresholdMb, `${scenario.key} heap delta exceeded ${scenario.memoryThresholdMb}MB: ${heapDeltaMb.toFixed(2)}MB`)
    assert(detailedRows >= scenario.minRows && detailedRows <= scenario.maxRows, `${scenario.key} expected rows out of range: ${detailedRows}`)
    return {
      key: scenario.key,
      elapsedMs,
      heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
      expectedRows: recommendation.expectedRowCount,
      matchedTemplates: recommendation.matchedTemplates.length,
    }
  })
}

async function preparePage(page) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth_token', token)
    window.localStorage.setItem('access_token', token)
    window.localStorage.setItem('onboarding_workspace_completed', 'true')
    window.localStorage.setItem('onboarding_project_completed', 'true')
    window.localStorage.setItem('wizard_onboarding_completed', 'true')
    window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  }, 'browser-v14221-performance-token')
}

async function measureTaskTablePerformance() {
  await ensureDistExists()
  const preview = startPreviewServer()
  preview.stdout.on('data', () => {})
  preview.stderr.on('data', (chunk) => process.stderr.write(`[v14221-performance:preview] ${chunk}`))

  try {
    const ready = await waitForHttpOk(baseUrl)
    assert(ready, `Preview server did not become ready at ${baseUrl}`)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    let taskApiFulfilledAt = 0
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const response = buildMockResponse(request.url(), request.method(), request.postData())
      if (response.status >= 400) apiFailures.push({ url: request.url(), status: response.status })
      await route.fulfill(response)
      if (new URL(request.url()).pathname === '/api/tasks') {
        taskApiFulfilledAt = performance.now()
      }
    })
    await preparePage(page)

    const coldStart = performance.now()
    await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('gantt-task-list-toolbar').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByText('当前 3200 行').waitFor({ state: 'visible', timeout: 10000 })
    const coldFirstPaintMs = Math.round(performance.now() - coldStart)

    await page.goto(`${baseUrl}/#/company`, { waitUntil: 'domcontentloaded' })
    const start = performance.now()
    taskApiFulfilledAt = 0
    await page.goto(`${baseUrl}/#/projects/${projectId}/gantt`, { waitUntil: 'domcontentloaded' })
    const domContentLoadedMs = Math.round(performance.now() - start)
    await page.getByTestId('gantt-task-list-toolbar').waitFor({ state: 'visible', timeout: 10000 })
    const toolbarVisibleMs = Math.round(performance.now() - start)
    await page.getByText('当前 3200 行').waitFor({ state: 'visible', timeout: 10000 })
    const firstPaintMs = Math.round(performance.now() - start)

    const filterToggle = page.getByRole('button', { name: /筛选/ }).first()
    if (await page.getByLabel('搜索任务名或责任人').count() === 0) {
      await filterToggle.click()
    }
    const search = page.getByLabel('搜索任务名或责任人')
    await search.waitFor({ state: 'visible', timeout: 5000 })
    const searchStart = performance.now()
    await search.fill('性能搜索目标')
    await page.waitForFunction(() => {
      const input = document.querySelector('input[aria-label="搜索任务名或责任人"]')
      return input?.value === '性能搜索目标'
    }, undefined, { timeout: 5000 })
    const searchInputAppliedMs = Math.round(performance.now() - searchStart)
    await page.getByText(/1\/3200/).waitFor({ state: 'visible', timeout: 10000 })
    const searchCountUpdatedMs = Math.round(performance.now() - searchStart)
    await page.getByText('性能搜索目标任务').waitFor({ state: 'visible', timeout: 10000 })
    const searchEnd = performance.now()
    const searchFullRenderMs = Math.round(searchEnd - searchStart)
    const searchResponseMs = searchCountUpdatedMs
    const searchDebounceMs = 100
    const searchAfterDebounceMs = Math.max(0, searchResponseMs - searchDebounceMs)

    assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(' | ')}`)
    assert(apiFailures.length === 0, `API failures: ${JSON.stringify(apiFailures)}`)

    await browser.close()
    return {
      firstPaintMs,
      coldFirstPaintMs,
      domContentLoadedMs,
      toolbarVisibleMs,
      taskApiFulfilledMs: taskApiFulfilledAt ? Math.round(taskApiFulfilledAt - start) : null,
      searchResponseMs,
      searchFullRenderMs,
      searchInputAppliedMs,
      searchCountUpdatedMs,
      searchDebounceMs,
      searchAfterDebounceMs,
      apiCallCount: apiCalls.length,
      consoleErrors,
      pageErrors,
    }
  } finally {
    preview.kill()
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  const generation = await measureRecommendationPerformance()
  const browser = await measureTaskTablePerformance()
  const failures = []
  if (browser.firstPaintMs >= 1000) failures.push(`task table first usable render exceeded 1000ms: ${browser.firstPaintMs}ms`)
  if (browser.searchAfterDebounceMs >= 200) failures.push(`task table search response after debounce exceeded 200ms: ${browser.searchAfterDebounceMs}ms`)
  const result = {
    mode: 'mock-api-browser-and-service',
    generatedAt,
    thresholds: {
      campusGenerationMs: 8000,
      complexGenerationMs: 6000,
      generationHeapMb: 200,
      taskTableFirstPaintMs: 1000,
      searchResponseMs: 200,
    },
    generation,
    browser,
    passed: failures.length === 0,
    failures,
  }
  await writeFile(join(outputDir, 'v14221-performance.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
  if (failures.length > 0) {
    throw new Error(failures.join(' | '))
  }
}

main().catch(async (error) => {
  await mkdir(outputDir, { recursive: true })
  const result = {
    mode: 'mock-api-browser-and-service',
    generatedAt: new Date().toISOString(),
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  }
  await writeFile(join(outputDir, 'v14221-performance.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.error(result.error)
  process.exit(1)
})
