import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { logger } from '../middleware/logger.js'
import { executeSQL } from './dbService.js'
import { insertNotification, listNotifications, updateNotificationById } from './notificationStore.js'
import type { CriticalPathOverride, CriticalPathOverrideInput, Notification } from '../types/db.js'

const DAY_MS = 24 * 60 * 60 * 1000

export type CriticalSource = 'auto' | 'manual_attention' | 'manual_insert' | 'hybrid'

export interface CriticalPathEdge {
  id: string
  fromTaskId: string
  toTaskId: string
  source: 'dependency' | 'manual_link'
  isPrimary: boolean
}

export interface CriticalTaskSnapshot {
  taskId: string
  title: string
  floatDays: number
  durationDays: number
  isAutoCritical: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  chainIndex?: number
}

export interface CriticalChainSnapshot {
  id: string
  source: CriticalSource
  taskIds: string[]
  totalDurationDays: number
  displayLabel: string
}

export interface CriticalPathSnapshot {
  projectId: string
  autoTaskIds: string[]
  manualAttentionTaskIds: string[]
  manualInsertedTaskIds: string[]
  primaryChain: CriticalChainSnapshot | null
  alternateChains: CriticalChainSnapshot[]
  displayTaskIds: string[]
  edges: CriticalPathEdge[]
  tasks: CriticalTaskSnapshot[]
  projectDurationDays: number
  hasCycleDetected?: boolean
  cycleTaskIds?: string[]
}

export type CriticalPathOverrideRow = CriticalPathOverride

export interface ProjectCriticalPathResult {
  projectId: string
  taskCount: number
  eligibleTaskCount: number
  criticalTaskIds: string[]
  projectDuration: number
  snapshot: CriticalPathSnapshot
}

interface CriticalPathTaskRow {
  id: string
  project_id: string
  title?: string | null
  name?: string | null
  start_date?: string | null
  end_date?: string | null
  planned_end_date?: string | null
  dependencies?: string[] | string | null
  is_critical?: boolean | null
  is_milestone?: boolean | null
  milestone_level?: number | null
  wbs_level?: number | null
  created_at?: string | null
}

interface TaskNode {
  id: string
  name: string
  duration: number
  startDate?: Date
  endDate?: Date
  dependencies: string[]
}

interface CPMResult {
  criticalPath: string[]
  projectDuration: number
  earliestStart: Map<string, number>
  earliestFinish: Map<string, number>
  latestStart: Map<string, number>
  latestFinish: Map<string, number>
  float: Map<string, number>
  orderedTaskIds: string[]
  taskMap: Map<string, TaskNode>
}

type ProjectOwnerRow = {
  id: string
  owner_id?: string | null
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

async function getProjectRecipients(projectId: string) {
  const [project, members] = await Promise.all([
    executeSQL<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ?', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
      .map((member) => member.user_id),
  ])
}

async function syncCriticalPathFailureNotification(projectId: string, failureMessage: string | null) {
  const existingRows = await listNotifications({
    projectId,
    sourceEntityType: 'critical_path_calculation',
  })
  const activeExisting = existingRows.filter((row) => String(row.status ?? '').trim().toLowerCase() !== 'resolved')

  if (!failureMessage) {
    await Promise.all(
      activeExisting.map((row) => updateNotificationById(row.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        is_read: true,
      })),
    )
    return null
  }

  const recipients = await getProjectRecipients(projectId)
  if (recipients.length === 0) return null

  const current = activeExisting[0]
  const payload: Notification = {
    id: current?.id ?? uuidv4(),
    project_id: projectId,
    type: 'critical_path_calculation_failed',
    notification_type: 'system-exception',
    severity: 'warning',
    level: 'warning',
    title: '关键路径计算失败，已回退到兜底排序',
    content: `关键路径计算未能完成，系统已切换到兜底排序。原因：${failureMessage}`,
    is_read: current?.is_read ?? false,
    is_broadcast: false,
    source_entity_type: 'critical_path_calculation',
    source_entity_id: projectId,
    category: 'planning_governance',
    recipients,
    status: current?.status ?? 'unread',
    metadata: {
      reason: failureMessage,
      fallback: 'deterministic_ordering',
    },
    created_at: current?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (current) {
    await updateNotificationById(current.id, {
      title: payload.title,
      content: payload.content,
      severity: payload.severity,
      level: payload.level,
      status: 'unread',
      is_read: false,
      metadata: payload.metadata,
      recipients,
      resolved_at: null,
      updated_at: payload.updated_at,
    })
    return { ...current, ...payload, status: 'unread', is_read: false, resolved_at: null } as Notification
  }

  return await insertNotification(payload)
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseDependencies(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    }
  } catch {
    return []
  }

  return []
}

