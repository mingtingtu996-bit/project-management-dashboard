import { createHash } from 'node:crypto'

import { executeSQL } from './dbService.js'
import type { AlgorithmAssetLearnableParameterReleaseExecutionQueryExec } from './algorithmAssetLearnableParameterReleaseExecutionService.js'

const DEFAULT_MINIMUM_COHORT_SIZE = 5
const DEFAULT_PUBLICATION_LIMIT = 100

export type AlgorithmInterventionEvaluationOutcome = {
  outcomeId: string
  projectId: string
  companyId: string
  taskId: string | null
  outcomeAt: string
  baselineAbsoluteErrorDays: number | null
  absoluteErrorDays: number | null
  overcompensated: boolean | null
}

export type AlgorithmInterventionEvaluationCandidate = {
  sourcePublicationKey: string
  assetKey: string
  parameterKey: string
  ownerAlgorithm: string | null
  scopeLevel: string
  companyId: string | null
  projectId: string | null
  interventionAt: string
  treatedOutcomes: AlgorithmInterventionEvaluationOutcome[]
  controlOutcomes: AlgorithmInterventionEvaluationOutcome[]
}

export type AlgorithmInterventionEvaluationStatus =
  | 'insufficient_evidence'
  | 'observational_estimate'
  | 'counterfactual_supported'

export type AlgorithmInterventionCausalEstimateStatus =
  | 'not_estimable'
  | 'observational_before_after'
  | 'observational_difference_in_differences'

export type AlgorithmInterventionEvaluation = {
  sourcePublicationKey: string
  assetKey: string
  parameterKey: string
  ownerAlgorithm: string | null
  scopeLevel: string
  companyId: string | null
  projectId: string | null
  interventionAt: string
  evaluationWindowStart: string | null
  evaluationWindowEnd: string | null
  evaluatedAt: string
  status: AlgorithmInterventionEvaluationStatus
  causalEstimateStatus: AlgorithmInterventionCausalEstimateStatus
  treatmentSampleCount: number
  controlSampleCount: number
  treatedBaselineMaeDays: number | null
  treatedPostMaeDays: number | null
  controlBaselineMaeDays: number | null
  controlPostMaeDays: number | null
  counterfactualEffectDays: number | null
  postInterventionErrorRateInflectionDays: number | null
  rollbackReviewRecommended: boolean
  limitations: string[]
  evidence: {
    temporalAnchor: {
      interventionAt: string
      source: 'runtime_publication_timestamp'
    }
    cohortDefinition: {
      treatedPublicationKey: string
      controlPolicy: 'scope_bound_unexposed_accuracy_outcomes'
    }
    treatedOutcomeIds: string[]
    controlOutcomeIds: string[]
  }
  evaluationFingerprint: string
}

export type PersistAlgorithmInterventionEvaluationInput = {
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  evaluation: AlgorithmInterventionEvaluation
}

export type AlgorithmInterventionEvaluationSweepResult = {
  total: number
  persisted: number
  insufficientEvidence: number
  observationalEstimate: number
  counterfactualSupported: number
  rollbackReviewRecommended: number
  failed: number
  evaluationRefs: string[]
}

export type AlgorithmInterventionEvaluationSweepInput = {
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  candidates?: AlgorithmInterventionEvaluationCandidate[] | null
  candidateProvider?: () => Promise<AlgorithmInterventionEvaluationCandidate[]>
  evaluatedAt?: string
}

