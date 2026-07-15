import { describe, expect, it } from 'vitest'

import type { TemplateRecommendation } from '../services/projectFactsToTemplateService.js'
import { buildTemplateRecommendation } from '../services/projectFactsToTemplateService.js'
import { buildWizardTemplateSelection } from '../services/wizardTemplateSelectionService.js'

function recommendationWithMilestones(
  triggeredMilestones: string[],
  overrides: Partial<TemplateRecommendation> = {},
): TemplateRecommendation {
  return {
    businessType: 'hotel',
    label: 'Hotel',
    matchedTemplates: [],
    triggeredItemPacks: [],
    triggeredItemPackSources: {},
    triggeredItemPackScopeTargets: {},
    triggeredMilestones,
    triggeredDangerItems: [],
    suppressionRules: [],
    scopeAssignmentRules: [],
    expectedRowCount: { overview: 1, standard: 1, detailed: 1 },
    defaultPlanOutput: 'master_plan',
    masterPlanProfile: {
      layer: 'master_plan',
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      rowCountRange: [1, 20],
      rowProjectionMode: 'schedule_row',
      supportLayerPolicy: {
        managementChecklists: 'suppress_from_primary_schedule',
        gateMarkers: 'supporting_evidence_not_default_gantt_rows',
        inlineControls: 'embedded_under_schedule_rows',
        linkedProjections: 'review_reference_not_default_gantt_rows',
      },
      mutationBoundary: {
        writesProductionDependencies: false,
        writesProductionDates: false,
        writesCriticalPathFacts: false,
      },
    },
    foundationMethodCandidates: [],
    buildingPatternScheduleTrust: null,
    recommendationRationale: [],
    ...overrides,
  } as TemplateRecommendation
}

