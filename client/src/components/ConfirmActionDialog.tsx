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
  onConfirm,
}: ConfirmActionDialogProps) {
  const confirmClassName =
    confirmTone === 'destructive'
      ? 'bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-500'
      : 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={testId} className="max-w-md">
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-6 text-slate-600">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
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

export default ConfirmActionDialog
