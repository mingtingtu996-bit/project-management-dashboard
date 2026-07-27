import { supabase } from './dbService.js'
import { buildProjectProductivityCompensation } from './projectProductivityCompensationService.js'
import {
  loadPublishedProjectProductivityCalibration,
  rollbackPublishedProjectProductivityCalibration,
} from './projectProductivityCalibrationStore.js'
import type { ProjectProductivityCompensationInput } from './projectProductivityCompensationService.js'
import {
  evaluateDurationContextCombinationStressMatrix,
  evaluateDurationContextFactorAttribution,
  getDurationContextFactorAutomationPolicy,
  validateDurationContextSummaryContract,
  type DurationContextFactorAttributionCase,
} from './durationContextGovernanceService.js'
import {
  buildAndPersistDurationContextPolicyRecommendation,
  buildDurationContextPolicyRecommendation,
} from './durationContextPolicyLearningService.js'
import { persistDurationContextPolicyDecision } from './durationContextPolicyLearningLogService.js'
import {
  buildDurationContextPolicyStateBucket,
  validateDurationContextPolicyStateBucket,
  type DurationContextPolicyExperienceTier,
} from './durationContextPolicyStateBucketService.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import { getProjectCompanyId } from '../auth/access.js'
import { loadProjectProductivityCalibrationDurationExperienceSamples } from './durationContextSampleReadModelService.js'
import { replaceProjectProductivityCalibrationAtomically } from './durationLearningAssetAtomicStoreService.js'

export type ProjectProductivityCalibrationStatus =
  | 'shadow'
  | 'candidate'
  | 'published'
  | 'superseded'
  | 'rejected'
  | 'rolled_back'

export interface ProjectProductivityCalibrationInput {
  projectId?: string | null
  windowEndDate?: string | null
  windowDays?: number | null
  baseProductivity?: number | null
  observedProductivity?: number | null
  actualEffectiveWorkdayRatio?: number | null
  actionPolicy?: 'shadow_run' | 'candidate_only' | 'auto_publish'
  shadowEvidence?: {
    durationSamples?: DurationSampleRow[]
    dailySnapshots?: SnapshotRow[]
    compensation?: ProjectProductivityCompensationInput['shadowEvidence']
    productivityLearning?: {
      stateBucket?: string | null
      state_bucket?: string | null
      experienceTier?: string | null
      experience_tier?: string | null
      scheduleState?: string | null
      schedule_state?: string | null
    }
    auditReplayCases?: DurationContextFactorAttributionCase[]
    durationContextSummaries?: unknown[]
    source?: string | null
  }
}

export interface ProjectProductivityCalibrationResult {
  companyId: string
  projectId: string
  status: ProjectProductivityCalibrationStatus
  actionPolicy: 'shadow_run' | 'candidate_only' | 'auto_publish'
  windowStartDate: string
  windowEndDate: string
  windowDays: number
  sampleCount: number
  snapshotCount: number
  maturityDays: number
  baseProductivity: number
  observedProductivity: number | null
  adjustedProductivity: number | null
  biasBefore: number | null
  biasAfter: number | null
  maeBefore: number | null
  maeAfter: number | null
  overcompensationRate: number
  recommendedCap: number | null
  recommendedMinUplift: number | null
  parameterPayload: Record<string, unknown>
  evidenceSummary: Record<string, unknown>
}

type SnapshotRow = {
  snapshot_date?: string | null
  overall_progress?: number | string | null
  task_progress?: number | string | null
  delay_days?: number | string | null
}

