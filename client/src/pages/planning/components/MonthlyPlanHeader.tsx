import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { PlanningDraftStatus } from '@/hooks/usePlanningStore'
import { CalendarDays, Layers3, TimerReset } from 'lucide-react'

interface MonthlyPlanHeaderProps {
  draftStatus: PlanningDraftStatus
  selectedCount: number
  quickAvailable?: boolean
  monthLabel?: string
}

const DRAFT_STATUS_LABELS: Record<PlanningDraftStatus, string> = {
  idle: '待生成',
  editing: '编辑中',
  dirty: '待暂存',
  saving: '暂存中',
  locked: '只读查看',
}

export function MonthlyPlanHeader({
  draftStatus,
  selectedCount,
  quickAvailable = false,
  monthLabel = '当前月份',
}: MonthlyPlanHeaderProps) {
  return (
    <Card data-testid="monthly-plan-header" className="surface-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Layers3 className="h-3.5 w-3.5" />
                L1-L5
              </Badge>
              <Badge variant="outline">{monthLabel} 计划表</Badge>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">月度计划</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              状态 {DRAFT_STATUS_LABELS[draftStatus]}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <TimerReset className="h-3.5 w-3.5" />
              已选 {selectedCount} 项
            </Badge>
            <Badge variant={quickAvailable ? 'secondary' : 'outline'}>
              {quickAvailable ? '可确认' : '需复核'}
            </Badge>
          </div>
        </div>

        <div data-testid="monthly-plan-status-strip" className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
            <div className="text-xs font-medium text-blue-700">计划条目</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              进入 {monthLabel} 承诺校核
            </div>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
            <div className="text-xs font-medium text-rose-700">计划日期</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              仅校核 {monthLabel} 计划日期
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
            <div className="text-xs font-medium text-amber-700">目标进度</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              不混入执行阻碍
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default MonthlyPlanHeader
