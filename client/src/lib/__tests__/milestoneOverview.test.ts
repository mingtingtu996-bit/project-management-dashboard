import { describe, expect, it } from 'vitest'

import { buildMilestoneOverview, getMilestoneLifecycleStatus } from '../milestoneOverview'

describe('milestone overview', () => {
  it('classifies milestone tasks from the shared task list', () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const farPastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const overview = buildMilestoneOverview([
      {
        id: 'm1',
        title: '主体封顶',
        status: 'completed',
        progress: 100,
        is_milestone: true,
        planned_end_date: farPastDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm2',
        title: '地下室施工',
        status: 'in_progress',
        progress: 60,
        is_milestone: true,
        planned_end_date: futureDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'm3',
        title: '桩基开工',
        status: 'todo',
        progress: 0,
        is_milestone: true,
        planned_end_date: pastDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'task-1',
        title: '普通任务',
        status: 'in_progress',
        progress: 40,
        is_milestone: false,
        planned_end_date: futureDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ] as never)

    expect(overview.items.map((item) => item.id)).toEqual(['m3', 'm2', 'm1'])
    expect(overview.stats).toEqual({
      total: 3,
      pending: 2,
      completed: 1,
      overdue: 1,
      upcomingSoon: 1,
      completionRate: 33,
    })
  })

  it('derives lifecycle status from the task due date and completion state', () => {
    expect(
      getMilestoneLifecycleStatus(
        {
          status: 'completed',
          planned_end_date: '2026-04-01',
          end_date: null,
        } as never,
      ),
    ).toBe('completed')

    expect(
      getMilestoneLifecycleStatus(
        {
          status: 'todo',
          planned_end_date: '2026-03-28',
          end_date: null,
        } as never,
        new Date('2026-04-01T00:00:00.000Z').getTime(),
      ),
    ).toBe('overdue')
  })
})