type DurationSampleRow = {
  id?: string | null
  company_id?: string | null
  project_id?: string | null
  task_id?: string | null
  planned_duration?: number | string | null
  actual_duration?: number | string | null
  completed_at?: string | null
  created_at?: string | null
  sample_status?: string | null
  included_in_benchmark?: boolean | null
  experience_tier?: string | null
  reuse_scope?: string | null
  fact_source?: string | null
  evidence_fingerprint?: string | null
  source_lineage?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

const PROJECT_PRODUCTIVITY_CALIBRATION_EXPERIENCE_TIER: DurationContextPolicyExperienceTier = 'T3'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function buildProductivityCompensationAutomationPolicyPayload() {
  const policy = getDurationContextFactorAutomationPolicy('productivity_compensation')
  return {
    factorKey: policy.factorKey,
    riskTier: policy.riskTier,
    allowedAutomationStages: policy.allowedAutomationStages,
    runtimeAutoPublishEligible: policy.runtimeAutoPublishEligible,
    runtimeActivationBoundary: policy.runtimeActivationBoundary,
    rollbackRequired: policy.rollbackRequired,
    guardrails: policy.guardrails,
  }
}

function parseDate(value: unknown) {
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isExplicitlyNonRealDurationSample(row: DurationSampleRow) {
  const metadata = readRecord(row.metadata)
  return metadata.notRealProductionOutcome === true
    || metadata.not_real_production_outcome === true
}

async function loadDurationSamples(companyId: string, projectId: string, windowStartDate: string, windowEndDate: string) {
  const data = await loadProjectProductivityCalibrationDurationExperienceSamples({
    companyId,
    projectId,
    windowStartDate,
    windowEndDate,
    limit: 180,
  })
  return (data as DurationSampleRow[]).filter((row) => {
    if (isExplicitlyNonRealDurationSample(row)) return false
    const date = normalizeDate(row.completed_at ?? row.created_at)
    return Boolean(date && date >= windowStartDate && date <= windowEndDate)
  })
}

async function loadSnapshots(projectId: string, windowStartDate: string, windowEndDate: string) {
  const { data, error } = await (supabase as any)
    .from('project_daily_snapshot')
    .select('snapshot_date, overall_progress, task_progress, delay_days')
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: true })
    .limit(180)

  if (error || !Array.isArray(data)) return [] as SnapshotRow[]
  return (data as SnapshotRow[]).filter((row) => {
    const date = normalizeDate(row.snapshot_date)
    return Boolean(date && date >= windowStartDate && date <= windowEndDate)
  })
}

function inferObservedProductivity(input: {
  explicit?: number | null
  actualEffectiveWorkdayRatio?: number | null
  samples: DurationSampleRow[]
  snapshots: SnapshotRow[]
}) {
  const explicit = readNumber(input.explicit ?? input.actualEffectiveWorkdayRatio, NaN)
  if (Number.isFinite(explicit) && explicit > 0) return round(clamp(explicit, 0.25, 1.2))

  const validSamples = input.samples
    .map((row) => {
      const planned = readNumber(row.planned_duration, 0)
      const actual = readNumber(row.actual_duration, 0)
      return planned > 0 && actual > 0 ? clamp(planned / actual, 0.35, 1.35) : null
    })
    .filter((value): value is number => value != null)
  if (validSamples.length >= 5) {
    return round(validSamples.reduce((sum, value) => sum + value, 0) / validSamples.length)
  }

  const first = input.snapshots[0] ?? null
  const last = input.snapshots[input.snapshots.length - 1] ?? null
  if (first && last) {
    const progressGain = readNumber(last.overall_progress ?? last.task_progress, 0)
      - readNumber(first.overall_progress ?? first.task_progress, 0)
    const delayRecovery = readNumber(first.delay_days, 0) - readNumber(last.delay_days, 0)
    if (progressGain > 0 || delayRecovery > 0) {
      return round(clamp(0.72 + Math.max(0, progressGain) / 500 + Math.max(0, delayRecovery) / 180, 0.35, 1.05))
    }
  }

  return null
}

function chooseStatus(input: {
  actionPolicy: 'shadow_run' | 'candidate_only' | 'auto_publish'
  maturityDays: number
  sampleCount: number
  snapshotCount: number
  maeAfter: number | null
  maeBefore: number | null
  overcompensationRate: number
}) {
  if (input.actionPolicy === 'shadow_run' || input.maturityDays < 30) return 'shadow' as const
  // Runtime activation is owned by the unified candidate -> canary -> stable publication chain.
  // This calibration row remains evidence/candidate even when its local replay is mature.
  return 'candidate' as const
}

