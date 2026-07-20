import { describe, expect, it, vi } from 'vitest'

import {
  persistDurationLearningRuntimePublication,
  listApplicableDurationLearningRuntimePublications,
  promoteDurationLearningRuntimeCanary,
  recordDurationLearningRuntimeImpact,
  resolveDurationLearningRuntimePublication,
  resolveDurationLearningRuntimePublicationIdentity,
  rollbackDurationLearningRuntimePublication,
  type DurationLearningRuntimePublicationQueryExec,
} from '../services/durationLearningRuntimePublicationService.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const companyId = '22222222-2222-4222-8222-222222222222'
const otherCompanyId = '33333333-3333-4333-8333-333333333333'

function asQueryExec(queryMock: ReturnType<typeof vi.fn>): DurationLearningRuntimePublicationQueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (
    await queryMock(sql, params)
  ) as T[]
}

function queryCalls(queryMock: ReturnType<typeof vi.fn>): Array<[string, unknown[]]> {
  return queryMock.mock.calls as unknown as Array<[string, unknown[]]>
}

describe('durationLearningRuntimePublicationService', () => {
  it('resolves the complete publication identity without trusting caller metadata', async () => {
    const queryMock = vi.fn(async () => ([{
      publication_key: 'duration_learning_runtime:dependency_rule_candidate:source',
      asset_key: 'dependency_rule_candidate',
      artifact_key: 'artifact-dependency-rule-v2',
      scope_level: 'project',
      company_id: companyId,
      project_id: projectId,
      industry_key: null,
      publication_stage: 'stable',
      runtime_payload: {},
      source_candidate_refs: ['candidate:dependency-rule'],
      source_evidence_refs: ['evidence:dependency-rule'],
      automation_decision: {},
      previous_publication_key: 'duration_learning_runtime:dependency_rule_candidate:previous',
      traffic_percent: 100,
      monitoring_window_hours: 72,
      monitoring_status: 'passed',
      published_at: '2026-07-17T00:00:00.000Z',
    }]))

    const identity = await resolveDurationLearningRuntimePublicationIdentity({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration_learning_runtime:dependency_rule_candidate:source',
    })

    expect(identity).toEqual({
      publicationKey: 'duration_learning_runtime:dependency_rule_candidate:source',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'artifact-dependency-rule-v2',
      scope: { level: 'project', companyId, projectId },
    })
    expect(queryMock).toHaveBeenCalledOnce()
  })

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

  it.each([
    {
      assetKey: 'special_work_duration_seed' as const,
      payload: {
        nodes: [{ sourceId: 'node-a', p50Days: 12 }],
      },
      reason: 'special_seed_production_day_basis_required',
    },
    {
      assetKey: 'wbs_reference_days' as const,
      payload: {
        nodes: [{ sourceId: 'node-a', referenceDays: 12 }],
        durationDayBasis: 'calendar_day',
      },
      reason: 'wbs_reference_days_production_day_basis_required',
    },
  ])('rejects $assetKey payloads without a top-level production-day basis before querying', async ({
    assetKey,
    payload,
    reason,
  }) => {
    const queryMock = vi.fn()

    const result = await persistDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: `duration-learning:${assetKey}:bad-basis`,
      assetKey,
      artifactKey: 'template-a',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: payload,
      sourceCandidateRefs: ['algorithm_asset_candidate_events:candidate-1'],
      sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
      trafficPercent: 10,
    })

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain(reason)
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

  it('rejects failed and rollback-pending publications before runtime selection', async () => {
    const rows = [
      {
        publication_key: 'duration-learning:wbs:failed-company',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-a',
        scope_level: 'company',
        company_id: companyId,
        project_id: null,
        industry_key: null,
        publication_stage: 'canary',
        runtime_payload: { nodes: [{ sourceId: 'node-a', referenceDays: 7 }] },
        traffic_percent: 100,
        monitoring_status: 'failed',
        published_at: '2026-07-19T00:00:00.000Z',
      },
      {
        publication_key: 'duration-learning:wbs:rollback-pending-project',
        asset_key: 'wbs_reference_days',
        artifact_key: 'template-a',
        scope_level: 'project',
        company_id: companyId,
        project_id: projectId,
        industry_key: null,
        publication_stage: 'stable',
        runtime_payload: { nodes: [{ sourceId: 'node-a', referenceDays: 8 }] },
        traffic_percent: 100,
        monitoring_status: 'rollback_pending',
        published_at: '2026-07-18T00:00:00.000Z',
      },
      {
        publication_key: 'duration-learning:wbs:safe-global',
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
        published_at: '2026-07-17T00:00:00.000Z',
      },
    ]
    const queryMock = vi.fn(async () => rows)
    const queryExec = asQueryExec(queryMock)

    const resolved = await resolveDurationLearningRuntimePublication({
      queryExec,
      assetKey: 'wbs_reference_days',
      artifactKey: 'template-a',
      companyId,
      projectId,
    })
    const applicable = await listApplicableDurationLearningRuntimePublications({
      queryExec,
      assetKey: 'wbs_reference_days',
      companyId,
      projectId,
    })

    expect(resolved.publicationKey).toBe('duration-learning:wbs:safe-global')
    expect(applicable.map((item) => item.publicationKey)).toEqual([
      'duration-learning:wbs:safe-global',
    ])
    for (const [sql] of queryCalls(queryMock)) {
      expect(String(sql)).toContain("monitoring_status in ('pending', 'collecting', 'passed')")
      expect(String(sql)).toContain("monitoring_status = 'passed'")
    }
  })

  it('publishes through one atomic database transition instead of separate staging and replacement calls', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('where publication_key = $1')) return []
      if (sql.includes('persist_duration_learning_runtime_publication')) {
        return [{
          publication_key: 'duration-learning:dependency:atomic-insert',
          asset_key: 'dependency_rule_candidate',
          artifact_key: 'A->B:FS',
          scope_level: 'company',
          company_id: companyId,
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: { predecessorCode: 'A', successorCode: 'B', dependencyType: 'FS' },
          source_candidate_refs: ['candidate:a-b'],
          source_evidence_refs: ['evidence:a-b'],
          automation_decision: {},
          previous_publication_key: null,
          traffic_percent: 5,
          monitoring_window_hours: 72,
          monitoring_status: 'pending',
        }]
      }
      return []
    })

    const result = await persistDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:dependency:atomic-insert',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: { predecessorCode: 'A', successorCode: 'B', dependencyType: 'FS' },
      sourceCandidateRefs: ['candidate:a-b'],
      sourceEvidenceRefs: ['evidence:a-b'],
    })

    expect(result.status).toBe('published')
    const transitionCall = queryMock.mock.calls.find(([sql]) => (
      String(sql).includes('persist_duration_learning_runtime_publication')
    ))
    expect(transitionCall).toBeTruthy()
    expect(String(transitionCall?.[0])).not.toContain('update public.duration_learning_runtime_publications')
  })

  it('does not replace an active publication when inactive staging did not insert', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('where publication_key = $1')) return []
      if (sql.includes('persist_duration_learning_runtime_publication')) return []
      return []
    })

    const result = await persistDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:dependency:failed-stage',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: { predecessorCode: 'A', successorCode: 'B', dependencyType: 'FS' },
      sourceCandidateRefs: ['candidate:a-b'],
      sourceEvidenceRefs: ['evidence:a-b'],
    })

    expect(result).toEqual({
      status: 'blocked',
      publication: null,
      reasons: ['runtime_publication_insert_result_required'],
    })
    expect(queryMock.mock.calls.every(([sql]) => (
      !String(sql).includes('update public.duration_learning_runtime_publications')
    ))).toBe(true)
  })

  it('rejects a project publication when the project does not belong to the declared company', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('from public.projects project')) return [{ scope_authorized: false }]
      return []
    })

    const result = await persistDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:wbs:cross-company-project',
      assetKey: 'wbs_reference_days',
      artifactKey: 'template-a',
      scope: { level: 'project', companyId: otherCompanyId, projectId },
      stage: 'canary',
      runtimePayload: {
        durationDayBasis: 'construction_production_day',
        nodes: [{ sourceId: 'node-a', referenceDays: 8 }],
      },
      sourceCandidateRefs: ['candidate:cross-company'],
      sourceEvidenceRefs: ['evidence:cross-company'],
    })

    expect(result).toEqual({
      status: 'blocked',
      publication: null,
      reasons: ['project_scope_company_mismatch'],
    })
    expect(queryMock).toHaveBeenCalledOnce()
    expect(String(queryMock.mock.calls[0]?.[0])).toContain('project.company_id = $2::uuid')
    expect(queryCalls(queryMock)[0]?.[1]).toEqual([projectId, otherCompanyId])
  })

  it('treats an explicit previous publication key as a same-identity CAS expectation', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('where publication_key = $1')) return []
      if (sql.includes('persist_duration_learning_runtime_publication')) return []
      return []
    })

    const result = await persistDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:dependency:cas-mismatch',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      scope: { level: 'company', companyId },
      stage: 'canary',
      runtimePayload: { predecessorCode: 'A', successorCode: 'B', dependencyType: 'FS' },
      sourceCandidateRefs: ['candidate:a-b'],
      sourceEvidenceRefs: ['evidence:a-b'],
      previousPublicationKey: 'duration-learning:other-tenant-or-asset',
    })

    expect(result).toEqual({
      status: 'blocked',
      publication: null,
      reasons: ['previous_publication_key_mismatch'],
    })
    const transitionCall = queryCalls(queryMock).find(([sql]) => (
      String(sql).includes('persist_duration_learning_runtime_publication')
    ))
    expect(transitionCall).toBeTruthy()
    expect(transitionCall?.[1]).toEqual(expect.arrayContaining([
      'dependency_rule_candidate',
      'A->B:FS',
      'company',
      companyId,
      'duration-learning:other-tenant-or-asset',
    ]))
  })

  it('keeps the previous stable active when a promotion target loses its passed canary CAS', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('promote_duration_learning_runtime_canary')) return []
      if (sql.includes('where publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:canary-raced',
          publication_stage: 'canary',
          monitoring_status: 'failed',
          previous_publication_key: 'duration-learning:stable-0',
        }]
      }
      return []
    })

    const result = await promoteDurationLearningRuntimeCanary({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:canary-raced',
    })

    expect(result).toEqual({
      status: 'blocked',
      previousPublicationKey: 'duration-learning:stable-0',
      reasons: ['canary_monitoring_pass_required'],
    })
    expect(String(queryMock.mock.calls[0]?.[0]).replace(/\s+/g, ' ')).toContain(
      'select * from public.promote_duration_learning_runtime_canary',
    )
    expect(String(queryMock.mock.calls[0]?.[0])).not.toContain('update public.duration_learning_runtime_publications')
  })

  it('rejects rollback without authoritative asset, artifact and scope identity before querying', async () => {
    const queryMock = vi.fn()

    const result = await rollbackDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:canary-1',
      reason: 'forced_rollback',
    })

    expect(result).toEqual({
      status: 'blocked',
      restoredPublicationKey: null,
      reasons: [
        'rollback_asset_key_required',
        'rollback_artifact_key_required',
        'rollback_scope_required',
      ],
    })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('passes complete tenant and publication identity into the atomic rollback transition', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('rollback_duration_learning_runtime_publication')) {
        return [{
          publication_key: 'duration-learning:dependency:company-canary',
          previous_publication_key: 'duration-learning:dependency:company-stable',
          restored_publication_key: 'duration-learning:dependency:company-stable',
        }]
      }
      return []
    })

    const result = await rollbackDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:dependency:company-canary',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      scope: { level: 'company', companyId },
      expectedPreviousPublicationKey: 'duration-learning:dependency:company-stable',
      reason: 'forced_rollback',
      rolledBackAt: '2026-07-20T00:00:00.000Z',
    })

    expect(result).toEqual({
      status: 'rollback_executed',
      restoredPublicationKey: 'duration-learning:dependency:company-stable',
      reasons: [],
    })
    expect(queryMock).toHaveBeenCalledOnce()
    expect(String(queryMock.mock.calls[0]?.[0]).replace(/\s+/g, ' ')).toContain(
      'select * from public.rollback_duration_learning_runtime_publication',
    )
    expect(queryCalls(queryMock)[0]?.[1]).toEqual([
      'duration-learning:dependency:company-canary',
      'dependency_rule_candidate',
      'A->B:FS',
      'company',
      companyId,
      null,
      null,
      'duration-learning:dependency:company-stable',
      'forced_rollback',
      '2026-07-20T00:00:00.000Z',
    ])
  })

  it('promotes a monitored canary while atomically superseding the previous stable publication', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('promote_duration_learning_runtime_canary')) {
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
    expect(queryMock).toHaveBeenCalledOnce()
    const promotionSql = String(queryMock.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(promotionSql).toContain('select * from public.promote_duration_learning_runtime_canary')
    expect(queryCalls(queryMock)[0]?.[1]).toEqual([
      'duration-learning:canary-1',
      '2026-07-17T01:00:00.000Z',
    ])
  })

  it('reuses an already-promoted stable terminal state after an ambiguous canary response', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes("publication_stage = 'canary'")) return []
      if (sql.includes('where publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:canary-ambiguous',
          publication_stage: 'stable',
          monitoring_status: 'passed',
          previous_publication_key: 'duration-learning:stable-0',
        }]
      }
      return []
    })

    const result = await promoteDurationLearningRuntimeCanary({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:canary-ambiguous',
    })

    expect(result).toEqual({
      status: 'stable_already_promoted',
      previousPublicationKey: 'duration-learning:stable-0',
      reasons: [],
    })
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('with superseded as'))).toBe(false)
  })

  it('records measured impact and restores the previous stable publication on rollback', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('set impact_metrics')) {
        return [{ publication_key: 'duration-learning:canary-1', monitoring_status: 'failed' }]
      }
      if (sql.includes('rollback_duration_learning_runtime_publication')) {
        return [{
          publication_key: 'duration-learning:canary-1',
          previous_publication_key: 'duration-learning:stable-0',
          restored_publication_key: 'duration-learning:stable-0',
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
      assetKey: 'base_duration_benchmark',
      artifactKey: 'benchmark-a',
      scope: { level: 'company', companyId },
      reason: 'mae_regression_detected',
      rolledBackAt: '2026-07-17T02:00:00.000Z',
    })

    expect(impact.status).toBe('impact_recorded')
    expect(rollback.status).toBe('rollback_executed')
    expect(rollback.restoredPublicationKey).toBe('duration-learning:stable-0')
  })

  it('fails closed without mutation when the declared rollback target does not match previous publication lineage', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('rollback_duration_learning_runtime_publication')) return []
      if (sql.includes('where target.publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:canary-1',
          publication_stage: 'canary',
          previous_publication_key: 'duration-learning:stable-other',
        }]
      }
      return []
    })

    const result = await rollbackDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:canary-1',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'benchmark-a',
      scope: { level: 'company', companyId },
      expectedPreviousPublicationKey: 'duration-learning:stable-0',
      reason: 'mae_regression_detected',
      rolledBackAt: '2026-07-17T02:00:00.000Z',
    })

    expect(result).toEqual({
      status: 'blocked',
      restoredPublicationKey: null,
      reasons: ['rollback_target_mismatch'],
    })
    const queryCalls = queryMock.mock.calls as unknown as Array<[string, unknown[]]>
    expect(queryCalls[0]?.[0]).toContain('rollback_duration_learning_runtime_publication')
    expect(queryCalls[0]?.[1]).toEqual([
      'duration-learning:canary-1',
      'base_duration_benchmark',
      'benchmark-a',
      'company',
      companyId,
      null,
      null,
      'duration-learning:stable-0',
      'mae_regression_detected',
      '2026-07-17T02:00:00.000Z',
    ])
  })

  it('does not report rollback success when a declared predecessor was not restored', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('rollback_duration_learning_runtime_publication')) return []
      if (sql.includes('where target.publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:canary-1',
          publication_stage: 'canary',
          previous_publication_key: 'duration-learning:stable-missing',
        }]
      }
      return []
    })

    const result = await rollbackDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:canary-1',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'benchmark-a',
      scope: { level: 'company', companyId },
      reason: 'forced_rollback',
    })

    expect(result).toEqual({
      status: 'blocked',
      restoredPublicationKey: null,
      reasons: ['rollback_target_not_restored'],
    })
    const terminalSql = String(queryMock.mock.calls[1]?.[0])
    expect(terminalSql).toContain('predecessor.asset_key = target.asset_key')
    expect(terminalSql).toContain('predecessor.artifact_key = target.artifact_key')
    expect(terminalSql).toContain('predecessor.company_id is not distinct from target.company_id')
  })

  it('reuses an already-rolled-back terminal state without restoring the prior stable twice', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('rollback_duration_learning_runtime_publication')) return []
      if (sql.includes('where target.publication_key = $1')) {
        return [{
          publication_key: 'duration-learning:rollback-ambiguous',
          publication_stage: 'rolled_back',
          previous_publication_key: 'duration-learning:stable-0',
          restored_publication_key: 'duration-learning:stable-0',
        }]
      }
      return []
    })

    const result = await rollbackDurationLearningRuntimePublication({
      queryExec: asQueryExec(queryMock),
      publicationKey: 'duration-learning:rollback-ambiguous',
      assetKey: 'base_duration_benchmark',
      artifactKey: 'benchmark-a',
      scope: { level: 'company', companyId },
      reason: 'retry_after_ambiguous_response',
    })

    expect(result).toEqual({
      status: 'rollback_already_executed',
      restoredPublicationKey: 'duration-learning:stable-0',
      reasons: [],
    })
    expect(queryMock).toHaveBeenCalledTimes(2)
  })
})
