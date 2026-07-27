import {
  V1474_BUILDING_PATTERN_SEED,
  V1474_BUILDING_PATTERN_SEED_META,
} from '../seeds/v1474BuildingPatternSeed.js'
import {
  V1474_PROCESS_CONSTRAINT_SEED,
  V1474_PROCESS_CONSTRAINT_SEED_META,
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
  V1474_PROCESS_SEASONAL_SENSITIVITY_SEED,
  V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META,
} from '../seeds/v1474ProcessSeasonalSensitivitySeed.js'
import {
  inferV1474ResourcePressureDimensions,
  V1474_RESOURCE_CLASS_SEED,
  V1474_RESOURCE_CLASS_SEED_META,
} from '../seeds/v1474ResourceClassSeed.js'
import {
  V1474_SEASONAL_PRODUCTIVITY_SEED,
  V1474_SEASONAL_PRODUCTIVITY_SEED_META,
} from '../seeds/v1474SeasonalProductivitySeed.js'
import {
  V1474_SITE_CAPACITY_PRESSURE_SEED,
  V1474_SITE_CAPACITY_PRESSURE_SEED_META,
} from '../seeds/v1474SiteCapacityPressureSeed.js'
import {
  V1474_WORK_CALENDAR_SEED,
  V1474_WORK_CALENDAR_SEED_META,
} from '../seeds/v1474WorkCalendarSeed.js'
import {
  V1474_WORKFLOW_DICTIONARY_SEED,
  V1474_WORKFLOW_DICTIONARY_SEED_META,
} from '../seeds/v1474WorkflowDictionarySeed.js'
import {
  V1475_CROSS_ITEM_WORKFLOW_SEED,
  V1475_CROSS_ITEM_WORKFLOW_SEED_META,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
  STANDARD_WORK_DURATION_SEED,
  STANDARD_WORK_DURATION_SEED_META,
} from '../seeds/standardWorkDurationSeed.js'
import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import {
  DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED,
  DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED_META,
} from '../seeds/defaultMasterPlanVisibilityPolicySeed.js'
import { STANDARD_INTERNAL_FLOW_RULE_SEED } from '../seeds/standardInternalFlowSeed.js'
import {
  TITLE_WEAK_RECOGNITION_ALGORITHM_SEED_META,
  TITLE_WEAK_RECOGNITION_RULES,
} from '../seeds/v1472TitleWeakRecognitionSeed.js'
import {
  V1418_EARLIEST_START_RULE_SEED,
  V1418_EARLIEST_START_RULE_SEED_META,
} from '../seeds/v1418EarliestStartRuleSeed.js'
import {
  V1474_REGIONAL_CLIMATE_RULE_SEED,
  V1474_REGIONAL_CLIMATE_RULE_SEED_META,
} from '../seeds/v1474RegionalClimateRuleSeed.js'
import { PROGRESS_DEVIATION_CAUSE_RULES } from '../seeds/progressDeviationCauseRegistry.js'
import { STRUCTURED_CAUSE_TAXONOMY_VERSION } from '../domain/structuredCauseTaxonomy.js'
import { RESPONSIBILITY_HEALTH_RULE_SEED } from '../seeds/responsibilityHealthRuleSeed.js'
import { MILESTONE_INTEGRITY_RULE_SEED } from '../seeds/milestoneIntegrityRuleSeed.js'
import {
  inferDurationContributionMode,
  normalizeDurationContributionMode,
} from '../seeds/durationContributionMode.js'
import { RISK_ISSUE_WARNING_RULE_REGISTRY } from './riskIssueWarningRuleRegistry.js'

export type AlgorithmSeedType =
  | 'workflow_dictionary'
  | 'cross_item_workflow'
  | 'building_pattern'
  | 'process_constraint'
  | 'seasonal_productivity'
  | 'work_calendar'
  | 'process_seasonal_sensitivity'
  | 'resource_class'
  | 'site_capacity_pressure'
  | 'standard_work_duration'
  | 't2_division_rhythm_template'
  | 'master_plan_visibility_policy'
  | 'title_weak_recognition'
  | 'earliest_start_rule'
  | 'standard_internal_flow'
  | 'regional_climate_rules'
  | 'risk_issue_warning_rule'
  | 'progress_deviation_cause'
  | 'responsibility_health_rule'
  | 'milestone_integrity_rule'

export type AlgorithmSeedRecordPayload = Record<string, any>

export type V1475ResponsibilityRole =
  | 'general_contractor'
  | 'labor_subcontractor'
  | 'specialty_subcontractor'
  | 'supplier_install'
  | 'third_party'
  | 'owner_direct'

export type V1475BlockingLevel = 'hard' | 'soft' | 'info'
export type V1475ProgressImpact = 'blocked' | 'partial' | 'warning' | 'none'
export type V1475TimeNature = 'physical_constant' | 'process_waiting' | 'mixed'

export type V1475EvidenceQuality = {
  source_type: string
  source_doc: string
  source_url: string | null
  evidence_source_keys: string[]
  last_review_date: string
  applicable_region_scope: string
}

export type AlgorithmSeedMeta = {
  seedVersion: string
  seedScope: string
  sourceStandards: readonly string[]
  expectedCounts: {
    records: number
    regions?: number
    monthsPerRegion?: number
    provinceRecords?: number
    priorityCityRecords?: number
  }
  evidenceSources: readonly unknown[]
  generationPolicy: string
  relationshipRole?: string
  upstreamRuleTypes?: readonly string[]
  downstreamRuleTypes?: readonly string[]
  boundaryPolicy?: readonly string[]
  webVerified: boolean
  reviewNeeded: boolean
}

export type AlgorithmSeedRegistryEntry = {
  seedType: AlgorithmSeedType
  records: AlgorithmSeedRecordPayload[]
  meta: AlgorithmSeedMeta
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeText).filter(Boolean)))
    : []
}

function normalizeNumberRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [normalizeText(key), normalizeNumber(raw, NaN)] as const)
    .filter(([key, number]) => key && Number.isFinite(number) && number > 0))
}

const PROCESS_CONSTRAINT_CONDITION_FIELDS = new Set([
  'climate_signal',
  'weather_impact_band',
  'thermal_zone',
  'method_variant_code',
  'element_variant_code',
  'monthly_climate_signal',
  'project_type_code',
  'structure_type_code',
  'space_cleanliness_grade',
  'danger_control_level',
])

const PROCESS_CONSTRAINT_EFFECTS = new Set([
  'tighten_overlap_release',
  'require_project_fact_gate',
  'confidence_down',
  'candidate_only',
])

const PROCESS_CONSTRAINT_QUANTITY_EVIDENCE_REQUIREMENTS = new Set([
  'not_applicable',
  'real_quantity_required_for_auto_release',
  'real_or_default_quantity_proxy_allowed',
  'scope_proxy_allowed_as_low_confidence',
])

const PROCESS_CONSTRAINT_QUANTITY_PROXY_RISK_LEVELS = new Set(['not_applicable', 'low', 'medium', 'high'])

type ProcessConstraintConditionalEffectPayload = {
  id: string
  when: Array<{ field: string; operator: string; values: string[] }>
  effect: string
  minReleaseQuantityPercentDelta?: number
  partialOverlapRatioMultiplier?: number
  quantityEvidenceRequirement?: string
  quantityProxyRiskLevel?: string
  curationBasis: string
  businessReasonTemplate: string
  evidenceSourceKeys: string[]
}

