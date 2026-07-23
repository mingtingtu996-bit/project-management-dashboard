import { withDatabaseTransaction } from '../database.js'
import {
  createDatabaseDurationAssetReviewQueueStore,
  type DurationAssetReviewItem,
  type DurationAssetReviewQueueStore,
  type DurationAssetReviewStatus,
  type DurationAssetReviewTransactionRunner,
} from './durationAssetReviewQueueService.js'
import { hashDurationContextPolicyLearningValue } from './durationContextPolicyLearningCheckpointService.js'
import { promoteDurationBenchmarkRuntimeCanaryAtomically } from './durationLearningAssetAtomicStoreService.js'
import {
  evaluateDurationLearningRuntimeMonitoringCandidate,
  findDurationLearningRuntimeMonitoringCandidateForReview,
  findDurationLearningRuntimeProposalForReview,
  proposalCanEnterManualCanary,
  reviewRequirementForMonitoringCandidate,
  reviewRequirementForProposal,
} from './durationLearningRuntimeLifecycleService.js'
import {
  durationLearningRuntimePublicationScopesMatch,
  executeDurationLearningRuntimePublicationQuery,
  persistDurationLearningRuntimePublication,
  promoteDurationLearningRuntimeCanary,
  recordDurationLearningRuntimeImpact,
  type DurationLearningRuntimePublicationQueryExec,
} from './durationLearningRuntimePublicationService.js'

export type DurationAssetReviewDecision = 'approve' | 'reject' | 'supersede'

export type DurationAssetReviewDecisionAuthority =
  { kind: 'company_admin'; companyId: string; authorizedProjectIds: string[] | null; reviewerUserId: string }

export interface DecideDurationAssetReviewItemInput {
  reviewItemId: string
  decision: DurationAssetReviewDecision
  decisionReason: string
  authority: DurationAssetReviewDecisionAuthority
  queryExec?: DurationLearningRuntimePublicationQueryExec
  queueStore?: DurationAssetReviewQueueStore
  transactionRunner?: DurationAssetReviewTransactionRunner
  persistPublication?: typeof persistDurationLearningRuntimePublication
  recordImpact?: typeof recordDurationLearningRuntimeImpact
  promoteCanary?: typeof promoteDurationLearningRuntimeCanary
  promoteBenchmarkCanary?: typeof promoteDurationBenchmarkRuntimeCanaryAtomically
  findMonitoringCandidate?: typeof findDurationLearningRuntimeMonitoringCandidateForReview
  evaluateMonitoringCandidate?: typeof evaluateDurationLearningRuntimeMonitoringCandidate
  buildMonitoringReviewRequirement?: typeof reviewRequirementForMonitoringCandidate
  observedAt?: string
}

export interface DecideDurationAssetReviewItemResult {
  status: DurationAssetReviewStatus
  reviewItemId: string
  publicationKey: string | null
  idempotent: boolean
  item: DurationAssetReviewItem
}

export class DurationAssetReviewDecisionError extends Error {
  readonly statusCode: number

  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly decisionCause?: unknown,
  ) {
    super(message)
    this.name = 'DurationAssetReviewDecisionError'
    this.statusCode = status
  }
}

const STRUCTURAL_ASSET_KEYS = new Set(['dependency_rule_candidate', 'critical_path_rule_candidate'])
const MAX_DECISION_REASON_LENGTH = 1000

function decisionError(code: string, status: number, message: string): DurationAssetReviewDecisionError {
  return new DurationAssetReviewDecisionError(code, status, message)
}

function isDurationAssetReviewDecisionError(error: unknown): error is DurationAssetReviewDecisionError {
  if (error instanceof DurationAssetReviewDecisionError) return true
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown }
  return typeof candidate.code === 'string'
    && candidate.code.startsWith('DURATION_ASSET_REVIEW_')
    && candidate.status === candidate.statusCode
    && typeof candidate.status === 'number'
}

async function runDecisionPhase<T>(input: {
  work: () => Promise<T>
  code: string
  message: string
}): Promise<T> {
  try {
    return await input.work()
  } catch (error) {
    if (isDurationAssetReviewDecisionError(error)) throw error
    throw new DurationAssetReviewDecisionError(input.code, 409, input.message, error)
  }
}

function normalizeRequiredText(value: unknown, code: string, fieldName: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw decisionError(code, 400, `${fieldName} is required.`)
  return normalized
}

