import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import {
  getAllProjectExecutionSummaries,
  getProjectExecutionSummary,
} from './projectExecutionSummaryService.js'
import type { ProjectExecutionSummary } from './projectExecutionSummaryService.js'

export type ProjectDailySnapshotInsert = {
  project_id: string
  snapshot_date: string
  health_score: number | null
  health_status: ProjectExecutionSummary['healthStatus'] | null
  overall_progress: number | null
  task_progress: number | null
  delay_days: number | null
  delay_count: number | null
  active_risk_count: number | null
  pending_condition_count: number | null
  active_obstacle_count: number | null
  active_delay_requests: number | null
  monthly_close_status: string | null
  attention_required: boolean | null
  highest_warning_level: string | null
  shifted_milestone_count: number | null
  critical_path_affected_tasks: number | null
}

export type ProjectDailySnapshotWriteResult = {
  recorded: number
  failed: number
  snapshotDate: string
}

function toSnapshotDate(date = new Date()): string {
  return date.toISOString().split('T')[0]
}

function toNullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildSnapshotRow(
  summary: ProjectExecutionSummary,
  snapshotDate: string,
): ProjectDailySnapshotInsert {
  return {
    project_id: summary.id,
    snapshot_date: snapshotDate,
    health_score: toNullableNumber(summary.healthScore),
    health_status: summary.healthStatus ?? null,
    overall_progress: toNullableNumber(summary.overallProgress),
    task_progress: toNullableNumber(summary.taskProgress),
    delay_days: toNullableNumber(summary.delayDays),
    delay_count: toNullableNumber(summary.delayCount),
    active_risk_count: toNullableNumber(summary.activeRiskCount),
    pending_condition_count: toNullableNumber(summary.pendingConditionCount),
    active_obstacle_count: toNullableNumber(summary.activeObstacleCount),
    active_delay_requests: toNullableNumber(summary.activeDelayRequests),
    monthly_close_status: summary.monthlyCloseStatus ?? null,
    attention_required: summary.attentionRequired,
    highest_warning_level: summary.highestWarningLevel ?? null,
    shifted_milestone_count: toNullableNumber(summary.shiftedMilestoneCount),
    critical_path_affected_tasks: toNullableNumber(summary.criticalPathAffectedTasks),
  }
}

async function upsertSnapshotRow(row: ProjectDailySnapshotInsert): Promise<void> {
  const { error } = await supabase
    .from('project_daily_snapshot')
    .upsert(row, { onConflict: 'project_id,snapshot_date' })

  if (error) {
    throw new Error(`写入 project_daily_snapshot 失败: ${error.message}`)
  }
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
): Promise<ProjectDailySnapshotWriteResult> {
  const summaries = await getAllProjectExecutionSummaries()
  const rows = summaries.map((summary) => buildSnapshotRow(summary, snapshotDate))

  if (rows.length === 0) {
    return { recorded: 0, failed: 0, snapshotDate }
  }

  return await upsertProjectDailySnapshots(rows)
}

export async function recordProjectDailySnapshot(
  projectId: string,
  snapshotDate = toSnapshotDate(),
): Promise<ProjectDailySnapshotWriteResult> {
  const summary = await getProjectExecutionSummary(projectId)
  if (!summary) {
    return { recorded: 0, failed: 0, snapshotDate }
  }

  return await upsertProjectDailySnapshots([buildSnapshotRow(summary, snapshotDate)])
}
