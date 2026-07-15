// v1.4.7.1: Health banner + check bar (§9.3-9.4)
// Task list health banner for real-time execution issues
// Check bar for pre-save validation issues with locate capability

import { memo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react'

export type HealthIssueSeverity = 'critical' | 'warning' | 'info'

export interface HealthIssue {
  id: string
  message: string
  severity: HealthIssueSeverity
  count?: number
  rowIds?: string[]
  onLocate?: () => void
}

export interface PlanningHealthBannerProps {
  issues: HealthIssue[]
  onClear?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  maxVisible?: number
  className?: string
}

const severityStyles: Record<HealthIssueSeverity, { border: string; bg: string; text: string; icon: ReactNode }> = {
  critical: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-800', icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
  warning:  { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-800', icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
  info:     { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', icon: <AlertTriangle className="h-4 w-4 text-blue-500" /> },
}

export const PlanningHealthBanner = memo(function PlanningHealthBanner(props: PlanningHealthBannerProps) {
  const {
    issues,
    onClear,
    collapsed = false,
    onToggleCollapse,
    maxVisible = 5,
    className,
  } = props

  if (issues.length === 0) return null

  // Sort by severity priority (critical > warning > info)
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  const sorted = [...issues].sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2))

  const visible = collapsed ? [] : sorted.slice(0, maxVisible)
  const hiddenCount = Math.max(0, sorted.length - maxVisible)

  // Aggregate by severity for summary
  const criticalCount = sorted.filter(i => i.severity === 'critical').length
  const warningCount = sorted.filter(i => i.severity === 'warning').length
  const infoCount = sorted.filter(i => i.severity === 'info').length

  return (
    <div
      data-testid="planning-health-banner"
      className={cn(
        'rounded-xl border px-4 py-3',
        criticalCount > 0 ? severityStyles.critical.border : severityStyles.warning.border,
        criticalCount > 0 ? severityStyles.critical.bg : severityStyles.warning.bg,
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {criticalCount > 0 ? severityStyles.critical.icon : severityStyles.warning.icon}
          <span className={cn('text-sm font-medium', criticalCount > 0 ? severityStyles.critical.text : severityStyles.warning.text)}>
            执行健康检查发现 {sorted.length} 个问题
            {criticalCount > 0 && <span className="ml-1 font-semibold">({criticalCount} 个需关注)</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={onToggleCollapse}>
              {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {collapsed ? '展开' : '收起'}
            </Button>
          )}
          {onClear && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
              <X className="mr-1 h-3 w-3" />
              关闭
            </Button>
          )}
        </div>
      </div>

      {/* Issue list */}
      {visible.length > 0 && (
        <div className="mt-2 space-y-1">
          {visible.map((issue) => (
            <Button unstyled
              key={issue.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition-colors',
                severityStyles[issue.severity].bg,
                severityStyles[issue.severity].text,
                'hover:opacity-80',
              )}
              onClick={issue.onLocate}
            >
              <span className="flex-1">{issue.message}</span>
              {issue.count != null && issue.count > 0 && (
                <span className="ml-2 shrink-0 font-medium tabular-nums">{issue.count} 项</span>
              )}
            </Button>
          ))}
          {hiddenCount > 0 && !collapsed && (
            <p className="px-3 py-1 text-xs text-slate-400">
              还有 {hiddenCount} 条问题
              {onToggleCollapse && <Button unstyled type="button" className="ml-1 underline" onClick={onToggleCollapse}>展开全部</Button>}
            </p>
          )}
        </div>
      )}
    </div>
  )
})

export default PlanningHealthBanner
