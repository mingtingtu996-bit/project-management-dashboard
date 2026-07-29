// v1.4.7.4: monthly plan generation algorithm service.

import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import { forecastBatchTasks } from './taskDurationForecastService.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import {
  buildMonthlyPlanBusinessReasons,
  scorePlanningRecommendation,
  type PlanningBusinessReason,
  type PlanningConfidenceLevel,
  type PlanningRecommendationLevel,
} from './planningGenerationReasonService.js'
import {
  hasV1474WorkCalendarForYear,
  resolveV1474BuildingPatternMatches,
  resolveV1474HolidayWindow,
  resolveV1474SeasonalProductivity,
  type AlgorithmSeedResolveContext,
} from './algorithmSeedResolver.js'
import {
  buildBuildingPatternExecutionProfile,
  buildBuildingPatternExecutionProfileReason,
  type BuildingPatternExecutionProfile,
} from './buildingPatternExecutionProfileService.js'
import {
  buildConstructionRhythmExpansion,
  buildConstructionRhythmExpansionReason,
  type ConstructionRhythmExpansionResult,
} from './constructionRhythmExpansionService.js'
import {
  buildConstructionRhythmArbitration,
  buildConstructionRhythmArbitrationReason,
  type ConstructionRhythmArbitrationResult,
} from './constructionRhythmArbitrationService.js'
import {
  buildConstructionRhythmCoordination,
  buildConstructionRhythmCoordinationReason,
  type ConstructionRhythmCoordinationResult,
} from './constructionRhythmCoordinationService.js'
import {
  buildBuildingPatternExecutionPlanCandidateReason,
  buildBuildingPatternExecutionPlanCandidates,
  type BuildingPatternExecutionPlanCandidateResult,
} from './buildingPatternExecutionPlanCandidateService.js'
import { buildConstructionSeedScopeContext } from './constructionScopeInferenceService.js'
import { resolveProjectClimateRegion } from './projectClimateResolver.js'
import { deriveV1474SeasonalProductivityRegion } from '../seeds/v1474SeasonalProductivitySeed.js'
import { buildProjectHealthDeviationSummary } from './projectHealthDeviationSummaryService.js'
import { buildPlanSnapshotSeedVersions } from './planSnapshotSeedVersions.js'
import { buildProjectProductivityCompensation } from './projectProductivityCompensationService.js'
import { listProjectWarningProjectionRows } from './projectWarningProjectionService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import {
  buildAlgorithmFactContext,
  summarizeAlgorithmFactContext,
} from './algorithmFactContextService.js'
import {
  readPlanningReplayCalibrationReadback,
  type PlanningReplayCalibrationReadback,
} from './planningReplayCalibrationService.js'
import {
  effectiveConstructionCalendarBasis,
  isConstructionProductionDay,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { isActiveWarning } from '../utils/warningStatus.js'
import type { MonthlyPlan, MonthlyPlanItem, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'

const AUTO_REALIGN_BASELINE_STATUSES = new Set(['pending_realign'])
const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export interface MonthlyPlanSeedItem extends Omit<MonthlyPlanItem, 'id' | 'project_id' | 'monthly_plan_version_id' | 'created_at' | 'updated_at'> {}

export interface MonthlyPlanGenerationSummary {
  algorithmVersion: 'v1.4.7.4'
  sourceMode: 'baseline' | 'schedule' | 'mixed'
  sourceVersionLabel: string
  baselineStatus: string | null
  autoSwitched: boolean
  itemCount: number
  carryoverItemCount: number
  criticalPathItemCount: number
  forecastDelayedCount: number
  maxForecastDelayDays: number
  keyNodeSnapshotCount: number
  keyNodeImpactedTaskCount: number
  dependencyEdgeCount: number
  requiredDependencyCount: number
  unsatisfiedConditionCount: number
  blockingConditionCount: number
  activeObstacleCount: number
  blockingObstacleCount: number
  drawingLinkCount: number
  materialLinkCount: number
  materialAttentionCount: number
  acceptancePendingCount: number
  openRiskCount: number
  openIssueCount: number
  activeWarningCount: number
  criticalExternalSignalCount: number
  healthRiskSignalCount: number
  capacityBudgetDays: number
  capacityDemandDays: number
  capacityAllocatedDays: number
  capacityOverCommitted: boolean
  capacityRebalancedItemCount: number
  buildingPatternSeedMatchCount: number
  buildingPatternHighConfidenceCount: number
  buildingPatternLowConfidenceCount: number
  buildingPatternConfidenceScoreAvg: number
  buildingPatternControlChainCount: number
  buildingPatternDurationCurveProfileCount: number
  buildingPatternPriorityAvg: number
  buildingPatternExecutionModeCount: number
  buildingPatternExecutionBackendConsumableModeCount: number
  buildingPatternExecutionLowConfidenceModeCount: number
  buildingPatternExecutionReadinessScore: number
  buildingPatternExecutionScopeDimensionCount: number
  buildingPatternExecutionFeatureCoveragePercent: number
  buildingPatternExecutionStandardWorkCoveragePercent: number
  constructionRhythmExpansionCandidateCount: number
  constructionRhythmBackendConsumableCandidateCount: number
  constructionRhythmLimitedCandidateCount: number
  constructionRhythmWorkfaceCandidateCount: number
  constructionRhythmStrategyCount: number
  constructionRhythmArbitrationSignalCount: number
  constructionRhythmBackendConsumableSignalCount: number
  constructionRhythmConfidenceOnlySignalCount: number
  constructionRhythmCandidateDependencySignalCount: number
  constructionRhythmCandidateEarliestStartSignalCount: number
  constructionRhythmCandidateDurationContextSignalCount: number
  constructionRhythmParallelCautionSignalCount: number
  constructionRhythmArbitrationScore: number
  constructionRhythmCoordinationSignalCount: number
  constructionRhythmCoordinationBackendConsumableSignalCount: number
  constructionRhythmCoordinationConfidenceOnlySignalCount: number
  constructionRhythmDependencyCoordinationSignalCount: number
  constructionRhythmEarliestStartCoordinationSignalCount: number
  constructionRhythmDurationContextCoordinationSignalCount: number
  constructionRhythmSiteCapacityCoordinationSignalCount: number
  constructionRhythmProgressCoordinationSignalCount: number
  constructionRhythmReadinessCoordinationSignalCount: number
  constructionRhythmQualityCoordinationSignalCount: number
  constructionRhythmDurationExperienceCoordinationSignalCount: number
  constructionRhythmCoordinationScore: number
  buildingPatternExecutionPlanCandidateCount: number
  buildingPatternExecutionRecommendedPlanCandidateCount: number
  buildingPatternExecutionConservativePlanCandidateCount: number
  buildingPatternExecutionCompressedPlanCandidateCount: number
  buildingPatternExecutionLowConfidencePlanCandidateCount: number
  buildingPatternExecutionPlanCandidateMaxConfidenceScore: number
  recommendationScore: number
  recommendationLevel: PlanningRecommendationLevel
  confidence: PlanningConfidenceLevel
  reasons: PlanningBusinessReason[]
}

export interface MonthlyPlanGenerationSource {
  mode: 'baseline' | 'schedule' | 'mixed'
  baselineVersionId: string | null
  sourceVersionId: string | null
  sourceVersionLabel: string
  items: MonthlyPlanSeedItem[]
  baselineStatus: string | null
  autoSwitched: boolean
  generationSummary: MonthlyPlanGenerationSummary
}

export type MonthlyPlanManualOverrideField =
  | 'planned_start_date'
  | 'planned_end_date'
  | 'target_progress'
  | 'commitment_status'
  | 'notes'

export type MonthlyPlanManualOverrideFields = Partial<Record<MonthlyPlanManualOverrideField, boolean>>

export type MonthlyPlanGenerationMergedSource =
  | 'carryover'
  | 'task_schedule'
  | 'baseline'
  | 'milestone'
  | 'manual_override'

export type MonthlyPlanTargetProgressMethod =
  | 'manual_override'
  | 'quantity_weight'
  | 'category_experience'
  | 'duration_ratio'
  | 'linear_fallback'
  | 'actual_remaining'
  | 'capacity_rebalanced'
  | 'e2_capacity_min'

export type MonthlyPlanGenerationBlockingFactor =
  | 'predecessor_unfinished'
  | 'condition_unmet'
  | 'active_obstacle'
  | 'missing_date'
  | 'mapping_attention'

export interface MonthlyPlanGenerationMetadata {
  inclusion_score: number
  confidence: PlanningConfidenceLevel
  generation_reasons: string[]
  merged_sources: MonthlyPlanGenerationMergedSource[]
  source_priority: string[]
  target_progress_method: MonthlyPlanTargetProgressMethod
  blocking_factors: MonthlyPlanGenerationBlockingFactor[]
  snapshot_cutoff_at?: string | null
  algorithm_context?: Record<string, unknown>
}

export type MonthWindow = {
  start: Date
  end: Date
  year: number
  month: number
}

type MonthlyE2ForecastSummary = {
  remainingDurationDays: number | null
  forecastFinishDate: string | null
  forecastDelayDays: number | null
  confidenceLevel: string
}

function readAvailableProductionDuration(
  metric: { value?: unknown; unit?: unknown; availability?: unknown } | null | undefined,
) {
  if (metric?.availability !== 'available' || metric.unit !== 'construction_production_day') return null
  const value = Number(metric.value)
  return Number.isFinite(value) ? value : null
}

function toMonthlyE2ForecastSummary(forecast: Awaited<ReturnType<typeof forecastBatchTasks>>[number]): MonthlyE2ForecastSummary {
  const remainingDurationDays = readAvailableProductionDuration(forecast.remainingDuration)
  const forecastDelayDays = readAvailableProductionDuration(forecast.forecastDelay)
  return {
    remainingDurationDays,
    forecastFinishDate: remainingDurationDays === null ? null : forecast.forecastFinishDate,
    forecastDelayDays,
    confidenceLevel: normalizeText(forecast.confidenceLevel) || 'unknown',
  }
}

type MonthlyE2InclusionContext = {
  includedTaskIds: Set<string>
  forecastsByTaskId: Map<string, MonthlyE2ForecastSummary>
}

const MANUAL_OVERRIDE_FIELDS: MonthlyPlanManualOverrideField[] = [
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'commitment_status',
  'notes',
]

function toDate(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, 10) : null
}

function toProgress(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueStrings<T extends string>(values: Array<T | null | undefined>) {
  return [...new Set(values.filter((value): value is T => Boolean(value)))]
}

function uniqueStringArray(values: unknown[]) {
  return Array.from(new Set(values.flatMap((value) => (
    Array.isArray(value)
      ? value.map(normalizeText)
      : normalizeText(value).split(',')
  )).map((item) => item.trim()).filter(Boolean)))
}

function normalizeManualOverrideFields(value: unknown): MonthlyPlanManualOverrideFields {
  if (!isRecord(value)) return {}
  return MANUAL_OVERRIDE_FIELDS.reduce<MonthlyPlanManualOverrideFields>((fields, field) => {
    if (value[field] === true) fields[field] = true
    return fields
  }, {})
}

function hasManualOverrideFields(value: unknown) {
  const fields = normalizeManualOverrideFields(value)
  return MANUAL_OVERRIDE_FIELDS.some((field) => fields[field] === true)
}

function getStableCandidateKey(item: Pick<MonthlyPlanItem, 'source_task_id' | 'baseline_item_id' | 'carryover_from_item_id' | 'wbs_path' | 'title' | 'engineering_category_id'>) {
  if (item.source_task_id) return `task:${item.source_task_id}`
  if (item.baseline_item_id) return `baseline:${item.baseline_item_id}`
  if (item.carryover_from_item_id) return `carryover:${item.carryover_from_item_id}`
  if (item.wbs_path) return `wbs:${item.wbs_path}:${item.title ?? ''}`
  if (item.engineering_category_id) return `category:${item.engineering_category_id}:${item.title ?? ''}`
  return `title:${String(item.title ?? '').trim().toLocaleLowerCase()}`
}

function bySortOrder(left: { sort_order?: number | null; title?: string | null }, right: { sort_order?: number | null; title?: string | null }) {
  const leftOrder = Number(left.sort_order ?? 0)
  const rightOrder = Number(right.sort_order ?? 0)
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'zh-CN')
}

function getMonthWindow(month?: string | null): MonthWindow | null {
  const match = String(month ?? '').trim().match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 0)),
    year,
    month: monthIndex + 1,
  }
}

function getPreviousMonth(month: string) {
  const window = getMonthWindow(month)
  if (!window) return null
  const previous = new Date(Date.UTC(window.start.getUTCFullYear(), window.start.getUTCMonth() - 1, 1))
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
}

