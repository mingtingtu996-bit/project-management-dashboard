import { useState, useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { generateDeviceId } from '@/lib/utils'
import { Toaster } from '@/components/ui/toaster'
import { userDb, generateId } from '@/lib/localDb'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useKeyboardShortcuts, ShortcutsHelp } from '@/hooks/useKeyboardShortcuts'
import { FeedbackButton } from '@/components/monitoring/FeedbackModal'

// 懒加载页面组件 - 实现代码分割
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ProjectList = lazy(() => import('@/pages/ProjectList'))
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'))
const GanttView = lazy(() => import('@/pages/GanttView'))
const RiskManagement = lazy(() => import('@/pages/RiskManagement'))
const Milestones = lazy(() => import('@/pages/Milestones'))
const Reports = lazy(() => import('@/pages/Reports'))
const TeamMembers = lazy(() => import('@/pages/TeamMembers'))
const Settings = lazy(() => import('@/pages/Settings'))
const MonitoringDashboard = lazy(() => import('@/components/monitoring/MonitoringDashboard'))

// 布局组件
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

// 页面加载骨架屏
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-pulse bg-muted rounded-lg h-8 w-32 mx-auto mb-4"></div>
        <div className="animate-pulse bg-muted rounded h-4 w-48 mx-auto"></div>
      </div>
    </div>
  )
}

function AppContent() {
  const { setCurrentUser, currentProject } = useStore()
  const [loading, setLoading] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const location = useLocation()

  // 快捷键配置
  useKeyboardShortcuts([
    { key: '?', shiftKey: true, action: () => setShortcutsOpen(true), description: '显示快捷键帮助' },
  ], true)

  useEffect(() => {
    // 初始化用户 - 使用本地存储
    const initUser = () => {
      const deviceId = generateDeviceId()

      // 尝试获取或创建用户
      const existingUser = userDb.findByDeviceId(deviceId)

      if (existingUser) {
        // 更新最后活跃时间
        userDb.update(existingUser.id, { last_active: new Date().toISOString() })
        setCurrentUser(existingUser)
      } else {
        // 创建新用户
        const newUser = {
          id: generateId(),
          device_id: deviceId,
          display_name: `用户_${deviceId.slice(0, 6)}`,
          joined_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        }
        userDb.create(newUser)
        setCurrentUser(newUser)
      }
      setLoading(false)
    }

    initUser()
  }, [setCurrentUser])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<ProjectList />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/projects/:id/gantt" element={<GanttView />} />
                <Route path="/projects/:id/risks" element={<RiskManagement />} />
                <Route path="/projects/:id/milestones" element={<Milestones />} />
                <Route path="/projects/:id/reports" element={<Reports />} />
                <Route path="/projects/:id/team" element={<TeamMembers />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/monitoring" element={<MonitoringDashboard />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Toaster />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FeedbackButton />
    </div>
  )
}

// 包装 AppContent 以使用 useLocation
export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
