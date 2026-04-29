import type { Issue, Risk } from '@/lib/supabase'
import { EmptyState } from '@/components/EmptyState'
import { Separator } from '@/components/ui/separator'
import { CheckCircle } from 'lucide-react'

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
  const anomalyRows = projectRows.filter((row) => row.summary?.attentionRequired)
  const topReasons = anomalyRows
    .map((row) => row.summary?.highestWarningSummary || `${row.project.name} 需要关注`)
    .filter(Boolean)
    .slice(0, 3)

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
      <div className="px-6 py-5">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">公司洞察</h2>
      </div>
      <Separator />

      <div className="px-6 pt-6">
        {anomalyRows.length > 0 ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
            <div className="text-lg font-semibold text-orange-800">{anomalyRows.length} 个项目异常</div>
            <ul className="mt-2 space-y-1 text-sm text-orange-700">
              {topReasons.map((reason) => (
                <li key={reason}>· {reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState icon={CheckCircle} title="所有项目运行正常" />
        )}
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
