import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningTreeView, type PlanningTreeRow } from '@/components/planning/PlanningTreeView'
import { BatchActionBar } from '@/components/planning/BatchActionBar'
import { ConfirmDialog } from '@/components/planning/ConfirmDialog'
import { KeyboardShortcuts, type PlanningShortcut } from '@/components/planning/KeyboardShortcuts'
import { UndoRedoProvider, useUndoRedo } from '@/components/planning/UndoRedoProvider'
import { ValidationPanel } from '@/components/planning/ValidationPanel'
import { useStore } from '@/hooks/useStore'
import { usePlanningKeyboard } from '@/hooks/usePlanningKeyboard'
import { usePlanningSelection } from '@/hooks/usePlanningSelection'
import {
  usePlanningConfirmDialog,
  usePlanningSelectedCount,
  usePlanningStore,
  type PlanningValidationIssue,
  type PlanningWorkspaceTab,
} from '@/hooks/usePlanningStore'
import { AlertTriangle, CheckCircle2, FileDiff, GitBranch, RotateCcw, RotateCw, Sparkles } from 'lucide-react'
import {
  MonthlyPlanConfirmDialog,
  type MonthlyPlanConfirmMode,
  type MonthlyPlanConfirmState,
  type MonthlyPlanConfirmSummary,
} from './components/MonthlyPlanConfirmDialog'
import { MonthlyPlanBottomBar } from './components/MonthlyPlanBottomBar'
import { MonthlyPlanDraftPanel } from './components/MonthlyPlanDraftPanel'
import { MonthlyPlanHeader } from './components/MonthlyPlanHeader'
import { PlanningGovernanceBanner } from './components/PlanningGovernanceBanner'
import { PlanningHealthPanel } from './components/PlanningHealthPanel'
import { PlanningIntegrityPanel } from './components/PlanningIntegrityPanel'
import { PlanningAnomalyPanel } from './components/PlanningAnomalyPanel'
import { CloseoutBatchBar } from './components/CloseoutBatchBar'
import {
  CloseoutConfirmDialog,
  type CloseoutConfirmMode,
  type CloseoutConfirmState,
  type CloseoutConfirmSummary,
} from './components/CloseoutConfirmDialog'
import { CloseoutDetailDrawer, type CloseoutReasonBranch } from './components/CloseoutDetailDrawer'
import { CloseoutGroupedList, type CloseoutGroup, type CloseoutItem } from './components/CloseoutGroupedList'
import { BaselineRevisionPoolDialog } from './components/BaselineRevisionPoolDialog'
import type { BaselineRevisionCandidate } from './components/BaselineRevisionCandidateList'

const TABS: Array<{ key: PlanningWorkspaceTab; label: string }> = [
  { key: 'baseline', label: '项目基线' },
  { key: 'monthly', label: '月度计划' },
]

const routeTabMap: Record<string, PlanningWorkspaceTab> = {
  baseline: 'baseline',
  monthly: 'monthly',
  'revision-pool': 'baseline',
}

function getWorkspaceMarker(pathname: string): string {
  const planningMarker = pathname.split('/planning/')[1]?.split('/')[0]
  if (planningMarker) return planningMarker
  const taskMarker = pathname.split('/tasks/')[1]?.split('/')[0]
  if (taskMarker) return taskMarker
  return 'baseline'
}

function getTabFromPath(pathname: string): PlanningWorkspaceTab {
  const marker = getWorkspaceMarker(pathname)
  return routeTabMap[marker] ?? 'baseline'
}

type PlanningSurface = PlanningWorkspaceTab | 'closeout'

function getPlanningSurface(pathname: string): PlanningSurface {
  const marker = getWorkspaceMarker(pathname)
  return marker === 'closeout' ? 'closeout' : routeTabMap[marker] ?? 'baseline'
}

const REVISION_CANDIDATES: BaselineRevisionCandidate[] = [
  {
    id: 'revision-candidate-1',
    source_type: 'manual',
    status: 'open',
    severity: 'medium',
    title: '主体结构施工窗口调整',
    reason: '建议将主体验收前的窗口前移，便于吸收近期变更。',
    summary: '建议将主体验收前的窗口前移，便于吸收近期变更。',
    source: '来自计划修订候选',
    tag: '窗口调整',
  },
  {
    id: 'revision-candidate-2',
    source_type: 'manual',
    status: 'open',
    severity: 'medium',
    title: '里程碑依赖重排',
    reason: '建议把关键里程碑依赖前置到同一修订篮中统一查看。',
    summary: '建议把关键里程碑依赖前置到同一修订篮中统一查看。',
    source: '来自基线对比',
    tag: '依赖重排',
  },
  {
    id: 'revision-candidate-3',
    source_type: 'manual',
    status: 'open',
    severity: 'low',
    title: '风险缓冲备注补录',
    reason: '补录暂缓处理原因。',
    summary: '补录暂缓处理原因。',
    source: '来自月度复盘',
    tag: '留痕补录',
  },
]

type BaselineRevisionDraftContext = {
  candidateId: string
  candidateTitle: string
  basketIds: string[]
  deferredIds: string[]
  deferredReason: string
  source: string
}

type PlanningGovernanceStatus = 'loading' | 'ready' | 'error'

type PlanningGovernanceAlert = {
  kind: 'health' | 'integrity' | 'anomaly'
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  source_id: string
}

type PlanningGovernanceSnapshot = {
  project_id: string
  health: {
    project_id: string
    score: number
    status: 'healthy' | 'warning' | 'critical'
    label: string
    breakdown: {
      data_integrity_score: number
      mapping_integrity_score: number
      system_consistency_score: number
      m1_m9_score: number
      passive_reorder_penalty: number
      total_score: number
    }
  }
  integrity: {
    project_id: string
    data_integrity: {
      total_tasks: number
      missing_participant_unit_count: number
      missing_scope_dimension_count: number
      missing_progress_snapshot_count: number
    }
    mapping_integrity: {
      baseline_pending_count: number
      baseline_merged_count: number
      monthly_carryover_count: number
    }
    system_consistency: {
      inconsistent_milestones: number
      stale_snapshot_count: number
    }
    milestone_integrity: {
      summary: {
        total: number
        aligned: number
        needs_attention: number
        missing_data: number
        blocked: number
      }
    }
  }
  anomaly: {
    project_id: string
    detected_at: string
    total_events: number
    windows: Array<{
      window_days: number
      event_count: number
      affected_task_count: number
      cumulative_event_count: number
      triggered: boolean
      average_offset_days?: number
      key_task_count?: number
    }>
  }
  alerts: PlanningGovernanceAlert[]
}

