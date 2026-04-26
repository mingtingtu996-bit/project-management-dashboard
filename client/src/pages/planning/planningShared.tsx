import type { NavigateFunction } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import type { PlanningTreeRow } from '@/components/planning/PlanningTreeView'
import { ApiClientError, getApiErrorMessage } from '@/lib/apiClient'
import { safeJsonParse } from '@/lib/browserStorage'
import type {
  BaselineItem,
  BaselineVersion,
  MonthlyPlanItem,
  MonthlyPlanVersion,
  PlanningStatus,
  PlanningDraftLockRecord,
} from '@/types/planning'
import type { Task } from '@/pages/GanttViewTypes'

export const PLANNING_PAGE_TABS = [
  { key: 'baseline', label: '项目基线' },
  { key: 'monthly', label: '月度计划' },
] as const

export type PlanningPageTabKey = (typeof PLANNING_PAGE_TABS)[number]['key']

export type PlanningGovernanceStatus = 'loading' | 'ready' | 'error'

export type PlanningGovernanceAlert = {
  kind:
    | 'health'
    | 'integrity'
    | 'anomaly'
    | 'closeout_reminder'
    | 'closeout_escalation'
    | 'closeout_unlock'
    | 'reorder_reminder'
    | 'ad_hoc_cross_month_reminder'
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  source_id: string
}

export type PlanningGovernanceSnapshot = {
  project_id: string
  health: {
    project_id: string
    score: number
    status: 'healthy' | 'warning' | 'critical'
    label: string
    breakdown: {
      data_integrity_score: number
      mapping_integrity_score: number
      system_consistency_score: number
      m1_m9_score: number
      passive_reorder_penalty: number
      total_score: number
    }
  }
  integrity: {
    project_id: string
    data_integrity: {
      total_tasks: number
      missing_participant_unit_count: number
      missing_scope_dimension_count: number
      missing_progress_snapshot_count: number
    }
    mapping_integrity: {
      baseline_pending_count: number
      baseline_merged_count: number
      monthly_carryover_count: number
    }
    system_consistency: {
      inconsistent_milestones: number
      stale_snapshot_count: number
    }
    milestone_integrity: {
      summary: {
        total: number
        aligned: number
        needs_attention: number
        missing_data: number
        blocked: number
      }
    }
  }
  anomaly: {
    project_id: string
    detected_at: string
    total_events: number
    windows: Array<{
      window_days: number
      event_count: number
      affected_task_count: number
      cumulative_event_count: number
      triggered: boolean
      average_offset_days?: number
      key_task_count?: number
    }>
  }
  alerts: PlanningGovernanceAlert[]
}

export type BaselineDetail = BaselineVersion & { items: BaselineItem[] }
export type MonthlyPlanDetail = MonthlyPlanVersion & { items: MonthlyPlanItem[] }
export type PlanningDraftType = 'baseline' | 'monthly_plan'

export interface MonthlyPlanChangeSummary {
  addedCount: number
  removedCount: number
  dateShiftCount: number
  progressAdjustmentCount: number
  milestoneAdjustCount: number
  totalChangeCount: number
  threshold: number
  isLargeScale: boolean
}

export type DraftLockResponse = { lock: PlanningDraftLockRecord }

type MonthlyPlanPayloadItem = Omit<MonthlyPlanItem, 'id' | 'project_id' | 'monthly_plan_version_id' | 'created_at' | 'updated_at'>

interface BuildPlanningTabsOptions {
  navigate: NavigateFunction
  navigateWithGuard?: (to: string) => void
  projectId: string
  activeKey: PlanningPageTabKey
}

interface BuildMonthlyPlanRowsOptions {
  plan: MonthlyPlanDetail
  selectedItemIds: string[]
  readOnly: boolean
  tasks: Task[]
  baselineItems: BaselineItem[]
  conditionTaskIds?: Set<string>
  obstacleTaskIds?: Set<string>
  delayedTaskIds?: Set<string>
  draftSourceMode?: 'baseline' | 'schedule'
}

