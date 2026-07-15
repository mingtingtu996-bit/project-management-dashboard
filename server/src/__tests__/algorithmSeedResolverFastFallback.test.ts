import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  versionQueryMode: 'pending' as 'pending' | 'empty' | 'active',
  stableCodeLookups: [] as string[][],
  systemRecordReadCount: 0,
  tableReadCount: 0,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async () => null),
  isUuidLike: (value: unknown) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value ?? '')),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => {
  class QueryBuilder {
    private readonly table: string
    private readonly filters: Array<{ column: string; value: unknown }> = []

    constructor(table: string) {
      this.table = table
    }

    select() {
      return this
    }

    eq() {
      this.filters.push({ column: arguments[0], value: arguments[1] })
      return this
    }

    in(column: string, values: unknown[]) {
      if (column === 'stable_code') state.stableCodeLookups.push(values.map((value) => String(value)))
      this.filters.push({ column, value: values })
      return this
    }

    maybeSingle() {
      if (this.table === 'algorithm_seed_versions' && state.versionQueryMode === 'pending') {
        return new Promise(() => {})
      }
      if (this.table === 'algorithm_seed_versions' && state.versionQueryMode === 'active') {
        return Promise.resolve({ data: { id: 'active-seed-version' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }

    then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
      if (this.table === 'algorithm_seed_records' && state.versionQueryMode === 'active') {
        state.systemRecordReadCount += 1
        const stableCodeFilter = this.filters.find((filter) => filter.column === 'stable_code')
        const stableCodes = Array.isArray(stableCodeFilter?.value) ? stableCodeFilter.value : []
        const data = stableCodes.includes('integrated_commissioning')
          ? [{
            stable_code: 'integrated_commissioning',
            rule_payload: {
              stableCode: 'integrated_commissioning',
              standardWorkCodes: ['integrated_commissioning'],
              keywords: ['integrated commissioning'],
              defaultDaysP50: 12,
              sourceStandard: 'test',
              sourceVersion: 'test',
              sourceClauseRef: 'test',
              evidenceSourceKeys: ['test'],
              webVerified: true,
              reviewNeeded: false,
            },
          }]
          : []
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject)
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => {
        state.tableReadCount += 1
        return new QueryBuilder(table)
      }),
    },
  }
})

const {
  clearAlgorithmSeedResolverCache,
  resolveDefaultMasterPlanVisibilityPolicy,
  resolveAlgorithmSeedRecordsWithDiagnostics,
} = await import('../services/algorithmSeedResolver.js')

describe('algorithmSeedResolver fast fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAlgorithmSeedResolverCache()
    state.versionQueryMode = 'pending'
    state.stableCodeLookups = []
    state.systemRecordReadCount = 0
    state.tableReadCount = 0
    process.env.ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS = '5'
  })

  afterEach(() => {
    delete process.env.ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS
  })

  it('falls back to TypeScript seed records when governed seed REST reads hang', async () => {
    const result = await Promise.race([
      resolveAlgorithmSeedRecordsWithDiagnostics('standard_work_duration', {}),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 80)),
    ])

    expect(result).not.toBe('timed-out')
    expect(result).toMatchObject({
      diagnostics: {
        fallbackUsed: true,
        fallbackReason: 'resolver_error',
      },
    })
    expect(result).toHaveProperty('records')
    expect((result as Awaited<ReturnType<typeof resolveAlgorithmSeedRecordsWithDiagnostics>>).records.length).toBeGreaterThan(0)
    expect((result as Awaited<ReturnType<typeof resolveAlgorithmSeedRecordsWithDiagnostics>>).records.every((record) => (
      record.__resolverSource === 'ts_seed_fallback'
    ))).toBe(true)
  })

  it('uses built-in cold-start assets without opening a governed database read for offline quality review', async () => {
    const result = await resolveAlgorithmSeedRecordsWithDiagnostics('standard_work_duration', {
      sourcePolicy: 'built_in_only',
    })

    expect(result.records.length).toBeGreaterThan(0)
    expect(result.records.every((record) => record.__resolverSource === 'ts_seed_fallback')).toBe(true)
    expect(result.diagnostics).toMatchObject({
      fallbackUsed: true,
      fallbackReason: 'explicit_built_in_only',
      fallbackRiskLevel: 'none',
      recommendedAction: 'none',
    })
    expect(state.tableReadCount).toBe(0)
  })

  it('uses a stable-code database filter for a direct duration-seed lookup', async () => {
    state.versionQueryMode = 'active'
    process.env.ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS = '25'
    const { resolveStandardWorkDurationSeedByStableCode } = await import('../services/algorithmSeedResolver.js')

    const result = await resolveStandardWorkDurationSeedByStableCode('integrated_commissioning', {})

    expect(result).toEqual(expect.objectContaining({
      __resolverSource: 'active_seed',
      __resolverVersionId: 'active-seed-version',
      stableCode: 'integrated_commissioning',
    }))
    expect(state.stableCodeLookups).toContainEqual(['integrated_commissioning'])
  })

  it('resolves default master-plan visibility policy through the governed seed resolver', async () => {
    state.versionQueryMode = 'empty'

    const records = await resolveDefaultMasterPlanVisibilityPolicy({})

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stableCode: 'master-plan-hide-residential-startup-detail',
        __resolverSource: 'ts_seed_fallback',
      }),
    ]))
  })

  it('reuses an active system seed across distinct project contexts', async () => {
    state.versionQueryMode = 'active'
    process.env.ALGORITHM_SEED_RESOLVER_READ_TIMEOUT_MS = '25'
    const { resolveStandardWorkDurationSeedByStableCode } = await import('../services/algorithmSeedResolver.js')

    const first = await resolveStandardWorkDurationSeedByStableCode('integrated_commissioning', {
      projectId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
    })
    const second = await resolveStandardWorkDurationSeedByStableCode('integrated_commissioning', {
      projectId: '33333333-3333-4333-8333-333333333333',
      companyId: '44444444-4444-4444-8444-444444444444',
    })

    expect(first?.__resolverSource).toBe('active_seed')
    expect(second?.__resolverSource).toBe('active_seed')
    expect(state.systemRecordReadCount).toBe(1)
  })
})
