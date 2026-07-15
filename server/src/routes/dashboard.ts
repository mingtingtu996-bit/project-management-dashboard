// Dashboard API 路由
// 项目级执行摘要、今日进展与重点关注任务

import { Router } from 'express'
import { supabase } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import {
  ensureDashboardProjectSummaryContract,
  getAllProjectExecutionSummaries,
  getDashboardProjectExecutionSummary,
  type ProjectExecutionSummary,
} from '../services/projectExecutionSummaryService.js'
import { buildAttentionSummary } from '../services/todoTouchpointService.js'
import { REQUEST_TIMEOUT_BUDGETS, runWithRequestBudget } from '../services/requestBudgetService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { getVisibleProjectIds } from '../auth/access.js'
import { getLeafTasks } from '../utils/progressCalculation.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import {
  buildCompanySummaryResponse,
  loadCompanyHealthHistoryRows,
  type CompanySummaryResponse,
} from '../services/companySummaryService.js'
import { deriveTaskUnifiedStatus } from '../services/taskStatusDerivationService.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from '../services/constructionCalendar.js'

const router = Router({ mergeParams: true })
export const companyDashboardRouter = Router()

const DASHBOARD_PROJECT_SUMMARY_CACHE_TTL_MS = Number(process.env.DASHBOARD_PROJECT_SUMMARY_CACHE_TTL_MS ?? 300_000)
const DASHBOARD_ATTENTION_SUMMARY_BUDGET_MS = Number(process.env.DASHBOARD_ATTENTION_SUMMARY_BUDGET_MS ?? 500)
const DASHBOARD_PROJECT_ROWS_CACHE_TTL_MS = Number(process.env.DASHBOARD_PROJECT_ROWS_CACHE_TTL_MS ?? 300_000)
const DASHBOARD_TODAY_PROGRESS_CACHE_TTL_MS = Number(process.env.DASHBOARD_TODAY_PROGRESS_CACHE_TTL_MS ?? 120_000)
const DASHBOARD_COMPANY_SUMMARY_CACHE_TTL_MS = Number(process.env.DASHBOARD_COMPANY_SUMMARY_CACHE_TTL_MS ?? 60_000)
const DASHBOARD_COMPANY_VISIBLE_PROJECT_IDS_CACHE_TTL_MS = Number(
  process.env.DASHBOARD_COMPANY_VISIBLE_PROJECT_IDS_CACHE_TTL_MS ?? DASHBOARD_COMPANY_SUMMARY_CACHE_TTL_MS,
)
const dashboardProjectSummaryCache = new Map<string, { expiresAt: number; summary: ProjectExecutionSummary }>()
const dashboardProjectRowsCache = new Map<string, { expiresAt: number; promise: Promise<AnyRow[]> }>()
const dashboardTodayProgressCache = new Map<string, { expiresAt: number; items: any[] }>()
const dashboardCompanySummaryCache = new Map<string, { expiresAt: number; summary: CompanySummaryResponse }>()
const dashboardCompanyVisibleProjectIdsCache = new Map<string, { expiresAt: number; projectIds: string[] | null }>()

export function clearDashboardRouteCachesForTest() {
  if (process.env.NODE_ENV !== 'test') return
  dashboardProjectSummaryCache.clear()
  dashboardProjectRowsCache.clear()
  dashboardTodayProgressCache.clear()
  dashboardCompanySummaryCache.clear()
  dashboardCompanyVisibleProjectIdsCache.clear()
}

type TodayProgressItem = {
  id: string
  taskId: string
  title: string
  previousProgress: number
  currentProgress: number
  delta: number
  changedAt: string
}

type FocusTaskFilter = 'today' | '3days' | 'week' | 'urgent'

type FocusTaskDueStatus = 'overdue' | 'urgent' | 'approaching' | 'normal'

type FocusTaskItem = {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'blocked' | 'completed'
  statusLabel: string
  progress: number
  assignee?: string
  assigneeUnit?: string
  endDate?: string
  daysUntilDue: number | null
  dueStatus: FocusTaskDueStatus
  dueLabel: string
  updatedAt?: string
  isTodayTodo?: boolean
}

