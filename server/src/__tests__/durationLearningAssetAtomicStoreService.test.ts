import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
  persistCurrentCauseSegments: vi.fn(),
  promoteCanary: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../services/durationBenchmarkCauseSegmentService.js', () => ({
  persistCurrentCauseSegments: mocks.persistCurrentCauseSegments,
}))

vi.mock('../services/durationLearningRuntimePublicationService.js', () => ({
  promoteDurationLearningRuntimeCanary: mocks.promoteCanary,
}))

const {
  replaceDurationBenchmarkAtomically,
  stageDurationBenchmarkCandidateAtomically,
  promoteDurationBenchmarkRuntimeCanaryAtomically,
  replaceProjectProductivityCalibrationAtomically,
  rollbackProjectProductivityCalibrationAtomically,
} = await import('../services/durationLearningAssetAtomicStoreService.js')

const { persistCurrentCauseSegments: persistCurrentCauseSegmentsActual } = await vi.importActual<
  typeof import('../services/durationBenchmarkCauseSegmentService.js')
>('../services/durationBenchmarkCauseSegmentService.js')

describe('durationLearningAssetAtomicStoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClient.mockResolvedValue({ query: mocks.query, release: mocks.release })
    mocks.persistCurrentCauseSegments.mockResolvedValue([])
    mocks.promoteCanary.mockResolvedValue({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] })
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('update public.duration_benchmarks')) return { rows: [{ id: 'benchmark-old' }], rowCount: 1 }
      if (normalized.includes('insert into public.duration_benchmarks')) return { rows: [{ id: 'benchmark-new', benchmark_key: 'work-1' }], rowCount: 1 }
      if (normalized.includes('select id from public.project_productivity_compensation_calibrations')) {
        return { rows: [{ id: 'calibration-old' }], rowCount: 1 }
      }
      if (normalized.includes('insert into public.project_productivity_compensation_calibrations')) {
        return { rows: [{ id: 'calibration-new', status: 'published' }], rowCount: 1 }
      }
      if (normalized.includes('update public.project_productivity_compensation_calibrations')) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })
  })

  it('replaces the current duration benchmark inside one database transaction', async () => {
    const row = await replaceDurationBenchmarkAtomically({
      company_id: 'company-1',
      benchmark_key: 'work-1',
      benchmark_version: 'v1:2026-07-14',
      sample_count: 100,
      p50_days: 8,
      duration_day_basis: 'construction_production_day',
      is_current: true,
      is_active: true,
    })

    expect(row).toEqual(expect.objectContaining({ id: 'benchmark-new' }))
    const sql = mocks.query.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, ' ').trim().toLowerCase())
    expect(sql[0]).toBe('begin')
    expect(sql).toEqual(expect.arrayContaining([
      expect.stringContaining('update public.duration_benchmarks'),
      expect.stringContaining('insert into public.duration_benchmarks'),
    ]))
    const insertCall = mocks.query.mock.calls.find(([statement]) => String(statement).includes('insert into public.duration_benchmarks'))
    expect(insertCall?.[0]).toContain('duration_day_basis')
    expect(insertCall?.[1]).toContain('construction_production_day')
    expect(sql.at(-1)).toBe('commit')
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('uses the exact project scope and persists cause segments before committing the benchmark', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('from public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (normalized.includes('update public.duration_benchmarks')) return { rows: [], rowCount: 1 }
      if (normalized.includes('insert into public.duration_benchmarks')) {
        return {
          rows: [{
            id: 'benchmark-project-1',
            benchmark_key: 'work-1',
            company_id: 'company-1',
            project_id: 'project-1',
            duration_day_basis: 'construction_production_day',
            generated_at: new Date('2026-07-21T00:00:00.000Z'),
            source_window_start: new Date('2026-07-01T00:00:00.000Z'),
            source_as_of: new Date('2026-07-20T00:00:00.000Z'),
            metadata: { calendar_ref: 'cn-work-calendar', calendar_version: '2026.07' },
          }],
          rowCount: 1,
        }
      }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await replaceDurationBenchmarkAtomically({
      company_id: 'company-1',
      project_id: 'project-1',
      benchmark_key: 'work-1',
      benchmark_version: 'v1:2026-07-21',
      generated_at: '2026-07-21T00:00:00.000Z',
      source_window_start: '2026-07-01T00:00:00.000Z',
      source_as_of: '2026-07-20T00:00:00.000Z',
      p50_days: 8,
      p75_days: 10,
      p80_days: 11,
      mean_days: 8.5,
      variance: 2.25,
      coefficient_of_variation: 0.176471,
      sample_count: 20,
      confidence_level: 'high',
      confidence_score: 88,
      duration_day_basis: 'construction_production_day',
      is_current: true,
      is_active: true,
      metadata: { calendar_ref: 'cn-work-calendar', calendar_version: '2026.07' },
    })

    const sql = mocks.query.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, ' ').trim().toLowerCase())
    const replacementSql = sql.find((statement) => statement.includes('update public.duration_benchmarks'))
    expect(replacementSql).toContain('project_id is not distinct from $3::uuid')
    const insertCall = mocks.query.mock.calls.find(([statement]) => String(statement).includes('insert into public.duration_benchmarks'))
    expect(insertCall?.[0]).toContain('project_id')
    expect(insertCall?.[0]).toContain('generated_at')
    expect(insertCall?.[0]).toContain('source_window_start')
    expect(insertCall?.[0]).toContain('source_as_of')
    expect(mocks.persistCurrentCauseSegments).toHaveBeenCalledWith({
      benchmarkId: 'benchmark-project-1',
      companyId: 'company-1',
      projectId: 'project-1',
      benchmarkKey: 'work-1',
      generatedAt: '2026-07-21T00:00:00.000Z',
      sourceWindowStart: '2026-07-01T00:00:00.000Z',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    }, expect.anything())
    const commitIndex = sql.indexOf('commit')
    expect(commitIndex).toBeGreaterThan(sql.findIndex((statement) => statement.includes('insert into public.duration_benchmarks')))
    expect(mocks.persistCurrentCauseSegments.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.query.mock.invocationCallOrder[commitIndex])
  })

  it('rolls back the benchmark when cause-segment persistence fails', async () => {
    mocks.persistCurrentCauseSegments.mockImplementationOnce(persistCurrentCauseSegmentsActual)
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('update public.duration_benchmarks')) return { rows: [], rowCount: 1 }
      if (normalized.includes('insert into public.duration_benchmarks')) {
        return {
          rows: [{
            id: 'benchmark-new',
            benchmark_key: 'work-1',
            company_id: 'company-1',
            project_id: null,
            duration_day_basis: 'construction_production_day',
            generated_at: '2026-07-21T00:00:00.000Z',
            source_window_start: null,
            source_as_of: '2026-07-20T00:00:00.000Z',
            metadata: { calendar_ref: 'cn-work-calendar', calendar_version: '2026.07' },
          }],
          rowCount: 1,
        }
      }
      if (normalized.includes('from public.duration_experience_samples sample')) {
        return {
          rows: [{
            sample_id: 'sample-1',
            attribution_id: 'attribution-1',
            cause_code: 'material_shortage',
            taxonomy_version: 'v1.0.0',
            actual_duration_production_days: 6,
            sample_company_id: 'company-1',
            sample_project_id: null,
            attribution_company_id: 'company-1',
            attribution_project_id: null,
            attribution_status: 'confirmed',
            attribution_event_type: 'completion',
            cause_role: 'primary',
            confirmed_at: '2026-07-19T00:00:00.000Z',
            source_type: 'task_completion',
            snapshot_attribution_id: 'attribution-1',
            snapshot_cause_code: 'material_shortage',
            snapshot_taxonomy_version: 'v1.0.0',
            snapshot_event_type: 'completion',
            snapshot_confirmed_at: '2026-07-19T00:00:00.000Z',
            snapshot_primary_count: 1,
            included_in_benchmark: true,
            sample_strength: 'strong',
            duration_day_basis: 'construction_production_day',
            calendar_ref: 'cn-work-calendar',
            calendar_version: '2026.07',
          }],
          rowCount: 1,
        }
      }
      if (normalized.includes('update public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await expect(replaceDurationBenchmarkAtomically({
      company_id: 'company-1',
      benchmark_key: 'work-1',
      benchmark_version: 'v1:2026-07-21',
      generated_at: '2026-07-21T00:00:00.000Z',
      source_as_of: '2026-07-20T00:00:00.000Z',
      duration_day_basis: 'construction_production_day',
      is_current: true,
      is_active: true,
      metadata: { calendar_ref: 'cn-work-calendar', calendar_version: '2026.07' },
    })).rejects.toThrow('cause segment INSERT must return exactly one row')

    expect(mocks.query.mock.calls.map(([statement]) => String(statement).trim().toLowerCase())).toContain('rollback')
  })

  it('stages a learned benchmark candidate without retiring the current stable benchmark', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmarks')) {
        return { rows: [{ id: 'benchmark-candidate', is_current: false }], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    const row = await stageDurationBenchmarkCandidateAtomically({
      company_id: 'company-1',
      benchmark_key: 'work-1',
      benchmark_version: 'candidate:2026-07-17:abc',
      duration_day_basis: 'construction_production_day',
      p50_days: 8,
      is_current: false,
      is_active: true,
      metadata: {
        candidate_operation_id: 'abc',
        runtime_publication_status: 'candidate',
      },
    })

    expect(row).toEqual(expect.objectContaining({ id: 'benchmark-candidate', is_current: false }))
    const sql = mocks.query.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, ' ').trim().toLowerCase())
    expect(sql).not.toEqual(expect.arrayContaining([
      expect.stringContaining('set is_current = false'),
    ]))
    const insertCall = mocks.query.mock.calls.find(([statement]) => String(statement).includes('insert into public.duration_benchmarks'))
    const currentCandidateCall = mocks.query.mock.calls.find(([statement]) => (
      String(statement).includes('from public.duration_benchmarks')
      && String(statement).includes("metadata ->> 'candidate_operation_id'")
    ))
    expect(currentCandidateCall?.[0]).toContain('project_id is not distinct from $3::uuid')
    expect(currentCandidateCall?.[1]?.slice(0, 4)).toEqual(['work-1', 'company-1', null, 'abc'])
    expect(insertCall?.[1]).toContain(false)
    expect(sql.at(-1)).toBe('commit')
  })

  it('returns an unchanged outstanding-canary candidate without rewriting replay clocks', async () => {
    const existing = {
      id: '11111111-1111-4111-8111-111111111111',
      company_id: 'company-1', project_id: null, benchmark_key: 'work-1',
      benchmark_version: 'candidate:2026-07-17:abc', duration_day_basis: 'construction_production_day',
      p50_days: 8, sample_count: 20, is_current: false, is_active: true,
      generated_at: '2026-07-17T00:00:00.000Z', source_window_start: '2026-07-01T00:00:00.000Z',
      source_as_of: '2026-07-16T00:00:00.000Z',
      metadata: { candidate_operation_id: 'abc', evidence_contract_hash: 'contract-1', runtime_publication_status: 'canary' },
    }
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [existing], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    const replayed = await stageDurationBenchmarkCandidateAtomically({
      ...existing,
      generated_at: '2026-07-18T00:00:00.000Z',
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    })

    expect(replayed).toEqual(existing)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE public.duration_benchmarks'))).toBe(false)
  })

  it('rejects a same-operation replay whose evidence contract differs', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [{
        id: '11111111-1111-4111-8111-111111111111', company_id: 'company-1', project_id: null,
        benchmark_key: 'work-1', p50_days: 8, is_current: true, is_active: true,
        metadata: { candidate_operation_id: 'abc', evidence_contract_hash: 'contract-original' },
      }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await expect(stageDurationBenchmarkCandidateAtomically({
      company_id: 'company-1', benchmark_key: 'work-1', p50_days: 9,
      duration_day_basis: 'construction_production_day',
      metadata: { candidate_operation_id: 'abc', evidence_contract_hash: 'contract-different' },
    })).rejects.toThrow('duration benchmark candidate operation contract mismatch')
  })

  it('serializes absent-row staging by operation identity before lookup', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmarks')) return { rows: [{ id: 'created' }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await stageDurationBenchmarkCandidateAtomically({
      company_id: 'company-1', benchmark_key: 'work-1', duration_day_basis: 'construction_production_day',
      metadata: { candidate_operation_id: 'serialized', evidence_contract_hash: 'contract-1' },
    })

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase())
    const operationLockIndex = statements.findIndex((sql) => sql.includes('pg_advisory_xact_lock'))
    expect(operationLockIndex).toBeGreaterThan(0)
    expect(operationLockIndex).toBeLessThan(statements.findIndex((sql) => sql.includes('from public.duration_benchmarks')))
  })

  it('serializes concurrent absent-row staging so both callers observe one immutable row', async () => {
    let insertedRow: Record<string, unknown> | null = null
    let insertCount = 0
    let lockOwner: string | null = null
    const lockWaiters: Array<() => void> = []
    let secondTransactionStarted!: () => void
    const secondTransaction = new Promise<void>((resolve) => {
      secondTransactionStarted = resolve
    })

    const createClient = (name: string) => {
      const release = vi.fn()
      const query = vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        if (normalized === 'begin') {
          if (name === 'second') secondTransactionStarted()
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('pg_advisory_xact_lock')) {
          if (lockOwner && lockOwner !== name) {
            await new Promise<void>((resolve) => lockWaiters.push(resolve))
          }
          lockOwner = name
          return { rows: [{}], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_benchmarks')) {
          return insertedRow
            ? { rows: [insertedRow], rowCount: 1 }
            : { rows: [], rowCount: 0 }
        }
        if (normalized.includes('insert into public.duration_benchmarks')) {
          insertCount += 1
          if (name === 'first') await secondTransaction
          insertedRow = {
            id: `created-${insertCount}`,
            company_id: 'company-1',
            project_id: null,
            benchmark_key: 'work-1',
            is_current: false,
            is_active: true,
            metadata: {
              candidate_operation_id: 'concurrent-operation',
              evidence_contract_hash: 'contract-1',
            },
          }
          return { rows: [insertedRow], rowCount: 1 }
        }
        if (normalized === 'commit' || normalized === 'rollback') {
          if (lockOwner === name) {
            lockOwner = null
            lockWaiters.shift()?.()
          }
          return { rows: [], rowCount: 0 }
        }
        throw new Error(`Unexpected SQL: ${normalized}`)
      })
      return { query, release }
    }

    const firstClient = createClient('first')
    const secondClient = createClient('second')
    mocks.getClient
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(secondClient)

    const row = {
      company_id: 'company-1',
      project_id: null,
      benchmark_key: 'work-1',
      duration_day_basis: 'construction_production_day',
      metadata: {
        candidate_operation_id: 'concurrent-operation',
        evidence_contract_hash: 'contract-1',
      },
    }
    const [first, second] = await Promise.all([
      stageDurationBenchmarkCandidateAtomically(row),
      stageDurationBenchmarkCandidateAtomically(row),
    ])

    expect(insertCount).toBe(1)
    expect(first).toEqual(second)
    expect(firstClient.release).toHaveBeenCalledOnce()
    expect(secondClient.release).toHaveBeenCalledOnce()
  })

  it.each([
    { name: 'missing company', companyId: null, projectCompanyId: null, expected: 'company_id is required for project-scoped duration benchmark' },
    { name: 'missing project', companyId: 'company-1', projectCompanyId: null, expected: 'duration benchmark project not found' },
    { name: 'company mismatch', companyId: 'company-1', projectCompanyId: 'company-2', expected: 'duration benchmark project/company mismatch' },
  ])('rolls back project-scoped candidate writes for $name authority', async ({ companyId, projectCompanyId, expected }) => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('from public.projects')) {
        return { rows: projectCompanyId ? [{ company_id: projectCompanyId }] : [], rowCount: projectCompanyId ? 1 : 0 }
      }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmarks')) return { rows: [{ id: 'must-not-persist' }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await expect(stageDurationBenchmarkCandidateAtomically({
      company_id: companyId,
      project_id: 'project-1',
      benchmark_key: 'work-1',
      duration_day_basis: 'construction_production_day',
      metadata: { candidate_operation_id: 'authority-test' },
    })).rejects.toThrow(expected)

    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into public.duration_benchmarks'))).toBe(false)
    expect(mocks.query.mock.calls.map(([sql]) => String(sql).trim().toLowerCase())).toContain('rollback')
  })

  it('locks project authority before a valid project-scoped benchmark mutation', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('from public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmarks')) return { rows: [{ id: 'benchmark-valid' }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await stageDurationBenchmarkCandidateAtomically({
      company_id: 'company-1',
      project_id: 'project-1',
      benchmark_key: 'work-1',
      duration_day_basis: 'construction_production_day',
      metadata: { candidate_operation_id: 'valid-authority' },
    })

    const statements = mocks.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase())
    const projectLockIndex = statements.findIndex((sql) => sql.includes('from public.projects') && sql.includes('for no key update'))
    const benchmarkMutationIndex = statements.findIndex((sql) => sql.includes('public.duration_benchmarks'))
    expect(projectLockIndex).toBeGreaterThan(0)
    expect(projectLockIndex).toBeLessThan(benchmarkMutationIndex)
    expect(statements.some((sql) => sql.includes('from public.projects') && sql.includes('for key share'))).toBe(false)
  })

  it('promotes a runtime canary, activates its exact candidate, and writes segments in one transaction', async () => {
    const frozenAttribution = {
      attributionId: '44444444-4444-4444-8444-444444444444',
      causeCode: 'material_shortage', taxonomyVersion: 'v1.0.0', eventType: 'completion',
      causeRole: 'primary', confirmedAt: '2026-07-20T00:00:00.000Z',
    }
    const frozenSample = {
      sampleId: '55555555-5555-4555-8555-555555555555',
      taskId: '66666666-6666-4666-8666-666666666666',
      completedAt: '2026-07-19T00:00:00.000Z', createdAt: '2026-07-19T01:00:00.000Z',
      updatedAt: '2026-07-20T01:00:00.000Z', evidenceFingerprint: 'fingerprint-1',
      sourceLineage: { completionId: 'completion-1' }, structuredCauseAttributions: [frozenAttribution],
    }
    const candidate = {
      id: '11111111-1111-4111-8111-111111111111',
      company_id: '22222222-2222-4222-8222-222222222222',
      project_id: '33333333-3333-4333-8333-333333333333',
      benchmark_key: 'SW-1:process:all',
      duration_day_basis: 'construction_production_day',
      generated_at: '2026-07-21T00:00:00.000Z',
      source_window_start: '2026-04-22T00:00:00.000Z',
      source_as_of: '2026-07-20T00:00:00.000Z',
      p50_days: 8,
      p75_days: 10,
      p80_days: 11,
      mean_days: 8.5,
      variance: 2.25,
      coefficient_of_variation: 0.176471,
      sample_count: 20,
      confidence_level: 'high',
      confidence_score: 88,
      is_current: false,
      is_active: true,
      metadata: {
        calendar_ref: 'cn-work-calendar', calendar_version: '2026.07', runtime_publication_status: 'candidate',
        evidence_contract_hash: 'a'.repeat(64),
        sample_mutation_lineage: [frozenSample],
        structured_cause_attribution_lineage: [frozenAttribution],
      },
    }
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('from public.duration_learning_runtime_publications')) {
        return {
          rows: [{
            publication_key: 'publication-1',
            asset_key: 'base_duration_benchmark',
            artifact_key: candidate.benchmark_key,
            scope_level: 'project',
            company_id: candidate.company_id,
            project_id: candidate.project_id,
            publication_stage: 'canary',
            monitoring_status: 'passed',
            runtime_payload: {
              benchmarkId: candidate.id,
              p50Days: candidate.p50_days,
              p75Days: candidate.p75_days,
              p80Days: candidate.p80_days,
              meanDays: candidate.mean_days,
              variance: candidate.variance,
              coefficientOfVariation: candidate.coefficient_of_variation,
              sampleCount: candidate.sample_count,
              confidenceLevel: candidate.confidence_level,
              confidenceScore: candidate.confidence_score,
              durationDayBasis: candidate.duration_day_basis,
              generatedAt: candidate.generated_at,
              sourceWindowStart: candidate.source_window_start,
              sourceAsOf: candidate.source_as_of,
              calendarRef: candidate.metadata.calendar_ref,
              calendarVersion: candidate.metadata.calendar_version,
            },
          }],
          rowCount: 1,
        }
      }
      if (normalized.includes('from public.projects')) return { rows: [{ company_id: candidate.company_id }], rowCount: 1 }
      if (normalized.includes('where id = $1::uuid') && normalized.includes('for update')) return { rows: [candidate], rowCount: 1 }
      if (normalized.includes('set is_current = false')) return { rows: [], rowCount: 1 }
      if (normalized.includes('set is_current = true')) {
        return { rows: [{ ...candidate, is_current: true, metadata: { ...candidate.metadata, runtime_publication_status: 'published', runtime_publication_key: 'publication-1' } }], rowCount: 1 }
      }
      if (normalized.includes("'cause_segments_publication_key'")) return { rows: [{ id: candidate.id }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    const result = await promoteDurationBenchmarkRuntimeCanaryAtomically({
      publicationKey: 'publication-1',
      benchmarkId: candidate.id,
      companyId: candidate.company_id,
      projectId: candidate.project_id,
      artifactKey: candidate.benchmark_key,
      promotedAt: '2026-07-22T00:00:00.000Z',
    })

    expect(result.status).toBe('stable_promoted')
    expect(mocks.promoteCanary).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'publication-1',
      queryExec: expect.any(Function),
    }))
    expect(mocks.persistCurrentCauseSegments).toHaveBeenCalledWith({
      benchmarkId: candidate.id,
      companyId: candidate.company_id,
      projectId: candidate.project_id,
      benchmarkKey: candidate.benchmark_key,
      generatedAt: candidate.generated_at,
      sourceWindowStart: candidate.source_window_start,
      sourceAsOf: candidate.source_as_of,
      calendarRef: candidate.metadata.calendar_ref,
      calendarVersion: candidate.metadata.calendar_version,
      frozenEvidence: {
        evidenceContractHash: candidate.metadata.evidence_contract_hash,
        sampleMutationLineage: [frozenSample],
        structuredCauseAttributionLineage: [frozenAttribution],
      },
    }, expect.anything())
    expect(mocks.query.mock.calls.map(([sql]) => String(sql).trim().toLowerCase()).at(-1)).toBe('commit')
  })

  it('rolls back stable promotion when exact benchmark activation fails', async () => {
    mocks.promoteCanary.mockResolvedValue({ status: 'stable_promoted', previousPublicationKey: null, reasons: [] })
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('from public.duration_learning_runtime_publications')) {
        return {
          rows: [{
            publication_key: 'publication-1',
            asset_key: 'base_duration_benchmark',
            artifact_key: 'SW-1:process:all',
            scope_level: 'project',
            company_id: 'company-1',
            project_id: '33333333-3333-4333-8333-333333333333',
            publication_stage: 'canary',
            monitoring_status: 'passed',
            runtime_payload: {
              benchmarkId: '11111111-1111-4111-8111-111111111111',
              p50Days: 8,
              p75Days: 10,
              p80Days: 11,
              meanDays: 8.5,
              variance: 2.25,
              coefficientOfVariation: 0.176471,
              sampleCount: 20,
              confidenceLevel: 'high',
              confidenceScore: 88,
              durationDayBasis: 'construction_production_day',
              generatedAt: '2026-07-21T00:00:00.000Z',
              sourceWindowStart: '2026-04-22T00:00:00.000Z',
              sourceAsOf: '2026-07-20T00:00:00.000Z',
              calendarRef: 'cn-work-calendar',
              calendarVersion: '2026.07',
            },
          }],
          rowCount: 1,
        }
      }
      if (normalized.includes('from public.projects')) return { rows: [{ company_id: 'company-1' }], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await expect(promoteDurationBenchmarkRuntimeCanaryAtomically({
      publicationKey: 'publication-1',
      benchmarkId: '11111111-1111-4111-8111-111111111111',
      companyId: 'company-1',
      projectId: '33333333-3333-4333-8333-333333333333',
      artifactKey: 'SW-1:process:all',
    })).rejects.toThrow('duration benchmark candidate not found')

    expect(mocks.query.mock.calls.map(([sql]) => String(sql).trim().toLowerCase())).toContain('rollback')
  })

  it('rolls back benchmark retirement when the replacement insert fails', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes('update public.duration_benchmarks')) return { rows: [{ id: 'benchmark-old' }], rowCount: 1 }
      if (normalized.includes('insert into public.duration_benchmarks')) throw new Error('benchmark insert failed')
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    await expect(replaceDurationBenchmarkAtomically({
      company_id: 'company-1',
      benchmark_key: 'work-1',
      benchmark_version: 'v1:2026-07-14',
      is_current: true,
      is_active: true,
    })).rejects.toThrow('benchmark insert failed')

    expect(mocks.query.mock.calls.map(([statement]) => String(statement).trim().toLowerCase())).toContain('rollback')
    expect(mocks.query.mock.calls.map(([statement]) => String(statement).trim().toLowerCase())).not.toContain('commit')
  })

  it('supersedes and inserts a published project calibration atomically', async () => {
    const row = await replaceProjectProductivityCalibrationAtomically({
      company_id: 'company-1',
      project_id: 'project-1',
      calibration_key: 'productivity_compensation',
      status: 'published',
      action_policy: 'auto_publish',
      window_end_date: '2026-07-14',
      parameter_payload: { compensationCap: 0.08 },
      evidence_summary: { maeBefore: 2, maeAfter: 1 },
    })

    expect(row).toEqual(expect.objectContaining({ id: 'calibration-new', status: 'published' }))
    const sql = mocks.query.mock.calls.map(([statement]) => String(statement).replace(/\s+/g, ' ').trim().toLowerCase())
    expect(sql[0]).toBe('begin')
    expect(sql).toEqual(expect.arrayContaining([
      expect.stringContaining('for update'),
      expect.stringContaining("status = 'superseded'"),
      expect.stringContaining('insert into public.project_productivity_compensation_calibrations'),
      expect.stringContaining('superseded_by'),
    ]))
    expect(sql.at(-1)).toBe('commit')
  })

  it('rolls back the current calibration and restores its directly superseded predecessor', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
      if (normalized.includes("status = 'published'") && normalized.includes('for update')) {
        return { rows: [{ id: 'calibration-current' }], rowCount: 1 }
      }
      if (normalized.includes('superseded_by = $1') && normalized.includes('for update')) {
        return { rows: [{ id: 'calibration-previous' }], rowCount: 1 }
      }
      if (normalized.includes("status = 'rolled_back'")) return { rows: [{ id: 'calibration-current' }], rowCount: 1 }
      if (normalized.includes("status = 'published'")) return { rows: [{ id: 'calibration-previous' }], rowCount: 1 }
      throw new Error(`Unexpected SQL: ${normalized}`)
    })

    const result = await rollbackProjectProductivityCalibrationAtomically({
      companyId: 'company-1',
      projectId: 'project-1',
      reason: 'monitoring_regression',
    })

    expect(result).toEqual({
      id: 'calibration-current',
      status: 'rolled_back',
      restoredCalibrationId: 'calibration-previous',
    })
    expect(mocks.query.mock.calls.map(([statement]) => String(statement).trim().toLowerCase()).at(-1)).toBe('commit')
  })
})
