import { useCallback, useEffect, useState } from 'react'
import { DatabaseZap, RefreshCw, ShieldAlert } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import {
  DURATION_ASSET_REVIEW_KEYS,
  decideDurationAssetReviewItem,
  getDurationAccuracyGovernanceReadModel,
  getDurationAccuracySummary,
  getDurationAssetReviewItems,
  readTimestamp,
  type DurationAssetReviewDecision,
  type DurationAssetReviewFilters,
  type DurationAssetReviewItem,
  type DurationAssetReviewStatus,
} from '@/services/durationAssetsApi'

type TabKey = 'queue' | 'published' | 'monitoring' | 'accuracy'
type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'permission' | 'stale' | 'partial' | 'unavailable'

const FRESHNESS_MS = 5 * 60 * 1000
const INITIAL_FILTERS: DurationAssetReviewFilters = { age: 'all' }
const TAB_KEYS: TabKey[] = ['queue', 'published', 'monitoring', 'accuracy']
const TAB_LABELS: Record<TabKey, string> = {
  queue: '审核队列',
  published: '已发布',
  monitoring: '监控',
  accuracy: '准确度',
}
const DECISION_LABELS: Record<DurationAssetReviewDecision, string> = {
  approve: '批准', reject: '驳回', supersede: '替代',
}

function activeTab(value: string | null): TabKey {
  return TAB_KEYS.includes(value as TabKey) ? value as TabKey : 'queue'
}

function isForbidden(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: unknown }).status === 403
}

function readString(record: Record<string, unknown>, key: string) {
  return String(record[key] ?? '').trim() || '-'
}

function isStale(generatedAt: string | null | undefined) {
  const timestamp = readTimestamp(generatedAt)
  return timestamp !== null && Date.now() - timestamp >= FRESHNESS_MS
}

function modelState(generatedAt: string | null, empty: boolean): LoadState {
  if (isStale(generatedAt)) return 'stale'
  return empty ? 'empty' : 'ready'
}

function isReadableModel(state: LoadState) {
  return state === 'ready' || state === 'stale' || state === 'partial'
}

function optionalUuid(value: string | undefined) {
  return !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (['approved', 'stable', 'active', 'backtested', 'observed', 'called'].includes(status)) return 'default'
  if (['rejected', 'failed', 'rolled_back'].includes(status)) return 'destructive'
  if (['open', 'candidate', 'canary', 'collecting'].includes(status)) return 'secondary'
  return 'outline'
}

function scopeLabel(item: DurationAssetReviewItem) {
  if (item.scope.level === 'global') return '全局只读'
  if (item.scope.level === 'industry') return `行业: ${item.scope.industryKey}`
  if (item.scope.level === 'company') return '公司'
  return `项目: ${item.scope.projectId}`
}

function StateNotice({ state, onRetry, modelName, details }: {
  state: Exclude<LoadState, 'ready'>
  onRetry: () => void
  modelName: string
  details?: string
}) {
  const messages: Record<Exclude<LoadState, 'ready'>, string> = {
    loading: `正在读取${modelName}...`,
    empty: `暂无符合条件的${modelName}。`,
    error: `${modelName}读取失败。`,
    permission: `您没有读取${modelName}的权限。`,
    stale: `${modelName}已超过五分钟，请刷新后再作决策。`,
    partial: `${modelName}部分数据暂不可用。`,
    unavailable: `${modelName}数据暂时不可用。`,
  }
  if (state === 'loading') return <p data-testid="duration-assets-loading" className="py-10 text-center text-sm text-slate-500">{messages.loading}</p>
  if (state === 'empty') return <p data-testid="duration-assets-empty" className="py-10 text-center text-sm text-slate-500">{messages.empty}</p>
  return (
    <Alert data-testid={`duration-assets-${state}`} variant={state === 'error' || state === 'permission' || state === 'unavailable' ? 'destructive' : 'default'} className="my-4">
      <ShieldAlert className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{details ? `${messages[state]} ${details}` : messages[state]}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>重试</Button>
      </AlertDescription>
    </Alert>
  )
}

