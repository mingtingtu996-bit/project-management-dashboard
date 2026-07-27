import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface BlockageListPopoverItem {
  id: string
  title?: string | null
  description?: string | null
  expectedResolutionDate?: string | null
}

interface BlockageListPopoverProps {
  items: BlockageListPopoverItem[]
  totalCount: number
  onOpenDrawer: () => void
}

export function BlockageListPopover({
  items,
  totalCount,
  onOpenDrawer,
}: BlockageListPopoverProps) {
  return (
    <div className="space-y-3 rounded-xl bg-white p-4" data-testid="blockage-list-popover">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">阻碍清单</span>
        <Badge variant="outline" className="px-1.5 py-0 text-xs text-amber-700">
          {totalCount} 条
        </Badge>
      </div>
      {items.length > 0 ? (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {items.map((obstacle) => (
            <div key={obstacle.id} className="rounded-lg bg-amber-50 px-2 py-1.5">
              <div className="truncate text-xs font-medium text-amber-800">
                {obstacle.title || obstacle.description || '未命名阻碍'}
              </div>
              {obstacle.expectedResolutionDate ? (
                <div className="mt-0.5 text-xs text-amber-700">
                  预计解除 {String(obstacle.expectedResolutionDate).slice(0, 10)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">当前任务存在未解决阻碍。</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-0 text-xs text-slate-500"
        onClick={onOpenDrawer}
      >
        打开任务详情查看更多
      </Button>
    </div>
  )
}

export default BlockageListPopover
