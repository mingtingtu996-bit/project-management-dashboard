import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Project } from '@/lib/localDb'
import {
  AlertTriangle,
  Archive,
  Flag,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'

import type { CockpitTab, ProjectRow } from '../types'
import {
  formatTimelineLabel,
  healthBadgeClass,
  monthlyCloseStatusClass,
  progressBarClass,
  projectAvatarLabel,
  statusBadgeClass,
} from '../utils'

interface ProjectOverviewSectionProps {
  projectRows: ProjectRow[]
  totalProjects: number
  activeTab: CockpitTab
  tabItems: Array<{ key: CockpitTab; label: string; count: number }>
  onTabChange: (tab: CockpitTab) => void
  onCreate: () => void
  onEdit: (project: Project) => void
  onToggleArchive: (project: Project) => void
  onDelete: (project: Project) => void
  onNavigate: (path: string) => void
}

function isArchivedProject(project: Project) {
  return ['archived', 'paused', '已暂停'].includes(String(project.status ?? '').trim())
}

function buildProjectCardClass(attentionRequired: boolean) {
  return attentionRequired
    ? 'rounded-[28px] border border-red-100 bg-red-50/30 p-6 shadow-[0_12px_32px_rgba(239,68,68,0.08)]'
    : 'rounded-[28px] border border-slate-100 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]'
}

export function ProjectOverviewSection({
  projectRows,
  totalProjects,
  activeTab,
  tabItems,
  onTabChange,
  onCreate,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectOverviewSectionProps) {
  return (
    <Card className="card-l2 border-slate-100" data-testid="company-project-overview">
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="company-project-overview-title">
              项目概览
            </CardTitle>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            {projectRows.length === totalProjects ? `共 ${totalProjects} 个项目` : `当前筛出 ${projectRows.length} / ${totalProjects} 个项目`}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-white text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500" />
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {projectRows.length === 0 ? (
          <div className="rounded-[28px] border border-slate-100 bg-white px-8 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <FolderKanban className="h-6 w-6 text-slate-500" />
            </div>
            <p className="mb-1 text-base font-semibold text-slate-900">暂无项目</p>
            <Button onClick={onCreate} className="mt-5 gap-2 rounded-2xl px-5">
              <Plus className="h-4 w-4" />
              创建项目
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {projectRows.map((row) => {
              const { project, summary, summaryStatus } = row
              const attentionRequired = Boolean(summary?.attentionRequired)
              const scheduleVarianceDays = summary?.scheduleVarianceDays ?? summary?.delayDays ?? 0
              const activeObstacles = summary?.activeObstacles ?? summary?.activeObstacleCount ?? 0
              const highestWarningSummary = summary?.highestWarningSummary || '当前暂无高优先级预警'
              const archived = isArchivedProject(project)

              return (
                <div key={project.id} className={buildProjectCardClass(attentionRequired)} data-testid="company-project-card">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
                          {projectAvatarLabel(project.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-slate-900">{project.name}</h3>
                            <span className={`badge-base ${statusBadgeClass(summaryStatus)}`}>{summaryStatus}</span>
                            <span className={`badge-base ${healthBadgeClass(row.healthScore)}`}>健康 {row.healthScore}</span>
                            {attentionRequired ? (
                              <span className="badge-base bg-red-50 text-red-700">需关注</span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                            {project.description || '暂无项目描述'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-1">
                        {!archived ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(project)}
                            title="编辑项目"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleArchive(project)}
                          title={archived ? '激活项目' : '归档项目'}
                        >
                          {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          onClick={() => onDelete(project)}
                          title="删除项目"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">总体进度</div>
                        <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                          {summary?.overallProgress ?? 0}%
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${progressBarClass(summary?.overallProgress ?? 0)}`}
                            style={{ width: `${summary?.overallProgress ?? 0}%` }}
                          />
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          延期任务 {summary?.delayedTaskCount ?? 0} · 关键路径受影响 {summary?.criticalPathAffectedTasks ?? 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">专项进展与执行信号</div>
                        <div className="mt-2 space-y-2 text-xs text-slate-500">
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>证照</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.completedPreMilestoneCount ?? 0}/{summary?.preMilestoneCount ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>验收</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.passedAcceptancePlanCount ?? 0}/{summary?.acceptancePlanCount ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>图纸</span>
                            <span className="font-semibold text-slate-900">
                              {summary?.issuedConstructionDrawingCount ?? 0}/{summary?.constructionDrawingCount ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>总工期偏差</span>
                            <span className={`font-semibold ${scheduleVarianceDays > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {scheduleVarianceDays} 天
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>延期审批</span>
                            <span className="font-semibold text-slate-900">{summary?.activeDelayRequests ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>活跃阻碍</span>
                            <span className="font-semibold text-slate-900">{activeObstacles}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                            <span>本月关账</span>
                            <span className={`rounded-full px-2 py-1 font-medium ${monthlyCloseStatusClass(summary?.monthlyCloseStatus)}`}>
                              {summary?.monthlyCloseStatus ?? '未开始'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-4">
                        <div className="text-xs text-slate-500">下一个关键节点</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{row.milestoneName}</div>
                        <p className="mt-3 text-xs text-slate-500">
                          {row.milestoneDate
                            ? `计划 ${row.milestoneDate} · ${formatTimelineLabel(row.milestoneDaysRemaining)}`
                            : '当前没有已识别的下一关键节点。'}
                        </p>
                        <div className="mt-4 rounded-xl border border-white bg-white px-3 py-3">
                          <div className="text-[11px] text-slate-500">最高级别预警</div>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-700">{highestWarningSummary}</p>
                          <div className="mt-3 text-[11px] text-slate-500">
                            未读预警 {summary?.unreadWarningCount ?? 0} · 偏移里程碑 {summary?.shiftedMilestoneCount ?? 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="h-11 gap-2 rounded-2xl px-5">
                        <Link to={`/projects/${project.id}/dashboard`} data-testid="company-project-dashboard-link">
                          <LayoutDashboard className="h-4 w-4" />
                          进入项目
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5">
                        <Link to={`/projects/${project.id}/gantt`} data-testid="company-project-gantt-link">
                          <ListChecks className="h-4 w-4" />
                          任务列表
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5">
                        <Link to={`/projects/${project.id}/risks`} data-testid="company-project-risks-link">
                          <AlertTriangle className="h-4 w-4" />
                          风险与问题
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5">
                        <Link to={`/projects/${project.id}/milestones`} data-testid="company-project-milestones-link">
                          <Flag className="h-4 w-4" />
                          里程碑
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
