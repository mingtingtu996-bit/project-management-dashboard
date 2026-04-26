import { describe, expect, it } from 'vitest'

import { buildAcceptanceProjectSummary } from '../services/acceptanceFlowService.js'

describe('acceptance project summary', () => {
  it('computes the seven acceptance overview metrics on the backend', () => {
    const summary = buildAcceptanceProjectSummary([
      {
        id: 'draft-1',
        project_id: 'project-1',
        status: 'draft',
        task_id: 'milestone-1',
        days_to_due: 10,
        is_blocked: false,
      },
      {
        id: 'submitted-1',
        project_id: 'project-1',
        status: 'submitted',
        days_to_due: 31,
        is_blocked: true,
      },
      {
        id: 'passed-1',
        project_id: 'project-1',
        status: 'passed',
        days_to_due: 5,
        is_blocked: false,
      },
    ] as never)

    expect(summary).toEqual({
      totalCount: 3,
      passedCount: 1,
      inProgressCount: 1,
      notStartedCount: 1,
      blockedCount: 1,
      dueSoon30dCount: 1,
      keyMilestoneCount: 1,
      completionRate: 33,
    })
  })
})
