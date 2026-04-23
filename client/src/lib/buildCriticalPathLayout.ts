import type { CriticalPathEdge, CriticalPathSnapshot, CriticalTaskSnapshot } from './criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

export const CRITICAL_PATH_NODE_WIDTH = 180
export const CRITICAL_PATH_NODE_HEIGHT = 64
export const CRITICAL_PATH_COLUMN_GAP = 56
export const CRITICAL_PATH_LANE_HEADER_HEIGHT = 34
export const CRITICAL_PATH_LANE_GAP = 34
export const CRITICAL_PATH_CANVAS_PADDING_X = 36
export const CRITICAL_PATH_CANVAS_PADDING_Y = 28

export type CriticalPathLayoutLaneType = 'primary' | 'alternate' | 'attention' | 'other'

export interface CriticalPathLayoutLane {
  id: string
  label: string
  type: CriticalPathLayoutLaneType
  index: number
  top: number
  height: number
  taskIds: string[]
}

export interface CriticalPathLayoutNode {
  taskId: string
  title: string
  subtitle: string
  badges: string[]
  column: number
  laneIndex: number
  x: number
  y: number
  width: number
  height: number
  isPrimary: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  isAutoCritical: boolean
  chainIndex?: number
}

export interface CriticalPathLayoutEdge {
  id: string
  fromTaskId: string
  toTaskId: string
  source: 'dependency' | 'manual_link'
  isPrimary: boolean
  path: string
  startX: number
  startY: number
  endX: number
  endY: number
}

export interface CriticalPathLayout {
  lanes: CriticalPathLayoutLane[]
  nodes: CriticalPathLayoutNode[]
  edges: CriticalPathLayoutEdge[]
  canvasWidth: number
  canvasHeight: number
  columnCount: number
}

interface LayoutInput {
  snapshot: CriticalPathSnapshot | null | undefined
  tasks?: Task[]
}

function uniqueTaskIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function buildFallbackLayout(): CriticalPathLayout {
  return {
    lanes: [],
    nodes: [],
    edges: [],
    canvasWidth: CRITICAL_PATH_CANVAS_PADDING_X * 2 + CRITICAL_PATH_NODE_WIDTH,
    canvasHeight: CRITICAL_PATH_CANVAS_PADDING_Y * 2 + CRITICAL_PATH_NODE_HEIGHT,
    columnCount: 1,
  }
}

function getTaskTitle(taskMap: Map<string, Task>, taskId: string, snapshotTask?: CriticalTaskSnapshot) {
  const task = taskMap.get(taskId)
  return task?.title || task?.name || snapshotTask?.title || taskId
}

function getTaskSubtitle(snapshotTask?: CriticalTaskSnapshot) {
  if (!snapshotTask) return '等待快照补充'
  return `浮动 ${snapshotTask.floatDays} 天 · 工期 ${snapshotTask.durationDays} 天`
}

function getTaskBadges(snapshotTask?: CriticalTaskSnapshot) {
  if (!snapshotTask) return []
  const badges: string[] = []
  if (snapshotTask.isAutoCritical) badges.push('自动')
  if (snapshotTask.isManualAttention) badges.push('关注')
  if (snapshotTask.isManualInserted) badges.push('插链')
  return badges
}

function buildLanes(snapshot: CriticalPathSnapshot): CriticalPathLayoutLane[] {
  const lanes: Array<Omit<CriticalPathLayoutLane, 'index' | 'top' | 'height'>> = []
  const assigned = new Set<string>()

  if (snapshot.primaryChain?.taskIds.length) {
    const taskIds = uniqueTaskIds(snapshot.primaryChain.taskIds)
    taskIds.forEach((taskId) => assigned.add(taskId))
    lanes.push({
      id: snapshot.primaryChain.id || 'primary',
      label: snapshot.primaryChain.displayLabel || '关键路径',
      type: 'primary',
      taskIds,
    })
  }

  snapshot.alternateChains.forEach((chain, index) => {
    const taskIds = uniqueTaskIds(chain.taskIds)
    if (!taskIds.length) return
    taskIds.forEach((taskId) => assigned.add(taskId))
    lanes.push({
      id: chain.id || `alternate-${index + 1}`,
      label: chain.displayLabel || `备选链 ${index + 1}`,
      type: 'alternate',
      taskIds,
    })
  })

  const manualAttentionOnly = uniqueTaskIds(snapshot.manualAttentionTaskIds).filter((taskId) => !assigned.has(taskId))
  if (manualAttentionOnly.length) {
    manualAttentionOnly.forEach((taskId) => assigned.add(taskId))
    lanes.push({
      id: 'manual-attention',
      label: '手动关注',
      type: 'attention',
      taskIds: manualAttentionOnly,
    })
  }

  const remaining = uniqueTaskIds([
    ...snapshot.displayTaskIds,
    ...snapshot.edges.flatMap((edge) => [edge.fromTaskId, edge.toTaskId]),
    ...snapshot.tasks.map((task) => task.taskId),
  ]).filter((taskId) => !assigned.has(taskId))

  if (remaining.length) {
    lanes.push({
      id: 'other-display',
      label: '其他显示任务',
      type: 'other',
      taskIds: remaining,
    })
  }

  return lanes.map((lane, index) => ({
    ...lane,
    index,
    top: CRITICAL_PATH_CANVAS_PADDING_Y + index * (CRITICAL_PATH_LANE_HEADER_HEIGHT + CRITICAL_PATH_NODE_HEIGHT + CRITICAL_PATH_LANE_GAP),
    height: CRITICAL_PATH_LANE_HEADER_HEIGHT + CRITICAL_PATH_NODE_HEIGHT,
  }))
}

