const DEFAULT_HEX_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#0f766e', '#06b6d4', '#84cc16'] as const

export const CHART_PALETTE = DEFAULT_HEX_COLORS

export const CHART_NEUTRAL = {
  white: '#ffffff',
  canvas: '#f8fafc',
  surface: '#f1f5f9',
  softSurface: '#e2e8f0',
  border: '#cbd5e1',
  muted: '#94a3b8',
  text: '#475569',
  body: '#64748b',
  darkBody: '#6b7280',
  title: '#0f172a',
} as const

export const CHART_SERIES = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#0ea5e9',
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
  axisText: CHART_NEUTRAL.text,
} as const

export const MATERIAL_CATEGORY_PALETTE: Record<string, string> = {
  钢材: '#2563eb',
  混凝土: CHART_NEUTRAL.body,
  管材: '#0f766e',
  电气: CHART_SERIES.warning,
  其他: CHART_NEUTRAL.muted,
  fallbackGradient: '#e2e8f0 0 100%',
}

export const ACCEPTANCE_TYPE_COLOR_PALETTE = [
  '#2563eb',
  '#ea580c',
  '#16a34a',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#0f766e',
  '#64748b',
] as const

export const ACCEPTANCE_FLOW_PALETTE = {
  primary: CHART_SERIES.primary,
  primaryDark: '#2563eb',
  connector: CHART_NEUTRAL.muted,
  connectorText: CHART_NEUTRAL.body,
  merge: '#0f766e',
  mergeText: '#0f766e',
  mergeMuted: CHART_NEUTRAL.border,
} as const

export const GANTT_BAR_PALETTE = {
  auto: {
    fill: '#fef2f2',
    progressFill: CHART_SERIES.danger,
    stroke: '#fca5a5',
    actualFill: '#dc2626',
  },
  manualAttention: {
    fill: '#fffbeb',
    progressFill: CHART_SERIES.warning,
    stroke: '#facc15',
    actualFill: '#d97706',
  },
  manualInsert: {
    fill: '#fff7ed',
    progressFill: '#f97316',
    stroke: '#fdba74',
    actualFill: '#c2410c',
  },
  completed: {
    fill: '#d1fae5',
    progressFill: CHART_SERIES.success,
    stroke: '#6ee7b7',
    actualFill: '#047857',
  },
  blocked: {
    fill: '#fef3c7',
    progressFill: CHART_SERIES.warning,
    stroke: '#fbbf24',
    actualFill: '#b45309',
  },
  overdue: {
    fill: '#fee2e2',
    progressFill: CHART_SERIES.danger,
    stroke: '#fca5a5',
    actualFill: '#dc2626',
  },
  default: {
    fill: '#dbeafe',
    progressFill: '#2563eb',
    stroke: '#93c5fd',
    actualFill: '#1d4ed8',
  },
  grid: CHART_NEUTRAL.softSurface,
  today: '#fb7185',
  milestone: CHART_SERIES.warning,
  compare: CHART_NEUTRAL.text,
  dependency: {
    highlight: '#f97316',
    normal: CHART_NEUTRAL.muted,
  },
} as const

export const CRITICAL_PATH_NODE_PALETTE = {
  manualInsert: {
    fill: '#fff7ed',
    stroke: '#fb923c',
    tagFill: '#fed7aa',
    tagText: '#c2410c',
    title: '#9a3412',
    body: CHART_NEUTRAL.darkBody,
  },
  manualAttention: {
    fill: '#fffbeb',
    stroke: CHART_SERIES.warning,
    tagFill: '#fef3c7',
    tagText: '#b45309',
    title: '#92400e',
    body: CHART_NEUTRAL.darkBody,
  },
  autoCritical: {
    fill: '#fef2f2',
    stroke: CHART_SERIES.danger,
    tagFill: '#fecaca',
    tagText: '#b91c1c',
    title: '#7f1d1d',
    body: CHART_NEUTRAL.darkBody,
  },
  default: {
    fill: CHART_NEUTRAL.white,
    stroke: CHART_NEUTRAL.border,
    tagFill: CHART_NEUTRAL.surface,
    tagText: CHART_NEUTRAL.text,
    title: CHART_NEUTRAL.title,
    body: CHART_NEUTRAL.body,
  },
} as const

export const CRITICAL_PATH_LANE_PALETTE = {
  primary: {
    fill: '#fef2f2',
    stroke: '#fca5a5',
    labelFill: '#fee2e2',
    labelText: '#b91c1c',
  },
  alternate: {
    fill: '#eff6ff',
    stroke: '#93c5fd',
    labelFill: '#dbeafe',
    labelText: '#1d4ed8',
  },
  attention: {
    fill: '#fefce8',
    stroke: '#facc15',
    labelFill: '#fef9c3',
    labelText: '#854d0e',
  },
  manualInsert: {
    fill: '#fff7ed',
    stroke: '#fdba74',
    labelFill: '#ffedd5',
    labelText: '#c2410c',
  },
  default: {
    fill: CHART_NEUTRAL.canvas,
    stroke: CHART_NEUTRAL.border,
    labelFill: CHART_NEUTRAL.softSurface,
    labelText: '#334155',
  },
} as const

export const CRITICAL_PATH_EDGE_PALETTE = {
  primary: '#f43f5e',
  selected: '#2563eb',
  manual: '#fb923c',
  normal: CHART_NEUTRAL.muted,
  border: CHART_NEUTRAL.border,
  surface: CHART_NEUTRAL.white,
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
