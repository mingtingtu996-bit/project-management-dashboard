import { describe, expect, it } from 'vitest'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

describe('durationRuntimeConsumerObservationService', () => {
  it('records runtime consumer observations without writing runtime artifacts or facts', async () => {
    const {
      recordDurationRuntimeConsumerObservation,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationRuntimeConsumerObservation({
      queryExec,
      assetKey: 'forecast_confidence_weight',
      publicationKey: 'learnable-parameter-runtime:confidence:project_override',
      consumerKey: 'taskDurationForecastService',
      consumerSurface: 'task_duration_forecast',
      observationContext: { projectId: 'project-a', mode: 'canary' },
      sourceEvidenceRefs: ['runtime_consumption:task-duration-forecast:confidence'],
      observedAt: '2026-06-15T02:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observation_recorded',
      canPersist: true,
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
      reasons: [],
    }))
    expect(result.observation).toEqual(expect.objectContaining({
      assetKey: 'forecast_confidence_weight',
      publicationKey: 'learnable-parameter-runtime:confidence:project_override',
      consumerKey: 'taskDurationForecastService',
      consumerSurface: 'task_duration_forecast',
      observationStatus: 'observed',
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    }))

    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.runtime_consumer_observations')
    expect(sql).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('standard_work_duration')
    expect(sql).not.toContain('tasks ')
    expect(sql).not.toContain('task_baseline_items')
    expect(sql).not.toContain('monthly_plan_items')
  })

  it('blocks observation writes that try to declare direct runtime or fact mutation', async () => {
    const {
      recordDurationRuntimeConsumerObservation,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationRuntimeConsumerObservation({
      queryExec,
      assetKey: 'base_duration_benchmark',
      publicationKey: 'duration-benchmark-runtime:base:p50',
      consumerKey: 'durationSuggestionService',
      consumerSurface: 'duration_suggestion',
      writesRuntimeDirectly: true,
      writesFactDirectly: true,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observation_blocked',
      canPersist: false,
      observation: null,
      reasons: [
        'runtime_consumer_observation_must_not_write_runtime_directly',
        'runtime_consumer_observation_must_not_write_fact_directly',
      ],
    }))
    expect(calls).toEqual([])
  })

  it('blocks observations from consumers that are not declared for the asset', async () => {
    const {
      recordDurationRuntimeConsumerObservation,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationRuntimeConsumerObservation({
      queryExec,
      assetKey: 'forecast_confidence_weight',
      publicationKey: 'learnable-parameter-runtime:confidence:project_override',
      consumerKey: 'projectRemainingDurationForecastService',
      consumerSurface: 'remaining_duration_forecast',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observation_blocked',
      canPersist: false,
      observation: null,
      reasons: ['runtime_consumer_observation_consumer_not_declared_for_asset'],
    }))
    expect(calls).toEqual([])
  })

  it('records multiple published artifacts observed by one declared runtime consumer', async () => {
    const {
      recordDurationRuntimeConsumerObservedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationRuntimeConsumerObservedArtifacts({
      queryExec,
      consumerKey: 'taskDurationForecastService',
      consumerSurface: 'task_duration_forecast',
      observedAt: '2026-06-15T03:00:00.000Z',
      artifacts: [
        {
          assetKey: 'forecast_confidence_weight',
          publicationKey: 'forecast_confidence_weight_runtime:weight-v2',
          publicationStatus: 'canary',
          observationContext: { projectId: 'project-a' },
          sourceEvidenceRefs: ['runtime_consumption:task-duration-forecast:confidence'],
        },
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
          publicationStatus: 'published',
          observationContext: { projectId: 'project-a' },
          sourceEvidenceRefs: ['runtime_consumption:task-duration-forecast:overlay'],
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 2,
      blockedCount: 0,
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
      reasons: [],
    }))
    expect(result.results.map((item) => item.status)).toEqual([
      'runtime_consumer_observation_recorded',
      'runtime_consumer_observation_recorded',
    ])
    expect(calls).toHaveLength(2)

    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.runtime_consumer_observations')
    expect(sql).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(sql).not.toContain('tasks ')
    expect(sql).not.toContain('task_baseline_items')
    expect(sql).not.toContain('monthly_plan_items')
  })

  it('blocks batch observations for artifacts that are not published or canary', async () => {
    const {
      recordDurationRuntimeConsumerObservedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordDurationRuntimeConsumerObservedArtifacts({
      queryExec,
      consumerKey: 'taskDurationForecastService',
      consumerSurface: 'task_duration_forecast',
      artifacts: [{
        assetKey: 'forecast_confidence_weight',
        publicationKey: 'forecast_confidence_weight_runtime:weight-candidate',
        publicationStatus: 'candidate',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_blocked',
      recordedCount: 0,
      blockedCount: 1,
      reasons: ['runtime_consumer_observation_published_or_canary_artifact_required'],
    }))
    expect(calls).toEqual([])
  })
})
