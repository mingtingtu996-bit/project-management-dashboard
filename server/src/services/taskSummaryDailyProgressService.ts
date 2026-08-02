import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { getTaskSummaryProjectMemberNameMap } from './projectExecutionSummaryService.js'
import {
  buildDailyTaskProgressSummary,
  type TaskSummaryCompareTask,
  type TaskSummaryProgressSnapshot,
} from './taskSummaryCompareService.js'

export interface DailyTaskProgressReadModelInput {
  projectId: string
  targetDate: string
  previousDate: string
  dayStartInclusive: string
  dayEndExclusive: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function loadParticipantUnitNameMap(projectId: string, unitIds: string[]) {
  const uniqueIds = [...new Set(unitIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Map<string, string>()

  const { data, error } = await supabase
    .from('participant_units')
    .select('id, unit_name')
    .eq('project_id', projectId)
    .in('id', uniqueIds)

  if (error) throw new Error(`[participant-units] query failed: ${error.message}`)
  return new Map((data || []).map((row: any) => [String(row.id), normalizeText(row.unit_name)]))
}

export async function getDailyTaskProgressReadModel(input: DailyTaskProgressReadModelInput) {
  const { data: projectTaskRows, error: projectTaskError } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', input.projectId)
  if (projectTaskError) throw new Error(`[daily-progress] task id query failed: ${projectTaskError.message}`)

  const projectTaskIds = (projectTaskRows || []).map((row: any) => String(row.id))
  const snapshotResult = projectTaskIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from('task_progress_snapshots')
        .select(`
          task_id,
          progress,
          snapshot_date,
          conditions_met_count,
          conditions_total_count,
          obstacles_active_count,
          created_at
        `)
        .in('task_id', projectTaskIds)
        .gte('snapshot_date', input.previousDate)
        .lte('snapshot_date', input.targetDate)
        .order('snapshot_date', { ascending: true })
        .order('created_at', { ascending: true })

  const { data: snapshots, error: snapshotError } = snapshotResult
  if (snapshotError) {
    logger.warn('task_progress_snapshots query failed; daily progress will return insufficient_data', {
      error: snapshotError.message,
    })
  }

  const snapshotByDateAndTask = new Map<string, Map<string, TaskSummaryProgressSnapshot>>()
  for (const source of snapshots || []) {
    const snapshot = source as TaskSummaryProgressSnapshot & { snapshot_date: string }
    const snapshotDate = String(snapshot.snapshot_date)
    const snapshotsByTask = snapshotByDateAndTask.get(snapshotDate) ?? new Map<string, TaskSummaryProgressSnapshot>()
    snapshotsByTask.set(String(snapshot.task_id), snapshot)
    snapshotByDateAndTask.set(snapshotDate, snapshotsByTask)
  }

  const { data: updatedTaskRows, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, assignee_user_id, participant_unit_id, status, progress, end_date, updated_at')
    .eq('project_id', input.projectId)
    .gte('updated_at', input.dayStartInclusive)
    .lt('updated_at', input.dayEndExclusive)
  if (taskError) throw new Error(`[daily-progress] task query failed: ${taskError.message}`)
  const updatedTasks = (updatedTaskRows || []) as TaskSummaryCompareTask[]

  const { data: projectDailySnapshot, error: projectDailySnapshotError } = await supabase
    .from('project_daily_snapshot')
    .select('active_delayed_tasks')
    .eq('project_id', input.projectId)
    .eq('snapshot_date', input.targetDate)
    .maybeSingle()
  if (projectDailySnapshotError) {
    logger.warn('project_daily_snapshot query failed for daily progress', {
      projectId: input.projectId,
      targetDate: input.targetDate,
      error: projectDailySnapshotError.message,
    })
  }
  const delayedTaskCount = Number.isFinite(Number(projectDailySnapshot?.active_delayed_tasks))
    ? Number(projectDailySnapshot?.active_delayed_tasks)
    : null

  const [participantUnitNameMap, projectMemberNameMap] = await Promise.all([
    loadParticipantUnitNameMap(
      input.projectId,
      updatedTasks.map((task) => normalizeText(task.participant_unit_id)).filter(Boolean),
    ),
    getTaskSummaryProjectMemberNameMap(
      input.projectId,
      updatedTasks.map((task) => normalizeText(task.assignee_user_id)).filter(Boolean),
    ),
  ])

  return buildDailyTaskProgressSummary({
    targetDate: input.targetDate,
    previousDate: input.previousDate,
    tasks: updatedTasks,
    todaySnapshots: snapshotByDateAndTask.get(input.targetDate) ?? new Map(),
    previousSnapshots: snapshotByDateAndTask.get(input.previousDate) ?? new Map(),
    delayedTaskCount,
    resolveResponsibleLabel: (task) => {
      const assigneeUserId = normalizeText(task.assignee_user_id)
      if (assigneeUserId && projectMemberNameMap.has(assigneeUserId)) {
        return projectMemberNameMap.get(assigneeUserId) || '\u8d23\u4efb\u4eba\u5f85\u786e\u8ba4'
      }
      const participantUnitId = normalizeText(task.participant_unit_id)
      if (participantUnitId) {
        return participantUnitNameMap.get(participantUnitId) || '\u8d23\u4efb\u5355\u4f4d\u5f85\u786e\u8ba4'
      }
      return '\u672a\u5173\u8054\u8d23\u4efb\u4eba'
    },
  })
}
