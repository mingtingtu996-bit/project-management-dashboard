import { describe, expect, it, vi } from 'vitest'

import {
  loadCurrentCauseSegment,
  persistCurrentCauseSegments,
} from '../services/durationBenchmarkCauseSegmentService.js'

const input = {
  benchmarkId: 'benchmark-1',
  companyId: 'company-1',
  projectId: 'project-1',
  benchmarkKey: 'rebar:process:all',
  generatedAt: '2026-07-21T00:00:00.000Z',
  sourceWindowStart: '2026-07-01T00:00:00.000Z',
  sourceAsOf: '2026-07-20T00:00:00.000Z',
  calendarRef: 'cn-work-calendar',
  calendarVersion: '2026.07',
} as const

function confirmedSample(overrides: Record<string, unknown> = {}) {
  return {
    sample_id: `sample-${Math.random()}`,
    cause_code: 'material_shortage',
    taxonomy_version: 'structured-cause-taxonomy/v1',
    actual_duration_production_days: 6,
    sample_company_id: 'company-1',
    sample_project_id: 'project-1',
    attribution_company_id: 'company-1',
    attribution_project_id: 'project-1',
    attribution_status: 'confirmed',
    included_in_benchmark: true,
    duration_day_basis: 'construction_production_day',
    calendar_ref: 'cn-work-calendar',
    calendar_version: '2026.07',
    ...overrides,
  }
}

describe('durationBenchmarkCauseSegmentService', () => {
  it('persists only confirmed, included, scope- and calendar-compatible cause samples', async () => {
    const executedSql: string[] = []
    const client = {
      query: vi.fn(async (sql: string) => {
        executedSql.push(sql)
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'material-1', actual_duration_production_days: 4 }),
              confirmedSample({ sample_id: 'material-2', actual_duration_production_days: 6 }),
              confirmedSample({ sample_id: 'material-2', attribution_id: 'duplicate-attribution', actual_duration_production_days: 6 }),
              confirmedSample({ sample_id: 'material-3', actual_duration_production_days: 8 }),
              confirmedSample({ sample_id: 'quality-1', cause_code: 'quality_rework', actual_duration_production_days: 5 }),
              confirmedSample({ sample_id: 'quality-2', cause_code: 'quality_rework', actual_duration_production_days: 7 }),
              confirmedSample({ sample_id: 'candidate', attribution_status: 'candidate' }),
              confirmedSample({ sample_id: 'rejected', attribution_status: 'rejected' }),
              confirmedSample({ sample_id: 'weak', included_in_benchmark: false }),
              confirmedSample({ sample_id: 'wrong-tenant', sample_company_id: 'company-2' }),
              confirmedSample({ sample_id: 'wrong-calendar', calendar_version: '2026.06' }),
            ],
          }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) return { rows: [] }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never)).resolves.toEqual([
      expect.objectContaining({ causeCode: 'material_shortage', sampleCount: 3 }),
      expect.objectContaining({ causeCode: 'quality_rework', sampleCount: 2 }),
    ])

    expect(executedSql.join('\n')).toContain("attribution.status = 'confirmed'")
    expect(executedSql.join('\n')).toContain('sample.included_in_benchmark = TRUE')
    expect(executedSql.join('\n')).toContain('sample.project_id IS NOT DISTINCT FROM $2::uuid')
    expect(executedSql.join('\n')).toContain('attribution.company_id IS NOT DISTINCT FROM sample.company_id')
    expect(executedSql.join('\n')).toContain("sample.duration_day_basis = 'construction_production_day'")
    expect(executedSql.join('\n')).toContain('$8::timestamptz IS NULL OR sample.completed_at >= $8::timestamptz')
    expect(executedSql.join('\n')).toContain('company_id IS NOT DISTINCT FROM $2::uuid')
    expect(executedSql.join('\n')).toContain('project_id IS NOT DISTINCT FROM $3::uuid')
    expect(executedSql.findIndex((sql) => sql.includes('UPDATE public.duration_benchmark_cause_segments')))
      .toBeLessThan(executedSql.findIndex((sql) => sql.includes('INSERT INTO public.duration_benchmark_cause_segments')))
  })

  it('loads an exact current segment only for its null-safe benchmark scope', async () => {
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> => {
      expect(sql).toContain('company_id IS NOT DISTINCT FROM $3::uuid')
      expect(sql).toContain('project_id IS NOT DISTINCT FROM $4::uuid')
      expect(params).toEqual(['benchmark-1', 'material_shortage', 'company-1', 'project-1'])
      return [{
        id: 'segment-1',
        benchmark_id: 'benchmark-1',
        company_id: 'company-1',
        project_id: 'project-1',
        cause_code: 'material_shortage',
        taxonomy_version: 'structured-cause-taxonomy/v1',
        sample_count: 3,
        p50_days: 6,
        p75_days: 7,
        p80_days: 8,
        generated_at: '2026-07-21T00:00:00.000Z',
        source_window_start: '2026-07-01T00:00:00.000Z',
        source_as_of: '2026-07-20T00:00:00.000Z',
        duration_day_basis: 'construction_production_day',
        calendar_ref: 'cn-work-calendar',
        calendar_version: '2026.07',
      }] as T[]
    })

    await expect(loadCurrentCauseSegment({
      benchmarkId: 'benchmark-1',
      causeCode: 'material_shortage',
      companyId: 'company-1',
      projectId: 'project-1',
    }, queryExec as never)).resolves.toEqual(expect.objectContaining({
      causeCode: 'material_shortage',
      sourceAsOf: '2026-07-20T00:00:00.000Z',
      projectId: 'project-1',
    }))
  })
})
