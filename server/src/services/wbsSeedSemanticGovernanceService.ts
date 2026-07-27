import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  type ChinaTemplateCatalogNode,
  type ChinaTemplateCategoryType,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import {
  DOMAIN_WBS_TEMPLATE_CATALOGS,
  type DomainWbsTemplateCatalog,
  type WbsTemplateCatalogGroup,
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
  inferControlRoles,
  normalizeCommercialControlRole,
  normalizeDocumentEvidenceRole,
  normalizeInspectionAcceptanceRole,
  normalizeManagementControlRole,
  normalizeQualityControlRole,
  normalizeSafetyControlRole,
  type CommercialControlRole,
  type DocumentEvidenceRole,
  type InspectionAcceptanceRole,
  type ManagementControlRole,
  type QualityControlRole,
  type SafetyControlRole,
  type WbsTemplateControlRoles,
} from '../seeds/controlRoles.js'
import {
  inferDurationContributionMode,
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  inferExecutionNature,
  normalizeExecutionNature,
  type ExecutionNature,
} from '../seeds/executionNature.js'
import { DEPENDENCY_INTENT_REFERENCE_FIELDS } from '../seeds/v1475DependencyIntentTemplates.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import { auditBusinessTypeRegistry } from './businessTypeRegistryService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

type CountMap = Record<string, number>
type GovernanceSeverity = 'P0' | 'P1' | 'P2'

type CatalogSource = {
  catalogId: string
  catalogName: string
  catalogGroup: WbsTemplateCatalogGroup
  divisions: ChinaTemplateCatalogNode[]
}

type CatalogNodeEntry = {
  catalogId: string
  catalogName: string
  catalogGroup: WbsTemplateCatalogGroup
  stableCode: string
  name: string
  categoryType: ChinaTemplateCategoryType
  path: string
  metadata: Record<string, unknown>
  durationContributionMode: DurationContributionMode
  executionNature: ExecutionNature
  controlRoles: WbsTemplateControlRoles
  declaredSemanticFieldCount: number
}

export type WbsSeedSemanticGovernanceFinding = {
  severity: GovernanceSeverity
  ruleCode: string
  title: string
  catalogId: string
  catalogGroup: WbsTemplateCatalogGroup
  stableCode: string
  name: string
  categoryType: ChinaTemplateCategoryType
  path: string
  durationContributionMode: DurationContributionMode
  executionNature: ExecutionNature
  reason: string
  recommendedAction: string
  relatedCode?: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function bumpCount(target: CountMap, key: unknown) {
  const normalized = normalizeText(key) || 'unknown'
  target[normalized] = (target[normalized] ?? 0) + 1
}

function sortCountMap(input: CountMap): CountMap {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
}

function limitNumber(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.trunc(parsed)))
}

function readMetadataValue(metadata: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return metadata[camelKey] ?? metadata[snakeKey]
}

function declaredControlRoles(metadata: Record<string, unknown>) {
  return {
    qualityControlRole: normalizeQualityControlRole(readMetadataValue(metadata, 'qualityControlRole', 'quality_control_role')),
    safetyControlRole: normalizeSafetyControlRole(readMetadataValue(metadata, 'safetyControlRole', 'safety_control_role')),
    inspectionAcceptanceRole: normalizeInspectionAcceptanceRole(readMetadataValue(metadata, 'inspectionAcceptanceRole', 'inspection_acceptance_role')),
    documentEvidenceRole: normalizeDocumentEvidenceRole(readMetadataValue(metadata, 'documentEvidenceRole', 'document_evidence_role')),
    commercialControlRole: normalizeCommercialControlRole(readMetadataValue(metadata, 'commercialControlRole', 'commercial_control_role')),
    managementControlRole: normalizeManagementControlRole(readMetadataValue(metadata, 'managementControlRole', 'management_control_role')),
  }
}

function countDeclaredSemanticFields(metadata: Record<string, unknown>) {
  const durationMode = normalizeDurationContributionMode(readMetadataValue(metadata, 'durationContributionMode', 'duration_contribution_mode'))
  const executionNature = normalizeExecutionNature(readMetadataValue(metadata, 'executionNature', 'execution_nature'))
  const roles = declaredControlRoles(metadata)
  return [
    durationMode,
    executionNature,
    roles.qualityControlRole,
    roles.safetyControlRole,
    roles.inspectionAcceptanceRole,
    roles.documentEvidenceRole,
    roles.commercialControlRole,
    roles.managementControlRole,
  ].filter(Boolean).length
}

function resolveDurationContributionMode(node: ChinaTemplateCatalogNode, metadata: Record<string, unknown>) {
  return normalizeDurationContributionMode(readMetadataValue(metadata, 'durationContributionMode', 'duration_contribution_mode'))
    ?? inferDurationContributionMode({
      name: node.name,
      metadata,
      planItemKind: readMetadataValue(metadata, 'planItemKind', 'plan_item_kind'),
      relationRole: readMetadataValue(metadata, 'relationRole', 'relation_role'),
    })
}

