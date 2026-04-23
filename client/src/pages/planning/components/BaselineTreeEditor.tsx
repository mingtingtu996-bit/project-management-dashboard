import { useMemo } from 'react'

import { PlanningTreeView, type PlanningTreeRow } from '@/components/planning/PlanningTreeView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowDown, ArrowUp, ListChecks } from 'lucide-react'

export interface BaselineTreeEditorProps {
  title?: string
  description?: string
  summaryLabel?: string
  unlockLabel?: string
  treeTitle?: string
  treeDescription?: string
  treeEmptyLabel?: string
  testId?: string
  rows: PlanningTreeRow[]
  selectedCount: number
  readOnly: boolean
  isDirty: boolean
  lockRemainingLabel: string
  canUndo: boolean
  canRedo: boolean
  onToggleRow?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onForceUnlock: () => void
}

export function BaselineTreeEditor({
  title = '基线树编辑器',
  description = '这里维护项目基线树、层级结构和节点勾选，确认前可以先完成主干编辑与版本复核准备。',
  summaryLabel = '基线草稿收口',
  unlockLabel = '强制解锁入口',
  treeTitle = '基线树',
  treeDescription = 'L1-L5 结构树已接入统一勾选、批量条和只读控制。',
  treeEmptyLabel = '暂时没有基线条目',
  testId = 'baseline-tree-editor',
  rows,
  selectedCount,
  readOnly,
  isDirty,
  lockRemainingLabel,
  canUndo,
  canRedo,
  onToggleRow,
  onToggleAll,
  onUndo,
  onRedo,
  onForceUnlock,
}: BaselineTreeEditorProps) {
  const stateLabel = useMemo(() => {
    if (readOnly) return '只读查看态'
    if (isDirty) return '有未保存更改'
    return '可编辑'
  }, [isDirty, readOnly])

  return (
    <Card className="border-slate-200 shadow-sm" data-testid={testId}>
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl">{title}</CardTitle>
            <p className="text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{summaryLabel}</Badge>
            <Badge variant="outline">{stateLabel}</Badge>
            <Badge variant="secondary">{selectedCount} 已选</Badge>
            <Badge variant="outline">锁剩余 {lockRemainingLabel}</Badge>
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
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onForceUnlock}>
            <ListChecks className="h-4 w-4" />
            {unlockLabel}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {readOnly ? (
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            当前为只读查看态，先看结构，不直接改动。
          </div>
        ) : null}

        <PlanningTreeView
          title={treeTitle}
          description={treeDescription}
          rows={rows}
          selectedCount={selectedCount}
          onToggleRow={onToggleRow}
          onToggleAll={onToggleAll}
          readOnly={readOnly}
          emptyLabel={treeEmptyLabel}
        />
      </CardContent>
    </Card>
  )
}
