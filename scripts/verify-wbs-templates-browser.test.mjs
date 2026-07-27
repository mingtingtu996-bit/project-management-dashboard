import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMockResponse,
  resolveWbsTemplatesProjectId,
} from './verify-wbs-templates-browser.mjs'

test('proxy WBS templates verification resolves the full-app manifest project', () => {
  const projectId = resolveWbsTemplatesProjectId({
    envProjectId: undefined,
    mockApi: false,
    currentProjectId: 'hard-coded-default',
    manifest: {
      projects: {
        standard: { id: 'manifest-standard-project' },
      },
    },
  })

  assert.equal(projectId, 'manifest-standard-project')
})

test('WBS templates mock verification grants the fixture user explicit project edit access', () => {
  const response = buildMockResponse(
    'http://127.0.0.1:4173/api/members/422ba093-7a94-4e91-a47a-c1b865185e86/me',
    'GET',
  )

  assert.equal(response.status, 200)
  assert.deepEqual(JSON.parse(response.body), {
    success: true,
    data: {
      permissionLevel: 'owner',
      globalRole: 'company_admin',
      canManageTeam: true,
      canEdit: true,
    },
  })
})
