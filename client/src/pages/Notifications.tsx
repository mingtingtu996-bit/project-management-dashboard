import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import {
  useConnectionMode,
  useCurrentProject,
  useLastRealtimeEvent,
  useNotifications,
  useSetConnectionMode,
  useSetCurrentProject,
  useRealtimeConnectionState,
  useStore,
} from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage, isBackendUnavailableError } from '@/lib/apiClient'
import { buildMutedUntil, getMuteDurationActionLabel, MUTE_DURATION_OPTIONS, type AllowedMuteHours } from '@/lib/muteDurations'
import { getCachedProjects } from '@/lib/projectPersistence'
import { isRealtimeNotificationEvent } from '@/lib/realtime'
import { PROJECT_NAVIGATION_LABELS, resolveNotificationTarget } from '@/config/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  GanttChart,
  Info,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trash2,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type ReminderScope = 'company' | 'current-project'
type ReminderTab =
  | 'all'
  | 'unread'
  | 'business-warning'
  | 'system-exception'
  | 'flow-reminder'
  | 'planning-mapping'
type NotificationTargetKey = 'dashboard' | 'reports' | 'tasks' | 'task-summary' | 'planning' | 'risks' | 'license' | 'special' | 'project-home'

interface NotificationApiItem {
  id: string
  project_id?: string
  projectId?: string
  type?: string
  notification_type?: string
  notificationType?: string
  severity?: string
  title: string
  content?: string
  message?: string
  is_read?: boolean
  read?: boolean
  is_broadcast?: boolean
  status?: string
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
  metadata?: Record<string, unknown>
  resolved_source?: string | null
  resolvedSource?: string | null
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

interface NormalizedNotification {
  id: string
  projectId?: string
  type: string
  notificationType?: string
  severity?: string
  title: string
  content: string
  isRead: boolean
  isMuted: boolean
  muteExpired?: boolean
  mutedUntil?: string
  isBroadcast?: boolean
  sourceEntityType?: string
  sourceEntityId?: string
  category?: string
  assignee?: string
  taskId?: string
  milestoneId?: string
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
  resolvedSource?: string | null
  createdAt: string
  updatedAt?: string
  status?: string
}

interface NotificationTarget {
  key: NotificationTargetKey
  label: string
  href: string
}

interface DecoratedNotification extends NormalizedNotification {
  target: NotificationTarget
  groupKey: string
  groupLabel: string
}

interface NotificationGroup {
  key: string
  label: string
  target: NotificationTarget
  items: DecoratedNotification[]
  unreadCount: number
  mutedCount: number
  expiredMuteCount: number
  highestSeverityRank: number
  latestCreatedAt: string
}

interface NotificationDeleteTarget {
  id: string
  title: string
  targetLabel: string
}

const TAB_OPTIONS: Array<{ value: ReminderTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'business-warning', label: '业务预警' },
  { value: 'system-exception', label: '系统异常' },
  { value: 'flow-reminder', label: '流程催办' },
  { value: 'planning-mapping', label: '映射孤立' },
]

function isPlanningMappingNotification(notification: Pick<
  NormalizedNotification,
  'category' | 'notificationType' | 'type' | 'title' | 'content' | 'sourceEntityType'
>) {
  const token = `${notification.category || ''} ${notification.notificationType || ''} ${notification.type || ''} ${notification.title} ${notification.content}`.toLowerCase()
  return (
    notification.category === 'planning_mapping_orphan' ||
    notification.notificationType === 'planning-governance-mapping' ||
    notification.type === 'planning_gov_mapping_orphan_pointer' ||
    (
      notification.sourceEntityType === 'planning_governance' &&
      /(mapping|orphan|孤立|映射)/.test(token)
    )
  )
}

