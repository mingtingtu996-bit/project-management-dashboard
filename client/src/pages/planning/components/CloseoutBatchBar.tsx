import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ArrowRightCircle, Layers3, X } from 'lucide-react'

interface CloseoutBatchBarProps {
  selectedCount: number
  drawerOpen: boolean
  readOnly?: boolean
  onOpenBatchLayer: () => void
  onClearSelection: () => void
}

export function CloseoutBatchBar({
  selectedCount,
  drawerOpen,
  readOnly = false,
  onOpenBatchLayer,
  onClearSelection,
}: CloseoutBatchBarProps) {
  const visible = selectedCount > 0

  return (
    <div
      data-testid="planning-shared-batch-bar"
      className={cn(
        'fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[1440px] -translate-x-1/2 px-0 transition-all duration-300',
        visible ? 'translate-y-0' : 'translate-y-[140%]',
        drawerOpen ? 'pointer-events-auto opacity-95' : 'opacity-100'
      )}
      aria-live="polite"
    >
      <Card
        data-testid="closeout-batch-bar"
        className={cn(
          'flex items-center justify-between gap-4 border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30 transition-all',
          'w-full max-w-[1440px]',
          drawerOpen ? 'h-14 opacity-90' : 'h-auto'
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-bold text-slate-950">
            {selectedCount}
          </span>
          <span className="text-sm font-medium">已选择 {selectedCount} 项</span>
          <Button variant="ghost"
            type="button"
            onClick={onClearSelection}
            disabled={readOnly}
            className="rounded-full p-1 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="清空选择"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenBatchLayer}
            className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
            data-testid="closeout-batch-close-entry"
            disabled={readOnly}
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
            disabled={readOnly}
          >
            <ArrowRightCircle className="h-4 w-4" />
            逐条处理
          </Button>
        </div>
      </Card>
    </div>
  )
}
