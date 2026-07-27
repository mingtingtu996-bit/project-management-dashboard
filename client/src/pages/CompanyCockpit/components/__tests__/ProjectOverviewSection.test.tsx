import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ProjectOverviewSection } from '../ProjectOverviewSection'
import type { ProjectRow } from '../../types'

type ProjectRowOverride = Partial<Omit<ProjectRow, 'businessHealthScore'>> & {
  businessHealthScore?: ProjectRow['businessHealthScore'] | null
}

function buildProjectRow(index: number, overrides: ProjectRowOverride = {}): ProjectRow {
  const id = `project-${index}`
  return {
    project: {
      id,
      name: `摘要排序项目 ${index}`,
      description: `第 ${index} 个项目`,
      status: 'active',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    },
    summary: {
      id,
      name: `摘要排序项目 ${index}`,
      status: 'active',
      statusLabel: '进行中',
      overallProgress: Math.min(100, index * 3),
      businessHealthScore: Math.max(1, 100 - index),
      activeRiskCount: index % 3,
      attentionRequired: index === 2,
      highestWarningSummary: index === 2 ? '摘要排序标记为优先查看' : null,
    } as never,
    summaryStatus: '进行中',
    businessHealthScore: Math.max(1, 100 - index),
    keyNodeLabel: '关键节点 1 个',
    keyNodeAttentionCount: 0,
    deliveryDaysRemaining: 30,
    ...(overrides as Partial<ProjectRow>),
  }
}

const defaultProps = {
  totalProjects: 12,
  activeTab: 'all' as const,
  tabItems: [
    { key: 'all' as const, label: '全部', count: 12 },
    { key: 'in_progress' as const, label: '进行中', count: 12 },
    { key: 'completed' as const, label: '已完成', count: 0 },
    { key: 'paused' as const, label: '已暂停', count: 0 },
  ],
  onTabChange: vi.fn(),
  onCreate: vi.fn(),
  onEdit: vi.fn(),
  onToggleArchive: vi.fn(),
  onDelete: vi.fn(),
  onNavigate: vi.fn(),
}

function renderSection(projectRows: ProjectRow[]) {
  return render(
    <MemoryRouter>
      <ProjectOverviewSection {...defaultProps} projectRows={projectRows} />
    </MemoryRouter>,
  )
}

describe('ProjectOverviewSection', () => {
  it('uses a compact default list and caps the first view to nine summary-ordered projects', () => {
    renderSection(Array.from({ length: 12 }, (_, index) => buildProjectRow(index + 1)))

    expect(screen.getByTestId('company-project-compact-list')).toBeInTheDocument()
    expect(screen.queryByTestId('company-project-card')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('company-project-row')).toHaveLength(9)
    expect(screen.getAllByTestId('company-project-row')[0]).toHaveTextContent('摘要排序项目 1')
    expect(screen.queryByText('摘要排序项目 10')).not.toBeInTheDocument()
    expect(screen.getByText('当前显示 9 / 12 个项目')).toBeInTheDocument()
  })

  it('shows degraded row fields instead of fake zeroes when a project summary is missing', () => {
    renderSection([
      buildProjectRow(1, {
        summary: null,
        businessHealthScore: null,
        keyNodeLabel: '关键节点摘要暂不可用',
        deliveryDaysRemaining: null,
      }),
    ] as never)

    expect(screen.getByTestId('company-project-compact-list')).toBeInTheDocument()
    expect(screen.getByText('摘要排序项目 1')).toBeInTheDocument()
    expect(screen.getAllByText('暂不可用').length).toBeGreaterThan(0)
    expect(screen.queryByText('健康信号 0')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('风险数 0')).not.toBeInTheDocument()
  })

  it('routes destructive project actions through the row action menu', async () => {
    const user = userEvent.setup()
    const row = buildProjectRow(1)
    const onDelete = vi.fn()
    render(
      <MemoryRouter>
        <ProjectOverviewSection {...defaultProps} projectRows={[row]} onDelete={onDelete} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '项目操作：摘要排序项目 1' }))
    await user.click(await screen.findByRole('menuitem', { name: '删除项目' }))

    expect(onDelete).toHaveBeenCalledWith(row.project)
  })
})
