import { apiGet } from '@/lib/apiClient'
import { normalizeDurationMetricDto, type DurationMetricDto } from '@/lib/durationMetric'

export type ProgressDeviationMainlineKey = 'baseline' | 'monthly_plan' | 'execution'

export interface ProgressDeviationVersionLock {
  id: string
  project_id: string
  baseline_version_id: string
  resource_id: string
  locked_by?: string | null
  locked_at: string
  lock_expires_at: string
  is_locked: boolean
}

export interface ProgressDeviationTrendEvent extends Record<string, unknown> {
  event_type: 'baseline_version_switch'
  marker_type: 'vertical_line'
  switch_date: string
  from_version: string
  to_version: string
  explanation: string
}

export interface ProgressDeviationCauseEvidence extends Record<string, unknown> {
  /** @deprecated Use wait_duration. */
  wait_days?: number | string | null
  wait_duration: DurationMetricDto | null
}

export interface ProgressDeviationDelayReason extends Record<string, unknown> {
  /** @deprecated Use impact_duration. */
  impact_days?: number | null
  impact_duration: DurationMetricDto | null
}

export interface ProgressDeviationCauseChainItem extends Record<string, unknown> {
  id?: string
  cause_type: string
  affected_task_id?: string | null
  upstream_task_id?: string | null
  impacted_owner?: string | null
  accountable_owner?: string | null
  responsibility_basis?: string | null
  evidence_source?: string | null
  evidence_id?: string | null
  /** @deprecated Use impact_duration. */
  impact_days?: number | null
  impact_duration: DurationMetricDto | null
  confidence?: number | string | null
  evidence?: ProgressDeviationCauseEvidence | null
}

export interface ProgressDeviationRow extends Record<string, unknown> {
  id: string
  title: string
  mainline: ProgressDeviationMainlineKey
  source_task_id?: string | null
  planned_date?: string | null
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  /** @deprecated Use deviation_duration. */
  deviation_days?: number | null
  deviation_duration: DurationMetricDto | null
  deviation_rate: number
  status: string
  reason?: string | null
  merged_into?: { title: string; group_id?: string | null; item_ids?: string[] } | null
  child_group?: { parent_title: string; child_count: number; group_id?: string | null } | null
  attribution?: (Record<string, unknown> & {
    cause_chain?: ProgressDeviationCauseChainItem[]
    delay_reasons?: ProgressDeviationDelayReason[]
  }) | null
}

export interface ProgressDeviationMainline {
  key: ProgressDeviationMainlineKey
  label: string
  summary: {
    total_items: number
    deviated_items: number
    delayed_items: number
    unresolved_items: number
  }
  rows: ProgressDeviationRow[]
}

export interface ProgressDeviationMonthlyBucket {
  month: string
  on_track: number
  delayed: number
  carried_over: number
  revised: number
  unresolved: number
}

export interface ProgressDeviationResponsibilityContribution extends Record<string, unknown> {
  owner: string
  owner_id?: string | null
  count: number
  percentage: number
  task_ids: string[]
  causal_task_ids?: string[]
  basis?: string | null
  confidence?: number | null
  /** @deprecated Use impact_duration. */
  impact_days?: number | null
  impact_duration: DurationMetricDto | null
  weighted_count?: number | null
  weighted_percentage?: number | null
  evidence_sources?: string[]
  responsibility_role?: 'accountable_subject' | 'execution_owner' | 'impacted_subject' | string | null
}

export interface ProgressDeviationCauseSummary extends Record<string, unknown> {
  reason: string
  count: number
  percentage: number
  /** @deprecated Use impact_duration. */
  impact_days?: number | null
  impact_duration: DurationMetricDto | null
}

export interface ProgressDeviationChartData {
  baselineDeviation?: ProgressDeviationRow[]
  monthlyFulfillment?: ProgressDeviationMonthlyBucket[]
  executionDeviation?: ProgressDeviationRow[]
  monthly_buckets: ProgressDeviationMonthlyBucket[]
}

export interface ProgressDeviationAnalysisResponse extends Record<string, unknown> {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
  version_lock?: ProgressDeviationVersionLock | null
  summary: {
    total_items?: number
    deviated_items?: number
    carryover_items?: number
    unresolved_items?: number
    baseline_items?: number
    monthly_plan_items?: number
    execution_items?: number
  }
  rows: ProgressDeviationRow[]
  mainlines: ProgressDeviationMainline[]
  trend_events: ProgressDeviationTrendEvent[]
  chart_data?: ProgressDeviationChartData | null
  responsibility_contribution?: ProgressDeviationResponsibilityContribution[]
  top_deviation_causes?: ProgressDeviationCauseSummary[]
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null
}

function normalizeProductionDuration(value: unknown): DurationMetricDto | null {
  const metric = normalizeDurationMetricDto(value)
  return metric?.unit === 'construction_production_day' ? metric : null
}

function normalizeCauseEvidence(value: unknown): ProgressDeviationCauseEvidence | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    wait_duration: normalizeProductionDuration(raw.wait_duration),
  }
}

function normalizeDelayReason(value: unknown): ProgressDeviationDelayReason | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    impact_duration: normalizeProductionDuration(raw.impact_duration),
  }
}

