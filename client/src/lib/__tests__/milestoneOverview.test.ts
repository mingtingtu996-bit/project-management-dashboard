import { describe, expect, it } from 'vitest'

import { createEmptyMilestoneOverview, getMilestoneLifecycleStatus, normalizeMilestoneOverview } from '../milestoneOverview'

describe('milestone overview', () => {
  it('normalizes backend milestone overview payloads', () => {
    const overview = normalizeMilestoneOverview({
      items: [
        {
          id: 'm1',
          name: '主体封顶',
          description: '结构节点',
          targetDate: '2026-04-01',
          planned_date: '2026-03-15',
          current_planned_date: '2026-03-18',
          actual_date: '2026-03-22',
          progress: 100,
          status: 'completed',
          statusLabel: '已完成',
          updatedAt: '2026-04-01T00:00:00.000Z',
          parent_id: null,
          mapping_pending: false,
          merged_into: null,
          merged_into_name: null,
          non_base_labels: ['执行层已关闭'],
        },
      ],
      stats: {
        total: 1,
        pending: 0,
        completed: 1,
        overdue: 0,
        upcomingSoon: 0,
        completionRate: 100,
      },
      summaryStats: {
        shiftedCount: 1,
        baselineOnTimeCount: 1,
        dueSoon30dCount: 0,
        highRiskCount: 0,
      },
      healthSummary: {
        status: 'normal',
        needsAttentionCount: 0,
        mappingPendingCount: 0,
        mergedCount: 0,
        excessiveDeviationCount: 0,
        incompleteDataCount: 0,
      },
    })

    expect(overview.items).toHaveLength(1)
    expect(overview.items[0].name).toBe('主体封顶')
    expect(overview.stats).toEqual({
      total: 1,
      pending: 0,
      completed: 1,
      overdue: 0,
      upcomingSoon: 0,
      completionRate: 100,
    })
    expect(overview.summaryStats?.shiftedCount).toBe(1)
    expect(overview.healthSummary?.status).toBe('normal')
  })

  it('creates an empty overview for missing payloads', () => {
    expect(createEmptyMilestoneOverview()).toEqual({
      items: [],
      stats: {
        total: 0,
        pending: 0,
        completed: 0,
        overdue: 0,
        upcomingSoon: 0,
        completionRate: 0,
      },
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
