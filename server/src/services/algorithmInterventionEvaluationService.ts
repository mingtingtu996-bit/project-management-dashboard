import { createHash } from 'node:crypto'

import {
  executeAlgorithmAssetLearnableParameterRuntimeRollback,
  type AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
} from './algorithmAssetLearnableParameterReleaseExecutionService.js'
import { executeSQL } from './dbService.js'

const DEFAULT_MINIMUM_COHORT_SIZE = 5
const DEFAULT_MAXIMUM_OUTCOME_AGE_DAYS = 7
const DEFAULT_PRE_PERIOD_DAYS = 30
const DEFAULT_PUBLICATION_LIMIT = 100
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000
const PROXY_METRIC = 'duration_forecast_absolute_error_days'

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

export type AlgorithmInterventionControlCohortDefinition = {
  policy: 'scope_bound_unexposed_accuracy_outcomes'
  exclusions: string[]
}

export type AlgorithmInterventionEvaluationCandidate = {
  sourcePublicationKey: string
  assetKey: string
  parameterKey: string
  ownerAlgorithm: string | null
  scopeLevel: string
  companyId: string | null
  projectId: string | null
  rollbackTarget: string | null
  interventionAt: string
  proxyMetric: string
  observationStartedAt: string
  prePeriodStart: string
  prePeriodEnd: string
  postPeriodStart: string
  postPeriodEnd: string
  controlCohortDefinition: AlgorithmInterventionControlCohortDefinition
  treatedPreOutcomes: AlgorithmInterventionEvaluationOutcome[]
  treatedPostOutcomes: AlgorithmInterventionEvaluationOutcome[]
  controlPreOutcomes: AlgorithmInterventionEvaluationOutcome[]
  controlPostOutcomes: AlgorithmInterventionEvaluationOutcome[]
  /** One-release compatibility only. These fields are never used as causal pre-period evidence. */
  treatedOutcomes?: AlgorithmInterventionEvaluationOutcome[]
  controlOutcomes?: AlgorithmInterventionEvaluationOutcome[]
}

export type AlgorithmInterventionDecision =
  | 'insufficient_data'
  | 'no_detectable_effect'
  | 'benefit_detected'
  | 'harm_detected'
  | 'confounded'

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
  rollbackTarget: string | null
  monitorReference: string
  proxyMetric: string
  observationStartedAt: string
  interventionAt: string
  prePeriodStart: string
  prePeriodEnd: string
  postPeriodStart: string
  postPeriodEnd: string
  evaluationWindowStart: string | null
  evaluationWindowEnd: string | null
  evaluatedAt: string
  decision: AlgorithmInterventionDecision
  status: AlgorithmInterventionEvaluationStatus
  causalEstimateStatus: AlgorithmInterventionCausalEstimateStatus
  treatedPreSampleCount: number
  treatedPostSampleCount: number
  controlPreSampleCount: number
  controlPostSampleCount: number
  treatmentSampleCount: number
  controlSampleCount: number
  treatedBaselineMaeDays: number | null
  treatedPostMaeDays: number | null
  controlBaselineMaeDays: number | null
  controlPostMaeDays: number | null
  counterfactualEffectDays: number | null
  counterfactualEffectCi95LowerDays: number | null
  counterfactualEffectCi95UpperDays: number | null
  postInterventionErrorRateInflectionDays: number | null
  dataFreshnessStatus: 'fresh' | 'stale' | 'unavailable'
  sampleSufficiencyStatus: 'sufficient' | 'insufficient'
  rollbackReviewRecommended: boolean
  limitations: string[]
  evidence: {
    temporalAnchor: {
      interventionAt: string
      observationStartedAt: string
      proxyMetric: string
      source: 'runtime_publication_timestamp'
    }
    periods: {
      pre: { start: string, end: string }
      post: { start: string, end: string }
    }
    cohortDefinition: {
      treatedPublicationKey: string
      controlPolicy: 'scope_bound_unexposed_accuracy_outcomes'
      exclusions: string[]
    }
    freshness: {
      status: 'fresh' | 'stale' | 'unavailable'
      latestOutcomeAt: string | null
      treatedLatestOutcomeAt: string | null
      controlLatestOutcomeAt: string | null
      maximumOutcomeAgeDays: number
    }
    sampleSufficiency: {
      status: 'sufficient' | 'insufficient'
      minimumPerCohort: number
    }
    treatedPreOutcomeIds: string[]
    treatedPostOutcomeIds: string[]
    controlPreOutcomeIds: string[]
    controlPostOutcomeIds: string[]
    monitorReference: string
    rollbackTarget: string | null
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
  insufficientData?: number
  noDetectableEffect?: number
  benefitDetected?: number
  harmDetected?: number
  confounded?: number
  rollbackExecuted?: number
  rollbackBlocked?: number
  failed: number
  evaluationRefs: string[]
}

