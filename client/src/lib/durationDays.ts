const DAY_MS = 86_400_000

export type DurationDateInput = string | Date | null | undefined

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function normalizeDurationDateUtc(value: DurationDateInput): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }

  const text = String(value).trim()
  if (!text) return null

  const dateText = /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : (() => {
      const parsed = new Date(text)
      if (Number.isNaN(parsed.getTime())) return null
      return `${parsed.getUTCFullYear()}-${padDatePart(parsed.getUTCMonth() + 1)}-${padDatePart(parsed.getUTCDate())}`
    })()

  if (!dateText) return null
  const date = new Date(`${dateText}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function inclusiveDurationDays(start: DurationDateInput, end: DurationDateInput): number | null {
  const startDate = normalizeDurationDateUtc(start)
  const endDate = normalizeDurationDateUtc(end)
  if (!startDate || !endDate) return null

  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1)
}

export function delayDayDelta(start: DurationDateInput, end: DurationDateInput): number | null {
  const startDate = normalizeDurationDateUtc(start)
  const endDate = normalizeDurationDateUtc(end)
  if (!startDate || !endDate) return null

  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS)
}
