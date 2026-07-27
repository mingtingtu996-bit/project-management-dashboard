export type ProjectHealthStatus = '健康' | '亚健康' | '预警' | '危险' | '待完善'

export const PROJECT_HEALTH_THRESHOLDS = {
  healthy: 80,
  subHealthy: 60,
  warning: 40,
} as const

export function mapProjectHealthStatus(score: number): ProjectHealthStatus {
  if (!Number.isFinite(score)) return '待完善'
  if (score >= PROJECT_HEALTH_THRESHOLDS.healthy) return '健康'
  if (score >= PROJECT_HEALTH_THRESHOLDS.subHealthy) return '亚健康'
  if (score >= PROJECT_HEALTH_THRESHOLDS.warning) return '预警'
  return '危险'
}
