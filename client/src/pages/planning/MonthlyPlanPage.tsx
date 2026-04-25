import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningWorkspaceLayers } from '@/components/planning/PlanningWorkspaceLayers'
import { ValidationPanel } from '@/components/planning/ValidationPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { usePlanningStore, type PlanningValidationIssue } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type { BaselineVersion, MonthlyPlanVersion, PlanningDraftLockRecord } from '@/types/planning'
import type { Task, TaskCondition, TaskObstacle } from '@/pages/GanttViewTypes'
import { AlertTriangle, CalendarDays, Clock, FileDiff, Layers3, Lock, RefreshCw, WandSparkles } from 'lucide-react'

import { BaselineTreeEditor } from './components/BaselineTreeEditor'
import { MonthlyPlanBottomBar } from './components/MonthlyPlanBottomBar'
import {
  MonthlyPlanConfirmDialog,
  type MonthlyPlanConfirmMode,
  type MonthlyPlanConfirmState,
} from './components/MonthlyPlanConfirmDialog'
import { MonthlyPlanExceptionSummary } from './components/MonthlyPlanExceptionSummary'
import { MonthlyPlanHeader } from './components/MonthlyPlanHeader'
import { MonthlyPlanSkeletonDiffDialog } from './components/MonthlyPlanSkeletonDiffDialog'
import { PlanningDraftResumeDialog } from './components/PlanningDraftResumeDialog'
import {
  buildPlanningDraftResumeKey,
  clearPlanningDraftResumeSnapshot,
  readPlanningDraftResumeSnapshot,
  writePlanningDraftResumeSnapshot,
  type PlanningDraftResumeSnapshot,
} from './draftPersistence'
import {
  type BaselineDetail,
  type DraftLockResponse,
  type MonthlyPlanDetail,
  buildMonthWindow,
  buildMonthlyPlanRows,
  buildPlanningTabs,
  extractApiErrorCode,
  formatCountdown,
  formatDate,
  formatMonthLabel,
  getMonthlyPlanStatusLabel,
  mapBaselineItemsToMonthlyItems,
  mapTasksToMonthlyItems,
  shiftMonth,
  sortBaselineVersions,
  sortMonthlyPlanVersions,
} from './planningShared'

type MonthlyAction =
  | 'generate'
  | 'save'
  | 'confirm'
  | 'unlock'
  | 'queue_realign'
  | 'resolve_realign'
  | null
type MonthlySourceMode = 'baseline' | 'schedule'
type MonthlyEditableField = 'title' | 'start' | 'end' | 'progress'
type MonthlyEditorSnapshot = { items: MonthlyPlanDetail['items']; selectedIds: string[] }

const SOURCE_OPTIONS: Array<{
  key: MonthlySourceMode
  title: string
  description: string
}> = [
  {
    key: 'baseline',
    title: '基于项目基线生成',
    description: '沿用正式基线的层级和关键节点生成本月草稿。',
  },
  {
    key: 'schedule',
    title: '基于当前任务列表生成',
    description: '按当前任务列表生成本月草稿，适合先按现状编排。',
  },
]

function getCurrentMonth() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function resolvePreferredMonth(
  versions: MonthlyPlanVersion[],
  preferredMonth: string | null | undefined,
  fallbackMonth: string,
) {
  const normalizedPreferred = preferredMonth?.trim() ?? ''
  if (normalizedPreferred) return normalizedPreferred
  if (versions.some((version) => version.month === fallbackMonth)) return fallbackMonth
  return versions.find((version) => version.status === 'draft')?.month || versions[0]?.month || fallbackMonth
}

function cloneMonthlyItems(plan: MonthlyPlanDetail) {
  return [...plan.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => ({
      baseline_item_id: item.baseline_item_id ?? null,
      carryover_from_item_id: item.carryover_from_item_id ?? null,
      source_task_id: item.source_task_id ?? null,
      title: item.title,
      planned_start_date: item.planned_start_date ?? null,
      planned_end_date: item.planned_end_date ?? null,
      target_progress: item.target_progress ?? null,
      current_progress: item.current_progress ?? null,
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order : index,
      is_milestone: Boolean(item.is_milestone),
      is_critical: Boolean(item.is_critical),
      commitment_status: item.commitment_status ?? 'planned',
      notes: item.notes ?? null,
    }))
}

function cloneMonthlyEditorItems(plan: MonthlyPlanDetail | null) {
  if (!plan) return [] as MonthlyPlanDetail['items']
  return [...plan.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({ ...item }))
}

function serializeMonthlyEditorItem(item: MonthlyPlanDetail['items'][number]) {
  return JSON.stringify({
    id: item.id,
    title: item.title,
    planned_start_date: item.planned_start_date ?? null,
    planned_end_date: item.planned_end_date ?? null,
    target_progress: item.target_progress ?? null,
    sort_order: item.sort_order,
  })
}

function serializeMonthlyEditorSnapshot(snapshot: MonthlyEditorSnapshot) {
  return JSON.stringify({
    items: snapshot.items.map((item) => ({
      id: item.id,
      title: item.title,
      planned_start_date: item.planned_start_date ?? null,
      planned_end_date: item.planned_end_date ?? null,
      target_progress: item.target_progress ?? null,
      sort_order: item.sort_order,
    })),
    selectedIds: snapshot.selectedIds,
  })
}

function countChangedMonthlyEntries(initialSnapshot: MonthlyEditorSnapshot | null, currentSnapshot: MonthlyEditorSnapshot) {
  if (!initialSnapshot) return 0

  const initialItemMap = new Map(
    initialSnapshot.items.map((item) => [item.id, serializeMonthlyEditorItem(item)]),
  )
  const currentItemMap = new Map(
    currentSnapshot.items.map((item) => [item.id, serializeMonthlyEditorItem(item)]),
  )
  const changedIds = new Set<string>()

  initialItemMap.forEach((serialized, itemId) => {
    if (currentItemMap.get(itemId) !== serialized) {
      changedIds.add(itemId)
    }
  })
  currentItemMap.forEach((serialized, itemId) => {
    if (initialItemMap.get(itemId) !== serialized) {
      changedIds.add(itemId)
    }
  })

  const initialSelected = new Set(initialSnapshot.selectedIds)
  const currentSelected = new Set(currentSnapshot.selectedIds)
  new Set([...initialSnapshot.selectedIds, ...currentSnapshot.selectedIds]).forEach((itemId) => {
    if (initialSelected.has(itemId) !== currentSelected.has(itemId)) {
      changedIds.add(itemId)
    }
  })

  return changedIds.size
}

function normalizeSelectedIds(ids: string[], allIds: string[]) {
  if (allIds.length === 0) return []
  const selectedSet = new Set(ids)
  return allIds.filter((id) => selectedSet.has(id))
}

function buildMonthlyConfirmReminder(month: string, status?: MonthlyPlanVersion['status']) {
  if (!month || status === 'confirmed' || status === 'closed' || status === 'archived') return null
  const dueDate = new Date(`${month}-03T00:00:00`)
  if (Number.isNaN(dueDate.getTime())) return null

  const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) {
    return {
      tone: 'slate' as const,
      title: '第 3 日催办尚未触发',
      detail: `${formatMonthLabel(month)} 仍在确认窗口内，建议在第 3 日前完成本月确认。`,
      badge: `剩余 ${Math.abs(diffDays)} 天`,
    }
  }

  return {
    tone: diffDays >= 3 ? 'amber' as const : 'emerald' as const,
    title: diffDays === 0 ? '第 3 日催办今日生效' : '第 3 日催办已生效',
    detail:
      diffDays === 0
        ? `${formatMonthLabel(month)} 已进入确认催办节点，请尽快完成确认或补齐阻断项。`
        : `${formatMonthLabel(month)} 已超过第 3 日催办节点 ${diffDays} 天，请优先处理确认链路。`,
    badge: diffDays === 0 ? '今日触发' : `已超 ${diffDays} 天`,
  }
}

