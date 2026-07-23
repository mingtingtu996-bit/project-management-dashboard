import { describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: databaseMocks.getClient,
  query: vi.fn(async () => ({ rows: [] })),
}))

import { promoteDurationBenchmarkRuntimeCanaryAtomically } from '../services/durationLearningAssetAtomicStoreService.js'
import { collectDurationLearningRuntimeCandidateProposals } from '../services/durationLearningRuntimeLifecycleService.js'
import {
  persistDurationLearningRuntimePublication,
  resolveDurationLearningRuntimePublication,
} from '../services/durationLearningRuntimePublicationService.js'
import {
  buildDurationBenchmarkRowFromRuntimePublication,
  selectCauseAwareBenchmarkCandidates,
  type DurationBenchmarkCandidate,
} from '../services/durationSuggestionService.js'
import {
  buildDurationBenchmarkCandidatePersistenceRow,
  buildDurationBenchmarkCandidates,
  type DurationExperienceSampleRow,
} from '../services/templateDurationGovernanceService.js'

const companyId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const benchmarkId = '33333333-3333-4333-8333-333333333333'
const publicationKey = 'duration-learning:benchmark:production-chain'

describe('duration benchmark production chain', () => {
  it('carries exact producer identity through publication and activation into cause-aware suggestion selection', async () => {
    const samples = Array.from({ length: 20 }, (_, index): DurationExperienceSampleRow => ({
      id: `sample-${index + 1}`,
      company_id: companyId,
      project_id: projectId,
      task_id: `task-${index + 1}`,
      completed_at: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      standard_work_code: 'SW-CHAIN',
      wbs_node_type: 'process',
      actual_duration_production_days: 6 + (index % 3),
      duration_day_basis: 'construction_production_day',
      metadata: {
        construction_calendar_ref: 'cn-work-calendar',
        construction_calendar_version: '2026.07',
      },
    }))
    const [candidate] = buildDurationBenchmarkCandidates(samples)
    const persistenceRow = {
      ...buildDurationBenchmarkCandidatePersistenceRow(candidate, '2026-07-21T00:00:00.000Z'),
      id: benchmarkId,
      collector_group_key: candidate.benchmarkKey,
      source_company_id: companyId,
      project_company_id: companyId,
      business_type: 'general_civil',
    }
    const lifecycleQuery = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      const marker = sql.match(/duration-learning-collector:(discover|history|scope-buckets|scope-batches):([^*\s]+)/)
      if (!marker || marker[2] !== 'benchmark:base_duration_benchmark') return [] as T[]
      if (marker[1] === 'discover') return [{ collector_group_key: candidate.benchmarkKey }] as T[]
      if (marker[1] === 'history') return [persistenceRow] as T[]
      return [] as T[]
    }
    const proposal = (await collectDurationLearningRuntimeCandidateProposals(lifecycleQuery))
      .find((item) => item.assetKey === 'base_duration_benchmark')
    expect(proposal?.runtimePayload).toMatchObject({
      benchmarkId,
      variance: candidate.variance,
      coefficientOfVariation: candidate.coefficientOfVariation,
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
    })
    if (!proposal) throw new Error('benchmark proposal required')

    let publication: Record<string, any> | null = null
    const publicationQuery = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (sql.includes('as scope_authorized')) {
        return [{ scope_authorized: true }] as T[]
      }
      if (sql.includes('where publication_key = $1')) return (publication ? [publication] : []) as T[]
      if (sql.includes('persist_duration_learning_runtime_publication')) {
        publication = {
          publication_key: params[0], asset_key: params[1], artifact_key: params[2], scope_level: params[3],
          company_id: params[4], project_id: params[5], industry_key: params[6], publication_stage: params[7],
          runtime_payload: params[8], source_candidate_refs: params[9], source_evidence_refs: params[10],
          automation_decision: params[11], previous_publication_key: params[12], traffic_percent: params[13],
          monitoring_window_hours: params[14], monitoring_status: 'passed', published_at: params[15],
        }
        return [publication] as T[]
      }
      return [] as T[]
    }
    const published = await persistDurationLearningRuntimePublication({
      queryExec: publicationQuery,
      publicationKey,
      assetKey: 'base_duration_benchmark',
      artifactKey: proposal.artifactKey,
      scope: proposal.scope,
      stage: 'canary',
      runtimePayload: proposal.runtimePayload,
      sourceCandidateRefs: proposal.sourceCandidateRefs,
      sourceEvidenceRefs: proposal.sourceEvidenceRefs,
      trafficPercent: 100,
      monitoringWindowHours: 72,
      publishedAt: '2026-07-21T01:00:00.000Z',
    })
    expect(published.reasons).toEqual([])
    expect(published.status).toBe('published')

    let persistedSegment: Record<string, any> | null = null
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
        if (normalized.includes('from public.duration_learning_runtime_publications')) {
          return { rows: [publication], rowCount: 1 }
        }
        if (normalized.includes('from public.projects')) return { rows: [{ company_id: companyId }], rowCount: 1 }
        if (normalized.includes('from public.duration_benchmarks') && normalized.includes('for update')) {
          return { rows: [{ ...persistenceRow, is_current: false, is_active: true }], rowCount: 1 }
        }
        if (normalized.includes('promote_duration_learning_runtime_canary')) {
          publication!.publication_stage = 'stable'
          publication!.monitoring_status = 'passed'
          return { rows: [{ target_previous_publication_key: null }], rowCount: 1 }
        }
        if (normalized.includes('update public.duration_benchmarks') && normalized.includes('id <>')) {
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('update public.duration_benchmarks') && normalized.includes('runtime_publication_status')) {
          return { rows: [{ ...persistenceRow, is_current: true }], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_experience_samples sample')) {
          return { rows: Array.from({ length: 6 }, (_, index) => ({
            sample_id: `cause-sample-${index + 1}`,
            attribution_id: `44444444-4444-4444-8444-44444444444${index}`,
            cause_code: 'material_shortage', taxonomy_version: 'v1.0.0', actual_duration_production_days: 5 + index,
            sample_company_id: companyId, sample_project_id: projectId, attribution_company_id: companyId,
            attribution_project_id: projectId, attribution_status: 'confirmed', attribution_event_type: 'delay',
            cause_role: 'primary', confirmed_at: '2026-07-20T00:00:00.000Z', source_type: 'task_completion',
            snapshot_attribution_id: `44444444-4444-4444-8444-44444444444${index}`,
            snapshot_cause_code: 'material_shortage', snapshot_taxonomy_version: 'v1.0.0',
            snapshot_event_type: 'delay', snapshot_confirmed_at: '2026-07-20T00:00:00.000Z', snapshot_primary_count: 1,
            included_in_benchmark: true, sample_strength: 'strong', duration_day_basis: 'construction_production_day',
            calendar_ref: 'cn-work-calendar', calendar_version: '2026.07',
          })), rowCount: 6 }
        }
        if (normalized.includes('update public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
        if (normalized.includes('insert into public.duration_benchmark_cause_segments')) {
          persistedSegment = {
            id: '55555555-5555-4555-8555-555555555555', benchmark_id: params[0], company_id: params[1],
            project_id: params[2], cause_code: params[3], taxonomy_version: params[4], sample_count: params[5],
            p50_days: params[6], p75_days: params[7], p80_days: params[8], mean_days: params[9], variance: params[10],
            generated_at: params[11], source_window_start: params[12], source_as_of: params[13],
            duration_day_basis: 'construction_production_day', calendar_ref: params[14], calendar_version: params[15],
            lineage: JSON.parse(String(params[16])),
          }
          return { rows: [persistedSegment], rowCount: 1 }
        }
        if (normalized.includes('cause_segments_publication_key')) return { rows: [{ id: benchmarkId }], rowCount: 1 }
        throw new Error(`Unexpected chain SQL: ${normalized}`)
      }),
    }
    databaseMocks.getClient.mockResolvedValue(client)
    await expect(promoteDurationBenchmarkRuntimeCanaryAtomically({ publicationKey }))
      .resolves.toMatchObject({ status: 'stable_promoted' })
    expect(client.query.mock.calls.some(([sql]) => String(sql).trim().toLowerCase() === 'commit')).toBe(true)

    const resolution = await resolveDurationLearningRuntimePublication({
      queryExec: async <T = Record<string, unknown>>(sql: string): Promise<T[]> => (
        sql.includes('from public.duration_learning_runtime_publications') ? [publication] as T[] : [] as T[]
      ),
      assetKey: 'base_duration_benchmark',
      artifactKey: proposal.artifactKey,
      companyId,
      projectId,
      industryKey: null,
    })
    expect(resolution.runtimeConsumable).toBe(true)
    if (!resolution.runtimeConsumable || !resolution.publication) throw new Error('runtime publication required')
    const benchmark = buildDurationBenchmarkRowFromRuntimePublication({
      publicationKey: resolution.publicationKey,
      selectionBasis: resolution.selectionBasis,
      publication: resolution.publication,
    })
    const suggestionCandidate: DurationBenchmarkCandidate = {
      benchmark: benchmark!, scope: 'project', benchKey: proposal.artifactKey,
      contextKey: 'all', sampleSize: candidate.sampleCount, specificity: 'all',
    }
    const exact = await selectCauseAwareBenchmarkCandidates(
      [suggestionCandidate],
      'material_shortage',
      async <T = Record<string, unknown>>() => [persistedSegment] as T[],
    )
    expect(exact).toMatchObject({ selection: 'exact_cause', fallback: null })
    expect(exact.segment).toMatchObject({ benchmarkId, causeCode: 'material_shortage', sampleCount: 6 })

    const failed = await selectCauseAwareBenchmarkCandidates(
      [suggestionCandidate],
      'material_shortage',
      async () => { throw new Error('segment transport failed') },
    )
    expect(failed).toMatchObject({ candidates: [], selection: 'cause_segment_read_failed', fallback: null })
  })
})
