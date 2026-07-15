import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
}))

const {
  canUseV14231AsPrimaryConclusion,
  canUseV14231AsPrimaryMetric,
  canUseV14231AsStableAction,
  fetchV14231CapabilityReadiness,
  fetchV14231ActionableSurface,
  fetchV14231ActionableSurfaceLedger,
  fetchV14231PageConsumptionReadiness,
  fetchV14231ReadinessLedger,
  mustDegradeV14231ToDisplayOnly,
  normalizeV14231ConsumptionBoundary,
  canUseV14231ActionableSurfaceAsStableAction,
} = await import('../v14231ReadinessApi')

describe('v14231ReadinessApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the machine-readable C-13 readiness ledger with no-store cache', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      sourcePlan: 'v1.4.23.1-A',
      defaultUnregisteredStatus: 'not-ready',
      capabilities: [],
      pages: [],
    })

    await fetchV14231ReadinessLedger()

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/v14231-readiness', {
      cache: 'no-store',
    })
  })

  it('fetches capability and page readiness through encoded API keys', async () => {
    mocks.apiGet.mockResolvedValue({ status: 'not-ready' })

    await fetchV14231CapabilityReadiness('进度录入（冷启动脊柱·日常最小录入）')
    await fetchV14231PageConsumptionReadiness('Gantt / Planning')

    expect(mocks.apiGet).toHaveBeenNthCalledWith(
      1,
      '/api/v14231-readiness/capabilities/%E8%BF%9B%E5%BA%A6%E5%BD%95%E5%85%A5%EF%BC%88%E5%86%B7%E5%90%AF%E5%8A%A8%E8%84%8A%E6%9F%B1%C2%B7%E6%97%A5%E5%B8%B8%E6%9C%80%E5%B0%8F%E5%BD%95%E5%85%A5%EF%BC%89',
      { cache: 'no-store' },
    )
    expect(mocks.apiGet).toHaveBeenNthCalledWith(
      2,
      '/api/v14231-readiness/pages/Gantt%20%2F%20Planning',
      { cache: 'no-store' },
    )
  })

  it('fetches actionable surface ledger and single surface through encoded API keys', async () => {
    mocks.apiGet.mockResolvedValue({ status: 'display-only' })

    await fetchV14231ActionableSurfaceLedger()
    await fetchV14231ActionableSurface('construction organization/runtime apply')

    expect(mocks.apiGet).toHaveBeenNthCalledWith(
      1,
      '/api/v14231-readiness/actionable-surfaces',
      { cache: 'no-store' },
    )
    expect(mocks.apiGet).toHaveBeenNthCalledWith(
      2,
      '/api/v14231-readiness/actionable-surfaces/construction%20organization%2Fruntime%20apply',
      { cache: 'no-store' },
    )
  })

  it('fails closed for unregistered or gated readiness items', () => {
    for (const item of [
      null,
      undefined,
      { status: 'not-ready', canUseAsStableAction: true },
      { status: 'needs-gating', canUseAsPrimaryMetric: true, canUseAsPrimaryConclusion: true },
      { status: 'display-only', canUseAsStableAction: true },
    ]) {
      expect(normalizeV14231ConsumptionBoundary(item)).toEqual({
        canUseAsPrimaryMetric: false,
        canUseAsPrimaryConclusion: false,
        canUseAsStableAction: false,
        requiresDisplayOnlyDegradation: true,
      })
      expect(canUseV14231AsPrimaryMetric(item)).toBe(false)
      expect(canUseV14231AsPrimaryConclusion(item)).toBe(false)
      expect(canUseV14231AsStableAction(item)).toBe(false)
      expect(mustDegradeV14231ToDisplayOnly(item)).toBe(true)
    }
  })

  it('allows primary consumption only for explicit production-ready rows with matching boundary flags', () => {
    const productionReady = {
      status: 'production-ready',
      releaseReadinessStatus: 'needs-gating' as const,
      canUseAsPrimaryMetric: true,
      canUseAsPrimaryConclusion: true,
      canUseAsStableAction: true,
      requiresDisplayOnlyDegradation: false,
    }

    expect(normalizeV14231ConsumptionBoundary(productionReady)).toEqual({
      canUseAsPrimaryMetric: true,
      canUseAsPrimaryConclusion: true,
      canUseAsStableAction: true,
      requiresDisplayOnlyDegradation: false,
    })
    expect(canUseV14231AsPrimaryMetric(productionReady)).toBe(true)
    expect(canUseV14231AsPrimaryConclusion(productionReady)).toBe(true)
    expect(canUseV14231AsStableAction(productionReady)).toBe(true)
  })

  it('does not let a production-ready label bypass missing boundary flags', () => {
    const mislabeled = {
      status: 'production-ready',
      canUseAsPrimaryMetric: false,
      canUseAsPrimaryConclusion: false,
      canUseAsStableAction: false,
      requiresDisplayOnlyDegradation: false,
    }

    expect(canUseV14231AsPrimaryMetric(mislabeled)).toBe(false)
    expect(canUseV14231AsPrimaryConclusion(mislabeled)).toBe(false)
    expect(canUseV14231AsStableAction(mislabeled)).toBe(false)
    expect(mustDegradeV14231ToDisplayOnly(mislabeled)).toBe(true)
  })

  it('fails closed for actionable surfaces unless both status and boundary policy allow stable action', () => {
    const gatedSurfaces: Array<Parameters<typeof canUseV14231ActionableSurfaceAsStableAction>[0]> = [
      null,
      undefined,
      { status: 'display-only', boundaryPolicy: { canUseAsStableAction: true } },
      { status: 'needs-gating', boundaryPolicy: { canUseAsStableAction: true } },
      { status: 'stable_action', boundaryPolicy: { canUseAsStableAction: false } },
      { status: 'stable_action' },
      { status: 'stable_action', boundaryPolicy: { canUseAsStableAction: true } },
      {
        status: 'stable_action',
        boundaryPolicy: {
          canUseAsStableAction: true,
          writesRuntimePublication: true,
          declaresProductionReady: false,
        },
      },
      {
        status: 'stable_action',
        boundaryPolicy: {
          canUseAsStableAction: true,
          writesRuntimePublication: false,
          declaresProductionReady: true,
        },
      },
    ]

    for (const surface of gatedSurfaces) {
      expect(canUseV14231ActionableSurfaceAsStableAction(surface)).toBe(false)
    }

    expect(canUseV14231ActionableSurfaceAsStableAction({
      status: 'stable_action',
      boundaryPolicy: {
        canUseAsStableAction: true,
        writesRuntimePublication: false,
        declaresProductionReady: false,
      },
    })).toBe(true)
  })
})
