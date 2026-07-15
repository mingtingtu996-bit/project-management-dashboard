import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
let invitationCode = process.env.INVITATION_CODE || 'JOIN1234'
const now = new Date().toISOString()

const mockProject = {
  id: projectId,
  name: '邀请加入联调项',
  description: 'JoinProject browser verification fixture project',
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

function readResponseData(payload) {
  return payload?.data ?? payload
}

function readInvitationCode(row) {
  return String(row?.invitationCode ?? row?.invitation_code ?? '').trim().toUpperCase()
}

function isInvitationUsable(row, nowMs = Date.now()) {
  if (!row) return false
  if (row.isRevoked === true || row.is_revoked === true) return false

  const expiresAt = row.expiresAt ?? row.expires_at
  if (expiresAt) {
    const expiresMs = new Date(String(expiresAt)).getTime()
    if (!Number.isNaN(expiresMs) && expiresMs < nowMs) return false
  }

  const usedCount = Number(row.usedCount ?? row.used_count ?? 0)
  const maxUsesRaw = row.maxUses ?? row.max_uses
  if (maxUsesRaw != null && maxUsesRaw !== '') {
    const maxUses = Number(maxUsesRaw)
    if (!Number.isNaN(maxUses) && usedCount >= maxUses) return false
  }

  return Boolean(readInvitationCode(row))
}

async function apiJson(fetchImpl, url, { method = 'GET', token, body } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error?.message || text || `${method} ${url} failed with ${response.status}`)
  }
  return readResponseData(payload)
}

async function loginFixtureAccount(fetchImpl, apiRoot, account, label) {
  if (!account?.username || !account?.password) {
    throw new Error(`MOCK_API=false requires ${label} username/password in full-app test manifest`)
  }

  const data = await apiJson(fetchImpl, `${apiRoot}/api/auth/login`, {
    method: 'POST',
    body: {
      username: account.username,
      password: account.password,
    },
  })
  if (!data?.token || !data?.user?.id) {
    throw new Error(`Login did not return token/user id for ${label}`)
  }
  return {
    token: data.token,
    userId: data.user.id,
    username: data.user.username || account.username,
  }
}

