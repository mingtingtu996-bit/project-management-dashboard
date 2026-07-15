import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CompanyHero } from '../CompanyHero'

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  onRefresh: vi.fn(),
  onCreate: vi.fn(),
  error: null,
  summaryReady: true,
  isRefreshing: false,
  healthHistory: { thisMonth: null, lastMonth: null, change: null, periods: [] },
  stats: {
    total: 3,
    inProgress: 1,
    completed: 0,
    paused: 0,
    averageHealth: 76,
    attentionProjectCount: 2,
    totalUnreadWarningCount: 5,
    totalDelayedTaskCount: 4,
    lowHealthProjectCount: 1,
    overdueMilestoneProjectCount: 1,
  },
  onNavigate: vi.fn(),
}

describe('CompanyHero', () => {
  it('renders the protective company conclusion instead of the old equal metric wall', () => {
    render(
      <CompanyHero
        {...baseProps}
      />,
    )

    expect(screen.getByText('组合信号 76 分 · 2 个项目建议优先查看')).toBeInTheDocument()
    expect(screen.queryAllByTestId('company-hero-metric')).toHaveLength(0)
    expect(screen.getByTestId('company-hero-evidence-chips')).toHaveTextContent('进行中 / 已完成1 / 0')
    expect(screen.getByTestId('company-hero-evidence-chips')).toHaveTextContent('未读预警5')
    expect(screen.getByTestId('company-hero-evidence-chips')).toHaveTextContent('延期任务4')
    expect(screen.getByTestId('company-hero-evidence-chips')).toHaveTextContent('低信号 / 节点逾期1 / 1')
    expect(screen.getByRole('button', { name: /刷新/ })).not.toBeDisabled()
  })

  it('degrades when the summary contract is missing instead of displaying fake zeroes', () => {
    render(
      <CompanyHero
        {...baseProps}
        summaryReady={false}
        stats={{
          total: null,
          inProgress: null,
          completed: null,
          paused: null,
          averageHealth: null,
          attentionProjectCount: null,
          totalUnreadWarningCount: null,
          totalDelayedTaskCount: null,
          lowHealthProjectCount: null,
          overdueMilestoneProjectCount: null,
        }}
      />,
    )

    expect(screen.getByText('公司组合主结论暂不可用')).toBeInTheDocument()
    expect(screen.getByText('等待公司汇总口径返回完整字段后展示。')).toBeInTheDocument()
    expect(screen.queryByText(/组合信号 0 分/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 个项目建议优先查看/)).not.toBeInTheDocument()
  })

  it('keeps real zero values visible when the backend explicitly returns them', () => {
    render(
      <CompanyHero
        {...baseProps}
        isRefreshing={true}
        stats={{
          total: 2,
          inProgress: 2,
          completed: 0,
          paused: 0,
          averageHealth: 0,
          attentionProjectCount: 0,
          totalUnreadWarningCount: 0,
          totalDelayedTaskCount: 0,
          lowHealthProjectCount: 0,
          overdueMilestoneProjectCount: 0,
        }}
      />,
    )

    expect(screen.getByText('2 个项目组合运行平稳')).toBeInTheDocument()
    expect(screen.getByText('组合信号 0 分')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /刷新中/ })).toBeDisabled()
  })
})
