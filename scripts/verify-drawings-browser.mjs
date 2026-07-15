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

const drawingFixture = {
  structure: {
    packageCode: 'v1424-browser-structure',
    packageName: 'v1.4.24 structure drawing package',
    disciplineType: 'structure',
    documentPurpose: 'construction',
    drawingCode: 'V1424-STR-001',
    drawingName: 'v1.4.24 foundation detail',
    versionNo: '1.2',
  },
  architecture: {
    packageCode: 'v1424-browser-architecture',
    packageName: 'v1.4.24 architecture review package',
    disciplineType: 'architecture',
    documentPurpose: 'review',
  },
}

const packageStructure = {
  packageId: 'pkg-structure',
  packageCode: drawingFixture.structure.packageCode,
  packageName: drawingFixture.structure.packageName,
  disciplineType: drawingFixture.structure.disciplineType,
  documentPurpose: drawingFixture.structure.documentPurpose,
  status: 'preparing',
  requiresReview: false,
  reviewMode: 'none',
  reviewModeLabel: '不适用',
  reviewBasis: '常规施工执行包默认不送审',
  completenessRatio: 75,
  missingRequiredCount: 1,
  currentVersionDrawingId: 'drawing-1',
  currentVersionNo: '1.2',
  currentVersionLabel: '当前有效v1.2',
  currentReviewStatus: '已通过',
  hasChange: false,
  scheduleImpactFlag: true,
  isReadyForConstruction: true,
  isReadyForAcceptance: false,
  drawingsCount: 2,
  requiredItemsCount: 3,
  latestUpdateAt: now,
}

const packageArchitecture = {
  packageId: 'pkg-architecture',
  packageCode: drawingFixture.architecture.packageCode,
  packageName: drawingFixture.architecture.packageName,
  disciplineType: drawingFixture.architecture.disciplineType,
  documentPurpose: drawingFixture.architecture.documentPurpose,
  status: 'reviewing',
  requiresReview: true,
  reviewMode: 'mandatory',
  reviewModeLabel: '蹇呴』閫佸',
  reviewBasis: '按专项审图规则执',
  completenessRatio: 100,
  missingRequiredCount: 0,
  currentVersionDrawingId: 'drawing-2',
  currentVersionNo: '2.0',
  currentVersionLabel: '当前有效v2.0',
  currentReviewStatus: '审查',
  hasChange: true,
  scheduleImpactFlag: false,
  isReadyForConstruction: false,
  isReadyForAcceptance: false,
  drawingsCount: 1,
  requiredItemsCount: 2,
  latestUpdateAt: now,
}

const ledgerRows = [
  {
    drawingId: 'drawing-1',
    packageId: packageStructure.packageId,
    packageCode: packageStructure.packageCode,
    packageName: packageStructure.packageName,
    disciplineType: packageStructure.disciplineType,
    documentPurpose: packageStructure.documentPurpose,
    drawingCode: drawingFixture.structure.drawingCode,
    drawingName: drawingFixture.structure.drawingName,
    versionNo: drawingFixture.structure.versionNo,
    drawingStatus: 'issued',
    reviewStatus: '已通过',
    isCurrentVersion: true,
    requiresReview: false,
    reviewMode: 'none',
    reviewModeLabel: '不适用',
    reviewBasis: '常规施工执行包默认不送审',
    hasChange: false,
    scheduleImpactFlag: false,
    plannedSubmitDate: null,
    actualSubmitDate: null,
    plannedPassDate: null,
    actualPassDate: null,
    createdAt: now,
  },
  {
    drawingId: 'drawing-2',
    packageId: packageArchitecture.packageId,
    packageCode: packageArchitecture.packageCode,
    packageName: packageArchitecture.packageName,
    disciplineType: packageArchitecture.disciplineType,
    documentPurpose: packageArchitecture.documentPurpose,
    drawingCode: 'ARC-002',
    drawingName: '平面布置',
    versionNo: '2.0',
    drawingStatus: 'reviewing',
    reviewStatus: '审查',
    isCurrentVersion: true,
    requiresReview: true,
    reviewMode: 'mandatory',
    reviewModeLabel: '蹇呴』閫佸',
    reviewBasis: '按专项审图规则执',
    hasChange: true,
    scheduleImpactFlag: false,
    plannedSubmitDate: null,
    actualSubmitDate: null,
    plannedPassDate: null,
    actualPassDate: null,
    createdAt: now,
  },
]

