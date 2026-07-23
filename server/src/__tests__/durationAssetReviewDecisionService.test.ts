import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycleMocks = vi.hoisted(() => ({
  findProposal: vi.fn(),
}))

vi.mock('../services/durationLearningRuntimeLifecycleService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/durationLearningRuntimeLifecycleService.js')>()
  return {
    ...actual,
    findDurationLearningRuntimeProposalForReview: lifecycleMocks.findProposal,
  }
})

import {
  decideDurationAssetReviewItem,
  type DecideDurationAssetReviewItemInput,
} from '../services/durationAssetReviewDecisionService.js'
import {
  reviewRequirementForProposal,
  type DurationLearningRuntimeCandidateProposal,
  type DurationLearningRuntimeMonitoringCandidate,
} from '../services/durationLearningRuntimeLifecycleService.js'
import type {
  DurationAssetReviewItem,
  DurationAssetReviewQueueStore,
} from '../services/durationAssetReviewQueueService.js'

const observedAt = '2026-07-24T08:00:00.000Z'

function candidateProposal(overrides: Partial<DurationLearningRuntimeCandidateProposal> = {}) {
  const proposal: DurationLearningRuntimeCandidateProposal = {
    proposalKey: 'proposal-1',
    assetKey: 'standard_work_duration_seed',
    artifactKey: 'artifact-standard-work',
    scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
    runtimePayload: { version: 'candidate-v1', p50Days: 8 },
    sourceCandidateRefs: ['candidate-1'],
    sourceEvidenceRefs: ['evidence-1'],
    sampleCount: 20,
    projectIds: ['project-1'],
    companyIds: ['company-1'],
    industryKeys: ['general_civil'],
    conflictCount: 0,
    replayPassed: true,
    blockingReasons: [],
    policyEvaluationRequired: true,
    automationEvidence: { validChangeCount: 20 } as any,
    automationDecision: {
      stage: 'manual_review',
      autoPromotionAllowed: false,
      manualReviewRequired: true,
      reasonCodes: ['policy_manual_review_required'],
    },
    ...overrides,
  }
  return proposal
}

function reviewItem(overrides: Partial<DurationAssetReviewItem> = {}): DurationAssetReviewItem {
  const proposal = candidateProposal()
  const requirement = reviewRequirementForProposal(proposal, ['policy_manual_review_required'])
  return {
    id: 'review-1',
    sourceKey: 'source-review-1',
    decisionFingerprint: requirement.decisionFingerprint,
    reviewKind: 'candidate_publication',
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    proposalKey: proposal.proposalKey,
    candidateEventRef: 'candidate-1',
    conflictRef: null,
    publicationKey: null,
    resolvedPublicationKey: null,
    reasonCodes: requirement.reasonCodes,
    reviewPayload: {},
    status: 'open',
    canReview: true,
    approvalReady: true,
    assignedToUserId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    decisionReason: null,
    resolutionSource: null,
    createdAt: observedAt,
    updatedAt: observedAt,
    ...overrides,
  }
}

function monitoringCandidate(overrides: Partial<DurationLearningRuntimeMonitoringCandidate> = {}) {
  return {
    publicationKey: 'publication-1',
    assetKey: 'base_duration_benchmark',
    artifactKey: 'artifact-benchmark',
    publicationStage: 'canary',
    scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
    monitoringWindowHours: 72,
    monitoringElapsedHours: 96,
    observedCount: 20,
    rejectedObservationCount: 0,
    acceptedOutcomeCount: 20,
    weakOrRejectedOutcomeCount: 0,
    accuracySampleCount: 20,
    maeBefore: 8,
    maeAfter: 6,
    regressionRate: 0,
    runtimePayload: { benchmarkId: 'benchmark-1' },
    sourceCandidateRefs: ['candidate-benchmark'],
    sourceEvidenceRefs: ['evidence-benchmark'],
    sourceAutomationDecision: { observed: { conflictCount: 0, replayPassed: true } },
    ...overrides,
  } as DurationLearningRuntimeMonitoringCandidate
}

