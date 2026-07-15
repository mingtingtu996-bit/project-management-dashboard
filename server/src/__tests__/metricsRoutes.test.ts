import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProjectTrendAnalytics: vi.fn(),
  getCompanyTrendAnalytics: vi.fn(),
  getVisibleProjectIds: vi.fn(),
  evaluateV14AssetAdmissionAutomationForTypes: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: mocks.getVisibleProjectIds,
  isCompanyAdminRole: vi.fn((role: string | undefined) => role === 'owner' || role === 'admin'),
}))

vi.mock('../services/metricRegistryService.js', () => {
  const registry = [
    {
      key: 'overall_progress',
      label: 'Overall progress',
      description: 'Project weighted progress',
      dataType: 'percent',
      defaultGranularity: 'week',
      supportedGroupBy: ['none', 'building'],
      nullStrategy: 'zero',
      frontendVisible: true,
      deprecatedAliases: ['progress'],
      rawSourceTable: 'metric_value_snapshots',
    },
    {
      key: 'internal_metric',
      label: 'Internal',
      description: 'Hidden metric',
      dataType: 'number',
      defaultGranularity: 'day',
      supportedGroupBy: ['none'],
      nullStrategy: 'null',
      frontendVisible: false,
      rawSourceTable: 'internal_table',
    },
  ]

  return {
    listMetricRegistry: vi.fn(() => registry),
    getMetricRegistryEntry: vi.fn((key: string) => registry.find((item) => item.key === key) ?? null),
    isRegisteredMetric: vi.fn((key: string) => registry.some((item) => item.key === key)),
  }
})

vi.mock('../services/projectTrendAnalyticsService.js', () => ({
  getProjectTrendAnalytics: mocks.getProjectTrendAnalytics,
  normalizeTrendGranularity: vi.fn((value: string) => (['day', 'week', 'month'].includes(value) ? value : null)),
  normalizeTrendGroupBy: vi.fn((value: string) => (['none', 'building'].includes(value) ? value : null)),
}))

vi.mock('../services/companyTrendAnalyticsService.js', () => ({
  getCompanyTrendAnalytics: mocks.getCompanyTrendAnalytics,
}))

vi.mock('../services/v14AssetAdmissionAutomationService.js', () => ({
  evaluateV14AssetAdmissionAutomationForTypes: mocks.evaluateV14AssetAdmissionAutomationForTypes,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api', router)
  return app
}

describe('metrics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectTrendAnalytics.mockResolvedValue({
      projectId: 'project-1',
      metric: 'overall_progress',
      from: '2026-04-01',
      to: '2026-04-30',
      groupBy: 'building',
      granularity: 'week',
      points: [{ date: '2026-04-01', value: 50, group: 'A' }],
    })
    mocks.getCompanyTrendAnalytics.mockResolvedValue({
      metric: 'overall_progress',
      from: '2026-04-01',
      to: '2026-04-30',
      granularity: 'week',
      points: [],
    })
    mocks.getVisibleProjectIds.mockResolvedValue(null)
    mocks.evaluateV14AssetAdmissionAutomationForTypes.mockReturnValue({
      status: 'pass',
      summary: {
        totalDiscoveredCount: 26,
        registeredCount: 26,
        autoDiscoveredCount: 0,
        reviewRequiredCount: 0,
        blockerCount: 0,
        handRegistrationMissingCount: 0,
        dataAdmissionAssetCount: 0,
        metricAdmissionAssetCount: 25,
        ruleSeedAssetCount: 0,
      },
      blockers: [],
      reviewItems: [],
      assets: [
        {
          assetKey: 'metricRegistryService',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/services/metricRegistryService.ts',
        },
        {
          assetKey: 'projectExecutionSummaryService',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/services/projectExecutionSummaryService.ts',
        },
        {
          assetKey: 'progressCalculation',
          assetType: 'metric_admission_asset',
          sourcePath: 'server/src/utils/progressCalculation.ts',
        },
      ],
      boundaryPolicy: ['auto_discovery_is_the_default_for_new_v14_assets'],
    })
  })

  it('returns frontend-visible business metric registry entries without raw source fields', async () => {
    const { default: router } = await import('../routes/metrics.js')
    const response = await request(buildApp(router)).get('/api/metrics/registry')

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      key: 'overall_progress',
      valueType: 'percent',
      defaultGranularity: 'week',
      supportedGroupBy: ['none', 'building'],
      legacyAliases: ['progress'],
    })
    expect(response.body.data[0]).not.toHaveProperty('rawSourceTable')
  })

  it('serves metric admission automation diagnostics without relying on hand registration failures', async () => {
    const { default: router } = await import('../routes/metrics.js')
    const response = await request(buildApp(router)).get('/api/metrics/admission-automation')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.evaluateV14AssetAdmissionAutomationForTypes).toHaveBeenCalledWith(['metric_admission_asset'])
    expect(response.body.data.summary.handRegistrationMissingCount).toBe(0)
    expect(response.body.data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetKey: 'metricRegistryService', assetType: 'metric_admission_asset' }),
      expect.objectContaining({ assetKey: 'projectExecutionSummaryService', assetType: 'metric_admission_asset' }),
    ]))
  })

  it('serves project metric trend from the project-scoped authority endpoint', async () => {
    const { default: router } = await import('../routes/metrics.js')
    const response = await request(buildApp(router))
      .get('/api/projects/project-1/metrics/trend')
      .query({ metric: 'overall_progress', groupBy: 'building', granularity: 'week' })

    expect(response.status).toBe(200)
    expect(mocks.getProjectTrendAnalytics).toHaveBeenCalledWith('project-1', 'overall_progress', {
      from: undefined,
      to: undefined,
      groupBy: 'building',
      granularity: 'week',
    })
    expect(response.body.data.points).toEqual([{ date: '2026-04-01', value: 50, group: 'A' }])
  })
})
