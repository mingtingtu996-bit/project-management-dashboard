import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import {
  acquireBaselineVersionLock,
  readBaselineVersionLock,
  PlanningDraftLockServiceError,
} from './baselineVersionLock.js'
import { evaluateMilestoneIntegrityRows } from './milestoneIntegrityService.js'
import { listNotifications, updateNotificationById } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { calculateTaskPlannedProgress } from '../utils/progressCalculation.js'
import { delayDayDelta } from '../utils/durationDays.js'
import {
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  hasIdentifiedConstructionCalendar,
  type DurationMetricDto,
} from './durationMetricService.js'
import {
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  translateLegacyProgressFactor,
  type StructuredCauseCode,
} from '../domain/structuredCauseTaxonomy.js'
import type {
  DurationContextFactor,
  DurationContextSummary,
} from './durationContextService.js'
import { resolveLiveTaskCriticalityProjection } from './taskCriticalityProjectionService.js'
import type {
  BaselineVersion,
  ProgressDeviationChildGroup,
  ProgressDeviationChildGroupItem,
  ProgressDeviationAnalysisResponse,
  ProgressDeviationChartData,
  ProgressDeviationCauseChainItem,
  ProgressDeviationCauseSummary,
  ProgressDeviationAttribution,
  ProgressDeviationDataCompleteness,
  ProgressDeviationFactCauseSummary,
  ProgressDeviationFactAttribution,
  ProgressDeviationFactCauseChainItem,
  ProgressDeviationFactResponsibilityContribution,
  ProgressDeviationFactRow,
  ProgressDeviationMainline,
  ProgressDeviationReadRequest,
  ProgressDeviationMappingMonitoring,
  ProgressDeviationResponsibilityContribution,
  ProgressDeviationMappingStatus,
  ProgressDeviationMergedInto,
  ProgressDeviationRow,
  ProgressDeviationRowStatus,
  ProgressDeviationTrendEvent,
  ProgressDeviationSummary,
} from '../types/planning.js'
import type {
  Milestone,
  MonthlyPlan,
  MonthlyPlanItem,
  Notification,
  Task,
  TaskBaselineItem,
  TaskCondition,
  TaskObstacle,
  TaskProgressSnapshot,
} from '../types/db.js'

type PlanningTaskRow = Task & {
  baseline_item_id?: string | null
  monthly_plan_item_id?: string | null
}

type ProgressDeviationDurationForecastRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  forecast_delay_days?: number | string | null
  remaining_duration_days?: number | string | null
  factor_summary?: unknown
  business_reason?: string | null
  confidence_level?: string | null
  confidence_score?: number | string | null
  delay_risk_index?: number | string | null
  calculation_context?: unknown
  metadata?: unknown
  generated_at?: string | null
  created_at?: string | null
  is_current?: boolean | null
}

type ProgressDeviationTaskDependencyRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  dependency_task_id?: string | null
  dependency_type?: string | null
  lag_days?: number | string | null
  required_for_start?: boolean | null
  status?: string | null
  source_type?: string | null
}

export class ProgressDeviationServiceError extends Error {
  code: 'NOT_FOUND' | 'DEVIATION_ANALYSIS_UNAVAILABLE' | 'VALIDATION_ERROR'
  statusCode: number

