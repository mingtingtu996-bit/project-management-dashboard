import { afterEach, describe, expect, it } from 'vitest'

import {
  getOfficialWeatherProviderStatus,
  parseWeatherForecastPayload,
  resolveOfficialWeatherRequest,
  type ProjectClimateProfile,
} from '../services/projectClimateProfileService.js'

function profile(overrides: Partial<ProjectClimateProfile> = {}): ProjectClimateProfile {
  return {
    projectId: 'project-1',
    province: 'Shanghai',
    city: 'Shanghai',
    adminCode: '310000',
    climateRegion: 'east',
    thermalZone: 'hot_summer_cold_winter',
    climateTags: [],
    rainySeasonMonths: [6, 7],
    highTempMonths: [7, 8],
    coldWeatherMonths: [1, 2],
    typhoonRiskLevel: 'low',
    floodSeasonMonths: [6, 7],
    winterShutdownRiskLevel: 'none',
    softSoilLevel: 0,
    mountainTerrain: false,
    terrainDifficultyLevel: 0,
    seismicIntensity: null,
    confidence: 'medium',
    locationConsensusStatus: 'project_location_fallback',
    observationCount: 0,
    distinctUserCount: 0,
    source: 'project_location',
    sourceRuleId: null,
    weatherProvider: null,
    lastWeatherSyncedAt: null,
    metadata: {},
    resolvedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  delete process.env.OFFICIAL_WEATHER_PROVIDER
  delete process.env.WEATHER_LOOKUP_PROVIDER
  delete process.env.OFFICIAL_WEATHER_AREA_ID_MAP_JSON
  delete process.env.SMARTWEATHER_API_APP_ID
  delete process.env.SMARTWEATHER_API_PRIVATE_KEY
  delete process.env.SMARTWEATHER_API_BASE_URL
  delete process.env.SMARTWEATHER_API_TYPE
  delete process.env.OFFICIAL_WEATHER_STATION_ID_MAP_JSON
  delete process.env.CMA_PUBLIC_WEATHER_BASE_URL
  delete process.env.CITY_WEATHER_FORECAST_ENDPOINT
  delete process.env.CITY_WEATHER_FORECAST_PROVIDER
  delete process.env.OPEN_METEO_GEOCODING_BASE_URL
  delete process.env.OPEN_METEO_FORECAST_BASE_URL
})

