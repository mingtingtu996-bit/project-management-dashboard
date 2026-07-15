import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const state = vi.hoisted(() => ({
  tables: {
    duration_algorithm_accuracy_events: [] as Row[],
    duration_forecast_project_overlays: [] as Row[],
  },
  replayReport: null as Row | null,
  replayCalls: [] as Row[],
  upserts: [] as Array<{ table: string; row: Row }>,
  inserts: [] as Array<{ table: string; row: Row }>,
  updates: [] as Array<{ table: string; payload: Row; filters: Array<{ column: string; value: unknown }> }>,
  directSqlMode: false,
  executeSqlCalls: [] as Array<{ sql: string; params: unknown[] }>,
  executeSqlResults: [] as Row[][],
  rejectMissingOverlayOvercompensationRate: false,
  selectFailures: new Set<string>(),
  replayError: null as Error | null,
}))

function rowsFor(table: string) {
  return (state.tables as Record<string, Row[]>)[table] ?? []
}

function buildQuery(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  let limitCount: number | null = null
  let selectError: Row | null = null

  const applyFilters = () => {
    let rows = rowsFor(table)
    for (const filter of filters) {
      const filterValue = filter.value
      rows = Array.isArray(filterValue)
        ? rows.filter((row) => filterValue.includes(row[filter.column]))
        : rows.filter((row) => row[filter.column] === filter.value)
    }
    return limitCount == null ? rows : rows.slice(0, limitCount)
  }

  const query: any = {
    select: vi.fn((columns?: string) => {
      if (
        table === 'duration_forecast_project_overlays'
        && state.rejectMissingOverlayOvercompensationRate
        && String(columns ?? '').split(',').map((column) => column.trim()).includes('overcompensation_rate')
      ) {
        selectError = {
          code: '42703',
          message: 'column duration_forecast_project_overlays.overcompensation_rate does not exist',
        }
      }
      return query
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return query
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      filters.push({ column, value: values })
      return query
    }),
    order: vi.fn(() => query),
    limit: vi.fn((count: number) => {
      limitCount = count
      return query
    }),
    maybeSingle: vi.fn(async () => ({
      data: selectError ? null : applyFilters()[0] ?? null,
      error: selectError,
    })),
    insert: vi.fn(async (payload: Row | Row[]) => {
      const rows = Array.isArray(payload) ? payload : [payload]
      rowsFor(table).push(...rows)
      for (const row of rows) state.inserts.push({ table, row })
      return { data: payload, error: null }
    }),
    upsert: vi.fn(async (payload: Row | Row[]) => {
      const rows = Array.isArray(payload) ? payload : [payload]
      rowsFor(table).push(...rows)
      for (const row of rows) state.upserts.push({ table, row })
      return { data: payload, error: null }
    }),
    update: vi.fn((payload: Row) => {
      const updateFilters: Array<{ column: string; value: unknown }> = []
      const updateQuery: any = {
        eq: vi.fn((column: string, value: unknown) => {
          updateFilters.push({ column, value })
          return updateQuery
        }),
        then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
          const rows = rowsFor(table)
          for (const row of rows) {
            if (updateFilters.every((filter) => row[filter.column] === filter.value)) Object.assign(row, payload)
          }
          state.updates.push({ table, payload, filters: updateFilters })
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        },
      }
      return updateQuery
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
      const forcedError = state.selectFailures.has(table)
        ? { code: 'READ_FAILED', message: `${table} read failed` }
        : null
      return Promise.resolve({
        data: selectError || forcedError ? null : applyFilters(),
        error: selectError ?? forcedError,
      }).then(resolve, reject)
    },
  }

  return query
}

vi.mock('../services/dbService.js', () => ({
  usesDirectSqlRuntimePath: vi.fn(() => state.directSqlMode),
  executeSQL: vi.fn(async (sql: string, params: unknown[] = []) => {
    state.executeSqlCalls.push({ sql, params })
    return state.executeSqlResults.shift() ?? [{ persisted: true }]
  }),
  supabase: {
    from: vi.fn((table: string) => buildQuery(table)),
  },
}))

vi.mock('../services/standardWorkDurationSeedReplayGovernanceService.js', () => ({
  buildStandardWorkDurationSeedReplayGovernanceReport: vi.fn(async (options: Row = {}) => {
    state.replayCalls.push(options)
    if (state.replayError) throw state.replayError
    return state.replayReport ?? {
    replay: {
      summary: {
        eligibleSampleCount: 0,
        evaluatedCodeCount: 0,
        overallWithinThirtyPercentRatio: null,
      },
      byStandardWorkCode: [],
    },
  }
  }),
}))

