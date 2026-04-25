import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PlanningValidationIssue } from '@/hooks/usePlanningStore'
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'

interface MonthlyPlanExceptionSummaryProps {
  issues: PlanningValidationIssue[]
  canQuickConfirm: boolean
  onOpenTasks?: () => void
  onOpenRisks?: () => void
}

function pickIssues(issues: PlanningValidationIssue[], keyword: string) {
  return issues.filter((issue) => issue.id.includes(keyword))
}

export function MonthlyPlanExceptionSummary({
  issues,
  canQuickConfirm,
  onOpenTasks = () => undefined,
  onOpenRisks = () => undefined,
}: MonthlyPlanExceptionSummaryProps) {
  const conditionIssues = pickIssues(issues, 'condition')
  const obstacleIssues = pickIssues(issues, 'obstacle')
  const delayIssues = pickIssues(issues, 'delay')

  const cards = [
    {
      key: 'conditions',
      testId: 'monthly-plan-exception-conditions',
      title: '当前条件',
      count: conditionIssues.length,
      tone: 'border-cyan-100 bg-cyan-50/70',
      iconTone: 'text-cyan-700',
      icon: CheckCircle2,
      emptyLabel: '当前月份未发现待补齐条件',
      actionLabel: '回到任务管理补条件',
      onAction: onOpenTasks,
      issues: conditionIssues,
    },
    {
      key: 'obstacles',
      testId: 'monthly-plan-exception-obstacles',
      title: '阻碍',
      count: obstacleIssues.length,
      tone: 'border-rose-100 bg-rose-50/70',
      iconTone: 'text-rose-700',
      icon: ShieldAlert,
      emptyLabel: '当前月份没有活跃阻碍',
      actionLabel: '前往风险与问题工作台',
      onAction: onOpenRisks,
      issues: obstacleIssues,
    },
    {
      key: 'delays',
      testId: 'monthly-plan-exception-delays',
      title: '延期摘要',
      count: delayIssues.length,
      tone: 'border-amber-100 bg-amber-50/70',
      iconTone: 'text-amber-700',
      icon: AlertTriangle,
      emptyLabel: '当前月份没有延期信号',
      actionLabel: '回到任务列表核对延期',
      onAction: onOpenTasks,
      issues: delayIssues,
    },
  ] as const

  return (
    <section data-testid="monthly-plan-exception-summary" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-900">条件 / 阻碍 / 延期摘要</div>
        </div>
        <Badge variant={canQuickConfirm ? 'secondary' : 'outline'} className="text-xs">
          {canQuickConfirm ? '快速确认可用' : '建议走标准路径'}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          const topIssue = card.issues[0]

          return (
            <Card key={card.key} data-testid={card.testId} className={`${card.tone} shadow-sm`}>
              <CardContent className="space-y-3 p-3">
                <div className={`flex items-center gap-2 ${card.iconTone}`}>
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{card.title}</span>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="text-lg font-semibold text-slate-900">{card.count}</div>
                  <div className="text-xs text-slate-500">
                    {card.count > 0 ? `最近命中 ${card.count} 项` : '当前为空'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
                  <div className="text-xs font-medium text-slate-700">{topIssue ? topIssue.title : card.emptyLabel}</div>
                  {topIssue?.detail ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">{topIssue.detail}</p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between rounded-xl bg-white/80"
                  onClick={card.onAction}
                  data-testid={`monthly-plan-exception-action-${card.key}`}
                >
                  {card.actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export default MonthlyPlanExceptionSummary
