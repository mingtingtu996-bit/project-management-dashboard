import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  WBS_TEMPLATE_PROJECT_RECOMMENDATIONS,
  type WbsTemplateProjectRecommendationKey,
} from '../seeds/wbsTemplateProjectRecommendations.js'
import {
  REAL_PROJECT_RECOMMENDATION_PACK_KEYS,
  resolveScenarioScheduleProfile,
} from './projectScenarioTaxonomyService.js'
import {
  isGovernedDurationOutputCode,
  type DurationOutputCode,
} from './durationOutputGovernanceService.js'
import {
  collectDurationLiveLearningProductionEvidenceRecordsFromRows,
  collectDurationLiveLearningProductionEvidenceRefs,
  splitPublicationReadinessDirectProductionEvidenceRecords,
  type DurationLiveLearningProductionEvidenceRecord,
  type DurationLiveLearningProductionEvidenceRef,
  type DurationLiveLearningProductionEvidenceSourceRow,
  type DurationLiveLearningRejectedProductionEvidenceRecord,
  type DurationLiveLearningRejectedProductionEvidenceSourceRow,
} from './durationLiveLearningProductionEvidenceGateService.js'

export const WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION = 'v1.4.22.1-wbs-template-golden-benchmark-gate-20260531'

export const WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS = {
  expectedScenarioCount: 13,
  minimumCoverageRate: 1,
  minimumDeepCoverageRate: 0.9,
  maximumDurationDeviationRatio: 0.15,
  minimumDependencyPassRate: 0.95,
} as const

export type WbsTemplateGoldenBenchmarkGateStatus = 'pass' | 'fail'

export type WbsTemplateGoldenBenchmarkGateFinding = {
  code: string
  message: string
  severity: 'error'
  projectCode?: string
  recommendationKey?: WbsTemplateProjectRecommendationKey
}

export type WbsTemplateGoldenBenchmarkRunResult = {
  projectCode: string
  recommendationKey: WbsTemplateProjectRecommendationKey
  durationOutputCode?: DurationOutputCode | string
  durationOutputSummary?: {
    planReferenceRowCount: number
    templateFastEstimateRowCount: number
    contextualReferenceRowCount: number
    writablePlanTaskDurationRowCount: number
  }
  generatedRowCount: number
  coverageRate: number
  deepCoverageRate: number
  expectedDurationDaysRange?: [number, number]
  expectedRuntimeReplayRowCountRange?: [number, number]
  actualScheduleStartDate?: string | null
  actualScheduleEndDate?: string | null
  actualScheduleDurationDays?: number | null
  rawScheduleStartDate?: string | null
  rawScheduleEndDate?: string | null
  rawScheduleDurationDays?: number | null
  scheduleCalibrationSummary?: {
    source: string
    applied: boolean
    rawScheduleDurationDays: number | null
    targetScheduleDurationDays: number | null
    scheduleAuthority: string
    dependencyAuthority: string
    dependencyEdgeWritePolicy: string
  }
  durationDeviationRatio: number
  dependencyPassRate: number
  missingRequiredTemplateIds?: string[]
  missingStableCodePrefixes?: string[]
}

export type WbsTemplateGoldenBenchmarkStaticGateResult = {
  version: typeof WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION
  status: WbsTemplateGoldenBenchmarkGateStatus
  expectedScenarioCount: number
  scenarioCount: number
  matrixProjectCodes: string[]
  recommendationPackKeys: WbsTemplateProjectRecommendationKey[]
  findings: WbsTemplateGoldenBenchmarkGateFinding[]
}

export type WbsTemplateGoldenBenchmarkRunGateResult = {
  version: typeof WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION
  status: WbsTemplateGoldenBenchmarkGateStatus
  expectedScenarioCount: number
  resultCount: number
  thresholds: typeof WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS
  findings: WbsTemplateGoldenBenchmarkGateFinding[]
  summary: {
    failedScenarioCount: number
  }
}

