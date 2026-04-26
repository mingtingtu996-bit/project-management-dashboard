import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  summary?: {
    high_priority_count: number
    consecutive_cross_month_count: number
    critical_milestone_count: number
    last_reviewed_at?: string | null
  } | null
  basketItems: BaselineRevisionCandidate[]
  activeCandidateId: string | null
  deferredCandidateIds: string[]
  deferredReason: string
  deferredReasonVisible: boolean
  deferredReviewDueAt: string
  canEnterDraft: boolean
  errorMessage?: string | null
  onOpenChange: (open: boolean) => void
  onSelectCandidate: (candidateId: string) => void
  onAddToBasket: () => void
  onMarkDeferred: () => void
  onDeferredReasonChange: (reason: string) => void
  onDeferredReviewDueAtChange: (value: string) => void
  onEnterDraft: () => void
  onRemoveFromBasket: (candidateId: string) => void
}

export function BaselineRevisionPoolDialog({
  open,
  sourceEntryLabel,
  candidates,
  summary,
  basketItems,
  activeCandidateId,
  deferredCandidateIds,
  deferredReason,
  deferredReasonVisible,
  deferredReviewDueAt,
  canEnterDraft,
  errorMessage,
  onOpenChange,
  onSelectCandidate,
  onAddToBasket,
  onMarkDeferred,
  onDeferredReasonChange,
  onDeferredReviewDueAtChange,
  onEnterDraft,
  onRemoveFromBasket,
}: BaselineRevisionPoolDialogProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'deferred' | 'submitted' | 'accepted' | 'rejected'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'observation' | 'deviation' | 'manual'>('all')
  const [windowStartFilter, setWindowStartFilter] = useState('')
  const [windowEndFilter, setWindowEndFilter] = useState('')
  const [criticalMilestoneOnly, setCriticalMilestoneOnly] = useState(false)
  const activeCandidate = candidates.find((item) => item.id === activeCandidateId) ?? candidates[0] ?? null
  const getCandidateStatus = (candidateId: string, candidate: BaselineRevisionCandidate) => {
    if (deferredCandidateIds.includes(candidateId) || candidate.status === 'deferred') return 'deferred'
    if (candidate.status === 'accepted') return 'accepted'
    if (candidate.status === 'rejected') return 'rejected'
    if (basketItems.some((item) => item.id === candidateId) || candidate.status === 'submitted') return 'submitted'
    return 'open'
  }

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((item) => {
        const status = getCandidateStatus(item.id, item)
        if (statusFilter !== 'all' && status !== statusFilter) return false
        if (priorityFilter !== 'all' && String(item.priority ?? item.severity ?? '').toLowerCase() !== priorityFilter) return false
        if (sourceFilter !== 'all' && item.source_type !== sourceFilter) return false
        if (criticalMilestoneOnly && !item.affects_critical_milestone) return false
        if (windowStartFilter || windowEndFilter) {
          const candidateWindowStart = item.observation_window_start ?? item.observation_window_end ?? null
          const candidateWindowEnd = item.observation_window_end ?? item.observation_window_start ?? null
          if (windowStartFilter && candidateWindowEnd && candidateWindowEnd < windowStartFilter) return false
          if (windowEndFilter && candidateWindowStart && candidateWindowStart > windowEndFilter) return false
          if (!candidateWindowStart && !candidateWindowEnd) return false
        }
        return true
      }),
    [
      basketItems,
      candidates,
      criticalMilestoneOnly,
      deferredCandidateIds,
      priorityFilter,
      sourceFilter,
      statusFilter,
      windowEndFilter,
      windowStartFilter,
    ],
  )

  const overview = useMemo(() => {
    const sortedByTime = [...candidates].sort((left, right) => {
      const leftStamp = new Date(left.updated_at ?? left.created_at ?? 0).getTime()
      const rightStamp = new Date(right.updated_at ?? right.created_at ?? 0).getTime()
      return rightStamp - leftStamp
    })
    const derivedHighPriority = candidates.filter(
      (item) => ['high', 'critical'].includes(String(item.priority ?? item.severity ?? '').toLowerCase()),
    ).length
    const derivedConsecutiveCrossMonth = candidates.filter((item) => Number(item.consecutive_cross_month_count ?? 0) > 0).length
    const derivedCriticalMilestone = candidates.filter((item) => Boolean(item.affects_critical_milestone)).length

    return {
      total: candidates.length,
      open: candidates.filter((item) => getCandidateStatus(item.id, item) === 'open').length,
      deferred: candidates.filter((item) => getCandidateStatus(item.id, item) === 'deferred').length,
      highPriority: summary?.high_priority_count ?? derivedHighPriority,
      consecutiveCrossMonth: summary?.consecutive_cross_month_count ?? derivedConsecutiveCrossMonth,
      criticalPath: summary?.critical_milestone_count ?? derivedCriticalMilestone,
      criticalMilestone: derivedCriticalMilestone,
      lastEvaluatedAt: summary?.last_reviewed_at ?? sortedByTime[0]?.updated_at ?? sortedByTime[0]?.created_at ?? null,
    }
  }, [basketItems, candidates, deferredCandidateIds, summary])

  const clearFilters = () => {
    setStatusFilter('all')
    setPriorityFilter('all')
    setSourceFilter('all')
    setWindowStartFilter('')
    setWindowEndFilter('')
    setCriticalMilestoneOnly(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="baseline-revision-pool-dialog" className="max-w-6xl">
        <DialogHeader className="text-left">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>计划修订候选</DialogTitle>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {sourceEntryLabel}
            </span>
          </div>
          <DialogDescription>
            先看候选总览和优先级，再决定纳入修订、标记延期，或带入修订草稿继续处理。
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <Card className="border-slate-200 bg-slate-50/70 shadow-none">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-slate-500">高优先级候选数</div>
              <div className="text-lg font-semibold text-slate-900">{overview.highPriority}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/70 shadow-none">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-slate-500">连续跨月候选数</div>
              <div className="text-lg font-semibold text-slate-900">{overview.consecutiveCrossMonth}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/70 shadow-none">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-slate-500">关键路径受影响候选数</div>
              <div className="text-lg font-semibold text-slate-900">{overview.criticalPath}</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/70 shadow-none">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-slate-500">最近一次系统评估时间</div>
              <div className="text-sm font-semibold text-slate-900">
                {overview.lastEvaluatedAt ? new Date(overview.lastEvaluatedAt).toLocaleString('zh-CN', { hour12: false }) : '暂无'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-xs text-slate-500">当前候选总数 {overview.total} 项</div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">状态</span>
            {(['all', 'open', 'deferred', 'submitted', 'accepted', 'rejected'] as const).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={statusFilter === status ? 'default' : 'outline'}
                onClick={() => setStatusFilter(status)}
                className="rounded-full"
              >
                {status === 'all'
                  ? '全部状态'
                  : status === 'open'
                    ? '开放'
                    : status === 'deferred'
                      ? '延期'
                      : status === 'submitted'
                        ? '已提交'
                        : status === 'accepted'
                          ? '已接受'
                          : '已拒绝'}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">优先级</span>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((priority) => (
              <Button
                key={priority}
                type="button"
                size="sm"
                variant={priorityFilter === priority ? 'default' : 'outline'}
                onClick={() => setPriorityFilter(priority)}
                className="rounded-full"
              >
                {priority === 'all' ? '全部优先级' : priority}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">来源</span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="all">全部来源</option>
                <option value="observation">观测池</option>
                <option value="deviation">偏差分析</option>
                <option value="manual">人工补录</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">观察窗口起</span>
              <input
                type="date"
                value={windowStartFilter}
                onChange={(event) => setWindowStartFilter(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">观察窗口止</span>
              <input
                type="date"
                value={windowEndFilter}
                onChange={(event) => setWindowEndFilter(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="sm"
                variant={criticalMilestoneOnly ? 'default' : 'outline'}
                onClick={() => setCriticalMilestoneOnly((value) => !value)}
                className="rounded-full"
              >
                仅关键里程碑
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <BaselineRevisionCandidateList
            candidates={filteredCandidates}
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
              deferredReviewDueAt={deferredReviewDueAt}
              canEnterDraft={canEnterDraft}
              onAddToBasket={onAddToBasket}
              onMarkDeferred={onMarkDeferred}
              onDeferredReasonChange={onDeferredReasonChange}
              onDeferredReviewDueAtChange={onDeferredReviewDueAtChange}
              onEnterDraft={onEnterDraft}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm text-slate-600">
            已纳入本次修订 {new Set([...basketItems.map((item) => item.id), ...deferredCandidateIds]).size} 项 · 当前筛选 {filteredCandidates.length} 项 · 暂不处理 {deferredCandidateIds.length} 项
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEnterDraft}
              disabled={!canEnterDraft}
              className="gap-2"
            >
              发起基线修订
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-2">
              <X className="h-4 w-4" />
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
