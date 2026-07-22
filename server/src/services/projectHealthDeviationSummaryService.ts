// v1.4.19: Unified project health + deviation summary DTO
// Single source for Dashboard, Reports, CompanyCockpit

import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import { translateLegacyProgressFactor } from '../domain/structuredCauseTaxonomy.js'
import {
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'

export interface HealthDeviationSummary {
  projectId: string
  healthScore: number | null
  healthStatus: string | null
  businessHealthScore: number | null
  healthConfidenceScore: number | null
  healthConfidenceFlag: string | null
  healthBasis: Record<string, unknown>
  deviationSummary: Record<string, unknown>
  caliberVersion: string
  generatedAt: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readForecastFactorSummary(value: unknown) {
  const summary = readObject(value)
  return {
    factors: readArray(summary.factors).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)),
    businessReasons: readArray(summary.businessReasons ?? summary.business_reasons).map(normalizeText).filter(Boolean),
  }
}

function resolveCanonicalFactorPresentation(factorKey: string, mode: DurationContributionMode) {
  const translation = translateLegacyProgressFactor(factorKey)
  if (!translation) return null
  if (
    mode !== 'duration_bearing'
    && (
      (factorKey !== 'process_constraint' && factorKey !== 'external_readiness')
      || !(['quality_gate', 'external_wait', 'handover_marker'] as DurationContributionMode[]).includes(mode)
    )
  ) return null

  if (factorKey === 'resource_conflict' || factorKey === 'progress_velocity') {
    return {
      ...translation,
      reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b',
      reasonType: 'site_capacity_pressure',
      responsibilityBasis: 'site_capacity',
      confidenceWeight: 0.82,
    }
  }
  if (factorKey === 'workflow_sequence') {
    return {
      ...translation,
      reason: '\u6d41\u6c34\u8282\u594f\u504f\u5dee',
      reasonType: 'workflow_sequence',
      responsibilityBasis: 'workflow',
      confidenceWeight: 0.76,
    }
  }
  if (
    factorKey === 'seasonal_productivity'
    || factorKey === 'process_seasonal_sensitivity'
    || factorKey === 'weather_forecast_impact'
    || factorKey === 'productivity_compensation'
  ) {
    return {
      ...translation,
      reason: '\u5b63\u8282/\u65e5\u5386\u4ea7\u80fd\u5f71\u54cd',
      reasonType: 'calendar_productivity',
      responsibilityBasis: 'calendar_productivity',
      confidenceWeight: 0.7,
    }
  }
  if (factorKey === 'process_constraint') {
    return {
      ...translation,
      reason: '\u5de5\u5e8f\u786c\u7ea6\u675f\u672a\u6ee1\u8db3',
      reasonType: 'process_constraint',
      responsibilityBasis: 'quality_gate',
      confidenceWeight: 0.74,
    }
  }
  if (factorKey === 'external_readiness') {
    return {
      ...translation,
      reason: '\u5916\u90e8\u6761\u4ef6\u672a\u6ee1\u8db3',
      reasonType: 'external_readiness',
      responsibilityBasis: 'external_wait',
      confidenceWeight: 0.78,
    }
  }
  return null
}

