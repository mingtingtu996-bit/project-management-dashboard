import { describe, expect, it, vi } from 'vitest'

import {
  createPendingWizardPostCommitDerivationState,
  recordWizardConstructionOrganizationRuntimeEvidence,
  runWizardPostCommitDerivations,
} from '../services/wizardPostCommitDerivationRecoveryService.js'

describe('wizard post-commit derivation recovery service', () => {
  it('retries only the failed derivation and keeps succeeded stages idempotent', async () => {
    let state = createPendingWizardPostCommitDerivationState({
      projectId: 'project-1',
      generationBatchId: 'batch-1',
      createdAt: '2026-07-11T08:00:00.000Z',
    })
    const persistState = vi.fn(async (next) => { state = next })
    const criticalPath = vi.fn()
      .mockRejectedValueOnce(new Error('CPM unavailable'))
      .mockResolvedValueOnce({ criticalTaskCount: 3 })
    const durationEvidence = vi.fn(async () => ({ evidenceCount: 2 }))

    const first = await runWizardPostCommitDerivations({
      state,
      now: () => '2026-07-11T08:01:00.000Z',
      persistState,
      derivations: {
        critical_path: criticalPath,
        duration_evidence: durationEvidence,
      },
    })

    expect(first.status).toBe('pending')
    expect(first.stages.critical_path).toEqual(expect.objectContaining({
      status: 'pending',
      attemptCount: 1,
      lastError: 'CPM unavailable',
    }))
    expect(first.stages.duration_evidence).toEqual(expect.objectContaining({
      status: 'succeeded',
      attemptCount: 1,
      output: { evidenceCount: 2 },
    }))

    const second = await runWizardPostCommitDerivations({
      state: first,
      now: () => '2026-07-11T08:02:00.000Z',
      persistState,
      derivations: {
        critical_path: criticalPath,
        duration_evidence: durationEvidence,
      },
    })

    expect(second.status).toBe('succeeded')
    expect(second.stages.critical_path).toEqual(expect.objectContaining({
      status: 'succeeded',
      attemptCount: 2,
      output: { criticalTaskCount: 3 },
    }))
    expect(criticalPath).toHaveBeenCalledTimes(2)
    expect(durationEvidence).toHaveBeenCalledTimes(1)

    await runWizardPostCommitDerivations({
      state: second,
      persistState,
      derivations: {
        critical_path: criticalPath,
        duration_evidence: durationEvidence,
      },
    })
    expect(criticalPath).toHaveBeenCalledTimes(2)
    expect(durationEvidence).toHaveBeenCalledTimes(1)
    expect(persistState).toHaveBeenCalled()
  })

  it('marks a repeatedly failing derivation terminal only after the configured attempt limit', async () => {
    let state = createPendingWizardPostCommitDerivationState({
      projectId: 'project-2',
      generationBatchId: 'batch-2',
    })
    const criticalPath = vi.fn(async () => { throw new Error('cycle detected') })
    const durationEvidence = vi.fn(async () => ({ evidenceCount: 1 }))
    const persistState = async (next: typeof state) => { state = next }

    state = await runWizardPostCommitDerivations({
      state,
      maxAttempts: 2,
      persistState,
      derivations: {
        critical_path: criticalPath,
        duration_evidence: durationEvidence,
      },
    })
    expect(state.status).toBe('pending')

    state = await runWizardPostCommitDerivations({
      state,
      maxAttempts: 2,
      persistState,
      derivations: {
        critical_path: criticalPath,
        duration_evidence: durationEvidence,
      },
    })
    expect(state.status).toBe('failed')
    expect(state.stages.critical_path).toEqual(expect.objectContaining({
      status: 'failed',
      attemptCount: 2,
      lastError: 'cycle detected',
    }))
    expect(durationEvidence).toHaveBeenCalledTimes(1)
  })

  it('links a published construction organization runtime call and observation from the wizard post-commit entry', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.algorithm_asset_candidate_events')) {
        return [{
          candidate_payload: {
            option: {
              optionId: 'option-ready',
              businessType: 'hospital',
              draftNetworkKey: 'draft-network-ready',
              publicationKey: 'construction_org_plan_network_runtime:project-1:option-ready',
              selectedScenarioIds: ['hospital-live-campus'],
            },
          },
          event_status: 'runtime_published',
        }] as T[]
      }
      return [{ id: `write-${calls.length}` }] as T[]
    }

    const result = await recordWizardConstructionOrganizationRuntimeEvidence({
      projectId: 'project-1',
      companyId: 'company-1',
      scenario: {
        factBasis: { businessType: 'hospital' },
        recommendedPlanOption: {
          optionId: 'option-ready',
          draftNetworkKey: 'draft-network-ready',
        },
      },
      summary: {
        scenarioRecommendations: {
          newProjectPlanning: {
            optionId: 'option-ready',
            selectedScenarioIds: ['hospital-live-campus'],
          },
        },
      },
      generationBatchId: 'batch-1',
      capturedAt: '2026-07-14T08:00:00.000Z',
      actorId: 'user-1',
      queryExec,
    })

    expect(calls).toHaveLength(5)
    expect(calls[0].sql).toContain('FROM public.algorithm_asset_candidate_events')
    expect(calls[1].sql.toLowerCase()).toContain('insert into public.recommendation_actions')
    expect(calls[2].sql.toLowerCase()).toContain('insert into public.duration_plan_network_outcomes')
    expect(calls[3].sql.toLowerCase()).toContain('insert into public.runtime_consumer_runtime_calls')
    expect(calls[4].sql.toLowerCase()).toContain('insert into public.runtime_consumer_observations')
    expect(calls[3].params).toEqual(expect.arrayContaining([
      'projectWizard',
      'projectWizard:commitWizardGeneration',
    ]))
    expect(calls[3].sql).toContain('$4::jsonb')
    expect(calls[3].sql).toContain('$5::jsonb')
    expect(JSON.parse(String(calls[3].params[3]))).toEqual(expect.objectContaining({
      projectId: 'project-1',
      runtimeArtifactCount: 1,
    }))
    expect(JSON.parse(String(calls[3].params[4]))).toEqual(expect.arrayContaining([
      'project_wizard_commit:project-1:batch-1:newProjectPlanning',
    ]))
    expect(calls[4].params).toEqual(expect.arrayContaining([
      'construction_organization_plan_network',
      'construction_org_plan_network_runtime:project-1:option-ready',
      'projectWizard',
    ]))
    expect(calls[4].sql).toContain('$6::jsonb')
    expect(calls[4].sql).toContain('$7::jsonb')
    expect(JSON.parse(String(calls[4].params[5]))).toEqual(expect.objectContaining({
      projectId: 'project-1',
      publicationKey: 'construction_org_plan_network_runtime:project-1:option-ready',
    }))
    expect(JSON.parse(String(calls[4].params[6]))).toEqual(expect.arrayContaining([
      'project_wizard_commit:project-1:batch-1:newProjectPlanning',
    ]))
    expect(result).toEqual(expect.objectContaining({
      runtimeConsumerObservation: expect.objectContaining({
        status: 'runtime_consumer_observation_recorded',
        observationPersisted: true,
        observationResult: expect.objectContaining({
          runtimeCallResult: expect.objectContaining({
            status: 'runtime_consumer_runtime_call_recorded',
          }),
        }),
      }),
    }))
  })
})
