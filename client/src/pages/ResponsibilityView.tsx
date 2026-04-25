import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCheck,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentProject } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { apiGet, apiPost, getApiErrorMessage, isAbortError } from '@/lib/apiClient'

type ResponsibilityDimension = 'person' | 'unit'
type ResponsibilityStateLevel = 'healthy' | 'abnormal' | 'recovered'
type ResponsibilityWatchStatus = 'active' | 'suggested_to_clear' | 'cleared' | null

interface ResponsibilityTaskDetail {
  id: string
  title: string
  assignee: string
  assignee_user_id?: string | null
  unit: string
  participant_unit_id?: string | null
  completed: boolean
  status_label: string
  planned_end_date?: string | null
  actual_end_date?: string | null
  is_delayed: boolean
  is_critical: boolean
  is_milestone: boolean
}

interface ResponsibilitySubjectInsightRow {
  key: string
  label: string
  dimension: ResponsibilityDimension
  subject_user_id?: string | null
  subject_unit_id?: string | null
  primary_unit_key?: string | null
  primary_unit_label?: string | null
  total_tasks: number
  completed_count: number
  on_time_count: number
  delayed_count: number
  active_delayed_count: number
  current_in_hand_count: number
  open_risk_count: number
  open_obstacle_count: number
  risk_pressure: number
  key_commitment_gap_count: number
  on_time_rate: number
  current_week_completed_count: number
  current_week_on_time_rate: number
  previous_week_completed_count: number
  previous_week_on_time_rate: number
  trend_delta: number
  trend_direction: 'up' | 'down' | 'flat'
  alert_reasons: string[]
  state_level: ResponsibilityStateLevel
  watch_status: ResponsibilityWatchStatus
  watch_id?: string | null
  alert_state_id?: string | null
  last_message_id?: string | null
  suggest_recovery_confirmation: boolean
  tasks: ResponsibilityTaskDetail[]
}

interface ResponsibilityWatchlist {
  id: string
  project_id: string
  dimension: ResponsibilityDimension
  subject_key: string
  subject_label: string
  subject_user_id?: string | null
  subject_unit_id?: string | null
  status: 'active' | 'suggested_to_clear' | 'cleared'
  created_at: string
  updated_at: string
}

interface ResponsibilityInsightsResponse {
  project_id: string
  generated_at: string
  person_rows: ResponsibilitySubjectInsightRow[]
  unit_rows: ResponsibilitySubjectInsightRow[]
  watchlist: ResponsibilityWatchlist[]
}

