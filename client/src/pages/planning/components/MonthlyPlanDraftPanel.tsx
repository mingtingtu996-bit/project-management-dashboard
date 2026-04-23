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
  { key: 'L1', title: '项目目标层', helper: '统一展示项目级目标、月份范围和草稿状态。' },
  { key: 'L2', title: '月度拆解层', helper: '按月份拆解本期要兑现的工作。' },
  { key: 'L3', title: '执行任务层', helper: '展示本月任务与节点的执行明细。' },
  { key: 'L4', title: '条件 / 阻碍摘要', helper: '将条件未满足与阻碍项汇总到确认前复核。' },
  { key: 'L5', title: '确认前检查', helper: '确认前统一检查延期、异常和需要补录的事项。' },
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
            <p className="text-sm leading-6 text-slate-600">
              这里集中展示月度计划草稿结构、异常摘要和确认前复核入口，方便先完成当月编排再进入确认。
            </p>
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
                <p className="text-xs leading-5 text-slate-500">{layer.helper}</p>
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