function normalizeDecisionReason(value: unknown) {
  const reason = normalizeRequiredText(
    value,
    'DURATION_ASSET_REVIEW_DECISION_REASON_REQUIRED',
    'Duration asset review decision reason',
  )
  if (reason.length > MAX_DECISION_REASON_LENGTH) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_DECISION_REASON_TOO_LONG',
      400,
      `Duration asset review decision reason must not exceed ${MAX_DECISION_REASON_LENGTH} characters.`,
    )
  }
  return reason
}

function normalizeObservedAt(value: unknown) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return new Date().toISOString()
  const parsed = Date.parse(candidate)
  if (!Number.isFinite(parsed)) {
    throw decisionError('DURATION_ASSET_REVIEW_OBSERVED_AT_INVALID', 400, 'Observed time must be an ISO timestamp.')
  }
  return new Date(parsed).toISOString()
}

function normalizeDecision(value: unknown): DurationAssetReviewDecision {
  const decision = String(value ?? '').trim()
  if (decision === 'approve' || decision === 'reject' || decision === 'supersede') return decision
  throw decisionError('DURATION_ASSET_REVIEW_DECISION_INVALID', 400, 'Duration asset review decision is invalid.')
}

function normalizeAuthority(input: DurationAssetReviewDecisionAuthority) {
  if (input?.kind !== 'company_admin') {
    throw decisionError('DURATION_ASSET_REVIEW_AUTHORITY_REQUIRED', 403, 'Current company administrator authority is required.')
  }
  return {
    kind: 'company_admin' as const,
    companyId: normalizeRequiredText(
      input.companyId,
      'DURATION_ASSET_REVIEW_AUTHORITY_REQUIRED',
      'Current company',
    ),
    authorizedProjectIds: input.authorizedProjectIds === null
      ? null
      : [...new Set((input.authorizedProjectIds ?? []).map((value) => String(value ?? '').trim()).filter(Boolean))],
    reviewerUserId: normalizeRequiredText(
      input.reviewerUserId,
      'DURATION_ASSET_REVIEW_AUTHORITY_REQUIRED',
      'Reviewer user',
    ),
  }
}

function assertItemAuthority(
  item: DurationAssetReviewItem,
  authority: ReturnType<typeof normalizeAuthority>,
) {
  if (item.scope.level === 'industry' || item.scope.level === 'global') {
    throw decisionError(
      'DURATION_ASSET_REVIEW_SHARED_SCOPE_READ_ONLY',
      403,
      'Industry and global duration asset review items are read-only for company administrators.',
    )
  }
  if (item.scope.companyId !== authority.companyId) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_FORBIDDEN_SCOPE',
      403,
      'The duration asset review item is outside the current company.',
    )
  }
  if (
    item.scope.level === 'project'
    && authority.authorizedProjectIds !== null
    && !authority.authorizedProjectIds.includes(item.scope.projectId)
  ) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_FORBIDDEN_SCOPE',
      403,
      'The duration asset review item is outside the server-authorized project set.',
    )
  }
}

function resultFromItem(item: DurationAssetReviewItem, input: { publicationKey?: string | null; idempotent?: boolean } = {}) {
  return {
    status: item.status,
    reviewItemId: item.id,
    publicationKey: input.publicationKey ?? item.resolvedPublicationKey ?? item.publicationKey,
    idempotent: input.idempotent ?? false,
    item,
  } satisfies DecideDurationAssetReviewItemResult
}

function isIdenticalPriorApproval(input: {
  item: DurationAssetReviewItem
  authority: ReturnType<typeof normalizeAuthority>
  decisionReason: string
}) {
  return input.item.status === 'resolved_by_publication'
    && input.item.resolutionSource === 'manual_approval'
    && input.item.reviewedByUserId === input.authority.reviewerUserId
    && input.item.decisionReason === input.decisionReason
    && Boolean(input.item.resolvedPublicationKey)
}

function assertCurrentItemIdentity(input: {
  item: DurationAssetReviewItem
  assetKey: string
  artifactKey: string
  scope: Parameters<typeof durationLearningRuntimePublicationScopesMatch>[0]
  publicationKey?: string | null
}) {
  const matches = input.item.assetKey === input.assetKey
    && input.item.artifactKey === input.artifactKey
    && durationLearningRuntimePublicationScopesMatch(input.item.scope, input.scope)
    && (input.publicationKey === undefined || input.item.publicationKey === input.publicationKey)
  if (!matches) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_STALE',
      409,
      'The current duration asset identity no longer matches the locked review item.',
    )
  }
}

