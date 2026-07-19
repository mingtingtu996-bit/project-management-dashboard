import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePublicHttpsOrigin } from './public-origin.mjs'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = dirname(__filename)
const repoRoot = join(scriptsDir, '..')
const manifestPath = join(repoRoot, '.tmp', 'full-app-test-env', 'manifest.json')
const apiBaseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001'

export const browserVerifyAuthState = {
  authenticated: true,
  user: {
    id: 'browser-verify-user',
    username: 'browser-verify',
    display_name: 'Browser Verify User',
    email: 'browser-verify@example.com',
    role: 'owner',
    permissionLevel: 'owner',
    globalRole: 'company_admin',
  },
}

export async function readFullAppTestManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`MOCK_API=false requires ${manifestPath}. Run npm run prepare:test-env:full-app first. ${message}`)
  }
}

async function loginWithFullAppFixture() {
  const manifest = await readFullAppTestManifest()
  const account = manifest.accounts?.companyAdmin || manifest.accounts?.owner
  if (!account?.username || !account?.password) {
    throw new Error(`Missing companyAdmin/owner account in ${manifestPath}`)
  }

  const publicOrigin = resolvePublicHttpsOrigin({
    apiBaseUrl,
    publicOrigin: process.env.PUBLIC_HTTPS_ORIGIN,
  })
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: publicOrigin,
    },
    body: JSON.stringify({
      username: account.username,
      password: account.password,
    }),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || text || `Login failed with ${response.status}`)
  }
  const data = payload?.data ?? payload
  if (!data?.token) {
    throw new Error(`Login did not return token for ${account.username}`)
  }
  return data.token
}

export async function resolveBrowserVerifyAuthToken() {
  if (process.env.BROWSER_VERIFY_AUTH_TOKEN) {
    return process.env.BROWSER_VERIFY_AUTH_TOKEN
  }

  if (process.env.WORKBUDDY_LIVE_AUTH_TOKEN) {
    return process.env.WORKBUDDY_LIVE_AUTH_TOKEN
  }

  return process.env.MOCK_API === 'false'
    ? await loginWithFullAppFixture()
    : 'browser-verify-token'
}

export async function primeBrowserAuth(page, authToken) {
  const token = authToken ?? await resolveBrowserVerifyAuthToken()
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth_token', token)
    window.localStorage.setItem('access_token', token)
    window.localStorage.setItem('onboarding_workspace_completed', 'true')
    window.localStorage.setItem('onboarding_project_completed', 'true')
    window.localStorage.setItem('onboarding_daily_workflow_dismissed', 'true')
  }, token)
  return token
}

export function maybeBuildMockAuthResponse(pathname, json) {
  if (pathname !== '/api/auth/me') {
    return null
  }

  return json({
    success: true,
    data: browserVerifyAuthState,
  })
}

export function isIgnorableBrowserConsoleError(message) {
  return (
    typeof message === 'string'
    && message.includes("WebSocket connection to 'ws://")
    && message.includes('/ws?')
    && message.includes('ERR_CONNECTION_REFUSED')
  )
}
