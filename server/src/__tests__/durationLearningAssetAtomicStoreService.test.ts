import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

const {
  replaceDurationBenchmarkAtomically,
  replaceProjectProductivityCalibrationAtomically,
  rollbackProjectProductivityCalibrationAtomically,
} = await import('../services/durationLearningAssetAtomicStoreService.js')

describe('durationLearningAssetAtomicStoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClient.mockResolvedValue({ query: mocks.query, release: mocks.release })
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
    expect(sql.at(-1)).toBe('commit')
    expect(mocks.release).toHaveBeenCalledOnce()
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