function buildParameterPayload(input: {
  companyId: string
  projectId: string
  sampleCount: number
  snapshotCount: number
  maturityDays: number
  durationRatio: number | null
  recommendedCap: number | null
  recommendedMinUplift: number | null
  biasAfter: number | null
  overcompensationRate: number
  thresholdEvolutionCandidate?: Record<string, unknown> | null
  policyLearningRecommendation?: unknown
  productivityLearningBucket?: Record<string, unknown>
}) {
  const compensationCap = input.recommendedCap ?? (input.maturityDays >= 90 ? 0.18 : input.maturityDays >= 50 ? 0.1 : 0.05)
  const payload: Record<string, unknown> = {
    calibrationVersion: 'project_productivity_compensation_v1',
    assetIdentity: {
      experienceTier: 'T3',
      experienceAssetType: 'project_efficiency_model',
      reuseScope: 'project',
      factSource: 'hybrid',
      companyId: input.companyId,
      projectId: input.projectId,
    },
    automationPolicy: buildProductivityCompensationAutomationPolicyPayload(),
    sampleCount: input.sampleCount,
    snapshotCount: input.snapshotCount,
    maturityDays: input.maturityDays,
    durationRatio: input.durationRatio,
    compensationCap,
    minAppliedUplift: input.recommendedMinUplift ?? 0.05,
    maxAdjustedProductivity: input.biasAfter != null && input.biasAfter > 0 ? 0.98 : 0.95,
    sourceWeightScale: {
      durationExperience: input.maturityDays >= 90 ? 1.05 : 1,
      dailySnapshot: input.maturityDays >= 50 ? 1 : 0.8,
      scheduleState: input.overcompensationRate > 0.05 ? 0.8 : 1,
    },
    guardrails: {
      rigidShutdownNotCompensated: true,
      blockingScheduleStateNotCompensated: true,
      publishedOnlyRuntimeConsumption: true,
      crossTierProductivityLearningBlocked: true,
    },
  }
  if (input.productivityLearningBucket) {
    payload.productivityLearningBucket = input.productivityLearningBucket
  }
  if (input.thresholdEvolutionCandidate) {
    payload.thresholdEvolutionCandidate = input.thresholdEvolutionCandidate
  }
  if (input.policyLearningRecommendation) {
    payload.policyLearningRecommendation = input.policyLearningRecommendation
  }
  return payload
}

function maturityCompensationCap(maturityDays: number) {
  return maturityDays >= 90 ? 0.18 : maturityDays >= 50 ? 0.1 : maturityDays >= 30 ? 0.05 : 0
}

function resolveBiasAwareCalibration(input: {
  baseProductivity: number
  observedProductivity: number | null
  compensationUplift: number
  maturityDays: number
  compensationActionPolicy: string
}) {
  const maturityCap = maturityCompensationCap(input.maturityDays)
  const rawUplift = input.compensationActionPolicy === 'auto_apply'
    ? Math.max(0, input.compensationUplift)
    : 0

  if (rawUplift <= 0 || maturityCap <= 0) {
    return {
      adjustedProductivity: input.baseProductivity,
      recommendedCap: 0,
      recommendedMinUplift: 0,
      biasGuardrail: {
        policy: 'no_positive_compensation_evidence',
        rawUplift,
        maturityCap,
      },
    }
  }

  if (input.observedProductivity == null) {
    const recommendedCap = round(clamp(rawUplift + 0.02, 0, maturityCap))
    const recommendedMinUplift = rawUplift > 0 ? Math.min(0.05, rawUplift, recommendedCap) : 0
    const requestedUplift = Math.min(rawUplift, recommendedCap)
    return {
      adjustedProductivity: round(input.baseProductivity + requestedUplift),
      recommendedCap,
      recommendedMinUplift,
      biasGuardrail: {
        policy: 'no_observed_productivity_available_maturity_cap_only',
        rawUplift,
        maturityCap,
      },
    }
  }

  const positiveBiasGap = round(input.observedProductivity - input.baseProductivity, 4)
  if (positiveBiasGap <= 0) {
    return {
      adjustedProductivity: input.baseProductivity,
      recommendedCap: 0,
      recommendedMinUplift: 0,
      biasGuardrail: {
        policy: 'observed_productivity_does_not_exceed_base',
        rawUplift,
        maturityCap,
        positiveBiasGap,
      },
    }
  }

  const biasBoundedCap = round(clamp(positiveBiasGap * 0.8, 0, maturityCap))
  const recommendedCap = round(Math.min(biasBoundedCap, rawUplift + 0.02))
  const requestedUplift = round(Math.min(rawUplift, recommendedCap))
  const recommendedMinUplift = positiveBiasGap < 0.08
    ? 0
    : round(Math.min(0.05, requestedUplift, recommendedCap * 0.5))

  return {
    adjustedProductivity: round(input.baseProductivity + requestedUplift),
    recommendedCap,
    recommendedMinUplift,
    biasGuardrail: {
      policy: 'observed_bias_bounded_compensation',
      rawUplift,
      maturityCap,
      positiveBiasGap,
      biasBoundedCap,
      requestedUplift,
    },
  }
}

