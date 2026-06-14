import {
  evaluateDurationLiveLearningExecutionPlan,
  evaluateDurationLiveLearningManifest,
  evaluateDurationLiveLearningPortfolio,
  listDurationLiveLearningManifests,
  type DurationLiveLearningAssetKey,
  type DurationLiveLearningEvidenceOverride,
  type DurationLiveLearningExecutionPlanEvaluation,
  type DurationLiveLearningManifestEvaluation,
  type DurationLiveLearningPortfolioEvaluation,
  type DurationLiveLearningRolloutBatch,
} from './durationLiveLearningClosureService.js'

export interface DurationLiveLearningCompletionAuditInput {
  evidenceOverrides?: readonly DurationLiveLearningEvidenceOverride[]
  requestedFactRewriteAssetKeys?: readonly DurationLiveLearningAssetKey[]
}

export interface DurationLiveLearningCompletionAudit {
  status: 'duration_live_learning_completion_ready' | 'duration_live_learning_completion_not_ready'
  allowedClaim:
    | 'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked'
    | 'not_ready_for_live_self_learning_claim'
  prohibitedClaim: 'all_duration_assets_are_live_self_learning'
  manifestEvaluations: DurationLiveLearningManifestEvaluation[]
  executionPlan: DurationLiveLearningExecutionPlanEvaluation
  portfolio: DurationLiveLearningPortfolioEvaluation
  learnableAssetKeys: DurationLiveLearningAssetKey[]
  factLockedAssetKeys: DurationLiveLearningAssetKey[]
  blockedAssetKeys: DurationLiveLearningAssetKey[]
  factRewriteBlockedAssetKeys: DurationLiveLearningAssetKey[]
}

const COMPLETION_ROLLOUT_BATCHES: DurationLiveLearningRolloutBatch[] = [
  'duration_prediction_core_a',
  'plan_network_core_b',
]

const FACT_LOCKED_DURATION_ASSET_KEYS: DurationLiveLearningAssetKey[] = [
  'baseline_commitment',
  'monthly_plan_commitment',
  'actual_duration_outcome',
  'progress_snapshot',
]

function buildEvidenceOverrideMap(
  evidenceOverrides: readonly DurationLiveLearningEvidenceOverride[] | undefined,
): Map<DurationLiveLearningAssetKey, DurationLiveLearningEvidenceOverride['evidence']> {
  const map = new Map<DurationLiveLearningAssetKey, DurationLiveLearningEvidenceOverride['evidence']>()
  for (const override of evidenceOverrides ?? []) {
    map.set(override.assetKey, override.evidence)
  }
  return map
}

function uniqueAssetKeys(values: readonly DurationLiveLearningAssetKey[]): DurationLiveLearningAssetKey[] {
  return [...new Set(values)]
}

export function buildDurationLiveLearningCompletionAudit(
  input: DurationLiveLearningCompletionAuditInput = {},
): DurationLiveLearningCompletionAudit {
  const evidenceOverrideMap = buildEvidenceOverrideMap(input.evidenceOverrides)
  const requestedFactRewriteAssetKeys = new Set(input.requestedFactRewriteAssetKeys ?? [])
  const manifestEvaluations = COMPLETION_ROLLOUT_BATCHES.map((batch) =>
    evaluateDurationLiveLearningManifest(batch, input.evidenceOverrides))
  const executionPlan = evaluateDurationLiveLearningExecutionPlan(
    COMPLETION_ROLLOUT_BATCHES,
    input.evidenceOverrides,
  )
  const learnableAssetKeys = COMPLETION_ROLLOUT_BATCHES
    .flatMap((batch) => listDurationLiveLearningManifests(batch).map((manifest) => manifest.assetKey))

  const portfolio = evaluateDurationLiveLearningPortfolio([
    ...learnableAssetKeys.map((assetKey) => ({
      assetKey,
      evidence: evidenceOverrideMap.get(assetKey),
    })),
    ...FACT_LOCKED_DURATION_ASSET_KEYS.map((assetKey) => ({
      assetKey,
      requestedFactRewrite: requestedFactRewriteAssetKeys.has(assetKey),
    })),
  ])
  const blockedAssetKeys = uniqueAssetKeys(
    portfolio.learnableAssets
      .filter((asset) => !asset.allowedLiveLearningClaim)
      .map((asset) => asset.assetKey),
  )
  const factRewriteBlockedAssetKeys = uniqueAssetKeys(
    portfolio.factLockedAssets
      .filter((asset) => asset.blockedReasonCodes.includes('duration_fact_auto_rewrite_blocked'))
      .map((asset) => asset.assetKey),
  )
  const ready = manifestEvaluations.every((manifest) => manifest.status === 'manifest_live_self_learning_ready')
    && executionPlan.status === 'execution_plan_ready'
    && portfolio.status === 'portfolio_live_self_learning_ready'
    && factRewriteBlockedAssetKeys.length === 0

  return {
    status: ready
      ? 'duration_live_learning_completion_ready'
      : 'duration_live_learning_completion_not_ready',
    allowedClaim: ready
      ? 'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked'
      : 'not_ready_for_live_self_learning_claim',
    prohibitedClaim: 'all_duration_assets_are_live_self_learning',
    manifestEvaluations,
    executionPlan,
    portfolio,
    learnableAssetKeys,
    factLockedAssetKeys: FACT_LOCKED_DURATION_ASSET_KEYS,
    blockedAssetKeys,
    factRewriteBlockedAssetKeys,
  }
}
