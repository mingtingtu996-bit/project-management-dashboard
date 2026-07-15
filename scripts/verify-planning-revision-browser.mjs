import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import {
  isIgnorableBrowserConsoleError,
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
  name: 'Planning legacy route fixture',
  description: 'Revision pool route redirect fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

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

async function waitForHttpOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
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

export function resolvePlanningRevisionProjectId({
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
  projectId = resolvePlanningRevisionProjectId({ manifest })
  return projectId
}

function buildMockResponse(urlString) {
  const url = new URL(urlString)
  const { pathname } = url

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      authenticated: true,
      user: {
        id: 'user-1',
        username: 'project-owner',
        display_name: 'Project Owner',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === '/api/projects') {
    return json({
      success: true,
      data: [{
        id: projectId,
        name: 'Planning legacy route fixture',
        description: 'Revision pool route redirect fixture project',
        status: 'active',
        created_at: now,
        updated_at: now,
      }],
    })
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

  if (pathname === '/api/task-baselines') {
    return json({ success: true, data: [] })
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

  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
    page.setDefaultTimeout(30000)
    await primeBrowserAuth(page, authToken)

    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableBrowserConsoleError(text)) {
          consoleErrors.push(text)
        }
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
        const responseBody = response.status() >= 400 ? await response.text() : undefined
        if (response.status() >= 400) {
          recordApiFailure(apiFailures, {
            type: 'proxy-response',
            url: forwardUrl,
            status: response.status(),
            statusText: response.statusText(),
            body: responseBody ? responseBody.slice(0, 2000) : '',
          })
        }
        await route.fulfill(responseBody === undefined ? { response } : { response, body: responseBody })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recordApiFailure(apiFailures, { type: 'proxy-error', url: forwardUrl, message })
        await route.fulfill(json({ success: false, error: { code: 'BROWSER_PROXY_ERROR', message } }, 502))
      }
    })

    const targetUrl = `${baseUrl}/#/projects/${projectId}/planning/baseline`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/planning\/baseline(?:$|\?)/, { timeout: 20000 })
    await page.getByTestId('planning-shared-shell').waitFor({ state: 'visible', timeout: 20000 })

    const redirectedUrl = page.url()
    const revisionWorkspaceCount = await page.getByTestId('planning-revision-workspace').count()
    const revisionEntryCount = await page.getByTestId('baseline-revision-source-entry').count()

    assert(redirectedUrl.includes('/planning/baseline'), `Legacy revision route did not redirect: ${redirectedUrl}`)
    assert(revisionWorkspaceCount === 0, `Legacy revision workspace is still visible: ${revisionWorkspaceCount}`)
    assert(revisionEntryCount === 0, `Legacy revision source entry is still visible: ${revisionEntryCount}`)
    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const screenshot = join(outputDir, 'planning-revision-redirect.png')
    await page.screenshot({ path: screenshot, fullPage: true })

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      targetUrl,
      redirectedUrl,
      revisionWorkspaceCount,
      revisionEntryCount,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: { redirect: screenshot },
    }

    await writeFile(join(outputDir, 'planning-revision-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (page) {
      try {
        pageBodyText = await page.locator('body').innerText({ timeout: 2000 })
      } catch {
        pageBodyText = null
      }
      try {
        failureScreenshot = join(outputDir, 'planning-revision-failure.png')
        await page.screenshot({ path: failureScreenshot, fullPage: true })
      } catch {
        failureScreenshot = null
      }
    }
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      projectId,
      pageBodyText,
      failureScreenshot,
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'planning-revision-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) previewProcess.kill()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