function topologicalSort(tasks: TaskNode[], taskMap: Map<string, TaskNode>): string[] {
  const result: string[] = []
  const visited = new Set<string>()
  const temp = new Set<string>()

  function visit(taskId: string) {
    if (temp.has(taskId)) {
      throw new Error(`CRITICAL_PATH_CYCLE_DETECTED:${taskId}`)
    }
    if (visited.has(taskId)) {
      return
    }

    temp.add(taskId)
    const task = taskMap.get(taskId)
    if (task) {
      for (const depId of task.dependencies) {
        if (taskMap.has(depId)) {
          visit(depId)
        }
      }
    }
    temp.delete(taskId)
    visited.add(taskId)
    result.push(taskId)
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id)
    }
  }

  return result
}

function calculateCPM(tasks: TaskNode[]): CPMResult {
  if (tasks.length === 0) {
    return {
      criticalPath: [],
      projectDuration: 0,
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      orderedTaskIds: [],
      taskMap: new Map(),
    }
  }

  const taskMap = new Map<string, TaskNode>()
  for (const task of tasks) {
    taskMap.set(task.id, task)
  }

  const successors = new Map<string, string[]>()
  for (const task of tasks) {
    if (!successors.has(task.id)) {
      successors.set(task.id, [])
    }
    for (const depId of task.dependencies) {
      if (!successors.has(depId)) {
        successors.set(depId, [])
      }
      successors.get(depId)!.push(task.id)
    }
  }

  const sortedTasks = topologicalSort(tasks, taskMap)
  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()

  for (const taskId of sortedTasks) {
    const task = taskMap.get(taskId)!
    if (task.dependencies.length === 0) {
      earliestStart.set(taskId, 0)
    } else {
      let maxFinish = 0
      for (const depId of task.dependencies) {
        maxFinish = Math.max(maxFinish, earliestFinish.get(depId) ?? 0)
      }
      earliestStart.set(taskId, maxFinish)
    }

    earliestFinish.set(taskId, (earliestStart.get(taskId) ?? 0) + task.duration - 1)
  }

  let projectDuration = 0
  for (const finish of earliestFinish.values()) {
    projectDuration = Math.max(projectDuration, finish)
  }
  projectDuration += 1

  const latestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  const reverseSorted = [...sortedTasks].reverse()

  for (const taskId of reverseSorted) {
    const task = taskMap.get(taskId)!
    const taskSuccessors = successors.get(taskId) || []

    if (taskSuccessors.length === 0) {
      latestFinish.set(taskId, projectDuration - 1)
    } else {
      let minStart = projectDuration
      for (const successorId of taskSuccessors) {
        const successorStart = latestStart.get(successorId)
        if (successorStart !== undefined) {
          minStart = Math.min(minStart, successorStart)
        }
      }
      latestFinish.set(taskId, minStart - 1)
    }

    latestStart.set(taskId, (latestFinish.get(taskId) ?? projectDuration) - task.duration + 1)
  }

  const float = new Map<string, number>()
  for (const task of tasks) {
    const ls = latestStart.get(task.id) ?? 0
    const es = earliestStart.get(task.id) ?? 0
    float.set(task.id, ls - es)
  }

  const criticalSet = new Set<string>()
  for (const task of tasks) {
    if ((float.get(task.id) ?? 0) <= 0) {
      criticalSet.add(task.id)
    }
  }
  const criticalPath = sortedTasks.filter((taskId) => criticalSet.has(taskId))

  return {
    criticalPath,
    projectDuration,
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    float,
    orderedTaskIds: sortedTasks,
    taskMap,
  }
}

