// v1.4.18: govern template duration from real completion samples.
// The service writes benchmark and override-candidate facts only; it never
// mutates template node defaults or historical plan snapshots.

import { createHash } from 'node:crypto'

import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { loadTemplateDurationGovernanceSamples } from './durationContextSampleReadModelService.js'
import { stageDurationBenchmarkCandidateAtomically } from './durationLearningAssetAtomicStoreService.js'
import { readProductionDurationDays } from '../utils/durationDayBasis.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'

type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface DurationExperienceSampleRow {
  id?: string | null
  company_id?: string | null
  project_id?: string | null
  task_id?: string | null
  template_node_id?: string | null
  engineering_category_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  wbs_node_type?: string | null
  planned_duration?: number | null
  actual_duration?: number | null
  duration_day_basis?: string | null
  actual_duration_calendar_days?: number | null
  actual_duration_production_days?: number | null
  planned_duration_calendar_days?: number | null
  planned_duration_production_days?: number | null
  sample_strength?: string | null
  confidence_score?: number | null
  duration_calibration_source?: string | null
  completed_at?: string | Date | null
  created_at?: string | Date | null
  metadata?: Record<string, unknown> | null
}

export interface DurationBenchmarkCandidate {
  companyId: string | null
  projectId: string
  benchmarkKey: string
  benchmarkContextKey: string
  templateNodeId: string | null
  engineeringCategoryId: string | null
  standardWorkCode: string | null
  standardWorkName: string | null
  wbsNodeType: string
  sampleCount: number
  p50Days: number
  p75Days: number
  p80Days: number
  meanDays: number
  variance: number
  coefficientOfVariation: number
  confidenceLevel: ConfidenceLevel
  confidenceScore: number
  sampleIds: string[]
  taskIds: string[]
  observationStartedAt: string | null
  observationEndedAt: string | null
  observationWindowDays: number
  productionDaySamples: number[]
  durationDayBasis: 'construction_production_day'
  automationQualityEvidence: {
    qualityModel: 'numeric_holdout'
    holdoutSampleCount: number
    maeBefore: number | null
    maeAfter: number | null
    conflictRate: number | null
    overcompensationRate: number | null
  }
}

export interface TemplateDurationGovernanceOptions {
  companyId?: string | null
  includeActivitySteps?: boolean
  minSampleCount?: number
  minOverrideSampleCount?: number
  minOverrideDeviationRatio?: number
  maxSamples?: number
}

export interface TemplateDurationGovernanceResult {
  sampleCount: number
  benchmarkCandidates: number
  benchmarksWritten: number
  overrideCandidatesWritten: number
  c1910GovernanceContract: TemplateDurationGovernanceContract
}

export interface TemplateDurationGovernanceContract {
  sourceTable: 'duration_experience_samples'
  benchmarkTable: 'duration_benchmarks'
  candidateOverrideTable: 'duration_suggestion_overrides'
  runtimeConsumer: 'durationSuggestionService'
  runtimeConsumerBoundary: 'duration_benchmarks + algorithm_learnable_parameter_runtime_publications'
  mutationBoundary: {
    writesTaskFacts: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesRuntimePublications: false
    writesAlgorithmSeeds: false
    writesTemplateNodeDefaults: false
    writesHistoricalPlanSnapshots: false
  }
}