function normalizeProcessConstraintConditionalEffects(value: unknown): ProcessConstraintConditionalEffectPayload[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const record = raw as Record<string, unknown>
      const effect = normalizeText(record.effect)
      if (!PROCESS_CONSTRAINT_EFFECTS.has(effect)) return null
      const when = Array.isArray(record.when)
        ? record.when
          .map((condition) => {
            if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null
            const conditionRecord = condition as Record<string, unknown>
            const field = normalizeText(conditionRecord.field)
            if (!PROCESS_CONSTRAINT_CONDITION_FIELDS.has(field)) return null
            const operator = normalizeText(conditionRecord.operator) === 'equals_any' ? 'equals_any' : 'includes_any'
            const values = normalizeTextArray(conditionRecord.values)
            if (values.length === 0) return null
            return { field, operator, values }
          })
          .filter((condition): condition is { field: string; operator: string; values: string[] } => Boolean(condition))
        : []
      if (when.length === 0) return null
      const quantityEvidenceRequirement = normalizeText(record.quantityEvidenceRequirement ?? record.quantity_evidence_requirement)
      const quantityProxyRiskLevel = normalizeText(record.quantityProxyRiskLevel ?? record.quantity_proxy_risk_level)
      return {
        id: normalizeText(record.id) || `conditional-effect-${index + 1}`,
        when,
        effect,
        ...(record.minReleaseQuantityPercentDelta != null
          ? { minReleaseQuantityPercentDelta: normalizeNumber(record.minReleaseQuantityPercentDelta, 0) }
          : {}),
        ...(record.partialOverlapRatioMultiplier != null
          ? { partialOverlapRatioMultiplier: Math.max(0.1, Math.min(1, normalizeNumber(record.partialOverlapRatioMultiplier, 1))) }
          : {}),
        ...(PROCESS_CONSTRAINT_QUANTITY_EVIDENCE_REQUIREMENTS.has(quantityEvidenceRequirement)
          ? { quantityEvidenceRequirement }
          : {}),
        ...(PROCESS_CONSTRAINT_QUANTITY_PROXY_RISK_LEVELS.has(quantityProxyRiskLevel)
          ? { quantityProxyRiskLevel }
          : {}),
        curationBasis: normalizeText(record.curationBasis ?? record.curation_basis),
        businessReasonTemplate: normalizeText(record.businessReasonTemplate ?? record.business_reason_template),
        evidenceSourceKeys: normalizeTextArray(record.evidenceSourceKeys ?? record.evidence_source_keys),
      }
    })
    .filter((effect): effect is ProcessConstraintConditionalEffectPayload => Boolean(effect))
}

function camelOrSnake(payload: AlgorithmSeedRecordPayload, camel: string, snake: string) {
  return payload[camel] ?? payload[snake]
}

export function getAlgorithmSeedStableCode(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload) {
  const direct = normalizeText(payload.stableCode)
  if (direct) return direct

  switch (seedType) {
    case 'seasonal_productivity':
      return `${normalizeText(payload.regionCode) || 'default'}-${String(payload.month ?? '').padStart(2, '0')}`
    case 'work_calendar':
      return normalizeText(payload.holidayCode) || `${normalizeText(payload.year)}-${normalizeText(payload.month)}`
    case 'building_pattern':
      return normalizeText(payload.patternCode)
    case 'standard_work_duration':
      return normalizeText(payload.stableCode) || normalizeText(payload.standardWorkCode) || normalizeText(payload.standard_work_code)
    case 't2_division_rhythm_template':
      return normalizeText(payload.stableCode) || normalizeText(payload.templateId) || normalizeText(payload.template_id)
    case 'title_weak_recognition':
      return normalizeText(payload.stableCode) || normalizeText(payload.ruleId) || normalizeText(payload.rule_id) || normalizeText(payload.code)
    case 'earliest_start_rule':
      return normalizeText(payload.stableCode) || normalizeText(payload.ruleCode) || normalizeText(payload.rule_code)
    case 'standard_internal_flow':
      return normalizeText(payload.stableCode) || normalizeText(payload.id)
    case 'regional_climate_rules': {
      const province = normalizeText(payload.province) || 'unknown'
      const location = normalizeText(payload.adminCode) || normalizeText(payload.city) || 'province'
      return `regional_climate:${province}:${location}`
    }
    case 'risk_issue_warning_rule':
      return normalizeText(payload.stableCode) || normalizeText(payload.ruleCode) || normalizeText(payload.rule_code)
    case 'progress_deviation_cause':
      return normalizeText(payload.stableCode) || `progress_deviation_cause:${normalizeText(payload.reasonType ?? payload.reason_type)}`
    case 'responsibility_health_rule':
      return normalizeText(payload.stableCode) || 'responsibility_health:default'
    case 'milestone_integrity_rule':
      return normalizeText(payload.stableCode)
        || (normalizeText(payload.policyType) === 'commitment_anchor'
          ? 'milestone_integrity:commitment_anchor_policy'
          : `milestone_integrity:${normalizeText(payload.milestoneKey ?? payload.milestone_key)}`)
    case 'site_capacity_pressure':
      return normalizeText(payload.stableCode) || normalizeText(payload.policyCode) || 'default_site_capacity_pressure_policy'
    default:
      return direct
  }
}

export function getAlgorithmSeedEvidenceKeys(payload: AlgorithmSeedRecordPayload) {
  return Array.isArray(payload.evidenceSourceKeys) ? payload.evidenceSourceKeys : []
}

function inferResponsibilityRole(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload): V1475ResponsibilityRole {
  const text = [
    payload.stableCode,
    payload.patternCode,
    payload.acceptanceType,
    payload.constraintType,
    payload.sourceClauseRef,
    ...(Array.isArray(payload.keywords) ? payload.keywords : []),
  ].map(normalizeText).join(' ').toLowerCase()

  if (text.includes('test') || text.includes('inspection') || text.includes('acceptance')) return 'third_party'
  if (text.includes('elevator') || text.includes('curtain')) return 'specialty_subcontractor'
  if (text.includes('waterproof') || text.includes('material') || text.includes('equipment')) return 'supplier_install'
  if (text.includes('rebar') || text.includes('formwork') || text.includes('masonry')) return 'labor_subcontractor'
  return seedType === 'work_calendar' || seedType === 'seasonal_productivity' ? 'owner_direct' : 'general_contractor'
}

function inferStandardWorkCodes(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload) {
  if ([
    'regional_climate_rules',
    'risk_issue_warning_rule',
    'progress_deviation_cause',
    'responsibility_health_rule',
    'milestone_integrity_rule',
  ].includes(seedType)) {
    return []
  }

  if (seedType === 'standard_internal_flow') {
    const explicitFlowCodes = Array.from(new Set([
      normalizeText(payload.predecessorStableCode ?? payload.predecessor_stable_code),
      normalizeText(payload.successorStableCode ?? payload.successor_stable_code),
    ].filter(Boolean)))
    if (explicitFlowCodes.length > 0) return explicitFlowCodes

    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return stableCode ? [`legacy:${seedType}:${stableCode}`] : []
  }

  const explicit = [
    ...normalizeTextArray(camelOrSnake(payload, 'standardWorkCodes', 'standard_work_codes')),
    ...normalizeTextArray(camelOrSnake(payload, 'applicableStandardWorkCodes', 'applicable_standard_work_codes')),
  ]
  const single = normalizeText(camelOrSnake(payload, 'standardWorkCode', 'standard_work_code'))
  if (single) explicit.push(single)
  const fromCode = normalizeText(camelOrSnake(payload, 'fromStandardWorkCode', 'from_standard_work_code'))
  const toCode = normalizeText(camelOrSnake(payload, 'toStandardWorkCode', 'to_standard_work_code'))
  if (fromCode) explicit.push(fromCode)
  if (toCode) explicit.push(toCode)
  if (explicit.length > 0) return Array.from(new Set(explicit))

  const stableCode = getAlgorithmSeedStableCode(seedType, payload)
  if (!stableCode) return []
  return [`legacy:${seedType}:${stableCode}`]
}

function buildEvidenceQuality(payload: AlgorithmSeedRecordPayload): V1475EvidenceQuality {
  const existing = payload.evidenceQuality ?? payload.evidence_quality
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return {
      source_type: normalizeText((existing as any).source_type ?? (existing as any).sourceType) || normalizeText(payload.sourceStandard) || 'system_default',
      source_doc: normalizeText((existing as any).source_doc ?? (existing as any).sourceDoc) || normalizeText(payload.sourceVersion) || 'unknown',
      source_url: normalizeText((existing as any).source_url ?? (existing as any).sourceUrl) || null,
      evidence_source_keys: normalizeTextArray((existing as any).evidence_source_keys ?? (existing as any).evidenceSourceKeys ?? payload.evidenceSourceKeys),
      last_review_date: normalizeText((existing as any).last_review_date ?? (existing as any).lastReviewDate) || '2026-05-16',
      applicable_region_scope: normalizeText((existing as any).applicable_region_scope ?? (existing as any).applicableRegionScope) || 'nationwide',
    }
  }
  return {
    source_type: normalizeText(payload.sourceStandard) || 'system_default',
    source_doc: normalizeText(payload.sourceVersion) || normalizeText(payload.sourceClauseRef) || 'unknown',
    source_url: null,
    evidence_source_keys: getAlgorithmSeedEvidenceKeys(payload).map(normalizeText).filter(Boolean),
    last_review_date: '2026-05-16',
    applicable_region_scope: normalizeText(payload.applicableRegionScope ?? payload.applicable_region_scope) || 'nationwide',
  }
}

