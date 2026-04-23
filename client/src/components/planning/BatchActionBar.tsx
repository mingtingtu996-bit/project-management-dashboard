import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface PlanningBatchAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  disabled?: boolean
}

interface PlanningBatchActionBarProps {
  selectedCount: number
  onClear: () => void
  actions: PlanningBatchAction[]
  unsaved?: boolean
  unsavedLabel?: string
  className?: string
}

export function BatchActionBar({
  selectedCount,
  onClear,
  actions,
  unsaved = false,
  unsavedLabel = '未保存',
  className,
}: PlanningBatchActionBarProps) {
  const visible = selectedCount > 0

  return (
    <div
      data-testid="planning-shared-batch-bar"
      className={cn(
        'fixed bottom-4 left-0 right-0 z-40 px-4 transition-transform duration-300',
        visible ? 'translate-y-0' : 'translate-y-[140%]',
        className,
      )}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center gap-3">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cyan-500 px-2 text-xs font-bold text-slate-950">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">条已选中</span>
          {unsaved ? (
            <Badge
              data-testid="planning-shared-unsaved-badge"
              variant="secondary"
              className="bg-amber-400 text-slate-950 hover:bg-amber-300"
            >
              {unsavedLabel}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="清空选择"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? 'outline'}
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn(
                'gap-2 rounded-full border-slate-600',
                action.variant === 'destructive'
                  ? 'border-rose-500 bg-rose-600 text-white hover:bg-rose-500'
                  : action.variant === 'outline'
                    ? 'border-slate-600 bg-transparent text-slate-100 hover:bg-white/10'
                    : '',
              )}
            >
              {action.icon ? <action.icon className="h-4 w-4" /> : null}
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BatchActionBar
