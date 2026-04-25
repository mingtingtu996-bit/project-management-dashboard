import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowLeft, BarChart3, Bell, ChevronDown, ChevronUp, Clock3, Eye, GitBranch, RefreshCw, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react'

import { RiskManagementSkeleton } from '@/components/ui/page-skeleton'
import { ActionGuardDialog } from '@/components/ActionGuardDialog'
import { EmptyState } from '@/components/EmptyState'
import RiskTrendChart from '@/components/RiskTrendChart'
import { PageHeader } from '@/components/PageHeader'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { useToast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { apiGet, apiPost, apiPut } from '@/lib/apiClient'
import { getMuteDurationActionLabel, MUTE_DURATION_OPTIONS, type AllowedMuteHours } from '@/lib/muteDurations'
import type { ChangeLogRecord, Issue, Risk, TaskObstacle } from '@/lib/supabase'

type WarningItem = {
  id: string
  project_id?: string
  task_id?: string
  source_type?: string
  warning_signature?: string
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  is_acknowledged?: boolean
  muted_until?: string | null
  created_at?: string
  updated_at?: string
  first_seen_at?: string | null
  acknowledged_at?: string | null
  reactivated_at?: string | null
  is_escalated?: boolean
  escalated_to_risk_id?: string | null
  escalated_at?: string | null
  chain_id?: string | null
  status?: string | null
  resolved_at?: string | null
  resolved_source?: 'auto' | 'manual' | null
}

type RiskRow = {
  id: string
  title: string
  description?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'identified' | 'mitigating' | 'closed'
  sourceType: string
  sourceLabel: string
  taskId?: string
  chainId?: string | null
  linkedIssueId?: string | null
  pendingManualClose: boolean
  version?: number
  createdAt?: string
  probability?: number | null
  impact?: number | null
}

type IssueRow = {
  id: string
  title: string
  description?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  resolved_source?: 'auto' | 'manual' | null
  sourceType: string
  sourceLabel: string
  taskId?: string
  chainId?: string | null
  pendingManualClose: boolean
  version?: number
  createdAt?: string
  priorityScore: number
  priorityValue: number
  manualPriorityLocked: boolean
  sourceEntityType?: string | null
  sourceEntityId?: string | null
}

type DialogState =
  | { type: 'convert-risk'; row: RiskRow }
  | { type: 'create-manual-risk' }
  | { type: 'create-manual-issue' }
  | null

type ProtectionDialogState = {
  title: string
  description: string
  hint: string
}

type DetailDialogState =
  | { entityType: 'warning'; item: WarningItem }
  | { entityType: 'risk'; row: RiskRow }
  | { entityType: 'issue'; row: IssueRow }
  | null

type ChainDialogState = {
  chainId: string
} | null

type ChainStream = 'warnings' | 'risks' | 'problems'
type ChainViewMode = 'task' | 'timeline'
type WarningFilterValue = 'all' | string
type SourceFilterValue = 'all' | 'manual' | 'chain'

const WARNING_LABEL: Record<WarningItem['warning_level'], string> = { info: '提示', warning: '关注', critical: '严重' }
const WARNING_TYPE_LABELS: Record<string, string> = {
  condition_due: '开工窗口提醒',
  condition_expired: '条件过期',
  obstacle_timeout: '阻碍预警',
  delay_exceeded: '延期预警',
  acceptance_expired: '验收预警',
  critical_path_stagnation: '关键路径停滞',
  pre_milestone: '里程碑临近',
}
const RISK_STATUS_LABELS: Record<RiskRow['status'], string> = { identified: '已识别', mitigating: '处理中', closed: '已关闭' }
const ISSUE_STATUS_LABELS: Record<IssueRow['status'], string> = { open: '待处理', investigating: '调查中', resolved: '已解决（待确认）', closed: '已关闭' }
const SEVERITY_LABELS: Record<RiskRow['severity'], string> = { low: '低', medium: '中', high: '高', critical: '严重' }
const PENDING_MANUAL_CLOSE_LABEL = '待确认关闭'
const SOURCE_WEIGHT: Record<string, number> = { condition_expired: 4, obstacle_escalated: 3, risk_converted: 2, risk_auto_escalated: 2, manual: 1 }
const SEVERITY_WEIGHT: Record<RiskRow['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1 }
const WARNING_LEVEL_WEIGHT: Record<WarningItem['warning_level'], number> = { critical: 3, warning: 2, info: 1 }
const ISSUE_PRIORITY_PRESET = [2, 4, 8, 12, 16, 24]

function normalizeSeverity(value: unknown): RiskRow['severity'] {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'critical' || raw === 'severe') return 'critical'
  if (raw === 'high') return 'high'
  if (raw === 'low') return 'low'
  return 'medium'
}

function getSourceLabel(sourceType: string) {
  if (sourceType === 'warning_converted') return '预警确认'
  if (sourceType === 'warning_auto_escalated') return '预警自动升级'
  if (sourceType === 'risk_converted') return '风险转问题'
  if (sourceType === 'risk_auto_escalated') return '风险自动升级'
  if (sourceType === 'obstacle_escalated') return '阻碍升级'
  if (sourceType === 'condition_expired') return '条件过期'
  if (sourceType === 'source_deleted') return '来源已删除'
  return '人工录入'
}

function getWarningCategory(item: WarningItem) {
  return WARNING_TYPE_LABELS[item.warning_type] || '系统预警'
}

function getWarningSourceType(item: WarningItem) {
  const raw = item as Record<string, unknown>
  return String(raw.source_type ?? raw.sourceType ?? 'manual')
}

function getWarningSourceLabel(item: WarningItem) {
  return getSourceLabel(getWarningSourceType(item))
}

function getSourceBucket(sourceType: string): SourceFilterValue {
  return sourceType === 'manual' ? 'manual' : 'chain'
}

function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function buildTaskBucket(taskId?: string | null) {
  return taskId ? `任务 ${taskId}` : '项目级'
}

function buildTimelineBucket(createdAt?: string) {
  if (!createdAt) return '未记录时间'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '未记录时间'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function calculateIssuePriorityScore(sourceType: string, severity: IssueRow['severity'], createdAt?: string, options?: { isLocked?: boolean; currentPriority?: number }) {
  if (options?.isLocked && typeof options.currentPriority === 'number') {
    return Math.max(1, Math.min(100, Math.round(options.currentPriority)))
  }

  const base = (SOURCE_WEIGHT[sourceType] ?? 1) * SEVERITY_WEIGHT[severity]
  const created = createdAt ? new Date(createdAt) : null
  const unresolvedDays = created && !Number.isNaN(created.getTime()) ? Math.max(0, Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000))) : 0
  const uplift = 1 + Math.min(5, Math.floor(unresolvedDays / 7)) * 0.1
  return Math.max(1, Math.min(100, Math.round(base * uplift)))
}

function normalizeResolvedSource(value: unknown): 'auto' | 'manual' | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'auto') return 'auto'
  if (raw === 'manual') return 'manual'
  return null
}

function isWarningResolved(item: WarningItem) {
  const status = String(item.status ?? '').trim().toLowerCase()
  return status === 'resolved' || status === 'closed' || Boolean(item.resolved_at)
}

function getWarningMuteMeta(item: WarningItem) {
  if (!item.muted_until) {
    return { isMuted: false, isExpired: false, label: null as string | null }
  }

  const mutedUntil = new Date(item.muted_until).getTime()
  if (!Number.isFinite(mutedUntil)) {
    return { isMuted: false, isExpired: false, label: null as string | null }
  }

  const remainingMs = mutedUntil - Date.now()
  if (remainingMs <= 0) {
    return { isMuted: false, isExpired: true, label: '静音已到期' }
  }

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000))
  return {
    isMuted: true,
    isExpired: false,
    label: remainingHours >= 24 ? `静音剩余 ${Math.ceil(remainingHours / 24)} 天` : `静音剩余 ${remainingHours} 小时`,
  }
}

function getWarningStateLabel(item: WarningItem) {
  if (isWarningResolved(item)) return '已自然消除'
  if (getWarningMuteMeta(item).isExpired) return '静音已到期'
  if (getWarningMuteMeta(item).isMuted) return '静音中'
  if (item.is_acknowledged) return '已知悉'
  return '待人工确认'
}

function getWarningSortRank(item: WarningItem) {
  if (isWarningResolved(item)) return 3
  const muteMeta = getWarningMuteMeta(item)
  if (muteMeta.isMuted || muteMeta.isExpired) return 2
  if (item.is_acknowledged) return 1
  return 0
}

function getAutoEscalationHint(createdAt?: string) {
  if (!createdAt) return null
  const timestamp = new Date(createdAt).getTime()
  if (!Number.isFinite(timestamp)) return null
  const ageDays = Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)))
  const remainingDays = 7 - ageDays
  if (remainingDays > 0) {
    return `距离自动升级为问题还有 ${remainingDays} 天`
  }
  return `已达到自动升级阈值（超 ${Math.abs(remainingDays)} 天）`
}

function isObstacleActive(obstacle: TaskObstacle) {
  const normalizedStatus = String(obstacle.status ?? '').trim()
  return !['已解决', 'resolved', 'closed'].includes(normalizedStatus)
}

function isDesignObstacleType(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '设计' || normalized === 'design'
}

function buildProjectDrawingsPath(projectId: string, specialtyType?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return ''
  const normalizedSpecialty = String(specialtyType ?? '').trim()
  return normalizedSpecialty
    ? `/projects/${normalizedProjectId}/drawings?specialty=${encodeURIComponent(normalizedSpecialty)}`
    : `/projects/${normalizedProjectId}/drawings`
}

function mapObstacleSeverityToIssueSeverity(value?: string | null): IssueRow['severity'] {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === '严重' || normalized === 'critical') return 'critical'
  if (normalized === '高' || normalized === 'high') return 'high'
  if (normalized === '低' || normalized === 'low') return 'low'
  return 'medium'
}

function getObstacleAgeDays(obstacle: TaskObstacle) {
  const createdAt = new Date(String(obstacle.created_at ?? ''))
  if (Number.isNaN(createdAt.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)))
}

function getEscalatedObstacleSeverity(obstacle: TaskObstacle): IssueRow['severity'] {
  const baseSeverity = mapObstacleSeverityToIssueSeverity(obstacle.severity ?? null)
  const ageDays = getObstacleAgeDays(obstacle)
  if (ageDays >= 7) return 'critical'
  if (ageDays >= 3 && (baseSeverity === 'low' || baseSeverity === 'medium')) return 'high'
  return baseSeverity
}

