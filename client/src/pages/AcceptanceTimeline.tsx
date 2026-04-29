import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { CheckCircle2, List, Network, Palette, Plus } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { usePermissions } from '@/hooks/usePermissions'
import { useToast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { CHART_PALETTE } from '@/lib/chartPalette'
import { acceptanceApi } from '@/services/acceptanceApi'
import type { AcceptanceNode, AcceptancePlan, AcceptancePlanRelationBundle, AcceptanceProjectSummary, AcceptanceStatus, AcceptanceType } from '@/types/acceptance'
import { DEFAULT_ACCEPTANCE_TYPES, groupAcceptanceByPhase, isAcceptanceBlocked, normalizeAcceptanceStatus } from '@/types/acceptance'

import AcceptanceDetailDrawer from './AcceptanceTimeline/components/AcceptanceDetailDrawer'
import AcceptanceFlowBoard from './AcceptanceTimeline/components/AcceptanceFlowBoard'
import AcceptanceLedger from './AcceptanceTimeline/components/AcceptanceLedger'
import type { AcceptanceTimelineScale, AcceptanceTimelineViewMode } from './AcceptanceTimeline/types'
import { buildAcceptanceFlowLayout, FLOW_BUCKET_WIDTH, FLOW_CARD_HEIGHT } from './AcceptanceTimeline/utils/layout'

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
type AcceptanceStageKey = 'foundation' | 'main' | 'completion' | 'special'

const ACCEPTANCE_STAGE_DEFINITIONS: Array<{
  key: AcceptanceStageKey
  label: string
  description: string
  accentClass: string
  progressClass: string
}> = [
  {
    key: 'foundation',
    label: '基础验收',
    description: '地基、基础与预验收',
    accentClass: 'border-l-emerald-500',
    progressClass: 'bg-emerald-500',
  },
  {
    key: 'main',
    label: '主体验收',
    description: '主体、单位工程与四方验收',
    accentClass: 'border-l-blue-500',
    progressClass: 'bg-blue-600',
  },
  {
    key: 'completion',
    label: '竣工验收',
    description: '备案、归档与交付收口',
    accentClass: 'border-l-slate-500',
    progressClass: 'bg-slate-600',
  },
  {
    key: 'special',
    label: '专项验收',
    description: '消防、规划、人防、电梯、防雷等',
    accentClass: 'border-l-blue-500',
    progressClass: 'bg-blue-600',
  },
]

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

const EMPTY_ACCEPTANCE_SUMMARY: AcceptanceProjectSummary = {
  totalCount: 0,
  passedCount: 0,
  inProgressCount: 0,
  notStartedCount: 0,
  blockedCount: 0,
  dueSoon30dCount: 0,
  keyMilestoneCount: 0,
  completionRate: 0,
}

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

function normalizePhaseFilter(value: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || 'all'
}

function getAcceptancePhaseLabel(value: string) {
  if (value === 'all') return '全部阶段'
  return ACCEPTANCE_PHASE_OPTIONS.find((phase) => phase.value === value)?.label || value
}

function getAcceptanceStageKey(plan: AcceptancePlan): AcceptanceStageKey {
  const typeId = String(plan.type_id ?? '').toLowerCase()
  const phaseCode = String(plan.phase_code ?? '').toLowerCase()
  const category = String(plan.category ?? '').toLowerCase()
  const name = `${plan.name ?? ''} ${plan.type_name ?? ''} ${plan.acceptance_name ?? ''} ${plan.acceptance_type ?? ''}`.toLowerCase()
  const searchText = `${typeId} ${phaseCode} ${category} ${name}`

  if (searchText.includes('completion_record') || searchText.includes('filing') || searchText.includes('archive') || searchText.includes('delivery') || searchText.includes('竣工') || searchText.includes('备案') || searchText.includes('归档') || searchText.includes('交付')) {
    return 'completion'
  }

  if (typeId === 'pre_acceptance' || searchText.includes('foundation') || searchText.includes('基础') || searchText.includes('地基') || searchText.includes('预验收')) {
    return 'foundation'
  }

  if (typeId === 'four_party' || searchText.includes('main') || searchText.includes('主体') || searchText.includes('单位工程') || searchText.includes('四方')) {
    return 'main'
  }

  return 'special'
}

function buildAcceptanceStageSummaries(plans: AcceptancePlan[]) {
  const buckets = new Map<AcceptanceStageKey, AcceptancePlan[]>()
  ACCEPTANCE_STAGE_DEFINITIONS.forEach((stage) => buckets.set(stage.key, []))

  plans.forEach((plan) => {
    buckets.get(getAcceptanceStageKey(plan))?.push(plan)
  })

  return ACCEPTANCE_STAGE_DEFINITIONS.map((stage) => {
    const stagePlans = buckets.get(stage.key) || []
    const passed = stagePlans.filter((plan) => ['passed', 'archived'].includes(normalizeAcceptanceStatus(plan.status))).length
    const total = stagePlans.length

    return {
      ...stage,
      passed,
      total,
      percent: total > 0 ? Math.round((passed / total) * 100) : 0,
    }
  })
}

const ACCEPTANCE_TIMELINE_BUCKET_DAY_SPAN: Record<AcceptanceTimelineScale, number> = {
  month: 30,
  biweek: 14,
  week: 7,
}

function shiftIsoDate(value: string, days: number) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null

  const date = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null

  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function AcceptanceTimeline() {
  useEffect(() => {
    document.title = '验收流程 | WorkBuddy'
  }, [])

  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const projectId = id || currentProject?.id || ''
  const projectName = currentProject?.name || '当前项目'
  const { canEdit } = usePermissions({ projectId: currentProject?.id ?? id })

  const [plans, setPlans] = useState<AcceptancePlan[]>([])
  const [customTypes, setCustomTypes] = useState<AcceptanceType[]>([])
  const [projectSummary, setProjectSummary] = useState<AcceptanceProjectSummary>(EMPTY_ACCEPTANCE_SUMMARY)
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
  const [phaseFilter, setPhaseFilter] = useState('all')
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
      const [snapshot, typeRows, summary] = await Promise.all([
        acceptanceApi.getFlowSnapshot(projectId),
        acceptanceApi.getCustomTypes(projectId),
        acceptanceApi.getProjectSummary(projectId),
      ])
      setPlans(snapshot.plans)
      setCustomTypes(typeRows)
      setProjectSummary(summary)
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

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const nextStatusFilter = query.get('status')
    const nextPhaseFilter = normalizePhaseFilter(query.get('phase'))

    if (nextStatusFilter && ACCEPTANCE_STATUS_OPTIONS.includes(nextStatusFilter as AcceptanceStatus)) {
      setStatusFilter(nextStatusFilter as AcceptanceStatus)
    } else if (nextStatusFilter === 'all' || nextStatusFilter === '') {
      setStatusFilter('all')
    }

    setPhaseFilter(nextPhaseFilter)
  }, [location.search])

  const allTypes = useMemo(() => [...DEFAULT_ACCEPTANCE_TYPES, ...customTypes], [customTypes])
  const buildingOptions = useMemo(() => [...new Set(plans.map((plan) => String(plan.building_id ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [plans])
  const phaseOptions = useMemo(() => {
    const knownOptions = new Map<string, { value: string; label: string }>()
    for (const option of ACCEPTANCE_PHASE_OPTIONS) {
      knownOptions.set(option.value, option)
    }

    const planPhaseCodes = [...new Set(plans.map((plan) => String(plan.phase_code ?? '').trim()).filter(Boolean))]
    const extraPhaseCodes = planPhaseCodes.filter((code) => !knownOptions.has(code))
    if (phaseFilter !== 'all' && !knownOptions.has(phaseFilter) && !extraPhaseCodes.includes(phaseFilter)) {
      extraPhaseCodes.unshift(phaseFilter)
    }

    return [
      ...ACCEPTANCE_PHASE_OPTIONS,
      ...extraPhaseCodes.map((value) => ({ value, label: value })),
    ]
  }, [phaseFilter, plans])
  const scopeOptions = useMemo(() => {
    const values = [...new Set(plans.map((plan) => normalizeScopeLevel(plan.scope_level)))]
    return values.sort((a, b) => SCOPE_LEVEL_ORDER.indexOf(a) - SCOPE_LEVEL_ORDER.indexOf(b))
  }, [plans])
  const visiblePlans = useMemo(() => plans.filter((plan) => {
    if (scopeFilter !== 'all' && normalizeScopeLevel(plan.scope_level) !== scopeFilter) return false
    if (buildingFilter !== 'all' && String(plan.building_id ?? '').trim() !== buildingFilter) return false
    if (phaseFilter !== 'all' && String(plan.phase_code ?? '').trim() !== phaseFilter) return false
    if (statusFilter !== 'all' && normalizeAcceptanceStatus(plan.status) !== statusFilter) return false
    if (blockedOnly && !isAcceptanceBlocked(plan, plans)) return false
    if (upcomingOnly) {
      if (!plan.planned_date) return false
      const d = new Date(plan.planned_date)
      const now = Date.now()
      const diff = d.getTime() - now
      if (diff < 0 || diff > 30 * 24 * 60 * 60 * 1000) return false
    }
    return true
  }), [blockedOnly, buildingFilter, phaseFilter, plans, scopeFilter, statusFilter, upcomingOnly])
  const visiblePhaseGroups = useMemo(() => groupAcceptanceByPhase(visiblePlans), [visiblePlans])
  const flowLayout = useMemo(() => buildAcceptanceFlowLayout(visiblePlans, timeScale), [timeScale, visiblePlans])
  const selectedNode = useMemo(() => flowLayout.nodes.find((node) => node.id === selectedNodeId) || null, [flowLayout.nodes, selectedNodeId])
  const stageSummaries = useMemo(() => buildAcceptanceStageSummaries(visiblePlans), [visiblePlans])
  const totalStageCount = useMemo(() => stageSummaries.reduce((sum, stage) => sum + stage.total, 0), [stageSummaries])
  const totalPassedStageCount = useMemo(() => stageSummaries.reduce((sum, stage) => sum + stage.passed, 0), [stageSummaries])
  const totalPercent = totalStageCount > 0 ? Math.round((totalPassedStageCount / totalStageCount) * 100) : 0

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

  const handlePlanUpdate = useCallback(async (planId: string, updates: Partial<AcceptancePlan>) => {
    if (!canEdit) return
    try {
      await acceptanceApi.updatePlan(planId, updates)
      await reloadPlans()
    } catch (error) {
      toast({
        title: '验收计划更新失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }, [canEdit, reloadPlans, toast])

  const handleStatusChange = useCallback(async (nodeId: string, status: AcceptanceStatus) => {
    try {
      await acceptanceApi.updateStatus(nodeId, status)
      await reloadPlans()
      await refreshBundle(nodeId)
    } catch (error) {
      toast({
        title: '状态更新失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }, [refreshBundle, reloadPlans, toast])

  const handleNodeDragEnd = useCallback(async (planId: string, dx: number, dy: number) => {
    if (!canEdit) return

    const plan = plans.find((item) => item.id === planId)
    const node = flowLayout.nodes.find((item) => item.id === planId)
    if (!plan || !node) return

    const updates: Partial<AcceptancePlan> = {}
    const bucketShift = Math.round(dx / FLOW_BUCKET_WIDTH)
    if (bucketShift !== 0) {
      const baselineDate = plan.planned_date || new Date().toISOString().slice(0, 10)
      const nextDate = shiftIsoDate(baselineDate, bucketShift * ACCEPTANCE_TIMELINE_BUCKET_DAY_SPAN[timeScale])
      if (nextDate && nextDate !== plan.planned_date) {
        updates.planned_date = nextDate
      }
    }

    if (flowLayout.laneLayouts.length > 0) {
      const targetY = (node.y ?? 0) + dy + FLOW_CARD_HEIGHT / 2
      const targetLane = flowLayout.laneLayouts.reduce((best, lane) => {
        if (!best) return lane
        const bestCenter = best.top + best.height / 2
        const laneCenter = lane.top + lane.height / 2
        return Math.abs(laneCenter - targetY) < Math.abs(bestCenter - targetY) ? lane : best
      }, flowLayout.laneLayouts[0])
      const targetPhaseCode = flowLayout.lanes.find((lane) => lane.id === targetLane.laneId)?.id || targetLane.laneId
      if (targetPhaseCode && targetPhaseCode !== plan.phase_code) {
        updates.phase_code = targetPhaseCode
      }
    }

    if (Object.keys(updates).length === 0) return
    await handlePlanUpdate(planId, updates)
  }, [canEdit, flowLayout.laneLayouts, flowLayout.lanes, flowLayout.nodes, handlePlanUpdate, plans, timeScale])

  const handleDateUpdate = useCallback(async (planId: string, plannedDate: string) => {
    await handlePlanUpdate(planId, { planned_date: plannedDate })
  }, [handlePlanUpdate])

  const handleBatchStatusChange = useCallback(async (planIds: string[], status: AcceptanceStatus) => {
    if (!canEdit || planIds.length === 0) return
    try {
      await Promise.all(planIds.map((planId) => acceptanceApi.updateStatus(planId, status)))
      await reloadPlans()
      toast({ title: '批量状态已更新', description: `已更新 ${planIds.length} 项验收状态。` })
    } catch (error) {
      toast({
        title: '批量状态更新失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }, [canEdit, reloadPlans, toast])

  const handleBatchPlanUpdate = useCallback(async (
    planIds: string[],
    updates: Partial<AcceptancePlan>,
    successTitle: string,
    successDescription: string,
    errorTitle: string,
  ) => {
    if (!canEdit || planIds.length === 0) return
    try {
      await Promise.all(planIds.map((planId) => acceptanceApi.updatePlan(planId, updates)))
      await reloadPlans()
      toast({ title: successTitle, description: successDescription })
    } catch (error) {
      toast({
        title: errorTitle,
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }, [canEdit, reloadPlans, toast])

  const handleBatchDateUpdate = useCallback(async (planIds: string[], plannedDate: string) => {
    await handleBatchPlanUpdate(planIds, { planned_date: plannedDate }, '批量日期已更新', `已调整 ${planIds.length} 项计划日期。`, '批量日期更新失败')
  }, [handleBatchPlanUpdate])

  const handleBatchResponsibleUnitUpdate = useCallback(async (planIds: string[], responsibleUnit: string) => {
    await handleBatchPlanUpdate(planIds, { responsible_unit: responsibleUnit }, '批量责任单位已更新', `已更新 ${planIds.length} 项责任单位。`, '批量责任单位更新失败')
  }, [handleBatchPlanUpdate])

  const handleBatchPhaseUpdate = useCallback(async (planIds: string[], phaseCode: string) => {
    await handleBatchPlanUpdate(planIds, { phase_code: phaseCode }, '批量阶段已更新', `已调整 ${planIds.length} 项阶段归属。`, '批量阶段更新失败')
  }, [handleBatchPlanUpdate])

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
      <div className="page-shell page-enter" data-testid="acceptance-loading-skeleton">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><Skeleton className="h-4 w-20" /><Skeleton className="mt-3 h-8 w-16" /></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell page-enter space-y-6">
      {currentProject && (
        <Breadcrumb
          items={[
            { label: projectName, href: `/projects/${id}/dashboard` },
            { label: '验收流程' },
          ]}
        />
      )}

      <PageHeader eyebrow="专项管理" title="验收流程">
        <Button variant="outline" size="sm" onClick={() => setTypeManagerOpen(true)} className="gap-2" disabled={!canEdit}>
          <Palette className="h-4 w-4" />
          类型管理
        </Button>
        <Button size="sm" onClick={() => setAddPlanOpen(true)} className="gap-2" disabled={!canEdit}>
          <Plus className="h-4 w-4" />
          新增验收
        </Button>
      </PageHeader>

      <section data-testid="acceptance-summary-panel" className="card-unified space-y-4 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">摘要区</div>
            <div className="text-xs text-slate-500">当前视图 {visiblePlans.length} / 全部 {projectSummary.totalCount || plans.length}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">项目：{projectName}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">楼栋：{getBuildingLabel(buildingFilter === 'all' ? null : buildingFilter)}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">范围：{scopeFilter === 'all' ? '全部范围' : getScopeLevelLabel(scopeFilter)}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">阶段：{getAcceptancePhaseLabel(phaseFilter)}</Badge>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stageSummaries.map((stage) => (
            <AcceptanceStageCard key={stage.key} stage={stage} />
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5" data-testid="acceptance-progress-overview">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-lg font-semibold text-slate-900">验收总进度</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">{totalPercent}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-label={`验收总进度 ${totalPercent}%`}>
            <div className="flex h-full w-full">
              {stageSummaries.map((stage) => (
                <div
                  key={stage.key}
                  className={cn('h-full motion-safe:transition-[width] duration-700 ease-out', stage.progressClass)}
                  style={{ width: `${totalStageCount > 0 ? (stage.passed / totalStageCount) * 100 : 0}%` }}
                  data-testid={`acceptance-progress-segment-${stage.key}`}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            {stageSummaries.map((stage) => (
              <span key={stage.key} className="tabular-nums">
                {stage.label} {stage.percent}% ({stage.passed}/{stage.total})
              </span>
            ))}
          </div>
        </div>
      </section>

      <section data-testid="acceptance-filter-panel" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">筛选区</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">项目：{projectName}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">楼栋：{getBuildingLabel(buildingFilter === 'all' ? null : buildingFilter)}</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
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
            <Label htmlFor="acceptance-phase-select" className="text-xs text-slate-500">阶段</Label>
            <select
              id="acceptance-phase-select"
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid="acceptance-phase-select"
            >
              <option value="all">全部阶段</option>
              {phaseOptions.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}
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
        </div>
        <div className="mt-3">
          <CollapsibleSection title="更多筛选" count={3} defaultOpen={false}>
            <div className="grid gap-3 pt-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">仅看阻塞</Label>
                <Button variant="ghost"
                  type="button"
                  onClick={() => setBlockedOnly((current) => !current)}
                  className={cn('inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors', blockedOnly ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600')}
                  data-testid="acceptance-blocked-toggle"
                >
                  <span>只看阻塞项</span>
                  <span>{blockedOnly ? '已启用' : '关闭'}</span>
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">仅看临期</Label>
                <Button variant="ghost"
                  type="button"
                  onClick={() => setUpcomingOnly((current) => !current)}
                  className={cn('inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors', upcomingOnly ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600')}
                  data-testid="acceptance-upcoming-toggle"
                >
                  <span>30天内到期</span>
                  <span>{upcomingOnly ? '已启用' : '关闭'}</span>
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">时间尺度</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ value: 'month', label: '月' }, { value: 'biweek', label: '双周' }, { value: 'week', label: '周' }].map((item) => (
                    <Button variant="ghost"
                      key={item.value}
                      type="button"
                      onClick={() => setTimeScale(item.value as AcceptanceTimelineScale)}
                      className={cn('rounded-md border px-3 py-2 text-sm transition-colors', timeScale === item.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600')}
                      data-testid={`acceptance-time-scale-${item.value}`}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </section>

      {visiblePhaseGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visiblePhaseGroups.map((phase) => <Badge key={phase.id} variant="outline" className="rounded-full px-3 py-1">{phase.name} 路 {phase.plans.length}</Badge>)}
        </div>
      )}

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as AcceptanceTimelineViewMode)} className="space-y-4">
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="graph" className="gap-2 rounded-lg" onClick={() => setViewMode('graph')} data-testid="acceptance-view-graph">
            <Network className="h-4 w-4" />
            流程图({visiblePlans.length})
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2 rounded-lg" onClick={() => setViewMode('list')} data-testid="acceptance-view-list">
            <List className="h-4 w-4" />
            台账({visiblePlans.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="graph" forceMount className="mt-0">
          {visiblePlans.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="暂无验收记录"
              description=""
              action={<Button className="gap-2" onClick={() => setAddPlanOpen(true)} disabled={!canEdit}><Plus className="h-4 w-4" />添加验收</Button>}
            />
          ) : (
            <AcceptanceFlowBoard layout={flowLayout} plans={visiblePlans} customTypes={allTypes} selectedNodeId={selectedNode?.id} onNodeClick={handleNodeSelect} onNodeDragEnd={canEdit ? handleNodeDragEnd : undefined} />
          )}
        </TabsContent>

        <TabsContent value="list" forceMount className="mt-0">
          {visiblePlans.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="暂无验收记录"
              description=""
              action={<Button className="gap-2" onClick={() => setAddPlanOpen(true)} disabled={!canEdit}><Plus className="h-4 w-4" />添加验收</Button>}
            />
          ) : (
            <AcceptanceLedger
              plans={visiblePlans}
              nodes={flowLayout.nodes}
              customTypes={allTypes}
              onNodeClick={handleNodeSelect}
              onStatusChange={canEdit ? handleStatusChange : undefined}
              onDateUpdate={canEdit ? handleDateUpdate : undefined}
              onBatchStatusChange={canEdit ? handleBatchStatusChange : undefined}
              onBatchDateUpdate={canEdit ? handleBatchDateUpdate : undefined}
              onBatchResponsibleUnitUpdate={canEdit ? handleBatchResponsibleUnitUpdate : undefined}
              onBatchPhaseUpdate={canEdit ? handleBatchPhaseUpdate : undefined}
              timeScale={timeScale}
              canEdit={canEdit}
            />
          )}
        </TabsContent>
      </Tabs>

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
        onPlanUpdate={handlePlanUpdate}
        canEdit={canEdit}
      />

      <TypeManagerDialog open={typeManagerOpen} customTypes={customTypes} canEdit={canEdit} onClose={() => setTypeManagerOpen(false)} onAddType={handleAddType} onDeleteType={handleDeleteType} />
      <AddPlanDialog open={addPlanOpen} acceptanceTypes={allTypes} canEdit={canEdit} onClose={() => setAddPlanOpen(false)} onSubmit={handleAddPlan} />
    </div>
  )
}

function AcceptanceStageCard({ stage }: { stage: ReturnType<typeof buildAcceptanceStageSummaries>[number] }) {
  return (
    <Card className={cn('card-unified rounded-xl border-l-4 bg-white', stage.accentClass)} data-testid={`acceptance-stage-card-${stage.key}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{stage.label}</div>
            <div className="mt-1 text-xs text-slate-500">{stage.description}</div>
          </div>
          <Badge variant="outline" className="rounded-full bg-white tabular-nums">
            {stage.passed}/{stage.total}
          </Badge>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="text-3xl font-semibold tabular-nums text-slate-900">{stage.percent}%</div>
          <div className="text-xs text-slate-500">通过率</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn('h-full motion-safe:transition-[width] duration-700 ease-out', stage.progressClass)}
            style={{ width: `${stage.percent}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TypeManagerDialog({
  open,
  customTypes,
  canEdit = true,
  onClose,
  onAddType,
  onDeleteType,
}: {
  open: boolean
  customTypes: AcceptanceType[]
  canEdit?: boolean
  onClose: () => void
  onAddType: (type: Partial<AcceptanceType>) => void
  onDeleteType: (typeId: string) => void
}) {
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeShortName, setNewTypeShortName] = useState('')
  const [newTypeDescription, setNewTypeDescription] = useState('')
  const [newTypePhaseCode, setNewTypePhaseCode] = useState<(typeof ACCEPTANCE_PHASE_OPTIONS)[number]['value']>('special_acceptance')
  const [newTypeScopeLevel, setNewTypeScopeLevel] = useState<(typeof SCOPE_LEVEL_ORDER)[number]>('project')
  const [newTypePlannedFinishDate, setNewTypePlannedFinishDate] = useState('')
  const [newTypeCategory, setNewTypeCategory] = useState('')
  const [newTypeIcon, setNewTypeIcon] = useState('验')
  const [newTypeColor, setNewTypeColor] = useState<(typeof CHART_PALETTE)[number]>(CHART_PALETTE[0])

  const reset = () => {
    setNewTypeName('')
    setNewTypeShortName('')
    setNewTypeDescription('')
    setNewTypePhaseCode('special_acceptance')
    setNewTypeScopeLevel('project')
    setNewTypePlannedFinishDate('')
    setNewTypeCategory('')
    setNewTypeIcon('验')
    setNewTypeColor(CHART_PALETTE[0])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = () => {
    if (!newTypeName.trim()) return
    const trimmedName = newTypeName.trim()
    const trimmedShortName = newTypeShortName.trim() || trimmedName.slice(0, 4)
    const trimmedCategory = newTypeCategory.trim()
    onAddType({
      name: trimmedName,
      shortName: trimmedShortName,
      color: newTypeColor,
      icon: newTypeIcon,
      description: newTypeDescription.trim() || undefined,
      phaseCode: newTypePhaseCode,
      scopeLevel: newTypeScopeLevel,
      plannedFinishDate: newTypePlannedFinishDate || undefined,
      category: trimmedCategory || undefined,
      isSystem: false,
      sortOrder: customTypes.length,
    })
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[80vh] max-w-[560px] overflow-y-auto">
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
                    <Button variant="ghost" type="button" onClick={() => onDeleteType(type.id)} disabled={!canEdit} className="ml-1 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />
          <div className="pt-4">
            <h4 className="mb-3 text-sm font-medium text-slate-700">新增类型</h4>
            <div className="space-y-3">
              <div>
                <Label>类型名称</Label>
                <Input value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="例如：专项验收" className="mt-1" />
              </div>
              <div>
                <Label>类型简称</Label>
                <Input value={newTypeShortName} onChange={(event) => setNewTypeShortName(event.target.value)} placeholder="例如：专项验收 / 专项" className="mt-1" />
              </div>
              <div>
                <Label>阶段</Label>
                <select
                  value={newTypePhaseCode}
                  onChange={(event) => setNewTypePhaseCode(event.target.value as (typeof ACCEPTANCE_PHASE_OPTIONS)[number]['value'])}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {ACCEPTANCE_PHASE_OPTIONS.map((phase) => (
                    <option key={phase.value} value={phase.value}>{phase.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>范围层级</Label>
                <select
                  value={newTypeScopeLevel}
                  onChange={(event) => setNewTypeScopeLevel(event.target.value as (typeof SCOPE_LEVEL_ORDER)[number])}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {SCOPE_LEVEL_ORDER.map((scopeLevel) => (
                    <option key={scopeLevel} value={scopeLevel}>{getScopeLevelLabel(scopeLevel)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>分类</Label>
                <Input value={newTypeCategory} onChange={(event) => setNewTypeCategory(event.target.value)} placeholder="例如：消防 / 规划 / 材料" className="mt-1" />
              </div>
              <div>
                <Label>计划完成日期</Label>
                <Input value={newTypePlannedFinishDate} type="date" onChange={(event) => setNewTypePlannedFinishDate(event.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>描述</Label>
                <Textarea value={newTypeDescription} onChange={(event) => setNewTypeDescription(event.target.value)} placeholder="补充类型说明" className="mt-1 min-h-20" />
              </div>
              <div>
                <Label>图标</Label>
                <Input value={newTypeIcon} onChange={(event) => setNewTypeIcon(event.target.value)} placeholder="例如：验" maxLength={2} className="mt-1" />
              </div>
              <div>
                <Label>颜色</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHART_PALETTE.map((color) => (
                    <Button variant="ghost" key={color} type="button" onClick={() => setNewTypeColor(color)} className={cn('h-8 w-8 rounded-full transition-all', newTypeColor === color && 'ring-2 ring-slate-400 ring-offset-2')} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={!canEdit || !newTypeName.trim()} className="w-full gap-2">
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
  canEdit = true,
  onClose,
  onSubmit,
}: {
  open: boolean
  acceptanceTypes: AcceptanceType[]
  canEdit?: boolean
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
      <DialogContent className="max-w-[560px]">
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
                <Button variant="ghost" key={preset} type="button" onClick={() => handlePickPreset(preset)} className={cn('rounded-full border px-2 py-1 text-xs transition-colors', name === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300')}>
                  {preset}
                </Button>
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
          <Button onClick={handleSubmit} loading={submitting} disabled={!canEdit || !name.trim()} className="gap-2">
            <Plus className="h-4 w-4" />
            确认创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
