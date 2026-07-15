import { logger } from '../middleware/logger.js'
import { getClient, query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'
import {
  getAllProjectExecutionSummaries,
  getProjectExecutionSummary,
} from './projectExecutionSummaryService.js'
import { attachCurrentBaselineProjectionToTasks } from './taskBaselineProjectionService.js'
import type { ProjectExecutionSummary } from './projectExecutionSummaryService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import {
  getFrontendVisibleMetrics,
  getSnapshotMetrics,
  type MetricAvailabilityStatus,
  type MetricDefinition,
} from './metricRegistryService.js'
import { calculateWeightedPlannedProgress, type ProgressTaskLike } from '../utils/progressCalculation.js'
import { toBusinessDateKey } from '../utils/businessDate.js'

const METRIC_REGISTRY_VERSION = 'v1.4.17'
const METRIC_SNAPSHOT_VERSION = 1
const SNAPSHOT_DIRECT_SQL_ENABLED = process.env.NODE_ENV !== 'test'

export type ProjectDailySnapshotInsert = {
  project_id: string
  snapshot_date: string
  health_score: number | null
  health_status: ProjectExecutionSummary['healthStatus'] | null
  overall_progress: number | null
  planned_cumulative: number | null
  task_progress: number | null
  delay_days: number | null
  delay_count: number | null
  active_risk_count: number | null
  pending_condition_count: number | null
  active_obstacle_count: number | null
  today_todo_count: number | null
  milestone_baseline_on_time_count: number | null
  milestone_due_soon_30d_count: number | null
  milestone_high_risk_count: number | null
  active_delayed_tasks: number | null
  monthly_close_status: string | null
  attention_required: boolean | null
  highest_warning_level: string | null
  shifted_milestone_count: number | null
  critical_path_affected_tasks: number | null
  generated_plan_duration_readiness_rate?: number | null
  dependency_topology_non_trivial_rate?: number | null
  responsible_unit_resolution_rate?: number | null
  precondition_attachment_rate?: number | null
  baseline_deviation_rate?: number | null
  monthly_plan_fulfillment_rate?: number | null
  monthly_plan_confirmed_count?: number | null
  monthly_plan_closed_count?: number | null
  monthly_plan_pending_closeout_count?: number | null
  productivity_monthly_average_p?: number | null
  productivity_monthly_max_p?: number | null
  productivity_monthly_min_p?: number | null
  productivity_monthly_p90?: number | null
  productivity_acceleration_case_ratio?: number | null
  productivity_monthly_case_count?: number | null
  productivity_sample_maturity_score?: number | null
  productivity_critical_path_sample_count?: number | null
  planning_alignment_status?: string | null
  temporary_without_baseline_count?: number | null
  planning_pending_realign_count?: number | null
  // v1.4.19: health governance fields
  business_health_score?: number | null
  health_confidence_score?: number | null
  health_confidence_flag?: string | null
  progress_delivery_score?: number | null
  execution_stability_score?: number | null
  critical_target_score?: number | null
  business_exception_score?: number | null
  plan_governance_score?: number | null
  health_basis?: Record<string, unknown>
  deviation_summary?: Record<string, unknown>
  health_caliber_version?: string
  deviation_caliber_version?: string
  metric_availability: Record<string, MetricAvailabilityStatus>
  metric_values?: Record<string, number | string | boolean | null>
  metric_registry_version: string
  metric_snapshot_version: number
}

export type ProjectDailySnapshotWriteResult = {
  recorded: number
  failed: number
  snapshotDate: string
}

export type ProjectMonthlyHealthHistoryPoint = {
  period: string
  health_score: number | null
  health_status: string | null
  recorded_at: string | null
}

type ProjectHealthHistoryRow = {
  snapshot_date?: string | null
  health_score?: number | string | null
  health_status?: string | null
  updated_at?: string | null
}

function snapshotMonthKey(value: unknown) {
  const date = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null
}

function toHealthHistoryPoint(row: ProjectHealthHistoryRow): ProjectMonthlyHealthHistoryPoint | null {
  const period = snapshotMonthKey(row.snapshot_date)
  if (!period) return null
  const score = row.health_score == null || row.health_score === '' ? null : Number(row.health_score)
  return {
    period,
    health_score: score !== null && Number.isFinite(score) ? score : null,
    health_status: String(row.health_status ?? '').trim() || null,
    recorded_at: String(row.updated_at ?? row.snapshot_date ?? '').trim() || null,
  }
}

