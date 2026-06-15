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
  })

  it('accepts only declared facade consumers as runtime-call evidence', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [
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
      consumerKey: 'projectRemainingDurationForecastService',
      runtimeEntryRef: 'projectRemainingDurationForecastService:calculateRemainingDuration',
    }])
    expect(audit.rejectedRuntimeCalls).toEqual([{
      consumerKey: 'unknownDurationConsumer',
      runtimeEntryRef: 'unknown:entry',
      reason: 'runtime_consumer_observation_facade_consumer_not_declared',
    }])
    expect(audit.missingRuntimeCalls).not.toContainEqual({
      consumerKey: 'projectRemainingDurationForecastService',
    })
    expect(audit.missingRuntimeCalls).toContainEqual({
      consumerKey: 'taskDurationForecastService',
    })
  })
})