function inferProcessConstraintRuntime(payload: AlgorithmSeedRecordPayload): Partial<AlgorithmSeedRecordPayload> {
  const constraintType = normalizeText(payload.constraintType).toLowerCase()
  if (constraintType.includes('overlap')) {
    return { blockingLevel: 'soft', progressImpact: 'partial', timeNature: 'mixed', partialOverlapRatio: 0.3 }
  }
  if (constraintType.includes('curing')) {
    return { blockingLevel: 'hard', progressImpact: 'blocked', timeNature: 'physical_constant' }
  }
  if (constraintType.includes('handover') || constraintType.includes('acceptance')) {
    return { blockingLevel: 'hard', progressImpact: 'partial', timeNature: 'mixed', partialOverlapRatio: 0.5 }
  }
  if (constraintType.includes('test_report')) {
    return { blockingLevel: 'soft', progressImpact: 'warning', timeNature: 'process_waiting' }
  }
  if (constraintType.includes('commissioning')) {
    return { blockingLevel: 'hard', progressImpact: 'blocked', timeNature: 'mixed' }
  }
  if (
    constraintType.includes('weather_window')
    || constraintType.includes('work_hour_window')
    || constraintType.includes('environment_control')
    || constraintType.includes('municipal_connection_wait')
    || constraintType.includes('safety_control_release')
    || constraintType.includes('monitoring_observation_wait')
    || constraintType.includes('temperature_control_window')
  ) {
    return { blockingLevel: 'hard', progressImpact: 'warning', timeNature: 'external_window' }
  }
  return { blockingLevel: 'hard', progressImpact: 'blocked', timeNature: 'mixed' }
}

function normalizeCalendarFields(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload) {
  if (seedType !== 'work_calendar') return {}
  const isCompensatoryWorkday = payload.isCompensatoryWorkday ?? payload.is_compensatory_workday
  return {
    isCompensatoryWorkday: typeof isCompensatoryWorkday === 'boolean' ? isCompensatoryWorkday : null,
    adjustmentOrigin: normalizeText(payload.adjustmentOrigin ?? payload.adjustment_origin) || null,
    calendarKind: normalizeText(payload.calendarKind ?? payload.calendar_kind) || null,
  }
}

