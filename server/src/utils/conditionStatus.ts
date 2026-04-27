import { isTruthyFlag, normalizeStatus } from './statusHelpers.js'

export type ConditionStatusLike = {
  is_satisfied?: boolean | number | null
  status?: string | null
}

export const SATISFIED_CONDITION_STATUSES = new Set(['completed', 'satisfied', 'confirmed', '已满足', '已确认'])

export function isPendingCondition(condition: ConditionStatusLike): boolean {
  if (condition.is_satisfied !== undefined && condition.is_satisfied !== null) {
    return !isTruthyFlag(condition.is_satisfied)
  }

  return !SATISFIED_CONDITION_STATUSES.has(normalizeStatus(condition.status))
}