function sortWarnings(rows: WarningItem[]) {
  return [...rows].sort((left, right) => {
    const sortRankDiff = getWarningSortRank(left) - getWarningSortRank(right)
    if (sortRankDiff !== 0) {
      return sortRankDiff
    }

    const warningLevelDiff = WARNING_LEVEL_WEIGHT[right.warning_level] - WARNING_LEVEL_WEIGHT[left.warning_level]
    if (warningLevelDiff !== 0) return warningLevelDiff

    const createdAtDiff = compareCreatedAtDesc(left.created_at, right.created_at)
    if (createdAtDiff !== 0) return createdAtDiff

    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

function groupWarnings(rows: WarningItem[], mode: ChainViewMode) {
  const map = new Map<string, WarningItem[]>()
  rows.forEach((row) => {
    const key = mode === 'task' ? buildTaskBucket(row.task_id) : buildTimelineBucket(row.created_at)
    map.set(key, [...(map.get(key) || []), row])
  })

  return Array.from(map.entries()).map(([title, items]) => ({ title, items }))
}

function getSourceTypeTagLabel(sourceType: string) {
  return getSourceBucket(sourceType) === 'manual' ? '手动链' : '链路来源'
}

function getPendingManualCloseCopy(row: RiskRow | IssueRow, entityType: 'risk' | 'issue') {
  if (row.sourceType === 'source_deleted') {
    return {
      title: '来源记录已删除，是否改为人工收口？',
      description: `上游${entityType === 'risk' ? '风险' : '问题'}来源已删除，当前需要明确是直接关闭，还是继续由人工跟进。`,
    }
  }

  if (row.sourceType === 'warning_converted' || row.sourceType === 'warning_auto_escalated') {
    return {
      title: '预警来源已解除，是否确认关闭？',
      description: '对应预警已经消除或不再生效，请确认是否结束当前跟踪。',
    }
  }

  if (row.sourceType === 'risk_converted' || row.sourceType === 'risk_auto_escalated') {
    return {
      title: '上游风险链已解除，是否保留当前问题？',
      description: '风险链路状态已变化，请确认当前问题是否继续单独处理。',
    }
  }

  if (row.sourceType === 'obstacle_escalated') {
    return {
      title: '阻碍来源已恢复，是否确认关闭？',
      description: '阻碍链路已恢复到可执行状态，请确认是否还需要保留当前跟踪记录。',
    }
  }

  if (row.sourceType === 'condition_expired') {
    return {
      title: '条件链已恢复，是否确认关闭？',
      description: '原条件缺口已经解除，请确认当前记录是直接关闭还是继续观察。',
    }
  }

  return {
    title: '来源已解除，是否确认关闭？',
    description: '当前记录的上游状态已变化，请明确是直接关闭还是保持处理中。',
  }
}

function normalizeRiskRow(item: Risk): RiskRow {
  const raw = item as Record<string, unknown>
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? raw.description ?? '未命名风险'),
    description: raw.description ? String(raw.description) : undefined,
    severity: normalizeSeverity(raw.level ?? raw.severity),
    status: (String(raw.status ?? 'identified').trim().toLowerCase() as RiskRow['status']) || 'identified',
    sourceType: String(raw.source_type ?? 'manual'),
    sourceLabel: getSourceLabel(String(raw.source_type ?? 'manual')),
    taskId: raw.task_id ? String(raw.task_id) : undefined,
    chainId: raw.chain_id ? String(raw.chain_id) : null,
    linkedIssueId: raw.linked_issue_id ? String(raw.linked_issue_id) : null,
    pendingManualClose: Boolean(raw.pending_manual_close),
    version: typeof raw.version === 'number' ? raw.version : undefined,
    createdAt: raw.created_at ? String(raw.created_at) : undefined,
    probability: typeof raw.probability === 'number' ? raw.probability : null,
    impact: typeof raw.impact === 'number' ? raw.impact : null,
  }
}

function normalizeIssueRow(item: Issue, manualPriorityLocked = false): IssueRow {
  const raw = item as Record<string, unknown>
  const sourceType = String(raw.source_type ?? raw.sourceType ?? 'manual')
  const severity = normalizeSeverity(raw.severity)
  const createdAt = raw.created_at ? String(raw.created_at) : raw.createdAt ? String(raw.createdAt) : undefined
  const priorityValue =
    typeof raw.priority === 'number'
      ? raw.priority
      : typeof raw.priorityValue === 'number'
        ? raw.priorityValue
        : calculateIssuePriorityScore(sourceType, severity, createdAt)
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? raw.description ?? '未命名问题'),
    description: raw.description ? String(raw.description) : undefined,
    severity,
    status: (String(raw.status ?? 'open').trim().toLowerCase() as IssueRow['status']) || 'open',
    sourceType,
    sourceLabel: raw.sourceLabel ? String(raw.sourceLabel) : getSourceLabel(sourceType),
    taskId: raw.task_id ? String(raw.task_id) : raw.taskId ? String(raw.taskId) : undefined,
    chainId: raw.chain_id ? String(raw.chain_id) : raw.chainId ? String(raw.chainId) : null,
    pendingManualClose: Boolean(raw.pending_manual_close ?? raw.pendingManualClose),
    version: typeof raw.version === 'number' ? raw.version : undefined,
    createdAt,
    priorityScore: calculateIssuePriorityScore(sourceType, severity, createdAt, {
      isLocked: manualPriorityLocked,
      currentPriority: priorityValue,
    }),
    priorityValue,
    manualPriorityLocked,
    sourceEntityType: raw.source_entity_type ? String(raw.source_entity_type) : raw.sourceEntityType ? String(raw.sourceEntityType) : null,
    sourceEntityId: raw.source_entity_id ? String(raw.source_entity_id) : raw.sourceEntityId ? String(raw.sourceEntityId) : null,
  }
}

function groupRows<T extends { id: string; taskId?: string; createdAt?: string }>(rows: T[], mode: ChainViewMode) {
  const map = new Map<string, T[]>()
  rows.forEach((row) => {
    const key = mode === 'task' ? buildTaskBucket(row.taskId) : buildTimelineBucket(row.createdAt)
    map.set(key, [...(map.get(key) || []), row])
  })
  return Array.from(map.entries()).map(([title, items]) => ({ title, items }))
}

async function loadRisks(projectId: string) {
  const rows = await apiGet<Risk[]>(`/api/risks?projectId=${encodeURIComponent(projectId)}`)
  if (!Array.isArray(rows)) throw new Error('风险数据格式不正确')
  return rows.map((item) => normalizeRiskRow(item))
}

async function loadIssues(projectId: string) {
  const rows = await apiGet<Issue[]>(`/api/issues?projectId=${encodeURIComponent(projectId)}`)
  if (!Array.isArray(rows)) throw new Error('问题数据格式不正确')
  return rows.map((item) => normalizeIssueRow(item))
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function hasHttpStatus(error: unknown, status: number) {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number | null }).status === status
}

function compareCreatedAtDesc(left?: string, right?: string) {
  const leftTime = left ? new Date(left).getTime() : 0
  const rightTime = right ? new Date(right).getTime() : 0
  return rightTime - leftTime
}

function normalizeChangeLogRecord(row: ChangeLogRecord): ChangeLogRecord {
  return {
    ...row,
    id: row.id ? String(row.id) : '',
    project_id: row.project_id ? String(row.project_id) : null,
    entity_type: String(row.entity_type ?? ''),
    entity_id: String(row.entity_id ?? ''),
    field_name: String(row.field_name ?? ''),
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
    change_reason: row.change_reason ? String(row.change_reason) : null,
    changed_by: row.changed_by ? String(row.changed_by) : null,
    change_source: row.change_source ? String(row.change_source) : null,
    changed_at: row.changed_at ? String(row.changed_at) : null,
  }
}

function normalizeObstacleRecord(row: TaskObstacle): TaskObstacle {
  const raw = row as Record<string, unknown>
  return {
    ...row,
    id: raw.id ? String(raw.id) : '',
    task_id: raw.task_id ? String(raw.task_id) : undefined,
    obstacle_type: raw.obstacle_type ? String(raw.obstacle_type) as TaskObstacle['obstacle_type'] : row.obstacle_type,
    description: String(raw.description ?? raw.title ?? ''),
    severity: raw.severity ? String(raw.severity) as TaskObstacle['severity'] : row.severity,
    status: raw.status ? String(raw.status) as TaskObstacle['status'] : row.status,
    resolved_at: raw.resolved_at ? String(raw.resolved_at) : row.resolved_at,
    created_at: raw.created_at ? String(raw.created_at) : row.created_at,
    updated_at: raw.updated_at ? String(raw.updated_at) : row.updated_at,
  }
}

function isWithinRecentDays(value?: string, days = 7) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000
}

