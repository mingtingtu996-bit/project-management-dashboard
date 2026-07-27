import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveDefaultPlanningDeviationRows,
  resolvePlanningDeviationRoutes,
  resolvePlanningDeviationProjectId,
} from './verify-planning-deviation-browser.mjs'

test('proxy planning-deviation verification resolves the full-app manifest project', () => {
  const projectId = resolvePlanningDeviationProjectId({
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

test('mock planning-deviation verification keeps the local fixture project', () => {
  const projectId = resolvePlanningDeviationProjectId({
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

test('planning-deviation verification keeps the retired route separate from the canonical report', () => {
  assert.deepEqual(resolvePlanningDeviationRoutes('project-1'), {
    retiredPath: '/projects/project-1/planning/deviation',
    canonicalPath: '/projects/project-1/reports?view=progress_deviation',
  })
})

test('planning-deviation verification resolves rows from the canonical execution mainline', () => {
  const rows = resolveDefaultPlanningDeviationRows({
    rows: [{ id: 'baseline-row', mainline: 'baseline' }],
    mainlines: [
      { key: 'baseline', rows: [{ id: 'baseline-row', mainline: 'baseline' }] },
      { key: 'execution', rows: [{ id: 'execution-row', mainline: 'execution' }] },
    ],
  })

  assert.deepEqual(rows, [{ id: 'execution-row', mainline: 'execution' }])
})
