import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Database, History, Radio, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'
import {
  canUseV14231ActionableSurfaceAsStableAction,
  fetchV14231ActionableSurface,
  type V14231ActionableSurface,
} from '@/services/v14231ReadinessApi'
import { DURATION_ACCURACY_ACTION_SURFACE_KEYS } from '@/services/v14231PageActionReadiness'

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
}

type GovernanceSourceKey = 'samples' | 'publications' | 'runtimeCalls' | 'observations'

type AccuracyGovernanceReadModel = {
  source: 'duration_accuracy_governance_read_model'
  generatedAt: string
  scope: { companyId: string; projectId: string | null; projectIds: string[] }
  samples: Array<{
    id: string
    projectId: string
    engineCode: string
    outputKind: string
    predictionBasis: string
    modelVersion: string
    predictedDurationDays: number | null
    actualDurationDays: number | null
    signedErrorDays: number | null
    backtestStatus: string
    backtestedAt: string | null
  }>
  publications: Array<{
    publicationKey: string
    assetKey: string
    scopeLevel: string
    companyId: string | null
    projectId: string | null
    publicationStage: string
    trafficPercent: number
    monitoringStatus: string
    publishedAt: string | null
  }>
  runtimeCalls: Array<{
    id: string
    consumerKey: string
    runtimeEntryRef: string
    callStatus: string
    calledAt: string | null
  }>
  observations: Array<{
    id: string
    assetKey: string
    publicationKey: string
    consumerKey: string
    consumerSurface: string
    observationStatus: string
    observedAt: string | null
  }>
  sourceStatus: Record<GovernanceSourceKey, 'available' | 'unavailable'>
  sourceErrors: Partial<Record<GovernanceSourceKey, string>>
}

const ENGINE_LABELS: Record<string, string> = {
  standard_duration_reference: '工期智能参考',
  task_remaining_forecast: '执行中剩余预测',
  critical_path_cpm: 'CPM 关键路径',
  project_remaining_forecast: '项目剩余预测',
  schedule_acceleration_target: '赶工目标',
}

const ACTION_LABELS = [
  { key: DURATION_ACCURACY_ACTION_SURFACE_KEYS.autoPublish, label: '自动发布' },
  { key: DURATION_ACCURACY_ACTION_SURFACE_KEYS.forceStable, label: '强制 Stable' },
  { key: DURATION_ACCURACY_ACTION_SURFACE_KEYS.rollbackClose, label: '关闭回滚' },
] as const

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

function getStatusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (['backtested', 'active', 'stable', 'observed', 'called', 'passed', 'stable_action'].includes(status)) return 'default'
  if (['prediction_pending', 'candidate', 'canary', 'collecting', 'needs-gating'].includes(status)) return 'secondary'
  if (['failed', 'rejected', 'rolled_back'].includes(status)) return 'destructive'
  return 'outline'
}

function EmptyOrUnavailable({
  loading,
  unavailable,
  empty,
  loadingText,
  unavailableText,
  emptyText,
}: {
  loading: boolean
  unavailable: boolean
  empty: boolean
  loadingText: string
  unavailableText: string
  emptyText: string
}) {
  if (loading) return <p className="px-4 py-8 text-center text-sm text-slate-500">{loadingText}</p>
  if (unavailable) return <p role="alert" className="px-4 py-8 text-center text-sm text-red-700">{unavailableText}</p>
  if (empty) return <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyText}</p>
  return null
}

