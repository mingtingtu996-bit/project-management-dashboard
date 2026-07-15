import type { BusinessSubtypeCode, BusinessTypeCode, MethodVariantCode } from '../services/projectTypeRecommendations.js'
import {
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
  resolveProjectScenarioProfile,
  type WbsTemplateProjectRecommendationKey,
} from '../services/projectScenarioTaxonomyService.js'
import {
  WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS,
  type WbsTemplateProjectTemplateCombination,
} from './wbsTemplateCommercialGovernanceContent.js'

export type { WbsTemplateProjectRecommendationKey }

export type WbsTemplateProjectRecommendation = WbsTemplateProjectTemplateCombination & {
  recommendationKey: WbsTemplateProjectRecommendationKey
  sourceReportSections: string[]
  expectedRowCountRange: [number, number]
}

function extendCombination(
  key: WbsTemplateProjectRecommendationKey,
  sourceKey: string,
  extra: Pick<WbsTemplateProjectRecommendation, 'sourceReportSections' | 'expectedRowCountRange'> & Partial<WbsTemplateProjectTemplateCombination>,
): WbsTemplateProjectRecommendation {
  const base = WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS[sourceKey]
  if (!base) throw new Error(`Missing WBS project template combination: ${sourceKey}`)
  return {
    ...base,
    ...extra,
    recommendationKey: key,
    projectType: extra.projectType ?? base.projectType,
    requiredTemplateIds: [...new Set([...(base.requiredTemplateIds ?? []), ...(extra.requiredTemplateIds ?? [])])],
    recommendedTemplateIds: [...new Set([...(base.recommendedTemplateIds ?? []), ...(extra.recommendedTemplateIds ?? [])])],
    conditionalTemplateRules: [...(base.conditionalTemplateRules ?? []), ...(extra.conditionalTemplateRules ?? [])],
    greyOutTemplateIds: [...new Set([...(base.greyOutTemplateIds ?? []), ...(extra.greyOutTemplateIds ?? [])])],
    rationale: extra.rationale ?? base.rationale,
  }
}

