import type { V1474RegionCode } from '../seeds/v1474SeasonalProductivitySeed.js'

export type Confidence = 'high' | 'medium' | 'low'

export type ClimateSource =
  | 'multi_user_location'
  | 'single_user_location'
  | 'project_location'
  | 'ip_location'
  | 'default'

export type LocationConsensusStatus =
  | 'city_consensus'
  | 'province_consensus'
  | 'single_observation'
  | 'project_location_fallback'
  | 'default_fallback'
  | 'conflict'

export type ProjectClimateProfile = {
  projectId: string
  province: string | null
  city: string | null
  adminCode: string | null
  climateRegion: V1474RegionCode
  thermalZone: string | null
  climateTags: string[]
  rainySeasonMonths: number[]
  highTempMonths: number[]
  coldWeatherMonths: number[]
  typhoonRiskLevel: string
  floodSeasonMonths: number[]
  winterShutdownRiskLevel: string
  softSoilLevel: number
  mountainTerrain: boolean
  terrainDifficultyLevel: number
  seismicIntensity: number | null
  confidence: Confidence
  locationConsensusStatus: LocationConsensusStatus
  observationCount: number
  distinctUserCount: number
  source: ClimateSource
  sourceRuleId: string | null
  weatherProvider: string | null
  lastWeatherSyncedAt: string | null
  metadata: Record<string, unknown>
  resolvedAt: string
}
