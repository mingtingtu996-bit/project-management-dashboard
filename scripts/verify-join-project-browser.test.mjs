import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareProxyJoinProjectFixture } from './verify-join-project-browser.mjs'

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

test('proxy join fixture creates a fresh invitation and primes an invitee account', async () => {
  const calls = []
  const manifest = {
    accounts: {
      companyAdmin: { username: 'admin', password: 'admin-pass' },
      editor: { username: 'editor', password: 'editor-pass' },
    },
    projects: {
      standard: { id: 'project-1' },
    },
  }

  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init })
    const body = init.body ? JSON.parse(init.body) : null

    if (url.endsWith('/api/auth/login') && body?.username === 'admin') {
      return response(200, { success: true, data: { token: 'admin-token', user: { id: 'admin-user', username: 'admin' } } })
    }
    if (url.endsWith('/api/auth/login') && body?.username === 'editor') {
      return response(200, { success: true, data: { token: 'editor-token', user: { id: 'editor-user', username: 'editor' } } })
    }
    if (url.endsWith('/api/members/project-1')) {
      return response(200, { success: true, members: [{ userId: 'editor-user', permissionLevel: 'editor' }] })
    }
    if (url.endsWith('/api/members/project-1/editor-user') && init.method === 'DELETE') {
      return response(200, { success: true })
    }
    if (url.endsWith('/api/invitations') && init.method === 'POST') {
      return response(201, {
        success: true,
        data: {
          invitationCode: 'FRESH123',
          isRevoked: false,
          usedCount: 0,
          maxUses: 1,
        },
      })
    }

    return response(500, { success: false, message: `Unexpected call ${init.method || 'GET'} ${url}` })
  }

  const fixture = await prepareProxyJoinProjectFixture({
    manifest,
    apiRoot: 'http://api.test',
    fetchImpl,
  })

  assert.equal(fixture.projectId, 'project-1')
  assert.equal(fixture.invitationCode, 'FRESH123')
  assert.equal(fixture.authToken, 'editor-token')
  assert.equal(fixture.removedExistingMember, true)
  assert.ok(calls.some((call) => call.url.endsWith('/api/members/project-1/editor-user') && call.init.method === 'DELETE'))
  assert.ok(calls.some((call) => call.url.endsWith('/api/invitations') && call.init.method === 'POST'))
})
