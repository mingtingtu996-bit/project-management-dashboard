import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RefreshCw } from 'lucide-react'
export type CloseoutConfirmMode = 'batch' | 'single' | 'force'
export type CloseoutConfirmState = 'ready' | 'failed'

export interface CloseoutConfirmSummary {
  rolledInCount: number
  closedCount: number
  manualOverrideCount: number
  forcedCount: number
  remainingCount?: number
}

interface CloseoutConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: CloseoutConfirmMode
  state: CloseoutConfirmState
  summary: CloseoutConfirmSummary
  onConfirm: () => void
  onRetry: () => void
}

export function CloseoutConfirmDialog({
  open,
  onOpenChange,
  mode,
  state,
  summary,
  onConfirm,
  onRetry,
}: CloseoutConfirmDialogProps) {
  const modeLabel =
    mode === 'force' ? '强制发起关账确认' : mode === 'batch' ? '批量关账确认' : '逐条关账确认'
  const canConfirm = state !== 'failed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="closeout-confirm-dialog" className="max-w-2xl">
        <DialogHeader className="text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{modeLabel}</DialogTitle>
            <Badge variant={state === 'failed' ? 'destructive' : 'secondary'}>
              {state === 'failed' ? '生成失败' : '确认待续'}
            </Badge>
          </div>
        <DialogDescription>
          关账完成前会先记录当前快照与关闭原因，普通关账必须在未处理事项归零后才能继续。
        </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">滚入数</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.rolledInCount}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">关闭数</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.closedCount}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">人工改判数</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.manualOverrideCount}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">强制处理数</div>
              <div className="text-2xl font-semibold text-slate-900">{summary.forcedCount}</div>
            </CardContent>
          </Card>
        </div>
        {typeof summary.remainingCount === 'number' ? (
          <div className="text-xs text-slate-500">
            当前剩余 <span className="font-medium text-slate-900">{summary.remainingCount} 项未处理</span>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {state === 'failed' ? (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="gap-2"
              data-testid="closeout-confirm-retry"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          ) : (
            <div />
          )}

          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            data-testid="closeout-confirm-confirm"
          >
            确认关账
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
