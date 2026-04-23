import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToastAction } from '@/components/ui/toast'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useUpdateProject } from '@/hooks/useStore'
import { getApiErrorMessage, getAuthHeaders } from '@/lib/apiClient'
import { dispatchProjectAccessOverride } from '@/lib/projectAccessEvents'
import { toast } from '@/hooks/use-toast'
import { getGlobalRoleLabel, getProjectRoleLabel, normalizeGlobalRole, normalizeProjectPermissionLevel, type GlobalRole, type ProjectPermissionLevel } from '@/lib/roleLabels'
import { CheckCircle2, Copy, Crown, KeyRound, Link2, Trash2, UserPlus, Users } from 'lucide-react'

interface AccessSummary {
  projectId: string
  permissionLevel: ProjectPermissionLevel
  globalRole: GlobalRole
  canManageTeam: boolean
  canEdit: boolean
}

interface MemberInfo {
  id: string
  userId: string
  username: string
  displayName: string
  email?: string | null
  globalRole?: string | null
  permissionLevel: string
  joinedAt?: string | null
  lastActivity?: string | null
}

interface InvitationInfo {
  id: string
  projectId?: string
  projectName?: string | null
  invitationCode?: string
  invitation_code?: string
  permissionLevel?: string
  permission_level?: string
  createdAt?: string | null
  created_at?: string | null
  expiresAt?: string | null
  expires_at?: string | null
  isRevoked?: boolean
  is_revoked?: boolean
  usedCount?: number
  used_count?: number
  maxUses?: number | null
  max_uses?: number | null
}

interface UnlinkedAssigneeInfo {
  assigneeName: string
  taskCount: number
  taskIds: string[]
  sampleTaskTitles: string[]
}

interface Props {
  projectId: string
  projectName?: string | null
  layout?: 'page' | 'drawer'
  onClose?: () => void
}

function formatDateTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function readInvitationCode(item: InvitationInfo) {
  return item.invitationCode || item.invitation_code || ''
}

function readInvitationPermission(item: InvitationInfo) {
  return normalizeProjectPermissionLevel(item.permissionLevel || item.permission_level)
}

function readInvitationRevoked(item: InvitationInfo) {
  return Boolean(item.isRevoked ?? item.is_revoked)
}

function readInvitationUsedCount(item: InvitationInfo) {
  return Number(item.usedCount ?? item.used_count ?? 0)
}

function readInvitationMaxUses(item: InvitationInfo) {
  const value = item.maxUses ?? item.max_uses ?? null
  return value == null ? null : Number(value)
}

function normalizeMatchName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function findSuggestedMember(members: MemberInfo[], assigneeName: string) {
  const target = normalizeMatchName(assigneeName)
  if (!target) return null
  return (
    members.find((member) => normalizeMatchName(member.displayName) === target)
    || members.find((member) => normalizeMatchName(member.username) === target)
    || null
  )
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const requestHeaders = {
    ...getAuthHeaders(),
    ...(init?.headers || {}),
  }
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: requestHeaders,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error?.message || `请求失败 (${response.status})`)
  }
  return payload as T
}

