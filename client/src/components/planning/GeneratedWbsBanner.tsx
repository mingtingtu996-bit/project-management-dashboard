// v1.4.22.1 - Banner shown after WBS generation on PlanningTreeTable.
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Rocket, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatDurationMetric, readAvailableDurationValue } from '@/lib/durationMetric'
import type { WbsTargetFeasibility } from '@/services/wbsTemplateGenerationApi'

interface Props {
  businessType?: string
  methodCodes?: string[]
  featureSummary?: string
  generatedCount: number
  templateCount?: number
  warningCount?: number
  startingLineSummary?: string
  detailLevel?: 'overview' | 'standard' | 'detailed'
  onSaveConfirm: () => void
  onDiscard: () => void
  onSwitchDetailLevel?: (level: 'overview' | 'standard' | 'detailed') => void
  onShowRationale?: () => void
  targetFeasibility?: WbsTargetFeasibility | null
  onRequestAccelerationProposal?: () => void
}

function detailLevelLabel(level: Props['detailLevel']) {
  if (level === 'detailed') return '精细级'
  if (level === 'standard') return '标准级'
  return '概览级'
}

export function GeneratedWbsBanner({
  businessType,
  methodCodes,
  featureSummary,
  generatedCount,
  templateCount,
  warningCount,
  startingLineSummary,
  detailLevel,
  onSaveConfirm,
  onDiscard,
  onSwitchDetailLevel,
  onShowRationale,
  targetFeasibility,
  onRequestAccelerationProposal,
}: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const overshootValue = readAvailableDurationValue(targetFeasibility?.overshoot, 'calendar_day')
  const unrecoverableValue = readAvailableDurationValue(targetFeasibility?.unrecoverable, 'construction_production_day')
  const showTargetWarning = Boolean(targetFeasibility && overshootValue !== null && overshootValue > 0)
  const sourceLabel = [businessType ?? '未知业态', ...(methodCodes ?? []), featureSummary].filter(Boolean).join(' + ')

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50 px-6 py-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-slate-900">
              已基于「{sourceLabel}」生成 {generatedCount} 行 WBS
            </span>
          </div>
          {(templateCount !== undefined || warningCount !== undefined) ? (
            <p className="text-xs text-slate-600 tabular-nums">
              推荐组合包：{businessType?.toUpperCase() ?? ''}_RECOMMENDED · {templateCount ?? 0} 个模板 · 含 {warningCount ?? 0} 项风险提示
            </p>
          ) : null}
          {startingLineSummary ? <p className="text-xs text-slate-600">{startingLineSummary}</p> : null}
        </div>
      </div>

      {showTargetWarning && targetFeasibility ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>目标工期偏紧</span>
              </div>
              <p className="text-xs leading-5 text-amber-900">
                自然排期预计 {targetFeasibility.naturalEndDate} 完工，超出目标 {formatDurationMetric(targetFeasibility.overshoot, { absolute: true })}；当前未自动压缩任务日期。
              </p>
              <p className="text-xs text-amber-800">
                可先生成赶工建议预览，再由项目负责人确认是否调整搭接、资源或交付范围。
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-xs tabular-nums">
                <span className="rounded-lg border border-amber-200 bg-white/70 px-2 py-0.5 text-amber-800">
                  可模拟追回约 {formatDurationMetric(targetFeasibility.recoverable, { absolute: true })}
                </span>
                {(unrecoverableValue ?? 0) > 0 ? (
                  <span className="rounded-lg border border-amber-200 bg-white/70 px-2 py-0.5 text-amber-800">
                    仍需决策 {formatDurationMetric(targetFeasibility.unrecoverable, { absolute: true })}
                  </span>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestAccelerationProposal}
              className="shrink-0 border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-100"
              disabled={!onRequestAccelerationProposal}
            >
              <Rocket className="h-3.5 w-3.5" />
              生成赶工建议
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button unstyled
          type="button"
          onClick={() => {
            setShowDetail(!showDetail)
            if (!showDetail && onShowRationale) onShowRationale()
          }}
          className="flex items-center gap-1 rounded text-xs text-blue-600 outline-none transition-colors hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          查看生成依据
        </Button>
        {showDetail ? (
          <div className="mt-2 space-y-1 rounded-lg bg-white/60 p-3 text-xs text-slate-600">
            <p>业态：{businessType}</p>
            {methodCodes?.map((method) => <p key={method}>工法：{method}</p>)}
            {featureSummary ? <p>特征：{featureSummary}</p> : null}
            <p>详细度：{detailLevelLabel(detailLevel)}</p>
            <p>生成行数：{generatedCount} 行</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-blue-200/50 pt-2">
        <div className="flex items-center gap-2">
          {onSwitchDetailLevel ? (
            <select
              value={detailLevel ?? 'overview'}
              onChange={(event) => onSwitchDetailLevel(event.target.value as 'overview' | 'standard' | 'detailed')}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="overview">概览级（约 120 行）</option>
              <option value="standard">标准级（约 400 行）</option>
              <option value="detailed">精细级（约 1500 行）</option>
            </select>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button unstyled
            type="button"
            onClick={onDiscard}
            className="rounded px-2 py-1 text-sm text-slate-500 underline outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            取消 / 重新生成
          </Button>
          <Button unstyled
            type="button"
            onClick={onSaveConfirm}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            保存并确认计划
          </Button>
        </div>
      </div>
    </div>
  )
}
