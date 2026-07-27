import { describe, expect, it } from 'vitest'

import {
  flattenChinaTemplateCatalog,
  resolveStandardInternalFlowRule,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'
import { T2_DIVISION_RHYTHM_TEMPLATE_SEED } from '../seeds/t2DivisionRhythmTemplateSeed.js'
import { V1475_CROSS_ITEM_WORKFLOW_SEED } from '../seeds/v1475CrossItemWorkflowSeed.js'
import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'

const SPECIALTY_CASES = [
  {
    businessType: 'industrial',
    templateId: 'china-industrial-plant-specialty',
    stablePrefix: 'IPL-',
    t2Prefix: 't2-industrial-',
    minimumDedicatedT2Count: 6,
    requiredCrossItemRules: [
      'industrial_equipment_foundation_to_equipment_setting',
      'industrial_equipment_alignment_to_secondary_grouting',
      'industrial_utility_test_to_single_machine_trial',
      'industrial_control_power_ready_to_single_machine_trial',
      'industrial_single_machine_trial_to_integrated_trial',
      'industrial_safety_system_ready_to_trial_production',
    ],
  },
  {
    businessType: 'transportation_hub',
    templateId: 'china-transportation-hub-specialty',
    stablePrefix: 'TRH-',
    t2Prefix: 't2-transport',
    minimumDedicatedT2Count: 7,
    requiredCrossItemRules: [
      'hub_structure_acceptance_to_envelope_closeout',
      'hub_watertight_release_to_passenger_systems',
      'hub_passenger_systems_to_trial_operation',
      'hub_life_safety_to_trial_operation',
      'hub_external_traffic_to_trial_operation',
      'hub_operator_interface_to_trial_operation',
    ],
  },
  {
    businessType: 'sports_culture',
    templateId: 'china-sports-culture-specialty',
    stablePrefix: 'SPC-',
    t2Prefix: 't2-sports-culture-',
    minimumDedicatedT2Count: 5,
    requiredCrossItemRules: [
      'venue_longspan_acceptance_to_envelope_closeout',
      'venue_watertight_release_to_public_fitout',
      'venue_watertight_release_to_event_systems',
      'venue_functional_space_to_full_rehearsal',
      'venue_life_safety_to_full_rehearsal',
      'venue_event_systems_to_full_rehearsal',
    ],
  },
] as const

const SPECIALTY_SUBTYPE_BRANCHES = [
  { businessType: 'industrial', prefix: 'IPL-05-01', label: 'industrial logistics automation' },
  { businessType: 'industrial', prefix: 'IPL-05-02', label: 'industrial process validation' },
  { businessType: 'industrial', prefix: 'IPL-05-03', label: 'industrial heavy equipment' },
  { businessType: 'transportation_hub', prefix: 'TRH-04-01', label: 'railway station' },
  { businessType: 'transportation_hub', prefix: 'TRH-04-02', label: 'metro interchange' },
  { businessType: 'transportation_hub', prefix: 'TRH-04-03', label: 'bus terminal' },
  { businessType: 'sports_culture', prefix: 'SPC-05-01', label: 'indoor arena' },
  { businessType: 'sports_culture', prefix: 'SPC-05-02', label: 'theater' },
  { businessType: 'sports_culture', prefix: 'SPC-05-03', label: 'exhibition venue' },
] as const

function catalogNodes(templateId: string) {
  const catalog = DOMAIN_WBS_TEMPLATE_CATALOGS.find((candidate) => candidate.templateId === templateId)
  expect(catalog, `${templateId} catalog`).toBeTruthy()
  return flattenChinaTemplateCatalog(catalog!.divisions)
}

describe('industrial, transportation hub, and sports/culture specialty asset coverage', () => {
  it('provides a production-oriented dedicated process overlay rather than an eight-pack skeleton', () => {
    for (const testCase of SPECIALTY_CASES) {
      const nodes = catalogNodes(testCase.templateId)
      const itemPacks = nodes.filter((node) => node.categoryType === 'item_work')
      const processes = nodes.filter((node) => node.categoryType === 'process')

      expect(itemPacks.length, `${testCase.businessType} dedicated item packs`).toBeGreaterThanOrEqual(16)
      expect(processes.length, `${testCase.businessType} dedicated processes`).toBeGreaterThanOrEqual(80)
      expect(itemPacks.every((itemPack) => (
        (itemPack.children ?? []).filter((child) => child.categoryType === 'process').length >= 5
      )), `${testCase.businessType} process depth`).toBe(true)
    }
  })

  it('provides subtype-specific T2 rhythm templates beyond generic standard-library clones', () => {
    for (const testCase of SPECIALTY_CASES) {
      const dedicatedTemplates = T2_DIVISION_RHYTHM_TEMPLATE_SEED.filter((template) => (
        template.templateId.startsWith(testCase.t2Prefix)
        && !template.templateId.includes('standard-library')
        && template.applicability.businessTypeCodes.includes(testCase.businessType)
      ))

      expect(dedicatedTemplates.length, `${testCase.businessType} dedicated T2 templates`)
        .toBeGreaterThanOrEqual(testCase.minimumDedicatedT2Count)
    }
  })

  it('provides subtype-specific duration profiles for the new specialty packs', () => {
    const expectedProfilesByPrefix = new Map([
      ['IPL-05-01', 'expert_domain_industrial_logistics_automation'],
      ['IPL-05-02', 'expert_domain_industrial_process_validation'],
      ['IPL-05-03', 'expert_domain_industrial_heavy_equipment'],
      ['TRH-04-01', 'expert_domain_transportation_rail_station'],
      ['TRH-04-02', 'expert_domain_transportation_metro_interchange'],
      ['TRH-04-03', 'expert_domain_transportation_bus_terminal'],
      ['SPC-05-01', 'expert_domain_sports_indoor_arena'],
      ['SPC-05-02', 'expert_domain_sports_theater'],
      ['SPC-05-03', 'expert_domain_sports_exhibition'],
    ])

    for (const [prefix, profileStableCode] of expectedProfilesByPrefix) {
      const processRules = STANDARD_WORK_DURATION_SEED.filter((rule) => (
        rule.stableCode.startsWith(`process_duration:${prefix}-`)
      ))

      expect(processRules.length, `${prefix} process duration rules`).toBeGreaterThanOrEqual(5)
      expect(processRules.every((rule) => (
        rule.benchmarkBasis?.includes(`domainExpert=${profileStableCode}`)
      )), `${prefix} consumes ${profileStableCode}`).toBe(true)
    }
  })

  it('curates every adjacent process pair as an executable L2 same-pack dependency', () => {
    for (const testCase of SPECIALTY_CASES) {
      const itemPacks = catalogNodes(testCase.templateId)
        .filter((node) => node.categoryType === 'item_work')

      for (const itemPack of itemPacks) {
        const processes = (itemPack.children ?? []).filter((child) => child.categoryType === 'process')
        for (let index = 1; index < processes.length; index += 1) {
          const predecessor = processes[index - 1]!
          const successor = processes[index]!
          const rule = resolveStandardInternalFlowRule({
            predecessorStableCode: predecessor.stableCode,
            predecessorName: predecessor.name,
            successorStableCode: successor.stableCode,
            successorName: successor.name,
            successorCategoryType: 'process',
            catalogSource: 'domain_wbs_template_catalog',
            templateId: testCase.templateId,
          })

          expect(rule.curationStatus, `${predecessor.stableCode}->${successor.stableCode}`).toBe('curated')
          expect(rule.createsDependency, `${predecessor.stableCode}->${successor.stableCode}`).toBe(true)
          expect(rule.dependencyType, `${predecessor.stableCode}->${successor.stableCode}`).toBe('FS')
        }
      }
    }
  })

  it('provides explicit L3 cross-pack handoffs for each specialty construction mainline', () => {
    for (const testCase of SPECIALTY_CASES) {
      const prefixRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
        [...rule.predecessorCodePrefixes, ...rule.successorCodePrefixes]
          .some((stableCode) => stableCode.startsWith(testCase.stablePrefix))
      ))
      const stableCodes = new Set(prefixRules.map((rule) => rule.stableCode))

      expect(prefixRules.length, `${testCase.businessType} L3 rule count`).toBeGreaterThanOrEqual(6)
      for (const requiredRule of testCase.requiredCrossItemRules) {
        expect(stableCodes.has(requiredRule), `${testCase.businessType}:${requiredRule}`).toBe(true)
      }
      expect(prefixRules.every((rule) => (
        rule.strength === 'hard'
        && rule.autoApplyPolicy === 'confirmed_template_only'
        && rule.lagDays >= 0
        && rule.evidenceSourceKeys.length > 0
      )), `${testCase.businessType} L3 runtime contract`).toBe(true)
    }
  })

  it('connects every subtype branch to the upstream construction network and downstream handover mainline', () => {
    for (const branch of SPECIALTY_SUBTYPE_BRANCHES) {
      const ingressRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
        rule.successorCodePrefixes.some((code) => code.startsWith(branch.prefix))
        && rule.predecessorCodePrefixes.every((code) => !code.startsWith(branch.prefix))
      ))
      const internalRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
        rule.predecessorCodePrefixes.some((code) => code.startsWith(branch.prefix))
        && rule.successorCodePrefixes.some((code) => code.startsWith(branch.prefix))
      ))
      const egressRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
        rule.predecessorCodePrefixes.some((code) => code.startsWith(branch.prefix))
        && rule.successorCodePrefixes.every((code) => !code.startsWith(branch.prefix))
      ))

      expect(ingressRules.length, `${branch.label} L3 ingress`).toBeGreaterThanOrEqual(1)
      expect(internalRules.length, `${branch.label} L3 internal handoff`).toBeGreaterThanOrEqual(1)
      expect(egressRules.length, `${branch.label} L3 egress`).toBeGreaterThanOrEqual(1)
    }
  })

  it('does not use unbounded same-project matching for specialty mainline process rules', () => {
    const specialtyRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
      ['industrial_production', 'transportation_hub_operation', 'venue_event_handover']
        .includes(String(rule.handoffCategory ?? ''))
      && rule.predecessorCategoryTypes?.includes('process')
      && rule.successorCategoryTypes?.includes('process')
    ))

    expect(specialtyRules.length).toBeGreaterThan(0)
    expect(specialtyRules.filter((rule) => rule.scopeRule === 'same_project')).toEqual([])
  })
})
