import {
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from '../services/constructionCalendar.js'

const DAY_MS = 86_400_000

export type DurationDateInput = string | Date | null | undefined

export function calendarDaysToMilliseconds(days: number) {
  if (!Number.isFinite(days)) return 0
  return Math.max(0, days) * DAY_MS
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function datePartsText(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`
}

function isValidDateOnlyText(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizeDateOnlyText(value: DurationDateInput): string | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return datePartsText(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }

  const text = String(value).trim()
  if (!text) return null
  const prefixedDate = text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  if (prefixedDate) return isValidDateOnlyText(prefixedDate) ? prefixedDate : null
  if (!/\b\d{4}\b/.test(text)) return null

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return datePartsText(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
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

export function orderedInclusiveDurationDays(start: DurationDateInput, end: DurationDateInput): number | null {
  const startDate = normalizeDurationDateUtc(start)
  const endDate = normalizeDurationDateUtc(end)
  if (!startDate || !endDate) return null
  if (endDate.getTime() < startDate.getTime()) return null

  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1
}

export function signedDurationDayDelta(start: DurationDateInput, end: DurationDateInput): number | null {
  const startDate = normalizeDurationDateUtc(start)
  const endDate = normalizeDurationDateUtc(end)
  if (!startDate || !endDate) return null

  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS)
}

export function delayDayDelta(
  plannedDate: DurationDateInput,
  actualDate: DurationDateInput,
  calendar?: ConstructionCalendarContext | null,
): number | null {
  const planned = normalizeDurationDateUtc(plannedDate)
  const actual = normalizeDurationDateUtc(actualDate)
  if (!planned || !actual) return null

  const rawDelta = Math.round((actual.getTime() - planned.getTime()) / DAY_MS)
  if (rawDelta === 0 || !calendar?.windows?.length) return rawDelta

  const direction = rawDelta > 0 ? 1 : -1
  const start = new Date(direction > 0 ? planned : actual)
  start.setUTCDate(start.getUTCDate() + 1)
  const end = direction > 0 ? actual : planned
  const productionDays = productionDaysBetweenInclusive(start, end, calendar)
  return direction * productionDays
}
