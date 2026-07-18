import { describe, expect, it, vi } from 'vitest'

import {
  persistDurationLearningRuntimePublication,
  promoteDurationLearningRuntimeCanary,
  recordDurationLearningRuntimeImpact,
  resolveDurationLearningRuntimePublication,
  rollbackDurationLearningRuntimePublication,
  type DurationLearningRuntimePublicationQueryExec,
} from '../services/durationLearningRuntimePublicationService.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const companyId = '22222222-2222-4222-8222-222222222222'

function asQueryExec(queryMock: ReturnType<typeof vi.fn>): DurationLearningRuntimePublicationQueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (
    await queryMock(sql, params)
  ) as T[]
}

describe('durationLearningRuntimePublicationService', () => {
  it('returns the existing publication for an identical publication key without replacing active rows', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('where publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:benchmark:retry-1',
          asset_key: 'base_duration_benchmark',
          artifact_key: 'STD-001:process:all',
          scope_level: 'company',
          company_id: companyId,
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            p50Days: 12,
            p80Days: 16,
            durationDayBasis: 'construction_production_day',
          },
          source_candidate_refs: ['duration_benchmarks:candidate-1'],
          source_evidence_refs: ['duration_experience_samples:sample-1'],
          automation_decision: {},
          previous_publication_key: null,
          traffic_percent: 10,
          monitoring_window_hours: 72,
          monitoring_status: 'pending',
          published_at: '2026-07-17T00:00:00.000Z',
        }]
      }
      return []
    })
    const queryExec = asQueryExec(queryMock)

    const result = await persistDurationLearningRuntimePublication({
      queryExec,
      publicationKey: 'duration-learning:benchmark:retry-1',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'STD-001:process:all',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: {
        p50Days: 12,
        p80Days: 16,
        durationDayBasis: 'construction_production_day',
      },
      sourceCandidateRefs: ['duration_benchmarks:candidate-1'],
      sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
      trafficPercent: 10,
      monitoringWindowHours: 72,
    })

    expect(result.status).toBe('published')
    expect(result.publication?.publicationKey).toBe('duration-learning:benchmark:retry-1')
    expect(queryMock).toHaveBeenCalledOnce()
    expect(String(queryMock.mock.calls[0]?.[0])).not.toContain('update public.duration_learning_runtime_publications')
  })

  it('fails closed before mutation when a publication key is reused with a different payload', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('where publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:benchmark:retry-1',
          asset_key: 'base_duration_benchmark',
          artifact_key: 'STD-001:process:all',
          scope_level: 'company',
          company_id: companyId,
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            p50Days: 12,
            p80Days: 16,
            durationDayBasis: 'construction_production_day',
          },
          source_candidate_refs: ['duration_benchmarks:candidate-1'],
          source_evidence_refs: ['duration_experience_samples:sample-1'],
          automation_decision: {},
          previous_publication_key: null,
          traffic_percent: 10,
          monitoring_window_hours: 72,
          monitoring_status: 'pending',
          published_at: '2026-07-17T00:00:00.000Z',
        }]
      }
      return []
    })
    const queryExec = asQueryExec(queryMock)

    const result = await persistDurationLearningRuntimePublication({
      queryExec,
      publicationKey: 'duration-learning:benchmark:retry-1',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'STD-001:process:all',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: {
        p50Days: 13,
        p80Days: 17,
        durationDayBasis: 'construction_production_day',
      },
      sourceCandidateRefs: ['duration_benchmarks:candidate-1'],
      sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
      trafficPercent: 10,
      monitoringWindowHours: 72,
    })

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('publication_key_contract_mismatch')
    expect(queryMock).toHaveBeenCalledOnce()
  })

  it('rejects a benchmark runtime payload that is not production-day based before querying', async () => {
    const queryMock = vi.fn()
    const queryExec = asQueryExec(queryMock)

    const result = await persistDurationLearningRuntimePublication({
      queryExec,
      publicationKey: 'duration-learning:benchmark:bad-basis',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'STD-001:process:all',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: {
        p50Days: 12,
        p80Days: 16,
        durationDayBasis: 'calendar_day',
      },
      sourceCandidateRefs: ['duration_benchmarks:candidate-1'],
      sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
      trafficPercent: 10,
    })

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('benchmark_production_day_basis_required')
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('resolves a selected project canary before lower-scope stable and falls back without project traffic identity', async () => {
    const rows = [
      {
        publication_key: 'duration_learning_runtime:wbs_reference_days:company-canary',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-a',
        scope_level: 'company',
        company_id: companyId,
        project_id: null,
        industry_key: null,
        publication_stage: 'canary',
        runtime_payload: { nodes: [{ sourceId: 'node-a', referenceDays: 8 }] },
        traffic_percent: 100,
        monitoring_status: 'collecting',
        published_at: '2026-07-17T00:00:00.000Z',
      },
      {
        publication_key: 'duration_learning_runtime:wbs_reference_days:global-stable',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-a',
        scope_level: 'global',
        company_id: null,
        project_id: null,
        industry_key: null,
        publication_stage: 'stable',
        runtime_payload: { nodes: [{ sourceId: 'node-a', referenceDays: 10 }] },
        traffic_percent: 100,
        monitoring_status: 'passed',
        published_at: '2026-07-16T00:00:00.000Z',
      },
    ]
    const queryMock = vi.fn(async () => rows)
    const queryExec = asQueryExec(queryMock)

    const canary = await resolveDurationLearningRuntimePublication({
      queryExec,
      assetKey: 'wbs_reference_days',
      artifactKey: 'template-a',
      companyId,
      projectId,
    })
    const stable = await resolveDurationLearningRuntimePublication({
      queryExec,
      assetKey: 'wbs_reference_days',
      artifactKey: 'template-a',
      companyId,
    })

    expect(canary.publicationKey).toBe('duration_learning_runtime:wbs_reference_days:company-canary')
    expect(canary.selectionBasis).toBe('company_canary')
    expect(stable.publicationKey).toBe('duration_learning_runtime:wbs_reference_days:global-stable')
    expect(stable.selectionBasis).toBe('global_stable')
  })

  it('promotes a monitored canary while atomically superseding the previous stable publication', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('select publication_key') && sql.includes("publication_stage = 'canary'")) {
        return [{
          publication_key: 'duration-learning:canary-1',
          asset_key: 'dependency_rule_candidate',
          artifact_key: 'A->B:FS',
          scope_level: 'company',
          company_id: companyId,
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: { predecessorCode: 'A', successorCode: 'B', dependencyType: 'FS', lagDays: 1 },
          previous_publication_key: 'duration-learning:stable-0',
          traffic_percent: 10,
          monitoring_status: 'passed',
        }]
      }
      if (sql.includes('with superseded as')) {
        return [{ publication_key: 'duration-learning:canary-1', publication_stage: 'stable' }]
      }
      return []
    })
    const queryExec = asQueryExec(queryMock)

    const result = await promoteDurationLearningRuntimeCanary({
      queryExec,
      publicationKey: 'duration-learning:canary-1',
      promotedAt: '2026-07-17T01:00:00.000Z',
    })

    expect(result.status).toBe('stable_promoted')
    expect(result.previousPublicationKey).toBe('duration-learning:stable-0')
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('with superseded as'))).toBe(true)
  })

  it('records measured impact and restores the previous stable publication on rollback', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('set impact_metrics')) {
        return [{ publication_key: 'duration-learning:canary-1', monitoring_status: 'failed' }]
      }
      if (sql.includes('with rolled_back as')) {
        return [{
          publication_key: 'duration-learning:canary-1',
          previous_publication_key: 'duration-learning:stable-0',
        }]
      }
      return []
    })
    const queryExec = asQueryExec(queryMock)

    const impact = await recordDurationLearningRuntimeImpact({
      queryExec,
      publicationKey: 'duration-learning:canary-1',
      monitoringStatus: 'failed',
      metrics: {
        sampleCount: 40,
        maeBefore: 8,
        maeAfter: 10,
        regression: true,
      },
      observedAt: '2026-07-17T01:30:00.000Z',
    })
    const rollback = await rollbackDurationLearningRuntimePublication({
      queryExec,
      publicationKey: 'duration-learning:canary-1',
      reason: 'mae_regression_detected',
      rolledBackAt: '2026-07-17T02:00:00.000Z',
    })

    expect(impact.status).toBe('impact_recorded')
    expect(rollback.status).toBe('rollback_executed')
    expect(rollback.restoredPublicationKey).toBe('duration-learning:stable-0')
  })
})