function parsePlanDate(value?: string | null) {
  const normalized = toDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function overlapsMonth(startText: string | null, endText: string | null, monthWindow: MonthWindow | null) {
  if (!monthWindow) return true
  const start = parsePlanDate(startText)
  const end = parsePlanDate(endText)
  if (!start && !end) return false
  const effectiveStart = start ?? end
  const effectiveEnd = end ?? start
  if (!effectiveStart || !effectiveEnd) return false
  return effectiveStart <= monthWindow.end && effectiveEnd >= monthWindow.start
}

function dateFallsInMonth(dateText: string | null | undefined, monthWindow: MonthWindow | null) {
  if (!monthWindow) return false
  const date = parsePlanDate(dateText ?? null)
  return Boolean(date && date >= monthWindow.start && date <= monthWindow.end)
}

function readMonthlyE2ForecastSummary(taskId: string | null | undefined, context?: MonthlyE2InclusionContext | null) {
  if (!taskId || !context) return null
  return context.forecastsByTaskId.get(taskId) ?? null
}

function isBaselineItemClosedForMonthlyInclusion(item: TaskBaselineItem) {
  const statusSnapshot = readRecord(item.status_snapshot)
  if (isClosedTask({ status: statusSnapshot.statusKey ?? statusSnapshot.rawStatus ?? statusSnapshot.status })) return true
  const taskFacts = readRecord(item.task_fact_snapshot)
  const progress = toProgress(typeof taskFacts.progress === 'number' ? taskFacts.progress : null)
  return progress >= 100
}

async function buildMonthlyE2InclusionContext(
  projectId: string,
  candidates: Array<{
    taskId?: string | null
    plannedStartDate?: string | null
    plannedEndDate?: string | null
    closed?: boolean
  }>,
  monthWindow: MonthWindow | null,
): Promise<MonthlyE2InclusionContext> {
  if (!monthWindow) {
    return { includedTaskIds: new Set(), forecastsByTaskId: new Map() }
  }

  const taskIds = uniqueStrings(candidates
    .filter((candidate) => !candidate.closed)
    .filter((candidate) => {
      const plannedEnd = parsePlanDate(candidate.plannedEndDate ?? null)
      if (!plannedEnd) return false
      return plannedEnd < monthWindow.start
    })
    .map((candidate) => normalizeText(candidate.taskId)))

  if (taskIds.length === 0) {
    return { includedTaskIds: new Set(), forecastsByTaskId: new Map() }
  }

  try {
    const forecasts = await forecastBatchTasks(taskIds, { projectId, triggerContext: 'monthly_plan_regeneration' })
    const forecastsByTaskId = new Map<string, MonthlyE2ForecastSummary>()
    const includedTaskIds = new Set<string>()
    for (const forecast of forecasts) {
      const taskId = normalizeText(forecast.taskId)
      if (!taskId) continue
      const summary = toMonthlyE2ForecastSummary(forecast)
      forecastsByTaskId.set(taskId, summary)
      if (dateFallsInMonth(summary.forecastFinishDate, monthWindow)) {
        includedTaskIds.add(taskId)
      }
    }
    return { includedTaskIds, forecastsByTaskId }
  } catch (error) {
    logger.warn('[monthlyPlanGenerationService] E2 inclusion forecast unavailable for monthly plan generation', { error })
    return { includedTaskIds: new Set(), forecastsByTaskId: new Map() }
  }
}

function inferMergedSources(item: Partial<MonthlyPlanItem>): MonthlyPlanGenerationMergedSource[] {
  const metadata = isRecord(item.generation_metadata) ? item.generation_metadata : {}
  const existingSources = Array.isArray(metadata.merged_sources)
    ? metadata.merged_sources.filter((source): source is MonthlyPlanGenerationMergedSource => typeof source === 'string')
    : []
  if (existingSources.length > 0) return uniqueStrings(existingSources)
  if (item.carryover_from_item_id || item.commitment_status === 'carried_over') return ['carryover']
  if (item.baseline_item_id) return ['baseline']
  if (item.source_task_id) return ['task_schedule']
  if (item.is_milestone) return ['milestone']
  return ['task_schedule']
}

function inferGenerationReasons(item: Partial<MonthlyPlanItem>, sources: MonthlyPlanGenerationMergedSource[]) {
  const reasons: string[] = []
  const metadata = isRecord(item.generation_metadata) ? item.generation_metadata : {}
  const algorithmContext = readRecord(metadata.algorithm_context)
  const plannedWindowOverlap = typeof algorithmContext.monthly_planned_window_overlap === 'boolean'
    ? algorithmContext.monthly_planned_window_overlap
    : null
  if (sources.includes('carryover')) reasons.push('carryover_unfinished')
  if (sources.includes('baseline') && plannedWindowOverlap !== false) reasons.push('baseline_overlap')
  if (sources.includes('task_schedule') && plannedWindowOverlap !== false) reasons.push('task_schedule_overlap')
  if (sources.includes('manual_override')) reasons.push('manual_override_preserved')
  if (item.is_critical) reasons.push('critical_path')
  if (item.is_milestone) reasons.push('monthly_milestone')
  if (!item.planned_start_date || !item.planned_end_date) reasons.push('missing_monthly_date')
  const currentProgress = toProgress(item.current_progress)
  const targetProgress = typeof item.target_progress === 'number' ? item.target_progress : null
  if (currentProgress > 0 && (targetProgress === null || currentProgress < targetProgress)) reasons.push('started_unfinished')
  return uniqueStrings(reasons)
}

export function calculateMonthlyPlanCandidateScore(item: Partial<MonthlyPlanItem>, monthWindow: MonthWindow | null = null) {
  const start = toDate(item.planned_start_date)
  const end = toDate(item.planned_end_date)
  let score = 0

  if (overlapsMonth(start, end, monthWindow)) score += 30
  if (item.carryover_from_item_id || item.commitment_status === 'carried_over') score += 35
  const currentProgress = toProgress(item.current_progress)
  if (currentProgress > 0 && currentProgress < 100) score += 30
  if (monthWindow) {
    const parsedStart = parsePlanDate(start)
    const parsedEnd = parsePlanDate(end)
    if (parsedEnd && parsedEnd >= monthWindow.start && parsedEnd <= monthWindow.end) score += 25
    if (parsedStart && parsedStart >= monthWindow.start && parsedStart <= monthWindow.end) score += 20
  } else if (start || end) {
    score += 20
  }
  if (item.is_critical) score += 15
  if (item.is_milestone) score += 20
  if (!start || !end) score -= 20
  if (['cancelled', 'canceled', 'closed', 'deleted', 'removed'].includes(String(item.commitment_status ?? '').trim().toLowerCase())) score -= 100

  return Math.max(-100, Math.min(100, score))
}

function confidenceFromScore(score: number): PlanningConfidenceLevel {
  if (score >= 70) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

export function buildGenerationMetadata(
  item: Partial<MonthlyPlanItem>,
  options: {
    inclusionScore?: number
    mergedSources?: MonthlyPlanGenerationMergedSource[]
    generationReasons?: string[]
    sourcePriority?: string[]
    targetProgressMethod?: MonthlyPlanTargetProgressMethod
    blockingFactors?: MonthlyPlanGenerationBlockingFactor[]
    snapshotCutoffAt?: string | null
    monthWindow?: MonthWindow | null
    algorithmContext?: Record<string, unknown> | null
  } = {},
): MonthlyPlanGenerationMetadata {
  const existing = isRecord(item.generation_metadata) ? item.generation_metadata : {}
  const mergedSources = uniqueStrings([
    ...(options.mergedSources ?? []),
    ...inferMergedSources(item),
  ])
  const generationReasons = uniqueStrings([
    ...(Array.isArray(existing.generation_reasons) ? existing.generation_reasons.filter((reason): reason is string => typeof reason === 'string') : []),
    ...inferGenerationReasons(item, mergedSources),
    ...(options.generationReasons ?? []),
  ])
  const blockingFactors = uniqueStrings([
    ...(Array.isArray(existing.blocking_factors) ? existing.blocking_factors.filter((factor): factor is MonthlyPlanGenerationBlockingFactor => typeof factor === 'string') : []),
    ...(!item.planned_start_date || !item.planned_end_date ? ['missing_date' as const] : []),
    ...(item.missing_process_in_baseline ? ['mapping_attention' as const] : []),
    ...(options.blockingFactors ?? []),
  ])
  const inclusionScore = Number.isFinite(Number(options.inclusionScore ?? existing.inclusion_score))
    ? Number(options.inclusionScore ?? existing.inclusion_score)
    : calculateMonthlyPlanCandidateScore(item, options.monthWindow ?? null)
  const sourcePriority = options.sourcePriority ?? [
    ...(['manual_override', 'task_schedule', 'carryover', 'baseline', 'milestone'] as MonthlyPlanGenerationMergedSource[])
      .filter((source) => mergedSources.includes(source)),
  ]

  return {
    inclusion_score: Math.max(-100, Math.min(100, Math.round(inclusionScore))),
    confidence: confidenceFromScore(inclusionScore),
    generation_reasons: generationReasons,
    merged_sources: mergedSources,
    source_priority: sourcePriority,
    target_progress_method: options.targetProgressMethod
      ?? (existing.target_progress_method as MonthlyPlanTargetProgressMethod | undefined)
      ?? 'duration_ratio',
    blocking_factors: blockingFactors,
    snapshot_cutoff_at: options.snapshotCutoffAt ?? (typeof existing.snapshot_cutoff_at === 'string' ? existing.snapshot_cutoff_at : null),
    algorithm_context: {
      ...readRecord(existing.algorithm_context),
      ...readRecord(options.algorithmContext),
    },
  }
}

function withGenerationMetadata(
  item: MonthlyPlanSeedItem,
  options: Parameters<typeof buildGenerationMetadata>[1] = {},
): MonthlyPlanSeedItem {
  const existingGenerationMetadata = isRecord(item.generation_metadata) ? item.generation_metadata : {}
  const itemForMetadata = Object.keys(readRecord(options.algorithmContext)).length > 0
    ? {
        ...item,
        generation_metadata: {
          ...existingGenerationMetadata,
          algorithm_context: {
            ...readRecord(existingGenerationMetadata.algorithm_context),
            ...readRecord(options.algorithmContext),
          },
        },
      }
    : item
  return {
    ...item,
    manual_override_fields: normalizeManualOverrideFields((item as MonthlyPlanItem).manual_override_fields),
    generation_metadata: buildGenerationMetadata(itemForMetadata, options),
  }
}

async function getMonthProductivity(projectId: string, monthWindow: MonthWindow | null) {
  if (!monthWindow) return 1
  const seedContext = { projectId }
  const climateRegion = await resolveProjectClimateRegion(projectId)
  const seasonalRegion = deriveV1474SeasonalProductivityRegion({
    thermalZone: climateRegion.thermalZone,
    regionCode: climateRegion.regionCode,
    climateTags: climateRegion.climateTags,
    location: climateRegion.location,
  })
  const seasonal = (await resolveV1474SeasonalProductivity(seasonalRegion, monthWindow.month, seedContext))?.productivity ?? 1
  const hasOfficialCalendar = await hasV1474WorkCalendarForYear(monthWindow.year, seedContext)
  const holiday = hasOfficialCalendar
    ? (await resolveV1474HolidayWindow({ year: monthWindow.year, month: monthWindow.month }, seedContext))?.productivity ?? 1
    : 1
  const baseProductivity = Math.max(0.35, Math.min(1.1, seasonal * holiday))
  const compensation = await buildProjectProductivityCompensation({
    projectId,
    baseProductivity,
    year: monthWindow.year,
    month: monthWindow.month,
    appliedFactorKeys: ['seasonal_productivity'],
  })
  return compensation.actionPolicy === 'auto_apply'
    ? compensation.adjustedProductivity
    : baseProductivity
}

export type MonthlyTargetProgressParams = {
  projectId: string
  plannedStart?: string | null
  plannedEnd?: string | null
  currentProgress?: number | null
  isMilestone?: boolean | null
  fallbackProgress?: number | null
  monthWindow: MonthWindow | null
}

export async function deriveMonthlyTargetProgress(params: MonthlyTargetProgressParams) {
  const currentProgress = toProgress(params.currentProgress)
  if (!params.monthWindow) {
    return params.fallbackProgress ?? (params.isMilestone ? 100 : currentProgress)
  }

  const start = parsePlanDate(params.plannedStart)
  const end = parsePlanDate(params.plannedEnd)
  if (!start && !end) return Math.max(currentProgress, params.fallbackProgress ?? 0)
  const effectiveStart = start ?? end
  const effectiveEnd = end ?? start
  if (!effectiveStart || !effectiveEnd) return Math.max(currentProgress, params.fallbackProgress ?? 0)

  if (params.isMilestone) {
    return effectiveEnd <= params.monthWindow.end && effectiveEnd >= params.monthWindow.start
      ? 100
      : Math.max(currentProgress, params.fallbackProgress ?? 0)
  }

  if (effectiveEnd <= params.monthWindow.end) return 100
  if (effectiveStart > params.monthWindow.end) return Math.max(currentProgress, params.fallbackProgress ?? 0)

  const totalDays = inclusiveDurationDays(effectiveStart, effectiveEnd) ?? 1
  const elapsedEnd = params.monthWindow.end < effectiveEnd ? params.monthWindow.end : effectiveEnd
  const elapsedDays = elapsedEnd < effectiveStart ? 0 : inclusiveDurationDays(effectiveStart, elapsedEnd) ?? 1
  const productivity = await getMonthProductivity(params.projectId, params.monthWindow)
  const plannedProgress = Math.round((elapsedDays / totalDays) * 100 * productivity)
  return Math.max(currentProgress, Math.min(100, plannedProgress))
}

async function mapBaselineItemsToMonthlySeedItems(
  projectId: string,
  items: TaskBaselineItem[],
  monthWindow: MonthWindow | null = null,
  snapshotCutoffAt: string | null = null,
  e2InclusionContext?: MonthlyE2InclusionContext | null,
): Promise<MonthlyPlanSeedItem[]> {
  const seedItems = await Promise.all([...items]
    .sort(bySortOrder)
    .filter((item) => {
      if (overlapsMonth(toDate(item.planned_start_date), toDate(item.planned_end_date), monthWindow)) return true
      const taskId = normalizeText(item.source_task_id)
      return Boolean(taskId && e2InclusionContext?.includedTaskIds.has(taskId))
    })
    .map(async (item, index) => ({
      baseline_item_id: item.id,
      carryover_from_item_id: null,
      source_task_id: item.source_task_id ?? null,
      title: item.title,
      planned_start_date: toDate(item.planned_start_date),
      planned_end_date: toDate(item.planned_end_date),
      target_progress: await deriveMonthlyTargetProgress({
        projectId,
        plannedStart: item.planned_start_date,
        plannedEnd: item.planned_end_date,
        currentProgress: null,
        isMilestone: item.is_milestone,
        fallbackProgress: item.target_progress ?? null,
        monthWindow,
      }),
      current_progress: 0,
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order : index,
      is_milestone: Boolean(item.is_milestone),
      is_critical: Boolean(item.is_critical),
      engineering_category_id: item.engineering_category_id ?? null,
      wbs_node_type: item.wbs_node_type ?? null,
      wbs_path: item.wbs_path ?? null,
      is_wbs_summary: item.is_wbs_summary ?? null,
      is_executable: item.is_executable ?? null,
      standard_work_code: item.standard_work_code ?? null,
      standard_work_name: item.standard_work_name ?? null,
      duration_calibration_source: item.duration_calibration_source ?? null,
      duration_provenance: item.duration_provenance ?? null,
      scope_snapshot: item.scope_snapshot ?? {},
      wbs_snapshot: item.wbs_snapshot ?? {},
      task_fact_snapshot: item.task_fact_snapshot ?? {},
      task_code_snapshot: item.task_code_snapshot ?? null,
      status_snapshot: item.status_snapshot ?? {},
      seed_versions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
      snapshot_source: item.snapshot_source ?? 'baseline_commitment_snapshot',
      snapshot_captured_at: item.snapshot_captured_at ?? snapshotCutoffAt,
      commitment_status: 'planned' as const,
      source_chip: 'baseline' as const,
      source_reason: 'Generated from the current project baseline.',
      notes: item.notes ?? null,
      generation_metadata: item.generation_metadata ?? {},
    })))
  return seedItems.map((item) => {
    const forecast = readMonthlyE2ForecastSummary(item.source_task_id, e2InclusionContext)
    const overlapsPlannedMonth = overlapsMonth(toDate(item.planned_start_date), toDate(item.planned_end_date), monthWindow)
    const includedByForecast = Boolean(
      item.source_task_id
      && e2InclusionContext?.includedTaskIds.has(item.source_task_id)
      && !overlapsPlannedMonth,
    )
    return withGenerationMetadata(item, {
      mergedSources: ['baseline'],
      generationReasons: [
        ...(overlapsPlannedMonth ? ['baseline_overlap'] : []),
        ...(includedByForecast ? ['e2_forecast_month_overlap'] : []),
      ],
      inclusionScore: includedByForecast ? Math.max(calculateMonthlyPlanCandidateScore(item, monthWindow), 65) : undefined,
      targetProgressMethod: 'duration_ratio',
      snapshotCutoffAt,
      monthWindow,
      algorithmContext: {
        ...readRecord(item.generation_metadata),
        monthly_planned_window_overlap: overlapsPlannedMonth,
        ...(includedByForecast ? {
          e2_forecast_inclusion: true,
          e2_remaining_forecast_days: forecast?.remainingDurationDays ?? null,
          e2_forecast_finish_date: forecast?.forecastFinishDate ?? null,
          e2_forecast_delay_days: forecast?.forecastDelayDays ?? null,
          e2_confidence_level: forecast?.confidenceLevel ?? null,
        } : {}),
      },
    })
  })
}

function isClosedTask(task: { status?: unknown }) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return ['cancelled', 'canceled', 'closed', 'deleted', 'removed'].includes(status)
}

async function mapTasksToMonthlySeedItems(
  projectId: string,
  tasks: Task[],
  criticalTaskIds: Set<string>,
  monthWindow: MonthWindow | null = null,
  snapshotCutoffAt: string | null = null,
  e2InclusionContext?: MonthlyE2InclusionContext | null,
): Promise<MonthlyPlanSeedItem[]> {
  const seedItems = await Promise.all([...tasks]
    .sort((left, right) => {
      const orderComparison = bySortOrder(left, right)
      if (orderComparison !== 0) return orderComparison
      return String(left.wbs_code ?? left.title ?? '').localeCompare(String(right.wbs_code ?? right.title ?? ''), 'zh-CN')
    })
    .filter((task) => {
      if (isClosedTask(task)) return false
      if (!monthWindow) return true
      if (overlapsMonth(toDate(task.planned_start_date ?? task.start_date), toDate(task.planned_end_date ?? task.end_date), monthWindow)) return true
      if (task.actual_start_date && !task.actual_end_date && toProgress(task.progress) < 100) return true
      return e2InclusionContext?.includedTaskIds.has(task.id) ?? false
    })
    .map(async (task, index) => ({
      baseline_item_id: null,
      carryover_from_item_id: null,
      source_task_id: task.id,
      title: task.title ?? `Monthly plan item ${index + 1}`,
      planned_start_date: toDate(task.planned_start_date ?? task.start_date),
      planned_end_date: toDate(task.planned_end_date ?? task.end_date),
      target_progress: await deriveMonthlyTargetProgress({
        projectId,
        plannedStart: task.planned_start_date ?? task.start_date,
        plannedEnd: task.planned_end_date ?? task.end_date,
        currentProgress: task.progress,
        isMilestone: task.is_milestone,
        fallbackProgress: task.progress,
        monthWindow,
      }),
      current_progress: toProgress(task.progress),
      sort_order: Number(task.sort_order ?? index),
      is_milestone: Boolean(task.is_milestone),
      is_critical: criticalTaskIds.has(task.id),
      engineering_category_id: task.engineering_category_id ?? null,
      wbs_node_type: task.wbs_node_type ?? null,
      wbs_path: task.wbs_path ?? null,
      is_wbs_summary: task.is_wbs_summary ?? null,
      is_executable: task.is_executable ?? null,
      standard_work_code: task.standard_work_code ?? null,
      standard_work_name: task.standard_work_name ?? null,
      duration_calibration_source: task.duration_calibration_source ?? null,
      duration_provenance: task.duration_provenance ?? null,
      scope_snapshot: {
        source: 'current_execution_fact',
        source_task_id: task.id,
        dimensions: {
          phase: task.phase_object_id ? { id: task.phase_object_id } : undefined,
          section: task.section_object_id ? { id: task.section_object_id } : undefined,
          building: task.building_object_id ? { id: task.building_object_id } : undefined,
          basement: task.basement_object_id ? { id: task.basement_object_id } : undefined,
          floor: task.floor_object_id ? { id: task.floor_object_id } : undefined,
          physical_zone: task.physical_zone_object_id ? { id: task.physical_zone_object_id } : undefined,
          functional_area: task.functional_area_object_id ? { id: task.functional_area_object_id } : undefined,
          main: task.engineering_object_id ? { id: task.engineering_object_id } : undefined,
        },
      },
      wbs_snapshot: {
        source: 'current_execution_fact',
        source_task_id: task.id,
        wbs_code: task.wbs_code ?? null,
        wbs_level: task.wbs_level ?? null,
        engineering_category_id: task.engineering_category_id ?? null,
        wbs_node_type: task.wbs_node_type ?? null,
        wbs_path: task.wbs_path ?? null,
        is_wbs_summary: task.is_wbs_summary ?? null,
        is_executable: task.is_executable ?? null,
        standard_work_code: task.standard_work_code ?? null,
        standard_work_name: task.standard_work_name ?? null,
        duration_calibration_source: task.duration_calibration_source ?? null,
        duration_provenance: task.duration_provenance ?? null,
      },
      task_fact_snapshot: {
        source: 'current_execution_fact',
        source_task_id: task.id,
        title: task.title ?? null,
        planned_start_date: task.planned_start_date ?? task.start_date ?? null,
        planned_end_date: task.planned_end_date ?? task.end_date ?? null,
        progress: task.progress ?? null,
        participant_unit_id: task.participant_unit_id ?? null,
      },
      task_code_snapshot: task.task_code ?? null,
      status_snapshot: {
        source: 'current_execution_fact',
        source_task_id: task.id,
        domainKey: 'task.lifecycle',
        statusKey: task.status ?? null,
        rawStatus: task.status ?? null,
      },
      seed_versions: buildPlanSnapshotSeedVersions(),
      snapshot_source: 'current_execution_fact',
      snapshot_captured_at: snapshotCutoffAt,
      commitment_status: task.status === 'completed' || task.progress === 100 ? 'completed' as const : 'planned' as const,
      source_chip: 'site' as const,
      source_reason: 'Generated from the current task list.',
      notes: task.description ?? null,
    })))
  return seedItems.map((item) => {
    const forecast = readMonthlyE2ForecastSummary(item.source_task_id, e2InclusionContext)
    const overlapsPlannedMonth = overlapsMonth(toDate(item.planned_start_date), toDate(item.planned_end_date), monthWindow)
    const includedByForecast = Boolean(item.source_task_id && e2InclusionContext?.includedTaskIds.has(item.source_task_id) && !overlapsPlannedMonth && toProgress(item.current_progress) === 0)
    return withGenerationMetadata(item, {
      mergedSources: ['task_schedule'],
      generationReasons: [
        ...(overlapsPlannedMonth ? ['task_schedule_overlap'] : []),
        ...(includedByForecast ? ['e2_forecast_month_overlap'] : []),
      ],
      inclusionScore: includedByForecast ? Math.max(calculateMonthlyPlanCandidateScore(item, monthWindow), 65) : undefined,
      targetProgressMethod: 'duration_ratio',
      snapshotCutoffAt,
      monthWindow,
      algorithmContext: {
        monthly_planned_window_overlap: overlapsPlannedMonth,
        ...(includedByForecast ? {
          e2_forecast_inclusion: true,
          e2_remaining_forecast_days: forecast?.remainingDurationDays ?? null,
          e2_forecast_finish_date: forecast?.forecastFinishDate ?? null,
          e2_forecast_delay_days: forecast?.forecastDelayDays ?? null,
          e2_confidence_level: forecast?.confidenceLevel ?? null,
        } : {}),
      },
    })
  })
}

function getNumericVersion(version?: number | string | null) {
  const value = Number(version)
  return Number.isFinite(value) ? value : null
}

function byBusinessVersionDesc(left: TaskBaseline, right: TaskBaseline) {
  const versionDiff = (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0)
  if (versionDiff !== 0) return versionDiff
  return String(right.confirmed_at ?? right.updated_at ?? '').localeCompare(String(left.confirmed_at ?? left.updated_at ?? ''))
}

async function getCurrentExecutionBaseline(projectId: string): Promise<TaskBaseline | null> {
  const { data, error } = await supabase
    .from('task_baselines')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw error
  return (
    ((data ?? []) as TaskBaseline[])
      .filter((baseline) => CURRENT_EXECUTION_BASELINE_STATUSES.has(String(baseline.status ?? '').trim()))
      .filter((baseline) => getNumericVersion(baseline.version) != null)
      .sort(byBusinessVersionDesc)[0] ?? null
  )
}

async function getBaselineItems(baselineId: string): Promise<TaskBaselineItem[]> {
  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

async function getProjectTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as Task[]
}

async function getLatestMonthlyPlanForMonth(projectId: string, month: string): Promise<MonthlyPlan | null> {
  const { data, error } = await supabase
    .from('monthly_plans')
    .select('*')
    .eq('project_id', projectId)
    .eq('month', month)
    .in('status', ['confirmed', 'closed'])
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data?.[0] as MonthlyPlan | undefined) ?? null
}