function normalizeSeedSpecificFields(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload) {
  if (seedType === 't2_division_rhythm_template') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    const sourceRefs = normalizeTextArray(payload.sourceRefs ?? payload.source_refs)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'curated_t2_division_rhythm_template_seed',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.23.1-t2-division-rhythm-cold-start',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `t2_division_rhythm_template.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : sourceRefs,
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? true,
      durationAuthorityPolicy: 'candidate_schedule_rhythm_only_no_direct_runtime_write',
    }
  }
  if (seedType === 'regional_climate_rules') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'GB 50176-2016 + CMA public climate service',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.7.5-climate-profile-source-20260518',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `regional_climate_rules.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['GB50176_2016', 'CMA_PUBLIC_WEATHER_SERVICE'],
      webVerified: payload.webVerified ?? true,
      reviewNeeded: payload.reviewNeeded ?? false,
      climateFactAuthority: 'climate_environment_fact_only',
      durationAuthorityPolicy: 'no_duration_or_productivity_coefficient_authority',
    }
  }
  if (seedType === 'risk_issue_warning_rule') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'risk_issue_warning_rule_registry',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.12-risk-issue-warning-governance',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `risk_issue_warning_rule.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['risk_issue_warning_rule_registry'],
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? false,
      warningAuthorityPolicy: 'threshold_and_lifecycle_policy_only_no_fact_inference',
      signalConsumptionPolicy: {
        inputContract: 'impactSignalSummary_only',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
        confirmedDelaySignalStatuses: ['confirmed_delay'],
        uncertainRiskSignalStatuses: ['uncertain_risk'],
        forbiddenDirectBusinessTables: [
          'task_conditions',
          'task_obstacles',
          'acceptance_plans',
          'tasks',
        ],
      },
    }
  }
  if (seedType === 'progress_deviation_cause') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'progress_deviation_cause_registry',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.19-progress-deviation-cause-rule',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `progress_deviation_cause.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['progress_deviation_cause_registry'],
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? false,
      deviationAuthorityPolicy: 'cause_classification_only_no_progress_fact_authority',
    }
  }
  if (seedType === 'responsibility_health_rule') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'responsibility_health_rule_seed',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.10-responsibility-health-rule',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || 'responsibility_health_rule.default',
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['responsibility_health_rule_seed'],
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? false,
      healthAuthorityPolicy: 'responsibility_health_scoring_policy_only_no_task_fact_mutation',
    }
  }
  if (seedType === 'milestone_integrity_rule') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'milestone_integrity_rule_seed',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.9-milestone-integrity-rule',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `milestone_integrity_rule.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['milestone_integrity_rule_seed'],
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? false,
      planningGateAuthorityPolicy: 'milestone_integrity_gate_policy_only_no_schedule_fact_creation',
    }
  }
  if (seedType === 'standard_internal_flow') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    const evidenceCodes = normalizeTextArray(payload.evidenceCodes ?? payload.evidence_codes)
    const evidenceRefs = Array.isArray(payload.evidenceRefs ?? payload.evidence_refs)
      ? payload.evidenceRefs ?? payload.evidence_refs
      : []
    const relationKind = normalizeText(payload.relationKind ?? payload.relation_kind)
    const emitsImpactSignal = relationKind === 'acceptance_gate'
    return {
      stableCode,
      sourceStandard: normalizeText(payload.sourceStandard) || 'standard_internal_flow_seed',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.7.5-standard-internal-flow',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `standard_internal_flow.${stableCode}`,
      evidenceSourceKeys: evidenceCodes.length > 0
        ? evidenceCodes
        : normalizeTextArray(evidenceRefs.map((item: any) => item?.code)).length > 0
          ? normalizeTextArray(evidenceRefs.map((item: any) => item?.code))
          : ['standard_internal_flow_seed'],
      webVerified: payload.webVerified ?? false,
      reviewNeeded: payload.reviewNeeded ?? false,
      standardWorkCodes: Array.from(new Set([
        normalizeText(payload.predecessorStableCode),
        normalizeText(payload.successorStableCode),
      ].filter(Boolean))),
      durationContributionMode: 'quality_gate',
      baseDaysEligible: false,
      durationAuthorityPolicy: 'no_direct_duration_day_authority',
      impactSignalContract: {
        emitsImpactSignal,
        signalKind: emitsImpactSignal ? 'acceptance_gate' : 'flow_sequence',
        impactMode: emitsImpactSignal ? 'blocking_start' : 'confidence_only',
        impactOwnership: 'standard_internal_flow',
        sourceEntityIdPolicy: 'seedRuleId',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      },
      standardCatalogCodePrefixes: Array.from(new Set([
        normalizeText(payload.predecessorStableCode),
        normalizeText(payload.successorStableCode),
      ].filter(Boolean))),
    }
  }
  if (seedType === 'resource_class') {
    const explicitPressureDimensions = normalizeTextArray(payload.pressureDimensions ?? payload.pressure_dimensions)
    return {
      pressureDimensions: explicitPressureDimensions.length > 0
        ? explicitPressureDimensions
        : inferV1474ResourcePressureDimensions(payload.resourceClass ?? payload.resource_class),
    }
  }
  if (seedType === 'process_constraint') {
    const runtime = inferProcessConstraintRuntime(payload)
    const constraintType = normalizeText(payload.constraintType).toLowerCase()
    const applicationMode = normalizeText(payload.applicationMode ?? payload.application_mode)
      || (constraintType.includes('overlap') ? 'edge_overlap' : 'edge_lag')
    const partialOverlapRatio = normalizeNumber(payload.partialOverlapRatio ?? payload.partial_overlap_ratio, Number(runtime.partialOverlapRatio ?? 0))
    return {
      blockingLevel: normalizeText(payload.blockingLevel ?? payload.blocking_level) || runtime.blockingLevel,
      progressImpact: normalizeText(payload.progressImpact ?? payload.progress_impact) || runtime.progressImpact,
      partialOverlapRatio,
      startAfterPercent: Math.max(0, Math.min(100, normalizeNumber(payload.startAfterPercent ?? payload.start_after_percent, Math.round((1 - Math.min(Math.max(partialOverlapRatio, 0), 0.9)) * 100)))),
      scopeGranularity: normalizeText(payload.scopeGranularity ?? payload.scope_granularity) || 'zone',
      gateRequired: normalizeBoolean(payload.gateRequired ?? payload.gate_required, false),
      releaseQuantityPolicy: normalizeText(payload.releaseQuantityPolicy ?? payload.release_quantity_policy)
        || (applicationMode === 'edge_overlap'
          ? 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy'
          : 'not_applicable'),
      minReleaseQuantityPercent: Math.max(0, Math.min(100, normalizeNumber(payload.minReleaseQuantityPercent ?? payload.min_release_quantity_percent, Math.max(0, Math.min(100, normalizeNumber(payload.startAfterPercent ?? payload.start_after_percent, Math.round((1 - Math.min(Math.max(partialOverlapRatio, 0), 0.9)) * 100))))))),
      quantitySourcePriority: normalizeTextArray(payload.quantitySourcePriority ?? payload.quantity_source_priority).length > 0
        ? normalizeTextArray(payload.quantitySourcePriority ?? payload.quantity_source_priority)
        : (applicationMode === 'edge_overlap'
          ? ['task_planned_completed_quantity', 'standard_work_duration_default_quantity', 'scope_granularity_proxy']
          : []),
      insufficientQuantityPolicy: normalizeText(payload.insufficientQuantityPolicy ?? payload.insufficient_quantity_policy)
        || 'candidate_only_until_real_quantity_or_scope_release',
      quantityEvidenceRequirement: normalizeText(payload.quantityEvidenceRequirement ?? payload.quantity_evidence_requirement)
        || (applicationMode === 'edge_overlap' ? 'real_or_default_quantity_proxy_allowed' : 'not_applicable'),
      quantityReleaseEvidenceChecklist: normalizeTextArray(payload.quantityReleaseEvidenceChecklist ?? payload.quantity_release_evidence_checklist),
      quantityProxyRiskLevel: normalizeText(payload.quantityProxyRiskLevel ?? payload.quantity_proxy_risk_level)
        || (applicationMode === 'edge_overlap' ? 'medium' : 'not_applicable'),
      quantityDoubleCountPolicy: normalizeText(payload.quantityDoubleCountPolicy ?? payload.quantity_double_count_policy)
        || 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
      applicableScopeRule: normalizeText(payload.applicableScopeRule ?? payload.applicable_scope_rule) || 'same_zone',
      timeNature: normalizeText(payload.timeNature ?? payload.time_nature) || runtime.timeNature,
      applicationMode,
      impactMode: normalizeText(payload.impactMode ?? payload.impact_mode) || (applicationMode === 'edge_overlap' ? 'overlap_ratio' : 'duration_lookup'),
      runtimeActionPolicy: normalizeText(payload.runtimeActionPolicy ?? payload.runtime_action_policy) || (applicationMode === 'edge_overlap' ? 'candidate_only' : 'confidence_only'),
      timeSourcePolicy: normalizeText(payload.timeSourcePolicy ?? payload.time_source_policy) || 'explicit_carrier_or_standard_work_duration',
      durationLookupPolicy: normalizeText(payload.durationLookupPolicy ?? payload.duration_lookup_policy) || 'route_to_standard_work_duration_seed',
      durationLookupKeys: normalizeTextArray(payload.durationLookupKeys ?? payload.duration_lookup_keys).length > 0
        ? normalizeTextArray(payload.durationLookupKeys ?? payload.duration_lookup_keys)
        : [getAlgorithmSeedStableCode(seedType, payload)].filter(Boolean),
      carrierProcessHints: normalizeTextArray(payload.carrierProcessHints ?? payload.carrier_process_hints).length > 0
        ? normalizeTextArray(payload.carrierProcessHints ?? payload.carrier_process_hints)
        : normalizeTextArray(payload.keywords),
      matchStrategy: normalizeText(payload.matchStrategy ?? payload.match_strategy) || 'structured_code_first_then_keyword_fallback',
      requiredKeywordGroups: Array.isArray(payload.requiredKeywordGroups ?? payload.required_keyword_groups)
        ? (payload.requiredKeywordGroups ?? payload.required_keyword_groups)
        : [],
      excludedKeywordTerms: normalizeTextArray(payload.excludedKeywordTerms ?? payload.excluded_keyword_terms),
      standardCatalogCodePrefixes: normalizeTextArray(payload.standardCatalogCodePrefixes ?? payload.standard_catalog_code_prefixes),
      templateNodeStableCodePrefixes: normalizeTextArray(payload.templateNodeStableCodePrefixes ?? payload.template_node_stable_code_prefixes),
      applicableCatalogGroups: normalizeTextArray(payload.applicableCatalogGroups ?? payload.applicable_catalog_groups),
      applicableDurationContributionModes: normalizeTextArray(payload.applicableDurationContributionModes ?? payload.applicable_duration_contribution_modes),
      durationAuthorityPolicy: normalizeText(payload.durationAuthorityPolicy ?? payload.duration_authority_policy) || 'no_duration_values_in_process_constraint',
      impactSignalContract: {
        emitsImpactSignal: normalizeText(payload.impactMode ?? payload.impact_mode) !== 'confidence_only',
        signalKind: 'process_constraint',
        impactMode: normalizeText(payload.impactMode ?? payload.impact_mode) || (applicationMode === 'edge_overlap' ? 'overlap_ratio' : 'duration_lookup'),
        impactOwnership: 'process_constraint',
        sourceEntityIdPolicy: 'seedRuleId',
        duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
      },
      relationshipScope: normalizeText(payload.relationshipScope ?? payload.relationship_scope) || 'same_parent_or_cross_scope_edge',
      relationInputPolicy: normalizeText(payload.relationInputPolicy ?? payload.relation_input_policy) || 'requires_existing_relation',
      dependencyCreationPolicy: normalizeText(payload.dependencyCreationPolicy ?? payload.dependency_creation_policy) || 'never_create_dependency',
      parallelAllowedPolicy: normalizeText(payload.parallelAllowedPolicy ?? payload.parallel_allowed_policy) || 'parallel_allowed_is_no_edge_not_overlap',
      supportedRelationKinds: normalizeTextArray(payload.supportedRelationKinds ?? payload.supported_relation_kinds),
      explicitCarrierPolicy: normalizeText(payload.explicitCarrierPolicy ?? payload.explicit_carrier_policy) || 'skip_duration_add_when_explicit_carrier_process_exists',
      durationDoubleCountPolicy: normalizeText(payload.durationDoubleCountPolicy ?? payload.duration_double_count_policy) || 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
      conditionalEffects: normalizeProcessConstraintConditionalEffects(payload.conditionalEffects ?? payload.conditional_effects),
      backValidationPolicy: normalizeText(payload.backValidationPolicy ?? payload.back_validation_policy) || 'candidate_only_from_execution_history',
      businessReasonTemplate: normalizeText(payload.businessReasonTemplate ?? payload.business_reason_template) || '',
      boundaryPolicyNotes: Array.isArray(payload.boundaryPolicyNotes ?? payload.boundary_policy_notes)
        ? (payload.boundaryPolicyNotes ?? payload.boundary_policy_notes)
        : [],
    }
  }
  if (seedType === 'building_pattern') {
    return {
      typicalSectionCountRange: payload.typicalSectionCountRange ?? payload.typical_section_count_range ?? null,
      typicalCycleDaysByMethod: payload.typicalCycleDaysByMethod ?? payload.typical_cycle_days_by_method ?? {},
      typicalParallelCrews: Math.max(1, normalizeNumber(payload.typicalParallelCrews ?? payload.typical_parallel_crews, 1)),
      applicableStandardWorkCodes: inferStandardWorkCodes(seedType, payload),
      standardCatalogCodePrefixes: normalizeTextArray(payload.standardCatalogCodePrefixes ?? payload.standard_catalog_code_prefixes),
      templateNodeStableCodePrefixes: normalizeTextArray(payload.templateNodeStableCodePrefixes ?? payload.template_node_stable_code_prefixes),
      rhythmExpansionEligible: normalizeBoolean(payload.rhythmExpansionEligible ?? payload.rhythm_expansion_eligible, true),
      rhythmStrategyCodes: normalizeTextArray(payload.rhythmStrategyCodes ?? payload.rhythm_strategy_codes),
      expansionStrategy: normalizeText(payload.expansionStrategy ?? payload.expansion_strategy) || 'none',
      rhythmUnit: normalizeText(payload.rhythmUnit ?? payload.rhythm_unit) || '',
      negativeKeywords: normalizeTextArray(payload.negativeKeywords ?? payload.negative_keywords),
      requiredScopeDimensions: normalizeTextArray(payload.requiredScopeDimensions ?? payload.required_scope_dimensions),
      optionalScopeDimensions: normalizeTextArray(payload.optionalScopeDimensions ?? payload.optional_scope_dimensions),
      rhythmDrivers: normalizeTextArray(payload.rhythmDrivers ?? payload.rhythm_drivers),
      primaryWorkfaceType: normalizeText(payload.primaryWorkfaceType ?? payload.primary_workface_type) || null,
      phaseWindow: normalizeText(payload.phaseWindow ?? payload.phase_window) || null,
      patternRole: normalizeText(payload.patternRole ?? payload.pattern_role) || null,
      patternPriority: Math.max(0, normalizeNumber(payload.patternPriority ?? payload.pattern_priority, 0)),
      conflictGroup: normalizeText(payload.conflictGroup ?? payload.conflict_group) || null,
      coexistsWithGroups: normalizeTextArray(payload.coexistsWithGroups ?? payload.coexists_with_groups),
      controlChains: Array.isArray(payload.controlChains ?? payload.control_chains)
        ? (payload.controlChains ?? payload.control_chains)
        : [],
      durationCurveProfile: payload.durationCurveProfile ?? payload.duration_curve_profile ?? null,
      calibrationSignals: normalizeTextArray(payload.calibrationSignals ?? payload.calibration_signals),
      selfCalibrationPolicy: normalizeText(payload.selfCalibrationPolicy ?? payload.self_calibration_policy) || null,
      applicableConditions: normalizeTextArray(payload.applicableConditions ?? payload.applicable_conditions),
      exclusionConditions: normalizeTextArray(payload.exclusionConditions ?? payload.exclusion_conditions),
      applicableSignals: normalizeTextArray(payload.applicableSignals ?? payload.applicable_signals),
      exclusionSignals: normalizeTextArray(payload.exclusionSignals ?? payload.exclusion_signals),
      staggerRules: Array.isArray(payload.staggerRules ?? payload.stagger_rules)
        ? (payload.staggerRules ?? payload.stagger_rules)
        : [],
      parallelPolicy: payload.parallelPolicy ?? payload.parallel_policy ?? {},
      consumptionPolicy: payload.consumptionPolicy ?? payload.consumption_policy ?? {},
    }
  }
  if (seedType === 'standard_work_duration') {
    const p50 = Math.max(1, normalizeNumber(payload.defaultDaysP50 ?? payload.default_days_p50 ?? payload.defaultDays ?? payload.default_days, 1))
    const p20 = Math.max(1, normalizeNumber(payload.defaultDaysP20 ?? payload.default_days_p20, Math.max(1, Math.floor(p50 * 0.75))))
    const p80 = Math.max(1, normalizeNumber(payload.defaultDaysP80 ?? payload.default_days_p80, Math.ceil(p50 * 1.35)))
    const fixedDays = Math.max(0, normalizeNumber(payload.fixedDays ?? payload.fixed_days, 0))
    const variableDays = Math.max(0, normalizeNumber(payload.variableDays ?? payload.variable_days, Math.max(0, p50 - fixedDays)))
    const standardCatalogCodePrefixes = normalizeTextArray(payload.standardCatalogCodePrefixes ?? payload.standard_catalog_code_prefixes)
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    const durationContributionMode = normalizeDurationContributionMode(payload.durationContributionMode ?? payload.duration_contribution_mode)
      ?? inferDurationContributionMode({
        name: [
          payload.stableCode,
          ...(Array.isArray(payload.keywords) ? payload.keywords : []),
          payload.coverageRationale ?? payload.coverage_rationale,
        ].map(normalizeText).filter(Boolean).join(' '),
        metadata: payload,
      })
    const baseDaysEligible = durationContributionMode === 'duration_bearing'
      && normalizeBoolean(payload.baseDaysEligible ?? payload.base_days_eligible, true)
    return {
      ...payload,
      stableCode,
      standardWorkCodes: normalizeTextArray(payload.standardWorkCodes ?? payload.standard_work_codes),
      keywords: normalizeTextArray(payload.keywords),
      projectTypeCodes: normalizeTextArray(payload.projectTypeCodes ?? payload.project_type_codes),
      structureTypeCodes: normalizeTextArray(payload.structureTypeCodes ?? payload.structure_type_codes),
      applicableMethodCodes: normalizeTextArray(payload.applicableMethodCodes ?? payload.applicable_method_codes),
      elementVariantCodes: normalizeTextArray(payload.elementVariantCodes ?? payload.element_variant_codes),
      defaultDays: p50,
      defaultDaysP20: p20,
      defaultDaysP50: p50,
      defaultDaysP80: p80,
      fixedDays,
      variableDays,
      scaleBasis: normalizeText(payload.scaleBasis ?? payload.scale_basis) || 'workface',
      benchmarkBasis: normalizeText(payload.benchmarkBasis ?? payload.benchmark_basis) || '',
      baselineProductivity: payload.baselineProductivity ?? payload.baseline_productivity ?? null,
      productivityBands: Array.isArray(payload.productivityBands ?? payload.productivity_bands)
        ? (payload.productivityBands ?? payload.productivity_bands)
        : [],
      projectTypeDurationFactors: payload.projectTypeDurationFactors ?? payload.project_type_duration_factors ?? {},
      structureTypeDurationFactors: payload.structureTypeDurationFactors ?? payload.structure_type_duration_factors ?? {},
      elementVariantDurationFactors: payload.elementVariantDurationFactors ?? payload.element_variant_duration_factors ?? {},
      defaultDaysByMethod: payload.defaultDaysByMethod ?? payload.default_days_by_method ?? {},
      standardCatalogCodePrefixes,
      durationCoverageMode: normalizeText(payload.durationCoverageMode ?? payload.duration_coverage_mode) || (standardCatalogCodePrefixes.length > 0 ? 'direct' : 'external_support'),
      durationContributionMode,
      baseDaysEligible,
      coverageRationale: normalizeText(payload.coverageRationale ?? payload.coverage_rationale) || '',
      durationAuthorityPolicy: 'baseline_duration_context_only',
      warningAuthorityPolicy: 'no_warning_generation_authority',
      gateAuthorityPolicy: 'no_gate_signal_authority',
    }
  }
  if (seedType === 'title_weak_recognition') {
    const stableCode = getAlgorithmSeedStableCode(seedType, payload)
    return {
      stableCode,
      keywords: normalizeTextArray(payload.keywords),
      aliases: normalizeTextArray(payload.aliases),
      synonymGroups: Array.isArray(payload.synonymGroups ?? payload.synonym_groups)
        ? (payload.synonymGroups ?? payload.synonym_groups)
        : [],
      negativeKeywords: normalizeTextArray(payload.negativeKeywords ?? payload.negative_keywords),
      exclusionPatterns: normalizeTextArray(payload.exclusionPatterns ?? payload.exclusion_patterns),
      minMatchScore: payload.minMatchScore ?? payload.min_match_score ?? null,
      contextKeywordsByStandardWorkCode: payload.contextKeywordsByStandardWorkCode ?? payload.context_keywords_by_standard_work_code ?? {},
      applicableProcessKeywords: normalizeTextArray(payload.applicableProcessKeywords ?? payload.applicable_process_keywords),
      templateSeedReferences: normalizeTextArray(payload.templateSeedReferences ?? payload.template_seed_references),
      effectPolicy: payload.effectPolicy ?? payload.effect_policy ?? {},
      sourceStandard: normalizeText(payload.sourceStandard) || 'v1.4.7.2 standard work catalog',
      sourceVersion: normalizeText(payload.sourceVersion) || 'v1.4.7.2-title-weak-recognition',
      sourceClauseRef: normalizeText(payload.sourceClauseRef) || `title_weak_recognition.${stableCode}`,
      evidenceSourceKeys: normalizeTextArray(payload.evidenceSourceKeys).length > 0
        ? normalizeTextArray(payload.evidenceSourceKeys)
        : ['v1472_standard_catalog', 'v1472_domain_catalogs', 'v1418_standard_duration'],
      webVerified: payload.webVerified ?? true,
      reviewNeeded: payload.reviewNeeded ?? false,
      confidence: normalizeText(payload.confidence) || 'low',
      applicableGranularity: normalizeText(payload.applicableGranularity ?? payload.applicable_granularity) || 'both',
    }
  }
  if (seedType === 'earliest_start_rule') {
    return {
      scenario: normalizeText(payload.scenario) || 'unstarted_overdue',
      knownDateSources: payload.knownDateSources ?? payload.known_date_sources ?? {},
      unknownBlockerPolicy: payload.unknownBlockerPolicy ?? payload.unknown_blocker_policy ?? {},
      missedStartPolicy: payload.missedStartPolicy ?? payload.missed_start_policy ?? {},
      unknownBlockerPenalty: payload.unknownBlockerPenalty ?? payload.unknown_blocker_penalty ?? {},
      unstartedOverdueRiskPolicy: payload.unstartedOverdueRiskPolicy ?? payload.unstarted_overdue_risk_policy ?? {},
      referenceStalenessPolicy: payload.referenceStalenessPolicy ?? payload.reference_staleness_policy ?? {},
      forecastPolicy: payload.forecastPolicy ?? payload.forecast_policy ?? {},
    }
  }
  if (seedType === 'site_capacity_pressure') {
    return {
      stableCode: getAlgorithmSeedStableCode(seedType, payload),
      label: normalizeText(payload.label) || 'Site capacity pressure policy',
      weights: payload.weights ?? {},
      thresholds: payload.thresholds ?? {},
      caps: payload.caps ?? {},
      effectPolicy: payload.effectPolicy ?? payload.effect_policy ?? {},
    }
  }
  return normalizeCalendarFields(seedType, payload)
}

