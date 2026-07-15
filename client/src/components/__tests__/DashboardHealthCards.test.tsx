import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardHealthCards } from '../DashboardHealthCards'
import type { ProjectSummary } from '@/services/dashboardApi'

const apiState = vi.hoisted(() => ({
  error: null as Error | null,
  response: {
    score: 60,
    details: {
      totalScore: 60,
      businessHealthScore: 60,
      progressDeliveryScore: 100,
      taskExecutionScore: 90,
      milestoneDeliveryScore: 65,
      riskControlScore: 0,
      dataTrustScore: 44,
    },
  } as any,
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(async () => {
    if (apiState.error) throw apiState.error
    return apiState.response
  }),
  isAbortError: () => false,
}))

function flush() {
  return Promise.resolve()
}

function healthProps() {
  const details = apiState.response?.details ?? null
  return {
    healthDetails: details,
    healthDetailsStatus: details ? 'ready' as const : 'unavailable' as const,
  }
}

const summary = {
  id: 'project-1',
  name: 'DEMO-COMPLETE',
  status: 'active',
  statusLabel: '进行中',
  plannedEndDate: '2027-04-24',
  daysUntilPlannedEnd: 100,
  totalTasks: 9,
  leafTaskCount: 9,
  completedTaskCount: 0,
  inProgressTaskCount: 3,
  delayedTaskCount: 0,
  delayDays: 0,
  delayCount: 0,
  overallProgress: 25,
  taskProgress: 25,
  totalMilestones: 1,
  completedMilestones: 0,
  milestoneProgress: 0,
  riskCount: 2,
  activeRiskCount: 2,
  activeIssueCount: 4,
  pendingConditionCount: 2,
  pendingConditionTaskCount: 2,
  activeObstacleCount: 1,
  activeObstacleTaskCount: 1,
  preMilestoneCount: 0,
  completedPreMilestoneCount: 0,
  activePreMilestoneCount: 0,
  overduePreMilestoneCount: 0,
  acceptancePlanCount: 0,
  passedAcceptancePlanCount: 0,
  inProgressAcceptancePlanCount: 0,
  failedAcceptancePlanCount: 0,
  constructionDrawingCount: 0,
  issuedConstructionDrawingCount: 0,
  reviewingConstructionDrawingCount: 0,
  businessHealthScore: 60,
  healthStatus: '亚健康',
  milestoneOverview: {
    items: [],
    stats: {
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0,
      upcomingSoon: 0,
      completionRate: 0,
    },
  },
} as ProjectSummary