function latestMonthlyHealthHistoryPoints(
  rows: ProjectHealthHistoryRow[],
  months: number,
): ProjectMonthlyHealthHistoryPoint[] {
  const latestRows = new Map<string, ProjectHealthHistoryRow>()
  for (const row of rows) {
    const period = snapshotMonthKey(row.snapshot_date)
    if (!period) continue
    const current = latestRows.get(period)
    if (!current || String(row.snapshot_date) > String(current.snapshot_date)) {
      latestRows.set(period, row)
    }
  }
  return [...latestRows.values()]
    .sort((left, right) => String(right.snapshot_date).localeCompare(String(left.snapshot_date)))
    .slice(0, months)
    .map(toHealthHistoryPoint)
    .filter((point): point is ProjectMonthlyHealthHistoryPoint => Boolean(point))
}

export async function loadProjectMonthlyHealthHistory(
  projectId: string,
  months = 3,
): Promise<ProjectMonthlyHealthHistoryPoint[]> {
  const normalizedProjectId = String(projectId ?? '').trim()
  const safeMonths = Math.min(24, Math.max(1, Math.trunc(Number(months) || 3)))
  if (!normalizedProjectId) return []

  if (SNAPSHOT_DIRECT_SQL_ENABLED) {
    try {
      const result = await rawQuery(
        `SELECT snapshot_date::text AS snapshot_date,
                health_score,
                health_status,
                updated_at::text AS updated_at
           FROM (
             SELECT snapshot_date,
                    health_score,
                    health_status,
                    updated_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY TO_CHAR(snapshot_date, 'YYYY-MM')
                      ORDER BY snapshot_date DESC
                    ) AS month_rank
               FROM public.project_daily_snapshot
              WHERE project_id = $1
           ) monthly_snapshots
          WHERE month_rank = 1
          ORDER BY snapshot_date DESC
          LIMIT $2`,
        [normalizedProjectId, safeMonths],
      )
      return (result.rows as ProjectHealthHistoryRow[])
        .map(toHealthHistoryPoint)
        .filter((point): point is ProjectMonthlyHealthHistoryPoint => Boolean(point))
    } catch (error) {
      logger.warn('[projectDailySnapshotService] direct project health history read failed, falling back to Supabase REST', {
        projectId: normalizedProjectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { data, error } = await supabase
    .from('project_daily_snapshot')
    .select('snapshot_date, health_score, health_status, updated_at')
    .eq('project_id', normalizedProjectId)
    .order('snapshot_date', { ascending: false })

  if (error) throw new Error(error.message)
  return latestMonthlyHealthHistoryPoints((data ?? []) as ProjectHealthHistoryRow[], safeMonths)
}

function toSnapshotDate(date = new Date()): string {
  return toBusinessDateKey(date)
}

function toNullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function maxAccelerationRatio(values?: Record<string, { accelerationCaseRatio: number | null }> | null) {
  const ratios = Object.values(values ?? {})
    .map((item) => toNullableNumber(item.accelerationCaseRatio))
    .filter((value): value is number => value != null)
  return ratios.length > 0 ? Math.max(...ratios) : null
}

function productivityMaturityScore(value?: string | null): number | null {
  if (value === 'high') return 3
  if (value === 'medium') return 2
  if (value === 'low') return 1
  if (value === 'none') return 0
  return null
}

const SNAPSHOT_TASK_SELECT = [
  'id',
  'project_id',
  'parent_id',
  'progress',
  'status',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'is_executable',
  'is_wbs_summary',
  'progress_method',
].join(', ')

function snapshotDateAsUtcDate(snapshotDate: string): Date {
  return new Date(`${snapshotDate}T00:00:00.000Z`)
}

function roundSnapshotProgress(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100
}

async function calculateProjectPlannedCumulative(
  projectId: string,
  snapshotDate: string,
): Promise<number | null> {
  if (SNAPSHOT_DIRECT_SQL_ENABLED) {
    try {
      const result = await rawQuery(
        `WITH current_baseline AS (
           SELECT id
           FROM public.task_baselines
           WHERE project_id = $1
             AND status IN ('confirmed', 'pending_realign')
             AND version IS NOT NULL
           ORDER BY version DESC, COALESCE(confirmed_at, updated_at, created_at) DESC
           LIMIT 1
         )
         SELECT
           t.id,
           t.project_id,
           t.parent_id,
           t.progress,
           t.status,
           t.planned_start_date::text,
           t.planned_end_date::text,
           t.start_date::text,
           t.end_date::text,
           t.is_executable,
           t.is_wbs_summary,
           t.progress_method,
           baseline_item.id AS baseline_item_id,
           baseline_item.planned_start_date::text AS baseline_start,
           baseline_item.planned_end_date::text AS baseline_end,
           baseline_item.is_baseline_critical AS baseline_is_critical
         FROM public.tasks t
         LEFT JOIN current_baseline baseline ON TRUE
         LEFT JOIN public.task_baseline_items baseline_item
           ON baseline_item.baseline_version_id = baseline.id
          AND baseline_item.source_task_id = t.id
         WHERE t.project_id = $1`,
        [projectId],
      )
      const tasks = (result.rows ?? []) as Array<ProgressTaskLike & {
        baseline_start?: string | null
        baseline_end?: string | null
      }>
      const plannedTasks = tasks.map((task) => {
        const hasBaselineProjection = Boolean(task.baseline_start || task.baseline_end)
        return hasBaselineProjection
          ? {
              ...task,
              planned_start_date: task.baseline_start ?? task.baseline_end ?? null,
              planned_end_date: task.baseline_end ?? task.baseline_start ?? null,
            }
          : task
      })
      return roundSnapshotProgress(calculateWeightedPlannedProgress(plannedTasks, snapshotDateAsUtcDate(snapshotDate)))
    } catch (error) {
      logger.warn('[projectDailySnapshotService] failed to load direct task facts for planned cumulative snapshot', {
        projectId,
        snapshotDate,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .select(SNAPSHOT_TASK_SELECT)
    .eq('project_id', projectId)

  if (error) {
    logger.warn('[projectDailySnapshotService] failed to load tasks for planned cumulative snapshot', {
      projectId,
      snapshotDate,
      error: error.message,
    })
    return null
  }

  const tasks = Array.isArray(data) ? data as Array<ProgressTaskLike & {
    project_id?: string | null
    baseline_start?: string | null
    baseline_end?: string | null
    baseline_item_id?: string | null
    baseline_is_critical?: boolean | null
  }> : []
  const projectedTasks = await attachCurrentBaselineProjectionToTasks(tasks)
  const plannedTasks = projectedTasks.map((task) => {
    const hasBaselineProjection = Boolean(task.baseline_start || task.baseline_end)
    return hasBaselineProjection
      ? {
          ...task,
          planned_start_date: task.baseline_start ?? task.baseline_end ?? null,
          planned_end_date: task.baseline_end ?? task.baseline_start ?? null,
        }
      : task
  })
  return roundSnapshotProgress(calculateWeightedPlannedProgress(plannedTasks, snapshotDateAsUtcDate(snapshotDate)))
}

function buildSnapshotRow(
  summary: ProjectExecutionSummary,
  snapshotDate: string,
  plannedCumulative: number | null,
): ProjectDailySnapshotInsert {
  const row: ProjectDailySnapshotInsert = {
    project_id: summary.id,
    snapshot_date: snapshotDate,
    health_score: toNullableNumber(summary.businessHealthScore),
    health_status: summary.healthStatus ?? null,
    overall_progress: toNullableNumber(summary.overallProgress),
    planned_cumulative: toNullableNumber(plannedCumulative),
    task_progress: toNullableNumber(summary.taskProgress),
    delay_days: toNullableNumber(summary.delayDays),
    delay_count: toNullableNumber(summary.delayCount),
    active_risk_count: toNullableNumber(summary.activeRiskCount),
    pending_condition_count: toNullableNumber(summary.pendingConditionCount),
    active_obstacle_count: toNullableNumber(summary.activeObstacleCount),
    today_todo_count: toNullableNumber(summary.todayTodoCount),
    milestone_baseline_on_time_count: toNullableNumber(summary.milestoneOverview?.summaryStats?.baselineOnTimeCount),
    milestone_due_soon_30d_count: toNullableNumber(summary.milestoneOverview?.summaryStats?.dueSoon30dCount),
    milestone_high_risk_count: toNullableNumber(summary.milestoneOverview?.summaryStats?.highRiskCount),
    active_delayed_tasks: toNullableNumber(summary.activeDelayedTasks),
    monthly_close_status: summary.monthlyCloseStatus ?? null,
    attention_required: summary.attentionRequired,
    highest_warning_level: summary.highestWarningLevel ?? null,
    shifted_milestone_count: toNullableNumber(summary.shiftedMilestoneCount),
    critical_path_affected_tasks: toNullableNumber(summary.criticalPathAffectedTasks),
    generated_plan_duration_readiness_rate: toNullableNumber(summary.generatedPlanDurationReadinessRate),
    dependency_topology_non_trivial_rate: toNullableNumber(summary.dependencyTopologyNonTrivialRate),
    responsible_unit_resolution_rate: toNullableNumber(summary.responsibleUnitResolutionRate),
    precondition_attachment_rate: toNullableNumber(summary.preconditionAttachmentRate),
    monthly_plan_confirmed_count: toNullableNumber(summary.monthlyPlanConfirmedCount),
    monthly_plan_closed_count: toNullableNumber(summary.monthlyPlanClosedCount),
    monthly_plan_pending_closeout_count: toNullableNumber(summary.monthlyPlanPendingCloseoutCount),
    productivity_monthly_average_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyAverageP),
    productivity_monthly_max_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyMaxP),
    productivity_monthly_min_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyMinP),
    productivity_monthly_p90: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyP90),
    productivity_acceleration_case_ratio: toNullableNumber(summary.monthlyProductivityDistribution?.accelerationCaseRatio),
    productivity_monthly_case_count: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyProductivityCaseCount),
    productivity_sample_maturity_score: productivityMaturityScore(summary.monthlyProductivityDistribution?.sampleMaturity),
    productivity_critical_path_sample_count: toNullableNumber(summary.monthlyProductivityDistribution?.representativeness?.criticalPathSampleCount),
    // v1.4.19: health governance fields
    business_health_score: toNullableNumber(summary.businessHealthScore),
    health_confidence_score: toNullableNumber(summary.healthConfidenceScore),
    health_confidence_flag: summary.healthConfidenceFlag ?? null,
    progress_delivery_score: toNullableNumber(summary.progressDeliveryScore),
    execution_stability_score: toNullableNumber(summary.executionStabilityScore),
    critical_target_score: toNullableNumber(summary.criticalTargetScore),
    business_exception_score: toNullableNumber(summary.businessExceptionScore),
    plan_governance_score: toNullableNumber(summary.planGovernanceScore),
    health_basis: (summary as any).healthBasis ?? {},
    deviation_summary: (summary as any).deviationSummary ?? {},
    health_caliber_version: 'v1.4.19',
    deviation_caliber_version: 'v1.4.19',
    metric_availability: {},
    metric_values: {
      planned_cumulative: toNullableNumber(plannedCumulative),
      business_health_score: toNullableNumber(summary.businessHealthScore),
      reliability_score: toNullableNumber(summary.reliabilityScore ?? summary.healthConfidenceScore),
      progress_delivery_score: toNullableNumber(summary.progressDeliveryScore),
      execution_stability_score: toNullableNumber(summary.executionStabilityScore),
      critical_target_score: toNullableNumber(summary.criticalTargetScore),
      business_exception_score: toNullableNumber(summary.businessExceptionScore),
      plan_governance_score: toNullableNumber(summary.planGovernanceScore),
      responsibility_coverage_rate: toNullableNumber(summary.responsibilityCoverageRate),
      generated_plan_duration_readiness_rate: toNullableNumber(summary.generatedPlanDurationReadinessRate),
      dependency_topology_non_trivial_rate: toNullableNumber(summary.dependencyTopologyNonTrivialRate),
      responsible_unit_resolution_rate: toNullableNumber(summary.responsibleUnitResolutionRate),
      precondition_attachment_rate: toNullableNumber(summary.preconditionAttachmentRate),
      baseline_deviation_rate: toNullableNumber(summary.baselineDeviationRate),
      monthly_plan_fulfillment_rate: toNullableNumber(summary.monthlyPlanFulfillmentRate),
      monthly_plan_confirmed_count: toNullableNumber(summary.monthlyPlanConfirmedCount),
      monthly_plan_closed_count: toNullableNumber(summary.monthlyPlanClosedCount),
      monthly_plan_pending_closeout_count: toNullableNumber(summary.monthlyPlanPendingCloseoutCount),
      productivity_monthly_average_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyAverageP),
      productivity_monthly_max_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyMaxP),
      productivity_monthly_min_p: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyMinP),
      productivity_monthly_p90: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyP90),
      productivity_acceleration_case_ratio: toNullableNumber(summary.monthlyProductivityDistribution?.accelerationCaseRatio),
      productivity_monthly_case_count: toNullableNumber(summary.monthlyProductivityDistribution?.monthlyProductivityCaseCount),
      productivity_sample_maturity_score: productivityMaturityScore(summary.monthlyProductivityDistribution?.sampleMaturity),
      productivity_critical_path_sample_count: toNullableNumber(summary.monthlyProductivityDistribution?.representativeness?.criticalPathSampleCount),
      productivity_building_acceleration_case_ratio: toNullableNumber(maxAccelerationRatio(summary.monthlyProductivityDistribution?.scopeDistributions?.byBuilding)),
      productivity_specialty_acceleration_case_ratio: toNullableNumber(maxAccelerationRatio(summary.monthlyProductivityDistribution?.scopeDistributions?.bySpecialty)),
      productivity_critical_path_acceleration_case_ratio: toNullableNumber(summary.monthlyProductivityDistribution?.scopeDistributions?.criticalPath.accelerationCaseRatio),
      planning_alignment_status: summary.planningAlignmentStatus ?? null,
      temporary_without_baseline_count: toNullableNumber(summary.temporaryWithoutBaselineCount),
      planning_pending_realign_count: toNullableNumber(summary.planningPendingRealignCount),
    },
    metric_registry_version: METRIC_REGISTRY_VERSION,
    metric_snapshot_version: METRIC_SNAPSHOT_VERSION,
  }
  row.metric_availability = buildMetricAvailability(row)
  return row
}