function resolveExecutionNature(node: ChinaTemplateCatalogNode, metadata: Record<string, unknown>) {
  return normalizeExecutionNature(readMetadataValue(metadata, 'executionNature', 'execution_nature'))
    ?? inferExecutionNature({
      name: node.name,
      metadata,
      planItemKind: readMetadataValue(metadata, 'planItemKind', 'plan_item_kind'),
      relationRole: readMetadataValue(metadata, 'relationRole', 'relation_role'),
      durationContributionMode: readMetadataValue(metadata, 'durationContributionMode', 'duration_contribution_mode'),
    })
}

function resolveControlRoles(
  node: ChinaTemplateCatalogNode,
  metadata: Record<string, unknown>,
  catalogGroup: WbsTemplateCatalogGroup,
  durationContributionMode: DurationContributionMode,
  executionNature: ExecutionNature,
) {
  return inferControlRoles({
    name: node.name,
    metadata: {
      ...metadata,
      packType: metadata.packType ?? catalogGroup,
      durationContributionMode,
      executionNature,
    },
    packType: catalogGroup,
    planItemKind: readMetadataValue(metadata, 'planItemKind', 'plan_item_kind'),
    relationRole: readMetadataValue(metadata, 'relationRole', 'relation_role'),
    durationContributionMode,
    executionNature,
  })
}

function toCatalogSources(): CatalogSource[] {
  const main: CatalogSource = {
    catalogId: CHINA_GB55032_TEMPLATE_CATALOG.templateId,
    catalogName: CHINA_GB55032_TEMPLATE_CATALOG.templateName,
    catalogGroup: 'core_quality',
    divisions: CHINA_GB55032_TEMPLATE_CATALOG.divisions,
  }
  const domains = DOMAIN_WBS_TEMPLATE_CATALOGS.map((catalog: DomainWbsTemplateCatalog): CatalogSource => ({
    catalogId: catalog.templateId,
    catalogName: catalog.templateName,
    catalogGroup: catalog.packType ?? 'specialty',
    divisions: catalog.divisions,
  }))
  return [main, ...domains]
}

function walkCatalog(
  source: CatalogSource,
  node: ChinaTemplateCatalogNode,
  path: string[],
  entries: CatalogNodeEntry[],
  stableCodeIndex: Map<string, CatalogNodeEntry[]>,
) {
  const metadata = { ...(node.metadata ?? {}) }
  const durationContributionMode = resolveDurationContributionMode(node, metadata)
  const executionNature = resolveExecutionNature(node, metadata)
  const entry: CatalogNodeEntry = {
    catalogId: source.catalogId,
    catalogName: source.catalogName,
    catalogGroup: source.catalogGroup,
    stableCode: node.stableCode,
    name: node.name,
    categoryType: node.categoryType,
    path: [...path, node.stableCode].join('/'),
    metadata,
    durationContributionMode,
    executionNature,
    controlRoles: resolveControlRoles(node, metadata, source.catalogGroup, durationContributionMode, executionNature),
    declaredSemanticFieldCount: countDeclaredSemanticFields(metadata),
  }

  entries.push(entry)
  const codeEntries = stableCodeIndex.get(entry.stableCode) ?? []
  codeEntries.push(entry)
  stableCodeIndex.set(entry.stableCode, codeEntries)

  for (const child of node.children ?? []) {
    walkCatalog(source, child, [...path, node.stableCode], entries, stableCodeIndex)
  }
}

function collectEntries() {
  const entries: CatalogNodeEntry[] = []
  const stableCodeIndex = new Map<string, CatalogNodeEntry[]>()
  for (const source of toCatalogSources()) {
    for (const division of source.divisions) {
      walkCatalog(source, division, [source.catalogId], entries, stableCodeIndex)
    }
  }
  return { entries, stableCodeIndex }
}

const PROCESS_CATEGORIES = new Set<ChinaTemplateCategoryType>(['process', 'activity_step'])
const DEPENDENCY_ANCHOR_MODES = new Set<DurationContributionMode>(['duration_bearing', 'quality_gate', 'handover_marker'])

const STRONG_NON_PHYSICAL_TERMS = [
  '方案审批',
  '专项方案',
  '专家论证',
  '报审',
  '记录闭合',
  '资料归档',
  '资料组卷',
  '台账',
  '报告闭合',
  '签认',
  '会签',
  '清单',
]