export type WbsReferenceDaysLearningScopeEvidence =
  | 'global'
  | 'industry'
  | 'company'
  | 'project'
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export interface WbsReferenceDaysLiveLearningEvidenceInput {
  runtimeGate: WbsTemplateGoldenBenchmarkRunGateResult
  templateReferenceDaysOutcomeRecorded: boolean
  approvedReferenceDaysCandidateRecorded: boolean
  enabledLearningScopes: readonly WbsReferenceDaysLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact: boolean
  referenceDaysPublicationWriterReady: boolean
  referenceDaysLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface WbsReferenceDaysLiveLearningEvidence {
  assetClassificationRegistered: true
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: Array<'global' | 'industry' | 'company' | 'project'>
  runtimeConsumerUsesPublishedArtifact: boolean
  benchmarkReplayGatePassed: boolean
  approvedReferenceDaysCandidateRecorded: boolean
  referenceDaysPublicationWriterReady: boolean
  referenceDaysLineageRecorded: boolean
  referenceDaysWriterDoesNotMutateConfirmedPlans: true
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
  benchmarkScenarioCount: number
}

export interface WbsReferenceDaysLiveLearningEvidenceDecision {
  status: 'wbs_reference_days_live_learning_ready' | 'wbs_reference_days_live_learning_not_ready'
  liveLearningEvidence: WbsReferenceDaysLiveLearningEvidence
  missingReasons: string[]
}

export interface WbsReferenceDaysPublicationReadinessInput {
  runtimeGate: WbsTemplateGoldenBenchmarkRunGateResult
  templateReferenceDaysOutcomeRecorded: boolean
  approvedCandidateEventIds: readonly string[]
  referenceDaysVersionId?: string | null
  runtimePublicationKey?: string | null
  runtimeConsumerObservationRef?: string | null
  runtimeConsumerPublicationKey?: string | null
  rollbackTarget?: string | null
  enabledLearningScopes: readonly WbsReferenceDaysLearningScopeEvidence[]
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface WbsReferenceDaysPublicationReadinessFromProductionRowsInput {
  runtimeGate: WbsTemplateGoldenBenchmarkRunGateResult
  approvedCandidateEventIds: readonly string[]
  enabledLearningScopes: readonly WbsReferenceDaysLearningScopeEvidence[]
  sourceRows?: readonly DurationLiveLearningProductionEvidenceSourceRow[]
  records?: readonly DurationLiveLearningProductionEvidenceRecord[]
}

export interface WbsReferenceDaysLineage {
  assetType: 'wbs_reference_days'
  referenceDaysVersionId: string | null
  runtimePublicationKey: string | null
  rollbackTarget: string | null
  approvedCandidateEventIds: string[]
  benchmarkGateVersion: string
  benchmarkScenarioCount: number
}

export interface WbsReferenceDaysProductionLineage {
  evidenceRefs: DurationLiveLearningProductionEvidenceRef
  rejectedRows: DurationLiveLearningRejectedProductionEvidenceSourceRow[]
  rejectedRecords: DurationLiveLearningRejectedProductionEvidenceRecord[]
}

export interface WbsReferenceDaysPublicationReadiness {
  status: 'wbs_reference_days_publication_ready' | 'wbs_reference_days_publication_not_ready'
  liveLearningEvidence: WbsReferenceDaysLiveLearningEvidence
  referenceDaysLineage: WbsReferenceDaysLineage
  missingReasons: string[]
}

export type WbsReferenceDaysProductionPublicationReadiness =
  WbsReferenceDaysPublicationReadiness & {
    productionLineage: WbsReferenceDaysProductionLineage
  }

const WBS_REFERENCE_DAYS_ASSET_KEY = 'wbs_reference_days'

function makeFinding(
  code: string,
  message: string,
  details: Pick<WbsTemplateGoldenBenchmarkGateFinding, 'projectCode' | 'recommendationKey'> = {},
): WbsTemplateGoldenBenchmarkGateFinding {
  return {
    code,
    message,
    severity: 'error',
    ...details,
  }
}

function uniqueStrings(values: readonly unknown[]) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))]
}