function buildTaskNodes(rows: CriticalPathTaskRow[]): TaskNode[] {
  const eligibleTasks = rows.filter((row) => {
    const startDate = parseDate(row.start_date)
    const endDate = parseDate(row.end_date ?? row.planned_end_date)
    return Boolean(startDate && endDate)
  })

  const eligibleIds = new Set(eligibleTasks.map((task) => task.id))

  return eligibleTasks.map((task) => {
    const startDate = parseDate(task.start_date)!
    const endDate = parseDate(task.end_date ?? task.planned_end_date)!
    const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1)

    return {
      id: task.id,
      name: task.title || task.name || task.id,
      duration,
      startDate,
      endDate,
      dependencies: parseDependencies(task.dependencies).filter((depId) => eligibleIds.has(depId) && depId !== task.id),
    }
  })
}

function getTaskDurationDays(row?: CriticalPathTaskRow | null): number {
  if (!row?.start_date) return 0
  const endValue = row.end_date ?? row.planned_end_date
  if (!endValue) return 0

  const startDate = parseDate(row.start_date)
  const endDate = parseDate(endValue)
  if (!startDate || !endDate) return 0

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1)
}

function normalizeOverrideRow(row: CriticalPathOverrideRow): CriticalPathOverrideRow {
  return {
    ...row,
    anchor_type: row.anchor_type ?? null,
    left_task_id: row.left_task_id ?? null,
    right_task_id: row.right_task_id ?? null,
    reason: row.reason ?? null,
    created_by: row.created_by ?? null,
  }
}

function makeError(code: string, statusCode: number, message: string, details?: unknown) {
  const error = new Error(message) as Error & { code: string; statusCode: number; details?: unknown }
  error.code = code
  error.statusCode = statusCode
  error.details = details
  return error
}

async function loadCriticalPathTaskRows(projectId: string): Promise<CriticalPathTaskRow[]> {
  const rows = await executeSQL<CriticalPathTaskRow>(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC',
    [projectId],
  )
  return (rows || []) as CriticalPathTaskRow[]
}

