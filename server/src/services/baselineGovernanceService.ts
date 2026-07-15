import { writeLog } from './changeLogs.js'
import { executeSQL, supabase } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { evaluateProjectBaselineValidity } from './planningRevisionPoolService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { deriveMonthlyTargetProgress } from './monthlyPlanGenerationService.js'
import type { Milestone, MonthlyPlanItem, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'
import type { ProjectBaselineValiditySnapshot } from './planningRevisionPoolService.js'

const AUTO_REALIGN_BASELINE_STATUSES = new Set(['pending_realign'])
const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export interface MonthlyPlanSeedItem extends Omit<MonthlyPlanItem, 'id' | 'project_id' | 'monthly_plan_version_id' | 'created_at' | 'updated_at'> {}

export interface MonthlyPlanGenerationSource {
  mode: 'baseline' | 'schedule'
  baselineVersionId: string | null
  sourceVersionId: string | null
  sourceVersionLabel: string
  items: MonthlyPlanSeedItem[]
  baselineStatus: string | null
  autoSwitched: boolean
}

export interface BaselineValidityScanResult {
  projectId: string
  baselineId: string | null
  baselineStatus: string | null
  action: 'none' | 'queued_realign'
  validity: ProjectBaselineValiditySnapshot | null
}

type MonthWindow = {
  start: Date
  end: Date
  year: number
  month: number
}

function toDate(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toProgress(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
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

function parsePlanDate(value?: string | null) {
  const normalized = toDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized.slice(0, 10)}T00:00:00.000Z`)
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

async function mapBaselineItemsToMonthlySeedItems(projectId: string, items: TaskBaselineItem[], monthWindow: MonthWindow | null = null): Promise<MonthlyPlanSeedItem[]> {
  return await Promise.all([...items]
    .sort(bySortOrder)
    .filter((item) => overlapsMonth(toDate(item.planned_start_date), toDate(item.planned_end_date), monthWindow))
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
      commitment_status: 'planned',
      notes: item.notes ?? null,
    })))
}

export async function annotateBaselineCriticalItems(
  baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'source_type'>,
  items: TaskBaselineItem[],
  client?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }> },
): Promise<TaskBaselineItem[]> {
  if (baseline.source_type !== 'current_schedule' || items.length === 0) {
    return items
  }

  const criticalTaskIds = await getCriticalPathTaskIds(baseline.project_id)
  const timestamp = new Date().toISOString()
  const nextItems: TaskBaselineItem[] = []

  const changedItems: Array<{ id: string; isBaselineCritical: boolean }> = []
  for (const item of items) {
    const nextValue = criticalTaskIds.has(String(item.source_task_id ?? '').trim())
    nextItems.push({
      ...item,
      is_baseline_critical: nextValue,
    })

    if (Boolean(item.is_baseline_critical) !== nextValue) {
      changedItems.push({ id: item.id, isBaselineCritical: nextValue })
    }
  }

  if (changedItems.length > 0) {
    const execute = client?.query.bind(client) ?? rawQuery
    const result = await execute(
      `WITH critical_updates AS (
         SELECT *
           FROM unnest($3::text[], $4::boolean[])
             AS update_row(id, is_baseline_critical)
       )
       UPDATE public.task_baseline_items AS item
          SET is_baseline_critical = update_row.is_baseline_critical,
              updated_at = $5
         FROM critical_updates AS update_row
        WHERE item.baseline_version_id = $1
          AND item.project_id = $2
          AND item.id::text = update_row.id
       RETURNING item.id`,
      [
        baseline.id,
        baseline.project_id,
        changedItems.map((item) => item.id),
        changedItems.map((item) => item.isBaselineCritical),
        timestamp,
      ],
    )
    if (Number(result.rowCount ?? result.rows.length) !== changedItems.length) {
      throw new Error('baseline critical annotation scope changed during confirmation')
    }
  }

  return nextItems
}

async function mapTasksToMonthlySeedItems(projectId: string, tasks: Task[], criticalTaskIds: Set<string>, monthWindow: MonthWindow | null = null): Promise<MonthlyPlanSeedItem[]> {
  return await Promise.all([...tasks]
    .sort((left, right) => {
      const orderComparison = bySortOrder(left, right)
      if (orderComparison !== 0) return orderComparison
      return String(left.wbs_code ?? left.title ?? '').localeCompare(
        String(right.wbs_code ?? right.title ?? ''),
        'zh-CN',
      )
    })
    .filter((task) => {
      if (!monthWindow) return true
      const status = String(task.status ?? '').trim()
      if (['cancelled', 'closed', 'deleted', '已取消', '已关闭'].includes(status)) return false
      if (overlapsMonth(toDate(task.planned_start_date ?? task.start_date), toDate(task.planned_end_date ?? task.end_date), monthWindow)) return true
      return Boolean(task.actual_start_date && !task.actual_end_date && toProgress(task.progress) < 100)
    })
    .map(async (task, index) => ({
      baseline_item_id: null,
      carryover_from_item_id: null,
      source_task_id: task.id,
      title: task.title ?? `月度计划条目 ${index + 1}`,
      planned_start_date: toDate(task.planned_start_date),
      planned_end_date: toDate(task.planned_end_date),
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
      commitment_status: task.status === 'completed' || task.progress === 100 ? 'completed' : 'planned',
      notes: task.description ?? null,
    })))
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

export async function getCurrentExecutionBaseline(projectId: string): Promise<TaskBaseline | null> {
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

export async function getBaselineItems(baselineId: string): Promise<TaskBaselineItem[]> {
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

async function getProjectMilestones(projectId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, planned_end_date, end_date, baseline_end, actual_end_date, status, progress, created_at, updated_at, version')
    .eq('project_id', projectId)
    .eq('is_milestone', true)
    .neq('status', 'cancelled')

  if (error) throw error
  return ((data ?? []) as any[]).map((row: any) => ({
    id: row.id,
    project_id: projectId,
    title: row.title,
    target_date: row.planned_end_date ?? row.end_date ?? '',
    baseline_date: row.baseline_end ?? null,
    current_plan_date: row.planned_end_date ?? row.end_date ?? null,
    actual_date: row.actual_end_date ?? null,
    completed_at: row.actual_end_date ?? null,
    status: row.status ?? 'pending',
    completion_rate: Number(row.progress ?? 0),
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? row.created_at ?? '',
    version: Number(row.version ?? 1),
  })) as Milestone[]
}

export async function resolveMonthlyPlanGenerationSource(projectId: string, month?: string | null): Promise<MonthlyPlanGenerationSource> {
  const monthWindow = getMonthWindow(month)
  const latestBaseline = await getCurrentExecutionBaseline(projectId)

  if (latestBaseline?.status === 'confirmed') {
    const items = await getBaselineItems(latestBaseline.id)
    return {
      mode: 'baseline',
      baselineVersionId: latestBaseline.id,
      sourceVersionId: latestBaseline.id,
      sourceVersionLabel: `基线 v${latestBaseline.version}`,
      items: await mapBaselineItemsToMonthlySeedItems(projectId, items, monthWindow),
      baselineStatus: latestBaseline.status,
      autoSwitched: false,
    }
  }

  const [tasks, criticalTaskIds] = await Promise.all([
    getProjectTasks(projectId),
    getCriticalPathTaskIds(projectId),
  ])
  const baselineStatus = String(latestBaseline?.status ?? '').trim() || null
  return {
    mode: 'schedule',
    baselineVersionId: null,
    sourceVersionId: null,
    sourceVersionLabel: AUTO_REALIGN_BASELINE_STATUSES.has(String(latestBaseline?.status ?? '').trim())
      ? '当前任务列表（基线待重整，已自动切换）'
      : '当前任务列表',
    items: await mapTasksToMonthlySeedItems(projectId, tasks, criticalTaskIds, monthWindow),
    baselineStatus,
    autoSwitched: AUTO_REALIGN_BASELINE_STATUSES.has(String(latestBaseline?.status ?? '').trim()),
  }
}

export async function syncBaselineCriticalFlagsToTasks(
  projectId: string,
  items: TaskBaselineItem[],
  actorUserId?: string | null,
): Promise<number> {
  void projectId
  void items
  void actorUserId
  // v1.4.7 plan truth boundary: baseline critical flags are commitment snapshots.
  // Current task criticality is derived by the critical path service, not copied back from a published baseline.
  return 0
}

export async function markBaselinePendingRealign(params: {
  baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'status'>
  reason: string
  sourceReference?: string | null
}): Promise<{ changed: boolean; status: 'pending_realign' }> {
  if (params.baseline.status === 'pending_realign') {
    return { changed: false, status: 'pending_realign' }
  }
  if (params.baseline.status !== 'confirmed') {
    throw new Error(`baseline_pending_realign_requires_confirmed_status:${params.baseline.id}`)
  }

  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('task_baselines')
    .update({ status: 'pending_realign', updated_at: updatedAt })
    .eq('id', params.baseline.id)
    .eq('project_id', params.baseline.project_id)
    .eq('status', 'confirmed')
    .select('id')
  if (error) throw error

  const changed = Array.isArray(data) && data.length > 0
  if (changed) {
    await writeLog({
      project_id: params.baseline.project_id,
      entity_type: 'baseline',
      entity_id: params.baseline.id,
      field_name: 'status',
      old_value: 'confirmed',
      new_value: 'pending_realign',
      changed_by: null,
      change_source: 'system_auto',
    })
  }

  void params.reason
  void params.sourceReference
  return { changed, status: 'pending_realign' }
}

export async function scanProjectBaselineValidity(projectId: string): Promise<BaselineValidityScanResult> {
  const latestBaseline = await getCurrentExecutionBaseline(projectId)
  if (!latestBaseline || !['confirmed', 'pending_realign'].includes(String(latestBaseline.status ?? ''))) {
    return {
      projectId,
      baselineId: latestBaseline?.id ?? null,
      baselineStatus: latestBaseline?.status ?? null,
      action: 'none',
      validity: null,
    }
  }

  const [items, tasks, milestones] = await Promise.all([
    getBaselineItems(latestBaseline.id),
    getProjectTasks(projectId),
    getProjectMilestones(projectId),
  ])

  const validity = evaluateProjectBaselineValidity({
    baselineItems: items,
    tasks: tasks.map((task) => ({
      id: task.id,
      planned_start_date: task.planned_start_date ?? null,
      planned_end_date: task.planned_end_date ?? null,
      start_date: task.start_date ?? null,
      end_date: task.end_date ?? null,
    })),
    milestones: milestones.map((milestone) => ({
      id: milestone.id,
      baseline_date: milestone.baseline_date ?? null,
      current_plan_date: milestone.current_plan_date ?? null,
    })),
  })

  if (validity.state !== 'needs_realign' || latestBaseline.status === 'pending_realign') {
    return {
      projectId,
      baselineId: latestBaseline.id,
      baselineStatus: latestBaseline.status ?? null,
      action: 'none',
      validity,
    }
  }

  await markBaselinePendingRealign({
    baseline: latestBaseline,
    reason: 'baseline_validity_scan_requires_realign',
    sourceReference: 'baselineGovernanceService.scanProjectBaselineValidity',
  })

  return {
    projectId,
    baselineId: latestBaseline.id,
    baselineStatus: 'pending_realign',
    action: 'queued_realign',
    validity,
  }
}

export async function scanAllProjectBaselineValidity(projectIds?: string[] | null): Promise<BaselineValidityScanResult[]> {
  const activeProjectIds = await listActiveProjectIds(projectIds)
  const reports: BaselineValidityScanResult[] = []

  for (const projectId of activeProjectIds) {
    reports.push(await scanProjectBaselineValidity(projectId))
  }

  return reports
}

export async function hasMonthlyPlanVersion(versionId: string | null | undefined): Promise<boolean> {
  const normalized = String(versionId ?? '').trim()
  if (!normalized) return false

  const row = await executeSQL<{ id: string }>(
    'SELECT id FROM monthly_plans WHERE id = ? LIMIT 1',
    [normalized],
  )
  return row.length > 0
}
