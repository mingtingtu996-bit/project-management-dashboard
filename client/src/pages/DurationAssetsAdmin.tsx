import { useCallback, useEffect, useMemo, useState } from 'react'
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
type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'permission' | 'stale'

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

function modelState(generatedAt: string | null, empty: boolean): LoadState {
  const timestamp = readTimestamp(generatedAt)
  if (timestamp !== null && Date.now() - timestamp > 5 * 60 * 1000) return 'stale'
  return empty ? 'empty' : 'ready'
}

function isReadableModel(state: LoadState) {
  return state === 'ready' || state === 'stale'
}

function StateNotice({ state, onRetry, modelName }: { state: Exclude<LoadState, 'ready'>; onRetry: () => void; modelName: string }) {
  const messages: Record<Exclude<LoadState, 'ready'>, string> = {
    loading: `正在读取${modelName}...`,
    empty: `暂无符合条件的${modelName}。`,
    error: `${modelName}读取失败。`,
    permission: `您没有读取${modelName}的权限。`,
    stale: `${modelName}已超过五分钟，请刷新后再作决策。`,
  }
  if (state === 'loading') return <p data-testid="duration-assets-loading" className="py-10 text-center text-sm text-slate-500">{messages.loading}</p>
  if (state === 'empty') return <p data-testid="duration-assets-empty" className="py-10 text-center text-sm text-slate-500">{messages.empty}</p>
  return (
    <Alert data-testid={`duration-assets-${state}`} variant={state === 'stale' ? 'default' : 'destructive'} className="my-4">
      <ShieldAlert className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{messages[state]}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>重试</Button>
      </AlertDescription>
    </Alert>
  )
}