function buildRiskIssueWarningRuleSeedRecords(): AlgorithmSeedRecordPayload[] {
  const lifecycle = RISK_ISSUE_WARNING_RULE_REGISTRY.lifecycle
  const severity = RISK_ISSUE_WARNING_RULE_REGISTRY.warningSeverity
  return [
    {
      stableCode: 'risk_issue_warning:warning_to_risk',
      ruleCode: lifecycle.warningToRisk.code,
      ruleGroup: 'lifecycle',
      thresholdDays: lifecycle.warningToRisk.thresholdDays,
      source: lifecycle.warningToRisk.source,
      ruleVersion: 1,
      confidence: 'high',
    },
    {
      stableCode: 'risk_issue_warning:risk_to_issue',
      ruleCode: lifecycle.riskToIssue.code,
      ruleGroup: 'lifecycle',
      thresholdDays: lifecycle.riskToIssue.thresholdDays,
      source: lifecycle.riskToIssue.source,
      ruleVersion: 1,
      confidence: 'high',
    },
    {
      stableCode: 'risk_issue_warning:critical_path_delay',
      ruleCode: 'critical_path_delay',
      ruleGroup: 'warning_severity',
      warningDays: severity.criticalPathDelay.warningDays,
      criticalDays: severity.criticalPathDelay.criticalDays,
      ruleVersion: 1,
      confidence: 'high',
    },
    {
      stableCode: 'risk_issue_warning:delay_exceeded',
      ruleCode: 'delay_exceeded',
      ruleGroup: 'warning_severity',
      warningCount: severity.delayExceeded.warningCount,
      criticalCount: severity.delayExceeded.criticalCount,
      ruleVersion: 1,
      confidence: 'high',
    },
    {
      stableCode: 'risk_issue_warning:obstacle_timeout',
      ruleCode: 'obstacle_timeout',
      ruleGroup: 'warning_severity',
      warningDays: severity.obstacleTimeout.warningDays,
      criticalDays: severity.obstacleTimeout.criticalDays,
      ruleVersion: 1,
      confidence: 'high',
    },
    {
      stableCode: 'risk_issue_warning:critical_path_stagnation',
      ruleCode: 'critical_path_stagnation',
      ruleGroup: 'warning_severity',
      criticalDays: severity.criticalPathStagnation.criticalDays,
      ruleVersion: 1,
      confidence: 'high',
    },
  ]
}