function buildCalibrationAuditReplaySummary(input: {
  auditReplayCases?: DurationContextFactorAttributionCase[] | null
  durationContextSummaries?: unknown[] | null
}) {
  const attributionCases = Array.isArray(input.auditReplayCases) ? input.auditReplayCases : []
  const attribution = {
    ...evaluateDurationContextFactorAttribution(attributionCases),
    status: attributionCases.length > 0 ? 'evaluated' : 'insufficient_observed_cases',
  }
  const matrix = evaluateDurationContextCombinationStressMatrix()
  const summaries = Array.isArray(input.durationContextSummaries) ? input.durationContextSummaries : []
  const validationResults = summaries.map((summary, index) => ({
    index,
    ...validateDurationContextSummaryContract(summary),
  }))
  const invalidCount = validationResults.filter((result) => !result.valid).length
  const warningCount = validationResults.reduce((count, result) => count + result.warnings.length, 0)

  return {
    replayCode: 'project_productivity_calibration_audit_replay',
    frontendExposurePolicy: 'backend_admin_api_only',
    attribution,
    combinationMatrix: {
      matrixCode: matrix.summary.matrixCode,
      scenarioCount: matrix.summary.totalScenarios,
      pairwiseScenarioCount: matrix.summary.pairwiseScenarioCount,
      tripleScenarioCount: matrix.summary.tripleScenarioCount,
      regressionStatus: 'active',
    },
    jsonContractValidation: {
      validator: 'validateDurationContextSummaryContract',
      status: summaries.length === 0
        ? 'not_run_no_factor_summary_payload'
        : invalidCount === 0
          ? 'passed'
          : 'failed',
      checkedCount: summaries.length,
      validCount: summaries.length - invalidCount,
      invalidCount,
      warningCount,
      results: validationResults.slice(0, 20),
    },
  }
}

function buildThresholdEvolutionCandidate(input: {
  calibrationStatus: ProjectProductivityCalibrationStatus
  sampleCount: number
  snapshotCount: number
  maturityDays: number
  biasBefore: number | null
  biasAfter: number | null
  maeBefore: number | null
  maeAfter: number | null
  overcompensationRate: number
  recommendedCap: number | null
  recommendedMinUplift: number | null
}) {
  const maeImprovement = input.maeBefore != null && input.maeAfter != null
    ? round(input.maeBefore - input.maeAfter, 4)
    : null
  const enoughEvidence = input.maturityDays >= 50 || input.sampleCount >= 50 || input.snapshotCount >= 50
  const improved = maeImprovement != null && maeImprovement >= 0
  const safeOvercompensation = input.overcompensationRate <= 0.08
  const hasTunableRecommendation = (input.recommendedCap ?? 0) > 0 || (input.recommendedMinUplift ?? 0) > 0
  if (!enoughEvidence || !improved || !safeOvercompensation || !hasTunableRecommendation) return null

  const status = input.calibrationStatus === 'published' ? 'published' : 'candidate'
  return {
    status,
    parameterFamily: 'productivity_compensation_thresholds',
    runtimeEffect: status === 'published'
      ? 'published_runtime_consumable'
      : 'candidate_only_until_published',
    automationPolicy: buildProductivityCompensationAutomationPolicyPayload(),
    proposedCompensationCap: input.recommendedCap ?? 0,
    proposedMinAppliedUplift: input.recommendedMinUplift ?? 0,
    evidenceThresholds: {
      sampleCount: input.sampleCount,
      snapshotCount: input.snapshotCount,
      maturityDays: input.maturityDays,
      biasBefore: input.biasBefore,
      biasAfter: input.biasAfter,
      maeBefore: input.maeBefore,
      maeAfter: input.maeAfter,
      maeImprovement,
      overcompensationRate: input.overcompensationRate,
    },
    publicationGate: 'requires_candidate_review_or_auto_publish_guardrails',
    source: 'project_productivity_calibration_sweep',
  }
}

