import { useMemo } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DeviationRowLike = {
  id: string
  title: string
  planned_date?: string | null
  deviation_days: number
  deviation_rate: number
  actual_date?: string | null
  status?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toDateValue(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  const timestamp = date.getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatDateLabel(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function BaselineDumbbellChart({
  rows,
  mainlineLabel,
}: {
  rows: DeviationRowLike[]
  mainlineLabel: string
}) {
  const points = useMemo(() => rows.slice(0, 8), [rows])
  const dateDomain = useMemo(() => {
    const values = points.flatMap((row) => {
      const planned = toDateValue(row.planned_date) ?? toDateValue(row.actual_date)
      const actual = toDateValue(row.actual_date) ?? planned
      return [planned, actual].filter((value): value is number => value !== null)
    })
    if (values.length === 0) {
      const now = Date.now()
      return { min: now - 24 * 60 * 60 * 1000, max: now + 24 * 60 * 60 * 1000 }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.08, 24 * 60 * 60 * 1000)
    return { min: min - padding, max: max + padding }
  }, [points])
  const domainSpan = Math.max(dateDomain.max - dateDomain.min, 1)

  return (
    <Card data-testid="baseline-dumbbell-chart" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{mainlineLabel} · 哑铃图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {points.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />计划日期</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />实际日期</span>
              <span className="flex items-center gap-1"><span className="h-2 w-6 border-b-2 border-slate-200" />连接线</span>
            </div>
            {points.map((row) => {
              const plannedValue = toDateValue(row.planned_date) ?? toDateValue(row.actual_date) ?? dateDomain.min
              const actualValue = toDateValue(row.actual_date) ?? plannedValue
              const left = clamp(((Math.min(plannedValue, actualValue) - dateDomain.min) / domainSpan) * 100, 0, 100)
              const width = Math.max((Math.abs(actualValue - plannedValue) / domainSpan) * 100, 1)
              const deltaClass = actualValue >= plannedValue ? 'bg-amber-400' : 'bg-emerald-400'
              const plannedLabel = formatDateLabel(row.planned_date ?? row.actual_date)
              const actualLabel = formatDateLabel(row.actual_date ?? row.planned_date)

              return (
                <div key={row.id} className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{row.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        偏差 {row.deviation_days} 天 · {row.deviation_rate}% · 计划 {plannedLabel} · 实际 {actualLabel}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{row.status || 'unknown'}</div>
                  </div>
                  <div className="relative h-8 rounded-full bg-white px-2 py-3">
                    <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
                    <div
                      className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${deltaClass}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                    <span
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow"
                      style={{ left: `${clamp(((plannedValue - dateDomain.min) / domainSpan) * 100, 0, 100)}%` }}
                      title={`计划 ${plannedLabel}`}
                    />
                    <span
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow"
                      style={{ left: `${clamp(((actualValue - dateDomain.min) / domainSpan) * 100, 0, 100)}%` }}
                      title={`实际 ${actualLabel}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>计划 {plannedLabel}</span>
                    <span>实际 {actualLabel}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            暂无基线哑铃图数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default BaselineDumbbellChart
