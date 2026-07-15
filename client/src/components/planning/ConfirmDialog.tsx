import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'

interface PlanningConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  danger,
  onConfirm,
  onOpenChange,
}: PlanningConfirmDialogProps) {
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmTone={danger ? 'destructive' : 'default'}
      testId="planning-confirm-dialog"
      onConfirm={onConfirm}
    />
  )
}