function buildGovernanceFallbackCloseoutItems(params: {
  alerts: PlanningGovernanceAlert[]
  issues: PlanningValidationIssue[]
  projectName?: string | null
}) {
  const dynamicSources = [
    ...params.alerts.map((alert) => ({
      title: alert.title,
      summary: alert.detail,
      severity: alert.severity,
    })),
    ...params.issues.map((issue) => ({
      title: issue.title,
      summary: issue.detail ?? '需要继续补录备注后再推进处理。',
      severity: issue.level === 'error' ? 'critical' : issue.level === 'warning' ? 'warning' : 'info',
    })),
  ]

  if (dynamicSources.length === 0) return []

  const templates: Array<{
    id: string
    groupId: CloseoutItem['groupId']
    systemSuggestion: string
    status: CloseoutItem['status']
    processed?: boolean
    suffix: string
  }> = [
    { id: 'closeout-1', groupId: 'closeout-normal', systemSuggestion: '正常可采纳', status: 'normal', processed: true, suffix: '首轮校核完成' },
    { id: 'closeout-2', groupId: 'closeout-normal', systemSuggestion: '正常可采纳', status: 'normal', processed: true, suffix: '建议直接关闭' },
    { id: 'closeout-3', groupId: 'closeout-manual', systemSuggestion: '补录原因', status: 'normal', suffix: '待补录关闭原因' },
    { id: 'closeout-4', groupId: 'closeout-risk', systemSuggestion: '并发处理', status: 'concurrency', suffix: '并发处理提醒' },
    { id: 'closeout-5', groupId: 'closeout-risk', systemSuggestion: '清单过期', status: 'stale', suffix: '需要重新校核' },
    { id: 'closeout-6', groupId: 'closeout-risk', systemSuggestion: '超期升级', status: 'overdue', suffix: '请优先处理' },
  ]

  return templates.map((template, index) => {
    const source = dynamicSources[index % dynamicSources.length]
    const prefix = params.projectName ? `${params.projectName} · ` : ''

    return {
      id: template.id,
      title: `${prefix}${source.title} · ${template.suffix}`,
      summary: source.summary,
      groupId: template.groupId,
      systemSuggestion: template.systemSuggestion,
      status: template.status,
      processed: template.processed,
    } satisfies CloseoutItem
  })
}

function buildGovernanceTreeRows(params: {
  projectName?: string | null
  selectedItemIds: string[]
  alerts: PlanningGovernanceAlert[]
  issues: PlanningValidationIssue[]
  healthLabel: string
}) {
  const seedItems = [
    ...params.alerts.map((alert) => ({
      title: alert.title,
      subtitle: alert.detail,
      critical: alert.severity === 'critical',
      milestone: alert.kind === 'anomaly',
      statusLabel:
        alert.severity === 'critical'
          ? '优先处理'
          : alert.severity === 'warning'
            ? '需要复核'
            : '建议确认',
    })),
    ...params.issues.map((issue) => ({
      title: issue.title,
      subtitle: issue.detail ?? '用于当前计划校核。',
      critical: issue.level === 'error',
      milestone: issue.level === 'info',
      statusLabel:
        issue.level === 'error'
          ? '阻断项'
          : issue.level === 'warning'
            ? '提示项'
            : '信息项',
    })),
  ]

  if (seedItems.length === 0) return []

  return [
    {
      id: 'baseline-root',
      title: `${params.projectName ?? '当前项目'} 当前计划骨架`,
      subtitle: `来源：治理快照 · ${params.healthLabel}`,
      depth: 1,
      rowType: 'structure' as const,
      statusLabel: '已同步',
      selected: params.selectedItemIds.includes('baseline-root'),
      extra: <Badge variant="outline">锚点</Badge>,
    },
    ...seedItems.slice(0, 2).map((item, index) => ({
      id: `baseline-${index + 1}`,
      title: item.title,
      subtitle: item.subtitle,
      depth: 2,
      rowType: (item.milestone ? 'milestone' : 'structure') as PlanningTreeRow['rowType'],
      isMilestone: item.milestone,
      isCritical: item.critical,
      statusLabel: item.statusLabel,
      selected: params.selectedItemIds.includes(`baseline-${index + 1}`),
      extra: <Badge variant={item.critical ? 'secondary' : 'outline'}>{item.milestone ? '关键节点' : '校核项'}</Badge>,
    })),
  ] satisfies PlanningTreeRow[]
}

function getFriendlyGovernanceErrorMessage(error: unknown): string {
  const rawMessage = getApiErrorMessage(error, '治理快照暂时不可用，请稍后重试。').trim()

  if (/change_logs/i.test(rawMessage)) {
    return '治理快照暂时缺少变更记录数据源，系统已按空集降级；可先继续使用计划编制，并在补齐变更记录表后重新校核。'
  }

  const firstLine = rawMessage.split('\n')[0]?.trim()
  if (!firstLine) return '治理快照暂时不可用，请稍后重试。'
  if (/executeSQL|server\\\\|internal\/process|at async/i.test(rawMessage)) {
    return '治理快照暂时不可用，请稍后重新校核；如果问题持续存在，请检查后端治理相关数据表是否已初始化。'
  }

  return firstLine
}

