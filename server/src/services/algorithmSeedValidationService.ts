import {
  ALGORITHM_SEED_REGISTRY,
  normalizeAlgorithmSeedRecordPayload,
  type AlgorithmSeedRegistryEntry,
  type AlgorithmSeedRecordPayload,
  type AlgorithmSeedType,
  getAlgorithmSeedEvidenceKeys,
  getAlgorithmSeedStableCode,
} from './algorithmSeedRegistry.js'
import { flattenChinaTemplateCatalog } from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'

export type AlgorithmSeedValidationIssue = {
  seedType: AlgorithmSeedType
  stableCode?: string
  severity: 'error' | 'warn'
  governanceAction: 'error' | 'quarantine' | 'review' | 'warning'
  code: string
  message: string
}

export type AlgorithmSeedValidationIssueSummary = {
  errorCount: number
  quarantineCount: number
  reviewCount: number
  warningCount: number
}

export type AlgorithmSeedValidationEntry = {
  seedType: AlgorithmSeedType
  seedVersion: string
  expectedCount: number
  actualCount: number
  duplicateStableCodes: string[]
  webVerifiedFalseCount: number
  reviewNeededCount: number
  missingEvidenceCount: number
  missingSourceCount: number
  missingV1475FieldCount: number
  missingStandardCatalogMappingCount: number
}

export type AlgorithmSeedValidationResult = {
  ok: boolean
  strict: boolean
  entries: AlgorithmSeedValidationEntry[]
  issues: AlgorithmSeedValidationIssue[]
  issueSummary: AlgorithmSeedValidationIssueSummary
}

export type AlgorithmSeedRuntimePayloadValidationResult = {
  ok: boolean
  seedType: AlgorithmSeedType
  stableCode: string
  normalizedPayload: AlgorithmSeedRecordPayload
  issues: AlgorithmSeedValidationIssue[]
  issueSummary: AlgorithmSeedValidationIssueSummary
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeText).filter(Boolean)))
    : []
}

const STANDARD_CATALOG_CODES = [
  ...flattenChinaTemplateCatalog(),
  ...DOMAIN_WBS_TEMPLATE_CATALOGS.flatMap((catalog) => flattenChinaTemplateCatalog(catalog.divisions)),
]
  .map((node) => normalizeText(node.stableCode))
  .filter(Boolean)

const STANDARD_CATALOG_CODE_PREFIXES = new Set(
  STANDARD_CATALOG_CODES.flatMap((code) => {
    const parts = code.split('-').filter(Boolean)
    return parts.map((_, index) => parts.slice(0, index + 1).join('-'))
  }),
)

function catalogPrefixExists(prefix: string) {
  const normalized = normalizeText(prefix)
  if (!normalized) return false
  return STANDARD_CATALOG_CODE_PREFIXES.has(normalized)
}

function classifyAlgorithmSeedValidationIssue(code: string, severity: AlgorithmSeedValidationIssue['severity']): AlgorithmSeedValidationIssue['governanceAction'] {
  if (severity === 'warn') return 'warning'
  if ([
    'RECORD_EVIDENCE_INCOMPLETE',
    'MISSING_SOURCE_REFERENCE',
    'INVALID_META_REVIEW_STATUS',
  ].includes(code)) return 'quarantine'
  if ([
    'WEB_VERIFIED_FALSE',
    'REVIEW_NEEDED',
    'CANDIDATE_PAYLOAD_NOT_SOURCE_BACKED',
  ].includes(code)) return 'review'
  return 'error'
}

function buildAlgorithmSeedValidationIssue(
  issue: Omit<AlgorithmSeedValidationIssue, 'governanceAction'> & Partial<Pick<AlgorithmSeedValidationIssue, 'governanceAction'>>,
): AlgorithmSeedValidationIssue {
  return {
    ...issue,
    governanceAction: issue.governanceAction ?? classifyAlgorithmSeedValidationIssue(issue.code, issue.severity),
  }
}

