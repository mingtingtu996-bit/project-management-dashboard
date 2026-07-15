import { STANDARD_INTERNAL_FLOW_RULE_SEED } from './standardInternalFlowSeed.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from './domainWbsTemplateCatalogs.js'
import { inferControlRoles } from './controlRoles.js'
import {
  inferDurationContributionMode,
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from './durationContributionMode.js'
import { inferExecutionNature, type ExecutionNature } from './executionNature.js'
import { applyWbsTemplateSemanticOverride } from './wbsTemplateSemanticOverrides.js'
import {
  inferWbsTemplatePreferredEvidenceRefs,
  mergeWbsTemplateEvidenceRefs,
} from './wbsTemplateEvidenceRefEnrichment.js'
import {
  V1474_PROCESS_CONSTRAINT_SEED,
  type V1474ProcessConstraintRule,
} from './v1474ProcessConstraintSeed.js'

export type ChinaTemplateCategoryType =
  | 'division'
  | 'sub_division'
  | 'item_work'
  | 'process'
  | 'activity_step'

export interface ChinaTemplateCatalogNode {
  stableCode: string
  name: string
  categoryType: ChinaTemplateCategoryType
  sourceStandard: string
  sourceVersion: string
  sourceClauseRef: string
  defaultResponsibleUnitRole?: string
  reviewNeeded?: boolean
  webVerified?: boolean
  deprecated?: boolean
  expectedChildCount?: number
  children?: ChinaTemplateCatalogNode[]
  metadata?: Record<string, unknown>
}

export interface ChinaTemplateCatalog {
  templateId: string
  templateCode: string
  templateName: string
  sourceStandard: string
  sourceVersion: string
  catalogLevel: 'national'
  divisions: ChinaTemplateCatalogNode[]
}

const GB55032 = 'GB55032-2022'
const SYSTEM_PROCESS = 'system_default_process'
const ENTERPRISE_PROCESS = 'enterprise_method'

// Legacy tuple definitions may still contain a numeric slot from early seed drafts.
// Built-in v1.4.7.2 templates do not consume that slot as duration.
type ProcessTemplate = string | [string, number]
type EvidenceLevel = 'A' | 'B' | 'C' | 'D'
type ProcessPackLevel = 'discipline_package' | 'generic_fallback'
type StandardInternalFlowRelationKind =
  | 'hard_sequence'
  | 'soft_sequence'
  | 'parallel_allowed'
  | 'acceptance_gate'

type StandardInternalFlowCurationStatus = 'curated' | 'review_required'
type StandardInternalFlowCurationMethod = 'manual_registry' | 'stable_code_backfill' | 'soft_fallback'
type StandardInternalFlowCondition = {
  field:
    | 'project_type_code'
    | 'structure_type_code'
    | 'method_variant_code'
    | 'element_variant_code'
    | 'climate_signal'
    | 'monthly_climate_signal'
    | 'weather_impact_band'
    | 'predecessor_name'
    | 'successor_name'
  operator: 'includes_any' | 'excludes_any'
  values: string[]
}
type StandardInternalFlowEvidenceRef = {
  code: string
  level: 'standard' | 'clause' | 'process' | 'enterprise_method' | 'execution_history'
  ref?: string
  rationale?: string
}
type StandardInternalFlowConditionalEffect = {
  id: string
  when: StandardInternalFlowCondition[]
  relationKind?: StandardInternalFlowRelationKind
  dependencyType?: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays?: number
  relationRole?: 'workflow' | 'inspection'
  strength?: 'hard' | 'recommended' | 'candidate'
  reasonCode?: string
  curationBasis?: string
  scheduleMode?: 'sequential' | 'parallel_with_previous'
  requiresAllPreviousSiblings?: boolean
  evidenceCodes?: string[]
  evidenceRefs?: StandardInternalFlowEvidenceRef[]
}
type StandardInternalFlowGeneralizationHint = {
  status: 'semantic_rule' | 'stable_code_backfill'
  targetPattern?: string
  promotionPriority?: 'P0' | 'P1' | 'P2'
  reason: string
}

export type StandardInternalFlowRule = {
  source: 'china_gb50300_template_catalog' | 'domain_wbs_template_catalog'
  sourceVersion: 'v1.4.7.2'
  seedRuleId: string
  ruleVersion: number
  scope: 'same_parent'
  relationKind: StandardInternalFlowRelationKind
  createsDependency: boolean
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  relationRole: 'workflow' | 'inspection'
  strength: 'hard' | 'recommended' | 'candidate'
  reasonCode: string
  curationStatus: StandardInternalFlowCurationStatus
  curationMethod: StandardInternalFlowCurationMethod
  curationBasis: string
  reviewNeeded: boolean
  scheduleMode: 'sequential' | 'parallel_with_previous'
  requiresAllPreviousSiblings: boolean
  evidenceCodes: string[]
  evidenceRefs: StandardInternalFlowEvidenceRef[]
  governancePriority: 'P0' | 'P1' | 'P2'
  applicableWhen: StandardInternalFlowCondition[]
  conditionalEffects: StandardInternalFlowConditionalEffect[]
  generalizationHint: StandardInternalFlowGeneralizationHint | null
  additionalPredecessorStableCodes: string[]
  predecessorStableCode: string
  predecessorName: string
  successorStableCode: string
  successorName: string
}

type CuratedStandardInternalFlowRule = {
  id: string
  matchMode?: 'exact' | 'suffix' | 'stable_code'
  predecessorStableCode?: string
  successorStableCode?: string
  applicableCategoryTypes?: ChinaTemplateCategoryType[]
  predecessorName: string
  successorName: string
  relationKind: StandardInternalFlowRelationKind
  createsDependency: boolean
  dependencyType: StandardInternalFlowRule['dependencyType']
  lagDays: number
  relationRole: StandardInternalFlowRule['relationRole']
  strength: StandardInternalFlowRule['strength']
  reasonCode: string
  curationBasis: string
  scheduleMode?: StandardInternalFlowRule['scheduleMode']
  requiresAllPreviousSiblings?: boolean
  evidenceCodes?: string[]
  evidenceRefs?: StandardInternalFlowEvidenceRef[]
  governancePriority?: StandardInternalFlowRule['governancePriority']
  applicableWhen?: StandardInternalFlowCondition[]
  conditionalEffects?: StandardInternalFlowConditionalEffect[]
  generalizationHint?: StandardInternalFlowGeneralizationHint
  additionalPredecessorStableCodes?: string[]
}

const VERIFIED_AT = '2026-05-15'
const VERIFIED_BY = 'Codex web evidence pass'
const BUILDING_DOMAIN = 'building_construction'
const QUANTITY_BASIS_CODE = 'GB/T50500-2024'
const GENERIC_FALLBACK_PROCESSES = new Set(['施工准备与技术交底', '自检整改与验收'])

const STANDARD_EVIDENCE: Record<string, {
  standardCode: string
  standardName: string
  publisher: string
  evidenceLevel: EvidenceLevel
  evidenceUrl: string
  effectiveDate?: string
}> = {
  GB55032: {
    standardCode: 'GB55032-2022',
    standardName: '建筑与市政工程施工质量控制通用规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2022/art_17339_767714.html',
    effectiveDate: '2023-03-01',
  },
  GB50300: {
    standardCode: 'GB50300-2013',
    standardName: '建筑工程施工质量验收统一标准',
    publisher: '住房和城乡建设部 / 国家质量监督检验检疫总局',
    evidenceLevel: 'A',
    evidenceUrl: 'https://zjw.sh.gov.cn/cmsres/34/349cab456a80498091dd53105c3b6109/7573fa552919c7dbb9ddd603afc4eea0.pdf',
  },
  GB50202: {
    standardCode: 'GB50202-2018',
    standardName: '建筑地基基础工程施工质量验收标准',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50203: {
    standardCode: 'GB50203-2011',
    standardName: '砌体结构工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50204: {
    standardCode: 'GB50204-2015',
    standardName: '混凝土结构工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50205: {
    standardCode: 'GB50205-2020',
    standardName: '钢结构工程施工质量验收标准',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50206: {
    standardCode: 'GB50206-2012',
    standardName: '木结构工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50207: {
    standardCode: 'GB50207-2012',
    standardName: '屋面工程质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50209: {
    standardCode: 'GB50209-2010',
    standardName: '建筑地面工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50210: {
    standardCode: 'GB50210-2018',
    standardName: '建筑装饰装修工程质量验收标准',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50242: {
    standardCode: 'GB50242-2002',
    standardName: '建筑给水排水及采暖工程施工质量验收规范',
    publisher: '建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50243: {
    standardCode: 'GB50243-2016',
    standardName: '通风与空调工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50303: {
    standardCode: 'GB50303-2015',
    standardName: '建筑电气工程施工质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50310: {
    standardCode: 'GB50310-2002',
    standardName: '电梯工程施工质量验收规范',
    publisher: '建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50339: {
    standardCode: 'GB50339-2013',
    standardName: '智能建筑工程质量验收规范',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50411: {
    standardCode: 'GB50411-2019',
    standardName: '建筑节能工程施工质量验收标准',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://openstd.samr.gov.cn/',
  },
  GB50500: {
    standardCode: QUANTITY_BASIS_CODE,
    standardName: '建设工程工程量清单计价标准',
    publisher: '住房和城乡建设部',
    evidenceLevel: 'A',
    evidenceUrl: 'https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2024/art_6186304e164c4c4982904f8734983235.html',
    effectiveDate: '2025-09-01',
  },
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

const LEGACY_STANDARD_INTERNAL_FLOW_CURATED_RULES: CuratedStandardInternalFlowRule[] = [
  {
    id: 'activity-condition-to-safety-briefing',
    matchMode: 'suffix',
    predecessorName: '作业条件确认',
    successorName: '安全技术交底',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级规则：作业条件确认后进行安全技术交底。',
  },
  {
    id: 'activity-measurement-review-to-record',
    matchMode: 'suffix',
    predecessorName: '尺寸标高复核',
    successorName: '测量成果记录',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：复核完成后形成测量成果记录。',
  },
  {
    id: 'activity-test-to-signoff-record',
    matchMode: 'suffix',
    predecessorName: '实测实量或功能测试',
    successorName: '记录签认整改',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：测试完成后进入记录签认和整改闭合。',
  },
  {
    id: 'activity-execution-to-self-check',
    matchMode: 'suffix',
    predecessorName: '过程施工',
    successorName: '班组自检记录',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：过程施工后由班组形成自检记录。',
  },
  {
    id: 'activity-appearance-check-to-sampling-record',
    matchMode: 'suffix',
    predecessorName: '外观数量检查',
    successorName: '见证取样或验收记录',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：外观和数量检查后形成见证取样或验收记录。',
  },
  {
    id: 'activity-formwork-plan-to-matching-review',
    predecessorName: '模板方案核对',
    successorName: '配模尺寸复核',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：模板方案核对后进行配模尺寸复核。',
  },
  {
    id: 'activity-formwork-matching-to-reinforcement-node',
    predecessorName: '配模尺寸复核',
    successorName: '加固节点确认',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：配模尺寸复核后确认加固节点。',
  },
  {
    id: 'activity-formwork-bearing-clean-to-base-setup',
    predecessorName: '承载面清理',
    successorName: '垫板扫地杆设置',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级规则：承载面清理后设置垫板和扫地杆。',
  },
  {
    id: 'activity-formwork-base-setup-to-settlement-check',
    predecessorName: '垫板扫地杆设置',
    successorName: '基础沉降检查',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级规则：垫板和扫地杆设置后进行基础沉降检查。',
  },
  {
    id: 'earthwork-settingout-to-excavation-support',
    predecessorName: '测量放线',
    successorName: '降排水与边坡防护',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '土方开挖前应完成测量控制和现场防护条件确认。',
  },
  {
    id: 'earthwork-support-to-excavation',
    predecessorName: '降排水与边坡防护',
    successorName: '分层开挖',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '降排水和边坡防护形成后方可稳定开展分层开挖。',
  },
  {
    id: 'earthwork-cleanup-to-trench-acceptance',
    predecessorName: '基底清理',
    successorName: '验槽与移交',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '基底清理完成后进入验槽和移交确认。',
  },
  {
    id: 'foundation-base-acceptance-to-cushion',
    predecessorName: '基底验收',
    successorName: '垫层施工',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '基底验收是垫层施工的质量关口。',
  },
  {
    id: 'foundation-concrete-to-curing',
    predecessorName: '混凝土浇筑',
    successorName: '养护与试块留置',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '混凝土浇筑完成后进入养护与试块留置。',
  },
  {
    id: 'foundation-curing-to-quality-acceptance',
    predecessorName: '养护与试块留置',
    successorName: '实体质量验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '实体质量验收依赖养护和试块资料闭合。',
  },
  {
    id: 'formwork-design-to-support-base',
    predecessorName: '模板深化与配模',
    successorName: '支架基础处理',
    relationKind: 'soft_sequence',
    createsDependency: false,
    dependencyType: 'SS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'candidate',
    reasonCode: 'ORDER_IS_GUIDANCE_NOT_BLOCKING',
    curationBasis: '模板深化和支架基础处理可部分穿插，不作为强制前置。',
  },
  {
    id: 'formwork-support-base-to-support-erection',
    predecessorName: '支架基础处理',
    successorName: '支架搭设与加固',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '支架搭设依赖基础承载面处理完成。',
  },
  {
    id: 'formwork-install-to-shape-acceptance',
    predecessorName: '模板安装',
    successorName: '模板成型验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '模板安装完成后进行成型验收。',
  },
  {
    id: 'formwork-acceptance-to-removal',
    predecessorName: '模板成型验收',
    successorName: '模板拆除与清理',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '拆除清理不得早于模板体系验收和后续拆模条件确认。',
  },
  {
    id: 'rebar-detailing-to-fabrication',
    predecessorName: '钢筋翻样与下料',
    successorName: '钢筋加工',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢筋加工依赖翻样和下料结果。',
  },
  {
    id: 'rebar-install-to-cover-blocks',
    predecessorName: '钢筋绑扎安装',
    successorName: '保护层垫块设置',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '保护层垫块设置服务于已绑扎钢筋的保护层控制。',
  },
  {
    id: 'rebar-embed-review-to-concealed-acceptance',
    predecessorName: '预留预埋复核',
    successorName: '隐蔽验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '钢筋、保护层和预留预埋复核后进入隐蔽验收。',
  },
  {
    id: 'concrete-material-to-pour-preparation',
    predecessorName: '原材料与配合比复核',
    successorName: '浇筑准备与交底',
    relationKind: 'parallel_allowed',
    createsDependency: false,
    dependencyType: 'SS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'candidate',
    reasonCode: 'PREPARATION_CAN_OVERLAP',
    scheduleMode: 'parallel_with_previous',
    curationBasis: '浇筑准备和交底可与配合比复核后段并行推进，不强制串行。',
  },
  {
    id: 'concrete-embed-review-to-arrival-acceptance',
    predecessorName: '模板钢筋预留预埋复核',
    successorName: '混凝土进场验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '混凝土进场验收前需确认模板、钢筋和预留预埋条件。',
  },
  {
    id: 'concrete-arrival-to-slump-sampling',
    predecessorName: '混凝土进场验收',
    successorName: '坍落度检查与试块留置',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '进场验收后开展坍落度检查和试块留置。',
  },
  {
    id: 'concrete-slump-to-pour',
    predecessorName: '坍落度检查与试块留置',
    successorName: '混凝土浇筑',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '坍落度检查和试块留置是混凝土浇筑前的质量关口。',
  },
  {
    id: 'concrete-pour-to-vibration',
    predecessorName: '混凝土浇筑',
    successorName: '分层振捣密实',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '分层振捣跟随浇筑展开，是物理工序顺序。',
  },
  {
    id: 'concrete-vibration-to-finishing',
    predecessorName: '分层振捣密实',
    successorName: '标高收面与施工缝处理',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '振捣密实后进入标高收面和施工缝处理。',
  },
  {
    id: 'concrete-strength-report-to-quality-check',
    predecessorName: '拆模强度报告复核',
    successorName: '实体质量检查',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '实体质量检查应承接拆模强度报告复核结果。',
  },
  {
    id: 'masonry-material-to-layout',
    predecessorName: '材料复验与砂浆试配',
    successorName: '排砖放线',
    relationKind: 'soft_sequence',
    createsDependency: false,
    dependencyType: 'SS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'candidate',
    reasonCode: 'ORDER_IS_GUIDANCE_NOT_BLOCKING',
    curationBasis: '材料复验和排砖放线可部分穿插，不作为强制前置。',
  },
  {
    id: 'masonry-tiebar-to-construction',
    predecessorName: '拉结筋植筋与验收',
    successorName: '构造柱圈梁钢筋模板',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '拉结筋植筋验收后进入构造柱圈梁钢筋模板。',
  },
  {
    id: 'masonry-final-cleanup-to-quality',
    predecessorName: '勾缝清理',
    successorName: '实测实量与质量验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '勾缝清理完成后进行实测实量和质量验收。',
  },
  {
    id: 'waterproof-base-check-to-detail-layer',
    predecessorName: '基层含水率或平整度检查',
    successorName: '节点附加层施工',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '基层检查合格后进入节点附加层施工。',
  },
  {
    id: 'waterproof-lap-to-water-test',
    predecessorName: '搭接收头处理',
    successorName: '闭水或淋水试验',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '搭接收头完成后进行闭水或淋水试验。',
  },
  {
    id: 'waterproof-test-to-protection',
    predecessorName: '闭水或淋水试验',
    successorName: '保护层与验收',
    relationKind: 'acceptance_gate',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'inspection',
    strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '试验闭合后进入保护层与验收。',
  },

  // ── 桩基成孔→清孔→灌注链 (hard_sequence / FS, 含时间窗) ──
  {
    id: 'pile-hole-quality-to-first-cleaning',
    predecessorName: '成孔质量检测',
    successorName: '一次清孔',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '成孔质量检测闭合后立即清孔，避免泥浆沉淀和坍孔。JGJ94 §6.3.4。',
    evidenceCodes: ['JGJ94'], evidenceRefs: [{ code: 'JGJ94', level: 'clause', ref: '6.3.4', rationale: '终孔后应尽快完成第一次清孔。' }],
    governancePriority: 'P0',
  },
  {
    id: 'pile-first-cleaning-to-cage-install',
    predecessorName: '一次清孔',
    successorName: '钢筋笼制作安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '一清完成后尽快吊放钢筋笼；安装完毕至灌注间隔不宜超过4h。JGJ94 §6.4。',
    evidenceCodes: ['JGJ94'], evidenceRefs: [{ code: 'JGJ94', level: 'clause', ref: '6.4', rationale: '清孔后应立即放入钢筋笼，间隔不宜超过4小时。' }],
    governancePriority: 'P0',
  },
  {
    id: 'pile-cage-to-tremie-second-cleaning',
    predecessorName: '钢筋笼制作安装',
    successorName: '导管安装和二次清孔',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢筋笼就位后安装导管，进行二次清孔。沉渣厚度端承桩≤5cm。JGJ94 §6.5。',
    evidenceCodes: ['JGJ94'], evidenceRefs: [{ code: 'JGJ94', level: 'clause', ref: '6.5', rationale: '二次清孔后沉渣厚度端承桩≤50mm，摩擦桩≤100mm。' }],
    governancePriority: 'P0',
  },
  {
    id: 'pile-second-cleaning-to-underwater-concrete',
    predecessorName: '导管安装和二次清孔',
    successorName: '水下混凝土灌注',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '二清结束后30min内必须开始灌注混凝土，否则重新测沉渣。JGJ94 §6.6。',
    evidenceCodes: ['JGJ94'], evidenceRefs: [{ code: 'JGJ94', level: 'clause', ref: '6.6', rationale: '二次清孔后应在30分钟内灌注混凝土；中断超过30分钟须重新测定沉渣。' }],
    governancePriority: 'P0',
    scheduleMode: 'sequential', requiresAllPreviousSiblings: true,
  },
  {
    id: 'pile-underwater-concrete-to-top-treatment',
    predecessorName: '水下混凝土灌注',
    successorName: '桩顶超灌和浮浆处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '混凝土灌注完成后进行桩顶超灌和浮浆处理。超灌高度≥0.5m。JGJ94 §6.6.8。',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'pile-top-treatment-to-integrity-test',
    predecessorName: '桩顶超灌和浮浆处理',
    successorName: '桩身完整性检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '桩头处理完成并达到检测龄期后进行桩身完整性检测。JGJ106。',
    evidenceCodes: ['JGJ94', 'JGJ106'],
  },
  {
    id: 'pile-integrity-test-to-acceptance',
    predecessorName: '桩身完整性检测',
    successorName: '桩基验收复核',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '桩身完整性检测报告闭合后进入桩基验收复核。GB50202 §5.1。',
    evidenceCodes: ['GB50202', 'JGJ94'],
  },

  // ── 混凝土结构：浇筑→养护→拆模→验收链 ──
  {
    id: 'concrete-pour-to-cure-lag',
    predecessorName: '混凝土浇筑',
    successorName: '养护与试块留置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '混凝土浇筑完成后进入养护与试块留置。常温养护≥7d，大体积按测温控制。GB50666 §8.5。',
    evidenceCodes: ['GB50666'], evidenceRefs: [{ code: 'GB50666', level: 'clause', ref: '8.5', rationale: '混凝土浇筑完毕后应及时养护，养护时间应符合规定。' }],
    governancePriority: 'P0',
  },
  {
    id: 'cure-to-strength-review',
    predecessorName: '养护与试块留置',
    successorName: '实体质量检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '养护完成并达到设计强度后，进行实体质量检查。GB50204 §8.1。',
    evidenceCodes: ['GB50204', 'GB50666'],
  },
  {
    id: 'formwork-removal-condition-to-removal',
    predecessorName: '拆模条件确认',
    successorName: '模板拆除与清理',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '拆模条件确认（强度报告复核）后，方可拆模。GB50666 §4.5。',
    evidenceCodes: ['GB50666'], evidenceRefs: [{ code: 'GB50666', level: 'clause', ref: '4.5', rationale: '模板拆除前应确认混凝土强度达到设计要求。' }],
  },

  // ── 钢结构：吊装→校正→连接→检测链 ──
  {
    id: 'steel-lift-to-temp-fix',
    predecessorName: '构件吊装就位',
    successorName: '临时固定与校正',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '构件吊装就位后立即进行临时固定与校正。GB50205 §10.3。',
    evidenceCodes: ['GB50205'], evidenceRefs: [{ code: 'GB50205', level: 'clause', ref: '10.3', rationale: '钢构件安装后应立即校正并可靠固定。' }],
  },
  {
    id: 'steel-temp-fix-to-connection',
    predecessorName: '临时固定与校正',
    successorName: '连接施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '校正完成后进行永久连接（焊接或高强螺栓）。栓焊混合节点先栓后焊。GB50205 §10.4。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-connection-to-ndt',
    predecessorName: '连接施工',
    successorName: '连接检测与验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '连接施工完成后进行检测验收。焊接冷却24h后探伤；螺栓终拧1h后48h内扭矩检查。GB50205 §5.2/§6.3。',
    evidenceCodes: ['GB50205'], evidenceRefs: [
      { code: 'GB50205', level: 'clause', ref: '5.2', rationale: '设计要求全焊透的一、二级焊缝应进行内部缺陷检验，检验应在焊接完成24h后进行。' },
      { code: 'GB50205', level: 'clause', ref: '6.3', rationale: '高强度螺栓终拧完成后1h后、48h内进行终拧扭矩检查。' },
    ],
    governancePriority: 'P0',
  },
  {
    id: 'bolt-initial-to-final-tightening',
    predecessorName: '初拧',
    successorName: '终拧',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '高强螺栓初拧后进行终拧，终拧扭矩/梅花头拧掉为合格。GB50205 §6.3。',
    evidenceCodes: ['GB50205'],
  },

  // ── 基坑支护 ──
  {
    id: 'retaining-wall-guide-to-trenching',
    predecessorName: '导墙施工',
    successorName: '成槽施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 3,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '导墙混凝土达到强度后进行成槽施工。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'trenching-to-joint-cleaning',
    predecessorName: '成槽施工',
    successorName: '槽段接头刷洗',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '成槽完成后刷洗槽段接头，接头管/箱在混凝土初凝后拔出。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'soil-nail-drill-to-grout',
    predecessorName: '土钉钻孔成孔',
    successorName: '土钉杆体安装和注浆',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钻孔成孔并清孔后立即安放土钉杆体并注浆。JGJ120 §4.4。',
    evidenceCodes: ['JGJ120'],
    evidenceRefs: [{ code: 'JGJ120', level: 'clause', ref: '4.4', rationale: '土钉钻孔成孔并清孔后方可安放杆体并注浆。' }],
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: '土钉墙真实工序名会出现“土钉孔定位和钻孔成孔”等定位前缀，应按土钉钻孔成孔语义命中既有规范规则。',
    },
  },
  {
    id: 'soil-nail-grout-to-mesh-weld',
    predecessorName: '土钉杆体安装和注浆',
    successorName: '钢筋网铺设和与土钉焊接连接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '土钉注浆完成并达到后续挂网焊接条件后，方可铺设钢筋网并与土钉焊接连接，再进入面层喷射混凝土施工。JGJ120。',
    evidenceCodes: ['JGJ120'],
    evidenceRefs: [
      { code: 'JGJ120', level: 'standard', ref: STANDARD_EVIDENCE.JGJ120?.evidenceUrl, rationale: '土钉注浆完成后，挂网焊接和后续喷射面层应承接已闭合的注浆作业条件。' },
      { code: 'JGJ120', level: 'process', rationale: '土钉杆体安装、注浆记录和注浆饱满度复核闭合后，再进入钢筋网铺设及与土钉焊接连接。' },
    ],
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: '土钉墙真实工序通常把挂网与土钉焊接单列为独立工序，应在注浆闭合后再进入挂网焊接。',
    },
  },
  {
    id: 'soil-nail-grout-to-shotcrete',
    predecessorName: '钢筋网铺设和与土钉焊接连接',
    successorName: '喷射混凝土面层',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢筋网铺设并与土钉焊接连接完成后，且土钉注浆已达到后续作业条件，再进行面层喷射混凝土。JGJ120。',
    evidenceCodes: ['JGJ120'],
    evidenceRefs: [
      { code: 'JGJ120', level: 'standard', ref: STANDARD_EVIDENCE.JGJ120?.evidenceUrl, rationale: '挂网焊接完成且注浆条件满足后，方可进入面层喷射混凝土。' },
      { code: 'JGJ120', level: 'process', rationale: '钢筋网规格、间距、保护层垫块、搭接和土钉端部焊接检查闭合后，再进入喷射混凝土面层施工。' },
    ],
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: '土钉墙后续工序在真实目录中常写作“面层混凝土喷射施工”，应归并到喷射混凝土面层语义。',
    },
    additionalPredecessorStableCodes: ['01-03-05-P04'],
  },
  {
    id: 'anchor-hole-to-body-install',
    predecessorName: '锚杆钻孔施工',
    successorName: '锚杆杆体安放',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '锚杆钻孔清孔后安放杆体，进行注浆。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'anchor-body-to-grouting',
    predecessorName: '锚杆杆体安放',
    successorName: '锚杆一次注浆和二次高压注浆',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '杆体安放后立即注浆；一次注浆后适时二次高压注浆。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'anchor-grouting-to-tension-lock',
    predecessorName: '锚杆一次注浆和二次高压注浆',
    successorName: '锚杆张拉和分级锁定',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '锚固体强度达到设计75%后方可张拉锁定。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'smw-mix-to-h-beam-insert',
    predecessorName: 'SMW搅拌桩施工',
    successorName: 'H型钢插入',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '水泥土搅拌完成后立即插入H型钢，型钢插入须在搅拌完成后30min内完成。',
    evidenceCodes: ['JGJ120'], governancePriority: 'P1',
  },

  // ── 砌体结构 ──
  {
    id: 'masonry-lay-to-top-infill',
    predecessorName: '砌筑施工',
    successorName: '顶砖斜砌或塞缝处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '砌筑完成后待墙体沉降稳定（≥7d），再进行顶部斜砌或塞缝。GB50203 §5.2。',
    evidenceCodes: ['GB50203'], evidenceRefs: [{ code: 'GB50203', level: 'clause', ref: '5.2', rationale: '填充墙砌筑完成后应间隔不少于7天再补砌顶部。' }],
    governancePriority: 'P1',
    scheduleMode: 'sequential',
  },

  // ── 防水工程 ──
  {
    id: 'waterproof-base-to-detailing',
    predecessorName: '基层处理',
    successorName: '节点附加层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基层处理和含水率检查合格后，先做阴阳角、管根等节点附加层。GB50208 §4.3。',
    evidenceCodes: ['GB50208'],
  },
  {
    id: 'waterproof-detailing-to-main-layer',
    predecessorName: '节点附加层施工',
    successorName: '大面防水层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '附加层验收后铺贴大面防水层。附加层宽度每边≥250mm。GB50208 §4.3。',
    evidenceCodes: ['GB50208'],
  },
  {
    id: 'waterproof-main-to-protection',
    predecessorName: '大面防水层施工',
    successorName: '保护层与验收',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '防水层闭水试验合格后立即施工保护层。地下室底板50mm C20细石混凝土。GB50208。',
    evidenceCodes: ['GB50208'],
  },

  // ── 幕墙 ──
  {
    id: 'facade-column-to-beam',
    predecessorName: '立柱安装',
    successorName: '横梁安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '立柱安装校正完成后安装横梁，形成龙骨网格。JGJ102。',
    evidenceCodes: ['JGJ102'],
  },
  {
    id: 'facade-frame-to-panel',
    predecessorName: '横梁安装',
    successorName: '面板安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '龙骨验收后安装幕墙面板。JGJ102。',
    evidenceCodes: ['JGJ102'],
  },
  {
    id: 'facade-panel-to-sealant',
    predecessorName: '面板安装',
    successorName: '耐候密封胶施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '面板安装调整后进行密封胶施工。胶缝在正压侧打胶。JGJ102。',
    evidenceCodes: ['JGJ102'],
  },

  // ── 风管 ──
  {
    id: 'duct-fab-to-flange-rivet',
    predecessorName: '风管咬口或焊接制作',
    successorName: '法兰制作和铆接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '风管咬口或焊接成型后进行法兰铆接组装。GB50243 §4.2。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'duct-flange-rivet-to-leak-pretest',
    predecessorName: '法兰制作和铆接',
    successorName: '风管严密性预检',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '风管组装后进行出厂严密性预检。中压系统按GB50243附录C漏风量测试。',
    evidenceCodes: ['GB50243'],
  },

  // ── 电气 ──
  {
    id: 'cable-lay-to-head-fab',
    predecessorName: '电缆敷设',
    successorName: '电缆头制作',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '电缆敷设完成并经排列整理后，进行电缆头制作。GB50303 §13。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'cable-head-to-insulation-test',
    predecessorName: '电缆头制作',
    successorName: '绝缘测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '电缆头制作完成后进行绝缘和耐压测试。GB50303 §17。',
    evidenceCodes: ['GB50303'],
  },

  // ── 给排水 ──
  {
    id: 'pipe-install-to-pressure-test',
    predecessorName: '管道安装',
    successorName: '管道试压',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '管道安装完成后进行水压试验，承压管道必须试压合格。GB50242 §3.3。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'pipe-pressure-test-to-flush',
    predecessorName: '管道试压',
    successorName: '管道冲洗',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '试压合格后进行系统冲洗至出水水质透明。生活给水须消毒并水质检测。GB50242 §4.2。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'pipe-flush-to-disinfection',
    predecessorName: '管道冲洗',
    successorName: '消毒和水质检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '冲洗后进行消毒和水质检测，符合《生活饮用水卫生标准》后方可通水。GB50242 §4.2。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'drain-install-to-water-fill-test',
    predecessorName: '排水管道安装',
    successorName: '灌水试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '排水管道安装后进行灌水试验，检查接口和管材无渗漏。GB50242 §5.2。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'drain-water-test-to-ball-test',
    predecessorName: '灌水试验',
    successorName: '通球试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '灌水试验合格后进行通球试验，确保管道通畅。GB50242 §5.2。',
    evidenceCodes: ['GB50242'],
  },

  // ── 抹灰 ──
  {
    id: 'plaster-neutralize-to-base-coat',
    predecessorName: '基层清理和界面处理',
    successorName: '底层抹灰',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基层湿润和界面处理完成后进行底层抹灰。分层施工，总厚度≥35mm须加强。GB50210 §4.2。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'plaster-base-to-middle-coat',
    predecessorName: '底层抹灰',
    successorName: '中层抹灰',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '底层抹灰初凝后（≥1d），进行中层抹灰。分层施工避免空鼓开裂。GB50210 §4.2。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'plaster-middle-to-finish-coat',
    predecessorName: '中层抹灰',
    successorName: '面层抹灰',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '中层抹灰凝固后进行面层抹灰，面层压光收平。GB50210 §4.2。',
    evidenceCodes: ['GB50210'],
  },

  // ── 涂饰 ──
  {
    id: 'paint-base-repair-to-putty-first',
    predecessorName: '基层清理和局部修补',
    successorName: '第一遍腻子',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基层修补和抗碱底漆后批刮腻子。含水率溶剂型≤8%、乳液型≤10%。GB50210 §10.1。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'paint-putty-to-sanding',
    predecessorName: '第一遍腻子',
    successorName: '打磨',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '腻子干燥后进行打磨平整。GB50210 §10.1。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'paint-sanding-to-primer',
    predecessorName: '打磨',
    successorName: '底漆',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '打磨清理后进行底漆涂刷，底漆干燥后进行面漆。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'paint-primer-to-topcoat',
    predecessorName: '底漆',
    successorName: '面漆第一遍',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '底漆干燥成膜后进行面漆涂刷。水性涂料施工5~35℃。GB50210。',
    evidenceCodes: ['GB50210'],
  },

  // ── 地面 ──
  {
    id: 'floor-leveling-to-lay',
    predecessorName: '结合层施工',
    successorName: '板块面层铺贴',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '干硬性水泥砂浆结合层铺设后进行板块铺贴。选料浸砖≥2h。GB50209。',
    evidenceCodes: ['GB50209'],
  },
  {
    id: 'floor-lay-to-joint-fill',
    predecessorName: '板块面层铺贴',
    successorName: '勾缝灌缝',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '板块铺贴24h后进行勾缝灌缝，养护≥7d。GB50209。',
    evidenceCodes: ['GB50209'],
  },

  // ── 保温节能 ──
  {
    id: 'insulation-board-lay-to-anchor',
    predecessorName: '保温板铺设',
    successorName: '锚栓固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '保温板粘贴后安装锚栓固定。粘结面积和锚栓数量符合设计。GB50411 §4.2。',
    evidenceCodes: ['GB50411'],
  },
  {
    id: 'insulation-anchor-to-mesh',
    predecessorName: '锚栓固定',
    successorName: '抗裂砂浆和网格布施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '锚栓固定后施工抗裂砂浆并压入耐碱玻纤网格布。GB50411。',
    evidenceCodes: ['GB50411'],
  },
  {
    id: 'insulation-mesh-to-finish',
    predecessorName: '抗裂砂浆和网格布施工',
    successorName: '饰面层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 3,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '抗裂砂浆干燥后进行饰面层施工。GB50411。',
    evidenceCodes: ['GB50411'],
  },

  // ── 装配式 ──
  {
    id: 'prefab-grout-material-to-seal',
    predecessorName: '灌浆料复验',
    successorName: '套筒封仓',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '灌浆料进场复验合格后封仓，封仓后灌浆施工。JGJ1 §6.3。',
    evidenceCodes: ['JGJ1'],
  },
  {
    id: 'prefab-seal-to-grout',
    predecessorName: '套筒封仓',
    successorName: '灌浆施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '封仓完成后进行灌浆，出浆确认饱满度，留置试块。JGJ1 §6.3。',
    evidenceCodes: ['JGJ1'],
  },
  {
    id: 'prefab-grout-to-curing-block',
    predecessorName: '灌浆施工',
    successorName: '灌浆记录和试块养护',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '灌浆施工完成后记录灌浆参数并留置试块养护。JGJ1。',
    evidenceCodes: ['JGJ1'],
  },

  // ── 电梯 ──
  {
    id: 'elevator-guide-rail-to-door-system',
    predecessorName: '导轨安装',
    successorName: '门系统安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '导轨安装校正后进行层门和轿门安装。GB50310 §4.4/§4.5。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'elevator-door-to-car',
    predecessorName: '门系统安装',
    successorName: '轿厢安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '门系统安装后进行轿厢组装。GB50310 §4.5/§4.6。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'elevator-car-to-safety',
    predecessorName: '轿厢安装',
    successorName: '安全部件安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '轿厢安装后进行限速器、安全钳、缓冲器等安全部件安装。GB50310 §4.8。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'elevator-safety-to-commissioning',
    predecessorName: '安全部件安装',
    successorName: '整机调试与验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '安全部件和电气安装完成后进行整机调试。限速器-安全钳联动、层门轿门联锁须全检。GB50310 §4.11。',
    evidenceCodes: ['GB50310'], evidenceRefs: [
      { code: 'GB50310', level: 'clause', ref: '4.11.3', rationale: '层门与轿门联锁试验必须动作正常。' },
    ],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 平行可穿插规则 (parallel_allowed) ──
  {
    id: 'material-acceptance-parallel-to-layout',
    predecessorName: '材料进场复验',
    successorName: '定位放线',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '材料进场复验与定位放线可并行推进，待两者完成后统一进入后续工序。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'site-prep-parallel-to-material-review',
    predecessorName: '施工准备与技术交底',
    successorName: '材料设备复核',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '技术交底与材料设备核查可按资源条件并行推进，交底后核查闭合即可。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'rebar-cage-prefab-parallel-to-hole-forming',
    predecessorName: '钢筋笼制作',
    successorName: '成孔施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '钢筋笼可提前预制，与成孔施工并行推进，成孔验收后立即下笼。JGJ94。',
    scheduleMode: 'parallel_with_previous',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'duct-hanger-prep-parallel-to-duct-fabrication',
    predecessorName: '支吊架制作安装',
    successorName: '风管制作',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '支吊架预制安装可与风管车间制作并行推进，现场安装前统一闭合。GB50243。',
    scheduleMode: 'parallel_with_previous',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'pipe-support-parallel-to-pipe-prefab',
    predecessorName: '支吊架制作安装',
    successorName: '管道预制加工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '管道支吊架制作和管道预制加工可按资源条件并行推进。GB50242。',
    scheduleMode: 'parallel_with_previous',
    evidenceCodes: ['GB50242'],
  },

  // ── 条件化规则 (applicableWhen) ──
  {
    id: 'winter-concrete-cure-lag-extended',
    predecessorName: '混凝土浇筑',
    successorName: '养护与试块留置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '冬期施工混凝土养护时间延长，受冻临界强度达标后方可进入下道工序。GB50666 §11。',
    applicableWhen: [{ field: 'method_variant_code', operator: 'includes_any', values: ['winter_construction', 'cold_region_concrete'] }],
    conditionalEffects: [{
      id: 'winter-cure-lag-extended-effect', when: [{ field: 'method_variant_code', operator: 'includes_any', values: ['winter_construction'] }],
      lagDays: 14, dependencyType: 'FS', relationKind: 'hard_sequence',
      curationBasis: '冬期施工受冻临界强度达标前不得进入后续工序，养护期不低于14d。',
    }],
    evidenceCodes: ['GB50666'],
  },
  {
    id: 'high-rise-steel-erection-wind-parallel-constraint',
    predecessorName: '构件吊装就位',
    successorName: '临时固定与校正',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '高层钢结构吊装受风速影响；6级以上大风须停止吊装作业。GB50205。',
    applicableWhen: [{ field: 'method_variant_code', operator: 'includes_any', values: ['high_rise', 'super_high_rise'] }],
    conditionalEffects: [{
      id: 'high-wind-parallel-constraint-effect', when: [{ field: 'method_variant_code', operator: 'includes_any', values: ['high_rise'] }],
      relationKind: 'hard_sequence', scheduleMode: 'sequential',
      curationBasis: '高层钢结构吊装后必须立即完成临时固定和校正，不得因多段并行推迟校正。',
    }],
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'seismic-zone-masonry-tie-reinforcement',
    predecessorName: '砌筑施工',
    successorName: '构造柱施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '抗震设防区砌体拉结筋和构造柱马牙槎须随砌随留，拉结筋间距≤500mm。GB50011 §7.3。',
    applicableWhen: [{ field: 'structure_type_code', operator: 'includes_any', values: ['seismic_fortification'] }],
    conditionalEffects: [{
      id: 'seismic-masonry-tie-effect', when: [{ field: 'structure_type_code', operator: 'includes_any', values: ['seismic_fortification'] }],
      relationKind: 'hard_sequence', scheduleMode: 'sequential',
      curationBasis: '抗震区砌体拉结筋须预埋/后植，构造柱马牙槎须随砌。',
    }],
    evidenceCodes: ['GB50011'],
  },

  // ── 地基处理：强夯链 ──
  {
    id: 'dc-site-drain-to-trial-tamping',
    predecessorName: '场地排水和表层整平',
    successorName: '试夯区和夯能参数确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '场地整平和排水条件具备后，方可选取试夯区进行参数确认。JGJ79 §6.3。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-trial-to-tamping-layout',
    predecessorName: '试夯区和夯能参数确认',
    successorName: '测量放线和夯点布设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '试夯参数（能级/遍数/间距/收锤标准）确认后，按参数进行夯点布设。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-layout-to-tamping-pass',
    predecessorName: '测量放线和夯点布设',
    successorName: '分遍强夯施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '夯点布设复核后进行分遍强夯。隔行跳打、先边区后中部。JGJ79 §6.3。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-tamping-pass-to-settlement-record',
    predecessorName: '分遍强夯施工',
    successorName: '夯沉量和遍数记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '每遍夯击完成后记录夯沉量和遍数，推平夯坑测量高程后判断是否进入下一遍。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-settlement-to-intermission',
    predecessorName: '夯沉量和遍数记录',
    successorName: '间歇期和补夯条件确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '每遍夯击后需间歇等待超静孔隙水压力消散（砂土可连续，黏土2~4周）。JGJ79 §6.3。',
    evidenceCodes: ['JGJ79'],
    conditionalEffects: [{
      id: 'dc-cohesive-soil-longer-intermission', when: [{ field: 'predecessor_name', operator: 'includes_any', values: ['黏性土'] }],
      lagDays: 21,
      curationBasis: '黏性土场地孔压消散慢，间歇期不低于21d。',
    }],
  },
  {
    id: 'dc-intermission-to-full-tamping',
    predecessorName: '间歇期和补夯条件确认',
    successorName: '夯后整平压实',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '全部点夯完成且间歇期满足后，进行满夯（低能量、锤印搭接≥1/5锤径）并碾压平整。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-compaction-to-bearing-test',
    predecessorName: '夯后整平压实',
    successorName: '承载力或变形检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 14,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '强夯施工结束后需休止期（砂土≥7d，黏土≥28d）方可进行承载力检测。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dc-bearing-test-to-acceptance',
    predecessorName: '承载力或变形检测',
    successorName: '地基验收复核',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '承载力或变形检测报告闭合后进入地基验收。GB50202 §4。',
    evidenceCodes: ['GB50202', 'JGJ79'],
  },

  // ── 地基处理：预压链 ──
  {
    id: 'preload-drain-to-settlement-monitoring',
    predecessorName: '砂垫层或排水板施工',
    successorName: '沉降和孔压监测点布设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '排水通道形成后布设沉降和孔压监测点，采集初始值。JGJ79 §5。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'preload-monitor-to-staged-loading',
    predecessorName: '沉降和孔压监测点布设',
    successorName: '分级加载预压',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '监测系统就位并采集初始值后，方可按分级加载方案进行预压。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'preload-loading-to-observation',
    predecessorName: '分级加载预压',
    successorName: '沉降和孔压观测',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '每级加载完成后按方案频率进行沉降和孔压观测，判断稳定后再加下一级。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'preload-observation-to-unload',
    predecessorName: '沉降和孔压观测',
    successorName: '卸载条件确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '固结度达到设计要求（一般≥80%）且沉降速率收敛后确认卸载。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'preload-unload-to-acceptance',
    predecessorName: '卸载条件确认',
    successorName: '承载力或固结效果检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '卸载后进行地基承载力和固结效果检测。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },

  // ── 消防水系统链 ──
  {
    id: 'fire-sprinkler-main-to-alarm-valve',
    predecessorName: '喷淋主管和支管安装',
    successorName: '报警阀和水流指示器安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '管网试压冲洗合格后安装报警阀和水流指示器。GB50261 §5.3。',
    evidenceCodes: ['GB50261', 'GB55036'],
  },
  {
    id: 'fire-alarm-valve-to-end-test',
    predecessorName: '报警阀和水流指示器安装',
    successorName: '末端试水装置安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '报警阀组安装后安装末端试水装置。GB50261 §5.4。',
    evidenceCodes: ['GB50261'],
  },
  {
    id: 'fire-end-test-to-sprinkler-head',
    predecessorName: '末端试水装置安装',
    successorName: '喷头安装',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '管网试压冲洗合格后方可安装喷头，严禁试压前安装喷头。GB50261 §5.6。',
    evidenceCodes: ['GB50261'],
    governancePriority: 'P0',
  },
  {
    id: 'fire-sprinkler-install-to-pump-tie-in',
    predecessorName: '喷头安装',
    successorName: '喷淋泵和水泵接合器连接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '喷头安装后接入喷淋泵和水泵接合器。GB50261。',
    evidenceCodes: ['GB50261'],
  },
  {
    id: 'fire-hydrant-standpipe-to-box',
    predecessorName: '消火栓立管和环管安装',
    successorName: '消火栓箱体安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '立管和环管安装试压后安装消火栓箱体。GB50261。',
    evidenceCodes: ['GB50261'],
  },
  {
    id: 'fire-hydrant-box-to-pump-tie-in',
    predecessorName: '消火栓箱体安装',
    successorName: '水泵接合器安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '消火栓箱安装后进行水泵接合器连接。GB50261。',
    evidenceCodes: ['GB50261'],
  },
  {
    id: 'fire-pump-solo-to-linkage-test',
    predecessorName: '水泵单机试运转',
    successorName: '消防联动测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '所有子系统单机调试合格后，进行消防联动调试。消火栓按钮和报警阀压力开关须直接启泵。GB50166 §4。',
    evidenceCodes: ['GB50166', 'GB55036'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 防排烟链 ──
  {
    id: 'smoke-duct-to-fire-damper',
    predecessorName: '防排烟风管安装',
    successorName: '防火阀安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '防排烟风管安装后安装防火阀。防火阀距墙≤200mm，宜设独立支吊架。GB50243。',
    evidenceCodes: ['GB50243', 'GB55037'],
  },
  {
    id: 'smoke-damper-to-fan',
    predecessorName: '防火阀安装',
    successorName: '排烟风机安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '防火阀安装后进行排烟风机安装和接线。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'smoke-fan-to-linkage-test',
    predecessorName: '排烟风机安装',
    successorName: '防排烟联动测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '风机单机调试后进行防排烟联动测试。火灾信号→防火阀关闭/排烟阀开启→风机启动。GB51251。',
    evidenceCodes: ['GB51251', 'GB55037'],
  },

  // ── 智能建筑：综合布线链 ──
  {
    id: 'its-cable-tray-to-cable-lay',
    predecessorName: '梯架托盘槽盒安装',
    successorName: '线缆敷设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '桥架和管槽安装验收后敷设线缆。填充率≤40%，强弱电间距≥500mm。GB50339 §6。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'its-cable-lay-to-termination',
    predecessorName: '线缆敷设',
    successorName: '配线架和信息插座端接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '线缆敷设预留后，进行配线架和模块端接。T568B排序，剥线13mm。GB50339。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'its-termination-to-certification',
    predecessorName: '配线架和信息插座端接',
    successorName: '永久链路或信道认证测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '端接完成后进行100%永久链路认证测试（接线图/长度/衰减/NEXT/回波损耗）。GB50339。',
    evidenceCodes: ['GB50339'],
  },

  // ── 火灾自动报警链 ──
  {
    id: 'fas-conduit-to-detector-install',
    predecessorName: '火灾报警线管敷设',
    successorName: '探测器安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '线管敷设和穿线完成后，在建筑内部装修结束后安装探测器。GB50166 §3.4。',
    evidenceCodes: ['GB50166'],
  },
  {
    id: 'fas-detector-to-controller',
    predecessorName: '探测器安装',
    successorName: '报警控制器安装和回路测试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '探测器安装后进行控制器回路测试和地址编码。GB50166。',
    evidenceCodes: ['GB50166'],
  },
  {
    id: 'fas-controller-to-linkage',
    predecessorName: '报警控制器安装和回路测试',
    successorName: '全功能消防联动测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '报警控制器单机调试后进行全功能联动测试（消火栓泵/喷淋泵/防排烟/防火卷帘/电梯迫降/广播切非）。GB50166 §4。',
    evidenceCodes: ['GB50166', 'GB55037'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 人防工程链 ──
  {
    id: 'cdf-preburied-to-wall-rebar',
    predecessorName: '密闭套管和预埋件进场验收',
    successorName: '墙板钢筋和预埋定位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '密闭套管进场验收后，在墙板钢筋绑扎时同步预埋定位。严禁后凿。GB50134。',
    evidenceCodes: ['GB50134'],
  },
  {
    id: 'cdf-preburied-to-concealed-check',
    predecessorName: '墙板钢筋和预埋定位',
    successorName: '隐蔽验收和浇筑旁站',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '密闭套管预埋定位后进行隐蔽验收，验收合格后方可浇筑。GB50134。',
    evidenceCodes: ['GB50134'],
    governancePriority: 'P0',
  },
  {
    id: 'cdf-door-frame-to-leaf-install',
    predecessorName: '防护门框安装',
    successorName: '防护门扇安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 14,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '门框墙混凝土达到设计强度后安装防护门扇，并进行密闭性能调试。GB50134。',
    evidenceCodes: ['GB50134'],
  },
  {
    id: 'cdf-vent-duct-to-gas-tight-test',
    predecessorName: '人防风管和密闭阀安装',
    successorName: '气密性和功能测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '人防通风系统安装后进行气密性和滤毒通风功能测试。GB50134。',
    evidenceCodes: ['GB50134'],
  },

  // ── 洁净室链 ──
  {
    id: 'cln-panel-to-seal',
    predecessorName: '彩钢板和门窗安装',
    successorName: '阴阳角圆弧和密封收口',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '彩钢板围护安装后进行阴阳角圆弧处理和密封收口。GB50333。',
    evidenceCodes: ['GB50333'],
  },
  {
    id: 'cln-seal-to-cleanliness-test',
    predecessorName: '阴阳角圆弧和密封收口',
    successorName: '洁净度测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '围护气密和密封收口完成后，进行洁净度粒子计数测试。GB50333。',
    evidenceCodes: ['GB50333'],
  },
  {
    id: 'cln-hepa-filter-to-press-diff',
    predecessorName: '高效过滤器安装和检漏',
    successorName: '压差梯度和温湿度调试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '高效过滤器检漏合格后，调试洁净区压差梯度和温湿度。GB50591。',
    evidenceCodes: ['GB50591', 'GB50333'],
  },
  {
    id: 'cln-press-diff-to-third-party',
    predecessorName: '压差梯度和温湿度调试',
    successorName: '第三方检测和洁净认证',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '各项性能调试完成后委托第三方检测机构进行洁净度综合性能验收。GB50333。',
    evidenceCodes: ['GB50333'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 室外工程链 ──
  {
    id: 'outdoor-trench-excavate-to-pipe-lay',
    predecessorName: '沟槽开挖支护与验槽',
    successorName: '管道铺设接口与坡度控制',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '沟槽验槽合格后进行管道铺设。基底标高和承载力须满足设计要求。GB50268 §4。',
    evidenceCodes: ['GB50268'],
  },
  {
    id: 'outdoor-pipe-lay-to-water-test',
    predecessorName: '管道铺设接口与坡度控制',
    successorName: '闭水通水试验与隐蔽验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '管道铺设完成并接口检查后，进行闭水试验和隐蔽验收。GB50268 §9。',
    evidenceCodes: ['GB50268'],
  },
  {
    id: 'outdoor-water-test-to-backfill',
    predecessorName: '闭水通水试验与隐蔽验收',
    successorName: '分层回填压实与道路恢复',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '闭水试验合格和隐蔽验收完成后，分层回填压实并恢复道路。GB50268。',
    evidenceCodes: ['GB50268'],
  },
  {
    id: 'outdoor-road-base-to-surface',
    predecessorName: '基层分层摊铺碾压',
    successorName: '面层施工与接缝处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '道路基层验收合格后进行面层施工和接缝处理。GB50268。',
    evidenceCodes: ['GB50268'],
  },

  // ── 太阳能光伏链 ──
  {
    id: 'solar-panel-mount-to-module',
    predecessorName: '支架安装',
    successorName: '光伏组件安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '支架安装和防雷接地完成后安装光伏组件。GB50794。',
    evidenceCodes: ['GB50794', 'GB50303'],
  },
  {
    id: 'solar-module-to-dc-cable',
    predecessorName: '光伏组件安装',
    successorName: '直流线缆和汇流箱安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '光伏组件安装后进行直流线缆敷设和汇流箱接线。GB50794。',
    evidenceCodes: ['GB50794'],
  },
  {
    id: 'solar-dc-cable-to-inverter',
    predecessorName: '直流线缆和汇流箱安装',
    successorName: '逆变器并网接线',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '直流侧完成后进行逆变器安装和并网接线。GB50794。',
    evidenceCodes: ['GB50794'],
  },
  {
    id: 'solar-inverter-to-grid-acceptance',
    predecessorName: '逆变器并网接线',
    successorName: '绝缘接地和发电测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '逆变器并网接线后，进行绝缘接地和发电性能测试，合格后并网验收。GB50794。',
    evidenceCodes: ['GB50794'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 医用气体链 ──
  {
    id: 'med-gas-pipe-weld-to-pressure-test',
    predecessorName: '管道焊接安装和支架固定',
    successorName: '强度严密性和吹扫试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '医气管道焊接安装后，进行强度试验、严密性试验和吹扫。GB50751。',
    evidenceCodes: ['GB50751'],
    governancePriority: 'P0',
  },
  {
    id: 'med-gas-test-to-terminal',
    predecessorName: '强度严密性和吹扫试验',
    successorName: '终端标识和报警联动测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '试压吹扫合格后安装气体终端，进行标识和报警联动测试。严禁试压前安装终端。GB50751。',
    evidenceCodes: ['GB50751'],
  },

  // ── 光伏+医气+地基+消防+防排烟+布线全链已完成，继续补并行规则 ──
  {
    id: 'site-electrical-parallel-to-plumbing',
    predecessorName: '临时用电配电接地系统施工',
    successorName: '临时供水排水与沉淀池施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '临时用水用电可按资源条件分区并行推进，送电前统一按TN-S验收。JGJ46。',
    scheduleMode: 'parallel_with_previous',
    evidenceCodes: ['JGJ46'],
  },
  {
    id: 'fire-detector-parallel-to-sprinkler-head',
    predecessorName: '火灾探测器安装',
    successorName: '喷头安装',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '探测器与喷头可在装修后分区并行安装，调试前统一回路/管网闭合。GB50166。',
    scheduleMode: 'parallel_with_previous',
    evidenceCodes: ['GB50166'],
  },
  {
    id: 'curtain-wall-panel-parallel-to-interior-finish',
    predecessorName: '幕墙面板安装',
    successorName: '室内装饰基层施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '幕墙面板封闭和室内装饰可按楼层分区并行推进，高层穿插施工常见组织方式。',
    scheduleMode: 'parallel_with_previous',
  },

  // ── 地暖系统链 ──
  {
    id: 'radiant-insulation-to-collector',
    predecessorName: '保温板和反射膜铺设',
    successorName: '分集水器安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '保温板反射膜铺设后进行分集水器安装。分水器在上集水器在下，中心距200mm。JGJ142 §5.3。',
    evidenceCodes: ['JGJ142', 'GB50242'],
  },
  {
    id: 'radiant-collector-to-coil-lay',
    predecessorName: '分集水器安装',
    successorName: '地暖盘管敷设和固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '分集水器安装后进行盘管敷设。弯曲半径≥6~8倍管外径，不得有接头。JGJ142 §5.4。',
    evidenceCodes: ['JGJ142'],
  },
  {
    id: 'radiant-coil-to-pressure-test-1',
    predecessorName: '地暖盘管敷设和固定',
    successorName: '水压试验（隐蔽前）',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '盘管敷设后进行水压试验（工作压力×1.5且≥0.6MPa，稳压1h压降≤0.05MPa）。试验合格后方可浇筑填充层。JGJ142 §5.6。',
    evidenceCodes: ['JGJ142', 'GB50242'],
    governancePriority: 'P0',
  },
  {
    id: 'radiant-pressure-test-to-fill',
    predecessorName: '水压试验（隐蔽前）',
    successorName: '填充层浇筑',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '水压试验合格后带压浇筑填充层（管内保持≥0.6MPa），禁用机械振捣。JGJ142。',
    evidenceCodes: ['JGJ142'],
  },
  {
    id: 'radiant-fill-to-curing',
    predecessorName: '填充层浇筑',
    successorName: '填充层养护',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '填充层浇筑后进行养护。养护期≥21d，期内系统保持≥0.4MPa压力，严禁踩踏。JGJ142。',
    evidenceCodes: ['JGJ142'],
  },
  {
    id: 'radiant-curing-to-pressure-test-2',
    predecessorName: '填充层养护',
    successorName: '二次水压试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 21,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '养护期满（≥21d）后进行二次水压试验，逐回路验证。JGJ142。',
    evidenceCodes: ['JGJ142'],
  },
  {
    id: 'radiant-pressure-test-2-to-balance',
    predecessorName: '二次水压试验',
    successorName: '热力平衡调试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '二次试压合格后冲洗系统，缓慢升温（起始25℃→每日3~5℃→设计水温）进行热力平衡调试。JGJ142。',
    evidenceCodes: ['JGJ142', 'GB50242'],
    requiresAllPreviousSiblings: true,
  },

  // ── 散热器采暖链 ──
  {
    id: 'radiator-group-test-to-wall-install',
    predecessorName: '散热器组对和单体试压',
    successorName: '散热器上墙安装',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '散热器逐组试压合格后上墙安装，托钩固定卡按规范安装。GB50242 §8.3。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'radiator-install-to-branch-pipe',
    predecessorName: '散热器上墙安装',
    successorName: '散热器供回水支管连接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '散热器安装就位后连接供回水支管。核对预留口位置和标高。GB50242。',
    evidenceCodes: ['GB50242'],
  },
  {
    id: 'radiator-branch-to-system-test',
    predecessorName: '散热器供回水支管连接',
    successorName: '系统水压试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '全部散热器和管道连接完成后进行系统水压试验。GB50242 §8.6。',
    evidenceCodes: ['GB50242'],
  },

  // ── 制冷/热泵系统链 ──
  {
    id: 'chiller-foundation-to-unit-set',
    predecessorName: '设备基础和减振复核',
    successorName: '制冷机组就位',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '设备基础和减振条件验收后进行机组就位。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'chiller-unit-to-refrigerant-pipe',
    predecessorName: '制冷机组就位',
    successorName: '制冷剂管道安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '机组就位后进行制冷剂管道安装。管道内外壁须清洁。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'chiller-pipe-to-vacuum-test',
    predecessorName: '制冷剂管道安装',
    successorName: '系统真空试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '管道安装后进行系统真空试验和保压观察，合格后灌注制冷剂。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'chiller-vacuum-to-refrigerant-charge',
    predecessorName: '系统真空试验',
    successorName: '制冷剂灌注和泄漏检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '真空保压合格后进行制冷剂灌注，灌注后检漏。运行压力、过热度过冷度复核。GB50243。',
    evidenceCodes: ['GB50243'],
    governancePriority: 'P0',
  },
  {
    id: 'chiller-charge-to-commissioning',
    predecessorName: '制冷剂灌注和泄漏检测',
    successorName: '机组试运行和能效验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '检漏合格后进行机组试运行，复核制冷量、COP等能效参数。GB50243。',
    evidenceCodes: ['GB50243'],
    requiresAllPreviousSiblings: true,
  },

  // ── 防雷接地链 ──
  {
    id: 'lightning-ground-electrode-to-lead',
    predecessorName: '接地极敷设',
    successorName: '接地干线焊接连接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '接地极敷设后进行接地干线焊接。搭接长度和防腐处理符合规范。GB50601 §4。',
    evidenceCodes: ['GB50601', 'GB50303'],
  },
  {
    id: 'lightning-lead-to-down-conductor',
    predecessorName: '接地干线焊接连接',
    successorName: '防雷引下线安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '接地干线完成后安装防雷引下线。利用结构主筋时需标示和焊接连接。GB50601 §5。',
    evidenceCodes: ['GB50601'],
  },
  {
    id: 'lightning-conductor-to-air-terminal',
    predecessorName: '防雷引下线安装',
    successorName: '接闪带或接闪杆安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '引下线完成后安装屋面接闪带/接闪杆。支架间距≤1m，转弯处≤0.5m。GB50601 §6。',
    evidenceCodes: ['GB50601'],
  },
  {
    id: 'lightning-air-terminal-to-resistance-test',
    predecessorName: '接闪带或接闪杆安装',
    successorName: '防雷接地电阻测试和验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防雷系统安装完成后进行接地电阻测试（≤1Ω）。GB50601。',
    evidenceCodes: ['GB50601', 'GB50303'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 吊顶系统链 ──
  {
    id: 'ceiling-layout-to-hanger',
    predecessorName: '弹线定位',
    successorName: '吊杆安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '弹线定位后进行吊杆安装。吊杆间距≤1200mm，膨胀螺栓固定。GB50210 §7.2。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'ceiling-hanger-to-main-keel',
    predecessorName: '吊杆安装',
    successorName: '主龙骨安装调平',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '吊杆安装后进行主龙骨安装和调平。起拱1/200，间距900~1200mm。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'ceiling-main-to-sub-keel',
    predecessorName: '主龙骨安装调平',
    successorName: '次龙骨安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '主龙骨调平后进行次龙骨安装。间距300~600mm。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'ceiling-keel-to-mep-coordination',
    predecessorName: '次龙骨安装',
    successorName: '机电末端点位复核',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '龙骨安装完成后进行机电末端点位复核和隐蔽验收。重型灯具严禁安装在吊顶龙骨上。GB50210 §7.2。',
    evidenceCodes: ['GB50210'],
    governancePriority: 'P0',
  },
  {
    id: 'ceiling-mep-to-panel',
    predecessorName: '机电末端点位复核',
    successorName: '面层石膏板安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '隐蔽验收后进行面层石膏板安装。自攻螺钉板边间距200mm板中300mm。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'ceiling-panel-to-joint-treatment',
    predecessorName: '面层石膏板安装',
    successorName: '板缝处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '石膏板安装后进行V型缝嵌缝膏填实和接缝纸带粘贴。GB50210。',
    evidenceCodes: ['GB50210'],
  },

  // ── 屋面防水保温完整链 ──
  {
    id: 'roof-structural-to-slope',
    predecessorName: '结构基层清理',
    successorName: '找坡层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '结构基层清理和闭水试验后，进行找坡层施工。GB50207 §4。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-slope-to-leveling',
    predecessorName: '找坡层施工',
    successorName: '找平层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '找坡层施工后进行找平层施工。分格缝间距≤6m，阴阳角抹成R≥50mm圆弧。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-leveling-to-insulation',
    predecessorName: '找平层施工',
    successorName: '保温层铺设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 3,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '找平层干燥后进行保温层铺设。板块错缝拼接，喷涂硬泡分遍施工每遍≤15mm。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-insulation-to-waterproof',
    predecessorName: '保温层铺设',
    successorName: '防水层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '保温层验收后进行防水层施工。坡度<3%平行屋脊铺贴，>15%垂直屋脊。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-waterproof-to-ponding-test',
    predecessorName: '防水层施工',
    successorName: '蓄水或淋水试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防水层施工后进行蓄水试验（≥24h）或淋水试验。渗漏整改闭合后进入保护层。GB50207 §4.4。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-ponding-test-to-protection',
    predecessorName: '蓄水或淋水试验',
    successorName: '保护层施工',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防水试验合格后进行保护层施工。细石混凝土40~50mm厚配φ6@200钢筋网，设分仓缝。GB50207。',
    evidenceCodes: ['GB50207'],
  },

  // ── 安防+门禁+楼宇自控链 ──
  {
    id: 'security-camera-mount-to-wiring',
    predecessorName: '摄像机支架安装',
    successorName: '摄像机接线和配置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '摄像机支架安装后进行接线、NVR配置和图像调优。GB50348。',
    evidenceCodes: ['GB50348'],
  },
  {
    id: 'security-camera-to-storage-test',
    predecessorName: '摄像机接线和配置',
    successorName: '存储容量和录像回放测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '摄像机配置后进行存储容量和录像回放测试。存储≥15天。GB50348。',
    evidenceCodes: ['GB50348'],
  },
  {
    id: 'access-reader-to-controller',
    predecessorName: '门禁读卡器安装',
    successorName: '门禁控制器和电控锁安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '读卡器安装后进行控制器和电控锁安装接线。读卡器安装高度1.4m。GB50348。',
    evidenceCodes: ['GB50348'],
  },
  {
    id: 'access-controller-to-software',
    predecessorName: '门禁控制器和电控锁安装',
    successorName: '权限策略和联动配置',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '控制器和电控锁安装后进行权限策略配置。消防联动开门须验证。GB50348。',
    evidenceCodes: ['GB50348'],
  },
  {
    id: 'bas-sensor-to-ddc',
    predecessorName: '传感器和执行器安装接线',
    successorName: 'DDC控制箱安装调试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'ִװDDC䰲װͳءBACnet/ModbusЭԽӡGB50339',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'bas-ddc-to-point-test',
    predecessorName: 'DDC控制箱安装调试',
    successorName: '单点对点和控制逻辑测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: 'DDC调试后进行点对点测试和控制逻辑验证。GB50339。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'bas-point-test-to-integration',
    predecessorName: '单点对点和控制逻辑测试',
    successorName: 'IBMS集成联调和试运行',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '点表测试完成后进行IBMS集成联调。数据采集准确率≥99%。GB50339。',
    evidenceCodes: ['GB50339'],
    requiresAllPreviousSiblings: true,
  },

  // ── 钢结构防腐防火涂装链 ──
  {
    id: 'steel-surface-prep-to-primer',
    predecessorName: '基层除锈',
    successorName: '防腐底漆施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢材表面除锈达到Sa2.5级后24h内涂刷底漆。GB50205 §13.2。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-primer-to-intermediate',
    predecessorName: '防腐底漆施工',
    successorName: '中间漆施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '底漆表干后涂装中间漆。总干膜厚度室外≥150μm室内≥125μm。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-intermediate-to-topcoat',
    predecessorName: '中间漆施工',
    successorName: '面漆施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '中间漆表干后进行面漆施工。涂装后4h内不得淋雨。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-topcoat-to-thickness-check',
    predecessorName: '面漆施工',
    successorName: '涂层干膜厚度检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防腐涂层完成后进行干膜厚度检测和针孔漏点检查。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-corrosion-to-fireproof',
    predecessorName: '涂层干膜厚度检测',
    successorName: '防火涂料施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '防腐涂层验收后进行防火涂料施工。分遍施工，厚涂型≥设计厚度，最薄处≥85%。GB50205 §13.4。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'steel-fireproof-to-bond-test',
    predecessorName: '防火涂料施工',
    successorName: '防火涂层厚度和粘结强度检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防火涂料完成后进行涂层厚度和粘结强度检测。GB50205。',
    evidenceCodes: ['GB50205'],
  },

  // ── 门窗安装链 ──
  {
    id: 'window-opening-to-subframe',
    predecessorName: '门窗洞口尺寸复核',
    successorName: '附框安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '洞口尺寸和垂直度复核后进行附框安装。金属副框须隔断热桥。GB50210 §5.1。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'window-subframe-to-frame',
    predecessorName: '附框安装',
    successorName: '门窗框安装固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '附框安装后进行门窗框安装固定。塑料窗须检查增强型钢。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'window-frame-to-gap-seal',
    predecessorName: '门窗框安装固定',
    successorName: '框与墙体缝隙填塞密封',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '门窗框安装固定后进行弹性闭孔材料填塞和密封胶密封。GB50210 §5.2。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'window-seal-to-glass',
    predecessorName: '框与墙体缝隙填塞密封',
    successorName: '玻璃安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '塞缝密封完成后安装玻璃。Low-E中空玻璃双道密封，镀膜面朝向符合设计。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'window-glass-to-hardware',
    predecessorName: '玻璃安装',
    successorName: '五金安装和启闭调试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '玻璃安装后进行五金件安装和启闭功能调试。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'window-hardware-to-airtight-test',
    predecessorName: '五金安装和启闭调试',
    successorName: '气密性现场检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '门窗安装完成后进行气密性现场实体检测。严寒/寒冷/夏热冬冷地区须抽检。GB50411。',
    evidenceCodes: ['GB50411', 'GB50210'],
  },

  // ── 条件化规则：夏热冬冷地区 vs 严寒地区差异 ──
  {
    id: 'cold-region-insulation-thickness-check',
    predecessorName: '保温层铺设',
    successorName: '保温层厚度检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '保温层铺设后进行厚度检测。严寒/寒冷地区须现场钻芯取样验证。GB50411。',
    applicableWhen: [{ field: 'method_variant_code', operator: 'includes_any', values: ['cold_region', 'severe_cold_region'] }],
    conditionalEffects: [{
      id: 'cold-region-drill-core-effect', when: [{ field: 'method_variant_code', operator: 'includes_any', values: ['cold_region', 'severe_cold_region'] }],
      relationKind: 'acceptance_gate',
      curationBasis: '严寒/寒冷地区保温层须钻芯取样验证，不得仅靠外观检查通过。',
    }],
    evidenceCodes: ['GB50411'],
  },

  // ── 并行可穿插补充 ──
  {
    id: 'mep-sleeve-parallel-to-rebar',
    predecessorName: '机电预留预埋',
    successorName: '墙板钢筋绑扎',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '机电套管预埋与土建钢筋绑扎可同步穿插，浇筑前统一隐检闭合。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'elevator-install-parallel-to-interior-finish',
    predecessorName: '电梯导轨和门系统安装',
    successorName: '室内精装修施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '电梯井道内安装与室内精装可按楼层分区并行，调试前井道和机房闭合即可。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'balancing-valve-parallel-to-insulation',
    predecessorName: '水力平衡阀安装',
    successorName: '管道保温施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '水力平衡阀和保温可按系统分区并行推进，保温前阀体须可操作验收。',
    scheduleMode: 'parallel_with_previous',
  },

  // ── 高压旋喷桩链 ──
  {
    id: 'jet-grout-position-to-drill',
    predecessorName: '桩位放样',
    successorName: '钻机就位和垂直度校正',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '桩位放样后进行钻机就位和垂直度校正。偏差≤50mm，垂直度≤1%。JGJ79 §7.4。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'jet-grout-drill-to-slurry-prep',
    predecessorName: '钻机就位和垂直度校正',
    successorName: '水泥浆配制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钻机就位后进行水泥浆配制。水灰比按设计，浆液比重≥1.5。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'jet-grout-slurry-to-trial-spray',
    predecessorName: '水泥浆配制',
    successorName: '试喷参数确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '水泥浆配制后进行清水试喷，确认管路密封和喷射压力(20~40MPa)、提升速度。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'jet-grout-trial-to-lift-spray',
    predecessorName: '试喷参数确认',
    successorName: '提升旋喷施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '试喷参数确认后进行由下向上连续旋喷，不得中断。超喷高度300~800mm。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'jet-grout-lift-to-top-supplement',
    predecessorName: '提升旋喷施工',
    successorName: '桩顶补浆处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '旋喷完成后进行桩顶补浆处理。浮浆在24h初凝后凿除。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'jet-grout-top-to-core-test',
    predecessorName: '桩顶补浆处理',
    successorName: '取芯或承载力检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 28,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '成桩后28d龄期进行钻孔取芯和承载力检测。取芯数量≥施工孔数2%且≥6点。JGJ79 §7.4.9。',
    evidenceCodes: ['JGJ79'],
  },

  // ── 水泥土搅拌桩链 ──
  {
    id: 'dsm-position-to-rig',
    predecessorName: '桩位放样',
    successorName: '设备就位和垂直度校正',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '桩位放样后进行搅拌设备就位和垂直度校正。垂直度≤1%。JGJ79 §7.3。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-rig-to-slurry',
    predecessorName: '设备就位和垂直度校正',
    successorName: '水泥浆配制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '设备就位后进行水泥浆配制。水泥掺量12%~20%，水灰比0.45~0.55。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-slurry-to-trial-pile',
    predecessorName: '水泥浆配制',
    successorName: '试桩参数确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '浆液配制后进行试桩，确认下沉速度、提升速度、喷浆压力等参数。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-trial-to-down-spray',
    predecessorName: '试桩参数确认',
    successorName: '下沉喷浆搅拌',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '试桩参数确认后进行正循环下沉喷浆搅拌至设计深度。严禁带水下钻。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-down-to-up-re-mix',
    predecessorName: '下沉喷浆搅拌',
    successorName: '提升复搅施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '下沉至设计深度后进行反循环提升复搅喷浆至基准面以下0.3m。二喷四搅确保均匀性。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-re-mix-to-top-treatment',
    predecessorName: '提升复搅施工',
    successorName: '桩顶处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '复搅完成后进行桩顶处理。超搅高度≥500mm，浮浆清除。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'dsm-top-to-core-test',
    predecessorName: '桩顶处理',
    successorName: '强度或完整性检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 28,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '成桩后28d龄期进行静载荷和取芯检测。取芯数量≥总桩数0.5%且≥6点。JGJ79 §7.3.7。',
    evidenceCodes: ['JGJ79'],
  },

  // ── 注浆地基链 ──
  {
    id: 'grouting-hole-position-to-drill',
    predecessorName: '钻孔定位和设备就位',
    successorName: '孔深孔径检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钻孔定位后进行孔深孔径检查。钻孔深度≥设计深度0.3~0.5m。JGJ79 §8.2。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-hole-to-slurry',
    predecessorName: '孔深孔径检查',
    successorName: '浆液配合比确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '孔深检查后确认浆液配合比。水灰比0.5~1.0，注浆压力按设计。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-slurry-to-pipe-install',
    predecessorName: '浆液配合比确认',
    successorName: '注浆管安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '浆液确认后进行注浆管安装。注浆管距孔底100~200mm。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-pipe-to-staged-grout',
    predecessorName: '注浆管安装',
    successorName: '分序分段注浆施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '注浆管安装后进行分序分段注浆。先外围后内部、间隔跳注。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-staged-to-record',
    predecessorName: '分序分段注浆施工',
    successorName: '压力流量和注浆量记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '注浆过程中实时记录注浆压力、流量和注浆量。异常应立即停止并分析。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-record-to-seal',
    predecessorName: '压力流量和注浆量记录',
    successorName: '封孔养护',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '注浆达到终注标准后进行封孔养护。养护期间禁止扰动。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'grouting-seal-to-effect-test',
    predecessorName: '封孔养护',
    successorName: '注浆效果检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 14,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '封孔养护14d后进行注浆效果检测（钻孔取芯/压水试验/物探）。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },

  // ── 沉井沉箱链 ──
  {
    id: 'caisson-edge-to-section-build',
    predecessorName: '刃脚基础和垫层施工',
    successorName: '井筒或箱体分节制作',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '刃脚基础和垫层完成后分节制作井筒或箱体。GB50202。',
    evidenceCodes: ['GB50202'],
  },
  {
    id: 'caisson-section-to-sinking',
    predecessorName: '井筒或箱体分节制作',
    successorName: '沉井下沉或沉箱压入施工',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 7,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '井筒/箱体混凝土达到设计强度后进行下沉或压入施工。GB50202。',
    evidenceCodes: ['GB50202'],
  },
  {
    id: 'caisson-sinking-to-deviation',
    predecessorName: '沉井下沉或沉箱压入施工',
    successorName: '下沉偏位和标高监测纠偏',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '下沉过程中实时监测偏位和标高，偏差超限立即纠偏。GB50202。',
    evidenceCodes: ['GB50202'],
  },
  {
    id: 'caisson-deviation-to-base-seal',
    predecessorName: '下沉偏位和标高监测纠偏',
    successorName: '封底或底板施工',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '下沉至设计标高且偏差闭合后，进行封底或底板施工。GB50202。',
    evidenceCodes: ['GB50202'],
  },
  {
    id: 'caisson-base-to-waterproof',
    predecessorName: '封底或底板施工',
    successorName: '井壁防渗和接缝处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '封底完成后进行井壁防渗和节段接缝处理。GB50202。',
    evidenceCodes: ['GB50202'],
  },

  // ── 边坡工程链 ──
  {
    id: 'slope-excavate-to-anchor-drill',
    predecessorName: '边坡分级开挖和坡面修整',
    successorName: '锚杆或锚索钻孔安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '分级开挖和坡面修整后进行锚杆/锚索钻孔安装。自上而下分层施工。GB50330。',
    evidenceCodes: ['GB50330'],
  },
  {
    id: 'slope-anchor-to-grid-beam',
    predecessorName: '锚杆或锚索钻孔安装',
    successorName: '格构梁或框架施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '锚杆/锚索安装后进行格构梁或框架施工。钢筋与锚头连接。GB50330。',
    evidenceCodes: ['GB50330'],
  },
  {
    id: 'slope-grid-to-shotcrete',
    predecessorName: '格构梁或框架施工',
    successorName: '喷射混凝土面层或挂网',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '格构完成后进行喷射混凝土面层或挂网。喷射自下而上。GB50330。',
    evidenceCodes: ['GB50330'],
  },
  {
    id: 'slope-shotcrete-to-drain',
    predecessorName: '喷射混凝土面层或挂网',
    successorName: '截水沟和排水孔设置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '坡面防护完成后设置坡顶截水沟、坡面排水孔和坡脚排水沟。GB50330。',
    evidenceCodes: ['GB50330'],
  },
  {
    id: 'slope-drain-to-monitoring',
    predecessorName: '截水沟和排水孔设置',
    successorName: '边坡监测点布设和验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '排水系统完成后布设监测点并采集初始值，进入长期监测。GB50330。',
    evidenceCodes: ['GB50330'],
  },

  // ── 钢管/型钢混凝土特殊链 ──
  {
    id: 'cfst-tube-erect-to-concrete-pour',
    predecessorName: '钢管安装就位',
    successorName: '钢管内混凝土浇筑',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '钢管安装验收后进行管内混凝土浇筑。宜采用自密实或顶升混凝土。GB50661。',
    evidenceCodes: ['GB50661'],
    governancePriority: 'P0',
  },
  {
    id: 'cfst-concrete-to-density-test',
    predecessorName: '钢管内混凝土浇筑',
    successorName: '管内混凝土密实度检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 28,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '钢管混凝土浇筑28d后进行密实度检测（敲击法或超声波）。GB50661。',
    evidenceCodes: ['GB50661'],
  },
  {
    id: 'src-steel-to-formwork',
    predecessorName: '型钢安装就位',
    successorName: '模板施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '型钢安装和连接节点验收后进行模板施工。对拉螺杆须穿型钢腹板预留孔。GB50204。',
    evidenceCodes: ['GB50204'],
  },
  {
    id: 'src-formwork-to-concrete',
    predecessorName: '模板施工',
    successorName: '型钢混凝土浇筑',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '模板和钢筋验收后进行型钢混凝土浇筑。柱梁节点区须保证混凝土密实。GB50204。',
    evidenceCodes: ['GB50204'],
  },

  // ── 幕墙/钢结构深化设计前置于施工 ──
  {
    id: 'steel-detailing-before-fab',
    predecessorName: '钢结构深化建模和节点确认',
    successorName: '构件下料组装焊接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '深化设计和节点确认完成后，方可进行构件下料和加工。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'facade-detailing-before-install',
    predecessorName: '幕墙深化图和分格复核',
    successorName: '测量放线',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '幕墙深化图和分格复核后进行现场测量放线。JGJ102。',
    evidenceCodes: ['JGJ102'],
  },

  // ── 条件化规则：不同项目类型差异 ──
  {
    id: 'hospital-med-gas-priority',
    predecessorName: '洁净围护结构施工',
    successorName: '医用气体管道安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '医院项目：洁净维护完成后方可进行医气管道安装，气体终端须在试压吹扫合格后安装。GB50751。',
    applicableWhen: [{ field: 'project_type_code', operator: 'includes_any', values: ['hospital'] }],
    conditionalEffects: [{
      id: 'hospital-med-gas-critical-path-effect', when: [{ field: 'project_type_code', operator: 'includes_any', values: ['hospital'] }],
      relationKind: 'hard_sequence', scheduleMode: 'sequential',
      curationBasis: '医院项目医气管道试压吹扫是气体终端安装的硬件前置，不得并行。',
    }],
    evidenceCodes: ['GB50751'],
  },
  {
    id: 'industrial-equipment-foundation-priority',
    predecessorName: '设备基础施工',
    successorName: '主体结构施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '工业厂房：大型设备基础须先于或与主体结构同步施工，设备进场条件须在结构封顶前具备。',
    applicableWhen: [{ field: 'project_type_code', operator: 'includes_any', values: ['industrial'] }],
    evidenceCodes: ['GB50204'],
  },

  // ── CFG桩 / 砂石桩 / 碎石桩链 ──
  {
    id: 'aggregate-pile-position-to-rig',
    predecessorName: '桩位放样',
    successorName: '成孔或成桩设备就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '桩位放样后进行成桩设备就位。偏差≤50mm。JGJ79 §7.2。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'aggregate-pile-rig-to-trial',
    predecessorName: '成孔或成桩设备就位',
    successorName: '试桩参数确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '设备就位后进行试桩，确定拔管速度、振密时间和填料量等参数。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'aggregate-pile-trial-to-fill',
    predecessorName: '试桩参数确认',
    successorName: '分层填料成桩',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '试桩参数确认后进行分层填料成桩。CFG桩泵送混合料坍落度160~200mm连续灌注。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'aggregate-pile-fill-to-compact',
    predecessorName: '分层填料成桩',
    successorName: '振密或夯实控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '填料过程中边填边振密。CFG桩拔管速度1.2~3.5m/min。JGJ79 §7.2/§7.7。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'aggregate-pile-compact-to-top',
    predecessorName: '振密或夯实控制',
    successorName: '桩顶处理和场地整平',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '成桩后进行桩顶处理和场地整平。CFG桩超灌≥0.5m，28d后截桩。JGJ79。',
    evidenceCodes: ['JGJ79'],
  },
  {
    id: 'aggregate-pile-top-to-test',
    predecessorName: '桩顶处理和场地整平',
    successorName: '桩身质量或承载力检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 28,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '成桩后28d龄期进行桩身质量或承载力检测。CFG桩低应变10%+静载0.2%~0.5%。JGJ79 §10。',
    evidenceCodes: ['JGJ79'],
  },

  // ── 静压桩链 ──
  {
    id: 'jacked-pile-position-to-reaction-frame',
    predecessorName: '压桩孔位和反力条件复核',
    successorName: '锚杆或反力架安装验收',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '孔位和反力条件复核后进行锚杆或反力架安装。JGJ94。',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'jacked-pile-frame-to-pressing',
    predecessorName: '锚杆或反力架安装验收',
    successorName: '静压设备就位和压桩施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '反力架验收后静压设备就位进行压桩施工。压桩速率≤2m/min。JGJ94。',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'jacked-pile-pressing-to-joint',
    predecessorName: '静压设备就位和压桩施工',
    successorName: '接桩连接和垂直度校正',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '压桩过程中进行接桩连接和垂直度校正。上下节桩轴线偏差≤10mm。JGJ94。',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'jacked-pile-joint-to-final-pressure',
    predecessorName: '接桩连接和垂直度校正',
    successorName: '终压值和稳压时间记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '压桩至设计深度后进行终压值和稳压时间记录。JGJ94。',
    evidenceCodes: ['JGJ94'],
  },
  {
    id: 'jacked-pile-final-to-cap',
    predecessorName: '终压值和稳压时间记录',
    successorName: '封桩或桩头处理',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '终压记录后进行封桩或桩头处理。JGJ94。',
    evidenceCodes: ['JGJ94'],
  },

  // ── 除尘系统链 ──
  {
    id: 'dedust-duct-to-hood',
    predecessorName: '除尘风管安装',
    successorName: '吸尘罩安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '除尘风管安装后进行吸尘罩安装，捕集效果和抽风效能检查。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'dedust-hood-to-filter',
    predecessorName: '吸尘罩安装',
    successorName: '除尘器和排污设备安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '吸尘罩安装后进行除尘器和排污设备安装。耐磨衬里和防爆接地须检查。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'dedust-filter-to-explosion-proof',
    predecessorName: '除尘器和排污设备安装',
    successorName: '泄爆或隔爆措施确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '除尘设备安装后进行泄爆/隔爆措施确认。防爆区须全数检查。GB50243。',
    evidenceCodes: ['GB50243'],
    governancePriority: 'P0',
  },
  {
    id: 'dedust-explosion-to-commissioning',
    predecessorName: '泄爆或隔爆措施确认',
    successorName: '除尘系统调试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防爆措施确认后进行除尘系统调试。风量、风压、除尘效率测试。GB50243。',
    evidenceCodes: ['GB50243'],
    requiresAllPreviousSiblings: true,
  },

  // ── UPS/EPS/柴油发电机链 ──
  {
    id: 'ups-foundation-to-cabinet',
    predecessorName: '设备基础型钢安装',
    successorName: 'UPS/EPS柜体就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基础型钢和接地验收后进行UPS/EPS柜体就位。GB50303。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'ups-cabinet-to-battery',
    predecessorName: 'UPS/EPS柜体就位',
    successorName: '蓄电池组安装接线',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '柜体就位后进行蓄电池组安装接线。正负极标识、通风和温度控制。GB50303。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'ups-battery-to-bypass-test',
    predecessorName: '蓄电池组安装接线',
    successorName: '充放电和旁路切换测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '蓄电池安装后进行充放电和旁路切换测试。切换时间≤10ms。GB50303。',
    evidenceCodes: ['GB50303'],
    governancePriority: 'P0',
  },
  {
    id: 'diesel-gen-position-to-install',
    predecessorName: '柴油发电机组基础验收',
    successorName: '柴油发电机组就位安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基础验收后进行柴油发电机组就位。减振、排烟、供油系统同步安装。GB50303。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'diesel-gen-install-to-load-test',
    predecessorName: '柴油发电机组就位安装',
    successorName: '负载试验和自动切换测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '机组安装后进行带载试验和市电断电自动启动切换测试。GB50303。',
    evidenceCodes: ['GB50303'],
    governancePriority: 'P0',
  },

  // ── 装饰：裱糊软包 + 细部链 ──
  {
    id: 'wallcovering-base-to-adhesive',
    predecessorName: '基层检查和处理',
    successorName: '界面或粘结层施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基层处理（含水率/平整度）后进行界面剂或粘结层施工。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'wallcovering-adhesive-to-lay',
    predecessorName: '界面或粘结层施工',
    successorName: '裱糊铺贴或软包安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '粘结层完成后进行裱糊铺贴或软包安装。图案对花、拼缝严密。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'wallcovering-lay-to-edge',
    predecessorName: '裱糊铺贴或软包安装',
    successorName: '阴阳角和边口收口',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '铺贴完成后进行阴阳角和边口收口处理。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'millwork-detailing-to-install',
    predecessorName: '深化排版和尺寸复核',
    successorName: '构件制作或进场验收',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '细部深化排版后进行构件制作或进场验收。橱柜/窗台板/护栏须核对预埋件。GB50210。',
    evidenceCodes: ['GB50210'],
  },
  {
    id: 'millwork-accept-to-install',
    predecessorName: '构件制作或进场验收',
    successorName: '构件安装固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '构件进场验收后进行安装固定。五金和预埋件同步检查。GB50210。',
    evidenceCodes: ['GB50210'],
  },

  // ── 屋面细部链 ──
  {
    id: 'roof-detail-interface-to-flashing',
    predecessorName: '出屋面构件根部处理',
    successorName: '泛水和收头密封施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '出屋面管道、烟道根部处理完成后进行泛水和收头密封。收头高度距找平层≥250mm。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-flashing-to-ponding',
    predecessorName: '泛水和收头密封施工',
    successorName: '闭水或淋水检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '细部防水完成后进行闭水或淋水检查。天沟、檐口、水落口须全数检查。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'roof-ponding-to-photo-record',
    predecessorName: '闭水或淋水检查',
    successorName: '细部节点拍照留痕',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '闭水淋水试验合格后进行节点拍照留痕和隐蔽资料闭合。GB50207。',
    evidenceCodes: ['GB50207'],
  },

  // ── 智能建筑：信息发布/停车引导/无线覆盖链 ──
  {
    id: 'info-display-mount-to-wiring',
    predecessorName: '信息发布屏支架安装',
    successorName: '信息发布终端安装接线',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '支架安装后进行终端安装接线和内容发布测试。GB50339。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'parking-guide-sensor-to-controller',
    predecessorName: '车位探测器安装',
    successorName: '车位引导控制器安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '车位探测器安装后进行控制器安装和引导屏调试。GB50339。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'wireless-ap-mount-to-coverage-test',
    predecessorName: '无线AP安装',
    successorName: '信号覆盖测试和调优',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: 'AP安装后进行信号覆盖测试和信道调优。信号强度≥-65dBm。GB50339。',
    evidenceCodes: ['GB50339'],
  },

  // ── 恒温恒湿系统链 ──
  {
    id: 'crac-sensor-calibrate-to-install',
    predecessorName: '温湿度传感器校准',
    successorName: '精密空调机组安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '传感器校准后进行精密空调机组安装。恒温恒湿精度按设计。GB50243。',
    evidenceCodes: ['GB50243'],
  },
  {
    id: 'crac-install-to-stability-test',
    predecessorName: '精密空调机组安装',
    successorName: '温湿度稳定性测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '机组安装后进行温湿度稳定性测试（≥48h连续运行）。GB50243。',
    evidenceCodes: ['GB50243'],
  },

  // ── 条件化：钢结构 vs 混凝土结构差异 ──
  {
    id: 'steel-structure-fireproof-mandatory',
    predecessorName: '钢结构主体安装验收',
    successorName: '防火涂料施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢结构主体验收后进行防火涂料施工。耐火极限须符合设计。GB50205。',
    applicableWhen: [{ field: 'structure_type_code', operator: 'includes_any', values: ['steel_structure'] }],
    conditionalEffects: [{
      id: 'steel-fireproof-critical-path-effect', when: [{ field: 'structure_type_code', operator: 'includes_any', values: ['steel_structure'] }],
      relationKind: 'hard_sequence', scheduleMode: 'sequential',
      curationBasis: '钢结构防火涂料是耐火极限的强制性保证，主体验收后须优先施工。',
    }],
    evidenceCodes: ['GB50205', 'GB55037'],
  },

  // ── 并行可穿插补充 ──
  {
    id: 'facade-test-parallel-to-interior',
    predecessorName: '幕墙四性试验和淋水试验',
    successorName: '室内精装修面层施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '幕墙性能试验与室内精装可按楼层分区并行，外立面淋水试验完成后室内方可收口。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'landscape-parallel-to-outdoor-mep',
    predecessorName: '室外雨污水管道施工',
    successorName: '绿化景观施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '室外管网与绿化景观可按区域分区并行，管线回填验收后景观面层施工。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'bim-clash-parallel-to-shop-drawing',
    predecessorName: 'BIM管综碰撞检查',
    successorName: '各专业深化设计出图',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: 'BIM碰撞检查与深化设计可迭代并行，碰撞报告逐版闭合后锁定出图。',
    scheduleMode: 'parallel_with_previous',
  },

  // ── 地下连续墙补充链 ──
  {
    id: 'diaphragm-wall-trenching-to-reinforcement-cage',
    predecessorName: '成槽施工',
    successorName: '钢筋笼整幅吊装就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '成槽验收后进行钢筋笼整幅吊装就位。钢筋笼不得强行压入。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'diaphragm-wall-cage-to-concrete',
    predecessorName: '钢筋笼整幅吊装就位',
    successorName: '导管安装和水下混凝土浇筑',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '钢筋笼就位后进行导管安装和水下混凝土浇筑。超灌高度≥0.5m。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'diaphragm-wall-concrete-to-joint',
    predecessorName: '导管安装和水下混凝土浇筑',
    successorName: '槽段接头刷洗和接头管拔出',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '混凝土初凝后刷洗槽段接头并拔出接头管/箱。刷壁次数须保证接头洁净。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'diaphragm-wall-joint-to-integrity-test',
    predecessorName: '槽段接头刷洗和接头管拔出',
    successorName: '墙身完整性和接头质量检测验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 28,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '地下连续墙施工28d后进行墙身完整性和接头质量检测。超声波或钻孔取芯。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },

  // ── 咬合桩链 ──
  {
    id: 'secant-pile-guide-wall-to-primary',
    predecessorName: '护筒或导墙施工',
    successorName: '素桩（荤桩）交替施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 3,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '导墙完成后进行素桩和荤桩交替施工。隔桩施工时序：先素桩后荤桩切割咬合。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },
  {
    id: 'secant-pile-primary-to-secondary',
    predecessorName: '素桩（荤桩）交替施工',
    successorName: '桩间咬合效果检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '荤桩成桩后检查与素桩的咬合效果。咬合厚度≥设计值。JGJ120。',
    evidenceCodes: ['JGJ120'],
  },

  // ── 铝合金结构链 ──
  {
    id: 'aluminum-weld-to-ndt',
    predecessorName: '铝合金焊接施工',
    successorName: '焊接外观和无损检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '铝合金焊接冷却后进行外观和无损检测。氩气保护、热影响区控制。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'aluminum-ndt-to-corrosion',
    predecessorName: '焊接外观和无损检测',
    successorName: '防腐处理或阳极氧化',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '焊缝检测合格后进行防腐处理或阳极氧化。异种金属接触处须隔离防腐。GB50205。',
    evidenceCodes: ['GB50205'],
  },
  {
    id: 'aluminum-panel-to-sealant',
    predecessorName: '铝合金面板安装',
    successorName: '咬边或扣合连接密封',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '面板安装后进行咬边或扣合连接和接缝密封。顺水流方向搭接。GB50205。',
    evidenceCodes: ['GB50205'],
  },

  // ── 木结构链 ──
  {
    id: 'timber-treatment-to-erection',
    predecessorName: '木构件防腐防火防虫处理',
    successorName: '木结构构件安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '防护处理完成并干燥后进行木构件安装。含水率须符合设计要求。GB50206。',
    evidenceCodes: ['GB50206'],
  },
  {
    id: 'timber-erection-to-connection',
    predecessorName: '木结构构件安装',
    successorName: '榫卯或金属连接件施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '构件就位后进行榫卯或金属连接件施工。连接节点须保证传力路径。GB50206。',
    evidenceCodes: ['GB50206'],
  },
  {
    id: 'timber-connection-to-acceptance',
    predecessorName: '榫卯或金属连接件施工',
    successorName: '结构整体验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '连接节点完成并检查后进行结构整体验收。垂直度、挠度复核。GB50206。',
    evidenceCodes: ['GB50206'],
  },

  // ── 人防平战转换链 ──
  {
    id: 'cdf-peacetime-precheck-to-conversion',
    predecessorName: '平战转换预案编制',
    successorName: '平战转换构件预埋和标识',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '平战转换预案审批后在施工阶段预埋转换构件并标识。严禁遗漏预埋件。GB50134。',
    evidenceCodes: ['GB50134'],
  },
  {
    id: 'cdf-conversion-preburied-to-trial',
    predecessorName: '平战转换构件预埋和标识',
    successorName: '平战转换演练和验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '预埋构件完成后进行平战转换演练和验收。转换时限须满足设计。GB50134。',
    evidenceCodes: ['GB50134'],
    governancePriority: 'P0',
  },

  // ── 母线槽链 ──
  {
    id: 'busway-tray-to-straight-section',
    predecessorName: '母线槽支架安装',
    successorName: '母线槽直线段安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '支架安装后进行母线槽直线段和弯头连接。绝缘电阻测试分段进行。GB50303 §10。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'busway-straight-to-expansion',
    predecessorName: '母线槽直线段安装',
    successorName: '伸缩节和防火封堵设置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '直线段安装后进行伸缩节设置和穿墙防火封堵。GB50303。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'busway-expansion-to-insulation-test',
    predecessorName: '伸缩节和防火封堵设置',
    successorName: '母线槽绝缘和相序测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '安装完成后进行绝缘电阻和相序测试。绝缘≥0.5MΩ。GB50303。',
    evidenceCodes: ['GB50303'],
    governancePriority: 'P0',
  },

  // ── 变压器链 ──
  {
    id: 'transformer-foundation-to-body',
    predecessorName: '变压器基础型钢安装',
    successorName: '变压器本体就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '基础型钢和接地完成后进行变压器本体就位。器身检查和附件安装。GB50303 §4。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'transformer-body-to-connection',
    predecessorName: '变压器本体就位',
    successorName: '高低压侧接线',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '变压器就位后进行高低压侧接线。相序、绝缘距离须符合规范。GB50303。',
    evidenceCodes: ['GB50303'],
  },
  {
    id: 'transformer-connection-to-impact-test',
    predecessorName: '高低压侧接线',
    successorName: '冲击合闸试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '接线完成后进行5次冲击合闸试验。每次间隔≥5min。GB50303。',
    evidenceCodes: ['GB50303'],
    governancePriority: 'P0',
  },

  // ── 扶梯链 ──
  {
    id: 'escalator-truss-to-step-chain',
    predecessorName: '桁架吊装就位',
    successorName: '梯级链和导轨安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '桁架就位和水平度复核后进行梯级链和导轨安装。GB50310 §6。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'escalator-step-chain-to-handrail',
    predecessorName: '梯级链和导轨安装',
    successorName: '扶手带和扶手导轨安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '梯级链安装后进行扶手带和扶手导轨安装。扶手带张紧装置调试。GB50310。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'escalator-handrail-to-safety-switch',
    predecessorName: '扶手带和扶手导轨安装',
    successorName: '安全开关和梳齿板调试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '扶手带安装后进行安全开关和梳齿板调试。梳齿板异物保护、梯级下沉、扶手带断带保护。GB50310。',
    evidenceCodes: ['GB50310'],
  },
  {
    id: 'escalator-safety-to-load-test',
    predecessorName: '安全开关和梳齿板调试',
    successorName: '空载和制动试运行',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '安全装置调试后进行空载和制动试运行。制停距离须符合规范。GB50310。',
    evidenceCodes: ['GB50310'],
    governancePriority: 'P0', requiresAllPreviousSiblings: true,
  },

  // ── 屋面特殊类型：种植/架空/蓄水 ──
  {
    id: 'green-roof-waterproof-to-root-barrier',
    predecessorName: '屋面防水层验收',
    successorName: '耐根穿刺层施工',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '种植屋面不少于两道防水，上道为耐根穿刺材料。蓄水试验合格后进行排蓄水层和种植土回填。GB50207。',
    evidenceCodes: ['GB50207'],
    governancePriority: 'P0',
  },
  {
    id: 'green-roof-barrier-to-drainage',
    predecessorName: '耐根穿刺层施工',
    successorName: '排蓄水板和过滤层铺设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '耐根穿刺层完成后铺设排蓄水板和过滤层。排水口和溢流口须保护。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'cool-roof-support-to-panel',
    predecessorName: '架空支座安装找平',
    successorName: '架空板铺设',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '支座安装后进行架空板铺设。架空层高度和通风口设置检查。GB50207。',
    evidenceCodes: ['GB50207'],
  },
  {
    id: 'water-storage-waterproof-to-partition',
    predecessorName: '蓄水屋面防水层施工',
    successorName: '蓄水区分格和挡水构造施工',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '防水层验收后进行蓄水分格和溢流口安装。蓄水深度和渗漏检查。GB50207。',
    evidenceCodes: ['GB50207'],
  },

  // ── 机房动环监控链 ──
  {
    id: 'dcim-sensor-to-collector',
    predecessorName: '环境传感器安装',
    successorName: '动环采集网关安装',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '温湿度、漏水、烟感等传感器安装后进行采集网关安装和通讯配置。GB50339。',
    evidenceCodes: ['GB50339'],
  },
  {
    id: 'dcim-gateway-to-alarm-test',
    predecessorName: '动环采集网关安装',
    successorName: '告警联动和远程通知测试',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '采集网关配置后进行告警联动和远程通知测试（短信/APP/声光）。GB50339。',
    evidenceCodes: ['GB50339'],
  },

  // ── 条件化规则：装配式 vs 现浇 ──
  {
    id: 'prefab-component-acceptance-before-hoisting',
    predecessorName: '预制构件进场验收',
    successorName: '构件吊装就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '装配式：构件进场验收（外观/尺寸/吊点/套筒）后方可吊装。JGJ1。',
    applicableWhen: [{ field: 'structure_type_code', operator: 'includes_any', values: ['prefabricated'] }],
    conditionalEffects: [{
      id: 'prefab-hoisting-gate-effect', when: [{ field: 'structure_type_code', operator: 'includes_any', values: ['prefabricated'] }],
      relationKind: 'acceptance_gate',
      curationBasis: '装配式构件吊装前必须完成进场验收，不容许边验收边吊装。',
    }],
    evidenceCodes: ['JGJ1'],
  },

  // ── 并行可穿插 ──
  {
    id: 'roof-mep-parallel-to-waterproof',
    predecessorName: '屋面机电设备基础施工',
    successorName: '屋面防水层施工',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '屋面设备基础与防水层可分区施工，设备基础根部防水须与大面积防水层搭接闭合。',
    scheduleMode: 'parallel_with_previous',
  },
  {
    id: 'commissioning-doc-parallel-to-punch-list',
    predecessorName: '设备单机试运转',
    successorName: '调试资料整理归档',
    relationKind: 'parallel_allowed', createsDependency: false, dependencyType: 'SS', lagDays: 0,
    relationRole: 'workflow', strength: 'candidate',
    reasonCode: 'ACTIVITIES_CAN_OVERLAP_WHEN_RESOURCES_PERMIT',
    curationBasis: '单机试运转与资料整理可同步推进，系统联调前资料闭合。',
    scheduleMode: 'parallel_with_previous',
  },

  // ══════════════════════════════════════════════════════════════
  //  活动步骤级规则（工序内3步之间的前后依赖）
  // ══════════════════════════════════════════════════════════════

  // ── 准备/交底类(3步) ──
  {
    id: 'activity-prep-doc-check-to-condition-confirm',
    predecessorName: '资料图纸核对',
    successorName: '作业条件确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：资料图纸核对后进行作业条件确认。',
  },
  {
    id: 'activity-prep-condition-confirm-to-safety-briefing',
    predecessorName: '作业条件确认',
    successorName: '安全技术交底',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：作业条件确认后进行安全技术交底。',
  },

  // ── 材料进场类(3步) ──
  {
    id: 'activity-material-doc-check-to-appearance',
    predecessorName: '资料核验',
    successorName: '外观数量检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：资料核验后进行外观数量检查。',
  },
  {
    id: 'activity-material-appearance-to-sampling',
    predecessorName: '外观数量检查',
    successorName: '见证取样或验收记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：外观数量检查后进行见证取样和验收签认。',
  },

  // ── 测量放线类(3步) ──
  {
    id: 'activity-measure-control-line-to-dimension',
    predecessorName: '控制线引测',
    successorName: '尺寸标高复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：控制线引测后进行尺寸标高复核。',
  },
  {
    id: 'activity-measure-dimension-to-record',
    predecessorName: '尺寸标高复核',
    successorName: '测量成果记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：尺寸标高复核后形成测量成果记录。',
  },

  // ── 加工/预制类(3步) ──
  {
    id: 'activity-fab-drawing-to-cutting',
    predecessorName: '加工图核对',
    successorName: '下料制作',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：加工图核对后进行下料制作。',
  },
  {
    id: 'activity-fab-cutting-to-numbering',
    predecessorName: '下料制作',
    successorName: '编号堆放',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：下料制作完成后编号堆放。',
  },

  // ── 施工/安装类(3步) ──
  {
    id: 'activity-exec-prep-to-construction',
    predecessorName: '作业面准备',
    successorName: '过程施工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：作业面准备后进行过程施工。',
  },
  {
    id: 'activity-exec-construction-to-selfcheck',
    predecessorName: '过程施工',
    successorName: '班组自检记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：过程施工后由班组形成自检记录。',
  },

  // ── 检测/试验类(3步) ──
  {
    id: 'activity-test-condition-to-measurement',
    predecessorName: '检查条件确认',
    successorName: '实测实量或功能测试',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：检查条件确认后进行实测实量或功能测试。',
  },
  {
    id: 'activity-test-measurement-to-signoff',
    predecessorName: '实测实量或功能测试',
    successorName: '记录签认整改',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：测试完成后进入记录签认和整改闭合。',
  },

  // ── 成品保护/移交类(3步) ──
  {
    id: 'activity-protect-setup-to-clean',
    predecessorName: '保护措施设置',
    successorName: '现场清理维护',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：保护措施设置后进行现场清理维护。',
  },
  {
    id: 'activity-protect-clean-to-handover',
    predecessorName: '现场清理维护',
    successorName: '移交确认记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：清理完成后进行移交确认记录。',
  },

  // ── 通用回退类 (作业条件确认→实施→自检整改确认) ──
  {
    id: 'activity-fallback-condition-to-exec',
    predecessorName: '作业条件确认',
    successorName: '实施',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级（通用回退）：作业条件确认后实施。',
  },
  {
    id: 'activity-fallback-exec-to-selfcheck',
    predecessorName: '实施',
    successorName: '自检整改确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级（通用回退）：实施后进行自检整改确认。',
  },

  // ── 特化步骤：模板 ──
  {
    id: 'activity-formwork-plan-to-matching',
    predecessorName: '模板方案核对',
    successorName: '配模尺寸复核',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：模板方案核对后进行配模尺寸复核。',
  },
  {
    id: 'activity-formwork-matching-to-reinforcement-node',
    predecessorName: '配模尺寸复核',
    successorName: '加固节点确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：配模尺寸复核后确认加固节点。',
  },
  {
    id: 'activity-formwork-clean-to-base',
    predecessorName: '承载面清理',
    successorName: '垫板扫地杆设置',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：承载面清理后设置垫板和扫地杆。',
  },
  {
    id: 'activity-formwork-base-to-settlement',
    predecessorName: '垫板扫地杆设置',
    successorName: '基础沉降检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：垫板扫地杆设置后进行基础沉降检查。',
  },
  {
    id: 'pcf-facade-embed-control-review-to-hoist',
    matchMode: 'stable_code',
    predecessorStableCode: 'PFB-01-01-07-P08',
    successorStableCode: 'PFB-01-01-07-P09',
    predecessorName: '外挂墙板连接件埋件和控制线复核',
    successorName: 'PCF外挂墙板吊装就位和临时固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'PCF外挂墙板吊装前应先完成连接件埋件、支座与控制线复核，确认吊装定位基准和连接条件后方可起吊就位并进行临时固定。',
    evidenceCodes: ['JGJ1', 'GB/T51231', 'GB50204', 'GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'JGJ1',
        level: 'standard',
        ref: STANDARD_EVIDENCE.JGJ1?.evidenceUrl,
        rationale: '装配式外挂墙板吊装前应复核预埋连接件、安装基准和构件定位条件，满足后方可吊装就位。',
      },
      {
        code: 'GB/T51231',
        level: 'standard',
        ref: STANDARD_EVIDENCE['GB/T51231']?.evidenceUrl,
        rationale: '装配式混凝土外挂墙板安装应以前置测量放线和连接构造条件闭合作为吊装释放条件。',
      },
      {
        code: 'JGJ1',
        level: 'process',
        rationale: '外挂墙板吊装前需完成连接件埋件、支座、控制线和吊装定位基准复核，确认临时固定条件后再起吊就位。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: 'PCF外挂墙板在房建装配式项目中普遍要求先复核埋件与控制线再吊装就位，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'pcf-facade-embed-control-review-to-hoist-factory',
    matchMode: 'stable_code',
    predecessorStableCode: 'PFB-04-01-10-P02',
    successorStableCode: 'PFB-04-01-10-P03',
    predecessorName: '外挂墙板连接件埋件和控制线复核',
    successorName: 'PCF外挂墙板吊装就位和临时固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'PCF外挂墙板吊装前应先完成连接件埋件、支座与控制线复核，确认吊装定位基准和连接条件后方可起吊就位并进行临时固定。',
    evidenceCodes: ['JGJ1', 'GB/T51231', 'GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'JGJ1',
        level: 'standard',
        ref: STANDARD_EVIDENCE.JGJ1?.evidenceUrl,
        rationale: '装配式外挂墙板吊装前应复核预埋连接件、安装基准和构件定位条件，满足后方可吊装就位。',
      },
      {
        code: 'GB/T51231',
        level: 'standard',
        ref: STANDARD_EVIDENCE['GB/T51231']?.evidenceUrl,
        rationale: '装配式混凝土外挂墙板安装应以前置测量放线和连接构造条件闭合作为吊装释放条件。',
      },
      {
        code: 'GB/T51231',
        level: 'process',
        rationale: '工厂化PC外挂墙板进场吊装前需闭合预埋连接件、安装基准线和构件定位复核，避免就位后结构偏差放大。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: 'PCF外挂墙板在房建装配式项目中普遍要求先复核埋件与控制线再吊装就位，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'impermeability-pressure-test-execution-to-concealed-quality-inspection-cast-in-place',
    matchMode: 'stable_code',
    predecessorStableCode: '02-01-03-P13-S02',
    successorStableCode: '02-01-03-P13-S03',
    predecessorName: '抗渗试压加工安装或浇筑施工',
    successorName: '抗渗试压尺寸偏差和隐蔽质量检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '抗渗试压执行完成后方可进入尺寸偏差和隐蔽质量检查，确保抗渗、成型和隐蔽部位质量在验收记录形成前完成闭环复核。',
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50204?.evidenceUrl,
        rationale: '现浇混凝土实体质量与隐蔽质量验收应承接试验和施工过程闭合结果，不应跳过试压/抗渗执行环节。',
      },
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '隐蔽工程和质量验收记录应建立在前序试验、检查和整改闭合的基础上。',
      },
      {
        code: 'GB50204',
        level: 'process',
        ref: '抗渗试压执行完成 -> 尺寸偏差和隐蔽质量检查',
        rationale: '抗渗试压、试验记录和隐蔽部位施工闭合后，尺寸偏差与隐蔽质量检查才具备实体质量判定依据。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '试验检查资料闭合 -> 验收记录形成',
        rationale: '检验批、隐蔽验收和质量控制资料应承接已完成的施工、试验和整改记录，不能将验收记录前置于试压执行。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '抗渗试压执行后进入尺寸偏差和隐蔽质量检查是高频质量闭环，应从薄回填升级为活动步骤级语义规则。',
    },
  },
  {
    id: 'impermeability-pressure-test-execution-to-concealed-quality-inspection-prefab',
    matchMode: 'stable_code',
    predecessorStableCode: '02-01-05-P13-S02',
    successorStableCode: '02-01-05-P13-S03',
    predecessorName: '抗渗试压加工安装或浇筑施工',
    successorName: '抗渗试压尺寸偏差和隐蔽质量检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '抗渗试压执行完成后方可进入尺寸偏差和隐蔽质量检查，确保抗渗、成型和隐蔽部位质量在验收记录形成前完成闭环复核。',
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50204?.evidenceUrl,
        rationale: '混凝土结构实体质量与隐蔽质量验收应承接试验和施工过程闭合结果，不应跳过试压/抗渗执行环节。',
      },
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '隐蔽工程和质量验收记录应建立在前序试验、检查和整改闭合的基础上。',
      },
      {
        code: 'GB50204',
        level: 'process',
        ref: '抗渗试压执行完成 -> 尺寸偏差和隐蔽质量检查',
        rationale: '现浇结构抗渗试压、试验记录和隐蔽部位施工闭合后，尺寸偏差与隐蔽质量检查才具备实体质量判定依据。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '试验检查资料闭合 -> 验收记录形成',
        rationale: '检验批、隐蔽验收和质量控制资料应承接已完成的施工、试验和整改记录，不能将验收记录前置于试压执行。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '抗渗试压执行后进入尺寸偏差和隐蔽质量检查是高频质量闭环，应从薄回填升级为活动步骤级语义规则。',
    },
  },
  {
    id: 'prefab-bathroom-handover-rectification-to-batch-acceptance',
    matchMode: 'stable_code',
    predecessorStableCode: 'IBU-03-01-05-P07',
    successorStableCode: 'IBU-03-01-05-P08',
    predecessorName: '分户移交问题整改作业',
    successorName: '批量验收移交',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '分户移交整改销项闭合后方可进入批量验收移交，确保户内安装缺陷、渗漏和功能问题完成复核闭环后再批量交付。',
    evidenceCodes: ['GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '建筑工程验收移交前应完成质量缺陷整改闭合和验收记录签认，不能带问题进入批量交付。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修与部品安装在验收前应完成功能和观感缺陷整改复验，满足使用条件后方可移交。',
      },
      {
        code: 'GB50210',
        level: 'process',
        ref: '分户移交问题整改 -> 批量验收移交',
        rationale: '整体卫浴分户移交问题、渗漏复测和观感功能缺陷应先整改闭合，再进入批量验收移交。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '整改复验闭合 -> 交付验收记录签认',
        rationale: '批量交付验收记录应以分户问题整改、复验签认和质量控制资料闭合作为放行条件。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '整体卫浴和集成厨房的分户整改后进入批量验收移交是高频强约束交付闭环，应固化为房建可复用语义规则。',
    },
  },
  {
    id: 'curing-and-finished-product-protection-execution-to-crew-self-check-record-cast-in-place',
    matchMode: 'stable_code',
    predecessorStableCode: '02-01-03-P11-S02',
    successorStableCode: '02-01-03-P11-S03',
    predecessorName: '养护覆盖与成品保护过程施工',
    successorName: '养护覆盖与成品保护班组自检记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '养护覆盖与成品保护执行完成后，班组方可形成自检记录，确认养护时长、覆盖措施、成品保护范围和现场闭合状态已满足后续质量验收记录要求。',
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50204?.evidenceUrl,
        rationale: '混凝土养护与成品保护属于实体质量形成过程，自检记录应建立在养护覆盖和保护措施已实际执行并完成复核的基础上。',
      },
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '施工质量验收资料中的班组自检记录应对应已完成的过程施工和现场质量自控闭环，不能脱离实际养护保护执行环节单独形成。',
      },
      {
        code: 'GB50204',
        level: 'process',
        ref: '养护覆盖与成品保护执行 -> 班组自检记录',
        rationale: '混凝土养护覆盖、温湿度记录、养护龄期和成品保护措施完成后，班组自检记录才具备过程质量依据。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '过程自控闭合 -> 质量验收资料归集',
        rationale: '施工质量验收资料应对应实际完成的过程自控、检查和整改闭合，不能先于养护保护执行生成。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '养护覆盖与成品保护完成后形成班组自检记录是高频质量闭环，直接影响结构成型与后续验收可信度，应从薄回填升级为活动步骤级语义规则。',
    },
  },
  {
    id: 'curing-and-finished-product-protection-execution-to-crew-self-check-record-prefab',
    matchMode: 'stable_code',
    predecessorStableCode: '02-01-05-P11-S02',
    successorStableCode: '02-01-05-P11-S03',
    predecessorName: '养护覆盖与成品保护过程施工',
    successorName: '养护覆盖与成品保护班组自检记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '养护覆盖与成品保护执行完成后，班组方可形成自检记录，确认养护时长、覆盖措施、成品保护范围和现场闭合状态已满足后续质量验收记录要求。',
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50204?.evidenceUrl,
        rationale: '混凝土养护与成品保护属于实体质量形成过程，自检记录应建立在养护覆盖和保护措施已实际执行并完成复核的基础上。',
      },
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '施工质量验收资料中的班组自检记录应对应已完成的过程施工和现场质量自控闭环，不能脱离实际养护保护执行环节单独形成。',
      },
      {
        code: 'GB50204',
        level: 'process',
        ref: '现浇结构养护覆盖与成品保护执行 -> 班组自检记录',
        rationale: '现浇结构养护覆盖、温湿度记录、养护龄期和成品保护措施完成后，班组自检记录才具备过程质量依据。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '过程自控闭合 -> 质量验收资料归集',
        rationale: '施工质量验收资料应对应实际完成的过程自控、检查和整改闭合，不能先于养护保护执行生成。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '养护覆盖与成品保护完成后形成班组自检记录是高频质量闭环，直接影响结构成型与后续验收可信度，应从薄回填升级为活动步骤级语义规则。',
    },
  },
  {
    id: 'prefab-kitchen-handover-rectification-to-batch-acceptance',
    matchMode: 'stable_code',
    predecessorStableCode: 'IKU-03-01-05-P07',
    successorStableCode: 'IKU-03-01-05-P08',
    predecessorName: '分户移交问题整改作业',
    successorName: '批量验收移交',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '分户移交整改销项闭合后方可进入批量验收移交，确保户内安装缺陷、渗漏和功能问题完成复核闭环后再批量交付。',
    evidenceCodes: ['GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '建筑工程验收移交前应完成质量缺陷整改闭合和验收记录签认，不能带问题进入批量交付。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修与部品安装在验收前应完成功能和观感缺陷整改复验，满足使用条件后方可移交。',
      },
      {
        code: 'GB50210',
        level: 'process',
        ref: '分户移交问题整改 -> 批量验收移交',
        rationale: '集成厨房分户移交问题、接口联通复测和观感功能缺陷应先整改闭合，再进入批量验收移交。',
      },
      {
        code: 'GB50300',
        level: 'process',
        ref: '整改复验闭合 -> 交付验收记录签认',
        rationale: '批量交付验收记录应以分户问题整改、复验签认和质量控制资料闭合作为放行条件。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '整体卫浴和集成厨房的分户整改后进入批量验收移交是高频强约束交付闭环，应固化为房建可复用语义规则。',
    },
  },
  {
    id: 'cfg-pile-position-to-auger-rig-01-02-10',
    matchMode: 'stable_code',
    predecessorStableCode: '01-02-10-P01',
    successorStableCode: '01-02-10-P02',
    predecessorName: '桩位放样',
    successorName: '长螺旋钻机就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'CFG桩施工应先完成桩位放样，再进行长螺旋钻机就位和调平，确保桩位偏差与设备垂直度满足开钻条件。',
    evidenceCodes: ['JGJ79'],
    evidenceRefs: [
      {
        code: 'JGJ79',
        level: 'clause',
        ref: '7.2',
        rationale: 'CFG桩及类似复合地基施工应先完成桩位放样复核，再进行成桩设备就位与参数确认。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: 'CFG桩目录中的“长螺旋钻机就位”比通用“成孔或成桩设备就位”更贴近真实房建工序，应从薄回填升级为语义规则。',
    },
  },
  {
    id: 'cfg-pile-position-to-auger-rig-01-01-12',
    matchMode: 'stable_code',
    predecessorStableCode: '01-01-12-P01',
    successorStableCode: '01-01-12-P02',
    predecessorName: '桩位放样',
    successorName: '长螺旋钻机就位',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'CFG桩施工应先完成桩位放样，再进行长螺旋钻机就位和调平，确保桩位偏差与设备垂直度满足开钻条件。',
    evidenceCodes: ['JGJ79'],
    evidenceRefs: [
      {
        code: 'JGJ79',
        level: 'clause',
        ref: '7.2',
        rationale: 'CFG桩及类似复合地基施工应先完成桩位放样复核，再进行成桩设备就位与参数确认。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: 'CFG桩目录中的“长螺旋钻机就位”比通用“成孔或成桩设备就位”更贴近真实房建工序，应从薄回填升级为语义规则。',
    },
  },

  // ── 特化步骤：钢筋 ──
  {
    id: 'hotel-mockup-mep-terminal-review-to-soft-furnishing-installation-core',
    matchMode: 'stable_code',
    predecessorStableCode: 'HTL-01-01-01-P04',
    successorStableCode: 'HTL-01-01-01-P05',
    predecessorName: '样板间机电末端复核作业',
    successorName: '样板间软装家具安装作业',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '酒店样板间软装家具安装前应先完成机电末端复核，确认灯具、开关插座、风口面板、洁具五金及客控点位满足品牌样板交付条件后，再进行家具和软装落位，避免返工和交叉破坏。',
    evidenceCodes: ['GB50300', 'GB50210'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '样板间作为交付和批量推广前的质量样本，后续工序应建立在前序实体和功能复核完成的基础上。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修与部品安装应在相关基层、接口和观感条件满足后进行，避免成品安装后再拆改机电末端。',
      },
      {
        code: 'GB50210',
        level: 'process',
        rationale: '软装家具落位前需完成样板间灯具、开关插座、风口面板、洁具五金和客控点位的末端复核销项。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '酒店样板间机电末端复核完成后再进行软装家具安装是高频真实交付顺序，直接影响品牌样板评审和后续批量推广可信度，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'hotel-mockup-mep-terminal-review-to-soft-furnishing-installation-brand',
    matchMode: 'stable_code',
    predecessorStableCode: 'HTL-06-01-01-P06',
    successorStableCode: 'HTL-06-01-01-P07',
    predecessorName: '样板间机电末端复核作业',
    successorName: '样板间软装家具安装作业',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '酒店样板间软装家具安装前应先完成机电末端复核，确认灯具、开关插座、风口面板、洁具五金及客控点位满足品牌样板交付条件后，再进行家具和软装落位，避免返工和交叉破坏。',
    evidenceCodes: ['GB50300', 'GB50210'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '样板间作为交付和批量推广前的质量样本，后续工序应建立在前序实体和功能复核完成的基础上。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修与部品安装应在相关基层、接口和观感条件满足后进行，避免成品安装后再拆改机电末端。',
      },
      {
        code: 'GB50210',
        level: 'process',
        rationale: '品牌样板间软装安装前需完成机电末端复核和品牌评审接口销项，避免家具软装安装后返工。',
      },
    ],
    governancePriority: 'P0',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P0',
      reason: '酒店样板间机电末端复核完成后再进行软装家具安装是高频真实交付顺序，直接影响品牌样板评审和后续批量推广可信度，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'hotel-lobby-stone-installation-to-reception-mep-weak-current-core',
    matchMode: 'stable_code',
    predecessorStableCode: 'HTL-02-01-01-P06',
    successorStableCode: 'HTL-02-01-01-P07',
    predecessorName: '大堂石材铺贴安装作业',
    successorName: '接待台机电弱电接入作业',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '酒店大堂接待台机电弱电接入应建立在大堂石材铺贴安装完成并稳定成面后，再进行台体接口、弱电点位和收口接驳，避免在完成面石材上反复切改、污染和返工。',
    evidenceCodes: ['GB50300', 'GB50210'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '后续专业接口施工应建立在前序实体质量与工作面条件满足的基础上，避免破坏已完成工序成品。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修成品面完成后再进行相关接口安装与收口更符合成品保护和观感控制要求。',
      },
      {
        code: 'GB50210',
        level: 'process',
        rationale: '接待台机电弱电接入前需完成大堂石材铺贴安装、成品保护和台体接口收口条件复核。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: '酒店大堂石材完成后再进行接待台机电弱电接入是高频真实接口顺序，直接影响成品保护、接口收口和大堂观感验收可信度，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'hotel-lobby-stone-installation-to-reception-mep-weak-current-brand',
    matchMode: 'stable_code',
    predecessorStableCode: 'HTL-06-01-13-P06',
    successorStableCode: 'HTL-06-01-13-P07',
    predecessorName: '大堂石材铺贴安装作业',
    successorName: '接待台机电弱电接入作业',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '酒店大堂接待台机电弱电接入应建立在大堂石材铺贴安装完成并稳定成面后，再进行台体接口、弱电点位和收口接驳，避免在完成面石材上反复切改、污染和返工。',
    evidenceCodes: ['GB50300', 'GB50210'],
    evidenceRefs: [
      {
        code: 'GB50300',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50300?.evidenceUrl,
        rationale: '后续专业接口施工应建立在前序实体质量与工作面条件满足的基础上，避免破坏已完成工序成品。',
      },
      {
        code: 'GB50210',
        level: 'standard',
        ref: STANDARD_EVIDENCE.GB50210?.evidenceUrl,
        rationale: '装饰装修成品面完成后再进行相关接口安装与收口更符合成品保护和观感控制要求。',
      },
      {
        code: 'GB50210',
        level: 'process',
        rationale: '品牌大堂接待台弱电接口接入前需闭合石材完成面保护、点位开孔边界和收口复核。',
      },
    ],
    governancePriority: 'P1',
    generalizationHint: {
      status: 'semantic_rule',
      promotionPriority: 'P1',
      reason: '酒店大堂石材完成后再进行接待台机电弱电接入是高频真实接口顺序，直接影响成品保护、接口收口和大堂观感验收可信度，应从薄回填升级为可复用语义规则。',
    },
  },
  {
    id: 'activity-rebar-design-check-to-bom',
    predecessorName: '设计变更核对',
    successorName: '钢筋料表复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：设计变更核对后进行钢筋料表复核。',
  },
  {
    id: 'activity-rebar-bom-to-cut',
    predecessorName: '钢筋料表复核',
    successorName: '下料尺寸抽检',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：料表复核后进行下料尺寸抽检。',
  },
  {
    id: 'activity-rebar-equip-check-to-bend',
    predecessorName: '加工设备检查',
    successorName: '弯曲成型复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：加工设备检查后进行弯曲成型复核。',
  },
  {
    id: 'activity-rebar-bend-to-stack',
    predecessorName: '弯曲成型复核',
    successorName: '半成品挂牌堆放',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：弯曲成型复核后挂牌堆放。',
  },

  // ── 特化步骤：混凝土 ──
  {
    id: 'activity-concrete-mix-check-to-slump',
    predecessorName: '配合比小票核查',
    successorName: '坍落度检测',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：配合比小票核查后进行坍落度检测。',
  },
  {
    id: 'activity-concrete-slump-to-sample',
    predecessorName: '坍落度检测',
    successorName: '试块留置记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：坍落度检测后进行试块留置。',
  },
  {
    id: 'activity-concrete-sequence-to-layer',
    predecessorName: '浇筑顺序控制',
    successorName: '分层振捣控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：浇筑顺序确定后按层振捣。',
  },
  {
    id: 'activity-concrete-layer-to-joint',
    predecessorName: '分层振捣控制',
    successorName: '施工缝处理记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：振捣完成后处理施工缝。',
  },

  // ── 特化步骤：防水 ──
  {
    id: 'activity-waterproof-moisture-to-corner',
    predecessorName: '基层含水率检测',
    successorName: '阴阳角圆弧检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：含水率检测后进行阴阳角圆弧检查。',
  },
  {
    id: 'activity-waterproof-corner-to-defect',
    predecessorName: '阴阳角圆弧检查',
    successorName: '基层缺陷修补',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：阴阳角圆弧检查后进行基层缺陷修补。',
  },
  {
    id: 'activity-waterproof-detailing-corner-to-pipe',
    predecessorName: '阴阳角附加层',
    successorName: '管根落水口附加层',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：阴阳角附加层后进行管根落水口附加层。',
  },
  {
    id: 'activity-waterproof-detailing-pipe-to-lap',
    predecessorName: '管根落水口附加层',
    successorName: '附加层搭接检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：附加层施工完成后检查搭接宽度。',
  },
  {
    id: 'activity-waterproof-lap-to-seal',
    predecessorName: '搭接宽度复核',
    successorName: '收头密封固定',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：搭接宽度复核后进行收头密封固定。',
  },

  // ── 特化步骤：砌体 ──
  {
    id: 'activity-masonry-rod-to-opening',
    predecessorName: '皮数杆设置',
    successorName: '门窗洞口排版',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：皮数杆设置后进行门窗洞口排版。',
  },
  {
    id: 'activity-masonry-opening-to-mortar-line',
    predecessorName: '门窗洞口排版',
    successorName: '灰缝控制线复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：洞口排版后进行灰缝控制线复核。',
  },

  // ── 特化步骤：抹灰 ──
  {
    id: 'activity-plaster-vertical-to-spacing',
    predecessorName: '吊垂直套方复核',
    successorName: '灰饼间距控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：吊垂直套方后进行灰饼间距控制。',
  },
  {
    id: 'activity-plaster-spacing-to-screed',
    predecessorName: '灰饼间距控制',
    successorName: '冲筋平整度复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：灰饼后进行冲筋平整度复核。',
  },
  {
    id: 'activity-plaster-mesh-lap-to-fix',
    predecessorName: '不同材料交接处挂网',
    successorName: '搭接宽度检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：挂网后进行搭接宽度检查(≥100mm)。',
  },
  {
    id: 'activity-plaster-mesh-fix-to-accept',
    predecessorName: '搭接宽度检查',
    successorName: '固定牢靠验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：搭接检查后验收固定牢靠性。',
  },

  // ── 特化步骤：涂饰 ──
  {
    id: 'activity-paint-base-clean-to-primer',
    predecessorName: '基层清洁度确认',
    successorName: '抗碱封闭底漆涂刷',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：基层清洁度确认后涂刷抗碱封闭底漆。',
  },
  {
    id: 'activity-paint-primer-dry-to-film-check',
    predecessorName: '抗碱封闭底漆涂刷',
    successorName: '底漆干燥成膜检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 1,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：底漆涂刷后检查干燥成膜(lag≥1d)。',
  },
  {
    id: 'activity-paint-topcoat-mix-to-layer',
    predecessorName: '面漆调配和过滤',
    successorName: '面漆分层涂刷',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：面漆调配过滤后分层涂刷。',
  },
  {
    id: 'activity-paint-layer-to-appearance',
    predecessorName: '面漆分层涂刷',
    successorName: '色泽均匀观感验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：面漆涂刷后进行色泽均匀观感验收。',
  },

  // ── 特化步骤：地面 ──
  {
    id: 'activity-floor-select-to-trial',
    predecessorName: '选料和浸砖检查',
    successorName: '试铺排砖确认',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：选料浸砖后进行试铺排砖确认。',
  },
  {
    id: 'activity-floor-trial-to-bond',
    predecessorName: '试铺排砖确认',
    successorName: '结合层饱满度检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：试铺确认后检查结合层饱满度。',
  },

  // ── 特化步骤：吊顶 ──
  {
    id: 'activity-ceiling-spacing-to-flatness',
    predecessorName: '吊点间距复核',
    successorName: '龙骨平整度检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：吊点间距复核后进行龙骨平整度检查。',
  },
  {
    id: 'activity-ceiling-flatness-to-concealed',
    predecessorName: '龙骨平整度检查',
    successorName: '隐蔽验收记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：龙骨检查后进行隐蔽验收记录签认。',
  },

  // ── 特化步骤：电气 ──
  {
    id: 'activity-electrical-cable-path-to-pull',
    predecessorName: '放缆路径检查',
    successorName: '牵引力和侧压力控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：路径检查后进行电缆牵引控制。',
  },
  {
    id: 'activity-electrical-pull-to-bend',
    predecessorName: '牵引力和侧压力控制',
    successorName: '弯曲半径和挂牌验收',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：电缆敷设后检查弯曲半径并挂牌。',
  },

  // ── 特化步骤：管道 ──
  {
    id: 'activity-pipe-numbering-to-bevel',
    predecessorName: '管段编号复核',
    successorName: '坡口套丝加工',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：管段编号复核后进行坡口或套丝加工。',
  },
  {
    id: 'activity-pipe-bevel-to-dimension',
    predecessorName: '坡口套丝加工',
    successorName: '预制尺寸检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：坡口套丝后进行预制尺寸检查。',
  },

  // ── 特化步骤：焊接 ──
  {
    id: 'activity-weld-rod-dry-to-param',
    predecessorName: '焊材烘干记录',
    successorName: '焊接参数控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：焊材烘干后进行焊接参数控制。',
  },
  {
    id: 'activity-weld-param-to-appearance',
    predecessorName: '焊接参数控制',
    successorName: '焊缝外观自检',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：焊接完成后进行焊缝外观自检。',
  },

  // ── 特化步骤：高强螺栓 ──
  {
    id: 'activity-bolt-initial-seq-to-final-torque',
    predecessorName: '初拧顺序控制',
    successorName: '终拧扭矩复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：初拧顺序控制后进行终拧扭矩复核。',
  },
  {
    id: 'activity-bolt-final-torque-to-mark',
    predecessorName: '终拧扭矩复核',
    successorName: '标记记录检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：终拧扭矩复核后检查标记和记录。',
  },

  // ── 特化步骤：钢结构吊装校正 ──
  {
    id: 'activity-steel-lift-point-to-clearance',
    predecessorName: '吊点吊具检查',
    successorName: '吊装路径清障',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：吊具检查后进行吊装路径清障。',
  },
  {
    id: 'activity-steel-clearance-to-trial-lift',
    predecessorName: '吊装路径清障',
    successorName: '试吊确认记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：路径清障后试吊确认(离地200~300mm)。',
  },

  // ── 特化步骤：桩基 ──
  {
    id: 'activity-pile-position-to-casing',
    predecessorName: '桩位放样复核',
    successorName: '护筒埋设垂直度检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：桩位放样后进行护筒埋设和垂直度检查。',
  },
  {
    id: 'activity-pile-casing-to-record',
    predecessorName: '护筒埋设垂直度检查',
    successorName: '桩位测量成果记录',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：护筒埋设后形成桩位测量成果记录。',
  },
  {
    id: 'activity-pile-slurry-ratio-to-density',
    predecessorName: '泥浆配比确认',
    successorName: '比重黏度含砂率检测',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：泥浆配比确认后进行比重黏度含砂率检测。',
  },
  {
    id: 'activity-pile-density-to-circulation',
    predecessorName: '比重黏度含砂率检测',
    successorName: '循环管路调试记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：泥浆指标检测后进行循环管路调试。',
  },
  {
    id: 'activity-pile-drill-position-to-param',
    predecessorName: '钻机就位校核',
    successorName: '钻进参数控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：钻机就位校核后进行钻进参数控制。',
  },
  {
    id: 'activity-pile-param-to-record',
    predecessorName: '钻进参数控制',
    successorName: '成孔记录签认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：钻进完成后形成成孔记录签认。',
  },
  {
    id: 'activity-pile-cage-fab-to-weld',
    predecessorName: '钢筋笼加工制作',
    successorName: '接头焊接质量检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：钢筋笼加工后进行接头焊接质量检查。',
  },
  {
    id: 'activity-pile-cage-weld-to-hoist',
    predecessorName: '接头焊接质量检查',
    successorName: '吊装下放定位控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：焊接检查后进行吊装下放定位控制。',
  },

  // ── 特化步骤：暖通 ──
  {
    id: 'activity-duct-thickness-to-seam',
    predecessorName: '板材厚度复核',
    successorName: '咬口法兰制作',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：板材厚度复核后进行咬口制作和法兰铆接。',
  },
  {
    id: 'activity-duct-seam-to-number',
    predecessorName: '咬口法兰制作',
    successorName: '成品编号堆放',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：风管制作完成进行成品编号堆放。',
  },
  {
    id: 'activity-duct-hanger-spacing-to-seal',
    predecessorName: '支吊架间距复核',
    successorName: '风管连接密封',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：支吊架间距复核后进行风管连接密封。',
  },
  {
    id: 'activity-duct-seal-to-elevation',
    predecessorName: '风管连接密封',
    successorName: '标高走向检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：风管密封后进行标高走向检查。',
  },

  // ── 特化步骤：幕墙 ──
  {
    id: 'activity-facade-layout-confirm-to-joint',
    predecessorName: '排版图确认',
    successorName: '分格缝协调',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：排版图确认后进行分格缝协调。',
  },
  {
    id: 'activity-facade-joint-to-sample',
    predecessorName: '分格缝协调',
    successorName: '样板段确认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：分格缝协调后确认样板段。',
  },

  // ── 特化步骤：地暖 ──
  {
    id: 'activity-radiant-spacing-to-bend',
    predecessorName: '盘管间距和弯曲半径检查',
    successorName: '卡钉固定牢靠检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：盘管间距检查后进行卡钉固定牢靠检查。',
  },
  {
    id: 'activity-radiant-fix-to-joint',
    predecessorName: '卡钉固定牢靠检查',
    successorName: '伸缩缝和保护套管检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：卡钉固定检查后进行伸缩缝和保护套管检查。',
  },

  // ── 特化步骤：保温节能 ──
  {
    id: 'activity-insulation-bond-area-to-stagger',
    predecessorName: '粘结面积检查',
    successorName: '拼缝错缝控制',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：粘结面积检查后进行拼缝错缝控制。',
  },
  {
    id: 'activity-insulation-stagger-to-anchor',
    predecessorName: '拼缝错缝控制',
    successorName: '锚栓固定拉拔试验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：拼缝错缝控制后进行锚栓固定拉拔试验。',
  },
  {
    id: 'activity-insulation-fire-strip-material-to-width',
    predecessorName: '隔离带材料核查',
    successorName: '隔离带宽度复核',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：防火隔离带材料核查(A级)后进行宽度复核(≥300mm)。',
  },

  // ── 特化步骤：消防 ──
  {
    id: 'activity-fire-pressure-plan-to-ramp',
    predecessorName: '试压方案确认',
    successorName: '升压保压记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：试压方案确认后进行升压保压记录。',
  },
  {
    id: 'activity-fire-ramp-record-to-leak-fix',
    predecessorName: '升压保压记录',
    successorName: '泄漏整改复验',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：升压保压记录后进行泄漏整改复验。',
  },
  {
    id: 'activity-fire-flush-plan-to-temp-line',
    predecessorName: '冲洗方案确认',
    successorName: '临时冲洗管路连接',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：冲洗方案确认后连接临时冲洗管路。',
  },
  {
    id: 'activity-fire-temp-line-to-zone-flush',
    predecessorName: '临时冲洗管路连接',
    successorName: '分区分段冲洗',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：临时管路连接后进行分区分段冲洗。',
  },
  {
    id: 'activity-fire-zone-flush-to-quality',
    predecessorName: '分区分段冲洗',
    successorName: '水质或浊度检查',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：分段冲洗后进行水质或浊度检查。',
  },

  // ── 特化步骤：弱电 ──
  {
    id: 'activity-its-label-check-to-module',
    predecessorName: '端接色标核查',
    successorName: '模块压接检查',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：端接色标核查后进行模块压接检查。',
  },
  {
    id: 'activity-its-module-to-link-record',
    predecessorName: '模块压接检查',
    successorName: '链路编号记录',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：模块压接检查后进行链路编号记录。',
  },
  {
    id: 'activity-its-fluke-test-to-report',
    predecessorName: 'FLUKE认证测试',
    successorName: '测试报告复核和签认',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：认证测试完成后复核报告并签认。',
  },

  // ── 特化步骤：电梯 ──
  {
    id: 'activity-elevator-hall-template-to-baseline',
    predecessorName: '样板架检查',
    successorName: '导轨基准线复核',
    relationKind: 'hard_sequence', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'workflow', strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: '活动步骤级：样板架检查后进行导轨基准线复核。',
  },
  {
    id: 'activity-elevator-baseline-to-record',
    predecessorName: '导轨基准线复核',
    successorName: '测量记录归档',
    relationKind: 'acceptance_gate', createsDependency: true, dependencyType: 'FS', lagDays: 0,
    relationRole: 'inspection', strength: 'recommended',
    reasonCode: 'QUALITY_GATE_REQUIRES_PRIOR_WORK',
    curationBasis: '活动步骤级：基准线复核后归档测量记录。',
  },
]

const LEGACY_INTERNAL_FLOW_EVIDENCE_REFS_BY_RULE_ID: Record<string, {
  evidenceCodes?: string[]
  evidenceRefs: StandardInternalFlowEvidenceRef[]
}> = {
  'fire-sprinkler-main-to-alarm-valve': {
    evidenceCodes: ['GB50261', 'GB55036'],
    evidenceRefs: [
      {
        code: 'GB50261',
        level: 'process',
        rationale: 'Sprinkler main and branch piping installation must be complete before alarm valves and water-flow indicators can be installed and accepted.',
      },
      {
        code: 'GB55036',
        level: 'process',
        rationale: 'Fire-fighting facility sequencing requires the water-delivery path to be closed before downstream alarm and indicating devices are trusted.',
      },
    ],
  },
  'fire-alarm-valve-to-end-test': {
    evidenceCodes: ['GB50261'],
    evidenceRefs: [
      {
        code: 'GB50261',
        level: 'process',
        rationale: 'Alarm valves and water-flow indicators should be installed before terminal water-test devices are connected for sprinkler-system testing.',
      },
    ],
  },
  'drain-water-test-to-ball-test': {
    evidenceCodes: ['GB50242'],
    evidenceRefs: [
      {
        code: 'GB50242',
        level: 'process',
        rationale: 'Drainage water or flooding tests should be closed before ball-passing tests verify pipe continuity and downstream drainage readiness.',
      },
    ],
  },
  'radiant-collector-to-coil-lay': {
    evidenceCodes: ['JGJ142', 'GB50300'],
    evidenceRefs: [
      {
        code: 'JGJ142',
        level: 'process',
        rationale: 'Radiant heating manifold installation should be closed before floor-heating coil laying and fixing so loop allocation, pipe spacing, and pressure-test boundaries are reliable.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Manifold installation records provide the building-quality release evidence before radiant floor coil layout becomes a trusted schedule successor.',
      },
    ],
  },
  'foundation-base-acceptance-to-cushion': {
    evidenceCodes: ['GB50202', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: '基础垫层施工前，应完成基底验收、承载条件和基底状态确认，未经验收不得进入覆盖性后续工序。',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: '隐蔽或被覆盖部位进入下一道工序前，应以质量验收资料和验收结论作为放行依据。',
      },
    ],
  },
  'winter-concrete-cure-lag-extended': {
    evidenceCodes: ['GB50666', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50666',
        level: 'process',
        rationale: '混凝土浇筑完成后，应及时进入养护、试块留置和强度发展跟踪，冬期或低温条件下不得将养护关口简化为普通排序。',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: '混凝土强度、养护记录和试块资料是后续质量验收和拆模放行的重要依据。',
      },
    ],
  },
  'foundation-curing-to-quality-acceptance': {
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: '基础混凝土养护、同条件或标准养护试块资料闭合后，实体质量验收才具备强度和质量判定依据。',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: '实体质量验收应承接养护记录、试块报告、检验批资料和质量控制资料，未闭合不得作为验收结论。',
      },
    ],
  },
  'grouting-hole-position-to-drill': {
    evidenceCodes: ['JGJ79', 'GB50202'],
    evidenceRefs: [
      {
        code: 'JGJ79',
        level: 'process',
        rationale: '注浆地基钻孔定位和设备就位后，应检查孔深、孔径和成孔条件，确认后才能进入后续注浆准备。',
      },
      {
        code: 'GB50202',
        level: 'process',
        rationale: '建筑地基处理施工应以成孔、孔位和过程检查记录作为质量控制资料。',
      },
    ],
  },
  'grouting-pipe-to-staged-grout': {
    evidenceCodes: ['JGJ79', 'GB50202'],
    evidenceRefs: [
      {
        code: 'JGJ79',
        level: 'process',
        rationale: '注浆管安装和孔底位置确认后，才能进行分序分段注浆并控制压力、流量和注浆量。',
      },
      {
        code: 'GB50202',
        level: 'process',
        rationale: '注浆地基过程施工应以注浆管安装、分段注浆参数和过程记录闭合作为后续检测验收依据。',
      },
    ],
  },
  'caisson-deviation-to-base-seal': {
    evidenceCodes: ['GB50202', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: 'Caisson bottom sealing or base-slab work is released only after sinking elevation, deviation monitoring, and correction records are closed.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The deviation correction record is the quality-control evidence that separates monitored sinking from the following irreversible base-sealing work.',
      },
    ],
  },
  'caisson-base-to-waterproof': {
    evidenceCodes: ['GB50202', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: 'Caisson bottom sealing or base-slab completion must precede wall seepage prevention and joint treatment so the enclosed base condition is inspectable.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Joint and seepage-prevention treatment depends on the preceding base construction records and inspection-batch quality closeout.',
      },
    ],
  },
  'diaphragm-wall-cage-to-concrete': {
    evidenceCodes: ['JGJ120', 'GB50300'],
    evidenceRefs: [
      {
        code: 'JGJ120',
        level: 'process',
        rationale: 'Underground diaphragm-wall tremie installation and underwater concrete placement follow full reinforcement-cage hoisting, positioning, and acceptance of the cage condition.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The cage positioning record and hidden-work check form the release evidence before underwater concrete placement can be trusted in scheduling.',
      },
    ],
  },
  'earthwork-settingout-to-excavation-support': {
    evidenceCodes: ['GB50202', 'JGJ120', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: 'Earthwork support, dewatering, drainage, and side-protection conditions should follow closed survey setting-out and excavation-control records for the current foundation-pit workface.',
      },
      {
        code: 'JGJ120',
        level: 'process',
        rationale: 'Foundation-pit support work relies on verified excavation boundary, monitoring, and protection layout before support or side-protection readiness can be trusted.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'This L2 anchor records the internal release from setting-out to support / protection readiness; dewatering stabilization, monitoring cadence, weather windows, and actual waiting days remain L5 project facts.',
      },
    ],
  },
  'earthwork-support-to-excavation': {
    evidenceCodes: ['GB50202', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: 'Earthwork layered excavation is released only after dewatering, drainage, slope protection, and excavation-side protection conditions are formed and recorded.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The workface protection and drainage closeout record is the quality-control evidence before excavation can be treated as a schedule-trust successor.',
      },
    ],
  },
  'earthwork-cleanup-to-trench-acceptance': {
    evidenceCodes: ['GB50202', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50202',
        level: 'process',
        rationale: 'Base cleanup must be closed before trench or foundation-base acceptance and handover because the exposed bearing layer is the inspection object.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Trench acceptance and handover depend on inspection records for the cleaned base condition and cannot be promoted without that process evidence.',
      },
    ],
  },
  'slope-anchor-to-grid-beam': {
    evidenceCodes: ['GB50330', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50330',
        level: 'process',
        rationale: 'Anchor or cable drilling and installation must be complete before lattice beam or frame work can bind the slope-support system.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The anchor installation record provides the preceding quality evidence for the following slope-support structural work.',
      },
    ],
  },
  'slope-grid-to-shotcrete': {
    evidenceCodes: ['GB50330', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50330',
        level: 'process',
        rationale: 'Lattice beam or frame construction establishes the support framework before shotcrete surface or mesh work closes the slope face.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Slope surface work should rely on the preceding support framework inspection record before it is treated as a schedule-trust sequence.',
      },
    ],
  },
  'slope-shotcrete-to-drain': {
    evidenceCodes: ['GB50330', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50330',
        level: 'process',
        rationale: 'Shotcrete surface or mesh work precedes interception ditches and drainage-hole setting so slope protection and drainage can be coordinated as one closed support system.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Drainage-hole and ditch setting depends on the completed slope-face condition and its inspection record.',
      },
    ],
  },
  'formwork-support-base-to-support-erection': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Formwork support erection must follow support-base treatment and bearing-surface confirmation so the temporary works have a verified foundation.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Concrete structure construction requires formwork and support systems to be checked before load-bearing setup is promoted as a reliable scheduling step.',
      },
    ],
  },
  'formwork-install-to-shape-acceptance': {
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Formwork installation must be completed before dimensional, elevation, stability, and formed-shape acceptance can be checked.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Formwork acceptance depends on installation records and inspection-batch quality evidence before downstream concrete work can rely on it.',
      },
    ],
  },
  'formwork-acceptance-to-removal': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Formwork removal and cleanup must follow formed-shape acceptance and removal-condition confirmation to avoid premature removal in scheduling.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Concrete construction process control treats formwork removal as dependent on verified formwork acceptance and release conditions.',
      },
    ],
  },
  'rebar-detailing-to-fabrication': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Rebar fabrication must follow detailing, bar schedule review, and cutting-list closeout so fabrication dimensions, bends, and quantities are traceable before site use.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Concrete-structure construction process control treats rebar processing as dependent on approved detailing and material preparation records.',
      },
    ],
  },
  'rebar-install-to-cover-blocks': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Cover blocks and spacers can be verified only after rebar binding and installation have established the designed bar position and cover-control object.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Rebar installation records and cover-control checks are linked process evidence before concealed work or concrete placement release.',
      },
    ],
  },
  'rebar-embed-review-to-concealed-acceptance': {
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Reserved openings, embedded parts, rebar position, and cover review must be closed before concealed acceptance can release the concrete successor.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Concealed-work acceptance requires preceding inspection-batch and hidden-condition records, making the embed review a schedulable quality gate.',
      },
    ],
  },
  'concrete-embed-review-to-arrival-acceptance': {
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Concrete arrival acceptance should follow closure of formwork, rebar, and embedded-item checks so concrete is not released to an unaccepted placement condition.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The preceding inspection-batch and concealed-work records are the quality evidence that connects pre-pour readiness to concrete arrival acceptance.',
      },
    ],
  },
  'concrete-arrival-to-slump-sampling': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Slump inspection and test-piece retention depend on accepted concrete arrival information, batch identity, mix delivery data, and sampling conditions.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Concrete construction process control requires arrival checks to precede on-site workability testing and specimen preparation.',
      },
    ],
  },
  'concrete-slump-to-pour': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Concrete placement is released after slump or workability checks and specimen retention confirm the delivered mix meets the required placement condition.',
      },
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Pouring control relies on pre-pour sampling, workability results, and test-piece records before the placement sequence can be trusted.',
      },
    ],
  },
  'concrete-pour-to-vibration': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Layered vibration is a controlled successor to concrete placement; it cannot be scheduled as independent work before the corresponding pour section starts.',
      },
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Concrete quality control depends on coordinated pouring and compaction records, making the pour-to-vibration edge a physical workflow anchor.',
      },
    ],
  },
  'concrete-vibration-to-finishing': {
    evidenceCodes: ['GB50204', 'GB50666'],
    evidenceRefs: [
      {
        code: 'GB50666',
        level: 'process',
        rationale: 'Elevation finishing and construction-joint treatment follow completed vibration and compaction of the placed concrete section.',
      },
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Concrete surface, joint, and formed-quality checks rely on preceding compaction records before finishing can be treated as a schedule-trust successor.',
      },
    ],
  },
  'concrete-strength-report-to-quality-check': {
    evidenceCodes: ['GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Entity quality inspection should follow review of strength reports, removal-strength evidence, and specimen results so structural quality checks have a verified basis.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Inspection-batch and entity-quality acceptance depend on closed strength-report evidence rather than an unverified construction sequence.',
      },
    ],
  },
  'masonry-story-pole-to-tiebar': {
    evidenceCodes: ['GB50203', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50203',
        level: 'process',
        rationale: 'Story-pole layout establishes masonry course control and opening alignment before tie bars or planted reinforcement can be checked and accepted.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Tie-bar acceptance depends on completed setting-out and course-control records, so this edge is a quality gate rather than an advisory order.',
      },
    ],
  },
  'masonry-tiebar-to-construction': {
    evidenceCodes: ['GB50203', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50203',
        level: 'process',
        rationale: 'Constructional columns, ring beams, and related rebar/formwork work must follow closure of tie-bar or planted-reinforcement inspection.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'The reinforcement inspection and acceptance record is the release evidence before concealed masonry reinforcement interfaces proceed.',
      },
    ],
  },
  'masonry-lintel-to-top-infill': {
    evidenceCodes: ['GB50203', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50203',
        level: 'process',
        rationale: 'Opening lintels, coping, and sill work should be complete before top infill or oblique brick/plugging work closes the upper masonry interface.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Top infill release depends on preceding opening-interface records and masonry inspection-batch evidence.',
      },
    ],
  },
  'masonry-top-infill-to-joint-clean': {
    evidenceCodes: ['GB50203', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50203',
        level: 'process',
        rationale: 'Joint cleaning and pointing should follow completed top infill or plugging, because the closed masonry joint condition is the inspection object.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Inspection-batch closeout relies on completed joint treatment records before measured quality acceptance.',
      },
    ],
  },
  'masonry-final-cleanup-to-quality': {
    evidenceCodes: ['GB50203', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50203',
        level: 'process',
        rationale: 'Masonry measured quantity, verticality, flatness, and acceptance checks should follow final joint cleaning and surface closeout.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Entity and inspection-batch quality acceptance depends on the completed masonry cleanup and measurement-ready state.',
      },
    ],
  },
  'waterproof-base-to-moisture-flatness': {
    evidenceCodes: ['GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50210',
        level: 'process',
        rationale: 'Exterior-wall waterproofing substrate treatment must be complete before moisture, flatness, and surface-condition checks can release detail-layer work.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Substrate inspection records are the acceptance evidence that prevents waterproof layers from being scheduled over an unchecked base.',
      },
    ],
  },
  'waterproof-base-check-to-detail-layer': {
    evidenceCodes: ['GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50210',
        level: 'process',
        rationale: 'Node reinforcement or additional waterproof layers are released only after substrate moisture, flatness, and defect checks are closed.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Detail-layer construction depends on the preceding substrate inspection record as a schedulable quality gate.',
      },
    ],
  },
  'waterproof-lap-to-water-test': {
    evidenceCodes: ['GB50210', 'GB50300'],
    evidenceRefs: [
      {
        code: 'GB50210',
        level: 'process',
        rationale: 'Flooding or spray-water testing should follow completed lap, end-seal, and termination treatment so the test validates the actual closed waterproof system.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'Waterproof testing is an acceptance gate that depends on completed joint and termination records, not a parallel activity.',
      },
    ],
  },
}

function enrichLegacyInternalFlowEvidenceRefs(rule: CuratedStandardInternalFlowRule): CuratedStandardInternalFlowRule {
  const enrichment = LEGACY_INTERNAL_FLOW_EVIDENCE_REFS_BY_RULE_ID[rule.id]
  if (!enrichment) return rule

  const existingEvidenceRefKeys = new Set(
    (rule.evidenceRefs ?? []).map((evidenceRef) => `${evidenceRef.code}:${evidenceRef.level}:${evidenceRef.ref ?? ''}`),
  )
  const evidenceRefs = [...(rule.evidenceRefs ?? [])]
  for (const evidenceRef of enrichment.evidenceRefs) {
    const key = `${evidenceRef.code}:${evidenceRef.level}:${evidenceRef.ref ?? ''}`
    if (!existingEvidenceRefKeys.has(key)) {
      existingEvidenceRefKeys.add(key)
      evidenceRefs.push(evidenceRef)
    }
  }

  return {
    ...rule,
    evidenceCodes: Array.from(new Set([
      ...(rule.evidenceCodes ?? []),
      ...(enrichment.evidenceCodes ?? []),
      ...enrichment.evidenceRefs.map((evidenceRef) => evidenceRef.code),
    ])),
    evidenceRefs,
  }
}

const OBSOLETE_INTERNAL_FLOW_CURATED_RULE_IDS = new Set([
  'prefab-bathroom-handover-rectification-to-batch-acceptance',
  'prefab-kitchen-handover-rectification-to-batch-acceptance',
])

const STANDARD_INTERNAL_FLOW_RULE_SEED_AS_CURATED: CuratedStandardInternalFlowRule[] = STANDARD_INTERNAL_FLOW_RULE_SEED

const STANDARD_INTERNAL_FLOW_CURATED_RULES: CuratedStandardInternalFlowRule[] = [
  ...STANDARD_INTERNAL_FLOW_RULE_SEED_AS_CURATED,
  {
    id: 'stable-code-MIC-06-01-15-P04-S02-to-MIC-06-01-15-P04-S03',
    matchMode: 'stable_code',
    predecessorStableCode: 'MIC-06-01-15-P04-S02',
    successorStableCode: 'MIC-06-01-15-P04-S03',
    predecessorName: '层间累积偏差测算',
    successorName: '相邻模块缝宽调整',
    relationKind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'PHYSICAL_SEQUENCE_REQUIRES_HANDOFF',
    curationBasis: 'MiC activity-step resolver-only backfill: cumulative inter-floor deviation calculation should close before adjacent module seam-width adjustment consumes the measured offset. The global MiC stable-code seed surface remains process-level.',
    applicableCategoryTypes: ['activity_step'],
    evidenceCodes: ['JGJ1', 'GB/T51231', 'GB50204', 'GB50300'],
    evidenceRefs: [
      {
        code: 'JGJ1',
        level: 'process',
        rationale: 'Modular and prefabricated component installation should calculate accumulated deviation before adjacent module seam-width adjustment consumes the measured offset.',
      },
      {
        code: 'GB/T51231',
        level: 'process',
        rationale: 'Industrialized building installation controls should preserve module positioning and seam-adjustment traceability in the same placement activity.',
      },
      {
        code: 'GB50204',
        level: 'process',
        rationale: 'Concrete and prefabricated structure installation quality records should connect coordinate deviation checks to local seam-width correction work.',
      },
      {
        code: 'GB50300',
        level: 'process',
        rationale: 'This L2 edge covers internal MiC alignment adjustment order only; second-placement deviation retest, node lock signoff, interface handover, and transport or hoisting waits remain outside L2.',
      },
    ],
    governancePriority: 'P2',
    generalizationHint: {
      status: 'stable_code_backfill',
      targetPattern: '层间累积偏差测算 -> 相邻模块缝宽调整',
      promotionPriority: 'P2',
      reason: 'Resolver-only domain activity-step backfill keeps the known MiC seam adjustment L2 gap closed without widening the process-level MiC stable-code seed surface.',
    },
  } as CuratedStandardInternalFlowRule,
  ...LEGACY_STANDARD_INTERNAL_FLOW_CURATED_RULES.map(enrichLegacyInternalFlowEvidenceRefs),
].filter((rule) => !OBSOLETE_INTERNAL_FLOW_CURATED_RULE_IDS.has(rule.id))

const INTERNAL_FLOW_STABLE_PAIR_RULE_ID_OVERRIDES: Record<string, string> = {
  '01-03-08-P01-S01->01-03-08-P01-S02': 'plan-draft-to-plan-approval-short',
  '01-02-15-P03-S01->01-02-15-P03-S02': 'shop-drawing-review-to-cutting-fabrication',
  '01-02-15-P03-S02->01-02-15-P03-S03': 'cutting-fabrication-to-numbered-stacking',
  '01-01-01-P03-S02->01-01-01-P03-S03': 'generic-appearance-count-to-witness-record',
  '01-01-02-P03-S02->01-01-02-P03-S03': 'generic-appearance-count-to-witness-record',
  '01-01-03-P03-S02->01-01-03-P03-S03': 'generic-appearance-count-to-witness-record',
  '01-01-04-P03-S02->01-01-04-P03-S03': 'generic-appearance-count-to-witness-record',
  '01-03-06-P02-S01->01-03-06-P02-S02': 'concrete-pour-order-to-vibration-control',
  '01-03-06-P02-S02->01-03-06-P02-S03': 'concrete-vibration-control-to-construction-joint-record',
  '02-06-07-P05->02-06-07-P06': 'domain-review-to-acceptance',
  '03-07-01-P06->03-07-01-P07': 'finish-joint-flatness-to-seal-clean',
  '03-07-01-P07->03-07-01-P08': 'finish-seal-clean-to-hollow-fixed-check',
  '03-07-01-P08->03-07-01-P09': 'finish-hollow-fixed-check-to-appearance-acceptance',
  '01-01-01-P05-S01->01-01-01-P05-S02': 'r16-test-plan-to-instrument-review',
  '01-01-01-P05-S02->01-01-01-P05-S03': 'r16-test-instrument-review-to-execution-record',
  '01-01-01-P05-S03->01-01-01-P05-S04': 'r16-test-execution-record-to-problem-closeout',
  '08-01-01-P01->08-01-01-P02': 'intelligent-platform-interface-confirm-alias-to-server-workstation-install',
  '05-01-02-P01-S01->05-01-02-P01-S02': 'r16-equipment-base-openbox-review-to-fix-interface',
  '05-01-02-P01-S02->05-01-02-P01-S03': 'r16-equipment-fix-interface-to-single-function-check',
  '05-01-02-P01-S03->05-01-02-P01-S04': 'r16-single-function-check-to-equipment-self-rectification',
  '05-01-02-P05-S01->05-01-02-P05-S02': 'r16-route-point-hanger-review-to-electrical-install',
  '05-01-02-P05-S02->05-01-02-P05-S03': 'r16-electrical-install-to-insulation-ground-loop-test',
  '05-01-02-P05-S03->05-01-02-P05-S04': 'r16-insulation-ground-loop-test-to-label-self-check',
  '05-05-01-P02->05-05-01-P03': 'pipe-support-manifold-to-heating-pipe-install-insulation',
  '05-05-01-P04->05-05-01-P05': 'terminal-equipment-install-to-pressure-flush',
  '05-05-01-P05->05-05-01-P06': 'pressure-flush-to-thermal-balance-temp-control',
  '05-05-01-P06->05-05-01-P07': 'domain-debug-to-acceptance',
  '06-01-01-P04->06-01-01-P05': 'flange-fabrication-riveting-to-duct-reinforcement',
  '06-01-03-P04->06-01-03-P05': 'damper-component-install-to-air-terminal-install',
  '06-01-03-P06->06-01-03-P07': 'duct-leak-light-test-to-insulation-acceptance',
  '06-01-04-P02->06-01-04-P03': 'equipment-arrival-acceptance-to-position-fixing',
  '06-01-04-P03->06-01-04-P04': 'equipment-position-fixed-to-duct-interface',
  '07-01-01-P08->07-01-01-P09': 'electrical-protection-test-to-power-run',
  '07-01-03-P05->07-01-03-P06': 'electrical-ground-bond-to-concealed-acceptance',
  '08-03-01-P03->08-03-01-P04': 'switch-gateway-install-to-cable-jumper',
  '08-03-01-P04->08-03-01-P05': 'cable-jumper-to-software-config',
  '08-03-01-P05->08-03-01-P06': 'software-config-to-network-service-test',
  '08-03-01-P06->08-03-01-P07': 'network-service-test-to-security-backup-config',
  '06-01-02-P04->06-01-02-P05': 'component-dimension-action-check-to-number-storage',
  '06-01-03-P05->06-01-03-P06': 'r3-site-temp-install-to-test',
  '06-07-01-P01->06-07-01-P02': 'hvac-embed-review-to-hanger-install',
  '06-13-01-P03->06-13-01-P04': 'drilling-trenching-to-buried-pipe-lowering-backfill',
  '06-13-01-P04->06-13-01-P05': 'buried-pipe-lowering-backfill-to-header-pressure-test',
  '06-13-01-P05->06-13-01-P06': 'header-connection-pressure-test-to-plant-heat-pump-piping',
  '06-13-01-P06->06-13-01-P07': 'heat-pump-room-piping-to-flush-fill-vent',
  '06-13-01-P07->06-13-01-P08': 'flush-fill-vent-to-energy-efficiency-commissioning',
  '06-14-01-P02->06-14-01-P03': 'source-well-construction-to-pump-piping-install',
  '06-14-01-P05->06-14-01-P06': 'water-treatment-install-to-pressure-flush',
  '06-14-01-P06->06-14-01-P07': 'pressure-flush-to-pipe-equipment-insulation',
  '06-14-01-P07->06-14-01-P08': 'pipe-equipment-insulation-to-antifreeze-commissioning',
  '06-15-01-P02->06-15-01-P03': 'storage-tank-position-to-piping-valve-install',
  '06-15-01-P05->06-15-01-P06': 'circulation-pump-heat-exchanger-install-to-pressure-flush',
  '06-15-01-P06->06-15-01-P07': 'pressure-flush-to-pipe-equipment-thermal-insulation',
  '06-15-01-P07->06-15-01-P08': 'pipe-equipment-insulation-to-water-circulation-storage-commissioning',
  '06-15-07-P07->06-15-07-P08': 'pipe-equipment-insulation-to-water-circulation-storage-commissioning',
  '06-16-01-P02->06-16-01-P03': 'chiller-unboxing-position-to-refrigerant-pipe-clean-install',
  '06-16-01-P03->06-16-01-P04': 'refrigerant-pipe-clean-install-to-valve-control-instrument',
  '06-16-01-P04->06-16-01-P05': 'valve-control-instrument-install-to-piping-vacuum-pressure-hold',
  '06-16-06-P04->06-16-06-P05': 'valve-control-instrument-install-to-piping-vacuum-pressure-hold',
  '06-16-01-P05->06-16-01-P06': 'piping-vacuum-pressure-hold-to-refrigerant-charge-leak-record',
  '06-16-01-P07->06-16-01-P08': 'oil-system-check-to-single-run-energy-review',
  '06-17-01-P02->06-17-01-P03': 'unit-unboxing-position-correction-to-steam-hot-water-piping',
  '06-17-01-P05->06-17-01-P06': 'solution-refrigerant-piping-to-vacuum-pressure-hold',
  '06-17-01-P06->06-17-01-P07': 'vacuum-pressure-hold-to-lithium-bromide-fill',
  '06-17-01-P07->06-17-01-P08': 'lithium-bromide-fill-to-single-machine-run',
  '06-17-08-P05->06-17-08-P06': 'solution-refrigerant-piping-to-vacuum-pressure-hold',
  '06-17-08-P07->06-17-08-P08': 'lithium-bromide-fill-to-single-machine-run',
  '06-18-01-P03->06-18-01-P04': 'indoor-unit-install-piping-to-refrigerant-piping-flare-seal',
  '06-18-01-P08->06-18-01-P09': 'vrf-refrigerant-charge-leak-to-system-trial-acceptance',
  '06-18-02-P03->06-18-02-P04': 'indoor-unit-install-piping-to-refrigerant-piping-flare-seal',
  '06-18-02-P08->06-18-02-P09': 'vrf-refrigerant-charge-leak-to-system-trial-acceptance',
  '06-18-07-P03->06-18-07-P04': 'indoor-unit-install-piping-to-refrigerant-piping-flare-seal',
  '06-18-07-P08->06-18-07-P09': 'vrf-refrigerant-charge-leak-to-system-trial-acceptance',
  '06-19-01-P02->06-19-01-P03': 'solar-collector-bracket-to-collector-install',
  '06-19-02-P02->06-19-02-P03': 'solar-collector-bracket-to-collector-install',
  '06-19-01-P05->06-19-01-P06': 'auxiliary-heat-source-install-to-antifreeze-fill',
  '06-19-03-P05->06-19-03-P06': 'auxiliary-heat-source-install-to-antifreeze-fill',
  '06-19-01-P07->06-19-01-P08': 'pressure-flush-to-solar-circulation-temp-control',
  '06-19-06-P07->06-19-06-P08': 'pressure-flush-to-solar-circulation-temp-control',
  '07-01-07-P01->07-01-07-P02': 'cable-end-strip-to-core-connection',
  '07-01-07-P02->07-01-07-P03': 'cable-core-connection-to-insulation-heat-shrink',
  '07-01-07-P03->07-01-07-P04': 'cable-insulation-heat-shrink-to-shield-ground',
  '07-01-07-P04->07-01-07-P05': 'cable-shield-ground-to-phase-loop-label',
  '07-01-07-P05->07-01-07-P06': 'cable-phase-loop-label-to-insulation-withstand-test',
  '07-01-08-P03->07-01-08-P04': 'fixture-install-fixed-to-wiring-ground',
  '07-01-09-P04->07-01-09-P05': 'fixture-wiring-ground-to-power-run',
  '07-01-11-P06->07-01-11-P07': 'grounding-resistance-test-to-concealed-acceptance',
  '07-01-09-P02->07-01-09-P03': 'fixture-arrival-to-install-fixed',
  '07-01-08-P06->07-01-08-P07': 'fixture-illuminance-check-to-label-protection',
  '07-01-09-P06->07-01-09-P07': 'fixture-illuminance-check-to-label-protection',
  '07-01-11-P02->07-01-11-P03': 'grounding-body-mainline-to-weld-corrosion',
  '07-02-07-P02->07-02-07-P03': 'grounding-body-mainline-to-weld-corrosion',
  '07-01-11-P03->07-01-11-P04': 'grounding-weld-corrosion-to-equipotential',
  '07-02-07-P03->07-02-07-P04': 'grounding-weld-corrosion-to-equipotential',
  '07-01-11-P04->07-01-11-P05': 'grounding-equipotential-to-test-point-label',
  '07-02-07-P04->07-02-07-P05': 'grounding-equipotential-to-test-point-label',
  '10-02-03-P07->10-02-03-P08': 'domain-pressure-test-to-acceptance',
  '07-02-04-P02->07-02-04-P03': 'electrical-support-to-body-install',
  '07-03-03-P02->07-03-03-P03': 'electrical-support-to-body-install',
  '07-03-06-P02->07-03-06-P03': 'electrical-support-to-body-install',
  '08-01-01-P02->08-01-01-P03': 'server-workstation-install-to-gateway-software-deploy',
  '08-01-02-P03->08-01-02-P04': 'gateway-software-deploy-to-subsystem-data-mapping',
  '08-01-03-P04->08-01-03-P05': 'subsystem-data-mapping-to-integration-scene-config',
  '08-01-04-P05->08-01-04-P06': 'integration-scene-config-to-ibms-alarm-test',
  '08-01-01-P06->08-01-01-P07': 'ibms-alarm-test-to-integrated-commissioning',
  '08-01-02-P07->08-01-02-P08': 'integrated-commissioning-to-issue-close-handover',
  '08-05-01-P02->08-05-01-P03': 'ladder-tray-install-to-copper-fiber-routing',
  '08-05-04-P02->08-05-04-P03': 'ladder-tray-install-to-copper-fiber-routing',
  '08-05-02-P03->08-05-02-P04': 'copper-fiber-reserve-to-patch-panel-outlet-termination',
  '08-05-06-P03->08-05-06-P04': 'copper-fiber-reserve-to-patch-panel-outlet-termination',
  '08-08-03-P01->08-08-03-P02': 'equipment-arrival-unboxing-to-fixed-grounding',
  '08-08-03-P02->08-08-03-P03': 'equipment-fixed-grounding-to-cable-connection-termination',
  '08-08-03-P05->08-08-03-P06': 'software-deploy-config-to-single-power-function-test',
  '08-08-04-P02->08-08-04-P03': 'single-point-machine-test-to-subsystem-linkage-test',
  '08-14-01-P05->08-14-01-P06': 'ddc-plc-download-to-point-logic-test',
  '08-14-01-P06->08-14-01-P07': 'point-logic-test-to-ibms-interface-test',
  '08-14-01-P07->08-14-01-P08': 'ibms-interface-test-to-linkage-scene-debug',
  '08-14-02-P05->08-14-02-P06': 'ddc-plc-download-to-point-logic-test',
  '08-14-02-P06->08-14-02-P07': 'point-logic-test-to-ibms-interface-test',
  '08-14-02-P07->08-14-02-P08': 'ibms-interface-test-to-linkage-scene-debug',
  '08-16-01-P06->08-16-01-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-01-P07->08-16-01-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-16-02-P06->08-16-02-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-02-P07->08-16-02-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-16-03-P06->08-16-03-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-03-P07->08-16-03-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-16-04-P06->08-16-04-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-04-P07->08-16-04-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-16-05-P06->08-16-05-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-05-P07->08-16-05-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-16-06-P06->08-16-06-P07': 'storage-capacity-image-quality-review-to-multi-system-linkage-test',
  '08-16-06-P07->08-16-06-P08': 'multi-system-linkage-test-to-trial-run-acceptance',
  '08-17-01-P07->08-17-01-P08': 'domain-training-to-handover',
  '08-17-02-P07->08-17-02-P08': 'domain-training-to-handover',
  '08-17-03-P07->08-17-03-P08': 'domain-training-to-handover',
  '08-17-04-P07->08-17-04-P08': 'domain-training-to-handover',
  '06-08-06-P04-S04->06-08-06-P04-S05': 'r16-rectification-closeout-to-special-acceptance-handover',
  '06-08-06-P05-S04->06-08-06-P05-S05': 'r16-rectification-closeout-to-special-acceptance-handover',
  '01-01-01-P04->01-01-01-P05': 'soil-lime-foundation-work-to-compaction-thickness-test',
  '01-01-02-P04->01-01-02-P05': 'sand-gravel-foundation-work-to-compaction-thickness-test',
  '01-01-03-P04->01-01-03-P05': 'geosynthetic-foundation-work-to-compaction-thickness-test',
  '03-06-01-P04->03-06-01-P05': 'partition-board-install-to-mep-fill',
  '03-06-02-P04->03-06-02-P05': 'partition-board-install-to-mep-fill',
  '03-06-03-P04->03-06-03-P05': 'partition-board-install-to-mep-fill',
  '01-01-08-P01->01-01-08-P02': 'ground-improve-pile-position-to-equipment',
  '01-01-08-P03->01-01-08-P04': 'ground-improve-mix-review-to-test-pile',
  '01-01-08-P04->01-01-08-P05': 'ground-improve-test-pile-to-layer-pile',
  '01-01-08-P05->01-01-08-P06': 'ground-improve-layer-pile-to-compaction-control',
  '01-01-08-P06->01-01-08-P07': 'ground-improve-compaction-to-pile-top-finish',
  '01-01-08-P07->01-01-08-P08': 'ground-improve-pile-top-to-quality-detection',
  '01-05-01-P01->01-05-01-P02': 'support-plan-briefing-to-survey-settingout',
  '01-05-01-P02->01-05-01-P03': 'earthwork-settingout-to-excavation-support',
  '01-05-01-P04->01-05-01-P05': 'layered-excavation-to-base-trimming',
  '01-05-01-P05->01-05-01-P06': 'base-trimming-to-base-clean',
  '01-05-02-P03->01-05-02-P04': 'base-clean-to-layered-paving',
  '01-05-02-P04->01-05-02-P05': 'layered-paving-to-layered-tamping',
  '01-05-02-P05->01-05-02-P06': 'layered-tamping-to-compaction-test',
  '01-05-02-P06->01-05-02-P07': 'compaction-test-to-finished-elevation-review',
  '01-07-03-P02->01-07-03-P03': 'r11-caisson-diaphragm-joint-waterproof-to-shield-pipe-jacking-waterstop',
  '01-02-01-P01->01-02-01-P02': 'foundation-base-acceptance-to-cushion',
  '01-02-01-P04->01-02-01-P05': 'foundation-formwork-to-concrete-pour',
  '01-02-01-P05->01-02-01-P06': 'winter-concrete-cure-lag-extended',
  '01-02-01-P03-S02->01-02-01-P03-S03': 'r16-install-work-to-deviation-hidden-check',
  '01-02-01-P03-S03->01-02-01-P03-S04': 'r16-deviation-hidden-check-to-acceptance-rectification-record',
  '01-02-01-P03-S01->01-02-01-P03-S02': 'r16-material-machine-workface-review-to-install-work',
  '01-02-01-P04-S01->01-02-01-P04-S02': 'r16-material-machine-workface-review-to-install-work',
  '01-02-01-P04-S02->01-02-01-P04-S03': 'r16-install-work-to-deviation-hidden-check',
  '01-02-01-P04-S03->01-02-01-P04-S04': 'r16-deviation-hidden-check-to-acceptance-rectification-record',
  '01-02-01-P02->01-02-01-P03': 'foundation-cushion-to-rebar-installation',
  '01-02-02-P02->01-02-02-P03': 'foundation-cushion-to-rebar-installation',
  '01-02-01-P06->01-02-01-P07': 'foundation-curing-to-quality-acceptance',
  '01-02-01-P01-S01->01-02-01-P01-S02': 'acceptance-condition-confirm-to-test-execution',
  '01-05-01-P03->01-05-01-P04': 'earthwork-support-to-excavation',
  '01-05-01-P06->01-05-01-P07': 'earthwork-cleanup-to-trench-acceptance',
  '02-01-01-P03->02-01-01-P04': 'support-erection-reinforcement-to-formwork-install',
  '02-01-06-P02->02-01-06-P03': 'hoisting-briefing-to-hoisting-preparation',
  '02-01-06-P03->02-01-06-P04': 'hoisting-preparation-to-hoisting-position',
  '02-01-06-P05->02-01-06-P06': 'temporary-support-correction-to-sleeve-grouting',
  '02-01-06-P06->02-01-06-P07': 'sleeve-grouting-to-composite-layer-node',
  '02-01-06-P07->02-01-06-P08': 'composite-slab-node-work-to-water-fire-protection',
  '02-01-06-P08->02-01-06-P09': 'node-waterproof-fireproof-to-connection-node-test-acceptance',
  '02-03-01-P07->02-03-01-P08': 'ndt-report-review-to-weld-acceptance-close',
  '02-03-02-P03->02-03-02-P04': 'fastener-install-to-initial-final-tightening',
  '02-03-03-P02->02-03-03-P03': 'settingout-to-hoisting-preparation',
  '02-03-03-P03->02-03-03-P04': 'hoisting-preparation-to-installation-work',
  '02-03-03-P04->02-03-03-P05': 'steel-component-assembly-preassembly-to-temporary-fix',
  '02-03-03-P05->02-03-03-P06': 'temporary-fix-to-connection',
  '02-03-03-P06->02-03-03-P07': 'connection-to-connection-acceptance',
  '02-03-02-P04->02-03-02-P05': 'fastener-tightening-to-torque-check',
  '02-04-01-P02->02-04-01-P03': 'steel-jig-site-review-to-steel-tube-assembly',
  '02-04-01-P03->02-04-01-P04': 'steel-pipe-site-assembly-to-welding-bolting',
  '02-04-01-P05->02-04-01-P06': 'temporary-fix-measure-correction-to-node-concealed-acceptance',
  '02-04-01-P06->02-04-01-P07': 'node-concealed-acceptance-to-assembly-quality-test',
  '02-04-02-P04->02-04-02-P05': 'temporary-fix-verticality-to-node-connection',
  '02-04-02-P05->02-04-02-P06': 'node-connection-to-installation-deviation-measurement',
  '02-04-02-P06->02-04-02-P07': 'installation-deviation-review-to-component-acceptance',
  '02-04-04-P01->02-04-04-P02': 'connection-node-detail-review-to-connector-fastener-retest-guidance',
  '02-04-04-P02->02-04-04-P03': 'connector-fastener-retest-to-node-position-temporary-fix',
  '02-04-04-P03->02-04-04-P04': 'node-position-temporary-fix-to-bolt-weld-connection',
  '02-04-04-P04->02-04-04-P05': 'bolt-weld-connection-to-connection-quality-test',
  '02-04-04-P05->02-04-04-P06': 'connection-quality-test-to-node-anticorrosion-touchup',
  '02-04-04-P06->02-04-04-P07': 'node-anticorrosion-touchup-to-connection-node-acceptance',
  '02-05-05-P06->02-05-05-P07': 'installation-deviation-review-to-section-steel-acceptance',
  '03-01-04-P02->03-01-04-P03': 'floor-level-line-to-leveling-layer',
  '03-01-04-P04->03-01-04-P05': 'wood-bamboo-floor-install-to-curing-protection',
  '03-01-04-P05->03-01-04-P06': 'floor-curing-protection-to-flatness-acceptance',
  '03-02-02-P03->03-02-02-P04': 'layout-setting-out-to-thin-plaster-insulation',
  '03-02-02-P04->03-02-02-P05': 'thin-plaster-insulation-to-node-close',
  '03-02-02-P05->03-02-02-P06': 'node-closeout-to-energy-acceptance',
  '03-05-01-P03->03-05-01-P04': 'suspended-ceiling-hanger-install-to-main-keel-level',
  '03-05-01-P04->03-05-01-P05': 'main-keel-level-to-secondary-keel-install',
  '03-05-01-P05->03-05-01-P06': 'suspended-ceiling-secondary-keel-to-mep-terminal-review',
  '03-05-01-P06->03-05-01-P07': 'suspended-ceiling-terminal-review-to-concealed-acceptance',
  '03-05-01-P07->03-05-01-P08': 'concealed-acceptance-to-finish-panel-install',
  '03-05-01-P08->03-05-01-P09': 'finish-panel-install-to-joint-appearance-review',
  '03-05-02-P03->03-05-02-P04': 'suspended-ceiling-hanger-install-to-main-keel-level',
  '03-05-02-P04->03-05-02-P05': 'main-keel-level-to-secondary-keel-install',
  '03-05-02-P05->03-05-02-P06': 'suspended-ceiling-secondary-keel-to-mep-terminal-review',
  '03-05-02-P06->03-05-02-P07': 'suspended-ceiling-terminal-review-to-concealed-acceptance',
  '03-05-02-P07->03-05-02-P08': 'concealed-acceptance-to-finish-panel-install',
  '03-05-02-P08->03-05-02-P09': 'finish-panel-install-to-joint-appearance-review',
  '03-05-03-P03->03-05-03-P04': 'suspended-ceiling-hanger-install-to-main-keel-level',
  '03-05-03-P04->03-05-03-P05': 'main-keel-level-to-secondary-keel-install',
  '03-05-03-P05->03-05-03-P06': 'suspended-ceiling-secondary-keel-to-mep-terminal-review',
  '03-05-03-P06->03-05-03-P07': 'suspended-ceiling-terminal-review-to-concealed-acceptance',
  '03-05-03-P07->03-05-03-P08': 'concealed-acceptance-to-finish-panel-install',
  '03-05-03-P08->03-05-03-P09': 'finish-panel-install-to-joint-appearance-review',
  '03-06-01-P05->03-06-01-P06': 'partition-mep-fill-to-fire-acoustic-node',
  '03-06-01-P06->03-06-01-P07': 'partition-fire-acoustic-to-crack-treatment',
  '03-06-01-P07->03-06-01-P08': 'partition-crack-treatment-to-flatness-measure',
  '03-06-01-P08->03-06-01-P09': 'partition-flatness-measure-to-appearance-handover',
  '03-06-02-P05->03-06-02-P06': 'partition-mep-fill-to-fire-acoustic-node',
  '03-06-02-P06->03-06-02-P07': 'partition-fire-acoustic-to-crack-treatment',
  '03-06-02-P07->03-06-02-P08': 'partition-crack-treatment-to-flatness-measure',
  '03-06-02-P08->03-06-02-P09': 'partition-flatness-measure-to-appearance-handover',
  '03-06-03-P05->03-06-03-P06': 'partition-mep-fill-to-fire-acoustic-node',
  '03-06-03-P06->03-06-03-P07': 'partition-fire-acoustic-to-crack-treatment',
  '03-06-03-P07->03-06-03-P08': 'partition-crack-treatment-to-flatness-measure',
  '03-06-03-P08->03-06-03-P09': 'partition-flatness-measure-to-appearance-handover',
  '03-07-01-P04->03-07-01-P05': 'stone-connector-or-bond-layer-to-stone-board-fix',
  '03-07-01-P05->03-07-01-P06': 'stone-board-fixed-to-joint-plumb-flatness-recheck',
  '03-07-02-P04->03-07-02-P05': 'ceramic-board-connector-or-bond-layer-to-board-fix',
  '03-07-02-P05->03-07-02-P06': 'ceramic-board-fixed-to-joint-plumb-flatness-recheck',
}

const DOMAIN_WBS_STABLE_BACKFILL_PREFERRED_PAIRS = new Set([
  'CLN-04-01-03-P06->CLN-04-01-03-P09',
  'UHR-02-01-02-P07-S01->UHR-02-01-02-P07-S02',
  'UHR-02-01-02-P07-S02->UHR-02-01-02-P07-S03',
  'UHR-04-01-05-P07-S01->UHR-04-01-05-P07-S02',
  'UHR-04-01-05-P07-S02->UHR-04-01-05-P07-S03',
])

const INTERNAL_FLOW_RULE_BY_ID = new Map(
  STANDARD_INTERNAL_FLOW_CURATED_RULES.map((rule) => [rule.id, rule]),
)

const INTERNAL_FLOW_P2_EVIDENCE_BACKFILL_DENYLIST = new Set([
  'stable-code-DTC-01-01-01-P07-to-DTC-01-01-01-P08',
])

const INTERNAL_FLOW_SEMANTIC_PROMOTION_MIN_SCORE = 0.55

function inferActivityStepPurpose(stepName: string) {
  return includesAny(stepName, ['交底', '准备', '条件'])
    ? 'preparation'
    : includesAny(stepName, ['检查', '测试', '记录', '验收', '复核'])
      ? 'quality_control'
      : 'execution'
}

function resolveActivityStepDurationContributionMode(
  stepName: string,
  activityStepPurpose: string,
): DurationContributionMode {
  if (includesAny(stepName, ['安装固定与接地跨接复核', '安装固定和接地跨接复核'])) {
    return 'duration_bearing'
  }
  if (includesAny(stepName, ['整改闭合', '问题闭合', '销项闭合', '保护移交', '移交签认', '交接签认'])) {
    return 'handover_marker'
  }
  if (
    includesAny(stepName, ['检测', '检验', '检查', '试验', '测试', '验收', '复核', '复测', '自检'])
    && !includesAny(stepName, ['施工', '安装', '浇筑', '铺贴', '铺设', '焊接', '吊装', '砌筑', '抹灰', '涂刷', '喷涂'])
  ) {
    return 'quality_gate'
  }
  if (includesAny(stepName, ['检测报告', '试验报告', '资料核验', '资料归档', '记录归档', '参数记录', '台账闭合', '签认归档'])) {
    return 'record_only'
  }
  if (activityStepPurpose === 'preparation') return 'embedded_check'
  return inferDurationContributionMode({ name: stepName })
}

function buildCareOrProtectionSteps(processName: string) {
  return [`${processName}措施设置和覆盖`, `${processName}记录`]
}

function normalizeInternalFlowNodeName(name: string) {
  const normalized = name
    .replace(/（.*）$/g, '')
    .replace(/\((?:§[^)]*|PE)\)$/g, '')
    .trim()
  if (normalized === '土钉孔定位和钻孔成孔') return '土钉钻孔成孔'
  if (normalized === '面层混凝土喷射施工') return '喷射混凝土面层'
  return normalized
}

function internalFlowSemanticGrams(value: string) {
  const parts = normalizeInternalFlowNodeName(value)
    .toLowerCase()
    .match(/[\p{Script=Han}A-Za-z0-9]+/gu) ?? []
  const grams: string[] = []
  for (const part of parts) {
    const chars = Array.from(part)
    if (/^[a-z0-9]+$/i.test(part) || chars.length <= 2) {
      grams.push(part)
      continue
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      grams.push(`${chars[index]}${chars[index + 1]}`)
    }
  }
  return Array.from(new Set(grams.filter((gram) => gram.trim().length > 0)))
}

function internalFlowNameSemanticScore(ruleName: string, actualName: string) {
  const normalizedRuleName = normalizeInternalFlowNodeName(ruleName).toLowerCase()
  const normalizedActualName = normalizeInternalFlowNodeName(actualName).toLowerCase()
  if (!normalizedRuleName || !normalizedActualName) return 0
  if (normalizedActualName.includes(normalizedRuleName) || normalizedRuleName.includes(normalizedActualName)) return 1

  const grams = internalFlowSemanticGrams(normalizedRuleName)
  if (grams.length === 0) return 0
  const hitCount = grams.filter((gram) => normalizedActualName.includes(gram)).length
  return hitCount / grams.length
}

function internalFlowPairSemanticScore(
  rule: CuratedStandardInternalFlowRule,
  predecessorName: string,
  successorName: string,
) {
  if (rule.matchMode === 'stable_code') return 0
  const predecessorScore = internalFlowNameSemanticScore(rule.predecessorName, predecessorName)
  const successorScore = internalFlowNameSemanticScore(rule.successorName, successorName)
  if (predecessorScore <= 0 || successorScore <= 0) return 0
  return predecessorScore * 0.55 + successorScore * 0.45
}

function isStableCodeBackfillRule(rule: CuratedStandardInternalFlowRule) {
  return rule.matchMode === 'stable_code' && rule.generalizationHint?.status === 'stable_code_backfill'
}

type InternalFlowDirectRuleIndex = {
  stablePairToRules: Map<string, CuratedStandardInternalFlowRule[]>
  exactNamePairToRules: Map<string, CuratedStandardInternalFlowRule[]>
  suffixRules: CuratedStandardInternalFlowRule[]
  ruleOrder: Map<CuratedStandardInternalFlowRule, number>
}

let internalFlowDirectRuleIndex: InternalFlowDirectRuleIndex | null = null

function appendInternalFlowDirectRule(
  index: Map<string, CuratedStandardInternalFlowRule[]>,
  key: string,
  rule: CuratedStandardInternalFlowRule,
) {
  const rules = index.get(key) ?? []
  rules.push(rule)
  index.set(key, rules)
}

function getInternalFlowDirectRuleIndex(): InternalFlowDirectRuleIndex {
  if (internalFlowDirectRuleIndex) return internalFlowDirectRuleIndex
  const stablePairToRules = new Map<string, CuratedStandardInternalFlowRule[]>()
  const exactNamePairToRules = new Map<string, CuratedStandardInternalFlowRule[]>()
  const suffixRules: CuratedStandardInternalFlowRule[] = []
  const ruleOrder = new Map<CuratedStandardInternalFlowRule, number>()

  for (const [index, rule] of STANDARD_INTERNAL_FLOW_CURATED_RULES.entries()) {
    ruleOrder.set(rule, index)
    if (rule.matchMode === 'stable_code') {
      appendInternalFlowDirectRule(
        stablePairToRules,
        `${rule.predecessorStableCode ?? ''}->${rule.successorStableCode ?? ''}`,
        rule,
      )
      continue
    }
    if (rule.matchMode === 'suffix') {
      suffixRules.push(rule)
      continue
    }
    appendInternalFlowDirectRule(
      exactNamePairToRules,
      `${rule.predecessorName}\u0000${rule.successorName}`,
      rule,
    )
  }

  internalFlowDirectRuleIndex = {
    stablePairToRules,
    exactNamePairToRules,
    suffixRules,
    ruleOrder,
  }
  return internalFlowDirectRuleIndex
}

type InternalFlowSemanticRuleIndex = {
  rules: CuratedStandardInternalFlowRule[]
  predecessorGramToRuleIndexes: Map<string, number[]>
  successorGramToRuleIndexes: Map<string, number[]>
}

let internalFlowSemanticRuleIndex: InternalFlowSemanticRuleIndex | null = null

function getInternalFlowSemanticRuleIndex(): InternalFlowSemanticRuleIndex {
  if (internalFlowSemanticRuleIndex) return internalFlowSemanticRuleIndex
  const rules = STANDARD_INTERNAL_FLOW_CURATED_RULES.filter((rule) => rule.matchMode !== 'stable_code')
  const predecessorGramToRuleIndexes = new Map<string, number[]>()
  const successorGramToRuleIndexes = new Map<string, number[]>()
  rules.forEach((rule, index) => {
    for (const gram of internalFlowSemanticGrams(rule.predecessorName)) {
      const indexes = predecessorGramToRuleIndexes.get(gram) ?? []
      indexes.push(index)
      predecessorGramToRuleIndexes.set(gram, indexes)
    }
    for (const gram of internalFlowSemanticGrams(rule.successorName)) {
      const indexes = successorGramToRuleIndexes.get(gram) ?? []
      indexes.push(index)
      successorGramToRuleIndexes.set(gram, indexes)
    }
  })
  internalFlowSemanticRuleIndex = {
    rules,
    predecessorGramToRuleIndexes,
    successorGramToRuleIndexes,
  }
  return internalFlowSemanticRuleIndex
}

function findInternalFlowSemanticCandidateRules(predecessorName: string, successorName: string) {
  const index = getInternalFlowSemanticRuleIndex()
  const predecessorRuleIndexes = new Set<number>()
  for (const gram of internalFlowSemanticGrams(predecessorName)) {
    for (const ruleIndex of index.predecessorGramToRuleIndexes.get(gram) ?? []) {
      predecessorRuleIndexes.add(ruleIndex)
    }
  }
  const successorRuleIndexes = new Set<number>()
  for (const gram of internalFlowSemanticGrams(successorName)) {
    for (const ruleIndex of index.successorGramToRuleIndexes.get(gram) ?? []) {
      successorRuleIndexes.add(ruleIndex)
    }
  }
  return Array.from(predecessorRuleIndexes)
    .filter((ruleIndex) => successorRuleIndexes.has(ruleIndex))
    .map((ruleIndex) => index.rules[ruleIndex])
}

function internalFlowRuleSpecificityScore(rule: CuratedStandardInternalFlowRule) {
  const usesPlaceholderProcessNames = /standard process P\d+/i.test(rule.predecessorName) || /standard process P\d+/i.test(rule.successorName)
  const isStableCodeBackfill = isStableCodeBackfillRule(rule)
  const isSemanticRule = rule.generalizationHint?.status === 'semantic_rule'
  const matchModeScore = rule.matchMode === 'stable_code'
    ? isStableCodeBackfill ? 75_000 : 300_000
    : rule.matchMode === 'exact'
      ? 250_000
      : isSemanticRule ? 200_000 : 100_000
  const placeholderPenalty = usesPlaceholderProcessNames ? -250_000 : 0
  const nameScore = (rule.predecessorName.length + rule.successorName.length) * 100
  const conditionScore = (rule.applicableWhen?.length ?? 0) * 20
  const categoryScore = (rule.applicableCategoryTypes?.length ?? 0) > 0 ? 10 : 0
  return matchModeScore + placeholderPenalty + nameScore + conditionScore + categoryScore
}

function findCuratedInternalFlowRule(input: {
  predecessorStableCode: string
  predecessorName: string
  successorStableCode: string
  successorName: string
  successorCategoryType: ChinaTemplateCategoryType
  catalogSource?: 'china_gb50300_template_catalog' | 'domain_wbs_template_catalog'
}) {
  const predecessorName = normalizeInternalFlowNodeName(input.predecessorName)
  const successorName = normalizeInternalFlowNodeName(input.successorName)
  const stablePairKey = `${input.predecessorStableCode}->${input.successorStableCode}`
  const stablePairOverrideRuleId = INTERNAL_FLOW_STABLE_PAIR_RULE_ID_OVERRIDES[stablePairKey]
  const stablePairOverrideRule = stablePairOverrideRuleId
    ? INTERNAL_FLOW_RULE_BY_ID.get(stablePairOverrideRuleId)
    : null
  if (
    stablePairOverrideRule
    && (!stablePairOverrideRule.applicableCategoryTypes?.length || stablePairOverrideRule.applicableCategoryTypes.includes(input.successorCategoryType))
  ) {
    return stablePairOverrideRule
  }

  const directRuleIndex = getInternalFlowDirectRuleIndex()
  const directCandidates = [
    ...(directRuleIndex.stablePairToRules.get(stablePairKey) ?? []),
    ...(directRuleIndex.exactNamePairToRules.get(`${predecessorName}\u0000${successorName}`) ?? []),
    ...directRuleIndex.suffixRules,
  ].sort((left, right) => (
    (directRuleIndex.ruleOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (directRuleIndex.ruleOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
  ))
  const directMatches = directCandidates.filter((rule) => {
    if (rule.applicableCategoryTypes?.length && !rule.applicableCategoryTypes.includes(input.successorCategoryType)) return false
    if (rule.matchMode === 'stable_code') {
      return rule.predecessorStableCode === input.predecessorStableCode
        && rule.successorStableCode === input.successorStableCode
    }
    if (rule.matchMode === 'suffix') {
      return predecessorName.endsWith(rule.predecessorName) && successorName.endsWith(rule.successorName)
    }
    return rule.predecessorName === predecessorName && rule.successorName === successorName
  })
  const sortedDirectMatches = directMatches.sort((left, right) => internalFlowRuleSpecificityScore(right) - internalFlowRuleSpecificityScore(left))
  if (
    input.catalogSource === 'domain_wbs_template_catalog'
    && DOMAIN_WBS_STABLE_BACKFILL_PREFERRED_PAIRS.has(stablePairKey)
  ) {
    const domainStableBackfillRule = sortedDirectMatches.find(isStableCodeBackfillRule)
    if (domainStableBackfillRule) return domainStableBackfillRule
  }
  const directManualRule = sortedDirectMatches.find((rule) => !isStableCodeBackfillRule(rule))
  if (directManualRule) return directManualRule
  if (input.catalogSource === 'domain_wbs_template_catalog') return sortedDirectMatches[0] ?? null

  const semanticMatches = findInternalFlowSemanticCandidateRules(predecessorName, successorName).filter((rule) => {
    if (rule.applicableCategoryTypes?.length && !rule.applicableCategoryTypes.includes(input.successorCategoryType)) return false
    if (directMatches.includes(rule)) return false
    if (rule.governancePriority === 'P2') return false
    return internalFlowPairSemanticScore(rule, predecessorName, successorName) >= INTERNAL_FLOW_SEMANTIC_PROMOTION_MIN_SCORE
  })
  return [...sortedDirectMatches, ...semanticMatches]
    .sort((left, right) => {
      const specificityDiff = internalFlowRuleSpecificityScore(right) - internalFlowRuleSpecificityScore(left)
      if (specificityDiff !== 0) return specificityDiff
      return internalFlowPairSemanticScore(right, predecessorName, successorName)
        - internalFlowPairSemanticScore(left, predecessorName, successorName)
    })[0] ?? null
}

export function resolveStandardInternalFlowRule(input: {
  predecessorStableCode: string
  predecessorName: string
  successorStableCode: string
  successorName: string
  successorCategoryType: ChinaTemplateCategoryType
  successorPurpose?: string
  catalogSource?: 'china_gb50300_template_catalog' | 'domain_wbs_template_catalog'
  templateId?: string
}): StandardInternalFlowRule {
  const curatedRule = findCuratedInternalFlowRule(input)
  const shape = curatedRule ?? {
    id: 'fallback-review-required',
    relationKind: 'soft_sequence' as StandardInternalFlowRelationKind,
    createsDependency: false,
    dependencyType: 'SS' as StandardInternalFlowRule['dependencyType'],
    lagDays: 0,
    relationRole: 'workflow' as StandardInternalFlowRule['relationRole'],
    strength: 'candidate' as StandardInternalFlowRule['strength'],
    reasonCode: 'INTERNAL_FLOW_RULE_NOT_CURATED_REVIEW_REQUIRED',
    curationBasis: '该同父级内部流尚未进入人工维护规则表；默认只保留推荐顺序，不生成硬依赖。',
    scheduleMode: 'sequential' as StandardInternalFlowRule['scheduleMode'],
    requiresAllPreviousSiblings: false,
    evidenceCodes: [] as string[],
    evidenceRefs: [] as StandardInternalFlowEvidenceRef[],
    governancePriority: 'P2' as StandardInternalFlowRule['governancePriority'],
    applicableWhen: [] as StandardInternalFlowCondition[],
    conditionalEffects: [] as StandardInternalFlowConditionalEffect[],
    generalizationHint: null as StandardInternalFlowGeneralizationHint | null,
    additionalPredecessorStableCodes: [] as string[],
  }
  const curationMethod: StandardInternalFlowCurationMethod = curatedRule
    ? curatedRule.matchMode === 'stable_code'
      ? curatedRule.generalizationHint?.status === 'stable_code_backfill'
        ? 'stable_code_backfill'
        : 'manual_registry'
      : 'manual_registry'
    : 'soft_fallback'
  const governancePriority = shape.governancePriority ?? (curatedRule ? 'P1' : 'P2')
  const shouldBackfillEvidenceRefs = Boolean(curatedRule && governancePriority !== 'P2')
  const preserveP2NoEvidenceCandidate = Boolean(
    curatedRule
      && governancePriority === 'P2'
      && INTERNAL_FLOW_P2_EVIDENCE_BACKFILL_DENYLIST.has(shape.id),
  )
  const evidenceCodes = shape.evidenceCodes?.length
    ? shape.evidenceCodes
    : shouldBackfillEvidenceRefs
      ? inferInternalFlowDefaultEvidenceCodes(input.predecessorStableCode, input.successorStableCode)
      : []
  const hasDeclaredEvidenceCodes = Boolean(shape.evidenceCodes?.length && !preserveP2NoEvidenceCandidate)
  const evidenceRefs = shape.evidenceRefs?.length
    ? shape.evidenceRefs
    : (hasDeclaredEvidenceCodes || shouldBackfillEvidenceRefs) && evidenceCodes.length > 0
      ? buildInternalFlowDefaultEvidenceRefs(evidenceCodes, shape.curationBasis)
      : []

  return {
    source: input.catalogSource ?? 'china_gb50300_template_catalog',
    sourceVersion: 'v1.4.7.2',
    seedRuleId: curatedRule
      ? `internal-flow:${curatedRule.id}:${input.predecessorStableCode}:${input.successorStableCode}`
      : `internal-flow:fallback-review-required:${input.predecessorStableCode}:${input.successorStableCode}`,
    ruleVersion: curatedRule ? 2 : 1,
    scope: 'same_parent',
    relationKind: shape.relationKind,
    createsDependency: shape.createsDependency,
    dependencyType: shape.dependencyType,
    lagDays: shape.lagDays,
    relationRole: shape.relationRole,
    strength: shape.strength,
    reasonCode: shape.reasonCode,
    curationStatus: curatedRule ? 'curated' : 'review_required',
    curationMethod,
    curationBasis: shape.curationBasis,
    reviewNeeded: !curatedRule,
    scheduleMode: shape.scheduleMode ?? 'sequential',
    requiresAllPreviousSiblings: shape.requiresAllPreviousSiblings ?? shape.relationKind === 'acceptance_gate',
    evidenceCodes,
    evidenceRefs,
    governancePriority,
    applicableWhen: shape.applicableWhen ?? [],
    conditionalEffects: shape.conditionalEffects ?? [],
    generalizationHint: shape.generalizationHint ?? null,
    additionalPredecessorStableCodes: shape.additionalPredecessorStableCodes ?? [],
    predecessorStableCode: input.predecessorStableCode,
    predecessorName: input.predecessorName,
    successorStableCode: input.successorStableCode,
    successorName: input.successorName,
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

const STANDARD_ACTIVITY_STEP_MINIMUM_FIVE_ITEM_CODES = new Set([
  '01-02-07',
  '01-02-09',
  '01-02-10',
  '01-02-11',
  '01-02-12',
  '01-02-13',
  '01-03-01',
  '01-03-02',
  '01-03-03',
  '01-03-05',
  '01-03-09',
  '02-01-01',
  '02-01-03',
  '02-01-05',
  '02-01-06',
  '02-02-01',
  '02-02-02',
  '05-01-01',
  '05-02-01',
  '05-11-02',
  '05-13-04',
  '05-13-06',
  '06-04-06',
  '06-06-07',
  '06-06-08',
  '06-18-07',
  '07-02-01',
  '07-02-02',
  '07-04-03',
  '08-01-03',
  '08-05-05',
  '08-10-03',
  '08-11-03',
  '08-11-04',
  '08-12-03',
  '08-14-01',
  '08-14-03',
  '08-14-05',
  '08-18-01',
  '08-18-04',
  '08-18-08',
  '08-18-09',
  '08-19-04',
  '08-19-05',
  '10-01-01',
  '10-01-02',
  '10-01-03',
  '10-01-04',
  '10-01-05',
  '10-01-06',
  '10-01-07',
  '10-01-08',
  '10-01-09',
  '10-01-10',
  '10-01-11',
  '10-01-12',
  '10-01-13',
  '10-02-01',
  '10-02-02',
  '10-02-03',
  '10-02-04',
  '10-02-05',
  '10-02-06',
  '10-02-07',
  '10-02-08',
  '10-02-09',
  '10-02-10',
  '10-02-11',
  '10-02-12',
  '10-03-01',
  '10-03-02',
  '10-03-03',
])

function standardActivityStepMinimumFor(code: string) {
  const itemCode = code.replace(/-P\d+$/, '')
  if (/^\d{2}-/.test(itemCode)) return 5
  return STANDARD_ACTIVITY_STEP_MINIMUM_FIVE_ITEM_CODES.has(itemCode) ? 5 : 4
}

function completeStandardActivitySteps(processName: string, steps: string[], targetStepCount: number) {
  if (steps.length >= targetStepCount) return steps
  return unique([
    ...steps,
    `${processName}现场复测和偏差记录`,
    `${processName}问题整改闭合`,
    `${processName}验收移交签认`,
  ]).slice(0, targetStepCount)
}

function standardRefs(codes: string[]) {
  return unique(codes)
    .map((code) => STANDARD_EVIDENCE[code])
    .filter(Boolean)
}

function standardEvidenceRefs(codes: string[]) {
  return standardRefs(codes).map((standard) => ({
    code: standard.standardCode,
    level: 'standard',
    ref: standard.evidenceUrl,
    rationale: `${standard.standardName} supports the catalog node evidence chain.`,
  }))
}

function buildInternalFlowDefaultEvidenceRefs(codes: string[], curationBasis?: string): StandardInternalFlowEvidenceRef[] {
  return unique(codes).map((code) => {
    const standard = STANDARD_EVIDENCE[code]
    return {
      code,
      level: 'process',
      ref: standard?.evidenceUrl,
      rationale: curationBasis || `${code} supports this curated internal-flow sequence.`,
    }
  })
}

function inferInternalFlowDefaultEvidenceCodes(predecessorStableCode: string, successorStableCode: string): string[] {
  const pairCode = `${predecessorStableCode} ${successorStableCode}`
  if (pairCode.includes('01-')) return ['GB50202', 'GB50300']
  if (pairCode.includes('05-')) return ['GB50242', 'GB50300']
  if (pairCode.includes('06-')) return ['GB50243', 'GB50300']
  if (pairCode.includes('07-')) return ['GB50303', 'GB50300']
  if (pairCode.includes('10-')) return ['GB50310', 'GB50300']
  return ['GB50300']
}

function inferQualityStandardKeys(context: string) {
  const keys = ['GB55032', 'GB50300']
  if (includesAny(context, ['01-', '地基', '基础', '基坑', '地下水', '土方', '边坡', '地下防水'])) keys.push('GB50202')
  if (includesAny(context, ['混凝土', '模板', '钢筋', '预应力', '现浇结构', '装配式结构', '钢管混凝土', '型钢混凝土'])) keys.push('GB50204')
  if (includesAny(context, ['砌体', '填充墙', '砖砌体', '石砌体'])) keys.push('GB50203')
  if (includesAny(context, ['钢结构', '钢构件', '钢管结构', '型钢', '紧固件', '焊接'])) keys.push('GB50205')
  if (includesAny(context, ['木结构', '木构件', '胶合木'])) keys.push('GB50206')
  if (includesAny(context, ['建筑装饰装修', '建筑地面', '抹灰', '门窗', '吊顶', '隔墙', '饰面', '幕墙', '涂饰', '裱糊', '软包', '细部'])) keys.push('GB50210')
  if (includesAny(context, ['屋面', '找坡层', '找平层', '隔汽层', '保温与隔热', '防水与密封', '瓦面', '板面'])) keys.push('GB50207')
  if (includesAny(context, ['给水', '排水', '供暖', '采暖', '热水', '卫生器具', '锅炉', '换热站', '管网', '喷泉', '游泳池'])) keys.push('GB50242')
  if (includesAny(context, ['通风', '空调', '防排烟', '风管', '冷凝水', '冷却水', '水源热泵', '多联机', '净化空调'])) keys.push('GB50243')
  if (includesAny(context, ['建筑电气', '电气', '配电', '电缆', '导线', '灯具', '开关', '插座', '接地', '防雷'])) keys.push('GB50303')
  if (includesAny(context, ['智能建筑', '智能化', '信息', '网络', '布线', '安全技术防范', '火灾自动报警', '机房', '会议系统'])) keys.push('GB50339')
  if (includesAny(context, ['建筑节能', '节能', '围护系统', '可再生能源', '太阳能'])) keys.push('GB50411')
  if (includesAny(context, ['电梯', '导轨', '轿厢', '对重', '安全部件', '自动扶梯', '自动人行道'])) keys.push('GB50310')
  return unique(keys)
}

function buildStandardMetadata(context: string) {
  const qualityStandardKeys = inferQualityStandardKeys(context)
  const qualityStandardCodes = standardRefs(qualityStandardKeys).map((standard) => standard.standardCode)
  return {
    domain: BUILDING_DOMAIN,
    verificationStatus: 'verified',
    evidenceLevel: 'A',
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    verificationMethod: 'web_standard_evidence_matrix',
    applicableScope: '房屋建筑工程；不含市政道路、桥梁、管廊、园林、水利、电力、工业安装专项域',
    evidenceSources: standardRefs([...qualityStandardKeys, 'GB50500']),
    evidenceRefs: standardEvidenceRefs([...qualityStandardKeys, 'GB50500']),
    qualityStandardCodes,
    quantityBasisCode: QUANTITY_BASIS_CODE,
    qualityModuleReady: true,
    quantityAndResourceModuleReady: true,
  }
}

function derivePreconditionTemplates(processName: string) {
  const templates = ['workface_available', 'safety_technical_disclosure_done']
  if (includesAny(processName, ['材料', '进场', '复验', '混凝土', '钢筋', '防水', '保温'])) templates.push('material_accepted')
  if (includesAny(processName, ['测量', '放线', '复核', '定位'])) templates.push('survey_control_ready')
  if (includesAny(processName, ['隐蔽', '浇筑', '封板', '吊顶', '防水'])) templates.push('previous_hidden_acceptance_done')
  if (includesAny(processName, ['调试', '试运行', '联调', '验收'])) templates.push('installation_completed')
  return unique(templates)
}

function deriveAcceptanceCheckpoints(processName: string) {
  const checkpoints = ['班组自检', '专业质检复核']
  if (includesAny(processName, ['隐蔽', '钢筋', '管线', '防水', '接地', '预留预埋'])) checkpoints.push('隐蔽验收')
  if (includesAny(processName, ['试验', '检测', '测试', '调试', '试运行', '压力', '绝缘'])) checkpoints.push('试验检测记录')
  if (includesAny(processName, ['验收', '移交'])) checkpoints.push('验收移交记录')
  return unique(checkpoints)
}

function deriveResourceProfile(processName: string) {
  const laborRoles = ['施工班组', '质检员']
  const materialCategories: string[] = []
  const equipmentCategories: string[] = []
  if (includesAny(processName, ['钢筋'])) materialCategories.push('钢筋')
  if (includesAny(processName, ['模板'])) materialCategories.push('模板及支撑体系')
  if (includesAny(processName, ['混凝土'])) materialCategories.push('商品混凝土')
  if (includesAny(processName, ['防水'])) materialCategories.push('防水材料')
  if (includesAny(processName, ['管道', '管网', '风管', '电缆', '导线'])) materialCategories.push('管线材料')
  if (includesAny(processName, ['吊装', '设备', '电梯'])) equipmentCategories.push('吊装或安装设备')
  if (includesAny(processName, ['开挖', '回填', '夯实'])) equipmentCategories.push('土方机械')
  if (includesAny(processName, ['测量', '放线', '复核'])) equipmentCategories.push('测量仪器')
  if (includesAny(processName, ['测试', '调试', '检测', '试验'])) equipmentCategories.push('检测调试仪器')
  return {
    laborRoles: unique(laborRoles),
    materialCategories: unique(materialCategories),
    equipmentCategories: unique(equipmentCategories),
    crewProductivityBasis: '待 v1.4.18 经验工期与产能样本沉淀',
  }
}

function deriveQuantityInterface(processName: string) {
  if (includesAny(processName, ['土方', '开挖', '回填', '混凝土'])) return { quantityUnitHint: 'm3', workloadMeasurementHint: '按体积或构件工程量计量' }
  if (includesAny(processName, ['钢筋', '管道', '电缆', '导线', '风管', '接地'])) return { quantityUnitHint: 'm/t', workloadMeasurementHint: '按长度或重量计量' }
  if (includesAny(processName, ['设备', '灯具', '开关', '插座', '器具', '电梯'])) return { quantityUnitHint: '台/套/个', workloadMeasurementHint: '按设备或点位数量计量' }
  if (includesAny(processName, ['防水', '保温', '抹灰', '地面', '吊顶', '幕墙', '饰面', '涂饰'])) return { quantityUnitHint: 'm2', workloadMeasurementHint: '按面积计量' }
  return { quantityUnitHint: '项', workloadMeasurementHint: '按分项或工序包计量' }
}

function inferProcessPackLevel(processName: string): ProcessPackLevel {
  if (GENERIC_FALLBACK_PROCESSES.has(processName) || processName.endsWith('施工或安装')) return 'generic_fallback'
  return 'discipline_package'
}

function inferProcessDepthRoleMetadata(
  durationContributionMode: DurationContributionMode,
  executionNature: ExecutionNature,
): Record<string, unknown> {
  if (durationContributionMode === 'duration_bearing' && executionNature === 'physical_work') {
    return { processDepthRole: 'field_duration_work' }
  }
  return {}
}

function buildProcessMetadata(processName: string, stableCode?: string) {
  const quantityInterface = deriveQuantityInterface(processName)
  const processPackLevel = inferProcessPackLevel(processName)
  const qualityStandardKeys = inferQualityStandardKeys(processName)
  const durationContributionMode = inferDurationContributionMode({ name: processName })
  const executionNature = inferExecutionNature({ name: processName, durationContributionMode })
  const controlRoles = inferControlRoles({ name: processName, durationContributionMode, executionNature })
  const enterpriseMethodEvidenceRef = {
    code: 'ENTERPRISE-METHOD-v1.4.7.2',
    level: 'enterprise_method' as const,
    ref: 'internal://enterprise-method/v1.4.7.2',
    rationale: 'WorkBuddy 内置企业标准工序包提供现场通用管理颗粒度。',
  }
  return applyWbsTemplateSemanticOverride(stableCode, {
    domain: BUILDING_DOMAIN,
    verificationStatus: 'enterprise_approved',
    evidenceLevel: 'C' as EvidenceLevel,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    verificationMethod: 'enterprise_method_package_mapping',
    applicableScope: '房屋建筑工程通用企业工法；项目特殊工法需由项目库覆盖',
    evidenceSources: [
      ...standardRefs(qualityStandardKeys),
      {
        standardCode: 'ENTERPRISE-METHOD-v1.4.7.2',
        standardName: '房建通用企业工法工序包',
        publisher: 'WorkBuddy 内置企业标准库',
        evidenceLevel: 'C',
        evidenceUrl: 'internal://enterprise-method/v1.4.7.2',
      },
    ],
    evidenceRefs: [
      ...mergeWbsTemplateEvidenceRefs(
        [...standardEvidenceRefs(qualityStandardKeys), enterpriseMethodEvidenceRef],
        inferWbsTemplatePreferredEvidenceRefs(processName, stableCode),
      ),
    ],
    processSource: ENTERPRISE_PROCESS,
    processPackLevel,
    durationContributionMode,
    executionNature,
    ...controlRoles,
    ...inferProcessDepthRoleMetadata(durationContributionMode, executionNature),
    confidence: processPackLevel === 'generic_fallback' ? 'baseline' : 'discipline_seed',
    specializationStatus: processPackLevel === 'generic_fallback' ? 'needs_enterprise_calibration' : 'discipline_pack_v1',
    preconditionTemplates: derivePreconditionTemplates(processName),
    acceptanceCheckpoints: deriveAcceptanceCheckpoints(processName),
    resourceProfile: deriveResourceProfile(processName),
    quantityBasisCode: QUANTITY_BASIS_CODE,
    ...quantityInterface,
    qualityModuleReady: true,
    quantityAndResourceModuleReady: true,
  })
}

function buildActivityStepMetadata(
  stepName: string,
  processName: string,
  stableCode?: string,
) {
  const processPackLevel = inferProcessPackLevel(processName)
  const activityStepPurpose = inferActivityStepPurpose(stepName)
  const durationContributionMode = resolveActivityStepDurationContributionMode(stepName, activityStepPurpose)
  const executionNature = inferExecutionNature({ name: stepName, durationContributionMode })
  const controlRoles = inferControlRoles({
    name: stepName,
    durationContributionMode,
    executionNature,
  })
  const parentMetadata = buildProcessMetadata(processName)
  return applyWbsTemplateSemanticOverride(stableCode, {
    ...parentMetadata,
    evidenceRefs: mergeWbsTemplateEvidenceRefs(
      parentMetadata.evidenceRefs,
      inferWbsTemplatePreferredEvidenceRefs(`${processName} ${stepName}`, stableCode),
    ),
    verificationStatus: 'enterprise_approved_activity_step',
    parentProcessName: processName,
    activityStepSource: processPackLevel === 'generic_fallback' ? 'generic_checklist' : 'discipline_activity_step_pack',
    activityStepPurpose,
    durationContributionMode,
    executionNature,
    ...controlRoles,
  })
}

function processPackage(entries: ProcessTemplate[]) {
  return entries
}

function standardPrefabStructureProcesses(): ProcessTemplate[] {
  return processPackage([
    'PC深化图和构件拆分清单冻结',
    'PC工厂首件试制和样板评审',
    'PC构件模具清理组装和尺寸复核',
    'PC构件钢筋骨架绑扎和吊点预埋',
    '灌浆套筒和预埋件定位固定',
    '混凝土浇筑振捣和表面成型',
    '蒸养脱模和缺陷修补',
    '出厂编号随件资料和二维码复核',
    'PC构件运输计划和装车绑扎',
    'PC构件堆场接收支垫和二次倒运',
    '吊装方案交底和作业面测量复核',
    '预制墙板柱构件吊装就位和临时支撑',
    '预制墙板柱垂直度校正和拼缝复核',
    '叠合板叠合梁支撑体系搭设验收',
    '叠合板叠合梁吊装就位和搁置长度复核',
    '预制楼梯吊装连接和成品保护',
    '外挑构件预制阳台空调板飘窗吊装定位搁置长度连接节点临时支撑和防坠复核',
    'PCF外挂墙板吊装和外立面收口',
    '全灌浆套筒封仓灌浆和试块留置',
    '浆锚搭接连接灌浆和节点养护',
    '叠合层钢筋管线绑扎和现浇层准备',
    '装配式接缝防水密封和节点防火封堵',
    '装配式结构实体检测和安装偏差复测',
    '装配率核定资料闭合和构件追溯移交',
  ])
}

function specializeExecutionSteps(processName: string, suffix: '施工' | '安装' | '实施') {
  const baseName = processName.replace(/施工或安装$|施工$|安装$|实施$/g, '')
  if (!baseName) return ['作业面准备', '过程施工', '班组自检记录']
  return [`${baseName}作业面确认`, `${baseName}工艺参数控制`, `${baseName}质量自检记录`]
}

function contextualizeActivityStepName(processName: string, stepName: string, itemName?: string) {
  const contextLabel = itemName && itemName !== processName ? `${itemName}/${processName}` : processName
  if (stepName.includes(processName) || (itemName && stepName.includes(itemName))) return stepName
  return `${stepName}（${contextLabel}）`
}

function deriveActivitySteps(processName: string): string[] {
  if (includesAny(processName, ['钢筋翻样与下料'])) return ['设计变更核对', '钢筋料表复核', '下料尺寸抽检']
  if (includesAny(processName, ['钢筋加工'])) return ['加工设备检查', '弯曲成型复核', '半成品挂牌堆放']
  if (includesAny(processName, ['连接接头施工', '型钢与钢筋连接'])) return ['接头规格复核', '连接工艺施工', '接头抽检记录']
  if (includesAny(processName, ['钢筋绑扎安装'])) return ['间距排布复核', '节点绑扎固定', '成型尺寸检查']
  if (includesAny(processName, ['保护层垫块设置'])) return ['垫块规格确认和间距布置', '保护层厚度抽检']
  if (includesAny(processName, ['隐蔽验收'])) return ['隐蔽资料整理和监理验收签认', '整改闭合记录']
  if (includesAny(processName, ['模板深化与配模'])) return ['模板方案核对', '配模尺寸复核', '加固节点确认']
  if (includesAny(processName, ['支架基础处理'])) return ['承载面清理', '垫板扫地杆设置', '基础沉降检查']
  if (includesAny(processName, ['支架搭设与加固'])) return ['立杆间距复核', '剪刀撑连墙件检查', '验收挂牌记录']
  if (includesAny(processName, ['模板安装'])) return ['轴线标高复核', '拼缝加固处理', '垂直平整检查']
  if (includesAny(processName, ['模板成型验收'])) return ['预留预埋位置复核', '尺寸标高偏差复核', '加固体系验收记录']
  if (includesAny(processName, ['模板拆除与清理'])) return ['拆模条件确认', '分区拆除清理', '周转材料验收']
  if (includesAny(processName, ['混凝土进场验收'])) return ['配合比小票核查', '坍落度检测', '试块留置记录']
  if (includesAny(processName, ['混凝土浇筑'])) return ['浇筑顺序控制', '分层振捣控制', '施工缝处理记录']
  if (includesAny(processName, ['振捣找平'])) return ['振捣密实检查', '标高平整控制', '收面压光记录']
  if (includesAny(processName, ['大体积测温'])) return ['测温点布置复核', '入模温度记录', '温差趋势处置记录']
  if (includesAny(processName, ['后浇带封闭'])) return ['后浇带清理凿毛', '止水节点复核', '封闭浇筑记录']
  if (includesAny(processName, ['抗渗试压'])) return ['抗渗等级资料核查', '试件留置送检', '试验报告归档']
  if (includesAny(processName, ['同条件试块'])) return ['同条件试块留置和养护标识', '送检强度报告复核']
  if (includesAny(processName, ['拆模强度报告复核'])) return ['拆模申请和强度报告复核', '拆模条件确认']
  if (includesAny(processName, ['养护与试块留置'])) return ['养护措施落实', '同条件试块留置', '养护记录归档']
  if (includesAny(processName, ['实体质量检查'])) return ['外观质量检查', '实测实量记录', '缺陷整改闭合']

  if (includesAny(processName, ['材料复验与砂浆试配'])) return ['材料合格证核查', '砂浆配合比确认', '复验报告归档']
  if (includesAny(processName, ['排砖放线'])) return ['皮数杆设置', '门窗洞口排版', '灰缝控制线复核']
  if (includesAny(processName, ['拉结筋及构造准备'])) return ['拉结筋位置复核', '构造柱马牙槎检查', '植筋拉拔记录']
  if (includesAny(processName, ['砌筑施工'])) return ['砂浆饱满度控制', '垂直平整检查', '顶部斜砌或塞缝记录']
  if (includesAny(processName, ['勾缝清理'])) return ['灰缝修整和墙面清理', '观感质量检查']

  if (includesAny(processName, ['构件进场验收'])) return ['构件编号核查', '几何尺寸复测', '出厂资料归档']
  if (includesAny(processName, ['吊装准备'])) return ['吊点吊具检查', '吊装路径清障', '试吊确认记录']
  if (includesAny(processName, ['临时固定与校正'])) return ['临时支撑设置', '轴线垂直度校正', '校正记录签认']
  if (includesAny(processName, ['连接施工'])) return ['连接节点清理', '连接件安装紧固', '节点质量复核']
  if (includesAny(processName, ['焊接施工'])) return ['焊材烘干记录', '焊接参数控制', '焊缝外观自检']
  if (includesAny(processName, ['外观及无损检测', '连接检测与验收'])) return ['外观缺陷检查', '无损检测委托', '检测报告闭合']
  if (includesAny(processName, ['初拧与终拧', '初拧和终拧'])) return ['初拧顺序控制', '终拧扭矩复核', '标记记录检查']
  if (includesAny(processName, ['扭矩检查'])) return ['扭矩抽检比例和数值记录', '不合格复拧闭合']

  if (includesAny(processName, ['基层含水率或平整度检查'])) return ['基层含水率和阴阳角圆弧检查', '基层缺陷修补']
  if (includesAny(processName, ['界面剂施工'])) return ['基层材质识别和界面剂配比确认', '涂刷覆盖检查']
  if (includesAny(processName, ['抗裂网铺设'])) return ['交接部位网格布搭接控制', '固定牢靠检查']
  if (includesAny(processName, ['阴阳角护角'])) return ['护角条位置和垂直方正控制', '成品保护检查']
  if (includesAny(processName, ['空鼓裂缝处理'])) return ['空鼓裂缝标识和切割修补', '复查闭合记录']
  if (includesAny(processName, ['节点附加层施工'])) return ['阴阳角和管根落水口附加层', '附加层搭接检查']
  if (includesAny(processName, ['搭接收头处理'])) return ['搭接宽度复核和收头密封固定', '边角节点拍照留痕']
  if (includesAny(processName, ['闭水或淋水试验'])) return ['蓄水或淋水条件确认和试验记录', '渗漏整改闭合']
  if (includesAny(processName, ['保护层与验收'])) return ['保护层施工检查和成品保护移交', '验收资料归档']

  if (includesAny(processName, ['洞口复核'])) return ['洞口尺寸复测和预埋件位置检查', '偏差整改确认']
  if (includesAny(processName, ['木框防腐防火处理'])) return ['木材含水率检测和防腐防火涂刷', '处理记录归档']
  if (includesAny(processName, ['型材进场复验'])) return ['型材规格核查和壁厚表面检查', '复验报告归档']
  if (includesAny(processName, ['防腐与防雷连接'])) return ['连接点位复核和跨接导通测试', '防腐补刷记录']
  if (includesAny(processName, ['淋水试验与验收'])) return ['淋水条件确认和渗漏观察', '整改复验签认']
  if (includesAny(processName, ['增强型钢复验'])) return ['增强型钢规格和衬钢固定检查', '焊角或连接复核']
  if (includesAny(processName, ['专项性能资料复核'])) return ['防火或人防证书和五金配置核查', '专项验收资料归档']
  if (includesAny(processName, ['消防或人防联动测试'])) return ['联动信号接入和启闭动作测试', '测试记录签认']
  if (includesAny(processName, ['镀膜面复核'])) return ['玻璃规格和镀膜面方向核查', '中空层完整性检查']
  if (includesAny(processName, ['密封胶相容性确认'])) return ['胶材批次核查和相容性报告确认', '打胶环境记录']
  if (includesAny(processName, ['防坠措施'])) return ['压条固定和防坠节点复核', '成品保护交接']
  if (includesAny(processName, ['框体安装固定'])) return ['框体垂直度和连接固定检查', '防雷连接确认']
  if (includesAny(processName, ['塞缝防水处理'])) return ['塞缝材料确认和填塞', '防水密封检查']
  if (includesAny(processName, ['扇及五金安装'])) return ['开启方向复核和五金安装调试', '启闭功能检查']
  if (includesAny(processName, ['吊杆龙骨安装'])) return ['吊点间距和龙骨平整度检查', '隐蔽验收记录']
  if (includesAny(processName, ['面层安装'])) return ['板缝排版和固定件检查', '表面平整验收']
  if (includesAny(processName, ['深化排版'])) return ['排版图确认和分格缝协调', '样板段确认']
  if (includesAny(processName, ['面板安装'])) return ['连接件复核和板块安装调整', '板面污染检查']
  if (includesAny(processName, ['打胶清理与验收'])) return ['胶缝基层清理和打胶饱满检查', '外观验收记录']

  if (includesAny(processName, ['管道预制加工'])) return ['管段编号坡口套丝加工', '预制尺寸检查']
  if (includesAny(processName, ['管道及配件安装'])) return ['坡度和支架复核及管件安装', '管线标识检查']
  if (includesAny(processName, ['接口连接检查'])) return ['接口形式确认和连接质量抽查', '渗漏隐患整改']
  if (includesAny(processName, ['压力或功能试验'])) return ['试压方案确认', '升压保压记录', '泄漏整改复验']
  if (includesAny(processName, ['冲洗防腐与验收'])) return ['系统冲洗记录', '防腐保温检查', '验收移交签认']
  if (includesAny(processName, ['风管或部件制作'])) return ['板材厚度复核', '咬口法兰制作', '成品编号堆放']
  if (includesAny(processName, ['送风保温连续性'])) return ['保温材料复核', '保温厚度抽检', '防潮层连续检查']
  if (includesAny(processName, ['防排烟耐火风管'])) return ['耐火材料资料核查', '耐火包覆施工', '防火封堵检查']
  if (includesAny(processName, ['防排烟联动复核'])) return ['阀口动作测试', '消防信号联调', '联动记录签认']
  if (includesAny(processName, ['除尘耐磨防爆'])) return ['耐磨衬里检查', '防爆接地复核', '泄爆或隔爆措施确认']
  if (includesAny(processName, ['净化洁净控制'])) return ['洁净材料保护', '高效过滤器安装', '洁净度测试记录']
  if (includesAny(processName, ['恒温恒湿精度复核'])) return ['传感器校准', '温湿度稳定性测试', '运行曲线记录']
  if (includesAny(processName, ['人防密闭与防爆波'])) return ['密闭阀安装检查', '防爆波设备复核', '人防专项验收记录']
  if (includesAny(processName, ['风管或部件安装'])) return ['支吊架间距复核', '风管连接密封', '标高走向检查']
  if (includesAny(processName, ['保温防腐配合'])) return ['保温厚度检查', '防潮层连续性检查', '保护层收口检查']
  if (includesAny(processName, ['漏风量或严密性测试'])) return ['测试分区封堵', '漏风量测试记录', '不合格整改复测']
  if (includesAny(processName, ['系统调试验收'])) return ['风量水量平衡', '联动控制测试', '调试报告移交']

  if (includesAny(processName, ['基础及接地复核'])) return ['基础尺寸复核', '接地端子检查', '交接记录签认']
  if (includesAny(processName, ['设备安装固定'])) return ['设备水平度调整', '地脚螺栓紧固', '铭牌编号核查']
  if (includesAny(processName, ['母线或电缆连接'])) return ['相序回路核对', '接线压接检查', '绝缘防护处理']
  if (includesAny(processName, ['绝缘和接地测试'])) return ['绝缘电阻测试', '接地连续性测试', '测试记录归档']
  if (includesAny(processName, ['试验试运行'])) return ['送电条件确认', '空载试运行', '运行参数记录']
  if (includesAny(processName, ['线缆敷设'])) return ['路径通畅检查', '牵引保护控制', '余量和弯曲半径检查']
  if (includesAny(processName, ['室外防水防腐处理'])) return ['防水等级核查', '防腐涂层检查', '室外封堵验收']
  if (includesAny(processName, ['配电室屏蔽与防火封堵'])) return ['屏蔽连续性检查', '穿墙封堵施工', '防火封堵验收']
  if (includesAny(processName, ['干线载流与伸缩节复核'])) return ['载流路径复核', '伸缩节设置检查', '温升隐患排查']
  if (includesAny(processName, ['动力回路隔离防护'])) return ['强弱电间距复核', '动力回路标识', '机械防护检查']
  if (includesAny(processName, ['照明回路分区标识'])) return ['回路分区核对', '照明编号标识', '试亮记录归档']
  if (includesAny(processName, ['整理固定'])) return ['线缆排列整理', '绑扎固定检查', '桥架盖板复位']
  if (includesAny(processName, ['标识挂牌'])) return ['回路编号核对', '挂牌固定检查', '竣工图同步']
  if (includesAny(processName, ['接地体或引下线施工'])) return ['焊接搭接长度复核', '防腐处理检查', '隐蔽验收记录']
  if (includesAny(processName, ['电阻或连续性测试'])) return ['测试点位确认', '测试数据记录', '不合格整改复测']

  if (includesAny(processName, ['点位和机柜复核'])) return ['点表核对', '机柜空间电源检查', '弱电间环境确认']
  if (includesAny(processName, ['线缆端接'])) return ['端接色标核查', '模块压接检查', '链路编号记录']
  if (includesAny(processName, ['参数配置'])) return ['地址参数规划', '设备参数写入', '配置备份留存']
  if (includesAny(processName, ['单点测试'])) return ['单点通讯测试', '状态反馈核对', '问题清单闭合']
  if (includesAny(processName, ['功能测试'])) return ['场景功能验证', '报警联动测试', '测试报告签认']
  if (includesAny(processName, ['运营商进场协调'])) return ['进场界面确认', '施工窗口协调', '交底记录签认']
  if (includesAny(processName, ['接入条件移交'])) return ['机房电源条件核查', '管线路由移交', '接口责任确认']
  if (includesAny(processName, ['配合安装与联调'])) return ['配合点位开放', '运营商设备联调', '问题清单闭合']
  if (includesAny(processName, ['运营商资料移交'])) return ['测试资料收集', '竣工资料核对', '移交签认归档']
  if (includesAny(processName, ['梯架、托盘、槽盒和导管', '梯架托盘槽盒', '托盘、槽盒和导管'])) {
    return ['安装固定与接地跨接复核', '实测问题销项记录签认']
  }

  if (includesAny(processName, ['安装条件复核'])) return ['井道尺寸复核', '机房条件检查', '土建移交签认']
  if (includesAny(processName, ['样板或基准线复核'])) return ['样板架检查', '导轨基准线复核', '测量记录归档']
  if (includesAny(processName, ['校正调整'])) return ['垂直度调整', '运行间隙复核', '调整记录签认']
  if (includesAny(processName, ['安全功能检查'])) return ['限速安全装置检查', '门锁回路验证', '应急保护测试']

  // 桩基与地基处理工序
  if (includesAny(processName, ['桩位放样', '桩位复核', '护筒埋设'])) return ['桩位放样复核和护筒埋设', '桩位测量成果记录']
  if (includesAny(processName, ['泥浆制备', '泥浆循环'])) return ['泥浆配比确认和比重黏度检测', '循环管路调试记录']
  if (includesAny(processName, ['钻机就位', '成孔施工', '钻进成孔'])) return ['钻机就位校核和钻进参数控制', '成孔记录签认']
  if (includesAny(processName, ['孔深孔径', '垂直度检测', '成孔质量'])) return ['孔深孔径和垂直度偏斜检测', '成孔质量验收记录']
  if (includesAny(processName, ['一次清孔', '清孔'])) return ['清孔深度确认和泥浆置换', '沉渣厚度检测记录']
  if (includesAny(processName, ['钢筋笼制作安装'])) return ['钢筋笼加工制作和接头检查', '吊装下放定位控制']
  if (includesAny(processName, ['导管安装', '二次清孔'])) return ['导管水密性试验和下放深度控制', '二次清孔沉渣复测']
  if (includesAny(processName, ['水下混凝土灌注'])) return ['首灌量控制和导管埋深控制', '充盈系数记录']
  if (includesAny(processName, ['桩顶超灌', '浮浆处理', '桩顶处理'])) return ['超灌高度复核和浮浆凿除', '桩顶标高复测记录']
  if (includesAny(processName, ['桩身完整性检测'])) return ['低应变或超声波检测分析', '检测报告闭合归档']
  if (includesAny(processName, ['桩基验收'])) return ['承载力检测资料和桩位偏差核查', '桩基验收移交签认']
  if (includesAny(processName, ['试沉桩', '试桩参数'])) return ['试桩方案确认和参数记录', '终压贯入度判定']
  if (includesAny(processName, ['沉桩施工', '压桩施工'])) return ['桩身垂直度和沉桩速率控制', '接桩焊接连接检查']
  if (includesAny(processName, ['接桩', '焊接连接'])) return ['焊接端板清理', '焊缝外观检查', '防腐补刷记录']
  if (includesAny(processName, ['截桩', '桩头处理'])) return ['桩顶标高复核和截桩标识', '桩头锚固筋保护']
  if (includesAny(processName, ['填芯或封底'])) return ['孔底沉渣复验和填芯混凝土浇筑', '填芯密实度检测']
  if (includesAny(processName, ['后插钢筋笼'])) return ['泵送混凝土面控制和插笼时机', '插入深度和定位复核']
  if (includesAny(processName, ['拔管', '沉管'])) return ['拔管速度和反插次数控制', '桩顶混凝土标高复核']
  if (includesAny(processName, ['贯入度', '终压'])) return ['终压值稳压和贯入度标高双控', '封桩或桩头处理记录']
  if (includesAny(processName, ['冠梁'])) return ['桩顶浮浆凿除和冠梁钢筋模板施工', '冠梁混凝土浇筑记录']
  if (includesAny(processName, ['桩间土'])) return ['桩间土清理整平和挂网喷护施工', '桩间排水处理记录']

  // 基坑支护专有工序
  if (includesAny(processName, ['导墙'])) return ['导墙定位放线和钢筋模板施工', '导墙混凝土浇筑复核']
  if (includesAny(processName, ['成槽'])) return ['槽段划分定位和成槽垂直度检测', '槽底沉渣清理检查']
  if (includesAny(processName, ['槽段接头'])) return ['接头管/箱安装和刷洗清理', '接头混凝土质量检查']
  if (includesAny(processName, ['土钉', '锚杆施工'])) return ['钻孔成孔和杆体安装定位', '注浆压力和注浆量记录']
  if (includesAny(processName, ['喷射混凝土'])) return ['喷射厚度和配合比控制', '喷射面平整度检查']
  if (includesAny(processName, ['腰梁', '锚具', '张拉锁定'])) return ['腰梁安装就位和分级张拉应力控制', '锁定锚头位移监测']
  if (includesAny(processName, ['SMW', '型钢水泥土', '三轴搅拌'])) return ['下沉喷浆搅拌和提升复搅施工', 'H型钢插入垂直度控制']
  if (includesAny(processName, ['型钢起拔', '型钢回收'])) return ['起拔条件确认和减摩剂涂刷检查', '型钢回收记录归档']
  if (includesAny(processName, ['监测点', '基坑监测'])) return ['监测点布设和初始值采集', '监测数据报告签认']

  // 砌体结构专有工序
  if (includesAny(processName, ['构造柱', '腰带', '圈梁'])) return ['构造柱钢筋预留和马牙槎留置检查', '构造柱混凝土浇筑']
  if (includesAny(processName, ['顶砖斜砌', '塞缝'])) return ['顶砖斜砌角度和砂浆饱满度检查', '墙面清理验收']

  // 屋面专有工序
  if (includesAny(processName, ['找坡', '找平'])) return ['坡度标高控制和分格缝设置', '找平层养护记录']
  if (includesAny(processName, ['隔汽层'])) return ['隔汽层材料核查和搭接密封', '隔汽层完整性验收']
  if (includesAny(processName, ['铺瓦', '挂瓦', '脊瓦'])) return ['顺水条挂瓦条安装和瓦片固定', '脊瓦斜脊封闭验收']
  if (includesAny(processName, ['种植屋面', '耐根穿刺'])) return ['耐根穿刺防水层和排蓄水层铺设', '种植土回填验收']
  if (includesAny(processName, ['架空隔热'])) return ['架空层高度复核和通风口设置', '架空板铺设验收']
  if (includesAny(processName, ['蓄水屋面', '蓄水隔热'])) return ['防水层完整性和蓄水分区设置', '蓄水深度验收']
  if (includesAny(processName, ['出屋面', '泛水', '收头'])) return ['细部节点附加层和泛水收头密封', '节点拍照留痕归档']
  if (includesAny(processName, ['淋水试验与验收'])) return ['淋水或蓄水条件确认和渗漏观察', '整改复验签认']

  // 给排水专有工序
  if (includesAny(processName, ['通球试验'])) return ['通球率测试和管道通畅检查', '堵塞点定位处置']
  if (includesAny(processName, ['灌水试验'])) return ['灌水液面高度控制和渗漏观察', '整改复验签认']
  if (includesAny(processName, ['消毒'])) return ['消毒剂投加和接触时间控制', '水质取样送检']
  if (includesAny(processName, ['水压试验', '试压'])) return ['试压方案确认和升压保压记录', '泄漏整改复验']

  // 暖通专有工序
  if (includesAny(processName, ['风管加固'])) return ['加固形式确认和间距复核', '加固外观验收']
  if (includesAny(processName, ['无法兰连接'])) return ['插条或弹簧夹规格和连接间距检查', '密封胶施工检查']
  if (includesAny(processName, ['风口安装'])) return ['风口位置复核和连接密封', '风口外观和调节功能检查']
  if (includesAny(processName, ['耐火风管', '防火包覆'])) return ['耐火材料核查和包覆厚度检查', '防火封堵验收']
  if (includesAny(processName, ['高效过滤器', '洁净度'])) return ['高效过滤器检漏和洁净度测试', '测试记录签认']

  // 电气专有工序
  if (includesAny(processName, ['变压器安装', '箱式变电所'])) return ['基础型钢安装和器身检查', '冲击合闸试验记录']
  if (includesAny(processName, ['配电柜安装', '控制柜安装'])) return ['柜体就位和柜内母线安装', '二次回路校验和五防检查']
  if (includesAny(processName, ['母线槽安装'])) return ['直线段弯头连接和伸缩节设置', '绝缘电阻测试记录']
  if (includesAny(processName, ['电缆头制作'])) return ['剥切尺寸相序确认和绝缘密封', '相色标识和挂牌']
  if (includesAny(processName, ['电缆敷设'])) return ['放缆路径和牵引力控制', '弯曲半径和挂牌验收']
  if (includesAny(processName, ['接地电阻', '防雷接地'])) return ['接地电阻测试和防雷引下线检查', '等电位联结验收']

  // 装饰装修专有工序
  if (includesAny(processName, ['甩浆', '拉毛'])) return ['基层湿润和甩浆', '拉毛强度确认']
  if (includesAny(processName, ['冲筋打点', '灰饼', '吊垂直'])) return ['吊垂直套方和灰饼设置', '冲筋平整度复核']
  if (includesAny(processName, ['挂网', '加强网'])) return ['不同材料交接处挂网和搭接(≥100mm)', '固定牢靠验收']
  if (includesAny(processName, ['底层抹灰', '中层抹灰', '面层抹灰'])) return ['分层厚度控制', '压实密实度检查', '养护记录签认']
  if (includesAny(processName, ['腻子'])) return ['基底含水率检查和腻子分层施工', '打磨平整度复测']
  if (includesAny(processName, ['底漆', '封闭底漆'])) return ['基层清洁度和抗碱底漆涂刷', '底漆干燥成膜检查']
  if (includesAny(processName, ['面漆'])) return ['面漆调配和分层涂刷', '色泽均匀观感验收']
  if (includesAny(processName, ['铺贴'])) return ['试铺排砖和结合层摊铺', '铺贴密实和平整度过程控制']
  if (includesAny(processName, ['勾缝', '灌缝'])) return ['缝隙清理和湿润', '勾缝压实和表面清洁']
  if (includesAny(processName, ['龙骨安装', '沿地龙骨', '沿顶龙骨'])) return ['沿地沿顶弹线定位', '龙骨间距复核', '边框龙骨固定检查']
  if (includesAny(processName, ['隔音棉', '填充'])) return ['填充材料规格核查', '填充饱满连续性检查', '隐蔽验收记录']
  if (includesAny(processName, ['板缝处理'])) return ['板缝坡口检查', '嵌缝膏填实', '接缝纸带粘贴验收']
  if (includesAny(processName, ['干挂', '幕墙连接'])) return ['预埋件后置埋件复核', '连接件安装调整', '石材或面板安装定位']

  // 建筑节能专有工序
  if (includesAny(processName, ['节能检测', '传热系数'])) return ['现场钻芯取样和传热系数检测', '热工缺陷红外扫描']
  if (includesAny(processName, ['气密性检测'])) return ['检测条件确认和气密性测试', '不合格整改复测']
  if (includesAny(processName, ['保温板粘贴'])) return ['粘结面积和拼缝错缝控制', '锚栓固定拉拔试验']
  if (includesAny(processName, ['防火隔离带'])) return ['隔离带材料核查(A级)和宽度复核', '隔离带与保温层同步验收']

  // 铝合金结构专有工序
  if (includesAny(processName, ['铝合金型材', '铝合金加工', '零部件加工'])) return ['型材规格壁厚核查和切割尺寸检查', '加工件编号和防污染保护']
  if (includesAny(processName, ['阳极氧化', '电化学处理'])) return ['氧化膜厚度和封孔质量检查', '附着力和耐蚀性测试']

  // 木结构专有工序
  if (includesAny(processName, ['防腐处理', '防火处理', '防虫处理', '防护处理'])) return ['处理材料方法核查和处理深度检查', '处理效果检测记录']
  if (includesAny(processName, ['胶合木', '胶合性能'])) return ['胶合木产品证书和胶层完整性核查', '结构性能复核验收']

  // 供暖系统专有工序
  if (includesAny(processName, ['散热器安装'])) return ['散热器托钩支架固定和就位校正', '供回水阀和放气阀安装']
  if (includesAny(processName, ['地暖盘管'])) return ['盘管间距弯曲半径和卡钉固定检查', '伸缩缝和保护套管检查']
  if (includesAny(processName, ['分集水器'])) return ['分集水器位置标高复核和管路连接', '各回路标识和调试阀检查']
  if (includesAny(processName, ['热计量', '热计量装置'])) return ['热量表核查和传感器安装', '积算仪接线和数据核对']
  if (includesAny(processName, ['烘炉煮炉'])) return ['烘炉曲线控制', '煮炉药剂投加和排污', '煮炉后清洗和检查']

  // 室外管网专有工序
  if (includesAny(processName, ['管沟', '沟槽'])) return ['沟槽放线和基底验槽', '边坡支护和排水措施', '沟底标高和垫层验收']
  if (includesAny(processName, ['回填'])) return ['分层厚度和含水率控制', '压实度检测(环刀或灌砂)', '管顶保护层和路面恢复']

  // 水处理/泳池/喷泉专有工序
  if (includesAny(processName, ['水处理设备', '过滤设备'])) return ['设备基础复核和管路连接', '滤料填装和反冲洗测试']
  if (includesAny(processName, ['喷头', '水景灯具'])) return ['喷头或灯具安装固定', '接线接管和防水密封检查']
  if (includesAny(processName, ['水形调试', '灯光效果调试'])) return ['喷头角度水量和灯光调节', '场景组合和控制程序验收']

  // 空调水系统专有工序
  if (includesAny(processName, ['冷却塔'])) return ['塔体基础和集水盘复核', '冷却塔就位和找平', '风机布水器检查和补水溢流连接']
  if (includesAny(processName, ['板式热交换器'])) return ['板片密封检查和打压试漏', '热工参数验收']
  if (includesAny(processName, ['地理管', '地埋管'])) return ['钻孔深度孔径复核和下管回填', '环路试压和流量平衡测试']
  if (includesAny(processName, ['制冷剂灌注', '制冷剂充注'])) return ['系统抽真空保压和制冷剂称量灌注', '运行压力和过热度复核']

  // 智能建筑专有工序
  if (includesAny(processName, ['认证测试', '链路测试', '信道测试'])) return ['FLUKE认证测试', '接线图和长度和衰减测试', 'NEXT和回波损耗测试']
  if (includesAny(processName, ['光纤测试', 'OTDR测试'])) return ['光纤端面检查和清洁', 'OTDR衰减曲线测试', '事件点和链路损耗记录']
  if (includesAny(processName, ['软件部署', '软件安装'])) return ['软件版本和许可核查', '部署和参数配置', '配置备份和版本记录']
  if (includesAny(processName, ['探测器安装', '传感器安装'])) return ['点位确认和安装固定', '地址编码和回路登记']
  if (includesAny(processName, ['消防联动', '全功能联动'])) return ['联动关系表核对', '分项联动功能逐步测试', '联动时序和反馈信号记录']
  if (includesAny(processName, ['电磁屏蔽'])) return ['屏蔽壳体连续性检查和穿墙管线处理', '屏蔽效能或接地电阻检测']
  if (includesAny(processName, ['综合布缆'])) return ['缆线规格和路径复核', '缆线敷设牵引力和弯曲半径控制', '预留长度和临时端帽保护']

  // 放线定位类 — 需要三级控制：引测→放线→复核
  if (includesAny(processName, ['测量放线', '定位放线', '放线定位', '轴线引测', '标高引测', '控制测量'])) {
    return [`${processName}控制线引测`, `${processName}细部放线`, `${processName}测量成果复核记录`]
  }

  if (includesAny(processName, ['方案'])) {
    return [`${processName}方案编制`, `${processName}方案审批`]
  }
  if (includesAny(processName, ['准备', '交底', '深化', '排版', '翻样'])) {
    return [`${processName}资料核对和条件确认`, `${processName}技术交底双方签认`]
  }
  if (includesAny(processName, ['进场', '复验', '开箱', '材料'])) {
    return [`${processName}资料核验`, `${processName}外观数量检查`, `${processName}见证取样或验收记录`]
  }
  if (includesAny(processName, ['测量', '放线', '放样', '复核', '定位', '标高', '布设'])) {
    return [`${processName}实测实量`, `${processName}测量成果记录`]
  }
  if (includesAny(processName, ['加工', '预制', '制作', '下料', '配制', '制备'])) {
    return [`${processName}加工图核对`, `${processName}下料制作`, `${processName}编号堆放`]
  }
  // 复杂测试/调试/试运行/验收 → 必须在施工关键词之前（检测类不应被压实/保温等施工词拦截）
  if (includesAny(processName, ['试验', '检测', '测试', '调试', '联调', '试运行', '验收'])) {
    return [`${processName}方案或条件确认`, `${processName}测试执行和过程记录`, `${processName}问题整改闭合和报告`]
  }
  if (includesAny(processName, ['安装', '敷设', '绑扎', '浇筑', '砌筑', '施工', '喷涂', '涂刷', '铺设', '吊装', '焊接', '连接', '张拉', '压浆', '就位', '校正', '插入', '安放', '喂桩', '插笼', '吊桩', '灌注', '压灌', '成孔', '成桩', '钻进', '搅拌', '喷浆', '沉桩', '接桩', '压桩', '沉管', '复搅', '压实', '夯实', '振密', '整平', '清孔', '提钻', '拔管', '密封', '覆盖', '塞缝', '排水', '加载', '卸载', '切割', '补刷', '封桩', '回填', '反插', '开挖', '摊铺', '修整', '设置', '拼装', '组装', '交接', '抽检', '振捣', '凿除', '顶砌', '斜砌', '布置', '注浆', '回灌', '排砖', '砌石', '坡面', '防护', '植草', '接线', '编号', '封存', '入库', '跨接', '接入', '收口', '抹面', '收光', '压平', '修抹', '铺装', '涂布', '充注', '排气', '清点', '装箱', '防腐', '冲洗', '保温', '绝热', '标识', '端接', '修补', '搭接', '钉固', '浸泡', '循环', '对接', '编码', '消防', '气体', '引入', '联接', '封堵', '精校', '导轨', '修光', '润滑', '装入', '对重', '悬挂', '防晃', '加注', '调整', '固定', '选料', '浸砖', '试排', '预排', '纹理', '分格', '初拧', '终拧', '测温', '处理'])) {
    if (processName.endsWith('施工或安装')) return specializeExecutionSteps(processName, '实施')
    if (processName.endsWith('施工')) return specializeExecutionSteps(processName, '施工')
    if (processName.endsWith('安装')) return specializeExecutionSteps(processName, '安装')
    return [`${processName}作业面准备`, `${processName}过程施工`, `${processName}班组自检记录`]
  }
  // 简单检查/观测/记录/确认 → 2步
  if (includesAny(processName, ['检查', '观测', '监测', '记录', '确认', '巡检', '整改', '复测', '拍照', '留痕', '核对', '下载', '配置', '策略', '实测', '观察', '试运转', '预调', '整定', '注册', '导入', '验证', '培训', '核查', '校准', '检验'])) {
    return [`${processName}检查或实测`, `${processName}记录签认`]
  }
  if (includesAny(processName, ['养护', '保护', '清洁'])) {
    return buildCareOrProtectionSteps(processName)
  }
  if (includesAny(processName, ['清理', '移交', '封井'])) {
    return [`${processName}现场清理维护`, `${processName}移交确认记录`]
  }
  // 兜底：通用回退（当前覆盖率100%，理论上不应命中）
  return [`${processName}作业条件确认`, `${processName}实施`, `${processName}自检整改确认`]
}

const STANDARD_ACTIVITY_STEP_DEPTH_OVERRIDES: Record<string, string[]> = {
  '01-01-01-P01': ['配合比试验资料和材料来源复核', '施工参数含水率和虚铺厚度确认', '试验段位置范围和检测点布置', '最佳含水率现场调整和拌合均匀性检查', '压实指标检测方法和频次确认', '参数签认记录和大面施工放行'],
  '01-01-01-P02': ['测量放线控制依据和坐标成果复核', '控制点保护和引测闭合检查', '换填或处理边界线现场标识', '设计标高控制桩和分层厚度标识', '复测闭合成果和偏差整改记录', '放线签认资料和作业面移交'],
  '01-01-01-P03': ['材料进场批次合格证和数量核对', '批次复验项目和取样部位确认', '含水率现场检测和调整措施记录', '粒径级配筛分结果和杂质检查', '见证取样编号和送检台账归集', '复验报告回收和不合格材料处置'],
  '01-01-02-P01': ['灰土配合比试验报告和石灰剂量复核', '最佳含水率和现场拌合用水量确认', '施工参数虚铺厚度和碾压遍数确定', '试验段摊铺压实和检测点布置', '压实系数检测结果和偏差调整记录', '参数签认资料和批量施工放行'],
  '01-01-02-P02': ['灰土地基处理范围和设计依据复核', '测量放线成果和轴线控制复核', '控制桩保护和分层标识设置', '换填边界灰线和作业面清理确认', '标高复测成果和超欠挖整改记录', '放线签认资料和施工班组交底'],
  '01-01-02-P03': ['灰土材料进场批次和堆放防潮检查', '石灰土料消解状态和土料杂质筛查', '批次复验项目和取样频次确认', '含水率检测结果和拌合调整记录', '见证取样编号和送检资料归集', '复验报告闭合和不合格材料隔离'],
  '01-01-03-P02': ['加筋垫层设计范围和基层状态复核', '测量放线成果和控制线复测', '铺设边界线与锚固沟位置标识', '搭接线宽度方向和铺设顺序确认', '标高复测成果和基层平整度整改', '放线签认资料和铺设作业放行'],
  '01-01-03-P03': ['土工合成材料规格型号和合格证核验', '进场复验批次和抽样比例确认', '拉伸强度延伸率和单位面积质量复核', '幅宽搭接宽度和卷材外观检查', '见证取样编号和送检台账记录', '复验报告回收和破损材料隔离'],
  '01-01-04-P01': ['砂石配合比和材料来源复核', '级配曲线筛分结果和含泥量确认', '含水率检测和洒水调整措施记录', '施工参数虚铺厚度压实遍数和机械组合确定', '试验段铺填振实和承载力检测布置', '参数签认资料和分区施工放行'],
  '01-01-04-P02': ['砂石垫层处理范围和基层验收复核', '测量放线成果和轴线控制校核', '铺设边界线和分层厚度标识设置', '控制点保护和机械行走路线确认', '标高复测成果和低洼松散区整改', '放线签认资料和垫层铺填交底'],
  '01-01-04-P03': ['砂石材料进场批次和外观含泥量检查', '批次复验筛分级配和压碎值项目确认', '级配含泥量检测结果和偏差调整记录', '见证取样编号和送检资料归集', '不合格处置隔离退场或重新复验记录', '复验报告闭合和材料使用放行'],
  '01-01-05-P02': ['试夯区位置面积和地质代表性复核', '夯能参数夯锤重量落距和遍数确认', '夯点布置间距编号和测量控制复核', '沉降量隆起量和孔隙水压力观测记录', '试夯记录检测成果和异常点处理', '参数签认资料和大面积强夯放行'],
  '01-02-04-P07': ['柱脚轴线复测和钢柱安装偏差核对', '基础标高杯口或支承面实测复核', '锚栓复测外露长度垂直度和丝扣保护检查', '交接签认清单和土建钢结构界面会签', '资料移交合格证隐蔽记录和测量成果归档', '整改闭合问题复测和钢结构安装放行'],
  '01-02-01-P07': ['养护记录覆盖保湿和龄期台账复核', '实体强度报告和同条件试块结果核验', '外观缺陷蜂窝麻面裂缝普查记录', '尺寸偏差轴线标高截面实测复核', '验收签认资料和基础分项质量评定', '缺陷闭合整改复查和后续工序移交'],
  '01-04-02-P08': ['回灌停用条件和地下水位稳定趋势确认', '停用前后水位复核和周边沉降观测记录', '回灌井封井记录材料方法和影像资料归档', '监测交接点位频率阈值和责任边界会签', '资料移交水位曲线运行记录和异常处置台账', '风险销项清单复测闭合和后续巡查安排'],
  '01-05-03-P07': ['场地平整标高复测和方格网成果核对', '坡向排水临时排水沟和积水点复查', '施工边界复核红线控制和移交范围标识', '压实记录碾压遍数和压实度检测归集', '交接签认作业面条件和后续施工接口确认', '问题销项沉陷软弱点整改和复测闭合'],
  '01-06-03-P01': ['边坡开挖放坡参数和设计坡率复核', '开挖分层分段顺序和机械作业路线确认', '支护界面截排水和坡顶荷载控制检查', '监测点位布设初始值和报警阈值复核', '安全条件临边防护上下通道和应急措施检查', '复核签认方案交底和开挖作业放行'],
  '05-14-02-P01': ['仪表回路点表版本和位号清单核对', '信号校验方法仪表校验证书和回路状态确认', '量程核对上下限报警值和显示单位复核', '联锁条件逻辑矩阵和旁路状态确认', '调试记录单点测试回路测试和趋势截图归档', '异常销项偏差复测和回路投用签认'],
  '05-02-04-P09': ['排水通球试验管段编号和球径路径确认', '灌水记录封堵高度满水时间和渗漏检查归集', '通水复测排放路径流量和排水通畅性确认', '渗漏销项接口返修和二次复验记录闭合', '资料归档试验记录影像和隐蔽验收文件整理', '移交签认排水系统边界和运维注意事项会签'],
  '06-08-07-P08': ['人防联调防护设备通风电气和给排水联合测试', '密闭检测门框墙管线穿墙和密闭阀结果核验', '防爆附件型号数量安装方向和启闭状态复查', '验收资料专项检测报告合格证和隐蔽记录归档', '问题销项验收意见整改复测和影像闭合', '移交签认人防设施台账钥匙和维护责任交接'],
  '08-15-02-P06': ['报警回路清册点位编号和系统图一致性核对', '线缆标识端子编号和敷设路径复查', '绝缘测试回路电阻和接地连续性记录归集', '报警点位触发反馈和主机显示一致性确认', '验收记录抽测结果问题清单和复测资料整理', '签认归档回路清册竣工图和移交台账闭合'],
  '08-09-02-P06': ['消防强切回路清单和控制对象编号核对', '分区矩阵广播分区切换逻辑和联动关系复核', '线缆标识端子接线和控制柜回路复查', '联动测试强切反馈广播切换和消防主机记录验证', '测试归档联动记录截图和问题复测资料整理', '问题销项异常回路整改和验收签认闭合'],
  '10-03-01-P05': ['设备合格证明出厂检验报告和备案资料核验', '型式资料型式试验报告和适用范围复核', '安全部件限速器缓冲器门锁和保护装置资料核对', '随机文件安装维护说明书备件清单和图纸归集', '资料复核缺页错版和版本一致性检查', '缺项闭合补证资料回收和监督检验放行'],
  '05-13-01-P02': ['锅炉特种设备告知文件和施工许可资料核验', '锅炉本体设备资料合格证质量证明和监检证书复核', '铭牌核验型号参数出厂编号和设计文件一致性检查', '安装条件基础烟风水电燃料接口和安全距离确认', '监督检验报检资料和检验计划会签', '资料闭合缺项补正和安装开工放行'],
  '02-03-04-P01': ['单层钢结构吊装半径和起重机械站位复核', '吊装作业面地基承载垫板和行走路线确认', '构件编号规格方向和安装顺序清单核对', '临时支撑缆风绳和安全防护条件检查', '高强螺栓摩擦面扭矩工具和连接材料复核', '吊装放行交底记录和应急联络签认'],
  '02-04-02-P01': ['空间钢结构支座轴线标高和预埋件复核', '吊点复核吊具索具和分段重量确认', '胎架支撑基础承载和变形监测点布置检查', '卸载方案顺序分级和变形控制指标会签', '节点标高控制线和合拢口尺寸复测', '安装放行技术交底安全条件和监测基线签认'],
  '05-06-03-P01': ['室外给水调试分区和系统边界清单确认', '阀门边界启闭状态编号和隔离措施复核', '冲洗流速排放路径和排污口条件确认', '压力测点压力表校验和稳压观察计划复核', '水质取样点位消毒冲洗和送检要求确认', '记录签认调试方案交底和问题跟踪台账建立'],
  '05-07-03-P01': ['室外排水调试井段范围和上下游边界确认', '闭水条件封堵高度水位标尺和观察时长复核', '通球试验球径路径和收球位置确认', '坡度复核管底标高井底高程和流向检查', '渗漏整改接口井室和回填沉降问题清单建立', '资料签认试验方案交底和影像记录要求确认'],
  '05-08-02-P08': ['水压试验试压分段阀门隔离和系统边界确认', '升压曲线分级升压和压力表校验证书核对', '稳压时间压降允许值和观察点位记录', '泄漏巡检接口阀门焊缝和支吊架状态检查', '降压复验整改后再试压和异常处置闭合', '记录签认试压报告影像资料和监理见证归档'],
  '05-08-06-P01': ['供热管网调试分区热源边界和用户侧接口确认', '热力入口阀组仪表过滤器和旁通状态复核', '循环冲洗排污路径水质浊度和流速要求确认', '平衡阀设定支路编号和初始开度记录', '温压测点供回水温度压力和流量采集计划确认', '移交签认调试方案交底和运行参数台账建立'],
  '05-09-05-P08': ['饮用水系统冲洗消毒范围和药剂投加记录核对', '水质检测项目机构资质和检测报告回收复核', '采样点位末端代表性和编号台账确认', '余氯记录冲洗后余氯值和放水时间归集', '卫生报告结论异常指标和整改复测资料核验', '资料移交卫生验收文件运行边界和维护要求签认'],
  '06-03-04-P02': ['防排烟风机耐温证明和型式检验资料核验', '铭牌参数风量风压功率耐温等级和设计一致性复核', '风机方向进出口方向软接和止回装置检查', '减振基础地脚螺栓减振器和防火隔振措施复查', '电源接线相序接地和控制箱接口核对', '试运记录转向振动噪声电流和防排烟联动资料归档'],
  '06-11-08-P01': ['冷热水系统分区边界阀门状态和调试范围确认', '冲洗排污路径过滤器清理和水质要求复核', '水压试验分段压力表校验和稳压观察计划确认', '流量平衡支路测点平衡阀初始开度记录', '温差测点供回水温度和设备运行工况确认', '调试签认方案交底测试记录和问题销项台账建立'],
  '07-01-01-P09': ['室外箱变基础型钢水平度接地和防腐复核', '变压器器身检查外观附件油位和干燥状态核验', '接地连续箱体门扇外壳和基础接地跨接测试', '绝缘测试高低压绕组电缆和二次回路记录归集', '冲击合闸空载运行温升声响和保护动作观察', '交接资料试验报告送电记录和运维边界签认'],
  '07-06-06-P07': ['备用电源电缆放缆路径桥架管沟和防火分区复核', '牵引张力牵引方式滑轮布置和人员分工确认', '弯曲半径转弯段保护和电缆外护套检查', '电缆挂牌回路编号起终点和相序标识核对', '绝缘测试耐压试验和接地连续性记录归集', '验收签认隐蔽记录试验报告和备用电源接口移交'],
  '01-01-06-P04': ['注浆浆液配合比试验报告和材料批次核验', '水灰比外加剂掺量和搅拌时间现场确认', '注浆压力分级控制和压力表校验证书复核', '试注记录孔号深度返浆状态和异常处置归集', '流量计量注浆量终压值和补浆要求确认', '参数签认试注成果和批量注浆放行'],
  '01-01-08-P04': ['试桩编号桩位代表性和施工设备状态复核', '桩机参数钻速电流喷浆量和搅拌深度确认', '成桩电流电压泥浆或浆液供应过程记录', '提升速度下沉速度和复搅遍数现场校核', '成桩质量取芯或标贯检测结果复核', '参数签认试桩成果和大面积施工放行'],
  '01-01-09-P04': ['旋喷试喷区位置地层代表性和孔位复核', '喷射压力气压水压和压力表校验确认', '提升速度旋转速度和分段喷射参数记录', '旋喷半径冒浆状态和成桩直径验证', '水泥掺量浆液比重和实际耗浆量核对', '参数签认试喷成果和旋喷作业放行'],
  '01-01-10-P04': ['水泥土搅拌试桩位置和桩号范围确认', '搅拌参数下沉提升速度和搅拌遍数复核', '喷浆量水泥掺量浆液比重和计量记录核对', '复搅深度桩端标高和搭接宽度检查', '成桩检测取芯强度或轻便触探结果复核', '参数签认试桩成果和批量施工放行'],
  '01-01-11-P04': ['振冲试桩布置桩距桩长和试验区边界确认', '振冲电流水压和振冲器工作状态复核', '填料量级配粒径和分段加料记录核对', '密实电流留振时间和成孔回填过程控制', '地基检测标贯或动力触探结果复核', '参数签认试桩成果和振冲施工放行'],
  '01-01-12-P04': ['CFG桩混合料配合比和原材批次复核', '坍落度扩展度和入泵工作性现场确认', '泵送压力泵量和输送管路通畅性检查', '试成桩钻进提钻和连续泵送过程记录', '充盈系数桩顶标高和混合料用量核算', '参数签认试成桩成果和批量施工放行'],
  '01-01-13-P04': ['试桩参数桩型设备和施工控制标准确认', '锤击能量或静压设备压力标定复核', '贯入度终压稳压时间和桩长过程记录', '终压值桩顶标高和异常终桩条件复核', '承载力验证检测计划和试验结果核验', '参数签认试桩成果和工程桩施工放行'],
  '01-02-02-P06': ['基础混凝土养护覆盖范围和保湿措施检查', '温湿记录养护龄期和环境条件台账归集', '试块留置组数部位编号和送检计划核对', '同条件养护试块位置保护和累计温度记录', '强度报告回收设计强度和实体质量复核', '放行签认养护强度条件和下道工序移交'],
  '01-02-03-P02': ['筏板垫层基底清理浮土积水和扰动处理检查', '标高控制桩垫层边线和厚度控制点复核', '垫层厚度灰饼标筋和模板边界确认', '混凝土浇筑坍落度铺摊振捣和连续性记录', '表面收平压光坡向和防水基层平整度检查', '隐蔽签认垫层验收和防水作业面移交'],
  '01-02-03-P08': ['筏板箱型基础养护覆盖保温保湿措施检查', '测温记录中心表面温差和降温速率归集', '试块留置标养同条件和抗渗试块编号核对', '同条件养护试块保护累计温度和送检计划确认', '裂缝检查表面收缩温度裂缝和渗漏风险复查', '放行签认强度温控资料和后续工序移交'],
  '01-02-04-P04': ['杯口模板尺寸标高和柱脚基础成型边界复核', '柱脚预埋锚栓套管定位固定和丝扣保护检查', '混凝土坍落度入模温度和试块留置记录', '分层浇筑振捣密实杯口边角和锚栓周边控制', '养护覆盖保湿保温和成品保护措施检查', '浇筑记录旁站影像偏差整改和拆模条件确认'],
  '01-02-05-P04': ['柱脚模板轴线标高截面尺寸和加固体系复核', '钢筋预埋锚栓预埋件位置固定和隐蔽检查', '混凝土浇筑坍落度入模温度和连续浇筑记录', '振捣密实柱脚边角预埋件周边和冷缝风险控制', '养护覆盖保湿保温和成品保护措施检查', '隐蔽记录浇筑旁站试块资料和交接放行签认'],
  '01-01-01-P04': ['素土灰土虚铺厚度和含水率复核', '分层摊铺整平和灰土拌合均匀性检查', '压实遍数夯压轨迹和边角补夯记录', '压实系数取样检测和不合格区翻拌复压', '分区标高复测和隐蔽验收放行'],
  '01-01-02-P04': ['砂石级配含泥量和铺填厚度复核', '分层摊铺洒水振实和边角补振记录', '压实遍数沉降量和表面平整度检查', '环刀或灌砂检测压实系数和承载力复核', '分区验收问题整改和上层施工放行'],
  '01-01-03-P04': ['土工合成材料规格幅宽强度和批次复验', '基层平整度尖锐物清理和铺设方向确认', '搭接宽度缝合间距锚固沟和张拉平顺检查', '破损污染褶皱标识修补和隐蔽影像记录', '上层填料摊铺保护厚度和验收放行'],
  '01-01-07-P04': ['沉降板孔压计测斜管点位复核和保护措施确认', '监测基准点联测初始高程和孔压初值采集', '传感器埋设深度回填密实和线缆保护检查', '自动采集频率报警阈值和人工复测计划确认', '初始值报告签认和加载预压放行'],
  '09-01-01-P04': ['保温板排版错缝和洞口翻包复核', '粘结面积抽查和满粘率记录', '锚栓数量深度和边距复核', '锚栓拉拔试验和不合格点整改'],
  '09-01-01-P05': ['防火隔离带A级材料批次复验', '隔离带宽度厚度和连续性复核', '隔离带与保温板错缝搭接施工', '隔离带隐蔽验收和影像记录'],
  '09-01-01-P07': ['门窗洞口女儿墙和挑板热桥节点清单复核', '热桥节点保温翻包和附加网施工', '节点影像留痕和隐蔽记录签认', '热桥缺陷整改复查'],
  '09-01-01-P08': ['钻芯取样位置和抽样比例确认', '保温层厚度粘结面积和芯样完整性记录', '红外热工缺陷或拉拔问题定位', '检测报告缺陷闭合和节能验收放行'],
  '09-01-02-P02': ['幕墙型材隔热条批次复验', '中空玻璃Low-E膜面和露点资料核验', '保温岩棉燃烧性能和密度复核', '材料复验报告编号归档'],
  '09-01-02-P03': ['立柱横梁热桥隔断节点清单复核', '隔热垫块和断热连接件安装检查', '连接螺栓防冷桥垫片复核', '热桥节点隐蔽影像记录'],
  '09-01-02-P06': ['层间防火封堵材料批次和耐火等级核验', '防火岩棉填塞密实度检查', '镀锌钢板托板和防火密封胶施工', '层间封堵隐蔽验收记录'],
  '09-01-02-P07': ['幕墙传热系数报告和计算书复核', '气密水密抗风压性能报告核验', '节能材料复验报告完整性检查', '性能资料缺项闭合清单'],
  '09-01-02-P09': ['幕墙节能验收范围和资料清单核对', '热桥封堵气密检测问题销项复核', '节能验收结论签认', '后续运维清洁维护边界移交'],
  '09-01-03-P02': ['门窗型材隔热条批次复验', 'Low-E中空玻璃膜面和中空层复核', '玻璃露点遮阳系数和传热资料核验', '型材玻璃复验报告编号归档'],
  '09-01-03-P03': ['门窗节能性能计算书复核', '气密水密抗风压三性报告核验', '整窗传热系数和遮阳系数资料核对', '节能性能资料缺项闭合清单'],
  '09-01-03-P04': ['副框固定片间距和锚固点复核', '主框安装垂直度水平度复测', '洞口保温断热垫片和连接节点检查', '框体安装隐蔽验收记录'],
  '09-01-03-P05': ['发泡剂连续饱满度和切割面检查', '密封胶基层清洁和打胶宽度复核', '室内外密封胶连续性检查', '塞缝渗漏风险点整改记录'],
  '09-01-03-P07': ['气密水密现场检测抽检位置确认', '检测设备压力差和喷淋条件核验', '开启缝和拼樘缝漏点定位', '检测报告和复测闭合记录'],
  '09-01-03-P08': ['门窗保护膜和玻璃划伤检查', '排水孔畅通和五金保护复核', '成品污染碰损问题标识整改', '门窗成品保护交接记录'],
  '09-01-03-P09': ['门窗节能验收资料清单核对', '气密水密检测报告归集和复验报告归档', '节能缺陷销项复核', '门窗维护清洁和保修边界移交'],
  '09-01-04-P06': ['女儿墙泛水和出屋面管根保温节点复核', '屋面热桥部位附加保温和翻包施工', '排气道落水口周边保温收口检查', '节点隐蔽影像和厚度抽查记录', '热桥缺陷整改复查和节能验收放行'],
  '09-02-01-P03': ['热计量表具规格口径和流向复核', '直管段长度和安装位置确认', '计量封印编号和铅封记录', '远传通讯采集和参数校准记录'],
  '09-02-01-P04': ['水力平衡阀分区和支路编号复核', '平衡阀预设值和开度记录', '支路流量测点和压差接口确认', '阀门挂牌和调试前状态签认'],
  '09-02-01-P05': ['供暖管网分区隔离和冲洗方案确认', '冲洗流速浊度和排污口记录', '试压压力表校验和稳压观察', '漏点整改复测和试压记录闭合'],
  '09-02-01-P06': ['供暖管道保温厚度和材料燃烧性能复核', '弯头阀门法兰保温收口施工', '保温接缝搭接和防潮层检查', '保温隐蔽验收和破损修补记录'],
  '09-02-01-P07': ['热计量数据采集和户用分区对账', '平衡阀开度复核和支路流量复测', '供回水温差和室温达标记录', '供暖节能调试报告闭合'],
  '09-02-01-P08': ['供暖节能验收资料清单核对', '计量封印和阀门预设值移交复核', '温差流量调试问题销项', '节能验收签认和运维台账移交'],
  '09-02-03-P01': ['COP/IPLV能效等级证书和铭牌复核', '冷热源设备容量边界和台数配置核对', '厂家性能曲线和检测报告归档', '能效资料缺项补正和验收放行'],
  '09-02-03-P02': ['冷水机组热泵锅炉效率参数复核', '制冷制热容量和设计负荷边界确认', '冷却水冷冻水接口条件检查', '效率资料偏差清单闭合'],
  '09-02-03-P03': ['一次二次泵变频器规格和控制柜编号复核', '阀组流向压力表温度计安装检查', '热量表流量计直管段和通讯地址确认', '计量点挂牌和调试前状态签认'],
  '09-02-03-P04': ['水力平衡分区和末端支路清单确认', '平衡阀预设值和测压接口复核', '调试仪表校验证书和测点布置检查', '水力平衡调试准备条件签认'],
  '09-02-03-P05': ['供回水温差测点和流量计编号复核', '热量表累计值和瞬时流量采集校验', '温差异常支路排查和阀位调整记录', '流量温差复测和数据归档'],
  '09-02-03-P06': ['冷热源群控策略版本和控制点表冻结', 'BMS能耗采集网关和协议映射复核', '启停联锁和变频调节场景测试', '能耗曲线缺口排查和联调记录闭合'],
  '09-02-03-P07': ['部分负荷测试工况和负荷率边界确认', '机组电耗冷热量和流量温差同步采集', 'IPLV或部分负荷能效曲线复核', '低效工况原因分析和参数优化记录'],
  '09-02-03-P08': ['冷热源节能调试报告资料清单核对', '群控BMS能耗和水力平衡记录归集', '功能复测问题销项和复测记录', '冷热源节能参数基线和运维交接签认'],
  '09-02-04-P06': ['管道保温材料燃烧性能和导热系数复核', '保温厚度和管径分区样板确认', '弯头阀门法兰可拆卸保温盒安装', '支吊架冷桥和穿墙套管保温补强', '防潮层搭接密封和破损点修补记录'],
  '09-03-01-P02': ['电缆母线截面规格和合格证复核', '配电柜变压器能效等级和损耗资料核验', '母线电缆连接端子温升资料检查', '设备复验报告编号归档和缺项闭合'],
  '09-03-01-P05': ['绝缘电阻测试仪和接地测试仪校验', '回路分区绝缘电阻测试记录', 'PE接地连续性和等电位跨接复测', '不合格回路整改复测和记录闭合'],
  '09-03-01-P06': ['三相负荷清单和计量回路编号复核', '相序相电流现场测量和记录', '三相不平衡率计算和超限回路定位', '回路负荷调整和再测签认'],
  '09-03-01-P07': ['电能表CT变比极性和接线复核', '通讯地址采集频率和网关映射配置', '计量数据上传和平台对账', '偏差校准封印编号和运维移交'],
  '09-03-01-P08': ['配电节能验收资料清单核对', '三相平衡绝缘接地和计量报告归集', '现场抽查问题销项和复测记录', '电能计量运维台账和节能验收签认'],
  '09-05-01-P04': ['换热回路分区试压方案和压力表校验', '保压时间压降和接口渗漏检查', '热响应测试设备接入和初始地温记录', '热响应测试曲线和导热系数报告复核', '试压热响应问题整改闭合'],
  '09-05-01-P06': ['循环水冲洗分区和排污路径确认', '充水排气和系统高点排气检查', '试压稳压和过滤器清洗记录', '水质处理药剂投加和电导率浊度检测', '冲洗试压水质资料闭合'],
  '09-05-01-P07': ['地源侧和负荷侧流量测点复核', '分支回路平衡阀开度和流量记录', '换热温差和循环泵频率趋势采集', '换热能力偏差分析和参数修正', '流量平衡复测和调试报告签认'],
  '09-05-01-P08': ['COP能效测试工况和计量边界确认', '机组电耗热量和流量温差同步采集', '部分负荷运行参数和能效曲线复核', '节能验收问题销项和复测记录', '运维参数台账和能效报告移交'],
  '08-18-03-P06': ['温湿度传感器点位和动环点表复核', '漏水检测绳布线路径和保护范围确认', '传感器接线地址编码和平台映射', '温湿度报警阈值和漏水告警模拟测试', '动环报警记录复测和运维交接'],
  '08-04-05-P01': ['信息网络拓扑和VLAN IP地址表冻结', '核心汇聚接入链路冗余测试清单会签', '网络割接窗口和值守回退方案确认', '端口安全路由策略和联通性测试准备', '测试放行记录和问题跟踪台账建立'],
  '08-14-08-P01': ['BMS DDC网关点表和设备清单冻结', 'BACnet Modbus协议映射和I/O回路地址核对', '趋势记录报警阈值和权限策略会签', '单点联动调试脚本和回退方案确认', 'BMS调试放行记录和问题跟踪台账建立'],
  '08-18-02-P01': ['机房等电位范围和接地汇流排布置复核', '机柜桥架设备跨接点位清单冻结', '浪涌保护器接地干线和防雷界面核对', '接地电阻导通测试见证计划会签', '机房接地放行记录和缺陷跟踪台账建立'],
  '08-18-04-P04': ['空调冷凝水接驳点位和坡向复核', '冷凝水管坡度实测和支吊架间距检查', '末端存水弯和设备排水接口防倒灌确认', '冷凝水试排水和结露风险记录'],
  '08-18-04-P06': ['地漏位置标高和机柜区避让复核', '存水弯水封高度和检修空间检查', '地漏防臭密封和清扫口安装复核', '蓄水排水功能测试记录'],
  '08-18-04-P07': ['漏水报警探头布点和保护范围复核', '探头线缆地址编码和动环接口接入', '模拟漏水报警和告警级别校验', '动环平台报警记录和复测闭合'],
  '08-18-04-P08': ['给水试压分区隔离和压力表校验', '升压稳压观察和接口渗漏检查', '冲洗流速水质和排放路径确认', '试压冲洗记录签认和缺陷闭合'],
  '08-18-04-P09': ['排水管段封堵和灌水高度确认', '满水观察渗漏检查', '通球球径路径和排出确认', '灌水通球问题整改复测记录'],
  '08-18-04-P10': ['管道保温厚度和防潮层材料复核', '阀门法兰和穿墙套管保温收口施工', '防结露薄弱点红外或目测复查', '穿墙封堵影像和隐蔽验收记录'],
  '08-18-04-P12': ['给水阀门启闭和流向标识复核', '排水地漏冷凝水试排联动检查', '漏水报警动环联动和运维响应记录', '给排水运维台账和备件边界移交'],
  '01-02-01-P03': ['资料核验', '外观数量检查', '见证取样或验收记录', '验收整改记录'],
  '01-02-01-P04': ['材料机具和作业面复核', '砌筑浇筑施工', '偏差隐蔽检查', '验收整改记录'],
  '01-02-03-P06': ['筏板或箱型基础浇筑分区和施工缝后浇带复核', '混凝土坍落度入模温度和泵送连续性检查', '分层分段浇筑和振捣密实控制', '后浇带施工缝止水节点和冷缝风险巡查', '浇筑旁站影像试块留置和异常处置记录', '浇筑完成标高复测和养护交接签认'],
  '01-02-03-P07': ['大体积混凝土测温点布置和仪器校准复核', '入模温度中心温度和表面温度连续采集', '内表温差降温速率和保温覆盖状态巡查', '异常温差裂缝风险预警和降温保温措施调整', '测温曲线日报和养护条件闭合记录', '温控总结报告裂缝检查和后续工序放行'],
  '01-02-14-P06': ['锚孔清孔质量和孔深孔径复核', '浆液配合比水灰比和外加剂批次确认', '注浆压力流量注浆量和返浆状态记录', '二次补浆孔口封堵和外露杆体保护检查', '注浆试块留置和异常孔处理闭合', '锚杆注浆隐蔽验收和抗拔试验清单移交'],
  '01-02-15-P05': ['沉井沉箱轴线标高和垂直度监测基线复核', '刃脚阻力土仓水位和突沉风险巡查', '分仓取土下沉速度和高差控制记录', '偏位倾斜原因分析和纠偏措施执行', '下沉监测曲线复核和异常处置闭合', '到位标高复测封底施工条件签认'],
  '01-02-08-P03': ['钻机平台承载和桩位中心复核', '护筒垂直度和泥浆循环条件确认', '成孔钻进进尺孔壁稳定和地层记录', '终孔孔深孔径垂直度实测', '成孔异常塌孔缩径处置记录'],
  '01-02-08-P05': ['一次清孔设备和泥浆指标复核', '孔底沉渣厚度测量', '泥浆比重黏度含砂率复测', '清孔达标记录和钢筋笼下放放行'],
  '01-02-08-P07': ['导管节段水密试验和接头检查', '导管下放埋深和孔底距离复核', '二次清孔沉渣和泥浆指标复测', '灌注前导管平台和首灌条件签认'],
  '01-02-08-P08': ['首灌量和导管埋深控制', '水下混凝土坍落度和试块留置', '连续灌注混凝土面高程测量', '充盈系数和超灌高度记录', '堵管断桩风险处置和影像留存'],
  '01-02-08-P10': ['检测方案桩号和龄期条件核对', '低应变或声测管检测现场实施', '异常波形或缺陷桩复核判定', '检测报告问题清单和复测闭合'],
  '01-02-08-P11': ['桩位偏差和桩顶标高复测', '检测报告混凝土试块和灌注记录核验', '桩基子分部验收资料组卷', '验收问题整改销项和移交签认'],
  '01-02-10-P02': ['钻机型号钻杆长度和垂直度校验', '场地承载垫板和行走路线复核', '桩位中心钻头对位和护筒或导向条件确认', '钻机就位验收和开钻记录签认'],
  '01-02-10-P03': ['钻进电流钻压和进尺速度记录', '成孔垂直度和孔深过程复核', '软硬夹层或塌孔缩径风险处置', '终孔前孔深和钻渣地层核验'],
  '01-02-10-P05': ['混凝土坍落度和泵送管路通畅性检查', '泵压泵量和提钻同步控制', '压灌连续性和断料堵管风险处置', '桩顶超灌高度和混凝土试块留置'],
  '01-02-10-P06': ['提钻速度控制参数和泵压记录核对', '充盈系数分桩统计和异常桩标识', '缩径断桩风险点复核', '压灌参数闭合和旁站记录归档'],
  '01-02-10-P07': ['钢筋笼规格长度和吊点复核', '后插钢筋笼垂直度和插入深度控制', '振动或辅助插笼过程防偏移检查', '笼顶标高定位和隐蔽记录签认'],
  '01-02-10-P09': ['检测桩号龄期和桩顶处理条件核对', '低应变或静载检测配合实施', '异常桩复测和缺陷判定', '检测报告问题清单和闭合记录'],
  '01-02-10-P10': ['长螺旋压灌桩施工记录和泵压曲线核验', '试块报告完整性检测和桩位偏差资料复核', '异常桩处理意见和复测资料归集', '桩基验收签认和后续承台界面移交'],
  '01-02-12-P01': ['钢桩规格材质炉批号和合格证核验', '桩身外观变形焊缝和端板检查', '防腐层厚度破损和补口材料复核', '进场验收记录和不合格桩隔离'],
  '01-02-12-P02': ['桩位控制点和桩尖标高复核', '导向架垂直度刚度和限位装置检查', '吊点吊具和作业半径确认', '导向架验收和沉桩放行记录'],
  '01-02-12-P03': ['试桩参数和终压贯入控制标准确认', '首件沉桩过程垂直度和贯入记录', '接桩焊接或法兰连接样板验收', '试桩成果复核和施工参数冻结'],
  '01-02-12-P05': ['沉桩锤击能量或压桩力记录', '桩身垂直度贯入度和标高过程控制', '拒打偏位或断桩风险处置', '沉桩施工记录和旁站资料闭合'],
  '01-02-12-P06': ['接桩接口清理坡口和错边量复核', '焊材烘干焊接参数或法兰螺栓扭矩控制', '焊缝外观探伤或法兰防松检查', '接桩防腐补口和隐蔽验收记录'],
  '01-02-12-P07': ['终压力贯入度和稳压时间记录复核', '桩尖标高桩长和入土深度核对', '异常终桩条件技术复核', '终桩参数签认和检测清单锁定'],
  '01-02-12-P10': ['承载力或完整性检测方案和桩号核对', '静载低应变或高应变检测现场配合', '检测异常桩复核和处理意见闭合', '检测报告归档和验收放行'],
  '01-07-01-P03': ['穿墙管预埋件坐标和套管坡向复核', '止水环满焊和防腐补口检查', '管根周边混凝土密实和封堵界面处理', '穿墙节点隐蔽验收记录闭合'],
  '01-07-01-P04': ['防水混凝土浇筑分区和施工缝留设复核', '坍落度入模温度和抗渗试块留置', '分层浇筑振捣密实和冷缝风险控制', '外墙对拉螺杆止水节点封堵', '浇筑记录和异常问题闭合'],
  '01-07-01-P07': ['主体结构防水验收范围和资料清单核对', '抗渗报告隐蔽记录和渗漏整改资料复核', '现场抽查节点和渗漏复验', '验收结论签认和后续防水界面移交'],
  '01-07-02-P01': ['施工缝界面松散混凝土剔凿', '界面浮浆杂物清理和冲洗', '基层含水和粗糙度复核', '凿毛清理隐蔽验收记录'],
  '01-07-02-P02': ['止水材料规格批次和复验资料核对', '止水钢板居中定位和搭接焊接', '膨胀止水条粘贴固定和防水保护', '止水节点隐蔽验收和偏差整改'],
  '01-07-02-P04': ['穿墙管群坐标和止水环焊缝复核', '管根基层清理和附加防水层施工', '密封膏嵌填压实和收头处理', '穿墙管节点隐蔽复查和渗漏复测'],
  '01-07-02-P05': ['变形缝缝宽和基层平整度复核', '中埋式或外贴式止水带定位固定', '填缝材料分层嵌填和盖板压条安装', '变形缝节点防水复查和成品保护'],
  '01-07-02-P07': ['细部构造防水验收部位清单核对', '隐蔽记录材料复验和试验报告复核', '现场节点抽查和缺陷销项', '验收签认和回填前保护移交'],
  '01-07-04-P04': ['盲沟排水板和排水管通畅性分区检查', '集水坑液位控制和排水泵启停功能测试', '倒灌风险止回措施和溢流路径复核', '功能试排水流量水位和排放路径记录', '堵塞渗漏问题定位整改和复测闭合', '地下排水功能测试报告和验收签认'],
  '06-08-06-P04': ['基层材料和排版样板复核', '安装铺贴或涂装施工', '节点收口和观感实测检查', '整改闭合和成品保护', '专项验收移交记录'],
  '06-08-06-P05': ['基层材料和排版样板复核', '安装铺贴或涂装施工', '节点收口和观感实测检查', '整改闭合和成品保护', '专项验收移交记录'],
  '02-04-01-P07': ['拼装节点检测报告和偏差清单核对', '分段合拢尺寸复测和整改闭合', '吊装单元编号标识和临时加固复核', '拼装验收记录和影像资料归档', '吊装移交清单会签和作业面交接'],
  '02-04-02-P07': ['安装偏差复测报告和节点质量资料核对', '临时支撑卸载记录和变形复测闭合', '支座节点连接验收和整改销项', '空间钢结构安装验收资料归档', '后续工序移交清单会签和成品保护交接'],
  '02-01-06-P08': ['构件编号二维码和生产批次一致性核对', '出厂合格证隐蔽验收资料和检测报告随件复核', '运输堆放方向重心标识和吊点标识检查', '构件追溯台账上传和缺项问题闭合'],
  '02-01-06-P11': ['吊装平面布置吊装半径和机械站位复核', '构件吊装顺序和楼层分区作业窗口确认', '轴线标高控制点和搁置面清理复测', '吊具吊点试吊和临边防护条件签认', '班组安全技术交底和应急联络记录闭合'],
  '02-01-06-P17': ['外挑构件吊装顺序和作业面边线复核', '预制阳台连接节点钢筋套筒和搁置长度复测', '空调板支座标高锚固件和排水坡向复核', '飘窗定位轴线标高和临边防护确认', '临时支撑和防坠措施安装复核', '节点封缝成品保护移交和验收记录'],
  '02-01-06-P22': ['接缝基层清理和缝宽复测', '防水密封材料批次和相容性复核', '接缝密封打胶和压实修整', '节点防火封堵分层填塞', '淋水或隐蔽复查和整改移交'],
  '02-01-06-P23': ['实体检测点位和安装偏差清单确认', '垂直度平整度和连接节点实测', '套筒灌浆饱满度和结构实体检测', '偏差问题分区整改复测', '检测报告和装配率资料归档'],
  '02-01-06-P24': ['装配率计算口径和构件清单版本核对', '套筒灌浆接缝防水实体检测资料汇总复核', '构件二维码追溯台账和安装位置映射核验', '偏差整改闭合和专项验收问题清单销项', '装配式结构移交资料签认和运维追溯归档'],
  '03-12-04-P03': ['护栏控制线和完成面标高复核', '立柱孔位放样和边距复测', '钻孔深度清孔和锚固件植入', '立柱垂直度复测和隐蔽记录签认'],
  '03-12-04-P04': ['栏杆或玻璃栏板规格排布复核', '连接件垫片和防坠措施安装', '栏板就位固定和缝隙调整', '抗冲击节点检查和成品保护移交'],
  '03-12-04-P05': ['扶手转角端头样板和连接件复核', '转角端头切割打磨和拼装', '连接件紧固防松和收口处理', '扶手连续性手感和观感复查'],
  '04-01-02-P06': ['隔汽层破损范围标识和基层干燥复核', '补丁材料裁切和搭接宽度确认', '破损部位密封修补和压实排气', '完整性复查和隐蔽验收记录'],
  '05-01-03-P06': ['消火栓箱编号和安装位置复核', '水枪水带规格数量和箱内配置核对', '消火栓按钮接线和启泵反馈接口确认', '箱门开启角度和标识复查'],
  '05-01-03-P07': ['水泵接合器接口位置和系统分区复核', '止回阀安全阀倒流防护和阀组安装', '接口标识保护设施和车辆接近条件检查', '接合器接口验收记录签认'],
  '05-01-03-P09': ['最不利点试射位置和压力表校验确认', '试射压力充实水柱和水带展开记录', '消火栓按钮启泵反馈和泵房联动测试', '试射联动问题整改复测'],
  '05-01-03-P10': ['消防检测问题清单和责任分工确认', '消火栓系统整改销项和复测记录核验', '标识竣工图检测报告和联动记录复核', '验收签认和运维资料移交'],
  '05-01-04-P05': ['末端试水装置位置和排水路径复核', '试水阀压力表排水漏斗和地漏接口安装', '末端流量压力试水记录和排水观察', '末端试水问题整改复测'],
  '05-01-04-P06': ['喷头型号温级和装饰面标高复核', '喷头间距遮挡和梁下空间检查', '喷头安装保护帽拆除和方向调整', '喷头安装抽检记录签认'],
  '05-01-04-P09': ['报警阀组压力开关和水力警铃联动条件确认', '末端试水触发水流指示器和压力开关动作测试', '喷淋泵启泵反馈和消防控制室信号核验', '联动喷水试验问题整改复测'],
  '05-01-04-P10': ['喷淋检测问题清单和分区销项确认', '报警阀末端试水喷头抽查和资料复核', '联动检测整改闭合和复测报告核验', '喷淋系统验收签认和运维移交'],
  '05-05-07-P05': ['热风机组接线图和回路编号复核', '温控器传感器点位和联动启停逻辑确认', '电气端子压接绝缘和接地检查', '温控启停联动测试和记录签认'],
  '05-05-07-P06': ['热风机盘管风量和供回水温差实测', '过滤器风阀开度和送风温度连续记录', '噪声振动和运行电流复测', '运行异常问题整改和复测签认'],
  '05-05-07-P07': ['热风供暖运行参数和温控设定移交', '缺陷整改清单复测和关闭确认', '过滤器维护检修空间和备品资料核对', '运行验收签认和资料归档'],
  '05-05-08-P03': ['热量表直管段长度流向和口径复核', '过滤器阀组供回水配对界面确认', '热量表安装和封印编号记录', '通讯采集和计量数据复核'],
  '05-05-08-P04': ['温控阀执行器型号和控制回路复核', '执行器行程开闭方向和取源部件安装', '阀位反馈和温控联动测试', '开闭方向问题整改复测'],
  '05-05-08-P05': ['采集器通讯地址和房间分区台账核对', '远传平台点表映射和采集频率配置', '计量数据上传和异常离线测试', '平台点表问题整改闭合'],
  '05-05-08-P06': ['计量封印编号和校准证书归档核验', '分户分区计量数据和现场读数比对', '参数标定和偏差调整记录签认', '计量数据比对问题复测'],
  '05-05-08-P07': ['热计量调控装置验收范围和资料清单确认', '远传平台数据报表和封印台账复核', '分户分区计量移交和运维权限确认', '验收签认和资料归档'],
  '06-07-07-P04': ['洁净风管接口材质和密封面清洁复核', '密封垫胶缝压实和漏风隐患处理', '压差保护取压管和保护装置安装', '洁净压差初测和报警阈值复核', '接口密封复查和洁净保护移交'],
  '06-07-07-P05': ['电源介质管路和排水接口点位复核', '洁净区穿越封堵和套管保护处理', '电源介质管路连接和排水坡度确认', '泄漏排水通畅和洁净保护检查', '接口复测记录和洁净移交签认'],
  '06-07-08-P01': ['过滤器批次合格证和检漏报告核验', '规格效率等级和洁净等级匹配复核', '运输包装和存放状态检查', '安装放行记录签认'],
  '06-07-08-P02': ['洁净室末端清洁状态复核', '静压箱内壁清洁和封口保护检查', '安装工具擦拭和人员洁净服确认', '安装面污染隔离和二次清洁放行', '安装面交接记录签认'],
  '06-07-08-P03': ['过滤器外框密封垫完整性检查', '滤纸破损和边框变形复核', '压紧件数量位置和预紧状态确认', '缺陷过滤器隔离更换记录'],
  '06-07-08-P04': ['高效过滤器安装方向和气流箭头核对', '过滤器就位均匀压紧', '边框密封压差和旁漏风险检查', '安装编号和房间点位记录'],
  '06-07-08-P05': ['FFU电源回路和控制地址复核', '风机过滤单元接线和接地检查', '风机转向风速和噪声初测', '异常单元更换复测记录'],
  '06-07-08-P06': ['PAO发生器和光度计校准确认', '扫描速度探头距离和测点路径执行', '泄漏点编号标识和封堵更换整改', 'PAO扫描检漏报告复核'],
  '06-07-08-P07': ['过滤器压差标签和初始阻力记录', '房间洁净度复测和压差趋势核对', '验收记录检测报告和点位台账复核', '高效过滤器末端验收移交签认'],
  '06-07-11-P01': ['净化空调调试房间静态动态状态复核', '测点布置和风量平衡测试计划会签', '压差梯度温湿度洁净度目标冻结', '见证测试窗口和人员仪器条件确认', '调试放行记录和偏差跟踪台账建立'],
  '06-08-07-P01': ['防护单元边界和通风模式清单复核', '清洁滤毒隔绝通风转换脚本会签', '密闭阀过滤吸收器和风机点表核对', '压差测点专项验收见证点确认', '人防通风调试放行记录和问题台账建立'],
  '06-02-07-P04': ['卫生间竖井接口标高和防串味路径复核', '止回阀方向密封圈和检修空间确认', '支管接入竖井和止回阀固定安装', '接口气密串味复测和影像记录签认'],
  '06-15-05-P05': ['液位计温度测点布置图复核', '罐体开孔套管和测点标高确认', '液位计温度传感器安装接线', '分层测点信号校验和趋势记录'],
  '06-17-04-P04': ['溴化锂系统抽真空记录复核', '阀门开闭状态和隔离边界挂牌', '真空保持和泄漏趋势检查', '阀位确认记录和加灌放行签认'],
  '08-09-01-P03': ['消防强切线路路径和独立管槽边界复核', '管槽预留定位开孔和防火分隔确认', '独立管槽敷设固定和接地跨接', '强切回路隔离标识和穿越封堵检查', '隐蔽记录和消防联动界面移交'],
  '08-05-05-P02': ['永久链路测试仪表校准和测试标准选择', '铜缆线序近端串扰回波损耗和衰减测试', '链路长度传播时延和余量参数复核', '不合格永久链路定位标记和整改记录'],
  '08-05-05-P03': ['信道测试跳线型号和端到端路径确认', '机柜配线架信息插座贯通测试', '跳线接触质量和端口映射复核', '信道性能记录归档和异常链路标识'],
  '08-05-05-P04': ['光纤端面清洁和极性复核', 'OTDR长度损耗事件点测试', '光功率和插入损耗抽测', '熔接点尾纤盘留和异常事件整改'],
  '08-05-05-P05': ['失败链路端口房间和配线架定位', '端接压接熔接或跳线路由整改', '整改链路复测和参数对比', '问题链路闭合签认和影像留存'],
  '08-05-05-P06': ['端口清单房间编号和竣工图三方核对', '测试报告编号和链路标签一致性复核', '电子测试文件导出和备份归档', '报告缺项整改和资料移交确认'],
  '08-05-05-P07': ['链路认证抽检比例和抽样点确认', '抽检链路复测和测试文件核验', '认证资料与资产台账交叉复核', '抽检问题销项和验收放行记录'],
  '08-05-05-P08': ['链路或信道测试验收范围确认', '测试报告端口台账和整改闭合资料复核', '现场抽查端口标签和连通性', '验收签认和运维资料移交'],
  '08-13-02-P03': ['应用系统线缆路径和端口编号复核', '线缆牵引敷设和弯曲半径控制', '绑扎整理桥架余量和分隔检查', '链路标签和敷设记录签认'],
  '08-13-02-P08': ['应用系统线缆验收范围和抽检比例确认', '链路通断衰减和端接质量测试', '标签端口台账和竣工图核对', '不合格链路整改复测和验收签认'],
  '08-05-07-P01': ['综合布线端口清单点表和联调边界核对', 'VLAN PoE链路冗余和接入业务测试脚本确认', '机柜配线架信息插座抽测范围和见证点确认', '联调窗口值守人员和回退方案签认', '调试放行记录和问题跟踪台账建立'],
  '08-15-07-P01': ['消防报警调试范围和系统边界确认', '报警回路设备点表和地址编码清单核对', '防排烟卷帘电梯广播切非联动矩阵复核', '单点测试和联动场景见证计划会签', '联动矩阵冻结和调试放行记录签认'],
  '08-16-05-P01': ['安防调试范围和系统边界确认', '摄像门禁报警点表逐项核对', '联动矩阵场景和权限策略复核', '调试脚本与见证测试计划会签', '点表矩阵冻结和调试放行记录'],
  '08-18-05-P03': ['机房机柜承重和冷热通道方向复核', 'MDF/ODF配线架位置和接地铜排确认', '机柜机架找平固定和抗震连接', '理线器光纤配线单元和端口编号安装', '机柜电源接地散热和维护空间复查'],
  '08-18-05-P04': ['机房桥架路由和强弱电间距复核', '铜缆光纤分层敷设和弯曲半径控制', '配线架模块端接和光纤尾纤盘留', '机柜内理线绑扎余量和标签同步', '敷设端接记录和隐蔽资料闭合'],
  '08-18-05-P05': ['光纤熔接机校准和纤芯排序复核', '熔接损耗和保护套管安装记录', 'OTDR长度事件点和回波损耗测试', '跳纤盘留端面清洁和异常点整改'],
  '08-18-05-P06': ['永久链路和信道测试清单确认', '铜缆FLUKE参数和光纤损耗测试', '机房核心端口和业务链路抽测', '失败链路整改复测和报告闭合'],
  '08-18-05-P07': ['机柜端口配线架房间点位映射核对', '标签编号资产台账和竣工图同步', '跳线颜色用途和运维边界标识', '资料缺项整改和电子台账归档'],
  '08-18-05-P08': ['综合布线验收范围和抽检比例确认', '链路认证报告端口台账和竣工图复核', '现场端口抽测和机柜整理检查', '机房布线系统验收签认和运维移交'],
  '08-18-08-P06': ['墙面彩钢板或防火板排版样板复核', '龙骨基层平整度和防火性能资料确认', '板材安装固定和拼缝收口处理', '墙面观感防火节点和成品保护检查'],
  '08-18-08-P09': ['穿墙洞口尺寸和机电管线边界复核', '防火封堵材料批次和耐火等级确认', '分层填塞密实和气密密封处理', '防火完整性气密复查和影像记录'],
  '08-18-07-P01': ['机房消防防护区边界和气体灭火分区复核', '气瓶间泄压口和防护区密闭条件核对', '探测报警放气指示和紧急启停接口清单确认', '空调风阀门禁断电和气体释放联动矩阵会签', '专项检测见证点和调试放行记录签认'],
  '08-18-09-P01': ['屏蔽范围房间边界和性能指标复核', '屏蔽门波导窗滤波器和穿墙接口清单核对', '接地系统搭接电阻和检测标准确认', '施工样板见证点和第三方检测计划签认'],
  '08-18-09-P05': ['穿墙管线屏蔽接口清单和洞口尺寸复核', '滤波器型号方向接地端和额定参数核验', '波导通风电源通信管线分区安装检查', '屏蔽封堵导电衬垫和搭接面清洁处理', '搭接电阻预检和接口泄漏风险标识', '穿墙滤波器安装隐蔽记录和检测前移交'],
  '08-18-09-P08': ['屏蔽效能泄漏点定位和编号标识', '板缝门缝管线接口修补方案确认', '泄漏点导电搭接或密封修补施工', '修补后屏蔽效能复测和问题闭合'],
  '08-18-09-P10': ['屏蔽检测报告和整改闭合资料复核', '屏蔽门波导窗滤波器接口现场抽查', '接地汇流排和搭接电阻复验记录核对', '电磁屏蔽验收签认和运维边界移交'],
  '08-18-10-P01': ['机房联调系统边界和接口清单冻结', 'UPS空调消防安防动环网络调试脚本会签', '断电漏水火警门禁异常回退方案确认', '联调窗口值守人员和应急旁路条件签认', '调试放行记录和问题跟踪台账建立'],
  '08-19-04-P04': ['穿墙套管规格位置和屏蔽边界复核', '套管与屏蔽层导电搭接面清理', '穿墙套管屏蔽封堵和密封压实', '搭接电阻和封堵完整性复测', '隐蔽影像记录和接口移交签认'],
  '08-19-04-P07': ['屏蔽效能复测方案测点和频段确认', '门缝板缝套管接口泄漏点扫描', '泄漏点编号定位和整改措施会签', '整改后屏蔽效能复测和数据比对', '复测报告问题闭合和验收放行签认'],
  '08-19-04-P08': ['屏蔽设施验收范围和资料清单核对', '屏蔽门波导窗套管封堵现场抽查', '接地汇流排搭接电阻和复测报告复核', '屏蔽缺陷整改闭合和验收意见会签', '运维边界标识和专项资料移交'],
  '09-04-01-P04': ['通讯线缆路径和屏蔽接地边界复核', 'RS485和以太网线缆敷设编号', '表具传感器通讯地址和极性校验', '屏蔽接地导通和干扰风险复测', '通讯链路隐蔽记录和点表移交'],
  '09-04-01-P05': ['采集网关设备编号和协议清单复核', 'Modbus BACnet或厂家协议映射配置', '分项能耗点位参数量程和倍率写入', '平台点表通讯在线率和时间同步测试', '网关配置备份和点位移交签认'],
  '09-04-01-P06': ['分项能耗采集链路测试脚本确认', '电水冷热量数据上送和缺失点排查', '异常离线点位线路地址和倍率复核', '连续采集趋势曲线和告警记录校验', '缺失数据整改闭合和联调记录签认'],
  '09-04-01-P07': ['人工抄表样本点和平台曲线区间确认', '现场表读数BMS数据和平台数据比对', '倍率时钟和采集周期偏差分析', '异常曲线修正参数回写和复测', '一致性复核报告和运维点表移交'],
  '09-04-01-P08': ['节能监测验收范围和资料清单核对', '分项能耗报表曲线和离线点清单复核', '异常点整改销项和连续运行记录确认', '平台账号权限报表模板和备份移交', '节能监测验收签认和运维交接'],
  '09-04-02-P01': ['控制策略点表和节能场景清单冻结', '冷热源新风照明分区控制边界复核', '时段启停削峰和温控目标参数会签', '手自动切换权限和回退方案确认', '策略调试放行记录和问题台账建立'],
  '09-04-02-P04': ['单点测试清单和I/O回路地址核对', '输入点状态模拟和输出动作见证测试', '阀门风机照明回路反馈信号核验', '点表回写平台状态和报警记录复核', '单点缺陷整改复测和放行签认'],
  '09-04-02-P05': ['新风量水阀和风机变频联动脚本确认', 'CO2或压差新风量调节曲线测试', '水阀开度供回水温差和流量反馈核验', '风机频率启停联动和节能限值复测', '联动控制缺陷闭合和参数冻结'],
  '09-04-02-P06': ['分区温控时段启停和削峰策略参数复核', '典型房间温度反馈和设定值偏差测试', '节假日时段启停和远程权限验证', '削峰策略触发记录和舒适度影响复核', '控制策略调试报告和参数回写'],
  '09-04-02-P07': ['运行趋势样本周期和偏差阈值确认', '温度能耗设备启停趋势曲线比对', '异常策略触发和手动干预记录核查', '控制参数修正回写和连续运行复测', '趋势偏差闭合报告和运维交接'],
  '09-04-02-P08': ['节能控制策略版本和参数冻结清单核对', '单点联动趋势记录和缺陷销项复核', '控制权限账号报警阈值和回退方案移交', '节能控制验收资料和培训记录确认', '策略冻结验收签认和运维移交'],
  '09-05-02-P03': ['太阳能支架锚固位置和屋面防水层边界复核', '抗风压计算锚栓规格和拉拔见证点确认', '支架锚固压载安装和防水收口施工', '屋面穿孔密封淋水或蓄水复测', '支架锚固防水收口隐蔽验收签认'],
  '09-05-02-P06': ['太阳能管路保温厚度和防冻液浓度复核', '管路保温防潮层搭接和阀门保温盒施工', '防冻液充注排气和伴热回路绝缘测试', '低温保护联动和泄漏点复测', '防冻保温记录闭合和运维移交'],
  '09-05-02-P07': ['循环泵温控传感器点位和接线图核对', '系统试压分区隔离压力表校验和稳压记录', '管路冲洗流速排气和排污路径确认', '温控启停循环泵联动和故障报警测试', '试压冲洗排气记录和缺陷闭合'],
  '09-05-02-P08': ['集热效率测试工况和运行参数采样确认', '供回水温差流量和太阳辐照数据比对', '辅助热源切换和防冻保护运行复核', '节能验收缺陷整改和复测记录闭合', '集热系统运维资料和参数移交签认'],
  '09-05-03-P01': ['光伏组串方案阵列分区和容量边界复核', '组件排布遮挡分析和检修通道确认', '组串极性汇流路径和逆变器接入表冻结', '防雷接地消防检修和屋面荷载条件会签', '光伏施工放行记录和点位台账建立'],
  '09-05-03-P05': ['MC4接头型号批次和压接工具校验', '组串线缆极性标识和端子压接施工', '开路电压短路电流和绝缘电阻测试', '反接虚接过热风险点整改复测', '组串测试记录和汇流箱接入签认'],
  '09-05-03-P07': ['逆变器DC和AC端接回路编号核对', '直流侧绝缘接地和交流相序测试', '防孤岛保护参数和并网限值校验', '逆变器启动停机告警和通讯映射测试', '保护参数记录备份和并网前移交'],
  '09-05-03-P08': ['IV曲线测试抽样组串和气象修正参数确认', '组件组串IV曲线电能质量和逆变器效率测试', '试运行发电量通讯数据和告警记录复核', '低效组串缺陷定位整改和复测闭合', '光伏节能验收报告和运维资料移交'],
  '10-01-03-P02': ['曳引机资料合格证和型式试验证明核验', '机房承重梁基础和吊装通道复核', '吊点吊具作业窗口和防护措施确认', '设备进场吊装条件签认和问题闭合'],
  '03-01-01-P03': ['虚铺厚度和分层边界现场标识复核', '含水率抽测和晾晒洒水调整记录', '压实机具遍数行走路线和搭接宽度检查', '标高平整度和压实系数抽点复测', '分层压实记录和隐蔽验收签认'],
  '03-01-01-P06': ['基层标高平整度和压实指标复核', '表面松散积水污染点清理确认', '养护覆盖洒水或封闭保护措施检查', '上道问题整改闭合和移交界面复测', '基层验收资料和后续施工放行签认'],
  '03-01-02-P01': ['基层油污浮浆松散层清理检查', '凿毛深度粗糙度和边角处理复核', '冲洗吸尘和湿润界面状态确认', '基层清理影像和问题点销项记录', '作业面移交资料和面层施工放行签认'],
  '03-01-02-P03': ['水泥砂石外加剂批次和复验资料核对', '面层试拌配比和施工稠度确认', '塌落扩展时间和现场可操作性检查', '材料留样编号和试块制作记录', '配合比放行记录和班组交底签认'],
  '03-01-02-P06': ['初凝终凝窗口和收光时机确认', '抹面压平顺序和机械人工交接检查', '平整度靠尺和标高抽点复测', '压痕起砂裂纹和边角收口整改', '收光完成影像和养护交接签认'],
  '03-01-03-P01': ['基层空鼓裂缝油污和松散点检查', '平整度偏差标高坡向和方正实测', '超差部位找补打磨和清理复测', '基层含水率和粘结条件确认', '铺贴放行记录和基层移交签认'],
  '03-01-03-P02': ['结合层材料批次配比和有效期核对', '砂浆稠度胶粘剂开放时间确认', '界面剂涂刷范围和厚度检查', '试铺样段粘结饱满度和排版复核', '材料放行记录和铺贴条件签认'],
  '03-01-04-P01': ['木竹材料批次规格和环保资料核对', '含水率抽测位置数量和环境湿度记录', '翘曲变形色差虫蛀和破损筛查', '防潮包装堆放垫高和通风条件复核', '进场复验记录和铺装放行签认'],
  '03-01-04-P03': ['龙骨间距标高和固定点位置复核', '垫木防腐防潮和基层找平检查', '粘结层厚度满铺率和开放时间控制', '面层试铺后平整度和响声复测', '隐蔽验收影像和铺装移交签认'],
  '03-12-04-P01': ['栏杆高度扶手坡度和洞口边界复核', '防坠净距玻璃厚度和受力构件核对', '预埋件后置锚栓承载资料和拉拔点确认', '转角端部节点样板和防攀爬风险检查', '深化尺寸复核记录和制作安装签认'],
  '04-01-01-P06': ['找平层养护起止时间和覆盖状态记录', '表面裂缝起砂空鼓和污染点检查', '平整度标高坡向和阴阳角复测', '积水点打磨找补和洒水复查', '找平层移交资料和验收签认'],
  '04-01-01-P07': ['屋面坡向坡度和排水口标高复核', '找坡找平层厚度分区和边界线检查', '阴阳角圆弧泛水基层和穿屋面节点复测', '蓄水或淋水观察积水渗漏点记录', '找坡找平层验收资料和防水放行签认'],
  '04-01-03-P01': ['隔汽隔离材料批次规格和复验资料核对', '搭接宽度铺贴方向和收头做法确认', '基层干燥度平整度和阴阳角处理复核', '节点样板和穿屋面部位附加层检查', '材料进场复验记录和施工放行签认'],
  '04-01-03-P05': ['卷材褶皱空鼓翘边和破损范围标识', '破损切补尺寸搭接边和基层清理确认', '搭接压实密封和排气赶压检查', '转角收头穿屋面节点连续性复测', '修补影像记录和连续性复测签认'],
  '04-01-03-P06': ['隔离层厚度坡向和铺设范围实测', '搭接密封收头压条和端部固定检查', '穿屋面管根女儿墙收口节点复核', '问题销项清单和返修点复测记录', '实测复核资料和下道保护层签认'],
  '04-02-04-P02': ['发泡剂水泥外加剂批次和资料核对', '设计密度导热系数和厚度目标确认', '现场试配试块和流动性观察记录', '泵送压力发泡倍率和浇筑节奏复核', '配合比签认记录和大面施工放行'],
  '04-04-02-P03': ['沥青瓦起始线檐口基准和排版复核', '分层错缝搭接方向和外露尺寸控制', '钉距钉位钉帽压实和破损瓦片更换', '泛水天沟斜沟交接部位铺贴检查', '分层铺贴影像和隐蔽验收签认'],
  '04-04-02-P05': ['脊瓦中心线端部位置和顺直度复核', '斜脊搭接方向间距和固定钉位检查', '脊瓦封闭砂浆或密封材料饱满度确认', '端部收口防风压和防渗水措施复核', '脊瓦斜脊淋水复查和验收签认'],
  '05-02-03-P09': ['排水管道防腐基层除锈除污质量复核', '防腐涂料批次配比和施工环境记录核对', '涂层遍数厚度和漏涂流挂检查', '管卡支架焊口补涂部位复测', '防腐验收记录和隐蔽移交签认'],
  '05-03-03-P08': ['卫生热水防腐涂层厚度和附着质量复核', '阀门法兰套管和支架补涂完整性检查', '补口补伤位置编号和返修复测记录', '色标流向标识和成品保护状态确认', '防腐验收记录和涂层资料归档签认'],
  '05-06-01-P08': ['给水管道分区通水试验条件确认', '末端压力波动流量和水质外观复测', '接口阀门支架渗漏点巡检和标识', '阀门启闭末端排气和排水功能检查', '功能移交记录和交接签认'],
  '05-09-04-P06': ['饮用水供应管道保温厚度和材料批次复核', '接缝胶带搭接和防潮层连续性检查', '穿墙套管阀门弯头保温收口复测', '饮用水标识成品保护和污染风险检查', '绝热节能签认记录和资料移交'],
  '05-12-02-P09': ['水景喷泉防腐补口范围和基层处理复核', '涂层附着力厚度和边缘封闭检查', '电火花检漏抽点和缺陷位置标识', '返修复测记录和防腐影像资料整理', '补口复验清单和防腐资料闭合签认'],
  '05-13-04-P12': ['换热站换热参数阀组状态和仪表读数复核', '安全阀压力表温度计和控制柜资料核对', '控制点表报警阈值和联动状态检查', '运行培训备品备件和钥匙工具移交', '验收交接记录和运行资料移交签认'],
  '06-02-02-P06': ['排风部件规格型号和加工编号复核', '法兰孔距咬口焊缝外观抽查', '风阀检修门执行机构方向标识核对', '分区系统编号标签和入库清单粘贴', '部件入库台账和安装领用移交签认'],
  '06-02-05-P07': ['排风风管防腐基层除尘除锈质量复核', '防腐材料批次配比和环境条件检查', '防腐遍数厚度和支吊架补涂位置复测', '漏涂起皮碰伤点整改和复验记录', '防腐质量交接签认和资料归档'],
  '06-04-08-P06': ['除尘高温风管绝热材料厚度和耐温等级复核', '绝热层拼缝错缝和固定钉间距检查', '保护层搭接压边和高温伸缩部位处理', '热桥冷桥破损和检修口边界复查', '绝热节能资料和交接签认'],
  '06-06-02-P06': ['恒温恒湿部件规格型号和系统分区复核', '调节阀检修门传感器接口编号核对', '密封面垫片和气密薄弱部位检查', '阀件编号分区标签和入库清单粘贴', '部件入库台账和安装移交签认'],
  '06-09-02-P01': ['真空吸尘部件加工图版本和系统分区核对', '管径接口检修口和阀件位置复核', '集尘口旁通阀和支吊架加工尺寸检查', '管线碰撞检修空间和穿墙套管复核', '加工图会签记录和下料制作签认'],
  '06-17-04-P08': ['吸收式机组溶液泄漏点和结晶风险巡查', '溶液浓度液位温度和循环状态复核', '阀门法兰泵体密封和保温破损检查', '异常点整改复测和运行参数恢复记录', '泄漏结晶风险复查记录和运行签认'],
  '08-03-01-P02': ['电话线缆规格芯数和阻燃等级核对', '跳线批次长度和端接形式复验', '线缆外观破损压扁和盘号抽查', '测试样段导通绝缘和标识编号检查', '进场复验记录和布线放行签认'],
  '08-03-01-P05': ['语音跳线号码标签和端口台账核对', '跳线整理弯曲半径和余量控制检查', '配线架用户端口对应关系逐点复核', '线序错误松脱和跨接混乱点整改', '跳线整理记录和端口台账签认'],
  '08-03-01-P08': ['电话线缆通断测试范围和抽测比例确认', '绝缘导通串扰和端口编号测试记录', '号码核验用户端口和配线架标签比对', '异常端口返工复测和问题销项记录', '线缆测试记录归档和移交签认'],
  '08-08-02-P06': ['有线电视线缆标签和用户端口编号核对', '分支分配器端口清册和楼层分区复核', '终端电平测试记录和弱点复测', '标签缺失错接和衰减异常点整改', '线缆清册测试记录归档和交接签认'],
  '08-11-02-P02': ['LED屏体分区信号线和控制网线清单核对', '桥架管槽路径和电源线安全间距复核', '线缆弯曲半径牵引张力和端部余量检查', '屏体模组控制卡端口对应关系确认', '线缆敷设验收记录和安装移交签认'],
  '08-16-02-P08': ['安防线缆测试范围点位清单和编号复核', '绝缘导通屏蔽接地和衰减测试记录', '摄像机门禁报警点位端口对应核验', '线缆标签缺失错接和破损点整改复测', '安防线缆清册测试记录归档签认'],
  '01-01-04-P04': ['粉煤灰含水率和掺配比例复核', '分层摊铺厚度和虚铺标高控制', '碾压遍数压实系数和边角补压记录', '压实度取样检测和不合格区翻拌复压', '分区标高平整度复测和隐蔽验收签认'],
  '01-02-15-P04': ['沉井刃脚阻力土质和地下水位复核', '分仓取土下沉速度和高差控制记录', '轴线位移倾斜和标高连续监测', '纠偏压重或助沉措施执行复核', '异常突沉流砂风险处置和监测闭合', '到位标高复测和下道工序条件签认'],
  '01-02-15-P06': ['封底前基底清理水位和稳定条件确认', '水下封底混凝土配合比和导管布置复核', '封底混凝土连续浇筑和顶面标高控制', '止水节点施工缝和渗漏风险检查', '底板钢筋模板混凝土施工复测和验收签认'],
  '01-04-02-P02': ['回灌井井位孔深和含水层界面复核', '成孔成井和井管垂直度检查', '滤料级配回填和封孔密实记录', '洗井出水含砂量和井口保护复核', '成井记录水位基准和编号移交签认'],
  '01-04-02-P04': ['试回灌流量压力和水源水质确认', '回灌启动分级流量和井内水位记录', '周边水位沉降和地表异常巡查', '堵塞冒水或浑水异常处置复核', '试回灌曲线成果和运行参数签认'],
  '03-01-03-P03': ['基层湿润清理和平整度复核', '找平层材料配合比和摊铺厚度确认', '分层铺摊压实和压实遍数记录', '表面平整度坡度和标高复测', '空鼓裂缝风险检查和养护交接签认'],
  '03-01-04-P04': ['木竹面层含水率和色差排版复核', '龙骨基层平整度和防潮层连续性检查', '面层铺设拼缝宽度和伸缩缝控制', '钉固胶粘牢度和边口收口复核', '成品保护污染划伤检查和验收签认'],
  '04-01-02-P04': ['隔汽层基层干燥度和阴阳角处理复核', '隔汽材料铺贴方向和搭接宽度控制', '穿屋面管根女儿墙收头密封施工', '空鼓皱褶破损修补和连续性检查', '隔汽层隐蔽影像记录和验收签认'],
  '05-05-04-P02': ['反射膜基层清理和保温板平整度复核', '反射膜铺设方向搭接宽度和翻边控制', '加热管固定点避让和破损保护检查', '破损划伤修补和边界收口复核', '隐蔽影像记录和移交签认'],
  '08-05-02-P02': ['线缆路由桥架管槽和牵引计划复核', '牵引张力放线顺序和人员通讯确认', '敷设弯曲半径扭绞和外护套损伤检查', '端部余量盘留和临时保护复核', '线缆编号路径记录和隐蔽验收签认'],
  '08-05-02-P04': ['端部余量长度盘留位置和机柜空间复核', '光纤铜缆端部防尘防折保护施工', '穿越防火分区封堵材料和密实度检查', '标签编号房间端口和路由图同步复核', '隐蔽影像测试记录和资料移交签认'],
  '08-14-02-P03': ['BMS点表地址和线缆回路清单复核', '弱电线缆分层绑扎和强弱电间距控制', '屏蔽层接地排和末端接地方式检查', 'DDC箱端子编号和线号套管复核', '敷设记录绝缘测试和点表移交签认'],
  '08-18-03-P05': ['送回风通道洁净度和冷热通道边界复核', '风道封堵材料耐火和气密性能确认', '穿墙穿楼板洞口封堵和防冷桥处理', '漏风冷凝和旁通短路风险巡查', '封堵影像记录和运维检修界面签认'],
  '08-19-05-P02': ['安装位置屏蔽边界和回路接口清单复核', '穿墙管线接地汇流和套管界面检查', '设备固定基础和检修空间条件确认', '屏蔽接地端子导通和标识复核', '安装界面交接记录和问题闭合签认'],
  '01-01-07-P06': ['沉降板孔压计和水位观测点编号复核', '预压加载阶段沉降孔压连续采集', '日变化速率和固结趋势曲线校核', '异常突变点现场复测和原因记录', '监测日报汇总和卸载条件移交签认'],
  '01-04-02-P05': ['回灌运行流量压力和水位控制区间确认', '分井分时回灌水量累计记录', '地下水位响应和周边沉降联动复核', '回灌量偏差堵塞或冒水风险处置', '运行曲线成果和调整参数签认'],
  '01-04-02-P06': ['回灌水质指标和取样频次确认', '滤料堵塞井口浑水和出砂情况检查', '水质异常或堵塞井分级处置记录', '洗井反冲洗效果和水位恢复复测', '水质堵塞检查台账和移交签认'],
  '01-04-02-P07': ['周边沉降巡检范围和控制点复核', '建筑道路管线沉降裂缝日常巡查', '沉降速率超限点复测和报警记录', '回灌参数调整后沉降趋势复核', '巡检成果监测报告和风险闭合签认'],
  '01-05-01-P01': ['土方开挖分区分层顺序和支护界面复核', '开挖道路出土口和临边防护条件确认', '支撑锚索降水监测协同窗口会签', '开挖交底风险点和应急措施落实检查', '首层开挖放行记录和问题闭合签认'],
  '01-05-01-P07': ['钎探点位间距深度和验槽范围复核', '钎探记录土质异常和持力层情况核对', '设计勘察监理联合验槽意见会签', '局部超挖软弱土或扰动区处理复测', '验槽移交资料和下道工序放行签认'],
  '01-06-02-P04': ['泄水孔位置坡度和排水通道复核', '反滤层级配厚度和铺设范围确认', '墙背排水盲沟和滤水材料施工检查', '堵塞倒坡或漏设点整改复测', '隐蔽验收影像和排水功能移交签认'],
  '01-06-02-P07': ['挡土墙监测点布设和初始值采集复核', '墙身位移沉降裂缝和排水状态巡检', '雨后或回填阶段变形趋势复核', '超限点加固卸载或排水处置记录', '监测成果和挡墙验收移交签认'],
  '06-04-02-P04': ['灰斗检修口泄爆口定位尺寸复核', '检修门密封面和开启空间检查', '泄爆片安装方向和安全泄放路径确认', '焊缝毛刺积灰死角和防静电连接复核', '部件尺寸检查记录和整改闭合签认'],
  '06-06-02-P04': ['密闭检修门尺寸位置和开启方向复核', '调节阀型号规格和密封等级核对', '门框阀体连接面平整度和密封条检查', '温湿度控制区气密薄弱点整改复测', '部件检查记录和安装移交签认'],
  '06-09-02-P04': ['集尘接口位置标高和管径方向复核', '旁通阀型号流向和操作空间确认', '接口密封圈压紧度和负压泄漏风险检查', '阀件启闭灵活性和检修口可达性复核', '接口旁通阀检查记录和编号移交签认'],
  '07-05-05-P01': ['塑料护套线路径灯位和回路编号复核', '穿越墙顶棚和固定基层条件检查', '强弱电间距热源潮湿区避让确认', '灯具开关插座接线盒位置复测', '路径灯位复核记录和敷设放行签认'],
  '07-05-05-P03': ['塑料护套线规格批次和外护套外观检查', '展开校直牵引力度和扭绞损伤控制', '沿墙沿顶直敷平直度和固定前定位复核', '转角弯曲半径和穿越保护处理检查', '敷设记录绝缘预检和隐蔽验收签认'],
  '08-06-01-P02': ['移动通信覆盖勘测区域和运营商指标确认', '弱信号盲区和高干扰点现场复测', '天线布点容量分区和覆盖预测校核', '地下室电梯厅管井等重点区域复查', '勘测报告盲区清单和优化建议签认'],
  '08-06-01-P04': ['天线点位安装高度朝向和覆盖半径复核', '馈线路由桥架管槽和防火分区穿越确认', '馈线弯曲半径接头防水和标签编号检查', 'RRU或POI接入界面和接地条件复核', '点位路由复核记录和运营商移交签认'],
  '08-06-01-P05': ['驻波比测试仪表校准和测试端口确认', '馈线天线端到端驻波比测试记录', '覆盖预测与现场抽测信号强度比对', '高驻波或弱覆盖点定位整改复测', '测试报告覆盖图和开通条件签认'],
  '08-10-02-P01': ['会议线缆类型接口矩阵和设备清单复核', '音频视频控制网络和电源线缆分色编号', '桌面地插投影摄像拾音点位接口确认', '线缆规格长度屏蔽和传输距离校核', '接口清单冻结和敷设放行签认'],
  '08-10-02-P06': ['音视频链路测试场景和信号源清单确认', '视频分辨率延迟音频增益和底噪测试', '线缆衰减串扰接地干扰问题定位', '异常链路重端接更换或屏蔽整改复测', '测试报告问题闭合和会议系统移交签认'],
  '01-02-15-P01': ['沉井沉箱分节施工顺序和降水边界复核', '刃脚垫层井壁制作和下沉工况条件确认', '周边建筑管线水位和沉降监测点布设', '流砂突沉倾斜偏位风险措施交底检查', '试下沉或首节下沉控制参数会签', '施工方案降水措施和监测基准资料闭合签认'],
  '01-03-08-P01': ['内支撑平面布置轴力设计和节点详图复核', '支撑立柱围檩冠梁接口和预埋条件确认', '千斤顶预加力设备校验和加载分级计划核对', '轴力监测点初值采集和报警阈值会签', '支撑安装拆换撑风险点和应急措施交底', '支撑方案轴力监测基准和安装放行签认'],
  '01-04-01-P01': ['降排水目标水位和影响范围边界复核', '井点深度间距滤管长度和封孔要求核对', '排水通道沉淀池和外排许可条件检查', '抽水试运行流量水位和含砂量记录', '周边沉降水位观测点初值采集会签', '降排水方案井点布置和试运行成果签认'],
  '01-07-05-P01': ['注浆孔位孔距孔深和加固范围复核', '浆液配合比凝结时间和材料批次确认', '试验段试注压力流量和注浆量记录', '冒浆串浆或地表隆起风险处置交底', '试验段检测成果和参数调整会签', '注浆方案试验段资料和批量施工放行签认'],
  '02-03-01-P01': ['焊接工艺评定编号适用范围和母材批次核对', '焊材烘干保温领用和回收记录检查', '坡口尺寸组对间隙错边量和清理状态复核', '焊接环境温湿度风速和预热条件确认', '样板焊缝外观和无损检测计划会签', '焊接工艺交底人员资格和首件放行签认'],
  '02-03-05-P01': ['高层钢结构吊装分区分节和楼层流水段复核', '构件编号重量重心和吊点吊具清单核对', '楼层轴线标高控制点和临时支撑条件确认', '塔吊覆盖半径吊装通道和卸料平台复查', '测量校正焊接或螺栓连接窗口会签', '分节分层吊装方案和首吊条件签认'],
  '05-01-09-P01': ['给水调试分区边界阀门编号和末端清单核对', '试压冲洗消毒水源排水和旁通条件确认', '压力表流量计校验和测点布置复核', '分区升压稳压和末端放水试验计划会签', '异常渗漏浑水余氯偏差处置机制交底', '调试方案分区边界和测试放行签认'],
  '05-08-02-P01': ['室外供热试压分段范围和隔离边界复核', '盲板封堵泄水排气和临时支撑条件确认', '压力表温度补偿和稳压时长要求核对', '升压巡检路线接口焊缝和阀门状态检查', '泄漏点标识整改复测和压力曲线归档', '试压分段盲板封堵方案和放行记录签认'],
  '06-05-10-P01': ['舒适空调调试范围房间负荷和使用场景复核', '风量水量测点布置仪表校验和点位编号核对', '风阀水阀开度初值和自控点表联动条件确认', '典型房间温湿度噪声和新风量测试计划会签', '偏差房间原因排查和参数调整闭环交底', '空调调试方案负荷边界和测点放行签认'],
  '07-03-01-P04': ['送电回路清单柜号电缆编号和负荷边界核对', '绝缘电阻接地连续性和相序复测记录检查', '临时用电拆除挂牌隔离和安全防护确认', '受送电人员分工通讯方式和应急停电措施交底', '送电许可操作票和监护条件会签', '送电条件安全许可和首送记录签认'],
  '06-07-09-P01': ['洁净等级测试范围房间状态和检测标准复核', '粒子计数压差风速温湿度测点布置核对', '检测仪器校准证书和采样高度频次确认', '静态或动态测试运行条件和人员物流控制检查', '超限点过滤器密封风量或清洁问题整改复测', '洁净度测试方案测点布置和检测放行签认'],
  '06-20-03-P01': ['防排烟系统消防联动点表和防火分区边界核对', '风机风阀排烟口补风口和控制模块编号复核', '手自动远程启动停止和反馈信号测试场景确认', '烟感温感报警主机联动逻辑和延时参数会签', '联动失败风量不足或反馈异常整改复测记录', '防排烟测试方案点表复核和联动测试放行签认'],
  '07-04-02-P03': ['电动机铭牌回路编号和控制柜接线复核', '绝缘电阻接地连续性和相序条件确认', '点动试运行正反转方向和机械联锁检查', '空载电流电压温升振动和噪声记录', '反转过流异响或温升异常停机整改复测', '电动机点动空载试运行记录和移交签认'],
  '08-14-02-P01': ['BMS点表版本线缆规格和控制回路清单核对', 'DDC箱位置端子编号和设备接口边界复核', '线缆屏蔽接地通讯协议和供电方式确认', '点表地址回路编号和现场设备标签一致性抽查', '缺线错线地址冲突或协议偏差整改复测', 'BMS线缆点表回路复核和调试放行签认'],
  '08-15-02-P02': ['火灾报警隔离器位置和回路分段边界核对', '防火分区楼层设备地址编码和回路容量复核', '短路隔离模拟和报警反馈显示条件确认', '穿越防火分区线路保护和端子箱标识检查', '地址重复隔离失效或回路超容问题整改复测', '隔离器回路分段清单和消防调试放行签认'],
  '08-16-05-P10': ['安防调试报告系统范围和设备点位清单复核', '运维账号权限角色密码策略和审计日志检查', '录像回放门禁报警巡更和联动场景抽测', '平台网络存储时间同步和备份策略确认', '权限错误录像缺失或联动异常整改复测', '安防资料账号移交培训记录和运维签收完成'],
  '08-19-05-P01': ['电涌保护器型号级配和保护对象清单核对', '安装位置接线长度熔断保护和接地路径复核', '接地导通电阻和状态指示窗口检查记录', '防雷分区配电回路和信号线路保护边界确认', '接线松动级配错误或状态异常整改复测', '电涌保护器规格复核和防雷验收资料签认'],
  '10-01-12-P07': ['电梯监督检验资料目录和电气系统范围核对', '安全回路门锁回路限位回路和控制柜记录复核', '绝缘接地相序电源质量和应急照明测试确认', '监检问题清单整改复验和报告编号归档', '使用登记维保合同培训资料和钥匙工具移交检查', '监督检验资料电气系统签认和移交闭合完成'],
  '10-02-11-P11': ['液压电梯监督检验资料目录和安全功能清单核对', '安全钳限速器限位回路和门锁回路测试记录复核', '液压站油温压力泄漏保护和紧急下降功能验证', '绝缘接地控制柜参数和报警记录资料归档', '监检问题整改复验使用登记和维保资料闭合', '液压电梯电气安全功能监督检验资料组卷签认'],
  '10-03-03-P11': ['扶梯竣工资料目录检验报告和设备台账核对', '梯级扶手带梳齿板围裙板和安全保护装置资料复核', '钥匙工具备品备件维保合同和培训记录检查', '监检整改复验使用登记和运营接管条件确认', '竣工图合格证说明书和维保资料归档闭合', '扶梯竣工资料移交运维培训和接管签认完成'],
  '01-02-15-P02': ['刃脚轴线标高和垫层范围复核', '基底承载排水和垫层厚度控制检查', '刃脚模板钢筋预埋件和止水节点确认', '垫层混凝土浇筑振捣找平和养护记录', '刃脚基础平整度强度和下节制作放行签认'],
  '01-02-15-P03': ['井筒箱体分节高度轴线和模板体系复核', '钢筋预埋件套管止水带和施工缝位置检查', '分节混凝土浇筑振捣养护和外观质量记录', '接缝凿毛清理止水节点和下节接口复核', '分节制作偏差复测和下沉前验收签认'],
  '01-02-15-P07': ['井壁基层蜂窝麻面裂缝和含水状态复核', '施工缝接缝凿毛清理和止水带连续性检查', '防渗涂层或嵌缝材料批次配比和厚度控制', '阴阳角穿墙件和渗漏薄弱点加强处理记录', '蓄水或淋水复查接缝渗漏整改和封闭签认'],
  '03-01-01-P01': ['基层清理空鼓裂缝污染和松散层检查', '平整度坡度标高和房间方正实测记录', '基层强度含水率和粘结条件复核', '不合格基层凿除修补找平和复测闭合', '基层验收记录和面层施工放行签认'],
  '03-01-02-P05': ['分格缝排版弹线和房间标高控制线复核', '基层找平层厚度坡度和平整度检查', '切缝宽度深度嵌缝材料和边角收口控制', '标高偏差空鼓裂缝和起砂风险点整改复测', '分格缝标高平整验收和成品保护移交签认'],
  '03-01-02-P08': ['空鼓开裂起砂检查范围和抽查比例确认', '敲击检查裂缝宽度起砂程度和位置标识记录', '缺陷区域切割凿除界面处理和材料修补', '修补养护后平整度强度和外观复测', '缺陷台账销项和地面验收移交签认'],
  '04-04-02-P01': ['沥青瓦基层清理平整度和钉固条件检查', '找平层干燥度含水率阴阳角和泛水基层复核', '基层裂缝孔洞松动板材和檐口边线整改', '防水附加层天沟屋脊节点基层条件确认', '基层平整干燥验收和沥青瓦铺设放行签认'],
  '04-05-02-P05': ['天沟落水口泛水高度和排水坡度复核', '附加防水层搭接宽度收头压条和密封检查', '落水口篦子管根阴阳角和变形缝节点拍照记录', '蓄水或淋水检查渗漏点定位整改复测', '天沟节点影像留痕验收和屋面移交签认'],
  '05-08-03-P05': ['检查井井位标高井径和管道接入方向复核', '井底基础垫层流槽和踏步预埋条件检查', '井壁砌筑或现浇模板钢筋混凝土质量记录', '井圈井盖标高道路接顺和防坠网安装复核', '闭水通水和井内清理验收移交签认'],
  '08-19-06-P02': ['屏蔽线缆规格型号屏蔽层结构和批次复核', '穿管桥架路径强弱电间距和屏蔽连续性检查', '屏蔽层端接接地跨接和防雷等电位连接测试', '绝缘导通抗干扰和标识编号记录复核', '屏蔽线缆测试报告和机房接地移交签认'],
  '08-17-03-P01': ['应急响应系统演练场景清单和触发条件复核', '报警点位广播对讲照明门禁和联动对象核对', '应急预案脚本通讯分工和记录表单确认', '典型场景报警触发联动演练和响应时间记录', '异常场景复测问题销项和演练报告归档', '应急响应调试方案演练场景和移交签认完成'],
  '08-13-04-P01': ['信息化应用系统资源清单账号角色和权限边界复核', '接口清单数据字典网络访问和安全策略确认', '基础数据导入编码规则和业务流程样例校验', '接口联调数据同步异常回退和日志记录测试', '问题清单销项性能可用性和权限复测闭合', '应用系统调试方案确认报告和上线移交签认'],
  '08-12-04-P01': ['时钟系统授时源母钟子钟和网络拓扑清单复核', 'GPS北斗NTP接口线缆和供电接地条件确认', '母钟子钟地址编号安装位置和显示格式核对', '同步精度通讯状态断网恢复和告警场景测试', '偏差子钟授时失败和通讯异常整改复测', '时钟系统调试方案授时源清单和验收签认完成'],
  '08-11-06-P01': ['信息导引发布节目清单分区策略和终端台账复核', '发布服务器网络权限素材格式和审批流程确认', '显示终端亮度分辨率时间同步和播放策略校验', '分区发布应急插播离线恢复和内容回退测试', '黑屏错播延迟或权限异常整改复测记录', '导引发布调试方案节目清单和移交签认完成'],
  '08-10-04-P01': ['会议系统音视频场景清单和房间使用模式复核', '矩阵主机扩声拾音摄像投影和控制接口确认', '音频增益回声抑制视频分辨率和信号源切换测试', '远程会议录播中控联动和多场景联调复测', '啸叫延迟黑屏串扰或控制异常整改闭合', '会议系统调试方案场景清单和报告归档签认'],
  '08-14-09-P08': ['BMS运维资料点表版本控制策略和设备台账核对', '账号权限报警阈值趋势报表和备份策略确认', '运维培训签到实操演示和常见故障处置记录', '点表图纸程序备份和参数冻结资料交接', '遗留问题账号权限和报警策略复测闭合', 'BMS运维培训资料移交和接管签认完成'],
  '08-15-06-P07': ['消防报警软件版本授权配置文件和点表清单核对', '主机程序回路地址联动矩阵和备份介质确认', '操作培训消音复位屏蔽隔离和火警处置演示记录', '配置备份恢复测试和软件资料签收记录', '版本不一致授权缺失或配置偏差整改复测', '消防报警软件资料移交和运维签认完成'],
  '08-16-06-P08': ['安防系统运维资料设备清册和点位图核对', '账号权限录像策略存储周期和日志审计确认', '平台配置备份门禁权限和报警联动资料交接', '运维培训录像检索事件处置和应急开门演示记录', '权限遗漏录像策略偏差和资料缺项整改闭合', '安防运维移交资料归档和接管签认完成'],
  '08-18-11-P08': ['机房系统运维清册设备资产账号权限和拓扑复核', '配置备份日志策略告警阈值和应急联系表确认', '供配电空调动环消防网络和弱电资料汇总检查', '运维培训故障演练备品备件和钥匙工具交接', '账号权限备份策略或资料缺项整改复测', '机房运维资料账号权限移交和交接闭合签认'],
  '08-19-01-P01': ['机房接地干线等电位范围和设计电阻目标复核', '机柜桥架设备外壳和屏蔽接地连接点清单核对', '接地扁钢铜排焊接压接防腐和标识检查', '接地电阻导通测试和隐蔽影像记录', '接地断点跨接遗漏或电阻超限整改复测', '机房接地方案复核验收资料和移交签认完成'],
  '08-19-05-P05': ['防雷前级保护配电级配和保护对象边界复核', 'SPD参数后备保护接线长度和安装位置检查', '接地导通状态指示遥信接点和告警记录测试', '上下级保护协调旁路误接和失效风险排查', '级配错误接地不良或状态异常整改复测', '前级保护配合复核防雷测试和验收签认完成'],
  '08-19-06-P08': ['屏蔽线缆隐蔽验收范围路径和抽查点位复核', '弯曲半径穿墙套管桥架间距和防护措施检查', '屏蔽层端接接地连续性和等电位连接测试', '隐蔽影像编号线缆标签和测试记录归档', '接地断点护套损伤或标签缺失整改复测', '屏蔽线缆隐蔽验收资料和移交签认完成'],
  '10-01-01-P06': ['电梯随机技术资料合格证和型式试验证明核对', '曳引机控制柜门机限速器安全部件资料复核', '设备台账出厂编号安装位置和监检资料目录建立', '资料缺项版本不符或证书过期问题整改', '监督检验前资料预审和设备实物一致性确认', '随机技术资料型式试验证明复核和监检准备签认'],
  '10-02-03-P08': ['液压电梯满载试验工况载荷和压力表校验确认', '液压站油温油位阀组状态和泄漏风险检查', '满载上行下行压力曲线运行速度和制动记录', '管路接头油缸阀组渗漏和异常噪声复查', '监督检验问题整改复验和压力记录归档', '满载压力试验液压系统签认和移交闭合完成'],
  '10-02-10-P06': ['液压电梯绝缘接地测试范围仪表校验和回路清单核对', '控制柜电机门锁安全回路绝缘测试记录', '保护接地等电位跨接和接地电阻测试确认', '监督检验电气资料报警记录和参数备份归档', '绝缘不合格接地缺陷或资料缺项整改复验', '绝缘接地测试监督检验资料签认和移交闭合完成'],
  '06-03-06-P07': ['防排烟联动复测范围和缺陷清单复核', '风阀反馈风机启停和防火阀状态逐点核对', '消防控制信号图形显示和报警记录联调复测', '缺陷销项整改责任复测结果和影像资料闭合', '系统功能复测签认和运维移交资料归档', '防排烟联动缺陷整改复测签认和移交闭合完成'],
  '06-03-07-P07': ['联动缺陷问题清单整改责任和期限确认', '风阀风机防火阀反馈异常逐项整改复核', '消防主机图形显示和现场动作一致性复测记录', '复测记录影像资料和报警打印记录归档', '监理消防维保和施工单位签认闭合', '防排烟联动缺陷整改复测资料归档签认完成'],
  '06-03-07-P01': ['防排烟系统调试方案边界和设备清单复核', '消防联动矩阵点表地址和控制逻辑核对', '分区排烟补风加压送风场景脚本确认', '风阀风机防火阀反馈信号和图显状态预检', '通讯地址权限和异常回退处理记录闭合', '防排烟联动调试方案矩阵和放行签认完成'],
  '06-20-03-P06': ['防排烟功能缺陷和自控点表差异清单复核', 'DDC消防主机风机风阀反馈复测和接口核对', '消防主机图显报警和自控趋势记录一致性确认', '联动反馈缺陷闭合责任和整改记录归档', '交接签认前运行场景和手自动切换复核', '防排烟功能缺陷销项复测交接签认完成'],
  '07-07-03-P07': ['等电位连接范围端子箱和跨接点位复核', '金属管道桥架设备外壳导通测试记录', '隐蔽影像编号焊接压接防腐和标识检查', '跨接遗漏接触不良或电阻超限整改复测', '隐蔽验收资料接地测试报告和签认归档', '建筑物等电位连接隐蔽验收签认完成'],
  '08-19-03-P07': ['智能建筑等电位接地范围和设备点位清单复核', '机柜桥架屏蔽接地和等电位端子连接检查', '导通复核接地电阻和跨接连续性测试记录', '问题整改漏接错接和标识缺失复测闭合', '接地影像测试报告和运维界面资料归档', '智能建筑等电位联接验收签认和记录复核完成'],
  '08-19-05-P08': ['电涌保护器保护对象和分级级配复核', 'SPD型号参数后备保护和接线长度检查', '状态指示遥信接点接地导通和故障报警测试', '失效整改级配错误或接地不良问题复测', '检测报告状态记录和防雷验收资料归档', '电涌保护器验收记录复核签认完成'],
  '08-19-06-P05': ['屏蔽线缆路径管槽和强弱电间距复核', '弯曲半径固定间距牵引张力和护套保护检查', '屏蔽层端接标签编号和接地连续性复核', '抗干扰测试导通绝缘和屏蔽衰减记录归档', '弯曲压伤标签缺失或接地断点整改复测', '屏蔽线缆弯曲半径固定间距复核签认完成'],
  '10-02-01-P06': ['液压电梯随机技术资料和液压试验证明目录核对', '液压站油缸管路阀组证书和型式试验资料复核', '安全部件证书有效性安装位置和实物一致性检查', '资料缺项证书过期或设备编号不符问题整改', '监督检验资料预审和现场实物复核记录闭合', '液压电梯随机资料试验证明复核和监检准备签认'],
  '10-02-11-P12': ['液压电梯电气装置验收范围和控制柜参数核对', '门锁安全回路限位急停和报警保护功能复测', '绝缘接地等电位和液压站控制信号记录归档', '维保资料备件清单图纸参数和培训记录交接', '问题复验监检缺陷和资料缺项整改闭合', '液压电梯电气装置验收交接签认和运维移交完成'],
  '06-07-07-P08': ['净化空调附属设备移交范围和洁净保护要求复核', '设备封堵包装滤材保护和污染风险点检查', '清洁消毒检测报告和运行参数记录核对', '污染损伤缺陷整改和洁净保护复测闭合', '运维边界备品备件和维护通道交接确认', '净化空调附属设备洁净保护移交签认和验收闭合完成'],
  '06-07-10-P06': ['净化空调风管设备绝热范围和节能复测点确认', '绝热厚度接缝防潮层穿墙节点和隐蔽影像检查', '冷桥结露破损污染和保温缺陷定位记录', '节能复测红外或温差检查和问题整改闭合', '保温隐蔽资料洁净保护和交接界面归档', '净化空调绝热节能复测和交接签认完成'],
  '06-16-01-P09': ['制冷机组报警保护点表和联锁逻辑复核', '冷冻冷却水流量温度压力和保护参数确认', '高低压油压防冻水流开关和急停联锁测试', '报警记录趋势曲线和控制柜参数复核归档', '异常整改报警误动作或保护失效问题复测', '制冷机组报警保护测试功能复测交接完成'],
  '06-18-07-P01': ['多联机调试方案系统编号和室内外机清单复核', '地址表拨码通讯线和室内外机映射关系确认', '冷媒追加量电源相序和排水条件调试前检查', '通讯调试运行模式温度响应和集中控制测试', '异常复测地址冲突通讯故障和冷媒报警问题闭合', '多联机系统调试方案地址表确认和调试放行完成'],
  '06-15-07-P01': ['蓄能系统调试方案运行策略和工况边界复核', '蓄能设备泵阀仪表和控制参数清单确认', '充放能工况切换流量温度和液位趋势预检', '安全边界报警联锁和应急停机条件测试', '运行策略偏差控制异常和参数问题整改闭合', '蓄能系统调试方案运行策略确认和调试放行完成'],
  '06-10-09-P08': ['冷凝水管坡度复核和排水路径检查', '排水试验通水观察漏水倒灌和积水点记录', '保温防结露和吊顶隐蔽节点复查', '漏水倒灌堵塞或坡度不足问题整改复测', '复测记录影像资料和吊顶封闭条件归档', '冷凝水系统问题整改复测记录签认闭合完成'],
  '05-13-07-P01': ['热源系统调试方案设备范围和安全条件复核', '锅炉换热器泵组阀门仪表和联锁点位确认', '燃气热媒水压排烟通风和补水条件预检', '泵组联锁启停保护报警和试运行准备记录', '安全边界异常参数偏差和资料缺项整改闭合', '热源系统调试方案安全条件确认和调试放行完成'],
  '05-14-02-P07': ['仪表偏差清单测点编号和校准证书复核', '压力温度流量液位仪表量程和安装状态检查', '现场比对复校记录参数回写和趋势核对', '偏差整改更换调零或接线修正后复测确认', '校准报告复校记录和控制系统点表归档', '仪表偏差整改复校移交签认完成'],
  '08-16-05-P09': ['安防调试问题清单点位类型和责任边界复核', '录像回放存储周期画面质量和时间同步复测', '门禁权限报警联动布撤防和事件日志核对', '平台配置权限遗漏和联动异常整改闭合', '复测签认运维账号配置备份和培训记录归档', '安全技术防范系统调试问题闭合复测签认完成'],
  '01-03-07-P05': ['水泥土重力式挡墙监测方案和测点位置复核', '墙顶水平位移沉降和周边管线初始值采集', '监测频率报警阈值和保护措施确认', '初始值异常复核基准点联测和数据修正记录', '监测点标识保护和监测移交资料归档', '水泥土重力式挡墙监测点布设初始值采集完成'],
  '01-01-01-P06': ['表面整平范围和设计标高控制线复核', '分区平整压实后标高复核和坡向检查', '压实系数抽检点位和检测报告核对', '不合格区翻松补夯复压和复检记录', '验收放行前边角低洼积水和污染清理', '表面整平标高复核压实资料闭合完成'],
  '01-01-01-P08': ['地基验收范围检测批次和承载力指标复核', '现场验槽记录地基土状态和扰动区域确认', '检测报告承载力压实度和处理记录核对', '不合格点开挖换填或复压整改复测', '地基验收移交签认和基础放行条件确认', '地基验收承载力资料复核和基础施工放行完成'],
  '01-01-07-P05': ['分级加载预压或真空预压运行参数复核', '加载级次真空度排水量和沉降速率连续记录', '孔压水位和边桩位移监测数据同步采集', '异常处置卸载补压或设备故障恢复记录', '运行记录监测曲线和现场巡检资料归档', '分级加载真空预压运行记录闭合完成'],
  '01-01-07-P07': ['固结度计算依据和卸载条件指标复核', '沉降曲线孔压消散和稳定标准对比', '监测复核第三方报告和现场观测记录核对', '卸载条件会签异常数据复测和风险说明', '卸载签认后场地整平和后续移交资料归档', '固结度评估卸载条件确认和后续移交完成'],
  '01-02-01-P01': ['基底验槽范围轴线标高和持力层状态复核', '承载力复核检测点位和设计指标核对', '扰动处理超挖积水软弱夹层记录闭合', '验槽记录勘察设计监理施工联合签认', '整改复验后垫层施工条件和保护措施确认', '基底验槽承载力复核和垫层放行完成'],
  '01-02-01-P06': ['基础顶面标高轴线偏位和复测点位布置', '外观尺寸台阶宽高平整度和缺棱掉角检查', '偏位蜂窝麻面露筋或尺寸超差缺陷登记', '缺陷整改修补凿除或补强后复测记录', '复测记录影像资料和实测实量台账归档', '基础顶面标高轴线外观尺寸验收签认完成'],
  '01-02-03-P09': ['拆模条件同条件试块强度和养护龄期复核', '实体质量外观尺寸轴线标高和垂直度实测', '强度报告试块编号和混凝土浇筑记录核对', '蜂窝麻面裂缝露筋和施工缝缺陷整改', '整改复测实体质量验收和资料闭合归档', '拆模实体质量验收移交签认完成'],
  '01-03-07-P01': ['挡墙轴线基础边线和设计坡脚位置复核', '基础承载力验槽记录和地基处理结果核对', '槽底排水降水和软弱扰动区域检查', '轴线标高或承载力偏差整改复测记录', '施工放行前材料设备作业面和安全措施确认', '水泥土重力式挡墙基础复核施工放行完成'],
  '01-03-07-P06': ['变形巡检和渗漏巡检范围频次确认', '墙顶位移沉降裂缝和渗漏点监测数据采集', '雨后开挖后和加载后异常趋势复核', '裂缝处置渗漏或位移超限复测闭合', '监测数据巡检照片和问题销项资料归档', '挡墙变形渗漏巡检复测闭合移交记录完成'],
  '01-04-02-P01': ['回灌方案回灌目标和周边保护对象复核', '水源条件水质水量和回灌井观测井清单确认', '回灌设备管线阀门计量表和电源条件检查', '试运行流量压力水位响应和异常处置记录', '放行签认前回灌参数监测频率和报警阈值确认', '回灌方案水源条件试运行放行签认完成'],
  '01-05-03-P01': ['场地控制网基准点和设计标高资料复核', '方格网测量点位原地貌高程和边界线复测', '土方平衡挖填调配和弃取土路线确认', '障碍物管线和临边排水条件风险核对', '边界复核后施工分区机械通道和保护措施确认', '场地控制网设计标高复核和施工放行完成'],
  '01-05-03-P06': ['场地标高方格网复测点位和测量记录核对', '标高偏差挖填厚度排水坡向和平整度检查', '低洼积水松软沉陷和边界接顺风险复核', '标高偏差或沉降风险区域整改复测闭合', '方格网复测成果影像资料和竣工测量归档', '场地标高方格网复测移交签认完成'],
  '01-06-01-P01': ['边坡开挖方案支护设计和坡率参数复核', '开挖分层分段顺序临边荷载和安全距离确认', '排水措施监测点截水沟和坡顶防护布置核对', '地质变化软弱夹层和地下水风险处置预案确认', '开挖放行前机械通道降排水和应急材料检查', '边坡开挖支护设计复核和开挖放行完成'],
  '01-06-02-P01': ['挡土墙基础验槽范围轴线标高和持力层复核', '承载力检测记录地基扰动和软弱层处理核对', '排水垫层反滤层和基底排水条件检查', '扰动整改超挖积水或承载力不足问题闭合', '施工放行前墙身材料机械和安全防护确认', '挡土墙基础验槽承载力复核施工放行完成'],
  '01-06-02-P08': ['挡土墙验收范围墙身垂直度和平面位置复核', '泄水孔反滤层沉降缝伸缩缝和排水通畅检查', '墙背回填分层压实度和填料质量检测核对', '裂缝鼓胀渗漏沉降或墙面缺陷整改复测', '验收资料监测记录和排水检查影像归档', '挡土墙验收回填压实复核和移交签认完成'],
  '08-05-07-P08': ['综合布线系统调试范围链路清单和端口台账复核', '链路认证测试仪表校准和抽测比例确认', '端口抽测跳线标签机柜配线架记录核对', '交叉跳线链路衰减串扰或开路短路问题整改复测', '测试报告端口台账和问题闭合资料归档', '综合布线链路认证端口抽测和运维移交签认完成'],
  '06-01-07-P08': ['送风系统调试范围风口风量和风阀状态复核', '风量平衡记录过滤器状态和风机运行参数核对', '风阀反馈手自动切换和控制信号复测', '噪声振动温升或风量偏差问题整改复测', '复测签认前运行记录图纸点表和资料归档', '送风系统风量平衡复测签认和交接资料移交完成'],
  '06-02-08-P08': ['排风系统调试范围排风口编号和排风量目标复核', '排风机阀门过滤段和排风管路运行状态核对', '负压控制排风量测试和异常点位记录', '缺陷整改后排风量负压和噪声振动复测', '复测报告运行参数和维护边界资料归档', '排风系统调试缺陷整改和移交签认完成'],
  '06-03-07-P08': ['防排烟系统复测范围消防主机点表和场景清单复核', '风机风阀防火阀和排烟口动作反馈逐项测试', '消防主机图显反馈和现场动作一致性记录', '火警场景联动失败反馈异常或风量不足问题整改复测', '复测报告报警打印影像和问题闭合资料归档', '防排烟消防调试功能复测和移交签认完成'],
  '06-04-09-P08': ['除尘系统复测范围集尘点位和负压风量指标复核', '风机阀门集尘接口和旁通回路运行记录核对', '粉尘浓度排放指标和滤袋压差复测确认', '堵塞漏风负压不足或粉尘超限问题销项复测', '复测报告清灰维护周期和安全边界资料归档', '除尘系统负压风量粉尘浓度复测和运维移交完成'],
  '08-17-03-P08': ['应急响应系统复测范围预案脚本和触发条件复核', '报警广播门禁照明视频和对讲联动对象核对', '应急演练记录响应时间和岗位通讯记录复测', '异常复测场景响应失败或权限偏差问题销项', '演练报告问题闭合和运维值守资料归档', '应急响应预案脚本演练记录复测和移交签认完成'],
  '08-18-10-P08': ['机房系统联调报告范围供配电制冷动环和消防边界复核', '动环告警阈值趋势记录和事件日志核对', '供配电制冷消防网络联调结果和异常场景复测', '运维账号权限备份策略和资产台账资料检查', '遗留问题闭合复测报告和运行维护手册归档', '机房系统联调报告运维账号和问题闭合签认完成'],
  '05-01-09-P08': ['给水系统调试复测范围分区阀门和末端清单复核', '试压冲洗记录压力曲线水质浊度和排水路径核对', '末端放水流量压力和水质余氯复测确认', '渗漏整改阀门失灵水质偏差或压力不足问题复测', '调试报告水质资料和运行标识台账归档', '给水系统试压冲洗末端放水复测和移交签认完成'],
  '05-13-07-P08': ['热源系统复测范围锅炉换热器泵组和安全保护清单复核', '泵组联锁启停保护报警和燃气热媒参数核对', '锅炉换热试运行记录温压流量和排烟通风状态复测', '安全保护失效联锁偏差或试运行异常问题整改', '试运行记录能效参数和运维资料归档', '热源系统锅炉换热泵组联锁复测和运维交接完成'],
  '05-14-01-P07': ['联动调试范围仪表点位和控制阀门清单复核', '仪表信号控制阀门开度反馈和报警保护逻辑测试', '数据记录趋势曲线和控制系统点表一致性核对', '仪表偏差阀门卡涩或报警保护异常问题整改复测', '联动调试记录参数回写和资料签认归档', '检测仪表联动调试数据记录和签认归档完成'],
  '06-20-02-P06': ['执行机构调试范围阀门开度和行程限位清单复核', '控制信号反馈信号和手自动切换逐点测试', '阀门开度线性度行程限位和动作时间记录核对', '反馈信号偏差复测和卡涩超时限位失效问题闭合', '执行机构调试记录点表更新和资料归档', '执行机构阀门开度反馈信号复测和交接签认完成'],
  '08-14-08-P08': ['BMS调试问题销项范围点表差异和责任清单复核', '趋势记录报警阈值联动场景和权限配置复测', 'DDC网关通讯点表地址和现场反馈一致性核对', '报警阈值偏差趋势缺失或点表错误问题复测签认', '复测报告程序备份和运维培训资料归档', 'BMS调试点表差异趋势记录复测签认和运维交接完成'],
  '08-05-08-P08': ['综合布线试运行范围网络吞吐端口稳定性和抽测清单复核', '链路负载端口错误包和交换机日志连续采集', '标签台账机柜端口配线架和资产编号一致性核对', '故障复测掉线误码标签缺失或跳线错误问题闭合', '试运行报告端口台账和维护界面资料归档', '综合布线试运行网络吞吐端口稳定性和运维移交完成'],
  '08-08-01-P06': ['有线电视管槽路径路由编号和隐蔽范围复核', '桥架托盘槽盒导管固定间距和穿越保护检查', '屏蔽接地跨接端接连续性和线路绝缘测试', '标签编号方向标识和检修口可达性复核', '隐蔽影像测试记录和整改闭合资料归档', '有线电视管槽路径屏蔽接地隐蔽验收和交接签认完成'],
  '08-09-01-P06': ['公共广播分区回路线路路径和端子编号清单复核', '桥架托盘槽盒导管固定跨接和防火封堵检查', '线路绝缘扬声器回路阻抗和分区功率测试', '端子编号标签方向和消防强切接口状态核对', '隐蔽影像测试记录和问题整改资料归档', '公共广播分区回路线路绝缘隐蔽验收和交接签认完成'],
  '01-03-10-P01': ['主体结构界面轴线标高和围护体系边界复核', '围护体系与地下室外墙楼板连接节点条件核对', '预留预埋套管止水钢板和后浇接口清单确认', '变形缝施工缝防水收口和结构转换风险检查', '测量复核偏差问题整改和接口资料会签', '主体结构界面围护体系对接方案闭合签认完成'],
  '06-16-04-P09': ['制冷剂灌注范围设备编号和设计充注量复核', '抽真空保压真空度保压时长和泄漏风险记录核对', '制冷剂称量记录钢瓶编号和环境温度压力确认', '运行压力过热度过冷度和回油状态复测', '泄漏复测异常压力或充注量偏差问题闭合', '制冷剂灌注检测记录复核和签认归档完成'],
  '06-12-05-P01': ['冷却水灌水试验范围系统分区和隔离边界复核', '试验范围补水点排气点和泄水点条件确认', '液面高度保压时间和观察点位清单核对', '排放路径地漏排水沟和环保排放条件检查', '渗漏观察异常点位标识和整改责任记录', '冷却水灌水试验方案确认和试验放行签认完成'],
  '06-12-05-P08': ['渗漏点位定位编号和影响范围复核', '整改责任材料工法和复测时间窗口确认', '补焊封堵紧固更换或密封处理过程记录', '复测记录灌水观察压力保持和影像资料核对', '排放试验通畅性水质排放和现场清理检查', '渗漏问题整改排放试验复测签认闭合完成'],
  '05-09-02-P06': ['水质检测报告检测项目和卫生验收标准复核', '取样点末端编号采样时间和见证记录核对', '余氯浊度菌落总数和消毒副产物结果复核', '卫生验收资料设备批次滤芯药剂和运行记录归档', '不合格复测冲洗消毒和再次取样结果闭合', '水质检测报告复核卫生验收资料移交签认完成'],
  '05-01-08-P06': ['给水消毒检测范围管网分区和末端取样点复核', '消毒检测报告取样编号检测项目和判定标准核对', '末端取样余氯浊度菌落结果和冲洗记录复核', '冲洗复测不合格点位原因分析和整改闭合', '交接签认前运行标识阀门编号和运维边界确认', '检测结果复核消毒资料交接签认和运维边界移交完成'],
  '10-01-03-P12': ['驱动主机监督检验资料目录和设备编号复核', '曳引机底座制动器曳引轮和钢丝绳接触状态检查', '制动器动作间隙温升噪声和手动松闸功能复测', '驱动主机功能复测空载载荷和异常记录核对', '监督检验问题整改报告编号和维保资料闭合', '驱动主机监督检验功能复测和资料组卷签认完成'],
  '10-01-04-P06': ['电梯导轨垂直度轨距和接头台阶实测复核', '导轨支架间距焊接螺栓固定和防腐状态检查', '安全钳导向面轿厢运行间隙和导靴配合复测', '导轨接头错台支架松动或垂直度偏差整改复测', '验收记录实测数据影像和监督检验资料归档', '导轨垂直度支架间距安全钳验收记录签认闭合完成'],
  '08-18-04-P11': ['机房给排水阀门挂牌范围和阀门编号清单复核', '流向标识介质名称开闭状态和检修空间检查', '隐蔽记录阀门位置管径接口和保温封闭资料核对', '错标整改漏标方向错误或检修受限问题复测', '隐蔽影像编号阀门台账和运维界面资料归档', '阀门挂牌流向标识隐蔽记录复核和移交签认完成'],
  '01-02-03-P01': ['基底验槽范围轴线标高和持力层状态复核', '承载力复核检测点位设计指标和检测批次核对', '基底积水扰动处理软弱夹层和超挖区域处理记录', '勘察设计监理施工联合验槽会签和问题清单确认', '整改复测后垫层施工条件和成品保护措施复核', '基底验槽承载力复核验槽会签和垫层放行完成'],
  '01-02-10-P04': ['长螺旋钻孔压灌桩终孔深度和设计桩长复核', '钻进记录电流参数土层变化和入持力层判定核对', '终孔深度测量钻杆标尺和施工记录一致性检查', '桩长偏差电流异常或持力层不符问题会商处理', '终孔参数旁站记录影像资料和质量台账归档', '终孔深度电流参数钻进记录复核和签认闭合完成'],
  '01-02-15-P08': ['沉井沉箱验收范围轴线标高和终沉位置复核', '下沉记录纠偏措施刃脚状态和偏位复测结果核对', '封底质量混凝土强度接缝处理和渗漏情况检查', '井壁防渗检查穿墙套管施工缝和止水节点复测', '验收资料下沉监测封底记录和缺陷整改归档', '沉井沉箱验收偏位复测封底质量和移交签认完成'],
  '01-07-03-P01': ['特殊施工法防水措施范围和结构接口边界复核', '施工缝变形缝接口止水材料规格和节点详图核对', '穿墙节点套管预埋和防水加强层做法检查', '渗漏风险点监测排水和应急封堵措施确认', '样板段隐蔽影像材料复验和问题整改记录闭合', '特殊施工法防水措施接口止水复核和方案会签完成'],
  '01-07-04-P01': ['地下排水方案汇水范围和盲沟排水板布置复核', '盲沟断面滤料级配和排水板搭接方向检查', '坡向标高集水坑排水泵和出水通道条件核对', '排水通道堵塞倒坡或滤层缺陷风险点整改', '隐蔽验收影像试排水记录和维护口清单归档', '排水方案盲沟排水板出水通道复核和放行签认完成'],
  '06-03-02-P04': ['防排烟执行机构型号位置和防火阀排烟阀编号复核', '动作反馈信号开关量模拟量和控制模块接线测试', '手自动远程启动停止和阀位反馈一致性检查', '消防联动场景下动作时间反馈状态和图显记录核对', '反馈异常动作卡涩或接线错误问题整改复测', '执行机构动作反馈消防联动检查记录签认完成'],
  '08-15-07-P07': ['火灾报警调试问题清单点位编号和责任专业复核', '报警探测器手报模块声光和联动设备点位销项测试', '消防主机图显打印记录和现场动作反馈一致性复测', '联动复测失败误报漏报或地址错误问题整改闭合', '报警记录复测报告和消防检测资料签认归档', '火灾报警调试问题点位销项联动复测和签认归档完成'],
  '06-08-02-P05': ['人防通风清洁滤毒隔绝模式标识和设备清单复核', '密闭阀过滤吸收器风机和转换阀门动作复核', '清洁滤毒隔绝模式切换风向风量和压差记录核对', '密闭阀动作不到位标识错误或模式切换异常整改复测', '人防通风动作复核记录和专项验收资料归档', '清洁滤毒隔绝人防通风模式切换复核和验收移交完成'],
  '05-13-01-P11': ['锅炉特种设备监督检验资料目录和设备编号复核', '锅炉本体燃烧器安全附件和安装记录资料核对', '监督检验问题整改责任复验记录和报告编号归档', '水压试验煮炉烘炉调试记录和使用登记条件检查', '使用登记维保合同作业人员证书和运维资料闭合', '锅炉特种设备监督检验问题整改和资料组卷完成'],
  '05-13-03-P08': ['安全附件清单压力表安全阀温控保护装置编号复核', '挂牌铅封状态校验证书有效期和量程匹配核对', '安全阀整定压力压力表精度和安装位置检查', '铅封缺失证书过期或附件型号不符问题整改复测', '校验证书附件台账和监督检验资料归档', '安全附件挂牌铅封校验证书归档签认完成'],
  '05-01-07-P06': ['给水管道冲洗范围分区末端和排水路径复核', '冲洗流速流量持续时间和水源条件记录核对', '排水浊度色度杂质和末端放水结果复核', '冲洗不合格回路反复冲洗和污染源排查整改', '冲洗记录检测结果影像资料和阀门状态归档', '管道冲洗流速排水浊度记录复核和签认闭合完成'],
  '05-01-08-P03': ['给水消毒剂配制浓度药剂批次和投加方案复核', '投加点循环路径阀门状态和接触时间控制确认', '末端余氯复测取样点编号和检测仪器校准核对', '浓度不足超标或循环死角问题调整复测', '送检记录检测报告和消毒冲洗资料归档', '消毒剂配制投加接触时间余氯复测和送检记录完成'],
  '05-09-05-P01': ['饮用水调试范围卫生边界和系统隔离措施复核', '取样计划末端点位检测项目和见证安排确认', '调试前冲洗消毒旁通回路和污染风险检查', '卫生验收准备资料检测机构和判定标准核对', '隔离措施失效污染风险或资料缺项问题整改', '饮用水调试卫生边界取样计划和方案放行签认完成'],
  '06-17-03-P08': ['吸收式制冷系统真空保持范围和压力仪表校准复核', '真空保持压力曲线保压时长和环境温度记录核对', '泄漏点肥皂水检漏氦检或真空衰减异常定位', '泄漏修复抽真空重复保压和复测记录确认', '真空保持复测记录运行边界和资料归档', '吸收式制冷真空保持压力曲线复测记录签认归档完成'],
  '10-01-10-P08': ['电梯随行电缆规格长度固定点和敷设路径复核', '轿厢全行程运行电缆摆动磨碰扭转和余量检查', '随行电缆绝缘接地屏蔽连续性和端子编号测试', '全行程磨碰检查异常点整改和复测影像记录', '监督检验资料随行电缆验收记录和维保资料归档', '随行电缆全行程绝缘接地监督检验验收签认完成'],
  '05-10-03-P09': ['回用水质检测范围取样点位和检测项目复核', '取样见证记录水样编号和检测机构资质核对', '浊度余氯悬浮物和回用用途限值结果复核', '不合格复测冲洗换水或处理设备调整闭合', '验收资料检测报告运行记录和水质台账归档', '回用水质检测复核验收资料移交签认完成'],
  '06-18-06-P09': ['多联机制冷剂灌注范围室内外机编号复核', '设计追加量配管长度和冷媒计算表核对', '称量灌注钢瓶编号环境温度和压力记录确认', '运行压力过热度过冷度和回油状态复测', '泄漏复测报警或充注量偏差问题整改闭合', '制冷剂灌注检测记录复核和签认归档完成'],
  '07-06-05-P07': ['备用电源导管隐蔽范围路径和回路编号复核', '导管固定间距弯曲半径接线盒位置检查', '接地跨接防腐处理和穿墙穿楼板保护复核', '防火封堵管口封堵和隐蔽影像编号归档', '漏埋错埋跨接遗漏或封堵缺陷整改复测', '备用电源导管隐蔽验收记录签认完成'],
  '03-04-04-P08': ['专项检测范围检测批次和抽样点位复核', '检测委托见证记录和检测机构资质核对', '报告编号检测结论和现场实物状态一致性复核', '偏差整改复测结果和不合格闭合资料确认', '交接资料检测报告影像记录和台账归档', '专项检测复核交接资料签认完成'],
  '04-01-02-P07': ['隔汽层功能复测范围基层干燥度和节点清单复核', '搭接收头宽度密封和穿透节点处理检查', '破损修补污染清理和成品保护状态复核', '功能复测水汽风险点和隐蔽影像编号归档', '接缝翘边破损或收头缺陷整改复测闭合', '隔汽层功能复测和交接签认完成'],
  '05-01-09-P07': ['给水系统问题整改范围分区末端和责任清单复核', '渗漏阀门失灵压力水质偏差或供水不足整改记录核对', '末端复测压力水质流量余氯浊度和放水记录确认', '整改闭合前阀门编号运行标识和影响范围检查', '复测报告问题销项影像和运维边界资料归档', '给水系统问题整改复测记录签认完成'],
  '05-02-04-P01': ['排水试验调试范围分区清单和试验边界复核', '灌水通球通水试验点位和排放路径确认', '检查口地漏存水弯和排水坡度条件核对', '试验用水排放安全和堵塞倒坡风险预检', '异常点位整改责任和复测记录表单确认', '排水试验调试方案分区确认和试验放行完成'],
  '05-03-05-P01': ['雨水系统试验调试范围分区条件和汇水边界复核', '雨水斗溢流口立管和排出管通畅条件确认', '屋面天沟坡向排水路径和溢流路径检查', '试排水观察点位堵塞倒灌或渗漏风险预检', '异常点位整改责任和复测记录表单确认', '雨水系统试验调试方案分区条件确认和调试放行完成'],
  '05-04-04-P01': ['卫生器具试验调试范围房间清单和洁具编号复核', '洁具接口给排水角阀软管地漏和存水弯状态检查', '通水试验排水通畅溢水保护和渗漏风险观察确认', '洁具固定五金配件和成品保护条件核对', '渗漏堵塞接口松动或排水不畅风险整改闭合', '卫生器具试验调试方案房间清单确认和调试放行完成'],
  '05-05-09-P01': ['供暖系统调试范围分区回路和热源边界复核', '水压冲洗试验记录阀门状态和排气点位核对', '热态运行流量温差室温和循环状态预检', '分区平衡阀门开度和末端散热效果记录确认', '异常点位整改责任和复测记录表单确认', '供暖系统试验调试方案分区确认和调试放行完成'],
  '05-01-07-P01': ['给水冲洗范围分区末端放水点和排水路径复核', '冲洗水源条件阀门状态和冲洗流速目标确认', '末端放水点排水浊度色度杂质和持续时间记录', '污染源排查死角支管或回流风险预检', '不合格回路反复冲洗和复测记录表单确认', '管道冲洗方案放行记录和签认资料完成'],
  '05-01-08-P01': ['给水消毒范围分区管网容积和末端清单复核', '消毒剂浓度药剂批次和投加点位置确认', '循环路径阀门状态接触时间和旁通隔离检查', '末端取样计划检测项目和见证安排确认', '浓度不足循环死角或污染风险整改闭合', '给水消毒方案放行取样计划和签认资料完成'],
  '05-11-05-P01': ['泳池水系统调试范围水质目标和运行边界复核', '循环过滤设备阀门药剂投加点和取样口确认', '补水排水反冲洗和旁通管路状态检查', '药剂投加浓度余氯浊度pH和水温目标确认', '取样检测计划异常水质整改责任和复测表单确认', '泳池水系统调试方案水质目标确认和调试放行完成'],
  '06-03-04-P07': ['防排烟风机型号耐温证书和安装位置复核', '风机基础减振软接防火阀接口和电源条件检查', '风量复测电流温升振动噪声和运行参数记录', '消防联动启停远程手动和反馈信号一致性测试', '耐温证书缺项风量不足或反馈异常整改复测', '防排烟风机功能复测和交接签认完成'],
  '08-15-04-P07': ['火灾报警控制器主机回路和地址点位清单复核', '报警控制器软件版本回路卡和电源状态核对', '探测器手报模块声光反馈和故障报警测试', '主机打印图显地址点位和现场设备一致性复测', '地址错误声光反馈异常或故障报警偏差整改闭合', '报警控制器调试记录签认和资料归档完成'],
  '08-15-08-P07': ['消防检测资料清单报警联动记录和报告编号复核', '第三方检测问题销项责任专业和复测计划确认', '报警联动记录消防主机打印和现场动作证据核对', '复测报告整改照片和缺陷闭合资料归档', '检测签认前资料缺项或记录不一致问题补正', '消防检测资料配合复测报告和资料移交签认完成'],
  '08-17-04-P08': ['应急响应运维资料预案脚本和场景清单复核', '响应数据事件日志报警记录和演练结果核对', '运维账号权限角色值守通讯录和备份策略确认', '培训记录实操演示应急处置和交接问答签认', '脚本资料缺项账号权限或响应数据偏差整改闭合', '应急响应运维资料培训记录和移交签认完成'],
  '08-18-03-P09': ['机房空调运行参数移交范围和设备编号复核', '温湿度边界送回风温差和冷凝水状态核对', '告警阈值趋势记录事件日志和联动接口测试', '运行曲线连续运行稳定性和异常点位复测', '参数偏差告警误报或运维资料缺项整改闭合', '机房空调运行参数曲线告警阈值和运维移交完成'],
  '10-01-13-P09': ['电梯竣工资料目录监督检验报告和设备编号复核', '安全回路门锁限速器制动器和保护装置记录核对', '整机试验载荷平层消防迫降和五方通话报告复核', '使用登记资料维保合同钥匙工具和备件清单确认', '资料缺项监检整改或实物编号不一致问题闭合', '电梯竣工资料监督检验使用登记和维保移交完成'],
  '01-01-02-P06': ['灰土地基表面整平范围和控制桩复核', '标高复核方格网点位排水坡向和平整度检查', '压实度检测报告含水率和夯实遍数记录核对', '低洼整改松散起皮或标高偏差区域复测闭合', '验收前污染清理边角补夯和成品保护确认', '表面整平标高复核压实度资料和移交签认完成'],
  '01-01-02-P08': ['灰土地基验收范围检测批次和承载力指标复核', '现场验槽记录含水率压实系数和换填记录核对', '检测报告承载力压实度和处理范围一致性复核', '不合格点换填补夯或复压整改复测闭合', '垫层放行前标高平整度和成品保护措施确认', '灰土地基验收签认承载力资料和垫层放行完成'],
  '01-01-03-P05': ['土工合成材料上层填料范围和搭接保护状态复核', '上层填料粒径含水率摊铺厚度和分层边界确认', '压实遍数机械行走路线和搭接区保护记录核对', '搭接损伤褶皱外露或填料厚度偏差整改复测', '压实检测报告标高复测和隐蔽影像资料归档', '土工合成材料上层填料摊铺压实检测签认完成'],
  '01-01-03-P08': ['加筋垫层地基验收范围和检测批次复核', '土工合成材料搭接保护隐蔽记录和填料压实资料核对', '承载力检测压实系数沉降观测和标高复测结果确认', '材料外露搭接破损或压实不合格点整改复测', '检测报告隐蔽影像和验收资料台账归档', '加筋垫层地基验收承载力复核和放行签认完成'],
  '01-01-04-P06': ['砂石垫层表面整平范围轴线边界和控制点复核', '标高复核方格网排水坡向和平整度实测', '含水率级配摊铺厚度压实遍数和压实度核对', '低洼离析松散或标高偏差区域整改复测', '验收前边角补夯污染清理和成品保护确认', '砂石垫层表面整平标高复核压实度移交签认完成'],
  '01-01-04-P08': ['砂石地基验收范围检测批次和设计指标复核', '现场验槽级配含水率压实系数和处理记录核对', '承载力检测报告压实系数和标高平整度复核', '不合格点换填补夯离析处理和复测闭合', '垫层放行前成品保护排水和资料台账确认', '砂石地基验收复核检测报告和垫层放行完成'],
  '01-01-06-P08': ['注浆封孔范围孔号孔深和终浆记录复核', '孔口处理清孔状态封孔材料配比和批次核对', '封孔施工压力回填密实度和孔口标识记录', '养护时间成品保护和扰动风险检查确认', '渗漏复查冒浆沉陷或孔口松动问题整改闭合', '注浆封孔养护记录渗漏复查和资料闭合完成'],
  '01-01-07-P08': ['预压卸载整平范围卸载条件和监测数据复核', '沉降稳定标准固结度计算和卸载记录核对', '卸载后回弹观测孔压水位和边桩位移复查', '场地整平标高复测排水坡向和软弱区检查', '异常回弹积水松软或标高偏差区域整改闭合', '预压卸载整平沉降稳定复核和移交签认完成'],
  '01-01-07-P10': ['预压地基验收范围固结度指标和检测批次复核', '沉降曲线孔压消散卸载记录和监测报告核对', '承载力检测回弹观测和稳定标准对比确认', '异常数据复测卸载后整平和软弱区处理闭合', '验收资料监测曲线检测报告和移交台账归档', '预压地基验收固结度承载力复核和验收签认完成'],
  '01-01-13-P07': ['刚性桩复合地基桩顶处理范围和桩号清单复核', '桩顶标高截桩长度桩头质量和浮浆清理检查', '桩顶保护层垫层界面养护条件和成品保护确认', '桩头破损偏位露筋或标高偏差缺陷修补复测', '桩顶处理影像检测报告和验收台账归档', '桩顶处理和养护缺陷修补复测移交签认完成'],
  '01-02-01-P02': ['无筋扩展基础轴线控制线和基准点复核', '基础台阶尺寸边线放样和顶面标高控制点布设', '模板或垫层边界位置与设计尺寸一致性检查', '放样复核偏差整改轴线回测和标高复测记录', '验线签认前测量成果影像和控制桩保护确认', '基础轴线台阶尺寸顶面标高放样复核和验线签认完成'],
  '01-03-06-P06': ['地下连续墙钢筋笼吊点复核和吊具索具额定荷载检查', '钢筋笼整幅吊装顺序起重半径和指挥信号确认', '钢筋笼垂直度槽段中心线和入槽速度控制', '槽口保护导墙防碰撞和孔壁稳定巡查', '入槽影像接头位置保护层垫块和吊筋标高记录', '隐蔽验收吊装记录偏差整改和下道工序交接签认'],
  '01-02-11-P06': ['沉管灌注导管埋深和混凝土供应连续性复核', '拔管速度振动频率和桩身成型过程记录', '充盈系数混凝土方量和桩长桩径核算', '坍落度入模温度和试块留置记录核对', '桩顶标高超灌高度和浮浆处理范围复测', '灌注记录旁站影像异常处置和成桩资料签认'],
  '01-01-10-P05': ['水泥土搅拌桩喷浆量和水泥掺量计量复核', '下沉速度提升速度和搅拌遍数过程控制', '复搅深度桩端标高和搭接宽度检查记录', '电流记录浆液比重和设备运行状态核对', '成桩质量取芯强度或轻便触探结果复核', '参数签认异常桩处理和批量施工记录闭合'],
  '01-01-05-P04': ['强夯夯能夯锤重量和落距参数复核', '夯点偏差夯点编号和测量放样成果核对', '夯沉量逐击记录隆起量和遍间间隔控制', '分遍强夯收锤标准和异常点补夯记录', '检测复核承载力变形模量和沉降成果核验', '施工记录参数签认问题整改和地基验收放行'],
  '02-03-10-P07': ['防火涂料批次合格证耐火极限资料和样板复核', '湿膜厚度测点编号构件部位和抽测频次确认', '遍间间隔环境温湿度和基层干燥状态记录', '厚度记录干膜换算漏涂流坠和开裂缺陷检查', '耐火资料检测报告型式资料和施工记录归集', '厚度记录复测缺陷整改和防火涂装验收签认'],
  '02-04-04-P04': ['高强螺栓终拧顺序扭矩工具和摩擦面状态复核', '终拧标记螺栓外露丝扣和漏拧复查记录', '焊缝探伤范围焊缝等级和检测批次确认', '探伤比例探伤报告编号和缺陷定位台账核对', '缺陷返修工艺返修次数和复探结果闭合', '验收记录终拧探伤资料和连接质量签认完成'],
  '02-03-07-P06': ['预应力张拉力控制值千斤顶油表和校验证书复核', '伸长值理论计算实测记录和偏差判定核对', '张拉顺序分区分榀和对称张拉流程确认', '分级加载稳压时间回油锚固和滑丝检查记录', '形态偏差线形标高和节点位移复测闭合', '张拉记录监理见证问题整改和结构放行签认'],
  '02-01-06-P12': ['预制墙板柱构件吊点复核构件编号和吊具状态检查', '构件吊装就位垂直度轴线偏差和标高复测', '临时支撑锁定角度间距和防松措施确认', '灌浆前检查套筒通畅坐浆封仓和接缝状态', '安装影像构件二维码支撑状态和偏差整改记录', '交接签认安装质量灌浆条件和安全状态移交完成'],
  '06-13-05-P07': ['地埋换热回路试压介质和系统分区边界确认', '压力等级压力表校验和升压分级曲线记录', '保压时长环境温度和允许压降标准复核', '压降记录稳压过程接口节点和管沟状态巡查', '接口查漏渗漏点定位整改和复压复测闭合', '试压报告见证记录影像资料和隐蔽移交签认'],
  '06-14-06-P06': ['水质检测采样点编号代表性和取样容器核对', '检测仪校准证书量程和现场比对记录复核', '硬度浊度pH检测过程读数和原始记录归集', '指标阈值设计要求运行标准和判定结论核对', '不合格复测冲洗换水药剂调整和原因分析闭合', '水质报告检测结论运行边界和运维资料移交'],
  '08-15-01-P05': ['火灾报警管槽穿越防火分区位置和回路清单复核', '封堵材料耐火等级批次合格证和施工厚度检查', '接地连续性桥架导管跨接点和测试仪表核对', '接地跨接焊接螺栓连接防腐和导通记录归集', '隐蔽影像封堵前后编号点位和整改复测闭合', '封堵验收接地测试资料和消防调试界面签认'],
  '08-10-01-P06': ['会议系统管槽路径点位编号和隐蔽范围复核', '接地跨接桥架导管机柜端和导通测试记录', '防火封堵穿越部位材料批次和施工厚度检查', '隐蔽验收影像编号端子盒位置和线缆保护状态确认', '回路标识线缆标签设备端口和竣工图一致性核对', '移交签认隐蔽资料测试记录和会议系统安装界面闭合'],
  '10-01-12-P03': ['电梯安全回路回路编号和控制柜端子图复核', '门锁回路厅门轿门触点动作和短接风险检查', '限速器安全钳回路接线动作和复位状态测试', '极限开关上下极限位置动作距离和反馈信号复核', '绝缘测试接地连续性和回路电阻记录归集', '监检资料回路测试报告问题整改和监督检验签认'],
  '10-02-03-P04': ['液压电梯液压管路走向固定支架和接口状态复核', '试验压力压力表校验升压分级和安全隔离确认', '保压时长压降标准和液压站运行状态记录', '接口渗漏油缸阀组接头和软管连接巡检', '整改复测泄漏点修复再试压和异常记录闭合', '油路清洁过滤换油记录试验报告和验收签认'],
  '02-05-03-P05': ['型钢混凝土焊材批次烘干记录和材质证明核验', '机械连接连接器批次型式检验和适配规格复核', '接头位置钢筋避让型钢孔洞和设计间距检查', '外观检测焊缝成型丝扣外露和连接紧固状态记录', '隐蔽验收接头抽检报告影像资料和实测数据归集', '问题销项缺陷返修复检和钢筋型钢交接签认完成'],
  '01-02-09-P08': ['桩顶保护范围桩号清单和桩头外观复核', '养护覆盖保湿保温措施和龄期记录检查', '桩头标高截桩面平整度和保护层状态复测', '成品保护车辆通行堆载限制和警示标识确认', '缺陷复查桩头破损松散和污染问题整改闭合', '移交签认桩顶保护养护记录和检测界面交接完成'],
  '01-03-06-P02': ['地下连续墙导墙混凝土浇筑范围和槽口线形复核', '槽口线形轴线宽度垂直度和模板加固检查', '坍落度入模温度和试块留置记录核对', '分层振捣导墙转角和施工缝处理过程记录', '养护覆盖保湿保温和导墙成品保护检查', '导墙验收尺寸强度资料和成槽作业面移交签认'],
  '01-05-03-P05': ['场地碾压遍数机械组合和碾压路线记录复核', '压实度检测点位含水率和检测报告核对', '边界修整红线范围排水坡向和临边界面检查', '标高复测方格网成果低洼区和坡向偏差确认', '软弱点整改换填补压和沉陷风险复测闭合', '场地移交碾压整平资料和后续作业面签认'],
  '01-06-02-P05': ['挡土墙沉降缝伸缩缝位置间距和设计详图复核', '缝宽控制嵌缝深度垂直度和通缝状态检查', '填缝材料批次规格防水性能和施工环境核验', '止水节点止水带定位搭接和端部收口记录', '缝内杂物清理破损修补和渗水风险复测闭合', '验收记录隐蔽影像材料资料和分段移交签认'],
  '02-03-02-P06': ['紧固件连接批次规格和连接副复验资料核对', '终拧标记扭矩工具校验和施拧顺序复查', '扭矩抽检节点编号抽检比例和偏差判定记录', '连接外观螺栓外露丝扣垫圈方向和漏拧检查', '复测销项欠拧超拧漏装和返修记录闭合', '验收签认紧固件连接质量记录和检测资料归档'],
  '02-03-04-P07': ['单层钢结构安装偏差复测轴线标高和柱网尺寸核对', '轴线标高控制点复测和构件编号定位记录归集', '垂直度侧向弯曲和屋面梁挠度实测复核', '高强螺栓终拧焊缝外观和节点连接状态检查', '功能复测吊车梁轨距檩条支撑和围护接口确认', '交接签认偏差整改资料和后续围护施工界面移交'],
  '02-03-10-P02': ['防火涂料批次型号耐火极限和合格证核验', '型式资料检测报告适用构件和设计厚度复核', '复验取样批次抽样比例和见证送检记录归集', '粘结强度试验基层处理和样板附着状态复核', '耐火资料厚度设计说明和施工记录清单闭合', '材料放行复验报告缺项补正和施工班组交底完成'],
  '02-04-04-P06': ['空间节点防腐补刷范围焊缝螺栓和损伤点位复核', '除锈等级表面清洁度粗糙度和环境条件检查', '涂层厚度干膜测点编号和遍数间隔记录', '隐蔽影像节点封闭前补刷状态和缺陷点位留痕', '防腐资料涂料批次检测报告和施工记录归集', '签认防腐补刷复测隐蔽资料和面层施工界面完成'],
  '02-04-06-P06': ['空间结构混凝土试块留置部位组数和编号复核', '养护条件覆盖保湿温湿度和龄期台账记录', '同条件试块放置位置保护措施和累计温度归集', '强度报告回收设计强度和拆撑放行条件核对', '实体复核外观缺陷裂缝和尺寸偏差检查闭合', '放行签认强度资料试块台账和后续工序移交'],
  '02-05-05-P07': ['型钢混凝土浇筑前交接范围和界面条件复核', '钢筋型钢节点钢筋避让焊接连接和保护层检查', '预埋件锚栓套管位置固定和隐蔽影像记录', '隐蔽签认接头检测型钢防腐和模板加固资料闭合', '浇筑放行坍落度泵送路线和振捣措施确认', '问题闭合交接清单整改复测和混凝土浇筑许可签认'],
  '05-05-05-P05': ['电加热供暖冷热线接头位置和接头数量清单复核', '绝缘测试接头前后绝缘电阻和接地连续性记录', '接头密封防水绝缘套管热缩质量和保护措施检查', '温控回路编号传感器位置和控制器接线核对', '隐蔽影像接头位置保护层和标识编号归档', '通电复测升温曲线异常发热点和验收记录签认'],
  '06-01-02-P04': ['送风系统导流片消声部件规格型号和安装位置复核', '消声部件长度截面尺寸和气流方向标识检查', '尺寸复核导流片角度间距和固定边框偏差记录', '固定间距铆接螺栓密封垫和防松措施复查', '风阻风险异响松动变形和漏风隐患整改闭合', '验收记录尺寸实测影像和部件编号移交签认'],
  '06-02-02-P04': ['排风系统止回阀规格型号和安装部位复核', '防倒流方向阀板开启方向和气流箭头标识检查', '动作灵活性手动启闭复位和卡涩状态测试', '密封状态阀板闭合间隙密封垫和漏风风险复查', '标识复核编号流向检修空间和维护口位置确认', '记录签认检查数据整改复测和排风部件移交完成'],
  '04-01-02-P01': ['隔汽层基层含水率检测点位和检测结果复核', '基层平整度阴阳角圆弧和浮灰油污清理检查', '隔汽层搭接宽度铺贴方向和搭接缝压实记录', '收头密封女儿墙管根和穿透节点密封复查', '完整性检查破损空鼓翘边和污染缺陷整改闭合', '隐蔽验收影像编号材料批次和后续保温施工移交'],
  '04-05-02-P04': ['屋面天沟坡向标高排水路径和积水风险复核', '落水口杯位置标高附加层和周边密封检查', '淋水闭水试验分区水位时间和见证记录归集', '节点渗漏天沟转角泛水和落水口渗漏定位', '整改复验修补部位二次淋水和影像闭合', '屋面移交排水功能资料和成品保护边界签认'],
  '04-05-05-P06': ['屋面变形缝位置长度和节点详图复核', '缝宽复核基层高差盖板支座和变形余量检查', '盖板固定连接件间距防松和伸缩滑移状态复查', '泛水收口附加层密封胶和端部收头施工记录', '淋水复核水流方向节点渗漏和盖板排水状态检查', '渗漏闭合整改复测影像资料和变形缝验收签认'],
  '03-12-04-P02': ['护栏扶手后置埋件位置基层厚度和边距复核', '基层承载混凝土强度空鼓裂缝和基层缺陷检查', '锚固施工钻孔深度清孔植筋胶和固化时间记录', '拉拔试验抽样点位荷载值和检测报告核对', '防坠安全临边防护高度和连接节点风险复查', '安装放行埋件隐蔽资料拉拔合格和作业面移交签认'],
  '03-12-04-P06': ['护栏高度实测点位楼梯平台和临空部位复核', '立杆间距栏板净距和扶手连续性检查记录', '防坠构造防攀爬防脱落和儿童安全构造复核', '连接牢固焊缝螺栓玻璃夹具和预埋节点检查', '偏差整改高度间距松动和观感缺陷复测闭合', '验收签认实测记录安全构造资料和移交完成'],
  '03-01-03-P07': ['板块面层空鼓检查抽查布点和房间编号确认', '敲击记录空鼓范围面积和缺陷位置标识记录', '缺陷标识空鼓裂缝松动和污染点位编号归集', '返修处理切割清理粘结层重铺和养护记录', '返修复验二次敲击观感和标高平整度复测', '销项签认空鼓整改台账影像和分户验收资料闭合'],
  '06-16-04-P01': ['制冷剂系统抽真空范围阀门状态和真空泵能力复核', '真空保压真空度保压时长和环境温度记录', '称量灌注钢瓶编号电子秤校验和灌注量记录', '制冷剂重量追加量计算配管长度和设计值核对', '过热度过冷度运行压力和回油状态复核', '运行复核泄漏检测报警记录和调试报告签认'],
  '06-10-06-P01': ['辐射板和埋地管排布深化图版本和分区边界复核', '埋地管排布管间距转弯半径和固定卡间距检查', '固定间距支架卡扣保温垫和防位移措施确认', '压力试验试压介质压力等级和保压记录归集', '覆盖前隐蔽影像编号管路保护和成品保护检查', '验收签认隐蔽资料试压报告和覆盖施工放行完成'],
  '07-06-06-P01': ['备用电源电缆规格长度型号截面和设计回路复核', '盘检资料合格证检测报告和绝缘出厂资料核验', '敷设条件桥架管沟防火分区和转弯空间检查', '绝缘测试敷设前后绝缘电阻和耐压计划确认', '标识记录电缆盘号起终点回路编号和相序台账', '放缆放行路径保护牵引张力和隐蔽记录要求签认'],
  '07-07-03-P03': ['等电位干线敷设范围联接点清单和路径复核', '跨接连续性搭接长度焊接质量和防腐处理检查', '隐蔽影像联接点编号跨接部位和封闭前状态记录', '接地测试测试仪表校验和接地电阻或导通值记录', '导通记录异常点位整改复测和台账回写闭合', '移交签认等电位干线测试资料和隐蔽验收完成'],
  '08-05-02-P06': ['光缆熔接芯数清单熔接机校验和端口对应复核', '尾纤保护热缩套管固定和配线架端接状态检查', '盘纤半径余量盘留光纤弯曲和防压保护复查', 'OTDR测试距离衰耗事件点和曲线文件归集', '损耗测试光功率插损回损和异常点整改闭合', '标签归档纤芯编号链路报告和端口台账移交'],
  '08-14-02-P04': ['BMS控制线通讯线回路范围和点表版本复核', '端子编号DDC箱端子排设备端和线号一致性检查', '屏蔽接地单端接地连续性和抗干扰措施复查', '通讯地址设备地址波特率协议参数和冲突检查', '回路测试单点启停反馈模拟量读数和趋势记录', '点表回写端子表测试报告和系统调试界面移交'],
  '08-15-02-P03': ['火灾自动报警线缆回路清单和防火分区边界复核', '牵引保护穿管桥架转弯半径和线缆外护套检查', '分区标识回路编号端子箱地址和线缆标签核对', '绝缘测试回路绝缘电阻接地状态和测试记录归集', '防火封堵穿越楼板墙体材料批次和隐蔽影像记录', '回路核验地址点位主机显示和消防调试资料移交'],
  '08-16-02-P04': ['安防报警回路防区编号和报警点位清单复核', '防区映射探测器地址模块和控制主机分区关系核对', '线缆测试绝缘导通屏蔽和末端电阻状态记录', '标签清册线缆端子设备编号和竣工图一致性检查', '联动核对报警触发视频门禁和平台事件记录验证', '调试移交报警回路台账问题销项和运维签认完成'],
  '08-18-09-P02': ['电磁屏蔽壳体和网体材料规格型号批次复核', '材质批次导电材料镀层厚度和合格证资料核验', '搭接导通搭接宽度紧固件间距和接触面处理检查', '屏蔽材料见证取样导通测试和外观缺陷记录归集', '屏蔽壳体网体破损污染变形和批次不符问题闭合', '材料放行屏蔽材料台账检测资料和安装界面签认'],
  '08-19-03-P01': ['智能建筑等电位联接范围确认和防雷分区复核', '联接点清单机柜桥架管线和设备外壳编号核对', '跨接施工导体规格搭接长度焊接或压接质量检查', '连续性测试测试仪表校验导通值和异常点位记录', '隐蔽记录影像编号防腐处理和封闭前验收资料归集', '范围确认测试报告整改闭合和系统接地移交签认'],
  '10-02-09-P06': ['液压电梯悬挂装置钢丝绳或链条规格状态复核', '悬挂状态张力均衡固定端和防松措施检查', '安全件安全钳限速器缓冲器和保护装置资料核对', '监督检验抽查项目实测数据和监检意见记录', '问题整改磨损松动偏载和监检问题复测闭合', '资料闭合悬挂装置验收记录监督检验和移交签认'],
  '10-01-11-P08': ['曳引电梯补偿装置安装位置张紧状态和导向复核', '噪声振动运行区段速度载荷和测点布置确认', '复测工况空载满载上下行和连续运行记录归集', '限值判断噪声振动摆动量和设计允许值比对', '整改闭合导向轮张紧装置磨碰异响问题复测', '验收签认补偿装置复测报告和监督检验资料归档'],
  '01-05-03-P02': ['表土清理范围和清运厚度现场复核', '障碍物清除地下构筑物和杂物记录归集', '地下管线探查保护标识和权属确认闭合', '外运台账车辆路线消纳去向和影像资料核对', '基底保护扰动积水和软弱点检查整改', '场地移交清表资料和后续土方作业面签认'],
  '01-05-03-P03': ['挖填平衡方案土源去向和分区边界复核', '调配复核运距路线堆场容量和施工组织确认', '土方方格网原地面复测和设计标高核对', '弃土利用分类含水率和回填适用性记录', '标高复核挖填完成面和边坡坡向检查', '调配记录土方台账结算量和移交资料闭合'],
  '01-06-02-P02': ['挡土墙材料规格强度等级和进场批次复核', '石材块材外观尺寸风化裂纹和堆放状态检查', '砂浆强度配合比试块留置和试验资料核对', '排水材料反滤层泄水孔和盲沟材料验收', '见证取样石材砂浆和排水材料送检记录归集', '材料放行复验报告缺陷处理和砌筑作业面签认'],
  '01-07-05-P04': ['浆液配合比试验报告和材料批次核验', '水灰比现场计量搅拌时间和稠度控制', '外加剂品种掺量相容性和使用条件确认', '试注压力分级控制孔号深度和返浆记录', '流动度初凝时间和泌水状态现场复测', '参数签认试注成果和批量注浆控制值确认'],
  '01-07-05-P08': ['封孔材料规格强度和适用部位复核', '孔口处理清理凿毛止浆和排水状态检查', '封孔密实灌注饱满度和表面收口记录', '养护保护覆盖保湿防碰撞和标识维护', '渗漏复查孔口周边潮湿裂缝和补强闭合', '资料闭合封孔影像检测记录和验收签认'],
  '02-01-03-P11': ['养护覆盖范围材料和开始时间复核', '保湿保温温湿度记录和养护龄期台账归集', '成品保护荷载限制通行控制和边角防护检查', '试块强度同条件或标养报告回收核对', '裂缝检查外观缺陷宽度位置和处理记录闭合', '浇筑移交养护资料实体复核和后续工序签认'],
  '02-01-05-P02': ['拆模条件构件部位龄期和审批资料复核', '同条件试块放置位置累计温度和编号核对', '强度报告设计强度拆模强度和结论确认', '模板支撑拆除范围临时支撑和安全措施检查', '缺陷检查棱角蜂窝裂缝和尺寸偏差记录', '拆模放行强度资料缺陷整改和作业面移交签认'],
  '02-03-05-P07': ['多层钢结构安装范围楼层分区和构件编号复核', '安装偏差轴线标高柱网尺寸和节点定位实测', '垂直度层间位移侧弯和整体偏差复测', '节点连接高强螺栓焊缝和临时固定状态检查', '功能复测楼层支撑檩条楼承板和围护接口确认', '交接签认偏差整改资料和后续专业界面移交'],
  '02-03-09-P07': ['破损补涂范围焊缝边角和运输损伤点位复核', '除锈等级表面清洁粗糙度和环境条件检查', '涂层厚度干膜测点编号遍数和间隔记录', '防腐资料涂料批次检测报告和施工记录归集', '复测销项漏涂流坠针孔和厚度不足整改闭合', '验收签认补涂复测资料和隐蔽面移交完成'],
  '02-03-10-P10': ['耐火极限构件清单设计厚度和适用报告复核', '厚度报告测点布置干膜厚度和抽检比例核对', '防火涂料验收基层处理粘结强度和外观检查', '检测资料型式报告复验报告和施工记录归集', '缺陷整改空鼓开裂厚度不足和污染问题复测', '资料组卷耐火资料验收记录和交付签认完成'],
  '02-04-06-P02': ['混凝土配合比设计强度原材批次和试配资料复核', '坍落度扩展度入场抽测和工作性记录', '浇筑部位分区标高构件编号和浇筑顺序确认', '试配报告外加剂掺量水胶比和耐久性指标核对', '入模温度环境温度运输时间和保温措施检查', '参数签认配合比坍落度温度和浇筑放行确认'],
  '02-05-07-P06': ['试块留置部位组数编号和见证要求复核', '型钢混凝土节点区域试块代表性和浇筑批次确认', '同条件养护放置位置保护措施和累计温度记录', '强度报告回收设计强度龄期和结论核对', '养护记录覆盖保湿温控和实体外观检查闭合', '放行签认强度资料试块台账和后续工序移交完成'],
  '02-06-06-P06': ['框架整体偏差测量范围控制点和复测方案确认', '轴线标高柱梁节点坐标和楼层基准核对', '节点连接焊缝螺栓支座和临时固定状态复查', '卸载复测分级卸载变形回弹和监测记录归集', '整改闭合偏差超限节点松动和变形问题复测', '交接签认整体复核资料和围护安装界面移交'],
  '03-01-01-P04': ['标高控制线房间基准点和门口标高复核', '坡度复核找平坡向地漏和排水路径检查', '排水坡向低洼积水风险和边角收口确认', '平整度实测靠尺测点编号和偏差记录', '偏差整改高低差裂缝空鼓和起砂问题闭合', '基层移交实测资料清理状态和面层作业面签认'],
  '03-01-02-P07': ['养护覆盖材料范围和开始结束时间记录', '成品保护通行限制污染防护和边角保护检查', '强度增长试块或回弹记录和开放条件确认', '裂缝空鼓敲击检查位置标识和缺陷台账归集', '污染防护油污泛碱划伤和返修复测闭合', '面层移交养护资料观感复核和后续使用签认'],
  '03-01-03-P04': ['试铺排砖房间控制线拼缝和色差预排确认', '结合层摊铺厚度稠度和基层湿润状态检查', '铺贴密实敲击压实缝宽控制和边角收口记录', '平整度标高坡度和接缝高低差实测', '空鼓预控背涂满浆边角补浆和养护保护检查', '铺贴记录批次部位影像和分户验收资料归集'],
  '02-01-06-P01': ['构件拆分编号楼栋楼层构件类型和二维码规则复核', '连接节点清单套筒锚筋预埋件和企口节点核对', '吊点埋件复核吊装受力吊点型号和位置偏差检查', '套筒位置复核灌浆孔出浆孔和连接钢筋定位确认', '变更闭合台账设计变更洽商和构件清单版本归集', '构件清单移交生产编号深化图和现场安装界面签认'],
  '02-01-06-P04': ['钢筋骨架尺寸主筋箍筋间距和构件边线复核', '吊点型号位置吊钉锚固长度和防错装标识检查', '预埋件固定套筒线盒锚板和支撑件防偏移复查', '保护层垫块规格间距和混凝土浇筑保护措施确认', '隐蔽影像编号钢筋吊点预埋件和模具位置归档', '工厂验收记录隐蔽资料缺陷整改和浇筑放行签认'],
  '02-01-06-P05': ['套筒规格批次合格证复验和构件适用部位核对', '定位胎架复核孔位控制线和构件模具基准确认', '套筒垂直度外露长度中心偏差和保护措施检查', '出浆孔通畅逐孔通球吹扫和封堵状态记录', '预埋件防偏移固定夹具焊点和浇筑前复测闭合', '隐蔽签认资料套筒预埋件影像和验收记录归档'],
  '02-01-06-P10': ['构件二维码核验编号规格楼层轴线和运输批次一致性', '外观裂损检查缺棱掉角裂缝污染和修补状态记录', '支垫位置标识支垫间距受力点和防倾覆措施确认', '堆放稳定复核堆场承载限高排水和通道条件检查', '倒运吊点保护吊具匹配边角防护和二次损伤复查', '接收台账移交构件状态缺陷处理和安装批次签认'],
  '02-01-06-P14': ['支撑立杆间距排布位置基础承载和扫线复核', '可调托撑标高顶托伸出长度和梁板底标高确认', '扫地杆水平杆剪刀撑和连系杆设置检查', '梁板搁置长度支承边界和临时限位措施复核', '沉降观测点布设初始值和支撑变形监测记录', '验收签认记录支撑体系整改闭合和吊装作业面放行'],
  '02-01-06-P15': ['构件编号方向吊装顺序轴线定位和安装面清理复核', '吊装平衡检查吊具夹角试吊状态和构件姿态控制', '搁置长度实测支座宽度垫片厚度和标高偏差记录', '板缝宽度复核拼缝顺直高差和后浇带宽度确认', '临时固定状态支撑限位拉结和防倾覆措施检查', '安装影像归档构件就位偏差复测和交接签认完成'],
  '02-01-06-P19': ['封仓密实检查底缝侧缝封堵和漏浆风险复核', '灌浆料流动度温度搅拌时间和材料批次记录', '灌浆压力记录灌浆顺序持压时间和用量台账归集', '出浆饱满确认逐孔出浆封堵和旁站影像闭合', '试块编号养护留置组数同条件位置和送检台账核对', '灌浆记录移交强度报告实体抽检和隐蔽验收签认'],
  '02-01-06-P21': ['桁架筋清理浮浆杂物除锈和构件表面润湿检查', '叠合层钢筋间距锚固搭接保护层和马凳设置复核', '机电管线定位线盒套管预留预埋和避让措施确认', '预留洞口复核洞口尺寸加固钢筋和边模固定检查', '隐蔽验收影像钢筋管线洞口和节点处理资料归档', '浇筑资料移交隐蔽签认缺陷整改和现浇层放行完成'],
  '06-20-01-P02': ['点表版本核对设备编号系统图和控制点位一致性', '量程单位复核传感器范围精度单位和设计参数匹配', '测点位置标识安装高度采样位置和维护空间检查', '安装方向检查探头朝向气流方向和防护套管状态', '校验证书归集仪表证书有效期和现场比对记录闭合', '测点清册移交点位编号校验记录和调试边界签认'],
  '06-20-02-P03': ['阀位行程标定全开全关中间位和机械限位确认', '开闭方向核验控制命令阀体箭头和现场动作一致性', '限位开关测试开到位关到位反馈和故障报警验证', '反馈信号比对DDC显示现场阀位和趋势记录一致性', '手自动切换记录就地远程切换和应急操作状态确认', '复测报告签认异常整改动作复测和联调资料移交'],
  '06-20-02-P04': ['端子编号核对执行器端DDC端和线号标识一致性', 'DDC地址校验设备地址点位类型和通讯参数复核', '反馈状态采集开关量模拟量趋势和报警状态记录', '点对点测试截图控制命令反馈显示和时间戳归档', '异常点销项错线反向延迟和通讯异常整改闭合', '点表回写移交测试报告端子表和系统调试界面签认'],
  '06-20-03-P05': ['场景矩阵核对排烟送风分区设备和触发条件确认', '风机启停反馈手自动状态运行电流和故障反馈记录', '风阀状态复核开启角度防火阀复位和反馈一致性', '风量测点记录测点布置实测风量和设计值比对', '压差梯度复测前室楼梯间走道和报警阈值确认', '联动记录归档消防主机BMS反馈和问题整改签认'],
  '05-13-04-P09': ['一二次侧边界热源换热站分集水器和阀组状态确认', '循环泵状态启停频率流量扬程和备用泵切换记录', '调节阀开度平衡阀设定支路编号和阀位锁定复核', '供回水温差热量表温度压力和趋势数据归集', '流量平衡记录支路流量偏差整改和复测结果闭合', '运行参数移交水力平衡报告控制参数和运维边界签认'],
  '06-16-06-P05': ['加载工况设定负荷比例水温边界和运行时段确认', '冷冻水流量流量计校验阀位状态和设计值比对', '冷却水温差进出水温度冷却塔状态和水质记录', '压缩机电流电压油压振动和保护动作趋势归集', '能效参数记录制冷量功率COP和偏差分析闭合', '试运行报告签认异常整改复测和运行参数移交完成'],
  '06-18-07-P04': ['控制线端子编号通讯线极性和屏蔽接地复核', '膨胀阀开度初始开度调节范围和动作响应测试', '室内外机地址拨码通讯地址和系统拓扑核验', '压力温度采样传感器读数趋势和设计参数比对', '报警反馈复测过冷过热通讯故障和保护动作闭合', '联调记录移交控制参数测试截图和运维边界签认'],
  '08-15-02-P04': ['主机柜固定基础槽钢垂直度和检修空间复核', '回路卡配置容量地址分区和备用回路核对', '端子编号核对回路线号模块地址和端子排一致性', '接地绝缘测试接地连续性绝缘电阻和记录归集', '地址点导入点位清单设备编码和主机显示核验', '安装验收资料设备资料测试记录和缺陷闭合归档'],
  '08-15-02-P05': ['手报声光点位安装高度防火分区和图纸一致性复核', '模块地址编码输入输出模块地址和设备映射核验', '消防电话插孔位置编号通话测试和线路状态记录', '广播切换模块分区矩阵强切反馈和端子接线检查', '设备标签清册点位编号房间号和竣工图一致性确认', '抽测记录归档报警反馈联动测试和问题销项完成'],
  '08-14-02-P05': ['DDC箱体固定安装位置检修空间和防护等级复核', '箱内端子排编号线号和强弱电隔离状态检查', '通讯地址设置网络地址波特率协议和冲突排查', '电源接地测试供电回路接地连续性和绝缘记录', '箱门标识编号系统名称控制范围和维护标签核对', '控制箱验收记录接线测试缺陷整改和点表移交签认'],
  '08-10-02-P04': ['主机矩阵安装机柜位置供电散热和接地状态复核', '话筒单元编号席位编号地址设置和拾音效果测试', '音视频接口HDMI音频网络和控制线缆标识核对', '控制软件配置会议模式权限场景和备份文件归集', '场景预设测试发言显示录播和扩声联动验证', '设备清单移交配置文件说明书和运维账号签认'],
  '08-18-10-P04': ['供配电状态UPS配电柜PDU和接地连续性复核', '空调温湿度冷通道热通道温湿度和告警阈值测试', '消防报警点烟感温感气体灭火和释放反馈核验', '门禁监控联动门禁摄像机动环平台和事件记录验证', '动环告警记录漏水温湿度供电和消防事件闭环', '系统调试报告缺陷整改截图台账和运维交接签认'],
  '03-09-01-P08': ['胶缝基层清洁灰尘油污水分和粘结面状态检查', '泡沫棒深度直径嵌入深度和连续性复核', '胶缝宽厚比缝宽深度设计值和现场实测记录', '打胶连续饱满气泡断胶污染和端部收口检查', '表面修整检查顺直度饱满度色差和污染清理闭合', '相容性资料归档底涂试验批次和施工记录签认'],
  '03-09-01-P09': ['淋水分区编号立面轴线楼层和试验范围确认', '喷淋压力时长喷头布置水压流量和见证记录归集', '室内渗漏巡查窗边胶缝节点和板缝渗水检查', '渗漏点标识位置照片原因分析和责任界面记录', '整改复淋记录修补部位二次淋水和销项影像闭合', '幕墙验收资料淋水报告隐蔽资料和移交签认完成'],
  '04-03-01-P08': ['试验分区编号屋面区域水落口和封堵边界确认', '水位高度标识蓄水深度闭水起止时间和见证记录', '观察时长记录室内顶棚管根节点和渗漏巡查结果', '渗漏点定位裂缝卷材搭接收头和穿屋面节点标识', '修补复验影像修补材料二次闭水和问题销项归档', '防水验收签认试验报告隐蔽影像和保护层移交完成'],
  '01-07-03-P06': ['洞口接口清理泥浆杂物松散边缘和基层状态复核', '止水构造复核止水带止水环和加强层位置确认', '密封材料批次材料合格证复验报告和施工环境核验', '节点闭合检查压实饱满收口连续和外观缺陷记录', '渗漏复测记录试水观察潮湿点和修补闭合资料归集', '防水资料移交隐蔽影像检测记录和专项验收签认'],
  '05-06-02-P08': ['消火栓编号核对位置编号箱体标识和系统图一致性', '出水压力复测最不利点压力流量和稳压状态记录', '水带接口检查接口密封水枪水带和启闭灵活性复核', '阀门启闭复查阀门状态启闭方向和挂牌编号确认', '问题整改复测压力不足渗漏卡涩和标识缺陷闭合', '交接资料签认试验记录设备台账和运维界面移交'],
  '05-06-03-P07': ['调试问题清单冲洗试压通水和阀门异常项归集', '冲洗压力复核冲洗流速排放路径和水质状态确认', '排放状态复测排水点畅通泥沙排尽和污染控制记录', '阀门状态复查阀门开度编号流向和锁定状态检查', '整改影像归档返修位置二次测试和问题销项资料闭合', '复测签认闭合调试记录复测结果和移交条件确认'],
  '05-07-01-P07': ['坡度流向复核管底标高坡度方向和检查井标高记录', '通球通水复测通球路径水流状态和堵塞风险确认', '接口渗漏复查承插接口检查井接口和渗漏点记录', '检查井连通确认井室编号上下游连通和井底流槽复核', '整改闭合记录倒坡堵塞渗漏和沉降问题复测闭合', '交接签认试验资料竣工测量和运维界面移交'],
  '05-10-06-P01': ['回用系统调试范围和水源边界确认', '阀门泵组水处理设备状态复核', '水质检测项目采样点和仪器校验证书核对', '试运行参数流量液位和水质记录归集', '异常指标整改复测和调试报告签认'],
  '05-12-04-P01': ['水景调试范围喷头分区和控制模式确认', '泵组阀门灯具和漏电保护状态复核', '蓄水补水排水和防滑隔离措施检查', '喷水高度水形效果和电气安全测试记录', '问题整改复测和运行移交签认'],
  '06-01-07-P01': ['测点布置复核风口支路设备和代表性测点确认', '风量目标确认设计风量允许偏差和调试分区目标冻结', '风阀状态清单风阀编号初始开度和检修空间检查', '仪表校验证书风量罩风速仪压差计和有效期核对', '分区调试边界系统边界阀门状态和联动对象确认', '记录表单交底调试表格见证点和问题台账建立'],
  '06-02-08-P01': ['排风分区边界房间支路风机和污染源范围确认', '测点风口清单排风口支路测点和编号台账复核', '风机工况确认转速电流风压和控制模式检查', '支路平衡目标设计风量阀门开度和允许偏差确认', '串味风险点止回阀压差气流方向和倒灌风险复核', '调试记录模板测点数据问题清单和复测签认表交底'],
  '06-03-02-P02': ['防火阀排烟阀型号规格和耐火等级核验', '阀件合格证型式报告和批次资料复核', '动作温度启闭方向和复位功能抽查', '风管耐火材料厚度外观和封样确认', '资料缺项补正和进场使用放行签认'],
  '06-04-09-P01': ['除尘系统调试范围和粉尘源工况确认', '风机除尘器排污设备和防爆附件状态复核', '测点布置风量风压和除尘效率测试准备', '调试运行数据异常报警和联锁功能记录', '缺陷销项复测和调试资料签认'],
  '06-06-10-P01': ['精度目标冻结温度湿度洁净压差和允许波动范围确认', '温湿度测点代表点回风点工作区和记录频率复核', '压差边界确认房间门缝风阀状态和压差梯度目标', '传感器校验温湿度压差传感器证书和现场比对记录', '连续运行时段运行小时负荷工况和趋势采集计划确认', '偏差处理台账超差原因调整措施和复测责任人明确'],
  '06-07-02-P07': ['净化部件编号规格和洁净保护状态复核', '阀件消声静压箱外观尺寸和密封面检查', '启闭灵活性严密性和端口封闭复测', '不合格部件返修更换和复验记录', '移交清册影像资料和安装放行签认'],
  '06-11-03-P01': ['冷热水系统冲洗分区和阀门边界确认', '排污路径过滤器旁通和临时接管条件复核', '冲洗流速水质浊度和排放观察记录', '过滤器清理二次冲洗和异常点整改', '冲洗记录签认和试压调试界面移交'],
  '06-12-03-P01': ['冷却水管网冲洗范围和冷却塔边界确认', '排污口临时管线和补水条件复核', '循环泵试运过滤器清理和水质观察记录', '杂质堵塞泄漏问题整改和复冲洗', '冲洗资料签认和水处理调试移交'],
  '06-10-09-P01': ['试压分段边界冷凝水管段阀门封堵和试验压力确认', '冷凝水坡度管底标高坡向和低洼积水风险复核', '排水点核对地漏集水井排放路径和防倒灌措施检查', '冲洗排放路径排水通畅污染控制和临时排放许可确认', '漏水复测点接口弯头穿墙套管和吊顶隐蔽点布设', '调试记录签认试压冲洗排水和漏水复测资料闭合'],
  '06-13-07-P01': ['地埋侧边界地埋管分区集分水器和阀门状态确认', '流量平衡目标支路流量设计值和平衡阀初始开度复核', '水温测点计划进出水温度地温和热泵侧测点布置', '热泵工况表制热制冷切换和部分负荷工况记录模板确认', '切换策略确认地埋侧机组侧和末端侧切换条件复核', '异常复测台账流量不足温差异常和报警问题跟踪建立'],
  '06-16-06-P01': ['制冷系统边界冷机水泵冷却塔和阀门状态确认', '冷媒水路状态冷冻水冷却水流量压差和排气补水检查', '负荷工况设定加载比例水温目标和试运行时段冻结', '保护参数清单高低压油压水流开关和联锁阈值复核', '仪表校验压力温度流量电流仪表证书和现场比对归集', '试运行记录表运行参数异常处置和见证签认表交底'],
  '06-17-03-P01': ['吸收式系统真空试验范围和封闭边界确认', '真空泵压力表和检漏仪器校验证书核对', '抽真空过程压力变化和保压记录归集', '泄漏点定位修复和复抽复验记录', '真空试验报告签认和溶液加灌条件确认'],
  '06-17-08-P01': ['真空状态复核机组真空度泄漏风险和抽真空记录确认', '溴化锂液位浓度液位温度和取样检测资料核对', '蒸汽热水边界热源压力温度阀门和疏水条件复核', '吸收器工况冷却水流量喷淋状态和换热温差确认', '结晶风险控制浓度温度保护参数和应急稀释措施交底', '调试签认表工况参数问题台账和复测记录模板确认'],
  '06-18-06-P01': ['多联机管长修正和追加充注量计算复核', '制冷剂型号钢瓶批次和电子秤校验确认', '真空保压和泄漏检查记录核验', '分次充注重量运行压力和温度记录', '充注标签调试资料和问题销项签认'],
  '07-04-02-P01': ['电动机铭牌功率电压和设计回路核对', '电缆规格保护整定和控制箱编号复核', '接线端子相序绝缘和接地连续性测试', '点动试转转向电流和温升观察记录', '问题整改复测和检查接线资料签认'],
  '07-06-09-P01': ['备用电源接地系统图和接地点清单复核', '柴油发电机UPS EPS柜体接地端子检查', '接地干线截面连接方式和防腐措施核验', '接地电阻连续性和等电位测试记录', '接地标识隐蔽资料和验收签认闭合'],
  '08-01-02-P01': ['集成平台软件版本授权和服务器资源清单核对', '接口协议点表和系统集成范围复核', '数据库备份策略账号权限和网络策略确认', '软件部署参数服务启动和日志检查记录', '版本基线配置备份和上线验收签认'],
  '08-05-02-P01': ['铜缆光纤规格芯数长度和路由图复核', '桥架管路容量转弯半径和牵引路径确认', '牵引张力端头保护和分层绑扎要求交底', '线缆标签起终点编号和余量盘留检查', '敷设记录测试计划和隐蔽验收签认'],
  '08-09-04-P01': ['分区矩阵核对广播分区消防分区和控制矩阵一致性', '强切回路清单强切模块回路编号和联动对象复核', '功放容量复核功放负载扬声器数量和备用容量确认', '消防联动场景报警触发强切反馈和主机记录核对', '广播音量测点声压级清晰度和背景噪声测点布置', '问题销项表回路异常音量不足和联动缺陷台账建立'],
  '08-12-03-P01': ['时钟系统机房供电网络和接地条件复核', 'GPS北斗授时天线位置馈线路由和防雷条件确认', '母钟子钟设备清单地址编码和分区表核对', 'NTP接口广播消防和信息发布接口清单复核', '安装调试条件签认和授时基线资料留存'],
  '08-14-02-P02': ['DDC线缆路径控制箱设备端和桥架路径复核', '桥架管路线管径桥架容量转弯半径和穿越位置确认', '牵引保护措施牵引张力线缆外护套和端部防护检查', '强弱电间距同槽隔离交叉防护和抗干扰措施复核', '屏蔽接地检查单端接地屏蔽连续性和接地端子编号', '作业面移交线缆敷设条件隐蔽记录和后续端接签认'],
  '08-14-02-P06': ['回路编号规则系统代码楼层设备和点位编号规则确认', '端子标签核对DDC端设备端和端子排标签一致性', '点表映射校验点表地址端子编号和设备编号对应关系', '永久标识粘贴线缆标签端子标签和控制箱标签检查', '竣工图同步回路编号点表和竣工图版本回写确认', '抽查复核记录抽查比例错标整改和签认资料闭合'],
  '08-14-09-P09': ['试运行数据汇总运行时长点位在线率和趋势数据归集', '报警事件抽查高低限故障离线和联动报警记录复核', '趋势曲线复核温湿度压差能耗和设备启停趋势一致性', '用户权限移交账号角色权限审计和密码策略确认', '缺陷复测闭合点位异常报警误报和趋势缺失问题销项', '验收签认包试运行报告点表备份和运维培训资料归档'],
  '01-07-02-P06': ['节点试水分区后浇带穿墙管施工缝和阴阳角范围确认', '水位时长记录闭水水位试验时长和见证记录归集', '穿墙管观察管根套管止水环和密封收口渗漏检查', '施工缝巡查缝边潮湿裂缝空鼓和渗水通道排查', '渗漏点定位位置标识原因分析和修补责任界面记录', '修补复验签认补强材料二次试水和验收资料闭合'],
  '04-01-01-P04': ['屋面坡向复核分水线坡向雨水口和排水路径确认', '雨水口标高水落口杯标高附加层和周边坡度检查', '找坡厚度测点分格测点厚度和设计找坡值比对', '低洼积水排查洒水试验积水点和排水不畅位置标识', '偏差整改复测补找坡修补压实和二次排水检查闭合', '验收资料签认坡度实测影像资料和防水作业面移交'],
  '04-03-03-P03': ['成膜时间记录每遍涂膜间隔固化时间和环境条件记录', '厚度抽测复核湿膜干膜测点编号和设计厚度比对', '节点附加层保护阴阳角管根水落口和施工缝附加层检查', '污染破损巡查踩踏污染划伤针孔和局部破损问题记录', '养护条件确认温湿度通风禁水和成品保护措施复核', '下道放行签认厚度合格缺陷闭合和保护层施工移交'],
  '03-04-05-P05': ['胶材批次核对密封胶批号有效期和材料合格证复核', '相容性报告胶材基材泡沫棒和底涂相容性资料核验', '基材清洁确认基层干燥清洁油污粉尘和底涂状态检查', '样板打胶观察胶缝宽厚比连续性和表面修整效果确认', '污染风险复核邻近饰面防污染保护和残胶清理措施检查', '施工放行签认样板确认相容资料和作业面条件闭合'],
  '03-02-01-P07': ['养护起止记录抹灰完成时间养护开始结束和责任人记录', '湿润覆盖检查洒水频次覆盖材料和干燥开裂风险复核', '开裂空鼓巡查墙面阴阳角门窗边和管线槽部位检查', '强度增长复核表面强度龄期条件和后续施工开放条件确认', '污染保护措施防碰撞防污染和交叉作业保护检查', '移交条件确认养护资料缺陷闭合和装饰面层作业面签认'],
  '03-02-03-P06': ['养护环境记录温湿度通风日晒和养护时段记录', '表面清洗控制清洗方式用水用剂和污染扩散风险确认', '纹理保护检查饰面纹理边角线条和表面完整性复核', '色差污染复核色差泛碱污染划伤和观感缺陷记录', '缺陷修补闭合修补材料修补范围和二次观感复核', '观感移交签认清理养护资料观感验收和成品保护交接'],
  '03-04-04-P01': ['特种门图纸型号和防火防盗性能资料复核', '洞口尺寸门框预埋件和安装界面核验', '五金闭门器顺序器和联动接口清单确认', '样板门安装偏差和启闭功能复测', '专项验收资料和接口问题销项闭合'],
  '03-12-04-P07': ['护栏扶手受力点位和抽检范围确认', '连接件锚固深度和防松措施复核', '抗水平荷载测试工况和加载记录', '松动变形开裂问题定位和整改复测', '安全验收签认和成品保护移交'],
  '04-01-03-P02': ['基层含水率和平整度检测点位确认', '阴阳角管根和泛水基层缺陷排查', '干燥度检测记录和异常区域标识', '修补打磨清理和复测记录闭合', '隔离层施工条件签认和影像留存'],
  '04-01-03-P03': ['隔离层铺设方向和排版样板复核', '搭接宽度错缝位置和边界线标识', '转角管根水落口部位附加处理检查', '褶皱破损污染点标识和修补复查', '隐蔽影像记录和铺设验收签认'],
  '04-05-01-P04': ['檐口试水范围和排水路径确认', '淋水水量时长和观察点位布置', '滴水线泛水收头和渗漏点检查', '渗漏污染问题整改和二次复查', '试水记录影像和节点验收签认'],
  '04-05-05-P01': ['变形缝设计宽度和构造详图复核', '两侧基层标高顺直度和清理状态检查', '防水附加层收头和盖板支座界面核验', '缝内杂物积水和基层缺陷整改复测', '节点隐蔽影像和施工放行签认'],
  '04-05-11-P01': ['屋顶窗洞口尺寸轴线和坡向复测', '窗框固定基层和防水翻边高度核验', '排水槽泛水板和密封节点样板确认', '洞口偏差和基层缺陷整改闭合', '安装界面移交和影像资料留存'],
  '05-01-08-P04': ['消毒浸泡分区和管网边界确认', '药剂浓度投加量和接触时间记录', '循环泵阀门末端放水点和排放路径检查', '余氯浊度和代表性采样点复测', '异常水质冲洗复消毒和资料签认'],
  '05-05-05-P01': ['电加热供暖供电容量和回路清单复核', '配电箱保护开关和漏电保护参数核对', '发热电缆或电热膜分区功率和绝缘测试', '温控器点位回路编号和控制逻辑确认', '安装放行签认供电边界和试运行记录要求'],
  '05-05-05-P08': ['填充层厚度标高和伸缩缝位置复核', '发热元件保护层状态和通电限制交底', '浇筑过程温控线保护和试块留置记录', '养护期间禁载禁电和裂缝空鼓巡查', '开放条件复测和成品保护移交签认'],
  '05-08-03-P01': ['供热检查井轴线标高和井室尺寸复核', '固定墩位置尺寸和受力方向确认', '管道穿墙套管支墩和伸缩补偿界面核验', '基底承载排水和防冻措施检查', '土建作业放行签认和隐蔽影像留存'],
  '05-08-03-P03': ['固定墩钢筋模板和预埋件位置复核', '混凝土浇筑坍落度试块和振捣记录', '管道锚固件保护和偏位复测', '养护保温防冻和拆模条件检查', '强度报告回收和管道安装界面移交'],
  '05-13-01-P08': ['烘炉煮炉方案水质药剂和升温曲线复核', '临时排污补水和安全阀压力表状态确认', '烘炉温升燃烧工况和炉墙干燥记录', '煮炉加药排污换水和水质检测记录', '异常结垢泄漏整改复测和运行放行签认'],
  '06-09-09-P01': ['真空吸尘调试范围和服务区域边界确认', '风机滤尘器集尘桶和快速接口状态复核', '系统负压测点吸力和泄漏检查计划', '分区试运行吸尘效率和噪声振动记录', '堵塞泄漏问题整改复测和调试资料签认'],
  '06-10-03-P01': ['冷凝水冲洗排放范围和管段边界确认', '地漏集水井排放路径和临时排水条件复核', '冲洗水量坡度低点和积水风险巡查', '排放浊度杂物清理和通水复测记录', '堵塞渗漏整改闭合和吊顶封闭前签认'],
  '06-14-08-P01': ['水源热泵调试范围和取退水边界确认', '水源侧换热器水泵阀门和过滤器状态复核', '水量水温水质和防冻保护参数采集计划', '制热制冷切换试运行和能效参数记录', '异常温差流量不足整改复测和调试报告签认'],
  '06-15-05-P01': ['蓄水罐基础尺寸标高和承载资料复核', '蓄能容量分区水位和保温边界确认', '罐体进出水接口溢流排污和检修空间检查', '温度分层测点和控制阀组接口核验', '安装放行签认和隐蔽资料留存'],
  '06-15-05-P08': ['蓄放能模式和温度分层目标确认', '上下层温度测点校验和趋势采集设置', '蓄能放能循环试运行和阀位状态记录', '温度混层短路流和容量偏差分析', '参数调整复测和运行移交签认'],
  '06-19-07-P01': ['太阳能系统调试边界集热器水箱和末端范围确认', '循环泵膨胀罐阀组和防冻保护状态复核', '集热温度流量补水和控制策略采集计划', '晴阴工况试运行和热量计量记录归集', '过热防冻泄漏问题整改复测和运行签认'],
  '07-04-02-P04': ['电加热器容量电压和回路编号复核', '温控器限温保护和联锁接口清单核对', '绝缘电阻接地连续性和端子紧固测试', '通电试运行升温曲线和保护动作记录', '异常温升整改复测和接线验收签认'],
  '07-01-10-P06': ['室外照明回路编号和控制时段复核', '灯具通电亮灯率照度和眩光点位测试', '漏电保护接地连续和防水接线盒检查', '时控光控远程控制和异常报警测试', '缺陷整改复测和移交资料签认'],
  '07-03-02-P09': ['母线槽回路编号容量和插接箱清单复核', '连接处温升绝缘和接地连续性测试', '送电试运行负荷电流和相序记录', '支吊架伸缩节和防火封堵复查', '验收资料试验报告和运维边界移交'],
  '05-05-04-P08': ['地暖填充层表面保湿和覆盖措施检查', '养护温湿度和龄期记录归集', '分集水器和盘管保护状态复核', '表面裂缝空鼓和污染问题排查', '养护完成强度条件和成品保护签认'],
  '05-05-08-P01': ['热计量调控系统图和分户分区清单核对', '热量表温控阀平衡阀点位位置复核', '供回水温度压力采集点和编号确认', '通信供电和数据上传接口状态检查', '点位复核记录和调控资料签认'],
  '06-01-02-P05': ['风阀部件编号规格和安装方向核对', '启闭动作灵活性和限位状态检查', '开度标识刻度牌和操作手柄复核', '漏风变形卡滞问题整改复测', '部件复测记录和安装移交签认'],
  '06-02-07-P07': ['排风支路房间编号和测点位置确认', '风口风量和支路压差测试记录', '止回阀防串味和排风方向检查', '噪声振动和异常气味问题复查', '复测数据归档和排风系统签认'],
  '06-05-02-P04': ['消声静压箱规格编号和安装位置核对', '检修口尺寸开启方向和维护空间复核', '内衬吸声材料固定和污染破损检查', '箱体密封接口和吊挂条件复测', '尺寸检查记录和问题销项签认'],
  '06-10-05-P01': ['板式热交换器基础标高和地脚孔位复测', '设备铭牌参数和系统接管方向核对', '阀门过滤器旁通和排污接口状态检查', '检修空间排水条件和保温界面复核', '接管条件资料和安装放行签认'],
  '06-10-05-P03': ['热交换器吊装搬运和成品保护检查', '设备就位中心线和水平度复测', '地脚螺栓紧固垫铁和防松标记检查', '进出水接管软接和支吊架状态复核', '就位固定记录和质量验收签认'],
  '06-13-03-P01': ['地源侧管网分区和埋地换热回路清单确认', '冲洗水源排污路径和临时过滤条件复核', '阀门井集分水器和排气点状态检查', '冲洗浊度流量和回路通畅性记录', '异常回路复冲洗和资料签认'],
  '06-14-06-P01': ['水源侧水质检测报告和基线指标复核', '除垢设备型号处理能力和安装位置核验', '药剂投加过滤旁通和排污接口检查', '试运行水质变化和设备压差记录', '水处理资料问题销项和投用签认'],
  '07-05-06-P01': ['钢索配线路径灯具点位和受力点核对', '锚固件规格防腐和承载条件复核', '钢索张力弧垂和转角保护检查', '导线固定间距绝缘保护和接地状态复测', '路径复核记录和安装放行签认'],
  '08-03-04-P01': ['电话交换系统号码规划和端口清单核对', '语音网关中继线路和机柜供电状态复核', '分机注册呼叫转接和外线拨测记录', '故障告警录音计费或日志功能检查', '调试报告配置备份和运维资料签认'],
  '08-05-06-P01': ['综合布线网管软件版本授权和许可清单核对', '机柜配线架端口资产和拓扑导入范围确认', '服务器工作站网络连通和账号权限检查', '软件部署参数备份策略和日志路径复核', '配置基线资料和软件验收签认'],
  '08-13-03-P01': ['信息化应用部署架构和资源清单核对', '服务器存储网络安全策略和账号权限复核', '数据库中间件接口参数和备份策略确认', '应用安装服务启动日志和访问测试记录', '部署基线配置备份和验收资料签认'],
  '06-10-05-P09': ['板式热交换器进出水温压和流量测点复核', '换热效率试运行一次二次侧温差记录', '阀门旁通排污和过滤器状态复查', '泄漏振动噪声和保温缺陷整改复测', '功能复测报告和运维边界交接签认'],
  '06-14-03-P01': ['水源侧管网冲洗分区和取退水边界确认', '临时过滤排污路径和补水条件复核', '冲洗流量浊度和换热器保护状态记录', '堵塞泄漏水质异常整改和复冲洗', '冲洗资料签认和水源热泵调试移交'],
  '06-15-03-P01': ['蓄能系统冲洗分区和蓄水罐边界确认', '循环泵阀门过滤器和临时排污路径复核', '冲洗流速浊度和温度分层保护记录', '杂质堵塞阀门卡涩和泄漏问题整改', '冲洗签认资料和蓄放能调试移交'],
  '06-15-05-P03': ['蓄水罐吊装就位路线和基础保护检查', '罐体中心线标高垂直度和水平度复测', '地脚螺栓垫铁二次灌浆和防松标识检查', '管口方位伸缩补偿和检修空间复核', '就位固定记录和安装验收签认'],
  '06-17-04-P01': ['溴化锂溶液加灌范围和机组封闭边界确认', '溶液批次浓度和安全防护措施复核', '加灌设备过滤器阀门和计量器具校验', '泄漏结晶风险点和应急稀释措施交底', '加灌方案签认和真空试验资料核对'],
  '07-05-01-P09': ['照明配电箱柜编号和回路标签复核', '箱内接线端子保护开关和接地状态检查', '照明回路通电试运行和异常跳闸记录', '标签清册竣工图和回路编号一致性复核', '验收资料设备台账和运维移交签认'],
  '07-05-09-P02': ['应急照明疏散指示设备型号和资料核验', '集中电源容量蓄电池和防火分区清单复核', '灯具方向高度和疏散路径一致性检查', '强启强切和持续供电时间测试准备', '资料缺项补正和安装使用放行签认'],
  '07-05-11-P06': ['室内照明通电试运行回路范围确认', '照度功率密度和控制场景测试记录', '开关面板灯具编号和回路标签复核', '闪烁跳闸暗区眩光问题整改复测', '通电试运行资料和使用移交签认'],
  '07-06-04-P09': ['备用电源母线槽回路容量和供电边界核对', '母线槽连接螺栓绝缘和接地连续性测试', 'ATS或备用电源切换送电试运行记录', '防火封堵支吊架和插接箱状态复查', '功能复测报告和应急供电运维移交'],
  '07-07-03-P08': ['等电位连接点编号和标识清册复核', '导通测试记录接地电阻和异常点位核查', '隐蔽影像跨接防腐和封闭状态资料归集', '漏标错标和导通异常整改复测', '标识资料归档和防雷接地移交签认'],
  '08-03-01-P06': ['语音线缆回路编号规则和端口清单复核', '配线架模块跳线和用户端标签核对', '号码端口映射和竣工图版本回写检查', '错标漏标端口不通和跳线混乱整改复测', '永久标识清册和测试资料移交签认'],
  '08-03-05-P07': ['电话交换系统运维账号角色和权限清单核对', '配置备份话务数据和日志导出记录', '故障告警呼叫转移和应急联系资料复核', '账号交接密码策略和权限回收确认', '运维资料移交和系统接管签认'],
  '08-04-04-P07': ['网络安全策略版本和变更单清单核对', '防火墙交换机安全策略和白名单备份', '策略验证访问控制端口扫描和日志抽查', '误拦截漏放行问题整改复测', '配置备份变更记录和运维移交签认'],
  '08-04-06-P07': ['信息网络试运行配置备份范围确认', '核心交换路由无线和安全设备配置导出', '链路冗余故障切换和日志留存复核', '账号权限SNMP监控和告警策略移交', '运维资料交接签认和备份介质归档'],
  '08-07-01-P02': ['卫星天线安装位置视距和遮挡物复核', '方位角仰角和基础支架条件确认', '馈线长度防雷接地和穿墙路径检查', '信号强度载噪比预测和调试条件核对', '安装界面签认和运营商资料留存'],
  '08-08-04-P01': ['有线电视调试范围频道清单和信号源确认', '前端设备放大器分支分配器状态复核', '终端电平载噪比和斜率测试计划', '频道搜索图像声音和马赛克问题记录', '调试报告签认和用户端移交准备'],
  '08-12-02-P04': ['时钟RS485总线分区和子钟地址清单复核', '总线极性屏蔽接地和端接电阻检查', '母钟校时下发和子钟同步状态测试', '地址冲突掉线和时间偏差问题整改', '测试记录标签清册和系统调试移交'],
  '08-13-02-P01': ['信息化应用线缆规格类型和接口协议核对', '桥架管路路由容量和强弱电间距复核', '服务器终端外设和机柜端口清单确认', '牵引保护标签编号和测试计划交底', '路径复核记录和线缆敷设放行签认'],
  '08-17-02-P01': ['应急响应软件版本授权和部署架构核对', '服务器资源接口协议和联动对象清单复核', '账号权限报警策略和数据备份方案确认', '软件安装服务启动日志和接口连通测试', '部署基线备份和应急响应验收签认'],
  '08-18-08-P01': ['机房装修方案材料清单和防火等级复核', '地面墙面吊顶和防尘防静电节点确认', '设备搬入路径承重和成品保护措施检查', '防火封堵检修空间和洁净交付标准核验', '装修样板确认和机房安装界面移交'],
  '10-02-12-P09': ['液压电梯竣工资料清单和监督检验报告核对', '设备合格证安装记录调试记录和维保资料归集', '安全部件限速器缓冲器门锁资料复核', '缺项错版资料补正和使用登记接口确认', '竣工资料移交和使用单位签认闭合'],
  '08-02-01-P01': ['运营商进场范围和施工窗口确认', '机房接入位置电源和网络条件复核', '现场交底记录和问题清单建立', '接入界面开放状态和安全条件检查', '进场协调事项闭合和施工界面移交'],
  '08-02-01-P02': ['接入机房空间和管线路由复核', '电源接地和弱电井条件检查', '运营商接口资料和点位清单核对', '移交问题整改复查和条件签认', '接入条件影像资料和责任边界归档'],
  '08-02-01-P03': ['配合安装点位开放确认', '接入设备安装状态和标签复核', '信号连通带宽质量和丢包测试', '联调问题清单整改和复测记录', '测试报告配置资料和运维信息归集'],
  '08-02-01-P04': ['测试报告和竣工资料清单核对', '端口编号和运维联系人资料复核', '接入账号权限和服务边界确认', '资料缺项错项补正和版本回写', '资料移交签认和遗留事项闭合'],
  '08-07-01-P01': ['天线安装区域和施工窗口确认', '屋面或机房承载接地条件复核', '馈线通道和防雷界面检查', '运营商进场交底和安全措施记录', '进场协调记录和风险事项闭合'],
  '08-07-01-P03': ['天线就位和方位仰角初调', '馈线连接屏蔽和接地连续性检查', '接收质量载噪比和链路稳定性测试', '联调缺陷整改和复测记录归集', '调试报告资料和运维边界签认'],
  '08-07-01-P04': ['链路测试报告和设备清单核对', '天线馈线编号和运维资料复核', '防雷接地检测记录归集', '账号权限服务边界和联系人确认', '资料移交签认和遗留问题闭合'],
  '08-08-01-P01': ['有线电视路由和安装高度复核', '支吊架固定和接地跨接检查', '管槽转弯半径和弱电间距复核', '隐蔽影像记录和整改复查', '隐蔽验收记录和问题闭合签认'],
  '08-09-01-P01': ['广播线路路由和分区范围核对', '桥架导管固定和接地跨接检查', '消防广播强切接口预留复核', '线槽穿墙封堵和标签状态检查', '隐蔽验收记录和问题闭合'],
  '08-10-01-P01': ['会议室点位和管线路由复核', '桥架导管固定和屏蔽接地检查', '音视频线缆间距和预留容量核对', '穿墙封堵和检修空间复查', '隐蔽记录和整改复查签认'],
  '08-12-01-P01': ['母钟子钟线路路由核对', '桥架导管固定和接地跨接检查', '授时天线馈线路径复核', '线缆标识预留容量和检修空间检查', '隐蔽验收和资料闭合签认'],
  '08-17-01-P01': ['应急设备点位和机柜空间复核', '供电网络和接地条件检查', '设备安装接线和地址编码核对', '报警联动接口和标签编号复查', '安装自检记录和问题闭合'],
  '06-20-01-P01': ['传感器点位和量程清单核对', '安装位置和取样条件复核', '接线地址和标签编号检查', '单点读数校验和偏差记录', '校验记录和问题闭合签认'],
  '06-20-02-P01': ['执行机构点位和行程范围复核', '阀门风阀安装方向和固定状态检查', '接线信号和手自动切换测试', '动作方向行程限位调试记录', '调试问题整改和闭合签认'],
  '06-20-04-P01': ['控制软件版本和授权核对', '服务器网络和通讯链路检查', '点表导入和控制策略基线确认', '历史趋势报警和备份策略复核', '环境准备记录和备份留存'],
  '10-01-01-P01': ['曳引电梯设备随机资料和合格证明核对', '安全部件型式资料和试验报告复核', '箱件编号外观数量和包装状态检查', '缺件损伤和证书缺项整改记录', '进场验收记录和缺项闭合'],
  '10-02-01-P01': ['液压泵站油缸和管路资料核对', '安全部件和阀组证明文件复核', '设备外观数量和箱件编号检查', '油品资料泄漏防护和保管条件复查', '进场验收记录和补证闭合'],
  '10-03-01-P01': ['整机和部件合格证明核对', '梯级扶手带和安全装置资料复核', '设备外观数量和包装状态检查', '主机桁架和控制柜箱件编号复查', '进场验收记录和缺项闭合'],
  '04-05-03-P01': ['泛水高度和收头构造复核', '墙根基层和阴阳角处理检查', '附加层铺设和压条固定检查', '外观淋水检查和渗漏点排查', '节点问题整改和影像记录闭合'],
  '04-05-04-P01': ['水落口标高和坡向复核', '杯口周边附加层和密封检查', '雨水篦子和管口固定复核', '排水通畅性和周边积水检查', '蓄水或排水检查记录闭合'],
  '04-05-06-P01': ['管根位置和套管高度复核', '管根基层清理和圆弧处理检查', '附加层和泛水收头密封复核', '穿屋面管道固定和防水保护检查', '渗漏检查和影像记录闭合'],
  '03-12-01-P01': ['柜体深化尺寸和机电点位核对', '基层平整度和固定条件复核', '构件进场外观和五金规格检查', '安装垂直度平整度和收口复查', '成品保护和移交签认'],
  '03-12-05-P01': ['花饰排版定位和样板确认', '基层固定点和连接件规格复核', '安装牢固度和防坠措施检查', '观感复查和色差污染整改', '成品保护移交和资料签认'],
  '06-04-02-P01': ['除尘部件加工图和耐磨等级复核', '含尘介质温度湿度和磨蚀工况确认', '防爆泄压防静电和检修口节点核对', '加工尺寸连接法兰和密封要求交底', '加工放行记录和质量控制点签认'],
  '06-04-02-P02': ['防静电软接和防爆阀件资料核验', '材料批次阻燃防静电性能证明复核', '规格型号安装方向和接口尺寸检查', '外观损伤密封面和附件完整性复查', '材料复验记录和入库标识签认'],
  '06-04-04-P02': ['耐磨叶轮和防爆电机资料核验', '设备铭牌参数防爆等级和合格证明复核', '叶轮外观动平衡和壳体防腐检查', '电机绝缘接地和接线盒密封状态核对', '开箱验收记录和缺陷整改闭合'],
  '06-07-02-P02': ['净化阀件消声器静压箱资料核验', '过滤等级材质规格和洁净包装复查', '外观变形污染和密封面完整性检查', '编号标签安装方向和接口尺寸核对', '进场验收记录和洁净保护签认'],
  '06-07-02-P05': ['净化部件组装区域清洁状态确认', '阀件启闭方向限位和灵活性检查', '消声器静压箱连接密封和内衬状态复核', '污染破损漏风和卡滞问题整改复测', '组装检查记录和安装移交签认'],
  '06-10-02-P09': ['冷凝水泵组试运行范围和排水路径确认', '泵组启停液位控制和备用切换测试', '流量扬程振动噪声和电气保护记录', '渗漏堵塞倒灌和报警异常整改复测', '功能复测报告和运维移交签认'],
  '06-10-07-P02': ['热泵机组开箱资料和设备参数核对', '制冷剂水路电源和控制接口清单复核', '外观损伤随机附件和基础接口检查', '运输固定件拆除和成品保护要求确认', '开箱验收记录和缺项补正闭合'],
  '06-16-01-P02': ['制冷机组开箱资料和铭牌参数核对', '压缩机蒸发器冷凝器和控制柜外观检查', '随机附件制冷剂油品和专用工具清点', '基础接口吊装保护和检修空间复核', '开箱验收记录和缺损项闭合签认'],
  '07-01-05-P02': ['电缆盘规格长度和型号资料核验', '绝缘耐压合格证明和批次资料复核', '电缆外护套端头封闭和盘体状态检查', '敷设路径长度余量和弯曲半径要求核对', '进场验收记录和标识入库签认'],
  '07-06-03-P09': ['UPS/EPS装置试运行范围和负载等级确认', '电池组容量内阻和充放电状态复核', '市电旁路逆变切换和应急供电测试记录', '告警通讯接地和散热异常整改复测', '功能复测报告和应急电源运维移交'],
  '08-05-01-P08': ['综合布线桥架导管安装范围和路由复核', '支吊架固定跨接接地和防火封堵检查', '槽盒容量弯曲半径和强弱电间距复测', '变形污染毛刺和标识缺失问题整改', '功能复测记录和线缆敷设界面移交'],
  '08-05-02-P03': ['水平线缆垂直干线和光缆分层规则确认', '牵引张力弯曲半径和余量控制检查', '不同系统线缆隔离绑扎和标签编号复核', '线缆损伤混扎错路由问题整改复测', '敷设记录路由图和测试准备签认'],
  '08-06-01-P03': ['POI或RRU安装位置和界面条件确认', '机柜天线支架电源接地和传输接口复核', '设备编号运营商参数和安装方向核对', '安装空间散热防水和防雷条件检查', '界面确认记录和进场安装放行签认'],
  '08-07-01-P06': ['卫星通信界面移交范围和系统边界确认', '天线馈线机房设备和防雷接地资料核对', '链路测试告警配置和运营商服务资料归集', '遗留问题责任人和整改时限复核', '界面移交资料和运维签认闭合'],
  '08-08-02-P05': ['有线电视终端电平抽测范围和代表点确认', '分支分配器衰减值和线缆编号核对', '终端电平载噪比斜率和图像质量记录', '低电平串扰和接头缺陷问题整改复测', '线路衰减记录和用户端口资料签认'],
  '08-13-05-P08': ['应用系统运维移交范围和版本基线确认', '账号权限接口清单和配置备份资料核对', '运行日志报警策略和数据备份恢复测试', '培训记录操作手册和应急联系人复核', '运维移交清单和系统接管签认闭合'],
  '08-16-02-P07': ['安防线缆标签规则和点位清册复核', '摄像机门禁报警回路编号对应检查', '标签粘贴牢固性可读性和竣工图一致性核对', '错标漏标端口不通问题整改复测', '线缆清册测试记录和移交签认'],
  '08-19-08-P07': ['建筑设备监控运维资料移交范围确认', '点表图纸控制逻辑和趋势报表资料核对', '账号权限备份策略和报警通知清单复核', '培训记录试运行问题和参数调整记录归集', '运维资料移交和系统接管签认闭合'],
  '10-01-01-P07': ['曳引电梯缺损件登记范围和箱件清单复核', '缺件损伤锈蚀和资料缺项拍照记录', '补件补证整改责任和到场时间确认', '整改复查箱件封存和成品保护检查', '进场验收记录签认和缺损闭合归档'],
  '10-03-01-P07': ['扶梯人行道进场验收箱件清单复核', '梯级扶手带桁架和控制柜外观检查', '缺件损伤证书缺项和包装破损登记', '补件补证整改复查和现场保管条件确认', '进场验收记录签认和缺项闭合归档'],
  '05-01-05-P07': ['室内给水防腐复测范围和管段清单确认', '涂层厚度附着力和补口完整性检查', '阀门支架套管周边防腐缺陷复查', '锈蚀漏涂破损问题整改和复测记录', '防腐质量资料和交接签认闭合'],
  '05-01-06-P06': ['室内给水绝热节能复测范围确认', '绝热材料厚度密度和接缝严密性检查', '阀门法兰弯头和穿墙部位绝热复核', '结露破损空鼓和标识缺失整改复测', '节能复测资料和交接签认闭合'],
  '05-02-04-P08': ['排水试验调试范围和检查点位确认', '通球灌水通水和满水试验记录核对', '检查口清扫口地漏和通气管功能复查', '渗漏堵塞返味和坡度异常整改复测', '试验调试记录签认和资料归档'],
  '05-04-03-P08': ['卫生器具排水管道复测范围和房间清单确认', '存水弯排水坡度接口密封和固定状态检查', '满水通水溢流和防返味功能测试记录', '渗漏堵塞异味和器具晃动问题整改复测', '功能复测资料和交接签认闭合'],
  '05-11-02-P12': ['水处理系统验收范围和运行参数清单确认', '过滤消毒加药和控制柜运行状态复核', '水质检测流量压力报警和排污记录核对', '水质异常药剂投加偏差和泄漏问题整改复测', '运维资料培训记录和移交签认闭合'],
  '05-13-01-P12': ['锅炉系统验收范围和安全附件清单确认', '燃烧系统水处理补水排污和控制柜状态复核', '烘炉煮炉试运行安全阀和联锁测试记录核对', '泄漏超温水质异常和报警问题整改复测', '运行参数资料和移交签认闭合'],
  '06-01-05-P07': ['送风系统防腐复测范围和设备管段清单确认', '风管支架设备外壳和法兰防腐状态检查', '涂层厚度附着力漏涂和破损点复核', '锈蚀破损污染和补涂问题整改复测', '防腐质量资料和交接签认闭合'],
  '06-02-07-P08': ['厨房卫生间排风系统复测范围确认', '风机风口止回阀和支路风量记录核对', '排风方向防串味噪声振动和气味检查', '堵塞串味风量不足和阀件失效整改复测', '功能复测资料和交接签认闭合'],
  '06-04-07-P08': ['除尘联动吸尘罩复测范围和点位清单确认', '吸尘罩风量负压和联动启停状态测试', '火花捕集防爆泄压和防静电接地复核', '粉尘外逸吸力不足和联动异常整改复测', '功能复测资料和运维移交签认'],
  '06-05-07-P08': ['舒适空调附属设备复测范围和设备清单确认', '消声器静电除尘换热器紫外灭菌器状态检查', '风量阻力噪声杀菌和维护参数测试记录', '污染破损压差异常和维护空间不足整改复测', '功能复测资料和维护参数签认'],
  '06-06-07-P11': ['电加热加湿系统验收范围和控制参数确认', '电加热器加湿器水源排水和电气保护状态复核', '温湿度控制高低水位和联锁报警测试记录', '结垢漏水超温和控制偏差问题整改复测', '运维资料移交和验收签认闭合'],
  '06-08-06-P12': ['人防专项验收资料范围和设备清单确认', '防护通风设备密闭阀过滤吸收器资料核对', '密闭性能风量测试和防护功能记录归集', '资料缺项测试异常和整改闭合情况复核', '专项验收组卷和质量移交签认'],
  '06-10-06-P09': ['辐射末端功能复测范围和回路清单确认', '辐射板埋地管分集水器和温控阀状态复核', '供回水温度流量压力和表面温度测试记录', '渗漏不热不冷和温控异常问题整改复测', '功能复测资料和交接签认闭合'],
  '06-15-05-P09': ['蓄水罐蓄能装置验收范围和容量指标确认', '罐体保温接口阀组温度测点和液位状态复核', '蓄放能循环温度分层和容量测试记录', '混层泄漏保温破损和控制异常整改复测', '验收资料运行参数和运维移交签认'],
  '06-17-04-P09': ['溴化锂溶液加灌验收范围和溶液批次确认', '浓度液位过滤泄漏和真空状态记录核对', '溶液循环结晶风险和机组运行参数复核', '浓度偏差泄漏结晶和液位异常整改复测', '加灌验收资料和运行移交签认'],
  '08-01-01-P08': ['智能化集成硬件巡检范围和设备清单确认', '服务器工作站网关交换机和接口状态复核', '供电接地网络连通和设备安装功能测试', '离线告警通讯异常和标签缺失整改复测', '巡检资料和交接签认闭合'],
  '08-05-08-P07': ['综合布线试运行报告范围和链路清单确认', '链路测试端口标签和配线架跳线资料核对', '试运行故障丢包衰减和端口不通问题复测', '问题销项配置资料和竣工图版本回写', '验收资料归档和移交签认闭合'],
  '08-09-05-P06': ['公共广播试运行问题销项范围确认', '分区广播功放扬声器和消防强切记录核对', '声压覆盖音质啸叫和分区切换复测', '错区无声杂音和联动异常问题整改闭合', '公共广播资料移交和验收签认'],
  '08-11-03-P12': ['信息导引显示设备复测范围和屏体清单确认', '发送卡接收卡播放终端和供电网络状态复核', '亮度色彩分辨率播放策略和远程发布测试', '花屏黑屏同步异常和内容错播问题整改复测', '功能复测资料和交接签认闭合'],
  '08-18-06-P08': ['监控安防运维账号移交范围确认', '账号角色权限密码策略和审计日志复核', '录像存储报警联动和远程访问权限测试', '越权弱口令账号遗漏和资料缺项整改复测', '运维账号资料移交和验收签认闭合'],
  '06-02-02-P03': ['排风部件加工图型号规格和尺寸复核', '板材下料咬口法兰孔位和加强筋制作检查', '部件组装方正度严密性和启闭方向复查', '编号标识成品保护和分区堆放记录', '制作检验记录缺陷整改和验收签认闭合'],
  '06-02-06-P07': ['吸风罩缺陷清单位置编号和整改范围确认', '罩体固定接口密封和集气边界复查', '风量捕集效果噪声振动和安全距离复测', '整改影像测试记录和材料合格资料归集', '验收意见复核问题销项和签认闭合'],
  '06-04-02-P03': ['除尘部件加工图耐磨防爆和尺寸要求复核', '板材下料焊缝坡口和法兰连接面制作检查', '灰斗检修口泄爆口和旁通接口组装复查', '防静电跨接编号标识和成品保护记录', '制作检验缺陷整改和验收资料闭合'],
  '06-04-06-P12': ['除尘排污设备清单接口编号和验收范围确认', '灰斗排污阀排污管路和检修空间现场复查', '启闭灵活性密封状态和负压泄漏点复测', '运行记录清灰排污维护说明和备件资料归集', '验收意见问题销项和运维资料签认闭合'],
  '06-05-08-P07': ['末端设备房间编号型号和安装位置复核', '水管风管电源控制线接口和检修空间检查', '风量水量噪声冷凝水排放和阀件动作复测', '偏差房间整改记录测试数据和影像资料归集', '功能验收记录设备台账和交接签认闭合'],
  '06-06-02-P01': ['恒温恒湿部件加工图版本和设计参数复核', '调节阀检修门密封件和传感器接口清单核对', '尺寸孔位材质防腐和气密等级要求检查', '加工偏差问题清单和图纸会签记录整理', '核对成果签认和制作资料闭合'],
  '06-07-02-P06': ['净化风管端口房间编号和封闭范围确认', '端口清洁状态封堵材料和保护方式复核', '编号标签方向气流等级和台账一致性检查', '封闭污染风险破损松脱问题整改复查', '封闭影像编号台账和验收记录闭合'],
  '06-08-04-P02': ['人防通风机防爆附件型号规格和合格资料核验', '防爆波阀密闭阀软接和风机铭牌参数核对', '安装方向启闭状态密闭面和防腐状态现场复查', '缺项资料补证外观缺陷整改和影像记录归集', '资料核验结论验收记录和台账闭合'],
  '06-10-06-P04': ['辐射板或埋地管敷设区域轴线标高复核', '管材板材规格间距弯曲半径和固定点检查', '分集水接口保温保护层和伸缩补偿节点复查', '压力保持隐蔽影像和敷设实测记录归集', '隐蔽验收问题销项和资料签认闭合'],
  '08-03-01-P03': ['语音线缆路由桥架管槽和端口编号复核', '线缆牵引弯曲半径分层绑扎和余量检查', '机柜配线架信息点端接质量和线序复查', '标签编号测试记录和端口台账一致性核对', '隐蔽验收测试报告和资料闭合签认'],
  '08-05-02-P08': ['综合布线线缆清册路由图和端口编号核对', '桥架管槽房间点位和配线架映射现场抽查', '线缆标签余量分层绑扎和隐蔽影像复核', '测试记录整改清单和竣工图版本整理', '路由图端口台账和验收资料签认闭合'],
  '08-08-02-P03': ['分支分配器箱体编号线缆来源和端口清单核对', '同轴线剥线长度屏蔽层处理和F头压接检查', '箱内线缆弯曲半径接地跨接和余量整理', '端口电平抽测标签编号和测试记录归集', '压接质量复查问题整改和验收签认闭合'],
  '08-09-02-P02': ['广播分区回路清单扬声器点位和线缆规格复核', '管槽路径防火分区穿越和强弱电间距检查', '线缆敷设绑扎余量端接和编号标识复查', '回路通断绝缘和分区音源测试记录归集', '隐蔽验收问题整改和分区资料闭合签认'],
  '08-10-02-P02': ['会议室点位清单线缆类型和接口矩阵复核', '视频音频话筒线管槽路由和抗干扰距离检查', '线缆敷设弯曲半径端接质量和标签编号复查', '图像声音话筒拾音和端口连通测试记录', '测试报告竣工图和端口台账签认闭合'],
  '08-12-02-P02': ['母钟子钟点位回路编号和授时接口复核', '线缆路径屏蔽接地终端电阻和地址条件检查', '回路线缆敷设端接标签和分区清册复查', '子钟同步偏差通信状态和故障显示测试', '测试记录点位台账和验收资料闭合签认'],
  '08-13-02-P02': ['应用系统线缆路由端口清单和牵引路径复核', '桥架管槽占用余量弯曲半径和防火封堵条件检查', '牵引工具人员分工线缆保护和标识方案核对', '现场样段敷设质量端接余量和隐蔽影像确认', '牵引条件签认测试计划和资料闭合'],
  '08-14-02-P09': ['BMS点表地址回路编号和线缆清册核对', 'DDC箱传感器执行器接口和屏蔽接地复查', '线缆标签端子编号绝缘测试和通信状态抽测', '错线漏线地址冲突问题整改和复测记录归集', '验收记录竣工图点表和运维台账闭合'],
  '05-03-02-P02': ['热水辅助设备箱件编号合格证和随机资料核验', '设备铭牌型号参数附件数量和外观状态检查', '基础接口检修空间和安装方向现场复核', '缺件损伤资料缺项登记和补正复查', '开箱验收记录设备台账和资料闭合签认'],
  '05-04-04-P08': ['卫生器具房间清单接口编号和试验范围确认', '通水盛水冲洗排水和水封高度复测', '给水配件启闭流量渗漏和成品保护检查', '问题整改复验影像和试验记录归集', '调试记录验收意见和资料签认闭合'],
  '05-05-04-P05': ['地暖伸缩缝位置分区边界和设计要求复核', '边界保温条伸缩缝材料规格和固定状态检查', '盘管穿越保护套管和填充层厚度控制复查', '隐蔽影像实测记录和破损缺陷整改归集', '伸缩缝验收记录和地暖资料闭合签认'],
  '05-07-02-P07': ['排水管沟井池轴线标高流槽和井盖编号复核', '砌筑抹面防渗接口和爬梯安装质量检查', '通水排放井内积水倒坡和沉砂情况复测', '缺陷整改影像实测数据和试验记录归集', '功能验收记录井池台账和资料闭合签认'],
  '05-12-01-P09': ['水景喷泉管道喷头阀组和分区清单复核', '管道支架喷头标高接口密封和防腐状态检查', '试压通水喷射效果和排空防冻功能复测', '缺陷整改复验影像和专项试验资料归集', '专项验收意见运维台账和资料闭合签认'],
  '03-01-02-P02': ['基层清理凿毛湿润状态和平整度复核', '找平层标高控制线和分格缝位置确认', '砂浆或细石混凝土配合比和摊铺厚度检查', '收面压光养护空鼓裂缝和表面平整复测', '施工记录问题整改和验收资料闭合签认'],
  '04-01-01-P03': ['屋面找坡基面清理含水率和排水方向复核', '找坡控制线坡度标高和分格缝位置确认', '轻质材料或砂浆铺设厚度压实度和平整度检查', '养护裂缝空鼓积水点和坡向偏差复测', '隐蔽验收影像实测记录和资料闭合签认'],
  '02-06-07-P06': ['空间网格卸载顺序和监测点位复核', '支座标高轴线和挠度实测复测', '杆件应力节点螺栓和焊缝状态检查', '整体复测偏差问题销项和影像归集', '交接签认记录和后续作业界面闭合'],
  '03-01-03-P05': ['板块排版控制线和试铺样段复核', '缝宽控制卡尺抽测和顺直度检查', '拨缝修整空鼓翘角和高低差复测', '污染清理成品保护和边角收口检查', '铺贴质量记录和整改闭合签认'],
  '03-01-03-P06': ['勾缝材料配比颜色和缝隙清理复核', '灌缝饱满度深度和表面压实检查', '污染清洁边角修补和残浆清除复查', '缝隙复查空鼓裂纹和渗水风险销项', '勾缝验收记录和成品保护移交'],
  '03-01-04-P02': ['基层防潮隔离范围和含水率复测', '隔离材料搭接上翻高度和宽度检查', '墙根管根门口节点防潮封闭复查', '破损修补翘边压实和漏铺部位闭合', '防潮隔离隐蔽记录和铺装放行签认'],
  '03-12-05-P07': ['锚固点补强范围和基层强度复核', '连接件紧固防坠措施和胶粘状态检查', '空鼓脱落裂缝和松动点位逐处复测', '拉拔抽查修补闭合和影像资料归集', '花饰安全复核记录和成品移交签认'],
  '04-01-04-P05': ['分格缝定位弹线和间距尺寸复核', '切缝深度宽度和边缘崩裂检查', '嵌缝材料基层清理和嵌缝密实复查', '养护记录覆盖洒水和裂缝复测归集', '分格缝验收资料和问题闭合签认'],
  '04-04-02-P04': ['搭接长度铺设方向和起始线复核', '钉固间距钉帽压实和基层咬合检查', '瓦材抗风揭固定和节点搭接复查', '破损松动错缝和渗水风险整改', '隐蔽记录影像和铺设验收闭合'],
  '04-05-01-P05': ['檐口收边尺寸和滴水构造复核', '封檐板压条固定和密封胶状态检查', '檐沟交界节点拍照留痕和影像编号', '渗漏风险翘边松动和污染问题销项', '檐口节点资料闭合和交接签认'],
  '04-05-03-P04': ['女儿墙和山墙泛水高度复核', '阴阳角附加层压条收头密封检查', '泛水立面保护层和搭接宽度复查', '淋水或闭水检查渗漏点定位整改', '节点试验记录和渗漏整改闭合签认'],
  '04-05-08-P04': ['过水孔位置标高和排水路径复核', '孔口附加层泛水收头和密封状态检查', '篦网防堵构造和周边坡向复查', '淋水或闭水检查积水堵塞问题整改', '过水孔验收记录和排水功能签认'],
  '05-08-03-P08': ['供热土建结构验收范围和基础编号核对', '基础标高轴线预埋件和预留孔洞复测', '承载条件检修空间和排水坡向检查', '偏差缺陷整改影像和实测数据归集', '供热土建交接签认和安装界面闭合'],
  '06-03-05-P07': ['防排烟防腐复测范围和风管设备清单确认', '涂层厚度附着力和法兰支架补涂检查', '设备外壳支吊架和接口破损漏涂复查', '锈蚀起皮污染问题整改和复测记录归集', '防腐质量资料和交接签认闭合'],
  '06-07-05-P07': ['净化空调防腐复测范围和洁净保护确认', '风管设备涂层完整性和密封面状态检查', '支吊架法兰和检修口污染破损复查', '漏涂锈蚀污染问题整改和复测记录归集', '净化防腐质量资料和交接签认闭合'],
  '06-08-05-P07': ['人防通风防腐复测范围和防护部件清单确认', '密闭面防护涂层厚度和附着力检查', '风管设备支架和穿墙接口漏涂锈蚀复查', '破损污染补涂和人防防护要求复测', '人防防腐质量资料和交接签认闭合'],
  '06-09-07-P08': ['快速接口安装复测范围和接口编号核对', '卡扣密封圈方向和连接紧固状态检查', '启闭插拔灵活性和密封功能复测', '泄漏松脱错装问题整改和复测记录归集', '快速接口功能资料和交接签认闭合'],
  '06-17-04-P02': ['溴化锂溶液批次编号和厂家资料核对', '浓度复验取样容器和检测方法确认', '外观颜色污染沉淀和封存状态检查', '复验结果偏差处置和加灌放行复核', '溶液批次复验记录和资料闭合签认'],
  '06-17-04-P05': ['溴化锂溶液过滤加灌管路和设备状态复核', '过滤器清洁度连接密封和排气条件检查', '加灌过程液位真空和流量控制记录', '泄漏结晶浓度异常问题整改复测', '加灌记录运行参数和验收签认闭合'],
  '06-19-06-P07': ['填充层浇筑区域和盘管压力保持复核', '浇筑厚度标高配合比和分区边界检查', '振捣找平伸缩缝和管道保护状态复查', '养护覆盖裂缝空鼓和表面标高复测', '隐蔽验收记录和地暖资料闭合签认'],
  '07-05-05-P04': ['线路固定路径和点位编号复核', '固定间距弯曲半径和余量控制检查', '绝缘护套压接端子和防损伤措施复查', '破皮压扁松脱和标识缺失问题整改', '隐蔽记录测试资料和交接签认闭合'],
  '08-08-03-P06': ['终端电平均衡测试范围和端口清单确认', '放大器分配器衰减值和设备软件版本复核', '终端电平载噪比斜率和频道质量测试', '低电平雪花串扰和软件参数问题整改', '均衡调试记录设备资料和资料移交签认'],
  '08-10-05-P06': ['会议系统试运行问题清单和销项范围确认', '音视频控制矩阵和终端设备状态复核', '图像声音拾音扩声和音视频复测', '无声啸叫延迟花屏和控制异常整改闭合', '试运行销项闭合记录和会议系统资料移交'],
  '08-11-02-P03': ['发送卡接收卡链路拓扑和编号规则复核', '网线光纤电源端接质量和标签检查', '屏体模组箱体地址和编号映射核对', '点亮测试色块校验和链路掉线整改', '链路端接记录和调试移交签认闭合'],
  '08-16-03-P08': ['图像质量和事件记录复测范围确认', '摄像机录像机存储和平台设备安装状态复核', '清晰度帧率回放检索和事件触发测试', '图像卡顿漏录时间偏差和告警异常整改', '功能复测记录和交接签认闭合'],
  '08-17-04-P07': ['试运行报告范围和应急响应场景清单确认', '响应数据事件回放和处置时效记录核对', '联动日志告警通知和账号权限复核', '问题复测销项和数据偏差整改闭合', '试运行报告响应数据资料归档和移交签认'],
  '10-02-07-P06': ['监督检验资料交接范围和清单核对', '整改销项报告检测记录和合格证明复核', '设备参数安全部件和使用登记资料检查', '缺项错项补正和监督检验意见闭合', '资料交接签认闭合记录和使用登记接口确认'],
  '03-01-02-P09': ['整体面层验收范围和房间轴线清单确认', '平整度坡度空鼓裂缝和起砂缺陷实测', '强度报告试块资料和养护记录复核', '问题点位修补打磨复测和影像归集', '整体面层验收资料和移交签认闭合'],
  '03-01-03-P08': ['板块面层养护范围和封闭保护措施确认', '洒水覆盖温湿度和上人时间记录检查', '污染碰损空鼓翘角和边角破损复查', '成品保护责任划分和破损修补闭合', '养护成品保护记录和移交签认'],
  '03-01-03-P09': ['板块面层验收范围和排版编号核对', '平整度缝宽高低差和空鼓率实测', '勾缝清洁观感和成品保护状态复核', '问题点位返修复测和影像资料归集', '板块面层验收记录和移交签认闭合'],
  '03-01-04-P05': ['木竹面层拼缝宽度和排版方向复核', '伸缩缝预留位置和边口收口检查', '钉固胶粘牢固性和起翘异响复查', '拼缝污染高低差和伸缩缝堵塞问题整改', '拼缝伸缩缝验收记录和成品保护移交'],
  '03-01-04-P06': ['踢脚线边口收口范围和基层状态复核', '踢脚线固定高度直线度和拼缝检查', '木竹面层平整度色差和成品保护复查', '边口翘曲松动和污染破损整改闭合', '踢脚线收口和平整度验收签认'],
  '04-01-04-P06': ['保护层成品移交范围和分区编号核对', '表面平整坡向分格缝和裂缝实测复核', '成品污染破损空鼓起砂和积水点检查', '问题点位修补养护和复测影像归集', '保护层成品移交验收资料闭合'],
  '04-04-02-P07': ['沥青瓦成品保护范围和屋面分区确认', '搭接钉固脊瓦封闭和泛水节点复查', '破损松动翘边污染和渗漏风险检查', '节点整改复测和淋水观察记录归集', '成品保护验收资料和移交签认闭合'],
  '04-05-10-P04': ['屋脊节点淋水或闭水范围和试验条件确认', '脊瓦搭接压顶收口和密封状态复核', '淋水或闭水观察渗漏路径和时间记录', '渗漏松动开裂和收口缺陷整改复测', '屋脊试验记录和节点验收签认闭合'],
  '04-05-11-P06': ['屋顶窗节点验收范围和窗框编号核对', '窗框固定防水附加层和泛水收口检查', '启闭五金密封胶条和排水孔状态复查', '淋水观察渗漏变形和密封缺陷整改', '屋顶窗节点验收记录和移交签认闭合'],
  '06-04-05-P07': ['除尘系统防腐复测范围和设备管段清单确认', '风管壳体灰斗支架涂层厚度和附着力检查', '防静电跨接法兰补涂和检修口破损复查', '漏涂锈蚀起皮污染和补口缺陷整改', '除尘防腐资料和交接签认闭合'],
  '06-05-04-P07': ['舒适空调风机复测范围和设备编号确认', '风机基础减振软接防护罩和接线状态检查', '转向风量振动噪声和电流参数复测', '异响超振风量不足和接线问题整改', '风机功能复测资料和交接签认闭合'],
  '06-06-04-P07': ['恒温恒湿风机复测范围和控制参数确认', '风机空气处理设备过滤段盘管和加湿段检查', '风量温湿度控制振动噪声和排水状态复测', '温湿度偏差漏水结露和报警异常整改', '恒温恒湿设备复测资料和交接签认闭合'],
  '06-09-08-P07': ['真空吸尘设备联调范围和接口编号确认', '风机滤尘设备集尘桶和负压管网状态检查', '负压吸力噪声振动和堵塞报警功能复测', '吸力不足漏风堵塞和控制异常整改', '真空吸尘联调资料和交接签认闭合'],
  '06-17-04-P06': ['溴化锂溶液循环范围和阀门状态确认', '循环泵过滤器液位和真空状态检查', '溶液循环稳定性浓度温度和液位观察记录', '液位波动结晶泄漏和循环异常整改复测', '溶液循环观察记录和运行移交签认'],
  '07-05-05-P06': ['塑料护套线直敷验收范围和回路编号确认', '固定间距弯曲半径穿越保护和外观检查', '绝缘测试接线盒端子和标识状态复核', '破皮压扁松脱和回路错接问题整改', '直敷验收记录和隐蔽移交签认闭合'],
  '08-05-03-P08': ['柜机机架配线架复测范围和设备编号确认', '柜机机架水平垂直固定接地和成品保护检查', '配线架端接标签跳线和端口映射复测', '松动错接标签缺失和端口不通问题整改', '安装功能复测记录和交接签认闭合'],
  '08-05-04-P08': ['信息插座安装复测范围和点位清单确认', '面板高度方正度固定状态和编号标签检查', '端接线序链路连通和面板保护复测', '错线松动面板污染和链路失败问题整改', '信息插座功能复测资料和交接签认闭合'],
  '08-08-05-P06': ['有线电视试运行问题销项范围确认', '前端设备分支分配器终端电平和频道表复核', '图像质量信号稳定性和用户端口抽测', '雪花串扰低电平和端口故障整改复测', '有线电视试运行资料移交和验收签认'],
  '08-11-02-P06': ['LED链路标签和屏体分区清册核对', '发送卡接收卡端口编号和线缆标签复查', '链路通断点亮测试和屏体分区映射验证', '错标漏标掉线花屏和端口错误整改', '测试记录清册和资料归档签认闭合'],
  '08-16-06-P06': ['安防试运行问题销项范围和责任清单确认', '录像回放门禁权限报警联动和事件记录复测', '掉线漏录误报权限异常和联动失败问题整改', '复测签认前配置备份和账号清册核对', '试运行问题销项和复测签认资料闭合'],
  '03-12-05-P03': ['基层空鼓裂缝检查', '平整度和垂直度实测', '浮灰油污和松散层清理', '界面剂涂刷均匀性检查', '局部修补找平复测', '花饰粘结作业面移交确认'],
  '03-12-05-P04': ['花饰材料批次和适用部位核对', '粘结砂浆或胶粘剂配合比确认', '现场搅拌时间和稠度检查', '开放时间和可操作时间控制', '试粘样块粘结状态检查', '失效材料清退和用料批次标识'],
  '03-12-05-P06': ['花饰安装基准线复核', '拼缝宽度和顺直度检查', '阴阳角方正和垂直度实测', '收口胶缝或嵌缝处理', '污染划伤缺陷修补', '观感复查和成品保护移交'],
  '03-12-05-P08': ['表面污染和破损点排查', '修补材料颜色匹配确认', '局部修补和打磨处理', '清洁剂适用性检查', '保护膜或围挡设置', '复查问题销项和移交签认'],
  '04-02-04-P06': ['泡沫混凝土成型面保护检查', '养护覆盖和保湿状态复核', '干密度取样位置确认', '试件编号和送检记录归集', '强度或密度结果复核', '低强低密区域整改复测'],
  '04-05-03-P05': ['女儿墙和山墙阴角圆弧检查', '泛水高度和收头固定复核', '压顶坡向和滴水线检查', '密封收口连续性复查', '节点渗漏隐患排查', '隐蔽影像编号留存'],
  '04-05-08-P05': ['过水孔位置和尺寸复核', '孔口防水附加层检查', '过水坡向和通畅性测试', '周边保护层收口复查', '积水和堵塞隐患处理', '过水孔节点影像编号留存'],
  '04-05-10-P05': ['屋脊基层顺直度复核', '脊瓦或盖板固定检查', '搭接长度和密封连续性复查', '防风固定件抽查', '雨水流向和渗漏隐患检查', '屋脊节点影像编号留存'],
  '05-09-03-P07': ['饮用水防腐基层除锈清洁检查', '底漆覆盖和漏涂复查', '面漆厚度和外观抽测', '管件焊口补口质量检查', '划伤破损点修补复测', '通水前防腐状态移交'],
  '05-10-05-P06': ['中水雨水绝热材料规格和厚度复核', '管道接口和阀件保温检查', '防潮层搭接连续性复查', '支吊架冷桥处理检查', '破损污染部位修补复测', '系统标识和保护移交'],
  '05-13-05-P07': ['热源机房设备管道基层处理检查', '涂层遍数和颜色标识复核', '干膜厚度抽测', '焊口法兰和支架补涂检查', '机房潮湿部位防护复查', '缺陷修补后复测'],
  '06-06-02-P03': ['恒温恒湿板材和型材规格复核', '部件下料尺寸和编号标识', '咬口法兰或连接件制作', '部件组装方正度检查', '密封加固和外观复查', '成品分区堆放保护'],
  '06-09-02-P03': ['真空吸尘部件规格和接口尺寸复核', '部件下料加工和编号标识', '连接件密封面处理', '部件组装和固定检查', '气密外观和清洁度复查', '成品保护和分区堆放'],
  '06-10-06-P02': ['辐射末端管材板材批次和规格核对', '外观损伤和壁厚抽查', '盘管弯折和接口完整性检查', '保温层或保护层状态复核', '抽样复验送检记录整理', '不合格材料隔离处置'],
  '06-10-07-P09': ['热泵机组基础减振和水平度复测', '管路阀件和软连接状态检查', '电源相序和接地连续性测试', '启停联锁和保护动作复测', '运行压力温度电流记录', '异常问题整改复测'],
  '06-11-02-P09': ['冷热水泵组基础和减振器复测', '进出口阀门软接和过滤器检查', '电机转向和接地测试', '单机点动和振动噪声复测', '流量扬程和电流记录', '问题整改后复测闭合'],
  '06-12-02-P09': ['冷却水泵组基础标高和水平度复测', '冷却水管路阀件状态检查', '电机转向和绝缘接地测试', '单机试运转和振动检查', '运行流量压力温升记录', '异常点整改复测'],
  '06-13-02-P09': ['地源侧泵组安装位置复核', '集分水器阀门和过滤器检查', '电气接线和接地连续性测试', '循环试运转和排气补水检查', '流量压力和温差记录', '问题整改和参数复测'],
  '06-14-05-P09': ['水源换热取排水接口和管线路径复核', '管道坡度支架和防腐层检查', '阀门过滤器和换热接口复查', '冲洗排污和通水试运行', '流量温差和泄漏检查记录', '缺陷整改后复测'],
  '06-17-05-P09': ['蒸汽热水管道坡度补偿器和支吊架复测', '阀门疏水器和安全附件检查', '保温防烫和标识完整性复查', '升温暖管和泄漏检查', '压力温度和疏水状态记录', '异常整改复测'],
  '06-18-01-P09': ['室外机组基础和减振固定复测', '冷媒管冷凝水和电源接口检查', '防雨防雷和检修空间复查', '单机启动和风机运转检查', '运行压力电流和噪声记录', '问题整改复测'],
  '06-18-02-P09': ['室内机组吊架固定和水平度复测', '风口风管和冷凝水坡度检查', '电源控制线和接地测试', '送回风和排水试运行', '温差噪声和漏水检查记录', '缺陷整改后复测'],
  '06-19-06-P09': ['低温热水地板分集水器和回路编号复核', '埋地管间距和保护层状态检查', '水压保压和渗漏复测', '分回路冲洗排气检查', '供回水温差和流量平衡记录', '地面成品保护移交'],
  '07-04-02-P08': ['电机和执行机构端子排复核', '动力线控制线压接牢固度检查', '线号和回路编号一致性核对', '绝缘和接地连续性测试', '点动方向和联锁动作复测', '错接松动问题整改'],
  '07-05-05-P02': ['塑料护套线路径复核', '基层固定点间距放样', '保护管位置和转弯半径检查', '穿墙穿板防护处理', '固定件牢固度抽查', '线路成品保护确认'],
  '07-05-09-P07': ['专用灯具位置和安装高度复测', '吊挂固定和防坠措施检查', '接线极性和接地测试', '通电亮灯和控制回路测试', '应急或专用功能复测', '缺陷整改后复测'],
  '07-06-09-P07': ['备用电源接地干线和设备连接点复核', '跨接线规格和压接质量检查', '接地标识和防腐处理复查', '接地连续性测试', '接地电阻结果核对', '断点漏接问题整改复测'],
  '08-09-02-P04': ['广播分区和回路清册核对', '线缆端子编号粘贴', '功放输出端口对应复核', '分区通断和声压抽测', '标签耐久性和可读性检查', '错接漏标问题整改'],
  '08-10-03-P12': ['会议终端和显示设备点位复核', '音视频线缆端接和编号检查', '扩声显示和拾音效果测试', '会议控制场景联动复测', '软件参数和账号权限核查', '故障点整改复测'],
  '08-13-02-P05': ['信息点位和回路清册核对', '线缆两端编号一致性检查', '永久标签位置和方向确认', '标签粘贴牢固度复查', '抽样链路对应测试', '错标漏标整改复测'],
  '08-17-01-P08': ['应急响应设备安装位置和供电条件复核', '网络接口和控制线接线检查', '本地启停和状态显示测试', '平台联动和报警反馈复测', '断电恢复和异常告警检查', '问题整改后功能复测'],
  '02-01-03-P03': ['浇筑分区和施工缝位置复核', '模板钢筋预埋隐蔽签认核对', '混凝土供应坍落度入模温度要求确认', '振捣养护和试块留置责任交底', '浇筑放行记录和交底签认闭合'],
  '02-03-07-P01': ['专项方案设计参数和适用范围复核', '张拉膜材节点设备和检测要求核对', '专家论证审批意见和整改清单闭合', '施工监测安全措施和验收标准交底', '方案复核签认和首件作业放行'],
  '02-05-07-P02': ['配合比报告原材批次和外加剂掺量复核', '坍落度扩展度入模温度和运输时限确认', '现场试拌或首车检测结果记录', '偏差调整退料和二次检测闭合', '配合比坍落度签认和浇筑放行'],
  '02-05-07-P03': ['浇筑分区顺序和施工缝留设复核', '泵管布置布料路线和振捣点位交底', '高低跨节点预埋件和密集钢筋部位控制', '旁站检查试块留置和收面养护要求确认', '浇筑交底签认和班组责任闭合'],
  '02-06-06-P02': ['起重设备型号吨位和吊装半径复核', '站位地基承载垫板和行走路线确认', '构件重量吊点索具和试吊要求交底', '警戒区通信指挥和应急措施检查', '吊装方案交底签认和作业放行'],
  '02-06-07-P02': ['空间结构安装分段顺序和支撑体系复核', '起重设备站位吊点索具和构件编号确认', '临时支撑胎架标高和卸载控制要求交底', '监测点位安全防护和作业人员分工检查', '安装方案交底签认和首段施工放行'],
  '02-07-04-P06': ['防护部位范围和责任清单复核', '覆盖围挡防碰撞和防污染措施检查', '保护状态巡检记录和影像资料归集', '破损污染问题整改和复测签认', '防护验收记录和移交边界闭合'],
  '03-02-04-P03': ['勾缝砂浆材料批次和配合比复核', '颜色样板编号光照条件和确认记录核对', '试勾样段缝宽深度和饱满度检查', '色差污染开裂和返修措施确认', '样板签认记录和大面勾缝放行'],
  '03-10-01-P05': ['样板房间基层状态和涂饰范围复核', '色板编号材料批次和施工工法确认', '阴阳角收口分色线和遮蔽保护检查', '观感色差流坠刷痕和污染缺陷评审', '样板确认记录和大面施工放行'],
  '03-10-01-P09': ['观感复测范围房间清单和抽查比例确认', '色差流坠刷痕污染和收口缺陷实测', '破损返修补涂边界和成品保护复查', '整改影像复测记录和责任单位签认', '观感交接资料和移交签认闭合'],
  '03-10-02-P05': ['饰面样板范围基层封闭和材料批次复核', '色板纹理光泽和工艺做法确认', '节点收口阴阳角和分格线检查', '样板观感色差污染和修补可行性评审', '样板确认记录和展开施工放行'],
  '03-10-02-P09': ['饰面观感复测范围和房间编号确认', '色差光泽裂纹污染和接槎缺陷检查', '局部修补打磨保护和复涂边界复核', '整改复测影像和验收意见归集', '观感交接签认和资料闭合'],
  '03-10-03-P05': ['特种涂饰样板基层和环境条件复核', '材料批次配比稠度和施工工具确认', '肌理纹路厚度和边界收口检查', '样板观感耐污或附着性能评审', '样板签认资料和大面施工放行'],
  '03-10-03-P09': ['特种涂饰观感复测范围和抽查点位确认', '纹路色差厚薄不均和污染破损检查', '局部修补纹理衔接和保护措施复核', '问题销项影像和验收记录归集', '观感交接签认和资料闭合'],
  '04-01-02-P02': ['隔汽材料型号厚度和合格资料核验', '卷材外观破损污染和批次数量检查', '搭接胶带密封材料和节点辅材复核', '见证取样送检编号和复验报告跟踪', '材料复验结论和隔汽施工放行'],
  '04-01-04-P01': ['保护层材料规格强度等级和批次资料核验', '砂浆细石混凝土或板材外观数量检查', '分格缝嵌缝材料和养护材料复核', '取样送检编号试块留置和报告跟踪', '材料复验结论和保护层施工放行'],
  '04-02-03-P03': ['试喷区域基层含水率和界面处理复核', '喷涂设备压力喷嘴和配比参数确认', '样板厚度平整度密实度和粘结状态检查', '开裂空鼓掉粉和厚度偏差整改复测', '试喷样板签认和大面喷涂放行'],
  '04-04-04-P04': ['密封胶批次相容性报告和适用部位复核', '基层清洁干燥底涂和背衬材料检查', '试打胶宽深比饱满度和表面成型确认', '气泡开裂污染和粘结不良缺陷整改', '相容性确认打胶记录和节点验收闭合'],
  '05-03-04-P08': ['绝热节能验收范围和管段清单确认', '绝热厚度密度接缝和防潮层复测', '阀门法兰支吊架和冷桥处理检查', '破损结露标识缺失问题整改复验', '节能验收资料归档和系统移交签认'],
  '05-05-10-P07': ['供暖防腐验收范围和管段编号确认', '基层除锈涂层遍数和干膜厚度复测', '阀门法兰支架补口和色标流向检查', '漏涂起皮锈蚀和污染问题整改复验', '防腐记录归档和供暖系统交接签认'],
  '05-10-04-P07': ['中水雨水防腐复测范围和管段清单确认', '涂层厚度附着力补口和支吊架状态检查', '潮湿部位管井接口和色环标识复核', '破损漏涂锈蚀和污染问题整改复测', '防腐质量资料和交接签认闭合'],
  '05-11-03-P07': ['泳池浴池防腐复测范围和水处理管段确认', '涂层耐水耐药剂资料和厚度附着力检查', '法兰阀门泵房潮湿部位补口复核', '起皮锈蚀渗漏污染和药剂腐蚀问题整改', '防腐质量复测资料和交接签认闭合'],
  '06-04-02-P06': ['除尘部件清单编号规则和入库范围确认', '灰斗检修口泄爆口和旁通接口外观复查', '防静电跨接法兰密封和耐磨层保护检查', '编号标签成品保护和分区堆放记录', '入库验收资料和安装领用交接签认'],
  '06-05-05-P07': ['舒适空调防腐复测范围和风管设备清单确认', '风管支架设备外壳涂层厚度和附着力检查', '法兰补涂检修口和冷凝水区域防腐复核', '漏涂起皮污染和破损缺陷整改复测', '防腐质量资料和交接签认闭合'],
  '06-05-09-P09': ['舒适空调绝热节能验收范围和系统清单确认', '风管水管绝热厚度接缝防潮层复测', '阀门法兰支吊架和穿墙部位保温检查', '结露破损空鼓和标识缺失整改复验', '绝热节能资料归档和系统移交签认'],
  '06-06-05-P07': ['恒温恒湿防腐复测范围和洁净保护要求确认', '风管设备涂层完整性密封面和支架状态检查', '冷凝水盘检修口和过滤段周边防腐复核', '锈蚀污染漏涂和涂层破损问题整改', '恒温恒湿防腐资料和交接签认闭合'],
  '06-06-09-P06': ['恒温恒湿绝热节能复测范围和控制区确认', '风管水管绝热厚度接缝和防潮层检查', '冷桥热桥阀件法兰和检修口保温复核', '结露温湿度偏差和破损污染问题整改', '绝热节能复测资料和交接签认闭合'],
  '06-09-02-P06': ['真空吸尘部件编号规则和入库清单确认', '集尘桶阀件快速接口和密封面外观复查', '负压管件法兰连接和防静电跨接检查', '编号标签成品保护和分区堆放记录', '部件入库验收和安装领用交接签认'],
  '06-09-05-P07': ['真空吸尘防腐复测范围和管网设备清单确认', '风管设备支架涂层厚度和附着力检查', '集尘区域检修口法兰和跨接点补涂复核', '漏涂锈蚀污染和破损问题整改复测', '防腐质量资料和交接签认闭合'],
  '06-10-04-P08': ['防腐成品保护范围和管段设备清单确认', '保护膜围挡警示标识和交叉作业界面检查', '涂层破损污染划伤和补口状态巡检', '问题点位修补复测和影像记录归集', '防腐成品保护记录归档和移交签认'],
  '08-01-04-P07': ['运行报表范围设备清单和日志周期确认', '报警事件趋势曲线和运行参数记录核对', '缺报错报时间偏差和异常事件复核', '报表模板日志截图和数据导出资料归集', '运行报表日志资料汇总和运维移交签认'],
  '08-01-04-P08': ['运维账号移交范围系统清单和角色矩阵确认', '账号权限密码策略审计日志和备份资料核对', '登录验证权限抽测和异常账号清理复核', '培训记录操作手册和应急联系人资料归集', '账号资料移交验收和系统接管签认闭合'],
  '08-02-01-P06': ['运营商交接范围机房点位和链路清单确认', '进线资源端口编号和光电转换设备状态复核', '信号测试开通记录和故障处理资料核对', '钥匙账号资料和维保联系人清单归集', '运营商交接签认和通信开通资料闭合'],
  '08-05-06-P08': ['综合布线软件版本许可和部署范围确认', '服务器终端配置参数和接口地址复核', '端口映射链路测试和账号权限验证', '配置备份版本记录和异常问题整改', '软件功能复测资料和交接签认闭合'],
  '03-11-01-P08': ['裱糊观感复测范围和房间清单确认', '拼缝搭接起翘空鼓和污染缺陷检查', '阴阳角收口边线顺直和色差复核', '破损修补清洁保护和问题销项记录', '裱糊观感交接签认和成品保护移交'],
  '03-11-02-P08': ['软包观感复测范围和墙面编号确认', '面料色差皱褶拼缝压条和污染缺陷检查', '基层牢固边角收口和防火资料复核', '破损松动返修和复测影像资料归集', '软包观感交接签认和成品保护移交'],
  '03-12-04-P09': ['护栏扶手功能复测范围和点位清单确认', '高度间距垂直度和固定节点实测复核', '扶手接头转角防坠措施和表面观感检查', '松动划伤防护缺陷和安全隐患整改复测', '护栏扶手验收记录和交接签认闭合'],
  '03-12-05-P02': ['花饰构件材质规格和安装部位复核', '样板编号比例线型和观感效果确认', '构件外观破损色差和尺寸偏差检查', '粘结锚固材料适用性和试装样段复核', '样板确认记录和花饰安装放行'],
  '03-12-05-P09': ['花饰观感复测范围和构件编号确认', '拼缝顺直色差污染空鼓和固定牢固度检查', '边角收口防坠措施和成品保护状态复核', '缺陷修补局部更换和复测影像归集', '花饰功能复测资料和交接签认闭合'],
  '05-11-04-P06': ['泳池浴池绝热复测范围和管段清单确认', '绝热厚度接缝防潮层和阀件保温检查', '潮湿腐蚀区结露破损和标识状态复核', '破损空鼓结露和接口缺陷整改复测', '绝热节能复测资料和交接签认闭合'],
  '05-12-03-P09': ['水景喷泉绝热验收范围和设备管段确认', '绝热材料厚度接缝防潮和防冻保护检查', '泵房潮湿部位阀件法兰和管道保温复核', '结露破损渗漏和保温缺口整改复测', '绝热专项验收资料和运维移交签认'],
  '05-13-02-P09': ['热源辅助设备运行参数移交范围确认', '水泵补水排污换热和控制柜状态复核', '压力温度流量电流和报警参数记录核对', '异常工况噪声振动泄漏和控制偏差整改', '运行参数台账运维培训和验收签认闭合'],
  '06-10-05-P02': ['换热器板片垫片规格型号和资料核验', '板片外观变形划伤密封槽和数量检查', '垫片材质批次弹性和接口适用性复核', '缺损污染错型和资料缺项补正记录', '复验资料闭合和换热器组装放行'],
  '06-10-08-P09': ['冷凝水绝热验收范围和管段清单确认', '绝热厚度接缝坡向和防潮层复测', '水盘排水口穿墙套管和保温收口检查', '结露滴水破损空鼓和标识缺失整改复验', '冷凝水绝热资料归档和移交签认闭合'],
  '06-11-04-P09': ['冷热水防腐验收范围和管段编号确认', '基层除锈涂层遍数厚度和附着力复测', '阀门法兰支架补口和色标流向检查', '漏涂起皮锈蚀污染和破损缺陷整改', '防腐验收资料归档和系统交接签认'],
  '06-12-04-P09': ['冷却水防腐验收范围和设备管段清单确认', '管道支架阀件和冷却塔接口涂层检查', '涂层厚度附着力补口和潮湿部位复核', '锈蚀漏涂起皮污染和破损问题整改', '防腐验收资料归档和系统交接签认'],
  '06-12-06-P09': ['冷却水绝热验收范围和管段清单确认', '绝热厚度接缝防潮层和保护层复测', '阀门法兰支架冷桥和塔侧接口保温检查', '结露破损空鼓标识缺失和收口缺陷整改', '绝热验收资料归档和系统交接签认'],
  '06-13-04-P09': ['地源侧防腐验收范围和埋地管路清单确认', '管道接口阀件支架和集分水器涂层检查', '涂层厚度附着力补口和潮湿区域复核', '锈蚀漏涂破损和标识缺失问题整改', '防腐验收资料归档和地源系统交接签认'],
  '06-13-06-P09': ['地源侧绝热验收范围和管段清单确认', '绝热厚度接缝防潮层和保护层检查', '集分水器阀门法兰和穿墙部位保温复核', '结露破损空鼓和标识缺失整改复验', '绝热验收资料归档和地源系统交接签认'],
  '06-14-02-P09': ['水源侧水泵复测范围和设备编号确认', '基础减振进出口阀件过滤器和软接检查', '电机转向绝缘接地流量压力和振动复测', '泄漏异响超振和参数偏差整改复验', '功能复测资料和交接签认闭合'],
  '06-14-04-P09': ['水源侧防腐验收范围和管段设备清单确认', '管道阀件支架泵体接口涂层完整性检查', '涂层厚度附着力补口和取排水接口复核', '漏涂锈蚀起皮污染和破损问题整改', '防腐验收资料归档和系统交接签认'],
  '06-14-07-P09': ['水源侧绝热验收范围和管段设备清单确认', '绝热材料厚度接缝防潮层和保护层检查', '阀门法兰换热接口和穿墙部位保温复核', '结露破损空鼓和收口缺陷整改复验', '绝热验收资料归档和系统交接签认'],
  '06-15-02-P09': ['蓄能水泵复测范围和设备编号确认', '基础减振阀件软接过滤器和保温状态检查', '电机转向流量压力振动和蓄放能联动复测', '泄漏异响超振和控制偏差整改复验', '功能复测资料和蓄能系统交接签认'],
  '06-15-04-P09': ['蓄能系统防腐验收范围和设备管段清单确认', '蓄水罐管道阀件支架和接口涂层检查', '涂层厚度附着力补口和潮湿部位复核', '锈蚀起皮漏涂污染和破损问题整改', '防腐验收资料归档和蓄能系统交接签认'],
  '06-15-06-P09': ['蓄能系统绝热验收范围和设备管段确认', '蓄水罐管道阀件绝热厚度和防潮层检查', '温度测点接口保护层和支架冷桥复核', '结露破损空鼓和标识缺失整改复验', '绝热验收资料归档和蓄能系统交接签认'],
  '06-16-02-P09': ['制冷设备防腐验收范围和设备清单确认', '机组外壳管道支架和阀件涂层检查', '涂层厚度附着力补口和潮湿部位复核', '锈蚀漏涂污染破损和保护缺陷整改', '防腐验收资料归档和制冷系统交接签认'],
  '06-16-05-P09': ['制冷管道绝热验收范围和管段清单确认', '绝热厚度接缝防潮层和保护层复测', '阀门法兰支架冷桥和穿墙部位保温检查', '结露破损空鼓和标识缺失整改复验', '绝热验收资料归档和制冷系统交接签认'],
  '06-17-01-P02': ['吸收式机组箱件清单和随机资料核验', '机组铭牌型号参数附件数量和外观检查', '运输损伤锈蚀接口封堵和保管状态复核', '缺件损伤资料缺项和补证补件记录', '开箱验收资料闭合和安装作业放行'],
  '06-17-01-P09': ['吸收式机组功能复测范围和设备编号确认', '基础减振管路阀件真空和电控接口检查', '点动运行压力温度真空度和噪声振动复测', '泄漏真空异常结晶风险和联锁问题整改', '功能复测资料和制冷机房交接签认'],
  '06-17-02-P09': ['吸收式系统防腐验收范围和设备管段确认', '机组管道阀件支架和补口涂层检查', '涂层厚度附着力潮湿部位和色标复核', '漏涂锈蚀起皮污染和破损问题整改', '防腐验收资料归档和吸收式系统交接签认'],
  '06-17-07-P09': ['吸收式管道绝热验收范围和管段清单确认', '绝热厚度接缝防潮层和保护层检查', '蒸汽热水溶液管道阀件法兰保温复核', '结露破损空鼓和收口缺陷整改复验', '绝热验收资料归档和吸收式系统交接签认'],
  '06-19-04-P09': ['太阳能系统防腐验收范围和设备管段确认', '集热器支架管道阀件和屋面接口涂层检查', '涂层厚度附着力补口和露天耐候状态复核', '锈蚀漏涂起皮污染和破损问题整改', '防腐验收资料归档和太阳能系统交接签认'],
  '06-19-05-P09': ['太阳能绝热验收范围和屋面管段确认', '绝热厚度接缝防潮层和保护层检查', '集热器接口阀件法兰和穿屋面部位保温复核', '结露破损空鼓和紫外老化缺陷整改', '绝热验收资料归档和太阳能系统交接签认'],
  '07-02-03-P09': ['母线槽功能复测范围和回路编号确认', '连接螺栓插接箱支架和接地连续性检查', '绝缘电阻相序温升和通电运行状态复测', '接头发热松动绝缘异常和标识缺陷整改', '功能复测资料和变配电室交接签认'],
  '07-02-05-P02': ['高低压电缆规格长度和盘号资料核验', '合格证耐压资料外观护套和端部封堵检查', '电缆截面电压等级弯曲半径和敷设路径复核', '资料缺项外观损伤和长度偏差整改记录', '资料核验结论和电缆敷设放行'],
  '07-05-06-P06': ['钢索配线验收范围和回路编号确认', '钢索固定端张力间距和防腐状态复核', '导线绑扎间距绝缘保护和转弯部位检查', '松弛磨损绝缘破损和标识缺失整改', '钢索配线验收资料和隐蔽移交签认'],
  '07-06-02-P09': ['柴油发电机组功能复测范围和设备编号确认', '基础减振排烟燃油冷却和电缆接口检查', '启动切换带载运行频率电压和噪声振动复测', '漏油排烟异常切换失败和报警问题整改', '功能复测资料和备用电源交接签认'],
  '07-06-07-P07': ['穿线验收范围和回路清册确认', '管内槽盒清扫穿线余量和线缆标识检查', '绝缘测试导通相序和端子压接质量复核', '错穿破皮松动和标签缺失问题整改', '穿线验收资料和隐蔽交接签认'],
  '08-06-01-P06': ['运营商进场条件范围和机房点位确认', '电源接地桥架管路和设备安装面复核', '光纤馈线天线路由和信号测试条件检查', '资料缺项接口不通和现场障碍整改', '进场条件签认和运营商施工放行'],
  '08-11-04-P12': ['信息导引机房设备交接范围和设备清单确认', '服务器播放器交换机和显示控制设备状态复核', '账号权限配置备份和节目发布资料核对', '故障工单遗留问题和备品备件清单归集', '运维资料移交和信息导引接管签认'],
  '08-11-07-P06': ['信息导引试运行问题销项范围确认', '播放终端屏体亮度联网状态和节目策略复测', '内容错播黑屏花屏断网和告警记录核对', '问题整改复测影像和配置备份资料归集', '试运行销项资料和信息导引移交签认'],
  '08-12-02-P06': ['子钟回路标签和分区清册范围确认', '母钟子钟回路编号地址和线缆标签复核', '同步偏差通信状态和故障显示测试记录', '错标漏标通信异常和测试缺项整改', '测试记录归档和时钟回路清册签认'],
  '08-12-03-P12': ['时钟系统交接范围和设备清单确认', '母钟子钟NTP接口账号权限和配置备份核对', '授时精度同步记录报警日志和维护资料复核', '遗留问题备品备件和维保联系人资料归集', '运维资料移交和时钟系统接管签认'],
  '08-12-05-P06': ['时钟系统试运行问题销项范围确认', '母钟子钟同步状态通信链路和报警记录复测', '授时偏差断线掉电恢复和显示异常整改', '复测记录配置备份和问题关闭资料归集', '试运行销项资料和时钟系统移交签认'],
  '08-13-02-P07': ['测试记录和线缆清册归档范围确认', '端口编号链路测试报告和竣工图一致性核对', '线缆标签配线架端接和清册抽样复查', '测试失败错标漏标和资料缺项整改', '测试记录归档和线缆清册移交签认'],
  '08-13-05-P07': ['试运行报告和培训资料范围确认', '系统日志报警记录用户操作和运行截图核对', '培训签到课件手册和考核记录资料归集', '问题销项配置备份和账号权限复核', '试运行报告培训资料汇总和移交签认'],
  '08-14-02-P08': ['线缆测试记录归档范围和回路清单确认', 'BMS点表地址端子编号和线缆标签复核', '绝缘导通通信状态和测试报告核对', '错线漏线地址冲突和资料缺项整改', '线缆测试记录归档和点表移交签认'],
  '08-17-02-P08': ['应急响应软件版本许可和部署范围确认', '服务器终端接口地址和应急场景参数复核', '平台联动报警推送处置流程和账号权限验证', '配置备份日志截图和异常问题整改', '软件功能复测资料和交接签认闭合'],
  '08-17-03-P07': ['复测签认和调试报告整理范围确认', '应急响应点表场景脚本和联动记录核对', '报警推送处置闭环和响应时效数据复测', '问题整改日志截图和配置备份资料归集', '调试报告整理和复测签认闭合'],
  '09-02-02-P09': ['节能验收范围和问题清单确认', '计量阀件保温调试报告和检测资料核对', '供暖分区温差流量室温和能耗数据复测', '节能问题销项资料缺项和参数偏差整改', '节能验收资料归档和问题销项签认'],
  '10-02-01-P07': ['缺损件登记范围和箱件清单确认', '曳引机控制柜轿厢门机和安全部件外观检查', '合格证明随机资料和包装损伤记录核对', '缺件损伤补件补证和现场保管复查', '进场验收记录签认和缺损闭合归档'],
}

const STANDARD_ACTIVITY_STEP_HARDENING_OVERRIDES: Record<string, string[]> = {
  '06-10-09-P07': [
    '末端空调排水联调范围和排水点清单核对',
    '提升泵浮球水盘软管和接线端子状态复核',
    '冷凝水管坡度水封保温和吊架间距检查',
    '逐台注水提升排放停泵回水和溢流报警测试',
    '倒坡堵塞渗漏或泵启停异常整改复测签认',
  ],
  '06-13-05-P03': [
    '钻孔机具定位孔位编号和钻杆垂直度复核',
    '成孔孔径孔深地层变化和泥浆状态记录',
    '孔底沉渣清孔效果和塌孔缩径风险检查',
    '孔深垂直度偏差超限原因定位和修孔复测',
    '成孔验收影像记录和下道回填作业放行',
  ],
  '06-13-05-P05': [
    '回填料级配含水率和配比通知单核对',
    '分段回填厚度虚铺高度和填料批次确认',
    '分层夯实遍数压实设备和边角补夯记录',
    '压实度含水率偏差和沉陷空鼓问题复测',
    '回填试验报告分段验收和隐蔽记录闭合',
  ],
  '06-13-05-P06': [
    '水平集管沟槽轴线标高坡度和排水去向复核',
    '沟底垫层支墩套管和防腐保护施工检查',
    '集管接口热熔焊接或法兰连接质量记录',
    '管道冲洗试压保温保护和回填条件确认',
    '沟槽积水接口渗漏或坡度偏差整改复测',
  ],
  '06-18-01-P04': [
    '屋面设备防风拉结点和抗拔构造清单核对',
    '支架压重锚固防坠构件和紧固件安装检查',
    '设备底座排水坡向泛水收口和检修空间复核',
    '防风防坠节点抽查和排水通畅性试验',
    '松动积水泛水破损或坠落风险整改签认',
  ],
  '06-18-05-P06': [
    '提升泵型号扬程电源和控制点位复核',
    '泵体基础减振止回阀和检修阀门安装检查',
    '排水接口坡度软接固定和防倒灌措施确认',
    '启停液位联动排放能力和报警反馈测试',
    '接口渗漏倒灌泵振动或液位异常整改复测',
  ],
  '06-18-05-P07': [
    '通水试验范围排水路径和观察点清单确认',
    '临时封堵排水口水盘和溢流保护状态复核',
    '连续注水排放流量坡度和末端出水记录',
    '接口保温穿墙套管和吊顶内渗漏巡查',
    '积水倒坡渗漏堵塞问题整改后复测闭合',
  ],
  '06-18-07-P05': [
    '冷凝水排水点编号接入位置和最低点复核',
    '管道坡度水封清扫口和支吊架间距检查',
    '保温防结露连续性穿墙套管和滴水风险复核',
    '注水排放溢流报警和吊顶内凝露观察',
    '结露积水倒坡或水封失效整改复测签认',
  ],
  '07-01-04-P01': [
    '室外导管路径坐标埋深和穿越障碍核对',
    '管沟开挖宽度垫层标高和排水条件检查',
    '保护管材质壁厚防腐层和弯管半径复核',
    '道路绿化管综交叉和检修井接口确认',
    '路径偏移埋深不足或交叉冲突整改放行',
  ],
  '07-01-04-P02': [
    '管沟支架间距套管规格和防腐做法核对',
    '支墩支架预埋件定位固定和标高检查',
    '金属导管防腐补口刷漆和套管封堵施工',
    '穿墙穿基础节点保护层和防水收口复核',
    '支架松动防腐破损或套管错位整改签认',
  ],
  '07-01-04-P03': [
    '导管连接方式管口处理和密封材料核对',
    '弯管半径弯扁度和接口同轴度检查',
    '承插螺纹焊接或热熔连接过程记录',
    '穿越防水节点密封压实和防护套安装复核',
    '接口松动进水弯曲超限或密封缺陷整改复测',
  ],
  '07-01-04-P04': [
    '管口护口规格穿线牵引路径和余量核对',
    '管内清扫通球试穿和积水杂物清理检查',
    '接线盒检修井内管口封堵和编号标识',
    '穿线前防水防尘保护和临时封堵复核',
    '堵管毛刺积水或护口缺失整改后签认',
  ],
  '07-01-04-P05': [
    '导管接地跨接位置材质和连接方式核对',
    '跨接线截面搭接长度和紧固防松检查',
    '金属导管桥接接地连续性逐段测试',
    '接地端子防腐标识和测试记录复核',
    '跨接漏设接触不良或电阻超限整改复测',
  ],
  '07-01-04-P06': [
    '室外导管隐蔽范围坐标埋深和影像资料核对',
    '管沟回填前管口封堵防腐和接地记录复查',
    '管线保护标识警示带和交叉节点检查',
    '隐蔽验收问题清单整改和复验记录闭合',
    '隐蔽验收签认后回填恢复和移交台账归档',
  ],
  '07-01-05-P08': [
    '沟槽回填材料粒径含水率和分层厚度核对',
    '电缆保护板警示带和桥架盖板安装检查',
    '回填夯实沉降控制和井室接口保护复核',
    '桥架盖板连续性接地跨接和编号复查',
    '回填沉陷盖板缺失或线路保护缺陷整改签认',
  ],
  '07-05-03-P01': [
    '照明导管路径灯位盒位标高和回路编号复核',
    '墙顶地开槽范围结构避让和管综交叉检查',
    '灯具开关插座盒定位样板和控制线关系确认',
    '湿区防水套管和吊顶检修界面复核',
    '盒位偏差路径冲突或标高错误整改放行',
  ],
  '07-05-03-P02': [
    '照明导管支吊架间距开槽深度和套管规格核对',
    '支架固定开槽修补和穿墙套管安装检查',
    '吊顶内导管排列避让风管喷淋和检修口复核',
    '墙体槽盒保护层和防裂加强措施确认',
    '支架松动套管漏设或开槽超限整改复测',
  ],
  '07-05-03-P03': [
    '导管连接锁母护圈和弯曲半径施工样板确认',
    'PVC或金属导管弯扁度接口胶粘紧固检查',
    '箱盒连接顺直度管口进入长度和防脱措施复核',
    '转弯处穿线半径和管内清扫通球测试',
    '接口松脱弯曲超限或管口毛刺整改签认',
  ],
  '07-05-03-P04': [
    '照明导管管口护口规格和穿线条件清单核对',
    '管内清扫通球试穿和盒内杂物清理',
    '盒口封堵保护线号标签和回路编号复查',
    '吊顶封板前穿线通道和牵引余量确认',
    '堵管护口缺失盒内污染或编号错误整改闭合',
  ],
  '07-05-03-P05': [
    '照明金属导管接地跨接位置和截面核对',
    '跨接线压接焊接螺栓紧固和防松检查',
    '箱盒桥架与导管接地连续性测试',
    '接地测试记录回路编号和隐蔽影像复核',
    '跨接漏设接触不良或测试不合格整改复测',
  ],
  '07-05-03-P06': [
    '照明导管隐蔽范围墙顶地部位和回路清单核对',
    '管线固定盒位标高接地跨接和封堵状态复查',
    '吊顶封闭前导管排列检修空间和防火封堵检查',
    '隐蔽验收问题整改复验和影像记录归档',
    '验收签认后穿线作业界面和责任移交确认',
  ],
  '07-06-05-P01': [
    '备用电源回路导管路径负荷等级和供电边界复核',
    '双电源切换柜发电机或UPS接口位置核对',
    '耐火线路敷设路径防火分区和桥架隔离确认',
    '管综交叉检修空间和穿越结构节点检查',
    '路径冲突供电边界错误或防火分区遗漏整改签认',
  ],
  '07-06-05-P02': [
    '备用回路支吊架定位间距和套管规格核对',
    '支架预埋固定套管防火封堵基层处理检查',
    '穿墙穿楼板套管标高和防水防火节点复核',
    '与常用电源管线间距隔离和标识确认',
    '支架松动套管漏设或隔离距离不足整改复测',
  ],
  '07-06-05-P03': [
    '金属或刚性导管规格壁厚和预制弯管半径核对',
    '切管套丝去毛刺防腐补口和管口保护检查',
    '预制弯管编号试拼和穿线半径复核',
    '耐火线路保护导管连接件和接线盒匹配确认',
    '弯扁度超限防腐破损或编号错配整改签认',
  ],
  '07-06-05-P04': [
    '备用电源导管敷设顺序固定点和箱盒连接核对',
    '导管水平垂直度支吊架紧固和防松检查',
    '箱盒进出管锁母护口和封堵措施复核',
    '耐火桥架导管转换节点和防火包覆确认',
    '固定不牢箱盒错位或转换节点缺陷整改复测',
  ],
  '07-06-05-P05': [
    '备用电源导管跨接接地位置和连接方式核对',
    '跨接线截面端子压接和防松防腐检查',
    '导管箱盒桥架接地连续性逐段测试',
    '接地测试报告回路编号和隐蔽影像复核',
    '接地漏接电阻超限或端子松动整改闭合',
  ],
  '07-06-05-P06': [
    '备用回路防火封堵位置管口护口和穿线清单核对',
    '穿越防火分区封堵材料批次厚度和密实度检查',
    '管口护口牵引通道管内清扫和试穿确认',
    '封堵标识耐火等级和隐蔽影像资料复核',
    '封堵缺陷护口缺失或堵管问题整改签认',
  ],
  '08-05-01-P01': [
    '综合布线路由弱电井层间桥架接口清单核对',
    '水平区垂直干线路径与强电暖通管综避让复核',
    '信息点密度机柜位置和配线架容量校核',
    '穿越防火分区套管预留和检修空间确认',
    '路由冲突井道接口错位或容量不足问题闭合',
  ],
  '08-05-01-P02': [
    '梯架托盘槽盒规格防腐层和支吊架间距核对',
    '吊杆横担膨胀螺栓和抗震支架定位安装检查',
    '转弯三通变径接头和桥架连接片安装复核',
    '桥架水平垂直度荷载余量和盖板试装确认',
    '支架松动连接片漏装或桥架变形整改签认',
  ],
  '08-05-01-P03': [
    '综合布线导管规格弯曲半径和牵引长度核对',
    '穿墙穿楼板套管防火分区位置和封堵界面确认',
    '导管弯管穿线盒和过线盒设置检查',
    '光缆铜缆分槽隔离和最小转弯半径复核',
    '弯曲超限过线盒缺失或防火界面遗漏整改复测',
  ],
  '08-05-01-P04': [
    '槽盒连接片跨接线规格和等电位端子核对',
    '连接片螺栓防松垫片和跨接压接质量检查',
    '弱电井接地干线机柜接地排和桥架连通测试',
    '等电位连接电阻测试记录和编号标识复核',
    '跨接漏设接触不良或标识错漏整改闭合',
  ],
  '08-05-01-P05': [
    '综合布线管槽穿墙穿楼板洞口清单核对',
    '防火封堵材料耐火等级批次和施工厚度检查',
    '线缆桥架防火包覆阻火包和防火泥密实度复核',
    '封堵标识防火分区编号和隐蔽影像归档',
    '封堵空鼓开裂漏封或材料错用问题整改签认',
  ],
  '08-05-01-P06': [
    '综合布线检修空间盖板开启方向和净距复核',
    '桥架转弯半径分隔板连续性和线缆容量检查',
    '机柜弱电井吊顶内检修口位置联核',
    '盖板锁扣接地跨接和维护通道通畅性确认',
    '检修受阻分隔板缺失或转弯半径不足整改闭合',
  ],
  '08-05-01-P07': [
    '管槽编号线缆标签规则和隐蔽验收范围核对',
    '桥架导管封堵接地和检修空间复查',
    '隐蔽影像端口编号配线架位置和路由台账归档',
    '验收问题清单复验和弱电施工界面移交',
    '标识缺失资料错漏或隐蔽缺陷整改签认',
  ],
  '08-08-01-P02': [
    '同轴干线槽盒规格支吊架间距和接入路径核对',
    '弱电井至分配箱干线桥架支架安装检查',
    '屏蔽同轴线与强电线路隔离距离复核',
    '转弯半径盖板固定和检修空间确认',
    '支架松动隔离不足或干线路由冲突整改闭合',
  ],
  '08-08-01-P03': [
    '卫星馈线入户导管路径屋面穿线点和防水节点核对',
    '馈线导管弯曲半径过线盒和防雷接地位置检查',
    '屋面进线套管泛水收口和防雨封堵复核',
    '馈线牵引试通和机房入口保护措施确认',
    '弯曲超限进水风险或过线盒缺失整改签认',
  ],
  '08-08-01-P04': [
    '分配分支器箱体编号安装高度和服务区域核对',
    '箱体底盒固定进出线导管和接地端子检查',
    '箱内同轴分配器安装空间散热和检修净距复核',
    '端口编号线缆余量和屏蔽接地连续性确认',
    '箱体偏位端口错配或接地缺陷整改复测',
  ],
  '08-08-01-P05': [
    '有线电视桥架槽盒接地跨接点位清单核对',
    '跨接线压接螺栓防松和防腐保护检查',
    '穿越防火分区封堵材料和密实度复核',
    '接地连续性测试和防火标识影像归档',
    '跨接漏设封堵漏做或测试超限整改闭合',
  ],
  '08-09-01-P02': [
    '扬声器回路音频管槽路径和分区广播清单核对',
    '支吊架安装间距固定方式和桥架隔离检查',
    '吊顶扬声器底盒预留和检修口位置复核',
    '音频线管强弱电间距和防火分区穿越确认',
    '支架松动点位偏差或隔离不足问题整改签认',
  ],
  '08-09-01-P04': [
    '功放机房至广播分区路由和回路编号核对',
    '干线管槽敷设方向过线盒和转弯半径检查',
    '楼层分区端子箱进出线和线缆余量复核',
    '消防广播切换接口和普通广播隔离确认',
    '路由错接容量不足或接口遗漏整改闭合',
  ],
  '08-09-01-P05': [
    '广播管槽接地跨接和防火封堵部位清单核对',
    '桥架接地跨接线压接防松和编号标识检查',
    '穿越防火分区封堵材料厚度和密实度复核',
    '接地连续性测试封堵影像和隐蔽资料归档',
    '跨接漏设封堵缺陷或标识缺失整改签认',
  ],
  '08-10-01-P02': [
    '音视频管线桥架桌面管槽路径和会议席位清单核对',
    '桌面信息盒地插线槽和弱电井接口定位检查',
    'HDMI音频控制线分槽隔离和转弯半径复核',
    '会议桌地面线槽盖板承载和检修开启确认',
    '桌面点位错位线槽冲突或隔离不足整改闭合',
  ],
  '08-10-01-P03': [
    '摄像机吊装点投影显示管路和承重条件核对',
    '吊杆预埋件底盒电源信号导管定位检查',
    '投影幕显示屏安装面管线出口和检修空间复核',
    '云台摄像机控制线和视频线分路敷设确认',
    '吊点偏位承重不足或管路漏预留整改签认',
  ],
  '08-10-01-P04': [
    '机柜至主席台线路路由和端口编号核对',
    '地面线槽桥架过线盒和线缆牵引路径检查',
    '主席台话筒显示控制接口底盒位置复核',
    '强弱电隔离屏蔽接地和线缆余量确认',
    '路由堵塞端口错配或屏蔽接地缺陷整改闭合',
  ],
  '08-10-01-P05': [
    '话筒扬声器控制线分槽隔离规则和回路清单核对',
    '音频控制电源线槽分隔板和标识安装检查',
    '抗干扰屏蔽接地端接和线缆交叉距离复核',
    '分槽隔离实测抽查和端口编号一致性确认',
    '串扰隐患分隔缺失或端口错接整改复测',
  ],
  '08-11-01-P01': [
    '信息导引LED屏发布终端点位和可视范围核对',
    '屏体安装基础电源容量和网络接入位置复核',
    '吊装挂装支撑结构检修空间和散热条件检查',
    '发布终端编号管理分区和控制主机接口确认',
    '点位遮挡容量不足或检修受限问题整改签认',
  ],
  '08-11-01-P02': [
    '屏体电源管槽和信号槽盒分设路径核对',
    '电源线信号线桥架隔离间距和防干扰措施检查',
    '屏体电源回路保护开关和接地端子复核',
    '信号槽盒转弯半径线缆余量和检修口确认',
    '强弱电混敷接地缺陷或管槽容量不足整改闭合',
  ],
  '08-11-01-P03': [
    '发布终端至机房网络路由端口和VLAN规划核对',
    '管槽敷设过线盒转弯半径和防火穿越检查',
    '机房交换机端口配线架和终端线缆余量复核',
    '链路通断测试编号标签和资产台账确认',
    '链路错配端口占用或路由堵塞整改复测',
  ],
  '08-11-01-P04': [
    '信息导引屏检修通道维护空间和开门方向复核',
    '屏体背后散热距离电源检修口和吊顶检修口检查',
    '高位屏升降或吊装维护路径安全条件确认',
    '维护电源隔离开关和控制箱操作空间复核',
    '检修受阻散热不足或维护路径不安全整改闭合',
  ],
  '08-11-01-P05': [
    '屏体控制线管路规格路径和转弯半径核对',
    '控制线导管过线盒间距和牵引长度检查',
    '管口护口编号标签和防火穿越节点复核',
    '控制线试穿通球和端接余量确认',
    '弯曲超限堵管护口缺失或编号错误整改签认',
  ],
  '08-11-01-P06': [
    '信息导引管槽接地跨接防火封堵清单核对',
    '桥架槽盒接地连续性和等电位连接测试',
    '穿墙穿楼板封堵材料批次厚度和标识检查',
    '隐蔽影像端口编号和屏体控制线台账归档',
    '验收缺陷复验销项和发布系统安装界面移交',
  ],
  '08-12-01-P02': [
    '子钟点位管槽安装底盒位置和授时分区核对',
    '墙面吊顶底盒标高固定方式和检修条件检查',
    '子钟电源网络或RS485接口管路预留复核',
    '点位编号控制区域和线缆余量确认',
    '点位偏差底盒松动或接口漏预留整改签认',
  ],
  '08-12-01-P03': [
    '授时天线馈线导管路径屋面穿越点核对',
    '天线支座基础导管防水套管和防雷引下位置检查',
    '馈线弯曲半径屏蔽保护和机房入口封堵复核',
    '屋面泛水收口接地连接和牵引试通确认',
    '进水风险弯曲超限或防雷接口遗漏整改闭合',
  ],
  '08-12-01-P04': [
    'NTP网络RS485时钟总线路由和主从时钟清单核对',
    '总线分支拓扑终端电阻和弱电井接口检查',
    '网络交换端口VLAN和时钟控制器位置复核',
    '总线通断地址编号和线缆屏蔽接地确认',
    '地址冲突总线断点或端接错误整改复测',
  ],
  '08-12-01-P05': [
    '授时天线防雷接地引下线和等电位端子核对',
    '避雷器安装馈线屏蔽接地和防水接头检查',
    '接地电阻测试防雷器状态和标识复核',
    '机房等电位连接和防雷资料编号确认',
    '接地不连续避雷器漏设或测试超限整改签认',
  ],
  '08-12-01-P06': [
    '时钟系统管槽标识检修路径和隐蔽范围核对',
    '导管桥架封堵接地和端口编号复查',
    '子钟控制器授时天线路由影像资料归档',
    '隐蔽验收问题清单复验和设备安装界面移交',
    '标识缺失资料错漏或检修路径受阻整改闭合',
  ],
  '08-13-01-P01': [
    '信息化应用梯架托盘槽盒路径和应用系统清单核对',
    '业务终端机房接口弱电井容量和路由复核',
    '管综冲突强弱电隔离和检修空间检查',
    '防火分区穿越点套管预留和桥架容量确认',
    '路径冲突容量不足或接口遗漏整改签认',
  ],
  '08-13-01-P02': [
    '信息化应用支吊架管槽材料规格和批次核对',
    '桥架托盘防腐层板厚连接件和盖板检查',
    '支吊架抗震构件膨胀螺栓和防松件复核',
    '材料复验报告合格证和进场影像归档',
    '材料错用防腐破损或连接件缺失整改闭合',
  ],
  '08-13-01-P03': [
    '信息化梯架托盘槽盒支吊架定位线和标高核对',
    '吊杆横担抗震支架和转弯支撑安装检查',
    '桥架水平垂直度伸缩节和固定支架复核',
    '盖板试装荷载余量和检修通道确认',
    '支架松动标高偏差或桥架变形整改签认',
  ],
  '08-13-01-P04': [
    '信息化槽盒导管敷设方向和端口编号核对',
    '导管弯管箱盒连接和过线盒设置检查',
    '桥架导管转换节点线缆牵引半径复核',
    '管槽固定管口护口和临时封堵确认',
    '固定不牢堵管护口缺失或转换错位整改闭合',
  ],
  '08-13-01-P05': [
    '信息化管槽穿墙穿楼板防火封堵点位核对',
    '封堵材料耐火等级批次和施工厚度检查',
    '桥架洞口阻火包防火泥和防火板密实度复核',
    '封堵编号标识隐蔽影像和验收资料归档',
    '漏封空鼓开裂或材料错用整改签认',
  ],
  '08-13-01-P06': [
    '信息化管槽接地跨接和等电位连接点位核对',
    '跨接线截面压接螺栓防松和防腐检查',
    '桥架机柜接地排和弱电井等电位连通测试',
    '测试记录端子编号和隐蔽影像复核',
    '跨接漏设电阻超限或端子松动整改闭合',
  ],
  '08-13-01-P07': [
    '信息化管槽标识规则隐蔽范围和端口编号核对',
    '桥架导管封堵接地检修空间和盖板状态复查',
    '路由影像端口台账和资产编号资料归档',
    '隐蔽验收问题复验销项和应用系统安装放行',
    '标识缺失资料错漏或隐蔽缺陷整改签认',
  ],
  '08-13-01-P08': [
    '应用系统管槽安装移交范围和接收单位清单核对',
    '管槽容量余量端口编号和检修路径复查',
    '封堵接地隐蔽验收资料和路由台账移交',
    '遗留问题责任人期限和复验安排确认',
    '移交签认后设备安装作业面保护和资料归档',
  ],
  '08-14-01-P01': [
    'BMS梯架托盘槽盒路径和DDC点位清单核对',
    '冷热源空调给排水强电接口和弱电井路由复核',
    '传感器执行器控制箱点位容量和检修空间检查',
    '穿越防火分区套管预留和管综避让确认',
    '点位漏项路由冲突或容量不足整改签认',
  ],
  '08-14-01-P02': [
    'BMS支吊架材料规格防腐层和批次资料核对',
    '桥架托盘板厚连接件盖板和抗震构件检查',
    '支吊架膨胀螺栓防松件和防腐补口复核',
    '材料复验报告合格证和进场影像归档',
    '防腐破损材料错用或连接件缺失整改闭合',
  ],
  '08-14-01-P03': [
    'BMS梯架托盘槽盒支吊架定位线和标高核对',
    '吊杆横担抗震支架和转弯支撑安装检查',
    '桥架水平垂直度伸缩节和固定支架复核',
    '盖板试装荷载余量和检修通道确认',
    '支架松动标高偏差或桥架变形整改签认',
  ],
  '08-14-01-P04': [
    'BMS槽盒导管敷设方向和控制点编号核对',
    '导管弯管箱盒连接和过线盒设置检查',
    '桥架导管转换节点线缆牵引半径复核',
    '管槽固定管口护口和临时封堵确认',
    '固定不牢堵管护口缺失或转换错位整改闭合',
  ],
  '08-14-01-P05': [
    'BMS管槽穿墙穿楼板套管和防火封堵点位核对',
    '套管居中固定防水收口和封堵基层清理检查',
    '防火封堵材料耐火等级厚度和密实度复核',
    '封堵标识防火分区编号和隐蔽影像归档',
    '套管偏位漏封空鼓或材料错用整改签认',
  ],
  '08-14-01-P06': [
    'BMS桥架导管接地跨接和等电位连接点位核对',
    '跨接线截面端子压接螺栓防松和防腐检查',
    'DDC箱机柜桥架和弱电井接地连续性测试',
    '测试记录端子编号和隐蔽影像复核',
    '跨接漏设电阻超限或端子松动整改闭合',
  ],
  '08-14-01-P07': [
    'BMS管槽转弯半径检修空间和设备维护路径核对',
    '过线盒间距桥架弯通和线缆余量检查',
    'DDC箱阀门执行器传感器检修净距复核',
    '盖板开启方向和吊顶检修口位置确认',
    '转弯半径不足检修受阻或过线盒缺失整改签认',
  ],
  '08-14-01-P08': [
    'BMS隐蔽验收范围路径标识和点位编号核对',
    '管槽封堵接地检修空间和盖板状态复查',
    '路由影像点表编号和控制箱位置资料归档',
    '隐蔽验收问题复验销项和设备安装界面移交',
    '标识缺失资料错漏或隐蔽缺陷整改闭合',
  ],
  '08-14-01-P09': [
    'BMS管槽安装移交范围和楼控设备接收清单核对',
    '管槽容量余量点表编号和检修路径复查',
    '封堵接地隐蔽验收资料和路由台账移交',
    '遗留问题责任人期限和复验安排确认',
    '移交签认后DDC及传感器安装作业面保护',
  ],
  '08-15-01-P01': [
    '消防报警回路线管路径和防火分区回路清单核对',
    '探测器手报模块消火栓按钮点位与图纸复核',
    '消防控制室至楼层端子箱路由和容量检查',
    '耐火线路敷设区域管综避让和检修空间确认',
    '回路漏项路径冲突或防火分区错配整改签认',
  ],
  '08-15-01-P02': [
    '探测器模块盒位定位线安装高度和保护半径核对',
    '吊顶内底盒预留梁风口灯具避让检查',
    '模块箱端子箱进出线导管和编号标识复核',
    '湿区防水封堵和防误碰保护措施确认',
    '盒位偏差遮挡漏设或编号错误整改闭合',
  ],
  '08-15-01-P03': [
    '消防报警耐火线路管槽材质规格和回路编号核对',
    '金属导管防火桥架敷设固定和防火包覆检查',
    '穿越防火分区封堵和耐火线路隔离复核',
    '管口护口过线盒和线缆牵引条件确认',
    '耐火保护缺失堵管或隔离不足整改签认',
  ],
  '08-15-01-P04': [
    '消防报警桥架导管支吊架定位和转弯半径核对',
    '支架固定抗震构件和过线盒设置检查',
    '导管弯扁度桥架弯通和线缆牵引半径复核',
    '吊顶检修空间和消防设备安装界面确认',
    '支架松动转弯超限或过线盒缺失整改闭合',
  ],
  '08-15-01-P06': [
    '消防报警线路接地屏蔽连续性测试范围核对',
    '屏蔽层接地端接方式和消防控制室接地排检查',
    '桥架金属导管跨接和端子箱接地连续性测试',
    '测试记录回路编号和隐蔽影像复核',
    '屏蔽断点跨接漏设或电阻超限整改签认',
  ],
  '08-16-01-P01': [
    '安防桥架路径摄像机门禁报警点位清单核对',
    '视频监控门禁报警主机和弱电井接口复核',
    '室内外摄像机立杆管路和供电容量检查',
    '强弱电隔离防雷接地和检修空间确认',
    '点位漏项视场遮挡或路由冲突整改签认',
  ],
  '08-16-01-P02': [
    '视频监控门禁报警管槽路由放线和防区编号核对',
    '摄像机门禁读卡器报警按钮安装面定位检查',
    '机房至前端设备桥架导管和过线盒复核',
    '室外穿墙防水套管和防雷引下接口确认',
    '路由偏移防区错配或室外防水遗漏整改闭合',
  ],
  '08-16-01-P03': [
    '安防桥架槽盒导管支吊架定位和标高核对',
    '吊杆横担抗震支架和转弯支撑安装检查',
    '导管箱盒连接管口护口和桥架盖板复核',
    '线缆容量转弯半径和检修通道确认',
    '支架松动管口缺陷或桥架变形整改签认',
  ],
  '08-16-01-P04': [
    '摄像机立杆门禁底盒管路预留位置和基础条件核对',
    '立杆基础接地管线预埋和防水接头检查',
    '门禁底盒出门按钮磁力锁管路和电源接口复核',
    '室外摄像机防雷接地和防水封堵确认',
    '立杆偏位底盒漏设或防雷防水缺陷整改闭合',
  ],
  '08-16-01-P05': [
    '安防接地跨接屏蔽干扰隔离点位清单核对',
    '桥架导管立杆机柜接地连续性检查',
    '视频信号控制线电源线隔离间距和屏蔽端接复核',
    '防雷器安装接地电阻和抗干扰抽测确认',
    '接地漏接干扰风险或隔离不足整改签认',
  ],
  '08-16-01-P06': [
    '安防管槽穿墙穿楼板防火封堵部位核对',
    '封堵材料耐火等级批次厚度和密实度检查',
    '室外穿墙防水封堵与防火封堵界面复核',
    '封堵编号标识隐蔽影像和验收资料归档',
    '漏封空鼓防水失效或材料错用整改闭合',
  ],
  '08-16-01-P07': [
    '安防管槽隐蔽验收范围点位编号和路由台账核对',
    '管槽封堵接地底盒立杆基础和检修空间复查',
    '摄像机门禁报警管线影像资料归档',
    '隐蔽验收问题复验销项和设备安装界面移交',
    '资料错漏点位偏差或隐蔽缺陷整改签认',
  ],
  '08-16-01-P08': [
    '安防管槽路径标识移交范围和接收清单核对',
    '桥架导管防区端口编号和资产台账复查',
    '封堵接地隐蔽验收资料和维护路径移交',
    '遗留问题责任人期限和复验安排确认',
    '移交签认后摄像机门禁报警设备安装面保护',
  ],
  '08-18-04-P01': [
    '机房给水接入排水排放界面和运维边界核对',
    '补水点地漏排水沟漏水报警位置复核',
    '机柜空调消防弱电设备周边防水隔离检查',
    '给排水管线穿越机房防水套管和检修空间确认',
    '界面错漏排水能力不足或设备风险点整改签认',
  ],
  '08-18-04-P02': [
    '机房管材阀门地漏漏水报警材料规格和批次核对',
    '阀门压力等级防腐材质地漏水封和篦子检查',
    '漏水报警线传感器控制器和联动接口复核',
    '材料合格证复验报告和进场影像归档',
    '材料错用阀门缺陷或报警部件漏项整改闭合',
  ],
  '08-18-04-P03': [
    '机房给水支管阀门隔断点位置和编号核对',
    '支管坡度支架阀门方向和检修空间检查',
    '穿墙套管防水封堵和设备区防护措施复核',
    '分区隔断阀启闭标识和压力试验确认',
    '阀门方向错误渗漏或隔断点缺失整改签认',
  ],
  '08-18-04-P05': [
    '机房排水坡度支吊架套管封堵范围核对',
    '排水管坡向支架间距地漏接入和水封检查',
    '穿墙穿楼板套管防水防火封堵密实度复核',
    '通水排放漏水报警联动和渗漏观察确认',
    '倒坡堵塞套管渗漏或封堵缺陷整改闭合',
  ],
  '09-05-01-P01': [
    '地埋换热孔水源井取排水条件和许可边界核对',
    '孔位井位水文地质资料和地下管线避让复核',
    '施工平台泥浆排放取排水保护措施检查',
    '试井水量水温水质和回灌条件确认',
    '孔井条件不符取排水受限或管线冲突整改签认',
  ],
  '09-05-01-P03': [
    '地埋管下管深度U形管规格和回填料配比核对',
    '孔内清孔试压下管保护和管口编号检查',
    '分段回填密实度浆液配比和水平集管连接记录',
    '换热支路冲洗试压保温和接口渗漏复核',
    '下管卡阻回填不密实或集管渗漏整改闭合',
  ],
  '10-02-02-P06': [
    '电梯井道排油排水点和作业平台交接范围核对',
    '底坑积水油污清理排水设施和临电照明检查',
    '井道脚手架作业平台防护栏杆和承载验收复核',
    '移交前孔洞防护层门封闭和安全警示确认',
    '积水油污平台缺陷或防护遗漏整改签认',
  ],
  '03-01-01-P02': ['回填土料击实报告和含水率取样复核', '灰土或砂石垫层级配筛分和最大粒径检查', '试验段虚铺厚度压实遍数和机械组合校核', '进场批次不合格材料退场晾晒或换料复验', '材料复验报告编号和垫层铺填放行签认'],
  '03-04-03-P07': ['排水孔孔位间距孔径和坡向逐孔复核', '透气孔预留套管高度和防堵保护检查', '孔内砂浆杂物清理和通孔试排水确认', '孔口篦网滴水线和防虫网安装复查', '堵孔倒坡或渗水异常整改复测签认'],
  '03-07-04-P06': ['伸缩缝宽度分格位置和结构缝对应关系复核', '弹性密封材料规格嵌填深度和背衬条检查', '排水槽坡向滴水节点和外排路径核对', '热胀冷缩变形余量和面层收口保护复查', '缝边开裂积水或密封脱粘整改复测签认'],
  '03-09-04-P07': ['板缝宽度顺直度和分格控制线复核', '缝内杂物清理背衬条嵌入深度检查', '排水构造坡向泄水口和防堵措施核对', '密封胶打注饱满度表面压光和粘结边界复查', '缝隙错台积水或密封缺陷整改复测签认'],
  '03-12-01-P02': ['基层墙地面平整度空鼓裂缝和含水率复核', '给排水预留口标高坡向和封堵状态检查', '电气底盒管线位置深度和绝缘保护核对', '洁具设备安装净距和防水收口界面会签', '接口偏位堵塞或基层缺陷整改复测放行'],
  '05-08-01-P03': ['压力排水沟槽深度宽度边坡和支护状态复核', '沟底标高坡向排水降水和积水清理检查', '砂石垫层厚度密实度和管枕位置校核', '吊装下管通道吊点管节编号和接口方向确认', '沟槽坍塌垫层扰动或下管条件缺陷整改签认'],
  '05-08-02-P06': ['压力排水试验泄压点和排放路径确认', '临时封堵盲板堵头和支撑固定状态复核', '分段泄压排水流量水质和安全隔离检查', '临时封堵拆除后接口清理和正式封闭复查', '泄压残压渗漏或封堵遗留问题整改签认'],
  '05-10-03-P06': ['中水液位计补水阀排水泵和溢流口点位核对', '控制箱端子线号回路编号和接地连续性检查', '高低液位启停溢流报警和强排逻辑接线复核', '手自动切换远程反馈和故障报警信号测试', '误动作漏接线或液位偏差整改复测签认'],
  '05-10-06-P04': ['中水箱液位标尺传感器和溢流高度复核', '补水阀排水泵启停液位和延时参数测试', '溢流排放路径通畅性和倒灌风险检查', '高低液位报警远程反馈和手自动切换联测', '液位漂移启停异常或溢流堵塞整改复测签认'],
  '05-11-02-P09': ['泳池过滤循环反冲洗阀组状态和流程牌核对', '过滤泵反冲洗泵排水管路和旁通阀联动测试', '反冲洗浊度压力差流量和持续时间记录', '排水口排放能力防倒灌和污水接入条件复查', '反冲洗不彻底阀位错误或排水滞留整改签认'],
  '05-12-04-P05': ['水景循环过滤泵阀过滤器和补水点位复核', '循环流量过滤压差补水液位和溢流高度测试', '排水口泄空管路和检修旁通通畅性检查', '灯光喷头联动运行下水位波动和补排水平衡复测', '过滤堵塞补水失灵或排水不畅整改签认'],
  '06-05-07-P04': ['换热器水侧风侧接口方位和检修空间复核', '阀组过滤器压力表温度计和旁通管安装检查', '冷凝水盘存水弯坡度和排放路径确认', '软接减振支架和保温接口防结露处理复查', '接口渗漏排水倒坡或旁通阀位错误整改签认'],
  '06-06-07-P06': ['空调机组冷凝水盘溢流口和排水接口标高复核', '冷凝排水管坡度存水弯和支吊架间距检查', '溢流排水报警点位防渗漏套管和接水盘安装', '通水试排冷凝水连续排放和接口渗漏复测', '倒坡堵塞溢流或穿墙渗漏问题整改签认'],
  '06-06-08-P05': ['冷凝水管道坡度控制点和最低排放点复核', '存水弯水封高度清扫口和检修空间检查', '吊顶内排放路径防结露保温和支架固定复查', '通水排放滞水点溢流点和末端接入状态测试', '倒坡滞水水封失效或接入错误整改签认'],
  '06-10-01-P07': ['空调水系统分区通水范围和排放路径确认', '末端阀门过滤器排气阀和泄水阀状态复核', '分段注水排气冲洗和水流方向观察记录', '低点排水高点排气和管路堵塞风险检查', '通水不畅渗漏气堵或排水滞留整改签认'],
  '06-10-02-P08': ['风机盘管冷凝排水分区抽测范围和测点确认', '排水管坡度存水弯水封和软接接口复查', '连续注水排放能力溢流报警和渗漏观察', '运行噪声振动和水流冲击异响复测', '排水不足噪声超限或接口渗漏整改签认'],
  '06-10-03-P02': ['分区排水口编号位置和接水盘范围复核', '临时接水排水软管固定坡度和防脱落检查', '排水接入点封堵状态防倒灌和防污染措施确认', '滴漏观察点和溢流应急处置材料配置', '接水措施缺失排水口错位或倒灌风险整改签认'],
  '06-10-03-P05': ['空调末端排水管坡度控制线和低点位置复核', '吊顶内滞水点软管弯折和支架下挠检查', '通水试排观察水流速度和残留水量记录', '倒坡积水接口渗漏和水封失效问题定位', '排水坡度修正滞水点消除后复测签认'],
  '06-10-09-P03': ['多联机室内机分区通水排水测试清单确认', '冷凝水提升泵浮球水盘和排水软管状态复核', '分区逐台注水提升排放和停泵回水观察', '集中排水立管接入防倒灌和末端排放通畅检查', '提升泵失灵倒坡堵塞或回水问题整改签认'],
  '06-10-09-P05': ['多联机冷凝排水接口渗漏点和滞水点定位复核', '室内机水盘软管卡箍和保温防结露状态检查', '管路坡度支架间距和穿墙套管密封复查', '连续运行排水滞留回流和吊顶污染风险观察', '接口渗漏滞水倒坡或保温破损整改签认'],
  '01-05-03-P04': ['粗平分区边界设计标高和挖填交界线复核', '推土机平地机分区粗平和余土调配作业', '临时排水沟集水坑和场内汇水坡向成型检查', '低洼积水软弱翻浆或坡向倒返水点整改复测', '粗平完成面标高排水坡向和下道碾压界面签认'],
  '01-06-01-P02': ['边坡分级平台宽度坡率控制桩和开挖边线复核', '自上而下分台阶开挖和坡面预留保护层修整', '坡脚反压临边荷载机械站位和弃土距离巡查', '超挖欠挖软弱夹层或局部滑塌风险处置复测', '分级开挖坡面实测记录和支护作业面移交签认'],
  '01-06-01-P03': ['锚杆锚索孔位角度长度和成孔设备参数复核', '钻孔清孔钢筋束或锚索安装和居中支架设置', '注浆压力水灰比浆液饱满度和返浆状态记录', '塌孔偏孔注浆不饱满或锚固长度不足整改复验', '锚杆锚索安装注浆记录和张拉锁定条件签认'],
  '01-06-01-P04': ['格构梁框架梁轴线标高截面和锚杆节点位置复核', '钢筋绑扎模板支设预埋排水孔和伸缩缝安装', '混凝土浇筑振捣养护和节点包裹保护作业', '蜂窝露筋截面偏差或锚头包封缺陷整改复测', '格构梁框架实体质量验收和坡面防护接口移交'],
  '01-06-01-P05': ['喷射面层坡面清理挂网搭接和喷射厚度标识复核', '钢筋网锚钉固定泄水孔保护和喷射配合比核对', '分层喷射回弹料清理厚度控制和养护作业', '空鼓开裂掉块厚度不足或网片外露整改复验', '喷射混凝土面层实测验收和后续排水接口签认'],
  '01-06-01-P06': ['坡顶截水沟坡脚排水沟和排水孔布置位置复核', '沟槽开挖垫层砌筑或现浇成型和坡向控制作业', '排水孔钻孔反滤包裹盲管安装和出水口保护', '倒坡堵塞渗漏冲刷或排水孔失效问题整改复测', '截排水系统通水检查和边坡防护移交签认'],
  '01-06-01-P07': ['边坡监测点位编号基准点保护和观测路线复核', '测斜沉降裂缝水位监测点埋设和初始读数采集', '开挖支护阶段位移速率裂缝扩展和渗水巡测记录', '监测点损坏数据跳变或预警阈值接近情况复测闭合', '监测初始成果签认和边坡后续观测台账移交'],
  '01-06-01-P08': ['边坡支护验收范围监测时段和移交界面确认', '坡率平台锚杆喷层格构梁和截排水实体抽查', '位移沉降裂缝渗水和排水通畅性数据复核', '渗水开裂位移异常或资料缺项责任闭合复验', '边坡验收意见监测移交台账和后续观测责任签认'],
  '01-06-02-P06': ['墙背回填材料类别含水率和反滤层保护状态复核', '墙背分层摊铺边角夯实和靠墙小型机具压实作业', '泄水孔反滤包裹盲沟通畅和墙身位移巡查', '压实度不足挤压墙身排水堵塞或沉陷问题整改复验', '墙背回填压实报告和挡墙验收界面签认'],
  '01-06-03-P02': ['放坡边线平台宽度坡率控制桩和开挖分区复核', '分级开挖坡面预留保护层人工修坡和危石清除作业', '坡顶荷载弃土距离机械站位和雨季防冲刷巡查', '超挖欠挖坡面松散软弱夹层或局部滑塌处置复验', '坡面修整实测成果和防护施工界面移交签认'],
  '01-06-03-P03': ['坡顶截水沟轴线标高坡度和汇水范围复核', '沟槽开挖基底夯实垫层砌筑或现浇沟身施工', '沉降缝伸缩缝泄水口和接入既有排水系统检查', '沟底倒坡开裂渗漏冲刷或接驳不畅整改复测', '坡顶截水沟通水试验和坡面防护放行签认'],
  '01-06-03-P04': ['坡面防护类型分区边界基层稳定和材料批次复核', '植草格构砌石或框架梁分区施工和坡面锚固作业', '种植土厚度砌体勾缝框架节点和坡面排水接口检查', '冲刷脱落空鼓开裂绿化成活不足或节点松动整改复验', '坡面防护实体质量和养护移交责任签认'],
  '01-06-03-P05': ['坡脚排水沟监测点位置和坡面汇水路径复核', '坡脚沟槽开挖垫层砌筑盲沟连接和出水口防冲刷施工', '沉降位移裂缝水位监测点埋设保护和初始读数采集', '沟内淤堵倒坡出水不畅或监测点松动损坏整改复测', '坡脚排水功能检查和监测台账移交签认'],
  '01-06-03-P06': ['边坡稳定验收范围雨后复查条件和观测周期确认', '坡率平台裂缝渗水防护完整性和排水系统联合检查', '沉降位移裂缝水位观测数据趋势和报警阈值比对', '稳定性异常排水失效防护破损或资料缺项闭合复验', '边坡稳定验收结论和后续巡检监测责任移交'],
  '01-01-03-P06': ['排水盲沟轴线坡度沟底标高和反滤层级配复核', '沟槽开挖修整盲管铺设和碎石反滤层分层填筑', '土工布包裹搭接盲管接口和出水口保护检查', '倒坡堵塞反滤层污染或出水不畅问题整改复测', '盲沟通水检查隐蔽影像和地基处理界面签认'],
  '01-01-07-P01': ['场地整平范围设计标高排水去向和软弱区边界复核', '表层清理临时排水沟和机械通行路线整理作业', '整平完成面标高坡向积水点和作业面承载巡查', '低洼积水翻浆松软或排水断点整改复测', '整平排水条件验收和砂垫层施工界面签认'],
  '01-01-07-P02': ['砂垫层材料级配含泥量和竖向排水体点位复核', '砂垫层分层摊铺整平和厚度坡向控制作业', '塑料排水板或砂井定位插设深度和间距检查', '排水体断裂回带堵塞或砂垫层厚度不足整改复测', '砂垫层排水体隐蔽验收和加载预压界面签认'],
  '01-07-03-P02': ['地下连续墙接缝止水带止水钢板和接缝清理状态复核', '沉井施工缝凿毛清洗止水材料安装和基层湿润作业', '接缝注浆管预埋附加防水层和节点封闭施工检查', '接缝夹泥止水偏位渗漏或施工缝污染整改复验', '特殊施工法接缝防水隐蔽验收和接口移交签认'],
  '01-07-04-P02': ['排水管盲沟轴线标高坡度和集水路径复核', '沟槽修整垫层施工排水管铺设和盲沟填料分层作业', '接口包裹反滤层土工布搭接和检查井接入检查', '倒坡错接堵塞填料污染或接口渗漏整改复测', '排水管盲沟隐蔽验收和通水检查签认'],
  '01-07-04-P03': ['集水坑位置尺寸泵坑标高和排水电源接口复核', '集水坑模板钢筋防水节点和泵座基础施工作业', '排水泵安装浮球液位控制止回阀和出水管连接检查', '泵坑渗漏泵体反转液位失灵或排水不畅整改复验', '集水坑排水泵试运行记录和防水排水系统移交签认'],
  '01-07-04-P05': ['排水实测范围盲沟管线集水坑和排出口清单复核', '坡度水位流向流量和通水排放实测记录采集', '淤堵倒坡渗漏泵启停异常和积水点问题定位', '问题点清淤返修调坡换泵和二次通水复测', '排水实测复核资料和问题销项签认闭合'],
  '01-07-04-P06': ['排水系统验收范围运行工况和维护边界确认', '盲沟排水管集水坑水泵控制箱和排出口联合检查', '连续排水试运行水位恢复泵启停和排放能力复核', '验收缺陷堵塞渗漏报警失效或资料缺项整改复验', '排水系统验收结论运维台账和后续维护责任移交'],
  '01-07-05-P02': ['注浆孔轴线孔距孔深和分序分段编号复核', '孔位放样标识钻机站位和既有结构避让检查', '孔位偏差漏放错放或编号冲突整改复测', '注浆孔放线成果旁站影像和钻孔作业条件签认', '孔位清单与注浆分序计划闭合移交'],
  '01-07-05-P03': ['钻孔设备型号钻杆直径孔深控制和孔口防护复核', '分序钻孔成孔冲洗清孔和孔壁稳定检查作业', '孔深孔径倾角和穿越防水层部位实测记录', '塌孔偏孔孔深不足或涌水涌砂异常处理复验', '钻孔成孔验收记录和注浆管安装放行签认'],
  '01-07-05-P05': ['注浆管规格长度开孔段位置和止浆塞型号复核', '注浆管下设固定封孔止浆和管口编号保护作业', '管路连接密封压力表阀门和回浆通道检查', '管口堵塞封孔不严错管漏管或止浆失效整改复测', '注浆管安装隐蔽验收和分段注浆条件签认'],
  '01-07-05-P06': ['分序分段注浆顺序压力级别和浆液配比复核', '浆液制备过滤搅拌注浆泵压力流量调试作业', '分段升压稳压注浆返浆串浆和邻孔联动记录', '跑浆冒浆压力异常吸浆量突变或串孔问题处置复验', '分序分段注浆记录和下一序注浆放行签认'],
  '01-07-05-P07': ['压力表流量计校验证书和注浆量计量口径复核', '逐孔压力流量注浆量终压稳压时间连续记录', '理论量实注量返浆状态和相邻孔影响比对', '计量异常压力突降超量吸浆或记录缺项整改复验', '注浆参数台账汇总和效果检测委托签认'],
  '01-07-05-P09': ['注浆效果检测范围检测方法和代表孔点位确认', '渗水量水压试验钻芯或雷达检测过程见证记录', '注浆饱满度防水效果和异常渗漏点结果比对', '效果不足补孔复注扩大检测和二次复验闭合', '注浆效果检测报告验收结论和防水界面移交签认'],
  '02-02-03-P06': ['沉降缝位置缝宽排水孔间距和构造详图复核', '缝内清理嵌缝材料安装和排水孔预留成型作业', '止水带压条密封胶反滤包裹和孔口保护检查', '缝宽偏差堵孔渗漏或密封开裂问题整改复验', '沉降缝排水孔隐蔽资料和砌体防水界面签认'],
  '04-01-04-P04': ['保温层厚度坡度排水覆盖范围和找坡控制点复核', '分区厚度实测坡向拉线排水路径和覆盖完整性检查', '排气孔水落口周边保温收口和防水基层保护复查', '厚度不足倒坡积水覆盖破损或基层污染整改复测', '保温排水覆盖实测成果和屋面找平界面签认'],
  '04-02-05-P01': ['保护层分区厚度坡向排水口位置和防水成品状态复核', '水泥砂浆或细石混凝土保护层分仓摊铺收面作业', '排水坡向水落口泛水根部和伸缩缝留设检查', '倒坡开裂空鼓压坏防水层或水落口堵塞整改复验', '防水保护层排水坡向验收和蓄排水层界面签认'],
  '04-02-05-P02': ['排水板规格凸点高度过滤层材料和铺设分区复核', '排水板铺设搭接裁剪收边和水落口连通作业', '过滤层铺设搭接保护厚度和泛水节点收口检查', '排水板破损搭接不足过滤层污染或排水断点整改复测', '排水板过滤层隐蔽验收和种植屋面后续界面签认'],
  '04-02-05-P05': ['排水口溢流口数量标高格栅和防堵构造复核', '水落口周边排水板收口过滤层压边和篦子安装检查', '溢流口外立面接口防水收头和排放路径核对', '标高偏差堵塞反坡渗漏或格栅松动整改复验', '排水口溢流口通水检查和屋面移交签认'],
  '04-02-05-P06': ['蓄排水试验分区水位高度观察时长和排放路径确认', '注水蓄水排水转换过程水位下降和渗漏巡查记录', '排水板连通水落口溢流口和下游雨水管响应复核', '渗漏滞水排水不畅或溢流口失效问题整改复测', '蓄排水试验报告和种植屋面验收签认'],
  '04-02-06-P06': ['屋面排水通风构造范围水落口排气道和泛水节点复核', '排气管通风口防水收头篦子和防雨帽安装检查', '排水坡向通风通道连通性和节点保护状态复测', '堵塞倒坡结露渗漏或构造遗漏问题整改复验', '排水通风构造检查资料和屋面验收界面签认'],
  '04-02-07-P03': ['溢流口排水口标高定位开孔尺寸和下游接口复核', '口部套管预埋防水附加层篦子和泛水收口安装', '排水口周边找坡压边密封和防堵设施检查', '标高偏差套管渗漏排水不畅或收口开裂整改复验', '溢流口排水口通水检查和架空隔热层移交签认'],
  '04-04-04-P05': ['幕墙排水路径冷桥防结露节点和构造详图复核', '排水孔导水槽披水板和断热垫块安装检查', '冷凝水排放路径通畅性和室内侧结露风险复测', '堵孔倒灌冷桥结露或密封断点问题整改复验', '排水防结露构造检查记录和幕墙节点移交签认'],
  '04-05-05-P05': ['金属屋面位移余量滑移支座和排水坡向复核', '板肋搭接滑动连接泛水板和排水槽安装检查', '温度位移预留量水流路径和天沟接口复测', '位移受限倒坡积水搭接渗漏或固定点冲突整改复验', '位移余量排水坡向检查资料和屋面验收签认'],
  '04-05-11-P03': ['泛水板排水槽规格展开尺寸坡向和接口详图复核', '泛水板折边搭接固定密封和排水槽支架安装作业', '阴阳角收口水落口接入伸缩缝和防腐保护检查', '搭接渗漏倒坡积水松动变形或密封开裂整改复验', '泛水板排水槽安装验收和金属屋面移交签认'],
  '05-02-01-P01': ['室内排水管线路由预留洞口楼板套管和甩口标高复核', '管井卫生间厨房支管路径和结构机电碰撞点核查', '预留洞偏位套管缺失甩口冲突和洞口封堵责任确认', '路由偏差洞口返修套管补装和甩口标高复测闭合', '排水路由预留洞口复核成果和立管安装放行签认'],
  '05-02-01-P02': ['排水立管支吊架位置间距套管规格和楼层洞口复核', '支吊架制作安装套管定位固定和防腐补刷作业', '穿楼板套管高度阻火圈位置和临时封堵检查', '支架松动套管偏位防腐漏刷或洞口污染整改复验', '支吊架套管隐蔽资料和立管安装界面签认'],
  '05-02-01-P03': ['排水立管管材管件承插方向和垂直控制线复核', '立管分层安装伸缩节检查口和阻火圈同步设置作业', '接口胶圈或粘接质量垂直度管卡固定和甩口保护检查', '接口渗漏垂直度超差管卡松动或伸缩节遗漏整改复测', '排水立管安装记录和支管接入条件签认'],
  '05-02-01-P04': ['排水支管坡度控制线甩口标高和器具定位尺寸复核', '支管下料预装连接固定和坡向找准作业', '地漏台盆坐便器甩口位置管卡间距和清扫口设置检查', '倒坡错口甩口偏位接口渗漏或堵塞风险整改复验', '排水支管坡度甩口复测资料和洁具安装界面签认'],
  '05-02-01-P05': ['检查口清扫口通气管位置高度和检修空间复核', '检查口清扫口安装通气管接入和屋面出户节点施工', '通气帽防雨防虫管道固定和穿屋面防水收口检查', '检查口不可达通气受阻节点渗漏或标识缺失整改复验', '检查口清扫口通气管安装验收和系统试验放行'],
  '05-02-01-P06': ['排水接口胶圈承插深度粘接剂批次和接口清洁度复核', '接口插入标记胶圈就位或粘接涂刷和旋转插接作业', '接口外观溢胶承插深度支架约束和闭水前保护检查', '胶圈翻转粘接虚接承插不足或接口污染整改复验', '排水接口质量检查记录和灌水试验条件签认'],
  '05-02-01-P07': ['灌水试验管段封堵高度水位标尺和观察时间确认', '分层分段灌水满水观察接口管根和楼板套管巡查记录', '水位下降接口渗漏封堵松动或管根渗水问题定位', '渗漏接口返修重新封堵和二次灌水复验', '灌水试验见证记录和接口渗漏销项签认'],
  '05-02-01-P08': ['通球试验管段编号球径比例和投球收球路径确认', '立管支管分段投球通球和下游收球记录采集', '检查口清扫口开启管内杂物和弯头阻塞位置排查', '卡阻管段清掏返修二次通球和坡度复测', '通球试验记录和排水通畅性复核签认'],
  '05-02-01-P09': ['排水管道标识范围管井走向系统编号和成品保护责任复核', '管道流向介质标签楼层编号和临时封堵保护作业', '穿楼板洞口封堵防污染防碰撞和检修口保护检查', '标签缺失封堵脱落污染损伤或成品碰坏整改复验', '排水管道标识成品保护移交和后续洁具安装签认'],
  '05-02-03-P01': ['排水管道防腐范围管材材质基层清洁度和环境条件复核', '管道除锈清理接口保护和防腐材料批次核对作业', '底漆面漆分遍涂刷厚度控制和隐蔽部位补涂检查', '漏涂流挂起皮厚度不足或接口污染问题整改复验', '排水管防腐实测记录和隐蔽验收移交签认'],
  '05-02-04-P05': ['排水支管坡度设计值甩口标高和倒坡排查范围复核', '激光或水准复测支管坡度检查口位置和流向标识', '倒坡积水接口错口支架沉降和管道变形问题定位', '支架调整管段返修接口重接和二次坡度复测', '排水支管坡度复核资料和倒坡销项签认'],
  '05-04-01-P04': ['卫生器具存水弯型号水封高度和排水接口尺寸复核', '存水弯排水短管预装密封圈和接口方向调整作业', '器具排水口地漏接口标高坡向和防臭封堵检查', '接口偏位水封不足密封件缺失或预装松动整改复验', '存水弯排水接口预装记录和器具安装放行签认'],
  '05-04-01-P07': ['器具启闭通水排水测试范围和房间编号清单复核', '龙头角阀冲洗阀启闭和排水响应逐件测试记录', '满流排水地漏响应存水弯水封和接口渗漏巡查', '启闭卡涩排水慢返臭渗漏或水封不足整改复测', '器具启闭排水通畅复核记录和房间销项签认'],
  '05-04-03-P01': ['卫生器具排水短管接口位置标高和器具型号复核', '短管中心线坡向楼板套管和墙地面完成面关系核对', '接口偏位标高冲突洞口封堵和安装空间问题清单确认', '短管返修套管调整和器具排水接口二次复测闭合', '排水短管接口标高复核成果和预装作业放行签认'],
  '05-04-03-P02': ['排水短管存水弯规格水封高度和密封件批次复核', '密封圈螺母垫片存水弯本体外观和成套性检查', '材料试装接口匹配性和防臭功能构造核对', '密封件缺失规格不符变形破损或水封不足更换复验', '排水短管存水弯进场验收台账和安装界面签认'],
  '05-04-03-P03': ['排水短管长度坡度控制线接口方向和器具定位复核', '短管切割预装承插或螺纹连接和支托固定作业', '接口坡度存水弯方向密封压紧和检修空间检查', '坡度不足接口松动标高偏差或短管污染整改复测', '排水短管安装检查记录和通水试验条件签认'],
  '05-04-03-P04': ['存水弯安装位置水封高度检修空间和接口规格复核', '存水弯组装密封垫压紧防臭芯或检查口安装作业', '水封高度排水流向接口密封和防虹吸构造检查', '水封不足接口渗漏安装倒置或检修受阻整改复验', '存水弯安装水封复核记录和器具调试移交签认'],
  '05-04-03-P05': ['器具排水接口密封方式垫片规格和连接顺序复核', '台盆浴缸坐便器排水接口就位紧固和密封连接作业', '接口满水观察排水响应和下部渗漏巡查记录', '接口渗漏松动错位密封失效或返臭风险整改复测', '器具排水接口密封连接验收和通水试验签认'],
  '05-04-03-P06': ['通水试验房间编号器具清单和排水路径复核', '逐件器具放水满流排水地漏响应和下游通畅性观察', '水封保持接口渗漏排水噪声和返臭风险检查', '排水慢倒灌渗漏卡阻或返臭问题整改复测', '通水试验排水通畅记录和房间移交签认'],
  '05-04-03-P07': ['接口渗漏检查范围器具编号和观察工况确认', '满水排放连续冲洗和接口管根渗漏巡查记录', '渗漏位置责任班组返修方法和材料更换确认', '返修后通水盛水二次复验和反复渗漏风险复查', '接口渗漏检查返修复验销项和成品保护签认'],
  '05-06-01-P06': ['给水管沟回填范围管顶保护层和回填材料含水率复核', '管道两侧对称回填人工夯实和分层虚铺厚度控制作业', '阀井管件周边边角补填管道位移和接口保护检查', '压实度不足管道上浮接口扰动或沉陷问题整改复验', '管沟回填压实检测报告和路面恢复界面签认'],
  '05-06-02-P06': ['消防给水管沟回填范围管顶保护和警示带位置复核', '消防管道两侧分层回填夯实阀门井周边补填作业', '消火栓支管阀井基础和接口保护状态巡查', '压实不足管道偏移阀井沉陷或警示带遗漏整改复测', '消防管沟回填压实资料和系统试压后移交签认'],
  '05-07-01-P01': ['室外排水管沟控制点井位高程和沟槽支护方案复核', '沟槽开挖边坡支护降排水和基底保护作业', '槽底标高宽度边坡稳定地下水和临边防护检查', '超挖塌方积水基底扰动或支护变形问题整改复验', '管沟测量放线高程复核和管基垫层放行签认'],
  '05-07-01-P02': ['排水管材管件井圈井盖和管基材料批次复核', '管基垫层厚度标高平整度和承载状态验收检查', '管材外观裂纹承插口胶圈和合格证明资料核对', '垫层扰动材料破损规格不符或资料缺项整改复验', '排水管道进场复验和管基垫层验收签认'],
  '05-07-01-P03': ['排水管道轴线坡度管底高程和井段编号复核', '下管稳管承插接口胶圈就位和管道坡度控制作业', '接口闭合管内清洁管座包角和中线高程复测检查', '倒坡错口接口渗漏管节破损或高程超差整改复验', '管道敷设坡度控制和承插接口施工记录签认'],
  '05-07-01-P04': ['检查井化粪池位置尺寸标高和井段交接关系复核', '井室砌筑或预制井安装流槽抹面和踏步爬梯施工', '井圈井盖预留接管防水节点和化粪池隔墙通气检查', '井室渗漏流槽倒坡接管错位或井盖标高偏差整改复验', '检查井化粪池施工验收和井段闭水条件签认'],
  '05-07-01-P05': ['井段闭水试验范围封堵位置水头高度和观察时长确认', '管井注水稳水水位观测和接口井壁渗漏巡查记录', '水位下降渗漏点井室裂缝和管口封堵问题定位', '渗漏返修重新封堵和二次闭水复验闭合', '井段闭水试验记录和渗漏整改销项签认'],
  '05-07-02-P01': ['雨水管沟井位控制点设计高程和汇水路径复核', '沟槽开挖支护降排水槽底高程和临边防护作业', '雨水口连接支管位置和既有管线交叉避让检查', '超挖积水支护变形或高程偏差问题整改复验', '管沟测量放线高程复核成果和垫层施工放行签认'],
  '05-07-02-P02': ['雨水管材雨水口井盖和胶圈批次规格复核', '管材外观承插口圆度和合格证明复验检查', '不合格管材隔离退场替换批次和资料补正闭合', '管材堆放支垫防滚防污染和吊装保护复查', '雨水排水管道进场复验台账和安装放行签认'],
  '05-07-02-P03': ['雨水管道轴线坡度管底高程和雨水口接入标高复核', '下管稳管承插连接管座浇筑和坡向控制作业', '接口密封管内清洁雨水口支管接入和井段高程检查', '倒坡错口接口渗漏支管接错或管座破损整改复验', '雨水管道敷设坡度记录和检查井施工界面签认'],
  '05-07-02-P04': ['雨水检查井化粪池位置尺寸井底高程和接管方向复核', '井室砌筑或预制井安装流槽抹面踏步和井圈施工', '井壁防渗井底流槽雨水口支管接入和井盖标高检查', '井室渗漏流槽倒坡接管错位或井盖松动整改复验', '雨水检查井化粪池施工验收和闭水试验放行签认'],
  '05-07-02-P05': ['雨水管井闭水试验范围封堵水头和观察时长确认', '井段注水稳水水位观测接口井壁和管口渗漏巡查', '水位下降渗漏点封堵松动或井壁裂缝问题定位', '渗漏返修重新封堵和二次闭水复验闭合', '雨水管井闭水试验记录和渗漏销项签认'],
  '05-07-02-P06': ['雨水管沟回填范围管顶保护层回填材料和含水率复核', '管道两侧对称回填分层摊铺夯实和井周补填作业', '雨水口井周压实管道位移警示带和路基接顺检查', '压实不足井周沉陷管道偏移或路基接顺不良整改复验', '雨水管沟回填压实检测和道路恢复界面签认'],
  '01-01-09-P01': ['旋喷桩位控制点桩号和孔位偏差复核', '地下管线障碍物高压喷射安全距离排查', '桩距排距孔深和施工分区灰线布设', '孔位漏放错放或控制点扰动整改复测', '旋喷桩位放样成果签认和钻机进场放行'],
  '01-01-09-P02': ['钻机平台承载垫板和导向架垂直度复核', '钻杆中心孔位对中和钻具同轴度校正', '高压泵空压机浆液管路和回浆沟检查', '钻机偏位倾斜管路漏压或平台沉陷整改复测', '钻机就位验收和试喷作业条件放行'],
  '01-01-09-P03': ['水泥批次外加剂和水灰比配合比核对', '制浆搅拌时间浆液比重和流动度检测', '储浆桶连续搅拌过滤筛和输浆管路检查', '浆液离析堵管比重超限或计量异常整改复测', '水泥浆配制记录闭合和旋喷施工供浆放行'],
  '01-01-09-P05': ['钻进终孔深度喷嘴状态和分段起喷标高复核', '水压气压浆压流量提升速度和旋转速度连续记录', '冒浆量桩径搭接宽度和邻孔扰动巡查', '压力突降堵喷断浆或提升异常停机处理复测', '旋喷成桩参数签认和桩顶补浆处理放行'],
  '01-01-09-P06': ['设计桩顶标高补浆范围和回浆质量复核', '桩顶低标高缩颈或冒浆不足部位补浆记录', '孔口封闭桩顶保护和表层扰动清理检查', '补浆后标高桩径和浆液饱满度复测闭合', '桩顶补浆处理验收和参数记录复核放行'],
  '01-01-09-P07': ['单桩压力流量耗浆量和提升速度台账核对', '施工日志自动记录曲线和人工旁站记录比对', '断浆堵喷复喷补喷和废浆处置资料复核', '异常桩编号处理意见和复测结果闭合', '旋喷施工参数汇总签认和检测委托放行'],
  '01-01-09-P08': ['取芯静载或复合地基检测点位代表性确认', '检测龄期试验方法反力装置和见证条件复核', '芯样完整性强度桩径或承载力试验过程记录', '不合格桩扩大检测补喷加固和复测闭合', '检测报告问题清单和地基验收放行'],
  '01-01-09-P09': ['旋喷桩位孔深桩径耗浆量和异常桩台账复核', '检测报告设计加固目标和处理边界比对', '补喷加固检测不合格或资料缺项销项确认', '复合地基上部垫层施工条件和移交边界确认', '高压旋喷注浆地基验收资料归档和下道工序签认'],
  '01-01-10-P01': ['水泥土搅拌桩控制点桩号和施工区边界复核', '桩距排距设计桩长和搭接关系放样', '地下管线障碍物排水和作业面承载检查', '桩位偏差漏放或编号冲突整改复测', '桩位放样成果签认和搅拌设备就位放行'],
  '01-01-10-P02': ['搅拌机平台承载垫板和导向架垂直度复核', '钻杆搅拌头喷浆口通畅和深度计校验', '灰浆泵流量计压力表和输浆管路检查', '设备偏位倾斜堵浆漏浆或平台沉陷整改复测', '搅拌设备就位验收和制浆作业放行'],
  '01-01-10-P03': ['水泥批次外加剂和水灰比配合比核对', '制浆搅拌时间浆液比重和喷浆量计量检测', '储浆桶连续搅拌过滤筛和供浆管路检查', '浆液离析堵管比重超限或计量异常整改复测', '水泥浆配制记录闭合和搅拌施工供浆放行'],
  '01-01-10-P06': ['提升复搅起止深度搭接长度和遍数复核', '提升速度复搅电流喷浆余量和桩端停留记录', '相邻桩咬合冷缝串浆和地面隆起巡查', '复搅深度不足断浆偏桩或搭接不足整改复测', '提升复搅记录签认和桩顶处理放行'],
  '01-01-10-P07': ['桩顶设计标高截桩范围和桩间土扰动复核', '桩顶松散水泥土清理补浆整平过程记录', '桩头缺陷低标高或桩间土隆起处理复测', '场地排水坡向桩位保护和垫层施工条件检查', '桩顶处理验收和强度完整性检测放行'],
  '01-01-10-P08': ['强度取芯低应变或轻便触探检测点位确认', '检测龄期试验方法见证取样和试件编号复核', '芯样强度桩身连续性和复合地基承载指标记录', '不合格桩扩大检测补强复搅或设计复核闭合', '检测报告问题清单和地基验收放行'],
  '01-01-10-P09': ['水泥土搅拌桩桩位桩长喷浆量和复搅记录汇总复核', '强度完整性检测报告和设计加固目标比对', '断浆偏桩检测不合格和资料缺项问题销项', '复合地基处理边界和上部结构施工条件确认', '水泥土搅拌桩地基验收资料归档和下道工序签认'],
  '01-01-11-P01': ['挤密桩施工边界控制点和桩位编号复核', '桩距排距桩长和成孔顺序灰线布设', '地下障碍物架空线和沉管作业安全距离排查', '孔位偏差漏放或编号冲突整改复测', '桩位放样成果签认和成孔设备就位放行'],
  '01-01-11-P02': ['沉管或冲击成孔设备型号锤重和导向架复核', '设备平台承载垫板和桩机垂直度校正', '沉管靴冲击锤卷扬限位和计数装置检查', '设备偏位沉陷垂直度超限或锤击异常整改复测', '成孔设备就位验收和土料灰土复核放行'],
  '01-01-11-P03': ['土料石灰批次粒径含灰量和含水率检测', '灰土拌和均匀性虚铺厚度和闷料时间确认', '料场防雨覆盖分区堆放和计量方式检查', '含水率超限夹杂物或灰剂量偏差调整复验', '土料灰土复核记录闭合和试桩参数确认放行'],
  '01-01-11-P05': ['沉管或冲击成孔桩号孔位和设计孔深复核', '沉管贯入锤击数垂直度和拔管阻力记录', '孔壁坍塌缩颈孔底扰动和邻桩影响巡查', '成孔偏斜孔深不足或塌孔回填重打复测', '成孔记录签认和分层回填夯击放行'],
  '01-01-11-P06': ['分层填料厚度含水率和夯击遍数复核', '分层投料夯实锤击能量和沉落量过程记录', '桩身密实度串孔冒土和地面隆起巡查', '填料不足夹层松散或夯击能量偏差整改复测', '分层回填夯击记录签认和桩顶封填放行'],
  '01-01-11-P07': ['桩顶标高封填范围和桩间土松动情况复核', '孔口回填封闭表层夯实和场地整平记录', '桩顶沉陷冒土积水或松散区处理复测', '施工区排水坡向桩位保护和检测通道检查', '桩顶封填整平验收和桩间土检测放行'],
  '01-01-11-P08': ['桩间土挤密检测点位抽检频次和龄期确认', '取样干密度湿陷性或动力触探检测过程见证', '挤密系数承载力和处理深度结果比对', '检测不足区补夯补桩或加密检测复测闭合', '桩间土挤密检测报告和复合地基验收放行'],
  '01-01-11-P09': ['挤密桩桩位孔深填料量夯击遍数台账复核', '桩间土检测报告和设计挤密目标比对', '补夯补桩检测不合格或资料缺项销项确认', '复合地基处理边界和上部垫层施工条件确认', '土和灰土挤密桩复合地基验收资料归档和下道工序签认'],
  '01-01-12-P01': ['CFG桩控制点桩号和施工分区边界复核', '桩距排距设计桩长和保护桩位布设', '地下管线障碍物弃土路线和作业面承载检查', '桩位偏差漏放或编号冲突整改复测', '桩位放样成果签认和长螺旋钻机就位放行'],
  '01-01-12-P02': ['长螺旋钻机平台承载垫板和导向架复核', '钻杆垂直度钻头直径和深度计校验', '混合料泵输送管路接头和压力表检查', '钻机偏位沉陷钻杆摆动或管路堵塞风险整改复测', '长螺旋钻机就位验收和钻进成孔放行'],
  '01-01-12-P03': ['钻进桩号孔位和设计孔深复核', '钻进速度电流扭矩和终孔深度连续记录', '塌孔缩径弃土量和邻桩扰动巡查', '成孔偏斜孔深不足电流异常或钻头堵塞处理复测', '成孔电流参数记录签认和压灌作业放行'],
  '01-01-12-P05': ['泵送压力混合料坍落度和提钻速度匹配复核', '连续压灌充盈系数提钻高度和停泵时间记录', '断桩缩颈夹泥冒浆和管路堵塞风险巡查', '压灌中断提钻过快或混合料离析整改复测', '压灌提钻记录签认和桩顶超灌清理放行'],
  '01-01-12-P06': ['桩顶超灌高度弃土范围和成品保护复核', '桩顶混合料初凝后弃土清理和标高控制记录', '桩顶低标高破损夹泥或扰动部位处理复测', '弃土外运道路清洁和桩位保护状态检查', '桩顶超灌清理验收和桩间土处理放行'],
  '01-01-12-P07': ['桩间土开挖深度桩身保护和截桩标高复核', '机械清土人工修整和桩头切割过程记录', '桩头裂损露筋夹泥或桩间土扰动处理复测', '桩顶平整度桩位偏差和褥垫层施工条件检查', '桩头处理验收和桩身检测放行'],
  '01-01-12-P08': ['桩身完整性低应变静载或复合地基检测点位确认', '检测龄期反力装置传感器和见证条件复核', '波形承载力沉降和桩身缺陷判读记录', '异常桩扩大检测补桩加固或设计复核闭合', '检测报告问题清单和复合地基验收放行'],
  '01-01-12-P09': ['CFG桩桩位桩长压灌量和电流参数台账复核', '桩身完整性承载力检测报告和设计目标比对', '断桩缩颈检测不合格和资料缺项问题销项', '复合地基处理边界和褥垫层施工条件确认', '水泥粉煤灰碎石桩复合地基验收资料归档和下道工序签认'],
  '01-01-13-P01': ['夯实水泥土桩控制点桩号和施工区边界复核', '桩距排距桩长和成孔顺序放样', '地下障碍物作业面承载和排水条件检查', '桩位偏差漏放或编号冲突整改复测', '桩位放样成果签认和夯扩设备进场放行'],
  '01-01-13-P02': ['夯扩成孔设备锤重套管和导向架复核', '设备平台承载垫板和桩机垂直度校正', '夯锤卷扬限位孔深计和安全防护检查', '设备偏位沉陷锤击异常或垂直度超限整改复测', '夯扩设备就位验收和水泥土配合比复核放行'],
  '01-01-13-P03': ['水泥土原材批次含水率灰剂量和拌合比例核对', '拌和均匀性湿密度和现场试拌记录检查', '料场覆盖防污染分区堆放和计量方式复核', '含水率超限灰剂量偏差或夹杂物整改复验', '水泥土配合比复核记录闭合和成孔作业放行'],
  '01-01-13-P05': ['孔内分层填料厚度含水率和夯击遍数复核', '夯锤落距锤击能量沉落量和成桩直径记录', '分层搭接夹层松散孔壁扰动和地面隆起巡查', '填料不足夯击能量偏差或缩颈部位返工复测', '分层夯填记录签认和试块留置放行'],
  '01-01-13-P06': ['桩身强度试块取样频次部位和编号复核', '水泥土试块制作成型养护和送检记录', '同批次成桩时间养护条件和试块代表性检查', '试块缺失强度异常或编号不一致整改复验', '试块留置台账签认和桩顶处理养护放行'],
  '01-01-13-P08': ['成桩强度检测点位抽检比例和龄期确认', '取芯无侧限抗压或承载力检测过程见证', '桩身强度均匀性桩径和处理深度结果比对', '强度不足扩大检测补桩加固或设计复核闭合', '成桩强度检测报告和复合地基验收放行'],
  '01-01-13-P09': ['夯实水泥土桩桩位孔深填料量和夯击记录汇总复核', '试块强度检测报告和设计加固目标比对', '检测不合格补桩加固和资料缺项问题销项', '复合地基处理边界和上部垫层施工条件确认', '夯实水泥土桩复合地基验收资料归档和下道工序签认'],
  '01-02-09-P01': ['干作业成孔桩控制点桩号和轴线偏差复核', '桩位保护桩护筒外边线和施工分区放样', '地下障碍物架空线钻机行走路线和作业面承载检查', '桩位漏放错放或控制点扰动整改复测', '桩位放样成果签认和钻机就位放行'],
  '01-02-09-P02': ['钻机平台承载垫板和钻架垂直度复核', '钻头直径钻杆同轴度和深度计校验', '干作业成孔泥土外运路线和孔口防护检查', '钻机偏位倾斜平台沉陷或钻具磨损整改复测', '钻机就位验收和干作业成孔放行'],
  '01-02-09-P03': ['成孔桩号孔位设计孔深和持力层标高复核', '钻进速度钻压电流和出土土层变化记录', '孔壁稳定缩径塌孔地下水和邻桩扰动巡查', '孔深不足偏孔塌孔或持力层异常处理复测', '干作业成孔记录签认和孔径垂直度检测放行'],
  '01-02-09-P04': ['测绳孔径仪垂直度检测工具和校验状态复核', '孔深孔径孔位偏差和垂直度逐桩实测记录', '持力层岩土样和设计勘察资料比对', '孔径不足沉渣超限偏斜或持力层不符整改复测', '成孔检测验收签认和孔底清理放行'],
  '01-02-09-P05': ['孔底清理方法沉渣厚度标准和清孔工具复核', '孔底虚土松散土块和孔壁掉块清理记录', '清孔后孔深沉渣厚度和孔壁稳定复测', '二次坍落沉渣回落或积水异常处理闭合', '孔底清理验收签认和钢筋笼安装放行'],
  '01-02-09-P06': ['钢筋笼规格主筋箍筋间距和保护层垫块复核', '钢筋笼分节焊接连接声测管和吊点检查', '下笼垂直度笼顶标高和定位固定过程记录', '笼体变形孔壁碰撞卡笼或保护层不足整改复测', '钢筋笼隐蔽验收和混凝土浇筑放行'],
  '01-02-09-P07': ['混凝土强度等级坍落度入孔温度和供应连续性复核', '分层浇筑振捣高度导管或串筒下料过程记录', '孔口离析夹泥断料和桩顶超灌高度巡查', '蜂窝夹泥断桩低标高或混凝土供应中断处理复测', '混凝土浇筑记录试块留置和桩顶养护放行'],
  '01-02-09-P09': ['桩身完整性检测点位比例龄期和检测方法确认', '低应变声测或钻芯检测仪器测点布置复核', '波形异常声测缺陷位置和桩身质量判读记录', '异常桩扩大检测补强处理和复测闭合', '完整性检测报告问题清单和桩基验收放行'],
  '01-02-09-P10': ['桩位偏差桩顶标高成孔浇筑和检测资料汇总复核', '承载力完整性试块强度和隐蔽验收记录比对', '缺陷桩处理设计复核意见和资料缺项销项确认', '承台施工移交边界和桩头处理完成状态确认', '干作业成孔桩基础验收资料归档和下道工序签认'],
  '01-02-11-P01': ['沉管灌注桩控制点桩号和轴线偏差复核', '桩位保护桩护筒外边线和沉管顺序放样', '地下障碍物架空线沉管作业半径和场地承载检查', '桩位漏放错放或控制点扰动整改复测', '桩位放样成果签认和沉管设备就位放行'],
  '01-02-11-P02': ['沉管设备锤重振动锤和导向架型号复核', '设备平台垫板支腿和桩架垂直度校正', '桩尖活瓣桩靴钢管接头和限位装置检查', '设备偏位沉陷桩管变形或导向架倾斜整改复测', '沉管设备就位验收和试沉管放行'],
  '01-02-11-P03': ['试沉管桩位地层代表性和贯入控制标准确认', '锤击数贯入度振动电流和终止条件记录', '桩管回弹拒沉冒土和邻桩扰动巡查', '贯入异常持力层不符或桩靴失效处理复测', '试沉管参数签认和批量沉管成孔放行'],
  '01-02-11-P04': ['沉管桩号孔位桩管垂直度和设计深度复核', '沉管贯入速度锤击能量振动频率和贯入度记录', '桩管偏斜挤土隆起断桩风险和邻桩位移巡查', '沉管深度不足偏斜卡管或桩靴脱落整改复测', '沉管成孔记录签认和钢筋笼安放放行'],
  '01-02-11-P05': ['钢筋笼规格长度主筋箍筋间距和保护层复核', '钢筋笼吊点加劲箍声测管和定位筋检查', '下笼垂直度笼顶标高和孔口固定过程记录', '钢筋笼变形卡笼上浮或保护层不足整改复测', '钢筋笼隐蔽验收和混凝土灌注放行'],
  '01-02-11-P07': ['拔管速度充盈系数和混凝土供应节奏复核', '拔管高度振动频率混凝土面上升和桩顶超灌记录', '缩颈断桩夹泥串孔和地面隆起巡查', '充盈不足拔管过快或混凝土中断处理复测', '拔管充盈控制记录签认和桩顶标高复核放行'],
  '01-02-11-P08': ['桩顶设计标高超灌高度和桩号清单复核', '桩顶混凝土初凝后保护覆盖和标高测量记录', '低桩断桩夹泥桩头破损或桩位偏差处理复测', '桩顶清理保护和承台施工界面检查', '桩顶标高复核记录闭合和桩身检测放行'],
  '01-02-11-P09': ['桩身质量检测点位比例龄期和检测方法确认', '低应变声测或钻芯检测仪器测点布置复核', '波形异常缩颈断桩夹泥和桩身完整性判读记录', '异常桩扩大检测补强处理和复测闭合', '桩身质量检测报告问题清单和桩基验收放行'],
  '01-02-11-P10': ['桩位偏差桩顶标高沉管灌注和拔管记录汇总复核', '完整性承载力试块强度和隐蔽验收资料比对', '缺陷桩处理设计复核意见和资料缺项销项确认', '承台施工移交边界和桩头处理完成状态确认', '沉管灌注桩基础验收资料归档和下道工序签认'],
  '01-02-13-P01': ['静压桩桩位控制点桩号和压桩顺序复核', '反力区承载地坪地下障碍物和邻近构筑物排查', '压桩机行走路线桩位保护和监测点布设检查', '桩位偏差反力条件不足或作业面沉陷整改复测', '压桩孔位反力条件签认和反力架安装放行'],
  '01-02-13-P02': ['锚杆反力架规格布置间距和受力路径复核', '锚杆成孔注浆张拉或反力架拼装固定检查', '反力梁连接螺栓焊缝千斤顶支座和安全限位记录', '反力不足锚杆滑移支架变形或连接松动整改复测', '反力体系验收签认和预制桩进场复核放行'],
  '01-02-13-P03': ['预制桩规格强度龄期合格证和桩号清单核对', '桩身裂缝蜂窝端板平整度和桩尖完整性检查', '堆放支垫吊点标识和桩节配桩顺序复核', '不合格桩隔离退场修补复验和替换批次确认', '预制桩进场验收台账签认和静压设备就位放行'],
  '01-02-13-P04': ['静压设备吨位配重千斤顶和压力表校验复核', '压桩机平台调平夹桩器中心和导向垂直度检查', '液压系统油压行程限位和安全防护状态记录', '设备偏位沉陷油压异常或夹桩器偏心整改复测', '静压设备就位验收和压桩施工放行'],
  '01-02-13-P05': ['压桩桩号桩节组合和压入顺序复核', '压入力压入速度垂直度和桩顶标高连续记录', '桩身回弹偏斜断桩挤土隆起和邻桩影响巡查', '压入力异常拒压偏位或桩身破损处理复测', '压桩施工记录签认和接桩连接放行'],
  '01-02-13-P06': ['接桩端板清理焊缝坡口和桩身垂直度复核', '焊接电流层道焊缝外观或机械连接紧固记录', '接桩后垂直度校正压入深度和停歇时间检查', '焊缝缺陷接头错位垂直度超限或夹具松动整改复测', '接桩连接验收签认和终压控制放行'],
  '01-02-13-P07': ['终压控制标准稳压时间和终压标高复核', '终压力读数压入量回弹量和稳压曲线记录', '终压不足超压桩顶破损和邻桩位移巡查', '复压补压截桩或设计复核处理闭合', '终压稳压记录签认和封桩桩头处理放行'],
  '01-02-13-P08': ['封桩范围桩顶标高截桩长度和桩头保护复核', '桩头切割端板处理防腐补刷和孔口封闭记录', '桩顶破损低桩高桩或防腐缺陷整改复测', '封桩后桩位保护承台钢筋避让和移交面检查', '封桩桩头处理验收和沉降观测点复核放行'],
  '01-02-13-P09': ['沉降观测点位置编号保护措施和初始值复核', '观测仪器校验水准路线和观测频次确认', '压桩后邻近建筑地坪和桩顶沉降数据记录', '沉降异常观测点损坏或数据跳变复测闭合', '沉降观测记录签认和承载力检测验收放行'],
  '01-02-13-P10': ['承载力检测桩号龄期反力装置和试验方法确认', '静载低应变或高应变检测过程见证记录', '压桩记录终压值检测结果和设计承载目标比对', '异常桩扩大检测补强处理和设计复核闭合', '静压桩基础验收资料归档和承台施工签认'],
  '01-02-10-P01': ['长螺旋压灌桩控制点桩号和施工分区边界复核', '桩距排距设计桩长和保护桩位布设', '地下管线障碍物弃土路线和作业面承载检查', '桩位偏差漏放或编号冲突整改复测', '桩位放样成果签认和长螺旋钻机就位放行'],
  '01-02-10-P08': ['桩顶超灌高度弃土范围和成品保护复核', '桩顶混凝土初凝后清土切平和标高控制记录', '桩顶低标高破损夹泥或桩身扰动部位处理复测', '弃土外运道路清洁桩位保护和承台界面检查', '桩顶混凝土处理验收和桩身完整性检测放行'],
  '01-02-12-P08': ['钢桩桩顶设计标高切割线和切割方式复核', '桩顶切割打磨端板清理和焊渣毛刺处理记录', '防腐破损部位除锈补刷厚度和干膜检查', '切割过深桩顶变形或防腐缺陷整改复测', '桩顶切割防腐验收和桩身偏位复核放行'],
  '01-02-12-P09': ['钢桩桩位坐标轴线偏差和桩顶标高复核', '桩身垂直度端部偏移和承台锚固条件检查', '偏位超限桩与承台钢筋避让或设计复核记录', '偏位整改补强扩大承台或复测资料闭合', '桩身偏位复核验收和检测验收资料归集放行'],
  '01-02-12-P11': ['钢桩进场沉桩接桩和终桩记录汇总复核', '承载力完整性检测报告和设计承载目标比对', '偏位焊缝防腐检测不合格和资料缺项问题销项', '承台施工移交边界和桩顶处理完成状态确认', '钢桩基础验收资料归档和下道工序签认'],
  '01-02-14-P01': ['岩石面浮渣松动块体和积水清理状态复核', '基础轴线锚杆孔位控制点和岩面标高放样', '裂隙软弱夹层坡面稳定和安全防护条件检查', '岩面欠清理孔位偏差或软弱夹层处理复测', '岩石面清理定位验收和锚孔钻进放行'],
  '01-02-14-P02': ['锚孔钻机钻头直径钻杆垂直度和孔位对中复核', '钻进孔深孔径倾角和岩粉岩性变化过程记录', '塌孔偏孔卡钻涌水或孔壁破碎异常处置复测', '终孔深度孔径和设计锚固长度实测确认', '锚孔钻进检测记录签认和洗孔清孔放行'],
  '01-02-14-P03': ['洗孔方式水压风压和孔底清渣工具复核', '洗孔返浆返水清洁度沉渣厚度和孔壁稳定检查', '二次清孔孔深孔径和孔底积水复测记录', '沉渣超限堵孔塌孔或孔壁掉块处理闭合', '洗孔清孔验收签认和锚杆安放放行'],
  '01-02-14-P04': ['锚杆钢筋规格长度材质复试和防腐状态核验', '定位架隔离架焊接间距和保护层厚度检查', '锚杆下放居中外露长度和孔口固定过程记录', '杆体弯曲孔壁碰撞保护层不足或外露偏差整改复测', '锚杆杆体隐蔽验收和注浆材料复核放行'],
  '01-02-14-P05': ['水泥外加剂砂浆强度等级和配合比通知单核对', '制浆计量水灰比搅拌时间和浆液流动度检测', '浆液储存过滤连续搅拌和注浆管路通畅检查', '浆液离析堵管流动度超限或计量异常整改复测', '注浆材料配合比记录签认和注浆施工放行'],
  '01-02-14-P08': ['承台轴线标高模板钢筋和锚杆外露长度复核', '锚杆锚固端保护钢筋避让和预埋件位置检查', '承台混凝土浇筑振捣养护和试块留置记录', '蜂窝露筋锚杆扰动或标高偏差整改复测', '基础承台验收和岩石锚杆基础验收资料移交'],
  '01-02-14-P09': ['岩石锚杆孔位孔深注浆量和杆体隐蔽资料汇总复核', '抗拔试验张拉锁定记录和设计承载目标比对', '异常锚杆补强复测检测不合格和资料缺项销项', '基础承台完成状态和上部结构施工边界确认', '岩石锚杆基础验收资料归档和下道工序签认'],
  '01-03-01-P01': ['排桩控制轴线基坑边线和桩位编号复核', '支护桩间距桩径桩长和施工分区灰线布设', '既有管线邻近建构筑物和监测点保护条件检查', '桩位偏差控制点扰动或保护桩缺失整改复测', '排桩轴线桩位验收和护筒导墙施工放行'],
  '01-03-01-P02': ['护筒或导墙轴线净距标高和垂直度复核', '导墙钢筋模板预埋件和护筒埋设稳定性检查', '导墙混凝土浇筑养护或护筒周边回填夯实记录', '导墙开裂偏位护筒松动或泥浆外溢整改复测', '护筒导墙验收和隔桩跳打时序确认放行'],
  '01-03-01-P03': ['相邻桩终凝龄期施工顺序和跳打桩号核对', '隔桩跳打施工面机械站位和邻桩保护检查', '成孔前邻桩混凝土强度资料和监测数据复核', '跳打顺序冲突邻桩扰动或终凝条件不足整改复测', '隔桩跳打时序签认和成孔施工放行'],
  '01-03-01-P04': ['成孔桩号孔位桩径设计孔深和护壁方式复核', '钻进速度泥浆指标孔内水位和垂直度过程记录', '塌孔缩径偏孔串孔或邻桩扰动风险巡查', '成孔异常持力层不符或护壁失效处理复测', '成孔施工记录签认和成孔质量检测放行'],
  '01-03-01-P05': ['孔深孔径垂直度沉渣厚度和孔底标高实测复核', '泥浆比重黏度含砂率和清孔质量检测记录', '持力层岩土样和勘察设计资料比对确认', '沉渣超限孔径不足偏斜或持力层异常整改复测', '成孔质量检测验收和钢筋笼制作安装放行'],
  '01-03-01-P06': ['钢筋笼主筋箍筋加劲箍和保护层垫块复核', '钢筋笼分节焊接机械连接声测管和吊点检查', '吊装下笼垂直度笼顶标高和孔口定位固定记录', '笼体变形卡笼声测管堵塞或保护层不足整改复测', '钢筋笼隐蔽验收和混凝土灌注放行'],
  '01-03-01-P07': ['混凝土强度等级坍落度导管埋深和供应连续性复核', '首灌方量导管提升灌注高度和桩顶超灌记录', '断料堵管夹泥缩颈或桩顶标高异常巡查', '灌注中断断桩风险或试块缺失问题整改复测', '混凝土灌注记录试块留置和冠梁施工界面移交'],
  '01-03-01-P08': ['冠梁轴线标高截面尺寸和桩顶凿毛状态复核', '冠梁钢筋锚固搭接模板加固和预埋件位置检查', '桩顶主筋锚入冠梁长度和保护层控制记录', '钢筋偏位模板胀模预埋漏设或桩顶清理不足整改复测', '冠梁钢筋模板验收和混凝土浇筑放行'],
  '01-03-01-P09': ['冠梁混凝土强度等级坍落度和浇筑分段复核', '混凝土浇筑振捣施工缝留置和试块留置记录', '冠梁顶标高线形平整度和养护覆盖检查', '蜂窝露筋冷缝胀模或标高偏差整改复测', '冠梁混凝土验收和桩间土挂网喷护放行'],
  '01-03-01-P10': ['桩间土开挖坡面修整和喷护分区边界复核', '钢筋网片锚钉泄水孔和喷射混凝土厚度控制记录', '分层喷护回弹料清理和排水沟接口检查', '空鼓开裂掉块渗水或厚度不足整改复测', '桩间土挂网喷护验收和支护桩检测监测移交'],
  '01-03-01-P11': ['支护桩完整性检测点位冠梁成型和监测点状态复核', '桩身检测冠梁质量和基坑监测初始值资料核对', '检测异常桩位移报警或喷护缺陷处理复测', '支护体系移交边界开挖条件和监测频次确认', '支护桩检测监测移交资料归档和土方开挖签认'],
  '01-03-02-P01': ['板桩墙轴线基坑边线和桩位编号复核', '板桩桩距转角桩位置和施工分区灰线布设', '邻近管线构筑物监测点和沉桩影响范围检查', '桩位偏差转角错位或控制点扰动整改复测', '板桩轴线桩位验收和进场验收放行'],
  '01-03-02-P02': ['板桩规格型号长度材质和锁口形式核验', '板桩外观变形锁口损伤防腐层和端部缺陷检查', '板桩堆放支垫编号配桩顺序和吊点标识复核', '变形板桩锁口损伤或资料缺项隔离整改复验', '板桩进场验收台账签认和沉桩设备就位放行'],
  '01-03-02-P03': ['沉桩设备型号振动锤锤重和夹具适配复核', '导向架围檩临时支撑和机械站位承载条件检查', '液压电气系统仪表校验和安全限位状态记录', '设备偏位夹具松动导向架变形或作业面沉陷整改复测', '沉桩设备就位验收和板桩沉桩施工放行'],
  '01-03-02-P04': ['板桩桩号插打顺序锁口涂油和导向状态复核', '沉桩垂直度贯入深度振动参数和桩顶标高记录', '锁口脱开桩身扭转拒沉或邻桩带动风险巡查', '沉桩偏位锁口失效或桩身损伤处理复测', '板桩沉桩记录签认和垂直度平面位置复核放行'],
  '01-03-02-P05': ['板桩墙轴线偏差垂直度桩顶标高和墙面平整度实测', '转角桩闭合锁口咬合和桩身扭转状态检查', '超差板桩纠偏补打切割或加固处理记录', '复测偏差锁口状态和围檩连接条件闭合', '垂直度平面位置复核验收和锁口止水检查放行'],
  '01-03-02-P06': ['板桩锁口连续性渗漏风险点和止水材料状态复核', '锁口注浆堵漏焊缝封堵或止水胶施工记录', '试水观察渗漏点定位和坑外水位变化检查', '锁口渗漏开缝或止水材料脱落整改复测', '锁口止水效果验收和桩顶围檩锚拉连接放行'],
  '01-03-02-P07': ['桩顶围檩标高轴线连接板和锚拉节点位置复核', '围檩吊装焊接螺栓连接和锚杆拉结安装记录', '围檩与板桩贴合间隙加劲板和防腐补口检查', '节点松动焊缝缺陷锚拉偏位或围檩变形整改复测', '桩顶围檩锚拉连接验收和变形监测放行'],
  '01-03-02-P08': ['板桩墙监测点编号位置保护和初始值复核', '桩身水平位移沉降水位和支撑轴力监测记录', '开挖阶段变形速率报警阈值和巡查频次核对', '监测异常测点损坏或数据跳变复测闭合', '桩身变形监测资料签认和板桩墙验收移交'],
  '01-03-02-P09': ['板桩桩位垂直度锁口止水和围檩锚拉资料汇总复核', '监测初始值沉桩记录和材料验收资料一致性核对', '渗漏变形超限连接缺陷和资料缺项问题销项', '基坑开挖移交边界监测频次和应急处置条件确认', '板桩墙验收资料归档和土方开挖签认'],
  '01-03-03-P01': ['咬合桩控制轴线导墙边线和桩位编号复核', '素桩荤桩桩序桩径咬合宽度和施工分区布设', '邻近管线构筑物监测点和套管钻机行走路线检查', '桩位偏差咬合宽度不足或控制点扰动整改复测', '咬合桩轴线桩位验收和护筒导墙施工放行'],
  '01-03-03-P02': ['导墙轴线净距顶标高和桩孔定位槽口复核', '导墙钢筋模板预埋定位件和孔口限位装置检查', '导墙混凝土浇筑养护和槽口清理保护记录', '导墙偏位开裂槽口堵塞或限位松动整改复测', '护筒导墙验收和套管钻机就位放行'],
  '01-03-03-P03': ['套管钻机型号套管直径刀具和垂直度校验复核', '钻机平台承载垫板导向架和套管中心对位检查', '套管钻进深度垂直度扭矩和取土过程记录', '套管偏斜卡钻孔壁扰动或作业面沉陷整改复测', '套管钻机成孔记录签认和交替施工时序放行'],
  '01-03-03-P04': ['素桩荤桩施工顺序初凝窗口和桩号清单核对', '相邻素桩切割咬合时间混凝土强度和套管跟进记录', '荤桩钢筋笼插入窗口和邻桩扰动风险巡查', '时序冲突初凝超时咬合不足或邻桩扰动整改复测', '交替施工时序签认和成孔质量检测放行'],
  '01-03-03-P05': ['孔深孔径垂直度咬合宽度和孔底沉渣实测复核', '套管内取土清孔质量持力层和泥水状态检查', '素桩切割面完整性荤桩成孔偏差和孔壁稳定记录', '沉渣超限咬合不足偏孔或持力层异常整改复测', '成孔质量检测验收和钢筋笼制作安装放行'],
  '01-03-03-P06': ['荤桩钢筋笼规格长度声测管和保护层垫块复核', '钢筋笼分节连接吊点加劲箍和笼顶标高检查', '下笼垂直度与套管间隙孔口定位固定过程记录', '笼体变形卡笼声测管堵塞或保护层不足整改复测', '钢筋笼隐蔽验收和混凝土灌注放行'],
  '01-03-03-P07': ['混凝土强度等级坍落度导管埋深和供应连续性复核', '首灌方量套管拔出速度混凝土面高度和超灌记录', '断料堵管夹泥缩颈或咬合面扰动风险巡查', '灌注中断桩身缺陷或试块缺失问题整改复测', '混凝土灌注记录签认和桩间咬合效果检查放行'],
  '01-03-03-P08': ['咬合面连续性桩间渗漏风险和桩顶咬合宽度复核', '开挖暴露面咬合缺陷冷缝夹泥和渗水点检查', '缺陷部位注浆堵漏剔凿修补和复测记录', '咬合不足渗漏超限或桩间夹泥整改闭合', '桩间咬合效果验收和冠梁桩体验收放行'],
  '01-03-03-P09': ['冠梁轴线标高桩顶凿毛和桩体检测资料复核', '冠梁钢筋模板混凝土浇筑和试块留置记录核对', '桩身完整性咬合效果监测初始值和缺陷处理资料汇总', '冠梁缺陷桩体异常渗漏问题和资料缺项销项', '冠梁桩体完整性验收资料归档和土方开挖签认'],
  '01-03-04-P01': ['三轴搅拌桩机型号钻杆间距和搅拌头直径复核', '桩机平台承载垫板导向架和垂直度校正记录', '桩位中心钻杆对位冷缝搭接宽度和施工顺序检查', '桩机偏位下沉钻杆摆动或垂直度超限整改复测', '三轴搅拌桩机就位验收和水泥浆配制作业放行'],
  '01-03-04-P02': ['水泥品种强度等级外加剂和设计掺量复核', '制浆水灰比浆液比重流动度和搅拌时间检测', '后台计量系统喷浆量和输浆管路压力校验记录', '浆液离析堵管比重超限或计量偏差整改复测', '水泥浆配制掺量记录签认和下沉喷浆放行'],
  '01-03-04-P03': ['下沉喷浆桩号桩位设计深度和喷浆起点复核', '下沉速度喷浆压力流量和搅拌电流连续记录', '水泥浆掺量垂直度搭接宽度和土体扰动巡查', '喷浆中断下沉受阻垂直度偏差或搭接不足整改复测', '下沉喷浆搅拌记录签认和提升复搅放行'],
  '01-03-04-P04': ['提升复搅起止深度提升速度和复搅遍数复核', '提升喷浆量搅拌电流返浆状态和桩顶标高记录', '复搅搭接宽度水泥土均匀性和冷缝风险巡查', '提升过快断浆喷浆量不足或桩顶缺浆整改复测', '提升复搅参数记录签认和H型钢插入放行'],
  '01-03-04-P05': ['H型钢规格长度垂直度控制线和插入时机复核', '型钢吊装插入速度标高垂直度和中心偏差记录', '型钢防腐层保护定位卡具和导向架状态检查', '插入受阻偏位标高超差或型钢变形整改复测', 'H型钢插入验收和型钢定位固定放行'],
  '01-03-04-P06': ['型钢顶部标高平面位置临时定位架和限位件复核', '型钢固定焊接夹具拉结和防倾覆措施检查记录', '型钢垂直度复测相邻型钢间距和冠梁连接条件检查', '定位松动型钢回弹偏位或固定节点缺陷整改复测', '型钢定位固定验收和桩体连续性检查放行'],
  '01-03-04-P07': ['桩体搭接宽度冷缝位置和施工间隔时间复核', '开挖暴露面连续性渗漏点和芯样完整性检查', '冷缝夹泥断浆搭接不足或渗漏缺陷处理记录', '补搅补喷注浆堵漏或加固复测闭合', '桩体连续性冷缝检查验收和冠梁施工放行'],
  '01-03-04-P08': ['桩顶冠梁轴线标高桩顶凿毛和型钢外露状态复核', '冠梁钢筋模板预埋件和型钢连接节点检查', '冠梁混凝土浇筑振捣养护和试块留置记录', '冠梁开裂露筋标高偏差或型钢节点缺陷整改复测', '桩顶冠梁验收和基坑监测移交条件确认'],
  '01-03-04-P09': ['基坑监测点初始值型钢编号和起拔条件清单复核', '围护墙变形渗漏监测资料和冠梁验收资料核对', '型钢起拔前强度龄期回填条件和邻近保护措施检查', '监测异常起拔条件不足或资料缺项整改复测', '基坑监测移交和型钢起拔条件签认闭合'],
  '01-03-07-P02': ['水泥土挡墙桩位桩径搭接宽度和施工顺序复核', '搅拌桩或旋喷桩设备对位喷浆压力和下沉速度记录', '水泥掺量复搅遍数桩长和墙体连续性过程检查', '断浆偏桩搭接不足或墙体缺陷整改复测', '水泥土挡墙成桩记录签认和搭接质量检查放行'],
  '01-03-07-P03': ['成桩搭接宽度桩体垂直度和连续施工间隔复核', '芯样强度开挖暴露面连续性和渗漏点检查', '搭接不足冷缝夹泥渗漏或强度异常问题处理记录', '补搅补喷注浆堵漏和加固复测闭合', '成桩连续性搭接质量验收和压顶板冠梁施工放行'],
  '01-03-07-P04': ['桩顶压顶板或冠梁轴线标高和桩顶清理状态复核', '压顶板钢筋模板预埋件和排水接口位置检查', '混凝土浇筑振捣养护和试块留置记录', '蜂窝露筋开裂标高偏差或接口缺陷整改复测', '压顶板冠梁验收和墙身监测点布设放行'],
  '01-03-07-P07': ['挡墙成桩记录压顶板验收和监测初始值资料汇总复核', '墙身变形渗漏巡检问题和处理闭合资料核对', '挡墙稳定性基坑开挖边界和应急处置条件确认', '监测异常渗漏缺陷或验收资料缺项整改复测', '基坑监测移交和挡墙验收资料归档签认'],
  '01-03-09-P01': ['锚杆轴线腰梁位置孔位编号和施工分区复核', '锚杆间距倾角长度和自由段锚固段灰线布设', '地下管线邻近结构和钻孔作业影响范围检查', '孔位偏差倾角冲突或控制点扰动整改复测', '锚杆轴线孔位验收和钻机就位放行'],
  '01-03-09-P02': ['钻机型号钻杆钻头和倾角定位装置复核', '钻机平台承载导向支架和孔口防护状态检查', '钻进孔深孔径倾角地层变化和出渣情况记录', '塌孔偏孔卡钻涌水或邻近结构扰动整改复测', '钻孔施工记录签认和洗孔检测放行'],
  '01-03-09-P03': ['洗孔方式水压风压和孔底清渣工具复核', '洗孔返浆清洁度沉渣厚度孔深孔径和倾角检测记录', '二次清孔孔壁稳定锚固段长度和孔内积水复测', '沉渣超限堵孔塌孔或孔径不足处理闭合', '洗孔孔深孔径验收和锚杆杆体安放放行'],
  '01-03-09-P04': ['锚杆钢筋钢绞线规格长度和防腐套管核验', '定位架隔离架注浆管排气管和自由段包裹检查', '杆体下放居中外露长度和孔口固定过程记录', '杆体弯曲保护层不足注浆管堵塞或外露偏差整改复测', '锚杆杆体隐蔽验收和注浆施工放行'],
  '01-03-09-P05': ['一次注浆浆液配合比压力流量和注浆管路复核', '一次注浆量返浆状态和孔口封闭过程记录', '二次高压注浆时机压力级差和稳压时间控制', '漏浆串浆压力异常或注浆量不足补注复测', '注浆记录试块留置和腰梁承压板安装放行'],
  '01-03-09-P06': ['腰梁轴线标高锚固承压板孔位和垫板尺寸复核', '腰梁钢筋模板型钢焊接螺栓连接和防腐补口记录', '承压板贴合间隙锚具安装面和锚杆外露长度检查', '腰梁偏位承压板不贴合焊缝缺陷或锚具冲突整改复测', '腰梁承压板验收和锚杆张拉锁定放行'],
  '01-03-09-P07': ['张拉锚杆编号龄期浆体强度和张拉设备校验复核', '分级加载读数位移回弹和锁定荷载过程记录', '锚具夹片承压板和腰梁受力状态检查', '滑丝回缩超限位移异常或锁定不足整改复测', '张拉锁定记录签认和轴力位移监测放行'],
  '01-03-09-P08': ['锚杆轴力计位移监测点编号位置和初始值复核', '轴力位移沉降水位和周边管线监测数据采集记录', '开挖阶段报警阈值变化速率和巡查频次核对', '轴力异常测点损坏或数据跳变复测闭合', '锚杆监测资料签认和支护验收移交'],
  '01-03-09-P09': ['锚杆孔位注浆张拉锁定和监测资料汇总复核', '抗拔试验轴力监测和支护结构验收资料核对', '锚杆缺陷轴力异常渗漏问题和资料缺项销项', '基坑开挖移交边界监测频次和应急处置条件确认', '锚杆验收基坑监测移交资料归档签认'],
  '01-03-10-P02': ['主体结构预留钢筋接驳器型号数量和轴线标高复核', '围护墙凿毛清理接驳器保护帽和螺纹状态检查', '预留钢筋外露长度间距保护层和锚固条件实测记录', '接驳器偏位丝扣损伤钢筋缺失或锚固不足整改复测', '结构预留钢筋接驳器验收和防水处理放行'],
  '01-03-10-P03': ['围护与主体连接节点防水构造和基层状态复核', '止水钢板止水带附加层和穿墙节点施工记录', '连接部位阴阳角裂缝渗漏风险和搭接宽度检查', '基层潮湿空鼓收头不严或渗漏点整改复测', '连接部位防水隐蔽验收和换撑传力体系施工放行'],
  '01-03-10-P04': ['换撑传力构件轴线标高截面和支承面条件复核', '传力带支撑梁钢筋模板预埋件和卸载顺序检查', '混凝土浇筑养护强度龄期和支撑转换监测记录', '传力构件裂缝强度不足或卸载异常整改复测', '换撑传力体系验收和协同变形监测放行'],
  '01-03-10-P05': ['主体结构围护墙监测点编号保护和初始值复核', '支撑转换开挖阶段结构位移沉降和裂缝监测记录', '主体围护协同变形速率报警阈值和巡查频次核对', '监测异常测点损坏裂缝扩展或数据跳变复测闭合', '协同变形监测资料签认和结构闭合验收移交'],
  '01-03-10-P06': ['主体围护连接闭合范围防水封闭节点和验收清单复核', '后浇带施工缝穿墙孔洞和防水收头封闭检查记录', '蓄淋水观察渗漏点处理和闭合界面移交检查', '结构闭合缺陷渗漏超限或资料缺项整改复测', '结构闭合防水封闭验收资料归档和下道工序签认'],
  '01-05-01-P02': ['基坑边线放坡线控制点和开挖分区边界复核', '边坡坡率平台宽度马道位置和支护边界灰线布设', '临边防护排水沟降水井和出土道路避让检查', '边线偏差坡线冲突或控制点扰动整改复测', '基坑边线放坡线测量验收和降水监测确认放行'],
  '01-05-01-P03': ['降水井水位观测点边坡防护范围和监测频次复核', '开挖前地下水位边坡位移和周边沉降初始值采集', '截排水沟坡面覆盖喷护和临边防护状态检查', '水位未达标边坡开裂渗水或防护缺失整改复测', '降水边坡监测确认和机械开挖条件签认'],
  '01-05-01-P04': ['机械开挖分层厚度槽底预留土厚度和标高控制点复核', '挖机站位出土路线分层开挖深度和边坡保护记录', '槽底扰动超挖积水和支护结构碰撞风险巡查', '超挖扰动欠挖或支护受损部位处理复测', '机械开挖完成验收和人工清槽放行'],
  '01-05-01-P05': ['人工清槽范围持力层土质和超挖扰动处理边界复核', '槽底浮土积水软弱夹层和局部超挖清理记录', '扰动土换填垫层处理和基底保护措施检查', '清槽不到位超挖回填不实或基底受水浸泡整改复测', '人工清槽验收和基底标高复测放行'],
  '01-05-01-P06': ['基底标高方格网测点编号和设计槽底标高复核', '方格网实测标高持力层状态和排水坡向记录', '局部欠挖超挖软弱夹层和扰动范围标识检查', '标高超差基底扰动或排水不畅整改复测', '基底标高方格网复测验收和钎探验槽移交'],
  '01-05-02-P01': ['回填范围施工缝界面和试验段位置复核', '分层厚度压实机械组合和碾压遍数试验参数确认', '试验段虚铺厚度含水率压实度和沉降观测记录', '试验段压实不足含水率偏差或边角漏夯整改复测', '回填试验段参数签认和回填料复核放行'],
  '01-05-02-P02': ['回填料来源级配含水率和最大粒径检测复核', '虚铺厚度控制线分层边界和含水率调整记录', '料源混杂含水率超限有机杂质或冻块检查', '回填料不合格晾晒洒水换料或筛分整改复测', '回填料复核验收和基底清理隐蔽放行'],
  '01-05-02-P03': ['基底垃圾浮土积水和隐蔽管线保护状态复核', '排水盲沟集水井和穿墙管根封堵条件检查', '隐蔽验收影像资料基底干燥度和排水坡向记录', '基底污染积水隐蔽缺项或排水不畅整改复测', '基底清理隐蔽验收和分层摊铺放行'],
  '01-05-02-P04': ['分层摊铺厚度边线搭接宽度和边角补填范围复核', '推铺整平含水率调整和边角人工补填记录', '管沟墙边阴角狭窄区和机械无法覆盖区域检查', '虚铺超厚边角漏填离析或局部积水整改复测', '分层摊铺整平验收和夯实碾压放行'],
  '01-05-02-P05': ['夯实机械型号碾压遍数行走路线和搭接宽度复核', '分层碾压速度轮迹搭接边角夯实和沉降量记录', '墙边管沟边角补夯和软弹翻浆区域巡查', '压实不足弹簧土含水率异常或漏夯区整改复测', '夯实碾压记录签认和压实度检测放行'],
  '01-05-02-P06': ['压实度检测点位频次环刀灌砂设备和取样层位复核', '环刀或灌砂取样含水率干密度和压实系数记录', '检测不合格区范围标识返工碾压和加密检测检查', '压实度不足取样异常或检测资料缺项整改复测', '压实度检测报告签认和回填标高移交放行'],
  '01-05-02-P07': ['回填完成标高方格网沉降观测点和移交范围复核', '最终标高平整度排水坡向和观测点保护检查', '沉降观测初始值回填分层资料和检测报告汇总核对', '标高超差沉降点损坏或资料缺项整改复测', '回填标高沉降观测移交资料归档和下道工序签认'],
  '01-01-05-P01': ['强夯区清表排水沟和临时集水点复核', '表层软弱土积水和障碍物清理记录', '夯机行走道路承载力和垫板铺设检查', '场地标高平整度和排水坡向复测', '强夯作业面移交和夯点放样放行签认'],
  '01-01-05-P03': ['强夯控制网夯点坐标和区段编号复核', '夯点间距夯击遍数和能级标识布设', '地下管线构筑物避让范围和保护标识检查', '夯点偏位标识缺失或保护范围冲突整改复测', '夯点布设验收和试夯作业放行签认'],
  '01-01-05-P05': ['试夯能级单点击数和收锤标准确认', '每击夯沉量累计夯沉量和最后两击差值记录', '夯坑隆起积水或飞石风险现场处置', '夯沉异常区加密补夯或调整能级复测', '夯沉遍数记录复核和间歇期开始签认'],
  '01-01-05-P06': ['强夯间歇期天数含水率和孔压消散条件确认', '夯坑回填整平和下一遍夯点错位复核', '雨后积水软化和表层扰动巡查记录', '间歇不足含水率异常或沉降未稳整改复测', '补夯条件会签和下一遍强夯放行'],
  '01-01-05-P07': ['夯后场地高程方格网和夯坑回填厚度复核', '整平碾压机械遍数压实路线和搭接宽度记录', '局部松软翻浆或高低差超限处理复测', '表层压实度平整度和排水坡向抽检', '夯后整平压实验收和检测作业放行签认'],
  '01-01-05-P08': ['载荷试验动力触探和沉降观测点位确认', '承载力检测设备反力和测点保护检查', '检测数据沉降曲线和变形模量记录', '承载力不足或变形异常区补夯复测', '检测报告问题清单和地基验收放行签认'],
  '01-01-05-P09': ['强夯能级遍数夯沉量和间歇期记录汇总复核', '检测报告承载力变形和处理范围比对', '遗留松软区补夯销项和监理复验记录', '地基处理边界和上部垫层施工条件确认', '强夯地基验收资料归档和下道工序签认'],
  '01-01-06-P02': ['注浆孔位坐标孔序和避让管线复核', '钻机平台水平垂直度和套管护壁条件检查', '孔口防喷浆围挡和浆液回收措施确认', '孔位偏差钻机沉陷或障碍孔处理复测', '钻孔定位验收和成孔作业放行签认'],
  '01-01-06-P03': ['注浆孔孔深孔径和分层地层记录复核', '钻进泥水外溢塌孔缩孔和地下水情况记录', '终孔深度垂直度和孔底沉渣检查', '孔深不足塌孔串孔或偏孔整改复测', '成孔验收编号和注浆管安装放行签认'],
  '01-01-06-P05': ['注浆管节段长度花管孔眼和止浆塞复核', '注浆管下设深度居中固定和孔口封闭检查', '分段注浆止浆器位置和回浆通道确认', '管路堵塞偏位或孔口封闭不严整改复测', '注浆管安装验收和试注浆放行签认'],
  '01-01-06-P06': ['注浆分序分段压力级差和浆液配比确认', '注浆压力流量浆量和提升速度连续记录', '串浆冒浆地面隆起或邻孔返浆现场处置', '漏浆堵管或达不到终压补注复测', '分段注浆记录闭合和下一序孔放行签认'],
  '01-01-06-P07': ['压力表流量计浆量计校验和量程复核', '单孔累计浆量终压稳压时间和吸浆率记录', '异常耗浆拒浆或压力突降位置分析', '补浆封孔和异常孔复注复测闭合', '压力流量浆量台账和注浆完成签认'],
  '01-01-06-P09': ['注浆效果检测点位方法和龄期条件确认', '取芯标贯静探或压水试验现场实施记录', '加固体强度渗透系数和均匀性结果比对', '检测不合格区补注或加密孔处理复测', '注浆效果检测报告和地基验收放行签认'],
  '01-01-06-P10': ['注浆孔位浆量压力和异常处置资料汇总复核', '检测报告处理范围和设计加固目标比对', '遗留冒浆沉陷或检测不合格问题销项', '地基处理边界上部结构施工条件确认', '注浆地基验收资料归档和下道工序签认'],
  '01-01-08-P01': ['砂石桩处理边界控制点和桩位编号复核', '桩距排距桩长和施工分区灰线布设', '地下管线障碍物排水条件和作业面承载检查', '桩位偏差漏放或编号冲突整改复测', '桩位放样成果签认和振冲设备进场放行'],
  '01-01-08-P02': ['振冲器型号功率和水电系统容量复核', '桩机平台垫板吊点和导向架垂直度检查', '水压电流喷嘴通畅和电缆水管保护确认', '设备沉陷漏水断电或垂直度偏差整改复测', '振冲设备就位验收和砂石料复核放行'],
  '01-01-08-P03': ['砂石料产地级配粒径和含泥量资料核验', '进场批次见证取样筛分和含水率检测', '堆场分区排水防污染和计量方式检查', '级配不符含泥量超限或料源混杂整改复验', '砂石料复核记录闭合和试桩参数确认放行'],
  '01-01-08-P05': ['振冲成孔桩号孔位和设计桩长复核', '水压电流下沉速度和成孔深度连续记录', '清孔排浆返砂孔壁稳定和孔底沉渣检查', '塌孔偏孔卡振或孔深不足处理复测', '成孔清孔记录闭合和分段加料振密放行'],
  '01-01-08-P06': ['分段加料厚度填料量和振密电流控制值确认', '留振时间上拔速度和加密段搭接过程记录', '孔口返料水量泥浆排放和地面隆起巡查', '填料不足电流异常或串孔冒水处置复测', '加料振密记录签认和桩顶补料整平放行'],
  '01-01-08-P07': ['桩顶标高补料范围和桩间土松动情况复核', '孔口回填补料整平和表层压实路线记录', '桩顶缺料沉陷积水或松散区处理复测', '场地标高排水坡向和桩位保护状态检查', '桩顶补料整平验收和检测作业放行'],
  '01-01-08-P08': ['桩间土密实度检测点位和抽检频次确认', '动力触探标贯或静探检测过程见证记录', '桩间土密实度承载力和处理深度结果比对', '检测不足区补振补料或加密检测复测闭合', '检测报告问题清单和复合地基验收放行'],
  '01-01-08-P09': ['砂石桩桩位桩长填料量和振密记录汇总复核', '检测报告桩间土密实度和承载力指标核对', '补振补料检测不合格和标高偏差问题销项', '复合地基处理边界和上部垫层施工条件确认', '砂石桩复合地基验收资料归档和下道工序签认'],
  '01-02-04-P02': ['基础轴线控制线和柱脚定位基准复核', '地脚螺栓群中心距外露长度和螺纹保护检查', '定位模板刚度锚固和混凝土浇筑防移位措施确认', '锚栓偏位丝扣污染或模板松动整改复测', '地脚螺栓定位验收和钢柱安装条件签认'],
  '01-02-05-P02': ['钢管柱脚环板抗剪键和锚栓孔距深化复核', '二次灌浆面标高柱脚底板找平条件检查', '柱脚锚栓定位板和临时固定措施核对', '锚栓孔距偏差抗剪键错位整改复测', '柱脚深化图冻结和预埋施工放行签认'],
  '01-02-05-P03': ['锚栓套管中心偏差和钢筋避让关系复核', '定位架焊接固定和套管垂直度检查', '混凝土浇筑振捣防移位旁站记录', '套管堵塞偏位或钢筋碰撞整改复测', '预埋锚栓套管隐蔽影像和钢管柱安装放行签认'],
  '01-02-06-P02': ['劲性骨架轴线和型钢柱脚标高复核', '锚栓定位板孔距和临时固定措施检查', '型钢柱脚安装容差和深化节点会签', '定位板变形锚栓偏位或骨架扭转整改复测', '型钢柱脚预埋验收和吊装条件签认'],
  '01-02-06-P03': ['栓钉间距加劲肋位置和焊接作业面复核', '预埋件防腐破损和焊缝外观检查', '栓钉焊后弯曲试验和加劲肋焊缝记录', '漏焊虚焊防腐缺陷整改复测', '预埋件栓钉验收和钢筋模板交叉复核放行'],
  '01-02-06-P04': ['主筋穿型钢孔洞和节点碰撞复核', '模板开孔保护层垫块和预留振捣通道检查', '钢筋绑扎与型钢临时固定互扰处置记录', '保护层不足模板孔洞偏位或钢筋碰撞整改复测', '交叉节点隐蔽验收和混凝土浇筑放行签认'],
  '01-02-06-P05': ['型钢翼缘腹板下料口和浇筑分层高度确认', '振捣棒插点钢骨阴影区和排气通道检查', '混凝土坍落度入模温度和钢骨周边密实记录', '蜂窝空洞钢骨包裹不密实部位处理复测', '型钢周边浇筑质量验收和养护移交签认'],
  '01-02-07-P01': ['桩位轴线控制点和试沉桩区段复核', '地下障碍探查清理和桩机行走路线确认', '试沉桩桩号顺序终压或贯入控制标准会签', '桩位偏差或作业面承载不足整改复测', '试沉桩条件验收和批量沉桩放行签认'],
  '01-02-07-P02': ['预制桩规格强度龄期和合格证复核', '桩身裂缝端板平整度和桩尖完整性检查', '堆放层数支垫位置和吊点标识核对', '不合格桩隔离退场或修补复验记录', '进场验收台账和桩号追溯签认'],
  '01-02-07-P03': ['桩机平台承载力和垫板铺设复核', '桩机就位中心线夹具和导向架垂直度校正', '压桩或锤击设备油压锤重仪表校验记录', '桩机偏位下沉或导向架松动整改复测', '桩机就位验收和吊桩喂桩放行签认'],
  '01-02-07-P04': ['预制桩吊点吊索夹具和起吊角度复核', '吊桩翻身喂桩过程防碰撞和防裂控制', '桩尖对位桩身垂直度和接桩高度记录', '桩身裂缝碰伤或喂桩偏位整改复测', '吊桩喂桩验收和沉桩作业放行签认'],
  '01-02-07-P05': ['沉桩顺序桩号和邻桩影响范围确认', '锤击贯入度或静压压力行程连续记录', '沉桩垂直度桩身回弹和送桩深度控制', '拒沉偏斜断桩或挤土异常处置复测', '沉桩记录终桩参数和接桩检测移交签认'],
  '01-02-07-P07': ['终压值贯入度控制标准和停压条件复核', '稳压时间压力回弹和桩顶标高连续记录', '终桩压力不足贯入异常或上浮风险处理', '复压复打数据和邻桩位移复测闭合', '终桩参数签认和桩顶标高复核放行'],
  '01-02-07-P08': ['送桩深度桩顶设计标高和测量基准复核', '桩顶高程偏差桩位偏差和垂直度实测记录', '超高截桩或低桩补强处理方案确认', '桩顶破损偏位超限整改复测', '桩顶标高复核记录和截桩作业移交签认'],
  '01-02-07-P09': ['截桩线标高切割范围和桩头保护复核', '机械切割或人工凿除过程防损伤控制', '桩头钢筋端板和防腐补刷检查记录', '桩头破损裂缝或钢筋外露异常修补复测', '截桩桩头处理验收和承台施工放行签认'],
  '01-02-07-P10': ['检测桩号休止期龄期和试验方法确认', '静载反力装置低应变仪器和测点布置检查', '加载沉降或波形数据采集过程见证记录', '异常桩复测扩大检测和原因判定闭合', '检测报告问题清单和桩基验收放行签认'],
  '01-02-07-P11': ['桩位偏差桩顶标高和终桩记录汇总复核', '接桩焊缝检测桩身检测和材料资料核查', '试桩检测不合格桩处置和设计复核意见闭合', '验收问题整改销项和移交界面确认', '桩基子分部验收资料归档和承台施工签认'],
  '01-02-08-P01': ['桩位轴线控制点护筒中心偏差复核', '护筒埋深筒顶标高和黏土封口检查', '护筒周边回填夯实和孔口防坍保护记录', '护筒偏位漏浆或孔口松动整改复测', '桩位护筒验收和钻机就位放行签认'],
  '01-02-08-P02': ['泥浆池沉淀池循环槽和废浆外运路径复核', '膨润土配比清水水质和制浆搅拌时间记录', '泥浆比重黏度含砂率和胶体率检测', '泥浆指标超限漏浆或循环不畅整改复测', '泥浆循环系统验收和成孔施工放行签认'],
  '01-02-08-P04': ['成孔检测仪测绳孔径仪和测点布置复核', '孔深孔径垂直度沉渣厚度逐桩检测记录', '缩径斜孔塌孔或沉渣超限部位定位', '扫孔补浆二次清孔后复测闭合', '终孔检测验收和一次清孔放行签认'],
  '01-02-08-P09': ['超灌高度浮浆厚度和桩顶设计标高复核', '桩顶混凝土初凝后浮浆凿除和弃浆清理记录', '声测管保护桩头钢筋和桩顶平整度检查', '桩顶欠灌夹泥破损或标高偏差整改复测', '桩顶处理验收和桩身检测条件签认'],
  '01-07-03-P03': ['洞门钢环圆度标高和盾构始发接收边界复核', '橡胶帘布压板螺栓和油脂密封安装检查', '盾构或顶管穿越前洞口止水水压观察记录', '压板松动帘布破损或渗漏点修补复测', '洞口止水装置验收和始发接收作业放行签认'],
  '02-01-06-P02': ['PC工厂首件模具尺寸和模台平整度验收', '首件钢筋保护层套筒定位和预埋件偏差复核', '首件混凝土浇筑蒸养脱模和外观实测记录', '首件评审问题整改复测和工艺参数冻结', '首件样板评审签认和批量生产放行'],
  '02-01-06-P03': ['模台清洁边模拼缝和脱模剂涂刷检查', '边模尺寸预留孔洞吊点埋件位置复核', '模具紧固防漏浆和角部倒角成型记录', '模具偏位孔洞堵塞或埋件松动整改复测', '模具组装验收和钢筋入模放行签认'],
  '02-01-06-P06': ['混凝土配合比坍落度和入模温度复核', '布料顺序振捣密实和预埋件防移位控制', '表面收面拉毛和构件编号影像记录', '蜂窝麻面露筋或预埋偏移修补复测', '试块留置蒸养前检查和构件养护放行签认'],
  '02-01-06-P07': ['蒸养升温恒温降温曲线和时间记录', '脱模强度吊点受力和翻身条件复核', '缺棱掉角蜂窝裂缝修补打磨过程记录', '修补后外观尺寸和二维码追溯复测', '蒸养脱模验收和构件入库放行签认'],
  '02-01-06-P09': ['PC构件运输架支垫位置和装车顺序复核', '构件吊装方向重心标识和绑扎点检查', '运输防碰撞防倾覆和成品保护记录', '到场外观损伤变形或二维码异常复测', '装车交接清单和现场吊装条件签认'],
  '02-01-06-P13': ['预制墙板柱坐浆层厚度和控制线复核', '临时斜撑安装垂直度调整和复紧记录', '拼缝宽度标高垂直度和套筒对孔检查', '墙柱偏位拼缝超差或支撑松动整改复测', '灌浆前实体复核和下道连接作业放行签认'],
  '02-01-06-P16': ['预制楼梯吊点梯段编号和搁置长度复核', '梯段吊装就位标高踏步线和临边防护检查', '连接钢筋预留孔洞和坐浆层密实记录', '梯段偏位搁置不足或踏步碰损整改复测', '楼梯连接验收成品保护和楼层移交签认'],
  '08-12-03-P08': ['母钟子钟断电守时电池容量和接线复核', 'NTP授时中断后本地保持精度连续记录', '恢复供电后时钟同步漂移和校时响应测试', '守时模块失效电池欠压或同步超差整改复测', '断电守时测试记录和系统试运行放行签认'],
  '08-13-04-P07': ['用户验收测试场景用例和角色权限清单冻结', '业务流程端到端操作和接口回写结果记录', '缺陷单优先级责任人和回归测试批次跟踪', '阻断缺陷修复版本部署和复测闭合', 'UAT签认问题销项和上线发布条件确认'],
  '08-14-04-P07': ['DDC点位执行器手自动切换范围复核', '阀门风阀限位反馈和本地远程权限测试', '失电保护复位状态和故障保持逻辑记录', '执行器反馈反向失电误动作或阀位超差整改复测', '手自动失电保护功能记录和联调放行签认'],
  '08-14-09-P05': ['BMS现场反馈问题点表和趋势曲线复核', '报警阈值联动脚本和设备反馈状态复测', '点表偏差离线点和量程倍率异常整改记录', '整改后连续趋势采集和报警恢复验证', '现场反馈问题销项和运维确认签认'],
  '08-15-05-P01': ['声光手报输入输出模块安装点位和防火分区复核', '回路编号设备地址编码和底盒安装高度检查', '模块箱端子线号和消防联动对象对应关系核对', '错点重码漏点或安装高度偏差整改复测', '火报点位复核记录和现场接线放行签认'],
  '08-15-05-P03': ['火报模块声光手报底座固定和回路极性复核', '输入输出模块端子编号线号压接和地址编码记录', '短路隔离器回路分段和末端电阻安装检查', '接线松动错接重码或通讯故障整改复测', '现场设备接线验收和单点调试放行签认'],
  '08-15-06-P04': ['消防图形显示楼层平面和报警点位绑定复核', '报警监管故障反馈状态与设备地址逐点映射测试', '联动动作图显闪烁定位和打印记录核对', '图显错层错点无反馈或状态延迟整改复测', '图形显示功能记录和消防控制室联调签认'],
  '10-02-11-P05': ['门锁回路限位开关急停串联范围复核', '端子编号线号绝缘电阻和接地连续性测试', '安全回路断开复位和慢车验证记录', '门锁短接误接限位失效或急停异常整改复测', '安全回路核验记录和快车调试放行签认'],
  '10-02-11-P08': ['泵站油温传感器油压开关和保护阈值复核', '电机启动电流油泵运行声响和油压建立记录', '低油压高油温保护动作和报警复位测试', '保护误动拒动或油压波动异常整改复测', '泵站保护联动记录和整机试运行放行签认'],
  '10-03-03-P07': ['空载满载制动距离测试工况和测点复核', '制动器间隙扶手带同步和急停回路检查', '制动距离实测曲线和监督检验见证记录', '制动距离超限打滑或急停延迟整改复测', '制动测试报告和监督检验问题闭合签认'],
  '01-03-05-P01': ['分层开挖厚度和坡面修整线复核', '超挖欠挖孤石松动土清理记录', '开挖暴露面喷护等待时间控制', '坡面平整度和局部坍塌处理复测', '本层土钉孔放样条件和监测巡视签认'],
  '01-03-05-P02': ['喷射混凝土配合比和速凝剂掺量核对', '受喷面清理湿润和泄水点预留检查', '初喷厚度回弹料清理和分区记录', '空鼓开裂掉块部位凿除补喷复测', '初喷面强度和下道钻孔条件签认'],
  '01-03-05-P03': ['土钉孔位角度孔深和倾角仪复核', '钻机就位套管护壁和塌孔风险记录', '成孔孔径孔深倾角逐孔验收', '塌孔偏孔堵孔洗孔和补孔复测', '成孔验收编号和杆体安装放行签认'],
  '01-03-05-P04': ['土钉钢筋长度弯钩定位架和防腐复核', '注浆管止浆塞安装和孔内清理检查', '水灰比浆液流动度注浆压力过程记录', '孔口返浆不足漏浆堵管处理复测', '注浆饱满度记录和面层钢筋网放行签认'],
  '01-03-05-P05': ['网片规格间距保护层垫块复核', '网片搭接长度和土钉端部焊接检查', '加强筋压筋和喷层定位支架固定', '脱焊翘曲保护层不足整改复测', '钢筋网隐蔽验收和面层喷射放行签认'],
  '01-03-05-P06': ['面层喷射厚度控制点和分层喷射顺序确认', '喷射混凝土坍落度速凝剂和回弹率记录', '阴阳角坡肩坡脚加强喷护检查', '厚度不足空鼓裂缝切除补喷复测', '面层厚度强度检测和养护移交签认'],
  '01-03-05-P07': ['泄水孔位置坡度滤料包裹复核', 'PVC泄水管埋设外露长度和防堵措施检查', '坡面盲沟排水沟连通和出水路径记录', '堵塞倒坡渗水集中点疏通整改复测', '排水系统通水检查和雨季巡检移交签认'],
  '01-03-05-P08': ['坡顶截水沟坡脚排水沟标高坡向复核', '监测点测斜管沉降点保护标识设置', '雨水外排沉淀和施工道路截排水检查', '排水沟破损淤堵监测点扰动整改复测', '排水监测初值和开挖下层放行签认'],
  '01-03-05-P09': ['土钉拉拔检测批次和抽检位置核对', '喷层厚度强度排水通畅性综合复验', '基坑变形监测曲线和报警处理记录复核', '缺陷销项坡顶荷载控制和巡检责任交接', '土钉墙验收资料和持续监测移交签认'],
  '01-03-06-P01': ['地下连续墙轴线控制点和导墙净距复核', '导墙钢筋模板加固和槽口宽度检查', '导墙混凝土浇筑标高和槽口线形保护记录', '导墙偏位裂缝掉角修补复测', '成槽设备行走面和导墙验收放行签认'],
  '01-03-06-P05': ['槽段编号泥浆比重黏度含砂率复核', '抓斗清底刷壁和沉渣厚度检测记录', '泥浆置换液面高度和循环补浆过程控制', '沉渣超限塌孔夹泥二次清孔复测', '清孔置换验收和钢筋笼下放条件签认'],
  '01-03-06-P08': ['槽段接头形式编号和刷壁设备复核', '接头刷洗次数泥皮清除和刷壁深度记录', '接头管箱拔出时间垂直度和混凝土初凝状态控制', '拔管卡阻变形漏浆问题处置复测', '接头质量记录和相邻槽段成槽放行签认'],
  '01-03-06-P09': ['墙身检测方法测点布置和槽段编号确认', '超声低应变取芯检测报告和接头影像归集', '夹泥断墙接头渗漏缺陷位置复核', '缺陷补强注浆修复和二次检测闭合', '检测验收报告和基坑开挖移交签认'],
  '01-03-08-P02': ['立柱桩定位偏差护筒标高和垂直度复核', '成孔泥浆孔深沉渣和钢筋笼定位记录', '格构柱插入深度方向角和固定支架检查', '混凝土灌注导管埋深和桩顶标高控制', '立柱桩检测成果和支撑安装条件签认'],
  '01-03-08-P03': ['支撑构件编号长度截面和节点板复核', '围檩托架牛腿焊缝锚栓安装检查', '支撑吊装就位轴线标高和临时固定记录', '拼接间隙错台变形部位校正复测', '支撑安装验收和预加力作业放行签认'],
  '01-03-08-P04': ['钢楔千斤顶油表校验和加载级差确认', '节点螺栓焊缝承压垫板接触面检查', '分级预加轴力加载稳压和锁定记录', '轴力损失滑移焊缝裂纹整改复测', '预加力锁定数据和开挖放行签认'],
  '01-03-08-P05': ['轴力计安装位置量程编号和线缆保护复核', '采集箱供电通讯和数据平台点表调试', '初始值采集温度修正和报警阈值会签', '异常漂移离线损坏点更换复测', '监测初值报告和分层开挖监测移交签认'],
  '01-03-08-P06': ['每层开挖支撑轴力位移频次计划确认', '开挖卸载期间轴力变化和围护位移联动记录', '超报警值停工会商加固措施跟踪', '回归稳定数据复核和继续开挖放行', '连续监测日报曲线和风险闭合签认'],
  '01-03-08-P07': ['换撑梁板强度和传力构造验收复核', '支撑卸载顺序分级切割和防坠措施确认', '拆撑过程轴力位移沉降同步监测记录', '拆除残留节点补强防腐和结构损伤复测', '换撑拆撑验收和下道结构施工移交签认'],
  '01-03-08-P08': ['支撑构件轴线标高节点连接全数复核', '预加力轴力监测和报警闭合资料核查', '支撑变形裂缝焊缝螺栓缺陷销项', '监测日报拆换撑记录和危大验收资料归档', '支撑体系阶段验收和基坑施工控制移交签认'],
  '01-04-01-P02': ['井位间距井深滤管长度和封孔材料复核', '钻孔成井井管垂直度滤料回填过程记录', '洗井含砂量出水量和水清程度验收', '塌孔堵塞出砂异常井修复复测', '成井验收编号和试抽水条件签认'],
  '01-04-01-P03': ['排水沟坡向集水井标高和沉淀池容量复核', '沟槽开挖砌筑防渗和盖板安全措施检查', '基坑内外排水连通和外排许可记录', '倒坡淤堵渗漏积水点整改复测', '排水系统通水验收和抽排设备接入签认'],
  '01-04-01-P04': ['水泵扬程流量备用泵配置和电源回路复核', '管线支架阀门止回装置和排放口固定检查', '配电箱漏保接地和雨棚防护试运行记录', '水泵跳闸漏水管线脱落整改复测', '抽排设备试运行和连续降水放行签认'],
  '01-04-01-P05': ['试抽水分区水位观测井和记录频次确认', '启泵流量水位降深含砂量连续记录', '周边沉降裂缝和地下水位响应比测', '降深不足出砂浑水或沉降异常处理复测', '试抽水成果和正式降水运行参数签认'],
  '01-04-01-P06': ['水位控制标高启停泵规则和值班表确认', '连续抽排电流流量水位和含砂量巡检记录', '停电暴雨备用泵切换和排水通道巡查', '水位反弹水泵故障外排堵塞抢修复测', '连续运行日报和土方开挖窗口放行签认'],
  '01-04-01-P07': ['周边建筑管线道路沉降点和裂缝基准复核', '巡视频次水位沉降裂缝同步记录', '超限报警会商回灌减抽或加固措施跟踪', '异常点复测稳定趋势和风险解除签认', '巡检监测报告和降水维持策略移交'],
  '01-04-01-P08': ['封井时机地下室抗浮结构条件复核', '井管截断回填封堵止水材料过程记录', '封井后水位回升抗浮和渗漏巡视', '封堵渗漏冒水或回升异常返修复测', '封井验收记录和运维排水边界移交签认'],
  '01-04-02-P03': ['回灌管线分区编号流量计量程和阀门方向复核', '回灌管线支架坡度排气排污点安装检查', '管线冲洗试压和回灌井接入密封记录', '计量表偏差漏水堵塞点整改复测', '管线计量装置验收和试回灌放行签认'],
  '04-03-02-P04': ['涂膜材料批次配比和基层干燥度复核', '阴阳角管根节点附加层分遍涂刷', '大面涂膜分层多遍交叉涂布和搭接控制', '针孔起鼓漏涂和厚薄不均部位修补复涂', '分遍施工影像湿膜记录和下道工序放行签认'],
  '04-03-02-P06': ['设计厚度检测点位和代表区域划分确认', '湿膜梳或针测厚度逐区抽测记录', '薄弱部位补涂加厚和搭接边二次复核', '厚度不合格区域返工复测和责任闭合', '涂膜厚度检测记录与隐蔽验收签认'],
  '04-03-02-P08': ['淋水或蓄水范围排水封堵和水位标识确认', '蓄水高度持续时间和观察点位记录', '管根阴角门槛墙根渗漏路径巡查', '渗漏点开槽补涂附加层并二次蓄水复测', '淋水蓄水试验记录和保护层施工放行签认'],
  '05-01-04-P08': ['分区阀门状态末端排水路径和压力表校验确认', '湿式系统缓慢充水排气并巡查接口渗漏', '分区升压稳压压降记录和报警阀状态观察', '管网冲洗水质流速和排放口连续性记录', '试压冲洗问题整改复测并签认放行喷头联动测试'],
  '08-15-07-P05': ['防排烟卷帘电梯迫降和切非点表地址核对', '火警分区触发场景脚本和手自动切换条件确认', '逐场景触发风机阀门卷帘电梯迫降和反馈信号测试', '主机图显现场动作打印记录和反馈时序一致性复核', '错地址无反馈动作延迟问题整改复测并锁定联动矩阵'],
  '08-15-07-P06': ['消防控制室主机图显打印机和联动柜反馈通道核对', '火警监管故障屏蔽复位和反馈分类显示测试', '远程启动停止反馈时序和现场动作一致性复核', '漏显误显延迟反馈和打印缺项问题整改复测', '控制室反馈复核记录联动矩阵版本和调试放行签认'],
  '08-15-08-P04': ['试运行分区联动场景周期和触发条件确认', '报警探测联动反馈和复位流程连续记录', '误报漏报设备离线和反馈延迟问题分区定位', '场景整改后连续复测和异常趋势复盘', '试运行周期记录问题清单和检测前放行签认'],
  '05-07-01-P06': ['闭水通水合格隐蔽验收和管顶保护层条件确认', '回填材料粒径含水率和管侧对称回填工法复核', '管侧管顶和路面结构层分层摊铺夯实记录', '每层压实度井周回填和沉降风险点抽检', '不合格段返挖补压复测井盖标高和道路恢复移交'],
  '01-03-06-P03': ['槽段编号导墙净距和成槽设备定位复核', '护壁泥浆液面比重黏度和循环补浆控制', '分幅成槽深度垂直度和接头位置过程记录', '塌孔偏斜沉渣超限部位清槽修正复测', '成槽记录泥浆指标和钢筋笼下放条件签认'],
  '01-03-06-P04': ['成槽检测方法测点布置和槽段编号核对', '槽深槽宽垂直度和接头刷壁质量检测记录', '超限槽段修槽清孔和泥浆置换复测', '检测曲线与设计槽段尺寸和导墙基准比对', '成槽垂直度深度检测记录和隐蔽放行签认'],
  '01-03-06-P07': ['导管节段拼装水密试验和下设深度复核', '首灌混凝土方量导管埋深和开灌连续性控制', '水下混凝土坍落度供应节奏和槽内液面记录', '导管提升混凝土面标高和夹泥断桩风险处置', '浇筑曲线试块留置和槽段成墙记录签认'],
  '04-05-04-P02': ['水落口标高坡向和周边找坡半径复核', '基层浮浆松动空鼓和含水率清理检查', '找坡层收口压实坡度和排水方向过程控制', '倒泛水积水空鼓开裂部位修补复测', '水落口基层隐蔽验收和附加层施工放行签认'],
  '04-05-04-P03': ['水落口杯管根阴角附加层裁剪尺寸确认', '附加层铺贴涂刷搭接宽度和上翻高度控制', '收头压环密封胶嵌填和防水卷材压实检查', '密封不严翘边皱折和空鼓部位修补复测', '水落口附加层隐蔽影像和蓄淋水前验收签认'],
  '04-05-04-P05': ['通水试验封堵排水路径和观察点位确认', '屋面代表区域连续放水和水落口排放观察', '篦子格栅杂物堵塞和管口涡流状态检查', '排水不畅倒泛水或堵塞部位清理整改复测', '通水排放堵塞检查记录和屋面移交放行签认'],
  '10-01-13-P03': ['快车运行前安全回路门锁和限速条件复核', '额定速度上下行运行曲线振动噪声和温升记录', '平层门区减速换速和端站保护响应检查', '异常抖动异响冲顶蹲底风险点整改复测', '快车运行检查记录和载荷试验前放行签认'],
  '10-01-13-P04': ['平层精度测点楼层载荷工况和仪器校验确认', '空载半载满载上下行平层偏差逐层实测', '运行加减速度振动噪声和轿厢舒适性观察记录', '平层超差舒适性异常参数调整和复测闭合', '平层精度舒适性测试报告和监督检验资料签认'],
  '10-02-12-P03': ['液压梯快车前油泵阀组油温和安全回路复核', '额定速度上下行运行油压油温和轿厢振动记录', '端站换速限位和液压系统响应稳定性检查', '爬行抖动油压波动或异常噪声问题整改复测', '液压梯快车运行检查记录和沉降试验前放行签认'],
  '10-02-12-P04': ['平层再平层测试工况载荷和油温边界确认', '各层停靠平层偏差和再平层动作响应实测', '门区保持油缸沉降和再启动舒适性观察记录', '平层漂移再平层失效或油压异常整改复测', '平层精度再平层功能测试记录和验收资料签认'],
  '10-02-12-P05': ['层门轿门门锁触点安全回路和旁路状态核对', '门锁闭合开门保护光幕和急停回路逐层测试', '安全回路断开复位和控制柜故障显示记录', '门锁接触不良误动作或回路断点整改复测', '门锁安全回路测试记录和监督检验资料归集'],
  '02-05-01-P02': ['型钢坡口角度钝边间隙和错边量实测', '焊接作业面油污铁锈和水分清理', '组对胎架定位夹具和临时固定复核', '坡口组对偏差修补和二次复测记录', '坡口组对验收记录和正式焊接放行签认'],
  '02-05-01-P03': ['焊材牌号规格批次和烘干温度核对', '焊条焊剂保温桶领用回收记录检查', '焊接电流电压速度和层间温度参数交底', '焊工资格证焊缝编号和作业范围匹配', '焊材烘干参数记录和焊接作业放行签认'],
  '02-05-01-P04': ['定位焊长度间距和引弧收弧位置确认', '正式焊接顺序层道划分和反变形控制', '焊接过程电流电压层间温度连续记录', '夹渣咬边气孔裂纹等缺陷现场修补复焊', '焊接完成编号影像和班组自检记录归集'],
  '02-05-01-P05': ['焊缝外观成型余高宽度和咬边检查', '构件变形错边量和焊后尺寸复测', '外观缺陷打磨补焊和二次外观复检', '焊缝编号检测批次和探伤委托清单核对', '外观检查记录和无损检测放行签认'],
  '02-05-01-P06': ['无损检测方法比例部位和焊缝编号核对', '探伤作业面打磨清理和检测条件确认', '检测缺陷等级定位长度和返修范围标识', '返修焊接后复探比例和结果复核', '探伤报告编号和焊缝质量闭合记录签认'],
  '02-05-01-P07': ['返修焊缝编号原因和责任班组确认', '缺陷清除范围坡口重开和补焊参数记录', '返修后外观复检和无损检测复探核验', '重复返修风险和设计监理处置意见闭合', '焊接返修闭合单报告复核和移交签认'],
  '02-06-07-P03': ['空间网格杆件球节点编号和分区拼装顺序核对', '杆件吊装就位方向螺栓孔位和节点错边复测', '高强螺栓初拧终拧或焊缝连接过程记录', '分区安装偏差临时支撑受力和节点质量检查', '空间网格分区安装完成影像和实测记录签认'],
  '02-06-07-P04': ['节点定位标高控制点和三维测量基准复核', '支座球节点杆件端部坐标和安装偏差实测', '超差节点卸载前修补调整和复测闭合', '三维坐标复测数据监理见证和模型比对', '节点定位标高三维复测记录和下区安装放行'],
  '02-06-07-P05': ['结构闭合前杆件应力节点螺栓和焊缝状态检查', '临时支撑胎架沉降变形和整体稳定复测', '偏位构件校正顺序和卸载前风险点确认', '闭合段连接质量缺陷修补和二次稳定复测', '结构闭合整体稳定记录和卸载条件会签'],
  '05-10-01-P03': ['中水箱管口标高方向和止回阀组安装复核', '液位控制浮球传感器和回用水泵联锁接线', '回用水泵进出水管路冲洗排气和试运行', '液位高低报警启停联动调试和异常修补', '中水箱液位泵组联动记录和管路连接签认'],
  '05-10-01-P04': ['中水管网冲洗分区末端放水点和排水路径确认', '冲洗流速浊度和持续时间现场记录', '防误接检查用水点阀门颜色和管网边界逐点核对', '误接疑点拆改修补后重复冲洗和复测', '管网冲洗防误接检查记录和隐蔽移交签认'],
  '05-10-01-P05': ['非饮用标识位置管道颜色流向箭头和耐久性检查', '机房管井吊顶末端用水点标识逐点粘贴复核', '标识缺失错贴污染破损问题修补复查', '防误饮提示照片和楼层点位清单归集', '非饮用标识和管道颜色复核签认完成'],
  '05-10-01-P06': ['回用水水质取样点检测项目和见证取样计划确认', '浊度余氯pH色度等指标采样送检记录核对', '不合格水质冲洗换水或处理设备调整复测', '检测报告编号结果和系统运行参数比对', '回用水水质检测复核和验收资料移交签认'],
  '06-20-02-P02': ['执行器支架轴套安装位置和受力状态复核', '阀门风阀连杆行程余量和防卡涩间隙调整', '执行器接线端子电源反馈线和接地状态测试', '安装偏差连杆松动或卡涩问题修补复测', '执行器安装连接记录和行程调试放行签认'],
  '06-20-03-P02': ['风机风阀防火阀点位编号和反馈端子核对', '执行机构电源控制线反馈线接入和地址编码确认', '就地远程启停命令与风阀开闭反馈调试', '反馈反向延迟丢点或卡涩问题修补复测', '风机风阀反馈信号调试截图和点表签认'],
  '06-20-03-P03': ['消防强切范围防火分区和设备断电清单核对', '手自动切换命令消防主机BMS和现场按钮逐点调试', '强切启动复位反馈时间和失败告警记录', '联锁失败误动作或无反馈点位修补复测', '消防强切手自动切换调试记录和放行签认'],
  '06-20-03-P04': ['紧急模式场景启动条件复位条件和参与设备核对', '风机风阀排烟口补风口启动顺序联动调试', '消防主机图显BMS趋势和现场反馈闭环比对', '启动失败复位异常或反馈不闭合问题修补复测', '紧急模式启动复位调试记录和反馈闭环签认'],
  '07-02-06-P02': ['电缆剥切长度半导电层处理和应力锥尺寸实测', '压接前芯线清洁倒角和绝缘层损伤检查', '冷缩热缩施工环境温度和加热收缩顺序控制', '剥切偏差绝缘划伤或应力锥错位修补复测', '电缆头剥切施工记录和隐蔽签认完成'],
  '07-02-06-P03': ['端子规格压接模具编号和压接工具校验确认', '导体插入深度压接道数和压痕外观检查', '柜内端子母排连接扭矩和接触面清洁复核', '松动压接偏心或发热风险点修补复测', '端子压接施工记录和柜内连接签认完成'],
  '07-02-06-P04': ['屏蔽层铜带铜丝搭接长度和接地方式核对', '接地线压接焊接端子固定和绝缘恢复施工', '相色标识电缆挂牌和回路编号一致性复核', '屏蔽接地松动错相或标识缺失修补复查', '屏蔽接地相色标识记录和测试前放行签认'],
  '07-02-06-P05': ['电缆终端机械固定支架夹具和弯曲半径复核', '相序核对电缆排列柜内净距和防火封堵检查', '终端受力松动护套破损和密封缺陷修补', '机械固定后绝缘电阻和接地连续性复测', '相序机械固定检查记录和耐压试验放行'],
  '07-02-06-P06': ['耐压试验方案电压等级时间和安全围挡确认', '试验接线升压稳压放电和接地恢复过程记录', '泄漏电流闪络击穿或异常声响处置复测', '耐压合格后封堵恢复和柜内清理检查', '高压电缆头耐压试验记录和送电前签认'],
  '07-03-01-P02': ['供电干线相序表测试点位和回路编号核对', '接地连续性测试仪表校验和测试路径确认', '相序错误接地不连续或线号不一致问题修补', '复测数据与回路清单和柜号端子编号比对', '相序调试接地连续性复核记录签认完成'],
  '07-03-01-P04': ['送电回路清单柜号电缆编号和负荷边界核对', '绝缘电阻接地连续性和相序复测记录检查', '临时用电拆除挂牌隔离和安全防护确认', '受送电人员分工通讯方式和应急停电措施交底', '送电许可操作票和监护条件会签', '送电条件安全许可和首送记录签认'],
  '07-03-01-P05': ['供电干线分段送电顺序和开关编号确认', '空载试运行电压相序保护告警和端子温升记录', '分段合闸冲击电流和异常跳闸现场处置', '空载异常回路修补后复送复测和数据比对', '分段送电空载试运行记录和下一段放行签认'],
  '07-04-03-P02': ['控制回路点动按钮接触器和就地远程开关编号核对', '点动调试正反转互锁和远程命令响应记录', '控制线端子松动错线或反馈延迟问题修补复测', '就地远程切换状态与动力柜指示灯一致性比对', '控制回路点动调试记录和切换测试签认'],
  '07-04-03-P03': ['热继电器整定值电机额定电流和保护曲线核对', '过载缺相短路保护模拟动作和复位调试', '保护参数偏差或误动作回路修补复测', '热继电器保护参数整定单和测试截图归集', '热继电器保护参数调试复核记录签认'],
  '07-04-03-P04': ['电机正反转点动调试和机械脱开条件确认', '空载试运行电流振动噪声温升和轴承状态记录', '反转卡涩异常振动或温升超限问题修补复测', '机械空载检查结果与设备铭牌和回路编号比对', '正反转调试机械空载试运行记录签认'],
  '07-04-03-P05': ['带载试运行负荷边界电流测点和温升测点确认', '运行电流电压温升振动噪声连续记录', '过载跳闸发热异常或负荷不平衡修补复测', '带载试运行数据与保护参数和设备容量比对', '电气动力带载试运行和电流温升记录签认'],
  '07-04-03-P06': ['急停按钮联锁回路和安全保护点位清单核对', '急停触发停机复位和远程反馈状态逐项调试', '联锁测试失败误动作或反馈缺失问题修补复测', '运行记录异常清单和复测截图归集', '急停联锁测试调试和运行记录闭合签认'],
  '01-01-06-P01': ['注浆试验孔位地层代表性和试验范围复核', '钻孔定位孔深孔径和注浆设备状态确认', '浆液配合比水灰比和外加剂批次核验', '分序分段注浆压力流量和注浆量记录', '返浆冒浆串浆异常处置和补浆复核', '试验成果参数签认和批量注浆放行'],
  '01-02-03-P04': ['钢筋翻样料单和钢筋批次复验资料核对', '钢筋加工尺寸弯钩锚固长度和接头形式复核', '底板墙柱梁钢筋安装间距保护层和定位筋检查', '套筒焊接或绑扎接头抽检和隐蔽问题整改', '预留预埋洞口加强筋和后浇带钢筋复核', '钢筋隐蔽验收记录和浇筑放行签认'],
  '01-02-03-P05': ['模板深化图轴线标高截面尺寸和支撑方案复核', '模板支架立杆扫地杆剪刀撑和对拉体系检查', '梁板墙柱模板安装垂直度平整度和拼缝复测', '预留洞口后浇带施工缝和止水节点模板封闭检查', '浇筑前模板加固复检和漏浆变形风险销项', '模板验收记录和混凝土浇筑放行签认'],
  '01-02-05-P06': ['柱脚界面凿毛清理和浮浆油污处理复核', '灌浆料批次强度等级流动度和试配报告核验', '垫板锚栓套筒和二次灌浆空间尺寸复测', '灌浆分区封边排气和连续灌浆过程记录', '灌浆饱满度溢浆和养护保护检查', '二次灌浆强度报告和柱脚交接验收签认'],
  '01-02-07-P06': ['接桩端板坡口和焊接作业面清理复核', '上下节桩轴线垂直度错边量和临时固定检查', '焊材烘干焊接参数和焊工资格资料核对', '分层焊接外观成型焊缝尺寸和缺陷检查', '焊缝探伤或连接质量抽检和防腐补口记录', '接桩隐蔽验收和沉桩继续作业放行签认'],
  '01-02-08-P06': ['钢筋笼分节编号和主筋箍筋间距复核', '接头焊接或机械连接质量和声测管安装检查', '保护层垫块吊点加强筋和防变形措施复核', '钢筋笼吊装下放垂直度和孔壁碰撞控制', '笼顶标高定位固定和导管空间复测', '钢筋笼隐蔽验收影像记录和清孔灌注放行'],
  '01-02-12-P04': ['钢桩吊装半径站位和地基承载条件复核', '吊具索具吊点重心和试吊状态检查', '钢桩喂桩姿态导向架限位和垂直度控制', '桩身防腐层端板和焊口保护过程检查', '吊装喂桩异常偏位碰撞和停机处置记录', '喂桩完成标高垂直度复测和沉桩放行签认'],
  '01-07-01-P01': ['防水混凝土设计抗渗等级和配合比报告复核', '水泥外加剂掺合料批次和复验资料核验', '坍落度入模温度和泵送连续性控制值确认', '施工缝后浇带穿墙管止水节点清单核对', '抗渗试块留置计划和见证取样编号确认', '配合比抗渗资料闭合和浇筑条件放行'],
  '01-07-01-P02': ['施工缝位置基层状态和钢筋界面复核', '止水钢板或止水带规格批次验收', '止水件定位焊接搭接长度和固定检查', '止水节点偏位破损和焊缝缺陷整改复核', '施工缝隐蔽验收影像记录和浇筑放行签认'],
  '01-07-01-P05': ['保湿保温养护措施和覆盖范围检查', '同条件和抗渗试块编号留置', '养护龄期记录温湿度巡查和拆模条件复核', '抗渗试验送检台账和报告回收核验', '强度抗渗结果异常处置和防水验收资料闭合'],
  '01-07-01-P06': ['地下室外墙蜂窝麻面裂缝和露筋缺陷普查', '管根施工缝螺杆眼和冷缝渗漏路径检查', '渗漏点编号定位和注浆封堵或修补处理', '修补后闭水淋水复查和潮湿点复测', '外观渗漏销项清单和主体防水验收移交'],
  '01-07-02-P03': ['后浇带垃圾积水浮浆和松散混凝土清理', '后浇带钢筋除锈整理和搭接锚固复核', '止水钢板止水带施工缝界面和止水节点复核', '模板封闭微膨胀混凝土浇筑条件确认', '封闭后养护龄期和强度资料跟踪', '二次闭水检查和淋水渗漏整改闭合'],
  '01-02-14-P07': ['试验锚杆编号龄期和注浆强度资料复核', '千斤顶压力表和位移计校验证书核验', '分级加载抗拔读数和位移稳定记录', '锁定荷载张拉顺序和锚具状态复核', '异常锚杆补强复测和检测报告闭合'],
  '01-07-03-P05': ['注浆孔编号渗漏路径和封堵范围确认', '浆液配比凝胶时间和压力表校验复核', '分序注浆压力流量和返浆状态记录', '串浆冒浆或压力异常处置和补浆复核', '防水效果复查和渗漏销项资料闭合'],
  '02-03-06-P05': ['管节点坡口间隙错边量和定位线复核', '焊材烘干焊工证和焊接工艺参数核对', '定位焊正式焊层间温度和焊接参数记录', '焊缝外观成型和无损检测委托复核', '返修复探和焊接资料验收闭合'],
  '06-03-06-P04': ['执行机构编号控制模块和阀位清单核对', '电源接线反馈端子和接地状态测试', '手自动启闭复位和动作时间记录', '消防主机图形显示和现场反馈一致性复核', '反馈异常接线错误和复位失败整改复测'],
  '06-05-10-P02': ['支路风阀初始开度和设计风量清单复核', '典型房间风口风量和噪声测点实测', '支路平衡阀逐轮调整和偏差记录', '设计风量偏差复测和末端风量均衡确认', '空调风量平衡记录签认和参数移交'],
  '06-05-10-P05': ['风机盘管编号房间点位和新风支路清单核对', '新风支路风量和风机盘管送风量实测', '供回水温差冷凝水排放和过滤网状态复查', '温控器响应阀门开闭和风速档位测试', '偏差末端整改复测和末端参数移交'],
  '06-07-11-P02': ['洁净区房间静态动态状态和压差边界确认', '送回排风量逐房间平衡和测点记录', '压差梯度逐级测试和报警阈值复核', '门缝回风夹道泄漏和气流组织异常排查', '压差超差整改复测和洁净调试资料闭合'],
  '06-08-07-P02': ['清洁滤毒隔绝三种模式阀位清单核对', '密闭阀过滤吸收器和转换阀门切换测试', '风量压差和气流方向记录复核', '手电动转换应急电源和联锁状态测试', '模式切换异常整改复测和人防通风资料闭合'],
  '06-10-03-P04': ['冷凝水冲洗分段和排放路径确认', '临时封堵拆除管内杂物和坡向复核', '分段通水冲洗和末端排水观察记录', '堵塞倒坡渗漏或积水点整改复测', '冷凝水冲洗记录和吊顶封板接口签认'],
  '06-20-04-P03': ['AHU冷热源水泵风机阀门顺控点表冻结', '启停顺序联锁条件和保护逻辑配置', '风机水泵阀门模拟联动和反馈状态验证', '异常停机故障报警和回退逻辑测试', '顺控参数版本备份和调试签认'],
  '06-20-04-P04': ['报警阈值表趋势采样周期和图形界面清单核对', '传感器执行器点位绑定和地址映射配置', '报警触发历史曲线和趋势采集验证', '错点漏点离线点排查和参数修正复测', '图形界面采集调试记录和版本备份移交'],
  '06-20-02-P05': ['执行器阀位清单和DDC回路地址核对', '就地远程手自动切换命令与反馈状态测试', '断电复电后阀门安全位限位和报警状态记录', '联锁失败反向动作或超时点位整改复测', '测试截图趋势记录和执行机构交接签认'],
  '06-20-04-P02': ['网关设备清单协议版本和通讯地址核对', '点表寄存器倍率单位和读写权限映射复核', '在线采集断线离线重连恢复和数据补传测试', '错点掉线超时和数据异常点整改复测', '协议映射表日志截图和网关配置备份移交'],
  '07-03-01-P03': ['保护装置型号整定单和供电干线回路编号核对', 'CT/PT变比动作值延时和上下级级配复核', '试验仪接线模拟故障注入和跳闸反馈记录', '误动拒动定值偏差和回路接线问题整改复测', '保护试验报告定值单和送电放行签认'],
  '07-03-01-P06': ['供电干线负载边界回路清单和测点编号确认', '分段送电后电流电压温升和相序运行记录', '端子发热压降异常保护告警和负荷不平衡排查', '异常回路整改后复测和连续运行数据比对', '负载运行报告问题销项和运维交接签认'],
  '08-01-03-P04': ['子系统接口清单协议版本和端点地址核对', '点表字段数据字典和采集频率映射复核', '接口连通鉴权心跳和异常重连测试记录', '数据上传时间戳状态值和平台入库一致性比对', '丢包延迟字段错配问题整改复测和接口报告签认'],
  '08-04-05-P03': ['测试拓扑核心接入链路和端口清单确认', '网络测试仪测点VLAN和QoS策略复核', '吞吐时延丢包抖动和并发压力测试记录', '瓶颈端口策略阻断或链路错误整改复测', '性能基线报告配置备份和网络调试签认'],
  '08-05-07-P04': ['抽测端口清单房间插座和配线架编号核对', '跳线模块VLAN/IP和PoE供电状态复核', '终端到核心交换端到端连通速率和认证测试', '错线错标端口策略和链路衰减问题整改复测', '端口映射表测试截图和资产清册签认'],
  '08-16-05-P08': ['安防联动场景清单和触发条件矩阵确认', '摄像机门禁报警防区和平台工单对象核对', '入侵强开断网断电等场景触发与响应记录', '漏联动误报警录像缺失和权限异常整改复测', '演练报告处置闭环和安防系统移交签认'],
  '08-17-03-P02': ['一键报警点位按钮编号和事件类型清单核对', '报警触发定位信息工单生成和通知渠道测试', '平台弹窗短信语音APP推送和确认回执记录', '误报漏报通知失败和事件字段缺失整改复测', '事件日志截图证据和应急响应调试签认'],
  '08-18-10-P05': ['门禁视频动环工单平台接口和账号权限核对', '刷卡异常门磁摄像联动和动环告警场景测试', '告警事件录像片段工单流转和权限审计记录', '录像缺失工单未生成或越权访问问题整改复测', '联调报告配置备份和机房运维交接签认'],
  '10-03-03-P05': ['梳齿板围裙板急停扶手入口安全开关清单核对', '各安全开关安装位置间隙和复位状态检查', '单点触发停梯报警显示和控制柜反馈测试', '联动失效误动作或复位异常问题整改复测', '安全开关联动测试记录和监督检验资料签认'],
  '10-02-12-P08': ['监督检验问题清单责任单位和整改期限确认', '门锁安全回路液压压力和运行缺陷逐项定位', '整改过程影像材料更换和参数调整记录归集', '监检缺陷复验复测数据和报告编号核对', '整改销项签认使用登记资料和移交闭合'],
  '08-05-07-P05': ['端口VLAN IP地址SSID和安防点位映射核对', '语音数据无线和安防链路端到端测试', 'PoE负载漫游切换和视频码流稳定性验证', '弱链路丢包覆盖盲区和端口错配整改复测', '业务链路测试报告和资产映射签认'],
  '02-01-03-P12': ['后浇带封闭龄期强度和设计变更条件复核', '后浇带基层凿毛清理和钢筋除锈整理检查', '止水节点模板封闭和微膨胀混凝土材料核验', '分段浇筑振捣养护和旁站影像记录', '封闭后裂缝渗漏复查和缺陷修补闭合', '后浇带封闭资料验收和后续抗渗试压放行'],
  '02-01-05-P12': ['后浇带封闭龄期强度和装配节点条件复核', '预制构件边界后浇带清理和钢筋接头整理', '止水节点封仓模板和微膨胀混凝土材料核验', '分段浇筑振捣养护和旁站影像记录', '封闭后裂缝渗漏复查和缺陷修补闭合', '后浇带封闭资料验收和后续抗渗试压放行'],
  '02-01-06-P20': ['浆锚孔道清理通畅和孔深孔径复核', '钢筋插入长度搭接长度和定位偏差检查', '封仓分区密封状态和漏浆风险复核', '灌浆料批次流动度温度和搅拌时间确认', '灌浆压力流量出浆状态和连续施工记录', '出浆封堵养护试块报告和隐蔽验收闭合'],
  '04-01-02-P03': ['阴阳角穿屋面管根和女儿墙节点清单复核', '基层干燥度平整度和圆弧处理检查', '附加层材料批次搭接宽度和铺贴方向确认', '节点附加层施工收头密封和压实检查', '穿屋面节点淋水或蓄水复查和缺陷整改', '隔汽层节点隐蔽影像和验收移交签认'],
  '05-05-02-P01': ['设备基础轴线标高减振和机房运输路径复核', '水电自控接口管线阀组和检修空间清单核对', '循环泵补水泵膨胀罐基础预埋件和排水条件检查', '设备就位前接口偏差整改和安装放行签认', '单机试运行前保护接地和阀门状态复核', '机房设备基础接口移交记录和问题闭合'],
  '07-01-07-P05': ['电缆终端屏蔽层接地方式和设计要求复核', '相序标识芯线编号和接地端子位置核对', '屏蔽层剥切搭接压接和接地连续性检查', '相序核对绝缘测试和耐压前状态确认', '错相接地不良问题整改和复测记录', '接地相序测试报告和送电前验收签认'],
  '09-01-02-P05': ['幕墙开启扇和固定扇密封胶条批次复核', '竖横缝耐候胶连续性和宽深比检查', '排水腔等压腔通畅和泄水孔抽查', '气密水密节点缺陷现场标识和原因记录', '节点密封整改复测和影像闭合'],
  '09-01-02-P08': ['现场淋水分区楼层轴线和样板段确认', '喷淋压力流量时长和观察点布置', '开启扇固定扇气密水密检测点位布置', '室内渗漏巡查和渗漏点定位记录', '密封整改二次复测和销项影像闭合', '检测记录报告编号和验收移交归档'],
  '02-04-05-P01': ['钢筋骨架翻样料单直径长度和数量复核', '主筋箍筋间距弯钩锚固和接头形式检查', '分节编号吊点加强筋和防变形措施确认', '加工偏差不合格件标识返修和复测', '钢筋骨架加工验收记录和入管作业交接'],
  '02-04-05-P02': ['钢管内壁浮锈油污焊渣和杂物清理检查', '管内照明通风和作业安全条件复核', '内壁障碍物焊瘤错边和积水问题排查', '清理后影像记录和隐蔽检查资料归集', '内壁清洁验收签认和骨架入管放行'],
  '02-04-05-P03': ['骨架分节吊装顺序吊点和溜绳措施复核', '入管过程骨架变形碰撞和卡阻风险控制', '骨架接长连接质量和定位筋状态检查', '管内标高轴线和骨架居中状态复测', '吊装入管隐蔽影像和偏差整改闭合'],
  '02-04-05-P04': ['保护层垫块定位筋规格间距和固定方式复核', '骨架居中偏差管壁净距和端部位置实测', '浇筑导管空间和混凝土下料通道检查', '定位松动偏位和垫块脱落问题整改', '定位隐蔽验收记录和混凝土浇筑接口签认'],
  '02-04-05-P05': ['管口临时封闭材料和防落物措施确认', '雨水杂物进入风险和成品保护范围检查', '后续浇筑前开启复查和管内异物排查', '封闭破损污染和积水问题整改', '管口保护交接记录和浇筑前复核签认'],
  '02-04-05-P06': ['钢筋骨架轴线标高保护层和端部锚固复测', '隐蔽验收影像检测尺量和偏差记录归集', '偏心变形污染和定位缺陷整改复查', '混凝土浇筑前管内清洁和骨架稳定性确认', '钢管内钢筋骨架验收资料和浇筑放行签认'],
  '05-05-03-P01': ['散热器型号片数规格和设计房间编号核对', '外观磕碰砂眼变形和防腐涂层检查', '合格证检测报告和进场批次资料复核', '不合格散热器隔离退场或返修复验', '进场验收记录和安装楼层移交签认'],
  '05-05-03-P02': ['支架托钩位置标高和墙体基层承载复核', '钻孔埋设防腐和固定牢固性检查', '支架间距水平度和成排一致性复测', '松动偏位和基层破损问题整改', '支架托钩验收记录和散热器安装放行'],
  '05-05-03-P03': ['散热器距墙距地水平度和垂直度复核', '挂装固定防松措施和成排观感检查', '与窗台墙面管线和检修空间冲突排查', '安装偏差渗漏隐患和成品污染整改', '散热器安装自检记录和支管连接交接'],
  '05-05-03-P04': ['阀门温控阀放气阀型号方向和可操作性核对', '丝扣密封接口和阀件启闭状态检查', '放气阀高点位置和排气通畅性复核', '阀件漏装反装松动和渗漏隐患整改', '阀门放气阀安装记录和系统试压接口签认'],
  '05-05-03-P05': ['供回水支管坡度走向和管径编号复核', '管道连接接口密封支架和套管状态检查', '支管与散热器阀门连接应力和检修空间复测', '接口渗漏坡度倒坡和保温碰撞问题整改', '支管连接隐蔽或自检记录和试压放行'],
  '05-05-03-P06': ['散热器组对接口垫片和紧固顺序复核', '组对试压压力表校验稳压时间和压降记录', '接口渗漏砂眼和组片变形问题标识', '泄压返修补漆和二次试压复验', '组对试压记录和批量安装资料归集'],
  '05-05-03-P07': ['散热器表面除锈清洁和基层干燥度检查', '防腐底漆面漆材料批次和涂刷遍数复核', '阀门接口支架和破损涂层补刷检查', '污染流坠漏涂和磕碰缺陷整改', '防腐表面处理验收记录和成品保护交接'],
  '05-05-03-P08': ['系统试压分区阀门隔离和散热器满水排气确认', '升压稳压压降和接口巡检记录归集', '冲洗流向排污口和末端浊度观察记录', '漏点堵塞气堵和阀门异常整改复验', '试压冲洗资料和供暖调试接口签认'],
  '05-05-03-P09': ['热力平衡分区支路和末端房间测点清单确认', '阀门初始开度温度压力和流量数据采集', '末端温差室温和散热不均问题排查', '平衡阀调节复测和异常支路整改', '热力平衡调试记录和运行参数移交签认'],
  '05-07-03-P02': ['闭水井段上下游封堵位置和封堵可靠性检查', '试验水位标尺满水高度和观察时长确认', '水位降渗漏点和接口渗水过程记录', '超限渗漏开挖返修或井室修补复验', '闭水试验记录影像和监理见证签认'],
  '05-07-03-P03': ['井室池壁管口接口和流槽范围清单核对', '渗水潮湿裂缝和砂浆空鼓缺陷定位', '井盖井圈踏步和防坠设施安装状态检查', '渗漏修补防腐补刷和二次观察复验', '井池接口检查记录和整改销项闭合'],
  '05-07-03-P04': ['通水水源流量排放路径和下游接纳条件确认', '上游放水下游出水和流向连续性观察记录', '检查井水流滞留倒灌和漂浮杂物排查', '排放不畅倒流和接口冒水问题整改', '通水排放试验记录和管网运行交接签认'],
  '05-07-03-P05': ['管底标高井底高程和设计坡度资料核对', '水准复测井段坡向坡差和倒坡位置记录', '沉降回填变形和管道起伏异常排查', '倒坡积水井底高程偏差整改复测', '坡度复核成果和排水调试资料归档'],
  '05-07-03-P06': ['通球球径材质试验路径和收球位置确认', '通球通水过程淤堵卡阻和滞留点记录', '检查井沉泥杂物和管内障碍物排查', '清掏疏通返修和复通复球验证', '通畅性复测记录和管网移交问题清单闭合'],
  '05-07-03-P07': ['渗漏堵塞问题编号位置和责任界面确认', '返修方法材料和开挖恢复条件复核', '整改后闭水通水通球复验结果记录', '反复渗漏沉降和接口错位风险复查', '整改复验签认和排水系统验收放行'],
  '05-07-03-P08': ['室外排水试验资料闭水通水通球记录核对', '井段编号竣工图流向和现场标识一致性复核', '遗留问题销项和运维巡检边界确认', '资料缺项错项和影像缺失补正闭合', '室外排水试验调试验收和移交签认'],
  '06-11-03-P04': ['冷热水冲洗回路阀门开闭和旁通状态确认', '循环泵运行流量流速和排污路径观察记录', '末端排气排污和过滤器前后压差检查', '浊度杂质超限和死角支路冲洗整改', '冷热水循环冲洗记录和系统调试接口签认'],
  '06-11-03-P05': ['过滤器拆洗范围旁通隔离和泄水条件确认', '滤网杂质沉积堵塞和破损状态检查', '排污水颜色浊度和颗粒物观察记录', '滤网复装密封旁通恢复和泄漏复查', '过滤器拆洗排污记录和复冲洗放行'],
  '06-11-03-P06': ['水质取样点位浊度标准和检测方法确认', '排污水透明度杂质和末端代表性记录', '不合格支路重复冲洗和过滤器复查', '水质浊度复测结果和异常原因闭合', '水质复测记录和冷热水冲洗验收资料归集'],
  '06-11-03-P09': ['冷热水冲洗分区记录和阀门状态清单核对', '冲洗水质过滤器清理和问题整改资料复核', '系统补水排气压力恢复和运行边界确认', '资料缺项漏项和异常支路复测闭合', '冷热水冲洗验收签认和调试移交'],
  '06-12-03-P04': ['冷却水冲洗回路冷却塔旁通和阀门状态确认', '循环泵运行流量流速和排污连续性记录', '冷却塔集水盘管路低点和过滤器杂质观察', '堵塞沉积和旁通未恢复问题整改复测', '冷却水循环冲洗记录和水处理接口签认'],
  '06-12-03-P05': ['冷却塔集水盘排污清理和补水条件确认', '滤网过滤器填料杂质和沉积物检查', '清理后循环水浊度和排污口观察记录', '堵塞破损和残留杂质整改复查', '集水盘过滤器清理记录和复冲洗放行'],
  '06-12-03-P06': ['冷却水排污取样点和浊度观察标准确认', '排污水杂质颜色泡沫和悬浮物记录', '水质不合格支路重复冲洗和过滤器复查', '复测合格数据和异常处置资料归集', '冷却水水质复测记录和水处理投加接口签认'],
  '06-12-03-P09': ['冷却水冲洗分区记录和冷却塔清理资料核对', '排污浊度过滤器复装和水处理初投加条件复核', '阀门恢复补水排气和系统压力状态确认', '遗留堵塞水质异常和资料缺项整改闭合', '冷却水冲洗验收签认和调试移交'],
  '06-13-03-P04': ['地源侧埋地回路编号阀门开闭和冲洗边界确认', '集分水器分支循环流量和排污连续性记录', '回路通畅性气堵杂质和过滤器压差检查', '异常回路反冲洗复冲洗和阀门状态复核', '地源侧循环冲洗记录和换热回路移交签认'],
  '06-13-03-P05': ['地源侧过滤器拆洗旁通隔离和泄水条件确认', '集分水器过滤器杂质沉积和堵塞情况检查', '排污水浊度回路气堵和杂物观察记录', '滤网复装密封泄漏和异常回路整改复查', '过滤器拆洗排污记录和地源回路复冲洗放行'],
  '06-13-03-P06': ['地源侧水质取样点浊度和回路代表性确认', '排污水杂质泥砂和透明度过程记录', '异常回路重复冲洗和阀门过滤器复核', '水质浊度复测结果和不合格处置闭合', '地源侧水质复测记录和系统调试接口签认'],
  '06-13-03-P09': ['地源侧冲洗回路清单和分支记录核对', '过滤器拆洗水质复测和异常回路整改资料复核', '补水排气压力恢复和集分水器阀位状态确认', '资料缺项和回路标识不一致问题补正', '地源侧管网冲洗验收签认和热泵调试移交'],
  '06-14-03-P04': ['水源侧取退水边界阀门状态和换热器保护确认', '循环泵运行流量排污路径和取水过滤状态记录', '换热器前端杂质堵塞和排污水浊度观察', '堵塞泄漏水质异常和旁通未恢复问题整改', '水源侧循环冲洗记录和换热器投用接口签认'],
  '06-14-03-P05': ['取水过滤器换热器前端隔离泄水条件确认', '滤网杂质泥砂堵塞和压差状态检查', '清理后排污水浊度和过滤器密封复查', '堵塞破损泄漏和残留杂质问题整改', '过滤器换热器前端清理记录和复冲洗放行'],
  '06-14-03-P06': ['水源侧排污取样点水质指标和观察标准确认', '排污水泥砂杂质浊度和异味过程记录', '水质异常支路重复冲洗和取水过滤器复查', '复测合格数据和异常处置资料归集', '水源侧水质复测记录和热泵调试接口签认'],
  '06-14-03-P09': ['水源侧冲洗分区取退水边界和记录清单核对', '过滤器清理水质复测和换热器保护资料复核', '补水排气压力恢复和阀门状态确认', '遗留堵塞水质异常和资料缺项整改闭合', '水源侧管网冲洗验收签认和运行调试移交'],
  '08-19-07-P01': ['接地测试范围测试点编号和系统边界确认', '断开并联回路等电位连接和测试隔离条件复核', '测试仪器校验证书天气土壤状态和安全措施检查', '测试方案阈值判定标准和记录表单交底', '接地测试条件签认和现场测试放行'],
  '08-19-07-P02': ['接地极引下线测试点和回路编号核对', '辅助接地极布置距离和测试线连接状态检查', '接地电阻实测值环境条件和仪器量程记录', '超限点位复测降阻整改和二次检测', '接地电阻测试报告和点位清册归档'],
  '08-19-07-P03': ['总等电位局部等电位和金属管线连接清单核对', '导通测试端子搭接跨接和连接紧固状态检查', '导通电阻实测值和抽测比例记录', '断点虚接漏接和标识缺失问题整改', '等电位导通测试记录和隐蔽资料闭合'],
  '08-19-07-P04': ['SPD型号级别安装位置和前级保护配置核对', 'SPD状态指示遥信接点和接地连接检查', '防雷分区配电箱回路和浪涌保护参数复核', '失效告警接线错误和接地不良问题整改', 'SPD状态测试记录和设备台账移交'],
  '08-19-07-P05': ['屏蔽范围屏蔽层搭接接地和端接方式核对', '干扰源敏感设备和测试工况边界确认', '屏蔽连续性搭接电阻或干扰复测数据记录', '屏蔽破损端接松动和接地不良问题整改', '屏蔽效能或干扰复测报告和整改闭合签认'],
  '08-19-07-P06': ['接地等电位SPD和屏蔽测试问题清单汇总', '缺陷位置责任单位整改措施和复测标准确认', '整改过程影像材料和测试数据资料归集', '复测合格项逐项销号和遗留风险说明', '问题整改闭合记录和系统调试复验签认'],
  '08-19-07-P07': ['测试报告编号测试点位和系统图一致性核对', '仪器校验证书测试日期天气和判定标准复核', '接地电阻导通SPD屏蔽测试数据完整性检查', '报告缺项异常值和签章缺失问题补正', '测试报告复核签认和竣工资料归档'],
  '08-19-07-P08': ['防雷接地系统调试范围和联调条件确认', '接地等电位SPD屏蔽测试结果综合复核', '系统运行告警遥信和维护标识检查', '调试遗留问题销项和运维交接边界确认', '系统调试验收记录和运维资料移交签认'],
  '10-01-07-P01': ['对重框架部件编号规格和垂直度基准复核', '框架连接紧固防松和焊接外观检查', '框架导向面平整度和导靴安装基面复测', '组装偏差松动变形和防腐损伤整改', '对重框架组装记录和装块作业交接'],
  '10-01-07-P02': ['对重块数量重量规格和排列顺序核对', '压板挡块防脱装置和紧固状态检查', '对重块装入间隙晃动和防松措施复测', '缺块错装松动和碰擦风险整改', '对重块固定记录和平衡关系复核签认'],
  '10-01-07-P03': ['对重导靴型号安装位置和导轨间隙复核', '导靴压板紧固润滑和磨耗状态检查', '对重运行导向顺畅性和偏磨风险复测', '导靴偏位松动和间隙超限整改', '对重导靴安装记录和运行试验交接'],
  '10-01-07-P04': ['井道全行程对重运行间隙测点清单确认', '对重与井道壁导轨支架轿厢部件距离复测', '缓冲器距离极限位置和防碰撞状态检查', '间隙不足碰擦和限位风险整改复验', '对重运行间隙检查记录和监督检验资料归集'],
  '10-01-07-P05': ['轿厢对重平衡关系和基准线复核范围确认', '导轨垂直度导靴间隙和对重运行中心线检查', '极限位置缓冲距离和安全空间复测', '基准偏差碰擦风险和导靴调整问题整改', '安装基准线复核记录和安全功能测试交接'],
  '10-01-07-P06': ['对重运行安全功能测试工况和保护装置状态确认', '低速全行程运行碰擦异响和导向状态记录', '限位缓冲和对重防脱防碰措施复核', '测试异常整改复测和遗留问题销项', '安全功能测试记录和监督检验资料交接'],
  '10-01-08-P01': ['限速器铭牌铅封动作速度和安装位置核对', '钢丝绳走向张紧轮垂直度和张紧力检查', '限速器电气开关和机械动作状态测试', '绳轮偏磨张紧不足和开关异常整改', '限速器安装测试记录和安全钳联动接口签认'],
  '10-01-08-P02': ['安全钳型号楔块间隙和拉杆连接状态核对', '安全钳安装位置水平度和导轨配合间隙检查', '限速器联动动作和复位状态测试', '楔块偏磨动作卡滞和联动失效问题整改', '安全钳安装调整记录和联动功能检验交接'],
  '10-01-08-P03': ['缓冲器型号行程油位或弹性件状态核对', '基础标高水平度中心偏差和固定螺栓检查', '轿厢对重缓冲距离和复位功能复测', '油位不足偏位松动和复位异常整改', '缓冲器安装记录和监督检验资料归集'],
  '10-01-08-P04': ['极限开关限位开关安装位置和动作距离复核', '开关支架固定导线接线和安全回路状态检查', '上下端站减速限位极限动作顺序测试', '动作距离偏差误动作和接线错误整改', '极限限位开关测试记录和运行试验签认'],
  '10-01-08-P05': ['限速器安全钳缓冲器和限位回路联动条件确认', '安全回路闭合断开和故障保护动作测试', '轿厢低速试运行和安全部件响应记录', '联动异常复位失败和报警缺失问题整改', '安全部件联动检验记录和监督检验放行'],
  '10-02-07-P01': ['平衡重框架部件编号规格和垂直度基准复核', '框架连接紧固防松和焊接外观检查', '框架导向面平整度和导靴安装基面复测', '组装偏差松动变形和防腐损伤整改', '平衡重框架组装记录和装块作业交接'],
  '10-02-07-P02': ['平衡重块数量重量规格和排列顺序核对', '压板挡块防脱装置和紧固状态检查', '平衡重块装入间隙晃动和防松措施复测', '缺块错装松动和碰擦风险整改', '平衡重块固定记录和平衡关系复核签认'],
  '10-02-07-P03': ['平衡重导靴型号安装位置和导轨间隙复核', '导靴压板紧固润滑和磨耗状态检查', '平衡重运行导向顺畅性和偏磨风险复测', '导靴偏位松动和间隙超限整改', '平衡重导靴安装记录和运行试验交接'],
  '10-02-07-P04': ['轿厢平衡重基准线和运行中心线复核范围确认', '导轨垂直度导靴间隙和液压梯井道空间检查', '极限位置缓冲距离和防碰撞状态复测', '基准偏差碰擦风险和导靴调整问题整改', '安装基准线复核记录和安全功能测试交接'],
  '10-02-07-P05': ['平衡重运行安全功能测试工况和保护装置状态确认', '低速全行程运行碰擦异响和导向状态记录', '缓冲距离限位状态和防脱防碰措施复核', '测试异常整改复测和遗留问题销项', '安全功能测试记录和监督检验资料交接'],
  '10-02-08-P01': ['限速器铭牌铅封动作速度和安装位置核对', '钢丝绳走向张紧轮垂直度和张紧力检查', '限速器电气开关和机械动作状态测试', '绳轮偏磨张紧不足和开关异常整改', '限速器安装测试记录和安全钳联动接口签认'],
  '10-02-08-P02': ['安全钳型号楔块间隙和拉杆连接状态核对', '安全钳安装位置水平度和导轨配合间隙检查', '限速器联动动作和复位状态测试', '楔块偏磨动作卡滞和联动失效问题整改', '安全钳安装调整记录和联动功能检验交接'],
  '10-02-08-P03': ['限速切断阀型号压力等级和安装方向核对', '液压管路连接密封支架和阀体固定检查', '超速或异常流量动作测试和复位状态记录', '阀体渗漏动作迟滞和信号异常整改', '限速切断阀测试记录和液压安全回路签认'],
  '10-02-08-P04': ['缓冲器型号行程油位或弹性件状态核对', '基础标高水平度中心偏差和固定螺栓检查', '轿厢平衡重缓冲距离和复位功能复测', '油位不足偏位松动和复位异常整改', '缓冲器安装记录和监督检验资料归集'],
  '10-02-08-P05': ['限速器安全钳限速切断阀和缓冲器联动条件确认', '液压安全回路闭合断开和保护动作测试', '轿厢低速试运行和安全部件响应记录', '联动异常复位失败和报警缺失问题整改', '安全部件联动检验记录和监督检验放行'],
  '06-06-08-P03': ['精密空调减振基础型号标高和承载条件复核', '机组就位水平度减振垫压缩量和固定螺栓检查', '冷媒水管电源和检修空间接口碰撞排查', '基础偏差振动传递或螺栓松动问题整改复测', '精密空调基础安装记录和机组接管放行签认'],
  '06-06-08-P04': ['冷媒管气密试验压力等级和保压时长确认', '氮气升压分段稳压真空泵极限真空度记录', '焊口阀件和保温前接口泄漏点排查', '泄漏点返修抽真空和二次保压复测', '冷媒管气密真空干燥记录和充注放行签认'],
  '06-06-08-P06': ['漏水检测绳电源回路和报警点位清单核对', '水浸探头控制线和动环接口接线状态检查', '模拟漏水报警BMS弹窗和声光反馈测试', '漏报误报或点位错绑问题整改复测', '漏水检测报警联动截图和点表签认完成'],
  '06-06-08-P07': ['动环BMS点表地址协议和量程倍率核对', '温湿度漏水高低压报警点逐项联调', '离线断线恢复和告警升级策略验证', '错点漏点趋势异常和权限问题整改复测', 'BMS接口联调记录配置备份和移交签认'],
  '06-06-08-P08': ['送回风口位置冷热通道和机柜负荷边界复核', '风量温湿度测点布置和短路回流烟雾检查', '回风温差地板漏风和冷通道封闭状态记录', '气流短路或风量不足问题封堵整改复测', '气流组织风量复测记录和运行参数签认'],
  '06-06-08-P10': ['主备机切换场景电源和控制权限确认', '主机故障模拟备用机启动和报警反馈记录', '切换期间温湿度波动和恢复时间连续记录', '切换失败报警延迟或参数漂移问题整改复测', '主备切换演练记录和运维参数移交签认'],
  '10-01-13-P02': ['慢车运行前安全回路门锁和检修开关状态确认', '轿厢井道低速全行程运行异响碰擦观察', '导轨导靴曳引绳和限位开关响应记录', '慢车卡滞抖动或安全回路异常问题整改复测', '慢车运行检查记录和快车调试放行签认'],
  '10-01-13-P05': ['层门轿门门锁回路和门区信号清单核对', '门锁闭合开门保护和光幕安全触板逐层测试', '安全回路断开复位和控制柜故障显示记录', '门锁接触不良误动作或回路断点整改复测', '门锁安全回路测试记录和监检资料归集'],
  '10-01-13-P06': ['制动器间隙抱闸力和限速器铅封状态复核', '限速器动作安全钳夹轨和电气联锁试验', '制动器释放制停距离和复位状态记录', '联动失败制停偏差或开关异常整改复测', '制动器限速器安全钳联动试验签认完成'],
  '10-01-13-P07': ['轿厢对重平衡系数和载荷试验工况确认', '空载半载满载电流速度和平层数据记录', '曳引能力上行制动和防滑移试验执行', '载荷偏差打滑或制动异常问题整改复测', '平衡系数曳引能力载荷试验报告签认'],
  '10-01-13-P08': ['监督检验问题编号责任单位和整改期限确认', '门锁制动限速器载荷和平层缺陷逐项定位', '整改材料更换参数调整和现场影像记录', '监检缺陷复验数据和整改报告编号核对', '监督检验整改销项和使用登记接口签认'],
  '10-02-12-P02': ['液压梯慢车前安全回路门锁和油泵状态确认', '轿厢低速全行程运行导轨导靴间隙观察', '油泵启动电流阀组动作和限位响应记录', '慢车抖动爬行或液压回路异常整改复测', '液压梯慢车运行检查记录和快车放行签认'],
  '10-02-12-P06': ['液压压力油温和沉降试验工况边界确认', '满载静置压力油温轿厢沉降量连续记录', '阀组泄压油缸密封和再平层响应检查', '沉降超限油温异常或压力波动整改复测', '液压压力油温沉降试验报告签认完成'],
  '10-02-12-P07': ['油管接头阀组和油缸密封检查范围确认', '满载压力试验升压稳压和压降记录', '油管渗漏接头松动和软管变形排查', '泄漏点返修换件和二次满载压力复测', '油管泄漏满载压力试验记录归集签认'],
  '06-09-09-P02': ['真空主机负压风量测点和仪表校准确认', '主机启动稳定负压风量电流和温升记录', '不同服务分区末端开启对主机负压影响复测', '负压不足风量波动或电流异常整改复测', '真空主机负压风量测试记录和调试放行'],
  '06-09-09-P04': ['快速接口编号密封圈和末端房间清单核对', '接口启闭灵活性锁扣密封和吸力逐点测试', '软管连接状态末端负压和吸尘效果记录', '接口漏气卡涩或末端吸力不足整改复测', '快速接口末端吸力检查记录和分区签认'],
  '06-09-09-P05': ['集尘桶滤尘器压差和报警阈值清单核对', '滤尘器清灰集尘桶满载和门盖密封测试', '高压差满桶报警和主机联锁停机模拟', '报警失效滤芯堵塞或密封不严整改复测', '集尘滤尘报警联动测试记录和移交签认'],
  '06-09-09-P07': ['吸尘效果问题点位和责任界面确认', '末端吸力管网漏气和滤尘压差复测定位', '接口密封滤芯清理或管网补漏整改记录', '整改后代表房间吸尘效果和负压复测', '吸尘效果整改复测销项和调试报告签认'],
  '06-09-09-P08': ['真空吸尘系统验收范围和测试工况确认', '主机管网末端接口报警和噪声振动综合测试', '负压风量吸尘效率和报警联动记录复核', '验收缺陷整改复测和异常工况复盘', '系统压力试验调试验收记录和运维移交签认'],
  '06-03-07-P02': ['排烟风机正压送风机点位和启动逻辑核对', '消防主机手自动启动和现场控制箱反馈测试', '风机启动电流运行方向和风阀联动状态记录', '启动失败反馈延迟或反转问题整改复测', '排烟正压风机联动启动测试记录签认'],
  '06-03-07-P03': ['排烟口风速楼梯间压差和测点高度确认', '火灾场景下排烟风量正压送风压力实测', '门开启工况压差保持和补风路径观察', '风量不足压差超差或漏风问题整改复测', '排烟风量楼梯间正压复测报告签认'],
  '06-03-07-P04': ['防火阀排烟阀编号位置和反馈端子核对', '就地手动远程启动复位和动作时间测试', '消防主机图显状态和现场阀位一致性比对', '卡涩无反馈错地址或复位失败问题整改复测', '阀门动作反馈检查记录和联动点表签认'],
  '05-02-04-P02': ['灌水试验管段封堵位置和水位高度确认', '满水观察时间接口管根和立管底部巡查记录', '水位下降渗漏返味和封堵松动问题定位', '渗漏接口返修后重新灌水复验', '灌水试验水位观察记录和监理见证签认'],
  '05-02-04-P03': ['通球试验管段编号球径和试验路径确认', '上游投球下游收球和中途卡阻位置记录', '检查口清扫口开启状态和管内杂物排查', '卡阻管段清掏返修后重复通球复验', '通球试验球径路径记录和资料闭合签认'],
  '05-02-04-P04': ['通水排放水源流量和下游接纳条件确认', '排水立管支管通水流向和排放连续性观察', '地漏检查口和通气管排水响应记录', '倒灌堵塞溢水或排放不畅问题整改复测', '通水排放试验记录和系统运行交接签认'],
  '05-02-04-P06': ['接口渗漏位置编号责任班组和修补方法确认', '渗漏接口拆改重接密封处理和影像记录', '返修后灌水通水或闭水复验数据记录', '反复渗漏倒坡或堵塞风险点复查', '接口渗漏整改复验销项和验收放行签认'],
  '05-02-04-P07': ['排水通畅性检查口功能和抽测点位确认', '检查口开启清通地漏水封和通气效果复测', '代表房间连续排水和末端滞水观察', '检查口失效排水不畅或返臭问题整改复测', '通畅性检查口功能复测记录和移交签认'],
  '05-04-04-P02': ['卫生器具房间编号给排水接口和排放路径核对', '龙头角阀软管和排水接口逐件通水观察', '满流排放地漏响应和台盆下水通畅记录', '渗漏排水慢或接口松动问题整改复测', '通水排水通畅复核记录和房间销项签认'],
  '05-04-04-P03': ['洗面盆浴缸器具编号和盛水高度确认', '溢流口排水口塞盖和排水阀密封状态检查', '盛水观察时间水位变化和下部接口巡检记录', '渗漏塞盖失效或排水阀松动整改复验', '器具盛水试验记录和成品保护签认'],
  '05-04-04-P04': ['坐便器水箱水位浮球和冲洗阀状态核对', '满水保压观察和连续冲洗功能测试', '排污通畅冲洗水量和补水时间记录', '渗漏冲洗无力或水箱异响问题整改复测', '坐便器满水冲洗功能记录和房间签认'],
  '05-04-04-P05': ['存水弯型号水封高度和返臭风险点位确认', '地漏台盆浴缸和坐便器水封逐点复核', '长时间停水后水封保持和排水噪声观察', '水封不足接口返臭或虹吸破坏问题整改复测', '存水弯水封复核记录和住户交付提示签认'],
  '05-04-04-P06': ['接口渗漏排水噪声问题编号和房间责任确认', '软管角阀排水管和固定件整改过程记录', '整改后通水盛水冲洗和噪声复测', '反复渗漏松动返臭或噪声超限复查', '洁具接口问题整改销项和成品保护签认'],
  '05-13-02-P05': ['安全阀压力表温度表型号量程和校验证书核对', '取压点温度套管和仪表阀安装方向检查', '安全阀整定压力压力表指示和报警阈值复核', '仪表偏差取压堵塞或校验过期问题整改', '安全阀压力表仪表安装校验记录签认'],
  '05-13-02-P07': ['热源机房管道冲洗试压排气排污范围确认', '分区升压稳压冲洗流速和排污浊度记录', '过滤器除污器排气阀和低点排污状态检查', '堵塞泄漏气堵或水质异常问题整改复测', '冲洗试压排污水质保护记录和调试放行'],
  '05-13-02-P08': ['热源联锁补水循环保护和报警点表核对', '循环泵补水泵阀门和控制柜启停联调', '低压缺水超温和故障报警场景测试', '联锁失败报警延迟或保护误动作整改复测', '热源联锁报警测试记录和运行参数移交'],
}

function enrichFieldActivitySteps(code: string, processName: string, itemName: string | undefined, steps: string[]) {
  const hardenedSteps = STANDARD_ACTIVITY_STEP_HARDENING_OVERRIDES[code]
  if (hardenedSteps) return hardenedSteps

  const explicitSteps = STANDARD_ACTIVITY_STEP_DEPTH_OVERRIDES[code]
  if (explicitSteps) return explicitSteps

  const minimumStepCount = standardActivityStepMinimumFor(code)
  if (steps.length >= minimumStepCount) return steps
  if (steps.length >= 4) return completeStandardActivitySteps(processName, steps, minimumStepCount)
  const context = `${code} ${itemName ?? ''} ${processName}`
  const isTargetDivision = ['01-', '02-', '03-', '04-', '05-', '06-', '07-', '08-', '09-', '10-'].some((prefix) => code.startsWith(prefix))
  if (!isTargetDivision) return steps
  if (includesAny(processName, ['资料', '归档', '方案', '交底', '签认', '确认记录', '清理维护', '养护'])) return steps

  if (steps.length <= 2 && includesAny(processName, ['参数确认', '配合比确认', '坍落度确认', '样板确认', '相容性确认', '干燥度确认', '施工准备与试验段', '试桩或首件确认', '总平面布置图确认', 'ӿЭȷ', '联动需求确认'])) {
    return unique([
      `${processName}资料条件核查`,
      `${processName}现场样板或试验段复核`,
      `${processName}签认记录闭合`,
    ])
  }

  if (includesAny(context, ['桩', '成孔', '成桩', '沉桩', '钢筋笼', '导管', '清孔', '沉管', '锚杆', '注浆', '喷浆', '旋喷', '搅拌桩', '强夯', '换填', '复合地基'])) {
    return unique([
      `${processName}设备材料和定位复核`,
      `${processName}成孔成桩或注浆过程控制`,
      `${processName}质量检测和参数记录`,
      `${processName}整改验收记录`,
    ])
  }

  if (includesAny(context, ['基坑', '支护', '土钉', '喷锚', '地下连续墙', '围护墙', '内支撑', '冠梁', '腰梁', '开挖', '回填', '降水', '排水'])) {
    return unique([
      `${processName}测量放线和作业条件复核`,
      `${processName}分层分段施工控制`,
      `${processName}监测检测和质量检查`,
      `${processName}整改验收记录`,
    ])
  }

  if (includesAny(context, ['钢筋', '模板', '混凝土', '预应力', '砌体', '构造柱', '圈梁', '过梁', '后浇带', '现浇结构', '装配式', '预制', '构件', '套筒灌浆'])) {
    return unique([
      `${processName}材料机具和作业面复核`,
      `${processName}加工安装或浇筑施工`,
      `${processName}尺寸偏差和隐蔽质量检查`,
      `${processName}验收整改记录`,
    ])
  }

  if (includesAny(context, ['钢结构', '钢管结构', '钢管', '钢构件', '型钢', '高强螺栓', '紧固件', '螺栓', '檩条', '支座', '空间网格', '铝合金', '焊接', '吊装', '无损检测', '防火涂料', '防腐涂料', '防腐涂装', '涂装'])) {
    return unique([
      `${processName}构件材料和工艺条件复核`,
      `${processName}安装焊接或涂装施工`,
      `${processName}连接质量和尺寸偏差检查`,
      `${processName}检测报告和整改闭合`,
      `${processName}验收移交记录`,
    ])
  }

  if (includesAny(context, ['防水', '卷材', '涂膜', '密封', '止水', '保温', '隔热', '绝热', '防腐', '除锈', '涂刷', '屋面', '泛水', '水落口'])) {
    if (includesAny(context, ['人防'])) {
      return unique([
        `${processName}人防防护要求和材料复核`,
        `${processName}基层处理和施工环境确认`,
        `${processName}防腐绝热或节点施工`,
        `${processName}防护功能和质量复查`,
        `${processName}专项验收移交记录`,
      ])
    }
    return unique([
      `${processName}基层材料和节点复核`,
      `${processName}过程施工和搭接收头控制`,
      `${processName}试验检查或隐蔽验收`,
      `${processName}整改闭合和保护移交`,
    ])
  }

  if (includesAny(context, ['木结构', '木构件', '胶合木', '墙体骨架', '楼盖', '屋盖', '防腐防火防虫'])) {
    return unique([
      `${processName}构件材料和防护处理复核`,
      `${processName}安装连接或防护施工`,
      `${processName}节点质量和尺寸偏差检查`,
      `${processName}验收整改记录`,
    ])
  }

  if (includesAny(context, ['门窗', '特种门', '门框', '门扇', '闭门器', '五金', '吊顶', '隔墙', '饰面', '饰面板', '幕墙', '涂饰', '裱糊', '软包', '地面', '抹灰', '瓷砖', '石材', '石板', '陶瓷板', '塑料板', '木板', '玻璃板', '玻璃采光顶', '金属板', '细部', '橱柜', '窗帘盒', '窗台板', '支撑结构', '安装定位放线', '构件安装固定'])) {
    const isCurtainWall = includesAny(context, ['幕墙'])
    const stepsForFinish = [
      `${processName}基层材料和排版样板复核`,
      `${processName}安装铺贴或涂装施工`,
      `${processName}节点收口和观感实测检查`,
      `${processName}整改闭合和成品保护`,
    ]
    return isCurtainWall
      ? unique([...stepsForFinish.slice(0, 3), `${processName}防雷防火和性能复核`, stepsForFinish[3]])
      : unique(stepsForFinish)
  }

  if (includesAny(context, ['节能', '气密性', '传热系数', '可再生能源', '太阳能', '监测系统'])) {
    return unique([
      `${processName}节能参数和材料设备复核`,
      `${processName}安装施工或检测实施`,
      `${processName}性能数据和报告核查`,
      `${processName}整改验收记录`,
    ])
  }

  if (includesAny(context, ['消防', '火灾自动报警', '气体灭火', '防排烟卷帘', '消防广播', '喷淋', '消火栓'])) {
    return unique([
      `${processName}图纸点表和联动关系复核`,
      `${processName}材料设备和作业面复核`,
      `${processName}安装调试或功能测试`,
      `${processName}问题整改复测`,
      `${processName}验收移交记录`,
    ])
  }

  if (includesAny(context, ['洁净', '净化', '高效过滤器'])) {
    return unique([
      `${processName}洁净条件和材料设备复核`,
      `${processName}安装施工和封闭保护`,
      `${processName}洁净度或功能测试`,
      `${processName}整改复测和记录闭合`,
      `${processName}验收移交记录`,
    ])
  }

  if (includesAny(context, ['人防', '防爆波', '过滤吸收器', '密闭阀'])) {
    return unique([
      `${processName}人防图纸和预埋条件复核`,
      `${processName}设备安装和密闭连接`,
      `${processName}防护功能和隐蔽检查`,
      `${processName}整改复测和记录闭合`,
      `${processName}专项验收移交`,
    ])
  }

  if (code.startsWith('10-') || includesAny(context, ['电梯', '导轨', '轿厢', '对重', '层门', '曳引', '驱动主机', '液压', '门立柱', '门套', '门头', '桁架', '悬挂装置', '随行电缆', '补偿装置', '安全部件'])) {
    return unique([
      `${processName}土建交接和基准线复核`,
      `${processName}部件安装调整`,
      `${processName}安全回路和运行间隙复核`,
      `${processName}试运行和整改记录`,
    ])
  }

  if (includesAny(context, ['试验', '检测', '测试', '调试', '联调', '试运行', '试运转', '试压', '冲洗', '核相', '送电', '校验', '检漏', '绝缘'])) {
    return unique([
      `${processName}方案或条件确认`,
      `${processName}仪器和测试点复核`,
      `${processName}测试执行和过程记录`,
      `${processName}问题整改闭合和报告`,
    ])
  }

  if (includesAny(context, ['风管', '风口', '风阀', '防火阀', '排烟阀', '送风', '排烟', '空调', '通风', '净化', '防排烟', '吸风罩', '吸尘罩', '排油烟', '补风'])) {
    return unique([
      `${processName}材料设备和支吊架复核`,
      `${processName}预制组装或吊装连接`,
      `${processName}标高走向和严密性检查`,
      `${processName}自检整改记录`,
    ])
  }

  if (includesAny(context, ['管道', '管线', '管路', '管网', '通气管', '透气帽', '支吊架', '支架', '阀门', '水泵', '水箱', '水处理', '冷却水', '冷凝水', '制冷剂', '换热', '锅炉', '散热器', '地暖', '分集水器', '喷淋', '喷头', '报警阀', '水流指示器', '卫生器具', '存水弯', '检查口', '清扫口', '布水器', '蓄冰装置', '燃气', '燃油', '接口安装', '安全附件', '集热器'])) {
    return unique([
      `${processName}支吊架套管和坡度复核`,
      `${processName}管段预制与接口连接`,
      `${processName}试压冲洗或功能复核`,
      `${processName}标识和自检记录`,
    ])
  }

  if (includesAny(context, ['配电', '电缆', '导线', '母线', '桥架', '槽盒', '导管', '接地', '防雷', '灯具', '开关', '插座', '电源', '变压器', '配电箱', '控制柜', 'SPD', '浪涌', '端子箱', '汇流排', '控制系统接线'])) {
    return unique([
      `${processName}路径点位和支吊架复核`,
      `${processName}敷设安装和接线过程控制`,
      `${processName}绝缘接地或回路测试`,
      `${processName}标识和自检记录`,
    ])
  }

  if (includesAny(context, ['智能', '综合布线', '弱电', '机柜', '配线架', '网络', '监控', '门禁', '广播', '信息插座', '探测器', '模块', '传感器', '执行器', '控制器', '服务器', '工作站', '交换机', '网关', '软件安装', '参数配置', '应急系统', '防静电地板', '屏蔽门', '波导窗', '滤波器'])) {
    return unique([
      `${processName}点位路由和设备资料复核`,
      `${processName}安装端接和地址编码`,
      `${processName}单点通讯或功能测试`,
      `${processName}问题闭合和移交记录`,
    ])
  }

  if (includesAny(context, ['设备', '机组', '风机', '冷却塔', '制冷机组', '热泵机组', '室外机组', '室内机组'])) {
    return unique([
      `${processName}基础点位和开箱复核`,
      `${processName}就位固定和接口连接`,
      `${processName}单机功能或参数复核`,
      `${processName}自检整改记录`,
    ])
  }

  return steps
}

function deriveDefaultProcesses(itemName: string, subDivisionName: string, subDivisionCode: string): ProcessTemplate[] {
  const context = `${subDivisionCode} ${subDivisionName} ${itemName}`

  if (
    itemName === '安装场地检查'
    && includesAny(context, ['08-02 信息接入系统', '08-06 移动通信室内信号覆盖系统', '08-07 卫星通信系统'])
  ) {
    return processPackage(['运营商进场协调', '接入条件移交', '配合安装与联调', '运营商资料移交'])
  }
  if (includesAny(context, ['设备进场验收'])) {
    return processPackage(['资料核查', '外观及数量检查', '进场验收记录'])
  }
  if (includesAny(context, ['土建交接检验', '安装场地检查'])) {
    return processPackage(['交接条件核查', '尺寸标高复核', '缺陷整改确认', '交接验收记录'])
  }
  if (itemName === '建筑照明通电试运行' && includesAny(context, ['07-01 室外电气'])) {
    return processPackage(['室外照明回路编号和绝缘复测', '室外防水接地和通电条件确认', '庭院泛光灯具单机试亮', '室外照明分区联动试运行', '室外夜间照度运行记录与整改', '室外建筑照明通电试运行功能复测和交接签认'])
  }
  if (itemName === '建筑照明通电试运行' && includesAny(context, ['07-05 电气照明'])) {
    return processPackage(['室内照明回路编号和绝缘复测', '开关控制和通电条件确认', '灯具单机试亮', '室内照明场景和应急回路联动试运行', '室内照度运行记录与整改', '室内建筑照明通电试运行功能复测和交接签认'])
  }
  if (includesAny(context, ['整机安装验收', '建筑照明通电试运行', '试运行'])) {
    return processPackage(['试运行准备', '单机试运行', '系统联动试运行', '运行记录与整改', '验收移交'])
  }
  if (includesAny(context, ['系统调试', '接口及系统调试', '系统压力试验及调试', '试验与调试', '功能测试', '洁净度测试', '链路或信道测试'])) {
    return processPackage(['调试方案编制审批', '单项测试', '系统联调', '性能复核', '调试记录移交'])
  }
  if (includesAny(context, ['软件安装', '计算机网络软件安装', '网络安全软件安装'])) {
    return processPackage(['运行环境准备', '软件部署安装', '参数配置', '联调测试', '备份与移交'])
  }

  if (includesAny(context, ['土方开挖', '边坡开挖'])) {
    return processPackage(['施工准备与方案交底', '测量放线', '降排水与边坡防护', '分层开挖', '基底修整', '基底清理', '验槽与移交'])
  }
  if (includesAny(context, ['土方回填'])) {
    return processPackage(['回填范围和分层厚度试验段确认', '回填料含水率级配和虚铺厚度复核', '基底清理隐蔽和排水条件验收', '分层摊铺整平和边角补填', '夯实遍数机械碾压和搭接宽度控制', '压实度环刀或灌砂检测', '回填标高沉降观测点和移交复核'])
  }
  if (includesAny(context, ['场地平整'])) {
    return processPackage(['场地控制网和设计标高复核', '表土清理和障碍物清除', '挖填平衡和调配复核', '分区粗平和排水坡向形成', '场地碾压整平和边界修整', '场地标高方格网复测', '场地平整验收移交'])
  }
  if (includesAny(context, ['地基', '复合地基', '强夯', '注浆', '预压'])) {
    return processPackage(['施工准备与试验段', '定位放线', '材料设备复核', `${itemName}施工`, '过程检测', '承载力或质量验收'])
  }
  if (includesAny(context, ['桩基础', '灌注桩', '预制桩', '钢桩', '沉管', '长螺旋'])) {
    return processPackage(['施工准备与桩位复核', '成孔或沉桩施工', '成孔质量检查', '钢筋笼或桩身施工', '混凝土灌注或接桩', '桩头处理', '桩身检测与验收'])
  }
  if (includesAny(context, ['基坑支护', '围护墙', '土钉墙', '地下连续墙', '挡墙', '挡土墙', '锚杆', '内支撑', '喷锚支护'])) {
    return processPackage(['方案交底', '测量放线', '支护结构施工', '连接与加固', '监测点布设', '过程监测', '质量检测与验收'])
  }
  if (includesAny(context, ['地下水控制', '降水与排水', '回灌'])) {
    return processPackage(['方案交底', '井点或排水设施施工', '设备安装与试抽', '运行监测', '封井或移交'])
  }
  if (includesAny(context, ['无筋扩展基础', '钢筋混凝土扩展基础', '筏型与箱型基础', '沉井与沉箱基础', '基础'])) {
    return processPackage(['基底验收', '垫层施工', '钢筋加工安装', '模板安装加固', '混凝土浇筑', '养护与试块留置', '实体质量验收'])
  }

  if (includesAny(context, ['模板'])) {
    return processPackage(['模板深化与配模', '支架基础处理', '支架搭设与加固', '模板安装', '模板成型验收', '模板拆除与清理'])
  }
  if (includesAny(context, ['钢筋', '钢管内钢筋骨架'])) {
    return processPackage(['钢筋进场检验(§5.2.1 §5.2.3)', '钢筋翻样与下料', '钢筋加工', '连接接头施工', '钢筋绑扎安装', '保护层垫块设置', '预留预埋复核', '隐蔽验收'])
  }
  if (itemName === '现浇结构') {
    return processPackage(['现浇结构验收范围和轴线标高复核', '混凝土强度资料和拆模条件核查', '拆模后结构外观缺陷普查', '轴线标高垂直度实测实量', '截面尺寸和表面平整度实测', '预留洞口预埋件位置复核', '梁板柱墙节点外观复查', '蜂窝麻面露筋夹渣缺陷修补', '施工缝和结构接茬处理复核', '结构成品保护和楼层交接', '现浇结构观感质量复查', '后浇带封闭', '抗渗试压', '同条件试块送检', '拆模强度报告复核', '现浇结构实体质量检查'])
  }
  if (includesAny(context, ['混凝土'])) {
    return processPackage(['水泥进场检验(§7.2.1)', '配合比设计复核', '浇筑准备与交底', '模板钢筋预留预埋复核', '混凝土进场验收', '坍落度检查与试块留置', '混凝土浇筑', '分层振捣密实', '标高收面与施工缝处理', '大体积测温', '养护覆盖与成品保护', '后浇带封闭', '抗渗试压', '同条件试块送检', '拆模强度报告复核', '实体质量检查'])
  }
  if (includesAny(context, ['预应力'])) {
    return processPackage(['孔道和锚具准备', '预应力筋安装', '张拉设备标定', '张拉施工', '孔道压浆', '封锚与验收'])
  }
  if (includesAny(context, ['砌体', '填充墙', '石砌体'])) {
    return processPackage(['材料复验与砂浆试配', '排砖放线', '皮数杆设置', '拉结筋植筋与验收', '构造柱圈梁钢筋模板', '砌筑施工', '门窗洞口过梁压顶施工', '顶砌斜砌或塞缝', '勾缝清理', '实测实量与质量验收'])
  }
  if (includesAny(context, ['装配式结构'])) {
    return standardPrefabStructureProcesses()
  }
  if (includesAny(context, ['焊接'])) {
    return processPackage(['焊接工艺确认', '坡口与组对', '焊接施工', '外观及无损检测', '返修与验收'])
  }
  if (includesAny(context, ['紧固件连接', '螺栓'])) {
    return processPackage(['孔位复核', '紧固件安装', '初拧与终拧', '扭矩检查', '验收记录'])
  }
  if (includesAny(context, ['钢结构', '型钢', '铝合金', '木结构', '构件安装', '构件组装', '预拼装', '空间网格'])) {
    const installProcessName = itemName.endsWith('安装') ? itemName.replace(/安装$/, '吊装就位') : `${itemName}安装`
    return processPackage(['构件进场验收', '测量放线', '吊装准备', installProcessName, '临时固定与校正', '连接施工', '连接检测与验收'])
  }

  if (includesAny(context, ['防水', '密封', '涂膜', '卷材', '透气膜', '接缝密封'])) {
    return processPackage(['基层处理', '基层含水率或平整度检查', '节点附加层施工', `${itemName}施工`, '搭接收头处理', '闭水或淋水试验', '保护层与验收'])
  }
  if (includesAny(context, ['保温', '隔热', '绝热', '节能'])) {
    return processPackage(['基层检查', '材料进场复验', '排版放线', `${itemName}施工`, '节点收口处理', '节能验收'])
  }
  if (includesAny(context, ['04-05', '细部构造', '檐口', '檐沟', '天沟', '女儿墙', '山墙', '水落口', '变形缝', '反梁过水孔', '设施基座', '屋脊', '屋顶窗'])) {
    return processPackage(['细部节点深化确认', '基层及防水收口检查', '附加层和加强层施工', `${itemName}节点施工`, '密封嵌缝与压条收口', '排水坡向和泛水高度复核', '淋水或外观检查', '成品保护与验收'])
  }
  if (includesAny(context, ['屋面', '找坡层', '找平层', '隔汽层', '隔离层', '保护层', '瓦', '金属板铺装', '玻璃采光顶'])) {
    return processPackage(['基层清理与结构移交', '找坡找平标高控制', '材料进场复验', '隔汽保温层施工', `${itemName}施工`, '分格缝和细部收口', '蓄水或淋水试验', '保护层施工与成品验收'])
  }
  if (includesAny(context, ['建筑地面', '基层铺设', '面层铺设', '地面'])) {
    return processPackage(['基层处理', '标高控制线复核', '找平或结合层施工', `${itemName}施工`, '养护与保护', '平整度验收'])
  }
  if (includesAny(context, ['抹灰', '勾缝'])) {
    return processPackage(['基层处理', '界面剂施工', '挂网冲筋', '抗裂网铺设', '灰饼护角施工', '阴阳角护角', '分层抹灰', '空鼓裂缝处理', '养护修补', '观感验收'])
  }
  if (includesAny(context, ['木门窗安装'])) {
    return processPackage(['洞口尺寸和标高复核', '木框防腐防火处理', '预埋木砖或连接件复核', '框体安装固定', '塞缝防水处理', '门窗扇及五金安装', '开启缝隙调试', '观感和功能验收'])
  }
  if (includesAny(context, ['金属门窗安装'])) {
    return processPackage(['型材进场复验', '洞口及预埋件复核', '副框或附框安装', '框体安装固定', '防腐与防雷连接', '发泡塞缝和防水密封', '扇及五金安装', '启闭调试和限位复核', '淋水试验与验收'])
  }
  if (includesAny(context, ['塑料门窗安装'])) {
    return processPackage(['型材及增强型钢复验', '洞口尺寸和标高复核', '框体拼装固定', '连接片间距复核', '发泡塞缝与密封', '扇及五金安装', '启闭变形复核', '淋水试验与验收'])
  }
  if (includesAny(context, ['特种门安装'])) {
    return processPackage(['专项性能资料复核', '洞口及预埋件复核', '门框门扇安装', '闭门器与五金调试', '消防或人防联动测试', '专项验收移交'])
  }
  if (includesAny(context, ['门窗玻璃安装'])) {
    return processPackage(['玻璃规格与镀膜面复核', '垫块与槽口清理', '玻璃就位安装', '密封胶相容性确认', '压条及防坠措施', '成品保护与验收'])
  }
  if (includesAny(context, ['门窗', '特种门', '门系统'])) {
    return processPackage(['洞口复核', '框体安装固定', '塞缝防水处理', '扇及五金安装', '调试验收'])
  }
  if (includesAny(context, ['吊顶'])) {
    return processPackage(['弹线定位', '吊杆龙骨安装', '隐蔽验收', '面层安装', '收口验收'])
  }
  if (includesAny(context, ['隔墙'])) {
    return processPackage(['定位放线', '龙骨或板材安装', '管线配合与填充', '面层处理', '验收'])
  }
  if (includesAny(context, ['饰面板', '饰面砖', '幕墙', '石板', '陶瓷板', '金属板', '塑料板'])) {
    return processPackage(['深化排版', '基层复核', '连接件或粘结层施工', '面板安装', '缝隙收口处理', '打胶清理与验收'])
  }
  if (includesAny(context, ['涂饰', '裱糊', '软包'])) {
    return processPackage(['基层处理', '样板确认', `${itemName}施工`, '修补清理', '观感验收'])
  }
  if (includesAny(context, ['橱柜', '窗帘盒', '窗台板', '门窗套', '护栏', '扶手', '花饰'])) {
    return processPackage(['深化排版', '基层复核', '构件制作或进场验收', '安装固定', '成品保护与验收'])
  }

  if (includesAny(itemName, ['防腐'])) {
    return processPackage(['基层除锈清理', '防腐材料进场复验', '底漆或底层防腐施工', '面漆或防腐层施工', '厚度检测', '针孔漏点或外观复查', '防腐质量复测和交接签认'])
  }
  if (includesAny(itemName, ['消火栓', '消防喷淋'])) {
    return processPackage(['预留预埋复核', '支吊架安装', '喷淋管网安装', '消火栓箱体安装', '阀门及水泵接合器安装', '喷头末端装置安装', '水压试验与冲洗', '消防联动调试', '检测验收配合'])
  }
  if (includesAny(itemName, ['卫生器具'])) {
    return processPackage(['洞口和接口复核', '支架及接口安装', '器具就位固定', '给排水接驳', '通水盛水试验', '成品保护复查和交接签认'])
  }
  if (includesAny(itemName, ['管道冲洗'])) {
    return processPackage(['冲洗方案确认', '临时冲洗管路连接', '分区分段冲洗', '水质或浊度检查', '末端排放复核', '冲洗记录复核和签认'])
  }
  if (includesAny(itemName, ['消毒'])) {
    return processPackage(['消毒方案确认', '系统冲洗合格确认', '消毒剂配制投加', '浸泡循环控制', '水质取样检测', '检测结果复核和交接签认'])
  }
  if (includesAny(itemName, ['系统水压试验', '水压试验'])) {
    return processPackage(['试压方案确认', '系统隔离和临时封堵', '分段充水排气', '升压稳压观察', '渗漏整改复验', '试压记录复核和签认'])
  }
  if (includesAny(itemName, ['试验与调试', '试验及调试'])) {
    return processPackage(['调试条件确认', '单机试验', '系统联动调试', '性能参数复核', '问题整改闭合', '调试参数复核和交接签认'])
  }
  if (includesAny(itemName, ['土建结构'])) {
    return processPackage(['结构尺寸和标高复核', '管沟或基础结构施工', '预埋套管和支墩复核', '防水防腐界面处理', '回填前隐蔽验收', '结构移交签认'])
  }
  if (includesAny(itemName, ['热计量', '调控装置', '检测与控制仪表', '水处理设备及控制设施'])) {
    return processPackage(['点位和接口复核', '仪表设备进场验收', '取源部件或传感器安装', '控制线缆接线', '参数标定和单点测试', '联动调试和记录签认'])
  }
  if (includesAny(itemName, ['锅炉', '换热站', '水处理设备', '辅助设备', '水泵', '风机', '冷却塔', '制冷机组', '热泵机组', '室外机组', '室内机组', '设备安装', '驱动主机', '液压系统'])) {
    return processPackage(['基础复核', '开箱验收', '吊装或搬运就位', '设备找平找正固定', '配管配线和减振复核', '单机调试和质量复测'])
  }
  if (includesAny(context, ['管道', '管网', '管沟', '井池', '中水', '雨水', '给水', '排水', '热水', '供热', '供暖', '喷泉', '游泳池', '公共浴池'])) {
    return processPackage(['预留预埋复核', '支吊架或基础施工', '管道预制加工', '管道及配件安装', '接口连接检查', '压力或功能试验', '冲洗防腐与验收'])
  }
  if (includesAny(context, ['厨房、卫生间排风系统安装'])) {
    return processPackage(['预留洞口复核', '风管支吊架安装', '排风管道安装', '止回阀及风口安装', '风机或接口连接', '风量测试与验收'])
  }
  if (includesAny(context, ['吸尘罩安装'])) {
    return processPackage(['安装位置复核', '支架安装', '吸尘罩安装固定', '风管接口连接', '捕集效果检查', '验收移交'])
  }
  if (includesAny(context, ['快速接口安装'])) {
    return processPackage(['接口点位复核', '预埋管线检查', '快速接口安装', '密封性检查', '标识和防护', '功能验收'])
  }
  if (includesAny(context, ['板式热交换器', '蓄水罐', '蓄水槽'])) {
    return processPackage(['基础复核', '开箱验收', '吊装或搬运就位', `${itemName}就位固定`, '管路连接', '压力试验与验收'])
  }
  if (includesAny(context, ['系统灌水渗漏及排放试验'])) {
    return processPackage(['试验方案确认', '系统灌水', '渗漏检查', '排放试验', '整改复验', '记录验收'])
  }
  if (includesAny(context, ['制冷剂灌注'])) {
    return processPackage(['系统抽真空确认', '制冷剂称量准备', '制冷剂灌注', '泄漏检测', '运行参数复核', '记录验收'])
  }
  if (includesAny(context, ['系统真空试验'])) {
    return processPackage(['试验方案确认', '系统隔离封堵', '真空抽取', '保压观察', '泄漏整改复验', '试验记录验收'])
  }
  if (includesAny(context, ['溴化锂溶液加灌'])) {
    return processPackage(['溶液品质核查', '系统清洁确认', '溴化锂溶液加灌', '液位浓度复核', '泄漏检查', '记录验收'])
  }
  if (includesAny(context, ['试验及调试'])) {
    return processPackage(['调试条件确认', '单机试验', '系统联动调试', '性能参数复核', '问题整改闭合', '调试资料移交'])
  }
  if (includesAny(context, ['执行机构安装调试'])) {
    return processPackage(['点位行程复核', '执行机构安装固定', '接线与信号校验', '动作方向调试', '联动测试', '验收记录'])
  }
  if (includesAny(context, ['自动控制及系统智能控制软件调试'])) {
    return processPackage(['控制逻辑核对', '软件参数配置', '点表通讯测试', '自动控制场景调试', '智能控制联调', '备份与移交'])
  }
  if (includesAny(context, ['防火卷帘'])) {
    return processPackage(['洞口条件复核', '卷帘箱体及导轨安装', '帘面安装调试', '控制箱接线', '联动下降测试', '防火封堵与验收'])
  }
  if (includesAny(itemName, ['正压送风', '防排烟', '排烟风阀', '防火风管', '常闭正压风口'])) {
    return processPackage(['排烟阀常闭正压风口和联动矩阵复核', '排烟阀口和常闭正压风口阀体安装', '防火风管耐火包覆法兰密封和防火封堵施工', '执行机构电源反馈信号和手自动复位校验', '控制模块地址编码和回路状态核对', '分区风量风压和开启顺序测试', '消防联动闭环测试缺陷整改和验收移交'])
  }
  if (includesAny(context, ['气体灭火'])) {
    return processPackage(['钢瓶间条件复核', '储瓶及选择阀安装', '灭火剂管网安装', '喷嘴及泄压装置安装', '报警联动接线', '气密性试验', '模拟喷放测试', '检测验收配合'])
  }
  if (
    includesAny(context, ['06-01 送风系统', '06-05 舒适性空调系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装', '风口'])
  ) {
    return processPackage(['预留预埋复核', '支吊架安装', '风管或部件制作', '风管或部件安装', '漏风量或严密性测试', '送风保温连续性', '系统调试验收'])
  }
  if (
    includesAny(context, ['06-03 防排烟系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装'])
  ) {
    return processPackage(['预留洞口复核', '支吊架安装', '防排烟耐火风管制作', '防排烟耐火风管安装', '防火封堵检查', '漏风量或严密性测试', '防排烟联动复核'])
  }
  if (
    includesAny(context, ['06-04 除尘系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装'])
  ) {
    return processPackage(['预留预埋复核', '支吊架安装', '风管或部件制作', '风管或部件安装', '除尘耐磨防爆处理', '捕集效果检查', '系统调试验收'])
  }
  if (
    includesAny(context, ['06-06 恒温恒湿空调系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装'])
  ) {
    return processPackage(['预留预埋复核', '支吊架安装', '风管或部件制作', '风管或部件安装', '漏风量或严密性测试', '保温防腐配合', '恒温恒湿精度复核', '系统调试验收'])
  }
  if (
    includesAny(context, ['06-07 净化空调系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装', '中、高效过滤器'])
  ) {
    return processPackage(['预留预埋复核', '支吊架安装', '净化洁净控制', '风管或部件安装', '高效过滤器安装', '洁净度测试', '系统调试验收'])
  }
  if (
    includesAny(context, ['06-08 地下人防通风系统'])
    && includesAny(itemName, ['风管与配件制作', '部件制作', '风管系统安装', '过滤吸收器', '防爆波活门'])
  ) {
    return processPackage(['预留预埋复核', '支吊架安装', '风管或部件制作', '风管或部件安装', '人防密闭与防爆波复核', '系统调试验收'])
  }
  if (includesAny(context, ['风管', '部件制作', '风口', '空气处理', '防排烟', '通风', '空调'])) {
    return processPackage(['预留预埋复核', '支吊架安装', '风管或部件制作', '风管或部件安装', '漏风量或严密性测试', '保温防腐配合', '系统调试验收'])
  }
  if (includesAny(context, ['防腐'])) {
    return processPackage(['基层除锈清理', '底漆施工', '面漆或防腐层施工', '厚度检测', '验收记录'])
  }

  if (includesAny(context, ['变压器', '箱式变电所', '配电柜', '控制柜', '配电箱', '母线槽', '不间断电源', '应急电源', '柴油发电机'])) {
    return processPackage(['基础及接地复核', '设备开箱验收', '设备安装固定', '母线或电缆连接', '绝缘和接地测试', '高压柜局部放电测试', '试验试运行'])
  }
  if (includesAny(context, ['07-01 室外电气'])) {
    if (includesAny(itemName, ['管内穿线', '槽盒内敷线'])) return processPackage(['室外线缆回路和管槽路径复核', '管槽清扫试通和穿线准备', '室外线缆牵引敷设和余量控制', '线缆整理绑扎和防水端部保护', '回路编号标识和绝缘测试', '室外管槽穿线验收'])
    if (includesAny(itemName, ['梯架', '托盘', '槽盒'])) return processPackage(['室外桥架路由和标高复核', '室外桥架支架防腐预埋施工', '梯架托盘槽盒分段安装固定', '伸缩补偿和防水封堵处理', '桥架接地跨接连续性测试', '室外桥架隐蔽验收'])
    if (includesAny(itemName, ['导管敷设'])) return processPackage(['室外导管路径和埋深复核', '管沟支架套管和防腐施工', '导管连接弯曲半径和防水密封', '管口护口和穿线条件检查', '导管接地跨接连续性测试', '室外导管隐蔽验收'])
  }
  if (includesAny(context, ['07-02 变配电室']) && includesAny(context, ['梯架', '支架', '托盘', '槽盒', '导管'])) {
    return processPackage(['配电室柜列路径和标高复核', '桥架支吊架和穿墙套管安装', '梯架托盘槽盒分段敷设', '防火分区封堵和屏蔽界面处理', '桥架接地跨接连续性测试', '配电室桥架隐蔽验收'])
  }
  if (includesAny(context, ['07-03 供电干线'])) {
    if (includesAny(itemName, ['管内穿线', '槽盒内敷线'])) return processPackage(['供电干线槽盒穿线路径复核', '管槽清扫试通和穿线准备', '供电干线分回路牵引敷设', '线缆整理固定和余量控制', '回路挂牌和绝缘测试', '供电干线槽盒穿线验收'])
    if (includesAny(itemName, ['梯架', '托盘', '槽盒'])) return processPackage(['供电干线桥架路由和标高复核', '供电干线桥架支吊架安装', '桥架托盘槽盒敷设和载流量复核', '伸缩节和防火封堵处理', '桥架接地跨接连续性测试', '供电干线桥架隐蔽验收'])
    if (includesAny(itemName, ['导线敷设'])) return processPackage(['供电干线导线路径和管路复核', '管内穿线前清扫试通', '供电干线导线分相牵引敷设', '导线相色核对和整理固定', '回路标识和绝缘测试', '供电干线导线敷设验收'])
    if (includesAny(itemName, ['电缆敷设'])) return processPackage(['供电干线电缆路由和电缆盘复核', '电缆桥架管沟和牵引条件确认', '供电干线电缆牵引敷设', '电缆转弯半径和固定间距检查', '电缆挂牌和绝缘测试', '供电干线电缆敷设验收'])
  }
  if (includesAny(context, ['07-04 电气动力'])) {
    if (includesAny(itemName, ['管内穿线', '槽盒内敷线'])) return processPackage(['动力管槽穿线路径和设备回路复核', '管槽清扫试通和穿线准备', '动力回路线缆牵引敷设', '线缆整理固定和端部余量控制', '回路编号标识和绝缘测试', '动力管槽穿线验收'])
    if (includesAny(itemName, ['梯架', '托盘', '槽盒'])) return processPackage(['动力桥架路由和设备回路复核', '动力桥架支吊架安装', '桥架托盘槽盒敷设和隔离防护', '动力设备分区标识', '桥架接地跨接连续性测试', '动力桥架隐蔽验收'])
    if (includesAny(itemName, ['导线敷设'])) return processPackage(['动力导线路径和控制动力回路复核', '管内穿线前清扫试通', '动力导线分相牵引敷设', '导线相序核对和端子余量整理', '回路标识和绝缘测试', '动力导线敷设验收'])
    if (includesAny(itemName, ['电缆敷设'])) return processPackage(['动力电缆路由和电缆盘复核', '设备馈线桥架管沟牵引条件确认', '动力电缆牵引敷设', '电缆转弯半径和固定间距检查', '电缆挂牌和绝缘测试', '动力电缆敷设验收'])
  }
  if (includesAny(context, ['07-05 电气照明'])) {
    if (includesAny(itemName, ['管内穿线', '槽盒内敷线'])) return processPackage(['照明回路线缆点位和管槽复核', '管槽清扫试通和穿线准备', '照明回路线缆分色穿线', '线缆整理固定和灯位余量控制', '回路编号标识和绝缘测试', '照明管槽穿线验收'])
    if (includesAny(itemName, ['梯架', '托盘', '槽盒'])) return processPackage(['照明桥架路由和灯具回路复核', '照明桥架支吊架安装', '梯架托盘槽盒敷设和防火封堵', '照明回路分区标识', '桥架接地跨接连续性测试', '照明桥架隐蔽验收'])
    if (includesAny(itemName, ['导管敷设'])) return processPackage(['照明导管路径和盒位标高复核', '导管支吊架和开槽套管施工', '导管连接弯曲半径和锁母固定', '管口护口和穿线条件检查', '导管接地跨接连续性测试', '照明导管隐蔽验收'])
    if (includesAny(itemName, ['塑料护套线'])) return processPackage(['塑料护套线直敷路径和灯位复核', '基层固定点和保护管位置确认', '塑料护套线展开校直和直敷布设', '固定间距弯曲半径和防损伤检查', '回路标识和绝缘测试', '塑料护套线直敷验收'])
    if (includesAny(itemName, ['钢索配线'])) return processPackage(['钢索配线路径和受力点复核', '钢索支架吊点和绝缘子安装', '钢索张紧调直和防腐处理', '瓷瓶或线夹固定及导线敷设', '回路标识和绝缘测试', '钢索配线验收'])
  }
  if (includesAny(context, ['梯架', '支架', '托盘', '槽盒', '导管'])) {
    return processPackage(['定位放线', '支吊架安装', '本体敷设安装', '接地跨接', '隐蔽验收'])
  }
  if (includesAny(context, ['电缆敷设', '导线敷设', '线缆敷设', '管内穿线', '槽盒内敷线', '钢索配线', '塑料护套线'])) {
    return processPackage(['路径复核', '穿线或敷设准备', '线缆敷设', '整理固定', '标识挂牌', '绝缘测试'])
  }
  if (includesAny(context, ['电缆头制作', '导线连接', '线路绝缘测试'])) {
    return processPackage(['端头处理', '压接或焊接', '绝缘包扎', '标识整理', '绝缘测试记录'])
  }
  if (includesAny(context, ['灯具', '开关', '插座', '风扇'])) {
    return processPackage(['定位开孔', '本体安装', '接线固定', '通电检查', '成品验收'])
  }
  if (includesAny(context, ['电动机、电加热器及电动执行机构检查接线'])) {
    return processPackage(['设备铭牌和回路核对', '接线端子检查', '动力控制线接线', '绝缘和接地测试', '点动试运行', '检查记录验收'])
  }
  if (includesAny(context, ['接地', '防雷', '等电位', '接闪器', '浪涌保护器', '屏蔽设施', '电涌保护器'])) {
    return processPackage(['接地材料复验', '接地体或引下线施工', '等电位连接', '电阻或连续性测试', '隐蔽验收'])
  }
  if (includesAny(context, ['传感器', '执行器', '检测仪器', '仪表', '控制器'])) {
    return processPackage(['点位复核', '设备安装', '接线校验', '单点调试', '系统联调'])
  }
  if (includesAny(context, ['信息插座', '配线架', '机架', '显示设备', '网络设备', '安全设备', '控制器类设备', '探测器类设备', '其他设备'])) {
    return processPackage(['点位和机柜复核', '设备安装', '线缆端接', '参数配置', '单点测试', '功能测试'])
  }
  if (includesAny(context, ['供配电系统'])) {
    return processPackage(['机房供配电方案核对', '配电设备安装', '电缆敷设接线', '接地与绝缘测试', '送电试运行', '验收移交'])
  }
  if (includesAny(context, ['空气调节系统'])) {
    return processPackage(['机房空调方案核对', '空调设备安装', '冷凝水和管线连接', '控制接线调试', '运行参数测试', '验收移交'])
  }
  if (includesAny(context, ['综合布线系统'])) {
    return processPackage(['机柜桥架复核', '信息点位复核', '线缆敷设', '模块和配线架端接', '链路测试', '标签与竣工资料整理', '系统验收移交'])
  }
  if (includesAny(context, ['监控与安全防范系统'])) {
    return processPackage(['点位和视场复核', '摄像机及门禁设备安装', '网络和供电接入', '平台参数配置', '录像存储策略配置', '联动场景测试', '系统验收移交'])
  }
  if (includesAny(context, ['消防系统'])) {
    return processPackage(['消防接口条件复核', '火灾报警点位复核', '探测报警设备安装', '消防模块接线', '消防联动逻辑配置', '防排烟及卷帘联动测试', '消防水系统联动测试', '检测验收资料配合', '消防专项验收移交'])
  }
  if (includesAny(context, ['室内装饰装修'])) {
    return processPackage(['机房装饰深化确认', '基层和防火材料复核', '墙地顶面施工', '收口和防尘处理', '观感质量检查', '成品保护移交'])
  }
  if (includesAny(context, ['电磁屏蔽'])) {
    return processPackage(['屏蔽方案和材料复核', '屏蔽壳体或网体施工', '屏蔽门和波导窗安装', '穿墙管线和滤波器安装', '接地连续性和搭接电阻测试', '屏蔽效能检测', '泄漏点整改和效能复测', '屏蔽检测报告复核', '验收移交'])
  }

  if (includesAny(context, ['导轨', '轿厢', '对重', '安全部件', '悬挂装置', '随行电缆', '补偿装置', '电气装置'])) {
    return processPackage(['安装条件复核', '样板或基准线复核', `${itemName}安装`, '校正调整', '电气接线与参数设置', '慢车调试', '快车调试', '安全功能检查', '监督检验配合'])
  }

  return processPackage([`${itemName}工序策划与样板确认`, `${itemName}专业施工`, `${itemName}质量验收与移交`])
}

function activityStepNode(
  code: string,
  name: string,
  processName: string,
): ChinaTemplateCatalogNode {
  return {
    stableCode: code,
    name,
    categoryType: 'activity_step',
    sourceStandard: ENTERPRISE_PROCESS,
    sourceVersion: 'v1.4.7.2',
    sourceClauseRef: 'enterprise-method-activity-step',
    defaultResponsibleUnitRole: 'construction_team',
    webVerified: true,
    reviewNeeded: false,
    metadata: buildActivityStepMetadata(name, processName, code),
    children: [],
  }
}

function processNode(
  code: string,
  name: string,
  _legacyDurationDays = 1,
  sourceStandard = SYSTEM_PROCESS,
  itemName?: string,
): ChinaTemplateCatalogNode {
  const enrichedActivitySteps = enrichFieldActivitySteps(code, name, itemName, deriveActivitySteps(name))
  const activitySteps = completeStandardActivitySteps(name, enrichedActivitySteps, standardActivityStepMinimumFor(code))
    .map((stepName) => contextualizeActivityStepName(name, stepName, itemName))
  const activityStepDescriptors = activitySteps.map((stepName, index) => ({
    stableCode: `${code}-S${String(index + 1).padStart(2, '0')}`,
    name: stepName,
  }))
  const children = activityStepDescriptors.map((step, index) => (
    activityStepNode(step.stableCode, step.name, name)
  ))
  return {
    stableCode: code,
    name,
    categoryType: 'process',
    sourceStandard,
    sourceVersion: 'v1.4.7.2',
    sourceClauseRef: sourceStandard === SYSTEM_PROCESS ? 'system-default-process' : 'enterprise-method',
    defaultResponsibleUnitRole: 'construction_team',
    webVerified: sourceStandard !== SYSTEM_PROCESS,
    reviewNeeded: false,
    expectedChildCount: children.length,
    metadata: buildProcessMetadata(name, code),
    children,
  }
}

function processTemplateName(entry: ProcessTemplate) {
  return Array.isArray(entry) ? entry[0] : entry
}

function processTemplateDuration(entry: ProcessTemplate) {
  return Array.isArray(entry) ? entry[1] : 1
}

function processTemplate(name: string, duration = 1): ProcessTemplate {
  return duration > 1 ? [name, duration] : name
}

function normalizeCoreQualityProcessName(processName: string, itemName: string) {
  if (processName === '调试记录移交' && (itemName.includes('试验') || itemName.includes('调试'))) return '调试参数复核和问题销项'
  if (processName === `${itemName}质量验收与移交`) return `${itemName}质量复测和工序交接`
  const replacements: Array<[string, string]> = [
    ['检测验收资料配合', '检测资料组卷和验收配合'],
    ['消防专项验收移交', '消防联动检测复核和验收配合'],
    ['质量验收与移交', `${itemName}质量复测和工序交接`],
    ['系统验收移交', `${itemName}系统联调复核和运维交接`],
    ['调试记录移交', `${itemName}调试参数复核和问题销项`],
    ['验收移交', `${itemName}功能复测和交接签认`],
    ['专项验收移交', `${itemName}专项检测复核和交接签认`],
    ['成品保护与验收', `${itemName}成品保护复查和问题销项`],
    ['保护层与验收', `${itemName}保护层复查和界面交接`],
    ['记录验收', `${itemName}检测记录复核和签认`],
  ]
  for (const [from, to] of replacements) {
    if (processName.includes(from)) return processName.replace(from, to)
  }
  if (processName === '验收') return `${itemName}质量复测和问题销项`
  return processName
}

function coreQualitySupplementProcesses(code: string, itemName: string) {
  if (code.startsWith('01-04')) return ['水位观测点布设复核', '停降封井条件确认']
  if (itemName.includes('焊接')) return ['焊材烘干和参数记录', '检测报告复核和返修闭合']
  if (itemName.includes('紧固件连接')) return ['连接副批次复验', '终拧标记和抽检记录']
  if (code.startsWith('03-05')) return ['机电末端点位复核', '板缝收口和观感销项']
  if (code.startsWith('03-06')) return ['门洞加固和隔声防火复核', '板缝抗裂处理复查']
  if (code.startsWith('03-10') || code.startsWith('03-11')) return ['环境条件和材料批次复核', '色差污染修补和观感销项']
  if (code.startsWith('03-12')) return ['细部尺寸复测和五金功能复核', '成品保护交接和污染销项']
  if (code.startsWith('05-') && itemName.includes('试验与调试')) return ['试验压力或流量参数记录', '运行问题销项和交接签认']
  if (code.startsWith('05-') && itemName.includes('卫生器具')) return ['排水坡度和接口渗漏复核', '使用功能复测和成品交接']
  if (code.startsWith('06-') && (itemName.includes('系统调试') || itemName.includes('测试') || itemName.includes('系统压力试验及调试'))) return ['测点数据记录和参数平衡复核', '运行问题销项和交接签认']
  if (code.startsWith('06-20')) return ['点表接口核对', '联动场景复测和权限交接']
  if (code.startsWith('07-')) return ['回路编号和绝缘复测', '通电条件确认和问题销项']
  if (code.startsWith('08-02')) return ['运营商接入界面确认', '室内管线路由复核', '接入测试和信号质量确认']
  if (code.startsWith('08-06')) return ['运营商覆盖方案确认', '天馈点位和信号盲区复核', '覆盖测试和问题销项']
  if (code.startsWith('08-07')) return ['卫星天线安装界面确认', '馈线接地和避雷界面复核', '接收质量测试和交接签认']
  if (code.startsWith('08-') && includesAny(itemName, ['软件安装', '系统调试', '接口及系统调试', '功能测试', '联调', '试运行', '调试'])) {
    return ['点表接口和权限配置复核', '试运行记录和备份交接']
  }
  if (code.startsWith('10-03')) return ['扶梯桁架就位和水平度复测', '安全开关联动测试', '监督检验问题销项']
  if (code.startsWith('10-')) return ['安装基准线复核', '安全功能测试和问题销项', '监督检验资料交接']
  return [`${itemName}实测复核和问题销项`, `${itemName}质量记录复核`, `${itemName}工序交接签认`]
}

function cleanCoreQualityProcessName(processName: string) {
  return processName
    .replace(/安装安装/g, '安装')
    .replace(/系统系统/g, '系统')
    .replace(/绝热绝热施工/g, '绝热施工')
    .replace(/给水给水设备/g, '给水设备')
}

function coreQualityContextLabel(code: string) {
  const labels: Array<[string, string]> = [
    ['05-01', '室内给水'],
    ['05-02', '室内排水'],
    ['05-03', '室内热水'],
    ['05-04', '卫生器具'],
    ['05-05', '室内供暖'],
    ['05-06', '室外给水'],
    ['05-07', '室外排水'],
    ['05-08', '室外供热'],
    ['05-09', '饮用水供应'],
    ['05-10', '中水雨水利用'],
    ['05-11', '泳池浴池水系统'],
    ['05-12', '水景喷泉'],
    ['05-13', '热源机房'],
    ['05-14', '检测控制仪表'],
    ['06-01', '送风系统'],
    ['06-02', '排风系统'],
    ['06-03', '防排烟系统'],
    ['06-04', '除尘系统'],
    ['06-05', '舒适性空调'],
    ['06-06', '恒温恒湿空调'],
    ['06-07', '净化空调'],
    ['06-08', '人防通风'],
    ['06-09', '真空吸尘'],
    ['06-10', '冷凝水系统'],
    ['06-11', '空调冷热水'],
    ['06-12', '冷却水系统'],
    ['06-13', '土壤源热泵'],
    ['06-14', '水源热泵'],
    ['06-15', '蓄能系统'],
    ['06-16', '压缩式制冷'],
    ['06-17', '吸收式制冷'],
    ['06-18', '多联机空调'],
    ['06-19', '太阳能供暖空调'],
    ['06-20', '设备自控'],
    ['07-01', '室外电气'],
    ['07-02', '变配电室'],
    ['07-03', '供电干线'],
    ['07-04', '电气动力'],
    ['07-05', '电气照明'],
    ['07-06', '备用和不间断电源'],
    ['08-01', '智能化集成'],
    ['08-02', '信息接入'],
    ['08-03', '电话交换'],
    ['08-04', '信息网络'],
    ['08-05', '综合布线'],
    ['08-06', '移动通信覆盖'],
    ['08-07', '卫星通信'],
    ['08-08', '有线电视'],
    ['08-09', '公共广播'],
    ['08-10', '会议系统'],
    ['08-11', '信息导引发布'],
    ['08-12', '时钟系统'],
    ['08-13', '信息化应用'],
    ['08-14', '建筑设备监控'],
    ['08-15', '火灾自动报警'],
    ['08-16', '安全技术防范'],
    ['08-17', '应急响应'],
    ['08-18', '机房'],
    ['08-19', '防雷接地'],
  ]
  return labels.find(([prefix]) => code.startsWith(prefix))?.[1] ?? ''
}

function contextualizeCoreQualityProcessName(code: string, itemName: string, processName: string) {
  const label = coreQualityContextLabel(code)
  if (processName === itemName) {
    if (itemName === '管道及配件安装') return `${label}管道安装和接口复核`
    if (itemName === '线缆敷设') return `${label}线缆牵引敷设`
    if (itemName === '快速接口安装') return '真空吸尘快速接口就位和密封复核'
    if (itemName === '制冷剂灌注') return '制冷剂定量灌注'
    if (itemName === '溴化锂溶液加灌') return '溴化锂溶液定量加灌'
    if (itemName === '设备安装') return `${label}设备就位接线和参数复核`
    if (itemName === '软件安装') return `${label}软件部署和版本核对`
    if (itemName === '试运行') return `${label}试运行和问题销项`
    return `${itemName}现场实施和质量复核`
  }
  const mepNameMap: Record<string, string> = {
    预留预埋复核: '预留预埋复核',
    支吊架或基础施工: '支吊架或基础施工',
    管道预制加工: '管道预制加工',
    管道及配件安装: '管道安装和接口复核',
    接口连接检查: '接口连接检查',
    压力或功能试验: '压力或功能试验',
    冲洗防腐与验收: '冲洗防腐和质量复测',
  }
  if (label && (code.startsWith('05-') || code.startsWith('06-')) && mepNameMap[processName]) {
    return `${label}${mepNameMap[processName]}`
  }
  const equipmentNameMap: Record<string, string> = {
    基础复核: '基础复核',
    开箱验收: '开箱验收',
    吊装或搬运就位: '吊装搬运就位',
    设备找平找正固定: '找平找正固定',
    配管配线和减振复核: '配管配线和减振复核',
    单机调试和质量复测: '单机调试和质量复测',
  }
  if (label && equipmentNameMap[processName]) {
    return `${label}${itemName}${equipmentNameMap[processName]}`
  }
  const electricalEquipmentNameMap: Record<string, string> = {
    基础及接地复核: '基础及接地复核',
    设备开箱验收: '设备开箱验收',
    设备安装固定: '设备安装固定',
    母线或电缆连接: '母线或电缆连接',
    绝缘和接地测试: '绝缘和接地测试',
    试验试运行: '试验试运行',
  }
  if (label && code.startsWith('07-') && electricalEquipmentNameMap[processName]) {
    return `${label}${itemName}${electricalEquipmentNameMap[processName]}`
  }
  const trialRunNameMap: Record<string, string> = {
    试运行准备: '试运行条件确认',
    单机试运行: '单机试运行',
    系统联动试运行: '系统联动试运行',
    运行记录与整改: '运行记录复核和问题整改',
    试运行功能复测和交接签认: '试运行功能复测和交接签认',
    点表接口和权限配置复核: '点表接口和权限配置复核',
  }
  if (label && itemName === '试运行' && trialRunNameMap[processName]) {
    return `${label}${trialRunNameMap[processName]}`
  }
  const softwareNameMap: Record<string, string> = {
    运行环境准备: '运行环境准备',
    软件部署安装: '软件部署安装',
    参数配置: '参数配置',
    联调测试: '联调测试',
    备份与移交: '配置备份和交接签认',
    点表接口和权限配置复核: '点表接口和权限配置复核',
  }
  if (label && code.startsWith('08-') && itemName.includes('软件安装') && softwareNameMap[processName]) {
    return `${label}${softwareNameMap[processName]}`
  }
  const commissioningNameMap: Record<string, string> = {
    调试方案确认: '调试方案确认',
    单项测试: '单项测试',
    系统联调: '系统联调',
    性能复核: '性能参数复核',
    调试参数复核和问题销项: '调试参数复核和问题销项',
    试验压力或流量参数记录: '试验压力或流量参数记录',
    测点数据记录和参数平衡复核: '测点数据记录和参数平衡复核',
  }
  if (label && (itemName.includes('试验与调试') || itemName.includes('系统调试') || itemName.includes('系统压力试验及调试')) && commissioningNameMap[processName]) {
    return `${label}${commissioningNameMap[processName]}`
  }
  const supportNameMap: Record<string, string> = {
    方案交底: '方案交底',
    测量放线: '测量放线',
    支护结构施工: '支护结构施工',
    连接与加固: '连接与加固',
    监测点布设: '监测点布设',
    过程监测: '过程监测',
    质量检测与验收: '质量检测和验收复核',
  }
  if ((code.startsWith('01-03') || code.startsWith('01-06') || itemName.includes('锚杆')) && supportNameMap[processName]) {
    return `${itemName}${supportNameMap[processName]}`
  }
  const facingNameMap: Record<string, string> = {
    深化排版: '深化排版',
    基层复核: '基层复核',
    连接件或粘结层施工: '连接件或粘结层施工',
    面板安装: '面板安装',
    缝隙收口处理: '缝隙收口处理',
    打胶清理与验收: '打胶清理和验收复核',
  }
  if ((code.startsWith('03-07') || code.startsWith('03-08') || code.startsWith('03-09')) && facingNameMap[processName]) {
    return `${itemName}${facingNameMap[processName]}`
  }
  const insulationNameMap: Record<string, string> = {
    基层检查: '基层检查',
    材料进场复验: '材料进场复验',
    排版放线: '排版放线',
    绝热施工: '绝热施工',
    节点收口处理: '节点收口处理',
    节能验收: '节能复测和交接签认',
  }
  if (label && itemName.includes('绝热') && insulationNameMap[processName]) {
    return `${label}${itemName}${insulationNameMap[processName]}`
  }
  const racewayNameMap: Record<string, string> = {
    定位放线: '路径定位放线',
    支吊架安装: '支吊架安装',
    本体敷设安装: '梯架槽盒导管敷设安装',
    接地跨接: '接地跨接',
    隐蔽验收: '隐蔽验收复核',
    点表接口和权限配置复核: '点表接口和权限配置复核',
  }
  if (label && code.startsWith('08-') && itemName.includes('梯架') && racewayNameMap[processName]) {
    return `${label}${racewayNameMap[processName]}`
  }
  const anticorrosionNameMap: Record<string, string> = {
    基层除锈清理: '基层除锈清理',
    防腐材料进场复验: '材料进场复验',
    底漆或底层防腐施工: '底层防腐施工',
    面漆或防腐层施工: '面层防腐施工',
    厚度检测: '厚度检测',
    针孔漏点或外观复查: '针孔漏点和外观复查',
    防腐质量复测和交接签认: '质量复测和交接签认',
  }
  if (label && itemName.includes('防腐') && anticorrosionNameMap[processName]) {
    return `${label}${itemName}${anticorrosionNameMap[processName]}`
  }
  const cableNameMap: Record<string, string> = {
    路径复核: '路由路径复核',
    穿线或敷设准备: '穿线敷设准备',
    线缆敷设: '线缆牵引敷设',
    整理固定: '线缆整理固定',
    标识挂牌: '线缆标识挂牌',
    绝缘测试: '绝缘链路测试',
  }
  if (label && (code.startsWith('07-') || code.startsWith('08-')) && cableNameMap[processName]) {
    return `${label}${cableNameMap[processName]}`
  }
  if (label && code.startsWith('08-') && processName === '设备安装') return `${label}设备就位接线和参数复核`
  if (label && code.startsWith('08-') && processName === '软件安装') return `${label}软件部署和版本核对`
  if (label && code.startsWith('08-') && processName === '试运行') return `${label}试运行和问题销项`
  return processName
}

function coreQualityProfiledReplacementProcesses(code: string, itemName: string): ProcessTemplate[] | null {
  if (code === '01-05-01') return ['土方开挖分区和顺序方案交底', '基坑边线和放坡线测量复核', '降水水位和边坡防护监测确认', '槽底预留土控制和机械开挖', '人工清槽和超挖扰动控制', '基底标高方格网复测', '钎探或验槽移交签认']
  if (code === '01-02-02') return ['基底验收和基础轴线复核', '垫层施工和顶标高控制', '柱墙插筋预留预埋件定位', '侧模安装加固和轴线偏差复核', '混凝土浇筑和顶标高收面', '养护与试块留置', '实体质量验收和轴线偏差复测']
  if (code === '02-01-01') return ['模板深化配模和起拱复核', '支架基础处理和支架承载复核', '立杆间距扫地杆和支架搭设加固', '模板安装拼缝和对拉螺杆加固', '模板成型验收和预留预埋复核', '拆模强度确认和模板拆除清理']
  if (code.startsWith('01-01')) {
    if (itemName.includes('强夯')) return ['场地排水和表层整平', '试夯区和夯能参数确认', '测量放线和夯点布设', '分遍强夯施工', '夯沉量和遍数记录', '间歇期和补夯条件确认', '夯后整平压实', '承载力或变形检测', '地基验收复核']
    if (itemName.includes('预压')) return ['场地整平和排水条件确认', '砂垫层和竖向排水体施工', '密封膜铺设和真空度检查(真空预压)', '沉降和孔压监测点布设和初始值采集', '分级加载预压或真空预压运行', '沉降和孔压连续观测', '固结度评估和卸载条件确认', '卸载整平', '承载力或固结效果检测', '地基验收复核']
    if (itemName.includes('高压旋喷')) return ['桩位放样', '钻机就位和垂直度校正', '水泥浆配制', '试喷参数确认', '提升旋喷施工', '桩顶补浆处理', '施工参数记录复核', '取芯或承载力检测', '地基验收复核']
    if (itemName.includes('注浆')) return ['现场注浆试验(§4.7.1)', '钻孔定位和设备就位', '孔深孔径检查', '浆液配合比确认', '注浆管安装', '分序分段注浆施工', '压力流量和浆量记录', '封孔养护', '注浆效果检测', '地基验收复核']
    if (itemName.includes('水泥土搅拌桩')) return ['桩位放样', '设备就位和垂直度校正', '水泥浆配制', '试桩参数确认', '下沉喷浆搅拌', '提升复搅施工', '桩顶处理', '强度或完整性检测', '地基验收复核']
    if (itemName.includes('水泥粉煤灰碎石桩') || itemName.includes('CFG桩')) return ['桩位放样', '长螺旋钻机就位', '钻进成孔和电流参数控制', '混合料配合比和坍落度确认', '泵送混合料压灌和提钻协调', '桩顶超灌和弃土清理', '桩间土清除和桩头处理', '桩身完整性或承载力检测', '复合地基验收复核']
    if (itemName.includes('砂石桩')) return ['桩位放样', '振冲器和水电系统就位', '砂石料级配复核', '试桩参数确认', '振冲成孔和清孔', '分段加料振密', '桩顶补料整平', '桩间土密实度检测', '复合地基验收复核']
    if (itemName.includes('土和灰土挤密桩') || itemName.includes('挤密桩')) return ['桩位放样', '沉管或冲击成孔设备就位', '土料灰土含水率复核', '试桩参数确认', '沉管或冲击成孔', '分层回填夯击', '桩顶封填整平', '桩间土挤密检测', '复合地基验收复核']
    if (itemName.includes('夯实水泥土桩')) return ['桩位放样', '夯扩成孔设备就位', '水泥土配合比复核', '试桩参数确认', '孔内水泥土分层夯填', '桩身强度试块留置', '桩顶处理和养护', '成桩强度检测', '复合地基验收复核']
    if (itemName.includes('土工合成材料')) return ['试验段和施工参数确认', '测量放线', '土工合成材料进场复验', '土工合成材料铺设和搭接缝合', '上层填料分层摊铺压实', '排水盲沟和反滤层施工', '承载力或变形检测', '地基验收复核']
    return ['配合比和施工参数确认', '测量放线', '材料进场复验', `${itemName}分层或分区施工`, '含水率压实度或厚度检测', '表面整平和标高复核', '承载力或变形检测', '地基验收复核']
  }
  if (code === '01-02-07') return ['桩位复核和试沉桩条件确认', '预制桩进场验收', '桩机就位和垂直度校正', '吊桩喂桩', '沉桩施工', '接桩或焊接连接', '终压或贯入度控制', '桩顶标高复核', '截桩和桩头处理', '静载或低应变检测', '桩基验收复核']
  if (code === '01-02-08') return ['桩位放样和护筒埋设', '泥浆制备和循环系统检查', '钻机就位和成孔施工', '孔深孔径垂直度检测', '一次清孔', '钢筋笼制作安装', '导管安装和二次清孔', '水下混凝土灌注', '桩顶超灌和浮浆处理', '桩身完整性检测', '桩基验收复核']
  if (code === '01-02-09') return ['桩位放样', '钻机就位和垂直度校正', '干作业成孔施工', '孔深孔径和垂直度检测', '孔底清理', '钢筋笼制作安装', '混凝土浇筑和振捣', '桩顶保护和养护', '桩身完整性检测', '桩基验收复核']
  if (code === '01-02-10') return ['桩位放样', '长螺旋钻机就位', '连续钻进成孔', '终孔深度和电流参数确认', '泵送混凝土压灌', '提钻速度和充盈系数控制', '后插钢筋笼', '桩顶混凝土处理', '桩身完整性检测', '桩基验收复核']
  if (code === '01-02-11') return ['桩位放样', '沉管设备就位', '试沉管和贯入控制', '沉管成孔', '钢筋笼安放', '混凝土灌注', '拔管速度和充盈系数控制', '桩顶标高复核', '桩身质量检测', '桩基验收复核']
  if (code === '01-02-12') return ['钢桩进场验收', '桩位复核和导向架设置', '试桩或首件确认', '钢桩吊装喂桩', '沉桩施工', '接桩焊接或法兰连接', '贯入度或终压力控制', '桩顶切割和防腐补刷', '桩身偏位复核', '承载力或完整性检测', '桩基验收复核']
  if (code === '01-02-13') return ['压桩孔位和反力条件复核', '锚杆或反力架安装验收', '预制桩进场验收', '静压设备就位', '压桩施工', '接桩连接和垂直度校正', '终压值和稳压时间记录', '封桩或桩头处理', '沉降观测点复核', '承载力检测和验收']
  if (code === '01-03-01') return ['排桩轴线和桩位复核', '护筒或导墙施工', '隔桩跳打时序确认(邻桩终凝后方可成孔)', '成孔施工', '成孔质量检测', '钢筋笼制作安装', '混凝土灌注', '冠梁钢筋模板施工', '冠梁混凝土浇筑', '桩间土处理和挂网喷护', '支护桩检测和基坑监测移交']
  if (code === '01-04-01') return ['降排水方案和井点布置复核', '降水井或井点施工', '排水沟集水井施工', '水泵管线和电源安装', '试抽水和水位观测', '连续运行监测', '沉降或周边巡检', '封井或降水移交']
  if (code === '01-04-02') return ['回灌方案和水源条件复核', '回灌井施工', '回灌管线和计量装置安装', '试回灌和水位响应观测', '回灌水量水位控制', '水质和堵塞情况检查', '周边沉降巡检', '回灌停用和移交']
  if (code === '01-07-05') return ['注浆方案和试验段确认', '注浆孔定位放线', '钻孔成孔和孔深复核', '浆液配合比确认', '注浆管安装', '分序分段注浆', '压力流量和注浆量记录', '封孔养护', '注浆效果检测和验收']
  if (code === '02-03-01') return ['钢结构焊接工艺评定和作业交底', '钢结构焊材进场复验和焊材烘干保温', '钢构件坡口加工和组对复核', '定位焊和预热控制', '正式焊接和层间温度记录', '焊缝外观检查', '无损检测委托和报告复核', '返修闭合和钢结构焊缝验收']
  if (code === '02-06-01') return ['铝合金焊接工艺评定和保护气体确认', '铝合金焊丝母材进场复验', '坡口清理和氧化膜去除', '装配间隙和夹具定位复核', '氩气保护焊接和热输入控制', '焊缝成形外观和热影响区检查', '渗透检测或无损检测报告复核', '返修闭合和铝合金焊缝验收']
  if (code === '02-03-07') return ['预应力或膜结构专项方案复核', '索膜材料和锚具进场验收', '支承结构和锚固节点复核', '索膜展开吊装或预应力筋安装', '张拉设备标定', '分级张拉和形态控制', '节点固定和防腐密封处理', '张拉记录复核和质量验收']
  if (code === '03-05-01') return ['吊顶深化排版和标高复核', '吊杆定位和防腐处理', '吊杆安装', '主龙骨安装调平', '次龙骨安装和机电末端点位复核', '隐蔽验收', '石膏板封板和自攻钉防锈处理', '板缝嵌缝贴带批嵌打磨', '涂饰交接和观感复测']
  if (code === '03-05-02') return ['吊顶深化排版和标高复核', '吊杆定位和边龙骨固定复核', '吊杆安装', 'T型龙骨安装调平', '机电末端点位和检修口边框复核', '隐蔽验收', '矿棉板或铝扣板逐间安装', '灯具风口和检修口收边', '板块吊顶观感复测和移交']
  if (code === '03-05-03') return ['格栅模数深化和标高复核', '吊杆定位和转换层防腐处理', '吊杆安装', '主副骨架定位和吊挂调平', '喷淋灯具风口避让复核', '隐蔽验收', '格栅单元拼装和分区安装', '端部转角收边和检修口处理', '格栅吊顶观感复测和移交']
  if (code === '03-06-01') return ['隔墙定位放线', '条板排板和门洞界面复核', '板材进场复验和U卡连接件检查', '条板安装和U卡固定', '管线槽口和洞口加固配合', '板缝灌浆和隔声防火节点处理', '顶部柔性塞缝和抗裂带处理', '垂直平整实测', '板材隔墙观感复测和工序交接']
  if (code === '03-06-02') return ['隔墙定位放线', '门洞和结构界面复核', '天地龙骨固定和竖龙骨排布', '管线穿墙盒和填充棉施工', '单面封板和隐蔽检查', '双面封板和隔声防火节点处理', '板缝嵌缝贴带和抗裂处理', '垂直平整实测', '骨架隔墙观感复测和工序交接']
  if (code === '03-06-03') return ['隔墙定位放线', '轨道预埋和结构界面复核', '上轨下轨和吊轮滑轮进场复验', '轨道安装调平和限位件固定', '活动隔扇吊挂和垂直度调整', '收纳位门套和隔声密封处理', '启闭运行和锁闭功能调试', '垂直平整实测', '活动隔墙观感复测和工序交接']
  if (code === '03-06-04') return ['隔墙定位放线', '玻璃槽口和金属框界面复核', '钢化或夹胶玻璃进场复验', '金属框和槽口安装固定', '玻璃就位和垫块调整', '压条固定和防坠节点复核', '密封胶施工和防撞标识安装', '垂直平整实测', '玻璃隔墙观感复测和安全验收']
  if (code === '03-04-05') return ['玻璃规格和镀膜面复核', '槽口清理和垫块布置', '玻璃就位安装', '压条或扣件固定', '密封胶相容性确认', '密封胶施工', '防坠落措施复核', '成品保护', '外观和启闭功能验收']
  if (code.startsWith('03-07')) {
    const veneerProcessesByCode: Record<string, string[]> = {
      '03-07-01': ['石板排版深化和控制线复核', '基层承载和埋件条件检查', '石板厚度色差和编号复验', '背栓开孔或石板开槽加工复核', '干挂连接件安装和防腐处理', '石板就位固定和临时支撑拆除', '缝宽垂直平整和固定质量复测', '嵌缝打胶防污染清理', '石板饰面观感验收'],
      '03-07-02': ['陶瓷板排版和控制线复核', '基层平整度强度和含水率检查', '陶瓷板规格色差和吸水率复验', '粘结砂浆或胶粘剂配制试贴', '陶瓷板铺贴和满粘率控制', '缝宽垂直平整复测', '勾缝擦缝和表面清理', '空鼓拉拔和粘结强度抽测', '陶瓷板饰面观感验收'],
      '03-07-03': ['木板含水率和防火等级复验', '基层防潮和木龙骨定位复核', '木龙骨防火防潮处理', '木板排版裁切和试拼', '木板饰面钉或卡件固定', '接缝留设和阴阳角收口', '平整度色差和翘曲复测', '表面修补清理和成品保护', '木板饰面观感验收'],
      '03-07-04': ['金属板龙骨和埋件条件复核', '金属板规格涂层和色差复验', '连接件防腐和绝缘垫片设置', '龙骨找平和分格定位', '金属板扣件或螺钉固定', '热胀冷缩伸缩缝和排水节点复核', '板面平整度和接缝宽度复测', '保护膜揭除和表面清理', '金属板饰面观感验收'],
      '03-07-05': ['塑料板裁切排版和控制线复核', '基层平整干燥和界面处理', '塑料板规格燃烧性能和色差复验', '专用胶粘剂或卡条安装', '塑料板就位压实和变形控制', '接缝收边和阴阳角处理', '翘曲起鼓和污染检查', '修补清理和成品保护', '塑料板饰面观感验收'],
    }
    const veneerProcesses = veneerProcessesByCode[code]
    if (veneerProcesses) return veneerProcesses
    const facingName = itemName.replace(/安装$/, '')
    return ['排版深化和控制线复核', '基层平整度和强度检查', '材料进场复验', '连接件或粘结层施工', `${facingName}就位固定`, '缝宽和垂直平整复测', '嵌缝打胶和清理', '空鼓松动或固定质量检查', '观感验收']
  }
  if (code.startsWith('03-08')) return ['基层处理和排砖放线', '饰面砖进场复验', '粘结材料配合比确认', '样板墙确认', `${itemName}施工`, '勾缝擦缝', '空鼓拉拔或粘结强度检查', '阴阳角和洞口收口', '观感验收']
  if (code === '03-09-01') return ['深化图和分格复核', '测量放线', '预埋件或后置埋件复核', '连接件安装', '立柱横梁安装', '防雷连接和防火封堵', '玻璃板块安装', '耐候密封胶施工', '淋水检查和验收']
  if (code === '03-09-02') return ['深化图和分格复核', '测量放线', '埋件和连接件复核', '龙骨安装校正', '防雷连接和防腐处理', '保温层和防火封堵配合', '金属板安装', '打胶收口和表面清理', '外观检查和验收']
  if (code === '03-09-03') return ['深化图和分格复核', '测量放线', '埋件和龙骨复核', '挂件安装', '石材开槽和编号复核', '石材板块安装', '缝隙调整和防污染保护', '密封胶施工', '外观检查和验收']
  if (code === '03-09-04') return ['深化图和分格复核', '测量放线', '埋件和连接件复核', '龙骨安装校正', '陶板挂件安装', '陶板板块安装', '缝隙调整和排水构造复核', '打胶收口', '外观检查和验收']
  if (code.startsWith('03-10')) return ['基层含水率和强度检查', '基层清理和局部修补', '腻子或找补施工', '打磨清理', '样板确认', `${itemName}底层施工`, `${itemName}面层施工`, '色差污染修补', '观感复测和交接签认']
  if (code === '03-11-01') return ['基层平整度含水率和封闭条件复核', '墙纸墙布裁幅和对花排版', '胶粘剂开放时间和基层含水率复核', '裱糊铺贴和拼缝压实', '阴阳角搭接和边口收压', '气泡皱折返修和污染清理', '色差接缝和翘边复查', '裱糊观感复测和交接签认']
  if (code === '03-11-02') return ['基层板防火防腐和软包分格复核', '填充层和阻燃面料复验', '基层龙骨和固定点施工', '软包面料绷包和压条固定', '阴阳角收边和碰口处理', '平整饱满度和防污染检查', '压条牢固性和面料污染返修', '软包观感复测和交接签认']
  if (code === '03-12-01') return ['橱柜柜体排版和安装尺寸复核', '基层墙地面和给排水电气接口复核', '柜体板材台面和五金配件进场验收', '柜体组装封边和开孔处理', '吊柜地柜定位安装和水平垂直校正', '台面安装接缝和挡水收口处理', '铰链滑轨拉篮等五金功能调试', '门板缝隙和封边观感复测', '橱柜成品保护和移交验收']
  if (code === '03-12-02') return ['窗帘盒窗台板深化尺寸和标高复核', '窗帘盒基层龙骨和窗台板基层复核', '基层龙骨防腐防火处理和固定', '窗帘盒面板制作安装', '窗台板安装和泛水坡度复核', '阴阳角拼缝和端部收口处理', '轨道预留和检修空间复核', '表面修补清理和成品保护', '窗帘盒窗台板观感验收']
  if (code === '03-12-03') return ['洞口尺寸和基层平整复核', '套线基层防潮处理', '门窗套基层板安装', '饰面板或线条安装', '阴阳角和拼缝收口', '五金或连接件固定', '打胶修补和表面清理', '成品保护', '观感和尺寸复测']
  if (code === '03-12-04') return ['护栏扶手深化尺寸和防坠要求复核', '预埋件后置埋件和基层承载复核', '护栏立柱定位放线和钻孔安装', '护栏栏杆或玻璃栏板安装固定', '扶手转角端头和连接件安装', '高度间距和防坠构造复测', '牢固性抗水平荷载检查', '焊口打磨防腐和收口处理', '护栏扶手安全验收移交']
  if (code === '03-12-05') return ['花饰图案定位放线和排版复核', '花饰构件材质规格和样板确认', '基层平整度和粘结界面处理', '花饰粘结砂浆或胶粘剂配制', '花饰构件安装锚固和临时固定', '拼缝顺直和阴阳角收口处理', '锚固点补强和空鼓脱落检查', '表面修补清理和成品保护', '花饰观感复测和验收移交']
  if (code.startsWith('03-12') && !itemName.includes('门窗套')) return ['深化排版和尺寸复核', '基层和预埋件复核', '构件制作或进场验收', '安装定位放线', '构件安装固定', '五金或连接件功能调试', '细部收口处理', '成品保护复查', '观感复测和工序交接']
  if (code.startsWith('04-02')) {
    if (itemName.includes('板块材料')) return ['基层检查和排版放线', '板块保温材料进场复验', '粘结或铺设基层处理', '板块保温层铺设', '板缝错缝和热桥处理', '厚度和平整度复核', '保护层或找平层交接', '保温层验收']
    if (itemName.includes('纤维材料')) return ['基层检查和防潮条件复核', '纤维保温材料进场复验', '铺设区域排版', '纤维保温层铺设', '压实厚度和缝隙处理', '防风防潮保护', '保护层交接', '保温层验收']
    if (itemName.includes('喷涂硬泡')) return ['基层干燥度和平整度检查', '喷涂材料和设备复验', '试喷样板确认', '分遍喷涂施工', '厚度和密度检测', '表面修整和节点收口', '保护层交接', '保温层验收']
    if (itemName.includes('种植')) return ['防水保护层和排水坡向复核', '排水板和过滤层施工', '阻根层或保护层复核', '种植介质铺设', '排水口和溢流口检查', '蓄排水试验', '种植层成品保护', '隔热层验收']
    if (itemName.includes('架空')) return ['基层和支座布置复核', '架空板或支墩材料复验', '支座安装找平', '架空板铺设', '板缝和检修通道处理', '排水通风构造检查', '稳固性复核', '隔热层验收']
    if (itemName.includes('蓄水')) return ['基层防水和坡向复核', '蓄水区分格和挡水构造施工', '溢流口和排水口安装', '蓄水层施工', '水位控制和渗漏检查', '蓄水运行观察', '安全防护和成品保护', '隔热层验收']
  }
  if (code === '07-02-02') return ['变配电室柜列基础槽钢和接地复核', '成套配电柜控制柜开箱验收和柜列排布确认', '柜列就位找正固定和垂直度复测', '柜间母排搭接和力矩复核', '二次回路端子接线和线号核对', 'CT/PT保护回路和五防闭锁校验', '局部放电耐压绝缘和接地试验', '保护整定和功能试验', '变配电室配电柜送电试运行']
  if (code === '07-02-03') return ['母线槽支架路径净距和吊装条件复核', '母线槽分段吊装和直线段安装', '弯头三通连接器和连接螺栓扭矩复核', '插接箱安装固定和回路标识', '伸缩节和穿越部位防火封堵设置', '母线槽外壳接地跨接和接地连续性测试', '母线槽绝缘和相序测试', '通电温升巡检和负载记录', '变配电室母线槽功能复测和交接签认']
  if (code === '07-03-01') return ['供电干线回路编号核对和绝缘电阻测试', '供电干线相序核验调试和接地连续性复核', '保护装置整定调试和动作值复核', '送电条件确认和安全许可签认', '供电干线分段送电和空载试运行', '负载运行记录调试与异常回路修补复测']
  if (code === '07-04-03') return ['电机铭牌回路和动力柜编号核对', '控制回路点动调试和就地远程切换测试', '热继电器保护参数整定调试和复核', '电机正反转校验调试和机械空载试运行', '电气动力带载试运行和电流温升记录', '急停联锁测试调试和运行记录闭合']
  if (code === '07-06-02') return ['柴油发电机组基础验收和减振条件复核', '柴油发电机组开箱验收和吊装就位', '排烟管消声器和防火隔热安装', '燃油日用油箱和供回油管路连接', '冷却通风和进排风百叶接口复核', '电缆母线和控制回路接线', '空载试运行和噪声振动记录', '负载试验和ATS自动切换联动', '柴油发电机组验收移交']
  if (code === '07-06-03') return ['UPS/EPS基础型钢电池架和通风条件复核', 'UPS/EPS柜体就位和旁路柜安装', '蓄电池组安装接线和极性标识', '输入输出馈线和接地连接复核', '监控通讯和告警回路接入', '绝缘接地和蓄电池内阻测试', '充放电和旁路切换测试', '应急供电持续时间验证', 'UPS/EPS装置验收移交']
  if (code === '07-06-04') return ['母线槽支架安装和路径净距复核', '母线槽分段吊装和直线段安装', '弯头三通和插接箱安装固定', '母线槽连接螺栓扭矩复核', '伸缩节和防火封堵设置', '外壳接地跨接和相序核对', '母线槽绝缘和相序测试', '通电温升巡检和负载记录', '备用电源母线槽验收移交']
  if (code === '07-01-01') return ['箱变基础预埋和接地复核', '变压器本体及箱变设备开箱验收', '变压器本体就位固定和高低压套管检查', '高压电缆低压母排和低压母排连接', '二次回路机械电气联锁接线复核', '绝缘耐压接地和油样或温控测试', '保护整定和联锁功能试验', '送电冲击试验和空载运行记录', '室外箱变变压器验收移交']
  if (code === '07-01-02') return ['柜列基础预埋槽钢和接地复核', '室外柜列设备开箱验收和柜列排布确认', '柜列就位固定和垂直度复测', '柜列母排电缆压接和力矩复核', '二次回路接线回路标识和线号核对', '机械电气联锁和防护等级检查', '绝缘接地和回路功能试验', '保护整定或功能试验', '室外配电柜送电试运行']
  if (code.startsWith('07-') && includesAny(itemName, ['变压器', '箱式变电所', '配电柜', '控制柜', '配电箱', '母线槽', '不间断电源', '应急电源', '柴油发电机'])) {
    return ['基础槽钢和接地复核', '设备开箱验收', '设备就位固定', '母线或电缆连接', '二次回路接线复核', '绝缘和接地测试', '高压柜局部放电测试', '保护整定或功能试验', '送电试运行']
  }
  const electricalCableTerminationProcessesByCode: Record<string, string[]> = {
    '07-01-07': ['室外电缆端头防水界面复核', '室外电缆剥切尺寸和相色确认', '户外终端压接和芯线连接', '热缩冷缩绝缘和防水密封处理', '屏蔽层接地和相序核对', '室外电缆绝缘耐压测试', '标识挂牌和测试记录复核'],
    '07-02-06': ['变配电室高压电缆头位置和柜内净距复核', '高压电缆头剥切尺寸和应力锥处理施工', '柜内端子压接施工和母排连接复核', '屏蔽层接地安装和相色标识', '相序核对和机械固定安装检查', '高压电缆头耐压试验执行', '变配电室电缆终端记录复核'],
    '07-03-07': ['供电干线电缆端头路径标识复核', '干线电缆剥切尺寸和相位核对', '干线导体压接和连接固定', '绝缘包扎和热缩密封处理', '桥架穿越处路径标识和防火封堵复查', '供电干线绝缘测试', '干线电缆终端测试记录复核'],
    '07-04-08': ['动力回路电缆端头和电动机编号复核', '动力电缆剥切和控制线分线整理', '主回路端子压接和控制线端接', '绝缘包扎和接地连续性处理', '电动机相序和保护回路核对', '试运转前动力回路绝缘测试', '动力回路终端记录复核'],
    '07-05-07': ['照明回路编号和灯具支路范围复核', '照明电缆导线端头剥切整理', '支路导线压接和连接固定', '绝缘包扎和接线盒封闭处理', '回路编号相色和开关控制关系核对', '照明回路绝缘复测', '通电条件确认和测试记录复核'],
    '07-06-08': ['备用电源电缆终端和双电源回路复核', 'UPS/EPS输入输出和发电机馈线剥切处理', '应急回路端子压接和连接固定', '绝缘包扎屏蔽接地和防火封堵处理', '双电源相序和切换回路核对', '备用电源绝缘耐压测试', '应急回路标识挂牌和记录复核'],
  }
  if (electricalCableTerminationProcessesByCode[code]) return electricalCableTerminationProcessesByCode[code]
  if (code.startsWith('07-') && itemName.includes('电缆头制作')) return ['电缆端头剥切处理', '芯线压接或连接', '绝缘包扎和热缩处理', '屏蔽层和接地处理', '相序和回路标识', '绝缘耐压测试', '测试记录复核']

  const electricalLightingDeviceProcessesByCode: Record<string, string[]> = {
    '07-01-08': ['室外普通灯具基础和灯杆垂直度复核', '室外普通灯具防水接线盒和灯具进场验收', '灯杆灯臂和灯具本体安装固定', '电源接线接地和防水密封处理', '回路通电试运行和相序检查', '夜间照度和眩光复测', '室外普通灯具标识和成品保护'],
    '07-01-09': ['室外专用灯具安装界面和防眩角度复核', '景观投光或泛光灯具进场验收', '专用支架基础和防水接线盒安装', '室外专用灯具本体安装固定', '防水密封接线和接地连接', '景观照明场景测试和照射范围复测', '室外专用灯具成品保护验收'],
    '07-05-08': ['室内普通灯具排布和吊杆位置复核', '室内普通灯具和光源进场验收', '吊杆吊链或嵌入式支架安装', '灯具本体安装和灯具支路接线', '接地连续性和回路编号复核', '通电试运行和照度复测', '室内普通灯具成品保护验收'],
    '07-05-09': ['专用灯具和应急照明布点复核', '应急照明疏散指示和集中电源资料验收', '专用灯具支架或吊装件安装', '应急照明和疏散指示本体安装接线', '消防联动和强启回路测试', '蓄电池或集中电源持续时间验证', '专用灯具功能验收移交'],
    '07-05-10': ['开关插座风扇点位和底盒标高复核', '开关插座风扇本体进场验收', '开关面板插座和风扇本体安装固定', '导线接线端子压接和接地连接', '插座极性和漏电保护测试', '风扇转向和调速功能检查', '开关插座风扇成品保护验收'],
  }
  if (electricalLightingDeviceProcessesByCode[code]) return electricalLightingDeviceProcessesByCode[code]
  if (code.startsWith('07-') && includesAny(itemName, ['普通灯具', '专用灯具', '开关', '插座', '风扇'])) return ['定位开孔和底盒复核', '本体进场验收', '灯具或器具安装固定', '接线和接地连接', '通电试运行', '照度或功能检查', '回路标识和成品保护']

  const electricalGroundingProcessesByCode: Record<string, string[]> = {
    '07-01-11': ['室外接地极位置和接地沟槽复核', '接地材料进场复验', '室外接地极敷设和接地干线连接', '焊接搭接和防腐处理', '测试点和标识设置', '接地电阻测试', '室外接地隐蔽验收'],
    '07-02-07': ['变配电室接地网和设备基础接地复核', '接地材料和连接件进场复验', '接地网敷设和设备基础接地连接', '柜体接地和门跨接施工', '焊接搭接防腐和测试点设置', '变配电室接地电阻测试', '变配电室接地装置验收'],
    '07-02-08': ['变配电室接地干线路径复核', '接地母排和接地干线材料复验', '接地母排安装和接地干线敷设', '桥架柜体和设备接地支线连接', '等电位联结和跨接复核', '变配电室接地干线导通测试', '接地干线标识和验收'],
    '07-03-08': ['供电干线接地路径和桥架接地点复核', '接地干线和跨接线材料复验', '供电干线接地干线敷设', '桥架接地和母线槽外壳跨接', '穿越伸缩处软跨接和防腐处理', '供电干线接地导通测试', '供电干线接地验收'],
    '07-06-09': ['备用电源接地方案和设备接地点复核', '柴油发电机UPS/EPS和电池架接地材料复验', '柴油发电机机座和排烟管接地连接', 'UPS/EPS柜体和电池架接地连接', '应急配电回路和双电源柜跨接复核', '备用电源接地连续性测试', '备用电源接地验收移交'],
  }
  if (electricalGroundingProcessesByCode[code]) return electricalGroundingProcessesByCode[code]
  if (code.startsWith('07-') && !code.startsWith('07-07') && includesAny(itemName, ['接地装置安装', '接地干线敷设'])) return ['接地材料进场复验', '接地体或干线敷设', '焊接搭接和防腐处理', '等电位或设备跨接', '测试点和标识设置', '接地电阻或导通测试', '隐蔽验收']
  if (code === '07-07-01') return ['接地材料进场复验', '接地沟槽或基础条件复核', '接地极敷设', '接地干线焊接连接', '防腐处理', '接地电阻测试', '隐蔽验收', '标识和测试点设置', '防雷接地验收']
  if (code === '07-07-02') return ['引下线位置复核', '主筋或专用引下线连接', '焊接搭接长度检查', '断接卡或测试点安装', '屋面接闪带支架安装', '接闪带或接闪杆安装', '防腐和标识处理', '导通测试', '防雷验收']
  if (code === '07-07-03') return ['等电位端子箱定位', '卫生间和设备间连接点复核', '等电位干线敷设', '金属管线和设备跨接', '连接端子压接或焊接', '导通连续性测试', '隐蔽验收', '标识和记录复核']
  if (code === '07-07-04') return ['浪涌保护器规格复核', '配电箱柜安装界面确认', 'SPD本体安装', '前级保护和接线复核', 'PE线连接和接地连续性测试', '状态指示检查', '回路标识', '调试记录和验收']
  if (code === '08-19-01') return ['机房接地方案复核', '接地材料进场复验', '接地体敷设', '接地干线引入', '防腐和标识处理', '接地电阻测试', '隐蔽验收', '接地系统移交']
  if (code === '08-19-02') return ['接地线规格和路径复核', '桥架机柜接地点确认', '接地线敷设', '端子压接和防松处理', '跨接连接复核', '导通连续性测试', '线缆标识', '验收记录复核']
  if (code === '08-19-03') return ['等电位联接范围确认', '端子箱和汇流排安装', '设备外壳和金属管槽联接', '屏蔽层接地处理', '导通连续性测试', '标识挂牌', '验收记录复核']
  if (code === '08-19-04') return ['屏蔽门框安装', '波导窗安装', '滤波器接入', '穿墙套管屏蔽封堵', '搭接电阻测试', '接地汇流排连接', '屏蔽效能复测', '屏蔽设施专项验收签认']
  if (code === '08-19-05') return ['电涌保护器规格复核', '安装位置和回路界面确认', 'SPD本体安装', '保护接线和接地连接', '前级保护配合复核', '状态指示和告警测试', '标识挂牌', '验收记录复核']
  if (code === '08-19-06') return ['防雷接地线缆路径复核', '线缆规格和屏蔽层检查', '线缆敷设', '端接压接和屏蔽接地', '弯曲半径和固定间距复核', '绝缘或导通测试', '标识挂牌', '隐蔽验收']
  if (code === '08-19-07') return ['接地测试条件确认', '接地电阻测试', '等电位导通测试', 'SPD状态测试', '屏蔽效能或干扰复测', '问题整改闭合', '测试报告复核', '系统调试验收']
  if (code === '08-19-08') return ['试运行条件确认', '设备接地状态巡检', 'SPD运行状态巡检', '监控告警联动检查', '异常记录和整改', '试运行数据汇总', '运维资料移交']
  if (code.startsWith('09-01')) {
    if (itemName.includes('墙体')) return ['基层墙体检查', '保温材料进场复验', '界面处理和控制线复核', '保温板粘贴或锚固', '防火隔离带施工', '抗裂砂浆和网格布施工', '热桥节点处理', '拉拔或钻芯检测', '节能验收']
    if (itemName.includes('幕墙')) return ['幕墙节能深化复核', '型材玻璃和保温材料复验', '热桥隔断和连接节点施工', '保温层安装', '气密水密节点密封', '防火封堵配合', '传热或气密性能资料复核', '现场淋水或气密检查', '节能验收']
    if (itemName.includes('门窗')) return ['洞口尺寸和副框复核', '门窗型材玻璃复验', '节能性能资料核查', '框体安装固定', '发泡塞缝和密封处理', '五金和开启扇调试', '气密水密现场检测', '成品保护', '节能验收']
    if (itemName.includes('屋面')) return ['基层坡度和含水率检查', '保温材料进场复验', '排版放线', '保温层铺设', '找坡找平和排气构造处理', '热桥和女儿墙节点处理', '保护层施工', '厚度或热工性能复核', '节能验收']
    if (itemName.includes('地面')) return ['基层清理和标高复核', '保温材料进场复验', '防潮或隔离层施工', '保温层铺设', '边角和穿管节点处理', '保护层或面层配合施工', '厚度和压实平整复核', '节能验收']
  }
  if (code.startsWith('09-02')) {
    if (itemName.includes('供暖节能')) return ['设备和阀部件进场复验', '管网保温界面复核', '热计量装置安装', '水力平衡阀安装', '系统冲洗和试压', '保温施工', '热计量和平衡调试', '节能验收']
    if (itemName.includes('通风与空调设备')) return [
      '设备能效和空调箱风机盘管清单复核',
      '设备基础减振和检修空间复核',
      '空调箱风机盘管或末端设备就位固定',
      '风管水管冷凝水接口连接',
      '过滤器阀件和保温防冷桥安装',
      '电源自控点位接线和控制阀执行器联调',
      '设备带载试运行噪声振动电流实测作业',
      '风量水量温差参数测试',
      '节能验收和问题销项签认',
    ]
    if (itemName.includes('冷热源')) return ['冷热源设备COP或IPLV和能效等级资料复核', '冷水机组热泵锅炉效率和容量边界确认', '一次二次泵变频和阀组计量点安装', '冷热源水系统水力平衡调试准备', '供回水温差和流量计热量表复核', '群控策略和BMS能耗采集联调', '部分负荷运行能效参数测试', '节能调试报告和验收移交']
    if (itemName.includes('管网')) return ['管网路径和支吊架复核', '阀门仪表进场复验', '管道安装和坡度复核', '水压试验', '冲洗和水力平衡准备', '管道保温施工', '水力平衡调试', '节能验收']
  }
  if (code.startsWith('09-03')) {
    if (itemName.includes('配电')) return ['配电系统设计参数复核', '电缆母线和配电设备复验', '配电设备安装', '回路接线和标识', '绝缘和接地测试', '三相负荷平衡检查', '电能计量装置调试', '节能验收']
    if (itemName.includes('照明')) return ['照明功率密度和控制分区复核', '灯具和光源进场复验', '灯具安装', '开关和控制模块安装', '通电试运行', '照度和功率密度测试', '场景控制调试', '节能验收']
  }
  if (code.startsWith('09-04')) {
    if (itemName.includes('监测')) return [
      '监测点表、分项计量边界和采集频率复核',
      '电能表、冷热量表、水表和传感器进场复验',
      '计量表具、测点箱和现场传感器安装',
      'RS485/以太网通讯线缆敷设、屏蔽接地和地址编号',
      '采集网关安装、协议映射和点位参数写入',
      '分项能耗采集链路联调和缺失数据排查',
      '人工抄表、BMS数据和平台曲线一致性复核',
      '节能监测验收、异常点销项和运维移交',
    ]
    if (itemName.includes('控制')) return [
      '控制策略点表和节能场景边界复核',
      'DDC控制器、I/O模块和阀门执行器安装',
      '控制电源、通讯总线和屏蔽接地接线',
      '单点输入输出动作测试和点表回写',
      '新风量、水阀和风机变频联动控制调试',
      '分区温控、时段启停和削峰控制策略调试',
      '运行趋势偏差复核和控制参数回写',
      '策略冻结、节能控制验收和运维移交',
    ]
  }
  if (code.startsWith('09-05')) {
    if (itemName.includes('地源热泵')) return ['地埋换热孔和水源井取排水条件复核', '钻孔参数、孔深垂直度和水源井成井施工', '地埋管下管、回填料配比和水平集管连接', '换热回路试压保压和热响应测试', '机房热泵机组、水泵阀组和能量计量安装', '循环水系统冲洗试压、充水排气和水质处理', '地源侧负荷侧流量平衡和换热能力复核', 'COP能效运行参数复测、节能验收和运维移交']
    if (itemName.includes('太阳能光热')) return ['集热器阵列朝向倾角和屋面荷载复核', '集热器蓄热水箱和辅助热源设备复验', '支架锚固抗风和屋面防水收口施工', '集热器阵列就位固定和管路接口连接', '蓄热水箱膨胀罐安全阀和补水接口安装', '管路保温防冻液充注和伴热保护施工', '循环泵温控传感器接线、试压冲洗和排气', '集热效率运行参数复核、节能验收和运维移交']
    if (itemName.includes('太阳能光伏')) return ['组串方案阵列分区和极性边界复核', '组件EL隐裂抽检和逆变器进场复验', '支架锚固压载和螺栓扭矩复验', '组件倾角方位遮挡复核和组串编号安装', 'MC4接头压接、开路电压短路电流和组串极性测试', '汇流箱熔断器SPD和防雷等电位接入', '逆变器DC/AC端接和孤岛保护参数校验', 'IV曲线电能质量试运行数据复核和运维移交']
  }
  if (code === '10-01-01') return ['装箱清单和合格文件核查', '曳引机曳引轮和制动器开箱验收', '控制柜限速器和安全部件清点', '导轨门系统和层门部件清点', '轿厢对重和悬挂装置清点', '随机技术资料及型式试验证明复核', '缺损件登记和进场验收记录签认']
  if (code === '10-02-01') return ['装箱清单和合格文件核查', '液压泵站和控制柜开箱验收', '油缸阀组和油箱部件清点', '油管接头密封件和液压介质清点', '导轨门系统和安全部件清点', '随机技术资料及液压试验证明复核', '缺损件登记和进场验收记录签认']
  if (code === '10-01-02') return ['井道尺寸和垂直度复核', '底坑缓冲器和顶层高度复核', '机房或机柜基础复核', '导轨支架预埋和层门洞口复核', '电源接地和照明条件确认', '吊装通道及脚手架作业平台交接', '土建缺陷整改闭合', '土建交接验收记录']
  if (code === '10-02-02') return ['井道尺寸和垂直度复核', '底坑油缸井和顶层高度复核', '液压泵站基础和检修空间复核', '油管孔洞预埋套管和层门洞口复核', '电源接地和泵站通风温控确认', '井道排油排水和作业平台交接', '土建缺陷整改闭合', '土建交接验收记录']
  if (code === '10-01-13') return ['整机验收条件确认', '慢车运行检查', '快车运行检查', '平层精度和运行舒适性测试', '门锁和安全回路测试', '制动器和限速器安全钳联动试验', '轿厢对重平衡和曳引能力载荷试验', '监督检验问题整改', '竣工资料移交']
  if (code === '10-02-12') return ['整机验收条件确认', '慢车运行检查', '快车运行检查', '平层精度和再平层功能测试', '门锁和安全回路测试', '液压压力油温和沉降试验', '油管泄漏检查和满载压力试验', '监督检验问题整改', '竣工资料移交']
  if (code === '10-03-01') return ['装箱清单和合格文件核查', '桁架梯级扶手带部件清点', '驱动主机和控制柜开箱验收', '安全开关和梳齿板部件核查', '随机技术资料复核', '缺损件登记和补齐确认', '进场验收记录签认']
  if (code === '10-03-02') return ['土建洞口和支承梁复核', '上下支承面标高复核', '吊装通道和临边防护确认', '电源接地和检修空间确认', '预埋件和装修界面复核', '土建缺陷整改闭合', '土建交接验收记录']
  if (code === '10-03-03') return ['桁架吊装就位', '水平度和中心线复测', '梯级链和扶手带安装调试', '梳齿板和围裙板间隙检查', '安全开关联动测试', '空载和制动试运行', '制动距离测试(空载+满载)', '梯级和扶手带同步率测试', '运行噪声和振动检查', '监督检验问题整改', '竣工资料移交']

  // 01-03 基坑支护（补齐01-03-02~10 共9项）
  if (code === '01-03-02') return ['板桩轴线和桩位复核', '板桩进场验收', '沉桩设备就位', '板桩沉桩施工', '垂直度和平面位置复核', '锁口止水效果检查', '桩顶围檩和锚拉连接', '桩身变形监测', '板桩墙验收']
  if (code === '01-03-03') return ['咬合桩轴线和桩位复核', '护筒或导墙施工', '套管钻机就位和成孔', '素桩和荤桩交替施工时序控制', '成孔质量检测', '钢筋笼制作安装', '混凝土灌注', '桩间咬合效果检查', '冠梁和桩体完整性验收']
  if (code === '01-03-04') return ['三轴搅拌桩机就位和垂直度校正', '水泥浆配制和掺量确认', '下沉喷浆搅拌施工', '提升复搅施工参数记录', 'H型钢插入和垂直度控制', '型钢定位固定', '桩体连续性和冷缝检查', '桩顶冠梁施工', '基坑监测移交和型钢起拔条件确认']
  if (code === '01-03-05') return ['土方开挖和边坡修整(自上而下分层)', '底层混凝土喷射施工', '土钉孔定位和钻孔成孔', '土钉杆体安装和注浆', '钢筋网铺设和与土钉焊接连接', '面层混凝土喷射施工', '泄水孔和排水系统设置', '坡顶坡面坡脚排水沟和监测点布设', '土钉墙验收和基坑监测移交']
  if (code === '01-03-06') return ['导墙定位放线和钢筋模板施工', '导墙混凝土浇筑和养护', '槽段划分和成槽施工', '成槽垂直度和深度检测', '槽底沉渣清孔和泥浆置换', '钢筋笼整幅吊装就位', '导管安装和水下混凝土浇筑', '槽段接头刷洗和接头管/箱拔出', '墙身完整性和接头质量检测验收']
  if (code === '01-03-07') return ['挡墙轴线和基础复核', '水泥土搅拌桩或旋喷桩施工', '成桩连续性和搭接质量检查', '桩顶压顶板或冠梁施工', '墙身监测点布设和初始值采集', '变形和渗漏巡检', '基坑监测移交和挡墙验收']
  if (code === '01-03-08') return ['支撑方案和轴力设计复核', '立柱桩或格构柱施工', '钢支撑或混凝土支撑预制安装', '支撑节点连接和预应力施加(钢支撑)', '支撑轴力监测点布设和初始值采集', '分层开挖过程中的支撑连续监测', '支撑拆除条件和换撑施工', '支撑体系验收']
  if (code === '01-03-09') return ['锚杆轴线和孔位复核', '钻机就位和钻孔施工', '洗孔和孔深孔径检测', '锚杆杆体制作和安放', '一次注浆和二次高压注浆', '腰梁或锚固承压板安装', '锚杆张拉和分级锁定', '锚杆轴力和位移监测', '锚杆验收和基坑监测移交']
  if (code === '01-03-10') return ['主体结构界面和围护体系对接方案复核', '结构预留钢筋或接驳器位置检查', '围护与主体连接部位防水处理', '换撑或传力体系施工', '结构和围护协同变形监测', '结构闭合和防水封闭验收']

  // 02-02 砌体结构
  if (code.startsWith('02-02')) {
    if (itemName.includes('砖砌体')) return ['砖材和砂浆配合比复验', '抄平放线和皮数杆设置', '排砖撂底', '砌筑施工(一顺一丁或梅花丁)', '构造柱马牙槎和拉结筋设置', '腰带圈梁钢筋模板施工', '顶砖斜砌和塞缝处理', '灰缝饱满度和墙面垂直平整检查', '砌体验收']
    if (itemName.includes('小砌块')) return ['砌块和砂浆配合比复验', '抄平放线和皮数杆设置', '排块撂底和芯柱位置核对', '砌块砌筑', '芯柱钢筋和混凝土施工', '构造柱和腰带施工', '顶砖斜砌处理', '垂直平整和灰缝饱满度检查', '砌体验收']
    if (itemName.includes('石砌体')) return ['石材和砂浆配合比复验', '基面或基础交接面处理', '组砌形式和拉结石布置', '分层砌筑施工', '勾缝形式选择和施工', '沉降缝和排水孔设置', '整体稳固性和外观验收']
    if (itemName.includes('配筋砌体')) return ['砌块和钢筋砂浆复验', '芯柱竖向钢筋定位预埋', '水平灰缝钢筋网片铺设', '砌块砌筑和芯柱混凝土浇筑', '构造柱和腰带配合施工', '灌孔和振捣密实检查', '强度和整体性验收']
    return ['材料复验与砂浆试配', '排砖放线', '拉结筋及构造准备', '砌筑施工', '勾缝清理', '质量验收']
  }

  // 03-01 建筑地面
  if (code.startsWith('03-01')) {
    if (itemName.includes('基层铺设')) return ['基层平整度和强度检查', '回填土或垫层材料复验', '分层铺摊压实', '标高控制和坡度复核', '密实度或压实系数检测', '基层验收和养护保护']
    if (itemName.includes('整体面层')) return ['基层清理和凿毛处理', '找平层和结合层施工', '面层材料复验和配合比确认', '整体面层铺设(混凝土或砂浆)', '分格缝设置和标高平整控制', '抹面收光压平', '养护和成品保护', '空鼓开裂和起砂检查', '整体面层验收']
    if (itemName.includes('板块面层')) return ['基层清理和平整度复核', '结合层材料准备', '选料浸砖和试排预排', '板块面层铺贴', '缝宽控制和拨缝修整', '勾缝灌缝和清洁', '空鼓检查', '养护和成品保护', '板块面层验收']
    if (code === '03-01-04' || itemName.includes('木竹面层') || itemName.includes('木、竹面层')) return ['木竹材料含水率复验', '基层防潮隔离处理', '龙骨找平固定或粘结层施工', '木竹面层铺设和固定', '面层拼缝和伸缩缝控制', '踢脚线或边口收口和平整度验收']
  }

  // 03-02 抹灰
  if (code.startsWith('03-02')) {
    if (itemName.includes('一般抹灰')) return ['基层清理和浇水湿润', '不同材料交接处挂网(搭接≥100mm)', '吊垂直套方和贴灰饼', '分层抹灰施工(底→中→面)', '阴阳角护角安装', '孔洞槽盒周边修抹', '养护(≥7天)', '空鼓开裂和垂直平整检查', '抹灰验收']
    if (itemName.includes('保温薄抹灰')) return ['基层处理和界面处理', '保温砂浆或保温层施工', '抗裂砂浆底层施工', '耐碱玻纤网格布铺设', '抗裂砂浆面层施工', '节点和阴阳角加强处理', '厚度和平整度复核', '养护', '保温抹灰验收']
    if (itemName.includes('装饰抹灰')) return ['基层处理和样板确认', '结合层或界面层施工', '装饰面层抹灰(水刷石/斩假石/干粘石)', '纹理颜色和分格缝控制', '冲洗或斩剁工艺控制', '养护和表面清理', '观感验收']
    if (itemName.includes('清水砌体勾缝')) return ['清水砌体墙面清理和灰缝湿润', '灰缝深度和宽度复核', '勾缝砂浆配合比和颜色样板确认', '勾缝砂浆分层压实成型', '表面污染清理和线脚修整', '裂缝空鼓或脱落检查']
  }

  // 03-04-01~04 门窗安装
  if (code === '03-04-01') return ['门窗洞口尺寸和垂直度复核', '木门窗进场验收和含水率检测', '附框或木砖预埋复核', '木门窗框安装固定', '框与墙体缝隙填塞密封', '门扇和五金安装调试', '木门窗防腐防火处理检查', '成品保护和验收']
  if (code === '03-04-02') return ['门窗洞口尺寸和垂直度复核', '金属门窗进场验收和型材壁厚检测', '附框或连接件安装', '金属门窗框安装固定', '框与墙体弹性闭孔材料填塞和密封胶施工', '玻璃和五金安装调试', '防雷接地连接', '成品保护和验收']
  if (code === '03-04-03') return ['门窗洞口尺寸和垂直度复核', '塑料门窗进场验收和增强型钢检查', '附框安装和隔断热桥处理', '塑料门窗框安装固定', '发泡塞缝和密封胶施工', '玻璃和五金安装调试', '排水孔和透气孔检查', '成品保护和验收']
  if (code === '03-04-04') return ['特种门方案和接口条件复核', '特种门进场验收(防火/防盗/人防证书核查)', '门框预埋件和钢骨架复核', '特种门框安装固定', '门扇和闭门器五金安装', '防火封堵或气密处理', '联动功能测试(消防或人防)', '专项检测复核和交接签认']

  // 04-01 屋面基层与保护 / 04-03 防水与密封 / 04-04 瓦面与板面 / 04-05 细部构造
  if (code === '04-01-01') return ['基层清理和出屋面构件根部处理', '结构闭水试验确认', '轻质材料或砂浆找坡施工', '坡度标高复核', '分格缝设置和嵌缝密封', '找平层养护和表面平整复测', '找坡找平层验收']
  if (code === '04-01-02') return ['隔汽层基层含水率和平整度复核', '隔汽材料进场复验', '阴阳角和穿屋面节点附加处理', '隔汽层铺贴或涂布施工', '搭接密封和上翻高度复核', '隔汽层破损修补和完整性检查', '隔汽层验收移交']
  if (code === '04-01-03') return ['隔汽层或隔离层材料复验', '基层平整干燥度确认', '搭接宽度和铺设方向复核', '女儿墙上翻高度和穿出屋面节点密封', '破损褶皱修补和连续性检查']
  if (code === '04-01-04') return ['保护层材料批次复验', '防水层成品保护隔离和作业面确认', '细石混凝土或块材保护层分仓施工', '厚度坡度和排水覆盖复测', '分格缝切缝嵌缝和养护记录', '保护层成品移交验收']
  if (code.startsWith('04-03')) {
    if (itemName.includes('卷材防水层')) return ['基层干燥度和清洁度检查', '涂刷基层处理剂(冷底子油)', '阴阳角和节点附加层施工', '定位弹线', '卷材铺贴(坡度>15%垂直屋脊)', '搭接缝热熔焊合或冷粘密封', '收头处理(压入凹槽+水泥钉+密封膏)', '淋水或蓄水试验', '防水层验收']
    if (itemName.includes('涂膜防水层')) return ['基层干燥度和清洁度检查', '细部节点附加层处理', '涂刷底层涂料', '分层多遍涂布(每遍干燥成膜)', '胎体增强材料铺设(如需)', '分层厚度检测', '收头多遍涂刷密封', '淋水或蓄水试验', '防水层验收']
    if (itemName.includes('复合防水层')) return ['基层干燥度和清洁度检查', '涂膜防水层施工', '涂膜成膜养护', '卷材防水层铺贴', '两层间相容性检查', '收头处理和界面密封', '淋水或蓄水试验', '防水层验收']
    if (itemName.includes('接缝密封')) return ['接缝基层清理和缝宽缝深复核', '底涂或界面剂施工', '背衬材料嵌填深度控制', '密封胶相容性测试和批次复核', '密封胶连续饱满成型施工', '粘结连续性和渗漏复核']
  }
  if (code.startsWith('04-04')) {
    if (itemName.includes('烧结瓦') || itemName.includes('混凝土瓦')) return ['基层或防水保护层检查', '顺水条和挂瓦条安装', '瓦片选瓦和外观检查', '瓦片铺挂(檐口→屋脊)', '脊瓦和斜脊封闭', '瓦钉或铜丝绑扎固定', '天沟檐口细部收口', '成品保护和验收']
    if (itemName.includes('沥青瓦')) return ['基层平整度和干燥度检查', '初始层和檐口泛水安装', '沥青瓦分层铺贴', '搭接和钉固控制', '脊瓦和斜脊封闭', '接缝密封和收口', '成品保护和验收']
    if (itemName.includes('金属板')) return ['支座和檩条安装复核', '金属板进场复验', '金属板铺装(顺水流方向搭接)', '咬边或扣合连接', '泛水板和收边板安装', '防雷连接和接缝密封', '成品保护和验收']
    if (itemName.includes('玻璃采光顶')) return ['支撑结构安装复核', '玻璃和型材复验', '玻璃板块安装', '密封胶相容性确认和打胶施工', '排水和防结露构造检查', '淋水试验', '成品保护和验收']
  }
  if (code.startsWith('04-05')) {
    const roofDetailProcessesByCode: Record<string, string[]> = {
      '04-05-04': ['水落口杯和雨水斗标高复核', '水落口周边找坡和基层处理', '水落口防水附加层和密封收口', '篦子和格栅安装', '通水排放和堵塞检查', '蓄淋水复核和水落口验收'],
      '04-05-05': ['变形缝宽度和两侧基层复核', '变形缝止水带和背衬材料安装', '防水附加层和密封胶施工', '金属盖板支座和泛水收口安装', '位移余量和排水坡向检查', '淋水复核和变形缝验收'],
      '04-05-06': ['伸出屋面套管高度和管根基层复核', '管根防水附加层施工', '管根密封箍和密封膏施工', '立管固定和防晃支架安装', '泛水保护层和收口检查', '淋水复核和管道节点验收'],
      '04-05-09': ['设备基座位置标高和泛水高度复核', '基座锚栓套管和固定件防水预处理', '基座防水附加层和泛水施工', '设备就位前蓄淋水检查', '固定件防水修补和成品保护', '设备基座节点验收'],
      '04-05-11': ['屋顶窗框洞口尺寸和坡向复核', '屋顶窗框固定和防水附加层施工', '泛水板和排水槽安装', '开启扇五金和密封胶条安装', '淋水试验和启闭功能检查', '屋顶窗节点验收'],
    }
    const roofDetailProcesses = roofDetailProcessesByCode[code]
    if (roofDetailProcesses) return roofDetailProcesses
    const detailName = itemName.replace(/^.*(檐口|天沟|水落口|变形缝|管道|出入口|过水孔|基座|屋脊|屋顶窗).*$/, '$1') || itemName
    return [`${detailName}基层和防水收口界面复核`, `${detailName}附加层和密封施工`, `${detailName}泛水或保护层施工`, `${detailName}淋水或闭水检查`, `${detailName}节点拍照留痕`, `${detailName}细部构造验收`]
  }

  // 05-01~08 给排水系统(补齐核心子分部)
  if (code === '05-01-01') return ['预留预埋和孔洞复核', '支吊架制作安装', '给水管道预制加工', '干管安装', '立管安装', '支管和卫生器具接口安装', '阀门和仪表安装', '管道水压试验', '冲洗消毒和水质检测', '管线防腐和标识']
  if (code === '05-01-02') return ['水泵基础减振和水箱基础复核', '水泵或水箱开箱验收', '设备就位找平固定', '吸入口过滤器和进出水阀组连接', '水箱液位电气接线和接地', '自控仪表安装和保护联锁复核', '水泵转向检查单机试运转', '振动噪声复测系统联调和验收']
  if (code === '05-01-03') return ['预留预埋和孔洞复核', '支吊架安装', '消火栓管网预制安装', '立管和环管连接', '消火栓箱体安装', '水枪水带按钮配置和箱体编号复核', '水泵接合器接口标识倒流防护安装', '水压试验和冲洗', '最不利点试射压力充实水柱和消防按钮启泵反馈测试', '消防检测问题销项验收和运维资料移交']
  if (code === '05-01-04') return ['预留预埋和孔洞复核', '支吊架安装', '喷淋主管和支管安装', '报警阀组压力开关水力警铃和水流指示器安装', '末端试水装置排水路径和流量压力记录', '喷头间距遮挡装饰面标高和热敏元件复核', '喷淋泵和水泵接合器连接', '湿式系统充水排气水压试验和冲洗', '报警阀末端试水喷淋泵联动启泵反馈和喷水见证测试', '喷淋检测整改销项验收和运维资料移交']
  if (code.startsWith('05-02')) return ['预留预埋和孔洞复核', '支吊架安装', '排水立管安装', '排水支管和坡度安装', '通气管和透气帽安装', '检查口和清扫口安装', '灌水试验', '通球试验', '管道标识和成品保护']
  if (code === '05-03-01') return ['预留预埋和孔洞复核', '支吊架制作安装', '室内热水管道预制加工', '室内热水管道安装和接口复核', '管道补偿器和排气阀安装', '阀门和仪表安装', '管道水压试压和冲洗', '管道标识成品保护和验收']
  if (code === '05-03-02') return ['水加热器换热器基础和接口条件复核', '辅助设备开箱验收和资料核验', '水加热设备就位找平固定', '热水循环泵安装和减振连接', '膨胀罐安全阀温控阀附件安装', '设备管路阀组和仪表接入', '辅助设备单机试运行和保护功能测试', '辅助设备验收和运行参数移交']
  if (code === '05-03-03') return ['防腐范围和基层状态复核', '金属表面除锈和清洁处理', '防腐材料批次复验和配套性确认', '防腐底漆涂刷和边角补强', '防腐面漆分遍涂装和遍间检查', '干膜厚度和附着力抽测', '漏涂流挂针孔缺陷修补', '防腐验收和涂层记录归档']
  if (code === '05-03-04') return ['绝热材料燃烧性能和导热系数复验', '管道设备表面干燥和保温界面复核', '保温层安装和保温厚度抽测', '阀门法兰弯头异形部位保温处理', '防潮层施工和搭接密封检查', '金属或复合保护壳安装固定', '接缝密封和破损修补复查', '节能验收和绝热资料归档']
  if (code === '05-03-05') return ['试验调试方案和分区条件确认', '热水系统水压试验和渗漏检查', '管道冲洗消毒和水质取样复核', '热源水加热设备单机调试', '温控阀和循环控制逻辑调试', '水力平衡调试和流量复测', '热水温升循环性能和末端温度复核', '试验调试报告和运行参数移交']
  if (code.startsWith('05-04')) return ['卫生器具和配件进场验收', '安装基准线和接口复核', '支架和存水弯安装', '卫生器具安装固定', '给水配件连接', '排水管道连接和水封检查', '通水试验和渗漏检查', '成品保护和验收']
  if (code.startsWith('05-05')) {
    if (code === '05-05-01') return ['预留预埋和供暖管线路由复核', '供暖管材阀门和配件进场复验', '供暖干管支架安装和干管敷设', '供暖立管安装和套管封堵', '供暖支管阀门和末端接口连接', '供暖管道水压试验和渗漏整改', '管道冲洗标识和安装验收']
    if (code === '05-05-02') return ['设备基础和机房接口复核', '循环泵补水泵和膨胀罐进场验收', '循环泵就位减振和固定', '补水定压装置和膨胀水箱安装', '设备管路阀组和仪表接入', '电气自控接线和保护检查', '辅助设备单机试运行和验收']
    if (itemName.includes('散热器')) return ['散热器进场复验', '支架或托钩安装', '散热器安装固定', '阀门和放气阀安装', '供回水支管连接', '散热器组对试压', '防腐和表面处理', '系统试压和冲洗', '热力平衡调试']
    if (itemName.includes('低温热水地板辐射')) return ['基层清理和保温板铺设', '反射膜铺设', '分集水器安装', '地暖盘管敷设和固定', '伸缩缝设置', '水压试验', '填充层(细石混凝土)施工', '养护', '热力平衡调试']
    if (itemName.includes('电加热')) return ['供电容量和回路复核', '发热电缆或电热膜进场复验', '保温板和反射膜铺设', '发热电缆或电热膜敷设', '冷热线接头处理', '温控器和传感器安装', '绝缘电阻和接地测试', '填充层施工和养护', '通电试运行和验收']
    if (itemName.includes('燃气红外辐射')) return ['燃气安全条件复核', '辐射管或辐射器进场验收', '悬吊支架安装', '辐射管或辐射器安装', '燃气管道和阀门安装', '点火控制和安全装置安装', '气密性试验', '联机试运行', '安全检测和验收']
    if (code === '05-05-07') return ['热风供暖设备和风管接口复核', '热风机暖风机和阀部件进场验收', '热风机支架安装过滤器风阀和检修空间复核', '供回水管路和风管接口连接', '电气接线温控器传感器点位和联动启停测试', '风量供回水温差送风温度噪声振动连续记录', '热风供暖运行参数缺陷复测和运维资料移交']
    if (code === '05-05-08') return ['热计量调控方案点位和分户分区边界复核', '热量表温控阀传感器进场检定和校准证书核验', '热量表直管段流向供回水配对安装和封印编号', '温控阀执行器行程开闭方向和取源部件安装', '采集器通讯地址远传平台点表和数据上传调试', '分户分区计量数据比对参数标定和偏差复测', '热计量封印台账远传报表验收和运维权限移交']
    if (code === '05-05-09') return ['供暖试验调试方案和分区确认', '系统试压和渗漏整改复验', '管网冲洗排气和过滤器清理', '分环路流量调节和阀门预设', '热力平衡和温控联动调试', '升温试运行和末端温差复测', '调试报告和运行参数移交']
    if (code === '05-05-10') return ['防腐范围和基层状态复核', '基层除锈清理和焊口打磨', '底漆涂刷和边角补强', '面漆分遍施工和遍间检查', '干膜厚度和附着力抽测', '漏涂修补和流挂缺陷处理', '供暖防腐验收和记录归档']
    if (code === '05-05-11') return ['绝热材料燃烧性能和厚度复验', '管道表面干燥和保温界面确认', '保温层分段包覆和厚度抽测', '阀门法兰可拆卸绝热施工', '防潮层搭接和保护壳安装', '接缝密封破损修补和防结露复查', '供暖绝热节能验收']
    return ['材料设备进场复验', '管道支架和分集水器安装', '供暖管道安装和保温', '末端设备安装(散热器或辐射系统)', '系统试压和冲洗', '热力平衡和温控调试', '能效和运行参数验收']
  }

  // 06-10~19 暖通水系统和制冷设备(补齐核心)
  if (code === '06-10-01') return ['冷凝水管道路径和坡度复核', '支吊架和防结露套管节点准备', '冷凝水管材管件进场复验', '冷凝水管道预制和坡向安装', '存水弯水封和清扫口安装', '冷凝水接口渗漏检查', '通水排水试验', '防结露保温和标识施工', '冷凝水系统验收移交']
  if (code === '06-10-02') return ['冷凝水提升泵基础和集水盘接口复核', '水泵阀件液位开关进场复验', '冷凝水提升泵就位和减振固定', '进出水管阀组和止回阀连接', '液位控制和报警线路接入', '水泵单机点动和流向检查', '启停水位和溢流保护测试', '排水能力复测和噪声检查', '冷凝水泵组验收移交']
  if (code === '06-10-03') return ['冷凝水冲洗排放方案确认', '分区排水口和接水措施设置', '管道内杂物和临时封堵清理', '冷凝水管道分段冲洗', '排水坡度和滞水点复查', '末端通水排放观察', '污染水回收和现场清洁', '冲洗记录和问题整改闭合', '冷凝水冲洗验收']
  if (code === '06-10-04') return ['防腐范围和基层状态复核', '金属支吊架和管件除锈清理', '防腐材料批次和配套性复验', '防腐底漆涂刷和边角补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '针孔流挂漏涂缺陷修补', '防腐成品保护和记录归档', '冷凝水防腐验收']
  if (code === '06-10-05') return ['板式热交换器基础和接管条件复核', '换热器板片垫片资料和外观复验', '板式热交换器就位找平固定', '一次侧二次侧管路阀组连接', '温度压力仪表和安全附件安装', '换热器水压试验和接口查漏', '换热器冲洗排污和过滤器清理', '传热温差和流量参数调试', '板式热交换器验收移交']
  if (code === '06-10-06') return ['辐射板和埋地管深化排布复核', '辐射末端管材板材进场复验', '支吊架基层和保温隔离层准备', '辐射板或埋地管敷设固定', '分集水器和连接管路安装', '管路水压试验和保压观察', '保护层或吊顶封闭条件确认', '供冷供热温控调试', '辐射末端验收移交']
  if (code === '06-10-07') return ['热泵机组基础和检修空间复核', '热泵机组开箱验收和资料核对', '机组就位找平减振固定', '冷凝水和冷热媒管路接口连接', '电源自控和保护接线', '水系统冲洗和过滤器清理', '机组单机试运转', '制冷制热模式参数调试', '热泵机组验收移交']
  if (code === '06-10-08') return ['绝热材料燃烧性能和导热系数复验', '冷凝水管道表面干燥和防结露界面复核', '绝热层裁切包覆和厚度抽测', '阀门弯头支架穿墙部位绝热处理', '防潮层搭接和连续性检查', '保护壳安装固定', '接缝密封和破损修补', '防结露效果和滴水风险复查', '冷凝水绝热验收归档']
  if (code === '06-10-09') return ['冷凝水系统试验调试方案确认', '管道坡度和水封高度复核', '分区通水排水试验', '冷凝水提升泵联动测试', '接口渗漏和排水滞留检查', '防结露和保温完整性复查', '末端空调设备排水联调', '问题整改和复测记录签认', '冷凝水系统调试验收']
  if (code === '06-11-01') return ['空调冷热水管线路由和支吊架复核', '管材阀件补偿器进场复验', '冷热水管道预制加工', '干管立管和支管安装', '伸缩补偿和固定支架安装', '阀门仪表排气泄水装置安装', '管道水压试验和接口查漏', '系统冲洗和过滤器清理', '冷热水管道安装验收']
  if (code === '06-11-02') return ['空调冷热水泵基础和减振条件复核', '水泵阀组和柔性接头进场复验', '水泵就位找平和固定', '吸入口过滤器和进出水阀组安装', '电机接线接地和转向检查', '水泵单机试运转', '振动噪声和轴承温升检测', '变频或联锁控制测试', '冷热水泵组验收移交']
  if (code === '06-11-03') return ['冷热水系统冲洗方案和分区边界确认', '临时旁通和排污接管设置', '管网分段充水排气', '冷热水管道循环冲洗', '过滤器拆洗和排污观察', '水质浊度和杂质复测', '系统补水排气和压力恢复', '冲洗问题整改闭合', '冷热水冲洗验收']
  if (code === '06-11-04') return ['冷热水管道防腐范围复核', '金属表面除锈和清洁处理', '防腐材料批次和配套性确认', '防腐底漆涂刷', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '支吊架焊口补口防腐', '漏涂流挂缺陷修补', '冷热水防腐验收归档']
  if (code === '06-11-05') return ['冷却塔基础和水池容积复核', '冷却塔和水处理设备开箱验收', '塔体就位找平和减振固定', '进出水管补水溢流排污管连接', '布水器喷头和填料安装检查', '风机电机和控制线路接入', '水处理加药旁滤和排污装置调试', '漂水噪声和循环水量复测', '冷却塔水处理系统验收']
  if (code === '06-11-06') return ['防冻伴热范围和供电回路复核', '伴热电缆温控器和传感器进场复验', '管道设备表面清洁和测温点定位', '防冻伴热电缆敷设固定', '温控器传感器和配电箱接线', '绝缘电阻和接地连续性测试', '低温联动启停和报警测试', '保温恢复和标识挂牌', '防冻伴热系统验收']
  if (code === '06-11-07') return ['冷热水绝热材料性能和厚度复验', '管道设备表面干燥和防腐交接确认', '绝热层分段安装和厚度抽测', '阀门法兰支吊架异形部位绝热处理', '防潮层搭接密封检查', '金属或复合保护壳安装固定', '接缝密封和破损修补', '冷桥和结露风险复查', '冷热水绝热节能验收']
  if (code === '06-11-08') return ['冷热水系统试验调试方案确认', '管网水压试验和稳压查漏', '系统补水排气和过滤器清理', '水泵阀门和自控联动测试', '末端设备水量分配复核', '水力平衡调试和流量复测', '冷热源联动和供回水温差调试', '运行参数记录和问题销项', '冷热水系统调试验收']
  if (code === '06-12-01') return ['冷却水管线路由和机房接口复核', '管材阀件支吊架进场复验', '冷却水管道预制加工', '冷却水干管立管安装', '冷却塔和冷机接口管段安装', '阀门仪表排污排气装置安装', '管道水压试验和接口查漏', '系统冲洗和过滤器清理', '冷却水管道安装验收']
  if (code === '06-12-02') return ['冷却水泵基础和减振条件复核', '冷却水泵阀组和柔性接头复验', '水泵就位找平固定', '吸入口过滤器和进出水阀组安装', '电机接线接地和转向检查', '冷却水泵单机试运转', '振动噪声和轴承温升检测', '冷却塔冷机联锁信号测试', '冷却水泵组验收移交']
  if (code === '06-12-03') return ['冷却水管网冲洗方案确认', '临时旁通和排污接管设置', '管网分段充水排气', '冷却水管道循环冲洗', '冷却塔集水盘和过滤器清理', '排污水浊度和杂质复测', '水处理初投加和水质复核', '冲洗问题整改闭合', '冷却水冲洗验收']
  if (code === '06-12-04') return ['冷却水防腐范围和腐蚀环境复核', '管道支吊架除锈清理', '防腐材料批次和耐水性复验', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '冷却塔水池接口补口防腐', '针孔漏涂缺陷修补', '冷却水防腐验收归档']
  if (code === '06-12-05') return ['冷却水灌水试验方案确认', '补水排污和溢流路径复核', '系统灌水和高点排气', '管网和水池渗漏观察', '冷却塔集水盘水位保持检查', '排放试验和排污阀动作检查', '补水阀和液位控制联动测试', '渗漏问题整改和复测签认', '灌水渗漏排放试验验收']
  if (code === '06-12-06') return ['冷却水绝热材料和防结露要求复核', '管道设备表面干燥和防腐交接确认', '绝热层分段安装和厚度抽测', '阀门法兰弯头异形部位绝热处理', '防潮层搭接和连续性检查', '保护壳安装固定', '接缝密封和破损修补', '冷桥结露和室外防护复查', '冷却水绝热验收归档']
  if (code.startsWith('06-10') || code.startsWith('06-11') || code.startsWith('06-12')) {
    return ['管道系统路径和支吊架复核', '水泵和阀部件进场复验', '管道预制和安装', '水泵及附属设备安装', '阀门仪表和自动排气阀安装', '管道试压和冲洗', '管道和设备防腐保温', '水力平衡调试', '系统验收']
  }
  if (code === '06-13-01') return ['地源侧管道路由和支吊架复核', '地源侧管材阀件进场复验', '机房至集分水器管道预制', '地源侧干管和支管安装', '阀门仪表和排气泄水装置安装', '管道试压和接口查漏', '系统冲洗和过滤器清理', '补水排气和压力恢复', '地源侧管道安装验收']
  if (code === '06-13-02') return ['地源侧循环泵基础和减振条件复核', '循环泵阀组和柔性接头进场复验', '循环泵就位找平固定', '吸入口过滤器和进出水阀组安装', '电机接线接地和转向检查', '循环泵单机试运转', '振动噪声和轴承温升检测', '变频联锁和保护功能测试', '地源侧水泵验收移交']
  if (code === '06-13-03') return ['地源侧管网冲洗方案确认', '临时旁通和排污接管设置', '管网分段充水排气', '地源侧管道循环冲洗', '过滤器拆洗和排污观察', '水质浊度和杂质复测', '系统补水和压力恢复', '冲洗问题整改闭合', '地源侧管网冲洗验收']
  if (code === '06-13-04') return ['地源侧防腐范围和环境条件复核', '管道支吊架除锈清理', '防腐材料批次和配套性确认', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '埋地或潮湿部位补口防腐', '漏涂针孔缺陷修补', '地源侧防腐验收归档']
  if (code === '06-13-05') return ['地埋换热孔位和钻孔参数复核', '地埋管材料和管卡配重进场复验', '钻孔成孔和孔深垂直度检查', '地埋管下管和端头保护', '回填料配比确认和分段回填', '水平集管沟槽开挖和连接', '地埋换热回路试压保压', '热响应测试和换热能力复核', '地埋换热系统验收移交']
  if (code === '06-13-06') return ['绝热材料燃烧性能和导热系数复验', '地源侧管道表面干燥和防结露界面复核', '绝热层裁切包覆和厚度抽测', '阀门法兰弯头异形部位绝热处理', '防潮层搭接和连续性检查', '保护壳安装固定', '接缝密封和破损修补', '冷桥结露风险复查', '地源侧绝热验收归档']
  if (code === '06-13-07') return ['地源热泵系统调试方案确认', '地埋回路充水排气和压力复核', '循环泵阀门和流量计联动测试', '热泵机组制冷制热模式切换', '地源侧和负荷侧流量平衡复测', '进出水温差和能效参数记录', '热响应数据和运行参数比对', '连续试运行问题销项', '地源热泵系统调试验收']
  if (code === '06-14-01') return ['水源侧管道路由和支吊架复核', '水源侧管材阀件进场复验', '水源侧管道预制加工', '取退水干管和机房接口安装', '阀门仪表排气泄水装置安装', '管道试压和接口查漏', '系统冲洗和过滤器清理', '补水排气和压力恢复', '水源侧管道安装验收']
  if (code === '06-14-02') return ['水源侧取水泵基础和减振条件复核', '取水泵阀组和格栅附件进场复验', '取水泵就位找平固定', '吸入口过滤器和进出水阀组安装', '电机接线接地和转向检查', '取水泵单机试运转', '振动噪声和流量扬程检测', '液位联锁和保护功能测试', '水源侧水泵验收移交']
  if (code === '06-14-03') return ['水源侧管网冲洗方案确认', '临时旁通和排污接管设置', '管网分段充水排气', '水源侧管道循环冲洗', '取水过滤器和换热器前端清理', '排污水浊度和杂质复测', '系统补水和压力恢复', '冲洗问题整改闭合', '水源侧管网冲洗验收']
  if (code === '06-14-04') return ['水源侧防腐范围和水质腐蚀性复核', '管道支吊架除锈清理', '防腐材料耐水性和批次复验', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '取退水接口补口防腐', '漏涂针孔缺陷修补', '水源侧防腐验收归档']
  if (code === '06-14-05') return ['取水口位置和水源保护边界复核', '换热管和取退水构件进场复验', '取水口格栅和防堵设施安装', '地表水源换热管敷设连接', '过滤器旁通和检修阀组安装', '换热管试压和冲洗', '防堵反冲洗功能测试', '取退水温差和流量复测', '水源换热管网验收移交']
  if (code === '06-14-06') return ['除垢水处理方案和水质基线复核', '除垢设备药剂和加药装置进场复验', '水处理设备就位固定', '加药旁滤和排污管路连接', '药剂投加浓度和安全措施确认', '水质硬度浊度和pH检测', '自动排污和旁滤循环调试', '除垢效果和结垢风险复测', '水处理除垢系统验收']
  if (code === '06-14-07') return ['水源侧绝热材料和室外防护要求复核', '管道设备表面干燥和防腐交接确认', '绝热层分段安装和厚度抽测', '阀门法兰弯头异形部位绝热处理', '防潮层搭接和连续性检查', '室外保护壳和防水收口安装', '接缝密封和破损修补', '冷桥结露和防冻风险复查', '水源侧绝热验收归档']
  if (code === '06-14-08') return ['水源热泵系统调试方案确认', '取退水通道和水处理状态复核', '取水泵阀门和流量计联动测试', '换热管网温差和压差复测', '除垢旁滤和自动排污联调', '防冻保护和低温运行参数调试', '热泵机组制冷制热模式切换', '连续试运行问题销项', '水源热泵系统调试验收']
  if (code === '06-15-01') return ['蓄能管道路由和阀组分区复核', '蓄能管材阀件进场复验', '蓄能管道预制加工', '蓄水罐或蓄冰槽接口管段安装', '充放能切换阀组和仪表安装', '管道试压和接口查漏', '系统冲洗和过滤器清理', '补水排气和压力恢复', '蓄能管道安装验收']
  if (code === '06-15-02') return ['蓄能循环泵基础和减振条件复核', '循环泵阀组和柔性接头进场复验', '循环泵就位找平固定', '充放能回路进出水阀组安装', '电机接线接地和转向检查', '循环泵单机试运转', '振动噪声和流量扬程检测', '蓄放能模式联锁测试', '蓄能水泵验收移交']
  if (code === '06-15-03') return ['蓄能系统冲洗方案和分区边界确认', '临时旁通和排污接管设置', '管网分段充水排气', '蓄能管道循环冲洗', '蓄水罐或盘管前过滤器清理', '排污水浊度和杂质复测', '系统补水和压力恢复', '冲洗问题整改闭合', '蓄能系统冲洗验收']
  if (code === '06-15-04') return ['蓄能系统防腐范围和水质条件复核', '管道支架除锈清理', '防腐材料批次和配套性确认', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '蓄水容器接口补口防腐', '漏涂针孔缺陷修补', '蓄能系统防腐验收归档']
  if (code === '06-15-05') return ['蓄水罐基础和蓄能容量复核', '蓄水罐布水器和温度传感器进场复验', '蓄水罐或蓄水槽就位找平固定', '布水器和进出水接口安装', '液位计温度分层测点安装', '溢流排污和补水管路连接', '罐体灌水查漏和液位联动测试', '蓄放能温度分层效果预调', '蓄水罐蓄能装置验收']
  if (code === '06-15-06') return ['蓄能绝热材料和节能要求复核', '蓄水罐管道表面干燥和防腐交接确认', '绝热层分区安装和厚度抽测', '阀门法兰测温点异形部位绝热处理', '防潮层搭接和连续性检查', '保护壳安装固定', '接缝密封和破损修补', '冷桥和热损失风险复查', '蓄能系统绝热验收归档']
  if (code === '06-15-07') return ['蓄能系统调试方案和运行策略确认', '蓄水罐充水循环和排气复核', '充放能阀组和循环泵联动测试', '蓄放能模式切换调试', '温度分层和液位控制复测', '蓄能量和释能量计算校核', '峰谷电运行策略和控制逻辑验证', '连续试运行问题销项', '蓄能系统调试验收']
  if (code.startsWith('06-13')) return ['地埋管设计参数和钻井布孔复核', '地埋管材料进场复验', '钻孔或开槽施工', '地埋管下管和回填', '水平集管连接和试压', '机房热泵机组和管路连接', '系统冲洗和充水排气', '能效参数调试', '地温场监测和验收']
  if (code.startsWith('06-14')) return ['水源条件和水处理方案复核', '取水井或换热井施工', '取水泵和管路安装', '热泵机组和辅助设备安装', '水处理或除垢设备安装', '系统试压和冲洗', '管道设备防腐绝热', '运行参数和防冻调试', '系统验收']
  if (code.startsWith('06-15')) return ['蓄能方案和蓄水容器基础复核', '蓄水罐或蓄水槽进场验收和就位', '管路和阀部件安装', '布水器或蓄冰装置安装', '循环泵和换热设备安装', '系统试压和冲洗', '管道设备绝热保温', '充水循环和蓄放能调试', '运行参数复核和验收']
  if (code === '06-16-01') return ['制冷机组基础减振和吊装路径复核', '制冷机组开箱验收和设备资料核对', '机组垫铁找平和地脚螺栓固定', '冷冻水冷却水法兰阀组和冷凝水排放连接', '电源控制柜联锁和保护线路接入', '冷媒和润滑油系统检查确认', '压缩机点动和转向检查', '冷量和能效参数预运行记录', '报警保护测试和制冷机组验收移交']
  if (code === '06-16-02') return ['制冷设备防腐范围和基层状态复核', '管道支吊架和设备底座除锈清理', '防腐材料批次和耐冷凝性复验', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '阀件支架补口防腐', '漏涂针孔缺陷修补', '制冷设备防腐验收归档']
  if (code === '06-16-03') return ['制冷剂管道路径和支吊架复核', '铜管钢管和阀件进场复验', '制冷剂管道切割扩口或焊接准备', '制冷剂管道内壁清洁和端口封闭', '制冷剂管道安装和坡向控制', '氮气吹扫和杂质排出检查', '管路压力试验和接口查漏', '抽真空保压和真空度记录', '制冷剂管道安装验收']
  if (code === '06-16-04') return ['制冷剂灌注方案和计算表复核', '系统抽真空结果和阀位状态确认', '制冷剂钢瓶称量和型号核验', '制冷剂灌注和初始充注量记录', '按管长修正追加量计算', '运行状态下追加充注和压力观察', '接口泄漏检测和复检', '运行压力和过热过冷度复核', '制冷剂灌注记录验收']
  if (code === '06-16-05') return ['制冷系统绝热材料和厚度复验', '制冷剂管道表面干燥和气密交接确认', '绝热层裁切包覆和厚度抽测', '阀门法兰弯头异形部位绝热处理', '防潮层搭接和连续性检查', '保护壳安装固定', '接缝密封和破损修补', '冷桥结露风险复查', '制冷管道绝热验收归档']
  if (code === '06-16-06') return ['压缩式制冷系统调试方案确认', '水系统和制冷剂系统试验记录复核', '机组保护参数和联锁逻辑检查', '冷冻水冷却水流量和温差调试', '制冷机组加载试运行', '油路压差和运行压力复核', '泄漏检测和报警保护复测', '能效参数和冷量输出记录', '压缩式制冷系统调试验收']
  if (code.startsWith('06-16')) return ['制冷机组设备基础和减振复核', '制冷机组开箱验收和就位', '制冷剂管道内外壁清洁和安装', '阀件和自控仪表安装', '管路试压和抽真空保压', '制冷剂灌注量记录和泄漏检测', '油路系统检查', '单机试运行和能效参数复核', '系统调试验收']
  if (code === '06-17-01') return ['吸收式机组基础和设备间环境复核', '机组开箱验收和资料核对', '机组就位找平和减振固定', '冷却水冷冻水接口条件确认', '电源自控和安全保护接入', '溶液泵冷剂泵方向检查', '单机点动和机械保护测试', '附件仪表和安全阀复核', '吸收式机组安装验收移交']
  if (code === '06-17-02') return ['吸收式系统防腐范围和介质条件复核', '管道支架和设备底座除锈清理', '防腐材料批次和耐热耐湿性复验', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '蒸汽冷剂和溶液接口补口防腐', '漏涂针孔缺陷修补', '吸收式系统防腐验收归档']
  if (code === '06-17-03') return ['吸收式系统真空试验方案确认', '真空泵和真空计校验复核', '系统氮气置换和气密检查', '抽真空启动和阶段真空度记录', '真空试验保压观察', '漏率计算和泄漏点排查', '泄漏点处理和复抽真空', '真空保持记录签认', '系统真空试验验收']
  if (code === '06-17-04') return ['溴化锂溶液加灌方案和安全措施确认', '溴化锂溶液浓度和批次复验', '加灌过滤器和临时管路准备', '系统真空状态和阀位确认', '溴化锂溶液过滤加灌', '溶液循环和液位稳定观察', '溶液浓度取样检测', '泄漏结晶风险复查', '溴化锂溶液加灌验收']
  if (code === '06-17-05') return ['蒸汽或热水管路接口条件复核', '管材阀件和疏水器进场复验', '蒸汽或热水管路预制安装', '减压阀安全阀和疏水器安装', '保温前压力试验和吹扫', '冷凝水回收管路连接', '温度压力仪表安装', '供热参数和泄漏复查', '蒸汽热水管路验收移交']
  if (code === '06-17-06') return ['燃气燃油接口和安全间距复核', '燃气阀组燃油泵和切断阀进场复验', '燃气或燃油管路安装', '紧急切断阀和泄漏报警接入', '燃烧器接口和点火控制接线', '气密或油压试验', '燃烧联锁和熄火保护测试', '通风排烟和消防联动复核', '燃气燃油系统验收移交']
  if (code === '06-17-07') return ['吸收式系统绝热材料和耐温要求复核', '蒸汽热水和冷剂管道表面交接确认', '绝热层分段安装和厚度抽测', '阀门法兰换热部位异形绝热处理', '防潮层和保护层连续性检查', '高温部位防烫保护壳安装', '接缝密封和破损修补', '热损失和结露风险复查', '吸收式管道绝热验收归档']
  if (code === '06-17-08') return ['吸收式制冷系统调试方案确认', '真空和溴化锂溶液记录复核', '蒸汽热水或燃气燃油供应条件确认', '溶液泵冷剂泵和阀组联动测试', '燃烧或供热安全联锁复测', '制冷量和供回水温差调试', '溴化锂浓度和结晶风险监测', '性能参数和能效记录', '吸收式制冷系统调试验收']
  if (code.startsWith('06-17')) return ['吸收式机组基础和环境条件复核', '机组开箱验收和就位校正', '蒸汽或热水管路安装', '燃气或燃油系统接口安装', '溶液和冷剂管路连接', '系统真空试验和保压观察', '溴化锂溶液加灌和浓度复核', '单机试运行', '性能参数和验收']
  if (code === '06-18-01') return ['多联机室外机基础支座和检修空间复核', '室外机组开箱验收和编号核对', '室外机吊装就位和减振固定', '防风防坠和排水坡向检查', '制冷剂主管接口和截止阀保护', '电源控制线和接地连接', '冷媒管保压前封堵检查', '室外机通电点检和报警复核', '室外机组安装验收移交']
  if (code === '06-18-02') return ['室内机点位和吊装净高复核', '室内机组开箱验收和编号核对', '吊杆支架安装和防腐复核', '室内机吊装找平和减振固定', '冷媒管冷凝水和风口接口连接', '控制线和地址线接入', '回风滤网和检修口复核', '单机通电和风量噪声检查', '室内机组安装验收移交']
  if (code === '06-18-03') return ['多联机制冷剂管路深化和分歧管方向复核', '铜管分歧管保温材料进场复验', '铜管切割扩口和氮气保护焊接', '制冷剂管路敷设和支吊架固定', '分歧管和电子膨胀阀接口安装', '控制开关和地址线接线', '氮气保压和接口查漏', '抽真空保压和真空度记录', '制冷剂管路连接验收']
  if (code === '06-18-04') return ['多联机风管路径和风口点位复核', '风管板材风口和软接进场复验', '支吊架制作安装和防腐', '风管分段安装和法兰密封', '送回风口和软接安装', '漏风或严密性检查', '风管绝热和防结露处理', '风量调节和气流组织复测', '多联机风管安装验收']
  if (code === '06-18-05') return ['冷凝水管道路径和坡度复核', '冷凝水管材管件进场复验', '支吊架和防结露套管节点准备', '冷凝水管道安装和坡向控制', '存水弯水封和清扫口安装', '提升泵或排水接口连接', '通水排水试验和渗漏检查', '防结露绝热和标识施工', '多联机冷凝水系统验收']
  if (code === '06-18-06') return ['多联机制冷剂追加充注方案复核', '系统抽真空和保压记录确认', '制冷剂钢瓶称量和型号核验', '按管长计算追加量', '制冷剂追加充注和重量记录', '开机运行压力和温度观察', '各接口泄漏检测和复检', '室内外机运行压力平衡复核', '制冷剂灌注记录验收']
  if (code === '06-18-07') return ['多联机系统调试方案和地址表确认', '室内外机通讯和地址码核对', '制冷制热模式切换测试', '电子膨胀阀和控制开关联调', '冷凝水排水和防结露复查', '运行压力和温差参数记录', '故障报警和集中控制测试', '连续试运行问题销项', '多联机系统调试验收']
  if (code.startsWith('06-18')) return ['室外机组基础或支座复核', '室外机组安装和减振固定', '室内机组安装和接管', '制冷剂管路连接和扩口密封', '冷凝水管安装和排水试验', '风管和风口末端安装', '电气和自控接线', '制冷剂追加充注和泄漏检测', '系统试运行和验收']
  if (code === '06-19-01') return ['太阳能集热器基础支座和屋面防水交接复核', '集热器支架材料和连接件进场复验', '集热器支架定位安装', '集热器朝向和倾角校核', '集热器板管就位固定', '屋面穿孔防水收口和防雷连接', '集热器管路接口连接', '支架抗风和渗漏复查', '太阳能集热器安装验收']
  if (code === '06-19-02') return ['辅助能源和换热设备接口条件复核', '辅助热源换热器和阀组进场复验', '辅助热源设备就位固定', '换热设备一次二次侧管路连接', '安全阀膨胀罐和仪表安装', '电源控制和温控线路接入', '设备单机试运行', '换热效率和温控保护测试', '辅助热源换热设备验收']
  if (code === '06-19-03') return ['蓄热水箱基础和容量复核', '蓄热水箱管材阀件进场复验', '蓄热水箱就位找平固定', '集热循环管道和补水管路连接', '膨胀罐安全阀和排气阀安装', '温度传感器和液位计安装', '水箱灌水查漏和保温交接', '管道试压冲洗和排气', '蓄热水箱管路验收']
  if (code === '06-19-04') return ['太阳能系统防腐范围和屋面环境复核', '金属支架管件除锈清理', '防腐材料耐候性和批次复验', '防腐底漆涂刷和焊口补强', '防腐面漆分遍涂装', '干膜厚度和附着力抽测', '屋面支架连接点补口防腐', '漏涂针孔缺陷修补', '太阳能系统防腐验收归档']
  if (code === '06-19-05') return ['太阳能系统绝热材料和室外耐候要求复核', '集热循环管道表面干燥和防腐交接确认', '绝热层分段安装和厚度抽测', '阀门法兰水箱接口异形绝热处理', '防潮层和保护层连续性检查', '室外保护壳和防水收口安装', '接缝密封和破损修补', '热损失和冻胀风险复查', '太阳能绝热验收归档']
  if (code === '06-19-06') return ['太阳能地暖基层和保温层复核', '地暖盘管分集水器和温控阀进场复验', '分集水器安装和回路编号', '地暖盘管敷设固定和间距检查', '伸缩缝和边界保温设置', '盘管水压试验和保压观察', '填充层浇筑和养护控制', '热力平衡和温控联调', '低温热水地板辐射系统验收']
  if (code === '06-19-07') return ['太阳能系统试验调试方案确认', '集热循环管路试压冲洗和排气', '防冻液充注浓度和液位复核', '集热循环泵和温控阀联动测试', '辅助热源切换和保护逻辑调试', '蓄热水箱温升和循环效果复测', '地暖或末端供热温度平衡调试', '节能运行参数和报警记录', '太阳能供暖空调系统验收']
  if (code.startsWith('06-19')) return ['太阳能集热器基础支座复核', '集热器支架安装', '集热器安装(角度朝向校核)', '蓄热水箱就位和管路连接', '辅助热源设备安装', '防冻液充注(如需)', '系统试压冲洗', '集热循环和温控调试', '节能运行参数复核验收']

  // 08-01~18 智能建筑(补齐核心子分部)
  if (code === '08-01-01') return ['智能化集成设备机柜和电源条件复核', '集成服务器工作站和接口网关进场验收', '集成服务器上架固定和机柜接地连续性复核', '工作站安装和显示外设连接', '接口网关双网口配置和通讯端口接线', '平台时钟同步和网络端口标识核对', '网络连通和接地连续性测试', '集成硬件巡检和验收移交']
  if (code === '08-01-02') return ['集成平台软件版本授权和部署方案复核', '操作系统数据库和中间件环境准备', '集成平台软件安装部署', '数据库实例和数据存储配置', '用户账号角色和权限策略配置', '备份计划和恢复策略配置', '软件服务启动和授权状态核验', '集成平台软件安装验收']
  if (code === '08-01-03') return ['接口协议和子系统接入清单确认', '子系统点表和数据字典复核', '数据映射和采集频率配置', '接口通讯和数据上传测试', '联动场景和动作时序配置', '告警规则和事件推送测试', '图形界面和状态显示核对', '接口及系统调试验收']
  if (code === '08-01-04') return ['智能化集成系统试运行条件确认', '连续试运行监测和值守安排', '告警巡检和事件闭环记录', '子系统状态和通讯稳定性巡检', '故障记录和应急处置复盘', '用户反馈问题销项和复测', '运行报表和日志资料汇总', '运维账号资料移交和验收签认']
  if (code === '08-13-01') return ['信息化应用梯架托盘槽盒路径复核', '支吊架和管槽材料进场复验', '梯架托盘槽盒支吊架安装', '槽盒和导管敷设固定', '穿墙穿楼板防火封堵施工', '接地跨接和等电位连接测试', '管槽标识和隐蔽验收', '应用系统管槽安装移交']
  if (code === '08-13-02') return ['应用系统线缆规格和路径复核', '线缆敷设牵引条件确认', '应用系统线缆敷设和绑扎整理', '配线端接和模块压接', '回路编号和永久标签粘贴', '链路测试和通讯通断复核', '测试记录和线缆清册归档', '应用系统线缆敷设验收']
  if (code === '08-13-03') return ['信息化应用部署方案和资源清单复核', '应用服务器和数据库环境准备', '业务模块安装和服务发布', '数据库初始化和基础参数配置', '组织架构账号权限导入', '业务基础数据初始化和校验', '接口服务和报表组件部署', '应用设备软件安装验收']
  if (code === '08-13-04') return ['信息化应用系统调试方案确认', '业务流程场景和测试用例复核', '业务流程端到端联调', '外部接口联调和数据交换测试', '报表统计和导出功能验证', '基础数据和交易数据校验', '用户验收测试和问题销项', '应用系统调试验收']
  if (code === '08-13-05') return ['信息化应用试运行条件确认', '试运行用户和值守安排', '业务操作运行监测', '用户反馈收集和分类', '故障记录和问题销项复测', '性能容量和日志巡检', '试运行报告和培训资料汇总', '应用系统运维移交签认']
  if (code.startsWith('08-01') || code.startsWith('08-13')) return ['平台架构与接口协议确认', '集成服务器和工作站安装', '接口网关和软件部署', '子系统数据接入和点表核对', '集成联动场景配置', 'IBMS界面和告警功能测试', '集成系统联调和试运行', '试运行问题销项和交接签认']
  if (code === '08-02-01') return ['信息接入机房环境和供电条件核查', '引入管道和ODF界面复核', '运营商光缆交接界面确认', '弱电间机柜电源接地条件复核', '光纤链路接入测试和信号质量确认', '运营商交接签认']
  if (code === '08-06-01') return ['移动通信室分环境和电源条件核查', '覆盖勘测和盲区复核', 'POI或RRU安装界面确认', '天线点位和馈线路由复核', '驻波比和覆盖预测复核', '运营商进场条件签认']
  if (code === '08-07-01') return ['卫星通信设备间环境和电源条件核查', '卫星天线视距和方位角复核', '天线基础和屋面承载界面确认', '馈线穿墙防水和避雷接地复核', '信号锁定和接收质量测试', '卫星通信界面移交']
  if (code.startsWith('08-02') || code.startsWith('08-06') || code.startsWith('08-07')) return ['安装场地环境和电源条件核查', '运营商接入界面确认', '施工协调窗口确认', '进场条件和交底记录签认']
  if (code === '08-03-01') return ['语音线缆路由和配线架位置复核', '电话线缆和跳线进场复验', '语音线缆敷设和分层绑扎', '语音配线架和模块端接', '跳线整理和号码标签粘贴', '回路编号和永久标识复核', '语音链路测试和串扰检查', '线缆测试记录归档']
  if (code === '08-03-02') return ['语音机房电源和机柜条件复核', 'IP-PBX语音网关和板卡进场验收', '语音网关和IP-PBX设备安装固定', 'SIP中继和运营商接口接入', '分机号码资源和号码规划导入', '应急呼叫和外线拨号接口配置', '主备电源和接地测试', '语音设备安装验收']
  if (code === '08-03-03') return ['语音软件版本授权和容量复核', '呼叫控制软件和数据库部署', '分机权限和呼叫路由配置', '计费计量和录音功能配置', '语音信箱和IVR菜单配置', '账号权限和管理员策略设置', '配置备份和恢复测试', '语音软件安装验收']
  if (code === '08-03-04') return ['电话交换系统调试方案确认', 'SIP中继注册和外线连通测试', '内部分机互拨和转接测试', '呼叫路由和权限策略验证', '应急呼叫和消防接口测试', '计费录音和日志功能复核', '割接演练和问题销项', '电话交换系统调试验收']
  if (code === '08-03-05') return ['电话交换系统试运行条件确认', '分机拨测和用户反馈巡检', '外线中继稳定性监测', '录音计费和日志抽查', '故障记录和问题销项', '号码资源和权限清单复核', '运维账号和备份资料移交', '电话交换试运行验收']
  if (code === '08-04-01') return ['网络拓扑和机柜电源条件复核', '核心交换机接入交换机和路由器进场验收', '核心交换机和汇聚设备上架固定', '接入交换机和路由器安装接线', 'VLAN和链路聚合基础配置', '双电源和冗余链路接入', '端口标签和跳线整理', '网络设备安装验收']
  if (code === '08-04-02') return ['网络软件版本和地址规划复核', '网络管理软件和控制器部署', 'IP地址段VLAN和网关配置', 'QoS策略和路由参数配置', '无线控制器或认证服务配置', '配置备份和版本基线冻结', '网络配置一致性校验', '网络软件配置验收']
  if (code === '08-04-03') return ['网络安全区域和部署模式复核', '防火墙入侵防御VPN设备进场验收', '安全设备上架固定和接地', '旁路或串联链路接入', '内外网和DMZ安全区域接口配置', 'HA心跳和管理口接入', '初始连通和旁路切换检查', '网络安全设备安装验收']
  if (code === '08-04-04') return ['网络安全软件版本和基线策略复核', '访问控制安全策略配置', '入侵防御特征库和病毒库更新', 'VPN认证和证书策略配置', '日志审计和告警转发配置', '安全基线和弱口令核查', '策略备份和变更记录归档', '网络安全软件配置验收']
  if (code === '08-04-05') return ['信息网络调试方案和测试清单确认', '端到端连通性和路由收敛测试', '带宽吞吐和时延性能测试', '冗余切换和链路恢复测试', 'VLAN隔离和QoS策略验证', '安全策略验证和渗透阻断抽测', '无线漫游和认证测试', '网络系统调试验收']
  if (code === '08-04-06') return ['信息网络试运行条件确认', '核心链路和端口流量监测', '故障记录和告警闭环巡检', '日志审计和安全事件复核', '性能趋势和容量数据汇总', '用户接入问题销项', '配置备份和运维资料移交', '信息网络试运行验收']
  if (code.startsWith('08-03') || code.startsWith('08-04')) return ['机柜和电源条件复核', '设备进场验收', '交换机或语音网关安装', '线缆端接和跳线', '软件安装和参数配置', '网络连通和服务测试', '安全和备份策略配置', '试运行和验收']
  const structuredCablingProcessesByCode: Record<string, string[]> = {
    '08-05-01': ['综合布线管槽路径和弱电井交接复核', '梯架托盘槽盒支吊架定位安装', '导管弯曲半径和穿越防火分区复核', '槽盒连接片跨接接地和等电位连接', '管槽穿墙穿楼板防火封堵施工', '检修空间盖板转弯半径和分隔板复查', '管槽编号标识和隐蔽验收记录', '梯架托盘槽盒导管安装验收移交'],
    '08-05-02': ['铜缆光纤线缆规格路由和牵引计划复核', '线缆牵引敷设张力弯曲半径控制', '水平线缆垂直干线和光缆分层绑扎', '线缆余量盘留端部保护和防火分区封堵', '线缆编号标签房间端口和机柜端对应复核', '光缆熔接尾纤保护和损耗初测', '铜缆绝缘通断和线序抽测', '线缆敷设记录和路由图移交'],
    '08-05-03': ['机柜机架配线架布置和承重条件复核', '机柜机架就位找平固定和接地铜排连接', '配线架理线器光纤配线单元安装', '交换区跳线管理架和线缆进出线整理', '配线架模块压接和端口编号复核', '机柜电源接地散热和门禁空间检查', '配线架端口映射表和标签粘贴', '柜机机架配线架安装验收移交'],
    '08-05-04': ['信息插座点位底盒和家具墙面界面复核', '信息插座模块压接线序和屏蔽层处理', '面板安装平整度标高和开孔收口检查', '双口多口信息插座面板标识和端口编号粘贴', '信息插座到配线架链路映射复核', '面板防尘保护和成品保护移交', '抽样通断线序和端口标签复测', '信息插座安装验收移交'],
    '08-05-05': ['链路或信道测试仪校准和测试清单确认', '永久链路测试近端串扰回波损耗和衰减复核', '信道测试跳线端到端连通和性能记录', '光纤OTDR长度损耗事件点和端面清洁测试', '测试失败链路定位整改和复测闭合', '测试报告端口清单和竣工图一致性核对', '链路认证资料归档和抽检复核', '链路或信道测试验收移交'],
    '08-05-06': ['综合布线网管软件版本授权和部署方案复核', '网管软件服务器数据库和备份目录安装', '端口映射机柜房间和资产台账导入', '链路测试报告和端口状态数据关联', '用户权限账号角色和审计日志配置', '告警阈值端口变更和跳线记录流程配置', '配置备份恢复演练和报表模板校验', '综合布线软件安装验收移交'],
    '08-05-07': ['综合布线系统调试方案端口清单和联调边界确认', '核心端口VLAN PoE供电和链路聚合配置复核', '链路冗余切换故障告警和恢复时间测试', '机柜配线架信息插座端到端联调抽测', '语音数据无线和安防接入业务链路联调', '网络管理平台端口状态和资产映射校验', '调试问题整改复测和报告编制', '综合布线系统调试验收移交'],
    '08-05-08': ['综合布线试运行条件巡检计划和运维值守确认', '端口流量PoE负载和链路状态连续监测', '故障工单开闭环跳线变更和端口占用记录', '性能趋势容量利用率和弱链路告警分析', '用户接入问题处理和端口标签复核', '运维移交培训备品备件和配置备份交接', '试运行报告问题销项和验收资料归档', '综合布线试运行验收移交'],
  }
  if (structuredCablingProcessesByCode[code]) return structuredCablingProcessesByCode[code]
  if (code.startsWith('08-05')) return ['综合布线路由和端口清单复核', '管槽或线缆安装实施', '端接标识和链路映射', '链路测试和问题整改', '系统资料归档和验收移交']
  const avBroadcastDisplayClockProcessesByCode: Record<string, string[]> = {
    '08-08-01': ['有线电视前端机房和弱电井路径复核', '同轴干线槽盒支吊架定位安装', '卫星馈线入户导管预留和弯曲半径复核', '分配分支器箱体管路定位', '桥架槽盒接地跨接和防火封堵', '管槽路径标识和有线电视隐蔽验收移交'],
    '08-09-01': ['公共广播广播分区和扬声器点位复核', '扬声器回路音频管槽支吊架安装', '消防强切线路独立管槽预留', '功放机房至分区管线路由敷设', '广播管槽接地跨接和防火封堵', '分区回路标签和公共广播隐蔽验收移交'],
    '08-10-01': ['会议系统会议桌盒和地插位置复核', '音视频管线桥架和桌面管槽安装', '摄像机吊装点和投影显示管路预留', '机柜至主席台线路路由敷设', '话筒扬声器和控制线分槽隔离复核', '管槽接地跨接防火封堵和会议系统隐蔽验收'],
    '08-11-01': ['信息导引LED屏和发布终端点位复核', '屏体电源管槽和信号槽盒分设安装', '发布终端至机房路由敷设', '检修通道和维护空间复核', '屏体控制线管路弯曲半径检查', '管槽接地跨接防火封堵和信息导引隐蔽验收'],
    '08-12-01': ['时钟系统母钟机房和子钟点位复核', '子钟点位管槽和安装底盒预留', '授时天线馈线导管敷设', 'NTP网络和RS485时钟总线路由敷设', '授时天线防雷接地和等电位连接', '管槽标识检修路径和时钟系统隐蔽验收'],
    '08-08-02': ['有线电视同轴电缆和卫星馈线规格复核', '同轴电缆牵引敷设和弯曲半径控制', '分支分配器箱内F头制作压接', '屏蔽层连续性和接地复核', '终端电平抽测和线路衰减记录', '线缆标签用户端口编号和测试记录归档'],
    '08-09-02': ['公共广播广播线缆和扬声器线规格复核', '分区回路扬声器线缆敷设', '音量控制器和扬声器端接压接', '功放输出至分区回路编号标识', '广播回路阻抗测试和绝缘复测', '消防强切线缆标识和公共广播测试归档'],
    '08-10-02': ['会议线缆类型和接口清单复核', 'HDMI视频线音频线和话筒线敷设', '桌面信息盒和地插模块端接', '摄像机网线和控制线标签编号', '机柜跳线整理和链路测试', '音视频链路衰减干扰复核和测试归档'],
    '08-11-02': ['屏体信号线电源分路和网线规格复核', 'LED屏体信号线和控制网线敷设', '发送卡接收卡链路端接和编号', '屏体电源分路线缆压接和相序复核', '发布终端网络链路测试', '链路标签屏体分区清册和测试记录归档'],
    '08-12-02': ['授时馈线RS485和NTP网络线缆规格复核', '母钟至子钟回路线缆敷设', '授时馈线端接和防雷模块连接', 'RS485总线极性和地址编码复核', 'NTP网络链路通断测试', '子钟回路标签分区清册和测试记录归档'],
    '08-08-03': ['有线电视前端设备安装条件和节目源清单复核', '卫星接收与调制参数混合器进场复核', '前端机柜设备上架固定接地和馈线端接', '放大器分支分配器接线供电器电平初调', '频道配置节目源参数写入和频道表冻结', '终端电平均衡测试设备软件验收和资料移交'],
    '08-09-03': ['公共广播机柜电源和分区清单复核', '广播功放分区控制器上架接地和通道编号', '音源播放器话筒和呼叫站接线参数写入', '扬声器覆盖方向复核音量控制器端接', '广播回路阻抗抽测和分区播放功能测试', '消防强切优先级接口测试设备软件验收'],
    '08-11-05': ['信息导引内容管理平台版本和授权复核', '发布模板和版式规范配置', '终端分组区域策略和命名规则配置', '节目排期审批流程和播放策略配置', '素材库分类容量和转码参数配置', '权限日志审计账号角色和发布软件验收'],
    '08-08-04': ['有线电视调试方案和频道清单确认', '前端放大器和分支分配器参数调试', '频道扫描和节目源锁定测试', 'MER和C/N指标复测', '终端电平均衡和衰减补偿', '终端图像清晰度马赛克抽检和调试报告移交'],
    '08-09-04': ['公共广播调试方案和分区矩阵确认', '功放矩阵和音源服务器通道调试', '分区广播点播和寻呼测试', '消防强切联动和优先级测试', '声压级和语言清晰度复测', '背景音乐定时播放场景验证和调试报告移交'],
    '08-10-04': ['会议系统调试方案和场景清单确认', 'DSP通道增益均衡和反馈抑制调试', '音视频矩阵路由和中控联动测试', '话筒啸叫抑制和拾音距离复测', '摄像跟踪和录播联动调试', '场景预设一键切换验证和调试报告移交'],
    '08-11-06': ['信息导引发布调试方案和节目清单确认', 'LED屏亮度色彩和白平衡校准', '节目发布流程和权限测试', '多屏同步播放和分区策略验证', '发布回执和离线告警测试', '播放控制器异常切换复测和调试报告移交'],
    '08-12-04': ['时钟系统调试方案和授时源清单确认', 'GPS北斗授时源锁定和信号强度复核', 'NTP服务器时间源优先级配置', '子钟校时和地址分区核验', '全网时差测试和漂移记录', '断电守时授时源切换测试和调试报告移交'],
    '08-08-05': ['有线电视试运行条件和频道巡检计划确认', '终端频道巡检和信号电平趋势记录', '马赛克黑屏和雪花问题登记', '用户端口终端抽检和用户反馈收集', '节目源切换和卫星接收稳定性巡检', '试运行问题销项复测和有线电视资料移交'],
    '08-09-05': ['公共广播试运行条件和分区播放计划确认', '背景音乐和分区广播日志巡检', '消防演练广播强切场景复核', '声压巡检和音质问题记录', '功放温升和线路故障记录', '试运行问题销项复测和公共广播资料移交'],
    '08-10-05': ['会议系统试运行条件和会议场景确认', '会议场景预设和中控面板巡检', '录播直播和远程会议链路试运行', '回声啸叫和画面延迟问题记录', '用户演练反馈收集和培训确认', '试运行问题销项复测和会议系统资料移交'],
    '08-11-07': ['信息导引发布试运行条件和节目排期确认', '节目排期执行和播放日志巡检', '屏端巡检和离线告警记录', '素材更新发布和回滚演练', '亮度策略和节能时段运行复核', '试运行问题销项复测和信息导引资料移交'],
    '08-12-05': ['时钟系统试运行条件和巡检频次确认', '全网时差巡检和漂移趋势记录', '授时源切换和NTP服务状态巡检', '子钟离线和电源异常记录', '断电守时恢复和校时策略复核', '试运行问题销项复测和时钟系统运维资料移交'],
  }
  if (avBroadcastDisplayClockProcessesByCode[code]) return avBroadcastDisplayClockProcessesByCode[code]
  if (code.startsWith('08-08') || code.startsWith('08-09') || code.startsWith('08-10') || code.startsWith('08-11') || code.startsWith('08-12')) {
    if (itemName.includes('梯架') || itemName.includes('托盘') || itemName.includes('槽盒') || itemName.includes('导管')) return ['管槽路径和点位复核', '支吊架和桥架线槽安装', '线缆管路预埋敷设', '接地跨接和防火封堵', '隐蔽验收和标识']
    if (itemName.includes('线缆')) return ['线缆规格和路径复核', '线缆敷设和牵引弯曲半径控制', '线缆端接和模块压接', '回路编号和永久标识', '绝缘或认证链路测试', '测试记录归档']
    if (itemName.includes('设备') || itemName.includes('软件')) return ['设备进场验收和开箱检查', '设备安装固定和接地', '线缆连接和端接', '软件部署和参数配置', '单机通电和功能测试']
    if (itemName.includes('调试')) return ['调试方案和点表确认', '单点或单机测试', '分系统功能测试和联动测试', '系统联调和端到端验证', '调试问题整改闭合', '调试记录和报告移交']
    if (itemName.includes('试运行')) return ['试运行条件确认', '系统连续运行监测(≥120h)', '故障记录和即时处置', '试运行数据汇总和分析', '试运行报告签认和移交']
    return ['管槽路径安装', '线缆敷设和端接', '设备安装', '软件安装和参数配置', '分项功能测试', '系统联调和试运行', '验收移交']
  }
  if (code === '08-14-01') return ['BMS梯架托盘槽盒路径和点位复核', '支吊架材料和防腐状态复验', '梯架托盘槽盒支吊架定位安装', '槽盒和导管敷设固定', '穿墙穿楼板套管和防火封堵施工', '接地跨接和等电位连接测试', '管槽转弯半径和检修空间复查', '隐蔽验收和路径标识', 'BMS管槽安装移交']
  if (code === '08-14-02') return ['BMS线缆规格和点表回路复核', '线缆敷设路径和牵引条件确认', 'BMS线缆敷设和分层绑扎', '控制线通讯线端接压接', '屏蔽接地和接地连续性测试', '回路编号和永久标识粘贴', '绝缘测试和通讯线缆通断测试', '线缆测试记录归档', 'BMS线缆敷设验收']
  if (code === '08-14-03') return ['BMS传感器点位和量程复核', '温湿度压力流量传感器进场复验', '传感器安装位置和取样条件确认', '传感器支架底座安装固定', '传感器接线和地址编码', '量程参数写入和零点校准', '现场比对校准和偏差记录', '点表回写和标签标识', '传感器安装验收']
  if (code === '08-14-04') return ['阀门风阀执行器选型和控制方式复核', '执行器安装支架和轴套接口检查', '阀门执行器安装和机械行程调整', '风阀执行器安装和开闭角度校准', '开闭方向和限位位置校验', '反馈信号接线和状态显示复核', '手自动切换和失电保护功能测试', 'DDC点对点动作测试和趋势记录', '联动复测和执行器安装验收']
  if (code === '08-14-05') return ['DDC箱控制器位置和电源条件复核', 'DDC箱体控制器和I/O模块进场复验', 'DDC箱安装固定和接地', '电源回路和端子排接线', 'I/O模块插接和通道编号', '通讯总线和网络端口接入', '端子紧固和线号核对', '控制器上电自检和通讯测试', 'DDC箱控制器安装验收']
  if (code === '08-14-06') return ['中央管理工作站和服务器部署条件复核', '服务器操作分站和客户端设备进场复验', '中央管理工作站安装固定', 'BMS服务器和数据库主机部署', '操作分站和客户端网络接入', '用户权限和角色策略配置', '数据备份和时间同步设置', '网络连通和访问权限测试', 'BMS工作站设备验收']
  if (code === '08-14-07') return ['BMS软件版本授权和点表范围复核', 'BMS软件平台和数据库安装', '控制器点表导入和地址映射', '设备图形页面和系统导航配置', '报警规则和优先级配置', '趋势记录和历史数据存储配置', '控制策略和时间表参数下载', '备份恢复和版本冻结记录', 'BMS软件安装验收']
  if (code === '08-14-08') return ['BMS系统调试方案和点表清单确认', '现场点对点输入输出测试', '控制逻辑和PID参数调试', '联动场景和时序动作验证', 'IBMS接口数据上传和命令下发测试', '报警趋势和历史曲线核对', '节能控制模式和权限复测', '调试问题销项和复测签认', 'BMS系统调试验收']
  if (code === '08-14-09') return ['BMS试运行条件和监控值守安排确认', '连续试运行趋势数据采集', '报警事件和故障记录巡检', '控制策略运行偏差分析', '现场反馈问题销项和复测', '权限账号和操作日志审计', '运行报表和能耗数据汇总', '运维培训和资料移交', 'BMS试运行验收签认']
  if (code.startsWith('08-14')) return ['传感器和执行器点位复核', 'DDC箱或控制器安装', '传感器和执行器安装', '通讯线缆敷设接线', 'DDC或PLC程序下载', '单点对点和控制逻辑测试', '与IBMS数据接口测试', '联动场景调试', '试运行和验收']
  if (code.startsWith('08-15') && !['08-15-01', '08-15-02', '08-15-03', '08-15-04', '08-15-05', '08-15-06', '08-15-07', '08-15-08'].includes(code)) return ['管槽和探测器点位冲突检查', '火灾报警控制器和联动控制柜安装', '烟感温感等探测器安装', '手动报警按钮和消火栓按钮安装', '消防广播和声光报警安装', '消防电话和模块箱接线', '探测器地址编码和回路测试', '全功能联动测试(按GB50166)', '检测验收配合']
  if (code === '08-16-04') return ['安防平台版本授权和服务器环境复核', 'VMS视频管理平台部署和基础参数配置', '门禁平台数据库服务和接口服务部署', '组织架构权限模型和角色策略配置', '视频通道和NVR存储资源导入', '录像策略存储周期和覆盖规则配置', '告警规则布防时段和事件推送配置', '备份恢复策略和日志留存配置', '账号审计权限复核和平台验收']
  if (code === '08-16-05') return ['安防系统调试方案点表和联动矩阵确认', '视频画面清晰度码流帧率调试', '录像检索回放和时间同步测试', '门禁联动开门权限和反潜回测试', '入侵报警防区布撤防和旁路规则调试', '存储容量压力测试和告警阈值复核', '访客黑名单和异常事件推送测试', '多系统联动场景验证和应急预案演练', '调试问题闭合和复测记录签认', '安防调试报告运维账号和资料移交']
  const securityProtectionProcessesByCode: Record<string, string[]> = {
    '08-16-01': ['安防桥架路径摄像机点位和门禁点位复核', '视频监控门禁报警管槽路由放线', '安防桥架槽盒和导管支吊架安装', '摄像机立杆和门禁底盒管路预留', '接地跨接和屏蔽干扰隔离复核', '穿墙穿楼板防火封堵施工', '安防管槽隐蔽验收', '安防管槽路径标识和移交'],
    '08-16-02': ['视频网线门禁线缆和报警回路规格复核', '视频监控网线和光纤敷设', '门禁线缆电锁线和出门按钮线敷设', '报警回路线缆敷设和防区编号', '屏蔽接地和弱电强电间距复核', '链路测试和绝缘测试', '线缆标签粘贴和清册复核', '安防线缆测试记录归档'],
    '08-16-03': ['安防设备点表和安装界面复核', '摄像机视场盲区复核和支架防水防拆安装', 'NVR硬盘初始化和存储设备上架接地', '录像码流和存储周期配置', '门禁控制器读卡器电锁安装接线', '报警探测器和报警防区模块编码', '门禁电锁报警防区布撤防功能测试', '图像质量和事件记录验收移交'],
    '08-16-06': ['安防试运行条件和布撤防策略确认', '视频存储巡检和录像回放抽查', '门禁事件记录和权限异常巡检', '报警防区布撤防和旁路状态巡检', '联动告警故障记录和处置闭环', '试运行问题销项和复测签认', '安防试运行报告编制', '安防运维移交资料归档'],
  }
  if (securityProtectionProcessesByCode[code]) return securityProtectionProcessesByCode[code]
  if (code.startsWith('08-16')) return ['管槽路径和摄像机门禁点位复核', '视频监控设备(摄像机/NVR/矩阵)安装', '门禁控制器和读卡器电控锁安装', '入侵报警探测器和报警主机安装', '线缆端接和子系统功能测试', '存储容量和图像质量复核', '多系统联动测试(门禁+视频+报警)', '试运行和验收']
  if (code === '06-07-02') return ['净化部件规格和洁净等级复核', '阀件消声器静压箱进场验收', '部件清洁和密封处理', '调节阀防火阀方向复核', '部件组装和启闭检查', '端口封闭和编号标识', '部件质量复测和移交记录']
  if (code === '06-07-01') return ['净化风管板材脱脂清洗', '洁净风管下料和剪切成型', '咬口或法兰成型', '内壁清洁封口和端口保护', '净化风管编号包装', '洁净区转运保护', '净化风管制作检验']
  if (code === '06-07-03') return ['洁净区作业条件和封闭措施确认', '支吊架定位安装和防腐复核', '风管分段吊装和法兰连接', '穿墙穿顶节点密封', '风管内壁二次清理和封口保护', '漏风量或严密性测试', '洁净风管隐蔽验收']
  if (code === '06-07-04') return ['净化空调设备基础和检修空间复核', '机组开箱验收和过滤段配置复核', '减振底座和机组就位固定', '冷热媒冷凝水和电控接口连接', '箱体漏风和门封检查', '单机试运转和参数记录', '设备质量复测和移交']
  if (code === '06-07-06') return ['净化空调机组规格和洁净等级复核', '设备基础减振和检修空间确认', '机组分段搬运就位', '箱体拼接密封和水平校正', '冷热媒冷凝水和电控接口连接', '初中效过滤器安装检查', '单机试运转和质量复测']
  if (code === '06-07-08') return ['高效过滤器批次和检漏资料核验', '安装前洁净室清洁和静压箱复核', '过滤器外观密封垫检查', '高效过滤器就位压紧', '风机过滤单元接线和转向检查', 'PAO扫描检漏测试', '压差标识和验收记录签认']
  if (code === '06-07-09') return ['洁净度测试方案和测点布置确认', '空态或静态测试条件确认', '风量换气次数和压差参数预调', '悬浮粒子采样测试', '沉降菌或浮游菌检测配合', '温湿度噪声照度参数记录', '检测问题整改和报告复核']
  if (code === '06-07-11') return ['净化空调调试方案和房间状态确认', '风量平衡和压差梯度调试', '温湿度控制参数整定', '过滤器压差和报警点复核', '洁净度复测和问题销项', '自控联动和运行模式测试', '调试报告和运维移交']
  if (code === '08-15-01') return ['消防报警回路线管路径复核', '探测器和模块盒位定位', '耐火线路管槽敷设', '桥架导管支吊架和转弯半径复测', '防火分区穿越封堵和接地跨接', '接地屏蔽连续性测试']
  if (code === '08-15-02') return ['报警总线电源线和消防电话广播线分色复核', '隔离器和回路分段清单确认', '线缆牵引敷设和余量控制', '端接压接和屏蔽接地', '地址编码前回路绝缘复测', '报警线缆清册和验收记录签认']
  if (code === '08-15-03') return ['探测器点位和编码图复核', '底座安装和回路接线', '探测器安装和防尘保护', '地址编码和回路登记', '烟温感单点模拟测试', '报警确认灯和区域显示复核', '点位表回写和验收记录']
  if (code === '08-15-04') return ['控制器位置和电源接地复核', '控制器柜箱安装固定', '回路线缆端接和标识', '主备电源接入和切换测试', '回路注册和设备地址导入', '故障报警和打印记录测试', '控制器调试记录签认']
  if (code === '08-15-05') return ['模块声光手报等设备点位复核', '底盒和接口条件检查', '现场设备安装接线', '地址编码和联动关系记录', '单点动作和反馈测试', '消防电话广播接口复核', '点位问题整改闭合']
  if (code === '08-15-06') return ['报警主机软件版本和授权复核', '工程点表和回路数据导入', '报警分区和联动矩阵配置', '图形显示设备状态绑定和功能测试', '备份恢复和权限设置测试', '配置校验和版本冻结记录', '软件资料移交']
  if (code === '08-15-07') return ['系统调试方案和联动矩阵确认', '回路巡检和故障清零', '探测报警单点测试', '手报声光广播联动测试', '防排烟卷帘电梯接口联调', '消防控制室反馈复核', '调试问题销项和记录签认']
  if (code === '08-15-08') return ['试运行条件和人员值守确认', '报警故障和屏蔽记录巡检', '主备电源切换巡检', '联动场景测试', '误报漏报问题整改闭合', '试运行记录汇总', '消防检测资料配合']
  if (code === '08-18-01') return ['机房供配电系统图和容量复核', 'UPS配电柜和列头柜进场验收', '设备基础和防静电接地复核', '配电柜UPS电池柜就位固定', '母线电缆和末端PDU接线', '绝缘接地和相序测试', 'UPS充放电和旁路切换测试', '双路电源切换和告警联调', '供配电运行记录移交']
  if (code === '08-18-02') return ['机房接地方案和等电位范围复核', '接地材料和端子箱进场验收', '接地干线和汇流排安装', '机柜桥架设备等电位连接', '防雷浪涌保护器安装', '接地电阻和导通测试', '隐蔽验收和标识挂牌', '测试记录复核和移交']
  if (code === '08-18-03') return ['机房空调负荷和气流组织复核', '精密空调或列间空调进场验收', '设备基础和减振安装', '冷媒冷冻水冷凝水管路连接', '送回风通道和封堵检查', '温湿度传感器和漏水检测接入', '单机试运转和报警测试', '气流组织和温湿度均匀性测试', '运行参数移交']
  if (code === '08-18-04') return ['机房给水接入和排水排放界面复核', '管材阀门地漏和漏水报警材料进场验收', '给水支管阀门和隔断点安装', '空调冷凝水管路接驳和坡度复核', '排水坡度支吊架和套管封堵施工', '地漏和存水弯安装及水封高度复核', '漏水报警探头和动环接口接入', '给水管道压力试验和冲洗', '排水管道灌水通球试验', '管道保温防结露和穿墙收口施工', '阀门挂牌流向标识和隐蔽记录签认', '给排水功能联动测试和运维移交']
  if (code === '08-18-05') return ['机房机柜和配线架布置复核', '铜缆和光纤线缆进场验收', '机柜和配线架安装固定', '线缆敷设和端接', '光纤熔接和OTDR测试', '永久链路和信道认证测试', '标识标签和竣工图绘制', '综合布线系统验收']
  if (code === '08-18-06') return ['机房摄像机门禁点位和安防联动矩阵复核', '摄像机NVR存储设备上架接线和视场复核', '门禁控制器读卡器电锁和出门按钮安装', '入侵报警防区探测器模块编码和布撤防测试', '动环监控温湿度漏水传感器接入和告警点表回写', '视频录像回放门禁事件和动环告警单系统测试', '安防平台联动矩阵门禁视频动环场景验证', '监控安防运维账号移交资料和验收签认']
  if (code === '08-18-07') return ['机房消防防护区边界和气体灭火方案复核', '火灾报警控制器探测器和声光放气指示安装', '气瓶间瓶组管网喷嘴和选择阀安装', '泄压口和防护区密闭条件复核', '紧急启停按钮和延时释放逻辑接线', '空调风阀门禁切断和消防联动控制测试', '气体灭火模拟启动和专项检测', '机房消防系统专项检测复核和运维交接']
  if (code === '08-18-08') return ['机房装修方案和材料防火等级复核', '墙地面基层找平和防尘封闭处理', '防静电地板支架放线和承载复核', '防静电地板支架接地和等电位连接', '防静电地板面板铺设和缝隙调整', '墙面彩钢板或防火板安装', '吊顶龙骨和吊顶板安装', '门窗隔断安装和密封收口', '穿墙洞口防火封堵和气密处理', '照明插座应急照明和检修口安装', '机柜开孔踢脚线和装饰收口施工', '洁净交付清洁和室内装修验收']
  if (code === '08-18-09') return ['机房电磁屏蔽方案复核', '屏蔽壳体或网体材料进场验收', '屏蔽壳体焊接或组装施工', '屏蔽门和波导窗安装', '穿墙管线和滤波器安装', '屏蔽层接地连接和搭接电阻测试', '屏蔽效能检测(按GB/T12190)', '泄漏点整改和屏蔽效能复测', '屏蔽检测报告复核和专项验收准备', '电磁屏蔽验收']
  if (code === '08-18-10') return ['机房系统调试脚本接口清单和回退方案确认', 'UPS双路电源切换旁路和电池放电联调', '精密空调新风漏水报警和温湿度策略联调', '消防报警气体灭火释放反馈和联动切断测试', '门禁视频动环平台告警事件工单和权限联调', '网络链路机柜资产端口标签和DCIM数据复核', '故障场景脚本验证断电漏水火警和门禁异常销项', '机房系统联调报告运维移交签认和问题闭合']
  if (code === '08-18-11') return ['机房试运行条件确认', '供配电和UPS运行巡检', '温湿度压差和漏水状态巡检', '安防消防动环告警巡检', '网络链路和机柜负载复核', '异常记录和整改闭合', '试运行数据汇总', '运维资料和账号权限移交']
  if (code === '05-01-09') return ['给水系统调试方案和分区边界确认', '给水系统水压试验和稳压查漏', '管网冲洗消毒和排放确认', '水质取样检测和报告复核', '末端流量压力和用水点覆盖复测', '泵组联动和液位阀门测试', '问题整改和复测记录签认', '给水系统调试验收移交']
  if (code === '05-07-03') return ['室外排水调试方案和井段范围确认', '排水管道闭水试验和水位观察', '井池渗漏和接口渗水检查', '通水排放试验和流向观察', '管道坡度复核和倒坡排查', '排水通畅性和淤堵点复测', '渗漏堵塞问题整改复验', '室外排水试验调试验收']
  if (code === '05-08-06') return ['供热管网调试方案和分区边界确认', '供热管网水压试验和稳压查漏', '补偿器支座和固定点复核', '管网冲洗排污和过滤器清理', '升温试运行和伸缩位移观察', '热力平衡和末端温差复测', '保温接口和防潮层复查', '室外供热管网调试验收']
  if (code === '05-06-03') return ['室外给水调试方案和分区边界确认', '室外给水管网试压和稳压查漏', '管网冲洗消毒和排放确认', '消火栓出水压力和覆盖复测', '阀门井启闭功能和井内渗漏检查', '水质余氯和浊度抽测', '问题整改和复测记录签认', '室外给水试验调试验收']
  if (code === '05-09-05') return ['饮用水调试方案和卫生边界确认', '饮用水管网冲洗消毒和排放确认', '消毒投加浓度和接触时间复核', '末端取样点布置和封样送检', '水质检测报告和限值比对', '水泵阀组和供水压力联动测试', '不合格点整改和复检闭合', '饮用水卫生验收资料移交']
  if (code === '05-10-06') return ['中水雨水回用调试方案确认', '中水管网和雨水回用池清洗检查', '回用水质浊度余氯和色度检测', '液位联动补水排水和溢流测试', '过滤消毒设备运行参数标定', '非饮用标识和防误接复核', '回用水质超限整改复测', '中水雨水利用调试验收']
  if (code === '05-12-04') return ['水景调试方案和安全隔离确认', '水泵联动和阀组启停测试', '喷头水形高度角度和均匀性调整', '水景灯供电绝缘和漏电保护测试', '循环过滤和补排水功能复测', '水池渗漏溢流和水位控制检查', '水形灯光问题整改复演', '水景喷泉试验调试验收']
  if (code === '05-14-02') return ['仪表回路调试方案和点表核对', '传感器量程标定和零点校验', '取源管路和信号线回路测试', '控制柜输入输出点逐点联调', '阀门执行器和联锁逻辑验证', '数据趋势和报警阈值复核', '仪表偏差整改和复校签认', '检测控制仪表调试验收']
  if (code === '05-11-05') return ['泳池水系统调试方案和水质目标确认', '循环过滤泵组和阀组联动测试', '过滤器反冲洗功能和排污检查', '消毒投加和pH调节装置调试', '余氯浊度pH水质检测', '水循环换水量和池水均匀性复测', '水质超限问题整改复验', '泳池水处理调试验收']
  if (code === '05-13-07') return ['热源系统调试方案和安全条件确认', '锅炉点火前安全附件复核', '锅炉点火试运行和燃烧参数调整', '循环泵补水泵和阀组联动测试', '换热站一次二次侧温差复测', '热负荷输出和供回水温度记录', '安全联锁和报警保护复测', '热源系统调试验收移交']
  if (code === '06-01-07') return ['送风系统调试方案和测点布置确认', '风机联动和转向运行检查', '风阀风口开启状态复核', '系统风量平衡和支路风量调整', '风口风速和送风效果复测', '噪声振动和电流参数记录', '自控联动和运行模式复测', '送风系统调试验收移交']
  if (code === '06-02-08') return ['排风系统调试方案和测点布置确认', '排风机联动和转向运行检查', '排风量和支路风量平衡调整', '房间负压和补风路径复测', '止回阀风阀开闭和防倒流检查', '异味排出和排放口状态复核', '噪声振动和电流参数记录', '排风系统调试验收移交']
  if (code === '06-03-07') return ['防排烟系统调试方案和消防联动矩阵确认', '排烟风机和正压送风机联动启动测试', '排烟风量和楼梯间正压复测', '防火阀排烟阀动作和反馈信号检查', '消防报警分区联动场景测试', '消防验收测点和排烟口风速复核', '联动缺陷整改和复测签认', '防排烟系统消防验收移交']
  if (code === '06-04-09') return ['除尘系统调试方案和工况粉尘源确认', '除尘风机转向和风量风压测试', '吸尘罩捕集风速和收集范围复测', '滤袋滤筒差压和清灰周期标定', '卸灰排污和密封状态检查', '粉尘排放浓度和防爆联锁复核', '除尘效率问题整改复测', '除尘系统调试验收移交']
  if (code === '06-05-10') return ['舒适空调调试方案和房间负荷边界确认', '空调风量和支路平衡调整', '水阀联动和风阀联动测试', '温湿度和送回风温差复测', '风机盘管末端和新风量校核', '噪声振动和冷凝水排放检查', '舒适性投诉点整改复测', '舒适空调系统调试验收']
  if (code === '06-06-10') return ['恒温恒湿调试方案和精度目标确认', '精密空调和加湿除湿设备联动测试', '温湿度精度和波动范围连续记录', '传感器校准和报警联动复核', '送回风组织和洁净辅助条件检查', '连续运行稳定性和故障切换测试', '超差点整改和趋势复核', '恒温恒湿系统调试验收']
  if (code === '06-08-07') return ['人防通风调试方案和防护单元边界确认', '清洁滤毒隔绝三种通风模式切换测试', '密闭阀门和防爆波活门动作检查', '过滤吸收器阻力和气流方向复测', '超压排气活门和室内超压测试', '手电动切换和应急电源联动检查', '人防通风缺陷整改复测', '人防验收资料移交']
  if (code === '06-09-09') return ['真空吸尘调试方案和服务区域确认', '真空主机负压和风量测试', '管网漏气量和密封接口复测', '快速接口启闭和末端吸力检查', '集尘桶滤尘器和报警联动测试', '噪声振动和电流参数记录', '吸尘效果问题整改复测', '真空吸尘系统压力试验及调试验收']
  if ((code.startsWith('05-') || code.startsWith('06-')) && (itemName.includes('试验与调试') || itemName.includes('试验及调试') || itemName.includes('系统压力试验及调试') || itemName.includes('系统调试'))) {
    return ['调试条件确认', '调试方案编制审批和测点清单确认', '单机试验', '分区或分系统测试', '系统联动调试', '压力流量或平衡参数复核', '问题整改闭合', '调试参数复核和交接签认']
  }
  if (code === '05-13-03') return ['安全附件清单和校验报告复核', '安全阀整定压力核对', '压力表温度计取压测温点安装', '水位计和液位保护安装', '膨胀罐和泄压装置接口复核', '安全阀排放管安装', '低水位超压超温联锁测试', '附件挂牌铅封和校验证书归档']
  if (code === '05-14-01') return ['仪表点位和量程复核', '检测仪器及仪表进场验收', '取源部件或传感器安装', '仪表本体安装固定', '接线接管和回路校验', '参数标定和单点测试', '联动调试和记录签认']

  // 02-04 钢管混凝土结构
  if (code.startsWith('02-04')) {
    if (itemName.includes('构件现场拼装')) return ['拼装胎架和测量放线复核', '构件进场验收', '构件拼装组对', '临时支撑和定位校正', '接口和焊缝质量检查', '拼装验收和记录签认']
    if (itemName.includes('构件安装')) return ['基础或下节柱顶复核', '起重设备和吊装方案交底', '构件吊装就位', '垂直度和标高校正', '临时固定和连接施工', '安装质量验收和记录签认']
    if (itemName.includes('钢管焊接')) return ['焊接工艺评定和焊材进场复验', '焊前坡口清理和组对', '定位焊和预热控制', '正式焊接和层间温度记录', '焊缝外观检查', '无损检测委托和报告复核', '返修闭合和验收']
    if (itemName.includes('构件连接')) return ['连接界面清理和预处理', '连接件或紧固件进场复验', '连接节点施工', '连接质量检查', '防松或防腐蚀处理', '连接验收记录签认']
    if (itemName.includes('钢管内钢筋骨架')) return ['骨架下料和加工', '钢管内壁清理检查', '钢筋骨架吊装入管', '骨架定位和垫块检查', '管口封闭和保护']
    return ['混凝土配合比和灌注方案交底', '管内洁净度检查', '自密实或顶升混凝土浇筑', '密实度敲击或无损检测', '缺陷处理和补强', '浇筑记录和验收']
  }

  // 02-05 型钢混凝土结构
  if (code.startsWith('02-05')) {
    if (itemName.includes('型钢焊接')) return ['焊接工艺评定和焊材进场复验', '焊前坡口清理和组对', '定位焊和预热控制', '正式焊接和层间温度记录', '焊缝外观检查', '无损检测委托和报告复核', '返修闭合和验收']
    if (itemName.includes('紧固件连接')) return ['连接副批次复验和高强螺栓规格核对', '摩擦面抗滑移系数复验和孔位复核', '高强螺栓穿装和初拧控制', '复拧终拧顺序和终拧标记施工', '扭矩或轴力抽检和不合格复拧', '紧固件连接验收记录签认']
    if (itemName.includes('型钢与钢筋连接')) return ['连接节点深化复核', '钢筋与型钢连接界面处理', '连接器或焊接连接施工', '连接质量检查', '保护层和混凝土包裹条件确认', '隐蔽验收']
    if (itemName.includes('构件组装')) return ['组装胎架和测量放线复核', '型钢构件进场验收', '构件组装组对', '临时支撑和定位校正', '组装接口质量检查', '组装验收']
    if (itemName.includes('预拼装')) return ['预拼装场地和胎架准备', '预拼装测量放线', '分段或分区预拼装', '接口间隙和错边检查', '预拼装测量成果记录', '预拼装验收和拆解保护']
    if (itemName.includes('型钢安装')) return ['基础或下节柱顶复核', '起重设备和吊装方案交底', '型钢构件吊装就位', '垂直度和标高校正', '临时固定和节点连接', '安装质量验收']
    if (itemName.includes('模板')) return ['模板深化和型钢穿腹板孔位复核', '对拉螺杆和拉结片布置', '支架和模板安装加固', '接缝和垂直度检查', '浇筑监测和变形控制', '模板拆除和清理']
    return ['混凝土配合比和浇筑方案交底', '钢筋和型钢骨架清理复核', '型钢柱梁节点区浇筑路径控制', '分层浇筑和振捣控制', '密实度和蜂窝麻面检查', '养护和强度检测验收']
  }

  // 02-06 铝合金结构 remaining (02-06-01焊接已覆盖)
  if (code === '02-06-02') return ['摩擦面清理和抗滑移系数复验', '紧固件进场复验和试装', '紧固件安装', '初拧和终拧控制', '扭矩检查和不合格复拧', '连接验收']
  if (code === '02-06-03') return ['铝合金型材和板材进场复验', '加工图核对和下料', '切割和开孔加工', '边缘处理和平整度检查', '零部件编号和防污染保护', '加工验收']
  if (code === '02-06-04') return ['铝合金构件编号和规格复核', '组装胎架和测量放线复核', '孔位间隙和组对基准实测', '节点连接件或紧固件安装', '接触面隔离防腐和防电化学腐蚀处理', '组装验收记录和成品保护移交']
  if (code === '02-06-05') return ['预拼装场地和胎架准备', '预拼装测量放线', '分段预拼装', '接口间隙和错边检查', '精度测量成果记录', '预拼装验收和拆解保护']
  if (code === '02-06-06') return ['铝合金框架支承面标高轴线复核', '起重设备站位和吊装方案交底', '框架构件编号吊装就位和临时固定', '框架轴线垂直度和节点间隙校正', '连接节点紧固防松和绝缘隔离处理', '框架整体偏差复测和交接签认']
  if (code === '02-06-07') return ['空间网格支座节点坐标和标高复核', '安装方案起重设备和临时支撑交底', '空间网格杆件分区安装和节点拼装', '节点定位标高和三维坐标复测调试', '结构闭合整体稳定和偏位复核施工', '空间网格卸载后整体复测和交接签认']
  if (code === '02-06-08') return ['檩条或支座安装复核', '铝合金面板进场复验', '面板安装(顺水流搭接)', '咬边或扣合连接', '泛水板收边板安装', '成品保护和验收']
  if (code === '02-06-09') return ['主体结构或龙骨界面复核', '铝合金幕墙构件进场验收', '幕墙连接件安装', '幕墙框架安装', '面板或玻璃安装', '密封胶和防风雨检查', '幕墙性能验收']
  if (code === '02-06-10') return ['铝合金表面预处理验收', '防腐涂料或阳极氧化膜复验', '防腐涂装或电化学处理施工', '涂层厚度或氧化膜厚度检测', '附着力和针孔漏点检查', '防腐验收和成品保护']

  // 02-07 木结构
  if (code === '02-07-01') return ['方木原木进场验收和含水率检测', '防腐防火防虫处理核查', '基础或支座复核', '结构构件安装', '榫卯或金属连接件施工', '垂直度和标高复核', '稳定性和整体验收']
  if (code === '02-07-02') return ['胶合木进场验收和胶合性能报告复核', '防腐防火处理核查', '支座和连接界面复核', '胶合木构件安装', '连接节点施工', '整体垂直度和挠度复核', '结构验收']
  if (code === '02-07-03') return ['规格材和覆面板进场验收', '基础锚固和防潮层复核', '墙体骨架安装', '楼盖和屋盖骨架安装', '面板覆面和连接固定', '保温隔音填充', '结构验收']
  if (code === '02-07-04') return ['木构件防护等级确认', '防腐处理施工(浸渍或涂刷)', '防火处理(阻燃剂或防火涂料)', '防虫和白蚁处理', '防护处理效果检测', '防护记录签认和验收']

  // 05-06 室外给水管网 / 05-07 室外排水管网 / 05-08 室外供热管网 / 05-12 水景喷泉
  if (code.startsWith('05-06')) return ['管沟测量放线和基底验槽', '给水管道进场复验', '管道敷设和接口连接', '阀门井和水表井施工', '管道试压和冲洗消毒', '管沟回填和分层压实', '消防栓和阀门标识', '验收移交']
  if (code === '05-07-01') return ['管沟测量放线高程复核和沟槽支护', '排水管道进场复验和管基垫层验收', '管道敷设坡度控制和承插接口施工', '检查井砌筑化粪池施工和井段交接', '井段闭水试验和渗漏整改', '管沟回填和分层回填压实', '排水管道安装功能复测和交接签认']
  if (code.startsWith('05-07')) return ['管沟测量放线和高程复核', '排水管道进场复验', '管道敷设和坡度控制', '检查井和化粪池施工', '闭水试验', '管沟回填和分层压实', '验收移交']
  if (code === '05-08-01') return ['室外供热管线坐标和高程复核', '预制保温管规格批次验收', '沟槽支护垫层和下管条件确认', '供回水管段组对和焊接', '补偿器导向支架安装校正', '固定支架和滑动支架复核', '焊口外观与无损抽检', '供热管道安装隐蔽验收']
  if (code === '05-08-02') return ['试压分段和盲板封堵方案确认', '压力表校验和试压泵准备', '管网分段注水排气', '强度试验升压和稳压查漏', '严密性试验压力保持', '泄压排水和临时封堵拆除', '渗漏整改复验', '水压试验记录签认']
  if (code === '05-08-03') return ['供热检查井和固定墩定位复核', '垫层模板钢筋和预埋件施工', '固定墩混凝土浇筑养护', '滑动支座和导向支座安装', '检查井砌筑或现浇成型', '井室盖板吊装和井筒收口', '结构尺寸防水和承载复查', '供热土建结构验收']
  if (code === '05-08-04') return ['防腐基层清理和焊口干燥确认', '补口补伤区域打磨除锈', '底漆涂刷和边角封闭', '面漆或防腐层分遍施工', '防腐层厚度和附着力抽测', '补口热收缩套或冷缠带施工', '电火花检漏和缺陷修补', '供热管网防腐验收']
  if (code === '05-08-05') return ['保温层厚度和材料性能复验', '接口保温和发泡补口施工', '补偿器保温伸缩节点处理', '阀门法兰可拆卸保温安装', '防潮层搭接密封检查', '保护壳安装和端部封闭', '热桥和破损点复查修补', '供热管网绝热验收']
  if (code.startsWith('05-08')) return ['管沟测量放线和基底验槽', '供热管道和保温管进场复验', '管道敷设和补偿器安装', '阀门和疏水器安装', '管道试压和冲洗', '管道保温接口和防潮层施工', '管沟回填和标识', '系统调试和验收']
  if (code === '05-12-01') return ['水景管线定位和水池套管预埋复核', '循环管路管材阀件和喷头设备批次复验', '循环管路支吊架和水池穿墙套管安装', '喷头支管安装和喷泉泵组接口接驳', '阀组分区复核和过滤器旁通接口安装', '喷泉灯具套管和防水接线盒安装', '循环管路试压冲洗和渗漏检查', '喷头高度角度校正和水池隐蔽验收', '水景喷泉管道及配件专项验收签认']
  if (code === '05-12-02') return ['水池潮湿环境防腐范围和腐蚀等级复核', '基层除锈干燥和表面粗糙度检查', '防腐底涂材料批次和配比复核', '水下金属支架防腐底涂施工', '管件补口和焊口边角防腐施工', '面层防腐涂装和膜厚控制', '针孔漏点检测和缺陷修补', '防腐层厚度附着力抽检', '补口复验和防腐资料闭合签认']
  if (code === '05-12-03') return ['水景管线防结露范围和保温边界复核', '保温材料憎水率和厚度批次复验', '管道表面干燥和接口清理', '直管段绝热层包覆施工', '阀门法兰异形保温和可拆卸盒安装', '防潮层搭接密封和端部封闭', '保护壳安装、检修口和设备铭牌避让', '湿区冷桥排查和破损点修补', '水景喷泉绝热验收专项签认']
  if (code.startsWith('05-12')) return ['水池或水景基础复核', '管道和喷头设备进场验收', '管道系统安装', '水泵和过滤设备安装', '喷头和水景灯具安装', '电气和控制系统接线', '系统试压和冲洗', '水形和灯光效果调试', '验收移交']

  // 06- 通风空调 remaining gaps
  const hvacAirEquipmentProcessesByCode: Record<string, string[]> = {
    '06-01-04': ['送风机基础和减振器安装复核', '送风机和空处理机组进场核验', '送风机就位找平和软接安装', '进出风管阀件和检修口连接', '电源接线接地和转向检查', '振动噪声风量试运转记录', '送风设备运行参数验收'],
    '06-02-04': ['排风机基础减振和屋面洞口复核', '排风机止回阀和防雨附件核验', '排风机就位找平和软接安装', '排风管接口密封和防倒流检查', '电源接线接地和转向检查', '排风量负压噪声试运转记录', '排风设备运行验收'],
    '06-02-06': ['吸风罩点位和罩口尺寸复核', '支架吊架和连接件安装', '吸风罩本体安装和高度校正', '局部排风管接口密封连接', '负压风量和捕集范围测试', '排风效果复测和收集检查', '吸风罩缺陷整改和验收签认'],
    '06-03-04': ['防排烟风机基础和防火分区复核', '防排烟风机耐温资料和铭牌核验', '防排烟风机就位减振和软接安装', '排烟防火阀和风管接口连接', '消防电源接线和转向检查', '消防联动启动和排烟风量测试', '防排烟风机验收移交'],
    '06-04-04': ['除尘风机基础和防爆接地复核', '耐磨叶轮和防爆电机资料核验', '除尘风机就位找平和减振安装', '吸尘主管和排风接口密封连接', '电气接线静电跨接和转向检查', '除尘风量负压和振动测试', '除尘风机运行验收'],
    '06-05-04': ['空调送回风机和空调箱基础复核', '空调风机盘管接口和减振附件核验', '空调风机就位找平和软接安装', '送回风阀件和检修段接口连接', '电源接线接地和转向检查', '空调风量噪声和电流试运转记录', '舒适空调风机验收移交'],
    '06-05-08': ['风机盘管VAV和CAV末端位置复核', '吊架减振和检修空间确认', '风机盘管或送风末端吊装固定', '供回水电源和冷凝水坡度连接', '风阀水阀温控器接线调试', '风量水量平衡和噪声复测', '末端运行验收移交'],
    '06-06-04': ['恒温恒湿送回风机基础复核', '空气处理段和减振软接附件核验', '恒温恒湿风机就位找平安装', '表冷加热加湿段接口连接', '电源自控接线和传感器回路复核', '温湿度稳定性和风量试运转记录', '恒温恒湿风机验收移交'],
    '06-08-04': ['人防通风机房和密闭接口复核', '人防通风机防爆附件资料核验', '人防通风机就位减振和软接安装', '密闭阀门和风管接口连接', '电源接线接地和手电动切换检查', '清洁滤毒隔绝模式风量测试', '人防通风机专项验收'],
    '06-09-04': ['真空吸尘主机房基础复核', '真空吸尘风机和消声附件核验', '真空吸尘风机就位找平安装', '真空主管旁通和检修接口连接', '电气自控接线和负压保护设定', '真空风机负压噪声试运转记录', '真空吸尘风机验收'],
    '06-09-08': ['真空泵滤尘设备基础和集尘间条件复核', '真空泵滤尘器集尘桶进场验收', '真空泵和滤尘设备就位找平连接', '吸尘管路和集尘接口密封安装', '电气自控接线和负压保护设定', '漏气量负压和滤尘效率测试', '真空吸尘设备联调验收移交'],
  }
  if (hvacAirEquipmentProcessesByCode[code]) return hvacAirEquipmentProcessesByCode[code]

  const hvacDuctFabricationProcessesByCode: Record<string, string[]> = {
    '06-01-01': ['送风系统板材厚度和材质复验', '送风管放样下料和编号', '送风管咬口或焊接制作', '送风法兰制作和铆接', '送风管加固和导流片制作', '送风管尺寸平整度和漏光检查', '送风管成品编号封存'],
    '06-02-01': ['排风系统板材耐腐蚀性能复验', '排风管放样下料和编号', '排风管咬口或焊接制作', '排风法兰和止回段接口制作', '排风管加固和检修口制作', '排风管严密性和防倒流节点检查', '排风管成品编号封存'],
    '06-03-01': ['防排烟耐火板材和防火包覆材料复验', '防排烟风管放样下料和分区编号', '防排烟耐火风管咬口或焊接制作', '耐火法兰和加固框制作', '防火包覆和防火封堵接口预制', '耐火标识尺寸和平整度检查', '防排烟风管成品编号封存'],
    '06-04-01': ['除尘风管耐磨板材和防静电材料复验', '除尘风管放样下料和弯头展开', '除尘耐磨风管焊接或咬口制作', '耐磨法兰和检修口制作', '防静电跨接点和泄爆接口预制', '除尘风管密封面和耐磨层检查', '除尘风管成品编号封存'],
    '06-05-01': ['舒适空调风管板材和保温界面复验', '空调送回风管放样下料和编号', '空调风管咬口或焊接制作', '空调法兰和检修口制作', '防凝露加固和导流片制作', '空调风管尺寸平整度和漏光检查', '舒适空调风管成品编号封存'],
    '06-06-01': ['恒温恒湿风管板材和气密材料复验', '恒温恒湿风管放样下料和编号', '恒温恒湿气密风管咬口或焊接制作', '气密法兰和检修门制作', '防凝露加固和密封槽制作', '恒温恒湿风管漏光和气密预检', '恒温恒湿风管成品编号封存'],
    '06-08-01': ['人防通风风管板材和密闭材料复验', '人防通风风管放样下料和防护单元编号', '人防密闭风管咬口或焊接制作', '密闭法兰和防爆波接口制作', '滤毒通风转换接口预制', '人防风管密闭面和平整度检查', '人防通风风管成品编号封存'],
    '06-09-01': ['真空吸尘负压风管板材和密封材料复验', '真空吸尘风管放样下料和编号', '真空吸尘风管焊接或密封咬口制作', '负压法兰和检修口制作', '集尘旁通和漏气检测口预制', '真空吸尘风管密封面和漏气风险检查', '真空吸尘风管成品编号封存'],
  }
  if (hvacDuctFabricationProcessesByCode[code]) return hvacDuctFabricationProcessesByCode[code]

  const hvacDuctComponentProcessesByCode: Record<string, string[]> = {
    '06-01-02': ['送风阀件加工图核对', '调节阀防火阀和软接材料复验', '送风部件制作和组装', '导流片消声部件尺寸检查', '动作灵活性和开度标识复核', '送风部件编号入库'],
    '06-02-02': ['排风阀件和止回阀加工图核对', '防腐阀件和柔性短管材料复验', '排风部件制作和组装', '止回阀动作和防倒流方向检查', '检修口清扫口尺寸复核', '排风部件编号入库'],
    '06-03-02': ['防排烟阀件和排烟口加工图核对', '耐火材料和防火阀排烟阀资料复验', '防排烟部件制作和组装', '执行机构动作和反馈信号检查', '防火密封和耐火标识复核', '防排烟部件编号入库'],
    '06-04-02': ['除尘部件加工图和耐磨等级核对', '防静电软接和防爆阀件材料复验', '除尘部件制作和组装', '灰斗检修口和泄爆口尺寸检查', '导电跨接点和密封面复核', '除尘部件编号入库'],
    '06-05-02': ['空调风阀消声器部件图核对', '保温消声和防凝露材料复验', '空调部件制作和组装', '消声静压箱和检修口尺寸检查', '风阀动作和风量调节标识复核', '空调部件编号入库'],
    '06-06-02': ['恒温恒湿部件加工图核对', '保温防凝露和密闭材料复验', '恒温恒湿部件制作和组装', '密闭检修门和调节阀尺寸检查', '气密性和温湿度传感器接口复核', '恒温恒湿部件编号入库'],
    '06-08-02': ['人防通风部件加工图核对', '密闭阀防爆波活门和滤毒部件复验', '人防通风部件制作和组装', '密闭胶条和法兰密封面检查', '清洁滤毒隔绝标识和动作复核', '人防通风部件编号入库'],
    '06-09-02': ['真空吸尘部件加工图核对', '负压阀件和密封圈材料复验', '真空吸尘部件制作和组装', '集尘接口和旁通阀尺寸检查', '密封面和漏气风险复核', '真空吸尘部件编号入库'],
  }
  if (hvacDuctComponentProcessesByCode[code]) return hvacDuctComponentProcessesByCode[code]

  const hvacDuctInstallationProcessesByCode: Record<string, string[]> = {
    '06-01-03': ['送风管支吊架定位和防腐复核', '送风管分段吊装就位', '送风法兰连接和密封垫安装', '送风阀件和风口末端安装', '送风管漏风量或漏光测试', '送风保温连续性和支架冷桥复查', '送风管系统安装验收'],
    '06-02-03': ['排风管支吊架定位和防腐复核', '排风管分段吊装就位', '排风法兰连接和密封垫安装', '排风止回阀和检修口安装', '排风负压和漏风量测试', '排风防倒流和排放路径复查', '排风管系统安装验收'],
    '06-03-03': ['防排烟风管支吊架和耐火界面复核', '防排烟风管分段吊装就位', '耐火法兰连接和密封垫安装', '防火阀排烟阀和排烟口安装', '防火封堵和漏风量测试', '消防联动反馈和防排烟路径复查', '防排烟风管系统安装验收'],
    '06-04-03': ['除尘风管支吊架和防静电接地点复核', '除尘风管分段吊装就位', '耐磨法兰连接和密封垫安装', '吸尘罩支管和检修口安装', '除尘风管漏风量和负压测试', '防静电跨接和捕集路径复查', '除尘风管系统安装验收'],
    '06-05-03': ['空调风管支吊架和保温界面复核', '空调风管分段吊装就位', '送回风法兰连接和密封垫安装', '空调风阀风口和检修口安装', '空调风管漏风量或漏光测试', '保温防凝露和冷凝风险复查', '空调风管系统安装验收'],
    '06-06-03': ['恒温恒湿风管支吊架和气密界面复核', '恒温恒湿风管分段吊装就位', '气密法兰连接和密封垫安装', '调节阀检修门和测点接口安装', '恒温恒湿风管漏风量和气密测试', '温湿度测点和防凝露节点复查', '恒温恒湿风管系统安装验收'],
    '06-08-03': ['人防通风风管支吊架和密闭穿墙界面复核', '人防通风风管分段吊装就位', '密闭法兰连接和密封垫安装', '密闭阀滤毒接口和防爆波部件安装', '人防通风漏风量和密闭测试', '清洁滤毒隔绝转换路径复查', '人防通风风管系统安装验收'],
    '06-09-03': ['真空吸尘负压管路支吊架复核', '真空吸尘风管分段吊装就位', '负压法兰连接和密封垫安装', '快速接口支管和集尘旁通安装', '真空吸尘漏气量和负压测试', '密封节点和集尘路径复查', '真空吸尘风管系统安装验收'],
  }
  if (hvacDuctInstallationProcessesByCode[code]) return hvacDuctInstallationProcessesByCode[code]

  if (code.startsWith('06-01') || code.startsWith('06-02') || code.startsWith('06-03') || code.startsWith('06-04') || code.startsWith('06-05') || code.startsWith('06-06') || code.startsWith('06-08') || code.startsWith('06-09')) {
    if (itemName === '风管与配件制作') return ['板材厚度和材质复验', '风管放样下料', '咬口或焊接制作', '法兰制作和铆接', '风管加固处理', '成品尺寸和平整度检查', '编号封存']
    if (itemName === '部件制作') return ['阀件或部件加工图核对', '部件材料复验', '部件制作和组装', '成品尺寸和动作灵活性检查', '编号入库']
    if (itemName === '风管系统安装') return ['支吊架制作安装和防腐', '风管分段吊装就位', '法兰连接和密封垫安装', '风阀部件安装', '风口末端安装', '漏风量或漏光测试', '保温施工和验收']
    if (itemName.includes('风机') || itemName.includes('空气处理')) return ['设备基础复核和减振安装', '风机或空气处理设备进场验收', '设备就位固定', '进出风管接口连接', '电源接线和接地', '单机试运转和振动噪声检测', '运行参数复核和验收']
    if (itemName.includes('旋流风口') || itemName.includes('岗位送风口') || itemName.includes('织物风管')) return ['风口材料和性能参数复验', '安装位置和接口尺寸复核', '送风口或织物风管安装', '风量调节和射流方向调试', '效果检查和验收']
    if (itemName.includes('吸风罩') || itemName.includes('吸尘罩')) return ['罩口形式和捕集边界复核', '罩口支架定位和防振连接安装', '吸尘罩本体安装和高度校正', '耐磨软连接和风管接口密封', '罩口控制风速测试', '粉尘捕集效果复测', '防静电接地跨接检查', '除尘联动验收移交']
    if (itemName.includes('厨房') || itemName.includes('卫生间排风')) return ['厨房排油烟支管坡向和洞口复核', '排风支吊架和防火阀检修口安装', '厨房排油烟管道安装和清扫口设置', '卫生间竖井接口和止回阀防串味安装', '屋面排风帽和防雨附件安装', '风机控制开关和接口接线', '支路风量和串味复测', '排风系统清洁验收移交']
  }
  if (code.startsWith('06-05') || code.startsWith('06-06') || code.startsWith('06-07')) {
    if (code === '06-05-06') return ['舒适空调机组基础和减振复核', '舒适空调组合段开箱验收', '功能段拼装密封和盘管冷凝水坡度复核', '供回水风管电源和自控接线', '过滤器表冷器和盘管冷凝水节点检查', '风量水量平衡和漏风复测', '舒适空调运行参数和能效验收']
    if (code === '06-06-06') return ['恒温恒湿空调机组基础和减振复核', '恒温恒湿功能段和密闭件开箱验收', '功能段拼装气密和防冷桥检查', '冷热水加湿除湿管路及自控接线', '过滤器表冷器加湿除湿段安装检查', '气密性温湿度传感器和断面风速复测', '恒温恒湿运行精度和报警验收']
    if (code === '06-06-08') return ['精密空调N+1容量复核和机房热负荷确认', '精密空调机组开箱验收和搬运路线确认', '精密空调减振基础安装和水平度复核', '冷媒管气密试验真空干燥和保压记录', '冷凝水排水坡度存水弯和排放路径复核', '电源自控漏水检测和报警联动接入', '动环告警点表核对和BMS接口联调', '送回风气流组织短路回流检查和风量复测', '温湿度精度连续运行记录和超差点整改', '主备机备用切换演练和运行参数移交']
    if (itemName.includes('组合式空调机组') || itemName.includes('精密空调机组') || itemName.includes('净化空调机组')) return ['机组基础校核和减振复核', '各功能段开箱验收', '功能段顺序拼装和密封', '接管接电和自控接线', '过滤器表冷器安装检查', '漏风量和断面风速测试', '运行参数和能效验收']
    if (code === '06-05-07') return ['舒适空调附属设备接口清单和检修空间复核', '消声器阻力和消声量参数复核及安装方向确认', '静电除尘集尘板高压电源接地和检修门安装', '换热器水侧风侧接口阀组冷凝排水和旁通连接', '紫外线灭菌器灯管照度防护联锁和检修开关测试', '风管接口法兰密封检修门和压降测点闭合', '功能联测风量压降除尘灭菌和换热效果复测', '舒适空调附属设备验收移交和维护参数签认']
    if (code === '06-07-07') return ['净化空调附属设备洁净包装拆封和安装界面复核', '消声器洁净密封件检修空间和阻力参数复核', '静电除尘接地集尘板高压电源和洁净保护安装', '换热器冷凝水洁净排放水侧风侧接口和高效前后压差保护复核', '紫外灭菌照度复测防护联锁和灯管寿命记录', '风管接口密封泄漏复查和洁净区穿越封堵', '功能联测压差报警除尘灭菌和洁净度复测', '净化空调附属设备洁净保护移交和验收签认']
    if (itemName.includes('消声器') || itemName.includes('静电除尘') || itemName.includes('换热器') || itemName.includes('紫外线灭菌')) return ['空气处理设备进场验收', '安装位置和气流方向复核', '设备就位固定', '风管接口法兰连接', '电源或介质管路连接', '功能测试和验收']
    if (itemName.includes('风机盘管') || itemName.includes('变风量') || itemName.includes('定风量') || itemName.includes('射流喷口')) return ['末端设备进场验收', '安装位置和吊装条件复核', '设备吊装就位', '进出风管连接', '供回水或电源接线', '风量水量参数调试', '温控和运行验收']
  }
  if (code.startsWith('06-09') && itemName.includes('管道安装')) return ['真空管道路径和坡度复核', '管道材料和阀件进场复验', '管道安装和连接密封', '真空泵和滤尘设备接口对接', '系统压力试验', '漏气量测试', '标识和验收']
  if (code.startsWith('06-09') && itemName === '快速接口安装') return ['快速接口点位编号和服务区域复核', '接口底盒预埋和接管条件检查', '密封圈和插拔件安装', '快速接口面板固定和堵盖防护', '软管插拔负压测试', '末端漏气量复测', '分区标识和运维编号粘贴', '快速接口验收移交']
  if (code.startsWith('06-09') && itemName.includes('风机与滤尘设备')) return ['设备基础和减振复核', '真空泵和滤尘设备进场验收', '设备就位固定', '管道接口连接', '电气和自控接线', '单机试运转', '系统联调和验收']
  if (code === '06-10-04' || code === '06-11-05' || code === '06-12-05' || code === '06-13-06' || code === '06-14-07' || code === '06-15-06') return ['冷却塔基础和水池容积复核', '冷却塔开箱验收', '设备就位和减振安装', '进出水管电动阀安装接线', '补水溢流排污管路连接', '风机和布水器检查', '调试和散热效果验收']
  if ((code.startsWith('06-10') || code.startsWith('06-11')) && itemName.includes('板式热交换器')) return ['换热器基础和接管条件复核', '板式换热器开箱验收', '设备就位和固定', '一二次侧管路连接', '仪表安全阀安装', '试压和冲洗', '传热效率和验收']
  if ((code.startsWith('06-10') || code.startsWith('06-11')) && itemName.includes('辐射板') || itemName.includes('辐射供热') || itemName.includes('辐射供冷')) return ['辐射末端布置和管路路径复核', '辐射板或埋地管进场复验', '支吊架或基层铺设', '辐射板或埋地管安装固定', '管路连接和试压', '保温层和保护层施工', '辐射供冷供热调试验收']

  const emergencyResponseProcessesByCode: Record<string, string[]> = {
    '08-17-01': ['应急响应设备点表和安装界面复核', '应急主机呼叫终端和通讯网关进场验收', '应急主机机柜上架接地和电源接入', '呼叫终端安装和声光接口接线', '通讯网关与广播消防和短信平台接口接入', '备用电源电池容量复核', '备用电源切换功能测试', '应急响应设备安装验收移交'],
    '08-17-02': ['应急响应软件版本授权和部署方案复核', '应急预案库和事件分级规则配置', '通知策略短信电话广播和APP通道配置', '值班表班组角色和升级路径导入', '权限账号和操作审计策略配置', '预案模板备份恢复测试', '软件版本冻结和配置备份', '应急响应软件安装验收移交'],
    '08-17-03': ['应急响应系统调试方案和演练场景确认', '一键报警触发和事件生成测试', '多渠道通知到达率和确认回执测试', '消防联动广播门禁和视频弹窗测试', '响应时效统计和升级规则验证', '演练记录问题销项', '复测签认和调试报告整理', '应急响应系统调试验收移交'],
    '08-17-04': ['应急响应试运行值班巡检安排确认', '值班巡检事件受理和处置记录抽查', '应急演练复盘和响应统计分析', '故障记录误报漏报和通知失败闭环', '预案更新和值班表变更验证', '试运行问题销项和培训确认', '试运行报告和响应数据归档', '应急响应运维资料移交'],
  }
  if (emergencyResponseProcessesByCode[code]) return emergencyResponseProcessesByCode[code]
  // 08-17 应急响应系统
  if (code.startsWith('08-17')) return ['应急响应范围和联动需求确认', '应急系统和设备进场验收', '应急系统安装部署', '应急软件和通讯配置', '应急触发场景覆盖测试', '应急响应时效和联动功能验证', '应急预案和操作培训', '试运行和移交']

  // 01-02-03 筏型与箱型基础(含大体积混凝土测温)
  if (code === '01-02-03') return ['基底验槽和承载力复核', '垫层施工', '防水层施工(如有)', '钢筋加工安装', '模板安装加固', '混凝土浇筑', '大体积混凝土测温和温差控制', '养护与试块留置', '拆模和实体质量验收']
  // 01-02-14 岩石锚杆基础
  if (code === '01-02-14') return ['岩石面清理和基础定位放线', '锚孔钻进和孔深孔径检测', '洗孔和锚孔清理', '锚杆杆体制作和安放', '注浆材料和配合比确认', '注浆施工和注浆量记录', '锚杆抗拔试验和张拉锁定', '基础承台施工', '岩石锚杆基础验收']
  // 01-02-15 沉井与沉箱基础
  if (code === '01-02-15') return ['沉井沉箱施工方案和降水措施复核', '刃脚基础和垫层施工', '井筒或箱体制作(分节)', '沉井下沉或沉箱压入施工', '下沉偏位和标高监测纠偏', '封底或底板施工', '井壁防渗和接缝处理', '沉井沉箱验收']

  // 01-06 边坡
  if (code === '01-06-01') return ['边坡开挖方案和支护设计复核', '分级开挖和坡率控制', '锚杆或锚索钻孔安装', '格构梁或框架施工', '喷射混凝土面层或挂网', '截水沟和排水孔设置', '边坡监测点布设和初始值采集', '边坡验收和监测移交']
  if (code === '01-06-02') return ['挡土墙基础验槽和承载力复核', '挡土墙材料进场复验', '挡土墙砌筑或混凝土浇筑', '泄水孔和反滤层设置', '沉降缝和伸缩缝施工', '墙背回填和压实', '墙身变形监测', '挡土墙验收']
  if (code === '01-06-03') return ['边坡开挖方案和放坡参数复核', '分级开挖和坡面修整', '坡顶截水沟施工', '坡面防护(植草或砌石或框架)', '坡脚排水沟和监测点布设', '边坡稳定性和变形验收']

  // 01-07 地下防水 specific codes
  if (code === '01-07-01') return ['防水混凝土配合比和抗渗等级复核', '施工缝止水钢板或止水带安装', '穿墙管和预埋件止水环安装', '防水混凝土浇筑和振捣密实', '养护和抗渗试块留置', '外观缺陷和渗漏检查', '主体结构防水验收']
  if (code === '01-07-02') return ['施工缝界面清理和凿毛', '止水钢板或膨胀止水条安装', '后浇带清理和界面处理', '穿墙管止水环和密封施工', '变形缝止水带和填缝材料安装', '细部节点闭水或淋水检查', '细部构造防水验收']
  if (code === '01-07-03') return ['特殊施工法方案和防水措施复核', '地下连续墙接缝止水和沉井施工缝防水处理', '盾构或顶管洞口止水装置安装', '冻结法测温防渗和冻结帷幕检查', '注浆压力流量记录和防水效果复核', '特殊施工法防水接口密封验收']
  if (code === '01-07-04') return ['排水方案和盲沟或排水板布置复核', '排水管或盲沟铺设', '集水坑或排水泵安装', '排水系统通畅性和功能测试', '排水系统验收']

  // 05-05 供暖系统 remaining sub-types (散热器/地暖/电热/燃气已覆盖)
  if (code === '05-05-05' || code === '05-05-06') return ['电热或燃气系统安全条件复核', '供电容量或气源接口确认', '发热元件或辐射器安装', '温控传感器和控制系统安装接线', '绝缘电阻和接地测试或气密试验', '通电试运行或联机调试', '安全检测和验收']
  if (code.startsWith('05-05') && itemName.includes('热计量')) return ['热计量装置和系统设计复核', '热量表或热分配表进场检定', '计量装置安装(供回水配对)', '积算仪和数据采集器接线', '通讯和远程抄表调试', '热计量数据复核和验收']
  if (code.startsWith('05-05') && (itemName.includes('热风供暖') || itemName.includes('暖风机'))) return ['热风设备和风管接口复核', '暖风机或热风幕进场验收', '设备支架安装固定', '供回水和风管接口连接', '电气接线和温控安装', '风量热量调试', '运行验收']

  // 10-01-04~12 曳引式电梯 remaining sub-codes
  if (code === '10-01-04') return ['样板架安装和基准线放设', '导轨支架安装(预埋或膨胀螺栓)', '导轨吊装就位和初校', '导轨精校(垂直度和间距)', '导轨接头修光和润滑', '导轨验收记录签认']
  if (code === '10-01-05') return ['层门地坎安装和标高复核', '门立柱和门头安装', '门套安装', '层门门扇安装和强迫关门装置调试', '层门锁紧元件啮合检查(≥7mm)', '层门与轿门联动测试']
  if (code === '10-01-06') return ['轿厢底梁安装', '轿厢立柱和上梁组装', '轿底和围壁安装', '轿顶和导靴安装', '轿门和门机安装调试', '轿厢装修和称重装置安装']
  if (code === '10-01-07') return ['对重框架组装', '对重块装入和固定', '对重导靴安装', '对重在井道中的运行间隙检查']
  if (code === '10-01-08') return ['限速器安装和张紧装置设置', '安全钳安装和楔块间隙调整', '缓冲器安装和水平度复核', '极限开关和限位开关安装', '安全部件联动功能检验']
  if (code === '10-01-09') return ['曳引钢丝绳规格和数量复核', '绳头组合制作(巴氏合金或楔形自锁)', '钢丝绳张力均匀调整', '随行电缆悬挂和弯曲半径检查', '补偿链或补偿绳安装', '防晃和防碰装置检查']
  if (code === '10-01-10') return ['随行电缆规格长度和轿底悬挂端复核', '井道固定点支架间距和保护套安装', '随行电缆弯曲半径下垂量和运行余量调整', '防扭防摆装置安装和轿厢运行间隙复核', '动力控制通信回路端接和编号标识', '全行程磨碰测试和随行电缆摆幅复测', '绝缘接地测试和屏蔽连续性复核', '监督检验资料和随行电缆验收签认']
  if (code === '10-01-11') return ['补偿链规格重量和轿厢对重匹配复核', '补偿链固定端连接和防松脱处理', '张紧轮安装垂直度和轴承转动检查', '导向装置限位间隙和防偏磨调整', '补偿装置防跳防脱和护罩安装', '底坑间距缓冲器安全距离和运行净空复核', '全行程运行防晃测试和补偿链导向复测', '噪声振动整改和补偿装置验收签认']
  if (code === '10-01-12') return ['控制柜变频器和制动电阻安装接线复核', '抱闸编码器和门机接口接线复核', '安全回路门锁回路限速器和极限开关接线测试', '机房井道线槽线管和井道照明安装', '机房井道PE接地连续性和屏蔽接地复核', '绝缘电阻测试和慢车电气联锁试验', '监督检验资料和电气系统签认']

  // 10-02-04~11 液压电梯 remaining sub-codes
  if (code === '10-02-03') return ['液压油缸垂直度和柱塞行程复核', '液压泵站减振基础和油箱固定复核', '液压硬管软管路由安装和支架固定', '管路耐压泄漏试验和接口整改', '液压油过滤加注和清洁度记录', '溢流阀限速切断阀和手动下降装置调试', '防沉降再平层功能和油温油位报警测试', '满载压力试验和液压系统签认']
  if (code === '10-02-04') return ['样板架安装和基准线放设', '液压缸导轨支架安装', '导轨吊装就位和精校', '导轨接头修光和验收']
  if (code === '10-02-05') return ['层门地坎安装和标高复核', '门立柱和门头安装', '门套安装', '层门门扇安装和强迫关门装置调试', '层门锁紧元件啮合检查']
  if (code === '10-02-06') return ['轿厢底梁和柱塞连接', '轿厢立柱和上梁组装', '轿底和围壁安装', '轿顶和导靴安装', '轿门和门机安装调试']
  if (code === '10-02-07') return ['平衡重框架组装', '平衡重块装入和固定', '平衡重导靴安装']
  if (code === '10-02-08') return ['限速器安装和张紧装置设置', '安全钳安装和楔块间隙调整', '限速切断阀安装', '缓冲器安装', '安全部件联动功能检验']
  if (code === '10-02-09') return ['悬挂钢丝绳或链条规格复核', '绳头组合或链节连接', '张力均衡调整', '防松脱和防晃导向装置检查', '限位与安全钳关联检查', '监督检验资料和悬挂装置验收签认']
  if (code === '10-02-10') return ['液压电梯随行电缆规格长度和泵站控制柜接口复核', '井道固定点支架和油管和导轨避让复核', '随行电缆弯曲半径下垂余量和保护套安装', '平层再平层信号和动力控制回路端接标识', '全行程磨碰测试和随行电缆摆幅复测', '绝缘接地测试和监督检验资料签认']
  if (code === '10-02-11') return ['控制柜安装', '井道线槽线管敷设', '安全回路和门锁回路接线', '接地保护(PE)', '绝缘电阻测试', '电气验收']

  return null
}

function coreQualityReplacementProcesses(code: string, itemName: string): ProcessTemplate[] | null {
  const replacements: Record<string, ProcessTemplate[]> = {
    '05-02-01': ['室内排水管线路由和预留洞口复核', '排水立管支吊架和套管安装', '排水立管安装和垂直度复核', '排水支管坡度和甩口标高复核', '检查口清扫口和通气管安装', '排水接口胶圈或粘接质量检查', '灌水试验和接口渗漏检查', '通球试验和排水通畅性复核', '排水管道标识和成品保护'],
    '05-02-02': ['雨水斗位置屋面接口和溢流口复核', '雨水悬吊管支吊架和坡度控制', '雨水斗和天沟接口安装密封', '雨水悬吊管安装和伸缩节设置', '雨水立管安装和固定卡复核', '溢流管和排放口安装', '雨水管道灌水试验和渗漏检查', '通水排放试验和流向复核', '雨水管道标识和成品保护'],
    '05-02-03': ['排水管道防腐范围和基层状态复核', '基层除锈清理和焊口打磨', '防腐材料批次和配套性复验', '底漆涂刷和边角补强', '面漆分遍施工和遍间检查', '干膜厚度和附着力抽测', '支吊架焊口和接口补口处理', '漏涂流挂缺陷整改', '排水防腐质量验收记录签认'],
    '05-02-04': ['排水试验调试方案和试验分区确认', '灌水试验封堵和水位观察', '通球试验和球径记录复核', '通水排放试验和流向观察', '排水支管坡度复核和倒坡排查', '接口渗漏整改和复验闭合', '排水通畅性和检查口功能复测', '试验调试记录签认', '排水试验调试资料移交'],
    '05-04-01': ['卫生器具安装基准线和接口尺寸复核', '卫生器具固定件和支架进场复验', '器具就位找平和固定件紧固', '存水弯和排水接口预装复核', '给水接口临时封堵和成品面保护', '卫生器具盛水试验和外观检查', '器具启闭和排水通畅复核', '卫生器具成品保护和交接验收'],
    '05-04-02': ['卫生器具给水配件型号和接口复核', '角阀水嘴冲洗阀和软管进场验收', '角阀和水嘴安装固定', '冲洗阀和感应器配件安装接线', '软管连接和防扭曲检查', '启闭功能和流量压力复测', '接口渗漏检查和问题整改', '给水配件验收和成品保护'],
    '05-04-03': ['卫生器具排水短管接口和标高复核', '排水短管存水弯和密封件进场验收', '排水短管安装和接口坡度控制', '存水弯安装和水封高度复核', '器具排水接口密封连接', '通水试验和排水通畅检查', '接口渗漏检查和返修复验', '卫生器具排水管道验收移交'],
    '05-04-04': ['卫生器具试验调试方案和房间清单确认', '通水试验和排水通畅复核', '洗面盆浴缸等器具盛水试验', '坐便器水箱满水试验和冲洗功能复核', '存水弯水封复核和返臭风险检查', '接口渗漏和排水噪声问题整改', '器具成品保护复查', '卫生器具试验调试记录签认'],
    '05-09-02': ['饮用水水处理机房条件和卫生边界复核', '过滤器消毒投加装置和在线仪表进场验收', '过滤器罐体滤芯旁通阀组和消毒投加管路安装', '余氯浊度pH在线监测点和控制柜接线', '水质取样点布置和消毒冲洗联动测试', '水质检测报告复核和卫生验收资料移交'],
    '05-10-01': ['建筑中水系统中水箱和回用边界复核', '中水箱回用水泵和阀组进场验收', '中水箱管口液位控制和回用水泵管路连接安装', '中水管网冲洗和防误接检查', '非饮用标识和管道颜色标识安装复核', '回用水水质检测复核', '建筑中水系统验收移交'],
    '05-10-02': ['雨水弃流调蓄池和溢流排放界面复核', '雨水管材过滤设施和回用泵进场验收', '雨水弃流装置和调蓄池进出水管安装', '溢流排放管和过滤设施连接', '回用泵管路连接和试运转检查', '雨水利用管道标识和非饮用提示复核', '雨水利用系统通水排放验收'],
    '05-10-03': ['回用水处理工艺清单和设计参数复核', '砂滤精滤过滤设备和过滤器就位复核', '加药装置加药桶计量泵和投加管路安装', '消毒装置安装和接触时间复核', '在线监测和在线浊度余氯色度仪表安装', '液位联动补水排水和溢流控制接线', '控制柜联调报警阈值配置和联锁点表复核', '旁通和反冲洗流程测试', '回用水质检测复核和验收资料移交'],
    '05-11-01': ['池体套管和预埋件复核', '循环给回水管路放线', '补水排空溢流管安装', '吸污口和回水口接口安装', '喷嘴和布水器定位连接', '机房至池体管路分区试压', '管路冲洗和防误接检查', '池壁穿管防水封堵', '管道标识和隐蔽验收'],
    '05-13-06': ['绝热范围和保温边界复核', '保温材料燃烧性能和厚度复验', '热源管道表面干燥处理', '管道保温层分段包覆', '阀门法兰可拆卸保温盒安装', '换热器水箱设备保温收口', '防潮层搭接密封', '金属保护壳和标识恢复', '冷桥和破损点复查', '绝热节能验收'],
    '01-02-01': ['无筋扩展基础基底验槽和承载力复核', '基础轴线台阶尺寸和顶面标高放样', '毛石或素混凝土材料强度资料复核', '垫层清理润湿和基础砌筑浇筑条件复核', '无筋扩展基础分台阶砌筑或素混凝土浇筑', '基础顶面标高轴线偏位和外观尺寸复测', '无筋扩展基础养护实体质量验收'],
    '01-02-04': ['钢结构基础基底验槽承载力和垫层交接复核', '基础轴线标高地脚螺栓定位模板复核', '预埋锚板锚栓套管和抗剪键安装固定', '杯口或柱脚基础混凝土浇筑和振捣养护', '地脚螺栓外露长度轴线标高和保护措施复测', '柱脚安装界面凿毛清理和二次灌浆条件确认', '钢结构基础柱脚交接验收和资料移交'],
    '01-02-05': ['钢管混凝土结构基础基底验槽和垫层交接复核', '钢管柱脚锚栓定位抗剪键和环板深化复核', '基础钢筋与预埋锚栓套管定位固定', '柱脚基础模板混凝土浇筑振捣和养护', '锚栓外露长度钢管柱脚轴线标高复测', '钢管柱脚二次灌浆界面凿毛和灌浆料试配', '钢管混凝土结构基础柱脚交接验收'],
    '01-02-06': ['型钢混凝土结构基础基底验槽和垫层交接复核', '型钢柱脚锚栓定位劲性骨架深化复核', '型钢预埋件栓钉或加劲肋安装固定', '基础钢筋模板与型钢骨架交叉节点复核', '混凝土浇筑振捣型钢周边密实度控制', '型钢柱脚轴线标高锚栓外露和二次灌浆复测', '型钢混凝土结构基础柱脚交接验收'],
    '02-01-04': ['孔道和锚具准备', '预应力筋安装', '张拉设备标定', '张拉施工', '孔道压浆', '封锚施工', '张拉压浆记录复核', '预应力节点验收'],
    '02-01-06': standardPrefabStructureProcesses(),
    '02-02-02': ['材料复验与砂浆试配', '排砖放线', '皮数杆设置', '拉结筋植筋与验收', '构造柱圈梁钢筋模板', '砌块砌筑施工', '门窗洞口过梁压顶施工', '顶砌斜砌或塞缝', '勾缝清理', '实测实量与质量验收'],
    '02-02-05': ['填充墙皮数杆和排砖放线', '拉结筋植筋和构造柱钢筋验收', '砌块湿润砂浆试配和材料复验', '门窗洞口过梁压顶和圈梁施工', '顶砌斜砌或塞缝收口', '实测实量和裂缝空鼓验收'],
    '02-03-02': ['连接副批次复验和高强螺栓规格核对', '摩擦面抗滑移系数复验和孔位复核', '高强螺栓穿装和初拧控制', '复拧终拧顺序和终拧标记施工', '扭矩或轴力抽检和不合格复拧', '紧固件连接质量验收签认'],
    '02-03-03': ['钢构件进场验收和编号复核', '组装胎架和测量基准复核', '零部件矫正和组对定位', '钢构件组装焊接或螺栓连接', '预拼装分段就位', '接口间隙错边和整体尺寸实测', '组装预拼装验收和拆解保护'],
    '02-03-04': ['单层钢结构安装方案交底和吊装作业面复核', '柱脚基础地脚螺栓轴线标高复测和基础交接验收', '钢柱吊装就位临时固定和垂直度初校', '吊车梁屋面梁吊装就位和节点轴线标高复核', '柱间支撑檩条系杆安装和整体稳定校正', '高强螺栓终拧复检及节点焊接外观探伤委托', '单层钢结构安装偏差复测和验收移交'],
    '02-03-05': ['分节分层吊装方案和楼层轴线标高复核', '钢柱分节吊装就位和临时固定复核', '钢梁楼层框架吊装就位和节点定位', '钢柱垂直度和楼层框架整体校正', '高强螺栓初拧终拧和摩擦面复核', '现场焊缝焊接外观检查和探伤委托', '多层钢结构安装偏差复测和验收移交'],
    '02-03-06': ['钢管构件进场验收和圆度椭圆度复核', '管口坡口和相贯线加工质量复核', '钢管柱管桁架空间定位和吊装就位', '管节点组对定位和临时支撑复核', '管节点焊接和焊接参数记录', '相贯焊缝探伤委托和缺陷返修复测', '钢管结构安装偏差复测和节点验收'],
    '02-03-08': ['压型金属板排板深化和控制线复核', '檩条支承面和连接条件检查', '压型金属板进场验收和编号堆放', '压型金属板铺设就位', '搭接咬边和紧固件固定', '屋脊檐口收边泛水和密封防水施工', '外观渗漏检查和压型金属板验收'],
    '02-03-09': ['防腐涂料涂装环境和基材交接复核', '钢构件除锈等级检查和焊缝边角预处理', '防腐材料配套性复验和底漆施工', '层间干燥复涂间隔控制和中间漆面漆施工', '干膜厚度抽测和涂层外观复核', '针孔漏涂和附着力检查', '破损补涂与防腐涂装验收签认'],
    '02-03-10': ['基层除锈清理和表面粗糙度复核', '防火涂料材料批次复验和配套资料核验', '样板段施工和设计厚度确认', '节点遮蔽保护和施工环境复核', '底涂或界面层施工', '防火涂料分遍喷涂施工', '湿膜厚度抽测和遍间养护', '干膜厚度粘结强度和空鼓检测', '裂纹空鼓流坠缺陷修补和复测', '耐火极限资料组卷和防火涂料验收'],
    '02-04-01': ['空间钢结构杆件编号和球节点或管节点进场复核', '拼装胎架坐标复核和支承基准确认', '空间钢管构件分段拼装和预起拱控制', '相贯节点焊接或高强螺栓连接施工', '分段合拢尺寸三维测量和临时固定校正', '空间节点隐蔽验收和拼装质量检测', '空间钢结构拼装验收和吊装移交'],
    '02-04-02': ['空间钢结构安装方案支座和吊装条件复核', '支座轴线标高和安装基准复测', '球节点或管桁架分区吊装就位', '合拢段临时支撑和整体稳定复核', '空间节点焊接或螺栓连接施工', '临时支撑卸载和三维测量安装偏差复测', '空间钢结构安装验收和后续工序移交'],
    '02-04-03': ['焊接工艺评定', '坡口加工和组对复核', '焊材烘干和参数记录', '定位焊和正式焊接', '焊缝外观检查', '无损检测委托', '返修闭合和报告复核'],
    '02-04-04': ['空间连接节点深化和孔位复核', '球节点管节点连接件批次复验', '节点定位临时固定和错边复测', '高强螺栓终拧或焊缝外观探伤', '连接质量检测和节点几何复测', '节点防腐补刷和隐蔽资料签认', '空间连接节点验收和卸载条件移交'],
    '02-04-06': ['钢管内清理和浇筑口复核', '混凝土配合比和坍落度确认', '顶升或灌注设备检查', '钢管内混凝土浇筑', '排气溢浆和密实度检查', '试块留置和养护', '节点外观和密实度检测', '混凝土质量验收'],
    '02-05-01': ['焊接工艺评定', '型钢坡口处理施工和组对复核', '焊材烘干施工和焊接参数记录', '定位焊和正式焊接', '焊缝外观检查', '无损检测委托', '返修焊接施工和复探确认'],
    '02-05-02': ['连接副进场复验', '孔位和摩擦面复核', '高强螺栓安装', '初拧与终拧', '扭矩或轴力抽检', '终拧标记和记录复核', '紧固件连接验收'],
    '02-05-03': ['型钢孔位栓钉和穿筋节点深化复核', '钢筋穿孔套筒或连接器规格批次复验', '型钢翼缘腹板开孔边缘和防腐补强检查', '主筋穿型钢定位和连接器安装', '钢筋与型钢焊接或机械连接施工', '箍筋加密区和保护层垫块复核', '节点隐蔽验收和混凝土浇筑条件确认', '连接质量实测复核和问题销项'],
    '02-05-04': ['型钢构件进场验收', '拼装胎架和轴线复核', '构件组装与预拼装', '节点连接和临时固定', '预拼装尺寸实测', '构件编号和堆放交接', '预拼装验收'],
    '02-05-05': ['型钢柱柱脚锚栓和吊装作业面复核', '型钢梁构件编号和连接板栓钉复核', '型钢柱型钢梁吊装就位', '临时固定垂直度校正和轴线标高复测', '钢筋穿插模板接口和栓钉或连接板施工', '型钢安装偏差实测和节点连接复核', '混凝土浇筑前交接和隐蔽签认'],
    '02-05-07': ['型钢节点和钢筋模板复核', '混凝土配合比和坍落度确认', '浇筑顺序和振捣措施交底', '混凝土浇筑', '节点密实度和外观检查', '试块留置和养护', '拆模强度报告复核', '混凝土质量验收'],
    '03-02-02': ['基层强度含水率复核和界面处理', '保温板排版放线粘贴和板缝打磨', '锚栓数量拉拔复核和洞口翻包网处理', '保温层薄抹灰施工抗裂砂浆和耐碱网格布施工', '节点收口处理阴阳角护角和滴水线施工', '抗裂层厚度平整度复核和节能隐蔽验收'],
    '04-02-04': ['基层检查和标高复核', '发泡混凝土配合比确认', '材料设备进场复验', '分区浇筑和厚度控制', '排气道和分格缝处理', '养护和干密度检测', '保温层质量验收'],
    '04-04-01': ['基层移交和排版放线', '瓦材进场复验', '挂瓦条或卧瓦层施工', '烧结瓦或混凝土瓦铺装', '脊瓦檐口和泛水收口', '固定件和抗风措施复核', '淋水检查和观感销项', '瓦面质量验收'],
    '05-11-02': ['水处理机房条件循环水量和水质目标复核', '循环泵过滤器加药装置和消毒设备进场验收', '循环泵基础减振和进出水管路安装', '砂缸或精密过滤器滤料装填和旁通阀组安装', '加药装置药桶计量泵和投加管路安装', '消毒设备紫外或臭氧或次氯酸钠系统安装', '余氯pH浊度在线仪表和取样点安装', '控制柜水质检测联锁和报警参数配置', '过滤循环反冲洗流程调试和排水复核', '余氯pH浊度水质检测比对和校准复测', '循环过滤加药消毒联动试运行和缺陷销项', '水处理系统验收交接签认和运维资料移交'],
    '05-13-01': ['锅炉房条件和基础轴线标高复核', '锅炉本体设备资料和特种设备告知文件核验', '锅炉本体吊装就位找平找正和固定', '燃烧器安装燃气燃油接口和联锁接线', '烟风道风机和烟囱接口安装', '给水排污管路仪表和安全阀安装', '锅炉本体水压试验和严密性检查', '烘炉煮炉方案执行和水质药剂记录', '点火试运行燃烧工况和热态调整', '安全阀整定报警联锁和保护功能测试', '特种设备监督检验资料组卷和问题整改', '锅炉系统验收交接签认和运行移交'],
    '05-13-02': ['热源机房辅助设备管道接口和补水定压边界复核', '补水定压装置膨胀罐和软化水补水接口安装', '除污器阀组过滤器排污旁通和方向标识安装', '循环泵减振基础联轴器找正和进出水阀组连接', '安全阀压力表校验温度压力仪表和取压点安装', '辅助管道焊接法兰阀门和支吊架安装', '管道冲洗试压排气排污和水质保护处理', '热源联锁调试补水循环保护和报警测试', '热源辅助设备运行参数移交和验收签认'],
    '05-13-04': ['换热站机房条件一次侧二次侧接口和基础复核', '板式换热器循环泵除污器和阀组进场验收', '板式换热器吊装就位垫铁找平和固定', '一次侧供回水管路阀门和过滤除污器安装', '二次侧循环泵补水定压和旁通管路安装', '温控阀电动调节阀和执行器安装接线', '压力温度仪表热量表和取压测温点安装', '系统冲洗试压排气和水质保护处理', '一次侧二次侧联动控制和水力平衡调试', '换热量调试供回水温差和流量工况复核', '自控报警能耗计量和远传数据测试', '换热站验收交接签认和运行资料移交'],
    '06-04-06': ['除尘器基础支架和排污接口复核', '除尘器灰斗壳体分段进场验收', '灰斗壳体拼装密封和支腿固定', '滤袋滤筒笼骨安装和压紧密封', '脉冲清灰喷吹管电磁阀和气包安装', '卸灰阀螺旋输送和排污设备安装', '压差计料位计和温度监测装置安装', '防爆泄压片隔爆阀和防静电接地复核', '风管进口出口和旁通阀接口连接', '漏风粉尘泄漏和捕集效率测试', '脉冲清灰卸灰联动试运行和缺陷整改', '除尘排污系统验收交接签认和运维资料移交'],
    '06-05-09': ['舒适性空调绝热范围和防结露边界复核', '风管设备绝热材料燃烧性能导热系数和厚度复验', '风管表面清洁干燥和漏风测试交接确认', '风管绝热层裁切包覆和接缝错缝施工', '空调箱风机盘管阀组法兰异形绝热处理', '支吊架冷桥垫块和穿墙套管保温补强', '防潮层搭接密封和保护层安装', '冷凝水滴水风险和破损点复查修补', '舒适性空调绝热节能验收和资料归档'],
    '06-06-07': ['电加热器加湿器安装位置容量和控制接口复核', '电加热器加湿器设备进场验收和绝缘检查', '电加热器联锁接线风量保护和高温保护安装', '加湿器水质处理给水过滤和排污管路安装', '湿度传感器安装校准和控制点位复核', '冷凝排水溢流排水和防渗漏接口安装', '控制回路电源执行器和自控通讯接线', '高温保护缺水保护和风机联锁功能测试', '温湿度精度分区调试和稳定性运行记录', '报警联动远程监控和故障复位测试', '电加热加湿系统验收交接签认和运维资料移交'],
    '06-08-06': ['人防通风密闭穿墙短管和预埋套管界面复核', '过滤吸收器型号批次和安装方向核验', '过滤吸收器支架就位密封垫压紧安装', '防爆波活门门框座板预埋和气流方向复核', '防爆波活门启闭间隙限位和密封面调整', '防爆超压排气活门安装高度和超压排气方向复核', '超压排气管路法兰垫片和密闭封堵施工', '手动启闭机构传动和转换标识调试', '压差测点取样管和测压装置安装', '气密性压差和通风量测试', '滤毒通风清洁通风隔绝通风联动切换试验', '人防专项验收资料组卷和质量移交'],
    '06-20-01': ['点表冻结和I/O地址映射复核', '传感器量程、安装位置和测点编号复核', '取压测温接口和线缆路由确认', '温度压力流量传感器安装接线', '单点采集信号和现场校准', '趋势采样记录和传感器移交'],
    '06-20-02': ['阀门风阀执行器选型和DDC回路复核', '执行器支架轴套安装和阀门风阀连接', '执行器行程、开闭方向和限位调试复测', '反馈信号接线和DDC点对点调试', '手自动切换和失电保护联动调试', '执行机构调试记录和验收移交'],
    '06-20-03': ['防排烟测试方案和消防联动点表复核', '风机风阀和防火阀反馈信号接线调试', '消防强切和手自动切换联动调试', '紧急模式启动复位调试和反馈闭环测试', '排烟送风联动场景调试和风量压差复核', '防排烟功能缺陷修补调试和复测放行'],
    '06-20-04': ['点表冻结和DDC网关通讯地址复核', 'BACnet/Modbus协议映射和离线恢复测试', 'AHU冷热源水泵风机阀门顺控逻辑配置', '报警阈值、趋势曲线和图形界面采集调试', '参数备份恢复演练和权限账号交接', '连续试运行趋势数据复核和运维移交'],
    '07-03-02': ['供电干线母线槽支架路径净距和吊装条件复核', '母线槽分段吊装和直线段安装', '弯头三通连接器和螺栓扭矩复核', '插接箱安装固定和回路标识', '伸缩节和穿越部位防火封堵设置', '母线槽外壳接地跨接和接地连续性测试', '母线槽绝缘和相序测试', '通电温升巡检和负载记录', '供电干线母线槽验收移交'],
    '07-01-05': ['室外电缆路径和埋深桥架界面复核', '电缆盘规格长度绝缘资料核验', '管沟桥架清障和牵引条件确认', '室外电缆牵引敷设和牵引力控制', '转弯半径固定间距和防水端部保护', '穿墙入户防火封堵和防水密封', '电缆挂牌相序和绝缘耐压测试', '沟槽回填或桥架盖板恢复及敷设验收'],
    '07-02-05': ['变配电室电缆路径柜列入口和桥架净距复核', '高低压电缆规格长度和耐压资料核验', '电缆沟桥架防火分区和牵引条件确认', '电缆敷设牵引和柜前余量控制', '柜底封板穿越防火封堵和屏蔽接地处理', '转弯半径固定间距和相序标识检查', '绝缘电阻耐压试验和放电记录', '变配电室电缆敷设验收和电缆清册移交'],
    '07-04-02': ['电动机铭牌功率和回路编号复核', '电动机主回路端子压接和PE接地检查', '电动机正反转点动和空载电流记录', '电加热器容量保护和温控回路核对', '电加热器绝缘电阻和超温联锁测试', '电动执行机构限位开关和开闭方向校验', '执行机构手自动切换和反馈信号测试', '检查接线记录汇总和问题闭合'],
    '07-05-01': ['照明配电箱柜基础和箱体定位复核', '照明配电箱柜开箱验收和回路编号核对', '箱体就位找正固定和门锁防护检查', 'N/PE排导线端接和支路压接复核', '断路器漏电保护器型号和整定核对', '照明支路绝缘测试和接地连续性测试', '灯具开关插座回路试亮送电', '回路标签图纸编号和配电箱标识复核', '照明配电箱柜标签移交和验收签认'],
    '07-06-05': ['备用电源回路导管路径复核', '支吊架定位安装和套管预留复核', '金属或刚性导管预制弯管', '导管敷设固定和箱盒连接', '跨接接地连续性检查', '防火封堵管口护口和穿线条件确认', '备用电源导管隐蔽验收记录签认'],
    '07-06-06': ['备用电源电缆盘规格长度和绝缘资料复核', '桥架管沟电缆通道清理和牵引条件确认', '备用电源电缆牵引敷设和牵引力控制', '电缆转弯半径固定间距和防火隔离检查', '电缆挂牌相序标识和端部保护', '备用电源电缆绝缘和耐压测试', '备用电源电缆敷设验收记录签认'],
    '07-06-07': ['备用电源管槽路径和回路编号复核', '管槽清扫试通和穿线前封堵检查', '导线分色穿线和槽盒内敷线整理', '端部余量分支绑扎和线缆固定', '回路编号挂牌和线号套管标识', '导线绝缘测试和接地连续性复测', '管内穿线和槽盒内敷线穿线验收签认'],
    '08-10-03': ['会议室条件和接口清单复核', '音视频机柜设备进场验收和上架接地', 'DSP处理器安装接线和通道参数配置', '音视频矩阵切换设备安装和路由配置', '话筒代表单元和无线接收设备安装', '扩声功放扬声器安装和声场初调', '显示终端投影融合或大屏接口调试', '摄像跟踪云台和录播主机安装', '会议平台服务器客户端部署和账号授权', '场景预设中控面板编程和联动测试', '录播直播存储策略配置和回放验证', '会议系统功能复测和验收移交'],
    '08-11-03': ['显示设备点位和安装界面复核', 'LED屏体或LCD拼接单元进场验收', '支架龙骨承重复核和固定安装', '屏体挂装拼缝平整度校正', '发送卡接收卡安装和链路寻址', '电源信号线缆端接和接地复核', '亮度色彩白平衡校准', '播放控制器和同步控制软件部署', '内容发布模板权限和排期配置', '发布终端联动播放和故障告警测试', '散热通风检修维护通道复核', '信息导引发布显示设备功能复测和验收移交'],
    '08-11-04': ['机房设备供电网络和散热条件复核', '发布服务器机柜上架接地和冗余电源接入', '播放控制器安装接线和输出通道映射', '内容管理平台部署和用户权限配置', '媒体编码转码参数和分辨率模板配置', '同步控制时钟源链路和多屏同步参数配置', '节目素材存储策略备份策略和容量告警配置', '终端分组区域策略和发布排期配置', '屏端播放控制链路和回执状态核验', '设备日志故障告警和远程维护策略配置', '全链路发布回放和异常切换测试', '信息导引机房设备交接签认和运维资料移交'],
    '08-12-03': ['时钟系统机房条件接口清单和授时方案复核', '母钟机柜设备进场验收上架接地和电源接入', 'GPS北斗授时天线安装馈线敷设和防雷接地复核', 'NTP服务器网络接入和时间源优先级配置', '子钟地址编码分区编号和安装位置核验', '子钟供电通信线路端接和链路测试', '校时精度基准测试和时差记录复核', '断电守时电池或保持模块功能测试', '时钟系统广播消防和信息发布接口联调', '监控平台告警阈值日志和远程维护配置', '全网授时同步漂移复测和缺陷销项', '时钟系统交接签认和运维资料移交'],
    '10-01-03': ['机房承重梁和主机基础轴线标高复核', '曳引机设备资料吊装路径和机房条件核验', '承重梁预埋件主机底座和减振垫安装', '曳引机吊装就位和曳引轮垂直度校正', '主机底座找平螺栓紧固和防松标记', '曳引轮钢丝绳中心线与导向轮偏差复核', '制动器间隙制动力矩和释放动作调试', '编码器测速反馈和限速器接口校验', '控制柜接口动力回路和安全回路接线复核', '盘车装置松闸装置和急停功能检查', '慢车运行振动噪声温升和制动距离测试', '监督检验资料组卷和驱动主机验收移交'],
    '10-02-11': ['液压电梯电气图纸泵站控制接口和井道条件复核', '液压泵站控制柜进场验收安装和电源接入', '电磁阀比例阀和阀组接线端子编号复核', '油温传感器油压保护开关和油位报警接线', '安全回路门锁回路限位回路和急停回路接线核验', '平层传感器再平层控制回路和门区信号调试', '紧急下降装置断电释放和手动救援回路测试', '泵站电机启动运行油温油压保护联动测试', '慢车检修平层再平层和防沉降功能验证', '控制柜故障记录报警远程监视和复位测试', '液压电梯电气安全功能监督检验资料组卷', '液压电梯电气装置验收交接签认和运维移交'],
  }
  const exactReplacement = replacements[code]
  if (exactReplacement) return exactReplacement

  return coreQualityProfiledReplacementProcesses(code, itemName)
}

function findProcessIndexByKeyword(processes: ProcessTemplate[], keywords: string[]) {
  return processes.findIndex((entry) => {
    const name = processTemplateName(entry)
    return keywords.some((keyword) => name.includes(keyword))
  })
}

function findCoreQualitySupplementInsertIndex(
  code: string,
  itemName: string,
  supplementName: string,
  governed: ProcessTemplate[],
) {
  if (itemName.includes('紧固件连接') && supplementName === '连接副批次复验') {
    const installIndex = findProcessIndexByKeyword(governed, ['紧固件安装', '高强螺栓安装', '螺栓或焊接连接施工'])
    return installIndex >= 0 ? installIndex : governed.length
  }

  if (code.startsWith('07-') && supplementName === '回路编号和绝缘复测') {
    const trialRunIndex = findProcessIndexByKeyword(governed, ['通电', '试运行', '运行记录', '验收移交', '功能复测'])
    return trialRunIndex >= 0 ? trialRunIndex : governed.length
  }

  if (code.startsWith('10-') && supplementName === '安装基准线复核') {
    const installIndex = findProcessIndexByKeyword(governed, ['框体安装固定', '门框门扇安装', '驱动主机', '桁架', '导轨', '安装固定', '调试验收'])
    return installIndex >= 0 ? installIndex : governed.length
  }

  if (code.startsWith('08-') && supplementName === '点表接口和权限配置复核') {
    const testIndex = findProcessIndexByKeyword(governed, [
      '参数配置',
      '单点调试',
      '单点测试',
      '单项测试',
      '系统联调',
      '联调测试',
      '联动',
      '试运行',
      '隐蔽验收',
      '功能复测',
      '调试参数',
      '交接签认',
    ])
    return testIndex >= 0 ? testIndex : governed.length
  }

  if (supplementName.includes('实测复核和问题销项')) {
    const acceptanceIndex = findProcessIndexByKeyword(governed, ['验收', '移交', '交接签认', '记录签认'])
    return acceptanceIndex >= 0 ? acceptanceIndex : governed.length
  }

  return governed.length
}

function insertCoreQualitySupplement(
  governed: ProcessTemplate[],
  supplementName: string,
  insertIndex: number,
) {
  const boundedIndex = Math.max(0, Math.min(governed.length, insertIndex))
  governed.splice(boundedIndex, 0, supplementName)
}

function governCoreQualityProcesses(code: string, itemName: string, processes: ProcessTemplate[]) {
  const baseProcesses = coreQualityReplacementProcesses(code, itemName) ?? processes
  const governed = baseProcesses.map((entry) => {
    const name = cleanCoreQualityProcessName(
      contextualizeCoreQualityProcessName(
        code,
        itemName,
        normalizeCoreQualityProcessName(processTemplateName(entry), itemName),
      ),
    )
    return processTemplate(name, processTemplateDuration(entry))
  })
  const names = new Set(governed.map(processTemplateName))
  for (const supplementName of coreQualitySupplementProcesses(code, itemName)) {
    if (governed.length >= 6) break
    if (names.has(supplementName)) continue
    insertCoreQualitySupplement(
      governed,
      supplementName,
      findCoreQualitySupplementInsertIndex(code, itemName, supplementName, governed),
    )
    names.add(supplementName)
  }
  return governed
}

function itemNode(
  code: string,
  name: string,
  processes: Array<string | [string, number]> = [[name, 1]],
  sourceStandard = GB55032,
): ChinaTemplateCatalogNode {
  const governedProcesses = governCoreQualityProcesses(code, name, processes)
  const processDescriptors = governedProcesses.map((entry, index) => {
    const [processName, duration] = Array.isArray(entry) ? entry : [entry, 1]
    const processSource = governedProcesses.length === 1 && processName === name ? SYSTEM_PROCESS : ENTERPRISE_PROCESS
    return {
      stableCode: `${code}-P${String(index + 1).padStart(2, '0')}`,
      name: processName,
      duration,
      processSource,
    }
  })
  const children = processDescriptors.map((process, index) => (
    processNode(
      process.stableCode,
      process.name,
      process.duration,
      process.processSource,
      name,
    )
  ))
  return {
    stableCode: code,
    name,
    categoryType: 'item_work',
    sourceStandard,
    sourceVersion: 'v1.4.7.2',
    sourceClauseRef: 'GB55032-2022-building-division-catalog',
    expectedChildCount: children.length,
    webVerified: true,
    reviewNeeded: false,
    metadata: applyWbsTemplateSemanticOverride(code, buildStandardMetadata(`${code} ${name}`)),
    children,
  }
}

function subDivisionNode(
  code: string,
  name: string,
  itemNames: Array<string | [string, Array<string | [string, number]>]>,
  sourceStandard = GB55032,
): ChinaTemplateCatalogNode {
  const children = itemNames.map((entry, index) => {
    const [itemName, processes] = Array.isArray(entry) ? entry : [entry, deriveDefaultProcesses(entry, name, code)]
    return itemNode(`${code}-${String(index + 1).padStart(2, '0')}`, itemName, processes, sourceStandard)
  })
  return {
    stableCode: code,
    name,
    categoryType: 'sub_division',
    sourceStandard,
    sourceVersion: 'v1.4.7.2',
    sourceClauseRef: 'GB55032-2022-building-division-catalog',
    expectedChildCount: children.length,
    webVerified: true,
    reviewNeeded: false,
    metadata: buildStandardMetadata(`${code} ${name}`),
    children,
  }
}

function divisionNode(
  code: string,
  name: string,
  subDivisions: ChinaTemplateCatalogNode[],
  sourceStandard = GB55032,
): ChinaTemplateCatalogNode {
  return {
    stableCode: code,
    name,
    categoryType: 'division',
    sourceStandard,
    sourceVersion: 'v1.4.7.2',
    sourceClauseRef: 'GB55032-2022-building-division-catalog',
    expectedChildCount: subDivisions.length,
    webVerified: true,
    reviewNeeded: false,
    metadata: buildStandardMetadata(`${code} ${name}`),
    children: subDivisions,
  }
}

export const CHINA_GB55032_TEMPLATE_CATALOG: ChinaTemplateCatalog = {
  templateId: 'china-gb55032-2022',
  templateCode: 'CN-GB55032-2022',
  templateName: '中国房屋建筑工程分部分项标准库（GB55032-2022）',
  sourceStandard: GB55032,
  sourceVersion: 'v1.4.7.2',
  catalogLevel: 'national',
  divisions: [
    divisionNode("01", "地基与基础", [
      subDivisionNode("01-01", "地基", ["素土、灰土地基", "砂和砂石地基", "土工合成材料地基", "粉煤灰地基", "强夯地基", "注浆地基", "预压地基", "砂石桩复合地基", "高压旋喷注浆地基", "水泥土搅拌桩地基", "土和灰土挤密桩复合地基", "水泥粉煤灰碎石桩复合地基", "夯实水泥土桩复合地基"], GB55032),
      subDivisionNode("01-02", "基础", ["无筋扩展基础", "钢筋混凝土扩展基础", "筏型与箱型基础", "钢结构基础", "钢管混凝土结构基础", "型钢混凝土结构基础", "钢筋混凝土预制桩基础", "泥浆护壁成孔灌注桩基础", "干作业成孔桩基础", "长螺旋钻孔压灌桩基础", "沉管灌注桩基础", "钢桩基础", "锚杆静压桩基础", "岩石锚杆基础", "沉井与沉箱基础"], GB55032),
      subDivisionNode("01-03", "基坑支护", ["灌注桩排桩围护墙", "板桩围护墙", "咬合桩围护墙", "型钢水泥土搅拌墙", "土钉墙", "地下连续墙", "水泥土重力式挡墙", "内支撑", "锚杆", "与主体结构相结合的基坑支护"], GB55032),
      subDivisionNode("01-04", "地下水控制", ["降水与排水", "回灌"], GB55032),
      subDivisionNode("01-05", "土方", ["土方开挖", "土方回填", "场地平整"], GB55032),
      subDivisionNode("01-06", "边坡", ["喷锚支护", "挡土墙", "边坡开挖"], GB55032),
      subDivisionNode("01-07", "地下防水", ["主体结构防水", "细部构造防水", "特殊施工法结构防水", "排水", "注浆"], GB55032),
    ], GB55032),
    divisionNode("02", "主体结构", [
      subDivisionNode("02-01", "混凝土结构", ["模板", "钢筋", "混凝土", "预应力", "现浇结构", "装配式结构"], GB55032),
      subDivisionNode("02-02", "砌体结构", ["砖砌体", "混凝土小型空心砌块砌体", "石砌体", "配筋砌体", "填充墙砌体"], GB55032),
      subDivisionNode("02-03", "钢结构", ["钢结构焊接", "紧固件连接", "钢构件组装及预拼装", "单层钢结构安装", "多层及高层钢结构安装", "钢管结构安装", "预应力结构和膜结构", "压型金属板", "防腐涂料涂装", "防火涂料涂装"], GB55032),
      subDivisionNode("02-04", "钢管混凝土结构", ["构件现场拼装", "构件安装", "钢管焊接", "构件连接", "钢管内钢筋骨架", "混凝土"], GB55032),
      subDivisionNode("02-05", "型钢混凝土结构", ["型钢焊接", "紧固件连接", "型钢与钢筋连接", "型钢构件组装与预拼装", "型钢安装", "模板", "混凝土"], GB55032),
      subDivisionNode("02-06", "铝合金结构", ["铝合金焊接", "紧固件连接", "铝合金零部件加工", "铝合金构件组装", "铝合金构件预拼装", "铝合金框架结构安装", "铝合金空间网格结构安装", "铝合金面板", "铝合金幕墙结构安装", "防腐处理"], GB55032),
      subDivisionNode("02-07", "木结构", ["方木和原木结构", "胶合木结构", "轻型木结构", "木构件的防护"], GB55032),
    ], GB55032),
    divisionNode("03", "建筑装饰装修", [
      subDivisionNode("03-01", "建筑地面", ["基层铺设", "整体面层铺设", "板块面层铺设", "木、竹面层铺设"], GB55032),
      subDivisionNode("03-02", "抹灰", ["一般抹灰", "保温层薄抹灰", "装饰抹灰", "清水砌体勾缝"], GB55032),
      subDivisionNode("03-03", "外墙防水", ["外墙砂浆防水", "涂膜防水", "透气膜防水"], GB55032),
      subDivisionNode("03-04", "门窗", ["木门窗安装", "金属门窗安装", "塑料门窗安装", "特种门安装", "门窗玻璃安装"], GB55032),
      subDivisionNode("03-05", "吊顶", ["整体面层吊顶", "板块面层吊顶", "格栅吊顶"], GB55032),
      subDivisionNode("03-06", "轻质隔墙", ["板材隔墙", "骨架隔墙", "活动隔墙", "玻璃隔墙"], GB55032),
      subDivisionNode("03-07", "饰面板", ["石板安装", "陶瓷板安装", "木板安装", "金属板安装", "塑料板安装"], GB55032),
      subDivisionNode("03-08", "饰面砖", ["外墙饰面砖粘贴", "内墙饰面砖粘贴"], GB55032),
      subDivisionNode("03-09", "幕墙", ["玻璃幕墙安装", "金属幕墙安装", "石材幕墙安装", "陶板幕墙安装"], GB55032),
      subDivisionNode("03-10", "涂饰", ["水性涂料涂饰", "溶剂型涂料涂饰", "美术涂饰"], GB55032),
      subDivisionNode("03-11", "裱糊与软包", ["裱糊", "软包"], GB55032),
      subDivisionNode("03-12", "细部", ["橱柜制作与安装", "窗帘盒和窗台板制作与安装", "门窗套制作与安装", "护栏和扶手制作与安装", "花饰制作与安装"], GB55032),
    ], GB55032),
    divisionNode("04", "屋面", [
      subDivisionNode("04-01", "基层与保护", ["找坡层和找平层", "隔汽层", "隔离层", "保护层"], GB55032),
      subDivisionNode("04-02", "保温与隔热", ["板块材料保温层", "纤维材料保温层", "喷涂硬泡聚氨酯保温层", "现浇泡沫混凝土保温层", "种植隔热层", "架空隔热层", "蓄水隔热层"], GB55032),
      subDivisionNode("04-03", "防水与密封", ["卷材防水层", "涂膜防水层", "复合防水层", "接缝密封防水"], GB55032),
      subDivisionNode("04-04", "瓦面与板面", ["烧结瓦和混凝土瓦铺装", "沥青瓦铺装", "金属板铺装", "玻璃采光顶铺装"], GB55032),
      subDivisionNode("04-05", "细部构造", ["檐口", "檐沟和天沟", "女儿墙和山墙", "水落口", "变形缝", "伸出屋面管道", "屋面出入口", "反梁过水孔", "设施基座", "屋脊", "屋顶窗"], GB55032),
    ], GB55032),
    divisionNode("05", "建筑给水排水及供暖", [
      subDivisionNode("05-01", "室内给水系统", ["给水管道及配件安装", "给水设备安装", "室内消火栓系统安装", "消防喷淋系统安装", "防腐", "绝热", "管道冲洗", "消毒", "试验与调试"], GB55032),
      subDivisionNode("05-02", "室内排水系统", ["排水管道及配件安装", "雨水管道及配件安装", "防腐", "试验与调试"], GB55032),
      subDivisionNode("05-03", "室内热水供应系统", ["管道及配件安装", "辅助设备安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-04", "卫生器具", ["卫生器具安装", "卫生器具给水配件安装", "卫生器具排水管道安装", "试验与调试"], GB55032),
      subDivisionNode("05-05", "室内供暖系统", ["管道及配件安装", "辅助设备安装", "散热器安装", "低温热水地板辐射供暖系统安装", "电加热供暖系统安装", "燃气红外辐射供暖系统安装", "热风供暖系统安装", "热计量及调控装置安装", "试验与调试", "防腐", "绝热"], GB55032),
      subDivisionNode("05-06", "室外给水管网", ["给水管道安装", "室外消火栓系统安装", "试验与调试"], GB55032),
      subDivisionNode("05-07", "室外排水管网", ["排水管道安装", "排水管沟与井池", "试验与调试"], GB55032),
      subDivisionNode("05-08", "室外供热管网", ["管道及配件安装", "系统水压试验", "土建结构", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-09", "建筑饮用水供应系统", ["管道及配件安装", "水处理设备及控制设施安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-10", "建筑中水系统及雨水利用系统", ["建筑中水系统", "雨水利用系统管道及配件安装", "水处理设备及控制设施安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-11", "游泳池及公共浴池水系统", ["管道及配件系统安装", "水处理设备及控制设施安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-12", "水景喷泉系统", ["管道系统及配件安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-13", "热源及辅助设备", ["锅炉安装", "辅助设备及管道安装", "安全附件安装", "换热站安装", "防腐", "绝热", "试验与调试"], GB55032),
      subDivisionNode("05-14", "检测与控制仪表", ["检测仪器及仪表安装", "试验与调试"], GB55032),
    ], GB55032),
    divisionNode("06", "通风与空调", [
      subDivisionNode("06-01", "送风系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "旋流风口、岗位送风口、织物（布）风管安装", "系统调试"], GB55032),
      subDivisionNode("06-02", "排风系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "吸风罩和其他空气处理设备安装", "厨房、卫生间排风系统安装", "系统调试"], GB55032),
      subDivisionNode("06-03", "防排烟系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "排烟风阀（口）、常闭正压风口、防火风管安装", "系统调试"], GB55032),
      subDivisionNode("06-04", "除尘系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "除尘器与排污设备安装", "吸尘罩安装", "高温风管绝热", "系统调试"], GB55032),
      subDivisionNode("06-05", "舒适性空调系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "组合式空调机组安装", "消声器、静电除尘器、换热器、紫外线灭菌器等设备安装", "风机盘管、变风量与定风量送风装置、射流喷口等末端设备安装", "风管与设备绝热", "系统调试"], GB55032),
      subDivisionNode("06-06", "恒温恒湿空调系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "组合式空调机组安装", "电加热器、加湿器等设备安装", "精密空调机组安装", "风管与设备绝热", "系统调试"], GB55032),
      subDivisionNode("06-07", "净化空调系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "净化空调机组安装", "消声器、静电除尘器、换热器、紫外线灭菌器等设备安装", "中、高效过滤器及风机过滤器等单元末端设备清洗与安装", "洁净度测试", "风管与设备绝热", "系统调试"], GB55032),
      subDivisionNode("06-08", "地下人防通风系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "过滤吸收器、防爆波活门、防爆超压排气活门等专用设备安装", "系统调试"], GB55032),
      subDivisionNode("06-09", "真空吸尘系统", ["风管与配件制作", "部件制作", "风管系统安装", "风机与空气处理设备安装", "风管与设备防腐", "管道安装", "快速接口安装", "风机与滤尘设备安装", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-10", "冷凝水系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "板式热交换器", "辐射板及辐射供热、供冷埋地管", "热泵机组设备安装", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-11", "空调（冷、热）水系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "冷却塔与水处理设备安装", "防冻伴热设备安装", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-12", "冷却水系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "系统灌水渗漏及排放试验", "管道、设备绝热"], GB55032),
      subDivisionNode("06-13", "土壤源热泵换热系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "埋地换热系统与管网安装", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-14", "水源热泵换热系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "地表水源换热管与管网安装", "除垢设备安装", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-15", "蓄能系统", ["管道系统及部件安装", "水泵及附属设备安装", "管道冲洗", "管道、设备防腐", "蓄水罐与蓄水槽、罐安装", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-16", "压缩式制冷（热）设备系统", ["制冷机组及附属设备安装", "管道、设备防腐", "制冷剂管道及配件安装", "制冷剂灌注", "管道、设备绝热", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-17", "吸收式制冷设备系统", ["制冷机组及附属设备安装", "管道、设备防腐", "系统真空试验", "溴化锂溶液加灌", "蒸汽管道系统安装", "燃气或燃油设备安装", "管道、设备绝热", "试验及调试"], GB55032),
      subDivisionNode("06-18", "多联机（热泵）空调系统", ["室外机组安装", "室内机组安装", "制冷剂管路连接及控制开关安装", "风管安装", "冷凝水管道安装", "制冷剂灌注", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-19", "太阳能供暖空调系统", ["太阳能集热器安装", "其他辅助能源、换热设备安装", "蓄能水箱、管道及配件安装", "防腐", "绝热", "低温热水地板辐射采暖系统安装", "系统压力试验及调试"], GB55032),
      subDivisionNode("06-20", "设备自控系统", ["温度、压力与流量传感器安装", "执行机构安装调试", "防排烟系统功能测试", "自动控制及系统智能控制软件调试"], GB55032),
    ], GB55032),
    divisionNode("07", "建筑电气", [
      subDivisionNode("07-01", "室外电气", ["变压器、箱式变电所安装", "成套配电柜、控制柜（屏、台）和动力、照明配电箱（盘）及控制柜安装", "梯架、支架、托盘和槽盒安装", "导管敷设", "电缆敷设", "管内穿线和槽盒内敷线", "电缆头制作、导线连接和线路绝缘测试", "普通灯具安装", "专用灯具安装", "建筑照明通电试运行", "接地装置安装"], GB55032),
      subDivisionNode("07-02", "变配电室", ["变压器、箱式变电所安装", "成套配电柜、控制柜（屏、台）和动力、照明配电箱（盘）安装", "母线槽安装", "梯架、支架、托盘和槽盒安装", "电缆敷设", "电缆头制作、导线连接和线路绝缘测试", "接地装置安装", "接地干线敷设"], GB55032),
      subDivisionNode("07-03", "供电干线", ["电气设备试验及试运行", "母线槽安装", "梯架、支架、托盘和槽盒安装", "导线敷设", "电缆敷设", "管内穿线和槽盒内敷线", "电缆头制作、导线连接和线路绝缘测试", "接地干线敷设"], GB55032),
      subDivisionNode("07-04", "电气动力", ["成套配电柜、控制柜（屏、台）和动力配电箱（盘）安装", "电动机、电加热器及电动执行机构检查接线", "电气设备试验和试运行", "梯架、支架、托盘和槽盒安装", "导线敷设", "电缆敷设", "管内穿线和槽盒内敷线", "电缆头制作、导线连接和线路绝缘测试"], GB55032),
      subDivisionNode("07-05", "电气照明", ["成套配电柜、控制柜（屏、台）和动力、照明配电箱（盘）安装", "梯架、支架、托盘和槽盒安装", "导管敷设", "管内穿线和槽盒内敷线", "塑料护套线直敷布设", "钢索配线", "电缆头制作、导线连接和线路绝缘测试", "普通灯具安装", "专用灯具安装", "开关、插座、风扇安装", "建筑照明通电试运行"], GB55032),
      subDivisionNode("07-06", "备用和不间断电源", ["成套配电柜、控制柜（屏、台）和动力、照明配电箱（盘）安装", "柴油发电机组安装", "不间断电源装置及应急电源装置安装", "母线槽安装", "导管敷设", "电缆敷设", "管内穿线和槽盒内敷线", "电缆头制作、导线连接和线路绝缘测试", "接地装置安装"], GB55032),
      subDivisionNode("07-07", "防雷及接地安装", ["接地装置安装", "防雷引下线及接闪器安装", "建筑物等电位连接", "浪涌保护器安装"], GB55032),
    ], GB55032),
    divisionNode("08", "智能建筑", [
      subDivisionNode("08-01", "智能化集成系统", ["设备安装", "软件安装", "接口及系统调试", "试运行"], GB55032),
      subDivisionNode("08-02", "信息接入系统", ["安装场地检查"], GB55032),
      subDivisionNode("08-03", "用户电话交换系统", ["线缆敷设", "设备安装", "软件安装", "接口及系统调试", "试运行"], GB55032),
      subDivisionNode("08-04", "信息网络系统", ["计算机网络设备安装", "计算机网络软件安装", "网络安全设备安装", "网络安全软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-05", "综合布线系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "柜机、机架、配线架安装", "信息插座安装", "链路或信道测试", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-06", "移动通信室内信号覆盖系统", ["安装场地检查"], GB55032),
      subDivisionNode("08-07", "卫星通信系统", ["安装场地检查"], GB55032),
      subDivisionNode("08-08", "有线电视及卫星电视接收系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装、软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-09", "公共广播系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装、软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-10", "会议系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装、软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-11", "信息导引及发布系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "显示设备安装", "机房设备安装", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-12", "时钟系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装、软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-13", "信息化应用系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装、软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-14", "建筑设备监控系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "传感器安装", "执行器安装", "控制器、箱安装", "中央管理工作站和操作分站设备安装", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-15", "火灾自动报警系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "探测器类设备安装", "控制器类设备安装", "其他设备安装", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-16", "安全技术防范系统", ["梯架、托盘、槽盒和导管安装", "线缆敷设", "设备安装", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-17", "应急响应系统", ["设备安装", "软件安装", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-18", "机房", ["供配电系统", "防雷与接地系统", "空气调节系统", "给水排水系统", "综合布线系统", "监控与安全防范系统", "消防系统", "室内装饰装修", "电磁屏蔽", "系统调试", "试运行"], GB55032),
      subDivisionNode("08-19", "防雷与接地", ["接地装置", "接地线", "等电位联接", "屏蔽设施", "电涌保护器", "线缆敷设", "系统调试", "试运行"], GB55032),
    ], GB55032),
    divisionNode("09", "建筑节能", [
      subDivisionNode("09-01", "围护系统节能", ["墙体节能", "幕墙节能", "门窗节能", "屋面节能", "地面节能"], GB55032),
      subDivisionNode("09-02", "供暖空调设备及管网节能", ["供暖节能", "通风与空调设备节能", "空调与供暖系统冷热源节能", "空调与供暖系统管网节能"], GB55032),
      subDivisionNode("09-03", "电气动力节能", ["配电节能", "照明节能"], GB55032),
      subDivisionNode("09-04", "监控系统节能", ["监测系统节能", "控制系统节能"], GB55032),
      subDivisionNode("09-05", "可再生能源", ["地源热泵系统节能", "太阳能光热系统节能", "太阳能光伏节能"], GB55032),
    ], GB55032),
    divisionNode("10", "电梯", [
      subDivisionNode("10-01", "电力驱动的曳引式或强制式电梯", ["设备进场验收", "土建交接检验", "驱动主机", "导轨", "门系统", "轿厢", "对重", "安全部件", "悬挂装置", "随行电缆", "补偿装置", "电气装置", "整机安装验收"], GB55032),
      subDivisionNode("10-02", "液压电梯", ["设备进场验收", "土建交接检验", "液压系统", "导轨", "门系统", "轿厢", "对重", "安全部件", "悬挂装置", "随行电缆", "电气装置", "整机安装验收"], GB55032),
      subDivisionNode("10-03", "自动扶梯、自动人行道", ["设备进场验收", "土建交接检验", "整机安装验收"], GB55032),
    ], GB55032),
  ],
}

export function flattenChinaTemplateCatalog(nodes = CHINA_GB55032_TEMPLATE_CATALOG.divisions): ChinaTemplateCatalogNode[] {
  const result: ChinaTemplateCatalogNode[] = []
  const visit = (node: ChinaTemplateCatalogNode) => {
    result.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  for (const node of nodes) visit(node)
  return result
}

type InternalFlowGovernancePair = {
  predecessorName: string
  successorName: string
  count: number
  relationKind: StandardInternalFlowRelationKind
  curationStatus: StandardInternalFlowCurationStatus
  governancePriority: StandardInternalFlowRule['governancePriority']
  promotionPriority?: StandardInternalFlowRule['governancePriority']
  curationMethods: Record<string, number>
  evidenceRefLevels: Record<string, number>
  scheduleModes: Record<string, number>
  generalizationHints: StandardInternalFlowGeneralizationHint[]
  impactScope: {
    affectedGeneratedRuleCount: number
    createsDependencyCount: number
    effectiveCreatesDependencyCount: number
    skippedByDurationContributionModeCount: number
    reviewRequiredCount: number
    exampleStableCodes: string[]
    catalogIds: Record<string, number>
    catalogGroups: Record<string, number>
    backendOnly: true
  }
  examples: Array<{
    catalogId?: string
    catalogGroup?: string
    predecessorStableCode: string
    successorStableCode: string
    predecessorName: string
    successorName: string
  }>
}

type InternalFlowGovernanceEntry = {
  catalogId: string
  catalogGroup: string
  parentStableCode: string
  parentName: string
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  previousAnchorNode: ChinaTemplateCatalogNode | null
  rule: StandardInternalFlowRule
}

type InternalFlowEvidenceStrengthSample = {
  catalogId: string
  catalogGroup: string
  parentStableCode: string
  parentName: string
  predecessorStableCode: string
  successorStableCode: string
  predecessorName: string
  successorName: string
  curationStatus: StandardInternalFlowCurationStatus
  curationMethod: StandardInternalFlowCurationMethod
  relationKind: StandardInternalFlowRelationKind
  governancePriority: StandardInternalFlowRule['governancePriority']
  createsDependency: boolean
  effectiveCreatesDependency: boolean
  evidenceRefCount: number
  evidenceRefLevels: StandardInternalFlowEvidenceRef['level'][]
  evidenceCodes: string[]
  gapReason: string
  runtimeTreatment: string
  weakRuntimeAnchorCategory?: InternalFlowWeakRuntimeAnchorCategory
  weakRuntimeAnchorCategoryReason?: string
  suspectedDependencyLayer?: 'L2' | 'L3' | 'L4' | 'L5' | 'review'
  promotionRequirement?: string
  exactL5ProcessConstraintCovered?: boolean
  exactL5ProcessConstraintRuleCode?: string | null
  previousAnchorStableCode: string | null
  predecessorDurationContributionMode: DurationContributionMode
  successorDurationContributionMode: DurationContributionMode
}

type InternalFlowWeakRuntimeAnchorCategory =
  | 'l2_physical_sequence_candidate'
  | 'l5_process_constraint_candidate'
  | 'l4_business_gate_candidate'
  | 'acceptance_inspection_test_candidate'
  | 'document_report_handover_candidate'
  | 'review_required_or_non_l2_candidate'

type InternalFlowWeakRuntimeAnchorClassification = {
  category: InternalFlowWeakRuntimeAnchorCategory
  reason: string
  suspectedDependencyLayer: InternalFlowEvidenceStrengthSample['suspectedDependencyLayer']
  promotionRequirement: string
}

type L5SupportedRelationKind =
  'acceptance_gate'
  | 'hard_sequence'
  | 'soft_sequence'
  | 'dependency_intent'
  | 'explicit_task_dependency'

type InternalFlowExactL5ProcessConstraintCoverage = {
  exactL5ProcessConstraintCovered: boolean
  exactL5ProcessConstraintRuleCode: string | null
}

type SameParentExactL5ProcessConstraintCandidate = {
  rule: V1474ProcessConstraintRule
  stableCodePrefixes: string[]
}

const INTERNAL_FLOW_ANCHOR_MODES = new Set<DurationContributionMode>([
  'duration_bearing',
  'quality_gate',
  'handover_marker',
])

const SAME_PARENT_EXACT_L5_PROCESS_CONSTRAINT_RULES: SameParentExactL5ProcessConstraintCandidate[] =
  V1474_PROCESS_CONSTRAINT_SEED
    .filter((rule) => (
      rule.isActive !== false
      && rule.relationshipScope === 'same_parent_edge'
      && rule.relationInputPolicy === 'requires_existing_relation'
      && rule.dependencyCreationPolicy === 'never_create_dependency'
    ))
    .map((rule) => ({
      rule,
      stableCodePrefixes: Array.from(new Set([
        ...(rule.standardCatalogCodePrefixes ?? []),
        ...(rule.templateNodeStableCodePrefixes ?? []),
      ].map((value) => String(value ?? '').trim()).filter(Boolean))),
    }))

function bumpCount(target: Record<string, number>, key: string | undefined | null) {
  const normalized = String(key ?? 'unknown').trim() || 'unknown'
  target[normalized] = (target[normalized] ?? 0) + 1
}

function resolveExactL5ProcessConstraintCoverage(input: {
  predecessorStableCode: string
  successorStableCode: string
  relationKind: StandardInternalFlowRelationKind
}): InternalFlowExactL5ProcessConstraintCoverage {
  if (input.relationKind === 'parallel_allowed') {
    return {
      exactL5ProcessConstraintCovered: false,
      exactL5ProcessConstraintRuleCode: null,
    }
  }

  const relationKind = input.relationKind as L5SupportedRelationKind
  const matches = SAME_PARENT_EXACT_L5_PROCESS_CONSTRAINT_RULES
    .filter((candidate) => (
      candidate.rule.supportedRelationKinds.includes(relationKind)
      && candidate.stableCodePrefixes.includes(input.predecessorStableCode)
      && candidate.stableCodePrefixes.includes(input.successorStableCode)
    ))
    .sort((left, right) => (
      left.stableCodePrefixes.length - right.stableCodePrefixes.length
      || left.rule.stableCode.localeCompare(right.rule.stableCode)
    ))
  const exactMatch = matches[0]?.rule ?? null
  return {
    exactL5ProcessConstraintCovered: Boolean(exactMatch),
    exactL5ProcessConstraintRuleCode: exactMatch?.stableCode ?? null,
  }
}

function resolveInternalFlowRuleForPair(input: {
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
}): StandardInternalFlowRule {
  return resolveStandardInternalFlowRule({
    catalogSource: input.catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId
      ? 'china_gb50300_template_catalog'
      : 'domain_wbs_template_catalog',
    predecessorStableCode: input.predecessorNode.stableCode,
    predecessorName: input.predecessorNode.name,
    successorStableCode: input.successorNode.stableCode,
    successorName: input.successorNode.name,
    successorCategoryType: input.successorNode.categoryType,
    successorPurpose: input.successorNode.categoryType === 'activity_step'
      ? inferActivityStepPurpose(input.successorNode.name)
      : undefined,
  })
}

function isInternalFlowSiblingNode(node: ChinaTemplateCatalogNode) {
  return node.categoryType === 'process' || node.categoryType === 'activity_step'
}

function readNodeDurationContributionMode(node: ChinaTemplateCatalogNode): DurationContributionMode {
  const metadata = node.metadata as Record<string, unknown> | undefined
  return normalizeDurationContributionMode(metadata?.durationContributionMode ?? metadata?.duration_contribution_mode)
    ?? inferDurationContributionMode({ name: node.name, metadata })
}

function isInternalFlowAnchorNode(node: ChinaTemplateCatalogNode) {
  return INTERNAL_FLOW_ANCHOR_MODES.has(readNodeDurationContributionMode(node))
}

function evaluateEffectiveInternalFlowDependency(entry: InternalFlowGovernanceEntry) {
  const successorMode = readNodeDurationContributionMode(entry.successorNode)
  const predecessorMode = readNodeDurationContributionMode(entry.predecessorNode)
  const previousAnchorMode = entry.previousAnchorNode ? readNodeDurationContributionMode(entry.previousAnchorNode) : null
  const successorIsAnchor = INTERNAL_FLOW_ANCHOR_MODES.has(successorMode)
  const hasPreviousAnchor = Boolean(entry.previousAnchorNode)
  const effectiveCreatesDependency = Boolean(entry.rule.createsDependency && successorIsAnchor && hasPreviousAnchor)
  const skipReason = effectiveCreatesDependency
    ? 'effective_dependency'
    : !entry.rule.createsDependency
      ? 'rule_does_not_create_dependency'
      : !successorIsAnchor
        ? 'successor_not_dependency_anchor'
        : !hasPreviousAnchor
          ? 'no_previous_dependency_anchor'
          : 'duration_contribution_mode_filtered'

  return {
    effectiveCreatesDependency,
    skipReason,
    predecessorDurationContributionMode: predecessorMode,
    successorDurationContributionMode: successorMode,
    previousAnchorStableCode: entry.previousAnchorNode?.stableCode ?? null,
    previousAnchorName: entry.previousAnchorNode?.name ?? null,
    previousAnchorDurationContributionMode: previousAnchorMode,
  }
}

function getInternalFlowCatalogGroup(catalog: ChinaTemplateCatalog) {
  const record = catalog as ChinaTemplateCatalog & {
    packType?: string
    templateGroup?: string
  }
  if (record.packType) return record.packType
  if (record.templateGroup) return record.templateGroup
  return catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId ? 'core_quality' : 'unknown'
}

function collectInternalFlowGovernanceEntries(catalogs: ChinaTemplateCatalog[]): InternalFlowGovernanceEntry[] {
  const entries: InternalFlowGovernanceEntry[] = []

  const visit = (catalog: ChinaTemplateCatalog, node: ChinaTemplateCatalogNode) => {
    const siblingNodes = (node.children ?? []).filter(isInternalFlowSiblingNode)
    for (let index = 1; index < siblingNodes.length; index += 1) {
      const predecessorNode = siblingNodes[index - 1]
      const successorNode = siblingNodes[index]
      const previousAnchorNode = siblingNodes
        .slice(0, index)
        .reverse()
        .find(isInternalFlowAnchorNode) ?? null
      entries.push({
        catalogId: catalog.templateId,
        catalogGroup: getInternalFlowCatalogGroup(catalog),
        parentStableCode: node.stableCode,
        parentName: node.name,
        predecessorNode,
        successorNode,
        previousAnchorNode,
        rule: resolveInternalFlowRuleForPair({
          catalog,
          predecessorNode,
          successorNode,
        }),
      })
    }
    for (const child of node.children ?? []) visit(catalog, child)
  }

  for (const catalog of catalogs) {
    for (const node of catalog.divisions) visit(catalog, node)
  }

  return entries
}

function rankGovernancePriority(count: number, relationKind: StandardInternalFlowRelationKind): StandardInternalFlowRule['governancePriority'] {
  if (relationKind === 'acceptance_gate' || count >= 10) return 'P0'
  if (relationKind === 'hard_sequence' || count >= 5) return 'P1'
  return 'P2'
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 10_000) / 10_000
}

const L2_OUT_OF_SCOPE_INFRASTRUCTURE_CATALOG_IDS = new Set([
  'china-airport-terminal-specialty',
  'china-bridge-specialty',
  'china-port-terminal-specialty',
  'china-renewable-energy-specialty',
  'china-utility-tunnel-specialty',
])

const L2_OUT_OF_SCOPE_INFRASTRUCTURE_STABLE_PREFIXES = [
  'APT-',
  'BRG-',
  'PRT-',
  'REN-',
  'UTN-',
]

function isOutOfScopeInfrastructureInternalFlowPair(pair: InternalFlowGovernancePair) {
  const catalogIds = Object.keys(pair.impactScope.catalogIds ?? {})
  if (catalogIds.some((catalogId) => L2_OUT_OF_SCOPE_INFRASTRUCTURE_CATALOG_IDS.has(catalogId))) return true

  const stableCodes = [
    ...(pair.impactScope.exampleStableCodes ?? []).flatMap((stablePair) => stablePair.split('->')),
    ...pair.examples.flatMap((example) => [example.predecessorStableCode, example.successorStableCode]),
  ]

  return stableCodes.some((stableCode) => (
    L2_OUT_OF_SCOPE_INFRASTRUCTURE_STABLE_PREFIXES.some((prefix) => stableCode.startsWith(prefix))
  ))
}

function toEvidenceSource(code: string) {
  const evidence = STANDARD_EVIDENCE[code]
  return evidence
    ? {
        standardCode: evidence.standardCode,
        standardName: evidence.standardName,
        publisher: evidence.publisher,
        evidenceLevel: evidence.evidenceLevel,
        evidenceUrl: evidence.evidenceUrl,
      }
    : {
        standardCode: code,
        standardName: code,
        publisher: 'unknown',
        evidenceLevel: 'D' as EvidenceLevel,
        evidenceUrl: '',
      }
}

const L2_WEAK_RUNTIME_ANCHOR_CLASSIFICATION_BUCKETS: InternalFlowWeakRuntimeAnchorCategory[] = [
  'l2_physical_sequence_candidate',
  'l5_process_constraint_candidate',
  'l4_business_gate_candidate',
  'acceptance_inspection_test_candidate',
  'document_report_handover_candidate',
  'review_required_or_non_l2_candidate',
]

function classifyWeakRuntimeAnchor(entry: InternalFlowGovernanceEntry): InternalFlowWeakRuntimeAnchorClassification {
  const rule = entry.rule
  const nameText = [
    entry.catalogId,
    entry.catalogGroup,
    entry.parentName,
    rule.predecessorName,
    rule.successorName,
  ].join(' ').toLowerCase()
  const ruleText = [
    rule.relationKind,
    rule.relationRole,
    rule.reasonCode,
    rule.scheduleMode,
    rule.evidenceCodes.join(' '),
  ].join(' ').toLowerCase()
  const text = `${nameText} ${ruleText}`

  const has = (pattern: RegExp) => pattern.test(text)
  const nameHas = (pattern: RegExp) => pattern.test(nameText)
  const outOfScopeStableCode = [
    rule.predecessorStableCode,
    rule.successorStableCode,
    entry.parentStableCode,
  ].some((stableCode) => L2_OUT_OF_SCOPE_INFRASTRUCTURE_STABLE_PREFIXES.some((prefix) => stableCode.startsWith(prefix)))
  if (L2_OUT_OF_SCOPE_INFRASTRUCTURE_CATALOG_IDS.has(entry.catalogId) || outOfScopeStableCode) {
    return {
      category: 'review_required_or_non_l2_candidate',
      reason: 'standalone_infrastructure_or_non_building_scope_requires_domain_quarantine',
      suspectedDependencyLayer: 'review',
      promotionRequirement: 'Keep outside building-engineering L2 promotion until the catalog is explicitly re-scoped into building project delivery.',
    }
  }

  if (nameHas(/整改|销项|闭合|关闭|复演|复盘|演练|压测|值班|值守|巡检|权限|数据库|软件|平台|策略|初始化|报警规则|优先级|资质|验槽|成活率|风险交底|评审|校核|核查|培训|开学|开业|接管|品牌标准|问题收集|试用|保洁|消杀|物资|资产编号|u位标签|条码规则|wms|pms|iptv|点播|网关地址|房号绑定|授权|冻结|点位冻结|样板|参数|配比|映射|validation|permission|database|software|platform|strategy|training|opening|asset|barcode|drill|stress test/)) {
    return {
      category: 'review_required_or_non_l2_candidate',
      reason: 'configuration_operation_training_quality_rectification_or_governance_semantics_need_manual_layer_review',
      suspectedDependencyLayer: 'review',
      promotionRequirement: 'Keep as a review candidate until manual governance decides whether it is L2 internal configuration order, L4 business setup, L5 validation, or data-quality cleanup.',
    }
  }

  if (nameHas(/审批|许可|证照|消防验收|专项验收|竣工|分户|交付|投入使用|备案|报审|开通|送电|运营|切换|放行|签认|建设单位|监理|政府|法定|approval|permit|license|handover approval/)) {
    return {
      category: 'l4_business_gate_candidate',
      reason: 'business_domain_approval_release_or_legal_gate_semantics',
      suspectedDependencyLayer: 'L4',
      promotionRequirement: 'Route to explicit L4 business-domain gate evidence before it can affect release or use decisions.',
    }
  }

  if (nameHas(/报告|资料|记录|归档|台账|移交|交接|界面移交|接口移交|文件|document|report|record|archive|handover|turnover/)) {
    return {
      category: 'document_report_handover_candidate',
      reason: 'document_report_archive_or_handover_closeout_semantics',
      suspectedDependencyLayer: 'L4',
      promotionRequirement: 'Classify through document/handover governance before using it as a schedule-trust L2 anchor.',
    }
  }

  if (nameHas(/养护|龄期|强度|等待|保压|试压|闭水|冲洗|消毒|联调|调试|试运行|运行验证|监测|观测|观察|校准|标定|精校|调整|校正|超限|测温|冬季|雨季|夜间|噪声|扬尘|市政接驳|curing|test age|hold pressure|commission|trial operation|monitor|calibrat/)) {
    return {
      category: 'l5_process_constraint_candidate',
      reason: 'process_constraint_wait_test_age_commissioning_or_environment_semantics',
      suspectedDependencyLayer: 'L5',
      promotionRequirement: 'Represent as an L5 process constraint with lag/percent/conditional parameters rather than a flat same-parent order.',
    }
  }

  if (
    rule.relationKind === 'acceptance_gate'
    || nameHas(/检测|检验|试验|测试|复测|复核|复查|复验|核验|验收|检查|抽查|抽测|巡查|评定|探伤|校验|确认|ndt|inspection|acceptance|test|retest|survey|confirm|verify/)
  ) {
    return {
      category: 'acceptance_inspection_test_candidate',
      reason: 'inspection_acceptance_or_test_gate_requires_fact_and_release_position_review',
      suspectedDependencyLayer: 'L5',
      promotionRequirement: 'Attach inspection/test fact evidence and confirm whether the gate belongs to L5 or an explicit L2 acceptance position.',
    }
  }

  if (rule.curationStatus !== 'curated' || rule.curationMethod === 'soft_fallback' || rule.reviewNeeded) {
    return {
      category: 'review_required_or_non_l2_candidate',
      reason: 'not_curated_or_review_required_before_runtime_trust',
      suspectedDependencyLayer: 'review',
      promotionRequirement: 'Keep as backend review metadata until manual curation and fine-grained evidence prove same-parent internal-flow ownership.',
    }
  }

  return {
    category: 'l2_physical_sequence_candidate',
    reason: 'same_parent_physical_execution_order_without_detected_l4_l5_test_document_semantics',
    suspectedDependencyLayer: 'L2',
    promotionRequirement: 'Add process, clause, enterprise-method, or replay evidence before counting it as a schedule-trust L2 anchor.',
  }
}

function buildInternalFlowEvidenceStrengthSample(
  entry: InternalFlowGovernanceEntry,
  dependencyEffect: ReturnType<typeof evaluateEffectiveInternalFlowDependency>,
  evidenceRefCount: number,
  evidenceRefLevels: StandardInternalFlowEvidenceRef['level'][],
  gapReason: string,
  classification?: InternalFlowWeakRuntimeAnchorClassification,
  exactL5ProcessConstraintCoverage?: InternalFlowExactL5ProcessConstraintCoverage,
): InternalFlowEvidenceStrengthSample {
  const rule = entry.rule
  return {
    catalogId: entry.catalogId,
    catalogGroup: entry.catalogGroup,
    parentStableCode: entry.parentStableCode,
    parentName: entry.parentName,
    predecessorStableCode: rule.predecessorStableCode,
    successorStableCode: rule.successorStableCode,
    predecessorName: rule.predecessorName,
    successorName: rule.successorName,
    curationStatus: rule.curationStatus,
    curationMethod: rule.curationMethod,
    relationKind: rule.relationKind,
    governancePriority: rule.governancePriority,
    createsDependency: rule.createsDependency,
    effectiveCreatesDependency: dependencyEffect.effectiveCreatesDependency,
    evidenceRefCount,
    evidenceRefLevels,
    evidenceCodes: rule.evidenceCodes,
    gapReason,
    runtimeTreatment: 'backend_governance_candidate_only_not_schedule_trust_anchor_until_evidence_refs_or_replay_validation',
    weakRuntimeAnchorCategory: classification?.category,
    weakRuntimeAnchorCategoryReason: classification?.reason,
    suspectedDependencyLayer: classification?.suspectedDependencyLayer,
    promotionRequirement: classification?.promotionRequirement,
    exactL5ProcessConstraintCovered: exactL5ProcessConstraintCoverage?.exactL5ProcessConstraintCovered,
    exactL5ProcessConstraintRuleCode: exactL5ProcessConstraintCoverage?.exactL5ProcessConstraintRuleCode,
    previousAnchorStableCode: dependencyEffect.previousAnchorStableCode,
    predecessorDurationContributionMode: dependencyEffect.predecessorDurationContributionMode,
    successorDurationContributionMode: dependencyEffect.successorDurationContributionMode,
  }
}

export function collectStandardInternalFlowGovernanceReport(limit = 50) {
  const catalogs = [
    CHINA_GB55032_TEMPLATE_CATALOG,
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const entries = collectInternalFlowGovernanceEntries(catalogs)
  const summary = {
    catalogCount: catalogs.length,
    totalRules: 0,
    curated: 0,
    reviewRequired: 0,
    createsDependency: 0,
    rawCreatesDependency: 0,
    effectiveCreatesDependency: 0,
    dependencySkippedByDurationContributionMode: 0,
    byDependencyEffect: {} as Record<string, number>,
    byCatalogGroup: {} as Record<string, number>,
    byCatalogGroupCurationStatus: {} as Record<string, Record<string, number>>,
    byCatalogSource: {} as Record<string, number>,
    byKind: {} as Record<string, number>,
    byScheduleMode: {} as Record<string, number>,
    byGovernancePriority: {} as Record<string, number>,
    byEvidenceCode: {} as Record<string, number>,
    byCurationMethod: {} as Record<string, number>,
    byEvidenceRefLevel: {} as Record<string, number>,
    rulesWithEvidenceRefs: 0,
    conditionalRuleCount: 0,
    stableCodeBackfillCount: 0,
    curatedCoverageRatio: 0,
    reviewRequiredRatio: 0,
    evidenceRefCoverageRatio: 0,
    parallelScheduleRatio: 0,
    effectiveDependencyRatio: 0,
    rawToEffectiveDependencyRatio: 0,
  }
  const reviewPairs = new Map<string, InternalFlowGovernancePair>()
  const curatedPairs = new Map<string, InternalFlowGovernancePair>()
  const evidenceStrengthAudit = {
    status: 'l2_internal_flow_evidence_strength_stratified',
    scopeBoundary: 'building_engineering_only',
    backendOnly: true,
    totalRuleCount: 0,
    evidenceRefCoverageRatio: 0,
    fineGrainedEvidenceRefRuleCount: 0,
    fineGrainedEvidenceRefCoverageRatio: 0,
    runtimeAnchorRuleCount: 0,
    evidenceBackedRuntimeAnchorRuleCount: 0,
    fineGrainedEvidenceBackedRuntimeAnchorRuleCount: 0,
    scheduleTrustAnchorRuleCount: 0,
    noEvidenceRuntimeAnchorRuleCount: 0,
    weakEvidenceRuntimeAnchorRuleCount: 0,
    weakRuntimeAnchorUpgradeQueueCount: 0,
    weakRuntimeAnchorUpgradeQueuePolicy: 'Weak runtime anchors stay backend-only upgrade candidates until clause/process/enterprise-method evidence or replay validation is attached; they must not count as schedule-trust anchors.',
    weakRuntimeAnchorUpgradeQueue: [] as InternalFlowEvidenceStrengthSample[],
    weakRuntimeAnchorClassificationPolicy: 'Classify weak L2 runtime anchors before promotion: only clean same-parent physical work order remains an L2 upgrade candidate; L4 business gates, L5 process constraints, inspection/test gates, document/handover tails, out-of-scope or review-required tails stay in their governance buckets and must not be hard-promoted into L2.',
    l2PhysicalUpgradeCandidateCount: 0,
    weakRuntimeAnchorClassificationCounts: Object.fromEntries(
      L2_WEAK_RUNTIME_ANCHOR_CLASSIFICATION_BUCKETS.map((bucket) => [bucket, 0]),
    ) as Record<InternalFlowWeakRuntimeAnchorCategory, number>,
    weakRuntimeAnchorClassificationSamples: Object.fromEntries(
      L2_WEAK_RUNTIME_ANCHOR_CLASSIFICATION_BUCKETS.map((bucket) => [bucket, [] as InternalFlowEvidenceStrengthSample[]]),
    ) as Record<InternalFlowWeakRuntimeAnchorCategory, InternalFlowEvidenceStrengthSample[]>,
    weakRuntimeAnchorExactL5ProcessConstraintCoveredCount: 0,
    weakRuntimeAnchorWithoutExactL5ProcessConstraintCount: 0,
    weakRuntimeAnchorExactL5ProcessConstraintCoveragePolicy: 'Exact same-parent L5 process_constraint coverage is reported as visibility only: it shows when a weak L2 runtime anchor is already enhanced by an existing-relation L5 rule, without letting L5 create dependencies or own day values.',
    stableCodeBackfillRuleCount: 0,
    stableCodeBackfillWithoutEvidenceRefCount: 0,
    stableCodeBackfillWithoutGranularEvidenceRefCount: 0,
    noEvidenceBackfillRuntimeAnchorRuleCount: 0,
    weakBackfillRuntimeAnchorRuleCount: 0,
    p0OrP1EvidenceGapCount: 0,
    governanceCandidateRuleCount: 0,
    reviewRequiredGovernanceCandidateCount: 0,
    manualRegistryWithoutEvidenceRefRuntimeAnchorCount: 0,
    weakEvidenceRuntimeAnchorTreatment: 'runtime anchors backed only by standard-level refs, or by no evidenceRefs, remain lower-trust governance candidates until clause/process/enterprise-method evidence or replay validation is attached.',
    noEvidenceRuntimeAnchorTreatment: 'curated runtime anchors without evidenceRefs remain backend governance candidates; prioritize P0/P1 gaps first and do not treat them as equal to evidence-backed schedule anchors.',
    noEvidenceBackfillTreatment: 'governance candidate only; not a schedule-trust runtime anchor until evidenceRefs, replay validation, or manual semantic promotion exists',
    trustTierPolicy: 'Treat fine-grained evidence-backed runtime anchors as schedule-trust anchors; keep standard-only runtime anchors, no-evidence runtime anchors, stable-code backfill without granular evidenceRefs, high-priority evidence gaps, and review_required pairs in backend governance/back-validation before promotion.',
    outOfScopeDomains: [
      'road_bridge_tunnel_mainline',
      'railway_airport_port_energy_mainline',
      'standalone_municipal_infrastructure_network',
    ],
    samples: {
      noEvidenceRuntimeAnchors: [] as InternalFlowEvidenceStrengthSample[],
      weakEvidenceRuntimeAnchors: [] as InternalFlowEvidenceStrengthSample[],
      stableCodeBackfillWithoutEvidenceRef: [] as InternalFlowEvidenceStrengthSample[],
      stableCodeBackfillWithoutGranularEvidenceRef: [] as InternalFlowEvidenceStrengthSample[],
      noEvidenceBackfillRuntimeAnchors: [] as InternalFlowEvidenceStrengthSample[],
      weakBackfillRuntimeAnchors: [] as InternalFlowEvidenceStrengthSample[],
      p0OrP1EvidenceGaps: [] as InternalFlowEvidenceStrengthSample[],
      manualRegistryWithoutEvidenceRefRuntimeAnchors: [] as InternalFlowEvidenceStrengthSample[],
      reviewRequiredGovernanceCandidates: [] as InternalFlowEvidenceStrengthSample[],
    },
  }
  const weakRuntimeAnchorUpgradeQueueCandidates: InternalFlowEvidenceStrengthSample[] = []
  const pushEvidenceStrengthSample = (
    bucket: keyof typeof evidenceStrengthAudit.samples,
    entry: InternalFlowGovernanceEntry,
    dependencyEffect: ReturnType<typeof evaluateEffectiveInternalFlowDependency>,
    evidenceRefCount: number,
    evidenceRefLevels: StandardInternalFlowEvidenceRef['level'][],
    gapReason: string,
  ) => {
    const target = evidenceStrengthAudit.samples[bucket]
    if (target.length >= limit) return
    target.push(buildInternalFlowEvidenceStrengthSample(
      entry,
      dependencyEffect,
      evidenceRefCount,
      evidenceRefLevels,
      gapReason,
    ))
  }

  for (const entry of entries) {
    const rule = entry.rule
    const dependencyEffect = evaluateEffectiveInternalFlowDependency(entry)
    summary.totalRules += 1
    if (rule.curationStatus === 'curated') summary.curated += 1
    if (rule.curationStatus === 'review_required') summary.reviewRequired += 1
    if (rule.createsDependency) {
      summary.createsDependency += 1
      summary.rawCreatesDependency += 1
    }
    if (dependencyEffect.effectiveCreatesDependency) summary.effectiveCreatesDependency += 1
    if (rule.createsDependency && !dependencyEffect.effectiveCreatesDependency) {
      summary.dependencySkippedByDurationContributionMode += 1
    }
    bumpCount(summary.byDependencyEffect, dependencyEffect.skipReason)
    bumpCount(summary.byCatalogGroup, entry.catalogGroup)
    summary.byCatalogGroupCurationStatus[entry.catalogGroup] = summary.byCatalogGroupCurationStatus[entry.catalogGroup] ?? {}
    bumpCount(summary.byCatalogGroupCurationStatus[entry.catalogGroup], rule.curationStatus)
    bumpCount(summary.byCatalogSource, rule.source)
    bumpCount(summary.byKind, rule.relationKind)
    bumpCount(summary.byScheduleMode, rule.scheduleMode)
    bumpCount(summary.byGovernancePriority, rule.governancePriority)
    bumpCount(summary.byCurationMethod, rule.curationMethod)
    for (const code of rule.evidenceCodes ?? []) bumpCount(summary.byEvidenceCode, code)
    const ruleEvidenceRefCount = (rule.evidenceRefs ?? []).length
      + (rule.conditionalEffects ?? []).reduce((total, effect) => total + (effect.evidenceRefs ?? []).length, 0)
    const ruleEvidenceRefLevels = [
      ...(rule.evidenceRefs ?? []).map((evidenceRef) => evidenceRef.level),
      ...(rule.conditionalEffects ?? []).flatMap((effect) => (
        (effect.evidenceRefs ?? []).map((evidenceRef) => evidenceRef.level)
      )),
    ]
    const hasEvidenceRefs = ruleEvidenceRefCount > 0
    const hasFineGrainedEvidenceRefs = ruleEvidenceRefLevels.some((level) => level !== 'standard')
    if (hasEvidenceRefs) summary.rulesWithEvidenceRefs += 1
    if (hasFineGrainedEvidenceRefs) evidenceStrengthAudit.fineGrainedEvidenceRefRuleCount += 1
    for (const evidenceRef of rule.evidenceRefs ?? []) bumpCount(summary.byEvidenceRefLevel, evidenceRef.level)
    for (const effect of rule.conditionalEffects ?? []) {
      for (const evidenceRef of effect.evidenceRefs ?? []) bumpCount(summary.byEvidenceRefLevel, evidenceRef.level)
    }
    if ((rule.conditionalEffects ?? []).length > 0 || (rule.applicableWhen ?? []).length > 0) summary.conditionalRuleCount += 1
    if (rule.curationMethod === 'stable_code_backfill') summary.stableCodeBackfillCount += 1
    const isRuntimeAnchor = dependencyEffect.effectiveCreatesDependency
    const isStableCodeBackfill = rule.curationMethod === 'stable_code_backfill'
    const isHighPriority = rule.governancePriority === 'P0' || rule.governancePriority === 'P1'
    const lacksEvidenceRefs = !hasEvidenceRefs
    evidenceStrengthAudit.totalRuleCount += 1
    if (isRuntimeAnchor) evidenceStrengthAudit.runtimeAnchorRuleCount += 1
    if (isRuntimeAnchor && hasEvidenceRefs) evidenceStrengthAudit.evidenceBackedRuntimeAnchorRuleCount += 1
    if (isRuntimeAnchor && hasFineGrainedEvidenceRefs) {
      evidenceStrengthAudit.fineGrainedEvidenceBackedRuntimeAnchorRuleCount += 1
      evidenceStrengthAudit.scheduleTrustAnchorRuleCount += 1
    }
    if (isRuntimeAnchor && !hasFineGrainedEvidenceRefs) {
      const weakRuntimeAnchorClassification = classifyWeakRuntimeAnchor(entry)
      const exactL5ProcessConstraintCoverage = resolveExactL5ProcessConstraintCoverage({
        predecessorStableCode: rule.predecessorStableCode,
        successorStableCode: rule.successorStableCode,
        relationKind: rule.relationKind,
      })
      const weakRuntimeAnchorSample = buildInternalFlowEvidenceStrengthSample(
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'runtime_anchor_without_fine_grained_evidence_ref',
        weakRuntimeAnchorClassification,
        exactL5ProcessConstraintCoverage,
      )
      evidenceStrengthAudit.weakEvidenceRuntimeAnchorRuleCount += 1
      evidenceStrengthAudit.governanceCandidateRuleCount += 1
      evidenceStrengthAudit.weakRuntimeAnchorUpgradeQueueCount += 1
      if (exactL5ProcessConstraintCoverage.exactL5ProcessConstraintCovered) {
        evidenceStrengthAudit.weakRuntimeAnchorExactL5ProcessConstraintCoveredCount += 1
      } else {
        evidenceStrengthAudit.weakRuntimeAnchorWithoutExactL5ProcessConstraintCount += 1
      }
      evidenceStrengthAudit.weakRuntimeAnchorClassificationCounts[weakRuntimeAnchorClassification.category] += 1
      if (weakRuntimeAnchorClassification.category === 'l2_physical_sequence_candidate') {
        evidenceStrengthAudit.l2PhysicalUpgradeCandidateCount += 1
      }
      const classificationSamples = evidenceStrengthAudit.weakRuntimeAnchorClassificationSamples[weakRuntimeAnchorClassification.category]
      if (classificationSamples.length < limit) classificationSamples.push(weakRuntimeAnchorSample)
      weakRuntimeAnchorUpgradeQueueCandidates.push(weakRuntimeAnchorSample)
      pushEvidenceStrengthSample(
        'weakEvidenceRuntimeAnchors',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'runtime_anchor_without_fine_grained_evidence_ref',
      )
    }
    if (isRuntimeAnchor && lacksEvidenceRefs) {
      evidenceStrengthAudit.noEvidenceRuntimeAnchorRuleCount += 1
      pushEvidenceStrengthSample(
        'noEvidenceRuntimeAnchors',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'runtime_anchor_without_evidence_ref',
      )
    }
    if (isStableCodeBackfill) evidenceStrengthAudit.stableCodeBackfillRuleCount += 1
    if (isStableCodeBackfill && lacksEvidenceRefs) {
      evidenceStrengthAudit.stableCodeBackfillWithoutEvidenceRefCount += 1
      if (!isRuntimeAnchor) evidenceStrengthAudit.governanceCandidateRuleCount += 1
      pushEvidenceStrengthSample(
        'stableCodeBackfillWithoutEvidenceRef',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'stable_code_backfill_without_evidence_ref',
      )
    }
    if (isStableCodeBackfill && !hasFineGrainedEvidenceRefs) {
      evidenceStrengthAudit.stableCodeBackfillWithoutGranularEvidenceRefCount += 1
      if (!isRuntimeAnchor && hasEvidenceRefs) evidenceStrengthAudit.governanceCandidateRuleCount += 1
      pushEvidenceStrengthSample(
        'stableCodeBackfillWithoutGranularEvidenceRef',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'stable_code_backfill_without_clause_process_or_enterprise_evidence_ref',
      )
    }
    if (isRuntimeAnchor && isStableCodeBackfill && lacksEvidenceRefs) {
      evidenceStrengthAudit.noEvidenceBackfillRuntimeAnchorRuleCount += 1
      pushEvidenceStrengthSample(
        'noEvidenceBackfillRuntimeAnchors',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'runtime_anchor_from_stable_code_backfill_without_evidence_ref',
      )
    }
    if (isRuntimeAnchor && isStableCodeBackfill && !hasFineGrainedEvidenceRefs) {
      evidenceStrengthAudit.weakBackfillRuntimeAnchorRuleCount += 1
      pushEvidenceStrengthSample(
        'weakBackfillRuntimeAnchors',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'runtime_anchor_from_stable_code_backfill_without_fine_grained_evidence_ref',
      )
    }
    if (isRuntimeAnchor && rule.curationMethod === 'manual_registry' && lacksEvidenceRefs) {
      evidenceStrengthAudit.manualRegistryWithoutEvidenceRefRuntimeAnchorCount += 1
      pushEvidenceStrengthSample(
        'manualRegistryWithoutEvidenceRefRuntimeAnchors',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'manual_registry_runtime_anchor_without_evidence_ref',
      )
    }
    if (isRuntimeAnchor && isHighPriority && lacksEvidenceRefs) {
      evidenceStrengthAudit.p0OrP1EvidenceGapCount += 1
      pushEvidenceStrengthSample(
        'p0OrP1EvidenceGaps',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'p0_or_p1_runtime_anchor_without_evidence_ref',
      )
    }
    if (rule.curationStatus === 'review_required') {
      evidenceStrengthAudit.reviewRequiredGovernanceCandidateCount += 1
      evidenceStrengthAudit.governanceCandidateRuleCount += 1
      pushEvidenceStrengthSample(
        'reviewRequiredGovernanceCandidates',
        entry,
        dependencyEffect,
        ruleEvidenceRefCount,
        ruleEvidenceRefLevels,
        'review_required_no_runtime_dependency_before_promotion',
      )
    }

    const key = `${rule.predecessorName} -> ${rule.successorName}`
    const target = rule.curationStatus === 'review_required' ? reviewPairs : curatedPairs
    const current: InternalFlowGovernancePair = target.get(key) ?? {
      predecessorName: rule.predecessorName,
      successorName: rule.successorName,
      count: 0,
      relationKind: rule.relationKind,
      curationStatus: rule.curationStatus,
      governancePriority: rule.governancePriority,
      curationMethods: {},
      evidenceRefLevels: {},
      scheduleModes: {},
      generalizationHints: [],
      impactScope: {
        affectedGeneratedRuleCount: 0,
        createsDependencyCount: 0,
        effectiveCreatesDependencyCount: 0,
        skippedByDurationContributionModeCount: 0,
        reviewRequiredCount: 0,
        exampleStableCodes: [],
        catalogIds: {},
        catalogGroups: {},
        backendOnly: true,
      },
      examples: [],
    }
    current.count += 1
    current.governancePriority = rankGovernancePriority(current.count, current.relationKind)
    bumpCount(current.curationMethods, rule.curationMethod)
    bumpCount(current.scheduleModes, rule.scheduleMode)
    for (const evidenceRef of rule.evidenceRefs ?? []) bumpCount(current.evidenceRefLevels, evidenceRef.level)
    if (rule.generalizationHint && current.generalizationHints.length < 3) current.generalizationHints.push(rule.generalizationHint)
    current.impactScope.affectedGeneratedRuleCount += 1
    if (rule.createsDependency) current.impactScope.createsDependencyCount += 1
    if (dependencyEffect.effectiveCreatesDependency) current.impactScope.effectiveCreatesDependencyCount += 1
    if (rule.createsDependency && !dependencyEffect.effectiveCreatesDependency) current.impactScope.skippedByDurationContributionModeCount += 1
    if (rule.curationStatus === 'review_required') current.impactScope.reviewRequiredCount += 1
    bumpCount(current.impactScope.catalogIds, entry.catalogId)
    bumpCount(current.impactScope.catalogGroups, entry.catalogGroup)
    const stablePair = `${rule.predecessorStableCode}->${rule.successorStableCode}`
    if (current.impactScope.exampleStableCodes.length < 5 && !current.impactScope.exampleStableCodes.includes(stablePair)) {
      current.impactScope.exampleStableCodes.push(stablePair)
    }
    if (current.examples.length < 3) {
      current.examples.push({
        catalogId: entry.catalogId,
        catalogGroup: entry.catalogGroup,
        predecessorStableCode: rule.predecessorStableCode,
        successorStableCode: rule.successorStableCode,
        predecessorName: rule.predecessorName,
        successorName: rule.successorName,
      })
    }
    target.set(key, current)
  }

  for (const seedRule of STANDARD_INTERNAL_FLOW_RULE_SEED) {
    for (const evidenceRef of seedRule.evidenceRefs ?? []) {
      bumpCount(summary.byEvidenceRefLevel, evidenceRef.level)
    }
    for (const effect of seedRule.conditionalEffects ?? []) {
      for (const evidenceRef of effect.evidenceRefs ?? []) {
        bumpCount(summary.byEvidenceRefLevel, evidenceRef.level)
      }
    }
  }

  const sortPairs = (pairs: Map<string, InternalFlowGovernancePair>) =>
    Array.from(pairs.values()).sort((a, b) => b.count - a.count || a.predecessorName.localeCompare(b.predecessorName))

  summary.curatedCoverageRatio = ratio(summary.curated, summary.totalRules)
  summary.reviewRequiredRatio = ratio(summary.reviewRequired, summary.totalRules)
  summary.evidenceRefCoverageRatio = ratio(summary.rulesWithEvidenceRefs, summary.totalRules)
  summary.parallelScheduleRatio = ratio(summary.byScheduleMode.parallel_with_previous ?? 0, summary.totalRules)
  summary.effectiveDependencyRatio = ratio(summary.effectiveCreatesDependency, summary.totalRules)
  summary.rawToEffectiveDependencyRatio = ratio(summary.effectiveCreatesDependency, summary.rawCreatesDependency)
  evidenceStrengthAudit.evidenceRefCoverageRatio = summary.evidenceRefCoverageRatio
  evidenceStrengthAudit.fineGrainedEvidenceRefCoverageRatio = ratio(
    evidenceStrengthAudit.fineGrainedEvidenceRefRuleCount,
    summary.totalRules,
  )
  const governancePriorityRank: Record<StandardInternalFlowRule['governancePriority'], number> = {
    P0: 0,
    P1: 1,
    P2: 2,
  }
  const relationKindRank: Record<StandardInternalFlowRelationKind, number> = {
    acceptance_gate: 0,
    hard_sequence: 1,
    soft_sequence: 2,
    parallel_allowed: 3,
  }
  evidenceStrengthAudit.weakRuntimeAnchorUpgradeQueue = weakRuntimeAnchorUpgradeQueueCandidates
    .sort((a, b) =>
      (governancePriorityRank[a.governancePriority] ?? 9) - (governancePriorityRank[b.governancePriority] ?? 9)
      || (relationKindRank[a.relationKind] ?? 9) - (relationKindRank[b.relationKind] ?? 9)
      || a.catalogGroup.localeCompare(b.catalogGroup)
      || Number(b.effectiveCreatesDependency) - Number(a.effectiveCreatesDependency)
      || a.evidenceRefLevels.join('|').localeCompare(b.evidenceRefLevels.join('|'))
      || a.predecessorStableCode.localeCompare(b.predecessorStableCode)
      || a.successorStableCode.localeCompare(b.successorStableCode)
    )
    .slice(0, limit)

  const evidenceCodes = Object.keys(summary.byEvidenceCode).sort()
  const sortedCuratedPairs = sortPairs(curatedPairs)
  const sortedReviewPairs = sortPairs(reviewPairs)
  const outOfScopeReviewPairs = sortedReviewPairs.filter(isOutOfScopeInfrastructureInternalFlowPair)
  const inScopeReviewPairs = sortedReviewPairs.filter((pair) => !isOutOfScopeInfrastructureInternalFlowPair(pair))
  const outOfScopeReviewTailRuleCount = outOfScopeReviewPairs
    .reduce((total, pair) => total + pair.count, 0)
  const inScopeReviewTailRuleCount = summary.reviewRequired - outOfScopeReviewTailRuleCount
  const outOfScopeCatalogIdCounts: Record<string, number> = {}
  for (const pair of outOfScopeReviewPairs) {
    for (const [catalogId, count] of Object.entries(pair.impactScope.catalogIds ?? {})) {
      if (L2_OUT_OF_SCOPE_INFRASTRUCTURE_CATALOG_IDS.has(catalogId)) {
        outOfScopeCatalogIdCounts[catalogId] = (outOfScopeCatalogIdCounts[catalogId] ?? 0) + count
      }
    }
  }
  const classifyReviewTailBoundaryBucket = (pair: InternalFlowGovernancePair) => {
    if (isOutOfScopeInfrastructureInternalFlowPair(pair)) return 'out_of_scope_domain'
    const text = `${pair.predecessorName} ${pair.successorName}`.toLowerCase()
    const stableCodes = pair.impactScope.exampleStableCodes.join(' ')
    if (stableCodes.includes('-S')) return 'substep_seed_depth_pending'
    if (/养护|龄期|强度|试压|保压|抽真空|检测|试验|测试|复测|调试|压力|过热度/.test(text)) {
      return 'possible_l5_wait_or_test_age'
    }
    if (/移交|交接|界面|接口|洞口|开业|运营|联动|handover|interface|opening/.test(text)) {
      return 'possible_l3_boundary'
    }
    return 'p2_soft_no_runtime_tail'
  }
  const classifyReviewTailActionBucket = (pair: InternalFlowGovernancePair) => {
    if (isOutOfScopeInfrastructureInternalFlowPair(pair)) return 'out_of_scope_domain'
    const text = `${pair.predecessorName} ${pair.successorName}`.toLowerCase()
    const stableCodes = pair.impactScope.exampleStableCodes.join(' ')
    if (/整改|销项|闭合|关闭|留存|影像|拍照|标识自检|关键控制点复查|过程实施记录|报告|资料|记录|归档|台账|复演|复盘|演练|值班|值守|权限|数据库|软件|平台|策略|初始化|报警规则|培训|资产编号|条码规则|document|report|record|archive|database|software|platform|training/.test(text)) {
      return 'data_quality_or_non_l2_review'
    }
    if (/审批|许可|证照|消防验收|专项验收|竣工|分户|交付|投入使用|备案|报审|开通|送电|运营|切换|放行|签认|建设单位|监理|政府|法定|approval|permit|license/.test(text)) {
      return 'l4_gate_candidate'
    }
    if (/养护|龄期|强度|等待|保压|试压|闭水|冲洗|消毒|联调|调试|试运行|运行验证|监测|观测|校准|标定|精校|调整|校正|超限|测温|冬季|雨季|夜间|噪声|扬尘|检测|检验|试验|测试|试块|测算|处置|隐患|风险|修补|复涂|复测|复核|复查|复验|核验|验收|检查|抽查|抽测|巡查|评定|探伤|校验|确认|curing|test age|hold pressure|commission|trial operation|monitor|calibrat|inspection|acceptance|test|retest|confirm|verify/.test(text)) {
      return 'l5_constraint_candidate'
    }
    if (/移交|交接|界面|接口|洞口|工作面|作业面|楼层|分区|分段|穿墙|接驳|接管|开业|handover|interface|opening|workface|zone|segment/.test(text)) {
      return 'l3_cross_item_candidate'
    }
    if (stableCodes.includes('-S')) return 'l2_seed_depth_candidate'
    return 'data_quality_or_non_l2_review'
  }
  const reviewTailByRelationKind: Record<string, number> = {}
  const reviewTailBoundaryBuckets: Record<string, number> = {
    out_of_scope_domain: 0,
    substep_seed_depth_pending: 0,
    possible_l3_boundary: 0,
    possible_l5_wait_or_test_age: 0,
    p2_soft_no_runtime_tail: 0,
  }
  const reviewTailActionBuckets: Record<string, number> = {
    out_of_scope_domain: 0,
    l2_seed_depth_candidate: 0,
    l3_cross_item_candidate: 0,
    l4_gate_candidate: 0,
    l5_constraint_candidate: 0,
    data_quality_or_non_l2_review: 0,
  }
  const reviewTailActionSamples: Record<string, InternalFlowGovernancePair[]> = Object.fromEntries(
    Object.keys(reviewTailActionBuckets).map((bucket) => [bucket, [] as InternalFlowGovernancePair[]]),
  )
  let reviewTailCreatesDependencyCount = 0
  let reviewTailEffectiveCreatesDependencyCount = 0
  let reviewTailEvidenceRefNonEmptyCount = 0
  let promotionEligibleTailCount = 0
  for (const pair of sortedReviewPairs) {
    bumpCount(reviewTailByRelationKind, pair.relationKind)
    reviewTailByRelationKind[pair.relationKind] += pair.count - 1
    reviewTailCreatesDependencyCount += pair.impactScope.createsDependencyCount
    reviewTailEffectiveCreatesDependencyCount += pair.impactScope.effectiveCreatesDependencyCount
    if (Object.keys(pair.evidenceRefLevels).length > 0) reviewTailEvidenceRefNonEmptyCount += pair.count
    const bucket = classifyReviewTailBoundaryBucket(pair)
    reviewTailBoundaryBuckets[bucket] = (reviewTailBoundaryBuckets[bucket] ?? 0) + pair.count
    const actionBucket = classifyReviewTailActionBucket(pair)
    reviewTailActionBuckets[actionBucket] = (reviewTailActionBuckets[actionBucket] ?? 0) + pair.count
    if ((reviewTailActionSamples[actionBucket] ?? []).length < limit) {
      reviewTailActionSamples[actionBucket].push(pair)
    }
    const isPromotionEligible = (
      Object.keys(pair.evidenceRefLevels).length > 0
      && (
        pair.relationKind === 'hard_sequence'
        || pair.relationKind === 'acceptance_gate'
        || pair.impactScope.createsDependencyCount > 0
        || pair.governancePriority === 'P0'
        || pair.governancePriority === 'P1'
      )
    )
    if (isPromotionEligible) promotionEligibleTailCount += pair.count
  }
  const reviewRequiredTailClassificationAudit = {
    status: 'l2_review_required_tail_classified_without_runtime_promotion',
    backendOnly: true,
    uniqueMissingPairCount: sortedReviewPairs.length,
    missingGeneratedRuleCount: summary.reviewRequired,
    inScopeUniqueMissingPairCount: inScopeReviewPairs.length,
    inScopeReviewTailRuleCount,
    outOfScopeUniqueMissingPairCount: outOfScopeReviewPairs.length,
    outOfScopeReviewTailRuleCount,
    outOfScopeCatalogIdCounts,
    outOfScopeReviewTailPairs: outOfScopeReviewPairs.slice(0, limit).map((pair) => ({
      ...pair,
      scopeBoundaryReason: 'standalone_infrastructure_domain_outside_building_engineering_l2_coverage_backlog',
    })),
    reviewTailByRelationKind,
    reviewTailCreatesDependencyCount,
    reviewTailEffectiveCreatesDependencyCount,
    reviewTailEvidenceRefNonEmptyCount,
    promotionEligibleTailCount,
    reviewTailBoundaryBuckets,
    reviewTailActionBuckets,
    reviewTailActionSamples,
    buildingScopePolicy: 'L2 building-engineering coverage backlog excludes standalone infrastructure domains such as bridge, port, airport, renewable-energy and utility-tunnel mainlines; those tails stay quarantined and must not be promoted to close building-project dependency coverage.',
    boundaryBucketPolicy: 'Out-of-scope infrastructure, substep seed-depth pending, possible L3 boundary, and possible L5 wait/test-age buckets remain governance classifications only; they do not promote L2 rules or create runtime dependencies.',
    actionBucketPolicy: 'Review-required tails are routed before promotion: L2 seed-depth candidates require same-parent evidence, L3 cross-item candidates move to cross-item workflow review, L4 gate candidates require explicit business-gate evidence, L5 constraint candidates require parameterized process-constraint facts, and data-quality/non-L2 review items remain backend-only.',
    promotionPolicy: 'Promote L2 review tail only after evidenceRefs, manual curated seed review, and explicit runtime-impact checks prove the pair belongs to same-pack internal flow.',
  }
  const stableCodeGeneralizationCandidates = sortedCuratedPairs
    .filter((pair) => (
      (pair.curationMethods.stable_code_backfill ?? 0) > 0
      && Object.keys(pair.curationMethods).every((method) => method === 'stable_code_backfill')
      && !(
        (pair.evidenceRefLevels.process ?? 0) >= pair.count
        && pair.generalizationHints.some((hint) => hint.promotionPriority === 'P1')
      )
    ))
    .slice(0, limit)
    .map((pair) => ({
      predecessorName: pair.predecessorName,
      successorName: pair.successorName,
      count: pair.count,
      promotionPriority: pair.governancePriority,
      reason: 'stable_code 精确回填已高频出现，后续应结合真实执行数据和证据链反推为语义规则候选。',
      impactScope: pair.impactScope,
      examples: pair.examples,
    }))
  const withPromotionPriority = (pair: InternalFlowGovernancePair): InternalFlowGovernancePair => ({
    ...pair,
    promotionPriority: pair.governancePriority,
  })
  const highPriorityReviewRequiredPairs = sortedReviewPairs
    .filter((pair) => pair.governancePriority === 'P0' || pair.governancePriority === 'P1')
    .slice(0, limit)
    .map(withPromotionPriority)
  const p0ReviewRequiredRuleCount = sortedReviewPairs
    .filter((pair) => pair.governancePriority === 'P0')
    .reduce((total, pair) => total + pair.count, 0)
  const p1ReviewRequiredRuleCount = sortedReviewPairs
    .filter((pair) => pair.governancePriority === 'P1')
    .reduce((total, pair) => total + pair.count, 0)
  const runtimeBlockingReviewRequiredRuleCount = p0ReviewRequiredRuleCount + p1ReviewRequiredRuleCount
  const highPriorityReviewRequiredRuleCount = runtimeBlockingReviewRequiredRuleCount
  const actionableL2SeedDepthCandidateCount = reviewTailActionBuckets.l2_seed_depth_candidate ?? 0
  const runtimeImpactReady = runtimeBlockingReviewRequiredRuleCount === 0
    && reviewTailCreatesDependencyCount === 0
    && reviewTailEffectiveCreatesDependencyCount === 0
    && promotionEligibleTailCount === 0
  const classifiedTailScheduleTrustReady = runtimeImpactReady
    && actionableL2SeedDepthCandidateCount === 0
  const coverageSprintReady = summary.curatedCoverageRatio >= 0.88
  const scheduleTrustCoverageStatus = classifiedTailScheduleTrustReady
    ? 'schedule_trust_closed_with_classified_non_l2_tail'
    : 'schedule_trust_pending_l2_actionable_or_runtime_tail'
  const executionBaselineReady = runtimeImpactReady
  const executionBaselineGate = {
    status: runtimeImpactReady
      ? coverageSprintReady
        ? 'execution_baseline_ready'
        : 'runtime_execution_baseline_ready_with_p2_governance_tail'
      : 'needs_curated_rule_sprint',
    minimumCuratedCoverageRatio: 0.88,
    currentCuratedCoverageRatio: summary.curatedCoverageRatio,
    coverageSprintStatus: coverageSprintReady ? 'coverage_sprint_closed' : 'coverage_sprint_pending',
    scheduleTrustCoverageStatus,
    classifiedTailScheduleTrustReady,
    actionableL2SeedDepthCandidateCount,
    coverageClosureBasis: classifiedTailScheduleTrustReady
      ? 'classified_tail_has_no_actionable_l2_or_runtime_effect'
      : 'raw_curated_coverage_or_unclassified_runtime_tail_still_requires_review',
    runtimeImpactStatus: runtimeImpactReady ? 'runtime_impact_ready' : 'runtime_impact_review_required',
    highPriorityReviewRequiredRuleCount,
    p0ReviewRequiredRuleCount,
    p1ReviewRequiredRuleCount,
    runtimeBlockingReviewRequiredRuleCount,
    reviewTailCreatesDependencyCount,
    reviewTailEffectiveCreatesDependencyCount,
    promotionEligibleTailCount,
    operatingMode: executionBaselineReady
      ? coverageSprintReady
        ? 'freeze_p2_tail_and_use_backend_back_validation'
        : 'freeze_runtime_impact_tail_and_continue_backend_back_validation'
      : 'continue_p0_p1_manual_curation_before_execution_baseline',
    coverageSprintPolicy: 'Raw curated coverage below 0.88 remains visible as a backend governance and data-quality signal and does not block runtime scheduling; schedule-trust coverage closes when the classified tail has no actionable L2 seed-depth candidates, no runtime-blocking pairs, no promotion-eligible pairs, and creates no dependency.',
    p2TailPolicy: 'Do not chase every low-frequency P2 review_required pair. Curate only explicit hard predecessors, acceptance gates, or conditional rules with clear evidence; keep uncertain pairs as backend review_required metadata.',
    runtimePolicy: 'No ordinary task save, progress update, baseline confirm, or monthly-plan confirm is blocked by internal-flow technical status.',
    backValidationEntryPoint: 'algorithm_seed_candidates.seed_type=standard_internal_flow via algorithmSeedCandidateDiscoveryService',
  }
  return {
    generatedAt: new Date().toISOString(),
    scope: 'same_parent_standard_internal_flow',
    summary,
    qualitySignals: {
      readyForExecutionBaseline: executionBaselineReady,
      needsManualRuleCuration: summary.reviewRequired > 0,
      evidenceRefsNeedEnrichment: (summary.byEvidenceRefLevel.clause ?? 0) + (summary.byEvidenceRefLevel.process ?? 0) + (summary.byEvidenceRefLevel.enterprise_method ?? 0) < summary.curated,
      stableCodeBackfillNeedsGeneralization: summary.stableCodeBackfillCount > 0,
      parallelizationNeedsReview: summary.parallelScheduleRatio < 0.05,
      effectiveDependencyFilteredByDurationMode: summary.dependencySkippedByDurationContributionMode > 0,
      runtimeBlockingPolicy: 'no_user_facing_block; generated order changes only feed backend evidence',
    },
    governancePolicy: {
      ordinaryBusinessPagesExposeTechnicalSeedNames: false,
      reviewRequiredCreatesDependency: false,
      curatedAcceptanceGateCreatesDependency: true,
      manualGovernanceQueue: 'Current known same-parent internal-flow pairs are curated; future unmatched pairs enter backend governance as review_required and do not create dependencies until promoted.',
      hardSequenceMustBeExplicit: true,
      hardSequenceCandidateRequiresCuratedSeed: true,
      stopChasingLowFrequencyP2Tail: executionBaselineReady,
      executionBaselineGate,
      dependencyEffectPolicy: 'summary.createsDependency/rawCreatesDependency is the raw seed declaration; summary.effectiveCreatesDependency is the post-durationContributionMode generator-effective dependency count.',
    },
    executionBaselineGate,
    evidenceStrengthAudit,
    reviewRequiredTailClassificationAudit,
    backValidationWorkflow: {
      backendOnly: true,
      source: 'duration_experience_samples.metadata.standard_internal_flow',
      cadence: 'scheduled_or_after_new_samples_month_close_project_closeout',
      candidateOutput: 'algorithm_seed_candidates.seed_type=standard_internal_flow',
      automaticSteps: [
        'sample_generated_internal_flow_metadata',
        'compare_actual_start_finish_and_user_dependency_changes',
        'rank_candidate_relation_kind_and_confidence',
        'write_candidate_only_or_quarantine_with_evidence_refs',
        'surface_in_backend_governance_report',
      ],
      manualConfirmationScope: [
        'hard_sequence',
        'acceptance_gate',
        'semantic_generalization_from_stable_code_backfill',
      ],
      autoPublishAllowedFor: [
        'soft_sequence_candidate_with_low_runtime_impact',
        'parallel_allowed_candidate_with_low_runtime_impact',
      ],
      autoPublishForbiddenFor: [
        'hard_sequence',
        'acceptance_gate',
        'rules_that_create_task_dependencies',
        'rules_that_change_confirmed_baseline_or_monthly_plan',
      ],
    },
    releaseImpactPreview: {
      backendOnly: true,
      futureGeneratedDependencyRules: summary.effectiveCreatesDependency,
      rawSeedCreatesDependencyRules: summary.rawCreatesDependency,
      effectiveGeneratedDependencyRules: summary.effectiveCreatesDependency,
      dependencyRulesSkippedByDurationContributionMode: summary.dependencySkippedByDurationContributionMode,
      reviewRequiredNoDependencyRules: summary.reviewRequired,
      highPriorityReviewRequiredRules: highPriorityReviewRequiredRuleCount,
      affectedConfirmedPlansPolicy: 'report_only_do_not_mutate_confirmed_baselines_or_monthly_plans',
      runtimeConstraintPolicy: 'do_not_block_task_save_progress_update_baseline_confirm_or_monthly_confirm',
      releaseWorkflow: [
        'compute_affected_template_node_stable_codes',
        'compare_future_generated_dependency_delta',
        'estimate_confirmed_baseline_monthly_plan_execution_task_impact',
        'write_audit_snapshot',
        'publish_seed_version_without_mutating_confirmed_history',
      ],
      rollbackWorkflow: [
        'restore_previous_seed_version',
        'recompute_future_generation_preview',
        'write_audit_snapshot',
        'do_not_mutate_confirmed_history',
      ],
    },
    stableCodeGeneralizationCandidates,
    highPriorityReviewRequiredPairs,
    inScopeTopReviewRequiredPairs: inScopeReviewPairs.slice(0, limit).map(withPromotionPriority),
    outOfScopeReviewTailPairs: outOfScopeReviewPairs.slice(0, limit).map(withPromotionPriority),
    topReviewRequiredPairs: sortedReviewPairs.slice(0, limit).map(withPromotionPriority),
    topCuratedPairs: sortedCuratedPairs.slice(0, Math.min(limit, 20)),
    evidenceSources: evidenceCodes.map(toEvidenceSource),
  }
}
