import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ScatterRow = {
  id: string
  title: string
  deviation_days: number
  deviation_rate: number
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  reason?: string | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function ExecutionScatterChart({
  rows,
  mainlineLabel,
}: {
  rows: ScatterRow[]
  mainlineLabel: string
}) {
  const points = rows.slice(0, 10)
  const maxDeviationDays = Math.max(...points.map((row) => Math.abs(row.deviation_days)), 1)
  const maxDeviationRate = Math.max(...points.map((row) => Math.abs(row.deviation_rate)), 1)

  return (
    <Card data-testid="execution-scatter-chart" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{mainlineLabel} · 散点图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {points.length > 0 ? (
          <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-300" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-slate-300" />
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`grid-x-${index}`} className="border-slate-100" style={{ borderRightWidth: index < 5 ? 1 : 0 }} />
              ))}
            </div>
            <div className="absolute inset-0 grid grid-rows-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`grid-y-${index}`} className="border-slate-100" style={{ borderBottomWidth: index < 5 ? 1 : 0 }} />
              ))}
            </div>
            {points.map((row, index) => {
              const left = clamp(50 + (row.deviation_days / maxDeviationDays) * 40, 6, 94)
              const top = clamp(50 - (row.deviation_rate / maxDeviationRate) * 40, 6, 94)
              const isNegative = row.deviation_days < 0 || row.deviation_rate < 0
              return (
                <div
                  key={row.id}
                  title={`${row.title} · 偏差 ${row.deviation_days} 天 · 偏差率 ${row.deviation_rate}%`}
                  className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${
                    isNegative ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <span className="sr-only">
                    {row.title} {row.deviation_days} {row.deviation_rate}
                  </span>
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white opacity-90">
                    #{index + 1}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            暂无散点图数据
          </div>
        )}
      </CardContent>
    </Card>
  )
}
