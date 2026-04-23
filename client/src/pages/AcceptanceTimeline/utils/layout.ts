import { getAcceptancePredecessorIds, type AcceptanceNode, type AcceptancePlan } from '@/types/acceptance'

import type { AcceptanceTimelineScale } from '../types'

export const FLOW_LANE_LABEL_WIDTH = 240
export const FLOW_BUCKET_WIDTH = 280
export const FLOW_HEADER_HEIGHT = 76
export const FLOW_CARD_WIDTH = 240
export const FLOW_CARD_HEIGHT = 160
export const FLOW_CARD_STEP = 184
export const FLOW_CARD_INSET_X = 20
export const FLOW_CARD_INSET_Y = 24

export interface AcceptanceFlowPhaseLane {
  id: string
  name: string
  order: number
  plans: AcceptancePlan[]
}

export interface AcceptanceFlowTimeBucket {
  key: string
  label: string
  sortKey: number
  isUnscheduled: boolean
}

export interface AcceptanceFlowPlacement {
  planId: string
  phaseId: string
  bucketKey: string
  bucketLabel: string
  bucketIndex: number
  laneIndex: number
  stackIndex: number
  stackCount: number
  isUnscheduled: boolean
}

export interface AcceptanceFlowNodeRelationState {
  isSelected: boolean
  isRelated: boolean
  isUpstream: boolean
  isDownstream: boolean
  isDimmed: boolean
  upstreamCount: number
  downstreamCount: number
  hasFanIn: boolean
  hasFanOut: boolean
}

export interface AcceptanceFlowLayout {
  lanes: AcceptanceFlowPhaseLane[]
  buckets: AcceptanceFlowTimeBucket[]
  laneLayouts: AcceptanceFlowLaneLayout[]
  placements: Record<string, AcceptanceFlowPlacement>
  cells: Record<string, Record<string, string[]>>
  nodes: AcceptanceNode[]
  canvasWidth: number
  canvasHeight: number
}

export interface AcceptanceFlowLaneLayout {
  laneId: string
  top: number
  height: number
  maxStackCount: number
}

interface PhaseMeta {
  id: string
  name: string
  order: number
}

const PHASE_META: Record<string, PhaseMeta> = {
  preparation: { id: 'preparation', name: '准备阶段', order: 1 },
  special_acceptance: { id: 'special_acceptance', name: '专项验收', order: 2 },
  unit_completion: { id: 'unit_completion', name: '单位工程验收', order: 3 },
  filing_archive: { id: 'filing_archive', name: '备案归档', order: 4 },
  delivery_closeout: { id: 'delivery_closeout', name: '交付收口', order: 5 },
  phase1: { id: 'phase1', name: '第一阶段：预验收', order: 1 },
  phase2: { id: 'phase2', name: '第二阶段：四方验收', order: 2 },
  phase3: { id: 'phase3', name: '第三阶段：专项验收', order: 3 },
  phase4: { id: 'phase4', name: '第四阶段：竣工备案', order: 4 },
  default: { id: 'default', name: '其他', order: 99 },
}

export function getAcceptancePhaseMeta(phaseId?: string | null): PhaseMeta {
  return PHASE_META[phaseId || 'default'] || PHASE_META.default
}

