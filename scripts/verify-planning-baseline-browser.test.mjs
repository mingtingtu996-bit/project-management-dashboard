import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePlanningBaselineProjectId } from './verify-planning-baseline-browser.mjs'

test('proxy planning-baseline verification resolves the standard full-app fixture project', () => {
  const projectId = resolvePlanningBaselineProjectId({
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
