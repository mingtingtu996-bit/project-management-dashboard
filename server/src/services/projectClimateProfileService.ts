import { createHmac } from 'node:crypto'

import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import {
  V1474_REGIONAL_CLIMATE_RULE_SEED,
  type V1474RegionalClimateRule,
} from '../seeds/v1474RegionalClimateRuleSeed.js'
import type { V1474RegionCode } from '../seeds/v1474SeasonalProductivitySeed.js'
import { createRegionalClimateRuleCandidateForProfile } from './regionalClimateRuleCandidateService.js'
import { fetchJsonWithLimits } from './externalJsonHttpClient.js'
import type {
  ClimateSource,
  Confidence,
  LocationConsensusStatus,
  ProjectClimateProfile,
} from '../types/projectClimateProfile.js'

export type {
  ClimateSource,
  Confidence,
  LocationConsensusStatus,
  ProjectClimateProfile,
} from '../types/projectClimateProfile.js'

export type ProjectLocationObservationInput = {
  projectId: string
  observedByUserId?: string | null
  province?: string | null
  city?: string | null
  adminCode?: string | null
  source?: 'browser_geolocation' | 'ip_location' | 'project_location' | 'system_inference'
  confidence?: Confidence
  rawSourceSnapshot?: Record<string, unknown>
}

export type BrowserCoordinateObservationInput = {
  projectId: string
  observedByUserId?: string | null
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  signal?: AbortSignal
}

type WeatherSyncOptions = {
  signal?: AbortSignal
}

type LocationObservationRow = {
  id?: string
  project_id: string
  observed_by_user_id?: string | null
  province?: string | null
  city?: string | null
  admin_code?: string | null
  source?: string | null
  confidence?: Confidence | null
  observed_at?: string | null
}

type RegionalClimateRuleRow = {
  id?: string | null
  province?: string | null
  city?: string | null
  admin_code?: string | null
  climate_region?: V1474RegionCode | null
  thermal_zone?: string | null
  rainy_season_months?: number[] | null
  high_temp_months?: number[] | null
  cold_weather_months?: number[] | null
  typhoon_risk_level?: string | null
  flood_season_months?: number[] | null
  winter_shutdown_risk_level?: string | null
  climate_tags?: string[] | null
  soft_soil_level?: number | null
  mountain_terrain?: boolean | null
  terrain_difficulty_level?: number | null
  seismic_intensity?: number | null
  source_standard?: string | null
  source_version?: string | null
  source_clause_ref?: string | null
  evidence_sources?: unknown
  confidence?: Confidence | null
}

type WeatherForecastInput = {
  projectId: string
  forecastCity?: string | null
  forecastAdminCode?: string | null
  provider: string
  sourceUrl?: string | null
  forecasts: Array<{
    forecastDate: string
    minTempC?: number | null
    maxTempC?: number | null
    precipitationMm?: number | null
    relativeHumidityPercent?: number | null
    snowDepthCm?: number | null
    windLevel?: string | null
    warningTags?: string[] | null
    providerRecordId?: string | null
    rawPayload?: Record<string, unknown>
  }>
}

const CMA_PUBLIC_STATION_ID_FALLBACK_MAP: Record<string, string> = {
  beijing: '54511',
  '\u5317\u4eac': '54511',
  tianjin: '54527',
  '\u5929\u6d25': '54527',
  shanghai: '58367',
  '\u4e0a\u6d77': '58367',
  chongqing: '57516',
  '\u91cd\u5e86': '57516',
  shijiazhuang: '53698',
  '\u77f3\u5bb6\u5e84': '53698',
  taiyuan: '53772',
  '\u592a\u539f': '53772',
  hohhot: '53463',
  '\u547c\u548c\u6d69\u7279': '53463',
  shenyang: '54342',
  '\u6c88\u9633': '54342',
  dalian: '54662',
  '\u5927\u8fde': '54662',
  changchun: '54161',
  '\u957f\u6625': '54161',
  harbin: '50953',
  '\u54c8\u5c14\u6ee8': '50953',
  nanjing: '58238',
  '\u5357\u4eac': '58238',
  suzhou: '58357',
  '\u82cf\u5dde': '58357',
  wuxi: '58354',
  '\u65e0\u9521': '58354',
  xuzhou: '58027',
  '\u5f90\u5dde': '58027',
  hangzhou: '58457',
  '\u676d\u5dde': '58457',
  ningbo: '58465',
  '\u5b81\u6ce2': '58465',
  wenzhou: '58659',
  '\u6e29\u5dde': '58659',
  zhoushan: '58477',
  '\u821f\u5c71': '58477',
  hefei: '58321',
  '\u5408\u80a5': '58321',
  fuzhou: '58847',
  '\u798f\u5dde': '58847',
  xiamen: '59134',
  '\u53a6\u95e8': '59134',
  nanchang: '58606',
  '\u5357\u660c': '58606',
  jinan: '54823',
  '\u6d4e\u5357': '54823',
  qingdao: '54857',
  '\u9752\u5c9b': '54857',
  yantai: '54765',
  '\u70df\u53f0': '54765',
  zhengzhou: '57083',
  '\u90d1\u5dde': '57083',
  luoyang: '57073',
  '\u6d1b\u9633': '57073',
  wuhan: '57494',
  '\u6b66\u6c49': '57494',
  yichang: '57461',
  '\u5b9c\u660c': '57461',
  changsha: '57687',
  '\u957f\u6c99': '57687',
  guangzhou: '59287',
  '\u5e7f\u5dde': '59287',
  shenzhen: '59493',
  '\u6df1\u5733': '59493',
  zhuhai: '59488',
  '\u73e0\u6d77': '59488',
  shantou: '59316',
  '\u6c55\u5934': '59316',
  nanning: '59431',
  '\u5357\u5b81': '59431',
  guilin: '57957',
  '\u6842\u6797': '57957',
  haikou: '59758',
  '\u6d77\u53e3': '59758',
  sanya: '59948',
  '\u4e09\u4e9a': '59948',
  chengdu: '56294',
  '\u6210\u90fd': '56294',
  kangding: '56374',
  '\u5eb7\u5b9a': '56374',
  ganzi: '56374',
  '\u7518\u5b5c': '56374',
  guiyang: '57816',
  '\u8d35\u9633': '57816',
  zunyi: '57713',
  '\u9075\u4e49': '57713',
  bijie: '57707',
  '\u6bd5\u8282': '57707',
  kunming: '56778',
  '\u6606\u660e': '56778',
  dali: '56751',
  '\u5927\u7406': '56751',
  lijiang: '56651',
  '\u4e3d\u6c5f': '56651',
  diqing: '56543',
  shangri_la: '56543',
  'shangri-la': '56543',
  '\u8fea\u5e86': '56543',
  '\u9999\u683c\u91cc\u62c9': '56543',
  lhasa: '55591',
  '\u62c9\u8428': '55591',
  xian: '57036',
  "xi'an": '57036',
  '\u897f\u5b89': '57036',
  lanzhou: '52889',
  '\u5170\u5dde': '52889',
  xining: '52866',
  '\u897f\u5b81': '52866',
  yinchuan: '53614',
  '\u94f6\u5ddd': '53614',
  urumqi: '51463',
  '\u4e4c\u9c81\u6728\u9f50': '51463',
  kashgar: '51709',
  '\u5580\u4ec0': '51709',
  altay: '51076',
  '\u963f\u52d2\u6cf0': '51076',
  hulunbuir: '50527',
  '\u547c\u4f26\u8d1d\u5c14': '50527',
  shaoguan: '59082',
  '\u97f6\u5173': '59082',
}

export type WeatherAdapter = 'on_demand_web' | 'generic' | 'smartweatherapi' | 'cma_public_weather'

export type OfficialWeatherRequest = {
  endpoint: string
  provider: string
  adapter: WeatherAdapter
  sourceUrl: string
  areaId?: string | null
}

export type OfficialWeatherProviderStatus = {
  provider: WeatherAdapter
  configured: boolean
  productionAuthorized: boolean
  missing: string[]
  areaId: string | null
  message: string
}

