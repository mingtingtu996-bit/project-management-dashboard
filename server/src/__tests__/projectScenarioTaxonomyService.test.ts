import { describe, expect, it } from 'vitest'
import {
  PRODUCT_BUSINESS_TYPE_CODES,
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
  resolveScenarioScheduleProfile,
  resolveProjectScenarioProfile,
} from '../services/projectScenarioTaxonomyService.js'
import {
  resolveBuildingPatternScheduleCalibrationCoverage,
} from '../services/buildingPatternScheduleCalibrationService.js'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'

function buildPassingRuntimeBenchmarkResults() {
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

function buildFailingRuntimeBenchmarkResults() {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry, index) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: index === 0 ? 0.3 : 0,
    dependencyPassRate: index === 1 ? 0.9 : 0.99,
  }))
}

describe('project scenario taxonomy service', () => {
  const scheduleTrustBusinessTypeCases = [
    {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'shear_wall',
      buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
      totalAreaM2: 180_000,
      buildingCount: 3,
      standardFloorCount: 24,
      highestBuildingFloorCount: 26,
      basementLevelCount: 2,
    },
    {
      businessType: 'hotel',
      businessSubtype: 'luxury_hotel',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'frame_shear_wall',
      buildingPatternCodes: ['hotel_room_public_area_opening_flow'],
      totalAreaM2: 135_000,
      buildingCount: 3,
      standardFloorCount: 20,
      highestBuildingFloorCount: 38,
      basementLevelCount: 2,
    },
    {
      businessType: 'hospital',
      businessSubtype: 'tertiary_hospital',
      methodVariantCodes: ['cast_in_situ', 'medical_cleanroom'],
      structureTypeCode: 'frame_shear_wall',
      buildingPatternCodes: ['hospital_medical_cleanroom_integration_flow'],
      totalAreaM2: 120_000,
      buildingCount: 4,
      standardFloorCount: 12,
      highestBuildingFloorCount: 16,
      basementLevelCount: 2,
    },
    {
      businessType: 'school',
      businessSubtype: 'university_campus',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'frame_shear_wall',
      buildingPatternCodes: ['campus_term_handover_flow'],
      totalAreaM2: 160_000,
      buildingCount: 12,
      standardFloorCount: 6,
      highestBuildingFloorCount: 10,
      basementLevelCount: 1,
    },
    {
      businessType: 'industrial',
      businessSubtype: 'industrial_cleanroom',
      methodVariantCodes: ['steel_frame'],
      structureTypeCode: 'steel_structure',
      buildingPatternCodes: ['industrial_cleanroom_validation_flow'],
      totalAreaM2: 95_000,
      buildingCount: 3,
      standardFloorCount: 4,
      highestBuildingFloorCount: 6,
      basementLevelCount: 1,
    },
    {
      businessType: 'data_center',
      businessSubtype: 'idc',
      methodVariantCodes: ['steel_frame'],
      structureTypeCode: 'frame_shear_wall',
      buildingPatternCodes: ['data_center_room_commissioning_flow'],
      totalAreaM2: 80_000,
      buildingCount: 2,
      standardFloorCount: 5,
      highestBuildingFloorCount: 7,
      basementLevelCount: 1,
    },
    {
      businessType: 'transportation_hub',
      businessSubtype: 'transportation_terminal',
      methodVariantCodes: ['steel_frame'],
      structureTypeCode: 'steel_structure',
      buildingPatternCodes: ['large_span_public_steel_integration_flow'],
      totalAreaM2: 90_000,
      buildingCount: 1,
      standardFloorCount: 4,
      highestBuildingFloorCount: 8,
      basementLevelCount: 2,
    },
    {
      businessType: 'sports_culture',
      businessSubtype: 'large_span_public',
      methodVariantCodes: ['steel_frame'],
      structureTypeCode: 'steel_structure',
      buildingPatternCodes: ['large_span_public_steel_integration_flow'],
      totalAreaM2: 85_000,
      buildingCount: 1,
      standardFloorCount: 5,
      highestBuildingFloorCount: 8,
      basementLevelCount: 1,
    },
    {
      businessType: 'tod_upper_cover',
      businessSubtype: 'metro_upper_cover',
      methodVariantCodes: ['cast_in_situ', 'steel_frame'],
      structureTypeCode: 'steel_concrete_composite',
      buildingPatternCodes: ['tod_upper_cover_interface_flow'],
      totalAreaM2: 210_000,
      buildingCount: 6,
      standardFloorCount: 18,
      highestBuildingFloorCount: 28,
      basementLevelCount: 2,
    },
    {
      businessType: 'renovation',
      businessSubtype: 'renovation_heritage',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'mixed_structure',
      buildingPatternCodes: ['renovation_heritage_protection_flow'],
      totalAreaM2: 55_000,
      buildingCount: 4,
      standardFloorCount: 8,
      highestBuildingFloorCount: 12,
      basementLevelCount: 1,
    },
    {
      businessType: 'modular_building',
      businessSubtype: 'mic_modular',
      methodVariantCodes: ['modular_mic'],
      structureTypeCode: 'prefabricated_steel',
      buildingPatternCodes: ['mic_module_factory_site_flow'],
      totalAreaM2: 45_000,
      buildingCount: 4,
      standardFloorCount: 12,
      highestBuildingFloorCount: 16,
      basementLevelCount: 1,
      prefabRate: 0.85,
    },
  ]

  it('keeps product business types and real-project recommendation packs as separate governed layers', () => {
    expect(PRODUCT_BUSINESS_TYPE_CODES).toHaveLength(11)
    expect(REAL_PROJECT_RECOMMENDATION_PACK_KEYS).toEqual([
      'residential',
      'prefab_residential',
      'hospital',
      'data_center',
      'clean_industrial',
      'large_span_steel_public',
      'renovation',
      'heritage',
      'campus',
      'tod',
      'modular_construction',
      'luxury_hotel',
      'deep_foundation',
    ])
  })

  it('resolves business type, subtype, method and feature facts into one recommendation profile', () => {
    expect(resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
    }).recommendationPacks).toEqual(['residential'])

    expect(resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {},
    }).recommendationPacks).toEqual(['prefab_residential'])

    expect(resolveProjectScenarioProfile({
      businessType: 'industrial',
      businessSubtype: 'industrial_cleanroom',
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {},
    }).recommendationPacks).toEqual(['clean_industrial'])

    expect(resolveProjectScenarioProfile({
      businessType: 'renovation',
      businessSubtype: 'renovation_heritage',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
    }).recommendationPacks).toEqual(['heritage'])
  })

  it('treats deep foundation as a companion package instead of replacing the main project type', () => {
    const profile = resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { foundationDepthM: 12 },
    })

    expect(profile.primaryRecommendationPack).toBe('residential')
    expect(profile.companionRecommendationPacks).toEqual(['deep_foundation'])
    expect(profile.recommendationPacks).toEqual(['residential', 'deep_foundation'])
    expect(profile.benchmarkScenarioKeys).toEqual(['A', 'L'])
  })

  it('keeps low-rise multi-building execution profile as a cross-cutting signal for prefab projects', () => {
    const profile = resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {
        prefabRate: 0.45,
        buildingCount: 12,
        standardFloorCount: 11,
        basementLevelCount: 1,
      },
    })

    expect(profile.executionProfile.primaryArchetype).toBe('prefab_concrete_supply_chain')
    expect(profile.executionProfile.crossCuttingArchetypes).toContain('lowrise_multi_building_parallel')
  })

  it('treats execution profile as a building_pattern projection when pattern evidence is supplied', () => {
    const profile = resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'shear_wall',
      projectFeatures: {
        standardFloorCount: 26,
        buildingPatternCodes: ['steel_structure_bay_zone_flow'],
      },
    })

    expect(profile.executionProfile.source).toBe('v1474_building_pattern')
    expect(profile.executionProfile.primaryArchetype).toBe('steel_assembly_fast_track')
    expect(profile.executionProfile.patternCodes).toEqual(['steel_structure_bay_zone_flow'])
  })

  it('maps every real-project recommendation pack to a governed schedule profile', () => {
    const profileByPack = new Map(
      REAL_PROJECT_RECOMMENDATION_PACK_KEYS.map((pack) => [
        pack,
        resolveScenarioScheduleProfile({ recommendationPacks: [pack] }),
      ]),
    )

    expect(profileByPack.get('hospital')).toEqual(expect.objectContaining({
      dominantSchedulePattern: 'special_system_commissioning_chain',
      fitoutReleaseDays: 75,
      commissioningReleaseDays: 21,
    }))
    expect(profileByPack.get('data_center')).toEqual(expect.objectContaining({
      dominantSchedulePattern: 'mission_critical_mep_commissioning_chain',
      mepReleaseDays: 21,
      commissioningReleaseDays: 14,
    }))
    expect(profileByPack.get('tod')).toEqual(expect.objectContaining({
      dominantSchedulePattern: 'interface_constraint_chain',
      strictInterfaceLagDays: 21,
    }))
    expect(profileByPack.get('modular_construction')).toEqual(expect.objectContaining({
      dominantSchedulePattern: 'factory_parallel_site_assembly',
      fastTrackIntensity: 'high',
    }))
    expect(profileByPack.get('deep_foundation')).toEqual(expect.objectContaining({
      dominantSchedulePattern: 'deep_foundation_observation_chain',
      foundationReleaseDays: 45,
    }))
    expect([...profileByPack.values()].every((profile) => profile.dominantSchedulePattern !== 'general_sequence')).toBe(true)
  })

  it('promotes verified building_pattern evidence to controlled schedule input across all product business types', () => {
    expect(scheduleTrustBusinessTypeCases.map((item) => item.businessType)).toEqual(PRODUCT_BUSINESS_TYPE_CODES)

    for (const facts of scheduleTrustBusinessTypeCases) {
      const profile = resolveProjectScenarioProfile(facts, {
        runtimeBenchmarkResults: buildPassingRuntimeBenchmarkResults(),
      })
      const scheduleTrust = (profile as any).buildingPatternScheduleTrust

      expect(scheduleTrust, `${facts.businessType} should expose a building_pattern schedule trust gate`).toEqual(expect.objectContaining({
        trustLevel: 'controlled_schedule_input',
        scheduleReadiness: 'trusted',
        seedAuthority: 'schedule_rhythm_context',
        hardDependencyAuthority: false,
        plannedDateWritePolicy: 'never_direct_write',
      }))
      expect(scheduleTrust.coverage.businessType).toBe(facts.businessType)
      expect(scheduleTrust.coverage.recommendationPacks).toEqual(profile.recommendationPacks)
      expect(scheduleTrust.coverage.verifiedPatternCodes).toEqual(expect.arrayContaining(facts.buildingPatternCodes))
      expect(scheduleTrust.reasonCodes).toEqual(expect.arrayContaining([
        'building_pattern_codes_verified',
        'project_scale_facts_present',
        'scenario_schedule_profile_present',
        'duration_curve_parallel_stagger_fields_present',
        'real_project_benchmark_pack_bound',
        'golden_benchmark_threshold_bound',
        'five_layer_dependency_boundary_preserved',
      ]))
      expect(scheduleTrust.calibration).toEqual(expect.objectContaining({
        status: 'golden_benchmark_bound',
        source: 'wbs_template_golden_benchmark_gate',
        expectedScenarioCount: 13,
        maximumDurationDeviationRatio: 0.15,
        minimumDependencyPassRate: 0.95,
        requiredRecommendationPacks: REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
        missingRecommendationPacks: [],
        runtimeEvidence: expect.objectContaining({
          scenarioCount: 13,
          failedScenarioCodes: [],
        }),
      }))
      expect(scheduleTrust.calibration.coveredRecommendationPacks).toEqual(expect.arrayContaining(profile.recommendationPacks))
      expect(scheduleTrust.calibration.requiredBusinessTypeCodes).toEqual(PRODUCT_BUSINESS_TYPE_CODES)
      expect(scheduleTrust.boundaryPolicy.forbiddenOutputs).toEqual(expect.arrayContaining([
        'hard_task_dependency',
        'dependency_layer_edge',
        'planned_date_write',
      ]))
      expect(scheduleTrust.boundaryPolicy.fiveLayerDependencyAuthority).toBe('hard_dependencies_only')
    }
  })

  it('keeps weak or missing building_pattern evidence as candidate-only schedule context', () => {
    const profile = resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'shear_wall',
      totalAreaM2: 100_000,
      buildingCount: 2,
      standardFloorCount: 20,
      highestBuildingFloorCount: 26,
      basementLevelCount: 2,
      projectFeatures: {},
    })
    const scheduleTrust = (profile as any).buildingPatternScheduleTrust

    expect(scheduleTrust).toEqual(expect.objectContaining({
      trustLevel: 'candidate_only',
      scheduleReadiness: 'needs_seed_evidence',
      hardDependencyAuthority: false,
      plannedDateWritePolicy: 'never_direct_write',
    }))
    expect(scheduleTrust.reasonCodes).toEqual(expect.arrayContaining([
      'building_pattern_codes_missing',
      'five_layer_dependency_boundary_preserved',
    ]))
  })

  it('keeps building_pattern real-schedule trust bound to 11 business types and 13 benchmark packs', () => {
    const calibration = resolveBuildingPatternScheduleCalibrationCoverage({
      recommendationPacks: REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
      runtimeResults: buildPassingRuntimeBenchmarkResults(),
    })

    expect(calibration).toEqual(expect.objectContaining({
      status: 'golden_benchmark_bound',
      source: 'wbs_template_golden_benchmark_gate',
      expectedScenarioCount: 13,
      maximumDurationDeviationRatio: 0.15,
      minimumDependencyPassRate: 0.95,
      requiredBusinessTypeCodes: PRODUCT_BUSINESS_TYPE_CODES,
      requiredRecommendationPacks: REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
      missingRecommendationPacks: [],
      runtimeEvidence: expect.objectContaining({
        scenarioCount: 13,
        failedScenarioCodes: [],
      }),
    }))
  })

  it('marks a scenario commercial-ready only when fact strength, sample calibration and scenario accuracy all pass', () => {
    const profile = resolveProjectScenarioProfile(scheduleTrustBusinessTypeCases[0], {
      runtimeBenchmarkResults: buildPassingRuntimeBenchmarkResults(),
    })

    expect(profile.durationCommercialReadiness).toEqual(expect.objectContaining({
      status: 'commercial_ready',
      factStrengthStatus: 'strong_static_facts',
      sampleCalibrationStatus: 'golden_benchmark_bound',
      scenarioAccuracyStatus: 'within_commercial_threshold',
      reasonCodes: expect.arrayContaining([
        'static_facts_complete',
        'sample_calibration_passed',
        'scenario_accuracy_within_commercial_threshold',
      ]),
      thresholds: expect.objectContaining({
        expectedScenarioCount: 13,
        maximumDurationDeviationRatio: 0.15,
        minimumDependencyPassRate: 0.95,
      }),
      boundaryPolicy: expect.arrayContaining([
        'commercial_ready_requires_fact_strength_sample_calibration_and_scenario_accuracy',
        'non_commercial_ready_profiles_must_not_write_planned_dates_or_hard_dependencies',
      ]),
    }))
  })

  it('keeps a scenario non-commercial when runtime benchmark evidence is missing', () => {
    const profile = resolveProjectScenarioProfile(scheduleTrustBusinessTypeCases[0])

    expect(profile.durationCommercialReadiness).toEqual(expect.objectContaining({
      status: 'candidate_only',
      sampleCalibrationStatus: 'needs_runtime_benchmark_evidence',
      scenarioAccuracyStatus: 'needs_runtime_benchmark_evidence',
      reasonCodes: expect.arrayContaining([
        'runtime_benchmark_evidence_missing',
      ]),
    }))
  })

  it('blocks commercial scheduling when runtime benchmark accuracy fails', () => {
    const profile = resolveProjectScenarioProfile(scheduleTrustBusinessTypeCases[0], {
      runtimeBenchmarkResults: buildFailingRuntimeBenchmarkResults(),
    })

    expect(profile.durationCommercialReadiness).toEqual(expect.objectContaining({
      status: 'blocked',
      sampleCalibrationStatus: 'runtime_benchmark_failed',
      scenarioAccuracyStatus: 'failed_runtime_benchmark',
      reasonCodes: expect.arrayContaining([
        'runtime_benchmark_failed',
      ]),
    }))
  })

  it('keeps complete benchmark evidence candidate-only when scale facts are incomplete', () => {
    const profile = resolveProjectScenarioProfile({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      structureTypeCode: 'shear_wall',
      buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
    }, {
      runtimeBenchmarkResults: buildPassingRuntimeBenchmarkResults(),
    })

    expect(profile.durationCommercialReadiness).toEqual(expect.objectContaining({
      status: 'candidate_only',
      factStrengthStatus: 'missing_scale_or_method_facts',
      sampleCalibrationStatus: 'golden_benchmark_bound',
      scenarioAccuracyStatus: 'within_commercial_threshold',
      reasonCodes: expect.arrayContaining([
        'project_scale_facts_incomplete',
      ]),
    }))
  })
})
