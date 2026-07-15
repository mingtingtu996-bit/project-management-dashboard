import { describe, expect, it } from 'vitest'

import {
  selectConstructionOrganizationScenario,
} from '../services/constructionOrganizationScenarioSelector.js'
import {
  resolveProjectConstructionOrganizationPolicy,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'

type StrategyCase = {
  name: string
  businessType: 'general_civil' | 'industrial' | 'transportation_hub' | 'sports_culture' | 'renovation'
  businessSubtype: string
  projectTypeCode: string
  structureTypeCode: string
  methodVariantCodes: string[]
  specialRoomTypeCodes: string[]
  functionalUsageCodes: string[]
  externalInterfaceCodes?: string[]
  hardConstraintCodes?: string[]
  expectedPolicyId: string
}

const STRATEGY_CASES: StrategyCase[] = [
  {
    name: 'office and commercial civil project',
    businessType: 'general_civil',
    businessSubtype: 'civil_office_commercial',
    projectTypeCode: 'civil_office_commercial',
    structureTypeCode: 'frame_core',
    methodVariantCodes: ['cast_in_situ'],
    specialRoomTypeCodes: ['office_floor', 'commercial_public_area'],
    functionalUsageCodes: ['office', 'commercial'],
    expectedPolicyId: 'project-organization-general-civil-office-commercial-v1',
  },
  {
    name: 'mixed use civil complex',
    businessType: 'general_civil',
    businessSubtype: 'civil_complex',
    projectTypeCode: 'civil_complex',
    structureTypeCode: 'frame_core',
    methodVariantCodes: ['cast_in_situ'],
    specialRoomTypeCodes: ['podium', 'mixed_use_interface'],
    functionalUsageCodes: ['residential', 'office', 'commercial'],
    expectedPolicyId: 'project-organization-general-civil-mixed-use-complex-v1',
  },
  {
    name: 'general industrial manufacturing',
    businessType: 'industrial',
    businessSubtype: 'industrial_general',
    projectTypeCode: 'industrial_general',
    structureTypeCode: 'steel_frame',
    methodVariantCodes: ['steel_frame', 'process_equipment_installation'],
    specialRoomTypeCodes: ['workshop'],
    functionalUsageCodes: ['factory'],
    expectedPolicyId: 'project-organization-industrial-production-utility-v1',
  },
  {
    name: 'automated logistics warehouse',
    businessType: 'industrial',
    businessSubtype: 'industrial_logistics',
    projectTypeCode: 'industrial',
    structureTypeCode: 'steel_frame',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-industrial-logistics-automation-v1',
  },
  {
    name: 'process manufacturing facility',
    businessType: 'industrial',
    businessSubtype: 'industrial_cleanroom',
    projectTypeCode: 'industrial',
    structureTypeCode: 'steel_frame',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-industrial-process-validation-v1',
  },
  {
    name: 'heavy equipment manufacturing plant',
    businessType: 'industrial',
    businessSubtype: 'industrial_heavy',
    projectTypeCode: 'industrial',
    structureTypeCode: 'steel_frame',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-industrial-heavy-equipment-v1',
  },
  {
    name: 'multimodal transportation hub',
    businessType: 'transportation_hub',
    businessSubtype: 'transport_multimodal',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-transportation-hub-interface-v1',
  },
  {
    name: 'railway station',
    businessType: 'transportation_hub',
    businessSubtype: 'transport_railway_station',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-transportation-rail-station-v1',
  },
  {
    name: 'metro interchange',
    businessType: 'transportation_hub',
    businessSubtype: 'transport_metro_interchange',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-transportation-metro-interchange-v1',
  },
  {
    name: 'bus terminal',
    businessType: 'transportation_hub',
    businessSubtype: 'transport_bus_terminal',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'large_public',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-transportation-bus-terminal-v1',
  },
  {
    name: 'outdoor stadium',
    businessType: 'sports_culture',
    businessSubtype: 'sports_stadium',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-sports-culture-longspan-v1',
  },
  {
    name: 'indoor arena',
    businessType: 'sports_culture',
    businessSubtype: 'sports_indoor_arena',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-sports-culture-indoor-arena-v1',
  },
  {
    name: 'performing arts theater',
    businessType: 'sports_culture',
    businessSubtype: 'sports_theater',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_span_steel',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-sports-culture-theater-v1',
  },
  {
    name: 'museum and exhibition venue',
    businessType: 'sports_culture',
    businessSubtype: 'sports_exhibition',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_public',
    methodVariantCodes: ['steel_frame'],
    specialRoomTypeCodes: [],
    functionalUsageCodes: [],
    expectedPolicyId: 'project-organization-sports-culture-exhibition-v1',
  },
  {
    name: 'seismic strengthening renovation',
    businessType: 'renovation',
    businessSubtype: 'renovation_seismic',
    projectTypeCode: 'renovation_seismic',
    structureTypeCode: 'existing_structure',
    methodVariantCodes: ['structural_reinforcement'],
    specialRoomTypeCodes: ['structural_reinforcement'],
    functionalUsageCodes: ['existing_building'],
    expectedPolicyId: 'project-organization-renovation-seismic-reinforcement-v1',
  },
  {
    name: 'building energy renovation',
    businessType: 'renovation',
    businessSubtype: 'renovation_energy',
    projectTypeCode: 'renovation_energy',
    structureTypeCode: 'existing_structure',
    methodVariantCodes: ['facade_repair'],
    specialRoomTypeCodes: ['envelope_energy_retrofit'],
    functionalUsageCodes: ['existing_building'],
    expectedPolicyId: 'project-organization-renovation-energy-retrofit-v1',
  },
  {
    name: 'heritage conservation renovation',
    businessType: 'renovation',
    businessSubtype: 'renovation_heritage',
    projectTypeCode: 'renovation_heritage',
    structureTypeCode: 'heritage_structure',
    methodVariantCodes: ['traditional_craft', 'reversible_reinforcement'],
    specialRoomTypeCodes: ['heritage_protection'],
    functionalUsageCodes: ['heritage_building'],
    expectedPolicyId: 'project-organization-renovation-heritage-conservation-v1',
  },
]

function selectStrategy(testCase: StrategyCase) {
  return selectConstructionOrganizationScenario({
    ...testCase,
    physicalZoneTypeCodes: ['primary_zone', 'outdoor_site'],
    buildingPatternCodes: ['functional_zone_parallel'],
    buildingCount: 1,
    totalAreaM2: 80_000,
    basementLevelCount: 1,
    basementAreaM2: 12_000,
    siteAreaM2: 100_000,
    foundationDepthM: 4,
    maxSpanM: 36,
    scopeOrganizationFacts: {
      buildingObjectCount: 1,
      outdoorSiteObjectCount: 1,
      organizationSignals: ['outdoor_site_scope_present'],
    },
  })
}

function expectAcyclicPolicyNetwork(testCase: StrategyCase, selection: ReturnType<typeof selectStrategy>) {
  const network = selection.recommendedPlanOption.combinedVirtualNetwork
  const nodeIds = new Set(network.nodes.map((node) => node.id))
  const indegree = new Map([...nodeIds].map((nodeId) => [nodeId, 0]))
  const successors = new Map([...nodeIds].map((nodeId) => [nodeId, [] as string[]]))

  expect(nodeIds.size, `${testCase.name} unique network nodes`).toBe(network.nodes.length)
  for (const dependency of network.dependencies) {
    expect(nodeIds.has(dependency.fromNodeId), `${testCase.name}:${dependency.fromNodeId}`).toBe(true)
    expect(nodeIds.has(dependency.toNodeId), `${testCase.name}:${dependency.toNodeId}`).toBe(true)
    indegree.set(dependency.toNodeId, (indegree.get(dependency.toNodeId) ?? 0) + 1)
    successors.get(dependency.fromNodeId)?.push(dependency.toNodeId)
  }

  const queue = [...nodeIds].filter((nodeId) => indegree.get(nodeId) === 0)
  let visitedCount = 0
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    visitedCount += 1
    for (const successor of successors.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(successor) ?? 0) - 1
      indegree.set(successor, nextIndegree)
      if (nextIndegree === 0) queue.push(successor)
    }
  }

  expect(visitedCount, `${testCase.name} acyclic CPM network`).toBe(network.nodes.length)
}