type FocusTaskStats = {
  total: number
  overdue: number
  urgent: number
  approaching: number
  normal: number
}

type FocusTasksResponse = {
  filter: FocusTaskFilter
  stats: FocusTaskStats
  items: FocusTaskItem[]
  totalCount: number
}

type AnyRow = Record<string, any>
type DashboardProjectRowsTable =
  | 'tasks'
  | 'risks'
  | 'issues'
  | 'task_conditions'
  | 'task_obstacles'
  | 'notifications'

const DASHBOARD_PROJECT_ROWS_TABLES = new Set<DashboardProjectRowsTable>([
  'tasks',
  'risks',
  'issues',
  'task_conditions',
  'task_obstacles',
  'notifications',
])

const DASHBOARD_TASK_OBSTACLE_SELECT_COLUMNS = [
  'id',
  'task_id',
  'project_id',
  'status',
  'is_resolved',
  'created_at',
  'updated_at',
  'estimated_resolve_date',
].join(', ')

function getDashboardProjectRowsSelectColumns(table: DashboardProjectRowsTable) {
  return table === 'task_obstacles'
    ? DASHBOARD_TASK_OBSTACLE_SELECT_COLUMNS
    : '*'
}

function getTodayRange() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return {
    dateKey: start.toISOString().slice(0, 10),
    start,
    end,
  }
}

function isWithinRange(value: unknown, start: Date, end: Date) {
  if (!value) return false
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) && date >= start && date < end
}

function isSameDate(value: unknown, dateKey: string) {
  if (!value) return false
  return String(value).slice(0, 10) === dateKey
}

function firstText(row: AnyRow, fields: string[], fallback = '') {
  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value !== null && value !== undefined && typeof value !== 'object') return String(value)
  }
  return fallback
}

function isClosedStatus(value: unknown) {
  const status = String(value ?? '').trim().toLowerCase()
  return ['closed', 'resolved', 'completed', 'done', '已关闭', '已解决', '已完成'].includes(status)
}

function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function normalizeProgressValue(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function toDateKey(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

function buildCompanySummaryCacheKey(params: {
  userId?: string | null
  globalRole?: string | null
  companyId?: string | null
  projectIds: string[] | null
}) {
  return JSON.stringify({
    userId: String(params.userId ?? ''),
    globalRole: String(params.globalRole ?? ''),
    companyId: String(params.companyId ?? ''),
    projectIds: params.projectIds === null ? null : [...params.projectIds].sort(),
  })
}

function buildCompanySummaryVisibleProjectIdsCacheKey(params: {
  userId?: string | null
  globalRole?: string | null
  companyId?: string | null
}) {
  return JSON.stringify({
    userId: String(params.userId ?? ''),
    globalRole: String(params.globalRole ?? ''),
    companyId: String(params.companyId ?? ''),
  })
}

async function getCachedCompanySummaryVisibleProjectIds(params: {
  userId?: string | null
  globalRole?: string | null
  companyId?: string | null
}) {
  if (!params.userId) return [] as string[]

  const cacheKey = buildCompanySummaryVisibleProjectIdsCacheKey(params)
  const cached = dashboardCompanyVisibleProjectIdsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.projectIds === null ? null : [...cached.projectIds]
  }

  const projectIds = await getVisibleProjectIds(params.userId, params.globalRole, params.companyId)
  dashboardCompanyVisibleProjectIdsCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_COMPANY_VISIBLE_PROJECT_IDS_CACHE_TTL_MS,
    projectIds: projectIds === null ? null : [...projectIds],
  })
  return projectIds
}

async function resolveCompanySummaryProjectIds(
  companyId: string | null,
  visibleProjectIds: string[] | null,
): Promise<string[]> {
  if (visibleProjectIds !== null) {
    return visibleProjectIds
  }

  if (!companyId) return []

  const result = await rawQuery(
    'SELECT id FROM projects WHERE company_id = $1',
    [companyId],
  )
  return (result.rows as Array<{ id?: string | null }>)
    .map((row) => String(row.id ?? '').trim())
    .filter(Boolean)
}

