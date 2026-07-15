import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { EmptyState } from '@/components/EmptyState'
import { ProjectRemainingForecastCard } from '@/components/ProjectRemainingForecastCard'
import { PlanningExportDialog, type ExportFormat, type ExportScope } from '@/components/planning/PlanningExportDialog'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningValidationStrip } from '@/components/planning/PlanningValidationStrip'
import {
  type PlanningTreeCellKey,
  type PlanningTreeCellUpdate,
  type PlanningTreeClipboardRow,
} from '@/components/planning/PlanningTreeView'
import { PlanningPageLayout } from '@/components/planning/PlanningPageLayout'
import { ValidationPanel } from '@/components/planning/ValidationPanel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { MetricCard } from '@/components/ui/metric-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePlanningStore, type PlanningValidationIssue } from '@/hooks/usePlanningStore'
import { usePlanningPresence } from '@/hooks/usePlanningPresence'
import { usePlanningFieldRegistry } from '@/hooks/usePlanningFieldRegistry'
import { usePlanningValidation, type ValidationIssue, type ValidationInput } from '@/hooks/usePlanningValidation'
import { usePlanningViewMode } from '@/hooks/usePlanningViewMode'
import { usePermissions } from '@/hooks/usePermissions'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { useDurationForecastRefreshKey } from '@/hooks/useDurationForecastRefreshKey'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { daysUntilLocalDate } from '@/lib/dateDistance'
import { inclusiveDurationDays } from '@/lib/durationDays'
import { buildPlanningConflictFieldGroups, mergePlanningItemsBeforeSave } from '@/lib/planningConflictMerge'
import { writePlanningTableExport, type PlanningExportCell } from '@/lib/planningExport'
import {
  getPlanningFieldConfigStorageKey,
  readPlanningFieldConfigExtraColumns,
  type PlanningFieldConfigExtraColumnKey,
} from '@/lib/planningFieldConfig'
import { cn } from '@/lib/utils'
import { commitPlanningTable } from '@/services/planningCommitApi'
import { getCurrentTaskDurationForecasts, type TaskDurationForecast } from '@/services/durationSuggestionsApi'
import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'
import type { BaselineVersion, MonthlyPlanVersion } from '@/types/planning'
import type { Task, TaskCondition, TaskObstacle } from '@/pages/GanttViewTypes'
import { AlertTriangle, CalendarDays, Clock, FileDiff, Layers3 } from 'lucide-react'

import { PlanTreeEditor as BaselineTreeEditor } from './components/PlanTreeEditor'
import { MonthlyPlanBottomBar } from './components/MonthlyPlanBottomBar'
import {
  MonthlyPlanConfirmDialog,
  type MonthlyPlanConfirmMode,
  type MonthlyPlanConfirmState,
} from './components/MonthlyPlanConfirmDialog'
import { MonthlyPlanExceptionSummary } from './components/MonthlyPlanExceptionSummary'
import { MonthlyPlanHeader } from './components/MonthlyPlanHeader'
import { PlanningDraftResumeDialog } from './components/PlanningDraftResumeDialog'
import type { MonthlyPlanConfirmSummary } from './components/MonthlyPlanConfirmDialog'
import {
  buildPlanningDraftResumeKey,
  clearPlanningDraftResumeSnapshot,
  readPlanningDraftResumeSnapshot,
  writePlanningDraftResumeSnapshot,
  type PlanningDraftResumeSnapshot,
} from './draftPersistence'
import { CloseoutWorkspace } from './CloseoutPage'
import {
  type MonthlyPlanDetail,
  buildMonthWindow,
  buildMonthlyPlanRows,
  buildPlanningTabs,
  formatDate,
  formatMonthLabel,
  getMonthlyPlanStatusLabel,
  shiftMonth,
  sortBaselineVersions,
  sortMonthlyPlanVersions,
} from './planningShared'

type MonthlyAction =
  | 'generate'
  | 'save'
  | 'confirm'
  | 'batch_shift'
  | 'batch_progress'
  | 'batch_notes'
  | null

type MonthlyExportItem = MonthlyPlanDetail['items'][number]

type MonthlyExportColumn = {
  key: string
  header: string
  visibleByDefault?: boolean
  getValue: (item: MonthlyExportItem) => PlanningExportCell
}

const MONTHLY_EXPORT_COLUMNS: MonthlyExportColumn[] = [
  { key: 'sequence', header: '序号', visibleByDefault: true, getValue: (item) => (item.sort_order ?? 0) + 1 },
  { key: 'title', header: '任务名称', visibleByDefault: true, getValue: (item) => item.title },
  { key: 'plannedStart', header: '计划开始', visibleByDefault: true, getValue: (item) => item.planned_start_date },
  { key: 'plannedEnd', header: '计划完成', visibleByDefault: true, getValue: (item) => item.planned_end_date },
  { key: 'duration', header: '计划工期', visibleByDefault: true, getValue: (item) => getMonthlyDurationDays(item.planned_start_date, item.planned_end_date) },
  { key: 'targetProgress', header: '目标进度', visibleByDefault: true, getValue: (item) => (item.target_progress == null ? '' : `${item.target_progress}%`) },
  { key: 'currentProgress', header: '当前进度', visibleByDefault: true, getValue: (item) => (item.current_progress == null ? '' : `${item.current_progress}%`) },
  { key: 'commitmentStatus', header: '承诺状态', visibleByDefault: true, getValue: (item) => item.commitment_status },
  { key: 'milestone', header: '里程碑', getValue: (item) => Boolean(item.is_milestone) },
  { key: 'critical', header: '关键路径', getValue: (item) => Boolean(item.is_critical) },
  { key: 'source', header: '来源', getValue: (item) => item.baseline_item_id ? '基线' : item.carryover_from_item_id ? '滚入' : item.source_task_id ? '现场' : '新增' },
  { key: 'wbsNodeType', header: '节点类型', getValue: (item) => item.wbs_node_type ?? item.engineering_category_type },
  { key: 'standardWork', header: '标准工序', getValue: (item) => item.standard_work_name ?? item.standard_work_code },
  { key: 'notes', header: '备注', getValue: (item) => item.notes },
]
const MONTHLY_VISIBLE_EXPORT_KEYS = new Set(
  MONTHLY_EXPORT_COLUMNS.filter((column) => column.visibleByDefault).map((column) => column.key),
)
const MONTHLY_EXPORT_KEY_BY_EXTRA_COLUMN: Partial<Record<PlanningFieldConfigExtraColumnKey, string>> = {
  type: 'wbsNodeType',
  critical: 'critical',
  notes: 'notes',
}
type MonthlyEditableField = 'title' | 'start' | 'end' | 'progress'
type MonthlyEditorSnapshot = { items: MonthlyPlanDetail['items']; selectedIds: string[] }

const MONTHLY_EDITABLE_FIELDS: MonthlyEditableField[] = ['title', 'start', 'end', 'progress']

function normalizeMonthlyClipboardDate(value?: string | null) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function normalizeMonthlyClipboardProgress(value?: number | string | null) {
  const normalized = String(value ?? '').replace('%', '').trim()
  if (!normalized) return null
  const parsed = Number.parseInt(normalized, 10)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.min(100, parsed))
}

function shiftMonthlyPlanDate(value: string | null | undefined, shiftDays: number) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  parsed.setDate(parsed.getDate() + shiftDays)
  return parsed.toISOString().slice(0, 10)
}

function mapMonthlyCellKey(field: PlanningTreeCellKey): MonthlyEditableField | 'milestone' | null {
  if (field === 'title') return 'title'
  if (field === 'start') return 'start'
  if (field === 'end') return 'end'
  if (field === 'progress') return 'progress'
  if (field === 'milestone') return 'milestone'
  return null
}

function mapValidationFieldToMonthlyCell(field: string): MonthlyEditableField | null {
  if (field === 'title') return 'title'
  if (field === 'planned_start_date') return 'start'
  if (field === 'planned_end_date') return 'end'
  if (field === 'progress' || field === 'target_progress') return 'progress'
  return null
}

function buildValidationCellMap(issues: ValidationIssue[]) {
  return issues.reduce((map, issue) => {
    const cell = mapValidationFieldToMonthlyCell(issue.field)
    if (!cell) return map
    const key = `${issue.rowId}:${cell}`
    const nextIssues = map.get(key) ?? []
    nextIssues.push(issue)
    map.set(key, nextIssues)
    return map
  }, new Map<string, ValidationIssue[]>())
}

function getFirstCellIssue(
  issueMap: Map<string, ValidationIssue[]>,
  rowId: string,
  field: MonthlyEditableField,
) {
  return issueMap.get(`${rowId}:${field}`)?.[0]
}

function focusMonthlyValidationIssue(issue: ValidationIssue) {
  const field = mapValidationFieldToMonthlyCell(issue.field)
  const selectors = [
    field ? `[data-monthly-editor-cell="${issue.rowId}:${field}"]` : null,
    field ? `[data-planning-cell="${issue.rowId}:${field}"]` : null,
  ].filter((selector): selector is string => Boolean(selector))

  const target = selectors
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((element): element is HTMLElement => Boolean(element))
  if (!target) return

  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
  window.setTimeout(() => {
    const focusTarget = target.matches('input, textarea, select, button, [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]')
    focusTarget?.focus()
  }, 0)
}

