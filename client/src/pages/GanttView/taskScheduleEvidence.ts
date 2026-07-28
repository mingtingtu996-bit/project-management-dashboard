import type { Task } from '../GanttViewTypes'
import type { DurationSuggestion } from '@/services/durationSuggestionsApi'
import type { CriticalTaskNetworkSchedule } from '@/lib/criticalPath'
import { formatDurationMetric, formatDurationRiskReserve, normalizeDurationRiskDistribution } from '@/lib/durationMetric'

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
  const distribution = suggestion.durationRiskDistribution
    ?? suggestion.duration_risk_distribution
    ?? range.durationRiskDistribution
    ?? range.duration_risk_distribution
    ?? suggestionRange.durationRiskDistribution
    ?? suggestionRange.duration_risk_distribution
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
  return distribution || p20 !== null || p50 !== null || p80 !== null
    ? formatDurationRiskReserve(distribution)
    : ''
}

export function getTaskCriticalFloatLabel(
  task: Pick<Task, 'is_critical'>,
  criticalSchedule?: CriticalTaskNetworkSchedule | null,
) {
  if (criticalSchedule) {
    return [
      `总浮时 ${formatDurationMetric(criticalSchedule.float, { expectedUnit: 'construction_production_day', unavailableLabel: '生产日口径不可用' })}`,
      `自由浮时 ${formatDurationMetric(criticalSchedule.freeFloat, { expectedUnit: 'construction_production_day', unavailableLabel: '生产日口径不可用' })}`,
    ].join(' / ')
  }
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
    const distribution = normalizeDurationRiskDistribution(
      calculation.runtimeReferenceDaysDurationRiskDistribution
        ?? calculation.runtime_reference_days_duration_risk_distribution,
    )
    evidence.push(`运行样本 ${formatDurationMetric(distribution?.p50Duration, {
      expectedUnit: 'construction_production_day',
      unavailableLabel: '生产日口径不可用',
    })}`)
  }

  if (readTruthyFlag(calculation.processSeasonalDurationAssetConsumed ?? calculation.process_seasonal_duration_asset_consumed)) {
    evidence.push(`季节修正 ${formatClimateSignal(calculation.processSeasonalClimateSignal ?? calculation.process_seasonal_climate_signal)}`)
  }

  return evidence.join('；')
}

export function withTaskScheduleEvidence<TTask extends Task>(
  task: TTask,
  criticalSchedule?: CriticalTaskNetworkSchedule | null,
) {
  const durationSuggestion = readTaskDurationSuggestion(task as TTask & Record<string, unknown>)

  return {
    ...task,
    ...(durationSuggestion ? { durationSuggestion } : {}),
    sequencingBasis: getTaskSequencingBasis(task),
    durationRiskRangeLabel: getTaskDurationRiskRangeLabel(task),
    criticalFloatLabel: getTaskCriticalFloatLabel(task, criticalSchedule),
    durationAssetEvidenceLabel: getTaskDurationAssetEvidenceLabel(task),
  }
}
