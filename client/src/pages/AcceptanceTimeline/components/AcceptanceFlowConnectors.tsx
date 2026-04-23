import React from 'react'

import { useMemo } from 'react'
import { CHART_AXIS_COLORS } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'

import type {
  AcceptanceFlowLayout,
  AcceptanceFlowRelationEdge,
  AcceptanceFlowRelationGraph,
} from '../utils/layout'

const EDGE_SPREAD = 10
const EDGE_BEND_MIN = 72
const EDGE_BEND_MAX = 180

interface AcceptanceFlowConnectorsProps {
  layout: AcceptanceFlowLayout
  graph: AcceptanceFlowRelationGraph
  selectedNodeId?: string | null
}

export default function AcceptanceFlowConnectors({
  layout,
  graph,
  selectedNodeId,
}: AcceptanceFlowConnectorsProps) {
  const outgoingBySource = useMemo(() => groupEdgesBySource(graph.edges), [graph.edges])
  const incomingByTarget = useMemo(() => groupEdgesByTarget(graph.edges), [graph.edges])
  const focus = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    return new Set([
      selectedNodeId,
      ...(graph.upstreamByTarget[selectedNodeId] || []),
      ...(graph.downstreamBySource[selectedNodeId] || []),
    ])
  }, [graph.downstreamBySource, graph.upstreamByTarget, selectedNodeId])

  // Fork nodes: one source → multiple targets
  const forkNodeIds = useMemo(
    () => new Set(Object.entries(graph.downstreamBySource).filter(([, targets]) => targets.length > 1).map(([id]) => id)),
    [graph.downstreamBySource],
  )
  // Merge nodes: multiple sources → one target
  const mergeNodeIds = useMemo(
    () => new Set(Object.entries(graph.upstreamByTarget).filter(([, sources]) => sources.length > 1).map(([id]) => id)),
    [graph.upstreamByTarget],
  )

  // Get layout node positions for fork/merge badge rendering
  const nodePositionMap = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])),
    [layout.nodes],
  )

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-visible"
      data-testid="acceptance-flow-connectors"
      viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="acceptance-flow-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={CHART_AXIS_COLORS.axisText} />
        </marker>
        <marker
          id="acceptance-flow-arrow-blue"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#3b82f6" />
        </marker>
      </defs>

      {graph.edges.map((edge) => {
        const sourceGroup = outgoingBySource.get(edge.sourceId) || []
        const targetGroup = incomingByTarget.get(edge.targetId) || []
        const sourceIndex = sourceGroup.findIndex((item) => item.id === edge.id)
        const targetIndex = targetGroup.findIndex((item) => item.id === edge.id)
        const sourceOffset = (sourceIndex - (sourceGroup.length - 1) / 2) * EDGE_SPREAD
        const targetOffset = (targetIndex - (targetGroup.length - 1) / 2) * EDGE_SPREAD
        const path = buildConnectorPath(edge, sourceOffset, targetOffset)
        const isSelectedEdge = selectedNodeId ? selectedNodeId === edge.sourceId || selectedNodeId === edge.targetId : false
        const isRelatedEdge = !selectedNodeId || focus.has(edge.sourceId) || focus.has(edge.targetId)

        return (
          <path
            key={edge.id}
            d={path}
            markerEnd={isSelectedEdge ? 'url(#acceptance-flow-arrow-blue)' : 'url(#acceptance-flow-arrow)'}
            data-testid={`acceptance-flow-edge-${edge.id}`}
            className={cn(
              'fill-none stroke-[2.5] transition-opacity',
              isSelectedEdge ? 'stroke-blue-500 opacity-100' : isRelatedEdge ? 'stroke-slate-400 opacity-90' : 'stroke-slate-200 opacity-25',
              edge.parallelCount > 1 && 'stroke-dashed',
            )}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}

      {/* Fork indicators: diamond at source node position */}
      {Array.from(forkNodeIds).map((nodeId) => {
        const pos = nodePositionMap.get(nodeId)
        if (!pos) return null
        const cx = pos.x + 12
        const cy = pos.y
        const isFocused = focus.has(nodeId) || nodeId === selectedNodeId
        return (
          <g key={`fork-${nodeId}`} data-testid={`acceptance-fork-indicator-${nodeId}`}>
            <polygon
              points={`${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`}
              fill={isFocused ? '#3b82f6' : '#94a3b8'}
              opacity={isFocused ? 0.95 : 0.55}
            />
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="8" fill={isFocused ? '#3b82f6' : '#64748b'} fontWeight="600">
              分叉
            </text>
          </g>
        )
      })}

      {/* Merge indicators: circle at target node position */}
      {Array.from(mergeNodeIds).map((nodeId) => {
        const pos = nodePositionMap.get(nodeId)
        if (!pos) return null
        const cx = pos.x - 12
        const cy = pos.y
        const isFocused = focus.has(nodeId) || nodeId === selectedNodeId
        return (
          <g key={`merge-${nodeId}`} data-testid={`acceptance-merge-indicator-${nodeId}`}>
            <circle
              cx={cx}
              cy={cy}
              r={8}
              fill={isFocused ? '#8b5cf6' : '#cbd5e1'}
              opacity={isFocused ? 0.95 : 0.55}
            />
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="8" fill={isFocused ? '#7c3aed' : '#64748b'} fontWeight="600">
              汇合
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function buildConnectorPath(edge: AcceptanceFlowRelationEdge, sourceOffset: number, targetOffset: number) {
  const sourceX = edge.source.x
  const sourceY = edge.source.y + sourceOffset
  const targetX = edge.target.x
  const targetY = edge.target.y + targetOffset
  const deltaX = targetX - sourceX
  const bendDistance = clamp(Math.abs(deltaX) * 0.45, EDGE_BEND_MIN, EDGE_BEND_MAX)
  const bendX = sourceX + Math.sign(deltaX || 1) * bendDistance

  return `M ${sourceX} ${sourceY} C ${bendX} ${sourceY}, ${bendX} ${targetY}, ${targetX} ${targetY}`
}

function groupEdgesBySource(edges: AcceptanceFlowRelationEdge[]) {
  const groups = new Map<string, AcceptanceFlowRelationEdge[]>()

  for (const edge of edges) {
    const current = groups.get(edge.sourceId) || []
    current.push(edge)
    groups.set(edge.sourceId, current)
  }

  groups.forEach((group) => {
    group.sort((left, right) => left.target.y - right.target.y || left.target.x - right.target.x || left.id.localeCompare(right.id))
  })

  return groups
}

function groupEdgesByTarget(edges: AcceptanceFlowRelationEdge[]) {
  const groups = new Map<string, AcceptanceFlowRelationEdge[]>()

  for (const edge of edges) {
    const current = groups.get(edge.targetId) || []
    current.push(edge)
    groups.set(edge.targetId, current)
  }

  groups.forEach((group) => {
    group.sort((left, right) => left.source.y - right.source.y || left.source.x - right.source.x || left.id.localeCompare(right.id))
  })

  return groups
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