function getSnapshotMetricValue(row: ProjectDailySnapshotInsert, metricKey: string): number | string | boolean | null {
  if (row.metric_values && Object.prototype.hasOwnProperty.call(row.metric_values, metricKey)) {
    return row.metric_values[metricKey] ?? null
  }

  switch (metricKey) {
    case 'health_score':
      return row.health_score
    case 'business_health_score':
      return row.business_health_score ?? row.health_score
    case 'reliability_score':
      return row.health_confidence_score
    case 'progress_delivery_score':
      return row.progress_delivery_score
    case 'execution_stability_score':
      return row.execution_stability_score
    case 'critical_target_score':
      return row.critical_target_score
    case 'business_exception_score':
      return row.business_exception_score
    case 'plan_governance_score':
      return row.plan_governance_score
    case 'health_status':
      return row.health_status
    case 'overall_progress':
      return row.overall_progress
    case 'task_progress':
      return row.task_progress
    case 'delay_days':
      return row.delay_days
    case 'delay_count':
      return row.delay_count
    case 'active_risk_count':
      return row.active_risk_count
    case 'pending_condition_count':
      return row.pending_condition_count
    case 'active_obstacle_count':
      return row.active_obstacle_count
    case 'active_delayed_tasks':
      return row.active_delayed_tasks
    case 'monthly_close_status':
      return row.monthly_close_status
    case 'attention_required':
      return row.attention_required
    case 'highest_warning_level':
      return row.highest_warning_level
    case 'shifted_milestone_count':
      return row.shifted_milestone_count
    case 'critical_path_affected_tasks':
      return row.critical_path_affected_tasks
    case 'generated_plan_duration_readiness_rate':
      return row.generated_plan_duration_readiness_rate ?? null
    case 'dependency_topology_non_trivial_rate':
      return row.dependency_topology_non_trivial_rate ?? null
    case 'responsible_unit_resolution_rate':
      return row.responsible_unit_resolution_rate ?? null
    case 'precondition_attachment_rate':
      return row.precondition_attachment_rate ?? null
    case 'baseline_deviation_rate':
      return row.baseline_deviation_rate ?? null
    case 'monthly_plan_fulfillment_rate':
      return row.monthly_plan_fulfillment_rate ?? null
    case 'monthly_plan_confirmed_count':
      return row.monthly_plan_confirmed_count ?? null
    case 'monthly_plan_closed_count':
      return row.monthly_plan_closed_count ?? null
    case 'monthly_plan_pending_closeout_count':
      return row.monthly_plan_pending_closeout_count ?? null
    case 'productivity_monthly_average_p':
      return row.productivity_monthly_average_p ?? null
    case 'productivity_monthly_max_p':
      return row.productivity_monthly_max_p ?? null
    case 'productivity_monthly_min_p':
      return row.productivity_monthly_min_p ?? null
    case 'productivity_monthly_p90':
      return row.productivity_monthly_p90 ?? null
    case 'productivity_acceleration_case_ratio':
      return row.productivity_acceleration_case_ratio ?? null
    case 'productivity_monthly_case_count':
      return row.productivity_monthly_case_count ?? null
    case 'productivity_sample_maturity_score':
      return row.productivity_sample_maturity_score ?? null
    case 'productivity_critical_path_sample_count':
      return row.productivity_critical_path_sample_count ?? null
    case 'planning_alignment_status':
      return row.planning_alignment_status ?? null
    case 'temporary_without_baseline_count':
      return row.temporary_without_baseline_count ?? null
    case 'planning_pending_realign_count':
      return row.planning_pending_realign_count ?? null
    default:
      return null
  }
}

