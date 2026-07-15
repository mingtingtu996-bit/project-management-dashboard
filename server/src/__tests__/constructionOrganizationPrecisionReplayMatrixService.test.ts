import { describe, expect, it } from 'vitest'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'

const EXPECTED_BUSINESS_TYPES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
] as const

describe('constructionOrganizationPrecisionReplayMatrixService', () => {
  it('replays every supported business type through selector projection comparison and E1 E3 E5 candidate evidence', () => {
    const matrix = buildConstructionOrganizationPrecisionReplayMatrix()

    expect(matrix).toEqual(expect.objectContaining({
      source: 'construction_organization_precision_replay_matrix',
      status: 'precision_replay_matrix_ready',
      supportedBusinessTypeCount: EXPECTED_BUSINESS_TYPES.length,
      replayedBusinessTypeCount: EXPECTED_BUSINESS_TYPES.length,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesBaseline: false,
        writesSeed: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(matrix.businessTypes.map((row) => row.businessType).sort()).toEqual([...EXPECTED_BUSINESS_TYPES].sort())

    for (const row of matrix.businessTypes) {
      expect(row.status, row.businessType).toBe('precision_replay_ready')
      expect(row.policy.schemeFamily, row.businessType).toEqual(expect.any(String))
      expect(row.optionCount, row.businessType).toBeGreaterThanOrEqual(2)
      expect(row.generatedRowProjection.projectedOptionCount, row.businessType).toBe(row.optionCount)
      expect(row.generatedRowProjection.matchedOptionCount, row.businessType).toBe(row.optionCount)
      expect(row.generatedRowProjection.previewEdgeCount, row.businessType).toBeGreaterThan(0)
      expect(row.generatedRowProjection.unresolvedEdgeCount, row.businessType).toBe(0)
      expect(row.recommendations.newProjectPlanning.optionId, row.businessType).toEqual(expect.any(String))
      expect(row.recommendations.startingLineOnboarding.optionId, row.businessType).toEqual(expect.any(String))
      expect(row.recommendations.accelerationRecovery.optionId, row.businessType).toEqual(expect.any(String))
      expect(row.engineEvidence.e1.matchedReferenceRowCount, row.businessType).toBeGreaterThan(0)
      expect(row.engineEvidence.e3.previewEdgeCount, row.businessType).toBeGreaterThan(0)
      expect(row.engineEvidence.e5.e5RecoverableSpanDays, row.businessType).toBeGreaterThanOrEqual(0)
      expect(row.comparisonPackage.totalOptionCount, row.businessType).toBe(row.optionCount)
      expect(row.comparisonPackage.options.every((option) => (
        option.systemRecommendationBasis.boundaryPolicy.candidateOnly
          && option.systemRecommendationBasis.boundaryPolicy.readOnlyRecommendation
          && option.systemRecommendationBasis.boundaryPolicy.writesTaskDependencies === false
          && option.systemRecommendationBasis.boundaryPolicy.writesPlanDates === false
          && option.useCaseScores.newProjectPlanning?.rankBasis.includes('generated_row_projection_evaluated')
          && option.useCaseScores.startingLineOnboarding?.rankBasis.includes('generated_row_projection_evaluated')
          && option.useCaseScores.accelerationRecovery?.rankBasis.includes('generated_row_projection_evaluated')
      )), row.businessType).toBe(true)
      expect(row.missingReasons, row.businessType).toEqual([])
    }
  })

  it('proves every use-case recommendation selects the highest-scoring comparable option after projection', () => {
    const matrix = buildConstructionOrganizationPrecisionReplayMatrix()

    for (const row of matrix.businessTypes) {
      expect(row.automaticOptionSelectionProof?.status, row.businessType).toBe('automatic_option_selection_verified')

      for (const useCase of ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'] as const) {
        const proof = row.automaticOptionSelectionProof.useCases[useCase]
        const recommendedOptionId = row.recommendations[useCase].optionId

        expect(proof, `${row.businessType}:${useCase}`).toEqual(expect.objectContaining({
          source: 'construction_organization_automatic_option_selection_proof',
          useCase,
          status: 'verified',
          selectedOptionId: recommendedOptionId,
          bestOptionId: recommendedOptionId,
          candidateCount: row.optionCount,
          selectedScore: expect.any(Number),
          bestScore: expect.any(Number),
          tiePolicy: 'first_highest_score_after_projection',
          mutationBoundary: expect.objectContaining({
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesCriticalPathFacts: false,
            writesAccelerationDraft: false,
          }),
        }))
        expect(proof.selectedScore, `${row.businessType}:${useCase}`).toBe(proof.bestScore)
        expect(proof.rankBasis, `${row.businessType}:${useCase}`).toContain('generated_row_projection_evaluated')
        expect(proof.mismatchReasons, `${row.businessType}:${useCase}`).toEqual([])
      }
    }
  })
})
