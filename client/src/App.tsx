import { useState, useEffect, lazy, Suspense, useCallback, type ReactElement } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import { ConditionWarningModal } from '@/components/ConditionWarningModal'
import { CommandPalette } from '@/components/CommandPalette'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginDialog } from '@/components/LoginDialog'
import { NotFoundPage } from '@/components/NotFoundPage'
import { OfflineBanner } from '@/components/OfflineBanner'
import { OnboardingGuide } from '@/components/OnboardingGuide'
import { PageSkeleton } from '@/components/PageSkeleton'
import { PageErrorBoundary } from '@/components/PageErrorBoundary'
import { SkipLink } from '@/components/accessibility/SkipLink'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ProjectLayout from '@/components/layout/ProjectLayout'
import { FeedbackButton } from '@/components/monitoring/FeedbackModal'
import { ShortcutsHelp, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { AuthDialogProvider, useAuthDialog } from '@/hooks/useAuthDialog'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import { useProjectClimateAutoLocation } from '@/hooks/useProjectClimateAutoLocation'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useSetCurrentUser, useSetProjects } from '@/hooks/useStore'
import { fetchProjectsFromApi } from '@/lib/projectApi'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  COMMERCIAL_UPGRADE_REQUIRED_EVENT,
  COMPANY_CONTEXT_CHANGED_EVENT,
  getAuthToken,
} from '@/lib/apiClient'
import { getRouteProjectId, isReservedProjectRouteId, isReservedProjectRoutePath } from '@/lib/projectRouteGuards'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { LoadingState } from '@/components/ui/loading-state'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { LegalFooter } from '@/components/LegalFooter'

