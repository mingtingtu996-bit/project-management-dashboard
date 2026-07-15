import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { GroupModeToggle } from '@/components/planning/GroupModeToggle'
import {
  PlanningTreeTable,
  type PlanningTreeCellUpdate,
  type PlanningTreeClipboardRow,
  type PlanningTreeFieldConfigField,
  type PlanningTreePresenceState,
  type PlanningTreeCellKey,
  type PlanningTreeRow,
  type PlanningViewMode,
} from '@/components/planning/PlanningTreeView'
import type { GroupMode } from '@/hooks/useGroupMode'
import type { ReconcileTaskEntry } from '@/components/planning/ReconcileBanner'

type GanttTaskPlanningTreeAdapterProps = {
  rows: PlanningTreeRow[]
  selectedIds: Set<string>
  canEdit?: boolean
  taskDraftEditing?: boolean
  taskDraftDirtyCount?: number
  taskDraftDirtyRowIds?: Set<string>
  taskDraftDirtyCellMap?: Map<string, Set<string>>
  canUndoTaskDraft?: boolean
  canRedoTaskDraft?: boolean
  hiddenRowCount: number
  groupMode?: GroupMode
  viewMode?: PlanningViewMode
  fieldRegistryFields?: PlanningTreeFieldConfigField[]
  fieldRegistryVersion?: string
  fieldConfigStorageKey?: string | null
  defaultCollapseDepth?: number
  reconcileEntries?: ReconcileTaskEntry[]
  onReconcileEntryAction?: (rowId: string, action: 'merge_to_standard' | 'keep_both' | 'replace_with_standard') => void
  presence?: PlanningTreePresenceState
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
  onToggleSelect: (nodeId: string) => void
  onToggleSelectAll?: () => void
  onPasteRows?: (rows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => void
  onDeleteRows?: (rowIds: string[]) => void
  onFillRows?: (rowIds: string[], row: PlanningTreeClipboardRow) => void
  onUpdateCells?: (updates: PlanningTreeCellUpdate[]) => void
  onActiveCellChange?: (cell: { rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null) => void
  onStartTaskDraft?: () => void
  onSaveTaskDraft?: () => void | Promise<void>
  onCancelTaskDraft?: () => void | Promise<void>
  onUndoTaskDraft?: () => void
  onRedoTaskDraft?: () => void
  onGroupModeChange?: (mode: GroupMode) => void
  onViewModeChange?: (mode: PlanningViewMode) => void
  onLoadMoreRows?: () => void
}

export function GanttTaskPlanningTreeAdapter(props: GanttTaskPlanningTreeAdapterProps) {
  return (
    <div className="overflow-hidden">
      <div
        data-testid="gantt-task-list-toolbar"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          {props.groupMode && props.onGroupModeChange ? (
            <GroupModeToggle groupMode={props.groupMode} onChange={props.onGroupModeChange} />
          ) : null}
          <span className="text-xs text-slate-400">当前 {props.rows.length + props.hiddenRowCount} 行</span>
          {props.hiddenRowCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              data-testid="gantt-load-more-rows"
              onClick={props.onLoadMoreRows}
            >
              加载更多
            </Button>
          ) : null}
          {props.taskDraftDirtyCount ? (
            <span
              data-testid="gantt-task-draft-count"
              className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            >
              {props.taskDraftDirtyCount} 行未保存
            </span>
          ) : null}
        </div>
      </div>
      <PlanningTreeTable
        title="执行任务表"
        rows={props.rows}
        selectedCount={props.selectedIds.size}
        onToggleRow={props.onToggleSelect}
        onToggleAll={props.onToggleSelectAll}
        onPasteRows={props.taskDraftEditing ? props.onPasteRows : undefined}
        onDeleteRows={props.taskDraftEditing ? props.onDeleteRows : undefined}
        onFillRows={props.taskDraftEditing ? props.onFillRows : undefined}
        onUpdateCells={props.taskDraftEditing ? props.onUpdateCells : undefined}
        presence={props.presence}
        onActiveCellChange={props.onActiveCellChange}
        dirtyRowIds={props.taskDraftDirtyRowIds}
        dirtyCellMap={props.taskDraftDirtyCellMap}
        canUndo={props.canUndoTaskDraft}
        canRedo={props.canRedoTaskDraft}
        onUndo={props.onUndoTaskDraft}
        onRedo={props.onRedoTaskDraft}
        readOnly={props.canEdit === false}
        rowMode={props.taskDraftEditing ? 'edit' : 'read'}
        embedded
        variant="task"
        toolbar
        viewMode={props.viewMode ?? 'list'}
        onViewModeChange={props.onViewModeChange}
        enabledViews={['list', 'card', 'detail', 'gantt']}
        defaultView="list"
        ganttRenderer={props.ganttRenderer}
        showEditModeToolbar
        showBusinessActionsSlot
        toolbarMode={props.taskDraftEditing ? 'full' : 'task_read'}
        readBusinessActionsSlot={props.readBusinessActionsSlot}
        editBusinessActionsSlot={props.editBusinessActionsSlot}
        onStartEdit={props.onStartTaskDraft}
        onSave={props.onSaveTaskDraft}
        saveDisabled={!props.taskDraftDirtyCount}
        onCancelEdit={props.onCancelTaskDraft}
        density="comfortable"
        emptyLabel="暂无任务"
        fieldRegistryFields={props.fieldRegistryFields}
        fieldRegistryVersion={props.fieldRegistryVersion}
        fieldConfigStorageKey={props.fieldConfigStorageKey}
        defaultCollapseDepth={props.defaultCollapseDepth}
        onReconcileEntryAction={props.onReconcileEntryAction}
      />
      {props.hiddenRowCount > 0 ? (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-slate-500">
            <span data-testid="gantt-progressive-render-hint">
              已加载首批任务，剩余 {props.hiddenRowCount} 行可继续加载
            </span>
            <span className="text-slate-400">可在表格顶部继续加载</span>
          </div>
        </>
      ) : null}
    </div>
  )
}
