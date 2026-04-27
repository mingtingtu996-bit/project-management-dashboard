import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage, isBackendUnavailableError } from '@/lib/apiClient'
import type { Project } from '@/lib/localDb'
import { syncProjectCacheFromApi, toPersistedProject } from '@/lib/projectPersistence'
import { normalizeGlobalRole } from '@/lib/roleLabels'
import type { Issue, Risk } from '@/lib/supabase'
import { DashboardApiService, type CompanySummaryResponse, type ProjectSummary } from '@/services/dashboardApi'
import { Activity, FolderKanban, ShieldAlert, Target } from 'lucide-react'

import {
  CompanyCockpitDialogs,
  CompanyHero,
  CompanyInsightSection,
  ProjectOverviewSection,
} from './CompanyCockpit/components'
import type { CockpitTab, HealthHistory, ProjectFormStatus, ProjectRow } from './CompanyCockpit/types'
import { formatDelta, mapSummaryStatusToTab, normalizeStatusLabel } from './CompanyCockpit/utils'

const DEFAULT_FORM = {
  name: '',
  description: '',
  status: '未开始' as ProjectFormStatus,
}

function normalizeProjectFormStatus(status?: string | null): ProjectFormStatus {
  switch (status) {
    case 'active':
    case 'in_progress':
    case '进行中':
      return '进行中'
    case 'completed':
    case '已完成':
      return '已完成'
    case 'archived':
    case 'paused':
    case '已暂停':
      return '已暂停'
    default:
      return '未开始'
  }
}

function isArchivedProject(project: Project) {
  return normalizeProjectFormStatus(project.status) === '已暂停'
}

const EMPTY_HEALTH_HISTORY: HealthHistory = {
  thisMonth: null,
  lastMonth: null,
  change: null,
  lastMonthPeriod: null,
}

function CompanyCockpitSkeleton() {
  return (
    <div className="space-y-6">
      <div className="shell-surface overflow-hidden">
        <div className="grid gap-px bg-slate-100 xl:grid-cols-[minmax(0,1.58fr)_400px]">
          <div className="space-y-6 bg-white p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-10 w-56 rounded-2xl" />
                <Skeleton className="h-4 w-[420px] max-w-full rounded-full" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-11 w-52 rounded-2xl" />
                <Skeleton className="h-11 w-28 rounded-2xl" />
                <Skeleton className="h-11 w-32 rounded-2xl" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Card key={item} className="card-l2">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24 rounded-full" />
                      <Skeleton className="h-10 w-10 rounded-2xl" />
                    </div>
                    <Skeleton className="h-10 w-20 rounded-full" />
                    <Skeleton className="h-4 w-32 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-6">
            <Skeleton className="h-5 w-24 rounded-full bg-slate-800" />
            <Skeleton className="h-10 w-44 rounded-2xl bg-slate-800" />
            <Skeleton className="h-4 w-full rounded-full bg-slate-800" />
            <div className="grid gap-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-20 rounded-3xl bg-slate-800" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card className="card-l2">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="mt-4 h-9 w-16 rounded-full" />
                <Skeleton className="mt-3 h-2 rounded-full" />
                <Skeleton className="mt-3 h-4 w-40 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="card-l2">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-[28px]" />
          <Skeleton className="h-56 w-full rounded-[28px]" />
        </CardContent>
      </Card>
    </div>
  )
}

