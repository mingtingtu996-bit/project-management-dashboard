import { describe, expect, it } from 'vitest'

describe('durationRuntimeConsumerBusinessPathIntegrationAuditService', () => {
  it('requires every facade-backed runtime consumer to call its named facade from the business path', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: [
        {
          sourcePath: 'server/src/services/durationSuggestionService.ts',
          sourceText: `
            import { recordDurationSuggestionConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function suggestDuration() {
              await recordDurationSuggestionConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/taskDurationForecastService.ts',
          sourceText: `
            import { recordTaskDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function forecastTaskDuration() {
              await recordTaskDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          sourceText: `
            import { recordProjectRemainingDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function forecastRemainingDuration() {
              await recordProjectRemainingDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
          sourceText: `
            import { recordWbsTemplateGenerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function generateTemplate() {
              await recordWbsTemplateGenerationConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/scheduleAccelerationService.ts',
          sourceText: `
            import { recordScheduleAccelerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function buildAccelerationPlan() {
              await recordScheduleAccelerationConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
          sourceText: `
            import { recordScheduleAccelerationRuntimeConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function applyRuntimeAcceleration() {
              await recordScheduleAccelerationRuntimeConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
      ],
    })

    expect(coverage.status).toBe('runtime_consumer_business_path_integration_ready')
    expect(coverage.requiredIntegrations.map((item) => item.consumerKey)).toEqual([
      'durationSuggestionService',
      'taskDurationForecastService',
      'projectRemainingDurationForecastService',
      'wbsTemplateGenerationService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(coverage.missingIntegrations).toEqual([])
  })

  it('reports missing business path facade calls instead of treating facade existence as enough', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: [
        {
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          sourceText: 'export function buildProjectRemainingDurationForecast() { return {} }',
        },
      ],
    })

    expect(coverage.status).toBe('runtime_consumer_business_path_integration_not_ready')
    expect(coverage.observedIntegrations).toEqual([])
    expect(coverage.missingIntegrations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumerKey: 'projectRemainingDurationForecastService',
        sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
        facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
      }),
      expect.objectContaining({
        consumerKey: 'durationSuggestionService',
      }),
    ]))
  })

  it('does not count adapter imports as business path integration unless the facade is called', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: [
        {
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          sourceText: `
            import { recordProjectRemainingDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export function buildProjectRemainingDurationForecast() {
              return {}
            }
          `,
        },
      ],
    })

    expect(coverage.status).toBe('runtime_consumer_business_path_integration_not_ready')
    expect(coverage.observedIntegrations).toEqual([])
    expect(coverage.missingIntegrations).toContainEqual(expect.objectContaining({
      consumerKey: 'projectRemainingDurationForecastService',
      facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
    }))
  })

  it('does not count helper-only facade calls unless the declared runtime entry calls the facade', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: [
        {
          sourcePath: 'server/src/services/projectRemainingDurationForecastService.ts',
          sourceText: `
            import { recordProjectRemainingDurationForecastConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export function recordProjectRemainingDurationForecastRuntimeConsumption() {
              return recordProjectRemainingDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
            }
            export async function forecastRemainingDuration() {
              return {}
            }
          `,
        },
      ],
    })

    expect(coverage.status).toBe('runtime_consumer_business_path_integration_not_ready')
    expect(coverage.observedIntegrations).toEqual([])
    expect(coverage.missingIntegrations).toContainEqual(expect.objectContaining({
      consumerKey: 'projectRemainingDurationForecastService',
      runtimeEntryRef: 'projectRemainingDurationForecastService:forecastRemainingDuration',
      facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
    }))
  })
})
