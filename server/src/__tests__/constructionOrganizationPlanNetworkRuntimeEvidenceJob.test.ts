import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
  runJobWithRetry: vi.fn(async (
    _context: unknown,
    run: (attempt: number, context: { signal: AbortSignal; deadlineAt: string }) => Promise<unknown>,
  ) => {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return {
          attempts: attempt,
          value: await run(attempt, {
            signal: new AbortController().signal,
            deadlineAt: '2026-07-21T00:10:00.000Z',
          }),
        }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }),
  runWithJobLease: vi.fn(async (
    _context: unknown,
    run: (lease: { assertActive: () => void; signal: AbortSignal }) => Promise<unknown>,
  ) => ({
    acquired: true as const,
    value: await run({
      assertActive: vi.fn(),
      signal: new AbortController().signal,
    }),
  })),
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: runtimeMocks.runJobWithRetry,
  runWithJobLease: runtimeMocks.runWithJobLease,
}))

import {
  ConstructionOrganizationPlanNetworkRuntimeEvidenceJob,
  collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates,
  runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep,
  type ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate,
} from '../jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js'

function buildCandidate(
  overrides: Partial<ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate> = {},
): ConstructionOrganizationPlanNetworkRuntimeEvidenceSweepCandidate {
  return {
    publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
    projectId: '00000000-0000-4000-8000-000000000001',
    businessType: 'hospital',
    useCase: 'accelerationRecovery',
    draftNetworkKey: 'draft-network-ready',
    optionId: 'option-ready',
    publishedAt: '2026-06-23T09:00:00.000Z',
    outcomeRef: 'committed-plan:project-1:revision-8',
    savedOutcomeObservedAt: '2026-06-23T10:00:00.000Z',
    savedOutcomeIdentityVerified: true,
    consumerObservationCount: 2,
    consumerObservationIdentityVerified: true,
    recommendationDecisionAction: 'adopted',
    recommendationDecisionIdentityVerified: true,
    recommendationDecisionAt: '2026-06-23T11:00:00.000Z',
    rollbackTarget: 'construction-org-plan-network-release:project-1:previous',
    rollbackWriterRefs: ['constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft'],
    existingImpactMonitoring: false,
    existingRollbackVerification: false,
    ...overrides,
  }
}

