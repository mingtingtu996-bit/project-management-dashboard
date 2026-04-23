import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, LogIn, Users, XCircle } from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { getApiErrorMessage, getAuthHeaders } from '@/lib/apiClient'
import { syncProjectCacheFromApi } from '@/lib/projectPersistence'
import { toast } from '@/hooks/use-toast'
import { getProjectRoleLabel, normalizeProjectPermissionLevel } from '@/lib/roleLabels'
import { useSetProjects } from '@/hooks/useStore'

type JoinStatus = 'loading' | 'valid' | 'invalid' | 'joined' | 'error'

interface InvitationInfo {
  id: string
  projectId: string
  projectName?: string | null
  permissionLevel: string
  alreadyJoined?: boolean
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

export default function JoinProject() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { openLoginDialog } = useAuthDialog()
  const setProjects = useSetProjects()
  const [status, setStatus] = useState<JoinStatus>('loading')
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [joining, setJoining] = useState(false)

  const validateCode = useCallback(async (inviteCode: string) => {
    if (!inviteCode) {
      setStatus('invalid')
      return
    }

    setStatus('loading')
    try {
      const response = await requestJson<{ success: boolean; data: InvitationInfo }>(`/api/invitations/validate/${inviteCode}`)
      const normalizedInvitation = {
        ...response.data,
        permissionLevel: normalizeProjectPermissionLevel(response.data.permissionLevel),
        alreadyJoined: Boolean(response.data.alreadyJoined),
      }
      setInvitation(normalizedInvitation)
      setStatus(normalizedInvitation.alreadyJoined ? 'joined' : 'valid')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setStatus(message.includes('无效') || message.includes('过期') ? 'invalid' : 'error')
    }
  }, [])

  useEffect(() => {
    if (code) {
      void validateCode(code)
    }
  }, [code, validateCode])

  const handleJoin = async () => {
    if (!invitation) return
    setJoining(true)
    try {
      await requestJson(`/api/invitations/accept/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const projects = await syncProjectCacheFromApi({ allowEmptyReplace: true })
      setProjects(projects)
      setStatus('joined')
      toast({ title: '加入成功', description: `已加入项目「${invitation.projectName || '当前项目'}」` })
    } catch (error) {
      toast({ title: '加入失败', description: getApiErrorMessage(error, '请稍后重试'), variant: 'destructive' })
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4" data-testid="join-project-page">
      <Card className="w-full max-w-md rounded-3xl border-slate-200 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <Users className="h-6 w-6" />
            加入项目
          </CardTitle>
          <CardDescription>通过邀请码加入团队项目</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' ? (
            <LoadingState label="正在验证邀请码" description="正在校验邀请链接，请稍候" className="min-h-48 border-0 bg-transparent shadow-none" />
          ) : null}

          {status === 'invalid' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="join-project-invalid-state">
              <XCircle className="mb-4 h-16 w-16 text-rose-500" />
              <h2 className="text-xl font-semibold text-slate-900">邀请码无效或已过期</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">请联系项目负责人重新获取新的邀请链接。</p>
              <Button variant="outline" className="mt-6" onClick={() => navigate('/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回首页
              </Button>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="join-project-error-state">
              <XCircle className="mb-4 h-16 w-16 text-rose-500" />
              <h2 className="text-xl font-semibold text-slate-900">验证失败</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">网络异常或后端暂不可用，请稍后重试。</p>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" onClick={() => code && validateCode(code)}>重新验证</Button>
                <Button variant="outline" onClick={() => navigate('/')}>返回首页</Button>
              </div>
            </div>
          ) : null}

          {status === 'joined' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="join-project-joined-state">
              <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
              <h2 className="text-xl font-semibold text-slate-900">{invitation?.alreadyJoined ? '你已加入该项目' : '加入成功'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {invitation?.alreadyJoined
                  ? `当前账号已是项目「${invitation?.projectName || '当前项目'}」的成员。`
                  : `你已成功加入项目「${invitation?.projectName || '当前项目'}」。`}
              </p>
              <Button className="mt-6" onClick={() => navigate(`/projects/${invitation?.projectId}/dashboard`)} data-testid="join-project-enter-project">
                进入项目
              </Button>
            </div>
          ) : null}

          {status === 'valid' && invitation ? (
            <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="join-project-valid-state">
              <Users className="mb-4 h-16 w-16 text-blue-600" />
              <h2 className="text-xl font-semibold text-slate-900">你被邀请加入「{invitation.projectName || '当前项目'}」</h2>
              <p className="mt-2 text-sm text-slate-500">加入后角色：{getProjectRoleLabel(invitation.permissionLevel)}</p>
              {isAuthenticated ? (
                <>
                  <p className="mt-2 text-sm text-slate-500">当前账号：{user?.display_name || user?.username}</p>
                  <Button className="mt-6" loading={joining} onClick={handleJoin} data-testid="join-project-accept">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    接受邀请并加入
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-500">请先登录，再完成加入项目。</p>
                  <Button className="mt-6" onClick={openLoginDialog} data-testid="join-project-login">
                    <LogIn className="mr-2 h-4 w-4" />
                    登录后加入
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