function sortRiskRows(rows: RiskRow[]) {
  return [...rows].sort((left, right) => {
    if (left.pendingManualClose !== right.pendingManualClose) {
      return Number(right.pendingManualClose) - Number(left.pendingManualClose)
    }

    const severityDiff = SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity]
    if (severityDiff !== 0) return severityDiff

    const createdAtDiff = compareCreatedAtDesc(left.createdAt, right.createdAt)
    if (createdAtDiff !== 0) return createdAtDiff

    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

function sortIssueRows(rows: IssueRow[]) {
  return [...rows].sort((left, right) => {
    if (left.pendingManualClose !== right.pendingManualClose) {
      return Number(right.pendingManualClose) - Number(left.pendingManualClose)
    }

    if (left.priorityScore !== right.priorityScore) {
      return right.priorityScore - left.priorityScore
    }

    const severityDiff = SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity]
    if (severityDiff !== 0) return severityDiff

    const createdAtDiff = compareCreatedAtDesc(left.createdAt, right.createdAt)
    if (createdAtDiff !== 0) return createdAtDiff

    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

export default function RiskManagement() {
  const navigate = useNavigate()
  const params = useParams()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const rawTasks = useStore((state) => state.tasks)
  const rawWarnings = useStore((state) => state.warnings)
  const rawIssueRows = useStore((state) => state.issueRows)
  const rawProblemRows = useStore((state) => state.problemRows)
  const changeLogs = useStore((state) => state.changeLogs)
  const delayRequests = useStore((state) => state.delayRequests)
  const setWarnings = useStore((state) => state.setWarnings)
  const setIssueRows = useStore((state) => state.setIssueRows)
  const setProblemRows = useStore((state) => state.setProblemRows)
  const setChangeLogs = useStore((state) => state.setChangeLogs)
  const setSharedSliceStatus = useStore((state) => state.setSharedSliceStatus)
  const projectId = params.id || currentProject?.id || ''
  const projectName = currentProject?.name || '当前项目'
  const goBack = projectId ? () => navigate(`/projects/${projectId}/dashboard`) : () => navigate(-1)

  const [riskRows, setRiskRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStream, setActiveStream] = useState<ChainStream>('warnings')
  const [chainViewMode, setChainViewMode] = useState<ChainViewMode>('task')
  const [warningViewMode, setWarningViewMode] = useState<ChainViewMode>('task')
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>('all')
  const [warningSourceFilter, setWarningSourceFilter] = useState<SourceFilterValue>('all')
  const [showPendingManualCloseOnly, setShowPendingManualCloseOnly] = useState(false)
  const [warningFilter, setWarningFilter] = useState<WarningFilterValue>('all')
  const [trendExpanded, setTrendExpanded] = useState(false)
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [protectionDialog, setProtectionDialog] = useState<ProtectionDialogState | null>(null)
  const [detailDialog, setDetailDialog] = useState<DetailDialogState>(null)
  const [chainDialog, setChainDialog] = useState<ChainDialogState>(null)
  const [saving, setSaving] = useState(false)
  const [manualRiskTitle, setManualRiskTitle] = useState('')
  const [manualRiskDescription, setManualRiskDescription] = useState('')
  const [manualRiskSeverity, setManualRiskSeverity] = useState<RiskRow['severity']>('medium')
  const [manualIssueTitle, setManualIssueTitle] = useState('')
  const [manualIssueDescription, setManualIssueDescription] = useState('')
  const [manualIssueSeverity, setManualIssueSeverity] = useState<IssueRow['severity']>('medium')
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number>>({})
  const [muteDurationHours, setMuteDurationHours] = useState<AllowedMuteHours>(24)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    setSharedSliceStatus('warnings', { loading: true, error: null })
    setSharedSliceStatus('issueRows', { loading: true, error: null })
    setSharedSliceStatus('problemRows', { loading: true, error: null })
    setSharedSliceStatus('changeLogs', { loading: true, error: null })
    try {
      const [warningResult, riskResult, issueResult, obstacleResult, changeLogResult] = await Promise.allSettled([
        apiGet<WarningItem[]>(`/api/warnings?projectId=${encodeURIComponent(projectId)}&includeResolved=1`, { signal }),
        loadRisks(projectId),
        loadIssues(projectId),
        apiGet<TaskObstacle[]>(`/api/task-obstacles?projectId=${encodeURIComponent(projectId)}`, { signal }),
        apiGet<ChangeLogRecord[]>(`/api/change-logs?projectId=${encodeURIComponent(projectId)}&limit=150`, { signal }),
      ])

      const errors: string[] = []

      if (warningResult.status === 'fulfilled' && Array.isArray(warningResult.value)) {
        setWarnings(warningResult.value)
        setSharedSliceStatus('warnings', { loading: false, error: null })
      } else {
        setWarnings([])
        const message = warningResult.status === 'rejected'
          ? getErrorMessage(warningResult.reason, '预警数据加载失败')
          : '预警数据格式不正确'
        errors.push(message)
        setSharedSliceStatus('warnings', { loading: false, error: message })
      }

      if (riskResult.status === 'fulfilled') {
        setRiskRows(riskResult.value)
      } else {
        setRiskRows([])
        errors.push(getErrorMessage(riskResult.reason, '风险数据加载失败'))
      }

      if (issueResult.status === 'fulfilled') {
        setIssueRows(issueResult.value as never)
        setSharedSliceStatus('issueRows', { loading: false, error: null })
      } else {
        const message = getErrorMessage(issueResult.reason, '问题数据加载失败')
        setIssueRows([] as never)
        errors.push(message)
        setSharedSliceStatus('issueRows', { loading: false, error: message })
      }

      if (obstacleResult.status === 'fulfilled' && Array.isArray(obstacleResult.value)) {
        setProblemRows(obstacleResult.value.map(normalizeObstacleRecord) as never)
        setSharedSliceStatus('problemRows', { loading: false, error: null })
      } else {
        const message = obstacleResult.status === 'rejected'
          ? getErrorMessage(obstacleResult.reason, '阻碍数据加载失败')
          : '阻碍数据格式不正确'
        errors.push(message)
        setSharedSliceStatus('problemRows', { loading: false, error: message })
      }

      if (changeLogResult.status === 'fulfilled' && Array.isArray(changeLogResult.value)) {
        setChangeLogs(changeLogResult.value.map(normalizeChangeLogRecord))
        setSharedSliceStatus('changeLogs', { loading: false, error: null })
      } else {
        const message = changeLogResult.status === 'rejected'
          ? getErrorMessage(changeLogResult.reason, '变更记录加载失败')
          : '变更记录格式不正确'
        errors.push(message)
        setSharedSliceStatus('changeLogs', { loading: false, error: message })
      }

      setError(errors.length > 0 ? errors.join('；') : null)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [projectId, setChangeLogs, setIssueRows, setProblemRows, setSharedSliceStatus, setWarnings])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort() }
  }, [refresh])

  const priorityLockedIssueIds = useMemo(
    () =>
      new Set(
        changeLogs
          .filter((record) => record.entity_type === 'issue' && record.field_name === 'priority' && record.entity_id)
          .map((record) => String(record.entity_id)),
      ),
    [changeLogs],
  )
  const warnings = useMemo(
    () =>
      rawWarnings.map((item) => ({
        ...item,
        resolved_source: normalizeResolvedSource(item.resolved_source),
      } as WarningItem)),
    [rawWarnings],
  )
  const issueRows = useMemo(
    () =>
      rawIssueRows.map((item) =>
        normalizeIssueRow(
          item as unknown as Issue,
          priorityLockedIssueIds.has(String((item as unknown as Record<string, unknown>).id ?? '')),
        ),
      ),
    [priorityLockedIssueIds, rawIssueRows],
  )
  const problemRows = useMemo(
    () => rawProblemRows.map((row) => normalizeObstacleRecord(row as TaskObstacle)),
    [rawProblemRows],
  )
  const taskSpecialtyById = useMemo(
    () =>
      new Map(
        (rawTasks || [])
          .map((task) => {
            const rawTask = task as Record<string, unknown>
            const id = String(rawTask.id ?? '').trim()
            if (!id) return null
            const specialtyType = typeof rawTask.specialty_type === 'string' && rawTask.specialty_type.trim()
              ? rawTask.specialty_type.trim()
              : null
            return [id, specialtyType] as const
          })
          .filter((entry): entry is readonly [string, string | null] => Boolean(entry)),
      ),
    [rawTasks],
  )
  const obstacleById = useMemo(
    () => new Map(problemRows.map((row) => [String(row.id ?? ''), row] as const).filter(([id]) => Boolean(id))),
    [problemRows],
  )
  const warningFilterOptions = useMemo(
    () => Array.from(new Map(warnings.map((item) => [item.warning_type, { value: item.warning_type, label: getWarningCategory(item) }])).values()),
    [warnings],
  )
  const filteredWarnings = useMemo(
    () =>
      sortWarnings(
        warnings.filter((item) => {
          if (warningFilter !== 'all' && item.warning_type !== warningFilter) return false
          if (warningSourceFilter !== 'all' && getSourceBucket(getWarningSourceType(item)) !== warningSourceFilter) return false
          return true
        }),
      ),
    [warningFilter, warningSourceFilter, warnings],
  )
  const filteredRisks = useMemo(() => riskRows.filter((row) => {
    if (showPendingManualCloseOnly && !row.pendingManualClose) return false
    if (sourceFilter !== 'all' && getSourceBucket(row.sourceType) !== sourceFilter) return false
    return true
  }), [riskRows, showPendingManualCloseOnly, sourceFilter])
  const filteredIssues = useMemo(() => issueRows.filter((row) => {
    if (showPendingManualCloseOnly && !row.pendingManualClose) return false
    if (sourceFilter !== 'all' && getSourceBucket(row.sourceType) !== sourceFilter) return false
    return true
  }), [issueRows, showPendingManualCloseOnly, sourceFilter])

  const obstacleLinkedIssueIds = useMemo(
    () =>
      new Set(
        issueRows
          .filter((row) => row.sourceEntityType === 'task_obstacle' && row.sourceEntityId)
          .map((row) => String(row.sourceEntityId)),
      ),
    [issueRows],
  )
  const activeObstacleRows = useMemo(() => problemRows.filter((row) => isObstacleActive(row)), [problemRows])
  const getObstacleDrawingsHref = useCallback((obstacle?: TaskObstacle | null) => {
    if (!projectId || !obstacle?.task_id || !isDesignObstacleType(obstacle.obstacle_type)) return null
    return buildProjectDrawingsPath(projectId, taskSpecialtyById.get(String(obstacle.task_id)) ?? null)
  }, [projectId, taskSpecialtyById])
  const getIssueDrawingsHref = useCallback((row: IssueRow) => {
    if (row.sourceEntityType !== 'task_obstacle' || !row.sourceEntityId) return null
    return getObstacleDrawingsHref(obstacleById.get(String(row.sourceEntityId)) ?? null)
  }, [getObstacleDrawingsHref, obstacleById])
  const escalatableObstacles = useMemo(
    () =>
      activeObstacleRows.filter((row) => {
        const obstacleId = String(row.id ?? '')
        if (!obstacleId || obstacleLinkedIssueIds.has(obstacleId)) return false
        const createdAt = new Date(String(row.created_at ?? ''))
        if (Number.isNaN(createdAt.getTime())) return false
        return Date.now() - createdAt.getTime() >= 7 * 24 * 60 * 60 * 1000
      }),
    [activeObstacleRows, obstacleLinkedIssueIds],
  )
  const activeWarnings = useMemo(() => sortWarnings(warnings.filter((item) => !isWarningResolved(item))), [warnings])
  const activeRisks = useMemo(() => riskRows.filter((row) => row.status !== 'closed'), [riskRows])
  const activeIssues = useMemo(() => issueRows.filter((row) => row.status !== 'closed'), [issueRows])
  const pendingManualCloseCount = useMemo(() => [...riskRows, ...issueRows].filter((row) => row.pendingManualClose).length, [issueRows, riskRows])
  const groupedWarnings = useMemo(() => groupWarnings(filteredWarnings, warningViewMode), [filteredWarnings, warningViewMode])
  const groupedRisks = useMemo(() => groupRows(sortRiskRows(filteredRisks), chainViewMode), [filteredRisks, chainViewMode])
  const groupedIssues = useMemo(() => groupRows(sortIssueRows(filteredIssues), chainViewMode), [filteredIssues, chainViewMode])
  const recentWarningCount = useMemo(() => warnings.filter((item) => isWithinRecentDays(item.created_at)).length, [warnings])
  const recentRiskCount = useMemo(() => riskRows.filter((row) => isWithinRecentDays(row.createdAt)).length, [riskRows])
  const recentIssueCount = useMemo(() => issueRows.filter((row) => isWithinRecentDays(row.createdAt)).length, [issueRows])
  const highAttentionCount = useMemo(
    () =>
      activeWarnings.filter((item) => item.warning_level === 'critical').length +
      activeRisks.filter((row) => row.severity === 'high' || row.severity === 'critical').length +
      activeIssues.filter((row) => row.severity === 'high' || row.severity === 'critical').length,
    [activeIssues, activeRisks, activeWarnings],
  )
  const chainLinkedCount = useMemo(
    () =>
      warnings.filter((row) => getSourceBucket(getWarningSourceType(row)) === 'chain').length +
      riskRows.filter((row) => getSourceBucket(row.sourceType) === 'chain').length +
      issueRows.filter((row) => getSourceBucket(row.sourceType) === 'chain').length,
    [issueRows, riskRows, warnings],
  )
  const trendSummary = useMemo(
    () => [
      {
        label: '预警热区',
        value: activeWarnings.length,
        hint: `${activeWarnings.filter((item) => item.warning_level === 'critical').length} 条为严重预警`,
      },
      {
        label: '风险处理中',
        value: riskRows.filter((row) => row.status === 'mitigating').length,
        hint: `${recentRiskCount} 条为近 7 天新增风险`,
      },
      {
        label: '问题调查 / 待确认',
        value: issueRows.filter((row) => row.status === 'investigating' || row.status === 'resolved').length,
        hint: `${recentIssueCount} 条为近 7 天新增问题`,
      },
      {
        label: '长期阻碍待上卷',
        value: escalatableObstacles.length,
        hint: `${activeObstacleRows.length} 条活跃阻碍中，${escalatableObstacles.length} 条已达到 7 天阈值`,
      },
    ],
    [activeObstacleRows.length, activeWarnings, escalatableObstacles.length, issueRows, recentIssueCount, recentRiskCount, riskRows],
  )

  const resetManualForms = () => {
    setManualRiskTitle('')
    setManualRiskDescription('')
    setManualRiskSeverity('medium')
    setManualIssueTitle('')
    setManualIssueDescription('')
    setManualIssueSeverity('medium')
  }

  const presentMutationError = useCallback((error: unknown, actionLabel: string) => {
    if (hasHttpStatus(error, 422)) {
      setProtectionDialog({
        title: `${actionLabel}暂不可执行`,
        description: getErrorMessage(error, '当前记录状态或上游链路已变化，请刷新后再试。'),
        hint: '这通常表示记录已被他人处理、来源链路已改变，或当前状态不满足操作前置条件。',
      })
      return
    }

    toast({
      title: `${actionLabel}失败`,
      description: getErrorMessage(error, '请稍后重试。'),
      variant: 'destructive',
    })
  }, [toast])

  const handleAcknowledgeWarning = useCallback(async (item: WarningItem) => {
    try {
      await apiPut(`/api/warnings/${item.id}/acknowledge`, {})
      toast({ title: '已知悉预警', description: item.title })
      await refresh()
    } catch (error) {
      presentMutationError(error, '预警知悉')
    }
  }, [presentMutationError, refresh, toast])

  const handleMuteWarning = useCallback(async (item: WarningItem) => {
    try {
      await apiPut(`/api/warnings/${item.id}/mute`, { mutedHours: muteDurationHours })
      toast({ title: `已静音 ${getMuteDurationActionLabel(muteDurationHours).replace('静音 ', '')}`, description: item.title })
      await refresh()
    } catch (error) {
      presentMutationError(error, '预警静音')
    }
  }, [muteDurationHours, presentMutationError, refresh, toast])

  const handleConfirmWarning = useCallback(async (item: WarningItem) => {
    try {
      await apiPut(`/api/warnings/${item.id}/confirm-risk`, {})
      toast({ title: '已转为风险', description: item.title })
      await refresh()
    } catch (error) {
      presentMutationError(error, '预警转风险')
    }
  }, [presentMutationError, refresh, toast])

  const handleUpdateRisk = useCallback(async (row: RiskRow, updates: Partial<Risk>) => {
    if (updates.status === 'closed' && row.status !== 'mitigating') {
      setProtectionDialog({
        title: '风险状态暂不可直接关闭',
        description: '只有“处理中”的风险才允许进入关闭。',
        hint: '请先把风险推进到处理中，再执行关闭。',
      })
      return false
    }

    if (updates.status === 'identified' && row.status === 'closed') {
      setProtectionDialog({
        title: '风险重新打开需先回到处理中',
        description: '已关闭风险不能直接跳回已识别。',
        hint: '请先恢复为“处理中”，再根据后续判断继续收口或升级。',
      })
      return false
    }

    try {
      await apiPut(`/api/risks/${row.id}`, { ...updates, version: row.version })
      await refresh()
      return true
    } catch (error) {
      presentMutationError(error, `更新风险「${row.title}」`)
      return false
    }
  }, [presentMutationError, refresh])

  const handleUpdateIssue = useCallback(async (row: IssueRow, updates: Partial<Issue>) => {
    if (updates.status === 'resolved' && row.status !== 'investigating') {
      setProtectionDialog({
        title: '问题状态暂不可直接标记已解决',
        description: '只有“调查中”的问题才允许进入已解决待确认。',
        hint: '请先进入调查中，再确认问题已解决。',
      })
      return false
    }

    if (updates.status === 'closed' && row.status !== 'resolved') {
      setProtectionDialog({
        title: '问题状态暂不可直接关闭',
        description: '只有“已解决（待确认）”的问题才允许关闭。',
        hint: 'open / investigating 状态需要先完成调查和解决确认。',
      })
      return false
    }

    if (updates.status === 'open' && row.status !== 'investigating') {
      setProtectionDialog({
        title: '当前问题暂不可回退到待处理',
        description: '只有“调查中”的问题允许回退到待处理。',
        hint: '这一步用于撤回调查动作，不用于重新打开已关闭问题。',
      })
      return false
    }

    try {
      await apiPut(`/api/issues/${row.id}`, { ...updates, version: row.version })
      await refresh()
      return true
    } catch (error) {
      presentMutationError(error, `更新问题「${row.title}」`)
      return false
    }
  }, [presentMutationError, refresh])

  const handlePendingManualCloseDecision = useCallback(async (row: RiskRow | IssueRow, entityType: 'risk' | 'issue', keepProcessing: boolean) => {
    let success = false
    if (entityType === 'risk') {
      success = await handleUpdateRisk(row as RiskRow, { pending_manual_close: false, status: keepProcessing ? 'mitigating' : 'closed' })
    } else {
      success = await handleUpdateIssue(row as IssueRow, { pending_manual_close: false, status: keepProcessing ? 'investigating' : 'closed' })
    }

    if (!success) return
    toast({ title: keepProcessing ? '已保持处理中' : '已确认关闭', description: row.title })
  }, [handleUpdateIssue, handleUpdateRisk, toast])

  const handleCreateManualRisk = useCallback(async () => {
    if (!projectId || !manualRiskTitle.trim()) return
    setSaving(true)
    try {
      await apiPost('/api/risks', {
        project_id: projectId,
        title: manualRiskTitle.trim(),
        description: manualRiskDescription.trim() || undefined,
        level: manualRiskSeverity,
        status: 'identified',
        probability: 50,
        impact: 50,
        risk_category: 'other',
        source_type: 'manual',
      })
      toast({ title: '已创建风险', description: manualRiskTitle.trim() })
      setDialogState(null)
      resetManualForms()
      await refresh()
    } catch (error) {
      presentMutationError(error, '新建风险')
    } finally {
      setSaving(false)
    }
  }, [manualRiskDescription, manualRiskSeverity, manualRiskTitle, presentMutationError, projectId, refresh, toast])

  const handleCreateManualIssue = useCallback(async () => {
    if (!projectId || !manualIssueTitle.trim()) return
    setSaving(true)
    try {
      await apiPost('/api/issues', {
        project_id: projectId,
        title: manualIssueTitle.trim(),
        description: manualIssueDescription.trim() || null,
        severity: manualIssueSeverity,
        priority: Math.max(1, Math.round(calculateIssuePriorityScore('manual', manualIssueSeverity))),
        status: 'open',
        source_type: 'manual',
      })
      toast({ title: '已创建问题', description: manualIssueTitle.trim() })
      setDialogState(null)
      resetManualForms()
      await refresh()
    } catch (error) {
      presentMutationError(error, '新建问题')
    } finally {
      setSaving(false)
    }
  }, [manualIssueDescription, manualIssueSeverity, manualIssueTitle, presentMutationError, projectId, refresh, toast])

  const handleConvertRiskToIssue = useCallback(async () => {
    if (!projectId || !dialogState || dialogState.type !== 'convert-risk') return
    setSaving(true)
    try {
      const row = dialogState.row
      await apiPost<Issue>('/api/issues', {
        project_id: projectId,
        task_id: row.taskId || null,
        title: row.title,
        description: row.description || null,
        source_type: 'risk_converted',
        source_id: row.id,
        source_entity_type: 'risk',
        source_entity_id: row.id,
        chain_id: row.chainId || undefined,
        severity: row.severity,
        priority: Math.max(1, Math.round(calculateIssuePriorityScore('risk_converted', row.severity, row.createdAt))),
        status: 'open',
      })
      toast({ title: '已转为问题', description: row.title })
      setDialogState(null)
      await refresh()
    } catch (error) {
      presentMutationError(error, '转为问题')
    } finally {
      setSaving(false)
    }
  }, [dialogState, presentMutationError, projectId, refresh, toast])

  const openRiskDetailById = useCallback((riskId?: string | null) => {
    if (!riskId) return
    const nextRisk = riskRows.find((row) => row.id === riskId)
    if (nextRisk) {
      setDetailDialog({ entityType: 'risk', row: nextRisk })
    }
  }, [riskRows])

  const openIssueDetailById = useCallback((issueId?: string | null) => {
    if (!issueId) return
    const nextIssue = issueRows.find((row) => row.id === issueId)
    if (nextIssue) {
      setDetailDialog({ entityType: 'issue', row: nextIssue })
    }
  }, [issueRows])

  const openChainById = useCallback((chainId?: string | null) => {
    if (!chainId) return
    setChainDialog({ chainId })
  }, [])

  const handlePriorityDraftChange = useCallback((issueId: string, value: string) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue)) return
    setPriorityDrafts((current) => ({ ...current, [issueId]: nextValue }))
  }, [])

  const handleSaveIssuePriority = useCallback(async (row: IssueRow) => {
    const nextPriority = priorityDrafts[row.id] ?? row.priorityValue
    if (nextPriority === row.priorityValue) return
    try {
      await apiPut(`/api/issues/${row.id}`, {
        priority: nextPriority,
        version: row.version,
      })
      toast({ title: '已更新问题优先级', description: `${row.title} · ${nextPriority}` })
      await refresh()
    } catch (error) {
      presentMutationError(error, '问题优先级调整')
    }
  }, [presentMutationError, priorityDrafts, refresh, toast])

  const handleEscalateObstacleToIssue = useCallback(async (obstacle: TaskObstacle) => {
    if (!projectId) return
    const obstacleTitle = String((obstacle as Record<string, unknown>).title ?? obstacle.description ?? '长期阻碍')
    try {
      await apiPost('/api/issues', {
        project_id: projectId,
        task_id: obstacle.task_id ?? null,
        title: `阻碍上卷 · ${obstacleTitle}`,
        description: obstacle.description ?? obstacleTitle,
        severity: getEscalatedObstacleSeverity(obstacle),
        priority: Math.max(1, Math.round(calculateIssuePriorityScore('obstacle_escalated', getEscalatedObstacleSeverity(obstacle), obstacle.created_at))),
        status: 'open',
        source_type: 'obstacle_escalated',
        source_entity_type: 'task_obstacle',
        source_entity_id: obstacle.id,
        chain_id: String((obstacle as Record<string, unknown>).chain_id ?? ''),
      })
      toast({ title: '已上卷为问题', description: obstacleTitle })
      await refresh()
    } catch (error) {
      presentMutationError(error, '阻碍上卷问题')
    }
  }, [presentMutationError, projectId, refresh, toast])

  const chainDialogItems = useMemo(() => {
    if (!chainDialog?.chainId) return null

    const linkedWarnings = warnings.filter((item) => item.chain_id === chainDialog.chainId)
    const linkedRisks = riskRows.filter((row) => row.chainId === chainDialog.chainId)
    const linkedIssues = issueRows.filter((row) => row.chainId === chainDialog.chainId)
    const entityKeySet = new Set<string>([
      ...linkedWarnings.map((item) => `warning:${item.id}`),
      ...linkedRisks.map((row) => `risk:${row.id}`),
      ...linkedIssues.map((row) => `issue:${row.id}`),
    ])

    const linkedChangeLogs = changeLogs
      .filter((record) => entityKeySet.has(`${record.entity_type}:${record.entity_id}`))
      .sort((left, right) => compareCreatedAtDesc(left.changed_at ?? undefined, right.changed_at ?? undefined))

    return {
      linkedWarnings,
      linkedRisks,
      linkedIssues,
      linkedChangeLogs,
    }
  }, [chainDialog?.chainId, changeLogs, issueRows, riskRows, warnings])

  function renderPendingManualCloseBanner(row: RiskRow | IssueRow, entityType: 'risk' | 'issue') {
    if (!row.pendingManualClose) return null
    const copy = getPendingManualCloseCopy(row, entityType)
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <p className="font-medium">{copy.title}</p>
              <p className="leading-5 text-amber-800">{copy.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7" data-testid={`confirm-close-${entityType}-${row.id}`} onClick={() => void handlePendingManualCloseDecision(row, entityType, false)}>确认关闭</Button>
              <Button size="sm" variant="outline" className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100" data-testid={`keep-processing-${entityType}-${row.id}`} onClick={() => void handlePendingManualCloseDecision(row, entityType, true)}>保持处理中</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderWarningActions(item: WarningItem) {
    const muteMeta = getWarningMuteMeta(item)
    if (isWarningResolved(item)) {
      return (
        <div className="flex flex-wrap gap-2">
          {item.escalated_to_risk_id ? (
            <Button size="sm" variant="outline" onClick={() => openRiskDetailById(item.escalated_to_risk_id)}>
              查看升级风险
            </Button>
          ) : null}
          {item.chain_id ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openChainById(item.chain_id)}
              data-testid={`risk-open-chain-warning-${item.id}`}
            >
              查看全链
            </Button>
          ) : null}
        </div>
      )
    }

    return (
      <ReadOnlyGuard action="edit" message="请登录后处理预警">
        <>
          <Button size="sm" onClick={() => void handleConfirmWarning(item)}>转为风险</Button>
          {!item.is_acknowledged ? <Button size="sm" variant="outline" onClick={() => void handleAcknowledgeWarning(item)}>已知悉</Button> : null}
          {!muteMeta.isMuted ? <Button size="sm" variant="outline" onClick={() => void handleMuteWarning(item)}>{getMuteDurationActionLabel(muteDurationHours)}</Button> : null}
          {item.escalated_to_risk_id ? <Button size="sm" variant="outline" onClick={() => openRiskDetailById(item.escalated_to_risk_id)}>查看升级风险</Button> : null}
          {item.chain_id ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openChainById(item.chain_id)}
              data-testid={`risk-open-chain-warning-${item.id}`}
            >
              查看全链
            </Button>
          ) : null}
        </>
      </ReadOnlyGuard>
    )
  }

  function renderEntry({
    badges,
    title,
    description,
    footer,
    action,
    banner,
    entryClassName,
    detailAction,
  }: {
    badges?: ReactNode
    title: string
    description?: string | null
    footer?: string
    action?: ReactNode
    banner?: ReactNode
    entryClassName?: string
    detailAction?: ReactNode
  }) {
    return (
      <div className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${entryClassName ?? 'bg-white/80'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
            {banner ? <div className="pt-1">{banner}</div> : null}
            {footer ? <p className="text-xs text-slate-400">{footer}</p> : null}
          </div>
          {action || detailAction ? <div className="flex shrink-0 flex-wrap gap-2">{detailAction}{action}</div> : null}
        </div>
      </div>
    )
  }

  function renderWarningEntry(item: WarningItem) {
    const sourceType = getWarningSourceType(item)
    const muteMeta = getWarningMuteMeta(item)
    const resolved = isWarningResolved(item)
    // #15: 检查是否有pending延期申请
    const hasPendingDelayRequest = item.task_id && delayRequests.some(
      (req) => req.task_id === item.task_id && req.status === 'pending'
    )
    return renderEntry({
      badges: <>
        <StatusBadge status={item.warning_level}>{WARNING_LABEL[item.warning_level]}</StatusBadge>
        <Badge variant="outline">{getWarningCategory(item)}</Badge>
        <Badge variant="outline">{getWarningSourceLabel(item)}</Badge>
        <Badge variant="secondary">{getSourceTypeTagLabel(sourceType)}</Badge>
        <Badge variant={resolved ? 'secondary' : 'outline'}>{getWarningStateLabel(item)}</Badge>
        {muteMeta.label ? <Badge variant="outline">{muteMeta.label}</Badge> : null}
        {item.is_escalated ? <Badge variant="secondary">已升级</Badge> : null}
        {!item.is_acknowledged && item.reactivated_at ? <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">已重新激活</Badge> : null}
        {hasPendingDelayRequest ? <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">延期审批中</Badge> : null}
        {resolved && item.resolved_source === 'auto' ? <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">系统联动消除</Badge> : null}
        {resolved && item.resolved_source === 'manual' ? <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">人工消除</Badge> : null}
      </>,
      title: item.title,
      description: item.description,
      footer: `${buildTaskBucket(item.task_id)} 路 ${formatDateTime(item.created_at)}`,
      action: renderWarningActions(item),
      detailAction: (
        <Button size="sm" variant="ghost" onClick={() => setDetailDialog({ entityType: 'warning', item })} data-testid={`risk-detail-open-warning-${item.id}`}>
          <Eye className="mr-2 h-4 w-4" />
          查看详情
        </Button>
      ),
      entryClassName: resolved || item.is_acknowledged || muteMeta.isMuted ? 'bg-slate-50/80 opacity-65' : 'bg-white/80',
    })
  }

  function renderRiskActions(row: RiskRow) {
    if (row.pendingManualClose) return null
    return (
      <ReadOnlyGuard action="edit" message="请登录后处理风险">
        <>
          {row.status === 'identified' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateRisk(row, { status: 'mitigating' })}>开始处理</Button> : null}
          {row.status === 'mitigating' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateRisk(row, { status: 'closed' })}>关闭风险</Button> : null}
          {row.status === 'closed' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateRisk(row, { status: 'mitigating', linked_issue_id: null, closed_reason: null, closed_at: null })}>恢复处理</Button> : null}
          {row.status !== 'closed' ? <Button size="sm" onClick={() => setDialogState({ type: 'convert-risk', row })}>转为问题</Button> : null}
          {row.linkedIssueId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openIssueDetailById(row.linkedIssueId)}
              data-testid={`risk-open-linked-issue-${row.id}`}
            >
              查看关联问题
            </Button>
          ) : null}
          {row.chainId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openChainById(row.chainId)}
              data-testid={`risk-open-chain-risk-${row.id}`}
            >
              查看全链
            </Button>
          ) : null}
        </>
      </ReadOnlyGuard>
    )
  }

  function renderIssueActions(row: IssueRow) {
    if (row.pendingManualClose) return null
    return (
      <ReadOnlyGuard action="edit" message="请登录后处理问题">
        <>
          {row.status === 'open' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'investigating' })}>开始调查</Button> : null}
          {row.status === 'investigating' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'open' })}>退回待处理</Button> : null}
          {row.status === 'investigating' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'resolved' })}>标记已解决</Button> : null}
          {row.status === 'resolved' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'closed' })}>确认关闭</Button> : null}
          {row.sourceEntityType === 'risk' && row.sourceEntityId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openRiskDetailById(row.sourceEntityId)}
              data-testid={`risk-open-upstream-risk-${row.id}`}
            >
              查看上游风险
            </Button>
          ) : null}
          {row.chainId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openChainById(row.chainId)}
              data-testid={`risk-open-chain-issue-${row.id}`}
            >
              查看全链
            </Button>
          ) : null}
        </>
      </ReadOnlyGuard>
    )
  }

  function renderRiskEntry(row: RiskRow) {
    const escalationHint = row.status === 'identified' ? getAutoEscalationHint(row.createdAt) : null
    return renderEntry({
      badges: <>
        <StatusBadge status={row.severity}>{SEVERITY_LABELS[row.severity]}</StatusBadge>
        <StatusBadge status={row.status} fallbackLabel={RISK_STATUS_LABELS[row.status]}>{RISK_STATUS_LABELS[row.status]}</StatusBadge>
        <Badge variant="outline">{row.sourceLabel}</Badge>
        <Badge variant="secondary">{getSourceTypeTagLabel(row.sourceType)}</Badge>
        {row.pendingManualClose ? <StatusBadge status="warning">{PENDING_MANUAL_CLOSE_LABEL}</StatusBadge> : null}
        {row.linkedIssueId ? <Badge variant="outline">已挂问题</Badge> : null}
      </>,
      title: row.title,
      description: row.description,
      footer: `${buildTaskBucket(row.taskId)} · ${formatDateTime(row.createdAt)}`,
      banner: (
        <>
          {escalationHint ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {escalationHint}
            </div>
          ) : null}
          {renderPendingManualCloseBanner(row, 'risk')}
        </>
      ),
      action: renderRiskActions(row),
      detailAction: (
        <Button size="sm" variant="ghost" onClick={() => setDetailDialog({ entityType: 'risk', row })} data-testid={`risk-detail-open-risk-${row.id}`}>
          <Eye className="mr-2 h-4 w-4" />
          查看详情
        </Button>
      ),
      entryClassName: row.status === 'closed' ? 'bg-slate-50/80 opacity-70' : 'bg-white/80',
    })
  }

  function renderIssueEntry(row: IssueRow) {
    const priorityDraft = priorityDrafts[row.id] ?? row.priorityValue
    return renderEntry({
      badges: <>
        <StatusBadge status={row.severity}>{SEVERITY_LABELS[row.severity]}</StatusBadge>
        <StatusBadge status={row.status} fallbackLabel={ISSUE_STATUS_LABELS[row.status]}>{ISSUE_STATUS_LABELS[row.status]}</StatusBadge>
        <Badge variant="outline">{row.sourceLabel}</Badge>
        <Badge variant="secondary">{getSourceTypeTagLabel(row.sourceType)}</Badge>
        <Badge variant="outline">优先级分 {row.priorityScore}</Badge>
        {row.manualPriorityLocked ? <Badge variant="secondary">人工锁定</Badge> : null}
        {row.pendingManualClose ? <StatusBadge status="warning">{PENDING_MANUAL_CLOSE_LABEL}</StatusBadge> : null}
        {row.status === 'resolved' && row.resolved_source === 'auto' ? <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">系统联动解决</Badge> : null}
        {row.status === 'resolved' && row.resolved_source === 'manual' ? <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">人工解决</Badge> : null}
      </>,
      title: row.title,
      description: row.description,
      footer: `${buildTaskBucket(row.taskId)} · ${formatDateTime(row.createdAt)}`,
      banner: (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>人工优先级</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={priorityDraft}
              onChange={(event) => handlePriorityDraftChange(row.id, event.target.value)}
              className="h-8 w-24 bg-white"
              data-testid={`issue-priority-input-${row.id}`}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={priorityDraft === row.priorityValue}
              onClick={() => void handleSaveIssuePriority(row)}
              data-testid={`issue-priority-save-${row.id}`}
            >
              保存优先级
            </Button>
          </div>
          {renderPendingManualCloseBanner(row, 'issue')}
        </>
      ),
      action: renderIssueActions(row),
      detailAction: (
        <Button size="sm" variant="ghost" onClick={() => setDetailDialog({ entityType: 'issue', row })} data-testid={`risk-detail-open-issue-${row.id}`}>
          <Eye className="mr-2 h-4 w-4" />
          查看详情
        </Button>
      ),
      entryClassName: row.status === 'closed' ? 'bg-slate-50/80 opacity-70' : 'bg-white/80',
    })
  }

  if (loading && riskRows.length === 0 && warnings.length === 0 && issueRows.length === 0) {
    return <RiskManagementSkeleton />
  }

  if (!projectId) {
    return <div className="min-h-screen bg-slate-50"><PageHeader eyebrow="风险管理" title="风险与问题" subtitle="" /><div className="mx-auto max-w-7xl px-6 py-6"><EmptyState icon={AlertTriangle} title="未找到当前项目" action={<Button onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />返回</Button>} /></div></div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <PageHeader eyebrow="风险管理" title="风险与问题" subtitle="">
          <div className="flex flex-wrap items-center gap-2">
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
          <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={loading}><RefreshCw className="h-4 w-4" />刷新</Button>
        </PageHeader>

        {error ? <Alert className="border-red-200 bg-red-50 text-red-900"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}

        <Card data-testid="risk-summary-band" className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900">风险链路摘要带</div>
                <div className="text-sm text-slate-500">顶部统一收口近 7 天新增、链路来源压力和待人工关闭量，避免只看列表而缺少全局态势。</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">近 7 天新增 {recentWarningCount + recentRiskCount + recentIssueCount} 条</Badge>
                <Badge variant="outline">链路来源 {chainLinkedCount} 条</Badge>
                <Badge variant="outline">默认{getMuteDurationActionLabel(muteDurationHours)}</Badge>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryMetricCard title="近 7 天新增" value={recentRiskCount + recentIssueCount} hint={`预警 ${recentWarningCount} / 风险 ${recentRiskCount} / 问题 ${recentIssueCount}`} icon={Clock3} />
              <SummaryMetricCard title="待人工关闭" value={pendingManualCloseCount} hint="来源已解除但仍需要人工确认关闭" icon={TriangleAlert} />
              <SummaryMetricCard title="高位事项" value={highAttentionCount} hint="严重预警 + 高/严重风险问题总量" icon={Activity} />
              <SummaryMetricCard title="链路来源占比" value={`${chainLinkedCount}/${riskRows.length + issueRows.length || 0}`} hint="来源于预警、阻碍、条件或风险升级链的记录" icon={GitBranch} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <OverviewCard title="预警" count={activeWarnings.length} hint="待确认或待处理的业务预警" icon={Bell} actionLabel="查看预警" onAction={() => setActiveStream('warnings')}>
            {activeWarnings.length === 0 ? <EmptyState icon={Bell} title="暂无预警" className="py-8" /> : <div className="space-y-3">{activeWarnings.slice(0, 3).map((item) => <div key={item.id}>{renderWarningEntry(item)}</div>)}</div>}
          </OverviewCard>
          <OverviewCard title="风险" count={activeRisks.length} hint="风险主数据源使用 /api/risks" icon={ShieldAlert} actionLabel="查看风险" onAction={() => setActiveStream('risks')}>
            {activeRisks.length === 0 ? <EmptyState icon={ShieldAlert} title="暂无风险" className="py-8" /> : <div className="space-y-3">{activeRisks.slice(0, 3).map((row) => <div key={row.id}>{renderRiskEntry(row)}</div>)}</div>}
          </OverviewCard>
          <OverviewCard title="问题" count={activeIssues.length} hint="问题主数据源使用 /api/issues，并按优先级排序" icon={XCircle} actionLabel="查看问题" onAction={() => setActiveStream('problems')}>
            {activeIssues.length === 0 ? <EmptyState icon={XCircle} title="暂无问题" className="py-8" /> : <div className="space-y-3">{activeIssues.slice(0, 3).map((row) => <div key={row.id}>{renderIssueEntry(row)}</div>)}</div>}
          </OverviewCard>
        </div>

        <div data-testid="risk-trend-summary" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {trendSummary.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
              <div className="mt-2 text-xs leading-5 text-slate-500">{item.hint}</div>
            </div>
          ))}
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3"><button type="button" data-testid="risk-trend-toggle" className="flex w-full items-center justify-between text-left" onClick={() => setTrendExpanded((value) => !value)}><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" />趋势分析</CardTitle>{trendExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</button></CardHeader>
          {trendExpanded ? <CardContent className="pt-0"><RiskTrendChart defaultExpanded /></CardContent> : null}
        </Card>

        <Card data-testid="risk-chain-workspace" className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">链路双视图工作区</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={activeStream === 'warnings' ? 'default' : 'outline'} size="sm" onClick={() => setActiveStream('warnings')} data-testid="risk-stream-warnings">预警链</Button>
                <Button variant={activeStream === 'risks' ? 'default' : 'outline'} size="sm" onClick={() => setActiveStream('risks')} data-testid="risk-stream-risks">风险链</Button>
                <Button variant={activeStream === 'problems' ? 'default' : 'outline'} size="sm" onClick={() => setActiveStream('problems')} data-testid="risk-stream-problems">问题链</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeStream === 'warnings' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={warningViewMode === 'task' ? 'default' : 'outline'} size="sm" onClick={() => setWarningViewMode('task')}>按任务归类</Button>
                    <Button variant={warningViewMode === 'timeline' ? 'default' : 'outline'} size="sm" onClick={() => setWarningViewMode('timeline')}>时间轴</Button>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      当前显示 {filteredWarnings.length} 条预警
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={warningFilter} onValueChange={setWarningFilter}>
                      <SelectTrigger className="h-8 w-[220px]" data-testid="warning-filter-select"><SelectValue placeholder="全部预警" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部预警</SelectItem>
                        {warningFilterOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={warningSourceFilter} onValueChange={(value) => setWarningSourceFilter(value as SourceFilterValue)}>
                      <SelectTrigger className="h-8 w-[180px]" data-testid="warning-source-filter-select"><SelectValue placeholder="全部来源" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部来源</SelectItem>
                        <SelectItem value="manual">手动来源</SelectItem>
                        <SelectItem value="chain">链路来源</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {filteredWarnings.length === 0 ? (
                  <EmptyState icon={Bell} title="暂无预警" className="py-12" />
                ) : (
                  groupedWarnings.map((group) => (
                    <Card key={group.title} className="border-slate-200 shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle className="text-base">{group.title}</CardTitle>
                          <Badge variant="secondary">{group.items.length} 条</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {group.items.map((item) => <div key={item.id}>{renderWarningEntry(item)}</div>)}
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            ) : null}

            {activeStream === 'risks' ? (
              <>
                {pendingManualCloseCount > 0 ? <Alert className="border-amber-200 bg-amber-50 text-amber-900"><TriangleAlert className="h-4 w-4" /><AlertDescription>当前有 {pendingManualCloseCount} 条记录待人工确认关闭。</AlertDescription></Alert> : null}
                <ChainToolbar
                  chainViewMode={chainViewMode}
                  sourceFilter={sourceFilter}
                  showPendingManualCloseOnly={showPendingManualCloseOnly}
                  pendingCount={pendingManualCloseCount}
                  onViewModeChange={setChainViewMode}
                  onSourceFilterChange={setSourceFilter}
                  onPendingFilterToggle={() => setShowPendingManualCloseOnly((value) => !value)}
                  action={<ReadOnlyGuard action="create" message="请登录后新建风险"><Button size="sm" onClick={() => { resetManualForms(); setDialogState({ type: 'create-manual-risk' }) }} data-testid="manual-risk-create">新建风险</Button></ReadOnlyGuard>}
                />
                {groupedRisks.length === 0 ? <EmptyState icon={ShieldAlert} title="暂无风险" className="py-12" /> : (
                  <div className={chainViewMode === 'timeline' ? 'relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-0.5 before:bg-slate-200' : 'space-y-3'}>
                    {groupedRisks.map((group) => (
                      <div key={group.title} className={chainViewMode === 'timeline' ? 'relative mb-4' : ''}>
                        {chainViewMode === 'timeline' && <div className="absolute -left-6 top-4 h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />}
                        <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{group.title}</CardTitle><Badge variant="secondary">{group.items.length} 条</Badge></div></CardHeader><CardContent className="space-y-3 pt-0">{group.items.map((row) => <div key={row.id}>{renderRiskEntry(row)}</div>)}</CardContent></Card>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {activeStream === 'problems' ? (
              <>
                <ChainToolbar
                  chainViewMode={chainViewMode}
                  sourceFilter={sourceFilter}
                  showPendingManualCloseOnly={showPendingManualCloseOnly}
                  pendingCount={pendingManualCloseCount}
                  onViewModeChange={setChainViewMode}
                  onSourceFilterChange={setSourceFilter}
                  onPendingFilterToggle={() => setShowPendingManualCloseOnly((value) => !value)}
                  action={<ReadOnlyGuard action="create" message="请登录后新建问题"><Button size="sm" onClick={() => { resetManualForms(); setDialogState({ type: 'create-manual-issue' }) }} data-testid="manual-issue-create">新建问题</Button></ReadOnlyGuard>}
                />
                {escalatableObstacles.length > 0 ? (
                  <Card data-testid="obstacle-escalation-panel" className="border-amber-200 bg-amber-50 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">长期阻碍待上卷</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {escalatableObstacles.map((obstacle) => {
                        const obstacleTitle = String((obstacle as Record<string, unknown>).title ?? obstacle.description ?? '长期阻碍')
                        const escalatedSeverity = getEscalatedObstacleSeverity(obstacle)
                        return (
                          <div key={String(obstacle.id)} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-slate-900">{obstacleTitle}</div>
                                <Badge variant="outline">已持续 {getObstacleAgeDays(obstacle)} 天</Badge>
                                <Badge variant="secondary">升级后 {SEVERITY_LABELS[escalatedSeverity]}</Badge>
                              </div>
                              <div className="text-xs leading-5 text-slate-500">
                                {obstacle.description || '该阻碍已达到 7 天阈值，可直接上卷为问题。'}
                              </div>
                              {getObstacleDrawingsHref(obstacle) ? (
                                <div>
                                  <a
                                    href={getObstacleDrawingsHref(obstacle) ?? '#'}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                    data-testid={`obstacle-drawings-link-${String(obstacle.id)}`}
                                  >
                                    ↗ 查看相关图纸
                                  </a>
                                </div>
                              ) : null}
                            </div>
                            <ReadOnlyGuard action="create" message="请登录后上卷问题">
                              <Button size="sm" onClick={() => void handleEscalateObstacleToIssue(obstacle)} data-testid={`obstacle-escalate-${String(obstacle.id)}`}>
                                上卷为问题
                              </Button>
                            </ReadOnlyGuard>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                ) : null}
                {groupedIssues.length === 0 ? <EmptyState icon={XCircle} title="暂无问题" className="py-12" /> : (
                  <div className={chainViewMode === 'timeline' ? 'relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-0.5 before:bg-slate-200' : 'space-y-3'}>
                    {groupedIssues.map((group) => (
                      <div key={group.title} className={chainViewMode === 'timeline' ? 'relative mb-4' : ''}>
                        {chainViewMode === 'timeline' && <div className="absolute -left-6 top-4 h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />}
                        <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{group.title}</CardTitle><Badge variant="secondary">{group.items.length} 条</Badge></div></CardHeader><CardContent className="space-y-3 pt-0">{group.items.map((row) => <div key={row.id}>{renderIssueEntry(row)}</div>)}</CardContent></Card>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

      </div>

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        {dialogState?.type === 'convert-risk' ? <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>转为问题</DialogTitle><DialogDescription className="sr-only">转为问题</DialogDescription></DialogHeader><div className="space-y-3 text-sm text-slate-600"><div><span className="font-medium text-slate-900">标题：</span>{dialogState.row.title}</div>{dialogState.row.description ? <div>{dialogState.row.description}</div> : null}</div><DialogFooter><Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button><Button onClick={() => void handleConvertRiskToIssue()} loading={saving}>确认转入</Button></DialogFooter></DialogContent> : null}
        {dialogState?.type === 'create-manual-risk' ? <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>新建风险</DialogTitle><DialogDescription className="sr-only">新建风险</DialogDescription></DialogHeader><div className="space-y-4 text-sm text-slate-600"><label className="block space-y-2"><span className="font-medium text-slate-900">风险标题</span><input value={manualRiskTitle} onChange={(event) => setManualRiskTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400" placeholder="例如：主体结构窗口受天气影响" /></label><label className="block space-y-2"><span className="font-medium text-slate-900">严重程度</span><select value={manualRiskSeverity} onChange={(event) => setManualRiskSeverity(event.target.value as RiskRow['severity'])} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="critical">严重</option></select></label><label className="block space-y-2"><span className="font-medium text-slate-900">风险描述</span><textarea value={manualRiskDescription} onChange={(event) => setManualRiskDescription(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400" placeholder="补充内容" /></label></div><DialogFooter><Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button><Button onClick={() => void handleCreateManualRisk()} loading={saving}>确认创建</Button></DialogFooter></DialogContent> : null}
        {dialogState?.type === 'create-manual-issue' ? <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>新建问题</DialogTitle><DialogDescription className="sr-only">新建问题</DialogDescription></DialogHeader><div className="space-y-4 text-sm text-slate-600"><label className="block space-y-2"><span className="font-medium text-slate-900">问题标题</span><input value={manualIssueTitle} onChange={(event) => setManualIssueTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400" placeholder="例如：专项审批资料缺失" /></label><label className="block space-y-2"><span className="font-medium text-slate-900">严重程度</span><select value={manualIssueSeverity} onChange={(event) => setManualIssueSeverity(event.target.value as IssueRow['severity'])} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="critical">严重</option></select></label><label className="block space-y-2"><span className="font-medium text-slate-900">问题描述</span><textarea value={manualIssueDescription} onChange={(event) => setManualIssueDescription(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400" placeholder="补充内容" /></label><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">实时优先级分：<span className="font-semibold text-slate-900">{calculateIssuePriorityScore('manual', manualIssueSeverity)}</span></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button><Button onClick={() => void handleCreateManualIssue()} loading={saving}>确认创建</Button></DialogFooter></DialogContent> : null}
      </Dialog>

      <Dialog open={detailDialog !== null} onOpenChange={(open) => !open && setDetailDialog(null)}>
        {detailDialog ? (
          <DialogContent
            data-testid="risk-detail-dialog"
            className="left-auto right-0 top-0 h-screen max-w-xl translate-x-0 translate-y-0 rounded-none border-l border-slate-200 p-0 shadow-2xl sm:max-w-xl"
          >
            <div className="flex h-full flex-col">
              <DialogHeader className="border-b border-slate-100 px-6 py-5">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Eye className="h-5 w-5 text-slate-400" />
                  记录详情
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {detailDialog.entityType === 'warning'
                    ? '查看预警来源、状态和操作入口。'
                    : detailDialog.entityType === 'risk'
                      ? '查看风险链路、状态与当前处理动作。'
                      : '查看问题链路、状态与当前处理动作。'}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {detailDialog.entityType === 'warning' ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={detailDialog.item.warning_level}>{WARNING_LABEL[detailDialog.item.warning_level]}</StatusBadge>
                        <Badge variant="outline">{getWarningCategory(detailDialog.item)}</Badge>
                        <Badge variant="outline">{getWarningSourceLabel(detailDialog.item)}</Badge>
                        <Badge variant="secondary">{getSourceTypeTagLabel(getWarningSourceType(detailDialog.item))}</Badge>
                        <Badge variant={isWarningResolved(detailDialog.item) ? 'secondary' : 'outline'}>{getWarningStateLabel(detailDialog.item)}</Badge>
                        {getWarningMuteMeta(detailDialog.item).label ? <Badge variant="outline">{getWarningMuteMeta(detailDialog.item).label}</Badge> : null}
                        {detailDialog.item.is_escalated ? <Badge variant="secondary">已升级为风险</Badge> : null}
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-slate-900">{detailDialog.item.title}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{detailDialog.item.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailField label="归类方式" value={getWarningCategory(detailDialog.item)} />
                      <DetailField label="来源口径" value={getWarningSourceLabel(detailDialog.item)} />
                      <DetailField label="任务归属" value={buildTaskBucket(detailDialog.item.task_id)} />
                      <DetailField label="创建时间" value={formatDateTime(detailDialog.item.created_at)} />
                      <DetailField label="当前状态" value={getWarningStateLabel(detailDialog.item)} />
                      <DetailField label="首次出现" value={formatDateTime(detailDialog.item.first_seen_at)} />
                      <DetailField label="知悉时间" value={formatDateTime(detailDialog.item.acknowledged_at)} />
                      <DetailField label="升级时间" value={formatDateTime(detailDialog.item.escalated_at)} />
                    </div>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-900">处理动作</div>
                      <div className="flex flex-wrap gap-2">{renderWarningActions(detailDialog.item)}</div>
                    </div>
                  </>
                ) : null}

                {detailDialog.entityType === 'risk' ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={detailDialog.row.severity}>{SEVERITY_LABELS[detailDialog.row.severity]}</StatusBadge>
                        <StatusBadge status={detailDialog.row.status} fallbackLabel={RISK_STATUS_LABELS[detailDialog.row.status]}>{RISK_STATUS_LABELS[detailDialog.row.status]}</StatusBadge>
                        <Badge variant="outline">{detailDialog.row.sourceLabel}</Badge>
                        <Badge variant="secondary">{getSourceTypeTagLabel(detailDialog.row.sourceType)}</Badge>
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-slate-900">{detailDialog.row.title}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{detailDialog.row.description || '暂无补充描述'}</p>
                      </div>
                      {detailDialog.row.status === 'identified' ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          {getAutoEscalationHint(detailDialog.row.createdAt) || '风险自动升级倒计时暂不可用'}
                        </div>
                      ) : null}
                      {renderPendingManualCloseBanner(detailDialog.row, 'risk')}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailField label="任务归属" value={buildTaskBucket(detailDialog.row.taskId)} />
                      <DetailField label="来源口径" value={detailDialog.row.sourceLabel} />
                      <DetailField label="链路标识" value={detailDialog.row.chainId || '未挂链'} />
                      <DetailField label="创建时间" value={formatDateTime(detailDialog.row.createdAt)} />
                      {detailDialog.row.probability != null && (
                        <DetailField label="可能性评分" value={`${detailDialog.row.probability} / 100`} />
                      )}
                      {detailDialog.row.impact != null && (
                        <DetailField label="影响评分" value={`${detailDialog.row.impact} / 100`} />
                      )}
                      {detailDialog.row.probability != null && detailDialog.row.impact != null && (
                        <DetailField label="风险得分" value={`${Math.round(detailDialog.row.probability * detailDialog.row.impact / 100)}`} />
                      )}
                    </div>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-900">处理动作</div>
                      <div className="flex flex-wrap gap-2">{renderRiskActions(detailDialog.row)}</div>
                    </div>
                  </>
                ) : null}

                {detailDialog.entityType === 'issue' ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={detailDialog.row.severity}>{SEVERITY_LABELS[detailDialog.row.severity]}</StatusBadge>
                        <StatusBadge status={detailDialog.row.status} fallbackLabel={ISSUE_STATUS_LABELS[detailDialog.row.status]}>{ISSUE_STATUS_LABELS[detailDialog.row.status]}</StatusBadge>
                        <Badge variant="outline">{detailDialog.row.sourceLabel}</Badge>
                        <Badge variant="secondary">{getSourceTypeTagLabel(detailDialog.row.sourceType)}</Badge>
                        <Badge variant="outline">优先级分 {detailDialog.row.priorityScore}</Badge>
                        {detailDialog.row.manualPriorityLocked ? <Badge variant="secondary">人工锁定</Badge> : null}
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-slate-900">{detailDialog.row.title}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{detailDialog.row.description || '暂无补充描述'}</p>
                      </div>
                      {renderPendingManualCloseBanner(detailDialog.row, 'issue')}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailField label="任务归属" value={buildTaskBucket(detailDialog.row.taskId)} />
                      <DetailField label="来源口径" value={detailDialog.row.sourceLabel} />
                      <DetailField label="链路标识" value={detailDialog.row.chainId || '未挂链'} />
                      <DetailField label="创建时间" value={formatDateTime(detailDialog.row.createdAt)} />
                    </div>
                    {getIssueDrawingsHref(detailDialog.row) ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">设计阻碍关联图纸</div>
                        <div className="mt-1 text-sm text-slate-600">当前问题来源于设计类阻碍，可直接跳转到图纸台账继续排查。</div>
                        <div className="mt-3">
                          <a
                            href={getIssueDrawingsHref(detailDialog.row) ?? '#'}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
                            data-testid={`issue-drawings-link-${detailDialog.row.id}`}
                          >
                            ↗ 查看相关图纸
                          </a>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-sm text-slate-600">人工覆盖优先级</div>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={priorityDrafts[detailDialog.row.id] ?? detailDialog.row.priorityValue}
                        onChange={(event) => handlePriorityDraftChange(detailDialog.row.id, event.target.value)}
                        className="h-9 w-28"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={(priorityDrafts[detailDialog.row.id] ?? detailDialog.row.priorityValue) === detailDialog.row.priorityValue}
                        onClick={() => void handleSaveIssuePriority(detailDialog.row)}
                      >
                        保存优先级
                      </Button>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-900">处理动作</div>
                      <div className="flex flex-wrap gap-2">{renderIssueActions(detailDialog.row)}</div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={chainDialog !== null} onOpenChange={(open) => !open && setChainDialog(null)}>
        {chainDialog && chainDialogItems ? (
          <DialogContent className="sm:max-w-4xl" data-testid="risk-chain-dialog">
            <DialogHeader>
              <DialogTitle>全链查看</DialogTitle>
              <DialogDescription>链路标识 {chainDialog.chainId}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-slate-200 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">预警 / 风险 / 问题</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {chainDialogItems.linkedWarnings.map((item) => (
                    <div key={`warning-${item.id}`} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">预警</Badge>
                        <div className="font-medium text-slate-900" data-testid={`risk-chain-warning-title-${item.id}`}>{item.title}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{getWarningStateLabel(item)} · {formatDateTime(item.created_at)}</div>
                    </div>
                  ))}
                  {chainDialogItems.linkedRisks.map((row) => (
                    <div key={`risk-${row.id}`} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">风险</Badge>
                        <div className="font-medium text-slate-900" data-testid={`risk-chain-risk-title-${row.id}`}>{row.title}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{RISK_STATUS_LABELS[row.status]} · {formatDateTime(row.createdAt)}</div>
                    </div>
                  ))}
                  {chainDialogItems.linkedIssues.map((row) => (
                    <div key={`issue-${row.id}`} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">问题</Badge>
                        <div className="font-medium text-slate-900" data-testid={`risk-chain-issue-title-${row.id}`}>{row.title}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{ISSUE_STATUS_LABELS[row.status]} · {formatDateTime(row.createdAt)}</div>
                    </div>
                  ))}
                  {chainDialogItems.linkedWarnings.length + chainDialogItems.linkedRisks.length + chainDialogItems.linkedIssues.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                      当前链路暂无可展示的预警、风险或问题记录。
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">变更留痕</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {chainDialogItems.linkedChangeLogs.map((record) => (
                    <div key={record.id} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                      <div className="font-medium text-slate-900">
                        {record.entity_type} · {record.field_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {String(record.old_value ?? '空')} → {String(record.new_value ?? '空')}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {record.change_reason || '未填写变更原因'} · {formatDateTime(record.changed_at)}
                      </div>
                    </div>
                  ))}
                  {chainDialogItems.linkedChangeLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                      当前链路暂无变更留痕。
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <ActionGuardDialog
        open={protectionDialog !== null}
        onOpenChange={(open) => !open && setProtectionDialog(null)}
        title={protectionDialog?.title ?? ''}
        description={protectionDialog?.description ?? ''}
        hint={protectionDialog?.hint}
        testId="risk-action-guard-dialog"
      />
    </div>
  )
}

function OverviewCard({ title, count, hint, icon: Icon, actionLabel, onAction, children }: { title: string; count: number; hint: string; icon: typeof Bell; actionLabel: string; onAction: () => void; children: ReactNode }) {
  void hint

  return <Card className="overflow-hidden border-slate-200 shadow-sm"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="space-y-1"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle></div><div className="rounded-2xl bg-slate-50 px-3 py-2 text-right"><div className="text-2xl font-semibold text-slate-900">{count}</div><div className="text-xs text-slate-500">条</div></div></div></CardHeader><CardContent className="space-y-4 pt-0">{children}<Button variant="outline" size="sm" onClick={onAction}>{actionLabel}</Button></CardContent></Card>
}

function SummaryMetricCard({ title, value, hint, icon: Icon }: { title: string; value: string | number; hint: string; icon: typeof Activity }) {
  void hint

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</div>
          <div className="text-2xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-white p-2 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

function ChainToolbar({
  chainViewMode,
  sourceFilter,
  showPendingManualCloseOnly,
  pendingCount,
  onViewModeChange,
  onSourceFilterChange,
  onPendingFilterToggle,
  action,
}: {
  chainViewMode: ChainViewMode
  sourceFilter: SourceFilterValue
  showPendingManualCloseOnly: boolean
  pendingCount: number
  onViewModeChange: (value: ChainViewMode) => void
  onSourceFilterChange: (value: SourceFilterValue) => void
  onPendingFilterToggle: () => void
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={chainViewMode === 'task' ? 'default' : 'outline'} size="sm" onClick={() => onViewModeChange('task')}>按任务归类</Button>
        <Button variant={chainViewMode === 'timeline' ? 'default' : 'outline'} size="sm" onClick={() => onViewModeChange('timeline')}>时间轴</Button>
        <Button variant={showPendingManualCloseOnly ? 'default' : 'outline'} size="sm" onClick={onPendingFilterToggle} data-testid="pending-manual-close-toggle">待确认关闭{pendingCount > 0 ? ` (${pendingCount})` : ''}</Button>
        <button type="button" className="sr-only" data-testid="pending-manual-close-filter" onClick={onPendingFilterToggle}>pending manual close filter</button>
        <Select value={sourceFilter} onValueChange={(value) => onSourceFilterChange(value as SourceFilterValue)}><SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="来源筛选" /></SelectTrigger><SelectContent><SelectItem value="all">全部来源</SelectItem><SelectItem value="manual">只看手动添加</SelectItem><SelectItem value="chain">只看链路记录</SelectItem></SelectContent></Select>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
        <GitBranch className="h-3.5 w-3.5" />
        {chainViewMode === 'task' ? '当前按任务聚合' : '当前按时间轴聚合'}
      </div>
      {action}
    </div>
  )
}