const {
  backtestEarliestPendingDurationAccuracyPrediction,
  getDurationAlgorithmAccuracySummary,
  recordDurationAccuracyBacktest,
  recordDurationAccuracyPrediction,
} = await import('../services/durationAlgorithmAccuracyService.js')

describe('durationAlgorithmAccuracyService', () => {
  beforeEach(() => {
    state.tables.duration_algorithm_accuracy_events = []
    state.tables.duration_forecast_project_overlays = []
    state.replayReport = null
    state.replayCalls = []
    state.upserts = []
    state.inserts = []
    state.updates = []
    state.directSqlMode = false
    state.executeSqlCalls = []
    state.executeSqlResults = []
    state.rejectMissingOverlayOvercompensationRate = false
    state.selectFailures.clear()
    state.replayError = null
  })

  it('keeps the remaining forecast accuracy metric when the live overlay schema has no phantom overcompensation column', async () => {
    state.rejectMissingOverlayOvercompensationRate = true
    state.tables.duration_forecast_project_overlays.push({
      project_id: 'project-1',
      model_key: 'remaining_duration_forecast',
      model_version: 'remaining_duration_forecast_v1.1',
      overlay_status: 'active_candidate',
      sample_count: 4,
      mean_absolute_error_days: 1.5,
      bias_error_days: -0.25,
      updated_at: '2026-07-14T00:00:00.000Z',
    })

    const summary = await getDurationAlgorithmAccuracySummary({ projectId: 'project-1' })

    expect(summary.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engineCode: 'task_remaining_forecast',
        sampleCount: 4,
        maeDays: 1.5,
        biasDays: -0.25,
        overcompensationRate: null,
        source: 'duration_forecast_project_overlays',
      }),
    ]))
  })


  it('reports ok when configured accuracy sources are readable even with zero samples', async () => {
    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.dataStatus).toBe('ok')
    expect(summary.sourceErrors).toEqual([])
  })

  it('distinguishes partial source failure from a real zero-sample result', async () => {
    state.selectFailures.add('duration_algorithm_accuracy_events')

    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.dataStatus).toBe('partial')
    expect(summary.sourceErrors).toEqual([
      {
        source: 'duration_algorithm_accuracy_events',
        code: 'duration_accuracy_events_read_failed',
      },
    ])
  })

  it('reports unavailable when every configured accuracy source fails', async () => {
    state.selectFailures.add('duration_algorithm_accuracy_events')
    state.selectFailures.add('duration_forecast_project_overlays')
    state.replayError = new Error('standard replay failed')

    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.dataStatus).toBe('unavailable')
    expect(summary.sourceErrors.map((item) => item.source)).toEqual([
      'duration_algorithm_accuracy_events',
      'duration_forecast_project_overlays',
      'standard_work_duration_seed_replay',
    ])
  })

  it('records governed prediction snapshots with a single cross-engine contract', async () => {
    await recordDurationAccuracyPrediction({
      engineCode: 'critical_path_cpm',
      outputKind: 'critical_path_project_duration',
      projectId: 'project-1',
      dedupeKey: 'project-1:2026-06-01:critical_path_cpm',
      predictedStartDate: '2026-06-01',
      predictedFinishDate: '2026-06-10',
      modelVersion: 'cpm_v1',
      predictionContext: { criticalTaskIds: ['task-a'] },
    })

    expect(state.upserts[0]).toEqual(expect.objectContaining({
      table: 'duration_algorithm_accuracy_events',
      row: expect.objectContaining({
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        dedupe_key: 'project-1:2026-06-01:critical_path_cpm',
        predicted_duration_days: 10,
        predicted_start_date: '2026-06-01',
        predicted_finish_date: '2026-06-10',
        backtest_status: 'prediction_pending',
        prediction_context: expect.objectContaining({ criticalTaskIds: ['task-a'] }),
      }),
    }))
  })

  it('upserts prediction snapshots through the low-privilege direct SQL runtime path', async () => {
    state.directSqlMode = true

    await recordDurationAccuracyPrediction({
      engineCode: 'project_remaining_forecast',
      outputKind: 'project_remaining_forecast',
      projectId: 'project-1',
      dedupeKey: 'project-1:2026-07-14:project_remaining_forecast',
      predictedStartDate: '2026-07-14',
      predictedFinishDate: '2026-07-20',
      predictedDurationDays: 7,
      predictionBasis: 'runtime_project_remaining_forecast',
      modelVersion: 'project_remaining_forecast_v1',
      runtimeConsumptionState: 'runtime_project_remaining_forecast',
    })

    expect(state.executeSqlCalls).toHaveLength(1)
    expect(state.executeSqlCalls[0]?.sql).toContain('INSERT INTO public.duration_algorithm_accuracy_events')
    expect(state.executeSqlCalls[0]?.sql).toContain('ON CONFLICT (engine_code, dedupe_key) DO UPDATE')
    expect(state.executeSqlCalls[0]?.params).toEqual(expect.arrayContaining([
      'project-1',
      'project_remaining_forecast',
      'project-1:2026-07-14:project_remaining_forecast',
      '2026-07-14',
      '2026-07-20',
      7,
    ]))
    expect(state.upserts).toEqual([])
  })

  it('persists v1.4.22.4 seed and network lineage on prediction events', async () => {
    await recordDurationAccuracyPrediction({
      engineCode: 'standard_duration_reference',
      outputKind: 'new_task_reference_duration',
      projectId: 'project-1',
      taskId: 'task-1',
      dedupeKey: 'project-1:task-1:duration-reference',
      predictedDurationDays: 12,
      predictionBasis: 'seed_only',
      modelVersion: 'standard_duration_seed_v1',
      runtimeConsumptionState: 'seed_only',
      seedLineage: {
        standardWorkDurationSeedVersion: 'v1.4.22-standard-duration',
        standardWorkCodeSource: 'explicit_standard_work_code',
      },
      networkLineage: {
        wbsTemplateVersion: 'template-v3',
        dependencyRuleVersion: 'dependency-rules-v2',
        criticalPathInputHash: 'critical-hash-1',
      },
    } as any)

    expect(state.upserts[0]).toEqual(expect.objectContaining({
      table: 'duration_algorithm_accuracy_events',
      row: expect.objectContaining({
        runtime_consumption_state: 'seed_only',
        seed_lineage: {
          standardWorkDurationSeedVersion: 'v1.4.22-standard-duration',
          standardWorkCodeSource: 'explicit_standard_work_code',
        },
        network_lineage: {
          wbsTemplateVersion: 'template-v3',
          dependencyRuleVersion: 'dependency-rules-v2',
          criticalPathInputHash: 'critical-hash-1',
        },
        prediction_context: expect.objectContaining({
          seedLineage: expect.objectContaining({
            standardWorkDurationSeedVersion: 'v1.4.22-standard-duration',
          }),
          networkLineage: expect.objectContaining({
            wbsTemplateVersion: 'template-v3',
          }),
        }),
      }),
    }))
  })

  it('blocks construction organization accuracy predictions without structured business type attribution', async () => {
    const result = await recordDurationAccuracyPrediction({
      engineCode: 'critical_path_cpm',
      outputKind: 'critical_path_project_duration',
      projectId: 'project-1',
      dedupeKey: 'project-1:construction-org:critical-path',
      predictedDurationDays: 180,
      predictionContext: {
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network:option-ready',
      },
    })

    expect(result).toBeNull()
    expect(state.upserts).toEqual([])
    expect(state.inserts).toEqual([])
    expect(state.tables.duration_algorithm_accuracy_events).toEqual([])
  })

  it('backfills actuals and computes signed forecast error in days', async () => {
    state.tables.duration_algorithm_accuracy_events.push({
      id: 'prediction-1',
      engine_code: 'project_remaining_forecast',
      output_kind: 'project_remaining_forecast',
      project_id: 'project-1',
      predicted_duration_days: 20,
      model_version: 'project_remaining_v1',
      prediction_basis: 'runtime_snapshot',
      backtest_status: 'prediction_pending',
      predicted_at: '2026-06-01T00:00:00.000Z',
    })

    await recordDurationAccuracyBacktest({
      predictionId: 'prediction-1',
      actualDurationDays: 24,
      actualFinishDate: '2026-06-24',
    })

    expect(state.tables.duration_algorithm_accuracy_events[0]).toMatchObject({
      actual_duration_days: 24,
      actual_finish_date: '2026-06-24',
      signed_error_days: 4,
      absolute_error_days: 4,
      backtest_status: 'backtested',
    })
  })

  it('loads and backtests prediction snapshots through the direct SQL runtime path', async () => {
    state.directSqlMode = true
    state.executeSqlResults = [
      [{
        id: 'prediction-direct-1',
        engine_code: 'project_remaining_forecast',
        dedupe_key: 'project-1:2026-07-14:project_remaining_forecast',
        predicted_duration_days: 7,
        predicted_finish_date: '2026-07-20',
        prediction_context: {},
      }],
      [{ id: 'prediction-direct-1', backtest_status: 'backtested' }],
    ]

    await recordDurationAccuracyBacktest({
      engineCode: 'project_remaining_forecast',
      dedupeKey: 'project-1:2026-07-14:project_remaining_forecast',
      actualDurationDays: 9,
      actualFinishDate: '2026-07-22',
    })

    expect(state.executeSqlCalls).toHaveLength(2)
    expect(state.executeSqlCalls[0]?.sql).toContain('FROM public.duration_algorithm_accuracy_events')
    expect(state.executeSqlCalls[0]?.params).toEqual([
      'project_remaining_forecast',
      'project-1:2026-07-14:project_remaining_forecast',
    ])
    expect(state.executeSqlCalls[1]?.sql).toContain('UPDATE public.duration_algorithm_accuracy_events')
    expect(state.executeSqlCalls[1]?.sql).toContain('WHERE id = ?')
    expect(state.executeSqlCalls[1]?.params).toEqual(expect.arrayContaining([
      '2026-07-22',
      9,
      2,
      2,
      'backtested',
      'prediction-direct-1',
    ]))
    expect(state.updates).toEqual([])
  })

  it('closes the earliest pending forward prediction for an engine without reusing the current dedupe key', async () => {
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'early-prediction',
        engine_code: 'project_remaining_forecast',
        output_kind: 'project_remaining_forecast',
        project_id: 'project-1',
        dedupe_key: 'project-1:2026-06-01:project_remaining_forecast',
        predicted_duration_days: 20,
        predicted_at: '2026-06-01T00:00:00.000Z',
        backtest_status: 'prediction_pending',
      },
      {
        id: 'current-prediction',
        engine_code: 'project_remaining_forecast',
        output_kind: 'project_remaining_forecast',
        project_id: 'project-1',
        dedupe_key: 'project-1:2026-06-20:project_remaining_forecast',
        predicted_duration_days: 5,
        predicted_at: '2026-06-20T00:00:00.000Z',
        backtest_status: 'prediction_pending',
      },
    )

    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: 'project-1',
      engineCode: 'project_remaining_forecast',
      actualStartDate: '2026-06-20',
      actualFinishDate: '2026-06-24',
      actualDurationDays: 5,
    })

    expect(state.tables.duration_algorithm_accuracy_events[0]).toMatchObject({
      id: 'early-prediction',
      actual_duration_days: 5,
      signed_error_days: -15,
      backtest_status: 'backtested',
    })
    expect(state.tables.duration_algorithm_accuracy_events[1]).toMatchObject({
      id: 'current-prediction',
      backtest_status: 'prediction_pending',
    })
  })

  it('uses the prediction start date as the T0 anchor when closing an earliest pending prediction', async () => {
    state.tables.duration_algorithm_accuracy_events.push({
      id: 'early-prediction-with-t0',
      engine_code: 'project_remaining_forecast',
      output_kind: 'project_remaining_forecast',
      project_id: 'project-1',
      dedupe_key: 'project-1:2026-06-01:project_remaining_forecast',
      predicted_start_date: '2026-06-01',
      predicted_duration_days: 20,
      predicted_at: '2026-06-01T00:00:00.000Z',
      backtest_status: 'prediction_pending',
    })

    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: 'project-1',
      engineCode: 'project_remaining_forecast',
      actualFinishDate: '2026-06-24',
    })

    expect(state.tables.duration_algorithm_accuracy_events[0]).toMatchObject({
      id: 'early-prediction-with-t0',
      actual_finish_date: '2026-06-24',
      actual_start_date: '2026-06-01',
      actual_duration_days: 24,
      signed_error_days: 4,
      absolute_error_days: 4,
      backtest_status: 'backtested',
    })
  })

  it('requires an actual start before computing production-day actual duration across shutdown windows', async () => {
    state.tables.duration_algorithm_accuracy_events.push({
      id: 'production-day-prediction',
      engine_code: 'project_remaining_forecast',
      output_kind: 'project_remaining_forecast',
      project_id: 'project-1',
      dedupe_key: 'project-1:2026-02-14:project_remaining_forecast',
      predicted_start_date: '2026-02-14',
      predicted_finish_date: '2026-02-18',
      predicted_duration_days: 2,
      predicted_at: '2026-02-14T00:00:00.000Z',
      backtest_status: 'prediction_pending',
      prediction_context: {
        durationDayUnit: 'construction_production_day',
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'spring_festival_2026',
            startDate: '2026-02-15',
            endDate: '2026-02-17',
            counts_as_construction_shutdown: true,
          }],
        },
      },
    })

    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: 'project-1',
      engineCode: 'project_remaining_forecast',
      actualFinishDate: '2026-02-18',
    })

    expect(state.tables.duration_algorithm_accuracy_events[0]).toMatchObject({
      actual_start_date: '2026-02-14',
      actual_finish_date: '2026-02-18',
      actual_duration_days: 2,
      signed_error_days: 0,
      absolute_error_days: 0,
      backtest_status: 'backtested',
    })
  })

  it('filters pending prediction backtests by task id when provided', async () => {
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'other-task-prediction',
        engine_code: 'task_remaining_forecast',
        output_kind: 'remaining_duration_forecast',
        project_id: 'project-1',
        task_id: 'task-other',
        predicted_duration_days: 9,
        predicted_at: '2026-06-01T00:00:00.000Z',
        backtest_status: 'prediction_pending',
      },
      {
        id: 'target-task-prediction',
        engine_code: 'task_remaining_forecast',
        output_kind: 'remaining_duration_forecast',
        project_id: 'project-1',
        task_id: 'task-target',
        predicted_duration_days: 5,
        predicted_at: '2026-06-02T00:00:00.000Z',
        backtest_status: 'prediction_pending',
      },
    )

    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: 'project-1',
      taskId: 'task-target',
      engineCode: 'task_remaining_forecast',
      actualStartDate: '2026-06-02',
      actualFinishDate: '2026-06-06',
      actualDurationDays: 5,
    } as any)

    expect(state.tables.duration_algorithm_accuracy_events[0]).toMatchObject({
      id: 'other-task-prediction',
      backtest_status: 'prediction_pending',
    })
    expect(state.tables.duration_algorithm_accuracy_events[1]).toMatchObject({
      id: 'target-task-prediction',
      actual_duration_days: 5,
      signed_error_days: 0,
      backtest_status: 'backtested',
    })
  })

  it('summarizes event rows and the existing task remaining overlay in one read model', async () => {
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'cpm-1',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        model_version: 'cpm_v1',
        prediction_basis: 'runtime_snapshot',
        predicted_duration_days: 20,
        actual_duration_days: 22,
        signed_error_days: 2,
        absolute_error_days: 2,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
      {
        id: 'cpm-2',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        model_version: 'cpm_v1',
        prediction_basis: 'runtime_snapshot',
        predicted_duration_days: 30,
        actual_duration_days: 26,
        signed_error_days: -4,
        absolute_error_days: 4,
        backtest_status: 'backtested',
        backtested_at: '2026-06-21T00:00:00.000Z',
      },
    )
    state.tables.duration_forecast_project_overlays.push({
      project_id: 'project-1',
      model_key: 'remaining_duration_forecast',
      model_version: 'remaining_duration_forecast_v1.1',
      overlay_status: 'active_candidate',
      sample_count: 8,
      mean_absolute_error_days: 1.75,
      bias_error_days: -0.25,
      updated_at: '2026-06-22T00:00:00.000Z',
    })

    const summary = await getDurationAlgorithmAccuracySummary({ projectId: 'project-1' })

    expect(summary.projectId).toBe('project-1')
    expect(summary.engineCount).toBe(5)
    expect(summary.metrics.map((metric) => metric.engineCode).sort()).toEqual([
      'critical_path_cpm',
      'project_remaining_forecast',
      'schedule_acceleration_target',
      'standard_duration_reference',
      'task_remaining_forecast',
    ])
    expect(summary.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engineCode: 'standard_duration_reference',
        sampleCount: 0,
        metricBasis: 'standardWorkDurationSeedReplayService.medianAbsolutePercentageError',
        status: 'report_only_replay_not_runtime_backtest',
        source: 'standard_work_duration_seed_replay',
      }),
      expect.objectContaining({
        engineCode: 'critical_path_cpm',
        sampleCount: 2,
        maeDays: 3,
        biasDays: -1,
        mape: expect.closeTo(12.24, 2),
        hitRate: 0.5,
        status: 'backtested',
      }),
      expect.objectContaining({
        engineCode: 'task_remaining_forecast',
        sampleCount: 8,
        maeDays: 1.75,
        biasDays: -0.25,
        metricBasis: 'task_duration_forecasts.forecast_error_days',
        status: 'active_candidate',
      }),
      expect.objectContaining({
        engineCode: 'project_remaining_forecast',
        sampleCount: 0,
        status: 'no_accuracy_samples',
      }),
      expect.objectContaining({
        engineCode: 'schedule_acceleration_target',
        sampleCount: 0,
        status: 'no_accuracy_samples',
      }),
    ]))
  })

  it('summarizes accuracy events and forecast overlays through the direct SQL runtime path', async () => {
    state.directSqlMode = true
    state.executeSqlResults = [
      [{
        id: 'project-forecast-direct-1',
        project_id: 'project-1',
        engine_code: 'project_remaining_forecast',
        output_kind: 'project_remaining_forecast',
        prediction_basis: 'runtime_project_remaining_forecast',
        model_version: 'project_remaining_forecast_v1',
        predicted_duration_days: 7,
        actual_duration_days: 9,
        signed_error_days: 2,
        absolute_error_days: 2,
        backtest_status: 'backtested',
        backtested_at: '2026-07-22T00:00:00.000Z',
      }],
      [{
        project_id: 'project-1',
        model_key: 'remaining_duration_forecast',
        model_version: 'remaining_duration_forecast_v1.1',
        overlay_status: 'active_candidate',
        sample_count: 4,
        mean_absolute_error_days: 1.5,
        bias_error_days: -0.25,
        updated_at: '2026-07-22T00:00:00.000Z',
      }],
    ]

    const summary = await getDurationAlgorithmAccuracySummary({ projectId: 'project-1' })

    expect(state.executeSqlCalls).toHaveLength(2)
    expect(state.executeSqlCalls[0]?.sql).toContain('FROM public.duration_algorithm_accuracy_events')
    expect(state.executeSqlCalls[1]?.sql).toContain('FROM public.duration_forecast_project_overlays')
    expect(summary.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engineCode: 'project_remaining_forecast',
        sampleCount: 1,
        maeDays: 2,
        source: 'duration_algorithm_accuracy_events',
      }),
      expect.objectContaining({
        engineCode: 'task_remaining_forecast',
        sampleCount: 4,
        maeDays: 1.5,
        source: 'duration_forecast_project_overlays',
      }),
    ]))
  })

  it('summarizes MdAE and overcompensation rate for backtested prediction events', async () => {
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'overlay-1',
        engine_code: 'task_remaining_forecast',
        output_kind: 'remaining_duration_forecast',
        project_id: 'project-1',
        model_version: 'remaining_v2',
        prediction_basis: 'residual_overlay_canary',
        predicted_duration_days: 10,
        actual_duration_days: 12,
        signed_error_days: 2,
        absolute_error_days: 2,
        baseline_absolute_error_days: 5,
        overcompensated: false,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
      {
        id: 'overlay-2',
        engine_code: 'task_remaining_forecast',
        output_kind: 'remaining_duration_forecast',
        project_id: 'project-1',
        model_version: 'remaining_v2',
        prediction_basis: 'residual_overlay_canary',
        predicted_duration_days: 20,
        actual_duration_days: 14,
        signed_error_days: -6,
        absolute_error_days: 6,
        baseline_absolute_error_days: 3,
        overcompensated: true,
        backtest_status: 'backtested',
        backtested_at: '2026-06-21T00:00:00.000Z',
      },
      {
        id: 'overlay-3',
        engine_code: 'task_remaining_forecast',
        output_kind: 'remaining_duration_forecast',
        project_id: 'project-1',
        model_version: 'remaining_v2',
        prediction_basis: 'residual_overlay_canary',
        predicted_duration_days: 30,
        actual_duration_days: 34,
        signed_error_days: 4,
        absolute_error_days: 4,
        baseline_absolute_error_days: 7,
        overcompensated: false,
        backtest_status: 'backtested',
        backtested_at: '2026-06-22T00:00:00.000Z',
      },
    )

    const summary = await getDurationAlgorithmAccuracySummary({
      projectId: 'project-1',
      engineCode: 'task_remaining_forecast',
    })

    expect(summary.metrics).toEqual([
      expect.objectContaining({
        engineCode: 'task_remaining_forecast',
        sampleCount: 3,
        maeDays: 4,
        mdAeDays: 4,
        biasDays: 0,
        overcompensationRate: expect.closeTo(0.333, 3),
      }),
    ])
  })

  it('surfaces standard reference duration accuracy from real seed replay MAPE and within-30 hit rate', async () => {
    state.replayReport = {
      replay: {
        summary: {
          eligibleSampleCount: 9,
          evaluatedCodeCount: 2,
          overallWithinThirtyPercentRatio: 7 / 9,
        },
        byStandardWorkCode: [
          { sampleCount: 6, medianAbsolutePercentageError: 0.1 },
          { sampleCount: 3, medianAbsolutePercentageError: 0.4 },
        ],
      },
    }

    const summary = await getDurationAlgorithmAccuracySummary({ engineCode: 'standard_duration_reference' })

    expect(summary.metrics).toEqual([
      expect.objectContaining({
        engineCode: 'standard_duration_reference',
        sampleCount: 9,
        mape: 20,
        hitRate: expect.closeTo(0.778, 3),
        status: 'report_only_replay_backtested',
        metricBasis: 'standardWorkDurationSeedReplayService.medianAbsolutePercentageError',
      }),
    ])
  })

  it('scopes summary rows to the provided project id allow-list', async () => {
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'company-1-cpm',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        model_version: 'cpm_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 10,
        signed_error_days: 2,
        absolute_error_days: 2,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
      {
        id: 'company-2-cpm',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-2',
        model_version: 'cpm_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 10,
        signed_error_days: 20,
        absolute_error_days: 20,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
    )
    state.tables.duration_forecast_project_overlays.push(
      {
        project_id: 'project-1',
        model_key: 'remaining_duration_forecast',
        model_version: 'remaining_duration_forecast_v1',
        overlay_status: 'active_candidate',
        sample_count: 4,
        mean_absolute_error_days: 1,
      },
      {
        project_id: 'project-2',
        model_key: 'remaining_duration_forecast',
        model_version: 'remaining_duration_forecast_v1',
        overlay_status: 'active_candidate',
        sample_count: 40,
        mean_absolute_error_days: 10,
      },
    )

    const summary = await getDurationAlgorithmAccuracySummary({
      projectIds: ['project-1'],
    })

    expect(summary.projectIds).toEqual(['project-1'])
    expect(summary.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        engineCode: 'critical_path_cpm',
        sampleCount: 1,
        maeDays: 2,
      }),
      expect.objectContaining({
        engineCode: 'task_remaining_forecast',
        sampleCount: 4,
        maeDays: 1,
      }),
    ]))
  })

  it('keeps an explicitly empty project allow-list empty in direct SQL mode', async () => {
    state.directSqlMode = true

    const summary = await getDurationAlgorithmAccuracySummary({ projectIds: [] })

    expect(state.executeSqlCalls).toEqual([])
    expect(summary.metrics.every((metric) => metric.sampleCount === 0)).toBe(true)
  })

  it('scopes standard duration replay samples to the current company', async () => {
    await getDurationAlgorithmAccuracySummary({
      companyId: 'company-1',
      projectIds: [],
      engineCode: 'standard_duration_reference',
    } as any)

    expect(state.replayCalls).toEqual([{
      companyId: 'company-1',
      projectId: null,
    }])
  })

  it('returns a default row for a requested engine before it has samples', async () => {
    const summary = await getDurationAlgorithmAccuracySummary({ engineCode: 'schedule_acceleration_target' })

    expect(summary.engineCount).toBe(1)
    expect(summary.metrics).toEqual([
      expect.objectContaining({
        engineCode: 'schedule_acceleration_target',
        outputKind: 'acceleration_target',
        sampleCount: 0,
        status: 'no_accuracy_samples',
      }),
    ])
  })

  it('does not hard-code Step 2 ready when structural evidence is missing', async () => {
    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.step2Readiness).toEqual(expect.objectContaining({
      readyForStep2: false,
      structuralReady: false,
      directionalBiasesCorrected: false,
      classABlockerCount: 0,
    }))
    expect(summary.step2Readiness?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'e2_curve_aware_spi_and_velocity_candidates',
        status: 'waiting',
      }),
      expect.objectContaining({
        code: 'e3_cpm_construction_calendar_day_unit_alignment',
        status: 'waiting',
      }),
      expect.objectContaining({
        code: 'e5_confidence_band_feasibility_verdict',
        status: 'waiting',
      }),
    ]))
    expect(summary.step2Readiness?.parameterDataStatus).toEqual(expect.objectContaining({
      status: 'data_collection_open',
      missingSampleEngineCodes: expect.arrayContaining([
        'standard_duration_reference',
        'task_remaining_forecast',
        'critical_path_cpm',
        'project_remaining_forecast',
        'schedule_acceleration_target',
      ]),
    }))
  })

  it('declares Step 2 structurally ready from minimum structural evidence while sample depth stays separate', async () => {
    state.replayReport = {
      replay: {
        summary: {
          eligibleSampleCount: 1,
          evaluatedCodeCount: 1,
          overallWithinThirtyPercentRatio: 1,
        },
        byStandardWorkCode: [
          { sampleCount: 1, medianAbsolutePercentageError: 0.1 },
        ],
      },
    }
    state.tables.duration_forecast_project_overlays.push({
      project_id: 'project-1',
      model_key: 'remaining_duration_forecast',
      model_version: 'remaining_duration_forecast_v1',
      overlay_status: 'active_candidate',
      sample_count: 1,
      mean_absolute_error_days: 1,
    })
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'cpm-1',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        model_version: 'critical_path_cpm_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 10,
        signed_error_days: 1,
        absolute_error_days: 1,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
      {
        id: 'acceleration-1',
        engine_code: 'schedule_acceleration_target',
        output_kind: 'acceleration_target',
        project_id: 'project-1',
        model_version: 'schedule_acceleration_target_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 5,
        signed_error_days: 1,
        absolute_error_days: 1,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
    )

    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.step2Readiness).toEqual(expect.objectContaining({
      readyForStep2: true,
      structuralReady: true,
      directionalBiasesCorrected: true,
      classABlockerCount: 0,
    }))
    expect(summary.step2Readiness?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'e1_project_company_system_benchmark_blend',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e2_generic_benchmark_variance_column',
        severity: 'CLASS_B',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e2_curve_aware_spi_and_velocity_candidates',
        severity: 'CLASS_A',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e2_back_heavy_structural_tail_reserve',
        severity: 'CLASS_A',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e3_cpm_construction_calendar_day_unit_alignment',
        severity: 'CLASS_A',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e5_confidence_band_feasibility_verdict',
        severity: 'CLASS_A',
        status: 'passed',
      }),
      expect.objectContaining({
        code: 'e5_network_slack_recovery_budget_factor',
        status: 'passed',
      }),
    ]))
    expect(summary.step2Readiness?.parameterDataStatus).toEqual(expect.objectContaining({
      status: 'data_collection_open',
      missingSampleEngineCodes: expect.arrayContaining([
        'standard_duration_reference',
        'task_remaining_forecast',
        'critical_path_cpm',
        'project_remaining_forecast',
        'schedule_acceleration_target',
      ]),
    }))
  })

  it('blocks Step 2 when a Class A structural gate has failed evidence', async () => {
    state.replayReport = {
      replay: {
        summary: {
          eligibleSampleCount: 1,
          evaluatedCodeCount: 1,
          overallWithinThirtyPercentRatio: 1,
        },
        byStandardWorkCode: [
          { sampleCount: 1, medianAbsolutePercentageError: 0.1 },
        ],
      },
    }
    state.tables.duration_forecast_project_overlays.push({
      project_id: 'project-1',
      model_key: 'remaining_duration_forecast',
      model_version: 'remaining_duration_forecast_v1',
      overlay_status: 'blocked',
      sample_count: 1,
      mean_absolute_error_days: 1,
    })
    state.tables.duration_algorithm_accuracy_events.push(
      {
        id: 'cpm-1',
        engine_code: 'critical_path_cpm',
        output_kind: 'critical_path_project_duration',
        project_id: 'project-1',
        model_version: 'critical_path_cpm_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 10,
        signed_error_days: 1,
        absolute_error_days: 1,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
      {
        id: 'acceleration-1',
        engine_code: 'schedule_acceleration_target',
        output_kind: 'acceleration_target',
        project_id: 'project-1',
        model_version: 'schedule_acceleration_target_v1',
        prediction_basis: 'runtime_snapshot',
        actual_duration_days: 5,
        signed_error_days: 1,
        absolute_error_days: 1,
        backtest_status: 'backtested',
        backtested_at: '2026-06-20T00:00:00.000Z',
      },
    )

    const summary = await getDurationAlgorithmAccuracySummary()

    expect(summary.step2Readiness).toEqual(expect.objectContaining({
      readyForStep2: false,
      structuralReady: false,
      directionalBiasesCorrected: false,
      classABlockerCount: 2,
    }))
    expect(summary.step2Readiness?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'e2_curve_aware_spi_and_velocity_candidates',
        severity: 'CLASS_A',
        status: 'blocked',
      }),
      expect.objectContaining({
        code: 'e2_back_heavy_structural_tail_reserve',
        severity: 'CLASS_A',
        status: 'blocked',
      }),
    ]))
    expect(summary.step2Readiness?.parameterDataStatus).toEqual(expect.objectContaining({
      status: 'data_collection_open',
    }))
  })
})
