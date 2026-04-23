import { calculateCriticalPathAnalysis } from './criticalPathFallback'
import type {
  CriticalChainSnapshot,
  CriticalPathAnalysis,
  CriticalPathEdge,
  CriticalPathOverrideInput,
  CriticalPathSnapshot,
  CriticalTaskSnapshot,
  TaskNode,
} from './criticalPath'

/** Legacy compatibility input. Snapshot building ignores any legacy critical flag. */
export interface CriticalPathTaskRecord extends TaskNode {
  isCritical?: boolean | null
  isMilestone?: boolean | null
  milestoneLevel?: number | null
  wbsLevel?: number | null
}

function normalizeTaskRecord(record: CriticalPathTaskRecord): TaskNode {
  return {
    id: record.id,
    name: record.name,
    duration: record.duration,
    startDate: record.startDate,
    endDate: record.endDate,
    dependencies: [...record.dependencies],
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function orderByAnchorPosition(
  order: string[],
  taskId: string,
  leftTaskId?: string | null,
  rightTaskId?: string | null,
): string[] {
  const filtered = order.filter((id) => id !== taskId)

  const leftIndex = leftTaskId ? filtered.indexOf(leftTaskId) : -1
  const rightIndex = rightTaskId ? filtered.indexOf(rightTaskId) : -1

  if (leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex) {
    filtered.splice(rightIndex, 0, taskId)
    return filtered
  }

  if (leftIndex >= 0) {
    filtered.splice(leftIndex + 1, 0, taskId)
    return filtered
  }

  if (rightIndex >= 0) {
    filtered.splice(rightIndex, 0, taskId)
    return filtered
  }

  filtered.push(taskId)
  return filtered
}

function buildDisplayOrder(
  analysis: CriticalPathAnalysis,
  taskRecords: CriticalPathTaskRecord[],
  overrides: CriticalPathOverrideInput[],
): string[] {
  const taskMap = new Map(taskRecords.map((task) => [task.id, task]))
  let order = [...analysis.autoTaskIds]

  const manualInsertOverrides = overrides.filter((override) => override.mode === 'manual_insert')
  for (const override of manualInsertOverrides) {
    if (!taskMap.has(override.taskId)) continue
    order = orderByAnchorPosition(order, override.taskId, override.leftTaskId, override.rightTaskId)
  }

  const manualAttentionIds = unique(
    overrides.filter((override) => override.mode === 'manual_attention').map((override) => override.taskId),
  )

  for (const taskId of manualAttentionIds) {
    if (!order.includes(taskId) && taskMap.has(taskId)) {
      order.push(taskId)
    }
  }

  return unique(order)
}

function sortTaskIdsByAnalysis(taskIds: string[], analysis: CriticalPathAnalysis): string[] {
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))
  return [...taskIds].sort((left, right) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  })
}

function isLevelOneMilestone(task?: CriticalPathTaskRecord | null): boolean {
  if (!task?.isMilestone) return false
  if (typeof task.milestoneLevel === 'number') {
    return task.milestoneLevel === 1
  }
  if (typeof task.wbsLevel === 'number') {
    return task.wbsLevel === 1
  }
  return true
}

function getTaskEndSortValue(task: CriticalPathTaskRecord | undefined, analysis: CriticalPathAnalysis, taskId: string): number {
  const directEndTime = task?.endDate?.getTime()
  if (directEndTime !== undefined) {
    return directEndTime
  }
  const fallbackFinish = analysis.earliestFinish.get(taskId) ?? analysis.latestFinish.get(taskId) ?? 0
  return fallbackFinish
}

function getAutoChainElapsedDays(
  taskIds: string[],
  analysis: CriticalPathAnalysis,
  taskMap: Map<string, CriticalPathTaskRecord>,
): number {
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

  return taskIds.reduce((sum, taskId) => sum + (taskMap.get(taskId)?.duration ?? 0), 0)
}

