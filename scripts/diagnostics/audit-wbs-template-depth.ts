import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  type ChinaTemplateCatalog,
  type ChinaTemplateCatalogNode,
} from '../../server/src/seeds/chinaGb50300TemplateCatalog.ts'
import {
  DOMAIN_WBS_TEMPLATE_CATALOGS,
  type WbsTemplateCatalogGroup,
} from '../../server/src/seeds/domainWbsTemplateCatalogs.ts'

type CatalogLike = ChinaTemplateCatalog & {
  packType?: WbsTemplateCatalogGroup
  templateGroup?: string
  generationPolicy?: string
}

type Severity = 'P0' | 'P1' | 'P2'

type Finding = {
  severity: Severity
  ruleCode: string
  catalogId: string
  catalogGroup: string
  templateGroup: string
  stableCode: string
  name: string
  categoryType: string
  path: string
  message: string
  recommendation: string
  metrics?: Record<string, unknown>
}

type NodeEntry = {
  catalog: CatalogLike
  catalogGroup: string
  templateGroup: string
  node: ChinaTemplateCatalogNode
  parent: ChinaTemplateCatalogNode | null
  path: string
}

const COMPLEX_ITEM_TERMS = [
  '幕墙',
  '钢结构',
  '消防',
  '喷淋',
  '消火栓',
  '火灾',
  '报警',
  '电梯',
  '智能',
  '弱电',
  '空调',
  '通风',
  '防排烟',
  '给水',
  '排水',
  '供暖',
  '电气',
  '配电',
  '电缆',
  '桥架',
  '母线',
  '装配式',
  '预制',
  '套筒',
  '人防',
  '洁净',
  '医疗',
  '基坑',
  '桩',
  '防水',
  '保温',
  '屋面',
  '地下',
  '吊顶',
  '精装',
  '机房',
]

const VERY_COMPLEX_ITEM_TERMS = [
  '消防',
  '火灾自动报警',
  '电梯',
  '幕墙',
  '钢结构',
  '装配式',
  '洁净',
  '人防',
  '深基坑',
  '人工挖孔',
  '数据中心',
  '系统调试',
  '联动调试',
]

const COMPLEX_PROCESS_TERMS = [
  '调试',
  '联调',
  '试运行',
  '系统',
  '安装',
  '吊装',
  '焊接',
  '无损检测',
  '防火封堵',
  '防雷',
  '防腐',
  '防火涂料',
  '防水',
  '保温',
  '灌浆',
  '张拉',
  '压浆',
  '成孔',
  '沉桩',
  '喷桩',
  '注浆',
  '配电',
  '电缆',
  '桥架',
  '母线',
  '风管',
  '管道',
  '阀门',
  '消防',
  '电梯',
  '幕墙',
  '洁净',
  '人防',
]

const GENERIC_PROCESS_TERMS = [
  '施工或安装',
  '准备与交底',
  '自检整改与验收',
  '施工准备',
  '资料整理',
  '验收',
  '检查',
  '确认',
]

const ENGLISH_PLACEHOLDER_WORKFLOW_TERMS = [
  /\breadiness review\b/i,
  /\binstallation work\b/i,
  /\bmaterial and equipment receiving installation\b/i,
  /\bprimary civil or structural construction\b/i,
  /\bMEP and intelligent-system installation\b/i,
  /\bcommissioning, function-test\b/i,
  /\bdefect closeout work\b/i,
  /\bcloseout work\b/i,
  /\bcloseout\b/i,
  /\bretest work\b/i,
  /\bcorrection work\b/i,
  /\bacceptance handover\b/i,
  /\brunbook signoff\b/i,
  /\boperation-interface signoff\b/i,
  /\bsignoff\b/i,
  /\bwork\b/i,
]

const REQUIRED_CONTROL_ROLE_KEYS = [
  'qualityControlRole',
  'safetyControlRole',
  'inspectionAcceptanceRole',
  'documentEvidenceRole',
  'commercialControlRole',
  'managementControlRole',
]

