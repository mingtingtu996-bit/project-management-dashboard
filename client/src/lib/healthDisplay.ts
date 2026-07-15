export type HealthTrend = 'up' | 'down' | 'stable'

export type HealthCardDisplay = {
  label: string
  badgeClass: string
  textClass: string
}

export type HealthTrendDisplay = {
  label: string
  textClass: string
}

export type HealthToneDisplay = {
  barClass: string
  textClass: string
}

export type ProjectHealthStatus = '健康' | '亚健康' | '预警' | '危险' | '待完善'

export const PROJECT_HEALTH_THRESHOLDS = {
  healthy: 80,
  subHealthy: 60,
  warning: 40,
} as const

function isFiniteScore(score: number): boolean {
  return Number.isFinite(score)
}

export function getProjectHealthStatus(score: number): ProjectHealthStatus {
  if (!isFiniteScore(score)) return '待完善'
  if (score >= PROJECT_HEALTH_THRESHOLDS.healthy) return '健康'
  if (score >= PROJECT_HEALTH_THRESHOLDS.subHealthy) return '亚健康'
  if (score >= PROJECT_HEALTH_THRESHOLDS.warning) return '预警'
  return '危险'
}

export function getHealthCardDisplay(score: number): HealthCardDisplay {
  switch (getProjectHealthStatus(score)) {
    case '健康':
      return {
        label: '健康',
        badgeClass: 'bg-emerald-50 text-emerald-600',
        textClass: 'text-emerald-600',
      }
    case '亚健康':
      return {
        label: '亚健康',
        badgeClass: 'bg-blue-50 text-blue-600',
        textClass: 'text-blue-600',
      }
    case '预警':
      return {
        label: '预警',
        badgeClass: 'bg-amber-50 text-amber-600',
        textClass: 'text-amber-600',
      }
    case '危险':
      return {
        label: '危险',
        badgeClass: 'bg-red-50 text-red-600',
        textClass: 'text-red-600',
      }
    default:
      return {
        label: '待完善',
        badgeClass: 'bg-slate-100 text-slate-600',
        textClass: 'text-slate-500',
      }
  }
}

export function getHealthPillVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const status = getProjectHealthStatus(score)
  if (status === '健康') return 'success'
  if (status === '亚健康') return 'info'
  if (status === '预警') return 'warning'
  if (status === '危险') return 'danger'
  return 'neutral'
}

export function getProjectHealthPill(score: number) {
  return {
    label: getProjectHealthStatus(score),
    variant: getHealthPillVariant(score),
  }
}

export function getHealthProgressDisplay(progress: number): HealthToneDisplay {
  if (progress >= PROJECT_HEALTH_THRESHOLDS.healthy) {
    return {
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    }
  }

  if (progress >= PROJECT_HEALTH_THRESHOLDS.subHealthy) {
    return {
      barClass: 'bg-blue-600',
      textClass: 'text-blue-600',
    }
  }

  if (progress >= PROJECT_HEALTH_THRESHOLDS.warning) {
    return {
      barClass: 'bg-amber-500',
      textClass: 'text-amber-600',
    }
  }

  return {
    barClass: 'bg-red-500',
    textClass: 'text-red-600',
  }
}

export function getHealthTrendDisplay(trend: HealthTrend): HealthTrendDisplay {
  switch (trend) {
    case 'up':
      return { label: '上升', textClass: 'text-emerald-600' }
    case 'down':
      return { label: '下降', textClass: 'text-red-500' }
    default:
      return { label: '持平', textClass: 'text-slate-400' }
  }
}

export function getHealthDimensionDisplay(isBase: boolean, isPositive: boolean): HealthToneDisplay {
  if (isBase) {
    return {
      barClass: 'bg-slate-300',
      textClass: 'text-slate-400',
    }
  }

  return isPositive
    ? { barClass: 'bg-emerald-500', textClass: 'text-emerald-600' }
    : { barClass: 'bg-red-400', textClass: 'text-red-500' }
}
