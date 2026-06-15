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

describe('durationRuntimeConsumerObservationAdapterService', () => {
  it('records project remaining duration forecast consumed artifacts through the contract adapter', async () => {
    const {
      recordProjectRemainingDurationForecastConsumedArtifacts,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordProjectRemainingDurationForecastConsumedArtifacts({
      queryExec,
      observedAt: '2026-06-15T05:20:00.000Z',
      artifacts: [
        {
          assetKey: 'forecast_residual_overlay',
          publicationKey: 'forecast_residual_overlay_runtime:overlay-v4',
          publicationStatus: 'published',
          observationContext: { projectId: 'project-a' },
        },
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v4',
          publicationStatus: 'runtime_published',
          observationContext: { projectId: 'project-a' },
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
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'forecast_residual_overlay',
        'forecast_residual_overlay_runtime:overlay-v4',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'critical_path_rule_runtime:critical-v4',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
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
        publicationKey: 'wbs_reference_days_runtime:reference-v4',
        publicationStatus: 'runtime_published',
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
})
