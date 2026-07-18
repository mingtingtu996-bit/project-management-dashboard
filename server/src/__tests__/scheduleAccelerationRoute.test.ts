import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  evaluateRuntimeScheduleAcceleration: vi.fn(),
  buildRuntimeProjectRemainingDurationForecast: vi.fn(),
  recordScheduleAccelerationRecommendationAdoption: vi.fn(),
  createDurationRuntimeConsumerObservationQueryExec: vi.fn(() => 'runtime-observation-query-exec'),
  getCurrentCompanyMembership: vi.fn(),
  getProjectCompanyId: vi.fn(),
  getRequestCompanyId: vi.fn(),
  buildConstructionOrganizationProductOutcomeCloseoutProgressForProject: vi.fn(),
  runWithRequestBudget: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (req: any, res: any, next: () => void) => {
    if (req.headers['x-test-project-permission'] === 'viewer') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Project editor permission required' },
      })
    }
    next()
  }),
}))

vi.mock('../services/scheduleAccelerationRuntimeService.js', () => ({
  evaluateRuntimeScheduleAcceleration: mocks.evaluateRuntimeScheduleAcceleration,
  buildRuntimeProjectRemainingDurationForecast: mocks.buildRuntimeProjectRemainingDurationForecast,
  recordScheduleAccelerationRecommendationAdoption: mocks.recordScheduleAccelerationRecommendationAdoption,
}))

vi.mock('../services/durationRuntimeConsumerObservationService.js', () => ({
  createDurationRuntimeConsumerObservationQueryExec: mocks.createDurationRuntimeConsumerObservationQueryExec,
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: mocks.getRequestCompanyId,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(),
}))

vi.mock('../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js', () => ({
  buildConstructionOrganizationProductOutcomeCloseoutProgressForProject:
    mocks.buildConstructionOrganizationProductOutcomeCloseoutProgressForProject,
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: {
    fastReadMs: 2000,
    boardReadMs: 3000,
    analysisReadMs: 5000,
    notificationReadMs: 5000,
    batchWriteMs: 5000,
  },
  runWithRequestBudget: mocks.runWithRequestBudget,
}))

const {
  default: scheduleAccelerationRouter,
  clearScheduleAccelerationRouteCachesForTest,
} = await import('../routes/schedule-acceleration.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/schedule-acceleration', scheduleAccelerationRouter)
  return app
}

