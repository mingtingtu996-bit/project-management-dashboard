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

const TEXT = {
  pageTitle: '\u6750\u6599\u7ba1\u63a7',
  dialogLabel: '\u8be6\u60c5\u7f16\u8f91',
  editedName: '\u94dd\u578b\u6750-\u590d\u6838',
  unassignedName: '\u7535\u68af\u5bfc\u8f68',
  unassignedBanner: '\u4ee5\u4e0b\u6750\u6599\u6240\u5c5e\u5206\u5305\u5546\u5df2\u5220\u9664\uff0c\u8bf7\u91cd\u65b0\u5173\u8054',
}

const mockAuthState = {
  authenticated: true,
  user: {
    id: 'materials-owner-1',
    username: 'materials-owner',
    display_name: '\u6750\u6599\u7ba1\u7406\u5458',
    email: 'materials-owner@example.com',
    globalRole: 'regular',
  },
}

const mockProject = {
  id: projectId,
  name: '\u6750\u6599\u8054\u8c03\u9879\u76ee',
  description: '\u6750\u6599\u7ba1\u63a7\u6d4f\u89c8\u5668\u9a8c\u6536\u56fa\u4ef6',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const participantUnits = [
  { id: 'unit-1', project_id: projectId, unit_name: '\u5e55\u5899\u5355\u4f4d', unit_type: '\u5206\u5305' },
  { id: 'unit-2', project_id: projectId, unit_name: '\u673a\u7535\u5355\u4f4d', unit_type: '\u5206\u5305' },
]

const initialMaterials = [
  {
    id: 'material-1',
    project_id: projectId,
    participant_unit_id: 'unit-1',
    participant_unit_name: '\u5e55\u5899\u5355\u4f4d',
    material_name: '\u94dd\u578b\u6750',
    specialty_type: '\u5e55\u5899',
    requires_sample_confirmation: true,
    sample_confirmed: false,
    expected_arrival_date: '2026-04-22',
    actual_arrival_date: null,
    requires_inspection: false,
    inspection_done: false,
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'material-2',
    project_id: projectId,
    participant_unit_id: null,
    participant_unit_name: null,
    material_name: TEXT.unassignedName,
    specialty_type: '\u7535\u68af',
    requires_sample_confirmation: false,
    sample_confirmed: false,
    expected_arrival_date: '2026-04-18',
    actual_arrival_date: null,
    requires_inspection: false,
    inspection_done: false,
    version: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'material-3',
    project_id: projectId,
    participant_unit_id: 'unit-2',
    participant_unit_name: '\u673a\u7535\u5355\u4f4d',
    material_name: '\u98ce\u673a\u76d8\u7ba1',
    specialty_type: '\u673a\u7535',
    requires_sample_confirmation: false,
    sample_confirmed: false,
    expected_arrival_date: '2026-04-25',
    actual_arrival_date: '2026-04-24',
    requires_inspection: true,
    inspection_done: true,
    version: 2,
    created_at: now,
    updated_at: now,
  },
]

const mockProjectSummary = {
  id: projectId,
  name: mockProject.name,
  status: 'active',
  statusLabel: '\u8fdb\u884c\u4e2d',
  plannedEndDate: '2026-12-31',
  daysUntilPlannedEnd: 257,
  totalTasks: 24,
  leafTaskCount: 18,
  completedTaskCount: 9,
  inProgressTaskCount: 7,
  delayedTaskCount: 2,
  delayDays: 3,
  delayCount: 2,
  overallProgress: 54,
  taskProgress: 54,
  totalMilestones: 3,
  completedMilestones: 1,
  milestoneProgress: 33,
  riskCount: 2,
  activeRiskCount: 2,
  pendingConditionCount: 1,
  pendingConditionTaskCount: 1,
  activeObstacleCount: 1,
  activeObstacleTaskCount: 1,
  preMilestoneCount: 0,
  completedPreMilestoneCount: 0,
  activePreMilestoneCount: 0,
  overduePreMilestoneCount: 0,
  acceptancePlanCount: 0,
  passedAcceptancePlanCount: 0,
  inProgressAcceptancePlanCount: 0,
  failedAcceptancePlanCount: 0,
  constructionDrawingCount: 0,
  issuedConstructionDrawingCount: 0,
  reviewingConstructionDrawingCount: 0,
  attentionRequired: false,
  scheduleVarianceDays: 3,
  activeDelayRequests: 0,
  activeObstacles: 1,
  monthlyCloseStatus: '\u8fdb\u884c\u4e2d',
  closeoutOverdueDays: 0,
  unreadWarningCount: 0,
  highestWarningLevel: 'warning',
  highestWarningSummary: '\u6750\u6599\u5230\u573a\u9700\u8981\u8ddf\u8e2a',
  shiftedMilestoneCount: 0,
  criticalPathAffectedTasks: 1,
  healthScore: 83,
  healthStatus: '\u5065\u5eb7',
  nextMilestone: {
    id: 'milestone-1',
    name: '\u4e3b\u697c\u5c01\u9876',
    targetDate: '2026-06-30',
    status: '\u8fdb\u884c\u4e2d',
    daysRemaining: 72,
  },
  milestoneOverview: {
    split_count: 0,
    merged_count: 0,
    pending_mapping_count: 0,
    upcoming_count: 0,
    overdue_count: 0,
    items: [],
  },
}

const mockDataQualitySummary = {
  projectId,
  month: '2026-04',
  confidence: {
    score: 86,
    flag: 'medium',
    note: '\u6570\u636e\u8d28\u91cf\u603b\u4f53\u7a33\u5b9a',
    timelinessScore: 85,
    anomalyScore: 84,
    consistencyScore: 88,
    coverageScore: 87,
    jumpinessScore: 86,
    activeFindingCount: 1,
    trendWarningCount: 0,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 0,
  },
  prompt: {
    count: 0,
    summary: '\u5f53\u524d\u65e0\u9700\u8981\u989d\u5916\u590d\u6838\u7684\u6761\u76ee',
    items: [],
  },
  ownerDigest: {
    shouldNotify: false,
    severity: 'warning',
    scopeLabel: '\u6750\u6599\u5230\u573a',
    findingCount: 0,
    summary: '\u6570\u636e\u8d28\u91cf\u6b63\u5e38',
  },
  findings: [],
}

const mockCriticalPathSnapshot = {
  projectId,
  autoTaskIds: [],
  manualAttentionTaskIds: [],
  manualInsertedTaskIds: [],
  primaryChain: {
    id: 'chain-1',
    source: 'auto',
    taskIds: [],
    totalDurationDays: 0,
    displayLabel: '\u4e3b\u5173\u952e\u8def\u5f84',
  },
  alternateChains: [],
  displayTaskIds: [],
  edges: [],
  tasks: [],
  projectDurationDays: 0,
}

const mockMaterialSummary = {
  overview: {
    totalExpectedCount: 3,
    onTimeCount: 1,
    arrivalRate: 33,
  },
  byUnit: [
    {
      participantUnitId: 'unit-1',
      participantUnitName: '\u5e55\u5899\u5355\u4f4d',
      specialtyTypes: ['\u5e55\u5899'],
      totalExpectedCount: 1,
      onTimeCount: 0,
      arrivalRate: 0,
    },
    {
      participantUnitId: 'unit-2',
      participantUnitName: '\u673a\u7535\u5355\u4f4d',
      specialtyTypes: ['\u673a\u7535'],
      totalExpectedCount: 1,
      onTimeCount: 1,
      arrivalRate: 100,
    },
    {
      participantUnitId: null,
      participantUnitName: null,
      specialtyTypes: ['\u7535\u68af'],
      totalExpectedCount: 1,
      onTimeCount: 0,
      arrivalRate: 0,
    },
  ],
  monthlyTrend: [
    { month: '2025-11', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
    { month: '2025-12', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
    { month: '2026-01', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
    { month: '2026-02', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
    { month: '2026-03', totalExpectedCount: 1, onTimeCount: 1, arrivalRate: 100 },
    { month: '2026-04', totalExpectedCount: 2, onTimeCount: 0, arrivalRate: 0 },
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

function cloneMaterials(materials) {
  return materials.map((material) => ({ ...material }))
}

function findUnitName(participantUnitId) {
  return participantUnits.find((unit) => unit.id === participantUnitId)?.unit_name ?? null
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
    throw new Error(`Missing build artifact: ${distIndexFile}. Run "npm run build --workspace=client" first.`)
  }
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()

  let materials = cloneMaterials(initialMaterials)
  const patchRequests = []

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
    page.setDefaultTimeout(30000)

    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'browser-verify-token')
      window.localStorage.setItem('access_token', 'browser-verify-token')
    })

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
      const requestMethod = route.request().method()

      if (!shouldUseMockApi) {
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
        return
      }

      const url = new URL(requestUrl)
      const { pathname, searchParams } = url

      if (pathname === '/api/auth/me') {
        await route.fulfill(json({ success: true, ...mockAuthState }))
        return
      }

      if (pathname === '/api/projects') {
        await route.fulfill(json({ success: true, data: [mockProject] }))
        return
      }

      if (pathname === `/api/projects/${projectId}`) {
        await route.fulfill(json({ success: true, data: mockProject }))
        return
      }

      if (pathname === '/api/participant-units' && searchParams.get('projectId') === projectId) {
        await route.fulfill(json({ success: true, data: participantUnits }))
        return
      }

      if (pathname === `/api/projects/${projectId}/materials` && requestMethod === 'GET') {
        await route.fulfill(json({ success: true, data: materials }))
        return
      }

      if (pathname === `/api/projects/${projectId}/materials/summary`) {
        await route.fulfill(json({ success: true, data: mockMaterialSummary }))
        return
      }

      if (pathname.startsWith(`/api/projects/${projectId}/materials/`) && requestMethod === 'PATCH') {
        const materialId = pathname.split('/').pop()
        const patch = route.request().postDataJSON() ?? {}
        patchRequests.push({ materialId, patch })

        materials = materials.map((material) => {
          if (material.id !== materialId) return material

          const participantUnitId = patch.participant_unit_id === undefined
            ? material.participant_unit_id
            : patch.participant_unit_id

          return {
            ...material,
            ...patch,
            participant_unit_id: participantUnitId ?? null,
            participant_unit_name: participantUnitId ? findUnitName(participantUnitId) : null,
            version: Number(material.version ?? 1) + 1,
            updated_at: new Date().toISOString(),
          }
        })

        await route.fulfill(json({
          success: true,
          data: materials.find((material) => material.id === materialId) ?? null,
        }))
        return
      }

      if (
        pathname === '/api/tasks'
        || pathname === '/api/risks'
        || pathname === '/api/task-conditions'
        || pathname === '/api/task-obstacles'
        || pathname === '/api/warnings'
        || pathname === '/api/issues'
        || pathname === '/api/delay-requests'
        || pathname === '/api/tasks/progress-snapshots'
      ) {
        await route.fulfill(json({ success: true, data: [] }))
        return
      }

      if (pathname === '/api/dashboard/project-summary') {
        await route.fulfill(json({ success: true, data: mockProjectSummary }))
        return
      }

      if (pathname === '/api/data-quality/project-summary') {
        await route.fulfill(json({ success: true, data: mockDataQualitySummary }))
        return
      }

      if (pathname === '/api/task-baselines') {
        await route.fulfill(json({ success: true, data: [] }))
        return
      }

      if (pathname === '/api/progress-deviation') {
        await route.fulfill(json({ success: true, data: [] }))
        return
      }

      if (pathname === '/api/progress-deviation/lock') {
        await route.fulfill(json({ success: true, data: null }))
        return
      }

      if (pathname === '/api/change-logs') {
        await route.fulfill(json({ success: true, data: [] }))
        return
      }

      if (pathname === `/api/projects/${projectId}/critical-path`) {
        await route.fulfill(json({ success: true, data: mockCriticalPathSnapshot }))
        return
      }

      if (pathname === `/api/members/${projectId}/me`) {
        await route.fulfill(json({
          success: true,
          data: {
            permissionLevel: 'owner',
            globalRole: 'regular',
            canManageTeam: true,
            canEdit: true,
          },
        }))
        return
      }

      if (pathname === `/api/members/${projectId}`) {
        await route.fulfill(json({
          success: true,
          members: [
            {
              userId: 'materials-owner-1',
              displayName: '\u6750\u6599\u7ba1\u7406\u5458',
              permissionLevel: 'owner',
            },
          ],
        }))
        return
      }

      await route.fulfill(json({ success: true, data: [] }))
    })

    const materialsUrl = `${baseUrl}/#/projects/${projectId}/materials`
    await page.goto(materialsUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('materials-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('material-detail-trigger-material-1').waitFor({ state: 'visible', timeout: 20000 })

    const initialText = await page.locator('body').innerText()
    assert(initialText.includes(TEXT.pageTitle), 'Materials page title did not render')
    assert(initialText.includes(TEXT.unassignedBanner), 'Materials page missing unassigned banner')
    await page.screenshot({ path: join(outputDir, 'materials-page-initial.png'), fullPage: true })

    await page.getByTestId('material-detail-trigger-material-1').click()
    await page.getByTestId('material-detail-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('material-detail-name-input').fill(TEXT.editedName)
    await page.getByTestId('material-detail-save').click()
    await page.getByTestId('material-detail-dialog').waitFor({ state: 'hidden', timeout: 10000 })

    const updatedText = await page.locator('body').innerText()
    assert(updatedText.includes(TEXT.editedName), 'Materials detail dialog did not persist edited name')
    assert(patchRequests.length === 1, `Expected one material PATCH request, received ${patchRequests.length}`)
    assert(patchRequests[0]?.patch?.material_name === TEXT.editedName, 'Materials PATCH payload missing edited name')
    await page.screenshot({ path: join(outputDir, 'materials-page-after-save.png'), fullPage: true })

    const filteredUrl = `${baseUrl}/#/projects/${projectId}/materials?unit=__unassigned__`
    await page.goto(filteredUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('materials-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('materials-unassigned-banner').waitFor({ state: 'visible', timeout: 10000 })

    const filteredText = await page.locator('body').innerText()
    assert(filteredText.includes(TEXT.unassignedName), 'Filtered materials page missing unassigned material')
    assert(!filteredText.includes(TEXT.editedName), 'Filtered materials page still shows unrelated material')
    await page.screenshot({ path: join(outputDir, 'materials-page-unassigned-filter.png'), fullPage: true })

    const reportsUrl = `${baseUrl}/#/projects/${projectId}/reports?view=risk`
    await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('reports-module-tabs').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('reports-material-arrival-summary').waitFor({ state: 'visible', timeout: 20000 })
    const materialSummaryText = await page.getByTestId('reports-material-arrival-summary').innerText()
    assert(materialSummaryText.includes('\u6750\u6599\u5230\u573a\u7387\u5206\u6790'), 'Reports risk view missing material arrival summary')
    assert(materialSummaryText.includes('33%'), 'Reports material arrival summary missing expected arrival rate')
    await page.screenshot({ path: join(outputDir, 'materials-reports-risk-view.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      materialsUrl,
      filteredUrl,
      reportsUrl,
      patchRequests,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'materials-page-initial.png'),
        afterSave: join(outputDir, 'materials-page-after-save.png'),
        filtered: join(outputDir, 'materials-page-unassigned-filter.png'),
        reportsRisk: join(outputDir, 'materials-reports-risk-view.png'),
      },
    }

    await writeFile(join(outputDir, 'materials-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'materials-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
