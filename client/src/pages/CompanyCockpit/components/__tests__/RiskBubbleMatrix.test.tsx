import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RiskBubbleMatrix } from '../RiskBubbleMatrix'

describe('RiskBubbleMatrix', () => {
  it('labels the matrix as a distribution and filter hint instead of a responsibility verdict', () => {
    render(
      <RiskBubbleMatrix
        risks={[{ id: 'risk-1', status: 'open', level: 'high' }] as never}
        issues={[{ id: 'issue-1', status: 'open', severity: 'critical' }] as never}
        projectRows={[
          {
            project: { id: 'project-1', name: '项目一' },
            summary: {
              pendingConditionCount: 2,
              activeObstacleCount: 1,
            },
            summaryStatus: 'ready',
            businessHealthScore: 72,
            keyNodeLabel: '结构封顶',
            keyNodeAttentionCount: 1,
            deliveryDaysRemaining: 120,
          },
        ] as never}
      />,
    )

    expect(screen.getByText('风险 / 问题 / 阻碍分布提示')).toBeInTheDocument()
    expect(screen.getByText('仅用于提示分布与筛选入口；责任归因、绩效判断和处置结论需进入项目核查。')).toBeInTheDocument()
    expect(screen.getByText('共 4 个活跃信号')).toBeInTheDocument()
  })
})