function wbsReferenceDaysObservationMatchesPublication(
  evidenceRefs: DurationLiveLearningProductionEvidenceRef,
) {
  const publicationKey = normalizeText(evidenceRefs.publicationExecutionRef)
  const observedPublicationKey = normalizeText(evidenceRefs.runtimeConsumerPublicationKey)
  return Boolean(publicationKey)
    && Boolean(observedPublicationKey)
    && publicationKey === observedPublicationKey
}

function normalizeLower(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function readRowText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function findCurrentPublishedWbsReferenceDaysVersionId(
  sourceRows: readonly DurationLiveLearningProductionEvidenceSourceRow[] | undefined,
) {
  for (const source of sourceRows ?? []) {
    if (source.sourceTable !== 'wbs_template_runtime_publications') continue
    const row = source.row
    const referenceDaysVersionId = readRowText(row, 'asset_version_id', 'assetVersionId')
    if (
      referenceDaysVersionId
      && readRowText(row, 'asset_kind', 'assetKind') === WBS_REFERENCE_DAYS_ASSET_KEY
      && readRowText(row, 'publication_key', 'publicationKey')
      && readRowText(row, 'runtime_publication_status', 'runtimePublicationStatus') === 'runtime_published'
    ) {
      return referenceDaysVersionId
    }
  }
  return null
}

function wbsReferenceDaysProductionLineageFromProductionInput(
  input: Pick<WbsReferenceDaysPublicationReadinessFromProductionRowsInput, 'sourceRows' | 'records'>,
): WbsReferenceDaysProductionLineage {
  const rowCollection = collectDurationLiveLearningProductionEvidenceRecordsFromRows({
    rows: input.sourceRows,
  })
  const directRecordCollection = splitPublicationReadinessDirectProductionEvidenceRecords(input.records)
  const evidenceCollection = collectDurationLiveLearningProductionEvidenceRefs({
    records: [
      ...rowCollection.records,
      ...directRecordCollection.allowedRecords,
    ],
  })
  const evidenceRefs = evidenceCollection.productionEvidence.find((evidence) =>
    evidence.assetKey === WBS_REFERENCE_DAYS_ASSET_KEY)
    ?? { assetKey: WBS_REFERENCE_DAYS_ASSET_KEY }

  return {
    evidenceRefs,
    rejectedRows: rowCollection.rejectedRows,
    rejectedRecords: [
      ...evidenceCollection.rejectedRecords,
      ...directRecordCollection.rejectedRecords,
    ],
  }
}

const WBS_REFERENCE_DAYS_LEARNING_SCOPE_ORDER = ['global', 'industry', 'company', 'project'] as const

function normalizeWbsReferenceDaysLearningScopes(
  scopes: readonly WbsReferenceDaysLearningScopeEvidence[] | undefined,
): Array<typeof WBS_REFERENCE_DAYS_LEARNING_SCOPE_ORDER[number]> {
  const normalized = new Set<typeof WBS_REFERENCE_DAYS_LEARNING_SCOPE_ORDER[number]>()
  for (const scope of scopes ?? []) {
    const value = normalizeLower(scope)
    if (value === 'system' || value === 'global') normalized.add('global')
    if (value === 'industry' || value === 'industry_baseline' || value === 'segment_baseline') normalized.add('industry')
    if (value === 'company') normalized.add('company')
    if (value === 'project') normalized.add('project')
  }
  return WBS_REFERENCE_DAYS_LEARNING_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

function countBy<T extends string>(values: readonly T[]) {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function isValidRowRange(range: readonly number[]) {
  return range.length === 2
    && Number.isFinite(range[0])
    && Number.isFinite(range[1])
    && range[0] > 0
    && range[1] >= range[0]
}

function isValidDurationRange(range: unknown): range is [number, number] {
  return Array.isArray(range)
    && range.length === 2
    && Number.isFinite(range[0])
    && Number.isFinite(range[1])
    && range[0] > 0
    && range[1] >= range[0]
}

export function evaluateWbsTemplateGoldenBenchmarkStaticGate(): WbsTemplateGoldenBenchmarkStaticGateResult {
  const findings: WbsTemplateGoldenBenchmarkGateFinding[] = []
  const matrixEntries = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX
  const recommendationPackKeys = [...REAL_PROJECT_RECOMMENDATION_PACK_KEYS]
  const recommendationRecords = WBS_TEMPLATE_PROJECT_RECOMMENDATIONS
  const matrixProjectCodes = matrixEntries.map((entry) => entry.projectCode)
  const matrixRecommendationKeys = matrixEntries.map((entry) => entry.recommendationKey)
  const matrixKeyCounts = countBy(matrixRecommendationKeys)
  const projectCodeCounts = countBy(matrixProjectCodes)

  if (matrixEntries.length !== WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount) {
    findings.push(makeFinding(
      'scenario_count_mismatch',
      `Expected ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount} real-project benchmark scenarios, got ${matrixEntries.length}.`,
    ))
  }
  if (recommendationPackKeys.length !== WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount) {
    findings.push(makeFinding(
      'recommendation_pack_count_mismatch',
      `Expected ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount} recommendation packs, got ${recommendationPackKeys.length}.`,
    ))
  }

  for (const [projectCode, count] of projectCodeCounts.entries()) {
    if (count !== 1) {
      findings.push(makeFinding('duplicate_project_code', `Benchmark project code ${projectCode} appears ${count} times.`, { projectCode }))
    }
  }

  for (const key of recommendationPackKeys) {
    const count = matrixKeyCounts.get(key) ?? 0
    if (count !== 1) {
      findings.push(makeFinding('recommendation_pack_matrix_coverage_mismatch', `Recommendation pack ${key} appears ${count} times in the real-project coverage matrix.`, { recommendationKey: key }))
    }
  }

  for (const entry of matrixEntries) {
    const recommendation = recommendationRecords[entry.recommendationKey]
    if (!recommendation) {
      findings.push(makeFinding('missing_recommendation_record', `Missing recommendation record for ${entry.recommendationKey}.`, {
        projectCode: entry.projectCode,
        recommendationKey: entry.recommendationKey,
      }))
      continue
    }

    if (!entry.requiredTemplateIds.length) {
      findings.push(makeFinding('empty_required_template_ids', `Scenario ${entry.projectCode} has no required templates.`, entry))
    }
    if (!entry.requiredStableCodePrefixes.length) {
      findings.push(makeFinding('empty_required_stable_code_prefixes', `Scenario ${entry.projectCode} has no required stable-code prefixes.`, entry))
    }
    if (!isValidRowRange(entry.expectedRowCountRange)) {
      findings.push(makeFinding('invalid_expected_row_count_range', `Scenario ${entry.projectCode} has an invalid expected row-count range.`, entry))
    }
    if (entry.expectedRuntimeReplayRowCountRange && !isValidRowRange(entry.expectedRuntimeReplayRowCountRange)) {
      findings.push(makeFinding('invalid_expected_runtime_replay_row_count_range', `Scenario ${entry.projectCode} has an invalid expected runtime replay row-count range.`, entry))
    }
    if (!isValidDurationRange(entry.expectedDurationDaysRange)) {
      findings.push(makeFinding('invalid_expected_duration_days_range', `Scenario ${entry.projectCode} has an invalid expected duration-days range.`, entry))
    }
    if (recommendation.expectedRowCountRange[0] !== entry.expectedRowCountRange[0] || recommendation.expectedRowCountRange[1] !== entry.expectedRowCountRange[1]) {
      findings.push(makeFinding('recommendation_row_range_mismatch', `Scenario ${entry.projectCode} row-count range does not match its recommendation pack.`, entry))
    }

    const scheduleProfile = resolveScenarioScheduleProfile({ recommendationPacks: [entry.recommendationKey] })
    if (scheduleProfile.dominantSchedulePattern === 'general_sequence') {
      findings.push(makeFinding('ungoverned_schedule_profile', `Scenario ${entry.projectCode} still resolves to general_sequence.`, entry))
    }
  }

  const knownKeys = new Set(recommendationPackKeys)
  for (const key of Object.keys(recommendationRecords)) {
    if (!knownKeys.has(key as WbsTemplateProjectRecommendationKey)) {
      findings.push(makeFinding('extra_recommendation_record', `Recommendation record ${key} is not part of the governed real-project benchmark taxonomy.`, {
        recommendationKey: key as WbsTemplateProjectRecommendationKey,
      }))
    }
  }

  return {
    version: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION,
    status: findings.length > 0 ? 'fail' : 'pass',
    expectedScenarioCount: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount,
    scenarioCount: matrixEntries.length,
    matrixProjectCodes: uniqueStrings(matrixProjectCodes),
    recommendationPackKeys,
    findings,
  }
}

export function evaluateWbsTemplateGoldenBenchmarkRunGate(
  results: WbsTemplateGoldenBenchmarkRunResult[],
): WbsTemplateGoldenBenchmarkRunGateResult {
  const findings: WbsTemplateGoldenBenchmarkGateFinding[] = []
  const failedScenarioCodes = new Set<string>()
  const matrixByProjectCode = new Map(WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => [entry.projectCode, entry]))
  const resultsByProjectCode = new Map<string, WbsTemplateGoldenBenchmarkRunResult[]>()

  for (const result of results) {
    const existing = resultsByProjectCode.get(result.projectCode) ?? []
    existing.push(result)
    resultsByProjectCode.set(result.projectCode, existing)
  }

  for (const entry of WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX) {
    const scenarioResults = resultsByProjectCode.get(entry.projectCode) ?? []
    if (scenarioResults.length !== 1) {
      findings.push(makeFinding('runtime_result_count_mismatch', `Scenario ${entry.projectCode} should have exactly one runtime benchmark result, got ${scenarioResults.length}.`, entry))
      failedScenarioCodes.add(entry.projectCode)
      continue
    }

    const result = scenarioResults[0]
    if (result.recommendationKey !== entry.recommendationKey) {
      findings.push(makeFinding('recommendation_key_mismatch', `Scenario ${entry.projectCode} returned recommendation ${result.recommendationKey}, expected ${entry.recommendationKey}.`, entry))
    }
    if (!result.durationOutputCode || !isGovernedDurationOutputCode(result.durationOutputCode)) {
      findings.push(makeFinding(
        'duration_output_contract_missing',
        `Scenario ${entry.projectCode} must declare the governed duration output under test.`,
        entry,
      ))
    }
    if (result.durationOutputCode === 'plan_reference') {
      const summary = result.durationOutputSummary
      if (!summary) {
        findings.push(makeFinding(
          'duration_output_evidence_missing',
          `Scenario ${entry.projectCode} must report row-level duration output evidence for plan_reference replay.`,
          entry,
        ))
      } else {
        if (summary.templateFastEstimateRowCount > 0) {
          findings.push(makeFinding(
            'template_fast_estimate_in_plan_reference_replay',
            `Scenario ${entry.projectCode} still has ${summary.templateFastEstimateRowCount} template_fast_estimate rows in a plan_reference benchmark replay.`,
            entry,
          ))
        }
        if (summary.planReferenceRowCount <= 0 || summary.writablePlanTaskDurationRowCount <= 0) {
          findings.push(makeFinding(
            'plan_reference_duration_evidence_missing',
            `Scenario ${entry.projectCode} must include writable plan_reference duration rows in benchmark replay.`,
            entry,
          ))
        }
      }
    }
    const runtimeRowCountRange = entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange
    if (!Number.isFinite(result.generatedRowCount) || result.generatedRowCount < runtimeRowCountRange[0] || result.generatedRowCount > runtimeRowCountRange[1]) {
      findings.push(makeFinding('row_count_out_of_range', `Scenario ${entry.projectCode} generated ${result.generatedRowCount} runtime replay rows; expected ${runtimeRowCountRange[0]}-${runtimeRowCountRange[1]}.`, entry))
    }
    if (!isValidDurationRange(result.expectedDurationDaysRange)) {
      findings.push(makeFinding('duration_anchor_range_missing', `Scenario ${entry.projectCode} must report the expected real-project duration anchor range.`, entry))
    } else if (
      result.expectedDurationDaysRange[0] !== entry.expectedDurationDaysRange[0]
      || result.expectedDurationDaysRange[1] !== entry.expectedDurationDaysRange[1]
    ) {
      findings.push(makeFinding(
        'duration_anchor_range_mismatch',
        `Scenario ${entry.projectCode} duration anchor range ${result.expectedDurationDaysRange.join('-')} does not match matrix ${entry.expectedDurationDaysRange.join('-')}.`,
        entry,
      ))
    }
    if (!Number.isFinite(result.actualScheduleDurationDays) || Number(result.actualScheduleDurationDays) <= 0) {
      findings.push(makeFinding('schedule_duration_evidence_missing', `Scenario ${entry.projectCode} must report actual generated schedule duration days.`, entry))
    }
    if (result.coverageRate < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate) {
      findings.push(makeFinding('coverage_rate_below_threshold', `Scenario ${entry.projectCode} coverage ${result.coverageRate} is below ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate}.`, entry))
    }
    if (result.deepCoverageRate < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate) {
      findings.push(makeFinding('deep_coverage_rate_below_threshold', `Scenario ${entry.projectCode} deep coverage ${result.deepCoverageRate} is below ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate}.`, entry))
    }
    if (!Number.isFinite(result.durationDeviationRatio) || Math.abs(result.durationDeviationRatio) > WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio) {
      findings.push(makeFinding('duration_deviation_above_threshold', `Scenario ${entry.projectCode} duration deviation ${result.durationDeviationRatio} is above ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio}.`, entry))
    }
    if (result.dependencyPassRate < WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate) {
      findings.push(makeFinding('dependency_pass_rate_below_threshold', `Scenario ${entry.projectCode} dependency pass rate ${result.dependencyPassRate} is below ${WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate}.`, entry))
    }
    if ((result.missingRequiredTemplateIds ?? []).length > 0) {
      findings.push(makeFinding('missing_required_templates', `Scenario ${entry.projectCode} is missing required templates: ${(result.missingRequiredTemplateIds ?? []).join(', ')}.`, entry))
    }
    if ((result.missingStableCodePrefixes ?? []).length > 0) {
      findings.push(makeFinding('missing_stable_code_prefixes', `Scenario ${entry.projectCode} is missing stable-code prefixes: ${(result.missingStableCodePrefixes ?? []).join(', ')}.`, entry))
    }

    if (findings.some((finding) => finding.projectCode === entry.projectCode)) {
      failedScenarioCodes.add(entry.projectCode)
    }
  }

  for (const result of results) {
    if (!matrixByProjectCode.has(result.projectCode)) {
      findings.push(makeFinding('unknown_runtime_scenario', `Runtime benchmark result ${result.projectCode} is not in the governed real-project matrix.`, {
        projectCode: result.projectCode,
        recommendationKey: result.recommendationKey,
      }))
      failedScenarioCodes.add(result.projectCode)
    }
  }

  return {
    version: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION,
    status: findings.length > 0 ? 'fail' : 'pass',
    expectedScenarioCount: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount,
    resultCount: results.length,
    thresholds: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
    findings,
    summary: {
      failedScenarioCount: failedScenarioCodes.size,
    },
  }
}

export function assertWbsTemplateGoldenBenchmarkGate(results?: WbsTemplateGoldenBenchmarkRunResult[]) {
  const staticGate = evaluateWbsTemplateGoldenBenchmarkStaticGate()
  const runtimeGate = results ? evaluateWbsTemplateGoldenBenchmarkRunGate(results) : null
  const findings = [...staticGate.findings, ...(runtimeGate?.findings ?? [])]
  if (findings.length > 0) {
    const summary = findings.map((finding) => [
      finding.projectCode,
      finding.recommendationKey,
      finding.code,
      finding.message,
    ].filter(Boolean).join(' | ')).join('\n')
    throw new Error(`WBS template golden benchmark gate failed:\n${summary}`)
  }
  return { staticGate, runtimeGate }
}

export function evaluateWbsReferenceDaysLiveLearningEvidence(
  input: WbsReferenceDaysLiveLearningEvidenceInput,
): WbsReferenceDaysLiveLearningEvidenceDecision {
  const missingReasons: string[] = []
  const enabledLearningScopes = normalizeWbsReferenceDaysLearningScopes(input.enabledLearningScopes)
  const tieredLearningPolicyRegistered = WBS_REFERENCE_DAYS_LEARNING_SCOPE_ORDER
    .every((scope) => enabledLearningScopes.includes(scope))
  const benchmarkReplayGatePassed = input.runtimeGate.status === 'pass'
    && input.runtimeGate.resultCount >= input.runtimeGate.expectedScenarioCount
    && input.runtimeGate.summary.failedScenarioCount === 0
  const predictionEventRecorded = benchmarkReplayGatePassed
  const actualOutcomeEventRecorded = benchmarkReplayGatePassed
    && input.templateReferenceDaysOutcomeRecorded
  const accuracyMetricsAvailable = input.accuracyMetricsAvailable && benchmarkReplayGatePassed

  if (!benchmarkReplayGatePassed) missingReasons.push('wbs_reference_days_benchmark_gate_required')
  if (!actualOutcomeEventRecorded) missingReasons.push('template_reference_days_outcome_required')
  if (!input.approvedReferenceDaysCandidateRecorded) missingReasons.push('approved_reference_days_candidate_required')
  if (!input.referenceDaysPublicationWriterReady) missingReasons.push('wbs_reference_days_publication_writer_required')
  if (!input.referenceDaysLineageRecorded) missingReasons.push('wbs_reference_days_lineage_required')
  if (!tieredLearningPolicyRegistered) missingReasons.push('global_industry_company_project_learning_scopes_required')
  if (!input.runtimeConsumerUsesPublishedArtifact) missingReasons.push('runtime_consumer_publication_required')
  if (!input.releaseExitApproved) missingReasons.push('release_exit_required')
  if (!input.impactMonitoringReady) missingReasons.push('impact_monitoring_required')
  if (!input.rollbackTargetReady) missingReasons.push('rollback_target_required')
  if (!accuracyMetricsAvailable) missingReasons.push('accuracy_metrics_required')

  const liveLearningEvidence: WbsReferenceDaysLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded,
    actualOutcomeEventRecorded,
    tieredLearningPolicyRegistered,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: input.runtimeConsumerUsesPublishedArtifact,
    benchmarkReplayGatePassed,
    approvedReferenceDaysCandidateRecorded: input.approvedReferenceDaysCandidateRecorded,
    referenceDaysPublicationWriterReady: input.referenceDaysPublicationWriterReady,
    referenceDaysLineageRecorded: input.referenceDaysLineageRecorded,
    referenceDaysWriterDoesNotMutateConfirmedPlans: true,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable,
    benchmarkScenarioCount: input.runtimeGate.resultCount,
  }

  return {
    status: missingReasons.length === 0
      ? 'wbs_reference_days_live_learning_ready'
      : 'wbs_reference_days_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons: uniqueValues(missingReasons),
  }
}

export function buildWbsReferenceDaysPublicationReadiness(
  input: WbsReferenceDaysPublicationReadinessInput,
): WbsReferenceDaysPublicationReadiness {
  const approvedCandidateEventIds = uniqueStrings(input.approvedCandidateEventIds)
  const referenceDaysVersionId = normalizeText(input.referenceDaysVersionId)
  const runtimePublicationKey = normalizeText(input.runtimePublicationKey)
  const runtimeConsumerObservationRef = normalizeText(input.runtimeConsumerObservationRef)
  const runtimeConsumerPublicationKey = normalizeText(input.runtimeConsumerPublicationKey)
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const referenceDaysPublicationWriterReady = Boolean(referenceDaysVersionId && runtimePublicationKey)
  const referenceDaysLineageRecorded = Boolean(referenceDaysVersionId)
    && approvedCandidateEventIds.length > 0
    && input.runtimeGate.resultCount > 0
  const runtimeConsumerPublicationMismatched = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey !== runtimePublicationKey,
  )
  const runtimeConsumerObservationMatchesPublication = Boolean(
    runtimeConsumerObservationRef
      && runtimePublicationKey
      && runtimeConsumerPublicationKey
      && runtimeConsumerPublicationKey === runtimePublicationKey,
  )

  const readiness = evaluateWbsReferenceDaysLiveLearningEvidence({
    runtimeGate: input.runtimeGate,
    templateReferenceDaysOutcomeRecorded: input.templateReferenceDaysOutcomeRecorded,
    approvedReferenceDaysCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    referenceDaysPublicationWriterReady,
    referenceDaysLineageRecorded,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: Boolean(rollbackTarget),
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
  })

  return {
    status: readiness.status === 'wbs_reference_days_live_learning_ready'
      ? 'wbs_reference_days_publication_ready'
      : 'wbs_reference_days_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    referenceDaysLineage: {
      assetType: 'wbs_reference_days',
      referenceDaysVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      benchmarkGateVersion: input.runtimeGate.version,
      benchmarkScenarioCount: input.runtimeGate.resultCount,
    },
    missingReasons: uniqueValues([
      ...readiness.missingReasons,
      runtimeConsumerPublicationMismatched ? 'runtime_consumer_publication_mismatch' : '',
    ]),
  }
}

