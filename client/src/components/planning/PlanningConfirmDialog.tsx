// v1.4.7.1: Publish/confirm dialog (§11.3)
// Lightweight confirmation showing only user-understandable summary

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export interface PlanningConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string // e.g. "确认发布这版基线？" "确认这个月计划？"
  addedCount?: number
  dateAdjustedCount?: number
  deletedCount?: number
  lastSavedAt?: string
  confirmLabel?: string
  loading?: boolean
  className?: string
}

export const PlanningConfirmDialog = memo(function PlanningConfirmDialog(props: PlanningConfirmDialogProps) {
  const {
    open,
    onClose,
    onConfirm,
    title,
    addedCount = 0,
    dateAdjustedCount = 0,
    deletedCount = 0,
    lastSavedAt,
    confirmLabel = '确认发布',
    loading,
    className,
  } = props

  const hasChanges = addedCount > 0 || dateAdjustedCount > 0 || deletedCount > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-w-sm rounded-2xl shadow-[var(--el-4)]', className)} data-testid="planning-confirm-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            以下为本次变更摘要，请确认后继续。
          </DialogDescription>
        </DialogHeader>

        {hasChanges ? (
          <div className="space-y-2 py-2">
            {addedCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">新增</span>
                <span className="font-medium tabular-nums text-emerald-600">{addedCount} 项</span>
              </div>
            )}
            {dateAdjustedCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">日期调整</span>
                <span className="font-medium tabular-nums text-blue-600">{dateAdjustedCount} 项</span>
              </div>
            )}
            {deletedCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">删除</span>
                <span className="font-medium tabular-nums text-rose-600">{deletedCount} 项</span>
              </div>
            )}
          </div>
        ) : (
          <p className="py-2 text-sm text-slate-400">无变更项</p>
        )}

        {lastSavedAt && (
          <>
            <Separator />
            <p className="text-xs text-slate-400">最后保存：{lastSavedAt}</p>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default PlanningConfirmDialog
