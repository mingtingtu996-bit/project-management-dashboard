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

import { useCurrentProject } from '@/hooks/useStore'

import { useProjectInit } from '@/hooks/useProjectInit'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { ReportsSkeleton } from '@/components/ui/page-skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export default function ProjectLayout() {
  const { isLoaded } = useProjectInit()
  const currentProject = useCurrentProject()
  const navigate = useNavigate()

  const { id: projectId } = useParams()

  // 等待项目数据加载完成
  if (!isLoaded) {
    return (
      <div className="p-6">
        <ReportsSkeleton />
      </div>
    )
  }

  // ✅ 项目不存在时显示错误提示
  if (!currentProject) {
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

  // 数据已加载，渲染子路由
  return <Outlet />
}