function parseTaskMetadata(row: AnyRow): Record<string, unknown> {
  const metadata = row.standard_task_metadata
  if (!metadata) return {}
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata as Record<string, unknown>
  if (typeof metadata !== 'string') return {}
  try {
    const parsed = JSON.parse(metadata)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function isHistoricalTaskRow(row: AnyRow): boolean {
  return row.is_historical === true || parseTaskMetadata(row).is_historical === true
}

async function queryDashboardTaskRows(projectId: string): Promise<AnyRow[]> {
  return (await queryProjectRows('tasks', projectId)).filter((task) => !isHistoricalTaskRow(task))
}

function compareSnapshotRows(left: AnyRow, right: AnyRow): number {
  const dateDiff = String(left.snapshot_date ?? '').localeCompare(String(right.snapshot_date ?? ''))
  if (dateDiff !== 0) return dateDiff
  return new Date(String(left.created_at ?? 0)).getTime() - new Date(String(right.created_at ?? 0)).getTime()
}

function normalizeFocusTaskFilter(value: unknown): FocusTaskFilter {
  const normalized = String(value ?? '').trim()
  if (normalized === 'today' || normalized === '3days' || normalized === 'week' || normalized === 'urgent') return normalized
  return 'week'
}

function normalizeFocusTaskLimit(value: unknown): number {
  const numeric = Number(value ?? 6)
  if (!Number.isFinite(numeric)) return 6
  return Math.min(Math.max(Math.trunc(numeric), 1), 50)
}

function normalizeFocusTaskStatus(row: AnyRow): FocusTaskItem['status'] {
  const status = String(row.status ?? '').trim().toLowerCase()
  if (isCompletedTask(row)) return 'completed'
  if (['in_progress', 'active', '进行中'].includes(status)) return 'in_progress'
  if (['blocked', '阻塞', '受阻'].includes(status)) return 'blocked'
  return 'pending'
}

function getFocusTaskStatusLabel(row: AnyRow): string {
  const rawStatus = firstText(row, ['status'])
  if (rawStatus) return rawStatus
  const status = normalizeFocusTaskStatus(row)
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '进行中'
  if (status === 'blocked') return '受阻'
  return '未开始'
}

function getDateOnly(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  return text.slice(0, 10)
}

function buildFocusTaskDueMeta(
  row: AnyRow,
  now = new Date(),
  calendar?: ConstructionCalendarContext | null,
): Pick<FocusTaskItem, 'endDate' | 'daysUntilDue' | 'dueStatus' | 'dueLabel'> {
  const endDate = getDateOnly(row.planned_end_date ?? row.end_date ?? row.due_date)
  const unifiedDue = deriveTaskUnifiedStatus(
    {
      status: row.status,
      progress: row.progress,
      planned_end_date: row.planned_end_date ?? row.due_date,
      end_date: row.end_date,
      duePolicy: row.duePolicy ?? row.due_policy,
      due_policy: row.due_policy,
      due_urgent_days: row.due_urgent_days,
      due_approaching_days: row.due_approaching_days,
    },
    { currentDate: now, calendar },
  ).dueStatus

  if (!endDate) {
    return {
      endDate: undefined,
      daysUntilDue: null,
      dueStatus: unifiedDue.status,
      dueLabel: unifiedDue.label,
    }
  }

  return {
    endDate,
    daysUntilDue: unifiedDue.daysUntilDue,
    dueStatus: unifiedDue.status,
    dueLabel: unifiedDue.label,
  }
}

function getTaskIdFromLinkedRow(row: AnyRow): string {
  return String(
    row.task_id
    ?? row.source_task_id
    ?? (String(row.source_entity_type ?? '').trim() === 'task' ? row.source_entity_id : null)
    ?? (String(row.entity_type ?? '').trim() === 'task' ? row.entity_id : null)
    ?? '',
  ).trim()
}

function isActiveTodoRow(row: AnyRow) {
  return !isClosedStatus(row.status)
    && !isClosedStatus(row.lifecycle_status)
    && !isClosedStatus(row.resolution_status)
    && !isTruthy(row.is_resolved)
    && !isTruthy(row.resolved)
}

async function collectTodayTodoTaskIds(projectId: string, taskRows: AnyRow[]) {
  const { dateKey, start, end } = getTodayRange()
  const taskIds = new Set<string>()

  for (const task of taskRows) {
    const taskId = String(task.id ?? '').trim()
    if (!taskId || isCompletedTask(task)) continue
    if (isSameDate(task.planned_end_date ?? task.end_date ?? task.due_date, dateKey)) {
      taskIds.add(taskId)
    }
  }

  const linkedTables: DashboardProjectRowsTable[] = ['risks', 'issues', 'task_conditions', 'task_obstacles', 'notifications']
  const linkedTableRows = await Promise.all(
    linkedTables.map(async (table) => {
      try {
        return { table, rows: await queryProjectRows(table, projectId) }
      } catch (error) {
        logger.warn('Failed to collect dashboard today todo task links', { projectId, table, error })
        return { table, rows: [] as AnyRow[] }
      }
    }),
  )

  for (const { table, rows } of linkedTableRows) {
    try {
      for (const row of rows) {
        const taskId = getTaskIdFromLinkedRow(row)
        if (!taskId || !isActiveTodoRow(row)) continue
        const happenedToday =
          isWithinRange(row.created_at, start, end)
          || isWithinRange(row.updated_at, start, end)
          || isSameDate(row.expected_resolution_date ?? row.estimated_resolve_date ?? row.due_date, dateKey)
        if (!happenedToday) continue
        if (table === 'notifications') {
          const touchpointType = String(row.touchpoint_type ?? '').trim()
          if (touchpointType && touchpointType !== 'dashboard_todo') continue
        }
        taskIds.add(taskId)
      }
    } catch (error) {
      logger.warn('Failed to collect dashboard today todo task links', { projectId, table, error })
    }
  }

  return taskIds
}

function toFocusTaskItem(
  row: AnyRow,
  now = new Date(),
  todayTodoTaskIds?: Set<string>,
  calendar?: ConstructionCalendarContext | null,
): FocusTaskItem {
  const dueMeta = buildFocusTaskDueMeta(row, now, calendar)
  const taskId = String(row.id ?? '')
  return {
    id: taskId,
    title: firstText(row, ['title'], '未命名任务'),
    status: normalizeFocusTaskStatus(row),
    statusLabel: getFocusTaskStatusLabel(row),
    progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
    assignee: firstText(row, ['assignee_name', 'assignee']),
    assigneeUnit: firstText(row, ['participant_unit_name']),
    endDate: dueMeta.endDate,
    daysUntilDue: dueMeta.daysUntilDue,
    dueStatus: dueMeta.dueStatus,
    dueLabel: dueMeta.dueLabel,
    updatedAt: firstText(row, ['updated_at', 'created_at']),
    isTodayTodo: todayTodoTaskIds?.has(taskId) ?? false,
  }
}

function buildFocusTaskStats(items: FocusTaskItem[]): FocusTaskStats {
  return {
    total: items.length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    overdue: items.filter((item) => item.dueStatus === 'overdue').length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    urgent: items.filter((item) => item.dueStatus === 'urgent').length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    approaching: items.filter((item) => item.dueStatus === 'approaching').length,
    // eslint-disable-next-line -- route-level-aggregation-approved
    normal: items.filter((item) => item.dueStatus === 'normal').length,
  }
}

function includeFocusTaskByFilter(item: FocusTaskItem, filter: FocusTaskFilter): boolean {
  switch (filter) {
    case 'today':
      return item.isTodayTodo === true
    case '3days':
      return item.daysUntilDue !== null && item.daysUntilDue >= 0 && item.daysUntilDue <= 3
    case 'urgent':
      return item.dueStatus === 'urgent' || item.dueStatus === 'overdue'
    case 'week':
    default:
      return item.daysUntilDue !== null && item.daysUntilDue >= 0 && item.daysUntilDue <= 7
  }
}

function compareFocusTasks(left: FocusTaskItem, right: FocusTaskItem): number {
  const priority: Record<FocusTaskDueStatus, number> = {
    overdue: 0,
    urgent: 1,
    approaching: 2,
    normal: 3,
  }
  const priorityDiff = priority[left.dueStatus] - priority[right.dueStatus]
  if (priorityDiff !== 0) return priorityDiff

  const leftDue = left.daysUntilDue ?? Number.POSITIVE_INFINITY
  const rightDue = right.daysUntilDue ?? Number.POSITIVE_INFINITY
  if (leftDue !== rightDue) return leftDue - rightDue

  return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime()
}

function assertDashboardProjectRowsTable(table: string): asserts table is DashboardProjectRowsTable {
  if (!DASHBOARD_PROJECT_ROWS_TABLES.has(table as DashboardProjectRowsTable)) {
    throw new Error(`Unsupported dashboard project rows table: ${table}`)
  }
}

async function queryProjectRows(table: DashboardProjectRowsTable, projectId: string) {
  const cacheKey = `${table}:${projectId}`
  const cached = dashboardProjectRowsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = queryProjectRowsFresh(table, projectId)
  dashboardProjectRowsCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_PROJECT_ROWS_CACHE_TTL_MS,
    promise,
  })

  promise.catch(() => {
    const current = dashboardProjectRowsCache.get(cacheKey)
    if (current?.promise === promise) {
      dashboardProjectRowsCache.delete(cacheKey)
    }
  })

  return promise
}

