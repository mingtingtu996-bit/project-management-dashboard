import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { V14231PageReadinessBoundary } from '@/components/governance/V14231PageReadinessBoundary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { useStore } from '@/hooks/useStore'
import { useWorkspaceData } from '@/hooks/useWorkspaceData'
import { toast } from '@/hooks/use-toast'
import { apiDelete, apiGet, apiPut, getApiErrorMessage, isBackendUnavailableError } from '@/lib/apiClient'
import { resolveCurrentCompanyRole } from '@/lib/companyRole'
import { fetchProjectsFromApi, normalizeApiProject, type ProjectCatalogItem } from '@/lib/projectApi'
import type { Issue, Risk } from '@/lib/supabase'
import { DashboardApiService, type CompanySummaryResponse, type ProjectSummary } from '@/services/dashboardApi'
import { AlertTriangle, FolderKanban } from 'lucide-react'
import { WizardDraftBadge } from '@/components/project/wizard/WizardDraftBadge'
import {
  createWizardProjectDraft,
  deleteWizardProjectDraft,
  listCompanyProjectDrafts,
  type WizardDraftItem,
} from '@/components/project/wizard/projectWizardApi'

import { CompanyCockpitDialogs } from './CompanyCockpit/components/CompanyCockpitDialogs'
import { CompanyHero } from './CompanyCockpit/components/CompanyHero'
import { ProjectOverviewSection } from './CompanyCockpit/components/ProjectOverviewSection'
import type { CockpitTab, HealthHistory, ProjectFormStatus, ProjectRow } from './CompanyCockpit/types'
import { displayProjectName, mapSummaryStatusToTab, normalizeStatusLabel } from './CompanyCockpit/utils'

const CompanyInsightSection = lazy(() => import('./CompanyCockpit/components/CompanyInsightSection').then((module) => ({
  default: module.CompanyInsightSection,
})))

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

function isArchivedProject(project: ProjectCatalogItem) {
  return normalizeProjectFormStatus(project.status) === '已暂停'
}

