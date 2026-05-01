import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/EmptyState'

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
      </div>

      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <Card key={item.id} className="border-blue-200 bg-blue-50/70">
              <CardContent className="space-y-3 p-5">
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
          <EmptyState
            variant="default"
            title="修订篮为空"
            description="从左侧候选项选择需要纳入本次基线修订的内容。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        )}
      </div>
    </div>
  )
}