export function buildWbsReferenceDaysPublicationReadinessFromProductionRows(
  input: WbsReferenceDaysPublicationReadinessFromProductionRowsInput,
): WbsReferenceDaysProductionPublicationReadiness {
  const approvedCandidateEventIds = uniqueStrings(input.approvedCandidateEventIds)
  const productionLineage = wbsReferenceDaysProductionLineageFromProductionInput(input)
  const evidenceRefs = productionLineage.evidenceRefs
  const referenceDaysVersionId = findCurrentPublishedWbsReferenceDaysVersionId(input.sourceRows)
  const runtimePublicationKey = normalizeText(evidenceRefs.publicationExecutionRef)
  const rollbackTarget = normalizeText(evidenceRefs.rollbackDrillEvidenceRef)
  const hasRuntimeConsumerObservation = Boolean(evidenceRefs.runtimeConsumerObservationRef)
  const runtimeConsumerObservationMatchesPublication = hasRuntimeConsumerObservation
    && wbsReferenceDaysObservationMatchesPublication(evidenceRefs)
  const referenceDaysPublicationWriterReady = Boolean(referenceDaysVersionId && runtimePublicationKey)
  const referenceDaysLineageRecorded = Boolean(referenceDaysVersionId)
    && approvedCandidateEventIds.length > 0
    && input.runtimeGate.resultCount > 0

  const readiness = evaluateWbsReferenceDaysLiveLearningEvidence({
    runtimeGate: input.runtimeGate,
    templateReferenceDaysOutcomeRecorded: Boolean(evidenceRefs.productionSampleEvidenceRef),
    approvedReferenceDaysCandidateRecorded: approvedCandidateEventIds.length > 0,
    enabledLearningScopes: input.enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: runtimeConsumerObservationMatchesPublication,
    referenceDaysPublicationWriterReady,
    referenceDaysLineageRecorded,
    releaseExitApproved: Boolean(evidenceRefs.publicationExecutionRef),
    impactMonitoringReady: Boolean(evidenceRefs.impactMonitoringEvidenceRef),
    rollbackTargetReady: Boolean(evidenceRefs.rollbackDrillEvidenceRef),
    accuracyMetricsAvailable: Boolean(evidenceRefs.accuracyEvidenceRef),
  })

  return {
    status: readiness.status === 'wbs_reference_days_live_learning_ready'
      ? 'wbs_reference_days_publication_ready'
      : 'wbs_reference_days_publication_not_ready',
    liveLearningEvidence: readiness.liveLearningEvidence,
    referenceDaysLineage: {
      assetType: 'wbs_reference_days',
      referenceDaysVersionId,
      runtimePublicationKey,
      rollbackTarget,
      approvedCandidateEventIds,
      benchmarkGateVersion: input.runtimeGate.version,
      benchmarkScenarioCount: input.runtimeGate.resultCount,
    },
    missingReasons: uniqueValues([
      ...readiness.missingReasons,
      hasRuntimeConsumerObservation && !runtimeConsumerObservationMatchesPublication
        ? 'runtime_consumer_publication_mismatch'
        : '',
    ]),
    productionLineage,
  }
}
