import {
  PlanningTreeTable,
  type PlanningTreeCellUpdate,
  type PlanningTreeClipboardRow,
  type PlanningTreePresenceState,
  type PlanningTreeRow,
  type PlanningTreeCellKey,
  type PlanningTreeFieldConfigField,
  type PlanningViewMode,
  type PlanningRowMode,
} from '@/components/planning/PlanningTreeView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { Separator } from '@/components/ui/separator'
import { ArrowDown, ArrowUp } from 'lucide-react'

export interface PlanTreeEditorProps {
  title?: string
  description?: string
  summaryLabel?: string
  unlockLabel?: string
  treeTitle?: string
  treeDescription?: string
  treeEmptyLabel?: string
  treeVariant?: 'baseline' | 'monthly' | 'task' | 'schedule'
  testId?: string
  rows: PlanningTreeRow[]
  selectedCount: number
  readOnly: boolean
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  embedded?: boolean
  onToggleRow?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  onPasteRows?: (rows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => void
  onDeleteRows?: (rowIds: string[]) => void
  onFillRows?: (rowIds: string[], row: PlanningTreeClipboardRow) => void
  onUpdateCells?: (updates: PlanningTreeCellUpdate[]) => void
  presence?: PlanningTreePresenceState
  onActiveCellChange?: (cell: { rowId: string; field: PlanningTreeCellKey; rowTitle: string } | null) => void
  onUndo: () => void
  onRedo: () => void
  // v1.4.7.1: view mode and edit mode
  viewMode?: PlanningViewMode
  rowMode?: PlanningRowMode
  onViewModeChange?: (mode: PlanningViewMode) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onSave?: () => void
  dirtyRowIds?: Set<string>
  dirtyCellMap?: Map<string, Set<string>>
  fieldRegistryFields?: PlanningTreeFieldConfigField[]
  fieldRegistryVersion?: string
  fieldConfigStorageKey?: string | null
}

export function PlanTreeEditor({
  title = '总进度计划表',
  description = '',
  summaryLabel = '计划表收口',
  unlockLabel = '',
  treeTitle = '总进度计划表',
  treeDescription = '',
  treeEmptyLabel = '暂时没有基线条目',
  treeVariant = 'baseline',
  testId = 'baseline-tree-editor',
  rows,
  selectedCount,
  readOnly,
  isDirty,
  canUndo,
  canRedo,
  embedded = false,
  onToggleRow,
  onToggleAll,
  onPasteRows,
  onDeleteRows,
  onFillRows,
  onUpdateCells,
  presence,
  onActiveCellChange,
  onUndo,
  onRedo,
  // v1.4.7.1
  viewMode,
  rowMode,
  onViewModeChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  dirtyRowIds,
  dirtyCellMap,
  fieldRegistryFields,
  fieldRegistryVersion,
  fieldConfigStorageKey,
}: PlanTreeEditorProps) {
  void description
  void summaryLabel
  void unlockLabel

  const totalCount = rows.length

  if (embedded) {
    return (
      <section className="surface-card overflow-hidden" data-testid={testId}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <CardHead eyebrow="总进度计划" title={treeTitle} />
            <div className="text-xs text-slate-500">
              {totalCount} 项{readOnly ? '' : ` · ${selectedCount} 已选`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="撤销基线树编辑"
                  onClick={onUndo}
                  disabled={!canUndo}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="重做基线树编辑"
                  onClick={onRedo}
                  disabled={!canRedo}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <PlanningTreeTable
          title={treeTitle}
          description={treeDescription}
          rows={rows}
          selectedCount={selectedCount}
          onToggleRow={onToggleRow}
          onToggleAll={onToggleAll}
          onPasteRows={onPasteRows}
          onDeleteRows={onDeleteRows}
          onFillRows={onFillRows}
          onUpdateCells={onUpdateCells}
          presence={presence}
          onActiveCellChange={onActiveCellChange}
          readOnly={readOnly}
          emptyLabel={treeEmptyLabel}
          embedded
          variant={treeVariant}
          density="comfortable"
          viewMode={viewMode}
          rowMode={rowMode}
          onViewModeChange={onViewModeChange}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSave={onSave}
          dirtyRowIds={dirtyRowIds}
          dirtyCellMap={dirtyCellMap}
          fieldRegistryFields={fieldRegistryFields}
          fieldRegistryVersion={fieldRegistryVersion}
          fieldConfigStorageKey={fieldConfigStorageKey}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </section>
    )
  }

  return (
    <Card className="surface-card" data-testid={testId}>
      <CardContent padding="md" className="space-y-3 bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardHead eyebrow="总进度计划" title={title} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && isDirty ? <Badge variant="secondary">有未保存更改</Badge> : null}
            {!readOnly ? <Badge variant="outline">{selectedCount} 已选</Badge> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onUndo}
            disabled={readOnly || !canUndo}
          >
            <ArrowUp className="h-4 w-4" />
            撤销
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onRedo}
            disabled={readOnly || !canRedo}
          >
            <ArrowDown className="h-4 w-4" />
            重做
          </Button>
        </div>
      </CardContent>
      <Separator />

      <CardContent className="p-0">
        {readOnly ? <Separator /> : null}

        <PlanningTreeTable
          title={treeTitle}
          description={treeDescription}
          rows={rows}
          selectedCount={selectedCount}
          onToggleRow={onToggleRow}
          onToggleAll={onToggleAll}
          onPasteRows={onPasteRows}
          onDeleteRows={onDeleteRows}
          onFillRows={onFillRows}
          onUpdateCells={onUpdateCells}
          presence={presence}
          onActiveCellChange={onActiveCellChange}
          readOnly={readOnly}
          emptyLabel={treeEmptyLabel}
          variant={treeVariant}
          density="comfortable"
          viewMode={viewMode}
          rowMode={rowMode}
          onViewModeChange={onViewModeChange}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSave={onSave}
          dirtyRowIds={dirtyRowIds}
          dirtyCellMap={dirtyCellMap}
          fieldRegistryFields={fieldRegistryFields}
          fieldRegistryVersion={fieldRegistryVersion}
          fieldConfigStorageKey={fieldConfigStorageKey}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </CardContent>
    </Card>
  )
}
