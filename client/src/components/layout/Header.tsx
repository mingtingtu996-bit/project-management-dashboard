import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'

import { useStore } from '@/hooks/useStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bell,
  Check,

  Copy,
  LogOut,
  Search,
  Settings,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { buildProjectAttentionSnapshot } from '@/lib/projectAttention'

function getShellTitle(pathname: string) {
  if (pathname === '/company') return '公司驾驶舱'
  if (pathname === '/notifications') return '提醒中心'
  if (pathname === '/monitoring') return '监控中心'
  if (pathname.startsWith('/projects/')) return '项目工作台'
  return '工程管理系统'
}

function getContextLabel(pathname: string) {
  if (pathname === '/company') return '公司级总览'
  if (pathname === '/notifications') return '提醒聚合'
  if (pathname.includes('/dashboard')) return '项目 Dashboard'
  if (pathname.includes('/gantt')) return '任务管理 / 任务列表'
  if (pathname.includes('/risks')) return '风险与问题'
  if (pathname.includes('/milestones')) return '里程碑'
  if (pathname.includes('/wbs-templates')) return 'WBS 模板'
  if (pathname.includes('/acceptance')) return '证照管理 / 验收时间轴'
  if (pathname.includes('/pre-milestones')) return '证照管理 / 前期证照'
  if (pathname.includes('/task-summary')) return '任务管理 / 任务总结'
  if (pathname.includes('/team')) return '辅助能力 / 团队成员'
  if (pathname.includes('/reports')) return '模块分析 / 正式承接'
  if (pathname.includes('/monitoring')) return '隐藏工具 / 监控承接'
  return '项目级工作台'
}

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, currentProject, connectionMode, tasks, risks, conditions, obstacles, acceptancePlans } = useStore()
  const [copied, setCopied] = useState(false)

  const attentionSnapshot = useMemo(
    () =>
      buildProjectAttentionSnapshot(
        currentProject?.id,
        tasks,
        risks,
        conditions,
        obstacles,
        acceptancePlans,
      ),
    [acceptancePlans, conditions, currentProject?.id, obstacles, risks, tasks],
  )

  const title = getShellTitle(location.pathname)
  const contextLabel = getContextLabel(location.pathname)

  const copyInvitationCode = async () => {
    if (!currentProject?.primary_invitation_code) return

    const url = `${window.location.origin}/join/${currentProject.primary_invitation_code}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast({
      title: '链接已复制',
      description: '邀请链接已复制到剪贴板',
      variant: 'default',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const isProjectPage = location.pathname.startsWith('/projects/')

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <div className="hidden lg:block">
          <div className="text-[18px] font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{contextLabel}</div>
        </div>

        {currentProject && isProjectPage && (
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="max-w-[160px] truncate font-medium xl:max-w-[220px]">{currentProject.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              currentProject.status === 'completed' || currentProject.status === '已完成'
                ? 'bg-emerald-100 text-emerald-700'
                : currentProject.status === 'in_progress' || currentProject.status === 'active' || currentProject.status === '进行中'
                  ? 'bg-blue-100 text-blue-700'
                  : currentProject.status === 'paused' || currentProject.status === 'archived' || currentProject.status === '已暂停'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
            }`}>
              {currentProject.status === 'in_progress' || currentProject.status === 'active'
                ? '进行中'
                : currentProject.status === 'completed'
                  ? '已完成'
                  : currentProject.status === 'paused' || currentProject.status === 'archived'
                    ? '已暂停'
                    : currentProject.status || '未开始'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-end gap-3 lg:gap-5">
        <div className="relative hidden lg:block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="搜索项目、任务或提醒..."
            className="h-11 w-[360px] rounded-2xl border-slate-200 bg-slate-50 pl-11 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
          {connectionMode === 'websocket' ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="hidden sm:inline">实时同步</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-yellow-500" />
              <span className="hidden sm:inline">轮询模式</span>
            </>
          )}
        </div>

        {currentProject && isProjectPage && currentProject.primary_invitation_code && (
          <Button
            variant="outline"
            size="sm"
            onClick={copyInvitationCode}
            className="hidden h-10 rounded-2xl border-slate-200 bg-white px-3 text-slate-600 shadow-none hover:bg-slate-50 lg:inline-flex"
          >
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
        )}

        <Button asChild variant="ghost" size="icon" className="relative hidden h-10 w-10 rounded-2xl text-slate-600 hover:bg-slate-100 sm:flex">
          <Link to="/notifications">
            <Bell className="h-5 w-5" />
            {attentionSnapshot.totalAttentionCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {attentionSnapshot.totalAttentionCount > 99 ? '99+' : attentionSnapshot.totalAttentionCount}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 rounded-2xl px-2 text-slate-700 hover:bg-slate-100 lg:px-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{currentUser?.display_name?.slice(0, 2) || '用户'}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[120px] truncate sm:inline">
                {currentUser?.display_name || '未命名用户'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>我的账户</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/notifications')}>
              <Settings className="mr-2 h-4 w-4" />
              提醒与设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