function sourceProductivityLearningBucket(input: ProjectProductivityCalibrationInput) {
  const explicit = readRecord(input.shadowEvidence?.productivityLearning)
  const compensation = readRecord(input.shadowEvidence?.compensation)
  const compensationMetadata = readRecord(compensation.metadata)
  const stateBucket = normalizeText(
    explicit.stateBucket
      ?? explicit.state_bucket
      ?? compensationMetadata.stateBucket
      ?? compensationMetadata.state_bucket,
  )
  const experienceTier = normalizeText(
    explicit.experienceTier
      ?? explicit.experience_tier
      ?? compensationMetadata.experienceTier
      ?? compensationMetadata.experience_tier,
  )
  const scheduleState = normalizeText(
    explicit.scheduleState
      ?? explicit.schedule_state
      ?? compensationMetadata.dominantScheduleState
      ?? compensationMetadata.scheduleState
      ?? compensationMetadata.schedule_state,
  )

  return {
    stateBucket: stateBucket || null,
    experienceTier: experienceTier || null,
    scheduleState: scheduleState || null,
  }
}

function buildProductivityLearningBucketEvidence(input: {
  stateVector: {
    maturityTier: string
    scheduleState: string | null
    highRiskFactorCount: number
    mediumRiskFactorCount: number
    lowRiskFactorCount: number
    hardConstraintActive: boolean
  }
  sourceBucket?: string | null
}) {
  const stateBucket = buildDurationContextPolicyStateBucket({
    maturityTier: input.stateVector.maturityTier,
    scheduleState: input.stateVector.scheduleState,
    highRiskFactorCount: input.stateVector.highRiskFactorCount,
    mediumRiskFactorCount: input.stateVector.mediumRiskFactorCount,
    lowRiskFactorCount: input.stateVector.lowRiskFactorCount,
    hardConstraintActive: input.stateVector.hardConstraintActive,
    experienceTier: PROJECT_PRODUCTIVITY_CALIBRATION_EXPERIENCE_TIER,
  })
  const validation = validateDurationContextPolicyStateBucket(stateBucket, {
    expectedExperienceTier: PROJECT_PRODUCTIVITY_CALIBRATION_EXPERIENCE_TIER,
  })
  const sourceValidation = input.sourceBucket
    ? validateDurationContextPolicyStateBucket(input.sourceBucket, {
      expectedExperienceTier: PROJECT_PRODUCTIVITY_CALIBRATION_EXPERIENCE_TIER,
    })
    : null
  const driftReasonCodes = sourceValidation
    ? sourceValidation.isValid && input.sourceBucket !== stateBucket
      ? ['state_bucket_mismatch']
      : sourceValidation.reasonCodes
    : []

  return {
    stateBucket,
    sourceStateBucket: input.sourceBucket ?? null,
    experienceTier: PROJECT_PRODUCTIVITY_CALIBRATION_EXPERIENCE_TIER,
    validationPolicy: 'duration_context_policy_state_bucket_T3_only',
    validation,
    sourceValidation,
    driftDetected: driftReasonCodes.length > 0,
    driftReasonCodes,
    runtimeMutationPolicy: 'none_evidence_bridge_only',
    crossTierLearningPolicy: 'reject_T1_T2_or_legacy_bucket_for_productivity_calibration',
  }
}

function mapResultToRow(result: ProjectProductivityCalibrationResult) {
  return {
    company_id: result.companyId,
    project_id: result.projectId,
    calibration_key: 'productivity_compensation',
    status: result.status,
    action_policy: result.actionPolicy,
    window_start_date: result.windowStartDate,
    window_end_date: result.windowEndDate,
    window_days: result.windowDays,
    sample_count: result.sampleCount,
    snapshot_count: result.snapshotCount,
    maturity_days: result.maturityDays,
    base_productivity: result.baseProductivity,
    observed_productivity: result.observedProductivity,
    adjusted_productivity: result.adjustedProductivity,
    bias_before: result.biasBefore,
    bias_after: result.biasAfter,
    mae_before: result.maeBefore,
    mae_after: result.maeAfter,
    overcompensation_rate: result.overcompensationRate,
    recommended_cap: result.recommendedCap,
    recommended_min_uplift: result.recommendedMinUplift,
    parameter_payload: result.parameterPayload,
    evidence_summary: result.evidenceSummary,
    published_at: result.status === 'published' ? new Date().toISOString() : null,
  }
}