function normalizeCauseChainItem(value: unknown): ProgressDeviationCauseChainItem | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    cause_type: String(raw.cause_type ?? ''),
    impact_duration: normalizeProductionDuration(raw.impact_duration),
    evidence: normalizeCauseEvidence(raw.evidence),
  } as ProgressDeviationCauseChainItem
}

function normalizeDeviationRow(value: unknown): ProgressDeviationRow | null {
  const raw = asRecord(value)
  if (!raw) return null
  const attribution = asRecord(raw.attribution)
  const causeChain = Array.isArray(attribution?.cause_chain)
    ? attribution.cause_chain.map(normalizeCauseChainItem).filter((item): item is ProgressDeviationCauseChainItem => Boolean(item))
    : undefined
  const delayReasons = Array.isArray(attribution?.delay_reasons)
    ? attribution.delay_reasons.map(normalizeDelayReason).filter((item): item is ProgressDeviationDelayReason => Boolean(item))
    : undefined

  return {
    ...raw,
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    mainline: raw.mainline as ProgressDeviationMainlineKey,
    deviation_duration: normalizeProductionDuration(raw.deviation_duration),
    deviation_rate: Number.isFinite(Number(raw.deviation_rate)) ? Number(raw.deviation_rate) : 0,
    status: String(raw.status ?? ''),
    attribution: attribution
      ? {
          ...attribution,
          ...(causeChain ? { cause_chain: causeChain } : {}),
          ...(delayReasons ? { delay_reasons: delayReasons } : {}),
        }
      : null,
  }
}

function normalizeDeviationRows(value: unknown): ProgressDeviationRow[] {
  return Array.isArray(value)
    ? value.map(normalizeDeviationRow).filter((row): row is ProgressDeviationRow => Boolean(row))
    : []
}

function normalizeMainline(value: unknown): ProgressDeviationMainline | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    key: raw.key as ProgressDeviationMainlineKey,
    label: String(raw.label ?? ''),
    summary: asRecord(raw.summary) as ProgressDeviationMainline['summary'],
    rows: normalizeDeviationRows(raw.rows),
  }
}

function normalizeResponsibilityContribution(value: unknown): ProgressDeviationResponsibilityContribution | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    owner: String(raw.owner ?? ''),
    count: Number.isFinite(Number(raw.count)) ? Number(raw.count) : 0,
    percentage: Number.isFinite(Number(raw.percentage)) ? Number(raw.percentage) : 0,
    task_ids: Array.isArray(raw.task_ids) ? raw.task_ids.map(String) : [],
    impact_duration: normalizeProductionDuration(raw.impact_duration),
  } as ProgressDeviationResponsibilityContribution
}

function normalizeCauseSummary(value: unknown): ProgressDeviationCauseSummary | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    reason: String(raw.reason ?? ''),
    count: Number.isFinite(Number(raw.count)) ? Number(raw.count) : 0,
    percentage: Number.isFinite(Number(raw.percentage)) ? Number(raw.percentage) : 0,
    impact_duration: normalizeProductionDuration(raw.impact_duration),
  }
}

function normalizeChartData(value: unknown): ProgressDeviationChartData | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    ...raw,
    baselineDeviation: normalizeDeviationRows(raw.baselineDeviation),
    monthlyFulfillment: Array.isArray(raw.monthlyFulfillment) ? raw.monthlyFulfillment : [],
    executionDeviation: normalizeDeviationRows(raw.executionDeviation),
    monthly_buckets: Array.isArray(raw.monthly_buckets) ? raw.monthly_buckets : [],
  }
}

export function normalizeProgressDeviationAnalysis(rawValue: unknown): ProgressDeviationAnalysisResponse | null {
  const raw = asRecord(rawValue)
  if (!raw) return null
  return {
    ...raw,
    project_id: String(raw.project_id ?? ''),
    baseline_version_id: String(raw.baseline_version_id ?? ''),
    summary: asRecord(raw.summary) ?? {},
    rows: normalizeDeviationRows(raw.rows),
    mainlines: Array.isArray(raw.mainlines)
      ? raw.mainlines.map(normalizeMainline).filter((line): line is ProgressDeviationMainline => Boolean(line))
      : [],
    trend_events: Array.isArray(raw.trend_events) ? raw.trend_events : [],
    chart_data: normalizeChartData(raw.chart_data),
    responsibility_contribution: Array.isArray(raw.responsibility_contribution)
      ? raw.responsibility_contribution
          .map(normalizeResponsibilityContribution)
          .filter((entry): entry is ProgressDeviationResponsibilityContribution => Boolean(entry))
      : [],
    top_deviation_causes: Array.isArray(raw.top_deviation_causes)
      ? raw.top_deviation_causes
          .map(normalizeCauseSummary)
          .filter((entry): entry is ProgressDeviationCauseSummary => Boolean(entry))
      : [],
  }
}

export async function getProgressDeviationAnalysis(
  projectId: string,
  baselineVersionId: string,
  options?: RequestInit,
): Promise<ProgressDeviationAnalysisResponse | null> {
  const raw = await apiGet<unknown>(
    `/api/progress-deviation?project_id=${encodeURIComponent(projectId)}&baseline_version_id=${encodeURIComponent(baselineVersionId)}`,
    options,
  )
  return normalizeProgressDeviationAnalysis(raw)
}