const STRONG_PHYSICAL_TERMS = [
  '\u65bd\u5de5',
  '\u5b89\u88c5',
  '\u5236\u4f5c',
  '\u52a0\u5de5',
  '\u4e0b\u6599',
  '\u7ec4\u7acb',
  '\u6d47\u7b51',
  '\u632f\u6363',
  '\u7ed1\u624e',
  '\u652f\u8bbe',
  '\u642d\u8bbe',
  '\u6577\u8bbe',
  '\u540a\u88c5',
  '\u5f00\u6316',
  '\u56de\u586b',
  '\u780c\u7b51',
  '\u62b9\u7070',
  '\u94fa\u8d34',
  '\u94fa\u8bbe',
  '\u94fa\u88c5',
  '\u710a\u63a5',
  '\u70d8\u5e72',
  '\u6d82\u5237',
  '\u55b7\u6d82',
  '\u6253\u80f6',
  '\u5c01\u95ed',
  '\u5c01\u5835',
  '\u6e05\u7406',
  '\u8c03\u8bd5',
  '\u8054\u8c03',
  '\u8bd5\u8fd0\u8f6c',
  '\u8bd5\u8fd0\u884c',
  '\u8bd5\u538b',
  '\u51b2\u6d17',
  '\u6d88\u6bd2',
  '\u9632\u8150',
  '\u9664\u9508',
  '\u4fee\u8865',
  '\u704c\u6d46',
  '\u6ce8\u6d46',
  '\u538b\u704c',
  '\u63d0\u94bb',
  '\u5f20\u62c9',
  '\u538b\u6d46',
  '\u538b\u6869',
  '\u6c89\u6869',
  '\u690d\u7b4b',
  '\u517b\u62a4',
  '\u704c\u6c34\u8bd5\u9a8c',
  '\u6dcb\u6c34\u8bd5\u9a8c',
  '安装',
  '施工',
  '浇筑',
  '绑扎',
  '支设',
  '搭设',
  '敷设',
  '吊装',
  '开挖',
  '回填',
  '砌筑',
  '抹灰',
  '铺贴',
  '焊接',
  '涂刷',
  '喷涂',
  '打胶',
  '封堵',
  '清理',
  '处理',
  '调试',
  '试运行',
  '试压',
  '冲洗',
  '消毒',
]

const SAFETY_TERMS = ['危大', '高支模', '脚手架', '塔吊', '施工电梯', '临电', '临边', '洞口', '吊篮', '卸料平台', '动火']
const COMMERCIAL_TERMS = ['计量', '签证', '变更', '认价', '进度款', '结算', '索赔']
const DOCUMENT_TERMS = ['资料', '记录', '台账', '归档', '组卷', '报审', '报告']
const INSPECTION_TERMS = ['验收', '检测', '检查', '试验', '测试', '复验', '见证取样', '隐蔽', '探伤']

const COMMERCIAL_INTENT_TERMS = [
  '工程量计量',
  '月度计量',
  '形象进度计量',
  '计量申报',
  '计量支付',
  '计量结算',
  '计量台账',
  '签证',
  '变更',
  '认价',
  '进度款',
  '结算',
  '索赔',
]

const NON_COMMERCIAL_MEASUREMENT_CONTEXT_TERMS = [
  '计量安装',
  '计量点',
  '后台计量',
  '计量制备',
  '计量测试',
  '计量与告警',
  '水泥浆液配比和计量',
  '循环和计量',
  '容量和计量',
  '计量接入',
  '试营业结算测试',
  '结算测试',
  '需求变更控制台账',
  '需求变更控制台账建立',
  '原竣工图和变更资料',
  '原竣工图和变更资料收集',
]

const SAFETY_INTENT_TERMS = [
  '危大',
  '高支模',
  '脚手架',
  '塔吊',
  '施工电梯',
  '临电',
  '临边',
  '吊篮',
  '卸料平台',
  '动火',
  '防坠',
  '安全防护',
  '洞口防护',
  '洞口临边',
]

const NON_SAFETY_OPENING_CONTEXT_TERMS = [
  '洞口尺寸',
  '门窗洞口',
  '预留洞口',
  '现场洞口和接口',
  '洞口和接口',
  '洞口和接驳',
  '洞口控制线',
  '洞口收口',
  '洞口修补',
  '洞口加强',
  '天窗洞口',
  '卷帘洞口',
]

