// v1.4.7.1 §4.5: Collaboration presence + save signal bar
// Lightweight status bar showing edit state, collaboration updates, merge results

import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PresenceSignalLevel = 'L1' | 'L2' | 'L3' | 'L4'

export interface PresenceSignal {
  level: PresenceSignalLevel
  message: string
  icon?: ReactNode
  action?: { label: string; onClick: () => void }
}

export interface PlanningPresenceBarProps {
  signals: PresenceSignal[]
  editMode?: boolean
  hasDirty: boolean
  className?: string
}

const levelStyles: Record<PresenceSignalLevel, string> = {
  L1: 'border-blue-100 bg-blue-50/50 text-blue-700',
  L2: 'border-slate-200 bg-slate-50 text-slate-600',
  L3: 'border-amber-200 bg-amber-50 text-amber-800',
  L4: 'border-red-200 bg-red-50 text-red-800',
}

const levelIcons: Record<PresenceSignalLevel, ReactNode> = {
  L1: <Users className="h-3.5 w-3.5" />,
  L2: <Check className="h-3.5 w-3.5" />,
  L3: <RefreshCw className="h-3.5 w-3.5" />,
  L4: <AlertTriangle className="h-3.5 w-3.5" />,
}

export const PlanningPresenceBar = memo(function PlanningPresenceBar(props: PlanningPresenceBarProps) {
  const { signals, editMode, hasDirty, className } = props

  if (!editMode && !hasDirty && signals.length === 0) return null

  // Only show top 2 highest-level signals
  const visible = signals
    .sort((a, b) => {
      const order = { L4: 0, L3: 1, L2: 2, L1: 3 }
      return (order[a.level] ?? 3) - (order[b.level] ?? 3)
    })
    .slice(0, 2)

  return (
    <div
      data-testid="planning-presence-bar"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5 text-xs',
        className,
      )}
    >
      {/* Edit mode indicator */}
      {editMode && (
        <span className="flex items-center gap-1.5 text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {hasDirty ? '有未保存更改' : '编辑中'}
        </span>
      )}

      {/* Signals */}
      {visible.map((signal, i) => (
        <span
          key={i}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2 py-0.5',
            levelStyles[signal.level],
          )}
        >
          {signal.icon ?? levelIcons[signal.level]}
          {signal.message}
          {signal.action && (
            <Button unstyled
              type="button"
              className="ml-1 font-medium underline"
              onClick={signal.action.onClick}
            >
              {signal.action.label}
            </Button>
          )}
        </span>
      ))}
    </div>
  )
})

export default PlanningPresenceBar
