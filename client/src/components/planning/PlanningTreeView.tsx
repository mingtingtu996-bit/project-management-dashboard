import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { CardHead } from '@/components/ui/card-head'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PlanningColumnConfig, type ColumnConfigItem } from '@/components/planning/PlanningColumnConfig'
import { DurationSuggestionTooltip } from '@/components/planning/DurationSuggestionTooltip'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { PlanItemKindBadge, PlanItemTagBadge, getPlanItemKindBorderClass } from '@/components/planning/PlanItemKindBadge'
import { PlanningGuideBubble } from '@/components/planning/PlanningGuideBubble'
import { PlanningPresenceBar, type PresenceSignal } from '@/components/planning/PlanningPresenceBar'
import { PlanningRowGutter } from '@/components/planning/PlanningRowGutter'
import { KeyboardShortcuts, type PlanningShortcut } from '@/components/planning/KeyboardShortcuts'
import { getReconcileRowStyle, type ReconcilePhase } from '@/components/planning/ReconcileBanner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  TreeDiamondIcon,
  getTreeDensityRowClass,
  getTreeIndentPx,
  type SharedTreeDensity,
  type SharedTreeRowKind,
  type SharedTreeViewMode,
} from '@/components/tree/SharedTreePrimitives'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import { readAvailableDurationValue } from '@/lib/durationMetric'
import { cn } from '@/lib/utils'
import {
  PLAN_ITEM_KIND_OPTIONS,
  ROW_PROJECTION_LABELS,
  type LinkedProjectionSource,
  type PlanItemKind,
  type ProgressMode,
  normalizeRowProjectionMode,
  type ScheduleParticipation,
  type ScopeExpansionMode,
} from '@/lib/planItemSemantics'
import type { DurationSuggestion, DurationSuggestionQuery, TaskDurationForecast } from '@/services/durationSuggestionsApi'
import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import type { PlanningFieldConfigSurface } from '@/lib/planningFieldConfig'
import {
  dismissPlanningGuidance,
  getPlanningGuidanceStorageKeys,
  markPlanningGuidanceSeen,
  recordPlanningGuidanceCompletion,
  shouldShowPlanningGuidance,
  type PlanningGuideKey,
} from '@/lib/planningGuidance'
import { useCurrentUser } from '@/hooks/useStore'
import {
  evaluateDeleteDisposition,
  getDeleteButtonDisabled,
  getDeleteButtonLabel,
  getDeleteTooltip,
} from '@/components/planning/PlanningDeleteGuard'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  ClipboardPaste,
  Columns3,
  CornerDownRight,
  Copy,
  ExternalLink,
  FileText,
  FileWarning,
  Filter,
  History,
  Lock,
  Milestone,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

export interface PlanningTreeRow {
  id: string
  title: string
  subtitle?: string
  depth: number
  sequenceLabel?: string
  wbsCode?: string
  engineeringCategoryId?: string | null
  engineeringCategoryType?: string | null
  wbsNodeType?: string | null
  categoryType?: string | null
  isExecutable?: boolean | null
  rowType?: Extract<SharedTreeRowKind, 'structure' | 'leaf' | 'milestone'>
  statusLabel?: string
  rowProjectionMode?: string | null
  executionPhase?: string | null
  executionLane?: string | null
  executionSortKey?: number | null
  workfaceId?: string | null
  planItemKind?: PlanItemKind | string | null
  relationRole?: string | null
  planItemTags?: string[]
  progressMode?: ProgressMode | string | null
  scheduleParticipation?: ScheduleParticipation | string | null
  scopeExpansionMode?: ScopeExpansionMode | string | null
  linkedProjectionSource?: LinkedProjectionSource | null
  isMilestone?: boolean
  isCritical?: boolean
  selected?: boolean
  locked?: boolean
  isNew?: boolean
  isPersisted?: boolean
  hasUpgradeChain?: boolean
  hasConditions?: boolean
  hasBlockages?: boolean
  hasAcceptanceLinks?: boolean
  childCount?: number
  startDateLabel?: string
  endDateLabel?: string
  durationLabel?: string
  durationSuggestion?: DurationSuggestion | null
  durationSuggestionQuery?: DurationSuggestionQuery | null
  durationForecast?: TaskDurationForecast | null
  durationRiskRangeLabel?: string
  criticalFloatLabel?: string
  durationAssetEvidenceLabel?: string
  sequencingBasis?: 'execution_phase_order_fallback' | 'heuristic_stagger' | null
  progressLabel?: string
  assigneeLabel?: string
  unitLabel?: string
  scopeLabel?: string
  groupLabel?: string
  spatialPath?: {
    building: { key: string; label: string; missing: boolean }
    floor: { key: string; label: string; missing: boolean }
    zone: { key: string; label: string; missing: boolean }
  }
  parentLabel?: string
  notesLabel?: string
  mappingStatus?: string | null
  startingLineClass?: 'history' | 'in_progress' | 'future' | null
  reconcilePhase?: ReconcilePhase | null
  titleCell?: ReactNode
  startCell?: ReactNode
  endCell?: ReactNode
  progressCell?: ReactNode
  assigneeCell?: ReactNode
  unitCell?: ReactNode
  scopeCell?: ReactNode
  extra?: ReactNode
  inlinePanel?: ReactNode
  rowClassName?: string
  onOpenDetail?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onPromote?: () => void
  onDemote?: () => void
  onAddSibling?: () => void
  onAddChild?: () => void
  onSmartExpand?: () => void
  onToggleMilestone?: () => void
  onOpenCriticalPath?: () => void
  onChangeNodeType?: (nodeType: string) => void
  onMarkCriticalPathAttention?: () => void
  onInsertBeforeChain?: () => void
  onInsertAfterChain?: () => void
  onRemoveCriticalPathAttention?: () => void
  onRemoveCriticalPathInsert?: () => void
}

export interface PlanningTreeClipboardRow {
  title: string
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  targetProgress?: number | null
  assigneeLabel?: string | null
  unitLabel?: string | null
  scopeLabel?: string | null
  depth?: number
  isMilestone?: boolean
}

export type PlanningTreeCellKey = 'title' | 'start' | 'end' | 'progress' | 'assignee' | 'unit' | 'scope' | 'milestone'

export interface PlanningTreeCellUpdate {
  rowId: string
  field: PlanningTreeCellKey
  value: string
}

export interface PlanningTreePresenceState {
  viewerCount?: number
  viewerNames?: string[]
  editingByRowId?: Record<string, string[]>
}

export interface PlanningTreeFieldConfigField {
  key: string
  label: string
  displayGroup?: string
  group?: string
  defaultVisibleIn?: string[]
  surfaceLabel?: Partial<Record<PlanningFieldConfigSurface, string>>
}

// v1.4.7.1: View mode and row mode types
// v1.4.7.3: gantt view added for task_list surface only
export type PlanningViewMode = 'list' | 'card' | 'detail' | 'gantt'
export type PlanningRowMode = 'read' | 'edit'
export type PlanningTreeDensity = SharedTreeDensity