const PHYSICAL_SIGNAL_SUPPRESSION_TERMS = [
  '\u65bd\u5de5\u65b9\u6848',
  '\u4e13\u9879\u65bd\u5de5\u65b9\u6848',
  '\u65bd\u5de5\u7ec4\u7ec7\u8bbe\u8ba1',
  '\u65bd\u5de5\u56fe',
  '\u65bd\u5de5\u8bb8\u53ef',
  '\u65bd\u5de5\u8bb0\u5f55',
  '\u8fc7\u7a0b\u65bd\u5de5',
  '\u7279\u6b8a\u65bd\u5de5\u6cd5',
  '\u4f5c\u4e1a\u9762\u51c6\u5907',
  '\u65b9\u6848\u6216\u6761\u4ef6\u786e\u8ba4',
  '\u6392\u7248\u56fe\u786e\u8ba4',
  '\u5206\u683c\u7f1d\u534f\u8c03',
  '\u65b9\u6848\u7f16\u5236',
  '\u65b9\u6848\u5ba1\u6279',
  '\u65b9\u6848\u4ea4\u5e95',
  '\u5371\u5927\u5de5\u7a0b\u8bc6\u522b\u4e0e\u6e05\u5355\u786e\u8ba4',
  '\u89e6\u53d1\u6761\u4ef6\u6838\u67e5',
  '\u5371\u5927\u7c7b\u522b\u5206\u7ea7\u786e\u8ba4',
  '\u8d23\u4efb\u5355\u4f4d\u4f1a\u7b7e',
  '\u6e05\u5355\u7248\u672c\u786e\u8ba4',
  '\u6e05\u5355\u5f52\u6863',
  '\u4e13\u5bb6\u8bba\u8bc1\u7ec4\u7ec7\u4e0e\u610f\u89c1\u95ed\u5408',
  '\u8bba\u8bc1\u8d44\u6599\u51c6\u5907',
  '\u4e13\u5bb6\u7ec4\u7ec7\u548c\u4f1a\u8bae\u8bb0\u5f55',
  '\u8bba\u8bc1\u610f\u89c1\u63a5\u6536',
  '\u65b9\u6848\u4fee\u8ba2\u95ed\u5408',
  '\u8bba\u8bc1\u8d44\u6599\u5f52\u6863',
  '\u6280\u672f\u4ea4\u5e95',
  '\u8f6f\u4ef6\u7248\u672c\u548c\u8bb8\u53ef\u6838\u67e5',
  '\u65bd\u5de5\u534f\u8c03\u7a97\u53e3\u786e\u8ba4',
  '\u5b89\u88c5\u9a8c\u6536',
  '\u73ed\u7ec4\u81ea\u68c0\u8bb0\u5f55',
  '\u8d28\u91cf\u81ea\u68c0\u8bb0\u5f55',
  '\u9a8c\u6536\u8bb0\u5f55',
  '\u68c0\u67e5\u8bb0\u5f55',
  '\u8bb0\u5f55\u7b7e\u8ba4',
  '\u7b7e\u8ba4\u5f52\u6863',
  '\u62a5\u544a\u7b7e\u8ba4',
  '\u8d44\u6599\u62a5\u544a',
  '\u6e05\u5355\u5f62\u6210',
  '\u95ee\u9898\u6574\u6539\u95ed\u5408\u548c\u62a5\u544a',
  '\u6574\u6539\u95ed\u5408\u548c\u62a5\u544a',
  '\u95ee\u9898\u6574\u6539\u95ed\u5408',
  '\u6e17\u6f0f\u6574\u6539\u95ed\u5408',
  '\u7f3a\u9677\u6574\u6539\u95ed\u5408',
  '\u95ee\u9898\u6e05\u5355\u6838\u67e5',
  '\u73b0\u573a\u590d\u67e5\u590d\u6d4b',
  '\u6574\u6539\u8d23\u4efb\u786e\u8ba4',
  '\u95ed\u5408\u7b7e\u8ba4',
  '\u95ee\u9898\u9500\u9879',
  '\u95ee\u9898\u6e05\u5355\u95ed\u5408',
  '\u7ae3\u5de5\u56fe\u540c\u6b65',
  '\u7ae3\u5de5\u56fe\u7eb8\u7ed8\u5236',
  '\u7ae3\u5de5\u56fe\u7ed8\u5236',
  '\u6807\u8bc6\u6807\u7b7e\u548c\u7ae3\u5de5\u56fe\u7ed8\u5236',
  '\u88c5\u7bb1\u6e05\u5355\u548c\u5408\u683c\u6587\u4ef6\u6838\u67e5',
  '\u65bd\u5de5\u53c2\u6570\u8bb0\u5f55',
  '\u9a8c\u6536\u6d4b\u8bd5\u6267\u884c\u548c\u8fc7\u7a0b\u8bb0\u5f55',
]

const PHYSICAL_CONTEXT_ONLY_TERMS = [
  '\u65bd\u5de5\u65b9\u6848',
  '\u4e13\u9879\u65bd\u5de5\u65b9\u6848',
  '\u65bd\u5de5\u56fe',
  '\u65bd\u5de5\u8bb8\u53ef',
  '\u65bd\u5de5\u51c6\u5907',
  '\u65bd\u5de5\u53c2\u6570',
  '\u65bd\u5de5\u534f\u8c03',
  '\u65bd\u5de5\u8bb0\u5f55',
  '\u8fc7\u7a0b\u65bd\u5de5',
  '\u7279\u6b8a\u65bd\u5de5\u6cd5',
  '\u4f5c\u4e1a\u9762\u51c6\u5907',
  '\u65b9\u6848\u6216\u6761\u4ef6\u786e\u8ba4',
  '\u6e05\u5355\u5f62\u6210',
]

function stripParentheticalContext(text: string) {
  return text.replace(/[\uFF08(][^\uFF09)]*[\uFF09)]/g, '')
}

function removeTerms(text: string, terms: string[]) {
  return terms.reduce((current, term) => current.split(term).join(''), text)
}

function hasDirectPhysicalSignal(text: string) {
  const primaryText = stripParentheticalContext(text)
  const suppressedText = removeTerms(
    primaryText,
    PHYSICAL_SIGNAL_SUPPRESSION_TERMS.filter((term) => !PHYSICAL_CONTEXT_ONLY_TERMS.includes(term)),
  )
  return includesAny(removeTerms(suppressedText, PHYSICAL_CONTEXT_ONLY_TERMS), STRONG_PHYSICAL_TERMS)
}

function hasCommercialControlIntent(text: string) {
  const primaryText = stripParentheticalContext(text)
  return includesAny(primaryText, COMMERCIAL_INTENT_TERMS)
    && !includesAny(primaryText, NON_COMMERCIAL_MEASUREMENT_CONTEXT_TERMS)
}

