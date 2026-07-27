import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompanyInsightSection } from '../CompanyInsightSection'

vi.mock('../CompanyHealthHeatmap', () => ({
  CompanyHealthHeatmap: () => <div data-testid="company-health-heatmap" />,
}))

vi.mock('../MilestoneAchievementChart', () => ({
  MilestoneAchievementChart: () => <div data-testid="milestone-achievement-chart" />,
}))

vi.mock('../ProjectSignalRanking', () => ({
  ProjectSignalRanking: () => <div data-testid="project-signal-ranking" />,
}))

vi.mock('../RiskBubbleMatrix', () => ({
  RiskBubbleMatrix: () => <div data-testid="risk-bubble-matrix" />,
}))

describe('CompanyInsightSection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders duplicate anomaly reasons without triggering React duplicate-key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <CompanyInsightSection
        projectRows={[
          {
            project: { id: 'project-1', name: '重复项目名' },
            summary: {
              id: 'project-1',
              name: '重复项目名',
              attentionRequired: true,
              highestWarningSummary: '同一条预警原因',
            },
            summaryStatus: '进行中',
            businessHealthScore: 50,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-2', name: '重复项目名' },
            summary: {
              id: 'project-2',
              name: '重复项目名',
              attentionRequired: true,
              highestWarningSummary: '同一条预警原因',
            },
            summaryStatus: '进行中',
            businessHealthScore: 50,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
        ] as never}
        healthHistory={{ thisMonth: null, lastMonth: null, change: null, periods: [] }}
        stats={{
          total: 2,
          inProgress: 2,
          completed: 0,
          paused: 0,
          averageHealth: 50,
          averageProgress: 0,
          attentionProjectCount: 2,
          totalUnreadWarningCount: 0,
          totalDelayedTaskCount: 0,
          lowHealthProjectCount: 2,
        }}
        companyRisks={[]}
        companyIssues={[]}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText('2 个项目建议优先查看')).toBeInTheDocument()
    expect(screen.getByTestId('company-action-focus')).toBeInTheDocument()
    expect(
      consoleError.mock.calls.some((call) => (
        call.some((part) => String(part).includes('Encountered two children with the same key'))
      )),
    ).toBe(false)
  })

  it('renders up to three navigation-only priority actions from summary attention order', () => {
    render(
      <CompanyInsightSection
        projectRows={[
          {
            project: { id: 'project-1', name: '摘要第一关注' },
            summary: {
              id: 'project-1',
              name: '摘要第一关注',
              attentionRequired: true,
              highestWarningSummary: '关键路径预警待复核',
              unreadWarningCount: 4,
            },
            summaryStatus: '进行中',
            businessHealthScore: 52,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-2', name: '无需关注项目' },
            summary: {
              id: 'project-2',
              name: '无需关注项目',
              attentionRequired: false,
              highestWarningSummary: '不应进入行动区',
              unreadWarningCount: 99,
            },
            summaryStatus: '进行中',
            businessHealthScore: 40,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-3', name: '摘要第二关注' },
            summary: {
              id: 'project-3',
              name: '摘要第二关注',
              attentionRequired: true,
              highestWarningSummary: null,
              activeDelayedTasks: 2,
              activeObstacles: 1,
            },
            summaryStatus: '进行中',
            businessHealthScore: 64,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-4', name: '摘要第三关注' },
            summary: {
              id: 'project-4',
              name: '摘要第三关注',
              attentionRequired: true,
              highestWarningSummary: null,
              criticalPathAffectedTasks: 3,
            },
            summaryStatus: '进行中',
            businessHealthScore: 70,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-5', name: '第四关注不展示' },
            summary: {
              id: 'project-5',
              name: '第四关注不展示',
              attentionRequired: true,
              highestWarningSummary: '第四条不进入首屏行动区',
            },
            summaryStatus: '进行中',
            businessHealthScore: 30,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
        ] as never}
        healthHistory={{ thisMonth: null, lastMonth: null, change: null, periods: [] }}
        stats={{
          total: 5,
          inProgress: 5,
          completed: 0,
          paused: 0,
          averageHealth: 50,
          averageProgress: 0,
          attentionProjectCount: 4,
          totalUnreadWarningCount: 4,
          totalDelayedTaskCount: 2,
          lowHealthProjectCount: 1,
        }}
        companyRisks={[]}
        companyIssues={[]}
        onNavigate={vi.fn()}
      />,
    )

    const actions = screen.getAllByTestId('company-action-item')
    expect(actions).toHaveLength(3)
    expect(actions[0]).toHaveTextContent('摘要第一关注')
    expect(actions[0]).toHaveTextContent('关键路径预警待复核')
    expect(actions[1]).toHaveTextContent('摘要第二关注')
    expect(actions[1]).toHaveTextContent('延期任务 2')
    expect(actions[1]).toHaveTextContent('阻碍 1')
    expect(actions[2]).toHaveTextContent('摘要第三关注')
    expect(actions[2]).toHaveTextContent('关键路径受影响 3')
    expect(screen.queryByText('无需关注项目')).not.toBeInTheDocument()
    expect(screen.queryByText('第四关注不展示')).not.toBeInTheDocument()
    expect(screen.queryByText('自动处置')).not.toBeInTheDocument()
  })
})
