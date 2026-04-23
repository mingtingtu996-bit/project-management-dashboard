import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AlertTriangle, Info, ShieldAlert, LocateFixed } from 'lucide-react'

import { usePlanningStore, type PlanningValidationIssue } from '@/hooks/usePlanningStore'

type ValidationLevel = PlanningValidationIssue['level']

interface ValidationGroup {
  level: ValidationLevel
  label: string
  helper: string
  perItemMinutes: number
  badgeClassName: string
  icon: typeof ShieldAlert
  issues: PlanningValidationIssue[]
}

interface BaselineValidationPanelProps {
  issues: PlanningValidationIssue[]
  emptyLabel?: string
}

const LEVEL_META: Record<ValidationLevel, Omit<ValidationGroup, 'issues' | 'icon'>> = {
  error: {
    level: 'error',
    label: '阻断级',
    helper: '必须先修正，才能继续发布。',
    perItemMinutes: 30,
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  warning: {
    level: 'warning',
    label: '建议级',
    helper: '建议优先处理，减少后续返工。',
    perItemMinutes: 15,
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  info: {
    level: 'info',
    label: '信息级',
    helper: '用于辅助说明和补充提示。',
    perItemMinutes: 5,
    badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700',
  },
}

const LEVEL_ICON: Record<ValidationLevel, typeof ShieldAlert> = {
  error: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
}

function formatMinutes(value: number) {
  return `${value} 分钟`
}

function groupIssues(issues: PlanningValidationIssue[]) {
  return (['error', 'warning', 'info'] as ValidationLevel[]).map((level) => ({
    ...LEVEL_META[level],
    icon: LEVEL_ICON[level],
    issues: issues.filter((issue) => issue.level === level),
  }))
}

function buildProcessingSummary(group: ValidationGroup) {
  if (group.issues.length === 0) return '暂无待处理项'
  const titles = group.issues.slice(0, 2).map((issue) => issue.title)
  const moreLabel = group.issues.length > 2 ? `等 ${group.issues.length} 项` : `共 ${group.issues.length} 项`
  return `处理摘要：${titles.join('、')}${group.issues.length > 2 ? '……' : ''}${moreLabel}`
}

function locateTreeRow(issueId: string, setSelectedItemIds: (ids: string[]) => void) {
  setSelectedItemIds([issueId])
  const target = document.querySelector<HTMLElement>(`[aria-label="toggle-${issueId}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target?.focus?.()
}

export function BaselineValidationPanel({ issues, emptyLabel = '当前没有待处理的校核项' }: BaselineValidationPanelProps) {
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)

  const groups = useMemo(() => groupIssues(issues), [issues])
  const totalCount = issues.length
  const blockingCount = groups[0]?.issues.length ?? 0
  const warningCount = groups[1]?.issues.length ?? 0
  const infoCount = groups[2]?.issues.length ?? 0

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">异常校核区</CardTitle>
            <p className="text-sm leading-6 text-slate-600">
              先处理阻断级，再处理建议级，最后看信息级，保持基线冻结前的校核顺序。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="destructive">{blockingCount} 阻断</Badge>
            <Badge variant="secondary">{warningCount} 建议</Badge>
            <Badge variant="outline">{infoCount} 信息</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/80 px-3 py-2 text-sm text-cyan-900">
          <LocateFixed className="h-4 w-4" />
          <span>处理必须修正项</span>
          <span className="text-cyan-500">-&gt;</span>
          <span>处理建议修正项</span>
          <span className="text-cyan-500">-&gt;</span>
          <span>确认并发布</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {totalCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : (
          groups.map((group) => {
            const Icon = group.icon
            const estimatedMinutes = group.issues.length * group.perItemMinutes
            return (
              <section
                key={group.level}
                data-testid={`baseline-validation-group-${group.level}`}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
                      <Badge variant="outline" className={cn('font-normal', group.badgeClassName)}>
                        {group.issues.length} 项
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{group.helper}</p>
                    <p className="text-xs text-slate-500">{buildProcessingSummary(group)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-right">
                    <div className="text-xs text-slate-500">预计处理时间</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      预计处理 {group.perItemMinutes} 分钟/项
                    </div>
                    <div className="text-xs text-slate-500">合计 {formatMinutes(estimatedMinutes)}</div>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  {group.issues.map((issue) => {
                    const isSelected = selectedItemIds.includes(issue.id)
                    return (
                      <div
                        key={issue.id}
                        data-testid={`baseline-validation-issue-${issue.id}`}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition',
                          isSelected
                            ? 'border-cyan-300 bg-cyan-50/60 shadow-sm'
                            : 'border-slate-200 bg-slate-50/50 hover:border-cyan-200 hover:bg-slate-50',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{issue.title}</span>
                            <Badge variant="outline" className={group.badgeClassName}>
                              {group.label}
                            </Badge>
                          </div>
                          {issue.detail ? <p className="mt-1 text-sm leading-6 text-slate-600">{issue.detail}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-xs text-slate-500">定位回跳</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => locateTreeRow(issue.id, setSelectedItemIds)}
                          >
                            <LocateFixed className="h-3.5 w-3.5" />
                            定位到树中
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export default BaselineValidationPanel
