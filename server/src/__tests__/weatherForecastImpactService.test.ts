import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    projectWeatherForecasts: [] as Row[],
    siteShutdownEvents: [] as Row[],
  }

  function createBuilder(table: string) {
    const filters: Array<{ op: 'eq' | 'gte' | 'lte'; column: string; value: unknown }> = []
    let limitCount: number | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return builder
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'gte', column, value })
        return builder
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'lte', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn((count: number) => {
        limitCount = count
        return builder
      }),
      upsert: vi.fn((rows: Row[]) => {
        if (table === 'site_shutdown_events') state.siteShutdownEvents.push(...rows)
        return Promise.resolve({ error: null })
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = table === 'project_weather_forecasts' ? state.projectWeatherForecasts : []
        const filtered = filters.reduce((result, filter) => {
          if (filter.op === 'eq') return result.filter((row) => row[filter.column] === filter.value)
          if (filter.op === 'gte') return result.filter((row) => String(row[filter.column] ?? '') >= String(filter.value))
          if (filter.op === 'lte') return result.filter((row) => String(row[filter.column] ?? '') <= String(filter.value))
          return result
        }, rows)
        const data = limitCount == null ? filtered : filtered.slice(0, limitCount)
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
    rawQuery: vi.fn(),
    getProjectCompanyId: vi.fn(),
    logger: {
      warn: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

import {
  classifyWeatherForecastImpacts,
  classifyWeatherForecastImpactWindows,
  loadProjectWeatherImpactSignalsWithDiagnostics,
} from '../services/weatherForecastImpactService.js'

describe('weatherForecastImpactService', () => {
  beforeEach(() => {
    mocks.state.projectWeatherForecasts = []
    mocks.state.siteShutdownEvents = []
    mocks.from.mockClear()
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [{ id: 'weather-candidate-event-1' }] })
    mocks.getProjectCompanyId.mockReset()
    mocks.getProjectCompanyId.mockResolvedValue('10000000-0000-4000-8000-000000000001')
    mocks.logger.warn.mockClear()
  })

  it('classifies heavy rain as candidate weather impact for planning algorithms', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-06-18',
      precipitation_mm: 32,
      warning_tags: ['暴雨蓝色预警'],
      provider: 'cma',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'heavy_rain',
      climateSignal: 'rainy_season',
      severity: 'medium',
      actionPolicy: 'candidate_only',
      multiplier: 1.08,
    }))
  })

  it('classifies extreme heat as candidate impact for heat-sensitive process families', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-07-20',
      max_temp_c: 40,
      warning_tags: ['高温橙色预警'],
      provider: 'cma',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'extreme_heat',
      climateSignal: 'summer_heat',
      severity: 'high',
      actionPolicy: 'candidate_only',
    }))
    expect(signals[0].reason).toContain('混凝土养护')
  })

  it('treats wind warning as a candidate impact for high-risk outdoor operations', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-09-01',
      wind_level: '7级',
      warning_tags: ['大风预警'],
      provider: 'cma',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'wind_warning',
      climateSignal: 'wind_warning',
      actionPolicy: 'candidate_only',
      multiplier: 1.06,
    }))
  })

  it('classifies 0-5C low-temperature windows because wet trades already need winter measures', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-11-15',
      min_temp_c: 3,
      provider: 'cma',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'low_temperature',
      climateSignal: 'winter_low_temp',
      severity: 'medium',
      actionPolicy: 'candidate_only',
      multiplier: 1.06,
    }))
  })

  it('keeps weather source credibility as internal algorithm evidence', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-06-18',
      precipitation_mm: 32,
      warning_tags: ['heavy_rain'],
      provider: 'open_meteo_on_demand',
      source_url: 'https://api.open-meteo.com/v1/forecast',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      sourceReliability: 'public_web_reference',
      sourceReliabilityScore: 0.72,
      confidenceDelta: -12,
    }))
    expect(signals[0].evidence).toEqual(expect.objectContaining({
      weatherSourceReliability: 'public_web_reference',
      weatherSourceReliabilityScore: 0.72,
      sourceCredibilityPolicy: 'internal_algorithm_only',
    }))
  })

  it('models red rainstorm plus red typhoon as an explicit site shutdown event', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-08-18',
      precipitation_mm: 120,
      wind_level: '10',
      warning_tags: ['red rainstorm', 'red typhoon'],
      provider: 'cma',
      source_url: 'https://weather.cma.cn',
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'site_shutdown_event',
      climateSignal: 'wind_warning',
      severity: 'high',
      actionPolicy: 'candidate_only',
      multiplier: 1,
      siteShutdownEvent: expect.objectContaining({
        eventType: 'compound_red_weather',
        eventDate: '2026-08-18',
        shutdownDays: 1,
        status: 'candidate',
      }),
    }))
    expect(signals[0].evidence).toEqual(expect.objectContaining({
      shutdownModel: 'site_shutdown_event',
      precipitationMm: 120,
    }))

    const heavyRain = signals.find((signal) => signal.impactType === 'heavy_rain')
    expect(heavyRain).toEqual(expect.objectContaining({
      multiplier: 1,
      actionPolicy: 'confidence_only',
    }))
    expect(heavyRain?.evidence).toEqual(expect.objectContaining({
      redRainstormOwnedByShutdownEvent: true,
      shutdownModel: 'owned_by_site_shutdown_event',
    }))
  })

  it('classifies humidity, snow, thunderstorm and dust signals with process-safe policies', () => {
    const humidity = classifyWeatherForecastImpacts({
      forecast_date: '2026-04-10',
      relative_humidity_percent: 96,
      provider: 'cma',
    })
    expect(humidity[0]).toEqual(expect.objectContaining({
      impactType: 'persistent_humidity',
      climateSignal: 'persistent_humidity',
      severity: 'high',
      actionPolicy: 'candidate_only',
    }))

    const snow = classifyWeatherForecastImpacts({
      forecast_date: '2026-12-10',
      snow_depth_cm: 6,
      provider: 'cma',
    })
    expect(snow[0]).toEqual(expect.objectContaining({
      impactType: 'snow_ice',
      climateSignal: 'snow_ice',
      severity: 'high',
      actionPolicy: 'candidate_only',
    }))

    const thunder = classifyWeatherForecastImpacts({
      forecast_date: '2026-08-10',
      warning_tags: ['lightning'],
      provider: 'cma',
    })
    expect(thunder[0]).toEqual(expect.objectContaining({
      impactType: 'thunderstorm',
      multiplier: 1,
      actionPolicy: 'confidence_only',
    }))

    const dust = classifyWeatherForecastImpacts({
      forecast_date: '2026-04-10',
      warning_tags: ['sandstorm'],
      provider: 'cma',
    })
    expect(dust[0]).toEqual(expect.objectContaining({
      impactType: 'dust_storm',
      climateSignal: 'dust_storm',
      actionPolicy: 'candidate_only',
    }))
  })

  it('aggregates continuous 3-7 day high-humidity windows into one explicit humidity signal', () => {
    const signals = classifyWeatherForecastImpactWindows([
      { forecast_date: '2026-03-01', relative_humidity_percent: 88, provider: 'cma' },
      { forecast_date: '2026-03-02', relative_humidity_percent: 91, provider: 'cma' },
      { forecast_date: '2026-03-03', relative_humidity_percent: 92, provider: 'cma' },
      { forecast_date: '2026-03-04', relative_humidity_percent: 96, provider: 'cma' },
      { forecast_date: '2026-03-05', relative_humidity_percent: 94, provider: 'cma' },
      { forecast_date: '2026-03-06', relative_humidity_percent: 93, provider: 'cma' },
      { forecast_date: '2026-03-07', relative_humidity_percent: 92, provider: 'cma' },
      { forecast_date: '2026-03-08', relative_humidity_percent: 91, provider: 'cma' },
    ])

    const windowSignal = signals.find((signal) => (
      signal.impactType === 'persistent_humidity'
      && signal.evidence.windowAggregationPolicy === 'continuous_3_to_7_day_humidity_window'
    ))

    expect(windowSignal).toEqual(expect.objectContaining({
      impactType: 'persistent_humidity',
      climateSignal: 'persistent_humidity',
      severity: 'high',
      multiplier: 1.1,
      forecastDate: '2026-03-02',
    }))
    expect(windowSignal?.evidence).toEqual(expect.objectContaining({
      humidityWindowDays: 7,
      humidityWindowStartDate: '2026-03-02',
      humidityWindowEndDate: '2026-03-08',
      maxRelativeHumidityPercent: 96,
      highHumidityForecastDates: [
        '2026-03-02',
        '2026-03-03',
        '2026-03-04',
        '2026-03-05',
        '2026-03-06',
        '2026-03-07',
        '2026-03-08',
      ],
    }))
  })

  it('accepts row-level weather multiplier overrides instead of fixed branch constants', () => {
    const signals = classifyWeatherForecastImpacts({
      forecast_date: '2026-08-05',
      max_temp_c: 41,
      provider: 'cma',
      impact_multiplier_config: {
        extreme_heat: { high: 1.16 },
      },
    })

    expect(signals[0]).toEqual(expect.objectContaining({
      impactType: 'extreme_heat',
      severity: 'high',
      multiplier: 1.16,
    }))
    expect(signals[0].evidence).toEqual(expect.objectContaining({
      multiplierPolicy: 'configurable_weather_impact_multiplier',
      multiplierOverrideSource: 'row.impact_multiplier_config',
    }))
  })

  it('bridges loaded project weather impact signals into unified governance candidate events', async () => {
    mocks.state.projectWeatherForecasts = [
      {
        id: 'forecast-1',
        project_id: 'project-1',
        forecast_date: '2026-06-18',
        precipitation_mm: 32,
        warning_tags: ['暴雨蓝色预警'],
        provider: 'cma',
        source_url: 'https://weather.cma.cn',
      },
    ]

    const result = await loadProjectWeatherImpactSignalsWithDiagnostics({
      projectId: 'project-1',
      startDate: '2026-06-18',
      endDate: '2026-06-18',
    })

    expect(result).toEqual(expect.objectContaining({
      sourceStatus: 'ok',
      signals: [
        expect.objectContaining({
          impactType: 'heavy_rain',
          actionPolicy: 'candidate_only',
        }),
      ],
    }))
    expect(mocks.getProjectCompanyId).toHaveBeenCalledWith('project-1')
    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'weather.forecast.impact.heavy_rain.2026-06-18',
      'weatherForecastImpactService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      'project-1',
      'context_factor',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
      'candidate_only',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        impactType: 'heavy_rain',
        actionPolicy: 'candidate_only',
        forecastDate: '2026-06-18',
        sourceForecastId: 'forecast-1',
      }),
    ]))
  })
})