describe('DashboardHealthCards', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    apiState.error = null
    apiState.response = {
      score: 60,
      details: {
        totalScore: 60,
        businessHealthScore: 60,
        progressDeliveryScore: 100,
        taskExecutionScore: 90,
        milestoneDeliveryScore: 65,
        riskControlScore: 0,
        dataTrustScore: 44,
      },
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('separates execution stability from task completion rate and uses summary task counts', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={summary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('执行稳定度')
    expect(container.textContent).toContain('完成率')
    expect(container.textContent).not.toContain('任务执行90%')

    expect(container.textContent).toContain('进行中')
    expect(container.textContent).toContain('3')
  })

  it('keeps data reliability out of the business health dimension rows', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={summary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('业务健康指标')
    expect(container.textContent).toContain('计划治理')
    expect(container.textContent).not.toContain('数据可靠性')
  })

  it('does not render card-head pills for dashboard health summary cards', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={summary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('业务健康指标')
    expect(container.textContent).toContain('任务执行情况')
    expect(container.textContent).toContain('风险与异常追踪')
    expect(container.querySelector('.badge-micro')).toBeNull()
    expect(container.textContent).not.toContain('亚健康')
  })

  it('keeps low health as a numeric signal without restoring status pills', async () => {
    apiState.response = {
      score: 39,
      details: {
        totalScore: 39,
        businessHealthScore: 39,
        progressDeliveryScore: 39,
        taskExecutionScore: 39,
        milestoneDeliveryScore: 39,
        riskControlScore: 39,
        dataTrustScore: 39,
      },
    }

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={{ ...summary, businessHealthScore: 39, healthStatus: '危险' } as ProjectSummary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('39%')
    expect(container.textContent).not.toContain('危险')
    expect(container.querySelector('.badge-micro')).toBeNull()
  })

  it('marks degraded health details as low-confidence reference instead of ordinary health truth', async () => {
    const degradedDetails = {
      businessHealthScore: 72,
      progressDeliveryScore: 72,
      taskExecutionScore: 70,
      milestoneDeliveryScore: 65,
      riskControlScore: 60,
      dataTrustScore: 20,
      capReasons: ['request_budget_exceeded'],
      metricAvailability: {
        progressDeliveryScore: true,
        taskExecutionScore: true,
        milestoneDeliveryScore: false,
        riskControlScore: true,
        dataTrustScore: false,
      },
    }

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={{ ...summary, businessHealthScore: 72 } as ProjectSummary}
            projectId="project-1"
            healthDetails={degradedDetails}
            healthDetailsStatus="degraded"
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    const note = container.querySelector('[data-testid="dashboard-health-degraded-note"]')
    expect(note).toBeTruthy()
    expect(note?.textContent).toContain('参考')
    expect(note?.textContent).toContain('低信')
    expect(note?.textContent).toContain('部分维度暂不可用')
    expect(note?.textContent).toContain('request_budget_exceeded')
  })

  it('uses leaf task count as the task completion denominator', async () => {
    const mixedSummary = {
      ...summary,
      totalTasks: 10,
      leafTaskCount: 4,
      completedTaskCount: 1,
      inProgressTaskCount: 2,
    } as ProjectSummary

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={mixedSummary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.querySelector('svg[aria-label="完成率 25%"]')).toBeTruthy()
  })

  it('does not estimate health dimensions from summary data when health details are unavailable', async () => {
    apiState.response = {
      score: 60,
      details: null,
    }

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={summary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('进度兑现')
    expect(container.textContent).toContain('暂无')
    expect(container.textContent).not.toContain('进度兑现25%')
    expect(container.textContent).not.toContain('执行稳定度0%')
  })

  it('does not render a fake zero business health donut when health score is missing', async () => {
    apiState.response = {
      score: 0,
      details: null,
    }

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={{ ...summary, businessHealthScore: null } as ProjectSummary}
            projectId="project-1"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.querySelector('svg[aria-label="业务健康 暂不可用"]')).toBeTruthy()
    expect(container.textContent).toContain('--')
    expect(container.textContent).not.toContain('0%业务健康')
  })

  it('renders unavailable health dimensions as empty instead of default percentages', async () => {
    apiState.response = {
      score: 0,
      details: {
        totalScore: 0,
        progressDeliveryScore: 0,
        taskExecutionScore: 0,
        milestoneDeliveryScore: 0,
        riskControlScore: 0,
        dataTrustScore: 0,
        metricAvailability: {
          progressDeliveryScore: false,
          taskExecutionScore: false,
          milestoneDeliveryScore: false,
          riskControlScore: false,
          dataTrustScore: true,
        },
        metricUnavailableReasons: {
          progressDeliveryScore: '缺少可评估任务',
          taskExecutionScore: '缺少可评估任务',
          milestoneDeliveryScore: '缺少里程碑或专项目标',
          riskControlScore: '缺少任务或风险异常信号',
        },
      },
    }
    const emptySummary = {
      ...summary,
      totalTasks: 0,
      leafTaskCount: 0,
      completedTaskCount: 0,
      inProgressTaskCount: 0,
      delayedTaskCount: 0,
      overallProgress: 0,
      taskProgress: 0,
      totalMilestones: 0,
      completedMilestones: 0,
      milestoneProgress: 0,
      activeRiskCount: 0,
      activeIssueCount: 0,
      activeObstacleCount: 0,
      pendingConditionTaskCount: 0,
      businessHealthScore: 0,
    } as ProjectSummary

    await act(async () => {
      root?.render(
        <MemoryRouter>
          <DashboardHealthCards
            summary={emptySummary}
            projectId="project-empty"
            {...healthProps()}
            embedded
          />
        </MemoryRouter>,
      )
      await flush()
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('进度兑现')
    expect(container.textContent).toContain('关键目标')
    expect(container.textContent).toContain('业务异常')
    expect(container.textContent).toContain('计划治理')
    expect(container.textContent).toContain('暂无')
    expect(container.textContent).not.toContain('进度兑现100%')
    expect(container.textContent).not.toContain('关键目标95%')
  })
})
