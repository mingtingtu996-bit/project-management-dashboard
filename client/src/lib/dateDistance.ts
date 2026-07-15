const DAY_MS = 86_400_000
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export type LocalDateDistanceInput = string | Date | null | undefined

type LocalDateParts = {
  year: number
  monthIndex: number
  day: number
}

function readDateOnlyParts(value: string): LocalDateParts | null {
  const match = DATE_ONLY_PATTERN.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const local = new Date(year, monthIndex, day)
  if (
    Number.isNaN(local.getTime())
    || local.getFullYear() !== year
    || local.getMonth() !== monthIndex
    || local.getDate() !== day
  ) {
    return null
  }
  return { year, monthIndex, day }
}

function readLocalDateParts(value: LocalDateDistanceInput): LocalDateParts | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return {
      year: value.getFullYear(),
      monthIndex: value.getMonth(),
      day: value.getDate(),
    }
  }

  const text = String(value).trim()
  if (!text) return null

  const dateOnly = readDateOnlyParts(text)
  if (dateOnly) return dateOnly
  if (DATE_ONLY_PATTERN.test(text)) return null

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return {
    year: parsed.getFullYear(),
    monthIndex: parsed.getMonth(),
    day: parsed.getDate(),
  }
}

function toSerialDay(parts: LocalDateParts) {
  return Math.floor(Date.UTC(parts.year, parts.monthIndex, parts.day) / DAY_MS)
}

export function normalizeLocalDateMidnight(value: LocalDateDistanceInput): Date | null {
  const parts = readLocalDateParts(value)
  return parts ? new Date(parts.year, parts.monthIndex, parts.day) : null
}

export function daysUntilLocalDate(
  targetDate: LocalDateDistanceInput,
  today: LocalDateDistanceInput = new Date(),
): number | null {
  const target = readLocalDateParts(targetDate)
  const base = readLocalDateParts(today)
  if (!target || !base) return null
  return toSerialDay(target) - toSerialDay(base)
}

export function elapsedLocalDaysSince(
  startDate: LocalDateDistanceInput,
  today: LocalDateDistanceInput = new Date(),
): number | null {
  const daysUntil = daysUntilLocalDate(startDate, today)
  return daysUntil === null ? null : Math.max(0, -daysUntil)
}
