import { apiGet, isAbortError } from '@/lib/apiClient'
import type { MilestoneOverview } from '@/lib/milestoneOverview'
import {
  buildCriticalPathSummaryModel,
  fetchCriticalPathSnapshot,
  type CriticalPathSummaryModel,
} from '@/lib/criticalPath'
export type { CriticalPathSummaryModel } from '@/lib/criticalPath'

export interface ProjectKpiComparisonMetric {
  current: number
  previous: number | null
  delta: number | null
  periodLabel: '较上周' | '较上月'
  status: 'ready' | 'insufficient_history'
  sparkline?: number[]
}

export interface ProjectKpiComparisons {
  weekly: {
    progress: ProjectKpiComparisonMetric
    deviation: ProjectKpiComparisonMetric
    risks: ProjectKpiComparisonMetric
    todos: ProjectKpiComparisonMetric
  }
}

export type ProductivitySampleMaturity = 'none' | 'low' | 'medium' | 'high'

export interface MonthlyProductivityRepresentativeness {
  sampleCount: number
  maturity: ProductivitySampleMaturity
  buildingGroupCount: number
  specialtyGroupCount: number
  criticalPathSampleCount: number
}

export interface MonthlyProductivityDistribution {
  monthlyAverageP: number | null
  monthlyMaxP: number | null
  monthlyMinP: number | null
  monthlyP90: number | null
  accelerationCaseRatio: number | null
  monthlyProductivityCaseCount: number
  sampleMaturity: ProductivitySampleMaturity
  representativeness: MonthlyProductivityRepresentativeness
}

export interface KeyNodeSummary {
  total: number
  milestoneCount: number
  criticalPathCount: number
  monthlyControlCount: number
  baselineControlCount: number
  dueSoonCount: number
  shiftedCount: number
  blockedCount: number
  highRiskCount: number
}

export interface ProjectSummary {
  id: string
  name: string
  status: string
  statusLabel: string
  plannedStartDate?: string | null
  plannedEndDate: string | null
  daysUntilPlannedEnd: number | null
  totalTasks: number
  leafTaskCount: number
  planPhaseCount?: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  overdueTaskCount?: number
  laggedTaskCount?: number
  delayDays: number
  delayCount: number
  overallProgress: number | null
  plannedProgress?: number | null
  progressDeviation?: number | null
  progressGap?: number | null
  summaryAsOf?: string | null
  taskProgress: number
  totalMilestones: number
  completedMilestones: number
  milestoneProgress: number
  riskCount: number
  activeRiskCount: number
  activeIssueCount: number
  pendingConditionCount: number
  pendingConditionTaskCount: number
  activeObstacleCount: number
  activeObstacleTaskCount: number
  todayTodoCount?: number
  projectTodayActionCount?: number
  preMilestoneCount: number
  completedPreMilestoneCount: number
  activePreMilestoneCount: number
  overduePreMilestoneCount: number
  acceptancePlanCount: number
  passedAcceptancePlanCount: number
  inProgressAcceptancePlanCount: number
  failedAcceptancePlanCount: number
  constructionDrawingCount: number
  issuedConstructionDrawingCount: number
  reviewingConstructionDrawingCount: number
  attentionRequired?: boolean
  scheduleVarianceDays?: number
  activeDelayedTasks?: number
  activeObstacles?: number
  monthlyCloseStatus?: '未开始' | '进行中' | '已完成' | '已超期'
  closeoutOverdueDays?: number
  unreadWarningCount?: number
  highestWarningLevel?: 'info' | 'warning' | 'critical' | null
  highestWarningSummary?: string | null
  shiftedMilestoneCount?: number
  criticalPathAffectedTasks?: number
  baselineDeviationRate?: number | null
  monthlyPlanFulfillmentRate?: number | null
  monthlyProductivityDistribution?: MonthlyProductivityDistribution
  planningAlignmentStatus?: 'aligned' | 'needs_realign' | 'temporary_without_baseline'
  temporaryWithoutBaselineCount?: number
  planningPendingRealignCount?: number
  businessHealthScore: number | null
  reliabilityScore?: number | null
  healthConfidenceScore?: number | null
  healthConfidenceFlag?: string | null
  progressDeliveryScore?: number | null
  executionStabilityScore?: number | null
  criticalTargetScore?: number | null
  businessExceptionScore?: number | null
  planGovernanceScore?: number | null
  healthStatus: '健康' | '亚健康' | '预警' | '危险' | '待完善'
  milestoneOverview: MilestoneOverview
  keyNodeSummary?: KeyNodeSummary
  kpiComparisons?: ProjectKpiComparisons
  planningGovernance?: {
    activeCount: number
    closeoutOverdueSignalCount: number
    closeoutOwnerAttentionCount: number
    reorderReminderCount: number
    reorderEscalationCount: number
    reorderSummaryCount: number
    adHocReminderCount: number
    dashboardCloseoutOverdue: boolean
    dashboardCloseoutOwnerAttentionRequired: boolean
    hasActiveGovernanceSignal: boolean
    governancePhase?: 'free_edit' | 'monthly_pending' | 'formal_execution' | 'pending_realign' | 'reordering' | 'closeout'
  }
}