const detailPayload = {
  package: packageStructure,
  requiredItems: [
    {
      itemId: 'item-1',
      itemCode: 'req-001',
      itemName: '结构总说',
      isRequired: true,
      status: 'available',
      currentDrawingId: 'drawing-1',
      currentVersion: '1.2',
      notes: '',
      sortOrder: 1,
    },
    {
      itemId: 'item-2',
      itemCode: 'req-002',
      itemName: '基础详图',
      isRequired: true,
      status: 'missing',
      currentDrawingId: null,
      currentVersion: '',
      notes: '待补',
      sortOrder: 2,
    },
  ],
  drawings: [ledgerRows[0]],
  records: [
    {
      versionId: 'version-2',
      drawingId: 'drawing-1',
      versionNo: '1.2',
      previousVersionId: 'version-1',
      isCurrentVersion: true,
      changeReason: '补充配筋说明',
      createdAt: now,
      createdBy: '测试',
      drawingName: '基础',
    },
    {
      versionId: 'version-1',
      drawingId: 'drawing-1',
      versionNo: '1.1',
      previousVersionId: null,
      isCurrentVersion: false,
      changeReason: '初版发布',
      createdAt: now,
      createdBy: '测试',
      drawingName: '基础',
    },
  ],
  linkedTasks: [
    {
      id: 'task-1',
      name: '主体结构施工',
      status: '进行',
      drawingConditionCount: 1,
      openConditionCount: 1,
      conditions: [
        {
          id: 'condition-1',
          name: '结构图签',
          status: '寰呮弧瓒?',
          conditionType: 'design',
          isSatisfied: false,
        },
      ],
    },
  ],
  linkedAcceptance: [
    {
      id: 'acceptance-1',
      name: '主体结构验收',
      status: '未开',
      requirementCount: 1,
      openRequirementCount: 1,
      latestRecordAt: null,
      requirements: [
        {
          id: 'requirement-1',
          requirementType: 'drawing',
          sourceEntityType: 'drawing_package',
          sourceEntityId: packageStructure.packageId,
          description: '需上传当前有效施工',
          status: 'open',
        },
      ],
    },
  ],
  issueSignals: [
    {
      code: 'issue-signal-1',
      title: '图纸缺漏',
      description: '基础详图缺失，可能影响施工交底',
      severity: 'medium',
      evidence: ['缺失基础详图'],
      escalatedEntityType: null,
      escalatedEntityId: null,
      escalatedAt: null,
    },
  ],
  riskSignals: [
    {
      code: 'risk-signal-1',
      title: '送审延误',
      description: '送审节点晚于计划，存在进度风险',
      severity: 'high',
      evidence: ['送审状态仍为审查中'],
      escalatedEntityType: null,
      escalatedEntityId: null,
      escalatedAt: null,
    },
  ],
}

