import { describe, expect, it } from 'vitest'

import { buildMilestoneOverview, summarizeSupplementaryProjectData } from '../services/projectExecutionSummaryService.js'

describe('summarizeSupplementaryProjectData', () => {
  it('counts certificate, acceptance and drawing summaries by project consistently', () => {
    const result = summarizeSupplementaryProjectData({
      preMilestones: [
        { id: 'pm-1', project_id: 'p-1', status: '待申请' },
        { id: 'pm-2', project_id: 'p-1', status: '办理中' },
        { id: 'pm-3', project_id: 'p-1', status: '已取得' },
        { id: 'pm-4', project_id: 'p-1', status: '需延期' },
      ],
      acceptancePlans: [
        { id: 'ap-1', project_id: 'p-1', status: 'pending' },
        { id: 'ap-2', project_id: 'p-1', status: 'in_progress' },
        { id: 'ap-3', project_id: 'p-1', status: 'passed' },
        { id: 'ap-4', project_id: 'p-1', status: 'failed' },
        { id: 'ap-5', project_id: 'p-1', status: 'needs_revision' },
      ],
      constructionDrawings: [
        { id: 'dw-1', project_id: 'p-1', status: '编制中', review_status: '未提交' },
        { id: 'dw-2', project_id: 'p-1', status: '已出图', review_status: '已通过' },
        { id: 'dw-3', project_id: 'p-1', status: '审图中', review_status: '审查中' },
      ],
    })

    expect(result).toEqual({
      preMilestoneCount: 4,
      completedPreMilestoneCount: 1,
      activePreMilestoneCount: 2,
      overduePreMilestoneCount: 1,
      acceptancePlanCount: 5,
      passedAcceptancePlanCount: 1,
      inProgressAcceptancePlanCount: 2,
      failedAcceptancePlanCount: 2,
      constructionDrawingCount: 3,
      issuedConstructionDrawingCount: 1,
      reviewingConstructionDrawingCount: 2,
    })
  })
})

describe('buildMilestoneOverview', () => {
  it('exposes milestone list and stats from the shared project summary source', () => {
    const result = buildMilestoneOverview([
      {
        id: 'm-1',
        title: '主体封顶',
        description: '结构施工关键节点',
        is_milestone: true,
        status: 'completed',
        progress: 100,
        planned_end_date: '2026-04-01',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm-2',
        title: '地下室施工',
        description: '正在推进',
        is_milestone: true,
        status: 'in_progress',
        progress: 60,
        planned_end_date: '2026-04-06',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 't-1',
        title: '普通任务',
        description: '不应进入里程碑统计',
        is_milestone: false,
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-04-08',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ] as any)

    expect(result.stats).toEqual({
      total: 2,
      pending: 1,
      completed: 1,
      overdue: 0,
      upcomingSoon: 1,
      completionRate: 50,
    })
    expect(result.items.map((item) => item.name)).toEqual(['主体封顶', '地下室施工'])
    expect(result.items[0]?.status).toBe('completed')
    expect(result.items[1]?.status).toBe('soon')
  })
})