const REAL_PROJECT_NATIVE_DEPTH_TARGETS: Record<string, { targetItemPacks: number; label: string }> = {
  'china-foundation-pit-pile': { targetItemPacks: 36, label: 'L 深基坑 / 桩基地基' },
  'china-prefabricated-assembly': { targetItemPacks: 33, label: 'B 装配式住宅' },
  'china-cleanroom-medical-specialty': { targetItemPacks: 45, label: 'C 三甲医院' },
  'china-data-center-specialty': { targetItemPacks: 38, label: 'D 数据中心 IDC' },
  'china-industrial-cleanroom-specialty': { targetItemPacks: 42, label: 'E 工业洁净厂房' },
  'china-steel-structure-specialty': { targetItemPacks: 34, label: 'F 钢结构大跨度公建' },
  'china-renovation-retrofit-specialty': { targetItemPacks: 32, label: 'G 既有改造' },
  'china-heritage-preservation-specialty': { targetItemPacks: 22, label: 'G 文保修缮' },
  'china-campus-specialty': { targetItemPacks: 38, label: 'H 校园' },
  'china-tod-upper-cover-specialty': { targetItemPacks: 30, label: 'I TOD 上盖' },
  'china-modular-mic-specialty': { targetItemPacks: 32, label: 'J MiC 模块化' },
  'china-prefab-bathroom-specialty': { targetItemPacks: 9, label: 'J 整体卫浴 IBU' },
  'china-prefab-kitchen-specialty': { targetItemPacks: 9, label: 'J 集成厨房 IKU' },
  'china-hotel-specialty': { targetItemPacks: 38, label: 'K 酒店综合体' },
  'china-airport-terminal-specialty': { targetItemPacks: 18, label: 'M 机场航站楼' },
  'china-port-terminal-specialty': { targetItemPacks: 18, label: 'N 港口码头' },
  'china-bridge-specialty': { targetItemPacks: 18, label: 'O 桥梁工程' },
  'china-renewable-energy-specialty': { targetItemPacks: 21, label: 'P 光伏风电储能电站' },
  'china-ultra-high-rise-specialty': { targetItemPacks: 18, label: 'Q 超高层建筑' },
  'china-utility-tunnel-specialty': { targetItemPacks: 18, label: 'R 地下综合管廊' },
}

const REAL_PROJECT_NATIVE_PROCESS_DEPTH_CATALOGS = new Set([
  'china-foundation-pit-pile',
  'china-prefabricated-assembly',
  'china-cleanroom-medical-specialty',
  'china-data-center-specialty',
  'china-industrial-cleanroom-specialty',
  'china-steel-structure-specialty',
  'china-renovation-retrofit-specialty',
  'china-heritage-preservation-specialty',
  'china-campus-specialty',
  'china-tod-upper-cover-specialty',
  'china-modular-mic-specialty',
  'china-prefab-bathroom-specialty',
  'china-prefab-kitchen-specialty',
  'china-hotel-specialty',
  'china-airport-terminal-specialty',
  'china-port-terminal-specialty',
  'china-bridge-specialty',
  'china-renewable-energy-specialty',
  'china-ultra-high-rise-specialty',
  'china-utility-tunnel-specialty',
])

const NATIVE_PROCESS_DEPTH_SOURCE = 'native_differentiated_real_project_processes'
const NATIVE_SCHEDULABLE_PROCESS_MINIMUM = 8
const NATIVE_SCHEDULABLE_FIELD_DURATION_ANCHOR_MINIMUM = 3

function getCatalogGroup(catalog: CatalogLike) {
  return catalog.packType ?? 'core_quality'
}

function getTemplateGroup(catalog: CatalogLike) {
  return catalog.templateGroup ?? 'building_main'
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function hasChineseFieldAnchor(text: string) {
  return /\p{Script=Han}/u.test(text)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function hasAnyMetadataArray(metadata: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => readStringArray(metadata[key]).length > 0)
}

function codeMatchesReplacementCode(stableCode: string, replacementCode: string) {
  const code = String(stableCode ?? '').trim()
  const replacement = String(replacementCode ?? '').trim()
  return Boolean(code && replacement && (code === replacement || code.startsWith(`${replacement}-`)))
}

function walkCatalog(catalog: CatalogLike): NodeEntry[] {
  const entries: NodeEntry[] = []
  const visit = (node: ChinaTemplateCatalogNode, parent: ChinaTemplateCatalogNode | null, parentPath: string) => {
    const path = parentPath ? `${parentPath} / ${node.stableCode} ${node.name}` : `${node.stableCode} ${node.name}`
    entries.push({
      catalog,
      catalogGroup: getCatalogGroup(catalog),
      templateGroup: getTemplateGroup(catalog),
      node,
      parent,
      path,
    })
    for (const child of node.children ?? []) visit(child, node, path)
  }
  for (const division of catalog.divisions) visit(division, null, '')
  return entries
}

function countChildren(node: ChinaTemplateCatalogNode, categoryType: string) {
  return (node.children ?? []).filter((child) => child.categoryType === categoryType).length
}

function isFormalItemPack(node: ChinaTemplateCatalogNode) {
  return node.categoryType === 'item_work'
    && !node.stableCode.includes('-90')
    && node.metadata?.coverageSupplement !== true
}

function countFieldDurationAnchorProcesses(node: ChinaTemplateCatalogNode) {
  return (node.children ?? []).filter((child) => (
    child.categoryType === 'process'
    && child.metadata?.durationContributionMode === 'duration_bearing'
    && child.metadata?.processDepthRole === 'field_duration_work'
  )).length
}

function isNativeSchedulableItemPack(node: ChinaTemplateCatalogNode) {
  return countChildren(node, 'process') >= NATIVE_SCHEDULABLE_PROCESS_MINIMUM
    && countFieldDurationAnchorProcesses(node) >= NATIVE_SCHEDULABLE_FIELD_DURATION_ANCHOR_MINIMUM
}

function processSignature(node: ChinaTemplateCatalogNode) {
  return (node.children ?? [])
    .filter((child) => child.categoryType === 'process')
    .map((child) => child.name)
    .join('|')
}

function normalizedProcessTokens(node: ChinaTemplateCatalogNode) {
  const stopTokens = [
    node.name,
    ...node.name.split(/[\/\s（）()、与和及]/).filter((part) => part.length >= 2),
  ]
  return (node.children ?? [])
    .filter((child) => child.categoryType === 'process')
    .flatMap((child) => child.name
      .replace(/[A-Za-z0-9]+/g, ' ')
      .split(/[、，,。；;\/\s（）()]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !stopTokens.some((stopToken) => stopToken && token.includes(stopToken))),
    )
}

function jaccardSimilarity(left: string[], right: string[]) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size === 0 || rightSet.size === 0) return 0
  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1
  }
  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 0 : intersection / union
}

