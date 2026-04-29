import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PlanningDraftStatus } from '@/hooks/usePlanningStore'
import { ArrowRightCircle, BadgeInfo, FileDiff, RotateCcw, RotateCw, Save, Sparkles } from 'lucide-react'

interface MonthlyPlanBottomBarProps {
  draftStatus: PlanningDraftStatus
  quickAvailable: boolean
  canSaveDraft: boolean
  canStandardConfirm: boolean
  selectedCount?: number
  isDirty?: boolean
  lockRemainingLabel?: string
  canUndo?: boolean
  canRedo?: boolean
  blockingIssueCount?: number
  onSaveDraft: () => void
  onQuickConfirmEntry: () => void
  onStandardConfirmEntry: () => void
  onUndo?: () => void
  onRedo?: () => void
  onOpenChangeCompare?: () => void
  readOnly?: boolean
}

export function MonthlyPlanBottomBar({
  draftStatus,
  quickAvailable,
  canSaveDraft,
  canStandardConfirm,
  selectedCount = 0,
  isDirty = false,
  lockRemainingLabel = '未持有锁',
  canUndo = false,
  canRedo = false,
  blockingIssueCount = 0,
  onSaveDraft,
  onQuickConfirmEntry,
  onStandardConfirmEntry,
  onUndo,
  onRedo,
  onOpenChangeCompare,
  readOnly = false,
}: MonthlyPlanBottomBarProps) {
  const quickDisabled = readOnly || !quickAvailable
  const quickTooltip = quickAvailable
    ? '所有条件已满足时可用'
    : `存在 ${blockingIssueCount} 个待处理问题，请使用标准确认`

  return (
    <div data-testid="planning-shared-batch-bar" className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[1440px] -translate-x-1/2 px-0">
      <Card
        data-testid="monthly-plan-bottom-bar"
        className="border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30"
      >
        <div className="flex flex-col gap-3">
          <div className="grid items-center gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_minmax(320px,1fr)]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${
                  isDirty ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-100'
                }`}
              >
                {isDirty ? '未保存' : '已保存'}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                      onClick={onUndo}
                      disabled={readOnly || !canUndo || !onUndo}
                    >
                      <RotateCcw className="h-4 w-4" />
                      撤销
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Ctrl+Z</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                      onClick={onRedo}
                      disabled={readOnly || !canRedo || !onRedo}
                    >
                      <RotateCw className="h-4 w-4" />
                      重做
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Ctrl+Y</TooltipContent>
              </Tooltip>
              {onOpenChangeCompare ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 rounded-lg border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  data-testid="monthly-plan-change-compare-toolbar"
                  onClick={onOpenChangeCompare}
                >
                  <FileDiff className="h-4 w-4" />
                  计划变更对比
                </Button>
              ) : null}
            </div>

            <div className="justify-self-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100">
              已选 {selectedCount} 项
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                data-testid="monthly-plan-save-draft-entry"
                onClick={onSaveDraft}
                disabled={readOnly || !canSaveDraft}
              >
                <Save className="h-4 w-4" />
                保存草稿
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                      data-testid="monthly-plan-quick-confirm-entry"
                      onClick={onQuickConfirmEntry}
                      disabled={quickDisabled}
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      快速确认入口
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{quickTooltip}</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                size="sm"
                className="gap-2 rounded-full bg-emerald-700 text-white hover:bg-emerald-600"
                data-testid="monthly-plan-standard-confirm-entry"
                onClick={onStandardConfirmEntry}
                disabled={readOnly || !canStandardConfirm}
              >
                <BadgeInfo className="h-4 w-4" />
                标准确认入口
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              月度计划确认条
            </span>
            <span>草稿状态 {draftStatus}</span>
            <span>锁剩余 {lockRemainingLabel}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default MonthlyPlanBottomBar
