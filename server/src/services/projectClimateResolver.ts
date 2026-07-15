import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import { resolveProjectClimateProfile } from './projectClimateProfileService.js'
import type { V1474RegionCode } from '../seeds/v1474SeasonalProductivitySeed.js'
import { V1474_REGIONAL_CLIMATE_RULE_SEED } from '../seeds/v1474RegionalClimateRuleSeed.js'

export type ProjectClimateRegionResult = {
  regionCode: V1474RegionCode
  thermalZone: string | null
  climateTags: string[]
  rainySeasonMonths: number[]
  floodSeasonMonths: number[]
  highTempMonths: number[]
  coldWeatherMonths: number[]
  typhoonRiskLevel: string | null
  winterShutdownRiskLevel: string | null
  softSoilLevel: number | null
  mountainTerrain: boolean
  terrainDifficultyLevel: number | null
  seismicIntensity: number | null
  confidence: 'high' | 'medium' | 'low'
  source: 'climate_profile' | 'project_location' | 'default'
  location: string | null
  reason: string
}

const REGION_KEYWORDS: Array<{ regionCode: Exclude<V1474RegionCode, 'default'>; keywords: string[] }> = [
  {
    regionCode: 'north',
    keywords: [
      '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
      'beijing', 'tianjin', 'hebei', 'shanxi', 'inner mongolia', 'liaoning', 'jilin', 'heilongjiang',
    ],
  },
  {
    regionCode: 'east',
    keywords: [
      '上海', '江苏', '南京', '苏州', '无锡', '常州', '浙江', '杭州', '宁波',
      '安徽', '合肥', '福建', '福州', '厦门', '江西', '南昌', '山东', '济南', '青岛',
      '河南', '郑州', '湖北', '武汉', '湖南', '长沙',
      'shanghai', 'jiangsu', 'nanjing', 'suzhou', 'zhejiang', 'hangzhou', 'anhui',
      'fujian', 'jiangxi', 'shandong', 'henan', 'hubei', 'hunan',
    ],
  },
  {
    regionCode: 'south',
    keywords: [
      '广东', '广州', '深圳', '珠海', '广西', '南宁', '海南', '海口',
      'guangdong', 'guangzhou', 'shenzhen', 'guangxi', 'hainan',
    ],
  },
  {
    regionCode: 'west',
    keywords: [
      '重庆', '四川', '成都', '贵州', '贵阳', '云南', '昆明', '西藏', '陕西', '西安',
      '甘肃', '兰州', '青海', '宁夏', '新疆',
      'chongqing', 'sichuan', 'chengdu', 'guizhou', 'yunnan', 'tibet', 'shaanxi',
      'gansu', 'qinghai', 'ningxia', 'xinjiang',
    ],
  },
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeMonthArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
    : []
}

function seedTextMatches(value: unknown, normalizedText: string) {
  const normalizedValue = normalizeText(value).toLowerCase()
  return normalizedValue && normalizedText.includes(normalizedValue)
}