  constructor(code: 'NOT_FOUND' | 'DEVIATION_ANALYSIS_UNAVAILABLE' | 'VALIDATION_ERROR', message: string, statusCode = 400) {
    super(message)
    this.name = 'ProgressDeviationServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

type ProjectOwnerRow = {
  id: string
  owner_id?: string | null
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  permission_level?: string | null
}

function matchDirectFilters(filters: Array<[string, unknown]>, columns: string[]) {
  if (filters.length !== columns.length) return null
  const values = new Map(filters)
  if (values.size !== columns.length) return null

  const result: Record<string, unknown> = {}
  for (const column of columns) {
    if (!values.has(column)) return null
    result[column] = values.get(column)
  }
  return result
}

const PROGRESS_DEVIATION_DIRECT_READS = {
  // workspace-isolation-capability-read-approved: progress deviation receives an authorized project id and uses that id as the exact project-row capability boundary.
  async byFilters(table: string, filters: Array<[string, unknown]>) {
    switch (table) {
      case 'projects': {
        const matched = matchDirectFilters(filters, ['id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.projects WHERE id = $1', [matched.id])
        return result.rows ?? []
      }
      case 'project_members': {
        const matched = matchDirectFilters(filters, ['project_id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.project_members WHERE project_id = $1', [matched.project_id])
        return result.rows ?? []
      }
      case 'monthly_plans': {
        const projectOnly = matchDirectFilters(filters, ['project_id'])
        if (projectOnly) {
          const result = await rawQuery('SELECT * FROM public.monthly_plans WHERE project_id = $1', [projectOnly.project_id])
          return result.rows ?? []
        }
        const projectAndId = matchDirectFilters(filters, ['project_id', 'id'])
        if (projectAndId) {
          const result = await rawQuery('SELECT * FROM public.monthly_plans WHERE project_id = $1 AND id = $2', [projectAndId.project_id, projectAndId.id])
          return result.rows ?? []
        }
        break
      }
      case 'task_baselines': {
        const projectOnly = matchDirectFilters(filters, ['project_id'])
        if (projectOnly) {
          const result = await rawQuery('SELECT * FROM public.task_baselines WHERE project_id = $1', [projectOnly.project_id])
          return result.rows ?? []
        }
        const projectAndId = matchDirectFilters(filters, ['project_id', 'id'])
        if (projectAndId) {
          const result = await rawQuery('SELECT * FROM public.task_baselines WHERE project_id = $1 AND id = $2', [projectAndId.project_id, projectAndId.id])
          return result.rows ?? []
        }
        break
      }
      case 'task_baseline_items': {
        const matched = matchDirectFilters(filters, ['baseline_version_id', 'project_id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.task_baseline_items WHERE baseline_version_id = $1 AND project_id = $2', [matched.baseline_version_id, matched.project_id])
        return result.rows ?? []
      }
      case 'monthly_plan_items': {
        const matched = matchDirectFilters(filters, ['monthly_plan_version_id', 'project_id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.monthly_plan_items WHERE monthly_plan_version_id = $1 AND project_id = $2', [matched.monthly_plan_version_id, matched.project_id])
        return result.rows ?? []
      }
      case 'tasks': {
        const matched = matchDirectFilters(filters, ['project_id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.tasks WHERE project_id = $1', [matched.project_id])
        return result.rows ?? []
      }
      case 'project_schedule_states': {
        const matched = matchDirectFilters(filters, ['project_id'])
        if (!matched) break
        const result = await rawQuery('SELECT * FROM public.project_schedule_states WHERE project_id = $1', [matched.project_id])
        return result.rows ?? []
      }
      default:
        break
    }

    throw new Error(`Unsupported progress deviation direct read shape: ${table}`)
  },
  async byTaskIds(table: string, column: string, values: unknown[], projectId: string) {
    if (column !== 'task_id') {
      throw new Error(`Unsupported progress deviation direct IN column: ${column}`)
    }

    switch (table) {
      case 'task_progress_snapshots': {
        const result = await rawQuery(
          `SELECT scoped.*
             FROM public.task_progress_snapshots scoped
             JOIN public.tasks task_scope ON task_scope.id = scoped.task_id
            WHERE task_scope.project_id = $1
              AND scoped.task_id = ANY($2::uuid[])`,
          [projectId, values],
        )
        return result.rows ?? []
      }
      case 'task_duration_forecasts': {
        const result = await rawQuery('SELECT * FROM public.task_duration_forecasts WHERE project_id = $1 AND task_id = ANY($2::uuid[])', [projectId, values])
        return result.rows ?? []
      }
      case 'task_conditions': {
        const result = await rawQuery(
          `SELECT scoped.*
             FROM public.task_conditions scoped
             JOIN public.tasks task_scope ON task_scope.id = scoped.task_id
            WHERE task_scope.project_id = $1
              AND scoped.task_id = ANY($2::uuid[])`,
          [projectId, values],
        )
        return result.rows ?? []
      }
      case 'task_obstacles': {
        const result = await rawQuery(
          `SELECT id, task_id, project_id, description, obstacle_type, severity, status,
                  estimated_resolve_date, notes, is_resolved, created_at, updated_at
             FROM public.task_obstacles
            WHERE project_id = $1
              AND task_id = ANY($2::uuid[])`,
          [projectId, values],
        )
        return result.rows ?? []
      }
      case 'task_dependencies': {
        const result = await rawQuery('SELECT * FROM public.task_dependencies WHERE project_id = $1 AND task_id = ANY($2::uuid[])', [projectId, values])
        return result.rows ?? []
      }
      default:
        throw new Error(`Unsupported progress deviation direct IN read table: ${table}`)
    }
  },
}

async function fetchMilestoneTasks(projectId: string): Promise<Milestone[]> {
  const result = await rawQuery(
    `SELECT id, project_id, title, description,
            COALESCE(planned_end_date, end_date) AS target_date,
            baseline_end AS baseline_date,
            COALESCE(planned_end_date, end_date) AS current_plan_date,
            actual_end_date AS actual_date,
            actual_end_date::timestamp AS completed_at,
            status, progress AS completion_rate, created_at, updated_at, version
       FROM public.tasks
      WHERE project_id = $1 AND is_milestone IS TRUE`,
    [projectId],
  )
  return result.rows as Milestone[]
}

export const progressDeviationContracts = {
  method: 'GET',
  path: '/api/progress-deviation',
  requestShape: '{ project_id: string, baseline_version_id: string, monthly_plan_version_id?: string, lock?: boolean }',
  responseShape:
    '{ project_id: string, baseline_version_id: string, monthly_plan_version_id?: string | null, version_lock?: BaselineVersionLock | null, summary: {...}, rows: [...], mainlines: [...], mapping_monitoring: {...}, trend_events: [...], chart_data: {...}, responsibility_contribution: [...], top_deviation_causes: [...], m1_m9_consistency: {...}, planned_date, actual_date, attribution.cause_chain, data_completeness, duration_contribution_mode, mapping_status, merged_into, child_group }',
  errorCodes: ['NOT_FOUND', 'DEVIATION_ANALYSIS_UNAVAILABLE', 'LOCK_HELD', 'LOCK_EXPIRED', 'VALIDATION_ERROR'],
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function normalizeProgressValue(value: unknown): number | null {
  const parsed = toNullableNumber(value)
  if (parsed === null) return null
  return round1(Math.max(0, Math.min(100, parsed)))
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return readRecord(value)
}

function readNestedRecords(value: unknown): Record<string, unknown>[] {
  const root = readJsonRecord(value)
  if (Object.keys(root).length === 0) return []

  const records: Record<string, unknown>[] = [root]
  for (const key of [
    'standard_task_metadata',
    'standardTaskMetadata',
    'generation_metadata',
    'generationMetadata',
    'duration_suggestion',
    'durationSuggestion',
    'wbs_snapshot',
    'wbsSnapshot',
    'task_fact_snapshot',
    'taskFactSnapshot',
    'scope_snapshot',
    'scopeSnapshot',
    'metadata',
  ]) {
    const nested = readJsonRecord(root[key])
    if (Object.keys(nested).length > 0) records.push(nested)
    const nestedSuggestion = readJsonRecord(nested.durationSuggestion ?? nested.duration_suggestion)
    if (Object.keys(nestedSuggestion).length > 0) records.push(nestedSuggestion)
  }
  return records
}

function resolveDurationContributionMode(...sources: unknown[]): DurationContributionMode {
  for (const source of sources) {
    for (const record of readNestedRecords(source)) {
      const mode = normalizeDurationContributionMode(
        record.durationContributionMode
          ?? record.duration_contribution_mode
          ?? record.durationMode
          ?? record.duration_mode,
      )
      if (mode) return mode
    }
  }
  return 'duration_bearing'
}

function canUseWindowAttribution(mode: DurationContributionMode) {
  return mode === 'duration_bearing'
    || mode === 'quality_gate'
    || mode === 'external_wait'
    || mode === 'handover_marker'
}

type ProgressDeviationFactorReasonConfig = {
  reason: string
  reasonType: string
  canonicalCauseCode: StructuredCauseCode
  taxonomyVersion: string
  priority: number
  confidenceWeight: number
  responsibilityBasis: string
}

function getFactorReasonConfig(key: string, mode: DurationContributionMode): ProgressDeviationFactorReasonConfig | null {
  const translation = translateLegacyProgressFactor(key)
  if (!translation) return null

  if (
    mode !== 'duration_bearing'
    && (
      (key !== 'process_constraint' && key !== 'external_readiness')
      || !canUseWindowAttribution(mode)
    )
  ) return null

  if (key === 'resource_conflict' || key === 'progress_velocity') {
    return {
      ...translation,
      canonicalCauseCode: translation.causeCode,
      reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b',
      reasonType: 'site_capacity_pressure',
      priority: 90,
      confidenceWeight: 0.82,
      responsibilityBasis: 'site_capacity',
    }
  }
  if (key === 'workflow_sequence') {
    return {
      ...translation,
      canonicalCauseCode: translation.causeCode,
      reason: '\u6d41\u6c34\u8282\u594f\u504f\u5dee',
      reasonType: 'workflow_sequence',
      priority: 80,
      confidenceWeight: 0.76,
      responsibilityBasis: 'workflow',
    }
  }
  if (
    key === 'seasonal_productivity'
    || key === 'process_seasonal_sensitivity'
    || key === 'weather_forecast_impact'
    || key === 'productivity_compensation'
  ) {
    return {
      ...translation,
      canonicalCauseCode: translation.causeCode,
      reason: '\u5b63\u8282/\u65e5\u5386\u4ea7\u80fd\u5f71\u54cd',
      reasonType: 'calendar_productivity',
      priority: 70,
      confidenceWeight: 0.7,
      responsibilityBasis: 'calendar_productivity',
    }
  }
  if (key === 'process_constraint') {
    return {
      ...translation,
      canonicalCauseCode: translation.causeCode,
      reason: '\u5de5\u5e8f\u786c\u7ea6\u675f\u672a\u6ee1\u8db3',
      reasonType: 'process_constraint',
      priority: 75,
      confidenceWeight: 0.74,
      responsibilityBasis: 'quality_gate',
    }
  }
  if (key === 'external_readiness') {
    return {
      ...translation,
      canonicalCauseCode: translation.causeCode,
      reason: '\u5916\u90e8\u6761\u4ef6\u672a\u6ee1\u8db3',
      reasonType: 'external_readiness',
      priority: 78,
      confidenceWeight: 0.78,
      responsibilityBasis: 'external_wait',
    }
  }
  return null
}

function readFactorSummary(value: unknown): DurationContextSummary | null {
  const record = readJsonRecord(value)
  return Object.keys(record).length > 0 ? record as unknown as DurationContextSummary : null
}

function getFactorImpactScore(factor: DurationContextFactor) {
  return Math.abs(Number(factor.extraDays ?? 0) || 0)
    + Math.abs((Number(factor.multiplier ?? 1) || 1) - 1) * 10
    + Math.abs(Number(factor.confidenceDelta ?? 0) || 0)
}

function getFactorAttributionRank(factor: DurationContextFactor) {
  if (isConfidenceOnlyFactor(factor)) return 0
  return Math.max(0, Number(factor.extraDays ?? 0) || 0) > 0 ? 2 : 1
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string' && value.trim() === '') return false
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(readJsonRecord(value)).length === 0) return false
      return true
    }),
  )
}

function firstNonEmptyRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = readJsonRecord(value)
    if (Object.keys(record).length > 0) return record
  }
  return null
}

function readForecastProbabilityDuration(forecast: ProgressDeviationDurationForecastRow): Record<string, unknown> | null {
  const metadata = readJsonRecord(forecast.metadata)
  const calculationContext = readJsonRecord(forecast.calculation_context)
  return firstNonEmptyRecord(
    metadata.probabilityDuration,
    metadata.probability_duration,
    getNestedRecord(metadata, ['forecastSources', 'probabilityDuration']),
    getNestedRecord(metadata, ['forecast_sources', 'probability_duration']),
    calculationContext.probabilityDuration,
    calculationContext.probability_duration,
    getNestedRecord(calculationContext, ['remaining_duration_forecast', 'probabilityDuration']),
    getNestedRecord(calculationContext, ['remaining_duration_forecast', 'probability_duration']),
  )
}

function readForecastUncertaintyIndex(forecast: ProgressDeviationDurationForecastRow): number | null {
  const calculationContext = readJsonRecord(forecast.calculation_context)
  const remainingForecast = getNestedRecord(calculationContext, ['remaining_duration_forecast'])
  return toNullableNumber(
    calculationContext.delay_uncertainty_index
      ?? calculationContext.delayUncertaintyIndex
      ?? remainingForecast.delay_uncertainty_index
      ?? remainingForecast.delayUncertaintyIndex,
  )
}

function normalizeForecastConfidence(forecast: ProgressDeviationDurationForecastRow): string | null {
  const confidenceScore = toNullableNumber(forecast.confidence_score)
  if (confidenceScore !== null) {
    const score = confidenceScore > 1 ? confidenceScore : confidenceScore * 100
    if (score < 45) return 'low'
    if (score < 75) return 'medium'
    return 'high'
  }

  const uncertaintyIndex = readForecastUncertaintyIndex(forecast)
  if (uncertaintyIndex !== null && uncertaintyIndex >= 0.65) return 'low'
  return normalizeText(forecast.confidence_level) || null
}

function buildForecastEvidenceProfile(forecast: ProgressDeviationDurationForecastRow) {
  const confidenceScore = toNullableNumber(forecast.confidence_score)
  const delayRiskIndex = toNullableNumber(forecast.delay_risk_index)
  const delayUncertaintyIndex = readForecastUncertaintyIndex(forecast)
  const probabilityDuration = readForecastProbabilityDuration(forecast)
  const confidence = normalizeForecastConfidence(forecast)
  const reviewStatus = (
    (confidenceScore !== null && (confidenceScore > 1 ? confidenceScore : confidenceScore * 100) < 60)
    || (delayUncertaintyIndex !== null && delayUncertaintyIndex >= 0.5)
    || (delayRiskIndex !== null && delayRiskIndex >= 0.75)
  )
    ? 'needs_review'
    : null

  return {
    confidence,
    reviewStatus,
    evidence: compactRecord({
      forecast_delay_days: toNullableNumber(forecast.forecast_delay_days),
      remaining_duration_days: toNullableNumber(forecast.remaining_duration_days),
      confidence_score: confidenceScore,
      delay_risk_index: delayRiskIndex,
      delay_uncertainty_index: delayUncertaintyIndex,
      probability_duration: probabilityDuration,
    }),
  }
}

function readForecastExternalReadinessEvidence(forecast?: ProgressDeviationDurationForecastRow | null) {
  if (!forecast) return null
  const metadata = readJsonRecord(forecast.metadata)
  const calculationContext = readJsonRecord(forecast.calculation_context)
  const remainingForecast = getNestedRecord(calculationContext, ['remaining_duration_forecast'])
  const readiness = firstNonEmptyRecord(
    remainingForecast.externalReadiness,
    remainingForecast.external_readiness,
    calculationContext.externalReadiness,
    calculationContext.external_readiness,
    getNestedRecord(metadata, ['forecastSources', 'externalReadiness']),
    getNestedRecord(metadata, ['forecast_sources', 'external_readiness']),
  )
  const impactModeBreakdown = firstNonEmptyRecord(
    remainingForecast.impactModeBreakdown,
    remainingForecast.impact_mode_breakdown,
    calculationContext.impactModeBreakdown,
    calculationContext.impact_mode_breakdown,
  )
  const impactDays = toNullableNumber(
    remainingForecast.externalReadinessImpactDays
      ?? remainingForecast.external_readiness_impact_days
      ?? calculationContext.externalReadinessImpactDays
      ?? calculationContext.external_readiness_impact_days
      ?? impactModeBreakdown?.externalReadiness
      ?? impactModeBreakdown?.external_readiness,
  )

  if (!readiness && impactDays === null) return null

  return {
    readiness: readiness ?? {},
    impactDays,
    impactModeBreakdown: impactModeBreakdown ?? {},
    evidenceSource: 'task_duration_forecasts.calculation_context.remaining_duration_forecast.externalReadiness',
  }
}

function readForecastUnstartedOverdueRule(forecast?: ProgressDeviationDurationForecastRow | null) {
  if (!forecast) return null
  const metadata = readJsonRecord(forecast.metadata)
  const calculationContext = readJsonRecord(forecast.calculation_context)
  const remainingForecast = getNestedRecord(calculationContext, ['remaining_duration_forecast'])
  return firstNonEmptyRecord(
    remainingForecast.unstartedOverdueRule,
    remainingForecast.unstarted_overdue_rule,
    calculationContext.unstartedOverdueRule,
    calculationContext.unstarted_overdue_rule,
    getNestedRecord(metadata, ['forecastSources', 'unstartedOverdueRule']),
    getNestedRecord(metadata, ['forecast_sources', 'unstarted_overdue_rule']),
  )
}

function countUnknownBlockers(rule: Record<string, unknown>) {
  const explicitUnknownCount = toNullableNumber(rule.unknownBlockerCount ?? rule.unknown_blocker_count) ?? 0
  const riskComponents = readJsonRecord(rule.riskComponents ?? rule.risk_components)
  const componentUnknownCount = Object.entries(riskComponents)
    .filter(([key, value]) => key.toLowerCase().includes('unknown') && Number(value) > 0)
    .reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0)
  return explicitUnknownCount + componentUnknownCount
}

function buildUnstartedOverdueDelayReason(
  taskId: string,
  forecast: ProgressDeviationDurationForecastRow,
  evidenceProfile: ReturnType<typeof buildForecastEvidenceProfile>,
): ProgressDeviationAttribution['delay_reasons'][number] | null {
  const rule = readForecastUnstartedOverdueRule(forecast)
  if (!rule) return null

  const missedWindowWorkdays = Math.max(0, toNullableNumber(rule.missedWindowWorkdays ?? rule.missed_window_workdays) ?? 0)
  const plannedStartOverdueWorkdays = Math.max(0, toNullableNumber(rule.plannedStartOverdueWorkdays ?? rule.planned_start_overdue_workdays) ?? 0)
  const plannedEndOverdueWorkdays = Math.max(0, toNullableNumber(rule.plannedEndOverdueWorkdays ?? rule.planned_end_overdue_workdays) ?? 0)
  const unknownBlockerCount = countUnknownBlockers(rule)
  const impactDays = unknownBlockerCount > 0
    ? 0
    : Math.max(missedWindowWorkdays, plannedStartOverdueWorkdays, plannedEndOverdueWorkdays)
  if (impactDays <= 0 && unknownBlockerCount <= 0) return null

  return {
    id: `${taskId}:unstarted_overdue_rule`,
    reason: '\u672a\u5f00\u5de5\u903e\u671f/\u9519\u8fc7\u7a97\u53e3',
    delay_reason: unknownBlockerCount > 0
      ? '\u5b58\u5728\u672a\u77e5\u963b\u65ad\uff0c\u9700\u8865\u5145\u4e8b\u5b9e\u8bc1\u636e'
      : '\u5df2\u8d85\u8fc7\u53ef\u5f00\u5de5\u7a97\u53e3',
    status: unknownBlockerCount > 0 ? 'needs_evidence' : 'candidate_only',
    delayed_date: normalizeText(forecast.generated_at ?? forecast.created_at) || null,
    reason_type: 'unstarted_overdue_window',
    source: 'task_duration_forecasts.calculation_context.remaining_duration_forecast.unstartedOverdueRule',
    confidence: unknownBlockerCount > 0 ? 'low' : evidenceProfile.confidence,
    impact_days: impactDays,
    priority: 72,
    responsibility_basis: unknownBlockerCount > 0 ? 'data_quality' : 'owner_scope',
    quantification_basis: unknownBlockerCount > 0 ? 'unknown_blocker_downweight' : 'unstarted_overdue_rule',
    attribution_role: unknownBlockerCount > 0 ? 'evidence_completion_prompt' : 'quantified_delay_signal',
    review_status: unknownBlockerCount > 0 ? 'needs_evidence' : evidenceProfile.reviewStatus,
    evidence: compactRecord({
      ...evidenceProfile.evidence,
      earliest_start_date: normalizeText(rule.earliestStartDate ?? rule.earliest_start_date) || null,
      missed_window_workdays: missedWindowWorkdays,
      planned_start_overdue_workdays: plannedStartOverdueWorkdays,
      planned_end_overdue_workdays: plannedEndOverdueWorkdays,
      unknown_blocker_count: unknownBlockerCount,
      risk_components: readJsonRecord(rule.riskComponents ?? rule.risk_components),
    }),
  }
}

function isConfidenceOnlyFactor(factor: DurationContextFactor) {
  return normalizeText(factor.actionPolicy).toLowerCase() === 'confidence_only'
}

function buildForecastDelayReasons(params: {
  taskId: string
  forecast?: ProgressDeviationDurationForecastRow | null
  durationContributionMode: DurationContributionMode
  hasExternalReadinessFactAnchor?: boolean
}): ProgressDeviationAttribution['delay_reasons'] {
  const forecast = params.forecast
  if (!forecast) return []

  const summary = readFactorSummary(forecast.factor_summary)
  const factors = Array.isArray(summary?.factors)
    ? summary.factors.filter((factor): factor is DurationContextFactor => Boolean(factor && typeof factor === 'object'))
    : []
  const seenReasons = new Set<string>()
  const reasons: ProgressDeviationAttribution['delay_reasons'] = []
  const evidenceProfile = buildForecastEvidenceProfile(forecast)

  factors
    .slice()
    .sort((left, right) => getFactorAttributionRank(right) - getFactorAttributionRank(left)
      || getFactorImpactScore(right) - getFactorImpactScore(left))
    .forEach((factor, index) => {
      const key = normalizeText(factor.key)
      const config = getFactorReasonConfig(key, params.durationContributionMode)
      if (!config || seenReasons.has(config.reason)) return
      seenReasons.add(config.reason)
      const reasonDetail = normalizeText(factor.reason)
        || normalizeText(factor.label)
        || normalizeText(forecast.business_reason)
        || config.reason
      const confidenceOnly = isConfidenceOnlyFactor(factor)
      const rawImpactDays = Math.max(0, Number(factor.extraDays ?? 0) || 0)
      const forecastOnlyExternalReadiness = config.reasonType === 'external_readiness'
        && !params.hasExternalReadinessFactAnchor
      const impactDays = confidenceOnly || forecastOnlyExternalReadiness ? 0 : rawImpactDays
      const quantificationBasis = confidenceOnly
        ? 'confidence_only'
        : forecastOnlyExternalReadiness
          ? 'forecast_only_external_readiness'
          : 'factor_extra_days'
      const attributionRole = confidenceOnly
        ? 'confidence_adjustment'
        : forecastOnlyExternalReadiness
          ? 'evidence_candidate'
          : 'quantified_delay_signal'
      const reviewStatus = forecastOnlyExternalReadiness
        ? 'needs_fact_anchor'
        : evidenceProfile.reviewStatus
      const externalReadinessEvidence = forecastOnlyExternalReadiness
        ? readForecastExternalReadinessEvidence(forecast)
        : null
      reasons.push({
        id: `${params.taskId}:duration_factor:${key}:${index}`,
        reason: config.reason,
        delay_reason: reasonDetail,
        status: normalizeText(factor.actionPolicy) || normalizeText(forecast.confidence_level) || null,
        delayed_date: normalizeText(forecast.generated_at ?? forecast.created_at) || null,
        reason_type: config.reasonType,
        source: 'task_duration_forecasts.factor_summary',
        confidence: evidenceProfile.confidence,
        impact_days: impactDays,
        priority: config.priority,
        responsibility_basis: config.responsibilityBasis,
        quantification_basis: quantificationBasis,
        attribution_role: attributionRole,
        review_status: reviewStatus,
        evidence: compactRecord({
          ...evidenceProfile.evidence,
          factor_key: key,
          canonical_cause_code: config.canonicalCauseCode,
          canonical_cause_taxonomy_version: config.taxonomyVersion,
          factor_label: normalizeText(factor.label) || null,
          factor_source: normalizeText(factor.source) || null,
          raw_extra_days: rawImpactDays,
          multiplier: toNullableNumber(factor.multiplier),
          confidence_delta: toNullableNumber(factor.confidenceDelta),
          action_policy: normalizeText(factor.actionPolicy) || null,
          data_dependencies: Array.isArray(factor.dataDependencies) ? factor.dataDependencies : null,
          factor_metadata: readJsonRecord(factor.metadata),
          forecast_external_readiness: externalReadinessEvidence?.readiness,
          forecast_external_readiness_impact_days: externalReadinessEvidence?.impactDays,
          forecast_external_readiness_breakdown: externalReadinessEvidence?.impactModeBreakdown,
        }),
      })
    })

  const unstartedOverdueReason = buildUnstartedOverdueDelayReason(params.taskId, forecast, evidenceProfile)
  if (unstartedOverdueReason && !seenReasons.has(unstartedOverdueReason.reason)) {
    reasons.push(unstartedOverdueReason)
  }

  return reasons.slice(0, 5)
}

type DependencyCauseEvidence = {
  dependencyTaskId: string
  dependencyType?: string | null
  impactDays: number | null
  waitDays: number | null
  floorRemainingDays: number | null
  expectedFinishDate?: string | null
  availableStartDate?: string | null
  confidence?: string | null
  evidenceSource: string
  raw: Record<string, unknown>
}

type CriticalPathImpactEvidence = {
  is_critical: boolean
  total_float_days: number | null
  free_float_days: number | null
  weight: number
  basis: string
}

type DependencyTraceResult = {
  directTaskId: string
  rootTaskId: string
  causalDepth: number
  causalPathTaskIds: string[]
  transmissionTaskIds: string[]
}

function getNestedRecord(source: Record<string, unknown>, path: string[]) {
  let cursor: unknown = source
  for (const segment of path) {
    cursor = readJsonRecord(cursor)[segment]
  }
  return readJsonRecord(cursor)
}

function collectForecastDependencyEvidence(
  forecast?: ProgressDeviationDurationForecastRow | null,
  calendar?: ConstructionCalendarContext | null,
): DependencyCauseEvidence[] {
  if (!forecast) return []

  const candidates = [
    {
      source: 'task_duration_forecasts.metadata.forecastSources.dependencyPropagation',
      record: getNestedRecord(readJsonRecord(forecast.metadata), ['forecastSources', 'dependencyPropagation']),
    },
    {
      source: 'task_duration_forecasts.calculation_context.remaining_duration_forecast.dependencyPropagation',
      record: getNestedRecord(readJsonRecord(forecast.calculation_context), ['remaining_duration_forecast', 'dependencyPropagation']),
    },
    {
      source: 'task_duration_forecasts.calculation_context.dependencyPropagation',
      record: getNestedRecord(readJsonRecord(forecast.calculation_context), ['dependencyPropagation']),
    },
  ]
  const byDependency = new Map<string, DependencyCauseEvidence>()

  for (const candidate of candidates) {
    const blockingDependencies = Array.isArray(candidate.record.blockingDependencies)
      ? candidate.record.blockingDependencies
      : Array.isArray(candidate.record.blocking_dependencies)
        ? candidate.record.blocking_dependencies
        : []
    for (const item of blockingDependencies) {
      const record = readJsonRecord(item)
      const dependencyTaskId = normalizeText(record.dependencyTaskId ?? record.dependency_task_id)
      if (!dependencyTaskId) continue

      const expectedFinishDate = normalizeText(record.expectedFinishDate ?? record.expected_finish_date) || null
      const availableStartDate = normalizeText(record.availableStartDate ?? record.available_start_date) || null
      const waitDays = positiveDateWindowDays(availableStartDate, expectedFinishDate, calendar)
      const floorRemainingDays = toNullableNumber(record.floorRemainingDays ?? record.floor_remaining_days)
      const impactDays = Math.max(0, waitDays ?? 0)
      if (impactDays <= 0 && (floorRemainingDays ?? 0) <= 0) continue

      const previous = byDependency.get(dependencyTaskId)
      const previousSources = previous?.evidenceSource ? previous.evidenceSource.split('; ') : []
      const sourceList = uniqueStrings([...previousSources, candidate.source])
      const next: DependencyCauseEvidence = {
        dependencyTaskId,
        dependencyType: normalizeText(record.dependencyType ?? record.dependency_type) || null,
        impactDays: Math.max(previous?.impactDays ?? 0, impactDays) || null,
        waitDays: Math.max(previous?.waitDays ?? 0, waitDays ?? 0) || null,
        floorRemainingDays: Math.max(previous?.floorRemainingDays ?? 0, floorRemainingDays ?? 0) || null,
        expectedFinishDate: expectedFinishDate || previous?.expectedFinishDate || null,
        availableStartDate: availableStartDate || previous?.availableStartDate || null,
        evidenceSource: sourceList.join('; '),
        raw: { ...(previous?.raw ?? {}), ...record },
      }
      byDependency.set(dependencyTaskId, next)
    }
  }

  return [...byDependency.values()].sort((left, right) => (right.impactDays ?? 0) - (left.impactDays ?? 0))
}

function isCompletedTaskForCausalResponsibility(task?: PlanningTaskRow | null) {
  if (!task) return false
  const raw = task as unknown as Record<string, unknown>
  const status = normalizeText(raw.status).toLowerCase()
  const progress = toNullableNumber(raw.progress)
  return ['completed', 'done', 'finished', 'closed', '\u5df2\u5b8c\u6210'].includes(status)
    || Boolean(raw.actual_end_date)
    || (progress !== null && progress >= 100)
}

function findDependencyRelation(
  dependencies: ProgressDeviationTaskDependencyRow[],
  dependencyTaskId: string,
) {
  return dependencies.find((dependency) => {
    if (normalizeText(dependency.dependency_task_id) !== dependencyTaskId) return false
    const status = normalizeText(dependency.status || 'active').toLowerCase()
    return status !== 'inactive' && status !== 'deleted' && dependency.required_for_start !== false
  }) ?? null
}

function resolveCriticalPathImpact(task?: PlanningTaskRow | null): CriticalPathImpactEvidence {
  const projection = resolveLiveTaskCriticalityProjection(task)
  const freeFloatBump = projection.freeFloatDays !== null && projection.freeFloatDays <= 0
    ? 0.1
    : projection.freeFloatDays !== null && projection.freeFloatDays <= 2
      ? 0.05
      : 0
  const weight = Math.max(0.75, Math.min(1.6, projection.criticalityWeight + freeFloatBump))

  return {
    is_critical: projection.isCritical,
    total_float_days: projection.totalFloatDays,
    free_float_days: projection.freeFloatDays,
    weight: round1(weight),
    basis: projection.basis,
  }
}

function collectDependencyTraceCandidates(params: {
  taskId: string
  task?: PlanningTaskRow | null
  tasksById: Map<string, PlanningTaskRow>
  dependenciesByTask: Map<string, ProgressDeviationTaskDependencyRow[]>
}) {
  const relationCandidates = (params.dependenciesByTask.get(params.taskId) ?? [])
    .map((relation) => {
      const dependencyTaskId = normalizeText(relation.dependency_task_id)
      if (!dependencyTaskId) return null
      if (!findDependencyRelation([relation], dependencyTaskId)) return null
      return {
        dependencyTaskId,
        relation,
        evidenceSource: 'task_dependencies',
      }
    })
    .filter(Boolean) as Array<{
      dependencyTaskId: string
      relation: ProgressDeviationTaskDependencyRow | null
      evidenceSource: string
    }>

  return relationCandidates
    .map((candidate) => {
      const upstreamTask = params.tasksById.get(candidate.dependencyTaskId) ?? null
      if (!upstreamTask) return null
      const waitDays = estimateDependencyFactWaitDays({
        downstreamTask: params.task ?? null,
        upstreamTask,
        relation: candidate.relation,
      })
      if (isCompletedTaskForCausalResponsibility(upstreamTask) && !waitDays) return null

      return {
        ...candidate,
        upstreamTask,
        waitDays,
        impactDays: waitDays ?? 1,
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftCompleted = isCompletedTaskForCausalResponsibility(left!.upstreamTask) ? 1 : 0
      const rightCompleted = isCompletedTaskForCausalResponsibility(right!.upstreamTask) ? 1 : 0
      return leftCompleted - rightCompleted
        || (right!.impactDays ?? 0) - (left!.impactDays ?? 0)
        || right!.evidenceSource.localeCompare(left!.evidenceSource)
    }) as Array<{
      dependencyTaskId: string
      relation: ProgressDeviationTaskDependencyRow | null
      evidenceSource: string
      upstreamTask: PlanningTaskRow
      waitDays: number | null
      impactDays: number
    }>
}

function traceDependencyRoot(params: {
  affectedTaskId: string
  directDependencyTaskId: string
  tasksById: Map<string, PlanningTaskRow>
  dependenciesByTask: Map<string, ProgressDeviationTaskDependencyRow[]>
}): DependencyTraceResult {
  const affectedTaskId = normalizeText(params.affectedTaskId)
  const directTaskId = normalizeText(params.directDependencyTaskId)
  const downstreamToRoot = uniqueStrings([affectedTaskId, directTaskId])
  const visited = new Set(downstreamToRoot)
  let cursorTaskId = directTaskId

  for (let depth = 0; depth < 6; depth += 1) {
    const cursorTask = params.tasksById.get(cursorTaskId) ?? null
    if (!cursorTask) break

    const next = collectDependencyTraceCandidates({
      taskId: cursorTaskId,
      task: cursorTask,
      tasksById: params.tasksById,
      dependenciesByTask: params.dependenciesByTask,
    }).find((candidate) => !visited.has(candidate.dependencyTaskId))
    if (!next) break

    downstreamToRoot.push(next.dependencyTaskId)
    visited.add(next.dependencyTaskId)
    cursorTaskId = next.dependencyTaskId
  }

  const causalPathTaskIds = downstreamToRoot.slice().reverse()
  return {
    directTaskId,
    rootTaskId: cursorTaskId,
    causalDepth: Math.max(0, causalPathTaskIds.length - 1),
    causalPathTaskIds,
    transmissionTaskIds: causalPathTaskIds.slice(1, -1),
  }
}

function readTaskDate(task: PlanningTaskRow | null | undefined, keys: string[]): string | null {
  const raw = readRecord(task)
  for (const key of keys) {
    const value = normalizeText(raw[key])
    if (value) return value
  }
  return null
}

function pickLaterDate(...values: Array<string | null | undefined>): string | null {
  let latestValue: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized) continue
    const time = new Date(normalized).getTime()
    if (!Number.isFinite(time)) continue
    if (time > latestTime) {
      latestTime = time
      latestValue = normalized
    }
  }
  return latestValue
}

