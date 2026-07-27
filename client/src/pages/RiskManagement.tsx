import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowLeft, BarChart3, Bell, ChevronRight, Clock3, Eye, GitBranch, Link2, RefreshCw, Search, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react'
import { CartesianGrid, Line, LineChart, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'

import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import { Breadcrumb } from '@/components/Breadcrumb'
import { RiskManagementSkeleton } from '@/components/ui/page-skeleton'
import { ActionGuardDialog } from '@/components/ActionGuardDialog'
import { EmptyState } from '@/components/EmptyState'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { PageHeader } from '@/components/PageHeader'
import { ReadOnlyGuard } from '@/components/ReadOnlyGuard'
import { ChartTooltip, chartTooltipCursor } from '@/components/ui/chart-tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricCard as SharedMetricCard } from '@/components/ui/metric-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useStructuredCauseTaxonomy } from '@/hooks/useStructuredCauseTaxonomy'
import { CHART_AXIS_COLORS, CHART_SERIES } from '@/lib/chartPalette'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/apiClient'
import { elapsedLocalDaysSince } from '@/lib/dateDistance'
import { formatDate as formatDisplayDate, formatDateTime as formatDisplayDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { getMuteDurationActionLabel, MUTE_DURATION_OPTIONS, type AllowedMuteHours } from '@/lib/muteDurations'
import {
  buildRetentionDecisionDialogModel,
  getRetentionApiErrorCode,
  getRetentionDecisionTokenFromError,
  isRetentionConfirmationError,
  parseRetentionApiError,
  type RetentionParsedError,
} from '@/lib/retentionError'
import type { Issue, Risk, TaskObstacle } from '@/lib/supabase'

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

type ClosureResultCode = 'resolved' | 'mitigated' | 'transferred' | 'accepted' | 'duplicate' | 'invalidated'
type ClosureEffectiveness = 'resolved' | 'partially_resolved' | 'transferred' | 'accepted' | 'undetermined'
type ClosureResponsibilityClass =
  | 'none'
  | 'owner_attributable'
  | 'contractor_attributable'
  | 'force_majeure'
  | 'shared'
  | 'undetermined'

type DialogState =
  | { type: 'convert-risk'; row: RiskRow }
  | { type: 'create-manual-risk' }
  | { type: 'create-manual-issue' }
  | { type: 'structured-close'; entityType: 'risk'; row: RiskRow; pendingManualClose: boolean }
  | { type: 'structured-close'; entityType: 'issue'; row: IssueRow; pendingManualClose: boolean }
  | null

type ProtectionDialogState = {
  title: string
  description: string
  hint: string
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

type DetailDialogState =
  | { entityType: 'warning'; item: WarningItem }
  | { entityType: 'risk'; row: RiskRow }
  | { entityType: 'issue'; row: IssueRow }
  | null

type DeleteDialogState =
  | { entityType: 'risk'; row: RiskRow; isChainLinked: boolean; retentionDecisionToken?: string; retention?: RetentionParsedError | null }
  | { entityType: 'issue'; row: IssueRow; isChainLinked: boolean; retentionDecisionToken?: string; retention?: RetentionParsedError | null }
  | null

type ChainDialogState = {
  chainId: string
} | null

type ChainStream = 'warnings' | 'risks' | 'issues'
type ChainViewMode = 'task' | 'timeline'
type WarningFilterValue = 'all' | string
type SourceFilterValue = 'all' | 'manual' | 'chain'
type WorkspaceLevelFilter = 'all' | 'urgent' | 'normal'
type WorkspaceStatusFilter = 'all' | 'active' | 'closed' | 'pending'
type WorkspaceOwnerFilter = 'all' | 'task' | 'project'
type TrendSeriesKey = 'warnings' | 'risks' | 'issues' | 'closed'

type RiskPipelineStages = {
  identified: number
  assessed: number
  responded: number
  monitored: number
}

type RiskTrendPoint = {
  date: string
  newRisks: number
  resolvedRisks: number
  totalRisks: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
  newIssues: number
  resolvedIssues: number
  totalIssues: number
  newWarnings: number
  resolvedWarnings: number
  totalWarnings: number
}

type RiskTrendResponse = {
  trend: RiskTrendPoint[]
  pipelineStages?: RiskPipelineStages
}

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
const CLOSURE_RESULT_OPTIONS: Array<{ value: ClosureResultCode; label: string }> = [
  { value: 'resolved', label: '已解决' },
  { value: 'mitigated', label: '已缓解' },
  { value: 'transferred', label: '已转移' },
  { value: 'accepted', label: '已接受' },
  { value: 'duplicate', label: '重复记录' },
  { value: 'invalidated', label: '已失效' },
]
const CLOSURE_EFFECTIVENESS_OPTIONS: Array<{ value: ClosureEffectiveness; label: string }> = [
  { value: 'resolved', label: '完全解决' },
  { value: 'partially_resolved', label: '部分解决' },
  { value: 'transferred', label: '已转移' },
  { value: 'accepted', label: '已接受' },
  { value: 'undetermined', label: '待观察' },
]
const CLOSURE_RESPONSIBILITY_OPTIONS: Array<{ value: ClosureResponsibilityClass; label: string }> = [
  { value: 'none', label: '暂不判定' },
  { value: 'owner_attributable', label: '发包人原因' },
  { value: 'contractor_attributable', label: '承包人原因' },
  { value: 'force_majeure', label: '不可抗力' },
  { value: 'shared', label: '共同原因' },
  { value: 'undetermined', label: '责任待定' },
]
const PENDING_MANUAL_CLOSE_LABEL = '待确认关闭'
const SOURCE_WEIGHT: Record<string, number> = { condition_expired: 4, obstacle_escalated: 3, risk_converted: 2, risk_auto_escalated: 2, manual: 1 }
const SEVERITY_WEIGHT: Record<RiskRow['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1 }
const WARNING_LEVEL_WEIGHT: Record<WarningItem['warning_level'], number> = { critical: 3, warning: 2, info: 1 }
const ISSUE_PRIORITY_PRESET = [2, 4, 8, 12, 16, 24]
const WORKSPACE_PAGE_SIZE = 6
const EMPTY_PIPELINE: RiskPipelineStages = { identified: 0, assessed: 0, responded: 0, monitored: 0 }
const TREND_SERIES: Array<{ key: TrendSeriesKey; label: string; color: string }> = [
  { key: 'warnings', label: '预警', color: CHART_SERIES.warning },
  { key: 'risks', label: '风险', color: CHART_SERIES.danger },
  { key: 'issues', label: '问题', color: CHART_SERIES.primary },
  { key: 'closed', label: '已关闭', color: CHART_SERIES.success },
]

function normalizeSeverity(value: unknown): RiskRow['severity'] {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'critical' || raw === 'severe') return 'critical'
  if (raw === 'high') return 'high'
  if (raw === 'low') return 'low'
  return 'medium'
}

function inferClosureCauseCode(row: RiskRow | IssueRow): string {
  const token = `${row.sourceType} ${row.title} ${row.description ?? ''}`.toLowerCase()
  if (/(material|supplier|材料|到货|供应商)/.test(token)) return 'material_shortage'
  if (/(labor|worker|personnel|人员|劳动力|班组)/.test(token)) return 'labor_shortage'
  if (/(equipment|machine|机械|设备)/.test(token)) return 'equipment_unavailable'
  if (/(drawing|图纸|出图|审图)/.test(token)) return 'drawing_delay'
  if (/(design.change|设计变更)/.test(token)) return 'design_change'
  if (/(quality|rework|质量|返工)/.test(token)) return 'quality_rework'
  if (/(weather|rain|storm|天气|降雨|高温|低温)/.test(token)) return 'weather_impact'
  if (/(predecessor|dependency|前置|依赖)/.test(token)) return 'predecessor_delay'
  if (/(condition|obstacle|warning|条件|阻碍|预警)/.test(token)) return 'external_readiness'
  return 'other'
}

function normalizeRiskStatusFilter(value: string | null): 'all' | RiskRow['status'] {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'identified' || raw === 'mitigating' || raw === 'closed') return raw
  if (raw === '已识别') return 'identified'
  if (raw === '处理中') return 'mitigating'
  if (raw === '已关闭') return 'closed'
  return 'all'
}

function normalizeRiskSeverityFilter(value: string | null): 'all' | RiskRow['severity'] {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'critical' || raw === 'high' || raw === 'medium' || raw === 'low') return raw
  if (raw === '严重' || raw === 'severe') return 'critical'
  if (raw === '高') return 'high'
  if (raw === '中') return 'medium'
  if (raw === '低') return 'low'
  return 'all'
}

const CHAIN_LINKED_RISK_SOURCES = new Set(['warning_converted', 'warning_auto_escalated'])
const CHAIN_LINKED_ISSUE_SOURCES = new Set(['risk_converted', 'risk_auto_escalated', 'obstacle_escalated', 'condition_expired'])

function isRiskChainLinked(row: { sourceType?: string | null; linkedIssueId?: string | null }) {
  if (row.linkedIssueId) return true
  return CHAIN_LINKED_RISK_SOURCES.has(row.sourceType ?? '')
}

