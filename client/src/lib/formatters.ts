export function formatNumber(value: number, fallback = '0'): string {
  if (!Number.isFinite(value)) return fallback
  return value.toLocaleString('zh-CN')
}

export function clampPercent(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, value))
}

export function formatPercent(
  value: number,
  fallback = '0.0%',
  options: { fractionDigits?: number; clamp?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return fallback
  const fractionDigits = options.fractionDigits ?? 1
  const normalized = options.clamp === false ? value : clampPercent(value)
  return `${normalized.toFixed(fractionDigits)}%`
}

export function formatWholePercent(value: number, fallback = '0%'): string {
  return formatPercent(value, fallback, { fractionDigits: 0 })
}

export function formatRatioPercent(value: number, fallback = '0%'): string {
  if (!Number.isFinite(value)) return fallback
  const percentValue = Math.abs(value) <= 1 ? value * 100 : value
  return formatWholePercent(percentValue, fallback)
}

export function formatMetricValue(value: string | number | null | undefined, unit = '', fallback = '--'): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${formatNumber(value)}${unit}` : fallback
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? `${trimmed}${unit}` : fallback
  }

  return fallback
}

export function formatDate(value?: string | Date | null, fallback = '—'): string {
  if (!value) return fallback

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return fallback
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10)
  }

  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return fallback
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateTime(value?: string | Date | null, fallback = '—'): string {
  if (!value) return fallback

  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return fallback

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date, fallback)} ${hours}:${minutes}`
}