export const WBS_TEMPLATE_PROJECT_RECOMMENDATIONS: Record<WbsTemplateProjectRecommendationKey, WbsTemplateProjectRecommendation> = {
  residential: extendCombination('residential', 'residential', {
    sourceReportSections: ['2.5.J', '15.3'],
    expectedRowCountRange: [2200, 2800],
  }),
  prefab_residential: extendCombination('prefab_residential', 'residential', {
    projectType: 'prefab_residential',
    sourceReportSections: ['3.6.H', '15.3'],
    expectedRowCountRange: [2800, 3500],
    requiredTemplateIds: ['china-prefabricated-assembly'],
    recommendedTemplateIds: ['china-document-commercial-support'],
    conditionalTemplateRules: [{
      ruleCode: 'PREFAB_RESIDENTIAL_DEFAULT',
      when: 'methodVariantCodes includes precast_concrete',
      includeTemplateIds: ['china-prefabricated-assembly', 'china-dangerous-subproject-control'],
      requireStableCodePrefixes: ['PFB-00', 'PFB-01', 'PFB-02', 'DANGER-01-01-03'],
      rationale: '装配式住宅默认纳入 PC 工厂、现场吊装、灌浆连接与吊装危大控制。',
    }],
    rationale: '装配式住宅 = 住宅推荐组合 + PC 专项 + 吊装与灌浆质量链。',
  }),
  hospital: extendCombination('hospital', 'hospital', {
    sourceReportSections: ['4.6.H', '15.3'],
    expectedRowCountRange: [3500, 4500],
  }),
  data_center: extendCombination('data_center', 'data_center', {
    sourceReportSections: ['5.6.H', '15.3'],
    expectedRowCountRange: [3000, 4000],
  }),
  clean_industrial: extendCombination('clean_industrial', 'clean_industrial', {
    sourceReportSections: ['6.6.H', '15.3'],
    expectedRowCountRange: [3500, 4500],
  }),
  large_span_steel_public: extendCombination('large_span_steel_public', 'industrial', {
    projectType: 'large_span_steel_public',
    sourceReportSections: ['7.6.H', '15.3'],
    expectedRowCountRange: [3000, 3800],
    requiredTemplateIds: ['china-steel-structure-specialty', 'china-dangerous-subproject-control', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-cecs-fire-system', 'china-hvac-system', 'china-intelligent-building-system', 'china-document-commercial-support'],
    conditionalTemplateRules: [{
      ruleCode: 'LARGE_SPAN_STEEL_PUBLIC_DEFAULT',
      when: 'businessType in transportation_hub,sports_culture OR methodVariantCodes includes steel_frame',
      includeTemplateIds: ['china-steel-structure-specialty', 'china-dangerous-subproject-control'],
      requireStableCodePrefixes: ['STL-04', 'STL-05', 'STL-06', 'DANGER-01-01-03'],
      rationale: '大跨度公建需要钢结构深化、提升/滑移/卸载与危大吊装控制。',
    }],
    rationale: '大跨度公建以钢结构专项为主，叠加消防、暖通、智能化和资料移交。',
  }),
  renovation: extendCombination('renovation', 'renovation', {
    sourceReportSections: ['8.6.I', '15.3'],
    expectedRowCountRange: [2800, 3500],
  }),
  heritage: extendCombination('heritage', 'heritage', {
    sourceReportSections: ['8.6.I', '15.3'],
    expectedRowCountRange: [2800, 3500],
  }),
  campus: extendCombination('campus', 'campus', {
    sourceReportSections: ['9.6.H', '15.3'],
    expectedRowCountRange: [3500, 4500],
  }),
  tod: extendCombination('tod', 'tod', {
    sourceReportSections: ['10.6.H', '15.3'],
    expectedRowCountRange: [3000, 3800],
  }),
  modular_construction: extendCombination('modular_construction', 'modular_construction', {
    sourceReportSections: ['11.6.J', '15.3'],
    expectedRowCountRange: [2500, 3200],
  }),
  luxury_hotel: extendCombination('luxury_hotel', 'luxury_hotel', {
    sourceReportSections: ['12.6.H', '15.3'],
    expectedRowCountRange: [3500, 4500],
  }),
  deep_foundation: extendCombination('deep_foundation', 'deep_foundation', {
    sourceReportSections: ['13.6.H', '15.3'],
    expectedRowCountRange: [2200, 2800],
  }),
}

export function resolveWbsTemplateProjectRecommendationKey(params: {
  businessType: BusinessTypeCode
  businessSubtype?: BusinessSubtypeCode | null
  methodVariantCodes?: MethodVariantCode[]
  projectFeatures?: Record<string, number | boolean>
}): WbsTemplateProjectRecommendationKey {
  return resolveProjectScenarioProfile(params).primaryRecommendationPack
}

export function resolveWbsTemplateProjectRecommendationKeys(params: {
  businessType: BusinessTypeCode
  businessSubtype?: BusinessSubtypeCode | null
  methodVariantCodes?: MethodVariantCode[]
  projectFeatures?: Record<string, number | boolean>
}): WbsTemplateProjectRecommendationKey[] {
  return resolveProjectScenarioProfile(params).recommendationPacks
}

export function getWbsTemplateProjectRecommendation(params: {
  businessType: BusinessTypeCode
  businessSubtype?: BusinessSubtypeCode | null
  methodVariantCodes?: MethodVariantCode[]
  projectFeatures?: Record<string, number | boolean>
}) {
  return WBS_TEMPLATE_PROJECT_RECOMMENDATIONS[resolveWbsTemplateProjectRecommendationKey(params)]
}

export function listWbsTemplateProjectRecommendations() {
  return REAL_PROJECT_RECOMMENDATION_PACK_KEYS.map((key) => WBS_TEMPLATE_PROJECT_RECOMMENDATIONS[key])
}
