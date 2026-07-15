import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'

type AccuracyMetric = {
  engineCode: string
  outputKind: string
  metricBasis: string
  predictionBasis: string | null
  modelVersion: string | null
  sampleCount: number
  maeDays: number | null
  biasDays: number | null
  mape: number | null
  status: string
  lastBacktestedAt: string | null
  source: string
}

type AccuracySummary = {
  projectId: string | null
  engineCode: string | null
  engineCount: number
  generatedAt: string
  metrics: AccuracyMetric[]
  dataStatus: 'ok' | 'partial' | 'unavailable'
  sourceErrors: Array<{
    source: string
    code: string
  }>
  step2Readiness?: {
    readyForStep2: boolean
    parameterDataStatus: {
      status: 'data_collection_open' | 'enough_samples_for_parameter_calibration'
      minimumBacktestSampleCount: number
      missingSampleEngineCodes: string[]
    }
  }
}

const ENGINE_LABELS: Record<string, string> = {
  standard_duration_reference: '工期智能参考',
  task_remaining_forecast: '执行中剩余预测',
  critical_path_cpm: 'CPM 关键路径',
  project_remaining_forecast: '项目剩余预测',
  schedule_acceleration_target: '赶工目标',
}

function formatNumber(value: number | null, suffix = '') {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'backtested' || status === 'active') return 'default'
  if (status === 'prediction_pending' || status === 'candidate') return 'secondary'
  return 'outline'
}

export default function DurationAccuracyAdmin() {
  const [summary, setSummary] = useState<AccuracySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<AccuracySummary>('/api/admin/duration-accuracy/summary', {
        runtimeCache: 'off',
      })
      setSummary(data)
    } catch (err) {
      setError(getApiErrorMessage(err, '工期准度指标暂时不可用，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const metrics = useMemo(() => summary?.metrics ?? [], [summary])
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const backtestedCount = metrics.filter((metric) => metric.sampleCount > 0).length
  const dataStatus = summary?.dataStatus ?? 'ok'
  const parameterDataStatus = summary?.step2Readiness?.parameterDataStatus

  return (
    <div className="page-shell min-h-screen bg-slate-50/80 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <Activity className="h-4 w-4" />
              Duration Accuracy
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">工期五引擎准度治理</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                后台只读准度面板，用于观察预测快照、实际完成回测和参数校准前置条件。
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </header>

        {dataStatus !== 'ok' ? (
          <div
            role="alert"
            data-testid="duration-accuracy-data-status"
            data-status={dataStatus}
            className={`rounded-xl border px-4 py-3 text-sm ${
              dataStatus === 'unavailable'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {dataStatus === 'unavailable'
              ? '准度数据源暂时不可用，当前数值不代表真实零样本。'
              : '部分准度数据源读取失败，当前结果仅包含已成功读取的数据。'}
          </div>
        ) : null}

        {parameterDataStatus?.status === 'data_collection_open' ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            参数校准正在积累样本：每个引擎至少需要{' '}
            <span className="font-semibold tabular-nums">{parameterDataStatus.minimumBacktestSampleCount}</span>{' '}
            个回测样本，尚缺{' '}
            <span className="font-semibold tabular-nums">{parameterDataStatus.missingSampleEngineCodes.length}</span>{' '}
            个引擎的有效样本。
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">已返回引擎</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{summary?.engineCount ?? 0}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">已有回测样本</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{backtestedCount}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">生成时间</p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-slate-950">{formatDateTime(summary?.generatedAt ?? null)}</p>
          </div>
        </section>

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">准度指标</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-48 px-4 py-3">引擎</th>
                  <th className="w-44 px-4 py-3">输出</th>
                  <th className="w-28 px-4 py-3 text-right">样本</th>
                  <th className="w-28 px-4 py-3 text-right">MAE</th>
                  <th className="w-28 px-4 py-3 text-right">Bias</th>
                  <th className="w-28 px-4 py-3 text-right">MAPE</th>
                  <th className="w-36 px-4 py-3">状态</th>
                  <th className="w-40 px-4 py-3">最近回测</th>
                  <th className="w-52 px-4 py-3">来源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">正在读取准度指标...</td>
                  </tr>
                ) : metrics.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">暂无预测快照或回测样本。</td>
                  </tr>
                ) : metrics.map((metric) => (
                  <tr key={`${metric.engineCode}:${metric.outputKind}:${metric.modelVersion ?? 'unknown'}:${metric.source}`} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{ENGINE_LABELS[metric.engineCode] ?? metric.engineCode}</div>
                      <div className="truncate text-xs text-slate-500">{metric.engineCode}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{metric.outputKind}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{metric.sampleCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatNumber(metric.maeDays, ' 天')}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatNumber(metric.biasDays, ' 天')}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatNumber(metric.mape, '%')}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusVariant(metric.status)}>{metric.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{formatDateTime(metric.lastBacktestedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="truncate text-slate-700">{metric.source}</div>
                      <div className="truncate text-xs text-slate-500">{metric.metricBasis}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