async function loadCriticalPathOverrideRows(projectId: string): Promise<CriticalPathOverrideRow[]> {
  const rows = await executeSQL<CriticalPathOverrideRow>(
    'SELECT * FROM task_critical_overrides WHERE project_id = ? ORDER BY created_at ASC, id ASC',
    [projectId],
  )
  return ((rows || []) as CriticalPathOverrideRow[]).map(normalizeOverrideRow)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function buildFallbackAutoTaskIds(rows: CriticalPathTaskRow[]): string[] {
  const datedRows = rows
    .filter((row) => parseDate(row.start_date) && parseDate(row.end_date ?? row.planned_end_date))
    .sort((left, right) => {
      const leftStart = parseDate(left.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightStart = parseDate(right.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (leftStart !== rightStart) return leftStart - rightStart

      const leftEnd = parseDate(left.end_date ?? left.planned_end_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightEnd = parseDate(right.end_date ?? right.planned_end_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (leftEnd !== rightEnd) return leftEnd - rightEnd

      const leftCreated = parseDate(left.created_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightCreated = parseDate(right.created_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return leftCreated - rightCreated
    })
    .map((row) => row.id)

  if (datedRows.length > 0) {
    return unique(datedRows)
  }

  const firstRow = rows[0]
  return firstRow ? [firstRow.id] : []
}

function sortTaskIdsByAnalysis(taskIds: string[], analysis: CPMResult): string[] {
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))
  return [...taskIds].sort((left, right) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  })
}

function isLevelOneMilestone(row?: CriticalPathTaskRow | null): boolean {
  if (!row?.is_milestone) return false
  if (typeof row.milestone_level === 'number') {
    return row.milestone_level === 1
  }
  if (typeof row.wbs_level === 'number') {
    return row.wbs_level === 1
  }
  return true
}

function getTaskEndSortValue(row: CriticalPathTaskRow | undefined, analysis: CPMResult, taskId: string): number {
  const directEndTime = parseDate(row?.end_date ?? row?.planned_end_date)?.getTime()
  if (directEndTime !== undefined) {
    return directEndTime
  }
  const fallbackFinish = analysis.earliestFinish.get(taskId) ?? analysis.latestFinish.get(taskId) ?? 0
  return fallbackFinish * DAY_MS
}

function getAutoChainElapsedDays(taskIds: string[], analysis: CPMResult, taskMap: Map<string, CriticalPathTaskRow>): number {
  if (taskIds.length === 0) return 0

  let earliestStart = Number.MAX_SAFE_INTEGER
  let latestFinish = 0

  for (const taskId of taskIds) {
    earliestStart = Math.min(earliestStart, analysis.earliestStart.get(taskId) ?? Number.MAX_SAFE_INTEGER)
    latestFinish = Math.max(latestFinish, analysis.earliestFinish.get(taskId) ?? 0)
  }

  if (earliestStart !== Number.MAX_SAFE_INTEGER) {
    return Math.max(1, latestFinish - earliestStart + 1)
  }

  return taskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId)), 0)
}

function buildAutoCriticalChains(
  projectId: string,
  rows: CriticalPathTaskRow[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
): CriticalChainSnapshot[] {
  const criticalTaskIds = analysis.criticalPath.length > 0
    ? unique(analysis.criticalPath)
    : buildFallbackAutoTaskIds(rows)

  if (criticalTaskIds.length === 0) return []

  if (analysis.criticalPath.length === 0) {
    return [{
      id: `${projectId}-auto-1`,
      source: 'auto',
      taskIds: criticalTaskIds,
      totalDurationDays: criticalTaskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId)), 0),
      displayLabel: '自动关键链 1',
    }]
  }

  const criticalSet = new Set(criticalTaskIds)
  const successors = new Map<string, string[]>()
  const predecessors = new Map<string, string[]>()
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))

  for (const taskId of criticalTaskIds) {
    successors.set(taskId, [])
    predecessors.set(taskId, [])
  }

  for (const row of rows) {
    if (!criticalSet.has(row.id)) continue
    const dependencies = parseDependencies(row.dependencies).filter((depId) => criticalSet.has(depId))
    predecessors.set(row.id, dependencies)
    for (const depId of dependencies) {
      successors.set(depId, [...(successors.get(depId) ?? []), row.id])
    }
  }

  const sortByAnalysisOrder = (left: string, right: string) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  }

  const roots = criticalTaskIds
    .filter((taskId) => (predecessors.get(taskId)?.length ?? 0) === 0)
    .sort(sortByAnalysisOrder)

  const paths: string[][] = []
  const pathKeys = new Set<string>()

  const dfs = (taskId: string, path: string[]) => {
    const nextPath = [...path, taskId]
    const nextTaskIds = [...(successors.get(taskId) ?? [])].sort(sortByAnalysisOrder)
    if (nextTaskIds.length === 0) {
      const key = nextPath.join('>')
      if (!pathKeys.has(key)) {
        pathKeys.add(key)
        paths.push(nextPath)
      }
      return
    }

    for (const nextTaskId of nextTaskIds) {
      dfs(nextTaskId, nextPath)
    }
  }

  for (const rootTaskId of roots) {
    dfs(rootTaskId, [])
  }

  const normalizedPaths = paths.length > 0
    ? paths
    : [sortTaskIdsByAnalysis(criticalTaskIds, analysis)]

  return normalizedPaths.map((taskIds, index) => ({
    id: `${projectId}-auto-${index + 1}`,
    source: 'auto',
    taskIds,
    totalDurationDays: getAutoChainElapsedDays(taskIds, analysis, taskMap),
    displayLabel: `自动关键链 ${index + 1}`,
  }))
}

