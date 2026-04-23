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

export async function primeBrowserAuth(page, authToken = 'browser-verify-token') {
  await page.addInitScript((token) => {
    window.localStorage.setItem('auth_token', token)
    window.localStorage.setItem('access_token', token)
  }, authToken)
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