export interface CompanySummaryHealthHistory {
  thisMonth: number | null
  lastMonth: number | null
  change: number | null
  thisMonthPeriod: string | null
  lastMonthPeriod: string | null
  periods: Array<{
    period: string
    value: number | null
  }>
}

export interface CompanySummaryStatusCounts {
  total: number | null
  inProgress: number | null
  completed: number | null
  paused: number | null
  notStarted: number | null
}

export interface CompanySummaryResponse {
  projectCount: number | null
  statusCounts: CompanySummaryStatusCounts
  averageHealth: number | null
  averageProgress: number | null
  attentionProjectCount: number | null
  totalUnreadWarningCount: number | null
  totalDelayedTaskCount: number | null
  lowHealthProjectCount: number | null
  overdueMilestoneProjectCount: number | null
  healthHistory: CompanySummaryHealthHistory
  ranking: ProjectSummary[] | null
}

export type ProjectSummaryRequestOptions = RequestInit

export interface MilestoneSummary {
  projectId: string
  projectName: string
  milestoneId: string
  milestoneName: string
  plannedEnd: string
  actualEnd: string | null
  deviationDays: number
  status: string
}

interface DeliveryCountdownItem {
  projectId: string
  projectName: string
  plannedEnd: string
  daysLeft: number
  status: string
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatusCounts(
  value: Partial<CompanySummaryStatusCounts> | null | undefined,
): CompanySummaryStatusCounts {
  return {
    total: normalizeNullableNumber(value?.total),
    inProgress: normalizeNullableNumber(value?.inProgress),
    completed: normalizeNullableNumber(value?.completed),
    paused: normalizeNullableNumber(value?.paused),
    notStarted: normalizeNullableNumber(value?.notStarted),
  }
}

function normalizeCompanySummary(value: CompanySummaryResponse | null | undefined): CompanySummaryResponse {
  const raw = (value ?? {}) as Partial<CompanySummaryResponse>
  const ranking = Array.isArray(raw.ranking) ? raw.ranking : null
  const projectCount = normalizeNullableNumber(raw.projectCount)
  const healthHistory = raw.healthHistory ?? {
    thisMonth: null,
    lastMonth: null,
    change: null,
    thisMonthPeriod: null,
    lastMonthPeriod: null,
    periods: [],
  }

  return {
    projectCount,
    statusCounts: normalizeStatusCounts(raw.statusCounts),
    averageHealth: normalizeNullableNumber(raw.averageHealth),
    averageProgress: normalizeNullableNumber(raw.averageProgress),
    attentionProjectCount: normalizeNullableNumber(raw.attentionProjectCount),
    totalUnreadWarningCount: normalizeNullableNumber(raw.totalUnreadWarningCount),
    totalDelayedTaskCount: normalizeNullableNumber(raw.totalDelayedTaskCount),
    lowHealthProjectCount: normalizeNullableNumber(raw.lowHealthProjectCount),
    overdueMilestoneProjectCount: normalizeNullableNumber(raw.overdueMilestoneProjectCount),
    healthHistory: {
      thisMonth: typeof healthHistory.thisMonth === 'number' ? healthHistory.thisMonth : null,
      lastMonth: typeof healthHistory.lastMonth === 'number' ? healthHistory.lastMonth : null,
      change: typeof healthHistory.change === 'number' ? healthHistory.change : null,
      thisMonthPeriod: healthHistory.thisMonthPeriod ?? null,
      lastMonthPeriod: healthHistory.lastMonthPeriod ?? null,
      periods: normalizeArray(healthHistory.periods),
    },
    ranking,
  }
}

function normalizeSummaryStatus(status?: string | null): string {
  switch (String(status || '').trim()) {
    case '已完成':
    case 'completed':
      return 'completed'
    case '进行中':
    case 'in_progress':
    case 'active':
      return 'in_progress'
    default:
      return 'pending'
  }
}

function withFreshSummaryOptions(options?: RequestInit): RequestInit {
  return {
    ...(options ?? {}),
    cache: 'no-store',
  }
}

export class DashboardApiService {
  static async getAllProjectsSummary(options?: RequestInit): Promise<ProjectSummary[]> {
    const data = await apiGet<ProjectSummary[]>(
      '/api/company/dashboard/projects-summary',
      withFreshSummaryOptions(options),
    )
    return normalizeArray(data)
  }

