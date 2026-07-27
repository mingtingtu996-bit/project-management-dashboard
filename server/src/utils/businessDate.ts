const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Shanghai'

export function toBusinessDateKey(
  date = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || process.env.TZ || DEFAULT_BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}
