import type { BlockageRecord, ConditionRecord } from '@/components/planning/DrawerSections'
import type { PlanningViewMode } from '@/components/planning/PlanningTreeView'
import {
  getEngineeringObjectFeatureProfileChips,
  type EngineeringObjectFeatureProfile,
} from '@/components/planning/engineeringObjectFeatureMetadata'
import { getAuthHeaders } from '@/lib/apiClient'
import { safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'
import { getStatusTheme } from '@/lib/statusTheme'
import {
  formatDurationMetric,
  readAvailableDurationValue,
  type DurationMetricDto,
} from '@/lib/durationMetric'
import {
  getTaskBusinessStatus,
  getTaskLagLevel,
  isCompletedTask,
} from '@/lib/taskBusinessStatus'
import { formatCriticalPathCount } from '@/lib/userFacingTerms'
import type {
  Task as StoreTaskRecord,
  TaskCondition as StoreTaskConditionRecord,
  TaskObstacle as StoreTaskObstacleRecord,
} from '@/lib/supabase'
import type { GanttTimelineCompareMode, GanttTimelineScale } from './TaskTimelineView'
import type { Task, TaskCondition, TaskObstacle, WBSNode } from '../GanttViewTypes'

export type GanttViewMode = PlanningViewMode

type GanttBusinessStatusSnapshot = {
  taskConditionMap: Record<string, { total: number; satisfied: number } | undefined>
  obstacleCountMap: Record<string, number | undefined>
}

export type GanttBusinessStatusDisplay = {
  label: string
  cls: string
  badge?: { text: string; cls: string }
}

type TaskDueStatusLike = {
  status?: string | null
  label?: string | null
  duration?: DurationMetricDto | null
} | null

type CriticalPathSummaryLike = {
  primaryTaskCount: number
  projectDurationDays: number
  alternateChainCount: number
  manualAttentionCount: number
  manualInsertedCount: number
}

type TaskProgressSnapshotStats = {
  totalTasks: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  laggedTaskCount: number
  pendingConditionTaskCount: number
  activeObstacleCount: number
  readyToStartTaskCount: number
}

type GanttBaselineOptionLike = {
  id: string
}

type BlockedProgressTaskLike = {
  id?: string | null
  progress?: number | string | null
}

type GanttViewPreferenceInput = {
  viewMode: GanttViewMode
  timelineScale: GanttTimelineScale
  timelineCompareMode: GanttTimelineCompareMode
  timelineBaselineVersionId?: string | null
}

export function normalizeGanttViewMode(value: string | null): GanttViewMode | null {
  if (value === 'timeline') return 'gantt'
  return value === 'gantt' || value === 'detail' || value === 'card' || value === 'list' ? value : null
}

export function normalizeTimelineScale(value: string | null): GanttTimelineScale | null {
  return value === 'day' || value === 'week' || value === 'month' ? value : null
}

export function normalizeTimelineCompareMode(value: string | null): GanttTimelineCompareMode | null {
  return value === 'plan' || value === 'baseline' ? value : null
}

export function isTaskLinkedToMilestone(task: Task, milestoneId: string) {
  if (!milestoneId) return true
  return (
    task.id === milestoneId
    || task.milestone_id === milestoneId
    || task.parent_id === milestoneId
    || (Array.isArray(task.dependencies) && task.dependencies.includes(milestoneId))
  )
}

export function normalizeGanttFilterStatus(value: string | null): string {
  const normalized = String(value ?? '').trim()
  if (normalized === 'blocked' || normalized === '受阻') return 'lagging_moderate'
  if (
    normalized === 'all'
    || normalized === 'todo'
    || normalized === 'in_progress'
    || normalized === 'completed'
    || normalized === 'lagging_mild'
    || normalized === 'lagging_moderate'
    || normalized === 'lagging_severe'
  ) {
    return normalized
  }
  return 'all'
}

export function normalizeTaskEditableStatus(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'blocked'
    || normalized === '受阻'
    || normalized === 'lagging_mild'
    || normalized === 'lagging_moderate'
    || normalized === 'lagging_severe'
  ) return 'in_progress'
  return normalized || 'todo'
}

