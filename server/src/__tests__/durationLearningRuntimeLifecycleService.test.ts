import { describe, expect, it, vi } from 'vitest'

import {
  collectDurationLearningRuntimeCandidateProposals,
  collectDurationLearningRuntimeMonitoringCandidates,
  expandDurationLearningRuntimeCandidateScopes,
  runDurationLearningRuntimeLifecycleSweep,
  type DurationLearningRuntimeCandidateProposal,
} from '../services/durationLearningRuntimeLifecycleService.js'
import { createInMemoryDurationContextPolicyLearningCheckpointStore } from '../services/durationContextPolicyLearningCheckpointService.js'

function benchmarkProposal(input: {
  projectId: string
  companyId: string
  industryKey: string
  sampleCount?: number
}): DurationLearningRuntimeCandidateProposal {
  return {
    proposalKey: `benchmark:${input.projectId}`,
    assetKey: 'base_duration_benchmark',
    artifactKey: 'SW-CONCRETE:process:all',
    scope: {
      level: 'project',
      companyId: input.companyId,
      projectId: input.projectId,
    },
    runtimePayload: {
      p50Days: 8,
      p80Days: 11,
      durationDayBasis: 'construction_production_day',
    },
    sourceCandidateRefs: [`duration_benchmarks:${input.projectId}`],
    sourceEvidenceRefs: [`duration_experience_samples:${input.projectId}`],
    sampleCount: input.sampleCount ?? 5,
    projectIds: [input.projectId],
    companyIds: [input.companyId],
    industryKeys: [input.industryKey],
    conflictCount: 0,
    replayPassed: true,
  }
}

