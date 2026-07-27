import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { isIgnorableBrowserConsoleError, primeBrowserAuth } from './browser-auth-fixture.mjs'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')

const port = Number(process.env.PORT || 4197)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const projectId = 'scope-model-browser-project'
const wizardPreviewPath = `/api/projects/${projectId}/wizard/preview`
const companyId = 'scope-model-browser-company'
const now = new Date().toISOString()
const shouldStartPreview = process.env.START_PREVIEW !== 'false'

const apiCalls = []

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
    await new Promise((resolve) => setTimeout(resolve, 300))
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
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
      VITE_DISABLE_PERMISSION_SYSTEM: 'false',
    },
  })
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function collectScopeNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => [
    node,
    ...collectScopeNodes(Array.isArray(node?.children) ? node.children : []),
  ])
}

function buildPreviewResponse(body) {
  const serializedScope = JSON.stringify(body ?? {})
  const scopeNodes = collectScopeNodes(body?.scopeTree)
  const hasRailwayZone = serializedScope.includes('railway_operation_zone')
  const hasSwitchingStation = serializedScope.includes('switching_station')
  assert(hasRailwayZone || hasSwitchingStation, 'profile preview did not receive any supported independent engineering zone')

  if (hasRailwayZone) {
    assert(scopeNodes.some((node) => node?.name === '轨行区'), 'profile preview did not receive parsed railway operation zone')
  }

  if (hasSwitchingStation) {
    const buildingCount = scopeNodes.filter((node) => node?.type === 'building').length
    assert(buildingCount === 15, `complex profile preview expected 15 buildings, received ${buildingCount}`)
    assert(scopeNodes.some((node) => node?.name === '开闭所'), 'complex profile preview did not receive switching station')
    assert(scopeNodes.some((node) => node?.name === '1号地下室'), 'complex profile preview did not receive first shared basement')
    assert(scopeNodes.some((node) => node?.name === '2号地下室'), 'complex profile preview did not receive second shared basement')
    assert(scopeNodes.some((node) => node?.name === '室外总平'), 'complex profile preview did not receive outdoor site')
    assert(scopeNodes.every((node) => node?.type !== 'building' || Number(node?.metadata?.standardFloorCount) === 26), 'complex profile preview buildings are missing the 26-floor fact')
  }

  const coverageItem = hasSwitchingStation
    ? {
        scopeObjectId: 'switching-station-1',
        scopeName: '开闭所',
        objectType: 'physical_zone',
        status: 'auto_schedulable',
        title: '开闭所 会自动生成并挂接任务',
        detail: '开闭所已命中 ELE-05-01-01 的模板挂接规则。',
        action: '无需额外处理，生成 WBS 后可按开闭所筛选和复核。',
        matchedRulePatterns: ['ELE-05-01-01'],
        requiredByTemplates: ['ELE-05-01-01'],
      }
    : {
        scopeObjectId: 'railway-zone-1',
        scopeName: '轨行区',
        objectType: 'physical_zone',
        status: 'auto_schedulable',
        title: '轨行区 会自动生成并挂接任务',
        detail: '轨行区已命中 TOD-01-01-02|TOD-04-01-08|TOD-04-01-09 的模板挂接规则。',
        action: '无需额外处理，生成 WBS 后可按轨行区筛选和复核。',
        matchedRulePatterns: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
        requiredByTemplates: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
      }

  return json({
    success: true,
    data: {
      estimatedRowCount: 180,
      recommendation: {
        matchedTemplates: [hasSwitchingStation ? 'china-electrical-specialty' : 'china-tod-upper-cover-specialty'],
        triggeredItemPacks: hasSwitchingStation
          ? ['ELE-05-01-01']
          : ['TOD-01-01-02', 'TOD-04-01-08', 'TOD-04-01-09'],
        triggeredMilestones: [],
        expectedRowCount: { overview: 80, standard: 180, detailed: 420 },
        recommendationRationale: [
          hasSwitchingStation
            ? '开闭所已识别为独立工程区，触发电气供配电专项。'
            : '轨行区已识别为独立工程区，触发 TOD 营业线防护和轨道保护专项。',
        ],
      },
      previewSummary: {
        businessType: hasSwitchingStation ? 'general_civil' : 'tod_upper_cover',
        detailLevel: 'standard',
        buildingCount: hasSwitchingStation ? 15 : 1,
        templateCount: 1,
        milestoneCount: 0,
      },
      profile: {
        identity: {
          projectName: hasSwitchingStation ? '复杂分期验证项目' : 'TOD验证项目',
          businessType: hasSwitchingStation ? 'general_civil' : 'tod_upper_cover',
          mode: 'new',
        },
        scale: {
          buildingCount: hasSwitchingStation ? 15 : 1,
          highestBuildingFloorCount: 26,
          totalAreaM2: 180000,
        },
        methods: {
          methodVariantCodes: ['cast_in_place_rebar'],
          prefabSystemCodes: [],
          elementVariantCodes: [],
          buildingPatternCodes: [],
        },
        features: {
          userSelected: {},
          inferred: {
            functionalUsageCodes: ['住宅楼'],
            functionalCategoryCodes: [],
            specialRoomTypeCodes: [],
            physicalZoneTypeCodes: hasSwitchingStation ? ['switching_station'] : ['railway_operation_zone'],
          },
        },
        generation: {
          detailLevel: 'standard',
          estimatedRowCount: 180,
          templateCount: 1,
          milestoneCount: 0,
        },
        issues: [],
        scopeCoverageDiagnostics: [],
        scopeTemplateCoverage: {
          summary: {
            autoSchedulableCount: 1,
            manualTaskRequiredCount: 0,
            missingRequiredScopeCount: 0,
          },
          items: [coverageItem],
        },
      },
    },
  })
}

