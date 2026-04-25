import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  monthLabel: string
  versionLabel: string
  sourceLabel: string
  conditionCount: number
  obstacleCount: number
  delayCount: number
  selectedCount: number
}

export interface MonthlyPlanConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: MonthlyPlanConfirmMode
  state?: MonthlyPlanConfirmState
  summary: MonthlyPlanConfirmSummary
  onConfirm?: () => void
  onRetry?: () => void
}

export function MonthlyPlanConfirmDialog({
  open,
  onOpenChange,
  mode,
  state = 'ready',
  summary,
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
            <Badge variant="outline">已选 {summary.selectedCount} 项</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">当前月份</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.monthLabel}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">当前版本</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.versionLabel}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">生成来源</div>
                <div className="text-xl font-semibold text-slate-900">{summary.sourceLabel}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">确认范围</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.selectedCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">当前条件</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.conditionCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">阻碍</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.obstacleCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">延期摘要</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.delayCount}</div>
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
            <Button type="button" onClick={onConfirm} disabled={state === 'failed'}>
              {mode === 'quick' ? '快速确认' : '确认月度计划'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MonthlyPlanConfirmDialog
