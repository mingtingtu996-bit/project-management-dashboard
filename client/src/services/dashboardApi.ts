import { apiGet } from '@/lib/apiClient'
import type { MilestoneOverview } from '@/lib/milestoneOverview'

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
  healthScore: number
  healthStatus: '健康' | '亚健康' | '预警' | '危险'
  nextMilestone: NextMilestoneSummary | null
  milestoneOverview: MilestoneOverview
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

export class DashboardApiService {
  static async getAllProjectsSummary(): Promise<ProjectSummary[]> {
    const data = await apiGet<ProjectSummary[]>('/api/dashboard/projects-summary')
    return normalizeArray(data)
  }

  static async getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
    if (!projectId) return null

    try {
      const data = await apiGet<ProjectSummary>(`/api/dashboard/project-summary?projectId=${encodeURIComponent(projectId)}`)
      return data ?? null
    } catch (error) {
      console.error('[DashboardApiService] Failed to fetch project summary:', error)
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

    return normalizeArray(risks).map((risk) => ({
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
