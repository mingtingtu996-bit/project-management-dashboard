import type { ReactElement } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  return label.length > max ? `${label.slice(0, max)}...` : label
}

function WithOptionalTooltip({ children, label, enabled }: { children: ReactElement; label: string; enabled: boolean }) {
  if (!enabled) return children

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function Breadcrumb({ items, className, showHome = false }: BreadcrumbProps) {
  if (!items || items.length === 0) return null

  return (
    <nav
      aria-label="breadcrumb"
      className={cn('flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-400', className)}
    >
      {showHome ? (
        <>
          <Link
            to="/"
            aria-label="home"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-700"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-slate-300" />
        </>
      ) : null}

      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const needsTruncate = item.label.length > MAX_LABEL_LEN
        const displayLabel = truncate(item.label)

        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {isLast || !item.href ? (
              <WithOptionalTooltip label={item.label} enabled={needsTruncate}>
                <span
                  className={cn(
                    'max-w-[160px] truncate',
                    isLast ? 'font-medium text-slate-700' : 'text-slate-400',
                    needsTruncate && 'cursor-default',
                  )}
                >
                  {displayLabel}
                </span>
              </WithOptionalTooltip>
            ) : (
              <WithOptionalTooltip label={item.label} enabled={needsTruncate}>
                <Link
                  to={item.href}
                  className={cn(
                    'max-w-[160px] truncate text-slate-400 underline-offset-2 transition-colors hover:text-slate-700 hover:underline',
                    needsTruncate && 'cursor-pointer',
                  )}
                >
                  {displayLabel}
                </Link>
              </WithOptionalTooltip>
            )}

            {!isLast ? <ChevronRight className="h-3 w-3 flex-shrink-0 text-slate-300" /> : null}
          </span>
        )
      })}
    </nav>
  )
}
