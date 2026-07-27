// v1.4.7.1 §10.10: Critical path change alert
// Shown after save when tasks enter/leave critical path

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AlertTriangle, GitBranch, X } from 'lucide-react'

export interface CriticalPathChange {
  enteredCount: number
  leftCount: number
}

export interface CriticalPathAlertProps {
  change: CriticalPathChange | null
  onViewDetails?: () => void
  onDismiss?: () => void
  className?: string
}

export const CriticalPathAlert = memo(function CriticalPathAlert(props: CriticalPathAlertProps) {
  const { change, onViewDetails, onDismiss, className } = props

  if (!change || (change.enteredCount === 0 && change.leftCount === 0)) return null

  const hasEntered = change.enteredCount > 0

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5',
      hasEntered ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50',
      className,
    )} data-testid="critical-path-alert">
      <div className="flex items-center gap-2">
        {hasEntered ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (
          <GitBranch className="h-4 w-4 text-amber-500" />
        )}
        <span className={cn('text-sm', hasEntered ? 'text-red-800' : 'text-amber-800')}>
          {hasEntered && change.enteredCount > 0 && `${change.enteredCount} 个任务进入关键路径，可能影响项目总工期。`}
          {!hasEntered && change.leftCount > 0 && `${change.leftCount} 个任务离开关键路径。`}
          {hasEntered && change.leftCount > 0 && ` ${change.leftCount} 个任务离开。`}
          {' '}
          {onViewDetails && (
            <Button unstyled type="button" className="font-medium underline" onClick={onViewDetails}>
              查看关键路径详情
            </Button>
          )}
        </span>
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" className="h-6 shrink-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
})

export default CriticalPathAlert
