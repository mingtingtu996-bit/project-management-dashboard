import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { V14231PageConsumptionReadiness } from '@/services/v14231ReadinessApi'

const mocks = vi.hoisted(() => ({
  fetchV14231PageConsumptionReadiness: vi.fn(),
}))

vi.mock('@/services/v14231ReadinessApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/v14231ReadinessApi')>(
    '@/services/v14231ReadinessApi',
  )

  return {
    ...actual,
    fetchV14231PageConsumptionReadiness: mocks.fetchV14231PageConsumptionReadiness,
  }
})

const { V14231PageReadinessBoundary } = await import(
  '@/components/governance/V14231PageReadinessBoundary'
)

function readiness(overrides: Partial<V14231PageConsumptionReadiness>): V14231PageConsumptionReadiness {
  return {
    kind: 'page',
    key: 'dashboard',
    page: 'Dashboard 项目总览',
    pageAvailability: 'available',
    actionReadiness: 'mixed',
    status: 'needs-gating',
    currentStatusText: '`needs-gating`',
    consumableCapabilities: '健康分、偏差摘要、快照趋势、普通进度录入',
    uiDegradationStrategy: '健康 / 偏差只做解释和对象跳转；普通进度录入可作为主链动作。',
    forbiddenActions: '不得显示自动根因、自动问责、自动改计划或整体 production-ready 文案。',
    sourcePlan: 'v1.4.23.1-A',
    sourceSection: '4.7.06',
    sourceRowRef: '4.7.06#1',
    browserVerificationScripts: ['verify:dashboard'],
    browserVerificationPolicy: '新增页面必须先补 4.7.06 行和对应浏览器主链路脚本映射',
    canUseAsPrimaryMetric: false,
    canUseAsPrimaryConclusion: false,
    canUseAsStableAction: false,
    requiresDisplayOnlyDegradation: false,
    ...overrides,
  }
}

describe('V14231PageReadinessBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a registered page available and describes only the gated actions', async () => {
    mocks.fetchV14231PageConsumptionReadiness.mockResolvedValueOnce(readiness({}))

    render(<V14231PageReadinessBoundary pageKey="Dashboard 项目总览" />)

    expect(await screen.findByTestId('v14231-page-readiness-boundary')).toHaveTextContent('needs-gating')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('页面可用')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('受控动作')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('不得显示自动根因')
  })

  it('does not render a banner for fully production-ready page rows', async () => {
    mocks.fetchV14231PageConsumptionReadiness.mockResolvedValueOnce(readiness({
      status: 'production-ready',
      pageAvailability: 'available',
      actionReadiness: 'stable',
      currentStatusText: '`production-ready`',
      canUseAsPrimaryMetric: true,
      canUseAsPrimaryConclusion: true,
      canUseAsStableAction: true,
      requiresDisplayOnlyDegradation: false,
    }))

    render(<V14231PageReadinessBoundary pageKey="Dashboard 项目总览" />)

    await waitFor(() => {
      expect(mocks.fetchV14231PageConsumptionReadiness).toHaveBeenCalledWith('Dashboard 项目总览')
    })
    expect(screen.queryByTestId('v14231-page-readiness-boundary')).not.toBeInTheDocument()
  })

  it('fails closed when readiness cannot be loaded', async () => {
    mocks.fetchV14231PageConsumptionReadiness.mockRejectedValueOnce(new Error('backend down'))

    render(<V14231PageReadinessBoundary pageKey="Future Board" />)

    expect(await screen.findByTestId('v14231-page-readiness-boundary')).toHaveTextContent('not-ready')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('页面暂不可用')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('未能读取 C-13')
    expect(screen.getByTestId('v14231-page-readiness-boundary')).toHaveTextContent('稳定动作')
  })
})
