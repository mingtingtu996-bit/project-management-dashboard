import type { ReactNode } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PlanningGuideBubbleProps {
  children: ReactNode
  onDismiss: () => void
  className?: string
  arrowClassName?: string
}

export function PlanningGuideBubble({ children, onDismiss, className, arrowClassName }: PlanningGuideBubbleProps) {
  return (
    <div
      data-testid="planning-guide-bubble"
      className={cn(
        'pointer-events-none absolute left-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-xl bg-white px-4 py-3 text-sm leading-5 text-slate-700 shadow-[var(--el-2)] ring-1 ring-slate-200',
        className,
      )}
    >
      <span className={cn('absolute -top-1 left-5 h-2 w-2 rotate-45 border-l border-t border-slate-200 bg-white', arrowClassName)} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="pointer-events-auto -mr-2 -mt-2 h-7 w-7 shrink-0 text-slate-600 hover:text-slate-800"
          aria-label="关闭共享计划树提示"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
