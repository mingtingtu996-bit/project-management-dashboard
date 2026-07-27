import { describe, expect, it } from 'vitest'

import {
  buildStandardWorkDurationSeedQualityAuditReport,
} from '../services/standardWorkDurationSeedQualityAuditService.js'
import {
  STANDARD_WORK_DURATION_SEED,
  type StandardWorkDurationSeedRule,
} from '../seeds/standardWorkDurationSeed.js'

function baseRule(overrides: Partial<StandardWorkDurationSeedRule>): StandardWorkDurationSeedRule {
  return {
    stableCode: 'test_standard_duration_rule',
    standardWorkCodes: ['TEST-01-P01'],
    keywords: ['test'],
    applicableGranularity: 'task',
    defaultDaysP20: 4,
    defaultDaysP50: 6,
    defaultDaysP80: 8,
    fixedDays: 1,
    variableDays: 5,
    scaleBasis: 'workface',
    benchmarkBasis: 'test benchmark',
    sourceStandard: 'test_standard',
    sourceVersion: 'test_version',
    sourceClauseRef: 'test_clause',
    evidenceSourceKeys: ['test_evidence'],
    confidence: 'medium',
    webVerified: true,
    reviewNeeded: false,
    ...overrides,
  }
}

describe('standardWorkDurationSeedQualityAuditService', () => {
  it('reports the current standard duration seed as blocker-free while exposing precision/depth metrics', () => {
    const report = buildStandardWorkDurationSeedQualityAuditReport()

    expect(report).toEqual(expect.objectContaining({
      reportCode: 'standard_work_duration_seed_quality_audit',
      governanceBoundary: {
        reportOnly: true,
        seedWritePolicy: 'never_write_seed_from_quality_audit',
        promotionPolicy: 'review_required_before_seed_promotion',
        allowedUse: 'backend_seed_quality_governance',
      },
    }))
    expect(report.summary.totalRuleCount).toBe(STANDARD_WORK_DURATION_SEED.length)
    expect(report.summary.durationBearingRuleCount).toBeGreaterThan(300)
    expect(report.summary.blockerCount).toBe(0)
    expect(report.summary.productivityTraceability.missingSourceCount).toBe(0)
    expect(report.summary.distribution.maxP80P20Ratio).toBeLessThan(4)
    expect(report.summary.confidence.highConfidenceWithoutStrongSourceCount).toBe(0)
    expect(report.summary.conditionDepth.conditionizedRuleCount).toBeGreaterThanOrEqual(6)
    expect(report.summary.conditionDepth.incompleteConditionSetReviewCount).toBe(0)
    expect(report.findings.some((finding) => finding.code === 'CONDITION_BAND_SET_INCOMPLETE')).toBe(false)
    expect(report.findings.some((finding) => finding.code === 'CONFIDENCE_PROVENANCE_REVIEW')).toBe(false)
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_BAND_SET_INCOMPLETE',
        stableCode: 'plumbing_sanitary_fixture',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'plumbing_sanitary_fixture',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'curtain_wall_installation',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'scaffold_temp_access',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'scaffold_temp_access',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'ground_replacement_cushion',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'ground_replacement_cushion',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'dynamic_compaction_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'dynamic_compaction_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'grouting_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'grouting_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'preloading_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'preloading_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'granular_compaction_composite_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'granular_compaction_composite_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'jet_grouting_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'jet_grouting_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'cement_soil_mixing_pile_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'cement_soil_mixing_pile_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'cfg_composite_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'cfg_composite_ground',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'STRICT_P50_WINDOW_REVIEW',
        stableCode: 'earthwork_excavation_transport',
      }),
    ]))
    expect(report.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_DEPTH_REVIEW',
        stableCode: 'earthwork_excavation_transport',
      }),
    ]))
    for (const stableCode of [
      'site_setup_temp_works',
      'deep_foundation_support_dewatering',
      'pile_foundation',
      'concrete_curing_wait',
      'interior_detail_fixture_railing',
      'mep_plumbing_fire_pipe',
      'plumbing_indoor_supply_drainage',
      'plumbing_special_water_system',
      'plumbing_reclaimed_rainwater_system',
      'plumbing_pool_bath_system',
      'plumbing_water_feature_system',
      'electrical_outdoor_distribution',
      'electrical_power_distribution_room',
      'electrical_feeder_busway',
      'electrical_distribution_equipment',
      'electrical_lighting_terminal',
      'electrical_standby_power_ups',
      'electrical_grounding_lightning',
      'foundation_pit_retaining_support',
      'foundation_pit_bored_pile_support',
      'foundation_pit_sheet_pile_wall',
      'foundation_pit_secant_pile_wall',
      'foundation_pit_smw_wall',
      'foundation_pit_soil_nail_wall',
      'foundation_pit_diaphragm_wall',
      'foundation_pit_cement_soil_wall',
      'foundation_pit_internal_strut',
      'foundation_pit_anchor_support',
      'foundation_pit_interface_support',
      'groundwater_control_dewatering',
      'slope_support_reinforcement',
      'precast_concrete_pile_foundation',
      'dry_bored_pile_foundation',
      'bored_cast_in_place_pile_foundation',
      'long_spiral_drilled_pile_foundation',
      'driven_cast_in_place_pile_foundation',
      'steel_pile_foundation',
      'anchor_static_pressure_pile_foundation',
      'rock_anchor_foundation',
      'cushion_and_blinding',
      'shallow_foundation_concrete_structure',
      'caisson_well_foundation',
      'basement_structure',
      'basement_waterproof_backfill',
      'cast_in_place_formwork',
      'cast_in_place_rebar',
      'cast_in_place_concrete',
      'pc_component_hoisting',
      'pc_grouting_joint',
      'steel_fabrication_deepening',
      'steel_erection',
      'steel_tube_concrete_structure',
      'steel_reinforced_concrete_structure',
      'steel_bolting_welding',
      'large_span_roof_structure',
      'timber_structure',
      'steel_envelope_roof_wall',
      'masonry_infill_wall',
      'plastering_wall_ceiling',
      'roof_waterproof_insulation',
      'roof_insulation_thermal_layer',
      'roof_membrane_waterproof',
      'roof_tile_panel_surface',
      'roof_detail_nodes',
      'exterior_wall_waterproof',
      'floor_finish_system',
      'exterior_insulation_finish',
      'ceiling_system_finish',
      'door_window_railing',
      'plumbing_indoor_water_supply_pipe',
      'plumbing_fire_hydrant_sprinkler',
      'plumbing_indoor_drainage',
      'heating_radiator_system',
      'heating_hydronic_floor_system',
      'heating_electric_floor_system',
      'plumbing_pipe_anticorrosion',
      'plumbing_pipe_insulation',
      'plumbing_pipe_flushing',
      'plumbing_indoor_water_supply_equipment',
      'plumbing_water_test_commissioning',
      'plumbing_hot_water_system',
      'heating_indoor_system',
      'heating_gas_radiant_system',
      'heating_source_auxiliary_equipment',
      'hvac_supply_air_system',
      'hvac_exhaust_air_system',
      'hvac_air_distribution',
      'hvac_smoke_control',
      'hvac_dust_exhaust',
      'hvac_vacuum_cleaning_system',
      'hvac_comfort_air',
      'hvac_vrf_multisplit_system',
      'hvac_constant_humidity',
      'hvac_cleanroom_system',
      'hvac_civil_defense_ventilation',
      'hvac_water_equipment_system',
      'hvac_condensate_system',
      'hvac_cooling_water_system',
      'hvac_ground_source_heat_pump_exchange',
      'hvac_water_source_heat_pump_exchange',
      'hvac_heat_pump_exchange_system',
      'hvac_thermal_storage_system',
      'hvac_solar_heating_air_system',
      'hvac_energy_storage_solar_system',
      'hvac_automation_control',
      'hvac_compression_chiller_equipment',
      'hvac_absorption_refrigeration_equipment',
      'hvac_chiller_absorption_equipment',
      'elevator_installation',
      'elevator_traction_installation',
      'elevator_traction_machine_drive',
      'elevator_traction_guide_rail',
      'elevator_traction_door_system',
      'elevator_traction_car_assembly',
      'elevator_traction_counterweight',
      'elevator_traction_safety_components',
      'elevator_traction_suspension_rope',
      'elevator_traction_traveling_cable',
      'elevator_traction_compensation_device',
      'elevator_traction_electrical_device',
      'elevator_hydraulic_guide_rail',
      'elevator_hydraulic_door_system',
      'elevator_hydraulic_car_assembly',
      'elevator_hydraulic_balance_weight',
      'elevator_hydraulic_safety_components',
      'elevator_hydraulic_suspension_device',
      'elevator_hydraulic_traveling_cable',
      'elevator_hydraulic_electrical_device',
      'elevator_hydraulic_installation',
      'escalator_moving_walk_installation',
      'intelligent_integration_network',
      'intelligent_network_system',
      'intelligent_structured_cabling',
      'intelligent_information_application',
      'intelligent_information_access_system',
      'intelligent_mobile_signal_coverage',
      'intelligent_satellite_communication_system',
      'intelligent_telecom_access_coverage',
      'intelligent_telephone_exchange',
      'intelligent_communication_media',
      'intelligent_public_broadcast_system',
      'intelligent_conference_system',
      'intelligent_information_display_system',
      'intelligent_clock_system',
      'intelligent_ba_control',
      'intelligent_fire_alarm',
      'intelligent_security_technical_system',
      'intelligent_emergency_response_system',
      'intelligent_security_emergency',
      'intelligent_data_center_room',
      'intelligent_data_center_power',
      'intelligent_data_center_grounding',
      'intelligent_data_center_precision_air',
      'intelligent_data_center_cabling',
      'intelligent_data_center_security_monitoring',
      'intelligent_data_center_fire_suppression',
      'intelligent_data_center_interior_fitout',
      'intelligent_data_center_commissioning',
      'intelligent_lightning_grounding',
      'interior_public_finish',
      'interior_unit_finish',
      'lightweight_partition_wall',
      'wall_panel_finish',
      'tile_facing_finish',
      'coating_paint_finish',
      'wallpaper_soft_finish',
      'outdoor_utilities',
      'outdoor_water_supply_network',
      'outdoor_drainage_network',
      'outdoor_heating_network',
      'outdoor_road_hardscape',
      'landscape_greenery',
      'single_system_commissioning',
      'integrated_commissioning',
      'energy_hvac_system',
      'energy_electrical_lighting',
      'energy_monitoring_control',
      'energy_renewable_system',
    ]) {
      expect(report.findings).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'STRICT_P50_WINDOW_REVIEW',
          stableCode,
        }),
      ]))
      expect(report.findings).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'CONDITION_DEPTH_REVIEW',
          stableCode,
        }),
      ]))
    }
    expect(report.findings.filter((finding) => finding.severity === 'blocker')).toHaveLength(0)
  })

  it('flags wide distributions, loose P50 precision windows, weak provenance, and missing condition depth', () => {
    const report = buildStandardWorkDurationSeedQualityAuditReport({
      records: [
        baseRule({
          stableCode: 'wide_family_without_condition_depth',
          standardWorkCodes: ['WIDE-01-P01'],
          baseDaysEligible: true,
          defaultDaysP20: 3,
          defaultDaysP50: 6,
          defaultDaysP80: 12,
          confidence: 'high',
          sourceStandard: 'enterprise_expert_estimate',
          baselineProductivity: {
            p50PerDay: 12,
            unit: 'set/day',
            basis: 'untraceable productivity baseline',
          },
        }),
        baseRule({
          stableCode: 'quota_productivity_without_item_ref',
          standardWorkCodes: ['WIDE-02-P01'],
          baseDaysEligible: true,
          defaultDaysP20: 5,
          defaultDaysP50: 7,
          defaultDaysP80: 11,
          baselineProductivity: {
            p50PerDay: 2,
            unit: 't/day',
            basis: 'quota-like productivity without item reference',
            sourceType: 'quota',
            sourceRef: 'TY01-89-2016 generic table',
            sourceDetail: 'chapter=unknown',
          },
        }),
      ],
    })

    const findingCodes = report.findings.map((finding) => finding.code)
    expect(report.summary.blockerCount).toBeGreaterThanOrEqual(2)
    expect(report.summary.reviewRequiredCount).toBeGreaterThanOrEqual(2)
    expect(findingCodes).toEqual(expect.arrayContaining([
      'DISTRIBUTION_TOO_WIDE',
      'STRICT_P50_WINDOW_REVIEW',
      'PRODUCTIVITY_SOURCE_MISSING',
      'QUOTA_PRODUCTIVITY_SOURCE_UNSTRUCTURED',
      'CONFIDENCE_PROVENANCE_REVIEW',
      'CONDITION_DEPTH_REVIEW',
    ]))
  })

  it('flags condition codes that only change one dimension instead of duration, process profile, and productivity together', () => {
    const report = buildStandardWorkDurationSeedQualityAuditReport({
      records: [
        baseRule({
          stableCode: 'partial_condition_depth_rule',
          standardWorkCodes: ['COND-01-P01'],
          baseDaysEligible: true,
          conditionedDurationBands: [
            {
              conditionCode: 'open_workface',
              selector: { workfaceBand: 'open' },
              defaultDaysP20: 3,
              defaultDaysP50: 5,
              defaultDaysP80: 7,
              rationale: 'Open workface duration band.',
            },
          ],
          productivityBands: [
            {
              conditionCode: 'open_workface',
              selector: { workfaceBand: 'open' },
              baselineProductivity: {
                p50PerDay: 10,
                unit: 'set/day',
                basis: 'open workface productivity',
                sourceType: 'expert_profile',
                sourceRef: 'expert_profile:partial_condition_depth_rule:open_workface',
                sourceDetail: 'owner=partial_condition_depth_rule; condition=open_workface; basis=open workface productivity profile',
              },
              rationale: 'Open workface productivity band.',
            },
            {
              conditionCode: 'constrained_workface',
              selector: { workfaceBand: 'constrained' },
              baselineProductivity: {
                p50PerDay: 6,
                unit: 'set/day',
                basis: 'constrained workface productivity',
                sourceType: 'expert_profile',
                sourceRef: 'expert_profile:partial_condition_depth_rule:constrained_workface',
                sourceDetail: 'owner=partial_condition_depth_rule; condition=constrained_workface; basis=constrained workface productivity profile',
              },
              rationale: 'Constrained workface productivity band without paired duration/profile.',
            },
          ],
        }),
      ],
    })

    expect(report.summary.conditionDepth.incompleteConditionSetReviewCount).toBe(1)
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_BAND_SET_INCOMPLETE',
        severity: 'review_required',
        stableCode: 'partial_condition_depth_rule',
        metrics: expect.objectContaining({
          incompleteConditionCodeCount: 2,
          missingProcessProfileCount: 2,
          missingDurationBandCount: 1,
        }),
      }),
    ]))
  })
})