describe('official weather provider', () => {
  it('builds a signed China Weather SmartWeatherAPI request without leaking the private key into sourceUrl', () => {
    process.env.OFFICIAL_WEATHER_PROVIDER = 'smartweatherapi'
    process.env.OFFICIAL_WEATHER_AREA_ID_MAP_JSON = JSON.stringify({ '310000': '101020100' })
    process.env.SMARTWEATHER_API_APP_ID = 'abcdef123456'
    process.env.SMARTWEATHER_API_PRIVATE_KEY = 'private-key-for-test'
    process.env.SMARTWEATHER_API_BASE_URL = 'https://open.weather.com.cn/data/'

    const request = resolveOfficialWeatherRequest(profile())

    expect(request).toEqual(expect.objectContaining({
      provider: 'china_weather_smartweatherapi',
      adapter: 'smartweatherapi',
      areaId: '101020100',
    }))
    expect(request?.endpoint).toContain('key=')
    expect(request?.endpoint).toContain('appid=abcdef')
    expect(request?.sourceUrl).not.toContain('key=')
    expect(request?.sourceUrl).not.toContain('private-key-for-test')
  })

  it('parses SmartWeatherAPI forecast_f rows into project weather forecast facts', () => {
    const rows = parseWeatherForecastPayload({
      f: {
        f0: '202605191100',
        f1: [
          { fa: '00', fb: '09', fc: '31', fd: '22', fg: '3-4' },
          { fa: '10', fb: '10', fc: '26', fd: '20', fg: '4-5' },
        ],
      },
    }, profile(), 'smartweatherapi')

    expect(rows).toEqual([
      expect.objectContaining({
        forecastDate: '2026-05-19',
        maxTempC: 31,
        minTempC: 22,
        warningTags: expect.arrayContaining(['weather_code:09']),
      }),
      expect.objectContaining({
        forecastDate: '2026-05-20',
        maxTempC: 26,
        minTempC: 20,
        warningTags: expect.arrayContaining(['weather_code:10']),
      }),
    ])
  })

  it('defaults to mainland CMA public weather instead of overseas on-demand lookup', () => {
    const status = getOfficialWeatherProviderStatus(profile())
    const request = resolveOfficialWeatherRequest(profile())

    expect(status).toEqual(expect.objectContaining({
      provider: 'cma_public_weather',
      configured: true,
      productionAuthorized: false,
      missing: [],
    }))
    expect(request).toEqual(expect.objectContaining({
      provider: 'cma_public_weather',
      adapter: 'cma_public_weather',
      areaId: '58367',
    }))
    expect(request?.endpoint).toContain('weather.cma.cn')
    expect(request?.endpoint).toContain('stationid=58367')
  })

  it('parses on-demand web forecast rows into project weather forecast facts', () => {
    const rows = parseWeatherForecastPayload({
      daily: {
        time: ['2026-06-01', '2026-06-02'],
        temperature_2m_max: [35.1, 39.8],
        temperature_2m_min: [25.3, 28.1],
        precipitation_sum: [0, 32],
        wind_speed_10m_max: [14, 28],
        relative_humidity_2m_max: [76, 94],
        snow_depth_max: [0, 0],
      },
    }, profile(), 'on_demand_web')

    expect(rows).toEqual([
      expect.objectContaining({
        forecastDate: '2026-06-01',
        maxTempC: 35.1,
        minTempC: 25.3,
        precipitationMm: 0,
      }),
      expect.objectContaining({
        forecastDate: '2026-06-02',
        maxTempC: 39.8,
        minTempC: 28.1,
        precipitationMm: 32,
        relativeHumidityPercent: 94,
        snowDepthCm: 0,
        warningTags: expect.arrayContaining(['heavy_rain']),
      }),
    ])
  })

  it('supports explicit CMA public weather station mappings', () => {
    process.env.OFFICIAL_WEATHER_PROVIDER = 'cma_public_weather'
    process.env.OFFICIAL_WEATHER_STATION_ID_MAP_JSON = JSON.stringify({ '310000': '58367' })

    const request = resolveOfficialWeatherRequest(profile())
    const status = getOfficialWeatherProviderStatus(profile())

    expect(request).toEqual(expect.objectContaining({
      provider: 'cma_public_weather',
      adapter: 'cma_public_weather',
      areaId: '58367',
    }))
    expect(status.productionAuthorized).toBe(false)
    expect(request?.endpoint).toContain('weather.cma.cn')
    expect(request?.endpoint).toContain('stationid=58367')
  })

  it('parses CMA public daily forecast rows into weather facts', () => {
    const rows = parseWeatherForecastPayload({
      data: {
        daily: [
          { date: '2026/06/01', high: '31', low: '23', dayText: '大雨', dayWindScale: '4-5级' },
          { date: '20260602', high: '35', low: '26', dayText: '多云' },
        ],
        alarm: [{ title: '暴雨蓝色预警' }],
      },
    }, profile(), 'cma_public_weather')

    expect(rows).toEqual([
      expect.objectContaining({
        forecastDate: '2026-06-01',
        maxTempC: 31,
        minTempC: 23,
        warningTags: expect.arrayContaining(['heavy_rain']),
      }),
      expect.objectContaining({
        forecastDate: '2026-06-02',
        maxTempC: 35,
        minTempC: 26,
      }),
    ])
    expect(parseWeatherForecastPayload({
      data: {
        daily: [
          { date: '2026/06/03', high: '28', low: '21', humidity: '92', snowDepth: '0' },
        ],
      },
    }, profile(), 'cma_public_weather')[0]).toEqual(expect.objectContaining({
      relativeHumidityPercent: 92,
      snowDepthCm: 0,
    }))
  })
})
