export const MUTE_DURATION_OPTIONS = [
  { hours: 1, label: '1h', description: '临时静音 1 小时' },
  { hours: 4, label: '4h', description: '半天内先不提醒' },
  { hours: 24, label: '24h', description: '静音 24 小时' },
  { hours: 168, label: '7d', description: '静音 7 天' },
] as const

export type MuteDurationOption = (typeof MUTE_DURATION_OPTIONS)[number]
export type AllowedMuteHours = MuteDurationOption['hours']

export function getMuteDurationOption(hours: number): MuteDurationOption {
  return MUTE_DURATION_OPTIONS.find((option) => option.hours === hours) ?? MUTE_DURATION_OPTIONS[2]
}

export function buildMutedUntil(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

export function getMuteDurationActionLabel(hours: number): string {
  return `静音 ${getMuteDurationOption(hours).label}`
}