async function queryDashboardProjectRowsDirect(table: DashboardProjectRowsTable, projectId: string) {
  switch (table) {
    case 'tasks':
      return rawQuery('SELECT * FROM public.tasks WHERE project_id = $1', [projectId])
    case 'risks':
      return rawQuery('SELECT * FROM public.risks WHERE project_id = $1', [projectId])
    case 'issues':
      return rawQuery('SELECT * FROM public.issues WHERE project_id = $1', [projectId])
    case 'task_conditions':
      return rawQuery('SELECT * FROM public.task_conditions WHERE project_id = $1', [projectId])
    case 'task_obstacles':
      return rawQuery(`SELECT ${DASHBOARD_TASK_OBSTACLE_SELECT_COLUMNS} FROM public.task_obstacles WHERE project_id = $1`, [projectId])
    case 'notifications':
      return rawQuery('SELECT * FROM public.notifications WHERE project_id = $1', [projectId])
  }
}

async function queryProjectRowsFresh(table: DashboardProjectRowsTable, projectId: string) {
  assertDashboardProjectRowsTable(table)

  try {
    const result = await queryDashboardProjectRowsDirect(table, projectId)
    return result.rows as AnyRow[]
  } catch (error) {
    logger.warn('Dashboard direct project rows query failed, falling back to Supabase REST', {
      projectId,
      table,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from(table)
    .select(getDashboardProjectRowsSelectColumns(table))
    .eq('project_id', projectId)

  if (error) {
    throw new Error(`${table} query failed: ${error.message}`)
  }

  return Array.isArray(data) ? data as AnyRow[] : []
}

async function queryTaskProgressSnapshots(taskIds: string[]) {
  const normalizedTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (normalizedTaskIds.length === 0) return []

  try {
    const result = await rawQuery(
      'SELECT * FROM public.task_progress_snapshots WHERE task_id = ANY($1::uuid[])',
      [normalizedTaskIds],
    )
    return result.rows as AnyRow[]
  } catch (error) {
    logger.warn('Dashboard direct task_progress_snapshots query failed, falling back to Supabase REST', {
      taskCount: normalizedTaskIds.length,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const rows: AnyRow[] = []
  const batchSize = 200
  for (let index = 0; index < normalizedTaskIds.length; index += batchSize) {
    const batch = normalizedTaskIds.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('task_progress_snapshots')
      .select('*')
      .in('task_id', batch)

    if (error) {
      throw new Error(`task_progress_snapshots query failed: ${error.message}`)
    }
    if (Array.isArray(data)) rows.push(...data as AnyRow[])
  }

  return rows
}

async function queryTodayProgressChangeLogs(projectId: string, taskIds: string[], start: Date, end: Date) {
  const normalizedTaskIds = [...new Set(taskIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!projectId || normalizedTaskIds.length === 0) return []

  try {
    const result = await rawQuery(
      `SELECT *
       FROM public.change_logs
       WHERE project_id = $1
         AND entity_type = 'task'
         AND entity_id = ANY($2::uuid[])
         AND field_name = 'progress'
         AND changed_at >= $3
         AND changed_at < $4
       ORDER BY changed_at ASC`,
      [projectId, normalizedTaskIds, start.toISOString(), end.toISOString()],
    )
    return result.rows as AnyRow[]
  } catch (error) {
    logger.warn('Dashboard direct progress change_logs query failed, falling back to Supabase REST', {
      projectId,
      taskCount: normalizedTaskIds.length,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const rows: AnyRow[] = []
  const batchSize = 200
  for (let index = 0; index < normalizedTaskIds.length; index += batchSize) {
    const batch = normalizedTaskIds.slice(index, index + batchSize)
    const { data, error } = await supabase
      .from('change_logs')
      .select('*')
      .eq('project_id', projectId)
      .eq('entity_type', 'task')
      .eq('field_name', 'progress')
      .in('entity_id', batch)
      .gte('changed_at', start.toISOString())
      .lt('changed_at', end.toISOString())
      .order('changed_at', { ascending: true })

    if (error) {
      throw new Error(`change_logs query failed: ${error.message}`)
    }
    if (Array.isArray(data)) rows.push(...data as AnyRow[])
  }

  return rows
}

// 所有路由都需要认证
router.use(authenticate)
companyDashboardRouter.use(authenticate)

async function loadDashboardProjectSummary(projectId: string) {
  const cacheKey = `${projectId}:dashboard-fast-summary`
  const cached = dashboardProjectSummaryCache.get(cacheKey)
  let summary: ProjectExecutionSummary | null = null

  if (cached && cached.expiresAt > Date.now()) {
    return ensureDashboardProjectSummaryContract(cached.summary)
  }

  try {
    summary = await runWithRequestBudget(
      {
        operation: 'dashboard_project_summary_fast_read',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.fastReadMs,
      },
      () => getDashboardProjectExecutionSummary(projectId),
    )
  } catch (error) {
    if (!cached) throw error
    logger.warn('[dashboard] project summary reused stale cache after refresh failed', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return ensureDashboardProjectSummaryContract(cached.summary)
  }

  if (summary) {
    summary = ensureDashboardProjectSummaryContract(summary)
    dashboardProjectSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_PROJECT_SUMMARY_CACHE_TTL_MS,
      summary,
    })
  }

  return summary
}

async function attachDashboardAttentionSummary(
  summary: ProjectExecutionSummary,
  userId?: string | null,
): Promise<ProjectExecutionSummary> {
  let attentionSummary: Awaited<ReturnType<typeof buildAttentionSummary>> | null = null

  try {
    attentionSummary = await runWithRequestBudget(
      {
        operation: 'dashboard_project_summary_attention',
        timeoutMs: Math.min(DASHBOARD_ATTENTION_SUMMARY_BUDGET_MS, REQUEST_TIMEOUT_BUDGETS.fastReadMs),
      },
      () => buildAttentionSummary(summary.id, null, userId ?? null),
    )
  } catch (error) {
    logger.warn('[dashboard] attention summary skipped for project summary after request budget failure', {
      projectId: summary.id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!attentionSummary) {
    return ensureDashboardProjectSummaryContract(summary)
  }

  return {
    ...ensureDashboardProjectSummaryContract(summary),
    todayTodoCount: attentionSummary.todayTodoCount,
    projectTodayActionCount: attentionSummary.todayTodoCount,
  }
}

export async function warmDashboardProjectSummaryCache(projectId: string) {
  return loadDashboardProjectSummary(projectId)
}

// GET /api/projects/:projectId/dashboard/project-summary
router.get('/project-summary', requireProjectMember(req => req.params.projectId as string | undefined), asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim()

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching unified project execution summary', { projectId })
  const summary = await loadDashboardProjectSummary(projectId)

  if (!summary) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const dashboardSummary = await attachDashboardAttentionSummary(summary, req.user?.id)

  const response: ApiResponse<typeof dashboardSummary> = {
    success: true,
    data: dashboardSummary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/company/dashboard/projects-summary
companyDashboardRouter.get('/projects-summary', asyncHandler(async (req, res) => {
  logger.info('Fetching unified multi-project execution summaries')
  const visibleProjectIds = req.user?.id
    ? await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    : []
  const summaries = await getAllProjectExecutionSummaries({ projectIds: visibleProjectIds })

  const response: ApiResponse<typeof summaries> = {
    success: true,
    data: summaries,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/company/dashboard/company-summary
companyDashboardRouter.get('/company-summary', asyncHandler(async (req, res) => {
  logger.info('Fetching company execution summary')

  const companyId = getRequestCompanyId(req)
  const visibleProjectIds = await getCachedCompanySummaryVisibleProjectIds({
    userId: req.user?.id,
    globalRole: req.user?.globalRole,
    companyId,
  })
  const cacheKey = buildCompanySummaryCacheKey({
    userId: req.user?.id,
    globalRole: req.user?.globalRole,
    companyId,
    projectIds: visibleProjectIds,
  })
  const cached = dashboardCompanySummaryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const response: ApiResponse<CompanySummaryResponse> = {
      success: true,
      data: cached.summary,
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  const scopedProjectIds = await resolveCompanySummaryProjectIds(companyId, visibleProjectIds)
  const [summaries, healthHistoryRows] = await Promise.all([
    getAllProjectExecutionSummaries({ projectIds: scopedProjectIds, mode: 'company_overview' }),
    loadCompanyHealthHistoryRows({ projectIds: scopedProjectIds }),
  ])
  const companySummary = buildCompanySummaryResponse(summaries, healthHistoryRows)
  dashboardCompanySummaryCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_COMPANY_SUMMARY_CACHE_TTL_MS,
    summary: companySummary,
  })

  const response: ApiResponse<CompanySummaryResponse> = {
    success: true,
    data: companySummary,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

async function buildDashboardTodayProgressItems(projectId: string): Promise<TodayProgressItem[]> {
    const { dateKey, start, end } = getTodayRange()
    const previousDate = new Date(start)
    previousDate.setDate(previousDate.getDate() - 1)
    const previousDateKey = previousDate.toISOString().slice(0, 10)
    logger.info('Fetching dashboard today progress items', { projectId, dateKey })

    const tasks = await queryDashboardTaskRows(projectId)

    const leafTasks = getLeafTasks(tasks as AnyRow[])
    const leafTaskById = new Map(
      leafTasks
        .map((task) => [String(task.id ?? ''), task] as const)
        .filter(([taskId]) => taskId.length > 0),
    )
    const leafTaskIds = [...leafTaskById.keys()]
    const snapshots = await queryTaskProgressSnapshots(leafTaskIds)
    const changeLogs = await queryTodayProgressChangeLogs(projectId, leafTaskIds, start, end)
    const snapshotsByTask = new Map<string, AnyRow[]>()
    for (const snapshot of snapshots) {
      const taskId = String(snapshot.task_id ?? '').trim()
      if (!taskId || !leafTaskById.has(taskId)) continue
      const rows = snapshotsByTask.get(taskId) ?? []
      rows.push(snapshot)
      snapshotsByTask.set(taskId, rows)
    }
    for (const rows of snapshotsByTask.values()) {
      rows.sort(compareSnapshotRows)
    }

    const items: TodayProgressItem[] = []
    const generatedItemTaskIds = new Set<string>()
    const changedTaskIds = new Set([
      ...[...snapshotsByTask.entries()]
        .filter(([, rows]) => rows.some((snapshot) => toDateKey(snapshot.snapshot_date) === dateKey))
        .map(([taskId]) => taskId),
    ])

    for (const taskId of changedTaskIds) {
      const task = leafTaskById.get(taskId)
      const taskSnapshots = snapshotsByTask.get(taskId) ?? []
      const todaySnapshots = taskSnapshots.filter((snapshot) => toDateKey(snapshot.snapshot_date) === dateKey)
      const previousSnapshots = taskSnapshots.filter((snapshot) => {
        const snapshotDate = toDateKey(snapshot.snapshot_date)
        return Boolean(snapshotDate) && snapshotDate <= previousDateKey
      })
      const todayLatest = todaySnapshots.at(-1)
      const previousLatest = previousSnapshots.at(-1)
      const previousProgress = normalizeProgressValue(previousLatest?.progress)
      if (previousProgress === null) continue

      const currentProgress =
        normalizeProgressValue(todayLatest?.progress)
        ?? normalizeProgressValue(task?.progress)
        ?? previousProgress
      const delta = currentProgress - previousProgress
      if (delta === 0) continue

      items.push({
        id: `today-progress-${taskId}`,
        taskId,
        title: firstText(task ?? {}, ['title'], '未命名任务'),
        previousProgress,
        currentProgress,
        delta,
        changedAt: String(todayLatest?.created_at ?? new Date().toISOString()),
      })
      generatedItemTaskIds.add(taskId)
    }

    const changeLogsByTask = new Map<string, AnyRow[]>()
    for (const log of changeLogs) {
      const taskId = String(log.entity_id ?? '').trim()
      if (!taskId || !leafTaskById.has(taskId) || generatedItemTaskIds.has(taskId)) continue
      const rows = changeLogsByTask.get(taskId) ?? []
      rows.push(log)
      changeLogsByTask.set(taskId, rows)
    }
    for (const rows of changeLogsByTask.values()) {
      rows.sort((left, right) => new Date(String(left.changed_at ?? 0)).getTime() - new Date(String(right.changed_at ?? 0)).getTime())
    }

    for (const [taskId, logs] of changeLogsByTask.entries()) {
      const firstLog = logs[0]
      const lastLog = logs.at(-1)
      const previousProgress = normalizeProgressValue(firstLog?.old_value)
      const currentProgress =
        normalizeProgressValue(lastLog?.new_value)
        ?? normalizeProgressValue(leafTaskById.get(taskId)?.progress)
      if (previousProgress === null || currentProgress === null) continue
      const delta = currentProgress - previousProgress
      if (delta === 0) continue

      const task = leafTaskById.get(taskId)
      items.push({
        id: `today-progress-${taskId}`,
        taskId,
        title: firstText(task ?? {}, ['title'], '未命名任务'),
        previousProgress,
        currentProgress,
        delta,
        changedAt: String(lastLog?.changed_at ?? new Date().toISOString()),
      })
    }

    items.sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
    return items
}

async function loadDashboardTodayProgressItems(projectId: string) {
  const { dateKey } = getTodayRange()
  const cacheKey = `${projectId}:${dateKey}`
  const cached = dashboardTodayProgressCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items as TodayProgressItem[]
  }

  const items = await buildDashboardTodayProgressItems(projectId)
  dashboardTodayProgressCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_TODAY_PROGRESS_CACHE_TTL_MS,
    items,
  })
  return items
}

export async function warmDashboardTodayProgressCache(projectId: string) {
  return loadDashboardTodayProgressItems(projectId)
}

// GET /api/projects/:projectId/dashboard/today-progress
router.get(
  '/today-progress',
  requireProjectMember(req => req.params.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('Fetching dashboard today progress items', { projectId })
    const items = await loadDashboardTodayProgressItems(projectId)

    const response: ApiResponse<TodayProgressItem[]> = {
      success: true,
      data: items,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

// GET /api/projects/:projectId/dashboard/focus-tasks
router.get(
  '/focus-tasks',
  requireProjectMember(req => req.params.projectId as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const filter = normalizeFocusTaskFilter(req.query.filter)
    const limit = normalizeFocusTaskLimit(req.query.limit)
    logger.info('Fetching dashboard focus tasks', { projectId, filter, limit })

    const [rows, workCalendar] = await Promise.all([
      queryDashboardTaskRows(projectId),
      resolveConstructionCalendarContext({ projectId }),
    ])
    const leafRows = getLeafTasks(rows as any[])
    const todayTodoTaskIds = filter === 'today'
      ? await collectTodayTodoTaskIds(projectId, leafRows as AnyRow[])
      : undefined
    const focusTasks = leafRows
      .filter((task) => String(task.id ?? '').trim())
      .filter((task) => !isCompletedTask(task))
      .map((task) => toFocusTaskItem(task, new Date(), todayTodoTaskIds, workCalendar))
      .sort(compareFocusTasks)

    const filteredTasks = focusTasks.filter((task) => includeFocusTaskByFilter(task, filter))
    const response: ApiResponse<FocusTasksResponse> = {
      success: true,
      data: {
        filter,
        stats: buildFocusTaskStats(focusTasks),
        items: filteredTasks.slice(0, limit),
        totalCount: filteredTasks.length,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
