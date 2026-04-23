import { ArrowRightCircle, Layers3, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CloseoutBatchBarProps {
  selectedCount: number
  drawerOpen: boolean
  onOpenBatchLayer: () => void
  onClearSelection: () => void
}

export function CloseoutBatchBar({
  selectedCount,
  drawerOpen,
  onOpenBatchLayer,
  onClearSelection,
}: CloseoutBatchBarProps) {
  const visible = selectedCount > 0

  return (
    <div
      data-testid="planning-shared-batch-bar"
      className={cn(
        'fixed bottom-4 left-0 right-0 z-40 px-4 transition-all duration-300',
        visible ? 'translate-y-0' : 'translate-y-[140%]',
        drawerOpen ? 'pointer-events-auto opacity-95' : 'opacity-100'
      )}
      aria-live="polite"
    >
      <div
        className={cn(
          'mx-auto flex max-w-[1440px] items-center justify-between gap-4 rounded-2xl border border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30 transition-all',
          drawerOpen ? 'h-14 opacity-90' : 'h-auto'
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cyan-500 px-2 text-xs font-bold text-slate-950">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">已选择 {selectedCount} 项</span>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="清空选择"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenBatchLayer}
            className="gap-2 rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
            data-testid="closeout-batch-close-entry"
          >
            <Layers3 className="h-4 w-4" />
            批量关闭
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            className="gap-2 rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <ArrowRightCircle className="h-4 w-4" />
            逐条处理
          </Button>
        </div>
      </div>
    </div>
  )
}
