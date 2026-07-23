import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const projectId = '22222222-2222-4222-8222-222222222222'
const foreignProjectId = '99999999-9999-4999-8999-999999999999'

const mocks = vi.hoisted(() => ({
  globalRole: 'member',
  membership: { companyId: '11111111-1111-4111-8111-111111111111', role: 'company_admin' as string } as any,
  getVisibleProjectIds: vi.fn(),
  getProjectCompanyId: vi.fn(),
  listDurationAssetReviewItems: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: '33333333-3333-4333-8333-333333333333', globalRole: mocks.globalRole }
    next()
  }),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
}))

vi.mock('../auth/access.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/access.js')>()
  return {
    ...actual,
    getCurrentCompanyMembership: vi.fn(async () => mocks.membership),
    getVisibleProjectIds: mocks.getVisibleProjectIds,
    getProjectCompanyId: mocks.getProjectCompanyId,
  }
})

vi.mock('../services/durationAssetReviewQueueService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/durationAssetReviewQueueService.js')>()
  return {
    ...actual,
    listDurationAssetReviewItems: mocks.listDurationAssetReviewItems,
  }
})

import { errorHandler } from '../middleware/errorHandler.js'

const { default: router } = await import('../routes/duration-assets.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/duration-assets', router)
  app.use(errorHandler)
  return app
}

describe('duration assets admin read route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.globalRole = 'member'
    mocks.membership = {
      companyId: '11111111-1111-4111-8111-111111111111',
      role: 'company_admin',
    }
    mocks.getVisibleProjectIds.mockResolvedValue([projectId])
    mocks.getProjectCompanyId.mockResolvedValue('11111111-1111-4111-8111-111111111111')
    mocks.listDurationAssetReviewItems.mockResolvedValue({
      generatedAt: '2026-07-24T08:00:00.000Z',
      total: 1,
      items: [{
        id: '44444444-4444-4444-8444-444444444444',
        sourceKey: 'shared-review-source',
        decisionFingerprint: 'a'.repeat(64),
        reviewKind: 'candidate_publication',
        assetKey: 'standard_work_duration_seed',
        artifactKey: 'shared-standard-work',
        scope: { level: 'global' },
        proposalKey: null,
        candidateEventRef: null,
        conflictRef: null,
        publicationKey: null,
        resolvedPublicationKey: null,
        reasonCodes: ['manual_review_required'],
        reviewPayload: null,
        status: 'open',
        canReview: false,
        approvalReady: false,
        assignedToUserId: null,
        reviewedByUserId: null,
        reviewedAt: null,
        decisionReason: null,
        resolutionSource: null,
        createdAt: '2026-07-23T00:00:00.000Z',
        updatedAt: '2026-07-23T00:00:00.000Z',
      }],
    })
  })

  it('uses current company membership and server-visible project IDs for queue filters', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-assets/review-items')
      .query({
        assetKey: 'standard_work_duration_seed',
        scope: 'project',
        projectId,
        reason: 'manual_review_required',
        status: 'open',
        age: '7d',
        companyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        visibleProjectIds: foreignProjectId,
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'member',
      '11111111-1111-4111-8111-111111111111',
    )
    expect(mocks.listDurationAssetReviewItems).toHaveBeenCalledWith({
      companyId: '11111111-1111-4111-8111-111111111111',
      projectIds: [projectId],
      assetKey: 'standard_work_duration_seed',
      scopeLevel: 'project',
      projectId,
      reason: 'manual_review_required',
      status: 'open',
      age: '7d',
    })
  })

  it('denies a legacy JWT company_admin when current membership is not admin', async () => {
    mocks.globalRole = 'company_admin'
    mocks.membership = {
      companyId: '11111111-1111-4111-8111-111111111111',
      role: 'member',
    }

    const response = await request(buildApp())
      .get('/api/admin/duration-assets/review-items')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getVisibleProjectIds).not.toHaveBeenCalled()
    expect(mocks.listDurationAssetReviewItems).not.toHaveBeenCalled()
  })

  it('fails closed for projects outside the server-resolved current-company project set', async () => {
    mocks.getVisibleProjectIds.mockResolvedValue([projectId])
    mocks.getProjectCompanyId.mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    const response = await request(buildApp())
      .get('/api/admin/duration-assets/review-items')
      .query({ projectId: foreignProjectId })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN_COMPANY_SCOPE')
    expect(mocks.listDurationAssetReviewItems).not.toHaveBeenCalled()
  })

  it('serializes industry and global rows as read-only without source references or payloads', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-assets/review-items')
      .expect(200)

    expect(response.body.data.items[0]).toMatchObject({
      scope: { level: 'global' },
      canReview: false,
      approvalReady: false,
      proposalKey: null,
      candidateEventRef: null,
      conflictRef: null,
      reviewPayload: null,
    })
    expect(response.body.data.items[0]).not.toHaveProperty('sourceCandidateRefs')
    expect(response.body.data.items[0]).not.toHaveProperty('sourceEvidenceRefs')
  })

  it('validates only the governed queue filter vocabulary', async () => {
    const response = await request(buildApp())
      .get('/api/admin/duration-assets/review-items')
      .query({ scope: 'tenant', age: 'forever' })
      .expect(400)

    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.listDurationAssetReviewItems).not.toHaveBeenCalled()
  })
})
