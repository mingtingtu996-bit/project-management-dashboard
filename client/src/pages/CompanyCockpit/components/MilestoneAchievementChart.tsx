import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { CHART_AXIS_COLORS, CHART_SERIES, getProgressThresholdColor, hexToRgba } from '@/lib/chartPalette'

type MilestoneChartProject = {
  id: string
  name: string
  milestoneProgress: number | null
  shiftedMilestoneCount: number | null
}

type MilestoneChartRow = MilestoneChartProject & {
  progressFill: string
  chartMilestoneProgress: number
  chartShiftedMilestoneCount: number
}

function compactAxisLabel(name: string) {
  const compact = name.trim()
  return compact.length > 8 ? `${compact.slice(0, 8)}...` : compact
}

function buildChartRows(projects: MilestoneChartProject[]): MilestoneChartRow[] {
  return projects.map((project) => ({
    ...project,
    chartMilestoneProgress: project.milestoneProgress ?? 0,
    chartShiftedMilestoneCount: project.shiftedMilestoneCount ?? 0,
    progressFill: getProgressThresholdColor(project.milestoneProgress ?? 0).background,
  }))
}

export function MilestoneAchievementChart({ projects }: { projects: MilestoneChartProject[] }) {
  const hasAnyMilestoneData = projects.some((project) => project.milestoneProgress !== null || project.shiftedMilestoneCount !== null)
  const hasMilestoneSignal = projects.some((project) =>
    (project.milestoneProgress ?? 0) > 0 || (project.shiftedMilestoneCount ?? 0) > 0,
  )
  const rows = buildChartRows(projects)

  if (projects.length === 0) {
    return (
      <EmptyState
        title="暂无里程碑趋势"
        description="当前暂无可展示的项目里程碑趋势。"
        className="min-h-64 rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-10"
      />
    )
  }

  if (!hasAnyMilestoneData || !hasMilestoneSignal) {
    return (
      <EmptyState
        title="暂无里程碑趋势"
        description={hasAnyMilestoneData ? '当前项目里程碑暂无达成或偏移信号。' : '项目里程碑摘要暂不可用。'}
        className="min-h-64 rounded-2xl empty-state-frame border-slate-200 bg-slate-50 py-10"
      />
    )
  }

  return (
      <ChartAccessibleWrapper
        columns={['项目', '里程碑达成率(%)', '已偏移里程碑数']}
      rows={rows.map((project) => [
        project.name,
        project.milestoneProgress ?? '暂不可用',
        project.shiftedMilestoneCount ?? '暂不可用',
      ])}
      summary="查看里程碑达成图表数据"
    >
      <div className="relative h-72 rounded-2xl bg-white p-4 ring-1 ring-inset ring-slate-100">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 640, height: 288 }}>
          <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 24, left: 0 }}>
            <defs>
              <linearGradient id="milestoneProgressFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={CHART_SERIES.primary} stopOpacity={0.82} />
                <stop offset="100%" stopColor={CHART_SERIES.primary} stopOpacity={0.28} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_AXIS_COLORS.neutralGrid} vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
              interval="preserveStartEnd"
              tickFormatter={compactAxisLabel}
            />
            <YAxis
              yAxisId="progress"
              domain={[0, 120]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              yAxisId="shifted"
              orientation="right"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={chartTooltipCursor} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="progress"
              dataKey="chartMilestoneProgress"
              name="里程碑达成率"
              fill="url(#milestoneProgressFill)"
              radius={[8, 8, 0, 0]}
              maxBarSize={42}
              animationDuration={800}
            />
            <Line
              yAxisId="shifted"
              type="monotone"
              dataKey="chartShiftedMilestoneCount"
              name="已偏移里程碑数"
              stroke={CHART_SERIES.warning}
              strokeWidth={2}
              dot={{ r: 4, fill: CHART_SERIES.warning, stroke: hexToRgba(CHART_SERIES.warning, 0.18), strokeWidth: 6 }}
              activeDot={{ r: 5 }}
              animationDuration={800}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartAccessibleWrapper>
  )
}
