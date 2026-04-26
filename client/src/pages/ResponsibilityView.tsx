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
  BarChart3,
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
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentProject } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  ParticipantUnitsDialog,
  type ParticipantUnitDraft,
  type ParticipantUnitRecord,
} from '@/pages/GanttView/ParticipantUnitsDialog'

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

interface ResponsibilityTrendPoint {
  date: string
  completion_rate: number
  delay_rate: number
  completed_count: number
  delayed_count: number
  active_count: number
}

interface ResponsibilityTrendSeries {
  key: string
  label: string
  dimension: ResponsibilityDimension
  subject_user_id?: string | null
  subject_unit_id?: string | null
  total_tasks: number
  latest_completion_rate: number
  latest_delay_rate: number
  points: ResponsibilityTrendPoint[]
}

interface ResponsibilityTrendsResponse {
  project_id: string
  generated_at: string
  group_by: ResponsibilityDimension
  days: number
  dates: string[]
  series: ResponsibilityTrendSeries[]
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

function sortParticipantUnits(units: ParticipantUnitRecord[]) {
  return [...units].sort((left, right) => left.unit_name.localeCompare(right.unit_name, 'zh-Hans-CN'))
}

function createEmptyParticipantUnitDraft(projectId: string): ParticipantUnitDraft {
  return {
    id: null,
    project_id: projectId,
    unit_name: '',
    unit_type: '',
    contact_name: '',
    contact_role: '',
    contact_phone: '',
    contact_email: '',
    version: null,
  }
}

function toParticipantUnitDraft(unit: ParticipantUnitRecord, projectId: string): ParticipantUnitDraft {
  return {
    id: unit.id,
    project_id: projectId,
    unit_name: unit.unit_name,
    unit_type: unit.unit_type,
    contact_name: unit.contact_name ?? '',
    contact_role: unit.contact_role ?? '',
    contact_phone: unit.contact_phone ?? '',
    contact_email: unit.contact_email ?? '',
    version: unit.version ?? null,
  }
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

function TrendSeriesCard({
  row,
}: {
  row: ResponsibilityTrendSeries
}) {
  const sparkPoints = row.points.slice(-10)
  const lastPoint = row.points[row.points.length - 1]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{row.label}</div>
          <div className="mt-1 text-xs text-slate-500">
            总任务 {row.total_tasks} · 最新按时率 {formatPercent(row.latest_completion_rate)} · 最新逾期率 {formatPercent(row.latest_delay_rate)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            按时率 {formatPercent(row.latest_completion_rate)}
          </span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            逾期率 {formatPercent(row.latest_delay_rate)}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3">
        <div className="flex h-16 items-end gap-1">
          {sparkPoints.map((point) => (
            <div key={point.date} className="flex flex-1 items-end justify-center gap-0.5">
              <div
                className="w-1 rounded-t bg-blue-500/80"
                style={{ height: `${Math.max(6, point.completion_rate * 0.55)}px` }}
                title={`${point.date} 按时率 ${point.completion_rate}%`}
              />
              <div
                className="w-1 rounded-t bg-emerald-500/80"
                style={{ height: `${Math.max(6, point.delay_rate * 0.55)}px` }}
                title={`${point.date} 逾期率 ${point.delay_rate}%`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>{sparkPoints[0]?.date?.slice(5) || '--'}</span>
          <span>{sparkPoints[sparkPoints.length - 1]?.date?.slice(5) || '--'}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">完成</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastPoint?.completed_count ?? 0}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">逾期</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastPoint?.delayed_count ?? 0}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-slate-500">在手</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lastPoint?.active_count ?? row.total_tasks}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResponsibilityView() {
  const { id: projectId } = useParams<{ id: string }>()
  const currentProject = useCurrentProject()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const { canEdit } = usePermissions({ projectId: currentProject?.id ?? projectId })

  const dimension = normalizeDimension(searchParams.get('dimension'))
  const [query, setQuery] = useState('')
  const [linkedFilter, setLinkedFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<ResponsibilityInsightsResponse | null>(null)
  const [participantUnitsOpen, setParticipantUnitsOpen] = useState(false)
  const [participantUnits, setParticipantUnits] = useState<ParticipantUnitRecord[]>([])
  const [participantUnitsLoading, setParticipantUnitsLoading] = useState(false)
  const [participantUnitsLoaded, setParticipantUnitsLoaded] = useState(false)
  const [participantUnitSaving, setParticipantUnitSaving] = useState(false)
  const [participantUnitDraft, setParticipantUnitDraft] = useState<ParticipantUnitDraft>(
    createEmptyParticipantUnitDraft(projectId ?? ''),
  )
  const [trendData, setTrendData] = useState<ResponsibilityTrendsResponse | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<'monitoring' | 'analysis'>('monitoring')
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

  const loadParticipantUnits = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setParticipantUnits([])
      setParticipantUnitsLoaded(false)
      return
    }

    setParticipantUnitsLoading(true)
    try {
      const response = await apiGet<ParticipantUnitRecord[]>(
        `/api/participant-units?projectId=${encodeURIComponent(projectId)}`,
        signal ? { signal } : undefined,
      )
      if (!signal?.aborted) {
        setParticipantUnits(sortParticipantUnits(response ?? []))
        setParticipantUnitsLoaded(true)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载参建单位台账失败', error)
      }
      setParticipantUnitsLoaded(true)
    } finally {
      if (!signal?.aborted) {
        setParticipantUnitsLoading(false)
      }
    }
  }, [projectId])

  const loadTrendData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) {
      setTrendData(null)
      return
    }

    setTrendLoading(true)
    setTrendError(null)

    try {
      const response = await apiGet<ResponsibilityTrendsResponse>(
        `/api/projects/${projectId}/responsibility/trends?days=30&groupBy=${dimension}`,
        signal ? { signal } : undefined,
      )
      if (!signal?.aborted) {
        setTrendData(response ?? null)
      }
    } catch (error) {
      if (isAbortError(error)) return

      const message = getApiErrorMessage(error, '无法加载责任主体趋势')
      setTrendError(message)
      setTrendData(null)
      toast({
        title: '趋势加载失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      if (!signal?.aborted) {
        setTrendLoading(false)
      }
    }
  }, [dimension, projectId, toast])

  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  useEffect(() => {
    if (!participantUnitsOpen) return
    if (participantUnitsLoaded || participantUnitsLoading) return

    const controller = new AbortController()
    void loadParticipantUnits(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadParticipantUnits, participantUnitsLoaded, participantUnitsLoading, participantUnitsOpen])

  useEffect(() => {
    const controller = new AbortController()
    void loadTrendData(controller.signal)
    return () => {
      controller.abort()
    }
  }, [loadTrendData])

  useEffect(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId ?? ''))
    setParticipantUnitsLoaded(false)
  }, [projectId])

