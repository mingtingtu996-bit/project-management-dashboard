import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { apiGet, isAbortError } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

type BlockerType = 'material' | 'drawing' | 'certificate' | 'predecessor' | 'access' | 'labor_equipment' | 'approval' | 'other'

type StartReadinessBlocker = {
  blockerType?: BlockerType
  label?: string | null
  referenceId?: string | null
}

type StartReadinessItem = {
  taskId: string
  title: string
  plannedStartDate: string
  readinessState: 'ready' | 'attention' | 'blocked'
  responsibleParty?: { displayName?: string | null } | null
  nextAction?: string | null
  unmetConditionsByType?: Partial<Record<BlockerType, StartReadinessBlocker[]>>
}

type ProjectStartReadinessPayload = {
  window?: { fromDate?: string; throughDate?: string; timezone?: string }
  productionDayMetrics?: {
    availability?: 'ready' | 'source_unavailable'
    unavailableReason?: string | null
  }
  calendarIdentity?: { unavailableReason?: string | null }
  summary?: {
    taskCount?: number
    readyTaskCount?: number
    blockedTaskCount?: number
    attentionTaskCount?: number
  }
  items?: StartReadinessItem[]
}

const BLOCKER_LABELS: Record<BlockerType, string> = {
  material: '材料',
  drawing: '图纸',
  certificate: '证照',
  predecessor: '前置任务',
  access: '作业面',
  labor_equipment: '人材机',
  approval: '审批验收',
  other: '其他',
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : '--'
}

function flattenBlockers(item: StartReadinessItem) {
  return Object.entries(item.unmetConditionsByType ?? {}).flatMap(([type, blockers]) => (
    (blockers ?? []).map((blocker) => ({ ...blocker, blockerType: blocker.blockerType ?? type as BlockerType }))
  ))
}

export function ProjectStartReadinessPanel({ projectId }: { projectId: string }) {
  const [payload, setPayload] = useState<ProjectStartReadinessPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setPayload(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const nextPayload = await apiGet<ProjectStartReadinessPayload>(
        `/api/projects/${encodeURIComponent(projectId)}/start-readiness`,
        { signal, runtimeCache: 'off' },
      )
      if (!signal?.aborted) setPayload(nextPayload)
    } catch (loadError) {
      if (isAbortError(loadError)) return
      if (!signal?.aborted) {
        setPayload(null)
        setError('开工条件暂时无法加载')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const summary = payload?.summary ?? {}
  const items = payload?.items ?? []
  const productionUnavailable = payload?.productionDayMetrics?.availability !== 'ready'
  const productionUnavailableReason = payload?.productionDayMetrics?.unavailableReason
    ?? payload?.calendarIdentity?.unavailableReason

  return (
    <section data-testid="project-start-readiness-panel" className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="meta-text">START READINESS</div>
          <h2 className="heading-3 mt-1">未来 14 天开工条件</h2>
          <p className="meta-muted mt-1">
            {payload?.window?.fromDate && payload.window.throughDate
              ? `${formatDate(payload.window.fromDate)} - ${formatDate(payload.window.throughDate)}`
              : '读取中'}
            {payload?.window?.timezone ? ` · ${payload.window.timezone}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} loading={loading} aria-label="刷新开工条件">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {loading && !payload ? (
        <LoadingState label="开工条件加载中" description="" className="min-h-40 border-0 bg-transparent shadow-none" />
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 py-8 text-sm text-rose-700">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 py-4 md:grid-cols-4">
            {[
              { label: '计划开工', value: summary.taskCount ?? 0 },
              { label: '已就绪', value: summary.readyTaskCount ?? 0 },
              { label: '阻塞', value: summary.blockedTaskCount ?? 0 },
              { label: '需关注', value: summary.attentionTaskCount ?? 0 },
            ].map((metric) => (
              <div key={metric.label} className="min-w-0">
                <div className="meta-text truncate">{metric.label}</div>
                <div className="metric-value-lg num-display mt-1">{metric.value}</div>
              </div>
            ))}
          </div>

          {productionUnavailable ? (
           <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 py-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>生产日统计暂不可用，日期窗口仍可查看</span>
              {productionUnavailableReason ? (
                <span data-testid="project-start-readiness-production-unavailable-reason" className="font-mono text-xs text-amber-700">
                  {productionUnavailableReason}
                </span>
              ) : null}
            </div>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="未来 14 天暂无计划开工任务"
              description=""
              className="rounded-none border-0 bg-transparent py-10"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const blockers = flattenBlockers(item)
                return (
                  <article key={item.taskId} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900">{item.title}</h3>
                        <span className={cn(
                          'inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium',
                          item.readinessState === 'blocked'
                            ? 'bg-rose-50 text-rose-700'
                            : item.readinessState === 'attention'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700',
                        )}>
                          {item.readinessState === 'blocked' ? '阻塞' : item.readinessState === 'attention' ? '需关注' : '已就绪'}
                        </span>
                      </div>
                      <div className="meta-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span>计划 {formatDate(item.plannedStartDate)}</span>
                        {item.responsibleParty?.displayName ? <span>{item.responsibleParty.displayName}</span> : null}
                        {item.nextAction ? <span>{item.nextAction}</span> : null}
                      </div>
                    </div>
                    {blockers.length > 0 ? (
                      <div className="flex max-w-xl flex-wrap justify-start gap-2 md:justify-end">
                        {blockers.slice(0, 5).map((blocker, index) => (
                          <span key={`${blocker.referenceId ?? blocker.label}-${index}`} className="inline-flex max-w-[16rem] items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            <span className="font-medium text-slate-700">{BLOCKER_LABELS[blocker.blockerType ?? 'other']}</span>
                            <span className="truncate">{blocker.label}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
