import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useRef } from 'react'
import {
  useAddTask,
  useConditions,
  useCurrentProject,
  useDeleteTask,
  useHydratedProjectId,
  useObstacles,
  useParticipantUnits,
  useStore,
  useSetConditions,
  useSetObstacles,
  useSetTasks,
  useTasks,
  useUpdateTask,
} from '@/hooks/useStore'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useDebounce } from '@/hooks/useDebounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { LoadingState } from '@/components/ui/loading-state'
import { zhCN } from '@/i18n/zh-CN'
import { Calendar, Save, Trash2, ChevronRight, ChevronDown, LayoutTemplate, CheckCircle2, XCircle, Search, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage, getAuthHeaders, isAbortError } from '@/lib/apiClient'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityLiveCheckSummary, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'
import { calculateDelayImpact } from '@/lib/cpm'
import { prefetchProjectTasks } from '@/lib/projectTaskPrefetch'
import { getStatusTheme } from '@/lib/statusTheme'
import { formatCriticalPathCount } from '@/lib/userFacingTerms'
import {
  buildProjectTaskProgressSnapshot,
  getTaskBusinessStatus,
  isCompletedTask,
} from '@/lib/taskBusinessStatus'
import { BatchActionBar } from '@/components/BatchActionBar'
import { ConditionWarningModal } from '@/components/ConditionWarningModal'
import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import { GanttViewSkeleton } from '@/components/ui/page-skeleton'
import { Pagination, usePagination } from '@/components/ui/Pagination'
import { GanttViewHeader } from './GanttViewHeader'
import { useGanttCriticalPath } from './useGanttCriticalPath'
import { GanttBatchBar, GanttFilterBar, GanttStatsCards } from './GanttViewFilters'
import { GanttTaskRows } from './GanttViewRows'
import {
  ParticipantUnitsDialog,
  type ParticipantUnitDraft,
  type ParticipantUnitRecord,
} from './GanttView/ParticipantUnitsDialog'
import {
  TaskTimelineView,
  type GanttTimelineCompareMode,
  type GanttTimelineScale,
  type TaskTimelineViewHandle,
} from './GanttView/TaskTimelineView'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

const LazyGanttViewDialogs = lazy(() =>
  import('./GanttViewDialogs').then((module) => ({ default: module.GanttViewDialogs })),
)
const LazyTaskDetailPanel = lazy(() =>
  import('./GanttViewPanels').then((module) => ({ default: module.TaskDetailPanel })),
)
const LazyCriticalPathDialog = lazy(() =>
  import('./GanttView/CriticalPathDialog').then((module) => ({ default: module.CriticalPathDialog })),
)

import {
  type Task,
  type WBSNode,
  type TaskCondition,
  type TaskObstacle,
  type ConditionTypeValue,
  CONDITION_TYPES,
  SPECIALTY_TYPES,
  MILESTONE_LEVEL_CONFIG,
  getWBSNodeIcon,
  buildWBSTree,
  assignWBSCode,
  flattenTree,
  getDependencyChain,
} from './GanttViewTypes'
import type {
  DelayRequest as StoreDelayRequestRecord,
  ProjectMember,
  Task as StoreTaskRecord,
  TaskCondition as StoreTaskConditionRecord,
  TaskObstacle as StoreTaskObstacleRecord,
} from '@/lib/supabase'

const API_BASE = ''

function createEmptyParticipantUnitDraft(projectId?: string | null): ParticipantUnitDraft {
  return {
    id: null,
    project_id: projectId ?? '',
    unit_name: '',
    unit_type: '',
    contact_name: '',
    contact_role: '',
    contact_phone: '',
    contact_email: '',
    version: null,
  }
}

function toParticipantUnitDraft(unit: ParticipantUnitRecord, projectId?: string | null): ParticipantUnitDraft {
  return {
    id: unit.id,
    project_id: String(unit.project_id ?? projectId ?? ''),
    unit_name: unit.unit_name,
    unit_type: unit.unit_type,
    contact_name: unit.contact_name ?? '',
    contact_role: unit.contact_role ?? '',
    contact_phone: unit.contact_phone ?? '',
    contact_email: unit.contact_email ?? '',
    version: unit.version ?? 1,
  }
}

function sortParticipantUnits(units: ParticipantUnitRecord[]) {
  return [...units].sort((left, right) => left.unit_name.localeCompare(right.unit_name, 'zh-CN'))
}

interface DelayRequestRecord {
  id: string
  task_id: string
  project_id?: string | null
  baseline_version_id?: string | null
  original_date: string
  delayed_date: string
  delay_days: number
  reason?: string | null
  delay_reason?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  requested_by?: string | null
  requested_at?: string | null
  reviewed_at?: string | null
  withdrawn_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function normalizeDelayRequestRecord(row: Record<string, unknown>): DelayRequestRecord {
  return {
    id: String(row.id ?? ''),
    task_id: row.task_id ? String(row.task_id) : '',
    project_id: row.project_id ? String(row.project_id) : null,
    baseline_version_id: row.baseline_version_id ? String(row.baseline_version_id) : null,
    original_date: row.original_date ? String(row.original_date) : '',
    delayed_date: row.delayed_date ? String(row.delayed_date) : '',
    delay_days: Number(row.delay_days ?? 0),
    reason: row.reason ? String(row.reason) : null,
    delay_reason: row.delay_reason ? String(row.delay_reason) : null,
    status: (String(row.status ?? 'pending').trim().toLowerCase() as DelayRequestRecord['status']) || 'pending',
    requested_by: row.requested_by ? String(row.requested_by) : null,
    requested_at: row.requested_at ? String(row.requested_at) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    withdrawn_at: row.withdrawn_at ? String(row.withdrawn_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }
}

function upsertDelayRequestRecord(records: DelayRequestRecord[], nextRecord: DelayRequestRecord): DelayRequestRecord[] {
  const nextIndex = records.findIndex((record) => record.id === nextRecord.id)
  if (nextIndex < 0) {
    return [nextRecord, ...records]
  }
  return records.map((record, index) => (index === nextIndex ? { ...record, ...nextRecord } : record))
}

interface BaselineVersionOption {
  id: string
  version: number
  title: string
  status: string
}

type GanttViewMode = 'list' | 'timeline'

function normalizeGanttViewMode(value: string | null): GanttViewMode | null {
  return value === 'timeline' || value === 'list' ? value : null
}

function normalizeTimelineScale(value: string | null): GanttTimelineScale | null {
  return value === 'day' || value === 'week' || value === 'month' ? value : null
}

function normalizeTimelineCompareMode(value: string | null): GanttTimelineCompareMode | null {
  return value === 'plan' || value === 'baseline' ? value : null
}

type DelayRequestErrorCode = 'PENDING_CONFLICT' | 'DUPLICATE_REASON'

type DelayRequestErrorDetails = {
  task_id?: string
  pending_request_id?: string
  pending_requested_at?: string | null
  pending_delayed_date?: string | null
  pending_reason?: string | null
  last_rejected_request_id?: string
  last_rejected_at?: string | null
  last_rejected_reason?: string | null
}

type DeleteProtectionDetails = {
  entity_type?: string
  entity_id?: string
  status?: string | null
  progress?: number | null
  child_task_count?: number
  condition_count?: number
  obstacle_count?: number
  delay_request_count?: number
  acceptance_plan_count?: number
  has_execution_trail?: boolean
  linked_issue_id?: string | null
  linked_issue_status?: string | null
  close_action?: {
    method?: string
    endpoint?: string
    label?: string
  }
}

type GanttProjectMember = {
  userId: string
  displayName: string
  permissionLevel?: string | null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractApiErrorDetails(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) return null
  const errorBlock = value.error
  if (!isObjectRecord(errorBlock)) return null
  return isObjectRecord(errorBlock.details) ? errorBlock.details : null
}

function extractApiErrorCode(value: unknown): string | null {
  if (!isObjectRecord(value)) return null
  const errorBlock = value.error
  if (!isObjectRecord(errorBlock)) return null
  return typeof errorBlock.code === 'string' ? errorBlock.code : null
}

function extractApiErrorMessage(value: unknown, fallback: string): string {
  if (!isObjectRecord(value)) return fallback
  const errorBlock = value.error
  if (!isObjectRecord(errorBlock)) return fallback
  return typeof errorBlock.message === 'string' && errorBlock.message.trim() ? errorBlock.message : fallback
}

function formatTaskDeleteProtectionWarning(details: DeleteProtectionDetails): string {
  const parts: string[] = []
  if ((details.child_task_count ?? 0) > 0) parts.push(`包含 ${details.child_task_count} 个子任务`)
  if ((details.condition_count ?? 0) > 0) parts.push(`包含 ${details.condition_count} 条开工条件`)
  if ((details.obstacle_count ?? 0) > 0) parts.push(`包含 ${details.obstacle_count} 条障碍记录`)
  if ((details.delay_request_count ?? 0) > 0) parts.push(`包含 ${details.delay_request_count} 条延期申请`)
  if ((details.acceptance_plan_count ?? 0) > 0) parts.push(`包含 ${details.acceptance_plan_count} 条验收计划`)
  if (details.has_execution_trail) parts.push('已有执行留痕')
  return parts.length > 0 ? `删除已被保护：${parts.join('；')}。` : '删除已被保护，请改为关闭此记录。'
}

function formatObstacleDeleteProtectionWarning(details: DeleteProtectionDetails): string {
  const parts: string[] = []
  if (details.status) parts.push(`当前状态：${details.status}`)
  if (details.linked_issue_id) {
    const linkedStatus = details.linked_issue_status ? `（${details.linked_issue_status}）` : ''
    parts.push(`已关联升级问题 ${details.linked_issue_id}${linkedStatus}`)
  }
  return parts.length > 0 ? `删除已被保护：${parts.join('；')}。` : '删除已被保护，请改为关闭此记录。'
}

function buildDeleteProtectionState(
  kind: 'task' | 'obstacle',
  id: string,
  title: string,
  payload: unknown,
): DeleteGuardTarget | null {
  const details = extractApiErrorDetails(payload) as DeleteProtectionDetails | null
  if (!details) return null

  return {
    kind,
    id,
    title,
    blocked: true,
    message: extractApiErrorMessage(payload, '删除受保护，请改为关闭此记录。'),
    warning: kind === 'task'
      ? formatTaskDeleteProtectionWarning(details)
      : formatObstacleDeleteProtectionWarning(details),
    details,
  }
}

function buildDelayConflictMessage(
  code: DelayRequestErrorCode,
  details: DelayRequestErrorDetails | null,
  fallback: string,
): { form?: string; reason?: string } {
  if (code === 'PENDING_CONFLICT') {
    const delayedDate = details?.pending_delayed_date ? `，当前申请延期至 ${details.pending_delayed_date}` : ''
    const pendingReason = details?.pending_reason ? `，原因：${details.pending_reason}` : ''
    return {
      form: `已有待审批申请${delayedDate}${pendingReason}。请先等待审批或撤回后再重提。`,
    }
  }

  const rejectedReason = details?.last_rejected_reason ? `最近一次驳回原因：${details.last_rejected_reason}。` : ''
  return {
    reason: '重新提交原因不能与最近一次驳回原因重复。',
    form: `${rejectedReason}${fallback}`,
  }
}

function sortDelayRequests(records: DelayRequestRecord[]): DelayRequestRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = left.requested_at ?? left.created_at ?? ''
    const rightTime = right.requested_at ?? right.created_at ?? ''
    return rightTime.localeCompare(leftTime)
  })
}

function toDateValue(baseDate?: string | null): string {
  const basis = baseDate ? new Date(baseDate) : new Date()
  if (Number.isNaN(basis.getTime())) return ''
  return basis.toISOString().slice(0, 10)
}

function toStoreTaskRecord(task: Task): StoreTaskRecord {
  return task as StoreTaskRecord
}

function toStoreTaskPatch(patch: Partial<Task>): Partial<StoreTaskRecord> {
  return patch as Partial<StoreTaskRecord>
}

function toStoreConditionRecords(conditions: TaskCondition[]): StoreTaskConditionRecord[] {
  return conditions as StoreTaskConditionRecord[]
}

function toStoreObstacleRecords(obstacles: TaskObstacle[]): StoreTaskObstacleRecord[] {
  return obstacles as StoreTaskObstacleRecord[]
}

function toStoreDelayRequestRecords(records: DelayRequestRecord[]): StoreDelayRequestRecord[] {
  return records as StoreDelayRequestRecord[]
}

type DeleteGuardTarget =
  | {
      kind: 'task'
      id: string
      title: string
      blocked?: boolean
      message?: string
      warning?: string
      details?: DeleteProtectionDetails
    }
  | {
      kind: 'obstacle'
      id: string
      title: string
      blocked?: boolean
      message?: string
      warning?: string
      details?: DeleteProtectionDetails
    }

/**
 */
const withCredentials = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
})

function mergeRequestHeaders(headers?: HeadersInit): HeadersInit {
  const merged = new Headers(getAuthHeaders())
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      merged.set(key, value)
    })
  }
  return Object.fromEntries(merged.entries())
}

const withRequestContext = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
  headers: mergeRequestHeaders(options.headers),
})