function buildResponsibilityHealthRuleSeedRecords(): AlgorithmSeedRecordPayload[] {
  return [{
    stableCode: 'responsibility_health:default',
    ruleCode: 'responsibility_health_default',
    ruleGroup: 'responsibility_health',
    source: RESPONSIBILITY_HEALTH_RULE_SEED.source,
    ruleVersion: RESPONSIBILITY_HEALTH_RULE_SEED.ruleVersion,
    thresholds: RESPONSIBILITY_HEALTH_RULE_SEED.thresholds,
    pressureWeights: RESPONSIBILITY_HEALTH_RULE_SEED.pressureWeights,
    explainOnlyPressureSignals: RESPONSIBILITY_HEALTH_RULE_SEED.explainOnlyPressureSignals,
    riskPressurePolicy: RESPONSIBILITY_HEALTH_RULE_SEED.riskPressurePolicy,
    confidence: 'high',
  }]
}

function buildMilestoneIntegrityRuleSeedRecords(): AlgorithmSeedRecordPayload[] {
  return [
    {
      stableCode: 'milestone_integrity:commitment_anchor_policy',
      ruleCode: 'commitment_anchor_policy',
      ruleGroup: 'commitment_anchor',
      policyType: 'commitment_anchor',
      source: MILESTONE_INTEGRITY_RULE_SEED.source,
      ruleVersion: MILESTONE_INTEGRITY_RULE_SEED.ruleVersion,
      commitmentAnchorPolicy: MILESTONE_INTEGRITY_RULE_SEED.commitmentAnchorPolicy,
      confidence: 'high',
    },
    ...MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies.map((policy) => ({
      stableCode: `milestone_integrity:${policy.milestoneKey}`,
      ruleCode: `scenario_policy:${policy.milestoneKey}`,
      ruleGroup: 'scenario_policy',
      source: MILESTONE_INTEGRITY_RULE_SEED.source,
      ruleVersion: MILESTONE_INTEGRITY_RULE_SEED.ruleVersion,
      ...policy,
      confidence: 'high',
    })),
  ]
}

const RISK_ISSUE_WARNING_RULE_SEED_RECORDS = buildRiskIssueWarningRuleSeedRecords()
const RESPONSIBILITY_HEALTH_RULE_SEED_RECORDS = buildResponsibilityHealthRuleSeedRecords()
const MILESTONE_INTEGRITY_RULE_SEED_RECORDS = buildMilestoneIntegrityRuleSeedRecords()

function applySeedContentCloseoutPolicy(seedType: AlgorithmSeedType, record: AlgorithmSeedRecordPayload) {
  if (seedType !== 'cross_item_workflow') return record
  return {
    ...record,
    durationAuthorityPolicy: 'no_direct_duration_day_authority',
    impactSignalContract: {
      emitsImpactSignal: record.autoApplyPolicy !== 'candidate_only',
      signalKind: 'cross_item_dependency',
      impactMode: record.strength === 'hard' ? 'blocking_start' : 'confidence_only',
      impactOwnership: 'cross_item_workflow',
      sourceEntityIdPolicy: 'seedRuleId',
      duplicateCountPolicy: 'dedupe_by_impactMode_impactOwnership_sourceEntityId',
    },
  }
}