export function buildAcceptanceFlowLayout(plans: AcceptancePlan[], timeScale: AcceptanceTimelineScale): AcceptanceFlowLayout {
  const lanes = buildPhaseLanes(plans)
  const buckets = buildTimeBuckets(plans, timeScale)
  const bucketIndexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]))
  const placements: Record<string, AcceptanceFlowPlacement> = {}
  const cells: Record<string, Record<string, string[]>> = {}
  const nodes: AcceptanceNode[] = []
  const laneLayouts = buildLaneLayouts(lanes, timeScale)
  const laneLayoutById = new Map(laneLayouts.map((laneLayout) => [laneLayout.laneId, laneLayout]))

  lanes.forEach((lane, laneIndex) => {
    const laneCells = (cells[lane.id] ||= {})
    const grouped = new Map<string, AcceptancePlan[]>()

    for (const plan of lane.plans) {
      const bucket = getTimeBucket(plan.planned_date, timeScale)
      const current = grouped.get(bucket.key) || []
      current.push(plan)
      grouped.set(bucket.key, current)
    }

    for (const [bucketKey, bucketPlans] of grouped.entries()) {
      const bucket = buckets.find((item) => item.key === bucketKey) || buildUnscheduledBucket()
      const sortedPlans = [...bucketPlans].sort(compareAcceptancePlansForLayout)
      laneCells[bucketKey] = sortedPlans.map((plan) => plan.id)

      sortedPlans.forEach((plan, stackIndex) => {
        const bucketIndex = bucketIndexByKey.get(bucketKey) ?? buckets.length - 1
        const placement = {
          planId: plan.id,
          phaseId: lane.id,
          bucketKey,
          bucketLabel: bucket.label,
          bucketIndex,
          laneIndex,
          stackIndex,
          stackCount: sortedPlans.length,
          isUnscheduled: bucket.isUnscheduled,
        }

        placements[plan.id] = placement
        nodes.push(buildPlacedNode(plan, placement, laneLayoutById.get(lane.id)?.top || FLOW_HEADER_HEIGHT))
      })
    }
  })

  const canvasWidth = FLOW_LANE_LABEL_WIDTH + Math.max(1, buckets.length) * FLOW_BUCKET_WIDTH
  const canvasHeight = laneLayouts.length > 0
    ? laneLayouts[laneLayouts.length - 1].top + laneLayouts[laneLayouts.length - 1].height + FLOW_CARD_INSET_Y
    : FLOW_HEADER_HEIGHT + FLOW_CARD_HEIGHT + FLOW_CARD_INSET_Y * 2

  return {
    lanes,
    buckets,
    laneLayouts,
    placements,
    cells,
    nodes,
    canvasWidth,
    canvasHeight,
  }
}

export interface AcceptanceFlowRelationEdge {
  id: string
  sourceId: string
  targetId: string
  source: AcceptanceFlowPoint
  target: AcceptanceFlowPoint
  sourceDegree: number
  targetDegree: number
  parallelIndex: number
  parallelCount: number
}

export interface AcceptanceFlowPoint {
  x: number
  y: number
}

export interface AcceptanceFlowRelationGraph {
  edges: AcceptanceFlowRelationEdge[]
  relatedIds: Record<string, 'selected' | 'upstream' | 'downstream' | 'related'>
  upstreamByTarget: Record<string, string[]>
  downstreamBySource: Record<string, string[]>
}

export function buildAcceptanceFlowRelations(plans: AcceptancePlan[], layout: AcceptanceFlowLayout): AcceptanceFlowRelationGraph {
  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]))
  const edges: AcceptanceFlowRelationEdge[] = []
  const upstreamByTarget: Record<string, string[]> = {}
  const downstreamBySource: Record<string, string[]> = {}

  for (const plan of plans) {
    const targetNode = nodeMap.get(plan.id)
    if (!targetNode) continue

    for (const sourceId of getAcceptancePredecessorIds(plan)) {
      const sourceNode = nodeMap.get(sourceId)
      if (!sourceNode) continue

      const edgeId = `${sourceId}->${plan.id}`
      const sourceDegree = (downstreamBySource[sourceId] || []).length + 1
      const targetDegree = (upstreamByTarget[plan.id] || []).length + 1

      edges.push({
        id: edgeId,
        sourceId,
        targetId: plan.id,
        source: getNodeCenter(sourceNode),
        target: getNodeCenter(targetNode),
        sourceDegree,
        targetDegree,
        parallelIndex: 0,
        parallelCount: 0,
      })

      ;(upstreamByTarget[plan.id] ||= []).push(sourceId)
      ;(downstreamBySource[sourceId] ||= []).push(plan.id)
    }
  }

  const parallelGroups = new Map<string, AcceptanceFlowRelationEdge[]>()
  for (const edge of edges) {
    const key = edge.sourceId
    const current = parallelGroups.get(key) || []
    current.push(edge)
    parallelGroups.set(key, current)
  }

  parallelGroups.forEach((group) => {
    group.forEach((edge, index) => {
      edge.parallelIndex = index
      edge.parallelCount = group.length
    })
  })

  return {
    edges,
    relatedIds: {},
    upstreamByTarget,
    downstreamBySource,
  }
}

