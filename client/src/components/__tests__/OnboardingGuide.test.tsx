import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '@/hooks/useStore'

import { OnboardingGuide } from '../OnboardingGuide'
import { Button } from '@/components/ui/button'

function firstButton(name: string) {
  return screen.getAllByRole('button', { name })[0]
}

function firstLabel(label: string) {
  return screen.getAllByLabelText(label)[0]
}

async function firstGuide() {
  await screen.findAllByTestId('onboarding-guide')
  return screen.getAllByTestId('onboarding-guide')[0]
}

function renderGuide(path: string, content?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {content}
      <OnboardingGuide />
    </MemoryRouter>,
  )
}

describe('OnboardingGuide', () => {
  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReset()
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    useStore.setState({ currentProject: null })
  })

  it('starts a three-step workspace guide on /workspace', async () => {
    renderGuide('/workspace', (
      <div>
        <section data-onboarding-target="workspace-context" />
        <section data-onboarding-target="workspace-metrics" />
        <section data-onboarding-target="workspace-projects" />
      </div>
    ))

    expect(await firstGuide()).toHaveTextContent('工作台上下文')
    expect(firstLabel('引导进度 1/3')).toHaveTextContent('● ○ ○')

    fireEvent.click(firstButton('下一步'))
    await waitFor(() => {
      expect(screen.getAllByTestId('onboarding-guide')[0]).toHaveTextContent('待处理事项')
    })

    fireEvent.click(firstButton('下一步'))
    fireEvent.click(firstButton('完成引导'))

    await waitFor(() => {
      expect(window.localStorage.setItem).toHaveBeenCalledWith('onboarding_workspace_completed', 'true')
      expect(screen.queryAllByTestId('onboarding-guide')).toHaveLength(0)
    })
  })

  it('starts the three-step project guide for first-time project users and then shows the daily workflow', async () => {
    renderGuide('/projects/project-1/dashboard', (
      <div>
        <aside data-onboarding-target="sidebar" />
        <div data-onboarding-target="dashboard-metrics" />
        <a data-onboarding-target="planning-nav" />
        <a data-onboarding-target="gantt-nav" />
        <Button unstyled data-onboarding-target="template-generate">生成任务</Button>
        <a data-onboarding-target="reports-nav" />
        <a data-onboarding-target="notifications-nav" />
      </div>
    ))

    expect(await firstGuide()).toHaveTextContent('项目导航')
    expect(firstLabel('引导进度 1/3')).toHaveTextContent('● ○ ○')

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(firstButton('下一步'))
    }
    await waitFor(() => {
      expect(screen.getAllByTestId('onboarding-guide')[0]).toHaveTextContent('Dashboard 指标区')
    })
    fireEvent.click(firstButton('完成引导'))

    await waitFor(() => {
      expect(window.localStorage.setItem).toHaveBeenCalledWith('onboarding_project_completed', 'true')
      expect(window.localStorage.setItem).not.toHaveBeenCalledWith('onboarding_completed', 'true')
      expect(screen.getByTestId('onboarding-daily-workflow')).toHaveTextContent('每日工作流')
    })
  })

  it('links daily workflow steps when project onboarding has been completed', async () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      if (key === 'onboarding_project_completed') return 'true'
      return null
    })
    useStore.setState({ currentProject: { id: 'project-1', name: '示例项目' } as never })

    renderGuide('/projects/project-1/dashboard')

    expect(await screen.findByRole('link', { name: 'Dashboard 查看概况' })).toHaveAttribute('href', '/projects/project-1/dashboard')
    expect(screen.getByRole('link', { name: '进入任务列表' })).toHaveAttribute('href', '/projects/project-1/gantt')
    expect(screen.getByRole('link', { name: '查看提醒中心' })).toHaveAttribute('href', '/projects/project-1/notifications')

    fireEvent.click(firstButton('关闭每日工作流'))
    expect(window.localStorage.setItem).toHaveBeenCalledWith('onboarding_daily_workflow_dismissed', 'true')
  })

  it('does not render onboarding on unrelated routes', () => {
    renderGuide('/login')

    expect(screen.queryByTestId('onboarding-guide')).not.toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-daily-workflow')).not.toBeInTheDocument()
  })

  it('shows the project daily workflow inside task-list modeling workbench routes', async () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      if (key === 'onboarding_project_completed') return 'true'
      return null
    })
    useStore.setState({ currentProject: { id: 'project-1', name: '示例项目' } as never })

    renderGuide('/projects/project-1/gantt?modelingWorkbench=generate')

    expect(screen.queryByTestId('onboarding-guide')).not.toBeInTheDocument()
    expect(await screen.findByTestId('onboarding-daily-workflow')).toBeInTheDocument()
  })
})
