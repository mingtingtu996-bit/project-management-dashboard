import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type CardHeadPillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface CardHeadProps {
  eyebrow: string
  title: string
  pill?: { label: string; variant: CardHeadPillVariant }
  action?: ReactNode
  className?: string
}

const pillClass: Record<CardHeadPillVariant, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700' },
  danger: { dot: 'bg-rose-500', text: 'text-rose-700' },
  info: { dot: 'bg-blue-500', text: 'text-blue-700' },
  neutral: { dot: 'bg-slate-400', text: 'text-slate-600' },
}

export function CardHead({ eyebrow, title, pill, action, className }: CardHeadProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h3 className="card-title-compact mt-0.5 truncate font-medium text-slate-900">{title}</h3>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {pill ? (
          <span
            className={cn(
              'badge-micro inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-medium ring-1 ring-inset ring-slate-200/60',
              pillClass[pill.variant].text,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', pillClass[pill.variant].dot)} />
            {pill.label}
          </span>
        ) : null}
        {action}
      </div>
    </div>
  )
}
