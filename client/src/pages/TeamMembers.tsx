import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { invitationDb, generateId, Invitation } from '@/lib/localDb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Plus, Users, Copy, Trash2, RefreshCw, UserPlus, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { realtimeService } from '@/lib/realtimeService'
import { TeamMembersSkeleton } from '@/components/ui/page-skeleton'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'

interface MemberInfo {
  id: string
  userId: string
  username: string
  displayName: string
  email?: string
  permissionLevel: string
  joinedAt: string
  lastActivity?: string
}

export default function TeamMembers() {
  const { id } = useParams<{ id: string }>()
  const { currentUser, invitations, setInvitations, addInvitation, revokeInvitation, currentProject, projects } = useStore()
  const { user } = useAuth()
  const { confirmDialog, setConfirmDialog, openConfirm } = useConfirmDialog()
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [formData, setFormData] = useState<{ permission_level: 'viewer' | 'editor' | 'admin'; max_uses: string; expires_at: string }>({ permission_level: 'editor', max_uses: '', expires_at: '' })
  const [addMemberForm, setAddMemberForm] = useState({ username: '', permission_level: 'editor' })
  const [addingMember, setAddingMember] = useState(false)
  const [members, setMembers] = useState<MemberInfo[]>([])

  // 加载邀请码
  const loadInvitations = useCallback(async () => {
    try {
      if (!id) {
        setInvitations([])
        return
      }
      const data = invitationDb.getByProject(id)
      setInvitations(data)
    } catch (e) {
      console.error('加载邀请码失败:', e)
      toast({ title: "加载失败", description: "请刷新页面重试", variant: "destructive" })
    }
    finally { setLoading(false) }
  }, [id, setInvitations])

  // 加载项目成员列表
  const loadMembers = useCallback(async () => {
    if (!id) return
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/members/${id}`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          setMembers(json.members || [])
        }
      }
    } catch (e) {
      console.error('加载成员列表失败:', e)
    } finally {
      setMembersLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) {
      loadInvitations()
      loadMembers()
    }
  }, [id, loadInvitations, loadMembers])

  const generateInvitation = async () => {
    if (!id) return
    try {
      const code = generateId().slice(0, 8)
      const newInvitation = {
        id: generateId(),
        project_id: id,
        invitation_code: code,
        permission_level: formData.permission_level,
        created_by: currentUser?.id,
        created_at: new Date().toISOString(),
        is_revoked: false,
        used_count: 0,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        expires_at: formData.expires_at || null,
      }

      invitationDb.create(newInvitation)
      addInvitation(newInvitation)

      // 同步到Supabase
      if (realtimeService.isReady()) {
        realtimeService.syncChange('invitations', 'INSERT', newInvitation, id).catch(console.error)
      }

      toast({ title: "邀请码已生成", description: `邀请码: ${code}` })
      setDialogOpen(false)
    } catch (e) {
      console.error('生成邀请码失败:', e)
      toast({ title: "生成失败", variant: "destructive" })
    }
  }

  const handleAddMember = async () => {
    if (!id || !addMemberForm.username.trim()) return
    setAddingMember(true)
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: addMemberForm.username.trim(),
          permission_level: addMemberForm.permission_level,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast({
          title: "添加成功",
          description: `已将 ${json.member?.displayName || json.member?.username || addMemberForm.username} 添加到项目`,
        })
        setAddMemberOpen(false)
        setAddMemberForm({ username: '', permission_level: 'editor' })
        loadMembers()
      } else {
        toast({ title: "添加失败", description: json.message || '请检查用户名是否正确', variant: "destructive" })
      }
    } catch {
      toast({ title: "添加失败", description: "网络错误，请稍后重试", variant: "destructive" })
    } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!id) return
    openConfirm('移除成员', `确定要将「${displayName}」从项目中移除吗？`, async () => {
      try {
        const res = await fetch(`/api/members/${id}/${userId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const json = await res.json()
        if (json.success) {
          toast({ title: "已移除", description: `已将 ${displayName} 从项目中移除` })
          loadMembers()
        } else {
          toast({ title: "移除失败", description: json.message, variant: "destructive" })
        }
      } catch {
        toast({ title: "移除失败", description: "网络错误", variant: "destructive" })
      }
    })
  }

  const handleRevoke = async (code: string) => {
    openConfirm('撤销邀请码', '确定要撤销这个邀请码吗？', () => {
      try {
        const invitation = invitationDb.getByCode(code)
        if (invitation) {
          invitationDb.update(invitation.id, { is_revoked: true })
          revokeInvitation(code)

          // 同步到Supabase
          if (realtimeService.isReady()) {
            realtimeService.syncChange('invitations', 'UPDATE', { id: invitation.id, is_revoked: true }, id).catch(console.error)
          }

          toast({ title: "邀请码已撤销" })
          loadInvitations()
        }
      } catch (e) {
        console.error('撤销邀请码失败:', e)
        toast({ title: "撤销失败", variant: "destructive" })
      }
    })
  }

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/#/join/${code}`
    await navigator.clipboard.writeText(url)
    toast({ title: "链接已复制", description: "已复制邀请链接到剪贴板" })
  }

  const activeInvitations = invitations.filter(i => !i.is_revoked)

  const getRoleLabel = (role?: string) => {
    if (!role) return '成员'
    switch (role) {
      case 'owner': return '所有者'
      case 'admin': return '管理员'
      case 'editor': return '编辑'
      case 'viewer': return '访客'
      default: return role
    }
  }

  const getRoleBadgeVariant = (role?: string) => {
    switch (role) {
      case 'owner':
      case 'admin':
        return 'default'
      case 'editor':
        return 'secondary'
      case 'viewer':
        return 'outline'
      default:
        return 'outline'
    }
  }

  if (loading) return <div className="p-6"><TeamMembersSkeleton /></div>

  return (
    <div className="space-y-6 page-enter">
      <Breadcrumb
        items={[
          { label: currentProject?.name || (projects?.find(p => p.id === id)?.name) || '项目', href: `/projects/${id}/dashboard` },
          { label: '辅助能力' },
          { label: '团队成员' },
        ]}
      />

      <PageHeader
        eyebrow="辅助能力"
        title="团队成员"
        subtitle="当前页只承接成员查看、邀请和移除，不占主导航，也不改变成员数据与权限逻辑。"
      >
        <Button variant="outline" onClick={() => setAddMemberOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          添加成员
        </Button>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          生成邀请码
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">项目成员</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">{members.length}</div>
            <p className="mt-1 text-xs text-slate-500">项目内当前可见成员数量</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">有效邀请码</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">{activeInvitations.length}</div>
            <p className="mt-1 text-xs text-slate-500">仍可用于加入项目的邀请码</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            项目成员
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {membersLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="font-medium text-slate-700">暂无成员</p>
              <p className="mt-1 text-sm">通过邀请码或直接添加来邀请团队成员</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map(m => (
                <div key={m.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 text-blue-700">
                    <span className="text-sm font-semibold">{(m.displayName || m.username || '?').charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-slate-900">{m.displayName || m.username}</div>
                      <Badge variant={getRoleBadgeVariant(m.permissionLevel)} className="capitalize">
                        {getRoleLabel(m.permissionLevel)}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-500">
                      {m.username !== m.displayName && <span>{m.username}</span>}
                      {m.email && <span>{m.username !== m.displayName ? ' · ' : ''}{m.email}</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      加入: {formatDateTime(m.joinedAt)}
                      {m.lastActivity && <span className="ml-3">最近活跃: {formatDateTime(m.lastActivity)}</span>}
                    </div>
                  </div>
                  {user && m.userId !== user.id && (
                    <Button variant="outline" size="sm" className="self-start text-destructive sm:self-center"
                      onClick={() => handleRemoveMember(m.userId, m.displayName || m.username)}>
                      移除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-5 w-5" />
            邀请码管理
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {invitations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-12 text-center text-muted-foreground">
              <RefreshCw className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="font-medium text-slate-700">暂无邀请码</p>
              <p className="mt-1 text-sm">先生成一个邀请码，再分享给需要加入项目的成员</p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>生成邀请码</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-mono text-base font-semibold text-slate-900">{inv.invitation_code}</div>
                      <Badge variant={inv.is_revoked ? 'destructive' : 'secondary'}>
                        {inv.is_revoked ? '已撤销' : '可使用'}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-500">
                      权限: {inv.permission_level === 'admin' ? '管理员' : inv.permission_level === 'editor' ? '编辑' : '访客'} ·
                      已使用: {inv.used_count} 次 ·
                      创建时间: {formatDateTime(inv.created_at)}
                      {inv.expires_at && ` · 过期: ${formatDateTime(inv.expires_at)}`}
                    </div>
                  </div>
                  <div className="flex gap-2 self-start sm:self-center">
                    {!inv.is_revoked && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => copyLink(inv.invitation_code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleRevoke(inv.invitation_code)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {inv.is_revoked && <span className="text-sm text-muted-foreground">已撤销</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 生成邀请码弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>生成邀请码</DialogTitle><DialogDescription>生成邀请码后，将链接发给被邀请人即可加入项目</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>权限级别</Label><Select value={formData.permission_level} onValueChange={(v: string) => setFormData({ ...formData, permission_level: v as 'viewer' | 'editor' | 'admin' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="viewer">访客</SelectItem><SelectItem value="editor">编辑</SelectItem><SelectItem value="admin">管理员</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>最大使用次数（留空不限制）</Label><Input type="number" value={formData.max_uses} onChange={e => setFormData({ ...formData, max_uses: e.target.value })} /></div>
            <div className="space-y-2"><Label>过期时间（留空永不过期）</Label><Input type="datetime-local" value={formData.expires_at} onChange={e => setFormData({ ...formData, expires_at: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={generateInvitation}><RefreshCw className="mr-2 h-4 w-4" />生成</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加成员弹窗 */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加成员</DialogTitle><DialogDescription>输入已注册用户的用户名，将其直接添加到项目中</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input
                placeholder="请输入用户的登录用户名"
                value={addMemberForm.username}
                onChange={e => setAddMemberForm({ ...addMemberForm, username: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                disabled={addingMember}
              />
              <p className="text-xs text-muted-foreground">用户必须已注册系统账号。如果对方尚未注册，请使用邀请码功能。</p>
            </div>
            <div className="space-y-2">
              <Label>权限级别</Label>
              <Select value={addMemberForm.permission_level} onValueChange={(v: string) => setAddMemberForm({ ...addMemberForm, permission_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">访客</SelectItem>
                  <SelectItem value="editor">编辑</SelectItem>
                  <SelectItem value="owner">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMemberOpen(false); setAddMemberForm({ username: '', permission_level: 'editor' }) }}>取消</Button>
            <Button onClick={handleAddMember} disabled={addingMember || !addMemberForm.username.trim()}>
              {addingMember ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />添加中...</> : <><UserPlus className="mr-2 h-4 w-4" />添加</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 通用确认弹窗 */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{confirmDialog.message}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => {
              setConfirmDialog(prev => ({ ...prev, open: false }))
              confirmDialog.onConfirm()
            }}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
