import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  globalRole: 'member',
  membership: { companyId: 'company-1', role: 'company_admin' as const },
  getProjectCompanyId: vi.fn(),
  getVisibleProjectIds: vi.fn(),
  getDurationAlgorithmAccuracySummary: vi.fn(),
  getDurationAccuracyGovernanceReadModel: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: mocks.globalRole }
    next()
  }),
}))

vi.mock('../auth/access.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/access.js')>('../auth/access.js')
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(() => Promise.resolve(mocks.membership)),
    getProjectCompanyId: mocks.getProjectCompanyId,
    getVisibleProjectIds: mocks.getVisibleProjectIds,
    isCompanyAdminRole: vi.fn((role: string | undefined) => role === 'owner' || role === 'company_admin'),
  }
})

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  getDurationAlgorithmAccuracySummary: mocks.getDurationAlgorithmAccuracySummary,
}))

vi.mock('../services/durationAccuracyGovernanceReadModelService.js', () => ({
  getDurationAccuracyGovernanceReadModel: mocks.getDurationAccuracyGovernanceReadModel,
}))

const { default: router } = await import('../routes/duration-accuracy.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/duration-accuracy', router)
  return app
}

describe('duration accuracy governance route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.globalRole = 'member'
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.getVisibleProjectIds.mockResolvedValue(['project-1', 'project-3'])
    mocks.getDurationAlgorithmAccuracySummary.mockResolvedValue({
      projectId: 'project-1',
      engineCount: 2,
      metrics: [
        {
          engineCode: 'task_remaining_forecast',
          outputKind: 'remaining_duration_forecast',
          metricBasis: 'task_duration_forecasts.forecast_error_days',
          sampleCount: 8,
          maeDays: 1.75,
          biasDays: -0.25,
          status: 'active_candidate',
        },
      ],
    })
    mocks.getDurationAccuracyGovernanceReadModel.mockResolvedValue({
      source: 'duration_accuracy_governance_read_model',
      generatedAt: '2026-07-18T00:00:00.000Z',
      scope: { companyId: 'company-1', projectId: null, projectIds: ['project-1', 'project-3'] },
      samples: [],
      publications: [],
      runtimeCalls: [],
      observations: [],
      sourceStatus: {
        samples: 'available',
        publications: 'available',
        runtimeCalls: 'available',
        observations: 'available',
      },
      sourceErrors: {},
    })
  })

  it('exposes unified duration engine accuracy summaries to company admins', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .query({ projectId: 'project-1', engineCode: 'task_remaining_forecast' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.getDurationAlgorithmAccuracySummary).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: 'project-1',
      engineCode: 'task_remaining_forecast',
    })
    expect(response.body.data.metrics[0]).toMatchObject({
      engineCode: 'task_remaining_forecast',
      metricBasis: 'task_duration_forecasts.forecast_error_days',
      maeDays: 1.75,
    })
  })

  it('preserves negative Step 2 readiness semantics from the service summary', async () => {
    mocks.getDurationAlgorithmAccuracySummary.mockResolvedValue({
      projectId: null,
      projectIds: ['project-1', 'project-3'],
      engineCode: null,
      engineCount: 2,
      generatedAt: '2026-06-26T10:00:00.000Z',
      metrics: [],
      step2Readiness: {
        readyForStep2: false,
        structuralReady: false,
        directionalBiasesCorrected: false,
        classABlockerCount: 1,
        gates: [
          {
            code: 'e2_curve_aware_spi_and_velocity_candidates',
            label: 'E2 curve-aware SPI and velocity candidates',
            status: 'waiting',
            severity: 'DATA',
            evidence: 'Awaiting curve-aware velocity candidate evidence.',
            requiredEngineCodes: ['task_remaining_forecast'],
          },
          {
            code: 'e2_back_heavy_structural_tail_reserve',
            label: 'E2 back-heavy structural tail reserve',
            status: 'blocked',
            severity: 'CLASS_A',
            evidence: 'Back-heavy structural tail reserve evidence is still blocking Step 2.',
            requiredEngineCodes: ['critical_path_cpm'],
          },
        ],
        parameterDataStatus: {
          status: 'data_collection_open',
          minimumBacktestSampleCount: 3,
          enginesWithAccuracySamples: ['task_remaining_forecast'],
          missingSampleEngineCodes: ['critical_path_cpm', 'project_remaining_forecast'],
        },
      },
    })

    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body).not.toHaveProperty('ready')
    expect(response.body).not.toHaveProperty('readyForStep2')
    expect(response.body.data.step2Readiness).toEqual(expect.objectContaining({
      readyForStep2: false,
      structuralReady: false,
      directionalBiasesCorrected: false,
      classABlockerCount: 1,
    }))
    expect(response.body.data.step2Readiness.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'e2_curve_aware_spi_and_velocity_candidates',
        status: 'waiting',
        evidence: 'Awaiting curve-aware velocity candidate evidence.',
      }),
      expect.objectContaining({
        code: 'e2_back_heavy_structural_tail_reserve',
        status: 'blocked',
        severity: 'CLASS_A',
        evidence: 'Back-heavy structural tail reserve evidence is still blocking Step 2.',
      }),
    ]))
    expect(response.body.data.step2Readiness.parameterDataStatus).toEqual({
      status: 'data_collection_open',
      minimumBacktestSampleCount: 3,
      enginesWithAccuracySamples: ['task_remaining_forecast'],
      missingSampleEngineCodes: ['critical_path_cpm', 'project_remaining_forecast'],
    })
  })

  it('blocks non-admin users from duration accuracy diagnostics', async () => {
    mocks.membership = { companyId: 'company-1', role: 'member' as any }

    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('does not trust JWT globalRole when current company membership is not admin', async () => {
    mocks.globalRole = 'company_admin'
    mocks.membership = { companyId: 'company-1', role: 'member' as any }

    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getDurationAlgorithmAccuracySummary).not.toHaveBeenCalled()
  })

  it('blocks company admins from reading another company project accuracy summary', async () => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.getProjectCompanyId.mockResolvedValue('company-2')

    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .query({ projectId: 'project-2' })
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getDurationAlgorithmAccuracySummary).not.toHaveBeenCalled()
  })

  it('fails closed when the requested project company cannot be resolved', async () => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.getProjectCompanyId.mockResolvedValue(null)

    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .query({ projectId: 'missing-project' })
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getDurationAlgorithmAccuracySummary).not.toHaveBeenCalled()
  })

  it('scopes company-level accuracy summaries to visible projects in the current company', async () => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
    mocks.getVisibleProjectIds.mockResolvedValue(['project-1', 'project-3'])

    await request(buildApp())
      .get('/api/admin/duration-accuracy/summary')
      .query({ engineCode: 'critical_path_cpm' })
      .expect(200)

    expect(mocks.getDurationAlgorithmAccuracySummary).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: null,
      projectIds: ['project-1', 'project-3'],
      engineCode: 'critical_path_cpm',
    })
  })

  it('exposes the sanitized governance read model within the current company visible-project scope', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-accuracy/governance-read-model')
      .query({ limit: '12', companyId: 'company-2' })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.getDurationAccuracyGovernanceReadModel).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: null,
      projectIds: ['project-1', 'project-3'],
      limit: 12,
    })
  })

  it('rejects cross-company project access for the governance read model', async () => {
    mocks.getProjectCompanyId.mockResolvedValue('company-2')

    await request(buildApp())
      .get('/api/admin/duration-accuracy/governance-read-model')
      .query({ projectId: 'project-2' })
      .expect(403)

    expect(mocks.getDurationAccuracyGovernanceReadModel).not.toHaveBeenCalled()
  })
})
