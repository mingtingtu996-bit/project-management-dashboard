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
import { AlertTriangle, ShieldAlert } from 'lucide-react'

interface ActionGuardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  hint?: string
  confirmLabel?: string
  testId?: string
}

/**
 * ActionGuardDialog - 通用422错误对话框
 *
 * 用于显示操作被阻止的原因（如版本冲突、状态不匹配、前置条件未满足等）
 *
 * 使用示例：
 * <ActionGuardDialog
 *   open={guardOpen}
 *   onOpenChange={setGuardOpen}
 *   title="操作暂不可执行"
 *   description="当前记录状态已变化，请刷新后再试。"
 *   hint="这通常表示记录已被他人处理，或当前状态不满足操作前置条件。"
 * />
 */
export function ActionGuardDialog({
  open,
  onOpenChange,
  title,
  description,
  hint,
  confirmLabel = '我知道了',
  testId = 'action-guard-dialog',
}: ActionGuardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={testId} className="max-w-md">
        <AlertDialogHeader className="space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-6 text-slate-600">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hint ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{hint}</span>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogAction
            className="bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500"
            onClick={() => onOpenChange(false)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
