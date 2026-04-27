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

const packageStructure = {
  packageId: 'pkg-structure',
  packageCode: 'pkg-structure',
  packageName: '缁撴瀯鏂藉伐鍥惧寘',
  disciplineType: '缁撴瀯',
  documentPurpose: '鏂藉伐鎵ц',
  status: 'preparing',
  requiresReview: false,
  reviewMode: 'none',
  reviewModeLabel: '涓嶉€傜敤',
  reviewBasis: '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸',
  completenessRatio: 75,
  missingRequiredCount: 1,
  currentVersionDrawingId: 'drawing-1',
  currentVersionNo: '1.2',
  currentVersionLabel: '褰撳墠鏈夋晥鐗?v1.2',
  currentReviewStatus: '宸查€氳繃',
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
  packageCode: 'pkg-architecture',
  packageName: '寤虹瓚鍑哄浘鍖?',
  disciplineType: '寤虹瓚',
  documentPurpose: '鎶ュ褰掓。',
  status: 'reviewing',
  requiresReview: true,
  reviewMode: 'mandatory',
  reviewModeLabel: '蹇呴』閫佸',
  reviewBasis: '鎸変笓椤瑰鍥捐鍒欐墽琛?',
  completenessRatio: 100,
  missingRequiredCount: 0,
  currentVersionDrawingId: 'drawing-2',
  currentVersionNo: '2.0',
  currentVersionLabel: '褰撳墠鏈夋晥鐗?v2.0',
  currentReviewStatus: '瀹℃煡涓?',
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
    drawingCode: 'STR-001',
    drawingName: '鍩虹鍥?',
    versionNo: '1.2',
    drawingStatus: 'issued',
    reviewStatus: '宸查€氳繃',
    isCurrentVersion: true,
    requiresReview: false,
    reviewMode: 'none',
    reviewModeLabel: '涓嶉€傜敤',
    reviewBasis: '甯歌鏂藉伐鎵ц鍖呴粯璁や笉閫佸',
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
    drawingName: '骞抽潰甯冪疆鍥?',
    versionNo: '2.0',
    drawingStatus: 'reviewing',
    reviewStatus: '瀹℃煡涓?',
    isCurrentVersion: true,
    requiresReview: true,
    reviewMode: 'mandatory',
    reviewModeLabel: '蹇呴』閫佸',
    reviewBasis: '鎸変笓椤瑰鍥捐鍒欐墽琛?',
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
      itemName: '缁撴瀯鎬昏鏄?',
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
      itemName: '鍩虹璇﹀浘',
      isRequired: true,
      status: 'missing',
      currentDrawingId: null,
      currentVersion: '',
      notes: '寰呰ˉ鍏?',
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
      changeReason: '琛ュ厖閰嶇瓔璇存槑',
      createdAt: now,
      createdBy: '娴嬭瘯鍛?',
      drawingName: '鍩虹鍥?',
    },
    {
      versionId: 'version-1',
      drawingId: 'drawing-1',
      versionNo: '1.1',
      previousVersionId: null,
      isCurrentVersion: false,
      changeReason: '鍒濈増鍙戝竷',
      createdAt: now,
      createdBy: '娴嬭瘯鍛?',
      drawingName: '鍩虹鍥?',
    },
  ],
  linkedTasks: [
    {
      id: 'task-1',
      name: '涓讳綋缁撴瀯鏂藉伐',
      status: '杩涜涓?',
      drawingConditionCount: 1,
      openConditionCount: 1,
      conditions: [
        {
          id: 'condition-1',
          name: '缁撴瀯鍥剧鍙?',
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
      name: '涓讳綋缁撴瀯楠屾敹',
      status: '鏈紑濮?',
      requirementCount: 1,
      openRequirementCount: 1,
      latestRecordAt: null,
      requirements: [
        {
          id: 'requirement-1',
          requirementType: 'drawing',
          sourceEntityType: 'drawing_package',
          sourceEntityId: packageStructure.packageId,
          description: '闇€涓婁紶褰撳墠鏈夋晥鏂藉伐鍥?',
          status: 'open',
        },
      ],
    },
  ],
  issueSignals: [
    {
      code: 'issue-signal-1',
      title: '鍥剧焊缂烘紡',
      description: '鍩虹璇﹀浘缂哄け锛屽彲鑳藉奖鍝嶆柦宸ヤ氦搴曘€?',
      severity: 'medium',
      evidence: ['缂哄け鍩虹璇﹀浘'],
      escalatedEntityType: null,
      escalatedEntityId: null,
      escalatedAt: null,
    },
  ],
  riskSignals: [
    {
      code: 'risk-signal-1',
      title: '閫佸寤惰',
      description: '閫佸鑺傜偣鏅氫簬璁″垝锛屽瓨鍦ㄨ繘搴﹂闄┿€?',
      severity: 'high',
      evidence: ['閫佸鐘舵€佷粛涓哄鏌ヤ腑'],
      escalatedEntityType: null,
      escalatedEntityId: null,
      escalatedAt: null,
    },
  ],
}

function markRequiredItemCompleted() {
  const item = detailPayload.requiredItems.find((candidate) => candidate.itemId === 'item-2')
  if (item) {
    item.status = 'available'
    item.currentVersion = '手动确认补全'
    item.notes = '详情页手动确认补全'
  }
  packageStructure.missingRequiredCount = 0
  packageStructure.completenessRatio = 100
}

const mockProject = {
  id: projectId,
  name: '鍥剧焊娴忚鍣ㄨ仈璋冮」鐩?',
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

  if (pathname === `/api/members/${projectId}/me`) {
    return json({
      success: true,
      data: {
        userId: 'drawings-owner-1',
        displayName: '图纸管理员',
        permissionLevel: 'owner',
        canEdit: true,
        canManageTeam: true,
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
    || pathname === '/api/delay-requests'
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

  if (pathname === `/api/construction-drawings/packages/${packageStructure.packageId}/items/item-2`) {
    markRequiredItemCompleted()
    return json({
      success: true,
      data: {
        item: detailPayload.requiredItems.find((candidate) => candidate.itemId === 'item-2'),
        missingRequiredCount: 0,
        completenessRatio: 100,
      },
    })
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/drawings`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('drawings-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('drawing-package-board').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('drawing-ledger').waitFor({ state: 'visible', timeout: 20000 })

    const initialCardCount = await page.locator('[data-testid^="drawing-package-card-"]').count()
    assert(initialCardCount === 2, `Expected 2 drawing package cards, got ${initialCardCount}`)
    await page.screenshot({ path: join(outputDir, 'drawings-page-initial.png'), fullPage: true })

    await page.getByTestId('drawings-search-input').fill(packageStructure.packageName)
    await page.waitForTimeout(300)
    const filteredCardCount = await page.locator('[data-testid^="drawing-package-card-"]').count()
    assert(filteredCardCount === 1, `Expected search to reduce package cards to 1, got ${filteredCardCount}`)
    await page.screenshot({ path: join(outputDir, 'drawings-page-search.png'), fullPage: true })

    await page.getByTestId(`drawing-package-detail-${packageStructure.packageId}`).click()
    await page.getByTestId('drawing-detail-drawer').waitFor({ state: 'visible', timeout: 10000 })
    const drawerText = await page.getByTestId('drawing-detail-drawer').innerText()
    assert(drawerText.includes(packageStructure.packageName), `Drawing detail drawer missing package name: ${packageStructure.packageName}`)
    await page.screenshot({ path: join(outputDir, 'drawings-page-detail.png'), fullPage: true })

    const completeMissingItem = page.getByTestId('drawing-required-item-complete-item-2')
    await completeMissingItem.waitFor({ state: 'visible', timeout: 10000 })
    await completeMissingItem.click()
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-testid="drawing-required-item-complete-item-2"]')
      return input instanceof HTMLInputElement && input.checked
    }, undefined, { timeout: 10000 })
    const completedDrawerText = await page.getByTestId('drawing-detail-drawer').innerText()
    assert(completedDrawerText.includes('已补全'), 'Drawing required item completion checkbox did not persist')
    await page.screenshot({ path: join(outputDir, 'drawings-page-required-item-completed.png'), fullPage: true })

    await page.getByRole('button', { name: '查看版本窗口' }).click()
    await page.getByTestId('drawing-version-row-version-2').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'drawings-page-versions.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      targetUrl,
      initialCardCount,
      filteredCardCount,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        initial: join(outputDir, 'drawings-page-initial.png'),
        search: join(outputDir, 'drawings-page-search.png'),
        detail: join(outputDir, 'drawings-page-detail.png'),
        requiredItemCompleted: join(outputDir, 'drawings-page-required-item-completed.png'),
        versions: join(outputDir, 'drawings-page-versions.png'),
      },
    }

    await writeFile(join(outputDir, 'drawings-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
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

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