async function getLatestEditableMonthlyPlanForMonth(projectId: string, month: string): Promise<MonthlyPlan | null> {
  const { data, error } = await supabase
    .from('monthly_plans')
    .select('*')
    .eq('project_id', projectId)
    .eq('month', month)
    .in('status', ['draft', 'revising', 'pending_realign'])
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data?.[0] as MonthlyPlan | undefined) ?? null
}

async function getMonthlyPlanItems(planId: string): Promise<MonthlyPlanItem[]> {
  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('*')
    .eq('monthly_plan_version_id', planId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as MonthlyPlanItem[]
}

async function loadSameMonthManualOverrideItems(projectId: string, month: string): Promise<MonthlyPlanItem[]> {
  const editablePlan = await getLatestEditableMonthlyPlanForMonth(projectId, month)
  if (!editablePlan) return []
  return getMonthlyPlanItems(editablePlan.id)
}

function isCarryoverCandidate(item: MonthlyPlanItem) {
  if (item.commitment_status === 'cancelled') return false
  if (item.commitment_status === 'completed') return false
  const current = toProgress(item.current_progress)
  if (typeof item.target_progress !== 'number' || !Number.isFinite(item.target_progress)) {
    return current < 100
  }
  const target = toProgress(item.target_progress)
  return current < Math.max(1, target)
}

function resolveCarryoverTargetProgress(item: MonthlyPlanItem) {
  const current = toProgress(item.current_progress)
  if (typeof item.target_progress === 'number' && Number.isFinite(item.target_progress)) {
    return Math.max(current, toProgress(item.target_progress))
  }
  return current
}

function deriveLastMonthActualCompletionRate(item: MonthlyPlanSeedItem) {
  const target = typeof item.target_progress === 'number' && Number.isFinite(item.target_progress)
    ? toProgress(item.target_progress)
    : 100
  if (target <= 0) return 1
  return Number(Math.min(1, toProgress(item.current_progress) / target).toFixed(3))
}

function applyCarryoverAgingPenalty(
  item: MonthlyPlanSeedItem,
  options: {
    incrementCarryoverCount?: boolean
    unresolvedBlockerCount?: number
    responsibleResponseStatus?: string | null
  } = {},
): MonthlyPlanSeedItem {
  if (!item.carryover_from_item_id) return item
  const context = readRecord(item.generation_metadata?.algorithm_context)
  const previousCarryoverCount = Number(context.consecutive_carryover_count ?? context.consecutiveCarryoverCount ?? 0)
  const shouldIncrement = options.incrementCarryoverCount ?? true
  const consecutiveCarryoverCount = Math.max(1, Number.isFinite(previousCarryoverCount)
    ? previousCarryoverCount + (shouldIncrement ? 1 : 0)
    : 1)
  const contextCompletionRate = Number(context.last_month_actual_completion_rate ?? context.lastMonthActualCompletionRate)
  const lastMonthActualCompletionRate = Number.isFinite(contextCompletionRate)
    ? contextCompletionRate
    : deriveLastMonthActualCompletionRate(item)
  const contextBlockerCount = Number(context.unresolved_blocker_count ?? context.unresolvedBlockerCount)
  const unresolvedBlockerCount = Number.isFinite(Number(options.unresolvedBlockerCount))
    ? Number(options.unresolvedBlockerCount)
    : Number.isFinite(contextBlockerCount)
      ? contextBlockerCount
      : 0
  const responseStatus = normalizeLower(
    options.responsibleResponseStatus
      ?? context.responsible_response_status
      ?? context.responsibleResponseStatus,
  )
  const shouldDowngrade = consecutiveCarryoverCount >= 3
    && (
      (Number.isFinite(lastMonthActualCompletionRate) && lastMonthActualCompletionRate < 0.5)
      || unresolvedBlockerCount > 0
      || ['no_response', 'unresponsive', 'pending'].includes(responseStatus)
    )
  if (!shouldDowngrade) {
    return appendItemAlgorithmContext(item, {
      consecutive_carryover_count: consecutiveCarryoverCount,
      last_month_actual_completion_rate: Number.isFinite(lastMonthActualCompletionRate) ? lastMonthActualCompletionRate : null,
      unresolved_blocker_count: Number.isFinite(unresolvedBlockerCount) ? unresolvedBlockerCount : 0,
      carryover_aging_penalty_applied: false,
    }, { targetProgressMethod: item.generation_metadata?.target_progress_method })
  }
  return appendItemAlgorithmContext(item, {
    consecutive_carryover_count: consecutiveCarryoverCount,
    last_month_actual_completion_rate: Number.isFinite(lastMonthActualCompletionRate) ? lastMonthActualCompletionRate : null,
    responsible_response_status: responseStatus || null,
    unresolved_blocker_count: Number.isFinite(unresolvedBlockerCount) ? unresolvedBlockerCount : 0,
    carryover_aging_penalty_applied: true,
    monthly_readiness_override: 'conditional',
  }, {
    generationReasons: ['carryover_aging_penalty', 'management_attention_required'],
    targetProgressMethod: item.generation_metadata?.target_progress_method,
  })
}

async function loadCarryoverItems(projectId: string, month: string, snapshotCutoffAt: string | null = null): Promise<MonthlyPlanSeedItem[]> {
  const previousMonth = getPreviousMonth(month)
  if (!previousMonth) return []
  const previousPlan = await getLatestMonthlyPlanForMonth(projectId, previousMonth)
  if (!previousPlan) return []
  const previousItems = await getMonthlyPlanItems(previousPlan.id)
  return previousItems
    .filter(isCarryoverCandidate)
    .map((item, index) => applyCarryoverAgingPenalty({
      baseline_item_id: item.baseline_item_id ?? null,
      carryover_from_item_id: item.id,
      source_task_id: item.source_task_id ?? null,
      title: item.title,
      planned_start_date: toDate(item.planned_start_date),
      planned_end_date: toDate(item.planned_end_date),
      target_progress: resolveCarryoverTargetProgress(item),
      current_progress: item.current_progress ?? 0,
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order + 10_000 : 10_000 + index,
      is_milestone: Boolean(item.is_milestone),
      is_critical: Boolean(item.is_critical),
      engineering_category_id: item.engineering_category_id ?? null,
      wbs_node_type: item.wbs_node_type ?? null,
      wbs_path: item.wbs_path ?? null,
      is_wbs_summary: item.is_wbs_summary ?? null,
      is_executable: item.is_executable ?? null,
      standard_work_code: item.standard_work_code ?? null,
      standard_work_name: item.standard_work_name ?? null,
      duration_calibration_source: item.duration_calibration_source ?? null,
      duration_provenance: item.duration_provenance ?? null,
      scope_snapshot: item.scope_snapshot ?? {},
      wbs_snapshot: item.wbs_snapshot ?? {},
      task_fact_snapshot: item.task_fact_snapshot ?? {},
      task_code_snapshot: item.task_code_snapshot ?? null,
      status_snapshot: item.status_snapshot ?? {},
      seed_versions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
      snapshot_source: item.snapshot_source ?? 'monthly_commitment_snapshot',
      snapshot_captured_at: item.snapshot_captured_at ?? snapshotCutoffAt,
      commitment_status: 'carried_over',
      source_chip: 'rolling_in',
      source_reason: 'Unfinished commitment carried over from the previous month.',
      notes: item.notes ?? null,
      manual_override_fields: normalizeManualOverrideFields(item.manual_override_fields),
    generation_metadata: buildGenerationMetadata(item, {
      mergedSources: ['carryover'],
      generationReasons: ['carryover_unfinished'],
      targetProgressMethod: item.manual_override_fields?.target_progress
        ? 'manual_override'
        : typeof item.target_progress === 'number'
          ? 'linear_fallback'
          : 'actual_remaining',
      snapshotCutoffAt,
      algorithmContext: readRecord(item.generation_metadata?.algorithm_context),
    }),
  }))
}

function mergeCandidateItems(left: MonthlyPlanSeedItem, right: MonthlyPlanSeedItem): MonthlyPlanSeedItem {
  const mergedSources = uniqueStrings([...inferMergedSources(left), ...inferMergedSources(right)])
  const generationReasons = uniqueStrings([
    ...inferGenerationReasons(left, mergedSources),
    ...inferGenerationReasons(right, mergedSources),
    'candidate_sources_merged',
  ])
  return {
    ...left,
    carryover_from_item_id: left.carryover_from_item_id ?? right.carryover_from_item_id ?? null,
    baseline_item_id: left.baseline_item_id ?? right.baseline_item_id ?? null,
    source_task_id: left.source_task_id ?? right.source_task_id ?? null,
    current_progress: Math.max(toProgress(left.current_progress), toProgress(right.current_progress)),
    is_critical: Boolean(left.is_critical || right.is_critical),
    is_milestone: Boolean(left.is_milestone || right.is_milestone),
    source_chip: mergedSources.includes('carryover') ? 'rolling_in' : left.source_chip ?? right.source_chip ?? null,
    source_reason: uniqueStrings([left.source_reason ?? null, right.source_reason ?? null]).join(' / ') || null,
    manual_override_fields: normalizeManualOverrideFields(left.manual_override_fields ?? right.manual_override_fields),
    generation_metadata: buildGenerationMetadata(left, {
      inclusionScore: Math.max(
        calculateMonthlyPlanCandidateScore(left),
        calculateMonthlyPlanCandidateScore(right),
      ),
      mergedSources,
      generationReasons,
      targetProgressMethod: left.generation_metadata?.target_progress_method
        ?? right.generation_metadata?.target_progress_method
        ?? 'duration_ratio',
      snapshotCutoffAt: left.generation_metadata?.snapshot_cutoff_at
        ?? right.generation_metadata?.snapshot_cutoff_at
        ?? null,
      algorithmContext: {
        ...readAlgorithmContext(right),
        ...readAlgorithmContext(left),
      },
    }),
  }
}

export function mergeMonthlyPlanCandidates(...candidateGroups: MonthlyPlanSeedItem[][]) {
  const mergedByKey = new Map<string, MonthlyPlanSeedItem>()

  for (const item of candidateGroups.flat()) {
    const key = getStableCandidateKey(item)
    const existing = mergedByKey.get(key)
    mergedByKey.set(key, existing ? mergeCandidateItems(existing, item) : item)
  }

  return [...mergedByKey.values()].sort(bySortOrder)
}

function mergeCarryoverItems(sourceItems: MonthlyPlanSeedItem[], carryoverItems: MonthlyPlanSeedItem[]) {
  if (carryoverItems.length === 0) return sourceItems
  return mergeMonthlyPlanCandidates(sourceItems, carryoverItems)
}

function toMonthlySeedItemFromExisting(item: MonthlyPlanItem, sortOrder: number): MonthlyPlanSeedItem {
  return {
    baseline_item_id: item.baseline_item_id ?? null,
    carryover_from_item_id: item.carryover_from_item_id ?? null,
    source_task_id: item.source_task_id ?? null,
    title: item.title,
    planned_start_date: toDate(item.planned_start_date),
    planned_end_date: toDate(item.planned_end_date),
    target_progress: item.target_progress ?? null,
    current_progress: item.current_progress ?? 0,
    sort_order: Number.isFinite(item.sort_order) ? item.sort_order : sortOrder,
    is_milestone: Boolean(item.is_milestone),
    is_critical: Boolean(item.is_critical),
    engineering_category_id: item.engineering_category_id ?? null,
    wbs_node_type: item.wbs_node_type ?? null,
    wbs_path: item.wbs_path ?? null,
    is_wbs_summary: item.is_wbs_summary ?? null,
    is_executable: item.is_executable ?? null,
    standard_work_code: item.standard_work_code ?? null,
    standard_work_name: item.standard_work_name ?? null,
    duration_calibration_source: item.duration_calibration_source ?? null,
    duration_provenance: item.duration_provenance ?? null,
    scope_snapshot: item.scope_snapshot ?? {},
    wbs_snapshot: item.wbs_snapshot ?? {},
    task_fact_snapshot: item.task_fact_snapshot ?? {},
    task_code_snapshot: item.task_code_snapshot ?? null,
    status_snapshot: item.status_snapshot ?? {},
    seed_versions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
    snapshot_source: item.snapshot_source ?? 'monthly_commitment_snapshot',
    snapshot_captured_at: item.snapshot_captured_at ?? item.last_generated_at ?? null,
    commitment_status: item.commitment_status ?? 'planned',
    source_chip: item.source_chip ?? 'new',
    source_reason: item.source_reason ?? 'Preserved from the previous editable monthly plan.',
    notes: item.notes ?? null,
    manual_override_fields: normalizeManualOverrideFields(item.manual_override_fields),
    generation_metadata: buildGenerationMetadata(item, {
      mergedSources: ['manual_override'],
      generationReasons: ['manual_override_preserved'],
      targetProgressMethod: item.manual_override_fields?.target_progress ? 'manual_override' : 'linear_fallback',
      blockingFactors: ['mapping_attention'],
      snapshotCutoffAt: item.last_generated_at ?? null,
      algorithmContext: readRecord(item.generation_metadata?.algorithm_context),
    }),
  }
}

export function applyManualOverrideFields(
  generatedItems: MonthlyPlanSeedItem[],
  previousItems: MonthlyPlanItem[] = [],
) {
  if (previousItems.length === 0) {
    return generatedItems.map((item) => withGenerationMetadata(item))
  }

  const previousByKey = new Map<string, MonthlyPlanItem>()
  for (const item of previousItems) {
    previousByKey.set(getStableCandidateKey(item), item)
  }

  const generatedKeys = new Set<string>()
  const nextItems = generatedItems.map((item) => {
    const key = getStableCandidateKey(item)
    generatedKeys.add(key)
    const previous = previousByKey.get(key)
    if (!previous) return withGenerationMetadata(item)

    const manualFields = normalizeManualOverrideFields(previous.manual_override_fields)
    const nextItem: MonthlyPlanSeedItem = {
      ...item,
      manual_override_fields: manualFields,
    }

    for (const field of MANUAL_OVERRIDE_FIELDS) {
      if (manualFields[field] === true && previous[field] !== undefined) {
        ;(nextItem as Record<string, unknown>)[field] = previous[field] ?? null
      }
    }

    return withGenerationMetadata(nextItem, {
      mergedSources: hasManualOverrideFields(manualFields)
        ? uniqueStrings([...inferMergedSources(item), 'manual_override'])
        : inferMergedSources(item),
      generationReasons: hasManualOverrideFields(manualFields) ? ['manual_override_preserved'] : [],
      targetProgressMethod: manualFields.target_progress ? 'manual_override' : undefined,
      snapshotCutoffAt: item.generation_metadata?.snapshot_cutoff_at ?? previous.last_generated_at ?? null,
    })
  })

  const preservedManualItems = previousItems
    .filter((item) => !generatedKeys.has(getStableCandidateKey(item)))
    .filter((item) => hasManualOverrideFields(item.manual_override_fields))
    .map((item, index) => toMonthlySeedItemFromExisting(item, 20_000 + index))

  return [...nextItems, ...preservedManualItems].sort(bySortOrder)
}

async function getForecastMetrics(
  projectId: string,
  items: MonthlyPlanSeedItem[],
  precomputed?: MonthlyE2InclusionContext | null,
) {
  const taskIds = items
    .map((item) => item.source_task_id)
    .filter((id): id is string => Boolean(id))
    .slice(0, 100)
  const taskIdSet = new Set(taskIds)
  if (taskIds.length === 0) {
    return {
      forecastDelayedCount: 0,
      maxForecastDelayDays: 0,
      lowConfidenceReasonCount: 0,
      forecastsByTaskId: new Map<string, {
        remainingDurationDays: number | null
        forecastFinishDate: string | null
        forecastDelayDays: number | null
        confidenceLevel: string
      }>(),
    }
  }

  try {
    const missingTaskIds = taskIds.filter((taskId) => !(precomputed?.forecastsByTaskId.has(taskId) ?? false))
    const forecasts = missingTaskIds.length > 0
      ? await forecastBatchTasks(missingTaskIds, { projectId, triggerContext: 'monthly_plan_regeneration' })
      : []
    const forecastsByTaskId = new Map<string, MonthlyE2ForecastSummary>(precomputed?.forecastsByTaskId ?? [])
    for (const forecast of forecasts) {
      forecastsByTaskId.set(forecast.taskId, toMonthlyE2ForecastSummary(forecast))
    }
    return [...forecastsByTaskId.entries()].reduce((summary, [taskId, forecast]) => {
      if (!taskIdSet.has(taskId)) return summary
      const delay = forecast.forecastDelayDays
      if (delay !== null && delay > 0) {
        summary.forecastDelayedCount += 1
        summary.maxForecastDelayDays = Math.max(summary.maxForecastDelayDays, delay)
      }
      if (forecast.confidenceLevel === 'low') summary.lowConfidenceReasonCount += 1
      summary.forecastsByTaskId.set(taskId, {
        remainingDurationDays: forecast.remainingDurationDays,
        forecastFinishDate: forecast.forecastFinishDate,
        forecastDelayDays: delay,
        confidenceLevel: forecast.confidenceLevel,
      })
      return summary
    }, {
      forecastDelayedCount: 0,
      maxForecastDelayDays: 0,
      lowConfidenceReasonCount: 0,
      forecastsByTaskId: new Map<string, {
        remainingDurationDays: number | null
        forecastFinishDate: string | null
        forecastDelayDays: number | null
        confidenceLevel: string
      }>(),
    })
  } catch (error) {
    logger.warn('[monthlyPlanGenerationService] duration forecast unavailable for monthly plan generation', { error })
    return {
      forecastDelayedCount: 0,
      maxForecastDelayDays: 0,
      lowConfidenceReasonCount: 1,
      forecastsByTaskId: new Map<string, {
        remainingDurationDays: number | null
        forecastFinishDate: string | null
        forecastDelayDays: number | null
        confidenceLevel: string
      }>(),
    }
  }
}

type MonthlyForecastMetrics = Awaited<ReturnType<typeof getForecastMetrics>>

type MonthlyCapacityGovernance = {
  budgetDays: number
  demandDays: number
  allocatedDays: number
  overCommitted: boolean
  rebalancedItemCount: number
  poolCount: number
  overCommittedPoolCount: number
}

type MonthlyCapacityPriority = 'carryover' | 'critical' | 'near_critical' | 'new_work'

function monthCapacityBudgetDays(monthWindow: MonthWindow | null, constructionCalendar?: ConstructionCalendarContext | null) {
  if (!monthWindow) {
    return {
      workdays: 0,
      calendarShutdownDeductedDays: 0,
    }
  }
  let workdays = 0
  let calendarShutdownDeductedDays = 0
  const cursor = new Date(monthWindow.start)
  while (cursor <= monthWindow.end) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) {
      if (isConstructionProductionDay(cursor, constructionCalendar)) {
        workdays += 1
      } else {
        calendarShutdownDeductedDays += 1
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return {
    workdays,
    calendarShutdownDeductedDays,
  }
}

async function monthCapacityBudgetContext(projectId: string, monthWindow: MonthWindow | null) {
  const constructionCalendar = monthWindow
    ? await resolveConstructionCalendarContext({
        projectId,
        onError: (error) => logger.warn('[monthlyPlanGenerationService] failed to resolve construction calendar for monthly capacity', {
          projectId,
          month: `${monthWindow.year}-${String(monthWindow.month).padStart(2, '0')}`,
          error,
        }),
      })
    : null
  const { workdays, calendarShutdownDeductedDays } = monthCapacityBudgetDays(monthWindow, constructionCalendar)
  if (!monthWindow || workdays <= 0) {
    return {
      budgetDays: workdays,
      workdays,
      monthStartDate: monthWindow?.start.toISOString().slice(0, 10) ?? null,
      monthEndDate: monthWindow?.end.toISOString().slice(0, 10) ?? null,
      defaultCrewCapacityFactor: 1,
      calendarProductivityFactor: 1,
      effectiveCapacityFactor: 1,
      basis: 'estimated_workday_default_capacity_ceiling',
      realCapacityPolicy: 'default_capacity_not_real_field_capacity',
      calendarBasis: effectiveConstructionCalendarBasis(constructionCalendar),
      calendarSource: 'resolveConstructionCalendarContext',
      calendarShutdownDeductedDays,
    }
  }
  const calendarProductivityFactor = await getMonthProductivity(projectId, monthWindow)
  const effectiveCapacityFactor = Math.max(0.35, Math.min(1.1, calendarProductivityFactor))
  return {
    budgetDays: Math.max(0, Math.round(workdays * effectiveCapacityFactor)),
    workdays,
    monthStartDate: monthWindow.start.toISOString().slice(0, 10),
    monthEndDate: monthWindow.end.toISOString().slice(0, 10),
    defaultCrewCapacityFactor: 1,
    calendarProductivityFactor,
    effectiveCapacityFactor,
    basis: 'workday_default_capacity_with_calendar_factor_ceiling',
    realCapacityPolicy: 'default_capacity_not_real_field_capacity',
    calendarBasis: effectiveConstructionCalendarBasis(constructionCalendar),
    calendarSource: 'resolveConstructionCalendarContext',
    calendarShutdownDeductedDays,
  }
}

function readAlgorithmContext(item: MonthlyPlanSeedItem) {
  const metadata = readRecord(item.generation_metadata)
  return {
    ...metadata,
    ...readRecord(metadata.algorithm_context),
  }
}

function normalizeScopeValue(value: unknown) {
  return normalizeText(value) || 'global'
}

function readItemScopeKeys(item: MonthlyPlanSeedItem) {
  const context = readAlgorithmContext(item)
  const metadataScope = readRecord(context.scope_keys ?? context.scope_key)
  const scopeSnapshot = readRecord(item.scope_snapshot)
  const dimensions = readRecord(scopeSnapshot.dimensions)
  const building = readRecord(dimensions.building)
  const floor = readRecord(dimensions.floor)
  const zone = readRecord(dimensions.physical_zone ?? dimensions.functional_area ?? dimensions.zone)
  const workface = readRecord(dimensions.workface ?? dimensions.engineering_object)
  return {
    building: normalizeScopeValue(metadataScope.building ?? context.building_object_id ?? building.id ?? building.name),
    floor: normalizeScopeValue(metadataScope.floor ?? context.floor_object_id ?? floor.id ?? floor.name),
    zone: normalizeScopeValue(metadataScope.zone ?? context.physical_zone_object_id ?? context.functional_area_object_id ?? zone.id ?? zone.name),
    workface: normalizeScopeValue(metadataScope.workface ?? context.engineering_object_id ?? workface.id ?? workface.name),
  }
}

function readItemResourceClass(item: MonthlyPlanSeedItem) {
  const context = readAlgorithmContext(item)
  return normalizeText(context.resource_class ?? context.resourceClass ?? context.executionLane ?? item.engineering_category_id) || 'default_resource'
}

function readCanonicalRcpspCapacityPool(item: MonthlyPlanSeedItem) {
  const context = readAlgorithmContext(item)
  const key = normalizeText(
    context.rcpsp_capacity_pool_key
      ?? context.rcpspCapacityPoolKey
      ?? context.e3_rcpsp_capacity_pool_key
      ?? context.e3RcpspCapacityPoolKey,
  )
  if (!key) return null
  return {
    key,
    source: normalizeText(
      context.rcpsp_capacity_pool_key_source
        ?? context.rcpspCapacityPoolKeySource
        ?? context.e3_rcpsp_capacity_pool_key_source
        ?? context.e3RcpspCapacityPoolKeySource,
    ) || 'projectCriticalPathService.resource_constraint_scope',
    policy: 'canonical_e3_rcpsp_pool_key_preferred',
  }
}

function monthlyCapacityPoolDescriptor(item: MonthlyPlanSeedItem) {
  const canonical = readCanonicalRcpspCapacityPool(item)
  if (canonical) return canonical
  const scope = readItemScopeKeys(item)
  return {
    key: [
      readItemResourceClass(item),
      `building:${scope.building}`,
      `floor:${scope.floor}`,
      `zone:${scope.zone}`,
      `workface:${scope.workface}`,
    ].join('|'),
    source: 'monthly_plan_generation_metadata_scope_fallback',
    policy: 'fallback_rebuilt_from_monthly_metadata_scope',
  }
}

function readMonthlyPlanningReplayReadback(item: MonthlyPlanSeedItem): PlanningReplayCalibrationReadback | null {
  const context = readAlgorithmContext(item)
  const readback = readRecord(context.planning_replay_calibration_readback)
  return readback.status === 'ready'
    ? readback as unknown as PlanningReplayCalibrationReadback
    : null
}

async function buildMonthlyPlanningReplayReadbackContext(projectId: string, items: MonthlyPlanSeedItem[]) {
  const result = new Map<string, PlanningReplayCalibrationReadback>()
  await Promise.all(items.map(async (item) => {
    if (!normalizeText(item.standard_work_code) && !normalizeText(item.standard_work_name) && !normalizeText(item.engineering_category_id)) return
    try {
      const readback = await readPlanningReplayCalibrationReadback({
        projectId,
        standardWorkCode: item.standard_work_code,
        standardWorkName: item.standard_work_name,
        engineeringCategoryId: item.engineering_category_id,
      })
      if (readback.status === 'ready') result.set(getStableCandidateKey(item), readback)
    } catch (error) {
      logger.debug('[monthlyPlanGenerationService] planning replay calibration readback unavailable for monthly item', {
        projectId,
        itemKey: getStableCandidateKey(item),
        error,
      })
    }
  }))
  return result
}

function readinessPoolFor(item: MonthlyPlanSeedItem): 'committable' | 'conditional' | 'backup' {
  const context = readAlgorithmContext(item)
  const override = normalizeLower(context.monthly_readiness_override ?? context.monthlyReadinessOverride)
  if (override === 'committable' || override === 'conditional' || override === 'backup') return override
  const factors = item.generation_metadata?.blocking_factors ?? []
  const hasHardBlocker = Array.isArray(factors) && factors.some((factor) => ['condition_unmet', 'active_obstacle'].includes(String(factor)))
  if (hasHardBlocker) return 'backup'
  const hasPredecessorOrMapping = Array.isArray(factors) && factors.some((factor) => ['predecessor_unfinished', 'mapping_attention', 'missing_date'].includes(String(factor)))
  if (hasPredecessorOrMapping) return 'conditional'
  return 'committable'
}

function monthlyCapacityPoolKey(item: MonthlyPlanSeedItem) {
  return monthlyCapacityPoolDescriptor(item).key
}

function criticalFloatTier(floatDays: number | null | undefined): 'true_critical' | 'near_critical' | 'pseudo_critical' {
  const value = Number(floatDays)
  if (!Number.isFinite(value) || value <= 0) return 'true_critical'
  if (value <= 3) return 'near_critical'
  return 'pseudo_critical'
}

async function buildFreshFloatContext(projectId: string, items: MonthlyPlanSeedItem[]) {
  if (!items.some((item) => item.source_task_id)) return new Map<string, Record<string, unknown>>()
  try {
    const snapshot = await getProjectCriticalPathSnapshot(projectId)
    const snapshotStatus = normalizeText(snapshot.calculationStatus) || 'unknown'
    if (snapshotStatus !== 'fresh') {
      return new Map(items.map((item) => [getStableCandidateKey(item), {
        fresh_float_days: null,
        fresh_float_authority_checked: true,
        fresh_float_snapshot_source: 'projectCriticalPathService.getProjectCriticalPathSnapshot',
        fresh_float_snapshot_status: snapshotStatus,
      }]))
    }
    const scheduleRows = Array.isArray((snapshot as any).networkSchedule) && (snapshot as any).networkSchedule.length > 0
      ? (snapshot as any).networkSchedule
      : (snapshot.tasks ?? [])
    const byTaskId = new Map<string, any>(
      scheduleRows.map((task: any) => [normalizeText(task.taskId), task]),
    )
    return new Map(items.map((item) => {
      const taskId = normalizeText(item.source_task_id)
      const task = taskId ? byTaskId.get(taskId) : null
      const floatDays = readAvailableProductionDuration(task?.float)
      return [getStableCandidateKey(item), {
        fresh_float_days: floatDays,
        fresh_float_authority_checked: true,
        fresh_float_snapshot_source: 'projectCriticalPathService.getProjectCriticalPathSnapshot',
        fresh_float_snapshot_status: snapshotStatus,
        ...(floatDays === null ? {} : { critical_float_tier: criticalFloatTier(floatDays) }),
      }]
    }))
  } catch (error) {
    logger.debug('[monthlyPlanGenerationService] fresh critical-path snapshot unavailable for monthly plan generation', { projectId, error })
    return new Map(items.map((item) => [getStableCandidateKey(item), {
      fresh_float_days: null,
      fresh_float_authority_checked: true,
      fresh_float_snapshot_source: 'projectCriticalPathService.getProjectCriticalPathSnapshot',
      fresh_float_snapshot_status: 'unavailable',
    }]))
  }
}

function estimateMonthlyCapacityDemand(item: MonthlyPlanSeedItem, forecastMetrics: MonthlyForecastMetrics) {
  const forecast = item.source_task_id ? forecastMetrics.forecastsByTaskId.get(item.source_task_id) : null
  const forecastDays = Number(forecast?.remainingDurationDays ?? 0)
  if (Number.isFinite(forecastDays) && forecastDays > 0) return Math.round(forecastDays)
  const current = toProgress(item.current_progress)
  const target = typeof item.target_progress === 'number' ? toProgress(item.target_progress) : current
  return Math.max(0, Math.round(target - current))
}

function monthlyCapacityPriority(item: MonthlyPlanSeedItem): MonthlyCapacityPriority {
  if (item.carryover_from_item_id || item.commitment_status === 'carried_over') return 'carryover'
  const context = readAlgorithmContext(item)
  const floatTier = context.critical_float_tier
  if (floatTier === 'true_critical') return 'critical'
  if (floatTier === 'near_critical') return 'near_critical'
  if (floatTier === 'pseudo_critical') return 'new_work'
  if (context.fresh_float_authority_checked === true) return 'new_work'
  if (item.is_critical) return 'critical'
  return 'new_work'
}

function monthlyReadinessTargetFactor(readiness: ReturnType<typeof readinessPoolFor>) {
  if (readiness === 'backup') return 0.25
  if (readiness === 'conditional') return 0.6
  return 1
}

function workdaysBetweenInclusive(start: Date, end: Date) {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  if (stop < cursor) return 0
  let count = 0
  while (cursor <= stop) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) count += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}

function calculateE2CompletableTarget(params: {
  current: number
  target: number
  plannedDelta: number
  forecast?: {
    remainingDurationDays: number | null
    forecastFinishDate: string | null
  } | null
  budgetDays: number
  monthStartDate?: string | null
  monthEndDate?: string | null
}) {
  const e2Days = Number(params.forecast?.remainingDurationDays ?? 0)
  const byRemainingDays = e2Days > 0
    ? Math.max(params.current, Math.min(params.target, Math.round(params.current + (params.plannedDelta * Math.min(e2Days, params.budgetDays) / e2Days))))
    : params.target

  const forecastFinish = parsePlanDate(params.forecast?.forecastFinishDate ?? null)
  const monthStart = parsePlanDate(params.monthStartDate ?? null)
  const monthEnd = parsePlanDate(params.monthEndDate ?? null)
  if (!forecastFinish || !monthStart || !monthEnd || forecastFinish <= monthEnd) {
    return byRemainingDays
  }

  const monthWorkdays = workdaysBetweenInclusive(monthStart, monthEnd)
  const forecastWindowWorkdays = workdaysBetweenInclusive(monthStart, forecastFinish)
  if (forecastWindowWorkdays <= 0) return byRemainingDays
  const finishWindowTarget = Math.max(
    params.current,
    Math.min(params.target, Math.round(params.current + (params.plannedDelta * Math.min(1, monthWorkdays / forecastWindowWorkdays)))),
  )
  return Math.min(byRemainingDays, finishWindowTarget)
}

function appendItemAlgorithmContext(
  item: MonthlyPlanSeedItem,
  algorithmContext: Record<string, unknown>,
  options: {
    generationReasons?: string[]
    targetProgressMethod?: MonthlyPlanTargetProgressMethod
  } = {},
) {
  return {
    ...item,
    generation_metadata: buildGenerationMetadata(item, {
      generationReasons: options.generationReasons,
      targetProgressMethod: options.targetProgressMethod ?? item.generation_metadata?.target_progress_method,
      algorithmContext: {
        ...readRecord(item.generation_metadata?.algorithm_context),
        ...algorithmContext,
      },
    }),
  }
}

function applyMonthlyReadinessAndCriticalityContext(
  items: MonthlyPlanSeedItem[],
  freshFloatByKey: Map<string, Record<string, unknown>>,
  planningReplayReadbackByKey: Map<string, PlanningReplayCalibrationReadback> = new Map(),
) {
  return items.map((item) => {
    const readiness = readinessPoolFor(item)
    const pool = monthlyCapacityPoolDescriptor(item)
    const freshFloat = freshFloatByKey.get(getStableCandidateKey(item)) ?? {}
    const planningReplayReadback = planningReplayReadbackByKey.get(getStableCandidateKey(item)) ?? null
    return appendItemAlgorithmContext(item, {
      monthly_readiness_pool: readiness,
      monthly_capacity_pool_key: pool.key,
      monthly_capacity_pool_key_source: pool.source,
      monthly_capacity_pool_key_policy: pool.policy,
      ...freshFloat,
      ...(planningReplayReadback ? { planning_replay_calibration_readback: planningReplayReadback } : {}),
    }, {
      generationReasons: [
        readiness === 'committable' ? 'readiness_committable' : `readiness_${readiness}`,
        ...(planningReplayReadback ? ['planning_replay_calibration_readback'] : []),
      ],
      targetProgressMethod: item.generation_metadata?.target_progress_method,
    })
  })
}

function applyMonthlyCapacityGovernance(
  items: MonthlyPlanSeedItem[],
  capacityBudget: Awaited<ReturnType<typeof monthCapacityBudgetContext>>,
  forecastMetrics: MonthlyForecastMetrics,
): { items: MonthlyPlanSeedItem[]; capacity: MonthlyCapacityGovernance } {
  const minCalibrationFactor = items.reduce((factor, item) => {
    const readback = readMonthlyPlanningReplayReadback(item)
    const candidateFactor = Number(readback?.capacityBudgetFactor)
    return Number.isFinite(candidateFactor) && candidateFactor > 0
      ? Math.min(factor, Math.max(0.85, Math.min(1.1, candidateFactor)))
      : factor
  }, 1)
  const rawBudgetDays = capacityBudget.budgetDays
  const budgetDays = Math.max(0, Math.floor(rawBudgetDays * minCalibrationFactor))
  const demandByKey = new Map<string, number>()
  const demandByPool = new Map<string, number>()
  let demandDays = 0
  for (const item of items) {
    const demand = estimateMonthlyCapacityDemand(item, forecastMetrics)
    const poolKey = monthlyCapacityPoolKey(item)
    demandByKey.set(getStableCandidateKey(item), demand)
    demandByPool.set(poolKey, (demandByPool.get(poolKey) ?? 0) + demand)
    demandDays += demand
  }

  if (budgetDays <= 0 || items.length === 0) {
    return {
      items: items.map((item) => appendItemAlgorithmContext(item, {
        monthly_capacity_pool_key: monthlyCapacityPoolDescriptor(item).key,
        monthly_capacity_pool_key_source: monthlyCapacityPoolDescriptor(item).source,
        monthly_capacity_pool_key_policy: monthlyCapacityPoolDescriptor(item).policy,
        monthly_capacity_budget_days: budgetDays,
        monthly_capacity_demand_days: demandByKey.get(getStableCandidateKey(item)) ?? 0,
        monthly_capacity_allocated_days: demandByKey.get(getStableCandidateKey(item)) ?? 0,
        monthly_capacity_status: 'not_evaluated',
        monthly_capacity_priority: monthlyCapacityPriority(item),
        monthly_capacity_workdays: capacityBudget.workdays,
        monthly_capacity_default_crew_factor: capacityBudget.defaultCrewCapacityFactor,
        monthly_capacity_calendar_factor: capacityBudget.calendarProductivityFactor,
        monthly_capacity_effective_factor: capacityBudget.effectiveCapacityFactor,
        monthly_capacity_calendar_basis: capacityBudget.calendarBasis,
        monthly_capacity_calendar_source: capacityBudget.calendarSource,
        monthly_capacity_calendar_shutdown_deducted_days: capacityBudget.calendarShutdownDeductedDays,
      })),
      capacity: {
        budgetDays,
        demandDays,
        allocatedDays: demandDays,
        overCommitted: false,
        rebalancedItemCount: 0,
        poolCount: demandByPool.size,
        overCommittedPoolCount: 0,
      },
    }
  }

  const remainingBudgetByPool = new Map<string, number>()
  const overCommittedPoolCount = [...demandByPool.values()].filter((demand) => demand > budgetDays).length
  let remainingGlobalBudget = budgetDays
  let allocatedDays = 0
  let rebalancedItemCount = 0
  const sortedItems = [...items].sort((left, right) => {
    const readinessPriority = { committable: 0, conditional: 1, backup: 2 }
    const leftReadiness = readinessPriority[readinessPoolFor(left)]
    const rightReadiness = readinessPriority[readinessPoolFor(right)]
    if (leftReadiness !== rightReadiness) return leftReadiness - rightReadiness
    const capacityPriority: Record<MonthlyCapacityPriority, number> = { carryover: 0, critical: 1, near_critical: 2, new_work: 3 }
    const leftPriority = capacityPriority[monthlyCapacityPriority(left)]
    const rightPriority = capacityPriority[monthlyCapacityPriority(right)]
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return bySortOrder(left, right)
  })
  const allocations = new Map<string, { allocated: number; status: 'within_budget' | 'rebalanced' }>()

  for (const item of sortedItems) {
    const key = getStableCandidateKey(item)
    const demand = demandByKey.get(key) ?? 0
    const poolKey = monthlyCapacityPoolKey(item)
    const remainingPoolBudget = remainingBudgetByPool.has(poolKey)
      ? remainingBudgetByPool.get(poolKey) ?? 0
      : budgetDays
    const allocated = Math.max(0, Math.min(demand, remainingPoolBudget, remainingGlobalBudget))
    remainingBudgetByPool.set(poolKey, remainingPoolBudget - allocated)
    remainingGlobalBudget = Math.max(0, remainingGlobalBudget - allocated)
    allocatedDays += allocated
    const status = allocated < demand ? 'rebalanced' : 'within_budget'
    if (status === 'rebalanced') rebalancedItemCount += 1
    allocations.set(key, { allocated, status })
  }

  const governedItems = items.map((item) => {
    const key = getStableCandidateKey(item)
    const demand = demandByKey.get(key) ?? 0
    const allocation = allocations.get(key) ?? { allocated: demand, status: 'within_budget' as const }
    const forecast = item.source_task_id ? forecastMetrics.forecastsByTaskId.get(item.source_task_id) : null
    const current = toProgress(item.current_progress)
    const target = typeof item.target_progress === 'number' ? toProgress(item.target_progress) : current
    const plannedDelta = Math.max(0, target - current)
    const readiness = readinessPoolFor(item)
    const pool = monthlyCapacityPoolDescriptor(item)
    const readinessTargetFactor = monthlyReadinessTargetFactor(readiness)
    const planningReplayReadback = readMonthlyPlanningReplayReadback(item)
    const e2TargetDiscountFactor = Number.isFinite(Number(planningReplayReadback?.e2TargetDiscountFactor))
      ? Math.max(0.75, Math.min(1, Number(planningReplayReadback?.e2TargetDiscountFactor)))
      : 1
    const e2Target = calculateE2CompletableTarget({
      current,
      target,
      plannedDelta,
      forecast,
      budgetDays,
      monthStartDate: capacityBudget.monthStartDate,
      monthEndDate: capacityBudget.monthEndDate,
    })
    const calibratedE2Target = Math.max(
      current,
      Math.min(target, Math.round(current + ((e2Target - current) * e2TargetDiscountFactor))),
    )
    const capacityTarget = demand > 0
      ? Math.max(current, Math.min(target, Math.round(current + (plannedDelta * allocation.allocated / demand))))
      : target
    const readinessTarget = Math.max(current, Math.min(target, Math.round(current + (plannedDelta * readinessTargetFactor))))
    const nextTarget = Math.min(target, calibratedE2Target, capacityTarget, readinessTarget)
    const method: MonthlyPlanTargetProgressMethod = nextTarget < target ? 'e2_capacity_min' : item.generation_metadata?.target_progress_method ?? 'duration_ratio'
    return appendItemAlgorithmContext({
      ...item,
      target_progress: nextTarget,
    }, {
      e2_remaining_forecast_days: forecast?.remainingDurationDays ?? null,
      e2_forecast_finish_date: forecast?.forecastFinishDate ?? null,
      e2_forecast_delay_days: forecast?.forecastDelayDays ?? null,
      e2_confidence_level: forecast?.confidenceLevel ?? null,
      monthly_capacity_budget_days: budgetDays,
      monthly_capacity_raw_budget_days: rawBudgetDays,
      monthly_capacity_calibration_factor: minCalibrationFactor,
      monthly_capacity_budget_basis: capacityBudget.basis,
      monthly_capacity_real_capacity_policy: capacityBudget.realCapacityPolicy,
      monthly_capacity_workdays: capacityBudget.workdays,
      monthly_capacity_default_crew_factor: capacityBudget.defaultCrewCapacityFactor,
      monthly_capacity_calendar_factor: capacityBudget.calendarProductivityFactor,
      monthly_capacity_effective_factor: capacityBudget.effectiveCapacityFactor,
      monthly_capacity_calendar_basis: capacityBudget.calendarBasis,
      monthly_capacity_calendar_source: capacityBudget.calendarSource,
      monthly_capacity_calendar_shutdown_deducted_days: capacityBudget.calendarShutdownDeductedDays,
      monthly_capacity_demand_days: demand,
      monthly_capacity_allocated_days: allocation.allocated,
      monthly_capacity_status: allocation.status,
      monthly_capacity_priority: monthlyCapacityPriority(item),
      monthly_capacity_pool_key: pool.key,
      monthly_capacity_pool_key_source: pool.source,
      monthly_capacity_pool_key_policy: pool.policy,
      monthly_readiness_pool: readiness,
      monthly_readiness_target_factor: readinessTargetFactor,
      target_progress_formula: 'min(linear_target,e2_completable_target,capacity_allocatable_target)',
      target_progress_linear_target: target,
      target_progress_e2_completable_target: calibratedE2Target,
      target_progress_e2_raw_completable_target: e2Target,
      target_progress_e2_discount_factor: e2TargetDiscountFactor,
      target_progress_capacity_allocatable_target: capacityTarget,
      target_progress_readiness_target: readinessTarget,
      planning_replay_calibration_status: planningReplayReadback?.status ?? 'unavailable',
      planning_replay_calibration_write_policy: planningReplayReadback?.writePolicy ?? null,
      planning_replay_calibration_evidence_refs: planningReplayReadback?.evidenceRefs ?? [],
    }, {
      generationReasons: [
        allocation.status === 'rebalanced' ? 'monthly_capacity_rebalanced' : 'monthly_capacity_checked',
        ...(readinessTarget < target ? ['monthly_readiness_discounted'] : []),
        ...(planningReplayReadback ? ['planning_replay_calibration_readback'] : []),
      ],
      targetProgressMethod: method,
    })
  })

  return {
    items: governedItems,
    capacity: {
      budgetDays,
      demandDays,
      allocatedDays,
      overCommitted: overCommittedPoolCount > 0 || demandDays > budgetDays,
      rebalancedItemCount,
      poolCount: demandByPool.size,
      overCommittedPoolCount,
    },
  }
}

type MonthlyBuildingPatternSeedMetrics = {
  buildingPatternSeedMatchCount: number
  buildingPatternHighConfidenceCount: number
  buildingPatternLowConfidenceCount: number
  buildingPatternConfidenceScoreAvg: number
  buildingPatternControlChainCount: number
  buildingPatternDurationCurveProfileCount: number
  buildingPatternPriorityAvg: number
  buildingPatternReasonsByItemKey: Map<string, string[]>
  buildingPatternMetadataByItemKey: Map<string, Record<string, unknown>>
}

function getMonthlyPatternItemKey(item: MonthlyPlanSeedItem) {
  return getStableCandidateKey(item)
}

function extractScopeDimensions(scopeSnapshot: Record<string, unknown>) {
  const dimensions = readRecord(scopeSnapshot.dimensions)
  const result: string[] = []
  for (const [dimension, value] of Object.entries(dimensions)) {
    if (Object.keys(readRecord(value)).length > 0) result.push(dimension)
  }
  return Array.from(new Set(result))
}

function compactMonthlyPatternText(item: MonthlyPlanSeedItem) {
  return [
    item.title,
    item.standard_work_name,
    item.standard_work_code,
    item.wbs_node_type,
    item.wbs_path,
    item.engineering_category_id,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildMonthlyPatternSeedContext(projectId: string, item: MonthlyPlanSeedItem): AlgorithmSeedResolveContext {
  const metadata = readRecord(item.generation_metadata)
  const scopeSnapshot = readRecord(item.scope_snapshot)
  const wbsSnapshot = readRecord(item.wbs_snapshot)
  const taskFactSnapshot = readRecord(item.task_fact_snapshot)
  const factContext = buildAlgorithmFactContext({
    phase: 'monthly_plan',
    projectGenerationFacts: readProjectGenerationFactsSnapshot(metadata, wbsSnapshot, taskFactSnapshot),
    runtimeExecutionFacts: {
      progressCompletionRatio: item.current_progress == null ? undefined : Number(item.current_progress) / 100,
      evidenceCodes: ['monthly_plan_item_fact_snapshot'],
    },
  })
  const projectGenerationFacts = factContext.projectGenerationFacts
  const featureProfile = {
    ...readMetadataRecord(metadata, ['featureProfile', 'feature_profile']),
    ...readMetadataRecord(wbsSnapshot, ['featureProfile', 'feature_profile']),
    ...readMetadataRecord(taskFactSnapshot, ['featureProfile', 'feature_profile']),
  }
  const buildingPatternObservation = {
    ...readMetadataRecord(metadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readMetadataRecord(wbsSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readMetadataRecord(taskFactSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
  }
  const methodVariantCodes = [
    ...readMetadataTextArray(projectGenerationFacts, ['methodVariantCodes']),
    ...readMetadataTextArray(metadata, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readMetadataTextArray(featureProfile, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readMetadataTextArray(buildingPatternObservation, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
  ]
  const elementVariantCodes = [
    ...readMetadataTextArray(metadata, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readMetadataTextArray(featureProfile, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readMetadataTextArray(buildingPatternObservation, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
  ]
  const scopeDimensions = extractScopeDimensions(scopeSnapshot)
  const text = compactMonthlyPatternText(item).toLowerCase()
  const standardCode = normalizeText(item.standard_work_code).toLowerCase()
  const inferredScope = buildConstructionSeedScopeContext(item as unknown as Record<string, unknown>, {
    scopeDimensions,
  })
  const mergedScopeDimensions = uniqueStringArray([scopeDimensions, inferredScope.scopeDimensions ?? []])
  const hasFloorScope = scopeDimensions.includes('floor')
  const hasBuildingScope = scopeDimensions.includes('building')
  const hasPhysicalZoneScope = scopeDimensions.includes('physical_zone')
  const hasFunctionalAreaScope = scopeDimensions.includes('functional_area')
  const hasZoneScope = hasPhysicalZoneScope || hasFunctionalAreaScope
  const hasSectionScope = scopeDimensions.includes('section')
  const hasSystemScope = mergedScopeDimensions.includes('system')
  const hasWorkfaceScope = mergedScopeDimensions.includes('workface')
  const phaseWindow = readMetadataText(metadata, ['phaseWindow', 'phase_window'])
    ?? readMetadataText(buildingPatternObservation, ['phaseWindow', 'phase_window'])
    ?? inferredScope.phaseWindow
    ?? (hasSectionScope || standardCode.startsWith('01') || text.includes('foundation') || text.includes('pile') || text.includes('excavation') ? 'foundation' : null)
    ?? (hasSystemScope || /^0[5-8]/.test(standardCode) || text.includes('mep') || text.includes('commission') ? 'mep' : null)
    ?? (hasZoneScope && (standardCode.startsWith('out') || standardCode.startsWith('11') || text.includes('outdoor') || text.includes('landscape')) ? 'outdoor' : null)
    ?? (hasFloorScope && (standardCode.startsWith('03') || text.includes('decoration')) ? 'decoration' : null)
    ?? (hasFloorScope ? 'superstructure' : null)
  const rhythmDrivers = uniqueStringArray([[
    hasFloorScope ? 'floor_count' : null,
    hasBuildingScope ? 'building_count' : null,
    hasZoneScope ? 'zone_count' : null,
    hasSectionScope ? 'section_count' : null,
    hasSystemScope ? 'system_count' : null,
    hasWorkfaceScope ? 'workface_count' : null,
    methodVariantCodes.length > 0 ? 'method_variant' : null,
    item.is_milestone ? 'milestone_gate' : null,
  ].filter((value): value is string => Boolean(value)), inferredScope.rhythmDrivers ?? []])

  return {
    projectId,
    standardWorkCode: item.standard_work_code ?? null,
    standardWorkCodes: item.standard_work_code ? [item.standard_work_code] : [],
    methodVariantCodes: Array.from(new Set(methodVariantCodes)),
    elementVariantCodes: Array.from(new Set(elementVariantCodes)),
    projectTypeCode: readMetadataText(projectGenerationFacts, ['businessType'])
      ?? readMetadataText(metadata, ['projectTypeCode', 'project_type_code'])
      ?? readMetadataText(featureProfile, ['projectTypeCode', 'project_type_code'])
      ?? readMetadataText(buildingPatternObservation, ['projectTypeCode', 'project_type_code']),
    structureTypeCode: readMetadataText(projectGenerationFacts, ['structureTypeCode'])
      ?? readMetadataText(metadata, ['structureTypeCode', 'structure_type_code'])
      ?? readMetadataText(featureProfile, ['structureTypeCode', 'structure_type_code'])
      ?? readMetadataText(buildingPatternObservation, ['structureTypeCode', 'structure_type_code']),
    scopeDimensions: mergedScopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType: readMetadataText(metadata, ['primaryWorkfaceType', 'primary_workface_type'])
      ?? readMetadataText(buildingPatternObservation, ['primaryWorkfaceType', 'primary_workface_type'])
      ?? inferredScope.primaryWorkfaceType
      ?? (phaseWindow === 'foundation' ? 'foundation_section' : null)
      ?? (phaseWindow === 'mep' ? 'mep_system_zone' : null)
      ?? (phaseWindow === 'outdoor' ? 'outdoor_zone' : null)
      ?? (phaseWindow === 'decoration' ? 'decoration_room_zone' : null)
      ?? (hasFloorScope ? 'standard_floor' : null)
      ?? (hasBuildingScope ? 'building_zone' : null),
    phaseWindow,
    expansionStrategy: readMetadataText(metadata, ['expansionStrategy', 'expansion_strategy'])
      ?? readMetadataText(buildingPatternObservation, ['expansionStrategy', 'expansion_strategy'])
      ?? inferredScope.expansionStrategy
      ?? (hasSectionScope ? 'section_ordered' : null)
      ?? (hasSystemScope ? 'system_zone' : null)
      ?? (hasFloorScope ? 'floor_ordered' : null)
      ?? (hasZoneScope ? 'zone_ordered' : null)
      ?? (hasBuildingScope ? 'building' : null),
    algorithmFactContext: summarizeAlgorithmFactContext(factContext),
  }
}

async function getMonthlyBuildingPatternSeedMetrics(projectId: string, items: MonthlyPlanSeedItem[]): Promise<MonthlyBuildingPatternSeedMetrics> {
  const metrics: MonthlyBuildingPatternSeedMetrics = {
    buildingPatternSeedMatchCount: 0,
    buildingPatternHighConfidenceCount: 0,
    buildingPatternLowConfidenceCount: 0,
    buildingPatternConfidenceScoreAvg: 0,
    buildingPatternControlChainCount: 0,
    buildingPatternDurationCurveProfileCount: 0,
    buildingPatternPriorityAvg: 0,
    buildingPatternReasonsByItemKey: new Map(),
    buildingPatternMetadataByItemKey: new Map(),
  }
  const eligibleItems = items
    .filter((item) => item.is_executable !== false && item.is_wbs_summary !== true)
    .slice(0, 200)
  let buildingPatternWeightTotal = 0

  for (const item of eligibleItems) {
    const matches = await resolveV1474BuildingPatternMatches(
      compactMonthlyPatternText(item),
      buildMonthlyPatternSeedContext(projectId, item),
    )
    const match = matches[0]
    if (!match?.record) continue
    const record = readRecord(match.record)
    const controlChains = Array.isArray(record.controlChains ?? record.control_chains)
      ? (record.controlChains ?? record.control_chains) as unknown[]
      : []
    const durationCurveProfile = readRecord(match.mergedDurationCurveProfile ?? record.durationCurveProfile ?? record.duration_curve_profile)
    const patternPriority = Number(record.patternPriority ?? record.pattern_priority ?? 0) || 0
    const matchWeight = Math.max(0.01, Number(match.matchWeight ?? 1) || 1)
    buildingPatternWeightTotal += matchWeight

    metrics.buildingPatternSeedMatchCount += 1
    if (match.confidenceLevel === 'high') metrics.buildingPatternHighConfidenceCount += 1
    if (match.confidenceLevel === 'low') metrics.buildingPatternLowConfidenceCount += 1
    metrics.buildingPatternConfidenceScoreAvg += match.confidenceScore * matchWeight
    metrics.buildingPatternControlChainCount += controlChains.length
    if (Object.keys(durationCurveProfile).length > 0) metrics.buildingPatternDurationCurveProfileCount += 1
    metrics.buildingPatternPriorityAvg += patternPriority * matchWeight

    const key = getMonthlyPatternItemKey(item)
    metrics.buildingPatternReasonsByItemKey.set(key, ['building_pattern_context'])
    metrics.buildingPatternMetadataByItemKey.set(key, {
      building_pattern_code: match.patternCode,
      building_pattern_codes: match.mergedPatternCodes ?? matches.map((item) => item.patternCode).filter(Boolean),
      building_pattern_secondary_codes: matches.slice(1).map((item) => item.patternCode).filter(Boolean),
      building_pattern_match_weight: match.matchWeight ?? null,
      building_pattern_secondary_matches: match.secondaryMatches ?? [],
      building_pattern_confidence: match.confidenceScore,
      building_pattern_confidence_level: match.confidenceLevel,
      building_pattern_action_policy: match.actionPolicy,
      building_pattern_role: record.patternRole ?? record.pattern_role ?? null,
      building_pattern_priority: patternPriority || null,
      building_pattern_control_chain_count: controlChains.length,
      building_pattern_duration_curve_profile: durationCurveProfile,
      building_pattern_duration_profile_contributions: match.durationProfileContributions ?? [],
      building_pattern_weighted_typical_cycle_days: match.weightedTypicalCycleDays ?? null,
      building_pattern_typical_cycle_day_contributions: match.typicalCycleDayContributions ?? [],
      building_pattern_merged_stagger_rules: match.mergedStaggerRules ?? [],
      building_pattern_stagger_rule_contributions: match.staggerRuleContributions ?? [],
      building_pattern_stagger_merge_policy: match.staggerMergePolicy ?? null,
      building_pattern_hard_deadline_priority: match.hardDeadlinePriority ?? 0,
      building_pattern_matched_signals: match.matchedSignals,
      building_pattern_missing_signals: match.missingSignals,
    })
  }

  metrics.buildingPatternConfidenceScoreAvg = buildingPatternWeightTotal > 0
    ? Math.round(metrics.buildingPatternConfidenceScoreAvg / buildingPatternWeightTotal)
    : 0
  metrics.buildingPatternPriorityAvg = buildingPatternWeightTotal > 0
    ? Math.round(metrics.buildingPatternPriorityAvg / buildingPatternWeightTotal)
    : 0
  return metrics
}

type MonthlyProjectFactMetrics = {
  keyNodeSnapshotCount: number
  keyNodeImpactedTaskCount: number
  dependencyEdgeCount: number
  requiredDependencyCount: number
  unsatisfiedConditionCount: number
  blockingConditionCount: number
  activeObstacleCount: number
  blockingObstacleCount: number
  drawingLinkCount: number
  materialLinkCount: number
  materialAttentionCount: number
  acceptancePendingCount: number
  openRiskCount: number
  openIssueCount: number
  activeWarningCount: number
  criticalExternalSignalCount: number
  healthRiskSignalCount: number
  lowConfidenceReasonCount: number
}

type MonthlyProjectFactContext = {
  metrics: MonthlyProjectFactMetrics
  blockingFactorsByTaskId: Map<string, MonthlyPlanGenerationBlockingFactor[]>
}

const EMPTY_MONTHLY_PROJECT_FACT_METRICS: MonthlyProjectFactMetrics = {
  keyNodeSnapshotCount: 0,
  keyNodeImpactedTaskCount: 0,
  dependencyEdgeCount: 0,
  requiredDependencyCount: 0,
  unsatisfiedConditionCount: 0,
  blockingConditionCount: 0,
  activeObstacleCount: 0,
  blockingObstacleCount: 0,
  drawingLinkCount: 0,
  materialLinkCount: 0,
  materialAttentionCount: 0,
  acceptancePendingCount: 0,
  openRiskCount: 0,
  openIssueCount: 0,
  activeWarningCount: 0,
  criticalExternalSignalCount: 0,
  healthRiskSignalCount: 0,
  lowConfidenceReasonCount: 0,
}

const EMPTY_MONTHLY_PROJECT_FACT_CONTEXT: MonthlyProjectFactContext = {
  metrics: EMPTY_MONTHLY_PROJECT_FACT_METRICS,
  blockingFactorsByTaskId: new Map(),
}

type ExternalRiskRow = Record<string, any> & {
  level?: string | null
  severity?: string | null
  status?: string | null
  task_id?: string | null
}

type ExternalIssueRow = Record<string, any> & {
  severity?: string | null
  status?: string | null
  task_id?: string | null
}

async function safeSelectProjectRows(table: string, projectId: string, limit = 1_000): Promise<Record<string, any>[]> {
  try {
    const { data, error } = await (supabase as any)
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .limit(limit)
    if (error) throw error
    return Array.isArray(data) ? data : []
  } catch (error) {
    logger.debug('[monthlyPlanGenerationService] optional monthly plan input table unavailable', { table, error })
    return []
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || normalizeLower(value) === 'true'
}

function isInactiveStatus(status: unknown) {
  return ['resolved', 'closed', 'cancelled', 'canceled', 'archived', 'deleted', 'inactive'].includes(normalizeLower(status))
}

function isSatisfiedCondition(row: Record<string, any>) {
  return readBoolean(row.is_satisfied) || ['satisfied', 'confirmed', 'met', 'closed'].includes(normalizeLower(row.status))
}

function isBlockingLevel(value: unknown) {
  return ['blocked', 'critical', 'hard', 'must', 'blocking', 'high'].includes(normalizeLower(value))
}

function isHighSeverity(value: unknown) {
  return ['critical', 'high'].includes(normalizeLower(value))
}

function isPastDate(value: unknown, today = new Date()) {
  const parsed = parsePlanDate(normalizeText(value))
  if (!parsed) return false
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  return parsed.getTime() < todayDate.getTime()
}

function rowTaskId(row: Record<string, any>) {
  return normalizeText(row.task_id ?? row.source_task_id ?? row.target_entity_id)
}

function countRowsForTasks(rows: Record<string, any>[], taskIds: Set<string>) {
  return rows.filter((row) => {
    const taskId = rowTaskId(row)
    return taskId && taskIds.has(taskId)
  })
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : []
  } catch {
    return text
      .replace(/[{}[\]"']/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function readMetadataRecord(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readRecord(metadata[key])
    if (Object.keys(value).length > 0) return value
  }
  return {}
}

function readMetadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeText(metadata[key])
    if (value) return value
  }
  return null
}

function readMetadataTextArray(metadata: Record<string, unknown>, keys: string[]) {
  const values: string[] = []
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeText(item)
        if (normalized) values.push(normalized)
      }
      continue
    }
    const normalized = normalizeText(value)
    if (normalized) values.push(normalized)
  }
  return Array.from(new Set(values))
}

function addTaskBlockingFactor(
  index: Map<string, MonthlyPlanGenerationBlockingFactor[]>,
  taskId: string,
  factor: MonthlyPlanGenerationBlockingFactor,
) {
  if (!taskId) return
  index.set(taskId, uniqueStrings([...(index.get(taskId) ?? []), factor]))
}

async function getHealthRiskMetrics(projectId: string) {
  try {
    const summary = await buildProjectHealthDeviationSummary(projectId)
    const score = Number(summary.businessHealthScore)
    const lowHealth = Number.isFinite(score) && score < 70
    const lowConfidence = ['low', 'unavailable'].includes(normalizeLower(summary.healthConfidenceFlag))
    const deviationSignal = Object.keys(summary.deviationSummary ?? {}).length > 0
    return {
      healthRiskSignalCount: (lowHealth ? 1 : 0) + (deviationSignal ? 1 : 0),
      lowConfidenceReasonCount: lowConfidence ? 1 : 0,
    }
  } catch (error) {
    logger.debug('[monthlyPlanGenerationService] health deviation summary unavailable for monthly plan generation', { projectId, error })
    return { healthRiskSignalCount: 0, lowConfidenceReasonCount: 1 }
  }
}

async function getMonthlyProjectFactContext(projectId: string, items: MonthlyPlanSeedItem[]): Promise<MonthlyProjectFactContext> {
  const taskIds = new Set(items.map((item) => item.source_task_id).filter((id): id is string => Boolean(id)))
  if (!projectId) return { ...EMPTY_MONTHLY_PROJECT_FACT_CONTEXT, blockingFactorsByTaskId: new Map() }

  const [
    dependencies,
    conditions,
    obstacles,
    keyNodeSnapshots,
    links,
    acceptancePlans,
    materials,
    risks,
    issues,
    warnings,
    healthMetrics,
  ] = await Promise.all([
    safeSelectProjectRows('task_dependencies', projectId),
    safeSelectProjectRows('task_conditions', projectId),
    safeSelectProjectRows('task_obstacles', projectId),
    safeSelectProjectRows('project_key_node_snapshots', projectId),
    safeSelectProjectRows('project_entity_links', projectId),
    safeSelectProjectRows('acceptance_plans', projectId),
    safeSelectProjectRows('project_materials', projectId),
    safeSelectProjectRows('risks', projectId) as Promise<ExternalRiskRow[]>,
    safeSelectProjectRows('issues', projectId) as Promise<ExternalIssueRow[]>,
    listProjectWarningProjectionRows(projectId),
    getHealthRiskMetrics(projectId),
  ])

  const blockingFactorsByTaskId = new Map<string, MonthlyPlanGenerationBlockingFactor[]>()
  const dependencyRows = countRowsForTasks(dependencies, taskIds)
    .filter((row) => !isInactiveStatus(row.status))
  const conditionRows = countRowsForTasks(conditions, taskIds)
    .filter((row) => !isInactiveStatus(row.status))
  const unsatisfiedConditions = conditionRows.filter((row) => !isSatisfiedCondition(row))
  const obstacleRows = countRowsForTasks(obstacles, taskIds)
    .filter((row) => !isInactiveStatus(row.status) && !readBoolean(row.is_resolved))
  const activeKeyNodeSnapshots = keyNodeSnapshots.filter((row) => !isInactiveStatus(row.status))
  const keyNodeTaskIds = new Set(
    activeKeyNodeSnapshots.flatMap((row) => readStringArray(row.source_task_ids)),
  )
  const activeLinks = links.filter((row) => {
    const targetType = normalizeLower(row.target_entity_type)
    const taskId = normalizeText(row.target_entity_id ?? row.task_id)
    return !isInactiveStatus(row.status) && (!targetType || targetType === 'task') && taskId && taskIds.has(taskId)
  })
  const acceptanceRows = acceptancePlans.filter((row) => {
    const taskId = normalizeText(row.task_id)
    return taskId && taskIds.has(taskId) && !['passed', 'archived', 'closed', 'cancelled', 'canceled'].includes(normalizeLower(row.status))
  })
  const riskRows = risks.filter((row) => {
    const taskId = normalizeText(row.task_id)
    return (!taskId || taskIds.has(taskId)) && !isInactiveStatus(row.status)
  })
  const issueRows = issues.filter((row) => {
    const taskId = normalizeText(row.task_id)
    return (!taskId || taskIds.has(taskId)) && !isInactiveStatus(row.status) && normalizeLower(row.status) !== 'resolved'
  })
  const warningRows = warnings.filter((row) => {
    const taskId = normalizeText(row.task_id)
    return (!taskId || taskIds.has(taskId)) && isActiveWarning(row)
  })
  const linkedMaterialIds = new Set(
    activeLinks
      .filter((row) => ['project_material', 'material'].includes(normalizeLower(row.source_entity_type)))
      .map((row) => normalizeText(row.source_entity_id))
      .filter(Boolean),
  )
  const linkedMaterials = materials.filter((row) => linkedMaterialIds.has(normalizeText(row.id)))
  const materialAttentionRows = linkedMaterials.filter((row) => (
    (readBoolean(row.requires_sample_confirmation) && !readBoolean(row.sample_confirmed))
    || (readBoolean(row.requires_inspection) && !readBoolean(row.inspection_done))
    || (!row.actual_arrival_date && isPastDate(row.expected_arrival_date))
  ))

  for (const row of dependencyRows) {
    if (readBoolean(row.required_for_start) || normalizeLower(row.dependency_type) === 'fs') {
      addTaskBlockingFactor(blockingFactorsByTaskId, rowTaskId(row), 'predecessor_unfinished')
    }
  }
  for (const row of unsatisfiedConditions) {
    addTaskBlockingFactor(blockingFactorsByTaskId, rowTaskId(row), 'condition_unmet')
  }
  for (const row of obstacleRows) {
    addTaskBlockingFactor(blockingFactorsByTaskId, rowTaskId(row), 'active_obstacle')
  }
  for (const row of acceptanceRows) {
    addTaskBlockingFactor(blockingFactorsByTaskId, rowTaskId(row), 'mapping_attention')
  }
  for (const row of activeLinks) {
    if (['project_material', 'material'].includes(normalizeLower(row.source_entity_type))) {
      addTaskBlockingFactor(blockingFactorsByTaskId, normalizeText(row.target_entity_id ?? row.task_id), 'mapping_attention')
    }
  }

  const drawingLinkCount = activeLinks.filter((row) => ['construction_drawing', 'drawing_package', 'drawing_version'].includes(normalizeLower(row.source_entity_type))).length
  const materialLinkCount = linkedMaterialIds.size
  const criticalRiskCount = riskRows.filter((row) => isHighSeverity(row.level ?? row.severity)).length
  const criticalIssueCount = issueRows.filter((row) => isHighSeverity(row.severity)).length
  const criticalWarningCount = warningRows.filter((row) => normalizeLower(row.warning_level) === 'critical').length

  return {
    metrics: {
      keyNodeSnapshotCount: activeKeyNodeSnapshots.length,
      keyNodeImpactedTaskCount: [...keyNodeTaskIds].filter((taskId) => taskIds.has(taskId)).length,
      dependencyEdgeCount: dependencyRows.length,
      requiredDependencyCount: dependencyRows.filter((row) => readBoolean(row.required_for_start) || normalizeLower(row.dependency_type) === 'fs').length,
      unsatisfiedConditionCount: unsatisfiedConditions.length,
      blockingConditionCount: unsatisfiedConditions.filter((row) => isBlockingLevel(row.blocking_level ?? row.condition_type)).length,
      activeObstacleCount: obstacleRows.length,
      blockingObstacleCount: obstacleRows.filter((row) => isBlockingLevel(row.blocking_level ?? row.progress_impact_level) || isHighSeverity(row.severity)).length,
      drawingLinkCount,
      materialLinkCount,
      materialAttentionCount: materialAttentionRows.length,
      acceptancePendingCount: acceptanceRows.length,
      openRiskCount: riskRows.length,
      openIssueCount: issueRows.length,
      activeWarningCount: warningRows.length,
      criticalExternalSignalCount: criticalRiskCount + criticalIssueCount + criticalWarningCount,
      healthRiskSignalCount: healthMetrics.healthRiskSignalCount,
      lowConfidenceReasonCount: healthMetrics.lowConfidenceReasonCount,
    },
    blockingFactorsByTaskId,
  }
}

function applyProjectFactMetadata(
  items: MonthlyPlanSeedItem[],
  context: MonthlyProjectFactContext,
  monthWindow: MonthWindow | null,
  snapshotCutoffAt: string | null,
  buildingPatternMetrics?: MonthlyBuildingPatternSeedMetrics | null,
) {
  return items.map((item) => withGenerationMetadata(item, {
    blockingFactors: item.source_task_id ? context.blockingFactorsByTaskId.get(item.source_task_id) ?? [] : [],
    generationReasons: [
      ...(item.source_task_id && context.blockingFactorsByTaskId.has(item.source_task_id)
        ? ['execution_fact_attention']
        : []),
      ...(buildingPatternMetrics?.buildingPatternReasonsByItemKey.get(getMonthlyPatternItemKey(item)) ?? []),
    ],
    snapshotCutoffAt,
    monthWindow,
    algorithmContext: buildingPatternMetrics?.buildingPatternMetadataByItemKey.get(getMonthlyPatternItemKey(item)),
  })).map((item) => {
    if (!item.carryover_from_item_id || !item.source_task_id) return item
    const blockingFactors = context.blockingFactorsByTaskId.get(item.source_task_id) ?? []
    const unresolvedBlockerCount = blockingFactors.filter((factor) => (
      factor === 'condition_unmet'
      || factor === 'active_obstacle'
      || factor === 'predecessor_unfinished'
      || factor === 'mapping_attention'
    )).length
    return applyCarryoverAgingPenalty(item, {
      incrementCarryoverCount: false,
      unresolvedBlockerCount,
    })
  })
}

function countMonthlyExternalSignals(metrics: MonthlyProjectFactMetrics) {
  return metrics.blockingConditionCount
    + metrics.blockingObstacleCount
    + metrics.materialAttentionCount
    + metrics.acceptancePendingCount
    + metrics.criticalExternalSignalCount
}

function buildGenerationSummary(params: {
  sourceMode: 'baseline' | 'schedule' | 'mixed'
  sourceVersionLabel: string
  baselineStatus: string | null
  autoSwitched: boolean
  items: MonthlyPlanSeedItem[]
  carryoverItemCount: number
  forecastDelayedCount: number
  maxForecastDelayDays: number
  lowConfidenceReasonCount: number
  capacity: MonthlyCapacityGovernance
  projectFactMetrics: MonthlyProjectFactMetrics
  buildingPatternMetrics: MonthlyBuildingPatternSeedMetrics
  buildingPatternExecutionProfile: BuildingPatternExecutionProfile
  constructionRhythmExpansion: ConstructionRhythmExpansionResult
  constructionRhythmArbitration: ConstructionRhythmArbitrationResult
  constructionRhythmCoordination: ConstructionRhythmCoordinationResult
  buildingPatternExecutionPlanCandidates: BuildingPatternExecutionPlanCandidateResult
}): MonthlyPlanGenerationSummary {
  const criticalPathItemCount = params.items.filter((item) => item.is_critical).length
  const scoringInput = {
    carryoverItemCount: params.carryoverItemCount,
    criticalPathChangeCount: criticalPathItemCount,
    forecastDelayedCount: params.forecastDelayedCount,
    maxForecastDelayDays: params.maxForecastDelayDays,
    externalBlockingSignalCount: countMonthlyExternalSignals(params.projectFactMetrics),
    healthRiskSignalCount: params.projectFactMetrics.healthRiskSignalCount,
    lowConfidenceReasonCount: params.lowConfidenceReasonCount
      + params.projectFactMetrics.lowConfidenceReasonCount
      + (params.capacity.overCommitted ? 1 : 0),
  }
  const recommendation = scorePlanningRecommendation(scoringInput)
  const reasons = buildMonthlyPlanBusinessReasons(scoringInput)
  if (params.capacity.overCommitted) {
    reasons.push({
      code: 'monthly_capacity_overcommitted',
      label: 'Monthly capacity over-committed',
      detail: `Monthly draft demand is ${params.capacity.demandDays} day(s) against a ${params.capacity.budgetDays} day budget; ${params.capacity.rebalancedItemCount} item(s) were rebalanced before confirmation.`,
      severity: 'warning',
    })
  }
  const constructionProfileReason = buildBuildingPatternExecutionProfileReason(params.buildingPatternExecutionProfile)
  if (constructionProfileReason) reasons.push(constructionProfileReason)
  const constructionRhythmReason = buildConstructionRhythmExpansionReason(params.constructionRhythmExpansion)
  if (constructionRhythmReason) reasons.push(constructionRhythmReason)
  const constructionRhythmArbitrationReason = buildConstructionRhythmArbitrationReason(params.constructionRhythmArbitration)
  if (constructionRhythmArbitrationReason) reasons.push(constructionRhythmArbitrationReason)
  const constructionRhythmCoordinationReason = buildConstructionRhythmCoordinationReason(params.constructionRhythmCoordination)
  if (constructionRhythmCoordinationReason) reasons.push(constructionRhythmCoordinationReason)
  const buildingPatternExecutionPlanCandidateReason = buildBuildingPatternExecutionPlanCandidateReason(params.buildingPatternExecutionPlanCandidates)
  if (buildingPatternExecutionPlanCandidateReason) reasons.push(buildingPatternExecutionPlanCandidateReason)
  if (params.buildingPatternMetrics.buildingPatternSeedMatchCount > 0) {
    reasons.push({
      code: 'monthly_building_pattern_context',
      label: 'Building rhythm context matched',
      detail: `${params.buildingPatternMetrics.buildingPatternSeedMatchCount} building rhythm pattern(s), ${params.buildingPatternMetrics.buildingPatternControlChainCount} control chain(s), and ${params.buildingPatternMetrics.buildingPatternDurationCurveProfileCount} duration curve profile(s) were considered by monthly plan generation.`,
      severity: params.buildingPatternMetrics.buildingPatternLowConfidenceCount > 0 ? 'info' : 'info',
    })
  }

  return {
    algorithmVersion: 'v1.4.7.4',
    sourceMode: params.sourceMode,
    sourceVersionLabel: params.sourceVersionLabel,
    baselineStatus: params.baselineStatus,
    autoSwitched: params.autoSwitched,
    itemCount: params.items.length,
    carryoverItemCount: params.carryoverItemCount,
    criticalPathItemCount,
    forecastDelayedCount: params.forecastDelayedCount,
    maxForecastDelayDays: params.maxForecastDelayDays,
    keyNodeSnapshotCount: params.projectFactMetrics.keyNodeSnapshotCount,
    keyNodeImpactedTaskCount: params.projectFactMetrics.keyNodeImpactedTaskCount,
    dependencyEdgeCount: params.projectFactMetrics.dependencyEdgeCount,
    requiredDependencyCount: params.projectFactMetrics.requiredDependencyCount,
    unsatisfiedConditionCount: params.projectFactMetrics.unsatisfiedConditionCount,
    blockingConditionCount: params.projectFactMetrics.blockingConditionCount,
    activeObstacleCount: params.projectFactMetrics.activeObstacleCount,
    blockingObstacleCount: params.projectFactMetrics.blockingObstacleCount,
    drawingLinkCount: params.projectFactMetrics.drawingLinkCount,
    materialLinkCount: params.projectFactMetrics.materialLinkCount,
    materialAttentionCount: params.projectFactMetrics.materialAttentionCount,
    acceptancePendingCount: params.projectFactMetrics.acceptancePendingCount,
    openRiskCount: params.projectFactMetrics.openRiskCount,
    openIssueCount: params.projectFactMetrics.openIssueCount,
    activeWarningCount: params.projectFactMetrics.activeWarningCount,
    criticalExternalSignalCount: params.projectFactMetrics.criticalExternalSignalCount,
    healthRiskSignalCount: params.projectFactMetrics.healthRiskSignalCount,
    capacityBudgetDays: params.capacity.budgetDays,
    capacityDemandDays: params.capacity.demandDays,
    capacityAllocatedDays: params.capacity.allocatedDays,
    capacityOverCommitted: params.capacity.overCommitted,
    capacityRebalancedItemCount: params.capacity.rebalancedItemCount,
    buildingPatternSeedMatchCount: params.buildingPatternMetrics.buildingPatternSeedMatchCount,
    buildingPatternHighConfidenceCount: params.buildingPatternMetrics.buildingPatternHighConfidenceCount,
    buildingPatternLowConfidenceCount: params.buildingPatternMetrics.buildingPatternLowConfidenceCount,
    buildingPatternConfidenceScoreAvg: params.buildingPatternMetrics.buildingPatternConfidenceScoreAvg,
    buildingPatternControlChainCount: params.buildingPatternMetrics.buildingPatternControlChainCount,
    buildingPatternDurationCurveProfileCount: params.buildingPatternMetrics.buildingPatternDurationCurveProfileCount,
    buildingPatternPriorityAvg: params.buildingPatternMetrics.buildingPatternPriorityAvg,
    buildingPatternExecutionModeCount: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionModeCount,
    buildingPatternExecutionBackendConsumableModeCount: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionBackendConsumableModeCount,
    buildingPatternExecutionLowConfidenceModeCount: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionLowConfidenceModeCount,
    buildingPatternExecutionReadinessScore: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionReadinessScore,
    buildingPatternExecutionScopeDimensionCount: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionScopeDimensionCount,
    buildingPatternExecutionFeatureCoveragePercent: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionFeatureCoveragePercent,
    buildingPatternExecutionStandardWorkCoveragePercent: params.buildingPatternExecutionProfile.metrics.buildingPatternExecutionStandardWorkCoveragePercent,
    constructionRhythmExpansionCandidateCount: params.constructionRhythmExpansion.metrics.constructionRhythmExpansionCandidateCount,
    constructionRhythmBackendConsumableCandidateCount: params.constructionRhythmExpansion.metrics.constructionRhythmBackendConsumableCandidateCount,
    constructionRhythmLimitedCandidateCount: params.constructionRhythmExpansion.metrics.constructionRhythmLimitedCandidateCount,
    constructionRhythmWorkfaceCandidateCount: params.constructionRhythmExpansion.metrics.constructionRhythmWorkfaceCandidateCount,
    constructionRhythmStrategyCount: params.constructionRhythmExpansion.metrics.constructionRhythmStrategyCount,
    constructionRhythmArbitrationSignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmArbitrationSignalCount,
    constructionRhythmBackendConsumableSignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmBackendConsumableSignalCount,
    constructionRhythmConfidenceOnlySignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmConfidenceOnlySignalCount,
    constructionRhythmCandidateDependencySignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmCandidateDependencySignalCount,
    constructionRhythmCandidateEarliestStartSignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmCandidateEarliestStartSignalCount,
    constructionRhythmCandidateDurationContextSignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmCandidateDurationContextSignalCount,
    constructionRhythmParallelCautionSignalCount: params.constructionRhythmArbitration.metrics.constructionRhythmParallelCautionSignalCount,
    constructionRhythmArbitrationScore: params.constructionRhythmArbitration.metrics.constructionRhythmArbitrationScore,
    constructionRhythmCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmCoordinationSignalCount,
    constructionRhythmCoordinationBackendConsumableSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmCoordinationBackendConsumableSignalCount,
    constructionRhythmCoordinationConfidenceOnlySignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmCoordinationConfidenceOnlySignalCount,
    constructionRhythmDependencyCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmDependencyCoordinationSignalCount,
    constructionRhythmEarliestStartCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmEarliestStartCoordinationSignalCount,
    constructionRhythmDurationContextCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmDurationContextCoordinationSignalCount,
    constructionRhythmSiteCapacityCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmSiteCapacityCoordinationSignalCount,
    constructionRhythmProgressCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmProgressCoordinationSignalCount,
    constructionRhythmReadinessCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmReadinessCoordinationSignalCount,
    constructionRhythmQualityCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmQualityCoordinationSignalCount,
    constructionRhythmDurationExperienceCoordinationSignalCount: params.constructionRhythmCoordination.metrics.constructionRhythmDurationExperienceCoordinationSignalCount,
    constructionRhythmCoordinationScore: params.constructionRhythmCoordination.metrics.constructionRhythmCoordinationScore,
    buildingPatternExecutionPlanCandidateCount: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateCount,
    buildingPatternExecutionRecommendedPlanCandidateCount: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionRecommendedPlanCandidateCount,
    buildingPatternExecutionConservativePlanCandidateCount: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionConservativePlanCandidateCount,
    buildingPatternExecutionCompressedPlanCandidateCount: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionCompressedPlanCandidateCount,
    buildingPatternExecutionLowConfidencePlanCandidateCount: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionLowConfidencePlanCandidateCount,
    buildingPatternExecutionPlanCandidateMaxConfidenceScore: params.buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateMaxConfidenceScore,
    recommendationScore: recommendation.score,
    recommendationLevel: recommendation.level,
    confidence: recommendation.confidence,
    reasons,
  }
}

export async function resolveMonthlyPlanGenerationSourceV1474(projectId: string, month?: string | null): Promise<MonthlyPlanGenerationSource> {
  const monthWindow = getMonthWindow(month)
  const snapshotCutoffAt = new Date().toISOString()
  const latestBaseline = await getCurrentExecutionBaseline(projectId)
  const [carryoverItems, manualOverrideItems] = await Promise.all([
    month ? loadCarryoverItems(projectId, month, snapshotCutoffAt) : Promise.resolve([]),
    month ? loadSameMonthManualOverrideItems(projectId, month) : Promise.resolve([]),
  ])

  if (latestBaseline?.status === 'confirmed') {
    const items = await getBaselineItems(latestBaseline.id)
    const e2InclusionContext = await buildMonthlyE2InclusionContext(projectId, items.map((item) => ({
      taskId: item.source_task_id,
      plannedStartDate: item.planned_start_date,
      plannedEndDate: item.planned_end_date,
      closed: isBaselineItemClosedForMonthlyInclusion(item),
    })), monthWindow)
    const sourceItems = await mapBaselineItemsToMonthlySeedItems(projectId, items, monthWindow, snapshotCutoffAt, e2InclusionContext)
    const mergedItems = applyManualOverrideFields(mergeCarryoverItems(sourceItems, carryoverItems), manualOverrideItems)
    const projectFactContext = await getMonthlyProjectFactContext(projectId, mergedItems)
    const buildingPatternMetrics = await getMonthlyBuildingPatternSeedMetrics(projectId, mergedItems)
    const factAwareItems = applyProjectFactMetadata(mergedItems, projectFactContext, monthWindow, snapshotCutoffAt, buildingPatternMetrics)
    const buildingPatternExecutionProfile = await buildBuildingPatternExecutionProfile(projectId, factAwareItems as unknown as Record<string, unknown>[], 'monthly_plan_items')
    const constructionRhythmExpansion = buildConstructionRhythmExpansion(buildingPatternExecutionProfile, factAwareItems as unknown as Record<string, unknown>[])
    const constructionRhythmArbitration = buildConstructionRhythmArbitration(
      buildingPatternExecutionProfile,
      constructionRhythmExpansion,
      factAwareItems as unknown as Record<string, unknown>[],
    )
    const constructionRhythmCoordination = buildConstructionRhythmCoordination(
      constructionRhythmArbitration,
      factAwareItems as unknown as Record<string, unknown>[],
    )
    const buildingPatternExecutionPlanCandidates = buildBuildingPatternExecutionPlanCandidates({
      profile: buildingPatternExecutionProfile,
      expansion: constructionRhythmExpansion,
      arbitration: constructionRhythmArbitration,
      coordination: constructionRhythmCoordination,
      facts: factAwareItems as unknown as Record<string, unknown>[],
    })
    const [freshFloatByKey, planningReplayReadbackByKey] = await Promise.all([
      buildFreshFloatContext(projectId, factAwareItems),
      buildMonthlyPlanningReplayReadbackContext(projectId, factAwareItems),
    ])
    const scheduledItems = applyMonthlyReadinessAndCriticalityContext(factAwareItems, freshFloatByKey, planningReplayReadbackByKey)
    const forecastMetrics = await getForecastMetrics(projectId, scheduledItems, e2InclusionContext)
    const capacityBudget = await monthCapacityBudgetContext(projectId, monthWindow)
    const capacityGovernance = applyMonthlyCapacityGovernance(scheduledItems, capacityBudget, forecastMetrics)
    const sourceVersionLabel = `baseline v${latestBaseline.version}`
    return {
      mode: carryoverItems.length > 0 ? 'mixed' : 'baseline',
      baselineVersionId: latestBaseline.id,
      sourceVersionId: latestBaseline.id,
      sourceVersionLabel,
      items: capacityGovernance.items,
      baselineStatus: latestBaseline.status,
      autoSwitched: false,
      generationSummary: buildGenerationSummary({
        sourceMode: carryoverItems.length > 0 ? 'mixed' : 'baseline',
        sourceVersionLabel,
        baselineStatus: latestBaseline.status,
        autoSwitched: false,
        items: capacityGovernance.items,
        carryoverItemCount: carryoverItems.length,
        ...forecastMetrics,
        capacity: capacityGovernance.capacity,
        projectFactMetrics: projectFactContext.metrics,
        buildingPatternMetrics,
        buildingPatternExecutionProfile,
        constructionRhythmExpansion,
        constructionRhythmArbitration,
        constructionRhythmCoordination,
        buildingPatternExecutionPlanCandidates,
      }),
    }
  }

  const [tasks, criticalTaskIds] = await Promise.all([
    getProjectTasks(projectId),
    getCriticalPathTaskIds(projectId),
  ])
  const baselineStatus = String(latestBaseline?.status ?? '').trim() || null
  const autoSwitched = AUTO_REALIGN_BASELINE_STATUSES.has(String(latestBaseline?.status ?? '').trim())
  const e2InclusionContext = await buildMonthlyE2InclusionContext(projectId, tasks.map((task) => ({
    taskId: task.id,
    plannedStartDate: task.planned_start_date ?? task.start_date,
    plannedEndDate: task.planned_end_date ?? task.end_date,
    closed: isClosedTask(task) || toProgress(task.progress) >= 100,
  })), monthWindow)
  const sourceItems = await mapTasksToMonthlySeedItems(projectId, tasks, criticalTaskIds, monthWindow, snapshotCutoffAt, e2InclusionContext)
  const mergedItems = applyManualOverrideFields(mergeCarryoverItems(sourceItems, carryoverItems), manualOverrideItems)
  const projectFactContext = await getMonthlyProjectFactContext(projectId, mergedItems)
  const buildingPatternMetrics = await getMonthlyBuildingPatternSeedMetrics(projectId, mergedItems)
  const factAwareItems = applyProjectFactMetadata(mergedItems, projectFactContext, monthWindow, snapshotCutoffAt, buildingPatternMetrics)
  const buildingPatternExecutionProfile = await buildBuildingPatternExecutionProfile(projectId, factAwareItems as unknown as Record<string, unknown>[], 'monthly_plan_items')
  const constructionRhythmExpansion = buildConstructionRhythmExpansion(buildingPatternExecutionProfile, factAwareItems as unknown as Record<string, unknown>[])
  const constructionRhythmArbitration = buildConstructionRhythmArbitration(
    buildingPatternExecutionProfile,
    constructionRhythmExpansion,
    factAwareItems as unknown as Record<string, unknown>[],
  )
  const constructionRhythmCoordination = buildConstructionRhythmCoordination(
    constructionRhythmArbitration,
    factAwareItems as unknown as Record<string, unknown>[],
  )
  const buildingPatternExecutionPlanCandidates = buildBuildingPatternExecutionPlanCandidates({
    profile: buildingPatternExecutionProfile,
    expansion: constructionRhythmExpansion,
    arbitration: constructionRhythmArbitration,
    coordination: constructionRhythmCoordination,
    facts: factAwareItems as unknown as Record<string, unknown>[],
  })
  const [freshFloatByKey, planningReplayReadbackByKey] = await Promise.all([
    buildFreshFloatContext(projectId, factAwareItems),
    buildMonthlyPlanningReplayReadbackContext(projectId, factAwareItems),
  ])
  const scheduledItems = applyMonthlyReadinessAndCriticalityContext(factAwareItems, freshFloatByKey, planningReplayReadbackByKey)
  const forecastMetrics = await getForecastMetrics(projectId, scheduledItems, e2InclusionContext)
  const capacityBudget = await monthCapacityBudgetContext(projectId, monthWindow)
  const capacityGovernance = applyMonthlyCapacityGovernance(scheduledItems, capacityBudget, forecastMetrics)
  const sourceVersionLabel = autoSwitched
    ? 'Current task list (baseline pending realignment)'
    : 'Current task list'

  return {
    mode: 'schedule',
    baselineVersionId: null,
    sourceVersionId: null,
    sourceVersionLabel,
    items: capacityGovernance.items,
    baselineStatus,
    autoSwitched,
    generationSummary: buildGenerationSummary({
      sourceMode: 'schedule',
      sourceVersionLabel,
      baselineStatus,
      autoSwitched,
      items: capacityGovernance.items,
      carryoverItemCount: carryoverItems.length,
      ...forecastMetrics,
      capacity: capacityGovernance.capacity,
      projectFactMetrics: projectFactContext.metrics,
      buildingPatternMetrics,
      buildingPatternExecutionProfile,
      constructionRhythmExpansion,
      constructionRhythmArbitration,
      constructionRhythmCoordination,
      buildingPatternExecutionPlanCandidates,
    }),
  }
}

export async function resolveMonthlyPlanCandidates(projectId: string, month?: string | null) {
  return (await resolveMonthlyPlanGenerationSourceV1474(projectId, month)).items
}
