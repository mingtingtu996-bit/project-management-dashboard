import { writeLog } from './changeLogs.js'
import { executeSQL, supabase } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { evaluateProjectBaselineValidity } from './planningRevisionPoolService.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import type { Milestone, MonthlyPlanItem, Task, TaskBaseline, TaskBaselineItem } from '../types/db.js'
import type { ProjectBaselineValiditySnapshot } from './planningRevisionPoolService.js'

const AUTO_REALIGN_BASELINE_STATUSES = new Set(['pending_realign', 'revising'])

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

type TaskCriticalFlagRow = {
  id: string
  is_critical?: boolean | number | string | null
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

function mapBaselineItemsToMonthlySeedItems(items: TaskBaselineItem[]): MonthlyPlanSeedItem[] {
  return [...items]
    .sort(bySortOrder)
    .map((item, index) => ({
      baseline_item_id: item.id,
      carryover_from_item_id: null,
      source_task_id: item.source_task_id ?? null,
      title: item.title,
      planned_start_date: toDate(item.planned_start_date),
      planned_end_date: toDate(item.planned_end_date),
      target_progress: item.target_progress ?? (item.is_milestone ? 100 : 0),
      current_progress: 0,
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order : index,
      is_milestone: Boolean(item.is_milestone),
      is_critical: Boolean(item.is_critical),
      commitment_status: 'planned',
      notes: item.notes ?? null,
    }))
}

export async function annotateBaselineCriticalItems(
  baseline: Pick<TaskBaseline, 'id' | 'project_id' | 'source_type'>,
  items: TaskBaselineItem[],
): Promise<TaskBaselineItem[]> {
  if (baseline.source_type !== 'current_schedule' || items.length === 0) {
    return items
  }

  const snapshot = await getProjectCriticalPathSnapshot(baseline.project_id)
  const criticalTaskIds = new Set(
    snapshot.displayTaskIds.map((taskId) => String(taskId).trim()).filter(Boolean),
  )
  const timestamp = new Date().toISOString()
  const nextItems: TaskBaselineItem[] = []

  for (const item of items) {
    const nextValue = criticalTaskIds.has(String(item.source_task_id ?? '').trim())
    nextItems.push({
      ...item,
      is_baseline_critical: nextValue,
    })

    if (Boolean(item.is_baseline_critical) === nextValue) continue

    const { error } = await supabase
      .from('task_baseline_items')
      .update({
        is_baseline_critical: nextValue,
        updated_at: timestamp,
      })
      .eq('id', item.id)

    if (error) throw error
  }

  return nextItems
}

function mapTasksToMonthlySeedItems(tasks: Task[], criticalTaskIds: Set<string>): MonthlyPlanSeedItem[] {
  return [...tasks]
    .sort((left, right) => {
      const orderComparison = bySortOrder(left, right)
      if (orderComparison !== 0) return orderComparison
      return String(left.wbs_code ?? left.title ?? '').localeCompare(
        String(right.wbs_code ?? right.title ?? ''),
        'zh-CN',
      )
    })
    .map((task, index) => ({
      baseline_item_id: null,
      carryover_from_item_id: null,
      source_task_id: task.id,
      title: task.title ?? `月度计划条目 ${index + 1}`,
      planned_start_date: toDate(task.planned_start_date),
      planned_end_date: toDate(task.planned_end_date),
      target_progress: toProgress(task.progress),
      current_progress: toProgress(task.progress),
      sort_order: Number(task.sort_order ?? index),
      is_milestone: Boolean(task.is_milestone),
      is_critical: criticalTaskIds.has(task.id),
      commitment_status: task.status === 'completed' || task.progress === 100 ? 'completed' : 'planned',
      notes: task.description ?? null,
    }))
}

async function getLatestBaseline(projectId: string): Promise<TaskBaseline | null> {
  const { data, error } = await supabase
    .from('task_baselines')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  return ((data ?? [])[0] as TaskBaseline | undefined) ?? null
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

async function getProjectMilestones(projectId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw error
  return (data ?? []) as Milestone[]
}

export async function resolveMonthlyPlanGenerationSource(projectId: string): Promise<MonthlyPlanGenerationSource> {
  const latestBaseline = await getLatestBaseline(projectId)

  if (latestBaseline?.status === 'confirmed') {
    const items = await getBaselineItems(latestBaseline.id)
    return {
      mode: 'baseline',
      baselineVersionId: latestBaseline.id,
      sourceVersionId: latestBaseline.id,
      sourceVersionLabel: `基线 v${latestBaseline.version}`,
      items: mapBaselineItemsToMonthlySeedItems(items),
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
    items: mapTasksToMonthlySeedItems(tasks, criticalTaskIds),
    baselineStatus,
    autoSwitched: AUTO_REALIGN_BASELINE_STATUSES.has(String(latestBaseline?.status ?? '').trim()),
  }
}

export async function syncBaselineCriticalFlagsToTasks(
  projectId: string,
  items: TaskBaselineItem[],
  actorUserId?: string | null,
): Promise<number> {
  const criticalByTaskId = new Map<string, boolean>()
  for (const item of [...items].sort(bySortOrder)) {
    const taskId = String(item.source_task_id ?? '').trim()
    if (!taskId) continue
    criticalByTaskId.set(taskId, Boolean(item.is_critical))
  }

  const taskIds = [...criticalByTaskId.keys()]
  if (taskIds.length === 0) return 0

  const { data, error } = await supabase
    .from('tasks')
    .select('id, is_critical')
    .eq('project_id', projectId)
    .in('id', taskIds)

  if (error) throw error

  let updatedCount = 0
  for (const row of (data ?? []) as TaskCriticalFlagRow[]) {
    const nextValue = criticalByTaskId.get(String(row.id))
    if (typeof nextValue !== 'boolean') continue
    if (Boolean(row.is_critical) === nextValue) continue

    const updatedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ is_critical: nextValue, updated_at: updatedAt })
      .eq('id', row.id)
    if (updateError) throw updateError

    await writeLog({
      project_id: projectId,
      entity_type: 'task',
      entity_id: row.id,
      field_name: 'is_critical',
      old_value: Boolean(row.is_critical),
      new_value: nextValue,
      changed_by: actorUserId ?? null,
      change_source: actorUserId ? 'manual_adjusted' : 'system_auto',
    })
    updatedCount += 1
  }

  return updatedCount
}

export async function scanProjectBaselineValidity(projectId: string): Promise<BaselineValidityScanResult> {
  const latestBaseline = await getLatestBaseline(projectId)
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

  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('task_baselines')
    .update({ status: 'pending_realign', updated_at: updatedAt })
    .eq('id', latestBaseline.id)
  if (error) throw error

  await writeLog({
    project_id: projectId,
    entity_type: 'baseline',
    entity_id: latestBaseline.id,
    field_name: 'status',
    old_value: latestBaseline.status,
    new_value: 'pending_realign',
    changed_by: null,
    change_source: 'system_auto',
  })

  return {
    projectId,
    baselineId: latestBaseline.id,
    baselineStatus: 'pending_realign',
    action: 'queued_realign',
    validity,
  }
}

export async function scanAllProjectBaselineValidity(): Promise<BaselineValidityScanResult[]> {
  const projectIds = await listActiveProjectIds()
  const reports: BaselineValidityScanResult[] = []

  for (const projectId of projectIds) {
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
