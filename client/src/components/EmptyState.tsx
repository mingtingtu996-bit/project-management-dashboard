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
        'flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/90 px-6 py-14 text-center shadow-sm',
        className,
      )}
    >
      {Icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
          <Icon className="h-7 w-7" />
        </div>
      )}

      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

      {description && <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>}

      {action && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  )
}