export function getGanttBusinessStatusDisplay(
  task: Task,
  taskProgressSnapshot: GanttBusinessStatusSnapshot,
): GanttBusinessStatusDisplay {
  const condInfo = taskProgressSnapshot.taskConditionMap[task.id]
  const obstacleCount = taskProgressSnapshot.obstacleCountMap[task.id] || 0
  const backendBusinessStatus = (task as {
    businessStatus?: { label?: string | null; status?: string | null } | null
    statusDerivation?: { businessStatus?: { label?: string | null; status?: string | null } | null } | null
  }).statusDerivation?.businessStatus
    || (task as { businessStatus?: { label?: string | null; status?: string | null } | null }).businessStatus
  const backendLabel = (task as { displayStatus?: string | null }).displayStatus
    || backendBusinessStatus?.label
  const businessStatus = backendLabel
    ? {
        code: backendBusinessStatus?.status || task.status,
        label: backendLabel,
      }
    : getTaskBusinessStatus(task, { conditionSummary: condInfo, activeObstacleCount: obstacleCount })
  const backendDueStatus: TaskDueStatusLike = (task as {
    dueStatus?: TaskDueStatusLike
    statusDerivation?: { dueStatus?: TaskDueStatusLike } | null
  }).statusDerivation?.dueStatus
    || (task as { dueStatus?: TaskDueStatusLike }).dueStatus
    || null
  const backendDueCode = String(backendDueStatus?.status ?? '').trim()
  const backendOverdueValue = backendDueCode === 'overdue'
    ? readAvailableDurationValue(backendDueStatus?.duration, 'construction_production_day')
    : null
  const overdueBadge = backendDueCode === 'overdue'
    ? {
        text: backendOverdueValue !== null
          ? `逾期 ${formatDurationMetric(backendDueStatus?.duration, { absolute: true })}`
          : '逾期 · 生产日口径不可用',
        cls: getStatusTheme('overdue').className,
      }
    : undefined

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
        badge: overdueBadge,
      }
    case 'pending_conditions':
      return {
        label: businessStatus.label,
        cls: getStatusTheme('pending_conditions').className,
        badge: condInfo
          ? {
              text: String(condInfo.total - condInfo.satisfied) + '/' + String(condInfo.total) + '项条件未满足',
              cls: getStatusTheme('pending_conditions').className,
            }
          : undefined,
      }
    case 'progress_warning':
      return {
        label: businessStatus.label,
        cls: getStatusTheme('progress_warning').className,
        badge: overdueBadge,
      }
    case 'partial_blocked':
      return {
        label: businessStatus.label,
        cls: getStatusTheme('partial_blocked').className,
        badge: overdueBadge,
      }
    case 'blocked_by_obstacle':
      return {
        label: businessStatus.label,
        cls: getStatusTheme('blocked_by_obstacle').className,
        badge: overdueBadge,
      }
    case 'ready':
      return { label: businessStatus.label, cls: getStatusTheme('ready').className }
    default:
      return {
        label: businessStatus.label,
        cls: getStatusTheme('open').className,
        badge: overdueBadge,
      }
  }
}

export function formatGanttCriticalPathSummary(summary?: CriticalPathSummaryLike | null): string {
  if (!summary) return ''

  const summaryParts = [
    formatCriticalPathCount(summary.primaryTaskCount),
    '工期 ' + summary.projectDurationDays + ' 天',
  ]

  if (summary.alternateChainCount > 0) {
    summaryParts.push('备选 ' + summary.alternateChainCount + ' 条')
  }
  if (summary.manualAttentionCount > 0) {
    summaryParts.push('关注 ' + summary.manualAttentionCount + ' 项')
  }
  if (summary.manualInsertedCount > 0) {
    summaryParts.push('插链 ' + summary.manualInsertedCount + ' 项')
  }

  return summaryParts.join(' 路 ')
}