function hasSafetyControlIntent(text: string) {
  const primaryText = stripParentheticalContext(text)
  if (includesAny(primaryText, SAFETY_INTENT_TERMS)) return true
  if (!primaryText.includes('洞口')) return false
  return !includesAny(primaryText, NON_SAFETY_OPENING_CONTEXT_TERMS)
}

function pushFinding(
  findings: WbsSeedSemanticGovernanceFinding[],
  entry: CatalogNodeEntry,
  severity: GovernanceSeverity,
  ruleCode: string,
  title: string,
  reason: string,
  recommendedAction: string,
  relatedCode?: string,
) {
  findings.push({
    severity,
    ruleCode,
    title,
    catalogId: entry.catalogId,
    catalogGroup: entry.catalogGroup,
    stableCode: entry.stableCode,
    name: entry.name,
    categoryType: entry.categoryType,
    path: entry.path,
    durationContributionMode: entry.durationContributionMode,
    executionNature: entry.executionNature,
    reason,
    recommendedAction,
    relatedCode,
  })
}

function addSemanticFindings(entries: CatalogNodeEntry[], findings: WbsSeedSemanticGovernanceFinding[]) {
  for (const entry of entries) {
    if (!PROCESS_CATEGORIES.has(entry.categoryType)) continue
    const text = entry.name
    const primaryText = stripParentheticalContext(text)
    const hasStrongPhysical = hasDirectPhysicalSignal(text)
    const hasStrongNonPhysical = includesAny(primaryText, STRONG_NON_PHYSICAL_TERMS)

    if (entry.declaredSemanticFieldCount < 8) {
      pushFinding(
        findings,
        entry,
        'P2',
        'semantic_fields_inferred_not_declared',
        'Semantic fields are partly inferred at runtime.',
        `Declared semantic fields: ${entry.declaredSemanticFieldCount}/8.`,
        'Prefer writing the inferred values back to the seed only after sample review; do not broaden keyword rules just to remove this finding.',
      )
    }

    if (entry.executionNature === 'physical_work' && hasStrongNonPhysical && !hasStrongPhysical) {
      pushFinding(
        findings,
        entry,
        'P0',
        'non_physical_text_marked_physical',
        'Likely non-physical row is marked as physical_work.',
        'The row name is dominated by approval/document/record terms and has no direct construction action term.',
        'Change executionNature away from physical_work, then set durationContributionMode to record_only, external_wait, quality_gate, or handover_marker as appropriate.',
      )
    }

    if (
      hasStrongPhysical
      && entry.durationContributionMode === 'duration_bearing'
      && entry.executionNature !== 'monitoring_wait'
      && entry.executionNature !== 'physical_work'
      && entry.executionNature !== 'technical_preparation'
    ) {
      pushFinding(
        findings,
        entry,
        'P1',
        'physical_action_not_physical_nature',
        'Physical action wording is not classified as physical_work.',
        'The row name contains direct site action terms, but executionNature is not physical_work or technical_preparation.',
        'Sample-review whether the row changes a site entity directly; if yes, promote executionNature to physical_work and keep quality/safety roles as cross-cut roles.',
      )
    }

    if (
      entry.durationContributionMode === 'duration_bearing'
      && ['document_record', 'management_action', 'handover_milestone'].includes(entry.executionNature)
    ) {
      pushFinding(
        findings,
        entry,
        'P1',
        'non_physical_duration_anchor_review',
        'Non-physical row still contributes normal duration.',
        'Duration-bearing rows feed duration family matching and dependency anchoring; non-physical rows can pollute schedule rules.',
        'Review whether this is an actual project-control task that should bear duration. Otherwise switch to record_only, external_wait, quality_gate, or handover_marker.',
      )
    }

    if (
      entry.executionNature === 'physical_work'
      && (entry.durationContributionMode === 'record_only'
        || entry.durationContributionMode === 'external_wait'
        || entry.durationContributionMode === 'handover_marker')
    ) {
      pushFinding(
        findings,
        entry,
        'P1',
        'physical_work_non_anchor_review',
        'Physical work is excluded from normal duration anchoring.',
        'Rows that directly change site entities usually need duration-bearing or quality-gate behavior.',
        'Keep non-anchor mode only if this is a projected/record row; otherwise switch to duration_bearing or quality_gate.',
      )
    }

    if (
      entry.durationContributionMode === 'quality_gate'
      && entry.controlRoles.qualityControlRole === 'none'
      && entry.controlRoles.inspectionAcceptanceRole === 'none'
      && entry.controlRoles.safetyControlRole === 'none'
      && entry.controlRoles.managementControlRole === 'none'
      && entry.controlRoles.documentEvidenceRole === 'none'
    ) {
      pushFinding(
        findings,
        entry,
        'P1',
        'quality_gate_without_quality_role',
        'Quality-gate row lacks quality or inspection role.',
        'The row is excluded from normal duration but can anchor dependencies, so the control role must explain why.',
        'Set qualityControlRole or inspectionAcceptanceRole after sample review.',
      )
    }

    if (
      entry.executionNature === 'document_record'
      && entry.controlRoles.documentEvidenceRole === 'none'
      && entry.controlRoles.commercialControlRole === 'none'
    ) {
      pushFinding(
        findings,
        entry,
        'P1',
        'document_record_without_evidence_role',
        'Document-record row lacks document evidence role.',
        'Document rows need evidence semantics for preview, filters, and progress interaction.',
        'Set documentEvidenceRole to the closest evidence type.',
      )
    }

    if (hasSafetyControlIntent(text) && entry.controlRoles.safetyControlRole === 'none') {
      pushFinding(
        findings,
        entry,
        'P1',
        'safety_text_without_safety_role',
        'Safety wording lacks safety control role.',
        'The row name contains safety/hazardous-work terms but no safetyControlRole.',
        'Set safetyControlRole without changing physical_work unless the row is not a real site operation.',
      )
    }

    if (hasCommercialControlIntent(text) && entry.controlRoles.commercialControlRole === 'none') {
      pushFinding(
        findings,
        entry,
        'P1',
        'commercial_text_without_commercial_role',
        'Commercial wording lacks commercial control role.',
        'The row name contains commercial-control terms but no commercialControlRole.',
        'Set commercialControlRole and keep durationContributionMode as record_only unless this is a real work task.',
      )
    }

    if (
      includesAny(text, DOCUMENT_TERMS)
      && entry.controlRoles.documentEvidenceRole === 'none'
      && entry.executionNature !== 'physical_work'
    ) {
      pushFinding(
        findings,
        entry,
        'P2',
        'document_text_without_evidence_role',
        'Document wording lacks evidence role.',
        'This is a low-risk review item because physical rows may mention records as a deliverable.',
        'Review only if this appears repeatedly in P0/P1 sampling.',
      )
    }

    if (
      includesAny(text, INSPECTION_TERMS)
      && entry.controlRoles.inspectionAcceptanceRole === 'none'
      && entry.executionNature !== 'physical_work'
    ) {
      pushFinding(
        findings,
        entry,
        'P2',
        'inspection_text_without_acceptance_role',
        'Inspection wording lacks inspection role.',
        'This can weaken preview grouping and progress interaction for non-physical rows.',
        'Assign inspectionAcceptanceRole after sample review.',
      )
    }
  }
}

