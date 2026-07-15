import {
  executeSQL,
  getIssues,
  getProject,
  getRisks,
  getTasks,
  listTaskProgressSnapshotsByTaskIds,
} from './dbService.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { WarningService } from './warningService.js'
import {
  applyWarningAcknowledgments,
  loadAcknowledgedWarningsForUser,
} from './upgradeChainService.js'
import type {
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
  taskProgressSnapshots: TaskProgressSnapshot[]
}

const warningService = new WarningService()
const BOOTSTRAP_CACHE_TTL_MS = Number(process.env.PROJECT_BOOTSTRAP_CACHE_TTL_MS ?? 15_000)
const bootstrapCache = new Map<string, { expiresAt: number; payload: ProjectBootstrapPayload | null }>()
const PROJECT_BOOTSTRAP_OBSTACLE_COLUMNS = [
  'id',
  'task_id',
  'project_id',
  'description',
  'obstacle_type',
  'severity',
  'status',
  'resolution',
  'resolved_at',
  'resolved_by',
  'estimated_resolve_date',
  'notes',
  'is_resolved',
  'severity_escalated_at',
  'severity_manually_overridden',
  'created_at',
  'updated_at',
].join(', ')

function bootstrapCacheKey(projectId: string, userId: string) {
  return `${projectId}:${userId}`
}

export function clearProjectBootstrapCache(projectId?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    bootstrapCache.clear()
    return
  }

  const projectCachePrefix = `${normalizedProjectId}:`
  for (const cacheKey of Array.from(bootstrapCache.keys())) {
    if (cacheKey.startsWith(projectCachePrefix)) {
      bootstrapCache.delete(cacheKey)
    }
  }
}

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
  const rows = process.env.NODE_ENV === 'test'
    ? await executeSQL<ConditionRow>(
      'SELECT * FROM task_conditions WHERE project_id = ? ORDER BY created_at ASC',
      [projectId],
    )
    : (await rawQuery(
      'SELECT * FROM public.task_conditions WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId],
    )).rows as ConditionRow[]
  return (rows ?? []).map(normalizeConditionRecord)
}

async function listProjectObstacles(projectId: string) {
  try {
    const rows = process.env.NODE_ENV === 'test'
      ? await executeSQL<ObstacleRow>(
        `SELECT ${PROJECT_BOOTSTRAP_OBSTACLE_COLUMNS} FROM task_obstacles WHERE project_id = ? ORDER BY created_at DESC`,
        [projectId],
      )
      : (await rawQuery(
        `SELECT ${PROJECT_BOOTSTRAP_OBSTACLE_COLUMNS} FROM public.task_obstacles WHERE project_id = $1 ORDER BY created_at DESC`,
        [projectId],
      )).rows as ObstacleRow[]
    return (rows ?? []).map(normalizeObstacleRecord)
  } catch (error) {
    logger.warn('[projectBootstrap] obstacle read skipped', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function listProjectTaskProgressSnapshots(taskIds: string[]) {
  const normalizedTaskIds = [...new Set(
    taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean),
  )]
  if (normalizedTaskIds.length === 0) return []

  if (process.env.NODE_ENV === 'test') {
    return listTaskProgressSnapshotsByTaskIds(normalizedTaskIds)
  }

  try {
    const result = await rawQuery(
      'SELECT * FROM public.task_progress_snapshots WHERE task_id = ANY($1::uuid[])',
      [normalizedTaskIds],
    )
    return result.rows as TaskProgressSnapshot[]
  } catch (error) {
    logger.warn('[projectBootstrap] direct progress snapshot read failed, falling back to dbService', {
      projectIdCount: normalizedTaskIds.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return listTaskProgressSnapshotsByTaskIds(normalizedTaskIds)
  }
}

async function listProjectWarnings(projectId: string, userId: string) {
  try {
    const [warnings, acknowledgedWarnings] = await Promise.all([
      warningService.readActiveWarnings(projectId),
      loadAcknowledgedWarningsForUser(userId, projectId),
    ])
    return applyWarningAcknowledgments(warnings, acknowledgedWarnings)
  } catch (error) {
    logger.warn('[projectBootstrap] active warning read skipped', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function listProjectRisks(projectId: string) {
  try {
    const result = await rawQuery('SELECT * FROM public.risks WHERE project_id = $1 ORDER BY created_at DESC', [projectId])
    return (result.rows as Risk[]).map((risk: any) => ({
      ...risk,
      risk_category: risk.risk_category ?? risk.category,
    })) as Risk[]
  } catch (error) {
    logger.warn('[projectBootstrap] direct risks read failed, falling back to dbService', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return getRisks(projectId)
  }
}

async function listProjectIssues(projectId: string) {
  try {
    const result = await rawQuery('SELECT * FROM public.issues WHERE project_id = $1 ORDER BY created_at DESC', [projectId])
    return result.rows as Issue[]
  } catch (error) {
    logger.warn('[projectBootstrap] direct issues read failed, falling back to dbService', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return getIssues(projectId)
  }
}

export async function getProjectBootstrap(
  projectId: string,
  userId: string,
  options: { changeLogLimit?: number } = {},
): Promise<ProjectBootstrapPayload | null> {
  const cacheKey = bootstrapCacheKey(projectId, userId)
  const cached = bootstrapCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload
  }

  const project = await getProject(projectId)
  if (!project) return null

  const tasks = await getTasks(projectId)
  const taskIds = tasks.map((task) => task.id).filter(Boolean)
  void options

  const [
    risks,
    conditions,
    obstacles,
    warnings,
    issues,
    taskProgressSnapshots,
  ] = await Promise.all([
    listProjectRisks(projectId),
    listProjectConditions(projectId),
    listProjectObstacles(projectId),
    listProjectWarnings(projectId, userId),
    listProjectIssues(projectId),
    listProjectTaskProgressSnapshots(taskIds),
  ])

  const payload = {
    project,
    tasks,
    risks,
    conditions,
    obstacles,
    warnings,
    issues,
    taskProgressSnapshots,
  }
  bootstrapCache.set(cacheKey, {
    expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
    payload,
  })
  return payload
}
