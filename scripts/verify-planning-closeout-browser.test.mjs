import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolvePlanningCloseoutProjectId,
  resolvePreviousMonth,
} from './verify-planning-closeout-browser.mjs'

test('proxy planning-closeout verification prefers the dedicated closeout fixture project', () => {
  const projectId = resolvePlanningCloseoutProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        closeout: { id: 'closeout-project' },
        empty: { id: 'empty-project' },
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
      },
    },
  })

  assert.equal(projectId, 'closeout-project')
})

test('proxy planning-closeout verification falls back to runtime fixture creation target', () => {
  const projectId = resolvePlanningCloseoutProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'runtime-created-project',
    manifest: {
      projects: {
        empty: { id: 'empty-project' },
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
      },
    },
  })

  assert.equal(projectId, 'runtime-created-project')
})

test('planning-closeout fixture defaults to the previous UTC month', () => {
  assert.equal(resolvePreviousMonth(new Date('2026-07-04T12:00:00.000Z')), '2026-06')
})
