import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  eyebrow?: string
  children?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, eyebrow, children, className }: PageHeaderProps) {
  return (
    <section className={cn('shell-surface px-6 py-5 md:px-7 md:py-6', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && (
            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
              {eyebrow}
            </Badge>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h1>
            {subtitle ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p> : null}
          </div>
        </div>

        {children && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{children}</div>}
      </div>
    </section>
  )
}
