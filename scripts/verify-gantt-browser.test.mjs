import assert from 'node:assert/strict'
import test from 'node:test'

import * as ganttBrowser from './verify-gantt-browser.mjs'

const { recordApiFailure, resolveGanttProjectId } = ganttBrowser

test('proxy gantt verification resolves the standard full-app fixture project', () => {
  const projectId = resolveGanttProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
        empty: { id: 'empty-project' },
      },
    },
  })

  assert.equal(projectId, 'standard-project')
})

test('proxy gantt verification records non-OK API responses with URL and status', () => {
  const apiFailures = []

  recordApiFailure(apiFailures, {
    type: 'proxy-response',
    url: 'http://api.test/api/projects/legacy-project',
    status: 404,
    statusText: 'Not Found',
  })
  recordApiFailure(apiFailures, {
    type: 'proxy-response',
    url: 'http://api.test/api/projects/legacy-project',
    status: 404,
    statusText: 'Not Found',
  })

  assert.deepEqual(apiFailures, [
    {
      type: 'proxy-response',
      url: 'http://api.test/api/projects/legacy-project',
      status: 404,
      statusText: 'Not Found',
      message: undefined,
      body: undefined,
      code: undefined,
      details: undefined,
    },
  ])
})

test('gantt mock verification targets the fixture row that owns the expected assignee', () => {
  const resolveTarget = ganttBrowser.resolveGanttDetailTarget
  assert.equal(typeof resolveTarget, 'function')
  assert.deepEqual(
    resolveTarget({
      mockApi: true,
      fixtureTitle: '主体结构施工',
      fixtureAssignee: '阿达是的',
      firstVisibleTitle: '施工图会审',
    }),
    {
      title: '主体结构施工',
      expectedAssignee: '阿达是的',
    },
  )
  assert.deepEqual(
    resolveTarget({
      mockApi: false,
      fixtureTitle: '主体结构施工',
      fixtureAssignee: '阿达是的',
      firstVisibleTitle: '真实首行',
    }),
    {
      title: '真实首行',
      expectedAssignee: null,
    },
  )
})

test('gantt mock verification grants the fixture user explicit project edit access', () => {
  const response = ganttBrowser.buildMockResponse(
    'http://127.0.0.1:4173/api/members/422ba093-7a94-4e91-a47a-c1b865185e86/me',
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
