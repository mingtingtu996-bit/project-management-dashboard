import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { GanttViewHeader } from '../GanttViewHeader'

function renderHeader(planningGovernance?: Parameters<typeof GanttViewHeader>[0]['planningGovernance']) {
  render(
    <MemoryRouter>
      <GanttViewHeader
        projectId="project-1"
        projectName="示例项目"
        planningGovernance={planningGovernance}
        onBack={vi.fn()}
        onOpenCriticalPath={vi.fn()}
        onOpenEngineeringObjects={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('GanttViewHeader governance banner', () => {
  it('shows the monthly pending banner without the closeout action', () => {
    renderHeader({
      activeCount: 2,
      dashboardCloseoutOverdue: false,
      dashboardCloseoutOwnerAttentionRequired: false,
      governancePhase: 'monthly_pending',
    })

    expect(screen.getByTestId('gantt-governance-banner-monthly-pending')).toBeTruthy()
    expect(screen.getByText('月计划待确认')).toBeTruthy()
    expect(screen.getByText('当前月度计划尚未确认，请确认后再进入正式执行。')).toBeTruthy()
    expect(screen.queryByTestId('gantt-closeout-entry')).toBeNull()
  })

  it('keeps closeout governance out of the ordinary task-list entry', () => {
    renderHeader({
      activeCount: 4,
      dashboardCloseoutOverdue: true,
      dashboardCloseoutOwnerAttentionRequired: true,
      governancePhase: 'closeout',
    })

    expect(screen.queryByTestId('gantt-governance-banner-closeout')).toBeNull()
    expect(screen.queryByText('月末关账')).toBeNull()
    expect(screen.queryByTestId('gantt-closeout-entry')).toBeNull()
  })

  it('does not expose an independent create-task entry in the ordinary header', () => {
    renderHeader()

    expect(screen.queryByTestId('gantt-create-task')).toBeNull()
    expect(screen.queryByText('新建任务')).toBeNull()
  })

  it('exposes a lightweight refresh action when provided', () => {
    const onRefresh = vi.fn()
    render(
      <MemoryRouter>
        <GanttViewHeader
          projectId="project-1"
          projectName="示例项目"
          onBack={vi.fn()}
          onOpenCriticalPath={vi.fn()}
          onOpenEngineeringObjects={vi.fn()}
          onRefresh={onRefresh}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('gantt-light-refresh'))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
