export type DurationEngineCode =
  | 'duration_suggestion'
  | 'task_remaining_forecast'
  | 'critical_path_cpm'
  | 'project_remaining_forecast'
  | 'schedule_acceleration'
  | string

export type DurationPlausibilitySeverity = 'warning' | 'clamped'

export interface DurationPlausibilityWarning {
  ruleId: string
  severity: DurationPlausibilitySeverity
  engineCode?: DurationEngineCode
  message: string
  originalDays?: number | null
  adjustedDays?: number | null
  minDays?: number | null
  maxDays?: number | null
  taskId?: string | null
  title?: string | null
  standardWorkCode?: string | null
  metadata?: Record<string, unknown>
}

export interface DurationPlausibilityInput {
  engineCode: DurationEngineCode
  durationDays: number | null | undefined
  title?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  taskId?: string | null
  clamp?: boolean
  maxDays?: number | null
}

export interface DurationPlausibilityResult {
  durationDays: number | null
  warnings: DurationPlausibilityWarning[]
}

export interface DurationBandOrderInput {
  engineCode: DurationEngineCode
  p20Days?: number | null
  p50Days?: number | null
  p80Days?: number | null
  taskId?: string | null
}

export interface DurationRelativeCapInput {
  engineCode: DurationEngineCode
  durationDays: number | null | undefined
  baselineDays: number | null | undefined
  multiplier?: number | null
  minCapDays?: number | null
  ruleId?: string
  message?: string
  taskId?: string | null
  title?: string | null
  standardWorkCode?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

export function defaultMaxDurationDaysForEngine(engineCode: DurationEngineCode) {
  if (engineCode === 'project_remaining_forecast') return 730
  if (engineCode === 'critical_path_cpm') return 730
  if (engineCode === 'task_remaining_forecast') return 365
  return 730
}

export function evaluateDurationPlausibility(input: DurationPlausibilityInput): DurationPlausibilityResult {
  const originalDays = positiveInteger(input.durationDays)
  if (originalDays === null) return { durationDays: null, warnings: [] }

  const title = normalizeText(input.title)
  const standardWorkCode = normalizeText(input.standardWorkCode)
  const standardWorkName = normalizeText(input.standardWorkName)
  const identity = [title, standardWorkCode, standardWorkName].join(' ')
  const warnings: DurationPlausibilityWarning[] = []
  let durationDays = originalDays

  const isExplicitCuringCode = standardWorkCode.includes('concrete_curing') || standardWorkCode.includes('curing_wait')
  const isCompositeConcretePlacement = includesAny(identity, ['pour', 'placement', '浇筑', '澆築', '振捣', '振搗', '收面'])
  const isCuring = isExplicitCuringCode
    || (includesAny(identity, ['curing', '养护', '養護', '試块', '试块']) && !isCompositeConcretePlacement)
  if (isCuring && durationDays < 7) {
    warnings.push({
      ruleId: 'duration.min.concrete_curing_normal',
      severity: 'warning',
      engineCode: input.engineCode,
      message: 'Concrete curing duration is below the normal 7-day reference; verify early-strength mix, design approval, or project-specific curing evidence before relying on it.',
      originalDays,
      adjustedDays: durationDays,
      minDays: 7,
      taskId: input.taskId ?? null,
      title: input.title ?? null,
      standardWorkCode: input.standardWorkCode ?? null,
    })
  }

  const isStandardFloorRhythm = includesAny(identity, [
    'standard floor',
    'standard_floor',
    '标准层',
    '標準層',
  ]) && includesAny(identity, ['rhythm', '节拍', '節拍', 'structure', '结构', '結構'])
  if (isStandardFloorRhythm && (durationDays < 4 || durationDays > 7)) {
    warnings.push({
      ruleId: 'duration.range.standard_floor_rhythm',
      severity: 'warning',
      engineCode: input.engineCode,
      message: 'Standard-floor structure rhythm is outside the 4-7 days-per-layer engineering plausibility band.',
      originalDays,
      adjustedDays: durationDays,
      minDays: 4,
      maxDays: 7,
      taskId: input.taskId ?? null,
      title: input.title ?? null,
      standardWorkCode: input.standardWorkCode ?? null,
    })
  }

  const maxDays = positiveInteger(input.maxDays) ?? defaultMaxDurationDaysForEngine(input.engineCode)
  if (durationDays > maxDays) {
    const ruleId = input.engineCode === 'project_remaining_forecast'
      ? 'duration.max.project_remaining'
      : input.engineCode === 'critical_path_cpm'
        ? 'duration.max.critical_path_task'
        : 'duration.max.relative_plausibility'
    warnings.push({
      ruleId,
      severity: 'clamped',
      engineCode: input.engineCode,
      message: `Duration exceeds the ${maxDays}-day plausibility cap and was clamped for forecast stability.`,
      originalDays,
      adjustedDays: maxDays,
      maxDays,
      taskId: input.taskId ?? null,
      title: input.title ?? null,
      standardWorkCode: input.standardWorkCode ?? null,
    })
    durationDays = maxDays
  }

  return { durationDays, warnings }
}

export function orderDurationBand(input: DurationBandOrderInput): {
  band: { p20Days: number | null, p50Days: number | null, p80Days: number | null }
  warnings: DurationPlausibilityWarning[]
} {
  const values = [
    positiveInteger(input.p20Days),
    positiveInteger(input.p50Days),
    positiveInteger(input.p80Days),
  ]
  const available = values.filter((value): value is number => value !== null)
  if (available.length === 0) {
    return { band: { p20Days: null, p50Days: null, p80Days: null }, warnings: [] }
  }
  const sorted = [...available].sort((left, right) => left - right)
  const band = {
    p20Days: values[0] === null ? null : sorted[0],
    p50Days: values[1] === null ? null : sorted[Math.min(1, sorted.length - 1)],
    p80Days: values[2] === null ? null : sorted[sorted.length - 1],
  }
  const changed = band.p20Days !== values[0] || band.p50Days !== values[1] || band.p80Days !== values[2]
  return {
    band,
    warnings: changed
      ? [{
        ruleId: 'duration.band.order',
        severity: 'warning',
        engineCode: input.engineCode,
        message: 'Duration confidence band was reordered to preserve P20 <= P50 <= P80 semantics.',
        taskId: input.taskId ?? null,
        metadata: {
          originalP20Days: values[0],
          originalP50Days: values[1],
          originalP80Days: values[2],
          orderedP20Days: band.p20Days,
          orderedP50Days: band.p50Days,
          orderedP80Days: band.p80Days,
        },
      }]
      : [],
  }
}

export function capDurationRelativeToBaseline(input: DurationRelativeCapInput): DurationPlausibilityResult {
  const originalDays = positiveInteger(input.durationDays)
  const baselineDays = positiveInteger(input.baselineDays)
  if (originalDays === null) return { durationDays: null, warnings: [] }
  if (baselineDays === null) return { durationDays: originalDays, warnings: [] }

  const multiplier = Number(input.multiplier ?? 10)
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 10
  const minCapDays = positiveInteger(input.minCapDays) ?? baselineDays
  const maxDays = Math.max(minCapDays, Math.ceil(baselineDays * safeMultiplier))
  if (originalDays <= maxDays) return { durationDays: originalDays, warnings: [] }

  return {
    durationDays: maxDays,
    warnings: [{
      ruleId: input.ruleId ?? 'duration.max.relative_plausibility',
      severity: 'clamped',
      engineCode: input.engineCode,
      message: input.message ?? `Duration exceeds ${safeMultiplier}x the baseline duration and was clamped for forecast stability.`,
      originalDays,
      adjustedDays: maxDays,
      maxDays,
      taskId: input.taskId ?? null,
      title: input.title ?? null,
      standardWorkCode: input.standardWorkCode ?? null,
      metadata: {
        baselineDays,
        multiplier: safeMultiplier,
      },
    }],
  }
}

export function appendDurationPlausibilityWarnings<T extends Record<string, unknown>>(
  target: T,
  warnings: DurationPlausibilityWarning[],
): T {
  if (warnings.length === 0) return target
  const existing = Array.isArray(target.durationPlausibilityWarnings)
    ? target.durationPlausibilityWarnings
    : []
  return {
    ...target,
    durationPlausibilityWarnings: [...existing, ...warnings],
  }
}
