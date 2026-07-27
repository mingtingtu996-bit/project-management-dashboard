import { executeSQL, getProject, getRisks, getTasks, getIssues, supabase } from './dbService.js'
import { calculateProjectHealth } from './projectHealthService.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { getTaskLagLevel } from './taskLagStatusService.js'
import { buildAttentionSummary } from './todoTouchpointService.js'
import { query as rawQuery } from '../database.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import { calculateProgressMetrics, getLeafTasks } from '../utils/progressCalculation.js'
import { hasStableResponsibilitySubject } from '../utils/responsibilitySubject.js'
import { delayDayDelta, inclusiveDurationDays, signedDurationDayDelta } from '../utils/durationDays.js'
import { isCompletedMilestone, isCompletedTask, isInProgressTask } from '../utils/taskStatus.js'
import { isPendingCondition } from '../utils/conditionStatus.js'
import { mapProjectHealthStatus, type ProjectHealthStatus } from '../utils/projectHealthStatus.js'
import {
  buildCalendarDayDurationMetric,
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  DEFAULT_DURATION_TIMEZONE,
  hasIdentifiedConstructionCalendar,
  type DurationMetricDto,
} from './durationMetricService.js'
import { resolveLiveTaskCriticalityProjection } from './taskCriticalityProjectionService.js'
import {
  getMonthlyPlanFulfillmentTrend,
  getMonthlyPlanStatusSummary,
} from './monthlyPlanSummaryService.js'
import {
  getTaskActualEndDate,
  isTaskDelayedByPeriodEnd,
} from './taskSummaryCompareService.js'
import { attachCurrentBaselineProjectionToTasks } from './taskBaselineProjectionService.js'
import { logger } from '../middleware/logger.js'
import type {
  Issue,
  MonthlyPlan,
  Notification,
  PlanningGovernanceState,
  Project,
  Risk,
  Task,
  TaskBaselineItem,
} from '../types/db.js'
import {
  FAILED_ACCEPTANCE_STATUSES as FAILED_ACCEPTANCE_STATUS_VALUES,
  IN_PROGRESS_ACCEPTANCE_STATUSES as IN_PROGRESS_ACCEPTANCE_STATUS_VALUES,
  PASSED_ACCEPTANCE_STATUSES as PASSED_ACCEPTANCE_STATUS_VALUES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'

type TaskConditionRow = {
  id: string
  project_id?: string | null
  task_id?: string | null
  condition_code?: string | null
  source_type?: string | null
  is_satisfied?: boolean | number | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type TaskDependencyRow = {
  id?: string | null
  project_id?: string | null
  task_id?: string | null
  dependency_task_id?: string | null
  dependency_type?: string | null
  lag_days?: number | string | null
  status?: string | null
}

type TaskObstacleRow = {
  id: string
  project_id?: string | null
  task_id?: string | null
  is_resolved?: boolean | number | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  expected_resolution_date?: string | null
  estimated_resolve_date?: string | null
}

type PreMilestoneRow = {
  id: string
  project_id?: string | null
  status?: string | null
}

type AcceptancePlanRow = {
  id: string
  project_id?: string | null
  status?: string | null
}

type ConstructionDrawingRow = {
  id: string
  project_id?: string | null
  status?: string | null
  review_status?: string | null
}

type MonthlyPlanRow = Pick<
  MonthlyPlan,
  | 'id'
  | 'project_id'
  | 'status'
  | 'month'
  | 'closeout_at'
  | 'created_at'
  | 'updated_at'
  | 'baseline_version_id'
  | 'source_mode'
  | 'temporary_without_baseline'
  | 'pending_closeout_count'
>

type NotificationRow = Pick<Notification, 'id' | 'project_id' | 'severity' | 'level' | 'title' | 'content' | 'status' | 'is_read' | 'created_at'>

export type MonthlyCloseStatus = '未开始' | '进行中' | '已完成' | '已超期'
export type WarningSignalLevel = 'info' | 'warning' | 'critical' | null

type ProjectDailySnapshotKpiRow = {
  snapshot_date: string
  overall_progress?: number | string | null
  delay_days?: number | string | null
  active_risk_count?: number | string | null
  today_todo_count?: number | string | null
}

export type ProjectDailySnapshotMilestoneKpiRow = {
  snapshot_date: string
  shifted_milestone_count?: number | string | null
  milestone_baseline_on_time_count?: number | string | null
  milestone_due_soon_30d_count?: number | string | null
  milestone_high_risk_count?: number | string | null
}

export type ProjectKpiComparisonMetric = {
  current: number
  previous: number | null
  delta: number | null
  periodLabel: '较上周' | '较上月'
  status: 'ready' | 'insufficient_history'
}

export type ProjectKpiComparisons = {
  weekly: {
    progress: ProjectKpiComparisonMetric
    deviation: ProjectKpiComparisonMetric
    risks: ProjectKpiComparisonMetric
    todos: ProjectKpiComparisonMetric
  }
}

function normalizeProjectIdList(projectIds?: string[] | null): string[] | null {
  if (projectIds === undefined || projectIds === null) return null
  return Array.from(new Set(projectIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
}

function toProjectIdSet(projectIds?: string[] | null): Set<string> | null {
  const normalized = normalizeProjectIdList(projectIds)
  return normalized === null ? null : new Set(normalized)
}

function filterRowsByProjectIds<T extends { project_id?: string | null }>(
  rows: T[],
  projectIds?: string[] | null,
): T[] {
  const projectIdSet = toProjectIdSet(projectIds)
  if (projectIdSet === null) return rows
  if (projectIdSet.size === 0) return []
  return rows.filter((row) => projectIdSet.has(String(row.project_id ?? '').trim()))
}

function filterProjectsByIds<T extends { id?: string | null }>(
  rows: T[],
  projectIds?: string[] | null,
): T[] {
  const projectIdSet = toProjectIdSet(projectIds)
  if (projectIdSet === null) return rows
  if (projectIdSet.size === 0) return []
  return rows.filter((row) => projectIdSet.has(String(row.id ?? '').trim()))
}

type SummaryQueryKind =
  | 'planningGovernanceStatesAll'
  | 'weeklyKpiSnapshotWithTodos'
  | 'monthlyMilestoneKpiSnapshot'
  | 'taskBaselinesForMilestoneSignals'
  | 'taskBaselineItemsForMilestoneSignals'
  | 'summaryProjectsAll'
  | 'summaryTasksAll'
  | 'summaryRisksAll'
  | 'summaryIssuesAll'
  | 'summaryTaskConditionsAll'
  | 'summaryTaskDependenciesAll'
  | 'summaryTaskObstaclesAll'
  | 'summaryMonthlyPlansAll'
  | 'summaryNotificationsAll'
  | 'summaryPreMilestonesAll'
  | 'summaryAcceptancePlansAll'
  | 'summaryConstructionDrawingsAll'

type SummaryQueryOptions = {
  projectIds?: string[] | null
  systemJob?: boolean
}

const EXPLICIT_SCOPE_SUMMARY_QUERY_KINDS = new Set<SummaryQueryKind>([
  'planningGovernanceStatesAll',
  'taskBaselinesForMilestoneSignals',
  'taskBaselineItemsForMilestoneSignals',
  'summaryProjectsAll',
  'summaryTasksAll',
  'summaryRisksAll',
  'summaryIssuesAll',
  'summaryTaskConditionsAll',
  'summaryTaskDependenciesAll',
  'summaryTaskObstaclesAll',
  'summaryMonthlyPlansAll',
  'summaryNotificationsAll',
  'summaryPreMilestonesAll',
  'summaryAcceptancePlansAll',
  'summaryConstructionDrawingsAll',
])

const COMPANY_OVERVIEW_SUMMARY_QUERY_CONCURRENCY = 4

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) return []
  const limit = Math.max(1, Math.floor(concurrency))
  const results = new Array<T>(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await tasks[currentIndex]()
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  )
  return results
}

function buildProjectScopeSql(
  projectIds?: string[] | null,
  column = 'project_id',
  hasWhere = false,
) {
  const normalizedProjectIds = normalizeProjectIdList(projectIds)
  if (normalizedProjectIds === null) {
    return { clause: '', params: [] as unknown[] }
  }
  if (normalizedProjectIds.length === 0) {
    return { clause: hasWhere ? ' AND false' : ' WHERE false', params: [] as unknown[] }
  }
  return {
    clause: `${hasWhere ? ' AND' : ' WHERE'} ${column} = ANY($1::uuid[])`,
    params: [normalizedProjectIds] as unknown[],
  }
}

function buildExecuteSqlProjectScope(
  projectIds?: string[] | null,
  column = 'project_id',
  hasWhere = false,
) {
  const normalizedProjectIds = normalizeProjectIdList(projectIds)
  if (normalizedProjectIds === null) {
    return { clause: '', params: [] as unknown[] }
  }
  if (normalizedProjectIds.length === 0) {
    return { clause: hasWhere ? ' AND false' : ' WHERE false', params: [] as unknown[] }
  }
  return {
    clause: `${hasWhere ? ' AND' : ' WHERE'} ${column} = ANY(?::uuid[])`,
    params: [normalizedProjectIds] as unknown[],
  }
}

// workspace-isolation-system-job-approved: unscoped execution is rejected unless the caller explicitly identifies a system job.
async function executeSummaryQuery<T = unknown>(
  kind: SummaryQueryKind,
  params: unknown[] = [],
  options: SummaryQueryOptions = {},
): Promise<T[]> {
  const normalizedProjectIds = normalizeProjectIdList(options.projectIds)
  if (EXPLICIT_SCOPE_SUMMARY_QUERY_KINDS.has(kind) && normalizedProjectIds === null && options.systemJob !== true) {
    throw new Error('projectIds are required outside an explicit system job')
  }

  if (process.env.NODE_ENV === 'test') {
    const executeScoped = <Row>(sql: string, column = 'project_id', hasWhere = false) => {
      const scope = buildExecuteSqlProjectScope(options.projectIds, column, hasWhere)
      const scopedSql = `${sql}${scope.clause}`
      // execute-sql-dynamic-approved: callers below provide fixed local SELECT literals and fixed scope columns; project UUIDs remain parameter-bound.
      return scope.params.length > 0
        ? executeSQL<Row>(scopedSql, scope.params)
        : executeSQL<Row>(scopedSql)
    }

    switch (kind) {
      case 'planningGovernanceStatesAll':
        return await executeScoped<T>('SELECT * FROM planning_governance_states', 'project_id').then((rows) => (
          [...rows].sort((left, right) => String((right as any).created_at ?? '').localeCompare(String((left as any).created_at ?? '')))
        ))
      case 'weeklyKpiSnapshotWithTodos':
        return await executeSQL<T>('SELECT snapshot_date, overall_progress, delay_days, active_risk_count, today_todo_count FROM project_daily_snapshot WHERE project_id = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1', params)
      case 'monthlyMilestoneKpiSnapshot':
        return await executeSQL<T>('SELECT snapshot_date, shifted_milestone_count, milestone_baseline_on_time_count, milestone_due_soon_30d_count, milestone_high_risk_count FROM project_daily_snapshot WHERE project_id = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1', params)
      case 'taskBaselinesForMilestoneSignals':
        return await executeScoped<T>("SELECT id, project_id, status, version FROM task_baselines WHERE status IN ('confirmed', 'pending_realign', 'revising', 'archived')", 'project_id', true)
      case 'taskBaselineItemsForMilestoneSignals':
        return await executeScoped<T>('SELECT id, project_id, baseline_version_id, parent_item_id, source_task_id, source_milestone_id, title, sort_order, mapping_status FROM task_baseline_items')
      case 'summaryProjectsAll':
        return await executeScoped<T>('SELECT id, name, company_id, status, planned_start_date, planned_end_date, start_date, end_date, health_score, health_status FROM projects', 'id')
      case 'summaryTasksAll':
        return await executeScoped<T>('SELECT id, project_id, parent_id, title, description, status, progress, is_milestone, milestone_level, wbs_level, wbs_code, planned_start_date, planned_end_date, start_date, end_date, actual_end_date, monthly_plan_item_id, template_id, template_node_id, standard_work_code, standard_work_name, duration_calibration_source, duration_provenance, participant_unit_id, is_wbs_summary, is_executable, standard_task_metadata, created_at, updated_at FROM tasks')
      case 'summaryRisksAll':
        return await executeScoped<T>('SELECT id, project_id, status FROM risks')
      case 'summaryIssuesAll':
        return await executeScoped<T>('SELECT id, project_id, status FROM issues')
      case 'summaryTaskConditionsAll':
        return await executeScoped<T>('SELECT id, project_id, task_id, condition_code, source_type, is_satisfied, status FROM task_conditions')
      case 'summaryTaskDependenciesAll':
        return await executeScoped<T>('SELECT id, project_id, task_id, dependency_task_id, dependency_type, lag_days, status FROM task_dependencies')
      case 'summaryTaskObstaclesAll':
        return await executeScoped<T>('SELECT id, project_id, task_id, is_resolved, status FROM task_obstacles')
      case 'summaryMonthlyPlansAll':
        return await executeScoped<T>('SELECT id, project_id, status, month, closeout_at, created_at, updated_at, baseline_version_id, source_mode, temporary_without_baseline, pending_closeout_count FROM monthly_plans')
      case 'summaryNotificationsAll':
        return await executeScoped<T>('SELECT id, project_id, severity, level, title, content, status, is_read, created_at FROM notifications')
      case 'summaryPreMilestonesAll':
        return await executeScoped<T>('SELECT id, project_id, status FROM pre_milestones')
      case 'summaryAcceptancePlansAll':
        return await executeScoped<T>('SELECT id, project_id, status FROM acceptance_plans')
      case 'summaryConstructionDrawingsAll':
        return await executeScoped<T>('SELECT id, project_id, status, review_status FROM construction_drawings')
    }
  }

  switch (kind) {
    case 'planningGovernanceStatesAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(
        `SELECT * FROM planning_governance_states${scope.clause} ORDER BY created_at DESC`,
        scope.params.length > 0 ? scope.params : params,
      )
      return result.rows as T[]
    }
    case 'weeklyKpiSnapshotWithTodos': {
      const result = await rawQuery(`
        SELECT snapshot_date, overall_progress, delay_days, active_risk_count, today_todo_count
        FROM project_daily_snapshot
        WHERE project_id = $1 AND snapshot_date <= $2
        ORDER BY snapshot_date DESC
        LIMIT 1
      `, params)
      return result.rows as T[]
    }
    case 'monthlyMilestoneKpiSnapshot': {
      const result = await rawQuery(`
        SELECT snapshot_date, shifted_milestone_count, milestone_baseline_on_time_count, milestone_due_soon_30d_count, milestone_high_risk_count
        FROM project_daily_snapshot
        WHERE project_id = $1 AND snapshot_date <= $2
        ORDER BY snapshot_date DESC
        LIMIT 1
      `, params)
      return result.rows as T[]
    }
    case 'taskBaselinesForMilestoneSignals': {
      const scope = buildProjectScopeSql(options.projectIds, 'project_id', true)
      const result = await rawQuery(`
        SELECT id, project_id, status, version
          FROM task_baselines
         WHERE status IN ('confirmed', 'pending_realign', 'revising', 'archived')
         ${scope.clause}
         ORDER BY project_id ASC, version DESC, updated_at DESC, created_at DESC
      `, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'taskBaselineItemsForMilestoneSignals': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`
        SELECT id, project_id, baseline_version_id, parent_item_id, source_task_id, source_milestone_id,
               title, sort_order, mapping_status
          FROM task_baseline_items
         ${scope.clause}
      `, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryProjectsAll': {
      const scope = buildProjectScopeSql(options.projectIds, 'id')
      const result = await rawQuery(`
        SELECT id, name, company_id, status, planned_start_date, planned_end_date, start_date, end_date, health_score, health_status
          FROM projects
          ${scope.clause}
      `, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryTasksAll': {
      const scope = buildProjectScopeSql(options.projectIds, 'project_id')
      const result = await rawQuery(`
        SELECT id, project_id, parent_id, title, description, status, progress, is_milestone, milestone_level, wbs_level, wbs_code,
               planned_start_date, planned_end_date, start_date, end_date, actual_end_date, monthly_plan_item_id, NULL::integer AS delay_count, false AS is_critical,
               NULL::text AS task_source, template_id, template_node_id, standard_work_code, standard_work_name,
               duration_calibration_source, duration_provenance,
               participant_unit_id, is_wbs_summary, is_executable,
               created_at, updated_at
          FROM tasks
          ${scope.clause}
      `, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryRisksAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status FROM risks${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryIssuesAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status FROM issues${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryTaskConditionsAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, task_id, condition_code, source_type, is_satisfied, status FROM task_conditions${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryTaskDependenciesAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, task_id, dependency_task_id, dependency_type, lag_days, status FROM task_dependencies${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryTaskObstaclesAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, task_id, is_resolved, status FROM task_obstacles${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryMonthlyPlansAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status, month, closeout_at, created_at, updated_at, baseline_version_id, source_mode, temporary_without_baseline, pending_closeout_count FROM monthly_plans${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryNotificationsAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, severity, level, title, content, status, is_read, created_at FROM notifications${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryPreMilestonesAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status FROM pre_milestones${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryAcceptancePlansAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status FROM acceptance_plans${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
    case 'summaryConstructionDrawingsAll': {
      const scope = buildProjectScopeSql(options.projectIds)
      const result = await rawQuery(`SELECT id, project_id, status, review_status FROM construction_drawings${scope.clause}`, scope.params.length > 0 ? scope.params : params)
      return result.rows as T[]
    }
  }
}

export type TaskSummaryAggregationTask = Record<string, unknown> & {
  assignee_user_id?: string | null
  planned_end_date?: string | null
  end_date?: string | null
  actual_end_date?: string | null
  status?: string | null
  progress?: number | null
}

export type TaskSummaryCompletionTrendRow = {
  month: string
  total: number
  on_time: number
  delayed: number
}

export type TaskSummaryAssigneeRow = {
  assignee: string
  total: number
  on_time: number
  delayed: number
  on_time_rate: number
}

export type TaskSummaryTrendWindowOptions = {
  months?: number
  asOf?: Date
  timezone?: string
}

export type TaskSummaryTrendWindow = {
  months: number
  asOfDate: string
  fromDate: string
  timezone: string
}

function normalizeTaskSummaryText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveTaskSummaryTrendWindow(
  options: TaskSummaryTrendWindowOptions = {},
): TaskSummaryTrendWindow {
  const requestedMonths = options.months ?? 6
  const months = Number.isFinite(requestedMonths)
    ? Math.min(Math.max(Math.trunc(requestedMonths), 1), 24)
    : 6
  const timezone = normalizeTaskSummaryText(options.timezone) || DEFAULT_DURATION_TIMEZONE
  const asOfDate = businessDateKey(options.asOf ?? new Date(), timezone)
  const [asOfYear, asOfMonth] = asOfDate.split('-').map(Number)
  const firstMonthIndex = (asOfYear * 12) + (asOfMonth - 1) - (months - 1)
  const fromYear = Math.floor(firstMonthIndex / 12)
  const fromMonth = firstMonthIndex - (fromYear * 12) + 1

  return {
    months,
    asOfDate,
    fromDate: `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`,
    timezone,
  }
}

export function buildTaskSummaryCompletionTrend(
  tasks: TaskSummaryAggregationTask[],
  fromDate: string,
  calendar?: ConstructionCalendarContext | null,
): TaskSummaryCompletionTrendRow[] {
  const monthMap: Record<string, TaskSummaryCompletionTrendRow> = {}
  for (const task of tasks) {
    if (!isCompletedTask(task)) continue
    const completedAt = getTaskActualEndDate(task)
    if (!completedAt || completedAt < fromDate) continue
    const month = completedAt.slice(0, 7)
    if (!monthMap[month]) monthMap[month] = { month, total: 0, on_time: 0, delayed: 0 }
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: projectExecutionSummaryService
    monthMap[month].total++
    if (isTaskDelayedByPeriodEnd(task, completedAt, calendar)) monthMap[month].delayed++
    else monthMap[month].on_time++
  }

  return Object.values(monthMap).sort((left, right) => left.month.localeCompare(right.month))
}

export function buildTaskSummaryAssigneeRows(
  tasks: TaskSummaryAggregationTask[],
  projectMemberNameMap: Map<string, string>,
  calendar?: ConstructionCalendarContext | null,
): TaskSummaryAssigneeRow[] {
  const rowsByAssignee: Record<string, Omit<TaskSummaryAssigneeRow, 'on_time_rate'>> = {}
  for (const task of tasks) {
    if (!isCompletedTask(task)) continue
    const assigneeUserId = normalizeTaskSummaryText(task.assignee_user_id)
    const isLinkedProjectMember = Boolean(assigneeUserId && projectMemberNameMap.has(assigneeUserId))
    const key = isLinkedProjectMember ? assigneeUserId : '__unassigned__'
    if (!rowsByAssignee[key]) {
      rowsByAssignee[key] = {
        assignee: isLinkedProjectMember
          ? projectMemberNameMap.get(assigneeUserId) || '责任人待确认'
          : '未关联责任人',
        total: 0,
        on_time: 0,
        delayed: 0,
      }
    }
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: projectExecutionSummaryService
    rowsByAssignee[key].total++
    const completedAt = getTaskActualEndDate(task)
    if (completedAt && isTaskDelayedByPeriodEnd(task, completedAt, calendar)) rowsByAssignee[key].delayed++
    else rowsByAssignee[key].on_time++
  }

  return Object.values(rowsByAssignee)
    .map((row) => ({
      ...row,
      on_time_rate: row.total > 0 ? Math.round((row.on_time / row.total) * 100) : 0,
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 10)
}

export async function getTaskSummaryProjectMemberNameMap(
  projectId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.map(normalizeTaskSummaryText).filter(Boolean)))
  if (uniqueIds.length === 0) return new Map()

  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', uniqueIds)
    .eq('is_active', true)

  if (membersError) throw new Error(`[project-members] 查询失败: ${membersError.message}`)

  const memberUserIds = Array.from(new Set(
    (members ?? [])
      .map((row: { user_id?: string | null }) => normalizeTaskSummaryText(row.user_id))
      .filter(Boolean),
  ))
  if (memberUserIds.length === 0) return new Map()

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, display_name, username')
    .in('id', memberUserIds)

  if (usersError) throw new Error(`[users] 查询失败: ${usersError.message}`)

  const userNameMap = new Map(
    (users ?? []).map((row: { id: string; display_name?: string | null; username?: string | null }) => [
      String(row.id),
      normalizeTaskSummaryText(row.display_name)
        || normalizeTaskSummaryText(row.username)
        || '责任人待确认',
    ]),
  )

  return new Map(memberUserIds.map((userId) => [
    userId,
    userNameMap.get(userId) || '责任人待确认',
  ]))
}

export async function getTaskSummaryCompletionTrend(
  projectId: string,
  options: TaskSummaryTrendWindowOptions = {},
): Promise<TaskSummaryCompletionTrendRow[]> {
  const { fromDate } = resolveTaskSummaryTrendWindow(options)
  const [taskResult, calendar] = await Promise.all([
    supabase
      .from('tasks')
      .select('planned_end_date, end_date, actual_end_date, status, progress')
      .eq('project_id', projectId)
      .not('actual_end_date', 'is', null)
      .gte('actual_end_date', fromDate),
    resolveConstructionCalendarContext({ projectId }),
  ])

  if (taskResult.error) throw new Error(`[trend] 查询失败: ${taskResult.error.message}`)
  return buildTaskSummaryCompletionTrend(
    (taskResult.data ?? []) as TaskSummaryAggregationTask[],
    fromDate,
    calendar,
  )
}

export async function getTaskSummaryAssigneeRows(projectId: string): Promise<TaskSummaryAssigneeRow[]> {
  const taskResult = await supabase
    .from('tasks')
    .select('assignee_user_id, planned_end_date, end_date, actual_end_date, status, progress')
    .eq('project_id', projectId)

  if (taskResult.error) throw new Error(`[assignees] 查询失败: ${taskResult.error.message}`)
  const tasks = (taskResult.data ?? []) as TaskSummaryAggregationTask[]
  const [projectMemberNameMap, calendar] = await Promise.all([
    getTaskSummaryProjectMemberNameMap(
      projectId,
      tasks.map((task) => normalizeTaskSummaryText(task.assignee_user_id)).filter(Boolean),
    ),
    resolveConstructionCalendarContext({ projectId }),
  ])

  return buildTaskSummaryAssigneeRows(tasks, projectMemberNameMap, calendar)
}

export async function getTaskSummaryMonthlyPlanFulfillmentTrend(projectId: string, months = 6) {
  const safeMonths = Math.min(Math.max(Math.trunc(months), 1), 24)
  return getMonthlyPlanFulfillmentTrend(projectId, safeMonths)
}

async function loadPlanningGovernanceStates(
  projectId?: string,
  projectIds?: string[] | null,
  systemJob = false,
): Promise<PlanningGovernanceState[]> {
  const scopedProjectIds = projectId ? [projectId] : projectIds
  const rows = await executeSummaryQuery<PlanningGovernanceState>(
    'planningGovernanceStatesAll',
    [],
    { projectIds: scopedProjectIds, systemJob },
  )
  return filterRowsByProjectIds(rows, scopedProjectIds)
}

type MilestoneLifecycleStatus = 'completed' | 'overdue' | 'soon' | 'upcoming'

export interface MilestoneOverviewItem {
  id: string
  name: string
  description: string
  targetDate: string | null
  progress: number
  status: MilestoneLifecycleStatus
  statusLabel: string
  updatedAt: string
  planned_date: string | null
  current_planned_date: string | null
  actual_date: string | null
  planDateShift: DurationMetricDto
  futureDueWindow: DurationMetricDto
  actualOverdue: DurationMetricDto
  actualScheduleVariance: DurationMetricDto
  milestone_level: number | null
  wbs_level: number | null
  wbs_code: string | null
  parent_id: string | null
  mapping_pending: boolean
  merged_into: string | null
  merged_into_name: string | null
  non_base_labels: string[]
}

export interface MilestoneOverviewStats {
  total: number
  pending: number
  completed: number
  overdue: number
  upcomingSoon: number
  completionRate: number
}

export interface MilestoneSummaryStats {
  shiftedCount: number
  baselineOnTimeCount: number
  dueSoon30dCount: number
  highRiskCount: number
}

export type MilestoneKpiComparisons = {
  monthly: {
    shifted: ProjectKpiComparisonMetric
    baselineOnTime: ProjectKpiComparisonMetric
    dueSoon30d: ProjectKpiComparisonMetric
    highRisk: ProjectKpiComparisonMetric
  }
}

export interface MilestoneOverview {
  items: MilestoneOverviewItem[]
  stats: MilestoneOverviewStats
  summaryStats?: MilestoneSummaryStats
  kpiComparisons?: MilestoneKpiComparisons
}

export interface KeyNodeSummary {
  total: number
  milestoneCount: number
  criticalPathCount: number
  monthlyControlCount: number
  baselineControlCount: number
  dueSoonCount: number
  shiftedCount: number
  blockedCount: number
  highRiskCount: number
}

type DecoratedMilestoneTask = Task & {
  milestone_mapping_pending?: boolean
  milestone_merged_into?: string | null
  milestone_merged_into_name?: string | null
  milestone_non_base_labels?: string[]
}

type MilestoneBaselineSignal = {
  mappingPending: boolean
  mergedInto: string | null
  mergedIntoName: string | null
  labels: string[]
}

type MilestoneSignalBundle = {
  baselineItemIds: Set<string>
  signalsByRef: Map<string, MilestoneBaselineSignal>
}

export interface ProjectExecutionSummary {
  id: string
  name: string
  status: string
  statusLabel: string
  plannedStartDate: string | null
  plannedEndDate: string | null
  daysUntilPlannedEnd: number | null
  totalTasks: number
  leafTaskCount: number
  planPhaseCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  overdueTaskCount: number
  laggedTaskCount: number
  delayDays: number
  delayCount: number
  overallProgress: number
  plannedProgress: number | null
  progressDeviation: number | null
  progressGap: number | null
  summaryAsOf: string
  taskProgress: number
  totalMilestones: number
  completedMilestones: number
  milestoneProgress: number
  riskCount: number
  activeRiskCount: number
  activeIssueCount: number
  pendingConditionCount: number
  pendingConditionTaskCount: number
  activeObstacleCount: number
  activeObstacleTaskCount: number
  todayTodoCount: number
  projectTodayActionCount: number
  preMilestoneCount: number
  completedPreMilestoneCount: number
  activePreMilestoneCount: number
  overduePreMilestoneCount: number
  acceptancePlanCount: number
  passedAcceptancePlanCount: number
  inProgressAcceptancePlanCount: number
  failedAcceptancePlanCount: number
  constructionDrawingCount: number
  issuedConstructionDrawingCount: number
  reviewingConstructionDrawingCount: number
  attentionRequired: boolean
  scheduleVarianceDays: number
  activeDelayedTasks: number
  activeObstacles: number
  monthlyCloseStatus: MonthlyCloseStatus
  closeoutOverdueDays: number
  unreadWarningCount: number
  highestWarningLevel: WarningSignalLevel
  highestWarningSummary: string | null
  shiftedMilestoneCount: number
  criticalPathAffectedTasks: number
  responsibilityCoverageRate: number | null
  generatedPlanDurationReadinessRate: number | null
  dependencyTopologyNonTrivialRate: number | null
  responsibleUnitResolutionRate: number | null
  preconditionAttachmentRate: number | null
  baselineDeviationRate: number | null
  monthlyPlanFulfillmentRate: number | null
  monthlyPlanConfirmedCount: number
  monthlyPlanClosedCount: number
  monthlyPlanPendingCloseoutCount: number
  monthlyProductivityDistribution: MonthlyProductivityDistribution
  planningAlignmentStatus: 'aligned' | 'needs_realign' | 'temporary_without_baseline'
  temporaryWithoutBaselineCount: number
  planningPendingRealignCount: number
  healthStatus: ProjectHealthStatus
  // v1.4.19: health governance
  businessHealthScore?: number | null
  reliabilityScore?: number | null
  healthConfidenceScore?: number | null
  healthConfidenceFlag?: string | null
  progressDeliveryScore?: number | null
  executionStabilityScore?: number | null
  criticalTargetScore?: number | null
  businessExceptionScore?: number | null
  planGovernanceScore?: number | null
  milestoneOverview: MilestoneOverview
  keyNodeSummary: KeyNodeSummary
  kpiComparisons: ProjectKpiComparisons
  planningGovernance: GovernanceStateSummary
}

export type GovernancePhase =
  | 'free_edit'
  | 'monthly_pending'
  | 'formal_execution'
  | 'pending_realign'
  | 'reordering'
  | 'closeout'

const COMPLETED_PRE_MILESTONE_STATUSES = new Set(['已取得', '已完成', '已批复', 'issued', 'voided', 'approved'])
const ACTIVE_PRE_MILESTONE_STATUSES = new Set(['待申请', '办理中', 'pending', 'preparing_documents', 'internal_review', 'external_submission', 'supplement_required'])
const OVERDUE_PRE_MILESTONE_STATUSES = new Set(['已过期', '需延期', 'expired'])
const PASSED_ACCEPTANCE_STATUSES = new Set(PASSED_ACCEPTANCE_STATUS_VALUES)
const IN_PROGRESS_ACCEPTANCE_STATUSES = new Set(IN_PROGRESS_ACCEPTANCE_STATUS_VALUES)
const FAILED_ACCEPTANCE_STATUSES = new Set(FAILED_ACCEPTANCE_STATUS_VALUES)
const ISSUED_DRAWING_STATUSES = new Set(['已通过', '已出图'])
const REVIEWING_DRAWING_STATUSES = new Set(['编制中', '审图中', '审查中', '未提交', '需修改'])

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function getProjectStatusLabel(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case 'completed':
    case '已完成':
      return '已完成'
    case 'archived':
    case 'paused':
    case '已暂停':
      return '已暂停'
    case 'active':
    case 'in_progress':
    case '进行中':
      return '进行中'
    default:
      return '未开始'
  }
}

function deriveProjectStatusLabel(
  status: string | null | undefined,
  metrics: {
    overallProgress: number
    leafTaskCount: number
    completedTaskCount: number
    totalMilestones: number
    completedMilestones: number
  },
): string {
  const baseLabel = getProjectStatusLabel(status)
  if (baseLabel !== '已完成') return baseLabel

  const tasksComplete =
    metrics.leafTaskCount <= 0 || metrics.completedTaskCount >= metrics.leafTaskCount
  const milestonesComplete =
    metrics.totalMilestones <= 0 || metrics.completedMilestones >= metrics.totalMilestones
  const progressComplete = metrics.overallProgress >= 99.5

  if (progressComplete && tasksComplete && milestonesComplete) return '已完成'
  if (metrics.overallProgress <= 0) return '未开始'
  return '进行中'
}

function getHealthStatus(score: number): ProjectExecutionSummary['healthStatus'] {
  return mapProjectHealthStatus(score)
}

export interface MonthlyProductivityDistribution {
  monthlyAverageP: number | null
  monthlyMaxP: number | null
  monthlyMinP: number | null
  monthlyP90: number | null
  accelerationCaseRatio: number | null
  monthlyProductivityCaseCount: number
  sampleMaturity: ProductivitySampleMaturity
  representativeness: MonthlyProductivityRepresentativeness
  scopeDistributions?: MonthlyProductivityScopeDistributions
}

export interface MonthlyProductivityScopeDistributions {
  byBuilding: Record<string, MonthlyProductivityDistributionBucket>
  bySpecialty: Record<string, MonthlyProductivityDistributionBucket>
  criticalPath: MonthlyProductivityDistributionBucket
}

export type MonthlyProductivityDistributionBucket = Omit<MonthlyProductivityDistribution, 'scopeDistributions'>

export type ProductivitySampleMaturity = 'none' | 'low' | 'medium' | 'high'

export interface MonthlyProductivityRepresentativeness {
  sampleCount: number
  maturity: ProductivitySampleMaturity
  buildingGroupCount: number
  specialtyGroupCount: number
  criticalPathSampleCount: number
}

type ProductivitySample = {
  task: Task
  value: number
}

function productivitySampleMaturity(sampleCount: number): ProductivitySampleMaturity {
  if (sampleCount <= 0) return 'none'
  if (sampleCount >= 100) return 'high'
  if (sampleCount >= 20) return 'medium'
  return 'low'
}

function buildProductivityRepresentativeness(samples: ProductivitySample[]): MonthlyProductivityRepresentativeness {
  const buildingGroupCount = new Set(samples
    .map((sample) => String(sample.task.building_object_id ?? '').trim())
    .filter(Boolean)).size
  const specialtyGroupCount = new Set(samples
    .map((sample) => String(sample.task.engineering_category_id ?? sample.task.specialty_type ?? '').trim())
    .filter(Boolean)).size
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const criticalPathSampleCount = samples
    .filter((sample) => resolveLiveTaskCriticalityProjection(sample.task).isCritical)
    .length
  return {
    sampleCount: samples.length,
    maturity: productivitySampleMaturity(samples.length),
    buildingGroupCount,
    specialtyGroupCount,
    criticalPathSampleCount,
  }
}

function getPlannedEndDate(task: Partial<Task>): string | null {
  return task.planned_end_date || task.end_date || null
}

function getActualEndDate(task: Partial<Task>): string | null {
  return task.actual_end_date || null
}

export function calculateDelayMetrics(
  tasks: Task[],
  asOf = new Date(),
  calendar?: ConstructionCalendarContext | null,
): {
  delayedTaskCount: number
  delayDays: number
  delayCount: number
} {
  let delayedTaskCount = 0
  let delayDays = 0
  let delayCount = 0

  for (const task of tasks) {
    const plannedEnd = getPlannedEndDate(task)
    if (!plannedEnd) continue

    const plannedEndDate = new Date(plannedEnd)
    if (Number.isNaN(plannedEndDate.getTime())) continue

    const actualEnd = getActualEndDate(task)

    if (isCompletedTask(task) && actualEnd) {
      const actualEndDate = new Date(actualEnd)
      const taskDelayDays = Math.max(0, delayDayDelta(plannedEnd, actualEndDate, calendar) ?? 0)
      if (!Number.isNaN(actualEndDate.getTime()) && taskDelayDays > 0) {
        // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
        delayedTaskCount += 1
        delayDays += taskDelayDays
      }
      continue
    }

    const activeDelayDays = Math.max(0, delayDayDelta(plannedEnd, asOf, calendar) ?? 0)
    if (!isCompletedTask(task) && activeDelayDays > 0) {
      // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
      delayedTaskCount += 1
      delayDays += activeDelayDays
    }

    delayCount += Number((task as any).delay_count ?? 0)
  }

  if (delayCount === 0) {
    delayCount = delayedTaskCount
  }

  return { delayedTaskCount, delayDays, delayCount }
}

const getDelayMetrics = calculateDelayMetrics

function toComparableDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 100)
}

export function calculateBaselineDeviationRate(tasks: Task[], asOf = new Date()): number | null {
  const baselineLinkedTasks = tasks.filter((task) => task.baseline_item_id || task.baseline_end)
  if (baselineLinkedTasks.length === 0) return null

  const deviatedCount = baselineLinkedTasks.filter((task) => {
    const baselineEnd = toComparableDate(task.baseline_end)
    if (!baselineEnd) return false
    const actualOrCurrentEnd = toComparableDate(task.actual_end_date || task.planned_end_date || task.end_date)
    if (actualOrCurrentEnd && actualOrCurrentEnd.getTime() > baselineEnd.getTime()) return true
    return !isCompletedTask(task) && baselineEnd.getTime() < asOf.getTime()
  }).length

  return toPercent(deviatedCount, baselineLinkedTasks.length)
}

function calculateMonthlyPlanFulfillmentRate(tasks: Task[]): number | null {
  const monthlyLinkedTasks = tasks.filter((task) => Boolean((task as any).monthly_plan_item_id))
  if (monthlyLinkedTasks.length === 0) return null
  return toPercent(monthlyLinkedTasks.filter(isCompletedTask).length, monthlyLinkedTasks.length)
}

async function loadMonthlyPlanSummaryMetrics(projectId: string, fallbackTasks: Task[], fallbackMonthlyPlans: MonthlyPlanRow[]) {
  const [statusSummary, fulfillmentTrend] = await Promise.all([
    getMonthlyPlanStatusSummary(projectId),
    getMonthlyPlanFulfillmentTrend(projectId, 1),
  ])
  const latestFulfillment = fulfillmentTrend.at(-1)?.rate
  return {
    monthlyPlanFulfillmentRate: typeof latestFulfillment === 'number'
      ? latestFulfillment
      : calculateMonthlyPlanFulfillmentRate(fallbackTasks),
    monthlyPlanConfirmedCount: statusSummary.confirmedCount,
    monthlyPlanClosedCount: statusSummary.closedCount,
    monthlyPlanPendingCloseoutCount: statusSummary.pendingCloseoutCount,
    temporaryWithoutBaselineCount: statusSummary.temporaryWithoutBaselineCount,
    planningPendingRealignCount: getPlanningPendingRealignCount(fallbackMonthlyPlans),
  }
}

function roundMetric(value: number, precision = 3): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function percentile(sortedValues: number[], target: number): number | null {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * target) - 1))
  return sortedValues[index]
}

function calculateTaskProductivityP(task: Task, asOf: Date): number | null {
  const plannedStart = toComparableDate(task.planned_start_date || task.start_date || task.baseline_start)
  const plannedEnd = toComparableDate(task.planned_end_date || task.end_date || task.baseline_end)
  if (!plannedStart || !plannedEnd || plannedEnd.getTime() < plannedStart.getTime()) return null

  const plannedDuration = Math.max(
    1,
    inclusiveDurationDays(plannedStart, plannedEnd) ?? 1,
  )
  const progress = Math.max(0, Math.min(100, Number(task.progress ?? 0)))
  if (progress <= 0 && !isCompletedTask(task)) return null

  const actualStart = toComparableDate(task.actual_start_date || task.first_progress_at || task.planned_start_date || task.start_date)
  const actualEnd = toComparableDate(task.actual_end_date || (isCompletedTask(task) ? task.end_date : null))
  const elapsedEnd = actualEnd ?? asOf
  if (!actualStart || elapsedEnd.getTime() < actualStart.getTime()) return null

  const elapsedDays = inclusiveDurationDays(actualStart, elapsedEnd) ?? 1
  if (elapsedDays <= 0) return null
  const effectiveProducedDays = plannedDuration * (isCompletedTask(task) ? 1 : progress / 100)
  if (effectiveProducedDays <= 0) return null
  return roundMetric(Math.max(0.1, Math.min(1.6, effectiveProducedDays / elapsedDays)))
}

export function calculateMonthlyProductivityDistribution(
  tasks: Task[],
  asOf = new Date(),
): MonthlyProductivityDistribution {
  const monthKey = asOf.toISOString().slice(0, 7)
  const samples = tasks
    .filter((task) => {
      if (task.is_milestone) return false
      const plannedEnd = String(task.planned_end_date || task.end_date || task.baseline_end || '').slice(0, 7)
      const actualEnd = String(task.actual_end_date || '').slice(0, 7)
      const plannedStart = String(task.planned_start_date || task.start_date || task.baseline_start || '').slice(0, 7)
      return plannedEnd === monthKey || actualEnd === monthKey || plannedStart === monthKey
    })
    .map((task) => ({ task, value: calculateTaskProductivityP(task, asOf) }))
    .filter((sample): sample is ProductivitySample => typeof sample.value === 'number' && Number.isFinite(sample.value))
  const values = samples.map((sample) => sample.value)

  if (values.length === 0) {
    const representativeness = buildProductivityRepresentativeness([])
    return {
      monthlyAverageP: null,
      monthlyMaxP: null,
      monthlyMinP: null,
      monthlyP90: null,
      accelerationCaseRatio: null,
      monthlyProductivityCaseCount: 0,
      sampleMaturity: representativeness.maturity,
      representativeness,
      scopeDistributions: buildMonthlyProductivityScopeDistributions([]),
    }
  }

  const bucket = summarizeProductivityValues(values)
  const representativeness = buildProductivityRepresentativeness(samples)
  return {
    ...bucket,
    sampleMaturity: representativeness.maturity,
    representativeness,
    scopeDistributions: buildMonthlyProductivityScopeDistributions(samples),
  }
}

function summarizeProductivityValues(values: number[], representativeness?: MonthlyProductivityRepresentativeness): MonthlyProductivityDistributionBucket {
  const sampleRepresentativeness = representativeness ?? {
    sampleCount: values.length,
    maturity: productivitySampleMaturity(values.length),
    buildingGroupCount: 0,
    specialtyGroupCount: 0,
    criticalPathSampleCount: 0,
  }
  if (values.length === 0) {
    return {
      monthlyAverageP: null,
      monthlyMaxP: null,
      monthlyMinP: null,
      monthlyP90: null,
      accelerationCaseRatio: null,
      monthlyProductivityCaseCount: 0,
      sampleMaturity: sampleRepresentativeness.maturity,
      representativeness: sampleRepresentativeness,
    }
  }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    monthlyAverageP: roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length),
    monthlyMaxP: roundMetric(Math.max(...values)),
    monthlyMinP: roundMetric(Math.min(...values)),
    monthlyP90: roundMetric(percentile(sorted, 0.9) ?? 0),
    accelerationCaseRatio: roundMetric(values.filter((value) => value > 1).length / values.length),
    monthlyProductivityCaseCount: values.length,
    sampleMaturity: sampleRepresentativeness.maturity,
    representativeness: sampleRepresentativeness,
  }
}

function groupProductivitySamples(
  samples: ProductivitySample[],
  resolveKey: (task: Task) => string | null,
) {
  const groups: Record<string, number[]> = {}
  for (const sample of samples) {
    const key = resolveKey(sample.task)
    if (!key) continue
    groups[key] = [...(groups[key] ?? []), sample.value]
  }
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => {
    const scopedSamples = samples.filter((sample) => resolveKey(sample.task) === key)
    return [key, summarizeProductivityValues(values, buildProductivityRepresentativeness(scopedSamples))]
  }))
}

function buildMonthlyProductivityScopeDistributions(samples: ProductivitySample[]): MonthlyProductivityScopeDistributions {
  const criticalPathSamples = samples
    .filter((sample) => resolveLiveTaskCriticalityProjection(sample.task).isCritical)
  return {
    byBuilding: groupProductivitySamples(samples, (task) => String(task.building_object_id ?? '').trim() || null),
    bySpecialty: groupProductivitySamples(samples, (task) => (
      String(task.engineering_category_id ?? task.specialty_type ?? '').trim() || null
    )),
    criticalPath: summarizeProductivityValues(
      criticalPathSamples.map((sample) => sample.value),
      buildProductivityRepresentativeness(criticalPathSamples),
    ),
  }
}

function getTemporaryWithoutBaselineCount(monthlyPlans: MonthlyPlanRow[]): number {
  return monthlyPlans.filter((plan) => Boolean(plan.temporary_without_baseline)).length
}

function getMonthlyPlanConfirmedCount(monthlyPlans: MonthlyPlanRow[]): number {
  return monthlyPlans.filter((plan) => String(plan.status ?? '').trim() === 'confirmed').length
}

function getMonthlyPlanClosedCount(monthlyPlans: MonthlyPlanRow[]): number {
  return monthlyPlans.filter((plan) => String(plan.status ?? '').trim() === 'closed').length
}

function getMonthlyPlanPendingCloseoutCount(monthlyPlans: MonthlyPlanRow[]): number {
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  return monthlyPlans.reduce((sum, plan) => {
    const count = Number(plan.pending_closeout_count ?? 0)
    return sum + (Number.isFinite(count) ? count : 0)
  }, 0)
}

function getPlanningPendingRealignCount(monthlyPlans: MonthlyPlanRow[]): number {
  return monthlyPlans.filter((plan) => String(plan.status ?? '').trim() === 'pending_realign').length
}

function derivePlanningAlignmentStatus(input: {
  temporaryWithoutBaselineCount: number
  planningPendingRealignCount: number
}): ProjectExecutionSummary['planningAlignmentStatus'] {
  if (input.planningPendingRealignCount > 0) return 'needs_realign'
  if (input.temporaryWithoutBaselineCount > 0) return 'temporary_without_baseline'
  return 'aligned'
}

function dateKey(value = new Date()): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(value: Date, months: number): Date {
  const next = new Date(value)
  next.setMonth(next.getMonth() + months)
  return next
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const next = Number(value)
    return Number.isFinite(next) ? next : null
  }
  return null
}

function roundKpiNumber(value: number): number {
  return Number(value.toFixed(2))
}

async function loadPreviousWeeklyKpiSnapshot(projectId: string, asOf = new Date()): Promise<ProjectDailySnapshotKpiRow | null> {
  const previousWeekDate = dateKey(addDays(asOf, -7))
  const rows = await executeSummaryQuery<ProjectDailySnapshotKpiRow>('weeklyKpiSnapshotWithTodos', [projectId, previousWeekDate])
  return rows[0] ?? null
}

async function loadPreviousMonthlyMilestoneKpiSnapshot(projectId: string, asOf = new Date()): Promise<ProjectDailySnapshotMilestoneKpiRow | null> {
  const previousMonthDate = dateKey(addMonths(asOf, -1))
  const rows = await executeSummaryQuery<ProjectDailySnapshotMilestoneKpiRow>('monthlyMilestoneKpiSnapshot', [projectId, previousMonthDate])
  return rows[0] ?? null
}

export function buildProjectKpiComparisons(
  current: { progress: number; deviation: number; risks: number; todos: number },
  previous: ProjectDailySnapshotKpiRow | null,
): ProjectKpiComparisons {
  return {
    weekly: {
      progress: buildKpiComparisonMetric(current.progress, toFiniteNumber(previous?.overall_progress)),
      deviation: buildKpiComparisonMetric(current.deviation, toFiniteNumber(previous?.delay_days)),
      risks: buildKpiComparisonMetric(current.risks, toFiniteNumber(previous?.active_risk_count)),
      todos: buildKpiComparisonMetric(current.todos, toFiniteNumber(previous?.today_todo_count)),
    },
  }
}

export function buildMilestoneKpiComparisons(
  current: MilestoneSummaryStats,
  previous: ProjectDailySnapshotMilestoneKpiRow | null,
): MilestoneKpiComparisons {
  return {
    monthly: {
      shifted: buildKpiComparisonMetric(current.shiftedCount, toFiniteNumber(previous?.shifted_milestone_count), '较上月'),
      baselineOnTime: buildKpiComparisonMetric(current.baselineOnTimeCount, toFiniteNumber(previous?.milestone_baseline_on_time_count), '较上月'),
      dueSoon30d: buildKpiComparisonMetric(current.dueSoon30dCount, toFiniteNumber(previous?.milestone_due_soon_30d_count), '较上月'),
      highRisk: buildKpiComparisonMetric(current.highRiskCount, toFiniteNumber(previous?.milestone_high_risk_count), '较上月'),
    },
  }
}

function buildKpiComparisonMetric(
  current: number,
  previous: number | null,
  periodLabel: ProjectKpiComparisonMetric['periodLabel'] = '较上周',
): ProjectKpiComparisonMetric {
  const normalizedCurrent = roundKpiNumber(current)
  const normalizedPrevious = previous === null ? null : roundKpiNumber(previous)
  return {
    current: normalizedCurrent,
    previous: normalizedPrevious,
    delta: normalizedPrevious === null ? null : roundKpiNumber(normalizedCurrent - normalizedPrevious),
    periodLabel,
    status: normalizedPrevious === null ? 'insufficient_history' : 'ready',
  }
}

async function buildWeeklyKpiComparisons(
  projectId: string,
  current: {
    progress: number
    deviation: number
    risks: number
    todos: number
  },
  asOf = new Date(),
): Promise<ProjectKpiComparisons> {
  const previous = await loadPreviousWeeklyKpiSnapshot(projectId, asOf)
  return buildProjectKpiComparisons(current, previous)
}

async function buildMonthlyMilestoneKpiComparisons(
  projectId: string,
  current: MilestoneSummaryStats,
  asOf = new Date(),
): Promise<MilestoneKpiComparisons> {
  const previous = await loadPreviousMonthlyMilestoneKpiSnapshot(projectId, asOf)
  return buildMilestoneKpiComparisons(current, previous)
}



function createEmptyKeyNodeSummary(): KeyNodeSummary {
  return {
    total: 0,
    milestoneCount: 0,
    criticalPathCount: 0,
    monthlyControlCount: 0,
    baselineControlCount: 0,
    dueSoonCount: 0,
    shiftedCount: 0,
    blockedCount: 0,
    highRiskCount: 0,
  }
}

function hasDateChanged(left?: string | null, right?: string | null): boolean {
  const normalize = (value?: string | null) => String(value ?? '').trim().slice(0, 10)
  const leftValue = normalize(left)
  const rightValue = normalize(right)
  return Boolean(leftValue && rightValue && leftValue !== rightValue)
}

function isTaskDueSoon(task: Task, asOf = new Date()): boolean {
  const targetDate = getMilestoneTargetDate(task)
  if (!targetDate) return false
  const targetTime = new Date(targetDate).getTime()
  if (!Number.isFinite(targetTime)) return false
  const daysUntil = signedDurationDayDelta(asOf, targetDate) ?? Number.POSITIVE_INFINITY
  return daysUntil <= 30
}

function isKeyNodeShifted(task: Task, asOf = new Date()): boolean {
  const baselineDate = String(task.baseline_end || task.baseline_start || '').trim() || null
  const currentPlanDate = String(task.planned_end_date || task.end_date || '').trim() || null
  const actualDate = String(task.actual_end_date || '').trim() || null

  if (hasDateChanged(baselineDate, currentPlanDate)) return true
  if (actualDate && hasDateChanged(currentPlanDate, actualDate)) return true

  const plannedTime = currentPlanDate ? new Date(currentPlanDate).getTime() : Number.NaN
  return Number.isFinite(plannedTime) && !isCompletedTask(task) && plannedTime < asOf.getTime()
}

export function buildKeyNodeSummary(
  tasks: Task[] = [],
  options: {
    criticalTaskIds?: Set<string>
    pendingConditions?: TaskConditionRow[]
    activeObstacles?: TaskObstacleRow[]
    asOf?: Date
  } = {},
): KeyNodeSummary {
  const summary = createEmptyKeyNodeSummary()
  const keyNodeIds = new Set<string>()
  const criticalTaskIds = options.criticalTaskIds ?? new Set<string>()
  const pendingConditionTaskIds = new Set((options.pendingConditions ?? []).map((item) => String(item.task_id ?? '')).filter(Boolean))
  const activeObstacleTaskIds = new Set((options.activeObstacles ?? []).map((item) => String(item.task_id ?? '')).filter(Boolean))
  const asOf = options.asOf ?? new Date()

  for (const task of tasks) {
    const taskId = String(task.id ?? '').trim()
    if (!taskId) continue

    const isMilestone = task.is_milestone === true
    const isCriticalPath = criticalTaskIds.has(taskId)
    const isMonthlyControl = Boolean(String((task as Task & { monthly_plan_item_id?: string | null }).monthly_plan_item_id ?? '').trim())
    const isBaselineControl = Boolean(
      String(task.baseline_item_id ?? '').trim()
      || task.baseline_is_critical === true,
    )
    const isKeyNode = isMilestone || isCriticalPath || isMonthlyControl || isBaselineControl
    if (!isKeyNode) continue

    keyNodeIds.add(taskId)
    if (isMilestone) summary.milestoneCount += 1
    if (isCriticalPath) summary.criticalPathCount += 1
    if (isMonthlyControl) summary.monthlyControlCount += 1
    if (isBaselineControl) summary.baselineControlCount += 1

    const dueSoon = isTaskDueSoon(task, asOf)
    const shifted = isKeyNodeShifted(task, asOf)
    const blocked = pendingConditionTaskIds.has(taskId) || activeObstacleTaskIds.has(taskId)
    const overdue = getMilestoneLifecycleStatus(task, asOf.getTime()) === 'overdue'

    if (dueSoon) summary.dueSoonCount += 1
    if (shifted) summary.shiftedCount += 1
    if (blocked) summary.blockedCount += 1
    if (overdue || blocked || (isCriticalPath && shifted)) summary.highRiskCount += 1
  }

  summary.total = keyNodeIds.size
  return summary
}

function getCurrentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getCurrentMonthlyPlan(plans: MonthlyPlanRow[], now = new Date()): MonthlyPlanRow | null {
  const currentMonth = getCurrentMonthKey(now)
  const currentPlans = plans
    .filter((plan) => String(plan.month ?? '').trim() === currentMonth)
    .sort((left, right) => {
      const leftTime = new Date(String(left.updated_at || left.created_at || '')).getTime()
      const rightTime = new Date(String(right.updated_at || right.created_at || '')).getTime()
      return rightTime - leftTime
    })

  return currentPlans[0] ?? null
}

function getCloseoutOverdueDays(states: PlanningGovernanceState[] = []): number {
  let maxOverdueDays = 0

  for (const state of states) {
    if (state.status !== 'active') continue
    if (!['closeout_overdue_signal', 'closeout_owner_attention'].includes(String(state.kind ?? ''))) continue

    const overdueDays = Number((state.payload as Record<string, unknown> | null | undefined)?.overdue_days ?? 0)
    if (Number.isFinite(overdueDays) && overdueDays > maxOverdueDays) {
      maxOverdueDays = overdueDays
    }
  }

  return maxOverdueDays
}

export function deriveMonthlyCloseStatus(
  plans: MonthlyPlanRow[] = [],
  governanceStates: PlanningGovernanceState[] = [],
  now = new Date(),
): MonthlyCloseStatus {
  const overdueDays = getCloseoutOverdueDays(governanceStates)
  if (overdueDays > 0) {
    return '已超期'
  }

  const currentPlan = getCurrentMonthlyPlan(plans, now)
  if (!currentPlan) {
    return '未开始'
  }

  if (currentPlan.closeout_at || normalizeStatus(currentPlan.status) === 'closed') {
    return '已完成'
  }

  return '进行中'
}

function deriveGovernancePhase(
  monthlyPlans: MonthlyPlanRow[] = [],
  governanceStates: PlanningGovernanceState[] = [],
  planningGovernance: GovernanceStateSummary,
  monthlyCloseStatus: MonthlyCloseStatus,
  now = new Date(),
): GovernancePhase {
  const activeStates = governanceStates.filter((state) => state.status === 'active')
  const activeKinds = new Set(activeStates.map((state) => String(state.kind ?? '').trim()).filter(Boolean))
  const currentPlan = getCurrentMonthlyPlan(monthlyPlans, now)
  const currentPlanStatus = normalizeStatus(currentPlan?.status)

  const hasCloseoutSignal =
    monthlyCloseStatus === '已超期' ||
    planningGovernance.dashboardCloseoutOverdue ||
    planningGovernance.dashboardCloseoutOwnerAttentionRequired ||
    activeKinds.has('closeout_overdue_signal') ||
    activeKinds.has('closeout_owner_attention')
  if (hasCloseoutSignal) {
    return 'closeout'
  }

  const hasReorderingSignal =
    activeKinds.has('manual_reorder_session') ||
    activeKinds.has('reorder_reminder') ||
    activeKinds.has('reorder_escalation')
  if (hasReorderingSignal) {
    return 'reordering'
  }

  if (currentPlanStatus === 'pending_realign' || currentPlanStatus === 'revising') {
    return 'pending_realign'
  }

  if (currentPlanStatus === 'draft') {
    return 'monthly_pending'
  }

  if (currentPlanStatus === 'confirmed' || currentPlanStatus === 'closed') {
    return 'formal_execution'
  }

  if (!currentPlan && activeStates.length === 0) {
    return 'free_edit'
  }

  return 'monthly_pending'
}

function isShiftedMilestone(task: Partial<Task>, asOf = new Date()): boolean {
  if (!task.is_milestone) return false

  const plannedEnd = getPlannedEndDate(task)
  if (!plannedEnd) return false
  const plannedTime = new Date(plannedEnd).getTime()
  if (Number.isNaN(plannedTime)) return false

  const actualEnd = getActualEndDate(task)
  if (actualEnd) {
    const actualTime = new Date(actualEnd).getTime()
    return Number.isFinite(actualTime) && actualTime > plannedTime
  }

  return !isCompletedTask(task) && plannedTime < asOf.getTime()
}

function getShiftedMilestoneCount(tasks: Task[], asOf = new Date()): number {
  return tasks.filter((task) => isShiftedMilestone(task, asOf)).length
}

async function getCriticalPathAffectedTaskCount(
  projectId: string,
  tasks: Task[],
  pendingConditions: TaskConditionRow[],
  activeObstacles: TaskObstacleRow[],
  asOf = new Date(),
  knownCriticalTaskIds?: Set<string>,
): Promise<number> {
  const pendingConditionTaskIds = new Set(pendingConditions.map((item) => String(item.task_id ?? '')).filter(Boolean))
  const activeObstacleTaskIds = new Set(activeObstacles.map((item) => String(item.task_id ?? '')).filter(Boolean))
  const criticalTaskIds = knownCriticalTaskIds ?? await getCriticalPathTaskIds(projectId)

  return tasks.filter((task) => {
    if (!criticalTaskIds.has(task.id)) return false

    const plannedEnd = getPlannedEndDate(task)
    const plannedTime = plannedEnd ? new Date(plannedEnd).getTime() : Number.NaN
    const isDelayed =
      Number.isFinite(plannedTime)
      && ((isCompletedTask(task) && Boolean(getActualEndDate(task)) && new Date(getActualEndDate(task) as string).getTime() > plannedTime)
        || (!isCompletedTask(task) && plannedTime < asOf.getTime()))

    return (
      isDelayed
      || pendingConditionTaskIds.has(task.id)
      || activeObstacleTaskIds.has(task.id)
    )
  }).length
}

function getWarningLevelRank(level: WarningSignalLevel): number {
  switch (level) {
    case 'critical':
      return 3
    case 'warning':
      return 2
    case 'info':
      return 1
    default:
      return 0
  }
}

function normalizeWarningLevel(notification: NotificationRow): WarningSignalLevel {
  const normalized = normalizeStatus(notification.severity || notification.level)
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'warning'
  if (normalized === 'info') return 'info'
  return null
}

function isUnreadNotification(notification: NotificationRow): boolean {
  if (Boolean(notification.is_read)) return false

  const normalizedStatus = normalizeStatus(notification.status)
  if (['read', 'resolved', 'archived'].includes(normalizedStatus)) {
    return false
  }

  return true
}

export function summarizeUnreadWarningSignals(notifications: NotificationRow[] = []): {
  unreadWarningCount: number
  highestWarningLevel: WarningSignalLevel
  highestWarningSummary: string | null
} {
  const unreadNotifications = notifications.filter(isUnreadNotification)

  if (unreadNotifications.length === 0) {
    return {
      unreadWarningCount: 0,
      highestWarningLevel: null,
      highestWarningSummary: null,
    }
  }

  const sorted = [...unreadNotifications].sort((left, right) => {
    const severityDiff = getWarningLevelRank(normalizeWarningLevel(right)) - getWarningLevelRank(normalizeWarningLevel(left))
    if (severityDiff !== 0) return severityDiff

    const leftTime = new Date(String(left.created_at ?? '')).getTime()
    const rightTime = new Date(String(right.created_at ?? '')).getTime()
    return rightTime - leftTime
  })

  const topNotification = sorted[0]
  const summary = String(topNotification?.title || topNotification?.content || '').trim()

  return {
    unreadWarningCount: unreadNotifications.length,
    highestWarningLevel: normalizeWarningLevel(topNotification),
    highestWarningSummary: summary || null,
  }
}

function getMilestoneTargetDate(task: Pick<Task, 'planned_end_date' | 'end_date'>): string | null {
  return String(task.planned_end_date || task.end_date || '').trim() || null
}

function getMilestoneLifecycleStatus(
  task: Pick<Task, 'status'>,
  daysUntilTarget: number | null,
): MilestoneLifecycleStatus {
  if (isCompletedTask(task)) return 'completed'
  if (daysUntilTarget === null) return 'upcoming'
  if (daysUntilTarget < 0) return 'overdue'
  if (daysUntilTarget <= 7) return 'soon'
  return 'upcoming'
}

function getMilestoneStatusLabel(status: MilestoneLifecycleStatus): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'overdue':
      return '已逾期'
    case 'soon':
      return '即将到期'
    default:
      return '待完成'
  }
}

