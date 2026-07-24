import { describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  actualGetClient: null as null | (() => Promise<unknown>),
}))

vi.mock('../database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database.js')>()
  databaseMocks.actualGetClient = actual.getClient
  return {
    ...actual,
    getClient: databaseMocks.getClient,
    query: vi.fn(async () => ({ rows: [] })),
  }
})

import { runWithDatabaseTransactionClient } from '../database.js'
import { createDatabaseDurationAssetReviewQueueStore } from '../services/durationAssetReviewQueueService.js'
import { promoteDurationBenchmarkRuntimeCanaryAtomically } from '../services/durationLearningAssetAtomicStoreService.js'
import { hashDurationContextPolicyLearningValue } from '../services/durationContextPolicyLearningCheckpointService.js'
import {
  collectDurationLearningRuntimeCandidateProposals,
  runDurationLearningRuntimeLifecycleSweep,
} from '../services/durationLearningRuntimeLifecycleService.js'
import {
  persistDurationLearningRuntimePublication,
  recordDurationLearningRuntimeImpact,
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
  it.each([
    {
      scopeLevel: 'company' as const,
      companyId,
      projectId: null,
      industryKey: null,
      scope: { level: 'company' as const, companyId },
    },
    {
      scopeLevel: 'industry' as const,
      companyId: null,
      projectId: null,
      industryKey: 'general_civil',
      scope: { level: 'industry' as const, industryKey: 'general_civil' },
    },
    {
      scopeLevel: 'global' as const,
      companyId: null,
      projectId: null,
      industryKey: null,
      scope: { level: 'global' as const },
    },
  ])('consumes a $scopeLevel aggregate as all-cause history without querying an exact segment', async ({
    scopeLevel,
    companyId: aggregateCompanyId,
    projectId: aggregateProjectId,
    industryKey,
    scope,
  }) => {
    const sourceBenchmarkIds = [benchmarkId]
    const sourceBenchmarkVersions = ['candidate:2026-07-21:production-chain']
    const sourceAsOf = '2026-07-20T00:00:00.000Z'
    const benchmarkVersion = `aggregate:${scopeLevel}:${hashDurationContextPolicyLearningValue({
      scope,
      sourceBenchmarkIds,
      sourceBenchmarkVersions,
      sourceAsOf,
    }).slice(0, 16)}`
    const payload = {
      benchmarkKind: 'aggregate_all_cause',
      causeApplicability: 'all_cause',
      benchmarkVersion,
      p50Days: 8, p75Days: 10, p80Days: 11, meanDays: 8.5, variance: 2.25,
      coefficientOfVariation: 0.176471, sampleCount: 100, confidenceLevel: 'high', confidenceScore: 88,
      durationDayBasis: 'construction_production_day', generatedAt: '2026-07-21T00:00:00.000Z',
      sourceWindowStart: '2026-04-22T00:00:00.000Z', sourceAsOf,
      aggregateProvenance: {
        schemaVersion: 'duration-benchmark-aggregate/v1', scopeLevel,
        sourceBenchmarkIds, sourceProjectIds: [projectId], sourceCompanyIds: [companyId],
        sourceBenchmarkVersions,
        sourceIndustryKeys: ['general_civil'],
        calendarIdentities: [{ calendarRef: 'cn-work-calendar', calendarVersion: '2026.07' }],
      },
    }
    const benchmark = buildDurationBenchmarkRowFromRuntimePublication({
      publicationKey: `aggregate-${scopeLevel}`,
      selectionBasis: `${scopeLevel}_stable`,
      publication: {
        runtimePayload: payload,
        companyId: aggregateCompanyId,
        projectId: aggregateProjectId,
        industryKey,
        publicationStage: 'stable',
        scopeLevel,
      },
    })
    expect(benchmark).toMatchObject({
      id: null,
      benchmark_version: benchmarkVersion,
      sample_count: 100,
      metadata: expect.objectContaining({ benchmark_provenance: 'aggregate_all_cause' }),
    })
    const segmentQuery = vi.fn()
    const selection = await selectCauseAwareBenchmarkCandidates([{
      benchmark: benchmark!, scope: scopeLevel as 'company' | 'industry' | 'global',
      benchKey: 'SW-CHAIN:process:all', contextKey: 'all', sampleSize: 100, specificity: 'all',
    }], 'material_shortage', segmentQuery)

    expect(selection).toMatchObject({ selection: 'all_cause_fallback', fallback: 'all_cause' })
    expect(segmentQuery).not.toHaveBeenCalled()
  })

  it('carries exact producer identity through publication and activation into cause-aware suggestion selection', async () => {
    const confirmedAt = '2026-07-20T00:00:00.000Z'
    const samples = Array.from({ length: 20 }, (_, index): DurationExperienceSampleRow => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
      company_id: companyId,
      project_id: projectId,
      task_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`,
      completed_at: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      created_at: new Date(Date.UTC(2026, 6, index + 1, 1)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 6, index + 1, 2)).toISOString(),
      evidence_fingerprint: `fingerprint-chain-${index + 1}`,
      source_lineage: { schemaVersion: 'duration-experience-sample/v1', completionId: `completion-${index + 1}` },
      standard_work_code: 'SW-CHAIN',
      wbs_node_type: 'process',
      actual_duration_production_days: 6 + (index % 3),
      duration_day_basis: 'construction_production_day',
      metadata: {
        construction_calendar_ref: 'cn-work-calendar',
        construction_calendar_version: '2026.07',
        structured_cause_snapshot: {
          confirmed_causes: index < 6 ? [{
            attribution_id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
            cause_code: 'material_shortage',
            taxonomy_version: 'v1.0.0',
            event_type: 'delay',
            cause_role: 'primary',
            confirmed_at: confirmedAt,
          }] : [],
        },
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
      benchmarkVersion: persistenceRow.benchmark_version,
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
          monitoring_window_hours: params[14], monitoring_status: 'passed', impact_metrics: null,
          published_at: params[15],
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
    let benchmarkCurrent = false
    let causeSegmentsCurrent = false
    let failFinalQueueResolution = true
    const reviewRow = {
      reviewKind: 'stable_promotion',
      assetKey: 'base_duration_benchmark',
      artifactKey: proposal.artifactKey,
      scopeLevel: 'project',
      companyId,
      projectId,
      publicationKey,
      status: 'open',
      resolvedPublicationKey: null as string | null,
    }
    let transactionSnapshot: null | {
      publicationStage: string
      monitoringStatus: string
      impactMetrics: Record<string, unknown> | null
      benchmarkCurrent: boolean
      causeSegmentsCurrent: boolean
      persistedSegment: Record<string, any> | null
      reviewStatus: string
      reviewResolvedPublicationKey: string | null
    } = null
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        if (normalized === 'begin') {
          transactionSnapshot = {
            publicationStage: String(publication!.publication_stage),
            monitoringStatus: String(publication!.monitoring_status),
            impactMetrics: publication!.impact_metrics ?? null,
            benchmarkCurrent,
            causeSegmentsCurrent,
            persistedSegment,
            reviewStatus: reviewRow.status,
            reviewResolvedPublicationKey: reviewRow.resolvedPublicationKey,
          }
          return { rows: [], rowCount: 0 }
        }
        if (normalized === 'commit') {
          transactionSnapshot = null
          return { rows: [], rowCount: 0 }
        }
        if (normalized === 'rollback') {
          if (transactionSnapshot) {
            publication!.publication_stage = transactionSnapshot.publicationStage
            publication!.monitoring_status = transactionSnapshot.monitoringStatus
            publication!.impact_metrics = transactionSnapshot.impactMetrics
            benchmarkCurrent = transactionSnapshot.benchmarkCurrent
            causeSegmentsCurrent = transactionSnapshot.causeSegmentsCurrent
            persistedSegment = transactionSnapshot.persistedSegment
            reviewRow.status = transactionSnapshot.reviewStatus
            reviewRow.resolvedPublicationKey = transactionSnapshot.reviewResolvedPublicationKey
          }
          transactionSnapshot = null
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('set impact_metrics = $1::jsonb')) {
          publication!.impact_metrics = params[0] as Record<string, unknown>
          publication!.monitoring_status = params[1]
          return {
            rows: [{ publication_key: publicationKey, monitoring_status: params[1] }],
            rowCount: 1,
          }
        }
        if (normalized.includes('as scope_authorized')) {
          return { rows: [{ scope_authorized: true }], rowCount: 1 }
        }
        if (normalized.startsWith('with resolved as ( update public.duration_asset_review_items')) {
          if (failFinalQueueResolution) {
            failFinalQueueResolution = false
            throw new Error('queue resolution update failed')
          }
          const identityMatches = params[0] === reviewRow.reviewKind
            && params[1] === reviewRow.assetKey
            && params[2] === reviewRow.artifactKey
            && params[3] === reviewRow.scopeLevel
            && params[4] === reviewRow.companyId
            && params[5] === reviewRow.projectId
            && params[8] === reviewRow.publicationKey
          const resolvedCount = Number(identityMatches && reviewRow.status === 'open')
          if (resolvedCount === 1) {
            reviewRow.status = 'resolved_by_publication'
            reviewRow.resolvedPublicationKey = String(params[9])
          }
          return { rows: [{ resolved_count: resolvedCount }], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_learning_runtime_publications')) {
          return { rows: [publication], rowCount: 1 }
        }
        if (normalized.includes('from public.projects')) return { rows: [{ company_id: companyId }], rowCount: 1 }
        if (normalized.includes('from public.duration_benchmarks') && normalized.includes('for update')) {
          return { rows: [{ ...persistenceRow, is_current: benchmarkCurrent, is_active: true }], rowCount: 1 }
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
          benchmarkCurrent = true
          return { rows: [{ ...persistenceRow, is_current: true }], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_experience_samples sample')) {
          const rows = samples.map((sample) => {
            const cause = (sample.metadata?.structured_cause_snapshot as {
              confirmed_causes: Array<Record<string, unknown>>
            }).confirmed_causes[0]
            return {
              sample_id: sample.id,
              sample_task_id: sample.task_id,
              sample_completed_at: sample.completed_at,
              sample_created_at: sample.created_at,
              sample_updated_at: sample.updated_at,
              sample_evidence_fingerprint: sample.evidence_fingerprint,
              sample_source_lineage: sample.source_lineage,
              attribution_id: cause?.attribution_id ?? null,
              cause_code: cause?.cause_code ?? null,
              taxonomy_version: cause?.taxonomy_version ?? null,
              actual_duration_production_days: sample.actual_duration_production_days,
              sample_company_id: companyId,
              sample_project_id: projectId,
              attribution_company_id: cause ? companyId : null,
              attribution_project_id: cause ? projectId : null,
              attribution_status: cause ? 'confirmed' : null,
              attribution_event_type: cause?.event_type ?? null,
              cause_role: cause?.cause_role ?? null,
              attribution_subject_type: cause ? 'task' : null,
              attribution_subject_id: cause ? sample.task_id : null,
              confirmed_at: cause?.confirmed_at ?? null,
              source_type: 'task_completion',
              snapshot_attribution_id: cause?.attribution_id ?? null,
              snapshot_cause_code: cause?.cause_code ?? null,
              snapshot_taxonomy_version: cause?.taxonomy_version ?? null,
              snapshot_event_type: cause?.event_type ?? null,
              snapshot_cause_role: cause?.cause_role ?? null,
              snapshot_confirmed_at: cause?.confirmed_at ?? null,
              snapshot_primary_count: cause ? 1 : 0,
              included_in_benchmark: true,
              sample_strength: 'strong',
              duration_day_basis: 'construction_production_day',
              calendar_ref: 'cn-work-calendar',
              calendar_version: '2026.07',
            }
          })
          return { rows, rowCount: rows.length }
        }
        if (normalized.includes('update public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
        if (normalized.includes('insert into public.duration_benchmark_cause_segments')) {
          causeSegmentsCurrent = true
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
    databaseMocks.getClient.mockImplementation(async () => {
      if (!databaseMocks.actualGetClient) throw new Error('actual database getClient unavailable')
      return databaseMocks.actualGetClient()
    })
    const transactionQueryExec = async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> => (await client.query(sql, params)).rows as T[]
    const reviewQueueStore = createDatabaseDurationAssetReviewQueueStore(transactionQueryExec)
    const lifecycleInput = {
      queryExec: transactionQueryExec,
      candidateProvider: async () => [],
      monitoringProvider: async () => [{
        publicationKey,
        assetKey: 'base_duration_benchmark' as const,
        artifactKey: proposal.artifactKey,
        publicationStage: 'canary' as const,
        scope: proposal.scope,
        monitoringWindowHours: 72,
        monitoringElapsedHours: 96,
        observedCount: 20,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 20,
        maeBefore: 8,
        maeAfter: 6,
        regressionRate: 0,
        sourceAutomationDecision: { observed: { conflictCount: 0, replayPassed: true } },
        runtimePayload: proposal.runtimePayload,
        sourceCandidateRefs: proposal.sourceCandidateRefs,
        sourceEvidenceRefs: proposal.sourceEvidenceRefs,
      }],
      stableDecisionEvaluator: () => ({
        targetStage: 'stable',
        stage: 'auto_stable',
        autoPromotionAllowed: true,
        manualReviewRequired: false,
        retainPreviousStable: false,
        reasonCodes: [],
      }),
      reviewQueueStore,
      transactionRunner: <T>(work: () => Promise<T>) => runWithDatabaseTransactionClient(client, work),
      recordImpact: recordDurationLearningRuntimeImpact,
      promoteBenchmarkCanary: promoteDurationBenchmarkRuntimeCanaryAtomically,
      observedAt: '2026-07-22T00:00:00.000Z',
    }

    const failedPromotion = await runDurationLearningRuntimeLifecycleSweep(lifecycleInput as any)
    expect(failedPromotion).toMatchObject({ stablePromoted: 0, reviewItemsResolved: 0, failed: 1 })
    expect(failedPromotion.failureRefs).toEqual([expect.objectContaining({ phase: 'review_queue' })])
    expect(publication!.publication_stage).toBe('canary')
    expect(benchmarkCurrent).toBe(false)
    expect(causeSegmentsCurrent).toBe(false)
    expect(persistedSegment).toBeNull()
    expect(publication!.impact_metrics).toBeNull()
    expect(reviewRow).toMatchObject({ status: 'open', resolvedPublicationKey: null })
    let transactionSql = client.query.mock.calls.map(([sql]) => String(sql).trim().toLowerCase())
    expect(transactionSql.filter((sql) => sql === 'begin')).toHaveLength(1)
    expect(transactionSql.filter((sql) => sql === 'rollback')).toHaveLength(1)
    expect(transactionSql.filter((sql) => sql === 'commit')).toHaveLength(0)

    client.query.mockClear()
    const promoted = await runDurationLearningRuntimeLifecycleSweep(lifecycleInput as any)
    expect(promoted).toMatchObject({ stablePromoted: 1, reviewItemsResolved: 1, failed: 0 })
    expect(publication!.publication_stage).toBe('stable')
    expect(benchmarkCurrent).toBe(true)
    expect(causeSegmentsCurrent).toBe(true)
    expect(publication!.impact_metrics).toEqual(expect.objectContaining({
      monitoringWindowHours: 72,
      monitoringElapsedHours: 96,
    }))
    expect(reviewRow).toMatchObject({
      status: 'resolved_by_publication',
      resolvedPublicationKey: publicationKey,
    })
    transactionSql = client.query.mock.calls.map(([sql]) => String(sql).trim().toLowerCase())
    expect(transactionSql.filter((sql) => sql === 'begin')).toHaveLength(1)
    expect(transactionSql.filter((sql) => sql === 'commit')).toHaveLength(1)
    expect(transactionSql.filter((sql) => sql === 'rollback')).toHaveLength(0)

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