function sortAutoCriticalChains(
  projectId: string,
  chains: CriticalChainSnapshot[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
): { primaryChain: CriticalChainSnapshot | null; alternateChains: CriticalChainSnapshot[]; orderedTaskIds: string[] } {
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))
  const rankedChains = chains
    .map((chain) => ({
      chain,
      levelOneMilestoneCount: chain.taskIds.filter((taskId) => isLevelOneMilestone(taskMap.get(taskId))).length,
      latestEndTime: chain.taskIds.reduce(
        (max, taskId) => Math.max(max, getTaskEndSortValue(taskMap.get(taskId), analysis, taskId)),
        0,
      ),
      firstOrderIndex: chain.taskIds.reduce((min, taskId) => {
        const index = orderIndex.get(taskId)
        return index === undefined ? min : Math.min(min, index)
      }, Number.MAX_SAFE_INTEGER),
    }))
    .sort((left, right) => {
      if (right.chain.totalDurationDays !== left.chain.totalDurationDays) {
        return right.chain.totalDurationDays - left.chain.totalDurationDays
      }
      if (right.levelOneMilestoneCount !== left.levelOneMilestoneCount) {
        return right.levelOneMilestoneCount - left.levelOneMilestoneCount
      }
      if (right.latestEndTime !== left.latestEndTime) {
        return right.latestEndTime - left.latestEndTime
      }
      if (left.firstOrderIndex !== right.firstOrderIndex) {
        return left.firstOrderIndex - right.firstOrderIndex
      }
      return left.chain.id.localeCompare(right.chain.id)
    })
    .map((entry, index) => ({
      ...entry.chain,
      id: index === 0 ? `${projectId}-primary` : `${projectId}-parallel-${index}`,
      displayLabel: index === 0 ? '主关键路径' : `零浮时平行链 ${index}`,
    }))

  return {
    primaryChain: rankedChains[0] ?? null,
    alternateChains: rankedChains.slice(1),
    orderedTaskIds: unique(rankedChains.flatMap((chain) => chain.taskIds)),
  }
}