const HIGH_RISK_MILESTONE_LABELS = new Set([
  '待补映射',
  '待人工承接',
  '基线已移除',
  '基线版本已移除',
  '未关联基线',
  '缺基线日期',
  '缺当前计划',
  '数据不完整',
  '偏差过大',
])

const BASELINE_RELATION_INVALID_LABELS = new Set(['待补映射', '映射待确认', '未关联基线', '基线已移除', '基线版本已移除'])

function hasMilestoneLabel(labels: string[], candidates: Set<string>) {
  return labels.some((label) => candidates.has(label))
}

function calculateResponsibilityCoverageRate(leafTasks: Task[]): number | null {
  if (leafTasks.length === 0) return null

  const coveredCount = leafTasks.filter((task) => hasStableResponsibilitySubject(task)).length

  return Math.round((coveredCount / leafTasks.length) * 1000) / 10
}

function isExecutableLeafTask(task: Task) {
  const row = task as Task & {
    is_executable?: boolean | null
    is_wbs_summary?: boolean | null
  }
  return row.is_executable !== false && row.is_wbs_summary !== true
}

function parseStandardTaskMetadata(task: Task): Record<string, unknown> {
  const raw = (task as Task & { standard_task_metadata?: unknown }).standard_task_metadata
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function isHistoricalTask(task: Task): boolean {
  if ((task as Task & { is_historical?: boolean | null }).is_historical === true) return true
  return parseStandardTaskMetadata(task).is_historical === true
}

function readMetadataStringArray(task: Task, key: string): string[] {
  const metadata = parseStandardTaskMetadata(task)
  const value = metadata[key]
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

function isTemplateGeneratedTask(task: Task): boolean {
  const row = task as Task & {
    task_source?: string | null
    template_id?: string | null
    template_node_id?: string | null
    standard_work_code?: string | null
    standard_work_name?: string | null
  }
  const metadata = parseStandardTaskMetadata(task)
  return Boolean(
    String(row.task_source ?? '').trim() === 'template'
    || String(row.template_id ?? '').trim()
    || String(row.template_node_id ?? '').trim()
    || String(row.standard_work_code ?? '').trim()
    || String(row.standard_work_name ?? '').trim()
    || String(metadata.templateId ?? '').trim()
    || String(metadata.templateNodeId ?? '').trim()
  )
}

export function calculatePlanPhaseCount(tasks: Task[]): number {
  const phaseKeys = new Set<string>()

  for (const task of tasks) {
    const row = task as Task & {
      phase_code?: string | null
      phase?: string | null
    }
    const metadata = parseStandardTaskMetadata(task)
    const explicitPhaseKeys = [
      row.phase_object_id,
      row.phase_code,
      row.phase,
      metadata.phaseObjectId,
      metadata.phaseId,
      metadata.phaseCode,
      metadata.phase,
    ]

    let hasExplicitPhaseKey = false
    for (const value of explicitPhaseKeys) {
      if (typeof value === 'object') continue
      const key = String(value ?? '').trim()
      if (key) {
        hasExplicitPhaseKey = true
        phaseKeys.add(key)
      }
    }

    if (!hasExplicitPhaseKey) {
      const nodeType = String(row.wbs_node_type ?? '').trim().toLowerCase()
      if (nodeType === 'phase' || nodeType === 'stage') {
        const key = String(row.id ?? row.title ?? '').trim()
        if (key) phaseKeys.add(key)
      }
    }
  }

  return phaseKeys.size
}

function calculateGeneratedPlanDurationReadinessRate(leafTasks: Task[]): number | null {
  const generatedTasks = leafTasks.filter((task) => isExecutableLeafTask(task) && isTemplateGeneratedTask(task))
  if (generatedTasks.length === 0) return null

  const readyCount = generatedTasks.filter((task) => {
    const row = task as Task & {
      duration_calibration_source?: string | null
      duration_provenance?: string | null
    }
    const source = String(row.duration_calibration_source ?? '').trim()
    const provenance = String(row.duration_provenance ?? '').trim()
    if (source === 'template_placeholder' || provenance === 'template_placeholder') return false
    if (source || provenance) return true
    return false
  }).length

  return Math.round((readyCount / generatedTasks.length) * 1000) / 10
}

function isActiveDependency(row: TaskDependencyRow) {
  const status = String(row.status ?? 'active').trim().toLowerCase()
  return status !== 'inactive' && status !== 'deleted' && status !== 'voided'
}

function calculateDependencyTopologyNonTrivialRate(
  leafTasks: Task[],
  dependencies: TaskDependencyRow[],
): number | null {
  const eligibleTasks = leafTasks.filter(isExecutableLeafTask)
  if (eligibleTasks.length === 0) return null
  const eligibleIds = new Set(eligibleTasks.map((task) => task.id))
  const nonTrivialTaskIds = new Set<string>()

  for (const dependency of dependencies) {
    if (!isActiveDependency(dependency)) continue
    const taskId = String(dependency.task_id ?? '').trim()
    if (!eligibleIds.has(taskId)) continue
    const type = String(dependency.dependency_type ?? 'FS').trim().toUpperCase()
    const lagDays = Number(dependency.lag_days ?? 0)
    if (type !== 'FS' || (Number.isFinite(lagDays) && lagDays !== 0)) {
      nonTrivialTaskIds.add(taskId)
    }
  }

  return Math.round((nonTrivialTaskIds.size / eligibleTasks.length) * 1000) / 10
}

function calculateResponsibleUnitResolutionRate(leafTasks: Task[]): number | null {
  const eligibleTasks = leafTasks.filter(isExecutableLeafTask)
  if (eligibleTasks.length === 0) return null
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const resolvedCount = eligibleTasks.filter((task) => String(task.participant_unit_id ?? '').trim()).length
  return Math.round((resolvedCount / eligibleTasks.length) * 1000) / 10
}

function calculatePreconditionAttachmentRate(
  leafTasks: Task[],
  conditions: TaskConditionRow[],
): number | null {
  const placeholderKeys = new Set<string>()
  for (const task of leafTasks.filter(isExecutableLeafTask)) {
    for (const code of readMetadataStringArray(task, 'preconditionTemplates')) {
      placeholderKeys.add(`${task.id}:${code}`)
    }
  }
  if (placeholderKeys.size === 0) return null

  const attachedKeys = new Set<string>()
  for (const condition of conditions) {
    const taskId = String(condition.task_id ?? '').trim()
    const code = String(condition.condition_code ?? '').trim()
    if (!taskId || !code) continue
    const key = `${taskId}:${code}`
    if (placeholderKeys.has(key)) attachedKeys.add(key)
  }

  return Math.round((attachedKeys.size / placeholderKeys.size) * 1000) / 10
}

function normalizeBaselineMappingStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'pending' || normalized === 'missing' || normalized === 'merged' || normalized === 'mapped') {
    return normalized
  }
  return 'mapped'
}

