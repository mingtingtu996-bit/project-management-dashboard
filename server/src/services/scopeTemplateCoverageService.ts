import type { ScopeAssignmentRule } from './scopeAssignmentRulesService.js'

export type ScopeTemplateCoverageStatus =
  | 'auto_schedulable'
  | 'manual_task_required'
  | 'missing_required_scope'

export interface ScopeTemplateCoverageItem {
  scopeObjectId?: string | null
  scopeName: string
  objectType: string
  status: ScopeTemplateCoverageStatus
  title: string
  detail: string
  action: string
  matchedRulePatterns: string[]
  requiredByTemplates: string[]
}

export interface ScopeTemplateCoverageResult {
  summary: {
    autoSchedulableCount: number
    manualTaskRequiredCount: number
    missingRequiredScopeCount: number
  }
  items: ScopeTemplateCoverageItem[]
}

type RuntimeScopeObject = {
  id: string
  type: string
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeId(value: unknown) {
  return readText(value).toLowerCase().replace(/\s+/g, '_')
}

function readPhysicalSpaceKind(object: RuntimeScopeObject) {
  return normalizeId(object.metadata.physicalSpaceKind ?? object.metadata.physical_space_kind)
}

function readStructuralRole(object: RuntimeScopeObject) {
  return normalizeId(object.metadata.structuralRole ?? object.metadata.structural_role)
}

function isSharedPodiumObject(object: RuntimeScopeObject) {
  if (object.type !== 'physical_zone') return false
  return readPhysicalSpaceKind(object) === 'shared_podium'
    || readStructuralRole(object) === 'podium'
    || object.metadata.sharedScopeCandidate === true
    || object.metadata.shared_scope_candidate === true
}

function isInternalTowerZone(object: RuntimeScopeObject) {
  return object.type === 'physical_zone'
    && readStructuralRole(object) === 'tower'
    && !isSharedPodiumObject(object)
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function readScopeObjects(generationScope: unknown): RuntimeScopeObject[] {
  const scope = readRecord(generationScope)
  return readArray(scope.scope_objects ?? scope.scopeObjects)
    .map((item) => {
      const record = readRecord(item)
      const id = readText(record.id, record.objectId, record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      const name = readText(record.name, record.objectName, record.object_name)
      if (!id || !type || !name) return null
      return {
        id,
        type,
        name,
        parentId: readText(record.parentId, record.parent_id) || null,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is RuntimeScopeObject => Boolean(item))
}

function metadataValueMatches(value: unknown, expected: unknown) {
  const normalizedValue = readText(value)
  const normalizedExpected = readText(expected)
  if (!normalizedValue || !normalizedExpected) return false
  return normalizedValue === normalizedExpected
    || normalizeId(normalizedValue) === normalizeId(normalizedExpected)
    || normalizedValue.includes(normalizedExpected)
    || normalizedExpected.includes(normalizedValue)
}

function objectMatchesRule(object: RuntimeScopeObject, rule: ScopeAssignmentRule) {
  const targetType = normalizeId(rule.targetObjectType)
  if (!targetType || object.type !== targetType) return false
  const matchObjectName = readText(rule.matchObjectName)
  if (matchObjectName && !metadataValueMatches(object.name, matchObjectName)) return false
  const matchMetadata = readRecord(rule.matchMetadata)
  return Object.entries(matchMetadata)
    .filter(([, expected]) => readText(expected))
    .every(([key, expected]) => metadataValueMatches(object.metadata[key], expected))
}

function findRulesForObject(object: RuntimeScopeObject, rules: ScopeAssignmentRule[]) {
  return rules.filter((rule) => {
    if (rule.effect === 'assign_to_scope_object') return objectMatchesRule(object, rule)
    if (rule.effect === 'assign_to_matching_buildings') {
      return object.type === 'building'
        && Boolean(rule.matchFunctionalUsage)
        && metadataValueMatches(
          object.metadata.functionalUsage ?? object.metadata.functional_usage ?? object.metadata.usageCode ?? object.metadata.usage_code,
          rule.matchFunctionalUsage,
        )
    }
    if (rule.effect === 'assign_to_all_buildings') return object.type === 'building'
    if (rule.effect === 'assign_to_functional_area') {
      return object.type === 'functional_area'
        && Boolean(rule.functionalAreaCategory)
        && metadataValueMatches(
          object.metadata.functionalCategory
            ?? object.metadata.functional_category
            ?? object.metadata.category
            ?? object.metadata.specialRoomType
            ?? object.metadata.special_room_type,
          rule.functionalAreaCategory,
        )
    }
    return false
  })
}

function isStandardSchedulableObject(object: RuntimeScopeObject) {
  if (object.type === 'building') return true
  if (object.type === 'basement') return true
  if (isSharedPodiumObject(object)) return true
  const floorUsage = normalizeId(object.metadata.floorUsage ?? object.metadata.floor_usage)
  if (object.type === 'floor') return !floorUsage || floorUsage === 'standard'
  return false
}

function shouldReportObject(object: RuntimeScopeObject, matchedRules: ScopeAssignmentRule[]) {
  if (object.type === 'phase' || object.type === 'section') return false
  if (object.type === 'physical_zone') {
    const physicalSpaceKind = readPhysicalSpaceKind(object)
    if (physicalSpaceKind === 'horizontal_work_zone') return false
    if (isInternalTowerZone(object) && matchedRules.length === 0) return false
  }
  if (object.type === 'floor') {
    const floorUsage = normalizeId(object.metadata.floorUsage ?? object.metadata.floor_usage)
    return Boolean(floorUsage && floorUsage !== 'standard')
  }
  if (object.type === 'functional_area') return matchedRules.length > 0
    || Boolean(readText(object.metadata.functionalCategory, object.metadata.specialRoomType))
  return true
}

function describeScopeKind(object: RuntimeScopeObject) {
  if (object.type === 'building') return '楼栋/单体'
  if (object.type === 'basement') return '地下空间'
  if (object.type === 'floor') return '特殊楼层'
  if (object.type === 'functional_area') return '功能区'
  if (object.type === 'physical_zone') {
    const kind = readPhysicalSpaceKind(object)
    if (kind === 'outdoor_site') return '室外总平'
    if (kind === 'independent_engineering_zone') return '独立工程区'
    if (isSharedPodiumObject(object)) return '共享裙房/公共裙房'
    return '物理分区'
  }
  return '工程空间'
}

function buildAutoItem(object: RuntimeScopeObject, matchedRules: ScopeAssignmentRule[]): ScopeTemplateCoverageItem {
  const scopeKind = describeScopeKind(object)
  const matchedRulePatterns = unique(matchedRules.map((rule) => rule.itemPackPattern))
  const sourceText = matchedRulePatterns.length > 0
    ? `已命中 ${matchedRulePatterns.join('、')} 的模板挂接规则。`
    : '属于标准楼栋/地下空间网络，生成器会按项目空间组合生成并挂接任务。'
  return {
    scopeObjectId: object.id,
    scopeName: object.name,
    objectType: object.type,
    status: 'auto_schedulable',
    title: `${object.name} 会自动生成并挂接任务`,
    detail: `${scopeKind}已被系统识别，${sourceText}`,
    action: '无需额外处理，生成 WBS 后可在任务列表中按该空间筛选和复核。',
    matchedRulePatterns,
    requiredByTemplates: matchedRulePatterns,
  }
}

function buildManualItem(object: RuntimeScopeObject): ScopeTemplateCoverageItem {
  const scopeKind = describeScopeKind(object)
  return {
    scopeObjectId: object.id,
    scopeName: object.name,
    objectType: object.type,
    status: 'manual_task_required',
    title: `${object.name} 已进入范围树，但暂无自动专项任务`,
    detail: `${scopeKind}可以作为项目空间保存和筛选，但当前模板规则还没有覆盖到这类空间的专项任务。`,
    action: '可以先生成 WBS，生成后补充该空间的专项任务；如果这是常用空间，后续应补充模板规则资产。',
    matchedRulePatterns: [],
    requiredByTemplates: [],
  }
}

function readWarningMissingLabel(warning: Record<string, unknown>) {
  const details = readRecord(warning.details)
  return readText(details.missingObjectLabel, details.missing_object_label)
    || readText(warning.scopeName, warning.scope_name)
    || '对应空间'
}

function buildMissingItems(governanceWarnings: unknown[]): ScopeTemplateCoverageItem[] {
  return readArray(governanceWarnings)
    .map(readRecord)
    .filter((warning) => readText(warning.code) === 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND')
    .map((warning) => {
      const details = readRecord(warning.details)
      const missingLabel = readWarningMissingLabel(warning)
      const pattern = readText(details.itemPackPattern, details.item_pack_pattern, warning.nodeCode, warning.node_code)
      return {
        scopeObjectId: null,
        scopeName: missingLabel,
        objectType: readText(details.targetObjectType, details.target_object_type) || 'scope_object',
        status: 'missing_required_scope' as const,
        title: `${missingLabel}缺少对应空间，暂不能生成`,
        detail: `模板已经触发 ${pattern || '对应专项'}，但项目空间中没有可挂接的${missingLabel}对象。`,
        action: '请先回到范围体量补齐该空间，或取消触发该专项模板后再生成。',
        matchedRulePatterns: pattern ? [pattern] : [],
        requiredByTemplates: pattern ? [pattern] : [],
      }
    })
}

export function evaluateScopeTemplateCoverage(params: {
  generationScope: unknown
  scopeAssignmentRules?: ScopeAssignmentRule[] | null
  governanceWarnings?: unknown[] | null
}): ScopeTemplateCoverageResult {
  const rules = (params.scopeAssignmentRules ?? [])
    .filter((rule) => readText(rule.itemPackPattern) && readText(rule.effect))
    .sort((left, right) => (Number(left.priority ?? 0) || 0) - (Number(right.priority ?? 0) || 0))
  const items: ScopeTemplateCoverageItem[] = []

  for (const object of readScopeObjects(params.generationScope)) {
    const matchedRules = findRulesForObject(object, rules)
    if (!shouldReportObject(object, matchedRules)) continue
    if (matchedRules.length > 0 || isStandardSchedulableObject(object)) {
      items.push(buildAutoItem(object, matchedRules))
    } else {
      items.push(buildManualItem(object))
    }
  }

  items.push(...buildMissingItems(params.governanceWarnings ?? []))

  return {
    summary: {
      autoSchedulableCount: items.filter((item) => item.status === 'auto_schedulable').length,
      manualTaskRequiredCount: items.filter((item) => item.status === 'manual_task_required').length,
      missingRequiredScopeCount: items.filter((item) => item.status === 'missing_required_scope').length,
    },
    items,
  }
}
