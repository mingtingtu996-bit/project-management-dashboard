import { render, screen } from '@testing-library/react'
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
        viewMode="list"
        canEdit
        onBack={vi.fn()}
        onViewModeChange={vi.fn()}
        onOpenCriticalPath={vi.fn()}
        onOpenTaskSummary={vi.fn()}
        onOpenScopeDimensions={vi.fn()}
        onCreateTask={vi.fn()}
        onOpenCloseout={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('GanttViewHeader governance banner', () => {
  it('shows the monthly pending banner without the closeout action', () => {
    renderHeader({
      activeCount: 2,
      dashboardCloseoutOverdue: false,
      dashboardForceUnlockAvailable: false,
      governancePhase: 'monthly_pending',
    })

    expect(screen.getByTestId('gantt-governance-banner-monthly-pending')).toBeTruthy()
    expect(screen.getByText('月计划待确认')).toBeTruthy()
    expect(screen.getByText('当前月计划尚未确认，建议先完成确认再进入正式执行。')).toBeTruthy()
    expect(screen.queryByTestId('gantt-closeout-entry')).toBeNull()
  })

  it('shows the closeout banner and action when the project is in closeout', () => {
    renderHeader({
      activeCount: 4,
      dashboardCloseoutOverdue: true,
      dashboardForceUnlockAvailable: true,
      governancePhase: 'closeout',
    })

    expect(screen.getByTestId('gantt-governance-banner-closeout')).toBeTruthy()
    expect(screen.getByText('月末关账')).toBeTruthy()
    expect(screen.getByTestId('gantt-closeout-entry')).toBeTruthy()
    expect(screen.getByText('治理信号 4')).toBeTruthy()
  })
})
