import { useMemo } from 'react'

import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { CHART_AXIS_COLORS, CHART_SERIES } from '@/lib/chartPalette'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type DeviationRowLike = {
  id: string
  title: string
  planned_date?: string | null
  deviation_days: number
  deviation_rate: number
  actual_date?: string | null
  status?: string
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
  const chartRows = points.map((row) => [
    row.title,
    formatDateLabel(row.planned_date ?? row.actual_date),
    formatDateLabel(row.actual_date ?? row.planned_date),
    row.deviation_days,
    row.deviation_rate,
    row.status || 'unknown',
  ])
  const chartPoints = points.map((row, index) => {
    const plannedValue = toDateValue(row.planned_date) ?? toDateValue(row.actual_date) ?? dateDomain.min
    const actualValue = toDateValue(row.actual_date) ?? plannedValue
    return {
      ...row,
      rowIndex: index,
      plannedValue,
      actualValue,
      plannedLabel: formatDateLabel(row.planned_date ?? row.actual_date),
      actualLabel: formatDateLabel(row.actual_date ?? row.planned_date),
    }
  })
  const plannedPoints = chartPoints.map((row) => ({
    dateValue: row.plannedValue,
    rowIndex: row.rowIndex,
    name: row.title,
    type: '计划',
  }))
  const actualPoints = chartPoints.map((row) => ({
    dateValue: row.actualValue,
    rowIndex: row.rowIndex,
    name: row.title,
    type: '实际',
  }))

  return (
    <Card data-testid="baseline-dumbbell-chart" variant="surface">
      <CardContent padding="md" className="pb-0">
        <CardHead eyebrow="BASELINE" title={`${mainlineLabel} · 哑铃图`} />
      </CardContent>
      <CardContent className="space-y-4">
        {points.length > 0 ? (
          <ChartAccessibleWrapper
            columns={['任务', '计划日期', '实际日期', '偏差天数', '偏差率(%)', '状态']}
            rows={chartRows}
            summary="查看基线哑铃图数据"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" />计划日期</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />实际日期</span>
                <span className="flex items-center gap-1"><span className="h-2 w-6 border-b-2 border-slate-200" />连接线</span>
              </div>
              <div className="h-80 rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-100">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 320 }}>
                  <ComposedChart margin={{ top: 12, right: 16, bottom: 8, left: 12 }}>
                    <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} horizontal={false} />
                    <XAxis
                      type="number"
                      dataKey="dateValue"
                      domain={[dateDomain.min, dateDomain.max]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                      tickFormatter={(value) => formatDateLabel(new Date(Number(value)).toISOString()).slice(5)}
                    />
                    <YAxis
                      type="number"
                      dataKey="rowIndex"
                      domain={[-0.5, Math.max(chartPoints.length - 0.5, 0.5)]}
                      reversed
                      tickLine={false}
                      axisLine={false}
                      width={112}
                      tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                      tickFormatter={(value) => chartPoints[Number(value)]?.title ?? ''}
                    />
                    <Tooltip content={<ChartTooltip labelFormatter={() => '基线对照'} />} cursor={chartTooltipCursor} />
                    {chartPoints.map((row) => (
                      <Line
                        key={row.id}
                        data={[
                          { dateValue: row.plannedValue, rowIndex: row.rowIndex },
                          { dateValue: row.actualValue, rowIndex: row.rowIndex },
                        ]}
                        type="linear"
                        dataKey="rowIndex"
                        stroke={row.actualValue >= row.plannedValue ? CHART_SERIES.warning : CHART_SERIES.success}
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                    <Scatter name="计划日期" data={plannedPoints} fill={CHART_SERIES.primary} animationDuration={800} />
                    <Scatter name="实际日期" data={actualPoints} fill={CHART_SERIES.danger} animationDuration={800} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartAccessibleWrapper>
        ) : (
          <EmptyState
            title="暂无基线哑铃图数据"
            description="当前筛选条件下没有可对比的计划和实际日期。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        )}
      </CardContent>
    </Card>
  )
}

export default BaselineDumbbellChart
