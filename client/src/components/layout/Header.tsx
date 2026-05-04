import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, Command, Copy, KeyRound, LogIn, LogOut, Search, Settings, User, Wifi, WifiOff } from 'lucide-react'

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

interface HeaderProps {
  onOpenCommandPalette?: () => void
}

export default function Header({ onOpenCommandPalette }: HeaderProps) {
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
  const isMacPlatform = useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform),
    [],
  )
  const shellIdentity = useMemo(() => {
    if (currentProject && isProjectPage) {
      const projectName = currentProject.name?.trim() || '当前项目'
      const parts = projectName.split('-').filter(Boolean)
      const primary = parts.length >= 3 && /^[A-Z0-9]+$/i.test(parts[0]) ? parts.slice(0, 2).join('-') : projectName
      const secondary = primary === projectName ? contextLabel || '项目工作台' : parts.slice(2).join('-') || contextLabel || '项目工作台'
      const initials = primary
        .split(/[\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()

      return { primary, secondary, initials: initials || 'P' }
    }

    const initials = title
      .split(/[\s/_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()

    return { primary: title, secondary: contextLabel, initials: initials || 'W' }
  }, [contextLabel, currentProject, isProjectPage, title])
  const avatarClassName = useMemo(() => {
    const palette = ['bg-blue-600', 'bg-emerald-600', 'bg-sky-600', 'bg-slate-700', 'bg-rose-600', 'bg-amber-600']
    const seed = userName.charCodeAt(0) || 0
    return palette[seed % palette.length]
  }, [userName])

  useEffect(() => {
    const titleParts = [title]
    if (isProjectPage && currentProject?.name) {
      titleParts.unshift(currentProject.name)
    }
    if (contextLabel) {
      titleParts.push(contextLabel)
    }
    titleParts.push('仪表盘')
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
        ? { icon: Wifi, iconClassName: 'text-emerald-500', label: '实时同步' }
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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl lg:px-8">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <div className="shell-avatar-text flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          {shellIdentity.initials.slice(0, 2)}
        </div>
        <div className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="shell-identity-text max-w-40 truncate text-slate-900 xl:max-w-56">{shellIdentity.primary}</span>
          <span className="meta-muted max-w-40 truncate xl:max-w-64">{shellIdentity.secondary}</span>
        </div>
      </div>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
          <Input
            aria-label="打开命令面板"
            placeholder="搜索项目、任务或提醒..."
            readOnly
            onClick={onOpenCommandPalette}
            onFocus={onOpenCommandPalette}
            className="command-input-text h-9 w-72 rounded-lg border-transparent bg-slate-50 pl-9 pr-20 text-slate-600 shadow-none placeholder:text-slate-400 transition-colors hover:border-slate-200 hover:bg-white focus-visible:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500/20 xl:w-80"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-slate-400">
            {isMacPlatform ? (
              <kbd className="kbd-hint num-mono flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-white px-1">
                <Command className="h-2.5 w-2.5" strokeWidth={1.75} />
              </kbd>
            ) : (
              <kbd className="kbd-hint num-mono flex h-5 min-w-8 items-center justify-center rounded border border-slate-200 bg-white px-1">
                Ctrl
              </kbd>
            )}
            <kbd className="kbd-hint num-mono flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-white px-1">
              K
            </kbd>
          </span>
        </div>

        <div className="topbar-control-text flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-slate-600 ring-1 ring-inset ring-slate-200/60">
          <SyncIcon className={`h-3.5 w-3.5 ${syncIndicator.iconClassName}`} strokeWidth={1.5} />
          <span className="hidden sm:inline">{syncIndicator.label}</span>
        </div>

        {currentProject && isProjectPage && currentProject.primary_invitation_code ? (
          <Button variant="outline" size="sm" onClick={copyInvitationCode} className="topbar-control-text hidden h-9 rounded-lg border-slate-200 bg-white px-3 text-slate-600 shadow-none hover:bg-slate-50 xl:inline-flex">
            {copied ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
                <span className="text-emerald-600">已复制</span>
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                复制邀请
              </>
            )}
          </Button>
        ) : null}

        <Button asChild variant="ghost" size="icon" className="relative hidden h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:flex">
          <Link to="/notifications" aria-label="打开提醒中心">
            <Bell className="h-4 w-4" strokeWidth={1.5} />
            {bellBadgeCount > 0 ? (
              bellBadgeCount <= 3 ? (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
              ) : (
                <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-xs font-bold text-white">
                  {bellBadgeCount > 99 ? '99+' : bellBadgeCount}
                </span>
              )
            ) : null}
          </Link>
        </Button>

        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="打开用户菜单" className="topbar-control-text h-9 rounded-lg px-1.5 text-slate-700 hover:bg-slate-100 lg:px-2">
              <Avatar className="h-8 w-8 ring-1 ring-white">
                <AvatarFallback className={`${avatarClassName} meta-text font-medium text-white`}>
                  {userName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate sm:inline">{userName}</span>
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
