import type { Issue, Risk } from '@/lib/supabase'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowRight, CheckCircle, TriangleAlert } from 'lucide-react'

import { CompanyHealthHeatmap } from './CompanyHealthHeatmap'
import { MilestoneAchievementChart } from './MilestoneAchievementChart'
import { ProjectSignalRanking } from './ProjectSignalRanking'
import { RiskBubbleMatrix } from './RiskBubbleMatrix'
import type { HealthHistory, ProjectRow } from '../types'
import { displayProjectName } from '../utils'

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

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
    attentionProjectCount: number
    totalUnreadWarningCount: number
    totalDelayedTaskCount: number
    lowHealthProjectCount: number
  }
  companyRisks: Risk[]
  companyIssues: Issue[]
  summaryReady?: boolean
  onNavigate: (path: string) => void
}

export function CompanyInsightSection({
  projectRows,
  stats,
  companyRisks,
  companyIssues,
  summaryReady = true,
  onNavigate,
}: CompanyInsightSectionProps) {
  const actionRows = projectRows.filter((row) => row.summary?.attentionRequired).slice(0, 3)
  const actionTitle = summaryReady
    ? `${stats.attentionProjectCount} 个项目建议优先查看`
    : '组合摘要加载中'
  const actionBadge = summaryReady ? `${stats.attentionProjectCount} 个需关注` : '待摘要'

  const buildActionReason = (row: ProjectRow) => {
    const summary = row.summary
    if (summary?.highestWarningSummary) return summary.highestWarningSummary

    const unreadWarningCount = nullableNumber(summary?.unreadWarningCount)
    const activeDelayedTasks = nullableNumber(summary?.activeDelayedTasks)
    const activeObstacles = nullableNumber(summary?.activeObstacles ?? summary?.activeObstacleCount)
    const criticalPathAffectedTasks = nullableNumber(summary?.criticalPathAffectedTasks)
    const facts = [
      unreadWarningCount !== null && unreadWarningCount > 0 ? `未读预警 ${unreadWarningCount}` : null,
      activeDelayedTasks !== null && activeDelayedTasks > 0 ? `延期任务 ${activeDelayedTasks}` : null,
      activeObstacles !== null && activeObstacles > 0
        ? `阻碍 ${summary?.activeObstacles ?? summary?.activeObstacleCount}`
        : null,
      criticalPathAffectedTasks !== null && criticalPathAffectedTasks > 0 ? `关键路径受影响 ${criticalPathAffectedTasks}` : null,
      summary?.monthlyCloseStatus === '已超期'
        ? '月度收口异常'
        : null,
    ].filter(Boolean)

    return facts.length > 0 ? facts.join(' · ') : '系统建议优先查看，进入项目核查进度、节点和提醒。'
  }

  const milestoneChartProjects = projectRows
    .slice(0, 8)
    .map((row) => {
      const milestoneProgress = nullableNumber(row.summary?.milestoneProgress)
      const shiftedMilestoneCount = nullableNumber(row.summary?.shiftedMilestoneCount ?? row.summary?.milestoneOverview?.stats?.overdue)

      if (milestoneProgress === null && shiftedMilestoneCount === null) return null

      return {
        id: row.project.id,
        name: displayProjectName(row.project),
        milestoneProgress,
        shiftedMilestoneCount,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const healthHeatmapItems = projectRows.slice(0, 6).map((row) => ({
    id: row.project.id,
    name: displayProjectName(row.project),
    businessHealthScore: row.businessHealthScore,
    progress: nullableNumber(row.summary?.overallProgress),
    statusLabel: row.summaryStatus,
  }))

  return (
    <section className="surface-card overflow-hidden">
      <div className="px-6 py-5">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">公司洞察</h2>
      </div>
      <Separator />

      <div className="px-6 pt-6">
        <div
          data-testid="company-action-focus"
          className="rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-5 shadow-[var(--el-1)]"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500">本周建议优先查看</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-950">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                  <TriangleAlert className="h-4 w-4" />
                </span>
                {actionTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                系统根据进度、节点、风险和提醒信号生成优先查看清单，默认展示最需要先核查的项目。
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              {actionBadge}
            </span>
          </div>

          {!summaryReady ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              组合摘要加载中，暂不展示行动建议。
            </div>
          ) : actionRows.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {actionRows.map((row) => (
                <Button
                  type="button"
                  unstyled
                  key={row.project.id}
                  data-testid="company-action-item"
                  onClick={() => onNavigate(`/projects/${row.project.id}/dashboard`)}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <div className="text-sm font-semibold text-slate-900">{displayProjectName(row.project)}</div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{buildActionReason(row)}</p>
                  <div className="mt-3 flex items-center justify-between text-xs font-medium text-blue-700">
                    <span>进入项目看板</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle}
              title="项目组合运行平稳"
              description="当前没有需要优先查看的项目。"
              className="mt-4 min-h-[9rem] rounded-xl border border-slate-200 bg-slate-50 py-6"
            />
          )}
        </div>
      </div>

      <div className="grid gap-5 p-6 xl:grid-cols-2">
        <CompanyHealthHeatmap
          items={healthHeatmapItems}
          averageHealth={stats.averageHealth}
          lowHealthProjectCount={stats.lowHealthProjectCount}
          totalItemCount={projectRows.length}
        />
        <MilestoneAchievementChart projects={milestoneChartProjects} />
        <ProjectSignalRanking
          projectRows={projectRows}
          companySignals={{
            attentionProjectCount: stats.attentionProjectCount,
            totalUnreadWarningCount: stats.totalUnreadWarningCount,
            totalDelayedTaskCount: stats.totalDelayedTaskCount,
          }}
          onNavigate={onNavigate}
        />
        <RiskBubbleMatrix risks={companyRisks} issues={companyIssues} projectRows={projectRows} />
      </div>
    </section>
  )
}
