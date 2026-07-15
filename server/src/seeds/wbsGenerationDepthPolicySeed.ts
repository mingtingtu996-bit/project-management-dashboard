export type WbsGenerationDepthLevel =
  | 'division'
  | 'sub_division'
  | 'item_work'
  | 'process'
  | 'activity_step'

export type WbsGenerationDepthPolicy = {
  policyId: string
  source: 'wbs_generation_depth_policy_seed'
  sourceVersion: string
  materializeDepth: WbsGenerationDepthLevel
  durationComputeDepth: WbsGenerationDepthLevel
  drillDownAvailable: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
  governance: {
    assetType: 'generation_depth_policy'
    curationStatus: 'seeded' | 'system_inferred'
    directSeedMutation: false
  }
}

export type WbsGenerationDepthPolicyInput = {
  stableCode?: string | null
  categoryType?: string | null
  templateId?: string | null
  name?: string | null
  metadata?: Record<string, unknown> | null
}

type WbsGenerationDepthPolicyRule = {
  ruleId: string
  match: {
    categoryType?: WbsGenerationDepthLevel | readonly WbsGenerationDepthLevel[]
    stableCode?: string
    stableCodePrefix?: string
    templateId?: string | readonly string[]
    templateIdPrefix?: string | readonly string[]
    templateGroup?: string | readonly string[]
    packType?: string | readonly string[]
    domainScope?: string | readonly string[]
  }
  materializeDepth: WbsGenerationDepthLevel
  durationComputeDepth: WbsGenerationDepthLevel
  confidence: WbsGenerationDepthPolicy['confidence']
  reason: string
}

export const WBS_GENERATION_DEPTH_POLICY_VERSION = 'v1.4.22-managed-frontier-20260620'

