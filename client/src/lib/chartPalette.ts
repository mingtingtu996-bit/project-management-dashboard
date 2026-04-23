const DEFAULT_HEX_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'] as const

export const CHART_PALETTE = DEFAULT_HEX_COLORS

export const CHART_SERIES = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
} as const

export const TASK_STAGE_COLORS = {
  completed: CHART_SERIES.success,
  inProgress: CHART_SERIES.primary,
  notStarted: CHART_SERIES.warning,
  delayed: CHART_SERIES.danger,
} as const

export const CHART_AXIS_COLORS = {
  neutralStroke: '#e5e7eb',
  neutralGrid: 'rgba(148, 163, 184, 0.16)',
  emphasisGrid: 'rgba(239, 68, 68, 0.22)',
  axisText: '#475569',
} as const

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  const numeric = Number.parseInt(normalized, 16)
  return [
    (numeric >> 16) & 0xff,
    (numeric >> 8) & 0xff,
    numeric & 0xff,
  ]
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${clampByte(rgb[0])}, ${clampByte(rgb[1])}, ${clampByte(rgb[2])}, ${Math.max(0, Math.min(1, alpha))})`
}

export function getPaletteColor(index: number): string {
  return CHART_PALETTE[((index % CHART_PALETTE.length) + CHART_PALETTE.length) % CHART_PALETTE.length]
}

export function getProgressThresholdColor(progress: number, alpha = 0.72): { background: string; border: string } {
  if (progress >= 90) {
    return {
      background: hexToRgba(CHART_SERIES.success, alpha),
      border: hexToRgba(CHART_SERIES.success, 1),
    }
  }
  if (progress >= 70) {
    return {
      background: hexToRgba(CHART_SERIES.primary, alpha),
      border: hexToRgba(CHART_SERIES.primary, 1),
    }
  }
  if (progress >= 50) {
    return {
      background: hexToRgba(CHART_SERIES.warning, alpha),
      border: hexToRgba(CHART_SERIES.warning, 1),
    }
  }
  return {
    background: hexToRgba(CHART_SERIES.danger, alpha),
    border: hexToRgba(CHART_SERIES.danger, 1),
  }
}
