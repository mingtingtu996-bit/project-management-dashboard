export function calculateNextWeeklyRun(
  now: Date,
  targetDayOfWeek: number,
  targetHour: number,
  targetMinute: number,
) {
  const targetDay = Math.min(6, Math.max(0, Math.trunc(targetDayOfWeek)))
  const candidate = new Date(now)
  const daysUntilTarget = (targetDay - candidate.getDay() + 7) % 7
  candidate.setDate(candidate.getDate() + daysUntilTarget)
  candidate.setHours(targetHour, targetMinute, 0, 0)
  if (candidate <= now) candidate.setDate(candidate.getDate() + 7)
  return candidate
}

export function calculateNextHourlyMinuteRun(now: Date, targetMinute: number) {
  const candidate = new Date(now)
  candidate.setMinutes(Math.min(59, Math.max(0, Math.trunc(targetMinute))), 0, 0)
  if (candidate <= now) candidate.setHours(candidate.getHours() + 1)
  return candidate
}

export function calculateNextDailyRun(now: Date, targetHour: number, targetMinute: number) {
  const candidate = new Date(now)
  candidate.setHours(
    Math.min(23, Math.max(0, Math.trunc(targetHour))),
    Math.min(59, Math.max(0, Math.trunc(targetMinute))),
    0,
    0,
  )
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
  return candidate
}

export function calculateNextHourlyIntervalRun(
  now: Date,
  intervalHours: number,
  targetMinute = 0,
) {
  const interval = Math.min(24, Math.max(1, Math.trunc(intervalHours)))
  const candidate = new Date(now)
  candidate.setMinutes(Math.min(59, Math.max(0, Math.trunc(targetMinute))), 0, 0)
  if (candidate <= now) candidate.setHours(candidate.getHours() + 1)
  while (candidate.getHours() % interval !== 0) {
    candidate.setHours(candidate.getHours() + 1)
  }
  return candidate
}

export type WallClockJobTimerOptions = {
  calculateNext: (now: Date) => Date
  execute: () => Promise<unknown>
  onScheduled?: (details: { now: Date; nextRun: Date; delayMs: number }) => void
  onError?: (error: unknown) => void
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

export class WallClockJobTimer {
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = true

  constructor(private readonly options: WallClockJobTimerOptions) {}

  start() {
    if (!this.stopped) return false
    this.stopped = false
    this.scheduleNext()
    return true
  }

  stop() {
    if (this.stopped) return false
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    return true
  }

  private scheduleNext() {
    if (this.stopped || this.timer) return
    const now = new Date()
    const nextRun = this.options.calculateNext(now)
    const delayMs = nextRun.getTime() - now.getTime()
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      throw new Error('Wall-clock scheduler must calculate a future run slot')
    }

    this.options.onScheduled?.({ now, nextRun, delayMs })
    if (delayMs > MAX_TIMER_DELAY_MS) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.scheduleNext()
      }, MAX_TIMER_DELAY_MS)
      this.timer.unref?.()
      return
    }

    this.timer = setTimeout(() => {
      this.timer = null
      void Promise.resolve()
        .then(() => this.options.execute())
        .catch((error) => this.options.onError?.(error))
        .finally(() => this.scheduleNext())
    }, delayMs)
    this.timer.unref?.()
  }
}
