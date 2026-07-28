// v1.4.7.4: project baseline generation algorithm service.

import { v4 as uuidv4 } from 'uuid'
import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import { getTaskDurationSuggestion } from './durationSuggestionService.js'
import {
  inferTitleWeakStandardWorkMatchesFromResolver,
  hasV1474WorkCalendarForYear,
  resolveV1474BuildingPatternMatches,
  resolveV1474HolidayWindow,
  resolveV1474ProcessConstraint,
  resolveV1474ResourceClass,
  resolveV1474SeasonalProductivity,
  resolveStandardWorkDurationSeed,
} from './algorithmSeedResolver.js'
import { resolveProjectClimateRegion } from './projectClimateResolver.js'
import { deriveV1474SeasonalProductivityRegion } from '../seeds/v1474SeasonalProductivitySeed.js'
import {
  buildBuildingPatternExecutionProfile,
  buildBuildingPatternExecutionProfileReason,
} from './buildingPatternExecutionProfileService.js'
import {
  buildConstructionRhythmExpansion,
  buildConstructionRhythmExpansionReason,
} from './constructionRhythmExpansionService.js'
import {
  buildConstructionRhythmArbitration,
  buildConstructionRhythmArbitrationReason,
} from './constructionRhythmArbitrationService.js'
import {
  buildConstructionRhythmCoordination,
  buildConstructionRhythmCoordinationReason,
} from './constructionRhythmCoordinationService.js'
import {
  buildBuildingPatternExecutionPlanCandidateReason,
  buildBuildingPatternExecutionPlanCandidates,
} from './buildingPatternExecutionPlanCandidateService.js'
import { buildConstructionSeedScopeContext } from './constructionScopeInferenceService.js'
import { inferWorkEnvironment } from '../seeds/workEnvironment.js'
import {
  buildBaselineBusinessReasons,
  scorePlanningRecommendation,
  type PlanningBusinessReason,
  type PlanningConfidenceLevel,
  type PlanningRecommendationLevel,
} from './planningGenerationReasonService.js'
import { buildProjectHealthDeviationSummary } from './projectHealthDeviationSummaryService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { buildProjectCriticalPathSnapshot, type CriticalPathSnapshot } from './projectCriticalPathService.js'
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
  addConstructionProductionDays,
  effectiveConstructionCalendarBasis,
  effectiveConstructionCalendarWindowCount,
  isAuthoritativeConstructionCalendar,
  isConstructionProductionDay,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  startOfUtcDay,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  inclusiveDurationDays,
  normalizeDateOnlyText,
  signedDurationDayDelta,
} from '../utils/durationDays.js'
import {
  buildCalendarDayDurationMetric,
  businessDateKey,
  DEFAULT_DURATION_TIMEZONE,
  normalizeDurationMetricDto,
  type DurationMetricDto,
} from './durationMetricService.js'
import { isActiveWarning } from '../utils/warningStatus.js'
import type { Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'

const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export type TaskBaselineItemInput = Partial<TaskBaselineItem> & {
  id?: string
  name?: string | null
}

export type TaskBaselineTaskRow = Pick<
  Task,
  | 'id'
  | 'parent_id'
  | 'title'
  | 'description'
  | 'project_id'
  | 'planned_start_date'
  | 'planned_end_date'
  | 'start_date'
  | 'end_date'
  | 'actual_start_date'
  | 'actual_end_date'
  | 'progress'
  | 'sort_order'
  | 'is_milestone'
  | 'baseline_item_id'
  | 'participant_unit_id'
  | 'assignee_user_id'
  | 'assignee_name'
  | 'engineering_object_id'
  | 'phase_object_id'
  | 'section_object_id'
  | 'building_object_id'
  | 'basement_object_id'
  | 'floor_object_id'
  | 'physical_zone_object_id'
  | 'functional_area_object_id'
  | 'template_id'
  | 'template_node_id'
  | 'wbs_code'
  | 'wbs_level'
  | 'engineering_category_id'
  | 'wbs_node_type'
  | 'wbs_path'
  | 'is_wbs_summary'
  | 'is_executable'
  | 'standard_work_code'
  | 'standard_work_name'
  | 'duration_calibration_source'
  | 'duration_provenance'
  | 'drawing_required'
  | 'material_required'
  | 'acceptance_required'
  | 'standard_task_metadata'
  | 'task_code'
  | 'task_code_version'
  | 'task_code_rule_id'
  | 'status'
>

export type BaselineGenerationCandidateReason = {
  code: string
  label: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
}

export type BaselineDiffKind = 'added' | 'modified' | 'removed' | 'milestone_changed'

export type BaselineDiffItem = {
  id: string
  kind: BaselineDiffKind
  title: string
  before: string
  after: string
  note?: string
  rowId?: string
}

export type BaselineGenerationCandidate = {
  baselineId: string
  projectId: string
  sourceVersionLabel: string
  candidateVersionLabel: string
  recommended: boolean
  recommendationScore: number
  recommendationLevel: PlanningRecommendationLevel
  confidence: PlanningConfidenceLevel
  algorithmVersion: 'v1.4.7.4'
  summary: string
  reasons: BaselineGenerationCandidateReason[]
  businessReasons: string[]
  dataQualityReasons: string[]
  metrics: Record<string, number | null | DurationMetricDto> & {
    totalFinishShift: DurationMetricDto
    milestoneMaxShift: DurationMetricDto
    /** @deprecated Consume totalFinishShift; removed after one compatibility release. */
    totalFinishShiftDays: number | null
    /** @deprecated Consume milestoneMaxShift; removed after one compatibility release. */
    milestoneMaxShiftDays: number | null
  }
  diffCounts: Record<string, number>
  diffItems: BaselineDiffItem[]
  generationSummary: {
    algorithmVersion: 'v1.4.7.4'
    sourceMode: 'current_schedule'
    affectedTaskCount: number
    forecastDelayedCount: number
    maxForecastDelayDays: number
    recommendationScore: number
    recommendationLevel: PlanningRecommendationLevel
    confidence: PlanningConfidenceLevel
    durationSeedFactorCount: number
    directSeedSignalCount: number
    buildingPatternSeedMatchCount: number
    buildingPatternHighConfidenceCount: number
    buildingPatternLowConfidenceCount: number
    buildingPatternConfidenceScoreAvg: number
    buildingPatternControlChainCount: number
    buildingPatternDurationCurveProfileCount: number
    buildingPatternWeightedCycleDayCount: number
    buildingPatternWeightedFirstFloorDaysAvg: number
    buildingPatternWeightedMidFloorsDaysAvg: number
    buildingPatternWeightedLastFloorsDaysAvg: number
    buildingPatternMergedStaggerRuleCount: number
    buildingPatternStaggerContributionCount: number
    buildingPatternHardDeadlineMatchCount: number
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
    workflowSeedMatchCount: number
    workflowLagDayCount: number
    resourceConflictSeedCount: number
    criticalTaskCount: number
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
    monthlyCommitmentCount: number
    monthlyCarryoverCount: number
    missingPlanDateCount: number
    suggestedDurationCount: number
    healthRiskSignalCount: number
    reasons: PlanningBusinessReason[]
  }
}

export type BaselineGenerationPreparation = {
  projectId: string
  sourceBaseline: TaskBaseline | null
  currentItems: TaskBaselineItem[]
  taskRows: TaskBaselineTaskRow[]
  generatedItems: TaskBaselineItemInput[]
  candidate: BaselineGenerationCandidate | null
}

type BaselineDurationSuggestion = {
  recommendedDurationDays?: number | string | null
  contextualReferenceDays?: number | string | null
  planReferenceDays?: number | string | null
  remainingForecastDays?: number | string | null
  remainingDuration?: DurationMetricDto | null
  durationOutputCode?: string | null
  confidenceLevel?: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
}

type BaselineDurationSuggestionMetrics = {
  missingPlanDateCount: number
  suggestedDurationCount: number
  unavailableDurationSuggestionCount: number
}

type BaselineGenerationDateOptions = {
  forecastByTaskId?: Map<string, CachedDurationForecastRow>
  durationSuggestionByTaskId?: Map<string, BaselineDurationSuggestion>
  durationSuggestionMetrics?: BaselineDurationSuggestionMetrics
  constructionCalendar?: ConstructionCalendarContext | null
  durationAsOfDate?: string | null
  planningReplayReadbackByTaskId?: Map<string, PlanningReplayCalibrationReadback>
}

type BaselineConfirmationGateMetadataResolvers = {
  resolveResourceClass?: typeof resolveV1474ResourceClass
  resolveProcessConstraint?: typeof resolveV1474ProcessConstraint
}

const TASK_SELECT = [
  'id',
  'project_id',
  'parent_id',
  'title',
  'description',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'actual_start_date',
  'actual_end_date',
  'progress',
  'sort_order',
  'is_milestone',
  'baseline_item_id',
  'participant_unit_id',
  'assignee_user_id',
  'assignee_name',
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'template_id',
  'template_node_id',
  'wbs_code',
  'wbs_level',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'drawing_required',
  'material_required',
  'acceptance_required',
  'standard_task_metadata',
  'task_code',
  'task_code_version',
  'task_code_rule_id',
  'status',
].join(',')

function isClosedExecutionTask(task: Pick<Task, 'status'>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return ['closed', 'cancelled', 'canceled', 'deleted', 'removed'].includes(status)
}

function resolveTaskPlanDate(
  task: Pick<Task, 'planned_start_date' | 'planned_end_date' | 'start_date' | 'end_date'>,
  side: 'start' | 'end',
) {
  return side === 'start'
    ? task.planned_start_date ?? task.start_date ?? null
    : task.planned_end_date ?? task.end_date ?? null
}

function formatBaselineVersionLabel(baseline?: Pick<TaskBaseline, 'version' | 'title'> | null) {
  if (!baseline) return 'current task list'
  const version = baseline.version == null ? null : Number(baseline.version)
  return Number.isFinite(version) ? `baseline v${version}` : baseline.title || 'project baseline'
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

function getBaselineCompareKey(item: Pick<TaskBaselineItem, 'source_task_id' | 'source_milestone_id' | 'title'>) {
  return item.source_task_id?.trim() || item.source_milestone_id?.trim() || item.title.trim()
}

function parseBaselineDate(value?: string | null) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeBaselineDate(value?: string | null) {
  if (!value) return null
  const date = parseBaselineDate(value)
  return date ? date.toISOString().slice(0, 10) : null
}

function compareBaselineDate(left?: string | null, right?: string | null) {
  const leftDate = parseBaselineDate(left)
  const rightDate = parseBaselineDate(right)
  if (!leftDate || !rightDate) return null
  return leftDate.getTime() - rightDate.getTime()
}

function addConstructionProductionDaysFromText(
  dateText: string,
  days: number,
  calendar?: ConstructionCalendarContext | null,
) {
  const date = parseBaselineDate(dateText)
  if (!date) return null
  if (days <= 0) return date.toISOString().slice(0, 10)
  return addConstructionProductionDays(date, days, calendar)
}

function subtractConstructionProductionDaysFromText(
  dateText: string,
  days: number,
  calendar?: ConstructionCalendarContext | null,
) {
  const date = parseBaselineDate(dateText)
  if (!date) return null
  let remaining = Math.max(1, days)
  const cursor = startOfUtcDay(date)
  if (isConstructionProductionDay(cursor, calendar)) remaining -= 1
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (isConstructionProductionDay(cursor, calendar)) remaining -= 1
  }
  return cursor.toISOString().slice(0, 10)
}

function isCompletedBaselineTask(task: Pick<TaskBaselineTaskRow, 'status' | 'progress'> & {
  actual_end_date?: string | null
}) {
  const status = normalizeLower(task.status)
  const progress = Number(task.progress ?? 0)
  return Boolean(task.actual_end_date)
    || ['completed', 'complete', 'done', 'finished'].includes(status)
    || (Number.isFinite(progress) && progress >= 100)
}

function isInProgressBaselineTask(task: Pick<TaskBaselineTaskRow, 'status' | 'progress'> & {
  actual_start_date?: string | null
  actual_end_date?: string | null
}) {
  if (isCompletedBaselineTask(task)) return false
  const status = normalizeLower(task.status)
  const progress = Number(task.progress ?? 0)
  return Boolean(task.actual_start_date)
    || ['in_progress', 'active', 'ongoing', 'started'].includes(status)
    || (Number.isFinite(progress) && progress > 0 && progress < 100)
}

function readDurationSuggestionDaysForGeneration(
  suggestion: BaselineDurationSuggestion | undefined,
  calendar: ConstructionCalendarContext | null | undefined,
  asOfDate: string | null | undefined,
) {
  if (!suggestion || !isAuthoritativeConstructionCalendar(calendar)) return null
  return readGovernedDurationSuggestionDays(suggestion, calendar, asOfDate)
}

type ResolvedBaselineDraftDates = {
  plannedStartDate: string | null
  plannedEndDate: string | null
  dateSource: 'actual_execution' | 'task_duration_forecast_e2' | 'duration_suggestion_e1' | 'current_schedule'
  sourceReason: string
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  confidence?: string | null
  planningReplayReadback?: PlanningReplayCalibrationReadback | null
  planningReplayAdjustmentDays?: number | null
}

function readBaselineReplayAdjustmentDays(
  dateSource: ResolvedBaselineDraftDates['dateSource'],
  readback?: PlanningReplayCalibrationReadback | null,
) {
  if (!readback || readback.status !== 'ready') return null
  const raw = dateSource === 'task_duration_forecast_e2'
    ? readback.e2ResidualCorrectionDays
    : dateSource === 'duration_suggestion_e1'
      ? readback.e1DurationAdjustmentDays
      : null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.min(7, Math.ceil(parsed))
}

function resolveBaselineDraftDates(
  task: TaskBaselineTaskRow,
  options: BaselineGenerationDateOptions = {},
): ResolvedBaselineDraftDates {
  let plannedStartDate = normalizeBaselineDate(resolveTaskPlanDate(task, 'start'))
  let plannedEndDate = normalizeBaselineDate(resolveTaskPlanDate(task, 'end'))
  let dateSource: ResolvedBaselineDraftDates['dateSource'] = 'current_schedule'
  let sourceReason = 'Dates generated from the current task schedule.'
  let durationCalibrationSource: string | null | undefined
  let durationProvenance: string | null | undefined
  let confidence: string | null = 'medium'

  const actualStart = normalizeBaselineDate(task.actual_start_date ?? null)
  const actualEnd = normalizeBaselineDate(task.actual_end_date ?? null)
  if (isCompletedBaselineTask(task)) {
    plannedStartDate = actualStart ?? plannedStartDate
    plannedEndDate = actualEnd ?? plannedEndDate
    if (actualStart || actualEnd) {
      dateSource = 'actual_execution'
      confidence = 'high'
      sourceReason = 'Dates anchored to actual execution facts.'
    }
  } else if (isInProgressBaselineTask(task)) {
    plannedStartDate = actualStart ?? plannedStartDate
    if (actualStart) {
      dateSource = 'actual_execution'
      sourceReason = 'Start date anchored to actual execution facts.'
    }

    const forecast = options.forecastByTaskId?.get(task.id)
    const forecastFinish = normalizeBaselineDate(forecast?.forecast_finish_date ?? null)
    const forecastExtendsPlan = forecastFinish && (!plannedEndDate || (compareBaselineDate(forecastFinish, plannedEndDate) ?? 0) > 0)
    if (forecastExtendsPlan) {
      plannedEndDate = forecastFinish
      dateSource = 'task_duration_forecast_e2'
      durationCalibrationSource = forecast?.duration_calibration_source ?? null
      durationProvenance = forecast?.duration_provenance ?? null
      confidence = String(forecast?.confidence_level ?? '').trim() || 'medium'
      sourceReason = actualStart
        ? 'Start date anchored to actual execution facts; finish date extended from E2 forecast.'
        : 'Finish date extended from E2 forecast.'
    }
  }

  if (!plannedStartDate || !plannedEndDate) {
    const suggestion = options.durationSuggestionByTaskId?.get(task.id)
    const suggestedDays = readDurationSuggestionDaysForGeneration(
      suggestion,
      options.constructionCalendar,
      options.durationAsOfDate,
    )
    if (suggestedDays != null) {
      if (plannedStartDate && !plannedEndDate) {
        plannedEndDate = addConstructionProductionDaysFromText(plannedStartDate, suggestedDays, options.constructionCalendar)
      } else if (plannedEndDate && !plannedStartDate) {
        plannedStartDate = subtractConstructionProductionDaysFromText(plannedEndDate, suggestedDays, options.constructionCalendar)
      }
      if (plannedStartDate && plannedEndDate) {
        dateSource = 'duration_suggestion_e1'
        durationCalibrationSource = suggestion?.durationCalibrationSource ?? null
        durationProvenance = suggestion?.durationProvenance ?? null
        confidence = String(suggestion?.confidenceLevel ?? '').trim() || 'medium'
        sourceReason = 'Missing draft date filled from E1 duration suggestion.'
      }
    }
  }

  const planningReplayReadback = options.planningReplayReadbackByTaskId?.get(task.id) ?? null
  const planningReplayAdjustmentDays = plannedEndDate
    ? readBaselineReplayAdjustmentDays(dateSource, planningReplayReadback)
    : null
  if (plannedEndDate && planningReplayAdjustmentDays != null) {
    plannedEndDate = addConstructionProductionDaysFromText(
      plannedEndDate,
      planningReplayAdjustmentDays + 1,
      options.constructionCalendar,
    ) ?? plannedEndDate
    sourceReason = `${sourceReason} Planning replay calibration readback applied as bounded draft-only adjustment.`
  }

  return {
    plannedStartDate,
    plannedEndDate,
    dateSource,
    sourceReason,
    durationCalibrationSource,
    durationProvenance,
    confidence,
    planningReplayReadback,
    planningReplayAdjustmentDays,
  }
}

function buildBaselineGenerationProvenanceMetadata(
  resolvedDates: ResolvedBaselineDraftDates,
  options: BaselineGenerationDateOptions = {},
  currentItem?: TaskBaselineItem,
) {
  const existing = readRecord(currentItem?.generation_metadata)
  const calendarBasis = effectiveConstructionCalendarBasis(options.constructionCalendar)
  const dateSource = resolvedDates.dateSource
  const overrideLevel = dateSource === 'actual_execution'
    ? 'fact_anchor'
    : dateSource === 'task_duration_forecast_e2'
      ? 'forecast_adjusted'
      : dateSource === 'duration_suggestion_e1'
        ? 'system_suggested'
        : 'none'
  const sourcePriority = ['actual_execution', 'task_duration_forecast_e2', 'duration_suggestion_e1', 'current_schedule']
  const planningReplayReadback = resolvedDates.planningReplayReadback?.status === 'ready'
    ? resolvedDates.planningReplayReadback
    : null
  const planningReplayAdjustmentDays = resolvedDates.planningReplayAdjustmentDays ?? null
  const appliedFactors = [
    ...(Array.isArray(existing.applied_factors) ? existing.applied_factors : []),
    dateSource === 'actual_execution'
      ? {
          factor: 'actual_execution_anchor',
          source: 'task.actual_start_date/task.actual_end_date',
          confidence: 'high',
        }
      : dateSource === 'task_duration_forecast_e2'
        ? {
            factor: 'task_duration_forecast_e2',
            source: 'taskDurationForecastService',
            confidence: resolvedDates.confidence ?? 'medium',
          }
        : dateSource === 'duration_suggestion_e1'
          ? {
              factor: 'duration_suggestion_e1',
              source: resolvedDates.durationProvenance ?? resolvedDates.durationCalibrationSource ?? 'durationSuggestionService',
              confidence: resolvedDates.confidence ?? 'medium',
            }
          : {
              factor: 'current_schedule_dates',
              source: 'tasks.planned_start_date/planned_end_date',
              confidence: 'medium',
            },
    options.constructionCalendar
      ? {
          factor: 'construction_calendar',
          source: 'resolveConstructionCalendarContext',
          basis: calendarBasis,
          window_count: effectiveConstructionCalendarWindowCount(options.constructionCalendar),
        }
      : null,
    planningReplayReadback && planningReplayAdjustmentDays != null
      ? {
          factor: 'planning_replay_calibration_readback',
          source: 'planningReplayCalibrationService',
          adjustment_days: planningReplayAdjustmentDays,
          coarse_process_key: planningReplayReadback.coarseProcessKey,
          evidence_refs: planningReplayReadback.evidenceRefs,
          write_policy: planningReplayReadback.writePolicy,
        }
      : null,
  ].filter(Boolean)

  return {
    ...existing,
    date_source: dateSource,
    source_priority: sourcePriority,
    confidence: resolvedDates.confidence ?? (dateSource === 'actual_execution' ? 'high' : 'medium'),
    override_level: overrideLevel,
    calendar_basis: calendarBasis,
    planning_replay_calibration_status: planningReplayReadback ? 'ready' : 'unavailable',
    planning_replay_calibration_write_policy: planningReplayReadback?.writePolicy ?? null,
    planning_replay_calibration_adjustment_days: planningReplayAdjustmentDays,
    planning_replay_calibration_evidence_refs: planningReplayReadback?.evidenceRefs ?? [],
    applied_factors: appliedFactors,
  }
}

function getBaselineItemTaskId(item: Pick<TaskBaselineItemInput, 'source_task_id' | 'source_milestone_id' | 'title'>) {
  return String(item.source_task_id ?? item.source_milestone_id ?? item.title ?? '').trim()
}

function readBaselineDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function nextCalendarDayText(dateText: string) {
  const date = readBaselineDate(dateText)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function baselineItemProductionDurationDays(
  item: Pick<TaskBaselineItemInput, 'planned_start_date' | 'planned_end_date'>,
  calendar?: ConstructionCalendarContext | null,
) {
  const start = readBaselineDate(item.planned_start_date)
  const end = readBaselineDate(item.planned_end_date)
  if (!start || !end) return 1
  return Math.max(1, productionDaysBetweenInclusive(start, end, calendar) || 1)
}

function getE3TaskOrder(snapshot: CriticalPathSnapshot | null | undefined) {
  const orderedTaskIds = [
    ...(((snapshot as any)?.networkSchedule ?? []) as Array<{ taskId?: string }>).map((task) => task.taskId),
    ...(snapshot?.tasks ?? []).map((task) => task.taskId),
    ...(snapshot?.autoTaskIds ?? []),
  ]
  return [...new Set(orderedTaskIds.filter(Boolean))]
}

function readE3TaskSchedule(snapshot: CriticalPathSnapshot | null | undefined) {
  const rows = Array.isArray((snapshot as any)?.networkSchedule) && ((snapshot as any).networkSchedule as unknown[]).length > 0
    ? ((snapshot as any).networkSchedule as unknown[])
    : ((snapshot?.tasks ?? []) as unknown[])
  return new Map(rows
    .map((row) => {
      const record = readRecord(row)
      const taskId = String(record.taskId ?? '').trim()
      if (!taskId) return null
      const earliestStartOffsetDays = Number(record.earliestStartOffsetDays)
      if (!Number.isFinite(earliestStartOffsetDays)) return null
      return [taskId, {
        earliestStartOffsetDays,
        earliestFinishOffsetDays: Number.isFinite(Number(record.earliestFinishOffsetDays)) ? Number(record.earliestFinishOffsetDays) : null,
        latestStartOffsetDays: Number.isFinite(Number(record.latestStartOffsetDays)) ? Number(record.latestStartOffsetDays) : null,
        latestFinishOffsetDays: Number.isFinite(Number(record.latestFinishOffsetDays)) ? Number(record.latestFinishOffsetDays) : null,
        floatDays: Number.isFinite(Number(record.floatDays)) ? Number(record.floatDays) : null,
      }] as const
    })
    .filter((entry): entry is readonly [string, {
      earliestStartOffsetDays: number
      earliestFinishOffsetDays: number | null
      latestStartOffsetDays: number | null
      latestFinishOffsetDays: number | null
      floatDays: number | null
    }] => entry !== null))
}

async function rescheduleBaselineItemsWithE3NetworkOrder(params: {
  projectId: string
  taskRows: TaskBaselineTaskRow[]
  items: TaskBaselineItemInput[]
  constructionCalendar?: ConstructionCalendarContext | null
}) {
  if (!params.items.length || !params.taskRows.length) return params.items

  const itemByTaskId = new Map(
    params.items
      .filter((item) => item.source_task_id)
      .map((item) => [String(item.source_task_id), item]),
  )
  const networkTaskRows = params.taskRows.map((task) => {
    const item = itemByTaskId.get(task.id)
    return {
      ...task,
      planned_start_date: item?.planned_start_date ?? task.planned_start_date ?? task.start_date ?? null,
      planned_end_date: item?.planned_end_date ?? task.planned_end_date ?? task.end_date ?? null,
      start_date: item?.planned_start_date ?? task.start_date ?? task.planned_start_date ?? null,
      end_date: item?.planned_end_date ?? task.end_date ?? task.planned_end_date ?? null,
    }
  })

  try {
    const snapshot = await buildProjectCriticalPathSnapshot(params.projectId, networkTaskRows as any, [])
    const orderedTaskIds = getE3TaskOrder(snapshot)
    const scheduleByTaskId = readE3TaskSchedule(snapshot)
    const floatDaysByTaskId = new Map(snapshot.tasks.map((task) => [task.taskId, task.floatDays]))
    const criticalTaskIds = new Set(snapshot.autoTaskIds ?? [])
    const dependencyEdgeCount = (snapshot.edges ?? []).filter((edge) => edge.source === 'dependency').length

    const sortedItems = [...params.items].sort((left, right) => {
      const leftOrder = orderedTaskIds.indexOf(getBaselineItemTaskId(left))
      const rightOrder = orderedTaskIds.indexOf(getBaselineItemTaskId(right))
      if (leftOrder !== rightOrder) {
        return (leftOrder === -1 ? Number.MAX_SAFE_INTEGER : leftOrder) - (rightOrder === -1 ? Number.MAX_SAFE_INTEGER : rightOrder)
      }
      const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
      const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
      if (leftSort !== rightSort) return leftSort - rightSort
      return String(left.title ?? '').localeCompare(String(right.title ?? ''))
    })

    const cpmAnchorCandidates = sortedItems
      .map((item) => {
        const taskId = getBaselineItemTaskId(item)
        const schedule = scheduleByTaskId.get(taskId)
        return schedule && item.planned_start_date
          ? { item, offset: schedule.earliestStartOffsetDays, start: item.planned_start_date }
          : null
      })
      .filter((entry): entry is { item: TaskBaselineItemInput, offset: number, start: string } => entry !== null)
      .sort((left, right) => left.offset - right.offset)
    const cpmAnchorStart = cpmAnchorCandidates[0]?.start ?? null

    let cursorStart: string | null = null
    return sortedItems.map((item, index) => {
      const taskId = String(item.source_task_id ?? '').trim()
      const schedule = taskId ? scheduleByTaskId.get(taskId) ?? null : null
      const floatDays = taskId ? schedule?.floatDays ?? floatDaysByTaskId.get(taskId) ?? null : null
      const durationDays = baselineItemProductionDurationDays(item, params.constructionCalendar)
      const generationMetadata = readRecord(item.generation_metadata)
      const isActualAnchored = generationMetadata.date_source === 'actual_execution'
      const hasActualAnchorWindow = isActualAnchored && Boolean(item.planned_start_date) && Boolean(item.planned_end_date)
      const cpmStart = !hasActualAnchorWindow && cpmAnchorStart && schedule
        ? addConstructionProductionDaysFromText(cpmAnchorStart, Math.max(0, Math.round(schedule.earliestStartOffsetDays)) + 1, params.constructionCalendar)
        : null
      const nextStart = hasActualAnchorWindow
        ? item.planned_start_date ?? null
        : cpmStart ?? (!cursorStart
        ? item.planned_start_date ?? null
        : (isActualAnchored && item.planned_start_date && (compareBaselineDate(item.planned_start_date, cursorStart) ?? 0) >= 0)
            ? item.planned_start_date
            : cursorStart)
      const nextEnd = hasActualAnchorWindow
        ? item.planned_end_date ?? null
        : nextStart
        ? addConstructionProductionDaysFromText(nextStart, durationDays, params.constructionCalendar)
        : item.planned_end_date ?? null
      cursorStart = nextEnd ? nextCalendarDayText(nextEnd) : cursorStart
      const calendarizedPolicy = hasActualAnchorWindow
        ? 'actual_execution_anchor_preserved'
        : schedule
          ? 'cpm_offset_workday_layout_after_b2_anchor'
          : 'network_sequence_workday_layout_after_b2_anchor'
      return {
        ...item,
        planned_start_date: nextStart,
        planned_end_date: nextEnd,
        sort_order: index,
        is_critical: taskId ? criticalTaskIds.has(taskId) : Boolean(item.is_critical),
        is_baseline_critical: taskId ? criticalTaskIds.has(taskId) : Boolean(item.is_baseline_critical),
        generation_metadata: {
          ...generationMetadata,
          e3_network_order: taskId ? orderedTaskIds.indexOf(taskId) : -1,
          e3_float_days: floatDays,
          e3_reschedule_source: 'projectCriticalPathService.buildProjectCriticalPathSnapshot',
          e3_dependency_count: dependencyEdgeCount,
          e3_project_duration_days: snapshot.projectDurationDays,
          e3_critical_path_input_hash: snapshot.networkLineage?.criticalPathInputHash ?? null,
          e3_cpm_earliest_start_offset_days: schedule?.earliestStartOffsetDays ?? null,
          e3_cpm_earliest_finish_offset_days: schedule?.earliestFinishOffsetDays ?? null,
          e3_cpm_latest_start_offset_days: schedule?.latestStartOffsetDays ?? null,
          e3_cpm_latest_finish_offset_days: schedule?.latestFinishOffsetDays ?? null,
          e3_calendarized_start_date: nextStart,
          e3_calendarized_end_date: nextEnd,
          e3_calendarized_duration_days: durationDays,
          e3_calendarized_policy: calendarizedPolicy,
          applied_factors: [
            ...Array.isArray(generationMetadata.applied_factors)
              ? (generationMetadata.applied_factors as unknown[])
              : [],
            taskId ? {
              factor: 'e3_network_order',
              source: 'projectCriticalPathService',
              network_order: orderedTaskIds.indexOf(taskId),
              float_days: floatDays,
            } : null,
            taskId ? {
              factor: 'e3_network_sequence_calendarized',
              source: 'projectCriticalPathService',
              planned_start_date: nextStart,
              planned_end_date: nextEnd,
              policy: calendarizedPolicy,
            } : null,
          ].filter(Boolean),
        },
      }
    })
  } catch (error) {
    logger.warn('[baselineGenerationService] failed to reschedule baseline items with E3 network order', {
      projectId: params.projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return params.items
  }
}

function buildBaselineGenerationSeedVersions(
  currentItem: TaskBaselineItem | undefined,
  dateSource: ResolvedBaselineDraftDates['dateSource'],
) {
  const currentSeedVersions = Array.isArray(currentItem?.seed_versions) ? currentItem.seed_versions : []
  return [
    {
      algorithm: 'baseline_generation',
      version: 'v1.4.7.4',
      dateSource,
      frozenCommitment: false,
      requiresUserReview: true,
      generatedAt: new Date().toISOString(),
    },
    ...currentSeedVersions,
  ]
}

function getLatestBaselineEndDate(items: TaskBaselineItemInput[]) {
  const workItems = items.filter(isBaselineWorkItem)
  if (workItems.length === 0) return null
  const dates = workItems.map((item) => normalizeDateOnlyText(item.planned_end_date ?? null))
  if (dates.some((value) => value === null)) return null
  return (dates as string[]).sort((left, right) => right.localeCompare(left))[0] ?? null
}

function isBaselineWorkItem(item: TaskBaselineItemInput) {
  return item.is_executable !== false && item.is_wbs_summary !== true
}

function compactBaselineTaskText(task: Partial<TaskBaselineTaskRow>) {
  return [
    task.title,
    task.description,
    task.standard_work_name,
    task.standard_work_code,
    task.wbs_node_type,
    task.engineering_category_id,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ')
}

function readMetadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeSeedText(metadata[key])
    if (value) return value
  }
  return null
}

function readMetadataRecord(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readRecord(metadata[key])
    if (Object.keys(value).length > 0) return value
  }
  return {}
}

function readMetadataTextArray(metadata: Record<string, unknown>, keys: string[]) {
  const values: string[] = []
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeSeedText(item)
        if (normalized) values.push(normalized)
      }
      continue
    }
    const normalized = normalizeSeedText(value)
    if (normalized) values.push(normalized)
  }
  return Array.from(new Set(values))
}