  static async getCompanySummary(options?: RequestInit): Promise<CompanySummaryResponse> {
    const data = await apiGet<CompanySummaryResponse>(
      '/api/company/dashboard/company-summary',
      withFreshSummaryOptions(options),
    )
    return normalizeCompanySummary(data)
  }

  static async getProjectSummary(projectId: string, options?: ProjectSummaryRequestOptions): Promise<ProjectSummary | null> {
    if (!projectId) return null

    try {
      const data = await apiGet<ProjectSummary>(
        `/api/projects/${encodeURIComponent(projectId)}/dashboard/project-summary`,
        withFreshSummaryOptions(options),
      )
      return data ?? null
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      console.error('[DashboardApiService] Failed to fetch project summary:', error)
      return null
    }
  }

  static async getProjectCriticalPathSummary(projectId: string, options?: RequestInit): Promise<CriticalPathSummaryModel | null> {
    if (!projectId) return null

    try {
      const snapshot = await fetchCriticalPathSnapshot(projectId, options)
      return buildCriticalPathSummaryModel(snapshot)
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      console.error('[DashboardApiService] Failed to fetch project critical path summary:', error)
      return null
    }
  }

  static async getAllRisks(): Promise<any[]> {
    const [risks, summaries] = await Promise.all([
      apiGet<any[]>('/api/risks').catch(() => []),
      this.getAllProjectsSummary().catch(() => []),
    ])

    const projectNameMap = new Map(summaries.map((summary) => [summary.id, summary.name]))

    return normalizeArray<any>(risks).map((risk: any) => ({
      ...risk,
      projectName: projectNameMap.get(risk.project_id || risk.projectId) || '',
    }))
  }

  static async getUpcomingDeliveries(days = 90): Promise<DeliveryCountdownItem[]> {
    const summaries = await this.getAllProjectsSummary()

    return summaries
      .filter((summary) => {
        if (!summary.plannedEndDate || summary.daysUntilPlannedEnd === null) return false
        if (summary.statusLabel === '已完成') return false
        return summary.daysUntilPlannedEnd >= 0 && summary.daysUntilPlannedEnd <= days
      })
      .sort((left, right) => (left.daysUntilPlannedEnd ?? 0) - (right.daysUntilPlannedEnd ?? 0))
      .map((summary) => ({
        projectId: summary.id,
        projectName: summary.name,
        plannedEnd: summary.plannedEndDate as string,
        daysLeft: summary.daysUntilPlannedEnd as number,
        status: normalizeSummaryStatus(summary.status),
      }))
  }

  static async getProjectRanking(): Promise<ProjectSummary[]> {
    const summaries = await this.getAllProjectsSummary()
    return summaries
  }
}
