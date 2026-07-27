import { executeSQL, listTaskProgressSnapshotsByTaskIds } from './dbService.js'
import { query as rawQuery } from '../database.js'
import { hasAnyScopeObjectId } from './engineeringObjectService.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { evaluateMilestoneIntegrityRows } from './milestoneIntegrityService.js'
import { detectPassiveReorderWindows, type PassiveReorderLogRow } from './systemAnomalyService.js'
import { logger } from '../middleware/logger.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import type {
  PlanningIntegrityReport,
  PlanningIntegrityInput,
  PlanningIntegrityMappingSummary,
  PlanningIntegrityDataSummary,
  PlanningIntegritySystemSummary,
} from '../types/planning.js'
import type { Milestone, MonthlyPlanItem, Task, TaskBaselineItem, TaskProgressSnapshot } from '../types/db.js'

async function loadChangeLogs(projectId: string): Promise<PassiveReorderLogRow[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery('SELECT * FROM public.change_logs WHERE project_id = $1', [projectId])
      return result.rows as PassiveReorderLogRow[]
    } catch (error) {
      logger.warn('[planningIntegrityService] direct change log read failed, fallback to dbService', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    return await executeSQL<PassiveReorderLogRow>('SELECT * FROM change_logs WHERE project_id = ?', [projectId])
  } catch (error) {
    logger.warn('[planningIntegrityService] failed to load change logs, fallback to empty set', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

type PlanningProjectTable = 'tasks' | 'milestones' | 'task_baseline_items' | 'monthly_plan_items'

const PLANNING_INTEGRITY_TASK_COLUMNS = `
  id,
  status,
  participant_unit_id,
  engineering_object_id,
  phase_object_id,
  section_object_id,
  building_object_id,
  basement_object_id,
  floor_object_id,
  physical_zone_object_id,
  functional_area_object_id,
  is_executable,
  is_wbs_summary,
  duration_contribution_mode,
  wbs_node_type
`

async function loadProductionProjectTableRows<T>(input: {
  projectId: string
  tableName: PlanningProjectTable
}): Promise<T[] | null> {
  const { projectId, tableName } = input
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await loadProductionProjectTableRowsByName(tableName, projectId)
      return result.rows as T[]
    } catch (error) {
      logger.warn('[planningIntegrityService] direct project table read failed, fallback to dbService', {
        projectId,
        tableName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return null
}

function loadProductionProjectTableRowsByName(tableName: PlanningProjectTable, projectId: string) {
  switch (tableName) {
    case 'tasks':
      return rawQuery(
        `SELECT ${PLANNING_INTEGRITY_TASK_COLUMNS}
           FROM public.tasks
          WHERE project_id = $1`,
        [projectId],
      )
    case 'milestones':
      return rawQuery(
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
    case 'task_baseline_items':
      return rawQuery('SELECT * FROM public.task_baseline_items WHERE project_id = $1', [projectId])
    case 'monthly_plan_items':
      return rawQuery('SELECT * FROM public.monthly_plan_items WHERE project_id = $1', [projectId])
  }
}

async function loadProjectTableRows<T>(projectId: string, tableName: PlanningProjectTable): Promise<T[]> {
  switch (tableName) {
    case 'tasks': {
      const rows = await loadProductionProjectTableRows<T>({
        projectId,
        tableName,
      })
      if (rows) return rows
      return executeSQL<T>(
        `SELECT ${PLANNING_INTEGRITY_TASK_COLUMNS}
           FROM tasks
          WHERE project_id = ?`,
        [projectId],
      )
    }
    case 'milestones': {
      const rows = await loadProductionProjectTableRows<T>({
        projectId,
        tableName,
      })
      if (rows) return rows
      const fallbackRows = await executeSQL<Record<string, unknown> & {
        planned_end_date?: unknown
        end_date?: unknown
        baseline_end?: unknown
        actual_end_date?: unknown
        progress?: unknown
      }>(
        `SELECT id, project_id, title, description,
                planned_end_date, end_date, baseline_end, actual_end_date,
                status, progress, created_at, updated_at, version
           FROM tasks
          WHERE project_id = ? AND is_milestone = TRUE`,
        [projectId],
      )
      return fallbackRows.map((row) => ({
        ...row,
        target_date: row.planned_end_date ?? row.end_date ?? null,
        baseline_date: row.baseline_end ?? null,
        current_plan_date: row.planned_end_date ?? row.end_date ?? null,
        actual_date: row.actual_end_date ?? null,
        completed_at: row.actual_end_date ?? null,
        completion_rate: row.progress ?? null,
      })) as T[]
    }
    case 'task_baseline_items': {
      const rows = await loadProductionProjectTableRows<T>({
        projectId,
        tableName,
      })
      if (rows) return rows
      return executeSQL<T>('SELECT * FROM task_baseline_items WHERE project_id = ?', [projectId])
    }
    case 'monthly_plan_items': {
      const rows = await loadProductionProjectTableRows<T>({
        projectId,
        tableName,
      })
      if (rows) return rows
      return executeSQL<T>('SELECT * FROM monthly_plan_items WHERE project_id = ?', [projectId])
    }
  }
}

async function loadTaskProgressSnapshots(taskIds: string[]): Promise<TaskProgressSnapshot[]> {
  if (taskIds.length === 0) return []
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        `SELECT *
           FROM public.task_progress_snapshots
          WHERE task_id = ANY($1::uuid[])
          ORDER BY snapshot_date ASC, created_at ASC`,
        [taskIds],
      )
      return result.rows as TaskProgressSnapshot[]
    } catch (error) {
      logger.warn('[planningIntegrityService] direct progress snapshot read failed, fallback to dbService', {
        taskCount: taskIds.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return await listTaskProgressSnapshotsByTaskIds(taskIds)
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeLower(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isTruthy(value: unknown): boolean {
  if (value === true || value === 1) return true
  const normalized = normalizeLower(value)
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function isCompletedTaskStatus(value: unknown): boolean {
  const status = normalizeLower(value)
  return ['completed', 'done', 'finished', 'closed', '已完成', '完成'].includes(status)
}

function isNonExecutableTask(task: PlanningIntegrityInput['tasks'][number]): boolean {
  if (task.is_executable === false) return true
  if (isTruthy(task.is_wbs_summary)) return true

  const contributionMode = normalizeLower(task.duration_contribution_mode)
  if (['non_duration_bearing', 'reference_only', 'milestone_only', 'record_only'].includes(contributionMode)) return true

  const wbsNodeType = normalizeLower(task.wbs_node_type)
  return [
    'root',
    'summary',
    'phase',
    'section',
    'subsection',
    'category',
    'group',
    'folder',
    '分期',
    '标段',
    '分部',
    '子分部',
    '专业',
  ].includes(wbsNodeType)
}

function getExecutableTasks(tasks: PlanningIntegrityInput['tasks']): PlanningIntegrityInput['tasks'] {
  return tasks.filter((task) => !isNonExecutableTask(task))
}

function latestSnapshotByTask(snapshots: PlanningIntegrityInput['snapshots']): Map<string, PlanningIntegrityInput['snapshots'][number]> {
  const latest = new Map<string, PlanningIntegrityInput['snapshots'][number]>()
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.task_id)
    const currentTime = toTimestamp(current?.snapshot_date ?? current?.created_at) ?? Number.NEGATIVE_INFINITY
    const nextTime = toTimestamp(snapshot.snapshot_date ?? snapshot.created_at) ?? Number.NEGATIVE_INFINITY
    if (!current || nextTime >= currentTime) latest.set(snapshot.task_id, snapshot)
  }
  return latest
}

function isMonthlyCarryoverMappingIssue(
  item: PlanningIntegrityInput['monthly_plan_items'][number],
  monthlyPlanItemIds: Set<string>,
) {
  if (String(item.commitment_status ?? '') !== 'carried_over') return false

  const carryoverFromItemId = String(item.carryover_from_item_id ?? '').trim()
  if (carryoverFromItemId) {
    return !monthlyPlanItemIds.has(carryoverFromItemId)
  }

  return !item.baseline_item_id && !item.source_task_id
}

export function evaluatePlanningIntegritySnapshot(input: PlanningIntegrityInput): PlanningIntegrityReport {
  const milestoneIntegrity = evaluateMilestoneIntegrityRows(input.project_id, input.milestones)

  const executableTasks = getExecutableTasks(input.tasks)
  const latestSnapshots = latestSnapshotByTask(input.snapshots)
  const monthlyPlanItemIds = new Set(input.monthly_plan_items.map((item) => item.id))

  const dataIntegrity: PlanningIntegrityDataSummary = {
    total_tasks: executableTasks.length,
    missing_participant_unit_count: executableTasks.filter((task) => {
      return !task.participant_unit_id
    }).length,
    missing_scope_dimension_count: executableTasks.filter((task) => {
      return !hasAnyScopeObjectId(task as unknown as Record<string, unknown>)
    }).length,
    missing_progress_snapshot_count: executableTasks.filter((task) => !latestSnapshots.has(task.id) && !isCompletedTaskStatus(task.status)).length,
  }

  const mappingIntegrity: PlanningIntegrityMappingSummary = {
    baseline_pending_count: input.baseline_items.filter((item) => ['pending', 'missing'].includes(String(item.mapping_status ?? ''))).length,
    baseline_merged_count: input.baseline_items.filter((item) => String(item.mapping_status ?? '') === 'merged').length,
    monthly_carryover_count: input.monthly_plan_items.filter((item) => isMonthlyCarryoverMappingIssue(item, monthlyPlanItemIds)).length,
  }

  const systemConsistency: PlanningIntegritySystemSummary = {
    inconsistent_milestones: milestoneIntegrity.items.filter((item) => item.state !== 'aligned').length,
    stale_snapshot_count: executableTasks.filter((task) => {
      const snapshot = latestSnapshots.get(task.id)
      if (!snapshot) return false
      const createdAt = toTimestamp(snapshot.snapshot_date || snapshot.created_at)
      return createdAt !== null && nowAgeDays(createdAt) >= 7
    }).length,
  }

  const passiveReorder = detectPassiveReorderWindows(input.project_id, input.change_logs, new Date(), {
    keyTaskIds: input.key_task_ids ?? [],
  })

  return {
    project_id: input.project_id,
    milestone_integrity: milestoneIntegrity,
    data_integrity: dataIntegrity,
    mapping_integrity: mappingIntegrity,
    system_consistency: systemConsistency,
    passive_reorder: passiveReorder,
  }
}

function nowAgeDays(timestamp: number): number {
  return Math.max(0, signedDurationDayDelta(new Date(timestamp), new Date()) ?? 0)
}

export class PlanningIntegrityService {
  async scanProjectIntegrity(projectId: string): Promise<PlanningIntegrityReport> {
    const tasks = await loadProjectTableRows<Task>(projectId, 'tasks')
    const milestones = await loadProjectTableRows<Milestone>(projectId, 'milestones')
    const baselineItems = await loadProjectTableRows<TaskBaselineItem>(projectId, 'task_baseline_items')
    const monthlyPlanItems = await loadProjectTableRows<MonthlyPlanItem>(projectId, 'monthly_plan_items')
    const changeLogs = await loadChangeLogs(projectId)

    const taskIds = tasks.map((task) => task.id)
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)
    const keyTaskIds = tasks.filter((task) => criticalTaskIds.has(task.id)).map((task) => task.id)
    const snapshots = await loadTaskProgressSnapshots(taskIds)

    return evaluatePlanningIntegritySnapshot({
      project_id: projectId,
      tasks,
      milestones,
      baseline_items: baselineItems,
      monthly_plan_items: monthlyPlanItems,
      snapshots,
      change_logs: changeLogs,
      key_task_ids: keyTaskIds,
    })
  }

  async scanAllProjectIntegrity(projectIds?: string[] | null): Promise<PlanningIntegrityReport[]> {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    const reports: PlanningIntegrityReport[] = []
    for (const projectId of activeProjectIds) {
      reports.push(await this.scanProjectIntegrity(projectId))
    }
    return reports
  }
}
