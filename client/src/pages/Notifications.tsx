import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApi } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage, isBackendUnavailableError } from '@/lib/apiClient'
import {
  exportTasksToExcel,
  exportRisksToExcel,
  exportMilestonesToExcel,
  importTasksFromExcel,
  downloadTaskTemplate,
  exportToJSON,
  exportAllData,
} from '@/lib/dataExport'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  GanttChart,
  Info,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type ReminderScope = 'company' | 'current-project'
type ReminderTab = 'all' | 'unread' | 'risk-issues' | 'follow-up' | 'system'

interface NotificationApiItem {
  id: string
  project_id?: string
  projectId?: string
  type?: string
  severity?: string
  title: string
  content?: string
  message?: string
  is_read?: boolean
  read?: boolean
  is_broadcast?: boolean
  source_entity_type?: string
  source_entity_id?: string
  sourceEntityType?: string
  sourceEntityId?: string
  recipients?: unknown
  category?: string
  assignee?: string
  task_id?: string
  taskId?: string
  milestone_id?: string
  milestoneId?: string
  data?: Record<string, unknown>
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

interface NormalizedNotification {
  id: string
  projectId?: string
  type: string
  severity?: string
  title: string
  content: string
  isRead: boolean
  isBroadcast?: boolean
  sourceEntityType?: string
  sourceEntityId?: string
  category?: string
  assignee?: string
  taskId?: string
  milestoneId?: string
  data?: Record<string, unknown>
  createdAt: string
  updatedAt?: string
}

interface NotificationTarget {
  key: 'dashboard' | 'tasks' | 'risks' | 'license' | 'project-home'
  label: string
  href: string
}

const TAB_OPTIONS: Array<{ value: ReminderTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'risk-issues', label: '风险 / 问题' },
  { value: 'follow-up', label: '关键跟进' },
  { value: 'system', label: '系统 / 广播' },
]

function normalizeNotification(raw: NotificationApiItem): NormalizedNotification {
  return {
    id: raw.id,
    projectId: raw.project_id ?? raw.projectId,
    type: raw.type || 'system',
    severity: raw.severity,
    title: raw.title,
    content: raw.content ?? raw.message ?? '',
    isRead: raw.is_read ?? raw.read ?? false,
    isBroadcast: raw.is_broadcast,
    sourceEntityType: raw.source_entity_type ?? raw.sourceEntityType,
    sourceEntityId: raw.source_entity_id ?? raw.sourceEntityId,
    category: raw.category,
    assignee: raw.assignee,
    taskId: raw.task_id ?? raw.taskId,
    milestoneId: raw.milestone_id ?? raw.milestoneId,
    data: raw.data,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt,
  }
}

function isReminderNotification(notification: NormalizedNotification) {
  const token = `${notification.category || ''} ${notification.type || ''} ${notification.title} ${notification.content}`.toLowerCase()

  return (
    notification.category === 'system' ||
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    !notification.category ||
    token.includes('reminder') ||
    token.includes('warning') ||
    token.includes('risk') ||
    token.includes('problem') ||
    token.includes('condition') ||
    token.includes('obstacle') ||
    token.includes('acceptance') ||
    token.includes('delay') ||
    token.includes('notice')
  )
}

function resolveTarget(notification: NormalizedNotification, currentProjectId?: string): NotificationTarget {
  const projectId = notification.projectId || currentProjectId
  const token = `${notification.title} ${notification.content} ${notification.type} ${notification.category}`.toLowerCase()

  if (!projectId) {
    return {
      key: 'project-home',
      label: '提醒中心',
      href: '/notifications',
    }
  }

  if (notification.sourceEntityType === 'task' || notification.taskId || /任务|wbs|条件|阻碍|延期/.test(token)) {
    return {
      key: 'tasks',
      label: '任务管理',
      href: `/projects/${projectId}/gantt`,
    }
  }

  if (notification.sourceEntityType === 'milestone' || notification.milestoneId || /里程碑|节点/.test(token)) {
    return {
      key: 'project-home',
      label: '里程碑',
      href: `/projects/${projectId}/milestones`,
    }
  }

  if (/(风险|问题|预警|告警)/.test(token) || notification.severity === 'warning' || notification.severity === 'critical') {
    return {
      key: 'risks',
      label: '风险与问题',
      href: `/projects/${projectId}/risks`,
    }
  }

  if (/(证照|验收|图纸|许可|施工证|备案)/.test(token)) {
    return {
      key: 'license',
      label: '证照管理',
      href: `/projects/${projectId}/pre-milestones`,
    }
  }

  if (/(dashboard|总览|概览|汇总|驾驶舱)/.test(token)) {
    return {
      key: 'dashboard',
      label: 'Dashboard',
      href: `/projects/${projectId}/dashboard`,
    }
  }

  return {
    key: 'project-home',
    label: '项目总览',
    href: `/projects/${projectId}`,
  }
}