function publishedResult(input: any) {
  return {
    status: 'published' as const,
    reasons: [] as [],
    publication: {
      publicationKey: input.publicationKey,
      assetKey: input.assetKey,
      artifactKey: input.artifactKey,
      scopeLevel: input.scope.level,
      companyId: input.scope.companyId ?? null,
      projectId: input.scope.projectId ?? null,
      industryKey: input.scope.industryKey ?? null,
      publicationStage: input.stage,
      runtimePayload: input.runtimePayload,
      sourceCandidateRefs: input.sourceCandidateRefs,
      sourceEvidenceRefs: input.sourceEvidenceRefs,
      automationDecision: input.automationDecision ?? {},
      previousPublicationKey: null,
      trafficPercent: input.trafficPercent ?? 20,
      monitoringWindowHours: input.monitoringWindowHours ?? 72,
      monitoringStatus: 'pending' as const,
      publishedAt: input.publishedAt,
    },
  }
}

describe('duration asset review decision service', () => {
  let queueStore: DurationAssetReviewQueueStore
  let persistPublication: ReturnType<typeof vi.fn>
  let recordImpact: ReturnType<typeof vi.fn>
  let promoteCanary: ReturnType<typeof vi.fn>
  let promoteBenchmarkCanary: ReturnType<typeof vi.fn>
  let findMonitoringCandidate: ReturnType<typeof vi.fn>
  let evaluateMonitoringCandidate: ReturnType<typeof vi.fn>
  let buildMonitoringReviewRequirement: ReturnType<typeof vi.fn>
  let approveInput: DecideDurationAssetReviewItemInput

  beforeEach(() => {
    vi.clearAllMocks()
    const item = reviewItem()
    lifecycleMocks.findProposal.mockResolvedValue(candidateProposal())
    queueStore = {
      upsertOpen: vi.fn(),
      loadForUpdate: vi.fn(async () => item),
      resolveByPublication: vi.fn(async (input: any) => ({
        disposition: 'resolved' as const,
        item: reviewItem({
          status: 'resolved_by_publication',
          resolvedPublicationKey: input.publicationKey,
          resolutionSource: 'manual_approval',
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: input.reviewedAt,
          decisionReason: input.decisionReason,
        }),
      })),
      resolveOpenByPublicationIdentity: vi.fn(),
      decide: vi.fn(async (input: any) => ({
        disposition: 'decided' as const,
        item: reviewItem({
          status: input.status,
          resolutionSource: input.resolutionSource,
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: input.reviewedAt,
          decisionReason: input.decisionReason,
        }),
      })),
      list: vi.fn(),
    }
    persistPublication = vi.fn(async (input: any) => publishedResult(input))
    recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    promoteCanary = vi.fn(async () => ({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] }))
    promoteBenchmarkCanary = vi.fn(async () => ({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] }))
    findMonitoringCandidate = vi.fn(async () => monitoringCandidate())
    evaluateMonitoringCandidate = vi.fn(() => ({
      evaluation: { status: 'passed', reasons: [], metrics: { observedCount: 20 } },
      stableDecision: {
        targetStage: 'stable',
        stage: 'exception_review',
        autoPromotionAllowed: false,
        manualReviewRequired: true,
        retainPreviousStable: true,
        reasonCodes: ['structural_mutation_requires_exception_review'],
      },
    }))
    buildMonitoringReviewRequirement = vi.fn(() => ({
      reviewKind: 'stable_promotion',
      reasonCodes: ['structural_mutation_requires_exception_review'],
      decisionFingerprint: 'a'.repeat(64),
    }))
    approveInput = {
      reviewItemId: 'review-1',
      decision: 'approve',
      decisionReason: 'validated by governed reviewer',
      authority: {
        kind: 'company_admin',
        companyId: 'company-1',
        authorizedProjectIds: ['project-1'],
        reviewerUserId: 'user-1',
      },
      queryExec: vi.fn(async () => []),
      queueStore,
      transactionRunner: async (work) => work(),
      persistPublication: persistPublication as any,
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
      promoteBenchmarkCanary: promoteBenchmarkCanary as any,
      findMonitoringCandidate: findMonitoringCandidate as any,
      evaluateMonitoringCandidate: evaluateMonitoringCandidate as any,
      buildMonitoringReviewRequirement: buildMonitoringReviewRequirement as any,
      observedAt,
    }
  })

  it('approves a hard-safe candidate through the existing publication writer', async () => {
    const result = await decideDurationAssetReviewItem(approveInput)

    expect(lifecycleMocks.findProposal).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'source-review-1',
      reasonCodes: reviewItem().reasonCodes,
    }))
    expect(persistPublication).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'canary',
      automationDecision: expect.objectContaining({ decision: 'manual_canary', reviewItemId: 'review-1' }),
    }))
    expect(queueStore.resolveByPublication).toHaveBeenCalledWith(expect.objectContaining({
      resolutionSource: 'manual_approval',
      reviewerUserId: 'user-1',
      decisionReason: 'validated by governed reviewer',
    }))
    expect(result.status).toBe('resolved_by_publication')
  })

  it('keeps insufficient-evidence and conflict items open when approval is not hard-safe', async () => {
    const unsafe = candidateProposal({ conflictCount: 1 })
    const requirement = reviewRequirementForProposal(unsafe, ['candidate_conflict_detected'])
    lifecycleMocks.findProposal.mockResolvedValueOnce(unsafe)
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      decisionFingerprint: requirement.decisionFingerprint,
      reasonCodes: requirement.reasonCodes,
      conflictRef: 'conflict-1',
    }))

    await expect(decideDurationAssetReviewItem(approveInput))
      .rejects.toMatchObject({ code: 'DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY', status: 409 })
    expect(persistPublication).not.toHaveBeenCalled()
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it('denies a company admin mutation of global and industry items', async () => {
    for (const scope of [{ level: 'global' as const }, { level: 'industry' as const, industryKey: 'general_civil' }]) {
      vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({ scope }))
      await expect(decideDurationAssetReviewItem(approveInput))
        .rejects.toMatchObject({ code: 'DURATION_ASSET_REVIEW_SHARED_SCOPE_READ_ONLY', status: 403 })
    }

    expect(persistPublication).not.toHaveBeenCalled()
    expect(queueStore.decide).not.toHaveBeenCalled()
  })

  it('uses the atomic writer for project benchmark stable approval', async () => {
    const transactionEvents: string[] = []
    const stableItem = reviewItem({
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'artifact-benchmark',
      proposalKey: null,
      publicationKey: 'publication-1',
      decisionFingerprint: 'a'.repeat(64),
      reasonCodes: ['structural_mutation_requires_exception_review'],
    })
    vi.mocked(queueStore.loadForUpdate).mockImplementationOnce(async () => {
      transactionEvents.push('review:lock')
      return stableItem
    })
    findMonitoringCandidate.mockImplementationOnce(async () => {
      transactionEvents.push('monitoring:lock-and-read')
      return monitoringCandidate()
    })
    recordImpact.mockImplementationOnce(async () => {
      transactionEvents.push('impact:record:passed')
      return { status: 'impact_recorded', reasons: [] }
    })
    promoteBenchmarkCanary.mockImplementationOnce(async () => {
      transactionEvents.push('benchmark:promote-and-activate-causes')
      return { status: 'stable_promoted', previousPublicationKey: null, reasons: [] }
    })
    vi.mocked(queueStore.resolveByPublication).mockImplementationOnce(async () => {
      transactionEvents.push('review:resolve:manual_approval')
      return { disposition: 'resolved', item: reviewItem({ status: 'resolved_by_publication' }) }
    })

    await decideDurationAssetReviewItem({
      ...approveInput,
      transactionRunner: async (work) => {
        transactionEvents.push('transaction:start')
        const result = await work()
        transactionEvents.push('transaction:commit')
        return result
      },
    })

    expect(findMonitoringCandidate).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: stableItem.publicationKey,
    }))
    expect(recordImpact).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: stableItem.publicationKey,
      monitoringStatus: 'passed',
      metrics: expect.objectContaining({
        manualApproval: expect.objectContaining({ reviewItemId: stableItem.id }),
      }),
    }))
    expect(promoteBenchmarkCanary).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: stableItem.publicationKey,
    }))
    expect(promoteCanary).not.toHaveBeenCalled()
    expect(transactionEvents).toEqual([
      'transaction:start',
      'review:lock',
      'monitoring:lock-and-read',
      'impact:record:passed',
      'benchmark:promote-and-activate-causes',
      'review:resolve:manual_approval',
      'transaction:commit',
    ])
  })

  it('rejects stale stable approval before impact or promotion', async () => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'artifact-benchmark',
      proposalKey: null,
      publicationKey: 'publication-1',
      decisionFingerprint: 'b'.repeat(64),
    }))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_STALE',
      status: 409,
    })
    expect(recordImpact).not.toHaveBeenCalled()
    expect(promoteBenchmarkCanary).not.toHaveBeenCalled()
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it.each([
    ['approved', null],
    ['resolved_by_publication', null],
  ] as const)('does not treat %s without a resolved publication key as completed approval', async (status, resolvedPublicationKey) => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'artifact-benchmark',
      proposalKey: null,
      publicationKey: 'publication-1',
      resolvedPublicationKey,
      status,
      resolutionSource: 'manual_approval',
      reviewedByUserId: 'user-1',
      decisionReason: 'validated by governed reviewer',
      reviewedAt: observedAt,
    }))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_ALREADY_DECIDED',
      status: 409,
    })
    expect(findMonitoringCandidate).not.toHaveBeenCalled()
    expect(recordImpact).not.toHaveBeenCalled()
    expect(promoteBenchmarkCanary).not.toHaveBeenCalled()
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it('maps thrown candidate publication failures to a stable domain conflict', async () => {
    persistPublication.mockRejectedValueOnce(new Error('publication database unavailable'))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_PUBLICATION_FAILED',
      status: 409,
      statusCode: 409,
    })
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it('maps thrown stable impact failures to a stable domain conflict', async () => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'artifact-benchmark',
      proposalKey: null,
      publicationKey: 'publication-1',
      decisionFingerprint: 'a'.repeat(64),
    }))
    recordImpact.mockRejectedValueOnce(new Error('impact update failed'))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_IMPACT_WRITE_FAILED',
      status: 409,
      statusCode: 409,
    })
    expect(promoteBenchmarkCanary).not.toHaveBeenCalled()
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it('maps thrown stable promotion failures to a stable domain conflict', async () => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'artifact-benchmark',
      proposalKey: null,
      publicationKey: 'publication-1',
      decisionFingerprint: 'a'.repeat(64),
    }))
    promoteBenchmarkCanary.mockRejectedValueOnce(new Error('atomic promotion failed'))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_PROMOTION_FAILED',
      status: 409,
      statusCode: 409,
    })
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })

  it('maps thrown final queue resolution failures to a stable domain conflict', async () => {
    vi.mocked(queueStore.resolveByPublication).mockRejectedValueOnce(new Error('queue update failed'))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_QUEUE_RESOLUTION_FAILED',
      status: 409,
      statusCode: 409,
    })
  })

  it('preserves an existing duration review domain error thrown by a delegated writer', async () => {
    const existing = Object.assign(new Error('current fingerprint changed'), {
      code: 'DURATION_ASSET_REVIEW_STALE',
      status: 409,
      statusCode: 409,
    })
    persistPublication.mockRejectedValueOnce(existing)

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toBe(existing)
  })

  it.each([
    ['reject', 'rejected', 'manual_rejection'],
    ['supersede', 'superseded', 'manual_supersession'],
  ] as const)('keeps %s as a queue-only decision', async (decision, status, resolutionSource) => {
    const result = await decideDurationAssetReviewItem({ ...approveInput, decision })

    expect(queueStore.decide).toHaveBeenCalledWith(expect.objectContaining({ status, resolutionSource }))
    expect(persistPublication).not.toHaveBeenCalled()
    expect(recordImpact).not.toHaveBeenCalled()
    expect(result.status).toBe(status)
  })

  it('denies project review items outside the server-authorized project list', async () => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      scope: { level: 'project', companyId: 'company-1', projectId: 'project-2' },
    }))

    await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_FORBIDDEN_SCOPE',
      status: 403,
    })
    expect(queueStore.decide).not.toHaveBeenCalled()
  })

  it('returns an identical prior manual approval idempotently', async () => {
    vi.mocked(queueStore.loadForUpdate).mockResolvedValueOnce(reviewItem({
      status: 'resolved_by_publication',
      resolvedPublicationKey: 'publication-existing',
      resolutionSource: 'manual_approval',
      reviewedByUserId: 'user-1',
      decisionReason: 'validated by governed reviewer',
      reviewedAt: observedAt,
    }))

    const result = await decideDurationAssetReviewItem(approveInput)

    expect(result).toMatchObject({ status: 'resolved_by_publication', publicationKey: 'publication-existing', idempotent: true })
    expect(persistPublication).not.toHaveBeenCalled()
    expect(queueStore.resolveByPublication).not.toHaveBeenCalled()
  })
})