async function buildRecentDurationDeviationCauses(projectId: string) {
  const { data, error } = await (supabase as any)
    .from('task_duration_forecasts')
    .select('task_id, forecast_delay_days, factor_summary, generated_at, created_at, is_current')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .order('generated_at', { ascending: false })
    .limit(50)

  if (error || !Array.isArray(data)) return []

  const causes = new Map<string, {
    code: string
    label: string
    count: number
    maxDelayDays: number
    reasons: string[]
    factorKeys: string[]
    canonicalCauseCode: string
    canonicalCauseTaxonomyVersion: string
    responsibilityBasis: string
    confidenceWeight: number
  }>()

  for (const row of data as Array<Record<string, unknown>>) {
    const summary = readForecastFactorSummary(row.factor_summary)
    const delayDays = Math.max(0, Number(row.forecast_delay_days ?? 0) || 0)
    const countedReasonTypes = new Set<string>()
    for (const factor of summary.factors) {
      const key = normalizeText(factor.key)
      const metadata = readObject(factor.metadata)
      const contributionMode = normalizeDurationContributionMode(
        factor.durationContributionMode
          ?? factor.duration_contribution_mode
          ?? metadata.durationContributionMode
          ?? metadata.duration_contribution_mode,
      ) ?? 'duration_bearing'
      const rule = resolveCanonicalFactorPresentation(key, contributionMode)
      if (!rule) continue
      const reason = normalizeText(factor.reason) || summary.businessReasons[0] || '现场承载压力影响当前工期预测。'
      const existing = causes.get(rule.reasonType) ?? {
        code: rule.reasonType,
        label: '现场承载压力',
        count: 0,
        maxDelayDays: 0,
        reasons: [],
        factorKeys: [],
        canonicalCauseCode: rule.causeCode,
        canonicalCauseTaxonomyVersion: rule.taxonomyVersion,
        responsibilityBasis: rule.responsibilityBasis,
        confidenceWeight: rule.confidenceWeight,
      }
      existing.label = rule.reason
      if (!countedReasonTypes.has(rule.reasonType)) {
        existing.count += 1
        countedReasonTypes.add(rule.reasonType)
      }
      existing.maxDelayDays = Math.max(existing.maxDelayDays, delayDays)
      existing.factorKeys = Array.from(new Set([...existing.factorKeys, key]))
      existing.reasons = Array.from(new Set([
        ...existing.reasons,
        reason,
        Number(metadata.resourceObstacleCount ?? 0) > 0 ? '资源类阻碍未解除' : '',
        Number(metadata.overdueMaterialCount ?? 0) > 0 ? '关联材料到货逾期' : '',
        Number(metadata.sameResponsibleUnitCount ?? 0) > 0 ? '同责任单位任务集中' : '',
      ].filter(Boolean))).slice(0, 5)
      causes.set(rule.reasonType, existing)
    }
  }

  return Array.from(causes.values())
}

export async function buildProjectHealthDeviationSummary(projectId: string): Promise<HealthDeviationSummary> {
  const now = new Date().toISOString()

  // Get latest daily snapshot for this project
  const { data: snapshot } = await (supabase as any)
    .from('project_daily_snapshot')
    .select('*')
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latest = snapshot ?? {}

  // Get current execution summary for real-time context
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('health_score, health_status, overall_progress')
    .eq('id', projectId)
    .maybeSingle()

  const durationDeviationCauses = await buildRecentDurationDeviationCauses(projectId)
  const baseDeviationSummary = readObject(latest.deviation_summary)
  const latestHealthScore = latest.health_score ?? null
  const persistedHealthScore = project?.health_score ?? null
  const healthScore = latestHealthScore ?? persistedHealthScore
  const businessHealthScore = latest.business_health_score ?? latestHealthScore ?? persistedHealthScore
  const healthStatus = latest.health_status ?? project?.health_status ?? null

  return {
    projectId,
    healthScore,
    healthStatus,
    businessHealthScore,
    healthConfidenceScore: latest.health_confidence_score ?? null,
    healthConfidenceFlag: latest.health_confidence_flag ?? (project?.health_score != null ? 'medium' : 'unavailable'),
    healthBasis: latest.health_basis ?? {},
    deviationSummary: {
      ...baseDeviationSummary,
      durationDeviationCauses,
    },
    caliberVersion: latest.health_caliber_version ?? 'legacy',
    generatedAt: now,
  }
}

export async function buildMultiProjectHealthSummaries(projectIds: string[]): Promise<HealthDeviationSummary[]> {
  const summaries: HealthDeviationSummary[] = []
  for (const id of projectIds) {
    try {
      summaries.push(await buildProjectHealthDeviationSummary(id))
    } catch (err) {
      logger.error('Failed to build health summary for project', { projectId: id, error: err })
    }
  }
  return summaries
}