function getTargetIcon(target: NotificationTarget): LucideIcon {
  switch (target.key) {
    case 'dashboard':
      return LayoutDashboard
    case 'tasks':
      return GanttChart
    case 'risks':
      return AlertTriangle
    case 'license':
      return ShieldAlert
    default:
      return Bell
  }
}

function getTargetTone(target: NotificationTarget) {
  switch (target.key) {
    case 'dashboard':
      return {
        icon: 'text-slate-600',
        bg: 'bg-slate-100',
        badge: 'secondary' as const,
      }
    case 'tasks':
      return {
        icon: 'text-blue-600',
        bg: 'bg-blue-50',
        badge: 'default' as const,
      }
    case 'risks':
      return {
        icon: 'text-amber-600',
        bg: 'bg-amber-50',
        badge: 'destructive' as const,
      }
    case 'license':
      return {
        icon: 'text-emerald-600',
        bg: 'bg-emerald-50',
        badge: 'outline' as const,
      }
    default:
      return {
        icon: 'text-slate-600',
        bg: 'bg-slate-100',
        badge: 'secondary' as const,
      }
  }
}

function getNotificationLevelLabel(notification: NormalizedNotification) {
  if (notification.severity === 'critical') return '严重'
  if (notification.severity === 'warning') return '关注'
  if (notification.severity === 'info') return '提示'
  if (notification.isBroadcast) return '广播'
  return '提醒'
}

function getNotificationReadBadge(notification: NormalizedNotification) {
  return notification.isRead ? '已处理' : '未读'
}

function getReminderTab(notification: NormalizedNotification): Exclude<ReminderTab, 'all' | 'unread'> {
  const token = `${notification.category || ''} ${notification.type || ''} ${notification.title} ${notification.content}`.toLowerCase()

  if (
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    /(风险|问题|预警|告警)/.test(token)
  ) {
    return 'risk-issues'
  }

  if (
    /(任务|wbs|条件|阻碍|延期|里程碑|证照|验收|图纸|许可)/.test(token) ||
    Boolean(notification.taskId) ||
    Boolean(notification.milestoneId)
  ) {
    return 'follow-up'
  }

  return 'system'
}

