import { ChartAccessibleWrapper } from '@/components/ChartAccessibleWrapper'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type HeatmapItem = {
  id: string
  name: string
  healthScore: number
  progress: number
  statusLabel: string
}

interface CompanyHealthHeatmapProps {
  items: HeatmapItem[]
}

function getTileTone(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (score >= 60) return 'border-blue-200 bg-blue-50 text-blue-900'
  if (score >= 40) return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-red-200 bg-red-50 text-red-900'
}

function getScoreBarColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-600'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function compactProjectName(name: string) {
  const compact = name.trim()
  return compact.length > 12 ? `${compact.slice(0, 12)}…` : compact
}

export function CompanyHealthHeatmap({ items }: CompanyHealthHeatmapProps) {
  const sortedItems = [...items].sort((left, right) => right.healthScore - left.healthScore)
  const avgScore = items.length > 0
    ? Math.round(items.reduce((sum, item) => sum + item.healthScore, 0) / items.length)
    : 0
  const criticalCount = items.filter((item) => item.healthScore < 40).length
  const stableCount = items.filter((item) => item.healthScore >= 80).length

  return (
    <Card className="rounded-2xl border border-slate-100 bg-slate-50 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">健康热力分布</CardTitle>
            <p className="mt-1 text-xs leading-5 text-slate-500">按项目健康度查看公司层面的冷热分布。</p>
          </div>
          {items.length > 0 && (
            <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{avgScore} 分均值</span>
              {criticalCount > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">{criticalCount} 项预警</span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedItems.length === 0 ? (
          <EmptyState
            title="暂无项目健康数据"
            description="项目健康度形成后会在这里展示公司级热力分布。"
            className="rounded-2xl empty-state-frame border-slate-200 bg-white py-10"
          />
        ) : (
          <ChartAccessibleWrapper
            summary="健康热力数据"
            columns={['项目', '状态', '健康度', '总体进度']}
            rows={sortedItems.map((item) => [item.name, item.statusLabel, item.healthScore, `${item.progress}%`])}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border px-4 py-4 transition-colors ${getTileTone(item.healthScore)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{compactProjectName(item.name)}</div>
                      <div className="mt-1 text-xs opacity-75">{item.statusLabel}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-semibold leading-none">{item.healthScore}</div>
                      <div className="mt-1 text-xs opacity-75">健康度</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="h-1.5 rounded-full bg-white/60">
                      <div
                        className={`h-full rounded-full ${getScoreBarColor(item.healthScore)}`}
                        style={{ width: `${Math.max(0, Math.min(100, item.healthScore))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="opacity-75">总体进度</span>
                      <span className="font-medium">{item.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/60">
                      <div
                        className="h-full rounded-full bg-current opacity-40"
                        style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">80+ 稳定</span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">60-79 良好</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">40-59 关注</span>
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">40 以下 预警</span>
              </div>
              <div className="text-xs text-slate-500">
                稳定 {stableCount} · 预警 {criticalCount} · 共 {items.length} 项
              </div>
            </div>
          </ChartAccessibleWrapper>
        )}
      </CardContent>
    </Card>
  )
}