export default function CompanyCockpit() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const setProjects = useStore((state) => state.setProjects)
  const isCompanyAdmin = normalizeGlobalRole(user?.globalRole) === 'company_admin'

  const [projects, setLocalProjects] = useState<Project[]>([])
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [healthHistory, setHealthHistory] = useState<HealthHistory>(EMPTY_HEALTH_HISTORY)
  const [companySummary, setCompanySummary] = useState<CompanySummaryResponse | null>(null)
  const [companyRisks, setCompanyRisks] = useState<Risk[]>([])
  const [companyIssues, setCompanyIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<CockpitTab>('all')
  const [form, setForm] = useState(DEFAULT_FORM)

  const refreshData = useCallback(async (options: { allowEmptyReplace?: boolean } = {}) => {
    setLoading(true)
    setError(null)
    let shellReady = false

    try {
      const storedProjects = await syncProjectCacheFromApi(options)

      setLocalProjects(storedProjects)
      setProjects(storedProjects)
      setLoading(false)
      shellReady = true

      const [summaryData, risks, issues] = await Promise.all([
        DashboardApiService.getCompanySummary(),
        apiGet<Risk[]>('/api/risks').catch(() => []),
        apiGet<Issue[]>('/api/issues').catch(() => []),
      ])

      setSummaries(summaryData.ranking)
      setHealthHistory(summaryData.healthHistory)
      setCompanySummary(summaryData)
      setCompanyRisks(risks)
      setCompanyIssues(issues)
    } catch (err) {
      console.error('Failed to load company cockpit data:', err)
      setError(
        isBackendUnavailableError(err)
          ? '公司驾驶舱依赖后端汇总接口，请先确认本地后端已启动（默认 3001），再刷新重试。'
          : getApiErrorMessage(err, '公司驾驶舱加载失败，请稍后重试。'),
      )
    } finally {
      if (!shellReady) {
        setLoading(false)
      }
    }
  }, [setProjects])

  useEffect(() => {
    if (!isCompanyAdmin) {
      setLoading(false)
      setError(null)
      return
    }

    void refreshData()
  }, [isCompanyAdmin, refreshData])

  useEffect(() => {
    const handleOpenCreate = () => {
      setDialogMode('create')
      setEditTarget(null)
      setForm(DEFAULT_FORM)
      setDialogOpen(true)
    }
    window.addEventListener('open-create-project', handleOpenCreate)
    return () => window.removeEventListener('open-create-project', handleOpenCreate)
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('create') !== '1') return

    setDialogMode('create')
    setEditTarget(null)
    setForm(DEFAULT_FORM)
    setDialogOpen(true)
    navigate('/company', { replace: true })
  }, [location.search, navigate])

  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.id, summary])), [summaries])

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const tabFiltered =
      activeTab === 'all'
        ? projects
        : projects.filter((project) => mapSummaryStatusToTab(summaryMap.get(project.id)?.statusLabel || project.status) === activeTab)

    if (!keyword) return tabFiltered

    return tabFiltered.filter((project) => {
      return (
        project.name.toLowerCase().includes(keyword)
        || (project.description || '').toLowerCase().includes(keyword)
      )
    })
  }, [activeTab, projects, search, summaryMap])

  const projectRows = useMemo<ProjectRow[]>(() => {
    return filteredProjects.map((project) => {
      const summary = summaryMap.get(project.id) ?? null

      return {
        project,
        summary,
        summaryStatus: normalizeStatusLabel(summary, project),
        healthScore: summary?.healthScore ?? 0,
        hasNextMilestone: Boolean(summary?.nextMilestone?.name),
        milestoneName: summary?.nextMilestone?.name || '暂无关键节点',
        milestoneDate: summary?.nextMilestone?.targetDate || null,
        milestoneDaysRemaining: summary?.nextMilestone?.daysRemaining ?? null,
        deliveryDaysRemaining: summary?.daysUntilPlannedEnd ?? null,
      }
    })
  }, [filteredProjects, summaryMap])

  const stats = useMemo(() => {
    const total = companySummary?.projectCount ?? 0
    const inProgress = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'in_progress').length
    const completed = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'completed').length
    const paused = summaries.filter((summary) => mapSummaryStatusToTab(summary.statusLabel) === 'paused').length
    const averageHealth = companySummary?.averageHealth ?? 0
    const averageProgress = companySummary?.averageProgress ?? 0
    const attentionProjectCount = companySummary?.attentionProjectCount ?? 0
    const lowHealthProjectCount = companySummary?.lowHealthProjectCount ?? 0
    const overdueMilestoneProjectCount = companySummary?.overdueMilestoneProjectCount ?? 0

    return {
      total,
      inProgress,
      completed,
      paused,
      averageHealth,
      averageProgress,
      attentionProjectCount,
      lowHealthProjectCount,
      overdueMilestoneProjectCount,
    }
  }, [companySummary, summaries])

  const tabItems = useMemo(
    () => [
      { key: 'all' as const, label: '全部', count: stats.total },
      { key: 'in_progress' as const, label: '进行中', count: stats.inProgress },
      { key: 'completed' as const, label: '已完成', count: stats.completed },
      { key: 'paused' as const, label: '已暂停', count: stats.paused },
    ],
    [stats.completed, stats.inProgress, stats.paused, stats.total],
  )

  const heroStats = useMemo(
    () => [
      {
        label: '项目总数',
        value: String(stats.total),
        hint: `进行中 ${stats.inProgress} · 已完成 ${stats.completed}`,
        icon: FolderKanban,
        tone: 'bg-blue-50 text-blue-600',
      },
      {
        label: '平均总体进度',
        value: `${stats.averageProgress}%`,
        hint: projectRows.length === stats.total ? '公司层共享摘要平均值' : `当前筛出 ${projectRows.length} / ${stats.total} 个项目`,
        icon: Target,
        tone: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: '平均健康度',
        value: String(stats.averageHealth),
        hint: formatDelta(healthHistory.change),
        icon: Activity,
        tone: 'bg-amber-50 text-amber-600',
      },
      {
        label: '需关注项目数',
        value: String(stats.attentionProjectCount),
        hint: `逾期里程碑 ${stats.overdueMilestoneProjectCount} · 健康低于 60 分 ${stats.lowHealthProjectCount}`,
        icon: ShieldAlert,
        tone: 'bg-red-50 text-red-600',
      },
    ],
    [
      healthHistory.change,
      projectRows.length,
      stats.attentionProjectCount,
      stats.averageHealth,
      stats.averageProgress,
      stats.completed,
      stats.inProgress,
      stats.lowHealthProjectCount,
      stats.overdueMilestoneProjectCount,
      stats.total,
    ],
  )

  const upsertLocalProject = useCallback((projectSource: { id: string; name?: string }) => {
    const persistedProject = toPersistedProject(projectSource)
    setLocalProjects((previous) => {
      const exists = previous.some((project) => project.id === persistedProject.id)
      const next = exists
        ? previous.map((project) => (project.id === persistedProject.id ? { ...project, ...persistedProject } : project))
        : [persistedProject, ...previous]
      setProjects(next)
      return next
    })
    return persistedProject
  }, [setProjects])

  const removeLocalProject = useCallback((projectId: string) => {
    setLocalProjects((previous) => {
      const next = previous.filter((project) => project.id !== projectId)
      setProjects(next)
      return next
    })
  }, [setProjects])

  const handleSubmitProject = async () => {
    if (!form.name.trim()) {
      toast({ title: '请输入项目名称', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      }

      if (dialogMode === 'edit' && editTarget) {
        const updatedProject = await apiPut<Project>(`/api/projects/${editTarget.id}`, {
          ...payload,
          version: editTarget.version ?? 1,
        })
        upsertLocalProject(updatedProject)
      } else {
        const createdProject = await apiPost<Project>('/api/projects', payload)
        upsertLocalProject(createdProject)
      }

      setDialogOpen(false)
      setDialogMode('create')
      setEditTarget(null)
      setForm(DEFAULT_FORM)
      toast({
        title: dialogMode === 'edit' ? '项目已更新' : '项目已创建',
        description: form.name.trim(),
      })
    } catch (err: unknown) {
      console.error('Failed to submit project:', err)
      toast({
        title: dialogMode === 'edit' ? '保存失败' : '创建失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditProject = (project: Project) => {
    setDialogMode('edit')
    setEditTarget(project)
    setForm({
      name: project.name || '',
      description: project.description || '',
      status: normalizeProjectFormStatus(project.status),
    })
    setDialogOpen(true)
  }

  const handleToggleArchive = async (project: Project) => {
    const archived = isArchivedProject(project)
    const nextStatus: ProjectFormStatus = archived ? '进行中' : '已暂停'

    setSubmitting(true)
    try {
      const updatedProject = await apiPut<Project>(`/api/projects/${project.id}`, {
        status: nextStatus,
        version: project.version ?? 1,
      })
      upsertLocalProject(updatedProject)
      toast({
        title: archived ? '项目已激活' : '项目已归档',
        description: project.name,
      })
    } catch (err: unknown) {
      console.error('Failed to toggle project archive state:', err)
      toast({
        title: archived ? '激活失败' : '归档失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    try {
      await apiDelete(`/api/projects/${deleteTarget.id}`)
      removeLocalProject(deleteTarget.id)
      toast({ title: '项目已删除', description: deleteTarget.name })
      setDeleteTarget(null)
    } catch (err: unknown) {
      console.error('Failed to delete project:', err)
      toast({
        title: '删除失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (open) return
    setDialogMode('create')
    setEditTarget(null)
    setForm(DEFAULT_FORM)
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <nav className="text-sm text-slate-500">公司驾驶舱</nav>
        <CompanyCockpitSkeleton />
      </div>
    )
  }

  if (!isCompanyAdmin) {
    return (
      <div className="page-enter bg-slate-50/70 p-6" data-testid="company-cockpit-page">
        <div className="mx-auto max-w-4xl space-y-6">
          <nav className="text-sm text-slate-500">公司驾驶舱</nav>
          <Card data-testid="company-cockpit-access-denied" className="border border-amber-100 bg-amber-50/70 shadow-none">
            <CardContent className="space-y-3 p-8">
              <p className="text-lg font-semibold text-slate-900">公司驾驶舱仅公司管理员可见</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter bg-slate-50/70 p-6" data-testid="company-cockpit-page">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <nav className="text-sm text-slate-500">公司驾驶舱</nav>

        <CompanyHero
          search={search}
          onSearchChange={setSearch}
          onRefresh={() => void refreshData({ allowEmptyReplace: true })}
          onCreate={() => {
            setDialogMode('create')
            setEditTarget(null)
            setForm(DEFAULT_FORM)
            setDialogOpen(true)
          }}
          error={error}
          heroStats={heroStats}
          healthHistory={healthHistory}
          stats={{
            inProgress: stats.inProgress,
            completed: stats.completed,
            paused: stats.paused,
          }}
          focusProjects={[] as never}
          onNavigate={navigate}
        />

        <CompanyInsightSection
          projectRows={projectRows}
          healthHistory={healthHistory}
          stats={{
            total: stats.total,
            inProgress: stats.inProgress,
            completed: stats.completed,
            paused: stats.paused,
            averageHealth: stats.averageHealth,
            averageProgress: stats.averageProgress,
          }}
          companyRisks={companyRisks}
          companyIssues={companyIssues}
          onNavigate={navigate}
        />

        <ProjectOverviewSection
          projectRows={projectRows}
          totalProjects={stats.total}
          activeTab={activeTab}
          tabItems={tabItems}
          onTabChange={setActiveTab}
          onCreate={() => {
            setDialogMode('create')
            setEditTarget(null)
            setForm(DEFAULT_FORM)
            setDialogOpen(true)
          }}
          onEdit={handleEditProject}
          onToggleArchive={(project) => void handleToggleArchive(project)}
          onDelete={setDeleteTarget}
          onNavigate={navigate}
        />

        <CompanyCockpitDialogs
          dialogOpen={dialogOpen}
          onDialogChange={handleDialogChange}
          dialogMode={dialogMode}
          form={form}
          onFormChange={setForm}
          submitting={submitting}
          onSubmit={() => void handleSubmitProject()}
          deleteTarget={deleteTarget}
          onDeleteTargetChange={setDeleteTarget}
          onDelete={() => void handleDeleteProject()}
        />
      </div>
    </div>
  )
}
