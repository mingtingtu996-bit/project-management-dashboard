import { describe, expect, it } from 'vitest'

import {
  normalizeTaskSummaryCompareGranularity,
  normalizeTaskSummaryComparePeriods,
} from '../services/taskSummaryCompareService.js'

describe('taskSummaryCompareService', () => {
  it('normalizes unsupported granularities back to day', () => {
    expect(normalizeTaskSummaryCompareGranularity('year')).toBe('day')
    expect(normalizeTaskSummaryCompareGranularity('month')).toBe('month')
  })

  it('expands month periods into full date ranges', () => {
    const periods = normalizeTaskSummaryComparePeriods([
      {
        label: '本月',
        from: '2026-04',
        to: '2026-04',
      },
    ], 'month')

    expect(periods).toEqual([
      {
        label: '本月',
        from: '2026-04-01',
        to: '2026-04-30',
      },
    ])
  })
})
