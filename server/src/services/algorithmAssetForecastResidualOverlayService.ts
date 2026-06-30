import {
  evaluateAlgorithmAssetReplay,
  type AlgorithmAssetReplayEvaluation,
  type AlgorithmAssetReplaySample,
} from './algorithmAssetReplayService.js'
import {
  persistAlgorithmAssetForecastResidualOverlayEvaluation,
  rollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationRecord,
  type AlgorithmAssetGovernanceQueryExec,
  type PersistAlgorithmAssetForecastResidualOverlayEvaluationResult,
  type RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult,
} from './algorithmAssetGovernancePersistenceService.js'
import type {
  AlgorithmAssetAutomationMaturity,
  AlgorithmAssetLearningMaturity,
  AlgorithmAssetPublishAnchor,
} from './algorithmAssetGovernanceProtocolService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

const FORECAST_RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT = 5
const FORECAST_RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT = 10

export type AlgorithmAssetForecastResidualSample = {
  sampleId: string
  companyId?: string | null
  projectId?: string | null
  originalForecastFinishDate?: string | null
  overlayForecastFinishDate?: string | null
  actualFinishDate?: string | null
}

export type AlgorithmAssetForecastResidualOverlayInput = {
  assetKey: string
  companyId?: string | null
  projectId?: string | null
  modelKey: string
  modelVersion: string
  learningMaturity: AlgorithmAssetLearningMaturity
  publishAnchor: AlgorithmAssetPublishAnchor
  automationMaturity: AlgorithmAssetAutomationMaturity
  rollbackTarget?: string | null
  conflictFree?: boolean
  samples: AlgorithmAssetForecastResidualSample[]
  minAcceptedSamples?: number
  maxOvercompensationRate?: number
  minMaeImprovement?: number
}

export type AlgorithmAssetForecastResidualOverlayWrite = {
  targetTable: 'duration_forecast_residual_overlays'
  writeMode: 'published_overlay' | 'candidate_overlay_only' | 'shadow_report_only'
  canWriteRuntimeOverlay: boolean
  canWriteBaseDurationSeed: false
  learningTarget: 'forecast_residual'
  forbiddenWriteTargets: string[]
}

export type AlgorithmAssetForecastResidualOverlayEvaluation = AlgorithmAssetReplayEvaluation & {
  overlayWrite: AlgorithmAssetForecastResidualOverlayWrite
}

export type EvaluateAndPersistAlgorithmAssetForecastResidualOverlayInput =
  AlgorithmAssetForecastResidualOverlayInput & {
    overlayKey: string
    queryExec?: AlgorithmAssetGovernanceQueryExec
  }

export type EvaluateAndPersistAlgorithmAssetForecastResidualOverlayResult = {
  evaluation: AlgorithmAssetForecastResidualOverlayEvaluation
  persistence: PersistAlgorithmAssetForecastResidualOverlayEvaluationResult
}

