import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

interface PlanningAnomalyPanelProps {
  status: 'loading' | 'ready' | 'error'
  anomalies: Array<{
    id: string
    title: string
    detail: string
  }>
  errorMessage?: string | null
  onOpenDetail: () => void
  onGoProcess: () => void
}

export function PlanningAnomalyPanel({
  status,
  anomalies,
  errorMessage,
  onOpenDetail,
  onGoProcess,
}: PlanningAnomalyPanelProps) {
  const empty = status === 'ready' && anomalies.length === 0
  const statusLabel = status === 'loading' ? '同步中' : status === 'error' ? '暂不可用' : empty ? '无异常' : `${anomalies.length} 项异常`

  return (
    <Card data-testid="planning-anomaly-panel" className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">异常治理</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {status === 'loading'
                ? '正在读取异常扫描结果...'
                : status === 'error'
                  ? errorMessage || '当前无法读取异常治理结果。'
                  : '被动重排、治理异常和需要处理的系统信号会集中显示在这里。'}
            </p>
          </div>
          <Badge variant={status === 'error' ? 'destructive' : empty ? 'outline' : 'secondary'}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {status === 'loading' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            <div>
              <div className="font-medium text-slate-800">正在扫描异常</div>
              <div className="mt-1">治理后端仍在扫描被动重排与系统异常，请稍后查看结果。</div>
            </div>
          </div>
        ) : status === 'error' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <div>
              <div className="font-medium text-rose-900">异常扫描暂不可用</div>
              <div className="mt-1">{errorMessage || '请重新校核，或稍后再试。'}</div>
            </div>
          </div>
        ) : empty ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            <div>
              <div className="font-medium text-slate-800">当前无异常</div>
              <div className="mt-1">本次扫描没有发现需要立即处理的治理异常。</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div key={anomaly.id} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-sm font-medium text-rose-900">{anomaly.title}</div>
                <div className="text-xs leading-5 text-rose-700">{anomaly.detail}</div>
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

export default PlanningAnomalyPanel
