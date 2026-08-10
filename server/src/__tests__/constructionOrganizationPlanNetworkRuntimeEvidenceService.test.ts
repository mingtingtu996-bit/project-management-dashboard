import { describe, expect, it } from 'vitest'
import {
  recordConstructionOrganizationPlanNetworkRecommendationDecision,
  recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation,
  recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence,
  recordConstructionOrganizationPlanNetworkRuntimeEvent,
  recordConstructionOrganizationPlanNetworkSavedOutcome,
} from '../services/constructionOrganizationPlanNetworkRuntimeEvidenceService.js'

function parseJsonParam<T>(call: { params: unknown[] }, index: number): T {
  return JSON.parse(String(call.params[index] ?? 'null')) as T
}

describe('constructionOrganizationPlanNetworkRuntimeEvidenceService', () => {
  it('records impact monitoring evidence for a published construction organization plan network without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'runtime-event-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
      queryExec,
      projectId: 'project-1',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      publicationKey: 'construction-org-plan-network-release:project-1',
      eventPayload: {
        businessType: 'hospital',
        useCase: 'accelerationRecovery',
        projectId: 'project-1',
        optionId: 'option-ready',
        monitoredConsumerCount: 2,
        regressionDetected: false,
      },
      executedAt: '2026-06-22T03:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_event_recorded',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      sourcePublicationKey: 'construction-org-plan-network-release:project-1',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO public.construction_organization_plan_network_runtime_events')
    expect(calls[0].params.slice(0, 4)).toEqual([
      'impact_monitoring',
      'monitoring_passed',
      'construction-org-plan-network-release:project-1',
      expect.objectContaining({
        businessType: 'hospital',
        projectId: 'project-1',
        optionId: 'option-ready',
        monitoredConsumerCount: 2,
        regressionDetected: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ])
  })

  it('blocks runtime evidence when the explicit project scope disagrees with the payload', async () => {
    const result = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
      queryExec: async () => {
        throw new Error('project scope mismatch must block before persistence')
      },
      projectId: 'project-1',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      publicationKey: 'construction-org-plan-network-release:project-1',
      eventPayload: {
        businessType: 'hospital',
        useCase: 'accelerationRecovery',
        projectId: 'project-2',
        optionId: 'option-ready',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_event_blocked',
      reasons: expect.arrayContaining(['project_scope_mismatch']),
    }))
  })

  it('blocks runtime evidence records without a publication key or allowed event type', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
      queryExec,
      projectId: 'project-1',
      eventType: 'plan_network_runtime_apply',
      eventStatus: 'runtime_published',
      publicationKey: '',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_event_blocked',
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining([
        'publication_key_required',
        'runtime_event_type_not_recordable_here',
      ]),
    }))
    expect(calls).toEqual([])
  })

  it('records saved network outcome evidence in the canonical plan-network outcome table without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'saved-outcome-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkSavedOutcome({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      outcomeStatus: 'accepted',
      outcomeRef: 'construction-org-plan-network-outcome:project-1',
      projectId: 'project-1',
      companyId: 'company-1',
      metadata: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        optionId: 'option-ready',
        observedDependencyCount: 4,
      },
      observedAt: '2026-06-22T04:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'saved_network_outcome_recorded',
      publicationKey: 'construction-org-plan-network-release:project-1',
      outcomeStatus: 'accepted',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO public.duration_plan_network_outcomes')
    expect(calls[0].params.slice(0, 6)).toEqual([
      'construction-organization-plan-network-outcome:construction-org-plan-network-release:project-1:option-ready:newProjectPlanning',
      'construction_organization_plan_network',
      'accepted',
      'construction-org-plan-network-outcome:project-1',
      'project',
      'construction_organization_plan_network_runtime_evidence_service',
    ])
    expect(calls[0].params[9]).toEqual(expect.objectContaining({
      businessType: 'hospital',
      useCase: 'newProjectPlanning',
      optionId: 'option-ready',
      observedDependencyCount: 4,
      duration_basis: 'published_network_identity_no_duration_recalculation',
      durationBasis: 'published_network_identity_no_duration_recalculation',
      production_day_conversion_applied: false,
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    }))
  })

  it('keys saved outcomes by product entry use case and option network identity so entries do not overwrite each other', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'saved-outcome-1' }] as T[]
    }

    await recordConstructionOrganizationPlanNetworkSavedOutcome({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      outcomeStatus: 'accepted',
      outcomeRef: 'construction-org-plan-network-outcome:project-1:new',
      projectId: 'project-1',
      companyId: 'company-1',
      metadata: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        optionId: 'option-ready',
        draftNetworkKey: 'draft-network-ready',
      },
      observedAt: '2026-06-22T04:00:00.000Z',
    })
    await recordConstructionOrganizationPlanNetworkSavedOutcome({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      outcomeStatus: 'accepted',
      outcomeRef: 'construction-org-plan-network-outcome:project-1:starting-line',
      projectId: 'project-1',
      companyId: 'company-1',
      metadata: {
        businessType: 'hospital',
        useCase: 'startingLineOnboarding',
        optionId: 'option-ready',
        draftNetworkKey: 'draft-network-ready',
      },
      observedAt: '2026-06-22T05:00:00.000Z',
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].params[0]).toBe('construction-organization-plan-network-outcome:construction-org-plan-network-release:project-1:draft-network-ready:option-ready:newProjectPlanning')
    expect(calls[1].params[0]).toBe('construction-organization-plan-network-outcome:construction-org-plan-network-release:project-1:draft-network-ready:option-ready:startingLineOnboarding')
  })

  it('blocks saved network outcome evidence without publication key or accepted outcome status', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkSavedOutcome({
      queryExec,
      publicationKey: '',
      outcomeStatus: 'rejected',
      outcomeRef: '',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'saved_network_outcome_blocked',
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining([
        'publication_key_required',
        'outcome_status_not_recordable',
        'outcome_ref_required',
      ]),
    }))
    expect(calls).toEqual([])
  })

  it('records E1/E3/E5 runtime engine evidence for a published construction organization plan network without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'runtime-engine-evidence-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      dedupeKey: 'construction-org-plan-network-release:project-1:critical_path_cpm',
      observedAt: '2026-06-22T05:00:00.000Z',
      metadata: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        optionId: 'option-ready',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_engine_evidence_recorded',
      publicationKey: 'construction-org-plan-network-release:project-1',
      engineCode: 'critical_path_cpm',
      evidencePersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO public.duration_algorithm_accuracy_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'project-1',
      'critical_path_cpm',
      'critical_path_project_duration',
      'construction-org-plan-network-release:project-1:critical_path_cpm',
      180,
      184,
      4,
      4,
      'backtested',
    ]))
    expect(calls[0].params).toContainEqual(expect.objectContaining({
      assetKey: 'construction_organization_plan_network',
      publicationKey: 'construction-org-plan-network-release:project-1',
      businessType: 'hospital',
      useCase: 'newProjectPlanning',
      optionId: 'option-ready',
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
  })

  it('defaults runtime engine evidence dedupe keys by use case and option network identity', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'runtime-engine-evidence-1' }] as T[]
    }

    await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      metadata: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        optionId: 'option-ready',
        draftNetworkKey: 'draft-network-ready',
      },
    })
    await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 181,
      actualDurationDays: 185,
      metadata: {
        businessType: 'hospital',
        useCase: 'startingLineOnboarding',
        optionId: 'option-ready',
        draftNetworkKey: 'draft-network-ready',
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].params[4]).toBe('construction-org-plan-network-release:project-1:critical_path_cpm:draft-network-ready:option-ready:newProjectPlanning')
    expect(calls[1].params[4]).toBe('construction-org-plan-network-release:project-1:critical_path_cpm:draft-network-ready:option-ready:startingLineOnboarding')
  })

  it('keys site adoption decisions by product entry use case and option network identity', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'recommendation-action-1' }] as T[]
    }

    await recordConstructionOrganizationPlanNetworkRecommendationDecision({
      queryExec,
      projectId: 'project-1',
      companyId: 'company-1',
      actionType: 'adopted',
      publicationKey: 'construction-org-plan-network-release:project-1',
      optionId: 'option-ready',
      draftNetworkKey: 'draft-network-ready',
      decisionContext: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
      },
    })
    await recordConstructionOrganizationPlanNetworkRecommendationDecision({
      queryExec,
      projectId: 'project-1',
      companyId: 'company-1',
      actionType: 'adopted',
      publicationKey: 'construction-org-plan-network-release:project-1',
      optionId: 'option-ready',
      draftNetworkKey: 'draft-network-ready',
      decisionContext: {
        businessType: 'hospital',
        useCase: 'startingLineOnboarding',
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].params[2]).toBe('construction_organization_plan_network:construction-org-plan-network-release:project-1:draft-network-ready:option-ready:newProjectPlanning')
    expect(calls[1].params[2]).toBe('construction_organization_plan_network:construction-org-plan-network-release:project-1:draft-network-ready:option-ready:startingLineOnboarding')
  })

  it('records product-entry runtime consumer observation for a published construction organization plan network without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'runtime-consumer-observation-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation({
      queryExec,
      projectId: 'project-1',
      publicationKey: 'construction_org_plan_network_runtime:project-1:option-ready',
      publicationStatus: 'runtime_published',
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      observedAt: '2026-06-22T06:00:00.000Z',
      observationContext: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        projectId: 'project-1',
        optionId: 'option-ready',
        draftNetworkKey: 'draft-network-ready',
        consumerTrigger: 'project_wizard_commit',
      },
      sourceEvidenceRefs: [
        'project_wizard_commit:project-1:generation-1:newProjectPlanning',
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_consumer_observation_recorded',
      publicationKey: 'construction_org_plan_network_runtime:project-1:option-ready',
      consumerKey: 'projectWizard',
      observationPersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
    }))
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('insert into public.runtime_consumer_runtime_calls')
    expect(calls[0].params.slice(0, 3)).toEqual([
      'projectWizard',
      'projectWizard:commitWizardGeneration',
      'called',
    ])
    expect(parseJsonParam(calls[0], 3)).toEqual(expect.objectContaining({
      projectId: 'project-1',
      runtimeAssetMode: 'published_artifact',
      runtimeArtifactCount: 1,
    }))
    expect(parseJsonParam(calls[0], 4)).toEqual([
      'project_wizard_commit:project-1:generation-1:newProjectPlanning',
    ])
    expect(calls[0].params.slice(5)).toEqual([
      false,
      false,
      '2026-06-22T06:00:00.000Z',
    ])
    expect(calls[1].sql).toContain('insert into public.runtime_consumer_observations')
    expect(calls[1].params.slice(0, 5)).toEqual([
      'construction_organization_plan_network',
      'construction_org_plan_network_runtime:project-1:option-ready',
      'projectWizard',
      'project_wizard_commit',
      'observed',
    ])
    expect(parseJsonParam(calls[1], 5)).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      businessType: 'hospital',
      useCase: 'newProjectPlanning',
      projectId: 'project-1',
      optionId: 'option-ready',
      draftNetworkKey: 'draft-network-ready',
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(parseJsonParam(calls[1], 6)).toEqual([
      'project_wizard_commit:project-1:generation-1:newProjectPlanning',
    ])
    expect(calls[1].params.slice(7)).toEqual([
      false,
      false,
      '2026-06-22T06:00:00.000Z',
    ])
    expect(result.observationResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 1,
      blockedCount: 0,
      runtimeCallResult: expect.objectContaining({
        status: 'runtime_consumer_runtime_call_recorded',
        canPersist: true,
      }),
    }))
  })

  it('records a call-only entry without an observation for a non-published construction organization plan network', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'runtime-consumer-call-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation({
      queryExec,
      projectId: 'project-1',
      publicationKey: 'construction_org_plan_network_runtime:project-1:option-candidate',
      publicationStatus: 'candidate',
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      observedAt: '2026-06-22T06:00:00.000Z',
      observationContext: {
        businessType: 'hospital',
        useCase: 'newProjectPlanning',
        projectId: 'project-1',
        optionId: 'option-candidate',
        draftNetworkKey: 'draft-network-candidate',
        consumerTrigger: 'project_wizard_commit',
      },
      sourceEvidenceRefs: [
        'project_wizard_commit:project-1:generation-1:newProjectPlanning',
      ],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('insert into public.runtime_consumer_runtime_calls')
    expect(parseJsonParam(calls[0], 3)).toEqual(expect.objectContaining({
      projectId: 'project-1',
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observation_blocked',
      observationPersisted: false,
      observationResult: expect.objectContaining({
        recordedCount: 0,
        blockedCount: 0,
        runtimeCallResult: expect.objectContaining({
          status: 'runtime_consumer_runtime_call_recorded',
        }),
      }),
    }))
  })

  it('blocks runtime engine evidence for unsupported engines or missing actual/predicted duration', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
      queryExec,
      publicationKey: '',
      engineCode: 'task_remaining_forecast',
      predictedDurationDays: null,
      actualDurationDays: null,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_engine_evidence_blocked',
      evidencePersisted: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining([
        'publication_key_required',
        'engine_code_not_allowed_for_construction_organization_plan_network',
        'predicted_duration_days_required',
        'actual_duration_days_required',
      ]),
    }))
    expect(calls).toEqual([])
  })

  it('blocks runtime engine evidence without a product entry use case', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
      queryExec,
      publicationKey: 'construction-org-plan-network-release:project-1',
      engineCode: 'critical_path_cpm',
      projectId: 'project-1',
      predictedDurationDays: 180,
      actualDurationDays: 184,
      metadata: {
        businessType: 'hospital',
        optionId: 'option-ready',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_engine_evidence_blocked',
      evidencePersisted: false,
      reasons: expect.arrayContaining(['use_case_required']),
    }))
    expect(calls).toEqual([])
  })

  it.each([
    'runtime_event',
    'saved_outcome',
    'recommendation_decision',
  ] as const)('blocks %s without a product entry use case', async (kind) => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = kind === 'runtime_event'
      ? await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: 'project-1',
          publicationKey: 'construction-org-plan-network-release:project-1',
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          eventPayload: {
            businessType: 'hospital',
            projectId: 'project-1',
            optionId: 'option-ready',
          },
        })
      : kind === 'saved_outcome'
        ? await recordConstructionOrganizationPlanNetworkSavedOutcome({
            queryExec,
            publicationKey: 'construction-org-plan-network-release:project-1',
            outcomeStatus: 'accepted',
            outcomeRef: 'construction-org-plan-network-outcome:project-1',
            projectId: 'project-1',
            metadata: {
              businessType: 'hospital',
              optionId: 'option-ready',
            },
          })
        : await recordConstructionOrganizationPlanNetworkRecommendationDecision({
            queryExec,
            projectId: 'project-1',
            actionType: 'adopted',
            publicationKey: 'construction-org-plan-network-release:project-1',
            optionId: 'option-ready',
            decisionContext: {
              businessType: 'hospital',
            },
          })

    expect(result).toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(['use_case_required']),
    }))
    expect(calls).toEqual([])
  })

  it('blocks site adoption decisions without a draft or option identity even when publication is present', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRecommendationDecision({
      queryExec,
      projectId: 'project-1',
      actionType: 'adopted',
      publicationKey: 'construction-org-plan-network-release:project-1',
      decisionContext: {
        businessType: 'hospital',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'recommendation_decision_blocked',
      decisionPersisted: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining(['option_network_identity_required']),
    }))
    expect(calls).toEqual([])
  })

  it('records impact monitoring evidence for a published construction organization plan network without runtime writes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'recommendation-action-1' }] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
      queryExec,
      projectId: 'project-1',
      publicationKey: 'construction-org-plan-network-release:project-1',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      eventPayload: {
        businessType: 'hospital',
        useCase: 'accelerationRecovery',
        projectId: 'project-1',
        optionId: 'option-ready',
        monitoredConsumerCount: 2,
        regressionDetected: false,
      },
      executedAt: '2026-06-22T03:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_event_recorded',
      eventType: 'impact_monitoring',
      eventStatus: 'monitoring_passed',
      sourcePublicationKey: 'construction-org-plan-network-release:project-1',
      eventPersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO public.construction_organization_plan_network_runtime_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_passed',
      'construction-org-plan-network-release:project-1',
      expect.objectContaining({
        source: 'construction_organization_plan_network_runtime_evidence_service',
        businessType: 'hospital',
        projectId: 'project-1',
        optionId: 'option-ready',
        monitoredConsumerCount: 2,
        regressionDetected: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ]))
  })

  it('blocks runtime evidence records without a publication key or allowed event type', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    const result = await recordConstructionOrganizationPlanNetworkRuntimeEvent({
      queryExec,
      projectId: 'project-1',
      publicationKey: '',
      eventType: 'plan_network_runtime_apply',
      eventStatus: '',
      eventPayload: {},
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_event_blocked',
      eventPersisted: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      reasons: expect.arrayContaining([
        'publication_key_required',
        'event_status_required',
        'runtime_event_type_not_recordable_here',
      ]),
    }))
    expect(calls).toEqual([])
  })

  it.each([
    'runtime_event',
    'saved_outcome',
    'runtime_engine_evidence',
    'recommendation_decision',
  ] as const)('blocks direct %s writes when product closeout projection evidence is supplied', async (kind) => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = kind === 'runtime_event'
      ? await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: 'project-1',
          publicationKey: 'construction-org-plan-network-release:project-1',
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          eventPayload: {
            businessType: 'hospital',
            evidenceAction: 'collect_runtime_closeout_claim_for_business_type',
          },
        })
      : kind === 'saved_outcome'
        ? await recordConstructionOrganizationPlanNetworkSavedOutcome({
            queryExec,
            publicationKey: 'construction-org-plan-network-release:project-1',
            outcomeStatus: 'accepted',
            outcomeRef: 'construction-org-plan-network-outcome:project-1',
            metadata: {
              businessType: 'hospital',
              evidenceAction: 'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
            },
          })
        : kind === 'runtime_engine_evidence'
          ? await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
              queryExec,
              publicationKey: 'construction-org-plan-network-release:project-1',
              engineCode: 'critical_path_cpm',
              predictedDurationDays: 180,
              actualDurationDays: 184,
              metadata: {
                businessType: 'hospital',
                evidenceAction: 'resolve_runtime_business_type_attribution_for_business_type',
              },
            })
          : await recordConstructionOrganizationPlanNetworkRecommendationDecision({
              queryExec,
              projectId: 'project-1',
              actionType: 'adopted',
              optionId: 'option-ready',
              decisionContext: {
                businessType: 'hospital',
                evidenceAction: 'resolve_runtime_business_type_conflict_for_business_type',
              },
            })

    expect(result).toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(['product_outcome_projection_evidence_action_must_not_write_runtime_evidence']),
    }))
    expect(calls).toEqual([])
  })

  it.each([
    'runtime_event',
    'saved_outcome',
    'runtime_engine_evidence',
    'recommendation_decision',
  ] as const)('blocks direct %s writes without project, publication, and option network anchors', async (kind) => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = kind === 'runtime_event'
      ? await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: '',
          publicationKey: 'construction-org-plan-network-release:project-1',
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          eventPayload: {
            businessType: 'hospital',
          },
        })
      : kind === 'saved_outcome'
        ? await recordConstructionOrganizationPlanNetworkSavedOutcome({
            queryExec,
            publicationKey: 'construction-org-plan-network-release:project-1',
            outcomeStatus: 'accepted',
            outcomeRef: 'construction-org-plan-network-outcome:project-1',
            metadata: {
              businessType: 'hospital',
            },
          })
        : kind === 'runtime_engine_evidence'
          ? await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
              queryExec,
              publicationKey: 'construction-org-plan-network-release:project-1',
              engineCode: 'critical_path_cpm',
              predictedDurationDays: 180,
              actualDurationDays: 184,
              metadata: {
                businessType: 'hospital',
              },
            })
          : await recordConstructionOrganizationPlanNetworkRecommendationDecision({
              queryExec,
              projectId: 'project-1',
              actionType: 'adopted',
              optionId: 'option-ready',
              decisionContext: {
                businessType: 'hospital',
              },
            })

    const expectedReasons = kind === 'recommendation_decision'
      ? ['publication_key_required']
      : ['project_id_required', 'option_network_identity_required']
    expect(result).toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(expectedReasons),
    }))
    expect(calls).toEqual([])
  })

  it.each([
    'runtime_event',
    'saved_outcome',
    'runtime_engine_evidence',
    'recommendation_decision',
  ] as const)('blocks %s without structured business type attribution', async (kind) => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ id: 'should-not-write' }] as T[]
    }

    const result = kind === 'runtime_event'
      ? await recordConstructionOrganizationPlanNetworkRuntimeEvent({
          queryExec,
          projectId: 'project-1',
          publicationKey: 'construction-org-plan-network-release:project-1',
          eventType: 'impact_monitoring',
          eventStatus: 'monitoring_passed',
          eventPayload: {},
        })
      : kind === 'saved_outcome'
        ? await recordConstructionOrganizationPlanNetworkSavedOutcome({
            queryExec,
            publicationKey: 'construction-org-plan-network-release:project-1',
            outcomeStatus: 'accepted',
            outcomeRef: 'construction-org-plan-network-outcome:project-1',
            metadata: {},
          })
        : kind === 'runtime_engine_evidence'
          ? await recordConstructionOrganizationPlanNetworkRuntimeEngineEvidence({
              queryExec,
              publicationKey: 'construction-org-plan-network-release:project-1',
              engineCode: 'critical_path_cpm',
              predictedDurationDays: 180,
              actualDurationDays: 184,
              metadata: {},
            })
          : await recordConstructionOrganizationPlanNetworkRecommendationDecision({
              queryExec,
              projectId: 'project-1',
              actionType: 'adopted',
              optionId: 'option-ready',
              decisionContext: {},
            })

    expect(result).toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(['business_type_required']),
    }))
    expect(calls).toEqual([])
  })
})