type UsableOutcome = AlgorithmInterventionEvaluationOutcome & {
  outcomeTimestamp: number
  baselineAbsoluteErrorDays: number
  absoluteErrorDays: number
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeTimestamp(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function finiteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundMetric(value: number | null) {
  return value === null ? null : Number(value.toFixed(4))
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function usableOutcomes(
  outcomes: readonly AlgorithmInterventionEvaluationOutcome[],
  interventionTimestamp: number,
) {
  return outcomes
    .map((outcome): UsableOutcome | null => {
      const outcomeAt = normalizeTimestamp(outcome.outcomeAt)
      const baselineAbsoluteErrorDays = finiteNumber(outcome.baselineAbsoluteErrorDays)
      const absoluteErrorDays = finiteNumber(outcome.absoluteErrorDays)
      if (!outcomeAt || baselineAbsoluteErrorDays === null || absoluteErrorDays === null) return null
      const outcomeTimestamp = Date.parse(outcomeAt)
      if (outcomeTimestamp < interventionTimestamp) return null
      const outcomeId = normalizeText(outcome.outcomeId)
      if (!outcomeId) return null
      return {
        ...outcome,
        outcomeId,
        outcomeAt,
        outcomeTimestamp,
        baselineAbsoluteErrorDays,
        absoluteErrorDays,
      }
    })
    .filter((outcome): outcome is UsableOutcome => outcome !== null)
    .sort((left, right) => left.outcomeTimestamp - right.outcomeTimestamp || left.outcomeId.localeCompare(right.outcomeId))
}

function errorRateInflectionDays(outcomes: readonly UsableOutcome[]) {
  if (outcomes.length < 4) return null
  const midpoint = Math.ceil(outcomes.length / 2)
  const earlyMae = average(outcomes.slice(0, midpoint).map((outcome) => outcome.absoluteErrorDays))
  const lateMae = average(outcomes.slice(midpoint).map((outcome) => outcome.absoluteErrorDays))
  if (earlyMae === null || lateMae === null) return null
  return roundMetric(lateMae - earlyMae)
}

function cohortMetrics(outcomes: readonly UsableOutcome[]) {
  const baselineMae = roundMetric(average(outcomes.map((outcome) => outcome.baselineAbsoluteErrorDays)))
  const postMae = roundMetric(average(outcomes.map((outcome) => outcome.absoluteErrorDays)))
  const improvementDays = baselineMae === null || postMae === null ? null : roundMetric(baselineMae - postMae)
  return {
    baselineMae,
    postMae,
    improvementDays,
    errorRateInflectionDays: errorRateInflectionDays(outcomes),
  }
}

function fingerprintFor(input: {
  sourcePublicationKey: string
  interventionAt: string
  treatedOutcomes: readonly UsableOutcome[]
  controlOutcomes: readonly UsableOutcome[]
}) {
  const stablePayload = JSON.stringify({
    sourcePublicationKey: input.sourcePublicationKey,
    interventionAt: input.interventionAt,
    treatedOutcomes: input.treatedOutcomes.map((outcome) => [
      outcome.outcomeId,
      outcome.outcomeAt,
      outcome.baselineAbsoluteErrorDays,
      outcome.absoluteErrorDays,
    ]),
    controlOutcomes: input.controlOutcomes.map((outcome) => [
      outcome.outcomeId,
      outcome.outcomeAt,
      outcome.baselineAbsoluteErrorDays,
      outcome.absoluteErrorDays,
    ]),
  })
  return createHash('sha256').update(stablePayload).digest('hex')
}

function requiredText(value: unknown, field: string) {
  const normalized = normalizeText(value)
  if (!normalized) throw new Error(`${field}_required`)
  return normalized
}

function emptySweepResult(total = 0): AlgorithmInterventionEvaluationSweepResult {
  return {
    total,
    persisted: 0,
    insufficientEvidence: 0,
    observationalEstimate: 0,
    counterfactualSupported: 0,
    rollbackReviewRecommended: 0,
    failed: 0,
    evaluationRefs: [],
  }
}

export function evaluateAlgorithmInterventionOutcomes(
  input: AlgorithmInterventionEvaluationCandidate,
  options: { evaluatedAt?: string, minimumCohortSize?: number } = {},
): AlgorithmInterventionEvaluation {
  const sourcePublicationKey = requiredText(input.sourcePublicationKey, 'source_publication_key')
  const assetKey = requiredText(input.assetKey, 'asset_key')
  const parameterKey = requiredText(input.parameterKey, 'parameter_key')
  const scopeLevel = requiredText(input.scopeLevel, 'scope_level')
  const interventionAt = normalizeTimestamp(input.interventionAt)
  if (!interventionAt) throw new Error('intervention_at_invalid')
  const evaluatedAt = normalizeTimestamp(options.evaluatedAt) ?? new Date().toISOString()
  const minimumCohortSize = Math.max(1, Math.floor(options.minimumCohortSize ?? DEFAULT_MINIMUM_COHORT_SIZE))
  const interventionTimestamp = Date.parse(interventionAt)
  const treatedOutcomes = usableOutcomes(input.treatedOutcomes, interventionTimestamp)
  const controlOutcomes = usableOutcomes(input.controlOutcomes, interventionTimestamp)
  const treated = cohortMetrics(treatedOutcomes)
  const controls = cohortMetrics(controlOutcomes)
  const limitations = ['observational_evaluation_not_randomized_causal_proof']

  let status: AlgorithmInterventionEvaluationStatus = 'counterfactual_supported'
  let causalEstimateStatus: AlgorithmInterventionCausalEstimateStatus = 'observational_difference_in_differences'
  let counterfactualEffectDays: number | null = null

  if (treatedOutcomes.length < minimumCohortSize) {
    status = 'insufficient_evidence'
    causalEstimateStatus = 'not_estimable'
    limitations.push('treated_cohort_below_minimum')
  } else if (controlOutcomes.length < minimumCohortSize) {
    status = 'observational_estimate'
    causalEstimateStatus = 'observational_before_after'
    limitations.push('matched_control_cohort_below_minimum')
  } else if (treated.improvementDays === null || controls.improvementDays === null) {
    status = 'insufficient_evidence'
    causalEstimateStatus = 'not_estimable'
    limitations.push('baseline_or_post_error_metric_unavailable')
  } else {
    counterfactualEffectDays = roundMetric(treated.improvementDays - controls.improvementDays)
    limitations.push('matched_controls_reduce_but_do_not_eliminate_confounding')
  }

  if (treated.errorRateInflectionDays === null) {
    limitations.push('post_intervention_rate_inflection_insufficient')
  }

  const allOutcomes = [...treatedOutcomes, ...controlOutcomes]
    .sort((left, right) => left.outcomeTimestamp - right.outcomeTimestamp || left.outcomeId.localeCompare(right.outcomeId))
  const evaluationWindowStart = allOutcomes[0]?.outcomeAt ?? null
  const evaluationWindowEnd = allOutcomes.at(-1)?.outcomeAt ?? null
  const rollbackReviewRecommended = counterfactualEffectDays !== null && counterfactualEffectDays < 0
  const evaluationFingerprint = fingerprintFor({
    sourcePublicationKey,
    interventionAt,
    treatedOutcomes,
    controlOutcomes,
  })

  return {
    sourcePublicationKey,
    assetKey,
    parameterKey,
    ownerAlgorithm: normalizeText(input.ownerAlgorithm),
    scopeLevel,
    companyId: normalizeText(input.companyId),
    projectId: normalizeText(input.projectId),
    interventionAt,
    evaluationWindowStart,
    evaluationWindowEnd,
    evaluatedAt,
    status,
    causalEstimateStatus,
    treatmentSampleCount: treatedOutcomes.length,
    controlSampleCount: controlOutcomes.length,
    treatedBaselineMaeDays: treated.baselineMae,
    treatedPostMaeDays: treated.postMae,
    controlBaselineMaeDays: controls.baselineMae,
    controlPostMaeDays: controls.postMae,
    counterfactualEffectDays,
    postInterventionErrorRateInflectionDays: treated.errorRateInflectionDays,
    rollbackReviewRecommended,
    limitations: Array.from(new Set(limitations)),
    evidence: {
      temporalAnchor: {
        interventionAt,
        source: 'runtime_publication_timestamp',
      },
      cohortDefinition: {
        treatedPublicationKey: sourcePublicationKey,
        controlPolicy: 'scope_bound_unexposed_accuracy_outcomes',
      },
      treatedOutcomeIds: treatedOutcomes.map((outcome) => outcome.outcomeId),
      controlOutcomeIds: controlOutcomes.map((outcome) => outcome.outcomeId),
    },
    evaluationFingerprint,
  }
}

export async function persistAlgorithmInterventionEvaluation(
  input: PersistAlgorithmInterventionEvaluationInput,
) {
  const evaluation = input.evaluation
  await input.queryExec(
    `insert into public.algorithm_intervention_evaluations (
      source_publication_key,
      asset_key,
      parameter_key,
      owner_algorithm,
      scope_level,
      company_id,
      project_id,
      intervention_at,
      evaluation_window_start,
      evaluation_window_end,
      evaluation_status,
      causal_estimate_status,
      treatment_sample_count,
      control_sample_count,
      treated_baseline_mae_days,
      treated_post_mae_days,
      control_baseline_mae_days,
      control_post_mae_days,
      counterfactual_effect_days,
      post_intervention_error_rate_inflection_days,
      rollback_review_recommended,
      limitations,
      evidence,
      evaluation_fingerprint,
      evaluated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
    ) on conflict (evaluation_fingerprint) do nothing`,
    [
      evaluation.sourcePublicationKey,
      evaluation.assetKey,
      evaluation.parameterKey,
      evaluation.ownerAlgorithm,
      evaluation.scopeLevel,
      evaluation.companyId,
      evaluation.projectId,
      evaluation.interventionAt,
      evaluation.evaluationWindowStart,
      evaluation.evaluationWindowEnd,
      evaluation.status,
      evaluation.causalEstimateStatus,
      evaluation.treatmentSampleCount,
      evaluation.controlSampleCount,
      evaluation.treatedBaselineMaeDays,
      evaluation.treatedPostMaeDays,
      evaluation.controlBaselineMaeDays,
      evaluation.controlPostMaeDays,
      evaluation.counterfactualEffectDays,
      evaluation.postInterventionErrorRateInflectionDays,
      evaluation.rollbackReviewRecommended,
      evaluation.limitations,
      evaluation.evidence,
      evaluation.evaluationFingerprint,
      evaluation.evaluatedAt,
    ],
  )
  return { persisted: true as const, evaluationRef: evaluation.evaluationFingerprint }
}

type PublicationRow = {
  publication_key?: unknown
  asset_key?: unknown
  parameter_key?: unknown
  owner_algorithm?: unknown
  scope_level?: unknown
  company_id?: unknown
  project_id?: unknown
  published_at?: unknown
}

type OutcomeRow = {
  outcome_id?: unknown
  project_id?: unknown
  company_id?: unknown
  task_id?: unknown
  outcome_at?: unknown
  baseline_absolute_error_days?: unknown
  absolute_error_days?: unknown
  overcompensated?: unknown
}

function outcomeFromRow(row: OutcomeRow): AlgorithmInterventionEvaluationOutcome | null {
  const outcomeId = normalizeText(row.outcome_id)
  const projectId = normalizeText(row.project_id)
  const companyId = normalizeText(row.company_id)
  const outcomeAt = normalizeTimestamp(row.outcome_at)
  if (!outcomeId || !projectId || !companyId || !outcomeAt) return null
  return {
    outcomeId,
    projectId,
    companyId,
    taskId: normalizeText(row.task_id),
    outcomeAt,
    baselineAbsoluteErrorDays: finiteNumber(row.baseline_absolute_error_days),
    absoluteErrorDays: finiteNumber(row.absolute_error_days),
    overcompensated: typeof row.overcompensated === 'boolean' ? row.overcompensated : null,
  }
}

function publicationFromRow(row: PublicationRow): Omit<AlgorithmInterventionEvaluationCandidate, 'treatedOutcomes' | 'controlOutcomes'> | null {
  const sourcePublicationKey = normalizeText(row.publication_key)
  const assetKey = normalizeText(row.asset_key)
  const parameterKey = normalizeText(row.parameter_key)
  const scopeLevel = normalizeText(row.scope_level)
  const interventionAt = normalizeTimestamp(row.published_at)
  if (!sourcePublicationKey || !assetKey || !parameterKey || !scopeLevel || !interventionAt) return null
  return {
    sourcePublicationKey,
    assetKey,
    parameterKey,
    ownerAlgorithm: normalizeText(row.owner_algorithm),
    scopeLevel,
    companyId: normalizeText(row.company_id),
    projectId: normalizeText(row.project_id),
    interventionAt,
  }
}

async function collectTreatedOutcomes(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  publication: Omit<AlgorithmInterventionEvaluationCandidate, 'treatedOutcomes' | 'controlOutcomes'>,
) {
  const rows = await queryExec<OutcomeRow>(
    `select 'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            greatest(accuracy.backtested_at, observation.observed_at)::text as outcome_at,
            accuracy.baseline_absolute_error_days,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.runtime_consumer_observations observation
       join public.projects project
         on project.id::text = observation.observation_context ->> 'projectId'
       join public.duration_algorithm_accuracy_events accuracy
         on accuracy.project_id = project.id
        and accuracy.task_id::text = observation.observation_context ->> 'taskId'
      where observation.publication_key = $1
        and observation.observation_status = 'observed'
        and accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= $2::timestamptz
        and accuracy.baseline_absolute_error_days is not null
        and accuracy.absolute_error_days is not null
      order by outcome_at asc, outcome_id asc
      limit 500`,
    [publication.sourcePublicationKey, publication.interventionAt],
  )
  return rows.map(outcomeFromRow).filter((outcome): outcome is AlgorithmInterventionEvaluationOutcome => outcome !== null)
}

async function collectControlOutcomes(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  publication: Omit<AlgorithmInterventionEvaluationCandidate, 'treatedOutcomes' | 'controlOutcomes'>,
) {
  const rows = await queryExec<OutcomeRow>(
    `with publication as (
       select $1::text as publication_key,
              $2::text as scope_level,
              $3::uuid as company_id,
              $4::uuid as project_id,
              $5::timestamptz as published_at
     )
     select 'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            accuracy.backtested_at::text as outcome_at,
            accuracy.baseline_absolute_error_days,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.duration_algorithm_accuracy_events accuracy
       join public.projects project on project.id = accuracy.project_id
       cross join publication
      where accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= publication.published_at
        and accuracy.baseline_absolute_error_days is not null
        and accuracy.absolute_error_days is not null
        and not exists (
          select 1
            from public.runtime_consumer_observations observation
           where observation.publication_key = publication.publication_key
             and observation.observation_status = 'observed'
             and observation.observation_context ->> 'taskId' = accuracy.task_id::text
        )
        and (
          publication.scope_level = 'system'
          or (
            publication.scope_level = 'company'
            and project.company_id = publication.company_id
          )
          or (
            publication.scope_level = 'project'
            and project.company_id = publication.company_id
            and project.id <> publication.project_id
          )
        )
      order by outcome_at asc, outcome_id asc
      limit 500`,
    [
      publication.sourcePublicationKey,
      publication.scopeLevel,
      publication.companyId,
      publication.projectId,
      publication.interventionAt,
    ],
  )
  return rows.map(outcomeFromRow).filter((outcome): outcome is AlgorithmInterventionEvaluationOutcome => outcome !== null)
}

export async function collectAlgorithmInterventionEvaluationCandidates(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec = executeSQL,
) {
  const rows = await queryExec<PublicationRow>(
    `select publication_key,
            asset_key,
            parameter_key,
            owner_algorithm,
            scope_level,
            company_id,
            project_id,
            published_at
       from public.algorithm_learnable_parameter_runtime_publications
      where publication_status in ('published', 'canary')
        and published_at <= now() - interval '24 hours'
      order by published_at asc
      limit $1`,
    [DEFAULT_PUBLICATION_LIMIT],
  )
  const candidates: AlgorithmInterventionEvaluationCandidate[] = []
  for (const row of rows) {
    const publication = publicationFromRow(row)
    if (!publication) continue
    const [treatedOutcomes, controlOutcomes] = await Promise.all([
      collectTreatedOutcomes(queryExec, publication),
      collectControlOutcomes(queryExec, publication),
    ])
    candidates.push({ ...publication, treatedOutcomes, controlOutcomes })
  }
  return candidates
}

export async function runAlgorithmInterventionEvaluationSweep(
  input: AlgorithmInterventionEvaluationSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const candidates = input.candidates ?? (
    input.candidateProvider
      ? await input.candidateProvider()
      : await collectAlgorithmInterventionEvaluationCandidates(queryExec)
  )
  const result = emptySweepResult(candidates.length)
  for (const candidate of candidates) {
    try {
      const evaluation = evaluateAlgorithmInterventionOutcomes(candidate, { evaluatedAt: input.evaluatedAt })
      await persistAlgorithmInterventionEvaluation({ queryExec, evaluation })
      result.persisted += 1
      if (evaluation.status === 'insufficient_evidence') result.insufficientEvidence += 1
      if (evaluation.status === 'observational_estimate') result.observationalEstimate += 1
      if (evaluation.status === 'counterfactual_supported') result.counterfactualSupported += 1
      if (evaluation.rollbackReviewRecommended) result.rollbackReviewRecommended += 1
      result.evaluationRefs.push(evaluation.evaluationFingerprint)
    } catch {
      result.failed += 1
    }
  }
  return result
}
