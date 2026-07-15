import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolvePlanningFineFlowsMonth,
  resolvePlanningFineFlowsProjectId,
} from './verify-planning-fine-flows-browser.mjs'

test('proxy planning fine-flows verification resolves the full-app manifest project', () => {
  const projectId = resolvePlanningFineFlowsProjectId({
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

test('planning fine-flows month uses current month for proxy and fixture month for mock', () => {
  const nowValue = new Date('2026-07-04T00:00:00.000Z')

  assert.equal(resolvePlanningFineFlowsMonth({ mockApi: false, nowValue }), '2026-07')
  assert.equal(resolvePlanningFineFlowsMonth({ mockApi: true, nowValue }), '2099-09')
  assert.equal(resolvePlanningFineFlowsMonth({ envMonth: '2026-08', mockApi: false, nowValue }), '2026-08')
})
