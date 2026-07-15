import { describe, expect, it } from 'vitest'
import {
  deriveExecutionArchetypeFromBuildingPatterns,
  resolveBuildingPatternExecutionArchetypeProfile,
} from '../services/buildingPatternExecutionResolver.js'

describe('building-pattern execution resolver', () => {
  it('projects v1474 building_pattern codes into the coarse WBS execution archetype', () => {
    const profile = resolveBuildingPatternExecutionArchetypeProfile({
      businessType: 'general_civil',
      methodVariantCodes: ['cast_in_situ'],
      buildingPatternCodes: ['prefabricated_concrete_floor_cycle', 'multi_building_parallel_flow'],
      prefabRate: 0,
      buildingCount: 12,
      standardFloorCount: 11,
      basementLevelCount: 1,
    })

    expect(profile.source).toBe('v1474_building_pattern')
    expect(profile.primaryArchetype).toBe('prefab_concrete_supply_chain')
    expect(profile.crossCuttingArchetypes).toContain('lowrise_multi_building_parallel')
    expect(profile.allArchetypes).toEqual([
      'prefab_concrete_supply_chain',
      'lowrise_multi_building_parallel',
    ])
    expect(profile.patternCodes).toEqual(['prefabricated_concrete_floor_cycle', 'multi_building_parallel_flow'])
  })

  it('lets high-confidence building_pattern override generic feature heuristics', () => {
    const profile = resolveBuildingPatternExecutionArchetypeProfile({
      businessType: 'general_civil',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'shear_wall',
      buildingPatternCodes: ['steel_structure_bay_zone_flow'],
      standardFloorCount: 26,
      highestBuildingFloorCount: 26,
    })

    expect(profile.source).toBe('v1474_building_pattern')
    expect(profile.primaryArchetype).toBe('steel_assembly_fast_track')
    expect(profile.confidence).toBe('high')
  })

  it('falls back to feature-profile heuristics when no building_pattern evidence exists', () => {
    const profile = resolveBuildingPatternExecutionArchetypeProfile({
      methodVariantCodes: ['precast_concrete'],
      prefabRate: 0.45,
      buildingCount: 12,
      standardFloorCount: 11,
      basementLevelCount: 1,
    })

    expect(profile.source).toBe('taxonomy_fallback')
    expect(profile.primaryArchetype).toBe('prefab_concrete_supply_chain')
    expect(profile.crossCuttingArchetypes).toContain('lowrise_multi_building_parallel')
  })

  it('does not treat the seismic suffix as a MiC modular project-type token', () => {
    const seismicProfile = resolveBuildingPatternExecutionArchetypeProfile({
      businessType: 'renovation',
      businessSubtype: 'renovation_seismic',
      projectTypeCode: 'renovation_seismic',
      methodVariantCodes: ['bored_pile'],
      structureTypeCode: 'frame_core',
      buildingPatternCodes: ['cluster'],
      buildingCount: 1,
      standardFloorCount: 5,
      basementLevelCount: 0,
    })
    const micProfile = resolveBuildingPatternExecutionArchetypeProfile({
      businessType: 'modular_building',
      projectTypeCode: 'mic_modular',
      methodVariantCodes: [],
    })

    expect(seismicProfile.source).toBe('taxonomy_fallback')
    expect(seismicProfile.primaryArchetype).toBe('general_construction')
    expect(micProfile.primaryArchetype).toBe('mic_modular_fast_track')
  })

  it('keeps deriving archetype from building_pattern as a pure synchronous projection', () => {
    const archetype = deriveExecutionArchetypeFromBuildingPatterns([
      'mic_module_factory_site_flow',
      'multi_building_parallel_flow',
    ])

    expect(archetype.primaryArchetype).toBe('mic_modular_fast_track')
    expect(archetype.crossCuttingArchetypes).toContain('lowrise_multi_building_parallel')
  })
})
