import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: vi.fn((resolve: (value: any) => unknown) => resolve({ data: [], error: null })),
    })),
  },
}))

import { clearAlgorithmSeedResolverCache } from '../services/algorithmSeedResolver.js'
import { buildBuildingPatternExecutionPlanCandidates } from '../services/buildingPatternExecutionPlanCandidateService.js'
import { buildBuildingPatternExecutionProfile } from '../services/buildingPatternExecutionProfileService.js'
import { buildConstructionRhythmArbitration } from '../services/constructionRhythmArbitrationService.js'
import { buildConstructionRhythmCoordination } from '../services/constructionRhythmCoordinationService.js'
import { buildConstructionRhythmExpansion } from '../services/constructionRhythmExpansionService.js'

describe('buildingPatternExecutionPlanCandidateService', () => {
  it('builds backend-only recommended/conservative/compressed organization candidates from combined project rhythm modes', async () => {
    clearAlgorithmSeedResolverCache()

    const facts = [
      {
        id: 'floor-10',
        title: 'B1 F10 standard floor concrete casting',
        standard_work_code: '02-01-03-P04',
        template_node_id: 'BDT-04-01-01',
        building_object_id: 'building-1',
        floor_object_id: 'floor-10',
        participant_unit_id: 'unit-structure',
        status: 'in_progress',
        progress: 45,
        standard_task_metadata: {
          crossItemWorkflow: [{ ruleCode: 'rebar_formwork_concrete', dependencyType: 'FS' }],
          projectGenerationFacts: {
            businessType: 'residential',
            structureTypeCode: 'shear_wall',
            methodVariantCodes: ['aluminum_formwork'],
            elementVariantCodes: ['slab'],
          },
        },
      },
      {
        id: 'floor-11',
        title: 'B1 F11 standard floor rebar binding',
        standard_work_code: '02-01-01-P03',
        template_node_id: 'BDT-04-01-01',
        building_object_id: 'building-1',
        floor_object_id: 'floor-11',
        participant_unit_id: 'unit-structure',
        status: 'todo',
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'residential',
            structureTypeCode: 'shear_wall',
            methodVariantCodes: ['aluminum_formwork'],
            elementVariantCodes: ['beam', 'slab'],
          },
        },
      },
      {
        id: 'floor-12',
        title: 'B1 F12 standard floor formwork installation',
        standard_work_code: '02-01-01-P04',
        template_node_id: 'BDT-04-01-01',
        building_object_id: 'building-1',
        floor_object_id: 'floor-12',
        participant_unit_id: 'unit-structure',
        status: 'todo',
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'residential',
            structureTypeCode: 'shear_wall',
            methodVariantCodes: ['aluminum_formwork'],
            elementVariantCodes: ['wall'],
          },
        },
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-1', facts, 'task_facts')
    const expansion = buildConstructionRhythmExpansion(profile, facts)
    const arbitration = buildConstructionRhythmArbitration(profile, expansion, facts)
    const coordination = buildConstructionRhythmCoordination(arbitration, facts)
    const candidates = buildBuildingPatternExecutionPlanCandidates({
      profile,
      expansion,
      arbitration,
      coordination,
      facts,
    })

    expect(candidates.metrics.buildingPatternExecutionPlanCandidateCount).toBeGreaterThanOrEqual(1)
    expect(candidates.metrics.buildingPatternExecutionRecommendedPlanCandidateCount).toBe(1)
    expect(candidates.primaryVariant).toBeTruthy()
    expect(candidates.maxConfidenceScore).toBeGreaterThan(0)
    expect(candidates.candidates.every((candidate) => candidate.autoApply === false)).toBe(true)
    expect(candidates.candidates.every((candidate) => (
      ['candidate_only', 'confidence_only'].includes(candidate.actionPolicy)
    ))).toBe(true)
    expect(candidates.candidates[0]?.modeCodes.length).toBeGreaterThan(0)
    expect(candidates.candidates[0]?.rhythmUnits.length).toBeGreaterThan(0)
  })

  it('emits a low-confidence fallback when the profile cannot support automatic organization assumptions', async () => {
    clearAlgorithmSeedResolverCache()

    const facts = [
      {
        id: 'placeholder',
        title: 'Placeholder task',
        status: 'todo',
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-2', facts, 'task_facts')
    const expansion = buildConstructionRhythmExpansion(profile, facts)
    const arbitration = buildConstructionRhythmArbitration(profile, expansion, facts)
    const coordination = buildConstructionRhythmCoordination(arbitration, facts)
    const candidates = buildBuildingPatternExecutionPlanCandidates({
      profile,
      expansion,
      arbitration,
      coordination,
      facts,
    })

    expect(candidates.metrics.buildingPatternExecutionLowConfidencePlanCandidateCount).toBeGreaterThanOrEqual(1)
    expect(candidates.candidates.some((candidate) => candidate.variant === 'low_confidence')).toBe(true)
    expect(candidates.candidates.some((candidate) => (
      candidate.variant === 'low_confidence' && candidate.actionPolicy === 'confidence_only'
    ))).toBe(true)
    expect(candidates.candidates.every((candidate) => candidate.autoApply === false)).toBe(true)
  })
})
