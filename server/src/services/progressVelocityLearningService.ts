import { supabase } from './dbService.js'
import { detectProgressAnomalySignals, type ProgressAnomalySnapshot } from './progressAnomalyService.js'
import { buildAlgorithmFactContext, summarizeAlgorithmFactContext } from './algorithmFactContextService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import {
  validateDurationContextPolicyStateBucket,
  type DurationContextPolicyExperienceTier,
} from './durationContextPolicyStateBucketService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import {
  loadProgressVelocityCompanyDurationExperienceSamples,
  loadProgressVelocityProjectDurationExperienceSamples,
} from './durationContextSampleReadModelService.js'
import {
  effectiveConstructionCalendarBasis,
  isAuthoritativeConstructionCalendar,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'

export type ProgressVelocityLearningConfidence = 'high' | 'medium' | 'low'
export type ProgressVelocityLearningActionPolicy = 'auto_apply' | 'candidate_only' | 'confidence_only'

export interface ProgressVelocityLearningInput {
  projectId?: string | null
  companyId?: string | null
  taskId?: string | null
  templateNodeId?: string | null
  templateStableCode?: string | null
  standardWorkCode?: string | null
  engineeringCategoryId?: string | null
  responsibleUnitId?: string | null
  structureTypeCode?: string | null
  baseDurationDays?: number | null
  now?: Date
  constructionCalendarResolver?: typeof resolveConstructionCalendarContext
}

export interface ProgressVelocityLearningResult {
  durationRatio: number
  multiplier: number
  confidenceLevel: ProgressVelocityLearningConfidence
  confidenceScore: number
  confidenceDelta: number
  actionPolicy: ProgressVelocityLearningActionPolicy
  sampleCount: number
  variance: number
  groupKey: string
  excludedAnomalyTaskCount: number
  reason: string
  metadata: Record<string, unknown>
}

interface CompletedTaskSampleRow {
  id?: string | null
  title?: string | null
  project_id?: string | null
  engineering_category_id?: string | null
  participant_unit_id?: string | null
  responsible_unit_id?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  updated_at?: string | null
  progress?: number | null
  status?: string | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_task_metadata?: Record<string, unknown> | null
}

interface DurationExperienceSampleRow {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  template_node_id?: string | null
  standard_work_code?: string | null
  engineering_category_id?: string | null
  planned_duration?: number | null
  actual_duration?: number | null
  completed_at?: string | null
  sample_status?: string | null
  included_in_benchmark?: boolean | null
  sample_strength?: string | null
  confidence_level?: string | null
  metadata?: Record<string, unknown> | null
}

type SimilarTaskMatchLevel = 'exact' | 'standard_work' | 'category'

interface RatioSample {
  taskId: string
  ratio: number
  ratioBasis: 'actual_to_forecast' | 'actual_to_planned'
  planRatio: number | null
  weight: number
  qualityWeightMultiplier: number
  actualDuration: number
  plannedDuration: number
  actualEndDate: string
}

const LEARNING_WINDOW_DAYS = 183
const CROSS_PROJECT_SAMPLE_WEIGHT = 0.5
const PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER: DurationContextPolicyExperienceTier = 'T1'
const LEARNING_CONFIDENCE_POLICY = {
  minUsefulSamples: 3,
  highConfidenceSamples: 50,
  exactVarianceTarget: 0.3,
  standardWorkVarianceTarget: 0.5,
  categoryVarianceTarget: 0.65,
}

interface DurationExperienceRowsLoadResult {
  rows: DurationExperienceSampleRow[]
  rejectedExperienceTierSampleCount: number
  rejectedExperienceTierReasonCounts: Record<string, number>
  rejectedSampleStrengthSampleCount: number
  rejectedSampleStrengthReasonCounts: Record<string, number>
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function parseDate(value: unknown) {
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const date = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function resolveLearningWindowDays(input: ProgressVelocityLearningInput) {
  const baseDuration = Number(input.baseDurationDays ?? 0)
  if (Number.isFinite(baseDuration) && baseDuration > 0) {
    return Math.round(clamp(baseDuration * 8, 90, 365))
  }
  return LEARNING_WINDOW_DAYS
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function emptyDurationExperienceRowsLoadResult(): DurationExperienceRowsLoadResult {
  return {
    rows: [],
    rejectedExperienceTierSampleCount: 0,
    rejectedExperienceTierReasonCounts: {},
    rejectedSampleStrengthSampleCount: 0,
    rejectedSampleStrengthReasonCounts: {},
  }
}

function addReasonCount(counts: Record<string, number>, reasonCode: string) {
  counts[reasonCode] = (counts[reasonCode] ?? 0) + 1
}

function mergeReasonCounts(...items: Array<Record<string, number>>) {
  const merged: Record<string, number> = {}
  for (const item of items) {
    for (const [reasonCode, count] of Object.entries(item)) {
      merged[reasonCode] = (merged[reasonCode] ?? 0) + count
    }
  }
  return merged
}

function validateProgressVelocityExperienceTier(row: DurationExperienceSampleRow) {
  const metadata = readRecord(row.metadata)
  const bucket = metadata.state_bucket ?? metadata.stateBucket
  if (normalizeText(bucket)) {
    return validateDurationContextPolicyStateBucket(bucket, {
      expectedExperienceTier: PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER,
    })
  }

  const explicitTier = normalizeText(
    metadata.experienceTier
      ?? metadata.experience_tier
      ?? (row as any).experienceTier
      ?? (row as any).experience_tier,
  ).toUpperCase()
  if (explicitTier === PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER) {
    return {
      isValid: true,
      parsed: validateDurationContextPolicyStateBucket(
        `progress_velocity|risk:none|schedule:none|hard:0|experience:${PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER}`,
      ).parsed,
      reasonCodes: [],
    }
  }
  if (explicitTier === 'T2' || explicitTier === 'T3') {
    return {
      isValid: false,
      parsed: validateDurationContextPolicyStateBucket(
        `progress_velocity|risk:none|schedule:none|hard:0|experience:${explicitTier}`,
        { expectedExperienceTier: PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER },
      ).parsed,
      reasonCodes: ['experience_tier_mismatch'],
    }
  }
  return validateDurationContextPolicyStateBucket(undefined, {
    expectedExperienceTier: PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER,
  })
}

function filterProgressVelocityExperienceRows(rows: DurationExperienceSampleRow[]): DurationExperienceRowsLoadResult {
  const acceptedRows: DurationExperienceSampleRow[] = []
  const rejectedExperienceTierReasonCounts: Record<string, number> = {}
  const rejectedSampleStrengthReasonCounts: Record<string, number> = {}
  let rejectedExperienceTierSampleCount = 0
  let rejectedSampleStrengthSampleCount = 0

  for (const row of rows) {
    const sampleStrength = normalizeText(row.sample_strength).toLowerCase()
    if (sampleStrength !== 'strong' && sampleStrength !== 'medium') {
      rejectedSampleStrengthSampleCount += 1
      addReasonCount(
        rejectedSampleStrengthReasonCounts,
        sampleStrength ? `sample_strength_${sampleStrength}_not_benchmark_eligible` : 'sample_strength_missing',
      )
      continue
    }
    const validation = validateProgressVelocityExperienceTier(row)
    if (validation.isValid) {
      acceptedRows.push(row)
      continue
    }
    rejectedExperienceTierSampleCount += 1
    for (const reasonCode of validation.reasonCodes) addReasonCount(rejectedExperienceTierReasonCounts, reasonCode)
  }

  return {
    rows: acceptedRows,
    rejectedExperienceTierSampleCount,
    rejectedExperienceTierReasonCounts,
    rejectedSampleStrengthSampleCount,
    rejectedSampleStrengthReasonCounts,
  }
}

function getResponsibleUnitId(row: CompletedTaskSampleRow) {
  return normalizeText(row.responsible_unit_id) || normalizeText(row.participant_unit_id) || null
}

function isCompletedSampleRow(row: CompletedTaskSampleRow) {
  const status = normalizeText(row.status).toLowerCase()
  return Number(row.progress ?? 0) >= 100
    || ['completed', 'done', 'closed', 'finished', '已完成', '完成', '关闭'].includes(status)
}

function completedSampleEndDate(row: CompletedTaskSampleRow) {
  return parseDate(row.actual_end_date)
}

function isInLearningWindow(row: CompletedTaskSampleRow, now: Date, learningWindowDays = LEARNING_WINDOW_DAYS) {
  const actualEnd = completedSampleEndDate(row)
  if (!actualEnd) return false
  const ageDays = signedDurationDayDelta(actualEnd, now) ?? 0
  return ageDays >= 0 && ageDays <= learningWindowDays
}

function buildRatioSample(
  row: CompletedTaskSampleRow,
  now: Date,
  learningWindowDays = LEARNING_WINDOW_DAYS,
  constructionCalendar?: ConstructionCalendarContext | null,
): RatioSample | null {
  if (!isAuthoritativeConstructionCalendar(constructionCalendar)) return null
  const actualStart = parseDate(row.actual_start_date)
  const actualEnd = completedSampleEndDate(row)
  const plannedStart = parseDate(row.planned_start_date ?? row.start_date)
  const plannedEnd = parseDate(row.planned_end_date ?? row.end_date)
  const actualDuration = actualStart && actualEnd
    ? productionDaysBetweenInclusive(actualStart, actualEnd, constructionCalendar)
    : null
  const plannedDuration = plannedStart && plannedEnd
    ? productionDaysBetweenInclusive(plannedStart, plannedEnd, constructionCalendar)
    : null
  if (!actualDuration || !plannedDuration) return null

  const ratio = actualDuration / plannedDuration
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 4) return null

  const ageDays = Math.max(0, signedDurationDayDelta(actualEnd, now) ?? 0)
  const weight = clamp(1 - ageDays / (learningWindowDays * 2), 0.5, 1)
  return {
    taskId: normalizeText(row.id),
    ratio,
    ratioBasis: 'actual_to_planned',
    planRatio: ratio,
    weight,
    qualityWeightMultiplier: 1,
    actualDuration,
    plannedDuration,
    actualEndDate: actualEnd!.toISOString().slice(0, 10),
  }
}

function sampleProjectGenerationFacts(row: DurationExperienceSampleRow) {
  const metadata = readRecord(row.metadata)
  return {
    structureTypeCode: normalizeText(
      metadata.structure_type_code
      ?? metadata.structureTypeCode
      ?? (metadata.projectGenerationFacts as any)?.structureTypeCode
      ?? (metadata.project_generation_facts as any)?.structure_type_code,
    ) || null,
  }
}

function durationExperienceSampleId(row: DurationExperienceSampleRow) {
  return normalizeText(row.task_id) || normalizeText(row.id)
}

function experienceSampleToTaskRow(row: DurationExperienceSampleRow): CompletedTaskSampleRow | null {
  const plannedDuration = Number(row.planned_duration ?? 0)
  const actualDuration = Number(row.actual_duration ?? 0)
  const completedAt = normalizeDate(row.completed_at)
  if (!Number.isFinite(plannedDuration) || plannedDuration <= 0) return null
  if (!Number.isFinite(actualDuration) || actualDuration <= 0) return null
  if (!completedAt) return null
  const metadata = readRecord(row.metadata)
  return {
    id: durationExperienceSampleId(row),
    project_id: normalizeText(row.project_id),
    status: 'completed',
    progress: 100,
    template_node_id: row.template_node_id ?? null,
    standard_work_code: row.standard_work_code ?? null,
    engineering_category_id: row.engineering_category_id ?? null,
    participant_unit_id: normalizeText(metadata.participant_unit_id ?? metadata.responsible_unit_id) || null,
    responsible_unit_id: normalizeText(metadata.responsible_unit_id ?? metadata.participant_unit_id) || null,
    planned_start_date: completedAt,
    planned_end_date: completedAt,
    actual_start_date: completedAt,
    actual_end_date: completedAt,
    updated_at: `${completedAt}T00:00:00.000Z`,
    standard_task_metadata: sampleProjectGenerationFacts(row),
  }
}

function readActiveForecastLearningObservation(row: DurationExperienceSampleRow) {
  const metadata = readRecord(row.metadata)
  const observation = readRecord(metadata.forecast_learning_observation ?? metadata.forecastLearningObservation)
  const target = normalizeText(observation.learning_target ?? observation.learningTarget)
  const policy = normalizeText(observation.production_consumption_policy ?? observation.productionConsumptionPolicy)
  if (target !== 'forecast_ratio_velocity_multiplier') return null
  if (policy !== 'active_velocity_multiplier_input') return null
  const actualStartSource = normalizeText(
    observation.actual_start_source
      ?? observation.actualStartSource
      ?? metadata.actual_start_source
      ?? metadata.actualStartSource,
  )
  const actualEndSource = normalizeText(
    observation.actual_end_source
      ?? observation.actualEndSource
      ?? metadata.actual_end_source
      ?? metadata.actualEndSource,
  )
  const actualDurationSource = normalizeText(
    observation.actual_duration_source
      ?? observation.actualDurationSource
      ?? metadata.actual_duration_source
      ?? metadata.actualDurationSource,
  )
  if (actualStartSource !== 'actual_start_date' || actualEndSource !== 'actual_end_date') return null
  if (actualDurationSource !== 'actual_start_date_to_actual_end_date') return null

  const actualDurationDays = Number(observation.actual_duration_days ?? observation.actualDurationDays)
  const forecastDurationDays = Number(observation.forecast_duration_days ?? observation.forecastDurationDays)
  if (!Number.isFinite(actualDurationDays) || actualDurationDays <= 0) return null
  if (!Number.isFinite(forecastDurationDays) || forecastDurationDays <= 0) return null
  const forecastRatio = actualDurationDays / forecastDurationDays
  if (!Number.isFinite(forecastRatio) || forecastRatio <= 0 || forecastRatio > 4) return null
  return {
    forecastRatio,
    planRatio: Number(observation.plan_ratio ?? observation.planRatio),
  }
}

function buildExperienceRatioSample(
  row: DurationExperienceSampleRow,
  now: Date,
  learningWindowDays: number,
  sampleWeightMultiplier = CROSS_PROJECT_SAMPLE_WEIGHT,
): RatioSample | null {
  const plannedDuration = Number(row.planned_duration ?? 0)
  const actualDuration = Number(row.actual_duration ?? 0)
  const completedAt = parseDate(row.completed_at)
  if (!completedAt || !Number.isFinite(plannedDuration) || plannedDuration <= 0 || !Number.isFinite(actualDuration) || actualDuration <= 0) return null
  const ageDays = signedDurationDayDelta(completedAt, now) ?? 0
  if (ageDays < 0 || ageDays > learningWindowDays) return null
  const planRatio = actualDuration / plannedDuration
  const forecastObservation = readActiveForecastLearningObservation(row)
  const ratio = forecastObservation?.forecastRatio ?? planRatio
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 4) return null
  return {
    taskId: durationExperienceSampleId(row),
    ratio,
    ratioBasis: forecastObservation ? 'actual_to_forecast' : 'actual_to_planned',
    planRatio: Number.isFinite(forecastObservation?.planRatio) && Number(forecastObservation?.planRatio) > 0
      ? Number(forecastObservation?.planRatio)
      : planRatio,
    weight: clamp(1 - ageDays / (learningWindowDays * 2), 0.5, 1) * sampleWeightMultiplier,
    qualityWeightMultiplier: sampleWeightMultiplier,
    actualDuration,
    plannedDuration,
    actualEndDate: completedAt.toISOString().slice(0, 10),
  }
}

function anomalyLearningAdjustment(signals: ReturnType<typeof detectProgressAnomalySignals>) {
  if (signals.length === 0) {
    return {
      exclude: false,
      weightMultiplier: 1,
      mode: 'full_weight' as const,
    }
  }
  if (signals.some((signal) => signal.severity === 'critical' && signal.excludedFromVelocityLearning)) {
    return {
      exclude: true,
      weightMultiplier: 0,
      mode: 'exclude_duration_learning' as const,
    }
  }
  if (signals.some((signal) => signal.severity === 'warning' || signal.excludedFromVelocityLearning)) {
    return {
      exclude: false,
      weightMultiplier: 0.45,
      mode: 'downgrade_duration_learning' as const,
    }
  }
  return {
    exclude: false,
    weightMultiplier: 0.75,
    mode: 'soft_downgrade_duration_learning' as const,
  }
}

function weightedAverage(samples: RatioSample[]) {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)
  if (totalWeight <= 0) return 0
  return samples.reduce((sum, sample) => sum + sample.ratio * sample.weight, 0) / totalWeight
}

function weightedVariance(samples: RatioSample[], average: number) {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)
  if (totalWeight <= 0) return 0
  return samples.reduce((sum, sample) => sum + ((sample.ratio - average) ** 2) * sample.weight, 0) / totalWeight
}