function buildMockResponse(urlString, method = 'GET', postData = null) {
  const url = new URL(urlString)
  const { pathname } = url
  const body = parseJson(postData)
  apiCalls.push({ method, pathname, body })

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: 'scope-model-browser-user',
          username: 'scope-model-browser',
          display_name: 'Scope Model Browser User',
          email: 'scope-model-browser@example.com',
          role: 'owner',
          globalRole: 'company_admin',
          currentCompanyId: companyId,
          currentCompanyRole: 'company_admin',
          metadata: { wizard_onboarded_at: now },
        },
      },
    })
  }

  if (pathname === '/api/workspace') {
    return json({
      success: true,
      data: {
        hasCompany: true,
        currentCompany: { id: companyId, name: '范围建模验证公司', role: 'company_admin', isCurrent: true },
        myProjects: [{ id: projectId, name: '范围建模验证项目', status: '进行中', metadata: {} }],
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [{ id: projectId, name: '范围建模验证项目', status: '进行中', metadata: {} }] })
  }

  if (pathname === `/api/projects/${projectId}`) {
    return json({
      success: true,
      data: {
        id: projectId,
        name: '范围建模验证项目',
        status: '进行中',
        project_type: 'tod_upper_cover',
        metadata: {},
      },
    })
  }

  if (pathname === wizardPreviewPath) {
    return buildPreviewResponse(body)
  }

  if (pathname === '/api/projects/wizard') {
    return json({
      success: true,
      data: {
        id: projectId,
        projectId,
        status: '进行中',
        generation: {
          generationBatchId: 'scope-model-browser-batch',
          generatedRowCount: 180,
          createdTaskCount: 180,
          passedMilestoneCount: 0,
        },
      },
    }, 201)
  }

  if (pathname === '/api/milestone-presets') {
    return json({ success: true, data: [] })
  }

  if (pathname.startsWith('/api/companies/') && pathname.endsWith('/project-templates')) {
    return json({ success: true, data: [] })
  }

  if (pathname.startsWith('/api/companies/') && pathname.endsWith('/project-drafts')) {
    return json({ success: true, data: [] })
  }

  return json({ success: true, data: [] })
}

