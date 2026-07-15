import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query: any = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.gte = vi.fn(() => query)
  query.lte = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.limit = vi.fn(() => query)
  query.then = vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => (
    Promise.resolve({ data: [], error: null }).then(resolve, reject)
  ))

  return {
    from: vi.fn(() => query),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import { loadProjectWeatherImpactSignalsWithDiagnostics } from '../services/weatherImpactSignalReadModelService.js'

describe('weatherImpactSignalReadModelService', () => {
  beforeEach(() => {
    mocks.from.mockClear()
  })

  it('rejects display-only task dates before building a forecast query', async () => {
    const result = await loadProjectWeatherImpactSignalsWithDiagnostics({
      projectId: 'project-1',
      startDate: 'Mon Apr 06',
      endDate: 'Tue Apr 28',
    })

    expect(result).toEqual({
      signals: [],
      sourceStatus: 'not_configured_or_no_forecast',
      confidenceReason: 'weather_forecast_lookup_invalid_date',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
