import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  executeRuleAssetGovernanceWorkbenchOperation: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({ apiGet: mocks.apiGet }))
vi.mock('@/services/ruleAssetGovernanceWorkbenchApi', () => ({
  executeRuleAssetGovernanceWorkbenchOperation: mocks.executeRuleAssetGovernanceWorkbenchOperation,
}))

const {
  decideDurationAssetReviewItem,
  getDurationAccuracyGovernanceReadModel,
  getDurationAccuracySummary,
  getDurationAssetReviewItems,
} = await import('../durationAssetsApi')

describe('durationAssetsApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps governed queue DTOs camelCase and sends exact queue filters without runtime caching', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      generatedAt: '2026-07-23T08:00:00.000Z',
      total: 1,
      items: [{
        id: 'review-1', sourceKey: 'source-1', decisionFingerprint: 'a'.repeat(64),
        reviewKind: 'candidate_publication', assetKey: 'base_duration_benchmark', artifactKey: 'asset-1',
        scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
        proposalKey: null, candidateEventRef: null, conflictRef: null, publicationKey: null,
        resolvedPublicationKey: null, reasonCodes: ['replay_required'], reviewPayload: null,
        status: 'open', canReview: true, approvalReady: true, assignedToUserId: null,
        reviewedByUserId: null, reviewedAt: null, decisionReason: null, resolutionSource: null,
        createdAt: '2026-07-22T08:00:00.000Z', updatedAt: '2026-07-23T08:00:00.000Z',
      }],
    })

    const result = await getDurationAssetReviewItems({
      assetKey: 'base_duration_benchmark', scope: 'project', projectId: 'project-1',
      reason: 'replay_required', status: 'open', age: '7d',
    })

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/admin/duration-assets/review-items?assetKey=base_duration_benchmark&scope=project&projectId=project-1&reason=replay_required&status=open&age=7d',
      { runtimeCache: 'off' },
    )
    expect(result.items[0]).toMatchObject({
      sourceKey: 'source-1', decisionFingerprint: 'a'.repeat(64), canReview: true, approvalReady: true,
      reviewedByUserId: null, decisionReason: null, resolutionSource: null,
    })
  })

  it('delegates review decisions through the governed workbench operation client', async () => {
    const item = {
      id: 'review-1', sourceKey: 'source-1', decisionFingerprint: 'a'.repeat(64),
      reviewKind: 'candidate_publication' as const, assetKey: 'base_duration_benchmark' as const,
      artifactKey: 'asset-1', scope: { level: 'company' as const, companyId: 'company-1' },
      proposalKey: null, candidateEventRef: null, conflictRef: null, publicationKey: null,
      resolvedPublicationKey: null, reasonCodes: [], reviewPayload: null, status: 'open' as const,
      canReview: true, approvalReady: true, assignedToUserId: null, reviewedByUserId: null,
      reviewedAt: null, decisionReason: null, resolutionSource: null,
      createdAt: '2026-07-22T08:00:00.000Z', updatedAt: '2026-07-23T08:00:00.000Z',
    }

    await decideDurationAssetReviewItem(item, 'approve', 'reviewed evidence')

    expect(mocks.executeRuleAssetGovernanceWorkbenchOperation).toHaveBeenCalledWith({
      action: 'duration_asset_review_decision', assetType: 'duration_learning_runtime',
      domainWriterKey: 'duration_asset_review_decision_service', evidenceToken: 'source-1',
      reviewItemId: 'review-1', reviewDecision: 'approve', decisionNotes: 'reviewed evidence',
    })
  })

  it('preserves backend availability metadata for accuracy and governance sources', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({
        generatedAt: '2026-07-23T08:00:00.000Z', dataStatus: 'partial',
        sourceErrors: [{ source: 'duration_algorithm_accuracy_events', code: 'duration_accuracy_metrics_unavailable' }],
        metrics: [{ engineCode: 'critical_path_cpm', sampleCount: 2, status: 'backtested' }],
      })
      .mockResolvedValueOnce({
        generatedAt: '2026-07-23T08:00:00.000Z', samples: [], publications: [], runtimeCalls: [], observations: [],
        sourceStatus: { samples: 'available', publications: 'unavailable', runtimeCalls: 'malformed' },
        sourceErrors: { publications: 'publication_source_unavailable', observations: 'observation_source_unavailable' },
      })
      .mockResolvedValueOnce({ generatedAt: '2026-07-23T08:00:00.000Z', sourceErrors: [], metrics: [] })
      .mockResolvedValueOnce({ generatedAt: '2026-07-23T08:00:00.000Z', dataStatus: 'malformed', sourceErrors: [], metrics: [] })

    await expect(getDurationAccuracySummary()).resolves.toMatchObject({
      dataStatus: 'partial', sourceErrors: [{ source: 'duration_algorithm_accuracy_events', code: 'duration_accuracy_metrics_unavailable' }],
    })
    await expect(getDurationAccuracyGovernanceReadModel()).resolves.toMatchObject({
      sourceStatus: { publications: 'unavailable', runtimeCalls: 'unavailable', observations: 'unavailable' },
      sourceErrors: { publications: 'publication_source_unavailable', observations: 'observation_source_unavailable' },
    })
    await expect(getDurationAccuracySummary()).resolves.toMatchObject({ dataStatus: 'unavailable', sourceErrors: [] })
    await expect(getDurationAccuracySummary()).resolves.toMatchObject({ dataStatus: 'unavailable', sourceErrors: [] })
  })
})
