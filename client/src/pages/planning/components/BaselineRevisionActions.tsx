import { Layers3, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { BaselineRevisionCandidate } from './BaselineRevisionCandidateList'

interface BaselineRevisionActionsProps {
  activeCandidate: BaselineRevisionCandidate | null
  deferredReason: string
  deferredReasonVisible: boolean
  onAddToBasket: () => void
  onMarkDeferred: () => void
  onDeferredReasonChange: (reason: string) => void
  onEnterDraft: () => void
}

export function BaselineRevisionActions({
  activeCandidate,
  deferredReason,
  deferredReasonVisible,
  onAddToBasket,
  onMarkDeferred,
  onDeferredReasonChange,
  onEnterDraft,
}: BaselineRevisionActionsProps) {
  return (
    <div data-testid="baseline-revision-action-bar" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">动作区</div>
        </div>
        <div className="text-xs text-slate-500">
          当前候选：{activeCandidate?.title ?? '未选择'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onAddToBasket} data-testid="baseline-revision-add-to-basket">
          <Layers3 className="mr-2 h-4 w-4" />
          纳入本次修订
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onMarkDeferred}
          data-testid="baseline-revision-mark-deferred"
        >
          标记暂不处理
        </Button>
        <Button type="button" variant="default" size="sm" onClick={onEnterDraft} data-testid="baseline-revision-enter-draft">
          带候选进入修订草稿
        </Button>
      </div>

      {deferredReasonVisible ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">暂不处理原因</div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onDeferredReasonChange('')} className="gap-2">
                <X className="h-4 w-4" />
                清空
              </Button>
            </div>
            <textarea
              data-testid="baseline-revision-deferred-reason"
              className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-cyan-400"
              value={deferredReason}
              onChange={(event) => onDeferredReasonChange(event.target.value)}
              placeholder="填写暂不处理原因"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