export default function DurationAccuracyAdmin() {
  const [summary, setSummary] = useState<AccuracySummary | null>(null)
  const [governance, setGovernance] = useState<AccuracyGovernanceReadModel | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [governanceLoading, setGovernanceLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [governanceError, setGovernanceError] = useState<string | null>(null)
  const [actionSurfaces, setActionSurfaces] = useState<Record<string, V14231ActionableSurface>>({})
  const [failedActionSurfaceKeys, setFailedActionSurfaceKeys] = useState<string[]>([])

  const load = useCallback(async () => {
    setSummaryLoading(true)
    setGovernanceLoading(true)
    setSummaryError(null)
    setGovernanceError(null)

    const [summaryResult, governanceResult] = await Promise.allSettled([
      apiGet<AccuracySummary>('/api/admin/duration-accuracy/summary', { runtimeCache: 'off' }),
      apiGet<AccuracyGovernanceReadModel>('/api/admin/duration-accuracy/governance-read-model?limit=25', {
        runtimeCache: 'off',
      }),
    ])

    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
    else setSummaryError(getApiErrorMessage(summaryResult.reason, '工期准度指标暂时不可用，请稍后重试。'))
    if (governanceResult.status === 'fulfilled') setGovernance(governanceResult.value)
    else setGovernanceError(getApiErrorMessage(governanceResult.reason, '工期治理明细暂时不可用，请稍后重试。'))
    setSummaryLoading(false)
    setGovernanceLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let mounted = true
    Promise.all(ACTION_LABELS.map(async ({ key }) => {
      try {
        return { key, surface: await fetchV14231ActionableSurface(key), failed: false }
      } catch {
        return { key, surface: null, failed: true }
      }
    })).then((results) => {
      if (!mounted) return
      setActionSurfaces(Object.fromEntries(
        results.flatMap((result) => result.surface ? [[result.key, result.surface]] : []),
      ))
      setFailedActionSurfaceKeys(results.filter((result) => result.failed).map((result) => result.key))
    })
    return () => {
      mounted = false
    }
  }, [])

  const metrics = useMemo(() => summary?.metrics ?? [], [summary])
  const replayMetrics = useMemo(() => {
    const replay: AccuracyMetric[] = []
    for (const metric of metrics) {
      if (metric.source.includes('replay')) replay.push(metric)
    }
    return replay
  }, [metrics])
  // eslint-disable-next-line -- frontend-bi-aggregation-approved: presentation count over backend-owned metric rows.
  const metricsWithSamplesCount = metrics.filter((metric) => metric.sampleCount > 0).length

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
                查看预测、回测、运行发布与消费证据。
              </p>
              <Link to="/admin/duration-assets?tab=accuracy" className="mt-2 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {'\u6253\u5f00\u7edf\u4e00\u5de5\u671f\u8d44\u4ea7\u9875'}
              </Link>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={summaryLoading || governanceLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${summaryLoading || governanceLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </header>

        <section
          data-testid="duration-accuracy-data-status"
          data-status={summaryLoading || governanceLoading ? 'loading' : summaryError || governanceError ? 'partial-error' : metrics.length === 0 ? 'empty' : 'available'}
          className="grid gap-3 sm:grid-cols-3"
        >
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">已返回引擎</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{summary?.engineCount ?? 0}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">含样本指标</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{metricsWithSamplesCount}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-medium text-slate-500">生成时间</p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-slate-950">{formatDateTime(summary?.generatedAt ?? governance?.generatedAt ?? null)}</p>
          </div>
        </section>

        {summaryError ? (
          <Alert variant="destructive">
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        ) : null}
        {governanceError ? (
          <Alert variant="destructive">
            <AlertDescription>{governanceError}</AlertDescription>
          </Alert>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Activity className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">准度指标</h2>
          </div>
          <Table className="min-w-[920px] table-fixed">
            <TableHeader className="bg-slate-50 text-xs uppercase text-slate-500">
              <TableRow>
                <TableHead className="w-48">引擎</TableHead>
                <TableHead className="w-44">输出</TableHead>
                <TableHead className="w-24 text-right">样本</TableHead>
                <TableHead className="w-24 text-right">MAE</TableHead>
                <TableHead className="w-24 text-right">Bias</TableHead>
                <TableHead className="w-24 text-right">MAPE</TableHead>
                <TableHead className="w-36">状态</TableHead>
                <TableHead className="w-40">最近回测</TableHead>
                <TableHead className="w-52">来源</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryLoading ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-slate-500">正在读取准度指标...</TableCell></TableRow>
              ) : metrics.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-slate-500">暂无预测快照或回测样本。</TableCell></TableRow>
              ) : metrics.map((metric) => (
                <TableRow key={`${metric.engineCode}:${metric.outputKind}:${metric.modelVersion ?? 'unknown'}:${metric.source}`} className="hover:bg-slate-50/80">
                  <TableCell>
                    <div className="font-medium text-slate-900">{ENGINE_LABELS[metric.engineCode] ?? metric.engineCode}</div>
                    <div className="truncate text-xs text-slate-500">{metric.engineCode}</div>
                  </TableCell>
                  <TableCell>{metric.outputKind}</TableCell>
                  <TableCell className="text-right tabular-nums">{metric.sampleCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(metric.maeDays, ' 天')}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(metric.biasDays, ' 天')}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(metric.mape, '%')}</TableCell>
                  <TableCell><Badge variant={getStatusVariant(metric.status)}>{metric.status}</Badge></TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(metric.lastBacktestedAt)}</TableCell>
                  <TableCell>
                    <div className="truncate">{metric.source}</div>
                    <div className="truncate text-xs text-slate-500">{metric.metricBasis}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <Database className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">准度样本</h2>
            </div>
            <EmptyOrUnavailable
              loading={governanceLoading}
              unavailable={governance?.sourceStatus.samples === 'unavailable'}
              empty={(governance?.samples.length ?? 0) === 0}
              loadingText="正在读取准度样本..."
              unavailableText="准度样本暂时不可用。"
              emptyText="暂无准度样本。"
            />
            {!governanceLoading && governance?.sourceStatus.samples === 'available' && governance.samples.length > 0 ? (
              <Table>
                <TableHeader className="bg-slate-50"><TableRow><TableHead>引擎 / 模型</TableHead><TableHead>预测 / 实际</TableHead><TableHead>误差</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                <TableBody>{governance.samples.map((sample) => (
                  <TableRow key={sample.id}>
                    <TableCell><div className="font-medium">{sample.engineCode}</div><div className="text-xs text-slate-500">{sample.modelVersion}</div></TableCell>
                    <TableCell className="tabular-nums">{formatNumber(sample.predictedDurationDays, ' 天')} / {formatNumber(sample.actualDurationDays, ' 天')}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(sample.signedErrorDays, ' 天')}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(sample.backtestStatus)}>{sample.backtestStatus}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <History className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">回放结果</h2>
            </div>
            <EmptyOrUnavailable
              loading={summaryLoading}
              unavailable={Boolean(summaryError)}
              empty={replayMetrics.length === 0}
              loadingText="正在读取回放结果..."
              unavailableText="回放结果暂时不可用。"
              emptyText="暂无回放结果。"
            />
            {!summaryLoading && !summaryError && replayMetrics.length > 0 ? (
              <Table>
                <TableHeader className="bg-slate-50"><TableRow><TableHead>引擎 / 模型</TableHead><TableHead>样本</TableHead><TableHead>MAPE</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                <TableBody>{replayMetrics.map((metric) => (
                  <TableRow key={`${metric.engineCode}:${metric.modelVersion}`}>
                    <TableCell><div className="font-medium">{metric.engineCode}</div><div className="text-xs text-slate-500">{metric.modelVersion ?? '-'}</div></TableCell>
                    <TableCell className="tabular-nums">{metric.sampleCount}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(metric.mape, '%')}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(metric.status)}>{metric.status}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            ) : null}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">运行发布</h2>
          </div>
          <EmptyOrUnavailable
            loading={governanceLoading}
            unavailable={governance?.sourceStatus.publications === 'unavailable'}
            empty={(governance?.publications.length ?? 0) === 0}
            loadingText="正在读取运行发布..."
            unavailableText="运行发布数据暂时不可用。"
            emptyText="暂无运行发布。"
          />
          {!governanceLoading && governance?.sourceStatus.publications === 'available' && governance.publications.length > 0 ? (
            <Table className="min-w-[860px]">
              <TableHeader className="bg-slate-50"><TableRow><TableHead>资产 / Publication</TableHead><TableHead>范围</TableHead><TableHead>阶段</TableHead><TableHead>流量</TableHead><TableHead>监控</TableHead><TableHead>发布时间</TableHead></TableRow></TableHeader>
              <TableBody>{governance.publications.map((publication) => (
                <TableRow key={publication.publicationKey}>
                  <TableCell><div className="font-medium">{publication.assetKey}</div><div className="max-w-[24rem] truncate text-xs text-slate-500">{publication.publicationKey}</div></TableCell>
                  <TableCell>{publication.scopeLevel}</TableCell>
                  <TableCell><Badge variant={getStatusVariant(publication.publicationStage)}>{publication.publicationStage}</Badge></TableCell>
                  <TableCell className="tabular-nums">{publication.trafficPercent}%</TableCell>
                  <TableCell>{publication.monitoringStatus}</TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(publication.publishedAt)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Radio className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-semibold text-slate-900">运行调用</h2></div>
            <EmptyOrUnavailable loading={governanceLoading} unavailable={governance?.sourceStatus.runtimeCalls === 'unavailable'} empty={(governance?.runtimeCalls.length ?? 0) === 0} loadingText="正在读取运行调用..." unavailableText="运行调用数据暂时不可用。" emptyText="暂无运行调用。" />
            {!governanceLoading && governance?.sourceStatus.runtimeCalls === 'available' && governance.runtimeCalls.length > 0 ? (
              <div className="divide-y divide-slate-100">{governance.runtimeCalls.map((call) => (
                <div key={call.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-900">{call.consumerKey}</span><Badge variant={getStatusVariant(call.callStatus)}>{call.callStatus}</Badge></div><div className="mt-1 truncate text-xs text-slate-500">{call.runtimeEntryRef}</div></div>
              ))}</div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Radio className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-semibold text-slate-900">消费观测</h2></div>
            <EmptyOrUnavailable loading={governanceLoading} unavailable={governance?.sourceStatus.observations === 'unavailable'} empty={(governance?.observations.length ?? 0) === 0} loadingText="正在读取消费观测..." unavailableText="消费观测数据暂时不可用。" emptyText="暂无消费观测。" />
            {!governanceLoading && governance?.sourceStatus.observations === 'available' && governance.observations.length > 0 ? (
              <div className="divide-y divide-slate-100">{governance.observations.map((observation) => (
                <div key={observation.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-900">{observation.consumerKey}</span><Badge variant={getStatusVariant(observation.observationStatus)}>{observation.observationStatus}</Badge></div><div className="mt-1 truncate text-xs text-slate-500">{observation.consumerSurface}</div><div className="mt-1 truncate text-xs text-slate-500">{observation.publicationKey}</div></div>
              ))}</div>
            ) : null}
          </section>
        </div>

        <section data-testid="duration-accuracy-action-readiness" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ShieldCheck className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-semibold text-slate-900">危险动作门禁</h2></div>
          <div className="divide-y divide-slate-100">
            {ACTION_LABELS.map(({ key, label }) => {
              const surface = actionSurfaces[key]
              const failed = failedActionSurfaceKeys.includes(key)
              const stable = canUseV14231ActionableSurfaceAsStableAction(surface)
              const status = failed ? 'display-only' : surface?.status ?? 'display-only'
              return (
                <div key={key} className="flex min-h-12 items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0"><p className="font-medium text-slate-900">{label}</p><p className="truncate text-xs text-slate-500">{key}</p></div>
                  <Badge variant={stable ? 'default' : 'secondary'}>{status}</Badge>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
