import { describe, expect, it } from 'vitest'

describe('durationRuntimeConsumerBusinessPathIntegrationAuditService', () => {
  it('anchors runtime entry refs to real exported business functions instead of abstract placeholders', async () => {
    const {
      listDurationRuntimeConsumerBusinessPathRequiredIntegrations,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    expect(listDurationRuntimeConsumerBusinessPathRequiredIntegrations()
      .map(({ consumerKey, runtimeEntryRef }) => [consumerKey, runtimeEntryRef]))
      .toEqual([
        ['durationSuggestionService', 'durationSuggestionService:getTaskDurationSuggestion'],
        ['taskDurationForecastService', 'taskDurationForecastService:forecastTaskDuration'],
        [
          'projectRemainingDurationForecastService',
          'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
        ],
        ['wbsTemplateGenerationService', 'wbsTemplateGenerationService:generateWbsTemplateRows'],
        [
          'scheduleAccelerationService',
          'scheduleAccelerationService:evaluateRuntimeDelayRecoveryWithCriticalPath',
        ],
        ['scheduleAccelerationRuntimeService', 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration'],
      ])
  })

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
            export async function getTaskDurationSuggestion() {
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
            export function buildProjectRemainingDurationForecast() {
              await recordProjectRemainingDurationForecastConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/wbsTemplateGenerationService.ts',
          sourceText: `
            import { recordWbsTemplateGenerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function generateWbsTemplateRows() {
              await recordWbsTemplateGenerationConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/scheduleAccelerationService.ts',
          sourceText: `
            import { recordScheduleAccelerationConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function evaluateRuntimeDelayRecoveryWithCriticalPath() {
              await recordScheduleAccelerationConsumedArtifacts({ queryExec, artifacts: [] })
            }
          `,
        },
        {
          sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
          sourceText: `
            import { recordScheduleAccelerationRuntimeConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function evaluateRuntimeScheduleAcceleration() {
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
      runtimeEntryRef: 'projectRemainingDurationForecastService:buildProjectRemainingDurationForecast',
      facadeFunctionName: 'recordProjectRemainingDurationForecastConsumedArtifacts',
    }))
  })

  it('recognizes facade calls inside typed TypeScript runtime entries', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({
      sourceFiles: [
        {
          sourcePath: 'server/src/services/scheduleAccelerationRuntimeService.ts',
          sourceText: `
            import { recordScheduleAccelerationRuntimeConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
            export async function evaluateRuntimeScheduleAcceleration(params: {
              projectId: string
              runtimeConsumerErrorHandler?: (error: unknown) => void
            }): Promise<{
              rowsEvaluated: number
            }> {
              await recordScheduleAccelerationRuntimeConsumedArtifacts({ queryExec, artifacts: [] })
              return { rowsEvaluated: 1 }
            }
          `,
        },
      ],
    })

    expect(coverage.observedIntegrations).toContainEqual(expect.objectContaining({
      consumerKey: 'scheduleAccelerationRuntimeService',
      runtimeEntryRef: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
      facadeFunctionName: 'recordScheduleAccelerationRuntimeConsumedArtifacts',
    }))
    expect(coverage.missingIntegrations).not.toContainEqual(expect.objectContaining({
      consumerKey: 'scheduleAccelerationRuntimeService',
    }))
  })

  it('recognizes all facade calls in the current source runtime entries', async () => {
    const {
      evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage,
      loadDurationRuntimeConsumerBusinessPathSourceFiles,
    } = await import('../services/durationRuntimeConsumerBusinessPathIntegrationAuditService.js')

    const sourceFiles = await loadDurationRuntimeConsumerBusinessPathSourceFiles()
    const coverage = evaluateDurationRuntimeConsumerBusinessPathIntegrationCoverage({ sourceFiles })

    expect(coverage.status).toBe('runtime_consumer_business_path_integration_ready')
    expect(coverage.missingIntegrations).toEqual([])
    expect(coverage.observedIntegrations.map((item) => item.consumerKey).sort()).toEqual([
      'durationSuggestionService',
      'projectRemainingDurationForecastService',
      'scheduleAccelerationRuntimeService',
      'scheduleAccelerationService',
      'taskDurationForecastService',
      'wbsTemplateGenerationService',
    ].sort())
  })
})
