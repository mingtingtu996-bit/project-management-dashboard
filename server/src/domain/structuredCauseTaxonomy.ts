export const STRUCTURED_CAUSE_TAXONOMY_VERSION = 'v1.0.0' as const

export const CANONICAL_STRUCTURED_CAUSE_CODES = [
  'predecessor_delay', 'material_shortage', 'labor_shortage',
  'equipment_unavailable', 'design_change', 'drawing_delay',
  'quality_rework', 'weather_impact', 'owner_decision',
  'government_inspection', 'site_capacity_pressure',
  'workflow_sequence', 'external_readiness', 'other',
] as const

export type StructuredCauseCode = typeof CANONICAL_STRUCTURED_CAUSE_CODES[number]

const LEGACY_FACTOR_CAUSE = Object.freeze({
  resource_conflict: 'site_capacity_pressure',
  progress_velocity: 'site_capacity_pressure',
  workflow_sequence: 'workflow_sequence',
  seasonal_productivity: 'weather_impact',
  process_seasonal_sensitivity: 'weather_impact',
  weather_forecast_impact: 'weather_impact',
  productivity_compensation: 'weather_impact',
  process_constraint: 'workflow_sequence',
  external_readiness: 'external_readiness',
} satisfies Record<string, StructuredCauseCode>)

export const LEGACY_PROGRESS_FACTOR_TRANSLATION_ENTRIES: ReadonlyArray<{
  readonly factorKey: keyof typeof LEGACY_FACTOR_CAUSE
  readonly causeCode: StructuredCauseCode
}> = Object.freeze(Object.entries(LEGACY_FACTOR_CAUSE).map(([factorKey, causeCode]) => Object.freeze({
  factorKey: factorKey as keyof typeof LEGACY_FACTOR_CAUSE,
  causeCode,
})))

export function isStructuredCauseCode(value: unknown): value is StructuredCauseCode {
  return typeof value === 'string'
    && (CANONICAL_STRUCTURED_CAUSE_CODES as readonly string[]).includes(value)
}

export function requireStructuredCauseCode(value: unknown): StructuredCauseCode {
  if (!isStructuredCauseCode(value)) throw new Error('STRUCTURED_CAUSE_CODE_INVALID')
  return value
}

export function translateLegacyProgressFactor(factorKey: string) {
  const causeCode = LEGACY_FACTOR_CAUSE[factorKey as keyof typeof LEGACY_FACTOR_CAUSE]
  return causeCode
    ? { factorKey, causeCode, taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION }
    : null
}
