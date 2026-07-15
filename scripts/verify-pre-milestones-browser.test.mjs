import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolvePreMilestonesProjectId,
  selectPreMilestonesCertificateId,
} from './verify-pre-milestones-browser.mjs'

test('proxy pre-milestones verification resolves the standard full-app fixture project', () => {
  const projectId = resolvePreMilestonesProjectId({
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

test('pre-milestones verification selects the land-use certificate when available', () => {
  const certificateId = selectPreMilestonesCertificateId({
    certificates: [
      { id: 'cert-land', certificate_type: 'land_certificate' },
      { id: 'dynamic-land-use', certificate_type: 'land_use_planning_permit' },
    ],
  })

  assert.equal(certificateId, 'dynamic-land-use')
})
