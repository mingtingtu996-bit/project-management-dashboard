import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import RiskTrendChart from '@/components/RiskTrendChart'
import { PageHeader } from '@/components/PageHeader'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiGet, apiPost, apiPut } from '@/lib/apiClient'
import { isActiveRisk } from '@/lib/taskBusinessStatus'
import type { Risk, TaskObstacle } from '@/lib/supabase'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

type WarningItem = {
  id: string
  task_id?: string
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  is_acknowledged?: boolean
  created_at?: string
}

type RiskItem = Risk & { version?: number }
type ProblemItem = TaskObstacle & { version?: number; is_resolved?: boolean | number | null }

const WARNING_TYPE_LABEL: Record<string, string> = {
  condition_expired: '开工条件预警',
  obstacle_timeout: '阻碍预警',
  delay_exceeded: '延期预警',
  acceptance_expired: '验收预警',
}

const WARNING_LEVEL_LABEL: Record<'info' | 'warning' | 'critical', string> = {
  info: '提示',
  warning: '关注',
  critical: '严重',
}

const WARNING_LEVEL_STYLE: Record<'info' | 'warning' | 'critical', string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  critical: 'border-red-200 bg-red-50 text-red-700',
}

const RISK_LEVEL_STYLE: Record<string, string> = {
  low: 'border-blue-200 bg-blue-50 text-blue-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border-red-200 bg-red-50 text-red-700',
}

const RISK_LEVEL_LABEL: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getWarningCategory(warning: WarningItem) {
  return WARNING_TYPE_LABEL[warning.warning_type] || '系统预警'
}

