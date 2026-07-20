import { useMemo } from 'react'

import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { CHART_AXIS_COLORS, CHART_NEUTRAL, CHART_SERIES } from '@/lib/chartPalette'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type DeviationRowLike = {
  id: string
  title: string
  status?: string
  actual_date?: string | null
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
    { key: 'onTrack', label: '正常', color: CHART_SERIES.success },
    { key: 'delayed', label: '延期', color: CHART_SERIES.warning },
    { key: 'carriedOver', label: '滚入', color: CHART_SERIES.primary },
    { key: 'revised', label: '修订', color: CHART_NEUTRAL.text },
    { key: 'unresolved', label: '未闭环', color: CHART_SERIES.danger },
  ]
  const chartRows = normalizedBuckets.map((bucket) => {
    const total = bucket.onTrack + bucket.delayed + bucket.carriedOver + bucket.revised + bucket.unresolved
    return { ...bucket, total }
  })

  return (
    <Card data-testid="monthly-stacked-bar-chart" variant="surface">
      <CardContent padding="md" className="pb-0">
        <CardHead eyebrow="MONTHLY" title={`${mainlineLabel} · 月度堆叠柱`} />
      </CardContent>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {legend.map((item) => (
            <span key={item.key} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
        {normalizedBuckets.length > 0 ? (
          <ChartAccessibleWrapper
            columns={['月份', '正常', '延期', '滚入', '修订', '未闭环', '合计']}
            rows={chartRows.map((bucket) => [bucket.month, bucket.onTrack, bucket.delayed, bucket.carriedOver, bucket.revised, bucket.unresolved, bucket.total])}
            summary="查看月度堆叠柱图表数据"
          >
            <div className="h-72 rounded-2xl bg-white p-3 ring-1 ring-inset ring-slate-100">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 288 }}>
                <BarChart data={chartRows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={chartTooltipCursor} />
                  {legend.map((item) => (
                    <Bar
                      key={item.key}
                      dataKey={item.key}
                      name={item.label}
                      stackId="monthly"
                      fill={item.color}
                      radius={item.key === 'unresolved' ? [8, 8, 0, 0] : [0, 0, 0, 0]}
                      animationDuration={800}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartAccessibleWrapper>
        ) : (
          <EmptyState
            title="暂无月度堆叠柱数据"
            description="当前筛选条件下没有可汇总的月度偏差数据。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-8"
          />
        )}
      </CardContent>
    </Card>
  )
}

export default MonthlyStackedBarChart
