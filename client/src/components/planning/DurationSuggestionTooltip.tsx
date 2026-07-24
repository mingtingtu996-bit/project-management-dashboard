import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'

import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  getDurationSuggestion,
  type DurationSuggestion,
  type DurationSuggestionQuery,
} from '@/services/durationSuggestionsApi'

function readDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readGovernedReferenceDays(suggestion: DurationSuggestion | null) {
  const outputCode = String(suggestion?.durationOutputCode ?? '').trim()
  if (outputCode === 'contextual_reference') return readDays(suggestion?.contextualReferenceDays)
  if (outputCode === 'plan_reference') return readDays(suggestion?.planReferenceDays)
  if (outputCode === 'remaining_forecast') return readDays(suggestion?.remainingForecastDays)
  return null
}

function confidenceLabel(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'high') return '高'
  if (normalized === 'medium') return '中等'
  if (normalized === 'low') return '较低'
  if (normalized === 'data_pending') return '待补齐'
  return '不可用'
}

type DurationReferenceKind = 'standard' | 'project_rhythm' | 'monthly_target' | 'package_child_window'

function resolveReferenceKind(
  suggestion: DurationSuggestion | null,
  query?: DurationSuggestionQuery | null,
): DurationReferenceKind {
  if (query?.suggestionPurpose === 'monthly_commitment_window') return 'monthly_target'
  const source = String(suggestion?.forecastSource ?? '').toLowerCase()
  const availability = suggestion?.factorAvailability ?? {}
  const reasonCodes = new Set((suggestion?.businessReasonCodes ?? []).map((item) => String(item).trim()))
  const params = suggestion?.businessReasonParams ?? {}
  if (
    suggestion?.durationBoundaryRole === 'package_child_window'
    || suggestion?.nonAdditiveWithParentDuration
    || availability.package_child_duration_window
    || reasonCodes.has('PACKAGE_CHILD_DURATION_WINDOW')
    || params.nonAdditiveWithParentDuration === true
  ) {
    return 'package_child_window'
  }
  if (
    source.includes('project_execution_context')
    || availability.project_execution_context
    || availability.similar_task_rhythm
    || availability.project_environment_buffer
    || reasonCodes.has('PROJECT_SIMILAR_TASK_RHYTHM')
    || reasonCodes.has('PROJECT_ENVIRONMENT_BUFFER')
  ) {
    return 'project_rhythm'
  }
  return 'standard'
}

function referenceKindLabel(kind: DurationReferenceKind) {
  if (kind === 'package_child_window') return '标准参考工期'
  if (kind === 'project_rhythm') return '项目节奏参考'
  if (kind === 'monthly_target') return '目标窗口参考'
  return '标准参考工期'
}

function buildBusinessSummary(suggestion: DurationSuggestion | null, days: number | null, kind: DurationReferenceKind) {
  if (!suggestion) return null
  if (suggestion.displaySummary && kind !== 'project_rhythm' && kind !== 'package_child_window') return suggestion.displaySummary
  if (!days) return suggestion.businessReason ? `暂无参考工期；${suggestion.businessReason}` : '暂无参考工期；当前数据不足，先由用户填写。'

  const conservative = readDays(suggestion.conservativeDurationDays)
  const reserveText = conservative && conservative > days ? `，建议预留 ${conservative} 天` : ''
  const reason = suggestion.businessReason ? `，因为${suggestion.businessReason.replace(/[。.]$/, '')}` : ''
  if (kind === 'package_child_window') {
    const params = suggestion.businessReasonParams ?? {}
    const parentTitle = String(suggestion.parentTaskTitle ?? params.parentTaskTitle ?? '').trim()
    const parentDays = readDays(suggestion.parentReferenceDurationDays ?? params.parentReferenceDurationDays)
    const rhythmStart = readDays(params.rhythmWindowStartDay ?? suggestion.packageChildRhythmWindowStartDay)
    const rhythmEnd = readDays(params.rhythmWindowEndDay ?? suggestion.packageChildRhythmWindowEndDay)
    const rhythmText = rhythmStart && rhythmEnd ? `（第 ${rhythmStart}-${rhythmEnd} 天）` : ''
    const parentText = parentTitle ? `父级“${parentTitle}”` : '父级工期'
    const parentDaysText = parentDays ? `，${parentText}窗口 ${parentDays} 天` : ''
    return `参考工期 ${days} 天${rhythmText}，已纳入${parentText}计划窗口${parentDaysText}${reserveText}；计划表以父级包窗口为约束，可信度${confidenceLabel(suggestion.confidenceLevel)}${reason}。`
  }
  if (kind === 'project_rhythm') return `项目节奏参考 · 参考工期 ${days} 天，已参考本项目施工节奏${reserveText}；可信度${confidenceLabel(suggestion.confidenceLevel)}${reason}。`
  if (kind === 'monthly_target') return `本月目标需 ${days} 天${reserveText}；可信度${confidenceLabel(suggestion.confidenceLevel)}${reason}。`
  return `参考 ${days} 天${reserveText}；可信度${confidenceLabel(suggestion.confidenceLevel)}${reason}。`
}

