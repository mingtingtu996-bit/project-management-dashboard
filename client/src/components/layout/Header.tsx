import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, ChevronDown, Command, Copy, CreditCard, KeyRound, LogIn, LogOut, Search, Settings, User, Wifi, WifiOff } from 'lucide-react'

import { EditProfileDialog } from '@/components/EditProfileDialog'
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog'
import { ProjectTeamManagementDrawer } from '@/components/team/ProjectTeamManagementDrawer'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/context/AuthContext'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentCompanyRole } from '@/hooks/useCurrentCompanyRole'
import { useNotificationsByTouchpoint, useRealtimeConnectionState, useStore } from '@/hooks/useStore'
import { useAttentionSummary } from '@/hooks/useAttentionSummary'
import { toast } from '@/hooks/use-toast'
import { getShellNavigationMeta } from '@/config/navigation'
import { buildProjectAttentionSnapshot } from '@/lib/projectAttention'
import { getProjectDisplayName } from '@/lib/projectDisplay'
import { isProjectRoutePath } from '@/lib/projectRouteGuards'
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
  const { permissionLevel, canManageTeam } = usePermissions()
  const currentCompanyRole = useCurrentCompanyRole()
  const [copied, setCopied] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false)

  // v1.4.13: unified attention-summary available for Header consumption
  const { summary: attentionSummary, loaded: attentionSummaryLoaded } = useAttentionSummary(currentProject?.id)
  const attentionSnapshot = useMemo(
    () => buildProjectAttentionSnapshot(currentProject?.id, tasks, risks, conditions, obstacles, acceptancePlans),
    [acceptancePlans, conditions, currentProject?.id, obstacles, risks, tasks],
  )

  const storeNotifications = useNotificationsByTouchpoint('persistent')
  const notificationUnreadCount = useMemo(() => {
    if (!storeNotifications || storeNotifications.length === 0) return 0
    return storeNotifications.filter((n) => !n.isRead && !n.isMuted).length
  }, [storeNotifications])

  // v1.4.13: use unified attention-summary as primary; fallback to local snapshot
  const bellBadgeCount = attentionSummaryLoaded
    ? attentionSummary.totalAttentionCount
    : attentionSnapshot.totalAttentionCount + notificationUnreadCount

  const { title, contextLabel } = getShellNavigationMeta(location.pathname)
  const isProjectPage = isProjectRoutePath(location.pathname)
  const showShellTabs = !isProjectPage && ['/workspace', '/company', '/notifications', '/demo'].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
  const isCurrentCompanyAdmin = currentCompanyRole === 'company_admin'
  const canSeeCompanyCockpit = isCurrentCompanyAdmin
  const shellTabValue = location.pathname === '/company' ? 'company' : 'workspace'
  const userName = user?.display_name || currentUser?.display_name || '未命名用户'
  const isMacPlatform = useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform),
    [],
  )
  const shellIdentity = useMemo(() => {
    if (currentProject && isProjectPage) {
      const projectName = getProjectDisplayName(currentProject.name)
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
    const palette = ['bg-blue-700', 'bg-emerald-700', 'bg-sky-700', 'bg-slate-700', 'bg-rose-700', 'bg-amber-700']
    const seed = userName.charCodeAt(0) || 0
    return palette[seed % palette.length]
  }, [userName])
  const accountDisplayLabel = getGlobalRoleLabel(currentCompanyRole)

  useEffect(() => {
    const titleParts = [title]
    if (isProjectPage && currentProject?.id) {
      titleParts.unshift(getProjectDisplayName(currentProject.name))
    }
    if (contextLabel) {
      titleParts.push(contextLabel)
    }
    titleParts.push('仪表盘')
    document.title = titleParts.join(' · ')
  }, [contextLabel, currentProject?.id, currentProject?.name, isProjectPage, title])

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
      ? { icon: WifiOff, iconClassName: 'text-amber-500', label: '轮询', tooltip: '当前为轮询同步模式' }
      : realtimeConnectionState === 'connected'
        ? { icon: Wifi, iconClassName: 'text-emerald-500', label: '已同步', tooltip: '实时同步已连接' }
        : realtimeConnectionState === 'connecting' || realtimeConnectionState === 'reconnecting'
          ? { icon: Wifi, iconClassName: 'text-amber-500', label: '重连中', tooltip: '实时同步正在重连' }
          : { icon: WifiOff, iconClassName: 'text-rose-500', label: '已断开', tooltip: '实时同步已断开' }

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
    navigate(`/workspace?login=1&redirect=${encodeURIComponent(redirectTarget)}`, { replace: true })
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

      {showShellTabs ? (
        <SegmentedControl
          value={shellTabValue}
          onChange={(value) => navigate(value === 'company' ? '/company' : '/workspace')}
          className="hidden shrink-0 sm:inline-flex"
          options={[
            { value: 'workspace', label: '工作台' },
            ...(canSeeCompanyCockpit ? [{ value: 'company', label: '公司驾驶舱' }] : []),
          ]}
        />
      ) : null}

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-4 lg:pr-[clamp(72px,7vw,144px)]">
        <div
          className="hidden h-10 w-[300px] items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 text-slate-600 transition-colors hover:border-slate-300/80 hover:bg-white xl:flex xl:w-[360px] 2xl:w-[400px]"
          onClick={onOpenCommandPalette}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.5} />
          <Input
            aria-label="打开命令面板"
            placeholder="搜索项目、任务..."
            readOnly
            onClick={onOpenCommandPalette}
            onFocus={onOpenCommandPalette}
            className="command-input-text h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-slate-600 shadow-none placeholder:font-normal placeholder:text-slate-400 focus-visible:ring-0"
          />
          <span className="pointer-events-none flex shrink-0 items-center gap-0.5 text-slate-400">
            {isMacPlatform ? (
              <kbd className="kbd-hint num-mono flex h-5 min-w-5 items-center justify-center rounded-md border border-slate-200 bg-white px-1">
                <Command className="h-2.5 w-2.5" strokeWidth={1.75} />
              </kbd>
            ) : (
              <kbd className="kbd-hint num-mono flex h-5 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white px-1">
                Ctrl
              </kbd>
            )}
            <kbd className="kbd-hint num-mono flex h-5 min-w-5 items-center justify-center rounded-md border border-slate-200 bg-white px-1">
              K
            </kbd>
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="打开命令面板"
          onClick={onOpenCommandPalette}
          className="h-10 w-10 rounded-xl border border-slate-200/70 bg-white text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-900 lg:hidden"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        <div className="hidden h-6 w-px shrink-0 bg-slate-200/80 md:block" />

        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                aria-label={syncIndicator.tooltip}
                role="status"
                className="topbar-control-text flex h-10 items-center gap-2 rounded-xl px-2.5 text-slate-600 transition-colors hover:bg-slate-50 sm:px-3"
              >
                <SyncIcon className={`h-3.5 w-3.5 ${syncIndicator.iconClassName}`} strokeWidth={1.5} />
                <span className="hidden font-medium xl:inline">{syncIndicator.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{syncIndicator.tooltip}</TooltipContent>
          </Tooltip>

          {currentProject && isProjectPage && currentProject.primary_invitation_code ? (
            <Button
              variant="outline"
              size="sm"
              onClick={copyInvitationCode}
              className="topbar-control-text hidden h-10 rounded-xl border-slate-200 bg-white px-3 text-slate-600 shadow-none hover:bg-slate-50 2xl:inline-flex"
            >
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="relative hidden h-10 w-10 rounded-xl border border-transparent text-slate-500 hover:border-slate-200/70 hover:bg-slate-50 hover:text-slate-900 sm:flex">
                <Link to="/notifications" aria-label="打开提醒中心">
                  <Bell className="h-4 w-4" strokeWidth={1.5} />
                  {bellBadgeCount > 0 ? (
                    bellBadgeCount <= 3 ? (
                      <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                    ) : (
                      <span className="badge-micro num-mono absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 font-semibold text-white ring-2 ring-white">
                        {bellBadgeCount > 99 ? '99+' : bellBadgeCount}
                      </span>
                    )
                  ) : null}
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>提醒中心</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px shrink-0 bg-slate-200/80" />

        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label={`打开用户菜单，当前用户 ${userName}`} className="topbar-control-text h-10 rounded-xl border border-transparent px-1.5 text-slate-700 hover:border-slate-200/70 hover:bg-slate-50 lg:px-2">
              <Avatar className="h-8 w-8 ring-1 ring-white">
                <AvatarFallback className={`${avatarClassName} meta-text font-medium text-white`}>
                  {userName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-24 truncate text-slate-700 xl:inline">{accountDisplayLabel}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 rounded-xl border-slate-200/80 shadow-[var(--el-2)]">
            {isAuthenticated ? (
              <>
                <DropdownMenuLabel className="space-y-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{userName}</div>
                  <div className="text-xs font-normal text-slate-500">{accountDisplayLabel}</div>
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
                <DropdownMenuItem onSelect={() => scheduleMenuAction(() => navigate('/settings/billing'))}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  套餐与权益
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
        <ChangePasswordDialog
          isOpen={changePasswordOpen || Boolean(user?.passwordResetRequired)}
          required={Boolean(user?.passwordResetRequired)}
          onClose={() => setChangePasswordOpen(false)}
        />
        {currentProject?.id ? (
          <ProjectTeamManagementDrawer open={teamDrawerOpen} onOpenChange={setTeamDrawerOpen} projectId={currentProject.id} projectName={getProjectDisplayName(currentProject.name)} />
        ) : null}
      </div>
    </header>
  )
}
