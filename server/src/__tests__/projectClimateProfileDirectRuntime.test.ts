import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  direct: true,
  rawQuery: vi.fn(),
  supabaseFrom: vi.fn(() => {
    throw new Error('anonymous Supabase REST must not be used by the scheduled direct runtime')
  }),
  createCandidate: vi.fn(async () => ({ created: false, skipped: 'not_needed' })),
  listActiveProjectIds: vi.fn(async () => ['11111111-1111-4111-8111-111111111111']),
  fetchJsonWithLimits: vi.fn(),
  profileLocation: {
    province: null as string | null,
    city: null as string | null,
    adminCode: null as string | null,
  },
}))

vi.mock('../services/dbService.js', () => ({
  supabase: { from: state.supabaseFrom },
  usesDirectSqlRuntimePath: () => state.direct,
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: state.listActiveProjectIds,
}))

vi.mock('../services/regionalClimateRuleCandidateService.js', () => ({
  createRegionalClimateRuleCandidateForProfile: state.createCandidate,
}))

vi.mock('../services/externalJsonHttpClient.js', () => ({
  fetchJsonWithLimits: state.fetchJsonWithLimits,
}))

import {
  syncAllProjectClimateProfiles,
  syncProjectWeatherForecast,
} from '../services/projectClimateProfileService.js'

describe('project climate profile scheduled direct runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.direct = true
    process.env.WEATHER_LOOKUP_PROVIDER = 'generic'
    delete process.env.CITY_WEATHER_FORECAST_ENDPOINT
    state.fetchJsonWithLimits.mockReset()
    state.profileLocation = { province: null, city: null, adminCode: null }
    state.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO public.regional_climate_rules')) {
        return { rows: [{ id: 'rule-seed' }] }
      }
      if (sql.includes('FROM public.project_location_observations')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT location FROM public.projects')) {
        return { rows: [{ location: 'Unmapped construction site' }] }
      }
      if (sql.includes('INSERT INTO public.project_climate_profiles')) {
        return { rows: [] }
      }
      if (sql.includes('FROM public.project_climate_profiles')) {
        return {
          rows: [{
            project_id: '11111111-1111-4111-8111-111111111111',
            province: state.profileLocation.province,
            city: state.profileLocation.city,
            admin_code: state.profileLocation.adminCode,
            climate_region: 'default',
            thermal_zone: null,
            climate_tags: [],
            rainy_season_months: [],
            high_temp_months: [],
            cold_weather_months: [],
            typhoon_risk_level: 'none',
            flood_season_months: [],
            winter_shutdown_risk_level: 'none',
            confidence: 'low',
            location_consensus_status: 'default_fallback',
            observation_count: 0,
            distinct_user_count: 0,
            source: 'default',
            metadata: {},
            resolved_at: '2026-08-06T00:00:00.000Z',
          }],
        }
      }
      if (sql.includes('FROM public.regional_climate_rules')) {
        return { rows: [] }
      }
      throw new Error(`Unexpected direct climate SQL: ${sql}`)
    })
  })

  it('bootstraps and rebuilds active project profiles without anonymous REST access', async () => {
    const result = await syncAllProjectClimateProfiles()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      projectId: '11111111-1111-4111-8111-111111111111',
      profile: expect.objectContaining({
        projectId: '11111111-1111-4111-8111-111111111111',
      }),
      weather: expect.objectContaining({ status: 'degraded' }),
    })
    expect(result[0]).not.toHaveProperty('error')
    const sqlCalls = state.rawQuery.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO public.regional_climate_rules'))).toBe(true)
    expect(sqlCalls.some((sql) => sql.includes('FROM public.project_location_observations'))).toBe(true)
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO public.project_climate_profiles'))).toBe(true)
    expect(sqlCalls.some((sql) => sql.includes('FROM public.project_climate_profiles'))).toBe(true)
    const profileWrite = state.rawQuery.mock.calls.find(([sql]) => (
      String(sql).includes('INSERT INTO public.project_climate_profiles')
    ))
    expect(String(profileWrite?.[0] ?? '')).toContain('WHERE profile.project_id = $2::uuid')
    expect(profileWrite?.[1]).toEqual(expect.arrayContaining([
      '11111111-1111-4111-8111-111111111111',
    ]))
    expect(state.supabaseFrom).not.toHaveBeenCalled()
  })

  it('fails configured weather synchronization when the provider returns no valid forecast rows', async () => {
    state.profileLocation = { province: 'Shanghai', city: 'Shanghai', adminCode: '310000' }
    process.env.CITY_WEATHER_FORECAST_ENDPOINT = 'https://weather.cma.cn/api/weather/empty-test'
    state.fetchJsonWithLimits.mockResolvedValue({})

    await expect(syncProjectWeatherForecast('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'WEATHER_FORECAST_EMPTY',
      projectId: '11111111-1111-4111-8111-111111111111',
    })

    const sqlCalls = state.rawQuery.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls.some((sql) => sql.includes('INSERT INTO public.project_weather_forecasts'))).toBe(false)
  })
})
