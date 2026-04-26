import React, { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CHART_SERIES } from '@/lib/chartPalette'
import { cn } from '@/lib/utils'
import { CheckSquare, ChevronDown, ChevronRight, GripVertical, Search, Square, X } from 'lucide-react'
import type { AcceptanceNode, AcceptancePlan, AcceptanceStatus, AcceptanceType } from '@/types/acceptance'
import { getAcceptanceDisplayBadges, ACCEPTANCE_STATUSES } from '@/types/acceptance'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { AcceptanceTimelineScale } from '../types'
import { formatTimelineMarker, getAcceptanceStatusMeta, getIcon, getTypeById } from '../utils'

type GroupMode = 'phase' | 'building' | 'specialty'

interface AcceptanceLedgerProps {
  plans: AcceptancePlan[]
  nodes: AcceptanceNode[]
  customTypes: AcceptanceType[]
  onNodeClick: (node: AcceptanceNode) => void
  onStatusChange?: (nodeId: string, status: AcceptanceStatus) => void
  onDateUpdate?: (planId: string, plannedDate: string) => void
  onReorder?: (planIds: string[]) => void
  onBatchStatusChange?: (planIds: string[], status: AcceptanceStatus) => void | Promise<void>
  onBatchDateUpdate?: (planIds: string[], plannedDate: string) => void | Promise<void>
  onBatchResponsibleUnitUpdate?: (planIds: string[], responsibleUnit: string) => void | Promise<void>
  onBatchPhaseUpdate?: (planIds: string[], phaseCode: string) => void | Promise<void>
  timeScale: AcceptanceTimelineScale
  canEdit?: boolean
}

// Sortable plan row wrapper
function SortablePlanRow({ planId, children }: { planId: string; children: (dragHandleProps: React.HTMLAttributes<HTMLButtonElement>, isDragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: planId })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>, isDragging)}
    </div>
  )
}