function buildRiskRangeLabel(suggestion: DurationSuggestion | null) {
  if (!suggestion) return null
  const range = readRecord(suggestion.durationRiskRange)
  const p20 = readDays(suggestion.riskP20DurationDays ?? range.p20Days ?? range.p20_days)
  const p50 = readDays(suggestion.riskP50DurationDays ?? range.p50Days ?? range.p50_days)
  const p80 = readDays(suggestion.riskP80DurationDays ?? range.p80Days ?? range.p80_days)
  if (!p20 && !p50 && !p80) return null
  const baselineDays = p50 ?? p20
  if (baselineDays && p80 && p80 > baselineDays) return `建议预留 ${p80 - baselineDays} 天`
  return '已完成评估'
}

function buildMutationBoundaryLabel(suggestion: DurationSuggestion | null) {
  const range = readRecord(suggestion?.durationRiskRange)
  const boundary = String(range.mutationBoundary ?? range.mutation_boundary ?? '').trim().toLowerCase()
  const evidenceLevel = String(range.evidenceLevel ?? range.evidence_level ?? '').trim().toLowerCase()
  if (
    boundary.includes('candidate_only')
    || evidenceLevel.includes('candidate')
  ) {
    if (boundary.includes('no_runtime') || boundary.includes('no_production')) {
      return '候选证据，不自动写生产运行层'
    }
    return '候选证据，需复核后受控发布'
  }
  return null
}

function formatBenchmarkDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10).replace(/-/g, '/')
}

function benchmarkScopeLabel(scope: string | null | undefined) {
  if (scope === 'project') return '项目基准'
  if (scope === 'company') return '公司基准'
  if (scope === 'industry') return '行业基准'
  if (scope === 'global') return '全局基准'
  return '基准来源'
}

function benchmarkDayBasisLabel(dayBasis: string | null | undefined) {
  return dayBasis === 'construction_production_day' ? '施工生产日' : '生产日口径不可用'
}

function buildBenchmarkProvenanceLines(suggestion: DurationSuggestion | null) {
  const provenance = suggestion?.benchmarkProvenance
  if (!provenance) return null
  const lines: Array<{ kind: 'summary' | 'source' | 'reason'; text: string }> = []
  const generatedAt = formatBenchmarkDate(suggestion?.benchmarkGeneratedAt)
  const asOf = formatBenchmarkDate(suggestion?.benchmarkAsOf)
  const windowStart = formatBenchmarkDate(suggestion?.benchmarkWindowStart)
  if (generatedAt) lines.push({ kind: 'summary', text: `基准生成于 ${generatedAt}` })
  if (asOf) lines.push({ kind: 'summary', text: `数据截至 ${asOf}` })
  if (windowStart) lines.push({ kind: 'summary', text: `统计窗口自 ${windowStart}` })
  if (suggestion?.benchmarkProvenanceAvailability === 'partial') {
    lines.push({ kind: 'reason', text: '基准数据来源不完整' })
  } else if (suggestion?.benchmarkProvenanceAvailability === 'unavailable') {
    lines.push({ kind: 'reason', text: '基准数据时间不可用' })
  }
  for (const entry of provenance.entries) {
    const sampleText = entry.sampleCount == null ? '样本数不可用' : `${entry.sampleCount} 个样本`
    const versionText = entry.benchmarkVersion ?? '版本不可用'
    const weightText = entry.blendWeight == null ? '' : ` · ${Math.round(entry.blendWeight * 100)}%`
    const causeText = entry.causeSegment
      ? ` · ${entry.causeSegment.causeCode} ${entry.causeSegment.taxonomyVersion}`
      : ''
    lines.push({
      kind: 'source',
      text: `${benchmarkScopeLabel(entry.scope)} · ${sampleText} · ${versionText} · ${benchmarkDayBasisLabel(entry.dayBasis)}${weightText}${causeText}`,
    })
  }
  return lines
}

