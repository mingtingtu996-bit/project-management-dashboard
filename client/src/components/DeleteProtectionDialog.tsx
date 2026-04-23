import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Trash2 } from 'lucide-react'

interface DeleteProtectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  warning?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'destructive' | 'default'
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  secondaryActionLoading?: boolean
  loading?: boolean
  onConfirm: () => void
  testId?: string
}

export function DeleteProtectionDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel = '确认删除',
  cancelLabel = '取消',
  confirmTone = 'destructive',
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionLoading = false,
  loading = false,
  onConfirm,
  testId,
}: DeleteProtectionDialogProps) {
  const confirmClassName =
    confirmTone === 'destructive'
      ? 'bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-500'
      : 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500'

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <AlertDialogContent data-testid={testId} className="max-w-md">
        <AlertDialogHeader className="space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Trash2 className="h-5 w-5" />
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-6 text-slate-600">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning}</span>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              variant="outline"
              disabled={loading || secondaryActionLoading}
              onClick={onSecondaryAction}
            >
              {secondaryActionLoading ? `${secondaryActionLabel}中...` : secondaryActionLabel}
            </Button>
          ) : null}
          <AlertDialogAction
            disabled={loading || secondaryActionLoading}
            className={confirmClassName}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteProtectionDialog
