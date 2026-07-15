import { describe, expect, it } from 'vitest'
import {
  buildTemplateRecommendation,
  SUPPORTED_INDEPENDENT_ENGINEERING_ZONE_CODES,
} from '../services/projectFactsToTemplateService.js'
import { BUSINESS_TYPE_RECOMMENDATIONS } from '../services/projectTypeRecommendations.js'
import { evaluateScopeTemplateCoverage } from '../services/scopeTemplateCoverageService.js'
import {
  WBS_TEMPLATE_PROJECT_RECOMMENDATIONS,
  listWbsTemplateProjectRecommendations,
} from '../seeds/wbsTemplateProjectRecommendations.js'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import { getScopeAssignmentRules } from '../services/scopeAssignmentRulesService.js'
import { resolveDefaultMasterPlanOperationalRowFloor } from '../services/defaultMasterPlanRowVolumePolicy.js'

describe('real-project WBS template recommendation packs', () => {
  it('registers the report-required recommendation packs', () => {
    expect(Object.keys(WBS_TEMPLATE_PROJECT_RECOMMENDATIONS).sort()).toEqual([
      'campus',
      'clean_industrial',
      'data_center',
      'deep_foundation',
      'heritage',
      'hospital',
      'large_span_steel_public',
      'luxury_hotel',
      'modular_construction',
      'prefab_residential',
      'renovation',
      'residential',
      'tod',
    ].sort())
    expect(listWbsTemplateProjectRecommendations()).toHaveLength(13)
    expect(WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX).toHaveLength(13)
  })

  it('feeds residential and prefab recommendation packs into runtime matched templates', () => {
    const residential = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { foundationDepthM: 6 },
      detailLevel: 'standard',
      buildingCount: 2,
    })
    expect(residential.matchedTemplates).toEqual(expect.arrayContaining([
      'china-gb55032-2022',
      'china-building-site-management',
      'china-dangerous-subproject-control',
      'china-quality-responsibility-acceptance',
      'china-project-milestone-handover',
      'china-waterproof-insulation',
      'china-jgj-tianjin-decoration',
      'china-plumbing-heating-system',
      'china-electrical-system',
      'china-building-fine-detail',
    ]))

    const prefab = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
    })
    expect(prefab.matchedTemplates).toEqual(expect.arrayContaining([
      'china-prefabricated-assembly',
      'china-dangerous-subproject-control',
      'china-building-fine-detail',
    ]))
    expect(prefab.recommendationRationale.some((item) => item.includes('prefab_residential'))).toBe(true)
  })

  it('declares a bounded default master-plan output for all 11 business types', () => {
    const expectedOneScopeRanges = {
      general_civil: [70, 160],
      hotel: [60, 120],
      hospital: [70, 170],
      school: [60, 130],
      industrial: [60, 130],
      data_center: [60, 150],
      transportation_hub: [65, 180],
      sports_culture: [60, 120],
      tod_upper_cover: [72, 200],
      renovation: [60, 90],
      modular_building: [60, 100],
    } as const
    for (const businessType of Object.keys(BUSINESS_TYPE_RECOMMENDATIONS)) {
      const recommendation = buildTemplateRecommendation({
        businessType: businessType as keyof typeof BUSINESS_TYPE_RECOMMENDATIONS,
        methodVariantCodes: BUSINESS_TYPE_RECOMMENDATIONS[businessType as keyof typeof BUSINESS_TYPE_RECOMMENDATIONS].defaultMethods,
        projectFeatures: {},
        detailLevel: 'standard',
        buildingCount: 1,
      })

      expect(recommendation.defaultPlanOutput, businessType).toBe('master_plan')
      expect(recommendation.masterPlanProfile, businessType).toEqual(expect.objectContaining({
        layer: 'master_plan',
        detailLevel: 'planning_skeleton',
        generationDepth: 'managed_frontier',
        mutationBoundary: expect.objectContaining({
          writesProductionDependencies: false,
          writesProductionDates: false,
        }),
      }))
      expect(recommendation.masterPlanProfile.rowCountRange, businessType).toEqual(
        expectedOneScopeRanges[businessType as keyof typeof expectedOneScopeRanges],
      )
      expect(recommendation.masterPlanProfile.rowCountRange[0], `${businessType} governed minimum`).toBeGreaterThanOrEqual(60)
      expect(recommendation.masterPlanProfile.rowCountRange[1], `${businessType} governed maximum`).toBeLessThanOrEqual(300)
      expect(resolveDefaultMasterPlanOperationalRowFloor(businessType), `${businessType} operational floor`).toBeGreaterThanOrEqual(60)
      expect(recommendation.expectedRowCount.detailed, businessType).toBeGreaterThanOrEqual(
        recommendation.masterPlanProfile.rowCountRange[1],
      )
    }
  })

  it('only consumes explicitly enabled project feature packs', () => {
    const disabled = buildTemplateRecommendation({
      businessType: 'school',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { hasCivilDefense: false },
      detailLevel: 'standard',
      buildingCount: 1,
    })
    const enabled = buildTemplateRecommendation({
      businessType: 'school',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { hasCivilDefense: true },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(disabled.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'china-civil-defense-specialty',
      'CDF-01-01-01',
      'CDF-01-01-02',
      'CDF-02-01-01',
      'CDF-02-01-02',
      'CDF-03-01-01',
    ]))
    expect(enabled.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-civil-defense-specialty',
      'CDF-01-01-01',
      'CDF-01-01-02',
      'CDF-02-01-01',
      'CDF-02-01-02',
      'CDF-03-01-01',
    ]))
  })

  it('carries foundation and pit candidates as selectable plan-scope facts without expanding every alternative', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ', 'bored_pile', 'diaphragm_wall'] as any,
      projectFeatures: {
        foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
      } as any,
      detailLevel: 'standard',
      buildingCount: 3,
      basementLevelCount: 2,
      foundationDepthM: 8,
    })

    expect(recommendation.foundationMethodCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'bored_pile',
        category: 'pile_foundation',
        selected: true,
      }),
      expect.objectContaining({
        code: 'diaphragm_wall',
        category: 'pit_support',
        selected: true,
      }),
    ]))
    expect(recommendation.foundationMethodCandidates.filter((item) => item.selected).map((item) => item.code)).toEqual([
      'bored_pile',
      'diaphragm_wall',
    ])
    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-foundation-pit-pile',
    ]))
  })

  it('normalizes legacy residential business type payloads instead of throwing during wizard generation', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'residential' as any,
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.businessType).toBe('general_civil')
    expect(recommendation.label).toBe('民用建筑')
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('civil_residential'),
    ]))
  })

  it('returns physical-space assignment rules for common civil specialty packs', () => {
    const rules = getScopeAssignmentRules('general_civil')

    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemPackPattern: 'WPI-01-01-0[14567]',
        effect: 'assign_to_scope_object',
        targetObjectType: 'basement',
      }),
      expect.objectContaining({
        itemPackPattern: 'OUT-',
        effect: 'assign_to_scope_object',
        targetObjectType: 'physical_zone',
        matchMetadata: { physicalSpaceKind: 'outdoor_site' },
      }),
      expect.objectContaining({
        itemPackPattern: 'UHR-03-01-02|UHR-04-01-09',
        effect: 'assign_to_scope_object',
        targetObjectType: 'floor',
        matchMetadata: { floorUsage: 'refuge' },
      }),
    ]))
  })

  it('returns common physical-space assignment rules for non-civil business types', () => {
    const rules = getScopeAssignmentRules('hospital')

    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemPackPattern: 'WPI-01-01-0[14567]',
        effect: 'assign_to_scope_object',
        targetObjectType: 'basement',
      }),
      expect.objectContaining({
        itemPackPattern: 'OUT-',
        effect: 'assign_to_scope_object',
        targetObjectType: 'physical_zone',
        matchMetadata: { physicalSpaceKind: 'outdoor_site' },
      }),
    ]))
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemPackPattern: 'CLN-01',
        effect: 'assign_to_functional_area',
        functionalAreaCategory: '手术区',
      }),
      expect.objectContaining({
        itemPackPattern: 'CLN-03',
        effect: 'assign_to_matching_buildings',
        matchFunctionalUsage: '医技楼',
      }),
    ]))
  })

  it('keeps business scope assignment labels readable for template matching', () => {
    expect(getScopeAssignmentRules('general_civil')).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'DEC-05', matchFunctionalUsage: '商业' }),
      expect.objectContaining({ itemPackPattern: 'facade', matchFunctionalUsage: '写字楼' }),
    ]))
    expect(getScopeAssignmentRules('industrial')).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'ICR-', matchFunctionalUsage: '主厂房' }),
      expect.objectContaining({ itemPackPattern: 'BDT-', matchFunctionalUsage: '主厂房' }),
    ]))
    expect(getScopeAssignmentRules('data_center')).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'DTC-', matchFunctionalUsage: '机房楼' }),
    ]))
    expect(getScopeAssignmentRules('tod_upper_cover')).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'TOD-03', matchFunctionalUsage: '转换层' }),
    ]))
  })

  it('adds deep foundation as a companion pack without replacing the residential pack', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { foundationDepthM: 12 },
      detailLevel: 'standard',
      buildingCount: 2,
    })

    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('residential + deep_foundation'),
      expect.stringContaining('A, L'),
    ]))
    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-gb55032-2022',
      'china-building-site-management',
      'china-foundation-pit-pile',
      'china-waterproof-insulation',
    ]))
  })

  it('uses special floor usage facts to trigger floor-specific construction and control packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      floorUsageCodes: ['transfer', 'refuge', 'mechanical', 'roof', 'ground_pilotis'],
    })

    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-building-fine-detail',
      'china-dangerous-subproject-control',
      'BDT-07-01-03',
      'china-cecs-fire-system',
      'china-hvac-system',
      'china-electrical-system',
      'china-waterproof-insulation',
    ]))
    expect(recommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-02',
      'DANGER-02-01-04',
    ]))
    expect(recommendation.suppressionRules).toEqual(expect.arrayContaining([
      'ground_pilotis_masonry_scope',
    ]))
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('Special floor usage: transfer'),
      expect.stringContaining('Special floor usage: refuge'),
      expect.stringContaining('Special floor usage: mechanical'),
      expect.stringContaining('Special floor usage: roof'),
      expect.stringContaining('Special floor usage: ground_pilotis'),
    ]))
  })

  it('uses physical-space facts to recommend schedulable basement, outdoor and refuge-floor packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'hospital',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 3,
      basementLevelCount: 2,
      physicalZoneTypeCodes: ['outdoor_site_plan'],
      floorUsageCodes: ['refuge'],
    })

    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-foundation-pit-pile',
      'china-waterproof-insulation',
      'china-gb55032-2022-outdoor',
      'china-ultra-high-rise-specialty',
      'UHR-03-01-02',
      'UHR-04-01-09',
    ]))
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('Basement scope'),
      expect.stringContaining('Outdoor physical space'),
      expect.stringContaining('Special floor usage: refuge'),
    ]))
  })

  it('uses independent engineering zone facts to recommend schedulable utility packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 2,
      physicalZoneTypeCodes: ['switching_station', 'fire_pump_room'],
    })

    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-electrical-system',
      'ELE-05-01-01',
      'china-plumbing-heating-system',
      'PLU-02-01-02',
      'china-cecs-fire-system',
      'FIR-05-01-02',
    ]))
    expect(recommendation.scopeAssignmentRules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemPackPattern: 'ELE-05-01-01',
        effect: 'assign_to_scope_object',
        targetObjectType: 'physical_zone',
        matchMetadata: {
          physicalSpaceKind: 'independent_engineering_zone',
          physicalCategory: 'switching_station',
        },
      }),
      expect.objectContaining({
        itemPackPattern: 'PLU-02-01-02|FIR-05-01-02',
        effect: 'assign_to_scope_object',
        targetObjectType: 'physical_zone',
        matchMetadata: {
          physicalSpaceKind: 'independent_engineering_zone',
          physicalCategory: 'fire_pump_room',
        },
      }),
    ]))
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('Independent engineering zone: switching_station'),
      expect.stringContaining('Independent engineering zone: fire_pump_room'),
    ]))
  })

  it('uses specialty independent-zone facts to recommend existing medical, data-center and TOD packs', () => {
    const hospitalRecommendation = buildTemplateRecommendation({
      businessType: 'hospital',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      physicalZoneTypeCodes: [
        'liquid_oxygen_station',
        'sewage_treatment_station',
        'hyperbaric_oxygen_chamber',
        'medical_waste_holding',
      ],
    })

    expect(hospitalRecommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-cleanroom-medical-specialty',
      'CLN-04-01-06',
      'CLN-04-01-32',
      'CLN-04-01-33',
      'CLN-04-01-40',
    ]))

    const dataCenterRecommendation = buildTemplateRecommendation({
      businessType: 'data_center',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      physicalZoneTypeCodes: ['substation', 'generator_yard', 'cooling_plant'],
    })

    expect(dataCenterRecommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-data-center-specialty',
      'china-electrical-system',
      'ELE-05-01-01',
      'DTC-02-01-02',
      'DTC-04-01-09',
      'DTC-04-01-10',
      'DTC-04-01-16',
    ]))

    const todRecommendation = buildTemplateRecommendation({
      businessType: 'tod_upper_cover',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      physicalZoneTypeCodes: ['railway_operation_zone', 'transfer_passage', 'traffic_connection_zone'],
    })

    expect(todRecommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
      'TOD-03-01-01',
      'TOD-04-01-13',
    ]))
    expect(todRecommendation.scopeAssignmentRules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        itemPackPattern: 'TOD-04-01-13',
        effect: 'assign_to_scope_object',
        targetObjectType: 'physical_zone',
        matchMetadata: {
          physicalSpaceKind: 'independent_engineering_zone',
          physicalCategory: 'transfer_passage',
        },
      }),
    ]))
  })

  it('uses railway operation zone facts themselves to recommend rail-interface packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      physicalZoneTypeCodes: ['railway_operation_zone'],
    })

    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
    ]))
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('Independent engineering zone: railway_operation_zone'),
    ]))
  })

  it('feeds real independent engineering-zone recommendations into scope attachment coverage', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'tod_upper_cover',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      physicalZoneTypeCodes: ['railway_operation_zone'],
    })

    const coverage = evaluateScopeTemplateCoverage({
      scopeAssignmentRules: recommendation.scopeAssignmentRules,
      generationScope: {
        scope_objects: [
          {
            id: 'railway-zone-1',
            type: 'physical_zone',
            name: '轨行区',
            metadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'railway_operation_zone',
            },
          },
        ],
      },
    })

    expect(recommendation.matchedTemplates).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
    ]))
    expect(coverage.summary).toEqual({
      autoSchedulableCount: 1,
      manualTaskRequiredCount: 0,
      missingRequiredScopeCount: 0,
    })
    expect(coverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '轨行区',
        status: 'auto_schedulable',
        matchedRulePatterns: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
      }),
    ]))
  })

  it('keeps every supported independent engineering-zone recommendation schedulable against a physical zone', () => {
    for (const physicalCategory of SUPPORTED_INDEPENDENT_ENGINEERING_ZONE_CODES) {
      const recommendation = buildTemplateRecommendation({
        businessType: 'general_civil',
        methodVariantCodes: ['cast_in_situ'],
        projectFeatures: {},
        detailLevel: 'standard',
        buildingCount: 1,
        physicalZoneTypeCodes: [physicalCategory],
      })
      const coverage = evaluateScopeTemplateCoverage({
        scopeAssignmentRules: recommendation.scopeAssignmentRules,
        generationScope: {
          scope_objects: [
            {
              id: `zone-${physicalCategory}`,
              type: 'physical_zone',
              name: physicalCategory,
              metadata: {
                physicalSpaceKind: 'independent_engineering_zone',
                physicalCategory,
              },
            },
          ],
        },
      })

      expect(recommendation.triggeredItemPacks.length, physicalCategory).toBeGreaterThan(0)
      const autoItem = coverage.items.find((item) => item.status === 'auto_schedulable')
      expect(autoItem, physicalCategory).toBeTruthy()
      expect(autoItem?.matchedRulePatterns.length, physicalCategory).toBeGreaterThan(0)
      expect(coverage.summary.manualTaskRequiredCount, physicalCategory).toBe(0)
      expect(coverage.summary.missingRequiredScopeCount, physicalCategory).toBe(0)
    }
  })

  it('maps high-formwork support height to schedulable danger-control item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: { supportHeightM: 9 },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'DANGER-01-01-02',
      'DANGER-02-01-04',
    ]))
    expect(recommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-02',
      'DANGER-02-01-04',
    ]))
    expect(recommendation.recommendationRationale).toEqual(expect.arrayContaining([
      expect.stringContaining('High formwork=9'),
    ]))
  })

  it('maps prefab system facts to the correct PCF and ALC item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      prefabSystemCodes: ['pcf_facade_panel', 'alc_partition_panel'],
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-prefabricated-assembly',
      'PFB-01-01-07',
      'PFB-04-01-10',
      'PFB-02-01-05',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'PFB-01-01-09',
      'PFB-01-01-10',
    ]))
    expect(recommendation.suppressionRules).toEqual(expect.arrayContaining([
      '03-02',
      '03-03',
      '03-10',
      '02-02-05',
    ]))
  })

  it('maps prefab-rate feature to schedulable PC lifecycle and acceptance item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {
        prefabRate: 45,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'china-prefabricated-assembly',
      'DANGER-01-01-13',
      'DANGER-02-01-06',
      'PFB-00-01-01',
      'PFB-00-01-02',
      'PFB-00-01-03',
      'PFB-01-01-01',
      'PFB-01-01-02',
      'PFB-02-01-01',
      'PFB-02-01-03',
      'PFB-03-01-02',
      'PFB-03-01-03',
      'PFB-04-01-01',
      'PFB-04-01-02',
      'PFB-04-01-03',
      'PFB-04-01-04',
      'PFB-04-01-11',
      'PFB-04-01-12',
      'PFB-04-01-13',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'PFB-00',
      'PFB-01',
      'PFB-02',
      'PFB-03',
      'PFB-04',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'prefab_rate_acceptance',
    ]))
    expect(recommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-13',
      'DANGER-02-01-06',
    ]))
  })

  it('maps precast-concrete method to schedulable PC factory, erection, joint, and handover item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      methodVariantCodes: ['precast_concrete'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'china-prefabricated-assembly',
      'DANGER-01-01-13',
      'DANGER-02-01-06',
      'PFB-00-01-01',
      'PFB-00-01-02',
      'PFB-00-01-03',
      'PFB-01-01-01',
      'PFB-01-01-02',
      'PFB-01-01-03',
      'PFB-01-01-04',
      'PFB-02-01-01',
      'PFB-02-01-03',
      'PFB-02-01-04',
      'PFB-03-01-01',
      'PFB-03-01-02',
      'PFB-03-01-03',
      'PFB-04-01-01',
      'PFB-04-01-02',
      'PFB-04-01-03',
      'PFB-04-01-04',
      'PFB-04-01-11',
      'PFB-04-01-12',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'PFB-00',
      'PFB-01',
      'PFB-02',
      'PFB-03',
    ]))
    expect(recommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-13',
      'DANGER-02-01-06',
    ]))
  })

  it('maps modular and integrated unit systems to schedulable factory, site, FAT, and handover item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'modular_building',
      businessSubtype: null,
      methodVariantCodes: ['modular_mic'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      prefabSystemCodes: ['integrated_bathroom', 'integrated_kitchen'],
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'china-modular-mic-specialty',
      'DANGER-01-01-13',
      'DANGER-01-01-14',
      'DANGER-02-01-06',
      'MIC-01-01-01',
      'MIC-01-01-02',
      'MIC-02-01-01',
      'MIC-02-01-02',
      'MIC-03-01-01',
      'MIC-03-01-02',
      'MIC-04-01-01',
      'MIC-04-01-02',
      'MIC-05-01-01',
      'MIC-05-01-02',
      'MIC-06-01-01',
      'MIC-06-01-02',
      'MIC-06-01-03',
      'MIC-06-01-04',
      'MIC-06-01-05',
      'MIC-06-01-06',
      'MIC-06-01-07',
      'MIC-06-01-08',
      'MIC-06-01-09',
      'MIC-06-01-10',
      'MIC-06-01-11',
      'MIC-06-01-12',
      'MIC-06-01-13',
      'MIC-06-01-14',
      'MIC-06-01-15',
      'MIC-06-01-16',
      'MIC-06-01-17',
      'MIC-06-01-18',
      'MIC-06-01-19',
      'MIC-06-01-20',
      'MIC-06-01-21',
      'MIC-06-01-22',
      'china-prefab-bathroom-specialty',
      'IBU-01-01-01',
      'IBU-01-01-02',
      'IBU-01-02-01',
      'IBU-02-01-01',
      'IBU-03-01-01',
      'IBU-03-01-03',
      'IBU-03-01-05',
      'china-prefab-kitchen-specialty',
      'IKU-01-01-01',
      'IKU-01-01-02',
      'IKU-01-02-01',
      'IKU-02-01-01',
      'IKU-03-01-01',
      'IKU-03-01-03',
      'IKU-03-01-05',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'MIC-06',
      'IBU-03',
      'IKU-03',
    ]))
    expect(recommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-13',
      'DANGER-01-01-14',
      'DANGER-02-01-06',
    ]))
  })

  it('maps steel-frame method to schedulable fabrication, hoisting, coating, and envelope item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-steel-structure-specialty',
      'STL-01-01-01',
      'STL-01-01-02',
      'STL-02-01-01',
      'STL-02-01-02',
      'STL-03-01-01',
      'STL-04-01-01',
      'STL-04-01-02',
      'STL-04-01-03',
      'STL-04-01-04',
      'STL-04-01-05',
      'STL-04-01-06',
      'STL-04-01-07',
      'STL-04-01-08',
      'STL-04-01-10',
      'STL-04-01-11',
      'STL-04-01-13',
      'STL-04-01-14',
      'STL-04-01-15',
      'STL-04-01-16',
      'STL-04-01-17',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'STL-01',
      'STL-02',
      'STL-03',
    ]))
  })

  it('maps TOD operation and occupied-renovation facts to precise existing specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation', 'occupied_renovation'],
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-02',
      'TOD-04-01-01',
      'TOD-04-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
      'TOD-04-01-18',
      'TOD-04-01-22',
      'china-renovation-retrofit-specialty',
      'RNV-01-01-01',
      'RNV-01-01-02',
      'RNV-03-01-01',
      'RNV-03-01-02',
      'RNV-04-01-04',
      'RNV-04-01-16',
      'RNV-04-01-18',
      'RNV-04-01-21',
      'RNV-04-01-22',
      'RNV-04-01-23',
      'RNV-04-01-24',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'TOD-04',
      'RNV-06',
      'RNV-04',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'metro_operator_acceptance',
    ]))
  })

  it('maps external protection interfaces to precise existing monitoring and specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      externalInterfaceCodes: [
        'metro_operation_interface',
        'heritage_protection_interface',
        'high_voltage_protection_interface',
      ],
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-01',
      'TOD-01-01-02',
      'TOD-04-01-01',
      'TOD-04-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
      'china-foundation-pit-pile',
      'FND-06-01-01',
      'FND-06-01-03',
      'FND-06-01-04',
      'FND-06-01-05',
      'china-heritage-preservation-specialty',
      'HRT-01-01-01',
      'HRT-01-01-02',
      'HRT-03-01-01',
      'HRT-04-01-01',
      'HRT-04-01-02',
      'HRT-04-01-03',
      'HRT-04-01-14',
      'HRT-04-01-15',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'TOD-01',
      'TOD-04',
      'FND-06',
      'HRT-01',
      'HRT-04',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'metro_operator_acceptance',
    ]))
  })

  it('maps heritage protection and fitout delivery facts without wrong-domain or bare division codes', () => {
    const heritageRecommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      externalInterfaceCodes: ['heritage_protection_interface'],
    })

    expect(heritageRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-heritage-preservation-specialty',
      'HRT-01-01-01',
      'HRT-01-01-02',
      'HRT-03-01-01',
    ]))
    expect(heritageRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'FND-06-01-02',
    ]))

    const publicAreaRecommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      deliveryStandard: 'public_area_fitout',
    })
    expect(publicAreaRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-jgj-tianjin-decoration',
      'DEC-05-01-01',
      'DEC-05-01-02',
    ]))
    expect(publicAreaRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'DEC-05',
    ]))

    const fullFitoutRecommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      deliveryStandard: 'full_fitout',
    })
    expect(fullFitoutRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-jgj-tianjin-decoration',
      'DEC-01-01-01',
      'DEC-01-02-01',
      'DEC-02-01-01',
      'DEC-02-01-02',
      'DEC-02-01-03',
      'DEC-02-02-01',
      'DEC-03-01-01',
      'DEC-03-01-02',
      'DEC-03-02-01',
      'DEC-03A-01-01',
      'DEC-06-01-01',
    ]))
    expect(fullFitoutRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'DEC',
    ]))
  })

  it('maps hotel-opening delivery to hotel specialty trial-operation and brand handover item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'hotel',
      businessSubtype: null,
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {},
      detailLevel: 'standard',
      buildingCount: 1,
      deliveryStandard: 'hotel_opening',
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-hotel-specialty',
      'HTL-01-01-01',
      'HTL-01-01-02',
      'HTL-02-01-01',
      'HTL-03-01-01',
      'HTL-04-01-01',
      'HTL-04-01-02',
      'HTL-05-01-01',
      'HTL-05-01-02',
      'HTL-06-01-24',
      'HTL-06-01-25',
      'HTL-06-01-26',
      'HTL-06-01-27',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'HTL-01',
      'HTL-05',
      'HTL-06',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'trial_opening',
    ]))
  })

  it('maps project feature aliases to existing precise specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        non_stop_operation: true,
        occupied_renovation: true,
        seismic_retrofit_level: 2,
        noise_dual_control: true,
        commercial_arcade: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-02',
      'TOD-04-01-02',
      'TOD-04-01-08',
      'TOD-04-01-09',
      'TOD-04-01-15',
      'TOD-04-01-18',
      'TOD-04-01-22',
      'china-renovation-retrofit-specialty',
      'RNV-01-01-01',
      'RNV-01-01-02',
      'RNV-03-01-01',
      'RNV-03-01-02',
      'RNV-04-01-04',
      'RNV-04-01-16',
      'RNV-04-01-18',
      'RNV-04-01-21',
      'RNV-04-01-22',
      'RNV-04-01-23',
      'RNV-04-01-24',
      'RNV-04-01-08',
      'RNV-04-01-09',
      'RNV-04-01-10',
      'RNV-04-01-11',
      'china-jgj-tianjin-decoration',
      'DEC-05-01-01',
      'DEC-05-01-02',
      'china-facade-curtain-wall',
      'FAC-01-01-01',
      'FAC-01-01-02',
      'FAC-02-01-01',
      'FAC-02-01-02',
      'FAC-03-01-01',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'TOD-04',
      'TOD-05',
      'RNV-05',
      'RNV-06',
      'DEC-05',
    ]))
  })

  it('maps existing-structure age feature to renovation survey and appraisal item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        existing_structure_year: 1988,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-renovation-retrofit-specialty',
      'RNV-01-01-01',
      'RNV-04-01-01',
      'RNV-04-01-02',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'RNV-01',
    ]))
  })

  it('maps hospital cleanroom feature aliases to precise medical specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'hospital',
      businessSubtype: null,
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        has_linac: true,
        has_mri: true,
        has_bsl2: true,
        has_hbo_chamber: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-cleanroom-medical-specialty',
      'CLN-01-01-01',
      'CLN-01-01-02',
      'CLN-02-01-01',
      'CLN-02-01-02',
      'CLN-03-01-02',
      'CLN-03-01-03',
      'CLN-03-01-04',
      'CLN-03-01-05',
      'CLN-04-01-01',
      'CLN-04-01-02',
      'CLN-04-01-03',
      'CLN-04-01-04',
      'CLN-04-01-05',
      'CLN-04-01-06',
      'CLN-04-01-07',
      'CLN-04-01-08',
      'CLN-04-01-09',
      'CLN-04-01-10',
      'CLN-04-01-11',
      'CLN-04-01-12',
      'CLN-04-01-13',
      'CLN-04-01-18',
      'CLN-04-01-19',
      'CLN-04-01-20',
      'CLN-04-01-21',
      'CLN-04-01-23',
      'CLN-04-01-24',
      'CLN-04-01-27',
      'CLN-04-01-28',
      'CLN-04-01-36',
      'CLN-04-01-40',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'CLN-01',
      'CLN-02',
      'CLN-01-02',
      'CLN-08-01-03',
      'CLN-08-01-05',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'medical_gas_acceptance',
      'health_supervision_acceptance',
      'biosafety_acceptance',
    ]))
    expect(recommendation.triggeredDangerItems).not.toEqual(expect.arrayContaining([
      'DANGER-01-01-18',
    ]))
  })

  it('maps data-center feature aliases and scope assignment to DTC specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'data_center',
      businessSubtype: null,
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {
        has_dcim: true,
        cabinet_density: 18,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-data-center-specialty',
      'DTC-02-01-01',
      'DTC-02-01-02',
      'DTC-02-02-01',
      'DTC-02-02-02',
      'DTC-04-01-03',
      'DTC-04-01-04',
      'DTC-04-01-05',
      'DTC-04-01-06',
      'DTC-04-01-07',
      'DTC-04-01-08',
      'DTC-04-01-09',
      'DTC-04-01-10',
      'DTC-04-01-11',
      'DTC-04-01-12',
      'DTC-04-01-13',
      'DTC-04-01-14',
      'DTC-04-01-15',
      'DTC-04-01-16',
      'DTC-04-01-17',
      'DTC-04-01-18',
      'DTC-04-01-19',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'DCN-03',
      'N+1-switching',
      'DCN-08-01-04',
      'DCN-06-01-06',
    ]))

    const dataCenterScopeRules = getScopeAssignmentRules('data_center')
    expect(dataCenterScopeRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'DTC-' }),
    ]))
    expect(dataCenterScopeRules).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ itemPackPattern: 'DCN-' }),
    ]))
  })

  it('maps data-center tier and size facts to schedulable DTC room, rack, test, and handover item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'data_center',
      businessSubtype: null,
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {
        tier_level: 3,
        data_center_size: 600,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-data-center-specialty',
      'DTC-01-01-01',
      'DTC-01-01-02',
      'DTC-03-01-01',
      'DTC-04-01-01',
      'DTC-04-01-02',
      'DTC-04-01-03',
      'DTC-04-01-04',
      'DTC-04-01-05',
      'DTC-04-01-06',
      'DTC-04-01-24',
      'DTC-04-01-25',
      'DTC-04-01-26',
      'DTC-04-01-27',
      'DTC-04-01-28',
      'DTC-04-01-29',
      'DTC-04-01-30',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'DCN-03',
      'DCN-08-01-04',
      'DTC-01',
      'DTC-04',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'TCDD',
      'TCCF',
      'TCOS',
    ]))
  })

  it('maps industrial cleanroom feature aliases to precise ICR specialty item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'industrial',
      businessSubtype: 'industrial_cleanroom',
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {
        cleanroom_grade: 1000,
        explosion_proof: 1,
        process_pure_water: 10,
        voc_treatment: true,
        chemical_waste: 1,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-industrial-cleanroom-specialty',
      'ICR-01-01-01',
      'ICR-01-01-02',
      'ICR-02-01-01',
      'ICR-02-01-02',
      'ICR-02-02-01',
      'ICR-03-01-01',
      'ICR-03-01-02',
      'ICR-03-02-01',
      'ICR-04-02-01',
      'ICR-05-01-01',
      'ICR-05-01-02',
      'ICR-05-01-03',
      'ICR-05-01-04',
      'ICR-05-01-05',
      'ICR-05-01-08',
      'ICR-05-01-11',
      'ICR-05-01-12',
      'ICR-05-01-17',
      'ICR-05-01-18',
      'ICR-05-01-19',
      'ICR-05-01-20',
      'ICR-05-01-30',
      'ICR-05-01-31',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'ICR-03',
      'ICR-04',
      'ICR-06',
      'ICR-07-01-01',
      'ICR-04-01-04',
      'ICR-04-01-06',
      'ICR-06-01-03',
      'ICR-06-01-04',
      'ICR-06-01-05',
      'ICR-06-01-06',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'DQ',
      'IQ',
      'OQ',
      'PQ',
    ]))
  })

  it('maps TOD, steel, and foundation feature aliases to precise specialty item packs', () => {
    const todRecommendation = buildTemplateRecommendation({
      businessType: 'tod_upper_cover',
      businessSubtype: null,
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        three_level_isolation: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(todRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-02-01-02',
      'TOD-04-01-01',
      'TOD-04-01-02',
      'TOD-04-01-04',
      'TOD-04-01-09',
      'TOD-04-01-15',
      'TOD-04-01-20',
    ]))
    expect(todRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'TOD-03',
    ]))

    const steelRecommendation = buildTemplateRecommendation({
      businessType: 'transportation_hub',
      businessSubtype: null,
      methodVariantCodes: ['steel_frame'],
      projectFeatures: {
        integral_lifting: 80,
        shm_monitoring: true,
        ptfe_membrane: 5000,
        transport_interface: true,
        large_span: 80,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(steelRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'china-steel-structure-specialty',
      'DANGER-01-01-10',
      'DANGER-01-01-16',
      'STL-04-01-09',
      'STL-04-01-12',
      'STL-04-01-18',
      'STL-04-01-19',
      'STL-04-01-20',
      'STL-04-01-21',
      'STL-04-01-24',
      'STL-04-01-25',
      'STL-04-01-27',
      'STL-04-01-28',
      'STL-04-01-29',
    ]))
    expect(steelRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'STL-04',
      'STL-05',
      'STL-06',
      'STL-07',
      'STL-08',
      'STL-07-01-03',
      'STL-08-01-01',
      'STL-08-01-02',
      'STL-08-01-03',
      'STL-08-01-04',
      'STL-08-01-05',
      'STL-08-01-06',
    ]))
    expect(steelRecommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-01-01-10',
      'DANGER-01-01-16',
    ]))

    const foundationRecommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        deep_pit: 12,
        soft_soil: true,
        rock_foundation: true,
        diaphragm_wall: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(foundationRecommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-dangerous-subproject-control',
      'china-foundation-pit-pile',
      'DANGER-DEEP-PIT-APPROVAL',
      'DANGER-01-01-01',
      'DANGER-02-01-08',
      'FND-01-01-02',
      'FND-02-01-01',
      'FND-02-01-02',
      'FND-04-01-01',
      'FND-04-01-02',
      'FND-04-01-03',
      'FND-04-01-04',
      'FND-04-01-05',
      'FND-04-01-06',
      'FND-04-01-07',
      'FND-04-01-08',
      'FND-04-01-09',
      'FND-04-01-10',
      'FND-04-01-11',
      'FND-04-01-12',
      'FND-04-01-13',
      'FND-04-01-14',
      'FND-04-01-15',
      'FND-04-01-16',
      'FND-05-01-01',
      'FND-05-01-02',
      'FND-05-01-03',
      'FND-05-01-04',
      'FND-06-01-01',
      'FND-06-01-02',
      'FND-06-01-03',
      'FND-06-01-04',
      'FND-06-01-05',
    ]))
    expect(foundationRecommendation.triggeredDangerItems).toEqual(expect.arrayContaining([
      'DANGER-DEEP-PIT-APPROVAL',
      'DANGER-01-01-01',
      'DANGER-02-01-08',
    ]))
    expect(foundationRecommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'DANGER-01-01-42',
      'DANGER-01-01-43',
      'DANGER-01-01-44',
      'FND-01-02',
      'FND-02-02',
    ]))
  })

  it('maps general project feature aliases to precise existing item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        hasCivilDefense: true,
        has_helipad: true,
        has_pool: 1,
        has_spa: true,
        has_central_kitchen: true,
        green_building: 2,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-civil-defense-specialty',
      'CDF-01-01-01',
      'CDF-01-01-02',
      'CDF-02-01-01',
      'CDF-02-01-02',
      'CDF-03-01-01',
      'china-building-fine-detail',
      'BDT-05-01-01',
      'BDT-05-01-02',
      'BDT-05-01-03',
      'BDT-05-01-04',
      'BDT-07-01-04',
      'china-gb55032-2022',
      '04-05-09',
      '04-05-10',
      '04-05-11',
      '05-11-01',
      '05-11-02',
      '05-11-03',
      '05-11-04',
      '05-11-05',
      'china-jgj-tianjin-decoration',
      'DEC-08-01-01',
      'china-plumbing-heating-system',
      'PLU-01-01-01',
      'PLU-01-01-02',
      'PLU-02-01-01',
      'PLU-02-01-02',
      'PLU-05-01-01',
      'PLU-06-01-01',
      'china-hvac-system',
      'HVA-04-01-01',
      '09-01-01',
      '09-02-01',
      '09-03-01',
      '09-04-01',
      '09-05-01',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'civil_defense_specialty',
      'building_fine_detail',
      'GB-05-11',
      'DEC-08',
      'DEC',
      'plumbing_addon',
      'HVA-04',
      'plumbing_gas',
      'GB-09',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'civil_defense_acceptance',
      'aviation_suitability_acceptance',
      'food_safety_acceptance',
      'energy_saving_acceptance',
    ]))
  })

  it('maps adjacent-interface and heritage feature aliases to precise existing item packs', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'general_civil',
      businessSubtype: 'civil_complex',
      methodVariantCodes: ['cast_in_situ'],
      projectFeatures: {
        near_metro: 8,
        near_heritage: 15,
        near_high_voltage: 12,
        heritage_level: 2,
        composite_structure: true,
      },
      detailLevel: 'standard',
      buildingCount: 1,
    })

    expect(recommendation.triggeredItemPacks).toEqual(expect.arrayContaining([
      'china-tod-upper-cover-specialty',
      'TOD-01-01-01',
      'TOD-01-01-02',
      'TOD-04-01-01',
      'TOD-04-01-02',
      'TOD-04-01-08',
      'china-foundation-pit-pile',
      'FND-06-01-01',
      'FND-06-01-02',
      'FND-06-01-03',
      'FND-06-01-04',
      'FND-06-01-05',
      'china-heritage-preservation-specialty',
      'HRT-01-01-01',
      'HRT-01-01-02',
      'HRT-03-01-01',
      'HRT-04-01-01',
      'HRT-04-01-02',
      'HRT-04-01-03',
      'HRT-04-01-14',
      'HRT-04-01-15',
      'china-building-fine-detail',
      'BDT-04-01-03',
    ]))
    expect(recommendation.triggeredItemPacks).not.toEqual(expect.arrayContaining([
      'TOD-01',
      'TOD-04',
      'FND-06',
      'HRT-01',
      'HRT-04',
      'building_fine_detail',
    ]))
    expect(recommendation.triggeredMilestones).toEqual(expect.arrayContaining([
      'metro_operator_acceptance',
      'heritage_acceptance',
    ]))
  })
})