const initialHash = typeof window !== 'undefined' ? window.location.hash : ''
const initialRoutePath = initialHash.startsWith('#') ? initialHash.slice(1).split(/[?#]/)[0] : ''
const initialRouteSearch = initialHash.startsWith('#') ? initialHash.slice(1).split('?')[1]?.split('#')[0] ?? '' : ''
const isInitialModelingWorkbenchRoute = /^\/projects\/[^/]+\/gantt$/.test(initialRoutePath)
  && ['generate', 'adjust'].includes(new URLSearchParams(initialRouteSearch).get('modelingWorkbench') ?? '')
const isInitialTaskListRoute = /^\/projects\/[^/]+\/gantt$/.test(initialRoutePath) && !isInitialModelingWorkbenchRoute
const initialGanttModulePromise = isInitialTaskListRoute
  ? import('@/pages/GanttView')
  : null

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const CompanyCockpit = lazy(() => import('@/pages/CompanyCockpit'))
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'))
const DemoPreviewPage = lazy(() => import('@/pages/DemoPreviewPage'))
const GanttView = lazy(() => initialGanttModulePromise ?? import('@/pages/GanttView'))
const PlanningModelingWorkbenchRoute = lazy(() => import('@/pages/GanttView/PlanningModelingWorkbenchRoute'))
const RiskManagement = lazy(() => import('@/pages/RiskManagement'))
const Milestones = lazy(() => import('@/pages/Milestones'))
const AcceptanceTimeline = lazy(() => import('@/pages/AcceptanceTimeline'))
const PreMilestones = lazy(() => import('@/pages/PreMilestones'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Reports = lazy(() => import('@/pages/Reports'))
const Materials = lazy(() => import('@/pages/Materials'))
const TaskSummary = lazy(() => import('@/pages/TaskSummary'))
const ResponsibilityView = lazy(() => import('@/pages/ResponsibilityView'))
const JoinProject = lazy(() => import('@/pages/JoinProject'))
const BaselinePage = lazy(() => import('@/pages/planning/BaselinePage'))
const MonthlyPlanPage = lazy(() => import('@/pages/planning/MonthlyPlanPage'))
const Drawings = lazy(() => import('@/pages/Drawings'))
const MonitoringDashboard = lazy(() => import('@/components/monitoring/MonitoringDashboard'))
const CustomBusinessTypeAdmin = lazy(() => import('@/pages/CustomBusinessTypeAdmin'))
const DurationAccuracyAdmin = lazy(() => import('@/pages/DurationAccuracyAdmin'))
const RuleAssetGovernanceWorkbenchAdmin = lazy(() => import('@/pages/RuleAssetGovernanceWorkbenchAdmin'))
const DurationAssetsAdmin = lazy(() => import('@/pages/DurationAssetsAdmin'))
const BillingSettings = lazy(() => import('@/pages/BillingSettings'))
const PENDING_AUTH_REDIRECT_KEY = 'pending_auth_redirect'
const DASHBOARD_FIRST_SCREEN_BACKGROUND_SYNC_DELAY_MS = 5_000
let activeProjectSyncKey: string | null = null
let projectSyncPromise: ReturnType<typeof fetchProjectsFromApi> | null = null

if (initialGanttModulePromise) {
  void initialGanttModulePromise
}

function syncProjectsForKey(syncKey: string) {
  if (activeProjectSyncKey === syncKey && projectSyncPromise) {
    return projectSyncPromise
  }

  activeProjectSyncKey = syncKey
  projectSyncPromise = fetchProjectsFromApi().finally(() => {
    projectSyncPromise = null
  })
  return projectSyncPromise
}

function isDashboardProjectRoutePath(pathname: string) {
  return /^\/projects\/[^/]+\/dashboard$/.test(pathname)
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

function withRouteBoundary(element: ReactElement) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{element}</Suspense>
    </ErrorBoundary>
  )
}

function ProjectRouteElement() {
  const { id } = useParams<{ id: string }>()

  if (isReservedProjectRouteId(id)) {
    return <NotFoundPage />
  }

  return (
    <ErrorBoundary>
      <ProjectLayout />
    </ErrorBoundary>
  )
}

function GanttRouteElement() {
  const location = useLocation()
  const modelingWorkbenchMode = new URLSearchParams(location.search).get('modelingWorkbench')

  if (modelingWorkbenchMode === 'generate' || modelingWorkbenchMode === 'adjust') {
    return withRouteBoundary(<PlanningModelingWorkbenchRoute />)
  }

  return withRouteBoundary(<GanttView />)
}

function AppContent() {
  useScrollRestoration()

  const setCurrentUser = useSetCurrentUser()
  const setProjects = useSetProjects()
  const [loading, setLoading] = useState(() => !Boolean(getAuthToken()))
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const { isOpen: showLoginDialog, closeLoginDialog, openLoginDialog } = useAuthDialog()
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const hasStoredToken = Boolean(getAuthToken())
  const isWorkspaceShellRoute = location.pathname === '/workspace'
    || location.pathname === '/demo'
    || location.pathname === '/settings/billing'
    || isReservedProjectRoutePath(location.pathname)
  const isModelingWorkbenchRoute = /^\/projects\/[^/]+\/gantt$/.test(location.pathname)
    && ['generate', 'adjust'].includes(new URLSearchParams(location.search).get('modelingWorkbench') ?? '')
  useRealtimeConnection({
    enabled: isAuthenticated && !authLoading,
    authenticatedUserId: user?.id ?? null,
    currentCompanyId: user?.currentCompanyId ?? null,
  })

  const projectId = getRouteProjectId(location.pathname)
  useProjectClimateAutoLocation(projectId, isAuthenticated && !authLoading)

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
      {
        key: 'k',
        ctrlKey: true,
        action: () => setCommandPaletteOpen((open) => !open),
        description: 'Open command palette',
      },
      ...navShortcuts(),
    ],
    true,
  )

  useEffect(() => {
    const initUser = () => {
      if (isAuthenticated && user) {
        setCurrentUser({
          id: user.id,
          username: user.username,
          email: user.email,
          global_role: user.globalRole,
          display_name: user.display_name || user.username,
          joined_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        })
        setLoading(false)
        return
      }

      setCurrentUser(null)
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
      setProjects([])
      return undefined
    }

    let cancelled = false
    const syncKey = user?.id ? `user:${user.id}:company:${user.currentCompanyId ?? 'no-company'}` : isAuthenticated ? 'auth' : 'anon'
    const runSync = () => {
      void syncProjectsForKey(syncKey)
        .then((projects) => {
          if (!cancelled) {
            setProjects(projects)
          }
          if (import.meta.env.DEV && !cancelled) {
            console.log('[sync] loaded backend projects', projects.length)
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

    const backgroundSyncDelayMs = isDashboardProjectRoutePath(location.pathname)
      ? DASHBOARD_FIRST_SCREEN_BACKGROUND_SYNC_DELAY_MS
      : hasStoredToken ? 1800 : 1200
    const timer = window.setTimeout(runSync, backgroundSyncDelayMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [authLoading, hasStoredToken, isAuthenticated, location.pathname, setProjects, user?.currentCompanyId, user?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleCompanyContextChanged = () => {
      activeProjectSyncKey = null
      projectSyncPromise = null
      setProjects([])
    }

    window.addEventListener(COMPANY_CONTEXT_CHANGED_EVENT, handleCompanyContextChanged)
    return () => window.removeEventListener(COMPANY_CONTEXT_CHANGED_EVENT, handleCompanyContextChanged)
  }, [setProjects])

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
    if (typeof window === 'undefined') return undefined

    const handleSessionExpired = () => {
      const currentTarget = `${location.pathname}${location.search}`
      setPendingAuthRedirect(currentTarget)
      openLoginDialog()
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [location.pathname, location.search, openLoginDialog])

  useEffect(() => {
    const handleCommercialUpgradeRequired = (event: CustomEvent<{ upgradePath: string; code: string }>) => {
      const upgradePath = event.detail.upgradePath || '/settings/billing'
      if (location.pathname === upgradePath) return
      navigate(`${upgradePath}?reason=${encodeURIComponent(event.detail.code)}`)
    }

    window.addEventListener(COMMERCIAL_UPGRADE_REQUIRED_EVENT, handleCommercialUpgradeRequired)
    return () => window.removeEventListener(COMMERCIAL_UPGRADE_REQUIRED_EVENT, handleCommercialUpgradeRequired)
  }, [location.pathname, navigate])

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
      <SkipLink targetId="main-content" />
      {!isWorkspaceShellRoute && !isModelingWorkbenchRoute ? <Sidebar /> : null}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!isModelingWorkbenchRoute ? <Header onOpenCommandPalette={() => setCommandPaletteOpen(true)} /> : null}
        {!isModelingWorkbenchRoute ? <OfflineBanner /> : null}
        <main
          id="main-content"
          role="main"
          aria-label="主要内容"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-slate-50/80 focus-visible:outline-none"
        >
          <div className="w-full">
            <PageErrorBoundary>
              <Routes key={location.pathname}>
                <Route path="/" element={<Navigate to="/workspace" replace />} />
                <Route path="/workspace" element={withRouteBoundary(<WorkspacePage />)} />
                <Route path="/demo" element={withRouteBoundary(<DemoPreviewPage />)} />
                <Route path="/company" element={withRouteBoundary(<CompanyCockpit />)} />
                <Route path="/settings/billing" element={withRouteBoundary(<BillingSettings />)} />
                <Route path="/admin/business-types" element={withRouteBoundary(<CustomBusinessTypeAdmin />)} />
                <Route path="/admin/duration-accuracy" element={withRouteBoundary(<DurationAccuracyAdmin />)} />
                <Route path="/admin/rule-assets/governance-workbench" element={withRouteBoundary(<RuleAssetGovernanceWorkbenchAdmin />)} />
                <Route path="/admin/duration-assets" element={withRouteBoundary(<DurationAssetsAdmin />)} />
                <Route
                  path="/projects/:id"
                  element={<ProjectRouteElement />}
                >
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={withRouteBoundary(<Dashboard />)} />
                  <Route path="gantt" element={<GanttRouteElement />} />
                  <Route path="risks" element={withRouteBoundary(<RiskManagement />)} />
                  <Route path="milestones" element={withRouteBoundary(<Milestones />)} />
                  <Route path="acceptance" element={withRouteBoundary(<AcceptanceTimeline />)} />
                  <Route path="pre-milestones" element={withRouteBoundary(<PreMilestones />)} />
                  <Route path="reports" element={withRouteBoundary(<Reports />)} />
                  <Route path="task-summary" element={withRouteBoundary(<TaskSummary />)} />
                  <Route path="responsibility" element={withRouteBoundary(<ResponsibilityView />)} />
                  <Route path="planning" element={<Navigate to="baseline" replace />} />
                  <Route path="planning/baseline" element={withRouteBoundary(<BaselinePage />)} />
                  <Route path="planning/monthly" element={withRouteBoundary(<MonthlyPlanPage />)} />
                  <Route path="drawings" element={withRouteBoundary(<Drawings />)} />
                  <Route path="materials" element={withRouteBoundary(<Materials />)} />
                </Route>
                <Route path="/notifications" element={withRouteBoundary(<Notifications />)} />
                <Route path="/monitoring" element={withRouteBoundary(<MonitoringDashboard />)} />
                <Route path="/join/:code" element={withRouteBoundary(<JoinProject />)} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </PageErrorBoundary>
          </div>
          <LegalFooter />
        </main>
      </div>
      <Toaster />
      {!isModelingWorkbenchRoute ? <OnboardingGuide /> : null}
      {!isModelingWorkbenchRoute ? <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} /> : null}
      {!isModelingWorkbenchRoute ? <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} /> : null}
      {!isModelingWorkbenchRoute ? <FeedbackButton /> : null}
      <LoginDialog isOpen={showLoginDialog} onClose={closeLoginDialog} />
      <ConditionWarningModal projectId={projectId ?? undefined} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthDialogProvider>
        <TooltipProvider delayDuration={300}>
          <HashRouter future={{ v7_relativeSplatPath: true }}>
            <AppContent />
          </HashRouter>
        </TooltipProvider>
      </AuthDialogProvider>
    </AuthProvider>
  )
}