async function maybeClick(page, locator) {
  if (await locator.count() > 0) {
    await locator.first().click()
    return true
  }
  return false
}

const COMPLEX_INCOMPLETE_DESCRIPTION = '项目有3期，1期有2个标段，2期有3个标段，3期不分段，一共15栋楼，其中1-3#在1期1标段，4#、5#在1期2标段，6#-8#在2期1标段，9#-13#在2期2标段，2期3标段就一个开闭所，14#、15#是3期，地下室有2个，1号地下室是1-8#共用，一共3层，2号地下室是12#-15#共用，一共5层，室外总平覆盖全部楼栋'

const COMPLEX_COMPLETE_DESCRIPTION = '项目有3期，1期有2个标段，2期有3个标段，3期不分段，其中1-3#在1期1标段26层，4#、5#在1期2标段26层，6#-8#在2期1标段26层，9#-13#在2期2标段26层，2期3标段就一个开闭所，14#、15#是3期26层，地下室有2个，1号地下室是1-8#共用，一共3层，2号地下室是12#-15#共用，一共5层，室外总平覆盖全部楼栋'

const ADVANCED_SPATIAL_FEATURES_DESCRIPTION = '一期A标：3栋26层住宅楼，1栋5层医技楼，4层共享商业裙房，B2地下室，室外总平。'

async function clickNext(page) {
  await page.getByRole('button', { name: '下一步', exact: true }).click()
}

async function clickNextUntilHeading(page, headingName, maxClicks = 5) {
  for (let index = 0; index < maxClicks; index += 1) {
    if (await page.getByRole('heading', { name: headingName }).count() > 0) return
    await clickNext(page)
    await page.waitForTimeout(150)
  }
  await page.getByRole('heading', { name: headingName }).waitFor({ timeout: 10000 })
}

async function assertPageTextIncludes(page, text, message = `page text does not include ${text}`) {
  const content = await page.locator('body').textContent()
  assert(content?.includes(text), message)
}

async function clickFirstVisible(page, locator, message) {
  const count = await locator.count()
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index)
    if (await candidate.isVisible()) {
      await candidate.scrollIntoViewIfNeeded()
      await candidate.click()
      return
    }
  }
  throw new Error(message)
}

