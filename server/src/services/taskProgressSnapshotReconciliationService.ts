import type { Task } from '../types/db.js'
import {
  getProjects,
  getTasks,
  flushTaskProgressSnapshotProjectSideEffects,
  listTaskProgressSnapshotsByTaskIds,
  recordTaskProgressSnapshot,
} from './dbService.js'

type TaskProgressSnapshotState = {
  id?: string | null
  task_id: string
  progress?: number | null
  status?: string | null
  snapshot_date?: string | null
  created_at?: string | null
}

export type TaskProgressSnapshotDriftReason = 'missing_snapshot' | 'state_mismatch'

export type TaskProgressSnapshotDrift = {
  taskId: string
  reason: TaskProgressSnapshotDriftReason
  taskProgress: number
  snapshotProgress: number | null
  taskStatus: string | null
  snapshotStatus: string | null
  latestSnapshotId: string | null
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function snapshotTimestamp(row: TaskProgressSnapshotState) {
  const timestamp = new Date(String(row.created_at ?? row.snapshot_date ?? '')).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function buildLatestSnapshotMap(rows: TaskProgressSnapshotState[]) {
  const latest = new Map<string, TaskProgressSnapshotState>()
  for (const row of rows) {
    const taskId = String(row.task_id ?? '').trim()
    if (!taskId) continue
    const current = latest.get(taskId)
    if (!current || snapshotTimestamp(row) >= snapshotTimestamp(current)) {
      latest.set(taskId, row)
    }
  }
  return latest
}

async function loadProjectSnapshotDrift(projectId: string) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) throw new Error('TASK_PROGRESS_RECONCILIATION_PROJECT_ID_REQUIRED')

  const tasks = await getTasks(normalizedProjectId, {
    columns: [
      'id',
      'project_id',
      'progress',
      'status',
      'updated_at',
      'baseline_item_id',
      'monthly_plan_item_id',
    ],
  })
  const snapshots = await listTaskProgressSnapshotsByTaskIds(tasks.map((task) => task.id))
  const latestByTaskId = buildLatestSnapshotMap(snapshots as TaskProgressSnapshotState[])
  const drifts: TaskProgressSnapshotDrift[] = []

  for (const task of tasks) {
    const latest = latestByTaskId.get(task.id)
    const taskProgress = Number(task.progress ?? 0)
    const taskStatus = normalizeText(task.status)
    if (!latest) {
      drifts.push({
        taskId: task.id,
        reason: 'missing_snapshot',
        taskProgress,
        snapshotProgress: null,
        taskStatus,
        snapshotStatus: null,
        latestSnapshotId: null,
      })
      continue
    }

    const snapshotProgress = Number(latest.progress ?? 0)
    const snapshotStatus = normalizeText(latest.status)
    if (snapshotProgress !== taskProgress || snapshotStatus !== taskStatus) {
      drifts.push({
        taskId: task.id,
        reason: 'state_mismatch',
        taskProgress,
        snapshotProgress,
        taskStatus,
        snapshotStatus,
        latestSnapshotId: normalizeText(latest.id),
      })
    }
  }

  return { projectId: normalizedProjectId, tasks, drifts }
}

export async function inspectProjectTaskProgressSnapshotDrift(projectId: string) {
  const state = await loadProjectSnapshotDrift(projectId)
  return {
    projectId: state.projectId,
    scanned: state.tasks.length,
    driftCount: state.drifts.length,
    missingCount: state.drifts.filter((drift) => drift.reason === 'missing_snapshot').length,
    mismatchCount: state.drifts.filter((drift) => drift.reason === 'state_mismatch').length,
    drifts: state.drifts,
  }
}

export async function reconcileProjectTaskProgressSnapshots(projectId: string) {
  const state = await loadProjectSnapshotDrift(projectId)
  const taskById = new Map(state.tasks.map((task) => [task.id, task] as const))
  const failures: Array<{ taskId: string; error: string }> = []
  let repaired = 0

  for (const drift of state.drifts) {
    const task = taskById.get(drift.taskId) as Task | undefined
    if (!task) continue
    try {
      await recordTaskProgressSnapshot(task, {
        eventType: 'task_reconciled',
        eventSource: 'system_auto',
        notes: `Task progress snapshot reconciliation: ${drift.reason}`,
        deferProjectSideEffects: true,
      })
      repaired += 1
    } catch (error) {
      failures.push({
        taskId: drift.taskId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (repaired > 0) {
    await flushTaskProgressSnapshotProjectSideEffects(state.projectId, 'task_reconciled')
  }

  return {
    projectId: state.projectId,
    scanned: state.tasks.length,
    driftCount: state.drifts.length,
    repaired,
    failed: failures.length,
    failures,
  }
}

export async function reconcileAllProjectTaskProgressSnapshots(projectIds?: string[] | null) {
  const normalizedExplicitIds = Array.isArray(projectIds)
    ? [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
    : null
  const activeProjectIds = normalizedExplicitIds ?? (await getProjects())
    .filter((project) => !['archived', 'deleted', 'closed', 'inactive'].includes(String(project.status ?? '').trim().toLowerCase()))
    .map((project) => String(project.id ?? '').trim())
    .filter(Boolean)

  let tasksScanned = 0
  let driftCount = 0
  let repaired = 0
  let failed = 0
  const projectFailures: Array<{ projectId: string; error: string }> = []

  for (const projectId of activeProjectIds) {
    try {
      const result = await reconcileProjectTaskProgressSnapshots(projectId)
      tasksScanned += result.scanned
      driftCount += result.driftCount
      repaired += result.repaired
      failed += result.failed
      projectFailures.push(...result.failures.map((failure) => ({
        projectId,
        error: `${failure.taskId}: ${failure.error}`,
      })))
    } catch (error) {
      failed += 1
      projectFailures.push({
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    projectsScanned: activeProjectIds.length,
    tasksScanned,
    driftCount,
    repaired,
    failed,
    projectFailures,
  }
}
