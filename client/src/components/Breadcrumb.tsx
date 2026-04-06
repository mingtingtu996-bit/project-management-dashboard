import { ChevronRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

const MAX_LABEL_LEN = 12

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
  showHome?: boolean
}

function truncate(label: string, max = MAX_LABEL_LEN) {
  return label.length > max ? `${label.slice(0, max)}…` : label
}

export function Breadcrumb({ items, className, showHome = false }: BreadcrumbProps) {
  if (!items || items.length === 0) return null

  return (
    <nav
      aria-label="breadcrumb"
      className={cn('flex flex-wrap items-center gap-1.5 text-sm text-slate-500', className)}
    >
      {showHome && (
        <>
          <Link
            to="/"
            aria-label="home"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-700"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
        </>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const needsTruncate = item.label.length > MAX_LABEL_LEN
        const displayLabel = truncate(item.label)

        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {isLast || !item.href ? (
              <span
                className={cn(
                  'max-w-[120px] truncate md:max-w-[180px]',
                  isLast ? 'font-medium text-slate-900' : 'text-slate-500',
                  needsTruncate && 'cursor-default',
                )}
                title={needsTruncate ? item.label : undefined}
              >
                {displayLabel}
              </span>
            ) : (
              <Link
                to={item.href}
                title={needsTruncate ? item.label : undefined}
                className={cn(
                  'max-w-[120px] truncate text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline md:max-w-[180px]',
                  needsTruncate && 'cursor-pointer',
                )}
              >
                {displayLabel}
              </Link>
            )}

            {!isLast && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />}
          </span>
        )
      })}
    </nav>
  )
}