function buildAutoCriticalChains(
  projectId: string,
  taskRecords: CriticalPathTaskRecord[],
  taskMap: Map<string, CriticalPathTaskRecord>,
  analysis: CriticalPathAnalysis,
): CriticalChainSnapshot[] {
  const criticalTaskIds = analysis.autoTaskIds.length > 0
    ? unique(analysis.autoTaskIds)
    : sortTaskIdsByAnalysis(taskRecords.map((task) => task.id), analysis).slice(0, 1)

  if (criticalTaskIds.length === 0) return []

  if (analysis.autoTaskIds.length === 0) {
    return [{
      id: `${projectId}-auto-1`,
      source: 'auto',
      taskIds: criticalTaskIds,
      totalDurationDays: criticalTaskIds.reduce((sum, taskId) => sum + (taskMap.get(taskId)?.duration ?? 0), 0),
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

  for (const task of taskRecords) {
    if (!criticalSet.has(task.id)) continue
    const dependencies = task.dependencies.filter((depId) => criticalSet.has(depId))
    predecessors.set(task.id, dependencies)
    for (const depId of dependencies) {
      successors.set(depId, [...(successors.get(depId) ?? []), task.id])
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
  taskMap: Map<string, CriticalPathTaskRecord>,
  analysis: CriticalPathAnalysis,
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

function buildManualInsertChains(
  projectId: string,
  overrides: CriticalPathOverrideInput[],
  taskMap: Map<string, CriticalPathTaskRecord>,
): CriticalChainSnapshot[] {
  return overrides
    .filter((override) => override.mode === 'manual_insert')
    .map((override, index) => {
      const chainTaskIds: string[] = []
      if (override.leftTaskId && taskMap.has(override.leftTaskId)) {
        chainTaskIds.push(override.leftTaskId)
      }
      if (taskMap.has(override.taskId) && !chainTaskIds.includes(override.taskId)) {
        chainTaskIds.push(override.taskId)
      }
      if (override.rightTaskId && taskMap.has(override.rightTaskId) && !chainTaskIds.includes(override.rightTaskId)) {
        chainTaskIds.push(override.rightTaskId)
      }

      if (chainTaskIds.length === 0 && taskMap.has(override.taskId)) {
        chainTaskIds.push(override.taskId)
      }

      const totalDurationDays = chainTaskIds.reduce((sum, taskId) => sum + (taskMap.get(taskId)?.duration ?? 0), 0)
      const labelTask = taskMap.get(override.taskId)?.name || override.taskId

      return {
        id: `${projectId}-manual-insert-${index + 1}`,
        source: 'manual_insert',
        taskIds: chainTaskIds,
        totalDurationDays,
        displayLabel: `Manual insert: ${labelTask}`,
      }
    })
}

function buildSnapshotEdges(
  primaryTaskIds: string[],
  taskRecords: CriticalPathTaskRecord[],
  overrides: CriticalPathOverrideInput[],
): CriticalPathEdge[] {
  const taskMap = new Map(taskRecords.map((task) => [task.id, task]))
  const primaryPairs = new Set<string>()
  for (let index = 0; index < primaryTaskIds.length - 1; index += 1) {
    primaryPairs.add(`${primaryTaskIds[index]}->${primaryTaskIds[index + 1]}`)
  }

  const edges: CriticalPathEdge[] = []
  for (const task of taskRecords) {
    for (const depId of task.dependencies) {
      if (!taskMap.has(depId)) continue
      edges.push({
        id: `dependency:${depId}->${task.id}`,
        fromTaskId: depId,
        toTaskId: task.id,
        source: 'dependency',
        isPrimary: primaryPairs.has(`${depId}->${task.id}`),
      })
    }
  }

  for (const override of overrides.filter((item) => item.mode === 'manual_insert')) {
    if (override.leftTaskId && taskMap.has(override.leftTaskId) && taskMap.has(override.taskId)) {
      edges.push({
        id: `manual:${override.taskId}:${override.leftTaskId}:left`,
        fromTaskId: override.leftTaskId,
        toTaskId: override.taskId,
        source: 'manual_link',
        isPrimary: false,
      })
    }
    if (override.rightTaskId && taskMap.has(override.taskId) && taskMap.has(override.rightTaskId)) {
      edges.push({
        id: `manual:${override.taskId}:${override.rightTaskId}:right`,
        fromTaskId: override.taskId,
        toTaskId: override.rightTaskId,
        source: 'manual_link',
        isPrimary: false,
      })
    }
  }

  return edges
}

/** Explicit fallback snapshot builder kept outside the main critical-path contract module. */
export function buildCriticalPathSnapshot(
  projectId: string,
  taskRecords: CriticalPathTaskRecord[],
  overrides: CriticalPathOverrideInput[] = [],
): CriticalPathSnapshot {
  const eligibleRecords = taskRecords.filter((task) => Boolean(task.startDate && task.endDate))
  const normalizedTasks = eligibleRecords.map(normalizeTaskRecord)
  const analysis = calculateCriticalPathAnalysis(normalizedTasks)
  const taskMap = new Map(eligibleRecords.map((task) => [task.id, task]))
  const autoChains = buildAutoCriticalChains(projectId, eligibleRecords, taskMap, analysis)
  const {
    primaryChain,
    alternateChains: autoAlternateChains,
    orderedTaskIds: orderedAutoTaskIds,
  } = sortAutoCriticalChains(projectId, autoChains, taskMap, analysis)
  const manualAttentionTaskIds = unique(
    overrides.filter((override) => override.mode === 'manual_attention').map((override) => override.taskId),
  )
  const manualInsertedTaskIds = unique(
    overrides.filter((override) => override.mode === 'manual_insert').map((override) => override.taskId),
  )
  const displayTaskIds = buildDisplayOrder({
    ...analysis,
    autoTaskIds: orderedAutoTaskIds.length > 0 ? orderedAutoTaskIds : analysis.autoTaskIds,
  }, eligibleRecords, overrides)
  const manualInsertChains = buildManualInsertChains(projectId, overrides, taskMap)
  const edges = buildSnapshotEdges(primaryChain?.taskIds ?? orderedAutoTaskIds, eligibleRecords, overrides)

  const primaryChainIndex = new Map<string, number>()
  ;(primaryChain?.taskIds ?? []).forEach((taskId, index) => {
    primaryChainIndex.set(taskId, index)
  })

  const tasks = displayTaskIds
    .map((taskId) => {
      const task = taskMap.get(taskId)
      if (!task) return null
      const chainIndex = primaryChainIndex.get(taskId)
      return {
        taskId,
        title: task.name,
        floatDays: analysis.float.get(taskId) ?? 0,
        durationDays: task.duration,
        isAutoCritical: analysis.autoTaskIds.includes(taskId),
        isManualAttention: manualAttentionTaskIds.includes(taskId),
        isManualInserted: manualInsertedTaskIds.includes(taskId),
        ...(chainIndex !== undefined ? { chainIndex } : {}),
      } satisfies CriticalTaskSnapshot
    })
    .filter((task): task is CriticalTaskSnapshot => task !== null)

  const projectDurationDays = Math.max(
    analysis.projectDurationDays,
    primaryChain?.totalDurationDays ?? 0,
    ...autoAlternateChains.map((chain) => chain.totalDurationDays),
    ...manualInsertChains.map((chain) => chain.totalDurationDays),
  )

  return {
    projectId,
    autoTaskIds: orderedAutoTaskIds.length > 0 ? orderedAutoTaskIds : analysis.autoTaskIds,
    manualAttentionTaskIds,
    manualInsertedTaskIds,
    primaryChain,
    alternateChains: [...autoAlternateChains, ...manualInsertChains],
    displayTaskIds,
    edges,
    tasks,
    projectDurationDays,
  }
}
