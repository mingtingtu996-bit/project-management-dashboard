import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  buildTemplateRecommendation,
  type ProjectGenerationFacts,
} from '../services/projectFactsToTemplateService.js'
import type { BuildingPatternScheduleRuntimeBenchmarkResult } from '../services/buildingPatternScheduleCalibrationService.js'

const loadBuildingPatternScheduleRuntimeBenchmarkResultsMock = vi.hoisted(() => vi.fn())

vi.mock('../services/buildingPatternScheduleBenchmarkEvidenceService.js', () => ({
  loadBuildingPatternScheduleRuntimeBenchmarkResults: loadBuildingPatternScheduleRuntimeBenchmarkResultsMock,
}))

function buildPassingRuntimeBenchmarkResults(): BuildingPatternScheduleRuntimeBenchmarkResult[] {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: 0,
    dependencyPassRate: 0.99,
  }))
}

const residentialFacts: ProjectGenerationFacts = {
  businessType: 'general_civil',
  businessSubtype: 'civil_residential',
  methodVariantCodes: ['cast_in_situ'],
  projectFeatures: {},
  detailLevel: 'standard',
  buildingCount: 3,
  totalAreaM2: 180_000,
  standardFloorCount: 24,
  highestBuildingFloorCount: 26,
  basementLevelCount: 2,
  foundationDepthM: 9,
  structureTypeCode: 'shear_wall',
  prefabRate: 0,
  buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
}

describe('project facts to template schedule trust', () => {
  beforeEach(() => {
    loadBuildingPatternScheduleRuntimeBenchmarkResultsMock.mockReset()
  })

  it('keeps building_pattern candidate-only when runtime benchmark evidence is explicitly absent and promotes it when evidence is supplied', () => {
    const withoutRuntimeEvidence = buildTemplateRecommendation(residentialFacts, {
      runtimeBenchmarkResults: [],
    })

    expect(withoutRuntimeEvidence.buildingPatternScheduleTrust).toEqual(expect.objectContaining({
      trustLevel: 'candidate_only',
      scheduleReadiness: 'needs_real_project_calibration',
      hardDependencyAuthority: false,
      plannedDateWritePolicy: 'never_direct_write',
    }))

    const withRuntimeEvidence = buildTemplateRecommendation(residentialFacts, {
      runtimeBenchmarkResults: buildPassingRuntimeBenchmarkResults(),
    })

    expect(withRuntimeEvidence.buildingPatternScheduleTrust).toEqual(expect.objectContaining({
      trustLevel: 'controlled_schedule_input',
      scheduleReadiness: 'trusted',
      hardDependencyAuthority: false,
      plannedDateWritePolicy: 'never_direct_write',
    }))
  })

  it('uses the official runtime benchmark artifact by default when it is available', () => {
    loadBuildingPatternScheduleRuntimeBenchmarkResultsMock.mockReturnValue(buildPassingRuntimeBenchmarkResults())

    const recommendation = buildTemplateRecommendation(residentialFacts)

    expect(loadBuildingPatternScheduleRuntimeBenchmarkResultsMock).toHaveBeenCalledOnce()

    expect(recommendation.buildingPatternScheduleTrust).toEqual(expect.objectContaining({
      trustLevel: 'controlled_schedule_input',
      scheduleReadiness: 'trusted',
      hardDependencyAuthority: false,
      plannedDateWritePolicy: 'never_direct_write',
    }))
    expect(recommendation.buildingPatternScheduleTrust.calibration).toEqual(expect.objectContaining({
      status: 'golden_benchmark_bound',
      expectedScenarioCount: 13,
    }))
  })
})