function estimateDependencyFactWaitDays(params: {
  downstreamTask?: PlanningTaskRow | null
  upstreamTask?: PlanningTaskRow | null
  relation?: ProgressDeviationTaskDependencyRow | null
  calendar?: ConstructionCalendarContext | null
}) {
  const downstreamStart = readTaskDate(params.downstreamTask, [
    'planned_start_date',
    'plan_start',
    'planned_start',
    'start_date',
  ])
  const downstreamObservedAt = readTaskDate(params.downstreamTask, [
    'actual_end_date',
    'end_date',
    'updated_at',
  ])
  const upstreamActualEnd = readTaskDate(params.upstreamTask, [
    'actual_end_date',
    'end_date',
  ])
  const upstreamPlannedEnd = readTaskDate(params.upstreamTask, [
    'planned_end_date',
    'plan_end',
    'planned_end',
  ])
  const upstreamObservedAt = readTaskDate(params.upstreamTask, [
    'updated_at',
  ])
  const upstreamBoundary = isCompletedTaskForCausalResponsibility(params.upstreamTask)
    ? pickLaterDate(upstreamActualEnd, upstreamObservedAt)
    : pickLaterDate(upstreamPlannedEnd, downstreamObservedAt, upstreamObservedAt)

  if (!downstreamStart || !upstreamBoundary) return null
  if (!hasIdentifiedConstructionCalendar(params.calendar)) return null

  const lagDays = Math.max(0, toNumber(params.relation?.lag_days, 0))
  const dateWaitDays = delayDayDelta(downstreamStart, upstreamBoundary, params.calendar)
  if (dateWaitDays === null) return null
  const waitDays = dateWaitDays + lagDays
  return waitDays > 0 ? waitDays : null
}

function buildDependencyFactEvidence(params: {
  task?: PlanningTaskRow | null
  tasksById: Map<string, PlanningTaskRow>
  dependencies: ProgressDeviationTaskDependencyRow[]
  calendar?: ConstructionCalendarContext | null
}): DependencyCauseEvidence[] {
  const evidenceByDependency = new Map<string, DependencyCauseEvidence>()

  for (const dependency of params.dependencies) {
    const dependencyTaskId = normalizeText(dependency.dependency_task_id)
    if (!dependencyTaskId) continue
    const relation = findDependencyRelation([dependency], dependencyTaskId)
    if (!relation) continue

    const upstreamTask = params.tasksById.get(dependencyTaskId) ?? null
    const waitDays = estimateDependencyFactWaitDays({
      downstreamTask: params.task ?? null,
      upstreamTask,
      relation,
      calendar: params.calendar,
    })
    if (isCompletedTaskForCausalResponsibility(upstreamTask) && !waitDays) continue

    evidenceByDependency.set(dependencyTaskId, {
      dependencyTaskId,
      dependencyType: normalizeText(relation.dependency_type) || null,
      impactDays: waitDays,
      waitDays,
      floorRemainingDays: null,
      expectedFinishDate: readTaskDate(upstreamTask, ['actual_end_date', 'end_date', 'planned_end_date', 'plan_end', 'planned_end']),
      availableStartDate: readTaskDate(params.task, ['planned_start_date', 'plan_start', 'planned_start', 'start_date']),
      confidence: 'high',
      evidenceSource: 'task_dependencies',
      raw: { ...relation },
    })
  }

  return [...evidenceByDependency.values()]
}