interface PlanningTreeViewProps {
  title: string
  description?: string
  rows: PlanningTreeRow[]
  selectedCount?: number
  onToggleRow?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  emptyLabel?: string
  readOnly?: boolean
  embedded?: boolean
  variant?: 'default' | 'schedule' | 'baseline' | 'monthly' | 'task'
  toolbar?: boolean
  showEditModeToolbar?: boolean
  showBusinessActionsSlot?: boolean
  toolbarMode?: 'full' | 'task_read'
  density?: PlanningTreeDensity
  onPasteRows?: (rows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => void
  onDeleteRows?: (rowIds: string[]) => void
  onFillRows?: (rowIds: string[], row: PlanningTreeClipboardRow) => void
  onUpdateCells?: (updates: PlanningTreeCellUpdate[]) => void
  presence?: PlanningTreePresenceState
  onActiveCellChange?: (cell: { rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null) => void
  defaultCollapseDepth?: number
  onReconcileEntryAction?: (rowId: string, action: 'merge_to_standard' | 'keep_both' | 'replace_with_standard') => void
  // v1.4.7.1: read/edit mode + view system
  rowMode?: PlanningRowMode
  viewMode?: PlanningViewMode
  onViewModeChange?: (mode: PlanningViewMode) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void | Promise<void>
  onSave?: () => void | Promise<void>
  saveDisabled?: boolean
  dirtyRowIds?: Set<string>
  dirtyCellMap?: Map<string, Set<string>> // rowId -> dirty field keys
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  fieldRegistryFields?: PlanningTreeFieldConfigField[]
  fieldRegistryVersion?: string
  fieldConfigStorageKey?: string | null
  // v1.4.7.3: gantt view + slot system
  enabledViews?: PlanningViewMode[]
  defaultView?: PlanningViewMode
  ganttRenderer?: (props: {
    rows: PlanningTreeRow[]
    selectedRowIds: string[]
    onRowClick: (rowId: string) => void
    scale: 'day' | 'week' | 'month'
    onScaleChange?: (scale: 'day' | 'week' | 'month') => void
    readOnly: boolean
  }) => ReactNode
  readBusinessActionsSlot?: ReactNode
  editBusinessActionsSlot?: ReactNode
}

type SortMode = 'default' | 'name' | 'date' | 'progress'
type FacetMode = 'all' | 'division' | 'subdivision' | 'task' | 'milestone'
type ExtraColumnKey =
  | 'progress'
  | 'type'
  | 'critical'
  | 'duration_risk'
  | 'float'
  | 'duration_asset_evidence'
  | 'parent'
  | 'level'
  | 'notes'
  | 'actions'

const EXTRA_COLUMN_KEYS = new Set<ExtraColumnKey>([
  'progress',
  'type',
  'critical',
  'duration_risk',
  'float',
  'duration_asset_evidence',
  'parent',
  'level',
  'notes',
  'actions',
])

const REGISTRY_EXTRA_COLUMN_KEY_BY_FIELD_KEY: Record<string, ExtraColumnKey | undefined> = {
  progress: 'progress',
  target_progress: 'progress',
  wbs_node_type: 'type',
  category_type: 'type',
  is_critical: 'critical',
  duration_risk_range: 'duration_risk',
  duration_risk_p20_days: 'duration_risk',
  duration_risk_p50_days: 'duration_risk',
  duration_risk_p80_days: 'duration_risk',
  total_float_days: 'float',
  free_float_days: 'float',
  duration_asset_evidence: 'duration_asset_evidence',
  duration_asset_calculation: 'duration_asset_evidence',
  standard_task_metadata: 'duration_asset_evidence',
  notes: 'notes',
}

function isExtraColumnKey(value: unknown): value is ExtraColumnKey {
  return EXTRA_COLUMN_KEYS.has(value as ExtraColumnKey)
}

function getFieldConfigSurfaceFromVariant(variant: PlanningTreeViewProps['variant']): PlanningFieldConfigSurface {
  if (variant === 'monthly') return 'monthly_plan'
  if (variant === 'task') return 'task_list'
  return 'baseline'
}

function rowHasDescendant(rows: PlanningTreeRow[], index: number) {
  const next = rows[index + 1]
  return Boolean(next && next.depth > rows[index].depth)
}

export function initializeCollapsedRows(rows: PlanningTreeRow[], defaultCollapseDepth?: number): Set<string> {
  if (!defaultCollapseDepth || defaultCollapseDepth < 1) return new Set()
  return new Set(
    rows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => row.depth >= defaultCollapseDepth && rowHasDescendant(rows, index))
      .map(({ row }) => row.id),
  )
}

function getStartingLineRowClass(startingLineClass?: PlanningTreeRow['startingLineClass']) {
  if (startingLineClass === 'history') return 'bg-slate-50/90 border-l-slate-300'
  if (startingLineClass === 'in_progress') return 'bg-blue-50/60 border-l-blue-500'
  return ''
}

const BASE_COLUMNS = [
  { key: 'wbs', label: '序号', width: '7.5rem' },
  { key: 'title', label: '任务名称', width: '24rem' },
  { key: 'start', label: '开始', width: '10rem', className: 'text-right num-mono' },
  { key: 'end', label: '完成', width: '10rem', className: 'text-right num-mono' },
  { key: 'duration', label: '计划工期', width: '7rem', className: 'text-right num-mono' },
  { key: 'assignee', label: '责任单位/人', width: '10rem' },
  { key: 'milestone', label: '里程碑', width: '6rem', className: 'text-center' },
  { key: 'status', label: '状态/差异', width: '12rem' },
] as const
const SCHEDULE_COLUMNS = [
  { key: 'wbs', label: '序号', width: '7.5rem' },
  { key: 'title', label: '任务名称', width: 'minmax(16rem, 30rem)' },
  { key: 'start', label: '计划开始', width: 'minmax(10rem, 11rem)', className: 'text-right num-mono' },
  { key: 'end', label: '计划完成', width: 'minmax(10rem, 11rem)', className: 'text-right num-mono' },
  { key: 'duration', label: '计划工期', width: '7rem', className: 'text-right num-mono' },
] as const
const MONTHLY_COLUMNS = [
  { key: 'wbs', label: '序号', width: '7.5rem' },
  { key: 'title', label: '任务名称', width: 'minmax(16rem, 30rem)' },
  { key: 'start', label: '计划开始', width: 'minmax(10rem, 11rem)', className: 'text-right num-mono' },
  { key: 'end', label: '计划完成', width: 'minmax(10rem, 11rem)', className: 'text-right num-mono' },
  { key: 'duration', label: '剩余工期', width: '8.5rem', className: 'text-right num-mono' },
  { key: 'progress', label: '目标进度', width: '7rem', className: 'text-right num-mono' },
] as const
const TASK_COLUMNS = [
  { key: 'wbs', label: '序号', width: '5.5rem' },
  { key: 'title', label: '任务名称', width: 'minmax(22rem, 34rem)' },
  { key: 'start', label: '计划开始', width: '8.25rem', className: 'text-right num-mono' },
  { key: 'end', label: '计划完成', width: '8.25rem', className: 'text-right num-mono' },
  { key: 'duration', label: '工期判断', width: '8.5rem', className: 'text-right num-mono' },
  { key: 'progress', label: '进度', width: '5rem', className: 'text-right num-mono' },
  { key: 'status', label: '状态/事项', width: '12rem' },
  { key: 'assignee', label: '责任人', width: '7rem' },
  { key: 'unit', label: '责任单位', width: '7.5rem' },
  { key: 'scope', label: '工程对象', width: '9rem' },
] as const
const EXTRA_COLUMNS: Array<{ key: ExtraColumnKey; label: string; width: string }> = [
  { key: 'progress', label: '目标进度', width: '5.625rem' },
  { key: 'type', label: '类型', width: '6.25rem' },
  { key: 'critical', label: '关键路径', width: '6.875rem' },
  { key: 'duration_risk', label: '工期风险', width: '13rem' },
  { key: 'float', label: '关键路径浮时', width: '13rem' },
  { key: 'duration_asset_evidence', label: '工期资产依据', width: '16rem' },
  { key: 'parent', label: '父级', width: '8.75rem' },
  { key: 'level', label: '层级', width: '5rem' },
  { key: 'notes', label: '备注', width: '11.25rem' },
  { key: 'actions', label: '操作', width: '8rem' },
]
const WBS_NODE_TYPE_OPTIONS = [
  { value: 'division', label: getWbsNodeTypeLabel('division') },
  { value: 'sub_division', label: getWbsNodeTypeLabel('sub_division') },
  { value: 'item_work', label: getWbsNodeTypeLabel('item_work') },
  { value: 'process', label: getWbsNodeTypeLabel('process') },
  { value: 'activity_step', label: getWbsNodeTypeLabel('activity_step') },
] as const
type PlanningWbsNodeType = (typeof WBS_NODE_TYPE_OPTIONS)[number]['value']
type PlanningHierarchyRank = PlanningWbsNodeType | 'milestone' | 'default'
const WBS_NODE_TYPE_SET = new Set(WBS_NODE_TYPE_OPTIONS.map((option) => option.value))
const INITIAL_TABLE_RENDER_COUNT = 120
const TABLE_RENDER_CHUNK_SIZE = 240
const PLANNING_TREE_SHORTCUTS: PlanningShortcut[] = [
  { key: 'C', ctrlKey: true, description: '复制当前选中行或当前视图', action: () => undefined },
  { key: 'V', ctrlKey: true, description: '粘贴 TSV 行列内容', action: () => undefined },
  { key: 'F', ctrlKey: true, description: '聚焦查找当前计划表', action: () => undefined },
  { key: 'Z', ctrlKey: true, description: '撤销本轮编辑', action: () => undefined },
  { key: 'Y', ctrlKey: true, description: '重做本轮编辑', action: () => undefined },
  { key: 'Z', ctrlKey: true, shiftKey: true, description: '重做本轮编辑', action: () => undefined },
  { key: 'Enter', description: '移动到下一行', action: () => undefined },
  { key: 'Tab', description: '移动到下一个可编辑字段', action: () => undefined },
  { key: 'Escape', description: '取消编辑或退出当前输入', action: () => undefined },
]

function normalizePlanningWbsType(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return WBS_NODE_TYPE_SET.has(normalized as (typeof WBS_NODE_TYPE_OPTIONS)[number]['value']) ? normalized : null
}

function getPlanningRowWbsType(row: PlanningTreeRow) {
  return normalizePlanningWbsType(row.wbsNodeType)
    ?? normalizePlanningWbsType(row.engineeringCategoryType)
    ?? normalizePlanningWbsType(row.categoryType)
}

function getPlanningRowWbsLabel(row: PlanningTreeRow, fallbackKind: SharedTreeRowKind) {
  const wbsType = getPlanningRowWbsType(row)
  if (wbsType) {
    return getWbsNodeTypeLabel(wbsType, fallbackKind === 'milestone' ? '里程碑' : '施工任务')
  }
  if (fallbackKind === 'milestone') return '里程碑'
  if (row.isExecutable === false) return '结构层级'
  if (row.depth >= 3) return '施工任务'
  return '分项工程'
}

function getPlanningRowTitleClass(row: PlanningTreeRow, rowKind: SharedTreeRowKind) {
  if (rowKind === 'milestone') return 'font-medium text-amber-800'
  switch (getPlanningRowWbsType(row)) {
    case 'division':
      return 'text-base font-semibold text-slate-950'
    case 'sub_division':
      return 'text-sm font-semibold text-slate-900'
    case 'item_work':
      return 'text-sm font-medium text-slate-900'
    case 'process':
      return 'text-sm font-normal text-slate-800'
    case 'activity_step':
      return 'text-xs font-normal text-slate-700'
    default:
      return cn(
        row.depth <= 1 && 'font-semibold',
        row.depth === 2 && 'font-medium',
        row.depth >= 3 && 'font-normal',
      )
  }
}

const PLANNING_ROW_HIERARCHY_STYLE: Record<PlanningHierarchyRank, {
  rowClass: string
  gutterClass: string
  wbsBadgeClass: string
  indentLineClass: string
  iconClass: string
}> = {
  division: {
    rowClass: 'bg-slate-100/90 hover:bg-slate-100',
    gutterClass: 'text-slate-700',
    wbsBadgeClass: 'border border-slate-300 bg-white text-slate-900 shadow-sm',
    indentLineClass: 'before:bg-slate-300',
    iconClass: 'border-slate-400 bg-white text-slate-600',
  },
  sub_division: {
    rowClass: 'bg-slate-50/95 hover:bg-slate-100/80',
    gutterClass: 'text-slate-600',
    wbsBadgeClass: 'border border-slate-200 bg-white text-slate-800 shadow-sm',
    indentLineClass: 'before:bg-slate-300',
    iconClass: 'border-slate-300 bg-white text-slate-500',
  },
  item_work: {
    rowClass: 'bg-slate-50/70 hover:bg-slate-50',
    gutterClass: 'text-slate-600',
    wbsBadgeClass: 'border border-slate-200 bg-slate-50 text-slate-700',
    indentLineClass: 'before:bg-slate-200',
    iconClass: 'border-slate-300 bg-slate-50 text-slate-500',
  },
  process: {
    rowClass: 'bg-white hover:bg-slate-50/70',
    gutterClass: 'text-slate-500',
    wbsBadgeClass: 'border border-slate-200 bg-white text-slate-600',
    indentLineClass: 'before:bg-slate-200',
    iconClass: 'text-slate-300',
  },
  activity_step: {
    rowClass: 'bg-white hover:bg-blue-50/30',
    gutterClass: 'text-slate-500',
    wbsBadgeClass: 'border border-blue-100 bg-blue-50/50 text-slate-700',
    indentLineClass: 'before:bg-blue-100',
    iconClass: 'text-blue-300',
  },
  milestone: {
    rowClass: 'bg-amber-50/60 hover:bg-amber-50',
    gutterClass: 'text-amber-700',
    wbsBadgeClass: 'border border-amber-200 bg-amber-50 text-amber-800',
    indentLineClass: 'before:bg-amber-200',
    iconClass: 'text-amber-600',
  },
  default: {
    rowClass: 'bg-white hover:bg-slate-50/60',
    gutterClass: 'text-slate-500',
    wbsBadgeClass: 'border border-slate-200 bg-white text-slate-600',
    indentLineClass: 'before:bg-slate-200',
    iconClass: 'text-slate-300',
  },
}

function getPlanningRowHierarchyRank(row: PlanningTreeRow, rowKind: SharedTreeRowKind): PlanningHierarchyRank {
  if (rowKind === 'milestone' || row.isMilestone) return 'milestone'
  return (getPlanningRowWbsType(row) as PlanningWbsNodeType | null) ?? 'default'
}

function getPlanningRowHierarchyStyle(row: PlanningTreeRow, rowKind: SharedTreeRowKind) {
  const rank = getPlanningRowHierarchyRank(row, rowKind)
  return {
    rank,
    ...PLANNING_ROW_HIERARCHY_STYLE[rank],
  }
}

type TaskIssueChip = {
  key: string
  label: string
  toneClass: string
}

function getTaskIssueChips(row: PlanningTreeRow): TaskIssueChip[] {
  const chips: TaskIssueChip[] = []
  if (row.hasBlockages) {
    chips.push({ key: 'blockage', label: '阻碍', toneClass: 'border-rose-200 bg-rose-50 text-rose-700' })
  }
  if (row.planItemTags?.includes('危大')) {
    chips.push({ key: 'major-risk', label: '危大', toneClass: 'border-rose-200 bg-rose-50 text-rose-700' })
  }
  if (row.isCritical) {
    chips.push({ key: 'critical', label: '关键', toneClass: 'border-amber-200 bg-amber-50 text-amber-700' })
  }
  if (row.hasConditions) {
    chips.push({ key: 'condition', label: '条件', toneClass: 'border-amber-200 bg-amber-50 text-amber-700' })
  }
  if (row.hasAcceptanceLinks) {
    chips.push({ key: 'acceptance', label: '验收', toneClass: 'border-blue-200 bg-blue-50 text-blue-700' })
  }
  if (row.durationRiskRangeLabel) {
    chips.push({ key: 'duration-risk', label: '工期', toneClass: 'border-slate-200 bg-slate-50 text-slate-700' })
  }
  if (row.sequencingBasis === 'heuristic_stagger') {
    chips.push({
      key: 'heuristic-sequencing',
      label: '排序待确认',
      toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    })
  }
  return chips
}

function getPlanningRowProjectionMode(row: PlanningTreeRow) {
  return normalizeRowProjectionMode(row.rowProjectionMode) ?? 'schedule_row'
}

function getPlanningRowProjectionBadgeClass(row: PlanningTreeRow) {
  switch (getPlanningRowProjectionMode(row)) {
    case 'gate_marker':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'inline_control':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    case 'linked_projection':
      return 'border-slate-300 bg-slate-100 text-slate-600'
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700'
  }
}

function getPlanningRowProjectionBorderClass(row: PlanningTreeRow) {
  switch (getPlanningRowProjectionMode(row)) {
    case 'gate_marker':
      return 'border-l-amber-400'
    case 'inline_control':
      return 'border-l-slate-300'
    case 'linked_projection':
      return 'border-l-slate-400'
    default:
      return ''
  }
}

function normalizeClipboardText(value?: string | null) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim()
}

function parseProgressValue(value?: string | null) {
  const normalized = String(value ?? '').replace('%', '').trim()
  if (!normalized) return null
  const targetMatch = normalized.match(/目标\s*(\d{1,3})/)
  const numericMatches = normalized.match(/\d{1,3}/g)
  const parsed = Number.parseInt(targetMatch?.[1] ?? numericMatches?.[numericMatches.length - 1] ?? '', 10)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.min(100, parsed))
}

function normalizeClipboardCell(value?: string | null) {
  return String(value ?? '').replace(/\r/g, '').trim()
}

function parseClipboardMatrix(text: string) {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.map((line) => line.split('\t').map(normalizeClipboardCell))
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

export function serializePlanningRows(rows: PlanningTreeRow[], variant: PlanningTreeViewProps['variant']) {
  const isMonthly = variant === 'monthly'
  const isTask = variant === 'task'
  const headers = isTask
    ? ['WBS', '任务名称', '计划开始', '计划完成', '进度', '责任人', '责任单位', '工程对象', '层级', '里程碑']
    : isMonthly
      ? ['WBS', '任务名称', '计划开始', '计划完成', '目标进度', '层级', '里程碑']
      : ['WBS', '任务名称', '计划开始', '计划完成', '计划工期', '层级', '里程碑']

  const body = rows.map((row) => {
    const base = [
      normalizeClipboardText(row.wbsCode ?? row.sequenceLabel),
      normalizeClipboardText(row.title),
      normalizeClipboardText(row.startDateLabel),
      normalizeClipboardText(row.endDateLabel),
    ]

    if (isTask) {
      return [
        ...base,
        normalizeClipboardText(row.progressLabel),
        normalizeClipboardText(row.assigneeLabel),
        normalizeClipboardText(row.unitLabel),
        normalizeClipboardText(row.scopeLabel),
        String(row.depth ?? 1),
        row.isMilestone ? '是' : '',
      ].join('\t')
    }

    if (isMonthly) {
      return [
        ...base,
        normalizeClipboardText(row.progressLabel),
        String(row.depth ?? 1),
        row.isMilestone ? '是' : '',
      ].join('\t')
    }

    return [
      ...base,
      normalizeClipboardText(row.durationLabel),
      String(row.depth ?? 1),
      row.isMilestone ? '是' : '',
    ].join('\t')
  })

  return [headers.join('\t'), ...body].join('\n')
}

function parsePlanningRowsFromClipboard(text: string): PlanningTreeClipboardRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const firstCells = lines[0].split('\t').map((cell) => cell.trim())
  const hasHeader = firstCells.some((cell) => ['任务名称', '计划开始', '计划完成', '目标进度', '进度'].includes(cell))
  const headerCells = hasHeader ? firstCells.map((cell) => normalizeClipboardText(cell).toLowerCase()) : []
  const dataLines = hasHeader ? lines.slice(1) : lines
  const findHeaderIndex = (...labels: string[]) => {
    if (!hasHeader) return -1
    const normalizedLabels = labels.map((label) => normalizeClipboardText(label).toLowerCase())
    return headerCells.findIndex((cell) => normalizedLabels.includes(cell))
  }
  const readByHeader = (cells: string[], fallbackIndex: number, ...labels: string[]) => {
    const headerIndex = findHeaderIndex(...labels)
    return headerIndex >= 0 ? cells[headerIndex] : cells[fallbackIndex]
  }

  return dataLines
    .map<PlanningTreeClipboardRow | null>((line) => {
      const cells = line.split('\t')
      const maybeWbs = cells[0]?.trim() ?? ''
      const hasWbsLikePrefix = cells.length > 1 && (/^\d+(\.\d+)*$/.test(maybeWbs) || maybeWbs.toLowerCase() === 'wbs')
      const titleIndex = hasWbsLikePrefix ? 1 : 0
      const title = normalizeClipboardText(readByHeader(cells, titleIndex, '任务名称', '名称', '标题'))
      if (!title) return null

      const headerDepth = readByHeader(cells, -1, '层级', '级别')
      const depthRaw = headerDepth ?? cells.find((cell) => /^L?\d+$/.test(cell.trim()))
      const depth = depthRaw ? Math.max(1, Number.parseInt(depthRaw.replace(/^L/i, ''), 10)) : undefined
      const milestoneRaw = readByHeader(cells, -1, '里程碑')
      const isMilestone = milestoneRaw !== undefined
        ? ['是', 'Y', 'YES', 'M', '里程碑'].includes(milestoneRaw.trim().toUpperCase())
        : cells.some((cell) => ['是', 'Y', 'YES', 'M', '里程碑'].includes(cell.trim().toUpperCase()))
      const fallbackScope = normalizeClipboardText(cells[titleIndex + 6])
      const fallbackScopeLooksLikeLegacyDepth = /^L?\d+$/i.test(fallbackScope) && cells.length <= titleIndex + 8
      const scopeLabel = normalizeClipboardText(
        hasHeader
          ? readByHeader(cells, titleIndex + 6, '工程对象', '施工范围', '范围')
          : fallbackScopeLooksLikeLegacyDepth
            ? ''
            : fallbackScope,
      ) || null

      return {
        title,
        plannedStartDate: normalizeClipboardText(readByHeader(cells, titleIndex + 1, '计划开始', '开始')) || null,
        plannedEndDate: normalizeClipboardText(readByHeader(cells, titleIndex + 2, '计划完成', '完成')) || null,
        targetProgress: parseProgressValue(readByHeader(cells, titleIndex + 3, '目标进度', '进度')),
        assigneeLabel: normalizeClipboardText(readByHeader(cells, titleIndex + 4, '责任人')) || null,
        unitLabel: normalizeClipboardText(readByHeader(cells, titleIndex + 5, '责任单位')) || null,
        scopeLabel,
        depth,
        isMilestone,
      } satisfies PlanningTreeClipboardRow
    })
    .filter((row): row is PlanningTreeClipboardRow => Boolean(row))
}

