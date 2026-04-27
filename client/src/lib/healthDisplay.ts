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

export function getHealthCardDisplay(score: number): HealthCardDisplay {
  if (score >= 80) {
    return {
      label: '健康',
      badgeClass: 'bg-emerald-50 text-emerald-600',
      textClass: 'text-emerald-600',
    }
  }

  if (score >= 60) {
    return {
      label: '亚健康',
      badgeClass: 'bg-blue-50 text-blue-600',
      textClass: 'text-blue-600',
    }
  }

  if (score >= 40) {
    return {
      label: '预警',
      badgeClass: 'bg-amber-50 text-amber-600',
      textClass: 'text-amber-600',
    }
  }

  return {
    label: '危险',
    badgeClass: 'bg-red-50 text-red-600',
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
      return { label: '持平', textClass: 'text-gray-400' }
  }
}

export function getHealthDimensionDisplay(isBase: boolean, isPositive: boolean): HealthToneDisplay {
  if (isBase) {
    return {
      barClass: 'bg-gray-300',
      textClass: 'text-gray-400',
    }
  }

  return isPositive
    ? { barClass: 'bg-emerald-500', textClass: 'text-emerald-600' }
    : { barClass: 'bg-red-400', textClass: 'text-red-500' }
}

export function getHealthProgressDisplay(progress: number): HealthToneDisplay {
  if (progress >= 80) {
    return {
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    }
  }

  if (progress >= 60) {
    return {
      barClass: 'bg-blue-500',
      textClass: 'text-blue-600',
    }
  }

  if (progress >= 40) {
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