export default function GanttView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const timelineViewRef = useRef<TaskTimelineViewHandle | null>(null)
  const currentProject = useCurrentProject()
  const currentUser = useStore((state) => state.currentUser)
  const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)
  const delayRequests = useStore((state) => state.delayRequests) as DelayRequestRecord[]
  const setDelayRequests = useStore((state) => state.setDelayRequests)
  const delayRequestsStatus = useStore((state) => state.sharedSliceStatus.delayRequests)
  const setSharedSliceStatus = useStore((state) => state.setSharedSliceStatus)
  const hydratedProjectId = useHydratedProjectId()
  const allTasks = useTasks()
  const allConditions = useConditions()
  const allObstacles = useObstacles()
  const participantUnits = useParticipantUnits()
  const setTasks = useSetTasks()
  const addTask = useAddTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const setProjectConditions = useSetConditions()
  const setProjectObstacles = useSetObstacles()
  const setParticipantUnits = useStore((state) => state.setParticipantUnits)
  const [loading, setLoading] = useState(true)
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [liveCheckSummary, setLiveCheckSummary] = useState<DataQualityLiveCheckSummary | null>(null)
  const [liveCheckLoading, setLiveCheckLoading] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const highlightScrollTimerRef = useRef<number | null>(null)
  const highlightClearTimerRef = useRef<number | null>(null)
  const lastHandledRealtimeEventKeyRef = useRef<string | null>(null)
  const [viewMode, setViewMode] = useState<GanttViewMode>(() => {
    const queryMode = normalizeGanttViewMode(new URLSearchParams(location.search).get('view'))
    if (queryMode) return queryMode
    return normalizeGanttViewMode(safeStorageGet(localStorage, `gantt_view_mode_${id}`)) || 'list'
  })
  const [timelineScale, setTimelineScale] = useState<GanttTimelineScale>(() => {
    const queryScale = normalizeTimelineScale(new URLSearchParams(location.search).get('scale'))
    if (queryScale) return queryScale
    return normalizeTimelineScale(safeStorageGet(localStorage, `gantt_timeline_scale_${id}`)) || 'week'
  })
  const [timelineCompareMode, setTimelineCompareMode] = useState<GanttTimelineCompareMode>(() => {
    const queryMode = normalizeTimelineCompareMode(new URLSearchParams(location.search).get('compare'))
    if (queryMode) return queryMode
    return normalizeTimelineCompareMode(safeStorageGet(localStorage, `gantt_timeline_compare_${id}`)) || 'plan'
  })
  const [baselineOptions, setBaselineOptions] = useState<BaselineVersionOption[]>([])
  const [baselineLoading, setBaselineLoading] = useState(false)
  const validBaselineOptionIds = useMemo(
    () => new Set(baselineOptions.map((option) => option.id)),
    [baselineOptions],
  )
  const [timelineBaselineVersionId, setTimelineBaselineVersionId] = useState<string>(() => (
    new URLSearchParams(location.search).get('baselineVersionId')
    || safeStorageGet(localStorage, `gantt_timeline_baseline_${id}`)
    || ''
  ))
  const {
    criticalPathSummary,
    criticalPathDialogOpen,
    setCriticalPathDialogOpen,
    criticalPathDialogLoading,
    criticalPathActionLoading,
    criticalPathError,
    criticalPathOverrides,
    criticalPathFocusTaskId,
    setCriticalPathFocusTaskId,
    handleOpenCriticalPathDialog,
    handleRefreshCriticalPath,
    handleCreateCriticalPathOverride,
    handleDeleteCriticalPathOverride,
  } = useGanttCriticalPath({ projectId: loading ? null : id })
  const tasks = useMemo(
    () => (id ? allTasks.filter((task) => task.project_id === id) : []),
    [allTasks, id],
  )
  const projectTaskIds = useMemo(
    () => new Set(tasks.map((task) => task.id).filter((taskId): taskId is string => Boolean(taskId))),
    [tasks],
  )
  const projectConditions = useMemo<TaskCondition[]>(
    () =>
      allConditions.filter(
        (condition) => Boolean(condition.task_id) && projectTaskIds.has(condition.task_id as string),
      ) as TaskCondition[],
    [allConditions, projectTaskIds],
  )
  const projectObstacles = useMemo<TaskObstacle[]>(
    () =>
      allObstacles.filter(
        (obstacle) => Boolean(obstacle.task_id) && projectTaskIds.has(obstacle.task_id as string),
      ) as TaskObstacle[],
    [allObstacles, projectTaskIds],
  )

  const highlightTaskId = new URLSearchParams(location.search).get('highlight') || null
  useEffect(() => {
    if (highlightScrollTimerRef.current) {
      clearTimeout(highlightScrollTimerRef.current)
      highlightScrollTimerRef.current = null
    }
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current)
      highlightClearTimerRef.current = null
    }

    if (!highlightTaskId || loading) return

    highlightScrollTimerRef.current = window.setTimeout(() => {
      const el = document.getElementById(`gantt-task-row-${highlightTaskId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('!bg-orange-50', 'ring-1', 'ring-orange-300')
        highlightClearTimerRef.current = window.setTimeout(() => {
          el.classList.remove('!bg-orange-50', 'ring-1', 'ring-orange-300')
          highlightClearTimerRef.current = null
        }, 3000)
      }
    }, 400)

    return () => {
      if (highlightScrollTimerRef.current) {
        clearTimeout(highlightScrollTimerRef.current)
        highlightScrollTimerRef.current = null
      }
      if (highlightClearTimerRef.current) {
        clearTimeout(highlightClearTimerRef.current)
        highlightClearTimerRef.current = null
      }
      const el = document.getElementById(`gantt-task-row-${highlightTaskId}`)
      el?.classList.remove('!bg-orange-50', 'ring-1', 'ring-orange-300')
    }
  }, [highlightTaskId, loading])

  useEffect(() => {
    const nextViewMode = normalizeGanttViewMode(searchParams.get('view'))
    if (nextViewMode && nextViewMode !== viewMode) {
      setViewMode(nextViewMode)
    }

    const nextScale = normalizeTimelineScale(searchParams.get('scale'))
    if (nextScale && nextScale !== timelineScale) {
      setTimelineScale(nextScale)
    }

    const nextCompareMode = normalizeTimelineCompareMode(searchParams.get('compare'))
    if (nextCompareMode && nextCompareMode !== timelineCompareMode) {
      setTimelineCompareMode(nextCompareMode)
    }

    const nextBaselineVersionId = searchParams.get('baselineVersionId')
    if (
      nextBaselineVersionId &&
      nextBaselineVersionId !== timelineBaselineVersionId &&
      validBaselineOptionIds.has(nextBaselineVersionId)
    ) {
      setTimelineBaselineVersionId(nextBaselineVersionId)
    }
  }, [
    searchParams,
    timelineBaselineVersionId,
    timelineCompareMode,
    timelineScale,
    validBaselineOptionIds,
    viewMode,
  ])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  
  // WBS 閺嶆垵鑸伴悩鑸碘偓?
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const saved = safeStorageGet(localStorage, `gantt_collapsed_${id}`)
    return new Set(safeJsonParse<string[]>(saved, [], `gantt collapsed ${id ?? 'unknown'}`))
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { confirmDialog, setConfirmDialog, openConfirm } = useConfirmDialog()
  // 濞ｈ濮炵€涙劒鎹㈤崝鈩冩妫板嫯顔曢惃鍕煑閼哄倻鍋?ID
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null)

  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [milestoneTargetTask, setMilestoneTargetTask] = useState<Task | null>(null)

  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [conditionTask, setConditionTask] = useState<Task | null>(null)
  const [taskConditions, setTaskConditions] = useState<TaskCondition[]>([])
  const [conditionsLoading, setConditionsLoading] = useState(false)
  const [conditionPrecedingTasks, setConditionPrecedingTasks] = useState<Record<string, Array<{task_id: string; title?: string; name?: string; status?: string}>>>({})
  const [forceSatisfyDialogOpen, setForceSatisfyDialogOpen] = useState(false)
  const [forceSatisfyCondition, setForceSatisfyCondition] = useState<TaskCondition | null>(null)
  const [forceSatisfyReason, setForceSatisfyReason] = useState('')
  const [newConditionName, setNewConditionName] = useState('')
  const [newConditionType, setNewConditionType] = useState<string>('other')
  const [newConditionTargetDate, setNewConditionTargetDate] = useState('')       // P1-6: 閻╊喗鐖ｉ弮銉︽埂
  const [newConditionDescription, setNewConditionDescription] = useState('')     // [G3]: 閺夆€叉鐠囷妇绮忕拠瀛樻
  const [newConditionResponsibleUnit, setNewConditionResponsibleUnit] = useState('')
  const [newConditionPrecedingTaskIds, setNewConditionPrecedingTaskIds] = useState<string[]>([])

  const [obstacleDialogOpen, setObstacleDialogOpen] = useState(false)
  const [obstacleTask, setObstacleTask] = useState<Task | null>(null)
  const [taskObstacles, setTaskObstacles] = useState<TaskObstacle[]>([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)
  const [delayRequestForm, setDelayRequestForm] = useState({ delayedDate: '', reason: '', baselineVersionId: '' })
  const [delayFormErrors, setDelayFormErrors] = useState<{
    baselineVersionId?: string
    delayedDate?: string
    reason?: string
    form?: string
  }>({})
  const [delayRequestSubmitting, setDelayRequestSubmitting] = useState(false)
  const [delayRequestWithdrawingId, setDelayRequestWithdrawingId] = useState<string | null>(null)
  const [delayRequestReviewingId, setDelayRequestReviewingId] = useState<string | null>(null)

  const [expandedConditionTaskId, setExpandedConditionTaskId] = useState<string | null>(null)
  const [inlineConditionsMap, setInlineConditionsMap] = useState<Record<string, TaskCondition[]>>({})
  const [newObstacleTitle, setNewObstacleTitle] = useState('')
  const [newObstacleSeverity, setNewObstacleSeverity] = useState('medium')
  const [newObstacleExpectedResolutionDate, setNewObstacleExpectedResolutionDate] = useState('')
  const [newObstacleResolutionNotes, setNewObstacleResolutionNotes] = useState('')
  const [editingObstacleId, setEditingObstacleId] = useState<string | null>(null)
  const [editingObstacleTitle, setEditingObstacleTitle] = useState('')
  const [editingObstacleSeverity, setEditingObstacleSeverity] = useState('medium')
  const [editingObstacleExpectedResolutionDate, setEditingObstacleExpectedResolutionDate] = useState('')
  const [editingObstacleResolutionNotes, setEditingObstacleResolutionNotes] = useState('')
  const [deleteGuardTarget, setDeleteGuardTarget] = useState<DeleteGuardTarget | null>(null)
  const [deleteGuardSubmitting, setDeleteGuardSubmitting] = useState(false)
  const [deleteGuardSecondarySubmitting, setDeleteGuardSecondarySubmitting] = useState(false)
  const [conditionWarningTarget, setConditionWarningTarget] = useState<null | {
    taskId: string
    taskTitle: string
    pendingConditionCount: number
  }>(null)

  const [searchText, setSearchText] = useState('')
  const debouncedSearchText = useDebounce(searchText, 300)
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    return safeStorageGet(localStorage, `gantt_filter_status_${id}`) || 'all'
  })
  const [filterPriority, setFilterPriority] = useState<string>(() => {
    return safeStorageGet(localStorage, `gantt_filter_priority_${id}`) || 'all'
  })
  const [filterCritical, setFilterCritical] = useState<boolean>(() => {
    return safeStorageGet(localStorage, `gantt_filter_critical_${id}`) === 'true'
  })
  const [showFilterBar, setShowFilterBar] = useState(false)
  const [filterSpecialty, setFilterSpecialty] = useState<string>(() => {
    return safeStorageGet(localStorage, `gantt_filter_specialty_${id}`) || 'all'
  })
  const [filterBuilding, setFilterBuilding] = useState<string>('all')

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const selectedTaskDelayRequests = useMemo(
    () =>
      selectedTask?.id
        ? sortDelayRequests(delayRequests.filter((request) => request.task_id === selectedTask.id))
        : [],
    [delayRequests, selectedTask?.id],
  )
  const delayRequestsLoading = delayRequestsStatus.loading

  const [inlineProgressTaskId, setInlineProgressTaskId] = useState<string | null>(null)
  const [inlineProgressValue, setInlineProgressValue] = useState<number>(0)
  const [inlineTitleTaskId, setInlineTitleTaskId] = useState<string | null>(null)
  const [inlineTitleValue, setInlineTitleValue] = useState<string>('')
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)

  // 鐗堟湰鍐茬獊婢跺嫮鎮婇悩鑸碘偓?
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictData, setConflictData] = useState<{
    localVersion: Task
    serverVersion: Task
  } | null>(null)
  const [pendingTaskData, setPendingTaskData] = useState<Partial<Task> | null>(null)
  // AI 瀹搞儲婀″楦款唴
  const [aiDurationLoading, setAiDurationLoading] = useState(false)
  const [aiDurationSuggestion, setAiDurationSuggestion] = useState<{
    estimated_duration: number
    confidence_level: string
    confidence_score: number
    factors: Record<string, unknown>
  } | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    end_date: '',
    actual_start_date: '',
    progress: 0,
    assignee_name: '',
    assignee_user_id: null as string | null,
    participant_unit_id: null as string | null,
    responsible_unit: '',
    dependencies: [] as string[],
    parent_id: null as string | null,
    milestone_id: null as string | null,
    specialty_type: '' as string,          // #12
    reference_duration: '' as string,
  })
  const [participantUnitsOpen, setParticipantUnitsOpen] = useState(false)
  const [participantUnitsLoading, setParticipantUnitsLoading] = useState(false)
  const [participantUnitsLoaded, setParticipantUnitsLoaded] = useState(false)
  const [participantUnitSaving, setParticipantUnitSaving] = useState(false)
  const [participantUnitDraft, setParticipantUnitDraft] = useState<ParticipantUnitDraft>(() => createEmptyParticipantUnitDraft(id))
  const [projectMembers, setProjectMembers] = useState<GanttProjectMember[]>([])
  const [taskFormErrors, setTaskFormErrors] = useState<{ name?: string; start_date?: string; end_date?: string }>({})
  const canAdminForceSatisfyCondition = useMemo(() => {
    if (!currentUser?.id) return false
    if (currentUser.global_role === 'company_admin') return true
    if (currentProject?.owner_id && currentProject.owner_id === currentUser.id) return true
    return projectMembers.some((member) => member.userId === currentUser.id && ['owner', 'admin'].includes(String(member.permissionLevel ?? '').trim().toLowerCase()))
  }, [currentProject?.owner_id, currentUser?.global_role, currentUser?.id, projectMembers])

  const [newTaskConditionPromptId, setNewTaskConditionPromptId] = useState<string | null>(null)
  const wbsTree = useMemo(() => {
    const tree = buildWBSTree(tasks as Task[])
    assignWBSCode(tree)
    return tree
  }, [tasks])
  const flatList = useMemo(() => flattenTree(wbsTree, collapsed), [wbsTree, collapsed])

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) { if (t.id) map.set(t.id, t as Task) }
    return map
  }, [tasks])
  const dependencyChainIds = useMemo(() => {
    if (!hoveredTaskId) return new Set<string>()
    return getDependencyChain(hoveredTaskId, taskMap)
  }, [hoveredTaskId, taskMap])

  const computeRolledProgress = useCallback((node: WBSNode): number => {
    if (node.children.length === 0) {
      return node.progress || 0
    }
    const childAvg = node.children.reduce((sum, c) => sum + computeRolledProgress(c), 0) / node.children.length
    return Math.round(childAvg)
  }, [])

  // 濮瑰洦鈧槒绻樻惔?map閿涙askId -> rolledProgress
  const rolledProgressMap = useMemo(() => {
    const map: Record<string, number> = {}
    function walk(node: WBSNode) {
      map[node.id] = computeRolledProgress(node)
      node.children.forEach(walk)
    }
    wbsTree.forEach(walk)
    return map
  }, [wbsTree, computeRolledProgress])

  const buildingOptions = useMemo(() => {
    return wbsTree.map(node => ({
      id: node.id,
      label: node.title || node.name || `濡ゅ吋鐖?${node.wbs_code || node.id.slice(0, 6)}`
    }))
  }, [wbsTree])

  const buildingNodeIds = useMemo<Set<string>>(() => {
    if (filterBuilding === 'all') return new Set()
    const ids = new Set<string>()
    function collectIds(node: WBSNode) {
      ids.add(node.id)
      node.children.forEach(collectIds)
    }
    const root = wbsTree.find(n => n.id === filterBuilding)
    if (root) collectIds(root)
    return ids
  }, [filterBuilding, wbsTree])

  const criticalPathSnapshot = criticalPathSummary?.snapshot ?? null
  const criticalPathTaskMap = useMemo(
    () => new Map((criticalPathSnapshot?.tasks ?? []).map((task) => [task.taskId, task])),
    [criticalPathSnapshot],
  )
  const criticalPathDisplayTaskIds = useMemo(
    () => new Set(criticalPathSnapshot?.displayTaskIds ?? []),
    [criticalPathSnapshot],
  )

  const filteredFlatList = useMemo(() => {
    if (!debouncedSearchText && filterStatus === 'all' && filterPriority === 'all' && !filterCritical && filterSpecialty === 'all' && filterBuilding === 'all') {
      return flatList
    }
    const lowerSearch = debouncedSearchText.toLowerCase()
    return flatList.filter(node => {
      const task = node
      if (filterBuilding !== 'all' && !buildingNodeIds.has(task.id)) return false
      if (lowerSearch) {
        const name = (task.title || task.name || '').toLowerCase()
        const assignee = (task.assignee || task.assignee_name || '').toLowerCase()
        if (!name.includes(lowerSearch) && !assignee.includes(lowerSearch)) return false
      }
      // 閻樿埖鈧胶鐡柅?
      if (filterStatus !== 'all' && task.status !== filterStatus) return false
      // 娴兼ê鍘涚痪褏鐡柅?
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false
      if (filterCritical && !criticalPathDisplayTaskIds.has(task.id)) return false
      if (filterSpecialty !== 'all' && task.specialty_type !== filterSpecialty) return false
      return true
    })
  }, [flatList, debouncedSearchText, filterStatus, filterPriority, filterCritical, filterSpecialty, filterBuilding, buildingNodeIds, criticalPathDisplayTaskIds])

  const activeFilterCount = [
    debouncedSearchText ? 1 : 0,
    filterStatus !== 'all' ? 1 : 0,
    filterPriority !== 'all' ? 1 : 0,
    filterCritical ? 1 : 0,
    filterSpecialty !== 'all' ? 1 : 0,
    filterBuilding !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const clearAllFilters = () => {
    setSearchText('')
    setFilterStatus('all')
    setFilterPriority('all')
    setFilterCritical(false)
    setFilterSpecialty('all')
    setFilterBuilding('all')
    safeStorageRemove(localStorage, `gantt_filter_status_${id}`)
    safeStorageRemove(localStorage, `gantt_filter_priority_${id}`)
    safeStorageRemove(localStorage, `gantt_filter_critical_${id}`)
    safeStorageRemove(localStorage, `gantt_filter_specialty_${id}`)
  }

  const allSelected = flatList.length > 0 && flatList.every(n => selectedIds.has(n.id))
  const someSelected = flatList.some(n => selectedIds.has(n.id))

  function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  const milestoneOptions = useMemo(
    () => tasks.filter((task) => task.is_milestone && task.id !== editingTask?.id),
    [editingTask?.id, tasks],
  )

  const scopedProjectConditions = projectConditions as TaskCondition[]
  const scopedProjectObstacles = projectObstacles as TaskObstacle[]

  const editingTaskConditions = useMemo(
    () => (editingTask ? scopedProjectConditions.filter((condition) => condition.task_id === editingTask.id) : []),
    [editingTask, scopedProjectConditions],
  )
  const unmetEditingTaskConditions = editingTaskConditions.filter((condition) => !condition.is_satisfied)
  const progressInputBlocked = unmetEditingTaskConditions.length > 0 && Number(editingTask?.progress ?? 0) > 0
  const progressInputHint = progressInputBlocked
    ? '仍有 ' + unmetEditingTaskConditions.length + ' 项开工条件未满足，首次填报后再次更新前请先处理条件。'
    : unmetEditingTaskConditions.length > 0
      ? '当前仍有 ' + unmetEditingTaskConditions.length + ' 项开工条件未满足，首次填报后会弹出条件预警提醒。'
      : '任务进度会同步驱动业务状态。'

  const openConditionWarning = useCallback((task: Pick<Task, 'title' | 'name'> & { id?: string }, pendingConditionCount: number) => {
    setConditionWarningTarget({
      taskId: String(task.id ?? ''),
      taskTitle: String(task.title || task.name || '当前任务'),
      pendingConditionCount,
    })
  }, [])

  const taskProgressSnapshot = useMemo(
    () => buildProjectTaskProgressSnapshot(tasks, scopedProjectConditions, scopedProjectObstacles),
    [scopedProjectConditions, scopedProjectObstacles, tasks],
  )

  useEffect(() => {
    if (!id) {
      setProjectMembers([])
      return
    }
    if (!dialogOpen && !conditionDialogOpen && !forceSatisfyDialogOpen && !selectedTask?.id) {
      return
    }

    const controller = new AbortController()
    void apiGet<{ success?: boolean; members?: ProjectMember[] }>(`/api/members/${id}`, { signal: controller.signal })
      .then((payload) => {
        const members = Array.isArray(payload?.members) ? payload.members : []
        setProjectMembers(
          members
            .map((member) => ({
              userId: String(member.userId ?? member.user_id ?? ''),
              displayName: String(member.displayName ?? member.username ?? '').trim(),
              permissionLevel: String(member.permissionLevel ?? member.permission_level ?? member.role ?? '').trim() || null,
            }))
            .filter((member) => member.userId && member.displayName),
        )
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          console.warn('[GanttView] load project members failed', error)
        }
      })

    return () => controller.abort()
  }, [conditionDialogOpen, dialogOpen, forceSatisfyDialogOpen, id, selectedTask?.id])
  const blockedProgressTaskIds = useMemo(
    () =>
      new Set(
        tasks
          .filter((task) => {
            if (!task.id) return false
            const summary = taskProgressSnapshot.taskConditionMap[task.id]
            const hasPendingConditions = Boolean(summary && summary.total > summary.satisfied)
            return hasPendingConditions && Number(task.progress ?? 0) > 0
          })
          .map((task) => task.id)
          .filter((taskId): taskId is string => Boolean(taskId)),
      ),
    [taskProgressSnapshot.taskConditionMap, tasks],
  )

  useEffect(() => {
    if (!conditionTask) return

    setTaskConditions(
      scopedProjectConditions.filter((condition) => condition.task_id === conditionTask.id) as TaskCondition[],
    )
  }, [conditionTask, scopedProjectConditions])

  useEffect(() => {
    if (!obstacleTask) return

    setTaskObstacles(
      scopedProjectObstacles.filter((obstacle) => obstacle.task_id === obstacleTask.id) as TaskObstacle[],
    )
  }, [obstacleTask, scopedProjectObstacles])

  const mergeDelayRequestIntoStore = useCallback((recordLike: unknown) => {
    if (!recordLike || typeof recordLike !== 'object') return
    const nextRecord = normalizeDelayRequestRecord(recordLike as Record<string, unknown>)
    if (!nextRecord.id) return
    const previousRecords = useStore.getState().delayRequests as DelayRequestRecord[]
    setDelayRequests(toStoreDelayRequestRecords(upsertDelayRequestRecord(previousRecords, nextRecord)))
  }, [setDelayRequests])

  const loadBaselineOptions = useCallback(async (requestOptions?: { signal?: AbortSignal }) => {
    if (!id) {
      setBaselineOptions([])
      return
    }

    setBaselineLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/task-baselines?project_id=${encodeURIComponent(id)}`, {
        headers: getAuthHeaders(),
        signal: requestOptions?.signal,
        ...withCredentials(),
      })
      const json = await response.json()
      if (!json.success) {
        throw new Error(json.error?.message || '加载基线版本失败')
      }

      const nextOptions = Array.isArray(json.data)
        ? (json.data as Array<Record<string, unknown>>)
            .filter((row) => ['confirmed', 'closed'].includes(String(row.status ?? '').trim()))
            .map((row) => ({
              id: String(row.id ?? ''),
              version: Number(row.version ?? 0),
              title: String(row.title ?? '项目基线'),
              status: String(row.status ?? 'draft'),
            }))
            .filter((row) => row.id)
            .sort((left, right) => right.version - left.version)
        : []

      if (!requestOptions?.signal?.aborted) {
        setBaselineOptions(nextOptions)
        setDelayRequestForm((previous) => ({
          ...previous,
          baselineVersionId: previous.baselineVersionId || nextOptions[0]?.id || '',
        }))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setBaselineOptions([])
      }
    } finally {
      if (!requestOptions?.signal?.aborted) {
        setBaselineLoading(false)
      }
    }
  }, [id])

  useEffect(() => {
    if (!id) {
      setBaselineOptions([])
      setBaselineLoading(false)
      return
    }
    if (loading) {
      return
    }
    const shouldLoadBaselineOptions =
      Boolean(selectedTask?.id) || (viewMode === 'timeline' && timelineCompareMode === 'baseline')
    if (!shouldLoadBaselineOptions) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadBaselineOptions({ signal: controller.signal })
    }, 500)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [id, loadBaselineOptions, loading, selectedTask?.id, timelineCompareMode, viewMode])

  useEffect(() => {
    if (baselineOptions.length === 0) {
      if (timelineCompareMode === 'baseline' && timelineBaselineVersionId) {
        setTimelineBaselineVersionId('')
      }
      return
    }

    if (!baselineOptions.some((option) => option.id === timelineBaselineVersionId)) {
      setTimelineBaselineVersionId(baselineOptions[0]?.id || '')
    }
  }, [baselineOptions, timelineBaselineVersionId, timelineCompareMode])

  useEffect(() => {
    if (!id) return

    safeStorageSet(localStorage, `gantt_view_mode_${id}`, viewMode)
    safeStorageSet(localStorage, `gantt_timeline_scale_${id}`, timelineScale)
    safeStorageSet(localStorage, `gantt_timeline_compare_${id}`, timelineCompareMode)

    if (timelineBaselineVersionId) {
      safeStorageSet(localStorage, `gantt_timeline_baseline_${id}`, timelineBaselineVersionId)
    } else {
      safeStorageRemove(localStorage, `gantt_timeline_baseline_${id}`)
    }

    const nextParams = new URLSearchParams(location.search)
    const setOrDelete = (key: string, value: string | null) => {
      if (value) nextParams.set(key, value)
      else nextParams.delete(key)
    }

    setOrDelete('view', viewMode === 'list' ? null : viewMode)

    if (viewMode === 'timeline') {
      setOrDelete('scale', timelineScale === 'week' ? null : timelineScale)
      setOrDelete('compare', timelineCompareMode === 'plan' ? null : timelineCompareMode)
      setOrDelete(
        'baselineVersionId',
        timelineCompareMode === 'baseline' && timelineBaselineVersionId ? timelineBaselineVersionId : null,
      )
    } else {
      nextParams.delete('scale')
      nextParams.delete('compare')
      nextParams.delete('baselineVersionId')
    }

    const nextSearch = nextParams.toString()
    const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search
    if (nextSearch !== currentSearch) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true },
      )
    }
  }, [
    id,
    location.pathname,
    location.search,
    navigate,
    timelineBaselineVersionId,
    timelineCompareMode,
    timelineScale,
    viewMode,
  ])

  useEffect(() => {
    if (!selectedTask?.id) {
      setDelayRequestForm((previous) => ({ ...previous, delayedDate: '', reason: '' }))
      setDelayFormErrors({})
      return
    }

    setDelayRequestForm((previous) => ({
      delayedDate: toDateValue(selectedTask.planned_end_date || selectedTask.end_date),
      reason: '',
      baselineVersionId: previous.baselineVersionId || baselineOptions[0]?.id || '',
    }))
    setDelayFormErrors({})
  }, [baselineOptions, selectedTask?.end_date, selectedTask?.id])

  const criticalPathSummaryText = useMemo(() => {
    if (!criticalPathSummary) return ''

    const summaryParts = [
      formatCriticalPathCount(criticalPathSummary.primaryTaskCount),
      '工期 ' + criticalPathSummary.projectDurationDays + ' 天',
    ]

    if (criticalPathSummary.alternateChainCount > 0) {
      summaryParts.push('备选 ' + criticalPathSummary.alternateChainCount + ' 条')
    }
    if (criticalPathSummary.manualAttentionCount > 0) {
      summaryParts.push('关注 ' + criticalPathSummary.manualAttentionCount + ' 项')
    }
    if (criticalPathSummary.manualInsertedCount > 0) {
      summaryParts.push('插链 ' + criticalPathSummary.manualInsertedCount + ' 项')
    }

    return summaryParts.join('，')
  }, [criticalPathSummary])

  // 页面顶部统计卡
  const projectStats = useMemo(() => {
    const criticalTaskCount = criticalPathSummary?.primaryTaskCount ?? 0
    // #10: AI 参考工期任务
    const aiDurationTasks = tasks.filter(t => t.ai_duration && t.ai_duration > 0)
    const totalAiDuration = aiDurationTasks.reduce((sum, t) => sum + (t.ai_duration || 0), 0)
    const avgAiDuration = aiDurationTasks.length > 0 ? Math.round(totalAiDuration / aiDurationTasks.length) : 0
    
    return {
      totalTasks: taskProgressSnapshot.totalTasks,
      progressBaseTaskCount: taskProgressSnapshot.progressBaseTaskCount,
      completedTasks: taskProgressSnapshot.completedTaskCount,
      inProgressTasks: taskProgressSnapshot.inProgressTaskCount,
      overdueTask: taskProgressSnapshot.delayedTaskCount,
      avgProgress: taskProgressSnapshot.overallProgress,
      criticalTaskCount,
      blockedTasks: taskProgressSnapshot.activeObstacleTaskCount,
      pendingStartTasks: taskProgressSnapshot.pendingConditionTaskCount,
      readyToStartTasks: taskProgressSnapshot.readyToStartTaskCount,
      projectDuration: criticalPathSummary?.projectDurationDays ?? 0,
      criticalPathSummary: criticalPathSummaryText,
      aiDurationTaskCount: aiDurationTasks.length,
      totalAiDuration,
      avgAiDuration,
    }
  }, [criticalPathSummary, criticalPathSummaryText, tasks, taskProgressSnapshot])

  /**
   */
  const getBusinessStatus = useCallback((task: Task): {
    label: string
    cls: string
    badge?: { text: string; cls: string }
  } => {
    const condInfo = taskProgressSnapshot.taskConditionMap[task.id]
    const obstacleCount = taskProgressSnapshot.obstacleCountMap[task.id] || 0
    const businessStatus = getTaskBusinessStatus(task, {
      conditionSummary: condInfo,
      activeObstacleCount: obstacleCount,
    })
    const isOverdue = !isCompletedTask(task) && task.end_date && new Date(task.end_date) < new Date()

    switch (businessStatus.code) {
      case 'completed':
        return { label: businessStatus.label, cls: getStatusTheme('completed').className }
      case 'lagging_severe':
        return { label: businessStatus.label, cls: 'bg-orange-100 text-orange-700 border border-orange-200' }
      case 'lagging_moderate':
        return { label: businessStatus.label, cls: 'bg-amber-100 text-amber-700 border border-amber-200' }
      case 'lagging_mild':
        return { label: businessStatus.label, cls: 'bg-amber-50 text-amber-600 border border-amber-200' }
      case 'in_progress':
        return {
          label: businessStatus.label,
          cls: getStatusTheme('in_progress').className,
          badge: isOverdue ? { text: '逾期' + Math.ceil((new Date().getTime() - new Date(task.end_date!).getTime()) / 86400000) + '天', cls: getStatusTheme('overdue').className } : undefined,
        }
      case 'pending_conditions':
        return {
          label: businessStatus.label,
          cls: getStatusTheme('pending_conditions').className,
          badge: condInfo ? { text: String(condInfo.total - condInfo.satisfied) + '/' + String(condInfo.total) + '项条件未满足', cls: getStatusTheme('pending_conditions').className } : undefined,
        }
      case 'ready':
        return { label: businessStatus.label, cls: getStatusTheme('ready').className }
      default:
        return {
          label: businessStatus.label,
          cls: getStatusTheme('open').className,
          badge: isOverdue ? { text: '逾期' + Math.ceil((new Date().getTime() - new Date(task.end_date!).getTime()) / 86400000) + '天', cls: getStatusTheme('overdue').className } : undefined,
        }
    }
  }, [taskProgressSnapshot])

  const loadTasks = useCallback(async (options?: { signal?: AbortSignal; force?: boolean }) => {
    const shouldReuseHydratedTasks = !options?.force && hydratedProjectId === id && viewMode === 'list'
    if (!id || shouldReuseHydratedTasks) {
      return
    }

    try {
      const data: Task[] = viewMode === 'list'
        ? await prefetchProjectTasks(id, { signal: options?.signal, force: options?.force })
        : await (async () => {
          const requestParams = new URLSearchParams({ projectId: id })
          requestParams.set('timeline_projection', 'true')
          if (timelineCompareMode === 'baseline' && timelineBaselineVersionId) {
            requestParams.set('baseline_version_id', timelineBaselineVersionId)
          }

          const res = await fetch(
            `${API_BASE}/api/tasks?${requestParams.toString()}`,
            withRequestContext({ signal: options?.signal }),
          )
          const json = await res.json()
          return json.data || []
        })()
      if (!options?.signal?.aborted) {
        setTasks(data)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载甘特任务失败:', error)
      }
    }
  }, [hydratedProjectId, id, setTasks, timelineBaselineVersionId, timelineCompareMode, viewMode])

  const loadProjectConditions = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setProjectConditions([])
      return
    }

    try {
      const data = await apiGet<TaskCondition[]>(
        `/api/task-conditions?projectId=${encodeURIComponent(id)}`,
        options?.signal ? { signal: options.signal } : undefined,
      )
      if (!options?.signal?.aborted) {
        setProjectConditions(toStoreConditionRecords(Array.isArray(data) ? data : []))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载甘特开工条件失败:', error)
      }
    }
  }, [id, setProjectConditions])

  const loadProjectObstacles = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setProjectObstacles([])
      return
    }

    try {
      const data = await apiGet<TaskObstacle[]>(
        `/api/task-obstacles?projectId=${encodeURIComponent(id)}`,
        options?.signal ? { signal: options.signal } : undefined,
      )
      if (!options?.signal?.aborted) {
        setProjectObstacles(toStoreObstacleRecords(Array.isArray(data) ? data : []))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载甘特阻碍失败:', error)
      }
    }
  }, [id, setProjectObstacles])

  const loadDelayRequests = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setDelayRequests([])
      setSharedSliceStatus('delayRequests', { loading: false, error: null })
      return
    }

    setSharedSliceStatus('delayRequests', { loading: true, error: null })

    try {
      const data = await apiGet<Record<string, unknown>[]>(
        `/api/delay-requests?projectId=${encodeURIComponent(id)}`,
        options?.signal ? { signal: options.signal } : undefined,
      )
      if (!options?.signal?.aborted) {
        setDelayRequests(
          toStoreDelayRequestRecords(
            (Array.isArray(data) ? data : []).map((item) => normalizeDelayRequestRecord(item)),
          ),
        )
        setSharedSliceStatus('delayRequests', { loading: false, error: null })
      }
    } catch (error) {
      if (!isAbortError(error) && !options?.signal?.aborted) {
        console.error('加载甘特延期申请失败:', error)
        setSharedSliceStatus('delayRequests', {
          loading: false,
          error: getApiErrorMessage(error, '延期申请数据加载失败'),
        })
      }
    }
  }, [id, setDelayRequests, setSharedSliceStatus])

  const loadProjectSummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setProjectSummary(null)
      return
    }

    try {
      const nextSummary = await DashboardApiService.getProjectSummary(id, { signal: options?.signal })
      if (!options?.signal?.aborted) {
        setProjectSummary(nextSummary)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载项目摘要失败:', error)
        setProjectSummary(null)
      }
    }
  }, [id])

  const loadDataQualitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setDataQualitySummary(null)
      return
    }

    try {
      const summary = await DataQualityApiService.getProjectSummary(id, undefined, { signal: options?.signal })
      if (!options?.signal?.aborted) {
        setDataQualitySummary(summary)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载数据质量摘要失败:', error)
        setDataQualitySummary(null)
      }
    }
  }, [id])

  const loadParticipantUnits = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!id) {
      setParticipantUnits([])
      setParticipantUnitsLoaded(false)
      return
    }

    setParticipantUnitsLoading(true)
    try {
      const data = await apiGet<ParticipantUnitRecord[]>(
        `/api/participant-units?projectId=${encodeURIComponent(id)}`,
        options?.signal ? { signal: options.signal } : undefined,
      )
      if (!options?.signal?.aborted) {
        setParticipantUnits(sortParticipantUnits(data ?? []))
        setParticipantUnitsLoaded(true)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载参建单位台账失败:', error)
      }
    } finally {
      if (!options?.signal?.aborted) {
        setParticipantUnitsLoading(false)
      }
    }
  }, [id, setParticipantUnits])

  const refreshGanttProjectData = useCallback(async (options?: {
    signal?: AbortSignal
    includeSummary?: boolean
  }) => {
    const requests: Array<Promise<unknown>> = [
      loadTasks({ signal: options?.signal, force: true }),
      loadProjectConditions({ signal: options?.signal }),
      loadProjectObstacles({ signal: options?.signal }),
      loadDelayRequests({ signal: options?.signal }),
    ]

    if (options?.includeSummary) {
      requests.push(
        loadProjectSummary({ signal: options.signal }),
        loadDataQualitySummary({ signal: options.signal }),
      )
    }

    await Promise.allSettled(requests)
  }, [
    loadDataQualitySummary,
    loadDelayRequests,
    loadProjectConditions,
    loadProjectObstacles,
    loadProjectSummary,
    loadTasks,
  ])
  const dataQualityRefreshKey = useMemo(() => {
    const taskSignature = tasks
      .map((task) => [
        task.id,
        task.status ?? '',
        task.progress ?? 0,
        task.start_date ?? '',
        task.end_date ?? '',
        task.updated_at ?? '',
      ].join(':'))
      .join('|')
    const conditionSignature = projectConditions
      .map((condition) => [
        condition.id,
        condition.task_id ?? '',
        condition.is_satisfied ? '1' : '0',
        condition.updated_at ?? '',
      ].join(':'))
      .join('|')
    return `${taskSignature}::${conditionSignature}`
  }, [projectConditions, tasks])

  useEffect(() => {
    if (!id) {
      setParticipantUnits([])
      setParticipantUnitsLoaded(false)
      setParticipantUnitDraft(createEmptyParticipantUnitDraft(null))
      setProjectSummary(null)
      setDataQualitySummary(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setParticipantUnitsLoaded(false)
    setProjectSummary(null)
    const controller = new AbortController()
    const tasksPromise = loadTasks({ signal: controller.signal })
    void tasksPromise.finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    })

    return () => {
      controller.abort()
    }
  }, [
    id,
    loadTasks,
    setParticipantUnits,
  ])

  useEffect(() => {
    if (!id) {
      setProjectSummary(null)
      return
    }
    if (loading) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadProjectSummary({ signal: controller.signal })
    }, 1200)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [id, loadProjectSummary, loading])

  useEffect(() => {
    if (!id) {
      setDataQualitySummary(null)
      return
    }
    if (loading) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadDataQualitySummary({ signal: controller.signal })
    }, 1500)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [dataQualityRefreshKey, id, loadDataQualitySummary, loading])

  useEffect(() => {
    if (!id) {
      return
    }
    if (!dialogOpen && !participantUnitsOpen) {
      return
    }
    if (participantUnitsLoaded || participantUnitsLoading) {
      return
    }

    const controller = new AbortController()
    void loadParticipantUnits({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [
    dialogOpen,
    id,
    loadParticipantUnits,
    participantUnitsLoaded,
    participantUnitsLoading,
    participantUnitsOpen,
  ])

  useEffect(() => {
    if (!id || !lastRealtimeEvent) {
      return
    }

    if (lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== id) {
      return
    }

    const entityType = String(lastRealtimeEvent.entityType ?? '').trim()
    if (!['task', 'delay_request', 'task_condition', 'task_obstacle', 'milestone'].includes(entityType)) {
      return
    }

    const eventKey = [
      lastRealtimeEvent.timestamp,
      lastRealtimeEvent.type,
      lastRealtimeEvent.projectId ?? '',
      entityType,
      lastRealtimeEvent.entityId ?? '',
    ].join(':')
    if (lastHandledRealtimeEventKeyRef.current === eventKey) {
      return
    }
    lastHandledRealtimeEventKeyRef.current = eventKey

    const controller = new AbortController()
    void refreshGanttProjectData({ signal: controller.signal, includeSummary: true })

    return () => {
      controller.abort()
    }
  }, [
    id,
    lastRealtimeEvent,
    refreshGanttProjectData,
  ])

  useEffect(() => {
    if (!id || typeof window === 'undefined') {
      return
    }

    let activeController: AbortController | null = null
    const refreshVisiblePage = () => {
      if (document.visibilityState === 'hidden') {
        return
      }

      activeController?.abort()
      activeController = new AbortController()
      void refreshGanttProjectData({ signal: activeController.signal })
    }

    const timer = window.setInterval(refreshVisiblePage, 4000)
    return () => {
      window.clearInterval(timer)
      activeController?.abort()
    }
  }, [id, refreshGanttProjectData])

  useEffect(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
  }, [id])

  const buildLiveCheckDraft = useCallback(
    () => ({
      id: editingTask?.id,
      title: formData.name,
      description: formData.description || null,
      status: formData.status,
      priority: formData.priority,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      planned_start_date: formData.start_date || null,
      planned_end_date: formData.end_date || null,
      progress: formData.progress,
      assignee_name: formData.assignee_name || null,
      responsible_unit: formData.responsible_unit || null,
      dependencies: formData.dependencies,
      parent_id: formData.parent_id,
      milestone_id: formData.milestone_id,
      specialty_type: formData.specialty_type || null,
      reference_duration: formData.reference_duration ? Number(formData.reference_duration) : null,
      is_milestone: Boolean(editingTask?.is_milestone),
    }),
    [
      editingTask?.id,
      editingTask?.is_milestone,
      formData.assignee_name,
      formData.dependencies,
      formData.description,
      formData.end_date,
      formData.milestone_id,
      formData.name,
      formData.parent_id,
      formData.priority,
      formData.progress,
      formData.reference_duration,
      formData.responsible_unit,
      formData.specialty_type,
      formData.start_date,
      formData.status,
    ],
  )

  useEffect(() => {
    if (!dialogOpen || !id) {
      setLiveCheckSummary(null)
      setLiveCheckLoading(false)
      return
    }

    const hasDraftContent = Boolean(
      editingTask
      || formData.name.trim()
      || formData.description.trim()
      || formData.start_date
      || formData.end_date
      || formData.progress > 0
      || formData.dependencies.length > 0
      || formData.parent_id
      || formData.milestone_id
      || formData.assignee_name.trim()
      || formData.responsible_unit.trim(),
    )

    if (!hasDraftContent) {
      setLiveCheckSummary(null)
      setLiveCheckLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLiveCheckLoading(true)
      void DataQualityApiService.liveCheckTaskDraft(
        id,
        buildLiveCheckDraft(),
        editingTask?.id,
        { signal: controller.signal },
      )
        .then((summary) => {
          if (!controller.signal.aborted) {
            setLiveCheckSummary(summary)
          }
        })
        .catch((error) => {
          if (!isAbortError(error)) {
            console.warn('[GanttView] live data-quality check failed', error)
            setLiveCheckSummary(null)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLiveCheckLoading(false)
          }
        })
    }, 240)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    dialogOpen,
    editingTask,
    formData.assignee_name,
    formData.dependencies,
    formData.description,
    formData.end_date,
    formData.milestone_id,
    formData.name,
    formData.parent_id,
    formData.priority,
    formData.progress,
    formData.reference_duration,
    formData.responsible_unit,
    formData.specialty_type,
    formData.start_date,
    formData.status,
    buildLiveCheckDraft,
    id,
  ])

  const handleSaveTask = async () => {
    if (taskSaving) return

    const nextErrors: { name?: string; start_date?: string; end_date?: string } = {}
    if (!formData.name.trim()) {
      nextErrors.name = '请输入任务名称'
    }
    if (!formData.start_date) {
      nextErrors.start_date = '甘特与关键路径任务必须填写开始日期'
    }
    if (!formData.end_date) {
      nextErrors.end_date = '甘特与关键路径任务必须填写结束日期'
    }
    setTaskFormErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0 || !id) {
      if (Object.keys(nextErrors).length > 0) {
        toast({ title: '请先补全任务日期与名称', variant: 'destructive' })
      }
      return
    }

    // 妤犲矁鐦夋笟婵婄娴犺濮熼惃鍕）閺?
    if (formData.dependencies && formData.dependencies.length > 0) {
      const newStartDate = formData.start_date ? new Date(formData.start_date) : null
      const newEndDate = formData.end_date ? new Date(formData.end_date) : null
      
      for (const depId of formData.dependencies) {
        const depTask = tasks.find(t => t.id === depId)
        if (!depTask) continue
        
        const depStartDate = depTask.start_date ? new Date(depTask.start_date) : null
        const depEndDate = depTask.end_date ? new Date(depTask.end_date) : null
        
        if (newStartDate && depEndDate && newStartDate < depEndDate) {
          toast({ 
            title: '日期冲突', 
            description: `依赖任务 "${depTask.title || depTask.name}" 完成于 ${depTask.end_date}，当前任务开始时间不能早于此时间`,
            variant: 'destructive' 
          })
          return
        }
        
        if (newStartDate && depStartDate && newStartDate < depStartDate) {
          toast({ 
            title: '日期建议', 
            description: `依赖任务 "${depTask.title || depTask.name}" 开始于 ${depTask.start_date}，建议当前任务安排在其之后`,
          })
        }
      }
    }

    try {
      setTaskSaving(true)

      const preSaveSummary = await DataQualityApiService.liveCheckTaskDraft(
        id,
        buildLiveCheckDraft(),
        editingTask?.id,
      ).catch((error) => {
        console.warn('[GanttView] pre-save live data-quality check failed', error)
        return null
      })

      if (preSaveSummary) {
        setLiveCheckSummary(preSaveSummary)
      }

      let autoStatus = formData.status
      if (formData.progress >= 100 && formData.status !== 'completed') {
        autoStatus = 'completed'
      } else if (formData.progress === 0 && formData.status === 'completed') {
        autoStatus = 'todo'
      }

      const boundParticipantUnit = formData.participant_unit_id
        ? participantUnits.find((unit) => unit.id === formData.participant_unit_id) ?? null
        : null
      const resolvedResponsibleUnit = (
        boundParticipantUnit?.unit_name
        || formData.responsible_unit
      ).trim()

      const taskData: Partial<Task> = {
        title: formData.name,  // name -> title
        description: formData.description,
        status: autoStatus,
        priority: formData.priority,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        actual_start_date: formData.actual_start_date || null,
        planned_start_date: formData.start_date || null,
        planned_end_date: formData.end_date || null,
        progress: formData.progress,
        assignee: formData.assignee_name,  // assignee_name -> assignee
        assignee_user_id: formData.assignee_user_id || null,
        participant_unit_id: formData.participant_unit_id || null,
        responsible_unit: resolvedResponsibleUnit || undefined,
        assignee_unit: resolvedResponsibleUnit || undefined,
        dependencies: formData.dependencies || [],
        parent_id: formData.parent_id || null,
        milestone_id: formData.milestone_id || null,
        project_id: id,
        updated_at: new Date().toISOString(),
        specialty_type: formData.specialty_type || null,  // #12
        reference_duration: formData.reference_duration ? Number(formData.reference_duration) : undefined,  // #7
        ...(formData.progress > 0 && editingTask && !editingTask.first_progress_at
          ? { first_progress_at: new Date().toISOString() }
          : {}),
      }

      if (editingTask) {
        const shouldWarnConditionAdvance = Number(editingTask.progress ?? 0) === 0
          && Number(formData.progress ?? 0) > 0
          && unmetEditingTaskConditions.length > 0
        const currentVersion = editingTask.version || 1
        const res = await fetch(
          `${API_BASE}/api/tasks/${editingTask.id}`,
          withRequestContext({
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...taskData, version: currentVersion }),
          }),
        )
        const json = await res.json()
        if (res.status === 409) {
          const serverRes = await fetch(`${API_BASE}/api/tasks/${editingTask.id}`, withRequestContext())
          const serverJson = await serverRes.json()
          setConflictData({
            localVersion: { ...editingTask, ...taskData } as unknown as Task,
            serverVersion: (serverJson.data || serverJson) as unknown as Task
          })
          setPendingTaskData(taskData)
          setConflictOpen(true)
          return
        } else if (json.success) {
          updateTask(editingTask.id, json.data)
          if (shouldWarnConditionAdvance) {
            openConditionWarning(editingTask, unmetEditingTaskConditions.length)
          }
          toast({
            title: preSaveSummary?.count
              ? `任务已更新，另有 ${preSaveSummary.count} 条数据矛盾待确认`
              : '任务已更新',
            description: preSaveSummary?.count ? preSaveSummary.summary : undefined,
          })
        } else {
          throw new Error(json.error?.message || '更新失败')
        }
      } else {
        const res = await fetch(
          `${API_BASE}/api/tasks`,
          withRequestContext({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData),
          }),
        )
        const json = await res.json()
        if (!json.success) {
          const detail = json.error?.details || json.error?.message || '閸掓稑缂撴径杈Е'
          throw new Error(detail)
        }
        const newTask = json.data as Task
        addTask(toStoreTaskRecord(newTask))
        toast({
          title: preSaveSummary?.count
            ? `任务已创建，另有 ${preSaveSummary.count} 条数据矛盾待确认`
            : '任务已创建',
          description: preSaveSummary?.count ? preSaveSummary.summary : undefined,
        })
        setNewTaskConditionPromptId(newTask.id)
      }

      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('保存任务失败:', error)
      toast({ title: '保存失败: ' + (error as Error).message, variant: 'destructive' })
    } finally {
      setTaskSaving(false)
    }
  }

  const openTaskDeleteGuard = useCallback((taskId: string) => {
    const targetTask = tasks.find((item) => item.id === taskId)
    setDeleteGuardTarget({
      kind: 'task',
      id: taskId,
      title: targetTask?.title || targetTask?.name || '未命名任务',
      blocked: false,
    })
  }, [tasks])

  const closeDeleteGuard = useCallback(() => {
    if (deleteGuardSubmitting || deleteGuardSecondarySubmitting) return
    setDeleteGuardTarget(null)
  }, [deleteGuardSecondarySubmitting, deleteGuardSubmitting])

  const handleCloseTaskRecord = useCallback(async (taskId: string) => {
    const targetTask = tasks.find((item) => item.id === taskId)
    const closeEndpoint =
      deleteGuardTarget?.kind === 'task' && deleteGuardTarget.id === taskId
        ? deleteGuardTarget.details?.close_action?.endpoint
        : null
    if (!targetTask) {
      setDeleteGuardTarget(null)
      return
    }
    if (targetTask.status === 'completed' && Number(targetTask.progress ?? 0) >= 100) {
      toast({ title: '任务已处于关闭态', description: '当前任务已经是已完成状态。' })
      setDeleteGuardTarget(null)
      return
    }
    try {
      setDeleteGuardSecondarySubmitting(true)
      const response = await fetch(
        `${API_BASE}${closeEndpoint || `/api/tasks/${taskId}/close`}`,
        withRequestContext({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version: targetTask.version ?? 1 }),
        }),
      )
      const json = await response.json()
      if (!json.success) {
        throw new Error(extractApiErrorMessage(json, '关闭任务失败'))
      }
      updateTask(taskId, json.data as Task)
      if (selectedTask?.id === taskId) {
        setSelectedTask(json.data as Task)
      }
      setDeleteGuardTarget(null)
      toast({ title: '已关闭此任务记录', description: '任务已转为完成态，留痕会继续保留。' })
    } catch (error) {
      toast({
        title: '关闭任务失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteGuardSecondarySubmitting(false)
    }
  }, [deleteGuardTarget, selectedTask?.id, tasks, updateTask])

  const handleConfirmDeleteGuard = useCallback(async () => {
    if (!deleteGuardTarget) return
    if (deleteGuardTarget.blocked) {
      setDeleteGuardTarget(null)
      return
    }
    try {
      setDeleteGuardSubmitting(true)
      if (deleteGuardTarget.kind === 'task') {
        const response = await fetch(
          `${API_BASE}/api/tasks/${deleteGuardTarget.id}`,
          withRequestContext({
            method: 'DELETE',
          }),
        )
        const json = await response.json()
        if (!json.success) {
          if (response.status === 422) {
            const nextGuard = buildDeleteProtectionState('task', deleteGuardTarget.id, deleteGuardTarget.title, json)
            if (nextGuard) {
              setDeleteGuardTarget(nextGuard)
              return
            }
          }
          throw new Error(extractApiErrorMessage(json, '删除任务失败'))
        }
        deleteTask(deleteGuardTarget.id)
        setDeleteGuardTarget(null)
        toast({ title: '任务已删除', description: `已移除“${deleteGuardTarget.title}”。` })
        return
      }
      const response = await fetch(
        `${API_BASE}/api/task-obstacles/${deleteGuardTarget.id}`,
        withRequestContext({
          method: 'DELETE',
        }),
      )
      const json = await response.json()
      if (!json.success) {
        if (response.status === 422) {
          const nextGuard = buildDeleteProtectionState('obstacle', deleteGuardTarget.id, deleteGuardTarget.title, json)
          if (nextGuard) {
            setDeleteGuardTarget(nextGuard)
            return
          }
        }
        throw new Error(extractApiErrorMessage(json, '删除阻碍失败'))
      }
      setProjectObstacles(toStoreObstacleRecords(projectObstacles.filter((obstacle) => obstacle.id !== deleteGuardTarget.id)))
      setTaskObstacles((prev) => prev.filter((obstacle) => obstacle.id !== deleteGuardTarget.id))
      setDeleteGuardTarget(null)
      toast({ title: '阻碍记录已删除', description: `已移除“${deleteGuardTarget.title}”。` })
    } catch (error) {
      toast({
        title: deleteGuardTarget.kind === 'task' ? '删除任务失败' : '删除阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteGuardSubmitting(false)
    }
  }, [deleteGuardTarget, deleteTask, projectObstacles, setProjectObstacles])

  const handleDeleteTask = useCallback((taskId: string) => {
    openTaskDeleteGuard(taskId)
  }, [openTaskDeleteGuard])

  const handleViewTaskSummary = (taskId: string) => {
    navigate(`/projects/${id}/task-summary?taskId=${taskId}`)
  }

  const handleStatusChange = async (taskId: string, val: string) => {
    const task = tasks.find(t => t.id === taskId)
    const statusPayload: Record<string, unknown> = {
      status: val,
      updated_at: new Date().toISOString(),
      version: task?.version ?? 1,
    }
    if (val === 'completed') {
      statusPayload.progress = 100
    }
    const res = await fetch(
      `${API_BASE}/api/tasks/${taskId}`,
      withRequestContext({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusPayload),
      }),
    )
    const json = await res.json()
    if (json.success) {
      const updatedTask = json.data as Partial<Task> | undefined
      updateTask(taskId, {
        status: (updatedTask?.status ?? val) as 'todo' | 'in_progress' | 'completed',
        ...(typeof updatedTask?.progress === 'number'
          ? { progress: updatedTask.progress }
          : val === 'completed'
            ? { progress: 100 }
            : {}),
        ...(updatedTask?.actual_start_date ? { actual_start_date: updatedTask.actual_start_date } : {}),
        ...(updatedTask?.actual_end_date ? { actual_end_date: updatedTask.actual_end_date } : {}),
        ...(typeof updatedTask?.version === 'number' ? { version: updatedTask.version } : {}),
      })
      const submitAutoDelayRequest = async (reason: string, delayedDate: string) => {
        if (!task?.end_date || !id) return
        const now = new Date()
        const endDate = new Date(task.end_date)
        if (Number.isNaN(endDate.getTime()) || now <= endDate) return
        const delayDays = Math.ceil((now.getTime() - endDate.getTime()) / 86400000)
        try {
          await fetch(`${API_BASE}/api/delay-requests`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              task_id: taskId,
              project_id: id,
              baseline_version_id: baselineOptions[0]?.id ?? null,
              original_date: task.end_date,
              delayed_date: delayedDate,
              delay_days: delayDays,
              reason,
              delay_reason: reason,
            }),
            ...withCredentials(),
          })
        } catch {
        }
      }
      if (task && val === 'in_progress' && task.end_date) {
        void submitAutoDelayRequest('手动标记开工时已逾期', new Date().toISOString().slice(0, 10))
      }
      if (task && val === 'completed' && task.end_date) {
        void submitAutoDelayRequest('逾期完成', new Date().toISOString().slice(0, 10))
      }
    }
  }

  const handlePriorityChange = async (taskId: string, val: string) => {
    const task = tasks.find(t => t.id === taskId)
    const res = await fetch(
      `${API_BASE}/api/tasks/${taskId}`,
      withRequestContext({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priority: val, updated_at: new Date().toISOString(), version: task?.version ?? 1 }),
      }),
    )
    const json = await res.json()
    if (json.success) {
      updateTask(taskId, { priority: val as 'low' | 'medium' | 'high' | 'urgent' })
    }
  }

  const openEditDialog = (task?: Task, parentId?: string) => {
    if (task) {
      setEditingTask(task)
      setTaskFormErrors({})
      setFormData({
        name: task.title || task.name || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        start_date: task.planned_start_date || task.start_date || '',
        end_date: task.planned_end_date || task.end_date || '',
        actual_start_date: task.actual_start_date || '',
        progress: task.progress || 0,
        assignee_name: task.assignee_name || '',
        assignee_user_id: task.assignee_user_id || null,
        participant_unit_id: task.participant_unit_id || null,
        responsible_unit: task.responsible_unit || '',
        dependencies: task.dependencies || [],
        parent_id: task.parent_id || null,
        milestone_id: task.milestone_id || null,
        specialty_type: task.specialty_type || '',
        reference_duration: task.reference_duration != null ? String(task.reference_duration) : '',
      })
    } else {
      resetForm()
      if (parentId) {
        setFormData(prev => ({ ...prev, parent_id: parentId }))
      }
    }
    setNewTaskParentId(parentId || null)
    setDialogOpen(true)
  }

  const handleSelectMilestoneLevel = async (level: number | null) => {
    if (!milestoneTargetTask?.id) return

    try {
      const response = await fetch(
        `${API_BASE}/api/tasks/${milestoneTargetTask.id}`,
        withRequestContext({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_milestone: level !== null,
            milestone_level: level,
            version: milestoneTargetTask.version ?? 1,
          }),
        }),
      )
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error?.message || '里程碑设置失败')
      }

      updateTask(milestoneTargetTask.id, {
        is_milestone: level !== null,
        milestone_level: level ?? undefined,
      })
      toast({
        title: level === null ? '已取消里程碑标记' : zhCN.gantt.milestoneToast.replace('{label}', MILESTONE_LEVEL_CONFIG[level]?.label ?? '里程碑'),
      })
      setMilestoneDialogOpen(false)
      setMilestoneTargetTask(null)
    } catch (error) {
      console.error('设置里程碑失败:', error)
      toast({
        title: '设置里程碑失败',
        variant: 'destructive',
      })
    }
  }

  const handleDependencyChange = (taskId: string, checked: boolean) => {
    const currentDeps = formData.dependencies || []
    if (checked) {
      if (taskId !== editingTask?.id) {
        setFormData({ ...formData, dependencies: [...currentDeps, taskId] })
      }
    } else {
      setFormData({ ...formData, dependencies: currentDeps.filter(id => id !== taskId) })
    }
  }

  const resetForm = () => {
    setEditingTask(null)
    setAiDurationSuggestion(null)
    setLiveCheckSummary(null)
    setLiveCheckLoading(false)
    setTaskFormErrors({})
    setFormData({
      name: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      start_date: '',
      end_date: '',
      actual_start_date: '',
      progress: 0,
      assignee_name: '',
      assignee_user_id: null,
      participant_unit_id: null,
      responsible_unit: '',
      dependencies: [],
      parent_id: null,
      milestone_id: null,
      specialty_type: '',
      reference_duration: '',
    })
    setNewTaskParentId(null)
  }

  const openParticipantUnitsDialog = useCallback(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
    setParticipantUnitsOpen(true)
  }, [id])

  const handleParticipantUnitCreateNew = useCallback(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
  }, [id])

  const handleParticipantUnitEdit = useCallback((unit: ParticipantUnitRecord) => {
    setParticipantUnitDraft(toParticipantUnitDraft(unit, id))
  }, [id])

  const handleParticipantUnitSubmit = useCallback(async () => {
    if (!id) return

    const payload = {
      project_id: id,
      unit_name: participantUnitDraft.unit_name.trim(),
      unit_type: participantUnitDraft.unit_type.trim(),
      contact_name: participantUnitDraft.contact_name.trim() || null,
      contact_role: participantUnitDraft.contact_role.trim() || null,
      contact_phone: participantUnitDraft.contact_phone.trim() || null,
      contact_email: participantUnitDraft.contact_email.trim() || null,
    }

    if (!payload.unit_name || !payload.unit_type) {
      toast({ title: '请先补全单位名称和单位类型', variant: 'destructive' })
      return
    }

    setParticipantUnitSaving(true)
    try {
      if (participantUnitDraft.id) {
        const updated = await apiPut<ParticipantUnitRecord>(`/api/participant-units/${participantUnitDraft.id}`, {
          ...payload,
          version: participantUnitDraft.version ?? 1,
        })
        setParticipantUnits(sortParticipantUnits(
          participantUnits.map((unit) => (unit.id === updated.id ? updated : unit)),
        ))
        toast({ title: '参建单位已更新', description: updated.unit_name })
      } else {
        const created = await apiPost<ParticipantUnitRecord>('/api/participant-units', payload)
        setParticipantUnits(sortParticipantUnits([...participantUnits, created]))
        toast({ title: '参建单位已创建', description: created.unit_name })
      }

      setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
      void loadTasks()
    } catch (error) {
      toast({
        title: '参建单位保存失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [id, loadTasks, participantUnitDraft, participantUnits, setParticipantUnits])

  const handleParticipantUnitDelete = useCallback(async (unit: ParticipantUnitRecord) => {
    setParticipantUnitSaving(true)
    try {
      await apiDelete(`/api/participant-units/${unit.id}`)
      setParticipantUnits(participantUnits.filter((item) => item.id !== unit.id))
      setParticipantUnitDraft((current) => (current.id === unit.id ? createEmptyParticipantUnitDraft(id) : current))
      toast({ title: '参建单位已删除', description: unit.unit_name })
      void loadTasks()
    } catch (error) {
      toast({
        title: '参建单位删除失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [id, loadTasks, participantUnits, setParticipantUnits])

  // AI 工期建议：依据历史数据给出参考时长
  const fetchAiDurationSuggestion = useCallback(async () => {
    if (!editingTask?.id || !id) return
    setAiDurationLoading(true)
    setAiDurationSuggestion(null)
    try {
      const res = await fetch(
        `${API_BASE}/api/ai-duration/estimate-duration`,
        withRequestContext({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task_id: editingTask.id,
            project_id: id,
            historical_data: true,
          }),
        }),
      )
      const data = await res.json()
      if (data.success && data.data) {
        setAiDurationSuggestion({
          estimated_duration: data.data.estimated_duration,
          confidence_level: data.data.confidence_level,
          confidence_score: data.data.confidence_score,
          factors: data.data.factors || {},
        })
      } else {
        toast({ title: '暂无历史数据，AI 工期建议不可用', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'AI 工期建议获取失败', variant: 'destructive' })
    } finally {
      setAiDurationLoading(false)
    }
  }, [editingTask, id])

  const applyAiDuration = useCallback(() => {
    if (!aiDurationSuggestion) return
    const start = formData.start_date ? new Date(formData.start_date) : new Date()
    const end = new Date(start.getTime() + aiDurationSuggestion.estimated_duration * 24 * 60 * 60 * 1000)
    const endStr = end.toISOString().split('T')[0]
    setFormData(prev => ({ ...prev, end_date: endStr }))
    toast({ title: '已应用 AI 建议工期：' + aiDurationSuggestion.estimated_duration + ' 天' })
  }, [aiDurationSuggestion, formData.start_date])

  // 鐗堟湰鍐茬獊婢跺嫮鎮婇崙鑺ユ殶
  const handleKeepLocal = useCallback(async () => {
    if (!conflictData || !pendingTaskData || !editingTask) return

    const serverVersion = conflictData.serverVersion.version || 1
    const res = await fetch(
      `${API_BASE}/api/tasks/${editingTask.id}`,
      withRequestContext({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...pendingTaskData, version: serverVersion }),
      }),
    )
    const json = await res.json()
    if (json.success) {
      updateTask(editingTask.id, json.data)
    }
    toast({ title: '已保留你的修改' })
    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
  }, [conflictData, pendingTaskData, editingTask, updateTask])

  const handleKeepServer = useCallback(() => {
    if (!conflictData || !editingTask) return

    updateTask(editingTask.id, conflictData.serverVersion)
    toast({ title: '已使用服务器版本' })

    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
    setDialogOpen(false)
    resetForm()
  }, [conflictData, editingTask, updateTask])

  const handleMerge = useCallback(() => {
    setConflictOpen(false)
    toast({
      title: '请手动合并差异',
      description: '服务器版本已经加载到表单中',
    })
  }, [])

  const openConditionDialog = async (task: Task) => {
    const nextConditions = scopedProjectConditions.filter(
      (condition) => condition.task_id === task.id,
    ) as TaskCondition[]

    setConditionTask(task)
    setConditionDialogOpen(true)
    setConditionsLoading(true)
    setNewConditionName('')
    setTaskConditions(nextConditions)
    try {
      const precedingTaskPromises = nextConditions.map(async (cond) => {
        try {
          const prRes = await fetch(`/api/task-conditions/${cond.id}/preceding-tasks`, withRequestContext())
          const prJson = await prRes.json()
          return { conditionId: cond.id, tasks: prJson.data || [] }
        } catch {
          return { conditionId: cond.id, tasks: [] }
        }
      })
      const precedingTaskResults = await Promise.all(precedingTaskPromises)
      const ptMap: Record<string, Array<{task_id: string; title?: string; name?: string; status?: string}>> = {}
      for (const r of precedingTaskResults) {
        ptMap[r.conditionId] = r.tasks
      }
      setConditionPrecedingTasks(ptMap)
    } catch {
      toast({ title: '加载条件失败', variant: 'destructive' })
    } finally {
      setConditionsLoading(false)
    }
  }

  const handleAddCondition = async () => {
    if (!newConditionName.trim() || !conditionTask) return
    try {
      const body: Record<string, unknown> = {
        task_id: conditionTask.id,
        project_id: conditionTask.project_id,
        name: newConditionName.trim(),
        is_satisfied: false,
        condition_type: newConditionType,
      }
      if (newConditionTargetDate) body.target_date = newConditionTargetDate
      if (newConditionDescription.trim()) body.description = newConditionDescription.trim()
      if (newConditionResponsibleUnit.trim()) body.responsible_unit = newConditionResponsibleUnit.trim()
      const res = await fetch(`${API_BASE}/api/task-conditions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextCondition = json.data as TaskCondition
        if (newConditionType === 'preceding' && newConditionPrecedingTaskIds.length > 0) {
          await fetch(`${API_BASE}/api/task-conditions/${json.data.id}/preceding-tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ preceding_task_ids: newConditionPrecedingTaskIds }),
          })
        }
        setProjectConditions(toStoreConditionRecords([...projectConditions, nextCondition]))
        setTaskConditions(prev => [...prev, nextCondition])
        setInlineConditionsMap(prev => {
          if (!conditionTask || !prev[conditionTask.id]) return prev
          return {
            ...prev,
            [conditionTask.id]: [...prev[conditionTask.id], nextCondition],
          }
        })
        setNewConditionName('')
        setNewConditionType('other')
        setNewConditionTargetDate('')
        setNewConditionDescription('')
        setNewConditionResponsibleUnit('')
        setNewConditionPrecedingTaskIds([])
      }
    } catch {
      toast({ title: '新增开工条件失败', variant: 'destructive' })
    }
  }

  const handleToggleCondition = async (cond: TaskCondition) => {
    try {
      const res = await fetch(`/api/task-conditions/${cond.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_satisfied: !cond.is_satisfied }),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextCondition = (json.data ?? { ...cond, is_satisfied: !cond.is_satisfied }) as TaskCondition
        setProjectConditions(
          toStoreConditionRecords(projectConditions.map((item) => (item.id === cond.id ? { ...item, ...nextCondition } : item))),
        )
        setTaskConditions(prev => prev.map(c => c.id === cond.id ? nextCondition : c))
        setInlineConditionsMap(prev => {
          if (!cond.task_id || !prev[cond.task_id]) return prev
          return {
            ...prev,
            [cond.task_id]: prev[cond.task_id].map((item) => (item.id === cond.id ? nextCondition : item)),
          }
        })
      }
    } catch {
      toast({ title: '更新开工条件失败', variant: 'destructive' })
    }
  }

  const handleAdminForceSatisfyCondition = useCallback((cond: TaskCondition) => {
    setForceSatisfyCondition(cond)
    setForceSatisfyReason('')
    setForceSatisfyDialogOpen(true)
  }, [])

  const closeForceSatisfyDialog = useCallback(() => {
    setForceSatisfyDialogOpen(false)
    setForceSatisfyCondition(null)
    setForceSatisfyReason('')
  }, [])

  const confirmAdminForceSatisfyCondition = useCallback(async () => {
    if (!forceSatisfyCondition) return
    const trimmedReason = forceSatisfyReason.trim()
    if (!trimmedReason) {
      toast({ title: '请先填写强制满足原因', variant: 'destructive' })
      return
    }
    try {
      const res = await fetch(`/api/task-conditions/${forceSatisfyCondition.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          is_satisfied: true,
          change_source: 'admin_force',
          satisfied_reason: 'admin_force',
          satisfied_reason_note: trimmedReason,
          change_reason: trimmedReason,
        }),
        ...withCredentials(),
      })
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error?.message || '强制满足失败')
      }
      const nextCondition = (json.data ?? { ...forceSatisfyCondition, is_satisfied: true }) as TaskCondition
      setProjectConditions(
        toStoreConditionRecords(
          projectConditions.map((item) => (item.id === forceSatisfyCondition.id ? { ...item, ...nextCondition } : item)),
        ),
      )
      setTaskConditions((prev) => prev.map((item) => (item.id === forceSatisfyCondition.id ? nextCondition : item)))
      setInlineConditionsMap((prev) => {
        if (!forceSatisfyCondition.task_id || !prev[forceSatisfyCondition.task_id]) return prev
        return {
          ...prev,
          [forceSatisfyCondition.task_id]: prev[forceSatisfyCondition.task_id].map((item) => (item.id === forceSatisfyCondition.id ? nextCondition : item)),
        }
      })
      closeForceSatisfyDialog()
      toast({ title: '已强制满足条件', description: '管理员原因和留痕已同步更新。' })
    } catch (error) {
      console.error('强制满足条件失败', error)
      toast({ title: '强制满足失败', variant: 'destructive' })
    }
  }, [
    closeForceSatisfyDialog,
    forceSatisfyCondition,
    forceSatisfyReason,
    projectConditions,
    setProjectConditions,
    setTaskConditions,
  ])

  const handleDeleteCondition = async (condId: string) => {
    try {
      const res = await fetch(
        `/api/task-conditions/${condId}`,
        withRequestContext({
          method: 'DELETE',
        }),
      )
      const json = await res.json()
      if (json.success) {
        setProjectConditions(toStoreConditionRecords(projectConditions.filter((condition) => condition.id !== condId)))
        setTaskConditions(prev => prev.filter(c => c.id !== condId))
        if (conditionTask) {
          setInlineConditionsMap(prev => {
            if (!prev[conditionTask.id]) return prev
            return {
              ...prev,
              [conditionTask.id]: prev[conditionTask.id].filter((condition) => condition.id !== condId),
            }
          })
        }
      }
    } catch {
      toast({ title: '删除条件失败', variant: 'destructive' })
    }
  }

  const pendingDelayRequest = selectedTaskDelayRequests.find((request) => request.status === 'pending') ?? null
  const rejectedDelayRequest = selectedTaskDelayRequests.find((request) => request.status === 'rejected') ?? null
  const duplicateRejectedReason = Boolean(
    rejectedDelayRequest &&
    delayRequestForm.reason.trim() &&
    delayRequestForm.reason.trim() === (rejectedDelayRequest.reason ?? rejectedDelayRequest.delay_reason ?? '').trim(),
  )
  const currentDelayBaseDate = selectedTask?.planned_end_date || selectedTask?.end_date || ''
  const requestedDelayDays = selectedTask && delayRequestForm.delayedDate && currentDelayBaseDate
    ? Math.max(0, Math.ceil((new Date(delayRequestForm.delayedDate).getTime() - new Date(currentDelayBaseDate).getTime()) / 86400000))
    : 0
  const selectedTaskFloatDays = selectedTask ? (criticalPathTaskMap.get(selectedTask.id)?.floatDays ?? 0) : 0
  const delayImpactDays = selectedTask && requestedDelayDays > 0
    ? calculateDelayImpact(
        selectedTask.id,
        requestedDelayDays,
        { float: new Map([[selectedTask.id, selectedTaskFloatDays]]) } as never,
      )
    : 0
  const delayImpactSummary = requestedDelayDays <= 0
    ? '选择延期后的日期后，将自动估算对总工期的影响。'
    : delayImpactDays > 0
      ? `预计会把项目总工期推迟 ${delayImpactDays} 天。`
      : `当前浮时 ${selectedTaskFloatDays} 天，可吸收本次延期。`

  const handleReviewDelayRequest = async (requestId: string, action: 'approve' | 'reject') => {
    if (!selectedTask) return
    try {
      setDelayRequestReviewingId(`${action}:${requestId}`)
      const response = await fetch(`${API_BASE}/api/delay-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        ...withCredentials(),
      })
      const json = await response.json()
      if (!json.success) {
        throw new Error(json.error?.message || `延期申请${action === 'approve' ? '批准' : '驳回'}失败`)
      }
      mergeDelayRequestIntoStore(json.data)
      if (action === 'approve') {
        const taskId = String(json.data?.task_id ?? selectedTask.id ?? '').trim()
        if (taskId) {
          try {
            const taskResponse = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
              headers: getAuthHeaders(),
              ...withCredentials(),
            })
            const taskJson = await taskResponse.json()
            if (taskResponse.ok && taskJson?.success && taskJson.data) {
              const nextTask = taskJson.data as Task
              updateTask(taskId, toStoreTaskPatch(nextTask))
              setSelectedTask((previous) => (previous?.id === taskId ? { ...previous, ...nextTask } : previous))
              setDelayRequestForm((previous) => ({
                ...previous,
                delayedDate: toDateValue(nextTask.planned_end_date || nextTask.end_date),
                reason: '',
              }))
            }
          } catch (refreshError) {
            console.warn('延期申请已批准，但任务详情刷新失败:', refreshError)
          }
        }
      }
      toast({ title: action === 'approve' ? '延期申请已批准' : '延期申请已驳回' })
    } catch (error) {
      console.error('延期申请审批失败:', error)
      toast({
        title: action === 'approve' ? '批准延期申请失败' : '驳回延期申请失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setDelayRequestReviewingId(null)
    }
  }

  const handleSubmitDelayRequest = async () => {
    if (!selectedTask || !id) return

    const originalPlannedEndDate = selectedTask.planned_end_date || selectedTask.end_date || ''
    const delayedDate = delayRequestForm.delayedDate
    const reason = delayRequestForm.reason.trim()
    const nextErrors: {
      baselineVersionId?: string
      delayedDate?: string
      reason?: string
      form?: string
    } = {}

    if (!originalPlannedEndDate) {
      nextErrors.form = '缺少原计划完成日期，暂不支持提交延期申请。'
    }
    if (!delayRequestForm.baselineVersionId) {
      nextErrors.baselineVersionId = '请选择当前生效的基线版本。'
    }
    if (pendingDelayRequest) {
      setDelayFormErrors({
        form: buildDelayConflictMessage('PENDING_CONFLICT', {
          pending_delayed_date: pendingDelayRequest.delayed_date ?? null,
          pending_reason: pendingDelayRequest.reason ?? pendingDelayRequest.delay_reason ?? null,
        }, '已有待审批申请').form,
      })
      toast({ title: '已有待审批申请，当前不能重复提交。', variant: 'destructive' })
      return
    }
    if (!delayedDate) {
      nextErrors.delayedDate = '请选择延期后的日期。'
    }
    if (!reason) {
      nextErrors.reason = '请填写延期原因。'
    }
    if (delayedDate && originalPlannedEndDate && new Date(delayedDate) <= new Date(originalPlannedEndDate)) {
      nextErrors.delayedDate = '延期后的日期必须晚于原计划完成日期。'
    }
    if (duplicateRejectedReason) {
      nextErrors.reason = '重新提交原因不能与最近一次驳回原因重复。'
    }

    setDelayFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: nextErrors.form || '请先补全延期申请信息。', variant: 'destructive' })
      return
    }

    const delayDays = Math.ceil((new Date(delayedDate).getTime() - new Date(originalPlannedEndDate).getTime()) / 86400000)
    setDelayFormErrors({})
    setDelayRequestSubmitting(true)
    try {
      const response = await fetch(`${API_BASE}/api/delay-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          task_id: selectedTask.id,
          project_id: id,
          baseline_version_id: delayRequestForm.baselineVersionId,
          original_date: originalPlannedEndDate,
          delayed_date: delayedDate,
          delay_days: delayDays,
          reason,
          delay_reason: reason,
        }),
        ...withCredentials(),
      })
      const json = await response.json()
      if (!json.success) {
        const errorCode = extractApiErrorCode(json) as DelayRequestErrorCode | null
        const errorMessage = extractApiErrorMessage(json, '提交延期申请失败')
        if (errorCode === 'PENDING_CONFLICT' || errorCode === 'DUPLICATE_REASON') {
          const nextGuardrails = buildDelayConflictMessage(
            errorCode,
            extractApiErrorDetails(json) as DelayRequestErrorDetails | null,
            errorMessage,
          )
          setDelayFormErrors((previous) => ({
            ...previous,
            ...nextGuardrails,
          }))
        }
        throw new Error(errorMessage)
      }
      mergeDelayRequestIntoStore(json.data)
      toast({ title: '延期申请已提交。' })
      setDelayRequestForm((previous) => ({ ...previous, reason: '' }))
    } catch (error) {
      console.error('提交延期申请失败:', error)
      toast({ title: `提交延期申请失败：${(error as Error).message}`, variant: 'destructive' })
    } finally {
      setDelayRequestSubmitting(false)
    }
  }

  const handleWithdrawDelayRequest = async () => {
    if (!pendingDelayRequest || !selectedTask) return
    setDelayRequestWithdrawingId(pendingDelayRequest.id)
    try {
      const response = await fetch(`${API_BASE}/api/delay-requests/${pendingDelayRequest.id}/withdraw`, {
        method: 'POST',
        headers: getAuthHeaders(),
        ...withCredentials(),
      })
      const json = await response.json()
      if (!json.success) {
        throw new Error(json.error?.message || '撤回延期申请失败')
      }
      mergeDelayRequestIntoStore(json.data)
      toast({ title: '延期申请已撤回。' })
    } catch (error) {
      console.error('撤回延期申请失败:', error)
      toast({ title: `撤回延期申请失败：${(error as Error).message}`, variant: 'destructive' })
    } finally {
      setDelayRequestWithdrawingId(null)
    }
  }

  const toggleInlineConditions = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedConditionTaskId === taskId) {
      setExpandedConditionTaskId(null)
      return
    }
    setExpandedConditionTaskId(taskId)
    if (!inlineConditionsMap[taskId]) {
      setInlineConditionsMap((prev) => ({
        ...prev,
        [taskId]: scopedProjectConditions.filter((condition) => condition.task_id === taskId) as TaskCondition[],
      }))
    }
  }

  const openObstacleDialog = async (task: Task) => {
    setObstacleTask(task)
    setObstacleDialogOpen(true)
    setObstaclesLoading(true)
    setNewObstacleTitle('')
    setNewObstacleSeverity('medium')
    setNewObstacleExpectedResolutionDate('')
    setNewObstacleResolutionNotes('')
    setEditingObstacleId(null)
    setEditingObstacleTitle('')
    setEditingObstacleSeverity('medium')
    setEditingObstacleExpectedResolutionDate('')
    setEditingObstacleResolutionNotes('')
    try {
      setTaskObstacles(
        scopedProjectObstacles.filter((obstacle) => obstacle.task_id === task.id) as TaskObstacle[],
      )
    } catch {
      toast({ title: '加载障碍失败', variant: 'destructive' })
    } finally {
      setObstaclesLoading(false)
    }
  }

  const handleAddObstacle = async () => {
    if (!newObstacleTitle.trim() || !obstacleTask) return
    try {
      const res = await fetch(`${API_BASE}/api/task-obstacles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          task_id: obstacleTask.id,
          project_id: id,
          title: newObstacleTitle.trim(),
          is_resolved: false,
          severity: newObstacleSeverity,
          expected_resolution_date: newObstacleExpectedResolutionDate || null,
          resolution_notes: newObstacleResolutionNotes.trim() || null,
        }),
        ...withCredentials(),
      })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = json.data as TaskObstacle
        setProjectObstacles(toStoreObstacleRecords([nextObstacle, ...projectObstacles]))
        setTaskObstacles(prev => [nextObstacle, ...prev])
        setNewObstacleTitle('')
        setNewObstacleSeverity('medium')
        setNewObstacleExpectedResolutionDate('')
        setNewObstacleResolutionNotes('')
      }
    } catch {
      toast({ title: '新增障碍记录失败', variant: 'destructive' })
    }
  }

  const handleResolveObstacle = async (obs: TaskObstacle) => {
    try {
        const res = await fetch(`/api/task-obstacles/${obs.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ is_resolved: true }),
          ...withCredentials(),
        })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = (json.data ?? { ...obs, is_resolved: true }) as TaskObstacle
        setProjectObstacles(
          toStoreObstacleRecords(projectObstacles.map((item) => (item.id === obs.id ? { ...item, ...nextObstacle } : item))),
        )
        setTaskObstacles(prev => prev.map(o => o.id === obs.id ? nextObstacle : o))
        toast({ title: '障碍已标记为已解决' })
      }
    } catch {
      toast({ title: '操作失败', variant: 'destructive' })
    }
  }

  const handleCloseObstacleRecord = useCallback(async (obsId: string) => {
    const obstacle = taskObstacles.find((item) => item.id === obsId) ?? projectObstacles.find((item) => item.id === obsId)
    const closeEndpoint =
      deleteGuardTarget?.kind === 'obstacle' && deleteGuardTarget.id === obsId
        ? deleteGuardTarget.details?.close_action?.endpoint
        : null
    if (!obstacle) {
      setDeleteGuardTarget(null)
      return
    }
    if (obstacle.is_resolved) {
      toast({ title: '阻碍已处于关闭态', description: '当前阻碍已经是已解决状态。' })
      setDeleteGuardTarget(null)
      return
    }
    try {
      setDeleteGuardSecondarySubmitting(true)
      const response = await fetch(
        `${API_BASE}${closeEndpoint || `/api/task-obstacles/${obsId}/close`}`,
        withRequestContext({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
      )
      const json = await response.json()
      if (!json.success) {
        throw new Error(extractApiErrorMessage(json, '关闭阻碍失败'))
      }
      const nextObstacle = (isObjectRecord(json.data) ? json.data.obstacle ?? json.data : json.data) as TaskObstacle
      setProjectObstacles(
        toStoreObstacleRecords(
          projectObstacles.map((item) => (item.id === obsId ? { ...item, ...(nextObstacle ?? { ...item, is_resolved: true }) } : item)),
        ),
      )
      setTaskObstacles((prev) =>
        prev.map((item) => (item.id === obsId ? { ...item, ...(nextObstacle ?? { ...item, is_resolved: true }) } : item)),
      )
      setDeleteGuardTarget(null)
      toast({ title: '已关闭此阻碍记录', description: '阻碍已转为已解决，留痕会继续保留。' })
    } catch (error) {
      toast({
        title: '关闭阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteGuardSecondarySubmitting(false)
    }
  }, [deleteGuardTarget, projectObstacles, taskObstacles, setProjectObstacles])

  const handleDeleteObstacle = useCallback((obsId: string) => {
    const obstacle = taskObstacles.find((item) => item.id === obsId) ?? projectObstacles.find((item) => item.id === obsId)
    setDeleteGuardTarget({
      kind: 'obstacle',
      id: obsId,
      title: obstacle?.title || '未命名阻碍',
      blocked: false,
    })
  }, [projectObstacles, taskObstacles])

  const handleSaveObstacleEdit = async (obsId: string) => {
    if (!editingObstacleTitle.trim()) return
    try {
      const res = await fetch(`/api/task-obstacles/${obsId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title: editingObstacleTitle.trim(),
            severity: editingObstacleSeverity || null,
            expected_resolution_date: editingObstacleExpectedResolutionDate || null,
            resolution_notes: editingObstacleResolutionNotes.trim() || null,
          }),
          ...withCredentials(),
        })
      const json = await res.json()
      if (json.success) {
        const nextObstacle = (
          json.data
          ?? {
            ...taskObstacles.find((item) => item.id === obsId),
            title: editingObstacleTitle.trim(),
            severity: editingObstacleSeverity || null,
            expected_resolution_date: editingObstacleExpectedResolutionDate || null,
            resolution_notes: editingObstacleResolutionNotes.trim() || null,
          }
        ) as TaskObstacle
        setProjectObstacles(
          toStoreObstacleRecords(projectObstacles.map((item) => (item.id === obsId ? { ...item, ...nextObstacle } : item))),
        )
        setTaskObstacles(prev => prev.map(o => o.id === obsId ? nextObstacle : o))
        setEditingObstacleId(null)
        setEditingObstacleTitle('')
        setEditingObstacleSeverity('medium')
        setEditingObstacleExpectedResolutionDate('')
        setEditingObstacleResolutionNotes('')
        toast({ title: '障碍已更新' })
      }
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIdx = flatList.findIndex(n => n.id === active.id)
    const overIdx = flatList.findIndex(n => n.id === over.id)
    if (activeIdx === -1 || overIdx === -1) return

    const activeNode = flatList[activeIdx]
    const overNode = flatList[overIdx]

    const isCrossLevel = activeNode.parent_id !== overNode.parent_id

    const isDescendant = (nodeId: string, potentialAncestorId: string): boolean => {
      const node = tasks.find(t => t.id === nodeId)
      if (!node || !node.parent_id) return false
      if (node.parent_id === potentialAncestorId) return true
      return isDescendant(node.parent_id, potentialAncestorId)
    }
    if (isCrossLevel && isDescendant(overNode.id, activeNode.id)) {
      toast({ title: '无法移动', description: '不能将任务移动到其子任务中', variant: 'destructive' })
      return
    }

    const newParentId = overNode.parent_id
    const targetSiblings = tasks.filter(t => (t.parent_id || null) === (newParentId || null) && t.id !== activeNode.id)
    const overPos = targetSiblings.findIndex(t => t.id === overNode.id)
    const insertAt = overPos === -1 ? targetSiblings.length : overPos

    const reordered = [...targetSiblings]
    reordered.splice(insertAt, 0, activeNode)

    const otherTasks = tasks.filter(t =>
      (t.parent_id || null) !== (newParentId || null) && t.id !== activeNode.id
    )
    const updatedTasks = [
      ...otherTasks,
      ...reordered.map((t, i) => ({
        ...t,
        parent_id: newParentId,   // 鐠恒劌鐪伴弮璺烘倱濮濄儲娲块弬?activeNode 閻?parent_id
        sort_order: i,
        updated_at: new Date().toISOString()
      }))
    ]

    reordered.forEach((t, i) => {
      fetch(
        `${API_BASE}/api/tasks/${t.id}`,
        withRequestContext({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_id: newParentId,
            sort_order: i,
            updated_at: new Date().toISOString(),
          }),
        }),
      ).catch(() => { /* 閹锋牗瀚块幒鎺戠碍閹镐椒绠欓崠鏍с亼鐠愩儵娼ゆ妯侯槱閻?*/ })
    })
    setTasks(updatedTasks)
    toast({ title: isCrossLevel ? '已移动到新层级' : '排序已更新' })
  }, [flatList, tasks, setTasks])
  const handleInlineProgressSave = useCallback(async (taskId: string, newProgress: number) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (blockedProgressTaskIds.has(taskId)) {
      toast({ title: '仍有未满足条件，先处理条件后再继续填报进度。', variant: 'destructive' })
      setInlineProgressTaskId(null)
      return
    }
    const prevProgress = task.progress ?? 0
    const taskConditionSummary = taskProgressSnapshot.taskConditionMap[taskId]
    const pendingConditionCount = Math.max(0, Number(taskConditionSummary?.total ?? 0) - Number(taskConditionSummary?.satisfied ?? 0))
    const shouldWarnConditionAdvance = prevProgress === 0 && newProgress > 0 && pendingConditionCount > 0
    const autoStatus = (newProgress >= 100
      ? 'completed'
      : newProgress > 0 && task.status === 'todo'
      ? 'in_progress'
      : newProgress === 0 && task.status === 'completed'
      ? 'todo'
      : task.status) as 'todo' | 'in_progress' | 'completed'
    const now = new Date().toISOString()
    const firstProgressAt = (prevProgress === 0 && newProgress > 0 && !task.first_progress_at)
      ? now
      : task.first_progress_at
    const updated = {
      ...task,
      progress: newProgress,
      status: autoStatus,
      first_progress_at: firstProgressAt,
      updated_at: now,
    } as unknown as Task
    try {
      const res = await fetch(
        `${API_BASE}/api/tasks/${taskId}`,
        withRequestContext({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            progress: newProgress,
            status: autoStatus,
            first_progress_at: firstProgressAt,
            updated_at: now,
            version: task.version ?? 1,
          }),
        }),
      )
      const json = await res.json()
      if (!json.success) {
        if (res.status === 400 && json.error?.fields) {
          const fieldMessages = Object.entries(json.error.fields as Record<string, string>)
            .map(([field, msg]) => `${field}: ${msg}`)
            .join('；')
          throw new Error(fieldMessages || json.error?.message || '输入有误')
        }
        throw new Error(json.error?.message || '更新失败')
      }

      // #22: 后端可能自动写入actual_start_date/actual_end_date，需反映到前端
      const updatedTask = json.data as Task | undefined
      if (updatedTask) {
        updateTask(taskId, toStoreTaskPatch({
          progress: newProgress,
          status: autoStatus,
          first_progress_at: firstProgressAt,
          updated_at: now,
          actual_start_date: updatedTask.actual_start_date,
          actual_end_date: updatedTask.actual_end_date,
          version: updatedTask.version,
        }))
      }

      // 首次进度推进后刷新条件真值，保持页面提示与后端一致
      if (prevProgress === 0 && newProgress > 0) {
        try {
          const condRes = await fetch(`${API_BASE}/api/task-conditions?projectId=${encodeURIComponent(currentProject?.id || '')}`, withRequestContext())
          const condJson = await condRes.json()
          if (condJson.success && Array.isArray(condJson.data)) {
            setProjectConditions(condJson.data)
          }
        } catch (err) {
          console.warn('Failed to reload conditions after progress update:', err)
        }
      }

      if (shouldWarnConditionAdvance) {
        openConditionWarning(task, pendingConditionCount)
      }

      setInlineProgressTaskId(null)

    } catch (err: any) {
      const msg = err?.message || '閺堫亞鐓￠柨娆掝嚖'
      if (msg.includes('VERSION_MISMATCH')) {
        // 鐗堟湰鍐茬獊閿涙俺鍤滈崝銊ф暏閺堚偓閺傜増鏆熼幑顕€鍣哥拠鏇氱濞?
        try {
          const refetch = await fetch(`${API_BASE}/api/tasks/${taskId}`, withRequestContext())
          const refetchJson = await refetch.json()
          if (refetchJson.success && refetchJson.data) {
            const latestVersion = refetchJson.data.version ?? 1
            const retryRes = await fetch(
              `${API_BASE}/api/tasks/${taskId}`,
              withRequestContext({
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  progress: newProgress,
                  status: autoStatus,
                  first_progress_at: firstProgressAt,
                  updated_at: now,
                  version: latestVersion,
                }),
              }),
            )
            const retryJson = await retryRes.json()
            if (retryJson.success) {
              updateTask(updated.id!, {
                progress: newProgress,
                status: autoStatus,
                first_progress_at: firstProgressAt,
                updated_at: now,
                version: latestVersion + 1,
              })
              setInlineProgressTaskId(null)
              toast({ title: '进度已更新' })
              return
            }
          }
        } catch { }
        toast({ title: '数据已变更，请刷新页面后重试', variant: 'destructive' })
      } else {
        toast({ title: '更新进度失败', description: msg, variant: 'destructive' })
      }
    }
  }, [blockedProgressTaskIds, currentProject?.id, openConditionWarning, taskProgressSnapshot.taskConditionMap, tasks, toast, updateTask])


  const handleInlineTitleSave = useCallback(async (taskId: string) => {
    const trimmed = inlineTitleValue.trim()
    if (!trimmed) { setInlineTitleTaskId(null); return }
    const task = tasks.find(t => t.id === taskId)
    if (!task || trimmed === (task.title || task.name)) { setInlineTitleTaskId(null); return }
    try {
      const res = await fetch(
        `${API_BASE}/api/tasks/${taskId}`,
        withRequestContext({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed, updated_at: new Date().toISOString(), version: task.version ?? 1 }),
        }),
      )
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || '更新失败')
      updateTask(taskId, toStoreTaskPatch({ title: trimmed, updated_at: new Date().toISOString() }))
      toast({ title: '任务名称已更新' })
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
    setInlineTitleTaskId(null)
  }, [inlineTitleValue, tasks, updateTask])
  const toggleCollapse = (nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      safeStorageSet(localStorage, `gantt_collapsed_${id}`, JSON.stringify([...next]))
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(flatList.map(n => n.id)))
    }
  }

  const toggleSelect = (nodeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const syncBatchCompletionWrites = async (
    entries: Array<{ id: string; task: Task }>,
    optimisticUpdatedAt: string,
  ) => {
    const concurrency = 12
    const optimisticActualDate = toDateValue(optimisticUpdatedAt)
    const failures: Array<{ task: Task; message: string }> = []

    for (let index = 0; index < entries.length; index += concurrency) {
      const batch = entries.slice(index, index + concurrency)
      const results = await Promise.allSettled(batch.map(async ({ task }) => {
        const response = await fetch(
          `${API_BASE}/api/tasks/${task.id}`,
          withRequestContext({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'completed',
              progress: 100,
              updated_at: optimisticUpdatedAt,
              version: task.version ?? 1,
            }),
          }),
        )
        const json = await response.json().catch(() => null)
        if (!response.ok || json?.success === false) {
          throw new Error(extractApiErrorMessage(json, '批量完成失败'))
        }

        const serverTask = (json?.data ?? json) as Partial<Task> | null
        updateTask(task.id, {
          status: 'completed',
          progress: 100,
          updated_at: serverTask?.updated_at ?? optimisticUpdatedAt,
          actual_start_date: serverTask?.actual_start_date ?? task.actual_start_date ?? optimisticActualDate,
          actual_end_date: serverTask?.actual_end_date ?? optimisticActualDate,
          first_progress_at: serverTask?.first_progress_at ?? task.first_progress_at ?? optimisticUpdatedAt,
          version: typeof serverTask?.version === 'number' ? serverTask.version : Number(task.version ?? 1) + 1,
        })
      }))

      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') return
        failures.push({
          task: batch[batchIndex].task,
          message: getApiErrorMessage(result.reason, '批量完成失败'),
        })
      })
    }

    if (failures.length === 0) {
      return
    }

    failures.forEach(({ task }) => {
      updateTask(task.id, task)
    })

    const versionConflictCount = failures.filter(({ message }) => message.includes('VERSION_MISMATCH')).length
    toast({
      title: '部分任务同步失败',
      description: versionConflictCount > 0
        ? `已回退 ${failures.length} 个任务，其中 ${versionConflictCount} 个存在版本冲突。`
        : `已回退 ${failures.length} 个任务，请稍后重试。`,
      variant: 'destructive',
    })
  }

  const handleBatchComplete = async () => {
    if (selectedIds.size === 0) return
    const selectedTaskEntries = [...selectedIds]
      .map((taskId) => ({ id: taskId, task: tasks.find((item) => item.id === taskId) }))
      .filter((entry): entry is { id: string; task: Task } => Boolean(entry.task))
    const alreadyDone = selectedTaskEntries.filter(({ task }) => task.status === 'completed').length
    const tasksToPersist = selectedTaskEntries.filter(({ task }) => task.status !== 'completed')
    const optimisticUpdatedAt = new Date().toISOString()
    const optimisticActualDate = toDateValue(optimisticUpdatedAt)

    tasksToPersist.forEach(({ task }) => {
      updateTask(task.id, {
        status: 'completed',
        progress: 100,
        updated_at: optimisticUpdatedAt,
        actual_start_date: task.actual_start_date ?? optimisticActualDate,
        actual_end_date: optimisticActualDate,
        first_progress_at: task.first_progress_at ?? optimisticUpdatedAt,
        version: Number(task.version ?? 1) + 1,
      })
    })

    setSelectedIds(new Set())
    toast({
      title: '已完成 ' + tasksToPersist.length + ' 个任务',
      description: alreadyDone > 0
        ? `其中 ${alreadyDone} 个任务原本已是完成状态，后台同步中。`
        : '后台同步中。',
    })

    if (tasksToPersist.length > 0) {
      void syncBatchCompletionWrites(tasksToPersist, optimisticUpdatedAt)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    openConfirm('批量删除任务', '确定要删除选中的 ' + selectedIds.size + ' 个任务吗？此操作不可撤销。', async () => {
      try {
        let deletedCount = 0
        for (const tid of selectedIds) {
          const task = tasks.find((item) => item.id === tid)
          const response = await fetch(
            `${API_BASE}/api/tasks/${tid}`,
            withRequestContext({
              method: 'DELETE',
            }),
          )
          const json = await response.json()
          if (!json.success) {
            if (response.status === 422) {
              const nextGuard = buildDeleteProtectionState('task', tid, task?.title || task?.name || '未命名任务', json)
              if (nextGuard) {
                setDeleteGuardTarget(nextGuard)
              }
              if (deletedCount > 0) {
                toast({ title: `已先删除 ${deletedCount} 个任务`, description: '其余任务命中删除保护，已为你打开处理提示。' })
              }
              return
            }
            throw new Error(extractApiErrorMessage(json, '批量删除失败'))
          }
          deleteTask(tid)
          deletedCount += 1
        }
        toast({ title: '已删除 ' + deletedCount + ' 个任务' })
        setSelectedIds(new Set())
      } catch (error) {
        toast({
          title: '批量删除失败',
          description: getApiErrorMessage(error, '请稍后重试。'),
          variant: 'destructive',
        })
      }
    })
  }


  const isOnCriticalPath = (taskId: string): boolean => {
    return criticalPathDisplayTaskIds.has(taskId)
  }

  const getCriticalPathTask = (taskId: string) => criticalPathTaskMap.get(taskId) ?? null

  const getTaskFloat = (taskId: string): number => {
    return criticalPathTaskMap.get(taskId)?.floatDays ?? 0
  }
  const selectedCriticalPathTask = selectedTask?.id ? getCriticalPathTask(selectedTask.id) : null
  const planningGovernance = projectSummary?.planningGovernance
  const shouldRenderGanttDialogs =
    dialogOpen
    || conflictOpen
    || milestoneDialogOpen
    || conditionDialogOpen
    || obstacleDialogOpen
    || forceSatisfyDialogOpen
    || confirmDialog.open

  if (loading) {
    return (
      <div className="p-6" data-testid="gantt-loading-skeleton">
        <GanttViewSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      <GanttViewHeader
        projectId={id || ''}
        projectName={currentProject?.name}
        planningGovernance={planningGovernance}
        viewMode={viewMode}
        onBack={() => navigate(`/projects/${id}/dashboard`)}
        onViewModeChange={setViewMode}
        onOpenCriticalPath={() => handleOpenCriticalPathDialog(selectedTask?.id)}
        onOpenParticipantUnits={openParticipantUnitsDialog}
        onCreateTask={() => openEditDialog()}
        onOpenCloseout={() => navigate(`/projects/${id}/planning/closeout`)}
        onScrollToToday={() => {
          if (viewMode === 'timeline') {
            timelineViewRef.current?.scrollToToday()
          } else {
            const firstTodayEl = document.querySelector<HTMLElement>('[data-today-active="true"]')
            if (firstTodayEl) {
              firstTodayEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
            } else {
              document.querySelector('[data-testid="gantt-task-rows"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }
        }}
      />

      <div data-testid="task-workspace-layer-l2">
        <GanttStatsCards projectStats={projectStats} />
      </div>

      {/* 閹靛綊鍣洪幙宥勭稊閺?*/}
      {viewMode === 'list' ? (
        <GanttBatchBar
          allSelected={allSelected}
          someSelected={someSelected}
          selectedCount={selectedIds.size}
          onToggleSelectAll={toggleSelectAll}
          onBatchComplete={handleBatchComplete}
          onBatchDelete={handleBatchDelete}
        />
      ) : null}

      {dataQualitySummary?.prompt && dataQualitySummary.prompt.count > 0 ? (
        <details
          data-testid="gantt-data-quality-prompt-bar"
          className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-950"
        >
          <summary className="cursor-pointer list-none space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                任务列表非常态提示
              </span>
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-800">
                {dataQualitySummary.prompt.count} 条数据矛盾待确认
              </span>
            </div>
            <p className="leading-6">{dataQualitySummary.prompt.summary}</p>
          </summary>
          <div className="mt-4 space-y-3">
            {dataQualitySummary.prompt.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">{item.taskTitle}</div>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {item.severity === 'critical' ? '严重' : item.severity === 'warning' ? '警告' : '关注'}
                  </span>
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-700">{item.summary}</div>
                <div className="mt-2 text-xs leading-5 text-slate-500">建议：{item.recommendation}</div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div data-testid="task-workspace-body" className={`grid gap-4 transition-all duration-300 ${selectedTask ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-1'}`}>
        {/* 瀹革缚鏅堕敍姝怋S娴犺濮熼崚妤勩€?*/}
        <div data-testid="task-workspace-layer-l4" className="min-w-0 transition-all duration-300">
      <Card variant="detail">
        <CardHeader data-testid="task-workspace-layer-l3" className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{zhCN.gantt.structureTitle}</CardTitle>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${viewMode === 'timeline' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {viewMode === 'timeline' ? '横道图视图' : '列表视图'}
            </span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {filteredFlatList.length}/{flatList.length} {zhCN.gantt.structureCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {projectStats.criticalPathSummary && (
              <p className="text-xs text-muted-foreground">
                {zhCN.gantt.criticalPath}: {projectStats.criticalPathSummary}
              </p>
            )}
            <button
              onClick={() => setShowFilterBar(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${showFilterBar || activeFilterCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600 h-7"
              onClick={() => navigate(`/projects/${id}/planning/wbs-templates`)}
            >
              <LayoutTemplate className="mr-1 h-3.5 w-3.5" />
              从模板生成
            </Button>
          </div>
        </CardHeader>

        {showFilterBar && (
          <GanttFilterBar
            searchText={searchText}
            filterStatus={filterStatus}
            filterPriority={filterPriority}
            filterCritical={filterCritical}
            filterSpecialty={filterSpecialty}
            filterBuilding={filterBuilding}
            buildingOptions={buildingOptions}
            projectId={id}
            onSearchChange={setSearchText}
            onStatusChange={setFilterStatus}
            onPriorityChange={setFilterPriority}
            onCriticalToggle={() => {
              setFilterCritical((value) => {
                safeStorageSet(localStorage, `gantt_filter_critical_${id}`, String(!value))
                return !value
              })
            }}
            onSpecialtyChange={setFilterSpecialty}
            onBuildingChange={setFilterBuilding}
            onClearAll={clearAllFilters}
            onClose={() => setShowFilterBar(false)}
          />
        )}
        {criticalPathSnapshot?.hasCycleDetected && (
          <div
            data-testid="gantt-cycle-detection-banner"
            className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <div className="font-semibold">检测到任务依赖环路</div>
              <div className="mt-0.5 text-xs text-amber-700">
                关键路径计算已暂停。请检查以下任务的依赖关系并消除环路后重新计算：
                {(criticalPathSnapshot.cycleTaskIds ?? []).length > 0 && (
                  <span className="ml-1 font-medium">
                    {(criticalPathSnapshot.cycleTaskIds ?? [])
                      .map((tid) => {
                        const t = (tasks as Array<{ id: string; title?: string; name?: string }>).find((task) => task.id === tid)
                        return t ? (t.title || t.name || tid) : tid
                      })
                      .join(' → ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {viewMode === 'timeline' ? (
          <div className="p-4 pt-0">
            <TaskTimelineView
              ref={timelineViewRef}
              rows={filteredFlatList}
              collapsed={collapsed}
              selectedTaskId={selectedTask?.id}
              highlightTaskId={highlightTaskId}
              scale={timelineScale}
              compareMode={timelineCompareMode}
              baselineOptions={baselineOptions}
              baselineVersionId={timelineBaselineVersionId}
              baselineLoading={baselineLoading}
              onScaleChange={setTimelineScale}
              onCompareModeChange={setTimelineCompareMode}
              onBaselineVersionIdChange={setTimelineBaselineVersionId}
              onToggleCollapse={toggleCollapse}
              onSelectTask={(task) => setSelectedTask((previous) => (previous?.id === task.id ? null : task))}
              isOnCriticalPath={isOnCriticalPath}
            />
          </div>
        ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredFlatList.map((node) => node.id)} strategy={verticalListSortingStrategy}>
              <GanttTaskRows
                tasks={tasks as Task[]}
                flatList={flatList}
                filteredFlatList={filteredFlatList}
                collapsed={collapsed}
                selectedIds={selectedIds}
                expandedConditionTaskId={expandedConditionTaskId}
                inlineConditionsMap={inlineConditionsMap}
                taskProgressSnapshot={taskProgressSnapshot}
                rolledProgressMap={rolledProgressMap}
                inlineProgressTaskId={inlineProgressTaskId}
                inlineProgressValue={inlineProgressValue}
                inlineTitleTaskId={inlineTitleTaskId}
                inlineTitleValue={inlineTitleValue}
                onClearFilters={clearAllFilters}
                onToggleCollapse={toggleCollapse}
                onToggleSelect={toggleSelect}
                onSelectTask={(task) => setSelectedTask((previous) => (previous?.id === task.id ? null : task))}
                onOpenMilestoneDialog={(task) => {
                  setMilestoneTargetTask(task)
                  setMilestoneDialogOpen(true)
                }}
                onOpenEditDialog={openEditDialog}
                onOpenConditionDialog={openConditionDialog}
                onOpenObstacleDialog={openObstacleDialog}
                onDeleteTask={handleDeleteTask}
                onStatusChange={handleStatusChange}
                onToggleInlineConditions={toggleInlineConditions}
                onToggleCondition={handleToggleCondition}
                dependencyChainIds={dependencyChainIds}
                onHoverTaskId={setHoveredTaskId}
                onStartInlineTitleEdit={(task) => {
                  setInlineTitleTaskId(task.id)
                  setInlineTitleValue(task.title || task.name || '')
                }}
                onInlineTitleValueChange={setInlineTitleValue}
                onInlineTitleSave={handleInlineTitleSave}
                onCancelInlineTitleEdit={() => setInlineTitleTaskId(null)}
                onStartInlineProgressEdit={(task) => {
                  if (blockedProgressTaskIds.has(task.id)) {
                    toast({ title: '仍有未满足条件，先处理条件后再继续填报进度。', variant: 'destructive' })
                    return
                  }
                  setInlineProgressTaskId(task.id)
                  setInlineProgressValue(task.progress || 0)
                }}
                onInlineProgressValueChange={setInlineProgressValue}
                onInlineProgressSave={handleInlineProgressSave}
                onCancelInlineProgressEdit={() => setInlineProgressTaskId(null)}
                onViewTaskSummary={handleViewTaskSummary}
                onDeleteTaskFromContextMenu={(task) => handleDeleteTask(task.id)}
                onMarkCriticalPathAttention={(taskId) => void handleCreateCriticalPathOverride({ taskId, mode: 'manual_attention' })}
                onInsertBeforeChain={(taskId) => void handleCreateCriticalPathOverride({ taskId, mode: 'manual_insert' })}
                onInsertAfterChain={(taskId) => void handleCreateCriticalPathOverride({ taskId, mode: 'manual_insert' })}
                onRemoveCriticalPathOverride={handleDeleteCriticalPathOverride}
                getBusinessStatus={getBusinessStatus}
                getCriticalPathTask={(taskId) => criticalPathTaskMap.get(taskId) ?? null}
                isOnCriticalPath={isOnCriticalPath}
                getTaskFloat={getTaskFloat}
              />
            </SortableContext>
          </DndContext>
        )}
      </Card>
        </div>{/* 瀹革缚鏅堕崚妤勩€冪紒鎾存将 */}

        {selectedTask && (
          <aside data-testid="task-workspace-layer-l5" className="space-y-4">
            {/* Guardrail UI remains in TaskDetailPanel:
                gantt-delay-request-submit / gantt-delay-request-withdraw / 已有待审批申请，提交按钮已禁用 */}
            <Suspense
              fallback={
                <Card variant="detail">
                  <CardContent className="p-4">
                    <LoadingState label="正在加载任务详情" className="min-h-[18rem]" />
                  </CardContent>
                </Card>
              }
            >
              <LazyTaskDetailPanel
                selectedTask={selectedTask}
                onClose={() => setSelectedTask(null)}
                getBusinessStatus={getBusinessStatus}
                onEdit={openEditDialog}
                onOpenCondition={openConditionDialog}
                onOpenObstacle={openObstacleDialog}
                criticalPathSummaryText={criticalPathSummaryText}
                criticalPathError={criticalPathError}
                selectedCriticalPathTask={selectedCriticalPathTask}
                onOpenCriticalPathDialog={() => handleOpenCriticalPathDialog(selectedTask.id)}
                delayRequests={selectedTaskDelayRequests}
                delayRequestsLoading={delayRequestsLoading}
                pendingDelayRequest={pendingDelayRequest}
                rejectedDelayRequest={rejectedDelayRequest}
                duplicateRejectedReason={duplicateRejectedReason}
                baselineOptions={baselineOptions}
                baselineLoading={baselineLoading}
                delayRequestForm={delayRequestForm}
                delayFormErrors={delayFormErrors}
                delayRequestSubmitting={delayRequestSubmitting}
                delayRequestWithdrawingId={delayRequestWithdrawingId}
                delayRequestReviewingId={delayRequestReviewingId}
                delayImpactDays={delayImpactDays}
                delayImpactSummary={delayImpactSummary}
                onDelayRequestFormChange={(field, value) => {
                  setDelayFormErrors((previous) => ({
                    ...previous,
                    [field]: undefined,
                    form: undefined,
                  }))
                  setDelayRequestForm((previous) => ({
                    ...previous,
                    [field]: value,
                  }))
                }}
                onSubmitDelayRequest={handleSubmitDelayRequest}
                onWithdrawDelayRequest={handleWithdrawDelayRequest}
                onApproveDelayRequest={() => pendingDelayRequest && void handleReviewDelayRequest(pendingDelayRequest.id, 'approve')}
                onRejectDelayRequest={() => pendingDelayRequest && void handleReviewDelayRequest(pendingDelayRequest.id, 'reject')}
                canReviewDelayRequest={canAdminForceSatisfyCondition}
                onOpenChangeLogs={() => navigate(`/projects/${id}/reports?view=change_log&taskId=${selectedTask.id}`)}
              />
            </Suspense>
          </aside>
        )}
      </div>{}

      {criticalPathDialogOpen && (
        <Suspense fallback={null}>
          <LazyCriticalPathDialog
            open={criticalPathDialogOpen}
            onOpenChange={(open) => {
              setCriticalPathDialogOpen(open)
              if (!open) setCriticalPathFocusTaskId(null)
            }}
            projectName={currentProject?.name}
            tasks={tasks as Task[]}
            snapshot={criticalPathSummary?.snapshot ?? null}
            overrides={criticalPathOverrides}
            focusTaskId={criticalPathFocusTaskId}
            loading={criticalPathDialogLoading}
            error={criticalPathError}
            actionLoading={criticalPathActionLoading}
            onRefresh={handleRefreshCriticalPath}
            onCreateOverride={handleCreateCriticalPathOverride}
            onDeleteOverride={handleDeleteCriticalPathOverride}
          />
        </Suspense>
      )}

      {shouldRenderGanttDialogs && (
        <Suspense fallback={null}>
          <LazyGanttViewDialogs
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
            editingTask={editingTask as Task | null}
            newTaskParentId={newTaskParentId}
            tasks={tasks as Task[]}
            formData={formData}
            setFormData={setFormData}
            taskFormErrors={taskFormErrors}
            setTaskFormErrors={setTaskFormErrors}
            projectMembers={projectMembers}
            participantUnits={participantUnits}
            onOpenParticipantUnits={openParticipantUnitsDialog}
            aiDurationLoading={aiDurationLoading}
            aiDurationSuggestion={aiDurationSuggestion}
            fetchAiDurationSuggestion={fetchAiDurationSuggestion}
            applyAiDuration={applyAiDuration}
            handleDependencyChange={handleDependencyChange}
            handleSaveTask={handleSaveTask}
            taskSaving={taskSaving}
            liveCheckSummary={liveCheckSummary}
            liveCheckLoading={liveCheckLoading}
            progressInputBlocked={progressInputBlocked}
            progressInputHint={progressInputHint}
            milestoneOptions={milestoneOptions as Task[]}
            isOnCriticalPath={isOnCriticalPath}
            conflictOpen={conflictOpen}
            setConflictOpen={setConflictOpen}
            conflictData={conflictData as { localVersion: Task; serverVersion: Task } | null}
            handleKeepLocal={handleKeepLocal}
            handleKeepServer={handleKeepServer}
            handleMerge={handleMerge}
            milestoneDialogOpen={milestoneDialogOpen}
            setMilestoneDialogOpen={setMilestoneDialogOpen}
            milestoneTargetTask={milestoneTargetTask as Task | null}
            handleSelectMilestoneLevel={handleSelectMilestoneLevel}
            conditionDialogOpen={conditionDialogOpen}
            setConditionDialogOpen={setConditionDialogOpen}
            conditionTask={conditionTask as Task | null}
            conditionsLoading={conditionsLoading}
            taskConditions={taskConditions}
            conditionPrecedingTasks={conditionPrecedingTasks}
            newConditionName={newConditionName}
            setNewConditionName={setNewConditionName}
            newConditionType={newConditionType}
            setNewConditionType={setNewConditionType}
            newConditionTargetDate={newConditionTargetDate}
            setNewConditionTargetDate={setNewConditionTargetDate}
            newConditionDescription={newConditionDescription}
            setNewConditionDescription={setNewConditionDescription}
            newConditionResponsibleUnit={newConditionResponsibleUnit}
            setNewConditionResponsibleUnit={setNewConditionResponsibleUnit}
            newConditionPrecedingTaskIds={newConditionPrecedingTaskIds}
            setNewConditionPrecedingTaskIds={setNewConditionPrecedingTaskIds}
            handleAddCondition={handleAddCondition}
            handleToggleCondition={handleToggleCondition}
            handleDeleteCondition={handleDeleteCondition}
            handleAdminForceSatisfyCondition={handleAdminForceSatisfyCondition}
            forceSatisfyDialogOpen={forceSatisfyDialogOpen}
            setForceSatisfyDialogOpen={setForceSatisfyDialogOpen}
            forceSatisfyCondition={forceSatisfyCondition}
            forceSatisfyReason={forceSatisfyReason}
            setForceSatisfyReason={setForceSatisfyReason}
            confirmAdminForceSatisfyCondition={confirmAdminForceSatisfyCondition}
            canAdminForceSatisfyCondition={canAdminForceSatisfyCondition}
            obstacleDialogOpen={obstacleDialogOpen}
            setObstacleDialogOpen={setObstacleDialogOpen}
            obstacleTask={obstacleTask as Task | null}
            obstaclesLoading={obstaclesLoading}
            taskObstacles={taskObstacles}
            newObstacleTitle={newObstacleTitle}
            setNewObstacleTitle={setNewObstacleTitle}
            newObstacleSeverity={newObstacleSeverity}
            setNewObstacleSeverity={setNewObstacleSeverity}
            newObstacleExpectedResolutionDate={newObstacleExpectedResolutionDate}
            setNewObstacleExpectedResolutionDate={setNewObstacleExpectedResolutionDate}
            newObstacleResolutionNotes={newObstacleResolutionNotes}
            setNewObstacleResolutionNotes={setNewObstacleResolutionNotes}
            editingObstacleId={editingObstacleId}
            setEditingObstacleId={setEditingObstacleId}
            editingObstacleTitle={editingObstacleTitle}
            setEditingObstacleTitle={setEditingObstacleTitle}
            editingObstacleSeverity={editingObstacleSeverity}
            setEditingObstacleSeverity={setEditingObstacleSeverity}
            editingObstacleExpectedResolutionDate={editingObstacleExpectedResolutionDate}
            setEditingObstacleExpectedResolutionDate={setEditingObstacleExpectedResolutionDate}
            editingObstacleResolutionNotes={editingObstacleResolutionNotes}
            setEditingObstacleResolutionNotes={setEditingObstacleResolutionNotes}
            handleAddObstacle={handleAddObstacle}
            handleResolveObstacle={handleResolveObstacle}
            handleDeleteObstacle={handleDeleteObstacle}
            handleSaveObstacleEdit={handleSaveObstacleEdit}
            onOpenRiskWorkspaceForObstacle={(obstacle) => navigate(`/projects/${id}/risks?stream=problems&source=obstacle_escalated&obstacleId=${encodeURIComponent(String(obstacle.id || ''))}`)}
            newTaskConditionPromptId={newTaskConditionPromptId}
            setNewTaskConditionPromptId={setNewTaskConditionPromptId}
            openConditionDialogByTaskId={(taskId) => {
              const task = tasks.find((item) => item.id === taskId)
              if (task) openConditionDialog(task as Task)
            }}
            confirmDialog={confirmDialog}
            setConfirmDialog={setConfirmDialog}
          />
        </Suspense>
      )}
      <ParticipantUnitsDialog
        open={participantUnitsOpen}
        onOpenChange={(open) => {
          setParticipantUnitsOpen(open)
          if (!open) {
            setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
          }
        }}
        loading={participantUnitsLoading}
        saving={participantUnitSaving}
        units={participantUnits}
        draft={participantUnitDraft}
        setDraft={setParticipantUnitDraft}
        onSubmit={() => void handleParticipantUnitSubmit()}
        onEdit={handleParticipantUnitEdit}
        onDelete={(unit) => void handleParticipantUnitDelete(unit)}
        onCreateNew={handleParticipantUnitCreateNew}
      />
      <DeleteProtectionDialog
        open={Boolean(deleteGuardTarget)}
        onOpenChange={(open) => {
          if (!open) closeDeleteGuard()
        }}
        title={
          deleteGuardTarget
            ? deleteGuardTarget.blocked
              ? deleteGuardTarget.kind === 'task'
                ? '任务暂不可删除'
                : '阻碍记录暂不可删除'
              : deleteGuardTarget.kind === 'task'
                ? '删除任务'
                : '删除阻碍记录'
            : '删除记录'
        }
        description={
          deleteGuardTarget
            ? deleteGuardTarget.blocked
              ? deleteGuardTarget.message || '当前记录仍被链路引用，暂时无法删除。'
              : deleteGuardTarget.kind === 'task'
                ? `确认删除“${deleteGuardTarget.title}”吗？删除后会移除任务行及其入口。`
                : `确认删除“${deleteGuardTarget.title}”吗？删除后会移除该条阻碍记录。`
            : '确认删除当前记录。'
        }
        warning={
          deleteGuardTarget
            ? deleteGuardTarget.blocked
              ? deleteGuardTarget.warning || '如果还需要保留执行留痕，请直接使用“关闭此记录”；若确实要删除，请先解除引用链路后再试。'
              : deleteGuardTarget.kind === 'task'
                ? '若当前任务仍在执行链路中，建议优先使用“关闭此记录”转为完成态，避免丢失留痕。'
                : '若当前阻碍仍在跟踪链路中，建议优先使用“关闭此记录”转为已解决。'
            : undefined
        }
        confirmLabel={deleteGuardTarget?.blocked ? '知道了' : deleteGuardSubmitting ? '删除中...' : '确认删除'}
        secondaryActionLabel={
          deleteGuardTarget
            ? deleteGuardTarget.details?.close_action?.label || '关闭此记录'
            : undefined
        }
        secondaryActionLoading={deleteGuardSecondarySubmitting}
        loading={deleteGuardSubmitting}
        onSecondaryAction={() => {
          if (!deleteGuardTarget) return
          if (deleteGuardTarget.kind === 'task') {
            void handleCloseTaskRecord(deleteGuardTarget.id)
            return
          }
          void handleCloseObstacleRecord(deleteGuardTarget.id)
        }}
        onConfirm={() => void handleConfirmDeleteGuard()}
        testId="gantt-delete-protection-dialog"
      />
      <ConditionWarningModal
        open={Boolean(conditionWarningTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setConditionWarningTarget(null)
          }
        }}
        projectId={id}
        taskTitle={conditionWarningTarget?.taskTitle}
        pendingConditionCount={conditionWarningTarget?.pendingConditionCount}
      />
      <BatchActionBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: '批量完成',
            icon: CheckCircle2,
            onClick: handleBatchComplete,
            disabled: selectedIds.size === 0,
            testId: 'gantt-batch-complete',
          },
          {
            label: '批量删除',
            icon: Trash2,
            variant: 'destructive',
            onClick: handleBatchDelete,
            disabled: selectedIds.size === 0,
            testId: 'gantt-batch-delete',
          },
        ]}
      />
    </div>
  )
}



