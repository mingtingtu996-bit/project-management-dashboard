import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uuidCounter: 0,
  tables: {
    algorithm_seed_upgrade_candidates: [] as any[],
  },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    mocks.uuidCounter += 1
    return `regional-climate-candidate-${mocks.uuidCounter}`
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  clearAlgorithmSeedResolverCache: vi.fn(),
}))

vi.mock('../services/dbService.js', () => {
  type Filter = { op: 'eq' | 'in' | 'is'; column: string; value: any }

  class QueryBuilder {
    private readonly filters: Filter[] = []
    private insertedRows: any[] | null = null

    select() {
      return this
    }

    insert(payload: any) {
      const rows = Array.isArray(payload) ? payload : [payload]
      this.insertedRows = rows.map((row) => ({ ...row }))
      mocks.tables.algorithm_seed_upgrade_candidates.push(...this.insertedRows)
      return this
    }

    eq(column: string, value: any) {
      this.filters.push({ op: 'eq', column, value })
      return this
    }

    in(column: string, value: any) {
      this.filters.push({ op: 'in', column, value })
      return this
    }

    is(column: string, value: any) {
      this.filters.push({ op: 'is', column, value })
      return this
    }

    order() {
      return this
    }

    limit() {
      return this
    }

    maybeSingle() {
      return Promise.resolve({ data: this.resolveRows()[0] ?? null, error: null })
    }

    single() {
      return Promise.resolve({ data: this.insertedRows?.[0] ?? this.resolveRows()[0] ?? null, error: null })
    }

    then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: this.insertedRows ?? this.resolveRows(), error: null }).then(resolve, reject)
    }

    private resolveRows() {
      return mocks.tables.algorithm_seed_upgrade_candidates.filter((row) => this.matches(row))
    }

    private matches(row: any) {
      return this.filters.every((filter) => {
        if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(row[filter.column])
        if (filter.op === 'is') return row[filter.column] === filter.value
        return row[filter.column] === filter.value
      })
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table !== 'algorithm_seed_upgrade_candidates') throw new Error(`Unexpected table ${table}`)
        return new QueryBuilder()
      }),
    },
  }
})

import {
  buildRegionalClimateRuleCandidate,
  createRegionalClimateRuleCandidateForProfile,
  shouldCreateRegionalClimateRuleCandidate,
} from '../services/regionalClimateRuleCandidateService.js'
import type { ProjectClimateProfile } from '../services/projectClimateProfileService.js'

function profile(overrides: Partial<ProjectClimateProfile> = {}): ProjectClimateProfile {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    province: 'guangdong',
    city: 'foshan',
    adminCode: '440600',
    climateRegion: 'south',
    thermalZone: 'hot_summer_warm_winter',
    climateTags: ['coastal_humid'],
    rainySeasonMonths: [4, 5, 6, 7, 8],
    highTempMonths: [6, 7, 8, 9],
    coldWeatherMonths: [],
    typhoonRiskLevel: 'medium',
    floodSeasonMonths: [5, 6, 7, 8],
    winterShutdownRiskLevel: 'none',
    softSoilLevel: 2,
    mountainTerrain: true,
    terrainDifficultyLevel: 1,
    seismicIntensity: 7,
    confidence: 'medium',
    locationConsensusStatus: 'city_consensus',
    observationCount: 4,
    distinctUserCount: 2,
    source: 'multi_user_location',
    sourceRuleId: 'province-rule-1',
    weatherProvider: null,
    lastWeatherSyncedAt: null,
    metadata: {
      regionalClimateRuleScope: 'province',
    },
    resolvedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('regionalClimateRuleCandidateService', () => {
  beforeEach(() => {
    mocks.uuidCounter = 0
    mocks.tables.algorithm_seed_upgrade_candidates = []
  })

  it('creates hidden candidate-only regional climate rule payload when city has no exact rule', () => {
    const input = profile()
    expect(shouldCreateRegionalClimateRuleCandidate(input)).toBe(true)

    const candidate = buildRegionalClimateRuleCandidate(input)
    expect(candidate).toEqual(expect.objectContaining({
      seedType: 'regional_climate_rules',
      candidateSource: 'system_observation',
      actionPolicy: 'candidate_only',
      status: 'candidate_only',
      projectId: input.projectId,
      sampleCount: 4,
    }))
    expect(candidate?.candidatePayload).toEqual(expect.objectContaining({
      frontendVisible: false,
      governancePolicy: 'auto_candidate_only_until_enterprise_standard_library_admin_review',
      city: 'foshan',
      adminCode: '440600',
      softSoilLevel: 2,
      mountainTerrain: true,
      terrainDifficultyLevel: 1,
      seismicIntensity: 7,
      reviewNeeded: true,
      webVerified: false,
    }))
    expect(candidate?.evidenceSummary).toEqual(expect.objectContaining({
      frontendVisible: false,
      governanceStatus: 'candidate_only_until_admin_console',
      regionalClimateRuleScope: 'province',
      softSoilLevel: 2,
      mountainTerrain: true,
      terrainDifficultyLevel: 1,
      seismicIntensity: 7,
    }))
  })

  it('does not create a candidate when an exact city rule already exists', () => {
    const input = profile({
      metadata: {
        regionalClimateRuleScope: 'city',
      },
    })

    expect(shouldCreateRegionalClimateRuleCandidate(input)).toBe(false)
    expect(buildRegionalClimateRuleCandidate(input)).toBeNull()
  })

  it('writes regional climate candidates through the shared algorithm seed learning lifecycle', async () => {
    const result = await createRegionalClimateRuleCandidateForProfile(profile())

    expect(result).toEqual(expect.objectContaining({
      created: true,
      stableCode: expect.stringContaining('regional_climate_rules:'),
    }))
    expect(mocks.tables.algorithm_seed_upgrade_candidates).toHaveLength(1)
    expect(mocks.tables.algorithm_seed_upgrade_candidates[0]).toEqual(expect.objectContaining({
      id: 'regional-climate-candidate-1',
      seed_type: 'regional_climate_rules',
      candidate_fingerprint: expect.any(String),
      candidate_source: 'system_observation',
      action_policy: 'candidate_only',
      status: 'candidate_only',
    }))

    const duplicate = await createRegionalClimateRuleCandidateForProfile(profile())
    expect(duplicate).toEqual(expect.objectContaining({
      created: false,
      skipped: 'duplicate',
    }))
    expect(mocks.tables.algorithm_seed_upgrade_candidates).toHaveLength(1)
  })
})