export default function DurationAssetsAdmin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const tab = activeTab(searchParams.get('tab'))
  const [filters, setFilters] = useState<DurationAssetReviewFilters>({ age: 'all' })
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof getDurationAssetReviewItems>> | null>(null)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getDurationAccuracySummary>> | null>(null)
  const [governance, setGovernance] = useState<Awaited<ReturnType<typeof getDurationAccuracyGovernanceReadModel>> | null>(null)
  const [queueState, setQueueState] = useState<LoadState>('loading')
  const [summaryState, setSummaryState] = useState<LoadState>('loading')
  const [governanceState, setGovernanceState] = useState<LoadState>('loading')
  const [decision, setDecision] = useState<{ item: DurationAssetReviewItem; type: DurationAssetReviewDecision } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  const load = useCallback(async () => {
    setQueue(null)
    setSummary(null)
    setGovernance(null)
    setQueueState('loading')
    setSummaryState('loading')
    setGovernanceState('loading')
    const [queueResult, summaryResult, governanceResult] = await Promise.allSettled([
      getDurationAssetReviewItems(filters),
      getDurationAccuracySummary(filters.projectId),
      getDurationAccuracyGovernanceReadModel(filters.projectId),
    ])
    if (queueResult.status === 'fulfilled') {
      setQueue(queueResult.value)
      setQueueState(modelState(queueResult.value.generatedAt, queueResult.value.items.length === 0))
    } else {
      setQueueState(isForbidden(queueResult.reason) ? 'permission' : 'error')
    }
    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value)
      setSummaryState(modelState(summaryResult.value.generatedAt, summaryResult.value.metrics.length === 0))
    } else {
      setSummaryState(isForbidden(summaryResult.reason) ? 'permission' : 'error')
    }
    if (governanceResult.status === 'fulfilled') {
      setGovernance(governanceResult.value)
      setGovernanceState(modelState(
        governanceResult.value.generatedAt,
        governanceResult.value.publications.length === 0
          && governanceResult.value.observations.length === 0
          && governanceResult.value.runtimeCalls.length === 0,
      ))
    } else {
      setGovernanceState(isForbidden(governanceResult.reason) ? 'permission' : 'error')
    }
  }, [filters])

  useEffect(() => { void load() }, [load])
  useEffect(() => { document.title = '工期资产治理 | WorkBuddy' }, [])

  const queueItems = queue?.items ?? []
  const published = governance?.publications ?? []
  const observations = governance?.observations ?? []
  const runtimeCalls = governance?.runtimeCalls ?? []
  const metrics = summary?.metrics ?? []
  const activeState = tab === 'queue' ? queueState : tab === 'accuracy' ? summaryState : governanceState
  const activeModelName = tab === 'queue' ? '工期资产队列' : tab === 'accuracy' ? '准确度读模型' : tab === 'published' ? '发布读模型' : '监控读模型'
  const commandDisabled = decisionLoading || queueState !== 'ready' || !decisionNotes.trim()
  const anyLoading = queueState === 'loading' || summaryState === 'loading' || governanceState === 'loading'

  const setTab = (value: string) => {
    const next = activeTab(value)
    navigate(`/admin/duration-assets?tab=${next}`)
  }

  const updateFilter = <K extends keyof DurationAssetReviewFilters>(key: K, value: DurationAssetReviewFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }))
  }

  const submitDecision = async () => {
    if (!decision) return
    setDecisionLoading(true)
    try {
      await decideDurationAssetReviewItem(decision.item, decision.type, decisionNotes.trim())
      setDecision(null)
      setDecisionNotes('')
      toast({ title: `已${DECISION_LABELS[decision.type]}资产队列项`, description: '各读模型正在刷新。' })
      await load()
    } catch (error) {
      setDecision(null)
      toast({
        variant: 'destructive',
        title: '决策未提交',
        description: error instanceof Error ? error.message : '请重试',
        action: <ToastAction altText="重试工期资产决策" onClick={() => setDecision(decision)}>重试</ToastAction>,
      })
    } finally {
      setDecisionLoading(false)
    }
  }

  const queueContent = useMemo(() => (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div><label className="sr-only" htmlFor="duration-asset-family">资产族</label><Select value={filters.assetKey ?? 'all'} onValueChange={(value) => updateFilter('assetKey', value === 'all' ? undefined : value as DurationAssetReviewFilters['assetKey'])}><SelectTrigger id="duration-asset-family"><SelectValue placeholder="资产族" /></SelectTrigger><SelectContent><SelectItem value="all">全部资产</SelectItem>{DURATION_ASSET_REVIEW_KEYS.map((key) => <SelectItem key={key} value={key}>{key}</SelectItem>)}</SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-scope">作用域</label><Select value={filters.scope ?? 'all'} onValueChange={(value) => updateFilter('scope', value === 'all' ? undefined : value as DurationAssetReviewFilters['scope'])}><SelectTrigger id="duration-asset-scope"><SelectValue placeholder="作用域" /></SelectTrigger><SelectContent><SelectItem value="all">全部作用域</SelectItem><SelectItem value="project">项目</SelectItem><SelectItem value="company">公司</SelectItem><SelectItem value="industry">行业</SelectItem><SelectItem value="global">全局</SelectItem></SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-status">状态</label><Select value={filters.status ?? 'all'} onValueChange={(value) => updateFilter('status', value === 'all' ? undefined : value as DurationAssetReviewStatus)}><SelectTrigger id="duration-asset-status"><SelectValue placeholder="状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="open">待审核</SelectItem><SelectItem value="approved">已批准</SelectItem><SelectItem value="rejected">已驳回</SelectItem><SelectItem value="superseded">已替代</SelectItem><SelectItem value="resolved_by_publication">已由发布解决</SelectItem></SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-age">时间范围</label><Select value={filters.age ?? 'all'} onValueChange={(value) => updateFilter('age', value as DurationAssetReviewFilters['age'])}><SelectTrigger id="duration-asset-age"><SelectValue placeholder="时间范围" /></SelectTrigger><SelectContent><SelectItem value="all">全部时间</SelectItem><SelectItem value="24h">24 小时</SelectItem><SelectItem value="7d">7 天</SelectItem><SelectItem value="30d">30 天</SelectItem></SelectContent></Select></div>
        <Input aria-label="项目筛选" value={filters.projectId ?? ''} onChange={(event) => updateFilter('projectId', event.target.value)} placeholder="项目 ID" />
        <Input aria-label="原因筛选" value={filters.reason ?? ''} onChange={(event) => updateFilter('reason', event.target.value)} placeholder="原因代码" />
      </div>
      <div className="mb-4 max-w-xl">
        <label htmlFor="duration-asset-decision-notes" className="mb-1.5 block text-sm font-medium text-slate-700">决策备注</label>
        <Input id="duration-asset-decision-notes" aria-label="决策备注" required value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="填写审核依据" />
      </div>
      {isReadableModel(queueState) ? <div data-testid="duration-assets-table-overflow" className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[1040px]"><TableHeader className="sticky top-0 bg-slate-50"><TableRow><TableHead>资产</TableHead><TableHead>作用域</TableHead><TableHead>原因</TableHead><TableHead>状态</TableHead><TableHead>决策</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{queueItems.map((item) => <TableRow key={item.id} className="odd:bg-slate-50/50 hover:bg-slate-50"><TableCell><p className="font-medium text-slate-900">{item.assetKey}</p><p className="text-xs text-slate-500">{item.artifactKey}</p></TableCell><TableCell><Badge variant={item.canReview ? 'outline' : 'secondary'}>{scopeLabel(item)}</Badge></TableCell><TableCell className="max-w-56 text-xs text-slate-600">{item.reasonCodes.join(', ') || '-'}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell className="text-xs text-slate-600">{item.decisionReason ?? '-'}</TableCell><TableCell><div className="flex justify-end gap-2">{item.canReview && item.status === 'open' ? <><Button size="sm" disabled={commandDisabled || !item.approvalReady} onClick={() => setDecision({ item, type: 'approve' })}>批准</Button><Button size="sm" variant="outline" disabled={commandDisabled} onClick={() => setDecision({ item, type: 'reject' })}>驳回</Button><Button size="sm" variant="outline" disabled={commandDisabled} onClick={() => setDecision({ item, type: 'supersede' })}>替代</Button></> : <span className="text-xs text-slate-500">仅读</span>}</div></TableCell></TableRow>)}</TableBody></Table></div> : null}
    </>
  ), [commandDisabled, decisionNotes, filters, queueItems, queueState])

  return (
    <div className="page-shell mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm text-slate-500"><DatabaseZap className="h-4 w-4 text-blue-600" />公司管理</div><h1 className="mt-2 text-2xl font-semibold text-slate-950">工期资产治理</h1><p className="mt-1 text-sm text-slate-600">后端已治理工期资产的队列、发布、监控与准确度读模型。</p></div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={anyLoading}><RefreshCw className="h-4 w-4" />刷新</Button>
      </header>
      <div data-testid="rule-asset-action-readiness" data-state={activeState}>
      {activeState !== 'ready' ? <StateNotice state={activeState} modelName={activeModelName} onRetry={() => void load()} /> : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="工期资产视图" className="max-w-full overflow-x-auto"><TabsTrigger value="queue">{TAB_LABELS.queue}</TabsTrigger><TabsTrigger value="published">{TAB_LABELS.published}</TabsTrigger><TabsTrigger value="monitoring">{TAB_LABELS.monitoring}</TabsTrigger><TabsTrigger value="accuracy">{TAB_LABELS.accuracy}</TabsTrigger></TabsList>
        <TabsContent value="queue">{queueContent}</TabsContent>
        <TabsContent value="published">{isReadableModel(governanceState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>发布键</TableHead><TableHead>资产</TableHead><TableHead>阶段</TableHead><TableHead>监控</TableHead></TableRow></TableHeader><TableBody>{published.length ? published.map((item) => <TableRow key={item.publicationKey}><TableCell>{item.publicationKey}</TableCell><TableCell>{item.assetKey}</TableCell><TableCell><Badge variant="outline">{item.publicationStage}</Badge></TableCell><TableCell><Badge variant={statusVariant(item.monitoringStatus)}>{item.monitoringStatus}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">暂无后端发布记录。</TableCell></TableRow>}</TableBody></Table></div> : null}</TabsContent>
        <TabsContent value="monitoring">{isReadableModel(governanceState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>观测</TableHead><TableHead>资产</TableHead><TableHead>消费端</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{observations.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'publicationKey')}</TableCell><TableCell>{readString(item, 'assetKey')}</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'observationStatus')}</TableCell></TableRow>)}{runtimeCalls.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'runtimeEntryRef')}</TableCell><TableCell>-</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'callStatus')}</TableCell></TableRow>)}{!observations.length && !runtimeCalls.length ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">暂无后端监控记录。</TableCell></TableRow> : null}</TableBody></Table></div> : null}</TabsContent>
        <TabsContent value="accuracy">{isReadableModel(summaryState) ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>引擎</TableHead><TableHead>样本数</TableHead><TableHead>状态</TableHead><TableHead>指标基础</TableHead></TableRow></TableHeader><TableBody>{metrics.length ? metrics.map((item) => <TableRow key={item.engineCode}><TableCell>{item.engineCode}</TableCell><TableCell className="tabular-nums">{item.sampleCount}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell>{readString(item, 'metricBasis')}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">暂无后端准确度读模型。</TableCell></TableRow>}</TableBody></Table></div> : null}</TabsContent>
      </Tabs>
      </div>
      <ConfirmActionDialog open={Boolean(decision)} onOpenChange={(open) => !open && !decisionLoading && setDecision(null)} title={decision ? `${DECISION_LABELS[decision.type]}工期资产` : ''} description="该决策会通过受控治理写入者提交。" confirmLabel={decision ? `确认${DECISION_LABELS[decision.type]}` : '确认'} confirmTone={decision?.type === 'reject' ? 'destructive' : 'default'} testId="duration-assets-decision-dialog" loading={decisionLoading} onConfirm={() => void submitDecision()} />
    </div>
  )
}
