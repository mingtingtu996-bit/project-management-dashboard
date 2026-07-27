export type DurationDayBasis = 'calendar_day' | 'construction_production_day'
export type DurationValueKind = 'actual' | 'planned'

type DurationBasisRow = Record<string, unknown> & {
  metadata?: Record<string, unknown> | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function readPositiveDays(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function resolveDurationDayBasis(row: DurationBasisRow): DurationDayBasis {
  const explicit = normalizeText(row.duration_day_basis)
  if (explicit === 'construction_production_day') return 'construction_production_day'
  if (explicit === 'calendar_day') return 'calendar_day'

  const metadataBasis = normalizeText(row.metadata?.duration_day_basis)
  return metadataBasis === 'construction_production_day'
    ? 'construction_production_day'
    : 'calendar_day'
}

export function readProductionDurationDays(
  row: DurationBasisRow,
  kind: DurationValueKind,
) {
  const explicit = readPositiveDays(row[`${kind}_duration_production_days`])
  if (explicit !== null) return explicit
  if (resolveDurationDayBasis(row) !== 'construction_production_day') return null
  return readPositiveDays(row[`${kind}_duration`])
}

export function readCalendarDurationDays(
  row: DurationBasisRow,
  kind: DurationValueKind,
) {
  const explicit = readPositiveDays(row[`${kind}_duration_calendar_days`])
  if (explicit !== null) return explicit
  if (resolveDurationDayBasis(row) !== 'calendar_day') return null
  return readPositiveDays(row[`${kind}_duration`])
}