function orderDisplayTaskIds(
  autoTaskIds: string[],
  taskIds: Set<string>,
  manualInsertOverrides: CriticalPathOverrideRow[],
): string[] {
  const order = [...autoTaskIds]

  for (const override of manualInsertOverrides) {
    if (!taskIds.has(override.task_id)) continue

    const nextOrder = order.filter((taskId) => taskId !== override.task_id)
    const leftIndex = override.left_task_id ? nextOrder.indexOf(override.left_task_id) : -1
    const rightIndex = override.right_task_id ? nextOrder.indexOf(override.right_task_id) : -1

    if (leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex) {
      nextOrder.splice(rightIndex, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    if (leftIndex >= 0) {
      nextOrder.splice(leftIndex + 1, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    if (rightIndex >= 0) {
      nextOrder.splice(rightIndex, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    nextOrder.push(override.task_id)
    order.splice(0, order.length, ...nextOrder)
  }

  return unique(order)
}

function buildManualInsertChains(
  projectId: string,
  manualInsertOverrides: CriticalPathOverrideRow[],
  taskMap: Map<string, CriticalPathTaskRow>,
): CriticalChainSnapshot[] {
  return manualInsertOverrides.map((override, index) => {
    const chainTaskIds: string[] = []
    if (override.left_task_id && taskMap.has(override.left_task_id)) {
      chainTaskIds.push(override.left_task_id)
    }
    if (taskMap.has(override.task_id) && !chainTaskIds.includes(override.task_id)) {
      chainTaskIds.push(override.task_id)
    }
    if (override.right_task_id && taskMap.has(override.right_task_id) && !chainTaskIds.includes(override.right_task_id)) {
      chainTaskIds.push(override.right_task_id)
    }

    if (chainTaskIds.length === 0 && taskMap.has(override.task_id)) {
      chainTaskIds.push(override.task_id)
    }

    const totalDurationDays = chainTaskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId)), 0)

    return {
      id: `${projectId}-manual-insert-${index + 1}`,
      source: 'manual_insert',
      taskIds: chainTaskIds,
      totalDurationDays,
      displayLabel: `Manual insert: ${taskMap.get(override.task_id)?.title || taskMap.get(override.task_id)?.name || override.task_id}`,
    }
  })
}

function buildSnapshotEdges(
  primaryTaskIds: string[],
  rows: CriticalPathTaskRow[],
  manualInsertOverrides: CriticalPathOverrideRow[],
): CriticalPathEdge[] {
  const taskIdSet = new Set(rows.map((row) => row.id))
  const primaryPairs = new Set<string>()
  for (let index = 0; index < primaryTaskIds.length - 1; index += 1) {
    primaryPairs.add(`${primaryTaskIds[index]}->${primaryTaskIds[index + 1]}`)
  }

  const edges: CriticalPathEdge[] = []
  for (const row of rows) {
    for (const depId of parseDependencies(row.dependencies)) {
      if (!taskIdSet.has(depId)) continue
      edges.push({
        id: `dependency:${depId}->${row.id}`,
        fromTaskId: depId,
        toTaskId: row.id,
        source: 'dependency',
        isPrimary: primaryPairs.has(`${depId}->${row.id}`),
      })
    }
  }

  for (const override of manualInsertOverrides) {
    if (override.left_task_id && taskIdSet.has(override.left_task_id)) {
      edges.push({
        id: `manual:${override.id}:left`,
        fromTaskId: override.left_task_id,
        toTaskId: override.task_id,
        source: 'manual_link',
        isPrimary: false,
      })
    }
    if (override.right_task_id && taskIdSet.has(override.right_task_id)) {
      edges.push({
        id: `manual:${override.id}:right`,
        fromTaskId: override.task_id,
        toTaskId: override.right_task_id,
        source: 'manual_link',
        isPrimary: false,
      })
    }
  }

  return edges
}

function validateOverrideInput(projectTasks: CriticalPathTaskRow[], input: CriticalPathOverrideInput) {
  const taskIds = new Set(projectTasks.map((task) => task.id))
  if (!taskIds.has(input.task_id)) {
    throw makeError('CRITICAL_PATH_TASK_NOT_FOUND', 404, '关键路径任务不存在')
  }

  const anchorIds = [input.left_task_id, input.right_task_id].filter((value): value is string => Boolean(value))
  for (const anchorId of anchorIds) {
    if (anchorId === input.task_id) {
      throw makeError('CRITICAL_PATH_SELF_ANCHOR', 422, '关键路径锚点不能指向任务自身')
    }
    if (!taskIds.has(anchorId)) {
      throw makeError('CRITICAL_PATH_ANCHOR_NOT_FOUND', 404, '关键路径锚点任务不存在')
    }
  }

  if (input.mode === 'manual_insert') {
    const hasLeft = Boolean(input.left_task_id)
    const hasRight = Boolean(input.right_task_id)
    if (!hasLeft && !hasRight) {
      throw makeError('MANUAL_INSERT_REQUIRES_ANCHOR', 422, '手动插链必须指定锚点')
    }

    if (!input.anchor_type) {
      throw makeError('MANUAL_INSERT_REQUIRES_ANCHOR_TYPE', 422, '手动插链必须指定 anchor_type')
    }
    const anchorType = input.anchor_type
    if (anchorType === 'before' && !hasRight) {
      throw makeError('MANUAL_INSERT_REQUIRES_RIGHT_ANCHOR', 422, 'before 类型必须提供 right_task_id')
    }
    if (anchorType === 'after' && !hasLeft) {
      throw makeError('MANUAL_INSERT_REQUIRES_LEFT_ANCHOR', 422, 'after 类型必须提供 left_task_id')
    }
    if (anchorType === 'between' && (!hasLeft || !hasRight)) {
      throw makeError('MANUAL_INSERT_REQUIRES_BOTH_ANCHORS', 422, 'between 类型必须同时提供 left_task_id 和 right_task_id')
    }
  }
}

export async function listCriticalPathOverrides(projectId: string): Promise<CriticalPathOverrideRow[]> {
  return await loadCriticalPathOverrideRows(projectId)
}

export async function getProjectCriticalPathSnapshot(projectId: string): Promise<CriticalPathSnapshot> {
  const rows = await loadCriticalPathTaskRows(projectId)
  const overrides = await loadCriticalPathOverrideRows(projectId)
  return buildProjectCriticalPathSnapshot(projectId, rows, overrides)
}

export function buildProjectCriticalPathSnapshot(
  projectId: string,
  rows: CriticalPathTaskRow[],
  overrides: CriticalPathOverrideRow[],
): CriticalPathSnapshot {
  const taskNodes = buildTaskNodes(rows)
  let analysis: CPMResult
  let hasCycleDetected = false
  let cycleTaskIds: string[] = []
  try {
    analysis = calculateCPM(taskNodes)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    hasCycleDetected = errorMessage.startsWith('CRITICAL_PATH_CYCLE_DETECTED:')
    if (hasCycleDetected) {
      const cycleTaskId = errorMessage.replace('CRITICAL_PATH_CYCLE_DETECTED:', '').trim()
      if (cycleTaskId) cycleTaskIds = [cycleTaskId]
    }
    logger.warn('[projectCriticalPathService] CPM calculation failed, using deterministic fallback ordering', {
      projectId,
      hasCycleDetected,
      cycleTaskIds,
      error: errorMessage,
    })
    analysis = {
      criticalPath: [],
      projectDuration: 0,
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      orderedTaskIds: [],
      taskMap: new Map(),
    }
  }
  const taskMap = new Map(rows.map((row) => [row.id, row]))
  const autoChains = buildAutoCriticalChains(projectId, rows, taskMap, analysis)
  const {
    primaryChain,
    alternateChains: autoAlternateChains,
    orderedTaskIds: orderedAutoTaskIds,
  } = sortAutoCriticalChains(projectId, autoChains, taskMap, analysis)
  const autoTaskIds = orderedAutoTaskIds.length > 0
    ? orderedAutoTaskIds
    : buildFallbackAutoTaskIds(rows)
  const manualAttentionTaskIds = unique(
    overrides.filter((override) => override.mode === 'manual_attention').map((override) => override.task_id),
  )
  const manualInsertOverrides = overrides.filter((override) => override.mode === 'manual_insert')
  const manualInsertedTaskIds = unique(manualInsertOverrides.map((override) => override.task_id))
  const displayTaskIds = unique([
    ...orderDisplayTaskIds(autoTaskIds, new Set(rows.map((row) => row.id)), manualInsertOverrides),
    ...manualAttentionTaskIds,
  ])
  const manualInsertChains = buildManualInsertChains(projectId, manualInsertOverrides, taskMap)
  const edges = buildSnapshotEdges(primaryChain?.taskIds ?? autoTaskIds, rows, manualInsertOverrides)
  const primaryChainIndex = new Map((primaryChain?.taskIds ?? []).map((taskId, index) => [taskId, index]))

  const tasks = displayTaskIds
    .map((taskId) => {
      const row = taskMap.get(taskId)
      const node = analysis.taskMap.get(taskId)
      if (!row) return null
      const chainIndex = primaryChainIndex.get(taskId)
      return {
        taskId,
        title: row.title || row.name || taskId,
        floatDays: analysis.float.get(taskId) ?? 0,
        durationDays: node?.duration ?? getTaskDurationDays(row),
        isAutoCritical: autoTaskIds.includes(taskId),
        isManualAttention: manualAttentionTaskIds.includes(taskId),
        isManualInserted: manualInsertedTaskIds.includes(taskId),
        ...(chainIndex !== undefined ? { chainIndex } : {}),
      } satisfies CriticalTaskSnapshot
    })
    .filter((task): task is CriticalTaskSnapshot => task !== null)

  return {
    projectId,
    autoTaskIds,
    manualAttentionTaskIds,
    manualInsertedTaskIds,
    primaryChain,
    alternateChains: [...autoAlternateChains, ...manualInsertChains],
    displayTaskIds,
    edges,
    tasks,
    projectDurationDays: Math.max(
      analysis.projectDuration,
      primaryChain?.totalDurationDays ?? 0,
      ...autoAlternateChains.map((chain) => chain.totalDurationDays),
      ...manualInsertChains.map((chain) => chain.totalDurationDays),
    ),
    hasCycleDetected,
    cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : undefined,
  }
}

async function saveCriticalPathOverride(projectId: string, input: CriticalPathOverrideInput): Promise<CriticalPathOverrideRow> {
  const projectTasks = await loadCriticalPathTaskRows(projectId)
  validateOverrideInput(projectTasks, input)

  const existingOverrides = await loadCriticalPathOverrideRows(projectId)
  const existingSameTaskMode = existingOverrides.find((override) => override.task_id === input.task_id && override.mode === input.mode)
  if (existingSameTaskMode) {
    await executeSQL(
      'DELETE FROM task_critical_overrides WHERE id = ? AND project_id = ?',
      [existingSameTaskMode.id, projectId],
    )
  }

  const id = uuidv4()
  const ts = new Date().toISOString()
  const row: CriticalPathOverrideRow = {
    id,
    project_id: projectId,
    task_id: input.task_id,
    mode: input.mode,
    anchor_type: input.anchor_type ?? null,
    left_task_id: input.left_task_id ?? null,
    right_task_id: input.right_task_id ?? null,
    reason: input.reason ?? null,
    created_by: input.created_by ?? null,
    created_at: ts,
    updated_at: ts,
  }

  await executeSQL(
    `INSERT INTO task_critical_overrides
      (id, project_id, task_id, mode, anchor_type, left_task_id, right_task_id, reason, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.project_id,
      row.task_id,
      row.mode,
      row.anchor_type,
      row.left_task_id,
      row.right_task_id,
      row.reason,
      row.created_by,
      row.created_at,
      row.updated_at,
    ],
  )

  return row
}

export async function createCriticalPathOverride(projectId: string, input: CriticalPathOverrideInput): Promise<CriticalPathOverrideRow> {
  return await saveCriticalPathOverride(projectId, input)
}

export async function deleteCriticalPathOverride(projectId: string, overrideId: string): Promise<void> {
  await executeSQL(
    'DELETE FROM task_critical_overrides WHERE id = ? AND project_id = ?',
    [overrideId, projectId],
  )
}

export async function recalculateProjectCriticalPath(projectId: string): Promise<ProjectCriticalPathResult> {
  const rows = await loadCriticalPathTaskRows(projectId)
  const overrides = await loadCriticalPathOverrideRows(projectId)
  const tasks = rows
  const taskNodes = buildTaskNodes(tasks)
  let analysis: CPMResult
  let failureMessage: string | null = null
  try {
    analysis = calculateCPM(taskNodes)
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error)
    logger.warn('[projectCriticalPathService] recalculation fallback ordering engaged', {
      projectId,
      error: failureMessage,
    })
    analysis = {
      criticalPath: buildFallbackAutoTaskIds(rows),
      projectDuration: 0,
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      orderedTaskIds: [],
      taskMap: new Map(),
    }
  }
  try {
    await syncCriticalPathFailureNotification(projectId, failureMessage)
  } catch (notificationError) {
    logger.warn('[projectCriticalPathService] failed to persist CPM failure notification', {
      projectId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }
  const snapshot = buildProjectCriticalPathSnapshot(projectId, rows, overrides)

  logger.info('[projectCriticalPathService] recalculated project critical path snapshot', {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: taskNodes.length,
    criticalTaskCount: snapshot.autoTaskIds.length,
    projectDuration: analysis.projectDuration,
  })

  return {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: taskNodes.length,
    criticalTaskIds: analysis.criticalPath,
    projectDuration: analysis.projectDuration,
    snapshot,
  }
}