export function normalizeAlgorithmSeedRecordPayload(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload): AlgorithmSeedRecordPayload {
  const stableCode = getAlgorithmSeedStableCode(seedType, payload)
  const standardWorkCodes = inferStandardWorkCodes(seedType, payload)
  const sanitizedPayload = payload
  const seedSpecificFields = normalizeSeedSpecificFields(seedType, sanitizedPayload)
  const payloadWithSeedSpecificFields = { ...sanitizedPayload, ...seedSpecificFields }
  const isActive = seedType === 'resource_class'
    ? normalizeBoolean(sanitizedPayload.isActive ?? sanitizedPayload.is_active, false)
    : normalizeBoolean(sanitizedPayload.isActive ?? sanitizedPayload.is_active, true)
  const suppressDurationDefaults = seedType === 'process_constraint' || seedType === 'workflow_dictionary'
  const defaultDaysP50 = suppressDurationDefaults
    ? null
    : sanitizedPayload.defaultDaysP50 ?? sanitizedPayload.default_days_p50 ?? sanitizedPayload.defaultDays ?? sanitizedPayload.default_days ?? sanitizedPayload.mandatoryLagDays ?? sanitizedPayload.defaultLagDays ?? null
  const normalized: AlgorithmSeedRecordPayload = {
    ...sanitizedPayload,
    ...seedSpecificFields,
    seedRuleId: normalizeText(sanitizedPayload.seedRuleId ?? sanitizedPayload.seed_rule_id) || stableCode,
    ruleVersion: Math.max(1, Math.trunc(normalizeNumber(sanitizedPayload.ruleVersion ?? sanitizedPayload.rule_version, 1))),
    isActive,
    standardWorkCodes,
    standardCatalogCodePrefixes: seedType === 'standard_internal_flow'
      ? standardWorkCodes
      : normalizeTextArray(sanitizedPayload.standardCatalogCodePrefixes ?? sanitizedPayload.standard_catalog_code_prefixes),
    pressureDimensions: normalizeTextArray((seedSpecificFields as AlgorithmSeedRecordPayload).pressureDimensions ?? sanitizedPayload.pressureDimensions ?? sanitizedPayload.pressure_dimensions),
    typicalResponsibilityRole: normalizeText(sanitizedPayload.typicalResponsibilityRole ?? sanitizedPayload.typical_responsibility_role) || inferResponsibilityRole(seedType, sanitizedPayload),
    projectTypeCodes: normalizeTextArray(sanitizedPayload.projectTypeCodes ?? sanitizedPayload.project_type_codes),
    projectTypeDurationFactors: normalizeNumberRecord(sanitizedPayload.projectTypeDurationFactors ?? sanitizedPayload.project_type_duration_factors),
    structureTypeCodes: normalizeTextArray(sanitizedPayload.structureTypeCodes ?? sanitizedPayload.structure_type_codes),
    structureTypeDurationFactors: normalizeNumberRecord(sanitizedPayload.structureTypeDurationFactors ?? sanitizedPayload.structure_type_duration_factors),
    applicableMethodCodes: normalizeTextArray(sanitizedPayload.applicableMethodCodes ?? sanitizedPayload.applicable_method_codes),
    elementVariantCodes: normalizeTextArray(sanitizedPayload.elementVariantCodes ?? sanitizedPayload.element_variant_codes),
      elementVariantDurationFactors: normalizeNumberRecord(sanitizedPayload.elementVariantDurationFactors ?? sanitizedPayload.element_variant_duration_factors),
      defaultDaysByMethod: sanitizedPayload.defaultDaysByMethod ?? sanitizedPayload.default_days_by_method ?? {},
      baselineProductivity: sanitizedPayload.baselineProductivity ?? sanitizedPayload.baseline_productivity ?? null,
      conditionedDurationBands: sanitizedPayload.conditionedDurationBands ?? sanitizedPayload.conditioned_duration_bands ?? [],
      productivityBands: sanitizedPayload.productivityBands ?? sanitizedPayload.productivity_bands ?? [],
      conditionedProcessProfiles: sanitizedPayload.conditionedProcessProfiles ?? sanitizedPayload.conditioned_process_profiles ?? [],
      applicableGranularity: normalizeText(sanitizedPayload.applicableGranularity ?? sanitizedPayload.applicable_granularity) || 'both',
    defaultDaysP20: sanitizedPayload.defaultDaysP20 ?? sanitizedPayload.default_days_p20 ?? null,
    defaultDaysP50: defaultDaysP50 == null ? null : Number(defaultDaysP50),
    defaultDaysP80: sanitizedPayload.defaultDaysP80 ?? sanitizedPayload.default_days_p80 ?? null,
    evidenceQuality: buildEvidenceQuality(payloadWithSeedSpecificFields),
  }
  if (seedType === 'process_constraint' || seedType === 'workflow_dictionary') {
    for (const key of [
      'lagDays',
      'lag_days',
      'mandatoryLagDays',
      'mandatory_lag_days',
      'minimumLagDays',
      'minimum_lag_days',
      'defaultLagDays',
      'default_lag_days',
      'learnedLagDays',
      'learned_lag_days',
      'minimumDays',
      'minimum_days',
      'defaultDays',
      'default_days',
      'learnedDays',
      'learned_days',
    ]) {
      delete normalized[key]
    }
    normalized.defaultDaysP20 = null
    normalized.defaultDaysP50 = null
    normalized.defaultDaysP80 = null
    if (seedType === 'workflow_dictionary') {
      normalized.runtimeRole = 'recognition_signal'
      normalized.runtime_role = 'recognition_signal'
      normalized.keywordFallbackOnly = true
      normalized.keyword_fallback_only = true
      normalized.canCreateDependencies = false
      normalized.can_create_dependencies = false
      normalized.defaultLagDays = 0
      normalized.default_lag_days = 0
      normalized.lagDays = 0
      normalized.lag_days = 0
    }
  }
  if (seedType === 'standard_internal_flow') {
    normalized.defaultDaysP20 = null
    normalized.defaultDaysP50 = null
    normalized.defaultDaysP80 = null
  }
  return applySeedContentCloseoutPolicy(seedType, normalized)
}

export function isAlgorithmSeedPayloadActive(seedType: AlgorithmSeedType, payload: AlgorithmSeedRecordPayload) {
  return normalizeAlgorithmSeedRecordPayload(seedType, payload).isActive !== false
}

