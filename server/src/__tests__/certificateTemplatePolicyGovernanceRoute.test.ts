import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  membership: { companyId: 'company-1', role: 'company_admin' as 'company_admin' | 'regular' },
}))

vi.mock('../auth/access.js', async () => {
  const actual = await vi.importActual<typeof import('../auth/access.js')>('../auth/access.js')
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(() => Promise.resolve(mocks.membership)),
    isCompanyAdminRole: vi.fn((role: string | undefined) => role === 'owner' || role === 'company_admin'),
  }
})

const { default: router } = await import('../routes/certificate-template-governance.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/certificate-template-governance', router)
  return app
}

describe('certificate template policy governance route', () => {
  beforeEach(() => {
    mocks.membership = { companyId: 'company-1', role: 'company_admin' }
  })

  it('exposes policy update candidates and auto-publish decisions as a backend admin governance report', async () => {
    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/policy-updates/report?asOfDate=2026-09-01')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      reportCode: 'certificate_template_policy_update_governance',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
      asOfDate: '2026-09-01',
    })
    expect(response.body.data.summary.autoPublishCandidateCount).toBeGreaterThan(0)
    expect(response.body.data.summary.autoPublishedUpdateCount).toBeGreaterThan(0)
    expect(response.body.data.candidates[0]).toMatchObject({
      updateStatus: expect.stringMatching(/^auto_publish_/),
    })
    expect(response.body.data.autoPublishPlan).toMatchObject({
      planCode: 'certificate_template_policy_auto_publish_plan',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(response.body.data.autoPublishPlan.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'auto_published',
        }),
      ]),
    )
  })

  it('exposes the latest automatic policy publication run for backend audit', async () => {
    const { publishCertificatePolicyAutoPublishPlan } = await import('../services/certificateTemplatePolicyUpdateService.js')
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })

    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/policy-updates/latest-run')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      runCode: 'certificate_template_policy_auto_publish_run',
      runId: run.runId,
      publicationStatus: 'published',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(response.body.data.appliedAutoPublishedSeedCount).toBe(response.body.data.summary.autoPublishedUpdateCount)
  })

  it('exposes local city override governance as backend admin only', async () => {
    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/local-overrides/report')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      reportCode: 'certificate_template_local_override_governance',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimePreviewPolicy: 'business_preview_consumes_published_overrides_only',
    })
    expect(response.body.data.summary.publishedOverrideCount).toBe(50)
    expect(response.body.data.summary.candidateOverrideCount).toBe(0)
    expect(response.body.data.candidateOverrides).toEqual([])
  })

  it('keeps governed publish review candidates empty after first-batch local overrides are published', async () => {
    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/local-overrides/report')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.summary.localOverridePublishReviewCandidateCount).toBe(0)
    expect(response.body.data.localOverridePublishReviewCandidates).toEqual([])
  })

  it('exposes a blocked promotion plan when no candidate local override remains', async () => {
    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/local-overrides/report')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.localOverridePublishPromotionPlan).toMatchObject({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_promotion_plan_only',
      promotionMode: 'candidate_override_to_published_seed_version_review_request',
      summary: {
        readyForPromotionRequest: false,
        candidateCount: 0,
        plannedPublishedSeedVersionCount: 0,
        approvalRequired: true,
        runtimePreviewWillRemainPublishedOnlyUntilPromotion: true,
      },
      promotionPlan: null,
    })
    expect(response.body.data.localOverridePublishPromotionPlan.blockers).toEqual([
      expect.objectContaining({ code: 'no_ready_local_override_publish_candidates' }),
    ])
    expect(response.body.data.summary.publishedOverrideCount).toBe(50)
  })

  it('returns conflict for local override promotion approval and rejection when no candidates remain', async () => {
    const approved = await request(buildApp())
      .post('/api/admin/certificate-template-governance/local-overrides/promotion-plans/certificate_local_override_governed_publish_promotion_plan/approve')
      .send({ reason: 'reviewed official sources and material depth' })
      .expect(409)

    expect(approved.body.success).toBe(false)
    expect(approved.body.error).toMatchObject({
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
    })

    const rejected = await request(buildApp())
      .post('/api/admin/certificate-template-governance/local-overrides/promotion-plans/certificate_local_override_governed_publish_promotion_plan/reject')
      .send({ reason: 'legal wording needs another review pass' })
      .expect(409)

    expect(rejected.body.success).toBe(false)
    expect(rejected.body.error).toMatchObject({
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
    })
  })

  it('returns conflict for published seed authoring when no candidates remain', async () => {
    const response = await request(buildApp())
      .post('/api/admin/certificate-template-governance/local-overrides/promotion-plans/certificate_local_override_governed_publish_promotion_plan/author-published-seed')
      .send({
        targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
        reason: 'prepare published seed draft for final review',
      })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toMatchObject({
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
    })
  })

  it('returns conflict for manual seed swap readiness when no candidates remain', async () => {
    const response = await request(buildApp())
      .post('/api/admin/certificate-template-governance/local-overrides/promotion-plans/certificate_local_override_governed_publish_promotion_plan/seed-swap-readiness')
      .send({
        targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
        requestedWindow: '2026-06-02 22:00-23:00 Asia/Shanghai',
        reason: 'prepare manual seed swap readiness review',
      })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toMatchObject({
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
    })
  })

  it('returns conflict for manual seed swap audit when no candidates remain', async () => {
    const response = await request(buildApp())
      .post('/api/admin/certificate-template-governance/local-overrides/promotion-plans/certificate_local_override_governed_publish_promotion_plan/seed-swap-audit')
      .send({
        targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
        executionWindow: '2026-06-02 22:00-23:00 Asia/Shanghai',
        postSwapPreviewSmokeStatus: 'passed',
        reason: 'manual seed version swap executed in maintenance window',
      })
      .expect(409)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toMatchObject({
      code: 'NO_LOCAL_OVERRIDE_PROMOTION_CANDIDATES',
    })
  })

  it('does not trust JWT globalRole when current company membership is not admin', async () => {
    mocks.membership = { companyId: 'company-1', role: 'regular' }

    const response = await request(buildApp())
      .get('/api/admin/certificate-template-governance/policy-updates/report')
      .set('Authorization', 'Bearer test-auth-token')
      .expect(403)

    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })
})
