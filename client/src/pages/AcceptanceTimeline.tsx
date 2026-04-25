import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, List, Network, Palette, Plus } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { useToast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { CHART_PALETTE } from '@/lib/chartPalette'
import { acceptanceApi } from '@/services/acceptanceApi'
import type { AcceptanceNode, AcceptancePlan, AcceptancePlanRelationBundle, AcceptanceStatus, AcceptanceType } from '@/types/acceptance'
import { DEFAULT_ACCEPTANCE_TYPES, groupAcceptanceByPhase, isAcceptanceBlocked, normalizeAcceptanceStatus, summarizeAcceptancePlans } from '@/types/acceptance'

import AcceptanceDetailDrawer from './AcceptanceTimeline/components/AcceptanceDetailDrawer'
import AcceptanceFlowBoard from './AcceptanceTimeline/components/AcceptanceFlowBoard'
import AcceptanceLedger from './AcceptanceTimeline/components/AcceptanceLedger'
import type { AcceptanceTimelineScale, AcceptanceTimelineViewMode } from './AcceptanceTimeline/types'
import { buildAcceptanceFlowLayout } from './AcceptanceTimeline/utils/layout'

const PLAN_PRESETS = ['地基与基础验收', '主体结构验收', '节能验收', '消防验收', '规划验收', '人防验收', '电梯验收', '防雷验收', '竣工验收备案']
const NAME_TO_TYPE: Record<string, string> = {
  地基与基础验收: 'pre_acceptance',
  主体结构验收: 'four_party',
  节能验收: 'four_party',
  消防验收: 'fire',
  规划验收: 'planning',
  人防验收: 'civil_defense',
  电梯验收: 'elevator',
  防雷验收: 'lightning',
  竣工验收备案: 'completion_record',
}
const ACCEPTANCE_STATUS_OPTIONS: AcceptanceStatus[] = ['draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived']
const ACCEPTANCE_STATUS_LABELS: Record<AcceptanceStatus, string> = {
  draft: '草稿',
  preparing: '准备中',
  ready_to_submit: '待申报',
  submitted: '已申报',
  inspecting: '验收中',
  rectifying: '整改中',
  passed: '已通过',
  archived: '已归档',
}
const SCOPE_LEVEL_ORDER = ['project', 'building', 'unit', 'specialty'] as const
const SCOPE_LEVEL_LABELS: Record<(typeof SCOPE_LEVEL_ORDER)[number], string> = {
  project: '项目级',
  building: '楼栋级',
  unit: '单位工程级',
  specialty: '专项级',
}
const ACCEPTANCE_PHASE_OPTIONS = [
  { value: 'preparation', label: '准备阶段' },
  { value: 'special_acceptance', label: '专项验收' },
  { value: 'unit_completion', label: '单位工程验收' },
  { value: 'filing_archive', label: '备案归档' },
  { value: 'delivery_closeout', label: '交付收口' },
] as const

function normalizeScopeLevel(scopeLevel?: string | null) {
  const normalized = String(scopeLevel ?? '').trim().toLowerCase()
  if (['project', 'project_level'].includes(normalized)) return 'project'
  if (['building', 'building_level'].includes(normalized)) return 'building'
  if (['unit', 'unit_engineering', 'unit_project'].includes(normalized)) return 'unit'
  if (['specialty', 'specialty_level'].includes(normalized)) return 'specialty'
  return 'project'
}

function getScopeLevelLabel(scopeLevel?: string | null) {
  return SCOPE_LEVEL_LABELS[normalizeScopeLevel(scopeLevel)] || '项目级'
}

function getBuildingLabel(buildingId?: string | null) {
  const normalized = String(buildingId ?? '').trim()
  return normalized || '全部楼栋'
}

export default function AcceptanceTimeline() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const projectId = id || currentProject?.id || ''
  const projectName = currentProject?.name || '当前项目'

  const [plans, setPlans] = useState<AcceptancePlan[]>([])
  const [customTypes, setCustomTypes] = useState<AcceptanceType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailContext, setDetailContext] = useState<AcceptancePlanRelationBundle | null>(null)
  const [typeManagerOpen, setTypeManagerOpen] = useState(false)
  const [addPlanOpen, setAddPlanOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | AcceptanceStatus>('all')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [upcomingOnly, setUpcomingOnly] = useState(false)
  const [timeScale, setTimeScale] = useState<AcceptanceTimelineScale>('month')
  const [scopeFilter, setScopeFilter] = useState<'all' | (typeof SCOPE_LEVEL_ORDER)[number]>('all')
  const [buildingFilter, setBuildingFilter] = useState('all')
  const [viewMode, setViewMode] = useState<AcceptanceTimelineViewMode>(() => {
    if (typeof window === 'undefined' || !projectId) return 'graph'
    const persisted = safeStorageGet(window.sessionStorage, `acceptanceView:${projectId}`)
    return persisted === 'list' || persisted === 'graph' ? persisted : 'graph'
  })

  const loadData = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [snapshot, typeRows] = await Promise.all([acceptanceApi.getFlowSnapshot(projectId), acceptanceApi.getCustomTypes(projectId)])
      setPlans(snapshot.plans)
      setCustomTypes(typeRows)
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '无法加载验收时间轴', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return
    safeStorageSet(window.sessionStorage, `acceptanceView:${projectId}`, viewMode)
  }, [projectId, viewMode])

  const allTypes = useMemo(() => [...DEFAULT_ACCEPTANCE_TYPES, ...customTypes], [customTypes])
  const buildingOptions = useMemo(() => [...new Set(plans.map((plan) => String(plan.building_id ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [plans])
  const scopeOptions = useMemo(() => {
    const values = [...new Set(plans.map((plan) => normalizeScopeLevel(plan.scope_level)))]
    return values.sort((a, b) => SCOPE_LEVEL_ORDER.indexOf(a) - SCOPE_LEVEL_ORDER.indexOf(b))
  }, [plans])
  const visiblePlans = useMemo(() => plans.filter((plan) => {
    if (scopeFilter !== 'all' && normalizeScopeLevel(plan.scope_level) !== scopeFilter) return false
    if (buildingFilter !== 'all' && String(plan.building_id ?? '').trim() !== buildingFilter) return false
    if (statusFilter !== 'all' && normalizeAcceptanceStatus(plan.status) !== statusFilter) return false
    if (blockedOnly && !isAcceptanceBlocked(plan, plans)) return false
    if (upcomingOnly) {
      if (!plan.planned_date) return false
      const d = new Date(plan.planned_date)
      const now = Date.now()
      const diff = d.getTime() - now
      if (diff < 0 || diff > 14 * 24 * 60 * 60 * 1000) return false
    }
    return true
  }), [blockedOnly, buildingFilter, plans, scopeFilter, statusFilter, upcomingOnly])
  const visibleStats = useMemo(() => summarizeAcceptancePlans(visiblePlans), [visiblePlans])
  const visiblePhaseGroups = useMemo(() => groupAcceptanceByPhase(visiblePlans), [visiblePlans])
  const flowLayout = useMemo(() => buildAcceptanceFlowLayout(visiblePlans, timeScale), [timeScale, visiblePlans])
  const selectedNode = useMemo(() => flowLayout.nodes.find((node) => node.id === selectedNodeId) || null, [flowLayout.nodes, selectedNodeId])

  const refreshBundle = useCallback(async (planId: string) => {
    if (!projectId) return
    setDetailLoading(true)
    try {
      setDetailContext(await acceptanceApi.getPlanRelationBundle(projectId, planId))
    } catch (error) {
      toast({ title: '详情加载失败', description: error instanceof Error ? error.message : '无法加载关联数据', variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }, [projectId, toast])

  const reloadPlans = useCallback(async () => {
    await loadData()
  }, [loadData])

  const handleNodeSelect = useCallback((node: AcceptanceNode) => {
    setSelectedNodeId(node.id)
    setDetailOpen(true)
    setDetailContext(null)
    void refreshBundle(node.id)
  }, [refreshBundle])

  const handleStatusChange = useCallback(async (nodeId: string, status: AcceptanceStatus) => {
    await acceptanceApi.updateStatus(nodeId, status)
    await reloadPlans()
    await refreshBundle(nodeId)
  }, [refreshBundle, reloadPlans])

  const handleDateUpdate = useCallback(async (planId: string, plannedDate: string) => {
    await acceptanceApi.updatePlan(planId, { planned_date: plannedDate })
    await reloadPlans()
  }, [reloadPlans])

  const handleDependencyAdd = useCallback(async (nodeId: string, dependsOnId: string) => {
    await acceptanceApi.addDependency(projectId, nodeId, dependsOnId)
    await reloadPlans()
    await refreshBundle(nodeId)
  }, [projectId, refreshBundle, reloadPlans])

  const handleDependencyRemove = useCallback(async (nodeId: string, dependsOnId: string) => {
    await acceptanceApi.removeDependency(nodeId, dependsOnId)
    await reloadPlans()
    await refreshBundle(nodeId)
  }, [refreshBundle, reloadPlans])

  const handleRequirementCreate = useCallback(async (
    nodeId: string,
    input: {
      requirement_type: string
      source_entity_type: string
      source_entity_id: string
      description?: string | null
      status?: string | null
    },
  ) => {
    await acceptanceApi.createPlanRequirement(projectId, nodeId, input)
    await refreshBundle(nodeId)
  }, [projectId, refreshBundle])

  const handleRecordCreate = useCallback(async (
    nodeId: string,
    input: {
      record_type: string
      content: string
      operator?: string | null
      record_date?: string | null
    },
  ) => {
    await acceptanceApi.createPlanRecord(projectId, nodeId, input)
    await refreshBundle(nodeId)
  }, [projectId, refreshBundle])

  const handleAddType = useCallback(async (type: Partial<AcceptanceType>) => {
    const created = await acceptanceApi.createCustomType(type, projectId)
    setCustomTypes((current) => [...current, created])
  }, [projectId])

  const handleDeleteType = useCallback(async (typeId: string) => {
    await acceptanceApi.deleteCustomType(typeId)
    setCustomTypes((current) => current.filter((item) => item.id !== typeId))
  }, [])

  const handleAddPlan = useCallback(async (plan: Partial<AcceptancePlan>) => {
    await acceptanceApi.createPlan({ ...plan, project_id: projectId, milestone_id: plan.milestone_id, status: plan.status || 'draft', scope_level: plan.scope_level || 'project' })
    await reloadPlans()
  }, [projectId, reloadPlans])

  if (loading) {
    return (
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="acceptance-loading-skeleton">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Skeleton className="h-4 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>)}
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6">
      {currentProject && (
        <Breadcrumb
          items={[
            { label: '公司驾驶舱', href: '/company' },
            { label: projectName, href: `/projects/${id}` },
            { label: '证照与验收', href: `/projects/${id}/pre-milestones` },
            { label: '验收时间轴' },
          ]}
        />
      )}

      <PageHeader eyebrow="证照与验收" title="验收时间轴">
        <div className="flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors', viewMode === 'graph' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900')}
            data-testid="acceptance-view-graph"
          >
            <Network className="h-4 w-4" />
            流程板
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors', viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900')}
            data-testid="acceptance-view-list"
          >
            <List className="h-4 w-4" />
            台账
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTypeManagerOpen(true)} className="gap-2">
          <Palette className="h-4 w-4" />
          类型管理
        </Button>
        <Button size="sm" onClick={() => setAddPlanOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          新增验收
        </Button>
      </PageHeader>

      <section data-testid="acceptance-summary-panel" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">摘要区</div>
            <div className="text-xs text-slate-500">当前视图 {visiblePlans.length} / 全部 {plans.length}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">项目：{projectName}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">楼栋：{getBuildingLabel(buildingFilter === 'all' ? null : buildingFilter)}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">范围：{scopeFilter === 'all' ? '全部范围' : getScopeLevelLabel(scopeFilter)}</Badge>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="验收总数" value={visibleStats.total} tone="slate" />
          <StatCard label="已通过 / 已备案" value={visibleStats.passed} tone="green" />
          <StatCard label="推进中" value={visibleStats.inProgress} tone="blue" />
          <StatCard label="未启动 / 整改中" value={visibleStats.pending + visibleStats.failed} tone="amber" />
          <StatCard label="完成率" value={`${visibleStats.completionRate}%`} tone="emerald" />
        </div>
      </section>

      <section data-testid="acceptance-filter-panel" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">筛选区</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">项目：{projectName}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">楼栋：{getBuildingLabel(buildingFilter === 'all' ? null : buildingFilter)}</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="acceptance-scope-select" className="text-xs text-slate-500">范围</Label>
            <select
              id="acceptance-scope-select"
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value as 'all' | (typeof SCOPE_LEVEL_ORDER)[number])}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid="acceptance-scope-select"
            >
              <option value="all">全部范围</option>
              {scopeOptions.map((scopeLevel) => <option key={scopeLevel} value={scopeLevel}>{getScopeLevelLabel(scopeLevel)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acceptance-building-select" className="text-xs text-slate-500">楼栋</Label>
            <select
              id="acceptance-building-select"
              value={buildingFilter}
              onChange={(event) => setBuildingFilter(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid="acceptance-building-select"
            >
              <option value="all">全部楼栋</option>
              {buildingOptions.map((buildingId) => <option key={buildingId} value={buildingId}>{buildingId}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="acceptance-status-select" className="text-xs text-slate-500">状态筛选</Label>
            <select
              id="acceptance-status-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | AcceptanceStatus)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid="acceptance-status-select"
            >
              <option value="all">全部状态</option>
              {ACCEPTANCE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{ACCEPTANCE_STATUS_LABELS[status]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">仅看阻塞</Label>
            <button
              type="button"
              onClick={() => setBlockedOnly((current) => !current)}
              className={cn('inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors', blockedOnly ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600')}
              data-testid="acceptance-blocked-toggle"
            >
              <span>只看阻塞项</span>
              <span>{blockedOnly ? '已启用' : '关闭'}</span>
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">仅看临期</Label>
            <button
              type="button"
              onClick={() => setUpcomingOnly((current) => !current)}
              className={cn('inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors', upcomingOnly ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600')}
              data-testid="acceptance-upcoming-toggle"
            >
              <span>14天内到期</span>
              <span>{upcomingOnly ? '已启用' : '关闭'}</span>
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">时间尺度</Label>
            <div className="grid grid-cols-3 gap-2">
              {[{ value: 'month', label: '月' }, { value: 'biweek', label: '双周' }, { value: 'week', label: '周' }].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTimeScale(item.value as AcceptanceTimelineScale)}
                  className={cn('rounded-md border px-3 py-2 text-sm transition-colors', timeScale === item.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600')}
                  data-testid={`acceptance-time-scale-${item.value}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {visiblePhaseGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visiblePhaseGroups.map((phase) => <Badge key={phase.id} variant="outline" className="rounded-full px-3 py-1">{phase.name} 路 {phase.plans.length}</Badge>)}
        </div>
      )}

      {visiblePlans.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="暂无验收记录"
          description=""
          action={<Button className="gap-2" onClick={() => setAddPlanOpen(true)}><Plus className="h-4 w-4" />添加验收</Button>}
        />
      ) : viewMode === 'graph' ? (
        <AcceptanceFlowBoard layout={flowLayout} plans={visiblePlans} customTypes={allTypes} selectedNodeId={selectedNode?.id} onNodeClick={handleNodeSelect} />
      ) : (
        <AcceptanceLedger plans={visiblePlans} nodes={flowLayout.nodes} customTypes={allTypes} onNodeClick={handleNodeSelect} onStatusChange={handleStatusChange} onDateUpdate={handleDateUpdate} timeScale={timeScale} />
      )}

      <AcceptanceDetailDrawer
        node={selectedNode}
        allPlans={plans}
        open={detailOpen}
        customTypes={allTypes}
        detailContext={detailContext}
        detailLoading={detailLoading}
        projectId={projectId}
        onClose={() => {
          setDetailOpen(false)
          setSelectedNodeId(null)
        }}
        onStatusChange={handleStatusChange}
        onDependencyAdd={handleDependencyAdd}
        onDependencyRemove={handleDependencyRemove}
        onRequirementCreate={handleRequirementCreate}
        onRecordCreate={handleRecordCreate}
        onDateUpdate={handleDateUpdate}
      />

      <TypeManagerDialog open={typeManagerOpen} customTypes={customTypes} onClose={() => setTypeManagerOpen(false)} onAddType={handleAddType} onDeleteType={handleDeleteType} />
      <AddPlanDialog open={addPlanOpen} acceptanceTypes={allTypes} onClose={() => setAddPlanOpen(false)} onSubmit={handleAddPlan} />
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone: 'slate' | 'green' | 'blue' | 'amber' | 'emerald' }) {
  const toneClass: Record<typeof tone, string> = {
    slate: 'bg-slate-50 text-slate-800',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return <Card className={cn('border-0 shadow-sm', toneClass[tone])}><CardContent className="p-5"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-sm text-slate-500">{label}</div></CardContent></Card>
}

function TypeManagerDialog({
  open,
  customTypes,
  onClose,
  onAddType,
  onDeleteType,
}: {
  open: boolean
  customTypes: AcceptanceType[]
  onClose: () => void
  onAddType: (type: Partial<AcceptanceType>) => void
  onDeleteType: (typeId: string) => void
}) {
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeIcon, setNewTypeIcon] = useState('验')
  const [newTypeColor, setNewTypeColor] = useState<(typeof CHART_PALETTE)[number]>(CHART_PALETTE[0])

  const reset = () => {
    setNewTypeName('')
    setNewTypeIcon('验')
    setNewTypeColor(CHART_PALETTE[0])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = () => {
    if (!newTypeName.trim()) return
    onAddType({
      name: newTypeName.trim(),
      shortName: newTypeName.trim().slice(0, 4),
      color: newTypeColor,
      icon: newTypeIcon,
      isSystem: false,
      sortOrder: customTypes.length,
    })
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            验收类型管理
          </DialogTitle>
          <DialogDescription className="sr-only">管理系统默认类型和自定义验收类型。</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          <div>
            <h4 className="mb-3 text-sm font-medium text-slate-700">系统默认类型</h4>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ACCEPTANCE_TYPES.map((type) => (
                <div key={type.id} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm" style={{ backgroundColor: `${type.color}20`, color: type.color }}>
                  <span>{type.icon}</span>
                  <span>{type.name}</span>
                </div>
              ))}
            </div>
          </div>

          {customTypes.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium text-slate-700">自定义类型</h4>
              <div className="flex flex-wrap gap-2">
                {customTypes.map((type) => (
                  <div key={type.id} className="group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm" style={{ backgroundColor: `${type.color}20`, color: type.color }}>
                    <span>{type.icon}</span>
                    <span>{type.name}</span>
                    <button type="button" onClick={() => onDeleteType(type.id)} className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <h4 className="mb-3 text-sm font-medium text-slate-700">新增类型</h4>
            <div className="space-y-3">
              <div>
                <Label>类型名称</Label>
                <Input value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="例如：专项验收" className="mt-1" />
              </div>
              <div>
                <Label>图标</Label>
                <Input value={newTypeIcon} onChange={(event) => setNewTypeIcon(event.target.value)} placeholder="例如：验" maxLength={2} className="mt-1" />
              </div>
              <div>
                <Label>颜色</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHART_PALETTE.map((color) => (
                    <button key={color} type="button" onClick={() => setNewTypeColor(color)} className={cn('h-8 w-8 rounded-full transition-all', newTypeColor === color && 'ring-2 ring-slate-400 ring-offset-2')} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={!newTypeName.trim()} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                添加类型
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddPlanDialog({
  open,
  acceptanceTypes,
  onClose,
  onSubmit,
}: {
  open: boolean
  acceptanceTypes: AcceptanceType[]
  onClose: () => void
  onSubmit: (plan: Partial<AcceptancePlan>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [description, setDescription] = useState('')
  const [phaseCode, setPhaseCode] = useState<(typeof ACCEPTANCE_PHASE_OPTIONS)[number]['value']>('special_acceptance')
  const [scopeLevel, setScopeLevel] = useState<'project' | 'building' | 'unit' | 'specialty'>('project')
  const [buildingId, setBuildingId] = useState('')
  const [responsibleUnit, setResponsibleUnit] = useState('')
  const [isHardPrerequisite, setIsHardPrerequisite] = useState(false)
  const [category, setCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setTypeId('')
      setPlannedDate('')
      setDescription('')
      setPhaseCode('special_acceptance')
      setScopeLevel('project')
      setBuildingId('')
      setResponsibleUnit('')
      setIsHardPrerequisite(false)
      setCategory('')
      setSubmitting(false)
    }
  }, [open])

  const defaultType = acceptanceTypes[0]

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const resolvedTypeId = typeId || defaultType?.id || 'pre_acceptance'
      const selectedType = acceptanceTypes.find((type) => type.id === resolvedTypeId) || defaultType
      await onSubmit({
        name: name.trim(),
        type_id: resolvedTypeId,
        type_name: selectedType?.name || resolvedTypeId,
        type_color: selectedType?.color || 'bg-slate-500',
        planned_date: plannedDate || new Date().toISOString().slice(0, 10),
        description: description.trim() || undefined,
        status: 'draft',
        phase_code: phaseCode,
        phase_order: 0,
        predecessor_plan_ids: [],
        successor_plan_ids: [],
        display_badges: ['自定义'],
        scope_level: scopeLevel,
        building_id: buildingId.trim() || null,
        responsible_unit: responsibleUnit.trim() || null,
        is_hard_prerequisite: isHardPrerequisite,
        category: category.trim() || null,
        is_system: false,
        is_custom: true,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handlePickPreset = (presetName: string) => {
    setName(presetName)
    const resolvedTypeId = NAME_TO_TYPE[presetName]
    if (resolvedTypeId) setTypeId(resolvedTypeId)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            新增验收计划
          </DialogTitle>
          <DialogDescription className="sr-only">创建验收计划，补充范围、楼栋和计划时间。</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div>
            <Label>验收名称 *</Label>
            <Input
              list="acceptance-name-options"
              value={name}
              onChange={(event) => {
                const value = event.target.value
                setName(value)
                if (NAME_TO_TYPE[value]) setTypeId(NAME_TO_TYPE[value])
              }}
              placeholder="选择或输入验收名称"
              className="mt-1"
            />
            <datalist id="acceptance-name-options">
              {acceptanceTypes.map((type) => <option key={type.id} value={type.name} />)}
              {PLAN_PRESETS.map((preset) => <option key={preset} value={preset} />)}
            </datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLAN_PRESETS.map((preset) => (
                <button key={preset} type="button" onClick={() => handlePickPreset(preset)} className={cn('rounded-full border px-2 py-1 text-xs transition-colors', name === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300')}>
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>计划日期</Label>
            <Input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} className="mt-1" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>范围层级</Label>
              <select value={scopeLevel} onChange={(event) => setScopeLevel(event.target.value as 'project' | 'building' | 'unit' | 'specialty')} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                {SCOPE_LEVEL_ORDER.map((level) => <option key={level} value={level}>{SCOPE_LEVEL_LABELS[level]}</option>)}
              </select>
            </div>
            <div>
              <Label>楼栋编号</Label>
              <Input value={buildingId} onChange={(event) => setBuildingId(event.target.value)} placeholder="可选" className="mt-1" />
            </div>
          </div>

          <div>
            <Label>备注</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选备注" className="mt-1" />
          </div>

          <div>
            <Label>阶段归属</Label>
            <select value={phaseCode} onChange={(event) => setPhaseCode(event.target.value as (typeof ACCEPTANCE_PHASE_OPTIONS)[number]['value'])} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              {ACCEPTANCE_PHASE_OPTIONS.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}
            </select>
          </div>

          <div>
            <Label>责任单位</Label>
            <Input value={responsibleUnit} onChange={(event) => setResponsibleUnit(event.target.value)} placeholder="可选，填写参建单位名称" className="mt-1" />
          </div>

          <div>
            <Label>验收类别</Label>
            <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="可选，如：结构验收、消防验收" className="mt-1" />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <input
              id="is-hard-prerequisite"
              type="checkbox"
              checked={isHardPrerequisite}
              onChange={(event) => setIsHardPrerequisite(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="is-hard-prerequisite" className="text-sm text-slate-700">强制前置（完成后方可推进后续工序）</label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={!name.trim()} className="gap-2">
            <Plus className="h-4 w-4" />
            确认创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
