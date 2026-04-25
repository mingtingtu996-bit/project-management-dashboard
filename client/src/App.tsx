import { useState, useEffect, lazy, Suspense, useCallback, type ReactElement } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ConditionWarningModal } from '@/components/ConditionWarningModal'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginDialog } from '@/components/LoginDialog'
import { OfflineBanner } from '@/components/OfflineBanner'
import { SkipLink } from '@/components/accessibility/SkipLink'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ProjectLayout from '@/components/layout/ProjectLayout'
import { FeedbackButton } from '@/components/monitoring/FeedbackModal'
import { ShortcutsHelp, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { AuthDialogProvider, useAuthDialog } from '@/hooks/useAuthDialog'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import { useSetCurrentUser, useSetProjects } from '@/hooks/useStore'
import { getCachedProjects, syncProjectCacheFromApi } from '@/lib/projectPersistence'
import { getAuthToken } from '@/lib/apiClient'
import { startAutoBackup, stopAutoBackup } from '@/lib/backup'
import { userDb, generateId } from '@/lib/localDb'
import { generateDeviceId } from '@/lib/utils'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { LoadingState } from '@/components/ui/loading-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/toaster'

const initialHash = typeof window !== 'undefined' ? window.location.hash : ''
const initialGanttModulePromise = initialHash.includes('/gantt')
  ? import('@/pages/GanttView')
  : null

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const CompanyCockpit = lazy(() => import('@/pages/CompanyCockpit'))
const GanttView = lazy(() => initialGanttModulePromise ?? import('@/pages/GanttView'))
const RiskManagement = lazy(() => import('@/pages/RiskManagement'))
const Milestones = lazy(() => import('@/pages/Milestones'))
const AcceptanceTimeline = lazy(() => import('@/pages/AcceptanceTimeline'))
const PreMilestones = lazy(() => import('@/pages/PreMilestones'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Reports = lazy(() => import('@/pages/Reports'))
const Materials = lazy(() => import('@/pages/Materials'))
const TeamMembers = lazy(() => import('@/pages/TeamMembers'))
const TaskSummary = lazy(() => import('@/pages/TaskSummary'))
const ResponsibilityView = lazy(() => import('@/pages/ResponsibilityView'))
const WBSTemplates = lazy(() => import('@/pages/WBSTemplates'))
const JoinProject = lazy(() => import('@/pages/JoinProject'))
const BaselinePage = lazy(() => import('@/pages/planning/BaselinePage'))
const MonthlyPlanPage = lazy(() => import('@/pages/planning/MonthlyPlanPage'))
const CloseoutPage = lazy(() => import('@/pages/planning/CloseoutPage'))
const PlanningWorkspace = lazy(() => import('@/pages/planning/PlanningWorkspace'))
const Drawings = lazy(() => import('@/pages/Drawings'))
const MonitoringDashboard = lazy(() => import('@/components/monitoring/MonitoringDashboard'))
const PENDING_AUTH_REDIRECT_KEY = 'pending_auth_redirect'
let lastProjectCacheSyncKey: string | null = null
let projectCacheSyncPromise: Promise<ReturnType<typeof getCachedProjects>> | null = null

if (initialGanttModulePromise) {
  void initialGanttModulePromise
}

function syncProjectsForKey(syncKey: string) {
  if (lastProjectCacheSyncKey === syncKey) {
    return projectCacheSyncPromise ?? Promise.resolve(getCachedProjects())
  }

  lastProjectCacheSyncKey = syncKey
  projectCacheSyncPromise = syncProjectCacheFromApi().finally(() => {
    projectCacheSyncPromise = null
  })
  return projectCacheSyncPromise
}

function setPendingAuthRedirect(value: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, value)
      return
    }
    window.sessionStorage.removeItem(PENDING_AUTH_REDIRECT_KEY)
  } catch {
    // sessionStorage 不可用时静默跳过
  }
}

function getPendingAuthRedirect() {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem(PENDING_AUTH_REDIRECT_KEY) || ''
  } catch {
    return ''
  }
}