function getCurrentMonth() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function getMonthlyDurationDays(start?: string | null, end?: string | null) {
  const duration = inclusiveDurationDays(start, end)
  return duration ?? ''
}

function getMonthlyExportColumns(scope: ExportScope, extraColumns: PlanningFieldConfigExtraColumnKey[] = []) {
  if (scope !== 'visible') return MONTHLY_EXPORT_COLUMNS

  const visibleKeys = new Set(MONTHLY_VISIBLE_EXPORT_KEYS)
  extraColumns.forEach((columnKey) => {
    const exportKey = MONTHLY_EXPORT_KEY_BY_EXTRA_COLUMN[columnKey]
    if (exportKey) visibleKeys.add(exportKey)
  })
  return MONTHLY_EXPORT_COLUMNS.filter((column) => visibleKeys.has(column.key))
}

function buildMonthlyExportData(
  items: MonthlyExportItem[],
  scope: ExportScope,
  extraColumns: PlanningFieldConfigExtraColumnKey[] = [],
) {
  const columns = getMonthlyExportColumns(scope, extraColumns)
  return [
    columns.map((column) => column.header),
    ...items.map((item) => columns.map((column) => column.getValue(item))),
  ]
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
      engineering_category_id: item.engineering_category_id ?? null,
      wbs_node_type: item.wbs_node_type ?? null,
      wbs_path: item.wbs_path ?? null,
      is_wbs_summary: item.is_wbs_summary ?? null,
      is_executable: item.is_executable ?? null,
      standard_work_code: item.standard_work_code ?? null,
      standard_work_name: item.standard_work_name ?? null,
    }))
}

function cloneMonthlyEditorItems(plan: MonthlyPlanDetail | null) {
  if (!plan) return [] as MonthlyPlanDetail['items']
  return [...plan.items]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item) => ({ ...item }))
}

const MONTHLY_COMMIT_FIELDS = [
  'baseline_item_id',
  'carryover_from_item_id',
  'source_task_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'current_progress',
  'sort_order',
  'is_milestone',
  'is_critical',
  'commitment_status',
  'notes',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
] as const

function isLocalPlanningRowId(rowId: string) {
  return rowId.startsWith('local-')
}

function buildMonthlyCommitValues(item: MonthlyPlanDetail['items'][number], index: number) {
  return MONTHLY_COMMIT_FIELDS.reduce<Record<string, unknown>>((values, field) => {
    values[field] = field === 'sort_order' ? item.sort_order ?? index : item[field] ?? null
    return values
  }, {})
}

function buildMonthlyCommitOperations(
  baseItems: MonthlyPlanDetail['items'],
  nextItems: MonthlyPlanDetail['items'],
): PlanningTableOperation[] {
  const baseById = new Map(baseItems.map((item) => [item.id, item]))
  const nextIds = new Set(nextItems.map((item) => item.id))
  const operations: PlanningTableOperation[] = []

  nextItems.forEach((item, index) => {
    const values = buildMonthlyCommitValues(item, index)
    const baseItem = baseById.get(item.id)
    if (!baseItem || isLocalPlanningRowId(item.id)) {
      operations.push({
        type: 'create_row',
        clientRowId: item.id,
        values,
      })
      return
    }

    const changedValues = MONTHLY_COMMIT_FIELDS.reduce<Record<string, unknown>>((patch, field) => {
      const nextValue = field === 'sort_order' ? item.sort_order ?? index : item[field] ?? null
      const baseValue = field === 'sort_order' ? baseItem.sort_order ?? index : baseItem[field] ?? null
      if (JSON.stringify(nextValue) !== JSON.stringify(baseValue)) {
        patch[field] = nextValue
      }
      return patch
    }, {})

    if (Object.keys(changedValues).length > 0) {
      operations.push({ type: 'update_row', rowId: item.id, values: changedValues })
    }
  })

  baseItems.forEach((item) => {
    if (!nextIds.has(item.id)) {
      operations.push({ type: 'delete_row', rowId: item.id })
    }
  })

  return operations
}