function PlanningWorkspaceInner() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo()

  const currentProject = useStore((state) => state.currentProject)
  const activeWorkspace = usePlanningStore((state) => state.activeWorkspace)
  const setActiveWorkspace = usePlanningStore((state) => state.setActiveWorkspace)
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const toggleSelectedItem = usePlanningStore((state) => state.toggleSelectedItem)
  const clearSelection = usePlanningStore((state) => state.clearSelection)
  const draftStatus = usePlanningStore((state) => state.draftStatus)
  const validationIssues = usePlanningStore((state) => state.validationIssues)
  const setValidationIssues = usePlanningStore((state) => state.setValidationIssues)
  const openConfirmDialog = usePlanningStore((state) => state.openConfirmDialog)
  const closeConfirmDialog = usePlanningStore((state) => state.closeConfirmDialog)
  const confirmDialog = usePlanningConfirmDialog()
  const selectedCount = usePlanningSelectedCount()
  const planningKeyboard = usePlanningKeyboard()
  const [monthlyConfirmOpen, setMonthlyConfirmOpen] = useState(false)
  const [monthlyConfirmMode, setMonthlyConfirmMode] = useState<MonthlyPlanConfirmMode>('standard')
  const [closeoutActiveItemId, setCloseoutActiveItemId] = useState<string>('closeout-1')
  const [closeoutBatchLayerOpen, setCloseoutBatchLayerOpen] = useState(false)
  const [closeoutConfirmOpen, setCloseoutConfirmOpen] = useState(false)
  const [closeoutConfirmMode, setCloseoutConfirmMode] = useState<CloseoutConfirmMode>('single')
  const closeoutConfirmState: CloseoutConfirmState =
    new URLSearchParams(location.search).get('closeout_confirm_state') === 'failed' ? 'failed' : 'ready'
  const [closeoutReasonBranch, setCloseoutReasonBranch] = useState<CloseoutReasonBranch>('system')
  const [closeoutReasonLeaf, setCloseoutReasonLeaf] = useState('采纳系统建议')
  const [closeoutProcessedIds, setCloseoutProcessedIds] = useState<string[]>([])
  const [revisionPoolOpen, setRevisionPoolOpen] = useState(false)
  const [revisionBasketIds, setRevisionBasketIds] = useState<string[]>([])
  const [revisionActiveCandidateId, setRevisionActiveCandidateId] = useState<string>(REVISION_CANDIDATES[0]?.id ?? '')
  const [revisionDeferredCandidateIds, setRevisionDeferredCandidateIds] = useState<string[]>([])
  const [revisionDeferredReason, setRevisionDeferredReason] = useState('')
  const [revisionDeferredReasonVisible, setRevisionDeferredReasonVisible] = useState(false)
  const [revisionDeferredReviewDueAt, setRevisionDeferredReviewDueAt] = useState('')
  const [governanceStatus, setGovernanceStatus] = useState<PlanningGovernanceStatus>('loading')
  const [governanceSnapshot, setGovernanceSnapshot] = useState<PlanningGovernanceSnapshot | null>(null)
  const [governanceErrorMessage, setGovernanceErrorMessage] = useState<string | null>(null)
  const [governanceSnoozed, setGovernanceSnoozed] = useState(false)
  const [governanceRecheckCount, setGovernanceRecheckCount] = useState(0)

  const activeTabFromPath = getTabFromPath(location.pathname)
  const planningSurface = getPlanningSurface(location.pathname)
  const isRevisionPoolSurface = getWorkspaceMarker(location.pathname) === 'revision-pool'

  useEffect(() => {
    setActiveWorkspace(planningSurface === 'closeout' ? 'monthly' : activeTabFromPath)
  }, [activeTabFromPath, planningSurface, setActiveWorkspace])

  useEffect(() => {
    setValidationIssues([
      {
        id: 'baseline-version',
        level: 'info',
        title: '基线版本已锁定到统一状态机契约',
        detail: '后续基线确认与修订动作将复用 15.0 产出的状态机与 API 约定。',
      },
      {
        id: 'monthly-lock',
        level: 'warning',
        title: '月度计划待完成确认前复核',
        detail: '请先核对条件、阻碍和延期摘要，再决定走快速确认还是标准确认路径。',
      },
    ])
  }, [setValidationIssues])

  useEffect(() => {
    const controller = new AbortController()

    const loadGovernance = async () => {
      if (!params.id) {
        setGovernanceSnapshot(null)
        setGovernanceStatus('error')
        setGovernanceErrorMessage('Missing project id.')
        return
      }

      setGovernanceStatus('loading')
      setGovernanceErrorMessage(null)

      try {
        const snapshot = await apiGet<PlanningGovernanceSnapshot>(
          `/api/planning-governance?projectId=${encodeURIComponent(params.id)}`,
          { signal: controller.signal },
        )

        setGovernanceSnapshot(snapshot)
        setGovernanceStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        setGovernanceSnapshot(null)
        setGovernanceStatus('error')
        setGovernanceErrorMessage(getFriendlyGovernanceErrorMessage(error))
      }
    }

    void loadGovernance()

    return () => {
      controller.abort()
    }
  }, [governanceRecheckCount, params.id])

  useEffect(() => {
    pushSnapshot({
      projectId: params.id,
      activeWorkspace,
      selectedItemIds,
    })
  }, [activeWorkspace, params.id, pushSnapshot, selectedItemIds])

  const monthlyConfirmState: MonthlyPlanConfirmState =
    new URLSearchParams(location.search).get('monthly_confirm_state') === 'failed' ? 'failed' : 'ready'
  const closeoutCompleted = new URLSearchParams(location.search).get('closeout_complete') === '1'
  const revisionDraftSearch = useMemo(() => new URLSearchParams(location.search), [location.search])
  const revisionDraftCandidateId = revisionDraftSearch.get('revision_candidate')
  const revisionDraftBasketIds = revisionDraftSearch
    .get('revision_basket')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    ?? []
  const revisionDraftDeferredIds = revisionDraftSearch
    .get('revision_deferred_ids')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    ?? []
  const monthlyQuickConfirmAvailable =
    selectedCount > 0 && draftStatus !== 'locked' && !validationIssues.some((issue) => issue.level === 'error')
  const monthlyConditionIssueCount = validationIssues.filter((issue) => issue.id.includes('condition')).length
  const monthlyObstacleIssueCount = validationIssues.filter((issue) => issue.id.includes('obstacle')).length
  const monthlyDelayIssueCount = validationIssues.filter((issue) => issue.id.includes('delay')).length
  const monthlyMappingIssueCount = validationIssues.filter((issue) => issue.id.includes('mapping')).length
  const monthlyRequiredFieldIssueCount = validationIssues.filter((issue) => {
    const text = `${issue.id} ${issue.title} ${issue.detail ?? ''}`.toLocaleLowerCase('zh-CN')
    return text.includes('required') || text.includes('必填')
  }).length
  const monthlyConfirmSummary = {
    totalItemCount: selectedCount,
    newlyAddedCount: validationIssues.filter((issue) => issue.level === 'info').length,
    autoRolledInCount: 0,
    pendingRemovalCount: validationIssues.filter((issue) => issue.level === 'error').length,
    milestoneCount: 0,
    dateAdjustmentCount: validationIssues.filter((issue) => issue.level === 'warning').length,
    progressAdjustmentCount: 0,
    blockingIssueCount: validationIssues.filter((issue) => issue.level === 'error').length,
    conditionIssueCount: monthlyConditionIssueCount,
    obstacleIssueCount: monthlyObstacleIssueCount,
    delayIssueCount: monthlyDelayIssueCount,
    mappingIssueCount: monthlyMappingIssueCount,
    requiredFieldIssueCount: monthlyRequiredFieldIssueCount,
  } satisfies MonthlyPlanConfirmSummary
  const governanceHealthReport = governanceSnapshot?.health ?? null
  const governanceIntegrityReport = governanceSnapshot?.integrity ?? null
  const governanceAnomalyReport = governanceSnapshot?.anomaly ?? null
  const governanceAlerts = useMemo(() => governanceSnapshot?.alerts ?? [], [governanceSnapshot?.alerts])
  const governanceHealthScore = governanceHealthReport?.score ?? 0
  const governanceHealthLabel = governanceHealthReport?.label ?? (governanceStatus === 'error' ? '暂不可用' : '同步中')
  const governanceAnomalies = governanceAnomalyReport?.windows
    .filter((window) => window.triggered)
    .map((window) => ({
      id: `${governanceAnomalyReport.project_id}:${window.window_days}`,
      title: `${window.window_days} 日被动重排窗口`,
      detail: `${window.event_count} 次变更 · ${window.key_task_count ?? 0} 个关键任务 · 平均偏移 ${window.average_offset_days ?? 0} 天`,
    })) ?? []
  const governanceIntegritySummary = governanceIntegrityReport
    ? {
        dataIssues: governanceIntegrityReport.data_integrity.missing_participant_unit_count +
          governanceIntegrityReport.data_integrity.missing_scope_dimension_count +
          governanceIntegrityReport.data_integrity.missing_progress_snapshot_count,
        mappingIssues:
          governanceIntegrityReport.mapping_integrity.baseline_pending_count +
          governanceIntegrityReport.mapping_integrity.baseline_merged_count +
          governanceIntegrityReport.mapping_integrity.monthly_carryover_count,
        systemIssues:
          governanceIntegrityReport.system_consistency.inconsistent_milestones +
          governanceIntegrityReport.system_consistency.stale_snapshot_count,
        milestoneIssues:
          governanceIntegrityReport.milestone_integrity.summary.blocked +
          governanceIntegrityReport.milestone_integrity.summary.missing_data +
          governanceIntegrityReport.milestone_integrity.summary.needs_attention,
      }
    : {
        dataIssues: 0,
        mappingIssues: 0,
        systemIssues: 0,
        milestoneIssues: 0,
      }
  const governanceHealthBreakdown = governanceHealthReport
    ? [
        { label: '数据完整性', value: `${governanceHealthReport.breakdown.data_integrity_score} 分` },
        { label: '映射完整性', value: `${governanceHealthReport.breakdown.mapping_integrity_score} 分` },
        { label: '系统一致性', value: `${governanceHealthReport.breakdown.system_consistency_score} 分` },
        { label: 'M1-M9', value: `${governanceHealthReport.breakdown.m1_m9_score} 分` },
        { label: '被动重排惩罚', value: `${governanceHealthReport.breakdown.passive_reorder_penalty} 分` },
      ]
    : []
  const revisionCandidates = useMemo<BaselineRevisionCandidate[]>(
    () =>
      governanceAlerts.length > 0
        ? governanceAlerts.slice(0, 4).map((alert, index) => ({
            id: `revision-${alert.kind}-${alert.source_id}-${index}`,
            source_type: alert.kind === 'health' ? 'observation' : 'deviation',
            status: 'open' as const,
            severity:
              alert.severity === 'critical'
                ? 'critical'
                : alert.severity === 'warning'
                  ? 'medium'
                  : 'low',
            title: alert.title,
            reason: alert.detail,
            summary: alert.detail,
            source:
              alert.kind === 'health'
                ? '来自健康扫描'
                : alert.kind === 'integrity'
                  ? '来自完整性校核'
                  : '来自异常扫描',
            tag:
              alert.severity === 'critical'
                ? '优先处理'
                : alert.severity === 'warning'
                  ? '需要复核'
                  : '建议确认',
          }))
        : REVISION_CANDIDATES,
    [governanceAlerts]
  )
  const closeoutItems = useMemo<CloseoutItem[]>(
    () =>
      buildGovernanceFallbackCloseoutItems({
        alerts: governanceAlerts,
        issues: validationIssues as PlanningValidationIssue[],
        projectName: currentProject?.name,
      }),
    [currentProject?.name, governanceAlerts, validationIssues]
  )
  const closeoutGroups = useMemo<CloseoutGroup[]>(
    () =>
      [
        {
          id: 'closeout-normal',
          title: '系统建议可直接采纳',
          description: '',
          badge: '一键采纳',
          items: closeoutItems.filter((item) => item.groupId === 'closeout-normal'),
        },
        {
          id: 'closeout-manual',
          title: '需要关闭原因补录',
          description: '',
          badge: '补录原因',
          items: closeoutItems.filter((item) => item.groupId === 'closeout-manual'),
        },
        {
          id: 'closeout-risk',
          title: '并发 / 过期 / 超期',
          description: '',
          badge: '优先处理',
          items: closeoutItems.filter((item) => item.groupId === 'closeout-risk'),
        },
      ].filter((group) => group.items.length > 0),
    [closeoutItems]
  )
  const handleGovernanceOpenDetail = () => {
    navigate(`/projects/${params.id}/planning/deviation`)
  }
  const handleGovernanceRecheck = () => {
    setGovernanceSnoozed(false)
    setGovernanceRecheckCount((current) => current + 1)
  }
  const handleGovernanceSnooze = () => {
    setGovernanceSnoozed(true)
  }

  useEffect(() => {
    if (!closeoutItems.length) return
    if (!closeoutItems.some((item) => item.id === closeoutActiveItemId)) {
      setCloseoutActiveItemId(closeoutItems[0].id)
    }
  }, [closeoutActiveItemId, closeoutItems])

  useEffect(() => {
    if (!revisionCandidates.length) return
    if (!revisionCandidates.some((candidate) => candidate.id === revisionActiveCandidateId)) {
      setRevisionActiveCandidateId(revisionCandidates[0].id)
    }
  }, [revisionActiveCandidateId, revisionCandidates])

  useEffect(() => {
    setCloseoutProcessedIds((current) =>
      Array.from(
        new Set([
          ...current.filter((id) => closeoutItems.some((item) => item.id === id)),
          ...closeoutItems.filter((item) => item.processed).map((item) => item.id),
        ])
      )
    )
  }, [closeoutItems])

  const revisionDraftCandidate =
    revisionCandidates.find((candidate) => candidate.id === revisionDraftCandidateId) ?? null
  const revisionDraftContext: BaselineRevisionDraftContext | null = revisionDraftCandidate
    ? {
        candidateId: revisionDraftCandidate.id,
        candidateTitle: revisionDraftCandidate.title,
        basketIds: revisionDraftBasketIds,
        deferredIds: revisionDraftDeferredIds,
        deferredReason: revisionDraftSearch.get('revision_deferred_reason') ?? '',
        source: revisionDraftSearch.get('revision_source') ?? 'pool',
      }
    : null

  const rows = useMemo<PlanningTreeRow[]>(
    () =>
      buildGovernanceTreeRows({
        projectName: currentProject?.name,
        selectedItemIds,
        alerts: governanceAlerts,
        issues: validationIssues as PlanningValidationIssue[],
        healthLabel: governanceHealthLabel,
      }),
    [currentProject?.name, governanceAlerts, governanceHealthLabel, selectedItemIds, validationIssues]
  )
  const baselineSelection = usePlanningSelection({
    selectedIds: selectedItemIds,
    setSelectedIds: setSelectedItemIds,
    allIds: rows.map((row) => row.id),
  })

  const shortcuts: PlanningShortcut[] = [
    {
      key: '1',
      ctrlKey: true,
      description: '切换到项目基线',
      action: () => navigate(`/projects/${params.id}/planning/baseline`),
    },
    {
      key: '2',
      ctrlKey: true,
      description: '切换到月度计划',
      action: () => navigate(`/projects/${params.id}/planning/monthly`),
    },
    {
      key: '3',
      ctrlKey: true,
      description: '切换到项目基线',
      action: () => navigate(`/projects/${params.id}/planning/baseline`),
    },
    {
      key: 'z',
      ctrlKey: true,
      description: '撤销上一步',
      action: () => undo(),
    },
    {
      key: 'y',
      ctrlKey: true,
      description: '重做上一步',
      action: () => redo(),
    },
    {
      key: '?',
      shiftKey: true,
      description: '显示快捷键',
      action: () => planningKeyboard.setOpen(true),
    },
  ]

  const tabsWithHandlers = TABS.map((item) => ({
    ...item,
    active: item.key === activeWorkspace,
    onClick: () => navigate(`/projects/${params.id}/planning/${item.key}`),
  }))

  const openMonthlyConfirm = (mode: MonthlyPlanConfirmMode) => {
    setMonthlyConfirmMode(mode)
    setMonthlyConfirmOpen(true)
  }

  const handleQuickMonthlyConfirmEntry = () => {
    if (monthlyQuickConfirmAvailable) {
      openMonthlyConfirm('quick')
      return
    }

    openMonthlyConfirm('standard')
  }

  const handleStandardMonthlyConfirmEntry = () => {
    openMonthlyConfirm('standard')
  }

  const handleMonthlyConfirm = () => {
    setMonthlyConfirmOpen(false)
  }

  const handleMonthlyRetry = () => {
    setMonthlyConfirmOpen(false)
  }

  const revisionActiveCandidate =
    revisionCandidates.find((candidate) => candidate.id === revisionActiveCandidateId) ?? revisionCandidates[0] ?? null
  const revisionBasketItems = revisionCandidates.filter((candidate) => revisionBasketIds.includes(candidate.id))

  const handleRevisionAddToBasket = () => {
    if (!revisionActiveCandidate) {
      return
    }

    setRevisionBasketIds((current) =>
      current.includes(revisionActiveCandidate.id) ? current : [...current, revisionActiveCandidate.id]
    )
  }

  const handleRevisionMarkDeferred = () => {
    if (!revisionActiveCandidate) {
      return
    }

    setRevisionDeferredReasonVisible(true)
    setRevisionDeferredReason((current) => current || '等待上游确认')
    setRevisionDeferredReviewDueAt((current) => current || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    setRevisionDeferredCandidateIds((current) =>
      current.includes(revisionActiveCandidate.id) ? current : [...current, revisionActiveCandidate.id]
    )
  }

  const handleRevisionEnterDraft = () => {
    if (!revisionActiveCandidate) {
      return
    }

    const search = new URLSearchParams()
    search.set('revision_candidate', revisionActiveCandidate.id)
    search.set('revision_candidate_title', revisionActiveCandidate.title)
    search.set('revision_source', 'pool')
    search.set('revision_basket', revisionBasketItems.map((item) => item.id).join(','))
    search.set('revision_deferred_ids', revisionDeferredCandidateIds.join(','))
    if (revisionDeferredReason.trim()) {
      search.set('revision_deferred_reason', revisionDeferredReason.trim())
    }

    navigate(`/projects/${params.id}/planning/revision-pool?${search.toString()}`)
    setRevisionPoolOpen(false)
  }

  const closeoutActiveItem = closeoutItems.find((item) => item.id === closeoutActiveItemId) ?? closeoutItems[0]
  const closeoutSelectedItems = closeoutItems.filter((item) => selectedItemIds.includes(item.id))
  const closeoutProcessedCount = closeoutItems.filter(
    (item) => closeoutProcessedIds.includes(item.id) || item.processed
  ).length
  const closeoutRemainingCount = closeoutItems.length - closeoutProcessedCount
  const closeoutSummary = {
    rolledInCount: closeoutItems.filter((item) => item.groupId === 'closeout-normal').length,
    closedCount: closeoutProcessedCount,
    manualOverrideCount: closeoutItems.filter((item) => item.groupId === 'closeout-manual').length,
    forcedCount: closeoutItems.filter((item) => item.groupId === 'closeout-risk').length,
    remainingCount: closeoutRemainingCount,
  } satisfies CloseoutConfirmSummary
  const closeoutCloseDay = Number(new URLSearchParams(location.search).get('closeout_day') ?? '7')
  const closeoutForceUnlocked = Number.isNaN(closeoutCloseDay) ? true : closeoutCloseDay >= 7
  const closeoutDrawerOpen = Boolean(closeoutActiveItem || closeoutBatchLayerOpen)

  const openCloseoutConfirm = (mode: CloseoutConfirmMode) => {
    setCloseoutConfirmMode(mode)
    setCloseoutConfirmOpen(true)
  }

  const markCloseoutProcessed = (idsToMark: string[]) => {
    setCloseoutProcessedIds((current) => Array.from(new Set([...current, ...idsToMark])))
  }

  const handleCloseoutProcessCurrentItem = () => {
    markCloseoutProcessed([closeoutActiveItem.id])
  }

  const handleCloseoutProcessSelectedItems = () => {
    const idsToMark = closeoutSelectedItems.length ? closeoutSelectedItems.map((item) => item.id) : [closeoutActiveItem.id]
    markCloseoutProcessed(idsToMark)
    setSelectedItemIds([])
    setCloseoutBatchLayerOpen(false)
  }

  const handleCloseoutConfirm = () => {
    if (closeoutRemainingCount > 0) {
      return
    }

    setCloseoutConfirmOpen(false)
    setCloseoutBatchLayerOpen(false)
    setSelectedItemIds([])
    navigate(`/projects/${params.id}/planning/monthly?closeout_complete=1`)
  }

  const handleCloseoutRetry = () => {
    setCloseoutConfirmOpen(false)
  }

  const baselineShellActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
      >
        <Sparkles className="h-4 w-4" />
        工作台总览
      </Button>
      <Button
        type="button"
        variant="default"
        size="sm"
        className="gap-2"
        onClick={() =>
          openConfirmDialog('baseline', {
            title: '确认项目基线',
            description: '确认后将冻结当前基线版本，并切换到只读查看态。',
          })
        }
      >
        <CheckCircle2 className="h-4 w-4" />
        确认
      </Button>
    </>
  )

  const monthlyShellActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
        onClick={() => planningKeyboard.setOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        草稿引导
      </Button>
      <Button type="button" variant="default" size="sm" className="gap-2" onClick={handleStandardMonthlyConfirmEntry}>
        <CheckCircle2 className="h-4 w-4" />
        标准确认入口
      </Button>
    </>
  )

  const revisionPoolShellActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
        onClick={() => setRevisionPoolOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        打开计划修订候选
      </Button>
      <Button type="button" variant="default" size="sm" className="gap-2" onClick={() => setRevisionPoolOpen(true)}>
        <CheckCircle2 className="h-4 w-4" />
        查看候选
      </Button>
    </>
  )

  const closeoutShellActions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-slate-600 bg-transparent text-white hover:bg-white/10"
        onClick={() => setCloseoutBatchLayerOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        批量补录
      </Button>
      {closeoutForceUnlocked ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => openCloseoutConfirm('force')}
          data-testid="closeout-force-close-entry"
        >
          <AlertTriangle className="h-4 w-4" />
          强制发起关账
        </Button>
      ) : null}
    </>
  )

  const baselineWorkspaceContent = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
      <div className="space-y-4">
        <Card className="border-slate-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900">共享交互状态</div>
              <div className="text-sm text-slate-500">
                当前视图：{activeWorkspace} · 草稿态：{draftStatus} · 已选 {selectedCount} 项
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={baselineSelection.clearSelection}>
                清空选择
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setValidationIssues([])}>
                清空校核
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => closeConfirmDialog()}>
                关闭确认窗
              </Button>
            </div>
          </CardContent>
        </Card>

        <PlanningTreeView
          title="计划树"
          description=""
          rows={rows}
          selectedCount={selectedCount}
          onToggleRow={toggleSelectedItem}
          onToggleAll={baselineSelection.toggleAll}
        />

        <BatchActionBar
          selectedCount={selectedCount}
          onClear={clearSelection}
          unsaved={draftStatus !== 'idle'}
          actions={[
            {
              label: '生成修订候选',
              onClick: () =>
                openConfirmDialog('revision', {
                  title: '生成修订候选',
                  description: '',
                }),
              icon: RotateCcw,
              variant: 'secondary',
            },
            {
              label: '应用确认',
              onClick: () =>
                openConfirmDialog('monthly', {
                  title: '确认月度计划',
                  description: '',
                }),
              icon: CheckCircle2,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <ValidationPanel title="异常校核区" issues={validationIssues as PlanningValidationIssue[]} />

        <Card className="border-slate-200">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-900">共享协作底座</div>
                <div className="text-sm text-slate-500">Undo / Redo 与快捷键已在工作台内联接。</div>
              </div>
              <Badge variant="outline">L1-L5</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => undo()} disabled={!canUndo}>
                <RotateCcw className="mr-2 h-4 w-4" />
                撤销
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => redo()} disabled={!canRedo}>
                <RotateCw className="mr-2 h-4 w-4" />
                重做
              </Button>
            </div>
            <KeyboardShortcuts
              shortcuts={shortcuts}
              enabled
              label="快捷键面板"
              open={planningKeyboard.open}
              onOpenChange={planningKeyboard.setOpen}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const monthlyWorkspaceContent = (
    <div className="space-y-4 pb-24">
      {closeoutCompleted ? (
        <Card data-testid="closeout-complete-banner" className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-emerald-900">已完成本月关账，已切换到下月草稿</div>
              <div className="text-sm text-emerald-700">当前工作台已保留关账留痕，可继续处理下月计划草稿。</div>
            </div>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
              下月草稿入口
            </Badge>
          </CardContent>
        </Card>
      ) : null}
      <KeyboardShortcuts
        shortcuts={shortcuts}
        enabled
        label="快捷键"
        open={planningKeyboard.open}
        onOpenChange={planningKeyboard.setOpen}
      />
      <MonthlyPlanHeader draftStatus={draftStatus} selectedCount={selectedCount} />
      <MonthlyPlanDraftPanel
        draftStatus={draftStatus}
        selectedCount={selectedCount}
        validationIssues={validationIssues}
        canQuickConfirm={monthlyQuickConfirmAvailable}
      />
      <MonthlyPlanBottomBar
        draftStatus={draftStatus}
        quickAvailable={monthlyQuickConfirmAvailable}
        canSaveDraft={false}
        canStandardConfirm={draftStatus !== 'locked'}
        onSaveDraft={() => void 0}
        onQuickConfirmEntry={handleQuickMonthlyConfirmEntry}
        onStandardConfirmEntry={handleStandardMonthlyConfirmEntry}
      />
      <MonthlyPlanConfirmDialog
        open={monthlyConfirmOpen}
        onOpenChange={setMonthlyConfirmOpen}
        mode={monthlyConfirmMode}
        state={monthlyConfirmState}
        summary={monthlyConfirmSummary}
        onConfirm={handleMonthlyConfirm}
        onRetry={handleMonthlyRetry}
      />
    </div>
  )

  const revisionPoolWorkspaceContent = (
    <div className="space-y-4 pb-24" data-testid="planning-revision-workspace">
      <Card className="border-slate-200">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-900">基线计划修订候选</div>
            <div className="text-sm text-slate-500">
            </div>
          </div>
          <Button
            type="button"
            className="gap-2"
            onClick={() => setRevisionPoolOpen(true)}
            data-testid="baseline-revision-source-entry"
          >
            <Sparkles className="h-4 w-4" />
            打开观察池
          </Button>
        </CardContent>
      </Card>

      {revisionDraftContext ? (
        <Card data-testid="baseline-revision-deeplink-context" className="border-cyan-200 bg-cyan-50/60">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">修订草稿上下文</div>
              </div>
              <Badge variant="secondary">深链预置</Badge>
            </div>
            <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">候选</div>
                <div className="mt-1 font-medium text-slate-900">{revisionDraftContext.candidateTitle}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">来源</div>
                <div className="mt-1 font-medium text-slate-900">{revisionDraftContext.source}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">修订篮</div>
                <div className="mt-1 font-medium text-slate-900">
                  {revisionDraftContext.basketIds.length ? revisionDraftContext.basketIds.join('、') : '无'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">暂不处理</div>
                <div className="mt-1 font-medium text-slate-900">
                  {revisionDraftContext.deferredIds.length ? revisionDraftContext.deferredIds.join('、') : '无'}
                </div>
              </div>
            </div>
            {revisionDraftContext.deferredReason ? (
              <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-sm text-slate-600">
                暂不处理原因：{revisionDraftContext.deferredReason}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <BaselineRevisionPoolDialog
        open={revisionPoolOpen}
        sourceEntryLabel="计划修订候选入口"
        candidates={revisionCandidates}
        basketItems={revisionBasketItems}
        activeCandidateId={revisionActiveCandidate?.id ?? null}
        deferredCandidateIds={revisionDeferredCandidateIds}
        deferredReason={revisionDeferredReason}
        deferredReasonVisible={revisionDeferredReasonVisible}
        deferredReviewDueAt={revisionDeferredReviewDueAt}
        canEnterDraft={revisionBasketItems.length > 0 || Boolean(revisionDeferredReason.trim())}
        onOpenChange={setRevisionPoolOpen}
        onSelectCandidate={setRevisionActiveCandidateId}
        onAddToBasket={handleRevisionAddToBasket}
        onMarkDeferred={handleRevisionMarkDeferred}
        onDeferredReasonChange={setRevisionDeferredReason}
        onDeferredReviewDueAtChange={setRevisionDeferredReviewDueAt}
        onEnterDraft={handleRevisionEnterDraft}
        onRemoveFromBasket={(candidateId) => {
          setRevisionBasketIds((current) => current.filter((id) => id !== candidateId))
        }}
      />
    </div>
  )

  const governanceWorkspaceContent = (
    <div className="space-y-4" data-testid="planning-governance-workspace">
      <PlanningGovernanceBanner
        status={governanceStatus}
        score={governanceHealthScore}
        label={governanceHealthLabel}
        summary={
          governanceStatus === 'loading'
            ? '正在从后端加载健康、完整性与异常真值。'
            : governanceStatus === 'error'
              ? governanceErrorMessage || '治理快照暂时不可用，请稍后重试。'
              : governanceSnoozed
                ? '已切换到稍后处理状态，面板仍保留入口以便重新校核。'
                : governanceAlerts.length > 0
                  ? `${governanceAlerts.length} 条治理告警已由后端扫描返回。`
                  : '健康、完整性与系统异常均来自后端治理扫描结果。'
        }
        muted={governanceSnoozed}
        errorMessage={governanceErrorMessage}
        onOpenDetail={handleGovernanceOpenDetail}
        onRecheck={handleGovernanceRecheck}
        onSnooze={handleGovernanceSnooze}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <PlanningHealthPanel
          status={governanceStatus}
          score={governanceHealthScore}
          label={governanceHealthLabel}
          summary="按后端治理扫描结果汇总健康评分。"
          breakdown={governanceHealthBreakdown}
          errorMessage={governanceErrorMessage}
          onOpenDetail={handleGovernanceOpenDetail}
          onGoProcess={handleGovernanceOpenDetail}
        />
        <PlanningIntegrityPanel
          status={governanceStatus}
          summary={governanceIntegritySummary}
          detail=""
          errorMessage={governanceErrorMessage}
          onOpenDetail={handleGovernanceOpenDetail}
          onGoProcess={handleGovernanceOpenDetail}
        />
        <PlanningAnomalyPanel
          status={governanceStatus}
          anomalies={governanceAnomalies}
          errorMessage={governanceErrorMessage}
          onOpenDetail={handleGovernanceOpenDetail}
          onGoProcess={handleGovernanceOpenDetail}
        />
      </div>

      <Card data-testid="planning-governance-quick-links" className="border-slate-200">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-900">异常与留痕快链</div>
            </div>
            <Badge variant="outline">Planning shared links</Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Button
              type="button"
              variant="outline"
              className="justify-between"
              data-testid="planning-quick-link-gantt"
              onClick={() => navigate(`/projects/${params.id}/gantt`)}
            >
              <span className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                查看任务链
              </span>
              <Badge variant="outline">Gantt</Badge>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-between"
              data-testid="planning-quick-link-risks"
              onClick={() => navigate(`/projects/${params.id}/risks`)}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                查看风险与问题
              </span>
              <Badge variant="outline">Risk</Badge>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-between"
              data-testid="planning-quick-link-change-log"
              onClick={() => navigate(`/projects/${params.id}/reports?view=change_log`)}
            >
              <span className="flex items-center gap-2">
                <FileDiff className="h-4 w-4" />
                查看变更记录
              </span>
              <Badge variant="outline">Reports</Badge>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-between"
              data-testid="planning-quick-link-closeout"
              onClick={() => navigate(`/projects/${params.id}/tasks/closeout`)}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                打开月末关账
              </span>
              <Badge variant="outline">Closeout</Badge>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const closeoutWorkspaceContent = (
    <div className="space-y-4 pb-24">
      <Card className="overflow-hidden border-slate-200">
        <CardContent className="space-y-4 p-4">
          <div
            data-testid="closeout-header"
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">月末关账工作台</Badge>
                <Badge variant="secondary">系统建议优先</Badge>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-slate-900">月末待处理事项</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge data-testid="closeout-progress" variant="default" className="px-4 py-2 text-sm">
                {closeoutProcessedCount}/{closeoutItems.length} 已处理
              </Badge>
              <Badge variant="outline">当前月份：2026-04</Badge>
              <Badge variant="outline">来源月份：2026-03</Badge>
              <Badge variant="outline">阻断原因：{closeoutSelectedItems.length ? '待逐条确认' : '无未处理选择'}</Badge>
              <Badge variant="outline">执行重排：已收口</Badge>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">系统建议采纳率</div>
              <div className="text-sm font-medium text-slate-900">{closeoutItems.length ? `${closeoutProcessedCount}/${closeoutItems.length}` : '暂无'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">人工工作量预期</div>
              <div className="text-sm font-medium text-slate-900">{closeoutSelectedItems.length} 项</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">处理节奏</div>
              <div className="text-sm font-medium text-slate-900">{closeoutProcessedCount} 已处理</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <KeyboardShortcuts
        shortcuts={shortcuts}
        enabled
        label="快捷键"
        open={planningKeyboard.open}
        onOpenChange={planningKeyboard.setOpen}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <div className="space-y-4">
          <CloseoutGroupedList
            groups={closeoutGroups}
            selectedItemIds={selectedItemIds}
            processedItemIds={closeoutProcessedIds}
            activeItemId={closeoutActiveItemId}
            onToggleItem={(id) =>
              setSelectedItemIds(
                selectedItemIds.includes(id)
                  ? selectedItemIds.filter((itemId) => itemId !== id)
                  : [...selectedItemIds, id]
              )
            }
            onOpenItem={(id) => {
              setCloseoutActiveItemId(id)
              setCloseoutBatchLayerOpen(false)
            }}
          />
        </div>

        <CloseoutDetailDrawer
          open={closeoutDrawerOpen}
          item={closeoutActiveItem}
          selectedItems={closeoutSelectedItems}
          batchLayerOpen={closeoutBatchLayerOpen}
          forceCloseUnlocked={closeoutForceUnlocked}
          reasonBranch={closeoutReasonBranch}
          reasonLeaf={closeoutReasonLeaf}
        onClose={() => {
          setCloseoutBatchLayerOpen(false)
        }}
        onToggleBatchLayer={setCloseoutBatchLayerOpen}
        onSelectReasonBranch={setCloseoutReasonBranch}
        onSelectReasonLeaf={setCloseoutReasonLeaf}
        onProcessCurrentItem={handleCloseoutProcessCurrentItem}
        onProcessSelectedItems={handleCloseoutProcessSelectedItems}
      />
      </div>

      <CloseoutBatchBar
        selectedCount={selectedItemIds.length}
        drawerOpen={closeoutDrawerOpen}
        onOpenBatchLayer={() => setCloseoutBatchLayerOpen(true)}
        onClearSelection={() => setSelectedItemIds([])}
      />

      <CloseoutConfirmDialog
        open={closeoutConfirmOpen}
        onOpenChange={setCloseoutConfirmOpen}
        mode={closeoutConfirmMode}
        state={closeoutConfirmState}
        summary={closeoutSummary}
        onConfirm={handleCloseoutConfirm}
        onRetry={handleCloseoutRetry}
      />
    </div>
  )

  if (!params.id) {
    return null
  }

  return (
    <PlanningPageShell
      projectName={currentProject?.name ?? `项目 ${params.id}`}
      title="计划编制"
      description=""
      tabs={tabsWithHandlers}
      actions={
        planningSurface === 'closeout'
          ? closeoutShellActions
          : activeWorkspace === 'monthly'
            ? monthlyShellActions
            : baselineShellActions
      }
    >
      <div className="space-y-4">
        {governanceWorkspaceContent}
        {planningSurface === 'closeout'
          ? closeoutWorkspaceContent
          : isRevisionPoolSurface
            ? revisionPoolWorkspaceContent
          : activeWorkspace === 'monthly'
            ? monthlyWorkspaceContent
            : baselineWorkspaceContent}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel="继续"
        danger={confirmDialog.target === 'month_close'}
        onConfirm={() => closeConfirmDialog()}
        onOpenChange={(open) => {
          if (!open) closeConfirmDialog()
        }}
      />
    </PlanningPageShell>
  )
}

export default function PlanningWorkspace() {
  return (
    <UndoRedoProvider>
      <PlanningWorkspaceInner />
    </UndoRedoProvider>
  )
}
