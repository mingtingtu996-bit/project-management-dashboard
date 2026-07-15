import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import type { ProjectClimateProfile } from '../types/projectClimateProfile.js'
import { createAlgorithmSeedUpgradeCandidate } from './algorithmSeedLearningService.js'
import type { AlgorithmSeedType } from './algorithmSeedRegistry.js'

const ACTIVE_CANDIDATE_STATUSES = ['pending', 'candidate_only', 'auto_published', 'quarantined']
const REGIONAL_CLIMATE_RULE_CANDIDATE_TYPE: AlgorithmSeedType = 'regional_climate_rules'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function stableSegment(value: unknown) {
  const normalized = normalizeLower(value)
  const ascii = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (ascii) return ascii.slice(0, 48)
  if (!normalized) return 'unknown'
  return Buffer.from(normalized).toString('hex').slice(0, 48) || 'unknown'
}

function readRuleScope(profile: ProjectClimateProfile) {
  return normalizeText((profile.metadata ?? {}).regionalClimateRuleScope)
}

export function shouldCreateRegionalClimateRuleCandidate(profile: ProjectClimateProfile) {
  const province = normalizeText(profile.province)
  const city = normalizeText(profile.city)
  const adminCode = normalizeText(profile.adminCode)
  if (!normalizeText(profile.projectId)) return false
  if (!province && !city && !adminCode) return false
  if (!city && !adminCode) return false
  if (profile.source === 'default') return false

  const ruleScope = readRuleScope(profile)
  return ruleScope !== 'city' && ruleScope !== 'admin_code'
}

export function buildRegionalClimateRuleCandidate(profile: ProjectClimateProfile) {
  if (!shouldCreateRegionalClimateRuleCandidate(profile)) return null

  const province = normalizeText(profile.province) || 'unknown'
  const city = normalizeText(profile.city)
  const adminCode = normalizeText(profile.adminCode)
  const locationKey = adminCode || city || province
  const stableCode = [
    'regional_climate_rules',
    stableSegment(province),
    stableSegment(locationKey),
    'candidate',
  ].join(':')

  const evidenceSourceKeys = [
    `project_climate_profiles:${profile.projectId}`,
    `project_location_observations:${profile.projectId}`,
    profile.lastWeatherSyncedAt ? `project_weather_forecasts:${profile.projectId}` : null,
  ].filter(Boolean) as string[]

  const candidatePayload = {
    stableCode,
    province: profile.province,
    city: profile.city,
    adminCode: profile.adminCode,
    climateRegion: profile.climateRegion,
    thermalZone: profile.thermalZone,
    climateTags: profile.climateTags,
    rainySeasonMonths: profile.rainySeasonMonths,
    highTempMonths: profile.highTempMonths,
    coldWeatherMonths: profile.coldWeatherMonths,
    typhoonRiskLevel: profile.typhoonRiskLevel,
    floodSeasonMonths: profile.floodSeasonMonths,
    winterShutdownRiskLevel: profile.winterShutdownRiskLevel,
    softSoilLevel: profile.softSoilLevel,
    mountainTerrain: profile.mountainTerrain,
    terrainDifficultyLevel: profile.terrainDifficultyLevel,
    seismicIntensity: profile.seismicIntensity,
    sourceStandard: 'project_climate_profile_observation',
    sourceVersion: 'v1.4.7.5-regional-climate-candidate-interface-20260519',
    sourceClauseRef: 'project_climate_profiles.city_or_admin_observation_without_exact_regional_climate_rule',
    evidenceSourceKeys,
    webVerified: false,
    reviewNeeded: true,
    ruleVersion: 1,
    isActive: false,
    confidence: profile.confidence,
    status: 'candidate_only',
    governancePolicy: 'auto_candidate_only_until_enterprise_standard_library_admin_review',
    frontendVisible: false,
  }

  const evidenceSummary = {
    source: 'project_climate_profiles.regional_climate_candidate',
    frontendVisible: false,
    governanceStatus: 'candidate_only_until_admin_console',
    regionalClimateRuleScope: readRuleScope(profile) || 'none',
    projectId: profile.projectId,
    province: profile.province,
    city: profile.city,
    adminCode: profile.adminCode,
    observationCount: profile.observationCount,
    distinctUserCount: profile.distinctUserCount,
    profileSource: profile.source,
    locationConsensusStatus: profile.locationConsensusStatus,
    softSoilLevel: profile.softSoilLevel,
    mountainTerrain: profile.mountainTerrain,
    terrainDifficultyLevel: profile.terrainDifficultyLevel,
    seismicIntensity: profile.seismicIntensity,
    lastWeatherSyncedAt: profile.lastWeatherSyncedAt,
    evidenceSourceKeys,
  }

  return {
    seedType: REGIONAL_CLIMATE_RULE_CANDIDATE_TYPE,
    stableCode,
    candidatePayload,
    candidateSource: 'system_observation' as const,
    projectId: profile.projectId,
    sampleCount: Math.max(1, Number(profile.observationCount ?? 0)),
    variance: null,
    confidenceLevel: profile.confidence,
    evidenceSummary,
    actionPolicy: 'candidate_only' as const,
    status: 'candidate_only' as const,
  }
}

async function hasExistingRegionalClimateCandidate(candidate: NonNullable<ReturnType<typeof buildRegionalClimateRuleCandidate>>) {
  let query = (supabase as any)
    .from('algorithm_seed_upgrade_candidates')
    .select('id')
    .eq('seed_type', candidate.seedType)
    .eq('stable_code', candidate.stableCode)
    .in('status', ACTIVE_CANDIDATE_STATUSES)
    .limit(1)

  query = candidate.projectId ? query.eq('project_id', candidate.projectId) : query.is('project_id', null)

  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

export async function createRegionalClimateRuleCandidateForProfile(profile: ProjectClimateProfile) {
  const candidate = buildRegionalClimateRuleCandidate(profile)
  if (!candidate) return { created: false, skipped: 'not_needed' as const }

  try {
    if (await hasExistingRegionalClimateCandidate(candidate)) {
      return { created: false, skipped: 'duplicate' as const, stableCode: candidate.stableCode }
    }

    const data = await createAlgorithmSeedUpgradeCandidate(candidate)
    return { created: true, candidate: data, stableCode: candidate.stableCode }
  } catch (error) {
    logger.warn('[regionalClimateRuleCandidateService] failed to create regional climate rule candidate', {
      projectId: profile.projectId,
      stableCode: candidate.stableCode,
      error,
    })
    return {
      created: false,
      skipped: 'write_failed' as const,
      stableCode: candidate.stableCode,
    }
  }
}
