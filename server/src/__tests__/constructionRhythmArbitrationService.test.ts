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

import { clearAlgorithmSeedResolverCache } from '../services/algorithmSeedResolver.js'
import { buildBuildingPatternExecutionProfile } from '../services/buildingPatternExecutionProfileService.js'
import { buildConstructionRhythmArbitration } from '../services/constructionRhythmArbitrationService.js'
import { buildConstructionRhythmExpansion } from '../services/constructionRhythmExpansionService.js'

describe('constructionRhythmArbitrationService', () => {
  it('turns rhythm expansion candidates into backend-only arbitration signals', async () => {
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
        is_executable: true,
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
        status: 'todo',
        is_executable: true,
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
        status: 'todo',
        is_executable: true,
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-1', facts, 'task_facts')
    const expansion = buildConstructionRhythmExpansion(profile, facts)
    const arbitration = buildConstructionRhythmArbitration(profile, expansion, facts)

    expect(arbitration.metrics.constructionRhythmArbitrationSignalCount).toBeGreaterThanOrEqual(3)
    expect(arbitration.metrics.constructionRhythmCandidateDependencySignalCount).toBeGreaterThanOrEqual(1)
    expect(arbitration.metrics.constructionRhythmCandidateEarliestStartSignalCount).toBeGreaterThanOrEqual(1)
    expect(arbitration.metrics.constructionRhythmCandidateDurationContextSignalCount).toBeGreaterThanOrEqual(1)
    expect(arbitration.metrics.constructionRhythmArbitrationScore).toBeGreaterThan(0)
    expect(arbitration.signals.every((signal) => (
      signal.autoApply === false
      && ['candidate_only', 'confidence_only'].includes(signal.actionPolicy)
      && ['candidate_only', 'none'].includes(signal.dependencyPolicy)
      && ['candidate_only', 'confidence_only', 'none'].includes(signal.earliestStartPolicy)
      && ['context_factor_candidate', 'confidence_only', 'none'].includes(signal.durationContextPolicy)
    ))).toBe(true)
    expect(arbitration.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patternCode: 'high_rise_core_and_floor_cycle',
        signalType: 'candidate_duration_context',
        durationContextPolicy: 'context_factor_candidate',
        autoApply: false,
      }),
      expect.objectContaining({
        signalType: 'candidate_dependency',
        dependencyPolicy: 'candidate_only',
        autoApply: false,
      }),
    ]))
    expect(arbitration.signals.every((signal) => signal.autoApply === false)).toBe(true)
  })
})
