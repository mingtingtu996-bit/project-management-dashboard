import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordChangedExecutionFacts: vi.fn(async () => []),
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: mocks.recordChangedExecutionFacts,
}))

const { recordAcceptancePlanExecutionFacts } = await import('../services/acceptancePlanExecutionFactService.js')

describe('acceptancePlanExecutionFactService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the default ALS governance call shape and acceptance source', async () => {
    await recordAcceptancePlanExecutionFacts({
      projectId: 'project-1',
      planId: 'plan-1',
      previous: null,
      next: { status: 'draft', actual_date: null },
      sourceMutationId: 'acceptance-plan:create:plan-1',
      observedAt: '2026-07-24T10:00:00.000Z',
      forceInitial: true,
    })

    expect(mocks.recordChangedExecutionFacts).toHaveBeenCalledTimes(1)
    expect(mocks.recordChangedExecutionFacts.mock.calls[0]).toHaveLength(1)
    expect(mocks.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      sourceModule: 'acceptance-plans',
      entityType: 'acceptance_plan',
      entityId: 'plan-1',
      changes: expect.arrayContaining([
        expect.objectContaining({
          factType: 'acceptance_plan.status',
          nextValue: 'draft',
          force: true,
        }),
        expect.objectContaining({
          factType: 'acceptance_plan.actual_date',
          nextValue: null,
          force: true,
        }),
      ]),
    }))
  })

  it('passes explicit transaction execution to governance callers', async () => {
    const queryExec = vi.fn(async () => [])
    const isTransactionActive = vi.fn(() => true)

    await recordAcceptancePlanExecutionFacts({
      projectId: 'project-1',
      planId: 'plan-2',
      previous: null,
      next: { status: 'passed', actual_date: '2026-07-24' },
      sourceModule: 'projectWizard',
      sourceMutationId: 'wizard:acceptance-plan:plan-2:create',
      observedAt: '2026-07-24T10:00:00.000Z',
      forceInitial: true,
      queryExec,
      isTransactionActive,
    })

    expect(mocks.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceModule: 'projectWizard',
        entityId: 'plan-2',
      }),
      { queryExec, isTransactionActive },
    )
  })
})
