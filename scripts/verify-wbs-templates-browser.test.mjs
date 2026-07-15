import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveWbsTemplatesProjectId } from './verify-wbs-templates-browser.mjs'

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
