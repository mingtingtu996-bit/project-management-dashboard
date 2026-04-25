import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PlanningIntegrityPanelProps {
  status: 'loading' | 'ready' | 'error'
  summary: {
    dataIssues: number
    mappingIssues: number
    systemIssues: number
    milestoneIssues: number
  }
  detail: string
  errorMessage?: string | null
  onOpenDetail: () => void
  onGoProcess: () => void
}

export function PlanningIntegrityPanel({
  status,
  summary,
  detail,
  errorMessage,
  onOpenDetail,
  onGoProcess,
}: PlanningIntegrityPanelProps) {
  const statusLabel = status === 'loading' ? '同步中' : status === 'error' ? '暂不可用' : '已完成'
  const errorBody = errorMessage || '完整性校核暂不可用'
  void detail

  return (
    <Card data-testid="planning-integrity-panel" className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">完整性校核</CardTitle>
          </div>
          <Badge variant={status === 'error' ? 'destructive' : 'outline'}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {status === 'loading' ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4" />
        ) : status === 'error' ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700">
            {errorBody}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Data integrity</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{summary.dataIssues} 项</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Mapping integrity</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{summary.mappingIssues} 项</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">System consistency</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{summary.systemIssues} 项</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">M1-M9</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{summary.milestoneIssues} 项</div>
            </div>
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

export default PlanningIntegrityPanel