function normalizeNotification(raw: NotificationApiItem): NormalizedNotification {
  const updatedAt = raw.updated_at ?? raw.updatedAt
  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined
  const mutedUntilValue = metadata?.muted_until ?? metadata?.mutedUntil
  const mutedUntil = typeof mutedUntilValue === 'string' ? mutedUntilValue : undefined
  const mutedUntilTimestamp = mutedUntil ? new Date(mutedUntil).getTime() : Number.NaN
  const muteExpired =
    raw.status === 'muted' &&
    Number.isFinite(mutedUntilTimestamp) &&
    Date.now() >= mutedUntilTimestamp
  const isMuted =
    raw.status === 'muted' &&
    (!Number.isFinite(mutedUntilTimestamp) || Date.now() < mutedUntilTimestamp)

  return {
    id: raw.id,
    projectId: raw.project_id ?? raw.projectId,
    type: raw.type || 'system',
    notificationType: raw.notification_type ?? raw.notificationType,
    severity: raw.severity,
    title: raw.title,
    content: raw.content ?? raw.message ?? '',
    isRead: Boolean(raw.is_read ?? raw.read ?? ['acknowledged', 'read'].includes(raw.status ?? '')),
    isMuted,
    muteExpired,
    mutedUntil,
    isBroadcast: raw.is_broadcast,
    sourceEntityType: raw.source_entity_type ?? raw.sourceEntityType,
    sourceEntityId: raw.source_entity_id ?? raw.sourceEntityId,
    category: raw.category,
    assignee: raw.assignee,
    taskId: raw.task_id ?? raw.taskId,
    milestoneId: raw.milestone_id ?? raw.milestoneId,
    data: raw.data,
    metadata,
    resolvedSource: raw.resolved_source ?? raw.resolvedSource ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt,
    status: raw.status,
  }
}

