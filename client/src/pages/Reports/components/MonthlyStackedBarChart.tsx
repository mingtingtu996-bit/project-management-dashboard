import { useMemo } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DeviationRowLike = {
  id: string
  title: string
  status?: string
  actual_date?: string | null
  deviation_days: number
}

type MonthBucketLike = {
  month: string
  on_track?: number
  delayed?: number
  carried_over?: number
  revised?: number
  unresolved?: number
  onTrack?: number
  carriedOver?: number
}

function normalizeMonth(date?: string | null) {
  if (!date) return '未设置'
  const normalized = String(date).trim()
  return normalized.length >= 7 ? normalized.slice(0, 7) : normalized
}

function classifyStatus(status?: string | null) {
  const normalized = String(status || '').trim()
  if (normalized === 'on_track') return 'onTrack'
  if (normalized === 'carried_over') return 'carriedOver'
  if (normalized === 'revised') return 'revised'
  if (normalized === 'unresolved') return 'unresolved'
  return 'delayed'
}

export function MonthlyStackedBarChart({
  rows,
  mainlineLabel,
  buckets,
}: {
  rows: DeviationRowLike[]
  mainlineLabel: string
  buckets?: MonthBucketLike[]
}) {
  const normalizedBuckets = useMemo(() => {
    if (buckets && buckets.length > 0) {
      return buckets
        .map((bucket) => ({
          month: bucket.month,
          onTrack: Number(bucket.onTrack ?? bucket.on_track ?? 0),
          delayed: Number(bucket.delayed ?? 0),
          carriedOver: Number(bucket.carriedOver ?? bucket.carried_over ?? 0),
          revised: Number(bucket.revised ?? 0),
          unresolved: Number(bucket.unresolved ?? 0),
        }))
        .sort((left, right) => left.month.localeCompare(right.month))
    }

    const map = new Map<string, { month: string; onTrack: number; delayed: number; carriedOver: number; revised: number; unresolved: number }>()

    for (const row of rows) {
      const month = normalizeMonth(row.actual_date)
      const bucket = map.get(month) ?? {
        month,
        onTrack: 0,
        delayed: 0,
        carriedOver: 0,
        revised: 0,
        unresolved: 0,
      }
      bucket[classifyStatus(row.status)] += 1
      map.set(month, bucket)
    }

    return [...map.values()].sort((left, right) => left.month.localeCompare(right.month))
  }, [buckets, rows])

  const legend = [
    { key: 'onTrack', label: '正常', className: 'bg-emerald-400' },
    { key: 'delayed', label: '延期', className: 'bg-amber-400' },
    { key: 'carriedOver', label: '滚入', className: 'bg-blue-400' },
    { key: 'revised', label: '修订', className: 'bg-slate-500' },
    { key: 'unresolved', label: '未闭环', className: 'bg-rose-400' },
  ]

  return (
    <Card data-testid="monthly-stacked-bar-chart" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{mainlineLabel} · 月度堆叠柱</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {legend.map((item) => (
            <span key={item.key} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${item.className}`} />
              {item.label}
            </span>
          ))}
        </div>
        {normalizedBuckets.length > 0 ? (
          <div className="space-y-3">
            {normalizedBuckets.map((bucket) => {
              const total = bucket.onTrack + bucket.delayed + bucket.carriedOver + bucket.revised + bucket.unresolved
              const safeTotal = Math.max(total, 1)
              const segments = [
                { label: '正常', value: bucket.onTrack, className: 'bg-emerald-400' },
                { label: '延期', value: bucket.delayed, className: 'bg-amber-400' },
                { label: '滚入', value: bucket.carriedOver, className: 'bg-blue-400' },
                { label: '修订', value: bucket.revised, className: 'bg-slate-500' },
                { label: '未闭环', value: bucket.unresolved, className: 'bg-rose-400' },
              ].filter((segment) => segment.value > 0)

              return (
                <div key={bucket.month} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">{bucket.month}</div>
                    <div className="text-xs text-slate-500">{total} 条</div>
                  </div>
                  <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-white">
                    {segments.map((segment) => (
                      <div
                        key={`${bucket.month}-${segment.label}`}
                        className={segment.className}
                        style={{ width: `${(segment.value / safeTotal) * 100}%` }}
                        title={`${segment.label} ${segment.value}`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {segments.map((segment) => (
                      <span key={`${bucket.month}-${segment.label}`} className="rounded-full bg-white px-2 py-0.5">
                        {segment.label} {segment.value}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            暂无月度堆叠柱数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default MonthlyStackedBarChart