function serializeMonthlyEditorItem(item: MonthlyPlanDetail['items'][number]) {
  return JSON.stringify({
    id: item.id,
    title: item.title,
    planned_start_date: item.planned_start_date ?? null,
    planned_end_date: item.planned_end_date ?? null,
    target_progress: item.target_progress ?? null,
    sort_order: item.sort_order,
    engineering_category_id: item.engineering_category_id ?? null,
    wbs_node_type: item.wbs_node_type ?? null,
    wbs_path: item.wbs_path ?? null,
    is_wbs_summary: item.is_wbs_summary ?? null,
    is_executable: item.is_executable ?? null,
    standard_work_code: item.standard_work_code ?? null,
    standard_work_name: item.standard_work_name ?? null,
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

  const diffDays = -(daysUntilLocalDate(dueDate) ?? 0)
  if (diffDays < 0) {
    return {
      tone: 'slate' as const,
      title: '第 3 日催办尚未触发',
      detail: `${formatMonthLabel(month)} 确认催办尚未开始，将在第 3 日前提醒完成 ${formatMonthLabel(month)} 确认。`,
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
  month: string
  plan: MonthlyPlanDetail | null
  blockingSummary?: MonthlyPlanConfirmSummary | null
}): PlanningValidationIssue[] {
  const blockingSummary = params.blockingSummary ?? null
  const blockingIssueCount = blockingSummary?.blockingIssueCount ?? 0

  const issues: Array<PlanningValidationIssue | null> = [
    blockingIssueCount > 0
      ? {
          id: 'monthly-blocking',
          level: 'error' as const,
          title: `${blockingIssueCount} 项确认阻断项未清`,
          detail:
            `还剩 ${blockingIssueCount} 项需要先处理：` +
            `计划依据 ${blockingSummary?.mappingIssueCount ?? 0}、` +
            `必填 ${blockingSummary?.requiredFieldIssueCount ?? 0}。`,
        }
      : null,
    params.plan
      ? {
          id: 'monthly-version',
          level: 'info' as const,
          title: formatMonthLabel(params.month) + ' 当前版本：v' + params.plan.version,
          detail: '当前状态：' + getMonthlyPlanStatusLabel(params.plan.status) + '。',
        }
        : {
          id: 'monthly-empty',
          level: 'info' as const,
          title: `${formatMonthLabel(params.month)} 尚未生成月度计划`,
          detail: `先由系统生成 ${formatMonthLabel(params.month)} 计划，再复核和确认。`,
        },
  ]

  return issues.filter((issue): issue is PlanningValidationIssue => issue !== null)
}

function mapTableValidationIssuesToPlanningIssues(issues: ValidationIssue[]): PlanningValidationIssue[] {
  return issues.map((issue, index) => ({
    id: `monthly-table-${issue.rowId}-${issue.field}-${index}`,
    level: issue.severity === 'block_save' ? 'error' : issue.severity === 'confirm' ? 'warning' : 'info',
    title: issue.message,
    detail: `定位到行 ${issue.rowId} 的 ${issue.field} 字段。`,
  }))
}

function buildMonthlyStatusNotice(status: MonthlyPlanVersion['status'], month: string) {
  const monthLabel = formatMonthLabel(month)
  switch (status) {
    case 'draft':
      return `${monthLabel} 正在编制，可直接在表格中调整后确认。`
    case 'confirmed':
      return `${monthLabel} 已确认，可继续查看或进入月末关账。`
    case 'closed':
      return `${monthLabel} 已完成关账，仅保留查看与追溯。`
    case 'revising':
      return `${monthLabel} 正在复核，可根据现场情况继续调整。`
    case 'pending_realign':
      return `${monthLabel} 已有待处理调整，系统会在下次生成时自动吸收。`
    case 'archived':
      return `${monthLabel} 已归档，仅用于历史追溯。`
    default:
      return `${monthLabel} 状态已更新。`
  }
}

function getMonthlyPlanStatusTooltip(status?: MonthlyPlanVersion['status'], month?: string) {
  const monthLabel = month ? formatMonthLabel(month) : '当前月份'
  if (status === 'confirmed') return `${monthLabel} 计划已确认`
  if (status === 'draft') return `${monthLabel} 计划待确认`
  if (status === 'revising') return `${monthLabel} 计划正在复核`
  if (status === 'pending_realign') return `${monthLabel} 计划有待处理调整`
  if (status === 'closed') return `${monthLabel} 计划已完成关账`
  if (status === 'archived') return '历史归档版本，仅用于追溯'
  return `${monthLabel} 尚未生成计划`
}

function buildMonthlyConfirmSummary(plan: MonthlyPlanDetail | null, tasks: Task[]) {
  const itemList = plan?.items ?? []
  const taskMap = new Map(tasks.map((task) => [task.id, task]))

  return {
    totalItemCount: itemList.length,
    newlyAddedCount: itemList.filter((item) => !item.baseline_item_id && !item.carryover_from_item_id).length,
    autoRolledInCount: itemList.filter((item) => item.commitment_status === 'carried_over').length,
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    pendingRemovalCount: itemList.filter((item) => item.commitment_status === 'cancelled').length,
    // eslint-disable-next-line -- frontend-bi-aggregation-approved
    milestoneCount: itemList.filter((item) => Boolean(item.is_milestone)).length,
    dateAdjustmentCount: itemList.filter((item) => {
      const task = item.source_task_id ? taskMap.get(item.source_task_id) : null
      if (!task) return Boolean(item.planned_start_date || item.planned_end_date)
      const taskStart = task.planned_start_date ?? task.start_date ?? null
      const taskEnd = task.planned_end_date ?? task.end_date ?? null
      return taskStart !== item.planned_start_date || taskEnd !== item.planned_end_date
    }).length,
    progressAdjustmentCount: itemList.filter((item) => {
      const task = item.source_task_id ? taskMap.get(item.source_task_id) : null
      if (!task) return item.target_progress != null
      return (task.progress ?? null) !== (item.target_progress ?? null)
    }).length,
    blockingIssueCount: 0,
    conditionIssueCount: 0,
    obstacleIssueCount: 0,
    delayIssueCount: 0,
    mappingIssueCount: 0,
    requiredFieldIssueCount: 0,
  }
}

function MonthlyPlanEditorPage() {
  useEffect(() => {
    document.title = '月度计划 | WorkBuddy'
  }, [])

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const currentUser = useStore((state) => state.currentUser)
  const { canEdit } = usePermissions({ projectId: currentProject?.id ?? id })
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const clearSelection = usePlanningStore((state) => state.clearSelection)
  const draftStatus = usePlanningStore((state) => state.draftStatus)
  const setDraftStatus = usePlanningStore((state) => state.setDraftStatus)
  const validationIssues = usePlanningStore((state) => state.validationIssues)
  const setValidationIssues = usePlanningStore((state) => state.setValidationIssues)
  const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)

  const projectId = id ?? ''
  const fieldConfigStorageKey = useMemo(
    () => getPlanningFieldConfigStorageKey(projectId, 'monthly_plan', currentUser?.id),
    [currentUser?.id, projectId],
  )
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedMonth = searchParams.get('month')?.trim() || ''
  const closeoutCompleted = searchParams.get('closeout_complete') === '1'

  const [selectedMonth, setSelectedMonth] = useState(requestedMonth || getCurrentMonth())
  const [planVersions, setPlanVersions] = useState<MonthlyPlanVersion[]>([])
  const [baselineVersions, setBaselineVersions] = useState<BaselineVersion[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [conditions, setConditions] = useState<TaskCondition[]>([])
  const [obstacles, setObstacles] = useState<TaskObstacle[]>([])
  const [activePlan, setActivePlan] = useState<MonthlyPlanDetail | null>(null)
  const [monthlyConfirmSummary, setMonthlyConfirmSummary] = useState<MonthlyPlanConfirmSummary | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<MonthlyAction>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState<MonthlyPlanConfirmMode>('standard')
  const [confirmState, setConfirmState] = useState<MonthlyPlanConfirmState>('ready')
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [resumeSnapshot, setResumeSnapshot] = useState<PlanningDraftResumeSnapshot | null>(null)
  const [resumeInitialized, setResumeInitialized] = useState(false)
  const [durationForecastByTaskId, setDurationForecastByTaskId] = useState<Record<string, TaskDurationForecast>>({})
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const historyRef = useRef<MonthlyEditorSnapshot[]>([])
  const historyCursorRef = useRef(-1)
  const historyScopeRef = useRef<string | null>(null)
  const initialSnapshotRef = useRef<MonthlyEditorSnapshot | null>(null)
  const lastHandledRealtimeEventKeyRef = useRef('')
  const durationForecastRequestKeyRef = useRef('')
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
  const readOnly = !canEdit || !activePlan || activePlan.status !== 'draft'
  const [isEditing, setIsEditing] = useState(false)
  const { viewMode, setViewMode } = usePlanningViewMode({
    projectId,
    surface: 'monthly_plan',
    userId: currentUser?.id,
    rowMode: isEditing ? 'edit' : 'read',
  })
  const noBaselineIntercept = !pageLoading && !activePlan && !latestConfirmedBaseline
  const rowSourceMode = activePlan?.source_mode ?? (latestConfirmedBaseline ? 'baseline' : 'schedule')
  const confirmReminder = useMemo(
    () => buildMonthlyConfirmReminder(activePlan?.month ?? selectedMonth, activePlan?.status),
    [activePlan?.month, activePlan?.status, selectedMonth],
  )
  const editorItems = useMemo(() => cloneMonthlyEditorItems(activePlan), [activePlan])
  const monthlyValidationInputs = useMemo<ValidationInput[]>(() => (
    editorItems.map((item) => ({
      rowId: item.id,
      title: item.title,
      plannedStartDate: item.planned_start_date ?? null,
      plannedEndDate: item.planned_end_date ?? null,
      progress: item.target_progress ?? null,
      isMilestone: Boolean(item.is_milestone),
      isExecutable: Boolean(item.is_milestone || (item.is_executable ?? !item.is_wbs_summary)),
    }))
  ), [editorItems])
  const monthlyTableValidation = usePlanningValidation(monthlyValidationInputs, {
    requireEngineeringObject: false,
    requireParticipantUnit: false,
    requireProgress: true,
  })
  const monthlyConfirmabilityIssues = useMemo(
    () => mapTableValidationIssuesToPlanningIssues(monthlyTableValidation.issues),
    [monthlyTableValidation.issues],
  )
  const monthlyValidationCellMap = useMemo(
    () => buildValidationCellMap(monthlyTableValidation.issues),
    [monthlyTableValidation.issues],
  )
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
  const hasUnsavedMonthlyEdits = Boolean(isDirty || isEditing)
  const monthlyPresence = usePlanningPresence({
    projectId,
    resourceType: 'monthly',
    resourceId: activePlan?.id ?? null,
    enabled: Boolean(activePlan?.id),
  })
  const fieldRegistry = usePlanningFieldRegistry(projectId, 'monthly_plan')
  const conflictFieldGroups = useMemo(
    () => buildPlanningConflictFieldGroups(fieldRegistry.registry?.fields),
    [fieldRegistry.registry?.fields],
  )
  const conflictFields = useMemo(
    () => fieldRegistry.registry?.fields.map((field) => field.key),
    [fieldRegistry.registry?.fields],
  )
  const editedEntryCount = useMemo(
    () => countChangedMonthlyEntries(initialSnapshotRef.current, currentEditorSnapshot),
    [currentEditorSnapshot],
  )
  const executionReadinessIssues = validationIssues
  const combinedValidationIssues = useMemo(
    () => [...monthlyConfirmabilityIssues, ...executionReadinessIssues],
    [executionReadinessIssues, monthlyConfirmabilityIssues],
  )
  const hasBlockingIssues = monthlyConfirmabilityIssues.some((issue) => issue.level === 'error')
  const quickAvailable = Boolean(activePlan) && !readOnly && !hasBlockingIssues && !hasUnsavedMonthlyEdits
  const canOpenStandardConfirm = Boolean(activePlan) && !readOnly && !hasUnsavedMonthlyEdits
  const canStandardConfirm = canOpenStandardConfirm
  const confirmSummary = useMemo(
    () => monthlyConfirmSummary ?? buildMonthlyConfirmSummary(activePlan, tasks),
    [activePlan, monthlyConfirmSummary, tasks],
  )
  const totalConfirmBlockingIssueCount = confirmSummary.blockingIssueCount + monthlyTableValidation.blockCount
  const confirmDialogSummary = useMemo(
    () => ({
      ...confirmSummary,
      blockingIssueCount: totalConfirmBlockingIssueCount,
      requiredFieldIssueCount: confirmSummary.requiredFieldIssueCount + monthlyTableValidation.blockCount,
    }),
    [confirmSummary, monthlyTableValidation.blockCount, totalConfirmBlockingIssueCount],
  )
  const resetMonthlyHistoryFromServer = useCallback((plan: MonthlyPlanDetail | null, month: string) => {
    if (!plan) {
      historyScopeRef.current = `monthly:${projectId || 'none'}:${month}`
      historyRef.current = []
      historyCursorRef.current = -1
      initialSnapshotRef.current = null
      setSelectedItemIds([])
      setInputDrafts({})
      forceHistoryRender((value) => value + 1)
      return
    }

    const loadedItems = cloneMonthlyEditorItems(plan)
    const loadedIds = loadedItems.map((item) => item.id)
    const loadedSnapshot: MonthlyEditorSnapshot = {
      items: loadedItems,
      selectedIds: loadedIds,
    }
    historyScopeRef.current = plan.id
    historyRef.current = [loadedSnapshot]
    historyCursorRef.current = 0
    initialSnapshotRef.current = loadedSnapshot
    setSelectedItemIds(loadedIds)
    setInputDrafts({})
    forceHistoryRender((value) => value + 1)
  }, [projectId, setSelectedItemIds])
  const unsavedChangesGuard = useUnsavedChangesGuard(
    Boolean(isDirty),
    '月度计划还有未保存调整，离开后这些调整会丢失，确认继续吗？',
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
        title: '当前月计划存在待处理调整',
        detail: `系统会在下次生成时自动吸收现场变化；${formatMonthLabel(activePlan.month)} 如未确认，可直接在表格中调整后确认。`,
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
        detail: '当前版本保留查看和追溯，不再允许继续编辑。',
      }
    }
    if (activePlan?.status === 'confirmed') {
      return {
        tone: 'emerald' as const,
        title: '当前月计划已确认',
        detail: `${formatMonthLabel(activePlan.month)} 承诺已形成快照，后续现场变化进入任务列表和 ${formatMonthLabel(shiftMonth(activePlan.month, 1))} 计划算法。`,
      }
    }
    if (closeoutCompleted) {
      return {
        tone: 'emerald' as const,
        title: `${formatMonthLabel(shiftMonth(selectedMonth, -1))} 月末关账已完成`,
        detail: `当前页面已切换到 ${formatMonthLabel(selectedMonth)} 月度计划工作区，可以继续处理 ${formatMonthLabel(selectedMonth)} 月度计划。`,
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
  }, [activePlan?.month, activePlan?.status, closeoutCompleted, noBaselineIntercept, selectedMonth, statusNotice])

  const loadMonthlyContext = useCallback(
    async (options?: { preferredMonth?: string; preferredId?: string; preserveNotice?: boolean; signal?: AbortSignal }) => {
      const signal = options?.signal

      if (!projectId) {
        setPageLoading(false)
        setPlanVersions([])
        setActivePlan(null)
        setMonthlyConfirmSummary(null)
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
          versionsForMonth.find((item) => item.status !== 'draft') ??
          versionsForMonth.find((item) => item.status === 'draft') ??
          versionsForMonth[0] ??
          null

        let detail: MonthlyPlanDetail | null = null
        let notice: string | null = null
        let nextDraftStatus = 'idle' as typeof draftStatus
        let nextConfirmSummary: MonthlyPlanConfirmSummary | null = null

        if (selectedVersion) {
          detail = await apiGet<MonthlyPlanDetail>(
            `/api/monthly-plans/${selectedVersion.id}?project_id=${encodeURIComponent(projectId)}`,
            { signal },
          )
          if (selectedVersion.status === 'draft') {
            nextDraftStatus = 'editing'
          } else {
            notice = buildMonthlyStatusNotice(selectedVersion.status, detail.month)
          }

          nextConfirmSummary = buildMonthlyConfirmSummary(detail, allTasks)
        }

        setSelectedMonth(resolvedMonth)
        setPlanVersions(sortedVersions)
        setBaselineVersions(sortBaselineVersions(allBaselineVersions))
        setTasks(allTasks)
        setConditions(allConditions)
        setObstacles(allObstacles)
        setActivePlan(detail)
        resetMonthlyHistoryFromServer(detail, resolvedMonth)
        setMonthlyConfirmSummary(nextConfirmSummary)
        setDraftStatus(nextDraftStatus)
        setValidationIssues(
          buildValidationIssues({
            month: resolvedMonth,
            plan: detail,
            blockingSummary: nextConfirmSummary,
          }),
        )
        setStatusNotice(notice)
      } catch (error) {
        if (signal?.aborted) return
        setActivePlan(null)
        setMonthlyConfirmSummary(null)
        setDraftStatus('idle')
        setPageError(getApiErrorMessage(error, '月度计划页面加载失败，请稍后重试。'))
      } finally {
        setPageLoading(false)
      }
    },
    [projectId, requestedMonth, resetMonthlyHistoryFromServer, selectedMonth, setDraftStatus, setValidationIssues],
  )

  useEffect(() => {
    clearSelection()
    const controller = new AbortController()
    void loadMonthlyContext({ signal: controller.signal })
    return () => { controller.abort() }
  }, [clearSelection, loadMonthlyContext])

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

  useEffect(() => {
    if (!projectId || !lastRealtimeEvent) return
    if (lastRealtimeEvent.type !== 'planning.table.changed') return
    if (lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== projectId) return
    if (String(lastRealtimeEvent.entityType ?? '').trim() !== 'monthly_plan') return

    const eventResourceId = String(
      lastRealtimeEvent.entityId ?? lastRealtimeEvent.payload?.resourceId ?? '',
    ).trim()
    if (activePlan?.id && eventResourceId && eventResourceId !== activePlan.id) return

    const eventKey = [
      lastRealtimeEvent.timestamp,
      lastRealtimeEvent.type,
      lastRealtimeEvent.projectId ?? '',
      eventResourceId,
    ].join(':')
    if (lastHandledRealtimeEventKeyRef.current === eventKey) return
    lastHandledRealtimeEventKeyRef.current = eventKey

    if (isDirty) {
      setStatusNotice('有协作更新，保存时将自动合并')
      return
    }

    const controller = new AbortController()
    void loadMonthlyContext({
      preferredMonth: activePlan?.month ?? selectedMonth,
      preferredId: activePlan?.id,
      preserveNotice: true,
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [
    activePlan?.id,
    activePlan?.month,
    isDirty,
    lastRealtimeEvent,
    loadMonthlyContext,
    projectId,
    selectedMonth,
  ])

  const canUndo = historyCursorRef.current > 0
  const canRedo =
    historyCursorRef.current >= 0 &&
    historyCursorRef.current < historyRef.current.length - 1

  useEffect(() => {
    if (!activePlan || activePlan.status !== 'draft') return
    if (['generate', 'save', 'confirm'].includes(actionLoading ?? '')) return

    setDraftStatus(isDirty ? 'dirty' : 'editing')
  }, [actionLoading, activePlan, isDirty, setDraftStatus])

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

  const handleMonthSwitch = useCallback(
    async (month: string) => {
      const switchMonth = async () => {
        clearSelection()
        await loadMonthlyContext({ preferredMonth: month })
      }

      if (isDirty) {
        unsavedChangesGuard.guardNavigation(() => {
          void switchMonth()
        })
        return
      }

      await switchMonth()
    },
    [clearSelection, isDirty, loadMonthlyContext, unsavedChangesGuard],
  )

  const handleContinueDraftWorkspace = useCallback(() => {
    setResumeDialogOpen(false)
    setStatusNotice('已恢复上次月计划工作区，可以继续沿用当前编制上下文。')
  }, [])

  const handleDiscardDraftWorkspace = useCallback(() => {
    clearPlanningDraftResumeSnapshot(monthlyDraftResumeKey)
    setResumeSnapshot(null)
    setResumeDialogOpen(false)
    setStatusNotice('已放弃本地未保存状态，当前按服务端月计划重新开始。')
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
      const draftKey = `${itemId}:${field}`
      const focusOrder = editorItems.flatMap((item) =>
        MONTHLY_EDITABLE_FIELDS.map((currentField) => ({ itemId: item.id, field: currentField })),
      )
      const currentIndex = focusOrder.findIndex((entry) => entry.itemId === itemId && entry.field === field)
      const focusTarget = (index: number) => {
        const target = focusOrder[index]
        if (!target) return
        requestAnimationFrame(() => {
          const nextCell = document.querySelector<HTMLInputElement>(
            `[data-monthly-editor-cell="${target.itemId}:${target.field}"]`,
          )
          nextCell?.focus()
          nextCell?.select?.()
        })
      }

      if (event.key === 'Tab') {
        const targetIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1
        commitFieldEdit(itemId, field)
        if (targetIndex >= 0 && targetIndex < focusOrder.length) {
          event.preventDefault()
          focusTarget(targetIndex)
        }
        return
      }

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
          delete next[draftKey]
          return next
        })
        event.currentTarget.blur()
      }
    },
    [commitFieldEdit, editorItems],
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

  const handleStartEdit = useCallback(() => {
    if (readOnly) return
    setIsEditing(true)
  }, [readOnly])

  const durationForecastRefreshKey = useDurationForecastRefreshKey(!isEditing)
  const durationForecastTaskSignature = useMemo(() => {
    if (isEditing) return ''
    return [...new Set((activePlan?.items ?? [])
      .map((item) => String(item.source_task_id ?? '').trim())
      .filter(Boolean))]
      .join('|')
  }, [activePlan?.items, isEditing])

  const handleCancelEdit = useCallback(() => {
    const snapshot = initialSnapshotRef.current
    if (snapshot) {
      commitEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
    }
    setIsEditing(false)
  }, [commitEditorSnapshot])

  useEffect(() => {
    if (isEditing) {
      durationForecastRequestKeyRef.current = ''
      setDurationForecastByTaskId({})
      return undefined
    }

    const taskIds = durationForecastTaskSignature
      ? durationForecastTaskSignature.split('|').filter(Boolean)
      : []
    if (taskIds.length === 0) {
      durationForecastRequestKeyRef.current = ''
      setDurationForecastByTaskId({})
      return undefined
    }

    const requestKey = `${durationForecastTaskSignature}:${durationForecastRefreshKey}`
    if (durationForecastRequestKeyRef.current === requestKey) return undefined

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      durationForecastRequestKeyRef.current = requestKey
      getCurrentTaskDurationForecasts(taskIds, { signal: controller.signal })
        .then((forecasts) => {
          if (controller.signal.aborted) return
          setDurationForecastByTaskId(Object.fromEntries(
            forecasts
              .map((forecast) => [forecast.taskId, forecast] as const)
              .filter((entry): entry is [string, TaskDurationForecast] => Boolean(entry[0])),
          ))
        })
        .catch((error) => {
          if ((error as DOMException)?.name !== 'AbortError') {
            durationForecastRequestKeyRef.current = ''
            setDurationForecastByTaskId({})
          }
        })
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [durationForecastRefreshKey, durationForecastTaskSignature, isEditing])

  const baseRows = useMemo(
    () =>
      activePlan
        ? buildMonthlyPlanRows({
            plan: activePlan,
            selectedItemIds: normalizedSelectedItemIds,
            readOnly,
            tasks,
            baselineItems: [],
            projectId,
            draftSourceMode: rowSourceMode,
            showDurationSuggestion: isEditing && !readOnly,
            durationForecastByTaskId,
          })
        : [],
    [
      activePlan,
      durationForecastByTaskId,
      isEditing,
      normalizedSelectedItemIds,
      projectId,
      readOnly,
      rowSourceMode,
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
        const titleIssue = getFirstCellIssue(monthlyValidationCellMap, item.id, 'title')
        const startIssue = getFirstCellIssue(monthlyValidationCellMap, item.id, 'start')
        const endIssue = getFirstCellIssue(monthlyValidationCellMap, item.id, 'end')
        const progressIssue = getFirstCellIssue(monthlyValidationCellMap, item.id, 'progress')

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
                aria-invalid={Boolean(titleIssue)}
                aria-describedby={titleIssue ? `monthly-validation-${item.id}-title` : undefined}
                className={cn(
                  'h-9 border-slate-200 bg-white text-sm',
                  titleIssue && 'border-red-500 ring-1 ring-red-200',
                )}
              />
              {titleIssue ? (
                <p id={`monthly-validation-${item.id}-title`} role="alert" className="text-xs text-red-600">
                  {titleIssue.message}
                </p>
              ) : null}
            </div>
          ),
          startCell: (
            <div className="space-y-1">
              <Input
                type="date"
                value={inputDrafts[startKey] ?? item.planned_start_date ?? ''}
                onChange={(event) => handleDraftChange(item.id, 'start', event.target.value)}
                onBlur={() => commitFieldEdit(item.id, 'start')}
                onKeyDown={(event) => handleInputKeyDown(event, item.id, 'start')}
                disabled={readOnly}
                data-monthly-editor-cell={`${item.id}:start`}
                aria-invalid={Boolean(startIssue)}
                aria-describedby={startIssue ? `monthly-validation-${item.id}-start` : undefined}
                className={cn(
                  'h-9 border-slate-200 bg-white text-right text-sm num-mono',
                  startIssue && 'border-red-500 ring-1 ring-red-200',
                )}
              />
              {startIssue ? (
                <p id={`monthly-validation-${item.id}-start`} role="alert" className="text-xs text-red-600">
                  {startIssue.message}
                </p>
              ) : null}
            </div>
          ),
          endCell: (
            <div className="space-y-1">
              <Input
                type="date"
                value={inputDrafts[endKey] ?? item.planned_end_date ?? ''}
                onChange={(event) => handleDraftChange(item.id, 'end', event.target.value)}
                onBlur={() => commitFieldEdit(item.id, 'end')}
                onKeyDown={(event) => handleInputKeyDown(event, item.id, 'end')}
                disabled={readOnly}
                data-monthly-editor-cell={`${item.id}:end`}
                aria-invalid={Boolean(endIssue)}
                aria-describedby={endIssue ? `monthly-validation-${item.id}-end` : undefined}
                className={cn(
                  'h-9 border-slate-200 bg-white text-right text-sm num-mono',
                  endIssue && 'border-red-500 ring-1 ring-red-200',
                )}
              />
              {endIssue ? (
                <p id={`monthly-validation-${item.id}-end`} role="alert" className="text-xs text-red-600">
                  {endIssue.message}
                </p>
              ) : null}
            </div>
          ),
          progressCell: (
            <div className="space-y-1">
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
                aria-invalid={Boolean(progressIssue)}
                aria-describedby={progressIssue ? `monthly-validation-${item.id}-progress` : undefined}
                className={cn(
                  'h-9 border-slate-200 bg-white text-right text-sm num-mono',
                  progressIssue && 'border-red-500 ring-1 ring-red-200',
                )}
              />
              {progressIssue ? (
                <p id={`monthly-validation-${item.id}-progress`} role="alert" className="text-xs text-red-600">
                  {progressIssue.message}
                </p>
              ) : null}
            </div>
          ),
        }
      }),
    [
      baseRows,
      commitFieldEdit,
      handleDraftChange,
      handleInputKeyDown,
      inputDrafts,
      monthlyItemMap,
      monthlyValidationCellMap,
      readOnly,
    ],
  )

  const handleExportMonthlyPlan = useCallback(async (scope: ExportScope, format: ExportFormat) => {
    const exportItems = [...editorItems].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    const visibleExtraColumns = readPlanningFieldConfigExtraColumns(
      fieldConfigStorageKey,
      fieldRegistry.registry?.registryVersion,
    )
    const exportRows = buildMonthlyExportData(exportItems, scope, visibleExtraColumns)
    const exportedColumnCount = getMonthlyExportColumns(scope, visibleExtraColumns).length
    const monthLabel = formatMonthLabel(activePlan?.month ?? selectedMonth)
    const date = new Date().toISOString().slice(0, 10)

    try {
      await writePlanningTableExport({
        fileNameBase: `${currentProject?.name || '项目'}_${monthLabel}_月度计划_${date}`,
        format,
        rows: exportRows,
        sheetName: '月度计划',
      })
      toast({
        title: '导出已生成',
        description: `已导出当前 ${exportItems.length} 行、${exportedColumnCount} 个字段。`,
      })
    } catch (error) {
      toast({
        title: '导出失败',
        description: getApiErrorMessage(error, '导出月度计划失败，请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [
    activePlan?.month,
    currentProject?.name,
    editorItems,
    fieldConfigStorageKey,
    fieldRegistry.registry?.registryVersion,
    selectedMonth,
    toast,
  ])

  const handleUpdateCells = useCallback(
    (updates: PlanningTreeCellUpdate[]) => {
      if (readOnly || updates.length === 0) return

      const updatesByRow = updates.reduce((map, update) => {
        const list = map.get(update.rowId) ?? []
        list.push(update)
        map.set(update.rowId, list)
        return map
      }, new Map<string, PlanningTreeCellUpdate[]>())

      const nextItems = editorItems.map((item) => {
        const rowUpdates = updatesByRow.get(item.id)
        if (!rowUpdates?.length) return item

        let nextItem = { ...item }
        rowUpdates.forEach((update) => {
          const field = mapMonthlyCellKey(update.field)
          const value = update.value.trim()
          if (field === 'title') {
            nextItem = { ...nextItem, title: value || nextItem.title }
          } else if (field === 'start') {
            nextItem = { ...nextItem, planned_start_date: normalizeMonthlyClipboardDate(value) }
          } else if (field === 'end') {
            nextItem = { ...nextItem, planned_end_date: normalizeMonthlyClipboardDate(value) }
          } else if (field === 'progress') {
            nextItem = { ...nextItem, target_progress: normalizeMonthlyClipboardProgress(value) }
          } else if (field === 'milestone') {
            const normalized = value.toLowerCase()
            const isMilestone = Boolean(value) && !['0', 'false', 'no', 'n'].includes(normalized)
            nextItem = { ...nextItem, is_milestone: isMilestone }
          }
        })
        return nextItem
      })

      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
    },
    [commitEditorSnapshot, editorItems, normalizedSelectedItemIds, readOnly],
  )

  const handleFillRows = useCallback(
    (rowIds: string[], row: PlanningTreeClipboardRow) => {
      if (readOnly || rowIds.length === 0) return

      const targetIds = new Set(rowIds)
      const nextItems = editorItems.map((item) => {
        if (!targetIds.has(item.id)) return item

        return {
          ...item,
          title: row.title || item.title,
          planned_start_date:
            row.plannedStartDate !== undefined
              ? normalizeMonthlyClipboardDate(row.plannedStartDate)
              : item.planned_start_date ?? null,
          planned_end_date:
            row.plannedEndDate !== undefined
              ? normalizeMonthlyClipboardDate(row.plannedEndDate)
              : item.planned_end_date ?? null,
          target_progress:
            row.targetProgress !== undefined
              ? normalizeMonthlyClipboardProgress(row.targetProgress)
              : item.target_progress ?? null,
          is_milestone: row.isMilestone ?? item.is_milestone,
        }
      })

      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
    },
    [commitEditorSnapshot, editorItems, normalizedSelectedItemIds, readOnly],
  )

  const handlePasteRows = useCallback(
    (pastedRows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => {
      if (readOnly || !activePlan || pastedRows.length === 0) return

      const anchorIndex = anchorRowId
        ? editorItems.findIndex((item) => item.id === anchorRowId)
        : editorItems.length - 1
      const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : editorItems.length
      const createdItems: MonthlyPlanDetail['items'] = pastedRows.map((row, index) => ({
        id: `local-monthly-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        project_id: projectId,
        monthly_plan_version_id: activePlan.id,
        baseline_item_id: null,
        carryover_from_item_id: null,
        source_task_id: null,
        title: row.title || `新增月度计划项 ${index + 1}`,
        planned_start_date: normalizeMonthlyClipboardDate(row.plannedStartDate),
        planned_end_date: normalizeMonthlyClipboardDate(row.plannedEndDate),
        target_progress: normalizeMonthlyClipboardProgress(row.targetProgress),
        current_progress: null,
        sort_order: insertIndex + index,
        is_milestone: Boolean(row.isMilestone),
        is_critical: false,
        commitment_status: 'planned',
        notes: null,
        engineering_category_id: null,
        wbs_node_type: null,
        wbs_path: null,
        is_wbs_summary: null,
        is_executable: true,
        standard_work_code: null,
        standard_work_name: null,
      }))

      const nextItems = [
        ...editorItems.slice(0, insertIndex),
        ...createdItems,
        ...editorItems.slice(insertIndex),
      ].map((item, index) => ({ ...item, sort_order: index }))
      commitEditorSnapshot(nextItems, createdItems.map((item) => item.id))
    },
    [activePlan, commitEditorSnapshot, editorItems, projectId, readOnly],
  )

  const handleDeleteRows = useCallback(
    (rowIds: string[]) => {
      if (readOnly || rowIds.length === 0) return

      const idsToDelete = new Set(rowIds)
      rowIds.forEach((rowId) => {
        const startIndex = rows.findIndex((row) => row.id === rowId)
        if (startIndex < 0) return

        const baseDepth = rows[startIndex]?.depth ?? 0
        for (let index = startIndex + 1; index < rows.length; index += 1) {
          const row = rows[index]
          if (!row || (row.depth ?? 0) <= baseDepth) break
          idsToDelete.add(row.id)
        }
      })

      const nextItems = editorItems
        .filter((item) => !idsToDelete.has(item.id))
        .map((item, index) => ({ ...item, sort_order: index }))
      const nextSelectedIds = normalizedSelectedItemIds.filter((itemId) => !idsToDelete.has(itemId))
      commitEditorSnapshot(nextItems, nextSelectedIds)
    },
    [commitEditorSnapshot, editorItems, normalizedSelectedItemIds, readOnly, rows],
  )

  const handleGenerateDraft = async () => {
    if (!projectId) return

    setActionLoading('generate')
    try {
      const created = await apiPost<MonthlyPlanDetail>('/api/monthly-plans/generate', {
        project_id: projectId,
        month: selectedMonth,
        title: `${formatMonthLabel(selectedMonth)} 月度计划`,
      })

      setSelectedMonth(created.month)
      setPlanVersions(sortMonthlyPlanVersions([
        created,
        ...planVersions.filter((version) => version.id !== created.id),
      ]))
      setActivePlan(created)
      setIsEditing(true)
      setDraftStatus('editing')
      setValidationIssues(
        buildValidationIssues({
          month: created.month,
          plan: created,
          blockingSummary: buildMonthlyConfirmSummary(created, tasks),
        }),
      )
      setStatusNotice(null)
      setConfirmState('ready')

      toast({
        title: `已生成 ${formatMonthLabel(created.month)} 计划`,
        description: `${formatMonthLabel(created.month)} 已按当前项目数据自动生成，可直接复核和调整。`,
      })
      void loadMonthlyContext({ preferredMonth: created.month, preferredId: created.id, preserveNotice: true })
    } catch (error) {
      toast({
        title: `生成 ${formatMonthLabel(selectedMonth)} 计划失败`,
        description: getApiErrorMessage(error, `系统暂时无法生成 ${formatMonthLabel(selectedMonth)} 计划。`),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const getAlignedMonthlyItemsBeforeSave = useCallback(async () => {
    if (!projectId || !activePlan?.id) return editorItems

    const latest = await apiGet<MonthlyPlanDetail>(
      `/api/monthly-plans/${activePlan.id}?project_id=${encodeURIComponent(projectId)}`,
    )
    const mergeResult = mergePlanningItemsBeforeSave(activePlan.items ?? [], editorItems, latest.items ?? [], {
      fields: conflictFields,
      fieldGroups: conflictFieldGroups,
    })
    if (mergeResult.conflictCount > 0) {
      const labels = mergeResult.conflictLabels.slice(0, 3).join('、')
      throw new Error(`${mergeResult.conflictCount} 个月度计划条目刚被他人更新，请确认后继续${labels ? `：${labels}` : ''}`)
    }

    if (mergeResult.mergedCount > 0) {
      applyEditorSnapshot({ items: mergeResult.items, selectedIds: normalizedSelectedItemIds })
      toast({
        title: '已合并协作更新',
        description: `已自动合并他人的 ${mergeResult.mergedCount} 处无关修改。`,
      })
    }

    return mergeResult.items
  }, [activePlan, applyEditorSnapshot, conflictFieldGroups, conflictFields, editorItems, normalizedSelectedItemIds, projectId, toast])

  const getMonthlyFieldRegistryVersion = useCallback(async () => {
    const currentVersion = fieldRegistry.registry?.registryVersion
    if (currentVersion) return currentVersion

    const refreshedRegistry = await fieldRegistry.refetch()
    const refreshedVersion = refreshedRegistry?.registryVersion
    if (!refreshedVersion) {
      throw new Error('字段注册表未加载，无法保存月度计划')
    }
    return refreshedVersion
  }, [fieldRegistry.refetch, fieldRegistry.registry?.registryVersion])

  const applyCommittedMonthlyRows = useCallback((
    savedItems: MonthlyPlanDetail['items'],
    selectedIds: string[] = normalizedSelectedItemIds,
  ) => {
    const savedSelectedIds = normalizeSelectedIds(selectedIds, savedItems.map((item) => item.id))
    const savedSnapshot = { items: savedItems, selectedIds: savedSelectedIds }
    initialSnapshotRef.current = savedSnapshot
    historyRef.current = [savedSnapshot]
    historyCursorRef.current = 0
    applyEditorSnapshot(savedSnapshot)
    forceHistoryRender((value) => value + 1)
    return savedSnapshot
  }, [applyEditorSnapshot, normalizedSelectedItemIds])

  const commitMonthlyEditorItems = useCallback(async (
    nextItems: MonthlyPlanDetail['items'],
    selectedIds: string[] = normalizedSelectedItemIds,
  ) => {
    if (!projectId || !activePlan) throw new Error('月度计划不存在，无法保存')
    const operations = buildMonthlyCommitOperations(activePlan.items ?? [], nextItems)
    const fieldRegistryVersion = await getMonthlyFieldRegistryVersion()
    const committed = await commitPlanningTable<MonthlyPlanDetail['items'][number]>({
      projectId,
      surface: 'monthly_plan',
      resourceId: activePlan.id,
      baseVersion: activePlan.version ?? undefined,
      fieldRegistryVersion,
      operations,
      clientContext: {
        rollupRows: nextItems,
      },
    })
    applyCommittedMonthlyRows(committed.rows, selectedIds)
    return committed
  }, [
    activePlan,
    applyCommittedMonthlyRows,
    getMonthlyFieldRegistryVersion,
    normalizedSelectedItemIds,
    projectId,
  ])

  const handleSaveDraft = async () => {
    if (!projectId || !activePlan) return
    if (monthlyTableValidation.blockCount > 0) {
      const firstBlocker = monthlyTableValidation.issues.find((issue) => issue.severity === 'block_save')
        ?? monthlyTableValidation.issues[0]
      if (firstBlocker) focusMonthlyValidationIssue(firstBlocker)
      toast({
        title: '请先处理表格校核问题',
        description: `还有 ${monthlyTableValidation.blockCount} 项阻断问题，处理后再保存月度计划。`,
        variant: 'destructive',
      })
      return
    }

    setActionLoading('save')
    setDraftStatus('saving')
    try {
      const alignedItems = await getAlignedMonthlyItemsBeforeSave()
      await commitMonthlyEditorItems(alignedItems)
      setIsEditing(false)
      setStatusNotice('已保存 ' + formatMonthLabel(activePlan.month) + ' 月度计划 v' + activePlan.version + '。')
      setConfirmState('ready')
      toast({
        title: '月度计划已保存',
        description: '已保存当前月度计划草稿，未创建新版本。',
      })
    } catch (error) {
      setDraftStatus('editing')
      toast({
        title: '保存月度计划失败',
        description: getApiErrorMessage(error, '月度计划保存失败，请稍后再试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchShiftDates = async () => {
    if (!activePlan || readOnly || normalizedSelectedItemIds.length === 0) return

    const raw = window.prompt('请输入顺延天数，支持负数回拨。', '1')
    if (raw === null) return
    const shiftDays = Number(raw)
    if (!Number.isFinite(shiftDays) || shiftDays === 0) {
      toast({
        title: '请输入有效天数',
        description: '顺延天数必须是非 0 数字。',
        variant: 'destructive',
      })
      return
    }

    setActionLoading('batch_shift')
    try {
      const selectedIds = new Set(normalizedSelectedItemIds)
      const nextItems = editorItems.map((item) => selectedIds.has(item.id)
        ? {
          ...item,
          planned_start_date: shiftMonthlyPlanDate(item.planned_start_date, shiftDays),
          planned_end_date: shiftMonthlyPlanDate(item.planned_end_date, shiftDays),
        }
        : item)
      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
      toast({
        title: '已批量顺延日期',
        description: `已加入本轮编辑：${normalizedSelectedItemIds.length} 个选中条目。`,
      })
    } catch (error) {
      toast({
        title: '批量顺延失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchTargetProgress = async () => {
    if (!activePlan || readOnly || normalizedSelectedItemIds.length === 0) return

    const raw = window.prompt('请输入目标进度（0-100）', '100')
    if (raw === null) return
    const targetProgress = Number(raw)
    if (!Number.isFinite(targetProgress) || targetProgress < 0 || targetProgress > 100) {
      toast({
        title: '请输入有效进度',
        description: '目标进度必须在 0-100 之间。',
        variant: 'destructive',
      })
      return
    }

    setActionLoading('batch_progress')
    try {
      const selectedIds = new Set(normalizedSelectedItemIds)
      const nextItems = editorItems.map((item) => selectedIds.has(item.id)
        ? { ...item, target_progress: targetProgress }
        : item)
      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
      toast({
        title: '已批量更新目标进度',
        description: `已加入本轮编辑：${normalizedSelectedItemIds.length} 个选中条目。`,
      })
    } catch (error) {
      toast({
        title: '批量进度更新失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleBatchNotes = async () => {
    if (!activePlan || readOnly || normalizedSelectedItemIds.length === 0) return

    const notes = window.prompt('请输入要批量写入的备注：', '')
    if (notes === null) return
    const trimmedNotes = notes.trim()
    if (!trimmedNotes) {
      toast({
        title: '备注不能为空',
        description: '请输入要批量写入的备注内容。',
        variant: 'destructive',
      })
      return
    }

    setActionLoading('batch_notes')
    try {
      const selectedIds = new Set(normalizedSelectedItemIds)
      const nextItems = editorItems.map((item) => selectedIds.has(item.id)
        ? { ...item, notes: trimmedNotes }
        : item)
      commitEditorSnapshot(nextItems, normalizedSelectedItemIds)
      toast({
        title: '已批量写入备注',
        description: `已加入本轮编辑：${normalizedSelectedItemIds.length} 个选中条目。`,
      })
    } catch (error) {
      toast({
        title: '批量备注失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmPlan = async () => {
    if (!activePlan || readOnly || hasUnsavedMonthlyEdits) return
    if (totalConfirmBlockingIssueCount > 0) {
      const firstBlocker = monthlyTableValidation.issues.find((issue) => issue.severity === 'block_save')
        ?? monthlyTableValidation.issues[0]
      if (firstBlocker) focusMonthlyValidationIssue(firstBlocker)
      toast({
        title: '确认前仍有阻断项',
        description: `还有 ${totalConfirmBlockingIssueCount} 项问题需要先处理。`,
        variant: 'destructive',
      })
      return
    }

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
        description: formatMonthLabel(confirmed.month) + ' 已确认，可用于 ' + formatMonthLabel(confirmed.month) + ' 执行兑现。',
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

  if (!currentProject) {
    return (
      <div className="page-shell">
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
        quickAvailable={quickAvailable}
        monthLabel={formatMonthLabel(activePlan?.month ?? selectedMonth)}
      />

      {!confirmReminder && priorityBanner ? (
        <Card
          data-testid="monthly-plan-priority-banner"
          className={
            priorityBanner.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50 ring-1 ring-inset ring-emerald-200'
              : priorityBanner.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 ring-1 ring-inset ring-amber-200'
                : 'border-slate-200 bg-slate-50 ring-1 ring-inset ring-slate-200'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
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
              ? 'border-emerald-200 bg-emerald-50 ring-1 ring-inset ring-emerald-200'
              : confirmReminder.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 ring-1 ring-inset ring-amber-200'
                : 'border-slate-200 bg-slate-50 ring-1 ring-inset ring-slate-200'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
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
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                    </Badge>
                    <Badge variant={readOnly ? 'outline' : 'secondary'}>{readOnly ? '已确认只读' : '可编辑'}</Badge>
                    {isDirty ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">月份与计划信息</h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`切换到${formatMonthLabel(shiftMonth(selectedMonth, -1))}`}
                  onClick={() => void handleMonthSwitch(shiftMonth(selectedMonth, -1))}
                >
                  &lt;上一月
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`切换到${formatMonthLabel(shiftMonth(selectedMonth, 1))}`}
                  onClick={() => void handleMonthSwitch(shiftMonth(selectedMonth, 1))}
                >
                  下一月&gt;
                </Button>
              </div>

              <div className="grid gap-5 md:grid-cols-5">
                {monthWindow.map((month) => {
                  const versions = planVersions.filter((item) => item.month === month)
                  const version =
                    versions.find((item) => item.status !== 'draft') ??
                    versions.find((item) => item.status === 'draft') ??
                    versions[0] ??
                    null
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
                            : 'bg-slate-100 text-slate-700'
                  return (
                    <Button variant="ghost"
                      key={month}
                      type="button"
                      onClick={() => void handleMonthSwitch(month)}
                      className={`h-auto min-h-14 w-full whitespace-normal rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 shadow-[var(--el-1)]'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                      } ${isFutureMonth && !active ? 'border-slate-300 bg-white text-slate-700' : ''}`}
                    >
                      <div className="flex w-full min-w-0 items-center justify-between gap-2">
                        <div className={`truncate text-xs font-semibold ${isFutureMonth && !active ? 'text-slate-700' : 'text-slate-600'}`}>
                          {formatMonthLabel(month)}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                              {version ? getMonthlyPlanStatusLabel(version.status) : '未生成'}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{getMonthlyPlanStatusTooltip(version?.status, month)}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="mt-2 flex w-full flex-wrap items-center gap-2 text-xs text-slate-700">
                        <span>{version ? `v${version.version}` : '待生成'}</span>
                        {version ? (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                            待关账 {version.pending_closeout_count ?? 0}
                          </Badge>
                        ) : null}
                        {monthState === 0 ? <Badge variant="outline">当前</Badge> : null}
                        {isFutureMonth ? <Badge variant="outline">未来</Badge> : null}
                      </div>
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div data-testid="monthly-plan-info-bar" className="grid gap-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)] md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">当前月份</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{formatMonthLabel(selectedMonth)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">当前版本</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{activePlan ? `v${activePlan.version}` : '待生成'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">执行条目</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{activePlan?.items.length ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 ring-1 ring-inset ring-amber-200">
              <div className="text-xs text-amber-700">确认校核</div>
              <div className="mt-1 text-lg font-semibold text-amber-900">
                {totalConfirmBlockingIssueCount}
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

  const sectionHeader = null

  const main = noBaselineIntercept ? (
    <Card className="border-amber-200 bg-amber-50 ring-1 ring-inset ring-amber-200">
      <CardContent className="space-y-4 p-5 text-center">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-amber-900">当前项目还没有正式基线</div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            className="gap-2"
            onClick={() => navigateWithGuard(`/projects/${projectId}/planning/baseline`)}
          >
            <FileDiff className="h-4 w-4" />
            去建立项目基线
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
        <Card className="border-emerald-200 bg-emerald-50 ring-1 ring-inset ring-emerald-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="space-y-1">
              <div className="text-sm font-medium text-emerald-900">
                {activePlan.status === 'pending_realign'
                  ? '待处理调整'
                  : activePlan.status === 'archived'
                    ? '已归档'
                    : activePlan.status === 'closed'
                      ? '已关账'
                      : '已确认'}
              </div>
              <div className="text-sm text-emerald-700">{buildMonthlyStatusNotice(activePlan.status, activePlan.month)}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {activePlan.status === 'draft' ? (
        <Card data-testid="monthly-plan-batch-strip" className="border-slate-100 bg-slate-50 shadow-[var(--el-1)]">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">月度计划</Badge>
                  <Badge variant="outline">{isDirty ? '有未保存调整' : '暂无调整'}</Badge>
                </div>
                <div className="text-sm font-medium text-slate-900">表格调整与确认</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={!canUndo || readOnly}>
                        撤销
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Ctrl+Z</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button type="button" variant="outline" size="sm" onClick={handleRedo} disabled={!canRedo || readOnly}>
                        重做
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Ctrl+Y</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
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
                <div className="mt-1 text-sm font-semibold text-slate-900">{quickAvailable ? '可快速确认' : '需补齐后确认'}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleBatchShiftDates()}
                disabled={readOnly || normalizedSelectedItemIds.length === 0}
                loading={actionLoading === 'batch_shift'}
              >
                批量顺延
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleBatchTargetProgress()}
                disabled={readOnly || normalizedSelectedItemIds.length === 0}
                loading={actionLoading === 'batch_progress'}
              >
                批量目标进度
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleBatchNotes()}
                disabled={readOnly || normalizedSelectedItemIds.length === 0}
                loading={actionLoading === 'batch_notes'}
              >
                批量备注
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div data-testid="monthly-plan-tree-block" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">L4 编制层</Badge>
              <Badge variant="outline">{rows.length} 项</Badge>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="monthly-plan-export-open"
            disabled={editorItems.length === 0}
            onClick={() => setExportOpen(true)}
          >
            导出
          </Button>
        </div>
        <PlanningValidationStrip
          testId="monthly-validation-strip"
          issues={monthlyTableValidation.issues}
          blockCount={monthlyTableValidation.blockCount}
          confirmCount={monthlyTableValidation.confirmCount}
          hintCount={monthlyTableValidation.hintCount}
          onLocateIssue={focusMonthlyValidationIssue}
        />
        <BaselineTreeEditor
          title={`${formatMonthLabel(activePlan.month)} 月度计划表`}
          description=""
          summaryLabel="月度计划"
          unlockLabel=""
          treeTitle={`${formatMonthLabel(activePlan.month)} 执行计划`}
          treeDescription=""
          treeEmptyLabel="当前月份还没有月度计划条目"
          testId="monthly-plan-tree-editor"
          treeVariant="monthly"
          rows={rows}
          selectedCount={normalizedSelectedItemIds.length}
          readOnly={readOnly}
          isDirty={Boolean(isDirty)}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onPasteRows={handlePasteRows}
          onDeleteRows={handleDeleteRows}
          onFillRows={handleFillRows}
          onUpdateCells={handleUpdateCells}
          onUndo={handleUndo}
          onRedo={handleRedo}
          presence={monthlyPresence}
          onActiveCellChange={monthlyPresence.setEditingCell}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onSave={() => void handleSaveDraft()}
          rowMode={isEditing ? 'edit' : 'read'}
          fieldRegistryFields={fieldRegistry.registry?.fields}
          fieldRegistryVersion={fieldRegistry.registry?.registryVersion}
          fieldConfigStorageKey={fieldConfigStorageKey}
        />
      </div>
    </div>
  ) : (
    <EmptyState
      icon={CalendarDays}
      title={`${formatMonthLabel(selectedMonth)} 尚未生成月度计划`}
      description={`生成后可在月度计划表中维护 ${formatMonthLabel(selectedMonth)} 承诺与执行项。`}
      className="rounded-2xl empty-state-frame border-slate-300 bg-slate-50 p-5"
      action={(
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            data-testid="monthly-plan-generate-empty"
            onClick={() => void handleGenerateDraft()}
            loading={actionLoading === 'generate'}
            disabled={!canEdit}
          >
            生成 {formatMonthLabel(selectedMonth)} 计划
          </Button>
          <Button type="button" variant="outline" onClick={() => navigateWithGuard(`/projects/${projectId}/planning/baseline`)}>
            去看项目基线
          </Button>
        </div>
      )}
    />
  )

  const aside = noBaselineIntercept || activePlan?.status !== 'draft'
    ? undefined
    : (
        <div data-testid="monthly-plan-review-block" className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{pageError}</AlertDescription>
            </Alert>
          ) : null}

          <ProjectRemainingForecastCard
            projectId={projectId}
            targetEndDate={currentProject.planned_end_date ?? currentProject.end_date ?? null}
            testId="monthly-project-remaining-forecast"
            title="月计划承诺对项目剩余工期的影响"
            description="确认月计划前，统一校验项目级剩余工期、关键路径、外部接口硬约束与当月承诺。"
            density="compact"
            tone="monthly"
            onOpenAcceleration={() => navigateWithGuard(`/projects/${projectId}/gantt`)}
          />

          <Card data-testid="monthly-plan-confirm-summary" variant="detail">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">L5 校验与确认区</Badge>
                    <Badge variant="outline">7 项确认摘要</Badge>
                  </div>
                </div>
                <Badge variant={quickAvailable ? 'secondary' : 'outline'}>{quickAvailable ? '快确认可用' : '需补齐'}</Badge>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { key: 'total', label: '条目总数', value: confirmSummary.totalItemCount },
                  { key: 'new', label: `${formatMonthLabel(activePlan.month)} 新增`, value: confirmSummary.newlyAddedCount },
                  { key: 'carry', label: '自动滚入', value: confirmSummary.autoRolledInCount },
                  { key: 'remove', label: '待移出数', value: confirmSummary.pendingRemovalCount },
                  { key: 'milestone', label: '关键里程碑数', value: confirmSummary.milestoneCount },
                  { key: 'date', label: '目标时间调整', value: confirmSummary.dateAdjustmentCount },
                  { key: 'progress', label: '目标进度调整', value: confirmSummary.progressAdjustmentCount },
                ].map((item) => (
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
            issues={combinedValidationIssues}
            canQuickConfirm={quickAvailable}
            onOpenTasks={() => navigateWithGuard(`/projects/${projectId}/gantt`)}
            onOpenRisks={() => navigateWithGuard(`/projects/${projectId}/risks`)}
          />

          <ValidationPanel title="确认前校核区" issues={combinedValidationIssues} />

          <Card variant="detail">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">计划分析入口</div>
                <Badge variant="outline">共享分析</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-0 justify-between gap-2"
                  data-testid="monthly-plan-open-progress-deviation"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=progress_deviation`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileDiff className="h-4 w-4" />
                    <span className="min-w-0 truncate">查看偏差分析</span>
                  </span>
                  <Badge variant="outline" className="shrink-0">Reports</Badge>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-0 justify-between gap-2"
                  data-testid="monthly-plan-open-progress-report"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=progress`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Layers3 className="h-4 w-4" />
                    <span className="min-w-0 truncate">查看偏差分析</span>
                  </span>
                  <Badge variant="outline" className="shrink-0">Progress</Badge>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card variant="detail">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">当前版本摘要</div>
                <Badge variant="outline">{activePlan ? `v${activePlan.version}` : '待生成'}</Badge>
              </div>
              <div className="text-sm leading-6 text-slate-600">
                {activePlan
                  ? `${formatMonthLabel(activePlan.month)} · ${getMonthlyPlanStatusLabel(activePlan.status)} · ${activePlan.items.length} 项`
                  : '当前月份还没有真实版本。'}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">最近更新时间</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(activePlan?.updated_at) ?? '暂无'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">{formatMonthLabel(shiftMonth(selectedMonth, 1))} 入口</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{formatMonthLabel(shiftMonth(selectedMonth, 1))}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )

  const monthlyShellMetrics = (
    <>
      <MetricCard eyebrow="TASKS" title={`${formatMonthLabel(activePlan?.month ?? selectedMonth)} 任务`} value={editorItems.length} hint={formatMonthLabel(activePlan?.month ?? selectedMonth)} tone="primary" />
      <MetricCard eyebrow="DONE" title="已完成" value={editorItems.filter((item) => (item.target_progress ?? 0) >= 100).length} hint="目标进度 100%" tone="success" />
      <MetricCard eyebrow="ACTIVE" title="进行中" value={editorItems.filter((item) => (item.target_progress ?? 0) > 0 && (item.target_progress ?? 0) < 100).length} hint="系统生成" tone="info" />
      <MetricCard eyebrow="RISK" title="逾期项" value={totalConfirmBlockingIssueCount} hint="确认阻断项" tone={totalConfirmBlockingIssueCount > 0 ? 'danger' : 'slate'} />
    </>
  )

  return (
    <PlanningPageShell
      projectName={currentProject.name ?? '项目'}
      title="月度计划"
      description=""
      tabs={tabs}
      metrics={monthlyShellMetrics}
      className="pb-20"
      actions={
        <div data-testid="monthly-plan-edit-actions" className="flex flex-wrap items-center gap-2">
          {activePlan?.status === 'draft' ? (
            <>
              {isDirty ? <Badge variant="secondary">有未保存调整</Badge> : null}
              <Button
                type="button"
                size="sm"
                className="gap-2"
                data-testid="monthly-plan-save-draft-header"
                onClick={() => void handleSaveDraft()}
                loading={actionLoading === 'save'}
                disabled={readOnly}
              >
                保存调整
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-2"
                data-testid="monthly-plan-confirm-draft-header"
                onClick={() => {
                  setConfirmMode(quickAvailable ? 'quick' : 'standard')
                  setConfirmState('ready')
                  setConfirmOpen(true)
                }}
                disabled={readOnly || !canStandardConfirm}
              >
                确认 {formatMonthLabel(activePlan.month)} 计划
              </Button>
            </>
          ) : null}
          {activePlan ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="monthly-plan-open-closeout"
              onClick={() =>
                navigateWithGuard(
                  `/projects/${projectId}/planning/monthly?view=closeout&month=${encodeURIComponent(activePlan.month)}`,
                )
              }
            >
              {formatMonthLabel(activePlan.month)} 关账
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4 pb-24">
        <PlanningPageLayout summary={summary} sectionHeader={sectionHeader} main={main} aside={aside} />
      </div>

      {activePlan?.status === 'draft' ? (
        <MonthlyPlanBottomBar
          draftStatus={draftStatus}
          quickAvailable={quickAvailable}
          canSaveDraft={!readOnly}
          canStandardConfirm={canOpenStandardConfirm}
          selectedCount={normalizedSelectedItemIds.length}
          isDirty={Boolean(isDirty)}
          canUndo={canUndo}
          canRedo={canRedo}
          blockingIssueCount={totalConfirmBlockingIssueCount}
          onSaveDraft={() => void handleSaveDraft()}
          readOnly={readOnly}
          onUndo={handleUndo}
          onRedo={handleRedo}
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
        monthLabel={formatMonthLabel(activePlan?.month ?? selectedMonth)}
        summary={confirmDialogSummary}
        canConfirm={canStandardConfirm && totalConfirmBlockingIssueCount === 0}
        onConfirm={() => void handleConfirmPlan()}
        onRetry={() => void handleConfirmPlan()}
      />
      <PlanningDraftResumeDialog
        open={resumeDialogOpen}
        onOpenChange={setResumeDialogOpen}
        snapshot={resumeSnapshot}
        onContinue={handleContinueDraftWorkspace}
        onDiscard={handleDiscardDraftWorkspace}
      />
      <PlanningExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(scope, format) => {
          void handleExportMonthlyPlan(scope, format)
        }}
        projectName={currentProject.name ?? ''}
        pageName={`${formatMonthLabel(activePlan?.month ?? selectedMonth)} 月度计划`}
      />
      <ConfirmActionDialog
        {...unsavedChangesGuard.confirmDialog}
        testId="monthly-plan-unsaved-changes-dialog"
      />
    </PlanningPageShell>
  )
}

export default function MonthlyPlanPage() {
  const location = useLocation()
  const closeoutState = location.state as { closeoutCompleted?: boolean } | null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const closeoutView = searchParams.get('view') === 'closeout'

  if (closeoutView) {
    return <CloseoutWorkspace embedded />
  }

  return <MonthlyPlanEditorPage key={closeoutState?.closeoutCompleted ? 'closeout-completed' : 'monthly-editor'} />
}
