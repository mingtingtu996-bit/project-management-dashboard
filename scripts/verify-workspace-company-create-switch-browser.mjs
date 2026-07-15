import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const distIndexFile = join(repoRoot, 'client', 'dist', 'index.html')
const previewScript = join(repoRoot, 'scripts', 'serve-client-dist.mjs')
const outputDir = join(repoRoot, 'project-testing', 'artifacts', 'browser-checks')
const outputPath = join(outputDir, 'workspace-company-create-switch-browser-check.json')
const failurePath = join(outputDir, 'workspace-company-create-switch-browser-check.failure.json')

const port = Number(process.env.PORT || 4184)
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`
const shouldStartPreview = process.env.START_PREVIEW !== 'false'

function rel(filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, '/')
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

async function ensureDistExists() {
  await access(distIndexFile, constants.R_OK).catch(() => {
    throw new Error(`Missing build artifact: ${rel(distIndexFile)}. Run "npm run build --workspace=client" first.`)
  })
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url)
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

async function waitForHttpOk(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return false
}

function startPreviewServer() {
  return spawn(process.execPath, [previewScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER_VERIFY_DISABLE_ONBOARDING: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function emptyWorkspace() {
  return {
    success: true,
    data: {
      hasCompany: false,
      currentCompany: null,
      switchableCompanies: [],
      myProjects: [],
      recentProjects: [],
      companyProjects: [],
      joinableProjects: [],
      pendingInvitations: [],
      joinRequests: [],
      demoEntry: { available: true, label: 'Preview' },
      emptyStateReason: 'no_company',
    },
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

  assert(previewAlreadyReady || await waitForHttpOk(baseUrl), `Preview server is not reachable at ${baseUrl}`)

  const browser = await chromium.launch({ headless: true })
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
    requestedPaths: [],
    workspaceGetCount: 0,
    createCompanyPostCount: 0,
  }
  const createdCompany = {
    id: 'company-created-browser',
    name: 'Browser Created Company',
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    page.setDefaultTimeout(30000)
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'workspace-create-switch-token')
      window.localStorage.setItem('access_token', 'workspace-create-switch-token')
      window.localStorage.removeItem('current_company_id')
      window.localStorage.setItem('onboarding_workspace_completed', 'true')
      window.localStorage.setItem('onboarding_project_completed', 'true')
      window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
    })

    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        diagnostics.apiFailures.push({ url: response.url(), status: response.status() })
      }
    })

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      diagnostics.requestedPaths.push(`${request.method()} ${url.pathname}`)

      if (url.pathname === '/api/auth/me') {
        await route.fulfill(json({
          success: true,
          data: {
            authenticated: true,
            user: {
              id: 'workspace-create-switch-user',
              username: 'workspace-create-switch',
              display_name: 'Browser User',
              globalRole: 'company_admin',
              currentCompanyId: null,
              currentCompanyRole: null,
            },
          },
        }))
        return
      }

      if (url.pathname === '/api/workspace' && request.method() === 'GET') {
        diagnostics.workspaceGetCount += 1
        await route.fulfill(json(emptyWorkspace()))
        return
      }

      if (url.pathname === '/api/workspace/companies' && request.method() === 'POST') {
        diagnostics.createCompanyPostCount += 1
        await route.fulfill(json({
          success: true,
          data: {
            id: createdCompany.id,
            name: createdCompany.name,
            role: 'company_admin',
            nextStep: 'create_first_project',
          },
        }))
        return
      }

      await route.fulfill(json({ success: true, data: [] }))
    })

    await page.goto(`${baseUrl}/#/workspace`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('workspace-no-company').waitFor({ state: 'visible' })

    await page.locator('[data-testid="workspace-no-company"] button').first().click()
    await page.getByTestId('workspace-empty-projects').waitFor({ state: 'visible' })
    await page.waitForTimeout(500)

    const noCompanyVisibleAfterCreate = await page.getByTestId('workspace-no-company').isVisible().catch(() => false)
    const emptyProjectsText = await page.getByTestId('workspace-empty-projects').innerText()
    const storedCompanyId = await page.evaluate(() => window.localStorage.getItem('current_company_id'))

    assert(!noCompanyVisibleAfterCreate, 'Workspace returned to the no-company screen after company creation.')
    assert(emptyProjectsText.includes(createdCompany.name), 'Created company name is not visible in the workspace empty-project state.')
    assert(storedCompanyId === createdCompany.id, `current_company_id was not persisted. Expected ${createdCompany.id}, got ${storedCompanyId}`)
    assert(diagnostics.createCompanyPostCount === 1, `Expected one create-company POST, got ${diagnostics.createCompanyPostCount}`)
    assert(diagnostics.workspaceGetCount >= 2, `Expected initial and follow-up workspace GETs, got ${diagnostics.workspaceGetCount}`)
    assert(diagnostics.apiFailures.length === 0, `API failures detected: ${JSON.stringify(diagnostics.apiFailures)}`)
    assert(diagnostics.pageErrors.length === 0, `Page errors detected: ${diagnostics.pageErrors.join(' | ')}`)
    assert(diagnostics.consoleErrors.length === 0, `Console errors detected: ${diagnostics.consoleErrors.join(' | ')}`)

    const screenshotPath = join(outputDir, 'workspace-company-create-switch.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    const result = {
      schemaVersion: 'workbuddy/workspace-company-create-switch-browser-check/v1',
      generatedAt: new Date().toISOString(),
      status: 'passed',
      baseUrl,
      createdCompany,
      staleWorkspaceRefreshSimulated: true,
      workspaceGetCount: diagnostics.workspaceGetCount,
      createCompanyPostCount: diagnostics.createCompanyPostCount,
      storedCompanyId,
      noCompanyVisibleAfterCreate,
      requestedPaths: diagnostics.requestedPaths,
      diagnostics: {
        apiFailures: diagnostics.apiFailures,
        pageErrors: diagnostics.pageErrors,
        consoleErrors: diagnostics.consoleErrors,
      },
      screenshot: screenshotPath,
    }
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failure = {
      schemaVersion: 'workbuddy/workspace-company-create-switch-browser-check/v1',
      generatedAt: new Date().toISOString(),
      status: 'failed',
      baseUrl,
      error: error instanceof Error ? error.stack || error.message : String(error),
      diagnostics,
    }
    await writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failure, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) previewProcess.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
