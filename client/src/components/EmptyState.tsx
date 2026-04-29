import { AlertTriangle, Inbox, SearchX, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  variant?: 'default' | 'filter' | 'error'
  icon?: LucideIcon
  title?: string
  description?: string
  action?: ReactNode
  onRetry?: () => void
  onClearFilter?: () => void
  className?: string
}

const emptyStateConfig = {
  default: {
    icon: Inbox,
    iconClassName: 'h-12 w-12 text-slate-300',
    defaultTitle: '暂无数据',
    defaultDescription: '当前没有可显示的内容',
  },
  filter: {
    icon: SearchX,
    iconClassName: 'h-8 w-8 text-slate-500',
    defaultTitle: '未找到匹配项',
    defaultDescription: '尝试调整筛选条件',
  },
  error: {
    icon: AlertTriangle,
    iconClassName: 'h-8 w-8 text-red-400',
    defaultTitle: '加载失败',
    defaultDescription: '请稍后重试',
  },
} as const

export function EmptyState({
  variant = 'default',
  icon,
  title,
  description,
  action,
  onRetry,
  onClearFilter,
  className,
}: EmptyStateProps) {
  const config = emptyStateConfig[variant]
  const Icon = icon ?? config.icon

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      )}
    >
      <Icon className={config.iconClassName} />

      <h3 className="text-sm font-medium text-slate-900">{title ?? config.defaultTitle}</h3>
      <p className="text-xs text-slate-500">{description ?? config.defaultDescription}</p>

      {variant === 'filter' && onClearFilter && (
        <Button variant="outline" size="sm" onClick={onClearFilter}>
          清除筛选
        </Button>
      )}
      {variant === 'error' && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
      {variant === 'default' && action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">{action}</div>
      )}
    </div>
  )
}