describe('constructionOrganizationPlanNetworkRuntimeEvidenceJob', () => {
  beforeEach(() => {
    runtimeMocks.runJobWithRetry.mockClear()
    runtimeMocks.runWithJobLease.mockClear()
  })

  it('runs retryable sweeps only while holding the distributed job lease', () => {
    const jobSource = readFileSync(
      new URL('../jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.ts', import.meta.url),
      'utf8',
    )
    const executeSource = jobSource.slice(jobSource.indexOf("private async execute(triggeredBy"))

    expect(jobSource).toContain("import { runJobWithRetry, runWithJobLease } from '../services/jobRuntime.js'")
    expect(executeSource).toContain('const execution = await runJobWithRetry(')
    expect(executeSource).toContain('async (_attempt, attemptContext) => runWithJobLease(')
    expect(executeSource).toContain("jobName: 'constructionOrganizationPlanNetworkRuntimeEvidenceJob'")
    expect(executeSource).toContain('triggeredBy,')
    expect(executeSource).toContain('jobId,')
    expect(executeSource.match(/lease\.assertActive\(\)/g)).toHaveLength(3)
    expect(executeSource).toContain('const sweep = this.options.sweep ?? runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep')
    expect(executeSource).toContain('const withTransaction = this.options.withTransaction ?? withDatabaseTransaction')
    expect(executeSource).toContain('AbortSignal.any([attemptContext.signal, lease.signal])')
    expect(executeSource).toContain('const value = await withTransaction(async () => {')
    expect(executeSource).toContain('requireCompleteConstructionOrganizationPlanNetworkRuntimeEvidence(')
    expect(executeSource).toContain('await sweep({ ...this.options, signal })')
    expect(executeSource).toContain('if (!leaseRun.acquired)')
    expect(executeSource).toContain('const { attempts } = execution')
  })

  it('is registered in the scheduler and manual jobs route', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const jobsRouteSource = readFileSync(new URL('../routes/jobs.ts', import.meta.url), 'utf8')

    expect(schedulerSource).toContain("import { constructionOrganizationPlanNetworkRuntimeEvidenceJob } from './jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js'")
    expect(schedulerSource).toContain('constructionOrganizationPlanNetworkRuntimeEvidenceJob.start()')
    expect(schedulerSource).toContain('constructionOrganizationPlanNetworkRuntimeEvidenceJob.stop()')
    expect(jobsRouteSource).toContain("import { constructionOrganizationPlanNetworkRuntimeEvidenceJob } from '../jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js'")
    expect(jobsRouteSource).toContain("name: 'constructionOrganizationPlanNetworkRuntimeEvidenceJob'")
    expect(jobsRouteSource).toContain("case 'constructionOrganizationPlanNetworkRuntimeEvidenceJob'")
    expect(jobsRouteSource).toContain('result: await constructionOrganizationPlanNetworkRuntimeEvidenceJob.executeNow()')
  })

  it('records post-publication impact monitoring and rollback verification for runtime-adopted plan networks', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: `event-${calls.length}` }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [buildCandidate()],
    })

    expect(result).toEqual({
      source: 'construction_organization_plan_network_runtime_evidence_job',
      total: 1,
      monitored: 1,
      impactMonitoringRecorded: 1,
      rollbackVerificationRecorded: 1,
      runtimeEngineEvidenceRecorded: 0,
      skipped: 0,
      failed: 0,
    })
    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.params[0])).toEqual(['impact_monitoring', 'rollback_execution'])
    expect(calls.map((call) => call.params[1])).toEqual(['monitoring_passed', 'rollback_executed'])
    for (const call of calls) {
      expect(String(call.sql)).toContain('INSERT INTO public.construction_organization_plan_network_runtime_events')
      expect(call.params[2]).toBe('construction-org-plan-network-release:project-1:option-ready')
      expect(call.params[3]).toEqual(expect.objectContaining({
        businessType: 'hospital',
        useCase: 'accelerationRecovery',
        projectId: '00000000-0000-4000-8000-000000000001',
        draftNetworkKey: 'draft-network-ready',
        optionId: 'option-ready',
        outcomeRef: 'committed-plan:project-1:revision-8',
        recommendationDecisionAction: 'adopted',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }))
    }
    expect(calls[0].params[3]).toEqual(expect.objectContaining({
      monitoredConsumerCount: 2,
      regressionDetected: false,
    }))
    expect(calls[1].params[3]).toEqual(expect.objectContaining({
      rollbackTarget: 'construction-org-plan-network-release:project-1:previous',
      rollbackVerificationMode: 'path_verified_no_runtime_reversal',
    }))
  })

  it('retries partial evidence only after the transaction rolls back earlier candidate writes', async () => {
    const committedWrites: string[] = []
    let transactionCallCount = 0
    const withTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
      transactionCallCount += 1
      const savepoint = committedWrites.length
      try {
        return await work()
      } catch (error) {
        committedWrites.splice(savepoint)
        throw error
      }
    }
    const completeResult = {
      source: 'construction_organization_plan_network_runtime_evidence_job' as const,
      total: 2,
      monitored: 2,
      impactMonitoringRecorded: 2,
      rollbackVerificationRecorded: 2,
      runtimeEngineEvidenceRecorded: 0,
      skipped: 0,
      failed: 0,
    }
    const sweep = vi.fn()
      .mockImplementationOnce(async () => {
        committedWrites.push('publication-a-events')
        return {
          ...completeResult,
          monitored: 1,
          impactMonitoringRecorded: 1,
          rollbackVerificationRecorded: 1,
          failed: 1,
        }
      })
      .mockImplementationOnce(async () => {
        committedWrites.push('publication-a-events', 'publication-b-events')
        return completeResult
      })
    const job = new ConstructionOrganizationPlanNetworkRuntimeEvidenceJob({ sweep, withTransaction })

    await expect(job.executeNow()).resolves.toEqual(completeResult)

    expect(sweep).toHaveBeenCalledTimes(2)
    expect(transactionCallCount).toBe(2)
    expect(committedWrites).toEqual(['publication-a-events', 'publication-b-events'])
  })

  it('records missing E1/E3/E5 runtime engine evidence from verified runtime-adopted plan networks', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: `evidence-${calls.length}` }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [buildCandidate({
        existingImpactMonitoring: true,
        existingRollbackVerification: true,
        runtimeEngineMeasurements: [
          { engineCode: 'standard_duration_reference', predictedDurationDays: 180, actualDurationDays: 184 },
          { engineCode: 'critical_path_cpm', predictedDurationDays: 176, actualDurationDays: 184 },
          { engineCode: 'schedule_acceleration_target', predictedDurationDays: 170, actualDurationDays: 184 },
        ],
      })],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      impactMonitoringRecorded: 0,
      rollbackVerificationRecorded: 0,
      runtimeEngineEvidenceRecorded: 3,
      skipped: 0,
      failed: 0,
    }))

    const accuracyCalls = calls.filter((call) =>
      String(call.sql).includes('INSERT INTO public.duration_algorithm_accuracy_events'),
    )
    expect(accuracyCalls).toHaveLength(3)
    expect(accuracyCalls.map((call) => call.params[2]).sort()).toEqual([
      'critical_path_cpm',
      'schedule_acceleration_target',
      'standard_duration_reference',
    ])
    for (const call of accuracyCalls) {
      expect(call.params).toEqual(expect.arrayContaining([
        '00000000-0000-4000-8000-000000000001',
        expect.objectContaining({
          source: 'construction_organization_plan_network_runtime_evidence_service',
          runtimeEngineEvidenceSource: 'verified_runtime_adopted_plan_network_measurement',
          assetKey: 'construction_organization_plan_network',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          projectId: '00000000-0000-4000-8000-000000000001',
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      ]))
    }
  })

  it('does not fabricate E1/E3/E5 runtime engine evidence without measured prediction and actual durations', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: `event-${calls.length}` }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [buildCandidate()],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      impactMonitoringRecorded: 1,
      rollbackVerificationRecorded: 1,
      runtimeEngineEvidenceRecorded: 0,
      skipped: 0,
      failed: 0,
    }))
    expect(calls.some((call) =>
      String(call.sql).includes('INSERT INTO public.duration_algorithm_accuracy_events'),
    )).toBe(false)
  })

  it('does not fabricate monitoring or rollback evidence without saved outcome, consumer observation, adoption and option-network anchors', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [
        buildCandidate({ savedOutcomeObservedAt: null }),
        buildCandidate({ consumerObservationCount: 0 }),
        buildCandidate({ recommendationDecisionAction: 'declined' }),
        buildCandidate({ draftNetworkKey: '', optionId: '' }),
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 4,
      monitored: 0,
      impactMonitoringRecorded: 0,
      rollbackVerificationRecorded: 0,
      skipped: 4,
      failed: 0,
    }))
    expect(calls).toEqual([])
  })

  it('does not accept direct sweep candidates unless the site-adoption identity has been verified', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [
        buildCandidate({ recommendationDecisionIdentityVerified: false }),
        buildCandidate({ recommendationDecisionIdentityVerified: null }),
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 2,
      monitored: 0,
      impactMonitoringRecorded: 0,
      rollbackVerificationRecorded: 0,
      skipped: 2,
      failed: 0,
    }))
    expect(calls).toEqual([])
  })

  it('does not accept direct sweep candidates unless saved outcome and consumer observation identities are verified', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = await runConstructionOrganizationPlanNetworkRuntimeEvidenceSweep({
      queryExec,
      executedAt: '2026-06-24T05:50:00.000Z',
      candidates: [
        buildCandidate({ savedOutcomeIdentityVerified: false }),
        buildCandidate({ consumerObservationIdentityVerified: false }),
        buildCandidate({ savedOutcomeIdentityVerified: null, consumerObservationIdentityVerified: null }),
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 3,
      monitored: 0,
      impactMonitoringRecorded: 0,
      rollbackVerificationRecorded: 0,
      skipped: 3,
      failed: 0,
    }))
    expect(calls).toEqual([])
  })

  it('collects candidates only from project and option-network matched consumer observations', async () => {
    let observedSql = ''
    const queryExec = async <T = Record<string, unknown>>(sql: string, _params: unknown[] = []): Promise<T[]> => {
      observedSql = sql
      return [] as T[]
    }

    await collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)

    expect(observedSql).toContain("rco.observation_context->>'projectId' = p.project_id")
    expect(observedSql).toContain("rco.observation_context->>'draftNetworkKey' = p.draft_network_key")
    expect(observedSql).toContain("rco.observation_context->>'optionId' =")
  })

  it('collects candidates only from site adoption decisions with matching option-network identity', async () => {
    let observedSql = ''
    const queryExec = async <T = Record<string, unknown>>(sql: string, _params: unknown[] = []): Promise<T[]> => {
      observedSql = sql
      return [] as T[]
    }

    await collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)

    expect(observedSql).toContain("a.action_context->>'projectId' = p.project_id")
    expect(observedSql).toContain("a.action_context->>'draftNetworkKey' = p.draft_network_key")
    expect(observedSql).toContain("a.action_context->>'optionId' =")
  })

  it('rejects collected rows when the adoption action lacks matching option-network identity', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([])
  })

  it('rejects collected rows when the saved outcome lacks matching option-network identity', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([])
  })

  it('rejects collected rows when the consumer observation lacks business type attribution', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([])
  })

  it('rejects collected rows when evidence sources declare different product entry use cases', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([])
  })

  it('accepts collected rows when every evidence source carries the same draft-only identity', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:draft-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:draft-ready',
          draftNetworkKey: 'draft-network-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:draft-ready',
          draftNetworkKey: 'draft-network-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([
      expect.objectContaining({
        publicationKey: 'construction-org-plan-network-release:project-1:draft-ready',
        projectId: '00000000-0000-4000-8000-000000000001',
        businessType: 'hospital',
        draftNetworkKey: 'draft-network-ready',
        optionId: null,
        recommendationDecisionAction: 'adopted',
        recommendationDecisionIdentityVerified: true,
      }),
    ])
  })

  it('accepts collected rows when one evidence source has draft-only identity and another also declares option', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([
      expect.objectContaining({
        draftNetworkKey: 'draft-network-ready',
        optionId: 'option-ready',
        savedOutcomeIdentityVerified: true,
        consumerObservationIdentityVerified: true,
        recommendationDecisionIdentityVerified: true,
      }),
    ])
  })

  it('rejects collected rows when an evidence source has a conflicting declared option identity', async () => {
    const queryExec = async <T = Record<string, unknown>>(_sql: string, _params: unknown[] = []): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'wrong-option',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[]

    await expect(collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(queryExec)).resolves.toEqual([])
  })

  it('does not treat existing monitoring or rollback rows without business type as matched evidence', async () => {
    const collected = await collectConstructionOrganizationPlanNetworkRuntimeEvidenceCandidates(async <T = Record<string, unknown>>(): Promise<T[]> => [
      {
        publication_key: 'construction-org-plan-network-release:project-1:option-ready',
        project_id: '00000000-0000-4000-8000-000000000001',
        draft_network_key: 'draft-network-ready',
        rollback_target: 'construction-org-plan-network-release:project-1:previous',
        published_at: '2026-06-23T09:00:00.000Z',
        outcome_ref: 'committed-plan:project-1:revision-8',
        outcome_metadata: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        outcome_observed_at: '2026-06-23T10:00:00.000Z',
        consumer_observation_count: 1,
        observation_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        action_type: 'adopted',
        adopted_at: '2026-06-23T11:00:00.000Z',
        action_context: {
          businessType: 'hospital',
          useCase: 'accelerationRecovery',
          projectId: '00000000-0000-4000-8000-000000000001',
          publicationKey: 'construction-org-plan-network-release:project-1:option-ready',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        impact_event_status: 'monitoring_passed',
        impact_event_payload: {
          source: 'legacy_weak_event',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
        rollback_event_status: 'rollback_executed',
        rollback_event_payload: {
          source: 'legacy_weak_event',
          projectId: '00000000-0000-4000-8000-000000000001',
          draftNetworkKey: 'draft-network-ready',
          optionId: 'option-ready',
        },
      },
    ] as T[])

    expect(collected).toEqual([
      expect.objectContaining({
        existingImpactMonitoring: false,
        existingRollbackVerification: false,
      }),
    ])
  })
})
