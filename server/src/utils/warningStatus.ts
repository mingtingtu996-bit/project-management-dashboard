import { normalizeStatus } from './statusHelpers.js'

export type WarningStatusLike = {
  status?: string | null
  warning_lifecycle_status?: string | null
}

const RESOLVED_WARNING_STATUSES = new Set(['resolved', 'closed', '已解决', '已关闭'])

export function isActiveWarning(warning: WarningStatusLike): boolean {
  // v1.4.12: prefer warning_lifecycle_status for active determination
  const lifecycleStatus = String(warning.warning_lifecycle_status ?? '').trim().toLowerCase()
  if (lifecycleStatus) {
    return lifecycleStatus === 'active' || lifecycleStatus === 'created'
  }
  // Fallback: legacy status field for old warnings data
  return !RESOLVED_WARNING_STATUSES.has(normalizeStatus(warning.status))
}
