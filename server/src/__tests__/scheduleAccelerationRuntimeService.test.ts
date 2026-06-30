import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTasks: vi.fn(),
  executeSQL: vi.fn(),
  loadEffectiveProjectScheduleState: vi.fn(),
  recordDurationAccuracyPrediction: vi.fn(),
  recordDurationAccuracyBacktest: vi.fn(),
  backtestEarliestPendingDurationAccuracyPrediction: vi.fn(),
  getProjectCriticalPathSnapshot: vi.fn(),
  listCurrentTaskDurationForecasts: vi.fn(),
  getTaskDurationSuggestion: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  getTasks: mocks.getTasks,
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/projectScheduleStateService.js', () => ({
  loadEffectiveProjectScheduleState: mocks.loadEffectiveProjectScheduleState,
}))

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  recordDurationAccuracyPrediction: mocks.recordDurationAccuracyPrediction,
  recordDurationAccuracyBacktest: mocks.recordDurationAccuracyBacktest,
  backtestEarliestPendingDurationAccuracyPrediction: mocks.backtestEarliestPendingDurationAccuracyPrediction,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
}))

vi.mock('../services/taskDurationForecastService.js', () => ({
  listCurrentTaskDurationForecasts: mocks.listCurrentTaskDurationForecasts,
}))

vi.mock('../services/durationSuggestionService.js', () => ({
  getTaskDurationSuggestion: mocks.getTaskDurationSuggestion,
}))

const {
  buildRuntimeProjectRemainingDurationForecast,
  evaluateRuntimeScheduleAcceleration,
  recordScheduleAccelerationRuntimeConsumption,
} = await import('../services/scheduleAccelerationRuntimeService.js')

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

describe('scheduleAccelerationRuntimeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-critical',
        project_id: 'project-1',
        title: 'Critical structure remaining work',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-20',
        status: 'in_progress',
        progress: 40,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
      {
        id: 'task-external-gate',
        project_id: 'project-1',
        title: 'Permanent power acceptance',
        planned_start_date: '2026-06-18',
        planned_end_date: '2026-06-28',
        status: 'todo',
        progress: 0,
        is_critical: false,
        total_float_days: 2,
        free_float_days: 1,
        standard_task_metadata: {
          durationContributionMode: 'external_wait',
          rowProjectionMode: 'schedule_row',
          constraintType: 'external_interface_wait',
          externalInterfaceCodes: ['permanent_power'],
        },
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) {
        return [
          { planned_end_date: '2026-06-30', commitment_status: 'planned', carryover_from_item_id: null },
          { planned_end_date: '2026-06-24', commitment_status: 'carried_over', carryover_from_item_id: 'monthly-0' },
          { planned_end_date: '2026-07-10', commitment_status: 'cancelled', carryover_from_item_id: null },
        ]
      }
      return []
    })
    mocks.loadEffectiveProjectScheduleState.mockResolvedValue({
      metrics: {
        hardBlockerCount: 1,
        resourcePressureScore: 0.4,
      },
      evidence: [{ code: 'milestone_pressure', value: 0.7 }],
      parallelDensityRatio: 0.3,
      deviationRecoveryDays: -8,
      state: 'recovery',
      localAccelerationFactor: 0.9,
    })
    mocks.recordDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.recordDurationAccuracyBacktest.mockResolvedValue(null)
    mocks.backtestEarliestPendingDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      watchedTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
    })
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([])
    mocks.getTaskDurationSuggestion.mockResolvedValue(null)
  })

  it('returns a governed project-level remaining forecast beside runtime acceleration feasibility', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.rowsEvaluated).toBe(2)
    expect(result.projectRemainingForecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: 21,
      forecastFinishDate: '2026-06-30',
      targetEndDate: '2026-06-25',
      targetGapDays: 5,
      rowsEvaluated: 2,
    }))
    expect(result.projectRemainingForecast.calculationContext).toEqual(expect.objectContaining({
      primaryLayer: 'projectGenerationFacts',
      projectFactsRole: 'primary',
      runtimeFactsRole: 'background',
      factWeights: expect.objectContaining({
        projectGenerationFacts: 0.65,
        runtimeExecutionFacts: 0.35,
      }),
      criticalPath: expect.objectContaining({
        remainingTaskCount: 1,
        latestCriticalFinishDate: '2026-06-20',
      }),
      monthlyCommitments: expect.objectContaining({
        activeCommitmentCount: 2,
        carryoverCommitmentCount: 1,
        latestCommitmentFinishDate: '2026-06-30',
      }),
      externalInterfaces: expect.objectContaining({
        hardGateCount: 1,
        latestGateFinishDate: '2026-06-28',
        overlappedRemainingDays: 11,
        overlappedGateFinishDate: '2026-06-28',
        gateTailDaysAfterInternal: 8,
        serialRemainingDays: 8,
        serializedGateFinishDate: '2026-06-28',
      }),
    }))
    expect(result.targetFeasibility?.scenario).toBe('runtime_delay_recovery')
    expect(result.targetFeasibility?.accelerationProposal?.calculationBasis.runtimeContext).toEqual(expect.objectContaining({
      runtimeInferenceSummary: expect.objectContaining({
        factType: 'inferred',
        sourcePolicy: 'existing_execution_state_only',
      }),
      evidenceObjects: expect.arrayContaining([
        expect.objectContaining({
          factType: 'inferred',
          strength: 'inferred',
          boundaryPolicy: expect.arrayContaining([
            'does_not_require_manual_site_resource_inputs',
            'does_not_rewrite_task_dates_or_static_project_facts',
            'confidence_only_when_source_window_is_sparse',
          ]),
        }),
      ]),
      evidenceCodes: expect.arrayContaining([
        'runtime_inference_advisory_only',
      ]),
    }))
  })

  it('passes construction calendar context into E4 project remaining forecasts', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'shutdown-sensitive',
        project_id: 'project-1',
        title: 'Shutdown-sensitive critical work',
        planned_start_date: '2026-02-14',
        planned_end_date: '2026-02-15',
        status: 'todo',
        progress: 0,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
    ])
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'shutdown-sensitive',
        remainingDurationDays: 2,
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-02-14',
      targetEndDate: '2026-02-15',
      context: {
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'spring_festival_2026',
            holidayName: 'Spring Festival construction shutdown',
            startDate: '2026-02-15',
            endDate: '2026-02-17',
            counts_as_construction_shutdown: true,
          }],
        },
      },
    })

    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-02-18')
    expect(result.projectRemainingForecast.projectRemainingForecastDays).toBe(2)
    expect(result.projectRemainingForecast.targetGapDays).toBe(1)
  })

  it('records project remaining and acceleration prediction snapshots for later accuracy backtest', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.projectRemainingForecastDays).toBe(21)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'project_remaining_forecast',
      outputKind: 'project_remaining_forecast',
      projectId: 'project-1',
      dedupeKey: 'project-1:2026-06-10:project_remaining_forecast',
      predictionSource: 'projectRemainingDurationForecastService',
      predictedStartDate: '2026-06-10',
      predictedFinishDate: '2026-06-30',
      predictedDurationDays: 21,
      seedLineage: expect.objectContaining({
        durationOutputCode: 'project_remaining_forecast',
      }),
      networkLineage: expect.objectContaining({
        rowCount: expect.any(Number),
        criticalRemainingTaskCount: expect.any(Number),
        activeMonthlyCommitmentCount: expect.any(Number),
        carryoverMonthlyCommitmentCount: expect.any(Number),
      }),
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'schedule_acceleration_target',
      outputKind: 'acceleration_target',
      projectId: 'project-1',
      dedupeKey: 'project-1:2026-06-10:acceleration_target:2026-06-25',
      predictedDurationDays: result.targetFeasibility?.accelerationProposal?.accelerationTargetDays,
    }))
  })

  it('backtests project remaining against the as-of to actual-finish remaining window using the earliest pending prediction', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-complete-a',
        project_id: 'project-1',
        title: 'Completed structure',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-18',
        actual_start_date: '2026-06-01',
        actual_end_date: '2026-06-20',
        status: 'completed',
        progress: 100,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: { rowProjectionMode: 'schedule_row', durationContributionMode: 'duration_bearing' },
      },
      {
        id: 'task-complete-b',
        project_id: 'project-1',
        title: 'Completed external gate',
        planned_start_date: '2026-06-18',
        planned_end_date: '2026-06-25',
        actual_start_date: '2026-06-18',
        actual_end_date: '2026-06-24',
        status: 'completed',
        progress: 100,
        is_critical: false,
        total_float_days: 2,
        free_float_days: 1,
        standard_task_metadata: { rowProjectionMode: 'schedule_row', durationContributionMode: 'external_wait' },
      },
    ])

    await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-20',
    })

    expect(mocks.recordDurationAccuracyBacktest).not.toHaveBeenCalled()
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'project_remaining_forecast',
      actualStartDate: '2026-06-20',
      actualFinishDate: '2026-06-24',
      actualDurationDays: 5,
      actualContext: expect.objectContaining({
        source: 'completed_runtime_schedule_rows',
        durationBasis: 'as_of_to_actual_finish_remaining_window',
      }),
    }))
  })

  it('only backtests acceleration accuracy for adopted recommendations and attributes recovered days', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-complete-critical',
        project_id: 'project-1',
        title: 'Completed critical acceleration work',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-30',
        actual_start_date: '2026-06-01',
        actual_end_date: '2026-06-24',
        status: 'completed',
        progress: 100,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: { rowProjectionMode: 'schedule_row', durationContributionMode: 'duration_bearing' },
      },
    ])

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-20',
    })

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'schedule_acceleration_target',
    }))

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-20',
      context: {
        runtime: {
          accelerationRecommendationAdopted: true,
        } as any,
      },
    })

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'schedule_acceleration_target',
      actualStartDate: '2026-06-20',
      actualFinishDate: '2026-06-24',
      actualDurationDays: 5,
      actualContext: expect.objectContaining({
        attribution: 'adopted_acceleration_recovery',
        naturalFinishDate: expect.any(String),
        actualRecoveryDays: expect.any(Number),
      }),
    }))
  })

  it('counts only live critical or near-critical rows in runtime context', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'baseline-critical-only',
        project_id: 'project-1',
        title: 'Frozen baseline critical only',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-12',
        status: 'todo',
        progress: 0,
        is_critical: false,
        baseline_is_critical: true,
        total_float_days: 12,
        free_float_days: 8,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
      {
        id: 'live-critical',
        project_id: 'project-1',
        title: 'Live critical work',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-20',
        status: 'todo',
        progress: 0,
        is_critical: true,
        baseline_is_critical: false,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
    ])

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.calculationContext.criticalPath.remainingTaskCount).toBe(1)
  })

  it('hydrates runtime rows from E3 critical snapshot and E2 forecast finish before building E4 project remaining forecast', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-from-e3',
        project_id: 'project-1',
        title: 'Task critical only in E3 snapshot',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-20',
        status: 'todo',
        progress: 0,
        is_critical: false,
        total_float_days: 12,
        free_float_days: 8,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
    ])
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: ['task-from-e3'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: ['task-from-e3'],
      watchedTaskIds: [],
      edges: [],
      tasks: [{ taskId: 'task-from-e3', title: 'Task critical only in E3 snapshot', floatDays: 0, durationDays: 4, isAutoCritical: true, isManualAttention: false, isManualInserted: false }],
      projectDurationDays: 4,
    })
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-from-e3',
        remainingDurationDays: 4,
        forecastFinishDate: '2026-06-26',
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-25',
    })

    expect(mocks.getProjectCriticalPathSnapshot).toHaveBeenCalledWith('project-1')
    expect(mocks.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(['task-from-e3'], expect.any(Object))
    expect(result.projectRemainingForecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-26',
    }))
    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-06-26')
  })

  it('hydrates E3 primary chain span into E4 critical-path span finish', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-primary-chain',
        project_id: 'project-1',
        title: 'Primary chain task',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-12',
        status: 'todo',
        progress: 0,
        is_critical: false,
        total_float_days: 9,
        free_float_days: 5,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
    ])
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: ['task-primary-chain'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: {
        taskIds: ['task-primary-chain'],
        totalDurationDays: 18,
      },
      alternateChains: [],
      displayTaskIds: ['task-primary-chain'],
      watchedTaskIds: [],
      edges: [],
      tasks: [{ taskId: 'task-primary-chain', title: 'Primary chain task', floatDays: 0, durationDays: 4, isAutoCritical: true, isManualAttention: false, isManualInserted: false }],
      projectDurationDays: 18,
    })
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-primary-chain',
        remainingDurationDays: 3,
        forecastFinishDate: '2026-06-12',
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      criticalPathSpanFinishDate: '2026-06-27',
    }))
    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-06-27')
  })

  it('hydrates E2 probability duration into E4 optimistic and P80 confidence-band finishes', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-with-probability',
        project_id: 'project-1',
        title: 'Task with probability forecast',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-12',
        status: 'todo',
        progress: 0,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
        },
      },
    ])
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-with-probability',
        remainingDurationDays: 4,
        forecastFinishDate: '2026-06-13',
        probabilityDuration: {
          method: 'pert_from_existing_percentiles',
          source: 'duration_forecast_percentiles',
          p20RemainingDays: 2,
          p50RemainingDays: 4,
          p80RemainingDays: 9,
          expectedRemainingDays: 5,
          variance: 1,
          standardDeviationDays: 1,
          confidenceBandWidthDays: 7,
        },
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      optimisticBandFinishDate: '2026-06-11',
      confidenceBandFinishDate: '2026-06-18',
    }))
    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-06-18')
  })

  it('hydrates E1 execution-reference duration suggestions so runtime crashing respects the governed P80 floor', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-crash-floor',
        project_id: 'project-1',
        title: 'Critical work with governed floor',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-20',
        status: 'todo',
        progress: 0,
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        standard_work_code: 'structure_standard_floor',
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
          rowProjectionMode: 'schedule_row',
          criticalPathEligible: true,
          resourceProfile: { resourceClass: 'rebar' },
          executionPhase: 'superstructure',
        },
      },
    ])
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-crash-floor',
        remainingDurationDays: 20,
        forecastFinishDate: '2026-06-20',
      },
    ])
    mocks.getTaskDurationSuggestion.mockResolvedValue({
      durationOutputCode: 'contextual_reference',
      recommendedDurationDays: 14,
      conservativeDurationDays: 18,
      contextualReferenceDays: 14,
      contextualReferenceP80Days: 18,
    })
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-15',
      asOfDate: '2026-06-10',
    })

    const crashing = result.targetFeasibility?.accelerationProposal?.actions.find((action) => action.type === 'crashing')
    const adjustment = crashing?.durationAdjustments.find((item) => item.clientRowId === 'task-crash-floor')

    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'task-crash-floor',
      standardWorkCode: 'structure_standard_floor',
      suggestionPurpose: 'execution_reference',
    }))
    expect(adjustment).toEqual(expect.objectContaining({
      minDurationDays: 18,
      proposedDurationDays: 18,
    }))
  })

  it('uses the frozen current baseline finish as target when no explicit target override is provided', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      if (sql.includes('task_baselines')) {
        return [{
          id: 'baseline-current',
          status: 'confirmed',
          version: 2,
          confirmed_at: '2026-05-01T00:00:00.000Z',
        }]
      }
      if (sql.includes('task_baseline_items')) {
        return [
          { planned_end_date: '2026-06-18' },
          { planned_end_date: '2026-06-25' },
        ]
      }
      return []
    })

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.targetEndDate).toBe('2026-06-25')
    expect(result.targetFeasibility?.targetEndDate).toBe('2026-06-25')
  })

  it('records v1.4.22.5 runtime consumer evidence for critical-path artifacts consumed by runtime acceleration', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordScheduleAccelerationRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      runtimeEntryRef: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
      observedAt: '2026-06-15T08:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v6',
          publicationStatus: 'runtime_published',
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v6',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 1,
      blockedCount: 0,
      reasons: [],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'critical_path_rule_candidate',
        'critical_path_rule_runtime:critical-v6',
        'scheduleAccelerationRuntimeService',
        'schedule_acceleration_runtime',
      ],
    ])
  })

  it('records runtime consumer evidence from evaluateRuntimeScheduleAcceleration when critical-path rules are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T08:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'critical_path_rule_runtime:critical-v6',
          publicationStatus: 'runtime_published',
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'dependency_rule_runtime:dependency-v6',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result.targetFeasibility?.scenario).toBe('runtime_delay_recovery')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'critical_path_rule_candidate',
        'critical_path_rule_runtime:critical-v6',
        'scheduleAccelerationRuntimeService',
        'schedule_acceleration_runtime',
      ],
    ])
  })
})
