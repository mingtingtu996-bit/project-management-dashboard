import { AlertTriangle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { QualityCheckResult } from '@/hooks/usePlanningQualityCheck'

interface PlanningQualityBannerProps {
  result: QualityCheckResult | null
  onDismiss: () => void
  className?: string
}

export function PlanningQualityBanner({ result, onDismiss, className }: PlanningQualityBannerProps) {
  if (!result || result.count === 0) return null

  const hasCritical = result.items.some((item) => item.severity === 'critical')
  const warningCount = result.items.filter((item) => item.severity === 'warning').length
  const criticalCount = result.items.filter((item) => item.severity === 'critical').length

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
        hasCritical
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-amber-200 bg-amber-50 text-amber-900',
        className,
      )}
    >
      <AlertTriangle className={cn('h-4 w-4 shrink-0', hasCritical ? 'text-red-500' : 'text-amber-500')} />
      <div className="min-w-0 flex-1">
        <span className="font-medium">
          {hasCritical ? '数据质量阻断' : '数据质量警告'}
        </span>
        <span className="ml-2 text-xs opacity-80">
          {criticalCount > 0 ? `${criticalCount} 项阻断` : ''}
          {criticalCount > 0 && warningCount > 0 ? ' · ' : ''}
          {warningCount > 0 ? `${warningCount} 项警告` : ''}
        </span>
        {result.summary ? (
          <p className="mt-0.5 text-xs opacity-70">{result.summary}</p>
        ) : null}
      </div>
      <Button variant="ghost" type="button" className="h-6 w-6 shrink-0 p-0" onClick={onDismiss}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