function isIssueChainLinked(row: { sourceType?: string | null }) {
  return CHAIN_LINKED_ISSUE_SOURCES.has(row.sourceType ?? '')
}

function getSourceLabel(sourceType: string, sourceEntityType?: string | null) {
  if (sourceType === 'warning_converted') return '预警确认'
  if (sourceType === 'warning_auto_escalated') return '预警自动升级'
  if (sourceType === 'risk_converted') return '风险转问题'
  if (sourceType === 'risk_auto_escalated') return '风险自动升级'
  if (sourceType === 'obstacle_escalated') return '阻碍升级'
  if (sourceType === 'condition_expired' && sourceEntityType === 'acceptance_plan') return '验收逾期'
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
  return formatDisplayDateTime(value, '--')
}

function buildTaskBucket(taskId?: string | null) {
  return taskId ? `任务 ${taskId}` : '项目级'
}

function buildTimelineBucket(createdAt?: string) {
  if (!createdAt) return '未记录时间'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '未记录时间'
  return formatDisplayDate(date, '未记录时间')
}

function calculateIssuePriorityScore(sourceType: string, severity: IssueRow['severity'], createdAt?: string, options?: { isLocked?: boolean; currentPriority?: number }) {
  if (options?.isLocked && typeof options.currentPriority === 'number') {
    return Math.max(1, Math.min(100, Math.round(options.currentPriority)))
  }

  const base = (SOURCE_WEIGHT[sourceType] ?? 1) * SEVERITY_WEIGHT[severity]
  const unresolvedDays = elapsedLocalDaysSince(createdAt) ?? 0
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
  const ageDays = elapsedLocalDaysSince(createdAt)
  if (ageDays === null) return null
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
  return elapsedLocalDaysSince(obstacle.created_at) ?? 0
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
  return getSourceBucket(sourceType) === 'manual' ? '人工创建' : '关联升级'
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
    sourceLabel: getSourceLabel(String(raw.source_type ?? 'manual'), raw.source_entity_type ? String(raw.source_entity_type) : null),
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
  const sourceEntityType = raw.source_entity_type ? String(raw.source_entity_type) : raw.sourceEntityType ? String(raw.sourceEntityType) : null
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
    sourceLabel: raw.sourceLabel ? String(raw.sourceLabel) : getSourceLabel(sourceType, sourceEntityType),
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
    sourceEntityType,
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
  const ageDays = elapsedLocalDaysSince(value)
  return ageDays !== null && ageDays <= days
}

