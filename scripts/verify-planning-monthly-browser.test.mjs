import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolvePlanningMonthlyProjectId,
  resolvePlanningMonthlyVerificationMonth,
} from './verify-planning-monthly-browser.mjs'

test('proxy planning-monthly verification resolves the standard full-app fixture project', () => {
  const projectId = resolvePlanningMonthlyProjectId({
    envProjectId: '',
    mockApi: false,
    currentProjectId: 'legacy-project',
    manifest: {
      projects: {
        standard: { id: 'standard-project' },
        large: { id: 'large-project' },
      },
    },
  })

  assert.equal(projectId, 'standard-project')
})

test('planning-monthly verification uses current month for proxy fixtures', () => {
  const month = resolvePlanningMonthlyVerificationMonth({
    envMonth: '',
    mockApi: false,
    nowValue: new Date('2026-07-04T12:00:00.000Z'),
  })

  assert.equal(month, '2026-07')
})

test('planning-monthly verification keeps deterministic mock month', () => {
  const month = resolvePlanningMonthlyVerificationMonth({
    envMonth: '',
    mockApi: true,
    nowValue: new Date('2026-07-04T12:00:00.000Z'),
  })

  assert.equal(month, '2099-09')
})