  useEffect(() => {
    setLinkedFilter('all')
    setActivePanel('monitoring')
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

  const trendSeries = trendData?.series ?? []
  const trendSummary = useMemo(() => {
    if (trendSeries.length === 0) {
      return {
        seriesCount: 0,
        avgCompletionRate: 0,
        avgDelayRate: 0,
        latestLabel: '暂无',
      }
    }

    const avgCompletionRate = Math.round(
      trendSeries.reduce((sum, item) => sum + item.latest_completion_rate, 0) / trendSeries.length,
    )
    const avgDelayRate = Math.round(
      trendSeries.reduce((sum, item) => sum + item.latest_delay_rate, 0) / trendSeries.length,
    )

    return {
      seriesCount: trendSeries.length,
      avgCompletionRate,
      avgDelayRate,
      latestLabel: trendData?.generated_at ? new Date(trendData.generated_at).toLocaleDateString('zh-CN') : '最新',
    }
  }, [trendData, trendSeries])

  const handleParticipantUnitsDialogOpenChange = useCallback((open: boolean) => {
    setParticipantUnitsOpen(open)
    if (!open) {
      setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId ?? ''))
    }
  }, [projectId])

  const handleOpenParticipantUnitsDialog = useCallback(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId ?? ''))
    setParticipantUnitsOpen(true)
  }, [projectId])

  const handleParticipantUnitCreateNew = useCallback(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId ?? ''))
  }, [projectId])

  const handleParticipantUnitEdit = useCallback((unit: ParticipantUnitRecord) => {
    setParticipantUnitDraft(toParticipantUnitDraft(unit, projectId ?? ''))
  }, [projectId])

  const handleDimensionChange = useCallback((next: ResponsibilityDimension) => {
    startTransition(() => {
      setSearchParams((previous) => {
        const nextParams = new URLSearchParams(previous)
        nextParams.set('dimension', next)
        return nextParams
      }, { replace: true })
    })
  }, [setSearchParams])

  const handleParticipantUnitSubmit = useCallback(async () => {
    if (!projectId || !canEdit) return

    const payload = {
      project_id: projectId,
      unit_name: participantUnitDraft.unit_name.trim(),
      unit_type: participantUnitDraft.unit_type.trim(),
      contact_name: participantUnitDraft.contact_name.trim() || null,
      contact_role: participantUnitDraft.contact_role.trim() || null,
      contact_phone: participantUnitDraft.contact_phone.trim() || null,
      contact_email: participantUnitDraft.contact_email.trim() || null,
    }

    if (!payload.unit_name || !payload.unit_type) {
      toast({ title: '请先补全单位名称和单位类型', variant: 'destructive' })
      return
    }

    setParticipantUnitSaving(true)
    try {
      if (participantUnitDraft.id) {
        const updated = await apiPut<ParticipantUnitRecord>(`/api/participant-units/${participantUnitDraft.id}`, {
          ...payload,
          version: participantUnitDraft.version ?? 1,
        })
        setParticipantUnits((previous) => sortParticipantUnits(
          previous.map((unit) => (unit.id === updated.id ? updated : unit)),
        ))
        toast({ title: '参建单位已更新', description: updated.unit_name })
      } else {
        const created = await apiPost<ParticipantUnitRecord>('/api/participant-units', payload)
        setParticipantUnits((previous) => sortParticipantUnits([...previous, created]))
        toast({ title: '参建单位已创建', description: created.unit_name })
      }

      setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId))
      await loadParticipantUnits()
      await loadData()
    } catch (error) {
      toast({
        title: '参建单位保存失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [canEdit, loadData, loadParticipantUnits, participantUnitDraft, projectId, toast])

  const handleParticipantUnitDelete = useCallback(async (unit: ParticipantUnitRecord) => {
    if (!canEdit) return
    setParticipantUnitSaving(true)
    try {
      await apiDelete(`/api/participant-units/${unit.id}`)
      setParticipantUnits((previous) => previous.filter((item) => item.id !== unit.id))
      setParticipantUnitDraft((current) => (current.id === unit.id ? createEmptyParticipantUnitDraft(projectId ?? '') : current))
      toast({ title: '参建单位已删除', description: unit.unit_name })
      await loadParticipantUnits()
      await loadData()
    } catch (error) {
      toast({
        title: '参建单位删除失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [canEdit, loadData, loadParticipantUnits, projectId, toast])

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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={dimension === 'person' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDimensionChange('person')}
          >
            责任人维度
          </Button>
          <Button
            variant={dimension === 'unit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDimensionChange('unit')}
          >
            责任单位维度
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenParticipantUnitsDialog}
          disabled={!canEdit}
        >
          参建单位管理
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

      <div className="sticky top-[88px] z-20 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <Button
          size="sm"
          variant={activePanel === 'monitoring' ? 'default' : 'ghost'}
          onClick={() => {
            setActivePanel('monitoring')
            document.getElementById('monitoring-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          监控区
        </Button>
        <Button
          size="sm"
          variant={activePanel === 'analysis' ? 'default' : 'ghost'}
          onClick={() => {
            setActivePanel('analysis')
            document.getElementById('analysis-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          分析区
        </Button>
      </div>

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

      <section id="monitoring-panel" className="space-y-4 scroll-mt-28">
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
          <CardContent className="grid gap-4 pt-6 lg:grid-cols-[1fr,260px]">
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
          <LoadingState label="责任主体分析加载中" />
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
                          disabled={!canEdit}
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
      </section>

      <section id="analysis-panel" className="space-y-4 scroll-mt-28">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">分析区</div>
          <h2 className="text-[26px] font-semibold tracking-tight text-slate-900">责任趋势洞察</h2>
        </div>

        {trendError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{trendError}</AlertDescription>
          </Alert>
        )}

        {trendLoading ? (
          <LoadingState label="责任主体趋势加载中" />
        ) : trendSeries.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="暂无趋势数据"
            description="当前责任主体还没有足够的历史快照，等任务和快照积累后会自动出现趋势洞察。"
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard title="趋势对象数" value={trendSummary.seriesCount} icon={<BarChart3 className="h-5 w-5" />} />
              <MetricCard title="平均按时率" value={`${trendSummary.avgCompletionRate}%`} icon={<CheckCheck className="h-5 w-5" />} />
              <MetricCard title="平均逾期率" value={`${trendSummary.avgDelayRate}%`} icon={<AlertTriangle className="h-5 w-5" />} />
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
              最近一次更新：{trendSummary.latestLabel} · 分组方式：{dimension === 'person' ? '责任人' : '责任单位'}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {trendSeries.slice(0, 6).map((row) => (
                <TrendSeriesCard key={row.key} row={row} />
              ))}
            </div>
          </div>
        )}
      </section>

      <ParticipantUnitsDialog
        open={participantUnitsOpen}
        onOpenChange={handleParticipantUnitsDialogOpenChange}
        loading={participantUnitsLoading}
        saving={participantUnitSaving}
        units={participantUnits}
        draft={participantUnitDraft}
        setDraft={setParticipantUnitDraft}
        onSubmit={handleParticipantUnitSubmit}
        onEdit={handleParticipantUnitEdit}
        onDelete={handleParticipantUnitDelete}
        onCreateNew={handleParticipantUnitCreateNew}
      />
    </div>
  )
}