const mockProject = {
  id: projectId,
  name: '图纸浏览器联调项',
  description: 'Drawings browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
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

export function resolveDrawingsProjectId({
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
  projectId = resolveDrawingsProjectId({ manifest })
  return projectId
}

export function selectDrawingFixturePackage(packages, fixture) {
  return (packages ?? []).find((pkg) => (
    pkg?.packageCode === fixture.packageCode
    || pkg?.package_code === fixture.packageCode
    || pkg?.packageName === fixture.packageName
    || pkg?.package_name === fixture.packageName
  )) ?? null
}

function readPackageId(pkg) {
  return pkg?.packageId || pkg?.id || pkg?.package_id || null
}

function readPackageCode(pkg) {
  return pkg?.packageCode || pkg?.package_code || null
}

export function resolveExpectedDrawingVersionLabel(pkg, fixture = drawingFixture.structure) {
  const rawVersion = pkg?.currentVersionNo || pkg?.current_version_no || fixture?.versionNo || ''
  const normalized = String(rawVersion).trim().replace(/^v/i, '')
  return normalized ? `v${normalized}` : ''
}

export async function waitForLocatorTextIncludes(
  locator,
  expectedText,
  {
    timeoutMs = 10000,
    intervalMs = 100,
    description = 'locator text',
  } = {},
) {
  const deadline = Date.now() + timeoutMs
  let lastText = ''
  let lastError = null

  while (Date.now() <= deadline) {
    try {
      lastText = await locator.innerText()
      if (lastText.includes(expectedText)) {
        return lastText
      }
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  const lastErrorText = lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
  throw new Error(
    `Timeout waiting for ${description} to include ${JSON.stringify(expectedText)} after ${timeoutMs}ms. Last text: ${JSON.stringify(lastText)}.${lastErrorText}`,
  )
}

function normalizeBoardPackage(pkg) {
  return {
    ...pkg,
    packageId: readPackageId(pkg),
    packageCode: readPackageCode(pkg),
    packageName: pkg?.packageName || pkg?.package_name,
  }
}

async function requestApiJson(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok || payload?.success === false) {
    const message = payload?.error?.message || payload?.message || text || `HTTP ${response.status}`
    throw new Error(`${method} ${pathname} failed: ${response.status} ${message}`)
  }
  return payload?.data ?? payload
}

async function loadProxyDrawingBoard(token) {
  return requestApiJson(`/api/construction-drawings/board?projectId=${projectId}`, { token })
}

async function loadProxyDrawingLedger(token) {
  return requestApiJson(`/api/construction-drawings/ledger?projectId=${projectId}`, { token })
}

async function ensureProxyDrawingPackage(token, fixture) {
  let board = await loadProxyDrawingBoard(token)
  const existing = selectDrawingFixturePackage(board?.packages, fixture)
  if (existing) {
    return normalizeBoardPackage(existing)
  }

  await requestApiJson('/api/construction-drawings/packages', {
    method: 'POST',
    token,
    body: {
      projectId,
      packageCode: fixture.packageCode,
      packageName: fixture.packageName,
      disciplineType: fixture.disciplineType,
      documentPurpose: fixture.documentPurpose,
      reviewMode: 'none',
      items: fixture.drawingCode
        ? [{
            itemCode: fixture.drawingCode,
            itemName: fixture.drawingName,
            disciplineType: fixture.disciplineType,
            isRequired: true,
            sortOrder: 1,
          }]
        : [],
    },
  })

  board = await loadProxyDrawingBoard(token)
  const created = selectDrawingFixturePackage(board?.packages, fixture)
  assert(created, `Created drawing package was not visible in board: ${fixture.packageCode}`)
  return normalizeBoardPackage(created)
}

async function ensureProxyCurrentDrawing(token, pkg, fixture) {
  const packageId = readPackageId(pkg)
  assert(packageId, `Drawing fixture package missing id: ${JSON.stringify(pkg)}`)

  const ledger = await loadProxyDrawingLedger(token)
  const existing = (ledger?.drawings ?? []).find((drawing) => (
    drawing?.packageId === packageId
    || drawing?.package_id === packageId
    || drawing?.packageCode === fixture.packageCode
    || drawing?.package_code === fixture.packageCode
  ) && (
    drawing?.drawingCode === fixture.drawingCode
    || drawing?.drawing_code === fixture.drawingCode
  ))
  if (existing) return existing

  await requestApiJson('/api/construction-drawings', {
    method: 'POST',
    token,
    body: {
      project_id: projectId,
      drawing_type: fixture.disciplineType,
      drawing_name: fixture.drawingName,
      version: fixture.versionNo,
      status: '已出图',
      review_status: '已通过',
      package_id: packageId,
      package_code: fixture.packageCode,
      package_name: fixture.packageName,
      discipline_type: fixture.disciplineType,
      document_purpose: fixture.documentPurpose,
      drawing_code: fixture.drawingCode,
      version_no: fixture.versionNo,
      revision_no: fixture.versionNo,
      issued_for: fixture.documentPurpose,
      is_current_version: true,
      requires_review: false,
      review_mode: 'none',
      review_basis: 'v1.4.24 browser staging fixture',
      is_ready_for_construction: true,
      is_ready_for_acceptance: false,
    },
  })

  const refreshedLedger = await loadProxyDrawingLedger(token)
  const created = (refreshedLedger?.drawings ?? []).find((drawing) => (
    drawing?.drawingCode === fixture.drawingCode
    || drawing?.drawing_code === fixture.drawingCode
  ))
  assert(created, `Created drawing was not visible in ledger: ${fixture.drawingCode}`)
  return created
}

async function ensureProxyDrawingFixtures(token) {
  const structurePackage = await ensureProxyDrawingPackage(token, drawingFixture.structure)
  await ensureProxyDrawingPackage(token, drawingFixture.architecture)
  await ensureProxyCurrentDrawing(token, structurePackage, drawingFixture.structure)

  const board = await loadProxyDrawingBoard(token)
  const refreshedStructure = selectDrawingFixturePackage(board?.packages, drawingFixture.structure)
  assert(refreshedStructure, `Drawing fixture package missing after refresh: ${drawingFixture.structure.packageCode}`)
  return {
    structurePackage: normalizeBoardPackage(refreshedStructure),
    packageCount: board?.packages?.length ?? 0,
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

  if (
    pathname === '/api/tasks'
    || pathname === '/api/risks'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  if (pathname === '/api/construction-drawings/board') {
    return json({
      success: true,
      data: {
        summary: {
          totalPackages: 2,
          missingPackages: 1,
          mandatoryReviewPackages: 1,
          reviewingPackages: 1,
          scheduleImpactCount: 1,
          readyForConstructionCount: 1,
          readyForAcceptanceCount: 0,
        },
        packages: [packageStructure, packageArchitecture],
      },
    })
  }

  if (pathname === '/api/construction-drawings/ledger') {
    return json({
      success: true,
      data: {
        drawings: ledgerRows,
      },
    })
  }

  if (pathname === `/api/construction-drawings/packages/${packageStructure.packageId}/detail`) {
    return json({ success: true, data: detailPayload })
  }

  if (pathname === `/api/construction-drawings/packages/${packageStructure.packageId}/versions`) {
    return json({
      success: true,
      data: {
        package: packageStructure,
        versions: detailPayload.records,
      },
    })
  }

  if (pathname === `/api/construction-drawings/packages/${packageStructure.packageId}/set-current-version`) {
    return json({ success: true, data: { ok: true } })
  }

  if (pathname === '/api/construction-drawings/packages') {
    return json({ success: true, data: { ok: true } })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  await resolveProjectId()

  let authToken = null
  let targetPackage = packageStructure
  let fixturePackageCount = 2
  if (!shouldUseMockApi) {
    authToken = await resolveBrowserVerifyAuthToken()
    const proxyFixtures = await ensureProxyDrawingFixtures(authToken)
    targetPackage = proxyFixtures.structurePackage
    fixturePackageCount = proxyFixtures.packageCount
  }

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
  let lastDrawerText = null
  let lastVersionDialogText = null
  let failureScreenshot = null

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('response', (response) => {
      if (!response.url().includes('/api/') || response.status() < 400) return
      recordApiFailure(apiFailures, {
        type: 'response',
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/drawings`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('drawings-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('drawing-package-board').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('drawing-ledger').waitFor({ state: 'visible', timeout: 20000 })

    const initialCardCount = await page.locator('[data-testid^="drawing-package-card-"]').count()
    if (shouldUseMockApi) {
      assert(initialCardCount === 2, `Expected 2 drawing package cards, got ${initialCardCount}`)
    } else {
      assert(initialCardCount >= 1, `Expected at least 1 drawing package card, got ${initialCardCount}`)
      await page.getByTestId(`drawing-package-card-${targetPackage.packageId}`).waitFor({ state: 'visible', timeout: 10000 })
    }
    await page.screenshot({ path: join(outputDir, 'drawings-page-initial.png'), fullPage: true })

    await page.getByTestId('drawings-search-input').fill(targetPackage.packageName)
    await page.waitForTimeout(300)
    const filteredCardCount = await page.locator('[data-testid^="drawing-package-card-"]').count()
    assert(filteredCardCount >= 1, `Expected search to show the target package, got ${filteredCardCount}`)
    await page.getByTestId(`drawing-package-card-${targetPackage.packageId}`).waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'drawings-page-search.png'), fullPage: true })

    await page.getByTestId(`drawing-package-detail-${targetPackage.packageId}`).click()
    const detailDrawer = page.getByTestId('drawing-detail-drawer')
    await detailDrawer.waitFor({ state: 'visible', timeout: 10000 })
    const drawerText = await waitForLocatorTextIncludes(detailDrawer, targetPackage.packageName, {
      timeoutMs: 15000,
      intervalMs: 200,
      description: `drawing detail drawer for ${targetPackage.packageId}`,
    })
    lastDrawerText = drawerText
    await page.screenshot({ path: join(outputDir, 'drawings-page-detail.png'), fullPage: true })

    await page.getByRole('button', { name: '查看版本窗口' }).click()
    await page.locator('[data-testid^="drawing-version-row-"]').first().waitFor({ state: 'visible', timeout: 10000 })
    const versionPanel = page.getByTestId('drawing-version-detail-panel')
    await versionPanel.waitFor({ state: 'visible', timeout: 10000 })
    const expectedVersionLabel = resolveExpectedDrawingVersionLabel(targetPackage)
    if (expectedVersionLabel) {
      lastVersionDialogText = await waitForLocatorTextIncludes(versionPanel, expectedVersionLabel, {
        timeoutMs: 10000,
        intervalMs: 200,
        description: `drawing version detail panel for ${targetPackage.packageId}`,
      })
    } else {
      lastVersionDialogText = await versionPanel.innerText()
    }
    await page.screenshot({ path: join(outputDir, 'drawings-page-versions.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      targetUrl,
      initialCardCount,
      filteredCardCount,
      fixtureProjectId: projectId,
      fixturePackageCount,
      targetPackage: {
        packageId: targetPackage.packageId,
        packageCode: targetPackage.packageCode,
        packageName: targetPackage.packageName,
      },
      versionDialogText: lastVersionDialogText,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'drawings-page-initial.png'),
        search: join(outputDir, 'drawings-page-search.png'),
        detail: join(outputDir, 'drawings-page-detail.png'),
        versions: join(outputDir, 'drawings-page-versions.png'),
      },
    }

    await writeFile(join(outputDir, 'drawings-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        const detailDrawer = page.getByTestId('drawing-detail-drawer')
        if ((await detailDrawer.count()) > 0) {
          lastDrawerText = await detailDrawer.first().innerText()
        }
      } catch {}

      try {
        const versionPanel = page.getByTestId('drawing-version-detail-panel')
        if ((await versionPanel.count()) > 0) {
          lastVersionDialogText = await versionPanel.first().innerText()
        }
      } catch {}

      try {
        failureScreenshot = join(outputDir, 'drawings-page-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }

    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      lastDrawerText,
      lastVersionDialogText,
      failureScreenshot,
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'drawings-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
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
