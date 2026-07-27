import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  calculateNextDailyRun,
  calculateNextHourlyIntervalRun,
  calculateNextHourlyMinuteRun,
  calculateNextWeeklyRun,
  WallClockJobTimer,
} from '../services/wallClockScheduleService.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('wall clock schedule service', () => {
  it('keeps a Monday 09:00 weekly slot on the same day when startup is Monday morning', () => {
    const now = new Date(2026, 6, 13, 8, 0, 0, 0)

    expect(calculateNextWeeklyRun(now, 1, 9, 0)).toEqual(new Date(2026, 6, 13, 9, 0, 0, 0))
  })

  it('moves a passed Monday weekly slot to the following Monday', () => {
    const now = new Date(2026, 6, 13, 10, 0, 0, 0)

    expect(calculateNextWeeklyRun(now, 1, 9, 0)).toEqual(new Date(2026, 6, 20, 9, 0, 0, 0))
  })

  it('uses the current hour when its target minute has not passed', () => {
    expect(calculateNextHourlyMinuteRun(
      new Date(2026, 6, 13, 10, 5, 0, 0),
      20,
    )).toEqual(new Date(2026, 6, 13, 10, 20, 0, 0))
  })

  it('keeps a daily slot on the same day before the target time', () => {
    expect(calculateNextDailyRun(
      new Date(2026, 6, 13, 8, 0, 0, 0),
      8,
      30,
    )).toEqual(new Date(2026, 6, 13, 8, 30, 0, 0))
  })

  it('moves a passed daily slot to the next calendar day', () => {
    expect(calculateNextDailyRun(
      new Date(2026, 6, 13, 8, 31, 0, 0),
      8,
      30,
    )).toEqual(new Date(2026, 6, 14, 8, 30, 0, 0))
  })

  it('realigns interval jobs to a stable wall-clock boundary', () => {
    expect(calculateNextHourlyIntervalRun(
      new Date(2026, 6, 13, 10, 5, 0, 0),
      2,
      0,
    )).toEqual(new Date(2026, 6, 13, 12, 0, 0, 0))
  })

  it('recomputes the next wall-clock slot after every completed run', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const execute = vi.fn().mockResolvedValue(undefined)
    const timer = new WallClockJobTimer({
      calculateNext: (now) => calculateNextHourlyMinuteRun(now, 20),
      execute,
    })

    expect(timer.start()).toBe(true)
    expect(timer.start()).toBe(false)

    await vi.advanceTimersByTimeAsync(15 * 60 * 1_000)
    expect(execute).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000)
    expect(execute).toHaveBeenCalledTimes(2)

    expect(timer.stop()).toBe(true)
    expect(timer.stop()).toBe(false)
  })

  it('chunks delays longer than the Node timer limit without executing early', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 2, 0, 0, 0, 0))
    const execute = vi.fn().mockResolvedValue(undefined)
    const timer = new WallClockJobTimer({
      calculateNext: () => new Date(2026, 7, 1, 4, 15, 0, 0),
      execute,
    })

    timer.start()
    await vi.advanceTimersByTimeAsync(24 * 24 * 60 * 60 * 1_000)
    expect(execute).not.toHaveBeenCalled()
    timer.stop()
  })
})