export function getAcceptanceRelationFocus(
  graph: AcceptanceFlowRelationGraph,
  selectedNodeId: string | null | undefined,
) {
  if (!selectedNodeId) {
    return {
      upstream: new Set<string>(),
      downstream: new Set<string>(),
      related: new Set<string>(),
    }
  }

  const upstream = new Set<string>()
  const downstream = new Set<string>()

  const walkUp = (nodeId: string) => {
    for (const parent of graph.upstreamByTarget[nodeId] || []) {
      if (!upstream.has(parent)) {
        upstream.add(parent)
        walkUp(parent)
      }
    }
  }

  const walkDown = (nodeId: string) => {
    for (const child of graph.downstreamBySource[nodeId] || []) {
      if (!downstream.has(child)) {
        downstream.add(child)
        walkDown(child)
      }
    }
  }

  walkUp(selectedNodeId)
  walkDown(selectedNodeId)

  const related = new Set<string>([selectedNodeId, ...upstream, ...downstream])

  return { upstream, downstream, related }
}

export function getAcceptanceRelationState(
  graph: AcceptanceFlowRelationGraph,
  selectedNodeId: string | null | undefined,
  nodeId: string,
): AcceptanceFlowNodeRelationState {
  const focus = getAcceptanceRelationFocus(graph, selectedNodeId)
  const upstreamCount = graph.upstreamByTarget[nodeId]?.length || 0
  const downstreamCount = graph.downstreamBySource[nodeId]?.length || 0
  const isSelected = selectedNodeId === nodeId
  const isRelated = !selectedNodeId || focus.related.has(nodeId)

  return {
    isSelected,
    isRelated,
    isUpstream: focus.upstream.has(nodeId),
    isDownstream: focus.downstream.has(nodeId),
    isDimmed: Boolean(selectedNodeId) && !isRelated,
    upstreamCount,
    downstreamCount,
    hasFanIn: upstreamCount > 1,
    hasFanOut: downstreamCount > 1,
  }
}

export function getFlowBucketForScale(plannedDate: string | null | undefined, timeScale: AcceptanceTimelineScale): AcceptanceFlowTimeBucket {
  return getTimeBucket(plannedDate, timeScale)
}

function buildPhaseLanes(plans: AcceptancePlan[]): AcceptanceFlowPhaseLane[] {
  const phaseMap = new Map<string, AcceptanceFlowPhaseLane>()

  for (const plan of plans) {
    const meta = getAcceptancePhaseMeta(plan.phase_code)
    const laneId = meta.id
    if (!phaseMap.has(laneId)) {
      phaseMap.set(laneId, {
        id: laneId,
        name: meta.name,
        order: meta.order,
        plans: [],
      })
    }
    phaseMap.get(laneId)!.plans.push(plan)
  }

  return Array.from(phaseMap.values())
    .sort((a, b) => a.order - b.order)
    .map((lane) => ({
      ...lane,
      plans: [...lane.plans].sort(compareAcceptancePlansForLayout),
    }))
}

function buildLaneLayouts(lanes: AcceptanceFlowPhaseLane[], timeScale: AcceptanceTimelineScale): AcceptanceFlowLaneLayout[] {
  let top = FLOW_HEADER_HEIGHT

  return lanes.map((lane) => {
    const bucketCounts = new Map<string, number>()

    for (const plan of lane.plans) {
      const bucketKey = getTimeBucketKey(plan.planned_date, timeScale)
      bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) || 0) + 1)
    }

    const maxStackCount = Math.max(1, ...bucketCounts.values())
    const height = Math.max(
      220,
      FLOW_CARD_INSET_Y * 2 + FLOW_CARD_HEIGHT + Math.max(0, maxStackCount - 1) * FLOW_CARD_STEP,
    )
    const laneLayout = {
      laneId: lane.id,
      top,
      height,
      maxStackCount,
    }
    top += height
    return laneLayout
  })
}

function buildTimeBuckets(plans: AcceptancePlan[], timeScale: AcceptanceTimelineScale): AcceptanceFlowTimeBucket[] {
  const bucketMap = new Map<string, AcceptanceFlowTimeBucket>()
  let hasUnscheduled = false

  for (const plan of plans) {
    const bucket = getTimeBucket(plan.planned_date, timeScale)
    if (bucket.isUnscheduled) {
      hasUnscheduled = true
      continue
    }
    if (!bucketMap.has(bucket.key)) {
      bucketMap.set(bucket.key, bucket)
    }
  }

  const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => a.sortKey - b.sortKey)
  if (hasUnscheduled) {
    sortedBuckets.push(buildUnscheduledBucket())
  }

  return sortedBuckets
}

