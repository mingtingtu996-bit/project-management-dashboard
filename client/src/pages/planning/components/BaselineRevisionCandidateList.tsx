import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { RevisionPoolCandidate } from '@/types/planning'

export type BaselineRevisionCandidate = Omit<RevisionPoolCandidate, 'project_id' | 'baseline_version_id' | 'monthly_plan_version_id'> & {
  summary: string
  source: string
  tag: string
}

interface BaselineRevisionCandidateListProps {
  candidates: BaselineRevisionCandidate[]
  basketIds: string[]
  deferredCandidateIds: string[]
  activeCandidateId: string | null
  onSelectCandidate: (candidateId: string) => void
}

export function BaselineRevisionCandidateList({
  candidates,
  basketIds,
  deferredCandidateIds,
  activeCandidateId,
  onSelectCandidate,
}: BaselineRevisionCandidateListProps) {
  return (
    <div data-testid="baseline-revision-candidate-list" className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-slate-900">候选列表</div>
      </div>

      <div className="space-y-3">
        {candidates.map((candidate) => {
          const inBasket = basketIds.includes(candidate.id)
          const deferred = deferredCandidateIds.includes(candidate.id)
          const active = activeCandidateId === candidate.id

          return (
            <Card
              key={candidate.id}
              data-testid="baseline-revision-candidate-item"
              className={cn(
                'cursor-pointer border-slate-200 transition',
                active ? 'border-cyan-300 bg-cyan-50/60 shadow-sm' : 'hover:border-slate-300 hover:bg-slate-50'
              )}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCandidate(candidate.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectCandidate(candidate.id)
                }
              }}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-slate-900">{candidate.title}</div>
                      <Badge variant="outline">{candidate.tag}</Badge>
                      {candidate.priority ? <Badge variant="secondary">{candidate.priority}</Badge> : null}
                      {active ? <Badge variant="default">当前候选</Badge> : null}
                      {inBasket || candidate.status === 'submitted' ? <Badge variant="secondary">已入篮</Badge> : null}
                      {deferred || candidate.status === 'deferred' ? <Badge variant="outline">暂不处理</Badge> : null}
                      {candidate.status === 'accepted' ? <Badge variant="secondary">已接受</Badge> : null}
                      {candidate.status === 'rejected' ? <Badge variant="outline">已拒绝</Badge> : null}
                      {(deferred || candidate.status === 'deferred') && candidate.review_due_at ? (
                        <Badge variant="outline">复核 {candidate.review_due_at}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{candidate.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{candidate.source}</span>
                      {candidate.observation_window_start || candidate.observation_window_end ? (
                        <span>
                          观察窗口
                          {' '}
                          {candidate.observation_window_start ?? '未设'}
                          {' → '}
                          {candidate.observation_window_end ?? '未设'}
                        </span>
                      ) : null}
                      {candidate.review_due_at ? <span>复核截止 {candidate.review_due_at}</span> : null}
                      {candidate.reviewed_by ? <span>复核人 {candidate.reviewed_by}</span> : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
