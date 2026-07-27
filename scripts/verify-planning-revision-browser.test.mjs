import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolvePlanningRevisionProjectId,
} from './verify-planning-revision-browser.mjs'

test('proxy planning-revision verification resolves the full-app manifest project', () => {
  const projectId = resolvePlanningRevisionProjectId({
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

test('mock planning-revision verification keeps the local fixture project', () => {
  const projectId = resolvePlanningRevisionProjectId({
    envProjectId: undefined,
    mockApi: true,
    currentProjectId: 'mock-project',
    manifest: {
      projects: {
        standard: { id: 'manifest-standard-project' },
      },
    },
  })

  assert.equal(projectId, 'mock-project')
})
