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
import { buildConstructionRhythmCoordination } from '../services/constructionRhythmCoordinationService.js'
import { buildConstructionRhythmExpansion } from '../services/constructionRhythmExpansionService.js'

describe('constructionRhythmCoordinationService', () => {
  it('coordinates rhythm arbitration signals with existing schedule-rule channels without auto applying them', async () => {
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
        planned_quantity: 100,
        completed_quantity: 45,
        material_required: true,
        acceptance_required: true,
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
        material_required: true,
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
        participant_unit_id: 'unit-earthwork',
        condition_status: 'pending',
        status: 'todo',
      },
    ]

    const profile = await buildBuildingPatternExecutionProfile('project-1', facts, 'task_facts')
    const expansion = buildConstructionRhythmExpansion(profile, facts)
    const arbitration = buildConstructionRhythmArbitration(profile, expansion, facts)
    const coordination = buildConstructionRhythmCoordination(arbitration, facts)

    expect(coordination.metrics.constructionRhythmCoordinationSignalCount).toBeGreaterThanOrEqual(6)
    expect(coordination.metrics.constructionRhythmDependencyCoordinationSignalCount).toBeGreaterThanOrEqual(2)
    expect(coordination.metrics.constructionRhythmEarliestStartCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(coordination.metrics.constructionRhythmDurationContextCoordinationSignalCount).toBeGreaterThanOrEqual(3)
    expect(coordination.metrics.constructionRhythmSiteCapacityCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(coordination.metrics.constructionRhythmProgressCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(coordination.metrics.constructionRhythmReadinessCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(coordination.metrics.constructionRhythmDurationExperienceCoordinationSignalCount).toBeGreaterThanOrEqual(1)
    expect(coordination.activeChannels).toEqual(expect.arrayContaining([
      'workflow_sequence',
      'process_constraint',
      'earliest_start_rule',
      'resource_conflict',
      'progress_velocity',
      'external_readiness',
      'duration_experience',
    ]))
    expect(coordination.coordinationScore).toBeGreaterThan(0)
    expect(coordination.signals.every((signal) => signal.autoApply === false)).toBe(true)
    expect(coordination.signals.every((signal) => ['candidate_only', 'confidence_only'].includes(signal.policy))).toBe(true)
    expect(coordination.signals.every((signal) => signal.actionPolicy === signal.policy)).toBe(true)
    expect(coordination.signals.filter((signal) => signal.channel === 'resource_conflict')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        precedencePolicy: expect.stringContaining('resource_conflict'),
      }),
    ]))
  })
})