export default function AcceptanceLedger({ plans, nodes, customTypes, onNodeClick, onStatusChange, onDateUpdate, onReorder, onBatchStatusChange, onBatchDateUpdate, onBatchResponsibleUnitUpdate, onBatchPhaseUpdate, timeScale, canEdit = true }: AcceptanceLedgerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupMode, setGroupMode] = useState<GroupMode>('phase')
  const [orderedPlanIds, setOrderedPlanIds] = useState<string[]>(() => plans.map((p) => p.id))
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [batchStatus, setBatchStatus] = useState<AcceptanceStatus>('passed')
  const [batchDate, setBatchDate] = useState('')
  const [batchUnit, setBatchUnit] = useState('')
  const [batchPhase, setBatchPhase] = useState('preparation')
  const [batchActionLoading, setBatchActionLoading] = useState(false)
  const editable = canEdit !== false

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent, groupPlanIds: string[]) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groupPlanIds.indexOf(String(active.id))
    const newIndex = groupPlanIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...groupPlanIds]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, String(active.id))
    // Merge reordered group back into full ordered list
    const nextAll = [...orderedPlanIds]
    let cursor = 0
    for (let i = 0; i < nextAll.length; i++) {
      if (groupPlanIds.includes(nextAll[i])) {
        nextAll[i] = reordered[cursor++]
      }
    }
    setOrderedPlanIds(nextAll)
    onReorder?.(nextAll)
  }

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const groups = useMemo(() => {
    if (groupMode === 'building') {
      const map = new Map<string, { id: string; name: string; order: number; plans: AcceptancePlan[] }>()
      for (const plan of plans) {
        const key = plan.building_id || 'project'
        if (!map.has(key)) map.set(key, { id: key, name: key === 'project' ? '项目整体' : `楼栋 ${key}`, order: key === 'project' ? 0 : 1, plans: [] })
        map.get(key)!.plans.push(plan)
      }
      return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
    }

    if (groupMode === 'specialty') {
      const map = new Map<string, { id: string; name: string; order: number; plans: AcceptancePlan[] }>()
      for (const plan of plans) {
        const key = plan.scope_level || 'project'
        const LABELS: Record<string, string> = { project: '项目级', building: '楼栋', unit: '单体工程', specialty: '专项' }
        if (!map.has(key)) map.set(key, { id: key, name: LABELS[key] || key, order: Object.keys(LABELS).indexOf(key), plans: [] })
        map.get(key)!.plans.push(plan)
      }
      return Array.from(map.values()).sort((a, b) => a.order - b.order)
    }

    const phaseMap = new Map<string, { id: string; name: string; order: number; plans: AcceptancePlan[] }>()

    for (const plan of plans) {
      const phaseId = plan.phase_code || 'default'
      if (!phaseMap.has(phaseId)) {
        phaseMap.set(phaseId, {
          id: phaseId,
          name: phaseId === 'preparation'
            ? '准备阶段'
            : phaseId === 'special_acceptance'
              ? '专项验收'
              : phaseId === 'unit_completion'
                ? '单位工程验收'
                : phaseId === 'filing_archive'
                  ? '备案归档'
                  : phaseId === 'delivery_closeout'
                    ? '交付收口'
                    : phaseId === 'phase1'
            ? '第一阶段：预验收'
            : phaseId === 'phase2'
              ? '第二阶段：四方验收'
              : phaseId === 'phase3'
                ? '第三阶段：专项验收'
                : phaseId === 'phase4'
                  ? '第四阶段：竣工备案'
                  : '其他',
          order: phaseId === 'phase1' ? 1 : phaseId === 'phase2' ? 2 : phaseId === 'phase3' ? 3 : phaseId === 'phase4' ? 4 : 99,
          plans: [],
        })
      }
      phaseMap.get(phaseId)!.plans.push(plan)
    }

    return Array.from(phaseMap.values())
      .sort((a, b) => a.order - b.order)
      .map((phase) => ({
        ...phase,
        plans: phase.plans.sort((a, b) => {
          const ai = orderedPlanIds.indexOf(a.id)
          const bi = orderedPlanIds.indexOf(b.id)
          if (ai === -1 && bi === -1) return (a.phase_order || 0) - (b.phase_order || 0)
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        }),
      }))
  }, [plans, groupMode, orderedPlanIds])

  // Keep orderedPlanIds in sync when plans prop changes (new plans added)
  const planIdSet = useMemo(() => new Set(plans.map((p) => p.id)), [plans])
  const syncedOrderedIds = useMemo(() => {
    const existing = orderedPlanIds.filter((id) => planIdSet.has(id))
    const newIds = plans.filter((p) => !orderedPlanIds.includes(p.id)).map((p) => p.id)
    return [...existing, ...newIds]
  }, [orderedPlanIds, planIdSet, plans])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = searchQuery.toLowerCase()
    return groups
      .map((group) => ({
        ...group,
        plans: group.plans.filter((plan) => plan.name.toLowerCase().includes(q)),
      }))
      .filter((group) => group.plans.length > 0)
  }, [groups, searchQuery])

  const togglePlanSelection = (planId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  const selectAll = () => {
    const allVisible = filteredGroups.flatMap((g) => g.plans.map((p) => p.id))
    setSelectedPlanIds(new Set(allVisible))
  }

  const clearSelection = () => setSelectedPlanIds(new Set())

  async function handleBatchStatus() {
    if (!onBatchStatusChange || selectedPlanIds.size === 0) return
    setBatchActionLoading(true)
    try { await onBatchStatusChange([...selectedPlanIds], batchStatus) } finally { setBatchActionLoading(false) }
  }

  async function handleBatchDate() {
    if (!onBatchDateUpdate || selectedPlanIds.size === 0 || !batchDate) return
    setBatchActionLoading(true)
    try { await onBatchDateUpdate([...selectedPlanIds], batchDate) } finally { setBatchActionLoading(false) }
  }

  async function handleBatchUnit() {
    if (!onBatchResponsibleUnitUpdate || selectedPlanIds.size === 0 || !batchUnit.trim()) return
    setBatchActionLoading(true)
    try { await onBatchResponsibleUnitUpdate([...selectedPlanIds], batchUnit.trim()) } finally { setBatchActionLoading(false) }
  }

  async function handleBatchPhase() {
    if (!onBatchPhaseUpdate || selectedPlanIds.size === 0) return
    setBatchActionLoading(true)
    try { await onBatchPhaseUpdate([...selectedPlanIds], batchPhase) } finally { setBatchActionLoading(false) }
  }

  const STATUS_LABELS: Record<AcceptanceStatus, string> = {
    draft: '草稿', preparing: '准备中', ready_to_submit: '待申报', submitted: '已申报',
    inspecting: '验收中', rectifying: '整改中', passed: '已通过', archived: '已归档',
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索验收节点名称..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none"
          data-testid="acceptance-ledger-search"
        />
      </div>
      <div className="flex items-center gap-2 text-xs" data-testid="acceptance-group-mode">
        <span className="text-slate-500">分组方式：</span>
        {(['phase', 'building', 'specialty'] as GroupMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => { setGroupMode(mode); setCollapsedGroups(new Set()) }}
            className={cn(
              'rounded-full px-3 py-1 font-medium transition-colors',
              groupMode === mode
                ? 'bg-blue-100 text-blue-700'
                : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            {{ phase: '按阶段', building: '按楼栋', specialty: '按范围层级' }[mode]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={selectAll} disabled={!editable} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" data-testid="acceptance-select-all">
            <CheckSquare className="h-3.5 w-3.5" />全选
          </button>
          {selectedPlanIds.size > 0 && (
            <button type="button" onClick={clearSelection} disabled={!editable} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" data-testid="acceptance-clear-selection">
              <X className="h-3.5 w-3.5" />清除({selectedPlanIds.size})
            </button>
          )}
        </div>
      </div>

      {selectedPlanIds.size > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3" data-testid="acceptance-batch-toolbar">
          <div className="mb-2 text-xs font-medium text-blue-800">已选 {selectedPlanIds.size} 项 — 批量操作：</div>
          <div className="flex flex-wrap items-center gap-3">
            {onBatchStatusChange && (
              <div className="flex items-center gap-2">
                <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value as AcceptanceStatus)} disabled={!editable} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm">
                  {ACCEPTANCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={!editable || batchActionLoading} onClick={() => void handleBatchStatus()} data-testid="acceptance-batch-status-apply">批量改状态</Button>
              </div>
            )}
            {onBatchDateUpdate && (
              <div className="flex items-center gap-2">
                <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} disabled={!editable} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50" />
                <Button size="sm" variant="outline" disabled={!editable || batchActionLoading || !batchDate} onClick={() => void handleBatchDate()} data-testid="acceptance-batch-date-apply">批量改日期</Button>
              </div>
            )}
            {onBatchResponsibleUnitUpdate && (
              <div className="flex items-center gap-2">
                <input value={batchUnit} onChange={(e) => setBatchUnit(e.target.value)} disabled={!editable} placeholder="责任单位" className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50" />
                <Button size="sm" variant="outline" disabled={!editable || batchActionLoading || !batchUnit.trim()} onClick={() => void handleBatchUnit()} data-testid="acceptance-batch-unit-apply">批量改责任单位</Button>
              </div>
            )}
            {onBatchPhaseUpdate && (
              <div className="flex items-center gap-2">
                <select value={batchPhase} onChange={(e) => setBatchPhase(e.target.value)} disabled={!editable} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-sm">
                  <option value="preparation">准备阶段</option>
                  <option value="special_acceptance">专项验收</option>
                  <option value="unit_completion">单位工程验收</option>
                  <option value="completion_acceptance">竣工验收</option>
                </select>
                <Button size="sm" variant="outline" disabled={!editable || batchActionLoading} onClick={() => void handleBatchPhase()} data-testid="acceptance-batch-phase-apply">批量调整阶段</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {filteredGroups.map((group) => (
        <Card key={group.id}>
          <CardContent className="p-0">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-5 py-4 text-left hover:bg-slate-50"
              data-testid={`acceptance-group-header-${group.id}`}
            >
              <div>
                <div className="text-sm font-medium text-slate-900">{group.name}</div>
                <div className="text-xs text-slate-500">共 {group.plans.length} 项</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{group.plans.length}</Badge>
                {collapsedGroups.has(group.id) ? (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </button>

            {!collapsedGroups.has(group.id) && (
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleDragEnd(event, group.plans.map((p) => p.id))}
            >
              <SortableContext items={group.plans.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-slate-100">
              {group.plans.map((plan) => {
                const node = nodes.find((item) => item.id === plan.id)
                const type = getTypeById(plan.type_id, customTypes)
                const statusMeta = getAcceptanceStatusMeta(plan.status)
                const StatusIcon = getIcon(statusMeta.config.icon)
                const hasPlannedDate = Boolean(plan.planned_date)
                const overlayBadges = getAcceptanceDisplayBadges(plan)

                return (
                  <SortablePlanRow key={plan.id} planId={plan.id}>
                    {(dragHandleProps, isDragging) => (
                  <div
                    role="button"
                    tabIndex={node ? 0 : -1}
                    onClick={() => node && onNodeClick(node)}
                    onKeyDown={(event) => {
                      if (!node) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onNodeClick(node)
                      }
                    }}
                    data-testid={`acceptance-list-row-${plan.id}`}
                    className={cn(
                      'flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50',
                      node && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                      !hasPlannedDate && 'bg-amber-50/30',
                      isDragging && 'shadow-lg ring-1 ring-blue-300',
                      selectedPlanIds.has(plan.id) && 'bg-blue-50/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => togglePlanSelection(plan.id, e)}
                      className="mr-1 flex-shrink-0 text-slate-400 hover:text-blue-600"
                      title="选择"
                      data-testid={`acceptance-select-${plan.id}`}
                    >
                      {selectedPlanIds.has(plan.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      {...dragHandleProps}
                      onClick={(e) => e.stopPropagation()}
                      className="mr-1 flex-shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                      title="拖拽排序"
                      data-testid={`acceptance-drag-handle-${plan.id}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: type?.color || CHART_SERIES.primary }}>
                        <span className="text-lg">{type?.icon || '验'}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{plan.name}</div>
                        <div className="truncate text-sm text-slate-500">
                          {type?.name || plan.type_id} · {formatTimelineMarker(plan.planned_date, timeScale)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-20 flex-shrink-0 text-center">
                        <div className="text-[10px] text-slate-400">责任单位</div>
                        <div className="mt-0.5 truncate text-xs font-medium text-slate-700" title={plan.responsible_unit || plan.responsible_user_id || ''}>
                          {plan.responsible_unit || (plan.responsible_user_id ? plan.responsible_user_id.slice(-6) : '—')}
                        </div>
                      </div>
                      <div className="w-20 flex-shrink-0 text-center">
                        <div className="text-[10px] text-slate-400">并行组</div>
                        <div className="mt-0.5 text-xs font-medium text-slate-700">
                          {plan.parallel_group_id ? (
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">{plan.parallel_group_id.slice(-4)}</span>
                          ) : '—'}
                        </div>
                      </div>
                      <div className="w-16 flex-shrink-0 text-center">
                        <div className="text-[10px] text-slate-400">阻塞数</div>
                        <div className="mt-0.5 text-xs font-medium">
                          {plan.is_blocked ? (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">{plan.predecessor_plan_ids?.length || 1}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn('gap-1.5', statusMeta.config.bg, statusMeta.config.textColor, statusMeta.config.borderColor)}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusMeta.label}
                      </Badge>
                      <Badge variant="outline" className={cn('rounded-full px-3 py-1', hasPlannedDate ? 'border-slate-200 text-slate-500' : 'border-amber-300 bg-amber-50 text-amber-700')}>
                        {hasPlannedDate ? '已排期' : '待排期'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('rounded-full px-3 py-1', plan.is_custom ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-slate-50 text-slate-500')}
                      >
                        {plan.is_custom ? '自定义项' : '系统项'}
                      </Badge>
                      {plan.scope_level && (
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-500">
                          {{ project: '项目级', building: '楼栋', unit: '单体', specialty: '专项' }[plan.scope_level] || plan.scope_level}
                        </Badge>
                      )}
                      {plan.building_id && (
                        <Badge variant="outline" className="rounded-full border-sky-100 bg-sky-50 px-3 py-1 text-sky-700">
                          {plan.building_id}
                        </Badge>
                      )}
                      {plan.actual_date && (
                        <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          实际 {plan.actual_date}
                        </Badge>
                      )}
                      {plan.predecessor_plan_ids?.length > 0 && (
                        <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                          前置 {plan.predecessor_plan_ids.length}
                        </Badge>
                      )}
                      {plan.phase_code && (
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-500 text-[10px]">
                          {plan.phase_code}
                        </Badge>
                      )}
                      {overlayBadges.filter((b) => b !== '自定义').slice(0, 2).map((badge) => (
                        <Badge
                          key={badge}
                          variant="outline"
                          className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
                        >
                          {badge}
                        </Badge>
                      ))}
                      {editable && onStatusChange && node && !['passed', 'archived'].includes(plan.status) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onStatusChange(node.id, 'passed') }}
                          disabled={!editable}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                          data-testid={`acceptance-quick-pass-${plan.id}`}
                        >
                          标记通过
                        </button>
                      )}
                      {!hasPlannedDate && editable && onDateUpdate && (
                        <input
                          type="date"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { if (e.target.value) onDateUpdate(plan.id, e.target.value) }}
                          disabled={!editable}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 focus:border-amber-400 focus:outline-none"
                          data-testid={`acceptance-quick-date-${plan.id}`}
                          title="快速排期"
                        />
                      )}
                      </div>
                    </div>
                  </div>
                    )}
                  </SortablePlanRow>
                )
              })}
              </div>
              </SortableContext>
            </DndContext>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
