import { normalizeStatus } from './statusHelpers.js'

export type WarningStatusLike = {
  status?: string | null
}

export const RESOLVED_WARNING_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])

export function isActiveWarning(warning: WarningStatusLike): boolean {
  return !RESOLVED_WARNING_STATUSES.has(normalizeStatus(warning.status))
}