export default function Notifications() {
  const { currentProject, connectionMode, setConnectionMode } = useStore()
  const api = useApi()
  const navigate = useNavigate()

  const [notifications, setNotifications] = useState<NormalizedNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scope, setScope] = useState<ReminderScope>('company')
  const [tab, setTab] = useState<ReminderTab>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setAssigneeDropdownOpen(false)
      }
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(event.target as Node)) {
        setSettingsPanelOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)

      let url = '/api/notifications?limit=100'
      if (scope === 'current-project' && currentProject?.id) {
        url += `&projectId=${currentProject.id}`
      }

      const response = await api.get<NotificationApiItem[]>(url)
      const normalized = (Array.isArray(response) ? response : [])
        .map(normalizeNotification)
        .filter(isReminderNotification)

      setNotifications(normalized)
    } catch (error) {
      console.error('Failed to load notifications:', error)
      const message = isBackendUnavailableError(error)
        ? '提醒中心依赖后端接口，请先确认本地后端已启动（默认 3001），再刷新重试。'
        : getApiErrorMessage(error, '提醒加载失败，请稍后重试。')

      setLoadError(message)
      toast({ title: '加载失败', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [api, currentProject?.id, scope])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/api/notifications/${id}/read`)
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)))
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      let url = '/api/notifications/read-all'
      if (scope === 'current-project' && currentProject?.id) {
        url += `?projectId=${currentProject.id}`
      }
      await api.put(url)
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/api/notifications/${id}`)
      setNotifications((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  const decoratedNotifications = useMemo(
    () =>
      notifications.map((item) => ({
        ...item,
        target: resolveTarget(item, currentProject?.id),
      })),
    [currentProject?.id, notifications],
  )

  const pendingCount = decoratedNotifications.filter((item) => !item.isRead).length
  const processedCount = decoratedNotifications.filter((item) => item.isRead).length
  const riskIssueCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'risk-issues').length
  const followUpCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'follow-up').length
  const linkedProjectCount = decoratedNotifications.filter((item) => Boolean(item.projectId)).length
  const allCount = decoratedNotifications.length

  const assigneeList = useMemo(
    () => Array.from(new Set(decoratedNotifications.map((item) => item.assignee).filter(Boolean) as string[])).sort(),
    [decoratedNotifications],
  )

  const filteredNotifications = useMemo(() => {
    return decoratedNotifications.filter((item) => {
      const assigneeMatch = assigneeFilter === 'all' || item.assignee === assigneeFilter
      const tabMatch =
        tab === 'all' ||
        (tab === 'unread' && !item.isRead) ||
        (tab !== 'all' && tab !== 'unread' && getReminderTab(item) === tab)

      return assigneeMatch && tabMatch
    })
  }, [assigneeFilter, decoratedNotifications, tab])

  const scopeLabel = scope === 'company' ? '\u516c\u53f8\u7ea7\u805a\u5408' : '\u5f53\u524d\u9879\u76ee\u805a\u7126'
  const legacyScopeDescription =
    scope === 'company'
      ? '\u9ed8\u8ba4\u5c55\u793a\u5168\u516c\u53f8\u63d0\u9192\uff0c\u4fbf\u4e8e\u4ece\u516c\u53f8\u9a7e\u9a76\u8231\u8fdb\u5165\u540e\u7edf\u4e00\u5904\u7406\u3002'
      : currentProject
        ? `\u5f53\u524d\u53ea\u67e5\u770b\u9879\u76ee\u201c${currentProject.name}\u201d\u76f8\u5173\u63d0\u9192\u3002`
        : '\u5f53\u524d\u9879\u76ee\u4e3a\u7a7a\uff0c\u5df2\u56de\u9000\u5230\u516c\u53f8\u7ea7\u805a\u5408\u3002'

  const scopeDescription =
    scope === 'company'
      ? '\u9ed8\u8ba4\u4ece\u516c\u53f8\u7ea7\u805a\u5408\u98ce\u9669\u3001\u95ee\u9898\u3001\u9884\u8b66\u4e0e\u5173\u952e\u8ddf\u8fdb\u63d0\u9192\uff0c\u5148\u5224\u65ad\u4f18\u5148\u7ea7\uff0c\u518d\u8fdb\u5165\u9879\u76ee\u5904\u7406\u3002'
      : currentProject
        ? `\u5f53\u524d\u53ea\u67e5\u770b\u9879\u76ee\u201c${currentProject.name}\u201d\u76f8\u5173\u7684\u98ce\u9669\u3001\u95ee\u9898\u548c\u5173\u952e\u8ddf\u8fdb\u63d0\u9192\u3002`
        : '\u5f53\u524d\u9879\u76ee\u4e3a\u7a7a\uff0c\u5df2\u56de\u9000\u5230\u516c\u53f8\u7ea7\u805a\u5408\u3002'

  void legacyScopeDescription

  const currentTabCount = filteredNotifications.length

  // 数据导出/导入处理器（复用自 Settings 页，逻辑无独占状态，可安全迁入）
  const handleExportTasks = async () => {
    if (!currentProject) {
      toast({ title: '请先选择一个项目', variant: 'destructive' })
      return
    }
    try {
      exportTasksToExcel(currentProject.id)
      toast({ title: '任务导出成功' })
    } catch (e) {
      toast({ title: '导出失败', description: String(e), variant: 'destructive' })
    }
  }

  const handleExportRisks = async () => {
    if (!currentProject) {
      toast({ title: '请先选择一个项目', variant: 'destructive' })
      return
    }
    try {
      exportRisksToExcel(currentProject.id)
      toast({ title: '风险导出成功' })
    } catch (e) {
      toast({ title: '导出失败', description: String(e), variant: 'destructive' })
    }
  }

  const handleExportMilestones = async () => {
    if (!currentProject) {
      toast({ title: '请先选择一个项目', variant: 'destructive' })
      return
    }
    try {
      exportMilestonesToExcel(currentProject.id)
      toast({ title: '里程碑导出成功' })
    } catch (e) {
      toast({ title: '导出失败', description: String(e), variant: 'destructive' })
    }
  }

  const handleExportJSON = () => {
    try {
      const data = exportAllData()
      exportToJSON(data)
      toast({ title: 'JSON备份导出成功' })
    } catch (e) {
      toast({ title: '导出失败', description: String(e), variant: 'destructive' })
    }
  }

  const handleImportTasks = async () => {
    if (!currentProject) {
      toast({ title: '请先选择一个项目', variant: 'destructive' })
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const result = await importTasksFromExcel(file, currentProject.id)
        if (result.success) {
          toast({ title: `导入成功，共导入 ${result.imported.tasks} 个任务` })
        } else {
          toast({ title: '导入部分成功', description: result.errors.join(', '), variant: 'destructive' })
        }
      } catch (e) {
        toast({ title: '导入失败', description: String(e), variant: 'destructive' })
      }
    }
    input.click()
  }

  const handleDownloadTemplate = () => {
    downloadTaskTemplate()
    toast({ title: '模板下载成功' })
  }

  const handleGoProcess = async (item: (typeof decoratedNotifications)[number]) => {
    if (item.projectId) {
      navigate(item.target.href)
    } else {
      navigate('/notifications')
    }

    if (!item.isRead) {
      await markAsRead(item.id)
    }
  }

  if (loading) {
    return (
      <div className="page-enter space-y-6 p-6">
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex h-40 items-center justify-center">
              <div className="animate-spin">
                <RefreshCw className="h-6 w-6 text-slate-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6 p-6">
      <PageHeader
        eyebrow={'\u516c\u53f8\u7ea7\u7b2c\u4e8c\u5165\u53e3'}
        title={'\u63d0\u9192\u4e2d\u5fc3'}
        subtitle={`${scopeDescription} ${'\u8fd9\u91cc\u96c6\u4e2d\u67e5\u770b\u98ce\u9669\u3001\u95ee\u9898\u3001\u9884\u8b66\u4e0e\u5173\u952e\u8ddf\u8fdb\uff0c\u518d\u8fdb\u5165\u9879\u76ee\u5904\u7406\u3002'}`}
      >
        <Badge variant="secondary">{scopeLabel}</Badge>
        <Badge variant="secondary">
          {connectionMode === 'websocket' ? '\u5b9e\u65f6\u540c\u6b65' : '\u8f6e\u8be2\u540c\u6b65'}
        </Badge>

        <div className="relative" ref={assigneeDropdownRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssigneeDropdownOpen((prev) => !prev)}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            {assigneeFilter === 'all' ? '\u5168\u90e8\u8d1f\u8d23\u4eba' : assigneeFilter}
            <ChevronDown className="h-4 w-4" />
          </Button>
          {assigneeDropdownOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
              <button
                onClick={() => {
                  setAssigneeFilter('all')
                  setAssigneeDropdownOpen(false)
                }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                  assigneeFilter === 'all' ? 'font-medium text-blue-600' : 'text-slate-700'
                }`}
              >
                {'\u5168\u90e8\u8d1f\u8d23\u4eba'}
              </button>
              {assigneeList.length === 0 ? (
                <div className="px-4 py-2.5 text-sm text-slate-400">{'\u6682\u65e0\u8d1f\u8d23\u4eba\u6570\u636e'}</div>
              ) : (
                assigneeList.map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setAssigneeFilter(name)
                      setAssigneeDropdownOpen(false)
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                      assigneeFilter === name ? 'font-medium text-blue-600' : 'text-slate-700'
                    }`}
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {pendingCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            {'\u5168\u90e8\u6807\u8bb0\u5df2\u8bfb'}
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={() => void loadNotifications()}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        <div className="relative" ref={settingsPanelRef}>
          <Button
            variant={settingsPanelOpen ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSettingsPanelOpen((prev) => !prev)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            {'\u63d0\u9192\u8bbe\u7f6e'}
          </Button>

          {settingsPanelOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {'\u63d0\u9192\u8303\u56f4'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={scope === 'company' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setScope('company')}
                    >
                      {'\u5168\u516c\u53f8'}
                    </Button>
                    <Button
                      variant={scope === 'current-project' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setScope('current-project')}
                      disabled={!currentProject?.id}
                    >
                      {'\u5f53\u524d\u9879\u76ee'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{scopeDescription}</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {'\u540c\u6b65\u6a21\u5f0f'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={connectionMode === 'websocket' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setConnectionMode('websocket')}
                    >
                      <Wifi className="mr-2 h-4 w-4" />
                      {'\u5b9e\u65f6\u540c\u6b65'}
                    </Button>
                    <Button
                      variant={connectionMode === 'polling' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setConnectionMode('polling')}
                    >
                      <WifiOff className="mr-2 h-4 w-4" />
                      {'\u8f6e\u8be2\u6a21\u5f0f'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {'\u8fd9\u91cc\u4ec5\u4fdd\u7559\u63d0\u9192\u5904\u7406\u76f8\u5173\u64cd\u4f5c\uff0c\u6570\u636e\u5de5\u5177\u5df2\u4e0b\u6c89\u5230\u5404\u4e1a\u52a1\u6a21\u5757\u3002'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {'\u6570\u636e\u5bfc\u5165\u5bfc\u51fa'}
                  </div>
                  <div className="mt-2 space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs text-slate-500">{'Excel \u5bfc\u51fa'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => void handleExportTasks()}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {'\u5bfc\u51fa\u4efb\u52a1'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void handleExportRisks()}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {'\u5bfc\u51fa\u98ce\u9669'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void handleExportMilestones()}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {'\u5bfc\u51fa\u91cc\u7a0b\u7891'}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs text-slate-500">{'\u6570\u636e\u5907\u4efd'}</p>
                      <Button variant="outline" size="sm" onClick={handleExportJSON}>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {'\u5bfc\u51fa JSON \u5907\u4efd'}
                      </Button>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs text-slate-500">{'Excel \u5bfc\u5165'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => void handleImportTasks()}>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          {'\u5bfc\u5165\u4efb\u52a1'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                          {'\u4e0b\u8f7d\u6a21\u677f'}
                        </Button>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {'\u5bfc\u5165\u524d\u8bf7\u5148\u9009\u62e9\u9879\u76ee\uff0c\u518d\u4e0b\u8f7d\u6a21\u677f\u6309\u683c\u5f0f\u586b\u5199'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageHeader>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="card-v4-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u63d0\u9192\u603b\u6570'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                <Info className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-slate-900">{allCount}</div>
            <p className="text-xs text-slate-500">{'\u5f53\u524d\u52a0\u8f7d\u7684\u63d0\u9192\u4e0e\u901a\u77e5\u603b\u91cf'}</p>
          </CardContent>
        </Card>

        <Card className="card-v4-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u672a\u8bfb'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50">
                <Bell className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-amber-600">{pendingCount}</div>
            <p className="text-xs text-slate-500">{'\u9700\u8981\u4f18\u5148\u5904\u7406\u7684\u63d0\u9192'}</p>
          </CardContent>
        </Card>

        <Card className="card-v4-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u98ce\u9669 / \u95ee\u9898'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-rose-600">{riskIssueCount}</div>
            <p className="text-xs text-slate-500">{'\u805a\u5408\u98ce\u9669\u3001\u95ee\u9898\u4e0e\u9884\u8b66\u578b\u63d0\u9192'}</p>
          </CardContent>
        </Card>

        <Card className="card-v4-sm">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u5173\u952e\u8ddf\u8fdb'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                <LayoutDashboard className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-blue-600">{followUpCount}</div>
            <p className="text-xs text-slate-500">
              {linkedProjectCount > 0
                ? `${linkedProjectCount} \u6761\u53ef\u76f4\u63a5\u8fdb\u5165\u9879\u76ee\u6a21\u5757\u5904\u7406\uff0c${processedCount} \u6761\u5df2\u5904\u7406`
                : '\u805a\u5408\u5ef6\u671f\u3001\u6761\u4ef6\u3001\u963b\u788d\u548c\u4e34\u671f\u4e8b\u9879'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-0">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={(value) => setTab(value as ReminderTab)} className="w-full">
              <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                {TAB_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.value}
                    value={option.value}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Badge variant="secondary">{currentTabCount} {'\u6761'}</Badge>
              <span>{'\u5f53\u524d\u7b5b\u9009\u7ed3\u679c'}</span>
            </div>
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="px-6 py-8">
              <EmptyState
                icon={Bell}
                title={
                  loadError
                    ? '\u63d0\u9192\u670d\u52a1\u6682\u4e0d\u53ef\u7528'
                    : scope === 'company'
                      ? '\u6682\u65e0\u516c\u53f8\u7ea7\u63d0\u9192'
                      : '\u5f53\u524d\u9879\u76ee\u6682\u65e0\u63d0\u9192'
                }
                description={
                  loadError ||
                  '\u5207\u6362\u63d0\u9192\u8303\u56f4\u6216\u91cd\u7f6e\u7b5b\u9009\u6761\u4ef6\u540e\u518d\u8bd5\u3002'
                }
                action={
                  <>
                    {!loadError ? (
                      <Button variant="outline" onClick={() => setTab('all')}>
                        {'\u91cd\u7f6e\u7b5b\u9009'}
                      </Button>
                    ) : null}
                    <Button onClick={() => void loadNotifications()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {loadError ? '\u91cd\u8bd5\u52a0\u8f7d' : '\u5237\u65b0\u63d0\u9192'}
                    </Button>
                  </>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredNotifications.map((item) => {
                const target = item.target
                const targetIcon = getTargetIcon(target)
                const tone = getTargetTone(target)
                const TargetIcon = targetIcon
                const timestamp = format(new Date(item.createdAt), 'MM\u6708dd\u65e5 HH:mm', { locale: zhCN })

                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-4 px-6 py-5 transition-colors hover:bg-slate-50 lg:flex-row lg:items-start lg:justify-between ${
                      item.isRead ? 'bg-white' : 'bg-blue-50/30'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="mt-0.5 flex-shrink-0">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.bg}`}>
                          <TargetIcon className={`h-5 w-5 ${tone.icon}`} />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                          <Badge variant={tone.badge}>{target.label}</Badge>
                          <Badge variant={item.isRead ? 'secondary' : 'default'}>{getNotificationReadBadge(item)}</Badge>
                          <Badge variant="outline">{getNotificationLevelLabel(item)}</Badge>
                          {item.assignee && <Badge variant="secondary">{`\u8d1f\u8d23\u4eba ${item.assignee}`}</Badge>}
                        </div>

                        <p className="text-sm leading-6 text-slate-600">{item.content}</p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {timestamp}
                          </span>
                          {item.projectId && <span>{`\u9879\u76ee ${item.projectId}`}</span>}
                          {item.sourceEntityType && <span>{`\u6765\u6e90 ${item.sourceEntityType}`}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2 lg:pt-1">
                      <Button variant="outline" size="sm" onClick={() => void handleGoProcess(item)}>
                        {'\u53bb\u5904\u7406'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>

                      {!item.isRead && (
                        <Button variant="ghost" size="icon" onClick={() => void markAsRead(item.id)} title={'\u6807\u8bb0\u5df2\u8bfb'}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void deleteNotification(item.id)}
                        title={'\u5220\u9664'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filteredNotifications.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
              <span>{`\u5171 ${filteredNotifications.length} \u6761\u63d0\u9192`}</span>
              <span>{'\u4ec5\u4fdd\u7559\u63d0\u9192\u5904\u7406\u76f8\u5173\u64cd\u4f5c\uff0c\u6570\u636e\u5de5\u5177\u5df2\u4e0b\u6c89\u5230\u5bf9\u5e94\u6a21\u5757\u3002'}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
