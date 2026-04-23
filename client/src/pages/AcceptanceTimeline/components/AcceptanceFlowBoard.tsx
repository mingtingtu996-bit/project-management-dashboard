import React from 'react'
import { useMemo } from 'react'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Network, SplitSquareVertical, Route, Shuffle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AcceptancePlan, AcceptanceType } from '@/types/acceptance'

import type { AcceptanceFlowLayout } from '../utils/layout'
import {
  buildAcceptanceFlowRelations,
  getAcceptanceRelationFocus,
  getAcceptanceRelationState,
  FLOW_BUCKET_WIDTH,
  FLOW_HEADER_HEIGHT,
  FLOW_LANE_LABEL_WIDTH,
} from '../utils/layout'
import AcceptanceFlowConnectors from './AcceptanceFlowConnectors'
import AcceptanceFlowNode from './AcceptanceFlowNode'

interface AcceptanceFlowBoardProps {
  layout: AcceptanceFlowLayout
  plans: AcceptancePlan[]
  customTypes: AcceptanceType[]
  selectedNodeId?: string | null
  onNodeClick: (node: AcceptanceFlowLayout['nodes'][number]) => void
  onNodeDragEnd?: (planId: string, dx: number, dy: number) => void
}

export default function AcceptanceFlowBoard({
  layout,
  plans,
  customTypes,
  selectedNodeId,
  onNodeClick,
  onNodeDragEnd,
}: AcceptanceFlowBoardProps) {
  const planLookup = useMemo(() => new Map(plans.map((item) => [item.id, item])), [plans])
  const laneLookup = useMemo(() => new Map(layout.lanes.map((lane) => [lane.id, lane])), [layout.lanes])
  const graph = useMemo(() => buildAcceptanceFlowRelations(plans, layout), [plans, layout])
  const focus = useMemo(() => getAcceptanceRelationFocus(graph, selectedNodeId), [graph, selectedNodeId])
  const relationStateLookup = useMemo(
    () =>
      new Map(
        layout.nodes.map((node) => [
          node.id,
          getAcceptanceRelationState(graph, selectedNodeId, node.id),
        ]),
      ),
    [graph, layout.nodes, selectedNodeId],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDndEnd(event: DragEndEvent) {
    if (!onNodeDragEnd) return
    const { active, delta } = event
    if (active && delta) {
      onNodeDragEnd(String(active.id), delta.x, delta.y)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDndEnd}>
    <div className="space-y-4" data-testid="acceptance-flow-board">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">流程板</div>
          <div className="text-xs text-slate-500">
            阶段泳道 + 时间桶 + 依赖连线。节点只负责看结构，关系表达由连线和高亮承担。
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <Badge variant="outline">{layout.lanes.length} 个阶段</Badge>
          <Badge variant="outline">{layout.buckets.length} 个时间桶</Badge>
          <Badge variant="outline">{graph.edges.length} 条依赖</Badge>
          {selectedNodeId ? <Badge variant="outline">{Math.max(0, focus.related.size - 1)} 个关联节点</Badge> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <Badge variant="outline" className="gap-1.5 rounded-full bg-white">
            <Network className="h-3.5 w-3.5" />
            依赖连线
          </Badge>
          <Badge variant="outline" className="gap-1.5 rounded-full bg-white">
            <Route className="h-3.5 w-3.5" />
            上游 / 下游 高亮
          </Badge>
          <Badge variant="outline" className="gap-1.5 rounded-full bg-white">
            <Shuffle className="h-3.5 w-3.5" />
            分叉 / 汇合
          </Badge>
          <Badge variant="outline" className="gap-1.5 rounded-full bg-white">
            <SplitSquareVertical className="h-3.5 w-3.5" />
            时间桶真实影响布局
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <div
            className="relative"
            data-testid="acceptance-flow-canvas"
            style={{
              width: layout.canvasWidth,
              minHeight: layout.canvasHeight,
            }}
          >
            {layout.laneLayouts.map((laneLayout, index) => {
              const lane = laneLookup.get(laneLayout.laneId)
              if (!lane) return null

              return (
                <div
                  key={laneLayout.laneId}
                  className={cn(
                    'absolute left-0 right-0 border-b border-slate-100',
                    index % 2 === 0 ? 'bg-slate-50/30' : 'bg-white',
                    selectedNodeId && focus.related.size > 0 && lane.plans.some((plan) => focus.related.has(plan.id)) && 'bg-blue-50/30',
                  )}
                  style={{
                    top: laneLayout.top,
                    height: laneLayout.height,
                  }}
                />
              )
            })}

            <div
              className="absolute left-0 top-0 z-20 flex h-[76px] w-full border-b border-slate-100 bg-white/95 backdrop-blur"
              style={{ height: FLOW_HEADER_HEIGHT }}
            >
              <div
                className="flex h-full items-center border-r border-slate-100 bg-slate-50 px-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
                style={{ width: FLOW_LANE_LABEL_WIDTH }}
              >
                阶段 / 时间
              </div>
              {layout.buckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className={cn(
                    'flex h-full items-center justify-between gap-2 border-r border-slate-100 px-4 text-sm font-medium',
                    bucket.isUnscheduled ? 'bg-amber-50 text-amber-800' : 'bg-white text-slate-900',
                  )}
                  style={{ width: FLOW_BUCKET_WIDTH }}
                  data-testid={`acceptance-flow-bucket-${bucket.key}`}
                >
                  <span className="truncate">{bucket.label}</span>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                    {bucket.isUnscheduled ? '待排期' : '已排期'}
                  </Badge>
                </div>
              ))}
            </div>

            {layout.laneLayouts.map((laneLayout) => {
              const lane = laneLookup.get(laneLayout.laneId)
              if (!lane) return null

              return (
                <div
                  key={laneLayout.laneId}
                  className="absolute left-0 z-10 border-r border-slate-100 bg-white/95 px-4 py-4 backdrop-blur"
                  style={{
                    top: laneLayout.top,
                    width: FLOW_LANE_LABEL_WIDTH,
                    height: laneLayout.height,
                  }}
                >
                  <div className="text-sm font-semibold text-slate-900">{lane.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    阶段内 {lane.plans.length} 项 · {laneLayout.maxStackCount} 层
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="outline" className="rounded-full px-2 py-0.5">
                      {lane.order}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-2 py-0.5">
                      {lane.plans.some((plan) => plan.planned_date) ? '有计划' : '待排期'}
                    </Badge>
                  </div>
                </div>
              )
            })}

            <AcceptanceFlowConnectors layout={layout} graph={graph} selectedNodeId={selectedNodeId} />

            {layout.nodes.map((node) => {
              const plan = planLookup.get(node.id)
              if (!plan) return null

              const relation = relationStateLookup.get(node.id)
              if (!relation) return null

              return (
                <AcceptanceFlowNode
                  key={node.id}
                  plan={plan}
                  node={node}
                  allPlans={plans}
                  customTypes={customTypes}
                  bucketLabel={layout.placements[node.id]?.bucketLabel || '未排期'}
                  relation={relation}
                  onClick={() => onNodeClick(node)}
                  onDragEnd={onNodeDragEnd}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
    </DndContext>
  )
}
