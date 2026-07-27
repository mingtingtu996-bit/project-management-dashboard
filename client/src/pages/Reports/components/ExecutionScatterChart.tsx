import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { CHART_AXIS_COLORS, CHART_SERIES } from '@/lib/chartPalette'
import { readAvailableDurationValue, type DurationMetricDto } from '@/lib/durationMetric'
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ScatterRow = {
  id: string
  title: string
  deviation_duration: DurationMetricDto | null
  deviation_rate: number
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  reason?: string | null
}

export function ExecutionScatterChart({
  rows,
  mainlineLabel,
}: {
  rows: ScatterRow[]
  mainlineLabel: string
}) {
  const points = rows
    .map((row) => ({
      ...row,
      deviationValue: readAvailableDurationValue(row.deviation_duration, 'construction_production_day'),
    }))
    .filter((row): row is ScatterRow & { deviationValue: number } => row.deviationValue !== null)
    .slice(0, 10)
  const maxDeviationDays = Math.max(...points.map((row) => Math.abs(row.deviationValue)), 1)
  const maxDeviationRate = Math.max(...points.map((row) => Math.abs(row.deviation_rate)), 1)
  const chartRows = points.map((row, index) => ({
    ...row,
    index: index + 1,
    name: `#${index + 1} ${row.title}`,
  }))
  const negativeRows = chartRows.filter((row) => row.deviationValue < 0 || row.deviation_rate < 0)
  const positiveRows = chartRows.filter((row) => row.deviationValue >= 0 && row.deviation_rate >= 0)

  return (
    <Card data-testid="execution-scatter-chart" variant="surface">
      <CardContent padding="md" className="pb-0">
        <CardHead eyebrow="EXECUTION" title={`${mainlineLabel} · 散点图`} />
      </CardContent>
      <CardContent className="space-y-4">
        {points.length > 0 ? (
          <ChartAccessibleWrapper
            columns={['序号', '任务', '偏差生产日', '偏差率(%)', '计划进度', '实际进度', '实际日期']}
            rows={chartRows.map((row) => [
              row.index,
              row.title,
              row.deviationValue,
              row.deviation_rate,
              row.planned_progress ?? '未设置',
              row.actual_progress ?? '未设置',
              row.actual_date ?? '未设置',
            ])}
            summary="查看散点图数据"
          >
            <div className="h-72 rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-100">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 288 }}>
                <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} />
                  <XAxis
                    type="number"
                    dataKey="deviationValue"
                    name="偏差生产日"
                    domain={[-maxDeviationDays, maxDeviationDays]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="deviation_rate"
                    name="偏差率"
                    domain={[-maxDeviationRate, maxDeviationRate]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <ReferenceLine x={0} stroke={CHART_AXIS_COLORS.neutralStroke} />
                  <ReferenceLine y={0} stroke={CHART_AXIS_COLORS.neutralStroke} />
                  <Tooltip content={<ChartTooltip labelFormatter={() => '执行偏差'} />} cursor={chartTooltipCursor} />
                  <Scatter name="提前/负偏差" data={negativeRows} fill={CHART_SERIES.success} animationDuration={800} />
                  <Scatter name="延期/正偏差" data={positiveRows} fill={CHART_SERIES.danger} animationDuration={800} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </ChartAccessibleWrapper>
        ) : (
          <EmptyState
            title="暂无散点图数据"
            description="当前筛选条件下没有可绘制的执行偏差点。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        )}
      </CardContent>
    </Card>
  )
}