describe('construction organization business-type strategy variants', () => {
  it('selects the subtype-specific governed policy from existing wizard facts', () => {
    for (const testCase of STRATEGY_CASES) {
      const selection = selectStrategy(testCase)
      const policy = selection.factBasis.projectOrganizationPolicy as Record<string, unknown>

      expect(policy.policyId, testCase.name).toBe(testCase.expectedPolicyId)
      expect(policy.variantCode, testCase.name).toEqual(expect.any(String))
      expect(policy.selectionSignals, testCase.name).toEqual(expect.any(Array))
    }
  })

  it('materializes the selected policy interface stages into a distinct CPM network', () => {
    const signaturesByBusinessType = new Map<string, Set<string>>()

    for (const testCase of STRATEGY_CASES) {
      const selection = selectStrategy(testCase)
      const scheme = selection.recommendedPlanOption.projectOrganizationScheme as Record<string, unknown>
      const policyNodeIds = selection.recommendedPlanOption.combinedVirtualNetwork.nodes
        .map((node) => node.id)
        .filter((nodeId) => nodeId.startsWith('policy_'))
      const policyDependencies = selection.recommendedPlanOption.combinedVirtualNetwork.dependencies
        .filter((dependency) => dependency.intent.startsWith('policy_interface:'))
      const signature = policyNodeIds.join('|')
      const businessSignatures = signaturesByBusinessType.get(testCase.businessType) ?? new Set<string>()

      expect(scheme.variantCode, testCase.name).toEqual(expect.any(String))
      expect(policyNodeIds.length, testCase.name).toBeGreaterThanOrEqual(4)
      expect(policyDependencies.length, testCase.name).toBeGreaterThanOrEqual(3)
      expect(selection.recommendedPlanOption.evaluation.networkEvaluation.edgeCount, testCase.name)
        .toBeGreaterThan(policyDependencies.length)
      expectAcyclicPolicyNetwork(testCase, selection)

      businessSignatures.add(signature)
      signaturesByBusinessType.set(testCase.businessType, businessSignatures)
    }

    expect(signaturesByBusinessType.get('industrial')?.size).toBe(4)
    expect(signaturesByBusinessType.get('transportation_hub')?.size).toBe(4)
    expect(signaturesByBusinessType.get('sports_culture')?.size).toBe(4)
    expect(signaturesByBusinessType.get('general_civil')?.size).toBe(2)
    expect(signaturesByBusinessType.get('renovation')?.size).toBe(3)
  })

  it('does not treat false or empty wizard feature values as active policy signals', () => {
    const policy = resolveProjectConstructionOrganizationPolicy('industrial', 'industrial_general', {
      projectFeatures: {
        automated_warehouse: false,
        clean_utility: false,
        heavy_equipment_bay: false,
        large_equipment_lifting: [],
        process_piping: '',
      },
    })

    expect(policy.policyId).toBe('project-organization-industrial-production-utility-v1')
  })

  it('lets the explicit wizard subtype override conflicting generic room or method signals', () => {
    const policy = resolveProjectConstructionOrganizationPolicy('sports_culture', 'sports_indoor_arena', {
      businessSubtype: 'sports_indoor_arena',
      specialRoomTypeCodes: ['arena', 'auditorium'],
      methodVariantCodes: ['large_span_roof', 'acoustic_fitout'],
    })

    expect(policy.policyId).toBe('project-organization-sports-culture-indoor-arena-v1')
    expect(policy.variantCode).toBe('sports_culture_indoor_arena')
  })

  it('keeps explicit base subtypes authoritative when generic facts resemble a specialist variant', () => {
    const cases = [
      {
        businessType: 'industrial',
        businessSubtype: 'industrial_general',
        context: { specialRoomTypeCodes: ['automated_warehouse', 'clean_utility'] },
        expectedPolicyId: 'project-organization-industrial-production-utility-v1',
      },
      {
        businessType: 'transportation_hub',
        businessSubtype: 'transport_multimodal',
        context: { specialRoomTypeCodes: ['platform_interface'], hardConstraintCodes: ['operating_line_protection'] },
        expectedPolicyId: 'project-organization-transportation-hub-interface-v1',
      },
      {
        businessType: 'sports_culture',
        businessSubtype: 'sports_stadium',
        context: { specialRoomTypeCodes: ['auditorium'], methodVariantCodes: ['acoustic_fitout'] },
        expectedPolicyId: 'project-organization-sports-culture-longspan-v1',
      },
    ] as const

    for (const testCase of cases) {
      const policy = resolveProjectConstructionOrganizationPolicy(
        testCase.businessType,
        testCase.businessType,
        { businessSubtype: testCase.businessSubtype, ...testCase.context },
      )

      expect(policy.policyId, testCase.businessSubtype).toBe(testCase.expectedPolicyId)
    }
  })
})
