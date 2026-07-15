import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Plus,
  RefreshCw,
} from 'lucide-react'
import type { HealthHistory } from '../types'
import { formatDelta } from '../utils'

function healthPillClass(score: number | null) {
  if (score === null) return 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/60'
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'
  if (score >= 60) return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60'
  return 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/60'
}

function healthPillLabel(score: number | null) {
  if (score === null) return '待加载'
  if (score >= 80) return '运行平稳'
  if (score >= 60) return '建议关注'
  return '重点关注'
}

function overviewToneClass(score: number | null, attentionProjectCount: number) {
  if (score === null) return 'border-slate-200 bg-slate-50'
  if (score < 60) return 'border-red-200 bg-red-50/70'
  if (score >= 80 && attentionProjectCount === 0) return 'border-emerald-200 bg-emerald-50/70'
  return 'border-slate-200 bg-slate-50'
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function displayMetric(summaryReady: boolean, value: number | null | undefined) {
  return summaryReady && isFiniteNumber(value) ? value : '--'
}

function buildOverviewTitle(
  summaryReady: boolean,
  projectCount: number | null,
  averageHealth: number | null,
  attentionProjectCount: number | null,
) {
  if (!summaryReady || !isFiniteNumber(averageHealth) || !isFiniteNumber(attentionProjectCount)) {
    return '公司组合主结论暂不可用'
  }
  if (attentionProjectCount > 0) return `组合信号 ${averageHealth} 分 · ${attentionProjectCount} 个项目建议优先查看`
  return `${isFiniteNumber(projectCount) ? projectCount : 0} 个项目组合运行平稳`
}

interface CompanyHeroProps {
  search: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  onCreate: () => void
  error: string | null
  summaryReady: boolean
  isRefreshing: boolean
  healthHistory: HealthHistory
  stats: {
    total: number | null
    inProgress: number | null
    completed: number | null
    paused: number | null
    averageHealth: number | null
    attentionProjectCount: number | null
    totalUnreadWarningCount: number | null
    totalDelayedTaskCount: number | null
    lowHealthProjectCount: number | null
    overdueMilestoneProjectCount: number | null
  }
  focusProjects?: unknown[]
  onNavigate: (path: string) => void
  draftBadge?: ReactNode
}

export function CompanyHero({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  error,
  summaryReady,
  isRefreshing,
  healthHistory,
  stats,
  draftBadge,
}: CompanyHeroProps) {
  const healthScore = summaryReady && isFiniteNumber(stats.averageHealth) ? stats.averageHealth : null
  const attentionProjectCount = summaryReady && isFiniteNumber(stats.attentionProjectCount)
    ? stats.attentionProjectCount
    : 0
  const overviewTitle = buildOverviewTitle(summaryReady, stats.total, stats.averageHealth, stats.attentionProjectCount)
  const evidenceItems = [
    {
      label: '进行中 / 已完成',
      value: summaryReady && isFiniteNumber(stats.inProgress) && isFiniteNumber(stats.completed)
        ? `${stats.inProgress} / ${stats.completed}`
        : '--',
    },
    { label: '未读预警', value: displayMetric(summaryReady, stats.totalUnreadWarningCount) },
    { label: '延期任务', value: displayMetric(summaryReady, stats.totalDelayedTaskCount) },
    {
      label: '低信号 / 节点逾期',
      value: summaryReady && isFiniteNumber(stats.lowHealthProjectCount) && isFiniteNumber(stats.overdueMilestoneProjectCount)
        ? `${stats.lowHealthProjectCount} / ${stats.overdueMilestoneProjectCount}`
        : '--',
    },
  ]

  return (
    <section data-testid="company-hero" className="surface-card p-5">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="shell-section-title">公司驾驶舱</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              aria-label="搜索项目"
              placeholder="搜索项目"
              className="h-11 w-full rounded-2xl border-slate-200 bg-white sm:w-72"
            />
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing ? 'animate-spin' : null)} />
              {isRefreshing ? '刷新中' : '刷新'}
            </Button>
            <Button onClick={onCreate} className="h-11 gap-2 px-5">
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
            {draftBadge}
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div
          data-testid="company-health-overview"
          className={cn('rounded-2xl border px-5 py-5 shadow-sm', overviewToneClass(healthScore, attentionProjectCount))}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="text-xs font-semibold text-slate-500">组合信号概览</div>
              <div className="shell-section-title text-slate-950">{overviewTitle}</div>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                {summaryReady
                  ? '系统根据项目进度、节点、风险和提醒信号生成排查顺序；具体原因请进入对应项目继续核查。'
                  : '等待公司汇总口径返回完整字段后展示。'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={cn('rounded-full px-3 py-1 text-xs font-medium', healthPillClass(healthScore))}>
                {healthPillLabel(healthScore)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
                组合信号 {displayMetric(summaryReady, stats.averageHealth)} 分
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
                {summaryReady ? formatDelta(healthHistory.change) : '摘要加载中'}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
                项目 {displayMetric(summaryReady, stats.total)} 个
              </span>
            </div>
          </div>

          <div data-testid="company-hero-evidence-chips" className="mt-5 flex flex-wrap gap-2">
            {evidenceItems.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-200/80"
              >
                <span>{item.label}</span>
                <span className="num-mono font-semibold text-slate-900">{item.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