describe('durationLearningRuntimeLifecycleService', () => {
  it('binds monitoring accuracy to every canonical runtime-publication lineage key', async () => {
    let capturedSql = ''
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      capturedSql = sql
      return [] as T[]
    }

    await collectDurationLearningRuntimeMonitoringCandidates(queryExec)

    expect(capturedSql).toContain("source.prediction_context ->> 'runtimePublicationKey'")
    expect(capturedSql).toContain("source.prediction_context ->> 'runtime_publication_key'")
    expect(capturedSql).toContain("source.prediction_context ->> 'publicationKey'")
    expect(capturedSql).toContain("source.prediction_context ->> 'publication_key'")
    expect(capturedSql).toContain("source.prediction_context -> 'runtimePublicationKeys' ? publication.publication_key")
    expect(capturedSql).toContain("observation.observation_context -> 'appliedTaskIds'")
    expect(capturedSql).toContain("outcome.metadata -> 'auto_task_ids'")
  })

  it('normalizes canonical database candidates and keeps underpowered evidence in automatic collection', async () => {
    const calls: string[] = []
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      calls.push(sql)
      if (sql.includes('from public.duration_benchmarks')) {
        return [{
          id: 'benchmark-1',
          benchmark_key: 'SW-CONCRETE:process:all',
          company_id: 'c1',
          project_id: 'p1',
          business_type: 'residential',
          sample_count: 5,
          p50_days: 8,
          p80_days: 11,
          duration_day_basis: 'construction_production_day',
          metadata: {
            task_ids: ['t1', 't2'],
            real_outcome_count: 5,
            replay_case_count: 5,
            observation_window_days: 7,
            mae_before: 4,
            mae_after: 3,
            conflict_rate: 0,
            overcompensation_rate: 0,
            rollback_ready: true,
            tenant_scope_valid: true,
          },
        }] as T[]
      }
      return [] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toEqual(expect.objectContaining({
      assetKey: 'base_duration_benchmark',
      artifactKey: 'SW-CONCRETE:process:all',
      scope: { level: 'project', companyId: 'c1', projectId: 'p1' },
      policyEvaluationRequired: true,
      automationDecision: expect.objectContaining({
        stage: 'collecting',
        autoPromotionAllowed: false,
      }),
    }))
    expect(calls).toHaveLength(3)
    expect(calls.join('\n')).toContain("candidate.status in ('pending', 'candidate_only', 'auto_published')")
    expect(calls.join('\n')).toContain('coalesce(candidate.company_id, project.company_id) as resolved_company_id')
    expect(calls.join('\n')).toContain("outcome.publication_key is null")
  })

  it('does not publish a production candidate while its automatic policy is still collecting', async () => {
    const persistPublication = vi.fn()
    const proposal = benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' })
    proposal.policyEvaluationRequired = true
    proposal.automationDecision = {
      stage: 'collecting',
      autoPromotionAllowed: false,
      manualReviewRequired: false,
      reasonCodes: ['valid_change_count_below_project_canary_floor'],
    }

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
    })

    expect(result.candidateCollecting).toBe(1)
    expect(result.manualFallback).toBe(0)
    expect(persistPublication).not.toHaveBeenCalled()
  })

  it('materializes an industry proposal from real cross-project evidence without prematurely creating a global proposal', () => {
    const proposals = [
      benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p2', companyId: 'c1', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p3', companyId: 'c2', industryKey: 'residential' }),
      benchmarkProposal({ projectId: 'p4', companyId: 'c2', industryKey: 'residential' }),
    ]

    const expanded = expandDurationLearningRuntimeCandidateScopes(proposals)

    expect(expanded).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'base_duration_benchmark',
        artifactKey: 'SW-CONCRETE:process:all',
        scope: { level: 'industry', industryKey: 'residential' },
        sampleCount: 20,
        projectIds: ['p1', 'p2', 'p3', 'p4'],
        companyIds: ['c1', 'c2'],
      }),
    ]))
    expect(expanded.some((proposal) => proposal.scope.level === 'global')).toBe(false)
  })

  it('opens the global learning scope only with cross-industry evidence that satisfies global automation floors', () => {
    const proposals = Array.from({ length: 100 }, (_, projectIndex) => {
      const projectId = `p${projectIndex + 1}`
      const proposal = benchmarkProposal({
        projectId,
        companyId: `c${Math.floor(projectIndex / 10) + 1}`,
        industryKey: projectIndex < 50 ? 'residential' : 'industrial',
        sampleCount: 10,
      })
      proposal.taskIds = Array.from({ length: 5 }, (_, taskIndex) => `${projectId}-t${taskIndex + 1}`)
      proposal.realOutcomeCount = 5
      proposal.replayCaseCount = 10
      proposal.observationWindowDays = 90
      proposal.policyEvaluationRequired = true
      proposal.automationEvidence = {
        maeBefore: 8,
        maeAfter: 6,
        conflictRate: 0,
        overcompensationRate: 0,
        rollbackReady: true,
        tenantScopeValid: true,
      }
      return proposal
    })

    const global = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'global')

    expect(global).toEqual(expect.objectContaining({
      scope: { level: 'global' },
      projectIds: expect.arrayContaining(['p1', 'p100']),
      companyIds: ['c1', 'c10', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'],
      industryKeys: ['industrial', 'residential'],
      automationDecision: expect.objectContaining({
        reuseScope: 'global',
        targetStage: 'canary',
        stage: 'auto_canary',
        autoPromotionAllowed: true,
      }),
    }))
  })

  it('aggregates different project benchmark values into one weighted industry payload', () => {
    const proposals = [
      benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p2', companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p3', companyId: 'c2', industryKey: 'residential', sampleCount: 10 }),
      benchmarkProposal({ projectId: 'p4', companyId: 'c2', industryKey: 'residential', sampleCount: 10 }),
    ]
    proposals[0].runtimePayload = { p50Days: 8, p80Days: 11, durationDayBasis: 'construction_production_day' }
    proposals[1].runtimePayload = { p50Days: 10, p80Days: 13, durationDayBasis: 'construction_production_day' }
    proposals[2].runtimePayload = { p50Days: 9, p80Days: 12, durationDayBasis: 'construction_production_day' }
    proposals[3].runtimePayload = { p50Days: 11, p80Days: 14, durationDayBasis: 'construction_production_day' }

    const industry = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'industry')

    expect(industry).toEqual(expect.objectContaining({
      sampleCount: 40,
      runtimePayload: {
        p50Days: 10,
        p80Days: 13,
        durationDayBasis: 'construction_production_day',
      },
    }))
  })

  it('preserves signed dependency lead lag while aggregating structural rules', () => {
    const proposals = ['p1', 'p2', 'p3', 'p4'].map((projectId) => ({
      ...benchmarkProposal({ projectId, companyId: 'c1', industryKey: 'residential', sampleCount: 10 }),
      proposalKey: `dependency:${projectId}`,
      assetKey: 'dependency_rule_candidate' as const,
      artifactKey: 'SW-A->SW-B:FS',
      runtimePayload: {
        predecessorCode: 'SW-A',
        successorCode: 'SW-B',
        dependencyType: 'FS',
        lagDays: -2,
        durationDayBasis: 'construction_production_day',
      },
    }))

    const company = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'company')

    expect(company?.runtimePayload).toEqual(expect.objectContaining({ lagDays: -2 }))
  })

  it('blocks WBS aggregation when project candidates describe incompatible node sets', () => {
    const proposals = ['p1', 'p2'].map((projectId, index) => ({
      ...benchmarkProposal({ projectId, companyId: 'c1', industryKey: 'residential', sampleCount: 20 }),
      proposalKey: `wbs:${projectId}`,
      assetKey: 'wbs_reference_days' as const,
      artifactKey: 'template-residential',
      runtimePayload: {
        templateId: 'template-residential',
        nodes: [{
          sourceId: index === 0 ? 'structure' : 'fitout',
          suggestedReferenceDays: 20,
        }],
        durationDayBasis: 'construction_production_day',
      },
    }))

    const company = expandDurationLearningRuntimeCandidateScopes(proposals)
      .find((proposal) => proposal.scope.level === 'company')

    expect(company?.blockingReasons).toContain('wbs_reference_days_node_set_incompatible')
  })

  it('uses stable work codes rather than project-specific outcome refs to aggregate critical-path learning', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return ['p1', 'p2', 'p3', 'p4'].map((projectId) => ({
        id: `critical-${projectId}`,
        asset_key: 'critical_path_rule_candidate',
        outcome_status: 'accepted',
        outcome_ref: `critical_path_cpm:${projectId}:project-specific-hash`,
        learning_scope: 'project',
        company_id: 'c1',
        project_id: projectId,
        business_type: 'residential',
        metadata: {
          auto_task_stable_codes: ['SW-A', 'SW-B'],
          primary_chain_stable_codes: ['SW-A', 'SW-B'],
          critical_task_count: 2,
          replay_case_count: 30,
          observation_window_days: 30,
          mae_before: 4,
          mae_after: 3,
          conflict_rate: 0,
          overcompensation_rate: 0,
          rollback_ready: true,
          tenant_scope_valid: true,
        },
      })) as T[]
    }

    const projectProposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)
    const companyProposals = expandDurationLearningRuntimeCandidateScopes(projectProposals)
      .filter((proposal) => proposal.scope.level === 'company')

    expect(new Set(projectProposals.map((proposal) => proposal.artifactKey)).size).toBe(1)
    expect(companyProposals).toHaveLength(1)
    expect(companyProposals[0]?.runtimePayload).toEqual({ criticalStableCodes: ['SW-A', 'SW-B'] })
  })

  it('keeps dependency outcomes without a construction calendar out of automatic publication', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return [{
        id: 'dependency-1',
        asset_key: 'dependency_rule_candidate',
        outcome_status: 'accepted',
        learning_scope: 'project',
        company_id: 'c1',
        project_id: 'p1',
        business_type: 'residential',
        metadata: {
          predecessor_stable_code: 'SW-A',
          successor_stable_code: 'SW-B',
          dependency_type: 'FS',
          suggested_lag_days: 2,
          duration_day_unit: 'construction_production_day',
          sample_count: 50,
        },
      }] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals[0]?.blockingReasons).toContain('dependency_construction_calendar_required')
  })

  it('accepts production-day WBS reference outcomes even when their reference semantic is also recorded', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (!sql.includes('from public.duration_plan_network_outcomes')) return [] as T[]
      return [{
        id: 'wbs-reference-1',
        asset_key: 'wbs_reference_days',
        outcome_status: 'accepted',
        learning_scope: 'project',
        company_id: 'c1',
        project_id: 'p1',
        business_type: 'residential',
        metadata: {
          template_id: 'template-1',
          day_count_basis: 'construction_production_day',
          reference_day_basis: 'wbs_template_reference_days',
          production_day_conversion_applied: true,
          sample_task_count: 30,
          nodes: [{ sourceId: 'node-1', suggestedReferenceDays: 8 }],
        },
      }] as T[]
    }

    const proposals = await collectDurationLearningRuntimeCandidateProposals(queryExec)

    expect(proposals[0]?.blockingReasons).toEqual([])
  })

  it('publishes a ready learned asset to canary only and preserves complete source lineage', async () => {
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const promoteCanary = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [benchmarkProposal({
        projectId: 'p1',
        companyId: 'c1',
        industryKey: 'residential',
      })],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      promoteCanary: promoteCanary as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.canaryPublished).toBe(1)
    expect(result.stablePromoted).toBe(0)
    expect(persistPublication).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: 'base_duration_benchmark',
      artifactKey: 'SW-CONCRETE:process:all',
      stage: 'canary',
      scope: { level: 'project', companyId: 'c1', projectId: 'p1' },
      sourceCandidateRefs: ['duration_benchmarks:p1'],
      sourceEvidenceRefs: ['duration_experience_samples:p1'],
    }))
    expect(promoteCanary).not.toHaveBeenCalled()
  })

  it('checkpoints a published proposal so a later sweep reuses it without recounting or rewriting', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const proposal = benchmarkProposal({
      projectId: 'p1',
      companyId: 'c1',
      industryKey: 'residential',
    })

    const first = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-a',
      observedAt: '2026-07-17T00:00:00.000Z',
    })
    const retried = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [proposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-b',
      observedAt: '2026-07-18T00:00:00.000Z',
    })

    expect(first.canaryPublished).toBe(1)
    expect(first.candidateCheckpointReused).toBe(0)
    expect(retried.canaryPublished).toBe(0)
    expect(retried.candidateCheckpointReused).toBe(1)
    expect(persistPublication).toHaveBeenCalledTimes(1)
  })

  it('creates a new publication checkpoint when the learned payload changes', async () => {
    const checkpointStore = createInMemoryDurationContextPolicyLearningCheckpointStore()
    const persistPublication = vi.fn(async (input: any) => ({
      status: 'published' as const,
      publication: {
        publicationKey: input.publicationKey,
        publicationStage: input.stage,
      },
      reasons: [] as [],
    }))
    const firstProposal = benchmarkProposal({
      projectId: 'p1',
      companyId: 'c1',
      industryKey: 'residential',
    })
    const changedProposal = {
      ...firstProposal,
      runtimePayload: {
        ...firstProposal.runtimePayload,
        p50Days: 9,
      },
    }

    await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [firstProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-a',
    })
    const changed = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [changedProposal],
      monitoringProvider: async () => [],
      persistPublication: persistPublication as any,
      checkpointStore,
      checkpointOwnerId: 'worker-b',
    })

    expect(changed.canaryPublished).toBe(1)
    expect(changed.candidateCheckpointReused).toBe(0)
    expect(persistPublication).toHaveBeenCalledTimes(2)
    expect(new Set(persistPublication.mock.calls.map(([input]) => input.publicationKey)).size).toBe(2)
  })

  it('promotes a measured canary after its monitoring window', async () => {
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const promoteCanary = vi.fn(async () => ({
      status: 'stable_promoted',
      previousPublicationKey: 'stable-0',
      reasons: [],
    }))
    const rollbackPublication = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:canary-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'canary',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 80,
        observedCount: 12,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 8,
        maeBefore: 8,
        maeAfter: 6,
        regressionRate: 0,
        sourceAutomationDecision: {
          experienceTier: 'T2',
          factSource: 'actual_outcome',
          observed: {
            validChangeCount: 220,
            distinctTaskCount: 120,
            distinctProjectCount: 45,
            distinctCompanyCount: 1,
            realOutcomeCount: 110,
            replayCaseCount: 220,
            observationWindowDays: 60,
            overcompensationRate: 0,
            rollbackReady: true,
            tenantScopeValid: true,
          },
        },
      }],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
      rollbackPublication: rollbackPublication as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.monitoringPassed).toBe(1)
    expect(result.stablePromoted).toBe(1)
    expect(recordImpact).toHaveBeenCalledWith(expect.objectContaining({
      monitoringStatus: 'passed',
      metrics: expect.objectContaining({ accuracySampleCount: 8, maeBefore: 8, maeAfter: 6 }),
    }))
    expect(promoteCanary).toHaveBeenCalledOnce()
    expect(rollbackPublication).not.toHaveBeenCalled()
  })

  it('keeps a measured canary collecting until the stable automation policy is satisfied', async () => {
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const promoteCanary = vi.fn()

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:underpowered-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'canary',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 80,
        observedCount: 12,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 8,
        maeBefore: 8,
        maeAfter: 6,
        regressionRate: 0,
        sourceAutomationDecision: {
          experienceTier: 'T2',
          factSource: 'actual_outcome',
          observed: {
            validChangeCount: 100,
            distinctTaskCount: 50,
            distinctProjectCount: 20,
            distinctCompanyCount: 1,
            realOutcomeCount: 50,
            replayCaseCount: 100,
            observationWindowDays: 30,
            overcompensationRate: 0,
            rollbackReady: true,
            tenantScopeValid: true,
          },
        },
      } as any],
      recordImpact: recordImpact as any,
      promoteCanary: promoteCanary as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.monitoringPending).toBe(1)
    expect(result.monitoringPassed).toBe(0)
    expect(result.stablePromoted).toBe(0)
    expect(promoteCanary).not.toHaveBeenCalled()
    expect(recordImpact).toHaveBeenCalledWith(expect.objectContaining({
      monitoringStatus: 'collecting',
      metrics: expect.objectContaining({
        stableAutomationDecision: expect.objectContaining({
          targetStage: 'stable',
          stage: 'collecting',
          reasonCodes: expect.arrayContaining([
            'valid_change_count_below_company_stable_floor',
            'observation_window_days_below_company_stable_floor',
          ]),
        }),
      }),
    }))
  })

  it('rolls back a regressing publication and routes structural conflicts to human fallback', async () => {
    const persistPublication = vi.fn()
    const recordImpact = vi.fn(async () => ({ status: 'impact_recorded', reasons: [] }))
    const rollbackPublication = vi.fn(async () => ({
      status: 'rollback_executed',
      restoredPublicationKey: 'stable-0',
      reasons: [],
    }))
    const conflictProposal: DurationLearningRuntimeCandidateProposal = {
      ...benchmarkProposal({ projectId: 'p1', companyId: 'c1', industryKey: 'residential' }),
      proposalKey: 'dependency-conflict',
      assetKey: 'dependency_rule_candidate',
      artifactKey: 'A->B:FS',
      runtimePayload: {
        predecessorCode: 'A',
        successorCode: 'B',
        dependencyType: 'FS',
        lagDays: 1,
      },
      conflictCount: 1,
    }

    const result = await runDurationLearningRuntimeLifecycleSweep({
      candidateProvider: async () => [conflictProposal],
      monitoringProvider: async () => [{
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:bad-1',
        assetKey: 'base_duration_benchmark',
        publicationStage: 'stable',
        scopeLevel: 'company',
        monitoringWindowHours: 72,
        monitoringElapsedHours: 90,
        observedCount: 10,
        rejectedObservationCount: 0,
        acceptedOutcomeCount: 0,
        weakOrRejectedOutcomeCount: 0,
        accuracySampleCount: 10,
        maeBefore: 5,
        maeAfter: 8,
        regressionRate: 0.3,
      }],
      persistPublication: persistPublication as any,
      recordImpact: recordImpact as any,
      rollbackPublication: rollbackPublication as any,
      observedAt: '2026-07-17T00:00:00.000Z',
    })

    expect(result.manualFallback).toBe(1)
    expect(result.monitoringFailed).toBe(1)
    expect(result.rollbackExecuted).toBe(1)
    expect(persistPublication).not.toHaveBeenCalled()
    expect(rollbackPublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:bad-1',
      reason: expect.stringContaining('regression'),
    }))
  })
})
