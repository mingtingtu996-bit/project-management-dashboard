import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getTask: mocks.getTask,
  updateTask: mocks.updateTask,
}))

vi.mock('../services/planningScheduleGovernanceService.js', () => ({
  ExecutionFactIntent: {
    AcceptancePass: 'acceptance_pass',
    SystemBackfill: 'system_backfill',
  },
}))

const {
  isAcceptanceTimelineCanonicalTask,
  syncAcceptancePlansFromCanonicalTask,
  syncCanonicalTaskFromAcceptancePlan,
} = await import('../services/acceptanceTaskSyncService.js')

describe('acceptanceTaskSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockResolvedValue([])
    mocks.getTask.mockResolvedValue(null)
    mocks.updateTask.mockResolvedValue(null)
  })

  it('does not sync ordinary construction tasks or checkpoint metadata into the acceptance timeline', async () => {
    const previousTask = {
      id: 'ordinary-task',
      project_id: 'project-1',
      planned_end_date: '2026-06-01',
      standard_task_metadata: {
        acceptanceCheckpoints: ['自检', '隐蔽验收', '资料复核'],
      },
    }
    const nextTask = {
      ...previousTask,
      planned_end_date: '2026-06-03',
    }

    expect(isAcceptanceTimelineCanonicalTask(nextTask as any)).toBe(false)

    const result = await syncAcceptancePlansFromCanonicalTask({
      previousTask: previousTask as any,
      nextTask: nextTask as any,
      actorId: 'user-1',
    })

    expect(result).toEqual({ updated: false })
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('syncs canonical major acceptance task date changes back to the linked acceptance plan', async () => {
    const previousTask = {
      id: 'major-acceptance-task',
      project_id: 'project-1',
      planned_end_date: '2026-06-01',
      standard_task_metadata: {
        planItemKind: 'linked_projection',
        isAcceptanceMilestone: true,
      },
    }
    const nextTask = {
      ...previousTask,
      planned_end_date: '2026-06-05',
    }

    expect(isAcceptanceTimelineCanonicalTask(nextTask as any)).toBe(true)

    mocks.executeSQL
      .mockResolvedValueOnce([{ source_entity_id: 'plan-1' }])
      .mockResolvedValueOnce([])

    const result = await syncAcceptancePlansFromCanonicalTask({
      previousTask: previousTask as any,
      nextTask: nextTask as any,
      actorId: 'user-1',
    })

    expect(result).toEqual({ updated: true })
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE acceptance_plans'),
      ['2026-06-05', expect.any(String), 'project-1', 'plan-1'],
    )
  })

  it('does not mark linked acceptance plans passed when a canonical acceptance task is completed outside the acceptance state machine', async () => {
    const previousTask = {
      id: 'major-acceptance-task',
      project_id: 'project-1',
      status: 'in_progress',
      progress: 80,
      actual_end_date: null,
      standard_task_metadata: {
        acceptanceLinkRule: { mode: 'completion_acceptance' },
      },
    }
    const nextTask = {
      ...previousTask,
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-06-08',
    }

    const result = await syncAcceptancePlansFromCanonicalTask({
      previousTask: previousTask as any,
      nextTask: nextTask as any,
      actorId: 'user-1',
    })

    expect(result).toEqual({ updated: false })
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('syncs planned date and pass status from the acceptance timeline to the canonical task', async () => {
    mocks.getTask.mockResolvedValue({
      id: 'major-acceptance-task',
      project_id: 'project-1',
      status: 'in_progress',
      actual_end_date: null,
      standard_task_metadata: {
        planItemKind: 'linked_projection',
      },
    })
    mocks.updateTask.mockResolvedValue({ id: 'major-acceptance-task', status: 'completed' })

    const previousPlan = {
      id: 'plan-1',
      covered_task_ids: ['major-acceptance-task'],
      project_id: 'project-1',
      status: 'pending',
      planned_date: '2026-06-01',
      actual_date: null,
    }
    const nextPlan = {
      ...previousPlan,
      status: 'passed',
      planned_date: '2026-06-05',
      actual_date: '2026-06-06',
    }

    await syncCanonicalTaskFromAcceptancePlan({
      previousPlan: previousPlan as any,
      nextPlan: nextPlan as any,
      actorId: 'user-1',
    })

    expect(mocks.updateTask).toHaveBeenCalledWith(
      'major-acceptance-task',
      {
        planned_start_date: '2026-06-05',
        start_date: '2026-06-05',
        planned_end_date: '2026-06-05',
        end_date: '2026-06-05',
        status: 'completed',
        progress: 100,
        actual_end_date: '2026-06-06',
        updated_by: 'user-1',
      },
      undefined,
      {
        executionFactIntent: 'acceptance_pass',
        executionFactEventDate: '2026-06-06',
        allowManualActualDates: true,
      },
    )
  })

  it('updates canonical task actual end date when a passed acceptance plan actual date is corrected', async () => {
    mocks.getTask.mockResolvedValue({
      id: 'major-acceptance-task',
      project_id: 'project-1',
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-06-06',
      standard_task_metadata: {
        acceptanceLinkRule: { mode: 'completion_acceptance' },
      },
    })
    mocks.updateTask.mockResolvedValue({ id: 'major-acceptance-task', actual_end_date: '2026-06-09' })

    const previousPlan = {
      id: 'plan-1',
      covered_task_ids: ['major-acceptance-task'],
      project_id: 'project-1',
      status: 'passed',
      planned_date: '2026-06-05',
      actual_date: '2026-06-06',
    }
    const nextPlan = {
      ...previousPlan,
      actual_date: '2026-06-09',
    }

    await syncCanonicalTaskFromAcceptancePlan({
      previousPlan: previousPlan as any,
      nextPlan: nextPlan as any,
      actorId: 'user-1',
    })

    expect(mocks.updateTask).toHaveBeenCalledWith(
      'major-acceptance-task',
      {
        actual_end_date: '2026-06-09',
        updated_by: 'user-1',
      },
      undefined,
      {
        executionFactIntent: 'acceptance_pass',
        executionFactEventDate: '2026-06-09',
        allowManualActualDates: true,
      },
    )
  })

  it('reopens the canonical task when a passed acceptance plan moves back to rectifying', async () => {
    mocks.getTask.mockResolvedValue({
      id: 'major-acceptance-task',
      project_id: 'project-1',
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-06-06',
      standard_task_metadata: {
        acceptanceLinkRule: { mode: 'completion_acceptance' },
      },
    })
    mocks.updateTask.mockResolvedValue({
      id: 'major-acceptance-task',
      status: 'in_progress',
      progress: 80,
      actual_end_date: null,
    })

    const previousPlan = {
      id: 'plan-1',
      covered_task_ids: ['major-acceptance-task'],
      project_id: 'project-1',
      status: 'passed',
      planned_date: '2026-06-05',
      actual_date: '2026-06-06',
    }
    const nextPlan = {
      ...previousPlan,
      status: 'rectifying',
      actual_date: null,
    }

    await syncCanonicalTaskFromAcceptancePlan({
      previousPlan: previousPlan as any,
      nextPlan: nextPlan as any,
      actorId: 'user-1',
    })

    expect(mocks.updateTask).toHaveBeenCalledWith(
      'major-acceptance-task',
      {
        status: 'in_progress',
        progress: 80,
        actual_end_date: null,
        updated_by: 'user-1',
      },
      undefined,
      {
        executionFactIntent: 'system_backfill',
        executionFactEventDate: '2026-06-05',
        allowManualActualDates: true,
        allowReopen: true,
      },
    )
  })
})
