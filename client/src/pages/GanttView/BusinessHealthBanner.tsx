import type { DataQualityProjectSummary, DataQualityPromptItem } from '@/services/dataQualityApi'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type BusinessHealthBannerProps = {
  summary: DataQualityProjectSummary | null
}

const RULE_CHIP_LABELS: Array<{ test: RegExp; label: string }> = [
  { test: /(SCOPE|ENGINEERING_SCOPE|BUILDING|FLOOR|ZONE|SECTION)/i, label: '施工范围缺失' },
  { test: /(DATE|WINDOW|SCHEDULE|BASELINE|START|END)/i, label: '计划日期异常' },
  { test: /(RESPONS|OWNER|ASSIGNEE|UNIT|PARTICIPANT)/i, label: '责任主体缺失' },
  { test: /(STATUS|COMPLETE|CLOSED|LIFECYCLE)/i, label: '任务状态异常' },
  { test: /(TYPE|WBS|NODE|CATEGORY)/i, label: '任务类型异常' },
  { test: /(PREDECESSOR|DEPENDENC|RELATION|CHAIN|LAG)/i, label: '前后关系异常' },
  { test: /(READINESS|CONDITION|OBSTACLE|BLOCK|EXECUTION)/i, label: '执行准备异常' },
  { test: /(ACTUAL|FACT|PROGRESS|SNAPSHOT|ANOMALY|JUMP|BURST|STUCK)/i, label: '实际事实异常' },
]

function getBusinessIssueLabel(item: DataQualityPromptItem) {
  const ruleCode = item.ruleCode || ''
  return RULE_CHIP_LABELS.find((rule) => rule.test.test(ruleCode))?.label ?? '业务健康异常'
}

export function BusinessHealthBanner({ summary }: BusinessHealthBannerProps) {
  if (!summary?.prompt || summary.prompt.count <= 0) return null

  return (
    <details
      data-testid="business-health-banner"
      className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-inset ring-sky-200"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
            业务健康
          </span>
          <span
            data-testid="gantt-data-quality-prompt-bar"
            className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-800"
          >
            {summary.prompt.count} 条数据待确认
          </span>
          <p className="min-w-[12rem] flex-1 truncate text-sm leading-6">{summary.prompt.summary}</p>
          <span className="text-xs font-medium text-sky-700">展开</span>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        {summary.prompt.items.map((item) => {
          const severityMeta = item.severity === 'critical'
            ? { label: '严重', tooltip: '影响关键路径或执行事实准确性', className: 'bg-red-50 text-red-700 border-red-200' }
            : item.severity === 'warning'
              ? { label: '中', tooltip: '可能导致计划判断或进度统计偏差', className: 'bg-amber-50 text-amber-700 border-amber-200' }
              : { label: '低', tooltip: 'ϺĲ', className: 'bg-slate-50 text-slate-700 border-slate-200' }

          return (
            <div key={item.id} className="rounded-xl border border-sky-100 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">{item.taskTitle}</div>
                <span className="inline-flex items-center rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                  {getBusinessIssueLabel(item)}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`inline-flex cursor-help items-center rounded-full border px-2 py-0.5 text-xs font-medium ${severityMeta.className}`}>
                      {severityMeta.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{severityMeta.tooltip}</TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-700">{item.summary}</div>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export const GanttDataQualityPrompt = BusinessHealthBanner

export default BusinessHealthBanner
