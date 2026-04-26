import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PlanningDraftStatus } from '@/hooks/usePlanningStore'
import { ArrowRightCircle, BadgeInfo, Sparkles } from 'lucide-react'

interface MonthlyPlanBottomBarProps {
  draftStatus: PlanningDraftStatus
  quickAvailable: boolean
  canSaveDraft: boolean
  canStandardConfirm: boolean
  onSaveDraft: () => void
  onQuickConfirmEntry: () => void
  onStandardConfirmEntry: () => void
  readOnly?: boolean
}

export function MonthlyPlanBottomBar({
  draftStatus,
  quickAvailable,
  canSaveDraft,
  canStandardConfirm,
  onSaveDraft,
  onQuickConfirmEntry,
  onStandardConfirmEntry,
  readOnly = false,
}: MonthlyPlanBottomBarProps) {
  return (
    <div data-testid="planning-shared-batch-bar" className="fixed bottom-4 left-0 right-0 z-40 px-4">
      <Card
        data-testid="monthly-plan-bottom-bar"
        className="mx-auto max-w-[1440px] border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30"
      >
        <CardContent className="space-y-3 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                月度确认条
              </div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200">
              草稿状态 {draftStatus}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-100">
                <ArrowRightCircle className="h-4 w-4" />
                快速确认路径
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 gap-2 border-cyan-200 bg-transparent text-cyan-100 hover:bg-cyan-500/10"
                data-testid="monthly-plan-save-draft-entry"
                onClick={onSaveDraft}
                disabled={readOnly || !canSaveDraft}
              >
                保存草稿
              </Button>
              <Button
                type="button"
                size="sm"
                className="mt-3 gap-2 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                data-testid="monthly-plan-quick-confirm-entry"
                onClick={onQuickConfirmEntry}
                disabled={readOnly || !quickAvailable}
              >
                <ArrowRightCircle className="h-4 w-4" />
                快速确认入口
              </Button>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <BadgeInfo className="h-4 w-4 text-slate-300" />
                标准路径
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 gap-2 border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
                data-testid="monthly-plan-standard-confirm-entry"
                onClick={onStandardConfirmEntry}
                disabled={readOnly || !canStandardConfirm}
              >
                <BadgeInfo className="h-4 w-4" />
                标准确认入口
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default MonthlyPlanBottomBar