export const WBS_GENERATION_DEPTH_POLICY_RULES: WbsGenerationDepthPolicyRule[] = [
  {
    ruleId: 'specialty-domain-division-managed-frontier',
    match: { packType: 'specialty', categoryType: 'division' },
    materializeDepth: 'sub_division',
    durationComputeDepth: 'process',
    confidence: 'high',
    reason: '专项模板按专业系统展开到子分部管理颗粒度，首屏不铺满过程步骤，但工期继续下钻到专业工序深算，避免专项模板落回土建通用停层。'
  },
  {
    ruleId: 'specialty-domain-subdivision-managed-frontier',
    match: { packType: 'specialty', categoryType: 'sub_division' },
    materializeDepth: 'item_work',
    durationComputeDepth: 'process',
    confidence: 'high',
    reason: '机电、幕墙、洁净、钢结构等专项子分部需要落到分项工程才具备现场排程管理对象，工期由下层专业工序深算并保留可下钻链路。'
  },
  {
    ruleId: 'specialty-domain-item-work-managed-frontier',
    match: { packType: 'specialty', categoryType: 'item_work' },
    materializeDepth: 'item_work',
    durationComputeDepth: 'process',
    confidence: 'high',
    reason: '专项分项工程作为可管理排程对象保留在首屏，其内部过程工序参与深算，保证专项计划的可见颗粒度和真实工期来源一致。'
  },
  {
    ruleId: 'support-domain-division-managed-frontier',
    match: {
      packType: ['site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support'],
      categoryType: 'division',
    },
    materializeDepth: 'sub_division',
    durationComputeDepth: 'item_work',
    confidence: 'medium',
    reason: '管理、风险、质量责任、里程碑和资料商务类模板按控制主题展开，不套用物理施工工序深度；工期或状态依据控制项/分项任务聚合。'
  },
  {
    ruleId: 'support-domain-subdivision-managed-frontier',
    match: {
      packType: ['site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support'],
      categoryType: 'sub_division',
    },
    materializeDepth: 'item_work',
    durationComputeDepth: 'item_work',
    confidence: 'medium',
    reason: '非物理施工类子分部首屏停在可负责、可关闭的控制项或资料项，不强行下钻成现场工序，以免制造伪施工排程。'
  },
  {
    ruleId: 'earthwork-subdivision-managed-frontier-item-work',
    match: { categoryType: 'sub_division', stableCode: '01-05' },
    materializeDepth: 'item_work',
    durationComputeDepth: 'process',
    confidence: 'high',
    reason: '土方子分部首屏停在开挖、回填等分项管理颗粒度，不把测量放线等过程步骤铺到首屏；计划工期由下层工序深算汇总，支持后续下钻维护。',
  },
  {
    ruleId: 'foundation-subdivision-managed-frontier-item-work',
    match: { categoryType: 'sub_division', stableCodePrefix: '01-' },
    materializeDepth: 'item_work',
    durationComputeDepth: 'process',
    confidence: 'medium',
    reason: '地基与基础类子分部通常需要到分项工程层才能形成可执行管理对象，首屏以分项为管理颗粒度，下层工序参与工期深算与下钻。',
  },
  {
    ruleId: 'core-building-subdivision-managed-frontier',
    match: { categoryType: 'sub_division' },
    materializeDepth: 'sub_division',
    durationComputeDepth: 'process',
    confidence: 'high',
    reason: '首屏按分项/子分部管理颗粒度生成可审核计划骨架，实际计划工期由下层施工工序深算汇总，子工序通过下钻维护。',
  },
  {
    ruleId: 'division-grouping-frontier',
    match: { categoryType: 'division' },
    materializeDepth: 'sub_division',
    durationComputeDepth: 'process',
    confidence: 'medium',
    reason: '分部节点作为组织分组，不直接作为最终施工任务；向下展开到各子分部管理颗粒度。',
  },
  {
    ruleId: 'item-work-default-frontier',
    match: { categoryType: 'item_work' },
    materializeDepth: 'item_work',
    durationComputeDepth: 'process',
    confidence: 'medium',
    reason: '普通分项工程在首屏保留到 item_work 管理粒度，工期可继续由下层工序深算或通过后续下钻展开。',
  },
  {
    ruleId: 'process-direct-execution-frontier',
    match: { categoryType: 'process' },
    materializeDepth: 'process',
    durationComputeDepth: 'process',
    confidence: 'medium',
    reason: '已到现场执行工序粒度时直接生成执行任务。',
  },
  {
    ruleId: 'activity-step-drilldown-only',
    match: { categoryType: 'activity_step' },
    materializeDepth: 'activity_step',
    durationComputeDepth: 'activity_step',
    confidence: 'medium',
    reason: '作业步骤默认作为下钻明细或检查清单粒度，不扩大首屏计划骨架。',
  },
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeCategoryType(value: unknown): WbsGenerationDepthLevel | null {
  const normalized = normalizeText(value)
  if (
    normalized === 'division'
    || normalized === 'sub_division'
    || normalized === 'item_work'
    || normalized === 'process'
    || normalized === 'activity_step'
  ) return normalized
  return null
}

function normalizeMetadataField(input: WbsGenerationDepthPolicyInput, camelKey: string, snakeKey?: string) {
  const metadata = input.metadata ?? {}
  return normalizeText((metadata as Record<string, unknown>)[camelKey] ?? (snakeKey ? (metadata as Record<string, unknown>)[snakeKey] : undefined))
}

function normalizeMatchValues(value: string | readonly string[] | undefined) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  const normalized = normalizeText(value).toLowerCase()
  return normalized ? [normalized] : []
}

function normalizeMatchLevelValues(value: WbsGenerationDepthLevel | readonly WbsGenerationDepthLevel[] | undefined) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const normalized = normalizeText(value)
  return normalized ? [normalized] : []
}

function matchesTextCriterion(criterion: string | readonly string[] | undefined, value: unknown) {
  const expected = normalizeMatchValues(criterion)
  if (expected.length === 0) return true
  const actual = normalizeText(value).toLowerCase()
  return actual ? expected.includes(actual) : false
}