function isMetricValuePresent(value: number | string | boolean | null | undefined) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function resolveMetricAvailability(
  row: ProjectDailySnapshotInsert,
  metric: MetricDefinition,
): MetricAvailabilityStatus {
  const value = getSnapshotMetricValue(row, metric.metricKey)
  if (isMetricValuePresent(value)) return 'ready'
  if (metric.requiresDataQualityThreshold != null) return 'insufficient_data'
  return metric.snapshotPolicy === 'none' ? 'not_applicable' : 'data_pending'
}

function buildMetricAvailability(row: ProjectDailySnapshotInsert): Record<string, MetricAvailabilityStatus> {
  return Object.fromEntries(
    getFrontendVisibleMetrics().map((metric) => [metric.metricKey, resolveMetricAvailability(row, metric)]),
  )
}

function buildMetricValueSnapshotRows(row: ProjectDailySnapshotInsert) {
  return getSnapshotMetrics().map((metric) => {
    const value = getSnapshotMetricValue(row, metric.metricKey)
    const availabilityStatus = row.metric_availability[metric.metricKey] ?? resolveMetricAvailability(row, metric)
    const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null
    const textValue = value !== null && value !== undefined && typeof value !== 'number' ? String(value) : null

    return {
      project_id: row.project_id,
      metric_key: metric.metricKey,
      metric_value: numericValue,
      value_text: textValue,
      value_type: metric.dataType,
      availability_status: availabilityStatus,
      null_strategy: metric.nullStrategy,
      source_type: metric.source,
      source_ref_id: null,
      snapshot_date: row.snapshot_date,
      caliber_version: row.metric_registry_version,
      quality_dimension: metric.qualityDimension ?? null,
      data_quality_score: null,
      group_by: 'project',
      group_key: null,
      group_label: null,
      metadata: {
        metric_snapshot_version: row.metric_snapshot_version,
        snapshot_policy: metric.snapshotPolicy,
      },
    }
  })
}

