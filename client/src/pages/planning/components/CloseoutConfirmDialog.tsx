import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

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

        {summary.remainingCount > 0 && mode !== 'force' ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            还有 {summary.remainingCount} 项未处理，必须先完成逐条处理，才能进入普通关账 gate。
          </div>
        ) : mode === 'force' ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            当前已进入强制发起窗口，会保留现有处理留痕并直接发起真实关账。
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            当前未处理事项为 0，可以确认普通关账并跳转到下月草稿。
          </div>
        )}

        {state === 'failed' ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">生成失败</div>
              <p>关账确认草稿生成失败，当前草稿未被清空，可稍后重试。</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">确认待续</div>
              <p>点击确认后会保留关账留痕，并在未处理事项归零时切换到下月草稿。</p>
            </div>
          </div>
        )}

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
            <div className="text-sm text-slate-500">
              {mode === 'force' ? '当前处于强制发起窗口，确认后会直接进入真实关账接口。' : '只有当未处理事项为 0 时，确认按钮才会可用。'}
            </div>
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
