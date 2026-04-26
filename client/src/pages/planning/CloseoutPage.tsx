import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningWorkspaceLayers } from '@/components/planning/PlanningWorkspaceLayers'
import { DataConfidenceBreakdown } from '@/components/DataConfidenceBreakdown'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LoadingState } from '@/components/ui/loading-state'
import { usePlanningStore } from '@/hooks/usePlanningStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import type { Task } from '@/pages/GanttViewTypes'
import type { MonthlyPlanVersion } from '@/types/planning'
import { AlertTriangle, Clock, MoreHorizontal, RefreshCw, Search } from 'lucide-react'

import { CloseoutBatchBar } from './components/CloseoutBatchBar'
import {
  CloseoutConfirmDialog,
  type CloseoutConfirmMode,
  type CloseoutConfirmState,
  type CloseoutConfirmSummary,
} from './components/CloseoutConfirmDialog'
import { CloseoutDetailDrawer, type CloseoutReasonBranch } from './components/CloseoutDetailDrawer'
import { CloseoutGroupedList, type CloseoutGroup, type CloseoutItem } from './components/CloseoutGroupedList'
import {
  type MonthlyPlanDetail,
  buildPlanningTabs,
  getMonthlyCommitmentLabel,
  formatMonthLabel,
  getMonthlyPlanStatusLabel,
  formatDate,
  shiftMonth,
  sortMonthlyPlanVersions,
} from './planningShared'

type CloseoutAction = 'close' | 'refresh' | 'auto_adopt' | null
type CloseoutPersistedState = { processedIds: string[] }
type CloseoutFilter = 'all' | 'pending' | 'processed' | 'overdue'
type CloseoutGroupingMode = 'suggestion' | 'processing' | 'commitment'
type CloseoutOverviewSummary = {
  totalCount: number
  processedCount: number
  remainingCount: number
  autoAdoptableCount: number
}
type CloseoutConfirmSummaryResponse = {
  rolledInCount: number
  closedCount: number
  manualOverrideCount: number
  forcedCount: number
}

function getProcessedStorageKey(planId: string) {
  return `planning-closeout:${planId}`
}

function readProcessedState(planId: string): CloseoutPersistedState {
  const raw = safeStorageGet(window.localStorage, getProcessedStorageKey(planId))
  const parsed = safeJsonParse<{ processedIds?: string[] } | null>(
    raw,
    null,
    getProcessedStorageKey(planId),
  )
  return { processedIds: Array.isArray(parsed?.processedIds) ? parsed.processedIds : [] }
}

function persistProcessedState(planId: string, processedIds: string[]) {
  safeStorageSet(
    window.localStorage,
    getProcessedStorageKey(planId),
    JSON.stringify({ processedIds }),
  )
}

function clearProcessedState(planId: string) {
  safeStorageRemove(window.localStorage, getProcessedStorageKey(planId))
}