function buildTaskSeedScopeContext(task: TaskBaselineTaskRow, metadata: Record<string, unknown>) {
  const featureProfile = {
    ...readMetadataRecord(metadata, ['featureProfile', 'feature_profile']),
  }
  const standardTaskMetadata = readMetadataRecord(metadata, ['standardTaskMetadata', 'standard_task_metadata'])
  const factContext = buildAlgorithmFactContext({
    phase: 'baseline_generation',
    projectGenerationFacts: readProjectGenerationFactsSnapshot(metadata, standardTaskMetadata),
  })
  const projectGenerationFacts = factContext.projectGenerationFacts
  const buildingPatternObservation = {
    ...readMetadataRecord(metadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readMetadataRecord(standardTaskMetadata, ['buildingPatternObservation', 'building_pattern_observation']),
  }
  const projectTypeCode = readMetadataText(projectGenerationFacts, ['businessType'])
    ?? readMetadataText(metadata, ['projectTypeCode', 'project_type_code'])
    ?? readMetadataText(featureProfile, ['projectTypeCode', 'project_type_code'])
    ?? readMetadataText(standardTaskMetadata, ['projectTypeCode', 'project_type_code'])
    ?? readMetadataText(buildingPatternObservation, ['projectTypeCode', 'project_type_code'])
  const structureTypeCode = readMetadataText(projectGenerationFacts, ['structureTypeCode'])
    ?? readMetadataText(metadata, ['structureTypeCode', 'structure_type_code'])
    ?? readMetadataText(featureProfile, ['structureTypeCode', 'structure_type_code'])
    ?? readMetadataText(standardTaskMetadata, ['structureTypeCode', 'structure_type_code'])
    ?? readMetadataText(buildingPatternObservation, ['structureTypeCode', 'structure_type_code'])
  const methodVariantCodes = [
    ...readMetadataTextArray(projectGenerationFacts, ['methodVariantCodes']),
    ...readMetadataTextArray(metadata, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readMetadataTextArray(featureProfile, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readMetadataTextArray(standardTaskMetadata, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
    ...readMetadataTextArray(buildingPatternObservation, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
  ]
  const elementVariantCodes = [
    ...readMetadataTextArray(projectGenerationFacts, ['elementVariantCodes']),
    ...readMetadataTextArray(metadata, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readMetadataTextArray(featureProfile, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readMetadataTextArray(standardTaskMetadata, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
    ...readMetadataTextArray(buildingPatternObservation, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
  ]
  const explicitScopeDimensions = [
    task.building_object_id ? 'building' : null,
    task.basement_object_id ? 'basement' : null,
    task.floor_object_id ? 'floor' : null,
    task.physical_zone_object_id ? 'physical_zone' : null,
    task.functional_area_object_id ? 'functional_area' : null,
    task.section_object_id ? 'section' : null,
    task.engineering_object_id ? 'workface' : null,
  ].filter((item): item is string => Boolean(item))
  const explicitRhythmDrivers = [
    task.floor_object_id ? 'floor_count' : null,
    task.building_object_id ? 'building_count' : null,
    task.physical_zone_object_id ? 'physical_zone_count' : null,
    task.functional_area_object_id ? 'functional_area_count' : null,
    task.section_object_id ? 'section_count' : null,
    task.engineering_object_id ? 'workface_count' : null,
    methodVariantCodes.length > 0 ? 'method_variant' : null,
    task.acceptance_required ? 'acceptance_gate' : null,
    task.material_required ? 'readiness_gate' : null,
    task.participant_unit_id ? 'resource_capacity' : null,
  ].filter((item): item is string => Boolean(item))
  const standardCode = normalizeSeedText(task.standard_work_code).toLowerCase()
  const text = compactBaselineTaskText(task).toLowerCase()
  const inferredScope = buildConstructionSeedScopeContext(task as unknown as Record<string, unknown>, {
    scopeDimensions: explicitScopeDimensions,
  })
  const scopeDimensions = uniqueStringArray([explicitScopeDimensions, inferredScope.scopeDimensions ?? []])
  const rhythmDrivers = uniqueStringArray([explicitRhythmDrivers, inferredScope.rhythmDrivers ?? []])
  const phaseWindow = readMetadataText(metadata, ['phaseWindow', 'phase_window'])
    ?? readMetadataText(buildingPatternObservation, ['phaseWindow', 'phase_window'])
    ?? inferredScope.phaseWindow
    ?? (task.section_object_id || standardCode.startsWith('01') || text.includes('foundation') || text.includes('pile') || text.includes('excavation') ? 'foundation' : null)
    ?? (/^0[5-8]/.test(standardCode) || text.includes('mep') || text.includes('commission') ? 'mep' : null)
    ?? (task.physical_zone_object_id && (standardCode.startsWith('out') || standardCode.startsWith('11') || text.includes('outdoor') || text.includes('landscape')) ? 'outdoor' : null)
    ?? (task.floor_object_id && (standardCode.startsWith('03') || text.includes('decoration')) ? 'decoration' : null)
    ?? (task.floor_object_id ? 'superstructure' : null)
  const primaryWorkfaceType = readMetadataText(metadata, ['primaryWorkfaceType', 'primary_workface_type'])
    ?? readMetadataText(buildingPatternObservation, ['primaryWorkfaceType', 'primary_workface_type'])
    ?? inferredScope.primaryWorkfaceType
    ?? (phaseWindow === 'foundation' ? 'foundation_section' : null)
    ?? (phaseWindow === 'mep' ? 'mep_system_zone' : null)
    ?? (phaseWindow === 'outdoor' ? 'outdoor_zone' : null)
    ?? (phaseWindow === 'decoration' ? 'decoration_room_zone' : null)
    ?? (task.floor_object_id ? 'standard_floor' : null)
    ?? (task.building_object_id ? 'building_zone' : null)
  const expansionStrategy = readMetadataText(metadata, ['expansionStrategy', 'expansion_strategy'])
    ?? readMetadataText(buildingPatternObservation, ['expansionStrategy', 'expansion_strategy'])
    ?? inferredScope.expansionStrategy
    ?? (scopeDimensions.includes('section') ? 'section_ordered' : null)
    ?? (scopeDimensions.includes('system') ? 'system_zone' : null)
    ?? (scopeDimensions.includes('floor') ? 'floor_ordered' : null)
    ?? (scopeDimensions.includes('zone') ? 'zone_ordered' : null)
    ?? (scopeDimensions.includes('building') ? 'building' : null)
  const workEnvironment = inferWorkEnvironment(`${task.title ?? ''} ${task.standard_work_name ?? ''} ${task.standard_work_code ?? ''}`, {
    ...standardTaskMetadata,
    ...buildingPatternObservation,
    phaseWindow,
    primaryWorkfaceType,
  })

  return {
    projectTypeCode,
    structureTypeCode,
    methodVariantCodes: Array.from(new Set(methodVariantCodes)),
    elementVariantCodes: Array.from(new Set(elementVariantCodes)),
    scopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType,
    phaseWindow,
    expansionStrategy,
    workEnvironment,
    algorithmFactContext: summarizeAlgorithmFactContext(factContext),
  }
}

function taskPlanStartDate(task: TaskBaselineTaskRow) {
  return resolveTaskPlanDate(task, 'start')
}

function taskPlanEndDate(task: TaskBaselineTaskRow) {
  return resolveTaskPlanDate(task, 'end')
}

function taskPlanDateKey(task: TaskBaselineTaskRow) {
  return taskPlanStartDate(task) ?? taskPlanEndDate(task) ?? 'undated'
}

function normalizeSeedText(value: unknown) {
  return String(value ?? '').trim()
}

function readFiniteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function uniqueStringArray(values: unknown[]) {
  return Array.from(new Set(values.flatMap((value) => (
    Array.isArray(value)
      ? value.map(normalizeSeedText)
      : normalizeSeedText(value).split(',')
  )).map((item) => item.trim()).filter(Boolean)))
}

async function buildProcessConstraintSeedContext(
  task: TaskBaselineTaskRow,
  metadata: Record<string, unknown>,
  baseContext: Record<string, unknown>,
  text: string,
) {
  let standardWorkCode = normalizeSeedText(task.standard_work_code)
  let standardWorkSource: 'explicit' | 'title_weak_fallback' | 'unresolved' = standardWorkCode ? 'explicit' : 'unresolved'
  let titleWeakScore: number | null = null
  let titleWeakRuleId: string | null = null

  if (!standardWorkCode && text) {
    const weakMatch = (await inferTitleWeakStandardWorkMatchesFromResolver(text, baseContext))[0] as any
    if (weakMatch?.standardWorkCode) {
      standardWorkCode = normalizeSeedText(weakMatch.standardWorkCode)
      standardWorkSource = 'title_weak_fallback'
      titleWeakScore = Number.isFinite(Number(weakMatch.score)) ? Number(weakMatch.score) : null
      titleWeakRuleId = normalizeSeedText(weakMatch.ruleId) || null
    }
  }

  const durationSeed = standardWorkCode
    ? await resolveStandardWorkDurationSeed(text, {
      ...baseContext,
      standardWorkCode,
      standardWorkCodes: [standardWorkCode],
      templateNodeId: task.template_node_id ?? null,
    })
    : null
  const durationSeedRecord = readRecord(durationSeed)

  return {
    ...baseContext,
    standardWorkCode: standardWorkCode || null,
    standardWorkCodes: standardWorkCode ? [standardWorkCode] : [],
    templateNodeId: task.template_node_id ?? null,
    standardWorkSource,
    titleWeakScore,
    titleWeakRuleId,
    standardCatalogCodePrefixes: uniqueStringArray([
      readMetadataTextArray(metadata, ['standardCatalogCodePrefixes', 'standard_catalog_code_prefixes']),
      durationSeedRecord.standardCatalogCodePrefixes,
      durationSeedRecord.standard_catalog_code_prefixes,
    ]),
    templateNodeStableCodePrefixes: uniqueStringArray([
      readMetadataTextArray(metadata, ['templateNodeStableCodePrefixes', 'template_node_stable_code_prefixes']),
      durationSeedRecord.templateNodeStableCodePrefixes,
      durationSeedRecord.template_node_stable_code_prefixes,
    ]),
  }
}

function readTaskWorkflowFact(metadata: Record<string, unknown>) {
  const crossItemWorkflow = readArray(metadata.crossItemWorkflow ?? metadata.cross_item_workflow)
    .map((item) => readRecord(item))
    .find((item) => Object.keys(item).length > 0)
  if (crossItemWorkflow) {
    return {
      source: 'cross_item_workflow',
      lagDays: Math.max(0, Number(crossItemWorkflow.lagDays ?? crossItemWorkflow.lag_days ?? 0)),
    }
  }
  const internalFlow = readRecord(metadata.internalFlow ?? metadata.internal_flow)
  if (Object.keys(internalFlow).length > 0) {
    return {
      source: 'standard_internal_flow',
      lagDays: Math.max(0, Number(internalFlow.lagDays ?? internalFlow.lag_days ?? 0)),
    }
  }
  return null
}

function readWeightedTypicalCycleDays(value: unknown) {
  const record = readRecord(value)
  const firstFloor = readFiniteNumber(record.firstFloor ?? record.first_floor)
  const midFloors = readFiniteNumber(record.midFloors ?? record.mid_floors)
  const lastFloors = readFiniteNumber(record.lastFloors ?? record.last_floors)
  if (!firstFloor && !midFloors && !lastFloors) return null
  return {
    firstFloor: firstFloor ?? 0,
    midFloors: midFloors ?? 0,
    lastFloors: lastFloors ?? 0,
  }
}

function isRecognitionOnlyWorkflowSignal(workflow: unknown) {
  const record = readRecord(workflow)
  return record.runtimeRole === 'recognition_signal'
    || record.runtime_role === 'recognition_signal'
    || record.canCreateDependencies === false
    || record.can_create_dependencies === false
    || record.keywordFallbackOnly === true
    || record.keyword_fallback_only === true
    || record.governanceTarget === 'workflow_dictionary'
    || record.governance_target === 'workflow_dictionary'
}

function readRuntimeWorkflowLagDays(workflow: unknown) {
  if (isRecognitionOnlyWorkflowSignal(workflow)) return 0
  const record = readRecord(workflow)
  const value = Number(record.lagDays ?? record.lag_days ?? 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function readPositiveLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readResourceClassLimitMetadata(resourceClass: Record<string, unknown>) {
  return {
    sameBuildingDailyLimit: readPositiveLimit(resourceClass.sameBuildingDailyLimit ?? resourceClass.same_building_daily_limit),
    sameUnitDailyLimit: readPositiveLimit(resourceClass.sameUnitDailyLimit ?? resourceClass.same_unit_daily_limit),
    sameFloorDailyLimit: readPositiveLimit(resourceClass.sameFloorDailyLimit ?? resourceClass.same_floor_daily_limit),
    sameZoneDailyLimit: readPositiveLimit(resourceClass.sameZoneDailyLimit ?? resourceClass.same_zone_daily_limit),
    sameSystemDailyLimit: readPositiveLimit(resourceClass.sameSystemDailyLimit ?? resourceClass.same_system_daily_limit),
    parallelCapacity: normalizeSeedText(resourceClass.parallelCapacity ?? resourceClass.parallel_capacity) || null,
  }
}

function buildBaselineGateScopeKeys(task: TaskBaselineTaskRow) {
  return {
    building: normalizeSeedText(task.building_object_id) || null,
    floor: normalizeSeedText(task.floor_object_id) || null,
    zone: normalizeSeedText(task.physical_zone_object_id ?? task.functional_area_object_id) || null,
    workface: normalizeSeedText(task.engineering_object_id) || null,
    unit: normalizeSeedText(task.participant_unit_id) || null,
    system: normalizeSeedText(task.functional_area_object_id ?? task.engineering_object_id) || null,
  }
}

function normalizeRcpspPoolScopeValue(value: unknown) {
  return normalizeSeedText(value) || 'global'
}

function buildBaselineRcpspCapacityPoolKey(
  resourceClassCode: string | null,
  scopeKeys: ReturnType<typeof buildBaselineGateScopeKeys>,
) {
  if (!resourceClassCode) return null
  return [
    'rcpsp',
    `resource:${resourceClassCode}`,
    `building:${normalizeRcpspPoolScopeValue(scopeKeys.building)}`,
    `floor:${normalizeRcpspPoolScopeValue(scopeKeys.floor)}`,
    `zone:${normalizeRcpspPoolScopeValue(scopeKeys.zone)}`,
    `workface:${normalizeRcpspPoolScopeValue(scopeKeys.workface)}`,
  ].join('|')
}

function buildBaselineGateProcessScopeKey(task: TaskBaselineTaskRow, processConstraint: Record<string, unknown>) {
  const scopeGranularity = normalizeSeedText(processConstraint.scopeGranularity ?? processConstraint.scope_granularity).toLowerCase()
  const scope = buildBaselineGateScopeKeys(task)
  if (scopeGranularity === 'building') return [scope.building].filter(Boolean).join('|') || 'global'
  if (scopeGranularity === 'floor') return [scope.building, scope.floor].filter(Boolean).join('|') || 'global'
  if (scopeGranularity === 'room' || scopeGranularity === 'zone') return [scope.building, scope.floor, scope.zone].filter(Boolean).join('|') || 'global'
  if (scopeGranularity === 'system') return [scope.building, scope.system].filter(Boolean).join('|') || 'global'
  if (scopeGranularity === 'task') return normalizeSeedText(task.id) || 'global'
  return [scope.building, scope.floor].filter(Boolean).join('|') || [scope.building, scope.zone].filter(Boolean).join('|') || 'global'
}

function readProcessConstraintOverlapAllowed(processConstraint: Record<string, unknown>) {
  if (processConstraint.overlapAllowed === true || processConstraint.overlap_allowed === true) return true
  const partialOverlapRatio = Number(processConstraint.partialOverlapRatio ?? processConstraint.partial_overlap_ratio)
  if (Number.isFinite(partialOverlapRatio) && partialOverlapRatio > 0) return true
  const constraintType = normalizeSeedText(processConstraint.constraintType ?? processConstraint.constraint_type)
  if (constraintType === 'overlap_allowed') return true
  return false
}

async function enrichBaselineItemsWithConfirmationGateMetadata(params: {
  projectId: string
  taskRows: TaskBaselineTaskRow[]
  items: TaskBaselineItemInput[]
} & BaselineConfirmationGateMetadataResolvers): Promise<TaskBaselineItemInput[]> {
  if (!params.items.length || !params.taskRows.length) return params.items
  const taskById = new Map(params.taskRows.map((task) => [task.id, task]))
  const resolveResourceClass = params.resolveResourceClass ?? resolveV1474ResourceClass
  const resolveProcessConstraint = params.resolveProcessConstraint ?? resolveV1474ProcessConstraint

  return Promise.all(params.items.map(async (item) => {
    const taskId = normalizeSeedText(item.source_task_id)
    const task = taskId ? taskById.get(taskId) : null
    if (!task) return item

    const metadata = readRecord(task.standard_task_metadata)
    const text = compactBaselineTaskText(task)
    const seedContext = {
      projectId: params.projectId,
      standardWorkCode: task.standard_work_code ?? null,
      standardWorkCodes: task.standard_work_code ? [task.standard_work_code] : [],
      templateNodeId: task.template_node_id ?? null,
      ...buildTaskSeedScopeContext(task, metadata),
    }
    const processConstraintSeedContext = await buildProcessConstraintSeedContext(task, metadata, seedContext, text)
    const [resourceClassRaw, processConstraintRaw] = await Promise.all([
      resolveResourceClass(text, seedContext),
      resolveProcessConstraint(text, processConstraintSeedContext),
    ])
    const resourceClass = readRecord(resourceClassRaw)
    const processConstraint = readRecord(processConstraintRaw)
    if (Object.keys(resourceClass).length === 0 && Object.keys(processConstraint).length === 0) return item

    const existing = readRecord(item.generation_metadata)
    const appliedFactors = Array.isArray(existing.applied_factors) ? [...existing.applied_factors] : []
    const scopeKeys = buildBaselineGateScopeKeys(task)
    const resourceClassCode = normalizeSeedText(resourceClass.resourceClass ?? resourceClass.resource_class ?? resourceClass.__stableCode)
    const resourceLimits = readResourceClassLimitMetadata(resourceClass)
    const rcpspCapacityPoolKey = buildBaselineRcpspCapacityPoolKey(resourceClassCode || null, scopeKeys)
    if (resourceClassCode) {
      appliedFactors.push({
        factor: 'v1474_resource_class_confirmation_gate',
        source: 'resolveV1474ResourceClass',
        resource_class: resourceClassCode,
        stable_code: normalizeSeedText(resourceClass.__stableCode ?? resourceClass.stableCode ?? resourceClass.stable_code) || null,
      })
    }

    const processStableCode = normalizeSeedText(processConstraint.stableCode ?? processConstraint.stable_code ?? processConstraint.__stableCode)
    if (processStableCode) {
      appliedFactors.push({
        factor: 'v1474_process_constraint_confirmation_gate',
        source: 'v1474ProcessConstraintSeed',
        stable_code: processStableCode,
      })
    }

    return {
      ...item,
      generation_metadata: {
        ...existing,
        scope_keys: {
          ...readRecord(existing.scope_keys ?? existing.scope_key),
          ...scopeKeys,
        },
        ...(resourceClassCode ? {
          resource_class: resourceClassCode,
          resource_limits: resourceLimits,
          resource_class_source: normalizeSeedText(resourceClass.__resolverSource) || null,
          rcpsp_capacity_pool_key: rcpspCapacityPoolKey,
          rcpsp_capacity_pool_key_source: 'projectCriticalPathService.resource_constraint_scope',
          rcpsp_capacity_pool_key_policy: 'resource_class_scope_key_reused_by_monthly_capacity',
          algorithm_context: {
            ...readRecord(existing.algorithm_context),
            rcpsp_capacity_pool_key: rcpspCapacityPoolKey,
            rcpsp_capacity_pool_key_source: 'projectCriticalPathService.resource_constraint_scope',
            rcpsp_capacity_pool_key_policy: 'resource_class_scope_key_reused_by_monthly_capacity',
          },
        } : {}),
        ...(processStableCode ? {
          process_constraint: {
            stableCode: processStableCode,
            source: 'v1474ProcessConstraintSeed',
            overlapAllowed: readProcessConstraintOverlapAllowed(processConstraint),
            scope_key: buildBaselineGateProcessScopeKey(task, processConstraint),
            scopeGranularity: normalizeSeedText(processConstraint.scopeGranularity ?? processConstraint.scope_granularity) || null,
            gateRequired: processConstraint.gateRequired === true || processConstraint.gate_required === true,
          },
        } : {}),
        applied_factors: appliedFactors,
      },
    }
  }))
}

function addResourceLimitBucket(
  buckets: Map<string, { count: number; limit: number }>,
  resourceClass: string,
  dateKey: string,
  dimension: string,
  dimensionId: unknown,
  limit: unknown,
) {
  const normalizedId = normalizeSeedText(dimensionId)
  const normalizedLimit = readPositiveLimit(limit)
  if (!normalizedId || !normalizedLimit) return
  const key = `${resourceClass}:${dateKey}:${dimension}:${normalizedId}`
  const current = buckets.get(key) ?? { count: 0, limit: normalizedLimit }
  current.count += 1
  current.limit = Math.max(1, normalizedLimit)
  buckets.set(key, current)
}

type BaselineDirectSeedMetrics = {
  directSeedSignalCount: number
  buildingPatternSeedMatchCount: number
  buildingPatternHighConfidenceCount: number
  buildingPatternLowConfidenceCount: number
  buildingPatternConfidenceScoreAvg: number
  buildingPatternControlChainCount: number
  buildingPatternDurationCurveProfileCount: number
  buildingPatternWeightedCycleDayCount: number
  buildingPatternWeightedFirstFloorDaysAvg: number
  buildingPatternWeightedMidFloorsDaysAvg: number
  buildingPatternWeightedLastFloorsDaysAvg: number
  buildingPatternMergedStaggerRuleCount: number
  buildingPatternStaggerContributionCount: number
  buildingPatternHardDeadlineMatchCount: number
  buildingPatternPriorityAvg: number
  workflowSeedMatchCount: number
  workflowLagDayCount: number
  resourceClassSeedMatchCount: number
  resourceConflictSeedCount: number
  seasonalSeedAdjustmentCount: number
  processConstraintSeedMatchCount: number
}

async function getDirectSeedMetrics(taskRows: TaskBaselineTaskRow[]): Promise<BaselineDirectSeedMetrics> {
  const activeTasks = taskRows
    .filter((task) => task.is_executable !== false && task.is_wbs_summary !== true && !isClosedExecutionTask(task))
    .slice(0, 200)
  const projectId = activeTasks.find((task) => task.project_id)?.project_id ?? null
  const context = { projectId }
  const climateRegion = await resolveProjectClimateRegion(projectId)
  const resourceBuckets = new Map<string, { count: number; limit: number }>()
  const holidayCalendarByYear = new Map<number, boolean>()
  const metrics: BaselineDirectSeedMetrics = {
    directSeedSignalCount: 0,
    buildingPatternSeedMatchCount: 0,
    buildingPatternHighConfidenceCount: 0,
    buildingPatternLowConfidenceCount: 0,
    buildingPatternConfidenceScoreAvg: 0,
    buildingPatternControlChainCount: 0,
    buildingPatternDurationCurveProfileCount: 0,
    buildingPatternWeightedCycleDayCount: 0,
    buildingPatternWeightedFirstFloorDaysAvg: 0,
    buildingPatternWeightedMidFloorsDaysAvg: 0,
    buildingPatternWeightedLastFloorsDaysAvg: 0,
    buildingPatternMergedStaggerRuleCount: 0,
    buildingPatternStaggerContributionCount: 0,
    buildingPatternHardDeadlineMatchCount: 0,
    buildingPatternPriorityAvg: 0,
    workflowSeedMatchCount: 0,
    workflowLagDayCount: 0,
    resourceClassSeedMatchCount: 0,
    resourceConflictSeedCount: 0,
    seasonalSeedAdjustmentCount: 0,
    processConstraintSeedMatchCount: 0,
  }
  let buildingPatternWeightTotal = 0

  for (const task of activeTasks) {
    const text = compactBaselineTaskText(task)
    const metadata = readRecord(task.standard_task_metadata)
    const seedContext = {
      ...context,
      standardWorkCode: task.standard_work_code ?? null,
      standardWorkCodes: task.standard_work_code ? [task.standard_work_code] : [],
      templateNodeId: task.template_node_id ?? null,
      ...buildTaskSeedScopeContext(task, metadata),
    }
    const processConstraintSeedContext = await buildProcessConstraintSeedContext(task, metadata, seedContext, text)
    const startDate = parseBaselineDate(taskPlanStartDate(task) ?? taskPlanEndDate(task))
    const plannedDate = startDate ? startDate.toISOString().slice(0, 10) : null
    const year = startDate ? startDate.getUTCFullYear() : null
    const month = startDate ? startDate.getUTCMonth() + 1 : null
    const seasonalRegion = deriveV1474SeasonalProductivityRegion({
      thermalZone: climateRegion.thermalZone,
      regionCode: climateRegion.regionCode,
      climateTags: climateRegion.climateTags,
      location: climateRegion.location,
    })
    if (year && !holidayCalendarByYear.has(year)) {
      holidayCalendarByYear.set(year, await hasV1474WorkCalendarForYear(year, context))
    }
    const hasHolidayCalendar = year ? holidayCalendarByYear.get(year) === true : false
    const workflowFact = readTaskWorkflowFact(metadata)
    const [workflow, buildingPatternMatches, resourceClass, processConstraint, seasonal, holiday] = await Promise.all([
      Promise.resolve(workflowFact),
      resolveV1474BuildingPatternMatches(text, seedContext),
      resolveV1474ResourceClass(text, seedContext),
      resolveV1474ProcessConstraint(text, processConstraintSeedContext),
      month ? resolveV1474SeasonalProductivity(seasonalRegion, month, seedContext) : Promise.resolve(null),
      month && year && hasHolidayCalendar
        ? resolveV1474HolidayWindow({ date: plannedDate, year, month }, seedContext)
        : Promise.resolve(null),
    ])

    if (workflow) {
      metrics.workflowSeedMatchCount += 1
      metrics.workflowLagDayCount += readRuntimeWorkflowLagDays(workflow)
    }
    const weightedCycleDays = buildingPatternMatches
      .map((match) => readWeightedTypicalCycleDays(match.weightedTypicalCycleDays))
      .find((item): item is NonNullable<typeof item> => Boolean(item))
    if (weightedCycleDays) {
      metrics.buildingPatternWeightedCycleDayCount += 1
      metrics.buildingPatternWeightedFirstFloorDaysAvg += weightedCycleDays.firstFloor
      metrics.buildingPatternWeightedMidFloorsDaysAvg += weightedCycleDays.midFloors
      metrics.buildingPatternWeightedLastFloorsDaysAvg += weightedCycleDays.lastFloors
    }
    const mergedStaggerRules = buildingPatternMatches
      .map((match) => Array.isArray(match.mergedStaggerRules) ? match.mergedStaggerRules : [])
      .find((items) => items.length > 0) ?? []
    const staggerRuleContributions = buildingPatternMatches
      .map((match) => Array.isArray(match.staggerRuleContributions) ? match.staggerRuleContributions : [])
      .find((items) => items.length > 0) ?? []
    metrics.buildingPatternMergedStaggerRuleCount += mergedStaggerRules.length
    metrics.buildingPatternStaggerContributionCount += staggerRuleContributions.reduce((sum, contribution) => (
      sum + readArray(readRecord(contribution).staggerRules).length
    ), 0)
    if (buildingPatternMatches.some((match) => Number(match.hardDeadlinePriority ?? 0) > 0)) {
      metrics.buildingPatternHardDeadlineMatchCount += 1
    }
    for (const buildingPatternMatch of buildingPatternMatches) {
      if (!buildingPatternMatch.record) continue
      const matchWeight = Math.max(0.01, Number(buildingPatternMatch.matchWeight ?? 1) || 1)
      buildingPatternWeightTotal += matchWeight
      metrics.buildingPatternSeedMatchCount += 1
      if (buildingPatternMatch.confidenceLevel === 'high') metrics.buildingPatternHighConfidenceCount += 1
      if (buildingPatternMatch.confidenceLevel === 'low') metrics.buildingPatternLowConfidenceCount += 1
      metrics.buildingPatternConfidenceScoreAvg += buildingPatternMatch.confidenceScore * matchWeight
      const record = readRecord(buildingPatternMatch.record)
      const controlChains = readArray(record.controlChains ?? record.control_chains)
      if (controlChains.length > 0) metrics.buildingPatternControlChainCount += controlChains.length
      if (Object.keys(readRecord(record.durationCurveProfile ?? record.duration_curve_profile)).length > 0) {
        metrics.buildingPatternDurationCurveProfileCount += 1
      }
      metrics.buildingPatternPriorityAvg += (Number(record.patternPriority ?? record.pattern_priority ?? 0) || 0) * matchWeight
    }
    if (resourceClass) {
      metrics.resourceClassSeedMatchCount += 1
      const resource = resourceClass as any
      const resourceKey = normalizeSeedText(resource.resourceClass || resource.__stableCode)
      const dateKey = taskPlanDateKey(task)
      addResourceLimitBucket(resourceBuckets, resourceKey, dateKey, 'building', task.building_object_id, resource.sameBuildingDailyLimit)
      addResourceLimitBucket(resourceBuckets, resourceKey, dateKey, 'unit', task.participant_unit_id, resource.sameUnitDailyLimit)
      addResourceLimitBucket(resourceBuckets, resourceKey, dateKey, 'floor', task.floor_object_id, resource.sameFloorDailyLimit)
      addResourceLimitBucket(resourceBuckets, resourceKey, dateKey, 'physical_zone', task.physical_zone_object_id, resource.sameZoneDailyLimit ?? resource.same_zone_daily_limit ?? resource.sameFloorDailyLimit)
      addResourceLimitBucket(resourceBuckets, resourceKey, dateKey, 'functional_area', task.functional_area_object_id, resource.sameFunctionalAreaDailyLimit ?? resource.same_functional_area_daily_limit ?? resource.sameZoneDailyLimit ?? resource.sameFloorDailyLimit)
    }
    if (processConstraint) metrics.processConstraintSeedMatchCount += 1
    if (
      (seasonal && Number((seasonal as any).productivity ?? 1) < 0.98)
      || (holiday && Number((holiday as any).productivity ?? 1) < 0.98)
    ) {
      metrics.seasonalSeedAdjustmentCount += 1
    }
  }

  metrics.resourceConflictSeedCount = [...resourceBuckets.values()].filter((bucket) => bucket.count > bucket.limit).length
  metrics.buildingPatternConfidenceScoreAvg = buildingPatternWeightTotal > 0
    ? Math.round(metrics.buildingPatternConfidenceScoreAvg / buildingPatternWeightTotal)
    : 0
  metrics.buildingPatternPriorityAvg = buildingPatternWeightTotal > 0
    ? Math.round(metrics.buildingPatternPriorityAvg / buildingPatternWeightTotal)
    : 0
  if (metrics.buildingPatternWeightedCycleDayCount > 0) {
    metrics.buildingPatternWeightedFirstFloorDaysAvg = Number((metrics.buildingPatternWeightedFirstFloorDaysAvg / metrics.buildingPatternWeightedCycleDayCount).toFixed(2))
    metrics.buildingPatternWeightedMidFloorsDaysAvg = Number((metrics.buildingPatternWeightedMidFloorsDaysAvg / metrics.buildingPatternWeightedCycleDayCount).toFixed(2))
    metrics.buildingPatternWeightedLastFloorsDaysAvg = Number((metrics.buildingPatternWeightedLastFloorsDaysAvg / metrics.buildingPatternWeightedCycleDayCount).toFixed(2))
  }
  metrics.directSeedSignalCount =
    metrics.buildingPatternSeedMatchCount
    + metrics.workflowSeedMatchCount
    + metrics.resourceClassSeedMatchCount
    + metrics.resourceConflictSeedCount
    + metrics.seasonalSeedAdjustmentCount
    + metrics.processConstraintSeedMatchCount
  return metrics
}

function buildDirectSeedBusinessReasons(metrics: BaselineDirectSeedMetrics): PlanningBusinessReason[] {
  const reasons: PlanningBusinessReason[] = []
  if (metrics.buildingPatternSeedMatchCount > 0 || metrics.workflowSeedMatchCount > 0) {
    reasons.push({
      code: 'v1474_site_rhythm_seed',
      label: 'Site rhythm seed matched',
      detail: `${metrics.buildingPatternSeedMatchCount} building rhythm match(es) and ${metrics.workflowSeedMatchCount} workflow sequence match(es) were consumed by baseline generation.`,
      severity: 'info',
    })
  }
  if (metrics.resourceConflictSeedCount > 0) {
    reasons.push({
      code: 'v1474_resource_conflict_seed',
      label: 'Site capacity pressure signal matched',
      detail: `${metrics.resourceConflictSeedCount} site capacity pressure signal(s) were detected from overlapping schedule facts and resource class seeds.`,
      severity: 'warning',
    })
  }
  if (metrics.seasonalSeedAdjustmentCount > 0 || metrics.processConstraintSeedMatchCount > 0) {
    reasons.push({
      code: 'v1474_duration_constraint_seed',
      label: 'Duration constraint seed matched',
      detail: `${metrics.seasonalSeedAdjustmentCount} seasonal window match(es) and ${metrics.processConstraintSeedMatchCount} hard process constraint match(es) were consumed.`,
      severity: 'info',
    })
  }
  return reasons
}

export function buildGeneratedBaselineItemsFromTasksV1474(
  tasks: TaskBaselineTaskRow[],
  currentBaselineItems: TaskBaselineItem[],
  criticalTaskIds: Set<string> = new Set(),
  options: BaselineGenerationDateOptions = {},
): TaskBaselineItemInput[] {
  const activeTasks = tasks.filter((task) => !isClosedExecutionTask(task))
  const currentByTaskId = new Map(
    currentBaselineItems
      .filter((item) => item.source_task_id)
      .map((item) => [item.source_task_id as string, item]),
  )
  const generatedItemIdByTaskId = new Map(activeTasks.map((task) => [task.id, uuidv4()]))

  return activeTasks.map((task, index) => {
    const currentItem = currentByTaskId.get(task.id)
    const isCritical = criticalTaskIds.has(task.id)
    const resolvedDates = resolveBaselineDraftDates(task, options)
    const plannedStartDate = resolvedDates.plannedStartDate
    const plannedEndDate = resolvedDates.plannedEndDate
    const parentItemId = task.parent_id ? generatedItemIdByTaskId.get(task.parent_id) ?? null : null
    const isNewTask = !currentItem
    const dateChanged = Boolean(
      currentItem &&
      (currentItem.planned_start_date !== plannedStartDate || currentItem.planned_end_date !== plannedEndDate),
    )

    return {
      id: generatedItemIdByTaskId.get(task.id),
      parent_item_id: parentItemId,
      source_task_id: task.id,
      source_milestone_id: null,
      template_id: task.template_id ?? currentItem?.template_id ?? null,
      template_node_id: task.template_node_id ?? currentItem?.template_node_id ?? null,
      engineering_category_id: task.engineering_category_id ?? currentItem?.engineering_category_id ?? null,
      wbs_node_type: task.wbs_node_type ?? currentItem?.wbs_node_type ?? null,
      wbs_path: task.wbs_path ?? currentItem?.wbs_path ?? null,
      is_wbs_summary: task.is_wbs_summary ?? currentItem?.is_wbs_summary ?? null,
      is_executable: task.is_executable ?? currentItem?.is_executable ?? null,
      standard_work_code: task.standard_work_code ?? currentItem?.standard_work_code ?? null,
      standard_work_name: task.standard_work_name ?? currentItem?.standard_work_name ?? null,
      duration_calibration_source: task.duration_calibration_source
        ?? currentItem?.duration_calibration_source
        ?? resolvedDates.durationCalibrationSource
        ?? null,
      duration_provenance: task.duration_provenance
        ?? currentItem?.duration_provenance
        ?? resolvedDates.durationProvenance
        ?? null,
      title: task.title || currentItem?.title || `Construction task ${index + 1}`,
      planned_start_date: plannedStartDate,
      planned_end_date: plannedEndDate,
      target_progress: null,
      sort_order: Number.isFinite(Number(task.sort_order)) ? Number(task.sort_order) : index,
      is_milestone: Boolean(task.is_milestone ?? currentItem?.is_milestone),
      is_critical: isCritical,
      is_baseline_critical: isCritical,
      mapping_status: isNewTask ? 'pending' : 'mapped',
      source_chip: isNewTask ? 'new' : 'site',
      source_reason: resolvedDates.dateSource !== 'current_schedule'
        ? resolvedDates.sourceReason
        : isNewTask
          ? 'New task from current task list.'
          : dateChanged
            ? 'Dates updated from current task schedule.'
            : currentItem?.source_reason ?? resolvedDates.sourceReason,
      notes: isNewTask
        ? 'System suggestion: current task list has new construction tasks and they were added to the new baseline draft.'
        : dateChanged
          ? 'System suggestion: planned dates were updated from the current task schedule.'
          : currentItem?.notes ?? null,
      snapshot_source: 'current_execution_fact',
      snapshot_captured_at: new Date().toISOString(),
      seed_versions: buildBaselineGenerationSeedVersions(currentItem, resolvedDates.dateSource),
      manual_override_fields: currentItem?.manual_override_fields ?? {},
      generation_metadata: buildBaselineGenerationProvenanceMetadata(resolvedDates, options, currentItem),
    }
  })
}

function buildBaselineDiffItems(sourceItems: TaskBaselineItemInput[], candidateItems: TaskBaselineItemInput[]): BaselineDiffItem[] {
  const sourceByKey = new Map(sourceItems.map((item) => [getBaselineCompareKey(item as TaskBaselineItem), item]))
  const candidateByKey = new Map(candidateItems.map((item) => [getBaselineCompareKey(item as TaskBaselineItem), item]))
  const items: BaselineDiffItem[] = []

  for (const candidate of candidateItems) {
    const key = getBaselineCompareKey(candidate as TaskBaselineItem)
    const source = sourceByKey.get(key)
    if (!source) {
      items.push({
        id: String(candidate.id ?? key),
        rowId: String(candidate.id ?? ''),
        kind: 'added',
        title: candidate.title ?? 'Untitled row',
        before: '-',
        after: candidate.planned_end_date ?? candidate.planned_start_date ?? '-',
        note: 'New task is not included in the current baseline.',
      })
      continue
    }

    const changed = (
      source.title !== candidate.title ||
      source.planned_start_date !== candidate.planned_start_date ||
      source.planned_end_date !== candidate.planned_end_date ||
      source.target_progress !== candidate.target_progress ||
      source.mapping_status !== candidate.mapping_status ||
      source.is_critical !== candidate.is_critical
    )
    const milestoneChanged = Boolean(source.is_milestone || candidate.is_milestone)
      && source.planned_end_date !== candidate.planned_end_date

    if (changed || milestoneChanged) {
      items.push({
        id: String(candidate.id ?? key),
        rowId: String(candidate.id ?? ''),
        kind: milestoneChanged ? 'milestone_changed' : 'modified',
        title: candidate.title ?? source.title ?? 'Untitled row',
        before: `${source.planned_start_date ?? '-'} ~ ${source.planned_end_date ?? '-'}`,
        after: `${candidate.planned_start_date ?? '-'} ~ ${candidate.planned_end_date ?? '-'}`,
        note: milestoneChanged ? 'Milestone date changed.' : 'Planning row changed.',
      })
    }
  }

  for (const source of sourceItems) {
    const key = getBaselineCompareKey(source as TaskBaselineItem)
    if (candidateByKey.has(key)) continue
    items.push({
      id: String(source.id ?? key),
      rowId: String(source.id ?? ''),
      kind: 'removed',
      title: source.title ?? 'Untitled row',
      before: `${source.planned_start_date ?? '-'} ~ ${source.planned_end_date ?? '-'}`,
      after: '-',
      note: 'Baseline row no longer maps to an active task.',
    })
  }

  return items
}

function buildBaselineDiffCounts(items: BaselineDiffItem[]) {
  const counts = {
    total: items.length,
    added: 0,
    modified: 0,
    removed: 0,
    milestone_changed: 0,
  }
  for (const item of items) {
    counts[item.kind] += 1
  }
  return counts
}

function getBaselineMilestoneMaxShiftDays(sourceItems: TaskBaselineItemInput[], candidateItems: TaskBaselineItemInput[]) {
  const sourceByKey = new Map(
    sourceItems
      .filter((item) => item.is_milestone)
      .map((item) => [getBaselineCompareKey(item as TaskBaselineItem), item]),
  )

  let comparedMilestoneCount = 0
  let maxShiftDays = 0
  for (const item of candidateItems.filter((candidate) => candidate.is_milestone)) {
    const source = sourceByKey.get(getBaselineCompareKey(item as TaskBaselineItem))
    if (!source) continue
    const sourceDate = normalizeDateOnlyText(source.planned_end_date ?? null)
    const candidateDate = normalizeDateOnlyText(item.planned_end_date ?? null)
    if (!sourceDate || !candidateDate) return null
    const shiftDays = signedDurationDayDelta(sourceDate, candidateDate)
    if (shiftDays === null) return null
    comparedMilestoneCount += 1
    maxShiftDays = Math.max(maxShiftDays, Math.abs(shiftDays))
  }
  return comparedMilestoneCount > 0 ? maxShiftDays : null
}

type ForecastMetrics = {
  forecastDelayedCount: number
  maxForecastDelayDays: number
  lowConfidenceReasonCount: number
  durationSeedFactorCount: number
}

type CachedDurationForecastRow = {
  task_id?: string | null
  forecast_delay_days?: number | string | null
  forecast_finish_date?: string | null
  remaining_duration_days?: number | string | null
  confidence_level?: string | null
  duration_calibration_source?: string | null
  duration_provenance?: string | null
  factor_summary?: unknown
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

function emptyForecastMetrics(lowConfidenceReasonCount = 0): ForecastMetrics {
  return {
    forecastDelayedCount: 0,
    maxForecastDelayDays: 0,
    lowConfidenceReasonCount,
    durationSeedFactorCount: 0,
  }
}

function getExecutableTaskIdsForBaselineGeneration(taskRows: TaskBaselineTaskRow[], limit = 100) {
  return taskRows
    .filter((task) => task.is_executable !== false && task.is_wbs_summary !== true && !isClosedExecutionTask(task))
    .map((task) => task.id)
    .filter(Boolean)
    .slice(0, limit)
}

function readForecastFactorSummary(value: unknown): { factors?: Array<Record<string, unknown>> } | null {
  if (!value) return null
  if (typeof value === 'object') return value as { factors?: Array<Record<string, unknown>> }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? parsed as { factors?: Array<Record<string, unknown>> }
      : null
  } catch {
    return null
  }
}

function summarizeCachedForecastRows(rows: CachedDurationForecastRow[]): ForecastMetrics {
  return rows.reduce((summary, forecast) => {
    const delay = Number(forecast.forecast_delay_days ?? 0)
    if (delay > 0) {
      summary.forecastDelayedCount += 1
      summary.maxForecastDelayDays = Math.max(summary.maxForecastDelayDays, delay)
    }
    if (normalizeLower(forecast.confidence_level) === 'low') {
      summary.lowConfidenceReasonCount += 1
    }
    const factorSummary = readForecastFactorSummary(forecast.factor_summary)
    const seedFactors = Array.isArray(factorSummary?.factors)
      ? factorSummary.factors.filter((factor) => factor.source === 'v1.4.7.4_seed')
      : []
    summary.durationSeedFactorCount += seedFactors.length
    return summary
  }, emptyForecastMetrics())
}

async function loadLatestForecastsByTaskId(taskRows: TaskBaselineTaskRow[]) {
  const executableTaskIds = getExecutableTaskIdsForBaselineGeneration(taskRows)

  if (executableTaskIds.length === 0) {
    return new Map<string, CachedDurationForecastRow>()
  }

  try {
    const { data, error } = await supabase
      .from('task_duration_forecasts')
      .select('task_id, forecast_delay_days, forecast_finish_date, remaining_duration_days, confidence_level, duration_calibration_source, duration_provenance, factor_summary, generated_at, created_at, is_current')
      .in('task_id', executableTaskIds)
      .order('is_current', { ascending: false })
      .order('generated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(executableTaskIds.length * 3)
    if (error) throw error

    const latestByTaskId = new Map<string, CachedDurationForecastRow>()
    for (const row of (data ?? []) as CachedDurationForecastRow[]) {
      const taskId = normalizeText(row.task_id)
      if (taskId && !latestByTaskId.has(taskId)) {
        latestByTaskId.set(taskId, row)
      }
    }

    return latestByTaskId
  } catch (error) {
    logger.warn('[baselineGenerationService] cached duration forecast unavailable for baseline candidate', { error })
    return new Map<string, CachedDurationForecastRow>()
  }
}

async function getForecastMetrics(taskRows: TaskBaselineTaskRow[]) {
  const executableTaskIds = getExecutableTaskIdsForBaselineGeneration(taskRows)

  if (executableTaskIds.length === 0) {
    return { forecastDelayedCount: 0, maxForecastDelayDays: 0, lowConfidenceReasonCount: 0, durationSeedFactorCount: 0 }
  }

  const latestByTaskId = await loadLatestForecastsByTaskId(taskRows)
  if (latestByTaskId.size === 0) {
    return emptyForecastMetrics(1)
  }
  return summarizeCachedForecastRows([...latestByTaskId.values()])
}

type BaselineProjectFactMetrics = {
  dependencyEdgeCount: number
  criticalTaskCount: number
  keyNodeSnapshotCount: number
  keyNodeImpactedTaskCount: number
  requiredDependencyCount: number
  inferredDependencyCount: number
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
  monthlyCommitmentCount: number
  monthlyCarryoverCount: number
  missingPlanDateCount: number
  suggestedDurationCount: number
  unavailableDurationSuggestionCount: number
  healthRiskSignalCount: number
  lowConfidenceReasonCount: number
}

const EMPTY_PROJECT_FACT_METRICS: BaselineProjectFactMetrics = {
  dependencyEdgeCount: 0,
  criticalTaskCount: 0,
  keyNodeSnapshotCount: 0,
  keyNodeImpactedTaskCount: 0,
  requiredDependencyCount: 0,
  inferredDependencyCount: 0,
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
  monthlyCommitmentCount: 0,
  monthlyCarryoverCount: 0,
  missingPlanDateCount: 0,
  suggestedDurationCount: 0,
  unavailableDurationSuggestionCount: 0,
  healthRiskSignalCount: 0,
  lowConfidenceReasonCount: 0,
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
    logger.debug('[baselineGenerationService] optional baseline input table unavailable', { table, error })
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
  const text = normalizeText(value)
  if (!text) return false
  const date = parseBaselineDate(text)
  if (!date) return false
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  return date.getTime() < todayDate.getTime()
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

function readGovernedDurationSuggestionDays(
  suggestion: unknown,
  calendar?: ConstructionCalendarContext | null,
  expectedAsOfDate?: string | null,
) {
  const record = readRecord(suggestion)
  const outputCode = normalizeText(record.durationOutputCode)
  let value: unknown = null
  if (outputCode === 'contextual_reference') {
    value = record.contextualReferenceDays
  } else if (outputCode === 'plan_reference') {
    value = record.planReferenceDays
  } else if (outputCode === 'remaining_forecast') {
    const metric = normalizeDurationMetricDto(record.remainingDuration)
    if (
      !metric
      || metric.availability !== 'available'
      || metric.unit !== 'construction_production_day'
      || !isAuthoritativeConstructionCalendar(calendar)
      || metric.calendarRef !== calendar.calendarRef
      || metric.calendarVersion !== calendar.calendarVersion
      || metric.timezone !== calendar.timezone
      || metric.asOf !== normalizeDateOnlyText(expectedAsOfDate)
    ) return null
    value = metric.value
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

async function loadMissingDateDurationSuggestions(
  taskRows: TaskBaselineTaskRow[],
  options?: {
    runtimeEvidenceMode?: 'record' | 'no_write'
    constructionCalendar?: ConstructionCalendarContext | null
    durationAsOfDate?: string | null
  },
) {
  const missingDateTasks = taskRows
    .filter((task) => task.is_executable !== false && task.is_wbs_summary !== true && !isClosedExecutionTask(task))
    .filter((task) => !taskPlanStartDate(task) || !taskPlanEndDate(task))
    .slice(0, 30)

  if (missingDateTasks.length === 0) {
    return {
      metrics: { missingPlanDateCount: 0, suggestedDurationCount: 0, unavailableDurationSuggestionCount: 0 },
      durationSuggestionByTaskId: new Map<string, BaselineDurationSuggestion>(),
    }
  }

  const results = await Promise.allSettled(missingDateTasks.map((task) => getTaskDurationSuggestion({
    suggestionPurpose: 'new_task_reference',
    taskId: task.id,
    projectId: task.project_id,
    templateNodeId: task.template_node_id,
    engineeringCategoryId: task.engineering_category_id,
    wbsNodeType: task.wbs_node_type,
    standardWorkCode: task.standard_work_code,
    standardWorkName: task.standard_work_name,
    taskTitle: task.title,
    engineeringObjectId: task.engineering_object_id,
    buildingObjectId: task.building_object_id,
    floorObjectId: task.floor_object_id,
    zoneObjectId: task.physical_zone_object_id ?? task.functional_area_object_id,
    plannedStartDate: taskPlanStartDate(task),
    plannedEndDate: taskPlanEndDate(task),
    workCalendar: options?.constructionCalendar,
    progress: task.progress,
    responsibleUnitId: task.participant_unit_id,
    acceptanceRequired: task.acceptance_required,
    materialRequired: task.material_required,
    runtimeEvidenceMode: options?.runtimeEvidenceMode,
  })))

  const durationSuggestionByTaskId = new Map<string, BaselineDurationSuggestion>()
  const metrics = results.reduce((summary, result, index) => {
    const task = missingDateTasks[index]
    if (result.status === 'fulfilled' && readGovernedDurationSuggestionDays(
      result.value,
      options?.constructionCalendar,
      options?.durationAsOfDate,
    ) != null) {
      summary.suggestedDurationCount += 1
      durationSuggestionByTaskId.set(task.id, result.value as BaselineDurationSuggestion)
      if (['low', 'unavailable'].includes(result.value.confidenceLevel)) {
        summary.unavailableDurationSuggestionCount += 1
      }
    } else {
      summary.unavailableDurationSuggestionCount += 1
    }
    return summary
  }, {
    missingPlanDateCount: missingDateTasks.length,
    suggestedDurationCount: 0,
    unavailableDurationSuggestionCount: 0,
  })

  return {
    metrics,
    durationSuggestionByTaskId,
  }
}

async function getMissingDateDurationSuggestionMetrics(
  taskRows: TaskBaselineTaskRow[],
  options: BaselineGenerationDateOptions = {},
) {
  if (options.durationSuggestionMetrics) return options.durationSuggestionMetrics
  return (await loadMissingDateDurationSuggestions(taskRows, {
    constructionCalendar: options.constructionCalendar,
    durationAsOfDate: options.durationAsOfDate,
  })).metrics
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
    logger.debug('[baselineGenerationService] health deviation summary unavailable for baseline generation', { projectId, error })
    return { healthRiskSignalCount: 0, lowConfidenceReasonCount: 1 }
  }
}

function buildProjectFactBusinessReasons(metrics: BaselineProjectFactMetrics): PlanningBusinessReason[] {
  const reasons: PlanningBusinessReason[] = []

  if (metrics.requiredDependencyCount > 0) {
    reasons.push({
      code: 'dependency_graph_input',
      label: 'Task dependency graph considered',
      detail: `${metrics.requiredDependencyCount} required predecessor relation(s) were considered in the baseline candidate.`,
      severity: metrics.requiredDependencyCount >= 10 ? 'warning' : 'info',
    })
  }

  if (metrics.keyNodeSnapshotCount > 0) {
    reasons.push({
      code: 'key_node_snapshot_input',
      label: 'Key nodes considered',
      detail: `${metrics.keyNodeSnapshotCount} key node snapshot(s) and ${metrics.keyNodeImpactedTaskCount} linked task(s) were considered.`,
      severity: metrics.keyNodeImpactedTaskCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.unsatisfiedConditionCount > 0 || metrics.activeObstacleCount > 0) {
    reasons.push({
      code: 'start_condition_obstacle_input',
      label: 'Start conditions and obstacles considered',
      detail: `${metrics.unsatisfiedConditionCount} unsatisfied start condition(s) and ${metrics.activeObstacleCount} active obstacle(s) may affect baseline confidence.`,
      severity: metrics.blockingConditionCount + metrics.blockingObstacleCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.drawingLinkCount > 0 || metrics.materialLinkCount > 0 || metrics.acceptancePendingCount > 0) {
    reasons.push({
      code: 'execution_linkage_input',
      label: 'Execution linkage considered',
      detail: `${metrics.drawingLinkCount} drawing link(s), ${metrics.materialLinkCount} material link(s), and ${metrics.acceptancePendingCount} pending acceptance item(s) were considered.`,
      severity: metrics.materialAttentionCount > 0 || metrics.acceptancePendingCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.openRiskCount > 0 || metrics.openIssueCount > 0 || metrics.activeWarningCount > 0) {
    reasons.push({
      code: 'risk_issue_warning_input',
      label: 'Risk, issue and warning signals considered',
      detail: `${metrics.openRiskCount} open risk(s), ${metrics.openIssueCount} open issue(s), and ${metrics.activeWarningCount} active warning(s) were considered.`,
      severity: metrics.criticalExternalSignalCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.monthlyCommitmentCount > 0 || metrics.monthlyCarryoverCount > 0) {
    reasons.push({
      code: 'monthly_fulfillment_input',
      label: 'Monthly commitment context considered',
      detail: `${metrics.monthlyCommitmentCount} monthly commitment row(s) and ${metrics.monthlyCarryoverCount} carryover row(s) were considered.`,
      severity: metrics.monthlyCarryoverCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.missingPlanDateCount > 0) {
    reasons.push({
      code: 'duration_suggestion_input',
      label: 'Duration suggestion used for missing dates',
      detail: `${metrics.missingPlanDateCount} task(s) have missing plan dates; ${metrics.suggestedDurationCount} received duration suggestions without overwriting dates.`,
      severity: metrics.unavailableDurationSuggestionCount > 0 ? 'warning' : 'info',
    })
  }

  if (metrics.healthRiskSignalCount > 0) {
    reasons.push({
      code: 'health_deviation_input',
      label: 'Project health and deviation considered',
      detail: `${metrics.healthRiskSignalCount} project health/deviation signal(s) were considered in the recommendation.`,
      severity: 'warning',
    })
  }

  return reasons
}

async function getProjectFactMetrics(
  projectId: string,
  taskRows: TaskBaselineTaskRow[],
  criticalTaskIds: Set<string> = new Set(),
  dateOptions: BaselineGenerationDateOptions = {},
): Promise<BaselineProjectFactMetrics> {
  const taskIds = new Set(taskRows.map((task) => task.id).filter(Boolean))
  if (!projectId || taskIds.size === 0) return { ...EMPTY_PROJECT_FACT_METRICS }

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
    monthlyPlanItems,
    durationSuggestionMetrics,
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
    safeSelectProjectRows('monthly_plan_items', projectId),
    getMissingDateDurationSuggestionMetrics(taskRows, dateOptions),
    getHealthRiskMetrics(projectId),
  ])

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
  const monthlyRows = monthlyPlanItems.filter((row) => {
    const taskId = normalizeText(row.source_task_id ?? row.task_id)
    return taskId && taskIds.has(taskId) && !isInactiveStatus(row.commitment_status)
  })

  const linkedMaterialIds = new Set(
    activeLinks
      .filter((row) => ['project_material', 'material'].includes(normalizeLower(row.source_entity_type)))
      .map((row) => normalizeText(row.source_entity_id))
      .filter(Boolean),
  )
  const linkedMaterials = materials.filter((row) => linkedMaterialIds.has(normalizeText(row.id)))
  const materialAttentionCount = linkedMaterials.filter((row) => (
    (readBoolean(row.requires_sample_confirmation) && !readBoolean(row.sample_confirmed))
    || (readBoolean(row.requires_inspection) && !readBoolean(row.inspection_done))
    || (!row.actual_arrival_date && isPastDate(row.expected_arrival_date))
  )).length

  const drawingLinkCount = activeLinks.filter((row) => ['construction_drawing', 'drawing_package', 'drawing_version'].includes(normalizeLower(row.source_entity_type))).length
  const materialLinkCount = linkedMaterialIds.size
  const criticalRiskCount = riskRows.filter((row) => isHighSeverity(row.level ?? row.severity)).length
  const criticalIssueCount = issueRows.filter((row) => isHighSeverity(row.severity)).length
  const criticalWarningCount = warningRows.filter((row) => normalizeLower(row.warning_level) === 'critical').length

  return {
    dependencyEdgeCount: dependencyRows.length,
    criticalTaskCount: taskRows.filter((task) => criticalTaskIds.has(task.id)).length,
    keyNodeSnapshotCount: activeKeyNodeSnapshots.length,
    keyNodeImpactedTaskCount: [...keyNodeTaskIds].filter((taskId) => taskIds.has(taskId)).length,
    requiredDependencyCount: dependencyRows.filter((row) => readBoolean(row.required_for_start) || normalizeLower(row.dependency_type) === 'fs').length,
    inferredDependencyCount: dependencyRows.filter((row) => ['inferred', 'template_default', 'system'].includes(normalizeLower(row.source_type))).length,
    unsatisfiedConditionCount: unsatisfiedConditions.length,
    blockingConditionCount: unsatisfiedConditions.filter((row) => isBlockingLevel(row.blocking_level ?? row.condition_type)).length,
    activeObstacleCount: obstacleRows.length,
    blockingObstacleCount: obstacleRows.filter((row) => isBlockingLevel(row.blocking_level ?? row.progress_impact_level) || isHighSeverity(row.severity)).length,
    drawingLinkCount,
    materialLinkCount,
    materialAttentionCount,
    acceptancePendingCount: acceptanceRows.length,
    openRiskCount: riskRows.length,
    openIssueCount: issueRows.length,
    activeWarningCount: warningRows.length,
    criticalExternalSignalCount: criticalRiskCount + criticalIssueCount + criticalWarningCount,
    monthlyCommitmentCount: monthlyRows.length,
    monthlyCarryoverCount: monthlyRows.filter((row) => normalizeLower(row.commitment_status) === 'carried_over' || row.carryover_from_item_id).length,
    missingPlanDateCount: durationSuggestionMetrics.missingPlanDateCount,
    suggestedDurationCount: durationSuggestionMetrics.suggestedDurationCount,
    unavailableDurationSuggestionCount: durationSuggestionMetrics.unavailableDurationSuggestionCount,
    healthRiskSignalCount: healthMetrics.healthRiskSignalCount,
    lowConfidenceReasonCount: durationSuggestionMetrics.unavailableDurationSuggestionCount + healthMetrics.lowConfidenceReasonCount,
  }
}

export async function buildBaselineGenerationCandidateV1474(params: {
  baseline: TaskBaseline
  sourceItems: TaskBaselineItem[]
  candidateItems: TaskBaselineItemInput[]
  taskRows: TaskBaselineTaskRow[]
  criticalTaskIds?: Set<string>
  asOf?: string
  timezone?: string | null
  constructionCalendar?: ConstructionCalendarContext | null
  durationSuggestionMetrics?: BaselineDurationSuggestionMetrics
}): Promise<BaselineGenerationCandidate> {
  const diffItems = buildBaselineDiffItems(params.sourceItems, params.candidateItems)
  const diffCounts = buildBaselineDiffCounts(diffItems)
  const baselineTaskCount = Math.max(params.sourceItems.filter(isBaselineWorkItem).length, 1)
  const candidateTaskCount = params.candidateItems.filter(isBaselineWorkItem).length
  const affectedTaskCount = diffItems.length
  const affectedTaskRatio = affectedTaskCount / baselineTaskCount
  const addedItemCount = diffCounts.added
  const removedItemCount = diffCounts.removed
  const changedItemCount = diffCounts.modified + diffCounts.milestone_changed
  const structureChangeRatio = (addedItemCount + removedItemCount) / baselineTaskCount
  const totalFinishShiftDelta = signedDurationDayDelta(
    getLatestBaselineEndDate(params.sourceItems),
    getLatestBaselineEndDate(params.candidateItems),
  )
  const totalFinishShiftValue = totalFinishShiftDelta === null ? null : Math.abs(totalFinishShiftDelta)
  const milestoneMaxShiftValue = getBaselineMilestoneMaxShiftDays(params.sourceItems, params.candidateItems)
  const constructionCalendar = params.constructionCalendar !== undefined
    ? params.constructionCalendar
    : await resolveConstructionCalendarContext({
        projectId: params.baseline.project_id,
        onError: (error) => logger.warn('[baselineGenerationService] failed to resolve construction calendar context for candidate', {
          projectId: params.baseline.project_id,
          error: error instanceof Error ? error.message : String(error),
        }),
      })
  const timezone = String(params.timezone ?? constructionCalendar?.timezone ?? '').trim() || DEFAULT_DURATION_TIMEZONE
  const asOf = params.asOf === undefined ? businessDateKey(new Date(), timezone) : params.asOf
  const totalFinishShift = buildCalendarDayDurationMetric(totalFinishShiftValue, { asOf, timezone })
  const milestoneMaxShift = buildCalendarDayDurationMetric(milestoneMaxShiftValue, { asOf, timezone })
  const totalFinishShiftDays = totalFinishShift.availability === 'available' ? totalFinishShift.value : null
  const milestoneMaxShiftDays = milestoneMaxShift.availability === 'available' ? milestoneMaxShift.value : null
  const unavailableDateMovementCount = [totalFinishShift, milestoneMaxShift]
    .filter((metric) => metric.availability === 'unavailable')
    .length
  const criticalTaskIds = params.criticalTaskIds ?? new Set<string>()
  const [forecastMetrics, directSeedMetrics, projectFactMetrics, buildingPatternExecutionProfile] = await Promise.all([
    getForecastMetrics(params.taskRows),
    getDirectSeedMetrics(params.taskRows),
    getProjectFactMetrics(params.baseline.project_id, params.taskRows, criticalTaskIds, {
      durationSuggestionMetrics: params.durationSuggestionMetrics,
      constructionCalendar,
      durationAsOfDate: asOf,
    }),
    buildBuildingPatternExecutionProfile(params.baseline.project_id, params.taskRows, 'task_facts'),
  ])
  const constructionRhythmExpansion = buildConstructionRhythmExpansion(buildingPatternExecutionProfile, params.taskRows)
  const constructionRhythmArbitration = buildConstructionRhythmArbitration(
    buildingPatternExecutionProfile,
    constructionRhythmExpansion,
    params.taskRows,
  )
  const constructionRhythmCoordination = buildConstructionRhythmCoordination(constructionRhythmArbitration, params.taskRows)
  const buildingPatternExecutionPlanCandidates = buildBuildingPatternExecutionPlanCandidates({
    profile: buildingPatternExecutionProfile,
    expansion: constructionRhythmExpansion,
    arbitration: constructionRhythmArbitration,
    coordination: constructionRhythmCoordination,
    facts: params.taskRows,
  })

  const scoringInput = {
    affectedTaskCount,
    addedItemCount,
    removedItemCount,
    changedItemCount,
    criticalPathChangeCount: params.candidateItems.filter((item) => item.is_critical || item.is_baseline_critical).length,
    milestoneShiftDays: milestoneMaxShiftValue ?? 0,
    finishShiftDays: totalFinishShiftValue ?? 0,
    forecastDelayedCount: forecastMetrics.forecastDelayedCount,
    maxForecastDelayDays: forecastMetrics.maxForecastDelayDays,
    externalBlockingSignalCount: projectFactMetrics.blockingConditionCount
      + projectFactMetrics.blockingObstacleCount
      + projectFactMetrics.materialAttentionCount
      + projectFactMetrics.acceptancePendingCount
      + projectFactMetrics.criticalExternalSignalCount,
    monthlyRiskSignalCount: projectFactMetrics.monthlyCarryoverCount,
    healthRiskSignalCount: projectFactMetrics.healthRiskSignalCount,
    lowConfidenceReasonCount: forecastMetrics.lowConfidenceReasonCount
      + directSeedMetrics.resourceConflictSeedCount
      + projectFactMetrics.lowConfidenceReasonCount
      + unavailableDateMovementCount,
  }
  const recommendation = scorePlanningRecommendation(scoringInput)
  const reasons = [
    ...buildBaselineBusinessReasons(scoringInput)
      .filter((reason) => !['milestone_shift', 'finish_shift'].includes(reason.code)),
    ...(milestoneMaxShiftValue !== null && milestoneMaxShiftValue > 0
      ? [{
          code: 'milestone_shift',
          label: 'Milestone shifted',
          detail: `Key milestone shift is about ${milestoneMaxShiftValue} calendar day(s).`,
          severity: milestoneMaxShiftValue > 7 ? 'critical' as const : 'warning' as const,
        }]
      : []),
    ...(totalFinishShiftValue !== null && totalFinishShiftValue > 0
      ? [{
          code: 'finish_shift',
          label: 'Project finish shifted',
          detail: `Overall finish date shifted by about ${totalFinishShiftValue} calendar day(s).`,
          severity: totalFinishShiftValue > 14 ? 'critical' as const : 'warning' as const,
        }]
      : []),
    ...buildDirectSeedBusinessReasons(directSeedMetrics),
    buildBuildingPatternExecutionProfileReason(buildingPatternExecutionProfile),
    buildConstructionRhythmExpansionReason(constructionRhythmExpansion),
    buildConstructionRhythmArbitrationReason(constructionRhythmArbitration),
    buildConstructionRhythmCoordinationReason(constructionRhythmCoordination),
    buildBuildingPatternExecutionPlanCandidateReason(buildingPatternExecutionPlanCandidates),
    ...buildProjectFactBusinessReasons(projectFactMetrics),
  ].filter((reason): reason is PlanningBusinessReason => Boolean(reason))
  const recommended = recommendation.level === 'suggest' || recommendation.level === 'strong_suggest'

  return {
    baselineId: params.baseline.id,
    projectId: params.baseline.project_id,
    sourceVersionLabel: formatBaselineVersionLabel(params.baseline),
    candidateVersionLabel: 'new baseline draft',
    recommended,
    recommendationScore: recommendation.score,
    recommendationLevel: recommendation.level,
    confidence: recommendation.confidence,
    algorithmVersion: 'v1.4.7.4',
    summary: recommended
      ? `Detected ${diffCounts.total} planning difference(s). Generate a new baseline draft for review.`
      : recommendation.level === 'watch'
        ? `Detected ${diffCounts.total} planning difference(s). Keep watching before generating a new baseline.`
        : 'Current task list is close to the project baseline. No new baseline version is required.',
    reasons: reasons.map((reason) => ({
      code: reason.code,
      label: reason.label,
      detail: reason.detail,
      severity: reason.severity,
    })),
    businessReasons: reasons.map((reason) => reason.detail),
    dataQualityReasons: [
      ...(forecastMetrics.lowConfidenceReasonCount > 0
        ? ['Some duration forecast inputs have low confidence, so the recommendation was downgraded.']
        : []),
      ...(unavailableDateMovementCount > 0
        ? ['Baseline date movement cannot be evaluated because required Gregorian dates are missing or invalid.']
        : []),
    ],
    metrics: {
      baselineTaskCount,
      candidateTaskCount,
      affectedTaskCount,
      affectedTaskRatio,
      addedItemCount,
      removedItemCount,
      changedItemCount,
      structureChangeRatio,
      milestoneMaxShift,
      totalFinishShift,
      milestoneMaxShiftDays,
      totalFinishShiftDays,
      forecastDelayedCount: forecastMetrics.forecastDelayedCount,
      maxForecastDelayDays: forecastMetrics.maxForecastDelayDays,
      durationSeedFactorCount: forecastMetrics.durationSeedFactorCount,
      directSeedSignalCount: directSeedMetrics.directSeedSignalCount,
      buildingPatternSeedMatchCount: directSeedMetrics.buildingPatternSeedMatchCount,
      buildingPatternHighConfidenceCount: directSeedMetrics.buildingPatternHighConfidenceCount,
      buildingPatternLowConfidenceCount: directSeedMetrics.buildingPatternLowConfidenceCount,
      buildingPatternConfidenceScoreAvg: directSeedMetrics.buildingPatternConfidenceScoreAvg,
      buildingPatternControlChainCount: directSeedMetrics.buildingPatternControlChainCount,
      buildingPatternDurationCurveProfileCount: directSeedMetrics.buildingPatternDurationCurveProfileCount,
      buildingPatternWeightedCycleDayCount: directSeedMetrics.buildingPatternWeightedCycleDayCount,
      buildingPatternWeightedFirstFloorDaysAvg: directSeedMetrics.buildingPatternWeightedFirstFloorDaysAvg,
      buildingPatternWeightedMidFloorsDaysAvg: directSeedMetrics.buildingPatternWeightedMidFloorsDaysAvg,
      buildingPatternWeightedLastFloorsDaysAvg: directSeedMetrics.buildingPatternWeightedLastFloorsDaysAvg,
      buildingPatternMergedStaggerRuleCount: directSeedMetrics.buildingPatternMergedStaggerRuleCount,
      buildingPatternStaggerContributionCount: directSeedMetrics.buildingPatternStaggerContributionCount,
      buildingPatternHardDeadlineMatchCount: directSeedMetrics.buildingPatternHardDeadlineMatchCount,
      buildingPatternPriorityAvg: directSeedMetrics.buildingPatternPriorityAvg,
      buildingPatternExecutionModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionModeCount,
      buildingPatternExecutionBackendConsumableModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionBackendConsumableModeCount,
      buildingPatternExecutionLowConfidenceModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionLowConfidenceModeCount,
      buildingPatternExecutionReadinessScore: buildingPatternExecutionProfile.metrics.buildingPatternExecutionReadinessScore,
      buildingPatternExecutionScopeDimensionCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionScopeDimensionCount,
      buildingPatternExecutionFeatureCoveragePercent: buildingPatternExecutionProfile.metrics.buildingPatternExecutionFeatureCoveragePercent,
      buildingPatternExecutionStandardWorkCoveragePercent: buildingPatternExecutionProfile.metrics.buildingPatternExecutionStandardWorkCoveragePercent,
      constructionRhythmExpansionCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmExpansionCandidateCount,
      constructionRhythmBackendConsumableCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmBackendConsumableCandidateCount,
      constructionRhythmLimitedCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmLimitedCandidateCount,
      constructionRhythmWorkfaceCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmWorkfaceCandidateCount,
      constructionRhythmStrategyCount: constructionRhythmExpansion.metrics.constructionRhythmStrategyCount,
      constructionRhythmArbitrationSignalCount: constructionRhythmArbitration.metrics.constructionRhythmArbitrationSignalCount,
      constructionRhythmBackendConsumableSignalCount: constructionRhythmArbitration.metrics.constructionRhythmBackendConsumableSignalCount,
      constructionRhythmConfidenceOnlySignalCount: constructionRhythmArbitration.metrics.constructionRhythmConfidenceOnlySignalCount,
      constructionRhythmCandidateDependencySignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateDependencySignalCount,
      constructionRhythmCandidateEarliestStartSignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateEarliestStartSignalCount,
      constructionRhythmCandidateDurationContextSignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateDurationContextSignalCount,
      constructionRhythmParallelCautionSignalCount: constructionRhythmArbitration.metrics.constructionRhythmParallelCautionSignalCount,
      constructionRhythmArbitrationScore: constructionRhythmArbitration.metrics.constructionRhythmArbitrationScore,
      constructionRhythmCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationSignalCount,
      constructionRhythmCoordinationBackendConsumableSignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationBackendConsumableSignalCount,
      constructionRhythmCoordinationConfidenceOnlySignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationConfidenceOnlySignalCount,
      constructionRhythmDependencyCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDependencyCoordinationSignalCount,
      constructionRhythmEarliestStartCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmEarliestStartCoordinationSignalCount,
      constructionRhythmDurationContextCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDurationContextCoordinationSignalCount,
      constructionRhythmSiteCapacityCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmSiteCapacityCoordinationSignalCount,
      constructionRhythmProgressCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmProgressCoordinationSignalCount,
      constructionRhythmReadinessCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmReadinessCoordinationSignalCount,
      constructionRhythmQualityCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmQualityCoordinationSignalCount,
      constructionRhythmDurationExperienceCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDurationExperienceCoordinationSignalCount,
      constructionRhythmCoordinationScore: constructionRhythmCoordination.metrics.constructionRhythmCoordinationScore,
      buildingPatternExecutionPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateCount,
      buildingPatternExecutionRecommendedPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionRecommendedPlanCandidateCount,
      buildingPatternExecutionConservativePlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionConservativePlanCandidateCount,
      buildingPatternExecutionCompressedPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionCompressedPlanCandidateCount,
      buildingPatternExecutionLowConfidencePlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionLowConfidencePlanCandidateCount,
      buildingPatternExecutionPlanCandidateMaxConfidenceScore: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateMaxConfidenceScore,
      workflowSeedMatchCount: directSeedMetrics.workflowSeedMatchCount,
      workflowLagDayCount: directSeedMetrics.workflowLagDayCount,
      resourceClassSeedMatchCount: directSeedMetrics.resourceClassSeedMatchCount,
      resourceConflictSeedCount: directSeedMetrics.resourceConflictSeedCount,
      seasonalSeedAdjustmentCount: directSeedMetrics.seasonalSeedAdjustmentCount,
      processConstraintSeedMatchCount: directSeedMetrics.processConstraintSeedMatchCount,
      criticalTaskCount: projectFactMetrics.criticalTaskCount,
      keyNodeSnapshotCount: projectFactMetrics.keyNodeSnapshotCount,
      keyNodeImpactedTaskCount: projectFactMetrics.keyNodeImpactedTaskCount,
      dependencyEdgeCount: projectFactMetrics.dependencyEdgeCount,
      requiredDependencyCount: projectFactMetrics.requiredDependencyCount,
      inferredDependencyCount: projectFactMetrics.inferredDependencyCount,
      unsatisfiedConditionCount: projectFactMetrics.unsatisfiedConditionCount,
      blockingConditionCount: projectFactMetrics.blockingConditionCount,
      activeObstacleCount: projectFactMetrics.activeObstacleCount,
      blockingObstacleCount: projectFactMetrics.blockingObstacleCount,
      drawingLinkCount: projectFactMetrics.drawingLinkCount,
      materialLinkCount: projectFactMetrics.materialLinkCount,
      materialAttentionCount: projectFactMetrics.materialAttentionCount,
      acceptancePendingCount: projectFactMetrics.acceptancePendingCount,
      openRiskCount: projectFactMetrics.openRiskCount,
      openIssueCount: projectFactMetrics.openIssueCount,
      activeWarningCount: projectFactMetrics.activeWarningCount,
      criticalExternalSignalCount: projectFactMetrics.criticalExternalSignalCount,
      monthlyCommitmentCount: projectFactMetrics.monthlyCommitmentCount,
      monthlyCarryoverCount: projectFactMetrics.monthlyCarryoverCount,
      missingPlanDateCount: projectFactMetrics.missingPlanDateCount,
      suggestedDurationCount: projectFactMetrics.suggestedDurationCount,
      healthRiskSignalCount: projectFactMetrics.healthRiskSignalCount,
    },
    diffCounts,
    diffItems: diffItems.slice(0, 50),
    generationSummary: {
      algorithmVersion: 'v1.4.7.4',
      sourceMode: 'current_schedule',
      affectedTaskCount,
      forecastDelayedCount: forecastMetrics.forecastDelayedCount,
      maxForecastDelayDays: forecastMetrics.maxForecastDelayDays,
      recommendationScore: recommendation.score,
      recommendationLevel: recommendation.level,
      confidence: recommendation.confidence,
      durationSeedFactorCount: forecastMetrics.durationSeedFactorCount,
      directSeedSignalCount: directSeedMetrics.directSeedSignalCount,
      buildingPatternSeedMatchCount: directSeedMetrics.buildingPatternSeedMatchCount,
      buildingPatternHighConfidenceCount: directSeedMetrics.buildingPatternHighConfidenceCount,
      buildingPatternLowConfidenceCount: directSeedMetrics.buildingPatternLowConfidenceCount,
      buildingPatternConfidenceScoreAvg: directSeedMetrics.buildingPatternConfidenceScoreAvg,
      buildingPatternControlChainCount: directSeedMetrics.buildingPatternControlChainCount,
      buildingPatternDurationCurveProfileCount: directSeedMetrics.buildingPatternDurationCurveProfileCount,
      buildingPatternWeightedCycleDayCount: directSeedMetrics.buildingPatternWeightedCycleDayCount,
      buildingPatternWeightedFirstFloorDaysAvg: directSeedMetrics.buildingPatternWeightedFirstFloorDaysAvg,
      buildingPatternWeightedMidFloorsDaysAvg: directSeedMetrics.buildingPatternWeightedMidFloorsDaysAvg,
      buildingPatternWeightedLastFloorsDaysAvg: directSeedMetrics.buildingPatternWeightedLastFloorsDaysAvg,
      buildingPatternMergedStaggerRuleCount: directSeedMetrics.buildingPatternMergedStaggerRuleCount,
      buildingPatternStaggerContributionCount: directSeedMetrics.buildingPatternStaggerContributionCount,
      buildingPatternHardDeadlineMatchCount: directSeedMetrics.buildingPatternHardDeadlineMatchCount,
      buildingPatternPriorityAvg: directSeedMetrics.buildingPatternPriorityAvg,
      buildingPatternExecutionModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionModeCount,
      buildingPatternExecutionBackendConsumableModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionBackendConsumableModeCount,
      buildingPatternExecutionLowConfidenceModeCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionLowConfidenceModeCount,
      buildingPatternExecutionReadinessScore: buildingPatternExecutionProfile.metrics.buildingPatternExecutionReadinessScore,
      buildingPatternExecutionScopeDimensionCount: buildingPatternExecutionProfile.metrics.buildingPatternExecutionScopeDimensionCount,
      buildingPatternExecutionFeatureCoveragePercent: buildingPatternExecutionProfile.metrics.buildingPatternExecutionFeatureCoveragePercent,
      buildingPatternExecutionStandardWorkCoveragePercent: buildingPatternExecutionProfile.metrics.buildingPatternExecutionStandardWorkCoveragePercent,
      constructionRhythmExpansionCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmExpansionCandidateCount,
      constructionRhythmBackendConsumableCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmBackendConsumableCandidateCount,
      constructionRhythmLimitedCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmLimitedCandidateCount,
      constructionRhythmWorkfaceCandidateCount: constructionRhythmExpansion.metrics.constructionRhythmWorkfaceCandidateCount,
      constructionRhythmStrategyCount: constructionRhythmExpansion.metrics.constructionRhythmStrategyCount,
      constructionRhythmArbitrationSignalCount: constructionRhythmArbitration.metrics.constructionRhythmArbitrationSignalCount,
      constructionRhythmBackendConsumableSignalCount: constructionRhythmArbitration.metrics.constructionRhythmBackendConsumableSignalCount,
      constructionRhythmConfidenceOnlySignalCount: constructionRhythmArbitration.metrics.constructionRhythmConfidenceOnlySignalCount,
      constructionRhythmCandidateDependencySignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateDependencySignalCount,
      constructionRhythmCandidateEarliestStartSignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateEarliestStartSignalCount,
      constructionRhythmCandidateDurationContextSignalCount: constructionRhythmArbitration.metrics.constructionRhythmCandidateDurationContextSignalCount,
      constructionRhythmParallelCautionSignalCount: constructionRhythmArbitration.metrics.constructionRhythmParallelCautionSignalCount,
      constructionRhythmArbitrationScore: constructionRhythmArbitration.metrics.constructionRhythmArbitrationScore,
      constructionRhythmCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationSignalCount,
      constructionRhythmCoordinationBackendConsumableSignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationBackendConsumableSignalCount,
      constructionRhythmCoordinationConfidenceOnlySignalCount: constructionRhythmCoordination.metrics.constructionRhythmCoordinationConfidenceOnlySignalCount,
      constructionRhythmDependencyCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDependencyCoordinationSignalCount,
      constructionRhythmEarliestStartCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmEarliestStartCoordinationSignalCount,
      constructionRhythmDurationContextCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDurationContextCoordinationSignalCount,
      constructionRhythmSiteCapacityCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmSiteCapacityCoordinationSignalCount,
      constructionRhythmProgressCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmProgressCoordinationSignalCount,
      constructionRhythmReadinessCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmReadinessCoordinationSignalCount,
      constructionRhythmQualityCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmQualityCoordinationSignalCount,
      constructionRhythmDurationExperienceCoordinationSignalCount: constructionRhythmCoordination.metrics.constructionRhythmDurationExperienceCoordinationSignalCount,
      constructionRhythmCoordinationScore: constructionRhythmCoordination.metrics.constructionRhythmCoordinationScore,
      buildingPatternExecutionPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateCount,
      buildingPatternExecutionRecommendedPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionRecommendedPlanCandidateCount,
      buildingPatternExecutionConservativePlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionConservativePlanCandidateCount,
      buildingPatternExecutionCompressedPlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionCompressedPlanCandidateCount,
      buildingPatternExecutionLowConfidencePlanCandidateCount: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionLowConfidencePlanCandidateCount,
      buildingPatternExecutionPlanCandidateMaxConfidenceScore: buildingPatternExecutionPlanCandidates.metrics.buildingPatternExecutionPlanCandidateMaxConfidenceScore,
      workflowSeedMatchCount: directSeedMetrics.workflowSeedMatchCount,
      workflowLagDayCount: directSeedMetrics.workflowLagDayCount,
      resourceConflictSeedCount: directSeedMetrics.resourceConflictSeedCount,
      criticalTaskCount: projectFactMetrics.criticalTaskCount,
      keyNodeSnapshotCount: projectFactMetrics.keyNodeSnapshotCount,
      keyNodeImpactedTaskCount: projectFactMetrics.keyNodeImpactedTaskCount,
      dependencyEdgeCount: projectFactMetrics.dependencyEdgeCount,
      requiredDependencyCount: projectFactMetrics.requiredDependencyCount,
      unsatisfiedConditionCount: projectFactMetrics.unsatisfiedConditionCount,
      blockingConditionCount: projectFactMetrics.blockingConditionCount,
      activeObstacleCount: projectFactMetrics.activeObstacleCount,
      blockingObstacleCount: projectFactMetrics.blockingObstacleCount,
      drawingLinkCount: projectFactMetrics.drawingLinkCount,
      materialLinkCount: projectFactMetrics.materialLinkCount,
      materialAttentionCount: projectFactMetrics.materialAttentionCount,
      acceptancePendingCount: projectFactMetrics.acceptancePendingCount,
      openRiskCount: projectFactMetrics.openRiskCount,
      openIssueCount: projectFactMetrics.openIssueCount,
      activeWarningCount: projectFactMetrics.activeWarningCount,
      criticalExternalSignalCount: projectFactMetrics.criticalExternalSignalCount,
      monthlyCommitmentCount: projectFactMetrics.monthlyCommitmentCount,
      monthlyCarryoverCount: projectFactMetrics.monthlyCarryoverCount,
      missingPlanDateCount: projectFactMetrics.missingPlanDateCount,
      suggestedDurationCount: projectFactMetrics.suggestedDurationCount,
      healthRiskSignalCount: projectFactMetrics.healthRiskSignalCount,
      reasons,
    },
  }
}

export const __baselineGenerationV1474TestHooks = {
  buildTaskSeedScopeContext,
  buildProcessConstraintSeedContext,
  enrichBaselineItemsWithConfirmationGateMetadata,
  rescheduleBaselineItemsWithE3NetworkOrder,
}

export async function listProjectBaselinesForGeneration(projectId: string): Promise<TaskBaseline[]> {
  const { data, error } = await supabase
    .from('task_baselines')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TaskBaseline[]
}

export async function getBaselineItemsForGeneration(baselineId: string): Promise<TaskBaselineItem[]> {
  const { data, error } = await supabase
    .from('task_baseline_items')
    .select('*')
    .eq('baseline_version_id', baselineId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as TaskBaselineItem[]
}

export async function getBaselineGenerationTaskRows(projectId: string): Promise<TaskBaselineTaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as TaskBaselineTaskRow[])
    .filter((task) => task.id && task.title)
    .sort((left, right) => {
      const leftSort = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER
      const rightSort = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER
      if (leftSort !== rightSort) return leftSort - rightSort
      return String(resolveTaskPlanDate(left, 'start') ?? '').localeCompare(String(resolveTaskPlanDate(right, 'start') ?? ''))
    })
}

export function chooseBaselineGenerationSource(baselines: TaskBaseline[]) {
  return (
    baselines
      .filter((baseline) => CURRENT_EXECUTION_BASELINE_STATUSES.has(String(baseline.status ?? '').trim()))
      .filter((baseline) => getNumericVersion(baseline.version) != null)
      .sort(byBusinessVersionDesc)[0] ?? null
  )
}

async function loadBaselineGenerationDateOptions(
  taskRows: TaskBaselineTaskRow[],
  options?: { runtimeEvidenceMode?: 'record' | 'no_write' },
): Promise<BaselineGenerationDateOptions> {
  const projectId = taskRows.map((task) => String(task.project_id ?? '').trim()).find(Boolean) ?? null
  const constructionCalendar = await resolveConstructionCalendarContext({
    projectId,
    onError: (error) => logger.warn('[baselineGenerationService] failed to resolve construction calendar context', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    }),
  })
  const durationAsOfDate = businessDateKey(new Date(), constructionCalendar?.timezone ?? DEFAULT_DURATION_TIMEZONE)
  const [forecastByTaskId, durationSuggestions] = await Promise.all([
    loadLatestForecastsByTaskId(taskRows),
    loadMissingDateDurationSuggestions(taskRows, {
      ...options,
      constructionCalendar,
      durationAsOfDate,
    }),
  ])
  const planningReplayReadbackByTaskId = new Map<string, PlanningReplayCalibrationReadback>()
  await Promise.all(taskRows.map(async (task) => {
    if (!projectId) return
    if (!normalizeText(task.standard_work_code) && !normalizeText(task.standard_work_name) && !normalizeText(task.engineering_category_id)) return
    try {
      const readback = await readPlanningReplayCalibrationReadback({
        projectId,
        standardWorkCode: task.standard_work_code,
        standardWorkName: task.standard_work_name,
        engineeringCategoryId: task.engineering_category_id,
      })
      if (readback.status === 'ready') planningReplayReadbackByTaskId.set(task.id, readback)
    } catch (error) {
      logger.debug('[baselineGenerationService] planning replay calibration readback unavailable for task', {
        projectId,
        taskId: task.id,
        error,
      })
    }
  }))
  return {
    forecastByTaskId,
    durationSuggestionByTaskId: durationSuggestions.durationSuggestionByTaskId,
    durationSuggestionMetrics: durationSuggestions.metrics,
    constructionCalendar,
    durationAsOfDate,
    planningReplayReadbackByTaskId,
  }
}

export async function prepareBaselineGenerationForProject(params: {
  projectId: string
  runtimeEvidenceMode?: 'record' | 'no_write'
}): Promise<BaselineGenerationPreparation> {
  const baselines = await listProjectBaselinesForGeneration(params.projectId)
  const sourceBaseline = chooseBaselineGenerationSource(baselines)
  const [currentItems, taskRows, criticalTaskIds] = await Promise.all([
    sourceBaseline ? getBaselineItemsForGeneration(sourceBaseline.id) : Promise.resolve([]),
    getBaselineGenerationTaskRows(params.projectId),
    getCriticalPathTaskIds(params.projectId),
  ])
  const dateOptions = await loadBaselineGenerationDateOptions(taskRows, {
    runtimeEvidenceMode: params.runtimeEvidenceMode,
  })
  const enrichedItems = await enrichBaselineItemsWithConfirmationGateMetadata({
    projectId: params.projectId,
    taskRows,
    items: buildGeneratedBaselineItemsFromTasksV1474(taskRows, currentItems, criticalTaskIds, dateOptions),
  })
  const generatedItems = await rescheduleBaselineItemsWithE3NetworkOrder({
    projectId: params.projectId,
    taskRows,
    items: enrichedItems,
    constructionCalendar: dateOptions.constructionCalendar,
  })
  const candidate = sourceBaseline
    ? await buildBaselineGenerationCandidateV1474({
        baseline: sourceBaseline,
        sourceItems: currentItems,
        candidateItems: generatedItems,
        taskRows,
        criticalTaskIds,
        asOf: dateOptions.durationAsOfDate ?? undefined,
        timezone: dateOptions.constructionCalendar?.timezone ?? undefined,
        constructionCalendar: dateOptions.constructionCalendar,
        durationSuggestionMetrics: dateOptions.durationSuggestionMetrics,
      })
    : null

  return {
    projectId: params.projectId,
    sourceBaseline,
    currentItems,
    taskRows,
    generatedItems,
    candidate,
  }
}

export async function prepareBaselineGenerationForBaseline(
  baselineId: string,
  options: {
    projectId: string
    runtimeEvidenceMode?: 'record' | 'no_write'
  },
): Promise<BaselineGenerationPreparation> {
  const projectId = String(options.projectId ?? '').trim()
  if (!projectId) throw new Error('Project id is required to prepare a baseline generation')
  const { data: baseline, error } = await supabase
    .from('task_baselines')
    .select('*')
    .eq('id', baselineId)
    .eq('project_id', projectId)
    .single()

  if (error) throw error
  const sourceBaseline = baseline as TaskBaseline
  const [currentItems, taskRows, criticalTaskIds] = await Promise.all([
    getBaselineItemsForGeneration(sourceBaseline.id),
    getBaselineGenerationTaskRows(sourceBaseline.project_id),
    getCriticalPathTaskIds(sourceBaseline.project_id),
  ])
  const dateOptions = await loadBaselineGenerationDateOptions(taskRows, options)
  const enrichedItems = await enrichBaselineItemsWithConfirmationGateMetadata({
    projectId: sourceBaseline.project_id,
    taskRows,
    items: buildGeneratedBaselineItemsFromTasksV1474(taskRows, currentItems, criticalTaskIds, dateOptions),
  })
  const generatedItems = await rescheduleBaselineItemsWithE3NetworkOrder({
    projectId: sourceBaseline.project_id,
    taskRows,
    items: enrichedItems,
    constructionCalendar: dateOptions.constructionCalendar,
  })
  const candidate = await buildBaselineGenerationCandidateV1474({
    baseline: sourceBaseline,
    sourceItems: currentItems,
    candidateItems: generatedItems,
    taskRows,
    criticalTaskIds,
    asOf: dateOptions.durationAsOfDate ?? undefined,
    timezone: dateOptions.constructionCalendar?.timezone ?? undefined,
    constructionCalendar: dateOptions.constructionCalendar,
    durationSuggestionMetrics: dateOptions.durationSuggestionMetrics,
  })

  return {
    projectId: sourceBaseline.project_id,
    sourceBaseline,
    currentItems,
    taskRows,
    generatedItems,
    candidate,
  }
}
