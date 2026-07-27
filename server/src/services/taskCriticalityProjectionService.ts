export type TaskCriticalityProjectionInput = {
  is_critical?: boolean | number | string | null
  baseline_is_critical?: boolean | number | string | null
  total_float_days?: number | string | null
  free_float_days?: number | string | null
  successor_count?: number | string | null
  milestone_distance_days?: number | string | null
  downstream_milestone_distance_days?: number | string | null
  criticality_weight?: number | string | null
}

export type LiveTaskCriticalityProjection = {
  isCritical: boolean
  isNearCritical: boolean
  totalFloatDays: number | null
  freeFloatDays: number | null
  successorCount: number | null
  milestoneDistanceDays: number | null
  criticalityWeight: number
  basis: 'cpm_live_projection' | 'float_days' | 'not_critical_path'
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function resolveLiveTaskCriticalityProjection(
  row: TaskCriticalityProjectionInput | null | undefined,
): LiveTaskCriticalityProjection {
  const totalFloatDays = readNumber(row?.total_float_days)
  const freeFloatDays = readNumber(row?.free_float_days)
  const successorCount = readNumber(row?.successor_count)
  const milestoneDistanceDays = readNumber(row?.milestone_distance_days ?? row?.downstream_milestone_distance_days)
  const explicitWeight = readNumber(row?.criticality_weight)
  const isCritical = readBoolean(row?.is_critical) || (totalFloatDays !== null && totalFloatDays <= 0)
  const isNearCritical = isCritical
    || (totalFloatDays !== null && totalFloatDays <= 3)
    || (freeFloatDays !== null && freeFloatDays <= 1)
  const inferredWeight = isCritical
    ? 1.35
    : totalFloatDays !== null && totalFloatDays <= 2
      ? 1.2
      : totalFloatDays !== null && totalFloatDays <= 5
        ? 1.1
        : 1

  return {
    isCritical,
    isNearCritical,
    totalFloatDays,
    freeFloatDays,
    successorCount,
    milestoneDistanceDays,
    criticalityWeight: Math.max(0.75, Math.min(1.6, explicitWeight ?? inferredWeight)),
    basis: isCritical ? 'cpm_live_projection' : totalFloatDays !== null || freeFloatDays !== null ? 'float_days' : 'not_critical_path',
  }
}

export function isLiveCriticalOrNearCriticalTask(row: TaskCriticalityProjectionInput | null | undefined): boolean {
  return resolveLiveTaskCriticalityProjection(row).isNearCritical
}