function summarizeAlgorithmSeedValidationIssues(issues: readonly AlgorithmSeedValidationIssue[]): AlgorithmSeedValidationIssueSummary {
  return {
    errorCount: issues.filter((issue) => issue.governanceAction === 'error').length,
    quarantineCount: issues.filter((issue) => issue.governanceAction === 'quarantine').length,
    reviewCount: issues.filter((issue) => issue.governanceAction === 'review').length,
    warningCount: issues.filter((issue) => issue.governanceAction === 'warning').length,
  }
}

function validateEntry(entry: AlgorithmSeedRegistryEntry, strict: boolean) {
  const issues: AlgorithmSeedValidationIssue[] = []
  const stableCodes = new Map<string, number>()
  let webVerifiedFalseCount = 0
  let reviewNeededCount = 0
  let missingEvidenceCount = 0
  let missingSourceCount = 0
  let missingV1475FieldCount = 0
  let missingStandardCatalogMappingCount = 0

  const isStandardWorkDuration = entry.seedType === 'standard_work_duration'
  const isT2DivisionRhythmTemplate = entry.seedType === 't2_division_rhythm_template'
  const isInternalRuleSeed = entry.seedType === 'earliest_start_rule'
    || entry.seedType === 'standard_internal_flow'
  const isStandardInternalFlow = entry.seedType === 'standard_internal_flow'
  const isTitleWeakRecognition = entry.seedType === 'title_weak_recognition'
  const isProcessConstraint = entry.seedType === 'process_constraint'
  const isCrossItemWorkflow = entry.seedType === 'cross_item_workflow'
  const isWorkCalendar = entry.seedType === 'work_calendar'
  const isRegionalClimateRule = entry.seedType === 'regional_climate_rules'
  const isCuratedPolicySeed = [
    'master_plan_visibility_policy',
    'risk_issue_warning_rule',
    'progress_deviation_cause',
    'responsibility_health_rule',
    'milestone_integrity_rule',
  ].includes(entry.seedType)
  const isPolicyOrFactSeed = isRegionalClimateRule || isCuratedPolicySeed
  const expectedVersionMarker = isStandardWorkDuration
    ? 'v1.4.23'
    : isT2DivisionRhythmTemplate
      ? 'v1.4.23.1'
    : entry.seedType === 'master_plan_visibility_policy'
      ? 'v1.4.23.1'
    : isTitleWeakRecognition
      ? 'v1.4.7.2'
    : isCrossItemWorkflow
      ? 'v1.4.7.5'
    : isStandardInternalFlow
      ? 'v1.4.7.5'
    : isRegionalClimateRule
      ? 'v1.4.7.5'
    : entry.seedType === 'risk_issue_warning_rule'
      ? 'v1.4.12'
    : entry.seedType === 'progress_deviation_cause'
      ? 'v1.4.19'
    : entry.seedType === 'responsibility_health_rule'
      ? 'v1.4.10'
    : entry.seedType === 'milestone_integrity_rule'
      ? 'v1.4.9'
    : isInternalRuleSeed
      ? 'v1.4.18'
      : isProcessConstraint
      ? 'v1.4.22'
      : entry.seedType === 'process_seasonal_sensitivity'
      ? 'v1.4.7.5'
      : 'v1.4.7.4'
  const expectedScope = isStandardWorkDuration
    ? 'standard_work_duration'
    : isT2DivisionRhythmTemplate
      ? 't2_division_rhythm_template_standard_library'
    : isCrossItemWorkflow
      ? 'building_construction_cross_item_workflow'
      : isStandardInternalFlow
      ? 'building_construction_standard_internal_flow'
      : isRegionalClimateRule
      ? 'climate_environment_fact'
      : isCuratedPolicySeed
      ? entry.seedType
      : 'algorithm_auxiliary'
  const expectedPolicyMarker = isStandardWorkDuration
    ? 'source_backed_auto_upgrade'
    : isT2DivisionRhythmTemplate
      ? 'runtime publication remains separately gated'
    : isTitleWeakRecognition
      ? 'source_backed_auto_upgrade'
    : isCrossItemWorkflow
      ? 'confirmed_template_only'
    : isInternalRuleSeed || isCuratedPolicySeed
      ? 'rule_seed_only'
    : isRegionalClimateRule
      ? 'source_backed_climate_fact_only'
      : 'source_backed_no_generic_generation'

  if (!entry.meta.seedVersion || !entry.meta.seedVersion.includes(expectedVersionMarker)) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'INVALID_SEED_VERSION',
      message: `seedVersion must identify ${expectedVersionMarker}`,
    }))
  }

  if (entry.meta.seedScope !== expectedScope) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'INVALID_SEED_SCOPE',
      message: `seedScope must be ${expectedScope}`,
    }))
  }

  if (!Array.isArray(entry.meta.sourceStandards) || entry.meta.sourceStandards.length === 0) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'MISSING_SOURCE_STANDARDS',
      message: 'sourceStandards is required',
    }))
  }

  if (!Array.isArray(entry.meta.evidenceSources) || entry.meta.evidenceSources.length === 0) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'MISSING_EVIDENCE_SOURCES',
      message: 'evidenceSources is required',
    }))
  }

  if (!entry.meta.generationPolicy?.includes(expectedPolicyMarker)) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'GENERIC_GENERATION_NOT_BLOCKED',
      message: 'generationPolicy must remain source-backed and governed',
    }))
  }

  const metaReviewStatusOk = isT2DivisionRhythmTemplate
    ? entry.meta.webVerified === false && entry.meta.reviewNeeded === true
    : isInternalRuleSeed || isCuratedPolicySeed
      ? entry.meta.webVerified === false && entry.meta.reviewNeeded === false
      : entry.meta.webVerified === true && entry.meta.reviewNeeded === false

  if (!metaReviewStatusOk) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'INVALID_META_REVIEW_STATUS',
      message: isT2DivisionRhythmTemplate
        ? 'T2 rhythm seed meta must remain candidate-governed with webVerified=false and reviewNeeded=true'
        : isInternalRuleSeed || isCuratedPolicySeed
          ? 'internal rule seed meta must have webVerified=false and reviewNeeded=false'
          : 'seed meta must have webVerified=true and reviewNeeded=false',
    }))
  }

  for (const payload of entry.records) {
    const stableCode = getAlgorithmSeedStableCode(entry.seedType, payload)
    if (!stableCode) {
      issues.push(buildAlgorithmSeedValidationIssue({
        seedType: entry.seedType,
        severity: 'error',
        code: 'MISSING_STABLE_CODE',
        message: 'Each algorithm seed record must have a stable code',
      }))
      continue
    }

    stableCodes.set(stableCode, (stableCodes.get(stableCode) ?? 0) + 1)

    const calendarKind = normalizeText(payload.calendarKind ?? payload.calendar_kind)
    const isForecastCalendarWindow = isWorkCalendar
      && (
        calendarKind === 'forecast_calendar_window'
        || calendarKind === 'spring_festival_remobilization'
        || calendarKind === 'winter_shutdown'
        || calendarKind === 'plum_rain_window'
        || calendarKind === 'hot_summer_window'
        || calendarKind === 'dust_storm_window'
      )
    if (
      isT2DivisionRhythmTemplate || isInternalRuleSeed || isCuratedPolicySeed
        ? payload.webVerified !== false
        : payload.webVerified !== true
    ) webVerifiedFalseCount += 1
    if (
      isT2DivisionRhythmTemplate || isForecastCalendarWindow
        ? payload.reviewNeeded !== true
        : payload.reviewNeeded !== false
    ) reviewNeededCount += 1
    if (getAlgorithmSeedEvidenceKeys(payload).length === 0) missingEvidenceCount += 1
    if (!normalizeText(payload.sourceStandard) || !normalizeText(payload.sourceVersion) || !normalizeText(payload.sourceClauseRef)) {
      missingSourceCount += 1
    }
    const evidenceQuality = payload.evidenceQuality
    if (isT2DivisionRhythmTemplate) {
      const governance = payload.governance && typeof payload.governance === 'object' && !Array.isArray(payload.governance)
        ? payload.governance as Record<string, unknown>
        : {}
      const manualReviewRequiredFor = normalizeTextArray(governance.manualReviewRequiredFor ?? governance.manual_review_required_for)
      if (
        normalizeText(governance.governanceStatus ?? governance.governance_status) !== 'candidate_seeded'
        || governance.directRuntimeWrite !== false
        || governance.autoPublish !== false
        || manualReviewRequiredFor.length === 0
      ) {
        issues.push(buildAlgorithmSeedValidationIssue({
          seedType: entry.seedType,
          stableCode,
          severity: 'error',
          code: 'T2_RHYTHM_TEMPLATE_RUNTIME_BOUNDARY_INVALID',
          message: 'T2 rhythm templates must remain candidate-only, non-auto-published, and manually reviewed before runtime materialization',
        }))
      }
    }
    const standardWorkCodes = Array.isArray(payload.standardWorkCodes) ? payload.standardWorkCodes : []
    const isTitleWeakStandardHint = isTitleWeakRecognition && normalizeText(payload.signalType) === 'standard_work_hint'
    const effectPolicy = payload.effectPolicy && typeof payload.effectPolicy === 'object' && !Array.isArray(payload.effectPolicy)
      ? payload.effectPolicy as Record<string, unknown>
      : {}
    if (isTitleWeakStandardHint && standardWorkCodes.some((code) => normalizeText(code).startsWith('legacy:'))) {
      issues.push(buildAlgorithmSeedValidationIssue({
        seedType: entry.seedType,
        stableCode,
        severity: 'error',
        code: 'TITLE_WEAK_STANDARD_HINT_NOT_MAPPED',
        message: 'standard_work_hint title weak rules must map to existing standard work codes, not legacy placeholders',
      }))
    }
    if (isTitleWeakRecognition && (
      effectPolicy.canAffectBaseDays !== false
      || effectPolicy.canGenerateRows !== false
      || effectPolicy.canAffectScale === true
    )) {
      issues.push(buildAlgorithmSeedValidationIssue({
        seedType: entry.seedType,
        stableCode,
        severity: 'error',
        code: 'TITLE_WEAK_RULE_OVER_AUTHORIZED',
        message: 'title weak recognition rules must not directly set base days or generate rows',
      }))
    }
    if (isTitleWeakRecognition) {
      const minMatchScore = Number(payload.minMatchScore ?? payload.min_match_score ?? 0)
      if ((payload.minMatchScore ?? payload.min_match_score) != null && (!Number.isFinite(minMatchScore) || minMatchScore < 0 || minMatchScore > 1)) {
        issues.push(buildAlgorithmSeedValidationIssue({
          seedType: entry.seedType,
          stableCode,
          severity: 'error',
          code: 'TITLE_WEAK_MATCH_SCORE_INVALID',
          message: 'title weak recognition minMatchScore must be between 0 and 1',
        }))
      }
      const exclusionPatterns = normalizeTextArray(payload.exclusionPatterns ?? payload.exclusion_patterns)
      for (const patternText of exclusionPatterns) {
        try {
          // eslint-disable-next-line no-new
          new RegExp(patternText, 'i')
        } catch {
          issues.push(buildAlgorithmSeedValidationIssue({
            seedType: entry.seedType,
            stableCode,
            severity: 'error',
            code: 'TITLE_WEAK_EXCLUSION_PATTERN_INVALID',
            message: `invalid title weak exclusion pattern: ${patternText}`,
          }))
        }
      }
    }
    const durationCoverageMode = normalizeText(payload.durationCoverageMode ?? payload.duration_coverage_mode)
    const standardCatalogCodePrefixes = normalizeTextArray(payload.standardCatalogCodePrefixes ?? payload.standard_catalog_code_prefixes)
    const durationContributionMode = normalizeText(payload.durationContributionMode ?? payload.duration_contribution_mode)
    const baseDaysEligible = payload.baseDaysEligible ?? payload.base_days_eligible
    const hasBaseDaysEligibility = !isStandardWorkDuration || typeof baseDaysEligible === 'boolean'
    const baseDaysEligibilityConsistent = !isStandardWorkDuration
      || (durationContributionMode === 'duration_bearing' ? baseDaysEligible === true : baseDaysEligible === false)
    const hasStandardCatalogMapping = !isStandardWorkDuration
      || durationCoverageMode === 'external_support'
      || standardCatalogCodePrefixes.some(catalogPrefixExists)
    if (!hasStandardCatalogMapping) missingStandardCatalogMappingCount += 1
    const hasDurationContributionMode = !isStandardWorkDuration || Boolean(durationContributionMode)
    const hasV1475Core = Boolean(
      normalizeText(payload.seedRuleId)
      && Number.isFinite(Number(payload.ruleVersion))
      && typeof payload.isActive === 'boolean'
      && (standardWorkCodes.length > 0 || isTitleWeakRecognition || isPolicyOrFactSeed || isWorkCalendar || entry.seedType === 'site_capacity_pressure')
      && evidenceQuality
      && typeof evidenceQuality === 'object'
      && !Array.isArray(evidenceQuality),
    )
    const hasRuntimeBlockingFields = entry.seedType === 'process_constraint'
      ? Boolean(normalizeText(payload.blockingLevel) && normalizeText(payload.progressImpact))
      : true
    const hasCalendarFields = entry.seedType === 'work_calendar'
      ? Boolean(typeof payload.isCompensatoryWorkday === 'boolean' && normalizeText(payload.adjustmentOrigin) && normalizeText(payload.calendarKind))
      : true
    const hasResourceInactiveMarker = entry.seedType === 'resource_class'
      ? payload.isActive === false
      : true
    if (!hasV1475Core || !hasRuntimeBlockingFields || !hasCalendarFields || !hasResourceInactiveMarker || !hasStandardCatalogMapping || !hasDurationContributionMode || !hasBaseDaysEligibility || !baseDaysEligibilityConsistent) {
      missingV1475FieldCount += 1
    }
  }

  const duplicateStableCodes = Array.from(stableCodes.entries())
    .filter(([, count]) => count > 1)
    .map(([stableCode]) => stableCode)

  if (entry.meta.expectedCounts.records !== entry.records.length) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: 'error',
      code: 'EXPECTED_COUNT_MISMATCH',
      message: `expectedCounts.records=${entry.meta.expectedCounts.records}, actual=${entry.records.length}`,
    }))
  }

  for (const stableCode of duplicateStableCodes) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      stableCode,
      severity: 'error',
      code: 'DUPLICATE_STABLE_CODE',
      message: 'stableCode must be unique within the seed type',
    }))
  }

  if (webVerifiedFalseCount > 0 || reviewNeededCount > 0 || missingEvidenceCount > 0 || missingSourceCount > 0) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: strict ? 'error' : 'warn',
      code: 'RECORD_EVIDENCE_INCOMPLETE',
      message: isT2DivisionRhythmTemplate
        ? 'T2 rhythm template records must remain candidate-reviewed, evidence-backed, source-referenced, and marked webVerified=false'
        : isInternalRuleSeed || isCuratedPolicySeed
          ? 'Curated internal policy records must be review-clean, evidence-backed, source-referenced, and marked webVerified=false'
          : isWorkCalendar
            ? 'Work calendar records must be evidence-backed; official windows are review-clean and forecast windows must be explicitly marked reviewNeeded=true'
            : 'All records must be web verified, review-clean, evidence-backed, and source-referenced',
    }))
  }

  if (missingV1475FieldCount > 0) {
    issues.push(buildAlgorithmSeedValidationIssue({
      seedType: entry.seedType,
      severity: strict ? 'error' : 'warn',
      code: 'V1475_STRUCTURED_FIELDS_INCOMPLETE',
      message: 'All runtime-consumed seed records must include v1.4.7.5 structured fields, evidence quality, and runtime impact metadata',
    }))
  }

  return {
    entry: {
      seedType: entry.seedType,
      seedVersion: entry.meta.seedVersion,
      expectedCount: entry.meta.expectedCounts.records,
      actualCount: entry.records.length,
      duplicateStableCodes,
      webVerifiedFalseCount,
      reviewNeededCount,
      missingEvidenceCount,
      missingSourceCount,
      missingV1475FieldCount,
      missingStandardCatalogMappingCount,
    } satisfies AlgorithmSeedValidationEntry,
    issues,
  }
}

