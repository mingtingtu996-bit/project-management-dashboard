import { describe, expect, it } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  buildWbsTemplateRecommendationAccuracyMatrix,
} from '../services/wbsTemplateRecommendationAccuracyMatrixService.js'
import {
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  type WbsTemplateGoldenBenchmarkRunResult,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'
import {
  PRODUCT_BUSINESS_TYPE_CODES,
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
} from '../services/projectScenarioTaxonomyService.js'

function buildPassingRuntimeResults(): WbsTemplateGoldenBenchmarkRunResult[] {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    durationOutputSummary: {
      planReferenceRowCount: 1,
      templateFastEstimateRowCount: 0,
      contextualReferenceRowCount: 1,
      writablePlanTaskDurationRowCount: 1,
    },
    generatedRowCount: (entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[0],
    coverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate,
    deepCoverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate,
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    expectedRuntimeReplayRowCountRange: entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange,
    actualScheduleStartDate: '2026-06-01',
    actualScheduleEndDate: '2028-12-31',
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: 0,
    dependencyPassRate: 0.99,
    missingRequiredTemplateIds: [],
    missingStableCodePrefixes: [],
  }))
}

describe('wbs template recommendation accuracy matrix service', () => {
  it('marks all recommendation packs commercial-ready when every replay scenario passes accuracy thresholds', () => {
    const matrix = buildWbsTemplateRecommendationAccuracyMatrix(buildPassingRuntimeResults())

    expect(matrix).toEqual(expect.objectContaining({
      status: 'commercial_ready',
      expectedScenarioCount: 13,
      observedScenarioCount: 13,
      expectedRecommendationPackCount: 13,
      requiredBusinessTypeCodes: PRODUCT_BUSINESS_TYPE_CODES,
      requiredRecommendationPacks: REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
      segmentationAxes: [
        'recommendation_pack',
        'business_type',
        'building_pattern',
        'scale_band',
        'method_variant',
      ],
      calibrationPolicy: 'replay_gate_only_no_direct_parameter_tuning',
    }))
    expect(matrix.entries).toHaveLength(13)
    expect(matrix.entries.every((entry) => entry.status === 'commercial_ready')).toBe(true)
    expect(matrix.entries.every((entry) => entry.accuracyStatus === 'within_commercial_threshold')).toBe(true)
    expect(matrix.calibrationQueue).toEqual({
      missingRuntimeEvidenceRecommendationPacks: [],
      failedRecommendationPacks: [],
    })
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'accuracy_matrix_controls_commercial_readiness_not_direct_parameter_tuning',
      'failed_or_missing_packs_remain_candidate_only_until_replay_passes',
    ]))
  })

  it('keeps a recommendation pack candidate-only when its runtime replay sample is missing', () => {
    const results = buildPassingRuntimeResults().filter((result) => result.recommendationKey !== 'campus')
    const matrix = buildWbsTemplateRecommendationAccuracyMatrix(results)
    const campus = matrix.entries.find((entry) => entry.recommendationKey === 'campus')

    expect(matrix.status).toBe('needs_calibration_evidence')
    expect(campus).toEqual(expect.objectContaining({
      status: 'candidate_only',
      accuracyStatus: 'needs_runtime_benchmark_evidence',
      calibrationAction: 'collect_runtime_benchmark_evidence',
      reasonCodes: expect.arrayContaining(['runtime_benchmark_evidence_missing']),
    }))
    expect(matrix.calibrationQueue.missingRuntimeEvidenceRecommendationPacks).toEqual(['campus'])
  })

  it('blocks commercial readiness for a recommendation pack when duration or dependency accuracy fails', () => {
    const results = buildPassingRuntimeResults()
    const dataCenterIndex = results.findIndex((result) => result.recommendationKey === 'data_center')
    results[dataCenterIndex] = {
      ...results[dataCenterIndex],
      durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio + 0.01,
      dependencyPassRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate - 0.01,
    }

    const matrix = buildWbsTemplateRecommendationAccuracyMatrix(results)
    const dataCenter = matrix.entries.find((entry) => entry.recommendationKey === 'data_center')

    expect(matrix.status).toBe('blocked')
    expect(dataCenter).toEqual(expect.objectContaining({
      status: 'blocked',
      accuracyStatus: 'failed_runtime_benchmark',
      calibrationAction: 'open_calibration_review',
      reasonCodes: expect.arrayContaining([
        'duration_deviation_above_threshold',
        'dependency_pass_rate_below_threshold',
      ]),
    }))
    expect(matrix.calibrationQueue.failedRecommendationPacks).toEqual(['data_center'])
  })
})
