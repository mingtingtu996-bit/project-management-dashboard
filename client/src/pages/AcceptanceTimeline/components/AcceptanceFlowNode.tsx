import React, { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { AlertCircle, ArrowDown, ArrowUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AcceptanceNode, AcceptancePlan, AcceptanceType } from '@/types/acceptance'
import { getAcceptanceDisplayBadges, getAcceptancePredecessorIds, isAcceptanceBlocked, normalizeAcceptanceStatus } from '@/types/acceptance'

import { getAcceptanceStatusMeta, getIcon, getTypeById } from '../utils'
import type { AcceptanceFlowNodeRelationState } from '../utils/layout'
import { FLOW_CARD_HEIGHT, FLOW_CARD_WIDTH } from '../utils/layout'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface AcceptanceFlowNodeProps {
  plan: AcceptancePlan
  node: AcceptanceNode
  customTypes: AcceptanceType[]
  allPlans: AcceptancePlan[]
  bucketLabel: string
  relation: AcceptanceFlowNodeRelationState
  onClick: () => void
  onDragEnd?: (planId: string, dx: number, dy: number) => void
}

export default function AcceptanceFlowNode({
  plan,
  node,
  customTypes,
  allPlans,
  bucketLabel,
  relation,
  onClick,
  onDragEnd,
}: AcceptanceFlowNodeProps) {
  const type = getTypeById(plan.type_id, customTypes)
  const statusMeta = getAcceptanceStatusMeta(plan.status)
  const StatusIcon = getIcon(statusMeta.config.icon)
  const flowNodeState = getFlowNodeState(plan.status)
  const isBlocked = isAcceptanceBlocked(plan, allPlans)
  const hasPlannedDate = Boolean(plan.planned_date)
  const overlayBadges = getAcceptanceDisplayBadges(plan)
  const upstreamNames = getAcceptancePredecessorIds(plan).map((dependsOnId) => allPlans.find((item) => item.id === dependsOnId)?.name || dependsOnId)

  const [snapping, setSnapping] = useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: plan.id,
    disabled: !onDragEnd,
  })

  const dx = transform?.x ?? 0
  const dy = transform?.y ?? 0

  const handleDragEndCallback = React.useCallback(
    (completedDx: number, completedDy: number) => {
      if (onDragEnd) {
        onDragEnd(plan.id, completedDx, completedDy)
        setSnapping(true)
        setTimeout(() => setSnapping(false), 300)
      }
    },
    [onDragEnd, plan.id],
  )

  // expose to DndContext via data attribute for parent to call
  void handleDragEndCallback

  return (
    <Button variant="ghost"
      ref={setNodeRef}
      type="button"
      onClick={isDragging ? undefined : onClick}
      data-testid={`acceptance-flow-card-${plan.id}`}
      data-selected={relation.isSelected}
      data-related={relation.isRelated}
      data-upstream={relation.isUpstream}
      data-downstream={relation.isDownstream}
      data-dimmed={relation.isDimmed}
      data-fan-in={relation.hasFanIn}
      data-fan-out={relation.hasFanOut}
      className={cn(
        'absolute z-10 cursor-pointer overflow-hidden whitespace-normal rounded-xl border p-4 text-left',
        'shadow-sm hover:-translate-y-0.5 hover:shadow-[var(--el-2)]',
        flowNodeState.surfaceClass,
        isDragging ? 'z-30 cursor-grabbing shadow-xl ring-2 ring-blue-300' : onDragEnd ? 'cursor-grab' : 'cursor-pointer',
        snapping && 'transition-all duration-300 ease-out',
        !isDragging && !snapping && 'transition-shadow',
        relation.isSelected && 'border-blue-400 bg-blue-50/90 shadow-md ring-2 ring-blue-200',
        !relation.isSelected && relation.isUpstream && 'border-blue-300 bg-blue-50/90',
        !relation.isSelected && relation.isDownstream && 'border-slate-300 bg-slate-50/90',
        !relation.isSelected && !relation.isRelated && relation.isDimmed && 'opacity-35 grayscale-[0.15]',
        !hasPlannedDate && 'empty-state-frame border-slate-300 bg-slate-50/80',
        isBlocked && 'ring-2 ring-blue-100',
      )}
      style={{
        left: (node.x ?? 0) + dx,
        top: (node.y ?? 0) + dy,
        width: FLOW_CARD_WIDTH,
        height: FLOW_CARD_HEIGHT,
      }}
      {...(onDragEnd ? listeners : {})}
      {...attributes}
    >
      <span aria-hidden className={cn('pointer-events-none absolute left-0 top-0 h-full w-1 rounded-l-xl', flowNodeState.barClass)} />
      {relation.hasFanIn && (
        <Tooltip>
  <TooltipTrigger asChild>
    <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-1.5 rounded-l-xl bg-blue-600/70"
          
        />
  </TooltipTrigger>
  <TooltipContent>{`汇合节点：${relation.upstreamCount} 条上游`}</TooltipContent>
</Tooltip>
      )}
      {relation.hasFanOut && (
        <Tooltip>
  <TooltipTrigger asChild>
    <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-full w-1.5 rounded-r-xl bg-slate-400/70"
          
        />
  </TooltipTrigger>
  <TooltipContent>{`分叉节点：${relation.downstreamCount} 条下游`}</TooltipContent>
</Tooltip>
      )}
      <div className="flex h-full min-w-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{plan.name}</div>
            <div className="mt-1 truncate text-xs text-slate-500">
              {type?.name || plan.type_id} · {bucketLabel}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="outline" className={cn('gap-1.5', statusMeta.config.bg, statusMeta.config.textColor, statusMeta.config.borderColor)}>
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </Badge>
            {!hasPlannedDate && (
              <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                待排期
              </Badge>
            )}
            {isBlocked && (
              <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-100 text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                阻塞
              </Badge>
            )}
            {overlayBadges
              .filter((badge) => badge !== '受阻')
              .slice(0, 2)
              .map((badge) => (
                <Badge key={badge} variant="outline" className="gap-1.5 border-slate-200 bg-slate-50 text-slate-700">
                  {badge}
                </Badge>
              ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Card className="rounded-xl bg-white/80 px-3 py-2">
            <div className="text-slate-500">上游依赖</div>
            <div className="mt-1 text-slate-700">
              {upstreamNames.length > 0 ? upstreamNames.slice(0, 2).join(' / ') : '无依赖'}
              {upstreamNames.length > 2 ? ` / +${upstreamNames.length - 2}` : ''}
            </div>
          </Card>
          <Card className="rounded-xl bg-white/80 px-3 py-2">
            <div className="text-slate-500">关系态</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-slate-700">
              {relation.isSelected ? (
                <Badge variant="secondary" className="rounded-full bg-blue-100 text-blue-700">
                  当前
                </Badge>
              ) : relation.isUpstream ? (
                <Badge variant="secondary" className="rounded-full bg-amber-100 text-amber-700">
                  <ArrowUp className="mr-1 h-3.5 w-3.5" />
                  上游 {relation.upstreamCount}
                </Badge>
              ) : relation.isDownstream ? (
                <Badge variant="secondary" className="rounded-full bg-sky-100 text-sky-700">
                  <ArrowDown className="mr-1 h-3.5 w-3.5" />
                  下游 {relation.downstreamCount}
                </Badge>
              ) : relation.isRelated ? (
                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-600">
                  相关
                </Badge>
              ) : (
                <span>非关联</span>
              )}
            </div>
          </Card>
        </div>

        <Card className="rounded-xl bg-white/80 px-3 py-2 text-xs">
          <div className="text-slate-500">Overlay 标签</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-slate-700">
            {overlayBadges.length > 0 ? overlayBadges.map((badge) => (
              <Badge key={badge} variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                {badge}
              </Badge>
            )) : <span>无叠加标记</span>}
          </div>
        </Card>

        <div className="mt-auto flex flex-wrap gap-1.5">
          <span className={cn('rounded-full px-2 py-1 text-xs', hasPlannedDate ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700')}>
            时间尺度 · {bucketLabel}
          </span>
          {plan.scope_level ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
              范围 · {plan.scope_level}
            </span>
          ) : null}
          {plan.requirement_ready_percent != null ? (
            <span className={cn('rounded-full px-2 py-1 text-xs', plan.requirement_ready_percent >= 80 ? 'bg-emerald-100 text-emerald-700' : plan.requirement_ready_percent >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              准备度 {plan.requirement_ready_percent}%
            </span>
          ) : null}
          {relation.hasFanIn && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              <ArrowDown className="h-3.5 w-3.5" />
              汇合 {relation.upstreamCount}
            </span>
          )}
          {relation.hasFanOut && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800">
              <ArrowUp className="h-3.5 w-3.5" />
              分叉 {relation.downstreamCount}
            </span>
          )}
        </div>
      </div>
    </Button>
  )
}

function getFlowNodeState(status: string) {
  const normalizedStatus = normalizeAcceptanceStatus(status)

  if (normalizedStatus === 'passed' || normalizedStatus === 'archived') {
    return {
      barClass: 'bg-emerald-500',
      surfaceClass: 'border-emerald-200 bg-emerald-50/90',
    }
  }

  if (['preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying'].includes(normalizedStatus)) {
    return {
      barClass: 'bg-blue-600',
      surfaceClass: 'border-blue-200 bg-blue-50/90',
    }
  }

  return {
    barClass: 'bg-slate-200',
    surfaceClass: 'border-slate-200 bg-slate-50/90',
  }
}
