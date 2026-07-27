import {
  STANDARD_WORK_DURATION_SEED,
  type StandardWorkDurationSeedRule,
} from '../seeds/standardWorkDurationSeed.js'

export type StandardWorkDurationSeedQualityFindingSeverity = 'blocker' | 'review_required' | 'info'

export type StandardWorkDurationSeedQualityFinding = {
  code:
    | 'DISTRIBUTION_TOO_WIDE'
    | 'STRICT_P50_WINDOW_REVIEW'
    | 'PRODUCTIVITY_SOURCE_MISSING'
    | 'QUOTA_PRODUCTIVITY_SOURCE_UNSTRUCTURED'
    | 'CONFIDENCE_PROVENANCE_REVIEW'
    | 'CONDITION_DEPTH_REVIEW'
    | 'CONDITION_BAND_SET_INCOMPLETE'
  severity: StandardWorkDurationSeedQualityFindingSeverity
  stableCode: string
  standardWorkCodes: string[]
  message: string
  metrics?: Record<string, number | string | null>
  recommendation: string
}

export type StandardWorkDurationSeedQualityAuditReport = {
  reportCode: 'standard_work_duration_seed_quality_audit'
  generatedAt: string
  summary: {
    totalRuleCount: number
    durationBearingRuleCount: number
    blockerCount: number
    reviewRequiredCount: number
    distribution: {
      wideDistributionCount: number
      strictP50WindowReviewCount: number
      maxP80P20Ratio: number
    }
    productivityTraceability: {
      productivityEntryCount: number
      missingSourceCount: number
      unstructuredQuotaSourceCount: number
    }
    confidence: {
      highConfidenceCount: number
      mediumConfidenceCount: number
      lowConfidenceCount: number
      highConfidenceWithoutStrongSourceCount: number
    }
    conditionDepth: {
      conditionizedRuleCount: number
      missingDepthReviewCount: number
      incompleteConditionSetReviewCount: number
      conditionedDurationBandCount: number
      conditionedProcessProfileCount: number
      productivityBandCount: number
    }
  }
  findings: StandardWorkDurationSeedQualityFinding[]
  governanceBoundary: {
    reportOnly: true
    seedWritePolicy: 'never_write_seed_from_quality_audit'
    promotionPolicy: 'review_required_before_seed_promotion'
    allowedUse: 'backend_seed_quality_governance'
  }
}

export type StandardWorkDurationSeedQualityAuditOptions = {
  records?: StandardWorkDurationSeedRule[]
}

type ProductivityEntry = {
  owner: string
  ownerRule: StandardWorkDurationSeedRule
  productivity: Record<string, unknown>
}

const STRICT_P50_WINDOW_RATIO = 0.3
const WIDE_DISTRIBUTION_RATIO = 4

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundMetric(value: number) {
  return Number(value.toFixed(6))
}

function isDurationBearing(record: StandardWorkDurationSeedRule) {
  return record.baseDaysEligible === true || record.durationContributionMode === 'duration_bearing'
}

function readProductivityEntries(records: StandardWorkDurationSeedRule[]): ProductivityEntry[] {
  return records.flatMap((record) => {
    const own = record.baselineProductivity
      ? [{ owner: record.stableCode, ownerRule: record, productivity: record.baselineProductivity as Record<string, unknown> }]
      : []
    const bands = Array.isArray(record.productivityBands)
      ? record.productivityBands.map((band) => ({
        owner: `${record.stableCode}:${normalizeText((band as any).conditionCode) || 'condition'}`,
        ownerRule: record,
        productivity: (band as any).baselineProductivity as Record<string, unknown>,
      }))
      : []
    return [...own, ...bands].filter((entry) => entry.productivity && typeof entry.productivity === 'object')
  })
}

