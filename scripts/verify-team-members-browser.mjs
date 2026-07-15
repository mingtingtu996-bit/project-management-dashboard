import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import { primeBrowserAuth, readFullAppTestManifest } from './browser-auth-fixture.mjs'

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
  name: '团队管理联调项目',
  description: 'TeamMembers browser verification fixture project',
  status: 'active',
  created_at: now,
  updated_at: now,
}

const mockAuth = {
  success: true,
  authenticated: true,
  user: {
    id: 'user-1',
    username: 'zhangsan',
    display_name: '寮犱笁',
    globalRole: 'company_admin',
  },
}

const mockMembers = [
  {
    id: 'member-1',
    userId: 'user-1',
    username: 'zhangsan',
    displayName: '寮犱笁',
    email: 'zhangsan@example.com',
    permissionLevel: 'owner',
    globalRole: 'company_admin',
    joinedAt: '2026-04-01T08:00:00.000Z',
    lastActivity: '2026-04-05T08:00:00.000Z',
  },
  {
    id: 'member-2',
    userId: 'user-2',
    username: 'lisi',
    displayName: '李四',
    email: 'lisi@example.com',
    permissionLevel: 'editor',
    globalRole: 'project_member',
    joinedAt: '2026-04-02T08:00:00.000Z',
    lastActivity: '2026-04-06T08:00:00.000Z',
  },
]

const mockInvitations = [
  {
    id: 'inv-1',
    projectId,
    invitationCode: 'JOIN1234',
    permissionLevel: 'editor',
    createdAt: '2026-04-05T08:00:00.000Z',
    isRevoked: false,
    usedCount: 0,
  },
]

const mockUnlinkedAssignees = [
  {
    assigneeName: '王五',
    taskCount: 2,
    taskIds: ['task-1', 'task-2'],
    sampleTaskTitles: ['主体结构验收', '机电样板确认'],
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

async function gotoWithRetry(page, url, {
  label,
  attempts = 3,
  timeoutMs = 20000,
  settleMs = 500,
} = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      return
    } catch (error) {
      lastError = error
      if (attempt === attempts) {
        throw new Error(
          `${label ?? 'Navigation'} failed after ${attempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      await page.waitForTimeout(settleMs * attempt)
    }
  }

  throw lastError ?? new Error(`${label ?? 'Navigation'} failed without an error payload`)
}

async function openTeamManagementDrawer(page, targetUrl) {
  const previewRootUrl = `${baseUrl}/`
  await gotoWithRetry(page, previewRootUrl, {
    label: 'Preview warm-up',
    attempts: 2,
    timeoutMs: 15000,
  })
  const projectAccessResponsePromise = waitForProjectAccessResponse(page)
  await gotoWithRetry(page, targetUrl, {
    label: 'Project dashboard navigation',
    attempts: 3,
    timeoutMs: 25000,
  })
  await page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 20000 })
  await projectAccessResponsePromise
  await page.getByLabel('打开用户菜单').click()
  const teamManagementItem = page.getByRole('menuitem', { name: '团队管理' })
  await teamManagementItem.waitFor({ state: 'visible', timeout: 30000 })
  await teamManagementItem.click()
  await page.getByTestId('team-management-panel').waitFor({ state: 'visible', timeout: 20000 })
}

async function waitForProjectAccessResponse(page) {
  if (shouldUseMockApi) return null

  const response = await page.waitForResponse(
    (candidate) => {
      const url = new URL(candidate.url())
      return url.pathname === `/api/members/${projectId}/me`
    },
    { timeout: 30000 },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok() || payload?.success === false) {
    throw new Error(`Project access check failed with ${response.status()}: ${JSON.stringify(payload)}`)
  }
  if (payload?.data?.canManageTeam !== true) {
    throw new Error(`Project access check did not grant team management: ${JSON.stringify(payload?.data ?? payload)}`)
  }
  return payload.data
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
  const { pathname, searchParams } = url

  if (pathname === '/api/auth/me') {
    return json(mockAuth)
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
        projectId,
        permissionLevel: 'owner',
        globalRole: 'company_admin',
        canManageTeam: true,
        canEdit: true,
      },
    })
  }

  if (pathname === `/api/members/${projectId}/unlinked-assignees`) {
    return json({ success: true, data: mockUnlinkedAssignees })
  }

  if (pathname === `/api/members/${projectId}`) {
    return json({ success: true, members: mockMembers })
  }

  if (pathname === '/api/invitations' && searchParams.get('projectId') === projectId) {
    return json({ success: true, data: mockInvitations })
  }

  if (
    pathname === '/api/tasks'
    || pathname === '/api/risks'
    || pathname === '/api/milestones'
    || pathname === '/api/task-conditions'
    || pathname === '/api/task-obstacles'
    || pathname === '/api/warnings'
    || pathname === '/api/issues'
    || pathname === '/api/change-logs'
    || pathname === '/api/tasks/progress-snapshots'
  ) {
    return json({ success: true, data: [] })
  }

  return json({ success: true, data: [] })
}

async function resolveProjectId() {
  if (process.env.PROJECT_ID || shouldUseMockApi) return projectId

  const manifest = await readFullAppTestManifest()
  const manifestProjectId = manifest.projects?.standard?.id
  if (!manifestProjectId) {
    throw new Error('MOCK_API=false requires manifest.projects.standard.id')
  }
  projectId = manifestProjectId
  mockProject.id = projectId
  mockInvitations.forEach((invitation) => {
    invitation.projectId = projectId
  })
  return projectId
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()
  await resolveProjectId()

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
  const requestedPaths = []

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
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
      const requestPath = new URL(requestUrl).pathname + new URL(requestUrl).search
      requestedPaths.push(requestPath)

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl))
        return
      }

      const forwardUrl = requestUrl.replace(baseUrl, apiBaseUrl)
      try {
        const response = await route.fetch({ url: forwardUrl })
        if (response.status() >= 400) {
          apiFailures.push({ url: forwardUrl, status: response.status(), statusText: response.statusText() })
        }
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

    const targetUrl = `${baseUrl}/#/projects/${projectId}/dashboard`
    await openTeamManagementDrawer(page, targetUrl)

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'team-members-page.png'), fullPage: true })

    await page.getByTestId('team-management-tab-pending-links').click()
    await page.getByTestId('pending-assignee-row').waitFor({ state: 'visible', timeout: 10000 })

    await page.getByTestId('team-management-tab-invitations').click()
    await page.locator('[data-testid^="team-management-invitation-row-"]').first().waitFor({ state: 'visible', timeout: 10000 })

    await page.getByTestId('team-management-create-invitation').click()
    await page.getByTestId('team-management-create-invitation-dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'team-members-invitation-dialog.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      pendingAssigneeVisible: true,
      invitationDialogVisible: true,
      requestedPaths,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'team-members-page.png'),
        invitationDialog: join(outputDir, 'team-members-invitation-dialog.png'),
      },
    }

    await writeFile(join(outputDir, 'team-members-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      requestedPaths,
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'team-members-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
