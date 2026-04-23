import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface BaselineRevisionCandidate {
  id: string
  title: string
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
        <p className="text-xs text-slate-500">统一列出待纳入修订的候选项，并明确当前操作对象。</p>
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
                      {active ? <Badge variant="default">当前候选</Badge> : null}
                      {inBasket ? <Badge variant="secondary">已入篮</Badge> : null}
                      {deferred ? <Badge variant="outline">暂不处理</Badge> : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{candidate.summary}</p>
                    <div className="text-xs text-slate-500">{candidate.source}</div>
                  </div>
                  <div className="text-xs text-slate-500">点击切换操作对象</div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
