import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  loadBuildingPatternScheduleRuntimeBenchmarkResults,
} from '../services/buildingPatternScheduleBenchmarkEvidenceService.js'
import type { WbsTemplateGoldenBenchmarkRunResult } from '../services/wbsTemplateGoldenBenchmarkGateService.js'

function buildPassingRuntimeResults(): WbsTemplateGoldenBenchmarkRunResult[] {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    durationOutputSummary: {
      planReferenceRowCount: 10,
      templateFastEstimateRowCount: 0,
      contextualReferenceRowCount: 0,
      writablePlanTaskDurationRowCount: 10,
    },
    generatedRowCount: Math.round(((entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[0] + (entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[1]) / 2),
    coverageRate: 1,
    deepCoverageRate: 0.95,
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    expectedRuntimeReplayRowCountRange: entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange,
    actualScheduleStartDate: '2026-01-01',
    actualScheduleEndDate: '2026-12-31',
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: 0,
    dependencyPassRate: 0.99,
    missingRequiredTemplateIds: [],
    missingStableCodePrefixes: [],
  }))
}

describe('building pattern schedule benchmark evidence service', () => {
  it('loads only runtime benchmark evidence that passes the golden gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-building-pattern-evidence-'))
    const artifactPath = join(dir, 'runtime-results.json')
    try {
      const passingResults = buildPassingRuntimeResults()
      writeFileSync(artifactPath, JSON.stringify(passingResults), 'utf8')

      expect(loadBuildingPatternScheduleRuntimeBenchmarkResults({ artifactPath })).toHaveLength(13)

      const failingResults = buildPassingRuntimeResults()
      failingResults[0] = {
        ...failingResults[0]!,
        durationDeviationRatio: 0.5,
      }
      writeFileSync(artifactPath, JSON.stringify(failingResults), 'utf8')

      expect(loadBuildingPatternScheduleRuntimeBenchmarkResults({ artifactPath })).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null when no runtime benchmark artifact exists', () => {
    const missingPath = join(tmpdir(), `missing-building-pattern-runtime-${Date.now()}.json`)

    expect(loadBuildingPatternScheduleRuntimeBenchmarkResults({ artifactPath: missingPath })).toBeNull()
  })
})
