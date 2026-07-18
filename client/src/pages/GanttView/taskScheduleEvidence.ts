import type { Task } from '../GanttViewTypes'
import type { DurationSuggestion } from '@/services/durationSuggestionsApi'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function readRoundedFiniteNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? Math.round(numberValue) : null
}

function readTruthyFlag(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', '1', 'yes'].includes(normalized)
}

function formatClimateSignal(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'rainy_season') return '雨季'
  if (normalized === 'winter_season') return '冬季'
  if (normalized === 'high_temperature') return '高温'
  if (normalized === 'typhoon_season') return '台风季'
  return String(value ?? '').trim() || '已应用'
}

function readTaskDurationSuggestion(task: Pick<Task, 'standard_task_metadata'> & Record<string, unknown>) {
  const directSuggestion = readRecord(task.durationSuggestion ?? task.duration_suggestion)
  if (Object.keys(directSuggestion).length > 0) return directSuggestion as unknown as DurationSuggestion

  const metadata = readRecord(task.standard_task_metadata)
  const metadataSuggestion = readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
  return Object.keys(metadataSuggestion).length > 0
    ? metadataSuggestion as unknown as DurationSuggestion
    : null
}

export type TaskSequencingBasis = 'execution_phase_order_fallback' | 'heuristic_stagger'

export function getTaskSequencingBasis(task: Pick<Task, 'standard_task_metadata'>): TaskSequencingBasis | null {
  const metadata = readRecord(task.standard_task_metadata)
  const basis = String(metadata.sequencingBasis ?? metadata.sequencing_basis ?? '').trim()
  return basis === 'execution_phase_order_fallback' || basis === 'heuristic_stagger'
    ? basis
    : null
}

export function getTaskDurationRiskRangeLabel(task: Pick<
  Task,
  'duration_risk_p20_days' | 'duration_risk_p50_days' | 'duration_risk_p80_days' | 'duration_risk_range' | 'standard_task_metadata'
>) {
  const range = readRecord(task.duration_risk_range)
  const metadata = readRecord(task.standard_task_metadata)
  const suggestion = readRecord(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const suggestionRange = readRecord(suggestion.durationRiskRange ?? suggestion.duration_risk_range)
  const p20 = readRoundedFiniteNumber(
    task.duration_risk_p20_days
      ?? range.p20_days
      ?? range.p20Days
      ?? suggestion.riskP20DurationDays
      ?? suggestion.risk_p20_duration_days
      ?? suggestionRange.p20Days
      ?? suggestionRange.p20_days,
  )
  const p50 = readRoundedFiniteNumber(
    task.duration_risk_p50_days
      ?? range.p50_days
      ?? range.p50Days
      ?? suggestion.riskP50DurationDays
      ?? suggestion.risk_p50_duration_days
      ?? suggestionRange.p50Days
      ?? suggestionRange.p50_days,
  )
  const p80 = readRoundedFiniteNumber(
    task.duration_risk_p80_days
      ?? range.p80_days
      ?? range.p80Days
      ?? suggestion.riskP80DurationDays
      ?? suggestion.risk_p80_duration_days
      ?? suggestionRange.p80Days
      ?? suggestionRange.p80_days,
  )
  const baselineDays = p50 ?? p20
  if (baselineDays !== null && p80 !== null && p80 > baselineDays) {
    return `建议预留 ${p80 - baselineDays} 天`
  }
  return p20 !== null || p50 !== null || p80 !== null ? '工期风险已评估' : ''
}

export function getTaskCriticalFloatLabel(task: Pick<Task, 'is_critical' | 'total_float_days' | 'free_float_days'>) {
  const totalFloatDays = readRoundedFiniteNumber(task.total_float_days)
  const freeFloatDays = readRoundedFiniteNumber(task.free_float_days)
  const parts = [
    totalFloatDays !== null ? `总浮时 ${totalFloatDays} 天` : null,
    freeFloatDays !== null ? `自由浮时 ${freeFloatDays} 天` : null,
  ].filter(Boolean)
  if (parts.length > 0) return parts.join(' / ')
  return task.is_critical ? '关键路径' : ''
}

export function getTaskDurationAssetEvidenceLabel(task: Pick<Task, 'standard_task_metadata'>) {
  const metadata = readRecord(task.standard_task_metadata)
  const calculation = readRecord(metadata.durationAssetCalculation ?? metadata.duration_asset_calculation)
  const evidence: string[] = []
  const calendarBasis = String(metadata.calendarBasis ?? metadata.calendar_basis ?? '').trim()
  const calendarWindowCount = readRoundedFiniteNumber(metadata.constructionCalendarWindowCount ?? metadata.construction_calendar_window_count)

  if ((calendarBasis && calendarBasis !== 'calendar_day') || (calendarWindowCount ?? 0) > 0) {
    evidence.push(calendarWindowCount !== null ? `施工日历 ${calendarWindowCount} 个窗口` : '施工日历 已应用')
  }

  if (readTruthyFlag(calculation.runtimeReferenceDaysConsumed ?? calculation.runtime_reference_days_consumed)) {
    const runtimeP50 = readRoundedFiniteNumber(calculation.runtimeReferenceDaysP50Days ?? calculation.runtime_reference_days_p50_days)
    evidence.push(runtimeP50 !== null ? `运行样本 ${runtimeP50} 天` : '运行样本 已应用')
  }

  if (readTruthyFlag(calculation.processSeasonalDurationAssetConsumed ?? calculation.process_seasonal_duration_asset_consumed)) {
    evidence.push(`季节修正 ${formatClimateSignal(calculation.processSeasonalClimateSignal ?? calculation.process_seasonal_climate_signal)}`)
  }

  return evidence.join('；')
}

export function withTaskScheduleEvidence<TTask extends Task>(task: TTask) {
  const durationSuggestion = readTaskDurationSuggestion(task as TTask & Record<string, unknown>)

  return {
    ...task,
    ...(durationSuggestion ? { durationSuggestion } : {}),
    sequencingBasis: getTaskSequencingBasis(task),
    durationRiskRangeLabel: getTaskDurationRiskRangeLabel(task),
    criticalFloatLabel: getTaskCriticalFloatLabel(task),
    durationAssetEvidenceLabel: getTaskDurationAssetEvidenceLabel(task),
  }
}