export type AlgorithmInterventionEvaluationSweepInput = {
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  candidates?: AlgorithmInterventionEvaluationCandidate[] | null
  candidateProvider?: () => Promise<AlgorithmInterventionEvaluationCandidate[]>
  evaluatedAt?: string
  rollbackExecutor?: typeof executeAlgorithmAssetLearnableParameterRuntimeRollback
}

type UsableOutcome = AlgorithmInterventionEvaluationOutcome & {
  outcomeTimestamp: number
  absoluteErrorDays: number
}

type CohortMetrics = {
  mean: number | null
  variance: number | null
  errorRateInflectionDays: number | null
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

function finiteNonNegativeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function roundMetric(value: number | null) {
  return value === null ? null : Number(value.toFixed(4))
}

function average(values: readonly number[]) {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function sampleVariance(values: readonly number[]) {
  if (values.length === 0) return null
  if (values.length === 1) return 0
  const mean = average(values)
  if (mean === null) return null
  return values.reduce((total, value) => total + ((value - mean) ** 2), 0) / (values.length - 1)
}

function requiredText(value: unknown, field: string) {
  const normalized = normalizeText(value)
  if (!normalized) throw new Error(`${field}_required`)
  return normalized
}

function requiredTimestamp(value: unknown, field: string) {
  const normalized = normalizeTimestamp(value)
  if (!normalized) throw new Error(`${field}_invalid`)
  return normalized
}

function windowedOutcomes(
  outcomes: readonly AlgorithmInterventionEvaluationOutcome[],
  windowStart: string,
  windowEnd: string,
) {
  const startTimestamp = Date.parse(windowStart)
  const endTimestamp = Date.parse(windowEnd)
  return outcomes
    .map((outcome): UsableOutcome | null => {
      const outcomeAt = normalizeTimestamp(outcome.outcomeAt)
      const absoluteErrorDays = finiteNonNegativeNumber(outcome.absoluteErrorDays)
      const outcomeId = normalizeText(outcome.outcomeId)
      const projectId = normalizeText(outcome.projectId)
      const companyId = normalizeText(outcome.companyId)
      if (!outcomeAt || absoluteErrorDays === null || !outcomeId || !projectId || !companyId) return null
      const outcomeTimestamp = Date.parse(outcomeAt)
      if (outcomeTimestamp < startTimestamp || outcomeTimestamp > endTimestamp) return null
      return {
        ...outcome,
        outcomeId,
        projectId,
        companyId,
        taskId: normalizeText(outcome.taskId),
        outcomeAt,
        outcomeTimestamp,
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

function cohortMetrics(outcomes: readonly UsableOutcome[]): CohortMetrics {
  const values = outcomes.map((outcome) => outcome.absoluteErrorDays)
  return {
    mean: roundMetric(average(values)),
    variance: sampleVariance(values),
    errorRateInflectionDays: errorRateInflectionDays(outcomes),
  }
}

function differenceInDifferences(input: {
  treatedPre: CohortMetrics
  treatedPost: CohortMetrics
  controlPre: CohortMetrics
  controlPost: CohortMetrics
  treatedPreCount: number
  treatedPostCount: number
  controlPreCount: number
  controlPostCount: number
}) {
  const means = [input.treatedPre.mean, input.treatedPost.mean, input.controlPre.mean, input.controlPost.mean]
  const variances = [input.treatedPre.variance, input.treatedPost.variance, input.controlPre.variance, input.controlPost.variance]
  if (means.some((value) => value === null) || variances.some((value) => value === null)) return null
  const effect = (means[0]! - means[1]!) - (means[2]! - means[3]!)
  const standardError = Math.sqrt(
    (variances[0]! / input.treatedPreCount)
    + (variances[1]! / input.treatedPostCount)
    + (variances[2]! / input.controlPreCount)
    + (variances[3]! / input.controlPostCount),
  )
  return {
    effect: roundMetric(effect)!,
    ci95Lower: roundMetric(effect - (1.96 * standardError))!,
    ci95Upper: roundMetric(effect + (1.96 * standardError))!,
  }
}

function cohortOverlapsTreatment(
  treated: readonly UsableOutcome[],
  controls: readonly UsableOutcome[],
) {
  const treatedOutcomeIds = new Set(treated.map((outcome) => outcome.outcomeId))
  const treatedProjectIds = new Set(treated.map((outcome) => outcome.projectId))
  return controls.some((outcome) => (
    treatedOutcomeIds.has(outcome.outcomeId)
    || treatedProjectIds.has(outcome.projectId)
  ))
}

function fingerprintFor(input: {
  sourcePublicationKey: string
  interventionAt: string
  proxyMetric: string
  rollbackTarget: string | null
  decision: AlgorithmInterventionDecision
  dataFreshnessStatus: AlgorithmInterventionEvaluation['dataFreshnessStatus']
  controlCohortDefinition: AlgorithmInterventionControlCohortDefinition
  cohorts: readonly (readonly UsableOutcome[])[]
}) {
  const stablePayload = JSON.stringify({
    sourcePublicationKey: input.sourcePublicationKey,
    interventionAt: input.interventionAt,
    proxyMetric: input.proxyMetric,
    rollbackTarget: input.rollbackTarget,
    decision: input.decision,
    dataFreshnessStatus: input.dataFreshnessStatus,
    controlCohortDefinition: input.controlCohortDefinition,
    cohorts: input.cohorts.map((outcomes) => outcomes.map((outcome) => [
      outcome.outcomeId,
      outcome.projectId,
      outcome.outcomeAt,
      outcome.absoluteErrorDays,
    ])),
  })
  return createHash('sha256').update(stablePayload).digest('hex')
}

type CompleteAlgorithmInterventionEvaluationSweepResult = AlgorithmInterventionEvaluationSweepResult & Required<Pick<
  AlgorithmInterventionEvaluationSweepResult,
  | 'insufficientData'
  | 'noDetectableEffect'
  | 'benefitDetected'
  | 'harmDetected'
  | 'confounded'
  | 'rollbackExecuted'
  | 'rollbackBlocked'
>>

function emptySweepResult(total = 0): CompleteAlgorithmInterventionEvaluationSweepResult {
  return {
    total,
    persisted: 0,
    insufficientEvidence: 0,
    observationalEstimate: 0,
    counterfactualSupported: 0,
    rollbackReviewRecommended: 0,
    insufficientData: 0,
    noDetectableEffect: 0,
    benefitDetected: 0,
    harmDetected: 0,
    confounded: 0,
    rollbackExecuted: 0,
    rollbackBlocked: 0,
    failed: 0,
    evaluationRefs: [],
  }
}

export function evaluateAlgorithmInterventionOutcomes(
  input: AlgorithmInterventionEvaluationCandidate,
  options: {
    evaluatedAt?: string
    minimumCohortSize?: number
    maximumOutcomeAgeDays?: number
  } = {},
): AlgorithmInterventionEvaluation {
  const sourcePublicationKey = requiredText(input.sourcePublicationKey, 'source_publication_key')
  const assetKey = requiredText(input.assetKey, 'asset_key')
  const parameterKey = requiredText(input.parameterKey, 'parameter_key')
  const scopeLevel = requiredText(input.scopeLevel, 'scope_level')
  const proxyMetric = requiredText(input.proxyMetric, 'proxy_metric')
  const interventionAt = requiredTimestamp(input.interventionAt, 'intervention_at')
  const observationStartedAt = requiredTimestamp(input.observationStartedAt, 'observation_started_at')
  const prePeriodStart = requiredTimestamp(input.prePeriodStart, 'pre_period_start')
  const prePeriodEnd = requiredTimestamp(input.prePeriodEnd, 'pre_period_end')
  const postPeriodStart = requiredTimestamp(input.postPeriodStart, 'post_period_start')
  const postPeriodEnd = requiredTimestamp(input.postPeriodEnd, 'post_period_end')
  const evaluatedAt = normalizeTimestamp(options.evaluatedAt) ?? new Date().toISOString()
  const minimumCohortSize = Math.max(1, Math.floor(options.minimumCohortSize ?? DEFAULT_MINIMUM_COHORT_SIZE))
  const maximumOutcomeAgeDays = Math.max(1, Math.floor(options.maximumOutcomeAgeDays ?? DEFAULT_MAXIMUM_OUTCOME_AGE_DAYS))

  const treatedPreOutcomes = windowedOutcomes(input.treatedPreOutcomes, prePeriodStart, prePeriodEnd)
  const treatedPostOutcomes = windowedOutcomes(input.treatedPostOutcomes, postPeriodStart, postPeriodEnd)
  const controlPreOutcomes = windowedOutcomes(input.controlPreOutcomes, prePeriodStart, prePeriodEnd)
  const controlPostOutcomes = windowedOutcomes(input.controlPostOutcomes, postPeriodStart, postPeriodEnd)
  const treatedPre = cohortMetrics(treatedPreOutcomes)
  const treatedPost = cohortMetrics(treatedPostOutcomes)
  const controlPre = cohortMetrics(controlPreOutcomes)
  const controlPost = cohortMetrics(controlPostOutcomes)
  const limitations = ['observational_evaluation_not_randomized_causal_proof']

  const windowValid = (
    Date.parse(prePeriodStart) <= Date.parse(prePeriodEnd)
    && Date.parse(prePeriodEnd) < Date.parse(interventionAt)
    && Date.parse(postPeriodStart) >= Date.parse(interventionAt)
    && Date.parse(observationStartedAt) === Date.parse(postPeriodStart)
    && Date.parse(postPeriodStart) <= Date.parse(postPeriodEnd)
    && Date.parse(postPeriodEnd) <= Date.parse(evaluatedAt)
  )
  if (!windowValid) limitations.push('causal_period_definition_invalid')

  const counts = {
    treatedPre: treatedPreOutcomes.length,
    treatedPost: treatedPostOutcomes.length,
    controlPre: controlPreOutcomes.length,
    controlPost: controlPostOutcomes.length,
  }
  const belowMinimum = [
    ['treated_pre', counts.treatedPre],
    ['treated_post', counts.treatedPost],
    ['control_pre', counts.controlPre],
    ['control_post', counts.controlPost],
  ] as const
  for (const [cohortName, count] of belowMinimum) {
    if (count < minimumCohortSize) limitations.push(`${cohortName}_cohort_below_minimum`)
  }
  const sampleSufficiencyStatus = belowMinimum.every(([, count]) => count >= minimumCohortSize)
    ? 'sufficient'
    : 'insufficient'

  const postOutcomes = [...treatedPostOutcomes, ...controlPostOutcomes]
    .sort((left, right) => left.outcomeTimestamp - right.outcomeTimestamp || left.outcomeId.localeCompare(right.outcomeId))
  const latestOutcomeAt = postOutcomes.at(-1)?.outcomeAt ?? null
  const treatedLatestOutcomeAt = treatedPostOutcomes.at(-1)?.outcomeAt ?? null
  const controlLatestOutcomeAt = controlPostOutcomes.at(-1)?.outcomeAt ?? null
  const treatedOutcomeAgeDays = treatedLatestOutcomeAt
    ? (Date.parse(evaluatedAt) - Date.parse(treatedLatestOutcomeAt)) / MILLISECONDS_PER_DAY
    : null
  const controlOutcomeAgeDays = controlLatestOutcomeAt
    ? (Date.parse(evaluatedAt) - Date.parse(controlLatestOutcomeAt)) / MILLISECONDS_PER_DAY
    : null
  const dataFreshnessStatus: AlgorithmInterventionEvaluation['dataFreshnessStatus'] = (
    treatedOutcomeAgeDays === null || controlOutcomeAgeDays === null
  )
    ? 'unavailable'
    : (
        treatedOutcomeAgeDays < 0
        || treatedOutcomeAgeDays > maximumOutcomeAgeDays
        || controlOutcomeAgeDays < 0
        || controlOutcomeAgeDays > maximumOutcomeAgeDays
      )
      ? 'stale'
      : 'fresh'
  if (dataFreshnessStatus !== 'fresh') limitations.push(`outcome_evidence_${dataFreshnessStatus}`)
  if (treatedOutcomeAgeDays === null) limitations.push('treated_post_evidence_unavailable')
  else if (treatedOutcomeAgeDays < 0 || treatedOutcomeAgeDays > maximumOutcomeAgeDays) limitations.push('treated_post_evidence_stale')
  if (controlOutcomeAgeDays === null) limitations.push('control_post_evidence_unavailable')
  else if (controlOutcomeAgeDays < 0 || controlOutcomeAgeDays > maximumOutcomeAgeDays) limitations.push('control_post_evidence_stale')

  const controlDefinitionValid = (
    input.controlCohortDefinition?.policy === 'scope_bound_unexposed_accuracy_outcomes'
    && Array.isArray(input.controlCohortDefinition.exclusions)
    && input.controlCohortDefinition.exclusions.some((exclusion) => Boolean(normalizeText(exclusion)))
  )
  if (!controlDefinitionValid) limitations.push('control_cohort_definition_unavailable')
  const cohortContaminated = cohortOverlapsTreatment(
    [...treatedPreOutcomes, ...treatedPostOutcomes],
    [...controlPreOutcomes, ...controlPostOutcomes],
  )
  if (cohortContaminated) limitations.push('control_cohort_overlaps_treatment')

  let decision: AlgorithmInterventionDecision = 'insufficient_data'
  let counterfactualEffectDays: number | null = null
  let counterfactualEffectCi95LowerDays: number | null = null
  let counterfactualEffectCi95UpperDays: number | null = null

  if (
    windowValid
    && controlDefinitionValid
    && sampleSufficiencyStatus === 'sufficient'
    && dataFreshnessStatus === 'fresh'
  ) {
    if (cohortContaminated) {
      decision = 'confounded'
    } else {
      const estimate = differenceInDifferences({
        treatedPre,
        treatedPost,
        controlPre,
        controlPost,
        treatedPreCount: counts.treatedPre,
        treatedPostCount: counts.treatedPost,
        controlPreCount: counts.controlPre,
        controlPostCount: counts.controlPost,
      })
      if (estimate) {
        counterfactualEffectDays = estimate.effect
        counterfactualEffectCi95LowerDays = estimate.ci95Lower
        counterfactualEffectCi95UpperDays = estimate.ci95Upper
        decision = estimate.ci95Lower > 0
          ? 'benefit_detected'
          : estimate.ci95Upper < 0
            ? 'harm_detected'
            : 'no_detectable_effect'
        limitations.push('matched_controls_reduce_but_do_not_eliminate_confounding')
      } else {
        limitations.push('counterfactual_estimate_unavailable')
      }
    }
  }

  const status: AlgorithmInterventionEvaluationStatus = decision === 'insufficient_data'
    ? 'insufficient_evidence'
    : decision === 'confounded'
      ? 'observational_estimate'
      : 'counterfactual_supported'
  const causalEstimateStatus: AlgorithmInterventionCausalEstimateStatus = decision === 'insufficient_data'
    ? 'not_estimable'
    : decision === 'confounded'
      ? 'observational_before_after'
      : 'observational_difference_in_differences'

  const allOutcomes = [
    ...treatedPreOutcomes,
    ...treatedPostOutcomes,
    ...controlPreOutcomes,
    ...controlPostOutcomes,
  ].sort((left, right) => left.outcomeTimestamp - right.outcomeTimestamp || left.outcomeId.localeCompare(right.outcomeId))
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const monitorReference = `algorithm-intervention-monitor:${sourcePublicationKey}`
  const rollbackReviewRecommended = decision === 'harm_detected'
  const controlCohortDefinition: AlgorithmInterventionControlCohortDefinition = {
    policy: 'scope_bound_unexposed_accuracy_outcomes',
    exclusions: Array.from(new Set(
      (input.controlCohortDefinition?.exclusions ?? [])
        .map((exclusion) => normalizeText(exclusion))
        .filter((exclusion): exclusion is string => Boolean(exclusion)),
    )),
  }
  const evaluationFingerprint = fingerprintFor({
    sourcePublicationKey,
    interventionAt,
    proxyMetric,
    rollbackTarget,
    decision,
    dataFreshnessStatus,
    controlCohortDefinition,
    cohorts: [treatedPreOutcomes, treatedPostOutcomes, controlPreOutcomes, controlPostOutcomes],
  })

  return {
    sourcePublicationKey,
    assetKey,
    parameterKey,
    ownerAlgorithm: normalizeText(input.ownerAlgorithm),
    scopeLevel,
    companyId: normalizeText(input.companyId),
    projectId: normalizeText(input.projectId),
    rollbackTarget,
    monitorReference,
    proxyMetric,
    observationStartedAt,
    interventionAt,
    prePeriodStart,
    prePeriodEnd,
    postPeriodStart,
    postPeriodEnd,
    evaluationWindowStart: allOutcomes[0]?.outcomeAt ?? null,
    evaluationWindowEnd: allOutcomes.at(-1)?.outcomeAt ?? null,
    evaluatedAt,
    decision,
    status,
    causalEstimateStatus,
    treatedPreSampleCount: counts.treatedPre,
    treatedPostSampleCount: counts.treatedPost,
    controlPreSampleCount: counts.controlPre,
    controlPostSampleCount: counts.controlPost,
    treatmentSampleCount: counts.treatedPost,
    controlSampleCount: counts.controlPost,
    treatedBaselineMaeDays: treatedPre.mean,
    treatedPostMaeDays: treatedPost.mean,
    controlBaselineMaeDays: controlPre.mean,
    controlPostMaeDays: controlPost.mean,
    counterfactualEffectDays,
    counterfactualEffectCi95LowerDays,
    counterfactualEffectCi95UpperDays,
    postInterventionErrorRateInflectionDays: treatedPost.errorRateInflectionDays,
    dataFreshnessStatus,
    sampleSufficiencyStatus,
    rollbackReviewRecommended,
    limitations: Array.from(new Set(limitations)),
    evidence: {
      temporalAnchor: {
        interventionAt,
        observationStartedAt,
        proxyMetric,
        source: 'runtime_publication_timestamp',
      },
      periods: {
        pre: { start: prePeriodStart, end: prePeriodEnd },
        post: { start: postPeriodStart, end: postPeriodEnd },
      },
      cohortDefinition: {
        treatedPublicationKey: sourcePublicationKey,
        controlPolicy: controlCohortDefinition.policy,
        exclusions: controlCohortDefinition.exclusions,
      },
      freshness: {
        status: dataFreshnessStatus,
        latestOutcomeAt,
        treatedLatestOutcomeAt,
        controlLatestOutcomeAt,
        maximumOutcomeAgeDays,
      },
      sampleSufficiency: {
        status: sampleSufficiencyStatus,
        minimumPerCohort: minimumCohortSize,
      },
      treatedPreOutcomeIds: treatedPreOutcomes.map((outcome) => outcome.outcomeId),
      treatedPostOutcomeIds: treatedPostOutcomes.map((outcome) => outcome.outcomeId),
      controlPreOutcomeIds: controlPreOutcomes.map((outcome) => outcome.outcomeId),
      controlPostOutcomeIds: controlPostOutcomes.map((outcome) => outcome.outcomeId),
      monitorReference,
      rollbackTarget,
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
      rollback_target,
      proxy_metric,
      observation_started_at,
      intervention_at,
      pre_period_start,
      pre_period_end,
      post_period_start,
      post_period_end,
      evaluation_window_start,
      evaluation_window_end,
      decision,
      evaluation_status,
      causal_estimate_status,
      treated_pre_sample_count,
      treated_post_sample_count,
      control_pre_sample_count,
      control_post_sample_count,
      treatment_sample_count,
      control_sample_count,
      treated_baseline_mae_days,
      treated_post_mae_days,
      control_baseline_mae_days,
      control_post_mae_days,
      counterfactual_effect_days,
      counterfactual_effect_ci95_lower_days,
      counterfactual_effect_ci95_upper_days,
      post_intervention_error_rate_inflection_days,
      data_freshness_status,
      sample_sufficiency_status,
      monitor_reference,
      rollback_review_recommended,
      limitations,
      evidence,
      evaluation_fingerprint,
      evaluated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
      $41, $42
    ) on conflict (evaluation_fingerprint) do nothing`,
    [
      evaluation.sourcePublicationKey,
      evaluation.assetKey,
      evaluation.parameterKey,
      evaluation.ownerAlgorithm,
      evaluation.scopeLevel,
      evaluation.companyId,
      evaluation.projectId,
      evaluation.rollbackTarget,
      evaluation.proxyMetric,
      evaluation.observationStartedAt,
      evaluation.interventionAt,
      evaluation.prePeriodStart,
      evaluation.prePeriodEnd,
      evaluation.postPeriodStart,
      evaluation.postPeriodEnd,
      evaluation.evaluationWindowStart,
      evaluation.evaluationWindowEnd,
      evaluation.decision,
      evaluation.status,
      evaluation.causalEstimateStatus,
      evaluation.treatedPreSampleCount,
      evaluation.treatedPostSampleCount,
      evaluation.controlPreSampleCount,
      evaluation.controlPostSampleCount,
      evaluation.treatmentSampleCount,
      evaluation.controlSampleCount,
      evaluation.treatedBaselineMaeDays,
      evaluation.treatedPostMaeDays,
      evaluation.controlBaselineMaeDays,
      evaluation.controlPostMaeDays,
      evaluation.counterfactualEffectDays,
      evaluation.counterfactualEffectCi95LowerDays,
      evaluation.counterfactualEffectCi95UpperDays,
      evaluation.postInterventionErrorRateInflectionDays,
      evaluation.dataFreshnessStatus,
      evaluation.sampleSufficiencyStatus,
      evaluation.monitorReference,
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
  rollback_target?: unknown
  published_at?: unknown
}

type OutcomeRow = {
  outcome_period?: unknown
  outcome_id?: unknown
  project_id?: unknown
  company_id?: unknown
  task_id?: unknown
  outcome_at?: unknown
  absolute_error_days?: unknown
  overcompensated?: unknown
}

type EvaluationPublication = Omit<AlgorithmInterventionEvaluationCandidate,
  | 'treatedPreOutcomes'
  | 'treatedPostOutcomes'
  | 'controlPreOutcomes'
  | 'controlPostOutcomes'
  | 'treatedOutcomes'
  | 'controlOutcomes'
>

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
    baselineAbsoluteErrorDays: null,
    absoluteErrorDays: finiteNonNegativeNumber(row.absolute_error_days),
    overcompensated: typeof row.overcompensated === 'boolean' ? row.overcompensated : null,
  }
}

function publicationFromRow(
  row: PublicationRow,
  evaluatedAt: string,
  prePeriodDays: number,
): EvaluationPublication | null {
  const sourcePublicationKey = normalizeText(row.publication_key)
  const assetKey = normalizeText(row.asset_key)
  const parameterKey = normalizeText(row.parameter_key)
  const scopeLevel = normalizeText(row.scope_level)
  const interventionAt = normalizeTimestamp(row.published_at)
  if (!sourcePublicationKey || !assetKey || !parameterKey || !scopeLevel || !interventionAt) return null
  const interventionTimestamp = Date.parse(interventionAt)
  return {
    sourcePublicationKey,
    assetKey,
    parameterKey,
    ownerAlgorithm: normalizeText(row.owner_algorithm),
    scopeLevel,
    companyId: normalizeText(row.company_id),
    projectId: normalizeText(row.project_id),
    rollbackTarget: normalizeText(row.rollback_target),
    interventionAt,
    proxyMetric: PROXY_METRIC,
    observationStartedAt: interventionAt,
    prePeriodStart: new Date(interventionTimestamp - (prePeriodDays * MILLISECONDS_PER_DAY)).toISOString(),
    prePeriodEnd: new Date(interventionTimestamp - 1).toISOString(),
    postPeriodStart: interventionAt,
    postPeriodEnd: evaluatedAt,
    controlCohortDefinition: {
      policy: 'scope_bound_unexposed_accuracy_outcomes',
      exclusions: ['publication_exposed_projects'],
    },
  }
}

function splitPeriodRows(rows: readonly OutcomeRow[]) {
  const pre: AlgorithmInterventionEvaluationOutcome[] = []
  const post: AlgorithmInterventionEvaluationOutcome[] = []
  for (const row of rows) {
    const outcome = outcomeFromRow(row)
    if (!outcome) continue
    if (normalizeText(row.outcome_period) === 'pre') pre.push(outcome)
    if (normalizeText(row.outcome_period) === 'post') post.push(outcome)
  }
  return { pre, post }
}

async function collectTreatedOutcomes(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  publication: EvaluationPublication,
) {
  const rows = await queryExec<OutcomeRow>(
    `with publication as (
       select $1::text as publication_key,
              $2::text as scope_level,
              $3::uuid as company_id,
              $4::uuid as project_id,
              $5::timestamptz as intervention_at,
              $6::timestamptz as pre_period_start,
              $7::timestamptz as post_period_end
     ), exposed_projects as (
       select distinct project.id
         from public.runtime_consumer_observations observation
         join public.projects project
           on project.id::text = observation.observation_context ->> 'projectId'
        cross join publication
        where observation.publication_key = publication.publication_key
          and observation.observation_status = 'observed'
       union
       select publication.project_id from publication where publication.scope_level = 'project'
     ), cohort_outcomes as (
     select 'pre' as outcome_period,
            'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            accuracy.backtested_at::text as outcome_at,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.duration_algorithm_accuracy_events accuracy
       join public.projects project on project.id = accuracy.project_id
       join exposed_projects exposed on exposed.id = project.id
      where accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= $6::timestamptz
        and accuracy.backtested_at < $5::timestamptz
        and accuracy.absolute_error_days is not null
     union all
     select 'post' as outcome_period,
            'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            accuracy.backtested_at::text as outcome_at,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.duration_algorithm_accuracy_events accuracy
       join public.projects project on project.id = accuracy.project_id
       join exposed_projects exposed on exposed.id = project.id
      where accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= $5::timestamptz
        and accuracy.backtested_at <= $7::timestamptz
        and accuracy.absolute_error_days is not null
     ), ranked as (
       select cohort_outcomes.*,
              row_number() over (
                partition by outcome_period
                order by outcome_at desc, outcome_id desc
              ) as period_rank
         from cohort_outcomes
     )
     select outcome_period,
            outcome_id,
            project_id,
            company_id,
            task_id,
            outcome_at,
            absolute_error_days,
            overcompensated
       from ranked
      where period_rank <= 500
      order by outcome_at asc, outcome_id asc`,
    [
      publication.sourcePublicationKey,
      publication.scopeLevel,
      publication.companyId,
      publication.projectId,
      publication.interventionAt,
      publication.prePeriodStart,
      publication.postPeriodEnd,
    ],
  )
  return splitPeriodRows(rows)
}

async function collectControlOutcomes(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
  publication: EvaluationPublication,
) {
  const rows = await queryExec<OutcomeRow>(
    `with publication as (
       select $1::text as publication_key,
              $2::text as scope_level,
              $3::uuid as company_id,
              $4::uuid as project_id,
              $5::timestamptz as intervention_at,
              $6::timestamptz as pre_period_start,
              $7::timestamptz as post_period_end
     ), cohort_outcomes as (
     select 'pre' as outcome_period,
            'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            accuracy.backtested_at::text as outcome_at,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.duration_algorithm_accuracy_events accuracy
       join public.projects project on project.id = accuracy.project_id
      cross join publication
      where accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= publication.pre_period_start
        and accuracy.backtested_at < publication.intervention_at
        and accuracy.absolute_error_days is not null
        and not exists (
          select 1
            from public.runtime_consumer_observations observation
           where observation.publication_key = publication.publication_key
             and observation.observation_status = 'observed'
             and observation.observation_context ->> 'projectId' = project.id::text
        )
        and (
          publication.scope_level = 'system'
          or (publication.scope_level = 'company' and project.company_id = publication.company_id)
          or (publication.scope_level = 'project' and project.company_id = publication.company_id and project.id <> publication.project_id)
        )
     union all
     select 'post' as outcome_period,
            'accuracy:' || accuracy.id::text as outcome_id,
            project.id::text as project_id,
            project.company_id::text as company_id,
            accuracy.task_id::text as task_id,
            accuracy.backtested_at::text as outcome_at,
            accuracy.absolute_error_days,
            accuracy.overcompensated
       from public.duration_algorithm_accuracy_events accuracy
       join public.projects project on project.id = accuracy.project_id
      cross join publication
      where accuracy.backtest_status = 'backtested'
        and accuracy.backtested_at >= publication.intervention_at
        and accuracy.backtested_at <= publication.post_period_end
        and accuracy.absolute_error_days is not null
        and not exists (
          select 1
            from public.runtime_consumer_observations observation
           where observation.publication_key = publication.publication_key
             and observation.observation_status = 'observed'
             and observation.observation_context ->> 'projectId' = project.id::text
        )
        and (
          publication.scope_level = 'system'
          or (publication.scope_level = 'company' and project.company_id = publication.company_id)
          or (publication.scope_level = 'project' and project.company_id = publication.company_id and project.id <> publication.project_id)
        )
     ), ranked as (
       select cohort_outcomes.*,
              row_number() over (
                partition by outcome_period
                order by outcome_at desc, outcome_id desc
              ) as period_rank
         from cohort_outcomes
     )
     select outcome_period,
            outcome_id,
            project_id,
            company_id,
            task_id,
            outcome_at,
            absolute_error_days,
            overcompensated
       from ranked
      where period_rank <= 500
      order by outcome_at asc, outcome_id asc`,
    [
      publication.sourcePublicationKey,
      publication.scopeLevel,
      publication.companyId,
      publication.projectId,
      publication.interventionAt,
      publication.prePeriodStart,
      publication.postPeriodEnd,
    ],
  )
  return splitPeriodRows(rows)
}

// workspace-isolation-system-job-approved: the singleton impact-monitoring scheduler scans scoped publications across tenants, retains company/project lineage, and is not request-facing.
export async function collectAlgorithmInterventionEvaluationCandidates(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec = executeSQL,
  options: { evaluatedAt?: string, prePeriodDays?: number } = {},
) {
  const evaluatedAt = normalizeTimestamp(options.evaluatedAt) ?? new Date().toISOString()
  const prePeriodDays = Math.max(1, Math.floor(options.prePeriodDays ?? DEFAULT_PRE_PERIOD_DAYS))
  const rows = await queryExec<PublicationRow>(
    `select publication_key,
            asset_key,
            parameter_key,
            owner_algorithm,
            scope_level,
            company_id,
            project_id,
            rollback_target,
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
    const publication = publicationFromRow(row, evaluatedAt, prePeriodDays)
    if (!publication) continue
    const [treated, controls] = await Promise.all([
      collectTreatedOutcomes(queryExec, publication),
      collectControlOutcomes(queryExec, publication),
    ])
    candidates.push({
      ...publication,
      treatedPreOutcomes: treated.pre,
      treatedPostOutcomes: treated.post,
      controlPreOutcomes: controls.pre,
      controlPostOutcomes: controls.post,
      treatedOutcomes: treated.post,
      controlOutcomes: controls.post,
    })
  }
  return candidates
}

export async function runAlgorithmInterventionEvaluationSweep(
  input: AlgorithmInterventionEvaluationSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const rollbackExecutor = input.rollbackExecutor ?? executeAlgorithmAssetLearnableParameterRuntimeRollback
  const candidates = input.candidates ?? (
    input.candidateProvider
      ? await input.candidateProvider()
      : await collectAlgorithmInterventionEvaluationCandidates(queryExec, { evaluatedAt: input.evaluatedAt })
  )
  const result = emptySweepResult(candidates.length)
  for (const candidate of candidates) {
    try {
      const evaluation = evaluateAlgorithmInterventionOutcomes(candidate, { evaluatedAt: input.evaluatedAt })
      await persistAlgorithmInterventionEvaluation({ queryExec, evaluation })
      result.persisted += 1
      result.evaluationRefs.push(evaluation.evaluationFingerprint)

      if (evaluation.status === 'insufficient_evidence') result.insufficientEvidence += 1
      if (evaluation.status === 'observational_estimate') result.observationalEstimate += 1
      if (evaluation.status === 'counterfactual_supported') result.counterfactualSupported += 1
      if (evaluation.rollbackReviewRecommended) result.rollbackReviewRecommended += 1
      if (evaluation.decision === 'insufficient_data') result.insufficientData += 1
      if (evaluation.decision === 'no_detectable_effect') result.noDetectableEffect += 1
      if (evaluation.decision === 'benefit_detected') result.benefitDetected += 1
      if (evaluation.decision === 'harm_detected') result.harmDetected += 1
      if (evaluation.decision === 'confounded') result.confounded += 1

      if (evaluation.decision === 'harm_detected') {
        const rollback = await rollbackExecutor({
          queryExec,
          sourcePublicationKey: evaluation.sourcePublicationKey,
          rollbackTarget: evaluation.rollbackTarget ?? '',
          reason: 'causal_intervention_harm_detected',
          executedAt: evaluation.evaluatedAt,
          idempotencyKey: `algorithm-intervention-rollback:${evaluation.evaluationFingerprint}`,
        })
        if (rollback.status === 'rollback_blocked') {
          result.rollbackBlocked += 1
          throw new Error(`algorithm_intervention_rollback_blocked:${rollback.reasons.join(',') || 'unclassified'}`)
        }
        result.rollbackExecuted += 1
      }
    } catch {
      result.failed += 1
    }
  }
  return result
}
