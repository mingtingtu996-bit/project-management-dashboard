import { useCallback, useEffect, useMemo, useState } from 'react'
import { CHART_SERIES } from '@/lib/chartPalette'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { AlertTriangle, ChevronDown, ChevronUp, CircleAlert, Minus, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'
import { useProject } from '@/contexts/ProjectContext'

interface RiskTrendData {
  date: string
  newRisks: number
  resolvedRisks: number
  totalRisks: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  newIssues: number
  resolvedIssues: number
  totalIssues: number
  newWarnings: number
  resolvedWarnings: number
  totalWarnings: number
}

interface RiskTrendSummary {
  trend: RiskTrendData[]
  summary: {
    totalNewRisks: number
    totalResolvedRisks: number
    currentTotalRisks: number
    currentCriticalRisks: number
    currentIssueCount: number
    currentWarningCount: number
    riskChangeRate: number
  }
  sourceTypeBreakdown: Array<{
    sourceType: string
    count: number
  }>
}

interface RiskTrendChartProps {
  defaultExpanded?: boolean
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getTrendIcon(rate: number) {
  if (rate > 0) return <TrendingUp className="h-4 w-4 text-red-500" />
  if (rate < 0) return <TrendingDown className="h-4 w-4 text-emerald-500" />
  return <Minus className="h-4 w-4 text-slate-400" />
}

function getTrendColor(rate: number) {
  if (rate > 0) return 'text-red-600'
  if (rate < 0) return 'text-emerald-600'
  return 'text-slate-500'
}

function getSourceLabel(sourceType: string) {
  switch (sourceType) {
    case 'warning_converted':
      return '预警转化'
    case 'warning_auto_escalated':
      return '预警自动升级'
    case 'condition_expired':
      return '条件过期'
    case 'obstacle_escalated':
      return '阻碍上卷'
    case 'manual':
      return '手动创建'
    default:
      return sourceType || '未分类'
  }
}

export default function RiskTrendChart({ defaultExpanded = true }: RiskTrendChartProps) {
  const { currentProject } = useProject()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RiskTrendSummary | null>(null)
  const [days, setDays] = useState(30)

  const fetchTrendData = useCallback(async () => {
    if (!currentProject) return

    setLoading(true)
    try {
      const response = await fetch(`/api/risk-statistics/trend?projectId=${currentProject.id}&days=${days}`)
      const result = await response.json()
      if (result.success) {
        setData(result.data)
      }
    } catch (error) {
      console.error('获取风险趋势失败:', error)
    } finally {
      setLoading(false)
    }
  }, [currentProject, days])

  useEffect(() => {
    if (currentProject && isExpanded) {
      void fetchTrendData()
    }
  }, [currentProject, fetchTrendData, isExpanded])

  const trend = data?.trend ?? []
  const latest = trend.length > 0 ? trend[trend.length - 1] : null
  const maxRiskTotal = useMemo(() => Math.max(...trend.map((item) => item.totalRisks), 1), [trend])
  const maxActivity = useMemo(
    () => Math.max(...trend.map((item) => Math.max(item.newRisks, item.newIssues, item.newWarnings)), 1),
    [trend],
  )
  const severityTotal = (latest?.highRiskCount ?? 0) + (latest?.mediumRiskCount ?? 0) + (latest?.lowRiskCount ?? 0) || 1

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">风险趋势分析</CardTitle>
            {data ? (
              <div className="flex items-center gap-1 text-sm">
                {getTrendIcon(data.summary.riskChangeRate)}
                <span className={getTrendColor(data.summary.riskChangeRate)}>
                  {data.summary.riskChangeRate > 0 ? '+' : ''}{data.summary.riskChangeRate}%
                </span>
                <span className="text-xs text-slate-400">({days}天)</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {isExpanded ? (
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {[7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    variant={days === d ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-7 text-xs ${days === d ? '' : 'hover:bg-slate-200'}`}
                    onClick={() => setDays(d)}
                  >
                    {d}天
                  </Button>
                ))}
              </div>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent>
          {loading ? (
            <LoadingState label="风险趋势加载中" description="" className="min-h-32 py-8" />
          ) : !trend.length ? (
            <div className="py-8 text-center text-slate-500">
              <p>暂无趋势数据</p>
              <p className="mt-1 text-sm text-slate-400">系统将自动收集每日风险、问题和预警统计数据</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                <div className="rounded-xl bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900">{data?.summary.totalNewRisks ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">新增风险</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{data?.summary.totalResolvedRisks ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">已闭环</div>
                </div>
                <div className="rounded-xl bg-blue-50 p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{data?.summary.currentTotalRisks ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">当前风险</div>
                </div>
                <div className="rounded-xl bg-rose-50 p-3 text-center">
                  <div className="text-2xl font-bold text-rose-600">{data?.summary.currentCriticalRisks ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">关键风险</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{data?.summary.currentIssueCount ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">活跃问题</div>
                </div>
                <div className="rounded-xl bg-cyan-50 p-3 text-center">
                  <div className="text-2xl font-bold text-cyan-600">{data?.summary.currentWarningCount ?? 0}</div>
                  <div className="mt-1 text-xs text-slate-500">活跃预警</div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">风险存量趋势</span>
                      <span className="text-xs text-slate-400">单位: 个</span>
                    </div>
                    <div className="relative h-44 rounded-2xl bg-slate-50 p-4">
                      <div className="absolute left-2 top-4 bottom-8 flex flex-col justify-between text-xs text-slate-400">
                        <span>{maxRiskTotal}</span>
                        <span>{Math.round(maxRiskTotal / 2)}</span>
                        <span>0</span>
                      </div>
                      <div className="ml-8 flex h-full items-end gap-1 pb-6">
                        {trend.map((item, index) => {
                          const height = (item.totalRisks / maxRiskTotal) * 100
                          const isLatest = index === trend.length - 1
                          return (
                            <div key={item.date} className="flex flex-1 flex-col items-center justify-end">
                              <div
                                className={`w-full max-w-9 rounded-t ${isLatest ? 'bg-blue-500' : 'bg-blue-300'}`}
                                style={{ height: `${Math.max(height, 4)}%` }}
                                title={`${item.date}: ${item.totalRisks} 个风险`}
                              />
                              {index % Math.max(Math.ceil(trend.length / 8), 1) === 0 ? (
                                <span className="mt-1 text-[11px] text-slate-400">{formatDate(item.date)}</span>
                              ) : (
                                <span className="mt-1 text-[11px] text-transparent">.</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">新增活动对比</span>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded bg-[color:var(--chart-danger)]" style={{ backgroundColor: CHART_SERIES.danger }} />
                          风险
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded" style={{ backgroundColor: CHART_SERIES.warning }} />
                          问题
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded" style={{ backgroundColor: CHART_SERIES.primary }} />
                          预警
                        </span>
                      </div>
                    </div>
                    <div className="relative h-36 rounded-2xl bg-slate-50 p-4">
                      <div className="ml-2 flex h-full items-end gap-1 pb-6">
                        {trend.map((item, index) => {
                          const riskHeight = (item.newRisks / maxActivity) * 100
                          const issueHeight = (item.newIssues / maxActivity) * 100
                          const warningHeight = (item.newWarnings / maxActivity) * 100
                          return (
                            <div key={item.date} className="flex flex-1 flex-col items-center justify-end">
                              <div className="flex w-full items-end justify-center gap-1">
                                <div className="w-2 rounded-t bg-[color:var(--chart-danger)]" style={{ height: `${Math.max(riskHeight, 2)}%`, backgroundColor: CHART_SERIES.danger }} title={`新增风险 ${item.newRisks}`} />
                                <div className="w-2 rounded-t" style={{ height: `${Math.max(issueHeight, 2)}%`, backgroundColor: CHART_SERIES.warning }} title={`新增问题 ${item.newIssues}`} />
                                <div className="w-2 rounded-t" style={{ height: `${Math.max(warningHeight, 2)}%`, backgroundColor: CHART_SERIES.primary }} title={`新增预警 ${item.newWarnings}`} />
                              </div>
                              {index % Math.max(Math.ceil(trend.length / 8), 1) === 0 ? (
                                <span className="mt-1 text-[11px] text-slate-400">{formatDate(item.date)}</span>
                              ) : (
                                <span className="mt-1 text-[11px] text-transparent">.</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">风险等级结构</span>
                      <span className="text-xs text-slate-400">当前存量</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex h-4 overflow-hidden rounded-full">
                        <div className="bg-red-500" style={{ width: `${((latest?.highRiskCount ?? 0) / severityTotal) * 100}%` }} />
                        <div className="bg-orange-400" style={{ width: `${((latest?.mediumRiskCount ?? 0) / severityTotal) * 100}%` }} />
                        <div className="bg-blue-400" style={{ width: `${((latest?.lowRiskCount ?? 0) / severityTotal) * 100}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                          高 {latest?.highRiskCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
                          中 {latest?.mediumRiskCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                          低 {latest?.lowRiskCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="border-slate-200 shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">来源结构</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(data?.sourceTypeBreakdown ?? []).length > 0 ? (
                        (data?.sourceTypeBreakdown ?? []).map((item) => (
                          <div key={item.sourceType} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                            <span className="text-slate-700">{getSourceLabel(item.sourceType)}</span>
                            <span className="text-slate-500">{item.count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          暂无来源分布
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">最新趋势摘要</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span>最近新增风险</span>
                        <span className="font-medium text-slate-900">{latest?.newRisks ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span>最近新增问题</span>
                        <span className="font-medium text-slate-900">{latest?.newIssues ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span>最近新增预警</span>
                        <span className="font-medium text-slate-900">{latest?.newWarnings ?? 0}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        风险提示
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>风险、问题和预警已按同一趋势口径汇总，便于统一观察链路压力。</span>
                      </div>
                      <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sky-900">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>来源分布已从标题关键词切换为 source_type 为主，历史数据保留标题兜底。</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  )
}
