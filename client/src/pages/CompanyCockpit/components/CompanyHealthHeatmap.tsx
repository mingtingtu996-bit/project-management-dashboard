import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type HeatmapItem = {
  id: string
  name: string
  businessHealthScore: number | null
  progress: number | null
  statusLabel: string
}

interface CompanyHealthHeatmapProps {
  items: HeatmapItem[]
  averageHealth: number
  lowHealthProjectCount: number
  totalItemCount?: number
}

function getTileTone(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200/60'
  if (score >= 60) return 'border-blue-200 bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200/60'
  if (score >= 40) return 'border-amber-200 bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200/60'
  return 'border-red-200 bg-red-50 text-red-900 ring-1 ring-inset ring-red-200/60'
}

function getNullableTileTone(score: number | null) {
  return score === null
    ? 'border-slate-200 bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200/60'
    : getTileTone(score)
}

function getScoreBarColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-600'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function getNullableScoreBarColor(score: number | null) {
  return score === null ? 'bg-slate-300' : getScoreBarColor(score)
}

function compactProjectName(name: string) {
  const compact = name.trim()
  return compact.length > 12 ? `${compact.slice(0, 12)}…` : compact
}

export function CompanyHealthHeatmap({ items, averageHealth, lowHealthProjectCount, totalItemCount = items.length }: CompanyHealthHeatmapProps) {
  const sortedItems = [...items].sort((left, right) => (right.businessHealthScore ?? -1) - (left.businessHealthScore ?? -1))

  return (
    <Card className="surface-card">
      <CardContent padding="md" className="space-y-4">
        <CardHead
          eyebrow="信号摘要"
          title="项目健康分布"
          action={items.length > 0 ? (
            <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">组合信号 {averageHealth} 分</span>
              {lowHealthProjectCount > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">{lowHealthProjectCount} 项需重点核查</span>
              )}
            </div>
          ) : null}
        />
        <div>
            <p className="mt-1 text-xs leading-5 text-slate-500">展示优先级靠前项目的健康信号摘要，完整明细在下方项目列表查看。</p>
        </div>
        {sortedItems.length === 0 ? (
          <EmptyState
            title="暂无项目健康数据"
            description="项目健康信号形成后会在这里展示公司级分布摘要。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-white py-10"
          />
        ) : (
          <ChartAccessibleWrapper
            summary="项目健康信号数据"
            columns={['项目', '状态', '健康信号', '总体进度']}
            rows={sortedItems.map((item) => [
              item.name,
              item.statusLabel,
              item.businessHealthScore ?? '暂不可用',
              item.progress === null ? '暂不可用' : `${item.progress}%`,
            ])}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className={cn('rounded-xl border px-4 py-4 transition-colors', getNullableTileTone(item.businessHealthScore))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{compactProjectName(item.name)}</div>
                      <div className="mt-1 text-xs opacity-75">{item.statusLabel}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="num-display text-2xl leading-none">{item.businessHealthScore ?? '--'}</div>
                      <div className="mt-1 text-xs opacity-75">健康信号</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="h-[3px] rounded-full bg-white/60">
                      <div
                        className={`h-full rounded-full ${getNullableScoreBarColor(item.businessHealthScore)}`}
                        style={{ width: `${item.businessHealthScore === null ? 0 : Math.max(0, Math.min(100, item.businessHealthScore))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="opacity-75">总体进度</span>
                      <span className="font-medium">{item.progress === null ? '--' : `${item.progress}%`}</span>
                    </div>
                    <div className="h-[3px] rounded-full bg-white/60">
                      <div
                        className="h-full rounded-full bg-current opacity-40"
                        style={{ width: `${item.progress === null ? 0 : Math.max(0, Math.min(100, item.progress))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200/60">80+ 稳定</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-inset ring-blue-200/60">60-79 需跟踪</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-inset ring-amber-200/60">40-59 预警</span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-red-700 ring-1 ring-inset ring-red-200/60">40 以下 危险</span>
              </div>
              <div className="text-xs text-slate-500">
                已展示 {items.length} / {totalItemCount} 项
              </div>
            </div>
          </ChartAccessibleWrapper>
        )}
      </CardContent>
    </Card>
  )
}
