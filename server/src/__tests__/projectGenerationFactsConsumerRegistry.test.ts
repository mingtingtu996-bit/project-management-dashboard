import { describe, expect, it } from 'vitest'
import {
  getProjectGenerationFactConsumerMatrix,
  getProjectGenerationFactGovernanceDiagnostics,
  listProjectGenerationFactKeys,
} from '../services/projectGenerationFactsConsumerRegistry.js'
import { getAlgorithmRuleAsset } from '../services/algorithmRuleAssetInventoryService.js'

const CANONICAL_PROJECT_GENERATION_FACT_KEYS = [
  'aboveGroundAreaM2',
  'basementAreaM2',
  'basementLevelCount',
  'buildingCount',
  'buildingPatternCodes',
  'businessSubtype',
  'businessType',
  'climateSignals',
  'constructionHoistCount',
  'deliveryStandard',
  'detailLevel',
  'elementVariantCodes',
  'externalInterfaceCodes',
  'floorUsageCodes',
  'foundationDepthM',
  'functionalCategoryCodes',
  'functionalUsageCodes',
  'hardConstraintCodes',
  'hasCivilDefense',
  'highestBuildingFloorCount',
  'locationFacts',
  'maxSpanM',
  'methodVariantCodes',
  'onboardingMode',
  'onboardingPassedMilestones',
  'onboardingPhaseProgress',
  'onboardingSubstage',
  'physicalZoneTypeCodes',
  'planScopeCaliber',
  'plannedEndDate',
  'prefabRate',
  'prefabSystemCodes',
  'projectFeatures',
  'scopeOrganizationFacts',
  'scopeTree',
  'siteAreaM2',
  'specialRoomTypeCodes',
  'standardFloorCount',
  'structureTypeCode',
  'supportHeightM',
  'terminalEvent',
  'totalAreaM2',
  'towerCraneCount',
  'weatherImpactBands',
] as const

describe('projectGenerationFactsConsumerRegistry', () => {
  it('covers every canonical project generation fact with at least one algorithm consumer', () => {
    const factKeys = listProjectGenerationFactKeys()
    const matrix = getProjectGenerationFactConsumerMatrix()
    const diagnostics = getProjectGenerationFactGovernanceDiagnostics()

    expect(factKeys).toEqual(CANONICAL_PROJECT_GENERATION_FACT_KEYS)
    expect(Object.keys(matrix).sort()).toEqual(factKeys)
    expect(diagnostics.uncoveredFactKeys).toEqual([])
    expect(diagnostics.fieldsWithoutGenerationConsumer).toEqual([])
  })

  it('does not publish a legacy alias object list from the canonical fact diagnostics', () => {
    const diagnostics = getProjectGenerationFactGovernanceDiagnostics()

    expect(Object.keys(diagnostics).sort()).toEqual([
      'factCount',
      'fieldsWithoutGenerationConsumer',
      'uncoveredFactKeys',
    ])
  })

  it('publishes the canonical fact contract in the algorithm rule asset inventory', () => {
    expect(getAlgorithmRuleAsset('projectGenerationFacts')).toEqual(expect.objectContaining({
      lifecycleType: 'field_registry',
      governanceSystem: 'project_generation_fact_governance',
      ownerService: 'projectFactsToTemplateService/projectWizard/wbsTemplateGenerationService',
      consumers: expect.arrayContaining([
        'projectFactsToTemplateService',
        'wbsTemplateGenerationService',
        'constructionOrganizationScenarioSelector',
        'baselineGenerationService',
        'monthlyPlanGenerationService',
        'durationContextService',
      ]),
      boundaryPolicy: expect.arrayContaining([
        'wizard_inputs_normalized_once',
        'removed_legacy_aliases_not_accepted',
        'every_canonical_fact_requires_declared_consumer',
      ]),
    }))
  })

  it('declares construction organization scenario selector as a consumer of organization-driving project facts', () => {
    const matrix = getProjectGenerationFactConsumerMatrix()

    for (const factKey of [
      'businessType',
      'businessSubtype',
      'methodVariantCodes',
      'prefabSystemCodes',
      'elementVariantCodes',
      'externalInterfaceCodes',
      'hardConstraintCodes',
      'projectFeatures',
      'detailLevel',
      'planScopeCaliber',
      'deliveryStandard',
      'terminalEvent',
      'buildingPatternCodes',
      'buildingCount',
      'totalAreaM2',
      'aboveGroundAreaM2',
      'basementLevelCount',
      'basementAreaM2',
      'siteAreaM2',
      'structureTypeCode',
      'standardFloorCount',
      'highestBuildingFloorCount',
      'foundationDepthM',
      'prefabRate',
      'maxSpanM',
      'supportHeightM',
      'hasCivilDefense',
      'climateSignals',
      'weatherImpactBands',
      'locationFacts',
      'functionalUsageCodes',
      'floorUsageCodes',
      'functionalCategoryCodes',
      'specialRoomTypeCodes',
      'physicalZoneTypeCodes',
      'scopeOrganizationFacts',
      'towerCraneCount',
      'constructionHoistCount',
      'onboardingMode',
      'onboardingSubstage',
      'onboardingPassedMilestones',
      'onboardingPhaseProgress',
    ] as const) {
      const entry = matrix[factKey]
      const allConsumers = Object.values(entry.consumers).flat()
      expect(allConsumers, `${factKey} must declare construction organization scenario selector`).toContain('constructionOrganizationScenarioSelector')
    }
  })
})
