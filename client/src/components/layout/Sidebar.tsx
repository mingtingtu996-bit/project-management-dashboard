import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { buildProjectAttentionSnapshot } from '@/lib/projectAttention'
import { COMPANY_NAVIGATION, PROJECT_NAVIGATION, PROJECT_NAVIGATION_LABELS, type NavigationItem } from '@/config/navigation'
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Menu,
  Plus,
  X,
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

type NavItem = NavigationItem

function resolveHref(href: string, projectId?: string | null) {
  return href.replace(':id', projectId || '')
}

function isActivePath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`)
}

function getOnboardingTarget(key: string) {
  if (key === 'dashboard') return 'dashboard-nav'
  if (key === 'planning' || key === 'planning-baseline') return 'planning-nav'
  if (key === 'tasks' || key === 'gantt') return 'gantt-nav'
  if (key === 'reports') return 'reports-nav'
  return undefined
}

export default function Sidebar() {
  const location = useLocation()
  const {
    sidebarOpen,
    setSidebarOpen,
    currentProject,
    tasks,
    risks,
    conditions,
    obstacles,
    acceptancePlans,
  } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { can } = usePermissions()

  const attentionSnapshot = useMemo(
    () => buildProjectAttentionSnapshot(currentProject?.id, tasks, risks, conditions, obstacles, acceptancePlans),
    [acceptancePlans, conditions, currentProject?.id, obstacles, risks, tasks],
  )
  const companyAttentionSnapshot = useMemo(
    () => buildProjectAttentionSnapshot(null, tasks, risks, conditions, obstacles, acceptancePlans),
    [acceptancePlans, conditions, obstacles, risks, tasks],
  )

  const isProjectPage = /\/projects\/[^/]+/.test(location.pathname)
  const routeProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null
  const navigationProjectId = currentProject?.id ?? routeProjectId
  const navigation = isProjectPage ? PROJECT_NAVIGATION : COMPANY_NAVIGATION

  const filteredNavigation = navigation.filter((item) => !item.permission || can.check(item.permission))

  const renderTopNavItem = (item: NavItem) => {
    const target = resolveHref(item.href, navigationProjectId)
    const active = isActivePath(location.pathname, target)
    const hasChildren = Boolean(item.children?.length)
    const childActive = item.children?.some((child) => {
      const childTarget = resolveHref(child.href, navigationProjectId)
      return isActivePath(location.pathname, childTarget)
    })
    const isCurrent = active || childActive
    const badgeCount =
      item.key === 'notifications'
        ? isProjectPage
          ? attentionSnapshot.totalAttentionCount
          : companyAttentionSnapshot.totalAttentionCount
        : item.key === 'risks'
          ? attentionSnapshot.activeRiskCount
          : 0

    return (
      <li key={item.key}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={target}
              data-onboarding-target={getOnboardingTarget(item.key)}
              className={cn(
                'group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
                isCurrent
                  ? 'bg-blue-600 text-white shadow-[var(--el-2)]'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white',
              )}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span className="flex-1">{item.label}</span>}
              {sidebarOpen && badgeCount > 0 && (
                <span className="min-w-5 rounded-full bg-red-700 px-1.5 py-0.5 text-center text-xs font-semibold leading-none text-white">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
              {sidebarOpen && hasChildren && <ChevronRight className="h-4 w-4 text-slate-500" />}
            </Link>
          </TooltipTrigger>
          <TooltipContent>{!sidebarOpen ? item.label : undefined}</TooltipContent>
        </Tooltip>

        {sidebarOpen && hasChildren && isCurrent && (
          <ul className="mt-1 space-y-1 border-l border-slate-800 pl-4">
            {item.children
              ?.filter((child) => !child.permission || can.check(child.permission))
              .map((child) => {
                const childTarget = resolveHref(child.href, navigationProjectId)
                const childActive = isActivePath(location.pathname, childTarget)

                return (
                  <li key={child.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={childTarget}
                          data-onboarding-target={getOnboardingTarget(child.key)}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
                            childActive
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-500 hover:bg-slate-900/80 hover:text-white',
                          )}
                          onClick={() => setMobileOpen(false)}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', childActive ? 'bg-blue-400' : 'bg-slate-600')} />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>{!sidebarOpen ? child.label : undefined}</TooltipContent>
                    </Tooltip>
                  </li>
                )
              })}
          </ul>
        )}
      </li>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMobileOpen(true)}
        aria-label="打开导航菜单"
        aria-controls="app-sidebar"
        aria-expanded={mobileOpen}
        className="fixed left-4 top-4 z-50 rounded-xl border border-slate-100 bg-white/95 shadow-lg backdrop-blur transition-colors duration-200 hover:bg-slate-100 hover:shadow-[var(--el-1)] lg:hidden"
      >
        <Menu className="h-5 w-5 text-slate-700" />
      </Button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航遮罩"
          className="fixed left-0 top-0 z-40 h-screen w-screen bg-slate-950/45 p-0 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        data-onboarding-target="sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-100 transition-[transform,width] duration-300 ease-out lg:relative lg:translate-x-0',
          sidebarOpen ? 'w-64' : 'w-[var(--sidebar-collapsed-width)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭导航菜单"
          className="absolute right-4 top-4 h-8 w-8 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </Button>

        <div
          className={cn(
            'flex items-center px-4',
            sidebarOpen ? 'h-16 justify-between' : 'h-16 justify-center',
          )}
        >
          {sidebarOpen ? (
            <Link
              to="/company"
              className="flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-[var(--el-2)]">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-wide text-white">{'\u5de5\u7a0b\u7ba1\u7406\u7cfb\u7edf'}</div>
                <div className="text-xs text-slate-500">
                  {PROJECT_NAVIGATION_LABELS.company} / {PROJECT_NAVIGATION_LABELS.projectHome}
                </div>
              </div>
            </Link>
          ) : (
            <Link
              to="/company"
              aria-label="返回公司驾驶舱"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-[var(--el-2)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Building2 className="h-5 w-5 text-white" />
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            className="hidden h-8 w-8 rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white lg:inline-flex"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
        </div>
        <Separator className="border-slate-800" />

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1.5">
            {filteredNavigation.map(renderTopNavItem)}
          </ul>

          {sidebarOpen && currentProject && isProjectPage && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">{'\u5f53\u524d\u9879\u76ee'}</div>
                <div className="truncate text-sm font-semibold text-white">{currentProject.name}</div>
              <div className="mt-1 text-xs text-slate-500">{currentProject.description || PROJECT_NAVIGATION_LABELS.projectHome}</div>
              <Link
                to="/company"
                className="mt-3 inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-300 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {'\u8fd4\u56de\u516c\u53f8\u9a71\u9a76\u8231'}
              </Link>
            </div>
          )}

        </nav>

        <Separator className="border-slate-800" />
        <div className="p-3">
          <Link
            to="/company?create=1"
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white outline-none transition-all duration-200 hover:bg-[var(--brand-primary-hover)] hover:shadow-[var(--el-2)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
              sidebarOpen ? 'w-full px-3 py-3 text-sm font-medium' : 'p-3',
            )}
          >
            <Plus className={sidebarOpen ? 'h-4 w-4' : 'h-5 w-5'} />
            {sidebarOpen && '\u65b0\u5efa\u9879\u76ee'}
          </Link>
        </div>
      </aside>
    </>
  )
}