export interface DurationSuggestionTooltipProps {
  suggestion?: DurationSuggestion | null
  query?: DurationSuggestionQuery | null
  className?: string
  compact?: boolean
}

export function DurationSuggestionTooltip({
  suggestion,
  query,
  className,
  compact = false,
}: DurationSuggestionTooltipProps) {
  const [open, setOpen] = useState(false)
  const [remoteSuggestion, setRemoteSuggestion] = useState<DurationSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const queryKey = useMemo(() => JSON.stringify(query ?? null), [query])
  const isMonthlyCommitmentWindow = query?.suggestionPurpose === 'monthly_commitment_window'

  useEffect(() => {
    setRemoteSuggestion(null)
    setFailed(false)
  }, [queryKey])

  useEffect(() => {
    if (!open || remoteSuggestion) return undefined
    if (suggestion || !query || (!query.taskId && !query.templateNodeId && !query.standardWorkCode && !query.taskTitle)) return undefined

    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    getDurationSuggestion(query, { signal: controller.signal })
      .then((next) => setRemoteSuggestion(next))
      .catch((error) => {
        if ((error as Error)?.name !== 'AbortError') setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [open, query, queryKey, remoteSuggestion, suggestion])

  const resolved = suggestion ?? remoteSuggestion
  const days = readGovernedReferenceDays(resolved ?? null)
  const referenceKind = resolveReferenceKind(resolved ?? null, query)
  const businessSummary = buildBusinessSummary(resolved ?? null, days, referenceKind)
  const riskRangeLabel = buildRiskRangeLabel(resolved ?? null)
  const mutationBoundaryLabel = buildMutationBoundaryLabel(resolved ?? null)
  const benchmarkProvenanceLines = buildBenchmarkProvenanceLines(resolved ?? null)
  const canFetchRemote = Boolean(query && (query.taskId || query.templateNodeId || query.standardWorkCode || query.taskTitle))
  const basis = isMonthlyCommitmentWindow
    ? 'production'
    : 'reference'

  if (!days && !loading && !failed && !resolved && !canFetchRemote) return null

  const triggerText = loading
    ? isMonthlyCommitmentWindow ? '读取本月目标...' : '读取工期智能参考...'
    : failed
      ? isMonthlyCommitmentWindow ? '本月目标暂不可用' : '工期智能参考暂不可用'
      : days
          ? isMonthlyCommitmentWindow
          ? `本月目标需 ${days} 天`
          : referenceKind === 'package_child_window'
            ? `参考工期 ${days} 天`
          : referenceKind === 'project_rhythm'
            ? `项目节奏参考 · 参考工期 ${days} 天`
            : `参考工期 ${days} 天`
        : resolved
          ? isMonthlyCommitmentWindow ? '本月目标待判断' : '暂无参考工期'
          : isMonthlyCommitmentWindow ? '本月目标' : '工期智能参考'

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700',
            compact && 'px-1',
            className,
          )}
        >
          <Info className="h-3 w-3" />
          {days ? <DurationBasisBadge basis={basis} compact variant="outline" className="bg-white/70" /> : null}
          {triggerText}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {resolved ? (
          <div className="space-y-1 text-xs leading-5 text-slate-100">
            <div className="font-medium">工期智能参考 · {referenceKindLabel(referenceKind)}</div>
            <div>{businessSummary}</div>
            {riskRangeLabel ? <div>工期风险 {riskRangeLabel}</div> : null}
            {mutationBoundaryLabel ? <div>{mutationBoundaryLabel}</div> : null}
            {benchmarkProvenanceLines?.map((line, index) => (
              <div key={`${line.kind}-${index}`} className={line.kind === 'reason' ? 'text-amber-200' : undefined}>
                {line.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs">{failed ? '工期智能参考暂不可用，请稍后再试。' : '正在读取工期智能参考...'}</div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export default DurationSuggestionTooltip
