import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

import { EmptyState } from '@/components/EmptyState'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@/hooks/useAuth'
import { useAuthDialog } from '@/hooks/useAuthDialog'
import { useReminderSettings } from '@/hooks/useReminderSettings'
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
import { cn } from '@/lib/utils'
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
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type ReminderScope = 'company' | 'current-project'
type ReminderTab =
  | 'all'
  | 'unread'
  | 'processed'

type ReminderTypeFilter =
  | 'all'
  | 'business-warning'
  | 'system-exception'
  | 'flow-reminder'
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

interface NotificationCounts {
  pendingCount: number
  processedCount: number
  businessWarningCount: number
  systemExceptionCount: number
  systemExceptionMappingCount: number
  flowReminderCount: number
  linkedProjectCount: number
  allCount: number
}

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  pendingCount: 0,
  processedCount: 0,
  businessWarningCount: 0,
  systemExceptionCount: 0,
  systemExceptionMappingCount: 0,
  flowReminderCount: 0,
  linkedProjectCount: 0,
  allCount: 0,
}

const TAB_OPTIONS: Array<{ value: ReminderTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'processed', label: '已处理' },
]

const TYPE_FILTER_OPTIONS: Array<{ value: ReminderTypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'business-warning', label: '业务预警' },
  { value: 'system-exception', label: '系统异常' },
  { value: 'flow-reminder', label: '流程催办' },
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

