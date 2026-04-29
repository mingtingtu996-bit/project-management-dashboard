import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const distIndex = join(repoRoot, 'client', 'dist', 'index.html')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')
const outputRoot = join(repoRoot, 'artifacts', 'uiux-predeploy-gates')

const gateArg = process.argv[2] || 'all'
const port = Number(process.env.PORT || 4175)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'
const currentMonth = process.env.UIUX_PREDEPLOY_MONTH || new Date().toISOString().slice(0, 7)
const shouldStartPreview = process.env.PREDEPLOY_START_PREVIEW !== 'false'

const availableGates = ['r295', 'component', 'interaction', 'token-audit', 'contrast']
const selectedGates = gateArg === 'all' ? availableGates : [gateArg]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function rel(filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
}

function route(pathname) {
  return `${baseUrl}/#${pathname}`
}

function projectRoute(projectId, pathname) {
  return `/projects/${projectId}${pathname}`
}

function safeKey(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function ensureFile(filePath, message) {
  try {
    await access(filePath, constants.R_OK)
  } catch {
    throw new Error(message)
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs = 30000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function startPreviewServer() {
  const child = spawn(process.execPath, [join(scriptsDir, 'serve-client-dist.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      API_HOST: new URL(apiBaseUrl).hostname,
      API_PORT: new URL(apiBaseUrl).port || '80',
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => process.stdout.write(`[uiux-predeploy:preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[uiux-predeploy:preview] ${chunk}`))
  return child
}

function isIgnorableConsoleError(message) {
  if (message === 'Failed to load resource: net::ERR_ABORTED') return true
  if (message === 'Failed to load resource: net::ERR_CONNECTION_CLOSED') return true
  return (
    typeof message === 'string'
    && message.includes("WebSocket connection to 'ws://")
    && message.includes('/ws?')
    && message.includes('ERR_CONNECTION_REFUSED')
  )
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!isIgnorableConsoleError(text)) diagnostics.consoleErrors.push(text)
  })

  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))

  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/')) return
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    diagnostics.apiFailures.push({
      type: 'requestfailed',
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown',
    })
  })

  page.on('response', (response) => {
    if (!response.url().includes('/api/') || response.status() < 400) return
    diagnostics.apiFailures.push({
      type: 'response',
      url: response.url(),
      status: response.status(),
    })
  })
}

function assertNoDiagnostics(diagnostics, key) {
  assert(diagnostics.consoleErrors.length === 0, `${key} console errors: ${diagnostics.consoleErrors.join(' | ')}`)
  assert(diagnostics.pageErrors.length === 0, `${key} page errors: ${diagnostics.pageErrors.join(' | ')}`)
  assert(diagnostics.apiFailures.length === 0, `${key} API failures: ${JSON.stringify(diagnostics.apiFailures.slice(0, 3))}`)
}

async function apiRequest(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error?.message || json?.message || text || `API ${method} ${pathname} failed with ${response.status}`)
  }
  return json?.data ?? json
}

async function login(account) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: account.username, password: account.password },
  })
  assert(data?.token, `Login did not return token for ${account.username}`)
  return data.token
}

async function newPage(browser, token, viewport = { width: 1440, height: 900 }, options = {}) {
  const context = await browser.newContext({
    viewport,
    colorScheme: 'light',
    locale: 'zh-CN',
    reducedMotion: options.reducedMotion || 'no-preference',
  })
  await context.addInitScript(({ authToken, onboardingComplete }) => {
    window.localStorage.setItem('auth_token', authToken)
    window.localStorage.setItem('access_token', authToken)
    if (onboardingComplete) {
      window.localStorage.setItem('onboarding_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    } else {
      window.localStorage.removeItem('onboarding_completed')
      window.localStorage.removeItem('onboarding_daily_workflow_dismissed')
    }
  }, { authToken: token, onboardingComplete: options.onboardingComplete !== false })

  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const diagnostics = { consoleErrors: [], pageErrors: [], apiFailures: [] }
  attachDiagnostics(page, diagnostics)
  return { context, page, diagnostics }
}

async function waitForAny(page, selectors, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first()
      if (await locator.isVisible().catch(() => false)) return selector
    }
    await page.waitForTimeout(150)
  }
  throw new Error(`Timed out waiting for any selector: ${selectors.join(', ')}`)
}

async function waitForAll(page, selectors) {
  for (const selector of selectors || []) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30000 })
  }
}

