export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('zh-CN')
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.0%'
  return `${value.toFixed(1)}%`
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