export function validateV1474AlgorithmSeeds(options: { strict?: boolean; seedType?: AlgorithmSeedType } = {}): AlgorithmSeedValidationResult {
  const strict = Boolean(options.strict)
  const selected = options.seedType
    ? ALGORITHM_SEED_REGISTRY.filter((entry) => entry.seedType === options.seedType)
    : ALGORITHM_SEED_REGISTRY

  const entries: AlgorithmSeedValidationEntry[] = []
  const issues: AlgorithmSeedValidationIssue[] = []

  for (const registryEntry of selected) {
    const result = validateEntry(registryEntry, strict)
    entries.push(result.entry)
    issues.push(...result.issues)
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    strict,
    entries,
    issues,
    issueSummary: summarizeAlgorithmSeedValidationIssues(issues),
  }
}

export function validateAlgorithmSeedRuntimePayload(
  seedType: AlgorithmSeedType,
  payload: AlgorithmSeedRecordPayload,
  options: { strict?: boolean; stableCode?: string | null } = {},
): AlgorithmSeedRuntimePayloadValidationResult {
  const normalizedPayload = normalizeAlgorithmSeedRecordPayload(seedType, payload ?? {})
  const stableCode = normalizeText(options.stableCode) || getAlgorithmSeedStableCode(seedType, normalizedPayload)
  const issues: AlgorithmSeedValidationIssue[] = []

  const push = (
    code: string,
    message: string,
    severity: AlgorithmSeedValidationIssue['severity'] = 'error',
    governanceAction?: AlgorithmSeedValidationIssue['governanceAction'],
  ) => {
    issues.push(buildAlgorithmSeedValidationIssue({ seedType, stableCode, severity, code, message, governanceAction }))
  }

  if (!stableCode) {
    push('MISSING_STABLE_CODE', 'runtime seed payload must have a stable code')
  }

  if (getAlgorithmSeedEvidenceKeys(normalizedPayload).length === 0) {
    push('RECORD_EVIDENCE_INCOMPLETE', 'runtime seed payload must include evidenceSourceKeys')
  }

  if (
    !normalizeText(normalizedPayload.sourceStandard)
    || !normalizeText(normalizedPayload.sourceVersion)
    || !normalizeText(normalizedPayload.sourceClauseRef)
  ) {
    push('MISSING_SOURCE_REFERENCE', 'runtime seed payload must include sourceStandard, sourceVersion, and sourceClauseRef')
  }

  const standardWorkCodes = normalizeTextArray(normalizedPayload.standardWorkCodes)
  const evidenceQuality = normalizedPayload.evidenceQuality
  if (
    !normalizeText(normalizedPayload.seedRuleId)
    || !Number.isFinite(Number(normalizedPayload.ruleVersion))
    || typeof normalizedPayload.isActive !== 'boolean'
    || (![
      'title_weak_recognition',
      'work_calendar',
      'site_capacity_pressure',
      'regional_climate_rules',
      'risk_issue_warning_rule',
      'progress_deviation_cause',
      'responsibility_health_rule',
      'milestone_integrity_rule',
    ].includes(seedType) && standardWorkCodes.length === 0)
    || !evidenceQuality
    || typeof evidenceQuality !== 'object'
    || Array.isArray(evidenceQuality)
  ) {
    push('V1475_STRUCTURED_FIELDS_INCOMPLETE', 'runtime seed payload must include normalized v1.4.7.5 structured fields')
  }

  if (seedType === 'standard_work_duration') {
    const contributionMode = normalizeText(normalizedPayload.durationContributionMode ?? normalizedPayload.duration_contribution_mode)
    const baseDaysEligible = normalizedPayload.baseDaysEligible ?? normalizedPayload.base_days_eligible
    const defaultDaysP50 = Number(normalizedPayload.defaultDaysP50 ?? normalizedPayload.default_days_p50)
    if (!contributionMode) {
      push('DURATION_CONTRIBUTION_MODE_MISSING', 'standard_work_duration payload must define durationContributionMode')
    }
    if (typeof baseDaysEligible !== 'boolean') {
      push('BASE_DAYS_ELIGIBILITY_MISSING', 'standard_work_duration payload must define baseDaysEligible')
    }
    if (contributionMode === 'duration_bearing' && (!Number.isFinite(defaultDaysP50) || defaultDaysP50 <= 0)) {
      push('BASE_DAYS_VALUE_MISSING', 'duration-bearing standard_work_duration payload must include a positive defaultDaysP50')
    }
    if (contributionMode === 'duration_bearing' && baseDaysEligible !== true) {
      push('BASE_DAYS_ELIGIBILITY_INCONSISTENT', 'duration-bearing standard_work_duration payload must be baseDaysEligible=true')
    }
    if (contributionMode && contributionMode !== 'duration_bearing' && baseDaysEligible !== false) {
      push('BASE_DAYS_ELIGIBILITY_INCONSISTENT', 'non-duration-bearing standard_work_duration payload must be baseDaysEligible=false')
    }
  }

  if (seedType === 'process_constraint') {
    if (!normalizeText(normalizedPayload.blockingLevel) || !normalizeText(normalizedPayload.progressImpact)) {
      push('PROCESS_CONSTRAINT_RUNTIME_FIELDS_MISSING', 'process_constraint payload must include blockingLevel and progressImpact')
    }
    if (
      normalizedPayload.defaultDays != null
      || normalizedPayload.learnedDays != null
      || normalizedPayload.defaultDaysP50 != null
    ) {
      push('PROCESS_CONSTRAINT_DURATION_AUTHORITY_FORBIDDEN', 'process_constraint payload cannot own direct duration day values')
    }
  }

  if (seedType === 'title_weak_recognition') {
    const effectPolicy = normalizedPayload.effectPolicy && typeof normalizedPayload.effectPolicy === 'object' && !Array.isArray(normalizedPayload.effectPolicy)
      ? normalizedPayload.effectPolicy as Record<string, unknown>
      : {}
    if (
      effectPolicy.canAffectBaseDays !== false
      || effectPolicy.canGenerateRows !== false
      || effectPolicy.canAffectScale === true
    ) {
      push('TITLE_WEAK_RULE_OVER_AUTHORIZED', 'title_weak_recognition payload cannot directly set base days, scale, or generated rows')
    }
  }

  const strict = options.strict ?? true
  return {
    ok: strict
      ? issues.every((issue) => issue.severity !== 'error')
      : true,
    seedType,
    stableCode,
    normalizedPayload,
    issues,
    issueSummary: summarizeAlgorithmSeedValidationIssues(issues),
  }
}