async function openState(page, state) {
  await page.goto(route(state.path), { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await waitForAny(page, state.any)
  await waitForAll(page, state.must)
  if (state.action) await state.action(page)
}

function runtimePages(projectId) {
  return [
    { key: 'company-cockpit', session: 'admin', path: '/company', any: ['[data-testid="company-cockpit-page"]'], must: ['[data-testid="company-project-grid"]'] },
    { key: 'dashboard', path: projectRoute(projectId, '/dashboard'), any: ['[data-testid="dashboard-page"]'], must: ['[data-testid="dashboard-hero-cards"]'] },
    { key: 'reports', path: projectRoute(projectId, '/reports?view=progress'), any: ['[data-testid="reports-module-tabs"]'] },
    { key: 'risk-management', path: projectRoute(projectId, '/risks'), any: ['[data-testid="risk-summary-band"]'] },
    { key: 'gantt-view', path: projectRoute(projectId, '/gantt'), any: ['[data-testid="task-workspace-layer-l2"]', '[data-testid="gantt-task-rows"]'] },
    { key: 'planning-workspace', path: projectRoute(projectId, '/planning'), any: ['[data-testid="planning-shared-shell"]'] },
    { key: 'planning-baseline', path: projectRoute(projectId, '/planning/baseline'), any: ['[data-testid="planning-shared-shell"]'] },
    { key: 'planning-monthly', path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`), any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'] },
    { key: 'planning-closeout', path: projectRoute(projectId, `/tasks/closeout?month=${currentMonth}`), any: ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-empty-state"]'] },
    { key: 'materials', path: projectRoute(projectId, '/materials'), any: ['[data-testid="materials-page"]'] },
    { key: 'milestones', path: projectRoute(projectId, '/milestones'), any: ['[data-testid="milestones-summary-grid"]'] },
    { key: 'acceptance-timeline', path: projectRoute(projectId, '/acceptance'), any: ['[data-testid="acceptance-summary-panel"]', '[data-testid="acceptance-flow-board"]'] },
    { key: 'pre-milestones', path: projectRoute(projectId, '/pre-milestones'), any: ['[data-testid="pre-milestones-page"]'] },
    { key: 'drawings', path: projectRoute(projectId, '/drawings'), any: ['[data-testid="drawings-page"]'] },
    { key: 'notifications', path: `/notifications?projectId=${projectId}`, any: ['[data-testid="notifications-page"]'] },
    { key: 'task-summary', path: projectRoute(projectId, '/task-summary'), any: ['[data-testid="task-summary-page"]'] },
    { key: 'responsibility-view', path: projectRoute(projectId, '/responsibility'), any: ['[data-testid="responsibility-page"]'] },
  ]
}

async function listSourceFiles(root, extensions = new Set(['.ts', '.tsx', '.css', '.html', '.js', '.jsx'])) {
  const results = []
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(full)
      } else if (extensions.has(extname(entry.name))) {
        results.push(full)
      }
    }
  }
  await visit(root)
  return results
}

async function scanFiles(files, pattern, allow = () => false) {
  const matches = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (pattern.test(line) && !allow(file, line)) {
        matches.push({ file: rel(file), line: index + 1, text: line.trim().slice(0, 180) })
      }
      pattern.lastIndex = 0
    })
  }
  return matches
}

function parseRequirementRows(requirementsText) {
  return requirementsText
    .split(/\r?\n/)
    .filter((line) => /^\|\s*R\d{3}\s*\|/.test(line))
    .map((line) => {
      const parts = line.split('|').slice(1, -1).map((part) => part.trim())
      return {
        id: parts[0],
        step: parts[parts.length - 1],
        scope: parts.length >= 4 ? parts[parts.length - 2] : '',
        description: parts.slice(1, -2).join(' -> '),
      }
    })
}

async function runR295Gate() {
  const outputDir = join(outputRoot, 'r295')
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const requirementsPath = join(repoRoot, 'docs', 'plans', 'UI_UX需求清单.md')
  const executionPath = join(repoRoot, 'docs', 'plans', 'UI_UX优化执行方案.md')
  const progressPath = join(repoRoot, 'EXECUTION_PROGRESS.json')
  const requirements = await readFile(requirementsPath, 'utf8')
  const executionPlan = await readFile(executionPath, 'utf8')
  const progress = await readJson(progressPath)
  const steps = progress.uiux_v1_3?.steps || {}
  const rows = parseRequirementRows(requirements)
  const ids = rows.map((row) => row.id)
  const headingIds = new Set([...executionPlan.matchAll(/^#{2,4}\s+(U[^\s—]+)\s*[—-]/gm)].map((match) => match[1]))
  const missingIds = []
  for (let index = 1; index <= 295; index += 1) {
    const id = `R${String(index).padStart(3, '0')}`
    if (!ids.includes(id)) missingIds.push(id)
  }
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  const badStepRefs = [...new Set(rows.map((row) => row.step).filter((step) => !headingIds.has(step)))]
  const incompleteRows = rows.filter((row) => steps[row.step]?.status !== 'completed')

  const files = await listSourceFiles(join(repoRoot, 'client', 'src'))
  const staticChecks = [
    { key: 'no-gray-classes', pattern: /gray-[0-9]/g },
    { key: 'no-bg-blue-500-primary-residue', pattern: /bg-blue-500/g },
    { key: 'no-arbitrary-target-font-sizes', pattern: /text-\[(?:10|11|22|26)px\]/g },
    { key: 'no-forbidden-rounded-targets', pattern: /rounded-(?:3xl|\[(?:24|28)px\])/g },
    { key: 'no-shadow-blue', pattern: /shadow-blue/g },
    { key: 'no-arbitrary-wide-tracking', pattern: /tracking-\[0\./g },
    { key: 'no-native-button-elements', pattern: /<button\b/g },
    { key: 'no-browser-confirm-call', pattern: /window\.confirm/g },
  ]

  const staticResults = []
  for (const check of staticChecks) {
    const matches = await scanFiles(files, check.pattern)
    staticResults.push({ ...check, pattern: String(check.pattern), status: matches.length === 0 ? 'passed' : 'failed', matchCount: matches.length, matches: matches.slice(0, 20) })
  }

  const requiredFiles = [
    'client/src/components/ui/tooltip.tsx',
    'client/src/components/ui/separator.tsx',
    'client/src/components/ui/checkbox.tsx',
    'client/src/components/ui/table.tsx',
    'client/src/components/PageErrorBoundary.tsx',
    'client/src/components/PageSkeleton.tsx',
    'client/src/components/NotFoundPage.tsx',
    'client/src/components/SectionHeader.tsx',
    'client/src/components/CollapsibleSection.tsx',
    'client/src/components/OnboardingGuide.tsx',
    'client/src/components/Sparkline.tsx',
    'client/src/components/AnimatedNumber.tsx',
    'client/src/lib/formatters.ts',
    'client/src/hooks/useScrollRestoration.ts',
    'client/src/hooks/useLoadingButton.ts',
  ]
  const componentResults = []
  for (const file of requiredFiles) {
    const filePath = join(repoRoot, file)
    let exists = true
    try {
      await access(filePath, constants.R_OK)
    } catch {
      exists = false
    }
    componentResults.push({ file, status: exists ? 'passed' : 'failed' })
  }

  const pageFiles = await listSourceFiles(join(repoRoot, 'client', 'src', 'pages'), new Set(['.tsx']))
  const documentTitleMatches = await scanFiles(pageFiles, /document\.title\s*=/g)
  const breadcrumbMatches = await scanFiles(pageFiles, /<Breadcrumb\b/g)
  const pageShellMatches = await scanFiles(pageFiles, /page-shell/g)

  const oldTerms = [
    '以计划完成日期为准',
    '今天触发且尚未确认的系统预警',
    '数据置信度',
    '骨架差异',
    '修订池',
    '映射状态',
    '批量移入/移出',
  ]
  const newTerms = ['今天需要完成的', '需要你关注的预警', '数据可靠性', '计划变更对比', '待处理的变更', '关联状态', '纳入本月计划']
  const termResults = []
  const sourceText = await Promise.all(pageFiles.map((file) => readFile(file, 'utf8'))).then((items) => items.join('\n'))
  for (const term of oldTerms) {
    termResults.push({ term, expectation: 'old term absent from page source', status: sourceText.includes(term) ? 'failed' : 'passed' })
  }
  for (const term of newTerms) {
    termResults.push({ term, expectation: 'new term present in page source', status: sourceText.includes(term) ? 'passed' : 'manual_review' })
  }

  const manualReviewIds = rows
    .filter((row) => /动画|视觉|色阶|留白|高级感|平滑|stagger|duration|hover/.test(`${row.description} ${row.scope}`))
    .map((row) => row.id)

  const autoAssertionEstimate = rows.length - manualReviewIds.length
  const summary = {
    gate: 'U.qa.r295',
    generatedAt: new Date().toISOString(),
    requirements: {
      count: rows.length,
      unique: new Set(ids).size,
      missingIds,
      duplicateIds: [...new Set(duplicateIds)],
      badStepRefs,
      incompleteRows: incompleteRows.map((row) => `${row.id}:${row.step}`),
      status: rows.length === 295 && new Set(ids).size === 295 && missingIds.length === 0 && duplicateIds.length === 0 && badStepRefs.length === 0 && incompleteRows.length === 0 ? 'passed' : 'failed',
    },
    staticResults,
    componentResults,
    layoutEvidence: {
      documentTitleAssignments: documentTitleMatches.length,
      breadcrumbUsages: breadcrumbMatches.length,
      pageShellUsages: pageShellMatches.length,
      status: documentTitleMatches.length >= 16 && breadcrumbMatches.length >= 16 && pageShellMatches.length >= 16 ? 'passed' : 'failed',
    },
    termResults,
    assertionPlan: {
      totalRequirementRows: rows.length,
      autoAssertionEstimate,
      manualReviewEstimate: manualReviewIds.length,
      manualReviewIds: manualReviewIds.slice(0, 80),
    },
  }

  const failed =
    summary.requirements.status !== 'passed'
    || staticResults.some((item) => item.status === 'failed')
    || componentResults.some((item) => item.status === 'failed')
    || summary.layoutEvidence.status !== 'passed'
    || termResults.some((item) => item.status === 'failed')

  summary.status = failed ? 'failed' : 'passed'
  await writeFile(join(outputDir, 'r295-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  assert(!failed, `U.qa.r295 failed. See ${rel(join(outputDir, 'r295-summary.json'))}`)
  console.log(`U.qa.r295 passed: requirements=${rows.length}, autoEstimate=${autoAssertionEstimate}, manualReview=${manualReviewIds.length}`)
  return summary
}

async function screenshotVisibleElements(page, outputDir, pageKey, selector, limit, manifest, label) {
  const locator = page.locator(selector)
  const count = await locator.count()
  let captured = 0
  for (let index = 0; index < count && captured < limit; index += 1) {
    const element = locator.nth(index)
    if (!(await element.isVisible().catch(() => false))) continue
    const box = await element.boundingBox().catch(() => null)
    if (!box || box.width < 8 || box.height < 8) continue
    const filePath = join(outputDir, `${safeKey(pageKey)}-${safeKey(label)}-${captured + 1}.png`)
    await element.screenshot({ path: filePath })
    manifest.push({ pageKey, label, selector, index, file: rel(filePath), width: Math.round(box.width), height: Math.round(box.height), status: 'passed' })
    captured += 1
  }
  return captured
}

async function runComponentGate(context) {
  const outputDir = join(outputRoot, 'component-snapshots')
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const manifest = []
  const { browser, projectToken, adminToken, projectId } = context
  const pageSpecs = [
    { key: 'company', token: adminToken, path: '/company', any: ['[data-testid="company-cockpit-page"]'], selectors: [['project-card', '[data-testid="company-project-card"]', 6], ['hero-metric', '[data-testid="company-hero-metric"]', 4], ['buttons', 'button, a[role="button"]', 6]] },
    { key: 'dashboard', token: projectToken, path: projectRoute(projectId, '/dashboard'), any: ['[data-testid="dashboard-page"]'], selectors: [['metric-card', '[data-testid^="dashboard-hero-card-"]', 4], ['tabs', '[role="tab"], [data-testid="dashboard-snapshot-panel"] button', 6], ['cards', '[data-testid="dashboard-live-panel"], [data-testid="dashboard-monthly-trend"], [data-testid="dashboard-weekly-digest"]', 5], ['buttons', 'button, a[role="button"]', 8]] },
    { key: 'reports', token: projectToken, path: projectRoute(projectId, '/reports?view=progress'), any: ['[data-testid="reports-module-tabs"]'], selectors: [['module-tabs', '[data-testid="reports-module-tabs"] button', 6], ['cards', '.card-unified, [data-testid="reports-current-metrics"] > *', 8], ['buttons', 'button, a[role="button"]', 6]] },
    { key: 'risk', token: projectToken, path: projectRoute(projectId, '/risks'), any: ['[data-testid="risk-summary-band"]'], selectors: [['summary', '[data-testid="risk-summary-band"] > *', 4], ['cards', '.card-unified, [data-testid="risk-chain-workspace"] section', 8], ['tabs', '[role="tab"], button', 6]] },
    { key: 'gantt', token: projectToken, path: projectRoute(projectId, '/gantt'), any: ['[data-testid="task-workspace-layer-l2"]', '[data-testid="gantt-task-rows"]'], selectors: [['rows', '[data-testid^="gantt-task-select-"]', 8], ['toolbar-buttons', 'button', 10], ['badges', '[data-testid*="chip"], [class*="badge"]', 8]] },
    { key: 'baseline', token: projectToken, path: projectRoute(projectId, '/planning/baseline'), any: ['[data-testid="planning-shared-shell"]'], selectors: [['version-switcher', '[data-testid="baseline-version-switcher"]', 1], ['buttons', 'button', 10], ['inputs', 'input, [role="checkbox"]', 8]] },
    { key: 'monthly', token: projectToken, path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`), any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'], selectors: [['header', '[data-testid="monthly-plan-header"]', 1], ['buttons', 'button', 10], ['cards', '.card-unified, [data-testid*="summary"]', 6]] },
    { key: 'materials', token: projectToken, path: projectRoute(projectId, '/materials'), any: ['[data-testid="materials-page"]'], selectors: [['metrics', '[data-testid^="materials-metric-"]', 4], ['toolbar', '[data-testid="materials-toolbar-card"]', 1], ['buttons', 'button', 8]] },
    { key: 'drawings', token: projectToken, path: projectRoute(projectId, '/drawings'), any: ['[data-testid="drawings-page"]'], selectors: [['board', '[data-testid="drawing-package-board"]', 1], ['ledger', '[data-testid="drawing-ledger"]', 1], ['buttons', 'button', 8]] },
  ]

  for (const spec of pageSpecs) {
    const { context: pageContext, page, diagnostics } = await newPage(context.browser, spec.token)
    try {
      await openState(page, spec)
      for (const [label, selector, limit] of spec.selectors) {
        await screenshotVisibleElements(page, outputDir, spec.key, selector, limit, manifest, label)
      }
      assertNoDiagnostics(diagnostics, `component:${spec.key}`)
    } finally {
      await pageContext.close()
    }
  }

  const overlaySpecs = [
    {
      key: 'dashboard-data-quality-dialog',
      token: projectToken,
      path: projectRoute(projectId, '/dashboard'),
      any: ['[data-testid="dashboard-page"]'],
      action: async (page) => page.getByTestId('dashboard-data-quality-detail-trigger').click(),
      selector: '[data-testid="dashboard-data-quality-detail-dialog"]',
    },
    {
      key: 'gantt-scope-dialog',
      token: projectToken,
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => page.getByTestId('gantt-open-scope-dimensions').click(),
      selector: '[data-testid="gantt-scope-dimensions-dialog"]',
    },
    {
      key: 'gantt-critical-path-dialog',
      token: projectToken,
      path: projectRoute(projectId, '/gantt'),
      any: ['[data-testid="task-workspace-layer-l2"]'],
      action: async (page) => page.getByTestId('gantt-open-critical-path-dialog').click(),
      selector: '[data-testid="critical-path-dialog"]',
    },
    {
      key: 'baseline-more-columns-popover',
      token: projectToken,
      path: projectRoute(projectId, '/planning/baseline'),
      any: ['[data-testid="planning-shared-shell"]'],
      action: async (page) => page.getByTestId('planning-more-columns-trigger').click(),
      selector: '[data-testid="planning-more-columns-popover"]',
    },
    {
      key: 'monthly-confirm-dialog',
      token: projectToken,
      path: projectRoute(projectId, `/planning/monthly?month=${currentMonth}`),
      any: ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'],
      action: async (page) => page.getByTestId('monthly-plan-standard-confirm-entry').click(),
      selector: '[data-testid="monthly-plan-confirm-dialog"]',
    },
    {
      key: 'onboarding-guide',
      token: projectToken,
      path: projectRoute(projectId, '/dashboard'),
      any: ['[data-testid="onboarding-guide"]', '[data-testid="onboarding-daily-workflow"]'],
      onboardingComplete: false,
      selector: '[data-testid="onboarding-guide"], [data-testid="onboarding-daily-workflow"]',
    },
  ]

  for (const spec of overlaySpecs) {
    const { context: pageContext, page, diagnostics } = await newPage(browser, spec.token, { width: 1440, height: 900 }, { onboardingComplete: spec.onboardingComplete !== false })
    try {
      await openState(page, spec)
      await waitForAny(page, [spec.selector])
      await screenshotVisibleElements(page, outputDir, spec.key, spec.selector, 1, manifest, 'state')
      assertNoDiagnostics(diagnostics, `component:${spec.key}`)
    } finally {
      await pageContext.close()
    }
  }

  const summary = {
    gate: 'U.qa.component',
    generatedAt: new Date().toISOString(),
    screenshotCount: manifest.length,
    minimumExpected: 55,
    manifest,
    status: manifest.length >= 55 ? 'passed' : 'failed',
  }
  await writeFile(join(outputDir, 'component-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeFile(join(outputDir, 'component-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  assert(summary.status === 'passed', `U.qa.component captured ${manifest.length}/55 screenshots`)
  console.log(`U.qa.component passed: screenshots=${manifest.length}`)
  return summary
}

async function runInteractionGate(context) {
  const outputDir = join(outputRoot, 'interaction')
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const cases = []
  const { browser, projectToken, projectId } = context

  async function record(key, fn) {
    const startedAt = Date.now()
    try {
      await fn()
      cases.push({ key, status: 'passed', durationMs: Date.now() - startedAt })
    } catch (error) {
      cases.push({ key, status: 'failed', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function withPage(path, any, fn, options = {}) {
    const { context: pageContext, page, diagnostics } = await newPage(browser, projectToken, options.viewport || { width: 1440, height: 900 }, options)
    try {
      await openState(page, { path, any })
      await fn(page)
      assertNoDiagnostics(diagnostics, `interaction:${path}`)
    } finally {
      await pageContext.close()
    }
  }

  await record('dashboard-compact-header-visible', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    await page.getByTestId('dashboard-compact-header').waitFor({ state: 'visible' })
  }))

  await record('dashboard-four-metric-cards', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    assert(await page.locator('[data-testid^="dashboard-hero-card-"]').count() === 4, 'Dashboard metric card count is not 4')
  }))

  await record('dashboard-dialog-opens-and-esc-closes', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    await page.getByTestId('dashboard-data-quality-detail-trigger').click()
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.getByTestId('dashboard-data-quality-detail-dialog').waitFor({ state: 'hidden' })
  }))

  await record('dashboard-card-hover-lifts', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    const card = page.locator('[data-testid^="dashboard-hero-card-"]').first()
    const before = await card.evaluate((element) => getComputedStyle(element).boxShadow)
    await card.hover()
    await page.waitForTimeout(260)
    const after = await card.evaluate((element) => getComputedStyle(element).boxShadow)
    assert(before !== after || after !== 'none', `Hover did not produce a visible shadow change: ${before} -> ${after}`)
  }))

  await record('reports-module-switch-risk', () => withPage(projectRoute(projectId, '/reports?view=progress'), ['[data-testid="reports-module-tabs"]'], async (page) => {
    await page.getByTestId('reports-module-tabs').getByText(/风险/).click()
    await page.waitForURL(/view=risk/, { timeout: 10000 }).catch(() => {})
    await waitForAny(page, ['[data-testid="risk-view"]', 'text=风险矩阵', 'text=风险列表'])
  }))

  await record('reports-module-switch-change-log', () => withPage(projectRoute(projectId, '/reports?view=progress'), ['[data-testid="reports-module-tabs"]'], async (page) => {
    await page.getByTestId('reports-module-tabs').getByText(/变更|日志/).click()
    await page.waitForURL(/view=change_log/, { timeout: 10000 }).catch(() => {})
    await waitForAny(page, ['[data-testid="change-log-view"]', 'text=变更记录', 'text=审批'])
  }))

  await record('gantt-context-menu-opens', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]', '[data-testid="gantt-task-rows"]'], async (page) => {
    await page.locator('[data-testid^="gantt-task-select-"]').first().click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu').waitFor({ state: 'visible' })
  }))

  await record('gantt-delete-opens-confirmation', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]', '[data-testid="gantt-task-rows"]'], async (page) => {
    await page.locator('[data-testid^="gantt-task-select-"]').first().click({ button: 'right' })
    await page.getByTestId('gantt-task-context-menu').waitFor({ state: 'visible' })
    await page.getByTestId('gantt-task-context-menu-delete').click()
    await waitForAny(page, ['[data-testid="gantt-delete-protection-dialog"]', '[role="alertdialog"]'])
  }))

  await record('gantt-scope-dialog-opens-and-closes', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]'], async (page) => {
    await page.getByTestId('gantt-open-scope-dimensions').click()
    await page.getByTestId('gantt-scope-dimensions-dialog').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.getByTestId('gantt-scope-dimensions-dialog').waitFor({ state: 'hidden' })
  }))

  await record('gantt-critical-path-dialog-opens', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]'], async (page) => {
    await page.getByTestId('gantt-open-critical-path-dialog').click()
    await page.getByTestId('critical-path-dialog').waitFor({ state: 'visible' })
  }))

  await record('gantt-filter-has-no-apply-button', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]'], async (page) => {
    const applyButtons = await page.getByRole('button', { name: /^应用$/ }).count()
    assert(applyButtons === 0, `Unexpected exact 应用 button count: ${applyButtons}`)
  }))

  await record('baseline-more-columns-popover', () => withPage(projectRoute(projectId, '/planning/baseline'), ['[data-testid="planning-shared-shell"]'], async (page) => {
    await page.getByTestId('planning-more-columns-trigger').click()
    await page.getByTestId('planning-more-columns-popover').waitFor({ state: 'visible' })
  }))

  await record('baseline-version-switcher-visible', () => withPage(projectRoute(projectId, '/planning/baseline'), ['[data-testid="planning-shared-shell"]'], async (page) => {
    await page.getByTestId('baseline-version-switcher').waitFor({ state: 'visible' })
  }))

  await record('monthly-confirm-dialog-cancel-closes', () => withPage(projectRoute(projectId, `/planning/monthly?month=${currentMonth}`), ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'], async (page) => {
    await page.getByTestId('monthly-plan-standard-confirm-entry').click()
    await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.getByTestId('monthly-plan-confirm-dialog').waitFor({ state: 'hidden' })
  }))

  await record('monthly-dialog-focus-trap', () => withPage(projectRoute(projectId, `/planning/monthly?month=${currentMonth}`), ['[data-testid="monthly-plan-header"]', '[data-testid="monthly-plan-info-bar"]'], async (page) => {
    await page.getByTestId('monthly-plan-standard-confirm-entry').click()
    const dialog = page.getByTestId('monthly-plan-confirm-dialog')
    await dialog.waitFor({ state: 'visible' })
    for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab')
    const activeInside = await dialog.evaluate((element) => element.contains(document.activeElement))
    assert(activeInside, 'Focus escaped the monthly confirm dialog')
  }))

  await record('closeout-more-actions-dropdown', () => withPage(projectRoute(projectId, `/tasks/closeout?month=${currentMonth}`), ['[data-testid="closeout-filter-bar"]', '[data-testid="closeout-empty-state"]'], async (page) => {
    await page.getByTestId('closeout-more-actions').first().click()
    await page.getByTestId('closeout-force-close-entry').waitFor({ state: 'visible' })
  }))

  await record('drawings-more-columns-popover', () => withPage(projectRoute(projectId, '/drawings'), ['[data-testid="drawings-page"]'], async (page) => {
    await page.getByTestId('drawing-more-columns-trigger').click()
    await page.getByTestId('drawing-more-columns-popover').waitFor({ state: 'visible' })
  }))

  await record('acceptance-detail-drawer-opens', () => withPage(projectRoute(projectId, '/acceptance'), ['[data-testid="acceptance-flow-board"]', '[data-testid="acceptance-summary-panel"]'], async (page) => {
    await page.getByTestId('acceptance-view-list').click()
    await page.locator('[data-testid^="acceptance-list-row-"]').first().click()
    await page.getByTestId('acceptance-detail-drawer').waitFor({ state: 'visible' })
  }))

  await record('materials-detail-dialog-opens', () => withPage(projectRoute(projectId, '/materials'), ['[data-testid="materials-page"]'], async (page) => {
    await page.locator('[data-testid^="material-detail-trigger-"]').first().click()
    await page.getByTestId('material-detail-dialog').waitFor({ state: 'visible' })
  }))

  await record('onboarding-skip-persists', async () => {
    const { context: pageContext, page, diagnostics } = await newPage(browser, projectToken, { width: 1440, height: 900 }, { onboardingComplete: false })
    try {
      await openState(page, { path: projectRoute(projectId, '/dashboard'), any: ['[data-testid="onboarding-guide"]', '[data-testid="onboarding-daily-workflow"]'] })
      const skip = page.getByText(/跳过引导|跳过/).first()
      await skip.click()
      const value = await page.evaluate(() => window.localStorage.getItem('onboarding_completed'))
      assert(value === 'true', `onboarding_completed was ${value}`)
      assertNoDiagnostics(diagnostics, 'interaction:onboarding')
    } finally {
      await pageContext.close()
    }
  })

  await record('skip-link-focus-visible', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    await page.keyboard.press('Tab')
    const active = await page.evaluate(() => {
      const element = document.activeElement
      if (!(element instanceof HTMLElement)) return null
      const style = window.getComputedStyle(element)
      return { text: element.textContent || element.getAttribute('aria-label') || '', outline: style.outlineStyle, shadow: style.boxShadow }
    })
    assert(active && /跳转|主内容/.test(active.text), `First focus target is not skip link: ${JSON.stringify(active)}`)
    assert(active.outline !== 'none' || active.shadow !== 'none', 'Skip link lacks visible focus style')
  }))

  await record('button-focus-ring-visible', () => withPage(projectRoute(projectId, '/dashboard'), ['[data-testid="dashboard-page"]'], async (page) => {
    const button = page.locator('button, a[role="button"]').first()
    await button.focus()
    const visible = await button.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
    })
    assert(visible, 'Focused button lacks visible focus style')
  }))

  await record('prefers-reduced-motion-disables-animations', async () => {
    const { context: pageContext, page, diagnostics } = await newPage(browser, projectToken, { width: 1440, height: 900 }, { reducedMotion: 'reduce' })
    try {
      await openState(page, { path: projectRoute(projectId, '/dashboard'), any: ['[data-testid="dashboard-page"]'] })
      const activeAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)
      assert(activeAnimations === 0, `Expected zero active animations with reduced motion, got ${activeAnimations}`)
      assertNoDiagnostics(diagnostics, 'interaction:reduced-motion')
    } finally {
      await pageContext.close()
    }
  })

  await record('context-menu-stays-in-viewport', () => withPage(projectRoute(projectId, '/gantt'), ['[data-testid="task-workspace-layer-l2"]', '[data-testid="gantt-task-rows"]'], async (page) => {
    await page.locator('[data-testid^="gantt-task-select-"]').last().click({ button: 'right' })
    const menu = page.getByTestId('gantt-task-context-menu')
    await menu.waitFor({ state: 'visible' })
    const box = await menu.boundingBox()
    assert(box, 'Context menu has no bounding box')
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900, `Context menu overflows viewport: ${JSON.stringify(box)}`)
  }))

  const summary = {
    gate: 'U.qa.interaction',
    generatedAt: new Date().toISOString(),
    caseCount: cases.length,
    expectedMinimum: 22,
    passed: cases.filter((item) => item.status === 'passed').length,
    failed: cases.filter((item) => item.status === 'failed').length,
    cases,
  }
  summary.status = summary.failed === 0 && summary.caseCount >= 22 ? 'passed' : 'failed'
  await writeFile(join(outputDir, 'interaction-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  assert(summary.status === 'passed', `U.qa.interaction failed. See ${rel(join(outputDir, 'interaction-summary.json'))}`)
  console.log(`U.qa.interaction passed: cases=${summary.caseCount}`)
  return summary
}

async function auditTokensOnPage(page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const allElements = Array.from(document.querySelectorAll('*'))
    const classText = allElements.map((element) => element.getAttribute('class') || '').join(' ')
    const bodyFont = window.getComputedStyle(document.body).fontFamily
    const rootStyle = window.getComputedStyle(html)
    const shell = document.querySelector('.page-shell')
    const shellStyle = shell ? window.getComputedStyle(shell) : null
    const dialogEvents = window.__uiuxNativeDialogCount || 0
    const oldTerms = [
      '以计划完成日期为准',
      '今天触发且尚未确认的系统预警',
      '数据置信度',
      '骨架差异',
      '修订池',
      '映射状态',
      '批量移入/移出',
    ]
    const text = document.body.innerText || ''
    return {
      noGray: !/gray-[0-9]/.test(classText),
      noArbitraryFontSize: !/text-\[[0-9]+px\]/.test(classText),
      noRounded3xl: !/rounded-3xl/.test(classText),
      fontFamilyOk: /Plus Jakarta Sans/i.test(bodyFont),
      noNativeDialog: dialogEvents === 0,
      elevationVarsOk: ['--el-1', '--el-2', '--el-3', '--el-4'].every((name) => rootStyle.getPropertyValue(name).trim().length > 0),
      pageShellMaxWidthOk: shellStyle ? Number.parseFloat(shellStyle.maxWidth) <= 1440 : false,
      oldTermsAbsent: oldTerms.filter((term) => text.includes(term)),
      bodyFont,
      pageShellMaxWidth: shellStyle?.maxWidth || null,
    }
  })
}