const DEFAULT_MIN_SAMPLE_COUNT = 1
const DEFAULT_MIN_OVERRIDE_SAMPLE_COUNT = 5
const DEFAULT_OVERRIDE_DEVIATION_RATIO = 0.25
const DEFAULT_MAX_SAMPLES = 1000
const C1910_GOVERNANCE_CONTRACT: TemplateDurationGovernanceContract = {
  sourceTable: 'duration_experience_samples',
  benchmarkTable: 'duration_benchmarks',
  candidateOverrideTable: 'duration_suggestion_overrides',
  runtimeConsumer: 'durationSuggestionService',
  runtimeConsumerBoundary: 'duration_benchmarks + algorithm_learnable_parameter_runtime_publications',
  mutationBoundary: {
    writesTaskFacts: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesRuntimePublications: false,
    writesAlgorithmSeeds: false,
    writesTemplateNodeDefaults: false,
    writesHistoricalPlanSnapshots: false,
  },
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeWbsNodeType(value: unknown) {
  return normalizeText(value) ?? 'process'
}

function readPositiveDays(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.ceil(next) : null
}

function readCompanyId(sample: DurationExperienceSampleRow) {
  return normalizeText(sample.company_id ?? sample.metadata?.company_id) ?? null
}

function readProjectId(sample: DurationExperienceSampleRow) {
  return normalizeText(sample.project_id ?? sample.metadata?.project_id) ?? null
}

function normalizeTimestamp(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const parsed = new Date(String(value ?? ''))
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function observationWindow(rows: DurationExperienceSampleRow[]) {
  const timestamps = rows
    .map((row) => normalizeTimestamp(row.completed_at ?? row.created_at))
    .filter((value): value is string => Boolean(value))
    .sort()
  const startedAt = timestamps[0] ?? null
  const endedAt = timestamps[timestamps.length - 1] ?? null
  const windowDays = startedAt && endedAt
    ? inclusiveDurationDays(startedAt, endedAt) ?? 0
    : 0
  return { startedAt, endedAt, windowDays }
}

function readCodeArray(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').trim()
      ? String(value ?? '').split(/[,\s]+/)
      : []
  return [...new Set(raw.map((item) => String(item ?? '').trim().toLowerCase()).filter(Boolean))]
}

function readBenchmarkContextKey(sample: DurationExperienceSampleRow) {
  const explicit = normalizeText(sample.metadata?.benchmark_context_key)
  if (explicit) return explicit

  const projectTypeCode = normalizeText(sample.metadata?.project_type_code)
  const structureTypeCode = normalizeText(sample.metadata?.structure_type_code)
  const participantUnitId = normalizeText(sample.metadata?.participant_unit_id ?? sample.metadata?.responsible_unit_id)
  const methodVariantCodes = readCodeArray(sample.metadata?.method_variant_codes)
  const elementVariantCodes = readCodeArray(sample.metadata?.element_variant_codes)
  const parts = [
    projectTypeCode ? `project=${projectTypeCode}` : '',
    structureTypeCode ? `structure=${structureTypeCode}` : '',
    methodVariantCodes.length > 0 ? `method=${methodVariantCodes.join('+')}` : '',
    elementVariantCodes.length > 0 ? `element=${elementVariantCodes.join('+')}` : '',
    participantUnitId ? `unit=${participantUnitId}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('|') : 'all'
}

function isUsableSample(sample: DurationExperienceSampleRow, options: Required<Pick<TemplateDurationGovernanceOptions, 'includeActivitySteps'>>) {
  const wbsNodeType = normalizeWbsNodeType(sample.wbs_node_type)
  if (wbsNodeType === 'activity_step' && !options.includeActivitySteps) return false
  if (normalizeText(sample.sample_strength) === 'unusable') return false
  return readProductionDurationDays(sample as Record<string, unknown>, 'actual') !== null
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  return sortedValues[Math.min(sortedValues.length - 1, index)]
}

function roundMetric(value: number) {
  return Number(value.toFixed(6))
}

function buildNumericHoldoutEvidence(rows: DurationExperienceSampleRow[]) {
  const ordered = [...rows].sort((left, right) => {
    const leftKey = `${normalizeTimestamp(left.completed_at ?? left.created_at) ?? ''}:${normalizeText(left.id) ?? ''}`
    const rightKey = `${normalizeTimestamp(right.completed_at ?? right.created_at) ?? ''}:${normalizeText(right.id) ?? ''}`
    return leftKey.localeCompare(rightKey)
  })
  const observations = ordered.flatMap((sample, index) => {
    const actualDays = readProductionDurationDays(sample as Record<string, unknown>, 'actual')
    const plannedDays = readProductionDurationDays(sample as Record<string, unknown>, 'planned')
    const trainingDays = ordered
      .filter((_, trainingIndex) => trainingIndex !== index)
      .map((trainingSample) => readProductionDurationDays(trainingSample as Record<string, unknown>, 'actual'))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)
    if (actualDays == null || plannedDays == null || trainingDays.length < 3) return []
    return [{
      actualDays,
      baselineDays: plannedDays,
      candidateDays: percentile(trainingDays, 0.5),
    }]
  })
  if (observations.length === 0) {
    return {
      qualityModel: 'numeric_holdout' as const,
      holdoutSampleCount: 0,
      maeBefore: null,
      maeAfter: null,
      conflictRate: null,
      overcompensationRate: null,
    }
  }
  const maeBefore = observations.reduce(
    (sum, item) => sum + Math.abs(item.baselineDays - item.actualDays),
    0,
  ) / observations.length
  const maeAfter = observations.reduce(
    (sum, item) => sum + Math.abs(item.candidateDays - item.actualDays),
    0,
  ) / observations.length
  const conflictCount = observations.filter((item) => (
    Math.abs(item.candidateDays - item.actualDays) > Math.abs(item.baselineDays - item.actualDays)
  )).length
  const overcompensationCount = observations.filter((item) => {
    const before = item.baselineDays - item.actualDays
    const after = item.candidateDays - item.actualDays
    return before !== 0
      && after !== 0
      && Math.sign(before) !== Math.sign(after)
      && Math.abs(after) >= Math.abs(before)
  }).length
  return {
    qualityModel: 'numeric_holdout' as const,
    holdoutSampleCount: observations.length,
    maeBefore: roundMetric(maeBefore),
    maeAfter: roundMetric(maeAfter),
    conflictRate: roundMetric(conflictCount / observations.length),
    overcompensationRate: roundMetric(overcompensationCount / observations.length),
  }
}

function confidenceForSampleCount(sampleCount: number): { level: ConfidenceLevel; score: number } {
  if (sampleCount >= 10) return { level: 'high', score: 85 }
  if (sampleCount >= 5) return { level: 'medium', score: 70 }
  if (sampleCount >= 3) return { level: 'medium', score: 55 }
  return { level: 'low', score: 35 }
}

function roundedCoefficientOfVariation(values: number[], mean: number) {
  if (values.length === 0 || mean <= 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.round((Math.sqrt(Math.max(0, variance)) / mean) * 1000) / 1000
}

function buildBenchmarkKey(sample: DurationExperienceSampleRow) {
  const identity = normalizeText(sample.template_node_id)
    ?? normalizeText(sample.standard_work_code)
    ?? normalizeText(sample.engineering_category_id)
  if (!identity) return null
  return [identity, normalizeWbsNodeType(sample.wbs_node_type), readBenchmarkContextKey(sample)].join(':')
}

function isUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

export function buildDurationBenchmarkCandidates(
  samples: DurationExperienceSampleRow[],
  options: TemplateDurationGovernanceOptions = {},
): DurationBenchmarkCandidate[] {
  const minSampleCount = options.minSampleCount ?? DEFAULT_MIN_SAMPLE_COUNT
  const includeActivitySteps = options.includeActivitySteps === true
  const groups = new Map<string, DurationExperienceSampleRow[]>()

  for (const sample of samples) {
    if (!isUsableSample(sample, { includeActivitySteps })) continue
    const companyId = readCompanyId(sample)
    const projectId = readProjectId(sample)
    if (!companyId || !projectId) continue
    if (options.companyId !== undefined && normalizeText(options.companyId) !== companyId) continue

    const benchmarkKey = buildBenchmarkKey(sample)
    if (!benchmarkKey) continue

    const key = `${companyId}::${projectId}::${benchmarkKey}`
    const rows = groups.get(key) ?? []
    rows.push(sample)
    groups.set(key, rows)
  }

  return [...groups.values()]
    .filter((rows) => rows.length >= minSampleCount)
    .map((rows) => {
      const first = rows[0]
      const days = rows
        .map((sample) => readProductionDurationDays(sample as Record<string, unknown>, 'actual'))
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right)
      const meanDays = days.reduce((sum, value) => sum + value, 0) / Math.max(days.length, 1)
      const coefficientOfVariation = roundedCoefficientOfVariation(days, meanDays)
      const confidence = confidenceForSampleCount(days.length)
      const observed = observationWindow(rows)
      const automationQualityEvidence = buildNumericHoldoutEvidence(rows)

      return {
        companyId: readCompanyId(first),
        projectId: readProjectId(first) as string,
        benchmarkKey: buildBenchmarkKey(first) ?? 'unclassified',
        benchmarkContextKey: readBenchmarkContextKey(first),
        templateNodeId: normalizeText(first.template_node_id),
        engineeringCategoryId: normalizeText(first.engineering_category_id),
        standardWorkCode: normalizeText(first.standard_work_code),
        standardWorkName: normalizeText(first.standard_work_name),
        wbsNodeType: normalizeWbsNodeType(first.wbs_node_type),
        sampleCount: days.length,
        p50Days: percentile(days, 0.5),
        p75Days: percentile(days, 0.75),
        p80Days: percentile(days, 0.8),
        meanDays: Math.round(meanDays * 10) / 10,
        variance: coefficientOfVariation,
        coefficientOfVariation,
        confidenceLevel: confidence.level,
        confidenceScore: confidence.score,
        sampleIds: rows.map((sample) => normalizeText(sample.id)).filter((value): value is string => value !== null),
        taskIds: rows.map((sample) => normalizeText(sample.task_id)).filter((value): value is string => value !== null),
        observationStartedAt: observed.startedAt,
        observationEndedAt: observed.endedAt,
        observationWindowDays: observed.windowDays,
        productionDaySamples: days,
        durationDayBasis: 'construction_production_day' as const,
        automationQualityEvidence,
      }
    })
    .sort((left, right) => [left.companyId, left.projectId, left.benchmarkKey].join(':')
      .localeCompare([right.companyId, right.projectId, right.benchmarkKey].join(':')))
}

async function loadGovernanceSamples(options: TemplateDurationGovernanceOptions) {
  return loadTemplateDurationGovernanceSamples({
    limit: options.maxSamples ?? DEFAULT_MAX_SAMPLES,
    companyId: options.companyId,
  }) as Promise<DurationExperienceSampleRow[]>
}

async function writeBenchmark(candidate: DurationBenchmarkCandidate, nowIso: string) {
  const candidateOperationId = createHash('sha256').update(JSON.stringify({
    companyId: candidate.companyId,
    projectId: candidate.projectId,
    benchmarkKey: candidate.benchmarkKey,
    durationDayBasis: candidate.durationDayBasis,
    sampleIds: [...candidate.sampleIds].sort(),
    p50Days: candidate.p50Days,
    p80Days: candidate.p80Days,
  })).digest('hex')
  await stageDurationBenchmarkCandidateAtomically({
      company_id: candidate.companyId,
      project_id: candidate.projectId,
      benchmark_key: candidate.benchmarkKey,
      benchmark_version: `candidate:${nowIso.slice(0, 10)}:${candidateOperationId.slice(0, 16)}`,
      template_node_id: isUuid(candidate.templateNodeId) ? candidate.templateNodeId : null,
      engineering_category_id: isUuid(candidate.engineeringCategoryId) ? candidate.engineeringCategoryId : null,
      project_context: candidate.benchmarkContextKey,
      wbs_node_type: candidate.wbsNodeType,
      sample_count: candidate.sampleCount,
      duration_day_basis: candidate.durationDayBasis,
      p50_days: candidate.p50Days,
      p75_days: candidate.p75Days,
      p80_days: candidate.p80Days,
      mean_days: candidate.meanDays,
      variance: candidate.variance,
      coefficient_of_variation: candidate.coefficientOfVariation,
      confidence_level: candidate.confidenceLevel,
      confidence_score: candidate.confidenceScore,
      is_current: false,
      is_active: true,
      duration_calibration_source: 'project_history_sample',
      metadata: {
        generated_by: 'templateDurationGovernanceService',
        runtime_publication_status: 'candidate',
        candidate_operation_id: candidateOperationId,
        benchmark_context_key: candidate.benchmarkContextKey,
        sample_ids: candidate.sampleIds,
        task_ids: candidate.taskIds,
        source_evidence_refs: candidate.sampleIds.map((sampleId) => `duration_experience_samples:${sampleId}`),
        observation_started_at: candidate.observationStartedAt,
        observation_ended_at: candidate.observationEndedAt,
        observation_window_days: candidate.observationWindowDays,
        production_day_samples: candidate.productionDaySamples,
        duration_day_basis: candidate.durationDayBasis,
        standard_work_code: candidate.standardWorkCode,
        standard_work_name: candidate.standardWorkName,
        variance: candidate.variance,
        coefficientOfVariation: candidate.coefficientOfVariation,
        quality_model: candidate.automationQualityEvidence.qualityModel,
        holdout_sample_count: candidate.automationQualityEvidence.holdoutSampleCount,
        mae_before: candidate.automationQualityEvidence.maeBefore,
        mae_after: candidate.automationQualityEvidence.maeAfter,
        conflict_rate: candidate.automationQualityEvidence.conflictRate,
        overcompensation_rate: candidate.automationQualityEvidence.overcompensationRate,
        rollback_ready: true,
        tenant_scope_valid: Boolean(candidate.companyId && candidate.projectId),
        writes_runtime_directly: false,
        writes_fact_directly: false,
      },
      created_at: nowIso,
      updated_at: nowIso,
    })
}

async function readTemplateReferenceDays(templateNodeId: string) {
  const { data, error } = await (supabase as any)
    .from('wbs_template_nodes')
    .select('default_duration_days, standard_duration, reference_days')
    .eq('id', templateNodeId)
    .maybeSingle()

  if (error) {
    logger.warn('[templateDurationGovernanceService] failed to read template node reference duration', {
      templateNodeId,
      error: error.message,
    })
    return null
  }

  return readPositiveDays(data?.standard_duration ?? data?.default_duration_days ?? data?.reference_days)
}

async function writeOverrideCandidate(
  candidate: DurationBenchmarkCandidate,
  options: Required<Pick<TemplateDurationGovernanceOptions, 'minOverrideSampleCount' | 'minOverrideDeviationRatio'>>,
  nowIso: string,
) {
  if (!candidate.templateNodeId || !isUuid(candidate.templateNodeId)) return false
  if (candidate.sampleCount < options.minOverrideSampleCount) return false

  const currentReferenceDays = await readTemplateReferenceDays(candidate.templateNodeId)
  if (!currentReferenceDays) return false

  const deviationRatio = Math.abs(candidate.p50Days - currentReferenceDays) / currentReferenceDays
  if (deviationRatio < options.minOverrideDeviationRatio) return false

  const overrideKey = [
    'template-duration',
    candidate.companyId ?? 'global',
    candidate.templateNodeId,
    candidate.wbsNodeType,
  ].join(':')
  const reason = `Experience benchmark P50 ${candidate.p50Days}d differs from template reference ${currentReferenceDays}d by ${Math.round(deviationRatio * 100)}%.`
  const payload = {
    override_key: overrideKey,
    company_id: candidate.companyId,
    project_id: null,
    template_node_id: candidate.templateNodeId,
    recommended_duration_days: candidate.p50Days,
    reason,
    override_status: 'candidate',
    updated_at: nowIso,
  }

  const { data: existing, error: lookupError } = await (supabase as any)
    .from('duration_suggestion_overrides')
    .select('id')
    .eq('override_key', overrideKey)
    .eq('override_status', 'candidate')
    .maybeSingle()

  if (lookupError) throw new Error(`Failed to lookup duration override candidate: ${lookupError.message}`)

  if (existing?.id) {
    const { error } = await (supabase as any)
      .from('duration_suggestion_overrides')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw new Error(`Failed to update duration override candidate: ${error.message}`)
    return true
  }

  const { error } = await (supabase as any)
    .from('duration_suggestion_overrides')
    .insert({ ...payload, created_at: nowIso })
  if (error) throw new Error(`Failed to insert duration override candidate: ${error.message}`)
  return true
}

export async function runTemplateDurationGovernance(
  options: TemplateDurationGovernanceOptions = {},
): Promise<TemplateDurationGovernanceResult> {
  const samples = await loadGovernanceSamples(options)
  const candidates = buildDurationBenchmarkCandidates(samples, options)
  const nowIso = new Date().toISOString()
  let benchmarksWritten = 0
  let overrideCandidatesWritten = 0

  for (const candidate of candidates) {
    await writeBenchmark(candidate, nowIso)
    benchmarksWritten += 1

    const wroteOverride = await writeOverrideCandidate(candidate, {
      minOverrideSampleCount: options.minOverrideSampleCount ?? DEFAULT_MIN_OVERRIDE_SAMPLE_COUNT,
      minOverrideDeviationRatio: options.minOverrideDeviationRatio ?? DEFAULT_OVERRIDE_DEVIATION_RATIO,
    }, nowIso)
    if (wroteOverride) overrideCandidatesWritten += 1
  }

  logger.info('[templateDurationGovernanceService] duration governance completed', {
    sampleCount: samples.length,
    benchmarkCandidates: candidates.length,
    benchmarksWritten,
    overrideCandidatesWritten,
  })

  return {
    sampleCount: samples.length,
    benchmarkCandidates: candidates.length,
    benchmarksWritten,
    overrideCandidatesWritten,
    c1910GovernanceContract: C1910_GOVERNANCE_CONTRACT,
  }
}
