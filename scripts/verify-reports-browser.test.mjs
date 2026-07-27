import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveReportsProjectId,
} from './verify-reports-browser.mjs'

test('proxy reports verification resolves the standard full-app fixture project', () => {
  const projectId = resolveReportsProjectId({
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