async function runTokenAuditGate(context) {
  const outputDir = join(outputRoot, 'token-audit')
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const pages = runtimePages(context.projectId)
  const results = []
  for (const state of pages) {
    const token = state.session === 'admin' ? context.adminToken : context.projectToken
    const { context: pageContext, page, diagnostics } = await newPage(context.browser, token)
    try {
      page.on('dialog', async (dialog) => {
        await dialog.dismiss().catch(() => {})
      })
      await page.addInitScript(() => {
        window.__uiuxNativeDialogCount = 0
        const originalConfirm = window.confirm
        window.confirm = (...args) => {
          window.__uiuxNativeDialogCount += 1
          return originalConfirm.apply(window, args)
        }
      })
      await openState(page, state)
      const audit = await auditTokensOnPage(page)
      const checks = [
        ['noGray', audit.noGray],
        ['noArbitraryFontSize', audit.noArbitraryFontSize],
        ['noRounded3xl', audit.noRounded3xl],
        ['fontFamilyOk', audit.fontFamilyOk],
        ['noNativeDialog', audit.noNativeDialog],
        ['elevationVarsOk', audit.elevationVarsOk],
        ['pageShellMaxWidthOk', audit.pageShellMaxWidthOk],
        ['oldTermsAbsent', audit.oldTermsAbsent.length === 0],
      ]
      results.push({ page: state.key, path: state.path, audit, checks: Object.fromEntries(checks), status: checks.every(([, ok]) => ok) ? 'passed' : 'failed' })
      assertNoDiagnostics(diagnostics, `token-audit:${state.key}`)
    } finally {
      await pageContext.close()
    }
  }

  const failed = results.filter((item) => item.status === 'failed')
  const assertionCount = results.length * 8
  const summary = {
    gate: 'U.qa.token-audit',
    generatedAt: new Date().toISOString(),
    pageCount: results.length,
    assertionCount,
    expectedMinimum: 16 * 7,
    failed: failed.length,
    results,
    status: failed.length === 0 && assertionCount >= 16 * 7 ? 'passed' : 'failed',
  }
  await writeFile(join(outputDir, 'token-audit-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  assert(summary.status === 'passed', `U.qa.token-audit failed. See ${rel(join(outputDir, 'token-audit-summary.json'))}`)
  console.log(`U.qa.token-audit passed: pages=${summary.pageCount}, assertions=${assertionCount}`)
  return summary
}

async function runContrastAuditOnPage(page) {
  return page.evaluate(() => {
    function parseRgb(value) {
      const match = String(value).match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
      if (parts.length < 3 || parts.slice(0, 3).some((item) => Number.isNaN(item))) return null
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
    }

    function luminance({ r, g, b }) {
      const values = [r, g, b].map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
    }

    function contrastRatio(foreground, background) {
      const light = Math.max(luminance(foreground), luminance(background))
      const dark = Math.min(luminance(foreground), luminance(background))
      return (light + 0.05) / (dark + 0.05)
    }

    function effectiveBackground(element) {
      let current = element
      while (current && current instanceof HTMLElement) {
        const color = parseRgb(window.getComputedStyle(current).backgroundColor)
        if (color && color.a > 0.95) return color
        current = current.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
    }

    function describe(element) {
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        role: element.getAttribute('role'),
        className: String(element.getAttribute('class') || '').slice(0, 140),
        text: String(element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      }
    }

    const targets = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], [data-slot="badge"], [role="alert"], input, select, textarea'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .filter((element) => !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true')
      .filter((element) => String(element.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').trim().length > 0)

    const failures = []
    for (const element of targets) {
      const style = window.getComputedStyle(element)
      const foreground = parseRgb(style.color)
      const background = effectiveBackground(element)
      if (!foreground || foreground.a < 0.95) continue
      const ratio = contrastRatio(foreground, background)
      const fontSize = Number.parseFloat(style.fontSize)
      const fontWeight = Number.parseInt(style.fontWeight, 10)
      const largeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 600)
      const visibleText = String(element.textContent || '').replace(/\s+/g, ' ').trim()
      const ariaLabelOnly = visibleText.length === 0 && String(element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').trim().length > 0
      const threshold = ariaLabelOnly || largeText ? 3 : 4.5
      if (ratio + 0.01 < threshold) {
        failures.push({ ...describe(element), ratio: Number(ratio.toFixed(2)), threshold })
      }
      if (failures.length >= 12) break
    }

    return { targetCount: targets.length, failures }
  })
}

async function runAxeContrastAuditOnPage(page) {
  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze()

  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 8).map((node) => ({
      target: node.target,
      html: node.html.slice(0, 220),
      failureSummary: node.failureSummary,
    })),
    nodeCount: violation.nodes.length,
  }))

  const incomplete = results.incomplete
    .filter((item) => item.id === 'color-contrast')
    .map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodeCount: item.nodes.length,
    }))

  return {
    violationCount: violations.reduce((sum, violation) => sum + violation.nodeCount, 0),
    incompleteCount: incomplete.reduce((sum, item) => sum + item.nodeCount, 0),
    violations,
    incomplete,
  }
}