function pushUniqueLabel(target: string[], label: string) {
  if (!label || target.includes(label)) return
  target.push(label)
}

function hasDateValue(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function buildMilestoneSignalBundle(items: TaskBaselineItem[]): MilestoneSignalBundle {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const signalsByRef = new Map<string, MilestoneBaselineSignal>()
  const itemsByRef = new Map<string, TaskBaselineItem[]>()

  const attach = (ref: string | null | undefined, item: TaskBaselineItem) => {
    const normalizedRef = String(ref ?? '').trim()
    if (!normalizedRef) return
    const list = itemsByRef.get(normalizedRef) ?? []
    list.push(item)
    itemsByRef.set(normalizedRef, list)
  }

  for (const item of items) {
    attach(item.source_task_id ? `task:${item.source_task_id}` : null, item)
    attach(item.source_milestone_id ? `milestone:${item.source_milestone_id}` : null, item)
  }

  for (const [ref, relatedItems] of itemsByRef.entries()) {
    const orderedItems = relatedItems
      .slice()
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    const mergedRows = orderedItems.filter((item) => normalizeBaselineMappingStatus(item.mapping_status) === 'merged')
    const mergeTarget =
      mergedRows
        .map((item) => itemById.get(String(item.parent_item_id ?? '').trim()) ?? null)
        .find((item): item is TaskBaselineItem => Boolean(item))
      ?? (orderedItems.length > 1 ? orderedItems[0] : null)
    const labels: string[] = []
    const mappingPending =
      orderedItems.some((item) => {
        const status = normalizeBaselineMappingStatus(item.mapping_status)
        return status === 'pending' || status === 'missing'
      }) || orderedItems.length > 1

    if (mappingPending) {
      pushUniqueLabel(labels, '待补映射')
    }
    if (orderedItems.length > 1) {
      pushUniqueLabel(labels, '待人工承接')
    }
    if (mergedRows.length > 0) {
      pushUniqueLabel(labels, '已合并映射')
    }

    signalsByRef.set(ref, {
      mappingPending,
      mergedInto: mergeTarget?.id ?? null,
      mergedIntoName: mergeTarget?.title ?? null,
      labels,
    })
  }

  return {
    baselineItemIds: new Set(items.map((item) => String(item.id))),
    signalsByRef,
  }
}

async function loadMilestoneSignalBundles(projectIds: string[]): Promise<Map<string, MilestoneSignalBundle>> {
  const normalizedProjectIds = [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
  if (normalizedProjectIds.length === 0) {
    return new Map()
  }

  const baselineRows = filterRowsByProjectIds(await executeSummaryQuery<Array<{
    id: string
    project_id: string
    status?: string | null
    version?: number | null
  }>[number]>('taskBaselinesForMilestoneSignals', [], { projectIds: normalizedProjectIds }), normalizedProjectIds)

  const latestBaselineIdByProject = new Map<string, string>()
  for (const row of baselineRows) {
    const projectId = String(row.project_id ?? '').trim()
    if (!projectId || latestBaselineIdByProject.has(projectId)) continue
    latestBaselineIdByProject.set(projectId, String(row.id))
  }

  const baselineIds = [...latestBaselineIdByProject.values()]
  if (baselineIds.length === 0) {
    return new Map()
  }

  const baselineIdSet = new Set(baselineIds)
  const baselineItems = (await executeSummaryQuery<TaskBaselineItem>(
    'taskBaselineItemsForMilestoneSignals',
    [],
    { projectIds: normalizedProjectIds },
  ))
    .filter((item) => baselineIdSet.has(String(item.baseline_version_id ?? '').trim()))

  const baselineIdToProjectId = new Map(
    [...latestBaselineIdByProject.entries()].map(([projectId, baselineId]) => [baselineId, projectId]),
  )
  const itemsByProject = new Map<string, TaskBaselineItem[]>()
  for (const item of baselineItems) {
    const projectId = baselineIdToProjectId.get(String(item.baseline_version_id ?? '').trim()) ?? String(item.project_id ?? '').trim()
    if (!projectId) continue
    const list = itemsByProject.get(projectId) ?? []
    list.push(item)
    itemsByProject.set(projectId, list)
  }

  const bundles = new Map<string, MilestoneSignalBundle>()
  for (const projectId of normalizedProjectIds) {
    bundles.set(projectId, buildMilestoneSignalBundle(itemsByProject.get(projectId) ?? []))
  }
  return bundles
}

function decorateTasksWithMilestoneSignals(tasks: Task[], bundle?: MilestoneSignalBundle): Task[] {
  if (!bundle) return tasks

  return tasks.map((task) => {
    if (!task.is_milestone) return task

    const taskSignal = bundle.signalsByRef.get(`task:${task.id}`)
    const milestoneSignal = bundle.signalsByRef.get(`milestone:${task.id}`)
    const labels = [
      ...(taskSignal?.labels ?? []),
      ...(milestoneSignal?.labels ?? []),
    ].filter(Boolean)

    if (task.baseline_item_id && !bundle.baselineItemIds.has(String(task.baseline_item_id))) {
      pushUniqueLabel(labels, '基线版本已移除')
    }

    return {
      ...task,
      milestone_mapping_pending: Boolean(taskSignal?.mappingPending || milestoneSignal?.mappingPending),
      milestone_merged_into: taskSignal?.mergedInto ?? milestoneSignal?.mergedInto ?? null,
      milestone_merged_into_name: taskSignal?.mergedIntoName ?? milestoneSignal?.mergedIntoName ?? null,
      milestone_non_base_labels: [...new Set(labels)],
    } satisfies DecoratedMilestoneTask
  })
}

export function buildMilestoneOverview(
  tasks: Task[] = [],
  asOf = new Date(),
  calendar?: ConstructionCalendarContext | null,
): MilestoneOverview {
  const durationAsOf = businessDateKey(asOf, calendar?.timezone ?? undefined)
  const hasProductionCalendar = hasIdentifiedConstructionCalendar(calendar)
  const items = tasks
    .filter((task) => task.is_milestone)
    .map((task) => {
      const milestoneTask = task as DecoratedMilestoneTask
      const targetDate = getMilestoneTargetDate(task)

      const non_base_labels = [...new Set(milestoneTask.milestone_non_base_labels ?? [])]
      const rawBaselineTargetDate = task.baseline_end || task.baseline_start || null
      const currentPlanDate = task.planned_end_date || task.end_date || null

      // 未关联基线: date fields may exist, but they are not a comparable baseline without mapping.
      if (task.is_milestone && !task.baseline_item_id) {
        pushUniqueLabel(non_base_labels, '未关联基线')
      }

      if (task.baseline_item_id && !hasDateValue(rawBaselineTargetDate)) {
        pushUniqueLabel(non_base_labels, '缺基线日期')
      }

      if (!hasDateValue(currentPlanDate)) {
        pushUniqueLabel(non_base_labels, '缺当前计划')
      }

      // 数据不完整: execution says completed but the generated actual finish date is absent.
      if (isCompletedTask(task) && !hasDateValue(task.actual_end_date)) {
        pushUniqueLabel(non_base_labels, '数据不完整')
      }

      // 偏差过大: actual vs planned deviation exceeds threshold (30 days)
      if (task.actual_end_date && rawBaselineTargetDate) {
        const deviationDays = Math.abs(delayDayDelta(rawBaselineTargetDate, task.actual_end_date, calendar) ?? 0)
        if (deviationDays > 30) {
          pushUniqueLabel(non_base_labels, '偏差过大')
        }
      }

      const hasComparableBaseline =
        hasDateValue(task.baseline_item_id)
        && !Boolean(milestoneTask.milestone_mapping_pending)
        && !hasMilestoneLabel(non_base_labels, BASELINE_RELATION_INVALID_LABELS)
      const baselineTargetDate = hasComparableBaseline ? rawBaselineTargetDate : null
      const normalizedCurrentPlanDate = String(currentPlanDate || '').trim() || null
      const normalizedActualDate = String(task.actual_end_date || '').trim() || null
      const planDateShift = buildCalendarDayDurationMetric(
        signedDurationDayDelta(baselineTargetDate, normalizedCurrentPlanDate),
        { asOf: durationAsOf, timezone: calendar?.timezone },
      )
      const futureDueWindowValue = signedDurationDayDelta(durationAsOf, normalizedCurrentPlanDate)
      const futureDueWindow = buildCalendarDayDurationMetric(
        futureDueWindowValue,
        { asOf: durationAsOf, timezone: calendar?.timezone },
      )
      const status = getMilestoneLifecycleStatus(task, futureDueWindowValue)
      const actualOverdueValue = normalizedCurrentPlanDate && !isCompletedTask(task) && hasProductionCalendar
        ? Math.max(0, delayDayDelta(normalizedCurrentPlanDate, durationAsOf, calendar) ?? 0)
        : null
      const actualScheduleVarianceValue = normalizedCurrentPlanDate && normalizedActualDate && hasProductionCalendar
        ? delayDayDelta(normalizedCurrentPlanDate, normalizedActualDate, calendar)
        : null
      const actualOverdue = buildConstructionProductionDayDurationMetric(actualOverdueValue, {
        calendar,
        asOf: durationAsOf,
        timezone: calendar?.timezone,
      })
      const actualScheduleVariance = buildConstructionProductionDayDurationMetric(actualScheduleVarianceValue, {
        calendar,
        asOf: durationAsOf,
        timezone: calendar?.timezone,
      })

      return {
        id: String(task.id ?? ''),
        name: String(task.title || '未命名里程碑').trim() || '未命名里程碑',
        description: String(task.description || '').trim(),
        targetDate,
        progress: isCompletedTask(task) ? 100 : Math.max(0, Math.min(100, Number(task.progress ?? 0))),
        status,
        statusLabel: getMilestoneStatusLabel(status),
        updatedAt: String(task.updated_at || task.created_at || '').trim(),
        planned_date: String(baselineTargetDate || '').trim() || null,
        current_planned_date: normalizedCurrentPlanDate,
        actual_date: normalizedActualDate,
        planDateShift,
        futureDueWindow,
        actualOverdue,
        actualScheduleVariance,
        milestone_level: typeof task.milestone_level === 'number' ? task.milestone_level : null,
        wbs_level: typeof task.wbs_level === 'number' ? task.wbs_level : null,
        wbs_code: String(task.wbs_code || '').trim() || null,
        parent_id: task.parent_id ? String(task.parent_id) : null,
        mapping_pending: Boolean(milestoneTask.milestone_mapping_pending),
        merged_into: milestoneTask.milestone_merged_into ?? null,
        merged_into_name: milestoneTask.milestone_merged_into_name ?? null,
        non_base_labels,
      }
    })
    .sort((left, right) => {
      const statusOrder: Record<MilestoneLifecycleStatus, number> = {
        overdue: 0,
        soon: 1,
        upcoming: 2,
        completed: 3,
      }

      const statusDiff = statusOrder[left.status] - statusOrder[right.status]
      if (statusDiff !== 0) return statusDiff

      const toTime = (value: string | null) => {
        if (!value) return Number.POSITIVE_INFINITY
        const time = new Date(value).getTime()
        return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
      }

      const dateDiff = toTime(left.targetDate) - toTime(right.targetDate)
      if (dateDiff !== 0) return dateDiff

      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const completed = items.filter((item) => item.status === 'completed').length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const overdue = items.filter((item) => item.status === 'overdue').length
  const upcomingSoon = items.filter((item) => item.status === 'soon').length
  const pending = items.length - completed
  const summaryStats: MilestoneSummaryStats = {
    shiftedCount: getShiftedMilestoneCount(tasks, asOf),
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    baselineOnTimeCount: tasks.filter(
      (task) =>
        task.is_milestone
        && isCompletedTask(task)
        && Boolean(String(task.actual_end_date ?? '').trim())
        && !isShiftedMilestone(task, asOf),
    ).length,
    dueSoon30dCount: items.filter((item) => {
      if (item.status === 'completed') return false
      const daysUntil = item.futureDueWindow.availability === 'available'
        ? item.futureDueWindow.value
        : null
      return daysUntil !== null && daysUntil >= 0 && daysUntil <= 30
    }).length,
    highRiskCount: items.filter((item) => {
      if (item.status === 'overdue') return true
      return item.non_base_labels.some((label) => HIGH_RISK_MILESTONE_LABELS.has(label))
    }).length,
  }

  return {
    items,
    stats: {
      total: items.length,
      pending,
      completed,
      overdue,
      upcomingSoon,
      completionRate: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
    },
    summaryStats
  }
}

export interface SupplementaryProjectSummary {
  preMilestoneCount: number
  completedPreMilestoneCount: number
  activePreMilestoneCount: number
  overduePreMilestoneCount: number
  acceptancePlanCount: number
  passedAcceptancePlanCount: number
  inProgressAcceptancePlanCount: number
  failedAcceptancePlanCount: number
  constructionDrawingCount: number
  issuedConstructionDrawingCount: number
  reviewingConstructionDrawingCount: number
}

export function summarizePlanningGovernanceStates(states: PlanningGovernanceState[] = []): GovernanceStateSummary {
  const activeStates = states.filter((state) => state.status === 'active')
  return {
    activeCount: activeStates.length,
    closeoutOverdueSignalCount: activeStates.filter((state) => state.kind === 'closeout_overdue_signal').length,
    closeoutOwnerAttentionCount: activeStates.filter((state) => state.kind === 'closeout_owner_attention').length,
    reorderReminderCount: activeStates.filter((state) => state.kind === 'reorder_reminder').length,
    reorderEscalationCount: activeStates.filter((state) => state.kind === 'reorder_escalation').length,
    reorderSummaryCount: states.filter((state) => state.kind === 'reorder_summary').length,
    adHocReminderCount: activeStates.filter((state) => state.kind === 'ad_hoc_cross_month_reminder').length,
    dashboardCloseoutOverdue: activeStates.some((state) => state.kind === 'closeout_overdue_signal' && state.dashboard_signal),
    dashboardCloseoutOwnerAttentionRequired: activeStates.some((state) => state.kind === 'closeout_owner_attention'),
    hasActiveGovernanceSignal: activeStates.length > 0,
  }
}

function isInSet(value: unknown, candidates: Set<string>): boolean {
  return candidates.has(normalizeStatus(value))
}

function isAcceptanceStatusInSet(value: unknown, candidates: Set<string>): boolean {
  return candidates.has(normalizeAcceptanceStatus(String(value ?? '')).trim().toLowerCase())
}

export function summarizeSupplementaryProjectData(input: {
  preMilestones: PreMilestoneRow[]
  acceptancePlans: AcceptancePlanRow[]
  constructionDrawings: ConstructionDrawingRow[]
}): SupplementaryProjectSummary {
  const preMilestoneCount = input.preMilestones.length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const completedPreMilestoneCount = input.preMilestones.filter((item) => isInSet(item.status, COMPLETED_PRE_MILESTONE_STATUSES)).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const overduePreMilestoneCount = input.preMilestones.filter((item) => isInSet(item.status, OVERDUE_PRE_MILESTONE_STATUSES)).length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const activePreMilestoneCount =
    input.preMilestones.filter((item) => isInSet(item.status, ACTIVE_PRE_MILESTONE_STATUSES)).length ||
    Math.max(0, preMilestoneCount - completedPreMilestoneCount - overduePreMilestoneCount)

  const acceptancePlanCount = input.acceptancePlans.length
  const passedAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, PASSED_ACCEPTANCE_STATUSES)).length
  const inProgressAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, IN_PROGRESS_ACCEPTANCE_STATUSES)).length
  const failedAcceptancePlanCount = input.acceptancePlans.filter((item) => isAcceptanceStatusInSet(item.status, FAILED_ACCEPTANCE_STATUSES)).length

  const constructionDrawingCount = input.constructionDrawings.length
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const issuedConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => isAcceptanceStatusInSet(item.review_status, PASSED_ACCEPTANCE_STATUSES),
  ).length
  const reviewingConstructionDrawingCount = input.constructionDrawings.filter(
    (item) => REVIEWING_DRAWING_STATUSES.has(String(item.status ?? '')) ||
      isAcceptanceStatusInSet(item.review_status, IN_PROGRESS_ACCEPTANCE_STATUSES),
  ).length

  return {
    preMilestoneCount,
    completedPreMilestoneCount,
    activePreMilestoneCount,
    overduePreMilestoneCount,
    acceptancePlanCount,
    passedAcceptancePlanCount,
    inProgressAcceptancePlanCount,
    failedAcceptancePlanCount,
    constructionDrawingCount,
    issuedConstructionDrawingCount,
    reviewingConstructionDrawingCount,
  }
}

