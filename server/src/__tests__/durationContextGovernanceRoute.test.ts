import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  membership: { companyId: 'company-1', role: 'company_admin' as const },
}))

vi.mock('../auth/access.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/access.js')>('../auth/access.js')
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(() => Promise.resolve(mocks.membership)),
    isCompanyAdminRole: vi.fn((role: string | undefined) => role === 'owner' || role === 'company_admin'),
  }
})

const { default: router } = await import('../routes/duration-context-governance.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/duration-context-governance', router)
  return app
}

describe('duration context governance route', () => {
  beforeEach(() => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
  })

  it('exposes the backend-only factor governance report to company admins', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-context-governance/report')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      reportCode: 'duration_context_factor_governance',
      frontendExposurePolicy: 'backend_admin_api_only',
    })
    expect(response.body.data.factorConsumptionMatrix.length).toBeGreaterThanOrEqual(14)
    expect(response.body.data.explainPackageContract).toMatchObject({
      version: 'duration_context_explain_v1',
      frontendExposurePolicy: 'backend_admin_api_only',
    })
    expect(response.body.data.runtimePromotionGateways).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceDomain: 'risk_issue_warning' }),
      expect.objectContaining({ sourceDomain: 'change_log' }),
    ]))
    expect(response.body.data.combinationStressMatrix).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        matrixCode: 'duration_context_combination_regression_matrix',
        backendExposurePolicy: 'backend_admin_api_only',
      }),
    }))
    expect(response.body.data.jsonContractValidation).toEqual(expect.objectContaining({
      validator: 'validateDurationContextSummaryContract',
      frontendExposurePolicy: 'backend_admin_api_only',
    }))
  })

  it('blocks non-admin users from backend governance diagnostics', async () => {
    mocks.membership = { companyId: 'company-1', role: 'member' as any }

    const response = await request(buildApp())
      .get('/api/admin/duration-context-governance/report')
      .set('Authorization', 'Bearer test-auth-token')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('does not trust JWT globalRole when current company membership is not admin', async () => {
    mocks.membership = { companyId: 'company-1', role: 'member' as any }

    const response = await request(buildApp())
      .get('/api/admin/duration-context-governance/report')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })
})