export function buildGanttProjectStats(
  taskProgressSnapshot: TaskProgressSnapshotStats,
  criticalPathSummaryText: string,
) {
  return {
    totalTasks: taskProgressSnapshot.totalTasks,
    completedTasks: taskProgressSnapshot.completedTaskCount,
    inProgressTasks: taskProgressSnapshot.inProgressTaskCount,
    overdueTask: taskProgressSnapshot.delayedTaskCount,
    laggedTaskCount: taskProgressSnapshot.laggedTaskCount,
    pendingStartTasks: taskProgressSnapshot.pendingConditionTaskCount,
    activeObstacleCount: taskProgressSnapshot.activeObstacleCount,
    readyToStartTasks: taskProgressSnapshot.readyToStartTaskCount,
    criticalPathSummary: criticalPathSummaryText,
  }
}

export function buildBlockedProgressTaskIds(
  tasks: BlockedProgressTaskLike[],
  taskConditionMap: GanttBusinessStatusSnapshot['taskConditionMap'],
): Set<string> {
  return new Set(
    tasks
      .filter((task) => {
        if (!task.id) return false
        const summary = taskConditionMap[task.id]
        const hasPendingConditions = Boolean(summary && summary.total > summary.satisfied)
        return hasPendingConditions && Number(task.progress ?? 0) > 0
      })
      .map((task) => task.id)
      .filter((taskId): taskId is string => Boolean(taskId)),
  )
}

export function buildGanttTaskMap(tasks: Array<Task | StoreTaskRecord>): Map<string, Task> {
  const map = new Map<string, Task>()
  for (const task of tasks) {
    if (task.id) map.set(task.id, task as Task)
  }
  return map
}

export function findGanttTaskById(
  taskId: string | null | undefined,
  primaryTasks: Task[],
  fallbackTasks: Array<Task | StoreTaskRecord> = [],
): Task | null {
  if (!taskId) return null
  return (
    primaryTasks.find((task) => task.id === taskId)
    ?? fallbackTasks.find((task) => task.id === taskId)
    ?? null
  ) as Task | null
}

export function getTaskConditionsForTask(
  taskId: string | null | undefined,
  conditions: TaskCondition[],
): TaskCondition[] {
  if (!taskId) return []
  return conditions.filter((condition) => condition.task_id === taskId)
}

export function getTaskObstaclesForTask(
  taskId: string | null | undefined,
  obstacles: TaskObstacle[],
): TaskObstacle[] {
  if (!taskId) return []
  return obstacles.filter((obstacle) => obstacle.task_id === taskId)
}

export function getRelatedRiskIssueCount(summary?: RelatedRiskIssueSummary | null): number {
  return (summary?.riskCount ?? 0) + (summary?.issueCount ?? 0)
}

export function getNextTimelineBaselineVersionId({
  baselineOptions,
  timelineCompareMode,
  timelineBaselineVersionId,
}: {
  baselineOptions: GanttBaselineOptionLike[]
  timelineCompareMode: GanttTimelineCompareMode
  timelineBaselineVersionId: string
}): string | null {
  if (baselineOptions.length === 0) {
    return timelineCompareMode === 'baseline' && timelineBaselineVersionId ? '' : null
  }

  return baselineOptions.some((option) => option.id === timelineBaselineVersionId)
    ? null
    : baselineOptions[0]?.id || ''
}

export function persistGanttViewPreferences(
  storage: Storage,
  projectId: string,
  preferences: GanttViewPreferenceInput,
) {
  safeStorageSet(storage, `gantt_view_mode_${projectId}`, preferences.viewMode)
  safeStorageSet(storage, `gantt_timeline_scale_${projectId}`, preferences.timelineScale)
  safeStorageSet(storage, `gantt_timeline_compare_${projectId}`, preferences.timelineCompareMode)

  safeStorageRemove(storage, `gantt_timeline_baseline_${projectId}`)
}