async function calculateSummaryForProject(
  project: Project,
  tasks: Task[],
  risks: Risk[],
  issues: Issue[],
  conditions: TaskConditionRow[],
  dependencies: TaskDependencyRow[],
  obstacles: TaskObstacleRow[],
  monthlyPlans: MonthlyPlanRow[],
  notifications: NotificationRow[],
  supplementary: SupplementaryProjectSummary,
  governanceStates: PlanningGovernanceState[] = [],
  health: SummaryHealth,
  asOf = new Date(),
  calendar?: ConstructionCalendarContext | null,
  options: ProjectExecutionSummaryBuildOptions = {},
): Promise<ProjectExecutionSummary> {
  const companyOverviewOnly = options.mode === 'company_overview'
  const dashboardFastRead = options.mode === 'dashboard_fast'
  const leafTasks = getLeafTasks(tasks)
  const planPhaseCount = calculatePlanPhaseCount(tasks)
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const completedTaskCount = leafTasks.filter(isCompletedTask).length
  const inProgressTaskCount = leafTasks.filter(isInProgressTask).length
  const progressMetrics = calculateProgressMetrics(tasks, asOf)
  const overallProgress = progressMetrics.currentProgress
  const plannedProgress = progressMetrics.plannedProgress
  const progressDeviation = progressMetrics.progressDeviation
  const progressGap = plannedProgress === null ? null : plannedProgress - overallProgress
  const milestoneOverview = buildMilestoneOverview(tasks, asOf, calendar)
  const milestoneKpiComparisons = companyOverviewOnly || dashboardFastRead
    ? null
    : await buildMonthlyMilestoneKpiComparisons(
      project.id,
      milestoneOverview.summaryStats ?? {
        shiftedCount: 0,
        baselineOnTimeCount: 0,
        dueSoon30dCount: 0,
        highRiskCount: 0,
      },
      asOf,
    )
  const milestoneOverviewWithComparisons: MilestoneOverview = milestoneKpiComparisons
    ? {
      ...milestoneOverview,
      kpiComparisons: milestoneKpiComparisons,
    }
    : milestoneOverview
  const completedMilestones = milestoneOverview.stats.completed
  const milestoneProgress = milestoneOverview.stats.completionRate
  const statusLabel = deriveProjectStatusLabel(project.status, {
    overallProgress,
    leafTaskCount: leafTasks.length,
    completedTaskCount,
    totalMilestones: milestoneOverview.stats.total,
    completedMilestones,
  })
  const activeRisks = risks.filter(isActiveRisk)
  const activeIssues = issues.filter(isActiveIssue)
  const pendingConditions = conditions.filter(isPendingCondition)
  const activeObstacles = obstacles.filter(isActiveObstacle)
  const pendingConditionTaskCount = new Set(pendingConditions.map((item) => item.task_id).filter(Boolean)).size
  const activeObstacleTaskCount = new Set(activeObstacles.map((item) => item.task_id).filter(Boolean)).size
  const attentionSummary = companyOverviewOnly || dashboardFastRead
    ? { todayTodoCount: 0 }
    : await buildAttentionSummary(project.id, project.company_id ?? null, null)
  const todayTodoCount = attentionSummary.todayTodoCount
  const { delayedTaskCount, delayDays, delayCount } = getDelayMetrics(leafTasks, asOf, calendar)
  const laggedTaskCount = leafTasks.filter((task) => getTaskLagLevel(task) !== null).length
  const planningGovernance = summarizePlanningGovernanceStates(governanceStates)
  const attentionRequired = health.score < 60 || milestoneOverview.stats.overdue > 0
  const monthlyCloseStatus = deriveMonthlyCloseStatus(monthlyPlans, governanceStates, asOf)
  const closeoutOverdueDays = getCloseoutOverdueDays(governanceStates)
  const governancePhase = deriveGovernancePhase(monthlyPlans, governanceStates, planningGovernance, monthlyCloseStatus, asOf)
  const warningSignals = summarizeUnreadWarningSignals(notifications)
  const shiftedMilestoneCount = getShiftedMilestoneCount(tasks)
  const criticalTaskIds = companyOverviewOnly || dashboardFastRead
    ? new Set<string>()
    : await getCriticalPathTaskIds(project.id)
  const keyNodeSummary = buildKeyNodeSummary(leafTasks, {
    criticalTaskIds,
    pendingConditions,
    activeObstacles,
    asOf,
  })
  const criticalPathAffectedTasks = companyOverviewOnly || dashboardFastRead
    ? 0
    : await getCriticalPathAffectedTaskCount(project.id, leafTasks, pendingConditions, activeObstacles, asOf, criticalTaskIds)
  const responsibilityCoverageRate = calculateResponsibilityCoverageRate(leafTasks)
  const generatedPlanDurationReadinessRate = calculateGeneratedPlanDurationReadinessRate(leafTasks)
  const dependencyTopologyNonTrivialRate = calculateDependencyTopologyNonTrivialRate(leafTasks, dependencies)
  const responsibleUnitResolutionRate = calculateResponsibleUnitResolutionRate(leafTasks)
  const preconditionAttachmentRate = calculatePreconditionAttachmentRate(leafTasks, conditions)
  const baselineDeviationRate = calculateBaselineDeviationRate(leafTasks, asOf)
  const monthlyPlanSummaryMetrics = companyOverviewOnly || dashboardFastRead
    ? {
      monthlyPlanFulfillmentRate: calculateMonthlyPlanFulfillmentRate(leafTasks),
      monthlyPlanConfirmedCount: getMonthlyPlanConfirmedCount(monthlyPlans),
      monthlyPlanClosedCount: getMonthlyPlanClosedCount(monthlyPlans),
      monthlyPlanPendingCloseoutCount: getMonthlyPlanPendingCloseoutCount(monthlyPlans),
      temporaryWithoutBaselineCount: getTemporaryWithoutBaselineCount(monthlyPlans),
      planningPendingRealignCount: getPlanningPendingRealignCount(monthlyPlans),
    }
    : await loadMonthlyPlanSummaryMetrics(project.id, leafTasks, monthlyPlans)
  const monthlyPlanFulfillmentRate = monthlyPlanSummaryMetrics.monthlyPlanFulfillmentRate
  const monthlyPlanConfirmedCount = monthlyPlanSummaryMetrics.monthlyPlanConfirmedCount
  const monthlyPlanClosedCount = monthlyPlanSummaryMetrics.monthlyPlanClosedCount
  const monthlyPlanPendingCloseoutCount = monthlyPlanSummaryMetrics.monthlyPlanPendingCloseoutCount
  const monthlyProductivityDistribution = calculateMonthlyProductivityDistribution(leafTasks, asOf)
  const temporaryWithoutBaselineCount = monthlyPlanSummaryMetrics.temporaryWithoutBaselineCount
  const planningPendingRealignCount = monthlyPlanSummaryMetrics.planningPendingRealignCount
  const planningAlignmentStatus = derivePlanningAlignmentStatus({
    temporaryWithoutBaselineCount,
    planningPendingRealignCount,
  })
  const plannedStartDate = project.planned_start_date || project.start_date || null
  const plannedEndDate = project.planned_end_date || project.end_date || null
  const daysUntilPlannedEnd = plannedEndDate
    ? signedDurationDayDelta(asOf, plannedEndDate)
    : null
  const kpiComparisons = companyOverviewOnly || dashboardFastRead
    ? buildProjectKpiComparisons({
      progress: overallProgress,
      deviation: delayDays,
      risks: activeRisks.length,
      todos: todayTodoCount,
    }, null)
    : await buildWeeklyKpiComparisons(project.id, {
      progress: overallProgress,
      deviation: delayDays,
      risks: activeRisks.length,
      todos: todayTodoCount,
    }, asOf)

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    statusLabel,
    plannedStartDate,
    plannedEndDate,
    daysUntilPlannedEnd,
    totalTasks: tasks.length,
    leafTaskCount: leafTasks.length,
    planPhaseCount,
    completedTaskCount,
    inProgressTaskCount,
    delayedTaskCount,
    overdueTaskCount: delayedTaskCount,
    laggedTaskCount,
    delayDays,
    delayCount,
    overallProgress,
    plannedProgress,
    progressDeviation,
    progressGap,
    summaryAsOf: asOf.toISOString(),
    taskProgress: overallProgress,
    totalMilestones: milestoneOverview.stats.total,
    completedMilestones,
    milestoneProgress,
    riskCount: activeRisks.length,
    activeRiskCount: activeRisks.length,
    activeIssueCount: activeIssues.length,
    pendingConditionCount: pendingConditions.length,
    pendingConditionTaskCount,
    activeObstacleCount: activeObstacles.length,
    activeObstacleTaskCount,
    todayTodoCount,
    projectTodayActionCount: todayTodoCount,
    preMilestoneCount: supplementary.preMilestoneCount,
    completedPreMilestoneCount: supplementary.completedPreMilestoneCount,
    activePreMilestoneCount: supplementary.activePreMilestoneCount,
    overduePreMilestoneCount: supplementary.overduePreMilestoneCount,
    acceptancePlanCount: supplementary.acceptancePlanCount,
    passedAcceptancePlanCount: supplementary.passedAcceptancePlanCount,
    inProgressAcceptancePlanCount: supplementary.inProgressAcceptancePlanCount,
    failedAcceptancePlanCount: supplementary.failedAcceptancePlanCount,
    constructionDrawingCount: supplementary.constructionDrawingCount,
    issuedConstructionDrawingCount: supplementary.issuedConstructionDrawingCount,
    reviewingConstructionDrawingCount: supplementary.reviewingConstructionDrawingCount,
    attentionRequired,
    scheduleVarianceDays: delayDays,
    activeDelayedTasks: delayedTaskCount,
    activeObstacles: activeObstacles.length,
    monthlyCloseStatus,
    closeoutOverdueDays,
    unreadWarningCount: warningSignals.unreadWarningCount,
    highestWarningLevel: warningSignals.highestWarningLevel,
    highestWarningSummary: warningSignals.highestWarningSummary,
    shiftedMilestoneCount,
    criticalPathAffectedTasks,
    responsibilityCoverageRate,
    generatedPlanDurationReadinessRate,
    dependencyTopologyNonTrivialRate,
    responsibleUnitResolutionRate,
    preconditionAttachmentRate,
    baselineDeviationRate,
    monthlyPlanFulfillmentRate,
    monthlyPlanConfirmedCount,
    monthlyPlanClosedCount,
    monthlyPlanPendingCloseoutCount,
    monthlyProductivityDistribution,
    planningAlignmentStatus,
    temporaryWithoutBaselineCount,
    planningPendingRealignCount,
    healthStatus: health.status,
    businessHealthScore: health.businessHealthScore ?? health.score,
    reliabilityScore: health.reliabilityScore ?? health.healthConfidenceScore ?? null,
    healthConfidenceScore: health.healthConfidenceScore ?? null,
    healthConfidenceFlag: health.healthConfidenceFlag ?? 'unavailable',
    progressDeliveryScore: health.progressDeliveryScore ?? null,
    executionStabilityScore: health.executionStabilityScore ?? null,
    criticalTargetScore: health.criticalTargetScore ?? null,
    businessExceptionScore: health.businessExceptionScore ?? null,
    planGovernanceScore: health.planGovernanceScore ?? null,
    milestoneOverview: milestoneOverviewWithComparisons,
    keyNodeSummary,
    kpiComparisons,
    planningGovernance: {
      ...planningGovernance,
      governancePhase,
    },
  }
}

