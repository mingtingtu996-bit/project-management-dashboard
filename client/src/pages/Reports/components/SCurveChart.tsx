import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { CHART_AXIS_COLORS, CHART_SERIES } from '@/lib/chartPalette'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SCurvePoint = {
  date: string
  planned: number
  actual?: number | null
}

type SCurveApiPoint = {
  date: string
  planned_cumulative: number
  actual_cumulative: number | null
}

type SCurveTask = {
  start_date?: string | null
  end_date?: string | null
  progress?: number
}

function buildSCurvePoints(tasks: SCurveTask[]): SCurvePoint[] {
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

function normalizeApiPoints(points?: SCurveApiPoint[]): SCurvePoint[] {
  if (!points?.length) return []
  return points.map((point) => ({
    date: point.date,
    planned: Math.max(0, Math.min(100, Number(point.planned_cumulative ?? 0))),
    actual: point.actual_cumulative == null
      ? null
      : Math.max(0, Math.min(100, Number(point.actual_cumulative))),
  }))
}

export function SCurveChart({ tasks = [], points: apiPoints }: { tasks?: SCurveTask[]; points?: SCurveApiPoint[] }) {
  const points = normalizeApiPoints(apiPoints)
  const displayPoints = points.length > 0 ? points : buildSCurvePoints(tasks)
  const today = new Date().toISOString().slice(0, 10)
  const todayIdx = displayPoints.findIndex((p) => p.date >= today)
  const chartRows = displayPoints.map((point) => ({
    ...point,
    actual: point.actual ?? null,
  }))

  return (
    <Card data-testid="reports-s-curve-chart" variant="surface">
      <CardContent padding="md" className="pb-0">
        <CardHead
          eyebrow="S-CURVE"
          title="S 曲线 · 计划 vs 实际累计进度"
          action={
            <div className="flex items-center gap-3 text-xs font-normal text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5" style={{ backgroundColor: CHART_SERIES.primary }} />计划</span>
              <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 border-b-2" style={{ borderColor: CHART_SERIES.success, borderBottomStyle: 'dashed' }} />实际</span>
            </div>
          }
        />
      </CardContent>
      <CardContent className="px-4 pb-4">
        {displayPoints.length === 0 ? (
          <EmptyState
            title="暂无 S 曲线数据"
            description="任务数据不足，暂时无法生成计划与实际累计进度曲线。"
            className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-10"
          />
        ) : (
            <ChartAccessibleWrapper
            columns={['日期', '计划累计进度(%)', '实际累计进度(%)']}
            rows={displayPoints.map((point) => [point.date, point.planned, point.actual ?? '未设置'])}
            summary="查看 S 曲线数据"
          >
            <div className="h-72 rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-100">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 288 }}>
                <AreaChart data={chartRows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="reportsSCurvePlanned" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={CHART_SERIES.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={CHART_SERIES.primary} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => String(value).slice(5)}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={chartTooltipCursor} />
                  {todayIdx >= 0 ? (
                    <ReferenceLine
                      x={displayPoints[todayIdx].date}
                      stroke={CHART_SERIES.warning}
                      strokeDasharray="4 3"
                      label={{ value: '今天', fill: CHART_SERIES.warning, fontSize: 11, position: 'top' }}
                    />
                  ) : null}
                  <Area
                    type="monotone"
                    dataKey="planned"
                    name="计划累计"
                    stroke={CHART_SERIES.primary}
                    fill="url(#reportsSCurvePlanned)"
                    strokeWidth={2}
                    animationDuration={800}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="实际累计"
                    stroke={CHART_SERIES.success}
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartAccessibleWrapper>
        )}
      </CardContent>
    </Card>
  )
}