function buildDependencyCauseChain(params: {
  taskId: string
  task?: PlanningTaskRow | null
  forecast?: ProgressDeviationDurationForecastRow | null
  tasksById: Map<string, PlanningTaskRow>
  dependenciesByTask: Map<string, ProgressDeviationTaskDependencyRow[]>
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationCauseChainItem[] {
  const taskId = normalizeText(params.taskId)
  if (!taskId) return []

  const forecastEvidence = collectForecastDependencyEvidence(params.forecast, params.calendar)
  const dependencies = params.dependenciesByTask.get(taskId) ?? []
  const impactedOwner = getTaskResponsibilityLabel(params.task ?? null)
  const forecastDependencyIds = new Set(forecastEvidence.map((evidence) => evidence.dependencyTaskId))
  const factEvidence = buildDependencyFactEvidence({
    task: params.task ?? null,
    tasksById: params.tasksById,
    dependencies,
    calendar: params.calendar,
  }).filter((evidence) => !forecastDependencyIds.has(evidence.dependencyTaskId))
  const dependencyEvidence = forecastEvidence.concat(factEvidence)
  if (dependencyEvidence.length === 0) return []

  const causeChain = dependencyEvidence
    .map((evidence) => {
      const upstreamTask = params.tasksById.get(evidence.dependencyTaskId) ?? null
      if (!upstreamTask) return null
      const hasPositiveImpactEvidence = (evidence.impactDays ?? 0) > 0 || (evidence.waitDays ?? 0) > 0
      if (isCompletedTaskForCausalResponsibility(upstreamTask) && !hasPositiveImpactEvidence) return null

      const relation = findDependencyRelation(dependencies, evidence.dependencyTaskId)
      const relationSources = [
        evidence.evidenceSource,
        relation ? 'task_dependencies' : null,
      ]
      const source = uniqueStrings(relationSources).join('; ')
      const trace = traceDependencyRoot({
        affectedTaskId: taskId,
        directDependencyTaskId: evidence.dependencyTaskId,
        tasksById: params.tasksById,
        dependenciesByTask: params.dependenciesByTask,
      })
      const rootCauseTask = params.tasksById.get(trace.rootTaskId) ?? upstreamTask
      const criticalPathImpact = resolveCriticalPathImpact(params.task ?? null)
      const responsibilityRole = trace.rootTaskId !== evidence.dependencyTaskId
        ? 'primary_accountable_subject'
        : 'direct_accountable_subject'

      return {
        id: `${taskId}:dependency_wait:${evidence.dependencyTaskId}`,
        cause_type: 'dependency_wait',
        reason: '\u4e0a\u6e38\u4efb\u52a1\u672a\u5b8c\u6210\u5f71\u54cd\u540e\u7eed\u5f00\u5de5',
        affected_task_id: taskId,
        affected_task_title: params.task?.title ?? null,
        upstream_task_id: evidence.dependencyTaskId,
        upstream_task_title: upstreamTask.title ?? null,
        direct_blocker_task_id: evidence.dependencyTaskId,
        direct_blocker_owner: getTaskResponsibilityLabel(upstreamTask),
        direct_blocker_owner_id: getTaskResponsibilityId(upstreamTask),
        root_cause_task_id: rootCauseTask?.id ?? evidence.dependencyTaskId,
        root_cause_owner: getTaskResponsibilityLabel(rootCauseTask),
        root_cause_owner_id: getTaskResponsibilityId(rootCauseTask),
        causal_depth: trace.causalDepth,
        causal_path_task_ids: trace.causalPathTaskIds,
        transmission_task_ids: trace.transmissionTaskIds,
        impacted_owner: impactedOwner,
        impacted_owner_id: getTaskResponsibilityId(params.task ?? null),
        accountable_owner: getTaskResponsibilityLabel(rootCauseTask),
        accountable_owner_id: getTaskResponsibilityId(rootCauseTask),
        responsibility_basis: 'upstream_dependency',
        responsibility_role: responsibilityRole,
        impact_days: evidence.impactDays,
        confidence: normalizeText(evidence.confidence) || normalizeText(params.forecast?.confidence_level) || null,
        evidence_source: source || evidence.evidenceSource,
        critical_path_impact: criticalPathImpact,
        evidence: {
          forecast_id: params.forecast?.id ?? null,
          dependency_relation_id: relation?.id ?? null,
          dependency_type: evidence.dependencyType ?? relation?.dependency_type ?? null,
          wait_days: evidence.waitDays,
          floor_remaining_days: evidence.floorRemainingDays,
          expected_finish_date: evidence.expectedFinishDate ?? null,
          available_start_date: evidence.availableStartDate ?? null,
          required_for_start: relation?.required_for_start ?? true,
          relation_status: relation?.status ?? null,
          direct_blocker_task_id: evidence.dependencyTaskId,
          root_cause_task_id: rootCauseTask?.id ?? evidence.dependencyTaskId,
          causal_path_task_ids: trace.causalPathTaskIds,
          critical_path_weight: criticalPathImpact.weight,
        },
      } satisfies ProgressDeviationCauseChainItem
    })
    .filter(Boolean) as ProgressDeviationCauseChainItem[]

  return causeChain.slice(0, 4)
}

function resolveFactResponsibility(value: unknown, tableName: 'task_conditions' | 'task_obstacles') {
  const raw = readRecord(value)
  const participantUnitName = normalizeText(raw.participant_unit_name)
  if (participantUnitName) {
    return {
      owner: participantUnitName,
      ownerId: normalizeText(raw.participant_unit_id) || null,
      source: `${tableName}.participant_unit_name`,
    }
  }

  const participantUnitId = normalizeText(raw.participant_unit_id)
  if (participantUnitId) {
    return {
      owner: `unit:${participantUnitId}`,
      ownerId: participantUnitId,
      source: `${tableName}.participant_unit_id`,
    }
  }

  const responsiblePerson = normalizeText(raw.responsible_person)
  if (responsiblePerson) {
    return {
      owner: responsiblePerson,
      ownerId: null,
      source: `${tableName}.responsible_person`,
    }
  }

  return null
}

function positiveDateWindowDays(
  start?: string | null,
  end?: string | null,
  calendar?: ConstructionCalendarContext | null,
) {
  if (!hasIdentifiedConstructionCalendar(calendar)) return null
  const days = delayDayDelta(start ?? null, end ?? null, calendar) ?? 0
  return days > 0 ? days : null
}

function buildConditionCauseChain(params: {
  taskId: string
  task?: PlanningTaskRow | null
  forecast?: ProgressDeviationDurationForecastRow | null
  conditions: TaskCondition[]
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationCauseChainItem[] {
  const impactedOwner = getTaskResponsibilityLabel(params.task ?? null)
  const impactedOwnerId = getTaskResponsibilityId(params.task ?? null)
  const externalReadinessEvidence = readForecastExternalReadinessEvidence(params.forecast)
  return params.conditions
    .filter((condition) => !condition.is_satisfied)
    .map((condition) => {
      const responsibility = resolveFactResponsibility(condition, 'task_conditions')
      if (!responsibility) return null
      const impactDays = positiveDateWindowDays(
        condition.due_date ?? condition.created_at ?? null,
        condition.updated_at ?? params.task?.updated_at ?? null,
        params.calendar,
      )
      return {
        id: `${params.taskId}:condition:${condition.id}`,
        cause_type: 'blocking_condition',
        reason: '\u5f00\u5de5\u6761\u4ef6\u672a\u6ee1\u8db3',
        affected_task_id: params.taskId,
        affected_task_title: params.task?.title ?? null,
        impacted_owner: impactedOwner,
        impacted_owner_id: impactedOwnerId,
        accountable_owner: responsibility.owner,
        accountable_owner_id: responsibility.ownerId,
        responsibility_basis: 'external_wait',
        impact_days: impactDays,
        confidence: 'high',
        evidence_source: uniqueStrings([
          responsibility.source,
          externalReadinessEvidence?.evidenceSource,
        ]).join('; '),
        evidence: {
          condition_id: condition.id,
          condition_name: condition.condition_name,
          condition_type: condition.condition_type,
          status: condition.status ?? null,
          due_date: condition.due_date ?? null,
          impact_window_start: condition.due_date ?? condition.created_at ?? null,
          impact_window_end: condition.updated_at ?? params.task?.updated_at ?? null,
          accountable_subject_id: responsibility.ownerId,
          responsible_person: (condition as unknown as Record<string, unknown>).responsible_person ?? null,
          forecast_external_readiness: externalReadinessEvidence?.readiness,
          forecast_external_readiness_impact_days: externalReadinessEvidence?.impactDays,
          forecast_external_readiness_breakdown: externalReadinessEvidence?.impactModeBreakdown,
        },
      } satisfies ProgressDeviationCauseChainItem
    })
    .filter(Boolean) as ProgressDeviationCauseChainItem[]
}

function buildObstacleCauseChain(params: {
  taskId: string
  task?: PlanningTaskRow | null
  forecast?: ProgressDeviationDurationForecastRow | null
  obstacles: TaskObstacle[]
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationCauseChainItem[] {
  const impactedOwner = getTaskResponsibilityLabel(params.task ?? null)
  const impactedOwnerId = getTaskResponsibilityId(params.task ?? null)
  const externalReadinessEvidence = readForecastExternalReadinessEvidence(params.forecast)
  return params.obstacles
    .filter((obstacle) => isActiveObstacle(obstacle))
    .map((obstacle) => {
      const responsibility = resolveFactResponsibility(obstacle, 'task_obstacles')
      if (!responsibility) return null
      const severity = normalizeText(obstacle.severity).toLowerCase()
      const impactDays = positiveDateWindowDays(
        obstacle.created_at ?? null,
        obstacle.updated_at ?? params.task?.updated_at ?? null,
        params.calendar,
      )
      return {
        id: `${params.taskId}:obstacle:${obstacle.id}`,
        cause_type: 'active_obstacle',
        reason: '\u73b0\u573a\u963b\u788d\u672a\u89e3\u9664',
        affected_task_id: params.taskId,
        affected_task_title: params.task?.title ?? null,
        impacted_owner: impactedOwner,
        impacted_owner_id: impactedOwnerId,
        accountable_owner: responsibility.owner,
        accountable_owner_id: responsibility.ownerId,
        responsibility_basis: 'obstacle_owner',
        impact_days: impactDays,
        confidence: severity === 'critical' || severity === 'high' ? 'high' : 'medium',
        evidence_source: uniqueStrings([
          responsibility.source,
          externalReadinessEvidence?.evidenceSource,
        ]).join('; '),
        evidence: {
          obstacle_id: obstacle.id,
          obstacle_type: (obstacle as unknown as Record<string, unknown>).obstacle_type ?? null,
          severity: obstacle.severity ?? null,
          status: obstacle.status ?? null,
          expected_resolution_date: obstacle.expected_resolution_date ?? obstacle.estimated_resolve_date ?? null,
          impact_window_start: obstacle.created_at ?? null,
          impact_window_end: obstacle.updated_at ?? params.task?.updated_at ?? null,
          accountable_subject_id: responsibility.ownerId,
          responsible_person: (obstacle as unknown as Record<string, unknown>).responsible_person ?? null,
          forecast_external_readiness: externalReadinessEvidence?.readiness,
          forecast_external_readiness_impact_days: externalReadinessEvidence?.impactDays,
          forecast_external_readiness_breakdown: externalReadinessEvidence?.impactModeBreakdown,
        },
      } satisfies ProgressDeviationCauseChainItem
    })
    .filter(Boolean) as ProgressDeviationCauseChainItem[]
}

function buildManualDelayReason(task: PlanningTaskRow | null, mode: DurationContributionMode): ProgressDeviationAttribution['delay_reasons'][number] | null {
  const taskId = normalizeText(task?.id)
  const reason = normalizeText(task?.delay_reason)
  if (!taskId || !reason || !canUseWindowAttribution(mode)) return null
  return {
    id: `${taskId}:manual_delay_reason`,
    reason: '\u4eba\u5de5\u5ef6\u671f\u8bf4\u660e',
    delay_reason: reason,
    status: 'manual',
    delayed_date: normalizeText(task?.updated_at) || null,
    reason_type: 'manual_delay_reason',
    source: 'tasks.delay_reason',
    priority: 50,
    responsibility_basis: 'manual',
  }
}

function getForecastTime(forecast: ProgressDeviationDurationForecastRow) {
  const time = new Date(normalizeText(forecast.generated_at ?? forecast.created_at)).getTime()
  return Number.isFinite(time) ? time : 0
}

function pickLatestForecast(forecasts: ProgressDeviationDurationForecastRow[]) {
  return forecasts
    .slice()
    .sort((left, right) => {
      const leftCurrent = left.is_current === true ? 1 : 0
      const rightCurrent = right.is_current === true ? 1 : 0
      if (rightCurrent !== leftCurrent) return rightCurrent - leftCurrent
      return getForecastTime(right) - getForecastTime(left)
    })[0] ?? null
}

function buildLatestForecastMap(forecasts: ProgressDeviationDurationForecastRow[]) {
  const byTask = new Map<string, ProgressDeviationDurationForecastRow[]>()
  for (const forecast of forecasts) {
    const taskId = normalizeText(forecast.task_id)
    if (!taskId) continue
    const bucket = byTask.get(taskId) ?? []
    bucket.push(forecast)
    byTask.set(taskId, bucket)
  }

  const latest = new Map<string, ProgressDeviationDurationForecastRow>()
  for (const [taskId, rows] of byTask.entries()) {
    const forecast = pickLatestForecast(rows)
    if (forecast) latest.set(taskId, forecast)
  }
  return latest
}

function resolveExecutionActualEndDate(task?: PlanningTaskRow | null): string | null {
  if (!task) return null
  const actualEndDate = normalizeText(task.actual_end_date)
  if (actualEndDate) return actualEndDate

  return null
}

function positiveDelayDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = toNullableNumber(value)
  return parsed === null ? null : Math.max(0, parsed)
}

function normalizeDeviationReasonLabel(reason?: string | null) {
  const normalized = normalizeText(reason)
  const labels: Record<string, string> = {
    'actual progress below planned target': '\u5b9e\u9645\u8fdb\u5ea6\u4f4e\u4e8e\u8ba1\u5212\u76ee\u6807',
    'missing execution record': '\u7f3a\u5c11\u6267\u884c\u8bb0\u5f55',
    'missing actual progress': '\u7f3a\u5c11\u5b9e\u9645\u8fdb\u5ea6',
    'completion date exceeds plan': '\u5b8c\u6210\u65e5\u671f\u665a\u4e8e\u8ba1\u5212',
    'carried over to current month': '\u6708\u5ea6\u8ba1\u5212\u7ed3\u8f6c',
    'mapping pending': '\u8ba1\u5212\u6620\u5c04\u5f85\u786e\u8ba4',
  }
  return labels[normalized] ?? normalized
}

function confidenceToWeight(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'high') return 1
  if (normalized === 'medium') return 0.72
  if (normalized === 'low') return 0.42
  const numeric = toNullableNumber(value)
  if (numeric !== null) return numeric > 1 ? Math.min(1, numeric / 100) : Math.max(0, Math.min(1, numeric))
  return 0.6
}

function pickTopCauseSignal(row: ProgressDeviationRow) {
  const chainCause = row.attribution?.cause_chain?.[0]
  if (chainCause) {
    const impactDays = positiveDelayDays(chainCause.impact_days)
    const confidence = confidenceToWeight(chainCause.confidence)
    const fallbackImpactDays = positiveDelayDays(row.deviation_days)
    const resolvedImpactDays = (impactDays ?? 0) > 0
      ? impactDays
      : fallbackImpactDays ?? impactDays
    return {
      reason: chainCause.reason || '\u4e0a\u6e38\u4efb\u52a1\u672a\u5b8c\u6210\u5f71\u54cd\u540e\u7eed\u5f00\u5de5',
      impactDays: resolvedImpactDays,
      confidence,
      score: ((resolvedImpactDays ?? 0) || 1) * (1 + confidence) + 6,
    }
  }
  const delayReason = row.attribution?.delay_reasons?.find((reason) => {
    if (!normalizeText(reason.reason)) return false
    const attributionRole = normalizeText(reason.attribution_role)
    if (attributionRole && attributionRole !== 'quantified_delay_signal') return false
    const quantificationBasis = normalizeText(reason.quantification_basis)
    if (quantificationBasis === 'confidence_only' || quantificationBasis === 'unknown_blocker_downweight') return false
    return (positiveDelayDays(reason.impact_days) ?? 0) > 0
  })
  if (delayReason) {
    const impactDays = positiveDelayDays(delayReason.impact_days)
    const confidence = confidenceToWeight(delayReason.confidence)
    const priority = toNumber(delayReason.priority, 50)
    return {
      reason: normalizeText(delayReason.reason),
      impactDays,
      confidence,
      score: ((impactDays ?? 0) || 1) * (1 + confidence) + priority / 20,
    }
  }
  if ((row.attribution?.active_obstacles?.length ?? 0) > 0) {
    const impactDays = positiveDelayDays(row.deviation_days)
    return { reason: '\u73b0\u573a\u963b\u788d\u672a\u89e3\u9664', impactDays, confidence: 0.68, score: ((impactDays ?? 0) || 1) * 1.68 + 3 }
  }
  if ((row.attribution?.blocking_conditions?.length ?? 0) > 0) {
    const impactDays = positiveDelayDays(row.deviation_days)
    return { reason: '\u5916\u90e8\u6761\u4ef6\u672a\u6ee1\u8db3', impactDays, confidence: 0.72, score: ((impactDays ?? 0) || 1) * 1.72 + 3 }
  }
  const impactDays = positiveDelayDays(row.deviation_days)
  return {
    reason: normalizeDeviationReasonLabel(row.reason) || '\u5f85\u8bc6\u522b\u539f\u56e0',
    impactDays,
    confidence: 0.5,
    score: ((impactDays ?? 0) || 1) * 1.5,
  }
}

function pickTopCauseReason(row: ProgressDeviationRow) {
  return pickTopCauseSignal(row).reason
}

function diffDays(
  planned?: string | null,
  actual?: string | null,
  calendar?: ConstructionCalendarContext | null,
): number | null {
  return delayDayDelta(planned, actual, calendar)
}

function buildProgressProductionDuration(
  value: number | null | undefined,
  calendar: ConstructionCalendarContext | null | undefined,
  asOf: string,
): DurationMetricDto {
  return buildConstructionProductionDayDurationMetric(value, {
    calendar,
    asOf,
    timezone: calendar?.timezone,
  })
}

function buildUnavailableProgressProductionDuration(
  calendar: ConstructionCalendarContext | null | undefined,
  asOf: string,
  reason: string,
): DurationMetricDto {
  const metric = buildProgressProductionDuration(null, calendar, asOf)
  return hasIdentifiedConstructionCalendar(calendar)
    ? { ...metric, unavailableReason: reason }
    : metric
}

function legacyDurationValue(metric: DurationMetricDto): number | null {
  return metric.availability === 'available' ? metric.value : null
}

function decorateProgressDeviationRows(
  rows: ProgressDeviationRow[],
  calendar: ConstructionCalendarContext | null | undefined,
  asOf: string,
): ProgressDeviationFactRow[] {
  return rows.map((row) => {
    const deviationDuration = buildProgressProductionDuration(row.deviation_days, calendar, asOf)
    const attribution: ProgressDeviationFactAttribution | null | undefined = row.attribution
      ? {
          ...row.attribution,
          delay_reasons: row.attribution.delay_reasons.map((reason) => {
            const isHistoricalForecastNumeric = normalizeText(reason.source).startsWith('task_duration_forecasts')
            const impactDuration = isHistoricalForecastNumeric
              ? buildUnavailableProgressProductionDuration(calendar, asOf, 'duration_source_metadata_missing')
              : buildProgressProductionDuration(reason.impact_days, calendar, asOf)
            return {
              ...reason,
              impact_days: legacyDurationValue(impactDuration),
              impact_duration: impactDuration,
            }
          }),
          cause_chain: row.attribution.cause_chain?.map((cause): ProgressDeviationFactCauseChainItem => {
            const impactDuration = buildProgressProductionDuration(cause.impact_days, calendar, asOf)
            const evidence: ProgressDeviationFactCauseChainItem['evidence'] = cause.evidence
              ? (() => {
                  const rawWaitDays = cause.evidence?.wait_days
                  const waitDuration = buildProgressProductionDuration(
                    toNullableNumber(rawWaitDays),
                    calendar,
                    asOf,
                  )
                  return {
                    ...cause.evidence,
                    wait_days: legacyDurationValue(waitDuration),
                    wait_duration: waitDuration,
                  }
                })()
              : undefined
            return {
              ...cause,
              impact_days: legacyDurationValue(impactDuration),
              impact_duration: impactDuration,
              evidence,
            }
          }),
        }
      : null

    return {
      ...row,
      deviation_days: legacyDurationValue(deviationDuration),
      deviation_duration: deviationDuration,
      attribution,
    }
  })
}

function decorateResponsibilityDurations(
  rows: ProgressDeviationResponsibilityContribution[],
  calendar: ConstructionCalendarContext | null | undefined,
  asOf: string,
): ProgressDeviationFactResponsibilityContribution[] {
  return rows.map((row) => {
    const impactDuration = buildProgressProductionDuration(row.impact_days, calendar, asOf)
    return {
      ...row,
      impact_days: legacyDurationValue(impactDuration),
      impact_duration: impactDuration,
    }
  })
}

function decorateCauseSummaryDurations(
  rows: ProgressDeviationCauseSummary[],
  calendar: ConstructionCalendarContext | null | undefined,
  asOf: string,
): ProgressDeviationFactCauseSummary[] {
  return rows.map((row) => {
    const impactDuration = buildProgressProductionDuration(row.impact_days, calendar, asOf)
    return {
      ...row,
      impact_days: legacyDurationValue(impactDuration),
      impact_duration: impactDuration,
    }
  })
}

function buildMainlineSummary(rows: ProgressDeviationRow[]): ProgressDeviationMainline['summary'] {
  const deviatedItems = rows.filter((row) => row.status !== 'on_track').length
  return {
    total_items: rows.length,
    deviated_items: deviatedItems,
    delayed_items: rows.filter((row) => row.status === 'delayed').length,
    unresolved_items: rows.filter((row) => row.status === 'unresolved').length,
  }
}

function classifyProgressRow(params: {
  plannedProgress?: number | null
  actualProgress?: number | null
  plannedEndDate?: string | null
  actualEndDate?: string | null
  allowCarryover?: boolean
  calendar?: ConstructionCalendarContext | null
}): { status: ProgressDeviationRowStatus; reason?: string | null } {
  const plannedProgress = params.plannedProgress ?? null
  const actualProgress = params.actualProgress ?? null
  const plannedEndDate = normalizeText(params.plannedEndDate)
  const actualEndDate = normalizeText(params.actualEndDate)

  if (actualProgress === null && !actualEndDate) {
    return { status: 'unresolved', reason: 'missing execution record' }
  }

  if (params.allowCarryover) {
    return { status: 'carried_over', reason: 'carried over to current month' }
  }

  if (plannedProgress === null) {
    if (plannedEndDate && actualEndDate && (diffDays(plannedEndDate, actualEndDate, params.calendar) ?? 0) > 0) {
      return { status: 'delayed', reason: 'completion date exceeds plan' }
    }
    return { status: 'on_track', reason: null }
  }

  if (actualProgress === null) {
    return { status: 'unresolved', reason: 'missing actual progress' }
  }

  if (actualProgress + 0.001 < plannedProgress) {
    return { status: 'delayed', reason: 'actual progress below planned target' }
  }

  return { status: 'on_track', reason: null }
}

function pickLatestSnapshot(snapshots: TaskProgressSnapshot[]) {
  return snapshots
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.snapshot_date || left.created_at).getTime()
      const rightTime = new Date(right.snapshot_date || right.created_at).getTime()
      return rightTime - leftTime
    })[0] ?? null
}

function getTaskLookup(tasks: PlanningTaskRow[]) {
  const byId = new Map<string, PlanningTaskRow>()
  const byBaselineItemId = new Map<string, PlanningTaskRow>()
  const byMonthlyPlanItemId = new Map<string, PlanningTaskRow>()

  for (const task of tasks) {
    byId.set(task.id, task)
    if (task.baseline_item_id) byBaselineItemId.set(task.baseline_item_id, task)
    if (task.monthly_plan_item_id) byMonthlyPlanItemId.set(task.monthly_plan_item_id, task)
  }

  return { byId, byBaselineItemId, byMonthlyPlanItemId }
}

async function tryFetchRowsDirect<T>(table: string, filters: Array<[string, unknown]> = []): Promise<T[] | undefined> {
  if (process.env.NODE_ENV === 'test') return undefined

  try {
    return await PROGRESS_DEVIATION_DIRECT_READS.byFilters(table, filters) as T[]
  } catch (error) {
    console.warn('[progressDeviationService] direct table read failed, falling back to Supabase REST', {
      table,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

async function tryFetchRowsInDirect<T>(
  table: string,
  column: string,
  values: unknown[],
  projectId: string,
): Promise<T[] | undefined> {
  if (process.env.NODE_ENV === 'test' || values.length === 0) return undefined

  try {
    return await PROGRESS_DEVIATION_DIRECT_READS.byTaskIds(table, column, values, projectId) as T[]
  } catch (error) {
    console.warn('[progressDeviationService] direct IN read failed, falling back to Supabase REST', {
      table,
      column,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

async function fetchRows<T>(table: string, filters: Array<[string, unknown]> = []): Promise<T[]> {
  const directRows = await tryFetchRowsDirect<T>(table, filters)
  if (directRows) return directRows

  let query: any = supabase.from(table).select('*')
  for (const [column, value] of filters) {
    query = query.eq(column, value)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as T[]
}

async function fetchRowsIn<T>(table: string, column: string, values: unknown[], projectId: string): Promise<T[]> {
  if (values.length === 0) return []

  const directRows = await tryFetchRowsInDirect<T>(table, column, values, projectId)
  if (directRows) return directRows

  let query: any = supabase.from(table).select('*').in(column, values as any[])
  if (['task_duration_forecasts', 'task_obstacles', 'task_dependencies'].includes(table)) {
    query = query.eq('project_id', projectId)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as T[]
}

async function fetchSingleRow<T>(table: string, filters: Array<[string, unknown]> = []): Promise<T | null> {
  const rows = await fetchRows<T>(table, filters)
  return rows[0] ?? null
}

async function getProjectRecipients(projectId: string) {
  const [projects, members] = await Promise.all([
    fetchRows<ProjectOwnerRow>('projects', [['id', projectId]]),
    fetchRows<ProjectMemberRow>('project_members', [['project_id', projectId]]),
  ])

  return uniqueStrings([
    projects[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level) === 'owner')
      .map((member) => member.user_id),
  ])
}

async function resolveMonthlyPlan(projectId: string, monthlyPlanVersionId?: string | null): Promise<MonthlyPlan | null> {
  if (monthlyPlanVersionId) {
    const plan = await fetchSingleRow<MonthlyPlan>('monthly_plans', [
      ['project_id', projectId],
      ['id', monthlyPlanVersionId],
    ])
    if (!plan) {
      throw new ProgressDeviationServiceError('NOT_FOUND', 'monthly plan version not found', 404)
    }
    return plan
  }

  const plans = await fetchRows<MonthlyPlan>('monthly_plans', [['project_id', projectId]])
  return plans
    .slice()
    .sort((left, right) => toNumber(right.version) - toNumber(left.version))[0] ?? null
}

function resolveDeviationPlannedProgress(input:
  | { mainline: 'execution', task: PlanningTaskRow }
  | { mainline: 'baseline' | 'monthly_plan', targetProgress: unknown }
): number | null {
  // Deviation rows compare three frames: baseline/monthly-plan use committed target_progress; execution uses the live task schedule anchor.
  if (input.mainline === 'execution') {
    return calculateTaskPlannedProgress(input.task)
  }

  return normalizeProgressValue(input.targetProgress)
}

function buildBaselineRows(params: {
  projectId: string
  baselineVersionId: string
  baselineItems: TaskBaselineItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationRow[] {
  const { byId, byBaselineItemId } = getTaskLookup(params.tasks)

  return params.baselineItems.map((item) => {
    const task = byBaselineItemId.get(item.id) ?? (item.source_task_id ? byId.get(item.source_task_id) ?? null : null)
    const snapshot = task ? params.latestSnapshots.get(task.id) ?? null : null
    const plannedProgress = resolveDeviationPlannedProgress({
      mainline: 'baseline',
      targetProgress: item.target_progress,
    })
    const actualProgress = task ? toNullableNumber(task.progress) : snapshot ? toNullableNumber(snapshot.progress) : null
    const actualEndDate = resolveExecutionActualEndDate(task)
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: item.planned_end_date ?? null,
      actualEndDate,
      calendar: params.calendar,
    })
    const mappingStatus = translateMappingStatus(item.mapping_status ?? null)
    const durationContributionMode = resolveDurationContributionMode(task, item)

    return {
      id: item.id,
      project_id: params.projectId,
      mainline: 'baseline',
      source_version_id: params.baselineVersionId,
      source_item_id: item.id,
      source_task_id: task?.id ?? null,
      title: item.title,
      planned_date: item.planned_end_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: actualEndDate,
      deviation_days: diffDays(item.planned_end_date ?? null, actualEndDate, params.calendar),
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: mappingStatus === 'mapping_pending' ? classification.reason ?? 'mapping pending' : classification.reason ?? null,
      duration_contribution_mode: durationContributionMode,
      mapping_status: mappingStatus,
      merged_into: null,
      child_group: null,
    }
  })
}

function buildMonthlyPlanRows(params: {
  projectId: string
  monthlyPlanVersionId: string
  monthlyPlanItems: MonthlyPlanItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationRow[] {
  const { byId, byMonthlyPlanItemId, byBaselineItemId } = getTaskLookup(params.tasks)

  return params.monthlyPlanItems.map((item) => {
    const task =
      byMonthlyPlanItemId.get(item.id) ??
      (item.source_task_id ? byId.get(item.source_task_id) ?? null : null) ??
      (item.baseline_item_id ? byBaselineItemId.get(item.baseline_item_id) ?? null : null)
    const snapshot = task ? params.latestSnapshots.get(task.id) ?? null : null
    const plannedProgress = resolveDeviationPlannedProgress({
      mainline: 'monthly_plan',
      targetProgress: item.target_progress,
    })
    const actualProgress = task
      ? toNullableNumber(task.progress)
      : item.current_progress ?? (snapshot ? toNullableNumber(snapshot.progress) : null)
    const actualEndDate = resolveExecutionActualEndDate(task)
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: item.planned_end_date ?? null,
      actualEndDate,
      allowCarryover: item.commitment_status === 'carried_over',
      calendar: params.calendar,
    })
    const durationContributionMode = resolveDurationContributionMode(task, item)

    return {
      id: item.id,
      project_id: params.projectId,
      mainline: 'monthly_plan',
      source_version_id: params.monthlyPlanVersionId,
      source_item_id: item.id,
      source_task_id: task?.id ?? null,
      title: item.title,
      planned_date: item.planned_end_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: actualEndDate,
      deviation_days: diffDays(item.planned_end_date ?? null, actualEndDate, params.calendar),
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: classification.reason ?? null,
      duration_contribution_mode: durationContributionMode,
      mapping_status: 'mapped',
      merged_into: null,
      child_group: null,
    }
  })
}

function buildExecutionRows(params: {
  projectId: string
  baselineVersionId: string
  monthlyPlanVersionId: string | null
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationRow[] {
  return params.tasks.map((task) => {
    const snapshot = params.latestSnapshots.get(task.id) ?? null
    const plannedProgress = resolveDeviationPlannedProgress({ mainline: 'execution', task })
    const actualProgress = toNullableNumber(task.progress)
    const actualEndDate = resolveExecutionActualEndDate(task)
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: task.planned_end_date ?? snapshot?.snapshot_date ?? null,
      actualEndDate,
      calendar: params.calendar,
    })
    const durationContributionMode = resolveDurationContributionMode(task)

    return {
      id: task.id,
      project_id: params.projectId,
      mainline: 'execution',
      source_version_id: snapshot?.monthly_plan_version_id ?? snapshot?.baseline_version_id ?? params.monthlyPlanVersionId ?? params.baselineVersionId,
      source_item_id: snapshot?.monthly_plan_item_id ?? snapshot?.baseline_item_id ?? null,
      source_task_id: task.id,
      title: task.title,
      planned_date: task.planned_end_date ?? snapshot?.snapshot_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: actualEndDate,
      deviation_days: diffDays(
        task.planned_end_date ?? snapshot?.snapshot_date ?? null,
        actualEndDate,
        params.calendar,
      ),
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: classification.reason ?? null,
      duration_contribution_mode: durationContributionMode,
      mapping_status: 'mapped',
      merged_into: null,
      child_group: null,
    }
  })
}

function buildLatestSnapshotMap(snapshots: TaskProgressSnapshot[]) {
  const latestByTask = new Map<string, TaskProgressSnapshot[]>()

  for (const snapshot of snapshots) {
    const list = latestByTask.get(snapshot.task_id) ?? []
    list.push(snapshot)
    latestByTask.set(snapshot.task_id, list)
  }

  const latest = new Map<string, TaskProgressSnapshot>()
  for (const [taskId, rows] of latestByTask.entries()) {
    latest.set(taskId, pickLatestSnapshot(rows))
  }

  return latest
}

function buildAttributionMap<T extends { task_id?: string | null }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const taskId = normalizeText(row.task_id)
    if (!taskId) continue
    const bucket = map.get(taskId) ?? []
    bucket.push(row)
    map.set(taskId, bucket)
  }
  return map
}

function buildRowAttribution(params: {
  taskId?: string | null
  task?: PlanningTaskRow | null
  durationContributionMode: DurationContributionMode
  latestForecasts: Map<string, ProgressDeviationDurationForecastRow>
  tasksById: Map<string, PlanningTaskRow>
  dependenciesByTask: Map<string, ProgressDeviationTaskDependencyRow[]>
  conditionsByTask: Map<string, TaskCondition[]>
  obstaclesByTask: Map<string, TaskObstacle[]>
  calendar?: ConstructionCalendarContext | null
}): ProgressDeviationAttribution | null {
  const taskId = normalizeText(params.taskId)
  if (!taskId) return null

  const rawBlockingConditions = (params.conditionsByTask.get(taskId) ?? [])
    .filter((condition) => !condition.is_satisfied)
  const blockingConditions = rawBlockingConditions
    .map((condition) => ({
      id: condition.id,
      title: condition.condition_name,
      due_date: condition.due_date ?? null,
      status: condition.status ?? null,
    }))

  const rawActiveObstacles = (params.obstaclesByTask.get(taskId) ?? [])
    .filter((obstacle) => isActiveObstacle(obstacle))
  const activeObstacles = rawActiveObstacles
    .map((obstacle) => ({
      id: obstacle.id,
      description: obstacle.description,
      severity: obstacle.severity ?? null,
      status: obstacle.status ?? null,
      expected_resolution_date: obstacle.expected_resolution_date ?? obstacle.estimated_resolve_date ?? null,
    }))

  const forecast = params.latestForecasts.get(taskId) ?? null
  const hasExternalReadinessFactAnchor = rawBlockingConditions
    .some((condition) => Boolean(resolveFactResponsibility(condition, 'task_conditions')))
    || rawActiveObstacles
      .some((obstacle) => Boolean(resolveFactResponsibility(obstacle, 'task_obstacles')))
  const delayReasons: ProgressDeviationAttribution['delay_reasons'] = [
    ...buildForecastDelayReasons({
      taskId,
      forecast,
      durationContributionMode: params.durationContributionMode,
      hasExternalReadinessFactAnchor,
    }),
  ]
  const manualReason = buildManualDelayReason(params.task ?? null, params.durationContributionMode)
  if (manualReason) delayReasons.push(manualReason)
  const causeChain = buildDependencyCauseChain({
    taskId,
    task: params.task ?? null,
    forecast,
    tasksById: params.tasksById,
    dependenciesByTask: params.dependenciesByTask,
    calendar: params.calendar,
  })
    .concat(buildConditionCauseChain({
      taskId,
      task: params.task ?? null,
      forecast,
      conditions: rawBlockingConditions,
      calendar: params.calendar,
    }))
    .concat(buildObstacleCauseChain({
      taskId,
      task: params.task ?? null,
      forecast,
      obstacles: rawActiveObstacles,
      calendar: params.calendar,
    }))

  if (blockingConditions.length === 0 && activeObstacles.length === 0 && delayReasons.length === 0 && causeChain.length === 0) {
    return null
  }

  return {
    blocking_conditions: blockingConditions,
    active_obstacles: activeObstacles,
    delay_reasons: delayReasons,
    cause_chain: causeChain,
  }
}

function buildRowCompleteness(params: {
  row: ProgressDeviationRow
  latestSnapshots: Map<string, TaskProgressSnapshot>
  attribution: ProgressDeviationAttribution | null
}): ProgressDeviationDataCompleteness {
  const taskId = normalizeText(params.row.source_task_id)
  const hasSnapshot = taskId ? params.latestSnapshots.has(taskId) : false
  const hasPlanningLink = Boolean(params.row.source_item_id || params.row.source_task_id)
  const hasAttribution = Boolean(
    params.attribution &&
    (
      params.attribution.blocking_conditions.length > 0 ||
      params.attribution.active_obstacles.length > 0 ||
      params.attribution.delay_reasons.length > 0 ||
      (params.attribution.cause_chain?.length ?? 0) > 0
    ),
  )

  return {
    has_snapshot: hasSnapshot,
    has_actual_progress: params.row.actual_progress !== null && params.row.actual_progress !== undefined,
    has_planning_link: hasPlanningLink,
    has_attribution: hasAttribution,
  }
}

function getTaskResponsibilityLabel(task?: PlanningTaskRow | null): string {
  if (!task) return '未指定责任主体'

  const raw = task as unknown as Record<string, unknown>
  return normalizeText(
    raw.participant_unit_name ??
    raw.assignee_name ??
    raw.assignee ??
    raw.owner_name ??
    raw.owner ??
    task.title
  ) || '未指定责任主体'
}

function getTaskResponsibilityId(task?: PlanningTaskRow | null): string | null {
  if (!task) return null
  const raw = task as unknown as Record<string, unknown>
  return normalizeText(
    raw.participant_unit_id ??
    raw.assignee_user_id ??
    raw.assignee_id ??
    raw.owner_id,
  ) || null
}

function buildMonthlyDeviationBuckets(rows: ProgressDeviationRow[]): ProgressDeviationChartData['monthly_buckets'] {
  const buckets = new Map<string, ProgressDeviationChartData['monthly_buckets'][number]>()

  for (const row of rows) {
    const sourceDate = normalizeText(row.planned_date ?? row.actual_date)
    const month = sourceDate ? (sourceDate.length >= 7 ? sourceDate.slice(0, 7) : sourceDate) : '未分组'
    const bucket = buckets.get(month) ?? {
      month,
      on_track: 0,
      delayed: 0,
      carried_over: 0,
      revised: 0,
      unresolved: 0,
    }

    switch (row.status) {
      case 'on_track':
        bucket.on_track += 1
        break
      case 'carried_over':
        bucket.carried_over += 1
        break
      case 'revised':
        bucket.revised += 1
        break
      case 'unresolved':
        bucket.unresolved += 1
        break
      default:
        bucket.delayed += 1
        break
    }

    buckets.set(month, bucket)
  }

  return [...buckets.values()].sort((left, right) => left.month.localeCompare(right.month))
}

function pickResponsibilityBasis(row: ProgressDeviationRow) {
  const chainBasis = normalizeText(row.attribution?.cause_chain?.[0]?.responsibility_basis)
  if (chainBasis) return chainBasis
  const quantifiedReason = row.attribution?.delay_reasons?.find((reason) => {
    const attributionRole = normalizeText(reason.attribution_role)
    if (attributionRole && attributionRole !== 'quantified_delay_signal') return false
    return (positiveDelayDays(reason.impact_days) ?? 0) > 0
  })
  const reasonBasis = normalizeText(quantifiedReason?.responsibility_basis)
  if (reasonBasis) return reasonBasis
  if ((row.attribution?.active_obstacles?.length ?? 0) > 0) return 'owner_scope'
  if ((row.attribution?.blocking_conditions?.length ?? 0) > 0) return 'external_wait'
  return 'owner_scope'
}

function buildResponsibilityContribution(
  rows: ProgressDeviationRow[],
  tasks: PlanningTaskRow[],
): ProgressDeviationResponsibilityContribution[] {
  const deviationRows = rows.filter((row) => row.status !== 'on_track')
  if (deviationRows.length === 0) return []

  const { byId } = getTaskLookup(tasks)
  const seenKeys = new Set<string>()
  const uniqueRows: ProgressDeviationRow[] = []
  for (const row of deviationRows) {
    const key = normalizeText(row.source_task_id) || row.id
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    uniqueRows.push(row)
  }

  const total = Math.max(uniqueRows.length, 1)
  const buckets = new Map<string, {
    owner: string
    ownerId: string | null
    count: number
    taskIds: string[]
    causalTaskIds: string[]
    basisCounts: Map<string, number>
    confidenceSum: number
    confidenceWeightedSum: number
    weightedCount: number
    impactDays: number
    hasUnknownImpact: boolean
    criticalPathWeight: number
    priorityScore: number
    evidenceSources: string[]
    roleCounts: Map<string, number>
    adjudicationRoleCounts: Map<string, number>
    transmissionTaskIds: string[]
  }>()

  for (const row of uniqueRows) {
    const task = row.source_task_id ? byId.get(row.source_task_id) ?? null : null
    const causeChain = row.attribution?.cause_chain ?? []
    const contributions = causeChain.length > 0
      ? (() => {
        const weightedCauses = causeChain.map((chain) => {
          const impactDays = positiveDelayDays(chain.impact_days)
          return {
            owner: chain.accountable_owner,
            ownerId: chain.accountable_owner_id ?? null,
            basis: chain.responsibility_basis,
            role: 'accountable_subject',
            adjudicationRole: chain.responsibility_role ?? null,
            confidence: chain.confidence,
            causalTaskId: chain.root_cause_task_id ?? chain.upstream_task_id ?? null,
            transmissionTaskIds: chain.transmission_task_ids ?? [],
            impactDays,
            criticalPathWeight: Math.max(1, toNumber(chain.critical_path_impact?.weight, 1)),
            evidenceSource: chain.evidence_source ?? null,
            weightBase: (impactDays ?? 0) > 0 ? impactDays as number : 1,
          }
        })
        const totalWeightBase = weightedCauses.reduce((sum, item) => sum + item.weightBase, 0) || weightedCauses.length || 1
        return weightedCauses.map((item) => ({
          ...item,
          weightedCount: item.weightBase / totalWeightBase,
        }))
      })()
      : [{
        owner: getTaskResponsibilityLabel(task),
        ownerId: getTaskResponsibilityId(task),
        basis: pickResponsibilityBasis(row),
        role: 'execution_owner',
        adjudicationRole: null,
        confidence: row.attribution?.delay_reasons?.[0]?.confidence ?? null,
        causalTaskId: null,
        transmissionTaskIds: [],
        impactDays: positiveDelayDays(row.deviation_days),
        criticalPathWeight: 1,
        evidenceSource: row.attribution?.delay_reasons?.[0]?.source ?? null,
        weightedCount: 1,
      }]

    for (const contribution of contributions) {
      const owner = normalizeText(contribution.owner) || '未指定责任主体'
      const ownerId = normalizeText(contribution.ownerId) || null
      const basis = normalizeText(contribution.basis) || 'owner_scope'
      const role = normalizeText(contribution.role) || 'execution_owner'
      const bucketKey = `${ownerId || owner}::${role}::${basis}`
      const bucket = buckets.get(bucketKey) ?? {
        owner,
        ownerId,
        count: 0,
        taskIds: [],
        causalTaskIds: [],
        basisCounts: new Map<string, number>(),
        confidenceSum: 0,
        confidenceWeightedSum: 0,
        weightedCount: 0,
        impactDays: 0,
        hasUnknownImpact: false,
        criticalPathWeight: 1,
        priorityScore: 0,
        evidenceSources: [],
        roleCounts: new Map<string, number>(),
        adjudicationRoleCounts: new Map<string, number>(),
        transmissionTaskIds: [],
      }
      bucket.count += 1
      bucket.basisCounts.set(basis, (bucket.basisCounts.get(basis) || 0) + 1)
      bucket.roleCounts.set(role, (bucket.roleCounts.get(role) || 0) + 1)
      const adjudicationRole = normalizeText(contribution.adjudicationRole)
      if (adjudicationRole) {
        bucket.adjudicationRoleCounts.set(adjudicationRole, (bucket.adjudicationRoleCounts.get(adjudicationRole) || 0) + 1)
      }
      bucket.confidenceSum += confidenceToWeight(contribution.confidence)
      bucket.confidenceWeightedSum += confidenceToWeight(contribution.confidence) * contribution.weightedCount
      bucket.weightedCount += contribution.weightedCount
      const impactDays = contribution.impactDays === null ? null : Math.max(0, contribution.impactDays)
      const criticalPathWeight = Math.max(1, contribution.criticalPathWeight)
      if (impactDays === null) {
        bucket.hasUnknownImpact = true
      } else {
        bucket.impactDays += impactDays
      }
      bucket.criticalPathWeight = Math.max(bucket.criticalPathWeight, criticalPathWeight)
      bucket.priorityScore += ((impactDays ?? 0) > 0 ? impactDays as number : contribution.weightedCount) * criticalPathWeight
      const evidenceSource = normalizeText(contribution.evidenceSource)
      if (evidenceSource) {
        bucket.evidenceSources = uniqueStrings([...bucket.evidenceSources, ...evidenceSource.split('; ')])
      }
      if (row.source_task_id && !bucket.taskIds.includes(row.source_task_id)) {
        bucket.taskIds.push(row.source_task_id)
      }
      const causalTaskId = normalizeText(contribution.causalTaskId)
      if (causalTaskId && !bucket.causalTaskIds.includes(causalTaskId)) {
        bucket.causalTaskIds.push(causalTaskId)
      }
      for (const transmissionTaskId of contribution.transmissionTaskIds) {
        const normalizedTransmissionTaskId = normalizeText(transmissionTaskId)
        if (normalizedTransmissionTaskId && !bucket.transmissionTaskIds.includes(normalizedTransmissionTaskId)) {
          bucket.transmissionTaskIds.push(normalizedTransmissionTaskId)
        }
      }
      buckets.set(bucketKey, bucket)
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const basis = [...bucket.basisCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'owner_scope'
      const role = [...bucket.roleCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'execution_owner'
      const adjudicationRolePriority = (value: string) => value === 'primary_accountable_subject' ? 3 : value === 'direct_accountable_subject' ? 2 : 1
      const adjudicationRole = [...bucket.adjudicationRoleCounts.entries()]
        .sort((left, right) => right[1] - left[1] || adjudicationRolePriority(right[0]) - adjudicationRolePriority(left[0]))[0]?.[0] ?? null
      return {
        owner: bucket.owner,
        owner_id: bucket.ownerId,
        count: bucket.count,
        percentage: round1((bucket.count / total) * 100),
        task_ids: bucket.taskIds,
        causal_task_ids: bucket.causalTaskIds,
        basis,
        confidence: round1(((bucket.weightedCount > 0 ? bucket.confidenceWeightedSum / bucket.weightedCount : bucket.confidenceSum / Math.max(bucket.count, 1))) * 100),
        responsibility_role: role,
        adjudication_role: adjudicationRole,
        transmission_task_ids: bucket.transmissionTaskIds,
        impact_days: bucket.hasUnknownImpact ? null : round1(bucket.impactDays),
        critical_path_weight: round1(bucket.criticalPathWeight),
        priority_score: round1(bucket.priorityScore),
        weighted_count: round1(bucket.weightedCount),
        weighted_percentage: round1((bucket.weightedCount / total) * 100),
        evidence_sources: bucket.evidenceSources,
      }
    })
    .sort((left, right) => {
      const leftRolePriority = left.responsibility_role === 'accountable_subject' ? 1 : 0
      const rightRolePriority = right.responsibility_role === 'accountable_subject' ? 1 : 0
      return rightRolePriority - leftRolePriority
        || (right.priority_score ?? 0) - (left.priority_score ?? 0)
        || (right.weighted_count ?? 0) - (left.weighted_count ?? 0)
        || right.count - left.count
        || (right.confidence ?? 0) - (left.confidence ?? 0)
    })
    .slice(0, 6)
}

function buildTopDeviationCauses(rows: ProgressDeviationRow[]): ProgressDeviationCauseSummary[] {
  const deviationRows = rows.filter((row) => row.status !== 'on_track')
  if (deviationRows.length === 0) return []

  const signalByUniqueRow = new Map<string, ReturnType<typeof pickTopCauseSignal>>()
  for (const row of deviationRows) {
    const key = normalizeText(row.source_task_id) || row.id
    const signal = pickTopCauseSignal(row)
    const previous = signalByUniqueRow.get(key)
    if (!previous || signal.score > previous.score) {
      signalByUniqueRow.set(key, signal)
    }
  }

  const total = Math.max(signalByUniqueRow.size, 1)
  const buckets = new Map<string, { reason: string; count: number; impactDays: number; hasUnknownImpact: boolean; confidenceSum: number; score: number }>()
  for (const signal of signalByUniqueRow.values()) {
    const bucket = buckets.get(signal.reason) ?? { reason: signal.reason, count: 0, impactDays: 0, hasUnknownImpact: false, confidenceSum: 0, score: 0 }
    bucket.count += 1
    if (signal.impactDays === null) {
      bucket.hasUnknownImpact = true
    } else {
      bucket.impactDays += signal.impactDays
    }
    bucket.confidenceSum += signal.confidence
    bucket.score += signal.score
    buckets.set(signal.reason, bucket)
  }

  return [...buckets.values()]
    .map((bucket) => ({
      reason: bucket.reason,
      count: bucket.count,
      percentage: round1((bucket.count / total) * 100),
      impact_days: bucket.hasUnknownImpact ? null : round1(bucket.impactDays),
      confidence: round1((bucket.confidenceSum / Math.max(bucket.count, 1)) * 100),
      score: round1(bucket.score),
    }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.count - left.count)
    .slice(0, 3)
}

type ProgressDeviationScheduleStateRow = {
  state?: string | null
  confidence_score?: number | string | null
  scope_type?: string | null
  scope_id?: string | null
  window_end_date?: string | null
}

function buildScheduleStateDeviationCauses(rows: ProgressDeviationScheduleStateRow[]): ProgressDeviationCauseSummary[] {
  const latestByState = new Map<string, ProgressDeviationScheduleStateRow>()
  const ordered = rows.slice().sort((left, right) => new Date(normalizeText(right.window_end_date)).getTime() - new Date(normalizeText(left.window_end_date)).getTime())
  for (const row of ordered) {
    const state = normalizeText(row.state)
    if (!state || latestByState.has(state)) continue
    latestByState.set(state, row)
  }

  const labelByState: Record<string, string> = {
    accelerating: '\u4e3b\u52a8\u8d76\u5de5\u6216\u5c40\u90e8\u8d76\u5de5\u6b63\u5728\u62b5\u6d88\u504f\u5dee',
    recovery: '\u963b\u788d\u89e3\u9664\u540e\u8fdb\u5165\u6062\u590d\u8d76\u5de5',
    blocked: '\u9879\u76ee\u6216\u5c40\u90e8\u8303\u56f4\u4ecd\u5904\u4e8e\u53d7\u963b\u72b6\u6001',
    overcompressed: '\u5e76\u884c\u8fc7\u5bc6\u4f46\u541e\u5410\u672a\u6709\u6548\u6539\u5584\uff0c\u5b58\u5728\u65e0\u5e8f\u62a2\u5de5\u6216\u8d85\u8d1f\u8377\u5e76\u884c',
    low_confidence: '\u8fdb\u5ea6\u6570\u636e\u8d28\u91cf\u4e0d\u8db3\uff0c\u504f\u5dee\u5f52\u56e0\u53ef\u4fe1\u5ea6\u4e0b\u964d',
  }

  return [...latestByState.values()]
    .map((row) => {
      const state = normalizeText(row.state)
      const confidence = toNumber(row.confidence_score, 0)
      const reason = labelByState[state]
      if (!reason) return null
      return {
        reason,
        count: Math.max(1, Math.round(confidence * 10)),
        percentage: round1(confidence * 100),
        confidence: round1(confidence * 100),
        score: round1(confidence * 20),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
}

function enrichDeviationRows(params: {
  rows: ProgressDeviationRow[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  latestForecasts: Map<string, ProgressDeviationDurationForecastRow>
  dependenciesByTask: Map<string, ProgressDeviationTaskDependencyRow[]>
  conditionsByTask: Map<string, TaskCondition[]>
  obstaclesByTask: Map<string, TaskObstacle[]>
  calendar?: ConstructionCalendarContext | null
}) {
  const { byId } = getTaskLookup(params.tasks)

  return params.rows.map((row) => {
    const taskId = normalizeText(row.source_task_id)
    const task = taskId ? byId.get(taskId) ?? null : null
    const durationContributionMode = normalizeDurationContributionMode(row.duration_contribution_mode) ?? 'duration_bearing'
    const attribution = buildRowAttribution({
      taskId,
      task,
      durationContributionMode,
      latestForecasts: params.latestForecasts,
      tasksById: byId,
      dependenciesByTask: params.dependenciesByTask,
      conditionsByTask: params.conditionsByTask,
      obstaclesByTask: params.obstaclesByTask,
      calendar: params.calendar,
    })

    return {
      ...row,
      duration_contribution_mode: durationContributionMode,
      attribution,
      data_completeness: buildRowCompleteness({
        row,
        latestSnapshots: params.latestSnapshots,
        attribution,
      }),
    }
  })
}

async function syncProgressDeviationDataGapNotification(projectId: string, rows: ProgressDeviationRow[]) {
  const recipients = await getProjectRecipients(projectId)
  const existing = await listNotifications({ projectId, sourceEntityType: 'progress_deviation_data_gap' })
  const activeExisting = existing.filter((item) => String(item.status ?? '').trim().toLowerCase() !== 'resolved')

  const gapRows = rows.filter((row) => {
    const completeness = row.data_completeness
    if (!completeness) return false
    return !completeness.has_snapshot || !completeness.has_actual_progress || !completeness.has_planning_link
  })

  if (gapRows.length === 0 || recipients.length === 0) {
    await Promise.all(
      activeExisting.map((item) => updateNotificationById(item.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        is_read: true,
      }, item)),
    )
    return null
  }

  const sampleRows = gapRows.slice(0, 3)
  const gapSummary = sampleRows
    .map((row) => {
      const missing: string[] = []
      if (!row.data_completeness?.has_snapshot) missing.push('快照')
      if (!row.data_completeness?.has_actual_progress) missing.push('实际进度')
      if (!row.data_completeness?.has_planning_link) missing.push('计划映射')
      return `${row.title}缺少${missing.join('/')}`
    })
    .join('、')
  const current = activeExisting[0]
  const payload: Notification = {
    id: current?.id ?? '',
    project_id: projectId,
    type: 'progress_deviation_data_gap',
    notification_type: 'flow-reminder',
    severity: 'warning',
    level: 'warning',
    title: '偏差分析数据存在缺口',
    content: `当前有 ${gapRows.length} 条偏差记录存在数据缺口。${gapSummary}`,
    is_read: current?.is_read ?? false,
    is_broadcast: false,
    source_entity_type: 'progress_deviation_data_gap',
    source_entity_id: projectId,
    category: 'planning_governance',
    recipients,
    status: current?.status ?? 'unread',
    metadata: {
      gap_count: gapRows.length,
      sample_rows: sampleRows.map((row) => ({
        id: row.id,
        title: row.title,
        mainline: row.mainline,
      })),
    },
    created_at: current?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (current) {
    await updateNotificationById(current.id, {
      title: payload.title,
      content: payload.content,
      severity: payload.severity,
      level: payload.level,
      status: 'unread',
      is_read: false,
      recipients,
      metadata: payload.metadata,
      resolved_at: null,
      updated_at: payload.updated_at,
    }, current)
    return { ...current, ...payload, status: 'unread', is_read: false, resolved_at: null } as Notification
  }

  return await notificationTouchpointService.emit({
    ...payload,
    touchpoint_type: 'dashboard_todo',
    scope_type: 'project',
    dedupe_key: `progress_deviation_data_gap:${projectId}`,
    target_route: `/projects/${projectId}/reports`,
    target_label: '查看偏差分析',
  })
}

function toVersionLabel(version?: number | null, fallbackId?: string | null) {
  if (Number.isFinite(version as number)) {
    return `v${version}`
  }
  return normalizeText(fallbackId) || 'unknown'
}

function translateMappingStatus(status?: string | null): ProgressDeviationMappingStatus {
  if (status === 'pending' || status === 'missing') {
    return 'mapping_pending'
  }
  if (status === 'merged') {
    return 'merged_into'
  }
  return 'mapped'
}

function pickLatestDate(values: Array<string | null | undefined>): string | null {
  const ordered = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())
  return ordered[0] ?? null
}

function deriveSplitProgress(childRows: ProgressDeviationRow[], lastCompletedDate: string | null) {
  const numericValues = childRows
    .map((row) => {
      if (row.actual_progress !== null && row.actual_progress !== undefined) {
        return row.actual_progress
      }
      if (row.actual_date) {
        return 100
      }
      return null
    })
    .filter((value): value is number => value !== null)

  if (numericValues.length > 0) {
    return round1(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
  }

  if (lastCompletedDate) {
    return 100
  }

  return null
}

function buildChildGroupForParent(params: {
  parent: TaskBaselineItem
  childRows: ProgressDeviationRow[]
}): ProgressDeviationChildGroup {
  const lastCompletedDate = pickLatestDate(params.childRows.map((row) => row.actual_date ?? null))

  return {
    group_id: params.parent.id,
    parent_item_id: params.parent.id,
    parent_title: params.parent.title,
    child_count: params.childRows.length,
    last_completed_date: lastCompletedDate,
    children: params.childRows.map(
      (row): ProgressDeviationChildGroupItem => ({
        id: row.id,
        title: row.title,
        actual_date: row.actual_date ?? null,
        status: row.status,
      })
    ),
  }
}

function buildBaselineBoundaryCompensatedRows(params: {
  projectId: string
  baselineVersionId: string
  baselineItems: TaskBaselineItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  calendar?: ConstructionCalendarContext | null
}): {
  rows: ProgressDeviationRow[]
  splitGroups: ProgressDeviationChildGroup[]
  mergeGroups: ProgressDeviationMappingMonitoring['merge_groups']
  mappingPendingCount: number
  mergedCount: number
} {
  const rawRows = buildBaselineRows(params)
  const rawRowsById = new Map(rawRows.map((row) => [row.id, row]))
  const baselineItemById = new Map(params.baselineItems.map((item) => [item.id, item]))
  const childItemsByParent = new Map<string, TaskBaselineItem[]>()
  const rowsToRemove = new Set<string>()
  const splitGroups: ProgressDeviationChildGroup[] = []

  for (const item of params.baselineItems) {
    if (!item.parent_item_id) continue
    const children = childItemsByParent.get(item.parent_item_id) ?? []
    children.push(item)
    childItemsByParent.set(item.parent_item_id, children)
  }

  for (const parent of params.baselineItems) {
    const children = childItemsByParent.get(parent.id) ?? []
    if (children.length === 0) continue

    const parentRow = rawRowsById.get(parent.id)
    if (!parentRow) continue

    const childRows = children
      .map((child) => rawRowsById.get(child.id))
      .filter((row): row is ProgressDeviationRow => Boolean(row))
      .sort((left, right) => toNumber(baselineItemById.get(left.id)?.sort_order, 0) - toNumber(baselineItemById.get(right.id)?.sort_order, 0))

    const childGroup = buildChildGroupForParent({
      parent,
      childRows,
    })
    const splitActualDate = childGroup.last_completed_date
    const splitActualProgress = deriveSplitProgress(childRows, splitActualDate)
    const classification = classifyProgressRow({
      plannedProgress: parentRow.planned_progress ?? null,
      actualProgress: splitActualProgress,
      plannedEndDate: parent.planned_end_date ?? null,
      actualEndDate: splitActualDate,
      calendar: params.calendar,
    })
    const splitDelayDays = diffDays(parent.planned_end_date ?? null, splitActualDate, params.calendar)
    const splitStatus =
      (splitDelayDays ?? 0) > 0 && classification.status === 'on_track'
        ? 'delayed'
        : classification.status
    const splitReason =
      (splitDelayDays ?? 0) > 0 && classification.status === 'on_track'
        ? '拆分后的子里程碑实际完成晚于原计划'
        : classification.reason ?? null

    parentRow.actual_progress = splitActualProgress
    parentRow.actual_date = splitActualDate
    parentRow.deviation_days = splitDelayDays
    parentRow.deviation_rate =
      parentRow.planned_progress === null || splitActualProgress === null
        ? 0
        : round1(splitActualProgress - parentRow.planned_progress)
    parentRow.status = splitStatus
    parentRow.reason = splitReason
    parentRow.mapping_status = translateMappingStatus(parent.mapping_status)
    parentRow.merged_into = null
    parentRow.child_group = childGroup
    splitGroups.push(childGroup)

    for (const childRow of childRows) {
      rowsToRemove.add(childRow.id)
    }
  }

  const mergeGroupsByTask = new Map<string, ProgressDeviationRow[]>()
  for (const row of rawRows.filter((candidate) => !rowsToRemove.has(candidate.id))) {
    if (!row.source_task_id) continue
    const rows = mergeGroupsByTask.get(row.source_task_id) ?? []
    rows.push(row)
    mergeGroupsByTask.set(row.source_task_id, rows)
  }

  const mergeGroups: ProgressDeviationMappingMonitoring['merge_groups'] = []
  let mergedCount = 0

  for (const [sourceTaskId, rows] of mergeGroupsByTask.entries()) {
    if (rows.length < 2) continue

    const orderedRows = rows
      .slice()
      .sort((left, right) => toNumber(baselineItemById.get(left.id)?.sort_order, 0) - toNumber(baselineItemById.get(right.id)?.sort_order, 0))
    const representative = orderedRows[0]
    const mergedInto: ProgressDeviationMergedInto = {
      group_id: sourceTaskId,
      target_item_id: representative.id,
      title: representative.title,
      item_ids: orderedRows.map((row) => row.id),
    }

    representative.mapping_status = 'mapping_pending'
    representative.merged_into = mergedInto
    representative.actual_progress = null
    representative.actual_date = null
    representative.deviation_days = 0
    representative.deviation_rate = 0
    representative.status = 'unresolved'
    representative.reason = 'mapping pending'

    mergeGroups.push({
      group_id: sourceTaskId,
      item_ids: orderedRows.map((row) => row.id),
      item_titles: orderedRows.map((row) => row.title),
      mapping_status: 'mapping_pending',
      explanation: `Same task ${sourceTaskId} maps to ${orderedRows.length} baseline items and awaits manual merge confirmation`,
    })
    mergedCount += orderedRows.length

    for (const row of orderedRows.slice(1)) {
      rowsToRemove.add(row.id)
    }
  }

  const rows = rawRows
    .filter((row) => !rowsToRemove.has(row.id))
    .map((row) => ({
      ...row,
      mapping_status: row.mapping_status ?? 'mapped',
    }))

  const mappingPendingCount = rows.filter((row) => row.mapping_status === 'mapping_pending').length

  return {
    rows,
    splitGroups,
    mergeGroups,
    mappingPendingCount,
    mergedCount,
  }
}

function buildTrendEvents(params: {
  baselineVersionId: string
  baselineVersion: BaselineVersion
  monthlyPlan: MonthlyPlan | null
  baselineVersions: BaselineVersion[]
  snapshots: TaskProgressSnapshot[]
}): ProgressDeviationTrendEvent[] {
  const versionById = new Map(params.baselineVersions.map((version) => [version.id, version]))
  const versionPoints = new Map<string, { date: string; timestamp: number }>()

  function registerVersionPoint(versionId: string | null | undefined, date: string | null | undefined) {
    const normalizedVersionId = normalizeText(versionId)
    const normalizedDate = normalizeText(date)
    if (!normalizedVersionId || !normalizedDate) return

    const timestamp = new Date(normalizedDate).getTime()
    if (!Number.isFinite(timestamp)) return

    const existing = versionPoints.get(normalizedVersionId)
    if (!existing || timestamp < existing.timestamp) {
      versionPoints.set(normalizedVersionId, { date: normalizedDate.slice(0, 10), timestamp })
    }
  }

  for (const snapshot of params.snapshots) {
    registerVersionPoint(snapshot.baseline_version_id ?? null, snapshot.snapshot_date ?? snapshot.created_at ?? null)
  }

  if (params.monthlyPlan?.baseline_version_id && params.monthlyPlan.baseline_version_id !== params.baselineVersionId) {
    registerVersionPoint(
      params.monthlyPlan.baseline_version_id,
      params.monthlyPlan.confirmed_at ?? params.monthlyPlan.updated_at ?? params.monthlyPlan.created_at
    )
  }

  const orderedPoints = Array.from(versionPoints.entries()).sort((left, right) => left[1].timestamp - right[1].timestamp)
  const events: ProgressDeviationTrendEvent[] = []

  for (let index = 1; index < orderedPoints.length; index += 1) {
    const [fromVersionId, fromPoint] = orderedPoints[index - 1]
    const [toVersionId, toPoint] = orderedPoints[index]
    if (fromVersionId === toVersionId) continue

    const fromVersion = versionById.get(fromVersionId)
    const toVersion = versionById.get(toVersionId)
    const switchDate = toPoint.date || fromPoint.date
    const fromVersionLabel = toVersionLabel(fromVersion?.version, fromVersionId)
    const toVersionLabelValue = toVersionLabel(toVersion?.version, toVersionId)

    events.push({
      event_type: 'baseline_version_switch',
      marker_type: 'vertical_line',
      switch_date: switchDate,
      from_version: fromVersionLabel,
      to_version: toVersionLabelValue,
      explanation: `${switchDate} before ${fromVersionLabel}, ${switchDate} after ${toVersionLabelValue}`,
    })
  }

  return events
}

export async function getProgressDeviationAnalysis(
  params: ProgressDeviationReadRequest & { actorUserId?: string | null; deferDataGapNotification?: boolean }
): Promise<ProgressDeviationAnalysisResponse> {
  const projectId = normalizeText(params.project_id)
  const baselineVersionId = normalizeText(params.baseline_version_id)
  const monthlyPlanVersionId = normalizeText(params.monthly_plan_version_id)
  const lockRequested = Boolean(params.lock)

  if (!projectId || !baselineVersionId) {
    throw new ProgressDeviationServiceError('VALIDATION_ERROR', 'project_id 和 baseline_version_id 不能为空', 400)
  }

  const [baselineVersion, baselineVersions] = await Promise.all([
    fetchSingleRow<BaselineVersion>('task_baselines', [
      ['project_id', projectId],
      ['id', baselineVersionId],
    ]),
    fetchRows<BaselineVersion>('task_baselines', [['project_id', projectId]]),
  ])
  if (!baselineVersion) {
    throw new ProgressDeviationServiceError('NOT_FOUND', '基线版本不存在', 404)
  }

  const versionLock = lockRequested
    ? await acquireBaselineVersionLock({
        projectId,
        baselineVersionId,
        actorUserId: params.actorUserId ?? 'system',
      })
    : null

  const monthlyPlan = await resolveMonthlyPlan(projectId, monthlyPlanVersionId || null)
  const [baselineItems, monthlyPlanItems, tasks, milestones] = await Promise.all([
    fetchRows<TaskBaselineItem>('task_baseline_items', [['baseline_version_id', baselineVersionId], ['project_id', projectId]]),
    monthlyPlan ? fetchRows<MonthlyPlanItem>('monthly_plan_items', [['monthly_plan_version_id', monthlyPlan.id], ['project_id', projectId]]) : Promise.resolve([] as MonthlyPlanItem[]),
    fetchRows<PlanningTaskRow>('tasks', [['project_id', projectId]]),
    fetchMilestoneTasks(projectId),
  ])
  const taskIds = tasks.map((task) => task.id)
  const [snapshots, forecasts] = await Promise.all([
    fetchRowsIn<TaskProgressSnapshot>('task_progress_snapshots', 'task_id', taskIds, projectId),
    fetchRowsIn<ProgressDeviationDurationForecastRow>('task_duration_forecasts', 'task_id', taskIds, projectId),
  ])
  const [conditions, obstacles, dependencies] = await Promise.all([
    fetchRowsIn<TaskCondition>('task_conditions', 'task_id', taskIds, projectId),
    fetchRowsIn<TaskObstacle>('task_obstacles', 'task_id', taskIds, projectId),
    fetchRowsIn<ProgressDeviationTaskDependencyRow>('task_dependencies', 'task_id', taskIds, projectId),
  ])
  const scheduleStates = await fetchRows<ProgressDeviationScheduleStateRow>('project_schedule_states', [['project_id', projectId]])

  const latestSnapshots = buildLatestSnapshotMap(snapshots)
  const latestForecasts = buildLatestForecastMap(forecasts)
  const dependenciesByTask = buildAttributionMap(dependencies)
  const conditionsByTask = buildAttributionMap(conditions)
  const obstaclesByTask = buildAttributionMap(obstacles)
  const calendar = await resolveConstructionCalendarContext({
    projectId,
    onError: (error) => console.warn('[progressDeviationService] construction calendar unavailable for deviation days', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    }),
  })
  const durationAsOf = businessDateKey(new Date(), calendar?.timezone ?? undefined)
  const baselineBoundaryCompensation = buildBaselineBoundaryCompensatedRows({
    projectId,
    baselineVersionId,
    baselineItems,
    tasks,
    latestSnapshots,
    calendar,
  })
  const baselineRows = decorateProgressDeviationRows(enrichDeviationRows({
    rows: baselineBoundaryCompensation.rows,
    tasks,
    latestSnapshots,
    latestForecasts,
    dependenciesByTask,
    conditionsByTask,
    obstaclesByTask,
    calendar,
  }), calendar, durationAsOf)
  const monthlyRows = decorateProgressDeviationRows(enrichDeviationRows({
    rows: monthlyPlan
      ? buildMonthlyPlanRows({
        projectId,
        monthlyPlanVersionId: monthlyPlan.id,
        monthlyPlanItems,
        tasks,
        latestSnapshots,
        calendar,
      })
      : [],
    tasks,
    latestSnapshots,
    latestForecasts,
    dependenciesByTask,
    conditionsByTask,
    obstaclesByTask,
    calendar,
  }), calendar, durationAsOf)
  const executionRows = decorateProgressDeviationRows(enrichDeviationRows({
    rows: buildExecutionRows({
      projectId,
      baselineVersionId,
      monthlyPlanVersionId: monthlyPlan?.id ?? null,
      tasks,
      latestSnapshots,
      calendar,
    }),
    tasks,
    latestSnapshots,
    latestForecasts,
    dependenciesByTask,
    conditionsByTask,
    obstaclesByTask,
    calendar,
  }), calendar, durationAsOf)

  const mainlines: ProgressDeviationMainline[] = [
    {
      key: 'baseline',
      label: '基线偏差链路',
      summary: buildMainlineSummary(baselineRows),
      rows: baselineRows,
    },
    {
      key: 'monthly_plan',
      label: '月度计划偏差链路',
      summary: buildMainlineSummary(monthlyRows),
      rows: monthlyRows,
    },
    {
      key: 'execution',
      label: '执行偏差链路',
      summary: buildMainlineSummary(executionRows),
      rows: executionRows,
    },
  ]

  const rows = mainlines.flatMap((mainline) => mainline.rows)
  const resolvedVersionLock = versionLock ?? await readBaselineVersionLock(projectId, baselineVersionId)
  const mappingMonitoring: ProgressDeviationMappingMonitoring = {
    split_groups: baselineBoundaryCompensation.splitGroups,
    merge_groups: baselineBoundaryCompensation.mergeGroups,
    mapping_pending_count: baselineBoundaryCompensation.mappingPendingCount,
    merged_count: baselineBoundaryCompensation.mergedCount,
  }
  const trendEvents = buildTrendEvents({
    baselineVersionId,
    baselineVersion,
    monthlyPlan,
    baselineVersions,
    snapshots,
  })
  const milestoneConsistency = evaluateMilestoneIntegrityRows(projectId, milestones)

  const summary: ProgressDeviationSummary = {
    total_items: rows.length,
    deviated_items: rows.filter((row) => row.status !== 'on_track').length,
    carryover_items: rows.filter((row) => row.status === 'carried_over').length,
    unresolved_items: rows.filter((row) => row.status === 'unresolved').length,
    baseline_items: baselineRows.length,
    monthly_plan_items: monthlyRows.length,
    execution_items: executionRows.length,
  }
  const monthlyBuckets = buildMonthlyDeviationBuckets(rows)
  const chartData: ProgressDeviationChartData = {
    baselineDeviation: baselineRows,
    monthlyFulfillment: monthlyBuckets,
    executionDeviation: executionRows,
    monthly_buckets: monthlyBuckets,
  }
  const responsibilityContribution = decorateResponsibilityDurations(
    buildResponsibilityContribution(rows, tasks),
    calendar,
    durationAsOf,
  )
  const topDeviationCauses = decorateCauseSummaryDurations([
    ...buildScheduleStateDeviationCauses(scheduleStates),
    ...buildTopDeviationCauses(rows),
  ]
    .sort((left, right) => (right.score ?? right.count) - (left.score ?? left.count) || right.count - left.count)
    .slice(0, 3), calendar, durationAsOf)

  const persistDataGapNotification = async () => {
    try {
      await syncProgressDeviationDataGapNotification(projectId, rows)
    } catch (notificationError) {
      console.warn('[progressDeviationService] failed to persist data-gap notification', {
        projectId,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      })
    }
  }

  if (params.deferDataGapNotification) {
    void persistDataGapNotification()
  } else {
    await persistDataGapNotification()
  }

  return {
    project_id: projectId,
    baseline_version_id: baselineVersion.id,
    monthly_plan_version_id: monthlyPlan?.id ?? null,
    version_lock: resolvedVersionLock,
    summary,
    rows,
    mainlines,
    mapping_monitoring: mappingMonitoring,
    trend_events: trendEvents,
    chart_data: chartData,
    responsibility_contribution: responsibilityContribution,
    top_deviation_causes: topDeviationCauses,
    m1_m9_consistency: milestoneConsistency,
  }
}

export async function getProgressDeviationAnalysisOrThrow(
  params: ProgressDeviationReadRequest & { actorUserId?: string | null; deferDataGapNotification?: boolean }
) {
  try {
    return await getProgressDeviationAnalysis(params)
  } catch (error) {
    if (error instanceof ProgressDeviationServiceError) {
      throw error
    }
    if (error instanceof PlanningDraftLockServiceError) {
      throw error
    }
    throw new ProgressDeviationServiceError('DEVIATION_ANALYSIS_UNAVAILABLE', '偏差分析数据不可用', 503)
  }
}
