import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Clock3 } from 'lucide-react'

export type MonthlyPlanConfirmMode = 'quick' | 'standard'
export type MonthlyPlanConfirmState = 'ready' | 'failed'

export interface MonthlyPlanConfirmSummary {
  totalItemCount: number
  newlyAddedCount: number
  autoRolledInCount: number
  pendingRemovalCount: number
  milestoneCount: number
  dateAdjustmentCount: number
  progressAdjustmentCount: number
  blockingIssueCount: number
  conditionIssueCount: number
  obstacleIssueCount: number
  delayIssueCount: number
  mappingIssueCount: number
  requiredFieldIssueCount: number
}

export interface MonthlyPlanConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: MonthlyPlanConfirmMode
  state?: MonthlyPlanConfirmState
  summary: MonthlyPlanConfirmSummary
  canConfirm?: boolean
  onConfirm?: () => void
  onRetry?: () => void
}

export function MonthlyPlanConfirmDialog({
  open,
  onOpenChange,
  mode,
  state = 'ready',
  summary,
  canConfirm = state !== 'failed',
  onConfirm,
  onRetry,
}: MonthlyPlanConfirmDialogProps) {
  const modeLabel = mode === 'quick' ? '快速确认路径' : '标准确认路径'
  const stateLabel = state === 'failed' ? '确认失败' : '可确认'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="monthly-plan-confirm-dialog" className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-cyan-500" />
            月度计划确认
          </DialogTitle>
          <DialogDescription className="sr-only">月度计划确认</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{modeLabel}</Badge>
            <Badge variant={state === 'failed' ? 'destructive' : 'outline'}>{stateLabel}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">条目总数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.totalItemCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">本月新增数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.newlyAddedCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">自动滚入数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.autoRolledInCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">待移出数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.pendingRemovalCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">关键里程碑数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.milestoneCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">目标时间调整数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.dateAdjustmentCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">目标进度调整数</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.progressAdjustmentCount}</div>
              </CardContent>
            </Card>
            <Card className={`shadow-sm ${summary.blockingIssueCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">确认阻断项</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.blockingIssueCount}</div>
                {summary.blockingIssueCount > 0 ? (
                  <div className="text-xs leading-5 text-amber-700">
                    条件 {summary.conditionIssueCount} · 障碍 {summary.obstacleIssueCount} · 延期 {summary.delayIssueCount} · 映射 {summary.mappingIssueCount} · 必填 {summary.requiredFieldIssueCount}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
            {state === 'failed' ? (
              <Button type="button" variant="destructive" onClick={onRetry}>
                重新尝试
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
              {mode === 'quick' ? '快速确认' : '确认月度计划'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MonthlyPlanConfirmDialog
