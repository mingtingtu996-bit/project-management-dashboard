import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'shell-surface mx-auto flex w-full max-w-2xl flex-col items-center justify-center border-dashed border-slate-200 px-6 py-12 text-center shadow-sm sm:px-8 sm:py-14',
        className,
      )}
    >
      {Icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-900/15">
          <Icon className="h-7 w-7" />
        </div>
      )}

      <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>

      {description && <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>}

      {action && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  )
}
