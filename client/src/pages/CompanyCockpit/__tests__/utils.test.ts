import { describe, expect, it } from 'vitest'

import type { DurationMetricDto } from '@/lib/durationMetric'
import type { ProjectSummary } from '@/services/dashboardApi'

import { formatDeliveryHint, readFutureDeliveryDaysRemaining } from '../utils'

function durationMetric(
  value: number | null,
  unit: DurationMetricDto['unit'],
  availability: DurationMetricDto['availability'] = 'available',
): DurationMetricDto {
  return {
    value: availability === 'available' ? value : null,
    unit,
    calendarRef: availability === 'available'
      ? unit === 'calendar_day' ? 'gregorian' : 'calendar-project-1'
      : null,
    calendarVersion: availability === 'available'
      ? unit === 'calendar_day' ? 'gregorian-v1' : 'calendar-project-1-v3'
      : null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-07-28',
    availability,
    unavailableReason: availability === 'available' ? null : 'construction_calendar_unavailable',
  }
}

function projectSummary(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    plannedEndDate: '2026-07-14',
    ...overrides,
  } as ProjectSummary
}

describe('Company Cockpit delivery duration formatting', () => {
  it('uses production-day actual overdue instead of a negative Gregorian due window', () => {
    const summary = projectSummary({
      futureDueWindow: durationMetric(-14, 'calendar_day'),
      actualOverdue: durationMetric(2, 'construction_production_day'),
    })

    expect(formatDeliveryHint(summary)).toBe('计划交付 2026-07-14 · 已延期 2 个生产日')
    expect(formatDeliveryHint(summary)).not.toContain('14 个日历天')
  })

  it('shows an explicit unavailable state when actual overdue lacks calendar authority', () => {
    const summary = projectSummary({
      futureDueWindow: durationMetric(-14, 'calendar_day'),
      actualOverdue: durationMetric(null, 'construction_production_day', 'unavailable'),
    })

    expect(formatDeliveryHint(summary)).toBe('计划交付 2026-07-14 · 实际延期口径暂不可用')
    expect(formatDeliveryHint(summary)).not.toContain('14 个日历天')
    expect(formatDeliveryHint(summary)).not.toContain('已延期 0')
  })

  it('keeps a positive future due window as a Gregorian countdown', () => {
    const summary = projectSummary({
      futureDueWindow: durationMetric(14, 'calendar_day'),
      actualOverdue: null,
    })

    expect(formatDeliveryHint(summary)).toBe('计划交付 2026-07-14 · 剩余 14 个日历天')
  })

  it('does not expose a negative Gregorian due window as days remaining', () => {
    expect(readFutureDeliveryDaysRemaining(projectSummary({
      futureDueWindow: durationMetric(-14, 'calendar_day'),
    }))).toBeNull()
    expect(readFutureDeliveryDaysRemaining(projectSummary({
      futureDueWindow: durationMetric(14, 'calendar_day'),
    }))).toBe(14)
  })
})