function PageLoader() {
  return (
    <div className="space-y-4 p-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48 rounded-card" />
        <Skeleton className="h-8 w-24 rounded-card" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(['sk-card-1', 'sk-card-2', 'sk-card-3', 'sk-card-4'] as const).map((key) => (
          <Skeleton key={key} className="h-28 rounded-card" />
        ))}
      </div>
      <div className="space-y-3">
        {(['sk-row-1', 'sk-row-2', 'sk-row-3', 'sk-row-4', 'sk-row-5'] as const).map((key) => (
          <Skeleton key={key} className="h-14 rounded-card" />
        ))}
      </div>
    </div>
  )
}

function withRouteBoundary(element: ReactElement) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{element}</Suspense>
    </ErrorBoundary>
  )
}

function AppContent() {
  const setCurrentUser = useSetCurrentUser()
  const setProjects = useSetProjects()
  const [loading, setLoading] = useState(() => !Boolean(getAuthToken()))
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { isOpen: showLoginDialog, closeLoginDialog, openLoginDialog } = useAuthDialog()
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const hasStoredToken = Boolean(getAuthToken())
  useRealtimeConnection({ enabled: isAuthenticated && !authLoading, authenticatedUserId: user?.id ?? null })

  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/)
  const projectId = projectMatch?.[1] ?? null

  const navShortcuts = useCallback(() => {
    if (!projectId) return []

    const routes = [
      { href: `/projects/${projectId}/dashboard`, description: `跳转：${PROJECT_NAVIGATION_LABELS.dashboard}` },
      { href: `/projects/${projectId}/milestones`, description: `跳转：${PROJECT_NAVIGATION_LABELS.milestones}` },
      { href: `/projects/${projectId}/gantt`, description: `跳转：${PROJECT_NAVIGATION_LABELS.tasks}` },
      { href: `/projects/${projectId}/responsibility`, description: `跳转：${PROJECT_NAVIGATION_LABELS.responsibility}` },
      { href: `/projects/${projectId}/risks`, description: `跳转：${PROJECT_NAVIGATION_LABELS.risks}` },
      { href: `/projects/${projectId}/pre-milestones`, description: `跳转：${PROJECT_NAVIGATION_LABELS.preMilestones}` },
      { href: `/projects/${projectId}/task-summary`, description: `跳转：${PROJECT_NAVIGATION_LABELS.taskSummary}` },
      { href: `/projects/${projectId}/planning/baseline`, description: `跳转：${PROJECT_NAVIGATION_LABELS.planning}` },
      { href: '/notifications', description: `跳转：${PROJECT_NAVIGATION_LABELS.notifications}` },
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
    true,
  )

  useEffect(() => {
    setProjects(getCachedProjects())

    const initUser = () => {
      if (isAuthenticated && user) {
        setCurrentUser({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          global_role: user.globalRole,
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

    if (authLoading) {
      if (hasStoredToken) {
        setLoading(false)
      }
      return
    }

    initUser()
  }, [authLoading, hasStoredToken, isAuthenticated, setCurrentUser, setProjects, user])

  useEffect(() => {
    if (authLoading) return undefined
    if (!isAuthenticated) {
      setProjects(getCachedProjects())
      return undefined
    }

    let cancelled = false
    const syncKey = user?.id ? `user:${user.id}` : isAuthenticated ? 'auth' : 'anon'
    const runSync = () => {
      void syncProjectsForKey(syncKey)
        .then((projects) => {
          if (!cancelled) {
            setProjects(projects)
          }
          if (import.meta.env.DEV && !cancelled) {
            console.log('[sync] synced backend projects to cache', projects.length)
          }
        })
        .catch((error) => {
          if (import.meta.env.DEV && !cancelled) {
            console.warn('[sync] failed to sync backend projects:', error)
          }
        })
    }

    if (location.pathname === '/company') {
      runSync()
      return () => {
        cancelled = true
      }
    }

    const timer = window.setTimeout(runSync, hasStoredToken ? 1800 : 1200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [authLoading, hasStoredToken, isAuthenticated, location.pathname, setProjects, user?.id])

  useEffect(() => {
    startAutoBackup()
    return () => {
      stopAutoBackup()
    }
  }, [])

  useEffect(() => {
    if (authLoading || isAuthenticated) return

    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('login') !== '1') return

    const redirectTarget = searchParams.get('redirect')
    if (redirectTarget) {
      setPendingAuthRedirect(redirectTarget)
    }

    openLoginDialog()
    navigate(location.pathname, { replace: true })
  }, [authLoading, isAuthenticated, location.pathname, location.search, navigate, openLoginDialog])

  useEffect(() => {
    if (authLoading || !isAuthenticated) return

    const redirectTarget = getPendingAuthRedirect()
    if (!redirectTarget) return

    setPendingAuthRedirect(null)
    const currentTarget = `${location.pathname}${location.search}`
    if (redirectTarget !== currentTarget) {
      navigate(redirectTarget, { replace: true })
    }
  }, [authLoading, isAuthenticated, location.pathname, location.search, navigate])

  if (loading || (authLoading && !hasStoredToken)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState
          label="应用启动中"
          description="正在完成登录校验与项目数据初始化"
          className="w-full max-w-sm"
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <SkipLink targetId="app-main" />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <OfflineBanner />
        <main
          id="app-main"
          role="main"
          aria-label="主要内容"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-slate-50/80 focus:outline-none"
        >
          <div className="w-full">
            <Routes>
              <Route path="/" element={<Navigate to="/company" replace />} />
              <Route path="/company" element={withRouteBoundary(<CompanyCockpit />)} />
              <Route path="/projects" element={<Navigate to="/company" replace />} />
              <Route
                path="/projects/:id"
                element={
                  <ErrorBoundary>
                    <ProjectLayout />
                  </ErrorBoundary>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={withRouteBoundary(<Dashboard />)} />
                <Route path="gantt" element={withRouteBoundary(<GanttView />)} />
                <Route path="risks" element={withRouteBoundary(<RiskManagement />)} />
                <Route path="milestones" element={withRouteBoundary(<Milestones />)} />
                <Route path="acceptance" element={withRouteBoundary(<AcceptanceTimeline />)} />
                <Route path="pre-milestones" element={withRouteBoundary(<PreMilestones />)} />
                <Route path="reports" element={withRouteBoundary(<Reports />)} />
                <Route path="team" element={withRouteBoundary(<TeamMembers />)} />
                <Route path="task-summary" element={withRouteBoundary(<TaskSummary />)} />
                <Route path="responsibility" element={withRouteBoundary(<ResponsibilityView />)} />
                <Route path="planning/wbs-templates" element={withRouteBoundary(<WBSTemplates />)} />
                <Route path="wbs-templates" element={<Navigate to="planning/wbs-templates" replace />} />
                <Route path="planning/baseline" element={withRouteBoundary(<BaselinePage />)} />
                <Route path="planning/monthly" element={withRouteBoundary(<MonthlyPlanPage />)} />
                <Route path="planning/closeout" element={withRouteBoundary(<CloseoutPage />)} />
                <Route path="planning/*" element={withRouteBoundary(<PlanningWorkspace />)} />
                <Route path="drawings" element={withRouteBoundary(<Drawings />)} />
                <Route path="materials" element={withRouteBoundary(<Materials />)} />
              </Route>
              <Route path="/dashboard" element={<Navigate to="/company" replace />} />
              <Route path="/notifications" element={withRouteBoundary(<Notifications />)} />
              <Route path="/monitoring" element={withRouteBoundary(<MonitoringDashboard />)} />
              <Route path="/join/:code" element={withRouteBoundary(<JoinProject />)} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <FeedbackButton />
      <LoginDialog isOpen={showLoginDialog} onClose={closeLoginDialog} />
      <ConditionWarningModal projectId={projectId ?? undefined} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthDialogProvider>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppContent />
        </HashRouter>
      </AuthDialogProvider>
    </AuthProvider>
  )
}
