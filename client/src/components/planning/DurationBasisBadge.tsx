import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type DurationBasis = 'plan' | 'reference' | 'production' | 'forecast' | 'remaining'

const DURATION_BASIS_LABEL: Record<DurationBasis, string> = {
  plan: '计划',
  reference: '参考',
  production: '生产日',
  forecast: '预测',
  remaining: '剩余',
}

const DURATION_BASIS_TITLE: Record<DurationBasis, string> = {
  plan: '计划工期',
  reference: '参考工期',
  production: '施工生产日',
  forecast: '预测工期',
  remaining: '剩余工期',
}

export interface DurationBasisBadgeProps extends Omit<BadgeProps, 'children'> {
  basis: DurationBasis
  compact?: boolean
}

export function getDurationBasisLabel(basis: DurationBasis) {
  return DURATION_BASIS_LABEL[basis]
}

export function getDurationBasisTitle(basis: DurationBasis) {
  return DURATION_BASIS_TITLE[basis]
}

export function DurationBasisBadge({
  basis,
  compact = false,
  className,
  variant = 'secondary',
  ...props
}: DurationBasisBadgeProps) {
  return (
    <Badge
      variant={variant}
      className={cn('h-5 shrink-0 px-1.5 leading-none', compact && 'h-4 px-1', className)}
      aria-label={getDurationBasisTitle(basis)}
      title={getDurationBasisTitle(basis)}
      {...props}
    >
      {getDurationBasisLabel(basis)}
    </Badge>
  )
}