export function buildGanttViewSearchParams(
  currentSearch: string,
  preferences: GanttViewPreferenceInput,
): string {
  const nextParams = new URLSearchParams(currentSearch)
  const setOrDelete = (key: string, value: string | null) => {
    if (value) nextParams.set(key, value)
    else nextParams.delete(key)
  }

  setOrDelete('view', preferences.viewMode === 'list' ? null : preferences.viewMode)

  if (preferences.viewMode === 'gantt') {
    setOrDelete('scale', preferences.timelineScale === 'week' ? null : preferences.timelineScale)
    setOrDelete('compare', preferences.timelineCompareMode === 'plan' ? null : preferences.timelineCompareMode)
    setOrDelete(
      'baselineVersionId',
      preferences.timelineCompareMode === 'baseline' && preferences.timelineBaselineVersionId
        ? preferences.timelineBaselineVersionId
        : null,
    )
  } else {
    nextParams.delete('scale')
    nextParams.delete('compare')
    nextParams.delete('baselineVersionId')
  }

  return nextParams.toString()
}

export function toStoreTaskRecord(task: Task): StoreTaskRecord {
  return task as StoreTaskRecord
}

export function toStoreTaskPatch(patch: Partial<Task>): Partial<StoreTaskRecord> {
  return patch as Partial<StoreTaskRecord>
}

export function toStoreConditionRecords(conditions: TaskCondition[]): StoreTaskConditionRecord[] {
  return conditions as StoreTaskConditionRecord[]
}

export function toStoreObstacleRecords(obstacles: TaskObstacle[]): StoreTaskObstacleRecord[] {
  return obstacles as StoreTaskObstacleRecord[]
}

export const withCredentials = (options: RequestInit = {}): RequestInit => ({
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

export const withRequestContext = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
  headers: mergeRequestHeaders(options.headers),
})

export function getTaskDisplayTitle(task?: Task | null) {
  return task?.title || '未命名任务'
}

export function getTaskAcceptanceImpactItems(task?: Task | null) {
  if (!task || !Array.isArray(task.acceptance_impact_summary)) return []
  return task.acceptance_impact_summary
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      name: String(item.name ?? '').trim(),
      status: item.status == null ? undefined : String(item.status),
      statusLabel: item.statusLabel == null ? undefined : String(item.statusLabel),
    }))
    .filter((item) => item.id && item.name)
}

const HARD_CONDITION_TYPES = new Set(['preceding', 'design', 'drawing', 'certificate', 'certificate_ready'])

function normalizeDrawerSeverity(value?: string | null): BlockageRecord['severity'] {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['high', 'urgent', 'critical', 'serious', '高', '严重'].includes(normalized)) return 'high'
  if (['low', 'minor', '低'].includes(normalized)) return 'low'
  return 'medium'
}

export function toDrawerConditionRecord(condition: TaskCondition): ConditionRecord {
  const conditionType = String(condition.condition_type ?? '').trim().toLowerCase()
  return {
    id: condition.id,
    name: condition.name || condition.description || '未命名开工条件',
    type: HARD_CONDITION_TYPES.has(conditionType) ? 'hard' : 'soft',
    isSatisfied: Boolean(condition.is_satisfied),
    satisfiedAt: condition.satisfied_at ?? undefined,
    sourceDescription: condition.description || condition.target_date || undefined,
  }
}

export function toDrawerBlockageRecord(obstacle: TaskObstacle): BlockageRecord {
  const isResolved = Boolean(obstacle.is_resolved)
    || ['resolved', 'closed', '已解决', '已关闭'].includes(String(obstacle.status ?? '').trim().toLowerCase())
  return {
    id: obstacle.id,
    description: obstacle.title || obstacle.description || '未命名阻碍',
    severity: normalizeDrawerSeverity(obstacle.severity),
    status: isResolved ? 'resolved' : 'active',
    createdAt: obstacle.created_at || '',
    expectedResolutionDate: obstacle.expected_resolution_date ?? null,
    resolvedAt: isResolved ? obstacle.created_at : undefined,
  }
}