function publicationKeyForProposal(proposal: Awaited<ReturnType<typeof findDurationLearningRuntimeProposalForReview>>) {
  if (!proposal) throw decisionError('DURATION_ASSET_REVIEW_STALE', 409, 'The reviewed proposal is no longer current.')
  const digest = hashDurationContextPolicyLearningValue({
    proposalKey: proposal.proposalKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    runtimePayload: proposal.runtimePayload,
    sourceCandidateRefs: [...new Set(proposal.sourceCandidateRefs)].sort(),
    sourceEvidenceRefs: [...new Set(proposal.sourceEvidenceRefs)].sort(),
  }).slice(0, 32)
  return `duration_learning_runtime:${proposal.assetKey}:${digest}`
}

async function approveCandidate(input: {
  item: DurationAssetReviewItem
  authority: ReturnType<typeof normalizeAuthority>
  decisionReason: string
  observedAt: string
  queryExec: DurationLearningRuntimePublicationQueryExec
  queueStore: DurationAssetReviewQueueStore
  persistPublication: typeof persistDurationLearningRuntimePublication
}) {
  const proposal = await findDurationLearningRuntimeProposalForReview({
    queryExec: input.queryExec,
    sourceKey: input.item.sourceKey,
    reasonCodes: input.item.reasonCodes,
  })
  if (!proposal) {
    throw decisionError('DURATION_ASSET_REVIEW_STALE', 409, 'The reviewed duration asset proposal is no longer current.')
  }
  assertCurrentItemIdentity({
    item: input.item,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
  })
  const requirement = reviewRequirementForProposal(proposal, input.item.reasonCodes)
  if (
    requirement.reviewKind !== 'candidate_publication'
    || requirement.decisionFingerprint !== input.item.decisionFingerprint
  ) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_STALE',
      409,
      'The current proposal fingerprint no longer matches the locked review item.',
    )
  }
  if (!proposalCanEnterManualCanary(proposal)) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY',
      409,
      'The reviewed proposal does not satisfy the hard safety conditions for manual canary publication.',
    )
  }

  const publicationKey = publicationKeyForProposal(proposal)
  const publication = await runDecisionPhase({
    code: 'DURATION_ASSET_REVIEW_PUBLICATION_FAILED',
    message: 'Duration asset candidate publication failed.',
    work: () => input.persistPublication({
      queryExec: input.queryExec,
      publicationKey,
      assetKey: proposal.assetKey,
      artifactKey: proposal.artifactKey,
      scope: proposal.scope,
      stage: 'canary',
      runtimePayload: proposal.runtimePayload,
      sourceCandidateRefs: proposal.sourceCandidateRefs,
      sourceEvidenceRefs: proposal.sourceEvidenceRefs,
      automationDecision: {
        ...(proposal.automationDecision ?? {}),
        sourceAutomationEvidence: proposal.automationEvidence ?? null,
        decision: 'manual_canary',
        reviewItemId: input.item.id,
        reviewerUserId: input.authority.reviewerUserId,
        decisionReason: input.decisionReason,
        proposalKey: proposal.proposalKey,
        sampleCount: proposal.sampleCount,
        projectIds: proposal.projectIds,
        companyIds: proposal.companyIds,
        industryKeys: proposal.industryKeys,
        replayPassed: proposal.replayPassed,
      },
      trafficPercent: proposal.scope.level === 'project' ? 20 : 5,
      monitoringWindowHours: STRUCTURAL_ASSET_KEYS.has(proposal.assetKey) ? 168 : 72,
      publishedAt: input.observedAt,
    }),
  })
  if (publication.status !== 'published') {
    throw decisionError(
      'DURATION_ASSET_REVIEW_PUBLICATION_FAILED',
      409,
      `Duration asset publication was blocked: ${publication.reasons.join(',') || 'unknown reason'}.`,
    )
  }
  const resolution = await runDecisionPhase({
    code: 'DURATION_ASSET_REVIEW_QUEUE_RESOLUTION_FAILED',
    message: 'Duration asset review queue resolution failed.',
    work: () => input.queueStore.resolveByPublication({
      sourceKey: input.item.sourceKey,
      publicationKey: publication.publication.publicationKey,
      reviewedAt: input.observedAt,
      resolutionSource: 'manual_approval',
      reviewerUserId: input.authority.reviewerUserId,
      decisionReason: input.decisionReason,
    }),
  })
  return resultFromItem(resolution.item, {
    publicationKey: publication.publication.publicationKey,
    idempotent: publication.publication.publicationStage === 'canary' && resolution.disposition === 'terminal_reused',
  })
}

