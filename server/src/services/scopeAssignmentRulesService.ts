// v1.4.22.1 §10.6: Auto scope assignment rules per business type for wizard step 2/6

import type { BusinessTypeCode } from './projectTypeRecommendations.js'

export type ScopeAssignmentEffect =
  | 'assign_to_matching_buildings'
  | 'assign_to_all_buildings'
  | 'assign_to_functional_area'
  | 'assign_to_scope_object'

export type ScopeAssignmentObjectType =
  | 'phase'
  | 'section'
  | 'building'
  | 'basement'
  | 'floor'
  | 'physical_zone'
  | 'functional_area'

export interface ScopeAssignmentRule {
  businessType: BusinessTypeCode
  /** Item pack code pattern to match */
  itemPackPattern: string
  effect: ScopeAssignmentEffect
  /** Target functional-area category if effect is assign_to_functional_area */
  functionalAreaCategory?: string
  /** Building functional usage to match if effect is assign_to_matching_buildings */
  matchFunctionalUsage?: string
  /** Target scope object type if effect is assign_to_scope_object */
  targetObjectType?: ScopeAssignmentObjectType
  /** Metadata conditions used to find the target scope object */
  matchMetadata?: Record<string, unknown>
  /** Optional target object name for shared spaces such as outdoor site or shared podium */
  matchObjectName?: string
  priority: number
}

const COMMON_PHYSICAL_SCOPE_ASSIGNMENT_RULES: Omit<ScopeAssignmentRule, 'businessType'>[] = [
  { itemPackPattern: 'WPI-01-01-0[14567]', effect: 'assign_to_scope_object', targetObjectType: 'basement', priority: 1 },
  { itemPackPattern: 'PLU-07', effect: 'assign_to_scope_object', targetObjectType: 'basement', priority: 1 },
  { itemPackPattern: 'OUT-', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'outdoor_site' }, priority: 1 },
  { itemPackPattern: 'UHR-03-01-02|UHR-04-01-09', effect: 'assign_to_scope_object', targetObjectType: 'floor', matchMetadata: { floorUsage: 'refuge' }, priority: 1 },
  { itemPackPattern: 'ELE-05-01-01', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' }, priority: 1 },
  { itemPackPattern: 'PLU-02-01-02|FIR-05-01-02', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'fire_pump_room' }, priority: 1 },
  { itemPackPattern: 'HVA-03-01-02', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'heat_exchange_station' }, priority: 1 },
  { itemPackPattern: 'PLU-05-01-01', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'waste_room' }, priority: 1 },
  { itemPackPattern: 'CMP-03-01-02', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'playground' }, priority: 1 },
  { itemPackPattern: 'CLN-04-01-06', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'liquid_oxygen_station' }, priority: 1 },
  { itemPackPattern: 'CLN-04-01-33', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'sewage_treatment_station' }, priority: 1 },
  { itemPackPattern: 'CLN-04-01-32', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'medical_waste_holding' }, priority: 1 },
  { itemPackPattern: 'CLN-04-01-40', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'hyperbaric_oxygen_chamber' }, priority: 1 },
  { itemPackPattern: 'ELE-05-01-01', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'substation' }, priority: 1 },
  { itemPackPattern: 'DTC-02-01-02|DTC-04-01-09|DTC-04-01-10', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'generator_yard' }, priority: 1 },
  { itemPackPattern: 'DTC-04-01-16', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'cooling_plant' }, priority: 1 },
  { itemPackPattern: 'TOD-01-01-02|TOD-04-01-08|TOD-04-01-09', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'railway_operation_zone' }, priority: 1 },
  { itemPackPattern: 'TOD-04-01-13', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'transfer_passage' }, priority: 1 },
  { itemPackPattern: 'TOD-03-01-01', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'traffic_connection_zone' }, priority: 1 },
]

// §7.3: Smart defaults mapping
export const SCOPE_ASSIGNMENT_RULES: ScopeAssignmentRule[] = [
  // Hospital: operating rooms → OR functional area
  { businessType: 'hospital', itemPackPattern: 'CLN-01', effect: 'assign_to_functional_area', functionalAreaCategory: '手术区', priority: 1 },
  { businessType: 'hospital', itemPackPattern: 'CLN-02', effect: 'assign_to_functional_area', functionalAreaCategory: '手术区', priority: 1 },
  { businessType: 'hospital', itemPackPattern: 'CLN-03', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '医技楼', priority: 2 },
  { businessType: 'hospital', itemPackPattern: 'CLN-08', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '传染门诊', priority: 2 },

  // TOD: isolation → transfer layer, towers → residential/commercial
  { businessType: 'tod_upper_cover', itemPackPattern: 'TOD-03', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '转换层', priority: 1 },
  { businessType: 'tod_upper_cover', itemPackPattern: 'TOD-04', effect: 'assign_to_all_buildings', priority: 2 },
  { businessType: 'tod_upper_cover', itemPackPattern: 'TOD-05', effect: 'assign_to_all_buildings', priority: 2 },

  // Complex: multi-tower assignments
  { businessType: 'general_civil', itemPackPattern: 'DEC-05', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '商业', priority: 2 },
  { businessType: 'general_civil', itemPackPattern: 'facade', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '写字楼', priority: 2 },

  // Industrial: main building → main factory, auxiliary → support building
  { businessType: 'industrial', itemPackPattern: 'ICR-', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '主厂房', priority: 2 },
  { businessType: 'industrial', itemPackPattern: 'BDT-', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '主厂房', priority: 3 },

  // Data center: compute → server building, power → utility building
  { businessType: 'data_center', itemPackPattern: 'DTC-', effect: 'assign_to_matching_buildings', matchFunctionalUsage: '机房楼', priority: 2 },

  // Campus: multi-building distribution
  { businessType: 'school', itemPackPattern: '.*', effect: 'assign_to_all_buildings', priority: 10 },
]

function buildScopeAssignmentRuleKey(rule: ScopeAssignmentRule) {
  return [
    rule.businessType,
    rule.itemPackPattern,
    rule.effect,
    rule.targetObjectType ?? '',
    rule.matchFunctionalUsage ?? '',
    rule.functionalAreaCategory ?? '',
    rule.matchObjectName ?? '',
    JSON.stringify(rule.matchMetadata ?? {}),
  ].join('|')
}

export function getScopeAssignmentRules(businessType: BusinessTypeCode): ScopeAssignmentRule[] {
  const commonRules = COMMON_PHYSICAL_SCOPE_ASSIGNMENT_RULES.map((rule) => ({ ...rule, businessType }))
  const businessRules = SCOPE_ASSIGNMENT_RULES.filter(r => r.businessType === businessType)
  const seen = new Set<string>()
  return [...commonRules, ...businessRules]
    .sort((a, b) => a.priority - b.priority)
    .filter((rule) => {
      const key = buildScopeAssignmentRuleKey(rule)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
