import { normalizeStatus } from './statusHelpers.js'

export type RiskStatusLike = {
  status?: string | null
}

export const CLOSED_RISK_STATUSES = new Set(['closed', '已关闭'])

export function isActiveRisk(risk: RiskStatusLike): boolean {
  return !CLOSED_RISK_STATUSES.has(normalizeStatus(risk.status))
}