async function upsertSnapshotRowDirect(
  projectId: string,
  snapshotRow: Omit<ProjectDailySnapshotInsert, 'metric_values'>,
  sourceRow: ProjectDailySnapshotInsert,
): Promise<void> {
  if (
    String(snapshotRow.project_id ?? '').trim() !== projectId
    || String(sourceRow.project_id ?? '').trim() !== projectId
  ) {
    throw new Error('project daily snapshot direct write scope mismatch')
  }
  const client = await getClient()
  const metricRows = buildMetricValueSnapshotRows(sourceRow)

  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO public.project_daily_snapshot (
         project_id,
         snapshot_date,
         health_score,
         health_status,
         overall_progress,
         planned_cumulative,
         task_progress,
         delay_days,
         delay_count,
         active_risk_count,
         pending_condition_count,
         active_obstacle_count,
         today_todo_count,
         milestone_baseline_on_time_count,
         milestone_due_soon_30d_count,
         milestone_high_risk_count,
         active_delayed_tasks,
         monthly_close_status,
         attention_required,
         highest_warning_level,
         shifted_milestone_count,
         critical_path_affected_tasks,
         business_health_score,
         health_confidence_score,
         health_confidence_flag,
         health_basis,
         deviation_summary,
         health_caliber_version,
         deviation_caliber_version,
         metric_availability,
         metric_registry_version,
         metric_snapshot_version
       )
       SELECT
         payload.project_id::uuid,
         payload.snapshot_date::date,
         payload.health_score,
         payload.health_status,
         payload.overall_progress,
         payload.planned_cumulative,
         payload.task_progress,
         payload.delay_days,
         payload.delay_count,
         payload.active_risk_count,
         payload.pending_condition_count,
         payload.active_obstacle_count,
         payload.today_todo_count,
         payload.milestone_baseline_on_time_count,
         payload.milestone_due_soon_30d_count,
         payload.milestone_high_risk_count,
         payload.active_delayed_tasks,
         payload.monthly_close_status,
         payload.attention_required,
         payload.highest_warning_level,
         payload.shifted_milestone_count,
         payload.critical_path_affected_tasks,
         payload.business_health_score,
         payload.health_confidence_score,
         payload.health_confidence_flag,
         payload.health_basis,
         payload.deviation_summary,
         payload.health_caliber_version,
         payload.deviation_caliber_version,
         payload.metric_availability,
         payload.metric_registry_version,
         payload.metric_snapshot_version
       FROM jsonb_to_record($1::jsonb) AS payload(
         project_id text,
         snapshot_date text,
         health_score integer,
         health_status text,
         overall_progress numeric,
         planned_cumulative numeric,
         task_progress numeric,
         delay_days integer,
         delay_count integer,
         active_risk_count integer,
         pending_condition_count integer,
         active_obstacle_count integer,
         today_todo_count integer,
         milestone_baseline_on_time_count integer,
         milestone_due_soon_30d_count integer,
         milestone_high_risk_count integer,
         active_delayed_tasks integer,
         monthly_close_status text,
         attention_required boolean,
         highest_warning_level text,
         shifted_milestone_count integer,
         critical_path_affected_tasks integer,
         business_health_score integer,
         health_confidence_score integer,
         health_confidence_flag text,
         health_basis jsonb,
         deviation_summary jsonb,
         health_caliber_version text,
         deviation_caliber_version text,
         metric_availability jsonb,
         metric_registry_version text,
         metric_snapshot_version integer
       )
       ON CONFLICT (project_id, snapshot_date)
       DO UPDATE SET
         health_score = EXCLUDED.health_score,
         health_status = EXCLUDED.health_status,
         overall_progress = EXCLUDED.overall_progress,
         planned_cumulative = EXCLUDED.planned_cumulative,
         task_progress = EXCLUDED.task_progress,
         delay_days = EXCLUDED.delay_days,
         delay_count = EXCLUDED.delay_count,
         active_risk_count = EXCLUDED.active_risk_count,
         pending_condition_count = EXCLUDED.pending_condition_count,
         active_obstacle_count = EXCLUDED.active_obstacle_count,
         today_todo_count = EXCLUDED.today_todo_count,
         milestone_baseline_on_time_count = EXCLUDED.milestone_baseline_on_time_count,
         milestone_due_soon_30d_count = EXCLUDED.milestone_due_soon_30d_count,
         milestone_high_risk_count = EXCLUDED.milestone_high_risk_count,
         active_delayed_tasks = EXCLUDED.active_delayed_tasks,
         monthly_close_status = EXCLUDED.monthly_close_status,
         attention_required = EXCLUDED.attention_required,
         highest_warning_level = EXCLUDED.highest_warning_level,
         shifted_milestone_count = EXCLUDED.shifted_milestone_count,
         critical_path_affected_tasks = EXCLUDED.critical_path_affected_tasks,
         business_health_score = EXCLUDED.business_health_score,
         health_confidence_score = EXCLUDED.health_confidence_score,
         health_confidence_flag = EXCLUDED.health_confidence_flag,
         health_basis = EXCLUDED.health_basis,
         deviation_summary = EXCLUDED.deviation_summary,
         health_caliber_version = EXCLUDED.health_caliber_version,
         deviation_caliber_version = EXCLUDED.deviation_caliber_version,
         metric_availability = EXCLUDED.metric_availability,
         metric_registry_version = EXCLUDED.metric_registry_version,
         metric_snapshot_version = EXCLUDED.metric_snapshot_version`,
      [JSON.stringify({ ...snapshotRow, project_id: projectId })],
    )

    if (metricRows.length > 0) {
      await client.query(
        `DELETE FROM public.metric_value_snapshots
         WHERE project_id = $1
           AND snapshot_date = $2::date
           AND caliber_version = $3
           AND group_by = 'project'`,
        [projectId, sourceRow.snapshot_date, sourceRow.metric_registry_version],
      )
      await client.query(
        `INSERT INTO public.metric_value_snapshots (
           project_id,
           metric_key,
           metric_value,
           value_text,
           value_type,
           availability_status,
           null_strategy,
           source_type,
           source_ref_id,
           snapshot_date,
           caliber_version,
           quality_dimension,
           data_quality_score,
           group_by,
           group_key,
           group_label,
           metadata
         )
         SELECT
           payload.project_id::uuid,
           payload.metric_key,
           payload.metric_value,
           payload.value_text,
           payload.value_type,
           payload.availability_status,
           payload.null_strategy,
           payload.source_type,
           payload.source_ref_id,
           payload.snapshot_date::date,
           payload.caliber_version,
           payload.quality_dimension,
           payload.data_quality_score,
           payload.group_by,
           payload.group_key,
           payload.group_label,
           payload.metadata
         FROM jsonb_to_recordset($1::jsonb) AS payload(
           project_id text,
           metric_key text,
           metric_value numeric,
           value_text text,
           value_type text,
           availability_status text,
           null_strategy text,
           source_type text,
           source_ref_id text,
           snapshot_date text,
           caliber_version text,
           quality_dimension text,
           data_quality_score numeric,
           group_by text,
           group_key text,
           group_label text,
           metadata jsonb
         )`,
        [JSON.stringify(metricRows.map((row) => ({ ...row, project_id: projectId })))],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      logger.warn('[projectDailySnapshotService] failed to roll back snapshot transaction', {
        projectId,
        snapshotDate: sourceRow.snapshot_date,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      })
    }
    throw error
  } finally {
    client.release()
  }
}

async function writeMetricValueSnapshots(row: ProjectDailySnapshotInsert): Promise<void> {
  const rows = buildMetricValueSnapshotRows(row)
  if (rows.length === 0) return

  const deleteResult = await supabase
    .from('metric_value_snapshots')
    .delete()
    .eq('project_id', row.project_id)
    .eq('snapshot_date', row.snapshot_date)
    .eq('caliber_version', row.metric_registry_version)
    .eq('group_by', 'project')

  if (deleteResult.error) {
    throw new Error(`清理 metric_value_snapshots 失败: ${deleteResult.error.message}`)
  }

  const { error } = await supabase.from('metric_value_snapshots').insert(rows)
  if (error) {
    throw new Error(`写入 metric_value_snapshots 失败: ${error.message}`)
  }
}

async function upsertSnapshotRow(row: ProjectDailySnapshotInsert): Promise<void> {
  const projectId = String(row.project_id ?? '').trim()
  if (!projectId) {
    throw new Error('project daily snapshot requires projectId')
  }
  const {
    metric_values: metricValues,
    generated_plan_duration_readiness_rate: generatedPlanDurationReadinessRate,
    dependency_topology_non_trivial_rate: dependencyTopologyNonTrivialRate,
    responsible_unit_resolution_rate: responsibleUnitResolutionRate,
    precondition_attachment_rate: preconditionAttachmentRate,
    baseline_deviation_rate: baselineDeviationRate,
    monthly_plan_fulfillment_rate: monthlyPlanFulfillmentRate,
    monthly_plan_confirmed_count: monthlyPlanConfirmedCount,
    monthly_plan_closed_count: monthlyPlanClosedCount,
    monthly_plan_pending_closeout_count: monthlyPlanPendingCloseoutCount,
    productivity_monthly_average_p: productivityMonthlyAverageP,
    productivity_monthly_max_p: productivityMonthlyMaxP,
    productivity_monthly_min_p: productivityMonthlyMinP,
    productivity_monthly_p90: productivityMonthlyP90,
    productivity_acceleration_case_ratio: productivityAccelerationCaseRatio,
    productivity_monthly_case_count: productivityMonthlyCaseCount,
    productivity_sample_maturity_score: productivitySampleMaturityScore,
    productivity_critical_path_sample_count: productivityCriticalPathSampleCount,
    planning_alignment_status: planningAlignmentStatus,
    temporary_without_baseline_count: temporaryWithoutBaselineCount,
    planning_pending_realign_count: planningPendingRealignCount,
    progress_delivery_score: progressDeliveryScore,
    execution_stability_score: executionStabilityScore,
    critical_target_score: criticalTargetScore,
    business_exception_score: businessExceptionScore,
    plan_governance_score: planGovernanceScore,
    ...snapshotRow
  } = row
  void metricValues
  void generatedPlanDurationReadinessRate
  void dependencyTopologyNonTrivialRate
  void responsibleUnitResolutionRate
  void preconditionAttachmentRate
  void baselineDeviationRate
  void monthlyPlanFulfillmentRate
  void monthlyPlanConfirmedCount
  void monthlyPlanClosedCount
  void monthlyPlanPendingCloseoutCount
  void productivityMonthlyAverageP
  void productivityMonthlyMaxP
  void productivityMonthlyMinP
  void productivityMonthlyP90
  void productivityAccelerationCaseRatio
  void productivityMonthlyCaseCount
  void productivitySampleMaturityScore
  void productivityCriticalPathSampleCount
  void planningAlignmentStatus
  void temporaryWithoutBaselineCount
  void planningPendingRealignCount
  void progressDeliveryScore
  void executionStabilityScore
  void criticalTargetScore
  void businessExceptionScore
  void planGovernanceScore
  const normalizedSnapshotRow = { ...snapshotRow, project_id: projectId }

  if (SNAPSHOT_DIRECT_SQL_ENABLED) {
    await upsertSnapshotRowDirect(projectId, normalizedSnapshotRow, row)
    return
  }

  const { error } = await supabase
    .from('project_daily_snapshot')
    .upsert(normalizedSnapshotRow, { onConflict: 'project_id,snapshot_date' })

  if (error) {
    throw new Error(`写入 project_daily_snapshot 失败: ${error.message}`)
  }

  await writeMetricValueSnapshots(row)
}

export async function upsertProjectDailySnapshots(
  rows: ProjectDailySnapshotInsert[],
): Promise<ProjectDailySnapshotWriteResult> {
  const snapshotDate = rows[0]?.snapshot_date ?? toSnapshotDate()
  let recorded = 0
  let failed = 0

  for (const row of rows) {
    try {
      await upsertSnapshotRow(row)
      recorded += 1
    } catch (error) {
      failed += 1
      logger.warn('[projectDailySnapshotService] failed to upsert snapshot row', {
        projectId: row.project_id,
        snapshotDate: row.snapshot_date,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { recorded, failed, snapshotDate }
}

export async function recordProjectDailySnapshots(
  snapshotDate = toSnapshotDate(),
  projectIds?: string[] | null,
): Promise<ProjectDailySnapshotWriteResult> {
  const summaries = Array.isArray(projectIds)
    ? (await Promise.all(
      (await listActiveProjectIds(projectIds)).map((projectId) => getProjectExecutionSummary(projectId, { asOf: snapshotDate })),
    )).filter((summary): summary is ProjectExecutionSummary => Boolean(summary))
    : await getAllProjectExecutionSummaries({ asOf: snapshotDate, systemJob: true })
  const rows = await Promise.all(
    summaries.map(async (summary) => buildSnapshotRow(
      summary,
      snapshotDate,
      await calculateProjectPlannedCumulative(summary.id, snapshotDate),
    )),
  )

  if (rows.length === 0) {
    return { recorded: 0, failed: 0, snapshotDate }
  }

  return await upsertProjectDailySnapshots(rows)
}

export async function recordProjectDailySnapshot(
  projectId: string,
  snapshotDate = toSnapshotDate(),
): Promise<ProjectDailySnapshotWriteResult> {
  const summary = await getProjectExecutionSummary(projectId, { asOf: snapshotDate })
  if (!summary) {
    return { recorded: 0, failed: 0, snapshotDate }
  }

  const plannedCumulative = await calculateProjectPlannedCumulative(projectId, snapshotDate)
  return await upsertProjectDailySnapshots([buildSnapshotRow(summary, snapshotDate, plannedCumulative)])
}
