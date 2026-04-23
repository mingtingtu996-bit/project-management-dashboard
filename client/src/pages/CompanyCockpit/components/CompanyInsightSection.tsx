import type { Issue, Risk } from '@/lib/supabase'

import { CompanyHealthHeatmap } from './CompanyHealthHeatmap'
import { MilestoneAchievementChart } from './MilestoneAchievementChart'
import { ProjectSignalRanking } from './ProjectSignalRanking'
import { RiskBubbleMatrix } from './RiskBubbleMatrix'
import type { HealthHistory, ProjectRow } from '../types'

interface CompanyInsightSectionProps {
  projectRows: ProjectRow[]
  healthHistory: HealthHistory
  stats: {
    total: number
    inProgress: number
    completed: number
    paused: number
    averageHealth: number
    averageProgress: number
  }
  companyRisks: Risk[]
  companyIssues: Issue[]
  onNavigate: (path: string) => void
}

export function CompanyInsightSection({
  projectRows,
  companyRisks,
  companyIssues,
  onNavigate,
}: CompanyInsightSectionProps) {
  const milestoneChartProjects = projectRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    milestoneProgress: row.summary?.milestoneProgress ?? 0,
    shiftedMilestoneCount: row.summary?.shiftedMilestoneCount ?? row.summary?.milestoneOverview?.stats?.overdue ?? 0,
  }))

  const healthHeatmapItems = projectRows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    healthScore: row.healthScore,
    progress: row.summary?.overallProgress ?? 0,
    statusLabel: row.summaryStatus,
  }))

  return (
    <section className="shell-surface overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">公司洞察</h2>
      </div>

      <div className="grid gap-5 p-6 xl:grid-cols-2">
        <CompanyHealthHeatmap items={healthHeatmapItems} />
        <MilestoneAchievementChart projects={milestoneChartProjects} />
        <ProjectSignalRanking projectRows={projectRows} onNavigate={onNavigate} />
        <RiskBubbleMatrix risks={companyRisks} issues={companyIssues} projectRows={projectRows} />
      </div>
    </section>
  )
}
