import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { BaselineRevisionCandidate } from './BaselineRevisionCandidateList'

interface BaselineRevisionBasketProps {
  items: BaselineRevisionCandidate[]
  onRemoveItem: (candidateId: string) => void
}

export function BaselineRevisionBasket({ items, onRemoveItem }: BaselineRevisionBasketProps) {
  return (
    <div data-testid="baseline-revision-basket" className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-slate-900">修订篮</div>
        <p className="text-xs text-slate-500">这里收拢本次确定纳入修订的条目，便于统一带入草稿。</p>
      </div>

      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <Card key={item.id} className="border-cyan-200 bg-cyan-50/70">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <Badge variant="secondary">{item.tag}</Badge>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{item.summary}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => onRemoveItem(item.id)}>
                    移出
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            当前修订篮为空，先从左侧候选列表选择要纳入本次修订的条目。
          </div>
        )}
      </div>
    </div>
  )
}
