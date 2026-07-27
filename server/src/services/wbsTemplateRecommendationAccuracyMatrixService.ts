import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  PRODUCT_BUSINESS_TYPE_CODES,
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
  type WbsTemplateProjectRecommendationKey,
} from './projectScenarioTaxonomyService.js'
import {
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  type WbsTemplateGoldenBenchmarkRunResult,
} from './wbsTemplateGoldenBenchmarkGateService.js'
import type { BusinessTypeCode } from './projectTypeRecommendations.js'

export const WBS_TEMPLATE_RECOMMENDATION_ACCURACY_MATRIX_VERSION =
  'v1.4.22.1-recommendation-accuracy-matrix-20260614'

export type WbsTemplateRecommendationAccuracyMatrixStatus =
  | 'commercial_ready'
  | 'needs_calibration_evidence'
  | 'blocked'

export type WbsTemplateRecommendationAccuracyEntryStatus =
  | 'commercial_ready'
  | 'candidate_only'
  | 'blocked'

export type WbsTemplateRecommendationAccuracyStatus =
  | 'within_commercial_threshold'
  | 'needs_runtime_benchmark_evidence'
  | 'failed_runtime_benchmark'

export type WbsTemplateRecommendationCalibrationAction =
  | 'none'
  | 'collect_runtime_benchmark_evidence'
  | 'open_calibration_review'

export type WbsTemplateRecommendationAccuracyEntry = {
  projectCode: string
  projectName: string
  recommendationKey: WbsTemplateProjectRecommendationKey
  status: WbsTemplateRecommendationAccuracyEntryStatus
  accuracyStatus: WbsTemplateRecommendationAccuracyStatus
  calibrationAction: WbsTemplateRecommendationCalibrationAction
  expectedDurationDaysRange: [number, number]
  actualScheduleDurationDays: number | null
  durationDeviationRatio: number | null
  dependencyPassRate: number | null
  coverageRate: number | null
  deepCoverageRate: number | null
  reasonCodes: string[]
}