function policyLearningStateFromCalibrationResult(result: ProjectProductivityCalibrationResult) {
  const compensation = result.evidenceSummary.compensation && typeof result.evidenceSummary.compensation === 'object'
    ? result.evidenceSummary.compensation as Record<string, unknown>
    : {}
  const metadata = compensation.metadata && typeof compensation.metadata === 'object'
    ? compensation.metadata as Record<string, unknown>
    : {}

  return {
    state: {
      projectType: null,
      city: null,
      yearMonth: result.windowEndDate.slice(0, 7),
      maturityDays: result.maturityDays,
      ruleBaselineP: result.baseProductivity,
      currentP: result.adjustedProductivity,
      scheduleState: normalizeText(metadata.dominantScheduleState) || null,
      factorSignals: [
        {
          factorKey: 'productivity_compensation' as const,
          multiplier: readNumber(compensation.durationMultiplier, 1),
          extraDays: 0,
          actionPolicy: normalizeText(compensation.actionPolicy) === 'auto_apply'
            ? 'auto_apply' as const
            : 'candidate_only' as const,
        },
      ],
    },
    replayEvidence: {
      maeBefore: result.maeBefore,
      maeAfter: result.maeAfter,
      overcompensationRate: result.overcompensationRate,
      sampleCount: Math.max(result.sampleCount, result.snapshotCount),
      scheduleStabilityDelta: result.biasBefore != null && result.biasAfter != null
        ? Math.abs(result.biasBefore) - Math.abs(result.biasAfter)
        : null,
    },
  }
}

