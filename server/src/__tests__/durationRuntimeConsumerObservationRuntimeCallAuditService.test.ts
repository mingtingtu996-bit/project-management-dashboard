import { describe, expect, it } from 'vitest'

describe('durationRuntimeConsumerObservationRuntimeCallAuditService', () => {
  function runtimeSourceRef(consumerKey: string) {
    return `runtime-consumption:${consumerKey}:live-path`
  }

  it('reports all facade-backed consumers as missing when no runtime call evidence is registered', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage()

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.requiredRuntimeCalls).toHaveLength(7)
    expect(audit.observedRuntimeCalls).toEqual([])
    expect(audit.missingRuntimeCalls.map((item) => item.consumerKey)).toEqual([
      'durationSuggestionService',
      'taskDurationForecastService',
      'projectRemainingDurationForecastService',
      'projectCriticalPathService',
      'wbsTemplateGenerationService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(audit.missingRuntimeCalls.map((item) => item.runtimeEntryRef)).toEqual([
      'durationSuggestionService:getTaskDurationSuggestion',
      'taskDurationForecastService:forecastTaskDuration',
      'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
      'projectCriticalPathService:resolveCriticalPathLearningPublications',
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
          sourceEvidenceRefs: [runtimeSourceRef('durationSuggestionService')],
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
      observedConsumerObservations: [{
        consumerKey: 'durationSuggestionService',
        sourceEvidenceRefs: [runtimeSourceRef('durationSuggestionService')],
      }],
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

  it('rejects runtime calls that are not linked to a matching consumer observation source ref', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [{
        consumerKey: 'durationSuggestionService',
        runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
        evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
        sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:old-path'],
      }],
      observedConsumerObservations: [{
        consumerKey: 'durationSuggestionService',
        sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:new-path'],
      }],
    })

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.observedRuntimeCalls).toEqual([])
    expect(audit.rejectedRuntimeCalls).toEqual([{
      consumerKey: 'durationSuggestionService',
      runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
      evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
      reason: 'runtime_consumer_observation_runtime_call_not_linked_to_observation',
    }])
  })

  it('keeps coverage blocked when only one observation for a consumer is linked to the runtime call', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [{
        consumerKey: 'durationSuggestionService',
        runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
        evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
        sourceEvidenceRefs: [runtimeSourceRef('durationSuggestionService')],
      }],
      observedConsumerObservations: [
        {
          consumerKey: 'durationSuggestionService',
          sourceEvidenceRefs: [runtimeSourceRef('durationSuggestionService')],
        },
        {
          consumerKey: 'durationSuggestionService',
          sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:stale-standard-seed'],
        },
      ],
    })

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.observedRuntimeCalls).toEqual([{
      consumerKey: 'durationSuggestionService',
      runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
      evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion',
    }])
    expect(audit.unlinkedConsumerObservations).toEqual([{
      consumerKey: 'durationSuggestionService',
      sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:stale-standard-seed'],
      reason: 'runtime_consumer_observation_not_linked_to_runtime_call',
    }])
  })

  it('accepts multiple runtime calls that link separate observations for the same consumer', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [
        {
          consumerKey: 'durationSuggestionService',
          runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion-base',
          sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:base'],
        },
        {
          consumerKey: 'durationSuggestionService',
          runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion-seed',
          sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:seed'],
        },
      ],
      observedConsumerObservations: [
        {
          consumerKey: 'durationSuggestionService',
          sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:base'],
        },
        {
          consumerKey: 'durationSuggestionService',
          sourceEvidenceRefs: ['runtime-consumption:durationSuggestionService:seed'],
        },
      ],
    })

    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
    expect(audit.unlinkedConsumerObservations).toEqual([])
    expect(audit.rejectedRuntimeCalls).toEqual([])
    expect(audit.observedRuntimeCalls).toEqual([{
      consumerKey: 'durationSuggestionService',
      runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
      evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-duration-suggestion-seed',
    }])
  })

  it('keeps coverage not ready when rejected runtime-call evidence is present even if required calls are covered', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage,
      listDurationRuntimeConsumerObservationRequiredRuntimeCalls,
    } = await import('../services/durationRuntimeConsumerObservationRuntimeCallAuditService.js')

    const requiredRuntimeCalls = listDurationRuntimeConsumerObservationRequiredRuntimeCalls()
    const runtimeCallEvidence = requiredRuntimeCalls.map((runtimeCall) => ({
      ...runtimeCall,
      evidenceRef: `runtime_consumer_runtime_calls:runtime-call-${runtimeCall.consumerKey}`,
      sourceEvidenceRefs: [runtimeSourceRef(runtimeCall.consumerKey)],
    }))
    const observedConsumerObservations = requiredRuntimeCalls.map((runtimeCall) => ({
      consumerKey: runtimeCall.consumerKey,
      sourceEvidenceRefs: [runtimeSourceRef(runtimeCall.consumerKey)],
    }))

    const audit = evaluateDurationRuntimeConsumerObservationRuntimeCallCoverage({
      runtimeCallEvidence: [
        ...runtimeCallEvidence,
        {
          consumerKey: 'unknownDurationConsumer',
          runtimeEntryRef: 'unknown:entry',
          evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-unknown',
          sourceEvidenceRefs: ['runtime-consumption:unknownDurationConsumer:live-path'],
        },
      ],
      observedConsumerObservations,
    })

    expect(audit.missingRuntimeCalls).toEqual([])
    expect(audit.unlinkedConsumerObservations).toEqual([])
    expect(audit.rejectedRuntimeCalls).toEqual([{
      consumerKey: 'unknownDurationConsumer',
      runtimeEntryRef: 'unknown:entry',
      evidenceRef: 'runtime_consumer_runtime_calls:runtime-call-unknown',
      reason: 'runtime_consumer_observation_facade_consumer_not_declared',
    }])
    expect(audit.status).toBe('runtime_consumer_observation_runtime_calls_not_ready')
  })
})
