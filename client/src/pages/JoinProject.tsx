import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { useStore } from '@/hooks/useStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { LogIn, CheckCircle2, XCircle, Loader2, ArrowLeft, Users } from 'lucide-react'

type JoinStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'joined' | 'error'

interface InvitationInfo {
  id: string
  project_id: string
  project_name?: string
  role?: string
  permission_level?: string
  code: string
}

export default function JoinProject() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { openLoginDialog } = useAuthDialog()
  const { addMember, addProject } = useStore()

  const [status, setStatus] = useState<JoinStatus>('loading')
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [joining, setJoining] = useState(false)

  // 验证邀请码
  const validateCode = useCallback(async (inviteCode: string) => {
    if (!inviteCode) {
      setStatus('invalid')
      return
    }

    setStatus('loading')
    try {
      const res = await fetch(`/api/invitations/validate/${inviteCode}`)
      const json = await res.json()

      if (json.success && json.data) {
        const inv = json.data as any
        // 获取项目名称
        let projectName = '未知项目'
        try {
          const projRes = await fetch(`/api/projects/${inv.project_id}`)
          if (projRes.ok) {
            const projJson = await projRes.json()
            projectName = projJson.data?.name || projJson.name || projectName
          }
        } catch { /* 获取项目名失败不阻塞 */ }

        setInvitation({
          id: inv.id,
          project_id: inv.project_id,
          project_name: projectName,
          role: inv.role || inv.permission_level,
          permission_level: inv.permission_level || inv.role,
          code: inviteCode,
        })
        setStatus('valid')
      } else {
        setStatus('invalid')
      }
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (code) {
      validateCode(code)
    }
  }, [code, validateCode])

  // 加入项目
  const handleJoin = async () => {
    if (!invitation || !user) return

    setJoining(true)
    try {
      const res = await fetch(`/api/members/${invitation.project_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: user.username,
          permission_level: invitation.permission_level || 'editor',
        }),
      })

      const json = await res.json()

      if (json.success) {
        // 更新本地状态
        const { generateId } = await import('@/lib/localDb')
        addMember({
          id: generateId(),
          project_id: invitation.project_id,
          user_id: user.id,
          role: invitation.permission_level || 'editor',
          joined_at: new Date().toISOString(),
        })

        // 将项目加入本地列表（如果尚未存在）
        if (invitation.project_name) {
          const { projectDb } = await import('@/lib/localDb')
          const existing = projectDb.getById(invitation.project_id)
          if (!existing) {
            const newProject = {
              id: invitation.project_id,
              name: invitation.project_name,
              description: '',
              status: 'active' as const,
              primary_invitation_code: invitation.code,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            projectDb.upsert(newProject)
            addProject(newProject as any)
          }
        }

        setStatus('joined')
        toast({ title: '加入成功', description: `已加入项目: ${invitation.project_name}` })
      } else {
        toast({
          title: '加入失败',
          description: json.message || '请稍后重试',
          variant: 'destructive',
        })
      }
    } catch {
      toast({ title: '加入失败', description: '网络错误，请稍后重试', variant: 'destructive' })
    } finally {
      setJoining(false)
    }
  }

  // 不同状态的渲染
  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">正在验证邀请码...</p>
          </div>
        )

      case 'invalid':
      case 'expired':
        return (
          <div className="flex flex-col items-center justify-center py-16">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {status === 'expired' ? '邀请码已过期' : '邀请码无效'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {status === 'expired'
                ? '该邀请码已超过有效期，请联系项目所有者获取新的邀请码'
                : '该邀请码不存在或已被撤销，请检查链接是否正确'}
            </p>
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回首页
            </Button>
          </div>
        )

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-16">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">验证失败</h2>
            <p className="text-muted-foreground mb-6">网络错误，请稍后重试</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => validateCode(code!)}>
                重新验证
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                返回首页
              </Button>
            </div>
          </div>
        )

      case 'joined':
        return (
          <div className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">加入成功</h2>
            <p className="text-muted-foreground mb-6">
              你已成功加入项目「{invitation?.project_name}」
            </p>
            <Button onClick={() => navigate(`/projects/${invitation?.project_id}`)}>
              进入项目
            </Button>
          </div>
        )

      case 'valid':
        if (!isAuthenticated) {
          // 未登录：提示登录后加入
          return (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-16 w-16 text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                你被邀请加入「{invitation?.project_name}」
              </h2>
              <p className="text-muted-foreground mb-2">
                权限级别：{invitation?.permission_level === 'admin' ? '管理员' : invitation?.permission_level === 'editor' ? '编辑' : '访客'}
              </p>
              <p className="text-muted-foreground mb-6">请先登录后再加入项目</p>
              <Button onClick={openLoginDialog}>
                <LogIn className="mr-2 h-4 w-4" />
                登录后加入
              </Button>
            </div>
          )
        }

        // 已登录：显示加入按钮
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              你被邀请加入「{invitation?.project_name}」
            </h2>
            <p className="text-muted-foreground mb-2">
              权限级别：{invitation?.permission_level === 'admin' ? '管理员' : invitation?.permission_level === 'editor' ? '编辑' : '访客'}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              当前账号：{user?.display_name || user?.username}
            </p>
            <Button onClick={handleJoin} disabled={joining}>
              {joining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加入中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  接受邀请并加入
                </>
              )}
            </Button>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Users className="h-6 w-6" />
            加入项目
          </CardTitle>
          <CardDescription>通过邀请码加入团队项目</CardDescription>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  )
}