describe('wizard template selection triggered milestones', () => {
  it('adds broad hospital control packs without auto-selecting optional specialty rooms', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'hospital',
    }))

    expect(selection.templateIds).toContain('china-cleanroom-medical-specialty')
    expect(selection.selectedNodesByTemplate['china-cleanroom-medical-specialty']).toEqual(expect.arrayContaining([
      'CLN-03-01-01',
      'CLN-03-01-02',
    ]))
    expect(selection.selectedNodesByTemplate['china-cleanroom-medical-specialty']).not.toContain('CLN-04-01-23')
    expect(selection.selectedNodesByTemplate['china-cecs-fire-system']).toEqual(expect.arrayContaining([
      'FIR-01-01-01',
      'FIR-03-02-01',
      'FIR-05-01-02',
    ]))
    expect(selection.selectedNodesByTemplate['china-hvac-system']).toContain('HVA-02-01-02')
    expect(selection.selectedNodesByTemplate['china-plumbing-heating-system']).toContain('PLU-01-01-01')
    expect(selection.selectedNodesByTemplate['china-electrical-system']).toContain('ELE-01-01-01')
    expect(selection.selectedNodesByTemplate['china-intelligent-building-system']).toContain('INT-02-01-02')
    expect(selection.selectedNodesByTemplate['china-elevator-installation']).toContain('ELV-02-01-01')
  })

  it('selects dedicated hotel delivery controls for an ordinary hotel master plan', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'hotel',
    }))

    expect(selection.templateIds).toContain('china-hotel-specialty')
    expect(selection.selectedNodesByTemplate['china-hotel-specialty']).toEqual(expect.arrayContaining([
      'HTL-01-01-01',
      'HTL-01-01-02',
      'HTL-02-01-01',
      'HTL-03-01-01',
      'HTL-04-01-02',
      'HTL-05-01-02',
    ]))
    expect(selection.selectedNodesByTemplate['china-hotel-specialty']).not.toContain('HTL-01-02-01')
    expect(selection.selectedNodesByTemplate['china-hotel-specialty']).not.toContain('HTL-04-01-01')
    expect(selection.selectedNodesByTemplate['china-cecs-fire-system']).toEqual(expect.arrayContaining([
      'FIR-01-01-01',
      'FIR-03-02-01',
    ]))
    expect(selection.selectedNodesByTemplate['china-hvac-system']).toContain('HVA-02-01-02')
    expect(selection.selectedNodesByTemplate['china-plumbing-heating-system']).toContain('PLU-01-01-01')
    expect(selection.selectedNodesByTemplate['china-electrical-system']).toContain('ELE-01-01-01')
    expect(selection.selectedNodesByTemplate['china-intelligent-building-system']).toContain('INT-02-01-02')
    expect(selection.selectedNodesByTemplate['china-elevator-installation']).toContain('ELV-02-01-01')
  })

  it('selects existing campus specialty controls for an ordinary school master plan', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'school',
    }))

    expect(selection.templateIds).toContain('china-campus-specialty')
    expect(selection.selectedNodesByTemplate['china-campus-specialty']).toEqual(expect.arrayContaining([
      'CMP-02-01-03',
      'CMP-03-01-01',
      'CMP-04-01-01',
    ]))
    expect(selection.selectedNodesByTemplate['china-campus-specialty']).not.toContain('CMP-01-01-02')
    expect(selection.selectedNodesByTemplate['china-campus-specialty']).not.toContain('CMP-03-01-02')
    expect(selection.selectedNodesByTemplate['china-campus-specialty']).not.toContain('CMP-04-01-02')
  })

  it('adds sports-field controls only when the school scope contains a playground', () => {
    const recommendation = buildTemplateRecommendation({
      businessType: 'school',
      methodVariantCodes: [],
      projectFeatures: {},
      detailLevel: 'overview',
      buildingCount: 1,
      physicalZoneTypeCodes: ['outdoor_site', 'playground'],
    }, { runtimeBenchmarkResults: [] })
    const selection = buildWizardTemplateSelection(recommendation)

    expect(recommendation.triggeredItemPacks).toContain('CMP-03-01-02')
    expect(recommendation.triggeredItemPackScopeTargets['CMP-03-01-02']).toEqual(['playground'])
    expect(selection.selectedNodesByTemplate['china-campus-specialty']).toEqual(expect.arrayContaining([
      'CMP-03-01-01',
      'CMP-03-01-02',
    ]))
  })

  it('selects physical retrofit controls instead of relying on renovation coordination rows', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'renovation',
    }))

    expect(selection.templateIds).toContain('china-renovation-retrofit-specialty')
    expect(selection.selectedNodesByTemplate['china-renovation-retrofit-specialty']).toEqual(expect.arrayContaining([
      'RNV-01-01-01',
      'RNV-01-01-02',
      'RNV-02-01-02',
      'RNV-02-01-03',
      'RNV-02-02-01',
      'RNV-02-02-02',
      'RNV-04-01-01',
      'RNV-04-01-02',
      'RNV-04-01-03',
      'RNV-04-01-04',
      'RNV-04-01-05',
      'RNV-04-01-06',
      'RNV-04-01-07',
      'RNV-04-01-08',
      'RNV-04-01-09',
      'RNV-04-01-10',
      'RNV-04-01-11',
      'RNV-04-01-12',
      'RNV-04-01-13',
      'RNV-04-01-14',
      'RNV-04-01-15',
      'RNV-04-01-16',
      'RNV-04-01-17',
      'RNV-04-01-18',
      'RNV-04-01-19',
      'RNV-04-01-20',
      'RNV-04-01-21',
      'RNV-04-01-22',
      'RNV-04-01-23',
      'RNV-04-01-24',
      'RNV-04-01-27',
      'RNV-04-01-28',
    ]))
    expect(selection.selectedNodesByTemplate['china-renovation-retrofit-specialty']).not.toContain('RNV-02-01-01')
    expect(selection.selectedNodesByTemplate['china-renovation-retrofit-specialty']).not.toContain('RNV-03-01-01')
    expect(selection.selectedNodesByTemplate['china-cecs-fire-system']).toContain('FIR-03-02-01')
    expect(selection.selectedNodesByTemplate['china-electrical-system']).toContain('ELE-02-01-01')
    expect(selection.selectedNodesByTemplate['china-plumbing-heating-system']).toContain('PLU-01-01-02')
  })

  it('selects TOD field controls without promoting night-window management as a master task', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'tod_upper_cover',
    }))

    expect(selection.templateIds).toContain('china-tod-upper-cover-specialty')
    expect(selection.selectedNodesByTemplate['china-tod-upper-cover-specialty']).toEqual(expect.arrayContaining([
      'TOD-02-01-01',
      'TOD-02-01-02',
      'TOD-03-01-01',
      'TOD-03-01-03',
      'TOD-04-01-03',
      'TOD-04-01-12',
      'TOD-04-01-19',
      'TOD-04-01-23',
    ]))
    expect(selection.selectedNodesByTemplate['china-tod-upper-cover-specialty']).not.toContain('TOD-01-01-02')
    expect(selection.selectedNodesByTemplate['china-tod-upper-cover-specialty']).not.toContain('TOD-04-01-08')
  })

  it('selects the MiC factory-to-site delivery chain as modular master-control assets', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
      businessType: 'modular_building',
    }))

    expect(selection.templateIds).toContain('china-modular-mic-specialty')
    expect(selection.selectedNodesByTemplate['china-modular-mic-specialty']).toEqual(expect.arrayContaining([
      'MIC-01-01-01',
      'MIC-02-01-01',
      'MIC-02-01-03',
      'MIC-03-01-01',
      'MIC-03-01-02',
      'MIC-04-01-01',
      'MIC-04-01-02',
      'MIC-05-01-01',
      'MIC-05-01-02',
      'MIC-06-01-10',
      'MIC-06-01-18',
      'MIC-06-01-20',
    ]))
  })

  it('selects dedicated field-control catalogs for generic industrial, hub, and venue master plans', () => {
    const cases = [
      {
        businessType: 'industrial',
        templateId: 'china-industrial-plant-specialty',
        expectedCodes: ['IPL-01-01-01', 'IPL-02-01-01', 'IPL-03-01-01', 'IPL-04-01-01'],
      },
      {
        businessType: 'transportation_hub',
        templateId: 'china-transportation-hub-specialty',
        expectedCodes: ['TRH-01-01-01', 'TRH-02-01-01', 'TRH-02-01-03', 'TRH-03-01-02'],
      },
      {
        businessType: 'sports_culture',
        templateId: 'china-sports-culture-specialty',
        expectedCodes: ['SPC-01-01-01', 'SPC-02-01-01', 'SPC-03-01-01', 'SPC-04-01-01'],
      },
    ] as const

    for (const testCase of cases) {
      const selection = buildWizardTemplateSelection(recommendationWithMilestones([], {
        businessType: testCase.businessType,
      }))
      expect(selection.templateIds, testCase.businessType).toContain(testCase.templateId)
      expect(selection.selectedNodesByTemplate[testCase.templateId], testCase.businessType).toEqual(
        expect.arrayContaining([...testCase.expectedCodes]),
      )
    }
  })

  it('selects subtype overlays from the resolved construction-organization strategy without expanding every subtype', () => {
    const cases = [
      {
        businessType: 'industrial',
        projectFeatures: { automated_warehouse: true },
        expectedVariant: 'industrial_logistics_automation',
        templateId: 'china-industrial-plant-specialty',
        expectedCodes: ['IPL-05-01-01', 'IPL-05-01-02', 'IPL-05-04-01', 'IPL-05-04-02'],
        excludedCodes: ['IPL-05-02-01', 'IPL-05-03-01'],
      },
      {
        businessType: 'transportation_hub',
        projectFeatures: { metro_interchange: true },
        expectedVariant: 'transportation_metro_interchange',
        templateId: 'china-transportation-hub-specialty',
        expectedCodes: ['TRH-04-02-01', 'TRH-04-02-02', 'TRH-04-04-01', 'TRH-04-04-02'],
        excludedCodes: ['TRH-04-01-01', 'TRH-04-03-01'],
      },
      {
        businessType: 'sports_culture',
        projectFeatures: { theater: true },
        expectedVariant: 'sports_culture_theater',
        templateId: 'china-sports-culture-specialty',
        expectedCodes: ['SPC-05-02-01', 'SPC-05-02-02', 'SPC-05-04-01', 'SPC-05-04-02'],
        excludedCodes: ['SPC-05-01-01', 'SPC-05-03-01'],
      },
    ] as const

    for (const testCase of cases) {
      const recommendation = buildTemplateRecommendation({
        businessType: testCase.businessType,
        methodVariantCodes: [],
        projectFeatures: { ...testCase.projectFeatures },
        detailLevel: 'standard',
        buildingCount: 1,
      }, { runtimeBenchmarkResults: [] })
      const organizationVariant = (recommendation as TemplateRecommendation & {
        projectOrganizationVariantCode?: string
      }).projectOrganizationVariantCode
      const selection = buildWizardTemplateSelection(recommendation)
      const selectedCodes = selection.selectedNodesByTemplate[testCase.templateId] ?? []

      expect(organizationVariant, testCase.businessType).toBe(testCase.expectedVariant)
      expect(selectedCodes, testCase.businessType).toEqual(expect.arrayContaining([...testCase.expectedCodes]))
      for (const excludedCode of testCase.excludedCodes) {
        expect(selectedCodes, `${testCase.businessType}:${excludedCode}`).not.toContain(excludedCode)
      }
    }
  })

  it('materializes feature-triggered semantic milestones as project milestone template nodes', () => {
    const selection = buildWizardTemplateSelection(recommendationWithMilestones([
      'completion_acceptance',
      'owner_handover',
      'trial_opening',
      'production_validation',
      'mep_transfer_ready',
      'metro_operator_acceptance',
      'refuge_floor_fire_life_safety_acceptance',
      'medical_gas_acceptance',
      'pile_foundation_acceptance',
    ]))

    expect(selection.templateIds).toContain('china-project-milestone-handover')
    expect(selection.selectedNodesByTemplate['china-project-milestone-handover']).toEqual(expect.arrayContaining([
      'MS-01-01-08',
      'MS-01-01-11',
      'MS-01-01-12',
      'MS-01-01-17',
      'MS-01-01-27',
      'MS-01-01-44',
      'MS-01-01-77',
      'MS-01-01-94',
      'MS-01-01-102',
      'MS-FIRE-ACCEPTANCE',
    ]))
  })

  it('uses business-type context for ambiguous opening and food-safety milestone triggers', () => {
    const campusSelection = buildWizardTemplateSelection(recommendationWithMilestones(
      ['opening_readiness', 'food_safety_acceptance', 'biosafety_acceptance', 'classified_protection_level_3'],
      { businessType: 'school' as TemplateRecommendation['businessType'] },
    ))
    const hotelSelection = buildWizardTemplateSelection(recommendationWithMilestones(
      ['opening_readiness', 'food_safety_acceptance', 'classified_protection_level_3'],
      { businessType: 'hotel' },
    ))

    expect(campusSelection.selectedNodesByTemplate['china-project-milestone-handover']).toEqual(expect.arrayContaining([
      'MS-01-01-66',
      'MS-01-01-68',
      'MS-01-01-70',
      'MS-01-01-71',
    ]))
    expect(hotelSelection.selectedNodesByTemplate['china-project-milestone-handover']).toEqual(expect.arrayContaining([
      'MS-01-01-91',
      'MS-01-01-95',
      'MS-01-01-96',
    ]))
  })
})
