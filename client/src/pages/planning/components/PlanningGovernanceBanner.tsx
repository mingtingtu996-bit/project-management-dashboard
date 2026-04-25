import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react'

interface PlanningGovernanceBannerProps {
  status: 'loading' | 'ready' | 'error'
  score: number
  label: string
  summary: string
  muted?: boolean
  errorMessage?: string | null
  onOpenDetail: () => void
  onRecheck: () => void
  onSnooze: () => void
}

const STATUS_LABELS: Record<PlanningGovernanceBannerProps['status'], string> = {
  loading: '同步中',
  ready: '已同步',
  error: '暂不可用',
}

export function PlanningGovernanceBanner({
  status,
  score,
  label,
  summary,
  muted = false,
  errorMessage,
  onOpenDetail,
  onRecheck,
  onSnooze,
}: PlanningGovernanceBannerProps) {
  const statusLabel = muted && status === 'ready' ? '已稍后处理' : STATUS_LABELS[status]
  const headline =
    status === 'loading'
      ? '正在获取治理快照'
      : status === 'error'
        ? '治理快照暂不可用'
        : `健康评分 ${score}`
  void label
  void summary
  void errorMessage

  return (
    <Card data-testid="planning-governance-banner" className="border-cyan-200 bg-slate-950 text-white shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-cyan-500/15 text-cyan-100">
              计划治理
            </Badge>
            <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-100">
              {statusLabel}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span className="text-sm font-medium text-slate-100">{headline}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
            onClick={onOpenDetail}
            data-testid="planning-governance-open-detail"
          >
            查看详情
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={onRecheck}
            data-testid="planning-governance-recheck"
          >
            <RefreshCw className="h-4 w-4" />
            重新校核
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={onSnooze}
            data-testid="planning-governance-snooze"
          >
            <Clock3 className="h-4 w-4" />
            稍后处理
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default PlanningGovernanceBanner
