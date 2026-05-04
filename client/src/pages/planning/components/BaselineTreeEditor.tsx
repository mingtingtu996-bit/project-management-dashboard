import { useMemo } from 'react'

import { PlanningTreeView, type PlanningTreeRow } from '@/components/planning/PlanningTreeView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  canForceUnlock?: boolean
  forceUnlockDisabledReason?: string | null
  onToggleRow?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onForceUnlock?: () => void
}

export function BaselineTreeEditor({
  title = '基线树编辑器',
  description = '',
  summaryLabel = '基线草稿收口',
  unlockLabel = '强制解锁入口',
  treeTitle = '基线树',
  treeDescription = '',
  treeEmptyLabel = '暂时没有基线条目',
  testId = 'baseline-tree-editor',
  rows,
  selectedCount,
  readOnly,
  isDirty,
  lockRemainingLabel,
  canUndo,
  canRedo,
  canForceUnlock = false,
  forceUnlockDisabledReason = null,
  onToggleRow,
  onToggleAll,
  onUndo,
  onRedo,
  onForceUnlock,
}: BaselineTreeEditorProps) {
  void description

  const stateLabel = useMemo(() => {
    if (readOnly) return '只读查看态'
    if (isDirty) return '有未保存更改'
    return '可编辑'
  }, [isDirty, readOnly])

  return (
    <Card className="surface-card" data-testid={testId}>
      <CardContent padding="md" className="space-y-3 bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardHead eyebrow="BASELINE TREE" title={title} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{summaryLabel}</Badge>
            <Badge variant="outline">{stateLabel}</Badge>
            <Badge variant="secondary">{selectedCount} 已选</Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge variant="outline">锁剩余 {lockRemainingLabel}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>其他用户正在编辑，暂时无法修改</TooltipContent>
            </Tooltip>
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
          {canForceUnlock ? (
            <DisabledReasonTooltip reason={forceUnlockDisabledReason}>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={onForceUnlock}
                disabled={Boolean(forceUnlockDisabledReason)}
              >
                <ListChecks className="h-4 w-4" />
                {unlockLabel}
              </Button>
            </DisabledReasonTooltip>
          ) : null}
        </div>
      </CardContent>
      <Separator />

      <CardContent className="p-0">
        {readOnly ? <Separator /> : null}

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
