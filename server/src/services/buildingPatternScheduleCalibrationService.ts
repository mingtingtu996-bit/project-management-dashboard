import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import { BUSINESS_TYPE_RECOMMENDATIONS, type BusinessTypeCode } from './projectTypeRecommendations.js'
import type { WbsTemplateProjectRecommendationKey } from './projectScenarioTaxonomyService.js'

export const BUILDING_PATTERN_SCHEDULE_CALIBRATION_SOURCE = 'wbs_template_golden_benchmark_gate' as const

export const BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS = {
  expectedScenarioCount: 13,
  maximumDurationDeviationRatio: 0.15,
  minimumDependencyPassRate: 0.95,
} as const

export type BuildingPatternScheduleCalibrationStatus =
  | 'golden_benchmark_bound'
  | 'needs_golden_benchmark_binding'
  | 'needs_runtime_benchmark_evidence'
  | 'runtime_benchmark_failed'

export type BuildingPatternScheduleRuntimeBenchmarkResult = {
  projectCode: string
  recommendationKey: WbsTemplateProjectRecommendationKey | string
  durationOutputCode?: string | null
  expectedDurationDaysRange?: [number, number] | null
  actualScheduleDurationDays?: number | null
  durationDeviationRatio: number
  dependencyPassRate: number
}

export type BuildingPatternScheduleCalibrationCoverage = {
  status: BuildingPatternScheduleCalibrationStatus
  source: typeof BUILDING_PATTERN_SCHEDULE_CALIBRATION_SOURCE
  expectedScenarioCount: typeof BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.expectedScenarioCount
  maximumDurationDeviationRatio: typeof BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.maximumDurationDeviationRatio
  minimumDependencyPassRate: typeof BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.minimumDependencyPassRate
  requiredBusinessTypeCodes: BusinessTypeCode[]
  requiredRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  coveredRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  matchedRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  unmatchedRecommendationPacks: string[]
  missingRecommendationPacks: WbsTemplateProjectRecommendationKey[]
  runtimeEvidence: {
    scenarioCount: number
    failedScenarioCodes: string[]
    maxAbsDurationDeviationRatio: number | null
    minDependencyPassRate: number | null
  }
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean) as T[])]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function resolveBuildingPatternScheduleCalibrationCoverage(params: {
  recommendationPacks?: readonly (WbsTemplateProjectRecommendationKey | string)[] | null
  runtimeResults?: readonly BuildingPatternScheduleRuntimeBenchmarkResult[] | null
} = {}): BuildingPatternScheduleCalibrationCoverage {
  const requiredBusinessTypeCodes = uniqueStrings(Object.keys(BUSINESS_TYPE_RECOMMENDATIONS) as BusinessTypeCode[])
  const requiredRecommendationPacks = uniqueStrings(
    WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => entry.recommendationKey),
  )
  const coveredRecommendationPacks = requiredRecommendationPacks.filter((pack) => (
    WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.some((entry) => entry.recommendationKey === pack)
  ))
  const missingRecommendationPacks = requiredRecommendationPacks.filter((pack) => (
    !coveredRecommendationPacks.includes(pack)
  ))
  const requestedPacks = uniqueStrings((params.recommendationPacks ?? []).map((pack) => normalizeText(pack)))
  const matchedRecommendationPacks = requestedPacks
    .filter((pack): pack is WbsTemplateProjectRecommendationKey => (
      coveredRecommendationPacks.includes(pack as WbsTemplateProjectRecommendationKey)
    ))
  const unmatchedRecommendationPacks = requestedPacks.filter((pack) => (
    !coveredRecommendationPacks.includes(pack as WbsTemplateProjectRecommendationKey)
  ))
  const scenarioCountReady = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.length
    === BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.expectedScenarioCount
  const runtimeResults = params.runtimeResults ?? []
  const runtimeByProjectCode = new Map(runtimeResults.map((result) => [normalizeText(result.projectCode), result]))
  const runtimeScenarioCount = runtimeResults.length
  const failedScenarioCodes = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX
    .filter((entry) => {
      const result = runtimeByProjectCode.get(entry.projectCode)
      if (!result) return true
      if (normalizeText(result.recommendationKey) !== entry.recommendationKey) return true
      if (result.durationOutputCode !== 'plan_reference') return true
      if (!Array.isArray(result.expectedDurationDaysRange)) return true
      if (
        result.expectedDurationDaysRange[0] !== entry.expectedDurationDaysRange[0]
        || result.expectedDurationDaysRange[1] !== entry.expectedDurationDaysRange[1]
      ) return true
      if (!Number.isFinite(result.actualScheduleDurationDays) || Number(result.actualScheduleDurationDays) <= 0) return true
      if (!Number.isFinite(result.durationDeviationRatio)) return true
      if (Math.abs(result.durationDeviationRatio) > BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.maximumDurationDeviationRatio) return true
      if (!Number.isFinite(result.dependencyPassRate) || result.dependencyPassRate < BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.minimumDependencyPassRate) return true
      return false
    })
    .map((entry) => entry.projectCode)
  const durationDeviationValues = runtimeResults
    .map((result) => Math.abs(Number(result.durationDeviationRatio)))
    .filter((value) => Number.isFinite(value))
  const dependencyPassRates = runtimeResults
    .map((result) => Number(result.dependencyPassRate))
    .filter((value) => Number.isFinite(value))
  const staticCoverageReady = scenarioCountReady
    && requiredBusinessTypeCodes.length === 11
    && missingRecommendationPacks.length === 0
    && unmatchedRecommendationPacks.length === 0
  let status: BuildingPatternScheduleCalibrationStatus = 'needs_golden_benchmark_binding'
  if (staticCoverageReady && runtimeScenarioCount === 0) {
    status = 'needs_runtime_benchmark_evidence'
  } else if (staticCoverageReady && (
    runtimeScenarioCount !== BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.expectedScenarioCount
    || failedScenarioCodes.length > 0
  )) {
    status = 'runtime_benchmark_failed'
  } else if (staticCoverageReady) {
    status = 'golden_benchmark_bound'
  }

  return {
    status,
    source: BUILDING_PATTERN_SCHEDULE_CALIBRATION_SOURCE,
    expectedScenarioCount: BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.expectedScenarioCount,
    maximumDurationDeviationRatio: BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.maximumDurationDeviationRatio,
    minimumDependencyPassRate: BUILDING_PATTERN_SCHEDULE_CALIBRATION_THRESHOLDS.minimumDependencyPassRate,
    requiredBusinessTypeCodes,
    requiredRecommendationPacks,
    coveredRecommendationPacks,
    matchedRecommendationPacks,
    unmatchedRecommendationPacks,
    missingRecommendationPacks,
    runtimeEvidence: {
      scenarioCount: runtimeScenarioCount,
      failedScenarioCodes,
      maxAbsDurationDeviationRatio: durationDeviationValues.length > 0 ? Math.max(...durationDeviationValues) : null,
      minDependencyPassRate: dependencyPassRates.length > 0 ? Math.min(...dependencyPassRates) : null,
    },
  }
}
