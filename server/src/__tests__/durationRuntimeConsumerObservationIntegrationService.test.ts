import { describe, expect, it } from 'vitest'

describe('durationRuntimeConsumerObservationIntegrationService', () => {
  it('lists every declared duration runtime consumer with a stable observation surface', async () => {
    const {
      listDurationRuntimeConsumerObservationIntegrationContracts,
    } = await import('../services/durationRuntimeConsumerObservationIntegrationService.js')

    const contracts = listDurationRuntimeConsumerObservationIntegrationContracts()

    expect(contracts).toEqual([
      {
        assetKey: 'base_duration_benchmark',
        consumerKey: 'durationSuggestionService',
        consumerSurface: 'duration_suggestion',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'duration_cold_start_baseline',
        consumerKey: 'durationSuggestionService',
        consumerSurface: 'duration_suggestion',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'forecast_residual_overlay',
        consumerKey: 'taskDurationForecastService',
        consumerSurface: 'task_duration_forecast',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'forecast_residual_overlay',
        consumerKey: 'projectRemainingDurationForecastService',
        consumerSurface: 'remaining_duration_forecast',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'forecast_confidence_weight',
        consumerKey: 'taskDurationForecastService',
        consumerSurface: 'task_duration_forecast',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'standard_work_duration_seed',
        consumerKey: 'durationSuggestionService',
        consumerSurface: 'duration_suggestion',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'special_work_duration_seed',
        consumerKey: 'wbsTemplateGenerationService',
        consumerSurface: 'wbs_template_generation',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'special_work_duration_seed',
        consumerKey: 'durationSuggestionService',
        consumerSurface: 'duration_suggestion',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'wbs_reference_days',
        consumerKey: 'wbsTemplateGenerationService',
        consumerSurface: 'wbs_template_generation',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'wbs_reference_days',
        consumerKey: 'projectRemainingDurationForecastService',
        consumerSurface: 'remaining_duration_forecast',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'dependency_rule_candidate',
        consumerKey: 'wbsTemplateGenerationService',
        consumerSurface: 'wbs_template_generation',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'dependency_rule_candidate',
        consumerKey: 'scheduleAccelerationService',
        consumerSurface: 'schedule_acceleration',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'critical_path_rule_candidate',
        consumerKey: 'projectCriticalPathService',
        consumerSurface: 'critical_path_watch_prior',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'critical_path_rule_candidate',
        consumerKey: 'projectRemainingDurationForecastService',
        consumerSurface: 'remaining_duration_forecast',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'critical_path_rule_candidate',
        consumerKey: 'scheduleAccelerationRuntimeService',
        consumerSurface: 'schedule_acceleration_runtime',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'construction_organization_plan_network',
        consumerKey: 'projectWizard',
        consumerSurface: 'project_wizard_commit',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
      {
        assetKey: 'construction_organization_plan_network',
        consumerKey: 'scheduleAccelerationRuntimeService',
        consumerSurface: 'schedule_acceleration_runtime',
        acceptedPublicationStatuses: ['published', 'canary', 'runtime_published'],
      },
    ])
  })

  it('audits which declared consumers have been wired to the contract adapter', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerObservationIntegrationService.js')

    const emptyAudit = evaluateDurationRuntimeConsumerObservationIntegrationCoverage()

    expect(emptyAudit.status).toBe('runtime_consumer_observation_integration_not_ready')
    expect(emptyAudit.requiredContracts).toHaveLength(17)
    expect(emptyAudit.integratedContracts).toEqual([])
    expect(emptyAudit.missingContracts).toHaveLength(17)

    const partialAudit = evaluateDurationRuntimeConsumerObservationIntegrationCoverage({
      adapterRegistrations: [
        {
          consumerKey: 'projectRemainingDurationForecastService.ts',
          assetKeys: [
            'forecast_residual_overlay',
            'wbs_reference_days',
          ],
        },
        {
          consumerKey: 'projectRemainingDurationForecastService',
          assetKeys: ['forecast_confidence_weight'],
        },
      ],
    })

    expect(partialAudit.status).toBe('runtime_consumer_observation_integration_not_ready')
    expect(partialAudit.integratedContracts).toEqual([
      {
        assetKey: 'forecast_residual_overlay',
        consumerKey: 'projectRemainingDurationForecastService',
        consumerSurface: 'remaining_duration_forecast',
      },
      {
        assetKey: 'wbs_reference_days',
        consumerKey: 'projectRemainingDurationForecastService',
        consumerSurface: 'remaining_duration_forecast',
      },
    ])
    expect(partialAudit.rejectedRegistrations).toEqual([{
      assetKey: 'forecast_confidence_weight',
      consumerKey: 'projectRemainingDurationForecastService',
      reason: 'runtime_consumer_observation_integration_contract_not_declared',
    }])
    expect(partialAudit.missingContracts).toContainEqual({
      assetKey: 'forecast_confidence_weight',
      consumerKey: 'taskDurationForecastService',
      consumerSurface: 'task_duration_forecast',
    })
    expect(partialAudit.missingContracts).not.toContainEqual({
      assetKey: 'wbs_reference_days',
      consumerKey: 'projectRemainingDurationForecastService',
      consumerSurface: 'remaining_duration_forecast',
    })
  })

  it('uses canonical facade registrations to prove adapter coverage before runtime observations exist', async () => {
    const {
      evaluateDurationRuntimeConsumerObservationIntegrationCoverage,
    } = await import('../services/durationRuntimeConsumerObservationIntegrationService.js')

    const {
      listDurationRuntimeConsumerObservationFacadeRegistrations,
    } = await import('../services/durationRuntimeConsumerObservationAdapterService.js')

    const registrations = listDurationRuntimeConsumerObservationFacadeRegistrations()

    expect(registrations).toEqual([
      {
        consumerKey: 'durationSuggestionService',
        assetKeys: [
          'base_duration_benchmark',
          'duration_cold_start_baseline',
          'standard_work_duration_seed',
          'special_work_duration_seed',
        ],
      },
      {
        consumerKey: 'taskDurationForecastService',
        assetKeys: [
          'forecast_residual_overlay',
          'forecast_confidence_weight',
        ],
      },
      {
        consumerKey: 'projectRemainingDurationForecastService',
        assetKeys: [
          'forecast_residual_overlay',
          'wbs_reference_days',
          'critical_path_rule_candidate',
        ],
      },
      {
        consumerKey: 'projectCriticalPathService',
        assetKeys: ['critical_path_rule_candidate'],
      },
      {
        consumerKey: 'wbsTemplateGenerationService',
        assetKeys: [
          'special_work_duration_seed',
          'wbs_reference_days',
          'dependency_rule_candidate',
        ],
      },
      {
        consumerKey: 'scheduleAccelerationService',
        assetKeys: ['dependency_rule_candidate'],
      },
      {
        consumerKey: 'scheduleAccelerationRuntimeService',
        assetKeys: [
          'critical_path_rule_candidate',
          'construction_organization_plan_network',
        ],
      },
      {
        consumerKey: 'projectWizard',
        assetKeys: [
          'construction_organization_plan_network',
        ],
      },
    ])

    const audit = evaluateDurationRuntimeConsumerObservationIntegrationCoverage({
      adapterRegistrations: registrations,
    })

    expect(audit.status).toBe('runtime_consumer_observation_integration_ready')
    expect(audit.integratedContracts).toHaveLength(17)
    expect(audit.missingContracts).toEqual([])
    expect(audit.rejectedRegistrations).toEqual([])
  })
})