interface ApiTaskLite extends Task {
  actual_end_date?: string | null
}

export function buildPlanningTabs({ navigate, navigateWithGuard, projectId, activeKey }: BuildPlanningTabsOptions) {
  return PLANNING_PAGE_TABS.map((tab) => ({
    ...tab,
    active: tab.key === activeKey,
    onClick: () => {
      if (tab.key === activeKey) return
      const go = navigateWithGuard ?? navigate
      go(`/projects/${projectId}/planning/${tab.key}`)
    },
  }))
}

export function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatDateRange(start?: string | null, end?: string | null) {
  const startLabel = formatDate(start)
  const endLabel = formatDate(end)
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`
  return startLabel ?? endLabel ?? null
}

export function formatMonthLabel(month: string) {
  const date = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  })
}

export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return month
  date.setMonth(date.getMonth() + offset)
  const year = date.getFullYear()
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${nextMonth}`
}

export function buildMonthWindow(centerMonth: string, radius = 2) {
  return Array.from({ length: radius * 2 + 1 }, (_, index) => shiftMonth(centerMonth, index - radius))
}

export function getFriendlyGovernanceErrorMessage(error: unknown): string {
  const rawMessage = getApiErrorMessage(error, '治理快照暂时不可用，请稍后重试。').trim()

  if (/change_logs/i.test(rawMessage)) {
    return '治理快照暂时缺少变更记录数据源，系统已按空集降级；可先继续编制计划，并在补齐变更记录后重新校核。'
  }

  const firstLine = rawMessage.split('\n')[0]?.trim()
  if (!firstLine) return '治理快照暂时不可用，请稍后重试。'
  if (['executeSQL', 'server\\', 'internal/process', 'at async'].some((keyword) => rawMessage.includes(keyword))) {
    return '治理快照暂时不可用，请稍后重新校核；如果问题持续存在，请检查后端治理相关数据表是否已初始化。'
  }

  return firstLine
}

