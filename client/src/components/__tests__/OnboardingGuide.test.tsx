import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OnboardingGuide } from '../OnboardingGuide'

function firstButton(name: string) {
  return screen.getAllByRole('button', { name })[0]
}

describe('OnboardingGuide', () => {
  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReset()
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
  })

  it('starts the five-step guide for first-time users and can complete it', async () => {
    render(
      <div>
        <aside data-onboarding-target="sidebar" />
        <div data-onboarding-target="dashboard-metrics" />
        <a data-onboarding-target="planning-nav" />
        <a data-onboarding-target="gantt-nav" />
        <a data-onboarding-target="reports-nav" />
        <OnboardingGuide />
      </div>,
    )

    const guidePanels = await screen.findAllByTestId('onboarding-guide')
    expect(guidePanels[0]).toHaveTextContent('侧边栏导航结构')
    expect(screen.getAllByLabelText('引导进度 1/5')[0]).toHaveTextContent('● ○ ○ ○ ○')
    expect(firstButton('跳过引导')).toBeInTheDocument()

    fireEvent.click(firstButton('下一步'))
    expect((await screen.findAllByText('Dashboard 核心指标区'))[0]).toBeInTheDocument()

    fireEvent.click(firstButton('下一步'))
    fireEvent.click(firstButton('下一步'))
    fireEvent.click(firstButton('下一步'))
    fireEvent.click(firstButton('完成引导'))

    await waitFor(() => {
      expect(window.localStorage.setItem).toHaveBeenCalledWith('onboarding_completed', 'true')
      expect(screen.getByTestId('onboarding-daily-workflow')).toHaveTextContent('每日工作流')
    })
  })

  it('shows the daily workflow card after onboarding has been completed', async () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      if (key === 'onboarding_completed') return 'true'
      return null
    })

    render(<OnboardingGuide />)

    expect(await screen.findByTestId('onboarding-daily-workflow')).toHaveTextContent('Dashboard 查看概况')
    expect(screen.queryByTestId('onboarding-guide')).not.toBeInTheDocument()

    fireEvent.click(firstButton('关闭每日工作流'))
    expect(window.localStorage.setItem).toHaveBeenCalledWith('onboarding_daily_workflow_dismissed', 'true')
  })
})