describe('schedule acceleration route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearScheduleAccelerationRouteCachesForTest()
    mocks.runWithRequestBudget.mockImplementation(async (_options, runner: () => Promise<unknown>) => runner())
    mocks.getCurrentCompanyMembership.mockResolvedValue({ companyId: 'company-1', role: 'company_admin' })
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.getRequestCompanyId.mockReturnValue('company-1')
    mocks.buildConstructionOrganizationProductOutcomeCloseoutProgressForProject.mockResolvedValue({
      progress: {
        source: 'construction_organization_product_outcome_closeout_progress',
        status: 'product_outcome_closeout_incomplete',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 11,
        precisionReplayReadyBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 2,
        readyBusinessTypes: ['general_civil', 'hospital'],
        missingBusinessTypes: ['industrial_cleanroom'],
        topMissingReasons: ['industrial_cleanroom:runtime_closeout_claim_by_business_type_required'],
        nextEvidenceActions: ['collect_runtime_closeout_claim_for_business_type'],
        nextEvidenceWorkItemCount: 9,
        nextEvidenceWorkPackageCount: 9,
        prefillableWorkPackageCount: 2,
        blockedWorkPackageCount: 7,
        useCaseCoverage: {
          newProjectPlanning: { readyBusinessTypeCount: 2, missingBusinessTypes: ['industrial_cleanroom'] },
          startingLineOnboarding: { readyBusinessTypeCount: 2, missingBusinessTypes: ['industrial_cleanroom'] },
          accelerationRecovery: { readyBusinessTypeCount: 1, missingBusinessTypes: ['hospital', 'industrial_cleanroom'] },
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
    })
    mocks.evaluateRuntimeScheduleAcceleration.mockResolvedValue({
      rowsEvaluated: 2,
      rows_evaluated: 99,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        duration_output_code: 'legacy_project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        duration_output_semantic_field_name: 'legacyProjectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        project_remaining_forecast_days: 999,
        forecastFinishDate: '2027-04-30',
        forecast_finish_date: '2099-04-30',
        targetEndDate: '2027-03-31',
        target_end_date: '2099-03-31',
        targetGapDays: 30,
        target_gap_days: 999,
        rowsEvaluated: 2,
        rows_evaluated: 99,
        calculationContext: {
          primaryLayer: 'runtimeExecutionFacts',
          criticalPath: { remainingTaskCount: 1 },
          monthlyCommitments: { activeCommitmentCount: 1 },
          externalInterfaces: { hardGateCount: 1 },
        },
        calculation_context: { legacy: true },
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
      },
    })
    mocks.buildRuntimeProjectRemainingDurationForecast.mockResolvedValue({
      rowsEvaluated: 2,
      rows_evaluated: 99,
      projectRemainingForecast: {
        durationOutputCode: 'project_remaining_forecast',
        duration_output_code: 'legacy_project_remaining_forecast',
        durationOutputSemanticFieldName: 'projectRemainingForecastDays',
        duration_output_semantic_field_name: 'legacyProjectRemainingForecastDays',
        projectRemainingForecastDays: 42,
        project_remaining_forecast_days: 999,
        forecastFinishDate: '2027-04-30',
        forecast_finish_date: '2099-04-30',
        targetEndDate: '2027-03-31',
        target_end_date: '2099-03-31',
        targetGapDays: 30,
        target_gap_days: 999,
        rowsEvaluated: 2,
        rows_evaluated: 99,
        calculationContext: {
          primaryLayer: 'runtimeExecutionFacts',
          criticalPath: { remainingTaskCount: 1 },
          monthlyCommitments: { activeCommitmentCount: 1 },
          externalInterfaces: { hardGateCount: 1 },
        },
        calculation_context: { legacy: true },
      },
    })
    mocks.recordScheduleAccelerationRecommendationAdoption.mockResolvedValue({
      adopted: true,
      recommendationKey: 'schedule_acceleration:2027-03-31:2027-04-30:12',
      adoptedAt: '2027-02-15T00:00:00.000Z',
    })
  })

  it('evaluates runtime project schedule acceleration without regenerating WBS templates', async () => {
    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/evaluate')
      .send({
        targetEndDate: '2027-03-31',
        projectTypeCode: 'residential',
        monthlyClimateSignal: 'spring_festival',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.rowsEvaluated).toBe(2)
    expect(response.body.data).not.toHaveProperty('rows_evaluated')
    expect(response.body.data.projectRemainingForecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      projectRemainingForecastDays: 42,
      calculationContext: expect.objectContaining({
        criticalPath: expect.any(Object),
        monthlyCommitments: expect.any(Object),
        externalInterfaces: expect.any(Object),
      }),
    }))
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('duration_output_code')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('project_remaining_forecast_days')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('forecast_finish_date')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('target_end_date')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('target_gap_days')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('rows_evaluated')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('calculation_context')
    expect(response.body.data.targetFeasibility.scenario).toBe('runtime_delay_recovery')
    expect(response.body.data.constructionOrganizationProductOutcomeCloseoutProgress).toEqual(expect.objectContaining({
      source: 'construction_organization_product_outcome_closeout_progress',
      runtimeOutcomeReadyBusinessTypeCount: 2,
      supportedBusinessTypeCount: 11,
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(mocks.buildConstructionOrganizationProductOutcomeCloseoutProgressForProject).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
    }))
    expect(mocks.evaluateRuntimeScheduleAcceleration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetEndDate: '2027-03-31',
      mode: 'compression_preview',
      runtimeConsumerObservationQueryExec: 'runtime-observation-query-exec',
      context: expect.objectContaining({
        projectTypeCodes: ['residential'],
        climateSignals: ['spring_festival'],
      }),
    }))
  })

  it('lets the runtime service resolve the frozen baseline target when request body has no target override', async () => {
    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/evaluate')
      .send({
        projectTypeCode: 'residential',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.evaluateRuntimeScheduleAcceleration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetEndDate: null,
    }))
  })

  it('exposes project-level remaining duration as an independent runtime forecast outlet', async () => {
    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/remaining-forecast')
      .send({
        targetEndDate: '2027-03-31',
        asOfDate: '2027-02-15',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).not.toHaveProperty('rows_evaluated')
    expect(response.body.data.projectRemainingForecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: 42,
      calculationContext: expect.objectContaining({
        criticalPath: expect.any(Object),
        monthlyCommitments: expect.any(Object),
        externalInterfaces: expect.any(Object),
      }),
    }))
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('duration_output_code')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('project_remaining_forecast_days')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('forecast_finish_date')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('target_end_date')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('target_gap_days')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('rows_evaluated')
    expect(response.body.data.projectRemainingForecast).not.toHaveProperty('calculation_context')
    expect(response.body.data).not.toHaveProperty('targetFeasibility')
    expect(response.body.data.constructionOrganizationProductOutcomeCloseoutProgress).toEqual(expect.objectContaining({
      source: 'construction_organization_product_outcome_closeout_progress',
      runtimeOutcomeReadyBusinessTypeCount: 2,
    }))
    expect(mocks.buildRuntimeProjectRemainingDurationForecast).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetEndDate: '2027-03-31',
      asOfDate: '2027-02-15',
      runtimeConsumerObservationQueryExec: 'runtime-observation-query-exec',
    }))
    expect(mocks.evaluateRuntimeScheduleAcceleration).not.toHaveBeenCalled()
  })

  it('returns a consumable degraded payload when remaining forecast exceeds the route budget', async () => {
    mocks.runWithRequestBudget.mockImplementationOnce(async (options, runner: () => Promise<unknown>) => {
      expect(options).toMatchObject({
        operation: 'schedule-acceleration.remaining-forecast.read',
        timeoutMs: 5000,
      })
      void runner()
      throw new Error('schedule-acceleration.remaining-forecast.read exceeded 3000ms')
    })

    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/remaining-forecast')
      .send({
        targetEndDate: '2027-03-31',
        asOfDate: '2027-02-15',
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        projectId: 'project-1',
        status: 'degraded',
        degraded: true,
        degradationReason: 'request_budget_exceeded',
        rowsEvaluated: null,
        projectRemainingForecast: null,
        constructionOrganizationProductOutcomeCloseoutProgress: null,
      },
    })
    expect(response.body.data.message).toContain('项目剩余工期预测暂不可用')
    expect(mocks.buildRuntimeProjectRemainingDurationForecast).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      targetEndDate: '2027-03-31',
      asOfDate: '2027-02-15',
    }))
    expect(mocks.buildConstructionOrganizationProductOutcomeCloseoutProgressForProject).not.toHaveBeenCalled()
  })

  it('does not package a null runtime forecast as a ready remaining forecast', async () => {
    mocks.buildRuntimeProjectRemainingDurationForecast.mockResolvedValueOnce({
      rowsEvaluated: 0,
      projectRemainingForecast: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/remaining-forecast')
      .send({
        targetEndDate: '2027-03-31',
        asOfDate: '2027-02-15',
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        projectId: 'project-1',
        status: 'degraded',
        degraded: true,
        degradationReason: 'runtime_forecast_unavailable',
        rowsEvaluated: null,
        projectRemainingForecast: null,
        constructionOrganizationProductOutcomeCloseoutProgress: null,
      },
    })
    expect(mocks.buildConstructionOrganizationProductOutcomeCloseoutProgressForProject).not.toHaveBeenCalled()
  })

  it('records a real user adoption action for a runtime acceleration recommendation', async () => {
    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/recommendations/adopt')
      .send({
        proposal: {
          source: 'target_end_compression',
          targetEndDate: '2027-03-31',
          naturalEndDate: '2027-04-30',
          totalRecoverDays: 12,
          remainingGapDays: 18,
          accelerationTargetDays: 88,
          actions: [{ type: 'crashing', affectedRowIds: ['task-1'], recoverDays: 12 }],
        },
        outcomeRef: 'task-list-commit:project-1:123:acceleration-reschedule',
        outcomeMetadata: {
          operationCount: 3,
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      adopted: true,
      recommendationKey: 'schedule_acceleration:2027-03-31:2027-04-30:12',
    }))
    expect(mocks.recordScheduleAccelerationRecommendationAdoption).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      proposal: expect.objectContaining({
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
      }),
      outcomeRef: 'task-list-commit:project-1:123:acceleration-reschedule',
      outcomeMetadata: expect.objectContaining({
        operationCount: 3,
      }),
      runtimeConsumerObservationQueryExec: 'runtime-observation-query-exec',
    }))
  })

  it('rejects recommendation adoption by read-only project members', async () => {
    const response = await request(buildApp())
      .post('/api/projects/project-1/schedule-acceleration/recommendations/adopt')
      .set('x-test-project-permission', 'viewer')
      .send({
        proposal: {
          source: 'target_end_compression',
          targetEndDate: '2027-03-31',
          naturalEndDate: '2027-04-30',
          totalRecoverDays: 12,
        },
      })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.recordScheduleAccelerationRecommendationAdoption).not.toHaveBeenCalled()
  })
})