function inferClimateRegionFromSeed(location: string): ProjectClimateRegionResult | null {
  const normalized = location.toLowerCase()
  const match = V1474_REGIONAL_CLIMATE_RULE_SEED
    .map((rule, index) => {
      let score = 0
      if (seedTextMatches(rule.adminCode, normalized)) score += 120
      if (seedTextMatches(rule.city, normalized)) score += 100
      if (rule.aliases.some((alias) => seedTextMatches(alias, normalized))) score += 70
      if (seedTextMatches(rule.province, normalized)) score += 40
      if (score > 0 && rule.city) score += 20
      return score > 0 ? { rule, score, index } : null
    })
    .filter((item): item is { rule: typeof V1474_REGIONAL_CLIMATE_RULE_SEED[number]; score: number; index: number } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.rule

  if (!match) return null
  return {
    regionCode: match.climateRegion,
    thermalZone: match.thermalZone,
    climateTags: match.climateTags,
    rainySeasonMonths: normalizeMonthArray(match.rainySeasonMonths),
    floodSeasonMonths: normalizeMonthArray(match.floodSeasonMonths),
    highTempMonths: normalizeMonthArray(match.highTempMonths),
    coldWeatherMonths: normalizeMonthArray(match.coldWeatherMonths),
    typhoonRiskLevel: match.typhoonRiskLevel,
    winterShutdownRiskLevel: match.winterShutdownRiskLevel,
    softSoilLevel: match.softSoilLevel,
    mountainTerrain: match.mountainTerrain,
    terrainDifficultyLevel: match.terrainDifficultyLevel,
    seismicIntensity: match.seismicIntensity,
    confidence: match.city ? 'medium' : 'low',
    source: 'project_location',
    location,
    reason: `Project location matched regional_climate_rules seed ${match.province}${match.city ? `/${match.city}` : ''}.`,
  }
}

export function inferV1474ClimateRegionFromLocation(location: unknown): ProjectClimateRegionResult {
  const text = normalizeText(location)
  const normalized = text.toLowerCase()
  if (!normalized) {
    return {
      regionCode: 'default',
      thermalZone: null,
      climateTags: [],
      rainySeasonMonths: [],
      floodSeasonMonths: [],
      highTempMonths: [],
      coldWeatherMonths: [],
      typhoonRiskLevel: 'none',
      winterShutdownRiskLevel: 'none',
      softSoilLevel: 0,
      mountainTerrain: false,
      terrainDifficultyLevel: 0,
      seismicIntensity: null,
      confidence: 'low',
      source: 'default',
      location: null,
      reason: 'Project location is empty; seasonal productivity uses the default climate region.',
    }
  }

  const seedMatch = inferClimateRegionFromSeed(text)
  if (seedMatch) return seedMatch

  for (const region of REGION_KEYWORDS) {
    if (region.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return {
        regionCode: region.regionCode,
        thermalZone: null,
        climateTags: [],
        rainySeasonMonths: [],
        floodSeasonMonths: [],
        highTempMonths: [],
        coldWeatherMonths: [],
        typhoonRiskLevel: 'none',
        winterShutdownRiskLevel: 'none',
        softSoilLevel: 0,
        mountainTerrain: false,
        terrainDifficultyLevel: 0,
        seismicIntensity: null,
        confidence: 'medium',
        source: 'project_location',
        location: text,
        reason: `Project location matched ${region.regionCode} climate-region keywords.`,
      }
    }
  }

  return {
    regionCode: 'default',
    thermalZone: null,
    climateTags: [],
    rainySeasonMonths: [],
    floodSeasonMonths: [],
    highTempMonths: [],
    coldWeatherMonths: [],
    typhoonRiskLevel: 'none',
    winterShutdownRiskLevel: 'none',
    softSoilLevel: 0,
    mountainTerrain: false,
    terrainDifficultyLevel: 0,
    seismicIntensity: null,
    confidence: 'low',
    source: 'default',
    location: text,
    reason: 'Project location could not be mapped to a supported v1.4.7.4 climate region.',
  }
}

export async function resolveProjectClimateRegion(projectId: string | null | undefined): Promise<ProjectClimateRegionResult> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return inferV1474ClimateRegionFromLocation(null)

  try {
    const profile = await resolveProjectClimateProfile(normalizedProjectId)
    if (profile.climateRegion !== 'default' || profile.confidence !== 'low') {
      return {
        regionCode: profile.climateRegion,
        thermalZone: profile.thermalZone,
        climateTags: profile.climateTags,
        rainySeasonMonths: profile.rainySeasonMonths,
        floodSeasonMonths: profile.floodSeasonMonths,
        highTempMonths: profile.highTempMonths,
        coldWeatherMonths: profile.coldWeatherMonths,
        typhoonRiskLevel: profile.typhoonRiskLevel,
        winterShutdownRiskLevel: profile.winterShutdownRiskLevel,
        softSoilLevel: Number(profile.softSoilLevel ?? profile.metadata?.softSoilLevel ?? 0),
        mountainTerrain: Boolean(profile.mountainTerrain ?? profile.metadata?.mountainTerrain ?? false),
        terrainDifficultyLevel: Number(profile.terrainDifficultyLevel ?? profile.metadata?.terrainDifficultyLevel ?? 0),
        seismicIntensity: profile.seismicIntensity == null && profile.metadata?.seismicIntensity == null
          ? null
          : Number(profile.seismicIntensity ?? profile.metadata?.seismicIntensity),
        confidence: profile.confidence,
        source: 'climate_profile',
        location: [profile.province, profile.city].filter(Boolean).join(' ') || null,
        reason: `Project climate profile resolved by ${profile.source}/${profile.locationConsensusStatus}.`,
      }
    }

    const { data, error } = await (supabase as any)
      .from('projects')
      .select('location')
      .eq('id', normalizedProjectId)
      .maybeSingle()

    if (error) throw error
    return inferV1474ClimateRegionFromLocation((data as any)?.location ?? null)
  } catch (error) {
    logger.warn('[projectClimateResolver] failed to resolve project climate region; using default', {
      projectId: normalizedProjectId,
      error,
    })
    return {
      regionCode: 'default',
      thermalZone: null,
      climateTags: [],
      rainySeasonMonths: [],
      floodSeasonMonths: [],
      highTempMonths: [],
      coldWeatherMonths: [],
      typhoonRiskLevel: 'none',
      winterShutdownRiskLevel: 'none',
      softSoilLevel: 0,
      mountainTerrain: false,
      terrainDifficultyLevel: 0,
      seismicIntensity: null,
      confidence: 'low',
      source: 'default',
      location: null,
      reason: 'Project location lookup failed; seasonal productivity uses the default climate region.',
    }
  }
}
