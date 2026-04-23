import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, Copy, KeyRound, LogIn, LogOut, Search, Settings, User, Wifi, WifiOff } from 'lucide-react'

import { EditProfileDialog } from '@/components/EditProfileDialog'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { ProjectTeamManagementDrawer } from '@/components/team/ProjectTeamManagementDrawer'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useNotifications, useRealtimeConnectionState, useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { getShellNavigationMeta } from '@/config/navigation'
import { buildProjectAttentionSnapshot } from '@/lib/projectAttention'
import { getGlobalRoleLabel, getProjectRoleLabel } from '@/lib/roleLabels'

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, currentProject, connectionMode, tasks, risks, conditions, obstacles, acceptancePlans } = useStore()
  const realtimeConnectionState = useRealtimeConnectionState()
  const { isAuthenticated, logout, user } = useAuth()
  const { openLoginDialog } = useAuthDialog()
  const { permissionLevel, globalRole, canManageTeam } = usePermissions()
  const [copied, setCopied] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false)

  const attentionSnapshot = useMemo(
    () => buildProjectAttentionSnapshot(currentProject?.id, tasks, risks, conditions, obstacles, acceptancePlans),
    [acceptancePlans, conditions, currentProject?.id, obstacles, risks, tasks],
  )

  const storeNotifications = useNotifications()
  const notificationUnreadCount = useMemo(() => {
    if (!storeNotifications || storeNotifications.length === 0) return 0
    return storeNotifications.filter((n) => !n.isRead && !n.isMuted).length
  }, [storeNotifications])

  const bellBadgeCount = attentionSnapshot.totalAttentionCount + notificationUnreadCount

  const { title, contextLabel } = getShellNavigationMeta(location.pathname)
  const isProjectPage = location.pathname.startsWith('/projects/')
  const userName = user?.display_name || currentUser?.display_name || '未命名用户'

  useEffect(() => {
    const titleParts = [title]
    if (isProjectPage && currentProject?.name) {
      titleParts.unshift(currentProject.name)
    }
    if (contextLabel) {
      titleParts.push(contextLabel)
    }
    titleParts.push('项目管理 Dashboard')
    document.title = titleParts.join(' · ')
  }, [contextLabel, currentProject?.name, isProjectPage, title])

  const copyInvitationCode = async () => {
    if (!currentProject?.primary_invitation_code) return
    const url = `${window.location.origin}/#/join/${currentProject.primary_invitation_code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast({
      title: '链接已复制',
      description: '邀请链接已复制到剪贴板',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const syncIndicator =
    connectionMode === 'polling'
      ? { icon: WifiOff, iconClassName: 'text-yellow-500', label: '轮询模式' }
      : realtimeConnectionState === 'connected'
        ? { icon: Wifi, iconClassName: 'text-green-500', label: '实时同步' }
        : realtimeConnectionState === 'connecting' || realtimeConnectionState === 'reconnecting'
          ? { icon: Wifi, iconClassName: 'text-amber-500', label: '实时重连中' }
          : { icon: WifiOff, iconClassName: 'text-rose-500', label: '实时已断开' }

  const SyncIcon = syncIndicator.icon

  const scheduleMenuAction = (action: () => void) => {
    setAccountMenuOpen(false)
    window.setTimeout(action, 0)
  }

  const handleLogout = async () => {
    const redirectTarget = `${location.pathname}${location.search}`
    try {
      window.sessionStorage.setItem('pending_auth_redirect', redirectTarget)
    } catch {
      // sessionStorage 不可用时静默跳过
    }

    setAccountMenuOpen(false)
    await logout()
    navigate(`/company?login=1&redirect=${encodeURIComponent(redirectTarget)}`, { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <div className="hidden lg:block">
          <div className="text-[18px] font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{contextLabel}</div>
        </div>

        {currentProject && isProjectPage ? (
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="max-w-[160px] truncate font-medium xl:max-w-[220px]">{currentProject.name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {getProjectRoleLabel(permissionLevel)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-end gap-3 lg:gap-5">
        <div className="relative hidden lg:block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="搜索项目、任务或提醒"
            placeholder="搜索项目、任务或提醒..."
            className="h-11 w-[360px] rounded-2xl border-slate-200 bg-slate-50 pl-11 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
          <SyncIcon className={`h-4 w-4 ${syncIndicator.iconClassName}`} />
          <span className="hidden sm:inline">{syncIndicator.label}</span>
        </div>

        {currentProject && isProjectPage && currentProject.primary_invitation_code ? (
          <Button variant="outline" size="sm" onClick={copyInvitationCode} className="hidden h-10 rounded-2xl border-slate-200 bg-white px-3 text-slate-600 shadow-none hover:bg-slate-50 lg:inline-flex">
            {copied ? (
              <>
                <Check className="mr-1 h-4 w-4 text-green-500" />
                <span className="text-green-600">已复制</span>
              </>
            ) : (
              <>
                <Copy className="mr-1 h-4 w-4" />
                复制邀请链接
              </>
            )}
          </Button>
        ) : null}

        <Button asChild variant="ghost" size="icon" className="relative hidden h-10 w-10 rounded-2xl text-slate-600 hover:bg-slate-100 sm:flex">
          <Link to="/notifications" aria-label="打开提醒中心">
            <Bell className="h-5 w-5" />
            {bellBadgeCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {bellBadgeCount > 99 ? '99+' : bellBadgeCount}
              </span>
            ) : null}
          </Link>
        </Button>

        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="打开用户菜单" className="h-10 rounded-2xl px-2 text-slate-700 hover:bg-slate-100 lg:px-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{userName.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[120px] truncate sm:inline">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {isAuthenticated ? (
              <>
                <DropdownMenuLabel className="space-y-1">
                  <div>我的账户</div>
                  <div className="text-xs font-normal text-slate-500">{getGlobalRoleLabel(user?.globalRole || globalRole)}</div>
                  {currentProject && isProjectPage ? (
                    <div className="text-xs font-normal text-slate-500">{getProjectRoleLabel(permissionLevel)}</div>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => scheduleMenuAction(() => setProfileDialogOpen(true))}>
                  <User className="mr-2 h-4 w-4" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => scheduleMenuAction(() => setChangePasswordOpen(true))}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  修改密码
                </DropdownMenuItem>
                {currentProject && isProjectPage && canManageTeam ? (
                  <DropdownMenuItem onSelect={() => scheduleMenuAction(() => setTeamDrawerOpen(true))}>
                    <Settings className="mr-2 h-4 w-4" />
                    团队管理
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onSelect={() => { void handleLogout() }}>
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuLabel>未登录</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => scheduleMenuAction(openLoginDialog)}>
                  <LogIn className="mr-2 h-4 w-4" />
                  登录
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <EditProfileDialog isOpen={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} />
        <ChangePasswordDialog isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
        {currentProject?.id ? (
          <ProjectTeamManagementDrawer open={teamDrawerOpen} onOpenChange={setTeamDrawerOpen} projectId={currentProject.id} projectName={currentProject.name} />
        ) : null}
      </div>
    </header>
  )
}
