import { describe, expect, it, vi } from 'vitest'

import { persistCurrentCauseSegments } from '../services/durationBenchmarkCauseSegmentService.js'
import { recordUserConfirmedStructuredCauseAttribution } from '../services/structuredCauseAttributionService.js'
import { readTaskStructuredCauseAuthority } from '../services/taskStructuredCauseAuthorityService.js'

const scope = {
  companyId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  taskId: '33333333-3333-4333-8333-333333333333',
}

describe('structured cause duration eligibility contract', () => {
  it('supersedes a task candidate, rebuilds after commit, and includes the exact confirmed snapshot in a segment', async () => {
    const rows: Array<Record<string, any>> = [{
      id: '44444444-4444-4444-8444-444444444444',
      company_id: scope.companyId,
      project_id: scope.projectId,
      subject_type: 'task',
      subject_id: scope.taskId,
      event_type: 'completion',
      status: 'candidate',
      cause_code: 'other',
      cause_role: 'primary',
      taxonomy_version: 'v1.0.0',
      confirmation_source: 'candidate',
      confirmed_at: null,
      dedupe_key: 'stale-candidate',
    }]
    const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: scope.companyId }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: scope.taskId }], rowCount: 1 }
      if (sql.includes("SET status = 'superseded'")) {
        const selectedDedupe = String(params[3] ?? '')
        for (const row of rows) {
          if (row.subject_id === scope.taskId && row.cause_role === 'primary'
            && ['delay', 'completion'].includes(row.event_type)
            && ['candidate', 'confirmed'].includes(row.status)
            && row.dedupe_key !== selectedDedupe) row.status = 'superseded'
        }
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        const dedupeKey = String(params[15])
        let confirmed = rows.find((row) => row.dedupe_key === dedupeKey)
        if (!confirmed) {
          confirmed = {
            id: '55555555-5555-4555-8555-555555555555',
            company_id: scope.companyId,
            project_id: scope.projectId,
            subject_type: 'task',
            subject_id: scope.taskId,
            event_type: 'delay',
            status: 'confirmed',
            cause_code: 'material_shortage',
            cause_role: 'primary',
            taxonomy_version: 'v1.0.0',
            confirmation_source: 'user_confirmed',
            confirmed_at: '2026-07-20T00:00:00.000Z',
            dedupe_key: dedupeKey,
          }
          rows.push(confirmed)
        }
        return { rows: [confirmed], rowCount: 1 }
      }
      if (sql.includes('FROM public.structured_cause_attributions')) {
        return { rows: rows.filter((row) => ['candidate', 'confirmed'].includes(row.status)), rowCount: rows.length }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    let rebuiltSample: Record<string, any> | null = null
    const pendingEffects: Array<() => Promise<void>> = []
    const rebuild = vi.fn(async () => {
      const authority = await readTaskStructuredCauseAuthority(scope, { queryExec })
      rebuiltSample = {
        authority,
        snapshot: authority.snapshot,
        includedInBenchmark: authority.causeBenchmarkEligible,
      }
    })

    await recordUserConfirmedStructuredCauseAttribution({
      ...scope,
      subjectType: 'task',
      subjectId: scope.taskId,
      eventType: 'delay',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      rawText: 'Material delivery confirmed by the project editor.',
      actorId: 'user-1',
    }, {
      queryExec,
      withTransaction: async (work) => {
        const result = await work()
        for (const effect of pendingEffects.splice(0)) await effect()
        return result
      },
      registerPostCommitEffect: async (_label, effect) => { pendingEffects.push(effect) },
      rebuildTaskDurationExperienceSample: rebuild,
    })

    expect(rows[0].status).toBe('superseded')
    expect(rebuild).toHaveBeenCalledOnce()
    expect(rebuiltSample).toMatchObject({
      includedInBenchmark: true,
      authority: { resolution: { availability: 'available', causeCode: 'material_shortage' } },
    })

    const confirmed = rows.find((row) => row.status === 'confirmed') as Record<string, any>
    const segmentClient = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM public.duration_experience_samples sample')) {
          return { rows: [{
            sample_id: 'sample-rebuilt-1',
            attribution_id: confirmed.id,
            cause_code: confirmed.cause_code,
            taxonomy_version: confirmed.taxonomy_version,
            actual_duration_production_days: 6,
            sample_company_id: scope.companyId,
            sample_project_id: scope.projectId,
            attribution_company_id: scope.companyId,
            attribution_project_id: scope.projectId,
            attribution_status: confirmed.status,
            attribution_event_type: confirmed.event_type,
            cause_role: confirmed.cause_role,
            confirmed_at: confirmed.confirmed_at,
            source_type: 'task_completion',
            snapshot_attribution_id: confirmed.id,
            snapshot_cause_code: confirmed.cause_code,
            snapshot_taxonomy_version: confirmed.taxonomy_version,
            snapshot_event_type: confirmed.event_type,
            snapshot_confirmed_at: confirmed.confirmed_at,
            snapshot_primary_count: 1,
            included_in_benchmark: true,
            sample_strength: 'strong',
            duration_day_basis: 'construction_production_day',
            calendar_ref: 'cn-work-calendar',
            calendar_version: '2026.07',
          }], rowCount: 1 }
        }
        if (sql.includes('UPDATE public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
        if (sql.includes('INSERT INTO public.duration_benchmark_cause_segments')) {
          return { rows: [{
            id: 'segment-material-1', benchmark_id: params[0], company_id: params[1], project_id: params[2],
            cause_code: params[3], taxonomy_version: params[4], sample_count: params[5], p50_days: params[6],
            p75_days: params[7], p80_days: params[8], mean_days: params[9], variance: params[10],
            generated_at: params[11], source_window_start: params[12], source_as_of: params[13],
            duration_day_basis: 'construction_production_day', calendar_ref: params[14], calendar_version: params[15],
            lineage: JSON.parse(String(params[16])),
          }], rowCount: 1 }
        }
        throw new Error(`Unexpected segment SQL: ${sql}`)
      }),
    }
    const segments = await persistCurrentCauseSegments({
      benchmarkId: '66666666-6666-4666-8666-666666666666',
      companyId: scope.companyId,
      projectId: scope.projectId,
      benchmarkKey: 'SW-1:process:all',
      generatedAt: '2026-07-21T00:00:00.000Z',
      sourceWindowStart: '2026-07-01T00:00:00.000Z',
      sourceAsOf: '2026-07-20T23:59:59.000Z',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    }, segmentClient as never)

    expect(segments).toEqual([
      expect.objectContaining({ causeCode: 'material_shortage', sampleCount: 1 }),
    ])
  })
})