export function getRelatedSignalTaskId(row: { task_id?: string | null; taskId?: string | null }) {
  return String(row.task_id ?? row.taskId ?? '').trim() || null
}

export function isActiveRelatedRisk(row: { status?: string | null }) {
  const status = String(row.status ?? '').trim().toLowerCase()
  return status !== 'closed' && status !== 'resolved'
}

export function isActiveRelatedIssue(row: { status?: string | null }) {
  const status = String(row.status ?? '').trim().toLowerCase()
  return status !== 'closed'
}

export type RelatedRiskIssueSummary = {
  riskCount: number
  issueCount: number
}

type RelatedRiskIssueRow = {
  task_id?: string | null
  taskId?: string | null
  project_id?: string | null
  projectId?: string | null
  status?: string | null
}

export function buildRelatedRiskIssueSummaryByTaskId({
  risks,
  issues,
  projectTaskIds,
  projectId,
}: {
  risks: RelatedRiskIssueRow[]
  issues: RelatedRiskIssueRow[]
  projectTaskIds: Set<string>
  projectId?: string | null
}) {
  const next = new Map<string, RelatedRiskIssueSummary>()
  const ensure = (taskId: string) => {
    const current = next.get(taskId)
    if (current) return current
    const created = { riskCount: 0, issueCount: 0 }
    next.set(taskId, created)
    return created
  }

  risks.forEach((risk) => {
    const taskId = getRelatedSignalTaskId(risk)
    if (taskId && projectTaskIds.has(taskId) && isActiveRelatedRisk(risk)) {
      ensure(taskId).riskCount += 1
    }
  })

  issues.forEach((issue) => {
    const rowProjectId = String(issue.project_id ?? issue.projectId ?? '')
    if (rowProjectId && projectId && rowProjectId !== projectId) return
    const taskId = getRelatedSignalTaskId(issue)
    if (taskId && projectTaskIds.has(taskId) && isActiveRelatedIssue(issue)) {
      ensure(taskId).issueCount += 1
    }
  })

  return next
}

export function getTaskSpecialtyOptions(tasks: Task[]) {
  const seen = new Set<string>()
  for (const task of tasks) {
    const specialty = task.specialty_type
    if (specialty && specialty.trim()) seen.add(specialty.trim())
  }
  return Array.from(seen).sort()
}

export function getTaskBuildingOptions(wbsTree: WBSNode[]) {
  return wbsTree.map((node) => ({
    id: node.id,
    label: node.title || `鑺傜偣 ${node.wbs_code || node.id.slice(0, 6)}`,
  }))
}

export function getTaskBuildingNodeIds(wbsTree: WBSNode[], filterBuilding: string) {
  if (filterBuilding === 'all') return new Set<string>()
  const ids = new Set<string>()
  const collectIds = (node: WBSNode) => {
    ids.add(node.id)
    node.children.forEach(collectIds)
  }
  const root = wbsTree.find((node) => node.id === filterBuilding)
  if (root) collectIds(root)
  return ids
}