export function ProjectTeamManagementPanel({ projectId, projectName, layout = 'drawer', onClose }: Props) {
  const updateProject = useUpdateProject()
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState<AccessSummary | null>(null)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [invitations, setInvitations] = useState<InvitationInfo[]>([])
  const [unlinkedAssignees, setUnlinkedAssignees] = useState<UnlinkedAssigneeInfo[]>([])
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'members' | 'pending-links' | 'invitations'>('members')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [invitationDialogOpen, setInvitationDialogOpen] = useState(false)
  const [passwordReveal, setPasswordReveal] = useState<{ username: string; temporaryPassword: string } | null>(null)
  const [memberForm, setMemberForm] = useState({ username: '', permissionLevel: 'editor' as ProjectPermissionLevel })
  const [invitationForm, setInvitationForm] = useState({ permissionLevel: 'editor' as ProjectPermissionLevel, maxUses: '', expiresAt: '' })
  const { confirmDialog, closeConfirm, openConfirm } = useConfirmDialog()

  const loadTeamState = useCallback(async () => {
    setLoading(true)
    try {
      const accessResponse = await requestJson<{ success: boolean; data: AccessSummary }>(`/api/members/${projectId}/me`)
      const nextAccess = {
        ...accessResponse.data,
        permissionLevel: normalizeProjectPermissionLevel(accessResponse.data.permissionLevel),
        globalRole: normalizeGlobalRole(accessResponse.data.globalRole),
      }
      setAccess(nextAccess)

      const membersResponse = await requestJson<{ success: boolean; members: MemberInfo[] }>(`/api/members/${projectId}`)
      const nextMembers = (membersResponse.members || []).map((item) => ({
        ...item,
        permissionLevel: normalizeProjectPermissionLevel(item.permissionLevel),
        globalRole: normalizeGlobalRole(item.globalRole),
      }))
      setMembers(nextMembers)

      if (nextAccess.canManageTeam) {
        const [invitationResponse, unlinkedResponse] = await Promise.all([
          requestJson<{ success: boolean; data: InvitationInfo[] }>(
            `/api/invitations?projectId=${encodeURIComponent(projectId)}`,
          ),
          requestJson<{ success: boolean; data: UnlinkedAssigneeInfo[] }>(
            `/api/members/${projectId}/unlinked-assignees`,
          ),
        ])
        setInvitations(invitationResponse.data || [])
        setUnlinkedAssignees(unlinkedResponse.data || [])
      } else {
        setInvitations([])
        setUnlinkedAssignees([])
      }
    } catch (error) {
      toast({ title: '团队信息加载失败', description: getApiErrorMessage(error, '请刷新页面后重试'), variant: 'destructive' })
      setAccess(null)
      setMembers([])
      setInvitations([])
      setUnlinkedAssignees([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadTeamState()
  }, [loadTeamState])

  const canManageTeam = Boolean(access?.canManageTeam)
  const canResetPassword = access?.globalRole === 'company_admin'
  const activeInvitationCount = useMemo(() => invitations.filter((item) => !readInvitationRevoked(item)).length, [invitations])

  useEffect(() => {
    setLinkSelections((current) => {
      const next = { ...current }
      for (const row of unlinkedAssignees) {
        if (next[row.assigneeName]) continue
        const suggestedMember = findSuggestedMember(members, row.assigneeName)
        if (suggestedMember) {
          next[row.assigneeName] = suggestedMember.userId
        }
      }
      return next
    })
  }, [members, unlinkedAssignees])

  const linkAssignee = useCallback(async (assigneeName: string, userId: string) => {
    if (!assigneeName || !userId) return
    setBusyKey(`link:${assigneeName}`)
    try {
      const response = await requestJson<{ success: boolean; linkedTaskCount: number; message?: string }>(
        `/api/members/${projectId}/link-assignee`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeName, userId }),
        },
      )
      toast({
        title: '责任人账号已关联',
        description: response.linkedTaskCount > 0
          ? `已将 ${response.linkedTaskCount} 条任务关联到所选项目成员。`
          : '没有找到待关联的任务。',
      })
      await loadTeamState()
    } catch (error) {
      toast({ title: '关联责任人失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
    } finally {
      setBusyKey(null)
    }
  }, [loadTeamState, projectId])

  const linkSuggestedMatches = useCallback(async (userId: string, suggestions: UnlinkedAssigneeInfo[]) => {
    for (const item of suggestions) {
      await linkAssignee(item.assigneeName, userId)
    }
  }, [linkAssignee])

  const createInvitation = async () => {
    setBusyKey('create-invitation')
    try {
      const response = await requestJson<{ success: boolean; data: InvitationInfo }>('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          permission_level: invitationForm.permissionLevel,
          max_uses: invitationForm.maxUses ? Number(invitationForm.maxUses) : null,
          expires_at: invitationForm.expiresAt || null,
        }),
      })
      setInvitations((current) => [response.data, ...current])
      const invitationCode = readInvitationCode(response.data)
      if (invitationCode) {
        updateProject(projectId, { primary_invitation_code: invitationCode })
      }
      setInvitationDialogOpen(false)
      setInvitationForm({ permissionLevel: 'editor', maxUses: '', expiresAt: '' })
      toast({ title: '邀请码已生成', description: `邀请码 ${readInvitationCode(response.data)} 可立即使用` })
    } catch (error) {
      toast({ title: '生成邀请码失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
    } finally {
      setBusyKey(null)
    }
  }

  const addMember = async () => {
    if (!memberForm.username.trim()) return
    setBusyKey('add-member')
    try {
      const response = await requestJson<{
        success: boolean
        member?: MemberInfo | null
        suggestedMatches?: UnlinkedAssigneeInfo[]
      }>(`/api/members/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: memberForm.username.trim(), permission_level: memberForm.permissionLevel }),
      })
      setMemberDialogOpen(false)
      setMemberForm({ username: '', permissionLevel: 'editor' })
      const suggestedMatches = response.suggestedMatches || []
      const linkedMemberUserId = response.member?.userId
      const matchedTaskCount = suggestedMatches.reduce((sum, item) => sum + item.taskCount, 0)

      toast({
        title: '成员已加入项目',
        description: matchedTaskCount > 0
          ? `系统发现 ${matchedTaskCount} 条待关联任务，可立即将责任人挂到该成员账号。`
          : undefined,
        action: matchedTaskCount > 0 && linkedMemberUserId ? (
          <ToastAction altText="立即关联" onClick={() => void linkSuggestedMatches(linkedMemberUserId, suggestedMatches)}>
            立即关联
          </ToastAction>
        ) : undefined,
      })
      await loadTeamState()
    } catch (error) {
      toast({ title: '添加成员失败', description: getApiErrorMessage(error, '请检查用户名后重试'), variant: 'destructive' })
    } finally {
      setBusyKey(null)
    }
  }

  const updateMemberPermission = async (member: MemberInfo, permissionLevel: ProjectPermissionLevel) => {
    setBusyKey(`member:${member.userId}:permission`)
    try {
      await requestJson(`/api/members/${projectId}/${member.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_level: permissionLevel }),
      })
      toast({ title: '成员权限已更新', description: `${member.displayName || member.username} 已调整为 ${getProjectRoleLabel(permissionLevel)}` })
      await loadTeamState()
    } catch (error) {
      toast({ title: '调整成员权限失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
    } finally {
      setBusyKey(null)
    }
  }

  const transferOwner = async (member: MemberInfo) => {
    openConfirm(
      '转让项目负责人',
      `确认将项目负责人转让给“${member.displayName || member.username}”吗？`,
      async () => {
        setBusyKey(`member:${member.userId}:transfer`)
        try {
          await requestJson(`/api/members/${projectId}/transfer-owner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId: member.userId }),
          })
          updateProject({ id: projectId, owner_id: member.userId })
          dispatchProjectAccessOverride({
            projectId,
            permissionLevel: 'editor',
            canManageTeam: false,
            canEdit: true,
          })
          toast({ title: '项目负责人已转让' })
          await loadTeamState()
          onClose?.()
        } catch (error) {
          toast({ title: '转让负责人失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
        } finally {
          setBusyKey(null)
        }
      },
    )
  }

  const removeMember = async (member: MemberInfo) => {
    openConfirm(
      '移除项目成员',
      `确认移除“${member.displayName || member.username}”吗？`,
      async () => {
        setBusyKey(`member:${member.userId}:remove`)
        try {
          await requestJson(`/api/members/${projectId}/${member.userId}`, { method: 'DELETE' })
          toast({ title: '成员已移除' })
          await loadTeamState()
        } catch (error) {
          toast({ title: '移除成员失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
        } finally {
          setBusyKey(null)
        }
      },
    )
  }

  const revokeInvitation = async (item: InvitationInfo) => {
    openConfirm(
      '撤销邀请码',
      `确认撤销邀请码 ${readInvitationCode(item)} 吗？`,
      async () => {
        setBusyKey(`invitation:${item.id}:revoke`)
        try {
          await requestJson(`/api/invitations/${item.id}`, { method: 'DELETE' })
          setInvitations((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRevoked: true, is_revoked: true } : entry)))
          toast({ title: '邀请码已撤销' })
        } catch (error) {
          toast({ title: '撤销邀请码失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
        } finally {
          setBusyKey(null)
        }
      },
    )
  }

  const resetPassword = async (member: MemberInfo) => {
    setBusyKey(`member:${member.userId}:password`)
    try {
      const response = await requestJson<{ success: boolean; data: { temporaryPassword: string } }>(`/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: member.username }),
      })
      setPasswordReveal({ username: member.username, temporaryPassword: response.data.temporaryPassword })
    } catch (error) {
      toast({ title: '重置密码失败', description: getApiErrorMessage(error, '请确认当前账号具备公司管理员权限'), variant: 'destructive' })
    } finally {
      setBusyKey(null)
    }
  }

  if (loading) {
    return <LoadingState label="团队信息加载中" description="正在同步成员、角色和邀请码" className={layout === 'drawer' ? 'min-h-[320px] border-0 bg-transparent shadow-none' : undefined} />
  }

  return (
    <div className="space-y-6" data-testid="team-management-panel">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">团队管理</div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">{projectName || '当前项目'} 的成员与权限</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={access?.globalRole === 'company_admin' ? 'default' : 'secondary'}>{getGlobalRoleLabel(access?.globalRole)}</Badge>
              <Badge variant={access?.permissionLevel === 'owner' ? 'default' : access?.permissionLevel === 'editor' ? 'secondary' : 'outline'}>{getProjectRoleLabel(access?.permissionLevel)}</Badge>
            </div>
          </div>
          {canManageTeam ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMemberDialogOpen(true)} data-testid="team-management-add-member"><UserPlus className="h-4 w-4" />添加成员</Button>
              <Button onClick={() => setInvitationDialogOpen(true)} data-testid="team-management-create-invitation"><Users className="h-4 w-4" />生成邀请码</Button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Card className="rounded-2xl border-slate-200 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">公司级角色</CardTitle></CardHeader><CardContent className="text-sm text-slate-700">{getGlobalRoleLabel(access?.globalRole)}</CardContent></Card>
          <Card className="rounded-2xl border-slate-200 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">项目级角色</CardTitle></CardHeader><CardContent className="text-sm text-slate-700">{getProjectRoleLabel(access?.permissionLevel)}</CardContent></Card>
          <Card className="rounded-2xl border-slate-200 shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">当前状态</CardTitle></CardHeader><CardContent className="space-y-1 text-sm text-slate-700"><div>项目成员 {members.length} 人</div><div>有效邀请码 {activeInvitationCount} 个</div><div>密码重置 {canResetPassword ? '已启用' : '未启用'}</div></CardContent></Card>
        </div>
      </div>

      {!canManageTeam ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前账号不是项目负责人，因此这里仅展示成员列表，不显示成员管理与邀请码操作入口。
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-2 sm:grid-cols-3">
          <TabsTrigger value="members" data-testid="team-management-tab-members">团队成员</TabsTrigger>
          <TabsTrigger value="pending-links" data-testid="team-management-tab-pending-links">待关联责任人</TabsTrigger>
          <TabsTrigger value="invitations" disabled={!canManageTeam} data-testid="team-management-tab-invitations">邀请码</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-0">
          <Card className="rounded-3xl border-slate-200 shadow-none">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-base text-slate-900">成员列表</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">暂无项目成员</div>
              ) : members.map((member) => {
                const memberPermission = normalizeProjectPermissionLevel(member.permissionLevel)
                const rowBusyPrefix = `member:${member.userId}`

                return (
                  <div key={member.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center" data-testid={`team-management-member-row-${member.id}`}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {(member.displayName || member.username || '?').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{member.displayName || member.username}</div>
                        <Badge variant={memberPermission === 'owner' ? 'default' : memberPermission === 'editor' ? 'secondary' : 'outline'}>
                          {getProjectRoleLabel(memberPermission)}
                        </Badge>
                        <Badge variant={normalizeGlobalRole(member.globalRole) === 'company_admin' ? 'secondary' : 'outline'}>
                          {getGlobalRoleLabel(member.globalRole)}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-500">
                        {member.username}
                        {member.email ? ` · ${member.email}` : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        加入时间 {formatDateTime(member.joinedAt)} · 最近活跃 {formatDateTime(member.lastActivity)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canManageTeam && memberPermission !== 'owner' ? (
                        <>
                          {memberPermission !== 'editor' ? (
                            <Button variant="outline" size="sm" loading={busyKey === `${rowBusyPrefix}:permission`} onClick={() => updateMemberPermission(member, 'editor')}>
                              设为编辑
                            </Button>
                          ) : null}
                          {memberPermission !== 'viewer' ? (
                            <Button variant="outline" size="sm" loading={busyKey === `${rowBusyPrefix}:permission`} onClick={() => updateMemberPermission(member, 'viewer')}>
                              设为只读
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" loading={busyKey === `${rowBusyPrefix}:transfer`} onClick={() => transferOwner(member)}>
                            <Crown className="h-4 w-4" />
                            转让负责人
                          </Button>
                          <Button variant="outline" size="sm" className="text-rose-600" loading={busyKey === `${rowBusyPrefix}:remove`} onClick={() => removeMember(member)}>
                            <Trash2 className="h-4 w-4" />
                            移除
                          </Button>
                        </>
                      ) : null}
                      {canResetPassword ? (
                        <Button variant="outline" size="sm" loading={busyKey === `${rowBusyPrefix}:password`} onClick={() => resetPassword(member)}>
                          <KeyRound className="h-4 w-4" />
                          重置密码
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-links" className="mt-0">
          <Card className="rounded-3xl border-slate-200 shadow-none">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-base text-slate-900">待关联责任人</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {unlinkedAssignees.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    所有责任人均已关联账号
                  </div>
                  <div className="mt-2 text-emerald-700">后续新增成员时，如果发现同名责任人，系统也会给出自动关联提示。</div>
                </div>
              ) : (
                unlinkedAssignees.map((item) => {
                  const selectedUserId = linkSelections[item.assigneeName] || ''
                  const suggestedMember = findSuggestedMember(members, item.assigneeName)

                  return (
                    <div key={item.assigneeName} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="pending-assignee-row">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900">{item.assigneeName}</div>
                            <Badge variant="secondary">{item.taskCount} 条任务</Badge>
                            {suggestedMember ? <Badge variant="outline">已识别候选成员：{suggestedMember.displayName}</Badge> : null}
                          </div>
                          <div className="text-sm text-slate-500">
                            示例任务：{item.sampleTaskTitles.length > 0 ? item.sampleTaskTitles.join('、') : '暂无标题样例'}
                          </div>
                        </div>
                        <div className="flex w-full flex-col gap-2 lg:w-[320px]">
                          <Select
                            value={selectedUserId}
                            onValueChange={(value) => setLinkSelections((current) => ({ ...current, [item.assigneeName]: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择要关联的项目成员" />
                            </SelectTrigger>
                            <SelectContent>
                              {members.map((member) => (
                                <SelectItem key={member.userId} value={member.userId}>
                                  {member.displayName || member.username}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => void linkAssignee(item.assigneeName, selectedUserId)}
                            disabled={!selectedUserId}
                            loading={busyKey === `link:${item.assigneeName}`}
                          >
                            <Link2 className="h-4 w-4" />
                            关联到所选成员
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-0">
          {canManageTeam ? (
            <Card className="rounded-3xl border-slate-200 shadow-none">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-base text-slate-900">邀请码管理</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                {invitations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">暂无邀请码，创建后即可通过链接邀请成员加入项目。</div>
                ) : invitations.map((item) => {
                  const revoked = readInvitationRevoked(item)
                  return (
                    <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center" data-testid={`team-management-invitation-row-${item.id}`}>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-mono text-base font-semibold tracking-wide text-slate-900">{readInvitationCode(item)}</div>
                          <Badge variant={revoked ? 'destructive' : 'secondary'}>{revoked ? '已撤销' : '可使用'}</Badge>
                          <Badge variant="outline">{getProjectRoleLabel(readInvitationPermission(item))}</Badge>
                        </div>
                        <div className="text-sm text-slate-500">
                          已使用 {readInvitationUsedCount(item)} 次
                          {readInvitationMaxUses(item) != null ? ` / 最多 ${readInvitationMaxUses(item)} 次` : ' / 不限次数'}
                          {' · '}
                          创建于 {formatDateTime(item.createdAt ?? item.created_at)}
                          {item.expiresAt || item.expires_at ? ` · 过期时间 ${formatDateTime(item.expiresAt ?? item.expires_at)}` : ' · 永不过期'}
                        </div>
                      </div>
                      {!revoked ? (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={async () => {
                            await navigator.clipboard.writeText(`${window.location.origin}/#/join/${readInvitationCode(item)}`)
                            toast({ title: '邀请链接已复制' })
                          }}>
                            <Copy className="h-4 w-4" />
                            复制链接
                          </Button>
                          <Button variant="outline" size="sm" className="text-rose-600" loading={busyKey === `invitation:${item.id}:revoke`} onClick={() => revokeInvitation(item)}>
                            <Trash2 className="h-4 w-4" />
                            撤销
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent data-testid="team-management-add-member-dialog">
          <DialogHeader>
            <DialogTitle>添加项目成员</DialogTitle>
            <DialogDescription>输入已经注册的用户名，将成员直接加入当前项目。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-username">用户名</Label>
              <Input id="member-username" placeholder="请输入登录用户名" value={memberForm.username} onChange={(event) => setMemberForm((current) => ({ ...current, username: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>项目角色</Label>
              <Select value={memberForm.permissionLevel} onValueChange={(value) => setMemberForm((current) => ({ ...current, permissionLevel: normalizeProjectPermissionLevel(value) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">编辑成员</SelectItem>
                  <SelectItem value="viewer">只读成员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>取消</Button>
            <Button loading={busyKey === 'add-member'} onClick={addMember} disabled={!memberForm.username.trim()}>添加成员</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invitationDialogOpen} onOpenChange={setInvitationDialogOpen}>
        <DialogContent data-testid="team-management-create-invitation-dialog">
          <DialogHeader>
            <DialogTitle>生成邀请码</DialogTitle>
            <DialogDescription>创建一个加入项目的邀请链接，可设置项目角色、过期时间和最大使用次数。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>项目角色</Label>
              <Select value={invitationForm.permissionLevel} onValueChange={(value) => setInvitationForm((current) => ({ ...current, permissionLevel: normalizeProjectPermissionLevel(value) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">编辑成员</SelectItem>
                  <SelectItem value="viewer">只读成员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invitation-max-uses">最大使用次数</Label>
              <Input id="invitation-max-uses" type="number" min="1" placeholder="留空表示不限次数" value={invitationForm.maxUses} onChange={(event) => setInvitationForm((current) => ({ ...current, maxUses: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invitation-expires-at">过期时间</Label>
              <Input id="invitation-expires-at" type="datetime-local" value={invitationForm.expiresAt} onChange={(event) => setInvitationForm((current) => ({ ...current, expiresAt: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitationDialogOpen(false)}>取消</Button>
            <Button loading={busyKey === 'create-invitation'} onClick={createInvitation}>生成邀请码</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordReveal)} onOpenChange={(open) => !open && setPasswordReveal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>临时密码已生成</DialogTitle>
            <DialogDescription>临时密码属于敏感信息，只在这里展示一次，请通过安全方式转达给对应成员。</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">目标账号</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{passwordReveal?.username}</div>
            <div className="mt-4 text-sm text-slate-500">临时密码</div>
            <div className="mt-1 font-mono text-lg font-semibold tracking-[0.24em] text-slate-900">{passwordReveal?.temporaryPassword}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordReveal(null)}>关闭</Button>
            <Button onClick={async () => {
              if (!passwordReveal?.temporaryPassword) return
              await navigator.clipboard.writeText(passwordReveal.temporaryPassword)
              toast({ title: '临时密码已复制' })
            }}>
              <Copy className="h-4 w-4" />
              复制临时密码
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) closeConfirm()
        }}
        title={confirmDialog.title}
        description={confirmDialog.message}
        confirmLabel="确认执行"
        cancelLabel="取消"
        onConfirm={() => {
          closeConfirm()
          void confirmDialog.onConfirm()
        }}
        testId="team-management-confirm-dialog"
      />
    </div>
  )
}

export default ProjectTeamManagementPanel