export function extractApiErrorCode(error: unknown) {
  if (!(error instanceof ApiClientError) || !error.rawText) return null

  const payload = safeJsonParse<Record<string, unknown> | null>(error.rawText, null, 'planning api error')
  const errorBlock = payload?.error
  if (!errorBlock || typeof errorBlock !== 'object') return null
  const code = (errorBlock as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export function formatCountdown(totalSeconds: number | null) {
  if (totalSeconds === null) return '未持有锁'
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getPlanningStatusLabel(status: PlanningStatus) {
  if (status === 'draft') return '草稿'
  if (status === 'confirmed') return '已确认'
  if (status === 'closed') return '已关闭'
  if (status === 'revising') return '修订中'
  if (status === 'pending_realign') return '待重排'
  if (status === 'archived') return '已归档'
  return '待重新校核'
}

export function getBaselineStatusLabel(status: BaselineVersion['status']) {
  return getPlanningStatusLabel(status)
}

export function getMonthlyPlanStatusLabel(status: MonthlyPlanVersion['status']) {
  if (status === 'closed') return '已关账'
  return getPlanningStatusLabel(status)
}

export function getMonthlyCommitmentLabel(status?: MonthlyPlanItem['commitment_status']) {
  if (status === 'carried_over') return '滚入下月'
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '本月承诺'
}

export function sortMonthlyPlanVersions(versions: MonthlyPlanVersion[]) {
  return [...versions].sort((left, right) => {
    if (left.month !== right.month) return right.month.localeCompare(left.month)
    return right.version - left.version
  })
}

export function sortBaselineVersions(versions: BaselineVersion[]) {
  return [...versions].sort((left, right) => right.version - left.version)
}

export function mapBaselineItemsToMonthlyItems(detail: BaselineDetail): MonthlyPlanPayloadItem[] {
  return [...detail.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => ({
      baseline_item_id: item.id,
      carryover_from_item_id: null,
      source_task_id: item.source_task_id ?? null,
      title: item.title,
      planned_start_date: item.planned_start_date ?? null,
      planned_end_date: item.planned_end_date ?? null,
      target_progress: item.target_progress ?? (item.is_milestone ? 100 : 0),
      current_progress: 0,
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order : index,
      is_milestone: Boolean(item.is_milestone),
      is_critical: Boolean(item.is_critical),
      commitment_status: 'planned',
      notes: item.notes ?? null,
    }))
}

function normalizePlanningDate(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function normalizePlanningProgress(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

export function mapTasksToMonthlyItems(tasks: ApiTaskLite[]): MonthlyPlanPayloadItem[] {
  return [...tasks]
    .sort((left, right) => {
      const leftOrder = Number(left.sort_order ?? 0)
      const rightOrder = Number(right.sort_order ?? 0)
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return String(left.wbs_code ?? left.title ?? left.name ?? '').localeCompare(
        String(right.wbs_code ?? right.title ?? right.name ?? ''),
        'zh-CN',
      )
    })
    .map((task, index) => ({
      baseline_item_id: null,
      carryover_from_item_id: null,
      source_task_id: task.id,
      title: task.title ?? task.name ?? `月度计划条目 ${index + 1}`,
      planned_start_date: normalizePlanningDate(task.planned_start_date),
      planned_end_date: normalizePlanningDate(task.planned_end_date),
      target_progress: normalizePlanningProgress(task.progress),
      current_progress: normalizePlanningProgress(task.progress),
      sort_order: Number(task.sort_order ?? index),
      is_milestone: Boolean(task.is_milestone),
      is_critical: Boolean(task.is_critical),
      commitment_status: task.status === '已完成' || task.progress === 100 ? 'completed' : 'planned',
      notes: task.description ?? null,
    }))
}

function getBaselineDepthResolver(items: BaselineItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const cache = new Map<string, number>()

  const resolveDepth = (itemId?: string | null): number => {
    if (!itemId || !byId.has(itemId)) return 1
    const cached = cache.get(itemId)
    if (cached) return cached
    const current = byId.get(itemId)
    if (!current?.parent_item_id || !byId.has(current.parent_item_id)) {
      cache.set(itemId, 1)
      return 1
    }

    const depth = Math.min(5, resolveDepth(current.parent_item_id) + 1)
    cache.set(itemId, depth)
    return depth
  }

  return resolveDepth
}

function getTaskDepthResolver(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const cache = new Map<string, number>()

  const resolveDepth = (taskId?: string | null): number => {
    if (!taskId || !byId.has(taskId)) return 1
    const cached = cache.get(taskId)
    if (cached) return cached
    const current = byId.get(taskId)
    if (!current?.parent_id || !byId.has(current.parent_id)) {
      const depth = Math.max(1, Math.min(5, Number(current?.wbs_level ?? 1)))
      cache.set(taskId, depth)
      return depth
    }

    const depth = Math.min(5, resolveDepth(current.parent_id) + 1)
    cache.set(taskId, depth)
    return depth
  }

  return resolveDepth
}

function buildChildCountMap(plan: MonthlyPlanDetail, tasks: Task[], baselineItems: BaselineItem[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const baselineById = new Map(baselineItems.map((item) => [item.id, item]))
  const monthlyByBaseline = new Map(
    plan.items.filter((item) => item.baseline_item_id).map((item) => [item.baseline_item_id as string, item.id]),
  )
  const monthlyByTask = new Map(
    plan.items.filter((item) => item.source_task_id).map((item) => [item.source_task_id as string, item.id]),
  )
  const childCount = new Map<string, number>()

  plan.items.forEach((item) => {
    const baselineParentId =
      item.baseline_item_id && baselineById.get(item.baseline_item_id)?.parent_item_id
        ? monthlyByBaseline.get(baselineById.get(item.baseline_item_id)?.parent_item_id as string)
        : null
    const taskParentId =
      item.source_task_id && taskById.get(item.source_task_id)?.parent_id
        ? monthlyByTask.get(taskById.get(item.source_task_id)?.parent_id as string)
        : null
    const parentMonthlyId = baselineParentId ?? taskParentId

    if (!parentMonthlyId) return
    childCount.set(parentMonthlyId, (childCount.get(parentMonthlyId) ?? 0) + 1)
  })

  return childCount
}

export function buildMonthlyPlanRows({
  plan,
  selectedItemIds,
  readOnly,
  tasks,
  baselineItems,
  conditionTaskIds = new Set<string>(),
  obstacleTaskIds = new Set<string>(),
  delayedTaskIds = new Set<string>(),
  draftSourceMode = 'baseline',
}: BuildMonthlyPlanRowsOptions): PlanningTreeRow[] {
  const resolveBaselineDepth = getBaselineDepthResolver(baselineItems)
  const resolveTaskDepth = getTaskDepthResolver(tasks)
  const childCount = buildChildCountMap(plan, tasks, baselineItems)

  return [...plan.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => {
      const baselineDepth = item.baseline_item_id ? resolveBaselineDepth(item.baseline_item_id) : null
      const taskDepth = item.source_task_id ? resolveTaskDepth(item.source_task_id) : null
      const depth = Math.max(1, Math.min(5, baselineDepth ?? taskDepth ?? (item.is_milestone ? 5 : 3)))
      const hasChildren = (childCount.get(item.id) ?? 0) > 0
      const progressLabel =
        typeof item.current_progress === 'number' && typeof item.target_progress === 'number'
          ? `当前 ${item.current_progress}% / 目标 ${item.target_progress}%`
          : typeof item.target_progress === 'number'
            ? `目标 ${item.target_progress}%`
            : null
      const sourceTaskId = item.source_task_id ?? null
      const sourceBadge =
        draftSourceMode === 'baseline' && item.baseline_item_id ? '预编制' : '待重整'
      const issueBadges = [
        sourceTaskId && conditionTaskIds.has(sourceTaskId) ? '条件未满足' : null,
        sourceTaskId && obstacleTaskIds.has(sourceTaskId) ? '阻碍处理中' : null,
        sourceTaskId && delayedTaskIds.has(sourceTaskId) ? '延期信号' : null,
      ].filter((badge): badge is string => Boolean(badge))
      const dateRange = formatDateRange(item.planned_start_date, item.planned_end_date)
      const subtitle =
        item.notes?.trim() ||
        [dateRange, progressLabel].filter(Boolean).join(' · ') ||
        (item.is_milestone ? '关键节点' : hasChildren ? '结构层级' : '本月执行项')

      return {
        id: item.id,
        title: item.title,
        subtitle,
        depth,
        rowType: item.is_milestone ? 'milestone' : hasChildren ? 'structure' : 'leaf',
        statusLabel: item.is_critical ? '关键路径' : undefined,
        isMilestone: Boolean(item.is_milestone),
        isCritical: Boolean(item.is_critical),
        selected: selectedItemIds.includes(item.id),
        locked: readOnly,
        startDateLabel: formatDate(item.planned_start_date) ?? undefined,
        endDateLabel: formatDate(item.planned_end_date) ?? undefined,
        progressLabel: progressLabel ?? undefined,
        extra: (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{sourceBadge}</Badge>
            {issueBadges.map((badge) => (
              <Badge
                key={`${item.id}-${badge}`}
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700"
              >
                {badge}
              </Badge>
            ))}
            <Badge variant="secondary">{getMonthlyCommitmentLabel(item.commitment_status)}</Badge>
            <Badge variant="outline">L{depth}</Badge>
          </div>
        ),
      } satisfies PlanningTreeRow
    })
}
