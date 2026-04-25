import { RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type CloseoutConfirmMode = 'batch' | 'single' | 'force'
export type CloseoutConfirmState = 'ready' | 'failed'

export interface CloseoutConfirmSummary {
  selectedCount: number
  processedCount: number
  remainingCount: number
  reasonLabel: string
  itemLabel: string
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
  const canConfirm = state !== 'failed' && (mode === 'force' || summary.remainingCount === 0)

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

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">当前处理</div>
            <div className="mt-1 font-medium text-slate-900">{summary.itemLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">关闭原因</div>
            <div className="mt-1 font-medium text-slate-900">{summary.reasonLabel}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">批量范围</div>
            <div className="mt-1 font-medium text-slate-900">{summary.selectedCount} 项选中</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">已处理</div>
            <div className="mt-1 font-medium text-slate-900">{summary.processedCount} 项已处理</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">未处理</div>
            <div className="mt-1 font-medium text-slate-900">{summary.remainingCount} 项未处理</div>
          </div>
        </div>

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
