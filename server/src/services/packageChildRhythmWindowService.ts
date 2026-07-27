export type PackageChildRhythmWindow = {
  startDay: number
  endDay: number
  durationDays: number
  role: string
  source: 'explicit_metadata' | 'explicit_metadata_by_parent_window' | 'template_duration_truth_asset' | 'rule_duration_truth_asset'
  confidence: 'high' | 'medium' | 'low'
}

type PackageChildRhythmWindowInput = {
  taskTitle?: unknown
  standardWorkCode?: unknown
  parentStandardWorkCode?: unknown
  parentDurationBoundaryPolicy?: unknown
  parentReferenceDurationDays?: unknown
  metadata?: Record<string, unknown> | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function resolveWindowSource(value: unknown, fallback: PackageChildRhythmWindow['source']) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'template_duration_truth_asset') return 'template_duration_truth_asset'
  if (normalized === 'rule_duration_truth_asset') return 'rule_duration_truth_asset'
  return fallback
}

function clampDay(value: number, parentWindowDays: number) {
  return Math.min(parentWindowDays, Math.max(1, Math.ceil(value)))
}

function buildWindow(
  startDay: number,
  endDay: number,
  parentWindowDays: number,
  role: string,
  source: PackageChildRhythmWindow['source'],
  confidence: PackageChildRhythmWindow['confidence'],
): PackageChildRhythmWindow {
  const start = clampDay(startDay, parentWindowDays)
  const end = Math.max(start, clampDay(endDay, parentWindowDays))
  return {
    startDay: start,
    endDay: end,
    durationDays: Math.max(1, end - start + 1),
    role,
    source,
    confidence,
  }
}

function resolveExplicitWindow(metadata: Record<string, unknown>, parentWindowDays: number): PackageChildRhythmWindow | null {
  const window = readRecord(metadata.packageChildRhythmWindow ?? metadata.package_child_rhythm_window)
  const startDay = readPositiveNumber(
    window.startDay
      ?? window.start_day
      ?? metadata.rhythmWindowStartDay
      ?? metadata.rhythm_window_start_day,
  )
  const endDay = readPositiveNumber(
    window.endDay
      ?? window.end_day
      ?? metadata.rhythmWindowEndDay
      ?? metadata.rhythm_window_end_day,
  )
  const durationDays = readPositiveNumber(
    window.durationDays
      ?? window.duration_days
      ?? metadata.rhythmWindowDurationDays
      ?? metadata.rhythm_window_duration_days,
  )
  if (!startDay && !endDay && !durationDays) return null
  const start = startDay ?? endDay ?? 1
  const end = endDay ?? (start + (durationDays ?? 1) - 1)
  return buildWindow(
    start,
    end,
    parentWindowDays,
    normalizeText(window.role ?? window.rhythmWindowRole ?? metadata.rhythmWindowRole) || 'explicit_package_child_window',
    resolveWindowSource(window.source ?? window.rhythmWindowSource ?? metadata.rhythmWindowSource ?? metadata.rhythm_window_source, 'explicit_metadata'),
    'high',
  )
}

function resolveParentWindowSpecificWindow(
  metadata: Record<string, unknown>,
  parentWindowDays: number,
): PackageChildRhythmWindow | null {
  const windowMap = readRecord(
    metadata.packageChildRhythmWindowByParentDays
      ?? metadata.package_child_rhythm_window_by_parent_days,
  )
  const window = readRecord(
    windowMap[String(parentWindowDays)]
      ?? windowMap[parentWindowDays],
  )
  if (Object.keys(window).length === 0) return null
  const startDay = readPositiveNumber(window.startDay ?? window.start_day)
  const endDay = readPositiveNumber(window.endDay ?? window.end_day)
  const durationDays = readPositiveNumber(window.durationDays ?? window.duration_days)
  if (!startDay && !endDay && !durationDays) return null
  const start = startDay ?? endDay ?? 1
  const end = endDay ?? (start + (durationDays ?? 1) - 1)
  return buildWindow(
    start,
    end,
    parentWindowDays,
    normalizeText(window.role ?? window.rhythmWindowRole ?? window.rhythm_window_role ?? metadata.rhythmWindowRole) || 'explicit_package_child_window',
    resolveWindowSource(window.source ?? window.rhythmWindowSource ?? window.rhythm_window_source ?? metadata.rhythmWindowSource ?? metadata.rhythm_window_source, 'explicit_metadata_by_parent_window'),
    'high',
  )
}

export function resolvePackageChildRhythmWindow(input: PackageChildRhythmWindowInput): PackageChildRhythmWindow | null {
  const parentWindowDays = readPositiveNumber(input.parentReferenceDurationDays)
  if (!parentWindowDays) return null

  const metadata = readRecord(input.metadata)
  const parentSpecific = resolveParentWindowSpecificWindow(metadata, parentWindowDays)
  if (parentSpecific) return parentSpecific

  const explicit = resolveExplicitWindow(metadata, parentWindowDays)
  if (explicit) return explicit

  return null
}
