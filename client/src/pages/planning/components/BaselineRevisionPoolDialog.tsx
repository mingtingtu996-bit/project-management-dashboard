import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { BaselineRevisionActions } from './BaselineRevisionActions'
import { BaselineRevisionBasket } from './BaselineRevisionBasket'
import {
  BaselineRevisionCandidateList,
  type BaselineRevisionCandidate,
} from './BaselineRevisionCandidateList'

interface BaselineRevisionPoolDialogProps {
  open: boolean
  sourceEntryLabel: string
  candidates: BaselineRevisionCandidate[]
  basketItems: BaselineRevisionCandidate[]
  activeCandidateId: string | null
  deferredCandidateIds: string[]
  deferredReason: string
  deferredReasonVisible: boolean
  onOpenChange: (open: boolean) => void
  onSelectCandidate: (candidateId: string) => void
  onAddToBasket: () => void
  onMarkDeferred: () => void
  onDeferredReasonChange: (reason: string) => void
  onEnterDraft: () => void
  onRemoveFromBasket: (candidateId: string) => void
}

export function BaselineRevisionPoolDialog({
  open,
  sourceEntryLabel,
  candidates,
  basketItems,
  activeCandidateId,
  deferredCandidateIds,
  deferredReason,
  deferredReasonVisible,
  onOpenChange,
  onSelectCandidate,
  onAddToBasket,
  onMarkDeferred,
  onDeferredReasonChange,
  onEnterDraft,
  onRemoveFromBasket,
}: BaselineRevisionPoolDialogProps) {
  const activeCandidate = candidates.find((item) => item.id === activeCandidateId) ?? candidates[0] ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="baseline-revision-pool-dialog" className="max-w-6xl">
        <DialogHeader className="text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>基线计划修订候选</DialogTitle>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {sourceEntryLabel}
            </span>
          </div>
          <DialogDescription className="sr-only">基线计划修订候选</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <BaselineRevisionCandidateList
            candidates={candidates}
            basketIds={basketItems.map((item) => item.id)}
            deferredCandidateIds={deferredCandidateIds}
            activeCandidateId={activeCandidate?.id ?? null}
            onSelectCandidate={onSelectCandidate}
          />

          <div className="space-y-4">
            <BaselineRevisionBasket items={basketItems} onRemoveItem={onRemoveFromBasket} />

            <BaselineRevisionActions
              activeCandidate={activeCandidate}
              deferredReason={deferredReason}
              deferredReasonVisible={deferredReasonVisible}
              onAddToBasket={onAddToBasket}
              onMarkDeferred={onMarkDeferred}
              onDeferredReasonChange={onDeferredReasonChange}
              onEnterDraft={onEnterDraft}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-2">
            <X className="h-4 w-4" />
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