function isActiveLegacyCoverageSupplementNode(node: ChinaTemplateCatalogNode) {
  const metadata = node.metadata ?? {}
  return node.stableCode.includes('-90')
    || metadata.coverageSupplement === true
}

function severityRank(severity: Severity) {
  if (severity === 'P0') return 0
  if (severity === 'P1') return 1
  return 2
}

function expectedProcessCount(node: ChinaTemplateCatalogNode, catalogGroup: string) {
  const name = node.name
  if (catalogGroup === 'project_milestone') return 1
  if (includesAny(name, VERY_COMPLEX_ITEM_TERMS)) return 6
  if (includesAny(name, COMPLEX_ITEM_TERMS)) return 5
  return 3
}

function expectedStepCount(node: ChinaTemplateCatalogNode) {
  const metadata = node.metadata ?? {}
  const mode = String(metadata.durationContributionMode ?? metadata.duration_contribution_mode ?? '')
  if (mode !== 'duration_bearing') return 1
  if (includesAny(node.name, VERY_COMPLEX_ITEM_TERMS)) return 5
  if (includesAny(node.name, COMPLEX_PROCESS_TERMS)) return 4
  return 2
}

function addFinding(findings: Finding[], entry: NodeEntry, finding: Omit<Finding, 'catalogId' | 'catalogGroup' | 'templateGroup' | 'stableCode' | 'name' | 'categoryType' | 'path'>) {
  findings.push({
    catalogId: entry.catalog.templateId,
    catalogGroup: entry.catalogGroup,
    templateGroup: entry.templateGroup,
    stableCode: entry.node.stableCode,
    name: entry.node.name,
    categoryType: entry.node.categoryType,
    path: entry.path,
    ...finding,
  })
}

