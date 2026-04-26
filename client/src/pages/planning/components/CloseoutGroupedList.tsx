import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type CloseoutItemStatus = 'normal' | 'concurrency' | 'stale' | 'overdue'

export interface CloseoutItem {
  id: string
  title: string
  summary: string
  groupId: string
  systemSuggestion: string
  status: CloseoutItemStatus
  processed?: boolean
  commitmentLabel?: string
  escalationLabel?: string
  sourceHierarchyLabel?: string
  sourceEntityLabel?: string
  closeReasonLabel?: string
  taskTitle?: string
  planStartLabel?: string | null
  planEndLabel?: string | null
  planProgressLabel?: string | null
  taskStartLabel?: string | null
  taskEndLabel?: string | null
  taskProgressLabel?: string | null
}

export interface CloseoutGroup {
  id: string
  title: string
  description: string
  badge: string
  items: CloseoutItem[]
}

interface CloseoutGroupedListProps {
  groups: CloseoutGroup[]
  selectedItemIds: string[]
  processedItemIds: string[]
  activeItemId: string | null
  onToggleItem: (id: string) => void
  onOpenItem: (id: string) => void
}

const STATUS_TONES: Record<CloseoutItemStatus, string> = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  concurrency: 'border-amber-200 bg-amber-50 text-amber-700',
  stale: 'border-slate-200 bg-slate-100 text-slate-700',
  overdue: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function CloseoutGroupedList({
  groups,
  selectedItemIds,
  processedItemIds,
  activeItemId,
  onToggleItem,
  onOpenItem,
}: CloseoutGroupedListProps) {
  return (
    <div data-testid="closeout-grouped-list" className="space-y-4">
      {groups.map((group) => {
        const selectedCount = group.items.filter((item) => selectedItemIds.includes(item.id)).length
        const processedCount = group.items.filter((item) => processedItemIds.includes(item.id)).length

        return (
          <Card key={group.id} className="border-slate-200">
            <CardContent className="space-y-3 p-4">
              <div
                data-testid="closeout-group-header"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
                    <Badge variant="outline">{group.badge}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{selectedCount} 项已选</span>
                  <span>·</span>
                  <span>{processedCount} 项已处理</span>
                </div>
              </div>

              <div className="space-y-2">
                {group.items.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id)
                  const isActive = activeItemId === item.id
                  const isProcessed = processedItemIds.includes(item.id) || item.processed

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition',
                        isActive
                          ? 'border-cyan-300 bg-cyan-50/70 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`选择 ${item.title}`}
                          onChange={() => onToggleItem(item.id)}
                          data-testid="planning-selection-checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                        />

                        <button
                          type="button"
                          onClick={() => onOpenItem(item.id)}
                          data-testid={`closeout-item-open-${item.id}`}
                          className="min-w-0 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">{item.title}</span>
                            <Badge variant="outline" className={STATUS_TONES[item.status]}>
                              {item.systemSuggestion}
                            </Badge>
                            {item.commitmentLabel ? <Badge variant="secondary">{item.commitmentLabel}</Badge> : null}
                            {item.escalationLabel ? <Badge variant="outline">{item.escalationLabel}</Badge> : null}
                            {isProcessed ? <Badge variant="secondary">已处理</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {item.sourceHierarchyLabel ? <span>来源层级：{item.sourceHierarchyLabel}</span> : null}
                            {item.sourceEntityLabel ? <span>来源类型：{item.sourceEntityLabel}</span> : null}
                            {item.closeReasonLabel ? <span>关闭口径：{item.closeReasonLabel}</span> : null}
                          </div>
                          {item.taskTitle || item.planProgressLabel || item.taskProgressLabel ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              {item.taskTitle ? <span>当前排期：{item.taskTitle}</span> : null}
                              {item.planProgressLabel ? <span>月计划进度：{item.planProgressLabel}</span> : null}
                              {item.taskProgressLabel ? <span>当前进度：{item.taskProgressLabel}</span> : null}
                            </div>
                          ) : null}
                        </button>
                      </div>

                      <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-500">
                        <span className={cn('rounded-full border px-2 py-0.5', STATUS_TONES[item.status])}>
                          {item.status === 'normal'
                            ? '正常'
                            : item.status === 'concurrency'
                              ? '并发'
                              : item.status === 'stale'
                                ? '过期'
                                : '超期'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
