import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Project } from '@/lib/localDb'
import { cn } from '@/lib/utils'
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
    ? 'card-hover rounded-xl border border-orange-200 border-l-4 border-l-orange-500 bg-orange-50/40 p-6 shadow-[var(--el-2)]'
    : 'card-hover rounded-xl border border-slate-200 bg-white p-6 shadow-[var(--el-1)]'
}

function healthDotClass(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
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
  const sortedRows = [...projectRows].sort((left, right) => {
    const leftAttention = left.summary?.attentionRequired ? 1 : 0
    const rightAttention = right.summary?.attentionRequired ? 1 : 0
    return rightAttention - leftAttention
  })

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

        <div className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((tab) => (
              <Button variant="ghost"
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
              </Button>
            ))}
          </div>

          <div className="text-xs text-slate-500" />
        </div>
        <Separator />
      </CardHeader>

      <CardContent className="pt-6">
        {projectRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-8 py-20 text-center">
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
          <div className="grid gap-6 xl:grid-cols-3" data-testid="company-project-grid">
            {sortedRows.map((row) => {
              const { project, summary, summaryStatus } = row
              const attentionRequired = Boolean(summary?.attentionRequired)
              const overallProgress = summary?.overallProgress ?? 0
              const activeRiskCount = summary?.activeRiskCount ?? summary?.riskCount ?? 0
              const highestWarningSummary = summary?.highestWarningSummary || '当前暂无高优先级预警'
              const archived = isArchivedProject(project)

              return (
                <div key={project.id} className={buildProjectCardClass(attentionRequired)} data-testid="company-project-card">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-4">
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          <AvatarFallback className="bg-slate-950 text-sm font-semibold text-white">
                            {projectAvatarLabel(project.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-medium text-slate-900">{project.name}</h3>
                            <span
                              className={cn('h-2.5 w-2.5 rounded-full', healthDotClass(row.healthScore))}
                              aria-label={`健康度 ${row.healthScore}`}
                            />
                            <span className={`badge-base ${statusBadgeClass(summaryStatus)}`}>{summaryStatus}</span>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="编辑项目"
                                onClick={() => onEdit(project)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑项目</TooltipContent>
                          </Tooltip>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={archived ? '激活项目' : '归档项目'}
                              onClick={() => onToggleArchive(project)}
                            >
                              {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{archived ? '激活项目' : '归档项目'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="flex-shrink-0"
                              aria-label="删除项目"
                              onClick={() => onDelete(project)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除项目</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-xl bg-slate-50 px-4 py-4">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500">总体进度</div>
                          <div className="text-2xl font-semibold tabular-nums text-slate-900">
                            {overallProgress}%
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${progressBarClass(overallProgress)}`}
                            style={{ width: `${overallProgress}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white bg-white px-4 py-3">
                          <div className="text-xs text-slate-500">完成率</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{overallProgress}%</div>
                        </div>
                        <div className="rounded-xl border border-white bg-white px-4 py-3">
                          <div className="text-xs text-slate-500">风险数</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{activeRiskCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-xs text-slate-500">下一个关键节点</div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">{row.milestoneName}</div>
                          <p className="mt-2 text-xs text-slate-500">
                            {row.milestoneDate
                              ? `计划 ${row.milestoneDate} · ${formatTimelineLabel(row.milestoneDaysRemaining)}`
                              : '当前没有已识别的下一关键节点。'}
                          </p>
                        </div>
                        <div className="max-w-[280px] text-xs leading-5 text-slate-600">
                          {highestWarningSummary}
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