export async function buildProjectProductivityCalibration(
  input: ProjectProductivityCalibrationInput,
): Promise<ProjectProductivityCalibrationResult | null> {
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null
  const companyId = normalizeId(await getProjectCompanyId(projectId))
  if (!companyId) return null
  const windowDays = Math.max(1, Math.min(180, Math.trunc(readNumber(input.windowDays, 30))))
  const windowEnd = parseDate(input.windowEndDate) ?? new Date()
  const windowStart = addDays(windowEnd, -(windowDays - 1))
  const windowStartDate = formatDate(windowStart)
  const windowEndDate = formatDate(windowEnd)
  const baseProductivity = round(clamp(readNumber(input.baseProductivity, 0.71), 0.25, 1.1))
  const actionPolicy = input.actionPolicy ?? 'shadow_run'

  const [samples, snapshots] = await Promise.all([
    input.shadowEvidence?.durationSamples
      ? Promise.resolve(input.shadowEvidence.durationSamples.filter((row) => {
        if (isExplicitlyNonRealDurationSample(row)) return false
        const date = normalizeDate(row.completed_at ?? row.created_at)
        return Boolean(date && date >= windowStartDate && date <= windowEndDate)
      }))
      : loadDurationSamples(companyId, projectId, windowStartDate, windowEndDate),
    input.shadowEvidence?.dailySnapshots
      ? Promise.resolve(input.shadowEvidence.dailySnapshots.filter((row) => {
        const date = normalizeDate(row.snapshot_date)
        return Boolean(date && date >= windowStartDate && date <= windowEndDate)
      }))
      : loadSnapshots(projectId, windowStartDate, windowEndDate),
  ])
  const compensation = await buildProjectProductivityCompensation({
    projectId,
    baseProductivity,
    appliedFactorKeys: ['seasonal_productivity', 'weather_forecast_impact'],
    skipPublishedCalibrationOverlay: true,
    governanceMode: 'learning_shadow_replay',
    shadowEvidence: {
      ...(input.shadowEvidence?.compensation ?? {}),
      durationSamples: samples,
      dailySnapshots: snapshots,
    },
  })

  const observedProductivity = inferObservedProductivity({
    explicit: input.observedProductivity,
    actualEffectiveWorkdayRatio: input.actualEffectiveWorkdayRatio,
    samples,
    snapshots,
  })
  const biasBefore = observedProductivity == null ? null : round(baseProductivity - observedProductivity, 4)
  const sampleSpanDays = samples.length > 0
    ? inclusiveDurationDays(
      parseDate(samples[0].completed_at ?? samples[0].created_at) ?? windowStart,
      parseDate(samples[samples.length - 1].completed_at ?? samples[samples.length - 1].created_at) ?? windowEnd,
    ) ?? 1
    : 0
  const snapshotSpanDays = snapshots.length > 0
    ? inclusiveDurationDays(
      parseDate(snapshots[0].snapshot_date) ?? windowStart,
      parseDate(snapshots[snapshots.length - 1].snapshot_date) ?? windowEnd,
    ) ?? 1
    : 0
  const maturityDays = Math.max(sampleSpanDays, snapshotSpanDays, Math.min(90, samples.length), Math.min(90, snapshots.length))
  const biasAware = resolveBiasAwareCalibration({
    baseProductivity,
    observedProductivity,
    compensationUplift: compensation.productivityUplift,
    maturityDays,
    compensationActionPolicy: compensation.actionPolicy,
  })
  const adjustedProductivity = biasAware.adjustedProductivity
  const biasAfter = observedProductivity == null ? null : round(adjustedProductivity - observedProductivity, 4)
  const maeBefore = biasBefore == null ? null : round(Math.abs(biasBefore), 4)
  const maeAfter = biasAfter == null ? null : round(Math.abs(biasAfter), 4)
  const overcompensationRate = biasAfter != null && biasAfter > 0.03 ? round(Math.min(1, biasAfter / Math.max(0.01, observedProductivity ?? 1))) : 0
  const recommendedCap = biasAware.recommendedCap
  const recommendedMinUplift = biasAware.recommendedMinUplift
  const status = chooseStatus({
    actionPolicy,
    maturityDays,
    sampleCount: samples.length,
    snapshotCount: snapshots.length,
    maeAfter,
    maeBefore,
    overcompensationRate,
  })
  const thresholdEvolutionCandidate = buildThresholdEvolutionCandidate({
    calibrationStatus: status,
    sampleCount: samples.length,
    snapshotCount: snapshots.length,
    maturityDays,
    biasBefore,
    biasAfter,
    maeBefore,
    maeAfter,
    overcompensationRate,
    recommendedCap,
    recommendedMinUplift,
  })
  const policyLearningRecommendation = buildDurationContextPolicyRecommendation({
    projectId,
    state: {
      projectType: null,
      city: null,
      yearMonth: windowEndDate.slice(0, 7),
      maturityDays,
      ruleBaselineP: baseProductivity,
      currentP: adjustedProductivity,
      scheduleState: compensation.metadata?.dominantScheduleState as string | null | undefined,
      factorSignals: [
        {
          factorKey: 'productivity_compensation',
          multiplier: compensation.durationMultiplier,
          extraDays: 0,
          actionPolicy: compensation.actionPolicy,
        },
      ],
    },
    replayEvidence: {
      maeBefore,
      maeAfter,
      overcompensationRate,
      sampleCount: Math.max(samples.length, snapshots.length),
      scheduleStabilityDelta: biasBefore != null && biasAfter != null
        ? Math.abs(biasBefore) - Math.abs(biasAfter)
        : null,
    },
  })
  const sourceBucket = sourceProductivityLearningBucket(input)
  const sourceScheduleState = sourceBucket.scheduleState || null
  if (sourceScheduleState && !policyLearningRecommendation.stateVector.scheduleState) {
    policyLearningRecommendation.stateVector.scheduleState = sourceScheduleState
  }
  const productivityLearningBucket = buildProductivityLearningBucketEvidence({
    stateVector: policyLearningRecommendation.stateVector,
    sourceBucket: sourceBucket.stateBucket,
  })
  ;(policyLearningRecommendation.stateVector as any).stateBucket = productivityLearningBucket.stateBucket
  ;(policyLearningRecommendation.stateVector as any).experienceTier = productivityLearningBucket.experienceTier
  ;(policyLearningRecommendation as any).productivityLearningBucket = productivityLearningBucket
  const compensationMetadata = readRecord(compensation.metadata)
  const durationExperienceEvidence = readRecord(compensationMetadata.durationExperience)
  const durationRatioValue = readNumber(durationExperienceEvidence.durationRatio, Number.NaN)
  const durationRatio = Number.isFinite(durationRatioValue) ? round(durationRatioValue) : null
  const parameterPayload = buildParameterPayload({
    companyId,
    projectId,
    sampleCount: samples.length,
    snapshotCount: snapshots.length,
    maturityDays,
    durationRatio,
    recommendedCap,
    recommendedMinUplift,
    biasAfter,
    overcompensationRate,
    thresholdEvolutionCandidate,
    policyLearningRecommendation,
    productivityLearningBucket,
  })
  const auditReplay = buildCalibrationAuditReplaySummary({
    auditReplayCases: input.shadowEvidence?.auditReplayCases,
    durationContextSummaries: input.shadowEvidence?.durationContextSummaries,
  })
  const taskIds = Array.from(new Set(samples.map((sample) => normalizeId(sample.task_id)).filter((value): value is string => Boolean(value))))
  const uniqueChangeKeys = Array.from(new Set(samples.map((sample) => normalizeId(sample.evidence_fingerprint ?? sample.id)).filter((value): value is string => Boolean(value))))
  const realOutcomeCount = samples.filter((sample) => ['actual_outcome', 'hybrid'].includes(normalizeText(sample.fact_source))).length
  const autoPublishEvidence = {
    evidenceRefs: samples.slice(0, 100).map((sample) => `duration_experience_samples:${normalizeId(sample.id)}`).filter((value) => !value.endsWith(':null')),
    enabledLearningScopes: ['project'],
    scopeSampleCounts: { project: samples.length },
    sampleCount: samples.length,
    uniqueChangeKeys,
    validChangeCount: uniqueChangeKeys.length,
    taskIds,
    distinctTaskCount: taskIds.length,
    projectIds: [projectId],
    distinctProjectCount: 1,
    companyIds: [companyId],
    distinctCompanyCount: 1,
    realOutcomeCount,
    observationWindowDays: maturityDays,
    maeBefore,
    maeAfter,
    conflictRate: 0,
    overcompensationRate,
    rollbackReady: true,
    tenantScopeValid: true,
    structuralMutation: false,
    durationRatio,
  }
  const evidenceSummary = {
    compensation,
    observedProductivity,
    sampleCount: samples.length,
    samples: samples.slice(0, 20).map((sample) => normalizeId(sample.id)),
    snapshotCount: snapshots.length,
    maturityDays,
    durationRatio,
    autoPublishEvidence,
    shadowEvidenceInjected: Boolean(input.shadowEvidence),
    shadowEvidenceSource: normalizeText(input.shadowEvidence?.source) || null,
    shadowRunPolicy: 'compare_base_adjusted_to_observed_without_runtime_mutation',
    governancePolicy: 'published_rows_only_are_consumed_by_runtime_compensation',
    biasAwareCalibration: biasAware.biasGuardrail,
    auditReplay,
    thresholdEvolutionCandidate,
    policyLearningRecommendation,
    productivityLearningBucket,
  }

  return {
    companyId,
    projectId,
    status,
    actionPolicy,
    windowStartDate,
    windowEndDate,
    windowDays,
    sampleCount: samples.length,
    snapshotCount: snapshots.length,
    maturityDays,
    baseProductivity,
    observedProductivity,
    adjustedProductivity: round(adjustedProductivity),
    biasBefore,
    biasAfter,
    maeBefore,
    maeAfter,
    overcompensationRate,
    recommendedCap,
    recommendedMinUplift,
    parameterPayload,
    evidenceSummary,
  }
}