function sameIdSequence(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function buildValidationIssues(params: {
  conditions: TaskCondition[]
  obstacles: TaskObstacle[]
  tasks: Task[]
  month: string
  plan: MonthlyPlanDetail | null
}): PlanningValidationIssue[] {
  const today = new Date().toISOString().slice(0, 10)
  const scopedTaskIds = new Set(
    (params.plan?.items ?? [])
      .map((item) => item.source_task_id)
      .filter((taskId): taskId is string => Boolean(taskId)),
  )
  const isScopedTask = (taskId?: string | null) => scopedTaskIds.size === 0 || !taskId || scopedTaskIds.has(taskId)

  const pendingConditions = params.conditions.filter((item) => !item.is_satisfied && isScopedTask(item.task_id))
  const activeObstacles = params.obstacles.filter(
    (item) => !item.is_resolved && item.status !== '已解决' && isScopedTask(item.task_id),
  )
  const delayedTasks = params.tasks.filter((task) => {
    const plannedEnd = task.planned_end_date ?? null
    if (!plannedEnd) return false
    if ((task.status ?? '') === '已完成' || task.progress === 100) return false
    if (!isScopedTask(task.id)) return false
    return plannedEnd.slice(0, 10) < today
  })

  const issues: Array<PlanningValidationIssue | null> = [
    pendingConditions.length
      ? {
          id: 'monthly-condition',
          level: 'error' as const,
          title: String(pendingConditions.length) + ' 项条件尚未满足',
          detail: '确认本月计划前，需要先检查未满足条件是否会影响当月执行。',
        }
      : null,
    activeObstacles.length
      ? {
          id: 'monthly-obstacle',
          level: 'warning' as const,
          title: `${activeObstacles.length} 条阻碍仍在处理中`,
          detail: '建议先处理障碍或补充备注，再进入月度计划确认。',
        }
      : null,
    delayedTasks.length
      ? {
          id: 'monthly-delay',
          level: 'warning' as const,
          title: `${delayedTasks.length} 项执行任务已晚于计划日期`,
          detail: '这些延期信号会直接影响当月完成情况。',
        }
      : null,
    params.plan
      ? {
          id: 'monthly-version',
          level: 'info' as const,
          title: formatMonthLabel(params.month) + ' 当前版本为 v' + params.plan.version,
          detail: '当前状态：' + getMonthlyPlanStatusLabel(params.plan.status) + '。',
        }
      : {
          id: 'monthly-empty',
          level: 'info' as const,
          title: `${formatMonthLabel(params.month)} 尚未生成草稿`,
          detail: '先选择来源生成真实草稿，再进入确认流程。',
        },
  ]

  return issues.filter((issue): issue is PlanningValidationIssue => issue !== null)
}

function buildMonthlyStatusNotice(status: MonthlyPlanVersion['status'], month: string) {
  const monthLabel = formatMonthLabel(month)
  switch (status) {
    case 'draft':
      return `${monthLabel} 当前处于草稿编制态。`
    case 'confirmed':
      return `${monthLabel} 已确认，可继续查看或进入月末关账。`
    case 'closed':
      return `${monthLabel} 已完成关账，仅保留查看与追溯。`
    case 'revising':
      return `${monthLabel} 正在修订中，可继续整理差异并决定是否进入主动重排。`
    case 'pending_realign':
      return `${monthLabel} 已进入待重排态，处理完成后请执行“结束重排”。`
    case 'archived':
      return `${monthLabel} 已归档，仅用于历史对比。`
    default:
      return `${monthLabel} 状态已更新。`
  }
}

export default function MonthlyPlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const clearSelection = usePlanningStore((state) => state.clearSelection)
  const draftStatus = usePlanningStore((state) => state.draftStatus)
  const setDraftStatus = usePlanningStore((state) => state.setDraftStatus)
  const validationIssues = usePlanningStore((state) => state.validationIssues)
  const setValidationIssues = usePlanningStore((state) => state.setValidationIssues)
  const setActiveWorkspace = usePlanningStore((state) => state.setActiveWorkspace)

  const projectId = id ?? ''
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedMonth = searchParams.get('month')?.trim() || ''
  const closeoutCompleted = searchParams.get('closeout_complete') === '1'

  const [selectedMonth, setSelectedMonth] = useState(requestedMonth || getCurrentMonth())
  const [sourceMode, setSourceMode] = useState<MonthlySourceMode>('baseline')
  const [planVersions, setPlanVersions] = useState<MonthlyPlanVersion[]>([])
  const [baselineVersions, setBaselineVersions] = useState<BaselineVersion[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [conditions, setConditions] = useState<TaskCondition[]>([])
  const [obstacles, setObstacles] = useState<TaskObstacle[]>([])
  const [activePlan, setActivePlan] = useState<MonthlyPlanDetail | null>(null)
  const [draftLock, setDraftLock] = useState<PlanningDraftLockRecord | null>(null)
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<MonthlyAction>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState<MonthlyPlanConfirmMode>('standard')
  const [confirmState, setConfirmState] = useState<MonthlyPlanConfirmState>('ready')
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [resumeSnapshot, setResumeSnapshot] = useState<PlanningDraftResumeSnapshot | null>(null)
  const [skeletonDiffOpen, setSkeletonDiffOpen] = useState(false)
  const [resumeInitialized, setResumeInitialized] = useState(false)
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const historyRef = useRef<MonthlyEditorSnapshot[]>([])
  const historyCursorRef = useRef(-1)
  const historyScopeRef = useRef<string | null>(null)
  const initialSnapshotRef = useRef<MonthlyEditorSnapshot | null>(null)
  const [, forceHistoryRender] = useState(0)

  const monthlyDraftResumeKey = useMemo(
    () => buildPlanningDraftResumeKey(`monthly:${selectedMonth}`, projectId || 'none'),
    [projectId, selectedMonth],
  )
  const monthWindow = useMemo(() => buildMonthWindow(selectedMonth, 2), [selectedMonth])
  const latestConfirmedBaseline = useMemo(
    () =>
      sortBaselineVersions(baselineVersions).find(
        (version) => version.status === 'confirmed' || version.status === 'closed',
      ) ?? null,
    [baselineVersions],
  )
  const readOnly = !activePlan || activePlan.status !== 'draft' || draftStatus === 'locked'
  const lockRemainingLabel = formatCountdown(lockSecondsLeft)
  const noBaselineIntercept = !pageLoading && !activePlan && !latestConfirmedBaseline
  const conditionTaskIds = useMemo(
    () => new Set(conditions.filter((item) => !item.is_satisfied).map((item) => item.task_id)),
    [conditions],
  )
  const obstacleTaskIds = useMemo(
    () =>
      new Set(
        obstacles
          .filter((item) => !item.is_resolved && item.status !== '已解决')
          .map((item) => item.task_id),
      ),
    [obstacles],
  )
  const delayedTaskIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return new Set(
      tasks
        .filter((task) => {
          const plannedEnd = task.planned_end_date ?? null
          if (!plannedEnd) return false
          if ((task.status ?? '') === '已完成' || task.progress === 100) return false
          return plannedEnd.slice(0, 10) < today
        })
        .map((task) => task.id),
    )
  }, [tasks])
  const currentSourceLabel = activePlan?.baseline_version_id ? '项目基线' : '当前任务列表'
  const confirmReminder = useMemo(
    () => buildMonthlyConfirmReminder(activePlan?.month ?? selectedMonth, activePlan?.status),
    [activePlan?.month, activePlan?.status, selectedMonth],
  )
  const editorItems = useMemo(() => cloneMonthlyEditorItems(activePlan), [activePlan])
  const allRowIds = useMemo(() => editorItems.map((item) => item.id), [editorItems])
  const normalizedSelectedItemIds = useMemo(
    () => normalizeSelectedIds(selectedItemIds, allRowIds),
    [allRowIds, selectedItemIds],
  )
  const selectionScopeKey = activePlan?.id ?? `monthly:${projectId || 'none'}:${selectedMonth}`
  const currentEditorSnapshot = useMemo<MonthlyEditorSnapshot>(
    () => ({ items: editorItems, selectedIds: normalizedSelectedItemIds }),
    [editorItems, normalizedSelectedItemIds],
  )
  const isDirty =
    !readOnly &&
    activePlan?.status === 'draft' &&
    serializeMonthlyEditorSnapshot(currentEditorSnapshot) !==
      serializeMonthlyEditorSnapshot(initialSnapshotRef.current ?? currentEditorSnapshot)
  const editedEntryCount = useMemo(
    () => countChangedMonthlyEntries(initialSnapshotRef.current, currentEditorSnapshot),
    [currentEditorSnapshot],
  )
  const quickAvailable = Boolean(activePlan) && !readOnly && !validationIssues.some((issue) => issue.level === 'error')
  const canQueueRealignment = activePlan?.status === 'confirmed' || activePlan?.status === 'revising'
  const canResolveRealignment = activePlan?.status === 'pending_realign'
  const conditionIssues = useMemo(
    () => validationIssues.filter((issue) => issue.id.includes('condition')),
    [validationIssues],
  )
  const obstacleIssues = useMemo(
    () => validationIssues.filter((issue) => issue.id.includes('obstacle')),
    [validationIssues],
  )
  const delayIssues = useMemo(
    () => validationIssues.filter((issue) => issue.id.includes('delay')),
    [validationIssues],
  )
  const confirmSummary = useMemo(
    () => ({
      monthLabel: formatMonthLabel(selectedMonth),
      versionLabel: activePlan ? `v${activePlan.version}` : '待生成',
      sourceLabel: currentSourceLabel,
      conditionCount: conditionIssues.length,
      obstacleCount: obstacleIssues.length,
      delayCount: delayIssues.length,
      selectedCount: normalizedSelectedItemIds.length,
    }),
    [activePlan, conditionIssues.length, currentSourceLabel, delayIssues.length, normalizedSelectedItemIds.length, obstacleIssues.length, selectedMonth],
  )
  const confirmSummaryItems = useMemo(
    () => [
      { key: 'month', label: '当前月份', value: confirmSummary.monthLabel },
      { key: 'version', label: '当前版本', value: confirmSummary.versionLabel },
      { key: 'source', label: '生成来源', value: confirmSummary.sourceLabel },
      { key: 'selected', label: '确认范围', value: String(confirmSummary.selectedCount) },
      { key: 'conditions', label: '当前条件', value: String(confirmSummary.conditionCount) },
      { key: 'obstacles', label: '阻碍', value: String(confirmSummary.obstacleCount) },
      { key: 'delays', label: '延期摘要', value: String(confirmSummary.delayCount) },
    ],
    [confirmSummary],
  )
  const unsavedChangesGuard = useUnsavedChangesGuard(
    Boolean(isDirty),
    '月度计划草稿还有未保存调整，离开后这些编制范围会丢失，确认继续吗？',
  )
  const navigateWithGuard = useCallback(
    (to: string) => {
      unsavedChangesGuard.guardNavigation(() => navigate(to))
    },
    [navigate, unsavedChangesGuard],
  )
  const tabs = useMemo(
    () => buildPlanningTabs({ navigate, navigateWithGuard, projectId, activeKey: 'monthly' }),
    [navigate, navigateWithGuard, projectId],
  )
  const priorityBanner = useMemo(() => {
    if (noBaselineIntercept) {
      return {
        tone: 'amber' as const,
        title: '当前项目还没有正式基线',
        detail: '先建立项目基线，再进入标准月计划编制链路；也可以临时按当前任务列表预编制。',
      }
    }
    if (activePlan?.status === 'pending_realign') {
      return {
        tone: 'amber' as const,
        title: '当前月计划处于待重排态',
        detail: '请先完成本轮主动重排，再执行“结束重排”恢复确认状态。',
      }
    }
    if (activePlan?.status === 'archived') {
      return {
        tone: 'slate' as const,
        title: '当前月计划已归档',
        detail: '该版本只用于历史追溯，不再参与当前编制动作。',
      }
    }
    if (activePlan?.status === 'closed') {
      return {
        tone: 'slate' as const,
        title: '当前月计划已完成关账',
        detail: '当前版本保留查看和对比入口，不再允许继续编辑。',
      }
    }
    if (activePlan?.status === 'confirmed') {
      return {
        tone: 'emerald' as const,
        title: '当前月计划已确认',
        detail: '可以继续查看差异、发起主动重排，或进入月末关账流程。',
      }
    }
    if (draftStatus === 'locked') {
      return {
        tone: 'amber' as const,
        title: '当前月计划已切到只读查看态',
        detail: '编辑锁已失效或被其他成员占用，本页保留查看和差异复核入口。',
      }
    }
    if (closeoutCompleted) {
      return {
        tone: 'emerald' as const,
        title: '上月关账已完成',
        detail: '当前页面已切换到下一个月度计划工作区，可以继续处理本月草稿。',
      }
    }
    if (statusNotice) {
      return {
        tone: 'slate' as const,
        title: '编制提示',
        detail: statusNotice,
      }
    }
    return null
  }, [activePlan?.status, closeoutCompleted, draftStatus, noBaselineIntercept, statusNotice])

  const loadMonthlyContext = useCallback(
    async (options?: { preferredMonth?: string; preferredId?: string; preserveNotice?: boolean; signal?: AbortSignal }) => {
      const signal = options?.signal

      if (!projectId) {
        setPageLoading(false)
        setPlanVersions([])
        setActivePlan(null)
        setDraftLock(null)
        setLockSecondsLeft(null)
        setDraftStatus('idle')
        setValidationIssues([])
        return
      }

      setPageLoading(true)
      setPageError(null)
      if (!options?.preserveNotice) {
        setStatusNotice(null)
      }

      try {
        const hasExplicitMonth = Boolean(options?.preferredMonth || requestedMonth)
        const [allPlanVersions, allBaselineVersions, allTasks, allConditions, allObstacles] = await Promise.all([
          apiGet<MonthlyPlanVersion[]>(`/api/monthly-plans?project_id=${encodeURIComponent(projectId)}`, { signal }),
          apiGet<BaselineVersion[]>(`/api/task-baselines?project_id=${encodeURIComponent(projectId)}`, { signal }),
          apiGet<Task[]>(`/api/tasks?projectId=${encodeURIComponent(projectId)}`, { signal }),
          apiGet<TaskCondition[]>(`/api/task-conditions?projectId=${encodeURIComponent(projectId)}`, { signal }),
          apiGet<TaskObstacle[]>(`/api/task-obstacles?projectId=${encodeURIComponent(projectId)}`, { signal }),
        ])

        const sortedVersions = sortMonthlyPlanVersions(allPlanVersions)
        const resolvedMonth = resolvePreferredMonth(
          sortedVersions,
          hasExplicitMonth ? options?.preferredMonth || requestedMonth : null,
          selectedMonth || getCurrentMonth(),
        )
        const versionsForMonth = sortedVersions.filter((item) => item.month === resolvedMonth)
        const selectedVersion =
          (options?.preferredId ? versionsForMonth.find((item) => item.id === options.preferredId) : null) ??
          versionsForMonth.find((item) => item.status === 'draft') ??
          versionsForMonth[0] ??
          null

        let detail: MonthlyPlanDetail | null = null
        let lock: PlanningDraftLockRecord | null = null
        let notice: string | null = null
        let nextDraftStatus = 'idle' as typeof draftStatus

        if (selectedVersion) {
          detail = await apiGet<MonthlyPlanDetail>(`/api/monthly-plans/${selectedVersion.id}`, { signal })
          if (selectedVersion.status === 'draft') {
            try {
              const lockResponse = await apiPost<DraftLockResponse>(`/api/monthly-plans/${selectedVersion.id}/lock`, undefined, { signal })
              lock = lockResponse.lock
              nextDraftStatus = 'editing'
            } catch (error) {
              const errorCode = extractApiErrorCode(error)
              if (errorCode === 'LOCK_HELD') {
                nextDraftStatus = 'locked'
                notice = '当前月度草稿正在被其他成员编辑，页面已切换到只读查看态。'
              } else {
                throw error
              }
            }
          } else {
            notice = buildMonthlyStatusNotice(selectedVersion.status, detail.month)
          }
        }

        setSelectedMonth(resolvedMonth)
        setPlanVersions(sortedVersions)
        setBaselineVersions(sortBaselineVersions(allBaselineVersions))
        setTasks(allTasks)
        setConditions(allConditions)
        setObstacles(allObstacles)
        setActivePlan(detail)
        setDraftLock(lock)
        setLockSecondsLeft(
          lock?.lock_expires_at
            ? Math.max(0, Math.floor((new Date(lock.lock_expires_at).getTime() - Date.now()) / 1000))
            : null,
        )
        setDraftStatus(nextDraftStatus)
        setValidationIssues(
          buildValidationIssues({
            conditions: allConditions,
            obstacles: allObstacles,
            tasks: allTasks,
            month: resolvedMonth,
            plan: detail,
          }),
        )
        setStatusNotice(notice)
      } catch (error) {
        if (signal?.aborted) return
        setActivePlan(null)
        setDraftLock(null)
        setLockSecondsLeft(null)
        setDraftStatus('idle')
        setPageError(getApiErrorMessage(error, '月度计划页面加载失败，请稍后重试。'))
      } finally {
        setPageLoading(false)
      }
    },
    [projectId, requestedMonth, selectedMonth, setDraftStatus, setValidationIssues],
  )

  useEffect(() => {
    setActiveWorkspace('monthly')
    clearSelection()
    const controller = new AbortController()
    void loadMonthlyContext({ signal: controller.signal })
    return () => { controller.abort() }
  }, [clearSelection, loadMonthlyContext, setActiveWorkspace])

  useEffect(() => {
    if (!draftLock?.lock_expires_at) return undefined

    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.floor((new Date(draftLock.lock_expires_at).getTime() - Date.now()) / 1000),
      )
      setLockSecondsLeft(secondsLeft)
      if (secondsLeft <= 0) {
        setDraftStatus('locked')
        setStatusNotice('当前编辑锁已到期，页面已切换到只读查看态。')
        window.clearInterval(timer)
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [draftLock, setDraftStatus])

  const applyEditorSnapshot = useCallback(
    (snapshot: MonthlyEditorSnapshot) => {
      setActivePlan((current) => {
        if (!current) return current
        return {
          ...current,
          items: snapshot.items.map((item) => ({ ...item })),
        }
      })
      setSelectedItemIds(normalizeSelectedIds(snapshot.selectedIds, snapshot.items.map((item) => item.id)))
      setInputDrafts({})
    },
    [setSelectedItemIds],
  )

  const commitEditorSnapshot = useCallback(
    (items: MonthlyPlanDetail['items'], selectedIds: string[], options?: { recordHistory?: boolean }) => {
      const normalizedIds = normalizeSelectedIds(
        selectedIds,
        items.map((item) => item.id),
      )
      const snapshot: MonthlyEditorSnapshot = {
        items: items.map((item) => ({ ...item })),
        selectedIds: normalizedIds,
      }

      if (options?.recordHistory === false) {
        applyEditorSnapshot(snapshot)
        return
      }

      const currentSnapshot = historyRef.current[historyCursorRef.current]
      if (currentSnapshot && serializeMonthlyEditorSnapshot(currentSnapshot) === serializeMonthlyEditorSnapshot(snapshot)) {
        applyEditorSnapshot(snapshot)
        return
      }

      const nextHistory = [
        ...historyRef.current.slice(0, historyCursorRef.current + 1),
        snapshot,
      ]
      historyRef.current = nextHistory.slice(-50)
      historyCursorRef.current = historyRef.current.length - 1
      applyEditorSnapshot(snapshot)
      forceHistoryRender((value) => value + 1)
    },
    [applyEditorSnapshot],
  )

  useEffect(() => {
    if (!allRowIds.length || !activePlan) {
      historyScopeRef.current = selectionScopeKey
      historyRef.current = []
      historyCursorRef.current = -1
      initialSnapshotRef.current = null
      if (selectedItemIds.length > 0) setSelectedItemIds([])
      setInputDrafts({})
      forceHistoryRender((value) => value + 1)
      return
    }

    if (historyScopeRef.current !== selectionScopeKey) {
      const initialSnapshot: MonthlyEditorSnapshot = {
        items: editorItems,
        selectedIds: allRowIds,
      }
      historyScopeRef.current = selectionScopeKey
      historyRef.current = [initialSnapshot]
      historyCursorRef.current = 0
      initialSnapshotRef.current = initialSnapshot
      setSelectedItemIds(allRowIds)
      setInputDrafts({})
      forceHistoryRender((value) => value + 1)
      return
    }

    if (!sameIdSequence(selectedItemIds, normalizedSelectedItemIds)) {
      setSelectedItemIds(normalizedSelectedItemIds)
    }
  }, [
    activePlan,
    allRowIds,
    editorItems,
    normalizedSelectedItemIds,
    selectedItemIds,
    selectionScopeKey,
    setSelectedItemIds,
  ])

  const canUndo = historyCursorRef.current > 0
  const canRedo =
    historyCursorRef.current >= 0 &&
    historyCursorRef.current < historyRef.current.length - 1

  useEffect(() => {
    if (!activePlan || activePlan.status !== 'draft') return
    if (['generate', 'save', 'confirm'].includes(actionLoading ?? '')) return

    setDraftStatus(readOnly ? 'locked' : isDirty ? 'dirty' : 'editing')
  }, [actionLoading, activePlan, isDirty, readOnly, setDraftStatus])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (readOnly || !activePlan || activePlan.status !== 'draft') return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        if (historyCursorRef.current <= 0) return
        historyCursorRef.current -= 1
        const snapshot = historyRef.current[historyCursorRef.current]
        if (!snapshot) return
        commitEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
        forceHistoryRender((value) => value + 1)
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        if (historyCursorRef.current >= historyRef.current.length - 1) return
        historyCursorRef.current += 1
        const snapshot = historyRef.current[historyCursorRef.current]
        if (!snapshot) return
        commitEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
        forceHistoryRender((value) => value + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePlan, commitEditorSnapshot, readOnly])

  useEffect(() => {
    if (!activePlan || activePlan.status !== 'draft') {
      setResumeSnapshot(null)
      setResumeDialogOpen(false)
      setResumeInitialized(true)
      return
    }

    const snapshot = readPlanningDraftResumeSnapshot(monthlyDraftResumeKey)
    if (snapshot?.resourceId === activePlan.id) {
      setResumeSnapshot(snapshot)
      setResumeDialogOpen(true)
      setResumeInitialized(true)
      return
    }

    setResumeSnapshot(null)
    setResumeDialogOpen(false)
    setResumeInitialized(true)
  }, [activePlan, monthlyDraftResumeKey])

  useEffect(() => {
    if (!resumeInitialized) return

    if (!projectId || !activePlan || activePlan.status !== 'draft' || readOnly) {
      clearPlanningDraftResumeSnapshot(monthlyDraftResumeKey)
      return
    }

    writePlanningDraftResumeSnapshot(monthlyDraftResumeKey, {
      resourceId: activePlan.id,
      versionLabel: `v${activePlan.version}`,
      updatedAt: activePlan.updated_at ?? new Date().toISOString(),
      workspaceLabel: `${formatMonthLabel(activePlan.month)} 月计划`,
    })
  }, [activePlan, monthlyDraftResumeKey, projectId, readOnly, resumeInitialized])

  const handleMonthSwitch = async (month: string) => {
    clearSelection()
    await loadMonthlyContext({ preferredMonth: month })
  }

  const handleContinueDraftWorkspace = useCallback(() => {
    setResumeDialogOpen(false)
    setStatusNotice('已恢复上次月计划草稿工作区，可以继续沿用当前编制上下文。')
  }, [])

  const handleDiscardDraftWorkspace = useCallback(() => {
    clearPlanningDraftResumeSnapshot(monthlyDraftResumeKey)
    setResumeSnapshot(null)
    setResumeDialogOpen(false)
    setStatusNotice('已放弃本地草稿工作区状态，当前按服务端月计划重新开始。')
  }, [monthlyDraftResumeKey])

  const handleDraftChange = useCallback((itemId: string, field: MonthlyEditableField, value: string) => {
    setInputDrafts((current) => ({ ...current, [`${itemId}:${field}`]: value }))
  }, [])

  const commitFieldEdit = useCallback(
    (itemId: string, field: MonthlyEditableField) => {
      const draftKey = `${itemId}:${field}`
      const draftValue = inputDrafts[draftKey]
      if (draftValue == null) return

      const nextItems = editorItems.map((item) => {
        if (item.id !== itemId) return item

        if (field === 'title') {
          const nextTitle = draftValue.trim()
          return { ...item, title: nextTitle || item.title }
        }
        if (field === 'start') {
          return { ...item, planned_start_date: draftValue || null }
        }
        if (field === 'end') {
          return { ...item, planned_end_date: draftValue || null }
        }

        const parsed = Number.parseInt(draftValue, 10)
        return {
          ...item,
          target_progress: Number.isNaN(parsed) ? null : Math.max(0, Math.min(100, parsed)),
        }
      })

      setInputDrafts((current) => {
        const next = { ...current }
        delete next[draftKey]
        return next
      })
      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
    },
    [commitEditorSnapshot, editorItems, inputDrafts, normalizedSelectedItemIds],
  )

  const handleInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, itemId: string, field: MonthlyEditableField) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitFieldEdit(itemId, field)
        event.currentTarget.blur()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setInputDrafts((current) => {
          const next = { ...current }
          delete next[`${itemId}:${field}`]
          return next
        })
        event.currentTarget.blur()
      }
    },
    [commitFieldEdit],
  )

  const handleToggleRow = useCallback(
    (rowId: string) => {
      if (readOnly) return

      const nextIds = normalizedSelectedItemIds.includes(rowId)
        ? normalizedSelectedItemIds.filter((itemId) => itemId !== rowId)
        : [...normalizedSelectedItemIds, rowId]

      commitEditorSnapshot(editorItems, nextIds)
    },
    [commitEditorSnapshot, editorItems, normalizedSelectedItemIds, readOnly],
  )

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      if (readOnly) return
      commitEditorSnapshot(editorItems, checked ? allRowIds : [])
    },
    [allRowIds, commitEditorSnapshot, editorItems, readOnly],
  )

  const handleUndo = useCallback(() => {
    if (readOnly || historyCursorRef.current <= 0) return

    historyCursorRef.current -= 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (!snapshot) return
    commitEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
    forceHistoryRender((value) => value + 1)
  }, [commitEditorSnapshot, readOnly])

  const handleRedo = useCallback(() => {
    if (readOnly || historyCursorRef.current >= historyRef.current.length - 1) return

    historyCursorRef.current += 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (!snapshot) return
    commitEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
    forceHistoryRender((value) => value + 1)
  }, [commitEditorSnapshot, readOnly])

  const baseRows = useMemo(
    () =>
      activePlan
        ? buildMonthlyPlanRows({
            plan: activePlan,
            selectedItemIds: normalizedSelectedItemIds,
            readOnly,
            tasks,
            baselineItems: [],
            conditionTaskIds,
            obstacleTaskIds,
            delayedTaskIds,
            draftSourceMode: activePlan.baseline_version_id ? 'baseline' : 'schedule',
          })
        : [],
    [
      activePlan,
      conditionTaskIds,
      delayedTaskIds,
      normalizedSelectedItemIds,
      obstacleTaskIds,
      readOnly,
      tasks,
    ],
  )

  const monthlyItemMap = useMemo(
    () => new Map(editorItems.map((item) => [item.id, item])),
    [editorItems],
  )

  const rows = useMemo(
    () =>
      baseRows.map((row) => {
        const item = monthlyItemMap.get(row.id)
        if (!item || readOnly) return row

        const titleKey = `${item.id}:title`
        const startKey = `${item.id}:start`
        const endKey = `${item.id}:end`
        const progressKey = `${item.id}:progress`

        return {
          ...row,
          titleCell: (
            <div className="space-y-1">
              <div className="truncate text-xs text-slate-500">{row.subtitle}</div>
              <Input
                value={inputDrafts[titleKey] ?? item.title}
                onChange={(event) => handleDraftChange(item.id, 'title', event.target.value)}
                onBlur={() => commitFieldEdit(item.id, 'title')}
                onKeyDown={(event) => handleInputKeyDown(event, item.id, 'title')}
                disabled={readOnly}
                data-monthly-editor-cell={`${item.id}:title`}
                className="h-9 border-slate-200 bg-white text-sm"
              />
            </div>
          ),
          startCell: (
            <Input
              type="date"
              value={inputDrafts[startKey] ?? item.planned_start_date ?? ''}
              onChange={(event) => handleDraftChange(item.id, 'start', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'start')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'start')}
              disabled={readOnly}
              data-monthly-editor-cell={`${item.id}:start`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
          endCell: (
            <Input
              type="date"
              value={inputDrafts[endKey] ?? item.planned_end_date ?? ''}
              onChange={(event) => handleDraftChange(item.id, 'end', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'end')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'end')}
              disabled={readOnly}
              data-monthly-editor-cell={`${item.id}:end`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
          progressCell: (
            <Input
              type="number"
              min={0}
              max={100}
              value={inputDrafts[progressKey] ?? (item.target_progress == null ? '' : String(item.target_progress))}
              onChange={(event) => handleDraftChange(item.id, 'progress', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'progress')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'progress')}
              disabled={readOnly}
              data-monthly-editor-cell={`${item.id}:progress`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
        }
      }),
    [baseRows, commitFieldEdit, handleDraftChange, handleInputKeyDown, inputDrafts, monthlyItemMap, readOnly],
  )

  const handleGenerateDraft = async () => {
    if (!projectId) return

    setActionLoading('generate')
    try {
      let items = [] as ReturnType<typeof mapTasksToMonthlyItems>
      let baselineVersionId: string | null = null
      let sourceVersionId: string | null = null
      let sourceVersionLabel: string | null = null

      if (sourceMode === 'baseline') {
        if (!latestConfirmedBaseline) {
          throw new Error('当前项目还没有可用的确认基线，请先建立项目基线。')
        }
        const baselineDetail = await apiGet<BaselineDetail>(`/api/task-baselines/${latestConfirmedBaseline.id}`)
        items = mapBaselineItemsToMonthlyItems(baselineDetail)
        baselineVersionId = latestConfirmedBaseline.id
        sourceVersionId = latestConfirmedBaseline.id
        sourceVersionLabel = `基线 v${latestConfirmedBaseline.version}`
      } else {
        if (!tasks.length) {
          throw new Error('当前项目还没有任务数据，暂时无法按任务列表生成月度草稿。')
        }
        items = mapTasksToMonthlyItems(tasks)
        sourceVersionLabel = '当前任务列表'
      }

      const created = await apiPost<MonthlyPlanDetail>('/api/monthly-plans', {
        project_id: projectId,
        month: selectedMonth,
        title: `${formatMonthLabel(selectedMonth)} 月度计划`,
        baseline_version_id: baselineVersionId,
        source_version_id: sourceVersionId,
        source_version_label: sourceVersionLabel,
        carryover_item_count: items.filter((item) => item.commitment_status === 'carried_over').length,
        items,
      })

      setSelectedMonth(created.month)
      setPlanVersions(sortMonthlyPlanVersions([
        created,
        ...planVersions.filter((version) => version.id !== created.id),
      ]))
      setActivePlan(created)
      setDraftLock(null)
      setLockSecondsLeft(null)
      setDraftStatus('editing')
      setValidationIssues(
        buildValidationIssues({
          conditions,
          obstacles,
          tasks,
          month: created.month,
          plan: created,
        }),
      )
      setStatusNotice(null)
      setConfirmState('ready')

      void apiPost<DraftLockResponse>(`/api/monthly-plans/${created.id}/lock`)
        .then((lockResponse) => {
          setDraftLock(lockResponse.lock)
          setLockSecondsLeft(
            lockResponse.lock.lock_expires_at
              ? Math.max(0, Math.floor((new Date(lockResponse.lock.lock_expires_at).getTime() - Date.now()) / 1000))
              : null,
          )
          setDraftStatus('editing')
        })
        .catch((lockError) => {
          setDraftStatus('locked')
          setStatusNotice(getApiErrorMessage(lockError, '新草稿已创建，但编辑锁获取失败，当前已切换到只读查看态。'))
        })

      toast({
        title: '已生成月度草稿',
        description: formatMonthLabel(created.month) + ' 的真实草稿已创建。',
      })
      void loadMonthlyContext({ preferredMonth: created.month, preferredId: created.id, preserveNotice: true })
    } catch (error) {
      toast({
        title: '生成草稿失败',
        description: getApiErrorMessage(error, '月度草稿暂时无法生成。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSaveDraft = async () => {
    if (!projectId || !activePlan) return

    setActionLoading('save')
    setDraftStatus('saving')
    try {
      const created = await apiPost<MonthlyPlanDetail>('/api/monthly-plans', {
        project_id: projectId,
        month: activePlan.month,
        title: activePlan.title,
        description: activePlan.description ?? null,
        baseline_version_id: activePlan.baseline_version_id ?? null,
        source_version_id: activePlan.id,
        source_version_label: `v${activePlan.version}`,
        carryover_item_count: activePlan.carryover_item_count ?? 0,
        items: cloneMonthlyItems(activePlan),
      })
      await apiPost<DraftLockResponse>(`/api/monthly-plans/${created.id}/lock`)

      setStatusNotice('已生成 ' + formatMonthLabel(created.month) + ' 的草稿快照 v' + created.version + '。')
      setConfirmState('ready')
      toast({
        title: '草稿已保存',
        description: '已生成新的月度计划草稿快照 v' + created.version + '。',
      })
      await loadMonthlyContext({ preferredMonth: created.month, preferredId: created.id, preserveNotice: true })
    } catch (error) {
      setDraftStatus(readOnly ? 'locked' : 'editing')
      toast({
        title: '保存草稿失败',
        description: getApiErrorMessage(error, '草稿保存失败，请稍后再试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmPlan = async () => {
    if (!activePlan) return

    setActionLoading('confirm')
    try {
      const confirmed = await apiPost<MonthlyPlanDetail>(`/api/monthly-plans/${activePlan.id}/confirm`, {
        version: activePlan.version,
        month: activePlan.month,
      })

      setConfirmOpen(false)
      setConfirmState('ready')
      setStatusNotice(buildMonthlyStatusNotice(confirmed.status, confirmed.month))
      toast({
        title: '月度计划已确认',
        description: formatMonthLabel(confirmed.month) + ' 已切换为确认查看态。',
      })
      await loadMonthlyContext({ preferredMonth: confirmed.month, preferredId: confirmed.id, preserveNotice: true })
    } catch (error) {
      setConfirmState('failed')
      setConfirmOpen(true)
      toast({
        title: '确认失败',
        description: getApiErrorMessage(error, '月度计划确认失败，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleForceUnlock = async () => {
    if (!activePlan) return

    setActionLoading('unlock')
    try {
      await apiPost<DraftLockResponse>(`/api/monthly-plans/${activePlan.id}/force-unlock`, {
        reason: 'manual_release',
      })
      const reacquired = await apiPost<DraftLockResponse>(`/api/monthly-plans/${activePlan.id}/lock`)
      setDraftLock(reacquired.lock)
      setLockSecondsLeft(
        Math.max(0, Math.floor((new Date(reacquired.lock.lock_expires_at).getTime() - Date.now()) / 1000)),
      )
      setDraftStatus('editing')
      setStatusNotice('已重新获取月度草稿编辑锁。')
      toast({
        title: '已重新获取编辑锁',
        description: '当前月度草稿已回到可编辑态。',
      })
    } catch (error) {
      toast({
        title: '强制解锁失败',
        description: getApiErrorMessage(error, '请稍后再试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleQueueRealignment = async () => {
    if (!activePlan || !canQueueRealignment) return

    setActionLoading('queue_realign')
    try {
      const updated = await apiPost<MonthlyPlanDetail>(`/api/monthly-plans/${activePlan.id}/queue-realignment`, {
        version: activePlan.version,
      })
      setStatusNotice(buildMonthlyStatusNotice(updated.status, updated.month))
      toast({
        title: '已进入待重排态',
        description: `${formatMonthLabel(updated.month)} 当前等待重排完成。`,
      })
      await loadMonthlyContext({ preferredMonth: updated.month, preferredId: updated.id, preserveNotice: true })
    } catch (error) {
      toast({
        title: '开始重排失败',
        description: getApiErrorMessage(error, '请稍后再试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleResolveRealignment = async () => {
    if (!activePlan || !canResolveRealignment) return

    setActionLoading('resolve_realign')
    try {
      const updated = await apiPost<MonthlyPlanDetail>(`/api/monthly-plans/${activePlan.id}/resolve-realignment`, {
        version: activePlan.version,
      })
      setStatusNotice(buildMonthlyStatusNotice(updated.status, updated.month))
      toast({
        title: '重排已结束',
        description: `${formatMonthLabel(updated.month)} 已恢复为确认状态。`,
      })
      await loadMonthlyContext({ preferredMonth: updated.month, preferredId: updated.id, preserveNotice: true })
    } catch (error) {
      toast({
        title: '结束重排失败',
        description: getApiErrorMessage(error, '请稍后再试。'),
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
          <AlertDescription>请先选择项目，再进入月度计划页面。</AlertDescription>
        </Alert>
      </div>
    )
  }

  const summary = (
    <>
      <MonthlyPlanHeader
        draftStatus={draftStatus}
        selectedCount={normalizedSelectedItemIds.length}
        conditionCount={conditionIssues.length}
        obstacleCount={obstacleIssues.length}
        delayCount={delayIssues.length}
        quickAvailable={quickAvailable}
      />

      {activePlan?.source_version_label && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700" data-testid="monthly-plan-source-version-banner">
          <span>来源版本：{activePlan.source_version_label}</span>
          {activePlan.auto_switched && (
            <span className="rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs font-medium">自动切换</span>
          )}
        </div>
      )}

      {priorityBanner ? (
        <Card
          data-testid="monthly-plan-priority-banner"
          className={
            priorityBanner.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50'
              : priorityBanner.tone === 'amber'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900">{priorityBanner.title}</div>
              <div className="text-sm text-slate-600">{priorityBanner.detail}</div>
            </div>
            <Badge variant="outline">{formatMonthLabel(selectedMonth)}</Badge>
          </CardContent>
        </Card>
      ) : null}

      {confirmReminder ? (
        <Card
          data-testid="monthly-plan-reminder-banner"
          className={
            confirmReminder.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50'
              : confirmReminder.tone === 'amber'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900">{confirmReminder.title}</div>
              <div className="text-sm text-slate-600">{confirmReminder.detail}</div>
            </div>
            <Badge variant="outline">{confirmReminder.badge}</Badge>
          </CardContent>
        </Card>
      ) : null}

      {noBaselineIntercept ? null : (
        <>
          <Card variant="detail">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      月度计划工作区
                    </Badge>
                    <Badge variant={readOnly ? 'outline' : 'secondary'}>{readOnly ? '查看态' : '草稿编辑态'}</Badge>
                    {isDirty ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        ● 未保存草稿
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">月份带与编制信息带</h2>
                </div>
                <Badge variant="outline">锁剩余：{lockRemainingLabel}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void handleMonthSwitch(shiftMonth(selectedMonth, -1))}>
                  &lt; 上一月
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleMonthSwitch(shiftMonth(selectedMonth, 1))}>
                  下一月 &gt;
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                {monthWindow.map((month) => {
                  const versions = planVersions.filter((item) => item.month === month)
                  const version = versions.find((item) => item.status === 'draft') ?? versions[0] ?? null
                  const active = month === selectedMonth
                  const monthState = month.localeCompare(getCurrentMonth())
                  const isFutureMonth = monthState > 0
                  const statusTone =
                    version?.status === 'draft'
                      ? 'bg-blue-100 text-blue-700'
                      : version?.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : version?.status === 'closed'
                          ? 'bg-slate-100 text-slate-700'
                          : version?.status
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => void handleMonthSwitch(month)}
                      className={`h-14 w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active ? 'border-cyan-300 bg-cyan-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${isFutureMonth && !active ? 'bg-slate-50 text-slate-400' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-xs font-semibold ${isFutureMonth && !active ? 'text-slate-400' : 'text-slate-600'}`}>
                          {formatMonthLabel(month)}
                        </div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                          {version ? getMonthlyPlanStatusLabel(version.status) : '未生成'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>{version ? `v${version.version}` : '等待草稿'}</span>
                        {monthState === 0 ? <Badge variant="outline">当前</Badge> : null}
                        {isFutureMonth ? <Badge variant="outline">未来</Badge> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div data-testid="monthly-plan-info-bar" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">当前月份</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{formatMonthLabel(selectedMonth)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">当前版本</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{activePlan ? `v${activePlan.version}` : '待生成'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">生成来源</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{currentSourceLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">执行条目</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{activePlan?.items.length ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs text-amber-700">异常摘要</div>
              <div className="mt-1 text-lg font-semibold text-amber-900">
                {conditionIssues.length + obstacleIssues.length + delayIssues.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">确认时效</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {confirmReminder?.badge ?? '正常窗口'}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )

  const sectionHeader = noBaselineIntercept ? null : (
    <Card variant="detail" data-testid="monthly-plan-source-block">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Layers3 className="h-3.5 w-3.5" />
                L3 草稿来源区
              </Badge>
              {activePlan ? <Badge variant="outline">{getMonthlyPlanStatusLabel(activePlan.status)}</Badge> : null}
            </div>
            <div className="text-lg font-semibold text-slate-900">草稿来源与版本动作</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void handleForceUnlock()} disabled={!activePlan} loading={actionLoading === 'unlock'}>
              {actionLoading !== 'unlock' ? <RefreshCw className="h-4 w-4" /> : null}
              重新获取编辑锁
            </Button>
            {canQueueRealignment ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="monthly-plan-queue-realignment"
                onClick={() => void handleQueueRealignment()}
                loading={actionLoading === 'queue_realign'}
              >
                声明开始重排
              </Button>
            ) : null}
            {canResolveRealignment ? (
              <Button
                type="button"
                size="sm"
                className="gap-2"
                data-testid="monthly-plan-resolve-realignment"
                onClick={() => void handleResolveRealignment()}
                loading={actionLoading === 'resolve_realign'}
              >
                结束重排
              </Button>
            ) : null}
            {activePlan?.status === 'draft' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="monthly-plan-regenerate-draft"
                onClick={() => setRegenConfirmOpen(true)}
                disabled={actionLoading === 'generate'}
              >
                <RefreshCw className="h-4 w-4" />
                重新生成草稿
              </Button>
            ) : null}
            <Button type="button" size="sm" className="gap-2" onClick={() => void (activePlan ? handleSaveDraft() : handleGenerateDraft())} loading={actionLoading === 'generate' || actionLoading === 'save'}>
              {actionLoading !== 'generate' && actionLoading !== 'save' ? <WandSparkles className="h-4 w-4" /> : null}
              {activePlan ? '保存草稿快照' : '生成本月草稿'}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {SOURCE_OPTIONS.map((option) => {
            const active = sourceMode === option.key
            const disabled = option.key === 'baseline' && !latestConfirmedBaseline
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setSourceMode(option.key)}
                disabled={disabled}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  active ? 'border-cyan-300 bg-cyan-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{option.title}</div>
                  {active ? <Badge variant="secondary">当前选择</Badge> : null}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {option.key === 'baseline'
                    ? latestConfirmedBaseline
                      ? `当前可用基线：v${latestConfirmedBaseline.version}`
                      : '当前还没有可用基线'
                    : `当前任务数：${tasks.length}`}
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )

  const main = noBaselineIntercept ? (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-4 p-6 text-center">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-amber-900">当前项目还没有正式基线</div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => navigateWithGuard(`/projects/${projectId}/planning/baseline`)}>
            去建立项目基线
          </Button>
          <Button type="button" variant="outline" onClick={() => setSourceMode('schedule')}>
            改为按当前任务列表预编制
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : pageLoading ? (
    <LoadingState
      label="月度计划加载中"
      description=""
      className="min-h-32 rounded-2xl border border-slate-200 bg-white"
    />
  ) : activePlan ? (
    <div className="space-y-4">
      {activePlan.status !== 'draft' ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-emerald-900">
                {activePlan.status === 'pending_realign'
                  ? '待重排查看态'
                  : activePlan.status === 'archived'
                    ? '归档查看态'
                    : activePlan.status === 'closed'
                      ? '已关账查看态'
                      : '已确认查看态'}
              </div>
              <div className="text-sm text-emerald-700">{buildMonthlyStatusNotice(activePlan.status, activePlan.month)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canResolveRealignment ? (
                <Button
                  type="button"
                  data-testid="monthly-plan-resolve-realignment-banner"
                  onClick={() => void handleResolveRealignment()}
                  loading={actionLoading === 'resolve_realign'}
                >
                  结束重排
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setSkeletonDiffOpen(true)}>
                查看与主骨架差异
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {activePlan.status === 'draft' ? (
        <Card data-testid="monthly-plan-batch-strip" className="border-slate-200 bg-slate-50 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">L4 批量条</Badge>
                  <Badge variant="outline">{isDirty ? '草稿已调整' : '草稿未调整'}</Badge>
                </div>
                <div className="text-sm font-medium text-slate-900">编制范围与确认条</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={!canUndo || readOnly}>
                  撤销
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleRedo} disabled={!canRedo || readOnly}>
                  重做
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">当前来源模式</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{sourceMode === 'baseline' ? '项目基线' : '当前任务列表'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">已选条目</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{normalizedSelectedItemIds.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">已调整条目</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{editedEntryCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">确认模式</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{quickAvailable ? '可快速确认' : '建议走标准确认'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div data-testid="monthly-plan-tree-block" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">L5 编制树</Badge>
              <Badge variant="outline">{rows.length} 项</Badge>
            </div>
          </div>
        </div>
        <BaselineTreeEditor
          title={`${formatMonthLabel(activePlan.month)} 编制树`}
          description=""
          summaryLabel="月计划编制收口"
          unlockLabel="编辑锁管理"
          treeTitle={`${formatMonthLabel(activePlan.month)} 执行树`}
          treeDescription=""
          treeEmptyLabel="当前月份还没有月度计划条目"
          testId="monthly-plan-tree-editor"
          rows={rows}
          selectedCount={normalizedSelectedItemIds.length}
          readOnly={readOnly}
          isDirty={Boolean(isDirty)}
          lockRemainingLabel={lockRemainingLabel}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onForceUnlock={() => void handleForceUnlock()}
        />
      </div>
    </div>
  ) : (
    <Card className="border-dashed border-slate-300 bg-slate-50">
      <CardContent className="space-y-3 p-6">
        <div className="text-lg font-semibold text-slate-900">{formatMonthLabel(selectedMonth)} 尚未生成月度草稿</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleGenerateDraft()} loading={actionLoading === 'generate'}>
            生成本月草稿
          </Button>
          <Button type="button" variant="outline" onClick={() => navigateWithGuard(`/projects/${projectId}/planning/baseline`)}>
            去看项目基线
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const aside = noBaselineIntercept
    ? undefined
    : (
        <div data-testid="monthly-plan-review-block" className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{pageError}</AlertDescription>
            </Alert>
          ) : null}

          <Card data-testid="monthly-plan-confirm-summary" variant="detail">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">L6 校验与确认区</Badge>
                  <Badge variant="outline">7 项确认摘要</Badge>
                </div>
                </div>
                <Badge variant={quickAvailable ? 'secondary' : 'outline'}>{quickAvailable ? '快确认可用' : '建议标准确认'}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {confirmSummaryItems.map((item) => (
                  <div
                    key={item.key}
                    data-testid="monthly-plan-confirm-summary-item"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="text-xs text-slate-500">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <MonthlyPlanExceptionSummary
            issues={validationIssues}
            canQuickConfirm={quickAvailable}
            onOpenTasks={() => navigateWithGuard(`/projects/${projectId}/gantt`)}
            onOpenRisks={() => navigateWithGuard(`/projects/${projectId}/risks`)}
          />

          <ValidationPanel title="确认前校核区" issues={validationIssues} />

          <Card variant="detail">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">变更留痕入口</div>
                <Badge variant="outline">共享分析</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between"
                  data-testid="monthly-plan-open-change-log"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=change_log`)}
                >
                  <span className="flex items-center gap-2">
                    <FileDiff className="h-4 w-4" />
                    查看变更记录分析
                  </span>
                  <Badge variant="outline">Reports</Badge>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between"
                  data-testid="monthly-plan-open-progress-report"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=progress`)}
                >
                  <span className="flex items-center gap-2">
                    <Layers3 className="h-4 w-4" />
                    查看偏差分析
                  </span>
                  <Badge variant="outline">Progress</Badge>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card variant="detail">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">当前版本摘要</div>
                <Badge variant="outline">{activePlan ? `v${activePlan.version}` : '待生成'}</Badge>
              </div>
              <div className="text-sm leading-6 text-slate-600">
                {activePlan
                  ? `${formatMonthLabel(activePlan.month)} · ${getMonthlyPlanStatusLabel(activePlan.status)} · ${activePlan.items.length} 项`
                  : '当前月份还没有真实版本。'}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">来源版本</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {activePlan
                      ? activePlan.baseline_version_id
                        ? `基线版本 ${activePlan.baseline_version_id}`
                        : '当前任务列表生成'
                      : '待生成'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">最近更新时间</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(activePlan?.updated_at) ?? '暂无'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">编辑锁状态</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Lock className="h-4 w-4 text-slate-500" />
                    {readOnly ? '当前为查看态' : '当前持有编辑锁'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">下月入口</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatMonthLabel(shiftMonth(selectedMonth, 1))}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )

  return (
    <PlanningPageShell
      projectName={currentProject.name ?? '未命名项目'}
      title="月度计划"
      description=""
      tabs={tabs}
      actions={
        <>
          {canQueueRealignment ? (
            <Button
              type="button"
              size="sm"
              className="gap-2"
              data-testid="monthly-plan-queue-realignment-header"
              onClick={() => void handleQueueRealignment()}
            >
              声明开始重排
            </Button>
          ) : null}
          {canResolveRealignment ? (
            <Button
              type="button"
              size="sm"
              className="gap-2"
              data-testid="monthly-plan-resolve-realignment-header"
              onClick={() => void handleResolveRealignment()}
            >
              结束重排
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
            onClick={() => navigateWithGuard(`/projects/${projectId}/planning/closeout`)}
          >
            <RefreshCw className="h-4 w-4" />
            打开月末关账
          </Button>
          <Badge variant={readOnly ? 'outline' : 'secondary'}>{readOnly ? '查看态' : '草稿编辑态'}</Badge>
        </>
      }
    >
      <div className="space-y-4 pb-24">
        <PlanningWorkspaceLayers summary={summary} sectionHeader={sectionHeader} main={main} aside={aside} />
      </div>

      {activePlan?.status === 'draft' ? (
        <MonthlyPlanBottomBar
          draftStatus={draftStatus}
          quickAvailable={quickAvailable}
          onQuickConfirmEntry={() => {
            setConfirmMode('quick')
            setConfirmState('ready')
            setConfirmOpen(true)
          }}
          onStandardConfirmEntry={() => {
            setConfirmMode('standard')
            setConfirmState('ready')
            setConfirmOpen(true)
          }}
        />
      ) : null}

      <MonthlyPlanConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode={confirmMode}
        state={confirmState}
        summary={confirmSummary}
        onConfirm={() => void handleConfirmPlan()}
        onRetry={() => void handleConfirmPlan()}
      />
      <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialogContent data-testid="monthly-plan-regenerate-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>重新生成本月草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              系统会按当前选择的来源重新生成 {formatMonthLabel(selectedMonth)} 草稿。
              {editedEntryCount > 0
                ? ` 当前有 ${editedEntryCount} 项已调整条目会被覆盖。`
                : ' 当前还没有本地调整，适合直接重建。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            当前来源：{sourceMode === 'baseline' ? '项目基线' : '当前任务列表'}。重生成后会重新拉起新的月计划草稿版本。
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>先不重生成</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRegenConfirmOpen(false)
                void handleGenerateDraft()
              }}
            >
              确认重新生成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MonthlyPlanSkeletonDiffDialog
        open={skeletonDiffOpen}
        onOpenChange={setSkeletonDiffOpen}
        items={activePlan?.items ?? []}
        tasks={tasks}
      />
      <PlanningDraftResumeDialog
        open={resumeDialogOpen}
        onOpenChange={setResumeDialogOpen}
        snapshot={resumeSnapshot}
        onContinue={handleContinueDraftWorkspace}
        onDiscard={handleDiscardDraftWorkspace}
      />
      <ConfirmActionDialog
        {...unsavedChangesGuard.confirmDialog}
        testId="monthly-plan-unsaved-changes-dialog"
      />
    </PlanningPageShell>
  )
}

