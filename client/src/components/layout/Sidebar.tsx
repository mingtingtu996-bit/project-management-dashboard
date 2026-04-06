import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { buildProjectAttentionSnapshot } from '@/lib/projectAttention'
import type { PermissionAction } from '@/lib/permissions'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  FolderKanban,
  GanttChart,
  LayoutDashboard,
  Menu,
  Plus,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  permission?: PermissionAction
  children?: Array<Pick<NavItem, 'name' | 'href' | 'permission'>>
}

const companyNavigation: NavItem[] = [
  { name: '公司驾驶舱', href: '/company', icon: Building2 },
  { name: '提醒中心', href: '/notifications', icon: Bell },
]

const projectNavigationAll: NavItem[] = [
  { name: 'Dashboard', href: '/projects/:id/dashboard', icon: LayoutDashboard, permission: 'view:project' },
  { name: '里程碑', href: '/projects/:id/milestones', icon: Flag, permission: 'view:milestone' },
  { name: 'WBS 模板', href: '/projects/:id/wbs-templates', icon: FolderKanban, permission: 'view:task' },
  {
    name: '任务管理',
    href: '/projects/:id/gantt',
    icon: GanttChart,
    permission: 'view:task',
    children: [
      { name: '任务列表', href: '/projects/:id/gantt', permission: 'view:task' },
      { name: '任务总结', href: '/projects/:id/task-summary', permission: 'view:task' },
    ],
  },
  { name: '风险与问题', href: '/projects/:id/risks', icon: AlertTriangle, permission: 'view:risk' },
  {
    name: '证照管理',
    href: '/projects/:id/pre-milestones',
    icon: Calendar,
    permission: 'view:project',
    children: [
      { name: '前期证照', href: '/projects/:id/pre-milestones', permission: 'view:project' },
      { name: '验收时间轴', href: '/projects/:id/acceptance', permission: 'view:project' },
    ],
  },
]

function resolveHref(href: string, projectId?: string | null) {
  return href.replace(':id', projectId || '')
}

function isActivePath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`)
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
  const navigation = isProjectPage ? projectNavigationAll : companyNavigation

  const filteredNavigation = navigation.filter((item) => !item.permission || can.check(item.permission))

  const renderTopNavItem = (item: NavItem) => {
    const target = resolveHref(item.href, currentProject?.id)
    const active = isActivePath(location.pathname, target)
    const hasChildren = Boolean(item.children?.length)
    const childActive = item.children?.some((child) => {
      const childTarget = resolveHref(child.href, currentProject?.id)
      return isActivePath(location.pathname, childTarget)
    })
    const isCurrent = active || childActive
    const badgeCount =
      item.name === '提醒中心'
        ? companyAttentionSnapshot.totalAttentionCount
        : item.name === '风险与问题'
          ? attentionSnapshot.totalAttentionCount
          : 0

    return (
      <li key={item.name}>
        <Link
          to={target}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
            isCurrent
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white',
          )}
          onClick={() => setMobileOpen(false)}
        >
          <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
          {sidebarOpen && <span className="flex-1">{item.name}</span>}
          {sidebarOpen && badgeCount > 0 && (
            <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
          {sidebarOpen && hasChildren && <ChevronRight className="h-4 w-4 text-slate-500" />}
        </Link>

        {sidebarOpen && hasChildren && isCurrent && (
          <ul className="mt-1 space-y-1 border-l border-slate-800 pl-4">
            {item.children
              ?.filter((child) => !child.permission || can.check(child.permission))
              .map((child) => {
                const childTarget = resolveHref(child.href, currentProject?.id)
                const childActive = isActivePath(location.pathname, childTarget)

                return (
                  <li key={child.name}>
                    <Link
                      to={childTarget}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                        childActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-400 hover:bg-slate-900/80 hover:text-white',
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', childActive ? 'bg-blue-400' : 'bg-slate-600')} />
                      <span className="truncate">{child.name}</span>
                    </Link>
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
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur lg:hidden"
      >
        <Menu className="h-5 w-5 text-slate-700" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'w-64' : 'w-[72px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className={cn(
            'flex items-center border-b border-slate-800 px-4',
            sidebarOpen ? 'h-16 justify-between' : 'h-16 justify-center',
          )}
        >
          {sidebarOpen ? (
            <Link to="/company" className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-wide text-white">工程管理系统</div>
                <div className="text-xs text-slate-400">公司驾驶舱 / 项目工作台</div>
              </div>
            </Link>
          ) : (
            <Link to="/company" className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
              <Building2 className="h-5 w-5 text-white" />
            </Link>
          )}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white lg:inline-flex"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1.5">
            {filteredNavigation.map(renderTopNavItem)}
          </ul>

          {sidebarOpen && currentProject && isProjectPage && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">当前项目</div>
              <div className="truncate text-sm font-semibold text-white">{currentProject.name}</div>
              <div className="mt-1 text-xs text-slate-400">{currentProject.description || '项目工作台'}</div>
              <Link
                to="/company"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-300 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回公司驾驶舱
              </Link>
            </div>
          )}

        </nav>

        <div className="border-t border-slate-800 p-3">
          <Link
            to="/company?create=1"
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white transition-all hover:bg-blue-500',
              sidebarOpen ? 'w-full px-3 py-3 text-sm font-medium' : 'p-3',
            )}
          >
            <Plus className={sidebarOpen ? 'h-4 w-4' : 'h-5 w-5'} />
            {sidebarOpen && '新建项目'}
          </Link>
        </div>
      </aside>
    </>
  )
}
