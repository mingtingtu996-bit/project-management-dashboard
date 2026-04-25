import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { PlanningDraftStatus } from '@/hooks/usePlanningStore'
import { CalendarDays, Layers3, TimerReset } from 'lucide-react'

interface MonthlyPlanHeaderProps {
  draftStatus: PlanningDraftStatus
  selectedCount: number
  conditionCount?: number
  obstacleCount?: number
  delayCount?: number
  quickAvailable?: boolean
}

const DRAFT_STATUS_LABELS: Record<PlanningDraftStatus, string> = {
  idle: '待生成',
  editing: '编辑中',
  dirty: '待保存',
  saving: '保存中',
  locked: '只读查看',
}

export function MonthlyPlanHeader({
  draftStatus,
  selectedCount,
  conditionCount = 0,
  obstacleCount = 0,
  delayCount = 0,
  quickAvailable = false,
}: MonthlyPlanHeaderProps) {
  return (
    <Card data-testid="monthly-plan-header" className="border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Layers3 className="h-3.5 w-3.5" />
                L1-L5
              </Badge>
              <Badge variant="outline">月度计划框架</Badge>
              <Badge variant="outline">月度计划工作台</Badge>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">月度计划编制态</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              草稿状态 {DRAFT_STATUS_LABELS[draftStatus]}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <TimerReset className="h-3.5 w-3.5" />
              已选 {selectedCount} 项
            </Badge>
            <Badge variant={quickAvailable ? 'secondary' : 'outline'}>
              {quickAvailable ? '快速确认可用' : '建议走标准确认'}
            </Badge>
          </div>
        </div>

        <div data-testid="monthly-plan-status-strip" className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3">
            <div className="text-xs font-medium text-cyan-700">当前条件</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {conditionCount > 0 ? `${conditionCount} 项待补齐` : '当前条件已满足'}
            </div>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
            <div className="text-xs font-medium text-rose-700">阻碍</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {obstacleCount > 0 ? `${obstacleCount} 项处理中` : '当前无活跃阻碍'}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
            <div className="text-xs font-medium text-amber-700">延期摘要</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {delayCount > 0 ? `${delayCount} 项出现延期信号` : '当前无延期信号'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default MonthlyPlanHeader
