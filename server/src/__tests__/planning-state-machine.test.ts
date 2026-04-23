import { describe, expect, it } from 'vitest'
import {
  planningContracts,
  planningStateMachine,
  PlanningStateTransitionError,
} from '../services/planningStateMachine.js'

describe('planning contracts', () => {
  it('locks the required shared types and endpoints', () => {
    expect(planningContracts.types).toEqual([
      'BaselineVersion',
      'BaselineItem',
      'MonthlyPlanVersion',
      'MonthlyPlanItem',
      'CarryoverItem',
      'RevisionPoolCandidate',
      'PlanningStatus',
      'PlanningEvent',
    ])

    expect(planningContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          path: '/api/task-baselines/:id/confirm',
          requestShape: '{ version: number }',
          responseShape: "{ id: string, status: 'confirmed' }",
          errorCodes: ['VERSION_CONFLICT', 'BLOCKING_ISSUES_EXIST', 'VALIDATION_ERROR', 'REQUIRES_REALIGNMENT'],
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/task-baselines/:id/revisions',
          requestShape: '{ baseline_version_id: string, reason: string }',
          responseShape: "{ revision_id: string, status: 'revising' }",
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/task-baselines/:id/queue-realignment',
          requestShape: '{ version: number, reason?: string }',
          responseShape: "{ id: string, status: 'pending_realign' }",
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/task-baselines/:id/resolve-realignment',
          requestShape: '{ version: number, reason?: string }',
          responseShape: "{ id: string, status: 'confirmed' }",
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/monthly-plans/:id/force-close',
          requestShape: '{ reason?: string }',
          responseShape: "{ id: string, status: 'closed' }",
          errorCodes: ['FORBIDDEN', 'INVALID_STATE', 'NOT_FOUND'],
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/monthly-plans/:id/queue-realignment',
          requestShape: '{ version: number, reason?: string }',
          responseShape: "{ id: string, status: 'pending_realign' }",
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/api/monthly-plans/:id/resolve-realignment',
          requestShape: '{ version: number, reason?: string }',
          responseShape: "{ id: string, status: 'confirmed' }",
        }),
        expect.objectContaining({
          method: 'GET',
          path: '/api/progress-deviation',
        }),
      ])
    )
  })
})

describe('planning state machine', () => {
  it('covers the required core states and events', () => {
    expect(planningStateMachine.states).toEqual([
      'draft',
      'confirmed',
      'closed',
      'revising',
      'pending_realign',
      'archived',
    ])
    expect(planningStateMachine.events).toEqual([
      'CONFIRM',
      'CLOSE_MONTH',
      'START_REVISION',
      'SUBMIT_REVISION',
      'QUEUE_REALIGNMENT',
      'RESOLVE_REALIGNMENT',
    ])
  })

  it('allows legal transitions', () => {
    expect(
      planningStateMachine.transition('draft', 'CONFIRM', {
        version: 3,
        expected_version: 3,
      })
    ).toBe('confirmed')
    expect(
      planningStateMachine.transition('confirmed', 'CLOSE_MONTH', {
        blocking_issue_count: 0,
      })
    ).toBe('closed')
    expect(
      planningStateMachine.transition('confirmed', 'START_REVISION', {
        revision_ready: true,
      })
    ).toBe('revising')
    expect(
      planningStateMachine.transition('revising', 'SUBMIT_REVISION', {
        revision_ready: true,
      })
    ).toBe('confirmed')
    expect(
      planningStateMachine.transition('confirmed', 'QUEUE_REALIGNMENT', {
        realignment_required: true,
      })
    ).toBe('pending_realign')
    expect(
      planningStateMachine.transition('pending_realign', 'RESOLVE_REALIGNMENT', {
        realignment_resolved: true,
      })
    ).toBe('confirmed')
  })

  it('rejects illegal transitions and guard failures', () => {
    expect(() => planningStateMachine.transition('confirmed', 'CONFIRM')).toThrow(
      PlanningStateTransitionError
    )

    try {
      planningStateMachine.transition('draft', 'CONFIRM', {
        version: 4,
        expected_version: 5,
      })
      throw new Error('expected transition to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningStateTransitionError)
      expect((error as PlanningStateTransitionError).code).toBe('VERSION_CONFLICT')
    }

    expect(
      planningStateMachine.canTransition('confirmed', 'CLOSE_MONTH', {
        has_blocking_issues: true,
      })
    ).toBe(false)
  })
})
