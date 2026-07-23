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
  queue: '\u5ba1\u6838\u961f\u5217',
  published: '\u5df2\u53d1\u5e03',
  monitoring: '\u76d1\u63a7',
  accuracy: '\u51c6\u786e\u5ea6',
}
const DECISION_LABELS: Record<DurationAssetReviewDecision, string> = {
  approve: '\u6279\u51c6', reject: '\u9a73\u56de', supersede: '\u66ff\u4ee3',
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
  if (item.scope.level === 'global') return '\u5168\u5c40\u53ea\u8bfb'
  if (item.scope.level === 'industry') return `\u884c\u4e1a: ${item.scope.industryKey}`
  if (item.scope.level === 'company') return '\u516c\u53f8'
  return `\u9879\u76ee: ${item.scope.projectId}`
}

function StateNotice({ state, onRetry }: { state: Exclude<LoadState, 'ready'>; onRetry: () => void }) {
  const messages: Record<Exclude<LoadState, 'ready'>, string> = {
    loading: '\u6b63\u5728\u8bfb\u53d6\u5de5\u671f\u8d44\u4ea7\u961f\u5217...',
    empty: '\u6682\u65e0\u7b26\u5408\u6761\u4ef6\u7684\u6cbb\u7406\u8d44\u4ea7\u3002',
    error: '\u961f\u5217\u8bfb\u53d6\u5931\u8d25\u3002',
    permission: '\u60a8\u6ca1\u6709\u5f53\u524d\u516c\u53f8\u7684\u5de5\u671f\u8d44\u4ea7\u7ba1\u7406\u6743\u9650\u3002',
    stale: '\u8bfb\u6a21\u578b\u5df2\u8d85\u8fc7\u4e94\u5206\u949f\uff0c\u8bf7\u5237\u65b0\u540e\u518d\u4f5c\u51b3\u7b56\u3002',
  }
  if (state === 'loading') return <p data-testid="duration-assets-loading" className="py-10 text-center text-sm text-slate-500">{messages.loading}</p>
  if (state === 'empty') return <p data-testid="duration-assets-empty" className="py-10 text-center text-sm text-slate-500">{messages.empty}</p>
  return (
    <Alert data-testid={`duration-assets-${state}`} variant={state === 'stale' ? 'default' : 'destructive'} className="my-4">
      <ShieldAlert className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{messages[state]}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>\u91cd\u8bd5</Button>
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
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [decision, setDecision] = useState<{ item: DurationAssetReviewItem; type: DurationAssetReviewDecision } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    const [queueResult, summaryResult, governanceResult] = await Promise.allSettled([
      getDurationAssetReviewItems(filters),
      getDurationAccuracySummary(filters.projectId),
      getDurationAccuracyGovernanceReadModel(filters.projectId),
    ])
    if (queueResult.status === 'rejected') {
      setLoadState(isForbidden(queueResult.reason) ? 'permission' : 'error')
      return
    }
    setQueue(queueResult.value)
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
    if (governanceResult.status === 'fulfilled') setGovernance(governanceResult.value)
    const generatedAt = readTimestamp(queueResult.value.generatedAt)
    const stale = generatedAt !== null && Date.now() - generatedAt > 5 * 60 * 1000
    setLoadState(stale ? 'stale' : queueResult.value.items.length === 0 ? 'empty' : 'ready')
  }, [filters])

  useEffect(() => { void load() }, [load])
  useEffect(() => { document.title = '\u5de5\u671f\u8d44\u4ea7\u6cbb\u7406 | WorkBuddy' }, [])

  const queueItems = queue?.items ?? []
  const published = governance?.publications ?? []
  const observations = governance?.observations ?? []
  const runtimeCalls = governance?.runtimeCalls ?? []
  const metrics = summary?.metrics ?? []
  const stale = loadState === 'stale'
  const commandDisabled = decisionLoading || stale || loadState !== 'ready'

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
      toast({ title: `\u5df2${DECISION_LABELS[decision.type]}\u8d44\u4ea7\u961f\u5217\u9879`, description: '\u5404\u8bfb\u6a21\u578b\u6b63\u5728\u5237\u65b0\u3002' })
      await load()
    } catch (error) {
      setDecision(null)
      toast({
        variant: 'destructive',
        title: '\u51b3\u7b56\u672a\u63d0\u4ea4',
        description: error instanceof Error ? error.message : '\u8bf7\u91cd\u8bd5',
        action: <ToastAction altText="\u91cd\u8bd5\u5de5\u671f\u8d44\u4ea7\u51b3\u7b56" onClick={() => setDecision(decision)}>\u91cd\u8bd5</ToastAction>,
      })
    } finally {
      setDecisionLoading(false)
    }
  }

  const queueContent = useMemo(() => (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div><label className="sr-only" htmlFor="duration-asset-family">\u8d44\u4ea7\u65cf</label><Select value={filters.assetKey ?? 'all'} onValueChange={(value) => updateFilter('assetKey', value === 'all' ? undefined : value as DurationAssetReviewFilters['assetKey'])}><SelectTrigger id="duration-asset-family"><SelectValue placeholder="\u8d44\u4ea7\u65cf" /></SelectTrigger><SelectContent><SelectItem value="all">\u5168\u90e8\u8d44\u4ea7</SelectItem>{DURATION_ASSET_REVIEW_KEYS.map((key) => <SelectItem key={key} value={key}>{key}</SelectItem>)}</SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-scope">\u4f5c\u7528\u57df</label><Select value={filters.scope ?? 'all'} onValueChange={(value) => updateFilter('scope', value === 'all' ? undefined : value as DurationAssetReviewFilters['scope'])}><SelectTrigger id="duration-asset-scope"><SelectValue placeholder="\u4f5c\u7528\u57df" /></SelectTrigger><SelectContent><SelectItem value="all">\u5168\u90e8\u4f5c\u7528\u57df</SelectItem><SelectItem value="project">\u9879\u76ee</SelectItem><SelectItem value="company">\u516c\u53f8</SelectItem><SelectItem value="industry">\u884c\u4e1a</SelectItem><SelectItem value="global">\u5168\u5c40</SelectItem></SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-status">\u72b6\u6001</label><Select value={filters.status ?? 'all'} onValueChange={(value) => updateFilter('status', value === 'all' ? undefined : value as DurationAssetReviewStatus)}><SelectTrigger id="duration-asset-status"><SelectValue placeholder="\u72b6\u6001" /></SelectTrigger><SelectContent><SelectItem value="all">\u5168\u90e8\u72b6\u6001</SelectItem><SelectItem value="open">\u5f85\u5ba1\u6838</SelectItem><SelectItem value="approved">\u5df2\u6279\u51c6</SelectItem><SelectItem value="rejected">\u5df2\u9a73\u56de</SelectItem><SelectItem value="superseded">\u5df2\u66ff\u4ee3</SelectItem></SelectContent></Select></div>
        <div><label className="sr-only" htmlFor="duration-asset-age">\u65f6\u95f4\u8303\u56f4</label><Select value={filters.age ?? 'all'} onValueChange={(value) => updateFilter('age', value as DurationAssetReviewFilters['age'])}><SelectTrigger id="duration-asset-age"><SelectValue placeholder="\u65f6\u95f4\u8303\u56f4" /></SelectTrigger><SelectContent><SelectItem value="all">\u5168\u90e8\u65f6\u95f4</SelectItem><SelectItem value="24h">24 \u5c0f\u65f6</SelectItem><SelectItem value="7d">7 \u5929</SelectItem><SelectItem value="30d">30 \u5929</SelectItem></SelectContent></Select></div>
        <Input aria-label="\u9879\u76ee\u7b5b\u9009" value={filters.projectId ?? ''} onChange={(event) => updateFilter('projectId', event.target.value)} placeholder="\u9879\u76ee ID" />
        <Input aria-label="\u539f\u56e0\u7b5b\u9009" value={filters.reason ?? ''} onChange={(event) => updateFilter('reason', event.target.value)} placeholder="\u539f\u56e0\u4ee3\u7801" />
      </div>
      {loadState !== 'ready' ? <StateNotice state={loadState} onRetry={() => void load()} /> : null}
      {loadState === 'ready' || loadState === 'stale' ? <div data-testid="duration-assets-table-overflow" className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[1040px]"><TableHeader className="sticky top-0 bg-slate-50"><TableRow><TableHead>\u8d44\u4ea7</TableHead><TableHead>\u4f5c\u7528\u57df</TableHead><TableHead>\u539f\u56e0</TableHead><TableHead>\u72b6\u6001</TableHead><TableHead>\u51b3\u7b56</TableHead><TableHead className="text-right">\u64cd\u4f5c</TableHead></TableRow></TableHeader><TableBody>{queueItems.map((item) => <TableRow key={item.id} className="odd:bg-slate-50/50 hover:bg-slate-50"><TableCell><p className="font-medium text-slate-900">{item.assetKey}</p><p className="text-xs text-slate-500">{item.artifactKey}</p></TableCell><TableCell><Badge variant={item.canReview ? 'outline' : 'secondary'}>{scopeLabel(item)}</Badge></TableCell><TableCell className="max-w-56 text-xs text-slate-600">{item.reasonCodes.join(', ') || '-'}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell className="text-xs text-slate-600">{item.decisionReason ?? '-'}</TableCell><TableCell><div className="flex justify-end gap-2">{item.canReview && item.status === 'open' ? <><Button size="sm" disabled={commandDisabled || !item.approvalReady} onClick={() => setDecision({ item, type: 'approve' })}>\u6279\u51c6</Button><Button size="sm" variant="outline" disabled={commandDisabled} onClick={() => setDecision({ item, type: 'reject' })}>\u9a73\u56de</Button><Button size="sm" variant="outline" disabled={commandDisabled} onClick={() => setDecision({ item, type: 'supersede' })}>\u66ff\u4ee3</Button></> : <span className="text-xs text-slate-500">\u4ec5\u8bfb</span>}</div></TableCell></TableRow>)}</TableBody></Table></div> : null}
    </>
  ), [commandDisabled, filters, load, loadState, queueItems])

  return (
    <div className="page-shell mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm text-slate-500"><DatabaseZap className="h-4 w-4 text-blue-600" />\u516c\u53f8\u7ba1\u7406</div><h1 className="mt-2 text-2xl font-semibold text-slate-950">\u5de5\u671f\u8d44\u4ea7\u6cbb\u7406</h1><p className="mt-1 text-sm text-slate-600">\u540e\u7aef\u5df2\u6cbb\u7406\u5de5\u671f\u8d44\u4ea7\u7684\u961f\u5217\u3001\u53d1\u5e03\u3001\u76d1\u63a7\u4e0e\u51c6\u786e\u5ea6\u8bfb\u6a21\u578b\u3002</p></div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loadState === 'loading'}><RefreshCw className="h-4 w-4" />\u5237\u65b0</Button>
      </header>
      <div data-testid="rule-asset-action-readiness" data-state={loadState}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="\u5de5\u671f\u8d44\u4ea7\u89c6\u56fe" className="max-w-full overflow-x-auto"><TabsTrigger value="queue">{TAB_LABELS.queue}</TabsTrigger><TabsTrigger value="published">{TAB_LABELS.published}</TabsTrigger><TabsTrigger value="monitoring">{TAB_LABELS.monitoring}</TabsTrigger><TabsTrigger value="accuracy">{TAB_LABELS.accuracy}</TabsTrigger></TabsList>
        <TabsContent value="queue">{queueContent}</TabsContent>
        <TabsContent value="published"><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>\u53d1\u5e03\u952e</TableHead><TableHead>\u8d44\u4ea7</TableHead><TableHead>\u9636\u6bb5</TableHead><TableHead>\u76d1\u63a7</TableHead></TableRow></TableHeader><TableBody>{published.length ? published.map((item) => <TableRow key={item.publicationKey}><TableCell>{item.publicationKey}</TableCell><TableCell>{item.assetKey}</TableCell><TableCell><Badge variant="outline">{item.publicationStage}</Badge></TableCell><TableCell><Badge variant={statusVariant(item.monitoringStatus)}>{item.monitoringStatus}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">\u6682\u65e0\u540e\u7aef\u53d1\u5e03\u8bb0\u5f55\u3002</TableCell></TableRow>}</TableBody></Table></div></TabsContent>
        <TabsContent value="monitoring"><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>\u89c2\u6d4b</TableHead><TableHead>\u8d44\u4ea7</TableHead><TableHead>\u6d88\u8d39\u7aef</TableHead><TableHead>\u72b6\u6001</TableHead></TableRow></TableHeader><TableBody>{observations.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'publicationKey')}</TableCell><TableCell>{readString(item, 'assetKey')}</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'observationStatus')}</TableCell></TableRow>)}{runtimeCalls.map((item, index) => <TableRow key={readString(item, 'id') + index}><TableCell>{readString(item, 'runtimeEntryRef')}</TableCell><TableCell>-</TableCell><TableCell>{readString(item, 'consumerKey')}</TableCell><TableCell>{readString(item, 'callStatus')}</TableCell></TableRow>)}{!observations.length && !runtimeCalls.length ? <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">\u6682\u65e0\u540e\u7aef\u76d1\u63a7\u8bb0\u5f55\u3002</TableCell></TableRow> : null}</TableBody></Table></div></TabsContent>
        <TabsContent value="accuracy"><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>\u5f15\u64ce</TableHead><TableHead>\u6837\u672c\u6570</TableHead><TableHead>\u72b6\u6001</TableHead><TableHead>\u6307\u6807\u57fa\u7840</TableHead></TableRow></TableHeader><TableBody>{metrics.length ? metrics.map((item) => <TableRow key={item.engineCode}><TableCell>{item.engineCode}</TableCell><TableCell className="tabular-nums">{item.sampleCount}</TableCell><TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell><TableCell>{readString(item, 'metricBasis')}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-10 text-center text-slate-500">\u6682\u65e0\u540e\u7aef\u51c6\u786e\u5ea6\u8bfb\u6a21\u578b\u3002</TableCell></TableRow>}</TableBody></Table></div></TabsContent>
      </Tabs>
      </div>
      <ConfirmActionDialog open={Boolean(decision)} onOpenChange={(open) => !open && !decisionLoading && setDecision(null)} title={decision ? `${DECISION_LABELS[decision.type]}\u5de5\u671f\u8d44\u4ea7` : ''} description="\u8be5\u51b3\u7b56\u4f1a\u901a\u8fc7\u53d7\u63a7\u6cbb\u7406\u5199\u5165\u8005\u63d0\u4ea4\u3002" confirmLabel={decision ? `\u786e\u8ba4${DECISION_LABELS[decision.type]}` : '\u786e\u8ba4'} confirmTone={decision?.type === 'reject' ? 'destructive' : 'default'} testId="duration-assets-decision-dialog" loading={decisionLoading} onConfirm={() => void submitDecision()} />
    </div>
  )
}