function buildPlacedNode(plan: AcceptancePlan, placement: AcceptanceFlowPlacement, laneTop: number): AcceptanceNode {
  const bucketX = FLOW_LANE_LABEL_WIDTH + placement.bucketIndex * FLOW_BUCKET_WIDTH + FLOW_CARD_INSET_X
  const stackOffset = placement.stackIndex * FLOW_CARD_STEP

  return {
    id: plan.id,
    acceptance_plan_id: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    planned_date: plan.planned_date,
    actual_date: plan.actual_date,
    result: undefined,
    documents: plan.documents,
    notes: undefined,
    accepted_by: undefined,
    accepted_at: undefined,
    sort_order: placement.stackIndex,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    x: bucketX,
    y: laneTop + FLOW_CARD_INSET_Y + stackOffset,
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    typeId: plan.type_id,
  }
}

function compareAcceptancePlansForLayout(left: AcceptancePlan, right: AcceptancePlan) {
  const leftOrder = left.phase_order ?? 0
  const rightOrder = right.phase_order ?? 0
  if (leftOrder !== rightOrder) return leftOrder - rightOrder

  const leftDate = left.planned_date || left.created_at || ''
  const rightDate = right.planned_date || right.created_at || ''
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)

  return left.id.localeCompare(right.id)
}

function getTimeBucket(plannedDate: string | null | undefined, timeScale: AcceptanceTimelineScale): AcceptanceFlowTimeBucket {
  if (!plannedDate) return buildUnscheduledBucket()

  const date = parseUtcDate(plannedDate)

  if (timeScale === 'month') {
    const key = `month:${formatMonthKey(date)}`
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    return {
      key,
      label: formatMonthKey(date),
      sortKey: monthStart,
      isUnscheduled: false,
    }
  }

  if (timeScale === 'biweek') {
    const day = date.getUTCDate()
    const periodStartDay = day <= 15 ? 1 : 16
    const periodStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), periodStartDay)
    return {
      key: `biweek:${formatMonthKey(date)}:${day <= 15 ? 'a' : 'b'}`,
      label: `${formatMonthKey(date)} ${day <= 15 ? '上旬' : '下旬'}`,
      sortKey: periodStart,
      isUnscheduled: false,
    }
  }

  const startOfWeek = getStartOfWeekUtc(date)
  const endOfWeek = addDaysUtc(startOfWeek, 6)
  return {
    key: `week:${formatIsoDate(startOfWeek)}`,
    label: `${formatShortMonthDay(startOfWeek)}-${formatShortMonthDay(endOfWeek)}`,
    sortKey: startOfWeek.getTime(),
    isUnscheduled: false,
  }
}

function buildUnscheduledBucket(): AcceptanceFlowTimeBucket {
  return {
    key: 'unscheduled',
    label: '待排期',
    sortKey: Number.MAX_SAFE_INTEGER,
    isUnscheduled: true,
  }
}

function parseUtcDate(date: string) {
  const [year, month, day] = date.split('-').map((value) => Number(value))
  return new Date(Date.UTC(year, month - 1, day))
}

function formatMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatShortMonthDay(date: Date) {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getStartOfWeekUtc(date: Date) {
  const day = date.getUTCDay() || 7
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() - day + 1)
  start.setUTCHours(0, 0, 0, 0)
  return start
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(date.getUTCDate() + days)
  return next
}

function getTimeBucketKey(plannedDate: string | null | undefined, timeScale: AcceptanceTimelineScale) {
  if (!plannedDate) return 'unscheduled'

  const date = parseUtcDate(plannedDate)

  if (timeScale === 'month') {
    return `month:${formatMonthKey(date)}`
  }

  if (timeScale === 'biweek') {
    return `biweek:${formatMonthKey(date)}:${date.getUTCDate() <= 15 ? 'a' : 'b'}`
  }

  return `week:${formatIsoDate(getStartOfWeekUtc(date))}`
}

function getNodeCenter(node: AcceptanceNode): AcceptanceFlowPoint {
  return {
    x: (node.x || 0) + FLOW_CARD_WIDTH / 2,
    y: (node.y || 0) + FLOW_CARD_HEIGHT / 2,
  }
}
