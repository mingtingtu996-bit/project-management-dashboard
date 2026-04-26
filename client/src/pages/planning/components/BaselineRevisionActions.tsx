import { useEffect, useState } from 'react'

import { CalendarDays, Layers3, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import type { BaselineRevisionCandidate } from './BaselineRevisionCandidateList'

type ReviewPreset = 'custom' | 'next_closeout' | 'stage_node'

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string | null | undefined, days: number) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) return null
  base.setDate(base.getDate() + days)
  return formatIsoDate(base)
}

function endOfNextMonth() {
  const now = new Date()
  return formatIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0))
}

interface BaselineRevisionActionsProps {
  activeCandidate: BaselineRevisionCandidate | null
  deferredReason: string
  deferredReasonVisible: boolean
  deferredReviewDueAt: string
  canEnterDraft: boolean
  onAddToBasket: () => void
  onMarkDeferred: () => void
  onDeferredReasonChange: (reason: string) => void
  onDeferredReviewDueAtChange: (value: string) => void
  onEnterDraft: () => void
}

export function BaselineRevisionActions({
  activeCandidate,
  deferredReason,
  deferredReasonVisible,
  deferredReviewDueAt,
  canEnterDraft,
  onAddToBasket,
  onMarkDeferred,
  onDeferredReasonChange,
  onDeferredReviewDueAtChange,
  onEnterDraft,
}: BaselineRevisionActionsProps) {
  const [reviewPreset, setReviewPreset] = useState<ReviewPreset>('custom')

  useEffect(() => {
    if (!deferredReasonVisible) {
      setReviewPreset('custom')
    }
  }, [deferredReasonVisible])

  const setPresetReviewDate = (preset: ReviewPreset) => {
    setReviewPreset(preset)
    if (preset === 'custom') return

    if (preset === 'next_closeout') {
      onDeferredReviewDueAtChange(endOfNextMonth())
      return
    }

    onDeferredReviewDueAtChange(
      addDays(activeCandidate?.observation_window_end ?? activeCandidate?.review_due_at ?? null, 1)
        ?? addDays(null, 14)
        ?? '',
    )
  }

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
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onEnterDraft}
          data-testid="baseline-revision-enter-draft"
          disabled={!canEnterDraft}
        >
          发起基线修订
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
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" />
                下次复核时点
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['next_closeout', '下月关账后'],
                    ['stage_node', '阶段节点后'],
                    ['custom', '自定义日期'],
                  ] as const
                ).map(([preset, label]) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={reviewPreset === preset ? 'default' : 'outline'}
                    onClick={() => setPresetReviewDate(preset)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-slate-500">
                当前复核截止日：{deferredReviewDueAt || '未设置'}
              </div>
            </div>
            {reviewPreset === 'custom' ? (
              <label className="block space-y-1">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  自定义日期
                </span>
                <input
                  data-testid="baseline-revision-deferred-review-due-at"
                  type="date"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-0 focus:border-cyan-400"
                  value={deferredReviewDueAt}
                  onChange={(event) => onDeferredReviewDueAtChange(event.target.value)}
                />
              </label>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900">
                已自动计算为 {deferredReviewDueAt || '未设置'}，可切换为自定义日期继续调整。
              </div>
            )}
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