function getOverdueDays(month: string) {
  const due = new Date(`${shiftMonth(month, 1)}-01T00:00:00`)
  const now = new Date()
  const diff = now.getTime() - due.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function buildCloseoutItems(plan: MonthlyPlanDetail | null, tasks: Task[]): CloseoutItem[] {
  if (!plan) return []
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const overdueDays = getOverdueDays(plan.month)

  return [...plan.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => {
      const task = item.source_task_id ? taskById.get(item.source_task_id) ?? null : null
      const done = item.commitment_status === 'completed' || (item.current_progress ?? 0) >= (item.target_progress ?? 100)
      const carried = item.commitment_status === 'carried_over'
      const cancelled = item.commitment_status === 'cancelled'
      const suggestion = done ? '建议关闭处理' : carried ? '建议滚入下月' : '需要人工判断'
      const groupId = done ? 'closeout-close' : carried ? 'closeout-carry' : 'closeout-manual'
      const sourceHierarchyLabel = item.carryover_from_item_id
        ? '上月承接 / 月计划条目'
        : item.baseline_item_id
          ? '项目基线 / 月计划条目'
          : task
            ? '当前排期 / 月计划条目'
            : '月计划自建 / 条目'
      const sourceEntityLabel = item.is_milestone ? '关键节点' : '执行项'
      const closeReasonLabel = done
        ? '当月已消化关闭'
        : carried
          ? '条目延后至后续阶段'
          : cancelled
            ? '条目取消或不再需要'
            : item.carryover_from_item_id
              ? '条目合并到其他条目'
              : '因范围变更移出'
      const status =
        !done && overdueDays >= 5 ? 'overdue' : !done && overdueDays >= 3 ? 'stale' : 'normal'
      const escalationLabel =
        !done && overdueDays >= 7
          ? '第 7 日强制关账窗口'
          : !done && overdueDays >= 5
            ? '第 5 日升级催办'
            : !done && overdueDays >= 3
              ? '第 3 日提醒'
              : undefined

      return {
        id: item.id,
        title: item.title,
        summary:
          item.notes?.trim() ||
          `目标 ${item.target_progress ?? 0}% / 当前 ${item.current_progress ?? 0}% · ${item.is_milestone ? '关键节点' : '执行项'}`,
        groupId,
        systemSuggestion: suggestion,
        status,
        commitmentLabel: getMonthlyCommitmentLabel(item.commitment_status),
        escalationLabel,
        sourceHierarchyLabel,
        sourceEntityLabel,
        closeReasonLabel,
        taskTitle: task?.title ?? task?.name ?? undefined,
        planStartLabel: formatDate(item.planned_start_date) ?? undefined,
        planEndLabel: formatDate(item.planned_end_date) ?? undefined,
        planProgressLabel:
          typeof item.current_progress === 'number' || typeof item.target_progress === 'number'
            ? `当前 ${item.current_progress ?? 0}% / 目标 ${item.target_progress ?? 0}%`
            : undefined,
        taskStartLabel: formatDate(task?.planned_start_date ?? task?.start_date) ?? undefined,
        taskEndLabel: formatDate(task?.planned_end_date ?? task?.end_date) ?? undefined,
        taskProgressLabel: task ? `${Math.round(Number(task.progress ?? 0))}%` : undefined,
      } satisfies CloseoutItem
    })
}

function buildCloseoutGroups(items: CloseoutItem[], mode: CloseoutGroupingMode): CloseoutGroup[] {
  const groups =
    mode === 'processing'
      ? ([
          {
            id: 'closeout-processing-escalated',
            title: '升级关注',
            description: '',
            badge: '梯度升级',
          },
          {
            id: 'closeout-processing-pending',
            title: '待处理',
            description: '',
            badge: '处理中',
          },
          {
            id: 'closeout-processing-processed',
            title: '已处理',
            description: '',
            badge: '已落账',
          },
        ] as const)
      : mode === 'commitment'
        ? ([
            {
              id: 'closeout-commitment-completed',
              title: '已完成承诺',
              description: '',
              badge: '完成态',
            },
            {
              id: 'closeout-commitment-planned',
              title: '本月承诺',
              description: '',
              badge: '本月承诺',
            },
            {
              id: 'closeout-commitment-carry',
              title: '滚入下月',
              description: '',
              badge: '滚入态',
            },
            {
              id: 'closeout-commitment-cancelled',
              title: '已取消 / 其他',
              description: '',
              badge: '人工判断',
            },
          ] as const)
        : ([
            { id: 'closeout-manual', title: '需要人工判断', description: '', badge: '人工判断' },
            { id: 'closeout-close', title: '建议关闭处理', description: '', badge: '关闭优先' },
            { id: 'closeout-carry', title: '建议滚入下月', description: '', badge: '滚入下月' },
          ] as const)

  return groups
    .map((group) => ({
      ...group,
      items: items.filter((item) => {
        if (mode === 'processing') {
          if (item.processed) return group.id === 'closeout-processing-processed'
          if (item.status === 'stale' || item.status === 'overdue') return group.id === 'closeout-processing-escalated'
          return group.id === 'closeout-processing-pending'
        }

        if (mode === 'commitment') {
          if (item.commitmentLabel === '已完成') return group.id === 'closeout-commitment-completed'
          if (item.commitmentLabel === '滚入下月') return group.id === 'closeout-commitment-carry'
          if (item.commitmentLabel === '本月承诺') return group.id === 'closeout-commitment-planned'
          return group.id === 'closeout-commitment-cancelled'
        }

        return item.groupId === group.id
      }),
    }))
    .filter((group) => group.items.length > 0)
}

export default function CloseoutPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const { canEdit, globalRole, isOwner, permissionLevel } = usePermissions({ projectId: currentProject?.id ?? id })
  const canManagePlanning = canEdit || isOwner || globalRole === 'company_admin'
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const clearSelection = usePlanningStore((state) => state.clearSelection)
  const setActiveWorkspace = usePlanningStore((state) => state.setActiveWorkspace)

  const projectId = id ?? ''
  const [planVersions, setPlanVersions] = useState<MonthlyPlanVersion[]>([])
  const [activePlan, setActivePlan] = useState<MonthlyPlanDetail | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [processedIds, setProcessedIds] = useState<string[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [batchLayerOpen, setBatchLayerOpen] = useState(false)
  const [reasonBranch, setReasonBranch] = useState<CloseoutReasonBranch>('system')
  const [reasonLeaf, setReasonLeaf] = useState('采纳系统建议')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState<CloseoutConfirmMode>('single')
  const [confirmState, setConfirmState] = useState<CloseoutConfirmState>('ready')
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [closeoutOverviewSummary, setCloseoutOverviewSummary] = useState<CloseoutOverviewSummary | null>(null)
  const [closeoutConfirmSummary, setCloseoutConfirmSummary] = useState<CloseoutConfirmSummaryResponse | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<CloseoutAction>(null)
  const [activeFilter, setActiveFilter] = useState<CloseoutFilter>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupingMode, setGroupingMode] = useState<CloseoutGroupingMode>('suggestion')

  const items = useMemo(() => buildCloseoutItems(activePlan, tasks), [activePlan, tasks])
  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase('zh-CN')

    return items.filter((item) => {
      const processed = processedIds.includes(item.id) || item.processed
      const matchesFilter =
        activeFilter === 'all'
          ? true
          : activeFilter === 'pending'
            ? !processed
            : activeFilter === 'processed'
              ? Boolean(processed)
              : item.status === 'overdue'
      const haystack = `${item.title} ${item.summary} ${item.systemSuggestion}`.toLocaleLowerCase('zh-CN')
      const matchesSearch = !keyword || haystack.includes(keyword)
      return matchesFilter && matchesSearch
    })
  }, [activeFilter, items, processedIds, searchQuery])
  const filteredItemsWithState = useMemo(
    () =>
      filteredItems.map((item) => ({
        ...item,
        processed: processedIds.includes(item.id) || item.processed,
      })),
    [filteredItems, processedIds],
  )
  const groups = useMemo(() => buildCloseoutGroups(filteredItemsWithState, groupingMode), [filteredItemsWithState, groupingMode])
  const activeItem = useMemo(
    () =>
      filteredItemsWithState.length
        ? filteredItemsWithState.find((item) => item.id === activeItemId) ?? filteredItemsWithState[0]
        : null,
    [activeItemId, filteredItemsWithState],
  )
  const selectedItems = useMemo(() => items.filter((item) => selectedItemIds.includes(item.id)), [items, selectedItemIds])
  const totalCount = closeoutOverviewSummary?.totalCount ?? 0
  const processedCount = (closeoutOverviewSummary?.processedCount ?? 0) + processedIds.length
  const remainingCount = Math.max(totalCount - processedCount, 0)
  const processedAutoAdoptableCount = useMemo(
    () => items.filter((item) => item.groupId === 'closeout-close' && processedIds.includes(item.id)).length,
    [items, processedIds],
  )
  const autoAdoptableBaseCount = closeoutOverviewSummary?.autoAdoptableCount ?? 0
  const autoAdoptableCount = Math.max(autoAdoptableBaseCount - processedAutoAdoptableCount, 0)
  const overdueDays = activePlan ? getOverdueDays(activePlan.month) : 0
  const forceCloseUnlocked = overdueDays >= 7
  const readOnly = !canEdit
  const tabs = useMemo(
    () => buildPlanningTabs({ navigate, projectId, activeKey: 'monthly' }),
    [navigate, projectId],
  )

  const closeoutSummary: CloseoutConfirmSummary = useMemo(
    () => ({
      rolledInCount: closeoutConfirmSummary?.rolledInCount ?? 0,
      closedCount: closeoutConfirmSummary?.closedCount ?? 0,
      manualOverrideCount: closeoutConfirmSummary?.manualOverrideCount ?? 0,
      forcedCount: closeoutConfirmSummary?.forcedCount ?? 0,
      remainingCount,
    }),
    [closeoutConfirmSummary, remainingCount],
  )

  const loadCloseoutContext = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setPageLoading(false)
      setPlanVersions([])
      setActivePlan(null)
      setTasks([])
      setDataQualitySummary(null)
      setCloseoutOverviewSummary(null)
      setCloseoutConfirmSummary(null)
      setProcessedIds([])
      return
    }

    setPageLoading(true)
    setPageError(null)
    setStatusNotice(null)
    try {
      const versions = sortMonthlyPlanVersions(
        await apiGet<MonthlyPlanVersion[]>(`/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`, { signal }),
      )
      const currentPlan =
        versions.find((item) => item.status === 'confirmed' && !item.closeout_at) ??
        versions.find((item) => item.status === 'confirmed') ??
        null

      const [detail, taskList] = await Promise.all([
        currentPlan
          ? apiGet<MonthlyPlanDetail>(
              `/api/monthly-plans/${currentPlan.id}?project_id=${encodeURIComponent(projectId)}`,
              { signal },
            )
          : Promise.resolve(null),
        apiGet<Task[]>(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, { signal }),
      ])
      const [qualitySummary, overviewSummary, confirmSummary] = await Promise.all([
        DataQualityApiService.getProjectSummary(projectId, detail?.month ?? currentPlan?.month, {
          signal,
        }),
        detail
          ? apiGet<CloseoutOverviewSummary>(
              `/api/monthly-plans/${detail.id}/closeout-summary?project_id=${encodeURIComponent(projectId)}`,
              { signal },
            ).catch(() => null)
          : Promise.resolve(null),
        detail
          ? apiGet<CloseoutConfirmSummaryResponse>(
              `/api/monthly-plans/${detail.id}/closeout-confirm-summary?project_id=${encodeURIComponent(projectId)}`,
              { signal },
            ).catch(() => null)
          : Promise.resolve(null),
      ])
      const persistedState = detail ? readProcessedState(detail.id) : { processedIds: [] }

      setPlanVersions(versions)
      setActivePlan(detail)
      setTasks(taskList)
      setDataQualitySummary(qualitySummary)
      setCloseoutOverviewSummary(overviewSummary)
      setCloseoutConfirmSummary(confirmSummary)
      setProcessedIds(persistedState.processedIds)
      setActiveItemId(detail?.items[0]?.id ?? null)
    } catch (error) {
      if (signal?.aborted) return
      setActivePlan(null)
      setTasks([])
      setDataQualitySummary(null)
      setCloseoutOverviewSummary(null)
      setCloseoutConfirmSummary(null)
      setProcessedIds([])
      setPageError(getApiErrorMessage(error, '月末关账页面加载失败，请稍后重试。'))
    } finally {
      setPageLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    setActiveWorkspace('monthly')
    clearSelection()
    const controller = new AbortController()
    void loadCloseoutContext(controller.signal)
    return () => { controller.abort() }
  }, [clearSelection, loadCloseoutContext, setActiveWorkspace])

  useEffect(() => {
    setActiveFilter('pending')
    setSearchQuery('')
    setGroupingMode('suggestion')
    setReasonBranch('system')
    setReasonLeaf('确认已完成')
    setBatchLayerOpen(false)
    setConfirmOpen(false)
    setConfirmMode('single')
    setConfirmState('ready')
    clearSelection()
  }, [activePlan?.id])

  useEffect(() => {
    if (!activePlan) return
    persistProcessedState(activePlan.id, processedIds)
  }, [activePlan, processedIds])

  useEffect(() => {
    if (!filteredItems.length) {
      setActiveItemId(null)
      return
    }

    if (!filteredItems.some((item) => item.id === activeItemId)) {
      setActiveItemId(filteredItems[0].id)
    }
  }, [activeItemId, filteredItems])

  const markProcessed = (idsToMark: string[]) => {
    setProcessedIds((current) => Array.from(new Set([...current, ...idsToMark])))
  }

  const handleAutoAdopt = () => {
    if (!activePlan || readOnly || autoAdoptableCount === 0) return

    setActionLoading('auto_adopt')
    void apiPost<{ processedIds: string[]; autoAdoptableCount: number; totalCount: number; processedCount: number; remainingCount: number }>(
      `/api/monthly-plans/${activePlan.id}/closeout-auto-adopt`,
      {
        processed_ids: processedIds,
      },
    )
      .then((response) => {
        const adoptedIds = response.processedIds ?? []
        if (adoptedIds.length > 0) {
          markProcessed(adoptedIds)
        }
        toast({
          title: '已一键采纳系统建议',
          description: `已采纳 ${adoptedIds.length} 条建议关闭事项。`,
        })
      })
      .catch((error) => {
        toast({
          title: '一键采纳失败',
          description: getApiErrorMessage(error, '请稍后重试。'),
          variant: 'destructive',
        })
      })
      .finally(() => {
        setActionLoading(null)
      })
  }

  const handleCloseoutConfirm = async () => {
    if (!activePlan) return
    if (confirmMode === 'force' && (!forceCloseUnlocked || !canManagePlanning)) return
    if (confirmMode !== 'force' && readOnly) return

    setActionLoading('close')
    try {
      const endpoint = confirmMode === 'force' ? 'force-close' : 'close'
      await apiPost<MonthlyPlanDetail>(`/api/monthly-plans/${activePlan.id}/${endpoint}`, {
        version: activePlan.version,
        month: activePlan.month,
      })
      clearProcessedState(activePlan.id)
      clearSelection()
      setBatchLayerOpen(false)
      setConfirmOpen(false)
      setConfirmState('ready')
      setConfirmMode('single')
      toast({
        title: confirmMode === 'force' ? '本月已完成强制关账' : '本月已完成关账',
        description:
          confirmMode === 'force'
            ? `${formatMonthLabel(activePlan.month)} 已写入强制关账结果。`
            : `${formatMonthLabel(activePlan.month)} 已写入真实关账结果。`,
      })
      navigate(`/projects/${projectId}/planning/monthly?closeout_complete=1&month=${encodeURIComponent(shiftMonth(activePlan.month, 1))}`)
    } catch (error) {
      setConfirmState('failed')
      setConfirmOpen(true)
      toast({
        title: '关账失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (!currentProject) {
    return (
      <div className="space-y-4 p-6">
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>请先选择项目，再进入月末关账页。</AlertDescription>
        </Alert>
      </div>
    )
  }

  const summary = (
    <Card variant="detail">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">月末关账工作台</Badge>
              <Badge variant="outline">{activePlan ? getMonthlyPlanStatusLabel(activePlan.status) : '暂无可关账月份'}</Badge>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">月末待处理事项</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {forceCloseUnlocked ? <Badge variant="secondary">已到第 7 日，可强制发起关账</Badge> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              loading={actionLoading === 'auto_adopt'}
              onClick={handleAutoAdopt}
              disabled={readOnly || autoAdoptableCount === 0 || actionLoading === 'auto_adopt'}
            >
              一键采纳系统建议
            </Button>
          </div>
        </div>

        <div
          data-testid="closeout-escalation-ladder"
          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-3"
        >
          {[
            {
              day: 3,
              title: '+3 天提醒',
            },
            {
              day: 5,
              title: '+5 天升级',
            },
            {
              day: 7,
              title: '+7 天强制关账窗口',
            },
          ].map((step) => {
            const active = overdueDays >= step.day
            return (
              <div
                key={step.day}
                className={`rounded-2xl border px-4 py-3 ${
                  active ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-white/80 bg-white text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{step.title}</div>
                  <Badge variant={active ? 'secondary' : 'outline'}>{active ? '当前已触发' : '未触发'}</Badge>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">关账月份</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{activePlan ? formatMonthLabel(activePlan.month) : '暂无'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">总待处理数</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{totalCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">已处理</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{processedCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-xs text-amber-700">剩余未处理</div>
            <div className="mt-1 text-lg font-semibold text-amber-900">{remainingCount}</div>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
            <div className="text-xs text-cyan-700">建议可一键采纳数</div>
            <div className="mt-1 text-lg font-semibold text-cyan-900">{autoAdoptableCount}</div>
          </div>
        </div>
        {dataQualitySummary ? (
          <div
            data-testid="closeout-data-quality-card"
            className={`rounded-2xl border px-4 py-4 ${
              dataQualitySummary.confidence.flag === 'low'
                ? 'border-amber-200 bg-amber-50'
                : 'border-sky-200 bg-sky-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">数据质量留痕</div>
                <div className="text-lg font-semibold text-slate-900">
                  当前月份数据置信度 {Math.round(dataQualitySummary.confidence.score)}%
                </div>
              </div>
              {activePlan?.data_confidence_score ? (
                <Badge variant="outline">已写入关账记录 {Math.round(activePlan.data_confidence_score)}%</Badge>
              ) : (
                <Badge variant="secondary">确认关账时自动写入记录</Badge>
              )}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-4">
              <div>活跃异常 {dataQualitySummary.confidence.activeFindingCount} 条</div>
            </div>
            <div className="mt-4">
              <DataConfidenceBreakdown
                confidence={dataQualitySummary.confidence}
                title="本月置信度降分贡献"
                compact
                testId="closeout-data-quality-breakdown"
              />
            </div>
          </div>
        ) : null}
        <div
          data-testid="closeout-filter-bar"
          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">筛选与搜索</div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索关账条目、摘要或系统建议"
                className="border-0 px-0 shadow-none focus-visible:ring-0"
                data-testid="closeout-search-input"
              />
            </div>
            <div className="text-xs text-slate-500">
              {filteredItems.length === items.length
                ? `当前显示全部 ${items.length} 项`
                : `当前显示 ${filteredItems.length} / ${items.length} 项`}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {([
              { key: 'all', label: '全部' },
              { key: 'pending', label: '仅看未处理' },
              { key: 'processed', label: '已处理' },
              { key: 'overdue', label: '超期' },
            ] as Array<{ key: CloseoutFilter; label: string }>).map((filter) => (
              <Button
                key={filter.key}
                type="button"
                size="sm"
                variant={activeFilter === filter.key ? 'default' : 'outline'}
                className="rounded-full"
                data-testid={`closeout-filter-${filter.key}`}
                onClick={() => setActiveFilter(filter.key)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const sectionHeader = (
    <Card variant="detail">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-900">关账分组与状态</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{processedCount}/{items.length} 已处理</Badge>
            <Badge variant="outline">下月入口：{activePlan ? formatMonthLabel(shiftMonth(activePlan.month, 1)) : '待生成'}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'processing', label: '按变更类型' },
            { key: 'commitment', label: '按范围维度' },
            { key: 'suggestion', label: '按系统建议' },
          ] as Array<{ key: CloseoutGroupingMode; label: string }>).map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={groupingMode === option.key ? 'default' : 'outline'}
              className="rounded-full"
              data-testid={`closeout-grouping-${option.key}`}
              onClick={() => setGroupingMode(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  const main = pageLoading ? (
    <LoadingState
      label="月末关账加载中"
      description=""
      className="min-h-32 rounded-2xl border border-slate-200 bg-white"
    />
  ) : activePlan ? (
    groups.length > 0 ? (
      <CloseoutGroupedList
        groups={groups}
        selectedItemIds={selectedItemIds}
        processedItemIds={processedIds}
        activeItemId={activeItem?.id ?? null}
        onToggleItem={(itemId) =>
          setSelectedItemIds(
            selectedItemIds.includes(itemId) ? selectedItemIds.filter((id) => id !== itemId) : [...selectedItemIds, itemId],
          )
        }
        onOpenItem={(itemId) => {
          setActiveItemId(itemId)
          setBatchLayerOpen(false)
        }}
      />
    ) : (
      <Card data-testid="closeout-empty-state" className="border-dashed border-slate-300 bg-slate-50">
        <CardContent className="space-y-3 p-6">
          <div className="text-lg font-semibold text-slate-900">当前筛选下没有匹配条目</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setActiveFilter('all')}>
              显示全部
            </Button>
            <Button type="button" variant="outline" onClick={() => setSearchQuery('')}>
              清空搜索
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  ) : (
    <Card className="border-dashed border-slate-300 bg-slate-50">
      <CardContent className="space-y-3 p-6">
        <div className="text-lg font-semibold text-slate-900">当前没有可关账的已确认月份</div>
        <Button type="button" onClick={() => navigate(`/projects/${projectId}/planning/monthly`)}>
          去月度计划
        </Button>
      </CardContent>
    </Card>
  )

  const aside = (
    <>
      {pageError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {statusNotice ? (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>{statusNotice}</AlertDescription>
        </Alert>
      ) : null}

      <CloseoutDetailDrawer
        open={Boolean(activeItem)}
        item={activeItem}
        selectedItems={selectedItems}
        batchLayerOpen={batchLayerOpen}
        forceCloseUnlocked={forceCloseUnlocked}
        reasonBranch={reasonBranch}
        reasonLeaf={reasonLeaf}
        readOnly={readOnly}
        onClose={() => setBatchLayerOpen(false)}
        onToggleBatchLayer={setBatchLayerOpen}
        onSelectReasonBranch={setReasonBranch}
        onSelectReasonLeaf={setReasonLeaf}
        onProcessCurrentItem={() => {
          if (!activeItem) return
          const nextProcessed = Array.from(new Set([...processedIds, activeItem.id]))
          markProcessed([activeItem.id])
          if (nextProcessed.length >= items.length && items.length > 0) {
            setConfirmMode('single')
            setConfirmState('ready')
            setConfirmOpen(true)
          }
        }}
        onProcessSelectedItems={() => {
          const nextProcessed = Array.from(new Set([...processedIds, ...selectedItemIds]))
          markProcessed(selectedItemIds)
          setBatchLayerOpen(false)
          if (nextProcessed.length >= items.length && items.length > 0) {
            setConfirmMode('batch')
            setConfirmState('ready')
            setConfirmOpen(true)
          }
        }}
      />
    </>
  )

  return (
    <PlanningPageShell
      projectName={currentProject.name ?? '未命名项目'}
      title="任务列表 / 月末关账"
      description="收口当月待处理事项，并把结果带回月度计划。"
      tabs={tabs}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
            data-testid="closeout-refresh-entry"
            onClick={() => {
              setActionLoading('refresh')
              void (async () => {
                try {
                  await loadCloseoutContext()
                } finally {
                  setActionLoading(null)
                }
              })()
            }}
            loading={actionLoading === 'refresh'}
          >
            {actionLoading !== 'refresh' ? <RefreshCw className="h-4 w-4" /> : null}
            重新生成清单
          </Button>
          {canManagePlanning ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
                  data-testid="closeout-more-actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  ...
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  data-testid="closeout-force-close-entry"
                  disabled={!forceCloseUnlocked}
                  onSelect={() => {
                    setConfirmMode('force')
                    setConfirmState('ready')
                    setConfirmOpen(true)
                  }}
                >
                  强制发起关账
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      }
    >
      <div className="space-y-4 pb-24">
        <PlanningWorkspaceLayers summary={summary} sectionHeader={sectionHeader} main={main} aside={aside} />
      </div>

      <CloseoutBatchBar
        selectedCount={selectedItemIds.length}
        drawerOpen={Boolean(activeItem)}
        readOnly={readOnly}
        onOpenBatchLayer={() => setBatchLayerOpen(true)}
        onClearSelection={() => setSelectedItemIds([])}
      />

      <CloseoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode={confirmMode}
        state={confirmState}
        summary={closeoutSummary}
        onConfirm={() => void handleCloseoutConfirm()}
        onRetry={() => void handleCloseoutConfirm()}
      />
    </PlanningPageShell>
  )
}
