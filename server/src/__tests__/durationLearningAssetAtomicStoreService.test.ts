import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
  persistCurrentCauseSegments: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../services/durationBenchmarkCauseSegmentService.js', () => ({
  persistCurrentCauseSegments: mocks.persistCurrentCauseSegments,
}))

const {
  replaceDurationBenchmarkAtomically,
  stageDurationBenchmarkCandidateAtomically,
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
      if (normalized.includes('select id from public.duration_benchmarks')) return { rows: [], rowCount: 0 }
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