export type WbsTemplateRecommendationAccuracyMatrix = {
  version: typeof WBS_TEMPLATE_RECOMMENDATION_ACCURACY_MATRIX_VERSION
  status: WbsTemplateRecommendationAccuracyMatrixStatus
  expectedScenarioCount: number
  observedScenarioCount: number
  expectedRecommendationPackCount: number
  requiredBusinessTypeCodes: readonly BusinessTypeCode[]
  requiredRecommendationPacks: readonly WbsTemplateProjectRecommendationKey[]
  segmentationAxes: [
    'recommendation_pack',
    'business_type',
    'building_pattern',
    'scale_band',
    'method_variant',
  ]
  thresholds: typeof WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS
  calibrationPolicy: 'replay_gate_only_no_direct_parameter_tuning'
  entries: WbsTemplateRecommendationAccuracyEntry[]
  calibrationQueue: {
    missingRuntimeEvidenceRecommendationPacks: WbsTemplateProjectRecommendationKey[]
    failedRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  }
  boundaryPolicy: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function buildReasonCodes(result: WbsTemplateGoldenBenchmarkRunResult | null) {
  if (!result) return ['runtime_benchmark_evidence_missing']

  const reasonCodes: string[] = []
  if (!Number.isFinite(result.actualScheduleDurationDays) || Number(result.actualScheduleDurationDays) <= 0) {
    reasonCodes.push('schedule_duration_evidence_missing')
  }
  if (
    !Number.isFinite(result.durationDeviationRatio)
    || Math.abs(Number(result.durationDeviationRatio)) > WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio
  ) {
    reasonCodes.push('duration_deviation_above_threshold')
  }
  if (
    !Number.isFinite(result.dependencyPassRate)
    || Number(result.dependencyPassRate) < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate
  ) {
    reasonCodes.push('dependency_pass_rate_below_threshold')
  }
  if (
    !Number.isFinite(result.coverageRate)
    || Number(result.coverageRate) < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate
  ) {
    reasonCodes.push('coverage_rate_below_threshold')
  }
  if (
    !Number.isFinite(result.deepCoverageRate)
    || Number(result.deepCoverageRate) < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate
  ) {
    reasonCodes.push('deep_coverage_rate_below_threshold')
  }
  if ((result.missingRequiredTemplateIds?.length ?? 0) > 0) reasonCodes.push('missing_required_templates')
  if ((result.missingStableCodePrefixes?.length ?? 0) > 0) reasonCodes.push('missing_stable_code_prefixes')

  return reasonCodes.length > 0
    ? unique(reasonCodes)
    : ['scenario_accuracy_within_commercial_threshold']
}

function buildEntry(
  matrixEntry: typeof WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[number],
  result: WbsTemplateGoldenBenchmarkRunResult | null,
): WbsTemplateRecommendationAccuracyEntry {
  const reasonCodes = buildReasonCodes(result)
  const missingEvidence = !result
  const failed = !missingEvidence && reasonCodes.some((code) => code !== 'scenario_accuracy_within_commercial_threshold')
  const accuracyStatus: WbsTemplateRecommendationAccuracyStatus = missingEvidence
    ? 'needs_runtime_benchmark_evidence'
    : failed
      ? 'failed_runtime_benchmark'
      : 'within_commercial_threshold'
  const status: WbsTemplateRecommendationAccuracyEntryStatus = accuracyStatus === 'within_commercial_threshold'
    ? 'commercial_ready'
    : accuracyStatus === 'failed_runtime_benchmark'
      ? 'blocked'
      : 'candidate_only'
  const calibrationAction: WbsTemplateRecommendationCalibrationAction = accuracyStatus === 'within_commercial_threshold'
    ? 'none'
    : accuracyStatus === 'failed_runtime_benchmark'
      ? 'open_calibration_review'
      : 'collect_runtime_benchmark_evidence'

  return {
    projectCode: matrixEntry.projectCode,
    projectName: matrixEntry.projectName,
    recommendationKey: matrixEntry.recommendationKey,
    status,
    accuracyStatus,
    calibrationAction,
    expectedDurationDaysRange: matrixEntry.expectedDurationDaysRange,
    actualScheduleDurationDays: result ? readFiniteNumber(result.actualScheduleDurationDays) : null,
    durationDeviationRatio: result ? readFiniteNumber(result.durationDeviationRatio) : null,
    dependencyPassRate: result ? readFiniteNumber(result.dependencyPassRate) : null,
    coverageRate: result ? readFiniteNumber(result.coverageRate) : null,
    deepCoverageRate: result ? readFiniteNumber(result.deepCoverageRate) : null,
    reasonCodes,
  }
}

export function buildWbsTemplateRecommendationAccuracyMatrix(
  results: readonly WbsTemplateGoldenBenchmarkRunResult[] = [],
): WbsTemplateRecommendationAccuracyMatrix {
  const resultByProjectCode = new Map(
    results.map((result) => [normalizeText(result.projectCode), result]),
  )
  const entries = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((matrixEntry) => (
    buildEntry(matrixEntry, resultByProjectCode.get(matrixEntry.projectCode) ?? null)
  ))
  const missingRuntimeEvidenceRecommendationPacks = entries
    .filter((entry) => entry.accuracyStatus === 'needs_runtime_benchmark_evidence')
    .map((entry) => entry.recommendationKey)
  const failedRecommendationPacks = entries
    .filter((entry) => entry.accuracyStatus === 'failed_runtime_benchmark')
    .map((entry) => entry.recommendationKey)
  const status: WbsTemplateRecommendationAccuracyMatrixStatus = failedRecommendationPacks.length > 0
    ? 'blocked'
    : missingRuntimeEvidenceRecommendationPacks.length > 0
      ? 'needs_calibration_evidence'
      : 'commercial_ready'

  return {
    version: WBS_TEMPLATE_RECOMMENDATION_ACCURACY_MATRIX_VERSION,
    status,
    expectedScenarioCount: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount,
    observedScenarioCount: results.length,
    expectedRecommendationPackCount: REAL_PROJECT_RECOMMENDATION_PACK_KEYS.length,
    requiredBusinessTypeCodes: PRODUCT_BUSINESS_TYPE_CODES,
    requiredRecommendationPacks: REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
    segmentationAxes: [
      'recommendation_pack',
      'business_type',
      'building_pattern',
      'scale_band',
      'method_variant',
    ],
    thresholds: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
    calibrationPolicy: 'replay_gate_only_no_direct_parameter_tuning',
    entries,
    calibrationQueue: {
      missingRuntimeEvidenceRecommendationPacks: unique(missingRuntimeEvidenceRecommendationPacks),
      failedRecommendationPacks: unique(failedRecommendationPacks),
    },
    boundaryPolicy: [
      'accuracy_matrix_controls_commercial_readiness_not_direct_parameter_tuning',
      'failed_or_missing_packs_remain_candidate_only_until_replay_passes',
      'calibration_candidates_must_enter_algorithm_asset_governance_before_runtime_effect',
    ],
  }
}
