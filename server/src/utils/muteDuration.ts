const ALLOWED_MUTE_HOURS = [1, 4, 24, 168] as const

export type AllowedMuteHours = (typeof ALLOWED_MUTE_HOURS)[number]

const LABEL_BY_HOURS: Record<AllowedMuteHours, string> = {
  1: '1h',
  4: '4h',
  24: '24h',
  168: '7d',
}

function normalizeMuteDurationToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function getAllowedMuteHours(): AllowedMuteHours[] {
  return [...ALLOWED_MUTE_HOURS]
}

export function formatMuteDurationLabel(hours: number): string {
  if (hours === 168) return '7d'
  return `${hours}h`
}

export function formatMuteDurationMessage(hours: number): string {
  if (hours === 168) return '7 天'
  return `${hours} 小时`
}

export function parseMuteHours(input: unknown): AllowedMuteHours | null {
  if (typeof input === 'number' && Number.isInteger(input) && ALLOWED_MUTE_HOURS.includes(input as AllowedMuteHours)) {
    return input as AllowedMuteHours
  }

  const token = normalizeMuteDurationToken(input)
  if (!token) return null

  if (token.endsWith('h')) {
    const hours = Number(token.slice(0, -1))
    return Number.isInteger(hours) && ALLOWED_MUTE_HOURS.includes(hours as AllowedMuteHours)
      ? (hours as AllowedMuteHours)
      : null
  }

  if (token.endsWith('d')) {
    const days = Number(token.slice(0, -1))
    const hours = days * 24
    return Number.isInteger(hours) && ALLOWED_MUTE_HOURS.includes(hours as AllowedMuteHours)
      ? (hours as AllowedMuteHours)
      : null
  }

  const numeric = Number(token)
  return Number.isInteger(numeric) && ALLOWED_MUTE_HOURS.includes(numeric as AllowedMuteHours)
    ? (numeric as AllowedMuteHours)
    : null
}

export function parseMuteHoursFromRequest(input: {
  body?: Record<string, unknown> | null
  query?: Record<string, unknown> | null
}): AllowedMuteHours | null {
  const candidates = getMuteDurationCandidates(input)

  for (const candidate of candidates) {
    const parsed = parseMuteHours(candidate)
    if (parsed) return parsed
  }

  return null
}

export function hasExplicitMuteDurationInRequest(input: {
  body?: Record<string, unknown> | null
  query?: Record<string, unknown> | null
}): boolean {
  return getMuteDurationCandidates(input).some((candidate) => {
    if (candidate === undefined || candidate === null) return false
    return String(candidate).trim().length > 0
  })
}

function getMuteDurationCandidates(input: {
  body?: Record<string, unknown> | null
  query?: Record<string, unknown> | null
}) {
  const candidates = [
    input.body?.mutedHours,
    input.body?.mute_hours,
    input.body?.muteDuration,
    input.body?.mute_duration,
    input.query?.mutedHours,
    input.query?.mute_hours,
    input.query?.muteDuration,
    input.query?.mute_duration,
  ]
  return candidates
}

export function getMuteDurationMeta(hours: AllowedMuteHours) {
  return {
    hours,
    key: LABEL_BY_HOURS[hours],
    label: formatMuteDurationLabel(hours),
    messageLabel: formatMuteDurationMessage(hours),
  }
}
