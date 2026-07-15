import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectSignalRanking } from '../ProjectSignalRanking'

describe('ProjectSignalRanking', () => {
  it('uses company signal totals instead of recomputing header metrics from rows', () => {
    render(
      <ProjectSignalRanking
        companySignals={{
          attentionProjectCount: 9,
          totalUnreadWarningCount: 42,
          totalDelayedTaskCount: 17,
        }}
        projectRows={[
          {
            project: { id: 'project-1', name: '项目一' },
            summary: {
              id: 'project-1',
              name: '项目一',
              businessHealthScore: 80,
              unreadWarningCount: 3,
              activeDelayedTasks: 2,
              attentionRequired: true,
            },
            summaryStatus: '进行中',
            businessHealthScore: 80,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
        ] as never}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText((_, element) => element?.textContent === '需关注 9')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '未读预警 42')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '延期信号 17')).toBeInTheDocument()
  })

  it('keeps summary order instead of recalculating priority in the frontend', () => {
    render(
      <ProjectSignalRanking
        companySignals={{
          attentionProjectCount: 1,
          totalUnreadWarningCount: 3,
          totalDelayedTaskCount: 2,
        }}
        projectRows={[
          {
            project: { id: 'project-a', name: '摘要第一项目' },
            summary: {
              id: 'project-a',
              name: '摘要第一项目',
              businessHealthScore: 92,
              unreadWarningCount: 0,
              activeDelayedTasks: 0,
              attentionRequired: false,
            },
            summaryStatus: '进行中',
            businessHealthScore: 92,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
          {
            project: { id: 'project-b', name: '摘要第二项目' },
            summary: {
              id: 'project-b',
              name: '摘要第二项目',
              businessHealthScore: 40,
              unreadWarningCount: 3,
              activeDelayedTasks: 2,
              attentionRequired: true,
            },
            summaryStatus: '进行中',
            businessHealthScore: 40,
            keyNodeLabel: '',
            keyNodeAttentionCount: 0,
            deliveryDaysRemaining: null,
          },
        ] as never}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('company-signal-row')[0]).toHaveTextContent('摘要第一项目')
  })
})
