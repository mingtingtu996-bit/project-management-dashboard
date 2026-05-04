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
        'fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[var(--content-max-width)] -translate-x-1/2 px-0 transition-all duration-300',
        visible ? 'translate-y-0' : 'translate-y-[140%]',
        drawerOpen ? 'pointer-events-auto opacity-95' : 'opacity-100'
      )}
      aria-live="polite"
    >
      <Card
        data-testid="closeout-batch-bar"
        className={cn(
          'surface-card flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--el-2)] transition-all',
          'w-full max-w-[var(--content-max-width)]',
          drawerOpen ? 'h-14 opacity-90' : 'h-auto'
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
            {selectedCount}
          </span>
          <span className="text-sm font-medium text-slate-900">已选择 {selectedCount} 项</span>
          <Button variant="ghost"
            type="button"
            onClick={onClearSelection}
            disabled={readOnly}
            className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="gap-2 rounded-full"
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
            className="gap-2 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