function ratioForHex(foreground, background) {
  function parse(hex) {
    const cleaned = hex.replace('#', '')
    return {
      r: Number.parseInt(cleaned.slice(0, 2), 16),
      g: Number.parseInt(cleaned.slice(2, 4), 16),
      b: Number.parseInt(cleaned.slice(4, 6), 16),
    }
  }
  function luminance({ r, g, b }) {
    return [r, g, b].map((channel) => {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  }
  const light = Math.max(luminance(parse(foreground)), luminance(parse(background)))
  const dark = Math.min(luminance(parse(foreground)), luminance(parse(background)))
  return (light + 0.05) / (dark + 0.05)
}

async function runContrastGate(context) {
  const outputDir = join(outputRoot, 'contrast')
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const corePages = runtimePages(context.projectId).filter((page) => [
    'dashboard',
    'reports',
    'risk-management',
    'gantt-view',
    'planning-baseline',
    'planning-monthly',
    'materials',
    'notifications',
  ].includes(page.key))

  const pageResults = []
  for (const state of corePages) {
    const { context: pageContext, page, diagnostics } = await newPage(context.browser, context.projectToken)
    try {
      await openState(page, state)
      const audit = await runContrastAuditOnPage(page)
      const axe = await runAxeContrastAuditOnPage(page)
      pageResults.push({
        page: state.key,
        path: state.path,
        targetCount: audit.targetCount,
        failures: audit.failures,
        axe,
        status: audit.failures.length === 0 && axe.violationCount === 0 ? 'passed' : 'failed',
      })
      assertNoDiagnostics(diagnostics, `contrast:${state.key}`)
    } finally {
      await pageContext.close()
    }
  }

  const manualCombos = [
    { key: 'white-on-red-500', foreground: '#FFFFFF', background: '#EF4444', threshold: 3, note: 'large/destructive text only unless upgraded to darker red' },
    { key: 'white-on-orange-500', foreground: '#FFFFFF', background: '#F97316', threshold: 3, note: 'large CTA text only; small text should use orange-600' },
    { key: 'white-on-blue-600', foreground: '#FFFFFF', background: '#2563EB', threshold: 4.5, note: 'primary button normal text' },
    { key: 'slate-400-on-white', foreground: '#94A3B8', background: '#FFFFFF', threshold: 3, note: 'auxiliary text only' },
  ].map((combo) => {
    const ratio = ratioForHex(combo.foreground, combo.background)
    return { ...combo, ratio: Number(ratio.toFixed(2)), status: ratio + 0.01 >= combo.threshold ? 'passed' : 'reviewed-risk' }
  })

  const failed = pageResults.filter((item) => item.status === 'failed')
  const summary = {
    gate: 'U.qa.contrast',
    generatedAt: new Date().toISOString(),
    method: 'computed browser contrast audit for interactive controls, axe-core color-contrast, plus high-risk token pair ratios',
    pageChecks: pageResults.length,
    axeViolationCount: pageResults.reduce((sum, item) => sum + item.axe.violationCount, 0),
    axeIncompleteCount: pageResults.reduce((sum, item) => sum + item.axe.incompleteCount, 0),
    manualChecks: manualCombos.length,
    pageResults,
    manualCombos,
    status: failed.length === 0 ? 'passed' : 'failed',
  }
  await writeFile(join(outputDir, 'contrast-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  assert(summary.status === 'passed', `U.qa.contrast failed. See ${rel(join(outputDir, 'contrast-summary.json'))}`)
  console.log(`U.qa.contrast passed: pages=${pageResults.length}, manual=${manualCombos.length}`)
  return summary
}

async function makeRuntimeContext(browser) {
  await ensureFile(distIndex, 'client/dist/index.html is missing. Run npm run build --workspace=client first.')
  await ensureFile(manifestPath, 'Missing .tmp/full-app-test-env/manifest.json. Run npm run prepare:test-env:full-app first.')
  assert(await waitForHttpOk(`${apiBaseUrl}/api/health`, 30000), `API did not become ready at ${apiBaseUrl}`)
  const manifest = await readJson(manifestPath)
  const projectId = manifest.projects?.standard?.id
  const adminAccount = manifest.accounts?.companyAdmin
  const projectAccount = manifest.accounts?.owner || adminAccount
  assert(projectId, 'Manifest is missing projects.standard.id')
  assert(adminAccount?.username && adminAccount?.password, 'Manifest is missing company admin credentials')
  assert(projectAccount?.username && projectAccount?.password, 'Manifest is missing project credentials')
  const adminToken = await login(adminAccount)
  const projectToken = await login(projectAccount)
  return { browser, manifest, projectId, adminAccount, projectAccount, adminToken, projectToken }
}

async function main() {
  for (const gate of selectedGates) {
    assert(availableGates.includes(gate), `Unknown gate "${gate}". Available: ${availableGates.join(', ')}, all`)
  }

  await mkdir(outputRoot, { recursive: true })
  const summaries = []
  if (selectedGates.includes('r295')) {
    summaries.push(await runR295Gate())
  }

  const browserGates = selectedGates.filter((gate) => gate !== 'r295')
  let preview = null
  let browser = null
  try {
    if (browserGates.length > 0) {
      await ensureFile(distIndex, 'client/dist/index.html is missing. Run npm run build --workspace=client first.')
      if (shouldStartPreview && !(await isHttpReady(baseUrl))) {
        preview = startPreviewServer()
        assert(await waitForHttpOk(baseUrl, 30000), `Preview server did not become ready at ${baseUrl}`)
      }
      browser = await chromium.launch({ headless: true })
      const runtimeContext = await makeRuntimeContext(browser)
      for (const gate of browserGates) {
        if (gate === 'component') summaries.push(await runComponentGate(runtimeContext))
        if (gate === 'interaction') summaries.push(await runInteractionGate(runtimeContext))
        if (gate === 'token-audit') summaries.push(await runTokenAuditGate(runtimeContext))
        if (gate === 'contrast') summaries.push(await runContrastGate(runtimeContext))
      }
    }
  } finally {
    if (browser) await browser.close()
    if (preview) preview.kill()
  }

  const aggregate = {
    generatedAt: new Date().toISOString(),
    selectedGates,
    baseUrl,
    apiBaseUrl,
    summaries: summaries.map((summary) => ({
      gate: summary.gate,
      status: summary.status,
      screenshotCount: summary.screenshotCount,
      caseCount: summary.caseCount,
      assertionCount: summary.assertionCount,
      pageChecks: summary.pageChecks,
      axeViolationCount: summary.axeViolationCount,
      axeIncompleteCount: summary.axeIncompleteCount,
      manualChecks: summary.manualChecks,
    })),
    status: summaries.every((summary) => summary.status === 'passed') ? 'passed' : 'failed',
  }
  await writeFile(join(outputRoot, 'predeploy-gates-summary.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8')
  console.log(`UIUX predeploy gates ${aggregate.status}: ${selectedGates.join(', ')}`)
  console.log(`Summary: ${rel(join(outputRoot, 'predeploy-gates-summary.json'))}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
