import { describe, expect, it } from 'vitest'

import {
  buildCalendarDayDurationMetric,
  buildConstructionProductionDayRiskDistribution,
  buildConstructionProductionDayDurationMetric,
  normalizeDurationRiskDistributionDto,
} from '../services/durationMetricService.js'

describe('durationMetricService', () => {
  it('builds an identified calendar-day metric with an explicit as-of date', () => {
    expect(buildCalendarDayDurationMetric(30, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
    })).toEqual({
      value: 30,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-20',
      availability: 'available',
      unavailableReason: null,
    })
  })

  it('fails closed when a production-day value lacks calendar identity', () => {
    expect(buildConstructionProductionDayDurationMetric(4, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
      calendar: { basis: 'calendar_day', windows: [] },
    })).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      calendarRef: null,
      calendarVersion: null,
      asOf: '2026-07-20',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
  })

  it('rejects a calendar-day basis even when identity-shaped fields are present', () => {
    expect(buildConstructionProductionDayDurationMetric(4, {
      asOf: '2026-07-20',
      calendar: {
        basis: 'calendar_day',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })).toEqual(expect.objectContaining({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }))
  })

  it('preserves production-day calendar identity when the metric is available', () => {
    expect(buildConstructionProductionDayDurationMetric(-3, {
      asOf: '2026-07-20',
      timezone: 'Asia/Shanghai',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
    })).toEqual(expect.objectContaining({
      value: -3,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-20',
      availability: 'available',
      unavailableReason: null,
    }))
  })

  it('accepts a real leap day as a strict date-only as-of value', () => {
    expect(buildCalendarDayDurationMetric(1, {
      asOf: '2028-02-29',
      timezone: 'Asia/Shanghai',
    })).toEqual(expect.objectContaining({
      value: 1,
      asOf: '2028-02-29',
      availability: 'available',
    }))
  })

  it.each(['2026-99-99', '2026-02-30', '2026-04-31'])('fails closed for invalid date-only as-of %s', (asOf) => {
    expect(buildCalendarDayDurationMetric(1, {
      asOf,
      timezone: 'Asia/Shanghai',
    })).toEqual(expect.objectContaining({
      value: null,
      asOf: '',
      availability: 'unavailable',
      unavailableReason: 'as_of_missing',
    }))
  })

  it('builds a typed production-day risk distribution from governed benchmark metadata', () => {
    expect(buildConstructionProductionDayRiskDistribution({
      p20: 3,
      p50: 4,
      p80: 8,
      source: 'duration_benchmarks',
      scope: 'company',
      sampleCount: 24,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'calendar-1',
        calendarVersion: 'calendar-v3',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      },
      provenanceAvailability: 'available',
    })).toEqual(expect.objectContaining({
      availability: 'available',
      source: 'duration_benchmarks',
      scope: 'company',
      sampleCount: 24,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      p50Duration: expect.objectContaining({ value: 4, asOf: '2026-06-30', availability: 'available' }),
      p80Duration: expect.objectContaining({ value: 8, asOf: '2026-06-30', availability: 'available' }),
      reserveDuration: expect.objectContaining({ value: 4, asOf: '2026-06-30', availability: 'available' }),
    }))
  })

  it('fails the complete risk distribution closed when governed provenance is unavailable', () => {
    expect(buildConstructionProductionDayRiskDistribution({
      p50: 4,
      p80: 8,
      source: 'duration_benchmarks',
      scope: 'company',
      sampleCount: 24,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'calendar-1',
        calendarVersion: 'calendar-v3',
        timezone: 'Asia/Shanghai',
        availability: 'available',
      },
      provenanceAvailability: 'unavailable',
      unavailableReason: 'benchmark_provenance_missing',
    })).toEqual(expect.objectContaining({
      availability: 'unavailable',
      unavailableReason: 'benchmark_provenance_missing',
      p50Duration: expect.objectContaining({ value: null, availability: 'unavailable' }),
      p80Duration: expect.objectContaining({ value: null, availability: 'unavailable' }),
      reserveDuration: expect.objectContaining({ value: null, availability: 'unavailable' }),
    }))
  })

  it('does not invent a history sample count for a governed system-asset distribution', () => {
    expect(buildConstructionProductionDayRiskDistribution({
      p20: 15,
      p50: 18,
      p80: 24,
      source: 'system_standard_duration_asset',
      scope: 'system',
      sampleCount: null,
      generatedAt: '2026-07-21T08:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
      },
      provenanceAvailability: 'available',
    })).toEqual(expect.objectContaining({
      availability: 'available',
      sampleCount: null,
      reserveDuration: expect.objectContaining({ value: 6, availability: 'available' }),
    }))
  })

  it('normalizes a complete identified production-day distribution', () => {
    const distribution = buildConstructionProductionDayRiskDistribution({
      p20: 8,
      p50: 10,
      p80: 14,
      source: 'accepted_real_project_outcome',
      scope: 'company',
      sampleCount: 3,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      calendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
      },
      provenanceAvailability: 'available',
    })

    expect(normalizeDurationRiskDistributionDto(distribution)).toEqual(distribution)
  })

  it('rejects available distributions with missing identity, timestamp, or reserve consistency', () => {
    const metric = (value: number) => ({
      value,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-06-30',
      availability: 'available',
      unavailableReason: null,
    })
    const base = {
      p20Duration: metric(8),
      p50Duration: metric(10),
      p80Duration: metric(14),
      reserveDuration: metric(4),
      source: 'accepted_real_project_outcome',
      scope: 'company',
      sampleCount: 3,
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      availability: 'available',
      unavailableReason: null,
    }

    expect(normalizeDurationRiskDistributionDto({
      ...base,
      p50Duration: { ...base.p50Duration, calendarRef: null },
    })).toBeNull()
    expect(normalizeDurationRiskDistributionDto({ ...base, sourceAsOf: null })).toBeNull()
    expect(normalizeDurationRiskDistributionDto({ ...base, reserveDuration: metric(99) })).toBeNull()
  })
})
