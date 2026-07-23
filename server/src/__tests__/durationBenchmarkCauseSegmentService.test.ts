import { describe, expect, it, vi } from 'vitest'

import {
  loadCurrentCauseSegment,
  persistCurrentCauseSegments,
} from '../services/durationBenchmarkCauseSegmentService.js'
import { STRUCTURED_CAUSE_TAXONOMY_VERSION } from '../domain/structuredCauseTaxonomy.js'

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

const frozenSampleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const frozenTaskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const frozenAttributionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const frozenAttribution = {
  attributionId: frozenAttributionId,
  causeCode: 'material_shortage',
  taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
  eventType: 'completion',
  causeRole: 'primary',
  confirmedAt: '2026-07-19T00:00:00.000Z',
} as const
const frozenSample = {
  sampleId: frozenSampleId,
  taskId: frozenTaskId,
  completedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T01:00:00.000Z',
  updatedAt: '2026-07-19T01:00:00.000Z',
  evidenceFingerprint: 'fingerprint-frozen-1',
  sourceLineage: { schemaVersion: 'duration-experience-sample/v1', completionId: 'completion-1' },
  structuredCauseAttributions: [frozenAttribution],
} as const
const frozenEvidence = {
  evidenceContractHash: 'a'.repeat(64),
  sampleMutationLineage: [frozenSample],
  structuredCauseAttributionLineage: [frozenAttribution],
}
const frozenInput = { ...input, frozenEvidence }

function confirmedSample(overrides: Record<string, unknown> = {}) {
  const sampleId = String(overrides.sample_id ?? 'sample-default')
  const attributionId = String(overrides.attribution_id ?? `attribution-${sampleId}`)
  const causeCode = String(overrides.cause_code ?? 'material_shortage')
  const taxonomyVersion = String(overrides.taxonomy_version ?? STRUCTURED_CAUSE_TAXONOMY_VERSION)
  const eventType = String(overrides.attribution_event_type ?? 'completion')
  const confirmedAt = String(overrides.confirmed_at ?? '2026-07-19T00:00:00.000Z')
  return {
    sample_id: sampleId,
    sample_task_id: frozenTaskId,
    sample_completed_at: '2026-07-18T00:00:00.000Z',
    sample_created_at: '2026-07-18T01:00:00.000Z',
    sample_updated_at: '2026-07-19T01:00:00.000Z',
    sample_evidence_fingerprint: 'fingerprint-frozen-1',
    sample_source_lineage: { schemaVersion: 'duration-experience-sample/v1', completionId: 'completion-1' },
    attribution_id: attributionId,
    cause_code: causeCode,
    taxonomy_version: taxonomyVersion,
    actual_duration_production_days: 6,
    sample_company_id: 'company-1',
    sample_project_id: 'project-1',
    attribution_company_id: 'company-1',
    attribution_project_id: 'project-1',
    attribution_status: 'confirmed',
    attribution_event_type: eventType,
    cause_role: 'primary',
    attribution_subject_type: 'task',
    attribution_subject_id: frozenTaskId,
    confirmed_at: confirmedAt,
    source_type: 'task_completion',
    snapshot_attribution_id: attributionId,
    snapshot_cause_code: causeCode,
    snapshot_taxonomy_version: taxonomyVersion,
    snapshot_event_type: eventType,
    snapshot_cause_role: 'primary',
    snapshot_confirmed_at: confirmedAt,
    snapshot_primary_count: 1,
    included_in_benchmark: true,
    duration_day_basis: 'construction_production_day',
    calendar_ref: 'cn-work-calendar',
    calendar_version: '2026.07',
    ...overrides,
  }
}

function frozenCurrentSample(overrides: Record<string, unknown> = {}) {
  return confirmedSample({
    sample_id: frozenSampleId,
    sample_task_id: frozenTaskId,
    attribution_id: frozenAttributionId,
    cause_code: frozenAttribution.causeCode,
    taxonomy_version: frozenAttribution.taxonomyVersion,
    attribution_event_type: frozenAttribution.eventType,
    cause_role: frozenAttribution.causeRole,
    confirmed_at: frozenAttribution.confirmedAt,
    snapshot_attribution_id: frozenAttributionId,
    snapshot_cause_code: frozenAttribution.causeCode,
    snapshot_taxonomy_version: frozenAttribution.taxonomyVersion,
    snapshot_event_type: frozenAttribution.eventType,
    snapshot_cause_role: frozenAttribution.causeRole,
    snapshot_confirmed_at: frozenAttribution.confirmedAt,
    ...overrides,
  })
}

