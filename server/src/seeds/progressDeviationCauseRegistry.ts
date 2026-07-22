import type { DurationContributionMode } from './durationContributionMode.js'
import {
  STRUCTURED_CAUSE_TAXONOMY_VERSION,
  type StructuredCauseCode,
} from '../domain/structuredCauseTaxonomy.js'

export type ProgressDeviationCauseRule = {
  factorKeys: string[]
  canonicalCauseCode: StructuredCauseCode
  taxonomyVersion: typeof STRUCTURED_CAUSE_TAXONOMY_VERSION
  reason: string
  reasonType: string
  allowedModes: DurationContributionMode[]
  priority: number
  defaultConfidenceWeight: number
  responsibilityBasis: 'owner_scope' | 'site_capacity' | 'workflow' | 'external_wait' | 'calendar_productivity' | 'quality_gate' | 'handover' | 'data_quality' | 'manual'
}

export type ProgressDeviationCauseRuleMatch = {
  reason: string
  reasonType: string
  canonicalCauseCode: StructuredCauseCode
  taxonomyVersion: typeof STRUCTURED_CAUSE_TAXONOMY_VERSION
  priority: number
  confidenceWeight: number
  responsibilityBasis: ProgressDeviationCauseRule['responsibilityBasis']
}

export const PROGRESS_DEVIATION_CAUSE_RULES: ProgressDeviationCauseRule[] = [
  {
    factorKeys: ['resource_conflict', 'progress_velocity'],
    canonicalCauseCode: 'site_capacity_pressure',
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reason: '\u73b0\u573a\u627f\u8f7d\u538b\u529b',
    reasonType: 'site_capacity_pressure',
    allowedModes: ['duration_bearing'],
    priority: 90,
    defaultConfidenceWeight: 0.82,
    responsibilityBasis: 'site_capacity',
  },
  {
    factorKeys: ['workflow_sequence'],
    canonicalCauseCode: 'workflow_sequence',
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reason: '\u6d41\u6c34\u8282\u594f\u504f\u5dee',
    reasonType: 'workflow_sequence',
    allowedModes: ['duration_bearing'],
    priority: 80,
    defaultConfidenceWeight: 0.76,
    responsibilityBasis: 'workflow',
  },
  {
    factorKeys: ['seasonal_productivity', 'process_seasonal_sensitivity', 'weather_forecast_impact', 'productivity_compensation'],
    canonicalCauseCode: 'weather_impact',
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reason: '\u5b63\u8282/\u65e5\u5386\u4ea7\u80fd\u5f71\u54cd',
    reasonType: 'calendar_productivity',
    allowedModes: ['duration_bearing'],
    priority: 70,
    defaultConfidenceWeight: 0.7,
    responsibilityBasis: 'calendar_productivity',
  },
  {
    factorKeys: ['process_constraint'],
    canonicalCauseCode: 'workflow_sequence',
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reason: '\u5de5\u5e8f\u786c\u7ea6\u675f\u672a\u6ee1\u8db3',
    reasonType: 'process_constraint',
    allowedModes: ['duration_bearing', 'quality_gate', 'external_wait', 'handover_marker'],
    priority: 75,
    defaultConfidenceWeight: 0.74,
    responsibilityBasis: 'quality_gate',
  },
  {
    factorKeys: ['external_readiness'],
    canonicalCauseCode: 'external_readiness',
    taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
    reason: '\u5916\u90e8\u6761\u4ef6\u672a\u6ee1\u8db3',
    reasonType: 'external_readiness',
    allowedModes: ['duration_bearing', 'quality_gate', 'external_wait', 'handover_marker'],
    priority: 78,
    defaultConfidenceWeight: 0.78,
    responsibilityBasis: 'external_wait',
  },
]

const RULE_BY_FACTOR_KEY = new Map<string, ProgressDeviationCauseRule>()

for (const rule of PROGRESS_DEVIATION_CAUSE_RULES) {
  for (const key of rule.factorKeys) {
    RULE_BY_FACTOR_KEY.set(key, rule)
  }
}

export function resolveProgressDeviationCauseRule(
  factorKey: string,
  durationContributionMode: DurationContributionMode,
): ProgressDeviationCauseRuleMatch | null {
  const rule = RULE_BY_FACTOR_KEY.get(factorKey)
  if (!rule || !rule.allowedModes.includes(durationContributionMode)) return null

  return {
    reason: rule.reason,
    reasonType: rule.reasonType,
    canonicalCauseCode: rule.canonicalCauseCode,
    taxonomyVersion: rule.taxonomyVersion,
    priority: rule.priority,
    confidenceWeight: rule.defaultConfidenceWeight,
    responsibilityBasis: rule.responsibilityBasis,
  }
}
