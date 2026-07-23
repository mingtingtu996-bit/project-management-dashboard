import { describe, expect, it, vi } from 'vitest'

import {
  DURATION_ASSET_REVIEW_KEYS,
  buildDurationAssetReviewSourceKey,
} from '../services/durationAssetReviewQueueService.js'
import * as lifecycleExports from '../services/durationLearningRuntimeLifecycleService.js'
import type {
  DurationLearningRuntimeCandidateProposal,
  DurationLearningRuntimeLifecycleSweepResult,
  DurationLearningRuntimeMonitoringCandidate,
} from '../services/durationLearningRuntimeLifecycleService.js'
import { createInMemoryDurationContextPolicyLearningCheckpointStore } from '../services/durationContextPolicyLearningCheckpointService.js'

const lifecycleModule = lifecycleExports as Record<string, any>
const runDurationLearningRuntimeLifecycleSweep = lifecycleExports.runDurationLearningRuntimeLifecycleSweep

function proposal(input: {
  assetKey: typeof DURATION_ASSET_REVIEW_KEYS[number]
  conflictCount?: number
  sourceCandidateRefs?: string[]
  sourceEvidenceRefs?: string[]
}): DurationLearningRuntimeCandidateProposal {
  return {
    proposalKey: `proposal:${input.assetKey}`,
    assetKey: input.assetKey,
    artifactKey: `artifact:${input.assetKey}`,
    scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
    runtimePayload: { assetKey: input.assetKey, version: 'candidate-v1' },
    sourceCandidateRefs: input.sourceCandidateRefs ?? [`candidate:${input.assetKey}`],
    sourceEvidenceRefs: input.sourceEvidenceRefs ?? [`evidence:${input.assetKey}`],
    sampleCount: 10,
    projectIds: ['project-1'],
    companyIds: ['company-1'],
    industryKeys: ['general_civil'],
    conflictCount: input.conflictCount ?? 0,
    replayPassed: true,
    blockingReasons: [],
    policyEvaluationRequired: true,
    automationEvidence: { validChangeCount: 10 } as any,
    automationDecision: {
      stage: 'auto_canary',
      autoPromotionAllowed: true,
      manualReviewRequired: false,
      reasonCodes: [],
    },
  }
}

function monitoringCandidate(input: {
  assetKey: typeof DURATION_ASSET_REVIEW_KEYS[number]
  scope?: DurationLearningRuntimeMonitoringCandidate['scope']
  runtimePayload?: Record<string, unknown>
  sourceCandidateRefs?: string[]
  sourceEvidenceRefs?: string[]
}): DurationLearningRuntimeMonitoringCandidate {
  return {
    publicationKey: `publication:${input.assetKey}`,
    assetKey: input.assetKey,
    artifactKey: `artifact:${input.assetKey}`,
    publicationStage: 'canary',
    scope: input.scope ?? { level: 'company', companyId: 'company-1' },
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
    sourceAutomationDecision: {
      observed: {
        conflictCount: 0,
        replayPassed: true,
        validChangeCount: 100,
        distinctTaskCount: 100,
        distinctProjectCount: 20,
        distinctCompanyCount: 2,
        realOutcomeCount: 100,
        replayCaseCount: 100,
        observationWindowDays: 90,
        rollbackReady: true,
        tenantScopeValid: true,
      },
    },
    runtimePayload: input.runtimePayload ?? { assetKey: input.assetKey, version: 'candidate-v1' },
    sourceCandidateRefs: input.sourceCandidateRefs ?? [`candidate:${input.assetKey}`],
    sourceEvidenceRefs: input.sourceEvidenceRefs ?? [`evidence:${input.assetKey}`],
  } as DurationLearningRuntimeMonitoringCandidate
}

function stableDecision(input: { automatic: boolean; retainPreviousStable?: boolean } = { automatic: false }) {
  return {
    targetStage: 'stable',
    stage: input.automatic ? 'auto_stable' : 'manual_review',
    autoPromotionAllowed: input.automatic,
    manualReviewRequired: !input.automatic,
    retainPreviousStable: input.retainPreviousStable ?? false,
    reasonCodes: input.automatic ? [] : ['stable_monitoring_manual_review_required'],
  }
}