function sourceType(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function hasStructuredQuotaSource(productivity: Record<string, unknown>) {
  return /^quota:[A-Z0-9-]+:chapter=[^:]+:table=[^:]+:item=[^:]+$/.test(normalizeText(productivity.sourceRef))
    && /chapter=.*table=.*item=/i.test(normalizeText(productivity.sourceDetail))
}

function hasProductivitySource(productivity: Record<string, unknown>) {
  const type = sourceType(productivity.sourceType)
  return ['quota', 'expert_profile', 'expert_override', 'derived_seed'].includes(type)
    && normalizeText(productivity.sourceRef).length > 8
    && normalizeText(productivity.sourceDetail).length > 16
}

function hasSpecificStandardSource(record: StandardWorkDurationSeedRule) {
  const text = [
    record.stableCode,
    record.sourceStandard,
    record.sourceClauseRef,
    record.benchmarkBasis,
  ].join(' ').toLowerCase()

  return !text.includes('expert_estimate')
    && /ty01|gb\s*\d|gb\d/.test(text)
    && (record.standardCatalogCodePrefixes?.length ?? 0) > 0
    && !/before exact|family before exact|before project-specific/.test(text)
}

function isStrongSourceBacked(record: StandardWorkDurationSeedRule) {
  if (normalizeText(record.sourceStandard).toLowerCase().includes('expert_estimate')) return false
  const productivityEntries = readProductivityEntries([record])
  return productivityEntries.some((entry) => {
    const type = sourceType(entry.productivity.sourceType)
    return type === 'quota' || type === 'expert_override'
  }) || /expert_override=|expertSignalConfirmation=|domainExpert=/.test(`${record.benchmarkBasis};${record.sourceClauseRef}`)
    || hasSpecificStandardSource(record)
}

function hasAnyConditionDepth(record: StandardWorkDurationSeedRule) {
  return (record.conditionedDurationBands?.length ?? 0) > 0
    || (record.conditionedProcessProfiles?.length ?? 0) > 0
    || (record.productivityBands?.length ?? 0) > 0
}

function conditionCodeSet(items: Array<{ conditionCode?: string } | undefined> | undefined) {
  return new Set((items ?? []).map((item) => normalizeText(item?.conditionCode)).filter(Boolean))
}

function conditionSetCompleteness(record: StandardWorkDurationSeedRule) {
  const durationCodes = conditionCodeSet(record.conditionedDurationBands)
  const productivityCodes = conditionCodeSet(record.productivityBands)
  const processProfileCodes = conditionCodeSet(record.conditionedProcessProfiles)
  const allCodes = Array.from(new Set([
    ...durationCodes,
    ...productivityCodes,
    ...processProfileCodes,
  ]))

  const incompleteConditionCodes = allCodes.filter((code) => (
    !durationCodes.has(code)
    || !productivityCodes.has(code)
    || !processProfileCodes.has(code)
  ))

  return {
    incompleteConditionCodes,
    missingDurationBandCount: incompleteConditionCodes.filter((code) => !durationCodes.has(code)).length,
    missingProductivityBandCount: incompleteConditionCodes.filter((code) => !productivityCodes.has(code)).length,
    missingProcessProfileCount: incompleteConditionCodes.filter((code) => !processProfileCodes.has(code)).length,
  }
}

function addFinding(findings: StandardWorkDurationSeedQualityFinding[], finding: StandardWorkDurationSeedQualityFinding) {
  findings.push(finding)
}

export function buildStandardWorkDurationSeedQualityAuditReport(
  options: StandardWorkDurationSeedQualityAuditOptions = {},
): StandardWorkDurationSeedQualityAuditReport {
  const records = options.records ?? STANDARD_WORK_DURATION_SEED
  const durationBearingRules = records.filter(isDurationBearing)
  const findings: StandardWorkDurationSeedQualityFinding[] = []
  let maxP80P20Ratio = 0

  for (const record of durationBearingRules) {
    const p20 = normalizeNumber(record.defaultDaysP20)
    const p50 = normalizeNumber(record.defaultDaysP50)
    const p80 = normalizeNumber(record.defaultDaysP80)
    if (!p20 || !p50 || !p80 || p20 <= 0 || p50 <= 0 || p80 <= 0) continue

    const p80P20Ratio = p80 / p20
    maxP80P20Ratio = Math.max(maxP80P20Ratio, p80P20Ratio)
    if (p80P20Ratio >= WIDE_DISTRIBUTION_RATIO) {
      addFinding(findings, {
        code: 'DISTRIBUTION_TOO_WIDE',
        severity: 'blocker',
        stableCode: record.stableCode,
        standardWorkCodes: record.standardWorkCodes,
        message: 'P80/P20 dispersion is too wide for a standard-condition duration baseline.',
        metrics: { p20, p50, p80, p80P20Ratio: roundMetric(p80P20Ratio) },
        recommendation: 'Split the family or add conditionized duration/productivity/process-profile bands before trusting this P50.',
      })
    }

    const lowerBound = Math.max(1, Math.round(p50 * (1 - STRICT_P50_WINDOW_RATIO)))
    const upperBound = Math.max(lowerBound, Math.round(p50 * (1 + STRICT_P50_WINDOW_RATIO)))
    if (p20 < lowerBound || p80 > upperBound) {
      addFinding(findings, {
        code: 'STRICT_P50_WINDOW_REVIEW',
        severity: p80P20Ratio >= WIDE_DISTRIBUTION_RATIO ? 'blocker' : 'review_required',
        stableCode: record.stableCode,
        standardWorkCodes: record.standardWorkCodes,
        message: 'The P20/P80 band exceeds the +/-30% precision window around P50.',
        metrics: { p20, p50, p80, lowerBound, upperBound },
        recommendation: 'Review P50 calibration, sample grouping, or condition selectors; replay evidence is required before promotion.',
      })
    }

    if ((p80P20Ratio >= WIDE_DISTRIBUTION_RATIO || (p80 - p20) / p50 > 0.75) && !hasAnyConditionDepth(record)) {
      addFinding(findings, {
        code: 'CONDITION_DEPTH_REVIEW',
        severity: 'review_required',
        stableCode: record.stableCode,
        standardWorkCodes: record.standardWorkCodes,
        message: 'A high-variance duration-bearing rule has no conditionized duration/productivity/process-profile depth.',
        metrics: { p80P20Ratio: roundMetric(p80P20Ratio), relativeSpread: roundMetric((p80 - p20) / p50) },
        recommendation: 'Add intrinsic condition bands such as depth, diameter, workface, height, method, renovation, or placement mode.',
      })
    }

    if (record.confidence === 'high' && !isStrongSourceBacked(record)) {
      addFinding(findings, {
        code: 'CONFIDENCE_PROVENANCE_REVIEW',
        severity: 'review_required',
        stableCode: record.stableCode,
        standardWorkCodes: record.standardWorkCodes,
        message: 'High confidence is not backed by quota, exact expert override, or strong source provenance.',
        recommendation: 'Downgrade confidence or attach quota/expert-override evidence before treating this P50 as high trust.',
      })
    }

    if (hasAnyConditionDepth(record)) {
      const completeness = conditionSetCompleteness(record)
      if (completeness.incompleteConditionCodes.length > 0) {
        addFinding(findings, {
          code: 'CONDITION_BAND_SET_INCOMPLETE',
          severity: 'review_required',
          stableCode: record.stableCode,
          standardWorkCodes: record.standardWorkCodes,
          message: 'Conditionized standard-duration depth is incomplete: each condition code should carry duration, process-profile, and productivity evidence together.',
          metrics: {
            incompleteConditionCodeCount: completeness.incompleteConditionCodes.length,
            incompleteConditionCodes: completeness.incompleteConditionCodes.join(','),
            missingDurationBandCount: completeness.missingDurationBandCount,
            missingProductivityBandCount: completeness.missingProductivityBandCount,
            missingProcessProfileCount: completeness.missingProcessProfileCount,
          },
          recommendation: 'Pair every intrinsic condition selector with a P20/P50/P80 duration band, conditioned process profile, and productivity band before using it as a trusted standard-condition branch.',
        })
      }
    }
  }

  const productivityEntries = readProductivityEntries(records)
  for (const entry of productivityEntries) {
    if (!hasProductivitySource(entry.productivity)) {
      addFinding(findings, {
        code: 'PRODUCTIVITY_SOURCE_MISSING',
        severity: 'blocker',
        stableCode: entry.ownerRule.stableCode,
        standardWorkCodes: entry.ownerRule.standardWorkCodes,
        message: 'baselineProductivity lacks audit-grade sourceType/sourceRef/sourceDetail.',
        metrics: { owner: entry.owner },
        recommendation: 'Attach sourceType, sourceRef and sourceDetail with owner, condition, basis, and source rationale.',
      })
    }
    if (sourceType(entry.productivity.sourceType) === 'quota' && !hasStructuredQuotaSource(entry.productivity)) {
      addFinding(findings, {
        code: 'QUOTA_PRODUCTIVITY_SOURCE_UNSTRUCTURED',
        severity: 'blocker',
        stableCode: entry.ownerRule.stableCode,
        standardWorkCodes: entry.ownerRule.standardWorkCodes,
        message: 'Quota-backed productivity must include structured quota standard/chapter/table/item anchors.',
        metrics: { owner: entry.owner },
        recommendation: 'Use quota:<standard>:chapter=<catalog-prefix>:table=<unit>_productivity:item=<source-clause> plus chapter/table/item sourceDetail.',
      })
    }
  }

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length
  const reviewRequiredCount = findings.filter((finding) => finding.severity === 'review_required').length

  return {
    reportCode: 'standard_work_duration_seed_quality_audit',
    generatedAt: new Date().toISOString(),
    summary: {
      totalRuleCount: records.length,
      durationBearingRuleCount: durationBearingRules.length,
      blockerCount,
      reviewRequiredCount,
      distribution: {
        wideDistributionCount: findings.filter((finding) => finding.code === 'DISTRIBUTION_TOO_WIDE').length,
        strictP50WindowReviewCount: findings.filter((finding) => finding.code === 'STRICT_P50_WINDOW_REVIEW').length,
        maxP80P20Ratio: roundMetric(maxP80P20Ratio),
      },
      productivityTraceability: {
        productivityEntryCount: productivityEntries.length,
        missingSourceCount: findings.filter((finding) => finding.code === 'PRODUCTIVITY_SOURCE_MISSING').length,
        unstructuredQuotaSourceCount: findings.filter((finding) => finding.code === 'QUOTA_PRODUCTIVITY_SOURCE_UNSTRUCTURED').length,
      },
      confidence: {
        highConfidenceCount: records.filter((record) => record.confidence === 'high').length,
        mediumConfidenceCount: records.filter((record) => record.confidence === 'medium').length,
        lowConfidenceCount: records.filter((record) => record.confidence === 'low').length,
        highConfidenceWithoutStrongSourceCount: findings.filter((finding) => finding.code === 'CONFIDENCE_PROVENANCE_REVIEW').length,
      },
      conditionDepth: {
        conditionizedRuleCount: records.filter(hasAnyConditionDepth).length,
        missingDepthReviewCount: findings.filter((finding) => finding.code === 'CONDITION_DEPTH_REVIEW').length,
        incompleteConditionSetReviewCount: findings.filter((finding) => finding.code === 'CONDITION_BAND_SET_INCOMPLETE').length,
        conditionedDurationBandCount: records.reduce((sum, record) => sum + (record.conditionedDurationBands?.length ?? 0), 0),
        conditionedProcessProfileCount: records.reduce((sum, record) => sum + (record.conditionedProcessProfiles?.length ?? 0), 0),
        productivityBandCount: records.reduce((sum, record) => sum + (record.productivityBands?.length ?? 0), 0),
      },
    },
    findings,
    governanceBoundary: {
      reportOnly: true,
      seedWritePolicy: 'never_write_seed_from_quality_audit',
      promotionPolicy: 'review_required_before_seed_promotion',
      allowedUse: 'backend_seed_quality_governance',
    },
  }
}