const EMPTY_HEALTH_HISTORY: HealthHistory = {
  thisMonth: null,
  lastMonth: null,
  change: null,
  lastMonthPeriod: null,
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasCompanySummaryMainContract(summary: CompanySummaryResponse | null) {
  const statusCounts = summary?.statusCounts

  return Boolean(
    summary
      && isFiniteNumber(summary.projectCount)
      && isFiniteNumber(statusCounts?.total)
      && isFiniteNumber(statusCounts?.inProgress)
      && isFiniteNumber(statusCounts?.completed)
      && isFiniteNumber(statusCounts?.paused)
      && isFiniteNumber(summary.averageHealth)
      && isFiniteNumber(summary.averageProgress)
      && isFiniteNumber(summary.attentionProjectCount)
      && isFiniteNumber(summary.totalUnreadWarningCount)
      && isFiniteNumber(summary.totalDelayedTaskCount)
      && isFiniteNumber(summary.lowHealthProjectCount)
      && isFiniteNumber(summary.overdueMilestoneProjectCount),
  )
}

function hasCompanyRankingContract(summary: CompanySummaryResponse | null, projectCount: number) {
  if (!Array.isArray(summary?.ranking)) return false
  return projectCount === 0 || summary.ranking.length > 0
}

function getBusinessHealthScore(summary: ProjectSummary | null) {
  const value = summary?.businessHealthScore
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildKeyNodeLabel(summary: ProjectSummary | null) {
  const keyNodeSummary = summary?.keyNodeSummary
  if (!keyNodeSummary || keyNodeSummary.total <= 0) return '暂无关键节点摘要'
  return `关键节点 ${keyNodeSummary.total} 个`
}

function getKeyNodeAttentionCount(summary: ProjectSummary | null) {
  const keyNodeSummary = summary?.keyNodeSummary
  if (!keyNodeSummary) return 0
  return (keyNodeSummary.dueSoonCount ?? 0)
    + (keyNodeSummary.shiftedCount ?? 0)
    + (keyNodeSummary.blockedCount ?? 0)
    + (keyNodeSummary.highRiskCount ?? 0)
}

function buildProjectFromSummary(summary: ProjectSummary): ProjectCatalogItem {
  const now = new Date().toISOString()

  return {
    id: summary.id,
    name: summary.name,
    description: '',
    status: summary.status === 'completed' || summary.statusLabel === '已完成'
      ? 'completed'
      : summary.status === 'archived' || summary.status === 'paused' || summary.statusLabel === '已暂停'
        ? 'archived'
        : 'active',
    created_at: now,
    updated_at: now,
    planned_start_date: summary.plannedStartDate ?? undefined,
    planned_end_date: summary.plannedEndDate ?? undefined,
  }
}

function buildProjectRow(project: ProjectCatalogItem, summary: ProjectSummary | null): ProjectRow {
  return {
    project,
    summary,
    summaryStatus: normalizeStatusLabel(summary, project),
    businessHealthScore: getBusinessHealthScore(summary),
    keyNodeLabel: buildKeyNodeLabel(summary),
    keyNodeAttentionCount: getKeyNodeAttentionCount(summary),
    deliveryDaysRemaining: summary?.daysUntilPlannedEnd ?? null,
  }
}

function toWizardDraftBadgeItems(drafts: WizardDraftItem[]) {
  return drafts.map((draft) => ({
    id: draft.id,
    name: displayProjectName({ name: draft.name }),
    draftStep: draft.draft_step ?? draft.wizard_draft_payload?.step ?? 0,
    updatedAt: draft.draft_updated_at
      ? new Date(draft.draft_updated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : draft.updated_at
        ? new Date(draft.updated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : null,
  }))
}

function CompanyCockpitSkeleton() {
  return (
    <div className="space-y-8">
      <div className="surface-card overflow-hidden">
        <div className="grid gap-px bg-slate-100 xl:grid-cols-[minmax(0,1.58fr)_25rem]">
          <div className="space-y-8 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-10 w-56 rounded-2xl" />
                <Skeleton className="h-4 w-[26.25rem] max-w-full rounded-full" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-11 w-52 rounded-2xl" />
                <Skeleton className="h-11 w-28 rounded-2xl" />
                <Skeleton className="h-11 w-32 rounded-2xl" />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Card key={item} variant="surface">
                  <CardContent className="space-y-4 p-5">
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

          <div className="space-y-4 bg-slate-950 p-5">
            <Skeleton className="h-5 w-24 rounded-full bg-slate-800" />
            <Skeleton className="h-10 w-44 rounded-2xl bg-slate-800" />
            <Skeleton className="h-4 w-full rounded-full bg-slate-800" />
            <div className="grid gap-5">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-20 rounded-2xl bg-slate-800" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Card variant="surface">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="mt-4 h-9 w-16 rounded-full" />
                <Skeleton className="mt-3 h-2 rounded-full" />
                <Skeleton className="mt-3 h-4 w-40 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card variant="surface">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  )
}

function CompanyInsightSectionFallback() {
  return (
    <section className="surface-card overflow-hidden" aria-label="公司洞察加载中">
      <div className="px-6 py-5">
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="border-t border-slate-100 px-6 py-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </section>
  )
}

export default function CompanyCockpit() {
  useEffect(() => {
    document.title = '公司驾驶舱 | WorkBuddy'
  }, [])

  const navigate = useNavigate()
  const { user } = useAuth()
  const workspace = useWorkspaceData()
  const setProjects = useStore((state) => state.setProjects)
  const currentCompanyRole = resolveCurrentCompanyRole(
    workspace.loading ? user?.currentCompanyRole : (workspace.currentCompany ? workspace.currentCompany.role : null),
  )
  const isCurrentCompanyAdmin = currentCompanyRole === 'company_admin'
  const currentCompanyId = workspace.currentCompany?.id ?? user?.currentCompanyId ?? null

  const [projects, setLocalProjects] = useState<ProjectCatalogItem[]>([])
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [healthHistory, setHealthHistory] = useState<HealthHistory>(EMPTY_HEALTH_HISTORY)
  const [companySummary, setCompanySummary] = useState<CompanySummaryResponse | null>(null)
  const [companyRisks, setCompanyRisks] = useState<Risk[]>([])
  const [companyIssues, setCompanyIssues] = useState<Issue[]>([])
  const [wizardDrafts, setWizardDrafts] = useState<WizardDraftItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [projectCatalogLoading, setProjectCatalogLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<ProjectCatalogItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectCatalogItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const creatingDraftRef = useRef(false)
  const hasLoadedCompanyCockpitRef = useRef(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<CockpitTab>('all')
  const [form, setForm] = useState(DEFAULT_FORM)

  const refreshSecondaryCompanyData = useCallback(async (companyId?: string | null) => {
    const [risks, issues, draftRows] = await Promise.all([
      apiGet<Risk[]>('/api/risks').catch(() => []),
      apiGet<Issue[]>('/api/issues').catch(() => []),
      companyId ? listCompanyProjectDrafts(companyId).catch(() => []) : Promise.resolve([]),
    ])

    setCompanyRisks(risks)
    setCompanyIssues(issues)
    setWizardDrafts(draftRows)
  }, [])

  const refreshData = useCallback(async () => {
    const shouldShowInitialLoading = !hasLoadedCompanyCockpitRef.current
    setLoading(shouldShowInitialLoading)
    setRefreshing(!shouldShowInitialLoading)
    setProjectCatalogLoading(true)
    setError(null)

    try {
      const projectSyncResultPromise = fetchProjectsFromApi()
        .then((storedProjects) => ({ storedProjects, error: null as unknown }))
        .catch((syncError: unknown) => ({ storedProjects: null, error: syncError }))

      const summaryData = await DashboardApiService.getCompanySummary()
      const summaryProjects = (summaryData?.ranking ?? []).map(buildProjectFromSummary)

      if (summaryProjects.length > 0) {
        setLocalProjects(summaryProjects)
      }

      setSummaries(summaryData?.ranking ?? [])
      setHealthHistory(summaryData?.healthHistory ?? EMPTY_HEALTH_HISTORY)
      setCompanySummary(summaryData)
      hasLoadedCompanyCockpitRef.current = true
      setLoading(false)
      setRefreshing(false)

      const projectSyncResult = await projectSyncResultPromise
      if (projectSyncResult.storedProjects) {
        const nextProjects = projectSyncResult.storedProjects.length > 0
          ? projectSyncResult.storedProjects
          : summaryProjects
        setLocalProjects(nextProjects)
        setProjects(projectSyncResult.storedProjects)
      } else if (summaryProjects.length === 0) {
        throw projectSyncResult.error
      } else {
        console.warn('Company cockpit project catalog sync failed; using company summary ranking fallback.', projectSyncResult.error)
      }
      setProjectCatalogLoading(false)

      void refreshSecondaryCompanyData(currentCompanyId)
    } catch (err) {
      console.error('Failed to load company cockpit data:', err)
      toast({ variant: 'destructive', title: '加载公司数据失败' })
      setError(
        isBackendUnavailableError(err)
          ? '公司驾驶舱依赖后端汇总接口，请先确认本地后端已启动（默认 3001），再刷新重试。'
          : getApiErrorMessage(err, '公司驾驶舱加载失败，请稍后重试。'),
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
      setProjectCatalogLoading(false)
    }
  }, [currentCompanyId, refreshSecondaryCompanyData, setProjects])

  useEffect(() => {
    if (workspace.loading) {
      return
    }

    if (!isCurrentCompanyAdmin) {
      setLoading(false)
      setError(null)
      return
    }

    void refreshData()
  }, [isCurrentCompanyAdmin, refreshData, workspace.loading])

  useEffect(() => {
    if (workspace.loading) return
    if (isCurrentCompanyAdmin) return
    toast({
      title: '公司驾驶舱仅管理视角可见',
      description: '已返回工作台，你仍可从工作台进入自己参与的项目。',
    })
    navigate('/workspace', { replace: true })
  }, [isCurrentCompanyAdmin, navigate, workspace.loading])

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
      return buildProjectRow(project, summary)
    })
  }, [filteredProjects, summaryMap])

  const rankedProjectRows = useMemo<ProjectRow[]>(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]))
    return summaries.map((summary) => buildProjectRow(
      projectMap.get(summary.id) ?? buildProjectFromSummary(summary),
      summary,
    ))
  }, [projects, summaries])

  const overviewProjectRows = useMemo<ProjectRow[]>(() => {
    const filteredProjectIds = new Set(filteredProjects.map((project) => project.id))
    const rankedRows = rankedProjectRows.filter((row) => filteredProjectIds.has(row.project.id))
    const rankedProjectIds = new Set(rankedRows.map((row) => row.project.id))
    const remainingRows = projectRows.filter((row) => !rankedProjectIds.has(row.project.id))

    return [...rankedRows, ...remainingRows]
  }, [filteredProjects, projectRows, rankedProjectRows])

  const companyStats = useMemo(() => {
    const statusCounts = companySummary?.statusCounts

    return {
      total: companySummary?.projectCount ?? null,
      inProgress: statusCounts?.inProgress ?? null,
      completed: statusCounts?.completed ?? null,
      paused: statusCounts?.paused ?? null,
      averageHealth: companySummary?.averageHealth ?? null,
      averageProgress: companySummary?.averageProgress ?? null,
      attentionProjectCount: companySummary?.attentionProjectCount ?? null,
      totalUnreadWarningCount: companySummary?.totalUnreadWarningCount ?? null,
      totalDelayedTaskCount: companySummary?.totalDelayedTaskCount ?? null,
      lowHealthProjectCount: companySummary?.lowHealthProjectCount ?? null,
      overdueMilestoneProjectCount: companySummary?.overdueMilestoneProjectCount ?? null,
    }
  }, [companySummary])

  const companyMainSummaryReady = hasCompanySummaryMainContract(companySummary)
  const companyRankingReady = hasCompanyRankingContract(companySummary, projects.length)
  const companySummaryReady = companyMainSummaryReady && companyRankingReady

  const listStats = useMemo(() => {
    if (companyMainSummaryReady) {
      return {
        total: companySummary?.statusCounts.total ?? projects.length,
        inProgress: companySummary?.statusCounts.inProgress ?? 0,
        completed: companySummary?.statusCounts.completed ?? 0,
        paused: companySummary?.statusCounts.paused ?? 0,
      }
    }

    const total = projects.length
    const inProgress = projects.filter((project) => {
      const summary = summaryMap.get(project.id)
      return mapSummaryStatusToTab(summary?.statusLabel || project.status) === 'in_progress'
    }).length
    const completed = projects.filter((project) => {
      const summary = summaryMap.get(project.id)
      return mapSummaryStatusToTab(summary?.statusLabel || project.status) === 'completed'
    }).length
    const paused = projects.filter((project) => {
      const summary = summaryMap.get(project.id)
      return mapSummaryStatusToTab(summary?.statusLabel || project.status) === 'paused'
    }).length

    return {
      total,
      inProgress,
      completed,
      paused,
    }
  }, [companyMainSummaryReady, companySummary, projects, summaryMap])

  const supportCompanyStats = useMemo(() => {
    if (!companySummaryReady) return null

    return {
      total: companyStats.total as number,
      inProgress: companyStats.inProgress as number,
      completed: companyStats.completed as number,
      paused: companyStats.paused as number,
      averageHealth: companyStats.averageHealth as number,
      averageProgress: companyStats.averageProgress as number,
      attentionProjectCount: companyStats.attentionProjectCount as number,
      totalUnreadWarningCount: companyStats.totalUnreadWarningCount as number,
      totalDelayedTaskCount: companyStats.totalDelayedTaskCount as number,
      lowHealthProjectCount: companyStats.lowHealthProjectCount as number,
      overdueMilestoneProjectCount: companyStats.overdueMilestoneProjectCount as number,
    }
  }, [companyStats, companySummaryReady])

  const tabItems = useMemo(
    () => [
      { key: 'all' as const, label: '全部', count: listStats.total },
      { key: 'in_progress' as const, label: '进行中', count: listStats.inProgress },
      { key: 'completed' as const, label: '已完成', count: listStats.completed },
      { key: 'paused' as const, label: '已暂停', count: listStats.paused },
    ],
    [listStats.completed, listStats.inProgress, listStats.paused, listStats.total],
  )

  const upsertLocalProject = useCallback((projectSource: Parameters<typeof normalizeApiProject>[0]) => {
    const persistedProject = normalizeApiProject(projectSource)
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

  const navigateToModelingWorkbench = useCallback((projectId: string, options: { mode?: 'generate' | 'adjust'; replace?: boolean } = {}) => {
    const mode = options.mode ?? 'generate'
    navigate(`/projects/${encodeURIComponent(projectId)}/gantt?modelingWorkbench=${mode}`, { replace: options.replace })
  }, [navigate])

  const handleCreateProjectDraft = useCallback(async (options: { replace?: boolean } = {}) => {
    if (creatingDraftRef.current) return
    creatingDraftRef.current = true
    setCreatingDraft(true)
    try {
      const result = await createWizardProjectDraft({ step: 1, mode: 'new', detailLevel: 'overview' }, currentCompanyId)
      upsertLocalProject({ id: result.projectId, name: '未命名项目', status: result.status })
      navigateToModelingWorkbench(result.projectId, { replace: options.replace })
    } catch (err) {
      toast({
        title: '创建项目草稿失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      creatingDraftRef.current = false
      setCreatingDraft(false)
    }
  }, [currentCompanyId, navigateToModelingWorkbench, upsertLocalProject])

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

      if (editTarget) {
        const updatedProject = await apiPut<ProjectCatalogItem>(`/api/projects/${editTarget.id}`, {
          ...payload,
          version: editTarget.version ?? 1,
        })
        upsertLocalProject(updatedProject)
      }

      setEditTarget(null)
      setForm(DEFAULT_FORM)
      toast({
        title: '项目已更新',
        description: form.name.trim(),
      })
    } catch (err: unknown) {
      console.error('Failed to submit project:', err)
      toast({
        title: '保存失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditProject = (project: ProjectCatalogItem) => {
    setEditTarget(project)
    setForm({
      name: project.name || '',
      description: project.description || '',
      status: normalizeProjectFormStatus(project.status),
    })
  }

  const handleToggleArchive = async (project: ProjectCatalogItem) => {
    const archived = isArchivedProject(project)
    const nextStatus: ProjectFormStatus = archived ? '进行中' : '已暂停'

    setSubmitting(true)
    try {
      const updatedProject = await apiPut<ProjectCatalogItem>(`/api/projects/${project.id}`, {
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

  const handleDeleteWizardDraft = useCallback(async (projectId: string) => {
    try {
      await deleteWizardProjectDraft(projectId)
      setWizardDrafts((previous) => previous.filter((draft) => draft.id !== projectId))
      toast({ title: '草稿已删除' })
    } catch (err) {
      toast({
        title: '删除草稿失败',
        description: getApiErrorMessage(err, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [])

  const handleDeleteProject = async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    try {
      await apiDelete(`/api/projects/${deleteTarget.id}`, {
        headers: {
          'X-WorkBuddy-Confirm-Action': `delete-project:${deleteTarget.id}`,
        },
      })
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

  const knownProjectCount = companyStats.total ?? projects.length
  const hasKnownProjects = knownProjectCount > 0 || projects.length > 0
  const showEmptyProjectState = !projectCatalogLoading && !hasKnownProjects
  const showProjectOverview = projectCatalogLoading || hasKnownProjects

  if (workspace.loading || loading) {
    return (
      <div className="page-shell">
        <Breadcrumb items={[{ label: '公司驾驶舱' }]} />
        <CompanyCockpitSkeleton />
      </div>
    )
  }

  if (!isCurrentCompanyAdmin) {
    return null
  }

  return (
    <div className="page-shell" data-testid="company-cockpit-page">
      <div className="space-y-8">
        <Breadcrumb items={[{ label: '公司驾驶舱' }]} />
        <V14231PageReadinessBoundary pageKey="CompanyCockpit" />

        {error ? (
          <EmptyState
            icon={AlertTriangle}
            title="公司驾驶舱加载失败"
            description={error}
            className="rounded-2xl empty-state-frame border-slate-200 bg-white px-6 py-12 shadow-[var(--el-1)]"
            action={(
              <Button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
              >
                重新加载
              </Button>
            )}
          />
        ) : showEmptyProjectState ? (
          <EmptyState
            icon={FolderKanban}
            title="暂无项目"
            description="创建第一个项目开始使用 WorkBuddy"
            className="rounded-2xl empty-state-frame border-slate-200 bg-white px-6 py-12 shadow-[var(--el-1)]"
            action={(
              <Button
                type="button"
                onClick={() => void handleCreateProjectDraft()}
                disabled={creatingDraft}
              >
                创建项目
              </Button>
            )}
          />
        ) : (
          <CompanyHero
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => void refreshData()}
            onCreate={() => void handleCreateProjectDraft()}
            error={error}
            summaryReady={companySummaryReady}
            isRefreshing={refreshing}
            healthHistory={healthHistory}
            stats={{
              total: companyStats.total,
              inProgress: companyStats.inProgress,
              completed: companyStats.completed,
              paused: companyStats.paused,
              averageHealth: companyStats.averageHealth,
              attentionProjectCount: companyStats.attentionProjectCount,
              totalUnreadWarningCount: companyStats.totalUnreadWarningCount,
              totalDelayedTaskCount: companyStats.totalDelayedTaskCount,
              lowHealthProjectCount: companyStats.lowHealthProjectCount,
              overdueMilestoneProjectCount: companyStats.overdueMilestoneProjectCount,
            }}
            draftBadge={(
              <WizardDraftBadge
                draftCount={wizardDrafts.length}
                drafts={toWizardDraftBadgeItems(wizardDrafts)}
                onResume={(projectId) => navigateToModelingWorkbench(projectId, { mode: 'generate' })}
                onDelete={(projectId) => void handleDeleteWizardDraft(projectId)}
              />
            )}
            focusProjects={[] as never}
            onNavigate={navigate}
          />
        )}

        {companySummaryReady && supportCompanyStats ? (
          <Suspense fallback={<CompanyInsightSectionFallback />}>
            <CompanyInsightSection
              projectRows={rankedProjectRows}
              healthHistory={healthHistory}
              stats={{
                total: supportCompanyStats.total,
                inProgress: supportCompanyStats.inProgress,
                completed: supportCompanyStats.completed,
                paused: supportCompanyStats.paused,
                averageHealth: supportCompanyStats.averageHealth,
                averageProgress: supportCompanyStats.averageProgress,
                attentionProjectCount: supportCompanyStats.attentionProjectCount,
                totalUnreadWarningCount: supportCompanyStats.totalUnreadWarningCount,
                totalDelayedTaskCount: supportCompanyStats.totalDelayedTaskCount,
                lowHealthProjectCount: supportCompanyStats.lowHealthProjectCount,
              }}
              companyRisks={companyRisks}
              companyIssues={companyIssues}
              summaryReady={companySummaryReady}
              onNavigate={navigate}
            />
          </Suspense>
        ) : null}

        {showProjectOverview ? (
          <ProjectOverviewSection
            projectRows={overviewProjectRows}
            totalProjects={listStats.total}
            loadingMore={projectCatalogLoading}
            activeTab={activeTab}
            tabItems={tabItems}
            onTabChange={setActiveTab}
            onCreate={() => void handleCreateProjectDraft()}
            onEdit={handleEditProject}
            onToggleArchive={(project) => void handleToggleArchive(project)}
            onDelete={setDeleteTarget}
            onNavigate={navigate}
          />
        ) : null}

        <CompanyCockpitDialogs
          editTarget={editTarget}
          onEditTargetChange={setEditTarget}
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