const WEATHER_DEGRADATION_MESSAGE = 'City weather lookup is temporarily unavailable; planning algorithms will fall back to seasonal productivity rules, process seasonal sensitivity rules, project history and current execution facts.'
const WEATHER_ALGORITHM_FALLBACK = 'seasonal_productivity + process_seasonal_sensitivity + project_history + execution_facts'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(numberValue) && Math.abs(numberValue) < 999 ? numberValue : null
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function externalWeatherJsonOptions(errorCode: string, signal?: AbortSignal) {
  return {
    errorCode,
    signal,
    timeoutMs: readPositiveIntegerEnv('WEATHER_LOOKUP_TIMEOUT_MS', 10_000),
    maxResponseBytes: readPositiveIntegerEnv('WEATHER_LOOKUP_MAX_RESPONSE_BYTES', 1024 * 1024),
  }
}

function normalizeMonthArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
    : []
}

function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value))
}

function sanitizeSourceSnapshot(snapshot?: Record<string, unknown>) {
  const blockedKeys = new Set([
    'lat',
    'latitude',
    'lng',
    'lon',
    'longitude',
    'coords',
    'coordinate',
    'coordinates',
    'position',
    'geohash',
  ])
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(snapshot ?? {})) {
    if (blockedKeys.has(key.toLowerCase())) continue
    sanitized[key] = value
  }
  return sanitized
}

function assertTrustedWeatherEndpoint(endpoint: string) {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw Object.assign(new Error('CITY_WEATHER_FORECAST_ENDPOINT must resolve to a valid URL'), { code: 'INVALID_WEATHER_ENDPOINT' })
  }

  const allowedHosts = [
    'weather.cma.cn',
    'weather.com.cn',
    'www.weather.com.cn',
    'data.cma.cn',
    'cma.gov.cn',
    'www.cma.gov.cn',
    'api.open-meteo.com',
    'geocoding-api.open-meteo.com',
  ]
  const hostname = parsed.hostname.toLowerCase()
  const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  if (!allowed) {
    throw Object.assign(new Error('Weather forecast endpoint must use a trusted weather domain'), { code: 'UNTRUSTED_WEATHER_ENDPOINT' })
  }
}

function normalizeWeatherError(error: unknown) {
  return normalizeText(error instanceof Error ? error.message : error)
}

function isWeatherLookupFailure(error: unknown) {
  const code = normalizeText((error as { code?: unknown } | null)?.code)
  const message = normalizeWeatherError(error).toLowerCase()
  return code === 'WEATHER_FETCH_FAILED'
    || error instanceof TypeError
    || message.includes('fetch')
    || message.includes('network')
    || message.includes('invalid json')
    || message.includes('unexpected token')
}

function weatherDegradationResponse(input: {
  projectId: string
  reason: string
  provider?: string | null
  missing?: string[]
  message?: string | null
  detail?: string | null
}) {
  return {
    projectId: input.projectId,
    status: 'degraded' as const,
    reason: input.reason,
    provider: input.provider ?? null,
    missing: input.missing ?? [],
    message: input.message || WEATHER_DEGRADATION_MESSAGE,
    degradationMessage: WEATHER_DEGRADATION_MESSAGE,
    algorithmFallback: WEATHER_ALGORITHM_FALLBACK,
    retryable: input.reason !== 'weather_city_lookup_not_found',
    detail: input.detail ?? null,
    written: 0,
  }
}

function readJsonMapFromEnv(name: string): Record<string, string> {
  const raw = normalizeText(process.env[name])
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [normalizeText(key), normalizeText(value)])
        .filter(([key, value]) => key && value),
    )
  } catch (error) {
    logger.warn('[projectClimateProfile] invalid weather city mapping env; ignored', { name, error })
    return {}
  }
}

function lookupMappedWeatherCode(profile: ProjectClimateProfile, envName: string) {
  const mapping = readJsonMapFromEnv(envName)
  const candidates = [
    profile.adminCode,
    profile.city,
    profile.province && profile.city ? `${profile.province}${profile.city}` : null,
    profile.province,
  ].map(normalizeText).filter(Boolean)
  for (const candidate of candidates) {
    if (mapping[candidate]) return mapping[candidate]
  }
  return null
}

function resolveSmartWeatherAreaId(profile: ProjectClimateProfile) {
  const mapped = lookupMappedWeatherCode(profile, 'OFFICIAL_WEATHER_AREA_ID_MAP_JSON')
  if (mapped) return mapped
  const adminCode = normalizeText(profile.adminCode)
  return /^101\d{6}$/.test(adminCode) ? adminCode : null
}

function resolveCmaStationId(profile: ProjectClimateProfile) {
  const mapped = lookupMappedWeatherCode(profile, 'OFFICIAL_WEATHER_STATION_ID_MAP_JSON')
  if (mapped) return mapped
  const candidates = [
    profile.adminCode,
    profile.city,
    profile.province && profile.city ? `${profile.province}${profile.city}` : null,
    profile.province,
  ].map((item) => normalizeLower(item)).filter(Boolean)
  for (const candidate of candidates) {
    if (CMA_PUBLIC_STATION_ID_FALLBACK_MAP[candidate]) return CMA_PUBLIC_STATION_ID_FALLBACK_MAP[candidate]
  }
  const adminCode = normalizeText(profile.adminCode)
  return /^\d{5}$/.test(adminCode) ? adminCode : null
}

function formatChinaWeatherRequestDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`
}

function appendQuery(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function buildSmartWeatherRequest(profile: ProjectClimateProfile): OfficialWeatherRequest | null {
  const areaId = resolveSmartWeatherAreaId(profile)
  const appId = normalizeText(process.env.SMARTWEATHER_API_APP_ID)
  const privateKey = normalizeText(process.env.SMARTWEATHER_API_PRIVATE_KEY)
  if (!areaId || !appId || !privateKey) return null

  const baseUrl = normalizeText(process.env.SMARTWEATHER_API_BASE_URL) || 'https://open.weather.com.cn/data/'
  const type = normalizeText(process.env.SMARTWEATHER_API_TYPE) || 'forecast_f'
  const date = formatChinaWeatherRequestDate()
  const signUrl = appendQuery(baseUrl, { areaid: areaId, type, date, appid: appId })
  assertTrustedWeatherEndpoint(signUrl)
  const key = createHmac('sha1', privateKey).update(signUrl).digest('base64')
  const requestAppId = appId.slice(0, 6)
  const endpoint = appendQuery(baseUrl, {
    areaid: areaId,
    type,
    date,
    appid: requestAppId,
    key,
  })
  assertTrustedWeatherEndpoint(endpoint)

  return {
    endpoint,
    provider: 'china_weather_smartweatherapi',
    adapter: 'smartweatherapi',
    sourceUrl: appendQuery(baseUrl, { areaid: areaId, type, date, appid: requestAppId }),
    areaId,
  }
}

function buildCmaPublicWeatherRequest(profile: ProjectClimateProfile): OfficialWeatherRequest | null {
  const stationId = resolveCmaStationId(profile)
  if (!stationId) return null
  const baseUrl = normalizeText(process.env.CMA_PUBLIC_WEATHER_BASE_URL) || 'https://weather.cma.cn/api/weather/view'
  const endpoint = appendQuery(baseUrl, { stationid: stationId })
  assertTrustedWeatherEndpoint(endpoint)
  return {
    endpoint,
    provider: 'cma_public_weather',
    adapter: 'cma_public_weather',
    sourceUrl: endpoint,
    areaId: stationId,
  }
}

function resolveOnDemandWeatherQuery(profile: ProjectClimateProfile) {
  return normalizeText(profile.city) || normalizeText(profile.province)
}

function buildOnDemandWebWeatherRequest(profile: ProjectClimateProfile): OfficialWeatherRequest | null {
  const query = resolveOnDemandWeatherQuery(profile)
  if (!query) return null
  const baseUrl = normalizeText(process.env.OPEN_METEO_GEOCODING_BASE_URL) || 'https://geocoding-api.open-meteo.com/v1/search'
  const endpoint = appendQuery(baseUrl, {
    name: query,
    count: '1',
    country: 'CN',
    language: 'zh',
    format: 'json',
  })
  assertTrustedWeatherEndpoint(endpoint)
  return {
    endpoint,
    provider: 'open_meteo_on_demand',
    adapter: 'on_demand_web',
    sourceUrl: endpoint,
    areaId: query,
  }
}

function resolveWeatherProviderKind(): WeatherAdapter | null {
  const provider = normalizeLower(process.env.WEATHER_LOOKUP_PROVIDER || process.env.OFFICIAL_WEATHER_PROVIDER)
  if (!provider) return 'cma_public_weather'
  if (['on_demand_web', 'open_meteo', 'open_meteo_on_demand', 'web_lookup'].includes(provider)) return 'on_demand_web'
  if (['smartweatherapi', 'smart_weather_api', 'china_weather_smartweatherapi'].includes(provider)) return 'smartweatherapi'
  if (['cma_public_weather', 'cma_public', 'weather_cma_cn'].includes(provider)) return 'cma_public_weather'
  if (['generic', 'custom', 'configured_city_weather_provider'].includes(provider)) return 'generic'
  return null
}

function normalizeWeatherProviderKind(value: unknown): WeatherAdapter | null {
  const provider = normalizeLower(value)
  if (['on_demand_web', 'open_meteo', 'open_meteo_on_demand', 'web_lookup'].includes(provider)) return 'on_demand_web'
  if (['smartweatherapi', 'smart_weather_api', 'china_weather_smartweatherapi'].includes(provider)) return 'smartweatherapi'
  if (['cma_public_weather', 'cma_public', 'weather_cma_cn'].includes(provider)) return 'cma_public_weather'
  if (['generic', 'custom', 'configured_city_weather_provider'].includes(provider)) return 'generic'
  return null
}

function resolveWeatherProviderFallbackOrder() {
  const configured = normalizeWeatherProviderKind(process.env.WEATHER_LOOKUP_PROVIDER || process.env.OFFICIAL_WEATHER_PROVIDER)
  const fallbackEnv = normalizeText(process.env.WEATHER_LOOKUP_PROVIDER_FALLBACKS || process.env.OFFICIAL_WEATHER_PROVIDER_FALLBACKS)
  const fallbackProviders = fallbackEnv
    ? fallbackEnv.split(',').map((item) => normalizeWeatherProviderKind(item)).filter(Boolean) as WeatherAdapter[]
    : ['cma_public_weather', 'smartweatherapi', 'generic', 'on_demand_web'] as WeatherAdapter[]

  const ordered = configured ? [configured, ...fallbackProviders] : fallbackProviders
  return Array.from(new Set(ordered))
}

function assertTrustedReverseGeocodeEndpoint(endpoint: string) {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw Object.assign(new Error('CITY_REVERSE_GEOCODE_ENDPOINT must resolve to a valid URL'), { code: 'INVALID_REVERSE_GEOCODE_ENDPOINT' })
  }

  const allowedHosts = [
    'restapi.amap.com',
    'apis.map.qq.com',
    'api.map.baidu.com',
  ]
  const hostname = parsed.hostname.toLowerCase()
  const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  if (!allowed) {
    throw Object.assign(new Error('CITY_REVERSE_GEOCODE_ENDPOINT must use a trusted map reverse-geocode domain'), { code: 'UNTRUSTED_REVERSE_GEOCODE_ENDPOINT' })
  }
}

function seedRuleToRow(rule: V1474RegionalClimateRule): RegionalClimateRuleRow {
  return {
    id: null,
    province: rule.province,
    city: rule.city ?? null,
    admin_code: rule.adminCode ?? null,
    climate_region: rule.climateRegion,
    thermal_zone: rule.thermalZone,
    rainy_season_months: rule.rainySeasonMonths,
    high_temp_months: rule.highTempMonths,
    cold_weather_months: rule.coldWeatherMonths,
    typhoon_risk_level: rule.typhoonRiskLevel,
    flood_season_months: rule.floodSeasonMonths,
    winter_shutdown_risk_level: rule.winterShutdownRiskLevel,
    climate_tags: rule.climateTags,
    soft_soil_level: rule.softSoilLevel,
    mountain_terrain: rule.mountainTerrain,
    terrain_difficulty_level: rule.terrainDifficultyLevel,
    seismic_intensity: rule.seismicIntensity,
    source_standard: rule.sourceStandard,
    source_version: rule.sourceVersion,
    source_clause_ref: rule.sourceClauseRef,
    evidence_sources: rule.evidenceSourceKeys,
    confidence: rule.confidence,
  }
}

function rowToSeedLike(row: RegionalClimateRuleRow): RegionalClimateRuleRow {
  return {
    ...row,
    climate_region: row.climate_region ?? 'default',
    thermal_zone: row.thermal_zone ?? null,
    rainy_season_months: normalizeMonthArray(row.rainy_season_months),
    high_temp_months: normalizeMonthArray(row.high_temp_months),
    cold_weather_months: normalizeMonthArray(row.cold_weather_months),
    typhoon_risk_level: normalizeText(row.typhoon_risk_level) || 'none',
    flood_season_months: normalizeMonthArray(row.flood_season_months),
    winter_shutdown_risk_level: normalizeText(row.winter_shutdown_risk_level) || 'none',
    climate_tags: normalizeArray(row.climate_tags),
    soft_soil_level: Number(row.soft_soil_level ?? 0),
    mountain_terrain: Boolean(row.mountain_terrain ?? false),
    terrain_difficulty_level: Number(row.terrain_difficulty_level ?? 0),
    seismic_intensity: row.seismic_intensity == null ? null : Number(row.seismic_intensity),
    confidence: row.confidence ?? 'medium',
  }
}

function matchesText(value: unknown, text: string) {
  const normalizedValue = normalizeLower(value)
  return normalizedValue && text.includes(normalizedValue)
}

function matchSeedRuleByText(text: string) {
  const normalized = normalizeLower(text)
  if (!normalized) return null
  return V1474_REGIONAL_CLIMATE_RULE_SEED
    .map((rule, index) => {
      let score = 0
      if (matchesText(rule.adminCode, normalized)) score += 120
      if (matchesText(rule.city, normalized)) score += 100
      if (rule.aliases.some((alias) => matchesText(alias, normalized))) score += 70
      if (matchesText(rule.province, normalized)) score += 40
      if (rule.city) score += 20
      if (rule.adminCode) score += 10
      return score > 0 ? { rule, score, index } : null
    })
    .filter((item): item is { rule: V1474RegionalClimateRule; score: number; index: number } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.rule ?? null
}

function buildDefaultProfile(projectId: string, reason: string): ProjectClimateProfile {
  const now = new Date().toISOString()
  return {
    projectId,
    province: null,
    city: null,
    adminCode: null,
    climateRegion: 'default',
    thermalZone: null,
    climateTags: [],
    rainySeasonMonths: [],
    highTempMonths: [],
    coldWeatherMonths: [],
    typhoonRiskLevel: 'none',
    floodSeasonMonths: [],
    winterShutdownRiskLevel: 'none',
    softSoilLevel: 0,
    mountainTerrain: false,
    terrainDifficultyLevel: 0,
    seismicIntensity: null,
    confidence: 'low',
    locationConsensusStatus: 'default_fallback',
    observationCount: 0,
    distinctUserCount: 0,
    source: 'default',
    sourceRuleId: null,
    weatherProvider: null,
    lastWeatherSyncedAt: null,
    metadata: { reason },
    resolvedAt: now,
  }
}

function resolveRegionalClimateRuleScope(
  rule: RegionalClimateRuleRow | null,
  input: { province?: string | null; city?: string | null; adminCode?: string | null },
) {
  if (!rule) return 'none'
  const adminCode = normalizeText(input.adminCode)
  const city = normalizeLower(input.city)
  const province = normalizeLower(input.province)
  if (adminCode && normalizeText(rule.admin_code) === adminCode) return 'admin_code'
  if (city && normalizeLower(rule.city) === city) return 'city'
  if (province && normalizeLower(rule.province) === province && !normalizeText(rule.city)) return 'province'
  return 'fallback'
}

function buildProfileFromRule(params: {
  projectId: string
  province: string | null
  city: string | null
  adminCode: string | null
  rule: RegionalClimateRuleRow | null
  confidence: Confidence
  consensusStatus: LocationConsensusStatus
  observationCount: number
  distinctUserCount: number
  source: ClimateSource
  metadata?: Record<string, unknown>
}): ProjectClimateProfile {
  const now = new Date().toISOString()
  const rule = params.rule ? rowToSeedLike(params.rule) : null
  const regionalClimateRuleScope = resolveRegionalClimateRuleScope(params.rule, {
    province: params.province,
    city: params.city,
    adminCode: params.adminCode,
  })
  return {
    projectId: params.projectId,
    province: params.province,
    city: params.city,
    adminCode: params.adminCode,
    climateRegion: rule?.climate_region ?? 'default',
    thermalZone: rule?.thermal_zone ?? null,
    climateTags: normalizeArray(rule?.climate_tags),
    rainySeasonMonths: normalizeMonthArray(rule?.rainy_season_months),
    highTempMonths: normalizeMonthArray(rule?.high_temp_months),
    coldWeatherMonths: normalizeMonthArray(rule?.cold_weather_months),
    typhoonRiskLevel: normalizeText(rule?.typhoon_risk_level) || 'none',
    floodSeasonMonths: normalizeMonthArray(rule?.flood_season_months),
    winterShutdownRiskLevel: normalizeText(rule?.winter_shutdown_risk_level) || 'none',
    softSoilLevel: Number(rule?.soft_soil_level ?? 0),
    mountainTerrain: Boolean(rule?.mountain_terrain ?? false),
    terrainDifficultyLevel: Number(rule?.terrain_difficulty_level ?? 0),
    seismicIntensity: rule?.seismic_intensity == null ? null : Number(rule.seismic_intensity),
    confidence: params.confidence,
    locationConsensusStatus: params.consensusStatus,
    observationCount: params.observationCount,
    distinctUserCount: params.distinctUserCount,
    source: params.source,
    sourceRuleId: normalizeText(rule?.id) || null,
    weatherProvider: null,
    lastWeatherSyncedAt: null,
    metadata: {
      sourceStandard: rule?.source_standard ?? null,
      sourceVersion: rule?.source_version ?? null,
      sourceClauseRef: rule?.source_clause_ref ?? null,
      evidenceSources: rule?.evidence_sources ?? [],
      regionalClimateRuleScope,
      softSoilLevel: Number(rule?.soft_soil_level ?? 0),
      mountainTerrain: Boolean(rule?.mountain_terrain ?? false),
      terrainDifficultyLevel: Number(rule?.terrain_difficulty_level ?? 0),
      seismicIntensity: rule?.seismic_intensity == null ? null : Number(rule.seismic_intensity),
      regionalClimateCandidatePolicy: 'auto_candidate_only_no_frontend_until_admin_console',
      ...params.metadata,
    },
    resolvedAt: now,
  }
}

function toDbProfile(profile: ProjectClimateProfile) {
  return {
    project_id: profile.projectId,
    province: profile.province,
    city: profile.city,
    admin_code: profile.adminCode,
    climate_region: profile.climateRegion,
    thermal_zone: profile.thermalZone,
    climate_tags: profile.climateTags,
    rainy_season_months: profile.rainySeasonMonths,
    high_temp_months: profile.highTempMonths,
    cold_weather_months: profile.coldWeatherMonths,
    typhoon_risk_level: profile.typhoonRiskLevel,
    flood_season_months: profile.floodSeasonMonths,
    winter_shutdown_risk_level: profile.winterShutdownRiskLevel,
    soft_soil_level: profile.softSoilLevel,
    mountain_terrain: profile.mountainTerrain,
    terrain_difficulty_level: profile.terrainDifficultyLevel,
    seismic_intensity: profile.seismicIntensity,
    confidence: profile.confidence,
    location_consensus_status: profile.locationConsensusStatus,
    observation_count: profile.observationCount,
    distinct_user_count: profile.distinctUserCount,
    source: profile.source,
    source_rule_id: profile.sourceRuleId,
    weather_provider: profile.weatherProvider,
    last_weather_synced_at: profile.lastWeatherSyncedAt,
    metadata: profile.metadata,
    resolved_at: profile.resolvedAt,
    updated_at: new Date().toISOString(),
  }
}

function fromDbProfile(row: any): ProjectClimateProfile {
  return {
    projectId: String(row.project_id),
    province: row.province ?? null,
    city: row.city ?? null,
    adminCode: row.admin_code ?? null,
    climateRegion: row.climate_region ?? 'default',
    thermalZone: row.thermal_zone ?? null,
    climateTags: normalizeArray(row.climate_tags),
    rainySeasonMonths: normalizeMonthArray(row.rainy_season_months),
    highTempMonths: normalizeMonthArray(row.high_temp_months),
    coldWeatherMonths: normalizeMonthArray(row.cold_weather_months),
    typhoonRiskLevel: normalizeText(row.typhoon_risk_level) || 'none',
    floodSeasonMonths: normalizeMonthArray(row.flood_season_months),
    winterShutdownRiskLevel: normalizeText(row.winter_shutdown_risk_level) || 'none',
    softSoilLevel: Number(row.soft_soil_level ?? row.metadata?.softSoilLevel ?? 0),
    mountainTerrain: Boolean(row.mountain_terrain ?? row.metadata?.mountainTerrain ?? false),
    terrainDifficultyLevel: Number(row.terrain_difficulty_level ?? row.metadata?.terrainDifficultyLevel ?? 0),
    seismicIntensity: row.seismic_intensity == null && row.metadata?.seismicIntensity == null
      ? null
      : Number(row.seismic_intensity ?? row.metadata?.seismicIntensity),
    confidence: row.confidence ?? 'low',
    locationConsensusStatus: row.location_consensus_status ?? 'default_fallback',
    observationCount: Number(row.observation_count ?? 0),
    distinctUserCount: Number(row.distinct_user_count ?? 0),
    source: row.source ?? 'default',
    sourceRuleId: row.source_rule_id ?? null,
    weatherProvider: row.weather_provider ?? null,
    lastWeatherSyncedAt: row.last_weather_synced_at ?? null,
    metadata: row.metadata ?? {},
    resolvedAt: row.resolved_at ?? row.updated_at ?? new Date().toISOString(),
  }
}

async function loadRuleFromDatabase(input: { province?: string | null; city?: string | null; adminCode?: string | null }) {
  const province = normalizeText(input.province)
  const city = normalizeText(input.city)
  const adminCode = normalizeText(input.adminCode)
  if (!province && !city && !adminCode) return null

  try {
    let query = (supabase as any)
      .from('regional_climate_rules')
      .select('*')
      .eq('status', 'active')
      .limit(50)
    if (adminCode) {
      query = query.or(`admin_code.eq.${adminCode},province.ilike.${province || city}`)
    } else if (province) {
      query = query.ilike('province', province)
    } else {
      query = query.ilike('city', city)
    }

    const { data, error } = await query
    if (error) throw error
    const rows = Array.isArray(data) ? data as RegionalClimateRuleRow[] : []
    return rows.find((row) => adminCode && normalizeText(row.admin_code) === adminCode)
      ?? rows.find((row) => city && normalizeLower(row.city) === normalizeLower(city))
      ?? rows.find((row) => province && normalizeLower(row.province) === normalizeLower(province))
      ?? rows[0]
      ?? null
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to load regional climate rule from database', { input, error })
    throw error
  }
}

export async function bootstrapRegionalClimateRules() {
  let insertedOrUpdated = 0
  try {
    for (const rule of V1474_REGIONAL_CLIMATE_RULE_SEED) {
      const payload = {
        province: rule.province,
        city: rule.city ?? null,
        admin_code: rule.adminCode ?? null,
        climate_region: rule.climateRegion,
        thermal_zone: rule.thermalZone,
        rainy_season_months: rule.rainySeasonMonths,
        high_temp_months: rule.highTempMonths,
        cold_weather_months: rule.coldWeatherMonths,
        typhoon_risk_level: rule.typhoonRiskLevel,
        flood_season_months: rule.floodSeasonMonths,
        winter_shutdown_risk_level: rule.winterShutdownRiskLevel,
        climate_tags: rule.climateTags,
        source_standard: rule.sourceStandard,
        source_version: rule.sourceVersion,
        source_clause_ref: rule.sourceClauseRef,
        evidence_sources: rule.evidenceSourceKeys,
        confidence: rule.confidence,
        status: 'active',
        updated_at: new Date().toISOString(),
      }

      const { data: existing, error: readError } = await (supabase as any)
        .from('regional_climate_rules')
        .select('id')
        .eq('province', rule.province)
        .filter('city', rule.city ? 'eq' : 'is', rule.city ?? null)
        .filter('admin_code', rule.adminCode ? 'eq' : 'is', rule.adminCode ?? null)
        .maybeSingle()
      if (readError) throw readError

      const existingId = normalizeText((existing as any)?.id)
      const { error: writeError } = existingId
        ? await (supabase as any).from('regional_climate_rules').update(payload).eq('id', existingId)
        : await (supabase as any).from('regional_climate_rules').insert(payload)
      if (writeError) throw writeError
      insertedOrUpdated += 1
    }
    return { insertedOrUpdated }
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to bootstrap regional climate rules', { error })
    throw error
  }
}

async function resolveRule(input: { province?: string | null; city?: string | null; adminCode?: string | null; text?: string | null }) {
  const dbRule = await loadRuleFromDatabase(input)
  if (dbRule) return dbRule

  const text = [input.province, input.city, input.adminCode, input.text].map(normalizeText).filter(Boolean).join(' ')
  const seedRule = matchSeedRuleByText(text)
  return seedRule ? seedRuleToRow(seedRule) : null
}

function groupKey(row: LocationObservationRow, scope: 'city' | 'province') {
  const province = normalizeLower(row.province)
  const city = normalizeLower(row.city)
  if (scope === 'city') return province && city ? `${province}|${city}` : ''
  return province
}

function mostCommonObservation(rows: LocationObservationRow[], scope: 'city' | 'province') {
  const buckets = new Map<string, { rows: LocationObservationRow[]; users: Set<string> }>()
  for (const row of rows) {
    const key = groupKey(row, scope)
    if (!key) continue
    const bucket = buckets.get(key) ?? { rows: [], users: new Set<string>() }
    bucket.rows.push(row)
    const userId = normalizeText(row.observed_by_user_id)
    if (userId) bucket.users.add(userId)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => {
      if (right.users.size !== left.users.size) return right.users.size - left.users.size
      return right.rows.length - left.rows.length
    })[0] ?? null
}

async function loadRecentObservations(projectId: string) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await (supabase as any)
      .from('project_location_observations')
      .select('*')
      .eq('project_id', projectId)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return Array.isArray(data) ? data as LocationObservationRow[] : []
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to load location observations', { projectId, error })
    throw error
  }
}

async function loadProjectLocationText(projectId: string) {
  try {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select('location')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw error
    return normalizeText((data as any)?.location)
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to load project location text', { projectId, error })
    throw error
  }
}

async function persistProfile(profile: ProjectClimateProfile) {
  try {
    const { error } = await (supabase as any)
      .from('project_climate_profiles')
      .upsert(toDbProfile(profile), { onConflict: 'project_id' })
    if (error) throw error
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to persist project climate profile', {
      projectId: profile.projectId,
      error,
    })
    throw error
  }
  await createRegionalClimateRuleCandidateForProfile(profile)
  return profile
}

export async function recordProjectLocationObservation(input: ProjectLocationObservationInput) {
  const projectId = normalizeText(input.projectId)
  if (!projectId) throw Object.assign(new Error('projectId is required'), { code: 'PROJECT_ID_REQUIRED' })
  const province = normalizeText(input.province) || null
  const city = normalizeText(input.city) || null
  const adminCode = normalizeText(input.adminCode) || null
  if (!province && !city && !adminCode) {
    throw Object.assign(new Error('City-level location observation requires province, city, or adminCode'), { code: 'CITY_LOCATION_REQUIRED' })
  }

  const payload = {
    project_id: projectId,
    observed_by_user_id: normalizeText(input.observedByUserId) || null,
    province,
    city,
    admin_code: adminCode,
    accuracy_level: city ? 'city' : province ? 'province' : 'unknown',
    source: input.source ?? 'browser_geolocation',
    confidence: input.confidence ?? (city ? 'medium' : 'low'),
    raw_source_snapshot: {
      ...sanitizeSourceSnapshot(input.rawSourceSnapshot),
      precisionPolicy: 'city_only_no_precise_coordinates_persisted',
    },
    observed_at: new Date().toISOString(),
  }

  const { data, error } = await (supabase as any)
    .from('project_location_observations')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  const profile = await rebuildProjectClimateProfile(projectId)
  return { observation: data, profile }
}

function resolveReverseGeocodeEndpoint(input: BrowserCoordinateObservationInput) {
  const template = normalizeText(process.env.CITY_REVERSE_GEOCODE_ENDPOINT)
  if (!template) return null
  const endpoint = template
    .replaceAll('{lat}', encodeURIComponent(String(input.latitude)))
    .replaceAll('{latitude}', encodeURIComponent(String(input.latitude)))
    .replaceAll('{lng}', encodeURIComponent(String(input.longitude)))
    .replaceAll('{lon}', encodeURIComponent(String(input.longitude)))
    .replaceAll('{longitude}', encodeURIComponent(String(input.longitude)))
  assertTrustedReverseGeocodeEndpoint(endpoint)
  return endpoint
}

function parseReverseGeocodePayload(payload: any) {
  const amap = payload?.regeocode?.addressComponent
  if (amap) {
    return {
      province: normalizeText(amap.province),
      city: normalizeText(Array.isArray(amap.city) ? amap.province : amap.city || amap.province),
      adminCode: normalizeText(amap.adcode),
      provider: 'amap',
    }
  }

  const tencent = payload?.result?.address_component
  if (tencent) {
    return {
      province: normalizeText(tencent.province),
      city: normalizeText(tencent.city || tencent.province),
      adminCode: normalizeText(payload?.result?.ad_info?.adcode),
      provider: 'tencent_map',
    }
  }

  const baidu = payload?.result?.addressComponent
  if (baidu) {
    return {
      province: normalizeText(baidu.province),
      city: normalizeText(baidu.city || baidu.province),
      adminCode: normalizeText(baidu.adcode),
      provider: 'baidu_map',
    }
  }

  return {
    province: normalizeText(payload?.province ?? payload?.data?.province),
    city: normalizeText(payload?.city ?? payload?.data?.city),
    adminCode: normalizeText(payload?.adminCode ?? payload?.adcode ?? payload?.data?.adminCode ?? payload?.data?.adcode),
    provider: normalizeText(payload?.provider ?? 'configured_reverse_geocoder'),
  }
}

export async function recordProjectLocationObservationFromBrowserCoordinates(input: BrowserCoordinateObservationInput) {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw Object.assign(new Error('latitude and longitude are required for transient city reverse geocoding'), { code: 'INVALID_BROWSER_COORDINATES' })
  }

  const endpoint = resolveReverseGeocodeEndpoint(input)
  if (!endpoint) {
    return {
      status: 'skipped' as const,
      reason: 'reverse_geocode_endpoint_unconfigured',
      observation: null,
      profile: await rebuildProjectClimateProfile(input.projectId),
    }
  }

  const payload = await fetchJsonWithLimits<any>(endpoint, externalWeatherJsonOptions(
    'REVERSE_GEOCODE_FETCH_FAILED',
    input.signal,
  ))
  const parsed = parseReverseGeocodePayload(payload)
  if (!parsed.province && !parsed.city && !parsed.adminCode) {
    throw Object.assign(new Error('Reverse geocode response did not contain city-level location'), { code: 'CITY_REVERSE_GEOCODE_EMPTY' })
  }

  const result = await recordProjectLocationObservation({
    projectId: input.projectId,
    observedByUserId: input.observedByUserId,
    province: parsed.province || null,
    city: parsed.city || null,
    adminCode: parsed.adminCode || null,
    source: 'browser_geolocation',
    confidence: parsed.city ? 'medium' : 'low',
    rawSourceSnapshot: {
      provider: parsed.provider,
      accuracyMeters: input.accuracyMeters ?? null,
      reverseGeocodeEndpointHost: new URL(endpoint).hostname,
    },
  })

  return {
    status: 'recorded' as const,
    ...result,
  }
}

export async function rebuildProjectClimateProfile(projectId: string): Promise<ProjectClimateProfile> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return buildDefaultProfile('', 'projectId is empty')

  const observations = await loadRecentObservations(normalizedProjectId)
  const observedUsers = new Set(observations.map((row) => normalizeText(row.observed_by_user_id)).filter(Boolean))
  const cityConsensus = mostCommonObservation(observations, 'city')
  if (cityConsensus && cityConsensus.users.size >= 2) {
    const best = cityConsensus.rows[0]
    const rule = await resolveRule({ province: best.province, city: best.city, adminCode: best.admin_code })
    return persistProfile(buildProfileFromRule({
      projectId: normalizedProjectId,
      province: best.province ?? null,
      city: best.city ?? null,
      adminCode: best.admin_code ?? null,
      rule,
      confidence: rule ? 'high' : 'medium',
      consensusStatus: 'city_consensus',
      observationCount: cityConsensus.rows.length,
      distinctUserCount: cityConsensus.users.size,
      source: 'multi_user_location',
      metadata: { consensusKey: cityConsensus.key },
    }))
  }

  const provinceConsensus = mostCommonObservation(observations, 'province')
  if (provinceConsensus && provinceConsensus.users.size >= 2) {
    const best = provinceConsensus.rows[0]
    const rule = await resolveRule({ province: best.province })
    return persistProfile(buildProfileFromRule({
      projectId: normalizedProjectId,
      province: best.province ?? null,
      city: null,
      adminCode: null,
      rule,
      confidence: rule ? 'medium' : 'low',
      consensusStatus: 'province_consensus',
      observationCount: provinceConsensus.rows.length,
      distinctUserCount: provinceConsensus.users.size,
      source: 'multi_user_location',
      metadata: { consensusKey: provinceConsensus.key },
    }))
  }

  if (observations.length > 0) {
    const best = observations[0]
    const rule = await resolveRule({ province: best.province, city: best.city, adminCode: best.admin_code })
    return persistProfile(buildProfileFromRule({
      projectId: normalizedProjectId,
      province: best.province ?? null,
      city: best.city ?? null,
      adminCode: best.admin_code ?? null,
      rule,
      confidence: rule ? 'medium' : 'low',
      consensusStatus: 'single_observation',
      observationCount: observations.length,
      distinctUserCount: observedUsers.size,
      source: best.source === 'ip_location' ? 'ip_location' : 'single_user_location',
      metadata: { latestObservationId: best.id ?? null },
    }))
  }

  const locationText = await loadProjectLocationText(normalizedProjectId)
  const rule = await resolveRule({ text: locationText })
  if (rule) {
    return persistProfile(buildProfileFromRule({
      projectId: normalizedProjectId,
      province: rule.province ?? null,
      city: rule.city ?? null,
      adminCode: rule.admin_code ?? null,
      rule,
      confidence: 'medium',
      consensusStatus: 'project_location_fallback',
      observationCount: 0,
      distinctUserCount: 0,
      source: 'project_location',
      metadata: { projectLocation: locationText },
    }))
  }

  return persistProfile(buildDefaultProfile(normalizedProjectId, 'No city-level observation or recognizable project location'))
}

export async function resolveProjectClimateProfile(projectId: string | null | undefined): Promise<ProjectClimateProfile> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return buildDefaultProfile('', 'projectId is empty')

  try {
    const { data, error } = await (supabase as any)
      .from('project_climate_profiles')
      .select('*')
      .eq('project_id', normalizedProjectId)
      .maybeSingle()
    if (error) throw error
    if (data) return fromDbProfile(data)
  } catch (error) {
    logger.warn('[projectClimateProfile] failed to read profile', { projectId: normalizedProjectId, error })
    throw error
  }

  return rebuildProjectClimateProfile(normalizedProjectId)
}

function resolveConfiguredWeatherRequest(profile: ProjectClimateProfile): OfficialWeatherRequest | null {
  const template = normalizeText(process.env.CITY_WEATHER_FORECAST_ENDPOINT)
  if (!template) return null
  const city = encodeURIComponent(profile.city ?? profile.province ?? '')
  const adminCode = encodeURIComponent(profile.adminCode ?? '')
  if (!city && !adminCode) return null
  const endpoint = template
    .replaceAll('{city}', city)
    .replaceAll('{adminCode}', adminCode)
  assertTrustedWeatherEndpoint(endpoint)
  return {
    endpoint,
    provider: normalizeText(process.env.CITY_WEATHER_FORECAST_PROVIDER) || 'configured_city_weather_provider',
    adapter: 'generic',
    sourceUrl: endpoint,
    areaId: profile.adminCode,
  }
}

export function resolveOfficialWeatherRequest(profile: ProjectClimateProfile): OfficialWeatherRequest | null {
  for (const provider of resolveWeatherProviderFallbackOrder()) {
    const request = provider === 'on_demand_web'
      ? buildOnDemandWebWeatherRequest(profile)
      : provider === 'smartweatherapi'
        ? buildSmartWeatherRequest(profile)
        : provider === 'cma_public_weather'
          ? buildCmaPublicWeatherRequest(profile)
          : provider === 'generic'
            ? resolveConfiguredWeatherRequest(profile)
            : null
    if (request) return request
  }
  return null
}

export function getOfficialWeatherProviderStatus(profile?: ProjectClimateProfile | null): OfficialWeatherProviderStatus {
  const provider = resolveWeatherProviderKind() ?? 'cma_public_weather'
  if (provider === 'on_demand_web') {
    const query = profile ? resolveOnDemandWeatherQuery(profile) : null
    const missing = profile && !query ? ['project_city_or_province'] : []
    return {
      provider,
      configured: missing.length === 0,
      productionAuthorized: false,
      missing,
      areaId: query,
      message: missing.length === 0
        ? 'On-demand web weather lookup is ready; weather facts are fetched only when the project weather refresh runs.'
        : 'On-demand web weather lookup needs a project city or province before it can query weather facts.',
    }
  }
  if (provider === 'smartweatherapi') {
    const areaId = profile ? resolveSmartWeatherAreaId(profile) : null
    const missing = [
      normalizeText(process.env.SMARTWEATHER_API_APP_ID) ? null : 'SMARTWEATHER_API_APP_ID',
      normalizeText(process.env.SMARTWEATHER_API_PRIVATE_KEY) ? null : 'SMARTWEATHER_API_PRIVATE_KEY',
      profile && !areaId ? 'OFFICIAL_WEATHER_AREA_ID_MAP_JSON' : null,
    ].filter(Boolean) as string[]
    return {
      provider,
      configured: missing.length === 0,
      productionAuthorized: true,
      missing,
      areaId,
      message: missing.length === 0
        ? 'SmartWeatherAPI authorized provider is ready.'
        : 'SmartWeatherAPI authorized provider is selected but required credentials or city area-id mapping is missing.',
    }
  }
  if (provider === 'cma_public_weather') {
    const areaId = profile ? resolveCmaStationId(profile) : null
    const missing = profile && !areaId ? ['OFFICIAL_WEATHER_STATION_ID_MAP_JSON'] : []
    return {
      provider,
      configured: missing.length === 0,
      productionAuthorized: false,
      missing,
      areaId,
      message: missing.length === 0
        ? 'CMA mainland public weather endpoint is ready as the default city weather source.'
        : 'CMA mainland public weather endpoint needs a station id mapping for this project city.',
    }
  }
  const generic = profile ? resolveConfiguredWeatherRequest(profile) : null
  const missing = generic ? [] : ['CITY_WEATHER_FORECAST_ENDPOINT']
  return {
    provider: 'generic',
    configured: missing.length === 0,
    productionAuthorized: false,
    missing,
    areaId: generic?.areaId ?? null,
    message: 'Generic weather endpoint is compatibility backup only; default production weather lookup should use cma_public_weather first.',
  }
}

function addDaysToIsoDate(yyyymmdd: string, offsetDays: number) {
  const year = Number(yyyymmdd.slice(0, 4))
  const month = Number(yyyymmdd.slice(4, 6))
  const day = Number(yyyymmdd.slice(6, 8))
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays))
  return date.toISOString().slice(0, 10)
}

const WEATHER_CODE_LABELS: Record<string, string> = {
  '00': '晴',
  '01': '多云',
  '02': '阴',
  '03': '阵雨',
  '04': '雷阵雨',
  '05': '雷阵雨伴有冰雹',
  '06': '雨夹雪',
  '07': '小雨',
  '08': '中雨',
  '09': '大雨',
  '10': '暴雨',
  '11': '大暴雨',
  '12': '特大暴雨',
  '21': '小到中雨',
  '22': '中到大雨',
  '23': '大到暴雨',
  '24': '暴雨到大暴雨',
  '25': '大暴雨到特大暴雨',
}

function weatherTagsFromCodes(...codes: unknown[]) {
  return Array.from(new Set(
    codes
      .map(normalizeText)
      .filter(Boolean)
      .flatMap((code) => [WEATHER_CODE_LABELS[code], `weather_code:${code}`].filter(Boolean) as string[]),
  ))
}

function parseSmartWeatherPayload(payload: any, profile: ProjectClimateProfile): WeatherForecastInput['forecasts'] {
  const forecastRoot = payload?.f ?? payload?.data?.f ?? payload?.forecast ?? {}
  const rows = Array.isArray(forecastRoot?.f1) ? forecastRoot.f1 : []
  const baseDate = normalizeText(forecastRoot?.f0 ?? payload?.f0).slice(0, 8)
  if (!/^\d{8}$/.test(baseDate)) return []

  return rows.map((row: any, index: number) => {
    const forecastDate = addDaysToIsoDate(baseDate, index)
    const warningTags = [
      ...weatherTagsFromCodes(row.fa, row.fb),
      ...normalizeArray(row.warningTags ?? row.warnings),
    ]
    return {
      forecastDate: forecastDate ?? '',
      minTempC: normalizeNumber(row.fd ?? row.tempMin ?? row.low),
      maxTempC: normalizeNumber(row.fc ?? row.tempMax ?? row.high),
      precipitationMm: normalizeNumber(row.precipitationMm ?? row.precip ?? row.rainfall),
      relativeHumidityPercent: normalizeNumber(row.relativeHumidityPercent ?? row.relative_humidity_percent ?? row.humidity ?? row.rh),
      snowDepthCm: normalizeNumber(row.snowDepthCm ?? row.snow_depth_cm ?? row.snowDepth ?? row.snow),
      windLevel: normalizeText(row.fg ?? row.fh ?? row.windLevel ?? row.windScale) || null,
      warningTags,
      providerRecordId: `${profile.projectId}:${forecastDate ?? index}`,
      rawPayload: row,
    }
  }).filter((row) => isIsoDate(row.forecastDate))
}

type OnDemandWeatherLocation = {
  name: string
  countryCode: string | null
  latitude: number
  longitude: number
  providerRecordId: string | null
}

function parseOnDemandWeatherLocation(payload: any): OnDemandWeatherLocation | null {
  const rows = Array.isArray(payload?.results) ? payload.results : []
  const selected = rows.find((row: any) => normalizeLower(row?.country_code) === 'cn') ?? rows[0]
  if (!selected) return null
  const latitude = Number(selected.latitude)
  const longitude = Number(selected.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    name: normalizeText(selected.name) || normalizeText(selected.admin1) || 'city',
    countryCode: normalizeText(selected.country_code) || null,
    latitude,
    longitude,
    providerRecordId: normalizeText(selected.id) || null,
  }
}

function buildOnDemandForecastEndpoint(location: OnDemandWeatherLocation) {
  const baseUrl = normalizeText(process.env.OPEN_METEO_FORECAST_BASE_URL) || 'https://api.open-meteo.com/v1/forecast'
  const endpoint = appendQuery(baseUrl, {
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_max,snow_depth_max',
    forecast_days: normalizeText(process.env.ON_DEMAND_WEATHER_FORECAST_DAYS) || '10',
    timezone: 'Asia/Shanghai',
  })
  assertTrustedWeatherEndpoint(endpoint)
  return endpoint
}

function precipitationTags(mm: number | null) {
  if (mm === null) return []
  if (mm >= 50) return ['暴雨', 'heavy_rain']
  if (mm >= 25) return ['大雨', 'heavy_rain']
  if (mm >= 10) return ['中雨']
  if (mm > 0) return ['降雨']
  return []
}

function parseOnDemandWeatherPayload(payload: any, profile: ProjectClimateProfile): WeatherForecastInput['forecasts'] {
  const daily = payload?.daily ?? {}
  const dates = Array.isArray(daily.time) ? daily.time : []
  return dates.map((date: unknown, index: number) => {
    const forecastDate = normalizeText(date)
    const precipitationMm = normalizeNumber(daily.precipitation_sum?.[index])
    const wind = normalizeNumber(daily.wind_speed_10m_max?.[index])
    return {
      forecastDate,
      minTempC: normalizeNumber(daily.temperature_2m_min?.[index]),
      maxTempC: normalizeNumber(daily.temperature_2m_max?.[index]),
      precipitationMm,
      relativeHumidityPercent: normalizeNumber(daily.relative_humidity_2m_max?.[index]),
      snowDepthCm: normalizeNumber(daily.snow_depth_max?.[index]),
      windLevel: wind === null ? null : `${Math.round(wind)}km/h`,
      warningTags: precipitationTags(precipitationMm),
      providerRecordId: `${profile.projectId}:${forecastDate}`,
      rawPayload: {
        date: forecastDate,
        source: 'open_meteo_on_demand',
        maxTempC: normalizeNumber(daily.temperature_2m_max?.[index]),
        minTempC: normalizeNumber(daily.temperature_2m_min?.[index]),
        precipitationMm,
        relativeHumidityPercent: normalizeNumber(daily.relative_humidity_2m_max?.[index]),
        snowDepthCm: normalizeNumber(daily.snow_depth_max?.[index]),
        windSpeedKmh: wind,
      },
    }
  }).filter((row) => isIsoDate(row.forecastDate))
}

function normalizeForecastDate(value: unknown) {
  const text = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  return text
}

function tagsFromWeatherTexts(...values: unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean).flatMap((text) => {
    const tags = [text]
    if (text.includes('暴雨') || text.toLowerCase().includes('rainstorm')) tags.push('heavy_rain')
    if (text.includes('大雨')) tags.push('heavy_rain')
    if (text.includes('高温')) tags.push('heat')
    if (text.includes('寒潮') || text.includes('低温')) tags.push('cold wave')
    if (text.includes('大风')) tags.push('wind warning')
    return tags
  })))
}

function parseCmaPublicWeatherPayload(payload: any, profile: ProjectClimateProfile): WeatherForecastInput['forecasts'] {
  const data = payload?.data ?? payload
  const dailyRows = Array.isArray(data?.daily)
    ? data.daily
    : Array.isArray(data?.forecast)
      ? data.forecast
      : []
  const alarmRows = Array.isArray(data?.alarm) ? data.alarm : []
  const alarmTags = tagsFromWeatherTexts(...alarmRows.flatMap((row: any) => [row?.title, row?.signaltype, row?.signallevel, row?.content]))

  return dailyRows.map((row: any) => {
    const forecastDate = normalizeForecastDate(row?.date ?? row?.forecastDate ?? row?.fxDate)
    const dayText = row?.dayText ?? row?.day_text ?? row?.text_day ?? row?.weatherDay
    const nightText = row?.nightText ?? row?.night_text ?? row?.text_night ?? row?.weatherNight
    return {
      forecastDate,
      minTempC: normalizeNumber(row?.low ?? row?.tempMin ?? row?.minTempC),
      maxTempC: normalizeNumber(row?.high ?? row?.tempMax ?? row?.maxTempC),
      precipitationMm: normalizeNumber(row?.precipitationMm ?? row?.precip ?? row?.rainfall),
      relativeHumidityPercent: normalizeNumber(row?.relativeHumidityPercent ?? row?.relative_humidity_percent ?? row?.humidity ?? row?.rh),
      snowDepthCm: normalizeNumber(row?.snowDepthCm ?? row?.snow_depth_cm ?? row?.snowDepth ?? row?.snow),
      windLevel: row?.dayWindScale ?? row?.nightWindScale ?? row?.windScale ?? null,
      warningTags: tagsFromWeatherTexts(dayText, nightText, ...normalizeArray(row?.warningTags), ...alarmTags),
      providerRecordId: normalizeText(row?.id ?? row?.date) || `${profile.projectId}:${forecastDate}`,
      rawPayload: row,
    }
  }).filter((row) => isIsoDate(row.forecastDate))
}

export function parseWeatherForecastPayload(payload: any, profile: ProjectClimateProfile, adapter: WeatherAdapter = 'generic'): WeatherForecastInput['forecasts'] {
  if (adapter === 'on_demand_web') return parseOnDemandWeatherPayload(payload, profile)
  if (adapter === 'smartweatherapi') return parseSmartWeatherPayload(payload, profile)
  if (adapter === 'cma_public_weather') return parseCmaPublicWeatherPayload(payload, profile)

  const rows = Array.isArray(payload?.forecasts)
    ? payload.forecasts
    : Array.isArray(payload?.data?.forecasts)
      ? payload.data.forecasts
      : Array.isArray(payload?.data?.daily)
        ? payload.data.daily
        : Array.isArray(payload?.data?.forecast)
          ? payload.data.forecast
          : Array.isArray(payload?.daily)
            ? payload.daily
            : []

  return rows.map((row: any) => {
    const forecastDate = normalizeForecastDate(row.forecastDate ?? row.date ?? row.fxDate)
    return {
      forecastDate,
      minTempC: normalizeNumber(row.minTempC ?? row.tempMin ?? row.low),
      maxTempC: normalizeNumber(row.maxTempC ?? row.tempMax ?? row.high),
      precipitationMm: normalizeNumber(row.precipitationMm ?? row.precip ?? row.rainfall),
      relativeHumidityPercent: normalizeNumber(row.relativeHumidityPercent ?? row.relative_humidity_percent ?? row.humidity ?? row.rh),
      snowDepthCm: normalizeNumber(row.snowDepthCm ?? row.snow_depth_cm ?? row.snowDepth ?? row.snow),
      windLevel: row.windLevel ?? row.windScale ?? null,
      warningTags: normalizeArray(row.warningTags ?? row.warnings ?? row.warning_tags),
      providerRecordId: normalizeText(row.providerRecordId ?? row.id) || `${profile.projectId}:${forecastDate}`,
      rawPayload: row,
    }
  }).filter((row) => isIsoDate(row.forecastDate))
}

async function persistWeatherForecasts(input: WeatherForecastInput) {
  if (input.forecasts.length === 0) return { written: 0 }
  const now = new Date().toISOString()
  const rows = input.forecasts.map((item) => ({
    project_id: input.projectId,
    forecast_city: input.forecastCity ?? null,
    forecast_admin_code: input.forecastAdminCode ?? null,
    forecast_date: item.forecastDate,
    min_temp_c: item.minTempC ?? null,
    max_temp_c: item.maxTempC ?? null,
    precipitation_mm: item.precipitationMm ?? null,
    relative_humidity_percent: item.relativeHumidityPercent ?? null,
    snow_depth_cm: item.snowDepthCm ?? null,
    wind_level: item.windLevel ?? null,
    warning_tags: normalizeArray(item.warningTags),
    provider: input.provider,
    provider_record_id: item.providerRecordId ?? null,
    source_url: input.sourceUrl ?? null,
    raw_payload: item.rawPayload ?? {},
    fetched_at: now,
    updated_at: now,
  }))

  const { error } = await (supabase as any)
    .from('project_weather_forecasts')
    .upsert(rows, { onConflict: 'project_id,forecast_date,provider' })
  if (error) throw error

  await (supabase as any)
    .from('project_climate_profiles')
    .update({
      weather_provider: input.provider,
      last_weather_synced_at: now,
      updated_at: now,
    })
    .eq('project_id', input.projectId)

  return { written: rows.length }
}

async function fetchWeatherJson(endpoint: string, signal?: AbortSignal) {
  const isCmaWeather = normalizeLower(endpoint).includes('weather.cma.cn')
  return fetchJsonWithLimits<any>(endpoint, {
    ...externalWeatherJsonOptions('WEATHER_FETCH_FAILED', signal),
    headers: {
      Accept: 'application/json',
      'User-Agent': normalizeText(process.env.WEATHER_LOOKUP_USER_AGENT || process.env.OFFICIAL_WEATHER_USER_AGENT) || 'WorkBuddy/1.0 weather-lookup',
      ...(isCmaWeather ? { Referer: 'https://weather.cma.cn/' } : {}),
    },
  })
}

async function syncOnDemandWebWeatherForecast(
  projectId: string,
  profile: ProjectClimateProfile,
  request: OfficialWeatherRequest,
  options: WeatherSyncOptions,
) {
  const geocodePayload = await fetchWeatherJson(request.endpoint, options.signal)
  const location = parseOnDemandWeatherLocation(geocodePayload)
  if (!location) {
    return weatherDegradationResponse({
      projectId,
      reason: 'weather_city_lookup_not_found',
      provider: request.provider,
      missing: ['project_city_lookup_result'],
      message: 'On-demand web weather lookup could not resolve the project city to a weather forecast location.',
    })
  }

  const forecastEndpoint = buildOnDemandForecastEndpoint(location)
  const forecastPayload = await fetchWeatherJson(forecastEndpoint, options.signal)
  const forecasts = parseWeatherForecastPayload(forecastPayload, profile, 'on_demand_web')
  const result = await persistWeatherForecasts({
    projectId,
    forecastCity: profile.city ?? location.name,
    forecastAdminCode: profile.adminCode ?? location.providerRecordId,
    provider: request.provider,
    sourceUrl: request.sourceUrl,
    forecasts: forecasts.map((forecast) => ({
      ...forecast,
      rawPayload: {
        ...forecast.rawPayload,
        providerLocationName: location.name,
        providerLocationCountryCode: location.countryCode,
        providerLocationId: location.providerRecordId,
      },
    })),
  })
  return {
    projectId,
    status: 'synced' as const,
    provider: request.provider,
    written: result.written,
  }
}

export async function syncProjectWeatherForecast(projectId: string, options: WeatherSyncOptions = {}) {
  const profile = await resolveProjectClimateProfile(projectId)
  const request = resolveOfficialWeatherRequest(profile)
  if (!request) {
    const providerStatus = getOfficialWeatherProviderStatus(profile)
    return weatherDegradationResponse({
      projectId,
      reason: 'official_weather_provider_unconfigured_or_city_code_missing',
      provider: providerStatus.provider,
      missing: providerStatus.missing,
      message: providerStatus.message,
    })
  }

  if (request.adapter === 'on_demand_web') {
    try {
      return await syncOnDemandWebWeatherForecast(projectId, profile, request, options)
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (!isWeatherLookupFailure(error)) throw error
      logger.warn('[projectClimateProfileService] on-demand city weather lookup degraded', {
        projectId,
        provider: request.provider,
        error,
      })
      return weatherDegradationResponse({
        projectId,
        reason: 'weather_lookup_failed',
        provider: request.provider,
        message: 'City weather lookup failed; planning algorithms will use seasonal and project-history fallback rules.',
        detail: normalizeWeatherError(error),
      })
    }
  }

  let payload: any
  try {
    payload = await fetchWeatherJson(request.endpoint, options.signal)
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (!isWeatherLookupFailure(error)) throw error
    logger.warn('[projectClimateProfileService] configured weather provider lookup degraded', {
      projectId,
      provider: request.provider,
      error,
    })
    return weatherDegradationResponse({
      projectId,
      reason: 'weather_lookup_failed',
      provider: request.provider,
      message: 'Configured weather provider lookup failed; planning algorithms will use seasonal and project-history fallback rules.',
      detail: normalizeWeatherError(error),
    })
  }
  const forecasts = parseWeatherForecastPayload(payload, profile, request.adapter)
  const result = await persistWeatherForecasts({
    projectId,
    forecastCity: profile.city,
    forecastAdminCode: request.areaId ?? profile.adminCode,
    provider: request.provider,
    sourceUrl: request.sourceUrl,
    forecasts,
  })
  return {
    projectId,
    status: 'synced' as const,
    provider: request.provider,
    written: result.written,
  }
}

export async function syncAllProjectWeatherForecasts(
  projectIds?: string[] | null,
  options: WeatherSyncOptions = {},
) {
  const activeProjectIds = await listActiveProjectIds(projectIds)
  const results: Array<{ projectId: string; weather: unknown; error?: string }> = []
  for (const projectId of activeProjectIds) {
    try {
      const weather = await syncProjectWeatherForecast(projectId, options)
      results.push({ projectId, weather })
    } catch (error) {
      if (options.signal?.aborted) throw error
      results.push({
        projectId,
        weather: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

export async function syncAllProjectClimateProfiles(
  projectIds?: string[] | null,
  options: WeatherSyncOptions = {},
) {
  await bootstrapRegionalClimateRules()
  const activeProjectIds = await listActiveProjectIds(projectIds)
  const results: Array<{ projectId: string; profile: ProjectClimateProfile | null; weather: unknown; error?: string }> = []
  for (const projectId of activeProjectIds) {
    try {
      const profile = await rebuildProjectClimateProfile(projectId)
      let weather: unknown = null
      try {
        weather = await syncProjectWeatherForecast(projectId, options)
      } catch (error) {
        if (options.signal?.aborted) throw error
        weather = {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }
      }
      results.push({ projectId, profile, weather })
    } catch (error) {
      if (options.signal?.aborted) throw error
      results.push({
        projectId,
        profile: null,
        weather: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
