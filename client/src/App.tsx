import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentProject, useSetCurrentUser, useSetProjects } from '@/hooks/useStore'
import { generateDeviceId } from '@/lib/utils'
import { Toaster } from '@/components/ui/toaster'
import { userDb, generateId } from '@/lib/localDb'
import { getCachedProjects, syncProjectCacheFromApi } from '@/lib/projectPersistence'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useKeyboardShortcuts, ShortcutsHelp } from '@/hooks/useKeyboardShortcuts'
import { FeedbackButton } from '@/components/monitoring/FeedbackModal'
import { LoginDialog } from '@/components/LoginDialog'
import { useAuth } from '@/hooks/useAuth'
import { AuthProvider } from '@/context/AuthContext'
import { AuthDialogProvider, useAuthDialog } from '@/hooks/useAuthDialog'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ProjectLayout from '@/components/layout/ProjectLayout'
import { ConditionWarningModal } from '@/components/ConditionWarningModal'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const CompanyCockpit = lazy(() => import('@/pages/CompanyCockpit'))
const GanttView = lazy(() => import('@/pages/GanttView'))
const RiskManagement = lazy(() => import('@/pages/RiskManagement'))
const Milestones = lazy(() => import('@/pages/Milestones'))
const AcceptanceTimeline = lazy(() => import('@/pages/AcceptanceTimeline'))
const PreMilestones = lazy(() => import('@/pages/PreMilestones'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Reports = lazy(() => import('@/pages/Reports'))
const TeamMembers = lazy(() => import('@/pages/TeamMembers'))
const TaskSummary = lazy(() => import('@/pages/TaskSummary'))
const WBSTemplates = lazy(() => import('@/pages/WBSTemplates'))
const JoinProject = lazy(() => import('@/pages/JoinProject'))
const MonitoringDashboard = lazy(() => import('@/components/monitoring/MonitoringDashboard'))

function PageLoader() {
  return (
    <div className="animate-pulse space-y-4 p-2">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-xl bg-gray-200" />
        <div className="h-8 w-24 rounded-xl bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(['sk-card-1', 'sk-card-2', 'sk-card-3', 'sk-card-4'] as const).map((key) => (
          <div key={key} className="h-28 rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="space-y-3">
        {(['sk-row-1', 'sk-row-2', 'sk-row-3', 'sk-row-4', 'sk-row-5'] as const).map((key) => (
          <div key={key} className="h-14 rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  )
}

function AppContent() {
  const setCurrentUser = useSetCurrentUser()
  const setProjects = useSetProjects()
  const currentProject = useCurrentProject()
  const [loading, setLoading] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { isOpen: showLoginDialog, closeLoginDialog } = useAuthDialog()
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading, user } = useAuth()

  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/)
  const projectId = projectMatch ? projectMatch[1] : currentProject?.id

  const navShortcuts = useCallback(() => {
    if (!projectId) return []

    const routes = [
      { href: `/projects/${projectId}/dashboard`, description: '跳转：项目 Dashboard' },
      { href: `/projects/${projectId}/milestones`, description: '跳转：里程碑' },
      { href: `/projects/${projectId}/gantt`, description: '跳转：任务管理' },
      { href: `/projects/${projectId}/risks`, description: '跳转：风险与问题' },
      { href: `/projects/${projectId}/pre-milestones`, description: '跳转：证照管理' },
      { href: `/projects/${projectId}/task-summary`, description: '跳转：任务总结' },
      { href: '/notifications', description: '跳转：提醒中心' },
    ]

    return routes.map((route, idx) => ({
      key: String(idx + 1),
      ctrlKey: true as const,
      action: () => navigate(route.href),
      description: route.description,
    }))
  }, [projectId, navigate])

  useKeyboardShortcuts(
    [
      {
        key: '?',
        shiftKey: true,
        action: () => setShortcutsOpen(true),
        description: 'Show keyboard shortcuts',
      },
      ...navShortcuts(),
    ],
    true
  )

  useEffect(() => {
    setProjects(getCachedProjects())
    void syncProjectCacheFromApi()
      .then((projects) => {
        setProjects(projects)
        if (import.meta.env.DEV) {
          console.log('[sync] synced backend projects to cache', projects.length)
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn('[sync] failed to sync backend projects:', error)
        }
      })

    const initUser = () => {
      if (isAuthenticated && user) {
        setCurrentUser({
          id: user.id,
          device_id: user.username,
          display_name: user.display_name || user.username,
          joined_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        })
        setLoading(false)
        return
      }

      const deviceId = generateDeviceId()
      const existingUser = userDb.findByDeviceId(deviceId)

      if (existingUser) {
        userDb.update(existingUser.id, { last_active: new Date().toISOString() })
        setCurrentUser(existingUser)
      } else {
        const newUser = {
          id: generateId(),
          device_id: deviceId,
          display_name: `用户_${deviceId.slice(0, 6)}`,
          joined_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        }
        userDb.create(newUser)
        setCurrentUser(newUser)
      }

      setLoading(false)
    }

    if (!authLoading) {
      initUser()
    }
  }, [isAuthenticated, authLoading, user, setCurrentUser, setProjects])

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-slate-50/80">
          <div className="w-full">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/company" replace />} />
                  <Route path="/company" element={<CompanyCockpit />} />
                  <Route path="/projects" element={<Navigate to="/company" replace />} />
                  <Route path="/projects/:id" element={<ProjectLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="gantt" element={<GanttView />} />
                    <Route path="risks" element={<RiskManagement />} />
                    <Route path="milestones" element={<Milestones />} />
                    <Route path="acceptance" element={<AcceptanceTimeline />} />
                    <Route path="pre-milestones" element={<PreMilestones />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="team" element={<TeamMembers />} />
                    <Route path="task-summary" element={<TaskSummary />} />
                    <Route path="wbs-templates" element={<WBSTemplates />} />
                  </Route>
                  <Route path="/settings" element={<Navigate to="/notifications" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/company" replace />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/monitoring" element={<MonitoringDashboard />} />
                  <Route path="/join/:code" element={<JoinProject />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <Toaster />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FeedbackButton />
      <LoginDialog isOpen={showLoginDialog} onClose={closeLoginDialog} />
      <ConditionWarningModal projectId={projectId} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthDialogProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </AuthDialogProvider>
    </AuthProvider>
  )
}
