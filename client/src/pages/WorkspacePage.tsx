// v1.4.20.1: Workspace page, the default landing for all users.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { useAuth } from '@/context/AuthContext'
import { toast } from '@/hooks/use-toast'
import { useAttentionSummary } from '@/hooks/useAttentionSummary'
import { useWorkspaceData } from '@/hooks/useWorkspaceData'
import type {
  JoinableProject,
  WorkspaceCompany,
  WorkspaceInvitation,
} from '@/hooks/useWorkspaceData'
import { zhCN } from '@/i18n/zh-CN'
import { getApiErrorMessage } from '@/lib/apiClient'
import {
  fetchV14231ActionableSurface,
  type V14231ActionableSurface,
} from '@/services/v14231ReadinessApi'
import {
  canShowWorkspaceGovernanceExecuteAction,
  WORKSPACE_ACTION_SURFACE_KEYS,
} from '@/services/v14231PageActionReadiness'
import {
  CompanyJoinDialog,
  CompanySwitcherDialog,
  InvitationConfirmDialog,
  RequestJoinSheet,
} from './workspace/WorkspaceDialogs'
import {
  ContextStrip,
  EmptyProjectsCard,
  JoinableSection,
  MyProjects,
  PendingPanel,
  PreviewEntry,
  QuickMetricRow,
  RecentProjects,
  StartUsingCard,
} from './workspace/WorkspaceSections'

const W = zhCN.workspace

function isCompanyAdmin(company: WorkspaceCompany | null) {
  return company?.role === 'company_admin'
}