function readReferenceCodes(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeText).filter(Boolean))]
  const text = normalizeText(value)
  return text ? [...new Set(text.split(/[,\s]+/).map(normalizeText).filter(Boolean))] : []
}

function referenceHasPrefixMatches(code: string, stableCodeIndex: Map<string, CatalogNodeEntry[]>) {
  return Array.from(stableCodeIndex.keys()).some((stableCode) => stableCode.startsWith(`${code}-`))
}

function addReferenceFindings(
  entries: CatalogNodeEntry[],
  stableCodeIndex: Map<string, CatalogNodeEntry[]>,
  findings: WbsSeedSemanticGovernanceFinding[],
) {
  for (const entry of entries) {
    if (!PROCESS_CATEGORIES.has(entry.categoryType)) continue
    for (const { field } of DEPENDENCY_INTENT_REFERENCE_FIELDS) {
      for (const code of readReferenceCodes(entry.metadata[field])) {
        const exactTargets = stableCodeIndex.get(code) ?? []
        if (exactTargets.length === 0) {
          pushFinding(
            findings,
            entry,
            referenceHasPrefixMatches(code, stableCodeIndex) ? 'P2' : 'P1',
            referenceHasPrefixMatches(code, stableCodeIndex) ? 'broad_reference_not_exact_target' : 'unresolved_dependency_reference',
            referenceHasPrefixMatches(code, stableCodeIndex)
              ? 'Dependency reference points to a broad catalog prefix.'
              : 'Dependency reference has no exact target in seed catalogs.',
            referenceHasPrefixMatches(code, stableCodeIndex)
              ? 'Runtime dependency intent matching is exact; broad prefixes should be expanded to concrete anchor codes when the relation is meant to create a dependency.'
              : 'This reference will not bind. Correct the stable code or remove the reference.',
            referenceHasPrefixMatches(code, stableCodeIndex)
              ? 'Keep broad references only as semantic links; use exact process codes for confirmed_template_only dependencies.'
              : 'Fix the referenced stable code before treating this dependency as confirmed.',
            code,
          )
          continue
        }

        const processTargets = exactTargets.filter((target) => PROCESS_CATEGORIES.has(target.categoryType))
        if (processTargets.length === 0) {
          pushFinding(
            findings,
            entry,
            'P2',
            'reference_targets_non_process_node',
            'Dependency reference targets a non-process catalog node.',
            'The reference resolves to a division/sub-division/item-work node rather than a concrete process or activity step.',
            'Use this only as a semantic link. For executable dependencies, point to concrete process/activity-step stable codes.',
            code,
          )
          continue
        }

        for (const target of processTargets) {
          if (!DEPENDENCY_ANCHOR_MODES.has(target.durationContributionMode)) {
            pushFinding(
              findings,
              entry,
              'P1',
              'reference_target_not_dependency_anchor',
              'Dependency reference target is suppressed by anchor policy.',
              `Referenced target ${target.stableCode} has durationContributionMode=${target.durationContributionMode}.`,
              'Either keep the link as semantic-only or point the dependency intent to a duration_bearing, quality_gate, or handover_marker target.',
              code,
            )
          }
        }
      }
    }
  }
}

