/**
 * ProjectLayout.tsx
 *
 * 所有项目子页面的共享布局层。
 *
 * 职责：
 * 1. 根据 URL :id 参数初始化 currentProject 及关联数据（tasks/risks/milestones）
 * 2. 加载期间显示骨架屏
 * 3. 项目不存在时显示错误提示
 *
 * 修复的问题：
 * - 刷新任意子页面（dashboard/gantt/risks 等）时数据为空的问题
 * - 直接访问子页面链接时 currentProject = null 的问题
 * - 项目不存在时的友好错误提示
 */

import { useEffect, useRef } from 'react'

import { useCurrentProject } from '@/hooks/useStore'

import { useProjectInit } from '@/hooks/useProjectInit'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ReportsSkeleton } from '@/components/ui/page-skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function ProjectLayout() {
  const location = useLocation()
  const isMaterialsRoute = location.pathname.endsWith('/materials')
  const isGanttRoute = location.pathname.endsWith('/gantt')
  const { isLoaded, isLoading, status, errorMessage, retry } = useProjectInit({
    mode: isMaterialsRoute ? 'materials' : isGanttRoute ? 'gantt' : 'full',
  })
  const currentProject = useCurrentProject()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { openLoginDialog } = useAuthDialog()
  const previousAuthStateRef = useRef<boolean | null>(null)

  const { id: projectId } = useParams()

  useEffect(() => {
    if (authLoading) return

    const wasAuthenticated = previousAuthStateRef.current
    previousAuthStateRef.current = isAuthenticated

    if (wasAuthenticated === false && isAuthenticated) {
      void retry()
    }
  }, [authLoading, isAuthenticated, retry])

  // 等待项目数据加载完成
  if (isLoading || status === 'idle') {
    return (
      <div className="p-6">
        <ReportsSkeleton />
      </div>
    )
  }

  if (!authLoading && !isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}`

    return (
      <div className="mx-auto mt-10 max-w-2xl p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-4">
            <div>
              <strong>登录后继续查看项目</strong>
              <br />
              当前访问的是项目详情页，登录后会自动回到这个项目页面并继续刚才的操作。
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem('pending_auth_redirect', redirectTarget)
                  } catch {
                    // sessionStorage 不可用时静默跳过
                  }
                  openLoginDialog()
                }}
              >
                登录后继续
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/company?login=1&redirect=${encodeURIComponent(redirectTarget)}`)}
              >
                前往登录入口
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>项目不存在</strong>
            <br />
            项目 ID <code>{projectId}</code> 在数据库中找不到。
            <br />
            <br />
            <button
              onClick={() => navigate('/company')}
              className="text-white underline"
            >
              返回公司驾驶舱
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>项目加载失败</strong>
            <br />
            {errorMessage || '当前无法加载项目数据，请稍后重试。'}
            <br />
            <br />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={retry}
                className="text-white underline"
              >
                重新加载
              </button>
              <button
                onClick={() => navigate('/company')}
                className="text-white underline"
              >
                返回公司驾驶舱
              </button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!isLoaded || !currentProject) {
    return (
      <div className="p-6">
        <ReportsSkeleton />
      </div>
    )
  }

  // 数据已加载，渲染子路由
  return <Outlet />
}
