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
      'durationSuggestionService:getTaskDurationSuggestion',
      'taskDurationForecastService:forecastTaskDuration',
      'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
      'wbsTemplateGenerationService:generateWbsTemplateRows',
      'scheduleAccelerationService:evaluateRuntimeDelayRecoveryWithCriticalPath',
      'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
    ])
  })

  it('accepts only declared facade consumers with canonical runtime entry refs and production runtime-call refs', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [
        {
          consumerKey: 'durationSuggestionService',
          runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
        },
        {
          consumerKey: 'taskDurationForecastService',
          runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
        },
        {
          consumerKey: 'projectRemainingDurationForecastService.ts',
          runtimeEntryRef: 'projectRemainingDurationForecastService:calculateRemainingDuration',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-project-remaining',
        },
        {
          consumerKey: 'unknownDurationConsumer',
          runtimeEntryRef: 'unknown:entry',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-unknown',
        },
      ],
    })

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.observedRuntimeCalls).toEqual([{
      consumerKey: 'durationSuggestionService',
      runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
      evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
    }])
    expect(audit.rejectedRuntimeCalls).toEqual([
      {
        consumerKey: 'taskDurationForecastService',
        runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
        reason: 'runtime_consumer_observation_runtime_call_production_ref_required',
      },
      {
        consumerKey: 'projectRemainingDurationForecastService',
        runtimeEntryRef: 'projectRemainingDurationForecastService:calculateRemainingDuration',
        evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-project-remaining',
        reason: 'runtime_consumer_observation_runtime_entry_ref_not_declared',
      },
      {
        consumerKey: 'unknownDurationConsumer',
        runtimeEntryRef: 'unknown:entry',
        evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-unknown',
        reason: 'runtime_consumer_observation_facade_consumer_not_declared',
      },
    ])
    expect(audit.missingRuntimeCalls).toContainEqual({
      consumerKey: 'projectRemainingDurationForecastService',
      runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
    })
    expect(audit.missingRuntimeCalls).toContainEqual({
      consumerKey: 'taskDurationForecastService',
      runtimeEntryRef: 'taskDurationForecastService:forecastTaskDuration',
    })
  })
})
