import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanningDraftStatus, PlanningValidationIssue } from '@/hooks/usePlanningStore'
import MonthlyPlanExceptionSummary from './MonthlyPlanExceptionSummary'

interface MonthlyPlanDraftPanelProps {
  draftStatus: PlanningDraftStatus
  selectedCount: number
  validationIssues: PlanningValidationIssue[]
  canQuickConfirm: boolean
}

const monthlyLayers = [
  { key: 'L1', title: '项目目标层' },
  { key: 'L2', title: '月度拆解层' },
  { key: 'L3', title: '执行任务层' },
  { key: 'L4', title: '条件 / 阻碍摘要' },
  { key: 'L5', title: '确认前检查' },
] as const

export function MonthlyPlanDraftPanel({
  draftStatus,
  selectedCount,
  validationIssues,
  canQuickConfirm,
}: MonthlyPlanDraftPanelProps) {
  return (
    <Card data-testid="monthly-plan-draft-panel" className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-2 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">草稿编辑区</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">草稿状态 {draftStatus}</Badge>
            <Badge variant="secondary">已选 {selectedCount} 项</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          {monthlyLayers.map((layer) => (
            <div
              key={layer.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{layer.key}</Badge>
                  <span className="font-medium text-slate-900">{layer.title}</span>
                </div>
              </div>
              <div className="h-2 w-24 rounded-full bg-slate-200/80" aria-hidden="true" />
            </div>
          ))}
        </div>

        <MonthlyPlanExceptionSummary issues={validationIssues} canQuickConfirm={canQuickConfirm} />
      </CardContent>
    </Card>
  )
}

export default MonthlyPlanDraftPanel
