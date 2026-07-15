import {
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Search,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import type { AssigneeComboboxOption } from '@/components/AssigneeCombobox'
import type { ParticipantUnitLookupOption } from '@/components/planning/lookups/ParticipantUnitLookup'
import { PredecessorSelector, type PredecessorOption } from '@/components/planning/PredecessorSelector'
import type { DrawerSection } from '@/components/planning/PlanningDetailDrawer'
import { TaskListEmptyState } from '@/components/planning/TaskListEmptyState'
import { Badge } from '@/components/ui/badge'
import type { ReconcileTaskEntry } from '@/components/planning/ReconcileBanner'
import {
  type PlanningTreeCellUpdate,
  type PlanningTreeClipboardRow,
  type PlanningTreePresenceState,
  type PlanningTreeCellKey,
  type PlanningTreeDensity,
  type PlanningTreeFieldConfigField,
  type PlanningViewMode,
  type PlanningTreeRow,
} from '@/components/planning/PlanningTreeView'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GroupMode } from '@/hooks/useGroupMode'
import type { CriticalTaskSnapshot } from '@/lib/criticalPath'
import type { ProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'
import type { WbsTargetFeasibility, WbsTemplateGenerationScope } from '@/services/wbsTemplateGenerationApi'
import { cn } from '@/lib/utils'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import {
  getLinkedProjectionSourceFromMetadata,
  getPlanItemKindFromMetadata,
  getPlanItemTagsFromMetadata,
  getProgressModeFromMetadata,
  getRowProjectionModeFromMetadata,
  getScheduleParticipationFromMetadata,
  getScopeExpansionModeFromMetadata,
} from '@/lib/planItemSemantics'
import {
  getDependencyChain,
  getTaskProgressReadOnlyReason,
  getTaskWbsNodeType,
  type Task,
  type TaskCondition,
  type TaskObstacle,
  type WBSNode,
} from './GanttViewTypes'
import { GanttTaskPlanningTreeAdapter } from './GanttView/GanttTaskPlanningTreeAdapter'
import {
  TaskAssigneeCell,
  TaskDateCell,
  TaskIssueChipBand,
  TaskParticipantUnitCell,
  TaskProgressCell,
} from './GanttView/GanttTaskRowInlineParts'
import {
  clampProgress,
  getPendingHardConditionCount,
  getTaskConditionBreakdown,
  getTaskDurationLabel,
  getTaskScopeLabel,
  getWbsSemanticTitleClass,
  isActiveTaskObstacle,
  normalizeAcceptanceImpactItems,
} from './GanttView/taskRowModel'
import {
  compareTasksByExecutionOrder,
  getTaskExecutionDisplayDepth,
  shouldShowTaskInMainExecutionList,
} from './GanttView/taskListProjection'
import { accelerationTaskBadge, getAccelerationTaskClassName } from './GanttView/TargetAccelerationReviewPanel'
import {
  getTaskCriticalFloatLabel,
  getTaskDurationAssetEvidenceLabel,
  getTaskDurationRiskRangeLabel,
} from './GanttView/taskScheduleEvidence'

type BusinessStatusView = {
  label: string
  cls: string
  badge?: { text: string; cls: string }
}

type CriticalOverrideFlags = {
  hasManualAttentionOverride: boolean
  hasManualInsertOverride: boolean
}

type QuickBlockageDraft = {
  description: string
  severity: string
  expectedResolution?: string
}

function getTaskStartingLineClass(
  standardTaskMetadata: Record<string, unknown>,
): PlanningTreeRow['startingLineClass'] {
  if (
    standardTaskMetadata.is_historical === true
    || standardTaskMetadata.onboarding_stage_classification === 'history'
  ) {
    return 'history'
  }
  if (standardTaskMetadata.onboarding_stage_classification === 'in_progress') {
    return 'in_progress'
  }
  return 'future'
}

function readTaskStandardMetadata(task: Pick<Task, 'standard_task_metadata'>): Record<string, unknown> {
  const metadata = task.standard_task_metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {}
}

const INITIAL_RENDERED_ROW_COUNT = 48
const RENDER_CHUNK_SIZE = 80

function normalizeSortText(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function getTaskSpatialSortKey(task: WBSNode, labelsById?: Record<string, string>) {
  const objectIds = [
    task.building_object_id,
    task.basement_object_id,
    task.floor_object_id,
    task.physical_zone_object_id,
    task.functional_area_object_id,
    task.engineering_object_id,
  ].map((value) => String(value ?? '').trim()).filter(Boolean)

  if (objectIds.length === 0) return 'zzzzzz'
  return objectIds
    .map((objectId) => normalizeSortText(labelsById?.[objectId] || objectId))
    .join('/')
}

type SpatialSegment = {
  key: string
  label: string
  missing: boolean
}

function getSpatialSegment(
  id: string | null | undefined,
  labelsById: Record<string, string> | undefined,
  fallbackLabel: string,
): SpatialSegment {
  const normalizedId = String(id ?? '').trim()
  if (!normalizedId) {
    return {
      key: `missing-${fallbackLabel}`,
      label: `未分配${fallbackLabel}`,
      missing: true,
    }
  }
  return {
    key: normalizedId,
    label: labelsById?.[normalizedId] || normalizedId,
    missing: false,
  }
}

function buildSpatialGroupRow(
  id: string,
  title: string,
  depth: number,
  sequenceLabel: string,
  subtitle: string,
): PlanningTreeRow {
  return {
    id,
    title,
    subtitle,
    depth,
    sequenceLabel,
    rowType: 'structure',
    wbsNodeType: depth <= 1 ? 'division' : depth === 2 ? 'sub_division' : 'item_work',
    isExecutable: false,
    locked: true,
    isPersisted: false,
    isNew: false,
    childCount: 0,
    statusLabel: '空间分组',
  }
}

function buildSpatialPlanningRows(taskRows: PlanningTreeRow[]): PlanningTreeRow[] {
  const rows: PlanningTreeRow[] = []
  const seen = new Set<string>()

  const ensureGroup = (id: string, title: string, depth: number, sequenceLabel: string, subtitle: string) => {
    if (seen.has(id)) return
    rows.push(buildSpatialGroupRow(id, title, depth, sequenceLabel, subtitle))
    seen.add(id)
  }

  ensureGroup('spatial-root', '项目空间', 0, '空间', '按楼栋 / 楼层 / 区域组织当前任务')

  for (const row of taskRows) {
    const spatial = row.spatialPath
    if (!spatial) {
      rows.push({ ...row, depth: 1 })
      continue
    }

    const buildingId = `spatial-building-${spatial.building.key}`
    const floorId = `${buildingId}-floor-${spatial.floor.key}`
    const zoneId = `${floorId}-zone-${spatial.zone.key}`

    ensureGroup(
      buildingId,
      spatial.building.label,
      1,
      spatial.building.missing ? '未分楼栋' : '楼栋',
      '楼栋范围',
    )
    ensureGroup(
      floorId,
      spatial.floor.label,
      2,
      spatial.floor.missing ? '未分楼层' : '楼层',
      spatial.building.label,
    )
    ensureGroup(
      zoneId,
      spatial.zone.label,
      3,
      spatial.zone.missing ? '未分区域' : '区域',
      `${spatial.building.label} / ${spatial.floor.label}`,
    )
    rows.push({ ...row, depth: 4 })
  }

  return rows
}

function compareTaskRowsBySpatialScope(
  left: WBSNode,
  right: WBSNode,
  labelsById?: Record<string, string>,
) {
  const leftScope = getTaskSpatialSortKey(left, labelsById)
  const rightScope = getTaskSpatialSortKey(right, labelsById)
  if (leftScope !== rightScope) return leftScope.localeCompare(rightScope, 'zh-Hans-CN')

  const leftStart = normalizeSortText(left.start_date ?? left.planned_start_date)
  const rightStart = normalizeSortText(right.start_date ?? right.planned_start_date)
  if (leftStart !== rightStart) return leftStart.localeCompare(rightStart)

  const leftWbs = normalizeSortText(left.wbs_code)
  const rightWbs = normalizeSortText(right.wbs_code)
  if (leftWbs !== rightWbs) return leftWbs.localeCompare(rightWbs, undefined, { numeric: true })

  return normalizeSortText(left.title).localeCompare(
    normalizeSortText(right.title),
    'zh-Hans-CN',
    { numeric: true },
  )
}

interface ParticipantUnitLookupRecord {
  id: string
  unit_name?: string | null
  unitName?: string | null
  unit_type?: string | null
  unitType?: string | null
}

interface GanttTaskRowsProps {
  tasks: Task[]
  taskConditions?: TaskCondition[]
  taskObstacles?: TaskObstacle[]
  flatList: WBSNode[]
  filteredFlatList: WBSNode[]
  collapsed: Set<string>
  selectedIds: Set<string>
  canEdit?: boolean
  expandedConditionTaskId: string | null
  inlineConditionsMap: Record<string, TaskCondition[]>
  taskProgressSnapshot: ProjectTaskProgressSnapshot
  projectMembers?: AssigneeComboboxOption[]
  participantUnits?: ParticipantUnitLookupRecord[]
  participantUnitsLoading?: boolean
  taskDraftPatches?: Record<string, Partial<Task>>
  taskDraftDirtyRowIds?: Set<string>
  taskDraftDirtyCellMap?: Map<string, Set<string>>
  taskDraftDirtyCount?: number
  taskDraftEditing?: boolean
  canUndoTaskDraft?: boolean
  canRedoTaskDraft?: boolean
  engineeringObjectLabelsById?: Record<string, string>
  inlineTitleTaskId: string | null
  inlineTitleValue: string
  onClearFilters: () => void
  onToggleCollapse: (nodeId: string) => void
  onToggleSelect: (nodeId: string) => void
  onToggleSelectAll?: () => void
  onSelectTask: (task: Task) => void
  onOpenMilestoneDialog: (task: Task) => void
  onOpenEditDialog: (task?: Task, parentId?: string) => void
  onOpenConditionDialog: (task: Task) => void
  onOpenObstacleDialog: (task: Task) => void
  onOpenDetailDrawer?: (task: Task, section: DrawerSection) => void
  onDeleteTask: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onSaveProgress: (taskId: string, value: number) => void | Promise<void>
  onSaveTaskPatch: (taskId: string, patch: Record<string, unknown>) => void | Promise<void>
  onLoadParticipantUnits?: () => void
  onOpenParticipantUnits?: (query?: string) => void
  onPasteRows?: (rows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => void
  onDeleteRows?: (rowIds: string[]) => void
  onFillRows?: (rowIds: string[], row: PlanningTreeClipboardRow) => void
  onUpdateCells?: (updates: PlanningTreeCellUpdate[]) => void
  onStartTaskDraft?: () => void
  onSaveTaskDraft?: () => void
  onCancelTaskDraft?: () => void
  onUndoTaskDraft?: () => void
  onRedoTaskDraft?: () => void
  presence?: PlanningTreePresenceState
  onActiveCellChange?: (cell: { rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null) => void
  onToggleInlineConditions: (taskId: string, event: MouseEvent) => void
  onToggleCondition?: (condition: TaskCondition) => void
  onStartInlineTitleEdit: (task: Task) => void
  onInlineTitleValueChange: (value: string) => void
  onInlineTitleSave: (taskId: string) => void
  onCancelInlineTitleEdit: () => void
  onOpenCriticalPath?: (taskId: string) => void
  onMarkCriticalPathAttention?: (taskId: string) => void
  onInsertBeforeChain?: (taskId: string) => void
  onInsertAfterChain?: (taskId: string) => void
  onRemoveCriticalPathOverride?: (taskId: string, mode?: 'manual_attention' | 'manual_insert') => void
  getBusinessStatus: (task: Task) => BusinessStatusView
  getCriticalPathTask: (taskId: string) => CriticalTaskSnapshot | null
  criticalPathOverrideFlags?: Map<string, CriticalOverrideFlags>
  dependencyChainIds?: Set<string>
  onHoverTaskId?: (taskId: string | null) => void
  emptyFilterTitle?: string
  onAddFirstRow?: () => void
  onGenerateTasks?: (task?: Task) => void
  onImportTasks?: (file: File) => void
  projectId?: string
  templateGenerateScope?: WbsTemplateGenerationScope
  templateGenerateScopeLabel?: string
  targetFeasibility?: WbsTargetFeasibility | null
  onQuickAddObstacle?: (task: Task, data: QuickBlockageDraft) => void | Promise<void>
  fieldRegistryFields?: PlanningTreeFieldConfigField[]
  fieldRegistryVersion?: string
  fieldConfigStorageKey?: string | null
  reconcileEntries?: ReconcileTaskEntry[]
  onReconcileEntryAction?: (taskId: string, action: 'merge_to_standard' | 'keep_both' | 'replace_with_standard') => void
  groupMode?: GroupMode
  onGroupModeChange?: (mode: GroupMode) => void
  viewMode?: PlanningViewMode
  onViewModeChange?: (mode: PlanningViewMode) => void
  readBusinessActionsSlot?: ReactNode
  editBusinessActionsSlot?: ReactNode
  ganttRenderer?: (props: {
    rows: PlanningTreeRow[]
    selectedRowIds: string[]
    onRowClick: (rowId: string) => void
    scale: 'day' | 'week' | 'month'
    onScaleChange?: (scale: 'day' | 'week' | 'month') => void
    readOnly: boolean
  }) => ReactNode
}

export const GanttTaskRows = memo(function GanttTaskRows(props: GanttTaskRowsProps) {
  const shouldProgressivelyRenderRows = props.viewMode !== 'gantt'
  const visibleExecutionFlatList = useMemo(
    () => props.filteredFlatList.filter(shouldShowTaskInMainExecutionList),
    [props.filteredFlatList],
  )
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(visibleExecutionFlatList.length, INITIAL_RENDERED_ROW_COUNT),
  )
  const [activeCell, setActiveCell] = useState<{ rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null>(null)

  useEffect(() => {
    const totalRows = visibleExecutionFlatList.length
    if (!shouldProgressivelyRenderRows) {
      setVisibleCount(totalRows)
      return undefined
    }
    if (totalRows <= INITIAL_RENDERED_ROW_COUNT) {
      setVisibleCount(totalRows)
      return undefined
    }

    setVisibleCount(INITIAL_RENDERED_ROW_COUNT)
    return undefined
  }, [props.taskDraftEditing, props.viewMode, shouldProgressivelyRenderRows, visibleExecutionFlatList.length])

  const handleLoadMoreRows = useCallback(() => {
    setVisibleCount((current) => Math.min(visibleExecutionFlatList.length, current + RENDER_CHUNK_SIZE))
  }, [visibleExecutionFlatList.length])

  const handleActiveCellChange = useCallback((cell: { rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null) => {
    setActiveCell(cell)
    props.onActiveCellChange?.(cell)
  }, [props.onActiveCellChange])

  useEffect(() => {
    if (!props.taskDraftEditing) setActiveCell(null)
  }, [props.taskDraftEditing])

  const orderedRows = useMemo(() => {
    const visibleExecutionRows = [...visibleExecutionFlatList]

    if (props.groupMode !== 'spatial') {
      return visibleExecutionRows.sort((left, right) => (
        compareTasksByExecutionOrder(left, right, props.engineeringObjectLabelsById)
      ))
    }

    return visibleExecutionRows.sort((left, right) => {
      const spatialOrder = compareTaskRowsBySpatialScope(left, right, props.engineeringObjectLabelsById)
      if (spatialOrder !== 0) return spatialOrder
      return compareTasksByExecutionOrder(left, right, props.engineeringObjectLabelsById)
    })
  }, [props.engineeringObjectLabelsById, props.groupMode, visibleExecutionFlatList])
  const visibleRows = useMemo(() => (
    shouldProgressivelyRenderRows
      ? orderedRows.slice(0, visibleCount)
      : orderedRows
  ), [orderedRows, shouldProgressivelyRenderRows, visibleCount])
  const hiddenRowCount = shouldProgressivelyRenderRows
    ? Math.max(0, orderedRows.length - visibleRows.length)
    : 0
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of props.tasks) {
      if (task.id) map.set(task.id, { ...task, ...(props.taskDraftPatches?.[task.id] ?? {}) })
    }
    return map
  }, [props.taskDraftPatches, props.tasks])
  const reconcileEntryByTaskId = useMemo(() => {
    const map = new Map<string, ReconcileTaskEntry>()
    for (const entry of props.reconcileEntries ?? []) {
      map.set(entry.taskId, entry)
    }
    return map
  }, [props.reconcileEntries])
  const conditionsByTaskId = useMemo(() => {
    const map = new Map<string, TaskCondition[]>()
    for (const condition of props.taskConditions ?? []) {
      if (!condition.task_id) continue
      const items = map.get(condition.task_id) ?? []
      items.push(condition)
      map.set(condition.task_id, items)
    }
    return map
  }, [props.taskConditions])
  const obstaclesByTaskId = useMemo(() => {
    const map = new Map<string, TaskObstacle[]>()
    for (const obstacle of props.taskObstacles ?? []) {
      if (!obstacle.task_id || !isActiveTaskObstacle(obstacle)) continue
      const items = map.get(obstacle.task_id) ?? []
      items.push(obstacle)
      map.set(obstacle.task_id, items)
    }
    return map
  }, [props.taskObstacles])
  const wouldCreateDependencyCycle = useCallback((taskId: string, candidateId: string) => {
    return getDependencyChain(candidateId, taskMap).has(taskId)
  }, [taskMap])
  const predecessorOptions: PredecessorOption[] = useMemo(() => props.tasks
    .filter((task) => Boolean(task.id))
    .map((task) => {
      const patchedTask = task.id ? taskMap.get(task.id) ?? task : task
      return {
        id: patchedTask.id,
        title: patchedTask.title || '未命名任务',
        wbsCode: patchedTask.wbs_code,
        engineeringObjectId: patchedTask.engineering_object_id ?? null,
        buildingObjectId: patchedTask.building_object_id ?? null,
        physicalZoneObjectId: patchedTask.physical_zone_object_id ?? null,
        functionalAreaObjectId: patchedTask.functional_area_object_id ?? null,
      }
    }), [props.tasks, taskMap])
  const participantUnitOptions = useMemo<ParticipantUnitLookupOption[]>(
    () => (props.participantUnits ?? [])
      .map((unit) => ({
        id: unit.id,
        unitName: (unit.unitName ?? unit.unit_name ?? '').trim(),
        unitType: unit.unitType ?? unit.unit_type ?? null,
      }))
      .filter((unit) => unit.id && unit.unitName),
    [props.participantUnits],
  )
  const taskRows: PlanningTreeRow[] = visibleRows.map((node, rowIndex) => {
    const task = {
      ...node,
      ...(props.taskDraftPatches?.[node.id] ?? {}),
    } as WBSNode
    const hasDisplayChildren = false
    const showTreeExpander = false
    const executionDisplayDepth = getTaskExecutionDisplayDepth(task)
    const isMilestoneLeaf = Boolean(task.is_milestone)
    const bizStatus = props.getBusinessStatus(task)
    const taskTitle = task.title || '未命名任务'
    const progressValue = clampProgress(Number(task.progress ?? 0))
    const plannedStart = task.start_date ?? task.planned_start_date ?? null
    const plannedEnd = task.end_date ?? task.planned_end_date ?? null
    const assigneeLabel = task.assignee_name || task.assignee || ''
    const unitLabel = task.participant_unit_name || ''
    const acceptanceImpactItems = normalizeAcceptanceImpactItems(task)
    const conditionSummary = props.taskProgressSnapshot.taskConditionMap[task.id]
    const taskConditions = conditionsByTaskId.get(task.id) ?? []
    const conditionBreakdown = getTaskConditionBreakdown(taskConditions, conditionSummary)
    const pendingHardConditionCount = getPendingHardConditionCount(taskConditions)
    const obstacleCount = props.taskProgressSnapshot.obstacleCountMap[task.id] ?? 0
    const taskObstacles = obstaclesByTaskId.get(task.id) ?? []
    const criticalTask = props.getCriticalPathTask(task.id)
    const criticalOverrideFlags = props.criticalPathOverrideFlags?.get(task.id)
    const isExecutableLeaf = task.is_executable !== false
    const scopeLabel = getTaskScopeLabel(task, props.engineeringObjectLabelsById)
    const progressReadOnlyReason = getTaskProgressReadOnlyReason(task.progress_method)
    const wbsSemanticType = getTaskWbsNodeType(task)
    const standardTaskMetadata = readTaskStandardMetadata(task)
    const reconcileEntry = reconcileEntryByTaskId.get(task.id)
    const planItemKind = getPlanItemKindFromMetadata(standardTaskMetadata, {
      isMilestone: Boolean(task.is_milestone),
      relationRole: standardTaskMetadata.relationRole,
      packType: standardTaskMetadata.packType ?? (task as unknown as Record<string, unknown>).pack_type,
    })
    const planItemTags = getPlanItemTagsFromMetadata(standardTaskMetadata)
    const progressMode = getProgressModeFromMetadata(standardTaskMetadata, planItemKind)
    const linkedProjectionSource = getLinkedProjectionSourceFromMetadata(standardTaskMetadata)
    const predecessorIds = Array.isArray(task.dependencies)
      ? task.dependencies.map((value) => String(value ?? '').trim()).filter(Boolean)
      : []
    const tableEditAllowed = Boolean(props.canEdit && props.taskDraftEditing)
    const isCellActive = (field: PlanningTreeCellKey) => (
      tableEditAllowed && activeCell?.rowId === task.id && activeCell.field === field
    )
    const isScheduleCellActive = isCellActive('start') || isCellActive('end')
    const shouldRenderPredecessorEditor = tableEditAllowed && isExecutableLeaf && isCellActive('title')
    const predecessors = shouldRenderPredecessorEditor
      ? predecessorIds.map((taskId) => (
        predecessorOptions.find((option) => option.id === taskId)
        ?? { id: taskId, title: `任务 ${taskId.slice(0, 8)}` }
      ))
      : []
    const getAvailablePredecessors = shouldRenderPredecessorEditor
      ? () => predecessorOptions.filter((option) => (
        option.id !== task.id && !wouldCreateDependencyCycle(task.id, option.id)
      ))
      : undefined

    return {
      id: task.id,
      title: taskTitle,
      subtitle: isMilestoneLeaf ? '里程碑' : getWbsNodeTypeLabel(wbsSemanticType, node.depth <= 0 ? '分部工程' : node.depth === 1 ? '分项工程' : '施工任务'),
      depth: executionDisplayDepth,
      sequenceLabel: task.wbs_code || String(rowIndex + 1),
      wbsCode: task.wbs_code,
      engineeringCategoryId: task.engineering_category_id ?? null,
      wbsNodeType: wbsSemanticType,
      isExecutable: task.is_executable,
      rowType: isMilestoneLeaf ? 'milestone' : hasDisplayChildren ? 'structure' : 'leaf',
      isMilestone: Boolean(task.is_milestone),
      isCritical: Boolean(criticalTask),
      rowProjectionMode: getRowProjectionModeFromMetadata(standardTaskMetadata),
      rowClassName: getAccelerationTaskClassName(task.id, props.targetFeasibility),
      executionPhase: typeof standardTaskMetadata.executionPhase === 'string'
        ? standardTaskMetadata.executionPhase
        : typeof standardTaskMetadata.execution_phase === 'string'
          ? standardTaskMetadata.execution_phase
          : null,
      executionLane: typeof standardTaskMetadata.executionLane === 'string'
        ? standardTaskMetadata.executionLane
        : typeof standardTaskMetadata.execution_lane === 'string'
          ? standardTaskMetadata.execution_lane
          : null,
      executionSortKey: typeof standardTaskMetadata.executionSortKey === 'number'
        ? standardTaskMetadata.executionSortKey
        : typeof standardTaskMetadata.execution_sort_key === 'number'
          ? standardTaskMetadata.execution_sort_key
          : null,
      workfaceId: typeof standardTaskMetadata.workfaceId === 'string'
        ? standardTaskMetadata.workfaceId
        : typeof standardTaskMetadata.workface_id === 'string'
          ? standardTaskMetadata.workface_id
          : null,
      planItemKind,
      relationRole: typeof standardTaskMetadata.relationRole === 'string'
        ? standardTaskMetadata.relationRole
        : typeof standardTaskMetadata.relation_role === 'string'
          ? standardTaskMetadata.relation_role
          : null,
      planItemTags,
      progressMode,
      scheduleParticipation: getScheduleParticipationFromMetadata(standardTaskMetadata),
      scopeExpansionMode: getScopeExpansionModeFromMetadata(standardTaskMetadata),
      linkedProjectionSource,
      startingLineClass: getTaskStartingLineClass(standardTaskMetadata),
      reconcilePhase: reconcileEntry?.phase ?? null,
      selected: props.selectedIds.has(task.id),
      isPersisted: true,
      isNew: false,
      childCount: 0,
      hasConditions: taskConditions.length > 0,
      hasBlockages: taskObstacles.length > 0 || obstacleCount > 0,
      hasAcceptanceLinks: acceptanceImpactItems.length > 0,
      startDateLabel: plannedStart ?? '-',
      endDateLabel: plannedEnd ?? '-',
      durationLabel: getTaskDurationLabel(plannedStart, plannedEnd),
      durationRiskRangeLabel: getTaskDurationRiskRangeLabel(task),
      criticalFloatLabel: getTaskCriticalFloatLabel({
        is_critical: Boolean(criticalTask),
        total_float_days: task.total_float_days,
        free_float_days: task.free_float_days,
      }),
      durationAssetEvidenceLabel: getTaskDurationAssetEvidenceLabel(task),
      durationForecast: null,
      durationSuggestionQuery: tableEditAllowed && isScheduleCellActive
        ? {
          taskId: task.id,
          projectId: task.project_id,
          engineeringCategoryId: task.engineering_category_id ?? null,
          wbsNodeType: wbsSemanticType,
          standardWorkCode: task.standard_work_code ?? null,
          standardWorkName: task.standard_work_name ?? null,
          taskTitle,
          plannedStartDate: plannedStart,
          plannedEndDate: plannedEnd,
          engineeringObjectId: task.engineering_object_id ?? null,
          buildingObjectId: task.building_object_id ?? null,
          floorObjectId: task.floor_object_id ?? null,
          zoneObjectId: task.physical_zone_object_id ?? task.functional_area_object_id ?? null,
          responsibleUnitId: task.participant_unit_id ?? null,
          acceptanceRequired: task.acceptance_required ?? null,
          materialRequired: task.material_required ?? null,
        }
        : null,
      progressLabel: `${progressValue}%`,
      assigneeLabel: assigneeLabel || '-',
      unitLabel: unitLabel || '-',
      scopeLabel,
      spatialPath: props.groupMode === 'spatial'
        ? {
          building: getSpatialSegment(task.building_object_id, props.engineeringObjectLabelsById, '楼栋'),
          floor: getSpatialSegment(task.floor_object_id, props.engineeringObjectLabelsById, '楼层'),
          zone: getSpatialSegment(task.physical_zone_object_id ?? task.functional_area_object_id, props.engineeringObjectLabelsById, '区域'),
        }
        : undefined,
      statusLabel: bizStatus.label,
      onOpenDetail: () => props.onOpenDetailDrawer?.(task, 'basic'),
      onEdit: tableEditAllowed ? () => props.onOpenEditDialog(task) : undefined,
      onAddChild: tableEditAllowed ? () => props.onOpenEditDialog(undefined, task.id) : undefined,
      onSmartExpand: tableEditAllowed && props.onGenerateTasks ? () => props.onGenerateTasks?.(task) : undefined,
      onToggleMilestone: tableEditAllowed ? () => props.onOpenMilestoneDialog(task) : undefined,
      onDelete: tableEditAllowed ? () => props.onDeleteTask(task.id) : undefined,
      onOpenCriticalPath: criticalTask ? () => props.onOpenCriticalPath?.(task.id) : undefined,
      onChangeNodeType: tableEditAllowed ? (nodeType) => {
        void props.onSaveTaskPatch(task.id, { wbs_node_type: nodeType })
      } : undefined,
      onMarkCriticalPathAttention: tableEditAllowed && isExecutableLeaf && !criticalOverrideFlags?.hasManualAttentionOverride
        ? () => props.onMarkCriticalPathAttention?.(task.id)
        : undefined,
      onInsertBeforeChain: tableEditAllowed && isExecutableLeaf
        ? () => props.onInsertBeforeChain?.(task.id)
        : undefined,
      onInsertAfterChain: tableEditAllowed && isExecutableLeaf
        ? () => props.onInsertAfterChain?.(task.id)
        : undefined,
      onRemoveCriticalPathAttention: tableEditAllowed && criticalOverrideFlags?.hasManualAttentionOverride
        ? () => props.onRemoveCriticalPathOverride?.(task.id, 'manual_attention')
        : undefined,
      onRemoveCriticalPathInsert: tableEditAllowed && criticalOverrideFlags?.hasManualInsertOverride
        ? () => props.onRemoveCriticalPathOverride?.(task.id, 'manual_insert')
        : undefined,
      titleCell: (
        <div className="flex min-w-0 items-center gap-2">
          {showTreeExpander ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${props.collapsed.has(task.id) ? '展开' : '收起'} ${taskTitle}`}
              onClick={(event) => {
                event.stopPropagation()
                props.onToggleCollapse(task.id)
              }}
              className="h-7 w-7 shrink-0 rounded-md text-slate-500"
            >
              {props.collapsed.has(task.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          ) : (
            <span className="h-7 w-7 shrink-0" aria-hidden="true" />
          )}
          {tableEditAllowed && props.inlineTitleTaskId === task.id ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                value={props.inlineTitleValue}
                onChange={(event) => props.onInlineTitleValueChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') props.onInlineTitleSave(task.id)
                  if (event.key === 'Escape') props.onCancelInlineTitleEdit()
                }}
                autoFocus
                className="h-8 min-w-0 border-slate-200 bg-white text-sm"
                onClick={(event) => event.stopPropagation()}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 rounded-md text-blue-600 hover:bg-blue-50"
                aria-label={`保存 ${taskTitle} 名称`}
                onClick={(event) => {
                  event.stopPropagation()
                  props.onInlineTitleSave(task.id)
                }}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              {pendingHardConditionCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button unstyled
                      type="button"
                      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      data-testid="task-hard-condition-blocked"
                      onClick={(event) => {
                        event.stopPropagation()
                        props.onOpenDetailDrawer?.(task, 'conditions')
                      }}
                    >
                      开工受阻
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{pendingHardConditionCount} 项硬条件未满足</TooltipContent>
                </Tooltip>
              ) : null}
              <Button unstyled
                type="button"
                data-testid="gantt-task-title-inline-edit-trigger"
                className={cn(
                  'flex min-w-0 flex-1 overflow-hidden text-left hover:text-blue-700',
                  getWbsSemanticTitleClass(wbsSemanticType, node.depth),
                )}
                onClick={(event) => {
                  if (tableEditAllowed) {
                    event.stopPropagation()
                    props.onStartInlineTitleEdit(task)
                    return
                  }
                  props.onSelectTask(task)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (tableEditAllowed) props.onStartInlineTitleEdit(task)
                }}
              >
                <span className="block min-w-0 flex-1 truncate">{taskTitle}</span>
              </Button>
            </>
          )}
          {accelerationTaskBadge(task.id, props.targetFeasibility)}
          {scopeLabel ? (
            <Button unstyled
              type="button"
              className="hidden max-w-[9rem] shrink-0 items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-100 xl:inline-flex"
              title={scopeLabel}
              onClick={(event) => {
                event.stopPropagation()
                props.onOpenDetailDrawer?.(task, 'scope')
              }}
            >
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{scopeLabel}</span>
            </Button>
          ) : null}
          {shouldRenderPredecessorEditor ? (
            <PredecessorSelector
              predecessors={predecessors}
              getAvailableTasks={getAvailablePredecessors}
              currentScope={{
                engineeringObjectId: task.engineering_object_id ?? null,
                buildingObjectId: task.building_object_id ?? null,
                physicalZoneObjectId: task.physical_zone_object_id ?? null,
                functionalAreaObjectId: task.functional_area_object_id ?? null,
              }}
              isCritical={Boolean(criticalTask)}
              disabled={!tableEditAllowed}
              className={cn(
                'hidden shrink-0 rounded-md px-1.5 xl:inline-flex',
                predecessorIds.length === 0 && !criticalTask && 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
              )}
              onAdd={(taskId) => {
                if (predecessorIds.includes(taskId)) return
                void props.onSaveTaskPatch(task.id, { dependencies: [...predecessorIds, taskId] })
              }}
              onRemove={(taskId) => {
                void props.onSaveTaskPatch(task.id, { dependencies: predecessorIds.filter((id) => id !== taskId) })
              }}
            />
          ) : null}
        </div>
      ),
      extra: (
        <TaskIssueChipBand
          task={task}
          conditionSummary={conditionSummary}
          conditionBreakdown={conditionBreakdown}
          conditions={taskConditions}
          obstacles={taskObstacles}
          obstacleCount={obstacleCount}
          criticalTask={criticalTask}
          acceptanceImpactItems={acceptanceImpactItems}
          isExecutableLeaf={isExecutableLeaf}
          canEdit={props.canEdit}
          onOpenDetailDrawer={props.onOpenDetailDrawer}
          onOpenConditionDialog={props.onOpenConditionDialog}
          onOpenObstacleDialog={props.onOpenObstacleDialog}
          onToggleCondition={props.onToggleCondition}
          onQuickAddObstacle={props.onQuickAddObstacle}
        />
      ),
      startCell: isCellActive('start') ? (
          <TaskDateCell
            label={`编辑 ${taskTitle} 计划开始`}
            value={plannedStart}
            readOnly={false}
            onSave={(value) => props.onSaveTaskPatch(task.id, { start_date: value, planned_start_date: value })}
          />
      ) : undefined,
      endCell: isCellActive('end') ? (
          <TaskDateCell
            label={`编辑 ${taskTitle} 计划完成`}
            value={plannedEnd}
            readOnly={false}
            onSave={(value) => props.onSaveTaskPatch(task.id, { end_date: value, planned_end_date: value })}
          />
      ) : undefined,
      progressCell: isCellActive('progress') ? (
        <div className="flex items-center justify-end gap-2">
          <div className="hidden h-2 w-16 overflow-hidden rounded-full bg-slate-100 2xl:block">
            <div
              className={task.status === 'completed' ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-blue-600'}
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <TaskProgressCell
            taskId={task.id}
            taskTitle={taskTitle}
            value={progressValue}
            readOnly={false}
            readOnlyReason={progressReadOnlyReason}
            onSave={props.onSaveProgress}
          />
        </div>
      ) : undefined,
      assigneeCell: isCellActive('assignee') ? (
        <TaskAssigneeCell
          label={`编辑 ${taskTitle} 负责人`}
          valueName={assigneeLabel}
          valueUserId={task.assignee_user_id ?? null}
          members={props.projectMembers ?? []}
          readOnly={false}
          onSave={(value) => props.onSaveTaskPatch(task.id, {
            assignee_name: value.assignee_name || null,
            assignee: value.assignee_name || null,
            assignee_user_id: value.assignee_user_id,
          })}
        />
      ) : undefined,
      unitCell: isCellActive('unit') ? (
        <TaskParticipantUnitCell
          label={`编辑 ${taskTitle} 责任单位`}
          valueId={task.participant_unit_id ?? null}
          valueLabel={unitLabel}
          options={participantUnitOptions}
          loading={props.participantUnitsLoading}
          readOnly={false}
          onLoadOptions={props.onLoadParticipantUnits}
          onOpenCreate={props.onOpenParticipantUnits}
          onSave={(unitId) => props.onSaveTaskPatch(task.id, { participant_unit_id: unitId })}
        />
      ) : undefined,
    } satisfies PlanningTreeRow
  })
  const tableRows = props.groupMode === 'spatial'
    ? buildSpatialPlanningRows(taskRows)
    : taskRows

  return (
    <>
      <CardContent className="p-0" data-testid="gantt-task-rows">
        {props.tasks.length === 0 ? (
          <TaskListEmptyState
            onAddFirstRow={props.onAddFirstRow ?? (() => props.onOpenEditDialog())}
            onGenerateTasks={props.onGenerateTasks}
            onImportTasks={props.onImportTasks}
            canEdit={props.canEdit}
            className="rounded-none border-0 bg-transparent"
          />
        ) : visibleExecutionFlatList.length === 0 ? (
          <EmptyState
            variant="filter"
            icon={Search}
            title={props.emptyFilterTitle || '没有匹配的任务'}
            className="max-w-none rounded-none border-0 bg-transparent py-10 shadow-none"
            onClearFilter={props.onClearFilters}
          />
        ) : (
          <GanttTaskPlanningTreeAdapter
            rows={tableRows}
            selectedIds={props.selectedIds}
            canEdit={props.canEdit}
            taskDraftEditing={props.taskDraftEditing}
            taskDraftDirtyCount={props.taskDraftDirtyCount}
            taskDraftDirtyRowIds={props.taskDraftDirtyRowIds}
            taskDraftDirtyCellMap={props.taskDraftDirtyCellMap}
            canUndoTaskDraft={props.canUndoTaskDraft}
            canRedoTaskDraft={props.canRedoTaskDraft}
            hiddenRowCount={hiddenRowCount}
            viewMode={props.viewMode}
            groupMode={props.groupMode}
            onGroupModeChange={props.onGroupModeChange}
            fieldRegistryFields={props.fieldRegistryFields}
            fieldRegistryVersion={props.fieldRegistryVersion}
            fieldConfigStorageKey={props.fieldConfigStorageKey}
            presence={props.presence}
            readBusinessActionsSlot={props.readBusinessActionsSlot}
            editBusinessActionsSlot={props.editBusinessActionsSlot}
            ganttRenderer={props.ganttRenderer}
            defaultCollapseDepth={2}
            reconcileEntries={props.reconcileEntries}
            onReconcileEntryAction={props.onReconcileEntryAction}
            onToggleSelect={props.onToggleSelect}
            onToggleSelectAll={props.onToggleSelectAll}
            onPasteRows={props.onPasteRows}
            onDeleteRows={props.onDeleteRows}
            onFillRows={props.onFillRows}
            onUpdateCells={props.onUpdateCells}
            onActiveCellChange={handleActiveCellChange}
            onStartTaskDraft={props.onStartTaskDraft}
            onSaveTaskDraft={props.onSaveTaskDraft}
            onCancelTaskDraft={props.onCancelTaskDraft}
            onUndoTaskDraft={props.onUndoTaskDraft}
            onRedoTaskDraft={props.onRedoTaskDraft}
            onViewModeChange={props.onViewModeChange}
            onLoadMoreRows={hiddenRowCount > 0 ? handleLoadMoreRows : undefined}
          />
        )}
      </CardContent>
    </>
  )
})

GanttTaskRows.displayName = 'GanttTaskRows'