function useFreshnessTimer(generatedAt: string | null | undefined, state: LoadState, setState: (next: LoadState | ((current: LoadState) => LoadState)) => void) {
  useEffect(() => {
    const timestamp = readTimestamp(generatedAt)
    if (timestamp === null || (state !== 'ready' && state !== 'partial')) return
    const markStale = () => setState((current) => current === 'ready' || current === 'partial' ? 'stale' : current)
    const delay = timestamp + FRESHNESS_MS - Date.now()
    if (delay <= 0) {
      markStale()
      return
    }
    const timer = window.setTimeout(markStale, delay)
    return () => window.clearTimeout(timer)
  }, [generatedAt, setState, state])
}

export default function DurationAssetsAdmin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const tab = activeTab(searchParams.get('tab'))
  const [draftFilters, setDraftFilters] = useState<DurationAssetReviewFilters>(INITIAL_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<DurationAssetReviewFilters>(INITIAL_FILTERS)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof getDurationAssetReviewItems>> | null>(null)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getDurationAccuracySummary>> | null>(null)
  const [governance, setGovernance] = useState<Awaited<ReturnType<typeof getDurationAccuracyGovernanceReadModel>> | null>(null)
  const [queueState, setQueueState] = useState<LoadState>('loading')
  const [summaryState, setSummaryState] = useState<LoadState>('loading')
  const [governanceState, setGovernanceState] = useState<LoadState>('loading')
  const [decision, setDecision] = useState<{ item: DurationAssetReviewItem; type: DurationAssetReviewDecision } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)
  const generation = useState(() => ({ current: 0 }))[0]

  const load = useCallback((requestedFilters: DurationAssetReviewFilters) => {
    const requestGeneration = ++generation.current
    setQueue(null)
    setSummary(null)
    setGovernance(null)
    setQueueState('loading')
    setSummaryState('loading')
    setGovernanceState('loading')

    void getDurationAssetReviewItems(requestedFilters).then((model) => {
      if (generation.current !== requestGeneration) return
      setQueue(model)
      setQueueState(modelState(model.generatedAt, model.items.length === 0))
    }).catch((error: unknown) => {
      if (generation.current === requestGeneration) setQueueState(isForbidden(error) ? 'permission' : 'error')
    })

    void getDurationAccuracySummary(requestedFilters.projectId).then((model) => {
      if (generation.current !== requestGeneration) return
      setSummary(model)
      setSummaryState(modelState(model.generatedAt, model.dataStatus === 'ok' && model.metrics.length === 0))
    }).catch((error: unknown) => {
      if (generation.current === requestGeneration) setSummaryState(isForbidden(error) ? 'permission' : 'error')
    })

    void getDurationAccuracyGovernanceReadModel(requestedFilters.projectId).then((model) => {
      if (generation.current !== requestGeneration) return
      setGovernance(model)
      setGovernanceState(modelState(model.generatedAt, false))
    }).catch((error: unknown) => {
      if (generation.current === requestGeneration) setGovernanceState(isForbidden(error) ? 'permission' : 'error')
    })
  }, [generation])

  useEffect(() => { load(INITIAL_FILTERS) }, [load])
  useEffect(() => { document.title = '工期资产治理 | WorkBuddy' }, [])
  useFreshnessTimer(queue?.generatedAt, queueState, setQueueState)
  useFreshnessTimer(summary?.generatedAt, summaryState, setSummaryState)
  useFreshnessTimer(governance?.generatedAt, governanceState, setGovernanceState)

  const queueItems = queue?.items ?? []
  const published = governance?.publications ?? []
  const observations = governance?.observations ?? []
  const runtimeCalls = governance?.runtimeCalls ?? []
  const metrics = summary?.metrics ?? []
  const summaryDisplayState: LoadState = !isReadableModel(summaryState) || !summary
    ? summaryState
    : summary.dataStatus === 'unavailable' ? 'unavailable'
      : summary.dataStatus === 'partial' ? 'partial'
        : summaryState
  const publishedDisplayState: LoadState = !isReadableModel(governanceState) || !governance
    ? governanceState
    : governance.sourceStatus.publications === 'unavailable' ? 'unavailable'
      : governanceState === 'ready' && published.length === 0 ? 'empty'
        : governanceState
  const monitoringUnavailable = governance
    ? [governance.sourceStatus.observations, governance.sourceStatus.runtimeCalls].filter((status) => status === 'unavailable').length
    : 0
  const monitoringDisplayState: LoadState = !isReadableModel(governanceState) || !governance
    ? governanceState
    : monitoringUnavailable === 2 ? 'unavailable'
      : monitoringUnavailable > 0 ? 'partial'
        : governanceState === 'ready' && observations.length === 0 && runtimeCalls.length === 0 ? 'empty'
          : governanceState
  const activeState = tab === 'queue' ? queueState : tab === 'accuracy' ? summaryDisplayState : tab === 'published' ? publishedDisplayState : monitoringDisplayState
  const activeModelName = tab === 'queue' ? '工期资产队列' : tab === 'accuracy' ? '准确度读模型' : tab === 'published' ? '发布读模型' : '监控读模型'
  const activeSourceErrors = tab === 'accuracy'
    ? Object.values(summary?.sourceErrors ?? {}).join('，')
    : tab === 'published'
      ? governance?.sourceErrors.publications
      : tab === 'monitoring'
        ? [governance?.sourceErrors.observations, governance?.sourceErrors.runtimeCalls].filter(Boolean).join('，')
        : undefined
  const commandDisabled = decisionLoading || queueState !== 'ready' || isStale(queue?.generatedAt) || !decisionNotes.trim()
  const anyLoading = queueState === 'loading' || summaryState === 'loading' || governanceState === 'loading'

  const updateDraftFilter = <K extends keyof DurationAssetReviewFilters>(key: K, value: DurationAssetReviewFilters[K]) => {
    setDraftFilters((current) => ({ ...current, [key]: value || undefined }))
  }

  const applyFilters = () => {
    const projectId = draftFilters.projectId?.trim() || undefined
    if (!optionalUuid(projectId)) {
      setFilterError('项目 ID 必须为 UUID')
      return
    }
    const nextFilters = { ...draftFilters, projectId, reason: draftFilters.reason?.trim() || undefined }
    setFilterError(null)
    setAppliedFilters(nextFilters)
    load(nextFilters)
  }

  const setTab = (value: string) => navigate(`/admin/duration-assets?tab=${activeTab(value)}`)

  const submitDecision = async () => {
    if (!decision || !decisionNotes.trim()) return
    if (!queue || isStale(queue.generatedAt)) {
      setQueueState('stale')
      toast({ variant: 'destructive', title: '决策未提交', description: '队列读模型已过期，请刷新后重试。' })
      return
    }
    setDecisionLoading(true)
    try {
      const result = await decideDurationAssetReviewItem(decision.item, decision.type, decisionNotes.trim())
      if (result.status !== 'operation_delegated') throw new Error(result.reasons.join('，') || '受控写入被阻止。')
      setDecision(null)
      setDecisionNotes('')
      toast({ title: `${DECISION_LABELS[decision.type]}资产队列项`, description: '各读模型正在刷新。' })
      load(appliedFilters)
    } catch (error) {
      setDecision(null)
      toast({
        variant: 'destructive',
        title: '决策未提交',
        description: error instanceof Error ? error.message : '请重试。',
        action: <ToastAction altText="重试工期资产决策" onClick={() => setDecision(decision)}>重试</ToastAction>,
      })
    } finally {
      setDecisionLoading(false)
    }
  }

  return (
    <div className="page-shell mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500"><DatabaseZap className="h-4 w-4 text-blue-600" />公司管理</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">工期资产治理</h1>
          <p className="mt-1 text-sm text-slate-600">后端已治理工期资产的队列、发布、监控与准确度读模型。</p>
        </div>
        <Button type="button" variant="outline" onClick={() => load(appliedFilters)} disabled={anyLoading}><RefreshCw className="h-4 w-4" />刷新</Button>
      </header>
      <div data-testid="rule-asset-action-readiness" data-state={activeState}>
        {activeState !== 'ready' ? <StateNotice state={activeState} modelName={activeModelName} details={activeSourceErrors} onRetry={() => load(appliedFilters)} /> : null}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="工期资产视图" className="max-w-full overflow-x-auto"><TabsTrigger value="queue">{TAB_LABELS.queue}</TabsTrigger><TabsTrigger value="published">{TAB_LABELS.published}</TabsTrigger><TabsTrigger value="monitoring">{TAB_LABELS.monitoring}</TabsTrigger><TabsTrigger value="accuracy">{TAB_LABELS.accuracy}</TabsTrigger></TabsList>
          <TabsContent value="queue">
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div><label className="sr-only" htmlFor="duration-asset-family">资产族</label><Select value={draftFilters.assetKey ?? 'all'} onValueChange={(value) => updateDraftFilter('assetKey', value === 'all' ? undefined : value as DurationAssetReviewFilters['assetKey'])}><SelectTrigger id="duration-asset-family"><SelectValue placeholder="资产族" /></SelectTrigger><SelectContent><SelectItem value="all">全部资产</SelectItem>{DURATION_ASSET_REVIEW_KEYS.map((key) => <SelectItem key={key} value={key}>{key}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="sr-only" htmlFor="duration-asset-scope">作用域</label><Select value={draftFilters.scope ?? 'all'} onValueChange={(value) => updateDraftFilter('scope', value === 'all' ? undefined : value as DurationAssetReviewFilters['scope'])}><SelectTrigger id="duration-asset-scope"><SelectValue placeholder="作用域" /></SelectTrigger><SelectContent><SelectItem value="all">全部作用域</SelectItem><SelectItem value="project">项目</SelectItem><SelectItem value="company">公司</SelectItem><SelectItem value="industry">行业</SelectItem><SelectItem value="global">全局</SelectItem></SelectContent></Select></div>
              <div><label className="sr-only" htmlFor="duration-asset-status">状态</label><Select value={draftFilters.status ?? 'all'} onValueChange={(value) => updateDraftFilter('status', value === 'all' ? undefined : value as DurationAssetReviewStatus)}><SelectTrigger id="duration-asset-status"><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="open">待审核</SelectItem><SelectItem value="approved">已批准</SelectItem><SelectItem value="rejected">已驳回</SelectItem><SelectItem value="superseded">已替代</SelectItem><SelectItem value="resolved_by_publication">已由发布解决</SelectItem></SelectContent></Select></div>
              <div><label className="sr-only" htmlFor="duration-asset-age">时间范围</label><Select value={draftFilters.age ?? 'all'} onValueChange={(value) => updateDraftFilter('age', value as DurationAssetReviewFilters['age'])}><SelectTrigger id="duration-asset-age"><SelectValue placeholder="时间范围" /></SelectTrigger><SelectContent><SelectItem value="all">全部时间</SelectItem><SelectItem value="24h">24 小时</SelectItem><SelectItem value="7d">7 天</SelectItem><SelectItem value="30d">30 天</SelectItem></SelectContent></Select></div>
              <Input aria-label="项目筛选" aria-invalid={Boolean(filterError)} className={filterError ? 'border-red-500' : undefined} value={draftFilters.projectId ?? ''} onChange={(event) => updateDraftFilter('projectId', event.target.value)} placeholder="项目 ID" />
              <Input aria-label="原因筛选" value={draftFilters.reason ?? ''} onChange={(event) => updateDraftFilter('reason', event.target.value)} placeholder="原因代码" />
            </div>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <Button type="button" onClick={applyFilters}>应用筛选</Button>
              {filterError ? <p role="alert" className="text-sm text-red-600">{filterError}</p> : null}
            </div>
            <div className="mb-4 max-w-xl">
              <label htmlFor="duration-asset-decision-notes" className="mb-1.5 block text-sm font-medium text-slate-700">决策备注</label>
              <Input id="duration-asset-decision-notes" aria-label="决策备注" required value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="填写审核依据" />
            </div>
            {isReadableModel(queueState) ? <div data-testid="duration-assets-table-overflow" className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[1040px]"><TableHeader className="sticky top-0 bg-slate-50"><TableRow><TableHead>资产</TableHead><TableHead>作用域</TableHead><TableHead>原因</TableHead><TableHead>状态</TableHead><TableHead>决策</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{queueItems.map((item) => <TableRow key={item.id} className="odd:bg-slate-50/50 hover:bg-slate-50"><TableCell><p className="font-medium text-slate-900">{item.assetKey}</p><p className="text-xs text-slate-500">{item.artifactKey}</p></TableCell><TableCell><Badge variant={item.canReview ? 'outline' : 'secondary'}>{scopeLabel(item)}</Badge></TableCell><TableCell className="max-w-56 text-xs text-slate-600">{item.reasonCodes.join(', ') || '-'}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell className="text-xs text-slate-600">{item.decisionReason ?? '-'}</TableCell><TableCell><div className="flex justify-end gap-2">{item.canReview && item.status === 'open' ? <><Button size="sm" aria-label={`批准 ${item.assetKey} ${item.artifactKey}`} disabled={commandDisabled || !item.approvalReady} onClick={() => setDecision({ item, type: 'approve' })}>批准</Button><Button size="sm" variant="outline" aria-label={`驳回 ${item.assetKey} ${item.artifactKey}`} disabled={commandDisabled} onClick={() => setDecision({ item, type: 'reject' })}>驳回</Button><Button size="sm" variant="outline" aria-label={`替代 ${item.assetKey} ${item.artifactKey}`} disabled={commandDisabled} onClick={() => setDecision({ item, type: 'supersede' })}>替代</Button></> : <span className="text-xs text-slate-500">只读</span>}</div></TableCell></TableRow>)}</TableBody></Table></div> : null}
          </TabsContent>
          <TabsContent value="published">{isReadableModel(publishedDisplayState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>发布键</TableHead><TableHead>资产</TableHead><TableHead>阶段</TableHead><TableHead>监控</TableHead></TableRow></TableHeader><TableBody>{published.map((item) => <TableRow key={item.publicationKey}><TableCell>{item.publicationKey}</TableCell><TableCell>{item.assetKey}</TableCell><TableCell><Badge variant="outline">{item.publicationStage}</Badge></TableCell><TableCell><Badge variant={statusVariant(item.monitoringStatus)}>{item.monitoringStatus}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : null}</TabsContent>
          <TabsContent value="monitoring">{isReadableModel(monitoringDisplayState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>观测</TableHead><TableHead>资产</TableHead><TableHead>消费端</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{observations.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'publicationKey')}</TableCell><TableCell>{readString(item, 'assetKey')}</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'observationStatus')}</TableCell></TableRow>)}{runtimeCalls.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'runtimeEntryRef')}</TableCell><TableCell>-</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'callStatus')}</TableCell></TableRow>)}</TableBody></Table></div> : null}</TabsContent>
          <TabsContent value="accuracy">{isReadableModel(summaryDisplayState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>引擎</TableHead><TableHead>样本数</TableHead><TableHead>状态</TableHead><TableHead>指标基础</TableHead></TableRow></TableHeader><TableBody>{metrics.map((item) => <TableRow key={item.engineCode}><TableCell>{item.engineCode}</TableCell><TableCell className="tabular-nums">{item.sampleCount}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell>{readString(item, 'metricBasis')}</TableCell></TableRow>)}</TableBody></Table></div> : null}</TabsContent>
        </Tabs>
      </div>
      <ConfirmActionDialog open={Boolean(decision)} onOpenChange={(open) => !open && !decisionLoading && setDecision(null)} title={decision ? `${DECISION_LABELS[decision.type]}工期资产` : ''} description="该决策会通过受控治理写入者提交。" confirmLabel={decision ? `确认${DECISION_LABELS[decision.type]}` : '确认'} confirmTone={decision?.type === 'reject' ? 'destructive' : 'default'} testId="duration-assets-decision-dialog" loading={decisionLoading} onConfirm={() => void submitDecision()} />
    </div>
  )
}