function matchesTextPrefixCriterion(criterion: string | readonly string[] | undefined, value: unknown) {
  const expected = normalizeMatchValues(criterion)
  if (expected.length === 0) return true
  const actual = normalizeText(value).toLowerCase()
  return actual ? expected.some((prefix) => actual.startsWith(prefix)) : false
}

function ruleMatches(rule: WbsGenerationDepthPolicyRule, input: WbsGenerationDepthPolicyInput) {
  const categoryType = normalizeCategoryType(input.categoryType)
  const stableCode = normalizeText(input.stableCode).toUpperCase()
  const templateId = normalizeText(input.templateId)
  const templateGroup = normalizeMetadataField(input, 'templateGroup', 'template_group')
  const packType = normalizeMetadataField(input, 'packType', 'pack_type')
  const domainScope = normalizeMetadataField(input, 'domainScope', 'domain_scope')
  const categoryCriteria = normalizeMatchLevelValues(rule.match.categoryType)
  if (categoryCriteria.length > 0 && (!categoryType || !categoryCriteria.includes(categoryType))) return false
  if (rule.match.stableCode && rule.match.stableCode.toUpperCase() !== stableCode) return false
  if (rule.match.stableCodePrefix && !stableCode.startsWith(rule.match.stableCodePrefix.toUpperCase())) return false
  if (!matchesTextCriterion(rule.match.templateId, templateId)) return false
  if (!matchesTextPrefixCriterion(rule.match.templateIdPrefix, templateId)) return false
  if (!matchesTextCriterion(rule.match.templateGroup, templateGroup)) return false
  if (!matchesTextCriterion(rule.match.packType, packType)) return false
  if (!matchesTextCriterion(rule.match.domainScope, domainScope)) return false
  return true
}

function ruleSpecificity(rule: WbsGenerationDepthPolicyRule) {
  let score = 0
  if (rule.match.templateId) score += 2000
  if (rule.match.templateIdPrefix) score += 1500
  if (rule.match.stableCode) score += 1000
  if (rule.match.stableCodePrefix) score += 500 + rule.match.stableCodePrefix.length
  if (rule.match.templateGroup) score += 300
  if (rule.match.packType) score += 250
  if (rule.match.domainScope) score += 200
  if (rule.match.categoryType) score += 50
  return score
}

export function resolveWbsGenerationDepthPolicy(input: WbsGenerationDepthPolicyInput): WbsGenerationDepthPolicy {
  const categoryType = normalizeCategoryType(input.categoryType)
  const matchedRule = WBS_GENERATION_DEPTH_POLICY_RULES
    .filter((rule) => ruleMatches(rule, input))
    .sort((left, right) => ruleSpecificity(right) - ruleSpecificity(left))[0]
  const fallbackDepth = categoryType ?? 'item_work'
  const rule = matchedRule ?? {
    ruleId: `fallback-${fallbackDepth}`,
    match: { categoryType: fallbackDepth },
    materializeDepth: fallbackDepth,
    durationComputeDepth: fallbackDepth === 'division' || fallbackDepth === 'sub_division' || fallbackDepth === 'item_work'
      ? 'process'
      : fallbackDepth,
    confidence: 'low' as const,
    reason: '未命中显式生成深度规则，按节点层级自动推断首屏管理颗粒度，需通过规则资产审计持续补强。',
  }

  return {
    policyId: rule.ruleId,
    source: 'wbs_generation_depth_policy_seed',
    sourceVersion: WBS_GENERATION_DEPTH_POLICY_VERSION,
    materializeDepth: rule.materializeDepth,
    durationComputeDepth: rule.durationComputeDepth,
    drillDownAvailable: rule.materializeDepth !== rule.durationComputeDepth,
    confidence: rule.confidence,
    reason: rule.reason,
    governance: {
      assetType: 'generation_depth_policy',
      curationStatus: matchedRule ? 'seeded' : 'system_inferred',
      directSeedMutation: false,
    },
  }
}
