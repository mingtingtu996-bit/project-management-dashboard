import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ProjectCatalogItem } from '@/lib/projectApi'
import { cn } from '@/lib/utils'
import {
  Archive,
  ArchiveRestore,
  FolderKanban,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import type { CockpitTab, ProjectRow } from '../types'
import {
  progressBarClass,
  displayProjectDescription,
  displayProjectName,
  projectAvatarLabel,
  statusBadgeClass,
} from '../utils'

const DEFAULT_VISIBLE_PROJECT_COUNT = 9

interface ProjectOverviewSectionProps {
  projectRows: ProjectRow[]
  totalProjects: number
  activeTab: CockpitTab
  tabItems: Array<{ key: CockpitTab; label: string; count: number }>
  onTabChange: (tab: CockpitTab) => void
  onCreate: () => void
  onEdit: (project: ProjectCatalogItem) => void
  onToggleArchive: (project: ProjectCatalogItem) => void
  onDelete: (project: ProjectCatalogItem) => void
  onNavigate: (path: string) => void
  loadingMore?: boolean
}

function healthDotClass(score: number | null) {
  if (score === null) return 'bg-slate-300'
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-600'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatPercent(value: number | null) {
  return value === null ? '暂不可用' : `${value}%`
}

function formatNumber(value: number | null) {
  return value === null ? '暂不可用' : String(value)
}

function formatBusinessHealth(score: number | null) {
  return score === null ? '健康信号暂不可用' : `健康信号 ${score}`
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
  loadingMore = false,
}: ProjectOverviewSectionProps) {
  const visibleRows = projectRows.slice(0, DEFAULT_VISIBLE_PROJECT_COUNT)

  return (
    <Card variant="surface" className="border-slate-100" data-testid="company-project-overview">
      <CardContent padding="md" className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div data-testid="company-project-overview-title">
            <CardHead eyebrow="项目" title="项目概览" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loadingMore ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200/60">
                正在同步项目目录
              </span>
            ) : null}
            <div className="rounded-full bg-slate-50 px-4 py-2 text-xs text-slate-500 ring-1 ring-inset ring-slate-200/60">
              {`当前显示 ${visibleRows.length} / ${totalProjects} 个项目`}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((tab) => (
              <Button
                variant="ghost"
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
        </div>
        <Separator />

        {projectRows.length === 0 && loadingMore ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-8 py-16">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <FolderKanban className="h-6 w-6 text-blue-600" />
              </div>
              <p className="mb-1 text-base font-semibold text-slate-900">项目目录同步中</p>
              <p className="text-sm leading-6 text-slate-500">
                公司摘要已返回，正在补齐完整项目列表和筛选目录。
              </p>
            </div>
          </div>
        ) : projectRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-8 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <FolderKanban className="h-6 w-6 text-slate-500" />
            </div>
            <p className="mb-1 text-base font-semibold text-slate-900">暂无项目</p>
            <Button onClick={onCreate} className="mt-5 gap-2 px-5">
              <Plus className="h-4 w-4" />
              创建项目
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-white" data-testid="company-project-compact-list">
            <Table className="min-w-[980px] table-fixed text-sm">
              <TableHeader className="sticky top-0 z-10 bg-slate-50/95 text-slate-500">
                <TableRow>
                  <TableHead className="w-[28%]">项目</TableHead>
                  <TableHead className="w-[13%]">健康信号</TableHead>
                  <TableHead className="w-[15%]">完成率</TableHead>
                  <TableHead className="w-[11%]">风险数</TableHead>
                  <TableHead className="w-[18%]">关键节点</TableHead>
                  <TableHead className="w-[15%] text-right">进入</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const { project, summary, summaryStatus } = row
                  const attentionRequired = Boolean(summary?.attentionRequired)
                  const overallProgress = summary ? nullableNumber(summary.overallProgress) : null
                  const activeRiskCount = summary ? nullableNumber(summary.activeRiskCount ?? summary.riskCount) : null
                  const businessHealthScore = nullableNumber(summary?.businessHealthScore ?? row.businessHealthScore)
                  const keyNodeLabel = summary ? row.keyNodeLabel : '关键节点摘要暂不可用'
                  const keyNodeHint = row.keyNodeAttentionCount > 0
                    ? `需关注 ${row.keyNodeAttentionCount} 个`
                    : summary ? '当前暂无关键节点关注项。' : '暂不可用'
                  const projectName = displayProjectName(project)
                  const projectDescription = displayProjectDescription(project)
                  const archived = ['archived', 'paused', '已暂停'].includes(String(project.status ?? ''))

                  return (
                    <TableRow
                      key={project.id}
                      data-testid="company-project-row"
                      className={cn(
                        'hover:bg-slate-50',
                        attentionRequired ? 'border-l-4 border-l-orange-400 bg-orange-50/35' : 'border-l-4 border-l-transparent',
                      )}
                    >
                      <TableCell className="py-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            <AvatarFallback className="bg-slate-950 text-sm font-semibold text-white">
                              {projectAvatarLabel(projectName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-medium text-slate-900">{projectName}</h3>
                              <span
                                className={cn('h-2 w-2 rounded-full', healthDotClass(businessHealthScore))}
                                aria-label={formatBusinessHealth(businessHealthScore)}
                              />
                              <span className={`badge-base ${statusBadgeClass(summaryStatus)}`}>{summaryStatus}</span>
                              {attentionRequired ? (
                                <span className="badge-base bg-red-50 text-red-700">需关注</span>
                              ) : null}
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                              {projectDescription}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'badge-base',
                          businessHealthScore === null ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700',
                        )}>
                          {formatBusinessHealth(businessHealthScore)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="num-display text-sm font-semibold text-slate-900">{formatPercent(overallProgress)}</div>
                          {overallProgress === null ? (
                            <div className="h-2 rounded-full bg-slate-100" />
                          ) : (
                            <div className="h-2 rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${progressBarClass(overallProgress)}`}
                                style={{ width: `${overallProgress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="num-display text-sm font-semibold text-slate-900">{formatNumber(activeRiskCount)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-slate-900">{keyNodeLabel}</div>
                          <p className="text-xs text-slate-500">{keyNodeHint}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild size="sm" className="h-8 gap-1.5 px-3">
                              <Link to={`/projects/${project.id}/dashboard`} data-testid="company-project-dashboard-link">
                                <LayoutDashboard className="h-4 w-4" />
                                进入项目
                              </Link>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-500 hover:text-slate-900"
                                  aria-label={`项目操作：${projectName}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onSelect={() => onEdit(project)} className="gap-2">
                                  <Pencil className="h-4 w-4" />
                                  编辑项目
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onToggleArchive(project)} className="gap-2">
                                  {archived ? (
                                    <ArchiveRestore className="h-4 w-4" />
                                  ) : (
                                    <Archive className="h-4 w-4" />
                                  )}
                                  {archived ? '激活项目' : '归档项目'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => onDelete(project)}
                                  className="gap-2 text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  删除项目
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 text-xs text-slate-500">
                            <Link className="hover:text-blue-700" to={`/projects/${project.id}/gantt`} data-testid="company-project-gantt-link">任务列表</Link>
                            <Link className="hover:text-blue-700" to={`/projects/${project.id}/risks`} data-testid="company-project-risks-link">风险与问题</Link>
                            <Link className="hover:text-blue-700" to={`/projects/${project.id}/milestones`} data-testid="company-project-milestones-link">里程碑</Link>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