function severityRank(severity: GovernanceSeverity) {
  if (severity === 'P0') return 0
  if (severity === 'P1') return 1
  return 2
}

function sortFindings(findings: WbsSeedSemanticGovernanceFinding[]) {
  return findings.sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.catalogGroup.localeCompare(right.catalogGroup)
    || left.ruleCode.localeCompare(right.ruleCode)
    || left.stableCode.localeCompare(right.stableCode)
  ))
}

function summarizeFindings(findings: WbsSeedSemanticGovernanceFinding[]) {
  const bySeverity: Record<GovernanceSeverity, number> = { P0: 0, P1: 0, P2: 0 }
  const byRuleCode: CountMap = {}
  const byCatalogGroup: CountMap = {}
  for (const finding of findings) {
    bySeverity[finding.severity] += 1
    bumpCount(byRuleCode, finding.ruleCode)
    bumpCount(byCatalogGroup, finding.catalogGroup)
  }
  return {
    total: findings.length,
    bySeverity,
    byRuleCode: sortCountMap(byRuleCode),
    byCatalogGroup: sortCountMap(byCatalogGroup),
  }
}

function summarizeEntries(entries: CatalogNodeEntry[]) {
  const processEntries = entries.filter((entry) => PROCESS_CATEGORIES.has(entry.categoryType))
  const byCatalogGroup: CountMap = {}
  const byDurationContributionMode: CountMap = {}
  const byExecutionNature: CountMap = {}
  const byCategoryType: CountMap = {}
  const byQualityControlRole: CountMap = {}
  const bySafetyControlRole: CountMap = {}
  const byInspectionAcceptanceRole: CountMap = {}
  const byDocumentEvidenceRole: CountMap = {}
  const byCommercialControlRole: CountMap = {}
  const byManagementControlRole: CountMap = {}
  let fullyDeclaredSemanticFieldCount = 0
  for (const entry of processEntries) {
    bumpCount(byCatalogGroup, entry.catalogGroup)
    bumpCount(byDurationContributionMode, entry.durationContributionMode)
    bumpCount(byExecutionNature, entry.executionNature)
    bumpCount(byCategoryType, entry.categoryType)
    bumpCount(byQualityControlRole, entry.controlRoles.qualityControlRole)
    bumpCount(bySafetyControlRole, entry.controlRoles.safetyControlRole)
    bumpCount(byInspectionAcceptanceRole, entry.controlRoles.inspectionAcceptanceRole)
    bumpCount(byDocumentEvidenceRole, entry.controlRoles.documentEvidenceRole)
    bumpCount(byCommercialControlRole, entry.controlRoles.commercialControlRole)
    bumpCount(byManagementControlRole, entry.controlRoles.managementControlRole)
    if (entry.declaredSemanticFieldCount >= 8) fullyDeclaredSemanticFieldCount += 1
  }
  return {
    totalCatalogNodes: entries.length,
    totalProcessLikeNodes: processEntries.length,
    fullyDeclaredSemanticFieldCount,
    inferredSemanticFieldCount: processEntries.length - fullyDeclaredSemanticFieldCount,
    byCatalogGroup: sortCountMap(byCatalogGroup),
    byCategoryType: sortCountMap(byCategoryType),
    byDurationContributionMode: sortCountMap(byDurationContributionMode),
    byExecutionNature: sortCountMap(byExecutionNature),
    byControlRole: {
      qualityControlRole: sortCountMap(byQualityControlRole) as Record<QualityControlRole, number>,
      safetyControlRole: sortCountMap(bySafetyControlRole) as Record<SafetyControlRole, number>,
      inspectionAcceptanceRole: sortCountMap(byInspectionAcceptanceRole) as Record<InspectionAcceptanceRole, number>,
      documentEvidenceRole: sortCountMap(byDocumentEvidenceRole) as Record<DocumentEvidenceRole, number>,
      commercialControlRole: sortCountMap(byCommercialControlRole) as Record<CommercialControlRole, number>,
      managementControlRole: sortCountMap(byManagementControlRole) as Record<ManagementControlRole, number>,
    },
  }
}

