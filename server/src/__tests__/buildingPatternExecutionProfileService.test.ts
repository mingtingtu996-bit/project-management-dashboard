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

import { buildBuildingPatternExecutionProfile } from '../services/buildingPatternExecutionProfileService.js'
import { clearAlgorithmSeedResolverCache, resolveV1474BuildingPatternMatch } from '../services/algorithmSeedResolver.js'

describe('buildingPatternExecutionProfileService', () => {
  it('uses final building pattern seed contracts and title-derived method variants instead of base-seed gaps', async () => {
    clearAlgorithmSeedResolverCache()

    const climbingMatch = await resolveV1474BuildingPatternMatch('\u0042\u0031\u0023 \u6807\u51c6\u5c42\u4e3b\u4f53\uff08\u722c\u6a21\uff09', {
      standardWorkCode: 'BDT-04-01-01',
      scopeDimensions: ['building', 'floor'],
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      phaseWindow: 'superstructure',
    })

    expect(climbingMatch.patternCode).toBe('high_rise_core_and_floor_cycle')
    expect(climbingMatch.confidenceLevel).toBe('high')
    expect(climbingMatch.matchedSignals).toEqual(expect.arrayContaining(['method_variant']))
    expect(climbingMatch.record).toEqual(expect.objectContaining({
      patternRole: 'phase_mode',
      conflictGroup: 'phase_rhythm',
      patternPriority: expect.any(Number),
      coexistsWithGroups: expect.arrayContaining(['project_rhythm']),
    }))
    expect(Object.keys((climbingMatch.record as any).typicalCycleDaysByMethod)).toEqual(expect.arrayContaining(['climbing_formwork']))

    const excludedRepair = await resolveV1474BuildingPatternMatch('\u9762\u5c42\u4fee\u8865\uff08\u65e0\u811a\u624b\u67b6\u5ba4\u5916\uff09', {
      contextKeywords: ['minor_repair_without_exterior_access'],
    })
    expect(excludedRepair.patternCode).toBeNull()
    expect(excludedRepair.actionPolicy).toBe('candidate_only')

    const meeting = await resolveV1474BuildingPatternMatch('\u7532\u65b9\u5468\u4f8b\u4f1a')
    expect(meeting).toMatchObject({
      record: null,
      patternCode: null,
      confidenceScore: 0,
      actionPolicy: 'candidate_only',
    })
  })

  it('combines project, phase, specialty, and handover rhythm modes from existing task facts', async () => {
    clearAlgorithmSeedResolverCache()

    const profile = await buildBuildingPatternExecutionProfile('project-1', [
      {
        id: 'structure-1',
        title: 'standard floor concrete pouring',
        standard_work_code: '02-01-03-P04',
        template_node_id: 'BDT-04-01-01',
        building_object_id: 'building-2',
        floor_object_id: 'floor-12',
        participant_unit_id: 'unit-structure',
        acceptance_required: true,
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
        id: 'basement-1',
        title: '地下室外墙防水及回填移交',
        standard_work_code: '01-05-01-P03',
        building_object_id: 'building-2',
        physical_zone_object_id: 'basement-zone',
        section_object_id: 'basement-section',
        material_required: true,
      },
      {
        id: 'mep-1',
        title: 'fire linkage and MEP system commissioning',
        standard_work_code: 'FIR-01-01-01-P03',
        physical_zone_object_id: 'zone-public',
        system_object_id: 'system-fire',
        acceptance_required: true,
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'commercial_opening',
            structureTypeCode: 'commercial_public_area',
            methodVariantCodes: ['fire_life_safety_acceptance', 'opening_readiness'],
            elementVariantCodes: ['opening_route'],
          },
        },
      },
      {
        id: 'hospital-1',
        title: 'hospital cleanroom medical gas and HVAC commissioning',
        standard_work_code: 'CLN-02-01-P03',
        physical_zone_object_id: 'operating-zone',
        system_object_id: 'system-medical-cleanroom',
        acceptance_required: true,
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'hospital',
            structureTypeCode: 'medical_cleanroom_system',
            methodVariantCodes: ['medical_cleanroom_envelope', 'medical_hvac_balancing', 'medical_gas_commissioning'],
            elementVariantCodes: ['operating_room', 'medical_gas_terminal', 'clinical_system_zone'],
          },
        },
      },
      {
        id: 'handover-1',
        title: '住宅分户验收物业承接业主交付',
        standard_work_code: 'QR-01-01-15-P01',
        building_object_id: 'building-2',
        floor_object_id: 'floor-12',
        physical_zone_object_id: 'unit-zone',
        acceptance_required: true,
        standard_task_metadata: {
          projectGenerationFacts: {
            businessType: 'residential',
            structureTypeCode: 'interior_fitout',
            methodVariantCodes: ['household_inspection', 'owner_delivery', 'property_takeover'],
            elementVariantCodes: ['dwelling_unit', 'handover_package'],
          },
        },
      },
    ])

    const phaseCodes = profile.modeCombination.phaseModes.map((mode) => mode.patternCode)
    const specialtyCodes = profile.modeCombination.specialtyDomainModes.map((mode) => mode.patternCode)
    const handoverCodes = profile.modeCombination.handoverModes.map((mode) => mode.patternCode)

    expect(profile.metrics.buildingPatternExecutionModeCount).toBeGreaterThanOrEqual(3)
    expect(profile.metrics.buildingPatternExecutionBackendConsumableModeCount).toBeGreaterThanOrEqual(1)
    expect(profile.metrics.buildingPatternExecutionReadinessScore).toBeGreaterThanOrEqual(55)
    expect([
      profile.modeCombination.primaryProjectMode,
      ...profile.modeCombination.phaseModes,
      ...profile.modeCombination.specialtyDomainModes,
      ...profile.modeCombination.handoverModes,
      ...profile.modeCombination.supportingModes,
    ].filter(Boolean).every((mode) => (
      mode?.backendConsumable === true
        ? mode.actionPolicy === 'candidate_only'
        : mode?.actionPolicy === 'confidence_only'
    ))).toBe(true)
    expect(profile.dataSupport.scopeDimensionCounts).toEqual(expect.objectContaining({
      building: expect.any(Number),
      floor: expect.any(Number),
      zone: expect.any(Number),
      system: expect.any(Number),
    }))
    expect(phaseCodes).toEqual(expect.arrayContaining([
      'high_rise_core_and_floor_cycle',
      'foundation_pit_to_foundation_sequence',
    ]))
    expect(profile.modeCombination.phaseModes.find((mode) => mode.patternCode === 'high_rise_core_and_floor_cycle')).toEqual(expect.objectContaining({
      conflictGroup: 'phase_rhythm',
      coexistsWithGroups: expect.arrayContaining(['project_rhythm', 'specialty_domain', 'handover_opening']),
    }))
    expect(specialtyCodes).toEqual(expect.arrayContaining([
      'hospital_medical_gas_source_terminal_flow__bp_e_4b',
    ]))
    expect(profile.modeCombination.specialtyDomainModes.find((mode) => mode.patternCode === 'hospital_medical_gas_source_terminal_flow__bp_e_4b')).toEqual(expect.objectContaining({
      conflictGroup: 'specialty_domain',
      coexistsWithGroups: expect.arrayContaining(['project_rhythm', 'handover_opening']),
    }))
    expect(handoverCodes).toEqual(expect.arrayContaining([
      'commercial_office_opening_readiness_flow',
      'residential_owner_delivery_flow',
    ]))
    expect(profile.modeCombination.handoverModes.find((mode) => mode.patternCode === 'residential_owner_delivery_flow')).toEqual(expect.objectContaining({
      conflictGroup: 'handover_opening',
      coexistsWithGroups: ['project_rhythm', 'phase_rhythm', 'specialty_domain'],
    }))
  })
})
