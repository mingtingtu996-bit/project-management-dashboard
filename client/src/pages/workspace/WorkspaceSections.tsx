// v1.4.20.1: workspace sections kept separate from page orchestration.

import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FolderOpen,
  MapPin,
  Plus,
  Search,
  User,
  UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/metric-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  JoinableProject,
  WorkspaceCompany,
  WorkspaceInvitation,
  WorkspaceJoinRequest,
  WorkspaceProject,
} from '@/hooks/useWorkspaceData'
import { zhCN } from '@/i18n/zh-CN'
import { cn } from '@/lib/utils'

type ProjectScope = 'mine' | 'company'
type ProjectView = 'grid' | 'list'
type ProjectFilter = {
  stage: string
  projectType: string
  role: string
}

const ALL_VALUE = '__all__'
const W = zhCN.workspace

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 11) return W.greetings.morning
  if (hour < 18) return W.greetings.afternoon
  return W.greetings.evening
}

function formatDate(value?: string | null) {
  if (!value) return W.projectCard.noRecord
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return W.projectCard.noRecord
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function scoreClass(score: number | null) {
  if (score == null) return 'text-slate-400'
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

function getProjectRoleLabel(role?: string | null) {
  if (role === 'owner') return W.roles.owner
  if (role === 'company_admin') return W.roles.companyAdmin
  return W.roles.member
}

export function ContextStrip({
  userDisplayName,
  currentCompany,
  switchableCompanies,
  onOpenCompanySwitcher,
}: {
  userDisplayName: string
  currentCompany: WorkspaceCompany | null
  switchableCompanies: WorkspaceCompany[]
  onOpenCompanySwitcher: () => void
}) {
  return (
    <section data-onboarding-target="workspace-context" className="flex min-h-12 flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-[var(--el-1)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">{`${getGreeting()}，${userDisplayName}`}</span>
        <span className="hidden h-4 w-px bg-slate-200 sm:inline-block" />
        <span className="min-w-0 truncate text-sm text-slate-500">{currentCompany?.name || W.noCompanySelected}</span>
        <RoleChip role={currentCompany?.role || 'regular'} />
      </div>
      {switchableCompanies.length > 1 ? (
        <Button variant="outline" size="sm" className="gap-2 self-start sm:self-auto" onClick={onOpenCompanySwitcher}>
          <Building2 className="h-4 w-4" />
          {W.dialogs.switchCompany}
        </Button>
      ) : null}
    </section>
  )
}

export function QuickMetricRow({
  myProjectsCount,
  pendingInvitationsCount,
  joinRequestsCount,
  joinableProjectsCount,
  onJumpToSection,
}: {
  myProjectsCount: number
  pendingInvitationsCount: number
  joinRequestsCount: number
  joinableProjectsCount: number
  onJumpToSection: (sectionId: string) => void
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="workspace-quick-metrics" data-onboarding-target="workspace-metrics">
      <MetricCard density="compact" title={W.metrics.myProjects} value={myProjectsCount} hint={W.metrics.currentParticipation} tone="primary" icon={<BriefcaseBusiness className="h-4 w-4" />} onClick={() => onJumpToSection('workspace-my-projects')} />
      <MetricCard density="compact" title={W.metrics.pendingInvitations} value={pendingInvitationsCount} hint={pendingInvitationsCount > 0 ? W.metrics.needsAction : W.metrics.empty} tone="warning" icon={<Bell className="h-4 w-4" />} onClick={() => onJumpToSection('workspace-pending')} />
      <MetricCard density="compact" title={W.metrics.pendingJoinRequests} value={joinRequestsCount} hint={joinRequestsCount > 0 ? W.metrics.waitingApproval : W.metrics.empty} tone="info" icon={<Clock3 className="h-4 w-4" />} onClick={() => onJumpToSection('workspace-pending')} />
      <MetricCard density="compact" title={W.metrics.joinableProjects} value={joinableProjectsCount} hint={W.metrics.browseApply} tone="slate" icon={<Search className="h-4 w-4" />} onClick={() => onJumpToSection('workspace-joinable')} />
    </section>
  )
}

export function RecentProjects({ projects, onProjectClick }: { projects: WorkspaceProject[]; onProjectClick: (projectId: string) => void }) {
  if (projects.length === 0) return null
  const sorted = [...projects]
    .sort((a, b) => new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime())
    .slice(0, 3)

  return (
    <section className="space-y-3" data-testid="workspace-recent-projects">
      <SectionTitle title={W.sections.recentProjects} count={sorted.length} />
      <div className="grid gap-4 md:grid-cols-3">
        {sorted.map((project) => (
          <ProjectQuickCard key={project.id} project={project} onProjectClick={onProjectClick} />
        ))}
      </div>
    </section>
  )
}

export function MyProjects({
  myProjects,
  companyProjects,
  isAdmin,
  singleProjectQuiet,
  onProjectClick,
}: {
  myProjects: WorkspaceProject[]
  companyProjects: WorkspaceProject[]
  isAdmin: boolean
  singleProjectQuiet: boolean
  onProjectClick: (projectId: string) => void
}) {
  const [scope, setScope] = useState<ProjectScope>('mine')
  const [view, setView] = useState<ProjectView>('grid')
  const [filter, setFilter] = useState<ProjectFilter>({ stage: ALL_VALUE, projectType: ALL_VALUE, role: ALL_VALUE })
  const sourceProjects = scope === 'company' && isAdmin ? (companyProjects.length > 0 ? companyProjects : myProjects) : myProjects
  const projects = sourceProjects.filter((project) => (
    (filter.stage === ALL_VALUE || project.stage === filter.stage)
    && (filter.projectType === ALL_VALUE || project.projectType === filter.projectType)
    && (filter.role === ALL_VALUE || project.myRole === filter.role)
  ))

  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const stages = Array.from(new Set(sourceProjects.map((project) => project.stage).filter(Boolean)))
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const projectTypes = Array.from(new Set(sourceProjects.map((project) => project.projectType).filter(Boolean)))
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const roles = Array.from(new Set(sourceProjects.map((project) => project.myRole).filter(Boolean)))

  if (sourceProjects.length === 0) return null

  return (
    <section id="workspace-my-projects" className="scroll-mt-20 space-y-3" data-testid="workspace-my-projects" data-onboarding-target="workspace-projects">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionTitle title={W.sections.myProjects} count={projects.length} />
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <SegmentedControl
              value={scope}
              onChange={(value) => setScope(value as ProjectScope)}
              options={[
                { value: 'mine', label: W.filters.mine },
                { value: 'company', label: W.filters.companyAll },
              ]}
            />
          ) : null}
          <SegmentedControl
            value={view}
            onChange={(value) => setView(value as ProjectView)}
            options={[
              { value: 'grid', label: W.filters.grid },
              { value: 'list', label: W.filters.list },
            ]}
          />
          <ProjectFilterSelect label={W.filters.stage} value={filter.stage} values={stages} onChange={(stage) => setFilter((current) => ({ ...current, stage }))} />
          <ProjectFilterSelect label={W.filters.type} value={filter.projectType} values={projectTypes} onChange={(projectType) => setFilter((current) => ({ ...current, projectType }))} />
          <ProjectFilterSelect label={W.filters.role} value={filter.role} values={roles} format={getProjectRoleLabel} onChange={(role) => setFilter((current) => ({ ...current, role }))} />
        </div>
      </div>
      {view === 'grid' ? (
        <div className={cn('grid gap-4', singleProjectQuiet ? 'mx-auto max-w-2xl' : 'md:grid-cols-2 xl:grid-cols-3')}>
          {projects.map((project) => (
            <ProjectQuickCard key={project.id} project={project} onProjectClick={onProjectClick} prominent={singleProjectQuiet} />
          ))}
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          {projects.map((project) => (
            <Button unstyled
              key={project.id}
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-2 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => onProjectClick(project.id)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{project.name}</span>
                <span className="text-xs text-slate-500">{project.projectType || W.projectCard.project} · {project.stage || W.projectCard.unsetStage}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                <span className={cn('font-semibold tabular-nums', scoreClass(project.healthScore))}>{project.healthScore ?? '--'}{W.projectCard.scoreUnit}</span>
                <RoleChip role={project.myRole} />
              </span>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}

export function PendingPanel({
  invitations,
  joinRequests,
  actionKey,
  onAcceptInvitation,
  onDeclineInvitation,
}: {
  invitations: WorkspaceInvitation[]
  joinRequests: WorkspaceJoinRequest[]
  actionKey: string | null
  onAcceptInvitation: (invitation: WorkspaceInvitation) => void
  onDeclineInvitation: (invitation: WorkspaceInvitation) => void
}) {
  const visibleRequests = joinRequests.filter((request) => request.status === 'pending' || request.status === 'rejected')
  const total = invitations.length + visibleRequests.length
  if (total === 0) return null

  return (
    <section id="workspace-pending" className="scroll-mt-20 rounded-xl border border-amber-200 bg-amber-50/80 p-4" data-testid="workspace-pending" data-onboarding-target="workspace-pending">
      <SectionTitle title={W.sections.pending} count={total} />
      <div className="mt-3 divide-y divide-amber-200/70">
        {invitations.slice(0, 5).map((invitation) => (
          <div key={invitation.id} className="flex min-h-14 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {invitation.inviterName || W.pending.inviterFallback} {W.pending.invitedYou} {invitation.projectName || W.pending.projectFallback}
              </p>
              <p className="mt-1 text-xs text-slate-600">{invitation.companyName || W.currentCompany} · {invitation.role === 'editor' ? W.roles.editorMember : W.roles.projectMember}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" className="h-8 px-3" loading={actionKey === `accept:${invitation.id}`} onClick={() => onAcceptInvitation(invitation)}>{W.pending.accept}</Button>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-slate-600" loading={actionKey === `decline:${invitation.id}`} onClick={() => onDeclineInvitation(invitation)}>{W.pending.decline}</Button>
            </div>
          </div>
        ))}
        {visibleRequests.slice(0, Math.max(0, 5 - invitations.length)).map((request) => (
          <div key={request.id} className="flex min-h-14 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{W.pending.appliedToJoin} {request.projectName || request.companyName || W.pending.projectFallback}</p>
              <p className="mt-1 text-xs text-slate-600">{request.type === 'company' ? W.pending.companyRequest : W.pending.projectRequest}</p>
            </div>
            <Badge variant={request.status === 'rejected' ? 'destructive' : 'outline'} className="self-start sm:self-auto">
              {request.status === 'rejected' ? W.pending.rejected : W.pending.pending}
            </Badge>
          </div>
        ))}
      </div>
      {total > 5 ? <Button variant="ghost" size="sm" className="mt-2 text-amber-800">{W.pending.viewAllPrefix} {total} {W.pending.viewAllSuffix}</Button> : null}
    </section>
  )
}

export function JoinableSection({ projects, onRequestJoin }: { projects: JoinableProject[]; onRequestJoin: (project: JoinableProject) => void }) {
  if (projects.length === 0) return null
  return (
    <section id="workspace-joinable" className="scroll-mt-20 space-y-3" data-testid="workspace-joinable" data-onboarding-target="workspace-joinable">
      <SectionTitle title={W.sections.joinableProjects} count={projects.length} secondary />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <div key={project.id} className="flex min-h-32 flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="min-h-13">
              <p className="line-clamp-2 text-base font-medium leading-6 text-slate-900">{project.name}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{project.projectType || W.projectCard.project} · {project.stage || W.projectCard.unsetStage}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <span className="flex min-w-0 items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{project.ownerName || W.joinable.ownerUnset}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{project.location || W.joinable.locationUnset}</span>
              </span>
            </div>
            <div className="mt-auto flex justify-end pt-3">
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={project.joinRequestStatus === 'pending'} onClick={() => onRequestJoin(project)}>
                <Plus className="h-3.5 w-3.5" />
                {project.joinRequestStatus === 'pending' ? W.joinable.alreadyApplied : W.joinable.apply}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PreviewEntry({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <Button unstyled
      type="button"
      disabled={!enabled}
      className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
      data-testid="workspace-preview-entry"
    >
      <span className="flex min-w-0 items-center gap-3">
        <BookOpen className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate text-sm text-slate-700">{W.preview.question}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600">
        {W.preview.entry}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Button>
  )
}

export function StartUsingCard({
  userDisplayName,
  onCreateCompany,
  creatingCompany = false,
  onJoinCompany,
  onOpenPreview,
}: {
  userDisplayName: string
  onCreateCompany: () => void
  creatingCompany?: boolean
  onJoinCompany: () => void
  onOpenPreview: () => void
}) {
  return (
    <Card variant="surface" className="w-full max-w-md">
      <CardContent padding="lg" className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[var(--el-2)]">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{`${W.start.welcomePrefix}，${userDisplayName}`}</h1>
          <p className="text-sm text-slate-500">{W.start.subtitle}</p>
        </div>
        <div className="grid gap-3">
          <Button className="h-12 rounded-lg gap-2" loading={creatingCompany} onClick={onCreateCompany}>
            <Building2 className="h-4 w-4" />
            {W.start.createCompany}
          </Button>
          <Button variant="outline" className="h-12 rounded-lg gap-2" onClick={onJoinCompany}>
            <UserPlus className="h-4 w-4" />
            {W.start.joinCompany}
          </Button>
        </div>
        <Button variant="link" className="mx-auto text-sm text-slate-500" onClick={onOpenPreview}>{W.preview.open}</Button>
      </CardContent>
    </Card>
  )
}

export function EmptyProjectsCard({
  companyName,
  hasJoinable,
  onBrowseJoinable,
  onOpenPreview,
}: {
  companyName: string
  hasJoinable: boolean
  onBrowseJoinable: () => void
  onOpenPreview: () => void
}) {
  return (
    <Card variant="ghost" className="mx-auto w-full max-w-2xl border-dashed">
      <CardContent padding="lg" className="flex flex-col items-center gap-5 text-center">
        <FolderOpen className="h-12 w-12 text-slate-300" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{W.emptyProjects.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{`${W.emptyProjects.descriptionPrefix} ${companyName}，${W.emptyProjects.descriptionSuffix}`}</p>
          <p className="mt-1 text-sm text-slate-500">{W.emptyProjects.hint}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" disabled={!hasJoinable} onClick={onBrowseJoinable}>{W.emptyProjects.browse}</Button>
          <Button variant="ghost" onClick={onOpenPreview}>{W.preview.open}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectFilterSelect({
  label,
  value,
  values,
  format,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  format?: (value: string) => string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[7.5rem] rounded-lg bg-white text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{W.filters.all}{label}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>{format ? format(item) : item}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ProjectQuickCard({
  project,
  onProjectClick,
  prominent = false,
}: {
  project: WorkspaceProject
  onProjectClick: (projectId: string) => void
  prominent?: boolean
}) {
  const progress = Math.max(0, Math.min(100, project.progress ?? 0))

  return (
    <Button unstyled
      type="button"
      className={cn(
        'flex h-[168px] w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[var(--el-1)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[var(--el-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0',
        prominent && 'h-[190px]',
      )}
      onClick={() => onProjectClick(project.id)}
    >
      <div className="min-h-14">
        <div className="line-clamp-2 text-base font-semibold leading-6 text-slate-900">{project.name}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{project.projectType || W.projectCard.project} · {project.stage || W.projectCard.unsetStage}</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ProjectCardMetric label={W.projectCard.healthScore} value={project.healthScore == null ? '--' : project.healthScore} className={scoreClass(project.healthScore)} />
        <ProjectCardMetric label={W.projectCard.progress} value={`${project.progress ?? 0}%`} />
        <ProjectCardMetric label={W.projectCard.criticalPath} value={project.criticalPathCount ?? 0} />
      </div>
      <div className="mt-3 h-1 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <RoleChip role={project.myRole} />
        <span className="truncate text-xs text-slate-500">{W.projectCard.recent} {formatDate(project.lastActivityAt)}</span>
      </div>
    </Button>
  )
}

function ProjectCardMetric({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="min-w-0">
      <div className={cn('truncate text-lg font-semibold tabular-nums text-slate-900', className)}>{value}</div>
      <div className="truncate text-xs text-slate-500">{label}</div>
    </div>
  )
}

function RoleChip({ role }: { role: string }) {
  const admin = role === 'company_admin'
  const owner = role === 'owner'
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 px-2 text-xs',
        admin || owner ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200',
      )}
    >
      {role === 'company_admin' ? W.roles.companyAdmin : getProjectRoleLabel(role)}
    </Badge>
  )
}

function SectionTitle({ title, count, secondary = false }: { title: string; count?: number; secondary?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className={cn('text-base font-semibold text-slate-900', secondary && 'text-slate-700')}>{title}</h2>
      {count != null ? <span className="text-sm text-slate-500">({count})</span> : null}
    </div>
  )
}