export const ALGORITHM_SEED_REGISTRY: AlgorithmSeedRegistryEntry[] = [
  {
    seedType: 'workflow_dictionary',
    records: V1474_WORKFLOW_DICTIONARY_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('workflow_dictionary', payload)),
    meta: V1474_WORKFLOW_DICTIONARY_SEED_META,
  },
  {
    seedType: 'cross_item_workflow',
    records: V1475_CROSS_ITEM_WORKFLOW_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('cross_item_workflow', payload)),
    meta: V1475_CROSS_ITEM_WORKFLOW_SEED_META,
  },
  {
    seedType: 'building_pattern',
    records: V1474_BUILDING_PATTERN_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('building_pattern', payload)),
    meta: V1474_BUILDING_PATTERN_SEED_META,
  },
  {
    seedType: 'process_constraint',
    records: V1474_PROCESS_CONSTRAINT_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('process_constraint', payload)),
    meta: V1474_PROCESS_CONSTRAINT_SEED_META,
  },
  {
    seedType: 'seasonal_productivity',
    records: V1474_SEASONAL_PRODUCTIVITY_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('seasonal_productivity', payload)),
    meta: V1474_SEASONAL_PRODUCTIVITY_SEED_META,
  },
  {
    seedType: 'work_calendar',
    records: V1474_WORK_CALENDAR_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('work_calendar', payload)),
    meta: V1474_WORK_CALENDAR_SEED_META,
  },
  {
    seedType: 'process_seasonal_sensitivity',
    records: V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('process_seasonal_sensitivity', payload)),
    meta: V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META,
  },
  {
    seedType: 'resource_class',
    records: V1474_RESOURCE_CLASS_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('resource_class', payload)),
    meta: V1474_RESOURCE_CLASS_SEED_META,
  },
  {
    seedType: 'site_capacity_pressure',
    records: V1474_SITE_CAPACITY_PRESSURE_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('site_capacity_pressure', payload)),
    meta: V1474_SITE_CAPACITY_PRESSURE_SEED_META,
  },
  {
    seedType: 'standard_work_duration',
    records: STANDARD_WORK_DURATION_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('standard_work_duration', payload)),
    meta: STANDARD_WORK_DURATION_SEED_META,
  },
  {
    seedType: 't2_division_rhythm_template',
    records: T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('t2_division_rhythm_template', payload)),
    meta: {
      seedVersion: T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
      seedScope: 't2_division_rhythm_template_standard_library',
      sourceStandards: ['curated_t2_division_rhythm_template_seed'],
      expectedCounts: { records: T2_DIVISION_RHYTHM_TEMPLATE_SEED.length },
      evidenceSources: [
        {
          sourceKey: 't2_division_rhythm_template_seed',
          title: 'Curated T2 division rhythm template standard library',
          sourceType: 'curated_schedule_rhythm_seed',
        },
      ],
      generationPolicy: 'governed seed records may override static rhythm templates for candidate schedule generation; runtime publication remains separately gated',
      webVerified: false,
      reviewNeeded: true,
    },
  },
  {
    seedType: 'master_plan_visibility_policy',
    records: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED.map((payload) => (
      normalizeAlgorithmSeedRecordPayload('master_plan_visibility_policy', payload)
    )),
    meta: DEFAULT_MASTER_PLAN_VISIBILITY_POLICY_SEED_META,
  },
  {
    seedType: 'title_weak_recognition',
    records: TITLE_WEAK_RECOGNITION_RULES.map((payload) => normalizeAlgorithmSeedRecordPayload('title_weak_recognition', payload)),
    meta: TITLE_WEAK_RECOGNITION_ALGORITHM_SEED_META,
  },
  {
    seedType: 'earliest_start_rule',
    records: V1418_EARLIEST_START_RULE_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('earliest_start_rule', payload)),
    meta: V1418_EARLIEST_START_RULE_SEED_META,
  },
  {
    seedType: 'standard_internal_flow',
    records: STANDARD_INTERNAL_FLOW_RULE_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('standard_internal_flow', payload)),
    meta: {
      seedVersion: 'v1.4.7.5-standard-internal-flow',
      seedScope: 'building_construction_standard_internal_flow',
      sourceStandards: ['GB50300', 'curated_standard_internal_flow_seed'],
      expectedCounts: { records: STANDARD_INTERNAL_FLOW_RULE_SEED.length },
      evidenceSources: [
        {
          sourceKey: 'standard_internal_flow_seed',
          title: 'Curated standard internal-flow rule seed',
          sourceType: 'curated_rule_seed',
        },
      ],
      generationPolicy: 'rule_seed_only; curated internal-flow rules are consumed as governed seed assets and never generated from generic keyword fallback',
      relationshipRole: 'standard_internal_flow',
      upstreamRuleTypes: ['standard_work_catalog', 'gb50300_quality_gate', 'enterprise_internal_flow'],
      downstreamRuleTypes: ['task_dependency_generation', 'execution_gate_seed', 'delay_forecast_signal_context'],
      boundaryPolicy: [
        'no_direct_duration_day_authority',
        'acceptance_gate_rules_emit_gate_signals_only',
        'runtime_consumers_must_dedupe_by_source_entity_id',
      ],
      webVerified: false,
      reviewNeeded: false,
    },
  },
  {
    seedType: 'regional_climate_rules',
    records: V1474_REGIONAL_CLIMATE_RULE_SEED.map((payload) => normalizeAlgorithmSeedRecordPayload('regional_climate_rules', payload)),
    meta: V1474_REGIONAL_CLIMATE_RULE_SEED_META,
  },
  {
    seedType: 'risk_issue_warning_rule',
    records: RISK_ISSUE_WARNING_RULE_SEED_RECORDS.map((payload) => normalizeAlgorithmSeedRecordPayload('risk_issue_warning_rule', payload)),
    meta: {
      seedVersion: 'v1.4.12-risk-issue-warning-rule-seed',
      seedScope: 'risk_issue_warning_rule',
      sourceStandards: ['risk_issue_warning_rule_registry', 'v1.4.12 risk issue warning governance'],
      expectedCounts: { records: RISK_ISSUE_WARNING_RULE_SEED_RECORDS.length },
      evidenceSources: [
        {
          sourceKey: 'risk_issue_warning_rule_registry',
          title: 'Risk/issue/warning lifecycle and severity threshold registry',
          sourceType: 'curated_rule_seed',
        },
      ],
      generationPolicy: 'rule_seed_only; warning lifecycle and severity thresholds are curated algorithm seed records and are never generic-generated',
      relationshipRole: 'risk_issue_warning_threshold_policy',
      upstreamRuleTypes: ['warning_impact_signal_summary'],
      downstreamRuleTypes: ['warningService', 'warningImpactSignalService', 'riskIssueWarningGovernanceService', 'upgradeChainService'],
      boundaryPolicy: [
        'owns lifecycle and severity thresholds only',
        'does_not_read_business_tables_directly',
        'runtime_warning_generation_must_consume_impact_signals',
      ],
      webVerified: false,
      reviewNeeded: false,
    },
  },
  {
    seedType: 'progress_deviation_cause',
    records: PROGRESS_DEVIATION_CAUSE_RULES.map((payload) => normalizeAlgorithmSeedRecordPayload('progress_deviation_cause', payload)),
    meta: {
      seedVersion: 'v1.4.19-progress-deviation-cause-rule-seed',
      seedScope: 'progress_deviation_cause',
      sourceStandards: ['structured_cause_taxonomy', 'progress_deviation_cause_registry', 'v1.4.19 health and deviation analysis'],
      expectedCounts: { records: PROGRESS_DEVIATION_CAUSE_RULES.length },
      evidenceSources: [
        {
          sourceKey: 'progress_deviation_cause_registry',
          title: 'Progress deviation cause classification registry',
          sourceType: 'curated_rule_seed',
        },
      ],
      generationPolicy: `rule_seed_only; ${STRUCTURED_CAUSE_TAXONOMY_VERSION} translates legacy factor signals to canonical causes and does not create progress facts`,
      relationshipRole: 'progress_deviation_cause_classifier',
      upstreamRuleTypes: ['duration_context_factor_summary', 'project_schedule_state', 'impact_signal_summary'],
      downstreamRuleTypes: ['progressDeviationService', 'Reports deviation reason chain', 'projectHealthDeviationSummaryService'],
      boundaryPolicy: [
        'cause_classification_only',
        'no_direct_schedule_or_progress_fact_mutation',
        'confidence_weight_is_explainability_context_not_health_score_authority',
      ],
      webVerified: false,
      reviewNeeded: false,
    },
  },
  {
    seedType: 'responsibility_health_rule',
    records: RESPONSIBILITY_HEALTH_RULE_SEED_RECORDS.map((payload) => normalizeAlgorithmSeedRecordPayload('responsibility_health_rule', payload)),
    meta: {
      seedVersion: 'v1.4.10-responsibility-health-rule-seed',
      seedScope: 'responsibility_health_rule',
      sourceStandards: ['responsibility_health_rule_seed', 'v1.4.10 responsibility health governance'],
      expectedCounts: { records: RESPONSIBILITY_HEALTH_RULE_SEED_RECORDS.length },
      evidenceSources: [
        {
          sourceKey: 'responsibility_health_rule_seed',
          title: 'Responsibility health threshold and pressure weighting policy',
          sourceType: 'curated_rule_seed',
        },
      ],
      generationPolicy: 'rule_seed_only; responsibility health thresholds are governed policy records and do not create task facts',
      relationshipRole: 'responsibility_health_scoring_policy',
      upstreamRuleTypes: ['responsibility_task_facts', 'risk_obstacle_pressure_facts'],
      downstreamRuleTypes: ['responsibilityInsightService', 'responsibilityAlertJob', 'weeklyDigestService'],
      boundaryPolicy: [
        'score_policy_only',
        'pressure_signals_are_explain_only_without_execution_fact',
        'no_task_status_or_owner_mutation',
      ],
      webVerified: false,
      reviewNeeded: false,
    },
  },
  {
    seedType: 'milestone_integrity_rule',
    records: MILESTONE_INTEGRITY_RULE_SEED_RECORDS.map((payload) => normalizeAlgorithmSeedRecordPayload('milestone_integrity_rule', payload)),
    meta: {
      seedVersion: 'v1.4.9-milestone-integrity-rule-seed',
      seedScope: 'milestone_integrity_rule',
      sourceStandards: ['milestone_integrity_rule_seed', 'v1.4.9 milestone and key-node governance'],
      expectedCounts: { records: MILESTONE_INTEGRITY_RULE_SEED_RECORDS.length },
      evidenceSources: [
        {
          sourceKey: 'milestone_integrity_rule_seed',
          title: 'Milestone integrity scenario and commitment anchor policy',
          sourceType: 'curated_rule_seed',
        },
      ],
      generationPolicy: 'rule_seed_only; milestone integrity policies govern gate/severity outputs and do not generate schedule facts',
      relationshipRole: 'milestone_integrity_gate_policy',
      upstreamRuleTypes: ['milestone_mapping', 'baseline_commitment_anchor', 'monthly_plan_commitment_anchor'],
      downstreamRuleTypes: ['milestoneIntegrityService', 'planningIntegrityService', 'planningGovernanceService', 'operationalNotificationService'],
      boundaryPolicy: [
        'gate_policy_only',
        'no_milestone_or_task_creation',
        'formal_anchor_broken_can_block_save_but_manual_unanchored_requires_confirmation',
      ],
      webVerified: false,
      reviewNeeded: false,
    },
  },
]

export function getAlgorithmSeedEntry(seedType: AlgorithmSeedType) {
  return ALGORITHM_SEED_REGISTRY.find((entry) => entry.seedType === seedType) ?? null
}

export function listAlgorithmSeedTypes() {
  return ALGORITHM_SEED_REGISTRY.map((entry) => entry.seedType)
}