export function PlanningTreeView({
  title,
  description,
  rows,
  selectedCount = 0,
  onToggleRow,
  onToggleAll,
  emptyLabel = '暂无计划条目',
  readOnly = false,
  embedded = false,
  variant,
  toolbar = true,
  showEditModeToolbar = true,
  showBusinessActionsSlot = true,
  toolbarMode,
  density = 'comfortable',
  onPasteRows,
  onDeleteRows,
  onFillRows,
  onUpdateCells,
  presence,
  onActiveCellChange,
  defaultCollapseDepth,
  onReconcileEntryAction,
  // v1.4.7.1: new mode props
  rowMode,
  viewMode: externalViewMode,
  onViewModeChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  saveDisabled,
  dirtyRowIds,
  dirtyCellMap,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  fieldRegistryFields,
  fieldRegistryVersion,
  fieldConfigStorageKey,
  // v1.4.7.3: gantt + slots
  enabledViews,
  defaultView,
  ganttRenderer,
  readBusinessActionsSlot,
  editBusinessActionsSlot,
}: PlanningTreeViewProps) {
  void description

  const isScheduleTable = variant === 'schedule' || variant === 'baseline' || (variant == null && embedded)
  const isMonthlyTable = variant === 'monthly'
  const isTaskTable = variant === 'task'
  const isPlanEntryTable = isScheduleTable || isMonthlyTable || isTaskTable
  const resolvedToolbarMode = toolbarMode ?? (isTaskTable && rowMode !== 'edit' ? 'task_read' : 'full')
  const isTaskReadToolbar = resolvedToolbarMode === 'task_read'
  const useLargeViewEditWorkspace = isTaskTable

  // v1.4.7.3: resolve enabled views and default view (after isTaskTable is assigned)
  const configuredEnabledViews = enabledViews ?? (isTaskTable ? ['list' as const, 'card' as const, 'detail' as const, 'gantt' as const] : ['list' as const, 'card' as const, 'detail' as const])
  const resolvedEnabledViews = configuredEnabledViews.filter((mode) => (
    mode !== 'gantt' || (isTaskTable && Boolean(ganttRenderer))
  ))
  const resolvedDefaultView = defaultView ?? (isTaskTable ? 'list' as const : 'card' as const)
  const safeDefaultView = resolvedEnabledViews.includes(resolvedDefaultView)
    ? resolvedDefaultView
    : resolvedEnabledViews[0] ?? 'list'
  const enabledViewSet = useMemo(() => new Set<PlanningViewMode>(resolvedEnabledViews), [resolvedEnabledViews])
  const currentUser = useCurrentUser()
  const guidanceSurface = getFieldConfigSurfaceFromVariant(variant)
  const guidanceStorageKeys = useMemo(
    () => getPlanningGuidanceStorageKeys(currentUser?.id, guidanceSurface),
    [currentUser?.id, guidanceSurface],
  )

  // v1.4.7.1: view mode state
  const [internalViewMode, setInternalViewMode] = useState<PlanningViewMode>(
    externalViewMode ?? (isPlanEntryTable ? safeDefaultView : 'list'),
  )
  const viewMode = externalViewMode ?? internalViewMode
  const effectiveRowMode: PlanningRowMode = rowMode ?? (readOnly ? 'read' : 'read')
  const isEditMode = effectiveRowMode === 'edit'
  const isReadMode = effectiveRowMode === 'read'
  const canEditTableCells = !readOnly && isEditMode

  const handleViewModeChange = (mode: PlanningViewMode) => {
    if (!enabledViewSet.has(mode)) return
    if (onViewModeChange) {
      onViewModeChange(mode)
    } else {
      setInternalViewMode(mode)
    }
  }

  useEffect(() => {
    if (!isPlanEntryTable || enabledViewSet.has(viewMode)) return
    handleViewModeChange(safeDefaultView)
  }, [enabledViewSet, isPlanEntryTable, safeDefaultView, viewMode])

  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterMilestone, setFilterMilestone] = useState(false)
  const [filterCritical, setFilterCritical] = useState(false)
  const [filterMappingAttention, setFilterMappingAttention] = useState(false)
  const [filterPlanKinds, setFilterPlanKinds] = useState<PlanItemKind[]>([])
  const [filterPlanTags, setFilterPlanTags] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [facetMode, setFacetMode] = useState<FacetMode>('all')
  const [extraColumns, setExtraColumns] = useState<ExtraColumnKey[]>([])
  const [fieldConfigOpen, setFieldConfigOpen] = useState(false)
  const [fieldConfigHydrated, setFieldConfigHydrated] = useState(false)
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null)
  const [renderLimit, setRenderLimit] = useState(INITIAL_TABLE_RENDER_COUNT)
  const [activeCell, setActiveCell] = useState<{ rowId: string; field: PlanningTreeCellKey } | null>(null)
  const [activeGuideKey, setActiveGuideKey] = useState<PlanningGuideKey | null>(null)
  const [ganttScale, setGanttScale] = useState<'day' | 'week' | 'month'>('week')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [largeViewOpen, setLargeViewOpen] = useState(false)
  const [editActionPending, setEditActionPending] = useState(false)
  const [unsavedEditGuardOpen, setUnsavedEditGuardOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const restoreViewAfterEditRef = useRef<PlanningViewMode | null>(null)
  const availablePlanTags = useMemo(() => (
    [...new Set(rows.flatMap((row) => row.planItemTags ?? []).filter(Boolean))]
  ), [rows])
  const togglePlanKindFilter = (kind: PlanItemKind, checked: boolean) => {
    setFilterPlanKinds((current) => checked ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))
  }
  const togglePlanTagFilter = (tag: string, checked: boolean) => {
    setFilterPlanTags((current) => checked ? [...new Set([...current, tag])] : current.filter((item) => item !== tag))
  }

  const defaultCollapsibleRowIds = useMemo(
    () => initializeCollapsedRows(rows, defaultCollapseDepth),
    [defaultCollapseDepth, rows],
  )
  const collapsedRowIds = useMemo(() => {
    const defaultCollapsed = defaultCollapsibleRowIds
    if (expandedRowIds.size === 0) return defaultCollapsed
    const next = new Set(defaultCollapsed)
    expandedRowIds.forEach((rowId) => next.delete(rowId))
    return next
  }, [defaultCollapsibleRowIds, expandedRowIds])

  const defaultCollapsedVisibleRows = useMemo(() => {
    if (collapsedRowIds.size === 0) return rows
    const visible: PlanningTreeRow[] = []
    const hiddenDepthStack: number[] = []

    rows.forEach((row) => {
      while (hiddenDepthStack.length > 0 && row.depth <= hiddenDepthStack[hiddenDepthStack.length - 1]) {
        hiddenDepthStack.pop()
      }
      if (hiddenDepthStack.length > 0) return
      visible.push(row)
      if (collapsedRowIds.has(row.id)) hiddenDepthStack.push(row.depth)
    })

    return visible
  }, [collapsedRowIds, rows])

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows]

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase()
      result = result.filter((row) => row.title.toLowerCase().includes(keyword))
    }

    if (filterMilestone) {
      result = result.filter((row) => row.isMilestone)
    }

    if (filterCritical) {
      result = result.filter((row) => row.isCritical)
    }

    if (filterMappingAttention) {
      result = result.filter((row) => row.mappingStatus)
    }

    if (filterPlanKinds.length > 0) {
      result = result.filter((row) => filterPlanKinds.includes((row.planItemKind ?? 'work_task') as PlanItemKind))
    }

    if (filterPlanTags.length > 0) {
      result = result.filter((row) => {
        const tags = row.planItemTags ?? []
        return filterPlanTags.some((tag) => tags.includes(tag))
      })
    }

    if (facetMode !== 'all') {
      result = result.filter((row) => {
        const rowKind: SharedTreeRowKind = row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')
        if (facetMode === 'milestone') return rowKind === 'milestone' || row.isMilestone
        if (facetMode === 'division') return row.depth <= 1 && rowKind !== 'milestone'
        if (facetMode === 'subdivision') return row.depth === 2 && rowKind !== 'milestone'
        if (facetMode === 'task') return row.depth >= 3 && rowKind !== 'milestone'
        return true
      })
    }

    const hasActiveSearchOrFilter = Boolean(
      searchKeyword.trim()
      || filterMilestone
      || filterCritical
      || filterMappingAttention
      || filterPlanKinds.length > 0
      || filterPlanTags.length > 0
      || facetMode !== 'all',
    )

    if (!hasActiveSearchOrFilter && sortMode === 'default') {
      result = defaultCollapsedVisibleRows
    }

    if (sortMode === 'name') {
      result.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortMode === 'date') {
      result.sort((a, b) => {
        const aDate = a.startDateLabel || ''
        const bDate = b.startDateLabel || ''
        return aDate.localeCompare(bDate)
      })
    } else if (sortMode === 'progress') {
      result.sort((a, b) => {
        const aProgress = Number.parseInt(a.progressLabel || '0', 10)
        const bProgress = Number.parseInt(b.progressLabel || '0', 10)
        return bProgress - aProgress
      })
    }

    return result
  }, [rows, searchKeyword, filterMilestone, filterCritical, filterMappingAttention, filterPlanKinds, filterPlanTags, facetMode, sortMode, defaultCollapsedVisibleRows])

  const activeFilterCount = (
    isPlanEntryTable
      ? [facetMode !== 'all', filterPlanKinds.length > 0, filterPlanTags.length > 0]
      : [filterMilestone, filterCritical, filterMappingAttention, filterPlanKinds.length > 0, filterPlanTags.length > 0, facetMode !== 'all']
  ).filter(Boolean).length

  const triggerPlanningGuide = (guideKey: PlanningGuideKey) => {
    const storageKey = guidanceStorageKeys[guideKey]
    if (!shouldShowPlanningGuidance(storageKey)) return
    markPlanningGuidanceSeen(storageKey)
    setActiveGuideKey(guideKey)
  }

  const dismissGuide = (guideKey: PlanningGuideKey) => {
    dismissPlanningGuidance(guidanceStorageKeys[guideKey])
    setActiveGuideKey((current) => (current === guideKey ? null : current))
  }

  const recordGuidanceCompletion = () => {
    Object.values(guidanceStorageKeys).forEach((storageKey) => {
      recordPlanningGuidanceCompletion(storageKey)
    })
    setActiveGuideKey((current) => (
      current && shouldShowPlanningGuidance(guidanceStorageKeys[current]) ? current : null
    ))
  }

  const renderGuideBubble = (guideKey: PlanningGuideKey, message: string, options?: { className?: string; arrowClassName?: string }) => (
    activeGuideKey === guideKey ? (
      <PlanningGuideBubble
        onDismiss={() => dismissGuide(guideKey)}
        className={options?.className}
        arrowClassName={options?.arrowClassName}
      >
        {message}
      </PlanningGuideBubble>
    ) : null
  )

  useEffect(() => {
    if (!isPlanEntryTable || !isReadMode) {
      setActiveGuideKey((current) => (current === 'start_edit' ? null : current))
      return
    }
    if (!shouldShowPlanningGuidance(guidanceStorageKeys.start_edit)) return
    markPlanningGuidanceSeen(guidanceStorageKeys.start_edit)
    setActiveGuideKey((current) => current ?? 'start_edit')
  }, [guidanceStorageKeys.start_edit, isPlanEntryTable, isReadMode])

  useEffect(() => {
    const totalRows = filteredAndSortedRows.length
    setRenderLimit(Math.min(totalRows, INITIAL_TABLE_RENDER_COUNT))
    if (totalRows <= INITIAL_TABLE_RENDER_COUNT) return undefined

    let cancelled = false
    let timer: number | null = null
    const scheduleNextChunk = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return
        startTransition(() => {
          setRenderLimit((current) => {
            const next = Math.min(totalRows, current + TABLE_RENDER_CHUNK_SIZE)
            if (next < totalRows) scheduleNextChunk()
            return next
          })
        })
      }, 16)
    }

    scheduleNextChunk()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [effectiveRowMode, filteredAndSortedRows.length, viewMode])

  const handleClearAll = () => {
    setSearchKeyword('')
    setFilterMilestone(false)
    setFilterCritical(false)
    setFilterMappingAttention(false)
    setFilterPlanKinds([])
    setFilterPlanTags([])
    setFacetMode('all')
    setSortMode('default')
  }

  const selectableRows = filteredAndSortedRows.filter((row) => !row.locked)
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => row.selected)
  const someSelected = selectableRows.some((row) => row.selected)
  const selectedVisibleRows = selectableRows.filter((row) => row.selected)
  const renderedRows = filteredAndSortedRows.slice(0, renderLimit)
  const hiddenRenderedCount = Math.max(0, filteredAndSortedRows.length - renderedRows.length)
  const clipboardRows = selectedVisibleRows.length > 0 ? selectedVisibleRows : selectableRows
  const anchorRowId = selectedVisibleRows[0]?.id ?? selectableRows[selectableRows.length - 1]?.id ?? null
  const renderValue = (value?: string | null) => {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
    return <span className="meta-muted">—</span>
  }
  const getDeleteDispositionForRow = (row: PlanningTreeRow) => evaluateDeleteDisposition({
    id: row.id,
    isNew: row.isNew,
    isPersisted: row.isPersisted,
    hasUpgradeChain: row.hasUpgradeChain,
    hasConditions: row.hasConditions,
    hasBlockages: row.hasBlockages,
    hasAcceptanceLinks: row.hasAcceptanceLinks,
    childCount: row.childCount,
  })
  const selectedDeleteDispositions = selectedVisibleRows.map(getDeleteDispositionForRow)
  const selectedDeleteBlocked = selectedDeleteDispositions.some(getDeleteButtonDisabled)
  const selectedDeleteTooltip = selectedDeleteDispositions
    .map(getDeleteTooltip)
    .find((message): message is string => Boolean(message))
  const baseColumns = isTaskTable ? TASK_COLUMNS : isMonthlyTable ? MONTHLY_COLUMNS : isScheduleTable ? SCHEDULE_COLUMNS : BASE_COLUMNS
  const fieldConfigSurface = getFieldConfigSurfaceFromVariant(variant)
  const registryExtraColumnMeta = useMemo(() => {
    const result = new Map<ExtraColumnKey, { label: string; group: string; defaultVisible: boolean }>()

    for (const field of fieldRegistryFields ?? []) {
      const columnKey = REGISTRY_EXTRA_COLUMN_KEY_BY_FIELD_KEY[field.key]
      if (!columnKey) continue

      const defaultVisible = field.defaultVisibleIn?.includes(fieldConfigSurface) ?? false
      const label = field.surfaceLabel?.[fieldConfigSurface] ?? field.label
      const group = field.displayGroup ?? field.group ?? 'other'
      const existing = result.get(columnKey)
      if (!existing || defaultVisible) {
        result.set(columnKey, { label, group, defaultVisible })
      }
    }

    return result
  }, [fieldConfigSurface, fieldRegistryFields])
  const extraColumnCandidates = useMemo(() => EXTRA_COLUMNS.map((column) => {
    const registryMeta = registryExtraColumnMeta.get(column.key)
    return {
      ...column,
      label: registryMeta?.label ?? column.label,
      group: registryMeta?.group ?? 'other',
      defaultVisible: registryMeta?.defaultVisible ?? false,
    }
  }), [registryExtraColumnMeta])
  const baseColumnKeys = useMemo(() => new Set<string>(baseColumns.map((column) => column.key)), [baseColumns])
  const availableExtraColumns = useMemo(() => extraColumnCandidates.filter((column) => {
    if (baseColumnKeys.has(column.key)) return false
    if (isPlanEntryTable && column.key === 'actions') return false
    return true
  }), [baseColumnKeys, extraColumnCandidates, isPlanEntryTable])
  const availableExtraColumnKeys = useMemo(
    () => new Set<ExtraColumnKey>(availableExtraColumns.map((column) => column.key)),
    [availableExtraColumns],
  )
  const defaultVisibleExtraColumns = useMemo(
    () => availableExtraColumns
      .filter((column) => column.defaultVisible)
      .map((column) => column.key),
    [availableExtraColumns],
  )
  const visibleExtraColumns = availableExtraColumns.filter((column) => extraColumns.includes(column.key))
  const activeExtraColumnCount = visibleExtraColumns.length
  const fieldConfigColumns = useMemo<ColumnConfigItem[]>(() => availableExtraColumns.map((column) => ({
    key: column.key,
    label: column.label,
    group: column.group,
    visible: extraColumns.includes(column.key),
  })), [availableExtraColumns, extraColumns])
  const editableCellKeys = baseColumns
    .map((column) => column.key)
    .filter((key): key is PlanningTreeCellKey => (
      key === 'title' ||
      key === 'start' ||
      key === 'end' ||
      key === 'progress' ||
      key === 'assignee' ||
      key === 'unit' ||
      key === 'scope' ||
      key === 'milestone'
    ))
  const gridColumns = [...baseColumns, ...visibleExtraColumns]
  const gridTemplateColumns = gridColumns.map((column) => column.width).join(' ')
  const gridMinWidth = isPlanEntryTable && visibleExtraColumns.length === 0
    ? '100%'
    : `calc(${gridColumns.map((column) => column.width).join(' + ')})`
  const scrollClassName = isPlanEntryTable
    ? isTaskTable
      ? 'max-h-[calc(100vh-15rem)] min-h-[34rem]'
      : 'max-h-[calc(100vh-15rem)] min-h-[20rem]'
    : embedded
      ? 'max-h-[calc(100vh-16rem)] min-h-[38rem] overflow-x-auto'
      : 'max-h-[35rem] overflow-x-auto'
  const largeViewScrollClassName = isPlanEntryTable
    ? 'h-[calc(100vh-13.5rem)] min-h-0'
    : 'h-[calc(100vh-13.5rem)] min-h-0 overflow-x-auto'
  const frozenTitleLeft = isTaskTable ? '5.5rem' : '7.5rem'
  const extraColumnLabels = Object.fromEntries(availableExtraColumns.map((column) => [column.key, column.label])) as Record<
    ExtraColumnKey,
    string
  >
  const otherViewerCount = Math.max(0, (presence?.viewerCount ?? 0) - 1)
  const otherViewerNames = presence?.viewerNames?.slice(0, 3) ?? []
  const presenceLabel = otherViewerCount > 0
    ? `${presence?.viewerCount ?? 0} 人正在查看`
    : null
  const presenceViewerState = readOnly
    ? 'readonly'
    : otherViewerCount > 1
      ? 'multiple'
      : otherViewerCount === 1
        ? 'single'
        : 'none'
  const dirtySignalCount = Math.max(dirtyRowIds?.size ?? 0, dirtyCellMap?.size ?? 0)
  const hasDirtySignal = isEditMode && dirtySignalCount > 0
  const presenceSignals = useMemo<PresenceSignal[]>(() => {
    const signals: PresenceSignal[] = []
    if (otherViewerCount > 0) {
      signals.push({
        level: 'L1',
        message: otherViewerNames.length > 0
          ? `${otherViewerNames.join('、')} 等 ${otherViewerCount} 人正在查看`
          : `${otherViewerCount} 人正在查看`,
      })
    }
    if (hasDirtySignal) {
      signals.push({
        level: 'L2',
        message: `${dirtySignalCount} 行有未保存更改`,
      })
    }
    return signals
  }, [dirtySignalCount, hasDirtySignal, otherViewerCount, otherViewerNames])

  useEffect(() => {
    if (!onActiveCellChange) return
    if (!activeCell) {
      onActiveCellChange(null)
      return
    }
    const row = filteredAndSortedRows.find((item) => item.id === activeCell.rowId)
    if (!row) {
      onActiveCellChange(null)
      return
    }
    onActiveCellChange({ rowId: row.id, field: activeCell.field, rowTitle: row.title })
  }, [activeCell, filteredAndSortedRows, onActiveCellChange])

  useEffect(() => {
    setFieldConfigHydrated(false)

    const defaultColumns = defaultVisibleExtraColumns.filter((key) => availableExtraColumnKeys.has(key))
    if (!fieldConfigStorageKey || typeof window === 'undefined') {
      setExtraColumns(defaultColumns)
      setFieldConfigHydrated(true)
      return
    }

    const snapshot = safeJsonParse<{
      registryVersion?: string | null
      extraColumns?: unknown
    } | null>(
      safeStorageGet(window.localStorage, fieldConfigStorageKey),
      null,
      fieldConfigStorageKey,
    )
    const canUseStoredSnapshot =
      snapshot &&
      (!fieldRegistryVersion || snapshot.registryVersion === fieldRegistryVersion)
    const storedColumns = canUseStoredSnapshot && Array.isArray(snapshot.extraColumns)
      ? snapshot.extraColumns
          .filter(isExtraColumnKey)
          .filter((key) => availableExtraColumnKeys.has(key))
      : null

    setExtraColumns(storedColumns ?? defaultColumns)
    setFieldConfigHydrated(true)
  }, [
    availableExtraColumnKeys,
    defaultVisibleExtraColumns,
    fieldConfigStorageKey,
    fieldRegistryVersion,
  ])

  useEffect(() => {
    if (!fieldConfigHydrated || !fieldConfigStorageKey || typeof window === 'undefined') return
    const normalizedColumns = extraColumns.filter((key) => availableExtraColumnKeys.has(key))
    safeStorageSet(
      window.localStorage,
      fieldConfigStorageKey,
      JSON.stringify({
        registryVersion: fieldRegistryVersion ?? null,
        extraColumns: normalizedColumns,
        updatedAt: new Date().toISOString(),
      }),
    )
  }, [
    availableExtraColumnKeys,
    extraColumns,
    fieldConfigHydrated,
    fieldConfigStorageKey,
    fieldRegistryVersion,
  ])

  const toggleExtraColumn = (key: ExtraColumnKey, checked: boolean) => {
    if (!availableExtraColumnKeys.has(key)) return
    setExtraColumns((current) => {
      if (checked) return current.includes(key) ? current : [...current, key]
      return current.filter((item) => item !== key)
    })
  }

  const getCellText = (row: PlanningTreeRow, field: PlanningTreeCellKey) => {
    if (field === 'title') return row.title
    if (field === 'start') return row.startDateLabel ?? ''
    if (field === 'end') return row.endDateLabel ?? ''
    if (field === 'progress') return row.progressLabel ?? ''
    if (field === 'assignee') return row.assigneeLabel ?? ''
    if (field === 'unit') return row.unitLabel ?? ''
    if (field === 'scope') return row.scopeLabel ?? ''
    if (field === 'milestone') return row.isMilestone ? 'M' : ''
    return ''
  }

  const writeClipboardText = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const copyRowsToClipboard = async () => {
    if (activeCell && selectedVisibleRows.length === 0) {
      const row = filteredAndSortedRows.find((item) => item.id === activeCell.rowId)
      if (row) {
        await writeClipboardText(getCellText(row, activeCell.field))
      }
      return
    }
    if (clipboardRows.length === 0) return
    const text = serializePlanningRows(clipboardRows, variant)
    await writeClipboardText(text)
  }

  const buildCellUpdatesFromClipboard = (text: string) => {
    if (!activeCell || !onUpdateCells) return []
    const matrix = parseClipboardMatrix(text)
    if (matrix.length === 0) return []
    const startRowIndex = selectableRows.findIndex((row) => row.id === activeCell.rowId)
    const startFieldIndex = editableCellKeys.findIndex((field) => field === activeCell.field)
    if (startRowIndex < 0 || startFieldIndex < 0) return []

    const updates: PlanningTreeCellUpdate[] = []
    matrix.forEach((cells, rowOffset) => {
      const targetRow = selectableRows[startRowIndex + rowOffset]
      if (!targetRow) return
      cells.forEach((value, fieldOffset) => {
        const field = editableCellKeys[startFieldIndex + fieldOffset]
        if (!field) return
        updates.push({ rowId: targetRow.id, field, value })
      })
    })
    return updates
  }

  const updateCellsFromText = (text: string) => {
    if (!canEditTableCells || !activeCell || !onUpdateCells) return false
    const updates = buildCellUpdatesFromClipboard(text)
    if (updates.length === 0) return false
    onUpdateCells(updates)
    const lastUpdate = updates[updates.length - 1]
    setActiveCell({ rowId: lastUpdate.rowId, field: lastUpdate.field })
    return true
  }

  const pasteRowsFromText = (text: string) => {
    if (updateCellsFromText(text)) {
      triggerPlanningGuide('paste')
      return
    }
    if (!canEditTableCells || !onPasteRows) return
    const parsedRows = parsePlanningRowsFromClipboard(text)
    if (parsedRows.length === 0) return
    if (parsedRows.length === 1 && selectedVisibleRows.length > 1 && onFillRows) {
      onFillRows(selectedVisibleRows.map((row) => row.id), parsedRows[0])
      triggerPlanningGuide('paste')
      return
    }
    onPasteRows(parsedRows, anchorRowId)
    triggerPlanningGuide('paste')
  }

  const pasteRowsFromClipboard = async () => {
    if (!canEditTableCells || (!onPasteRows && !onUpdateCells)) return
    try {
      const text = await navigator.clipboard?.readText()
      if (text) pasteRowsFromText(text)
    } catch {
      // Browser clipboard permissions can be denied; native paste still works through onPaste.
    }
  }

  const deleteSelectedRows = () => {
    if (!canEditTableCells || !onDeleteRows || selectedVisibleRows.length === 0) return
    onDeleteRows(selectedVisibleRows.map((row) => row.id))
  }

  const restoreReadViewAfterEdit = () => {
    const viewToRestore = restoreViewAfterEditRef.current
    restoreViewAfterEditRef.current = null
    if (viewToRestore && enabledViewSet.has(viewToRestore)) {
      handleViewModeChange(viewToRestore)
    }
  }

  const handleStartEdit = () => {
    if (viewMode === 'gantt') {
      restoreViewAfterEditRef.current = 'gantt'
      handleViewModeChange('list')
    }
    if (useLargeViewEditWorkspace) {
      setLargeViewOpen(true)
    }
    onStartEdit?.()
  }

  const handleSaveEdit = async (options?: { closeGuard?: boolean }) => {
    if (editActionPending) return
    setEditActionPending(true)
    try {
      recordGuidanceCompletion()
      await onSave?.()
      if (options?.closeGuard) {
        setUnsavedEditGuardOpen(false)
      }
      if (useLargeViewEditWorkspace) {
        setLargeViewOpen(false)
      }
      restoreReadViewAfterEdit()
    } catch {
      // The page-level save handler already owns toast/error reporting. Keep the edit workspace open.
    } finally {
      setEditActionPending(false)
    }
  }

  const handleCancelEdit = async (options?: { closeGuard?: boolean }) => {
    if (editActionPending) return
    setEditActionPending(true)
    try {
      await onCancelEdit?.()
      if (options?.closeGuard) {
        setUnsavedEditGuardOpen(false)
      }
      if (useLargeViewEditWorkspace) {
        setLargeViewOpen(false)
      }
      restoreReadViewAfterEdit()
    } finally {
      setEditActionPending(false)
    }
  }

  const handleLargeViewOpenChange = (open: boolean) => {
    if (!open && useLargeViewEditWorkspace && isEditMode) {
      if (hasDirtySignal) {
        setUnsavedEditGuardOpen(true)
        return
      }
      void handleCancelEdit()
      return
    }
    setLargeViewOpen(open)
  }

  const requestCloseLargeViewWorkspace = () => {
    handleLargeViewOpenChange(false)
  }

  const renderEditModeToolbar = (options?: { largeView?: boolean }) => {
    if (!showEditModeToolbar || !isPlanEntryTable || readOnly) return null
    const largeView = options?.largeView === true

    if (useLargeViewEditWorkspace && isEditMode && !largeView) return null

    return (
      <div className="flex items-center gap-1.5">
        {isReadMode ? (
          <div className="relative inline-flex">
            <Button type="button" size="sm" className="gap-1.5 h-8" onClick={handleStartEdit} data-testid="planning-start-edit">
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </Button>
            {renderGuideBubble('start_edit', '点击编辑后，任务列表将在计划表工作台中打开，像一张工程计划表一样维护。', {
              className: 'left-auto right-0',
              arrowClassName: 'left-auto right-5',
            })}
          </div>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => void handleSaveEdit()}
              disabled={saveDisabled || editActionPending}
              data-testid="planning-save"
            >
              保存
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void handleCancelEdit()} disabled={editActionPending} data-testid="planning-cancel">
              取消
            </Button>
            <div className="mx-0.5 h-5 w-px bg-slate-200" />
            <div className="relative inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={() => {
                  onUndo?.()
                  triggerPlanningGuide('undo')
                }}
                disabled={!canUndo}
                data-testid="planning-undo"
                title="撤销 Ctrl+Z"
              >
                撤销
              </Button>
              {renderGuideBubble('undo', '可撤销本次编辑中的修改。')}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={onRedo} disabled={!canRedo} data-testid="planning-redo" title="重做 Ctrl+Y">
              重做
            </Button>
          </>
        )}
      </div>
    )
  }

  useEffect(() => {
    if (!isEditMode || viewMode !== 'gantt') return
    restoreViewAfterEditRef.current = 'gantt'
    handleViewModeChange('list')
  }, [isEditMode, viewMode])

  const moveActiveCell = (rowDelta: number, fieldDelta: number) => {
    const baseCell = activeCell ?? {
      rowId: selectableRows[0]?.id ?? '',
      field: editableCellKeys[0] ?? 'title',
    }
    if (!baseCell.rowId) return

    const currentRowIndex = selectableRows.findIndex((row) => row.id === baseCell.rowId)
    const currentFieldIndex = editableCellKeys.findIndex((field) => field === baseCell.field)
    if (currentRowIndex < 0 || currentFieldIndex < 0) return

    let nextRowIndex = currentRowIndex + rowDelta
    let nextFieldIndex = currentFieldIndex + fieldDelta
    while (nextFieldIndex >= editableCellKeys.length) {
      nextFieldIndex = 0
      nextRowIndex += 1
    }
    while (nextFieldIndex < 0) {
      nextFieldIndex = editableCellKeys.length - 1
      nextRowIndex -= 1
    }
    nextRowIndex = Math.max(0, Math.min(selectableRows.length - 1, nextRowIndex))
    nextFieldIndex = Math.max(0, Math.min(editableCellKeys.length - 1, nextFieldIndex))
    const nextRow = selectableRows[nextRowIndex]
    const nextField = editableCellKeys[nextFieldIndex]
    if (nextRow && nextField) setActiveCell({ rowId: nextRow.id, field: nextField })
  }

  const handleTableKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const key = event.key.toLowerCase()

    if ((event.ctrlKey || event.metaKey) && key === 'f') {
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
      return
    }

    if (isInteractiveTarget(event.target)) return

    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        if (canRedo) onRedo?.()
      } else if (canUndo) {
        onUndo?.()
        triggerPlanningGuide('undo')
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault()
      if (canRedo) onRedo?.()
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 'c') {
      event.preventDefault()
      void copyRowsToClipboard()
      return
    }

    if ((event.ctrlKey || event.metaKey) && key === 'v') {
      event.preventDefault()
      void pasteRowsFromClipboard()
      return
    }

    if (event.key === 'Escape' && isEditMode && onCancelEdit) {
      event.preventDefault()
      if (useLargeViewEditWorkspace && largeViewOpen) {
        requestCloseLargeViewWorkspace()
      } else {
        void handleCancelEdit()
      }
      return
    }

    if (canEditTableCells && (event.key === 'Delete' || event.key === 'Backspace') && selectedVisibleRows.length > 0) {
      event.preventDefault()
      deleteSelectedRows()
      return
    }

    if (!activeCell || editableCellKeys.length === 0 || filteredAndSortedRows.length === 0) return

    if (event.key === 'Tab') {
      event.preventDefault()
      moveActiveCell(0, event.shiftKey ? -1 : 1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      moveActiveCell(event.shiftKey ? -1 : 1, 0)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActiveCell(1, 0)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActiveCell(-1, 0)
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveActiveCell(0, 1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveActiveCell(0, -1)
    }
  }

  const handleTablePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) return
    if (!canEditTableCells || (!onPasteRows && !onUpdateCells)) return
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    event.preventDefault()
    pasteRowsFromText(text)
  }

  const handleRowToggle = (rowId: string, shiftKey: boolean) => {
    if (readOnly) return
    const targetRow = filteredAndSortedRows.find((row) => row.id === rowId)
    if (targetRow?.locked) return
    if (!shiftKey || !lastSelectedRowId) {
      onToggleRow?.(rowId)
      setLastSelectedRowId(rowId)
      return
    }

    const startIndex = filteredAndSortedRows.findIndex((row) => row.id === lastSelectedRowId)
    const endIndex = filteredAndSortedRows.findIndex((row) => row.id === rowId)
    if (startIndex < 0 || endIndex < 0) {
      onToggleRow?.(rowId)
      setLastSelectedRowId(rowId)
      return
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    filteredAndSortedRows.slice(from, to + 1).forEach((row) => {
      if (!row.locked && !row.selected) onToggleRow?.(row.id)
    })
    setLastSelectedRowId(rowId)
  }

  const renderInlineAction = (
    label: string,
    onClick: (() => void) | undefined,
    icon: ReactNode,
    options?: { danger?: boolean; disabled?: boolean; tooltip?: string },
  ) => {
    if (!onClick) return null
    const disabled = Boolean(options?.disabled)

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={label}
            aria-disabled={disabled ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation()
              if (disabled) return
              onClick()
            }}
            className={cn(
              'h-7 w-7 shrink-0 rounded-md border border-transparent text-slate-500 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100',
              'hover:border-slate-200 hover:bg-white hover:text-slate-900',
              options?.danger && 'hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600',
              disabled && 'cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent hover:text-slate-500',
            )}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{options?.tooltip ?? label}</TooltipContent>
      </Tooltip>
    )
  }

  const renderPlanEntryActions = (row: PlanningTreeRow) => {
    const deleteDisposition = getDeleteDispositionForRow(row)
    const deleteLabel = getDeleteButtonLabel(deleteDisposition)

    if (isTaskTable) {
      const taskActions = [
        { key: 'edit', label: '编辑名称', onClick: row.onEdit },
        { key: 'add-sibling', label: '添加同级', onClick: row.onAddSibling },
        { key: 'add-child', label: '添加子级', onClick: row.onAddChild },
        { key: 'smart-expand', label: '智能展开', onClick: row.onSmartExpand },
        { key: 'milestone', label: row.isMilestone ? '取消里程碑' : '标记里程碑', onClick: row.onToggleMilestone },
        { key: 'critical-attention', label: '标记关键路径关注', onClick: row.onMarkCriticalPathAttention },
        { key: 'insert-before-chain', label: '在链路前插入', onClick: row.onInsertBeforeChain },
        { key: 'insert-after-chain', label: '在链路后插入', onClick: row.onInsertAfterChain },
        { key: 'remove-critical-attention', label: '移除关注标记', onClick: row.onRemoveCriticalPathAttention },
        { key: 'remove-critical-insert', label: '移除插链标记', onClick: row.onRemoveCriticalPathInsert },
        { key: 'promote', label: '升级', onClick: row.onPromote },
        { key: 'demote', label: '降级', onClick: row.onDemote },
        { key: 'move-up', label: '上移', onClick: row.onMoveUp },
        { key: 'move-down', label: '下移', onClick: row.onMoveDown },
      ].filter((item) => Boolean(item.onClick))
      const canDelete = Boolean(row.onDelete)

      if (taskActions.length === 0 && !canDelete) return null

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label="打开任务行操作" className="h-7 w-7 rounded-md" data-testid="gantt-task-row-action-trigger">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {taskActions.map((item) => (
              <DropdownMenuItem key={item.key} onClick={() => item.onClick?.()} data-testid={`gantt-task-row-action-${item.key}`}>
                {item.label}
              </DropdownMenuItem>
            ))}
            {canDelete ? (
              <>
                {taskActions.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  disabled={getDeleteButtonDisabled(deleteDisposition)}
                  className="text-rose-600 focus:text-rose-600"
                  data-testid="gantt-task-row-action-delete"
                  onClick={() => {
                    if (!getDeleteButtonDisabled(deleteDisposition)) row.onDelete?.()
                  }}
                >
                  {deleteLabel}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <div className="flex shrink-0 items-center gap-0.5">
        {renderInlineAction('编辑名称', row.onEdit, <Pencil className="h-3.5 w-3.5" />)}
        {renderInlineAction('添加同级', row.onAddSibling, <Plus className="h-3.5 w-3.5" />)}
        {renderInlineAction('添加子级', row.onAddChild, <CornerDownRight className="h-3.5 w-3.5" />)}
        {renderInlineAction('智能展开', row.onSmartExpand, <Sparkles className="h-3.5 w-3.5" />)}
        {renderInlineAction(row.isMilestone ? '取消里程碑' : '标记里程碑', row.onToggleMilestone, <Milestone className="h-3.5 w-3.5" />)}
        {renderInlineAction('升级', row.onPromote, <span className="text-xs font-semibold">升</span>)}
        {renderInlineAction('降级', row.onDemote, <span className="text-xs font-semibold">降</span>)}
        {renderInlineAction('上移', row.onMoveUp, <ArrowUp className="h-3.5 w-3.5" />)}
        {renderInlineAction('下移', row.onMoveDown, <ArrowDown className="h-3.5 w-3.5" />)}
        {renderInlineAction(deleteLabel, row.onDelete, <Trash2 className="h-3.5 w-3.5" />, {
          danger: true,
          disabled: getDeleteButtonDisabled(deleteDisposition),
          tooltip: getDeleteTooltip(deleteDisposition) ?? '删除后可撤销，保存后由后端治理',
        })}
      </div>
    )
  }

  const renderCellFrame = (
    row: PlanningTreeRow,
    field: PlanningTreeCellKey,
    children: ReactNode,
    className?: string,
    style?: CSSProperties,
  ) => {
    const isActive = activeCell?.rowId === row.id && activeCell.field === field
    const isDirtyCell = dirtyCellMap?.get(row.id)?.has(field) ?? false
    const interactive = !row.locked
    return (
      <div
        tabIndex={interactive ? 0 : -1}
        data-planning-cell={`${row.id}:${field}`}
        data-active-cell={isActive ? 'true' : undefined}
        data-dirty-cell={isDirtyCell ? 'true' : undefined}
        aria-readonly={!interactive || undefined}
        onClick={() => {
          if (interactive) setActiveCell({ rowId: row.id, field })
        }}
        onFocus={() => {
          if (interactive) setActiveCell({ rowId: row.id, field })
        }}
        className={cn(
          'outline-none transition-colors transition-shadow focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400',
          isDirtyCell && 'bg-amber-50/60 ring-1 ring-inset ring-amber-300',
          isActive && 'ring-2 ring-inset ring-blue-500/80',
          className,
        )}
        style={style}
      >
        {children}
      </div>
    )
  }

  const renderRowActions = (row: PlanningTreeRow) => {
    const hasReadOnlyActions = Boolean(row.onOpenDetail || row.onOpenCriticalPath)
    const hasEditActions = Boolean(
      row.onEdit ||
        row.onDelete ||
        row.onMoveUp ||
        row.onMoveDown ||
        row.onPromote ||
        row.onDemote ||
        row.onAddSibling ||
        row.onAddChild ||
        row.onSmartExpand ||
        row.onToggleMilestone ||
        row.onChangeNodeType ||
        row.onMarkCriticalPathAttention ||
        row.onInsertBeforeChain ||
        row.onInsertAfterChain ||
        row.onRemoveCriticalPathAttention ||
        row.onRemoveCriticalPathInsert,
    )
    if (!hasReadOnlyActions && (!hasEditActions || readOnly)) {
      return null
    }

    if (isPlanEntryTable) {
      return renderPlanEntryActions(row)
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="打开计划任务操作菜单" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.onOpenDetail ? <DropdownMenuItem onClick={row.onOpenDetail}>查看详情</DropdownMenuItem> : null}
          {row.onOpenCriticalPath ? (
            <DropdownMenuItem onClick={row.onOpenCriticalPath} data-testid="planning-row-open-critical-path">
              查看关键路径
            </DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onEdit ? <DropdownMenuItem onClick={row.onEdit}>编辑</DropdownMenuItem> : null}
          {canEditTableCells && row.onAddSibling ? <DropdownMenuItem onClick={row.onAddSibling}>添加同级</DropdownMenuItem> : null}
          {canEditTableCells && row.onAddChild ? <DropdownMenuItem onClick={row.onAddChild}>添加子级</DropdownMenuItem> : null}
          {canEditTableCells && row.onToggleMilestone ? (
            <DropdownMenuItem onClick={row.onToggleMilestone}>
              {row.isMilestone ? '取消里程碑' : '标记里程碑'}
            </DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onChangeNodeType ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="planning-row-change-node-type">切换节点类型</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {WBS_NODE_TYPE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => row.onChangeNodeType?.(option.value)}
                    className="gap-2"
                  >
                    <Check className={cn('h-3.5 w-3.5', row.wbsNodeType === option.value ? 'opacity-100' : 'opacity-0')} />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {canEditTableCells && row.onMarkCriticalPathAttention ? (
            <DropdownMenuItem onClick={row.onMarkCriticalPathAttention}>标记关键路径关注</DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onInsertBeforeChain ? (
            <DropdownMenuItem onClick={row.onInsertBeforeChain}>在链路前插入</DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onInsertAfterChain ? (
            <DropdownMenuItem onClick={row.onInsertAfterChain}>在链路后插入</DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onRemoveCriticalPathAttention ? (
            <DropdownMenuItem onClick={row.onRemoveCriticalPathAttention}>移除关注标记</DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onRemoveCriticalPathInsert ? (
            <DropdownMenuItem onClick={row.onRemoveCriticalPathInsert}>移除插链标记</DropdownMenuItem>
          ) : null}
          {canEditTableCells && row.onPromote ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={row.onPromote}>升级</DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>将此任务提升一个层级</TooltipContent>
            </Tooltip>
          ) : null}
          {canEditTableCells && row.onDemote ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={row.onDemote}>降级</DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent>将此任务变为上方任务的子任务</TooltipContent>
            </Tooltip>
          ) : null}
          {canEditTableCells && row.onMoveUp ? <DropdownMenuItem onClick={row.onMoveUp}>上移</DropdownMenuItem> : null}
          {canEditTableCells && row.onMoveDown ? <DropdownMenuItem onClick={row.onMoveDown}>下移</DropdownMenuItem> : null}
          {canEditTableCells && row.onDelete ? <DropdownMenuItem onClick={row.onDelete}>删除</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const getRowProgressPercent = (row: PlanningTreeRow) => {
    const label = String(row.progressLabel ?? '').replace('%', '').trim()
    const parsed = Number.parseInt(label, 10)
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null
  }

  const renderSemanticProgressContent = (row: PlanningTreeRow) => {
    const mode = String(row.progressMode ?? 'manual')
    const progressPercent = getRowProgressPercent(row)
    const isComplete = progressPercent !== null && progressPercent >= 100
    const progressText = row.progressLabel && row.progressLabel !== '-' ? row.progressLabel : null
    const openDetail = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault()
      event.stopPropagation()
      row.onOpenDetail?.()
    }

    if (mode === 'manual') {
      return row.progressCell ?? renderValue(row.progressLabel)
    }

    if (mode === 'event_triggered') {
      return (
        <Button
          type="button"
          variant={isComplete ? 'outline' : 'secondary'}
          size="sm"
          className={cn('h-7 max-w-full gap-1.5 px-2 text-xs', isComplete && 'border-emerald-200 bg-emerald-50 text-emerald-700')}
          onClick={openDetail}
          disabled={!row.onOpenDetail}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {isComplete ? '已通过' : '待确认'}
        </Button>
      )
    }

    if (mode === 'upload_triggered') {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 max-w-full gap-1.5 px-2 text-xs', isComplete ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600')}
          onClick={openDetail}
          disabled={!row.onOpenDetail}
        >
          <FileText className="h-3.5 w-3.5" />
          {isComplete ? '资料齐套' : '待上传'}
        </Button>
      )
    }

    if (mode === 'binary') {
      return (
        <Button
          type="button"
          variant={isComplete ? 'outline' : 'secondary'}
          size="sm"
          className={cn('h-7 max-w-full gap-1.5 px-2 text-xs', isComplete && 'border-blue-200 bg-blue-50 text-blue-700')}
          onClick={openDetail}
          disabled={!row.onOpenDetail}
        >
          <Check className="h-3.5 w-3.5" />
          {isComplete ? '已达成' : '未达成'}
        </Button>
      )
    }

    if (mode === 'inherited') {
      return (
        <span className="inline-flex max-w-full items-center justify-end gap-1.5 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{progressText ?? row.linkedProjectionSource?.sourceLabel ?? '同步状态'}</span>
        </span>
      )
    }

    return row.progressCell ?? renderValue(row.progressLabel)
  }

  const renderProgressCellContent = (row: PlanningTreeRow) => (
    <div className="flex min-w-0 justify-end text-right text-sm text-slate-700 num-mono">
      {renderSemanticProgressContent(row)}
    </div>
  )

  const renderLinkedProjectionSource = (row: PlanningTreeRow) => {
    const source = row.linkedProjectionSource
    if (!source) return null
    const label = source.sourceLabel || '联动来源'
    const badge = (
      <Badge variant="outline" className="inline-flex items-center gap-1 border-slate-200 bg-slate-50 text-slate-600">
        <Lock className="h-3 w-3" />
        <span className="truncate">{label}</span>
        {source.sourceRoute ? <ExternalLink className="h-3 w-3" /> : null}
      </Badge>
    )
    if (!source.sourceRoute) return badge
    return (
      <a
        href={source.sourceRoute}
        className="inline-flex max-w-full"
        aria-label={`打开${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        {badge}
      </a>
    )
  }

  const renderExtraColumnValue = (row: PlanningTreeRow, key: ExtraColumnKey) => {
    const rowKind: SharedTreeRowKind = row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')

    if (key === 'progress') {
      return renderProgressCellContent(row)
    }
    if (key === 'type') {
      const wbsLabel = getPlanningRowWbsLabel(row, rowKind)
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Badge variant="outline">{wbsLabel}</Badge>
          <PlanItemKindBadge kind={row.planItemKind} compact />
        </div>
      )
    }
    if (key === 'critical') {
      return <span className={cn('text-sm', row.isCritical ? 'font-medium text-rose-600' : 'text-slate-500')}>{row.isCritical ? '关键路径' : '普通'}</span>
    }
    if (key === 'duration_risk') {
      return <span className="truncate text-sm text-slate-700 num-mono">{renderValue(row.durationRiskRangeLabel)}</span>
    }
    if (key === 'float') {
      return <span className="truncate text-sm text-slate-700 num-mono">{renderValue(row.criticalFloatLabel)}</span>
    }
    if (key === 'duration_asset_evidence') {
      return <span className="truncate text-sm text-slate-600">{renderValue(row.durationAssetEvidenceLabel)}</span>
    }
    if (key === 'parent') {
      return <span className="truncate text-sm text-slate-600">{renderValue(row.parentLabel)}</span>
    }
    if (key === 'level') {
      return <span className="text-sm text-slate-600 num-mono">L{row.depth}</span>
    }
    if (key === 'notes') {
      return <span className="truncate text-sm text-slate-600">{renderValue(row.notesLabel ?? row.subtitle)}</span>
    }
    return <div className="flex justify-end">{renderRowActions(row)}</div>
  }

  const renderDurationForecastSummary = (forecast?: TaskDurationForecast | null) => {
    if (!forecast) return null
    const remainingDays = readAvailableDurationValue(forecast.remainingDuration, 'construction_production_day')
    const delayDays = Number(forecast.forecastDelayDays ?? 0)
    const hasRemaining = remainingDays !== null
    const hasDelay = Number.isFinite(delayDays) && delayDays > 0
    const toneClass = hasDelay
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : hasRemaining && remainingDays <= 0
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-blue-100 bg-blue-50 text-blue-700'
    const primary = hasRemaining
      ? remainingDays <= 0
        ? '已完成'
        : `预计还需 ${Math.ceil(remainingDays)} 天`
      : '待判断'
    const secondary = hasDelay
      ? `偏晚 ${Math.ceil(delayDays)} 天`
      : forecast.forecastFinishDate
        ? `预计 ${forecast.forecastFinishDate.slice(5)}`
        : '按当前事实'

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex max-w-full flex-col items-end rounded-lg border px-2 py-1 text-xs leading-4', toneClass)}>
            <span className="truncate font-medium">{primary}</span>
            <span className="truncate opacity-80">{secondary}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <div className="space-y-1 text-xs leading-5">
            <div className="font-medium">工期智能参考 · 执行中剩余工期预测</div>
            <div>{forecast.displaySummary || forecast.businessReason || '系统按当前执行事实预测剩余工期。'}</div>
            {forecast.forecastFinishDate ? <div>预计完成：{forecast.forecastFinishDate}</div> : null}
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  const renderTaskIssueChipBand = (row: PlanningTreeRow) => {
    const issueChips = getTaskIssueChips(row)
    if (!isTaskTable || issueChips.length === 0) return null

    const [primaryIssue, ...foldedIssues] = issueChips
    const traceLabel = issueChips.map((issue) => issue.label).join(' / ')
    const content = (
      <span
        data-testid={`planning-task-risk-chip-${row.id}`}
        data-risk-count={String(issueChips.length)}
        data-risk-trace={traceLabel}
        title={traceLabel}
        className="inline-flex min-w-0 items-center gap-1"
      >
        <Badge variant="outline" className={cn('h-5 rounded-md px-1.5 text-xs font-medium', primaryIssue.toneClass)}>
          {primaryIssue.label}
        </Badge>
        {foldedIssues.length > 0 ? (
          <Badge variant="outline" className="h-5 rounded-md border-slate-200 bg-white px-1.5 text-xs text-slate-600">
            +{foldedIssues.length}
          </Badge>
        ) : null}
      </span>
    )

    if (foldedIssues.length === 0) return content

    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-64">
          <div className="space-y-1 text-xs leading-5">
            <div className="font-medium">完整异常</div>
            {issueChips.map((issue) => (
              <div key={issue.key}>{issue.label}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  const renderBaseColumnValue = (row: PlanningTreeRow, key: string, rowKind: SharedTreeRowKind) => {
    if (key === 'start') {
      return renderCellFrame(row, 'start', <div className="meta-text min-w-0 truncate text-right num-mono">{row.startCell ?? renderValue(row.startDateLabel)}</div>, 'rounded-md px-1 py-0.5')
    }
    if (key === 'end') {
      return renderCellFrame(row, 'end', <div className="meta-text min-w-0 truncate text-right num-mono">{row.endCell ?? renderValue(row.endDateLabel)}</div>, 'rounded-md px-1 py-0.5')
    }
    if (key === 'duration') {
      const durationForecast = !isEditMode && (isTaskTable || isMonthlyTable)
        ? renderDurationForecastSummary(row.durationForecast)
        : null
      if (durationForecast) {
        return <div className="flex min-w-0 items-center justify-end gap-1.5"><DurationBasisBadge basis="remaining" compact />{durationForecast}</div>
      }
      return (
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <DurationBasisBadge basis="plan" compact />
          <span className="truncate text-sm text-slate-700 num-mono">{renderValue(row.durationLabel)}</span>
          {(row.durationSuggestion || row.durationSuggestionQuery) ? (
            <DurationSuggestionTooltip
              suggestion={row.durationSuggestion}
              query={row.durationSuggestionQuery}
              compact
            />
          ) : null}
        </div>
      )
    }
    if (key === 'progress') {
      return renderCellFrame(row, 'progress', renderProgressCellContent(row), 'rounded-md px-1 py-0.5')
    }
    if (key === 'assignee') {
      return renderCellFrame(row, 'assignee', <div className="truncate text-sm text-slate-600">{row.assigneeCell ?? renderValue(row.assigneeLabel)}</div>, 'rounded-md px-1 py-0.5')
    }
    if (key === 'unit') {
      return renderCellFrame(row, 'unit', <div className="truncate text-sm text-slate-600">{row.unitCell ?? renderValue(row.unitLabel)}</div>, 'rounded-md px-1 py-0.5')
    }
    if (key === 'scope') {
      return renderCellFrame(row, 'scope', <div className="truncate text-sm text-slate-600">{row.scopeCell ?? renderValue(row.scopeLabel)}</div>, 'rounded-md px-1 py-0.5')
    }
    if (key === 'milestone') {
      return (
        <div className="flex justify-center">
          {rowKind === 'milestone' || row.isMilestone ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-1 text-xs font-semibold text-amber-700">
              M
            </span>
          ) : (
            <span className="text-sm text-slate-300">—</span>
          )}
        </div>
      )
    }
    if (key === 'status') {
      const taskIssueChipBand = renderTaskIssueChipBand(row)
      return (
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {row.statusLabel ? <Badge variant="secondary">{row.statusLabel}</Badge> : null}
            {taskIssueChipBand}
            {row.locked ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                只读查看
              </Badge>
            ) : null}
            {row.extra}
          </div>
          {!extraColumns.includes('actions') && !isPlanEntryTable ? renderRowActions(row) : null}
        </div>
      )
    }
    return null
  }

  const renderTableBody = (options?: { largeView?: boolean }) => {
    const largeView = options?.largeView === true
    const resolvedScrollClassName = largeView ? largeViewScrollClassName : scrollClassName

    return viewMode === 'gantt' && isTaskTable && ganttRenderer ? (
    <div data-testid={largeView ? 'planning-large-gantt-view' : 'planning-gantt-view'} className={cn('bg-white', largeView ? 'min-h-full' : 'min-h-[34rem]')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="text-xs font-medium text-slate-500">
          {filteredAndSortedRows.length} rows
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['day', 'week', 'month'] as const).map((scale) => (
            <Button unstyled
              key={scale}
              type="button"
              data-testid={`${largeView ? 'planning-large-gantt-scale' : 'planning-gantt-scale'}-${scale}`}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium transition-all duration-150',
                ganttScale === scale
                  ? 'bg-slate-900 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              onClick={() => setGanttScale(scale)}
            >
              {scale === 'day' ? 'Day' : scale === 'week' ? 'Week' : 'Month'}
            </Button>
          ))}
        </div>
      </div>
      {ganttRenderer({
        rows: filteredAndSortedRows,
        selectedRowIds: selectedVisibleRows.map((row) => row.id),
        onRowClick: (rowId) => {
          const row = filteredAndSortedRows.find((item) => item.id === rowId)
          if (row?.locked) return
          onToggleRow?.(rowId)
          row?.onOpenDetail?.()
        },
        scale: ganttScale,
        onScaleChange: setGanttScale,
        readOnly: readOnly || isEditMode,
      })}
    </div>
  ) : (
    <>
      {rows.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center px-6 py-12 text-sm text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <ScrollArea className={resolvedScrollClassName}>
          <div style={{ minWidth: gridMinWidth }}>
            <div
              className="sticky top-0 z-20 grid items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500"
              style={{ gridTemplateColumns }}
            >
              {baseColumns.map((column) => (
                <div
                  key={column.key}
                  className={cn(
                    'min-w-0 bg-slate-50',
                    column.key === 'wbs' && 'sticky left-0 z-30',
                    column.key === 'title' && 'sticky z-30',
                    'className' in column ? column.className : undefined,
                  )}
                  style={column.key === 'title' ? { left: frozenTitleLeft } : undefined}
                >
                  {column.label}
                </div>
              ))}
              {visibleExtraColumns.map((column) => (
                <div key={column.key} className={cn('min-w-0', column.key === 'progress' && 'text-right num-mono')}>
                  {extraColumnLabels[column.key]}
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-100">
              {renderedRows.map((row) => {
                const rowKind: SharedTreeRowKind =
                  row.rowType ?? (row.isMilestone ? 'milestone' : 'leaf')
                const isRowEditing = isEditMode && !!(
                  row.startCell
                  || row.endCell
                  || row.progressCell
                  || row.assigneeCell
                  || row.unitCell
                )
                const rowViewMode: SharedTreeViewMode = viewMode === 'detail'
                  ? 'detail'
                  : viewMode === 'card'
                    ? 'card'
                    : 'list'
                const resolvedRowDensity: SharedTreeDensity = isRowEditing
                  ? 'edit'
                  : rowViewMode === 'detail'
                    ? 'detail'
                    : density
                const rowDensityClass = getTreeDensityRowClass(resolvedRowDensity)
                const rowEditors = presence?.editingByRowId?.[row.id] ?? []
                const hierarchyStyle = getPlanningRowHierarchyStyle(row, rowKind)
                const isDirtyRow = isEditMode && Boolean(dirtyRowIds?.has(row.id) || dirtyCellMap?.has(row.id))
                const reconcileRowStyle = row.reconcilePhase ? getReconcileRowStyle(row.reconcilePhase) : null
                const startingLineRowClass = getStartingLineRowClass(row.startingLineClass)
                const canExpandDefaultCollapsedRow = defaultCollapsibleRowIds.has(row.id)
                const isDefaultCollapsedRowExpanded = expandedRowIds.has(row.id)
                const semanticBorderClass = row.selected
                  ? 'border-l-blue-500'
                  : isDirtyRow
                    ? 'border-l-amber-400'
                  : row.planItemTags?.includes('危大')
                    ? 'border-l-rose-500'
                    : isTaskTable && row.isCritical
                      ? 'border-l-rose-500'
                      : !isPlanEntryTable && (row.mappingStatus || row.isCritical)
                        ? 'border-l-amber-400'
                        : getPlanningRowProjectionMode(row) !== 'schedule_row'
                          ? getPlanningRowProjectionBorderClass(row)
                        : getPlanItemKindBorderClass(row.planItemKind)

                return (
                  <div key={row.id} className="contents">
                  {row.groupLabel ? (
                    <div className="bg-slate-100/80 px-4 py-2 text-xs font-semibold text-slate-600">
                      {row.groupLabel}
                    </div>
                  ) : null}
                  <div
                    data-testid={`planning-row-${row.id}`}
                    data-planning-density={resolvedRowDensity}
                    data-wbs-node-type={getPlanningRowWbsType(row) ?? undefined}
                    data-hierarchy-rank={hierarchyStyle.rank}
                    data-dirty-row={isDirtyRow ? 'true' : undefined}
                    className={cn(
                      'group grid items-center gap-3 border-l-2 px-4 transition-colors',
                      rowDensityClass,
                      hierarchyStyle.rowClass,
                      isDirtyRow && 'ring-1 ring-inset ring-amber-200',
                      row.rowProjectionMode === 'gate_marker' && 'bg-amber-50/30',
                      row.rowProjectionMode === 'inline_control' && 'bg-slate-50/40',
                      row.planItemKind === 'linked_projection' && 'bg-slate-50/70',
                      startingLineRowClass,
                      row.reconcilePhase && reconcileRowStyle && [reconcileRowStyle.bg, reconcileRowStyle.border, reconcileRowStyle.text],
                      semanticBorderClass,
                      row.rowClassName,
                    )}
                    style={{ gridTemplateColumns }}
                  >
                    <PlanningRowGutter
                      rowId={row.id}
                      label={(
                        <span
                          data-testid={`planning-wbs-badge-${row.id}`}
                          className={cn('inline-flex max-w-full items-center rounded-md px-1.5 py-0.5', hierarchyStyle.wbsBadgeClass)}
                        >
                          {renderValue(row.wbsCode ?? row.sequenceLabel)}
                        </span>
                      )}
                      depth={row.depth}
                      rowKind={rowKind}
                      selected={row.selected}
                      readOnly={readOnly || row.locked}
                      isPlanEntryTable={isPlanEntryTable}
                      mappingStatus={row.mappingStatus}
                      className={hierarchyStyle.gutterClass}
                      onToggle={(event) => handleRowToggle(row.id, event.shiftKey)}
                    />

                    {renderCellFrame(
                      row,
                      'title',
                      <div
                        className={cn(
                          row.depth > 1 &&
                            'relative before:absolute before:-left-3 before:top-0 before:h-full before:w-px',
                          row.depth > 1 && hierarchyStyle.indentLineClass,
                        )}
                      >
                        <div className={cn('relative flex items-center gap-2', isPlanEntryTable && (isTaskTable ? 'pr-10' : 'pr-24'))}>
                          {isDirtyRow ? (
                            <span
                              data-testid={`planning-dirty-row-${row.id}`}
                              className="absolute -left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-amber-500 shadow-[0_0_0_2px_rgba(254,243,199,0.9)]"
                              aria-hidden="true"
                            />
                          ) : null}
                          {rowKind === 'milestone' ? (
                            <span data-testid={`planning-milestone-icon-${row.id}`} className="inline-flex">
                              <TreeDiamondIcon className={hierarchyStyle.iconClass} />
                            </span>
                          ) : row.startingLineClass === 'history' ? (
                            <History className="h-4 w-4 text-slate-400" />
                          ) : row.startingLineClass === 'in_progress' ? (
                            <Play className="h-4 w-4 text-blue-600" />
                          ) : !isPlanEntryTable && row.isCritical ? (
                            <FileWarning className="h-4 w-4 text-rose-500" />
                          ) : rowKind === 'structure' ? (
                            <span className={cn('h-4 w-4 rounded-md border shadow-sm', hierarchyStyle.iconClass)} aria-hidden="true" />
                          ) : (
                            <Circle className={cn('h-4 w-4', hierarchyStyle.iconClass)} />
                          )}
                          <div className="min-w-0 flex-1 leading-tight">
                            {row.titleCell ? (
                              row.titleCell
                            ) : (
                              <>
                                <div
                                  className={cn(
                                    'truncate text-slate-900',
                                    getPlanningRowTitleClass(row, rowKind),
                                  )}
                                >
                                  {row.title}
                                </div>
                                {row.subtitle ? (
                                  <div className="meta-muted truncate text-xs">{row.subtitle}</div>
                                ) : row.wbsNodeType ? (
                                  <div className="meta-muted truncate text-xs">{getPlanningRowWbsLabel(row, rowKind)}</div>
                                ) : null}
                              </>
                            )}
                            {(isScheduleTable || isMonthlyTable) && row.extra ? (
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                {row.extra}
                              </div>
                            ) : null}
                            {isPlanEntryTable && (row.rowProjectionMode || row.planItemKind || row.planItemTags?.length || row.linkedProjectionSource) ? (
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                {getPlanningRowProjectionMode(row) !== 'schedule_row' ? (
                                  <Badge variant="outline" className={cn('h-5 px-1.5 text-xs', getPlanningRowProjectionBadgeClass(row))}>
                                    {ROW_PROJECTION_LABELS[getPlanningRowProjectionMode(row)]}
                                  </Badge>
                                ) : null}
                                <PlanItemKindBadge kind={row.planItemKind} compact />
                                {row.planItemTags?.map((tag) => <PlanItemTagBadge key={tag} tag={tag} />)}
                                {renderLinkedProjectionSource(row)}
                              </div>
                            ) : null}
                          </div>
                          {isPlanEntryTable ? (
                            <div className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-white/90 px-0.5 shadow-sm backdrop-blur group-hover:pointer-events-auto focus-within:pointer-events-auto">
                              {canExpandDefaultCollapsedRow ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label={isDefaultCollapsedRowExpanded ? '收起下级任务' : '展开下级任务'}
                                  className="h-7 w-7 rounded-md"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setExpandedRowIds((current) => {
                                      const next = new Set(current)
                                      if (next.has(row.id)) next.delete(row.id)
                                      else next.add(row.id)
                                      return next
                                    })
                                  }}
                                >
                                  {isDefaultCollapsedRowExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </Button>
                              ) : null}
                              {row.reconcilePhase === 'rename_suggest' && onReconcileEntryAction ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button type="button" size="icon" variant="ghost" aria-label="处理治理建议" className="h-7 w-7 rounded-md text-amber-700">
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="min-w-40">
                                    <DropdownMenuItem onClick={() => onReconcileEntryAction(row.id, 'merge_to_standard')}>
                                      合并到标准项
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onReconcileEntryAction(row.id, 'keep_both')}>
                                      保留两项
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onReconcileEntryAction(row.id, 'replace_with_standard')}>
                                      替换为标准项
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                              {rowEditors.length > 0 ? (
                                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                                  {rowEditors[0]}正在编辑
                                </span>
                              ) : null}
                              {renderRowActions(row)}
                            </div>
                          ) : null}
                        </div>
                      </div>,
                      'sticky z-10 min-w-0 bg-inherit pr-2',
                      {
                        left: frozenTitleLeft,
                        paddingLeft: `${getTreeIndentPx(row.depth, 1)}px`,
                      },
                    )}

                    {baseColumns
                      .filter((column) => column.key !== 'wbs' && column.key !== 'title')
                      .map((column) => (
                        <div key={column.key} className={cn('min-w-0', 'className' in column ? column.className : undefined)}>
                          {renderBaseColumnValue(row, column.key, rowKind)}
                        </div>
                      ))}

                    {visibleExtraColumns.map((column) => (
                      <div key={column.key} className="min-w-0 truncate">
                        {renderExtraColumnValue(row, column.key)}
                      </div>
                    ))}

                    {row.onOpenDetail && !isPlanEntryTable ? (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-200 transition-colors group-hover:text-slate-500" />
                    ) : null}
                  </div>
                  {row.inlinePanel ? (
                    <div className="border-l-2 border-l-blue-400 bg-blue-50/40 px-4 py-3">
                      {row.inlinePanel}
                    </div>
                  ) : null}
                  </div>
                )
              })}
            </div>
            {hiddenRenderedCount > 0 ? (
              <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                正在继续加载剩余 {hiddenRenderedCount} 行...
              </div>
            ) : null}
          </div>
        </ScrollArea>
      )}
    </>
  )
  }

  const tableBody = renderTableBody()
  const shouldShowSecondaryStatus =
    !isTaskReadToolbar && (!embedded || !readOnly || searchKeyword || activeFilterCount > 0 || sortMode !== 'default')

  return (
    <section
      className={cn(embedded ? '' : 'space-y-4')}
      tabIndex={0}
      onKeyDown={handleTableKeyDown}
      onPaste={handleTablePaste}
      data-planning-tree-table="true"
    >
      {!embedded ? (
        <div className="flex items-start justify-between gap-3">
          <CardHead eyebrow="TREE VIEW" title={title} />
          <Badge variant="outline" className="shrink-0">
            {selectedCount} 已选
          </Badge>
        </div>
      ) : null}

      {toolbar ? (
      <div className={cn(embedded ? 'space-y-2 border-y border-slate-100 bg-slate-50/70 px-4 py-2' : 'space-y-3 bg-slate-50/80 p-5')}>

        <div className={cn('flex flex-wrap items-center gap-2', isTaskReadToolbar && 'items-center')}>
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              ref={searchInputRef}
              type="text"
              aria-label="搜索计划任务"
              placeholder="搜索任务..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="h-9 pl-9 pr-8"
            />
            {searchKeyword && (
              <Button variant="ghost"
                type="button"
                aria-label="清空计划任务搜索"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {presenceLabel ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-9 rounded-full bg-white px-3 text-xs font-medium text-slate-600">
                  {presenceLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {otherViewerNames.length > 0 ? otherViewerNames.join('、') : '其他成员正在查看'}
              </TooltipContent>
            </Tooltip>
          ) : null}

          {isPlanEntryTable && !isTaskReadToolbar ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyRowsToClipboard()} disabled={clipboardRows.length === 0}>
                <Copy className="h-4 w-4" />
                复制
              </Button>
              {canEditTableCells && (onPasteRows || onUpdateCells) ? (
                <div className="relative inline-flex">
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void pasteRowsFromClipboard()}>
                  <ClipboardPaste className="h-4 w-4" />
                  粘贴
                </Button>
                  {renderGuideBubble('paste', '已按行列识别，可直接保存。')}
                </div>
              ) : null}
              {canEditTableCells && onDeleteRows && selectedVisibleRows.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                      disabled={selectedDeleteBlocked}
                      onClick={deleteSelectedRows}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除选中
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{selectedDeleteTooltip ?? '删除后可撤销，保存后由后端判断真实处置方式'}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}

          {!isTaskReadToolbar ? (
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'division', 'subdivision', 'task', 'milestone'] as const).map((facet) => (
              <Button
                key={facet}
                type="button"
                variant={facetMode === facet ? 'default' : 'outline'}
                size="sm"
                className="gap-2 rounded-full"
                onClick={() => setFacetMode(facet)}
              >
                {facet === 'all'
                  ? '全部'
                  : facet === 'division'
                    ? getWbsNodeTypeLabel('division')
                    : facet === 'subdivision'
                      ? getWbsNodeTypeLabel('sub_division')
                      : facet === 'task'
                        ? getWbsNodeTypeLabel()
                        : '里程碑'}
              </Button>
            ))}
          </div>
          ) : null}

          {isPlanEntryTable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid={isTaskReadToolbar ? 'planning-task-list-filter-menu' : undefined}
                data-filter-scope={isTaskReadToolbar ? 'table' : undefined}
              >
                <Filter className="h-4 w-4" />
                {isTaskReadToolbar ? '表内筛选' : '筛选'}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={8}
              collisionPadding={12}
              className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 overflow-y-auto overscroll-contain"
            >
              {isTaskReadToolbar ? (
                <>
                  {(['all', 'division', 'subdivision', 'task', 'milestone'] as const).map((facet) => (
                    <DropdownMenuCheckboxItem
                      key={facet}
                      checked={facetMode === facet}
                      onCheckedChange={() => setFacetMode(facet)}
                    >
                      {facet === 'all'
                        ? '全部'
                        : facet === 'division'
                          ? getWbsNodeTypeLabel('division')
                          : facet === 'subdivision'
                            ? getWbsNodeTypeLabel('sub_division')
                            : facet === 'task'
                              ? getWbsNodeTypeLabel()
                              : '里程碑'}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuCheckboxItem checked={filterMilestone} onCheckedChange={setFilterMilestone}>
                里程碑
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterCritical} onCheckedChange={setFilterCritical}>
                关键路径
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filterMappingAttention}
                onCheckedChange={setFilterMappingAttention}
                data-testid="baseline-filter-structure-attention"
              >
                结构待校核
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {PLAN_ITEM_KIND_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={filterPlanKinds.includes(option.value)}
                  onCheckedChange={(checked) => togglePlanKindFilter(option.value, checked === true)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
              {availablePlanTags.length > 0 ? <DropdownMenuSeparator /> : null}
              {availablePlanTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={filterPlanTags.includes(tag)}
                  onCheckedChange={(checked) => togglePlanTagFilter(tag, checked === true)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          ) : null}

          {availableExtraColumns.length > 0 && !isTaskReadToolbar ? (
            <div className="relative inline-flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="planning-more-columns-trigger"
              onClick={() => {
                setFieldConfigOpen(true)
                triggerPlanningGuide('field_config')
              }}
            >
              <Columns3 className="h-4 w-4" />
              字段配置
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                {activeExtraColumnCount}/{availableExtraColumns.length}
              </Badge>
            </Button>
              {renderGuideBubble('field_config', '可选择显示更多字段。')}
            </div>
          ) : null}
          {isPlanEntryTable && !isTaskReadToolbar ? (
            <KeyboardShortcuts
              shortcuts={PLANNING_TREE_SHORTCUTS}
              enabled={false}
              label="快捷键"
            />
          ) : null}
          {!isTaskReadToolbar ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="h-4 w-4" />
                排序
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem onClick={() => setSortMode('default')}>
                {sortMode === 'default' && <Check className="mr-2 h-4 w-4" />}
                默认顺序
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('name')}>
                {sortMode === 'name' && <Check className="mr-2 h-4 w-4" />}
                按名称
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('date')}>
                {sortMode === 'date' && <Check className="mr-2 h-4 w-4" />}
                按日期
              </DropdownMenuItem>
              {!isPlanEntryTable ? (
              <DropdownMenuItem onClick={() => setSortMode('progress')}>
                {sortMode === 'progress' && <Check className="mr-2 h-4 w-4" />}
                按进度
              </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          ) : null}

          {(isPlanEntryTable || searchKeyword || activeFilterCount > 0 || sortMode !== 'default') && (
            <div className="flex flex-wrap items-center gap-2">
          {/* v1.4.7.3: View mode toggle with gantt support */}
          {isPlanEntryTable ? (
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/70 p-0.5">
              {resolvedEnabledViews.map((mode) => (
                <Button unstyled
                  key={mode}
                  type="button"
                  className={cn(
                    'h-7 rounded-md px-2.5 text-xs font-medium transition-all duration-150',
                    viewMode === mode
                      ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                  onClick={() => handleViewModeChange(mode)}
                  data-testid={`planning-view-${mode}`}
                >
                  {mode === 'list' ? '列表' : mode === 'card' ? '卡片' : mode === 'detail' ? '详情' : '横道图'}
                </Button>
              ))}
            </div>
          ) : null}

          {/* v1.4.7.1: Read/Edit mode toolbar */}
          {renderEditModeToolbar()}

          {showBusinessActionsSlot && (readBusinessActionsSlot || editBusinessActionsSlot) ? (
            <div
              data-testid={isEditMode ? 'planning-business-actions-edit' : 'planning-business-actions-read'}
              data-mobile-toolbar-row={isTaskReadToolbar ? 'business-actions' : undefined}
              aria-disabled={isEditMode || undefined}
              className={cn(
                'flex flex-wrap items-center gap-2 min-w-0',
                isTaskReadToolbar && 'order-last w-full basis-full pt-1 sm:order-none sm:w-auto sm:basis-auto sm:pt-0',
                isEditMode && 'pointer-events-none opacity-50',
              )}
            >
              {isEditMode ? editBusinessActionsSlot ?? readBusinessActionsSlot : readBusinessActionsSlot}
            </div>
          ) : null}

              {searchKeyword ? <Badge variant="secondary">搜索：{searchKeyword}</Badge> : null}
              {!isPlanEntryTable && filterMilestone ? <Badge variant="secondary">里程碑</Badge> : null}
              {!isPlanEntryTable && filterCritical ? <Badge variant="secondary">关键路径</Badge> : null}
              {!isPlanEntryTable && filterMappingAttention ? <Badge variant="secondary">关联待确认</Badge> : null}
              {filterPlanKinds.map((kind) => (
                <PlanItemKindBadge key={kind} kind={kind} compact showDefault />
              ))}
              {filterPlanTags.map((tag) => (
                <PlanItemTagBadge key={tag} tag={tag} />
              ))}
              {facetMode !== 'all' ? (
                <Badge variant="outline">
                  {facetMode === 'division'
                    ? getWbsNodeTypeLabel('division')
                    : facetMode === 'subdivision'
                      ? getWbsNodeTypeLabel('sub_division')
                      : facetMode === 'task'
                        ? getWbsNodeTypeLabel()
                        : '里程碑'}
                </Badge>
              ) : null}
              <Button variant="ghost"
                type="button"
                onClick={handleClearAll}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                清除全部
              </Button>
            </div>
          )}
        </div>

        {shouldShowSecondaryStatus ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {readOnly ? (
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                当前只读
              </Badge>
            ) : (
              <Button variant="ghost"
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={() => onToggleAll?.(!allSelected)}
              >
                {allSelected ? <Check className="h-3.5 w-3.5" /> : someSelected ? <Circle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {allSelected ? '取消全选' : '全选当前视图'}
              </Button>
            )}
            <span className="text-slate-500">·</span>
            <span>当前视图 {filteredAndSortedRows.length} 项</span>
          </div>
        ) : null}
      </div>
      ) : null}

      {!toolbar && availableExtraColumns.length > 0 ? (
        <div className="flex justify-end gap-2 border-b border-slate-100 bg-white px-4 py-2">
          <div className="relative inline-flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="planning-more-columns-trigger"
            onClick={() => {
              setFieldConfigOpen(true)
              triggerPlanningGuide('field_config')
            }}
          >
            <Columns3 className="h-4 w-4" />
            字段配置
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
              {activeExtraColumnCount}/{availableExtraColumns.length}
              </Badge>
            </Button>
            {renderGuideBubble('field_config', '可选择显示更多字段。')}
          </div>
          <KeyboardShortcuts
            shortcuts={PLANNING_TREE_SHORTCUTS}
            enabled={false}
            label="快捷键"
          />
        </div>
      ) : null}

      {(isEditMode || hasDirtySignal || presenceSignals.length > 0) ? (
      <div
        data-testid="planning-edit-state-bar"
        data-presence-viewer-state={presenceViewerState}
        data-presence-readonly={String(readOnly)}
        className={cn('bg-white px-4', embedded ? 'py-1.5' : 'pb-3 pt-2')}
      >
        <PlanningPresenceBar
          signals={presenceSignals}
          editMode={isEditMode}
          hasDirty={hasDirtySignal}
          className="border-slate-200 bg-slate-50/80"
        />
      </div>
      ) : null}

      {isEditMode && restoreViewAfterEditRef.current === 'gantt' ? (
        <div
          data-testid="planning-gantt-edit-switch-banner"
          className={cn(
            'border-y border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800',
            embedded && 'border-t-0',
          )}
        >
          已切换到列表视图以便编辑，保存或取消后将返回横道图。
        </div>
      ) : null}

      {embedded ? (
        <div className="overflow-hidden">
          <div className="p-0">{tableBody}</div>
        </div>
      ) : (
        <div className="overflow-hidden surface-card">
          <div className="p-0">{tableBody}</div>
        </div>
      )}
      <PlanningColumnConfig
        open={fieldConfigOpen}
        onClose={() => setFieldConfigOpen(false)}
        columns={fieldConfigColumns}
        onToggleColumn={(key, visible) => {
          if (!isExtraColumnKey(key)) return
          toggleExtraColumn(key, visible)
        }}
      />
      <Dialog open={largeViewOpen} onOpenChange={handleLargeViewOpenChange}>
        <DialogContent
          className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[var(--el-4)] sm:rounded-2xl"
          data-testid="planning-large-view-dialog"
          closeLabel="退出计划表工作台"
          onEscapeKeyDown={(event) => {
            if (useLargeViewEditWorkspace && isEditMode) {
              event.preventDefault()
              requestCloseLargeViewWorkspace()
            }
          }}
          onPointerDownOutside={(event) => {
            if (useLargeViewEditWorkspace && isEditMode) {
              event.preventDefault()
              requestCloseLargeViewWorkspace()
            }
          }}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-16 text-left">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-base text-slate-950">计划表工作台</DialogTitle>
                <DialogDescription className="sr-only">
                  在当前页面打开沉浸式计划表编辑空间，保留原页面数据、筛选、视图与编辑状态。
                </DialogDescription>
                <div className="mt-1 truncate text-sm text-slate-500">
                  {title} · 当前视图 {filteredAndSortedRows.length} 行
                </div>
              </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {renderEditModeToolbar({ largeView: true })}
                {availableExtraColumns.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    data-testid="planning-more-columns-trigger"
                    onClick={() => {
                      setFieldConfigOpen(true)
                      triggerPlanningGuide('field_config')
                    }}
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                    字段配置
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void copyRowsToClipboard()}
                  disabled={clipboardRows.length === 0}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </Button>
                {canEditTableCells && (onPasteRows || onUpdateCells) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => void pasteRowsFromClipboard()}
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    粘贴
                  </Button>
                ) : null}
                <KeyboardShortcuts
                  shortcuts={PLANNING_TREE_SHORTCUTS}
                  enabled={false}
                  label="快捷键"
                />
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                  不新增业务入口
                </Badge>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden bg-slate-50/70 p-4">
            <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--el-1)]">
              {renderTableBody({ largeView: true })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={unsavedEditGuardOpen} onOpenChange={setUnsavedEditGuardOpen}>
        <AlertDialogContent data-testid="planning-unsaved-edit-guard">
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的编辑</AlertDialogTitle>
            <AlertDialogDescription className="not-sr-only leading-6 text-slate-600">
              计划表工作台中还有未保存的修改。退出前请选择保存、放弃或继续编辑。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCancelEdit({ closeGuard: true })}
              disabled={editActionPending}
            >
              放弃更改
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnsavedEditGuardOpen(false)}
              disabled={editActionPending}
            >
              继续编辑
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveEdit({ closeGuard: true })}
              disabled={saveDisabled || editActionPending}
            >
              保存并退出
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

export const PlanningTreeTable = PlanningTreeView