export interface GovernanceStateSummary {
  activeCount: number
  closeoutOverdueSignalCount: number
  closeoutOwnerAttentionCount: number
  reorderReminderCount: number
  reorderEscalationCount: number
  reorderSummaryCount: number
  adHocReminderCount: number
  dashboardCloseoutOverdue: boolean
  dashboardCloseoutOwnerAttentionRequired: boolean
  hasActiveGovernanceSignal: boolean
  governancePhase?: GovernancePhase
}

type SummaryHealth = {
  score: number
  status: ProjectExecutionSummary['healthStatus']
  businessHealthScore?: number | null
  reliabilityScore?: number | null
  healthConfidenceScore?: number | null
  healthConfidenceFlag?: string | null
  progressDeliveryScore?: number | null
  executionStabilityScore?: number | null
  criticalTargetScore?: number | null
  businessExceptionScore?: number | null
  planGovernanceScore?: number | null
}

type ProjectExecutionSummaryMode = 'full' | 'company_overview' | 'dashboard_fast'

type ProjectExecutionSummaryBuildOptions = {
  mode?: ProjectExecutionSummaryMode
}

function getPersistedProjectHealth(project: Pick<Project, 'health_score' | 'health_status'>): SummaryHealth {
  const score = Number(project.health_score ?? 0)
  const normalizedScore = Number.isFinite(score) ? score : 0
  const status = String(project.health_status ?? '').trim()

  if (status === '健康' || status === '亚健康' || status === '预警' || status === '危险' || status === '待完善') {
    return {
      score: normalizedScore,
      status,
      businessHealthScore: normalizedScore,
      reliabilityScore: null,
      healthConfidenceScore: null,
      healthConfidenceFlag: 'unavailable',
      progressDeliveryScore: null,
      executionStabilityScore: null,
      criticalTargetScore: null,
      businessExceptionScore: null,
      planGovernanceScore: null,
    }
  }

  return {
    score: normalizedScore,
    status: getHealthStatus(normalizedScore),
    businessHealthScore: normalizedScore,
    reliabilityScore: null,
    healthConfidenceScore: null,
    healthConfidenceFlag: 'unavailable',
    progressDeliveryScore: null,
    executionStabilityScore: null,
    criticalTargetScore: null,
    businessExceptionScore: null,
    planGovernanceScore: null,
  }
}

