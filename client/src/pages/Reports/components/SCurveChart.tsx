import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CHART_SERIES } from '@/lib/chartPalette'

type SCurvePoint = {
  date: string
  planned: number
  actual?: number | null
}

function buildSCurvePoints(tasks: { start_date?: string | null; end_date?: string | null; progress?: number }[]): SCurvePoint[] {
  const datedTasks = tasks.filter((t) => t.start_date && t.end_date)
  if (datedTasks.length === 0) return []

  const allDates = datedTasks.flatMap((t) => [t.start_date!, t.end_date!]).sort()
  const minDate = new Date(allDates[0])
  const maxDate = new Date(allDates[allDates.length - 1])
  const totalMs = maxDate.getTime() - minDate.getTime()
  if (totalMs <= 0) return []

  const STEPS = 12
  const points: SCurvePoint[] = []

  for (let i = 0; i <= STEPS; i++) {
    const date = new Date(minDate.getTime() + (totalMs * i) / STEPS)
    const dateStr = date.toISOString().slice(0, 10)
    let planned = 0
    let actual = 0
    let count = 0

    for (const task of datedTasks) {
      const start = new Date(task.start_date!).getTime()
      const end = new Date(task.end_date!).getTime()
      const span = Math.max(1, end - start)
      const now = date.getTime()

      if (now >= end) {
        planned += 100
      } else if (now > start) {
        planned += Math.round(((now - start) / span) * 100)
      }

      actual += task.progress ?? 0
      count++
    }

    points.push({
      date: dateStr,
      planned: count > 0 ? Math.round(planned / count) : 0,
      actual: count > 0 ? Math.round(actual / count) : 0,
    })
  }

  return points
}

function toSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}

export function SCurveChart({ tasks }: { tasks: { start_date?: string | null; end_date?: string | null; progress?: number }[] }) {
  const points = buildSCurvePoints(tasks)

  const W = 560
  const H = 220
  const PAD = { top: 16, right: 24, bottom: 36, left: 44 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const svgPlanned = points.map((p, i) => ({
    x: PAD.left + (i / Math.max(points.length - 1, 1)) * chartW,
    y: PAD.top + (1 - p.planned / 100) * chartH,
  }))
  const svgActual = points
    .filter((p) => p.actual != null)
    .map((p, i) => ({
      x: PAD.left + (i / Math.max(points.length - 1, 1)) * chartW,
      y: PAD.top + (1 - (p.actual ?? 0) / 100) * chartH,
    }))

  const yTicks = [0, 25, 50, 75, 100]
  const today = new Date().toISOString().slice(0, 10)
  const todayIdx = points.findIndex((p) => p.date >= today)
  const todayX = todayIdx >= 0
    ? PAD.left + (todayIdx / Math.max(points.length - 1, 1)) * chartW
    : null

  return (
    <Card data-testid="reports-s-curve-chart" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          S 曲线 — 计划 vs 实际累计进度
          <div className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5" style={{ backgroundColor: CHART_SERIES.primary }} />计划</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 border-b-2 border-dashed" style={{ borderColor: CHART_SERIES.success }} />实际</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {points.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
            任务数据不足，无法生成 S 曲线。
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="S 曲线图">
            {/* Y axis grid & labels */}
            {yTicks.map((tick) => {
              const y = PAD.top + (1 - tick / 100) * chartH
              return (
                <g key={tick}>
                  <line x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="10">{tick}%</text>
                </g>
              )
            })}

            {/* X axis date labels */}
            {points.filter((_, i) => i % 3 === 0 || i === points.length - 1).map((p, _, arr) => {
              const origIdx = points.indexOf(p)
              const x = PAD.left + (origIdx / Math.max(points.length - 1, 1)) * chartW
              return (
                <text key={p.date} x={x} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize="9">
                  {p.date.slice(5)}
                </text>
              )
            })}

            {/* Today line */}
            {todayX != null && (
              <line x1={todayX} x2={todayX} y1={PAD.top} y2={PAD.top + chartH} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            )}

            {/* Planned curve */}
            <path d={toSvgPath(svgPlanned)} fill="none" stroke={CHART_SERIES.primary} strokeWidth="2" strokeLinejoin="round" />

            {/* Actual curve */}
            {svgActual.length > 1 && (
              <path d={toSvgPath(svgActual)} fill="none" stroke={CHART_SERIES.success} strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />
            )}

            {/* Axes */}
            <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + chartH} stroke="#cbd5e1" strokeWidth="1" />
            <line x1={PAD.left} x2={PAD.left + chartW} y1={PAD.top + chartH} y2={PAD.top + chartH} stroke="#cbd5e1" strokeWidth="1" />
          </svg>
        )}
      </CardContent>
    </Card>
  )
}
