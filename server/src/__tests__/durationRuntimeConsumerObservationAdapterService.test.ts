import { describe, expect, it } from 'vitest'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function callsForTable(calls: Array<{ sql: string, params: unknown[] }>, tableName: string) {
  return calls.filter((call) => call.sql.toLowerCase().includes(tableName))
}

function parseJsonParam<T>(call: { params: unknown[] } | undefined, index: number): T {
  return JSON.parse(String(call?.params[index] ?? 'null')) as T
}

describe('durationRuntimeConsumerObservationAdapterService', () => {
  it('serializes critical-path observation JSONB before invoking a raw query executor', async () => {
    const {
      recordProjectCriticalPathConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    await recordProjectCriticalPathConsumedArtifacts({
      queryExec,
      observedAt: '2026-08-10T04:00:00.000Z',
      callContext: { projectId: 'project-critical-path' },
      sourceEvidenceRefs: ['critical_path_inputs:sha256:critical-path-input'],
      artifacts: [{
        assetKey: 'critical_path_rule_candidate',
        publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-path-v1',
        publicationStatus: 'runtime_published',
        observationContext: { projectId: 'project-critical-path' },
        sourceEvidenceRefs: ['duration_learning_runtime_publications:critical-path-v1'],
      }],
    })

    const runtimeCall = callsForTable(calls, 'runtime_consumer_runtime_calls')[0]
    expect(runtimeCall?.sql).toContain('$4::jsonb')
    expect(runtimeCall?.sql).toContain('$5::jsonb')
    expect(runtimeCall?.params[3]).toBe(JSON.stringify({
      projectId: 'project-critical-path',
      runtimeAssetMode: 'published_artifact',
      runtimeArtifactCount: 1,
      runtimeArtifactPublicationKeys: [
        'duration_learning_runtime:critical_path_rule_candidate:critical-path-v1',
      ],
    }))
    expect(runtimeCall?.params[4]).toBe(JSON.stringify([
      'critical_path_inputs:sha256:critical-path-input',
    ]))

    const observation = callsForTable(calls, 'runtime_consumer_observations')[0]
    expect(observation?.sql).toContain('$6::jsonb')
    expect(observation?.sql).toContain('$7::jsonb')
    expect(observation?.params[5]).toBe(JSON.stringify({ projectId: 'project-critical-path' }))
    expect(observation?.params[6]).toBe(JSON.stringify([
      'critical_path_inputs:sha256:critical-path-input',
      'duration_learning_runtime_publications:critical-path-v1',
    ]))
  })

  it('records a reasoned call-only entry when the consumer has no published artifacts', async () => {
    const {
      recordProjectRemainingDurationForecastConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    await recordProjectRemainingDurationForecastConsumedArtifacts({
      queryExec,
      callContext: { projectId: 'project-a' },
      sourceEvidenceRefs: ['project_remaining_forecast:project-a:2026-06-30'],
      artifacts: [],
    })

    const runtimeCalls = callsForTable(calls, 'runtime_consumer_runtime_calls')
    expect(runtimeCalls).toHaveLength(1)
    expect(parseJsonParam(runtimeCalls[0], 3)).toEqual(expect.objectContaining({
      projectId: 'project-a',
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
      runtimeArtifactPublicationKeys: [],
    }))
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
  })

  it('records project remaining duration forecast consumed artifacts through the contract adapter', async () => {
    const {
      recordProjectRemainingDurationForecastConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordProjectRemainingDurationForecastConsumedArtifacts({
      queryExec,
      observedAt: '2026-06-15T05:20:00.000Z',
      sourceEvidenceRefs: ['project_remaining_forecast:project-a:2026-06-30'],
      artifacts: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v4',
          publicationStatus: 'published',
          observationContext: { projectId: 'project-a' },
          sourceEvidenceRefs: ['artifact-lineage:overlay-v4'],
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v4',
          publicationStatus: 'runtime_published',
          observationContext: { projectId: 'project-a' },
          sourceEvidenceRefs: ['artifact-lineage:critical-v4'],
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 2,
      blockedCount: 0,
      reasons: [],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')[0].params.slice(0, 2)).toEqual([
      'projectRemainingDurationForecastService',
      'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
    ])
    expect(parseJsonParam(callsForTable(calls, 'runtime_consumer_runtime_calls')[0], 3)).toEqual(expect.objectContaining({
      runtimeAssetMode: 'published_artifact',
      runtimeArtifactCount: 2,
      runtimeArtifactPublicationKeys: [
        'duration_learning_runtime:critical_path_rule_candidate:critical-v4',
        'forecast_residual_overlay_runtime:overlay-v4',
      ],
    }))
    expect(parseJsonParam(callsForTable(calls, 'runtime_consumer_runtime_calls')[0], 4)).toEqual([
      'project_remaining_forecast:project-a:2026-06-30',
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'forecast_residual_overlay',
        'forecast_residual_overlay_runtime:overlay-v4',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v4',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => parseJsonParam(call, 6))).toEqual([
      [
        'project_remaining_forecast:project-a:2026-06-30',
        'artifact-lineage:overlay-v4',
      ],
      [
        'project_remaining_forecast:project-a:2026-06-30',
        'artifact-lineage:critical-v4',
      ],
    ])
  })

  it('blocks a facade when the consumer tries to observe an undeclared asset', async () => {
    const {
      recordTaskDurationForecastConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordTaskDurationForecastConsumedArtifacts({
      queryExec,
      artifacts: [{
        assetKey: 'wbs_reference_days',
        publicationKey: 'duration_learning_runtime:wbs_reference_days:reference-v4',
        publicationStatus: 'runtime_published',
        sourceEvidenceRefs: ['artifact-lineage:wbs-reference-v4'],
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_blocked',
      recordedCount: 0,
      blockedCount: 1,
      reasons: ['runtime_consumer_observation_contract_not_found'],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toEqual([])
  })

  it('blocks facade observations when published artifacts lack artifact source evidence refs', async () => {
    const {
      recordProjectRemainingDurationForecastConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordProjectRemainingDurationForecastConsumedArtifacts({
      queryExec,
      observedAt: '2026-06-26T12:00:00.000Z',
      sourceEvidenceRefs: ['project_remaining_forecast:project-a:2026-07-01'],
      artifacts: [{
        assetKey: 'forecast_residual_overlay',
        publicationKey: 'forecast_residual_overlay_runtime:overlay-no-lineage',
        publicationStatus: 'published',
        observationContext: { projectId: 'project-a' },
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_blocked',
      recordedCount: 0,
      blockedCount: 1,
      reasons: ['runtime_consumer_observation_source_evidence_required'],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toEqual([])
  })

  it('records project wizard consumed construction organization plan-network artifacts through the contract adapter', async () => {
    const {
      recordProjectWizardConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordProjectWizardConsumedArtifacts({
      queryExec,
      observedAt: '2026-06-22T06:00:00.000Z',
      runtimeEntryRef: 'projectWizard:commitWizardGeneration',
      sourceEvidenceRefs: ['project_wizard_commit:project-1:generation-1:newProjectPlanning'],
      artifacts: [{
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction_org_plan_network_runtime:project-1:option-ready',
        publicationStatus: 'runtime_published',
        observationContext: {
          businessType: 'hospital',
          useCase: 'newProjectPlanning',
          projectId: 'project-1',
          optionId: 'option-ready',
        },
        sourceEvidenceRefs: ['artifact-lineage:construction-org-option-ready'],
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 1,
      blockedCount: 0,
      reasons: [],
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')[0].params.slice(0, 2)).toEqual([
      'projectWizard',
      'projectWizard:commitWizardGeneration',
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations')[0].params.slice(0, 4)).toEqual([
      'construction_organization_plan_network',
      'construction_org_plan_network_runtime:project-1:option-ready',
      'projectWizard',
      'project_wizard_commit',
    ])
  })
})