export type RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationInput = {
  overlayKey: string
  rollbackTarget: string
  reason: string
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

function forecastDay(value: string | null | undefined) {
  const day = signedDurationDayDelta('1970-01-01', value)
  return day === null ? Number.NaN : day
}

function mean(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}

function defaultMinAcceptedSamplesForForecastResidualOverlay(input: AlgorithmAssetForecastResidualOverlayInput) {
  if (String(input.projectId ?? '').trim()) return FORECAST_RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT
  if (String(input.companyId ?? '').trim()) return FORECAST_RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT
  return FORECAST_RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT
}

function toReplaySample(sample: AlgorithmAssetForecastResidualSample): AlgorithmAssetReplaySample {
  return {
    sampleId: sample.sampleId,
    companyId: sample.companyId,
    projectId: sample.projectId,
    originalPrediction: forecastDay(sample.originalForecastFinishDate),
    overlayPrediction: forecastDay(sample.overlayForecastFinishDate),
    actual: forecastDay(sample.actualFinishDate),
  }
}

function overlayWriteFor(replay: AlgorithmAssetReplayEvaluation): AlgorithmAssetForecastResidualOverlayWrite {
  const writeMode: AlgorithmAssetForecastResidualOverlayWrite['writeMode'] = replay.summary.runtimeImpact === 'publish_gate_evidence'
    ? 'published_overlay'
    : replay.summary.runtimeImpact === 'shadow_report_only'
      ? 'shadow_report_only'
      : 'candidate_overlay_only'

  return {
    targetTable: 'duration_forecast_residual_overlays',
    writeMode,
    canWriteRuntimeOverlay: writeMode === 'published_overlay',
    canWriteBaseDurationSeed: false,
    learningTarget: 'forecast_residual',
    forbiddenWriteTargets: [
      'standard_work_duration',
      'algorithm_seed_records',
      'algorithm_seed_versions',
      'base_duration_seed',
    ],
  }
}

function buildCandidatePayload(input: AlgorithmAssetForecastResidualOverlayInput) {
  const replaySamples = input.samples.map(toReplaySample)
  const correctionDays = replaySamples.map((sample) => sample.overlayPrediction - sample.originalPrediction)
  return {
    modelKey: input.modelKey,
    modelVersion: input.modelVersion,
    residualCorrectionDays: mean(correctionDays),
    confidenceAdjustment: 0,
    targetTable: 'duration_forecast_residual_overlays',
    forbiddenBaseSeedMutation: true,
  }
}

function confidenceAdjustmentFrom(replay: AlgorithmAssetReplayEvaluation) {
  const originalMae = replay.summary.originalMae
  const maeImprovement = replay.summary.maeImprovement
  if (!originalMae || maeImprovement === null) return 0
  return Math.max(-1, Math.min(1, maeImprovement / originalMae))
}

export function evaluateAlgorithmAssetForecastResidualOverlay(
  input: AlgorithmAssetForecastResidualOverlayInput,
): AlgorithmAssetForecastResidualOverlayEvaluation {
  const minAcceptedSamples = input.minAcceptedSamples ?? defaultMinAcceptedSamplesForForecastResidualOverlay(input)
  const replay = evaluateAlgorithmAssetReplay({
    candidate: {
      assetKey: input.assetKey,
      sourceSystem: 'taskDurationForecastService',
      assetType: 'calibration',
      companyId: input.companyId,
      projectId: input.projectId,
      candidatePayload: buildCandidatePayload(input),
      learningTarget: 'forecast_residual',
      learningMaturity: input.learningMaturity,
      publishAnchor: input.publishAnchor,
      automationMaturity: input.automationMaturity,
      requestedRuntimeEffect: 'bounded_calibration',
    },
    samples: input.samples.map(toReplaySample),
    minAcceptedSamples,
    maxOvercompensationRate: input.maxOvercompensationRate,
    minMaeImprovement: input.minMaeImprovement,
    rollbackTarget: input.rollbackTarget,
    conflictFree: input.conflictFree,
  })

  replay.candidateEvent.candidatePayload = {
    ...(replay.candidateEvent.candidatePayload as Record<string, unknown>),
    meanOriginalErrorDays: replay.summary.originalMae,
    meanOverlayErrorDays: replay.summary.overlayMae,
    maeImprovementDays: replay.summary.maeImprovement,
    overcompensationRate: replay.summary.overcompensationRate,
    confidenceAdjustment: confidenceAdjustmentFrom(replay),
    sampleCount: replay.summary.acceptedSampleCount,
    minAcceptedSamples,
  }
  if (replay.summary.acceptedSampleCount < minAcceptedSamples) {
    replay.candidateEvent.governanceDecision.reasons.push(
      'forecast_residual_overlay_runtime_sample_gate_not_met',
    )
  }
  replay.candidateEvent.governanceDecision.reasons.push(
    'forecast_residual_overlay_does_not_modify_standard_work_duration_seed',
  )

  return {
    ...replay,
    overlayWrite: overlayWriteFor(replay),
  }
}

export async function evaluateAndPersistAlgorithmAssetForecastResidualOverlay(
  input: EvaluateAndPersistAlgorithmAssetForecastResidualOverlayInput,
): Promise<EvaluateAndPersistAlgorithmAssetForecastResidualOverlayResult> {
  const evaluation = evaluateAlgorithmAssetForecastResidualOverlay(input)
  const persistence = await persistAlgorithmAssetForecastResidualOverlayEvaluation({
    overlayKey: input.overlayKey,
    evaluation,
    queryExec: input.queryExec,
  })

  return {
    evaluation,
    persistence,
  }
}

export async function rollbackAlgorithmAssetForecastResidualOverlayRuntimePublication(
  input: RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationInput,
): Promise<RollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationResult> {
  return rollbackAlgorithmAssetForecastResidualOverlayRuntimePublicationRecord(input)
}
