import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PlanningHealthPanelProps {
  status: 'loading' | 'ready' | 'error'
  score: number
  label: string
  summary: string
  breakdown: Array<{ label: string; value: string }>
  errorMessage?: string | null
  onOpenDetail: () => void
  onGoProcess: () => void
}

export function PlanningHealthPanel({
  status,
  score,
  label,
  summary,
  breakdown,
  errorMessage,
  onOpenDetail,
  onGoProcess,
}: PlanningHealthPanelProps) {
  const statusCopy =
    status === 'loading'
      ? '同步中'
      : status === 'error'
        ? '暂不可用'
        : label

  return (
    <Card data-testid="planning-health-panel" className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">健康评分</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {status === 'error' ? errorMessage || '当前无法读取健康评分。' : summary}
            </p>
          </div>
          <Badge variant={status === 'error' ? 'outline' : 'secondary'}>{statusCopy}</Badge>
        </div>
        <div className="text-3xl font-semibold text-slate-900">{status === 'loading' || status === 'error' ? '--' : score}</div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {status === 'loading' ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            正在读取健康评分...
          </div>
        ) : status === 'error' ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700">
            {errorMessage || '当前无法读取健康评分。'}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {breakdown.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenDetail}
            data-testid="planning-governance-open-detail"
          >
            查看详情
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onGoProcess}>
            前往处理
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default PlanningHealthPanel