export function filterGanttTasks<TTask extends Task>({
  flatList,
  searchText,
  filterStatus,
  filterPriority,
  filterCritical,
  filterSpecialty,
  filterBuilding,
  milestoneFilterId,
  showRiskIssueOnly,
  relatedRiskIssueTaskIds,
  buildingNodeIds,
  criticalPathDisplayTaskIds,
}: {
  flatList: TTask[]
  searchText: string
  filterStatus: string
  filterPriority: string
  filterCritical: boolean
  filterSpecialty: string
  filterBuilding: string
  milestoneFilterId: string
  showRiskIssueOnly: boolean
  relatedRiskIssueTaskIds: Set<string>
  buildingNodeIds: Set<string>
  criticalPathDisplayTaskIds: Set<string>
}): TTask[] {
  if (!searchText && filterStatus === 'all' && filterPriority === 'all' && !filterCritical && filterSpecialty === 'all' && filterBuilding === 'all' && !milestoneFilterId && !showRiskIssueOnly) {
    return flatList
  }
  const lowerSearch = searchText.toLowerCase()
  return flatList.filter((task) => {
    if (milestoneFilterId && !isTaskLinkedToMilestone(task, milestoneFilterId)) return false
    if (showRiskIssueOnly && !relatedRiskIssueTaskIds.has(task.id)) return false
    if (filterBuilding !== 'all' && !buildingNodeIds.has(task.id)) return false
    if (lowerSearch) {
      const name = (task.title || '').toLowerCase()
      const assignee = (task.assignee || task.assignee_name || '').toLowerCase()
      if (!name.includes(lowerSearch) && !assignee.includes(lowerSearch)) return false
    }
    if (filterStatus !== 'all') {
      const lagLevel = getTaskLagLevel(task)
      if (filterStatus === 'lagging_mild' && lagLevel !== 'mild') return false
      if (filterStatus === 'lagging_moderate' && lagLevel !== 'moderate') return false
      if (filterStatus === 'lagging_severe' && lagLevel !== 'severe') return false
      if (!filterStatus.startsWith('lagging_') && task.status !== filterStatus) return false
    }
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false
    if (filterCritical && !criticalPathDisplayTaskIds.has(task.id)) return false
    if (filterSpecialty !== 'all' && task.specialty_type !== filterSpecialty) return false
    return true
  })
}

export function getTemplateGenerateScopeLabel(scopeSelection: {
  phaseLabel?: string | null
  sectionLabel?: string | null
  buildingLabel?: string | null
  floorLabel?: string | null
  zoneLabel?: string | null
}, featureProfile?: EngineeringObjectFeatureProfile) {
  const labels = [
    scopeSelection.phaseLabel && `分期: ${scopeSelection.phaseLabel}`,
    scopeSelection.sectionLabel && `标段: ${scopeSelection.sectionLabel}`,
    scopeSelection.buildingLabel && `楼栋: ${scopeSelection.buildingLabel}`,
    scopeSelection.floorLabel && `楼层: ${scopeSelection.floorLabel}`,
    scopeSelection.zoneLabel && `区域: ${scopeSelection.zoneLabel}`,
  ].filter(Boolean)
  labels.push(...getEngineeringObjectFeatureProfileChips(featureProfile ?? {}))
  return labels.join(' / ')
}

export function buildDataQualityRefreshKey(tasks: Task[], conditions: TaskCondition[]) {
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
  const conditionSignature = conditions
    .map((condition) => [
      condition.id,
      condition.task_id ?? '',
      condition.is_satisfied ? '1' : '0',
      condition.updated_at ?? '',
    ].join(':'))
    .join('|')
  return `${taskSignature}::${conditionSignature}`
}

export function getCriticalPathSourceType(
  criticalTask?: {
    isManualInserted?: boolean
    isManualAttention?: boolean
    isAutoCritical?: boolean
  } | null,
) {
  if (!criticalTask) return null
  if (criticalTask.isManualInserted) return 'manual_insert' as const
  if (criticalTask.isManualAttention) return 'manual_attention' as const
  if (criticalTask.isAutoCritical) return 'auto' as const
  return null
}

export function buildCriticalPathOverrideFlags(
  overrides: Array<{ task_id: string; mode: string }>,
) {
  const nextFlags = new Map<string, { hasManualAttentionOverride: boolean; hasManualInsertOverride: boolean }>()
  overrides.forEach((override) => {
    const current = nextFlags.get(override.task_id) ?? {
      hasManualAttentionOverride: false,
      hasManualInsertOverride: false,
    }
    if (override.mode === 'manual_attention') {
      current.hasManualAttentionOverride = true
    } else if (override.mode === 'manual_insert') {
      current.hasManualInsertOverride = true
    }
    nextFlags.set(override.task_id, current)
  })
  return nextFlags
}
