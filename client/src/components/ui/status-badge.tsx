import type { BadgeProps } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getStatusTheme } from '@/lib/statusTheme'

interface StatusBadgeProps extends BadgeProps {
  status: string
  fallbackLabel?: string
}

export function StatusBadge({
  status,
  fallbackLabel,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const theme = getStatusTheme(status, fallbackLabel)

  return (
    <Badge {...props} className={cn(theme.className, className)}>
      {children ?? theme.label}
    </Badge>
  )
}

export default StatusBadge