function normalizeDimension(value: string | null): ResponsibilityDimension {
  return value === 'unit' ? 'unit' : 'person'
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function formatDate(value?: string | null) {
  if (!value) return '未设置'
  return value.slice(0, 10)
}

function buildLinkedOptions(rows: ResponsibilitySubjectInsightRow[], dimension: ResponsibilityDimension) {
  const values = new Map<string, string>()

  for (const row of rows) {
    if (dimension === 'person') {
      if (row.primary_unit_label) {
        values.set(row.primary_unit_label, row.primary_unit_label)
      }
      for (const task of row.tasks) {
        if (task.unit) {
          values.set(task.unit, task.unit)
        }
      }
      continue
    }

    for (const task of row.tasks) {
      if (task.assignee) {
        values.set(task.assignee, task.assignee)
      }
    }
  }

  return Array.from(values.values()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

function matchesLinkedFilter(
  row: ResponsibilitySubjectInsightRow,
  dimension: ResponsibilityDimension,
  linkedFilter: string,
) {
  if (linkedFilter === 'all') return true

  if (dimension === 'person') {
    return row.primary_unit_label === linkedFilter || row.tasks.some((task) => task.unit === linkedFilter)
  }

  return row.tasks.some((task) => task.assignee === linkedFilter)
}

function stateBadgeVariant(state: ResponsibilityStateLevel) {
  if (state === 'abnormal') return 'destructive' as const
  if (state === 'recovered') return 'outline' as const
  return 'secondary' as const
}

function stateLabel(state: ResponsibilityStateLevel) {
  if (state === 'abnormal') return '异常'
  if (state === 'recovered') return '恢复观察'
  return '健康'
}

function watchLabel(status: ResponsibilityWatchStatus) {
  if (status === 'active') return '关注中'
  if (status === 'suggested_to_clear') return '待确认恢复'
  if (status === 'cleared') return '已清理'
  return '未关注'
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string | number
  hint?: string
  icon: React.ReactNode
}) {
  void hint

  return (
    <Card variant="metric">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">{title}</span>
          <span className="text-slate-400">{icon}</span>
        </div>
        <div className="text-3xl font-semibold text-slate-900">{value}</div>
      </CardContent>
    </Card>
  )
}

export default function ResponsibilityView() {
  const { id: projectId } = useParams<{ id: string }>()
  const currentProject = useCurrentProject()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const dimension = normalizeDimension(searchParams.get('dimension'))
  const [query, setQuery] = useState('')
  const [linkedFilter, setLinkedFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<ResponsibilityInsightsResponse | null>(null)
  const deferredQuery = useDeferredValue(query)

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    try {
      setLoading(true)
      setLoadError(null)
      const response = await apiGet<ResponsibilityInsightsResponse>(
        `/api/projects/${projectId}/responsibility`,
        { signal },
      )
      if (!signal?.aborted) {
        setData(response)
      }
    } catch (error) {
      if (isAbortError(error)) return

      const message = getApiErrorMessage(error, '无法加载责任主体分析')
      setLoadError(message)
      setData(null)
      toast({
        title: '加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [projectId, toast])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  useEffect(() => {
    setLinkedFilter('all')
  }, [dimension])

  const activeRows = dimension === 'unit' ? data?.unit_rows ?? [] : data?.person_rows ?? []

  const linkedOptions = useMemo(
    () => buildLinkedOptions(activeRows, dimension),
    [activeRows, dimension],
  )

  const filteredRows = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
    return activeRows.filter((row) => {
      const matchesKeyword = !keyword || [
        row.label,
        row.primary_unit_label ?? '',
        ...row.tasks.flatMap((task) => [task.title, task.assignee, task.unit]),
      ].some((item) => item.toLowerCase().includes(keyword))

      return matchesKeyword && matchesLinkedFilter(row, dimension, linkedFilter)
    })
  }, [activeRows, deferredQuery, dimension, linkedFilter])

  const summary = useMemo(() => {
    const rows = filteredRows
    return {
      total: rows.length,
      abnormal: rows.filter((row) => row.state_level === 'abnormal').length,
      watched: rows.filter((row) => row.watch_status === 'active').length,
      recoveryPending: rows.filter((row) => row.suggest_recovery_confirmation).length,
    }
  }, [filteredRows])

  const handleDimensionChange = useCallback((next: ResponsibilityDimension) => {
    startTransition(() => {
      setSearchParams((previous) => {
        const nextParams = new URLSearchParams(previous)
        nextParams.set('dimension', next)
        return nextParams
      }, { replace: true })
    })
  }, [setSearchParams])

  const handleWatchAction = useCallback(async (row: ResponsibilitySubjectInsightRow) => {
    if (!projectId) return

    const actionId = `${row.dimension}:${row.key}`
    setActionKey(actionId)

    try {
      if (row.suggest_recovery_confirmation) {
        await apiPost(`/api/projects/${projectId}/responsibility/watchlist/confirm-recovery`, {
          dimension: row.dimension,
          subject_key: row.key,
        })
        toast({
          title: '已确认恢复',
          description: `${row.label} 已完成恢复确认并从待确认列表中移除。`,
        })
      } else if (row.watch_status === 'active') {
        await apiPost(`/api/projects/${projectId}/responsibility/watchlist/clear`, {
          dimension: row.dimension,
          subject_key: row.key,
        })
        toast({
          title: '已移出关注',
          description: `${row.label} 已从责任主体关注名单中移除。`,
        })
      } else {
        await apiPost(`/api/projects/${projectId}/responsibility/watchlist`, {
          dimension: row.dimension,
          subject_key: row.key,
          subject_label: row.label,
          subject_user_id: row.subject_user_id ?? null,
          subject_unit_id: row.subject_unit_id ?? null,
        })
        toast({
          title: '已加入关注',
          description: `${row.label} 已加入责任主体关注名单。`,
        })
      }

      await loadData()
    } catch (error) {
      const message = getApiErrorMessage(error, '无法更新关注状态')
      toast({
        title: '操作失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setActionKey(null)
    }
  }, [loadData, projectId, toast])

  if (!projectId) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <EmptyState
          icon={Users}
          title="未找到当前项目"
        />
      </div>
    )
  }

  return (
    <div data-testid="responsibility-page" className="container mx-auto space-y-6 px-4 py-8 page-enter">
      <Breadcrumb
        items={[
          { label: '公司驾驶舱', href: '/company' },
          { label: currentProject?.name || '项目', href: `/projects/${projectId}/dashboard` },
          { label: '任务管理', href: `/projects/${projectId}/gantt` },
          { label: '责任主体' },
        ]}
      />

      <PageHeader
        eyebrow="责任主体"
        title="任务管理 / 责任主体"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/task-summary`)}
        >
          返回任务总结
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void loadData()}
          loading={loading}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          刷新
        </Button>
      </PageHeader>

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {summary.abnormal > 0 && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title={dimension === 'person' ? '责任人对象数' : '责任单位对象数'}
          value={summary.total}
          icon={dimension === 'person' ? <Users className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
        />
        <MetricCard
          title="异常主体"
          value={summary.abnormal}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <MetricCard
          title="关注名单"
          value={summary.watched}
          hint={`${data?.watchlist.filter((item) => item.status === 'active').length ?? 0} 条`}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <MetricCard
          title="待确认恢复"
          value={summary.recoveryPending}
          icon={<CheckCheck className="h-5 w-5" />}
        />
      </div>

      <Card variant="detail">
        <CardContent className="grid gap-4 pt-6 lg:grid-cols-[auto,1fr,260px]">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dimension === 'person' ? 'default' : 'outline'}
              onClick={() => handleDimensionChange('person')}
            >
              责任人维度
            </Button>
            <Button
              variant={dimension === 'unit' ? 'default' : 'outline'}
              onClick={() => handleDimensionChange('unit')}
            >
              责任单位维度
            </Button>
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dimension === 'person' ? '搜索责任人、任务或责任单位' : '搜索责任单位、任务或责任人'}
            aria-label="责任主体搜索"
          />

          <Select value={linkedFilter} onValueChange={setLinkedFilter}>
            <SelectTrigger aria-label="交叉筛选">
              <SelectValue placeholder={dimension === 'person' ? '按责任单位筛选' : '按责任人筛选'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dimension === 'person' ? '全部责任单位' : '全部责任人'}</SelectItem>
              {linkedOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState
          label="责任主体分析加载中"
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="暂无匹配的责任主体"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery('')
                setLinkedFilter('all')
              }}
            >
              清空筛选
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const rowActionKey = `${row.dimension}:${row.key}`
            return (
              <Card key={rowActionKey} variant="detail" data-testid="responsibility-row">
                <CardHeader className="gap-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg text-slate-900">{row.label}</CardTitle>
                        <Badge variant={stateBadgeVariant(row.state_level)}>{stateLabel(row.state_level)}</Badge>
                        {row.watch_status && row.watch_status !== 'cleared' && (
                          <Badge variant="secondary">{watchLabel(row.watch_status)}</Badge>
                        )}
                      </div>
                      <p className="text-sm leading-6 text-slate-500">
                        {dimension === 'person'
                          ? `主责单位：${row.primary_unit_label ?? '未识别'}`
                          : `风险压力 ${row.risk_pressure} · 重点承诺缺口 ${row.key_commitment_gap_count}`}
                      </p>
                      {row.alert_reasons.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {row.alert_reasons.map((reason) => (
                            <Badge key={reason} variant="outline" className="text-xs">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleWatchAction(row)}
                        loading={actionKey === rowActionKey}
                      >
                        {row.suggest_recovery_confirmation
                          ? '确认恢复'
                          : row.watch_status === 'active'
                            ? '移出关注'
                            : '加入关注'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/projects/${projectId}/gantt?highlight=${encodeURIComponent(row.tasks[0]?.id ?? '')}`)}
                        disabled={row.tasks.length === 0}
                      >
                        查看任务
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">总任务</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{row.total_tasks}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">按时完成率</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{formatPercent(row.on_time_rate)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">在手任务</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{row.current_in_hand_count}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">活跃延期</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{row.active_delayed_count}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">风险/障碍</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">
                        {row.open_risk_count}/{row.open_obstacle_count}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="text-xs text-slate-500">本周按时率</div>
                      <div className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900">
                        {formatPercent(row.current_week_on_time_rate)}
                        <span className="text-xs font-medium text-slate-500">
                          {row.trend_delta > 0 ? '+' : ''}
                          {row.trend_delta}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">关联任务</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {row.tasks.slice(0, 6).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                          onClick={() => navigate(`/projects/${projectId}/gantt?highlight=${encodeURIComponent(task.id)}`)}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="truncate text-sm font-medium text-slate-900">{task.title}</div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{task.assignee}</span>
                              <span>{task.unit}</span>
                              <span>{task.status_label}</span>
                              <span>计划完成 {formatDate(task.planned_end_date)}</span>
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </div>
                    {row.tasks.length > 6 && (
                      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                        还有 {row.tasks.length - 6} 项任务未展开，可进入任务台账继续查看。
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
