import {
  executeSQL,
  getIssues,
  getProject,
  getRisks,
  getTasks,
  listTaskProgressSnapshotsByTaskIds,
} from './dbService.js'
import { listDelayRequests } from './delayRequests.js'
import { WarningService } from './warningService.js'
import {
  applyWarningAcknowledgments,
  loadAcknowledgedWarningsForUser,
} from './upgradeChainService.js'
import type {
  ChangeLog,
  DelayRequest,
  Issue,
  Project,
  Risk,
  Task,
  TaskCondition,
  TaskObstacle,
  TaskProgressSnapshot,
  Warning,
} from '../types/db.js'

type ConditionRow = TaskCondition & {
  name?: string | null
  is_satisfied?: boolean | number | string | null
}

type ObstacleRow = TaskObstacle & {
  project_id?: string | null
  title?: string | null
  is_resolved?: boolean | number | string | null
  estimated_resolve_date?: string | null
  notes?: string | null
}

export type ProjectBootstrapPayload = {
  project: Project
  tasks: Task[]
  risks: Risk[]
  conditions: TaskCondition[]
  obstacles: TaskObstacle[]
  warnings: Warning[]
  issues: Issue[]
  delayRequests: DelayRequest[]
  changeLogs: ChangeLog[]
  taskProgressSnapshots: TaskProgressSnapshot[]
}

const warningService = new WarningService()

function truthyLike(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function normalizeConditionRecord(record: ConditionRow): TaskCondition {
  const isSatisfied = truthyLike(record.is_satisfied)
  const conditionName = record.condition_name ?? record.name ?? ''

  return {
    ...record,
    condition_name: conditionName,
    description: record.description ?? '',
    is_satisfied: isSatisfied,
    status: isSatisfied ? '已确认' : '未满足',
  }
}

function normalizeObstacleStatus(record: ObstacleRow): TaskObstacle['status'] {
  if (truthyLike(record.is_resolved)) return 'resolved'

  const status = String(record.status ?? '').trim()
  if (status === '已解决' || status === 'resolved' || status === 'closed') return 'resolved'
  if (status === '待处理' || status === 'pending') return 'active'
  return record.status ?? 'active'
}

function normalizeObstacleRecord(record: ObstacleRow): TaskObstacle {
  const title = String(record.title ?? record.description ?? '').trim()

  return {
    ...record,
    description: record.description ?? title,
    expected_resolution_date: record.expected_resolution_date ?? record.estimated_resolve_date ?? undefined,
    resolution_notes: record.resolution_notes ?? record.notes ?? undefined,
    status: normalizeObstacleStatus(record),
    severity_manually_overridden: Boolean(record.severity_manually_overridden),
  }
}

async function listProjectConditions(projectId: string) {
  const rows = await executeSQL<ConditionRow>(
    'SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC',
    [projectId],
  )
  return (rows ?? []).map(normalizeConditionRecord)
}

async function listProjectObstacles(projectId: string) {
  const rows = await executeSQL<ObstacleRow>(
    'SELECT * FROM task_obstacles WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
  return (rows ?? []).map(normalizeObstacleRecord)
}

async function listProjectChangeLogs(projectId: string, limit: number) {
  return await executeSQL<ChangeLog>(
    'SELECT * FROM change_logs WHERE project_id = ? ORDER BY changed_at DESC LIMIT ?',
    [projectId, limit],
  )
}

async function listProjectWarnings(projectId: string, userId: string) {
  await warningService.syncConditionExpiredIssues(projectId)
  await warningService.syncAcceptanceExpiredIssues(projectId)
  await warningService.autoEscalateWarnings(projectId)
  await warningService.autoEscalateRisksToIssues(projectId)
  const warnings = await warningService.syncActiveWarnings(projectId)
  const acknowledgedWarnings = await loadAcknowledgedWarningsForUser(userId, projectId)
  return applyWarningAcknowledgments(warnings, acknowledgedWarnings)
}

export async function getProjectBootstrap(
  projectId: string,
  userId: string,
  options: { changeLogLimit?: number } = {},
): Promise<ProjectBootstrapPayload | null> {
  const project = await getProject(projectId)
  if (!project) return null

  const tasks = await getTasks(projectId)
  const taskIds = tasks.map((task) => task.id).filter(Boolean)
  const changeLogLimit = Math.min(Math.max(options.changeLogLimit ?? 100, 1), 500)

  const [
    risks,
    conditions,
    obstacles,
    warnings,
    issues,
    delayRequests,
    changeLogs,
    taskProgressSnapshots,
  ] = await Promise.all([
    getRisks(projectId),
    listProjectConditions(projectId),
    listProjectObstacles(projectId),
    listProjectWarnings(projectId, userId),
    getIssues(projectId),
    listDelayRequests(undefined, projectId),
    listProjectChangeLogs(projectId, changeLogLimit),
    listTaskProgressSnapshotsByTaskIds(taskIds),
  ])

  return {
    project,
    tasks,
    risks,
    conditions,
    obstacles,
    warnings,
    issues,
    delayRequests,
    changeLogs,
    taskProgressSnapshots,
  }
}