async function resolveProjectConstructionCalendar(projectId: string): Promise<ConstructionCalendarContext> {
  return resolveConstructionCalendarContext({
    projectId,
    onError: (error) => logger.warn('[projectExecutionSummaryService] construction calendar unavailable', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    }),
  })
}

async function resolveSummaryHealth(
  project: Pick<Project, 'id' | 'health_score' | 'health_status'>,
  options?: { preferPersisted?: boolean; calendar?: ConstructionCalendarContext | null },
): Promise<SummaryHealth> {
  const persisted = getPersistedProjectHealth(project)

  if (options?.preferPersisted) {
    return persisted
  }

  try {
    const health = await calculateProjectHealth(project.id, { calendar: options?.calendar })
    return {
      score: health.score,
      status: health.details.healthStatus,
      businessHealthScore: health.details.businessHealthScore,
      reliabilityScore: health.details.reliabilityScore,
      healthConfidenceScore: health.details.healthConfidenceScore,
      healthConfidenceFlag: health.details.healthConfidenceFlag,
      progressDeliveryScore: health.details.progressDeliveryScore,
      executionStabilityScore: health.details.executionStabilityScore,
      criticalTargetScore: health.details.criticalTargetScore,
      businessExceptionScore: health.details.businessExceptionScore,
      planGovernanceScore: health.details.planGovernanceScore,
    }
  } catch (error) {
    logger.warn('[projectExecutionSummaryService] failed to recalculate project health, fallback to persisted summary value', {
      projectId: project.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return persisted
  }
}

async function loadSummaryProjects(projectIds?: string[] | null, systemJob = false): Promise<Project[]> {
  return filterProjectsByIds(await executeSummaryQuery<Project>('summaryProjectsAll', [], { projectIds, systemJob }), projectIds)
}

async function loadSummaryTasks(projectIds?: string[] | null, systemJob = false): Promise<Task[]> {
  const rows = filterRowsByProjectIds(await executeSummaryQuery<Task>('summaryTasksAll', [], { projectIds, systemJob }), projectIds)
    .filter((task) => !isHistoricalTask(task))
  return attachCurrentBaselineProjectionToTasks(rows)
}

async function loadSummaryRisks(projectIds?: string[] | null, systemJob = false): Promise<Risk[]> {
  return filterRowsByProjectIds(await executeSummaryQuery<Risk>('summaryRisksAll', [], { projectIds, systemJob }), projectIds)
}

export async function getProjectExecutionSummary(
  projectId: string,
  options: { asOf?: Date | string } = {},
): Promise<ProjectExecutionSummary | null> {
  const project = await getProject(projectId)
  if (!project) return null

  const [
    tasks,
    risks,
    issues,
    conditions,
    dependencies,
    obstacles,
    monthlyPlans,
    notifications,
    preMilestones,
    acceptancePlans,
    constructionDrawings,
    governanceStates,
    milestoneSignalBundles,
    workCalendar,
  ] = await Promise.all([
    getTasks(projectId).then((rows) => attachCurrentBaselineProjectionToTasks(rows)),
    getRisks(projectId),
    getIssues(projectId),
    executeSummaryQuery<TaskConditionRow>('summaryTaskConditionsAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<TaskDependencyRow>('summaryTaskDependenciesAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<TaskObstacleRow>('summaryTaskObstaclesAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<MonthlyPlanRow>('summaryMonthlyPlansAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<NotificationRow>('summaryNotificationsAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<PreMilestoneRow>('summaryPreMilestonesAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<AcceptancePlanRow>('summaryAcceptancePlansAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    executeSummaryQuery<ConstructionDrawingRow>('summaryConstructionDrawingsAll', [], { projectIds: [projectId] }).then((rows) => filterRowsByProjectIds(rows, [projectId])),
    loadPlanningGovernanceStates(projectId),
    loadMilestoneSignalBundles([projectId]),
    resolveProjectConstructionCalendar(projectId),
  ])
  const scopedTasks = tasks.filter((task) => !isHistoricalTask(task))
  const decoratedTasks = decorateTasksWithMilestoneSignals(scopedTasks, milestoneSignalBundles.get(projectId))
  const health = await resolveSummaryHealth(project, { calendar: workCalendar })
  const asOf = options.asOf ? new Date(options.asOf) : new Date()

  return await calculateSummaryForProject(
    project,
    decoratedTasks,
    risks,
    issues,
    conditions,
    dependencies,
    obstacles,
    monthlyPlans,
    notifications,
    summarizeSupplementaryProjectData({
      preMilestones,
      acceptancePlans,
      constructionDrawings,
    }),
    governanceStates,
    health,
    asOf,
    workCalendar,
  )
}

export function ensureDashboardProjectSummaryContract(summary: ProjectExecutionSummary): ProjectExecutionSummary {
  const contractSummary = summary as ProjectExecutionSummary & {
    plannedProgress?: number | null
    progressDeviation?: number | null
    progressGap?: number | null
    summaryAsOf?: string | null
    plannedEndDate?: string | null
  }

  return {
    ...summary,
    plannedProgress: contractSummary.plannedProgress ?? null,
    progressDeviation: contractSummary.progressDeviation ?? null,
    progressGap: contractSummary.progressGap ?? null,
    summaryAsOf: contractSummary.summaryAsOf || new Date().toISOString(),
    plannedEndDate: contractSummary.plannedEndDate ?? null,
  }
}

export async function getDashboardProjectExecutionSummary(
  projectId: string,
  options: { asOf?: Date | string } = {},
): Promise<ProjectExecutionSummary | null> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return null

  const scopedProjectIds = [normalizedProjectId]
  const asOf = options.asOf ? new Date(options.asOf) : new Date()
  const [
    projects,
    tasks,
    risks,
    issues,
    conditions,
    dependencies,
    obstacles,
    monthlyPlans,
    notifications,
    preMilestones,
    acceptancePlans,
    constructionDrawings,
  ] = await Promise.all([
    loadSummaryProjects(scopedProjectIds),
    executeSummaryQuery<Task>('summaryTasksAll', [], { projectIds: scopedProjectIds })
      .then((rows) => filterRowsByProjectIds(rows, scopedProjectIds).filter((task) => !isHistoricalTask(task))),
    loadSummaryRisks(scopedProjectIds),
    executeSummaryQuery<Issue>('summaryIssuesAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<TaskConditionRow>('summaryTaskConditionsAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<TaskDependencyRow>('summaryTaskDependenciesAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<TaskObstacleRow>('summaryTaskObstaclesAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<MonthlyPlanRow>('summaryMonthlyPlansAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<NotificationRow>('summaryNotificationsAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<PreMilestoneRow>('summaryPreMilestonesAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<AcceptancePlanRow>('summaryAcceptancePlansAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    executeSummaryQuery<ConstructionDrawingRow>('summaryConstructionDrawingsAll', [], { projectIds: scopedProjectIds }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
  ])

  const project = projects[0] ?? null
  if (!project) return null

  const summary = await calculateSummaryForProject(
    project,
    tasks,
    risks,
    issues,
    conditions,
    dependencies,
    obstacles,
    monthlyPlans,
    notifications,
    summarizeSupplementaryProjectData({
      preMilestones,
      acceptancePlans,
      constructionDrawings,
    }),
    [],
    getPersistedProjectHealth(project),
    asOf,
    null,
    { mode: 'dashboard_fast' },
  )

  return ensureDashboardProjectSummaryContract(summary)
}

export async function getAllProjectExecutionSummaries(options: {
  projectIds?: string[] | null
  asOf?: Date | string
  mode?: ProjectExecutionSummaryMode
  systemJob?: boolean
} = {}): Promise<ProjectExecutionSummary[]> {
  const scopedProjectIds = normalizeProjectIdList(options.projectIds)
  if (scopedProjectIds === null && options.systemJob !== true) {
    throw new Error('projectIds are required outside an explicit system job')
  }
  const asOf = options.asOf ? new Date(options.asOf) : new Date()
  const mode = options.mode ?? 'full'
  if (scopedProjectIds !== null && scopedProjectIds.length === 0) return []

  const summaryLoaders = [
    () => loadSummaryProjects(scopedProjectIds, options.systemJob === true),
    () => loadSummaryTasks(scopedProjectIds, options.systemJob === true),
    () => loadSummaryRisks(scopedProjectIds, options.systemJob === true),
    () => executeSummaryQuery<Issue>('summaryIssuesAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<TaskConditionRow>('summaryTaskConditionsAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<TaskDependencyRow>('summaryTaskDependenciesAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<TaskObstacleRow>('summaryTaskObstaclesAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<MonthlyPlanRow>('summaryMonthlyPlansAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<NotificationRow>('summaryNotificationsAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<PreMilestoneRow>('summaryPreMilestonesAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<AcceptancePlanRow>('summaryAcceptancePlansAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => executeSummaryQuery<ConstructionDrawingRow>('summaryConstructionDrawingsAll', [], { projectIds: scopedProjectIds, systemJob: options.systemJob }).then((rows) => filterRowsByProjectIds(rows, scopedProjectIds)),
    () => mode === 'company_overview' ? Promise.resolve([]) : loadPlanningGovernanceStates(undefined, scopedProjectIds, options.systemJob === true),
    () => mode === 'company_overview'
      ? Promise.resolve(new Map())
      : scopedProjectIds ? loadMilestoneSignalBundles(scopedProjectIds) : Promise.resolve(null),
  ] as const

  const [
    projects,
    tasks,
    risks,
    issues,
    conditions,
    dependencies,
    obstacles,
    monthlyPlans,
    notifications,
    preMilestones,
    acceptancePlans,
    constructionDrawings,
    governanceStates,
    preloadedMilestoneSignalBundles,
  ] = await runWithConcurrency(
    [...summaryLoaders],
    mode === 'company_overview'
      ? COMPANY_OVERVIEW_SUMMARY_QUERY_CONCURRENCY
      : summaryLoaders.length,
  )
  const milestoneSignalBundles = preloadedMilestoneSignalBundles
    ?? await loadMilestoneSignalBundles(projects.map((project) => project.id))
  const decoratedTasks = tasks.map((task) => {
    const bundle = milestoneSignalBundles.get(task.project_id)
    return decorateTasksWithMilestoneSignals([task], bundle)[0] ?? task
  })

  const tasksByProject = new Map<string, Task[]>()
  const risksByProject = new Map<string, Risk[]>()
  const issuesByProject = new Map<string, Issue[]>()
  const conditionsByProject = new Map<string, TaskConditionRow[]>()
  const dependenciesByProject = new Map<string, TaskDependencyRow[]>()
  const obstaclesByProject = new Map<string, TaskObstacleRow[]>()
  const monthlyPlansByProject = new Map<string, MonthlyPlanRow[]>()
  const notificationsByProject = new Map<string, NotificationRow[]>()
  const preMilestonesByProject = new Map<string, PreMilestoneRow[]>()
  const acceptancePlansByProject = new Map<string, AcceptancePlanRow[]>()
  const constructionDrawingsByProject = new Map<string, ConstructionDrawingRow[]>()
  const governanceStatesByProject = new Map<string, PlanningGovernanceState[]>()

  for (const task of decoratedTasks) {
    const list = tasksByProject.get(task.project_id) || []
    list.push(task)
    tasksByProject.set(task.project_id, list)
  }

  for (const risk of risks) {
    const list = risksByProject.get(risk.project_id) || []
    list.push(risk)
    risksByProject.set(risk.project_id, list)
  }

  for (const issue of issues) {
    const list = issuesByProject.get(issue.project_id) || []
    list.push(issue)
    issuesByProject.set(issue.project_id, list)
  }

  for (const condition of conditions) {
    const projectId = condition.project_id
    if (!projectId) continue
    const list = conditionsByProject.get(projectId) || []
    list.push(condition)
    conditionsByProject.set(projectId, list)
  }

  for (const dependency of dependencies) {
    const projectId = dependency.project_id
    if (!projectId) continue
    const list = dependenciesByProject.get(projectId) || []
    list.push(dependency)
    dependenciesByProject.set(projectId, list)
  }

  for (const obstacle of obstacles) {
    const projectId = obstacle.project_id
    if (!projectId) continue
    const list = obstaclesByProject.get(projectId) || []
    list.push(obstacle)
    obstaclesByProject.set(projectId, list)
  }

  for (const plan of monthlyPlans) {
    const projectId = plan.project_id
    if (!projectId) continue
    const list = monthlyPlansByProject.get(projectId) || []
    list.push(plan)
    monthlyPlansByProject.set(projectId, list)
  }

  for (const notification of notifications) {
    const projectId = notification.project_id
    if (!projectId) continue
    const list = notificationsByProject.get(projectId) || []
    list.push(notification)
    notificationsByProject.set(projectId, list)
  }

  for (const row of preMilestones) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = preMilestonesByProject.get(projectId) || []
    list.push(row)
    preMilestonesByProject.set(projectId, list)
  }

  for (const row of acceptancePlans) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = acceptancePlansByProject.get(projectId) || []
    list.push(row)
    acceptancePlansByProject.set(projectId, list)
  }

  for (const row of constructionDrawings) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = constructionDrawingsByProject.get(projectId) || []
    list.push(row)
    constructionDrawingsByProject.set(projectId, list)
  }

  for (const row of governanceStates) {
    const projectId = row.project_id
    if (!projectId) continue
    const list = governanceStatesByProject.get(projectId) || []
    list.push(row)
    governanceStatesByProject.set(projectId, list)
  }

  const healthResults = await Promise.all(
    projects.map(async (project) => {
      const health = await resolveSummaryHealth(project, { preferPersisted: true })
      return [project.id, health] as const
    }),
  )
  const healthByProject = new Map<string, SummaryHealth>(healthResults)
  const calendarResults = mode === 'company_overview'
    ? [] as Array<readonly [string, ConstructionCalendarContext]>
    : await Promise.all(
      projects.map(async (project) => [project.id, await resolveProjectConstructionCalendar(project.id)] as const),
    )
  const calendarByProject = new Map<string, ConstructionCalendarContext>(calendarResults)

  return await Promise.all(
    projects.map(async (project) => {
      const workCalendar = mode === 'company_overview' ? null : calendarByProject.get(project.id)
      return await calculateSummaryForProject(
        project,
        tasksByProject.get(project.id) || [],
        risksByProject.get(project.id) || [],
        issuesByProject.get(project.id) || [],
        conditionsByProject.get(project.id) || [],
        dependenciesByProject.get(project.id) || [],
        obstaclesByProject.get(project.id) || [],
        monthlyPlansByProject.get(project.id) || [],
        notificationsByProject.get(project.id) || [],
        summarizeSupplementaryProjectData({
          preMilestones: preMilestonesByProject.get(project.id) || [],
          acceptancePlans: acceptancePlansByProject.get(project.id) || [],
          constructionDrawings: constructionDrawingsByProject.get(project.id) || [],
        }),
        governanceStatesByProject.get(project.id) || [],
        healthByProject.get(project.id) || getPersistedProjectHealth(project),
        asOf,
        workCalendar,
        { mode },
      )
    }),
  )
}