function normalizeWarningText(value: string) {
  return value
    .replace(/已逾期|今天到期|请立即处理|需立即处理|建议尽快调整计划或采取措施/g, '')
    .replace(/\d+天后到期/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function getWarningSignature(warning: WarningItem) {
  return [warning.warning_type, warning.task_id || '', normalizeWarningText(String(warning.description || ''))].join('|')
}

function readConfirmedWarningSignatures(projectId?: string) {
  if (!projectId || typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(`risk-management:confirmed-warnings:${projectId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeConfirmedWarningSignatures(projectId: string, signatures: string[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      `risk-management:confirmed-warnings:${projectId}`,
      JSON.stringify(Array.from(new Set(signatures))),
    )
  } catch {
    // Ignore storage failures in private mode or locked-down browsers.
  }
}

function getRiskSourceBadge(risk: RiskItem) {
  const riskAny = risk as Record<string, unknown>
  const isAuto = riskAny.source === 'auto' || riskAny.is_auto === true
  if (isAuto) {
    return (
      <Badge className="border-blue-200 bg-blue-50 text-blue-700">自动检测</Badge>
    )
  }
  if (riskAny.created_by) {
    return (
      <Badge className="border-green-200 bg-green-50 text-green-700">手动补录</Badge>
    )
  }
  return (
    <Badge className="border-blue-200 bg-blue-50 text-blue-700">自动来源</Badge>
  )
}

function getProblemTitle(problem: ProblemItem) {
  return String(problem.description || problem.title || '未命名问题')
}

function getProblemStatus(problem: ProblemItem) {
  const status = String(problem.status || '').trim()
  if (problem.is_resolved === true || problem.is_resolved === 1) return '已解决'
  if (status === '已解决' || status === 'resolved' || status === 'closed') return '已解决'
  if (status === '处理中' || status === 'processing' || status === 'resolving') return '处理中'
  return '待处理'
}

function isProblemActive(problem: ProblemItem) {
  return getProblemStatus(problem) !== '已解决'
}

type RiskTab = 'overview' | 'warnings' | 'risks' | 'problems'

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClass,
  badgeClass,
}: {
  label: string
  value: string | number
  hint: string
  icon: LucideIcon
  iconClass: string
  badgeClass: string
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="text-3xl font-semibold text-slate-900">{value}</div>
          <p className="text-xs text-slate-400">{hint}</p>
        </div>
        <div className={`rounded-2xl p-3 ${badgeClass}`}>
          <Icon className={`h-5 w-5 ${iconClass}`} />
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewCard({
  title,
  count,
  hint,
  icon: Icon,
  accentClass,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  count: number
  hint: string
  icon: LucideIcon
  accentClass: string
  actionLabel: string
  onAction: () => void
  children: ReactNode
}) {
  return (
    <Card className={`overflow-hidden border-slate-200 ${accentClass}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-4 w-4" />
              {title}
            </CardTitle>
            <p className="text-sm text-slate-500">{hint}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-3 py-2 text-right shadow-sm">
            <div className="text-2xl font-semibold text-slate-900">{count}</div>
            <div className="text-xs text-slate-500">条</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {children}
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

function CategoryItem({
  badge,
  title,
  description,
  footer,
  action,
}: {
  badge: ReactNode
  title: string
  description?: string
  footer?: string
  action: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">{badge}</div>
      <p className="mt-3 font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {footer ? <p className="mt-2 text-xs text-slate-400">{footer}</p> : null}
      <div className="mt-3">{action}</div>
    </div>
  )
}

function FocusRow({
  title,
  tone,
  item,
  emptyText,
  onJump,
}: {
  title: string
  tone: string
  item: { title: string; meta: string; badge: string } | null
  emptyText: string
  onJump: () => void
}) {
  return (
    <div className={`rounded-2xl border ${tone} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">优先查看当前最需要处理的一条。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onJump}>
          查看
        </Button>
      </div>
      {item ? (
        <div className="mt-3 space-y-1.5">
          <Badge variant="outline" className="w-fit">
            {item.badge}
          </Badge>
          <p className="font-medium text-slate-900">{item.title}</p>
          <p className="text-xs text-slate-500">{item.meta}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  )
}

export default function RiskManagement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const currentProject = useStore((state) => state.currentProject)

  const [loading, setLoading] = useState(false)
  const [warnings, setWarnings] = useState<WarningItem[]>([])
  const [risks, setRisks] = useState<RiskItem[]>([])
  const [problems, setProblems] = useState<ProblemItem[]>([])
  const [search, setSearch] = useState('')
  const [confirmedWarningTick, setConfirmedWarningTick] = useState(0)
  const [activeTab, setActiveTab] = useState<RiskTab>('overview')
  const [trendExpanded, setTrendExpanded] = useState(false)

  const confirmedWarningSignatures = useMemo(
    () => readConfirmedWarningSignatures(id),
    [id, confirmedWarningTick],
  )
  const confirmedWarningSet = useMemo(
    () => new Set(confirmedWarningSignatures),
    [confirmedWarningSignatures],
  )

  const refresh = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [warningList, riskList, obstacleList] = await Promise.all([
        apiGet<WarningItem[]>(`/api/warnings?projectId=${encodeURIComponent(id)}`),
        apiGet<RiskItem[]>(`/api/risks?projectId=${encodeURIComponent(id)}`),
        apiGet<ProblemItem[]>(`/api/task-obstacles?projectId=${encodeURIComponent(id)}`),
      ])

      setWarnings(Array.isArray(warningList) ? warningList : [])
      setRisks(Array.isArray(riskList) ? riskList : [])
      setProblems(Array.isArray(obstacleList) ? obstacleList : [])
    } catch (error) {
      console.error('Failed to load risk management data:', error)
      toast({
        title: '加载失败',
        description: '请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const keyword = search.trim().toLowerCase()

  const filteredWarnings = useMemo(
    () =>
      warnings.filter((item) => {
        if (item.is_acknowledged) return false
        if (item.warning_type === 'obstacle_timeout') return false
        if (confirmedWarningSet.has(getWarningSignature(item))) return false
        if (!keyword) return true
        return [item.title, item.description, getWarningCategory(item), item.warning_level]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(keyword))
      }),
    [confirmedWarningSet, keyword, warnings],
  )

  const filteredRisks = useMemo(
    () =>
      risks.filter((item) => {
        if (!keyword) return true
        return [item.title, item.description, item.level, item.status, item.category]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(keyword))
      }),
    [keyword, risks],
  )

  const filteredProblems = useMemo(
    () =>
      problems.filter((item) => {
        if (!keyword) return true
        return [getProblemTitle(item), item.status, item.severity, item.obstacle_type]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(keyword))
      }),
    [keyword, problems],
  )

  const confirmWarning = async (warning: WarningItem) => {
    const duplicateRisk = risks.some(
      (risk) => String(risk.title || '').trim() === String(warning.title || '').trim(),
    )
    if (duplicateRisk) {
      toast({
        title: '已在风险清单中',
        description: '这条预警对应的风险已存在。',
      })
      return
    }

    try {
      const created = await apiPost<RiskItem>('/api/risks', {
        project_id: id,
        title: warning.title,
        description: warning.description,
        level:
          warning.warning_level === 'critical'
            ? 'critical'
            : warning.warning_level === 'warning'
              ? 'high'
              : 'medium',
        status: 'identified',
        probability: 50,
        impact: 50,
        mitigation: undefined,
        risk_category: warning.warning_type === 'acceptance_expired' ? 'quality' : 'progress',
      })

      const signature = getWarningSignature(warning)
      const nextSignatures = [...confirmedWarningSignatures, signature]
      if (id) {
        writeConfirmedWarningSignatures(id, nextSignatures)
      }

      setConfirmedWarningTick((value) => value + 1)
      setWarnings((current) => current.filter((item) => getWarningSignature(item) !== signature))
      setRisks((current) => [created, ...current])
      toast({ title: '已确认为风险', description: '预警已纳入风险清单。' })
    } catch (error) {
      console.error('Failed to confirm warning as risk:', error)
      toast({
        title: '确认失败',
        description: '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const toggleRisk = async (risk: RiskItem) => {
    if (!risk.id || !id) return

    const nextStatus = isActiveRisk(risk) ? 'closed' : 'identified'
    try {
      const updated = await apiPut<RiskItem>(`/api/risks/${risk.id}`, {
        project_id: id,
        title: risk.title,
        description: risk.description || undefined,
        level: risk.level || 'medium',
        status: nextStatus,
        probability: risk.probability ?? 50,
        impact: risk.impact ?? 50,
        mitigation: risk.mitigation || undefined,
        risk_category: risk.category || 'other',
        task_id: risk.task_id || undefined,
        version: risk.version || 1,
      })

      setRisks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      toast({
        title: nextStatus === 'closed' ? '风险已关闭' : '风险已重新打开',
        description: '状态已更新。',
      })
    } catch (error) {
      console.error('Failed to update risk:', error)
      toast({
        title: '操作失败',
        description: '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const resolveProblem = async (problem: ProblemItem) => {
    if (!problem.id) return

    try {
      const updated = await apiPut<ProblemItem>(`/api/task-obstacles/${problem.id}`, {
        status: 'resolved',
        is_resolved: true,
        resolution: '现场已处理',
      })

      setProblems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      toast({
        title: '问题已解决',
        description: '问题记录已关闭。',
      })
    } catch (error) {
      console.error('Failed to resolve problem:', error)
      toast({
        title: '操作失败',
        description: '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const warningCount = filteredWarnings.length
  const riskCount = filteredRisks.filter((risk) => isActiveRisk(risk)).length
  const problemCount = filteredProblems.length
  const totalAttentionCount = warningCount + riskCount + problemCount

  // 最近7天新增统计（用于统计卡上下文副文案）
  const sevenDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.getTime()
  }, [])

  const recentWarnings = useMemo(
    () => filteredWarnings.filter((w) => w.created_at && new Date(w.created_at).getTime() >= sevenDaysAgo).length,
    [filteredWarnings, sevenDaysAgo],
  )
  const recentRisks = useMemo(
    () => filteredRisks.filter((r) => isActiveRisk(r) && (r as { created_at?: string }).created_at && new Date((r as { created_at?: string }).created_at!).getTime() >= sevenDaysAgo).length,
    [filteredRisks, sevenDaysAgo],
  )
  const recentProblems = useMemo(
    () => filteredProblems.filter((p) => (p as { created_at?: string }).created_at && new Date((p as { created_at?: string }).created_at!).getTime() >= sevenDaysAgo).length,
    [filteredProblems, sevenDaysAgo],
  )

  const topWarning = filteredWarnings[0]
  const topRisk = filteredRisks.find((risk) => isActiveRisk(risk))
  const topProblem = filteredProblems[0]
  const currentProjectName = currentProject?.name || '当前项目'

  const categoryTabs: Array<{ value: RiskTab; label: string; count: number }> = [
    { value: 'overview', label: '总览', count: totalAttentionCount },
    { value: 'warnings', label: '预警', count: warningCount },
    { value: 'risks', label: '风险', count: riskCount },
    { value: 'problems', label: '问题', count: problemCount },
  ]

  if (!id && loading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6 p-6">
      <div className="max-w-[1600px] space-y-6">
        <PageHeader
          eyebrow="项目级主模块"
          title="风险与问题"
          subtitle={`${currentProjectName} 的问题与风险、预警统一在这里承接。这里只做轻流程展示和处置，不改动主链口径。`}
        >
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/reports?view=risk`)} disabled={!id}>
            <BarChart3 className="mr-2 h-4 w-4" />
            风险分析
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/dashboard`)} disabled={!id}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            项目 Dashboard
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/notifications')}>
            去提醒中心
          </Button>
        </PageHeader>

        {!id && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>缺少项目上下文，当前无法加载问题与风险视图。</AlertDescription>
          </Alert>
        )}

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">筛选</p>
              <p className="text-xs text-slate-500">搜索标题、描述、状态，快速收拢当前项目的风险与问题。</p>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题、描述、状态"
              className="w-full lg:w-[320px]"
            />
          </CardContent>
        </Card>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="预警"
            value={warningCount}
            hint={warningCount > 0 ? (recentWarnings > 0 ? `最近7天新增 ${recentWarnings} 条` : `${warningCount} 条待处理`) : '当前无活跃预警'}
            icon={Bell}
            iconClass="text-blue-700"
            badgeClass="bg-blue-50"
          />
          <MetricCard
            label="风险"
            value={riskCount}
            hint={riskCount > 0 ? (recentRisks > 0 ? `最近7天新增 ${recentRisks} 项` : `${riskCount} 项活跃风险`) : '当前无进行中风险'}
            icon={ShieldAlert}
            iconClass="text-rose-700"
            badgeClass="bg-rose-50"
          />
          <MetricCard
            label="问题"
            value={problemCount}
            hint={problemCount > 0 ? (recentProblems > 0 ? `最近7天新增 ${recentProblems} 项` : `${problemCount} 项待处理`) : '当前无待处理问题'}
            icon={XCircle}
            iconClass="text-orange-700"
            badgeClass="bg-orange-50"
          />
          <MetricCard
            label="总关注"
            value={totalAttentionCount}
            hint={totalAttentionCount > 0 ? `合计 ${totalAttentionCount} 项 · 近7天+${recentWarnings + recentRisks + recentProblems}` : '当前无需关注事项'}
            icon={AlertTriangle}
            iconClass="text-slate-700"
            badgeClass="bg-slate-100"
          />
        </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RiskTab)} className="space-y-6">
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg text-slate-900">风险主视图</CardTitle>
                    <p className="text-sm text-slate-500">
                      先看预警，再看风险，最后看已经发生的问题。统计、筛选和列表都在同一主模块里收口。
                    </p>
                  </div>
                  <TabsList className="grid h-auto grid-cols-4 gap-1 bg-slate-100 p-1">
                    {categoryTabs.map((tab) => (
                      <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col gap-0.5 px-3 py-2">
                        <span>{tab.label}</span>
                        <span className="text-xs text-slate-400">{tab.count}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <OverviewCard
                      title="预警"
                      count={warningCount}
                      hint="系统预警与轻流程入口"
                      icon={Bell}
                      accentClass="bg-gradient-to-br from-blue-50 to-slate-50"
                      actionLabel="查看预警"
                      onAction={() => setActiveTab('warnings')}
                    >
                      {filteredWarnings.length === 0 ? (
                        <EmptyState
                          icon={Bell}
                          title="暂无预警"
                          description="当前没有需要额外关注的系统预警。"
                          className="py-8"
                        />
                      ) : (
                        <div className="space-y-3">
                          {filteredWarnings.slice(0, 3).map((warning) => (
                            <CategoryItem
                              key={warning.id}
                              badge={
                                <>
                                  <Badge className={WARNING_LEVEL_STYLE[warning.warning_level]}>
                                    {WARNING_LEVEL_LABEL[warning.warning_level]}
                                  </Badge>
                                  <Badge variant="outline">{getWarningCategory(warning)}</Badge>
                                </>
                              }
                              title={warning.title}
                              description={warning.description}
                              footer={formatDateTime(warning.created_at || null)}
                              action={
                                <ReadOnlyGuard action="create" message="请登录后确认预警">
                                  <Button size="sm" onClick={() => confirmWarning(warning)}>
                                    确认为风险
                                  </Button>
                                </ReadOnlyGuard>
                              }
                            />
                          ))}
                        </div>
                      )}
                    </OverviewCard>

                    <OverviewCard
                      title="风险"
                      count={riskCount}
                      hint="当前进行中的风险清单"
                      icon={ShieldAlert}
                      accentClass="bg-gradient-to-br from-rose-50 to-slate-50"
                      actionLabel="查看风险"
                      onAction={() => setActiveTab('risks')}
                    >
                      {filteredRisks.filter((risk) => isActiveRisk(risk)).length === 0 ? (
                        <EmptyState
                          icon={ShieldAlert}
                          title="暂无风险"
                          description="当前没有已登记的风险。"
                          className="py-8"
                        />
                      ) : (
                        <div className="space-y-3">
                          {filteredRisks
                            .filter((risk) => isActiveRisk(risk))
                            .slice(0, 3)
                            .map((risk) => {
                              const level = String(risk.level || 'medium')
                              return (
                                <CategoryItem
                                  key={String(risk.id)}
                                  badge={
                                    <>
                                      <Badge className={RISK_LEVEL_STYLE[level] || RISK_LEVEL_STYLE.medium}>
                                        {RISK_LEVEL_LABEL[level] || '中'}
                                      </Badge>
                                      <Badge variant="outline">{risk.category || '其他'}</Badge>
                                      {getRiskSourceBadge(risk)}
                                    </>
                                  }
                                  title={risk.title || '未命名风险'}
                                  description={risk.description || undefined}
                                  footer={risk.task_id ? `关联任务：${risk.task_id}` : '当前未关联任务'}
                                  action={
                                    <ReadOnlyGuard action="edit" message="请登录后更新风险">
                                      <Button size="sm" variant="outline" onClick={() => toggleRisk(risk)}>
                                        {isActiveRisk(risk) ? '关闭风险' : '重新打开'}
                                      </Button>
                                    </ReadOnlyGuard>
                                  }
                                />
                              )
                            })}
                        </div>
                      )}
                    </OverviewCard>

                    <OverviewCard
                      title="问题"
                      count={problemCount}
                      hint="现场已经发生的事项"
                      icon={XCircle}
                      accentClass="bg-gradient-to-br from-orange-50 to-slate-50"
                      actionLabel="查看问题"
                      onAction={() => setActiveTab('problems')}
                    >
                      {filteredProblems.length === 0 ? (
                        <EmptyState
                          icon={XCircle}
                          title="暂无问题"
                          description="当前没有未解决的问题。"
                          className="py-8"
                        />
                      ) : (
                        <div className="space-y-3">
                          {filteredProblems.slice(0, 3).map((problem) => {
                            const status = getProblemStatus(problem)
                            return (
                              <CategoryItem
                                key={String(problem.id)}
                                badge={
                                  <>
                                    <Badge className="border-orange-200 bg-orange-50 text-orange-700">
                                      {status}
                                    </Badge>
                                    {problem.severity && <Badge variant="outline">级别：{problem.severity}</Badge>}
                                  </>
                                }
                                title={getProblemTitle(problem)}
                                description={problem.obstacle_type ? `类型：${problem.obstacle_type}` : undefined}
                                footer={
                                  problem.responsible_person || problem.responsible_unit
                                    ? [problem.responsible_person, problem.responsible_unit].filter(Boolean).join(' / ')
                                    : '现场已发生事项'
                                }
                                action={
                                  <ReadOnlyGuard action="edit" message="请登录后处理问题">
                                    <Button size="sm" variant="outline" onClick={() => resolveProblem(problem)}>
                                      标记已解决
                                    </Button>
                                  </ReadOnlyGuard>
                                }
                              />
                            )
                          })}
                        </div>
                      )}
                    </OverviewCard>
                  </div>
                </TabsContent>

                <TabsContent value="warnings" className="mt-0 space-y-3">
                  {filteredWarnings.length === 0 ? (
                    <EmptyState
                      icon={Bell}
                      title="暂无预警"
                      description="当前没有需要额外关注的系统预警。"
                      className="py-12"
                    />
                  ) : (
                    filteredWarnings.map((warning) => (
                      <CategoryItem
                        key={warning.id}
                        badge={
                          <>
                            <Badge className={WARNING_LEVEL_STYLE[warning.warning_level]}>
                              {WARNING_LEVEL_LABEL[warning.warning_level]}
                            </Badge>
                            <Badge variant="outline">{getWarningCategory(warning)}</Badge>
                          </>
                        }
                        title={warning.title}
                        description={warning.description}
                        footer={formatDateTime(warning.created_at || null)}
                        action={
                          <ReadOnlyGuard action="create" message="请登录后确认预警">
                            <Button size="sm" onClick={() => confirmWarning(warning)}>
                              确认为风险
                            </Button>
                          </ReadOnlyGuard>
                        }
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="risks" className="mt-0 space-y-3">
                  {filteredRisks.length === 0 ? (
                    <EmptyState
                      icon={ShieldAlert}
                      title="暂无风险"
                      description="当前没有已登记的风险。"
                      className="py-12"
                    />
                  ) : (
                    filteredRisks.map((risk) => {
                      const active = isActiveRisk(risk)
                      const level = String(risk.level || 'medium')
                      return (
                        <CategoryItem
                          key={String(risk.id)}
                          badge={
                            <>
                              <Badge className={RISK_LEVEL_STYLE[level] || RISK_LEVEL_STYLE.medium}>
                                {RISK_LEVEL_LABEL[level] || '中'}
                              </Badge>
                              <Badge variant="outline">{active ? '进行中' : '已关闭'}</Badge>
                              <Badge variant="outline">{String(risk.category || '其他')}</Badge>
                              {getRiskSourceBadge(risk)}
                            </>
                          }
                          title={risk.title || '未命名风险'}
                          description={risk.description || undefined}
                          footer={risk.task_id ? `关联任务：${risk.task_id}` : '当前未关联任务'}
                          action={
                            <ReadOnlyGuard action="edit" message="请登录后更新风险">
                              <Button size="sm" variant="outline" onClick={() => toggleRisk(risk)}>
                                {active ? '关闭风险' : '重新打开'}
                              </Button>
                            </ReadOnlyGuard>
                          }
                        />
                      )
                    })
                  )}
                </TabsContent>

                <TabsContent value="problems" className="mt-0 space-y-3">
                  {filteredProblems.length === 0 ? (
                    <EmptyState
                      icon={XCircle}
                      title="暂无问题"
                      description="当前没有未解决的问题。"
                      className="py-12"
                    />
                  ) : (
                    filteredProblems.map((problem) => {
                      const status = getProblemStatus(problem)
                      return (
                        <CategoryItem
                          key={String(problem.id)}
                          badge={
                            <>
                              <Badge className="border-orange-200 bg-orange-50 text-orange-700">
                                {status}
                              </Badge>
                              {problem.severity && <Badge variant="outline">级别：{problem.severity}</Badge>}
                            </>
                          }
                          title={getProblemTitle(problem)}
                          description={problem.obstacle_type ? `类型：${problem.obstacle_type}` : undefined}
                          footer={
                            problem.responsible_person || problem.responsible_unit
                              ? [problem.responsible_person, problem.responsible_unit].filter(Boolean).join(' / ')
                              : '现场已发生事项'
                          }
                          action={
                            <ReadOnlyGuard action="edit" message="请登录后处理问题">
                              <Button size="sm" variant="outline" onClick={() => resolveProblem(problem)}>
                                标记已解决
                              </Button>
                            </ReadOnlyGuard>
                          }
                        />
                      )
                    })
                  )}
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>

          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">重点关注</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FocusRow
                  title="预警"
                  tone="border-blue-100 bg-blue-50/70"
                  item={
                    topWarning
                      ? {
                          title: topWarning.title,
                          meta: topWarning.description,
                          badge: getWarningCategory(topWarning),
                        }
                      : null
                  }
                  emptyText="暂无预警"
                  onJump={() => setActiveTab('warnings')}
                />
                <FocusRow
                  title="风险"
                  tone="border-rose-100 bg-rose-50/70"
                  item={
                    topRisk
                      ? {
                          title: topRisk.title || '未命名风险',
                          meta: topRisk.description || '当前风险未填写描述。',
                          badge: RISK_LEVEL_LABEL[String(topRisk.level || 'medium')] || '中',
                        }
                      : null
                  }
                  emptyText="暂无风险"
                  onJump={() => setActiveTab('risks')}
                />
                <FocusRow
                  title="问题"
                  tone="border-orange-100 bg-orange-50/70"
                  item={
                    topProblem
                      ? {
                          title: getProblemTitle(topProblem),
                          meta: topProblem.obstacle_type ? `类型：${topProblem.obstacle_type}` : '当前问题已收口到主链',
                          badge: getProblemStatus(topProblem),
                        }
                      : null
                  }
                  emptyText="暂无问题"
                  onJump={() => setActiveTab('problems')}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setTrendExpanded((v) => !v)}
                >
                  <CardTitle className="text-base">趋势分析</CardTitle>
                  <span className="text-slate-400 text-sm select-none">
                    {trendExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>
              </CardHeader>
              {trendExpanded && (
                <CardContent className="pt-0">
                  <RiskTrendChart defaultExpanded={true} />
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