function formatShortDate(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function includesText(parts: Array<string | undefined | null>, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return parts.some((part) => String(part ?? '').toLowerCase().includes(normalized))
}

function matchesOwnerFilter(taskId: string | undefined | null, filter: WorkspaceOwnerFilter) {
  if (filter === 'all') return true
  return filter === 'task' ? Boolean(taskId) : !taskId
}

function matchesWarningStatus(item: WarningItem, filter: WorkspaceStatusFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return !isWarningResolved(item)
  if (filter === 'closed') return isWarningResolved(item)
  return !item.is_acknowledged && !isWarningResolved(item)
}

function matchesRiskStatus(row: RiskRow, filter: WorkspaceStatusFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return row.status !== 'closed'
  if (filter === 'closed') return row.status === 'closed'
  return row.pendingManualClose
}

function matchesIssueStatus(row: IssueRow, filter: WorkspaceStatusFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return row.status !== 'closed'
  if (filter === 'closed') return row.status === 'closed'
  return row.pendingManualClose
}

function matchesSeverityFilter(severity: RiskRow['severity'], filter: WorkspaceLevelFilter) {
  if (filter === 'all') return true
  const urgent = severity === 'critical' || severity === 'high'
  return filter === 'urgent' ? urgent : !urgent
}

function matchesWarningLevelFilter(level: WarningItem['warning_level'], filter: WorkspaceLevelFilter) {
  if (filter === 'all') return true
  return filter === 'urgent' ? level === 'critical' : level !== 'critical'
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const start = (currentPage - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    currentPage,
    totalPages,
  }
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
  useEffect(() => {
    document.title = '风险管理 | WorkBuddy'
  }, [])

  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const { canEdit } = usePermissions({ projectId: params.id || currentProject?.id })
  const causeTaxonomy = useStructuredCauseTaxonomy()
  const rawTasks = useStore((state) => state.tasks)
  const rawWarnings = useStore((state) => state.warnings)
  const rawIssueRows = useStore((state) => state.issueRows)
  const rawProblemRows = useStore((state) => state.problemRows)
  const setWarnings = useStore((state) => state.setWarnings)
  const setIssueRows = useStore((state) => state.setIssueRows)
  const setProblemRows = useStore((state) => state.setProblemRows)
  const setSharedSliceStatus = useStore((state) => state.setSharedSliceStatus)
  const projectId = params.id || currentProject?.id || ''
  const projectName = currentProject?.name || '当前项目'
  const goBack = projectId ? () => navigate(`/projects/${projectId}/dashboard`) : () => navigate(-1)

  const [riskRows, setRiskRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStream, setActiveStream] = useState<ChainStream>('warnings')
  const [riskViewMode, setRiskViewMode] = useState<ChainViewMode>('task')
  const [warningViewMode, setWarningViewMode] = useState<ChainViewMode>('task')
  const [riskSourceFilter, setRiskSourceFilter] = useState<SourceFilterValue>('all')
  const [riskStatusFilter, setRiskStatusFilter] = useState<'all' | RiskRow['status']>('all')
  const [riskSeverityFilter, setRiskSeverityFilter] = useState<'all' | RiskRow['severity']>('all')
  const [warningSourceFilter, setWarningSourceFilter] = useState<SourceFilterValue>('all')
  const [riskShowPendingManualCloseOnly, setRiskShowPendingManualCloseOnly] = useState(false)
  const [issueViewMode, setIssueViewMode] = useState<ChainViewMode>('task')
  const [issueSourceFilter, setIssueSourceFilter] = useState<SourceFilterValue>('all')
  const [issueShowPendingManualCloseOnly, setIssueShowPendingManualCloseOnly] = useState(false)
  const [warningFilter, setWarningFilter] = useState<WarningFilterValue>('all')
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [workspaceLevelFilter, setWorkspaceLevelFilter] = useState<WorkspaceLevelFilter>('all')
  const [workspaceStatusFilter, setWorkspaceStatusFilter] = useState<WorkspaceStatusFilter>('all')
  const [workspaceOwnerFilter, setWorkspaceOwnerFilter] = useState<WorkspaceOwnerFilter>('all')
  const [workspacePage, setWorkspacePage] = useState(1)
  const [riskTrendData, setRiskTrendData] = useState<RiskTrendResponse | null>(null)
  const [hiddenTrendSeries, setHiddenTrendSeries] = useState<Record<TrendSeriesKey, boolean>>({
    warnings: false,
    risks: false,
    issues: false,
    closed: false,
  })
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [protectionDialog, setProtectionDialog] = useState<ProtectionDialogState | null>(null)
  const [detailDialog, setDetailDialog] = useState<DetailDialogState>(null)
  const [chainDialog, setChainDialog] = useState<ChainDialogState>(null)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualRiskTitle, setManualRiskTitle] = useState('')
  const [manualRiskDescription, setManualRiskDescription] = useState('')
  const [manualRiskSeverity, setManualRiskSeverity] = useState<RiskRow['severity']>('medium')
  const [manualIssueTitle, setManualIssueTitle] = useState('')
  const [manualIssueDescription, setManualIssueDescription] = useState('')
  const [manualIssueSeverity, setManualIssueSeverity] = useState<IssueRow['severity']>('medium')
  const [closureResultCode, setClosureResultCode] = useState<ClosureResultCode>('resolved')
  const [closureEffectiveness, setClosureEffectiveness] = useState<ClosureEffectiveness>('resolved')
  const [closureCauseCode, setClosureCauseCode] = useState('')
  const [closureResponsibilityClass, setClosureResponsibilityClass] = useState<ClosureResponsibilityClass>('none')
  const [closureResultSummary, setClosureResultSummary] = useState('')
  const [closureResponsibilityBasis, setClosureResponsibilityBasis] = useState('')
  const [closureError, setClosureError] = useState<string | null>(null)
  const selectedClosureCause = causeTaxonomy.resolveCode(closureCauseCode)
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number>>({})
  const [muteDurationHours, setMuteDurationHours] = useState<AllowedMuteHours>(24)

  useEffect(() => {
    if (closureCauseCode && !selectedClosureCause) setClosureCauseCode('')
  }, [closureCauseCode, selectedClosureCause])

  const routeRiskFilters = useMemo(() => {
    const query = new URLSearchParams(location.search)
    return {
      status: normalizeRiskStatusFilter(query.get('status')),
      severity: normalizeRiskSeverityFilter(query.get('level')),
    }
  }, [location.search])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    setSharedSliceStatus('warnings', { loading: true, error: null })
    setSharedSliceStatus('issueRows', { loading: true, error: null })
    setSharedSliceStatus('problemRows', { loading: true, error: null })
    try {
      const [warningResult, riskResult, issueResult, obstacleResult, riskTrendResult] = await Promise.allSettled([
        apiGet<WarningItem[]>(`/api/warnings?projectId=${encodeURIComponent(projectId)}&includeResolved=1`, { signal }),
        loadRisks(projectId),
        loadIssues(projectId),
        apiGet<TaskObstacle[]>(`/api/task-obstacles?projectId=${encodeURIComponent(projectId)}`, { signal }),
        apiGet<RiskTrendResponse>(`/api/risk-statistics/trend?projectId=${encodeURIComponent(projectId)}&days=30`, { signal }),
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

      if (riskTrendResult.status === 'fulfilled') {
        setRiskTrendData(riskTrendResult.value ?? null)
      } else {
        setRiskTrendData(null)
      }

      setError(errors.length > 0 ? errors.join('；') : null)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [projectId, setIssueRows, setProblemRows, setSharedSliceStatus, setWarnings])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort() }
  }, [refresh])

  const warnings = useMemo(
    () =>
      rawWarnings.map((item) => ({
        ...item,
        resolved_source: normalizeResolvedSource(item.resolved_source),
      } as WarningItem)),
    [rawWarnings],
  )
  const issueRows = useMemo(
    () => rawIssueRows.map((item) => normalizeIssueRow(item as unknown as Issue)),
    [rawIssueRows],
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
          if (!includesText([item.title, item.description, item.task_id, getWarningCategory(item)], workspaceSearch)) return false
          if (!matchesWarningLevelFilter(item.warning_level, workspaceLevelFilter)) return false
          if (!matchesWarningStatus(item, workspaceStatusFilter)) return false
          if (!matchesOwnerFilter(item.task_id, workspaceOwnerFilter)) return false
          return true
        }),
      ),
    [warningFilter, warningSourceFilter, warnings, workspaceLevelFilter, workspaceOwnerFilter, workspaceSearch, workspaceStatusFilter],
  )
  const filteredRisks = useMemo(() => riskRows.filter((row) => {
    if (riskShowPendingManualCloseOnly && !row.pendingManualClose) return false
    if (riskSourceFilter !== 'all' && getSourceBucket(row.sourceType) !== riskSourceFilter) return false
    const effectiveStatusFilter = riskStatusFilter !== 'all' ? riskStatusFilter : routeRiskFilters.status
    const effectiveSeverityFilter = riskSeverityFilter !== 'all' ? riskSeverityFilter : routeRiskFilters.severity
    if (effectiveStatusFilter !== 'all' && row.status !== effectiveStatusFilter) return false
    if (effectiveSeverityFilter !== 'all' && row.severity !== effectiveSeverityFilter) return false
    if (!includesText([row.title, row.description, row.taskId, row.sourceLabel], workspaceSearch)) return false
    if (!matchesSeverityFilter(row.severity, workspaceLevelFilter)) return false
    if (!matchesRiskStatus(row, workspaceStatusFilter)) return false
    if (!matchesOwnerFilter(row.taskId, workspaceOwnerFilter)) return false
    return true
  }), [riskRows, riskSeverityFilter, riskShowPendingManualCloseOnly, riskSourceFilter, riskStatusFilter, routeRiskFilters.severity, routeRiskFilters.status, workspaceLevelFilter, workspaceOwnerFilter, workspaceSearch, workspaceStatusFilter])
  const filteredIssues = useMemo(() => issueRows.filter((row) => {
    if (issueShowPendingManualCloseOnly && !row.pendingManualClose) return false
    if (issueSourceFilter !== 'all' && getSourceBucket(row.sourceType) !== issueSourceFilter) return false
    if (!includesText([row.title, row.description, row.taskId, row.sourceLabel], workspaceSearch)) return false
    if (!matchesSeverityFilter(row.severity, workspaceLevelFilter)) return false
    if (!matchesIssueStatus(row, workspaceStatusFilter)) return false
    if (!matchesOwnerFilter(row.taskId, workspaceOwnerFilter)) return false
    return true
  }), [issueRows, issueShowPendingManualCloseOnly, issueSourceFilter, workspaceLevelFilter, workspaceOwnerFilter, workspaceSearch, workspaceStatusFilter])

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
        const ageDays = elapsedLocalDaysSince(row.created_at)
        return ageDays !== null && ageDays >= 7
      }),
    [activeObstacleRows, obstacleLinkedIssueIds],
  )
  const activeWarnings = useMemo(() => sortWarnings(warnings.filter((item) => !isWarningResolved(item))), [warnings])
  const activeRisks = useMemo(() => riskRows.filter((row) => row.status !== 'closed'), [riskRows])
  const activeIssues = useMemo(() => issueRows.filter((row) => row.status !== 'closed'), [issueRows])
  // eslint-disable-next-line -- frontend-bi-aggregation-approved: display-only workbench reminder from loaded risk/issue rows, not a BI SSOT metric.
  const pendingManualCloseCount = useMemo(() => [...riskRows, ...issueRows].filter((row) => row.pendingManualClose).length, [issueRows, riskRows])
  const paginatedWarnings = useMemo(() => paginateRows(filteredWarnings, workspacePage, WORKSPACE_PAGE_SIZE), [filteredWarnings, workspacePage])
  const paginatedRisks = useMemo(() => paginateRows(sortRiskRows(filteredRisks), workspacePage, WORKSPACE_PAGE_SIZE), [filteredRisks, workspacePage])
  const paginatedIssues = useMemo(() => paginateRows(sortIssueRows(filteredIssues), workspacePage, WORKSPACE_PAGE_SIZE), [filteredIssues, workspacePage])
  const groupedWarnings = useMemo(() => groupWarnings(paginatedWarnings.rows, warningViewMode), [paginatedWarnings.rows, warningViewMode])
  const groupedRisks = useMemo(() => groupRows(paginatedRisks.rows, riskViewMode), [paginatedRisks.rows, riskViewMode])
  const groupedIssues = useMemo(() => groupRows(paginatedIssues.rows, issueViewMode), [paginatedIssues.rows, issueViewMode])
  const currentPagination = activeStream === 'warnings' ? paginatedWarnings : activeStream === 'risks' ? paginatedRisks : paginatedIssues
  const currentFilteredCount = activeStream === 'warnings' ? filteredWarnings.length : activeStream === 'risks' ? filteredRisks.length : filteredIssues.length
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
  useEffect(() => {
    setWorkspacePage(1)
  }, [activeStream, issueSourceFilter, issueShowPendingManualCloseOnly, riskShowPendingManualCloseOnly, riskSourceFilter, riskStatusFilter, riskSeverityFilter, warningFilter, warningSourceFilter, workspaceLevelFilter, workspaceOwnerFilter, workspaceSearch, workspaceStatusFilter])

  const localPipelineStages = useMemo<RiskPipelineStages>(() => riskRows.reduce<RiskPipelineStages>((stages, row) => {
    if (row.status === 'identified') stages.identified += 1
    else if (row.status === 'mitigating') stages.responded += 1
    else stages.monitored += 1
    return stages
  }, { ...EMPTY_PIPELINE }), [riskRows])
  const pipelineStages = riskTrendData?.pipelineStages ?? localPipelineStages
  const trendChartData = useMemo(() => {
    const remoteTrend = riskTrendData?.trend ?? []
    if (remoteTrend.length > 0) {
      return remoteTrend.map((point) => ({
        date: point.date,
        warnings: point.totalWarnings,
        risks: point.totalRisks,
        issues: point.totalIssues,
        closed: point.resolvedRisks + point.resolvedIssues + point.resolvedWarnings,
      }))
    }

    return Array.from({ length: 7 }, (_, index) => {
      const dayWeight = index + 1
      return {
        date: `D-${6 - index}`,
        warnings: Math.round((activeWarnings.length * dayWeight) / 7),
        risks: Math.round((activeRisks.length * dayWeight) / 7),
        issues: Math.round((activeIssues.length * dayWeight) / 7),
        closed: Math.max(0, Math.round(((riskRows.length + issueRows.length - activeRisks.length - activeIssues.length) * dayWeight) / 7)),
      }
    })
  }, [activeIssues.length, activeRisks.length, activeWarnings.length, issueRows.length, riskRows.length, riskTrendData?.trend])
  const overviewCards = useMemo(() => [
    {
      id: 'warnings',
      title: '预警',
      value: activeWarnings.length,
      accentClassName: 'ring-1 ring-inset ring-amber-200',
      trend: recentWarningCount > 0 ? `近 7 天 +${recentWarningCount}` : '近 7 天无新增',
      items: activeWarnings.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        meta: `${buildTaskBucket(item.task_id)} · ${formatShortDate(item.created_at)}`,
      })),
      total: activeWarnings.length,
      onViewAll: () => setActiveStream('warnings'),
    },
    {
      id: 'risks',
      title: '风险',
      value: activeRisks.length,
      accentClassName: 'ring-1 ring-inset ring-red-200',
      trend: recentRiskCount > 0 ? `近 7 天 +${recentRiskCount}` : '近 7 天无新增',
      items: sortRiskRows(activeRisks).slice(0, 3).map((row) => ({
        id: row.id,
        title: row.title,
        meta: `${buildTaskBucket(row.taskId)} · ${formatShortDate(row.createdAt)}`,
      })),
      total: activeRisks.length,
      onViewAll: () => setActiveStream('risks'),
    },
    {
      id: 'issues',
      title: '问题',
      value: activeIssues.length,
      accentClassName: 'ring-1 ring-inset ring-blue-200',
      trend: recentIssueCount > 0 ? `近 7 天 +${recentIssueCount}` : '近 7 天无新增',
      items: sortIssueRows(activeIssues).slice(0, 3).map((row) => ({
        id: row.id,
        title: row.title,
        meta: `${buildTaskBucket(row.taskId)} · ${formatShortDate(row.createdAt)}`,
      })),
      total: activeIssues.length,
      onViewAll: () => setActiveStream('issues'),
    },
  ], [activeIssues, activeRisks, activeWarnings, recentIssueCount, recentRiskCount, recentWarningCount])
  const resetManualForms = () => {
    setManualRiskTitle('')
    setManualRiskDescription('')
    setManualRiskSeverity('medium')
    setManualIssueTitle('')
    setManualIssueDescription('')
    setManualIssueSeverity('medium')
  }

  const presentMutationError = useCallback((error: unknown, actionLabel: string) => {
    if (hasHttpStatus(error, 409)) {
      void refresh().then(() => {
        setProtectionDialog({
          title: '数据已被他人修改',
          description: getErrorMessage(error, '已自动刷新最新数据，请确认后重新操作。'),
          hint: '这通常表示其他用户已处理了该记录，或版本号已经发生变化。',
        })
      })
      return
    }

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

  const openStructuredCloseDialog = useCallback((
    row: RiskRow | IssueRow,
    entityType: 'risk' | 'issue',
    pendingManualClose = row.pendingManualClose,
  ) => {
    setClosureResultCode(entityType === 'risk' ? 'mitigated' : 'resolved')
    setClosureEffectiveness('resolved')
    setClosureCauseCode(causeTaxonomy.resolveCode(inferClosureCauseCode(row))?.code ?? '')
    setClosureResponsibilityClass('none')
    setClosureResultSummary('')
    setClosureResponsibilityBasis('')
    setClosureError(null)
    if (entityType === 'risk') {
      setDialogState({ type: 'structured-close', entityType, row: row as RiskRow, pendingManualClose })
    } else {
      setDialogState({ type: 'structured-close', entityType, row: row as IssueRow, pendingManualClose })
    }
  }, [causeTaxonomy])

  const handleSubmitStructuredClose = useCallback(async () => {
    if (!projectId || dialogState?.type !== 'structured-close') return
    const summary = closureResultSummary.trim()
    if (!summary) {
      setClosureError('请填写实际处理结果。')
      return
    }
    const confirmedTaxonomyCause = causeTaxonomy.resolveCode(closureCauseCode)
    if (!confirmedTaxonomyCause) {
      setClosureError('请从当前原因分类中选择有效项。')
      return
    }

    setClosureError(null)
    setSaving(true)
    const { entityType, row, pendingManualClose } = dialogState
    try {
      const confirmedCause = await apiPost<{ id?: string }>(
        `/api/cause-attributions/projects/${encodeURIComponent(projectId)}/subjects/${entityType}/${encodeURIComponent(row.id)}/confirm`,
        {
          causeCode: confirmedTaxonomyCause.code,
          causeRole: 'primary',
          rawText: summary,
          ...(closureResponsibilityClass === 'none'
            ? {}
            : { responsibilityClass: closureResponsibilityClass }),
          ...(closureResponsibilityClass !== 'none' && closureResponsibilityBasis.trim()
            ? { responsibilityBasis: closureResponsibilityBasis.trim() }
            : {}),
        },
      )
      const causeAttributionId = String(confirmedCause?.id ?? '').trim()
      if (!causeAttributionId) throw new Error('原因归因记录创建失败，请重试。')

      if (pendingManualClose) {
        await apiPost(`/api/${entityType === 'risk' ? 'risks' : 'issues'}/${row.id}/confirm-close`, {
          version: row.version,
          resultCode: closureResultCode,
          resultSummary: summary,
          effectiveness: closureEffectiveness,
          evidenceRefs: [],
          causeAttributionId,
        })
      } else {
        await apiPut(`/api/${entityType === 'risk' ? 'risks' : 'issues'}/${row.id}`, {
          status: 'closed',
          version: row.version,
          closed_reason: summary,
          closure_result_code: closureResultCode,
          closure_result_summary: summary,
          closure_effectiveness: closureEffectiveness,
          closure_evidence_refs: [],
          closure_cause_attribution_id: causeAttributionId,
        })
      }

      setDialogState(null)
      await refresh()
      toast({ title: entityType === 'risk' ? '风险已关闭' : '问题已关闭', description: row.title })
    } catch (error) {
      presentMutationError(error, entityType === 'risk' ? '确认关闭风险' : '确认关闭问题')
    } finally {
      setSaving(false)
    }
  }, [
    closureCauseCode,
    causeTaxonomy,
    closureEffectiveness,
    closureResponsibilityBasis,
    closureResponsibilityClass,
    closureResultCode,
    closureResultSummary,
    dialogState,
    presentMutationError,
    projectId,
    refresh,
    toast,
  ])

  const handleAcknowledgeWarning = useCallback(async (item: WarningItem) => {
    if (!canEdit) return
    try {
      await apiPut(`/api/warnings/${item.id}/acknowledge`, {})
      toast({ title: '已知悉预警', description: item.title })
      await refresh()
    } catch (error) {
      presentMutationError(error, '预警知悉')
    }
  }, [canEdit, presentMutationError, refresh, toast])

  const handleMuteWarning = useCallback(async (item: WarningItem) => {
    if (!canEdit) return
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
        secondaryActionLabel: '查看详情',
        onSecondaryAction: () => setDetailDialog({ entityType: 'risk', row }),
      })
      return false
    }

    if (updates.status === 'identified' && row.status === 'closed') {
      setProtectionDialog({
        title: '风险重新打开需先回到处理中',
        description: '已关闭风险不能直接跳回已识别。',
        hint: '请先恢复为“处理中”，再根据后续判断继续收口或升级。',
        secondaryActionLabel: '查看详情',
        onSecondaryAction: () => setDetailDialog({ entityType: 'risk', row }),
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
        secondaryActionLabel: '查看详情',
        onSecondaryAction: () => setDetailDialog({ entityType: 'issue', row }),
      })
      return false
    }

    if (updates.status === 'closed' && row.status !== 'resolved') {
      setProtectionDialog({
        title: '问题状态暂不可直接关闭',
        description: '只有“已解决（待确认）”的问题才允许关闭。',
        hint: 'open / investigating 状态需要先完成调查和解决确认。',
        secondaryActionLabel: '查看详情',
        onSecondaryAction: () => setDetailDialog({ entityType: 'issue', row }),
      })
      return false
    }

    if (updates.status === 'open' && row.status !== 'investigating') {
      setProtectionDialog({
        title: '当前问题暂不可回退到待处理',
        description: '只有“调查中”的问题允许回退到待处理。',
        hint: '这一步用于撤回调查动作，不用于重新打开已关闭问题。',
        secondaryActionLabel: '查看详情',
        onSecondaryAction: () => setDetailDialog({ entityType: 'issue', row }),
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

  const handleKeepProcessingRisk = useCallback(async (row: RiskRow) => {
    try {
      await apiPost(`/api/risks/${row.id}/keep-processing`, { version: row.version })
      return true
    } catch (error) {
      presentMutationError(error, `保持风险处理中「${row.title}」`)
      return false
    }
  }, [presentMutationError])

  const handleKeepProcessingIssue = useCallback(async (row: IssueRow) => {
    try {
      await apiPost(`/api/issues/${row.id}/keep-processing`, { version: row.version })
      return true
    } catch (error) {
      presentMutationError(error, `保持问题处理中「${row.title}」`)
      return false
    }
  }, [presentMutationError])

  const handlePendingManualCloseDecision = useCallback(async (row: RiskRow | IssueRow, entityType: 'risk' | 'issue', keepProcessing: boolean) => {
    if (!keepProcessing) {
      openStructuredCloseDialog(row, entityType, true)
      return
    }
    const success = entityType === 'risk'
      ? await handleKeepProcessingRisk(row as RiskRow)
      : await handleKeepProcessingIssue(row as IssueRow)

    if (!success) return
    await refresh()
    toast({ title: '已保持处理中', description: row.title })
  }, [handleKeepProcessingIssue, handleKeepProcessingRisk, openStructuredCloseDialog, refresh, toast])

  const handleDeleteSelectedEntity = useCallback(async () => {
    if (!deleteDialog) return

    setDeleteSubmitting(true)
    try {
      if (deleteDialog.retentionDecisionToken) {
        if (!projectId) throw new Error('项目不存在，无法确认保留处置')
        await apiPost('/api/deletion-retention/confirm', {
          projectId,
          decisionToken: deleteDialog.retentionDecisionToken,
        })
        toast({ title: '已完成保留处置', description: deleteDialog.row.title })
      } else if (deleteDialog.entityType === 'risk') {
        await apiDelete(`/api/risks/${deleteDialog.row.id}`)
        toast({ title: '已删除风险', description: deleteDialog.row.title })
      } else {
        await apiDelete(`/api/issues/${deleteDialog.row.id}`)
        toast({ title: '已删除问题', description: deleteDialog.row.title })
      }

      setDeleteDialog(null)
      setDetailDialog(null)
      await refresh()
    } catch (error) {
      const decisionToken = getRetentionDecisionTokenFromError(error)
      const retention = parseRetentionApiError(error)
      if (
        hasHttpStatus(error, 409) &&
        isRetentionConfirmationError(error) &&
        getRetentionApiErrorCode(error) === 'RETENTION_CONFIRMATION_REQUIRED' &&
        decisionToken
      ) {
        setDeleteDialog({
          ...deleteDialog,
          retentionDecisionToken: decisionToken,
          retention,
        })
        return
      }
      presentMutationError(error, deleteDialog.entityType === 'risk' ? `删除风险「${deleteDialog.row.title}」` : `删除问题「${deleteDialog.row.title}」`)
    } finally {
      setDeleteSubmitting(false)
    }
  }, [deleteDialog, presentMutationError, projectId, refresh, toast])

  const retentionDialogModel = buildRetentionDecisionDialogModel({
    title: deleteDialog?.entityType === 'risk' ? '删除风险' : '删除问题',
    entityName: deleteDialog?.row.title ?? '',
    fallbackDescription: deleteDialog?.isChainLinked
      ? '该记录已升级为关闭状态，不能直接删除；关闭记录会继续保留历史链路。'
      : deleteDialog?.entityType === 'risk'
        ? `将删除风险「${deleteDialog?.row?.title ?? ''}」，相关联动记录将保留但不再从风险列表展示。`
        : `将删除问题「${deleteDialog?.row?.title ?? ''}」，相关联动记录将保留但不再从问题列表展示。`,
    retention: deleteDialog?.retention ?? null,
  })

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

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const requestedStream = query.get('stream') || query.get('tab')
    if (requestedStream === 'warnings' || requestedStream === 'risks' || requestedStream === 'issues') {
      setActiveStream(requestedStream)
    }

    const nextRiskStatusFilter = normalizeRiskStatusFilter(query.get('status'))
    const nextRiskSeverityFilter = normalizeRiskSeverityFilter(query.get('level'))
    setRiskStatusFilter(nextRiskStatusFilter)
    setRiskSeverityFilter(nextRiskSeverityFilter)
    if (nextRiskStatusFilter !== 'all' || nextRiskSeverityFilter !== 'all') {
      setActiveStream('risks')
    }

    const issueId = query.get('issueId')
    const riskId = query.get('riskId')
    const taskId = query.get('taskId')?.trim()
    if (taskId) {
      setWorkspaceSearch(taskId)
      setWorkspaceOwnerFilter('task')
      if (!requestedStream) setActiveStream('risks')
    }
    if (issueId) {
      setActiveStream('issues')
      openIssueDetailById(issueId)
    }
    if (riskId) {
      setActiveStream('risks')
      openRiskDetailById(riskId)
    }
  }, [location.search, openIssueDetailById, openRiskDetailById])

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
    if (!projectId || !canEdit) return
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
        source_id: obstacle.id,
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

    return {
      linkedWarnings,
      linkedRisks,
      linkedIssues,
    }
  }, [chainDialog?.chainId, issueRows, riskRows, warnings])

  function renderPendingManualCloseBanner(row: RiskRow | IssueRow, entityType: 'risk' | 'issue') {
    if (!row.pendingManualClose) return null
    const copy = getPendingManualCloseCopy(row, entityType)
    return (
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <p className="font-medium">{copy.title}</p>
              <p className="leading-5 text-amber-800">{copy.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7" data-testid={`confirm-close-${entityType}-${row.id}`} onClick={() => void handlePendingManualCloseDecision(row, entityType, false)} disabled={!canEdit}>确认关闭</Button>
              <Button size="sm" variant="outline" className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100" data-testid={`keep-processing-${entityType}-${row.id}`} onClick={() => void handlePendingManualCloseDecision(row, entityType, true)} disabled={!canEdit}>保持处理中</Button>
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
              查看关联
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
              查看关联
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
      <div className={`rounded-2xl border border-slate-100 p-4 shadow-[var(--el-1)] ${entryClassName ?? 'bg-white/80'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
            {banner ? <div className="pt-1">{banner}</div> : null}
            {footer ? <p className="text-xs text-slate-500">{footer}</p> : null}
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
        {resolved && item.resolved_source === 'auto' ? <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">系统联动消除</Badge> : null}
        {resolved && item.resolved_source === 'manual' ? <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">人工消除</Badge> : null}
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
    return (
      <ReadOnlyGuard action="edit" message="请登录后处理风险">
        <>
          {!row.pendingManualClose ? (
            <>
              {row.status === 'identified' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateRisk(row, { status: 'mitigating' })}>开始处理</Button> : null}
              {row.status === 'mitigating' ? <Button size="sm" variant="outline" onClick={() => openStructuredCloseDialog(row, 'risk', false)}>关闭风险</Button> : null}
              {row.status === 'closed' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateRisk(row, { status: 'mitigating', linked_issue_id: null, closed_reason: null, closed_at: null })}>恢复处理</Button> : null}
              {row.status !== 'closed' ? <Button size="sm" onClick={() => setDialogState({ type: 'convert-risk', row })}>转为问题</Button> : null}
            </>
          ) : null}
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
              查看关联
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteDialog({ entityType: 'risk', row, isChainLinked: isRiskChainLinked(row) })}
            data-testid={`risk-delete-risk-${row.id}`}
          >
            {isRiskChainLinked(row) ? '关闭' : '删除'}
          </Button>
        </>
      </ReadOnlyGuard>
    )
  }

  function renderIssueActions(row: IssueRow) {
    return (
      <ReadOnlyGuard action="edit" message="请登录后处理问题">
        <>
          {!row.pendingManualClose ? (
            <>
              {row.status === 'open' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'investigating' })}>开始调查</Button> : null}
              {row.status === 'investigating' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'open' })}>退回待处理</Button> : null}
              {row.status === 'investigating' ? <Button size="sm" variant="outline" onClick={() => void handleUpdateIssue(row, { status: 'resolved' })}>标记已解决</Button> : null}
              {row.status === 'resolved' ? <Button size="sm" variant="outline" onClick={() => openStructuredCloseDialog(row, 'issue', false)}>确认关闭</Button> : null}
            </>
          ) : null}
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
              查看关联
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteDialog({ entityType: 'issue', row, isChainLinked: isIssueChainLinked(row) })}
            data-testid={`risk-delete-issue-${row.id}`}
          >
            {isIssueChainLinked(row) ? '关闭' : '删除'}
          </Button>
        </>
      </ReadOnlyGuard>
    )
  }

  function renderRiskEntry(row: RiskRow) {
    const escalationHint = row.status === 'identified' ? getAutoEscalationHint(row.createdAt) : null
    return renderEntry({
      badges: <>
        <StatusBadge status={row.severity}>{SEVERITY_LABELS[row.severity]}</StatusBadge>
        <StatusBadge status={row.status} fallbackLabel={RISK_STATUS_LABELS[row.status]} statusDomain="risk.lifecycle" statusKey={row.status} visualTone={row.status === 'closed' ? 'green' : row.status === 'mitigating' ? 'blue' : 'amber'}>{RISK_STATUS_LABELS[row.status]}</StatusBadge>
        {row.pendingManualClose ? <StatusBadge status="warning">{PENDING_MANUAL_CLOSE_LABEL}</StatusBadge> : null}
        {row.linkedIssueId ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
            <Link2 className="h-3.5 w-3.5" />
            已挂问题
          </span>
        ) : null}
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
        {row.pendingManualClose ? <StatusBadge status="warning">{PENDING_MANUAL_CLOSE_LABEL}</StatusBadge> : null}
        {row.status === 'resolved' && row.resolved_source === 'auto' ? <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">系统联动解决</Badge> : null}
        {row.status === 'resolved' && row.resolved_source === 'manual' ? <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">人工解决</Badge> : null}
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
    return (
      <div className="page-shell">
          <Breadcrumb items={[{ label: '工作台', href: '/workspace' }, { label: '风险管理' }]} />
          <PageHeader eyebrow="风险管控" title="风险管理" />
          <EmptyState icon={AlertTriangle} title="未找到当前项目" action={<Button onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />返回</Button>} />
      </div>
    )
  }

  return (
    <div className="page-shell">
        <Breadcrumb
          items={[
            { label: projectName, href: `/projects/${projectId}/dashboard` },
            { label: '风险管理' },
          ]}
        />

        <PageHeader eyebrow="风险管控" title="风险管理">
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

        <Card data-testid="risk-summary-band" variant="surface">
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900">风险链路摘要带</div>
                <div className="text-sm text-slate-500">顶部统一收口近 7 天新增、链路来源压力、人工关闭和高位事项。</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">近 7 天新增 {recentWarningCount + recentRiskCount + recentIssueCount} 条</Badge>
                <Badge variant="outline">链路来源 {chainLinkedCount} 条</Badge>
                <Badge variant="outline">默认{getMuteDurationActionLabel(muteDurationHours)}</Badge>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <SharedMetricCard eyebrow="RECENT" title="近 7 天新增" value={recentWarningCount + recentRiskCount + recentIssueCount} hint={`预警 ${recentWarningCount} / 风险 ${recentRiskCount} / 问题 ${recentIssueCount}`} icon={<Clock3 className="h-4 w-4" />} sparkline={[recentWarningCount, recentRiskCount, recentIssueCount, recentWarningCount + recentRiskCount + recentIssueCount]} tone="primary" />
              <SharedMetricCard eyebrow="CLOSE" title="待人工关闭" value={pendingManualCloseCount} hint="来源已解除但仍需要人工确认关闭" icon={<TriangleAlert className="h-4 w-4" />} sparkline={[0, pendingManualCloseCount, pendingManualCloseCount]} tone={pendingManualCloseCount > 0 ? 'warning' : 'slate'} />
              <SharedMetricCard eyebrow="HIGH" title="高位事项" value={highAttentionCount} hint="严重预警 + 高/严重风险问题总量" icon={<Activity className="h-4 w-4" />} sparkline={[activeWarnings.length, activeRisks.length, activeIssues.length, highAttentionCount]} tone={highAttentionCount > 0 ? 'danger' : 'slate'} />
              <SharedMetricCard eyebrow="LINKED" title="链路来源占比" value={`${chainLinkedCount}/${riskRows.length + issueRows.length || 0}`} hint="来源于预警、阻碍、条件或风险升级链的记录" icon={<GitBranch className="h-4 w-4" />} sparkline={[chainLinkedCount, riskRows.length, issueRows.length, chainLinkedCount]} tone="info" />
            </div>
          </CardContent>
        </Card>

        <PipelineFlow pipelineStages={pipelineStages} />

        <div data-testid="risk-overview-cards" className="grid gap-5 lg:grid-cols-3">
          {overviewCards.map((card) => (
            <OverviewCard key={card.id} {...card} />
          ))}
        </div>

        {/* v1.4.16: data reliability removed from RiskManagement; Dashboard is sole entry */}

        <RiskMultiLineChart
          data={trendChartData}
          hiddenSeries={hiddenTrendSeries}
          onToggleSeries={(key) => setHiddenTrendSeries((current) => ({ ...current, [key]: !current[key] }))}
        />

        <section data-testid="risk-chain-workspace" className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <CardHead eyebrow="WORKSPACE" title="链路双视图工作区" />
                <div className="text-sm text-slate-500">预警、风险、问题三张独立工作台，筛选与视图状态彼此隔离。</div>
              </div>
              <div className="space-y-3">
                <StreamFlowHint activeStream={activeStream} />
                <Tabs value={activeStream} onValueChange={(value) => setActiveStream(value as ChainStream)}>
                  <TabsList className="flex h-auto w-full justify-start gap-6 rounded-none border-b border-slate-100 bg-transparent p-0 text-slate-500">
                    <TabsTrigger value="warnings" data-testid="risk-stream-warnings" className="relative rounded-none bg-transparent px-0 pb-3 pt-0 text-sm text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">预警看板</TabsTrigger>
                    <TabsTrigger value="risks" data-testid="risk-stream-risks" className="relative rounded-none bg-transparent px-0 pb-3 pt-0 text-sm text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">风险登记册</TabsTrigger>
                    <TabsTrigger value="issues" data-testid="risk-stream-issues" className="relative rounded-none bg-transparent px-0 pb-3 pt-0 text-sm text-slate-500 shadow-none transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-700 data-[state=active]:shadow-none data-[state=active]:after:bg-blue-600">问题工作台</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <WorkspaceFilterBar
              search={workspaceSearch}
              levelFilter={workspaceLevelFilter}
              statusFilter={workspaceStatusFilter}
              ownerFilter={workspaceOwnerFilter}
              total={currentFilteredCount}
              onSearchChange={setWorkspaceSearch}
              onLevelFilterChange={setWorkspaceLevelFilter}
              onStatusFilterChange={setWorkspaceStatusFilter}
              onOwnerFilterChange={setWorkspaceOwnerFilter}
            />
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
                      <SelectTrigger className="h-8 w-56" data-testid="warning-filter-select"><SelectValue placeholder="全部预警" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部预警</SelectItem>
                        {warningFilterOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={warningSourceFilter} onValueChange={(value) => setWarningSourceFilter(value as SourceFilterValue)}>
                      <SelectTrigger className="h-8 w-44" data-testid="warning-source-filter-select"><SelectValue placeholder="全部来源" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部来源</SelectItem>
                        <SelectItem value="manual">手动来源</SelectItem>
                        <SelectItem value="chain">链路来源</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {filteredWarnings.length === 0 ? (
                  <EmptyState
                    variant={warningFilter !== 'all' || warningSourceFilter !== 'all' ? 'filter' : 'default'}
                    icon={Bell}
                    title="暂无预警"
                    className="py-12"
                    onClearFilter={() => {
                      setWarningFilter('all')
                      setWarningSourceFilter('all')
                    }}
                  />
                ) : (
                  groupedWarnings.map((group) => (
                    <Card key={group.title} className="surface-card">
                      <CardContent padding="md" className="space-y-3">
                        <CardHead
                          eyebrow="WARNINGS"
                          title={group.title}
                          pill={{ label: `${group.items.length} 条`, variant: 'neutral' }}
                        />
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
                  chainViewMode={riskViewMode}
                  sourceFilter={riskSourceFilter}
                  showPendingManualCloseOnly={riskShowPendingManualCloseOnly}
                  pendingCount={pendingManualCloseCount}
                  onViewModeChange={setRiskViewMode}
                  onSourceFilterChange={setRiskSourceFilter}
                  onPendingFilterToggle={() => setRiskShowPendingManualCloseOnly((value) => !value)}
                  action={<ReadOnlyGuard action="create" message="请登录后新建风险"><Button size="sm" onClick={() => { resetManualForms(); setDialogState({ type: 'create-manual-risk' }) }} data-testid="manual-risk-create" disabled={!canEdit}>新建风险</Button></ReadOnlyGuard>}
                />
                {groupedRisks.length === 0 ? <EmptyState variant={riskSourceFilter !== 'all' || riskStatusFilter !== 'all' || riskSeverityFilter !== 'all' || riskShowPendingManualCloseOnly ? 'filter' : 'default'} icon={ShieldAlert} title="暂无风险" className="py-12" onClearFilter={() => { setRiskSourceFilter('all'); setRiskStatusFilter('all'); setRiskSeverityFilter('all'); setRiskShowPendingManualCloseOnly(false) }} /> : (
                  <div className={riskViewMode === 'timeline' ? 'relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-0.5 before:bg-slate-200' : 'space-y-3'}>
                    {groupedRisks.map((group) => (
                      <div key={group.title} className={riskViewMode === 'timeline' ? 'relative mb-4' : ''}>
                        {riskViewMode === 'timeline' && <div className="absolute -left-6 top-4 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-white" />}
                        <Card className="surface-card"><CardContent padding="md" className="space-y-3"><CardHead eyebrow="RISKS" title={group.title} pill={{ label: `${group.items.length} 条`, variant: 'neutral' }} />{group.items.map((row) => <div key={row.id}>{renderRiskEntry(row)}</div>)}</CardContent></Card>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {activeStream === 'issues' ? (
              <>
                <ChainToolbar
                  chainViewMode={issueViewMode}
                  sourceFilter={issueSourceFilter}
                  showPendingManualCloseOnly={issueShowPendingManualCloseOnly}
                  pendingCount={pendingManualCloseCount}
                  onViewModeChange={setIssueViewMode}
                  onSourceFilterChange={setIssueSourceFilter}
                  onPendingFilterToggle={() => setIssueShowPendingManualCloseOnly((value) => !value)}
                  action={<ReadOnlyGuard action="create" message="请登录后新建问题"><Button size="sm" onClick={() => { resetManualForms(); setDialogState({ type: 'create-manual-issue' }) }} data-testid="manual-issue-create" disabled={!canEdit}>新建问题</Button></ReadOnlyGuard>}
                />
                {escalatableObstacles.length > 0 ? (
                  <Card data-testid="obstacle-escalation-panel" className="border-amber-200 bg-amber-50 shadow-[var(--el-1)]">
                    <CardContent padding="md" className="space-y-3">
                      <CardHead eyebrow="ISSUES" title="长期阻碍待上卷" />
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
                {groupedIssues.length === 0 ? <EmptyState variant={issueSourceFilter !== 'all' || issueShowPendingManualCloseOnly ? 'filter' : 'default'} icon={XCircle} title="暂无问题" className="py-12" onClearFilter={() => { setIssueSourceFilter('all'); setIssueShowPendingManualCloseOnly(false) }} /> : (
                  <div className={issueViewMode === 'timeline' ? 'relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-0.5 before:bg-slate-200' : 'space-y-3'}>
                    {groupedIssues.map((group) => (
                      <div key={group.title} className={issueViewMode === 'timeline' ? 'relative mb-4' : ''}>
                        {issueViewMode === 'timeline' && <div className="absolute -left-6 top-4 h-3.5 w-3.5 rounded-full border-2 border-slate-400 bg-white" />}
                        <Card className="surface-card"><CardContent padding="md" className="space-y-3"><CardHead eyebrow="ISSUES" title={group.title} pill={{ label: `${group.items.length} 条`, variant: 'neutral' }} />{group.items.map((row) => <div key={row.id}>{renderIssueEntry(row)}</div>)}</CardContent></Card>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {currentFilteredCount > 0 ? (
              <div data-testid="risk-workspace-pagination" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Pagination
                  currentPage={currentPagination.currentPage}
                  totalPages={currentPagination.totalPages}
                  pageSize={WORKSPACE_PAGE_SIZE}
                  totalItems={currentFilteredCount}
                  onPageChange={setWorkspacePage}
                />
              </div>
            ) : null}
        </section>

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        {dialogState?.type === 'structured-close' ? (
          <DialogContent className="max-w-[var(--dialog-lg-width)]" data-testid="structured-close-dialog">
            <DialogHeader>
              <DialogTitle>{dialogState.entityType === 'risk' ? '关闭风险' : '关闭问题'}</DialogTitle>
              <DialogDescription className="sr-only">
                记录关闭结果、原因分类和可选责任判断
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{dialogState.row.title}</p>
                {dialogState.row.description ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">{dialogState.row.description}</p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="closure-result-code">处理结果</Label>
                  <Select value={closureResultCode} onValueChange={(value) => setClosureResultCode(value as ClosureResultCode)}>
                    <SelectTrigger id="closure-result-code"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      {CLOSURE_RESULT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closure-effectiveness">处置效果</Label>
                  <Select value={closureEffectiveness} onValueChange={(value) => setClosureEffectiveness(value as ClosureEffectiveness)}>
                    <SelectTrigger id="closure-effectiveness"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      {CLOSURE_EFFECTIVENESS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closure-cause-code">原因分类</Label>
                  <Select
                    value={closureCauseCode || undefined}
                    onValueChange={setClosureCauseCode}
                    disabled={causeTaxonomy.status !== 'ready'}
                  >
                    <SelectTrigger id="closure-cause-code"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      {causeTaxonomy.entries.map((entry) => (
                        <SelectItem key={entry.code} value={entry.code}>{entry.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closure-responsibility-class">责任判断</Label>
                  <Select value={closureResponsibilityClass} onValueChange={(value) => setClosureResponsibilityClass(value as ClosureResponsibilityClass)}>
                    <SelectTrigger id="closure-responsibility-class"><SelectValue /></SelectTrigger>
                    <SelectContent align="start">
                      {CLOSURE_RESPONSIBILITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="closure-result-summary">实际处理结果</Label>
                <Textarea
                  id="closure-result-summary"
                  data-testid="closure-result-summary"
                  value={closureResultSummary}
                  onChange={(event) => setClosureResultSummary(event.target.value)}
                  maxLength={2000}
                  aria-invalid={Boolean(closureError)}
                  className={cn('min-h-24', closureError && 'border-red-500')}
                />
              </div>
              {closureResponsibilityClass !== 'none' ? (
                <div className="space-y-2">
                  <Label htmlFor="closure-responsibility-basis">责任判断依据</Label>
                  <Textarea
                    id="closure-responsibility-basis"
                    value={closureResponsibilityBasis}
                    onChange={(event) => setClosureResponsibilityBasis(event.target.value)}
                    maxLength={1000}
                    className="min-h-20"
                  />
                </div>
              ) : null}
              {closureError ? <p className="text-sm text-red-600" role="alert">{closureError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button>
              <Button
                data-testid="structured-close-submit"
                onClick={() => void handleSubmitStructuredClose()}
                loading={saving}
                disabled={saving || !closureResultSummary.trim() || !selectedClosureCause}
              >确认关闭</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
        {dialogState?.type === 'convert-risk' ? <DialogContent className="max-w-[var(--dialog-md-width)]"><DialogHeader><DialogTitle>转为问题</DialogTitle><DialogDescription className="sr-only">转为问题</DialogDescription></DialogHeader><div className="space-y-3 text-sm text-slate-600"><div><span className="font-medium text-slate-900">标题：</span>{dialogState.row.title}</div>{dialogState.row.description ? <div>{dialogState.row.description}</div> : null}</div><DialogFooter><Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button><Button onClick={() => void handleConvertRiskToIssue()} loading={saving}>确认转入</Button></DialogFooter></DialogContent> : null}
        {dialogState?.type === 'create-manual-risk' ? (
          <DialogContent className="max-w-[var(--dialog-md-width)]">
            <DialogHeader>
              <DialogTitle>新建风险</DialogTitle>
              <DialogDescription className="sr-only">新建风险</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm text-slate-600">
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">风险标题</span>
                <input value={manualRiskTitle} onChange={(event) => setManualRiskTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400" placeholder="例如：主体结构窗口受天气影响" />
              </label>
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">严重程度</span>
                <input
                  type="hidden"
                  data-testid="manual-risk-severity-value"
                  value={manualRiskSeverity}
                  onInput={(event) => setManualRiskSeverity(event.currentTarget.value as RiskRow['severity'])}
                  onChange={(event) => setManualRiskSeverity(event.target.value as RiskRow['severity'])}
                  aria-hidden="true"
                />
                <Select value={manualRiskSeverity} onValueChange={(value) => setManualRiskSeverity(value as RiskRow['severity'])}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900" data-testid="manual-risk-severity-select" data-value={manualRiskSeverity}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">严重</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">风险描述</span>
                <textarea value={manualRiskDescription} onChange={(event) => setManualRiskDescription(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400" placeholder="补充内容" />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button>
              <Button onClick={() => void handleCreateManualRisk()} loading={saving}>确认创建</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
        {dialogState?.type === 'create-manual-issue' ? (
          <DialogContent className="max-w-[var(--dialog-md-width)]">
            <DialogHeader>
              <DialogTitle>新建问题</DialogTitle>
              <DialogDescription className="sr-only">新建问题</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm text-slate-600">
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">问题标题</span>
                <input value={manualIssueTitle} onChange={(event) => setManualIssueTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400" placeholder="例如：专项审批资料缺失" />
              </label>
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">严重程度</span>
                <input
                  type="hidden"
                  data-testid="manual-issue-severity-value"
                  value={manualIssueSeverity}
                  onInput={(event) => setManualIssueSeverity(event.currentTarget.value as IssueRow['severity'])}
                  onChange={(event) => setManualIssueSeverity(event.target.value as IssueRow['severity'])}
                  aria-hidden="true"
                />
                <Select value={manualIssueSeverity} onValueChange={(value) => setManualIssueSeverity(value as IssueRow['severity'])}>
                  <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900" data-testid="manual-issue-severity-select" data-value={manualIssueSeverity}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="critical">严重</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-2">
                <span className="font-medium text-slate-900">问题描述</span>
                <textarea value={manualIssueDescription} onChange={(event) => setManualIssueDescription(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400" placeholder="补充内容" />
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                实时优先级分：<span className="font-semibold text-slate-900">{calculateIssuePriorityScore('manual', manualIssueSeverity)}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogState(null)} disabled={saving}>取消</Button>
              <Button onClick={() => void handleCreateManualIssue()} loading={saving}>确认创建</Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={detailDialog !== null} onOpenChange={(open) => !open && setDetailDialog(null)}>
        {detailDialog ? (
          <DialogContent
            data-testid="risk-detail-dialog"
            className="left-auto right-0 top-0 h-screen max-w-[var(--dialog-lg-width)] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 p-0 shadow-[var(--el-4)] sm:max-w-[var(--dialog-lg-width)]"
          >
            <div className="flex h-full flex-col">
              <DialogHeader className="px-6 py-5">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Eye className="h-5 w-5 text-slate-500" />
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
              <Separator />

              <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5">
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
                    <div className="grid gap-5 sm:grid-cols-2">
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
                    <div className="grid gap-5 sm:grid-cols-2">
                      <DetailField label="任务归属" value={buildTaskBucket(detailDialog.row.taskId)} />
                      <DetailField label="来源口径" value={detailDialog.row.sourceLabel} />
                      <DetailField label="关联记录" value={detailDialog.row.chainId ? '查看关联过程' : '独立记录'} />
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
                    <div className="grid gap-5 sm:grid-cols-2">
                      <DetailField label="任务归属" value={buildTaskBucket(detailDialog.row.taskId)} />
                      <DetailField label="来源口径" value={detailDialog.row.sourceLabel} />
                      <DetailField label="关联记录" value={detailDialog.row.chainId ? '查看关联过程' : '独立记录'} />
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
          <DialogContent className="max-w-[var(--dialog-lg-width)]" data-testid="risk-chain-dialog">
            <DialogHeader>
              <DialogTitle>全链查看</DialogTitle>
              <DialogDescription>关联记录（风险/问题/预警升级链）</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="border-slate-200 shadow-none">
                <CardContent padding="md" className="space-y-3">
                  <CardHead eyebrow="CHAIN" title="预警 / 风险 / 问题" />
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
                    <div className="rounded-xl empty-state-frame border-slate-200 px-4 py-5 text-sm text-slate-500">
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
        secondaryActionLabel={protectionDialog?.secondaryActionLabel}
        onSecondaryAction={protectionDialog?.onSecondaryAction}
        testId="risk-action-guard-dialog"
      />

      <DeleteProtectionDialog
        open={deleteDialog !== null}
        onOpenChange={(open) => !open && setDeleteDialog(null)}
        title={retentionDialogModel.title}
        description={retentionDialogModel.description}
        warning={
          deleteDialog?.retentionDecisionToken
            ? '确认后不会清除历史链路，只更新当前风险/问题的处置状态。'
            : deleteDialog?.isChainLinked
              ? '该记录已升级为关闭状态，请使用关闭处置链路。'
              : '该操作无法撤销，请确认该条目确实不需要保留。'
        }
        confirmLabel={retentionDialogModel.confirmLabel}
        confirmTone={retentionDialogModel.confirmTone}
        loading={deleteSubmitting}
        onConfirm={() => void handleDeleteSelectedEntity()}
        testId="risk-delete-dialog"
      />
    </div>
  )
}

function PipelineFlow({ pipelineStages }: { pipelineStages: RiskPipelineStages }) {
  const stages = [
    { label: '识别', count: pipelineStages.identified, status: pipelineStages.identified > 0 ? 'active' : 'empty' },
    { label: '评估', count: pipelineStages.assessed, status: pipelineStages.assessed > 0 ? 'active' : 'empty' },
    { label: '应对', count: pipelineStages.responded, status: pipelineStages.responded > 0 ? 'active' : 'empty' },
    { label: '监控', count: pipelineStages.monitored, status: 'done' },
  ] as const

  return (
    <Card data-testid="risk-pipeline-flow" variant="surface">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold text-slate-900">风险处置链路</div>
            <div className="text-sm text-slate-500">流程阶段展示风险从识别到监控的处置进度，下方按类型查看详情。</div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stages.map((stage, index) => (
              <Fragment key={stage.label}>
                <div
                  className={cn(
                    'flex min-w-28 flex-col items-center gap-1 rounded-xl px-6 py-3 motion-safe:transition-all motion-safe:duration-300',
                    stage.status === 'active'
                      ? 'bg-orange-700 text-white shadow-[var(--el-2)]'
                      : stage.status === 'done'
                        ? 'bg-emerald-700 text-white shadow-[var(--el-2)]'
                        : 'bg-slate-200 text-slate-700',
                  )}
                >
                  <span className="text-sm font-medium">{stage.label}</span>
                  <span className="text-lg font-bold num-display">{stage.count}项</span>
                </div>
                {index < stages.length - 1 ? (
                  <ChevronRight className="h-5 w-5 text-slate-300 motion-safe:transition-all motion-safe:duration-300" />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewCard({
  title,
  value,
  trend,
  items,
  total,
  accentClassName,
  onViewAll,
}: {
  title: string
  value: number
  trend: string
  items: Array<{ id: string; title: string; meta: string }>
  total: number
  accentClassName: string
  onViewAll: () => void
}) {
  return (
    <div className={cn('surface-card space-y-4 p-5 transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[var(--el-3)]', accentClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">{title}</div>
          <div className="num-display mt-2 text-3xl font-semibold text-slate-900">{value}</div>
        </div>
        <Badge variant="outline">{trend}</Badge>
      </div>
      <div className="space-y-2">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="truncate text-sm font-medium text-slate-900">{item.title}</div>
            <div className="mt-1 text-xs num-mono text-slate-500">{item.meta}</div>
          </div>
        )) : (
          <EmptyState
            title="暂无记录"
            description="当前分类没有需要展示的链路记录。"
            className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
          />
        )}
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-between" onClick={onViewAll}>
        查看全部({total})
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

function RiskMultiLineChart({
  data,
  hiddenSeries,
  onToggleSeries,
}: {
  data: Array<Record<TrendSeriesKey | 'date', string | number>>
  hiddenSeries: Record<TrendSeriesKey, boolean>
  onToggleSeries: (key: TrendSeriesKey) => void
}) {
  return (
    <div data-testid="risk-trend-summary" className="surface-card space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            趋势分析
          </div>
          <div className="text-sm text-slate-500">预警、风险、问题和已关闭事项按同一时间轴汇总。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TREND_SERIES.map((series) => (
            <Button
              key={series.key}
              variant={hiddenSeries[series.key] ? 'outline' : 'default'}
              size="sm"
              className="gap-2"
              onClick={() => onToggleSeries(series.key)}
              data-testid={`risk-trend-legend-${series.key}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </Button>
          ))}
        </div>
      </div>
      <ChartAccessibleWrapper
        columns={['日期', '预警', '风险', '问题', '已关闭']}
        rows={data.map((row) => [row.date, row.warnings, row.risks, row.issues, row.closed])}
        summary="查看风险管理多折线趋势数据"
      >
        <div className="overflow-x-auto">
          <LineChart width={920} height={280} data={data} margin={{ top: 10, right: 24, bottom: 8, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
            <XAxis dataKey="date" tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 12 }} tickLine={false} axisLine={{ stroke: CHART_AXIS_COLORS.neutralStroke }} />
            <YAxis allowDecimals={false} tick={{ fill: CHART_AXIS_COLORS.axisText, fontSize: 12 }} tickLine={false} axisLine={{ stroke: CHART_AXIS_COLORS.neutralStroke }} />
            <RechartsTooltip content={<ChartTooltip />} cursor={chartTooltipCursor} />
            {TREND_SERIES.map((series) => hiddenSeries[series.key] ? null : (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </div>
      </ChartAccessibleWrapper>
    </div>
  )
}

function StreamFlowHint({ activeStream }: { activeStream: ChainStream }) {
  const nodes: Array<{ key: ChainStream; label: string }> = [
    { key: 'warnings', label: '预警' },
    { key: 'risks', label: '风险' },
    { key: 'issues', label: '问题' },
  ]

  return (
    <div data-testid="risk-stream-flow-hint" className="flex items-center justify-end gap-2 text-xs">
      {nodes.map((node, index) => (
        <Fragment key={node.key}>
          <span className={cn('rounded-full px-2 py-0.5', activeStream === node.key ? 'bg-blue-600 text-white' : 'text-slate-500')}>
            {node.label}
          </span>
          {index < nodes.length - 1 ? <span className="text-slate-300">→</span> : null}
        </Fragment>
      ))}
    </div>
  )
}

function WorkspaceFilterBar({
  search,
  levelFilter,
  statusFilter,
  ownerFilter,
  total,
  onSearchChange,
  onLevelFilterChange,
  onStatusFilterChange,
  onOwnerFilterChange,
}: {
  search: string
  levelFilter: WorkspaceLevelFilter
  statusFilter: WorkspaceStatusFilter
  ownerFilter: WorkspaceOwnerFilter
  total: number
  onSearchChange: (value: string) => void
  onLevelFilterChange: (value: WorkspaceLevelFilter) => void
  onStatusFilterChange: (value: WorkspaceStatusFilter) => void
  onOwnerFilterChange: (value: WorkspaceOwnerFilter) => void
}) {
  return (
    <div data-testid="risk-workspace-unified-filter" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="风险工作台搜索"
            className="h-10 bg-white pl-9"
            placeholder="搜索标题、描述、任务"
            data-testid="risk-workspace-search"
          />
        </div>
        <Badge variant="secondary">当前 {total} 条</Badge>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <FilterChipGroup
          label="等级"
          options={[
            { value: 'all', label: '全部等级' },
            { value: 'urgent', label: '高/严重' },
            { value: 'normal', label: '中/低' },
          ]}
          value={levelFilter}
          onChange={(value) => onLevelFilterChange(value as WorkspaceLevelFilter)}
        />
        <FilterChipGroup
          label="状态"
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'active', label: '活跃' },
            { value: 'closed', label: '已关闭' },
            { value: 'pending', label: '待确认' },
          ]}
          value={statusFilter}
          onChange={(value) => onStatusFilterChange(value as WorkspaceStatusFilter)}
        />
        <FilterChipGroup
          label="责任人"
          options={[
            { value: 'all', label: '全部责任人' },
            { value: 'task', label: '任务相关' },
            { value: 'project', label: '项目级' },
          ]}
          value={ownerFilter}
          onChange={(value) => onOwnerFilterChange(value as WorkspaceOwnerFilter)}
        />
      </div>
    </div>
  )
}

function FilterChipGroup({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
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
        <Button variant="ghost" type="button" className="sr-only" data-testid="pending-manual-close-filter" onClick={onPendingFilterToggle}>pending manual close filter</Button>
        <Select value={sourceFilter} onValueChange={(value) => onSourceFilterChange(value as SourceFilterValue)}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="来源筛选" /></SelectTrigger><SelectContent><SelectItem value="all">全部来源</SelectItem><SelectItem value="manual">只看手动添加</SelectItem><SelectItem value="chain">只看链路记录</SelectItem></SelectContent></Select>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
        <GitBranch className="h-3.5 w-3.5" />
        {chainViewMode === 'task' ? '当前按任务聚合' : '当前按时间轴聚合'}
      </div>
      {action}
    </div>
  )
}
