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

interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'default' | 'destructive'
  testId?: string
  loading?: boolean
  onConfirm: () => void
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmTone = 'default',
  testId = 'confirm-action-dialog',
  loading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const confirmClassName =
    confirmTone === 'destructive'
      ? 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500'
      : 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500'

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <AlertDialogContent
        data-testid={testId}
        className="w-[90%] max-w-md rounded-2xl border-slate-200 bg-white shadow-[var(--el-4)] sm:rounded-2xl"
      >
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="not-sr-only leading-6 text-slate-600">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={confirmClassName}
            loading={loading}
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

export default ConfirmActionDialog