function summarizeBy<T extends string>(items: Finding[], selector: (item: Finding) => T) {
  return items.reduce<Record<T, number>>((acc, item) => {
    const key = selector(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
}

function audit() {
  const catalogs: CatalogLike[] = [
    CHINA_GB55032_TEMPLATE_CATALOG,
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const entries = catalogs.flatMap(walkCatalog)
  const processLikeEntries = entries.filter((entry) => (
    entry.node.categoryType === 'process' || entry.node.categoryType === 'activity_step'
  ))
  const coreProcesses = entries.filter((entry) => (
    entry.catalogGroup === 'core_quality' && entry.node.categoryType === 'process'
  ))
  const coreProcessNames = new Set(coreProcesses.map((entry) => entry.node.name))
  const coreReplacementTargetEntries = entries.filter((entry) => (
    entry.catalogGroup === 'core_quality'
    && ['division', 'sub_division', 'item_work', 'process', 'activity_step'].includes(entry.node.categoryType)
  ))
  const findings: Finding[] = []
  const nativeDepthByCatalog = Object.fromEntries(Object.entries(REAL_PROJECT_NATIVE_DEPTH_TARGETS).map(([catalogId, target]) => {
    const catalogEntries = entries.filter((entry) => entry.catalog.templateId === catalogId)
    const itemPacks = catalogEntries.filter((entry) => entry.node.categoryType === 'item_work')
    const legacyCoverageItemPacks = itemPacks.filter((entry) => isActiveLegacyCoverageSupplementNode(entry.node))
    const promotedItemPacks = itemPacks.filter((entry) => entry.node.metadata?.realProjectCoveragePromoted === true)
    const promotedFallbackItemPacks = promotedItemPacks.filter((entry) => entry.node.metadata?.coverageProcessDepthSource !== NATIVE_PROCESS_DEPTH_SOURCE)
    const formalItemPacks = itemPacks.filter((entry) => isFormalItemPack(entry.node))
    const nativeSchedulableItemPacks = formalItemPacks.filter((entry) => isNativeSchedulableItemPack(entry.node))
    const weakNativeSchedulableItemPacks = formalItemPacks.filter((entry) => !isNativeSchedulableItemPack(entry.node))
    const requiresNativeProcessDepth = REAL_PROJECT_NATIVE_PROCESS_DEPTH_CATALOGS.has(catalogId)

    return [catalogId, {
      label: target.label,
      targetItemPacks: target.targetItemPacks,
      formalItemPacks: formalItemPacks.length,
      nativeSchedulableItemPacks: nativeSchedulableItemPacks.length,
      weakNativeSchedulableItemPacks: weakNativeSchedulableItemPacks.length,
      promotedItemPacks: promotedItemPacks.length,
      promotedFallbackItemPacks: promotedFallbackItemPacks.length,
      legacyCoverageItemPacks: legacyCoverageItemPacks.length,
      passesNativeDepthTarget: formalItemPacks.length >= target.targetItemPacks && legacyCoverageItemPacks.length === 0,
      passesNativeProcessDepthTarget: !requiresNativeProcessDepth || (
        promotedFallbackItemPacks.length === 0
        && nativeSchedulableItemPacks.length >= target.targetItemPacks
        && weakNativeSchedulableItemPacks.length === 0
      ),
    }]
  }))

  for (const entry of entries) {
    const { node, catalogGroup } = entry
    const metadata = node.metadata ?? {}

    if (!node.stableCode || !node.name || !node.sourceStandard || !node.sourceVersion || !node.sourceClauseRef) {
      addFinding(findings, entry, {
        severity: 'P0',
        ruleCode: 'NODE_IDENTITY_METADATA_MISSING',
        message: 'Node is missing stable identity or source metadata.',
        recommendation: 'Declare stableCode, name, sourceStandard, sourceVersion, and sourceClauseRef.',
      })
    }

    if (node.categoryType === 'item_work') {
      const processCount = countChildren(node, 'process')
      const expected = expectedProcessCount(node, catalogGroup)
      if (processCount < expected) {
        addFinding(findings, entry, {
          severity: processCount < 3 ? 'P1' : 'P2',
          ruleCode: 'ITEM_WORK_PROCESS_DEPTH_LOW',
          message: `Item work has ${processCount} process nodes; expected at least ${expected} for this complexity band.`,
          recommendation: 'Add field-realistic process nodes or move specialized depth into a referenced specialty template if the main seed should stay lean.',
          metrics: { processCount, expectedProcessCount: expected },
        })
      }

      if (
        REAL_PROJECT_NATIVE_PROCESS_DEPTH_CATALOGS.has(entry.catalog.templateId)
        && isFormalItemPack(node)
        && !isNativeSchedulableItemPack(node)
      ) {
        const fieldDurationAnchors = countFieldDurationAnchorProcesses(node)
        addFinding(findings, entry, {
          severity: 'P1',
          ruleCode: 'REAL_PROJECT_NATIVE_ITEM_WORK_NOT_SCHEDULABLE',
          message: `Formal real-project itemPack has ${processCount} process nodes and ${fieldDurationAnchors} field-duration anchors; expected at least ${NATIVE_SCHEDULABLE_PROCESS_MINIMUM} process nodes and ${NATIVE_SCHEDULABLE_FIELD_DURATION_ANCHOR_MINIMUM} field-duration anchors.`,
          recommendation: 'Add native differentiated process chains with explicit field-duration work anchors, or keep this itemWork out of the real-project native depth target until it is schedulable.',
          metrics: {
            processCount,
            minimumProcessCount: NATIVE_SCHEDULABLE_PROCESS_MINIMUM,
            fieldDurationAnchors,
            minimumFieldDurationAnchors: NATIVE_SCHEDULABLE_FIELD_DURATION_ANCHOR_MINIMUM,
          },
        })
      }
    }

    if (node.categoryType === 'process') {
      const durationContributionMode = String(metadata.durationContributionMode ?? metadata.duration_contribution_mode ?? '')
      const executionNature = String(metadata.executionNature ?? metadata.execution_nature ?? '')
      const stepCount = countChildren(node, 'activity_step')
      const expected = expectedStepCount(node)
      const generationMode = String(metadata.generationMode ?? '')
      const replacesCoreQualityCodes = readStringArray(metadata.replacesCoreQualityCodes)
      if (stepCount < expected) {
        addFinding(findings, entry, {
          severity: stepCount === 0 ? 'P1' : 'P2',
          ruleCode: 'PROCESS_ACTIVITY_STEP_DEPTH_LOW',
          message: `Process has ${stepCount} activity steps; expected at least ${expected} for this complexity band.`,
          recommendation: 'Add activity steps that reflect preparation, execution, inspection/record, and handover closure where applicable.',
          metrics: { stepCount, expectedStepCount: expected, durationContributionMode, executionNature },
        })
      }

      if (durationContributionMode === 'duration_bearing' && includesAny(node.name, GENERIC_PROCESS_TERMS) && stepCount <= 2) {
        addFinding(findings, entry, {
          severity: 'P2',
          ruleCode: 'GENERIC_PROCESS_NAME_LOW_DETAIL',
          message: 'Process name is generic and has little activity-step detail.',
          recommendation: 'Replace generic wording with trade-specific action names or attach a richer method variant package.',
          metrics: { stepCount, durationContributionMode, executionNature },
        })
      }

      const englishPlaceholderTerm = ENGLISH_PLACEHOLDER_WORKFLOW_TERMS.find((pattern) => pattern.test(node.name))
      if (catalogGroup !== 'core_quality' && englishPlaceholderTerm) {
        addFinding(findings, entry, {
          severity: 'P2',
          ruleCode: 'DOMAIN_ENGLISH_PLACEHOLDER_WORKFLOW_TERM',
          message: `Domain process still contains English workflow placeholder ${englishPlaceholderTerm}.`,
          recommendation: 'Normalize placeholder workflow terms such as signoff/readiness review/closeout work into Chinese field action wording, or replace the process with a native trade-specific chain.',
          metrics: { processName: node.name },
        })
      }

      if (catalogGroup !== 'core_quality' && !hasChineseFieldAnchor(node.name)) {
        addFinding(findings, entry, {
          severity: 'P2',
          ruleCode: 'DOMAIN_PROCESS_NAME_LACKS_CHINESE_FIELD_ANCHOR',
          message: 'Domain process name has no Chinese field-action anchor.',
          recommendation: 'Keep necessary technical acronyms, but add Chinese field-action wording such as 现场作业、现场条件复核、验收移交签认, or replace the process with a native Chinese trade-specific action.',
          metrics: { processName: node.name },
        })
      }

      if (catalogGroup === 'specialty' && coreProcessNames.has(node.name)) {
        const hasCoreReference = [
          'referencedCoreQualityCodes',
          'extendsCoreQualityCodes',
          'replacesCoreQualityCodes',
          'semanticReferencedCoreQualityCodes',
        ].some((key) => Array.isArray(metadata[key]) ? (metadata[key] as unknown[]).length > 0 : Boolean(metadata[key]))
        if (!hasCoreReference) {
          addFinding(findings, entry, {
            severity: 'P2',
            ruleCode: 'SPECIALTY_CORE_OVERLAP_WITHOUT_REFERENCE',
            message: 'Specialty process name overlaps core process naming without explicit core reference metadata.',
            recommendation: 'Add referencedCoreQualityCodes/extendsCoreQualityCodes/replacesCoreQualityCodes or rename the specialty process to show its specialty-only scope.',
          })
        }
      }

      if (catalogGroup !== 'core_quality') {
        if (
          ['danger_control', 'quality_responsibility', 'project_milestone'].includes(catalogGroup)
          && !metadata.branchFamily
          && !metadata.branch_family
        ) {
          addFinding(findings, entry, {
            severity: 'P1',
            ruleCode: 'MAINLINE_BRANCH_FAMILY_MISSING',
            message: `${catalogGroup} process has no branchFamily metadata.`,
            recommendation: 'Declare branchFamily / branchKey / branchSelectionMode so DANGER, QR, and MILESTONE mainline rows can support project-type, trigger, or specialty-specific branches without duplicating fixed mainline packages.',
          })
        }

        if (
          ['danger_control', 'quality_responsibility', 'project_milestone'].includes(catalogGroup)
          && (metadata.branchFamily || metadata.branch_family)
          && !metadata.branchSelectionMode
          && !metadata.branch_selection_mode
        ) {
          addFinding(findings, entry, {
            severity: 'P1',
            ruleCode: 'MAINLINE_BRANCH_SELECTION_MODE_MISSING',
            message: `${catalogGroup} process declares branchFamily but has no branchSelectionMode.`,
            recommendation: 'Declare branchSelectionMode = always, by_project_type, by_specialty_selection, by_project_type_or_specialty_selection, or auto_by_trigger.',
          })
        }

        if (
          catalogGroup === 'danger_control'
          && node.categoryType === 'process'
          && !metadata.siteHazardPlaceholder
          && !metadata.site_hazard_placeholder
        ) {
          addFinding(findings, entry, {
            severity: 'P1',
            ruleCode: 'DANGER_SITE_HAZARD_PLACEHOLDER_MISSING',
            message: 'Danger-control process has no project-editable site hazard placeholder.',
            recommendation: 'Declare siteHazardPlaceholder / siteHazardFields so national-standard danger rows keep their standard process wording while the project can record the concrete hazard source, location, and control measures.',
          })
        }

        const branchSelectionMode = String(metadata.branchSelectionMode ?? metadata.branch_selection_mode ?? '').trim()
        if (
          ['quality_responsibility', 'project_milestone'].includes(catalogGroup)
          && ['by_specialty_selection', 'by_project_type_or_specialty_selection'].includes(branchSelectionMode)
          && !hasAnyMetadataArray(metadata, [
            'applicableSpecialtyTemplateIds',
            'applicable_specialty_template_ids',
            'requiredSpecialtyTemplateIds',
            'required_specialty_template_ids',
            'branchTemplateIds',
            'branch_template_ids',
            'referencedSpecialtyCodes',
            'referenced_specialty_codes',
            'semanticReferencedSpecialtyCodes',
            'semantic_referenced_specialty_codes',
          ])
        ) {
          addFinding(findings, entry, {
            severity: 'P1',
            ruleCode: 'MAINLINE_SPECIALTY_BRANCH_SELECTOR_MISSING',
            message: `${catalogGroup} process uses ${branchSelectionMode} but has no specialty template selector or referenced specialty stableCode.`,
            recommendation: 'Declare applicableSpecialtyTemplateIds or referencedSpecialtyCodes/semanticReferencedSpecialtyCodes so specialty-driven branch generation has a deterministic source.',
          })
        }

        if (generationMode === 'replace_core_when_selected' && replacesCoreQualityCodes.length === 0) {
          addFinding(findings, entry, {
            severity: 'P1',
            ruleCode: 'SPECIALTY_REPLACEMENT_MODE_WITHOUT_CODES',
            message: 'Specialty process is marked replace_core_when_selected but has no replacesCoreQualityCodes.',
            recommendation: 'Declare the core_quality stableCode prefixes this specialty process replaces, or switch generationMode to additive_specialty_scope.',
          })
        }

        for (const replacementCode of replacesCoreQualityCodes) {
          const matchedCoreTargets = coreReplacementTargetEntries.filter((target) => (
            codeMatchesReplacementCode(target.node.stableCode, replacementCode)
          ))
          if (matchedCoreTargets.length === 0) {
            addFinding(findings, entry, {
              severity: 'P1',
              ruleCode: 'SPECIALTY_REPLACEMENT_CODE_UNRESOLVED',
              message: `replacesCoreQualityCodes entry "${replacementCode}" does not resolve to any core_quality stableCode or prefix.`,
              recommendation: 'Use a valid core_quality division/sub-division/item/process stableCode prefix, or remove the replacement metadata if this is additive specialty work.',
              metrics: { replacementCode },
            })
          }
        }

        if (generationMode !== 'replace_core_when_selected' && replacesCoreQualityCodes.length > 0) {
          addFinding(findings, entry, {
            severity: 'P2',
            ruleCode: 'SPECIALTY_REPLACEMENT_CODES_WITHOUT_REPLACEMENT_MODE',
            message: 'Specialty process declares replacesCoreQualityCodes but is not in replace_core_when_selected mode.',
            recommendation: 'If this process should suppress core rows, set generationMode = replace_core_when_selected. If it is additive, move the codes to referencedCoreQualityCodes/extendsCoreQualityCodes.',
            metrics: { generationMode: generationMode || null, replacesCoreQualityCodes },
          })
        }
      }
    }

    if (node.categoryType === 'process' || node.categoryType === 'activity_step') {
      if (!metadata.durationContributionMode && !metadata.duration_contribution_mode) {
        addFinding(findings, entry, {
          severity: 'P0',
          ruleCode: 'DURATION_CONTRIBUTION_MODE_MISSING',
          message: 'Executable node has no durationContributionMode.',
          recommendation: 'Declare duration_bearing, embedded_check, quality_gate, external_wait, record_only, or handover_marker.',
        })
      }
      if (!metadata.executionNature && !metadata.execution_nature) {
        addFinding(findings, entry, {
          severity: 'P0',
          ruleCode: 'EXECUTION_NATURE_MISSING',
          message: 'Executable node has no executionNature.',
          recommendation: 'Declare physical_work, technical_preparation, inspection_test, monitoring_wait, document_record, management_action, or handover_milestone.',
        })
      }
      const missingControlRoles = REQUIRED_CONTROL_ROLE_KEYS.filter((key) => metadata[key] === undefined)
      if (missingControlRoles.length > 0) {
        addFinding(findings, entry, {
          severity: 'P1',
          ruleCode: 'CONTROL_ROLES_MISSING',
          message: `Executable node misses control role fields: ${missingControlRoles.join(', ')}.`,
          recommendation: 'Declare all six cross-cut control roles, even when the value is none.',
        })
      }
    }

    if (catalogGroup === 'danger_control' && node.categoryType === 'process') {
      const triggerConditions = Array.isArray(metadata.triggerConditions) ? metadata.triggerConditions : []
      if (triggerConditions.length === 0) {
        addFinding(findings, entry, {
          severity: 'P1',
          ruleCode: 'DANGER_TRIGGER_MISSING',
          message: 'Danger-control process is not backed by triggerConditions.',
          recommendation: 'Add engineering-object or feature-profile triggerConditions.',
        })
      }
    }

    if (node.categoryType === 'process' && (node as any).defaultDurationDays != null) {
      addFinding(findings, entry, {
        severity: 'P1',
        ruleCode: 'TEMPLATE_DEFAULT_DURATION_PRESENT',
        message: 'Template process declares defaultDurationDays.',
        recommendation: 'Move duration to standard_work_duration_seed or historical duration governance.',
      })
    }

    if (node.categoryType === 'item_work' && metadata.coverageSupplement === true) {
      addFinding(findings, entry, {
        severity: 'P0',
        ruleCode: 'LEGACY_COVERAGE_SUPPLEMENT_STILL_ACTIVE',
        message: 'Real-project coverage supplement itemPack is still exposed as an active template node.',
        recommendation: 'Promote the pack into a formal specialty division and keep the *-90 code only as promotedFromCoverageCode metadata.',
      })
    }

    if (
      node.categoryType === 'item_work'
      && metadata.realProjectCoveragePromoted === true
      && REAL_PROJECT_NATIVE_PROCESS_DEPTH_CATALOGS.has(entry.catalog.templateId)
      && metadata.coverageProcessDepthSource !== NATIVE_PROCESS_DEPTH_SOURCE
    ) {
      addFinding(findings, entry, {
        severity: 'P1',
        ruleCode: 'REAL_PROJECT_PROMOTED_PACK_USES_PROFILE_FALLBACK',
        message: 'Promoted real-project itemPack still uses generic coverageProfileProcesses fallback.',
        recommendation: 'Replace profile-generated subject-prefixed steps with native differentiated process chains for the specialty scenario.',
        metrics: { coverageProcessDepthSource: metadata.coverageProcessDepthSource ?? null },
      })
    }
  }

  for (const [catalogId, target] of Object.entries(REAL_PROJECT_NATIVE_DEPTH_TARGETS)) {
    const metric = nativeDepthByCatalog[catalogId]
    const catalog = catalogs.find((item) => item.templateId === catalogId)
    if (!catalog || !metric || (metric.passesNativeDepthTarget && metric.passesNativeProcessDepthTarget)) continue
    const syntheticEntry: NodeEntry = {
      catalog,
      catalogGroup: getCatalogGroup(catalog),
      templateGroup: getTemplateGroup(catalog),
      node: {
        stableCode: catalog.templateCode,
        name: catalog.templateName,
        categoryType: 'division',
        sourceStandard: catalog.sourceStandard,
        sourceVersion: 'v1.4.7.2',
        sourceClauseRef: '真实项目覆盖总账',
      },
      parent: null,
      path: catalog.templateName,
    }
    addFinding(findings, syntheticEntry, {
      severity: 'P1',
      ruleCode: 'REAL_PROJECT_NATIVE_DEPTH_TARGET_NOT_MET',
      message: `${target.label} formal itemPack depth is ${metric.formalItemPacks}; native schedulable itemPacks are ${metric.nativeSchedulableItemPacks}; target is ${target.targetItemPacks}; weak native itemPacks: ${metric.weakNativeSchedulableItemPacks}; promoted fallback itemPacks: ${metric.promotedFallbackItemPacks}.`,
      recommendation: 'Promote real-project coverage packs into formal template divisions where needed, and ensure every formal native itemPack has differentiated process chains with explicit field-duration anchors.',
      metrics: metric,
    })
  }

  for (const catalog of catalogs) {
    if (!REAL_PROJECT_NATIVE_PROCESS_DEPTH_CATALOGS.has(catalog.templateId)) continue
    const catalogEntries = entries.filter((entry) => entry.catalog.templateId === catalog.templateId)
    const promotedItemPacks = catalogEntries.filter((entry) => (
      entry.node.categoryType === 'item_work'
      && entry.node.metadata?.realProjectCoveragePromoted === true
    ))
    const signatureGroups = new Map<string, NodeEntry[]>()
    for (const entry of promotedItemPacks) {
      const signature = processSignature(entry.node)
      if (!signature) continue
      const group = signatureGroups.get(signature) ?? []
      group.push(entry)
      signatureGroups.set(signature, group)
    }
    for (const group of signatureGroups.values()) {
      if (group.length <= 1) continue
      addFinding(findings, group[0], {
        severity: 'P2',
        ruleCode: 'REAL_PROJECT_PROMOTED_PACK_DUPLICATE_PROCESS_CHAIN',
        message: `Promoted real-project itemPacks share an identical process chain: ${group.map((entry) => entry.node.stableCode).join(', ')}.`,
        recommendation: 'Give each promoted scenario a trade-specific process chain, or demote one itemPack if it is only an alias of the same field work.',
        metrics: {
          duplicateCount: group.length,
          duplicateStableCodes: group.map((entry) => entry.node.stableCode),
          duplicateNames: group.map((entry) => entry.node.name),
        },
      })
    }

    const tokenized = promotedItemPacks.map((entry) => ({
      entry,
      tokens: normalizedProcessTokens(entry.node),
    }))
    const reportedNearDuplicatePairs = new Set<string>()
    for (let leftIndex = 0; leftIndex < tokenized.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tokenized.length; rightIndex += 1) {
        const left = tokenized[leftIndex]
        const right = tokenized[rightIndex]
        const similarity = jaccardSimilarity(left.tokens, right.tokens)
        if (similarity < 0.78) continue
        const pairKey = [left.entry.node.stableCode, right.entry.node.stableCode].sort().join('|')
        if (reportedNearDuplicatePairs.has(pairKey)) continue
        reportedNearDuplicatePairs.add(pairKey)
        addFinding(findings, left.entry, {
          severity: 'P2',
          ruleCode: 'REAL_PROJECT_PROMOTED_PACK_NEAR_DUPLICATE_PROCESS_CHAIN',
          message: `Promoted real-project itemPacks have highly similar normalized process chains: ${left.entry.node.stableCode} and ${right.entry.node.stableCode}.`,
          recommendation: 'Review whether the two packs are aliases. If they are distinct field work, add scenario-specific actions so the process chain reflects different construction, installation, testing, or handover logic.',
          metrics: {
            similarity: Number(similarity.toFixed(3)),
            comparedStableCodes: [left.entry.node.stableCode, right.entry.node.stableCode],
            comparedNames: [left.entry.node.name, right.entry.node.name],
          },
        })
      }
    }
  }

  const bySeverity = summarizeBy(findings, (item) => item.severity)
  const byRuleCode = summarizeBy(findings, (item) => item.ruleCode)
  const byCatalogGroup = summarizeBy(findings, (item) => item.catalogGroup)
  const byCatalogId = summarizeBy(findings, (item) => item.catalogId)
  const detailFindings = findings.sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.ruleCode.localeCompare(right.ruleCode)
    || left.catalogId.localeCompare(right.catalogId)
    || left.stableCode.localeCompare(right.stableCode)
  ))

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: 'core_quality_and_domain_wbs_template_catalogs',
    totals: {
      catalogCount: catalogs.length,
      totalNodes: entries.length,
      processLikeNodes: processLikeEntries.length,
      processNodes: entries.filter((entry) => entry.node.categoryType === 'process').length,
      activityStepNodes: entries.filter((entry) => entry.node.categoryType === 'activity_step').length,
      itemWorkNodes: entries.filter((entry) => entry.node.categoryType === 'item_work').length,
      legacyCoverageSupplementItemPacks: entries.filter((entry) => entry.node.categoryType === 'item_work' && entry.node.metadata?.coverageSupplement === true).length,
      realProjectPromotedItemPacks: entries.filter((entry) => entry.node.categoryType === 'item_work' && entry.node.metadata?.realProjectCoveragePromoted === true).length,
    },
    nativeDepthByCatalog,
    findings: {
      total: findings.length,
      bySeverity,
      byRuleCode,
      byCatalogGroup,
      byCatalogId,
    },
    topFindings: detailFindings.slice(0, 80),
  }

  const reportDir = resolve(process.cwd(), 'artifacts/reports')
  mkdirSync(reportDir, { recursive: true })
  const jsonPath = resolve(reportDir, 'wbs-template-depth-audit.json')
  writeFileSync(jsonPath, `${JSON.stringify({ ...summary, allFindings: detailFindings }, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    ...summary,
    reportPath: jsonPath,
  }, null, 2))
}

audit()