async function removeProjectMemberIfPresent(fetchImpl, apiRoot, projectIdToUse, adminToken, targetUserId) {
  const membersPayload = await apiJson(fetchImpl, `${apiRoot}/api/members/${encodeURIComponent(projectIdToUse)}`, {
    token: adminToken,
  })
  const members = membersPayload?.members ?? membersPayload?.data ?? membersPayload ?? []
  const activeTarget = Array.isArray(members)
    ? members.find((member) => String(member.userId ?? member.user_id ?? '') === targetUserId)
    : null
  if (!activeTarget) return false

  await apiJson(fetchImpl, `${apiRoot}/api/members/${encodeURIComponent(projectIdToUse)}/${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
    token: adminToken,
  })
  return true
}

async function createDisposableInvitation(fetchImpl, apiRoot, projectIdToUse, adminToken) {
  const data = await apiJson(fetchImpl, `${apiRoot}/api/invitations`, {
    method: 'POST',
    token: adminToken,
    body: {
      project_id: projectIdToUse,
      permission_level: 'editor',
      max_uses: 1,
    },
  })
  const code = readInvitationCode(data)
  if (!code) {
    throw new Error(`Create invitation did not return invitationCode: ${JSON.stringify(data)}`)
  }
  return code
}

export async function prepareProxyJoinProjectFixture({
  manifest,
  apiRoot = apiBaseUrl,
  fetchImpl = fetch,
} = {}) {
  const fullManifest = manifest ?? await readFullAppTestManifest()
  const manifestProjectId = process.env.PROJECT_ID || fullManifest.projects?.standard?.id
  if (!manifestProjectId) {
    throw new Error('MOCK_API=false requires manifest.projects.standard.id')
  }

  const adminAccount = fullManifest.accounts?.companyAdmin || fullManifest.accounts?.owner
  const inviteeAccount = fullManifest.accounts?.editor
  const admin = await loginFixtureAccount(fetchImpl, apiRoot, adminAccount, 'companyAdmin/owner')
  const invitee = await loginFixtureAccount(fetchImpl, apiRoot, inviteeAccount, 'editor invitee')

  const removedExistingMember = await removeProjectMemberIfPresent(fetchImpl, apiRoot, manifestProjectId, admin.token, invitee.userId)
  const disposableInvitationCode = await createDisposableInvitation(fetchImpl, apiRoot, manifestProjectId, admin.token)

  return {
    projectId: manifestProjectId,
    invitationCode: disposableInvitationCode,
    authToken: invitee.token,
    adminToken: admin.token,
    inviteeUserId: invitee.userId,
    removedExistingMember,
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

function buildMockResponse(urlString, method) {
  const url = new URL(urlString)
  const { pathname } = url

  if (pathname === '/api/auth/me') {
    return json({
      success: true,
      authenticated: true,
      user: {
        id: 'user-1',
        username: 'zhangsan',
        display_name: '寮犱笁',
        globalRole: 'company_admin',
      },
    })
  }

  if (pathname === `/api/invitations/validate/${invitationCode}` && method === 'GET') {
    return json({
      success: true,
      data: {
        id: 'invitation-1',
        projectId,
        projectName: mockProject.name,
        permissionLevel: 'editor',
      },
    })
  }

  if (pathname === `/api/invitations/accept/${invitationCode}` && method === 'POST') {
    return json({ success: true, data: { projectId } })
  }

  if (pathname === '/api/projects') {
    return json({ success: true, data: [mockProject] })
  }

  return json({ success: true, data: [] })
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  await ensureDistExists()

  let proxyFixture = null
  if (!shouldUseMockApi) {
    proxyFixture = await prepareProxyJoinProjectFixture()
    projectId = proxyFixture.projectId
    invitationCode = proxyFixture.invitationCode
    mockProject.id = projectId
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

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
    page.setDefaultTimeout(30000)
    if (!shouldUseMockApi) {
      await primeBrowserAuth(page, proxyFixture?.authToken)
    }

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
      const requestMethod = route.request().method().toUpperCase()

      if (shouldUseMockApi) {
        await route.fulfill(buildMockResponse(requestUrl, requestMethod))
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

    const targetUrl = `${baseUrl}/#/join/${invitationCode}`
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('join-project-page').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('join-project-valid-state').waitFor({ state: 'visible', timeout: 20000 })

    const initialUrl = page.url()
    await page.screenshot({ path: join(outputDir, 'join-project-page.png'), fullPage: true })

    await page.getByTestId('join-project-accept').click()
    await page.getByTestId('join-project-joined-state').waitFor({ state: 'visible', timeout: 10000 })
    await page.getByTestId('join-project-enter-project').waitFor({ state: 'visible', timeout: 10000 })
    await page.screenshot({ path: join(outputDir, 'join-project-success.png'), fullPage: true })

    assert(apiFailures.length === 0, `API proxy failures detected: ${JSON.stringify(apiFailures)}`)
    assert(pageErrors.length === 0, `Browser page errors detected: ${pageErrors.join(' | ')}`)
    assert(consoleErrors.length === 0, `Browser console errors detected: ${consoleErrors.join(' | ')}`)

    const result = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      initialUrl,
      projectId,
      invitationCode,
      joinedStateVisible: true,
      fixture: proxyFixture
        ? {
            inviteeUserId: proxyFixture.inviteeUserId,
            removedExistingMember: proxyFixture.removedExistingMember,
          }
        : null,
      apiFailures,
      consoleErrors,
      pageErrors,
      screenshots: {
        page: join(outputDir, 'join-project-page.png'),
        success: join(outputDir, 'join-project-success.png'),
      },
    }

    await writeFile(join(outputDir, 'join-project-browser-check.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const failurePayload = {
      mode: shouldUseMockApi ? 'mock-api' : 'proxy-api',
      error: error instanceof Error ? error.message : String(error),
      apiFailures,
      consoleErrors,
      pageErrors,
    }
    await writeFile(join(outputDir, 'join-project-browser-check.failure.json'), `${JSON.stringify(failurePayload, null, 2)}\n`, 'utf8')
    console.error(JSON.stringify(failurePayload, null, 2))
    throw error
  } finally {
    if (!shouldUseMockApi && proxyFixture?.adminToken && proxyFixture?.inviteeUserId) {
      await removeProjectMemberIfPresent(fetch, apiBaseUrl, projectId, proxyFixture.adminToken, proxyFixture.inviteeUserId).catch((error) => {
        console.error(`[join-project-check] cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    await browser.close()
    if (previewProcess) {
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