function isReminderNotification(notification: NormalizedNotification) {
  if (isPlanningMappingNotification(notification)) {
    return true
  }

  if (
    notification.notificationType === 'business-warning' ||
    notification.notificationType === 'system-exception' ||
    notification.notificationType === 'flow-reminder'
  ) {
    return true
  }

  const token = `${notification.category || ''} ${notification.type || ''} ${notification.title} ${notification.content}`.toLowerCase()

  return (
    notification.category === 'materials' ||
    notification.sourceEntityType === 'project_material' ||
    notification.notificationType === 'material_arrival_reminder' ||
    notification.notificationType === 'material_arrival_overdue' ||
    notification.type === 'material_arrival_reminder' ||
    notification.type === 'material_arrival_overdue' ||
    notification.category === 'system' ||
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    !notification.category ||
    /(材料|到场|逾期未到)/.test(token) ||
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

const PLANNING_SOURCE_ENTITY_TYPES = new Set(['planning', 'baseline', 'monthly_plan', 'closeout'])

function isPlanningSourceEntityType(sourceEntityType?: string) {
  return Boolean(sourceEntityType && PLANNING_SOURCE_ENTITY_TYPES.has(sourceEntityType))
}

function getTargetIcon(target: NotificationTarget): LucideIcon {
  switch (target.key) {
    case 'dashboard':
    case 'reports':
      return LayoutDashboard
    case 'task-summary':
      return GanttChart
    case 'planning':
      return GanttChart
    case 'tasks':
      return GanttChart
    case 'risks':
      return AlertTriangle
    case 'license':
    case 'special':
      return ShieldAlert
    default:
      return Bell
  }
}

function getTargetTone(target: NotificationTarget) {
  switch (target.key) {
    case 'dashboard':
    case 'reports':
      return {
        icon: 'text-slate-600',
        bg: 'bg-slate-100',
        badge: 'secondary' as const,
      }
    case 'task-summary':
      return {
        icon: 'text-orange-600',
        bg: 'bg-orange-50',
        badge: 'outline' as const,
      }
    case 'planning':
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
    case 'special':
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
  return getNotificationStateLabel(notification)
}

function getReminderTab(notification: NormalizedNotification): Exclude<ReminderTab, 'all' | 'unread'> {
  if (isPlanningMappingNotification(notification)) {
    return 'planning-mapping'
  }

  if (
    notification.notificationType === 'business-warning' ||
    notification.notificationType === 'system-exception' ||
    notification.notificationType === 'flow-reminder'
  ) {
    return notification.notificationType
  }

  const token = `${notification.category || ''} ${notification.type || ''} ${notification.title} ${notification.content}`.toLowerCase()

  if (isPlanningSourceEntityType(notification.sourceEntityType)) {
    return 'flow-reminder'
  }

  if (
    notification.category === 'risk' ||
    notification.category === 'problem' ||
    /(风险|问题|预警|告警)/.test(token)
  ) {
    return 'business-warning'
  }

  if (
    notification.category === 'materials' ||
    notification.sourceEntityType === 'project_material' ||
    notification.notificationType === 'material_arrival_reminder' ||
    notification.notificationType === 'material_arrival_overdue' ||
    notification.type === 'material_arrival_reminder' ||
    notification.type === 'material_arrival_overdue' ||
    /(材料|到场|逾期未到)/.test(token)
  ) {
    return 'flow-reminder'
  }

  if (
    /(任务|wbs|条件|阻碍|延期|里程碑|证照|验收|图纸|许可)/.test(token) ||
    Boolean(notification.taskId) ||
    Boolean(notification.milestoneId)
  ) {
    return 'flow-reminder'
  }

  return 'system-exception'
}

function getSeverityRank(notification: NormalizedNotification) {
  if (notification.severity === 'critical') return 3
  if (notification.severity === 'warning') return 2
  if (notification.severity === 'info') return 1
  return 0
}

function getNotificationStateLabel(notification: NormalizedNotification) {
  if (notification.isMuted) return '静音中'
  if (notification.muteExpired) return '静音已到期'
  if (notification.status === 'acknowledged') return '已知悉'
  if (notification.isRead) return '已处理'
  return '未读'
}

export default function Notifications() {
  const currentProject = useCurrentProject()
  const setCurrentProject = useSetCurrentProject()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { openLoginDialog } = useAuthDialog()
  const connectionMode = useConnectionMode()
  const realtimeConnectionState = useRealtimeConnectionState()
  const lastRealtimeEvent = useLastRealtimeEvent()
  const setConnectionMode = useSetConnectionMode()
  const notifications = useNotifications()
  const setNotifications = useStore((state) => state.setNotifications)
  const setSharedSliceStatus = useStore((state) => state.setSharedSliceStatus)
  const api = useApi()
  const location = useLocation()
  const navigate = useNavigate()
  const projectIdFromQuery = useMemo(() => {
    const nextProjectId = new URLSearchParams(location.search).get('projectId')
    const trimmed = nextProjectId?.trim()
    return trimmed ? trimmed : undefined
  }, [location.search])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scope, setScope] = useState<ReminderScope>('company')
  const [tab, setTab] = useState<ReminderTab>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [muteDurationHours, setMuteDurationHours] = useState<AllowedMuteHours>(24)
  const [deleteTarget, setDeleteTarget] = useState<NotificationDeleteTarget | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const realtimeRefreshTimeoutRef = useRef<number | null>(null)

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

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const nextScope = searchParams.get('scope')
    const nextProjectId = searchParams.get('projectId')

    if (nextScope === 'company') {
      setScope('company')
      return
    }

    if (!nextProjectId) return

    const cachedProject = getCachedProjects().find((project) => project.id === nextProjectId) ?? null
    if (cachedProject) {
      setCurrentProject(cachedProject as never)
    }
    setScope('current-project')
  }, [location.search, setCurrentProject])

  const loadNotifications = useCallback(async (options?: { silent?: boolean }) => {
    if (authLoading || !isAuthenticated) {
      setLoadError(null)
      setSharedSliceStatus('notifications', { loading: false, error: null })
      if (!options?.silent) {
        setLoading(false)
      }
      return
    }

    const silent = options?.silent === true
    try {
      if (!silent) {
        setLoading(true)
      }
      setLoadError(null)
      setSharedSliceStatus('notifications', { loading: !silent, error: null })

      const effectiveProjectId = scope === 'current-project'
        ? currentProject?.id ?? projectIdFromQuery
        : undefined

      let url = '/api/notifications?limit=100'
      if (effectiveProjectId) {
        url += `&projectId=${effectiveProjectId}`
      }

      const response = await api.get<NotificationApiItem[]>(url)
      if (!Array.isArray(response)) {
        throw new Error('\u63d0\u9192\u6570\u636e\u683c\u5f0f\u4e0d\u6b63\u786e')
      }
      const normalized = response
        .map(normalizeNotification)
        .filter(isReminderNotification)

      setNotifications(normalized)
      setSharedSliceStatus('notifications', { loading: false, error: null })
    } catch (error) {
      console.error('Failed to load notifications:', error)
      const message = isBackendUnavailableError(error)
        ? `${PROJECT_NAVIGATION_LABELS.notifications}\u4f9d\u8d56\u540e\u7aef\u63a5\u53e3\uff0c\u8bf7\u5148\u786e\u8ba4\u672c\u5730\u540e\u7aef\u5df2\u542f\u52a8\uff08\u9ed8\u8ba4 3001\uff09\uff0c\u518d\u5237\u65b0\u91cd\u8bd5\u3002`
        : getApiErrorMessage(error, '\u63d0\u9192\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002')

      // 10.10b: 不清空 store 数据，保留上次成功加载的内容；仅设置 error 状态
      setSharedSliceStatus('notifications', { loading: false, error: message })
      if (!silent) {
        setLoadError(message)
        toast({ title: '加载失败', description: message, variant: 'destructive' })
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [api, authLoading, currentProject?.id, isAuthenticated, projectIdFromQuery, scope, setNotifications, setSharedSliceStatus])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setLoading(false)
      setLoadError(null)
      setSharedSliceStatus('notifications', { loading: false, error: null })
      return
    }
    void loadNotifications()
  }, [authLoading, isAuthenticated, loadNotifications, setSharedSliceStatus])

  useEffect(() => {
    if (!isAuthenticated || connectionMode !== 'polling') {
      return
    }

    const interval = window.setInterval(() => {
      void loadNotifications({ silent: true })
    }, 30000)

    return () => window.clearInterval(interval)
  }, [connectionMode, isAuthenticated, loadNotifications])

  useEffect(() => {
    if (!isAuthenticated || connectionMode !== 'websocket') {
      return
    }

    const matchesScope =
      scope === 'company'
        ? isRealtimeNotificationEvent(lastRealtimeEvent)
        : isRealtimeNotificationEvent(lastRealtimeEvent, currentProject?.id)

    if (!matchesScope) {
      return
    }

    if (realtimeRefreshTimeoutRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current)
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      void loadNotifications({ silent: true })
    }, 250)

    return () => {
      if (realtimeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current)
        realtimeRefreshTimeoutRef.current = null
      }
    }
  }, [connectionMode, currentProject?.id, isAuthenticated, lastRealtimeEvent, loadNotifications, scope])

  const patchNotifications = useCallback((ids: string[], patch: Partial<NormalizedNotification>) => {
    const idSet = new Set(ids)
    setNotifications(notifications.map((item) => (idSet.has(item.id) ? { ...item, ...patch } : item)))
  }, [notifications, setNotifications])

  const acknowledgeNotification = async (id: string) => {
    try {
      await api.put(`/api/notifications/${id}/acknowledge`)
      patchNotifications([id], { isRead: true, isMuted: false, muteExpired: false, mutedUntil: undefined, status: 'acknowledged' })
    } catch (error) {
      console.error('Failed to acknowledge notification:', error)
    }
  }

  const muteNotification = async (id: string, muteHours = muteDurationHours) => {
    try {
      await api.put(`/api/notifications/${id}/mute`, { mutedHours: muteHours })
      patchNotifications([id], {
        isMuted: true,
        muteExpired: false,
        mutedUntil: buildMutedUntil(muteHours),
        status: 'muted',
      })
    } catch (error) {
      console.error('Failed to mute notification:', error)
    }
  }

  const acknowledgeNotifications = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await api.put('/api/notifications/acknowledge-group', { ids })
      patchNotifications(ids, { isRead: true, isMuted: false, muteExpired: false, mutedUntil: undefined, status: 'acknowledged' })
    } catch (error) {
      console.error('Failed to acknowledge notifications:', error)
    }
  }

  const muteNotifications = async (ids: string[], muteHours = muteDurationHours) => {
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.put(`/api/notifications/${id}/mute`, { mutedHours: muteHours })))
      patchNotifications(ids, {
        isMuted: true,
        muteExpired: false,
        mutedUntil: buildMutedUntil(muteHours),
        status: 'muted',
      })
    } catch (error) {
      console.error('Failed to mute notifications:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      let url = '/api/notifications/read-all'
      if (scope === 'current-project' && currentProject?.id) {
        url += `?projectId=${currentProject.id}`
      }
      await api.put(url)
      setNotifications(notifications.map((item) => ({ ...item, isRead: true, isMuted: false, muteExpired: false, mutedUntil: undefined, status: 'read' })))
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const requestDeleteNotification = (item: DecoratedNotification) => {
    setDeleteTarget({
      id: item.id,
      title: item.title,
      targetLabel: item.target.label,
    })
  }

  const deleteNotification = async () => {
    if (!deleteTarget) return

    try {
      setDeleteSubmitting(true)
      await api.delete(`/api/notifications/${deleteTarget.id}`)
      setNotifications(notifications.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast({
        title: '提醒已删除',
        description: `“${deleteTarget.title}”已从提醒中心移除，不会影响原业务数据。`,
      })
    } catch (error) {
      console.error('Failed to delete notification:', error)
      toast({
        title: '删除提醒失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const decoratedNotifications = useMemo(
    () =>
      notifications.map((item) => {
        const target = resolveNotificationTarget(item, currentProject?.id)
        const groupLabel = target.label
        const groupKey = `${getReminderTab(item)}:${target.key}`

        return {
          ...item,
          target,
          groupKey,
          groupLabel,
        }
      }),
    [currentProject?.id, notifications],
  )

  const pendingCount = decoratedNotifications.filter((item) => !item.isRead && !item.isMuted).length
  const processedCount = decoratedNotifications.filter((item) => item.isRead || item.isMuted).length
  const businessWarningCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'business-warning').length
  const systemExceptionCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'system-exception').length
  const flowReminderCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'flow-reminder').length
  const planningMappingCount = decoratedNotifications.filter((item) => getReminderTab(item) === 'planning-mapping').length
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
        (tab === 'unread' && !item.isRead && !item.isMuted) ||
        getReminderTab(item) === tab

      return assigneeMatch && tabMatch
    })
  }, [assigneeFilter, decoratedNotifications, tab])

  const groupedNotifications = useMemo(() => {
    const groups = new Map<string, NotificationGroup>()

    for (const item of filteredNotifications) {
      const existing = groups.get(item.groupKey)
      if (!existing) {
        groups.set(item.groupKey, {
          key: item.groupKey,
          label: item.groupLabel,
          target: item.target,
          items: [item],
          unreadCount: !item.isRead && !item.isMuted ? 1 : 0,
          mutedCount: item.isMuted ? 1 : 0,
          expiredMuteCount: item.muteExpired ? 1 : 0,
          highestSeverityRank: getSeverityRank(item),
          latestCreatedAt: item.createdAt,
        })
        continue
      }

      existing.items.push(item)
      existing.unreadCount += !item.isRead && !item.isMuted ? 1 : 0
      existing.mutedCount += item.isMuted ? 1 : 0
      existing.expiredMuteCount += item.muteExpired ? 1 : 0
      existing.highestSeverityRank = Math.max(existing.highestSeverityRank, getSeverityRank(item))
      if (item.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = item.createdAt
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          const severityDelta = getSeverityRank(right) - getSeverityRank(left)
          if (severityDelta !== 0) return severityDelta
          return right.createdAt.localeCompare(left.createdAt)
        }),
      }))
      .sort((left, right) => {
        if (right.highestSeverityRank !== left.highestSeverityRank) {
          return right.highestSeverityRank - left.highestSeverityRank
        }

        const unreadDelta = right.unreadCount - left.unreadCount
        if (unreadDelta !== 0) return unreadDelta

        return right.latestCreatedAt.localeCompare(left.latestCreatedAt)
      })
  }, [filteredNotifications])

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {}
      groupedNotifications.forEach((group) => {
        next[group.key] = current[group.key] ?? true
      })
      return next
    })
  }, [groupedNotifications])

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
  const connectionLabel =
    connectionMode === 'polling'
      ? '轮询同步'
      : realtimeConnectionState === 'connected'
        ? '实时同步'
        : realtimeConnectionState === 'connecting' || realtimeConnectionState === 'reconnecting'
          ? '实时重连中'
          : '实时已断开'

  const handleGoProcess = async (item: DecoratedNotification) => {
    if (item.projectId) {
      navigate(item.target.href)
    } else {
      navigate('/notifications')
    }

    if (!item.isRead || item.isMuted) {
      await acknowledgeNotification(item.id)
    }
  }

  if (loading) {
    return (
      <div className="page-enter space-y-6 p-6">
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <LoadingState
              label="通知加载中"
              description="正在同步风险、问题、预警与关键提醒"
              className="h-40 min-h-40 border-0 bg-transparent shadow-none"
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!authLoading && !isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}`

    return (
      <div className="page-enter space-y-6 p-6" data-testid="notifications-login-required">
        <PageHeader
          eyebrow={'公司级第二入口'}
          title={PROJECT_NAVIGATION_LABELS.notifications}
          subtitle="提醒中心需要登录后才会加载你的个人提醒、分派记录和处理状态。登录成功后会自动回到当前页面。"
        >
          <Badge variant="secondary">登录后可用</Badge>
        </PageHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-4">
            <div>
              <strong>登录后继续查看提醒中心</strong>
              <br />
              当前页面依赖带鉴权的提醒接口。登录后会自动回到提醒中心，并继续加载你的待办、预警和跟进提醒。
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem('pending_auth_redirect', redirectTarget)
                  } catch {
                    // sessionStorage 不可用时静默跳过
                  }
                  openLoginDialog()
                }}
              >
                登录后继续
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/company?login=1&redirect=${encodeURIComponent(redirectTarget)}`)}
              >
                前往登录入口
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6 p-6" data-testid="notifications-page">
      <PageHeader
        eyebrow={'\u516c\u53f8\u7ea7\u7b2c\u4e8c\u5165\u53e3'}
        title={PROJECT_NAVIGATION_LABELS.notifications}
        subtitle={`${scopeDescription} ${'\u8fd9\u91cc\u96c6\u4e2d\u67e5\u770b\u98ce\u9669\u3001\u95ee\u9898\u3001\u9884\u8b66\u4e0e\u5173\u952e\u8ddf\u8fdb\uff0c\u518d\u8fdb\u5165\u9879\u76ee\u5904\u7406\u3002'}`}
      >
        <Badge variant="secondary">{scopeLabel}</Badge>
        <Badge variant="secondary">
          {connectionLabel}
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
                    {connectionMode === 'websocket'
                      ? `当前连接状态：${connectionLabel}。服务端事件会自动刷新提醒列表，断线后会自动重连。`
                      : '轮询模式下每 30 秒自动刷新一次提醒列表，也可手动点击右上角刷新按钮。'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {'\u9759\u97f3\u65f6\u957f'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MUTE_DURATION_OPTIONS.map((option) => (
                      <Button
                        key={option.hours}
                        variant={muteDurationHours === option.hours ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMuteDurationHours(option.hours)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    当前批量与单条提醒默认使用 {getMuteDurationActionLabel(muteDurationHours)}。
                  </p>
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
        <Card className="rounded-xl border border-slate-200 bg-white p-4" data-testid="notifications-summary-total">
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

        <Card className="rounded-xl border border-slate-200 bg-white p-4">
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

        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u4e1a\u52a1\u9884\u8b66'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-rose-600">{businessWarningCount}</div>
            <p className="text-xs text-slate-500">{`\u805a\u5408\u98ce\u9669\u3001\u95ee\u9898\u4e0e\u4e1a\u52a1\u9884\u8b66\u63d0\u9192\uff0c\u7cfb\u7edf\u5f02\u5e38 ${systemExceptionCount} \u6761`}</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u6d41\u7a0b\u50ac\u529e'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                <LayoutDashboard className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-blue-600">{flowReminderCount}</div>
            <p className="text-xs text-slate-500">
              {linkedProjectCount > 0
                ? `${linkedProjectCount} \u6761\u53ef\u76f4\u63a5\u8fdb\u5165\u9879\u76ee\u6a21\u5757\u5904\u7406\uff0c${processedCount} \u6761\u5df2\u5904\u7406`
                : '\u805a\u5408\u5ef6\u671f\u3001\u6761\u4ef6\u3001\u963b\u788d\u3001\u91cc\u7a0b\u7891\u548c\u8ba1\u5212\u7f16\u5236\u63d0\u9192'}
              {planningMappingCount > 0 ? ` | S2 mapping isolated ${planningMappingCount}` : ''}
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

          {groupedNotifications.length === 0 ? (
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
              {groupedNotifications.map((group) => {
                const tone = getTargetTone(group.target)
                const GroupIcon = getTargetIcon(group.target)
                const isExpanded = expandedGroups[group.key] ?? true

                return (
                  <section key={group.key} className="px-6 py-5 transition-colors hover:bg-slate-50">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <div className="mt-0.5 flex-shrink-0">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.bg}`}>
                            <GroupIcon className={`h-5 w-5 ${tone.icon}`} />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
                            <Badge variant={tone.badge}>{group.target.label}</Badge>
                            {group.items.some((item) => getReminderTab(item) === 'planning-mapping') ? (
                              <Badge variant="outline">S2 mapping</Badge>
                            ) : null}
                            <Badge variant="secondary">{`${group.items.length} 条同类提醒`}</Badge>
                            {group.unreadCount > 0 && <Badge variant="destructive">{`未读 ${group.unreadCount}`}</Badge>}
                            {group.mutedCount > 0 && <Badge variant="outline">{`静音 ${group.mutedCount}`}</Badge>}
                            {group.expiredMuteCount > 0 && <Badge variant="outline">{`静音到期 ${group.expiredMuteCount}`}</Badge>}
                          </div>
                          <p className="text-sm leading-6 text-slate-600">按最高优先级置顶，同类提醒自动聚合。</p>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 lg:pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`notification-group-toggle-${group.target.key}`}
                          onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !isExpanded }))}
                        >
                          {isExpanded ? '收起' : '展开'}
                          <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void acknowledgeNotifications(group.items.map((item) => item.id))}
                        >
                          {'整组已知悉'}
                          <CheckCircle2 className="ml-2 h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void muteNotifications(group.items.map((item) => item.id), muteDurationHours)}>
                          {getMuteDurationActionLabel(muteDurationHours)}
                        </Button>
                      </div>
                    </div>

                    {isExpanded ? <div className="mt-4 space-y-4">
                      {group.items.map((item) => {
                        const target = item.target
                        const tone = getTargetTone(target)
                        const TargetIcon = getTargetIcon(target)
                        const timestamp = format(new Date(item.createdAt), 'MM\u6708dd\u65e5 HH:mm', { locale: zhCN })

                        return (
                          <div
                            key={item.id}
                            className={`flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 transition-colors hover:border-slate-200 ${
                              item.isMuted ? 'opacity-85' : item.isRead ? 'bg-white' : 'bg-blue-50/30'
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 gap-4">
                              <div className="mt-0.5 flex-shrink-0">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone.bg}`}>
                                  <TargetIcon className={`h-4 w-4 ${tone.icon}`} />
                                </div>
                              </div>

                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                                  <Badge variant={tone.badge}>{target.label}</Badge>
                                  <Badge variant={item.isRead ? 'secondary' : 'default'}>{getNotificationStateLabel(item)}</Badge>
                                  <Badge variant="outline">{getNotificationLevelLabel(item)}</Badge>
                                  {item.muteExpired ? <Badge variant="outline">静音已到期</Badge> : null}
                                  {item.assignee && <Badge variant="secondary">{`\u8d1f\u8d23\u4eba ${item.assignee}`}</Badge>}
                                </div>

                                <p className="text-sm leading-6 text-slate-600">{item.content}</p>
                                {item.muteExpired ? (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    静音已到期，提醒已自动恢复。
                                    {item.mutedUntil ? ` 到期时间：${format(new Date(item.mutedUntil), 'MM\\u6708dd\\u65e5 HH:mm', { locale: zhCN })}` : ''}
                                  </div>
                                ) : null}

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

                            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`notification-go-process-${item.id}`}
                                onClick={() => void handleGoProcess(item)}
                              >
                                {'前往处理'}
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>

                              {!item.isRead && !item.isMuted && (
                                <Button variant="ghost" size="sm" onClick={() => void acknowledgeNotification(item.id)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  {'已知悉'}
                                </Button>
                              )}

                              <Button variant="ghost" size="sm" onClick={() => void muteNotification(item.id, muteDurationHours)}>
                                {getMuteDurationActionLabel(muteDurationHours)}
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                title={'删除提醒'}
                                aria-label={`删除提醒 ${item.title}`}
                                data-testid={`notification-delete-action-${item.id}`}
                                onClick={() => requestDeleteNotification(item)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div> : null}
                  </section>
                )
              })}
            </div>
          )}

          {groupedNotifications.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
              <span>{`\u5171 ${currentTabCount} \u6761\u63d0\u9192`}</span>
              <span>{'\u4ec5\u4fdd\u7559\u63d0\u9192\u5904\u7406\u76f8\u5173\u64cd\u4f5c\uff0c\u6570\u636e\u5de5\u5177\u5df2\u4e0b\u6c89\u5230\u5bf9\u5e94\u6a21\u5757\u3002'}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteProtectionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
        title="删除提醒"
        description={
          deleteTarget
            ? `确认删除“${deleteTarget.title}”这条提醒？删除后只会从提醒中心移除，不会删除对应业务数据。`
            : '确认删除当前提醒。'
        }
        warning={
          deleteTarget
            ? `来源模块：${deleteTarget.targetLabel}。这一步只删除提醒视图中的这条消息，请确认当前不再需要保留留痕入口。`
            : undefined
        }
        confirmLabel={deleteSubmitting ? '删除中...' : '确认删除'}
        loading={deleteSubmitting}
        onConfirm={() => void deleteNotification()}
        testId="notification-delete-guard"
      />
    </div>
  )
}