function reviewQueueStore(input: {
  events?: string[]
  upsertDisposition?: 'created' | 'reused'
  resolvedCount?: number
} = {}) {
  return {
    upsertOpen: vi.fn(async (request: any) => {
      input.events?.push(`review:upsert:${request.reviewKind}`)
      return { disposition: input.upsertDisposition ?? 'created', item: { sourceKey: 'review-1' } }
    }),
    loadForUpdate: vi.fn(async () => null),
    resolveByPublication: vi.fn(),
    resolveOpenByPublicationIdentity: vi.fn(async () => {
      input.events?.push('review:resolve-open:automatic_publication')
      return input.resolvedCount ?? 1
    }),
    decide: vi.fn(),
    list: vi.fn(),
  }
}

function transactionHarness(events: string[]) {
  return async <T>(work: () => Promise<T>) => {
    events.push('transaction:start')
    try {
      const result = await work()
      events.push('transaction:commit')
      return result
    } catch (error) {
      events.push('transaction:rollback')
      throw error
    }
  }
}

const publicationResult = (input: any) => ({
  status: 'published' as const,
  publication: { publicationKey: input.publicationKey, publicationStage: input.stage },
  reasons: [] as string[],
})

describe('duration learning lifecycle review queue integration', () => {
  it.each(DURATION_ASSET_REVIEW_KEYS)('persists one durable item for %s manual fallback', async (assetKey) => {
    const store = reviewQueueStore()
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal({ assetKey, conflictCount: 1 })],
      monitoringProvider: async () => [],
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
    } as any)

    expect(store.upsertOpen).toHaveBeenCalledTimes(1)
    expect(store.upsertOpen).toHaveBeenCalledWith(expect.objectContaining({
      reviewKind: 'candidate_publication',
      assetKey,
      proposalKey: `proposal:${assetKey}`,
    }))
    expect(result).toMatchObject({ manualFallback: 1, reviewItemsOpened: 1, failed: 0 })
  })

  it.each(DURATION_ASSET_REVIEW_KEYS)('persists stable-promotion review and impact atomically for %s', async (assetKey) => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    const recordImpact = vi.fn(async () => {
      events.push('impact:record')
      return { status: 'impact_recorded', reasons: [] }
    })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate({ assetKey })],
      stableDecisionEvaluator: () => stableDecision(),
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
      recordImpact: recordImpact as any,
    } as any)

    expect(events).toEqual([
      'transaction:start',
      'review:upsert:stable_promotion',
      'impact:record',
      'transaction:commit',
    ])
    expect(result).toMatchObject({ manualFallback: 1, reviewItemsOpened: 1, failed: 0 })
  })

  it.each([
    {
      name: 'insufficient evidence',
      configure: (candidate: DurationLearningRuntimeCandidateProposal) => { candidate.sampleCount = 0 },
      expected: { candidateCollecting: 1, manualFallback: 0 },
      reason: 'candidate_samples_missing',
    },
    {
      name: 'missing policy evaluation',
      configure: (candidate: DurationLearningRuntimeCandidateProposal) => { candidate.policyEvaluationRequired = false },
      expected: { candidateCollecting: 1, manualFallback: 0 },
      reason: 'automation_policy_evaluation_missing',
    },
    {
      name: 'manual policy decision',
      configure: (candidate: DurationLearningRuntimeCandidateProposal) => {
        candidate.automationDecision = {
          stage: 'manual_review',
          autoPromotionAllowed: false,
          manualReviewRequired: true,
          reasonCodes: ['policy_manual_review_required'],
        }
      },
      expected: { candidateCollecting: 0, manualFallback: 1 },
      reason: 'policy_manual_review_required',
    },
  ])('persists $name before lifecycle counters advance', async ({ configure, expected, reason }) => {
    const candidate = proposal({ assetKey: 'base_duration_benchmark' })
    configure(candidate)
    const store = reviewQueueStore()
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [candidate],
      monitoringProvider: async () => [],
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
    } as any)

    expect(store.upsertOpen).toHaveBeenCalledWith(expect.objectContaining({
      reasonCodes: expect.arrayContaining([reason]),
    }))
    expect(result).toMatchObject({ ...expected, reviewItemsOpened: 1, failed: 0 })
  })

  it.each(DURATION_ASSET_REVIEW_KEYS)('persists one durable candidate-collecting item for %s', async (assetKey) => {
    const candidate = proposal({ assetKey })
    candidate.sampleCount = 0
    const store = reviewQueueStore()
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [candidate],
      monitoringProvider: async () => [],
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
    } as any)

    expect(store.upsertOpen).toHaveBeenCalledWith(expect.objectContaining({
      assetKey,
      reviewKind: 'candidate_publication',
      reasonCodes: expect.arrayContaining(['candidate_samples_missing']),
    }))
    expect(result).toMatchObject({ candidateCollecting: 1, reviewItemsOpened: 1, failed: 0 })
  })

  it.each(DURATION_ASSET_REVIEW_KEYS)('persists a blocked %s publication before candidate collecting', async (assetKey) => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    const persistPublication = vi.fn(async () => {
      events.push('publication:blocked')
      return {
        status: 'blocked' as const,
        publication: null,
        reasons: [' project_scope_company_mismatch ', 'payload_contract_invalid', 'payload_contract_invalid'],
      }
    })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal({ assetKey })],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
    } as any)

    expect(events).toEqual([
      'transaction:start',
      'publication:blocked',
      'review:upsert:candidate_publication',
      'transaction:commit',
    ])
    expect(store.upsertOpen).toHaveBeenCalledWith(expect.objectContaining({
      assetKey,
      reasonCodes: ['payload_contract_invalid', 'project_scope_company_mismatch'],
      reviewPayload: expect.objectContaining({
        reasonCodes: ['payload_contract_invalid', 'project_scope_company_mismatch'],
      }),
    }))
    expect(result).toMatchObject({
      candidateCollecting: 1,
      reviewItemsOpened: 1,
      canaryPublished: 0,
      failed: 0,
    })
  })

  it('includes normalized publication-block reasons in the candidate decision fingerprint', async () => {
    const fingerprints: string[] = []
    for (const reason of ['payload_contract_invalid', 'project_scope_company_mismatch']) {
      const store = reviewQueueStore()
      store.upsertOpen.mockImplementationOnce(async (input: any) => {
        fingerprints.push(input.decisionFingerprint)
        return { disposition: 'created', item: { sourceKey: `review:${reason}` } }
      })
      await runDurationLearningRuntimeLifecycleSweep({
        candidateProvider: async () => [proposal({ assetKey: 'base_duration_benchmark' })],
        monitoringProvider: async () => [],
        persistPublication: async () => ({ status: 'blocked', publication: null, reasons: [reason] }),
        reviewQueueStore: store as any,
        transactionRunner: transactionHarness([]),
      } as any)
    }

    expect(fingerprints).toHaveLength(2)
    expect(fingerprints[0]).not.toBe(fingerprints[1])
  })

  it('routes a blocked-publication queue failure before candidate collecting advances', async () => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    store.upsertOpen.mockRejectedValueOnce(new Error('queue unavailable'))
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal({ assetKey: 'critical_path_rule_candidate' })],
      monitoringProvider: async () => [],
      persistPublication: async () => {
        events.push('publication:blocked')
        return { status: 'blocked', publication: null, reasons: ['payload_contract_invalid'] }
      },
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
    } as any)

    expect(events).toEqual(['transaction:start', 'publication:blocked', 'transaction:rollback'])
    expect(result).toMatchObject({ candidateCollecting: 0, reviewItemsOpened: 0, failed: 1 })
    expect(result.failureRefs).toEqual([expect.objectContaining({ phase: 'review_queue' })])
  })

  it('fails the lifecycle attempt when review persistence fails', async () => {
    const store = reviewQueueStore()
    store.upsertOpen.mockRejectedValueOnce(new Error('queue unavailable'))
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal({ assetKey: 'base_duration_benchmark', conflictCount: 1 })],
      monitoringProvider: async () => [],
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
    } as any)

    expect(result.manualFallback).toBe(0)
    expect(result.candidateCollecting).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.failureRefs).toEqual([expect.objectContaining({ phase: 'review_queue' })])
  })

  it('does not count a candidate after a successful read when its queue write fails', async () => {
    const events: string[] = []
    const store = reviewQueueStore()
    store.upsertOpen.mockImplementationOnce(async () => {
      events.push('review:failed')
      throw new Error('queue unavailable')
    })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => {
        events.push('candidate:read')
        return [proposal({ assetKey: 'dependency_rule_candidate', conflictCount: 1 })]
      },
      monitoringProvider: async () => [],
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
    } as any)

    expect(events).toEqual(['candidate:read', 'review:failed'])
    expect(result).toMatchObject({ manualFallback: 0, candidateCollecting: 0, failed: 1 })
  })

  it('keeps candidate fingerprints stable under reordered references and changes them for material evidence', () => {
    expect(lifecycleModule.reviewRequirementForProposal).toBeTypeOf('function')
    if (typeof lifecycleModule.reviewRequirementForProposal !== 'function') return
    const first = proposal({
      assetKey: 'wbs_reference_days',
      conflictCount: 1,
      sourceCandidateRefs: ['candidate:b', 'candidate:a'],
      sourceEvidenceRefs: ['evidence:b', 'evidence:a'],
    })
    const reordered = {
      ...first,
      sourceCandidateRefs: [...first.sourceCandidateRefs].reverse(),
      sourceEvidenceRefs: [...first.sourceEvidenceRefs].reverse(),
    }
    const changed = { ...first, sourceEvidenceRefs: [...first.sourceEvidenceRefs, 'evidence:c'] }

    expect(lifecycleModule.reviewRequirementForProposal(first).decisionFingerprint)
      .toBe(lifecycleModule.reviewRequirementForProposal(reordered).decisionFingerprint)
    expect(lifecycleModule.reviewRequirementForProposal(first).decisionFingerprint)
      .not.toBe(lifecycleModule.reviewRequirementForProposal(changed).decisionFingerprint)
  })

  it('keeps monitoring fingerprints stable under reordered references and changes them for material metrics', () => {
    expect(lifecycleModule.reviewRequirementForMonitoringCandidate).toBeTypeOf('function')
    if (typeof lifecycleModule.reviewRequirementForMonitoringCandidate !== 'function') return
    const candidate = monitoringCandidate({
      assetKey: 'critical_path_rule_candidate',
      sourceCandidateRefs: ['candidate:b', 'candidate:a'],
      sourceEvidenceRefs: ['evidence:b', 'evidence:a'],
    }) as any
    const evaluation = { status: 'passed', reasons: [], metrics: { observedCount: 20, runtimeConflictRate: 0 } }
    const decision = stableDecision()
    const reordered = {
      ...candidate,
      sourceCandidateRefs: [...candidate.sourceCandidateRefs].reverse(),
      sourceEvidenceRefs: [...candidate.sourceEvidenceRefs].reverse(),
    }
    const changedEvaluation = { ...evaluation, metrics: { ...evaluation.metrics, observedCount: 21 } }

    expect(lifecycleModule.reviewRequirementForMonitoringCandidate(candidate, evaluation, decision).decisionFingerprint)
      .toBe(lifecycleModule.reviewRequirementForMonitoringCandidate(reordered, evaluation, decision).decisionFingerprint)
    expect(lifecycleModule.reviewRequirementForMonitoringCandidate(candidate, evaluation, decision).decisionFingerprint)
      .not.toBe(lifecycleModule.reviewRequirementForMonitoringCandidate(candidate, changedEvaluation, decision).decisionFingerprint)
  })

  it('keeps stable-review source identity idempotent after the policy window while preserving material timing states', () => {
    const candidate = monitoringCandidate({ assetKey: 'base_duration_benchmark' })
    const equivalentElapsed = { ...candidate, monitoringElapsedHours: candidate.monitoringElapsedHours + 1 }
    const changedWindow = { ...candidate, monitoringWindowHours: 168, monitoringElapsedHours: 200 }
    const preThreshold = { ...candidate, monitoringElapsedHours: 71 }
    const evaluate = (value: DurationLearningRuntimeMonitoringCandidate) => (
      lifecycleModule.evaluateDurationLearningRuntimeMonitoringCandidate(
        value,
        () => stableDecision(),
      ).evaluation
    )
    const baseEvaluation = evaluate(candidate)
    const equivalentEvaluation = evaluate(equivalentElapsed)
    const windowEvaluation = evaluate(changedWindow)
    const preThresholdEvaluation = evaluate(preThreshold)
    const decision = stableDecision()
    const sourceKey = (
      value: DurationLearningRuntimeMonitoringCandidate,
      evaluation: Record<string, any>,
    ) => {
      const requirement = lifecycleModule.reviewRequirementForMonitoringCandidate(value, evaluation, decision)
      return buildDurationAssetReviewSourceKey({
        reviewKind: requirement.reviewKind,
        assetKey: value.assetKey,
        artifactKey: value.artifactKey,
        proposalKey: null,
        publicationKey: value.publicationKey,
        decisionFingerprint: requirement.decisionFingerprint,
        scope: value.scope,
      })
    }

    expect(baseEvaluation.metrics).toMatchObject({
      monitoringWindowHours: 72,
      monitoringElapsedHours: 96,
    })
    expect(equivalentEvaluation.metrics).toMatchObject({ monitoringElapsedHours: 97 })
    expect(sourceKey(candidate, baseEvaluation)).toBe(sourceKey(equivalentElapsed, equivalentEvaluation))
    expect(sourceKey(candidate, baseEvaluation)).not.toBe(sourceKey(changedWindow, windowEvaluation))
    expect(sourceKey(candidate, baseEvaluation)).not.toBe(sourceKey(preThreshold, preThresholdEvaluation))
  })

  it('keeps default stable policy identity fixed after the monitoring window threshold', () => {
    const at96Hours = monitoringCandidate({ assetKey: 'base_duration_benchmark' })
    const at120Hours = { ...at96Hours, monitoringElapsedHours: 120 }
    const widerWindow = { ...at96Hours, monitoringWindowHours: 168, monitoringElapsedHours: 200 }
    const evaluate = (candidate: DurationLearningRuntimeMonitoringCandidate) => (
      lifecycleModule.evaluateDurationLearningRuntimeMonitoringCandidate(candidate)
    )
    const sourceKey = (
      candidate: DurationLearningRuntimeMonitoringCandidate,
      result: Record<string, any>,
    ) => {
      expect(result.stableDecision).not.toBeNull()
      const requirement = lifecycleModule.reviewRequirementForMonitoringCandidate(
        candidate,
        result.evaluation,
        result.stableDecision,
      )
      return buildDurationAssetReviewSourceKey({
        reviewKind: requirement.reviewKind,
        assetKey: candidate.assetKey,
        artifactKey: candidate.artifactKey,
        proposalKey: null,
        publicationKey: candidate.publicationKey,
        decisionFingerprint: requirement.decisionFingerprint,
        scope: candidate.scope,
      })
    }
    const result96 = evaluate(at96Hours)
    const result120 = evaluate(at120Hours)
    const widerResult = evaluate(widerWindow)

    expect(result96.stableDecision.observed.observationWindowDays).toBe(
      result120.stableDecision.observed.observationWindowDays,
    )
    expect(sourceKey(at96Hours, result96)).toBe(sourceKey(at120Hours, result120))
    expect(sourceKey(at96Hours, result96)).not.toBe(sourceKey(widerWindow, widerResult))
  })

  it('reuses a content checkpoint and resolves a later proposal-lineage review atomically', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const events: string[] = []
    let reviewOpen = false
    const store = reviewQueueStore({ events, resolvedCount: 0 })
    store.upsertOpen.mockImplementation(async (input: any) => {
      events.push(`review:upsert:${input.reviewKind}`)
      reviewOpen = true
      return { disposition: 'created', item: { sourceKey: 'review:checkpoint-reuse' } }
    })
    store.resolveOpenByPublicationIdentity.mockImplementation(async () => {
      events.push('review:resolve-open:automatic_publication')
      if (!reviewOpen) return 0
      reviewOpen = false
      return 1
    })
    const persistPublication = vi.fn(async (input: any) => publicationResult(input))
    const eligible = proposal({ assetKey: 'standard_work_duration_seed' })
    const manual = structuredClone(eligible)
    manual.automationDecision = {
      stage: 'manual_review',
      autoPromotionAllowed: false,
      manualReviewRequired: true,
      reasonCodes: ['policy_manual_review_required'],
    }
    const run = (candidate: DurationLearningRuntimeCandidateProposal, ownerId: string) => (
      runDurationLearningRuntimeLifecycleSweep({
        candidateProvider: async () => [candidate],
        monitoringProvider: async () => [],
        persistPublication: persistPublication as any,
        checkpointStore,
        checkpointOwnerId: ownerId,
        reviewQueueStore: store as any,
        transactionRunner: transactionHarness(events),
      } as any)
    )

    const first = await run(eligible, 'worker-a')
    const opened = await run(manual, 'worker-b')
    events.length = 0
    const reused = await run(eligible, 'worker-c')

    expect(first).toMatchObject({ canaryPublished: 1, candidateCheckpointReused: 0, failed: 0 })
    expect(opened).toMatchObject({ manualFallback: 1, reviewItemsOpened: 1, failed: 0 })
    expect(reused).toMatchObject({
      canaryPublished: 0,
      candidateCheckpointReused: 1,
      reviewItemsResolved: 1,
      failed: 0,
    })
    expect(events).toEqual([
      'transaction:start',
      'review:resolve-open:automatic_publication',
      'transaction:commit',
    ])
    expect(reviewOpen).toBe(false)
    expect(persistPublication).toHaveBeenCalledTimes(1)
  })

  it('exposes required initialized review counters on every lifecycle result', async () => {
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [],
      reviewQueueStore: reviewQueueStore() as any,
      transactionRunner: transactionHarness([]),
    } as any)
    const requiredCounts: Record<'reviewItemsOpened' | 'reviewItemsReused' | 'reviewItemsResolved', number> = {
      reviewItemsOpened: (result as DurationLearningRuntimeLifecycleSweepResult).reviewItemsOpened,
      reviewItemsReused: (result as DurationLearningRuntimeLifecycleSweepResult).reviewItemsReused,
      reviewItemsResolved: (result as DurationLearningRuntimeLifecycleSweepResult).reviewItemsResolved,
    }

    expect(requiredCounts).toEqual({ reviewItemsOpened: 0, reviewItemsReused: 0, reviewItemsResolved: 0 })
  })

  it('reuses an idempotent stable-promotion review item', async () => {
    const store = reviewQueueStore({ upsertDisposition: 'reused' })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate({ assetKey: 'standard_work_duration_seed' })],
      stableDecisionEvaluator: () => stableDecision(),
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness([]),
      recordImpact: async () => ({ status: 'impact_recorded', reasons: [] }),
    } as any)

    expect(result).toMatchObject({ reviewItemsOpened: 0, reviewItemsReused: 1, manualFallback: 1, failed: 0 })
  })

  it('publishes and resolves an older open item in the same transaction without a user ID', async () => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    const persistPublication = vi.fn(async (input: any) => {
      events.push('publication:write')
      return publicationResult(input)
    })
    const candidate = proposal({ assetKey: 'special_work_duration_seed' })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [candidate],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
    } as any)

    expect(events).toEqual([
      'transaction:start',
      'publication:write',
      'review:resolve-open:automatic_publication',
      'transaction:commit',
    ])
    expect(store.resolveOpenByPublicationIdentity).toHaveBeenCalledWith(expect.objectContaining({
      reviewKind: 'candidate_publication',
      proposalKey: candidate.proposalKey,
      resolutionSource: 'automatic_publication',
      reviewerUserId: null,
      decisionReason: 'automatic_candidate_publication',
    }))
    expect(result).toMatchObject({ canaryPublished: 1, reviewItemsResolved: 1, failed: 0 })
  })

  it('promotes a project benchmark with impact, activation, cause segments, and queue resolution in one transaction', async () => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    const candidate = monitoringCandidate({
      assetKey: 'base_duration_benchmark',
      scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
    })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [candidate],
      stableDecisionEvaluator: () => stableDecision({ automatic: true }),
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
      recordImpact: async () => {
        events.push('impact:record')
        return { status: 'impact_recorded', reasons: [] }
      },
      promoteBenchmarkCanary: async () => {
        events.push('benchmark-publication:promote')
        events.push('benchmark-current:activate')
        events.push('benchmark-cause-segments:activate')
        return { status: 'stable_promoted', previousPublicationKey: null, reasons: [] }
      },
    } as any)

    expect(events).toEqual([
      'transaction:start',
      'impact:record',
      'benchmark-publication:promote',
      'benchmark-current:activate',
      'benchmark-cause-segments:activate',
      'review:resolve-open:automatic_publication',
      'transaction:commit',
    ])
    expect(result).toMatchObject({ stablePromoted: 1, reviewItemsResolved: 1, failed: 0 })
  })

  it('rolls back stable promotion when queue resolution fails', async () => {
    const events: string[] = []
    const store = reviewQueueStore({ events })
    store.resolveOpenByPublicationIdentity.mockImplementationOnce(async () => {
      events.push('review:resolve-open:automatic_publication')
      throw new Error('queue unavailable')
    })
    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [monitoringCandidate({
        assetKey: 'base_duration_benchmark',
        scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
      })],
      stableDecisionEvaluator: () => stableDecision({ automatic: true }),
      reviewQueueStore: store as any,
      transactionRunner: transactionHarness(events),
      recordImpact: async () => {
        events.push('impact:record')
        return { status: 'impact_recorded', reasons: [] }
      },
      promoteBenchmarkCanary: async () => {
        events.push('benchmark-publication:promote')
        return { status: 'stable_promoted', previousPublicationKey: null, reasons: [] }
      },
    } as any)

    expect(result).toMatchObject({ stablePromoted: 0, reviewItemsResolved: 0, failed: 1 })
    expect(result.failureRefs).toEqual([expect.objectContaining({ phase: 'review_queue' })])
    expect(events).toContain('transaction:rollback')
    expect(events).not.toContain('transaction:commit')
  })

  it('resolves one exact canary publication for review with one fixed locked query', async () => {
    expect(lifecycleModule.findDurationLearningRuntimeMonitoringCandidateForReview).toBeTypeOf('function')
    if (typeof lifecycleModule.findDurationLearningRuntimeMonitoringCandidateForReview !== 'function') return
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{
        publication_key: 'publication:base_duration_benchmark',
        asset_key: 'base_duration_benchmark',
        artifact_key: 'artifact:base_duration_benchmark',
        publication_stage: 'canary',
        monitoring_status: 'collecting',
        scope_level: 'company',
        company_id: 'company-1',
        project_id: null,
        industry_key: null,
        runtime_payload: { version: 'candidate-v1' },
        source_candidate_refs: ['candidate:base'],
        source_evidence_refs: ['evidence:base'],
        automation_decision: { stage: 'auto_canary' },
        monitoring_window_hours: 72,
        monitoring_elapsed_hours: 96,
        observed_count: 10,
        rejected_observation_count: 0,
        accepted_outcome_count: 0,
        weak_or_rejected_outcome_count: 0,
        accuracy_sample_count: 10,
        mae_before: 8,
        mae_after: 6,
        regression_rate: 0,
      }] as T[]
    }
    const observedAt = '2026-07-24T08:00:00.000Z'
    const candidate = await lifecycleModule.findDurationLearningRuntimeMonitoringCandidateForReview({
      queryExec,
      publicationKey: 'publication:base_duration_benchmark',
      observedAt,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].params).toEqual(['publication:base_duration_benchmark', observedAt])
    expect(calls[0].sql).toContain("publication.publication_stage = 'canary'")
    expect(calls[0].sql).toMatch(/publication\.publication_key = \$1/)
    expect(calls[0].sql).toMatch(/\$2::timestamptz - publication\.monitoring_started_at/)
    expect(calls[0].sql).toContain('publication.runtime_payload')
    expect(calls[0].sql).toContain('publication.source_candidate_refs')
    expect(calls[0].sql).toContain('publication.source_evidence_refs')
    expect(calls[0].sql).toMatch(/for update of publication\s*$/i)
    expect(calls[0].sql).not.toContain('collector_stream_key')
    expect(candidate).toMatchObject({
      publicationKey: 'publication:base_duration_benchmark',
      runtimePayload: { version: 'candidate-v1' },
      sourceCandidateRefs: ['candidate:base'],
      sourceEvidenceRefs: ['evidence:base'],
    })
  })

  it('finds one bounded lifecycle proposal by its deterministic review source key', async () => {
    expect(lifecycleModule.findDurationLearningRuntimeProposalForReview).toBeTypeOf('function')
    if (typeof lifecycleModule.findDurationLearningRuntimeProposalForReview !== 'function') return
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('duration-learning-collector:discover:benchmark:base_duration_benchmark')) {
        return [{ collector_group_key: 'SW-REVIEW:process:all' }] as T[]
      }
      if (sql.includes('duration-learning-collector:history:benchmark:base_duration_benchmark')) {
        return [{
          id: 'benchmark-review-1',
          benchmark_key: 'SW-REVIEW:process:all',
          company_id: 'company-1',
          project_id: 'project-1',
          source_company_id: 'company-1',
          project_company_id: 'company-1',
          business_type: 'general_civil',
          sample_count: 5,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          metadata: {
            task_ids: ['task-1', 'task-2'],
            real_outcome_count: 5,
            replay_case_count: 5,
            observation_window_days: 7,
            mae_before: 4,
            mae_after: 3,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        }] as T[]
      }
      return [] as T[]
    }
    const [candidate] = await lifecycleExports.collectDurationLearningRuntimeCandidateProposals(queryExec)
    expect(candidate).toBeDefined()
    const requirement = lifecycleModule.reviewRequirementForProposal(candidate)
    const sourceKey = buildDurationAssetReviewSourceKey({
      reviewKind: requirement.reviewKind,
      assetKey: candidate.assetKey,
      artifactKey: candidate.artifactKey,
      proposalKey: candidate.proposalKey,
      publicationKey: null,
      decisionFingerprint: requirement.decisionFingerprint,
      scope: candidate.scope,
    })

    await expect(lifecycleModule.findDurationLearningRuntimeProposalForReview({
      queryExec,
      sourceKey,
      reasonCodes: requirement.reasonCodes,
      maxBatches: 1,
    })).resolves.toMatchObject({
      proposalKey: candidate.proposalKey,
      assetKey: 'base_duration_benchmark',
      artifactKey: 'SW-REVIEW:process:all',
      scope: candidate.scope,
    })
  })

  it('reconstructs an auto-eligible blocked-publication proposal only with the locked review reasons', async () => {
    const taskIds = Array.from({ length: 20 }, (_, index) => `task-${index + 1}`)
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes('duration-learning-collector:discover:benchmark:base_duration_benchmark')) {
        return [{ collector_group_key: 'SW-BLOCKED:process:all' }] as T[]
      }
      if (sql.includes('duration-learning-collector:history:benchmark:base_duration_benchmark')) {
        return [{
          id: 'benchmark-blocked-1',
          benchmark_key: 'SW-BLOCKED:process:all',
          collector_group_key: 'SW-BLOCKED:process:all',
          company_id: 'company-1',
          project_id: 'project-1',
          source_company_id: 'company-1',
          project_company_id: 'company-1',
          business_type: 'general_civil',
          sample_count: 20,
          p50_days: 8,
          p75_days: 10,
          p80_days: 11,
          mean_days: 8.5,
          variance: 2.25,
          coefficient_of_variation: 0.176471,
          confidence_level: 'high',
          confidence_score: 88,
          duration_day_basis: 'construction_production_day',
          generated_at: '2026-07-21T00:00:00.000Z',
          source_window_start: '2026-04-22T00:00:00.000Z',
          source_as_of: '2026-07-20T00:00:00.000Z',
          metadata: {
            task_ids: taskIds,
            source_evidence_refs: taskIds.map((taskId) => `tasks:${taskId}:actual_duration`),
            real_outcome_count: 20,
            replay_case_count: 20,
            observation_window_days: 90,
            quality_model: 'numeric_holdout',
            holdout_sample_count: 20,
            mae_before: 8,
            mae_after: 6,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
            calendar_ref: 'cn-work-calendar',
            calendar_version: '2026.07',
            sample_ids: taskIds.map((_, index) => `sample-${index + 1}`),
          },
        }] as T[]
      }
      return [] as T[]
    }
    const [candidate] = await lifecycleExports.collectDurationLearningRuntimeCandidateProposals(queryExec)
    expect(candidate.automationDecision).toMatchObject({ autoPromotionAllowed: true })
    const blockedReasons = ['payload_contract_invalid', 'project_scope_company_mismatch']
    const requirement = lifecycleModule.reviewRequirementForProposal(candidate, blockedReasons)
    const sourceKey = buildDurationAssetReviewSourceKey({
      reviewKind: requirement.reviewKind,
      assetKey: candidate.assetKey,
      artifactKey: candidate.artifactKey,
      proposalKey: candidate.proposalKey,
      publicationKey: null,
      decisionFingerprint: requirement.decisionFingerprint,
      scope: candidate.scope,
    })
    const find = (reasonCodes: string[]) => lifecycleModule.findDurationLearningRuntimeProposalForReview({
      queryExec,
      sourceKey,
      reasonCodes,
      maxBatches: 1,
    })

    await expect(find([...requirement.reasonCodes].reverse())).resolves.toMatchObject({
      proposalKey: candidate.proposalKey,
      automationDecision: expect.objectContaining({ autoPromotionAllowed: true }),
    })
    await expect(find(['payload_contract_invalid'])).resolves.toBeNull()
    await expect(find([...requirement.reasonCodes, 'runtime_publication_not_published'])).resolves.toBeNull()
  })

  it('exports one production monitoring evaluator and a manual-canary safety classifier', () => {
    expect(lifecycleModule.evaluateDurationLearningRuntimeMonitoringCandidate).toBeTypeOf('function')
    expect(lifecycleModule.proposalCanEnterManualCanary).toBeTypeOf('function')
    if (
      typeof lifecycleModule.evaluateDurationLearningRuntimeMonitoringCandidate !== 'function'
      || typeof lifecycleModule.proposalCanEnterManualCanary !== 'function'
    ) return
    const candidate = monitoringCandidate({ assetKey: 'dependency_rule_candidate' })
    const evaluator = vi.fn(() => stableDecision({ automatic: true }))
    const evaluated = lifecycleModule.evaluateDurationLearningRuntimeMonitoringCandidate(candidate, evaluator)
    const manualProposal = proposal({ assetKey: 'dependency_rule_candidate' })
    manualProposal.automationDecision = {
      stage: 'manual_review',
      autoPromotionAllowed: false,
      manualReviewRequired: true,
      reasonCodes: ['manual_review_required'],
    }

    expect(evaluator).toHaveBeenCalledTimes(1)
    expect(evaluated).toMatchObject({ evaluation: { status: 'passed' }, stableDecision: { autoPromotionAllowed: true } })
    expect(lifecycleModule.proposalCanEnterManualCanary(manualProposal)).toBe(true)
    manualProposal.conflictCount = 1
    expect(lifecycleModule.proposalCanEnterManualCanary(manualProposal)).toBe(false)
  })
})