function buildSamplingBuckets(findings: WbsSeedSemanticGovernanceFinding[], sampleLimit: number) {
  const buckets = new Map<string, WbsSeedSemanticGovernanceFinding[]>()
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.catalogGroup}:${finding.ruleCode}`
    const bucket = buckets.get(key) ?? []
    if (bucket.length < sampleLimit) bucket.push(finding)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.entries()).map(([key, items]) => {
    const [severity, catalogGroup, ruleCode] = key.split(':') as [GovernanceSeverity, WbsTemplateCatalogGroup, string]
    return {
      severity,
      catalogGroup,
      ruleCode,
      sampleCount: items.length,
      samples: items,
    }
  })
}

export function collectWbsSeedSemanticGovernanceReport(options: {
  limit?: number
  sampleLimit?: number
} = {}) {
  const limit = limitNumber(options.limit, 50, 500)
  const sampleLimit = limitNumber(options.sampleLimit, 5, 50)
  const { entries, stableCodeIndex } = collectEntries()
  const findings: WbsSeedSemanticGovernanceFinding[] = []
  const businessTypeRegistryAudit = auditBusinessTypeRegistry()

  addSemanticFindings(entries, findings)
  addReferenceFindings(entries, stableCodeIndex, findings)
  sortFindings(findings)

  const summary = summarizeEntries(entries)
  const findingSummary = summarizeFindings(findings)
  const p0Findings = findings.filter((finding) => finding.severity === 'P0')
  const p1Findings = findings.filter((finding) => finding.severity === 'P1')
  const p2Findings = findings.filter((finding) => finding.severity === 'P2')

  return {
    generatedAt: new Date().toISOString(),
    reportCode: 'wbs_seed_semantic_precision_governance',
    version: 'v1.4.22.3',
    scope: 'china_gb55032_core_quality_and_domain_wbs_template_catalogs_process_activity_steps',
    purpose: 'Detect likely semantic inference errors before they pollute duration seeds, dependency anchors, shared plan tree display, preview grouping, filters, and progress interaction.',
    businessTypeRegistryAudit,
    summary: {
      ...summary,
      findings: findingSummary,
      p0Open: p0Findings.length,
      p1Open: p1Findings.length,
      p2Open: p2Findings.length,
    },
    governancePolicy: {
      broadKeywordRuleExpansionAllowed: false,
      projectFeedbackDirectlyMutatesSeed: false,
      projectFeedbackCreatesCandidateOnly: true,
      p0BlocksSeedRelease: true,
      p1RequiresSamplingBeforeRuleChange: true,
      p2IsBacklogOrSemanticLinkReview: true,
      physicalWorkDecisionSource: 'executionNature_only',
      physicalWorkDefinition: 'A physical row directly constructs, installs, treats, tests, commissions, or otherwise changes a site entity. Cross-cut quality, safety, evidence, commercial, and management roles do not override this decision.',
      dependencyAnchorModes: Array.from(DEPENDENCY_ANCHOR_MODES),
      durationPollutionIsolation: 'Only duration_bearing rows should feed normal duration family matching; quality_gate/handover_marker can anchor dependencies; record_only/external_wait/embedded_check should not anchor confirmed dependency intents.',
    },
    samplingPlan: {
      cadence: 'after_seed_change_or_monthly_project_closeout_feedback',
      p0Policy: 'review_all_and_fix_before_release',
      p1Policy: 'sample_by_catalog_group_and_rule_code_before_changing_rules',
      p2Policy: 'keep_as_backlog_unless_repeated_by_project_feedback',
      deterministicBucketKey: 'severity:catalogGroup:ruleCode',
      perBucketSampleLimit: sampleLimit,
    },
    findings: findings.slice(0, limit),
    p0Findings: p0Findings.slice(0, limit),
    p1Findings: p1Findings.slice(0, limit),
    p2Findings: p2Findings.slice(0, limit),
    samplingBuckets: buildSamplingBuckets(findings, sampleLimit).slice(0, limit),
  }
}

export type PersistWbsSeedSemanticGovernanceCandidateEventsInput = {
  companyId?: string | null
  projectId?: string | null
  maxCandidates?: number
  report?: ReturnType<typeof collectWbsSeedSemanticGovernanceReport>
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export async function persistWbsSeedSemanticGovernanceCandidateEvents(
  input: PersistWbsSeedSemanticGovernanceCandidateEventsInput = {},
) {
  const maxCandidates = limitNumber(input.maxCandidates, 10, 100)
  const report = input.report ?? collectWbsSeedSemanticGovernanceReport({
    limit: maxCandidates,
    sampleLimit: Math.min(maxCandidates, 10),
  })
  const findings = report.findings
    .filter((finding) => finding.severity === 'P0' || finding.severity === 'P1')
    .slice(0, maxCandidates)

  const persistedEvents = []
  for (const finding of findings) {
    const result = await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `wbs.semantic.${finding.catalogId}.${finding.stableCode}.${finding.ruleCode}`,
      sourceSystem: 'wbsSeedSemanticGovernanceService',
      assetType: 'template',
      companyId: input.companyId,
      projectId: input.projectId,
      candidatePayload: {
        reportCode: report.reportCode,
        reportVersion: report.version,
        reportScope: report.scope,
        generatedAt: report.generatedAt,
        businessTypeRegistryAudit: report.businessTypeRegistryAudit,
        finding,
        summary: report.summary.findings,
        governancePolicy: report.governancePolicy,
      },
      learningTarget: 'template_structure',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      evidence: {
        singleCandidateOnly: true,
      },
      queryExec: input.queryExec,
    })
    persistedEvents.push(result)
  }

  return {
    report,
    persistedEvents,
    persistedEventCount: persistedEvents.length,
  }
}