async function approveStable(input: {
  item: DurationAssetReviewItem
  authority: ReturnType<typeof normalizeAuthority>
  decisionReason: string
  observedAt: string
  queryExec: DurationLearningRuntimePublicationQueryExec
  queueStore: DurationAssetReviewQueueStore
  recordImpact: typeof recordDurationLearningRuntimeImpact
  promoteCanary: typeof promoteDurationLearningRuntimeCanary
  promoteBenchmarkCanary: typeof promoteDurationBenchmarkRuntimeCanaryAtomically
  findMonitoringCandidate: typeof findDurationLearningRuntimeMonitoringCandidateForReview
  evaluateMonitoringCandidate: typeof evaluateDurationLearningRuntimeMonitoringCandidate
  buildMonitoringReviewRequirement: typeof reviewRequirementForMonitoringCandidate
}) {
  const publicationKey = input.item.publicationKey
  if (!publicationKey) {
    throw decisionError('DURATION_ASSET_REVIEW_STALE', 409, 'The locked stable review item has no publication identity.')
  }
  const candidate = await input.findMonitoringCandidate({
    queryExec: input.queryExec,
    publicationKey,
    observedAt: input.observedAt,
  })
  if (!candidate) {
    throw decisionError('DURATION_ASSET_REVIEW_STALE', 409, 'The reviewed canary publication is no longer current.')
  }
  assertCurrentItemIdentity({
    item: input.item,
    assetKey: candidate.assetKey,
    artifactKey: candidate.artifactKey,
    scope: candidate.scope,
    publicationKey: candidate.publicationKey,
  })
  const monitoring = input.evaluateMonitoringCandidate(candidate)
  if (monitoring.evaluation.status !== 'passed' || !monitoring.stableDecision) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY',
      409,
      'Current monitoring evidence has not passed stable publication readiness.',
    )
  }
  const requirement = input.buildMonitoringReviewRequirement(
    candidate,
    monitoring.evaluation,
    monitoring.stableDecision,
  )
  if (
    requirement.reviewKind !== 'stable_promotion'
    || monitoring.stableDecision.manualReviewRequired !== true
    || requirement.decisionFingerprint !== input.item.decisionFingerprint
  ) {
    throw decisionError(
      'DURATION_ASSET_REVIEW_STALE',
      409,
      'The current monitoring fingerprint no longer matches the locked review item.',
    )
  }

  const impact = await runDecisionPhase({
    code: 'DURATION_ASSET_REVIEW_IMPACT_WRITE_FAILED',
    message: 'Duration asset monitoring impact persistence failed.',
    work: () => input.recordImpact({
      queryExec: input.queryExec,
      publicationKey: candidate.publicationKey,
      monitoringStatus: 'passed',
      metrics: {
        ...monitoring.evaluation.metrics,
        reasonCodes: monitoring.evaluation.reasons,
        stableAutomationDecision: monitoring.stableDecision,
        manualApproval: {
          reviewItemId: input.item.id,
          reviewerUserId: input.authority.reviewerUserId,
          decisionReason: input.decisionReason,
          observedAt: input.observedAt,
        },
      },
      observedAt: input.observedAt,
    }),
  })
  if (impact.status !== 'impact_recorded') {
    throw decisionError(
      'DURATION_ASSET_REVIEW_IMPACT_WRITE_FAILED',
      409,
      `Duration asset monitoring impact could not be recorded: ${impact.reasons.join(',') || 'unknown reason'}.`,
    )
  }

  const promotion = await runDecisionPhase({
    code: 'DURATION_ASSET_REVIEW_PROMOTION_FAILED',
    message: 'Duration asset stable promotion failed.',
    work: () => candidate.assetKey === 'base_duration_benchmark' && candidate.scope.level === 'project'
      ? input.promoteBenchmarkCanary({
          publicationKey: candidate.publicationKey,
          promotedAt: input.observedAt,
        })
      : input.promoteCanary({
          queryExec: input.queryExec,
          publicationKey: candidate.publicationKey,
          promotedAt: input.observedAt,
        }),
  })
  if (promotion.status !== 'stable_promoted' && promotion.status !== 'stable_already_promoted') {
    throw decisionError(
      'DURATION_ASSET_REVIEW_PROMOTION_FAILED',
      409,
      `Duration asset stable promotion was blocked: ${promotion.reasons.join(',') || 'unknown reason'}.`,
    )
  }

  const resolution = await runDecisionPhase({
    code: 'DURATION_ASSET_REVIEW_QUEUE_RESOLUTION_FAILED',
    message: 'Duration asset review queue resolution failed.',
    work: () => input.queueStore.resolveByPublication({
      sourceKey: input.item.sourceKey,
      publicationKey: candidate.publicationKey,
      reviewedAt: input.observedAt,
      resolutionSource: 'manual_approval',
      reviewerUserId: input.authority.reviewerUserId,
      decisionReason: input.decisionReason,
    }),
  })
  return resultFromItem(resolution.item, {
    publicationKey: candidate.publicationKey,
    idempotent: promotion.status === 'stable_already_promoted' || resolution.disposition === 'terminal_reused',
  })
}

