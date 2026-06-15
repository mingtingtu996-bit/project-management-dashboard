import { describe, expect, it } from 'vitest'

describe('durationRuntimeConsumerObservationRuntimeCallAuditService', () => {
  it('reports all facade-backed consumers as missing when no runtime call evidence is registered', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage()

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.requiredRuntimeCalls).toHaveLength(6)
    expect(audit.observedRuntimeCalls).toEqual([])
    expect(audit.missingRuntimeCalls.map((item) => item.consumerKey)).toEqual([
      'durationSuggestionService',
      'taskDurationForecastService',
      'projectRemainingDurationForecastService',
      'wbsTemplateGenerationService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(audit.missingRuntimeCalls.map((item) => item.runtimeEntryRef)).toEqual([
      'durationSuggestionService:suggestDuration',
      'taskDurationForecastService:forecastTaskDuration',
      'projectRemainingDurationForecastService:forecastRemainingDuration',
      'wbsTemplateGenerationService:generateTemplate',
      'scheduleAccelerationService:buildAccelerationPlan',
      'scheduleAccelerationRuntimeService:applyRuntimeAcceleration',
    ])
  })

  it('accepts only declared facade consumers with canonical runtime entry refs as runtime-call evidence', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [
        {
          consumerKey: 'durationSuggestionService',
          runtimeEntryRef: 'durationSuggestionService:suggestDuration',
        },
        {
          consumerKey: 'projectRemainingDurationForecastService.ts',
          runtimeEntryRef: 'projectRemainingDurationForecastService:calculateRemainingDuration',
        },
        {
          consumerKey: 'unknownDurationConsumer',
          runtimeEntryRef: 'unknown:entry',
        },
      ],
    })

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.observedRuntimeCalls).toEqual([{
      consumerKey: 'durationSuggestionService',
      runtimeEntryRef: 'durationSuggestionService:suggestDuration',
    }])
    expect(audit.rejectedRuntimeCalls).toEqual([
      {
        consumerKey: 'projectRemainingDurationForecastService',
        runtimeEntryRef: 'projectRemainingDurationForecastService:calculateRemainingDuration',
        reason: 'runtime_consumer_observation_runtime_entry_ref_not_declared',
      },
      {
        consumerKey: 'unknownDurationConsumer',
        runtimeEntryRef: 'unknown:entry',
        reason: 'runtime_consumer_observation_facade_consumer_not_declared',
      },
    ])
    expect(audit.missingRuntimeCalls).toContainEqual({
      consumerKey: 'projectRemainingDurationForecastService',
      runtimeEntryRef: 'projectRemainingDurationForecastService:forecastRemainingDuration',
    })
    expect(audit.missingRuntimeCalls).toContainEqual({
      consumerKey: 'taskDurationForecastService',
      runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
    })
  })
})