function confidenceFromSamples(
  sampleCount: number,
  variance: number,
  matchLevel: SimilarTaskMatchLevel,
): ProgressVelocityLearningConfidence {
  const score = confidenceScoreFromSamples(sampleCount, variance, matchLevel)
  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

function actionPolicyForConfidence(confidence: ProgressVelocityLearningConfidence): ProgressVelocityLearningActionPolicy {
  if (confidence === 'high') return 'auto_apply'
  if (confidence === 'medium') return 'candidate_only'
  return 'confidence_only'
}

function confidenceVarianceTarget(matchLevel: SimilarTaskMatchLevel) {
  if (matchLevel === 'exact') return LEARNING_CONFIDENCE_POLICY.exactVarianceTarget
  if (matchLevel === 'standard_work') return LEARNING_CONFIDENCE_POLICY.standardWorkVarianceTarget
  return LEARNING_CONFIDENCE_POLICY.categoryVarianceTarget
}

function matchLevelConfidenceFloor(matchLevel: SimilarTaskMatchLevel) {
  if (matchLevel === 'exact') return 40
  if (matchLevel === 'standard_work') return 35
  return 28
}

function confidenceScoreFromSamples(
  sampleCount: number,
  variance: number,
  matchLevel: SimilarTaskMatchLevel,
) {
  if (sampleCount < LEARNING_CONFIDENCE_POLICY.minUsefulSamples) {
    return Math.round(clamp(28 + sampleCount * 4, 20, 44))
  }
  const sampleRatio = clamp(
    (sampleCount - LEARNING_CONFIDENCE_POLICY.minUsefulSamples)
      / (LEARNING_CONFIDENCE_POLICY.highConfidenceSamples - LEARNING_CONFIDENCE_POLICY.minUsefulSamples),
    0,
    1,
  )
  const baseScore = matchLevel === 'exact' ? 75 : matchLevel === 'standard_work' ? 52 : 35
  const sampleScore = baseScore + sampleRatio * 20
  const varianceTarget = confidenceVarianceTarget(matchLevel)
  const variancePenalty = clamp(variance / Math.max(varianceTarget, 0.001), 0, 1) * 18
  return Math.round(clamp(
    Math.max(matchLevelConfidenceFloor(matchLevel), sampleScore - variancePenalty),
    20,
    95,
  ))
}

function confidenceDeltaFromScore(score: number) {
  return Math.round(clamp((score - 55) / 5, -8, 5))
}

async function loadSnapshotsByTask(taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, ProgressAnomalySnapshot[]>()

  const { data, error } = await (supabase as any)
    .from('task_progress_snapshots')
    .select('task_id, progress, snapshot_date, created_at, notes, event_source')
    .in('task_id', taskIds)

  if (error || !Array.isArray(data)) return new Map<string, ProgressAnomalySnapshot[]>()

  const byTask = new Map<string, ProgressAnomalySnapshot[]>()
  for (const row of data as ProgressAnomalySnapshot[]) {
    const taskId = normalizeText(row.task_id)
    if (!taskId) continue
    const list = byTask.get(taskId) ?? []
    list.push(row)
    byTask.set(taskId, list)
  }
  return byTask
}

async function loadCompanyExperienceRows(input: ProgressVelocityLearningInput, now: Date, learningWindowDays: number) {
  const companyId = normalizeText(input.companyId)
  if (!companyId) return emptyDurationExperienceRowsLoadResult()
  if (!normalizeText(input.standardWorkCode) && !normalizeText(input.templateNodeId) && !normalizeText(input.engineeringCategoryId)) return emptyDurationExperienceRowsLoadResult()

  const data = await loadProgressVelocityCompanyDurationExperienceSamples({
    companyId,
    excludeProjectId: normalizeText(input.projectId) || null,
    limit: 200,
  }) as DurationExperienceSampleRow[]
  const currentProjectId = normalizeText(input.projectId)
  const candidateRows = data
    .filter((row) => normalizeText(row.project_id) !== currentProjectId)
    .filter((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
      return normalizeText((row as any).company_id ?? metadata.company_id) === companyId
    })
  const filtered = filterProgressVelocityExperienceRows(candidateRows)
  return {
    ...filtered,
    rows: filtered.rows.filter((row) => Boolean(buildExperienceRatioSample(row, now, learningWindowDays))),
  }
}

async function loadProjectExperienceRows(input: ProgressVelocityLearningInput, now: Date, learningWindowDays: number) {
  const projectId = normalizeText(input.projectId)
  const companyId = normalizeText(input.companyId)
  if (!projectId || !companyId) return emptyDurationExperienceRowsLoadResult()
  if (!normalizeText(input.standardWorkCode) && !normalizeText(input.templateNodeId) && !normalizeText(input.engineeringCategoryId)) return emptyDurationExperienceRowsLoadResult()

  const data = await loadProgressVelocityProjectDurationExperienceSamples({
    companyId,
    projectId,
    limit: 200,
  }) as DurationExperienceSampleRow[]
  const candidateRows = data
    .filter((row) => normalizeText(row.project_id) === projectId)
  const filtered = filterProgressVelocityExperienceRows(candidateRows)
  return {
    ...filtered,
    rows: filtered.rows.filter((row) => Boolean(buildExperienceRatioSample(row, now, learningWindowDays, 1))),
  }
}

function chooseLearningGroup(
  input: ProgressVelocityLearningInput,
  rows: CompletedTaskSampleRow[],
) {
  const templateNodeId = normalizeText(input.templateNodeId)
  const standardWorkCode = normalizeText(input.standardWorkCode)
  const categoryId = normalizeText(input.engineeringCategoryId)
  const responsibleUnitId = normalizeText(input.responsibleUnitId)
  const structureTypeCode = normalizeText(input.structureTypeCode).toLowerCase()

  const templateRows = templateNodeId
    ? rows.filter((row) => normalizeText(row.template_node_id) === templateNodeId)
    : []
  const exactRows = templateRows.filter((row) => {
    if (!structureTypeCode) return true
    const factContext = buildAlgorithmFactContext({
      phase: 'runtime_forecast',
      projectGenerationFacts: readProjectGenerationFactsSnapshot(row.standard_task_metadata),
      runtimeExecutionFacts: {
        progressCompletionRatio: row.progress == null ? undefined : Number(row.progress) / 100,
        evidenceCodes: ['completed_task_velocity_sample'],
      },
    })
    const rowStructureType = normalizeText(
      factContext.projectGenerationFacts.structureTypeCode
      ?? row.standard_task_metadata?.structureTypeCode
      ?? row.standard_task_metadata?.structure_type_code,
    ).toLowerCase()
    return rowStructureType === structureTypeCode
  })

  const standardWorkRows = standardWorkCode
    ? rows.filter((row) => normalizeText(row.standard_work_code) === standardWorkCode)
    : []

  const categoryRows = categoryId
    ? rows.filter((row) => normalizeText(row.engineering_category_id) === categoryId)
    : []
  const unitCategoryRows = categoryId && responsibleUnitId
    ? categoryRows.filter((row) => getResponsibleUnitId(row) === responsibleUnitId)
    : []

  const candidates = [
    {
      rows: exactRows,
      groupKey: `template:${templateNodeId}:structure:${structureTypeCode || 'any'}`,
      matchLevel: 'exact' as const,
      specificity: 4,
    },
    {
      rows: standardWorkRows,
      groupKey: `standard_work:${standardWorkCode}`,
      matchLevel: 'standard_work' as const,
      specificity: 3,
    },
    {
      rows: unitCategoryRows,
      groupKey: `unit:${responsibleUnitId}:category:${categoryId}`,
      matchLevel: 'category' as const,
      specificity: 2,
    },
    {
      rows: categoryRows,
      groupKey: `category:${categoryId}`,
      matchLevel: 'category' as const,
      specificity: 1,
    },
  ].filter((candidate) => candidate.rows.length > 0)

  const exactCandidate = candidates.find((candidate) => candidate.matchLevel === 'exact')
  const standardWorkCandidate = candidates.find((candidate) => candidate.matchLevel === 'standard_work')
  if (
    exactCandidate
    && standardWorkCandidate
    && exactCandidate.rows.length < LEARNING_CONFIDENCE_POLICY.minUsefulSamples * 2
    && standardWorkCandidate.rows.length >= exactCandidate.rows.length * 2
  ) {
    return {
      rows: standardWorkCandidate.rows,
      groupKey: standardWorkCandidate.groupKey,
      matchLevel: standardWorkCandidate.matchLevel,
    }
  }

  const usefulCandidates = candidates
    .filter((candidate) => candidate.rows.length >= LEARNING_CONFIDENCE_POLICY.minUsefulSamples)
    .sort((left, right) => right.specificity - left.specificity)
  const selected = usefulCandidates[0]
    ?? candidates.sort((left, right) => right.rows.length - left.rows.length || right.specificity - left.specificity)[0]
  if (selected) {
    return { rows: selected.rows, groupKey: selected.groupKey, matchLevel: selected.matchLevel }
  }

  return { rows: [] as CompletedTaskSampleRow[], groupKey: categoryId ? `category:${categoryId}` : 'project:none', matchLevel: 'category' as const }
}

export async function buildProjectProgressVelocityLearning(
  input: ProgressVelocityLearningInput,
): Promise<ProgressVelocityLearningResult | null> {
  const projectId = normalizeText(input.projectId)
  if (!projectId) return null

  const now = input.now ?? new Date()
  const learningWindowDays = resolveLearningWindowDays(input)
  const { data, error } = await (supabase as any)
    .from('tasks')
    .select('id, title, project_id, template_node_id, standard_work_code, engineering_category_id, participant_unit_id, responsible_unit_id, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, updated_at, progress, status, standard_task_metadata')
    .eq('project_id', projectId)
    .limit(200)

  if (error || !Array.isArray(data)) return null

  const currentTaskId = normalizeText(input.taskId)
  const eligibleRows = (data as CompletedTaskSampleRow[])
    .filter((row) => normalizeText(row.id) && normalizeText(row.id) !== currentTaskId)
    .filter(isCompletedSampleRow)
    .filter((row) => isInLearningWindow(row, now, learningWindowDays))

  const projectExperienceLoad = await loadProjectExperienceRows(input, now, learningWindowDays)
  const projectExperienceRows = projectExperienceLoad.rows
  const projectExperienceSampleTaskIds = new Set(projectExperienceRows.map(durationExperienceSampleId).filter(Boolean))
  const projectExperienceTaskRows = projectExperienceRows
    .map(experienceSampleToTaskRow)
    .filter((row): row is CompletedTaskSampleRow => Boolean(row))
  const eligibleRowsWithoutExperienceDuplicates = eligibleRows
    .filter((row) => !projectExperienceSampleTaskIds.has(normalizeText(row.id)))

  let selectedGroup = chooseLearningGroup(input, [
    ...eligibleRowsWithoutExperienceDuplicates,
    ...projectExperienceTaskRows,
  ])
  let companyExperienceLoad = emptyDurationExperienceRowsLoadResult()
  let companyFallbackRows: DurationExperienceSampleRow[] = []
  if (selectedGroup.rows.length < LEARNING_CONFIDENCE_POLICY.minUsefulSamples && normalizeText(input.companyId)) {
    companyExperienceLoad = await loadCompanyExperienceRows(input, now, learningWindowDays)
    companyFallbackRows = companyExperienceLoad.rows
    const existingExperienceTaskIds = new Set([
      ...projectExperienceRows.map(durationExperienceSampleId),
      ...companyFallbackRows.map(durationExperienceSampleId),
    ].filter(Boolean))
    const companyTaskRows = companyFallbackRows
      .map(experienceSampleToTaskRow)
      .filter((row): row is CompletedTaskSampleRow => Boolean(row))
    const combinedGroup = chooseLearningGroup(input, [
      ...eligibleRows.filter((row) => !existingExperienceTaskIds.has(normalizeText(row.id))),
      ...projectExperienceTaskRows,
      ...companyTaskRows,
    ])
    if (combinedGroup.rows.length > selectedGroup.rows.length) selectedGroup = combinedGroup
  }
  if (selectedGroup.rows.length < 1) return null

  const experienceRowsByTaskId = new Map<string, { row: DurationExperienceSampleRow; weightMultiplier: number }>()
  for (const row of projectExperienceRows) {
    const taskId = durationExperienceSampleId(row)
    if (taskId) experienceRowsByTaskId.set(taskId, { row, weightMultiplier: 1 })
  }
  for (const row of companyFallbackRows) {
    const taskId = durationExperienceSampleId(row)
    if (taskId && !experienceRowsByTaskId.has(taskId)) {
      experienceRowsByTaskId.set(taskId, { row, weightMultiplier: CROSS_PROJECT_SAMPLE_WEIGHT })
    }
  }
  const hasRawTaskSamples = selectedGroup.rows.some((row) => (
    !experienceRowsByTaskId.has(normalizeText(row.id))
  ))
  const constructionCalendar = hasRawTaskSamples
    ? await (input.constructionCalendarResolver ?? resolveConstructionCalendarContext)({ projectId })
    : null
  const taskIds = selectedGroup.rows
    .map((row) => normalizeText(row.id))
    .filter((taskId) => taskId && !experienceRowsByTaskId.has(taskId))
  const snapshotsByTask = await loadSnapshotsByTask(taskIds)
  let excludedAnomalyTaskCount = 0
  let downgradedAnomalyTaskCount = 0
  const samples: RatioSample[] = []

  for (const row of selectedGroup.rows) {
    const taskId = normalizeText(row.id)
    const experienceRow = experienceRowsByTaskId.get(taskId)
    if (experienceRow) {
      const sample = buildExperienceRatioSample(experienceRow.row, now, learningWindowDays, experienceRow.weightMultiplier)
      if (sample) samples.push(sample)
      continue
    }
    const anomalySignals = detectProgressAnomalySignals(snapshotsByTask.get(taskId) ?? [])
    const learningAdjustment = anomalyLearningAdjustment(anomalySignals)
    if (learningAdjustment.exclude) {
      excludedAnomalyTaskCount += 1
      continue
    }

    const sample = buildRatioSample(row, now, learningWindowDays, constructionCalendar)
    if (sample) {
      sample.weight *= learningAdjustment.weightMultiplier
      sample.qualityWeightMultiplier = learningAdjustment.weightMultiplier
      if (learningAdjustment.mode !== 'full_weight') downgradedAnomalyTaskCount += 1
      samples.push(sample)
    }
  }

  if (samples.length < 1) return null

  const durationRatio = weightedAverage(samples)
  const variance = weightedVariance(samples, durationRatio)
  const effectiveSampleWeight = samples.reduce((sum, sample) => sum + sample.qualityWeightMultiplier, 0)
  const confidenceScore = confidenceScoreFromSamples(effectiveSampleWeight, variance, selectedGroup.matchLevel)
  const confidenceLevel = confidenceFromSamples(effectiveSampleWeight, variance, selectedGroup.matchLevel)
  const actionPolicy = actionPolicyForConfidence(confidenceLevel)
  const multiplier = clamp(durationRatio, 0.75, 1.35)
  const forecastRatioSampleCount = samples.filter((sample) => sample.ratioBasis === 'actual_to_forecast').length
  const rejectedExperienceTierSampleCount = projectExperienceLoad.rejectedExperienceTierSampleCount
    + companyExperienceLoad.rejectedExperienceTierSampleCount
  const rejectedExperienceTierReasonCounts = mergeReasonCounts(
    projectExperienceLoad.rejectedExperienceTierReasonCounts,
    companyExperienceLoad.rejectedExperienceTierReasonCounts,
  )
  const rejectedSampleStrengthSampleCount = projectExperienceLoad.rejectedSampleStrengthSampleCount
    + companyExperienceLoad.rejectedSampleStrengthSampleCount
  const rejectedSampleStrengthReasonCounts = mergeReasonCounts(
    projectExperienceLoad.rejectedSampleStrengthReasonCounts,
    companyExperienceLoad.rejectedSampleStrengthReasonCounts,
  )
  const learningTarget = forecastRatioSampleCount === samples.length
    ? 'actual_to_forecast'
    : forecastRatioSampleCount > 0
      ? 'mixed_actual_to_forecast_with_planned_fallback'
      : 'actual_to_planned'
  const directionBasis = learningTarget === 'actual_to_planned' ? 'planned' : 'forecast'
  const direction = durationRatio >= 1
    ? `${round(durationRatio, 2)}x slower than ${directionBasis}`
    : `${round(1 / Math.max(durationRatio, 0.01), 2)}x faster than ${directionBasis}`

  return {
    durationRatio: round(durationRatio),
    multiplier: round(multiplier),
    confidenceLevel,
    confidenceScore,
    confidenceDelta: confidenceDeltaFromScore(confidenceScore),
    actionPolicy,
    sampleCount: samples.length,
    variance: round(variance),
    groupKey: selectedGroup.groupKey,
    excludedAnomalyTaskCount,
    reason: `${companyFallbackRows.length > 0 ? 'Project and company history' : 'Project history'} shows this work group is ${direction}; anomalous progress records were excluded or downweighted from learning.`,
    metadata: {
      algorithmFactContext: summarizeAlgorithmFactContext(buildAlgorithmFactContext({
        phase: 'runtime_forecast',
        projectGenerationFacts: selectedGroup.rows[0]?.standard_task_metadata
          ? readProjectGenerationFactsSnapshot(selectedGroup.rows[0].standard_task_metadata)
          : {},
        runtimeExecutionFacts: {
          evidenceCodes: ['progress_velocity_learning_samples'],
        },
      })),
      learningWindowDays,
      rawTaskDurationDayBasis: 'construction_production_day',
      constructionCalendarBasis: constructionCalendar
        ? effectiveConstructionCalendarBasis(constructionCalendar)
        : 'duration_experience_sample_basis',
      learningScope: companyFallbackRows.length > 0 ? 'project_plus_company' : 'project',
      experienceTier: PROGRESS_VELOCITY_EXPECTED_EXPERIENCE_TIER,
      learningBucketValidation: 'duration_context_policy_state_bucket_T1_only',
      rejectedExperienceTierSampleCount,
      rejectedExperienceTierReasonCounts,
      rejectedSampleStrengthSampleCount,
      rejectedSampleStrengthReasonCounts,
      projectExperienceSampleCount: projectExperienceRows.length,
      companyFallbackSampleCount: companyFallbackRows.length,
      crossProjectSampleWeight: companyFallbackRows.length > 0 ? CROSS_PROJECT_SAMPLE_WEIGHT : null,
      learningTarget,
      groupKey: selectedGroup.groupKey,
      matchLevel: selectedGroup.matchLevel,
      sampleTaskIds: samples.map((sample) => sample.taskId),
      sampleRatios: samples.map((sample) => round(sample.ratio)),
      samplePlanRatios: samples.map((sample) => sample.planRatio == null ? null : round(sample.planRatio)),
      sampleRatioBases: samples.map((sample) => sample.ratioBasis),
      sampleQualityWeightMultipliers: samples.map((sample) => round(sample.qualityWeightMultiplier)),
      effectiveSampleWeight: round(effectiveSampleWeight),
      excludedAnomalyTaskCount,
      downgradedAnomalyTaskCount,
      variance: round(variance),
      confidenceLevel,
      confidenceScore,
      confidenceDelta: confidenceDeltaFromScore(confidenceScore),
      confidencePolicy: LEARNING_CONFIDENCE_POLICY,
    },
  }
}