export async function decideDurationAssetReviewItem(
  input: DecideDurationAssetReviewItemInput,
): Promise<DecideDurationAssetReviewItemResult> {
  const reviewItemId = normalizeRequiredText(
    input.reviewItemId,
    'DURATION_ASSET_REVIEW_ITEM_ID_REQUIRED',
    'Duration asset review item ID',
  )
  const decision = normalizeDecision(input.decision)
  const decisionReason = normalizeDecisionReason(input.decisionReason)
  const authority = normalizeAuthority(input.authority)
  const observedAt = normalizeObservedAt(input.observedAt)
  const queryExec = input.queryExec ?? executeDurationLearningRuntimePublicationQuery
  const transactionRunner = input.transactionRunner ?? withDatabaseTransaction
  const queueStore = input.queueStore
    ?? createDatabaseDurationAssetReviewQueueStore(queryExec, async (work) => work())
  const persistPublication = input.persistPublication ?? persistDurationLearningRuntimePublication
  const recordImpact = input.recordImpact ?? recordDurationLearningRuntimeImpact
  const promoteCanary = input.promoteCanary ?? promoteDurationLearningRuntimeCanary
  const promoteBenchmarkCanary = input.promoteBenchmarkCanary ?? promoteDurationBenchmarkRuntimeCanaryAtomically
  const findMonitoringCandidate = input.findMonitoringCandidate ?? findDurationLearningRuntimeMonitoringCandidateForReview
  const evaluateMonitoringCandidate = input.evaluateMonitoringCandidate ?? evaluateDurationLearningRuntimeMonitoringCandidate
  const buildMonitoringReviewRequirement = input.buildMonitoringReviewRequirement ?? reviewRequirementForMonitoringCandidate

  return transactionRunner(async () => {
    const item = await queueStore.loadForUpdate(reviewItemId)
    if (!item) {
      throw decisionError('DURATION_ASSET_REVIEW_NOT_FOUND', 404, 'Duration asset review item was not found.')
    }
    assertItemAuthority(item, authority)
    if (item.status !== 'open') {
      if (decision === 'approve' && isIdenticalPriorApproval({ item, authority, decisionReason })) {
        return resultFromItem(item, { idempotent: true })
      }
      throw decisionError(
        'DURATION_ASSET_REVIEW_ALREADY_DECIDED',
        409,
        'Duration asset review item is no longer open.',
      )
    }

    if (decision === 'reject' || decision === 'supersede') {
      const projection = await runDecisionPhase({
        code: 'DURATION_ASSET_REVIEW_QUEUE_DECISION_FAILED',
        message: 'Duration asset review queue decision persistence failed.',
        work: () => queueStore.decide({
          id: item.id,
          status: decision === 'reject' ? 'rejected' : 'superseded',
          reviewerUserId: authority.reviewerUserId,
          reviewedAt: observedAt,
          decisionReason,
          resolutionSource: decision === 'reject' ? 'manual_rejection' : 'manual_supersession',
        }),
      })
      return resultFromItem(projection.item, { idempotent: projection.disposition === 'terminal_reused' })
    }

    if (item.reviewKind === 'candidate_publication') {
      return approveCandidate({
        item,
        authority,
        decisionReason,
        observedAt,
        queryExec,
        queueStore,
        persistPublication,
      })
    }
    if (item.reviewKind === 'stable_promotion') {
      return approveStable({
        item,
        authority,
        decisionReason,
        observedAt,
        queryExec,
        queueStore,
        recordImpact,
        promoteCanary,
        promoteBenchmarkCanary,
        findMonitoringCandidate,
        evaluateMonitoringCandidate,
        buildMonitoringReviewRequirement,
      })
    }
    throw decisionError('DURATION_ASSET_REVIEW_KIND_INVALID', 409, 'Duration asset review kind is not supported.')
  })
}
