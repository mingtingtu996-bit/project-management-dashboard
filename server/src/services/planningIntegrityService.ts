import { executeSQL, listTaskProgressSnapshotsByTaskIds } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { evaluateMilestoneIntegrityRows } from './milestoneIntegrityService.js'
import { detectPassiveReorderWindows, type PassiveReorderLogRow } from './systemAnomalyService.js'
import { logger } from '../middleware/logger.js'
import type {
  PlanningIntegrityReport,
  PlanningIntegrityInput,
  PlanningIntegrityMappingSummary,
  PlanningIntegrityDataSummary,
  PlanningIntegritySystemSummary,
} from '../types/planning.js'
import type { Milestone, MonthlyPlanItem, Task, TaskBaselineItem, TaskProgressSnapshot } from '../types/db.js'

async function loadChangeLogs(projectId: string): Promise<PassiveReorderLogRow[]> {
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

function toTimestamp(value?: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function evaluatePlanningIntegritySnapshot(input: PlanningIntegrityInput): PlanningIntegrityReport {
  const milestoneIntegrity = evaluateMilestoneIntegrityRows(input.project_id, input.milestones)

  const snapshotCountByTask = new Map<string, number>()
  for (const snapshot of input.snapshots) {
    snapshotCountByTask.set(snapshot.task_id, (snapshotCountByTask.get(snapshot.task_id) ?? 0) + 1)
  }

  const dataIntegrity: PlanningIntegrityDataSummary = {
    total_tasks: input.tasks.length,
    missing_participant_unit_count: input.tasks.filter((task) => {
      const responsible = String(task.responsible_unit ?? '').trim()
      const assignee = String(task.assignee_unit ?? '').trim()
      return !task.participant_unit_id && !responsible && !assignee
    }).length,
    missing_scope_dimension_count: input.tasks.filter((task) => {
      const specialty = String(task.specialty_type ?? '').trim()
      const phase = String(task.phase_id ?? '').trim()
      return !specialty || !phase
    }).length,
    missing_progress_snapshot_count: input.tasks.filter((task) => snapshotCountByTask.get(task.id) === undefined && String(task.status ?? '').toLowerCase() !== 'completed').length,
  }

  const mappingIntegrity: PlanningIntegrityMappingSummary = {
    baseline_pending_count: input.baseline_items.filter((item) => ['pending', 'missing'].includes(String(item.mapping_status ?? ''))).length,
    baseline_merged_count: input.baseline_items.filter((item) => String(item.mapping_status ?? '') === 'merged').length,
    monthly_carryover_count: input.monthly_plan_items.filter((item) => String(item.commitment_status ?? '') === 'carried_over').length,
  }

  const systemConsistency: PlanningIntegritySystemSummary = {
    inconsistent_milestones: milestoneIntegrity.items.filter((item) => item.state !== 'aligned').length,
    stale_snapshot_count: input.snapshots.filter((snapshot) => {
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
  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000))
}

export class PlanningIntegrityService {
  async scanProjectIntegrity(projectId: string): Promise<PlanningIntegrityReport> {
  const [tasks, milestones, baselineItems, monthlyPlanItems, changeLogs] = await Promise.all([
      executeSQL<Task>('SELECT * FROM tasks WHERE project_id = ?', [projectId]),
      executeSQL<Milestone>('SELECT * FROM milestones WHERE project_id = ?', [projectId]),
      executeSQL<TaskBaselineItem>('SELECT * FROM task_baseline_items WHERE project_id = ?', [projectId]),
      executeSQL<MonthlyPlanItem>('SELECT * FROM monthly_plan_items WHERE project_id = ?', [projectId]),
      loadChangeLogs(projectId),
    ])

    const taskIds = tasks.map((task) => task.id)
    const keyTaskIds = tasks.filter((task) => task.is_critical).map((task) => task.id)
    const snapshots = await listTaskProgressSnapshotsByTaskIds(taskIds)

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

  async scanAllProjectIntegrity(): Promise<PlanningIntegrityReport[]> {
    const projectIds = await listActiveProjectIds()
    const reports: PlanningIntegrityReport[] = []
    for (const projectId of projectIds) {
      reports.push(await this.scanProjectIntegrity(projectId))
    }
    return reports
  }
}