export function WorkspacePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const workspace = useWorkspaceData()
  const attention = useAttentionSummary(null, workspace.currentCompany?.id ?? null)
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'accept'; invitation: WorkspaceInvitation }
    | { type: 'decline'; invitation: WorkspaceInvitation }
    | null
  >(null)
  const [joinProject, setJoinProject] = useState<JoinableProject | null>(null)
  const [companyJoinOpen, setCompanyJoinOpen] = useState(false)
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [workspaceActionSurfaces, setWorkspaceActionSurfaces] = useState<Record<string, V14231ActionableSurface>>({})

  useEffect(() => {
    let mounted = true
    const keys = [
      WORKSPACE_ACTION_SURFACE_KEYS.progressEntry,
      WORKSPACE_ACTION_SURFACE_KEYS.governancePredictionExecute,
    ]
    Promise.all(keys.map(async (key) => {
      try {
        return { key, surface: await fetchV14231ActionableSurface(key) }
      } catch {
        return { key, surface: null }
      }
    })).then((results) => {
      if (!mounted) return
      setWorkspaceActionSurfaces(Object.fromEntries(
        results.flatMap((result) => result.surface ? [[result.key, result.surface]] : []),
      ))
    })
    return () => {
      mounted = false
    }
  }, [])

  const userDisplayName = user?.display_name || user?.username || W.fallbackUser
  const pendingJoinRequests = workspace.joinRequests.filter((request) => request.status === 'pending')
  const shouldShowQuickMetrics = !(
    workspace.myProjects.length === 1
    && workspace.pendingInvitations.length === 0
    && pendingJoinRequests.length === 0
    && workspace.joinableProjects.length === 0
  )
  const progressProject = workspace.recentProjects[0] ?? workspace.myProjects[0] ?? null
  const progressActionSurface = workspaceActionSurfaces[WORKSPACE_ACTION_SURFACE_KEYS.progressEntry]
  const governanceActionSurface = workspaceActionSurfaces[WORKSPACE_ACTION_SURFACE_KEYS.governancePredictionExecute]
  const governanceTodoExecutable = canShowWorkspaceGovernanceExecuteAction({
    surface: governanceActionSurface,
    hasBackendCommand: false,
    hasPermission: false,
    hasFailureSemantics: false,
    hasIdempotency: false,
    hasSourceIdentity: false,
  })

  const handleProjectClick = useCallback((projectId: string) => {
    navigate(`/projects/${projectId}/dashboard`)
  }, [navigate])

  const handleJumpToSection = useCallback((sectionId: string) => {
    const target = document.getElementById(sectionId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    void workspace.refresh()
    toast({ title: W.noTargetTitle, description: W.noTargetDescription })
  }, [workspace])

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<void>,
    options?: { rethrow?: boolean },
  ) => {
    setActionKey(key)
    try {
      await action()
    } catch (error) {
      toast({
        title: W.operationFailed,
        description: getApiErrorMessage(error, W.retryLater),
        variant: 'destructive',
      })
      if (options?.rethrow) throw error
    } finally {
      setActionKey(null)
    }
  }, [])

  const handleConfirmInvitation = useCallback(async () => {
    if (!confirmAction) return
    const { invitation, type } = confirmAction
    await runAction(`${type}:${invitation.id}`, async () => {
      if (type === 'accept') {
        const result = await workspace.acceptInvitation(invitation.id)
        toast({ title: W.invitationAccepted, description: invitation.projectName || W.invitationHandled })
        if (result.projectId) navigate(`/projects/${result.projectId}/dashboard`)
      } else {
        await workspace.declineInvitation(invitation.id)
        toast({ title: W.invitationDeclined, description: invitation.projectName || W.invitationHandled })
      }
      setConfirmAction(null)
    })
  }, [confirmAction, navigate, runAction, workspace])

  const handleCreateCompany = useCallback(() => {
    const defaultName = userDisplayName && userDisplayName !== W.fallbackUser
      ? `${userDisplayName}的公司`
      : '我的公司'

    void runAction('create-company', async () => {
      const result = await workspace.createCompany(defaultName)
      toast({
        title: W.start.createCompany,
        description: result.name || defaultName,
      })
    })
  }, [runAction, userDisplayName, workspace])

  if (workspace.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" data-testid="workspace-loading">
        <LoadingState label={W.loading} />
      </div>
    )
  }

  if (workspace.error) {
    return (
      <div className="page-shell py-8" data-testid="workspace-error">
        <Card variant="surface" className="border-rose-200 bg-rose-50/60">
          <CardContent padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-rose-900">{W.loadFailedTitle}</p>
              <p className="mt-1 text-sm text-rose-700">{workspace.error.message || W.loadFailedDescription}</p>
            </div>
            <Button variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-100" onClick={() => { void workspace.refresh() }}>
              <RefreshCw className="h-4 w-4" />
              {W.reload}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!workspace.hasCompany && workspace.emptyStateReason === 'no_company') {
    return (
      <div className="flex min-h-[72vh] items-center justify-center px-4" data-testid="workspace-no-company">
        <StartUsingCard
          userDisplayName={userDisplayName}
          onCreateCompany={handleCreateCompany}
          creatingCompany={actionKey === 'create-company'}
          onJoinCompany={() => setCompanyJoinOpen(true)}
          onOpenPreview={() => navigate('/demo')}
        />
        <CompanyJoinDialog
          open={companyJoinOpen}
          onOpenChange={setCompanyJoinOpen}
          onJoined={workspace.refresh}
        />
      </div>
    )
  }

  if (workspace.emptyStateReason === 'no_project_membership') {
    return (
      <div className="page-shell page-enter space-y-6 py-6" data-testid="workspace-empty-projects">
        <ContextStrip
          userDisplayName={userDisplayName}
          currentCompany={workspace.currentCompany}
          switchableCompanies={workspace.switchableCompanies}
          onOpenCompanySwitcher={() => setCompanySwitcherOpen(true)}
        />
        <EmptyProjectsCard
          companyName={workspace.currentCompany?.name || W.currentCompany}
          hasJoinable={workspace.joinableProjects.length > 0}
          onBrowseJoinable={() => handleJumpToSection('workspace-joinable')}
          onOpenPreview={() => navigate('/demo')}
        />
        <PendingPanel
          invitations={workspace.pendingInvitations}
          joinRequests={workspace.joinRequests}
          actionKey={actionKey}
          onAcceptInvitation={(invitation) => setConfirmAction({ type: 'accept', invitation })}
          onDeclineInvitation={(invitation) => setConfirmAction({ type: 'decline', invitation })}
        />
        <JoinableSection
          projects={workspace.joinableProjects}
          onRequestJoin={setJoinProject}
        />
        <PreviewEntry enabled={Boolean(workspace.demoEntry?.available ?? true)} onClick={() => navigate('/demo')} />
        <CompanySwitcherDialog
          open={companySwitcherOpen}
          companies={workspace.switchableCompanies}
          actionKey={actionKey}
          onOpenChange={setCompanySwitcherOpen}
          onSwitch={(companyId) => runAction(`switch:${companyId}`, async () => {
            await workspace.switchCompany(companyId)
            setCompanySwitcherOpen(false)
          })}
        />
        <RequestJoinSheet
          project={joinProject}
          submitting={actionKey === `join:${joinProject?.id}`}
          onClose={() => setJoinProject(null)}
          onSubmit={(projectId, reason) => runAction(`join:${projectId}`, async () => {
            await workspace.requestJoinProject(projectId, reason)
            setJoinProject(null)
            toast({ title: W.joinRequestSubmitted, description: W.joinRequestSubmittedDescription })
          }, { rethrow: true })}
        />
        <InvitationConfirmDialog
          action={confirmAction}
          loading={Boolean(confirmAction && actionKey === `${confirmAction.type}:${confirmAction.invitation.id}`)}
          onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
          onConfirm={handleConfirmInvitation}
        />
      </div>
    )
  }

  return (
    <div className="page-shell page-enter space-y-6 py-6 pb-12" data-testid="workspace-normal">
      <ContextStrip
        userDisplayName={userDisplayName}
        currentCompany={workspace.currentCompany}
        switchableCompanies={workspace.switchableCompanies}
        onOpenCompanySwitcher={() => setCompanySwitcherOpen(true)}
      />

      <section
        data-testid="workspace-action-readiness"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--el-1)]"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">待办与提醒</h2>
          </div>
          <Badge data-testid="workspace-attention-read-status" variant="outline">
            {attention.error ? '读取失败' : attention.loading ? '读取中' : '已加载'}
          </Badge>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white px-4 py-3">
            <p className="text-xs text-slate-500">未读提醒</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{attention.summary.unreadNotificationCount}</p>
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-xs text-slate-500">今日待办</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{attention.summary.todayTodoCount}</p>
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-xs text-slate-500">工作区待处理</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{attention.summary.workspacePendingCount}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/notifications')}>
              <Bell className="h-4 w-4" />
              查看提醒
            </Button>
            {progressProject ? (
              <Button
                type="button"
                size="sm"
                data-action-readiness={progressActionSurface?.status ?? 'display-only'}
                onClick={() => navigate(`/projects/${progressProject.id}/gantt`)}
              >
                <ClipboardCheck className="h-4 w-4" />
                录入进度
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="h-4 w-4" />
            <span>治理 / 预测待办</span>
            <Badge
              data-testid="workspace-governance-action-status"
              variant={governanceTodoExecutable ? 'default' : 'secondary'}
            >
              {governanceActionSurface?.status ?? 'display-only'}
            </Badge>
          </div>
        </div>
      </section>

      {shouldShowQuickMetrics ? (
        <QuickMetricRow
          myProjectsCount={workspace.myProjects.length}
          pendingInvitationsCount={workspace.pendingInvitations.length}
          joinRequestsCount={pendingJoinRequests.length}
          joinableProjectsCount={workspace.joinableProjects.length}
          onJumpToSection={handleJumpToSection}
        />
      ) : null}

      {!shouldShowQuickMetrics ? null : (
        <RecentProjects projects={workspace.recentProjects.length > 0 ? workspace.recentProjects : workspace.myProjects.slice(0, 3)} onProjectClick={handleProjectClick} />
      )}

      <MyProjects
        myProjects={workspace.myProjects}
        companyProjects={workspace.companyProjects}
        isAdmin={isCompanyAdmin(workspace.currentCompany)}
        singleProjectQuiet={!shouldShowQuickMetrics}
        onProjectClick={handleProjectClick}
      />

      <PendingPanel
        invitations={workspace.pendingInvitations}
        joinRequests={workspace.joinRequests}
        actionKey={actionKey}
        onAcceptInvitation={(invitation) => setConfirmAction({ type: 'accept', invitation })}
        onDeclineInvitation={(invitation) => setConfirmAction({ type: 'decline', invitation })}
      />

      <JoinableSection projects={workspace.joinableProjects} onRequestJoin={setJoinProject} />

      <PreviewEntry enabled={Boolean(workspace.demoEntry?.available ?? true)} onClick={() => navigate('/demo')} />

      <CompanySwitcherDialog
        open={companySwitcherOpen}
        companies={workspace.switchableCompanies}
        actionKey={actionKey}
        onOpenChange={setCompanySwitcherOpen}
        onSwitch={(companyId) => runAction(`switch:${companyId}`, async () => {
          await workspace.switchCompany(companyId)
          setCompanySwitcherOpen(false)
          toast({ title: W.companySwitched })
        })}
      />
      <RequestJoinSheet
        project={joinProject}
        submitting={actionKey === `join:${joinProject?.id}`}
        onClose={() => setJoinProject(null)}
        onSubmit={(projectId, reason) => runAction(`join:${projectId}`, async () => {
          await workspace.requestJoinProject(projectId, reason)
          setJoinProject(null)
          toast({ title: W.joinRequestSubmitted, description: W.joinRequestSubmittedDescription })
        }, { rethrow: true })}
      />
      <InvitationConfirmDialog
        action={confirmAction}
        loading={Boolean(confirmAction && actionKey === `${confirmAction.type}:${confirmAction.invitation.id}`)}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        onConfirm={handleConfirmInvitation}
      />
    </div>
  )
}

export default WorkspacePage