function buildPreferenceOrder(snapshot: CriticalPathSnapshot) {
  const order = new Map<string, number>()
  let cursor = 0
  const feed = (taskIds: string[]) => {
    taskIds.forEach((taskId) => {
      if (!order.has(taskId)) {
        order.set(taskId, cursor)
        cursor += 1
      }
    })
  }

  feed(snapshot.primaryChain?.taskIds ?? [])
  snapshot.alternateChains.forEach((chain) => feed(chain.taskIds))
  feed(snapshot.manualAttentionTaskIds)
  feed(snapshot.displayTaskIds)
  feed(snapshot.tasks.map((task) => task.taskId))

  return order
}

function buildTopologicalOrder(taskIds: string[], edges: CriticalPathEdge[], preferenceOrder: Map<string, number>) {
  const incomingCount = new Map<string, number>(taskIds.map((taskId) => [taskId, 0]))
  const outgoing = new Map<string, string[]>()

  edges.forEach((edge) => {
    if (!incomingCount.has(edge.fromTaskId) || !incomingCount.has(edge.toTaskId)) return
    outgoing.set(edge.fromTaskId, [...(outgoing.get(edge.fromTaskId) ?? []), edge.toTaskId])
    incomingCount.set(edge.toTaskId, (incomingCount.get(edge.toTaskId) ?? 0) + 1)
  })

  const queue = taskIds
    .filter((taskId) => (incomingCount.get(taskId) ?? 0) === 0)
    .sort((left, right) => (preferenceOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (preferenceOrder.get(right) ?? Number.MAX_SAFE_INTEGER))

  const order: string[] = []
  while (queue.length) {
    const taskId = queue.shift()!
    order.push(taskId)

    ;(outgoing.get(taskId) ?? []).forEach((targetId) => {
      const nextCount = (incomingCount.get(targetId) ?? 0) - 1
      incomingCount.set(targetId, nextCount)
      if (nextCount === 0) {
        queue.push(targetId)
        queue.sort((left, right) => (preferenceOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (preferenceOrder.get(right) ?? Number.MAX_SAFE_INTEGER))
      }
    })
  }

  if (order.length === taskIds.length) return order

  return [...taskIds].sort(
    (left, right) => (preferenceOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (preferenceOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  )
}

function buildInitialColumns(lanes: CriticalPathLayoutLane[]) {
  const columns = new Map<string, number>()
  lanes.forEach((lane) => {
    lane.taskIds.forEach((taskId, index) => {
      if (!columns.has(taskId)) {
        columns.set(taskId, index)
      } else {
        columns.set(taskId, Math.min(columns.get(taskId) ?? index, index))
      }
    })
  })
  return columns
}

function relaxColumns(
  order: string[],
  columns: Map<string, number>,
  incomingByTarget: Map<string, string[]>,
) {
  order.forEach((taskId) => {
    const predecessors = incomingByTarget.get(taskId) ?? []
    let nextColumn = columns.get(taskId) ?? 0
    predecessors.forEach((sourceId) => {
      nextColumn = Math.max(nextColumn, (columns.get(sourceId) ?? 0) + 1)
    })
    columns.set(taskId, nextColumn)
  })
}

function compactLaneColumns(
  order: string[],
  lanes: CriticalPathLayoutLane[],
  columns: Map<string, number>,
) {
  const topoIndex = new Map(order.map((taskId, index) => [taskId, index]))
  lanes.forEach((lane) => {
    const taken = new Set<number>()
    const sortedTaskIds = [...lane.taskIds].sort((left, right) => {
      const leftColumn = columns.get(left) ?? 0
      const rightColumn = columns.get(right) ?? 0
      if (leftColumn !== rightColumn) return leftColumn - rightColumn
      return (topoIndex.get(left) ?? 0) - (topoIndex.get(right) ?? 0)
    })

    sortedTaskIds.forEach((taskId) => {
      let nextColumn = columns.get(taskId) ?? 0
      while (taken.has(nextColumn)) {
        nextColumn += 1
      }
      columns.set(taskId, nextColumn)
      taken.add(nextColumn)
    })
  })
}

function buildEdgePath(startX: number, startY: number, endX: number, endY: number) {
  const deltaX = endX - startX
  if (deltaX > 0) {
    const controlOffset = Math.max(42, Math.min(120, deltaX * 0.45))
    return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
  }

  const exitX = startX + 36
  const entryX = endX - 36
  const midY = startY + (endY - startY) / 2
  return `M ${startX} ${startY} C ${exitX} ${startY}, ${exitX} ${midY}, ${startX + 12} ${midY} S ${entryX} ${endY}, ${endX} ${endY}`
}

export function buildCriticalPathLayout(input: LayoutInput): CriticalPathLayout {
  if (!input.snapshot) return buildFallbackLayout()

  const snapshot = input.snapshot
  const taskMap = new Map((input.tasks ?? []).map((task) => [task.id, task]))
  const snapshotTaskMap = new Map(snapshot.tasks.map((task) => [task.taskId, task]))
  const lanes = buildLanes(snapshot)

  const taskIds = uniqueTaskIds(lanes.flatMap((lane) => lane.taskIds))
  if (!taskIds.length) return buildFallbackLayout()

  const preferenceOrder = buildPreferenceOrder(snapshot)
  const order = buildTopologicalOrder(taskIds, snapshot.edges, preferenceOrder)
  const incomingByTarget = new Map<string, string[]>()
  snapshot.edges.forEach((edge) => {
    if (!taskIds.includes(edge.fromTaskId) || !taskIds.includes(edge.toTaskId)) return
    incomingByTarget.set(edge.toTaskId, [...(incomingByTarget.get(edge.toTaskId) ?? []), edge.fromTaskId])
  })

  const columns = buildInitialColumns(lanes)
  for (let iteration = 0; iteration < 4; iteration += 1) {
    relaxColumns(order, columns, incomingByTarget)
    compactLaneColumns(order, lanes, columns)
  }

  const laneIndexByTaskId = new Map<string, number>()
  lanes.forEach((lane) => {
    lane.taskIds.forEach((taskId) => {
      if (!laneIndexByTaskId.has(taskId)) {
        laneIndexByTaskId.set(taskId, lane.index)
      }
    })
  })

  const nodes = order.map<CriticalPathLayoutNode>((taskId) => {
    const snapshotTask = snapshotTaskMap.get(taskId)
    const column = columns.get(taskId) ?? 0
    const laneIndex = laneIndexByTaskId.get(taskId) ?? 0
    const lane = lanes[laneIndex]
    const x = CRITICAL_PATH_CANVAS_PADDING_X + column * (CRITICAL_PATH_NODE_WIDTH + CRITICAL_PATH_COLUMN_GAP)
    const y = (lane?.top ?? CRITICAL_PATH_CANVAS_PADDING_Y) + CRITICAL_PATH_LANE_HEADER_HEIGHT

    return {
      taskId,
      title: getTaskTitle(taskMap, taskId, snapshotTask),
      subtitle: getTaskSubtitle(snapshotTask),
      badges: getTaskBadges(snapshotTask),
      column,
      laneIndex,
      x,
      y,
      width: CRITICAL_PATH_NODE_WIDTH,
      height: CRITICAL_PATH_NODE_HEIGHT,
      isPrimary: snapshot.primaryChain?.taskIds.includes(taskId) ?? false,
      isManualAttention: Boolean(snapshotTask?.isManualAttention),
      isManualInserted: Boolean(snapshotTask?.isManualInserted),
      isAutoCritical: Boolean(snapshotTask?.isAutoCritical),
      chainIndex: snapshotTask?.chainIndex,
    }
  })

  const nodeById = new Map(nodes.map((node) => [node.taskId, node]))
  const edges = snapshot.edges.flatMap<CriticalPathLayoutEdge>((edge) => {
    const sourceNode = nodeById.get(edge.fromTaskId)
    const targetNode = nodeById.get(edge.toTaskId)
    if (!sourceNode || !targetNode) return []

    const startX = sourceNode.x + sourceNode.width
    const startY = sourceNode.y + sourceNode.height / 2
    const endX = targetNode.x
    const endY = targetNode.y + targetNode.height / 2

    return [{
      id: edge.id,
      fromTaskId: edge.fromTaskId,
      toTaskId: edge.toTaskId,
      source: edge.source,
      isPrimary: edge.isPrimary,
      path: buildEdgePath(startX, startY, endX, endY),
      startX,
      startY,
      endX,
      endY,
    }]
  })

  const maxColumn = Math.max(...nodes.map((node) => node.column), 0)
  const canvasWidth = CRITICAL_PATH_CANVAS_PADDING_X * 2 + (maxColumn + 1) * CRITICAL_PATH_NODE_WIDTH + maxColumn * CRITICAL_PATH_COLUMN_GAP
  const lastLane = lanes[lanes.length - 1]
  const canvasHeight = lastLane
    ? lastLane.top + lastLane.height + CRITICAL_PATH_CANVAS_PADDING_Y
    : CRITICAL_PATH_CANVAS_PADDING_Y * 2 + CRITICAL_PATH_NODE_HEIGHT

  return {
    lanes,
    nodes,
    edges,
    canvasWidth,
    canvasHeight,
    columnCount: maxColumn + 1,
  }
}