function getReminderTab(notification: NormalizedNotification): Exclude<ReminderTypeFilter, 'all'> {
  if (isPlanningMappingNotification(notification)) {
    return 'system-exception'
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

function getReminderTypeLabel(notification: NormalizedNotification) {
  const type = getReminderTab(notification)
  return TYPE_FILTER_OPTIONS.find((option) => option.value === type)?.label ?? type
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

function normalizeNotificationCounts(value: unknown): NotificationCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_NOTIFICATION_COUNTS
  }

  const record = value as Record<string, unknown>
  return {
    pendingCount: Number(record.pendingCount ?? 0),
    processedCount: Number(record.processedCount ?? 0),
    businessWarningCount: Number(record.businessWarningCount ?? 0),
    systemExceptionCount: Number(record.systemExceptionCount ?? 0),
    systemExceptionMappingCount: Number(record.systemExceptionMappingCount ?? 0),
    flowReminderCount: Number(record.flowReminderCount ?? 0),
    linkedProjectCount: Number(record.linkedProjectCount ?? 0),
    allCount: Number(record.allCount ?? 0),
  }
}

export default function Notifications() {
  useEffect(() => {
    document.title = '通知中心 | WorkBuddy'
  }, [])

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
  const [typeFilter, setTypeFilter] = useState<ReminderTypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [systemExceptionFilter, setSystemExceptionFilter] = useState<'all' | 'mapping'>('all')
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [muteDurationHours, setMuteDurationHours] = useState<AllowedMuteHours>(24)
  const [deleteTarget, setDeleteTarget] = useState<NotificationDeleteTarget | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([])
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>(EMPTY_NOTIFICATION_COUNTS)
  const realtimeRefreshTimeoutRef = useRef<number | null>(null)
  const reminderProjectId = scope === 'current-project' ? currentProject?.id ?? projectIdFromQuery : undefined
  const {
    reminderSettings,
    setReminderSettings,
    saveReminderSettings,
    saving: savingSettings,
  } = useReminderSettings(reminderProjectId, { enabled: !authLoading && isAuthenticated })

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
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS)
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

      let summaryUrl = '/api/notifications/summary'
      if (effectiveProjectId) {
        summaryUrl += `?projectId=${effectiveProjectId}`
      }

      const [responseResult, summaryResult] = await Promise.allSettled([
        api.get<NotificationApiItem[]>(url),
        api.get<NotificationCounts>(summaryUrl),
      ])

      if (responseResult.status !== 'fulfilled') {
        throw responseResult.reason
      }

      const response = responseResult.value
      if (!Array.isArray(response)) {
        throw new Error('\u63d0\u9192\u6570\u636e\u683c\u5f0f\u4e0d\u6b63\u786e')
      }
      const normalized = response
        .map(normalizeNotification)
        .filter(isReminderNotification)

      setNotifications(normalized)
      if (summaryResult.status === 'fulfilled') {
        setNotificationCounts(normalizeNotificationCounts(summaryResult.value))
      } else {
        setNotificationCounts(EMPTY_NOTIFICATION_COUNTS)
      }
      setSharedSliceStatus('notifications', { loading: false, error: null })
    } catch (error) {
      console.error('Failed to load notifications:', error)
      const message = isBackendUnavailableError(error)
        ? `${PROJECT_NAVIGATION_LABELS.notifications}\u4f9d\u8d56\u540e\u7aef\u63a5\u53e3\uff0c\u8bf7\u5148\u786e\u8ba4\u672c\u5730\u540e\u7aef\u5df2\u542f\u52a8\uff08\u9ed8\u8ba4 3001\uff09\uff0c\u518d\u5237\u65b0\u91cd\u8bd5\u3002`
        : getApiErrorMessage(error, '\u63d0\u9192\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002')

      // 10.10b: 不清空 store 数据，保留上次成功加载的内容；仅设置 error 状态
      setSharedSliceStatus('notifications', { loading: false, error: message })
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS)
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
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS)
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
      void loadNotifications({ silent: true })
    } catch (error) {
      console.error('Failed to acknowledge notification:', error)
      toast({ variant: 'destructive', title: '确认通知失败，请重试' })
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
      void loadNotifications({ silent: true })
    } catch (error) {
      console.error('Failed to mute notification:', error)
      toast({ variant: 'destructive', title: '静音通知失败，请重试' })
    }
  }

  const acknowledgeNotifications = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await api.put('/api/notifications/acknowledge-group', { ids })
      patchNotifications(ids, { isRead: true, isMuted: false, muteExpired: false, mutedUntil: undefined, status: 'acknowledged' })
      void loadNotifications({ silent: true })
    } catch (error) {
      console.error('Failed to acknowledge notifications:', error)
      toast({ variant: 'destructive', title: '批量确认失败，请重试' })
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
      void loadNotifications({ silent: true })
    } catch (error) {
      console.error('Failed to mute notifications:', error)
      toast({ variant: 'destructive', title: '批量静音失败，请重试' })
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
      void loadNotifications({ silent: true })
    } catch (error) {
      console.error('Failed to mark all as read:', error)
      toast({ variant: 'destructive', title: '全部标记已读失败，请重试' })
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
      void loadNotifications({ silent: true })
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

  const requestBulkDeleteProcessed = () => {
    const ids = filteredNotifications
      .filter((item) => item.isRead || item.isMuted || item.status === 'acknowledged')
      .map((item) => item.id)
    setBulkDeleteIds(ids)
  }

  const deleteBulkNotifications = async () => {
    if (bulkDeleteIds.length === 0) return

    try {
      setBulkDeleteSubmitting(true)
      await Promise.all(bulkDeleteIds.map((id) => api.delete(`/api/notifications/${id}`)))
      const deleted = new Set(bulkDeleteIds)
      setNotifications(notifications.filter((item) => !deleted.has(item.id)))
      setBulkDeleteIds([])
      void loadNotifications({ silent: true })
      toast({
        title: '已批量删除提醒',
        description: `已移除 ${bulkDeleteIds.length} 条已处理提醒。`,
      })
    } catch (error) {
      console.error('Failed to bulk delete notifications:', error)
      toast({
        title: '批量删除失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setBulkDeleteSubmitting(false)
    }
  }

  const exportFilteredNotifications = () => {
    const header = ['标题', '内容', '类型', '状态', '处理入口', '负责人', '时间']
    const escapeCsvCell = (value: string | number | null | undefined) => {
      const text = value === null || value === undefined ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }
    const rows = filteredNotifications.map((item) => [
      item.title,
      item.content,
      getReminderTypeLabel(item),
      getNotificationStateLabel(item),
      item.target.label,
      item.assignee ?? '',
      item.createdAt,
    ])
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'notifications.csv'
    link.click()
    URL.revokeObjectURL(url)
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

  const pendingCount = notificationCounts.pendingCount
  const processedCount = notificationCounts.processedCount
  const businessWarningCount = notificationCounts.businessWarningCount
  const systemExceptionCount = notificationCounts.systemExceptionCount
  const systemExceptionMappingCount = notificationCounts.systemExceptionMappingCount
  const flowReminderCount = notificationCounts.flowReminderCount
  const linkedProjectCount = notificationCounts.linkedProjectCount
  const allCount = notificationCounts.allCount

  const filteredNotifications = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return decoratedNotifications.filter((item) => {
      const tabMatch =
        tab === 'all' ||
        (tab === 'unread' && !item.isRead && !item.isMuted) ||
        (tab === 'processed' && (item.isRead || item.isMuted || item.status === 'acknowledged'))
      const typeMatch = typeFilter === 'all' || getReminderTab(item) === typeFilter
      const systemExceptionMatch =
        typeFilter !== 'system-exception' ||
        systemExceptionFilter === 'all' ||
        isPlanningMappingNotification(item)
      const searchMatch =
        normalizedQuery.length === 0 ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.content.toLowerCase().includes(normalizedQuery) ||
        item.target.label.toLowerCase().includes(normalizedQuery) ||
        (item.assignee ?? '').toLowerCase().includes(normalizedQuery)

      return tabMatch && typeMatch && systemExceptionMatch && searchMatch
    })
  }, [decoratedNotifications, searchQuery, systemExceptionFilter, tab, typeFilter])

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
  const currentTabCount = filteredNotifications.length
  const processedDeleteCount = filteredNotifications.filter((item) => item.isRead || item.isMuted || item.status === 'acknowledged').length
  const hasActiveFilters =
    tab !== 'all' ||
    typeFilter !== 'all' ||
    systemExceptionFilter !== 'all' ||
    searchQuery.trim().length > 0
  const resetNotificationFilters = () => {
    setTab('all')
    setTypeFilter('all')
    setSystemExceptionFilter('all')
    setSearchQuery('')
  }
  const tabCounts: Record<ReminderTab, number> = {
    all: decoratedNotifications.length,
    unread: decoratedNotifications.filter((item) => !item.isRead && !item.isMuted).length,
    processed: decoratedNotifications.filter((item) => item.isRead || item.isMuted || item.status === 'acknowledged').length,
  }
  const typeCounts: Record<ReminderTypeFilter, number> = {
    all: decoratedNotifications.length,
    'business-warning': decoratedNotifications.filter((item) => getReminderTab(item) === 'business-warning').length,
    'system-exception': decoratedNotifications.filter((item) => getReminderTab(item) === 'system-exception').length,
    'flow-reminder': decoratedNotifications.filter((item) => getReminderTab(item) === 'flow-reminder').length,
  }
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
      <div className="page-shell">
        <Breadcrumb items={[{ label: PROJECT_NAVIGATION_LABELS.notifications }]} />
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <LoadingState
              label="通知加载中"
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
      <div className="page-shell" data-testid="notifications-login-required">
        <Breadcrumb items={[{ label: PROJECT_NAVIGATION_LABELS.notifications }]} />
        <PageHeader
          eyebrow={'公司级第二入口'}
          title={PROJECT_NAVIGATION_LABELS.notifications}
          subtitle=""
        >
          <Badge variant="secondary">登录后可用</Badge>
        </PageHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
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
    <div className="page-shell" data-testid="notifications-page">
      <Breadcrumb items={[{ label: PROJECT_NAVIGATION_LABELS.notifications }]} />
      <PageHeader
        eyebrow={'\u516c\u53f8\u7ea7\u7b2c\u4e8c\u5165\u53e3'}
        title={PROJECT_NAVIGATION_LABELS.notifications}
        subtitle=""
      >
        <div className="relative w-full min-w-56 lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="搜索提醒"
            placeholder="搜索提醒标题、内容、入口"
            className="pl-9"
            data-testid="notifications-search-input"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(value) => {
            const nextType = value as ReminderTypeFilter
            setTypeFilter(nextType)
            if (nextType !== 'system-exception') {
              setSystemExceptionFilter('all')
            }
          }}
        >
          <SelectTrigger className="w-full lg:w-40" data-testid="notifications-type-select">
            <SelectValue placeholder="提醒类型" />
          </SelectTrigger>
          <SelectContent align="end" side="bottom">
            {TYPE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tab} onValueChange={(value) => setTab(value as ReminderTab)}>
          <SelectTrigger className="w-full lg:w-36" data-testid="notifications-status-select">
            <SelectValue placeholder="处理状态" />
          </SelectTrigger>
          <SelectContent align="end" side="bottom">
            {TAB_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" data-testid="notifications-more-actions">
              <MoreHorizontal className="h-4 w-4" />
              更多操作
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-48">
            <DropdownMenuItem onClick={() => void markAllAsRead()} disabled={pendingCount === 0}>
              全部标记已读
            </DropdownMenuItem>
            <DropdownMenuItem onClick={requestBulkDeleteProcessed} disabled={processedDeleteCount === 0}>
              批量删除已处理
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportFilteredNotifications} disabled={filteredNotifications.length === 0}>
              导出当前筛选
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void loadNotifications()}>
              刷新提醒
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={settingsPanelOpen ? 'default' : 'outline'}
              size="icon"
              aria-label="提醒设置"
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">提醒设置</span>
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" side="bottom" className="w-80 rounded-xl border-slate-200 bg-white p-4 shadow-[var(--el-3)]">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                </div>

                <Separator />
                <div className="pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                </div>

                <Separator />
                <div className="pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                </div>

                <Separator />
                <div className="pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    \u63d0\u9192\u89c4\u5219
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label htmlFor="condition-days" className="text-xs text-slate-600">\u6761\u4ef6\u5230\u671f\u63d0\u524d\u5929\u6570</Label>
                      <Input
                        id="condition-days"
                        type="text"
                        placeholder="\u4f8b\u5982: 3,1"
                        value={reminderSettings.condition_reminder_days.join(',')}
                        onChange={(e) => setReminderSettings({
                          ...reminderSettings,
                          condition_reminder_days: e.target.value.split(',').map(v => Number(v.trim())).filter(n => !Number.isNaN(n))
                        })}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="obstacle-days" className="text-xs text-slate-600">\u963b\u788d\u6301\u7eed\u63d0\u9192\u5929\u6570</Label>
                      <Input
                        id="obstacle-days"
                        type="text"
                        placeholder="\u4f8b\u5982: 3,7"
                        value={reminderSettings.obstacle_reminder_days.join(',')}
                        onChange={(e) => setReminderSettings({
                          ...reminderSettings,
                          obstacle_reminder_days: e.target.value.split(',').map(v => Number(v.trim())).filter(n => !Number.isNaN(n))
                        })}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="acceptance-days" className="text-xs text-slate-600">\u9a8c\u6536\u5230\u671f\u63d0\u524d\u5929\u6570</Label>
                      <Input
                        id="acceptance-days"
                        type="text"
                        placeholder="\u4f8b\u5982: 7,3,1"
                        value={reminderSettings.acceptance_reminder_days.join(',')}
                        onChange={(e) => setReminderSettings({
                          ...reminderSettings,
                          acceptance_reminder_days: e.target.value.split(',').map(v => Number(v.trim())).filter(n => !Number.isNaN(n))
                        })}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="enable-popup" className="text-xs text-slate-600">\u542f\u7528\u5f39\u7a97\u63d0\u9192</Label>
                      <Checkbox
                        id="enable-popup"
                        checked={reminderSettings.enable_popup}
                        onCheckedChange={(checked) => setReminderSettings({ ...reminderSettings, enable_popup: checked === true })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="enable-notification" className="text-xs text-slate-600">\u542f\u7528\u901a\u77e5</Label>
                      <Checkbox
                        id="enable-notification"
                        checked={reminderSettings.enable_notification}
                        onCheckedChange={(checked) => setReminderSettings({ ...reminderSettings, enable_notification: checked === true })}
                      />
                    </div>
                    <Button
                      onClick={() => void saveReminderSettings()}
                      disabled={savingSettings}
                      className="w-full"
                      size="sm"
                    >
                      {savingSettings ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u8bbe\u7f6e'}
                    </Button>
                  </div>
                </div>

              </div>
          </PopoverContent>
        </Popover>
      </PageHeader>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border border-slate-200 bg-white p-5" data-testid="notifications-summary-total">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u63d0\u9192\u603b\u6570'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                <Info className="h-5 w-5 text-slate-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-slate-900">{allCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 bg-white p-5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u672a\u8bfb'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50">
                <Bell className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-amber-600">{pendingCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 bg-white p-5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u4e1a\u52a1\u9884\u8b66'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-rose-600">{businessWarningCount}</div>
            <p className="text-xs text-slate-500">系统异常 {systemExceptionCount} 条</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 bg-white p-5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{'\u6d41\u7a0b\u50ac\u529e'}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                <LayoutDashboard className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-semibold tracking-tight text-blue-600">{flowReminderCount}</div>
            <p className="text-xs text-slate-500">
              {linkedProjectCount > 0 ? `${linkedProjectCount} 条 · 已处理 ${processedCount}` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="space-y-5 p-0">
          <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as ReminderTab)}
              className="w-full"
            >
              <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                {TAB_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.value}
                    value={option.value}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    {option.label}({tabCounts[option.value]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Badge variant="secondary">{currentTabCount} {'\u6761'}</Badge>
              <span>{'\u5f53\u524d\u7b5b\u9009\u7ed3\u679c'}</span>
            </div>
          </div>
          <Separator />

          <div className="flex flex-wrap items-center gap-2 px-6 pb-4 pt-0" data-testid="notifications-type-chips">
            {TYPE_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={typeFilter === option.value ? 'default' : 'outline'}
                onClick={() => {
                  setTypeFilter(option.value)
                  if (option.value !== 'system-exception') {
                    setSystemExceptionFilter('all')
                  }
                }}
              >
                {option.label}({typeCounts[option.value]})
              </Button>
            ))}
          </div>

          {typeFilter === 'system-exception' ? (
            <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2 px-6 pb-4 pt-0">
              <Button
                type="button"
                size="sm"
                variant={systemExceptionFilter === 'mapping' ? 'default' : 'outline'}
                onClick={() => setSystemExceptionFilter('mapping')}
              >
                映射孤立 {systemExceptionMappingCount > 0 ? `(${systemExceptionMappingCount})` : ''}
              </Button>
              <span className="text-xs text-slate-500">系统异常中的规划映射孤立提醒可直接收窄查看</span>
            </div>
            </>
          ) : null}

          {groupedNotifications.length === 0 ? (
            <div className="px-6 py-8">
              <EmptyState
                variant={loadError ? 'error' : hasActiveFilters ? 'filter' : 'default'}
                icon={Bell}
                title={
                  loadError
                    ? '\u63d0\u9192\u670d\u52a1\u6682\u4e0d\u53ef\u7528'
                    : '暂无新通知'
                }
                description={
                  loadError ||
                  '\u5207\u6362\u63d0\u9192\u8303\u56f4\u6216\u91cd\u7f6e\u7b5b\u9009\u6761\u4ef6\u540e\u518d\u8bd5\u3002'
                }
                onRetry={() => void loadNotifications()}
                onClearFilter={hasActiveFilters ? resetNotificationFilters : undefined}
                action={!loadError && !hasActiveFilters ? (
                  <Button onClick={() => void loadNotifications()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {'\u5237\u65b0\u63d0\u9192'}
                  </Button>
                ) : null}
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedNotifications.map((group) => {
                const tone = getTargetTone(group.target)
                const GroupIcon = getTargetIcon(group.target)
                const isExpanded = expandedGroups[group.key] ?? true
                const groupDate = format(new Date(group.latestCreatedAt), 'MM月dd日 HH:mm', { locale: zhCN })
                const groupTypeLabel = TYPE_FILTER_OPTIONS.find((option) => option.value === group.key.split(':')[0])?.label

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
                            <span className="text-xs text-slate-500">{groupDate}</span>
                            <Badge variant={group.unreadCount > 0 ? 'default' : 'secondary'}>{`未读 ${group.unreadCount}`}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {groupTypeLabel ? <span>{groupTypeLabel}</span> : null}
                            <span>{`${group.items.length} 条同类提醒`}</span>
                            {group.items.some((item) => isPlanningMappingNotification(item)) ? (
                              <span>S2 mapping</span>
                            ) : null}
                          </div>
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
                        const typeLabel = getReminderTypeLabel(item)
                        const sourceLabel = item.sourceEntityType ?? item.resolvedSource ?? '系统'

                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'flex flex-col gap-4 rounded-xl border px-4 py-4 transition-colors hover:border-slate-200',
                              item.isRead || item.isMuted
                                ? 'border-slate-100 bg-white'
                                : 'border-blue-500 border-l-4 bg-blue-50/50',
                              item.isMuted && 'opacity-85',
                            )}
                          >
                            <div className="flex min-w-0 flex-1 gap-4">
                              <div className="mt-0.5 flex-shrink-0">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.bg}`}>
                                  <TargetIcon className={`h-4 w-4 ${tone.icon}`} />
                                </div>
                              </div>

                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                                  <Badge variant={tone.badge}>{typeLabel}</Badge>
                                  <Badge variant={item.isRead ? 'secondary' : 'default'}>{getNotificationStateLabel(item)}</Badge>
                                </div>

                                <p className="text-sm leading-6 text-slate-600">{item.content}</p>
                                {item.muteExpired ? (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {item.mutedUntil ? ` 到期时间：${format(new Date(item.mutedUntil), 'MM\\u6708dd\\u65e5 HH:mm', { locale: zhCN })}` : ''}
                                  </div>
                                ) : null}

                                <div className="grid gap-4 rounded-xl border border-slate-100 bg-white/70 px-5 py-5 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                                  <div>
                                    <div className="font-medium text-slate-700">入口</div>
                                    <div className="mt-1">{target.label}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">级别</div>
                                    <div className="mt-1">{getNotificationLevelLabel(item)}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">负责人</div>
                                    <div className="mt-1">{item.assignee || '未指派'}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">时间</div>
                                    <div className="mt-1 inline-flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5" />
                                      {timestamp}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">来源</div>
                                    <div className="mt-1">{sourceLabel}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">项目</div>
                                    <div className="mt-1">{item.projectId || '公司级'}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-700">静音</div>
                                    <div className="mt-1">{item.isMuted ? '静音中' : item.muteExpired ? '静音已到期' : '未静音'}</div>
                                  </div>
                                  {isPlanningMappingNotification(item) ? (
                                    <div>
                                      <div className="font-medium text-slate-700">异常标识</div>
                                      <div className="mt-1">S2 mapping</div>
                                    </div>
                                  ) : null}
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

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`删除提醒 ${item.title}`}
                                    data-testid={`notification-delete-action-${item.id}`}
                                    onClick={() => requestDeleteNotification(item)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>删除提醒</TooltipContent>
                              </Tooltip>
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
            <>
              <Separator />
              <div className="flex flex-col gap-2 px-6 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{`\u5171 ${currentTabCount} \u6761\u63d0\u9192`}</span>
                <span>{`${scopeLabel} · ${connectionLabel}`}</span>
              </div>
            </>
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
            ? `来源模块：${deleteTarget.targetLabel}`
            : undefined
        }
        confirmLabel="确认删除"
        loading={deleteSubmitting}
        onConfirm={() => void deleteNotification()}
        testId="notification-delete-guard"
      />
      <DeleteProtectionDialog
        open={bulkDeleteIds.length > 0}
        onOpenChange={(open) => {
          if (!open && !bulkDeleteSubmitting) {
            setBulkDeleteIds([])
          }
        }}
        title="批量删除提醒"
        description={`确认删除当前筛选中的 ${bulkDeleteIds.length} 条已处理提醒？删除后只会从提醒中心移除，不会删除对应业务数据。`}
        warning="批量删除仅作用于已读、已知悉或静音提醒，未读提醒会保留。"
        confirmLabel="确认删除"
        loading={bulkDeleteSubmitting}
        onConfirm={() => void deleteBulkNotifications()}
        testId="notification-bulk-delete-guard"
      />
    </div>
  )
}