function persistedSegmentRow(params: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: `segment-${String(params[3])}`,
    benchmark_id: params[0],
    company_id: params[1],
    project_id: params[2],
    cause_code: params[3],
    taxonomy_version: params[4],
    sample_count: params[5],
    p50_days: params[6],
    p75_days: params[7],
    p80_days: params[8],
    mean_days: params[9],
    variance: params[10],
    generated_at: params[11],
    source_window_start: params[12],
    source_as_of: params[13],
    duration_day_basis: 'construction_production_day',
    calendar_ref: params[14],
    calendar_version: params[15],
    lineage: JSON.parse(String(params[16])),
    ...overrides,
  }
}

describe('durationBenchmarkCauseSegmentService', () => {
  it('persists only confirmed, included, scope- and calendar-compatible cause samples', async () => {
    const executedSql: string[] = []
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        executedSql.push(sql)
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'material-1', actual_duration_production_days: 4 }),
              confirmedSample({ sample_id: 'material-2', actual_duration_production_days: 6 }),
              confirmedSample({ sample_id: 'material-2', actual_duration_production_days: 6 }),
              confirmedSample({ sample_id: 'material-3', actual_duration_production_days: 8 }),
              confirmedSample({ sample_id: 'quality-1', cause_code: 'quality_rework', actual_duration_production_days: 5 }),
              confirmedSample({ sample_id: 'quality-2', cause_code: 'quality_rework', actual_duration_production_days: 7 }),
              confirmedSample({ sample_id: 'candidate', attribution_status: 'candidate' }),
              confirmedSample({ sample_id: 'rejected', attribution_status: 'rejected' }),
              confirmedSample({ sample_id: 'weak', included_in_benchmark: false }),
              confirmedSample({ sample_id: 'wrong-tenant', sample_company_id: 'company-2' }),
              confirmedSample({ sample_id: 'wrong-calendar', calendar_version: '2026.06' }),
              confirmedSample({ sample_id: 'wrong-source', source_type: 'manual_import' }),
              confirmedSample({ sample_id: 'delay-event', attribution_event_type: 'delay' }),
              confirmedSample({ sample_id: 'wrong-event', attribution_event_type: 'closure' }),
              confirmedSample({ sample_id: 'wrong-role', cause_role: 'contributing' }),
              confirmedSample({ sample_id: 'post-window', confirmed_at: '2026-07-21T00:00:00.000Z' }),
              confirmedSample({ sample_id: 'snapshot-mismatch', snapshot_attribution_id: 'other-attribution' }),
              confirmedSample({ sample_id: 'snapshot-event-mismatch', snapshot_event_type: 'completion', attribution_event_type: 'delay' }),
              confirmedSample({ sample_id: 'snapshot-time-mismatch', snapshot_confirmed_at: '2026-07-18T00:00:00.000Z' }),
              confirmedSample({ sample_id: 'multiple-primary', snapshot_primary_count: 2 }),
            ],
          }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return { rows: [persistedSegmentRow(params)] }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never)).resolves.toEqual([
      expect.objectContaining({ causeCode: 'material_shortage', sampleCount: 4 }),
      expect.objectContaining({ causeCode: 'quality_rework', sampleCount: 2 }),
    ])

    expect(executedSql.join('\n')).toContain("attribution.status = 'confirmed'")
    expect(executedSql.join('\n')).toContain('sample.included_in_benchmark = TRUE')
    expect(executedSql.join('\n')).toContain('sample.project_id IS NOT DISTINCT FROM $2::uuid')
    expect(executedSql.join('\n')).toContain('attribution.company_id IS NOT DISTINCT FROM sample.company_id')
    expect(executedSql.join('\n')).toContain("sample.metadata -> 'structured_cause_snapshot'")
    expect(executedSql.join('\n')).toContain('jsonb_array_elements')
    expect(executedSql.join('\n')).toContain("confirmed_cause ->> 'attribution_id' = attribution.id::text")
    expect(executedSql.join('\n')).toContain("confirmed_cause ->> 'event_type' = attribution.event_type")
    expect(executedSql.join('\n')).toContain("attribution.event_type IN ('delay', 'completion')")
    expect(executedSql.join('\n')).toContain("sample.source_type = 'task_completion'")
    expect(executedSql.join('\n')).toContain("attribution.event_type IN ('delay', 'completion')")
    expect(executedSql.join('\n')).toContain("attribution.cause_role = 'primary'")
    expect(executedSql.join('\n')).toContain('attribution.confirmed_at <= $4::timestamptz')
    expect(executedSql.join('\n')).toContain("sample.duration_day_basis = 'construction_production_day'")
    expect(executedSql.join('\n')).toContain('$8::timestamptz IS NULL OR sample.completed_at >= $8::timestamptz')
    expect(executedSql.join('\n')).toContain('company_id IS NOT DISTINCT FROM $2::uuid')
    expect(executedSql.join('\n')).toContain('project_id IS NOT DISTINCT FROM $3::uuid')
    expect(executedSql.findIndex((sql) => sql.includes('UPDATE public.duration_benchmark_cause_segments')))
      .toBeLessThan(executedSql.findIndex((sql) => sql.includes('INSERT INTO public.duration_benchmark_cause_segments')))
  })

  it('accepts PostgreSQL REAL roundtrips for large mean and variance values', async () => {
    let attemptedMean: number | null = null
    let attemptedVariance: number | null = null
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'large-real-1', actual_duration_production_days: 1 }),
              confirmedSample({ sample_id: 'large-real-2', actual_duration_production_days: 1_000_000 }),
              confirmedSample({ sample_id: 'large-real-3', actual_duration_production_days: 2_000_000 }),
            ],
          }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          attemptedMean = Number(params[9])
          attemptedVariance = Number(params[10])
          return {
            rows: [persistedSegmentRow(params, {
              mean_days: Math.fround(attemptedMean),
              variance: Math.fround(attemptedVariance),
            })],
          }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    const persisted = await persistCurrentCauseSegments(input, client as never)

    expect(attemptedMean).toBeGreaterThan(1_000_000)
    expect(attemptedVariance).toBeGreaterThan(100_000_000_000)
    expect(persisted[0]).toEqual(expect.objectContaining({
      meanDays: Math.fround(attemptedMean!),
      variance: Math.fround(attemptedVariance!),
    }))
  })

  it('rejects a materially altered PostgreSQL REAL readback', async () => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'tampered-real-1', actual_duration_production_days: 1 }),
              confirmedSample({ sample_id: 'tampered-real-2', actual_duration_production_days: 1_000_000 }),
              confirmedSample({ sample_id: 'tampered-real-3', actual_duration_production_days: 2_000_000 }),
            ],
          }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return {
            rows: [persistedSegmentRow(params, {
              mean_days: Math.fround(Number(params[9]) * 1.01),
              variance: Math.fround(Number(params[10])),
            })],
          }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('cause segment INSERT readback mismatch')
  })

  it('fails closed when one sample resolves to multiple canonical attribution identities', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'ambiguous-1', attribution_id: 'attribution-a', cause_code: 'material_shortage' }),
              confirmedSample({ sample_id: 'ambiguous-1', attribution_id: 'attribution-b', cause_code: 'quality_rework' }),
            ],
          }
        }
        throw new Error(`Unexpected SQL after ambiguous sample: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('multiple canonical attribution identities')
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.duration_benchmark_cause_segments')))
      .toBe(false)
  })

  it('fails closed when accepted causes use different taxonomy versions across the benchmark', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return {
            rows: [
              confirmedSample({ sample_id: 'taxonomy-1', cause_code: 'material_shortage', taxonomy_version: 'cause/v1' }),
              confirmedSample({ sample_id: 'taxonomy-2', cause_code: 'quality_rework', taxonomy_version: 'cause/v2' }),
            ],
          }
        }
        throw new Error(`Unexpected SQL after mixed taxonomy: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('Mixed taxonomy versions for benchmark')
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.duration_benchmark_cause_segments')))
      .toBe(false)
  })

  it.each([
    ['empty', 0],
    ['multiple', 2],
  ])('rejects %s cause-segment INSERT readback', async (_label, readbackCount) => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return { rows: [confirmedSample({ sample_id: 'readback-count-1' })] }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return { rows: Array.from({ length: readbackCount }, () => persistedSegmentRow(params)) }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('cause segment INSERT must return exactly one row')
  })

  it('rejects a cause-segment INSERT readback with mismatched scope or provenance', async () => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return { rows: [confirmedSample({ sample_id: 'malformed-readback-1' })] }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return {
            rows: [persistedSegmentRow(params, {
              project_id: 'project-2',
              source_as_of: '2026-07-22T00:00:00.000Z',
            })],
          }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('cause segment INSERT readback mismatch')
  })

  it('rejects a cause-segment INSERT readback with mismatched sample lineage', async () => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return { rows: [confirmedSample({ sample_id: 'lineage-readback-1' })] }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return { rows: [persistedSegmentRow(params, { lineage: ['other-sample'] })] }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(input, client as never))
      .rejects.toThrow('cause segment INSERT readback mismatch')
  })

  it('persists a promotion segment only from the exact frozen evidence contract', async () => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return { rows: [frozenCurrentSample()] }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return { rows: [persistedSegmentRow(params)] }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments(frozenInput, client as never)).resolves.toEqual([
      expect.objectContaining({ causeCode: 'material_shortage', sampleCount: 1 }),
    ])

    const sourceCall = client.query.mock.calls.find(([sql]) => String(sql).includes('FROM public.duration_experience_samples sample'))
    expect(sourceCall?.[0]).toContain('sample.id = ANY')
    expect(sourceCall?.[1]).toContainEqual([frozenSampleId])
    const insertCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.duration_benchmark_cause_segments'))
    expect(JSON.parse(String(insertCall?.[1]?.[16]))).toEqual({
      schemaVersion: 'duration-benchmark-cause-segment-lineage/v2',
      evidenceContractHash: frozenEvidence.evidenceContractHash,
      samples: [{
        sampleId: frozenSampleId,
        taskId: frozenTaskId,
        evidenceFingerprint: frozenSample.evidenceFingerprint,
        completedAt: frozenSample.completedAt,
        createdAt: frozenSample.createdAt,
        updatedAt: frozenSample.updatedAt,
        attribution: frozenAttribution,
      }],
    })
  })

  async function expectFrozenMismatch(
    rows: Record<string, unknown>[],
    evidence: Record<string, unknown> = frozenEvidence,
  ) {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) return { rows }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [] }
        throw new Error(`Unexpected SQL: ${sql}`)
      }),
    }

    await expect(persistCurrentCauseSegments({ ...input, frozenEvidence: evidence }, client as never)).rejects.toThrow()
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE public.duration_benchmark_cause_segments')))
      .toBe(false)
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO public.duration_benchmark_cause_segments')))
      .toBe(false)
  }

  it('rejects missing, extra, and duplicate sample IDs before replacing current segments', async () => {
    await expectFrozenMismatch([])
    await expectFrozenMismatch([
      frozenCurrentSample(),
      frozenCurrentSample({
        sample_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        attribution_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        snapshot_attribution_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      }),
    ])
    await expectFrozenMismatch([frozenCurrentSample(), frozenCurrentSample()])
  })

  it.each([
    ['fingerprint', { sample_evidence_fingerprint: 'fingerprint-mutated' }],
    ['updated timestamp', { sample_updated_at: '2026-07-20T01:00:00.000Z' }],
    ['completion timestamp', { sample_completed_at: '2026-07-17T00:00:00.000Z' }],
  ])('rejects a changed frozen sample %s before replacing current segments', async (_label, overrides) => {
    await expectFrozenMismatch([frozenCurrentSample(overrides)])
  })

  it.each([
    ['identity', { attribution_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', snapshot_attribution_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }],
    ['code', { cause_code: 'quality_rework', snapshot_cause_code: 'quality_rework' }],
    ['version', { taxonomy_version: 'v2.0.0', snapshot_taxonomy_version: 'v2.0.0' }],
    ['event', { attribution_event_type: 'delay', snapshot_event_type: 'delay' }],
    ['role', { cause_role: 'contributing', snapshot_cause_role: 'contributing', snapshot_primary_count: 0 }],
    ['confirmed-at', { confirmed_at: '2026-07-19T02:00:00.000Z', snapshot_confirmed_at: '2026-07-19T02:00:00.000Z' }],
  ])('rejects a changed frozen attribution %s before replacing current segments', async (_label, overrides) => {
    await expectFrozenMismatch([frozenCurrentSample(overrides)])
  })

  it('rejects duplicate or malformed frozen candidate lineage before source reads', async () => {
    await expectFrozenMismatch([frozenCurrentSample()], {
      ...frozenEvidence,
      sampleMutationLineage: [frozenSample, frozenSample],
    })
    const { causeRole: _causeRole, ...malformedAttribution } = frozenAttribution
    await expectFrozenMismatch([frozenCurrentSample()], {
      ...frozenEvidence,
      sampleMutationLineage: [{ ...frozenSample, structuredCauseAttributions: [malformedAttribution] }],
      structuredCauseAttributionLineage: [malformedAttribution],
    })
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
        taxonomy_version: STRUCTURED_CAUSE_TAXONOMY_VERSION,
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

  it('distinguishes a clean no-row lookup from malformed persisted segment identity', async () => {
    const scope = {
      benchmarkId: 'benchmark-1',
      causeCode: 'material_shortage' as const,
      companyId: 'company-1',
      projectId: 'project-1',
    }
    await expect(loadCurrentCauseSegment(scope, vi.fn(async () => []) as never)).resolves.toBeNull()
    await expect(loadCurrentCauseSegment(scope, vi.fn(async () => [{
      id: 'segment-1',
      benchmark_id: 'different-benchmark',
      company_id: 'company-1',
      project_id: 'project-1',
      cause_code: 'material_shortage',
      taxonomy_version: STRUCTURED_CAUSE_TAXONOMY_VERSION,
      sample_count: 3,
      p50_days: 6,
      generated_at: '2026-07-21T00:00:00.000Z',
      source_as_of: '2026-07-20T00:00:00.000Z',
      duration_day_basis: 'construction_production_day',
      calendar_ref: 'cn-work-calendar',
      calendar_version: '2026.07',
    }]) as never)).rejects.toThrow('cause segment readback mismatch')
  })
})