export async function persistProjectProductivityCalibration(result: ProjectProductivityCalibrationResult) {
  const row = mapResultToRow(result)
  return replaceProjectProductivityCalibrationAtomically(row)
}

export async function runProjectProductivityCalibration(
  input: ProjectProductivityCalibrationInput,
) {
  const result = await buildProjectProductivityCalibration(input)
  if (!result) return null
  const persistedCalibration = await persistProjectProductivityCalibration(result)
  const recommendation = result.parameterPayload.policyLearningRecommendation
  if (recommendation && typeof recommendation === 'object') {
    const companyId = await getProjectCompanyId(result.projectId)
    if (companyId) {
      const policyLearning = policyLearningStateFromCalibrationResult(result)
      await buildAndPersistDurationContextPolicyRecommendation({
        companyId,
        projectId: result.projectId,
        state: policyLearning.state,
        replayEvidence: policyLearning.replayEvidence,
      })
    }
    await persistDurationContextPolicyDecision({
      recommendation: {
        ...(recommendation as any),
        companyId: companyId ?? (recommendation as any).companyId ?? null,
      },
      decisionDate: result.windowEndDate,
      sourceCalibrationId: normalizeId((persistedCalibration as any)?.id),
      metadata: {
        source: 'project_productivity_calibration',
        calibrationStatus: result.status,
        actionPolicy: result.actionPolicy,
        productivityLearningBucket: result.evidenceSummary.productivityLearningBucket,
      },
    })
  }
  return result
}

export {
  loadPublishedProjectProductivityCalibration,
  rollbackPublishedProjectProductivityCalibration,
}
