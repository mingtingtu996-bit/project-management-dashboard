import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractMilestoneIdFromCardTestId,
  isProjectSummaryRequest,
  resolveMilestonesProjectId,
  selectMilestoneIdFromSummary,
} from './verify-milestones-browser.mjs'

test('proxy milestones verification resolves the standard full-app fixture project', () => {
  const projectId = resolveMilestonesProjectId({
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

test('milestones verification selects a dynamic milestone id from summary items', () => {
  const milestoneId = selectMilestoneIdFromSummary({
    milestoneOverview: {
      items: [
        { id: 'merged-node', merged_into: 'parent-node' },
        { id: 'dynamic-milestone', name: '结构封顶' },
      ],
    },
  })

  assert.equal(milestoneId, 'dynamic-milestone')
})

test('milestones verification extracts dynamic milestone ids from card test ids', () => {
  assert.equal(
    extractMilestoneIdFromCardTestId('milestone-card-2f21ad5c-dynamic'),
    '2f21ad5c-dynamic',
  )
})

test('milestones verification recognizes only the scoped project summary endpoint', () => {
  assert.equal(
    isProjectSummaryRequest('http://127.0.0.1:3001/api/projects/project-1/dashboard/project-summary', 'GET', 'project-1'),
    true,
  )
  assert.equal(
    isProjectSummaryRequest('http://127.0.0.1:3001/api/dashboard/project-summary', 'GET', 'project-1'),
    false,
  )
})
