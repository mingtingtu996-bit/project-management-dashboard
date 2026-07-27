import { describe, expect, it, vi } from 'vitest'

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: vi.fn((resolve: (value: unknown) => unknown) => resolve({ data: [], error: null })),
    })),
  },
}))

import { buildBuildingPatternExecutionProfile } from '../services/buildingPatternExecutionProfileService.js'
import { buildConstructionRhythmExpansion } from '../services/constructionRhythmExpansionService.js'
import { clearAlgorithmSeedResolverCache } from '../services/algorithmSeedResolver.js'

describe('constructionRhythmExpansionService', () => {
  it('turns organization profile modes into backend workface rhythm candidates without rewriting dates', async () => {
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
        standard_task_metadata: {
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
        id: 'basement-a',
        title: 'Basement zone A earthwork excavation handover',
        standard_work_code: '01-02-01-P02',
        building_object_id: 'building-1',
        physical_zone_object_id: 'basement-a',
        section_object_id: 'section-a',
        material_required: true,
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-1', facts, 'task_facts')
    const expansion = buildConstructionRhythmExpansion(profile, facts)

    expect(expansion.metrics.constructionRhythmExpansionCandidateCount).toBeGreaterThanOrEqual(2)
    expect(expansion.metrics.constructionRhythmBackendConsumableCandidateCount).toBeGreaterThanOrEqual(1)
    expect(expansion.metrics.constructionRhythmWorkfaceCandidateCount).toBeGreaterThanOrEqual(3)
    expect(expansion.metrics.constructionRhythmStrategyCount).toBeGreaterThan(0)
    expect(expansion.dominantRhythmUnits).toEqual(expect.arrayContaining(['floor']))
    expect(expansion.mergePolicy).toEqual(expect.objectContaining({
      policy: 'role_layered_scope_merge',
      primaryRhythmUnit: expect.any(String),
      combinedRhythmUnits: expect.arrayContaining(['floor', 'section']),
      cartesianExpansionAllowed: expect.any(Boolean),
    }))
    expect(expansion.mergePolicy.cartesianExpansionGuard).toContain('method variants filter process packages')
    expect(expansion.candidates.every((candidate) => (
      ['candidate_only', 'confidence_only'].includes(candidate.actionPolicy)
    ))).toBe(true)
    expect(expansion.candidates.some((candidate) => (
      candidate.backendConsumable && candidate.actionPolicy === 'candidate_only'
    ))).toBe(true)
    expect(expansion.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patternCode: 'high_rise_core_and_floor_cycle',
        rhythmUnit: 'floor',
        workfaceKeys: expect.arrayContaining(['floor-10', 'floor-11']),
        durationCurveAvailable: true,
      }),
      expect.objectContaining({
        patternCode: 'foundation_pit_to_foundation_sequence',
        rhythmUnit: 'section',
        workfaceKeys: expect.arrayContaining(['section-a']),
      }),
    ]))
  })
})
