import { apiGet, isAbortError } from '@/lib/apiClient'
import type { MilestoneOverview } from '@/lib/milestoneOverview'
import {
  buildCriticalPathSummaryModel,
  fetchCriticalPathSnapshot,
  type CriticalPathSummaryModel,
} from '@/lib/criticalPath'
export type { CriticalPathSummaryModel } from '@/lib/criticalPath'

export interface NextMilestoneSummary {
  id: string
  name: string
  targetDate: string
  status: string
  daysRemaining: number
}

export interface ProjectSummary {
  id: string
  name: string
  status: string
  statusLabel: string
  plannedEndDate: string | null
  daysUntilPlannedEnd: number | null
  totalTasks: number
  leafTaskCount: number
  completedTaskCount: number
  inProgressTaskCount: number
  delayedTaskCount: number
  delayDays: number
  delayCount: number
  overallProgress: number
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
  activeDelayRequests?: number
  activeObstacles?: number
  monthlyCloseStatus?: '未开始' | '进行中' | '已完成' | '已超期'
  closeoutOverdueDays?: number
  unreadWarningCount?: number
  highestWarningLevel?: 'info' | 'warning' | 'critical' | null
  highestWarningSummary?: string | null
  shiftedMilestoneCount?: number
  criticalPathAffectedTasks?: number
  healthScore: number
  healthStatus: '健康' | '亚健康' | '预警' | '危险'
  nextMilestone: NextMilestoneSummary | null
  milestoneOverview: MilestoneOverview
  planningGovernance?: {
    activeCount: number
    closeoutOverdueSignalCount: number
    closeoutForceUnlockCount: number
    reorderReminderCount: number
    reorderEscalationCount: number
    reorderSummaryCount: number
    adHocReminderCount: number
    dashboardCloseoutOverdue: boolean
    dashboardForceUnlockAvailable: boolean
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

export interface CompanySummaryResponse {
  projectCount: number
  averageHealth: number
  averageProgress: number
  attentionProjectCount: number
  lowHealthProjectCount: number
  overdueMilestoneProjectCount: number
  healthHistory: CompanySummaryHealthHistory
  ranking: ProjectSummary[]
}

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

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeCompanySummary(value: CompanySummaryResponse | null | undefined): CompanySummaryResponse {
  const raw = (value ?? {}) as Partial<CompanySummaryResponse>
  const ranking = normalizeArray(raw.ranking)
  const healthHistory = raw.healthHistory ?? {
    thisMonth: null,
    lastMonth: null,
    change: null,
    thisMonthPeriod: null,
    lastMonthPeriod: null,
    periods: [],
  }

  return {
    projectCount: normalizeNumber(raw.projectCount, ranking.length),
    averageHealth: normalizeNumber(raw.averageHealth),
    averageProgress: normalizeNumber(raw.averageProgress),
    attentionProjectCount: normalizeNumber(raw.attentionProjectCount),
    lowHealthProjectCount: normalizeNumber(raw.lowHealthProjectCount),
    overdueMilestoneProjectCount: normalizeNumber(raw.overdueMilestoneProjectCount),
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
      '/api/dashboard/projects-summary',
      withFreshSummaryOptions(options),
    )
    return normalizeArray(data)
  }

  static async getCompanySummary(options?: RequestInit): Promise<CompanySummaryResponse> {
    const data = await apiGet<CompanySummaryResponse>(
      '/api/dashboard/company-summary',
      withFreshSummaryOptions(options),
    )
    return normalizeCompanySummary(data)
  }

  static async getProjectSummary(projectId: string, options?: RequestInit): Promise<ProjectSummary | null> {
    if (!projectId) return null

    try {
      const data = await apiGet<ProjectSummary>(
        `/api/dashboard/project-summary?projectId=${encodeURIComponent(projectId)}`,
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

  static async getMilestonesSummary(): Promise<MilestoneSummary[]> {
    const summaries = await this.getAllProjectsSummary()

    return summaries
      .filter((summary) => summary.nextMilestone)
      .map((summary) => {
        const nextMilestone = summary.nextMilestone as NextMilestoneSummary
        const deviationDays = nextMilestone.daysRemaining < 0 ? Math.abs(nextMilestone.daysRemaining) : 0

        return {
          projectId: summary.id,
          projectName: summary.name,
          milestoneId: nextMilestone.id,
          milestoneName: nextMilestone.name,
          plannedEnd: nextMilestone.targetDate,
          actualEnd: null,
          deviationDays,
          status: normalizeSummaryStatus(nextMilestone.status),
        }
      })
      .sort((left, right) => new Date(left.plannedEnd).getTime() - new Date(right.plannedEnd).getTime())
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
    return [...summaries].sort((left, right) => right.healthScore - left.healthScore)
  }
}
