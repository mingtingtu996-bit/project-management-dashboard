import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiPost: mocks.apiPost,
}))

const {
  evaluateProjectScheduleAcceleration,
  getProjectRemainingDurationForecast,
  recordScheduleAccelerationRecommendationAdoption,
} = await import('../projectRemainingForecastApi')

describe('projectRemainingForecastApi governed project duration output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads project-level remaining duration only from the public semantic camelCase fields', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 2,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        projectRemainingForecast: {
          value: 42,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: '2027-04-30',
        targetEndDate: '2027-03-31',
        targetGapDays: 30,
        targetGap: {
          value: 30,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        rowsEvaluated: 2,
        calculationContext: {
          primaryLayer: 'runtimeExecutionFacts',
          criticalPath: { remainingTaskCount: 1 },
        },
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1', {
      targetEndDate: '2027-03-31',
      asOfDate: '2027-02-15',
    })

    expect(response).toMatchObject({
      projectId: 'project-1',
      rowsEvaluated: 2,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        projectRemainingForecast: expect.objectContaining({
          value: 42,
          unit: 'construction_production_day',
          availability: 'available',
        }),
        forecastFinishDate: '2027-04-30',
        targetEndDate: '2027-03-31',
        targetGapDays: 30,
        targetGap: expect.objectContaining({
          value: 30,
          unit: 'calendar_day',
          availability: 'available',
        }),
        rowsEvaluated: 2,
      },
    })
    expect(response.projectRemainingForecast).not.toHaveProperty('project_remaining_forecast_days')
    expect(response.projectRemainingForecast).not.toHaveProperty('duration_output_code')
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/projects/project-1/schedule-acceleration/remaining-forecast',
      {
        targetEndDate: '2027-03-31',
        asOfDate: '2027-02-15',
      },
      undefined,
    )
  })

  it('does not synthesize typed facts from legacy numeric duration fields', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 1,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 42,
        targetGapDays: 30,
        forecastFinishDate: '2027-04-30',
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response.projectRemainingForecast?.projectRemainingForecast).toBeNull()
    expect(response.projectRemainingForecast?.forecastFinishDate).toBeNull()
    expect(response.projectRemainingForecast?.targetGap).toBeNull()
  })

  it('fails the forecast finish date and dependent target gap closed when the production-day fact is unavailable', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 42,
        projectRemainingForecast: {
          value: null,
          unit: 'construction_production_day',
          calendarRef: null,
          calendarVersion: null,
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'unavailable',
          unavailableReason: 'construction_calendar_identity_missing',
        },
        forecastFinishDate: '2027-04-30',
        targetEndDate: '2027-03-31',
        targetGapDays: 30,
        targetGap: {
          value: 30,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response.projectRemainingForecast).toMatchObject({
      projectRemainingForecastDays: null,
      projectRemainingForecast: expect.objectContaining({
        availability: 'unavailable',
      }),
      forecastFinishDate: null,
      targetGapDays: null,
      targetGap: expect.objectContaining({
        value: null,
        availability: 'unavailable',
        unavailableReason: 'production_fact_unavailable',
      }),
    })
  })

  it('does not derive project-level remaining duration from legacy snake_case aliases', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      project_id: 'legacy-project',
      rows_evaluated: 99,
      project_remaining_forecast: {
        duration_output_code: 'project_remaining_forecast',
        duration_output_semantic_field_name: 'projectRemainingForecastDays',
        project_remaining_forecast_days: 999,
        forecast_finish_date: '2099-04-30',
        target_end_date: '2099-03-31',
        target_gap_days: 999,
        rows_evaluated: 99,
        calculation_context: {
          primary_layer: 'runtimeExecutionFacts',
        },
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response).toMatchObject({
      projectId: 'project-1',
      rowsEvaluated: null,
      projectRemainingForecast: null,
    })
  })

  it('preserves an explicit degraded remaining forecast contract without fabricating zero values', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      status: 'degraded',
      degraded: true,
      degradationReason: 'request_budget_exceeded',
      message: '项目剩余工期预测暂不可用，后台计算仍在刷新，请稍后重试。',
      rowsEvaluated: null,
      projectRemainingForecast: null,
      constructionOrganizationProductOutcomeCloseoutProgress: null,
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response).toMatchObject({
      projectId: 'project-1',
      status: 'degraded',
      degraded: true,
      degradationReason: 'request_budget_exceeded',
      rowsEvaluated: null,
      projectRemainingForecast: null,
      constructionOrganizationProductOutcomeCloseoutProgress: null,
    })
    expect(response.message).toContain('项目剩余工期预测暂不可用')
  })

  it('keeps real zero values in the governed remaining forecast payload', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 0,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 0,
        projectRemainingForecast: {
          value: 0,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: null,
        targetGapDays: 0,
        targetGap: {
          value: 0,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        rowsEvaluated: 0,
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response.rowsEvaluated).toBe(0)
    expect(response.projectRemainingForecast).toMatchObject({
      projectRemainingForecastDays: 0,
      targetGapDays: 0,
      rowsEvaluated: 0,
    })
  })

  it('does not expose legacy snake_case aliases when mixed into the governed forecast payload', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 2,
      rows_evaluated: 99,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        duration_output_code: 'legacy_project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        duration_output_semantic_field_name: 'legacyProjectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        project_remaining_forecast_days: 999,
        projectRemainingForecast: {
          value: 42,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: '2027-04-30',
        forecast_finish_date: '2099-04-30',
        targetEndDate: '2027-03-31',
        target_end_date: '2099-03-31',
        targetGapDays: 30,
        target_gap_days: 999,
        targetGap: {
          value: 30,
          unit: 'calendar_day',
          calendarRef: 'gregorian',
          calendarVersion: 'ISO-8601',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        rowsEvaluated: 2,
        rows_evaluated: 99,
        calculationContext: { primaryLayer: 'runtimeExecutionFacts' },
        calculation_context: { legacy: true },
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')
    const forecast = response.projectRemainingForecast

    expect(forecast).toMatchObject({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: 42,
      forecastFinishDate: '2027-04-30',
      targetEndDate: '2027-03-31',
      targetGapDays: 30,
      rowsEvaluated: 2,
      calculationContext: { primaryLayer: 'runtimeExecutionFacts' },
    })
    expect(forecast).not.toHaveProperty('duration_output_code')
    expect(forecast).not.toHaveProperty('duration_output_semantic_field_name')
    expect(forecast).not.toHaveProperty('project_remaining_forecast_days')
    expect(forecast).not.toHaveProperty('forecast_finish_date')
    expect(forecast).not.toHaveProperty('target_end_date')
    expect(forecast).not.toHaveProperty('target_gap_days')
    expect(forecast).not.toHaveProperty('rows_evaluated')
    expect(forecast).not.toHaveProperty('calculation_context')
  })

  it('preserves construction organization product closeout progress from the governed camelCase response field', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 2,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        forecastFinishDate: '2027-04-30',
      },
      constructionOrganizationProductOutcomeCloseoutProgress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 3,
        readyBusinessTypes: ['residential_general'],
        missingBusinessTypes: ['hospital_cleanroom'],
        topMissingReasons: ['hospital_cleanroom:runtime_outcome_required'],
        nextEvidenceActions: ['collect_runtime_saved_outcome'],
        nextEvidenceWorkItemCount: 8,
        nextEvidenceWorkPackageCount: 4,
        prefillableWorkPackageCount: 2,
        blockedWorkPackageCount: 2,
        useCaseCoverage: {
          newProjectPlanning: {
            readyBusinessTypeCount: 3,
            missingBusinessTypes: ['hospital_cleanroom'],
          },
          startingLineOnboarding: {
            readyBusinessTypeCount: 2,
            missingBusinessTypes: ['hospital_cleanroom'],
          },
          accelerationRecovery: {
            readyBusinessTypeCount: 1,
            missingBusinessTypes: ['hospital_cleanroom'],
          },
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        },
        boundaryPolicy: ['progress_projection_is_read_only'],
      },
      construction_organization_product_outcome_closeout_progress: {
        status: 'product_outcome_closeout_ready',
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response.constructionOrganizationProductOutcomeCloseoutProgress).toMatchObject({
      source: 'construction_organization_product_outcome_closeout_progress',
      status: 'product_outcome_closeout_incomplete',
      canDeclareConstructionOrganizationProductOutcomeCloseout: false,
      supportedBusinessTypeCount: 11,
      runtimeOutcomeReadyBusinessTypeCount: 3,
      boundaryPolicy: ['progress_projection_is_read_only'],
    })
    expect(response).not.toHaveProperty('construction_organization_product_outcome_closeout_progress')
  })

  it('does not derive construction organization product closeout progress from legacy snake_case aliases', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      rowsEvaluated: 2,
      projectRemainingForecast: null,
      construction_organization_product_outcome_closeout_progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_ready',
      },
    })

    const response = await getProjectRemainingDurationForecast('project-1')

    expect(response.constructionOrganizationProductOutcomeCloseoutProgress).toBeNull()
  })

  it('evaluates runtime schedule acceleration through the governed evaluate endpoint', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      projectId: 'project-1',
      targetEndDate: '2027-03-31',
      rowsEvaluated: 6,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        projectRemainingForecastDays: 42,
        projectRemainingForecast: {
          value: 42,
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          asOf: '2027-02-15',
          availability: 'available',
          unavailableReason: null,
        },
        forecastFinishDate: '2027-04-30',
      },
      targetFeasibility: {
        mode: 'compression_preview',
        scenario: 'runtime_delay_recovery',
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        overshootDays: 30,
        recoverableDays: 12,
        unrecoverableDays: 18,
        verdict: 'requires_scope_change',
        strategies: [],
        accelerationProposal: {
          mode: 'preview_only',
          source: 'target_end_compression',
          targetEndDate: '2027-03-31',
          naturalEndDate: '2027-04-30',
          overshootDays: 30,
          totalRecoverDays: 12,
          remainingGapDays: 18,
          verdict: 'needs_scope_decision',
          actions: [],
          protectedConstraints: [],
          calculationBasis: {
            scenario: 'runtime_delay_recovery',
            naturalDurationDays: 42,
            totalRecoverCapRatio: 0.15,
            seasonalFactor: 1,
            projectTypeProfile: 'general_civil',
            criticalCandidateDays: 30,
            resourceGroupedCandidateDays: 20,
            hardConstraintDays: 0,
            constructionOrganizationScenario: {
              source: 'construction_organization_scenario_selection',
              productOutcomeCloseoutProgress: {
                status: 'product_outcome_closeout_incomplete',
              },
            },
          },
        },
      },
      constructionOrganizationProductOutcomeCloseoutProgress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 3,
      },
    })

    const response = await evaluateProjectScheduleAcceleration('project-1', {
      targetEndDate: '2027-03-31',
      asOfDate: '2027-02-15',
      mode: 'compression_preview',
    })

    expect(response).toMatchObject({
      projectId: 'project-1',
      rowsEvaluated: 6,
      projectRemainingForecast: {
        projectRemainingForecastDays: 42,
      },
      targetFeasibility: {
        scenario: 'runtime_delay_recovery',
        overshootDays: 30,
        accelerationProposal: {
          calculationBasis: {
            constructionOrganizationScenario: {
              source: 'construction_organization_scenario_selection',
            },
          },
        },
      },
      constructionOrganizationProductOutcomeCloseoutProgress: {
        status: 'product_outcome_closeout_incomplete',
        runtimeOutcomeReadyBusinessTypeCount: 3,
      },
    })
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/projects/project-1/schedule-acceleration/evaluate',
      {
        targetEndDate: '2027-03-31',
        asOfDate: '2027-02-15',
        mode: 'compression_preview',
      },
      undefined,
    )
  })

  it('preserves the construction organization site-decision fact returned by acceleration adoption', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      adopted: true,
      recommendationKey: 'schedule_acceleration:2027-03-31:2027-04-30:12',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      constructionOrganizationRecommendationDecision: {
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:pub-accelerate-tower-first',
        actionType: 'adopted',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['does_not_write_task_dependencies_or_plan_dates'],
      },
      constructionOrganizationSavedOutcome: {
        source: 'construction_organization_plan_network_runtime_evidence_service',
        status: 'saved_network_outcome_recorded',
        publicationKey: 'pub-accelerate-tower-first',
        outcomeStatus: 'accepted',
        outcomePersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
        reasons: [],
        boundaryPolicy: ['saved_outcome_requires_real_task_list_commit_ref'],
      },
    })

    const response = await recordScheduleAccelerationRecommendationAdoption('project-1', {
      mode: 'preview_only',
      source: 'target_end_compression',
      targetEndDate: '2027-03-31',
      naturalEndDate: '2027-04-30',
      overshootDays: 30,
      totalRecoverDays: 12,
      remainingGapDays: 18,
      verdict: 'needs_scope_decision',
      actions: [],
      protectedConstraints: [],
    } as any, {
      outcomeRef: 'task-list-commit:project-1:123:acceleration-reschedule',
      outcomeMetadata: {
        operationCount: 3,
      },
    })

    expect(response).toMatchObject({
      adopted: true,
      recommendationKey: 'schedule_acceleration:2027-03-31:2027-04-30:12',
      constructionOrganizationRecommendationDecision: {
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        recommendationKey: 'construction_organization_plan_network:pub-accelerate-tower-first',
        decisionPersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      },
      constructionOrganizationSavedOutcome: {
        status: 'saved_network_outcome_recorded',
        publicationKey: 'pub-accelerate-tower-first',
        outcomePersisted: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      },
    })
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/projects/project-1/schedule-acceleration/recommendations/adopt',
      {
        proposal: expect.objectContaining({
          targetEndDate: '2027-03-31',
          naturalEndDate: '2027-04-30',
        }),
        outcomeRef: 'task-list-commit:project-1:123:acceleration-reschedule',
        outcomeMetadata: expect.objectContaining({
          operationCount: 3,
        }),
      },
      undefined,
    )
  })
})