async function openBlankWizard(page, projectName) {
  await primeBrowserAuth(page, 'scope-model-browser-token')
  await page.goto(`${baseUrl}/#/projects/${projectId}/gantt?modelingWorkbench=generate&browserScenario=${encodeURIComponent(projectName)}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.getByTestId('planning-modeling-workbench-dialog').waitFor({ state: 'visible', timeout: 30000 })

  if (await page.getByRole('button', { name: /从空白开始/ }).count() > 0) {
    await page.getByRole('button', { name: /从空白开始/ }).click()
  }

  await page.getByRole('heading', { name: '项目身份与时间' }).waitFor({ state: 'visible', timeout: 30000 })
  await page.getByLabel(/项目名称/).fill(projectName)
  await page.getByLabel(/项目地点/).fill('上海')
  await page.getByLabel('总建筑面积 (m²)').fill('180000')
}

async function runAdvancedSpatialFeaturesScenario(page) {
  await openBlankWizard(page, '高级空间能力验证项目')

  await clickNextUntilHeading(page, '工程范围与体量', 3)
  await page.getByLabel('项目范围描述').fill(ADVANCED_SPATIAL_FEATURES_DESCRIPTION)
  await page.getByRole('button', { name: '从描述生成空间草稿' }).click()
  await page.getByText(/已生成 .*共享裙房.*地下空间.*室外总平/).waitFor({ state: 'visible', timeout: 10000 })
  for (const text of ['1#住宅楼', '4#医技楼', '共享裙房', '地下室', '室外总平']) {
    await assertPageTextIncludes(page, text)
  }

  await clickNextUntilHeading(page, '细化空间', 3)
  await clickFirstVisible(
    page,
    page.getByRole('button', { name: /配置 .*1#住宅楼/ }),
    'advanced spatial scenario could not select the first residential building',
  )
  await page.getByText('当前空间已记录 26 层，但尚未展开楼层。输入 L1、L13 或 B1 后标注，系统会自动生成楼层记录。').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('要标注的楼层').fill('L13')
  await page.getByRole('button', { name: '标注为避难层' }).click()
  await page.getByText('已自动展开 26 层，并标注 1 个特殊楼层。').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('scope-node-floor-L13').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('scope-node-floor-L13').getByText('避难层').waitFor({ state: 'visible', timeout: 10000 })

  await clickFirstVisible(
    page,
    page.getByRole('button', { name: /配置 .*地下室/ }),
    'advanced spatial scenario could not select the basement',
  )
  await page.getByLabel('细分方式').selectOption('by_floor')
  await page.getByText('按已录入的 2 层地下室生成 B1-B2，不需要重复填写层数。').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '生成地下层' }).click()
  await page.getByTestId('scope-node-floor-B1').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('scope-node-floor-B2').waitFor({ state: 'visible', timeout: 10000 })

  await page.getByRole('button', { name: '继续划分 B1' }).click()
  await page.getByText(/当前配置：.*地下室 \/ B1/).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByLabel('细分方式').selectOption('by_physical_zone')
  await page.getByLabel('分区名称').fill('A区')
  await page.getByRole('button', { name: '生成分区' }).click()
  await page.getByTestId('scope-node-physical_zone-A区').waitFor({ state: 'visible', timeout: 10000 })

  await clickNextUntilHeading(page, '确认范围', 2)
  const generationBasis = page.getByLabel('WBS 自动生成依据')
  await generationBasis.getByText('地下室防水 / 基坑').waitFor({ state: 'visible', timeout: 10000 })
  await generationBasis.getByText('室外工程').waitFor({ state: 'visible', timeout: 10000 })
  await generationBasis.getByText('避难层专项').waitFor({ state: 'visible', timeout: 10000 })

  return {
    sharedPodiumParsed: true,
    specialFloorMarked: true,
    basementHorizontalZoneCreated: true,
    wbsBasisShowsSpecialTemplates: true,
  }
}

async function runScopeModelingScenario(page) {
  await openBlankWizard(page, 'TOD验证项目')

  await clickNextUntilHeading(page, '工程范围与体量', 3)
  await page.getByLabel('项目范围描述').fill('项目有1期，1期有1个标段，1#住宅楼26层，1期1标段有轨行区，B2地下室，室外总平。')
  await page.getByRole('button', { name: '从描述生成空间草稿' }).click()
  await page.getByText(/已生成/).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('轨行区', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })

  await clickNextUntilHeading(page, '关键特征与专项约束', 4)
  await clickNextUntilHeading(page, '确认项目画像', 2)

  await page.getByText('任务挂接检查').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('可以直接生成任务').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('轨行区 会自动生成并挂接任务').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText(/TOD-01-01-02/).first().waitFor({ state: 'visible', timeout: 10000 })

  const previewCall = apiCalls.find((call) => call.pathname === wizardPreviewPath)
  assert(previewCall, 'wizard profile preview API was not called')
  assert(JSON.stringify(previewCall.body).includes('railway_operation_zone'), 'preview payload lacks railway_operation_zone')

  return {
    previewCalled: Boolean(previewCall),
    apiCallCount: apiCalls.length,
    finalUrl: page.url(),
  }
}

async function runComplexIncompleteScenario(page) {
  const previewCountBefore = apiCalls.filter((call) => call.pathname === wizardPreviewPath).length
  await openBlankWizard(page, '复杂范围缺口验证项目')

  await clickNextUntilHeading(page, '工程范围与体量', 3)
  await page.getByLabel('项目范围描述').fill(COMPLEX_INCOMPLETE_DESCRIPTION)
  await page.getByRole('button', { name: '从描述生成空间草稿' }).click()
  await page.getByText(/已生成 3 个分期、5 个标段、15 栋单体/).waitFor({ state: 'visible', timeout: 10000 })
  for (const text of ['1期', '2期', '3期', '开闭所', '1号地下室', '2号地下室', '室外总平']) {
    await assertPageTextIncludes(page, text)
  }

  await clickNextUntilHeading(page, '确认范围', 3)
  await clickNext(page)
  await page.getByText(/仍有 WBS 必要信息待补充|缺少楼层信息/).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('heading', { name: '确认范围' }).waitFor({ state: 'visible', timeout: 10000 })

  const previewCountAfter = apiCalls.filter((call) => call.pathname === wizardPreviewPath).length
  assert(previewCountAfter === previewCountBefore, 'incomplete complex scope should not call profile preview')

  return {
    parsedComplexStructure: true,
    previewBlockedUntilFloorsAreProvided: true,
  }
}

async function runComplexCompleteScenario(page) {
  const previewCountBefore = apiCalls.filter((call) => call.pathname === wizardPreviewPath).length
  await openBlankWizard(page, '复杂分期验证项目')

  await clickNextUntilHeading(page, '工程范围与体量', 3)
  await page.getByLabel('项目范围描述').fill(COMPLEX_COMPLETE_DESCRIPTION)
  await page.getByRole('button', { name: '从描述生成空间草稿' }).click()
  await page.getByText(/已生成 3 个分期、5 个标段、15 栋单体/).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('开闭所', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })

  await clickNextUntilHeading(page, '确认范围', 3)
  await clickNextUntilHeading(page, '关键特征与专项约束', 2)
  await clickNextUntilHeading(page, '确认项目画像', 2)

  await page.getByText('任务挂接检查').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('开闭所 会自动生成并挂接任务').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText(/ELE-05-01-01/).first().waitFor({ state: 'visible', timeout: 10000 })

  const previewCalls = apiCalls.filter((call) => call.pathname === wizardPreviewPath)
  const complexPreview = previewCalls.at(-1)
  assert(previewCalls.length === previewCountBefore + 1, 'complete complex scope should call profile preview exactly once')
  assert(JSON.stringify(complexPreview?.body ?? {}).includes('switching_station'), 'complex preview payload lacks switching_station metadata')

  return {
    previewCalled: true,
    complexIndependentZoneAttached: true,
  }
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
  if (!previewReady) throw new Error(`Preview server is not reachable at ${baseUrl}`)

  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const pageErrors = []

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
    page.setDefaultTimeout(30000)

    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (!isIgnorableBrowserConsoleError(text)) consoleErrors.push(text)
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.route(`${baseUrl}/api/**`, async (route) => {
      await route.fulfill(buildMockResponse(
        route.request().url(),
        route.request().method().toUpperCase(),
        route.request().postData(),
      ))
    })

    const scenarios = {
      railwaySingleZone: await runScopeModelingScenario(page),
      complexIncompleteScope: await runComplexIncompleteScenario(page),
      complexCompleteScope: await runComplexCompleteScenario(page),
      advancedSpatialFeatures: await runAdvancedSpatialFeaturesScenario(page),
    }
    const resultPayload = {
      mode: 'mock-api-browser',
      generatedAt: now,
      scenarios,
      consoleErrors,
      pageErrors,
      apiCalls: apiCalls.map(({ method, pathname }) => ({ method, pathname })),
    }

    await page.screenshot({ path: join(outputDir, 'scope-modeling-wizard-browser-check.png'), fullPage: true })
    await writeFile(join(outputDir, 'scope-modeling-wizard-browser-check.json'), `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(resultPayload, null, 2))

    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
  } catch (error) {
    const failurePayload = {
      mode: 'mock-api-browser',
      generatedAt: now,
      error: error instanceof Error ? error.message : String(error),
      consoleErrors,
      pageErrors,
      apiCalls: apiCalls.map(({ method, pathname }) => ({ method, pathname })),
    }
    await writeFile(join(outputDir, 'scope-modeling-wizard-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    throw error
  } finally {
    await browser.close()
    if (previewProcess) previewProcess.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
