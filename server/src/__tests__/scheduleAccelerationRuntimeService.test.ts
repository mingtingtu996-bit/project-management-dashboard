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
  resolveConstructionCalendarContext: vi.fn(),
  hydrateDurationAlgorithmInput: vi.fn(),
  query: vi.fn(),
  withDatabaseTransaction: vi.fn(),
}))

vi.mock('../database.js', async () => {
  const actual = await vi.importActual<typeof import('../database.js')>('../database.js')
  return {
    ...actual,
    query: mocks.query,
    withDatabaseTransaction: mocks.withDatabaseTransaction,
  }
})

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

vi.mock('../services/durationAlgorithmInputHydrationService.js', () => ({
  hydrateDurationAlgorithmInput: mocks.hydrateDurationAlgorithmInput,
}))

vi.mock('../services/constructionCalendar.js', async () => {
  const actual = await vi.importActual<typeof import('../services/constructionCalendar.js')>('../services/constructionCalendar.js')
  return {
    ...actual,
    resolveConstructionCalendarContext: mocks.resolveConstructionCalendarContext,
  }
})

const {
  buildRuntimeScheduleAccelerationRows,
  buildRuntimeScheduleAccelerationRowsWithDiagnostics,
  buildRuntimeProjectRemainingDurationForecast,
  buildScheduleAccelerationRecommendationKey,
  clearProjectRemainingForecastRuntimeCacheForTest,
  evaluateRuntimeScheduleAcceleration,
  recordScheduleAccelerationRecommendationAdoption,
  recordScheduleAccelerationRuntimeConsumption,
} = await import('../services/scheduleAccelerationRuntimeService.js')
const { buildTaskCommitRequestHash } = await import('../services/taskCommitIdempotencyService.js')

function buildAvailableDurationMetric(
  value: number,
  unit: 'calendar_day' | 'construction_production_day',
  asOf = '2027-02-15',
) {
  return {
    value,
    unit,
    calendarRef: unit === 'calendar_day' ? 'gregorian' : 'work_calendar',
    calendarVersion: unit === 'calendar_day' ? 'ISO-8601' : 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf,
    availability: 'available' as const,
    unavailableReason: null,
  }
}

function buildAuthoritativeAccelerationProposal(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'preview_only' as const,
    source: 'target_end_compression' as const,
    targetEndDate: '2027-03-31',
    naturalEndDate: '2027-04-30',
    overshootDays: 30,
    overshoot: buildAvailableDurationMetric(30, 'calendar_day'),
    totalRecoverDays: 12,
    totalRecover: buildAvailableDurationMetric(12, 'construction_production_day'),
    remainingGapDays: 18,
    remainingGap: buildAvailableDurationMetric(18, 'construction_production_day'),
    verdict: 'needs_scope_decision' as const,
    actions: [{
      type: 'fast_track' as const,
      affectedRowIds: ['task-1'],
      recoverDays: 12,
      recoverDuration: buildAvailableDurationMetric(12, 'construction_production_day'),
      rawRecoverDays: 12,
      reworkRiskDiscountDays: 0,
      effectiveRecoverDays: 12,
      riskLevel: 'medium' as const,
      explanation: 'authoritative acceleration proposal',
      dependencyAdjustments: [],
    }],
    protectedConstraints: [],
    rescheduleDraft: {
      mode: 'proposal_review' as const,
      source: 'target_end_compression' as const,
      writePolicy: 'requires_user_acceptance' as const,
      taskDateAdjustments: [],
      dependencyAdjustments: [],
      resourceAdjustments: [],
      operations: [{
        type: 'update_row' as const,
        rowId: 'task-1',
        values: { planned_end_date: '2027-04-18' },
      }],
    },
    ...overrides,
  }
}

function mockAuthoritativeAccelerationAdoption(overrides: {
  recommendation?: Record<string, unknown>
  commit?: Record<string, unknown>
} = {}) {
  const proposal = (overrides.recommendation?.proposal
    ?? buildAuthoritativeAccelerationProposal()) as ReturnType<typeof buildAuthoritativeAccelerationProposal>
  const recommendationHash = buildTaskCommitRequestHash(proposal)
  const operationsHash = buildTaskCommitRequestHash(proposal.rescheduleDraft.operations)
  mocks.query
    .mockResolvedValueOnce({
      rows: [{
        id: 'recommendation-1',
        project_id: 'project-1',
        recommendation_hash: recommendationHash,
        proposal,
        operations: proposal.rescheduleDraft.operations,
        operations_hash: operationsHash,
        issued_by: 'user-1',
        issued_at: '2027-02-15T00:00:00.000Z',
        expires_at: '2099-02-15T00:30:00.000Z',
        ...overrides.recommendation,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'commit-ledger-1',
        project_id: 'project-1',
        request_id: 'task-commit-request-1',
        requested_by: 'user-1',
        status: 'succeeded',
        recommendation_id: 'recommendation-1',
        recommendation_hash: recommendationHash,
        operations_hash: operationsHash,
        result_summary: { changedRowCount: 1 },
        completed_at: '2027-02-15T00:10:00.000Z',
        ...overrides.commit,
      }],
      rowCount: 1,
    })
  return { proposal, recommendationHash, operationsHash }
}

function mockSuccessfulAdoptionPersistence() {
  mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const sqlText = String(sql)
    if (sqlText.includes('SELECT id, adopted_at') && sqlText.includes('FROM recommendation_actions')) {
      return []
    }
    if (sqlText.includes('INSERT INTO recommendation_actions') && sqlText.includes('RETURNING id')) {
      return [{ id: `action:${String(params[2] ?? '')}`, adopted_at: params[8] }]
    }
    if (sqlText.includes('INSERT INTO duration_plan_network_outcomes') && sqlText.includes('RETURNING id')) {
      return [{ id: params[0] }]
    }
    return []
  })
}

async function recordAuthoritativeAccelerationAdoptionForTest(input: {
  projectId: string
  adoptedBy: string
  adoptedAt?: string
  recommendationId?: string
  taskCommitRequestId?: string
  taskCommitLedgerId?: string
  proposal?: Record<string, any>
  outcomeMetadata?: Record<string, unknown>
  runtimeConsumerObservationQueryExec?: ReturnType<typeof createRecordingQueryExec>['queryExec']
}) {
  const baseProposal = buildAuthoritativeAccelerationProposal()
  const proposal = buildAuthoritativeAccelerationProposal({
    ...(input.proposal ?? {}),
    overshoot: input.proposal?.overshoot ?? baseProposal.overshoot,
    totalRecover: input.proposal?.totalRecover ?? baseProposal.totalRecover,
    remainingGap: input.proposal?.remainingGap ?? baseProposal.remainingGap,
    actions: Array.isArray(input.proposal?.actions) && input.proposal.actions.length > 0
      ? input.proposal.actions
      : baseProposal.actions,
    protectedConstraints: input.proposal?.protectedConstraints ?? baseProposal.protectedConstraints,
    rescheduleDraft: input.proposal?.rescheduleDraft ?? baseProposal.rescheduleDraft,
  })
  const authority = mockAuthoritativeAccelerationAdoption({
    recommendation: { id: input.recommendationId ?? 'recommendation-1', proposal },
    commit: {
      id: input.taskCommitLedgerId ?? 'commit-ledger-1',
      request_id: input.taskCommitRequestId ?? 'task-commit-request-1',
      recommendation_id: input.recommendationId ?? 'recommendation-1',
      result_summary: {
        changedRowCount: proposal.rescheduleDraft.operations.length,
        ...(input.outcomeMetadata ?? {}),
      },
    },
  })
  return recordScheduleAccelerationRecommendationAdoption({
    projectId: input.projectId,
    adoptedBy: input.adoptedBy,
    adoptedAt: input.adoptedAt,
    recommendationId: input.recommendationId ?? 'recommendation-1',
    recommendationHash: authority.recommendationHash,
    taskCommitRequestId: input.taskCommitRequestId ?? 'task-commit-request-1',
    runtimeConsumerObservationQueryExec: input.runtimeConsumerObservationQueryExec,
  })
}

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

function identifiedConstructionCalendar() {
  return {
    basis: 'official_construction_calendar_seed' as const,
    windows: [],
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    availability: 'available' as const,
    unavailableReason: null,
  }
}

describe('scheduleAccelerationRuntimeService', () => {
  beforeEach(() => {
    delete process.env.SCHEDULE_ACCELERATION_RUNTIME_SUGGESTION_TIMEOUT_MS
    delete process.env.SCHEDULE_ACCELERATION_RUNTIME_ROWS_TIMEOUT_MS
    delete process.env.SCHEDULE_ACCELERATION_RUNTIME_OPTIONAL_READ_TIMEOUT_MS
    clearProjectRemainingForecastRuntimeCacheForTest()
    vi.clearAllMocks()
    mocks.query.mockReset()
    mocks.withDatabaseTransaction.mockImplementation(async (work: () => Promise<unknown>) => work())
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 })
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
      if (sql.includes('FROM monthly_plans')) {
        return [{ id: 'monthly-plan-1' }]
      }
      if (sql.includes('monthly_plan_items')) {
        return [
          { monthly_plan_version_id: 'monthly-plan-1', planned_end_date: '2026-06-30', commitment_status: 'planned', carryover_from_item_id: null },
          { monthly_plan_version_id: 'monthly-plan-1', planned_end_date: '2026-06-24', commitment_status: 'carried_over', carryover_from_item_id: 'monthly-0' },
          { monthly_plan_version_id: 'monthly-plan-1', planned_end_date: '2026-07-10', commitment_status: 'cancelled', carryover_from_item_id: null },
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
    mocks.resolveConstructionCalendarContext.mockResolvedValue(identifiedConstructionCalendar())
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => input)
  })

  it('keeps canonical attribution inputs on runtime schedule rows', async () => {
    mocks.getTasks.mockResolvedValue([{
      id: 'task-attributed',
      project_id: 'project-1',
      parent_id: 'subdivision-1',
      title: 'Facade installation',
      planned_start_date: '2026-07-01',
      planned_end_date: '2026-07-20',
      status: 'todo',
      progress: 0,
      wbs_level: 3,
      sort_order: 30,
      engineering_category_id: 'category-facade',
      engineering_category_name: 'Facade',
      specialty_type: 'Facade Works',
      building_object_id: 'building-1',
      phase_object_id: 'phase-1',
      standard_task_metadata: {
        durationContributionMode: 'duration_bearing',
        rowProjectionMode: 'schedule_row',
      },
    }])
    mocks.executeSQL.mockResolvedValue([])

    const rows = await buildRuntimeScheduleAccelerationRows('project-1')

    expect(mocks.getTasks).toHaveBeenCalledWith('project-1', {
      columns: expect.arrayContaining([
        'parent_id',
        'wbs_level',
        'sort_order',
        'engineering_category_id',
        'specialty_type',
      ]),
    })
    const runtimeColumns = mocks.getTasks.mock.calls.at(-1)?.[1]?.columns ?? []
    expect(runtimeColumns).not.toContain('engineering_category_name')
    expect(new Set(runtimeColumns).size).toBe(runtimeColumns.length)
    expect(rows[0]?.values).toEqual(expect.objectContaining({
      parent_id: 'subdivision-1',
      wbs_level: 3,
      sort_order: 30,
      engineering_category_id: 'category-facade',
      engineering_category_name: 'Facade',
      specialty_type: 'Facade Works',
      building_object_id: 'building-1',
      phase_object_id: 'phase-1',
    }))
  })

  it('preserves PostgreSQL DATE objects as local calendar dates', async () => {
    mocks.getTasks.mockResolvedValue([{
      id: 'task-date-object',
      project_id: 'project-1',
      title: 'Date object task',
      planned_start_date: new Date(2026, 3, 12),
      planned_end_date: new Date(2026, 4, 21),
      actual_start_date: new Date(2026, 3, 13),
      actual_end_date: new Date(2026, 4, 22),
      status: 'completed',
      progress: 100,
    }])
    mocks.executeSQL.mockResolvedValue([])

    const rows = await buildRuntimeScheduleAccelerationRows('project-1')

    expect(rows[0]?.values).toEqual(expect.objectContaining({
      planned_start_date: '2026-04-12',
      planned_end_date: '2026-05-21',
      actual_start_date: '2026-04-13',
      actual_end_date: '2026-05-22',
    }))
  })

  it('reports dependency read degradation and excludes non-required edges', async () => {
    mocks.getTasks.mockResolvedValue([{
      id: 'task-a',
      project_id: 'project-1',
      title: 'Task A',
      planned_end_date: '2026-07-20',
      status: 'todo',
      progress: 0,
    }, {
      id: 'task-b',
      project_id: 'project-1',
      title: 'Task B',
      planned_end_date: '2026-07-21',
      status: 'todo',
      progress: 0,
    }])
    mocks.executeSQL.mockResolvedValueOnce([{
      task_id: 'task-b',
      dependency_task_id: 'task-a',
      dependency_type: 'FS',
      lag_days: 0,
      required_for_start: false,
      source_type: 'manual',
    }])

    const filtered = await buildRuntimeScheduleAccelerationRowsWithDiagnostics('project-1')

    expect(filtered.rows.find((row) => row.clientRowId === 'task-b')?.predecessorDependencies).toEqual([])
    expect(String(mocks.executeSQL.mock.calls[0]?.[0])).toContain('required_for_start')
    expect(filtered.degradationReasons).toEqual([])

    mocks.executeSQL.mockRejectedValueOnce(
      new Error('dbService.executeSQL SELECT task_dependencies direct query timed out after 4000ms'),
    )
    const degraded = await buildRuntimeScheduleAccelerationRowsWithDiagnostics('project-1')

    expect(degraded.rows).toHaveLength(2)
    expect(degraded.degradationReasons).toContain('task_dependencies_unavailable')
  })

  it('marks explicit WBS summary rows as non-duration runtime projections', async () => {
    mocks.getTasks.mockResolvedValue([{
      id: 'summary-structure',
      project_id: 'project-1',
      title: '主体结构汇总',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-08-31',
      status: 'in_progress',
      progress: 35,
      is_wbs_summary: true,
      is_executable: false,
    }])
    mocks.executeSQL.mockResolvedValue([])

    const rows = await buildRuntimeScheduleAccelerationRows('project-1')

    expect(mocks.getTasks).toHaveBeenCalledWith('project-1', {
      columns: expect.arrayContaining(['is_wbs_summary', 'is_executable']),
    })
    expect(rows[0]?.values.duration_contribution_mode).toBe('summary_only')
  })

  it('returns a governed project-level remaining forecast without issuing an empty acceleration recommendation', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      issuedBy: 'user-1',
    })

    expect(result.rowsEvaluated).toBe(2)
    expect(result.projectRemainingForecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: 19,
      forecastFinishDate: '2026-06-28',
      targetEndDate: '2026-06-25',
      targetGapDays: 3,
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
        commitmentFinishSoftSignalDate: '2026-06-30',
        softSignalPolicy: 'status_only_not_finish_boundary',
      }),
      externalInterfaces: expect.objectContaining({
        hardGateCount: 1,
        latestGateFinishDate: '2026-06-28',
        overlappedRemainingDays: 11,
        overlappedGateFinishDate: '2026-06-28',
        gateTailDaysAfterInternal: 0,
        serialRemainingDays: 0,
        serializedGateFinishDate: null,
      }),
    }))
    expect(result.targetFeasibility?.scenario).toBe('runtime_delay_recovery')
    expect(result.targetFeasibility?.accelerationProposal?.rescheduleDraft).toBeUndefined()
    expect(result.targetFeasibility?.accelerationRecommendation).toBeUndefined()
    expect(mocks.query).not.toHaveBeenCalled()
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

  it('issues an immutable recommendation only when runtime acceleration has authoritative commit operations', async () => {
    mocks.getTasks.mockResolvedValueOnce([{
      id: 'task-critical',
      project_id: 'project-1',
      title: 'Critical structure remaining work',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-28',
      status: 'in_progress',
      progress: 40,
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      standard_task_metadata: {
        durationContributionMode: 'duration_bearing',
        rowProjectionMode: 'schedule_row',
      },
    }])
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: 'recommendation-issued-1',
        issued_at: '2027-02-15T00:00:00.000Z',
        expires_at: '2027-02-15T00:30:00.000Z',
      }],
      rowCount: 1,
    })

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-20',
      asOfDate: '2026-06-10',
      issuedBy: 'user-1',
    })

    expect(result.targetFeasibility?.accelerationProposal?.rescheduleDraft?.operations.length).toBeGreaterThan(0)
    expect(result.targetFeasibility?.accelerationRecommendation).toEqual(expect.objectContaining({
      id: 'recommendation-issued-1',
      recommendationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      operationsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      issuedAt: '2027-02-15T00:00:00.000Z',
      expiresAt: '2027-02-15T00:30:00.000Z',
    }))
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.schedule_acceleration_recommendations'),
      expect.arrayContaining(['project-1', 'user-1']),
    )
    const issuanceCall = mocks.query.mock.calls.find(([sql]) => (
      String(sql).includes('INSERT INTO public.schedule_acceleration_recommendations')
    ))
    expect(String(issuanceCall?.[0])).toContain('recommendation,')
    expect(String(issuanceCall?.[0])).toContain('operations,')
    expect(String(issuanceCall?.[0])).not.toContain('proposal,')
    expect(issuanceCall?.[1]).toEqual(expect.arrayContaining([
      JSON.stringify(result.targetFeasibility?.accelerationProposal),
      JSON.stringify(result.targetFeasibility?.accelerationProposal?.rescheduleDraft?.operations),
      'user-1',
    ]))
  })

  it('does not create runtime target proposals or operations when the production calendar identity is unavailable', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValueOnce({
      basis: 'calendar_day',
      windows: [],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    })

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      context: {
        projectGenerationFacts: {
          wizard_generation_duration_asset_consumption_receipts: [{
            consumer: 'wizard_master_plan',
            assetType: 'standard_work_duration',
            stableCode: 'duration.concrete.structure',
            role: 'stable_runtime',
            effectiveSource: 'project_stable',
            versionId: 'project-duration-v3',
            publicationKey: 'duration-publication-v3',
            status: 'effective_applied',
            changedFields: ['duration', 'dates'],
            targetRowIds: ['task-critical'],
            reasonCodes: [],
            rollbackTarget: 'project-duration-v2',
          }],
        },
      },
    })

    expect(result.projectRemainingForecast).toEqual(expect.objectContaining({
      projectRemainingForecastDays: null,
      forecastFinishDate: null,
      targetGapDays: null,
      projectRemainingForecast: expect.objectContaining({
        unit: 'construction_production_day',
        availability: 'unavailable',
      }),
      targetGap: expect.objectContaining({
        unit: 'calendar_day',
        availability: 'unavailable',
      }),
    }))
    expect(result.targetFeasibility).toBeUndefined()
    expect(result.targetFeasibility?.accelerationProposal).toBeUndefined()
    expect(result.targetFeasibility?.accelerationProposal?.rescheduleDraft?.operations ?? []).toEqual([])
    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
    const accelerationReceipt = result.durationAssetConsumptionReceipts.find(
      (receipt) => receipt.consumer === 'schedule_acceleration_runtime',
    )
    expect(accelerationReceipt?.changedFields).not.toContain('duration')
  })

  it('uses the same governed duration publication in remaining-forecast and acceleration receipts', async () => {
    const upstreamReceipts = [
      {
        consumer: 'wizard_master_plan',
        assetType: 'standard_work_duration',
        stableCode: 'duration.concrete.structure',
        role: 'stable_runtime',
        effectiveSource: 'project_stable',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
        changedFields: ['duration', 'dates'],
        targetRowIds: ['task-critical'],
        reasonCodes: [],
        rollbackTarget: 'project-duration-v2',
      },
      {
        consumer: 'candidate_calibration',
        assetType: 'standard_work_duration',
        stableCode: 'duration.candidate.v4',
        role: 'candidate_advisory',
        effectiveSource: 'candidate_advisory',
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'advisory_used',
        changedFields: ['confidence'],
        targetRowIds: [],
        reasonCodes: ['candidate_advisory_only'],
        rollbackTarget: null,
      },
    ]
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      context: {
        projectGenerationFacts: {
          wizard_generation_duration_asset_consumption_receipts: upstreamReceipts,
        },
      },
    })

    const remainingReceipts = (result.projectRemainingForecast.calculationContext as any).assetConsumptionReceipts
    const accelerationReceipts = (result as any).durationAssetConsumptionReceipts
    expect(remainingReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumer: 'project_remaining_duration_forecast',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
      }),
      expect.objectContaining({
        consumer: 'project_remaining_duration_forecast',
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'evidence_only',
        changedFields: [],
      }),
    ]))
    expect(accelerationReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        consumer: 'schedule_acceleration_runtime',
        versionId: 'project-duration-v3',
        publicationKey: 'duration-publication-v3',
        status: 'effective_applied',
      }),
      expect.objectContaining({
        consumer: 'schedule_acceleration_runtime',
        versionId: 'candidate-v4',
        publicationKey: 'candidate-publication-v4',
        status: 'evidence_only',
        changedFields: [],
      }),
    ]))
  })

  it('does not fabricate a ready remaining forecast or accuracy snapshot when runtime rows are unavailable', async () => {
    mocks.getTasks.mockResolvedValue([])

    await expect(buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })).rejects.toMatchObject({
      code: 'PROJECT_REMAINING_FORECAST_UNAVAILABLE',
      degradationReason: 'runtime_evidence_unavailable',
    })

    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('normalizes DB circuit failures during runtime task reads as forecast unavailable', async () => {
    mocks.getTasks.mockRejectedValue(new Error('dbService.getTasks REST page 1 skipped because Supabase REST circuit is open'))

    await expect(buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })).rejects.toMatchObject({
      code: 'PROJECT_REMAINING_FORECAST_UNAVAILABLE',
      degradationReason: 'runtime_evidence_unavailable',
      operation: 'runtime_schedule_rows',
    })

    expect(mocks.recordDurationAccuracyPrediction).not.toHaveBeenCalled()
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalled()
  })

  it('skips task duration suggestion reads that exceed the runtime forecast budget', async () => {
    process.env.SCHEDULE_ACCELERATION_RUNTIME_SUGGESTION_TIMEOUT_MS = '5'
    mocks.getTaskDurationSuggestion.mockImplementation(() => new Promise(() => {}))

    const result = await Promise.race([
      buildRuntimeProjectRemainingDurationForecast({
        projectId: 'project-1',
        targetEndDate: '2026-06-25',
        asOfDate: '2026-06-10',
      }),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 80)),
    ])

    expect(result).not.toBe('timed-out')
    expect((result as Awaited<ReturnType<typeof buildRuntimeProjectRemainingDurationForecast>>).rowsEvaluated).toBe(2)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'project_remaining_forecast',
    }))
  })

  it('loads runtime monthly commitments only from confirmed monthly plans', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('FROM monthly_plans')) {
        return [{ id: 'monthly-plan-1' }]
      }
      if (sql.includes('monthly_plan_items')) {
        return [
          { monthly_plan_version_id: 'monthly-plan-1', planned_end_date: '2026-06-24', commitment_status: 'planned', carryover_from_item_id: null },
        ]
      }
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
    })

    const commitmentQuery = mocks.executeSQL.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('monthly_plan_items'))
    const planCall = mocks.executeSQL.mock.calls
      .map(([sql, params]) => ({ sql: String(sql), params: params as unknown[] }))
      .find((call) => call.sql.includes('FROM monthly_plans'))

    expect(planCall?.sql).toContain('status = ?')
    expect(planCall?.params).toEqual(['project-1', 'confirmed'])
    expect(commitmentQuery).not.toMatch(/\bJOIN\b/i)
    expect(commitmentQuery).not.toContain('monthly_plans')
    expect(commitmentQuery).toContain('monthly_plan_items')
    expect(result.projectRemainingForecast.calculationContext.monthlyCommitments).toEqual(expect.objectContaining({
      activeCommitmentCount: 1,
      latestCommitmentFinishDate: '2026-06-24',
      softSignalPolicy: 'status_only_not_finish_boundary',
    }))
  })

  it('degrades project remaining forecast when task dependency reads time out', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) {
        throw new Error('dbService.executeSQL SELECT task_dependencies direct query timed out after 4000ms')
      }
      if (sql.includes('FROM monthly_plans')) {
        return [{ id: 'monthly-plan-1' }]
      }
      if (sql.includes('monthly_plan_items')) {
        return [
          { monthly_plan_version_id: 'monthly-plan-1', planned_end_date: '2026-06-30', commitment_status: 'planned', carryover_from_item_id: null },
        ]
      }
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.rowsEvaluated).toBe(2)
    expect(result.projectRemainingForecast).toEqual(expect.objectContaining({
      durationOutputCode: 'project_remaining_forecast',
      durationOutputSemanticFieldName: 'projectRemainingForecastDays',
      projectRemainingForecastDays: expect.any(Number),
      forecastFinishDate: expect.any(String),
    }))
  })

  it('shares one runtime computation for concurrent identical project remaining forecast requests', async () => {
    let releaseTasks: (() => void) | null = null
    let tasksCalled: (() => void) | null = null
    const tasksStarted = new Promise<void>((resolve) => {
      tasksCalled = resolve
    })
    const tasksReady = new Promise<void>((resolve) => {
      releaseTasks = resolve
    })
    mocks.getTasks.mockImplementation(async () => {
      tasksCalled?.()
      await tasksReady
      return [
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
      ]
    })

    const first = buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      context: {
        projectTypeCodes: ['office'],
        methodVariantCodes: ['standard'],
      },
    })
    const second = buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      context: {
        methodVariantCodes: ['standard'],
        projectTypeCodes: ['office'],
      },
    })

    await tasksStarted
    expect(mocks.getTasks).toHaveBeenCalledTimes(1)
    releaseTasks?.()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(mocks.getTasks).toHaveBeenCalledTimes(1)
    expect(firstResult).toEqual(secondResult)
    expect(firstResult.rowsEvaluated).toBe(1)
  })

  it('keeps a completed project remaining forecast cached for the TTL after the slow computation finishes', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-29T00:00:00.000Z'))

      const firstResult = await buildRuntimeProjectRemainingDurationForecast({
        projectId: 'project-1',
        targetEndDate: '2026-06-25',
        asOfDate: '2026-06-10',
      })

      vi.setSystemTime(new Date('2026-06-29T00:00:29.000Z'))
      const cachedResult = await buildRuntimeProjectRemainingDurationForecast({
        projectId: 'project-1',
        targetEndDate: '2026-06-25',
        asOfDate: '2026-06-10',
      })

      vi.setSystemTime(new Date('2026-06-29T00:00:31.000Z'))
      const refreshedResult = await buildRuntimeProjectRemainingDurationForecast({
        projectId: 'project-1',
        targetEndDate: '2026-06-25',
        asOfDate: '2026-06-10',
      })

      expect(cachedResult).toEqual(firstResult)
      expect(refreshedResult).toEqual(firstResult)
      expect(mocks.getTasks).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
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
        remainingDuration: buildAvailableDurationMetric(2, 'construction_production_day', '2026-02-14'),
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
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          availability: 'available',
          unavailableReason: null,
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
    expect(result.projectRemainingForecast.targetGapDays).toBe(3)
    expect(result.projectRemainingForecast.targetGap).toEqual(expect.objectContaining({
      value: 3,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    }))
  })

  it('resolves the construction calendar for production runtime forecasts when no context calendar is passed', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
      windows: [{
        holidayCode: 'spring_festival_2026',
        holidayName: 'Spring Festival construction shutdown',
        startDate: '2026-02-15',
        endDate: '2026-02-17',
        counts_as_construction_shutdown: true,
      }],
    })
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
        remainingDuration: buildAvailableDurationMetric(2, 'construction_production_day', '2026-02-14'),
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
    })

    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      onError: expect.any(Function),
    }))
    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-02-18')
    expect(result.projectRemainingForecast.projectRemainingForecastDays).toBe(2)
  })

  it('derives gateRelation taxonomy for runtime external waits without manual gate fields', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'internal-critical',
        project_id: 'project-1',
        title: 'Internal critical work',
        planned_start_date: '2026-06-10',
        planned_end_date: '2026-06-20',
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
      {
        id: 'permit-wait',
        project_id: 'project-1',
        title: 'Permanent power permit wait',
        planned_start_date: '2026-06-12',
        planned_end_date: '2026-06-25',
        status: 'todo',
        progress: 0,
        is_critical: false,
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
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    const result = await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-06-10',
      targetEndDate: '2026-06-22',
    })

    expect(result.projectRemainingForecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      hardGateCount: 1,
      latestGateFinishDate: '2026-06-25',
      overlappedGateFinishDate: '2026-06-25',
      serializedGateFinishDate: null,
      gateRelationSummary: expect.objectContaining({
        parallelWaitCount: 1,
        finishGateCount: 0,
      }),
    }))
  })

  it('derives serial finish and handover gates from runtime metadata without manual gateRelation fields', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'internal-critical',
        project_id: 'project-1',
        title: 'Internal critical work',
        planned_start_date: '2026-06-10',
        planned_end_date: '2026-06-20',
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
      {
        id: 'acceptance-finish',
        project_id: 'project-1',
        title: 'Completion acceptance review',
        planned_start_date: '2026-06-20',
        planned_end_date: '2026-06-22',
        status: 'todo',
        progress: 0,
        is_critical: false,
        standard_task_metadata: {
          durationContributionMode: 'quality_gate',
          rowProjectionMode: 'schedule_row',
          acceptanceRequired: true,
        },
      },
      {
        id: 'handover-document',
        project_id: 'project-1',
        title: 'Archive document transfer',
        planned_start_date: '2026-06-22',
        planned_end_date: '2026-06-23',
        status: 'todo',
        progress: 0,
        is_critical: false,
        standard_task_metadata: {
          durationContributionMode: 'handover_marker',
          rowProjectionMode: 'schedule_row',
          documentEvidenceRole: 'handover_document',
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
      targetEndDate: '2026-06-22',
    })

    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-06-23')
    expect(result.projectRemainingForecast.calculationContext.externalInterfaces).toEqual(expect.objectContaining({
      finishGateFinishDate: '2026-06-22',
      handoverGateFinishDate: '2026-06-23',
      serializedGateFinishDate: '2026-06-23',
      gateTailDaysAfterInternal: 3,
      gateRelationSummary: expect.objectContaining({
        finishGateCount: 1,
        handoverGateCount: 1,
        totalCount: 2,
      }),
    }))
  })

  it('records project remaining and acceleration prediction snapshots for later accuracy backtest', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.projectRemainingForecast.projectRemainingForecastDays).toBe(19)
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'project_remaining_forecast',
      outputKind: 'project_remaining_forecast',
      projectId: 'project-1',
      dedupeKey: 'project-1:2026-06-10:project_remaining_forecast',
      predictionSource: 'projectRemainingDurationForecastService',
      predictedStartDate: '2026-06-10',
      predictedFinishDate: '2026-06-28',
      predictedDurationDays: 19,
      seedLineage: expect.objectContaining({
        durationOutputCode: 'project_remaining_forecast',
      }),
      networkLineage: expect.objectContaining({
        rowCount: expect.any(Number),
        criticalRemainingTaskCount: expect.any(Number),
        activeMonthlyCommitmentCount: expect.any(Number),
        carryoverMonthlyCommitmentCount: expect.any(Number),
      }),
      predictionContext: expect.objectContaining({
        durationDayUnit: 'construction_production_day',
        constructionCalendar: expect.any(Object),
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

  it('uses the construction-calendar business date for accuracy keys when asOf is omitted', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-10T16:30:00.000Z'))

      const result = await evaluateRuntimeScheduleAcceleration({
        projectId: 'project-1',
        targetEndDate: '2026-06-25',
      })

      expect(result.projectRemainingForecast.projectRemainingForecast.asOf).toBe('2026-06-11')
      expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
        engineCode: 'project_remaining_forecast',
        dedupeKey: 'project-1:2026-06-11:project_remaining_forecast',
        predictedStartDate: '2026-06-11',
      }))
      expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
        engineCode: 'schedule_acceleration_target',
        dedupeKey: 'project-1:2026-06-11:acceleration_target:2026-06-25',
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('records construction organization plan-network publication lineage on E5 acceleration prediction events', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      runtimeArtifactPublications: [
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
          publicationStatus: 'runtime_published',
        },
        {
          assetKey: 'construction_organization_plan_network' as any,
          publicationKey: 'construction-org-plan-network-release:project-1',
          publicationStatus: 'runtime_published',
          observationContext: {
            businessType: 'residential',
            draftNetworkKey: 'draft-project-1-recommended',
            optionId: 'option-project-1-recommended',
          },
        },
      ],
    })

    expect(result.targetFeasibility?.accelerationProposal?.accelerationTargetDays).toBeTruthy()
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'schedule_acceleration_target',
      predictionContext: expect.objectContaining({
        durationDayUnit: 'construction_production_day',
        constructionCalendar: expect.objectContaining({
          basis: 'official_construction_calendar_seed',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          availability: 'available',
          windows: [],
        }),
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network-release:project-1',
        runtimePublicationKey: 'construction-org-plan-network-release:project-1',
        businessType: 'residential',
        draftNetworkKey: 'draft-project-1-recommended',
        optionId: 'option-project-1-recommended',
        constructionOrganizationPlanNetwork: expect.objectContaining({
          assetKey: 'construction_organization_plan_network',
          publicationKey: 'construction-org-plan-network-release:project-1',
          businessType: 'residential',
          draftNetworkKey: 'draft-project-1-recommended',
          optionId: 'option-project-1-recommended',
        }),
      }),
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
      actualFinishDate: '2026-06-24',
      actualContext: expect.objectContaining({
        source: 'completed_runtime_schedule_rows',
        currentAsOfDate: '2026-06-20',
        durationBasis: 'prediction_t0_to_actual_finish_window',
      }),
    }))
  })

  it('lets accuracy backtest anchor completed project remaining windows to the original prediction T0 instead of current as-of', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-complete-a',
        project_id: 'project-1',
        title: 'Completed structure',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-18',
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

    await buildRuntimeProjectRemainingDurationForecast({
      projectId: 'project-1',
      asOfDate: '2026-07-01',
    })

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'project_remaining_forecast',
      actualFinishDate: '2026-06-24',
      actualContext: expect.objectContaining({
        currentAsOfDate: '2026-07-01',
        durationBasis: 'prediction_t0_to_actual_finish_window',
      }),
    }))
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.not.objectContaining({
      actualStartDate: '2026-07-01',
      actualDurationDays: expect.any(Number),
    }))
  })

  it('does not fabricate acceleration backtests when monthly commitments are only soft signals', async () => {
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

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).not.toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'schedule_acceleration_target',
    }))
  })

  it('does not let caller-provided adoption evidence objects impersonate persisted user adoption', async () => {
    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      context: {
        runtime: {
          evidenceCodes: ['acceleration_recommendation_adopted'],
          evidenceObjects: [
            {
              code: 'acceleration_recommendation_adopted',
              factType: 'direct',
              strength: 'direct',
              sourceType: 'manual_context',
              sourceIds: ['fake-adoption'],
              scope: { type: 'project', id: 'project-1' },
              windowDays: 0,
              confidence: 1,
              value: true,
              contributions: [],
            },
          ],
        } as any,
      },
    })

    const runtimeContext = result.targetFeasibility?.accelerationProposal?.calculationBasis.runtimeContext as any
    expect(runtimeContext?.accelerationRecommendationAdopted).not.toBe(true)
    expect(runtimeContext?.evidenceCodes ?? []).not.toContain('acceleration_recommendation_adopted')
    expect((runtimeContext?.evidenceObjects ?? []).map((item: any) => item.code)).not.toContain('acceleration_recommendation_adopted')
  })

  it('uses persisted acceleration recommendation adoption to unlock recovery backtests', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-complete-critical',
        project_id: 'project-1',
        title: 'Completed adopted acceleration work',
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
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      if (sql.includes('recommendation_actions')) {
        return [{ id: 'action-1', recommendation_key: 'schedule_acceleration:2026-06-25' }]
      }
      return []
    })

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-20',
    })

    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('recommendation_actions'),
      expect.arrayContaining(['project-1']),
    )
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'schedule_acceleration_target',
      actualFinishDate: '2026-06-24',
      actualContext: expect.objectContaining({
        attribution: 'adopted_acceleration_recovery',
        currentAsOfDate: '2026-06-20',
        durationBasis: 'prediction_t0_to_actual_finish_window',
      }),
    }))
  })

  it('carries persisted construction organization adoption identity into E5 recovery backtests', async () => {
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-complete-critical',
        project_id: 'project-1',
        title: 'Completed adopted construction organization acceleration work',
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
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      if (sql.includes('recommendation_actions')) {
        return [{
          id: 'action-1',
          recommendation_key: 'schedule_acceleration:2026-06-25',
          action_context: {
            assetKey: 'construction_organization_plan_network',
            publicationKey: 'construction-org-plan-network:pub-acceleration',
            runtimePublicationKey: 'construction-org-plan-network:pub-acceleration',
            businessType: 'general_civil',
            draftNetworkKey: 'draft-acceleration',
            optionId: 'option-acceleration',
          },
        }]
      }
      return []
    })

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-20',
    })

    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'schedule_acceleration_target',
      actualContext: expect.objectContaining({
        assetKey: 'construction_organization_plan_network',
        publicationKey: 'construction-org-plan-network:pub-acceleration',
        runtimePublicationKey: 'construction-org-plan-network:pub-acceleration',
        businessType: 'general_civil',
        draftNetworkKey: 'draft-acceleration',
        optionId: 'option-acceleration',
      }),
    }))
  })

  it('records acceleration adoption with explicit persisted fields instead of literal SQL placeholders', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      proposal: {
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        totalRecoverDays: 12,
        accelerationTargetDays: 88,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      adopted: true,
      recommendationKey: 'schedule_acceleration:recommendation-1:task-commit-request-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
    }))

    const commitRead = mocks.query.mock.calls.find(([sql]) => String(sql).includes('FROM public.task_commit_requests'))
    expect(String(commitRead?.[0])).toContain('WHERE project_id = $1')
    expect(commitRead?.[1]).toEqual(['project-1', 'task-commit-request-1'])

    const calls = mocks.executeSQL.mock.calls.map(([sql, params]) => ({
      sql: String(sql),
      params: params as unknown[],
    }))
    expect(calls[0]).toEqual(expect.objectContaining({
      sql: expect.stringContaining('FROM recommendation_actions'),
      params: [
        'project-1',
        'schedule_acceleration',
        'schedule_acceleration:recommendation-1:task-commit-request-1',
        'adopted',
      ],
    }))
    const mutation = calls.find((call) => call.sql.includes('INSERT INTO recommendation_actions') || call.sql.includes('UPDATE recommendation_actions'))
    expect(mutation).toBeTruthy()
    expect(mutation?.sql).not.toContain("'schedule_acceleration'")
    expect(mutation?.sql).not.toContain("'adopted'")
    expect(mutation?.sql).toContain('ON CONFLICT (project_id, recommendation_kind, recommendation_key, action_type)')
    expect(mutation?.sql).toContain('DO NOTHING')
    expect(mutation?.sql).toContain('RETURNING id, adopted_at')
    expect(mutation?.sql).not.toContain('CAST(? AS jsonb)')
    expect(mutation?.params).toEqual(expect.arrayContaining([
      'project-1',
      'schedule_acceleration',
      'schedule_acceleration:recommendation-1:task-commit-request-1',
      'adopted',
      '2027-03-31',
      '2027-04-30',
      12,
      88,
      '2027-02-15T00:00:00.000Z',
      'user-1',
      expect.objectContaining({
        source: 'target_acceleration_review_panel',
        policy: 'user_adoption_required_for_acceleration_backtest',
      }),
    ]))
  })

  it('links an adopted acceleration proposal to the construction organization runtime recommendation when plan-network identity is present', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      proposal: {
        mode: 'preview_only',
        source: 'target_end_compression',
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        overshootDays: 30,
        totalRecoverDays: 12,
        remainingGapDays: 18,
        verdict: 'needs_scope_decision',
        accelerationTargetDays: 88,
        actions: [],
        protectedConstraints: [],
        calculationBasis: {
          naturalDurationDays: 118,
          totalRecoverCapRatio: 0.12,
          seasonalFactor: 1,
          projectTypeProfile: 'residential',
          criticalCandidateDays: 12,
          resourceGroupedCandidateDays: 0,
          hardConstraintDays: 0,
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            sourceVersion: 'test',
            recommendedScenarioIds: ['tower-early-release'],
            confidence: 'medium',
            resourcePolicy: 'resource_is_feasibility_sidecar',
            recommendedPlanOption: {
              optionId: 'option-accelerate-tower-first',
              draftNetworkKey: 'draft-accelerate-tower-first',
              publicationKey: 'pub-accelerate-tower-first',
              selectedScenarioIds: ['tower-early-release'],
              businessType: 'general_civil',
            },
            planNetworkDraftRecommendations: {
              accelerationRecovery: {
                optionId: 'option-accelerate-tower-first',
                draftNetworkKey: 'draft-accelerate-tower-first',
                publicationKey: 'pub-accelerate-tower-first',
                businessType: 'general_civil',
                selectedScenarioIds: ['tower-early-release'],
              },
            },
          },
        },
      } as any,
    })

    expect(result).toEqual(expect.objectContaining({
      adopted: true,
      constructionOrganizationRecommendationDecision: expect.objectContaining({
        status: 'recommendation_decision_recorded',
        recommendationKind: 'construction_organization_plan_network',
        actionType: 'adopted',
        decisionPersisted: true,
      }),
    }))

    const calls = mocks.executeSQL.mock.calls.map(([sql, params]) => ({
      sql: String(sql),
      params: params as unknown[],
    }))
    const constructionOrganizationInsert = calls.find((call) =>
      call.sql.includes('INSERT INTO recommendation_actions')
      && call.params.includes('construction_organization_plan_network'),
    )
    expect(constructionOrganizationInsert).toBeTruthy()
    expect(constructionOrganizationInsert?.params).toEqual(expect.arrayContaining([
      'project-1',
      'construction_organization_plan_network',
      'construction_organization_plan_network:pub-accelerate-tower-first:draft-accelerate-tower-first:option-accelerate-tower-first:accelerationRecovery:schedule_acceleration:recommendation-1:task-commit-request-1',
      'adopted',
      '2027-02-15T00:00:00.000Z',
      'user-1',
      expect.objectContaining({
        businessType: 'general_civil',
        useCase: 'accelerationRecovery',
        optionId: 'option-accelerate-tower-first',
        draftNetworkKey: 'draft-accelerate-tower-first',
        publicationKey: 'pub-accelerate-tower-first',
        decisionSource: 'schedule_acceleration_recommendation_adoption',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      }),
    ]))
  })

  it('records a construction organization saved outcome only when a published plan-network adoption has a real commit ref', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      outcomeMetadata: {
        operationCount: 3,
        governanceSummary: { dateAdjustmentCount: 2, dependencyChangeCount: 1 },
      },
      proposal: {
        mode: 'preview_only',
        source: 'target_end_compression',
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        overshootDays: 30,
        totalRecoverDays: 12,
        remainingGapDays: 18,
        verdict: 'needs_scope_decision',
        accelerationTargetDays: 88,
        actions: [],
        protectedConstraints: [],
        calculationBasis: {
          naturalDurationDays: 118,
          totalRecoverCapRatio: 0.12,
          seasonalFactor: 1,
          projectTypeProfile: 'residential',
          criticalCandidateDays: 12,
          resourceGroupedCandidateDays: 0,
          hardConstraintDays: 0,
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            recommendedScenarioIds: ['tower-early-release'],
            recommendedPlanOption: {
              optionId: 'option-accelerate-tower-first',
              draftNetworkKey: 'draft-accelerate-tower-first',
              publicationKey: 'pub-accelerate-tower-first',
              selectedScenarioIds: ['tower-early-release'],
              businessType: 'general_civil',
            },
          },
        },
      } as any,
    })

    expect(result.constructionOrganizationSavedOutcome).toEqual(expect.objectContaining({
      status: 'saved_network_outcome_recorded',
      publicationKey: 'pub-accelerate-tower-first',
      outcomeStatus: 'accepted',
      outcomePersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesAccelerationDraft: false,
    }))

    const outcomeInsert = mocks.executeSQL.mock.calls
      .map(([sql, params]) => ({ sql: String(sql), params: params as unknown[] }))
      .find((call) => call.sql.includes('INSERT INTO duration_plan_network_outcomes'))
    expect(outcomeInsert).toBeTruthy()
    expect(outcomeInsert?.params).toEqual(expect.arrayContaining([
      'construction-organization-plan-network-outcome:project-1:pub-accelerate-tower-first:draft-accelerate-tower-first:option-accelerate-tower-first:accelerationRecovery:schedule_acceleration:recommendation-1:task-commit-request-1',
      'construction_organization_plan_network',
      'accepted',
      'task-list-commit:project-1:task-commit-request-1:acceleration-reschedule',
      'project',
      'schedule_acceleration_reschedule_commit',
      'project-1',
      'pub-accelerate-tower-first',
      expect.objectContaining({
        businessType: 'general_civil',
        useCase: 'accelerationRecovery',
        outcomeSource: 'schedule_acceleration_reschedule_commit',
        duration_day_unit: 'construction_production_day',
        durationDayUnit: 'construction_production_day',
        operationCount: 1,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      }),
    ]))
  })

  it('records runtime consumer observation when acceleration adoption persists a construction organization saved outcome', async () => {
    mockSuccessfulAdoptionPersistence()
    const { calls: observationCalls, queryExec } = createRecordingQueryExec()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      outcomeMetadata: {
        operationCount: 3,
      },
      runtimeConsumerObservationQueryExec: queryExec,
      proposal: {
        mode: 'preview_only',
        source: 'target_end_compression',
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        overshootDays: 30,
        totalRecoverDays: 12,
        remainingGapDays: 18,
        verdict: 'needs_scope_decision',
        accelerationTargetDays: 88,
        actions: [],
        protectedConstraints: [],
        calculationBasis: {
          naturalDurationDays: 118,
          totalRecoverCapRatio: 0.12,
          seasonalFactor: 1,
          projectTypeProfile: 'residential',
          criticalCandidateDays: 12,
          resourceGroupedCandidateDays: 0,
          hardConstraintDays: 0,
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            recommendedScenarioIds: ['tower-early-release'],
            recommendedPlanOption: {
              optionId: 'option-accelerate-tower-first',
              draftNetworkKey: 'draft-accelerate-tower-first',
              publicationKey: 'construction_org_plan_network_runtime:project-1:accelerate-tower-first',
              selectedScenarioIds: ['tower-early-release'],
              businessType: 'general_civil',
            },
          },
        },
      } as any,
    })

    expect(result.constructionOrganizationSavedOutcome).toEqual(expect.objectContaining({
      status: 'saved_network_outcome_recorded',
      publicationKey: 'construction_org_plan_network_runtime:project-1:accelerate-tower-first',
    }))

    const runtimeCall = observationCalls.find((call) => call.sql.includes('runtime_consumer_runtime_calls'))
    const observation = observationCalls.find((call) => call.sql.includes('runtime_consumer_observations'))

    expect(runtimeCall?.params).toEqual(expect.arrayContaining([
      'scheduleAccelerationRuntimeService',
      'scheduleAccelerationRuntimeService:recordScheduleAccelerationRecommendationAdoption',
      expect.objectContaining({
        projectId: 'project-1',
        runtimeConsumer: 'scheduleAccelerationRuntimeService',
        consumerTrigger: 'schedule_acceleration_recommendation_adoption',
      }),
    ]))
    expect(observation?.params).toEqual(expect.arrayContaining([
      'construction_organization_plan_network',
      'construction_org_plan_network_runtime:project-1:accelerate-tower-first',
      'scheduleAccelerationRuntimeService',
      'schedule_acceleration_runtime',
      'observed',
      expect.objectContaining({
        projectId: 'project-1',
        businessType: 'general_civil',
        useCase: 'accelerationRecovery',
        optionId: 'option-accelerate-tower-first',
        outcomeRef: 'task-list-commit:project-1:task-commit-request-1:acceleration-reschedule',
        outcomeSource: 'schedule_acceleration_reschedule_commit',
      }),
      expect.arrayContaining([
        'schedule_acceleration_adoption:project-1',
        'duration_plan_network_outcomes:construction_org_plan_network_runtime:project-1:accelerate-tower-first',
      ]),
      false,
      false,
      '2027-02-15T00:00:00.000Z',
    ]))
  })

  it('does not fabricate a construction organization saved outcome without published plan-network identity', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      proposal: {
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
      } as any,
    })

    expect(result.constructionOrganizationSavedOutcome).toBeNull()
    expect(mocks.executeSQL.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO duration_plan_network_outcomes'),
    )).toBe(false)
  })

  it('keeps a repeated linked construction organization decision append-only', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      proposal: {
        mode: 'preview_only',
        source: 'target_end_compression',
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        overshootDays: 30,
        totalRecoverDays: 12,
        remainingGapDays: 18,
        verdict: 'needs_scope_decision',
        accelerationTargetDays: 88,
        actions: [],
        protectedConstraints: [],
        calculationBasis: {
          naturalDurationDays: 118,
          totalRecoverCapRatio: 0.12,
          seasonalFactor: 1,
          projectTypeProfile: 'residential',
          criticalCandidateDays: 12,
          resourceGroupedCandidateDays: 0,
          hardConstraintDays: 0,
          constructionOrganizationScenario: {
            source: 'construction_organization_scenario_selector',
            recommendedScenarioIds: ['tower-early-release'],
            recommendedPlanOption: {
              optionId: 'option-accelerate-tower-first',
              draftNetworkKey: 'draft-accelerate-tower-first',
              publicationKey: 'pub-accelerate-tower-first',
              selectedScenarioIds: ['tower-early-release'],
              businessType: 'general_civil',
            },
          },
        },
      } as any,
    })

    expect(result.constructionOrganizationRecommendationDecision).toEqual(expect.objectContaining({
      status: 'recommendation_decision_recorded',
      decisionPersisted: true,
    }))
    expect(mocks.executeSQL.mock.calls.some(([sql]) => String(sql).includes('UPDATE recommendation_actions'))).toBe(false)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => String(sql).includes('UPDATE duration_plan_network_outcomes'))).toBe(false)
  })

  it('uses exact readback for linked action and outcome conflicts without mutating prior evidence', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const sqlText = String(sql)
      if (sqlText.includes('SELECT id, adopted_at') && params.includes('schedule_acceleration')) return []
      if (sqlText.includes('INSERT INTO recommendation_actions') && params.includes('schedule_acceleration')) {
        return [{ id: 'schedule-action-1', adopted_at: params[8] }]
      }
      if (sqlText.includes('INSERT INTO recommendation_actions') && params.includes('construction_organization_plan_network')) {
        return []
      }
      if (sqlText.includes('SELECT id') && sqlText.includes('FROM recommendation_actions')) {
        return [{ id: 'linked-action-1' }]
      }
      if (sqlText.includes('INSERT INTO duration_plan_network_outcomes')) return []
      if (sqlText.includes('SELECT id') && sqlText.includes('FROM duration_plan_network_outcomes')) {
        return [{ id: params[0] }]
      }
      return []
    })

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      proposal: {
        calculationBasis: {
          constructionOrganizationScenario: {
            recommendedPlanOption: {
              optionId: 'option-accelerate-tower-first',
              draftNetworkKey: 'draft-accelerate-tower-first',
              publicationKey: 'pub-accelerate-tower-first',
              selectedScenarioIds: ['tower-early-release'],
              businessType: 'general_civil',
            },
          },
        },
      },
    })

    expect(result.constructionOrganizationRecommendationDecision?.decisionPersisted).toBe(true)
    expect(result.constructionOrganizationSavedOutcome?.outcomePersisted).toBe(true)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => /^\s*UPDATE\s+/i.test(String(sql)))).toBe(false)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => (
      String(sql).includes('INSERT INTO recommendation_actions')
      && String(sql).includes('ON CONFLICT')
      && String(sql).includes('DO NOTHING')
    ))).toBe(true)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => (
      String(sql).includes('INSERT INTO duration_plan_network_outcomes')
      && String(sql).includes('ON CONFLICT (id)')
      && String(sql).includes('DO NOTHING')
    ))).toBe(true)
  })

  it('creates distinct linked action and outcome identities for separate accepted commits', async () => {
    mockSuccessfulAdoptionPersistence()
    const proposal = {
      calculationBasis: {
        constructionOrganizationScenario: {
          recommendedPlanOption: {
            optionId: 'option-accelerate-tower-first',
            draftNetworkKey: 'draft-accelerate-tower-first',
            publicationKey: 'pub-accelerate-tower-first',
            selectedScenarioIds: ['tower-early-release'],
            businessType: 'general_civil',
          },
        },
      },
    }

    await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      recommendationId: 'recommendation-1',
      taskCommitRequestId: 'task-commit-request-1',
      taskCommitLedgerId: 'commit-ledger-1',
      proposal,
    })
    await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      recommendationId: 'recommendation-2',
      taskCommitRequestId: 'task-commit-request-2',
      taskCommitLedgerId: 'commit-ledger-2',
      proposal,
    })

    const linkedActionKeys = mocks.executeSQL.mock.calls
      .filter(([sql, params]) => (
        String(sql).includes('INSERT INTO recommendation_actions')
        && (params as unknown[]).includes('construction_organization_plan_network')
      ))
      .map(([, params]) => (params as unknown[])[2])
    expect(linkedActionKeys).toEqual([
      expect.stringContaining('schedule_acceleration:recommendation-1:task-commit-request-1'),
      expect.stringContaining('schedule_acceleration:recommendation-2:task-commit-request-2'),
    ])
    expect(new Set(linkedActionKeys).size).toBe(2)

    const outcomeIds = mocks.executeSQL.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO duration_plan_network_outcomes'))
      .map(([, params]) => (params as unknown[])[0])
    expect(outcomeIds).toEqual([
      expect.stringContaining('project-1:pub-accelerate-tower-first'),
      expect.stringContaining('project-1:pub-accelerate-tower-first'),
    ])
    expect(String(outcomeIds[0])).toContain('schedule_acceleration:recommendation-1:task-commit-request-1')
    expect(String(outcomeIds[1])).toContain('schedule_acceleration:recommendation-2:task-commit-request-2')
    expect(new Set(outcomeIds).size).toBe(2)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => /^\s*UPDATE\s+/i.test(String(sql)))).toBe(false)
  })

  it('does not fabricate construction organization site adoption when an acceleration proposal lacks plan-network identity', async () => {
    mockSuccessfulAdoptionPersistence()

    const result = await recordAuthoritativeAccelerationAdoptionForTest({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:00:00.000Z',
      proposal: {
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        totalRecoverDays: 12,
        accelerationTargetDays: 88,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      adopted: true,
      constructionOrganizationRecommendationDecision: null,
    }))
    const calls = mocks.executeSQL.mock.calls.map(([sql, params]) => ({
      sql: String(sql),
      params: params as unknown[],
    }))
    expect(calls.some((call) =>
      call.sql.includes('INSERT INTO recommendation_actions')
      && call.params.includes('construction_organization_plan_network'),
    )).toBe(false)
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

  it('hydrates runtime rows from E3 critical snapshot and exact typed E2 remaining duration', async () => {
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
        remainingDuration: buildAvailableDurationMetric(4, 'construction_production_day', '2026-06-10'),
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
    expect(mocks.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(['task-from-e3'], {
      projectId: 'project-1',
      maxAgeMs: 36 * 60 * 60 * 1000,
    })
    expect(result.projectRemainingForecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
      remainingTaskCount: 1,
      latestCriticalFinishDate: '2026-06-13',
    }))
    expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-06-13')
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
        remainingDuration: buildAvailableDurationMetric(3, 'construction_production_day', '2026-06-10'),
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

  it('freezes the business asOf before hydrating typed E2 probability duration into E4 finishes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-13T16:30:00.000Z'))
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      ...identifiedConstructionCalendar(),
      windows: [{
        holidayCode: 'spring_festival_2026',
        startDate: '2026-02-15',
        endDate: '2026-02-17',
        counts_as_construction_shutdown: true,
      }],
    })
    mocks.getTasks.mockResolvedValue([
      {
        id: 'task-with-probability',
        project_id: 'project-1',
        title: 'Task with probability forecast',
        planned_start_date: '2026-02-01',
        planned_end_date: '2026-02-19',
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
        remainingDurationDays: 3,
        remainingDuration: buildAvailableDurationMetric(3, 'construction_production_day', '2026-02-14'),
        forecastFinishDate: '2026-03-31',
        probabilityDuration: {
          method: 'pert_from_existing_percentiles',
          source: 'duration_forecast_percentiles',
          p20RemainingDays: 30,
          p50RemainingDays: 40,
          p80RemainingDays: 60,
          expectedRemainingDays: 45,
          variance: 1,
          standardDeviationDays: 1,
          confidenceBandWidthDays: 30,
        },
        probabilityDurationMetrics: {
          p20RemainingDuration: buildAvailableDurationMetric(2, 'construction_production_day', '2026-02-14'),
          p50RemainingDuration: buildAvailableDurationMetric(3, 'construction_production_day', '2026-02-14'),
          p80RemainingDuration: buildAvailableDurationMetric(4, 'construction_production_day', '2026-02-14'),
        },
      },
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('task_dependencies')) return []
      if (sql.includes('monthly_plan_items')) return []
      return []
    })

    try {
      const result = await buildRuntimeProjectRemainingDurationForecast({ projectId: 'project-1' })

      expect(result.projectRemainingForecast.projectRemainingForecast.asOf).toBe('2026-02-14')
      expect(result.projectRemainingForecast.calculationContext.criticalPath).toEqual(expect.objectContaining({
        optimisticBandFinishDate: '2026-02-18',
        latestCriticalFinishDate: '2026-02-19',
        confidenceBandFinishDate: '2026-02-20',
      }))
      expect(result.projectRemainingForecast.forecastFinishDate).toBe('2026-02-20')
    } finally {
      vi.useRealTimers()
    }
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
        remainingDuration: buildAvailableDurationMetric(20, 'construction_production_day', '2026-06-10'),
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

  it('hydrates project generation facts into runtime acceleration context before deriving construction organization scenario', async () => {
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => ({
      ...input,
      projectGenerationFacts: {
        businessType: 'residential',
        structureTypeCode: 'frame_shear_wall',
        methodVariantCodes: ['pile', 'vertical_only', 'no_horizontal_strut'],
        buildingPatternCodes: ['multi_tower'],
        climateSignals: ['plum_rain'],
        weatherImpactBands: ['earthwork_rain'],
        buildingCount: 3,
        basementLevelCount: 2,
        basementAreaM2: 26000,
        foundationDepthM: 5.5,
        highestBuildingFloorCount: 26,
        scopeOrganizationFacts: {
          buildingObjectCount: 3,
          sharedBasementObjectCount: 1,
          sharedBasementServiceTargetCount: 3,
          organizationSignals: [
            'multi_building_scope_objects',
            'shared_basement_service_range',
          ],
        },
        towerCraneCount: 2,
      },
    }))

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(mocks.hydrateDurationAlgorithmInput).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
      }),
      expect.objectContaining({
        purpose: 'schedule_acceleration',
        allowLiveProjectReread: true,
      }),
    )
    expect(result.targetFeasibility?.accelerationProposal?.calculationBasis.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'shared_basement_first_then_tower',
      ]),
      recommendedPlanOption: expect.objectContaining({
        useCaseEvaluations: expect.objectContaining({
          accelerationRecovery: expect.objectContaining({
            factCoverage: expect.objectContaining({
              consumedFactKeys: expect.arrayContaining([
                'businessType',
                'methodVariantCodes',
                'scopeOrganizationFacts',
              ]),
              sidecarFactKeys: expect.arrayContaining(['towerCraneCount']),
              resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            }),
          }),
        }),
        boundaryPolicy: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
        }),
      }),
    }))
  })

  it('attaches duration input assembly as read-only E5 runtime evidence for T2 schedule assets', async () => {
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => ({
      ...input,
      projectGenerationFacts: {
        businessType: 'residential',
        totalAreaM2: 62000,
      },
      t2RhythmScheduleCandidatePackage: {
        source: 't2_division_rhythm_schedule_candidate_package',
        status: 'schedulable_candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectionReceipts: [],
      },
      t2RhythmScheduleCandidateNetwork: {
        source: 't2_rhythm_schedule_candidate_network',
        status: 'schedulable_network_candidate',
        candidateId: 'runtime-t2-network-candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        canEnterC1913Phase1Selection: true,
        conflictSummary: {
          conflictCodes: [],
          priorityOverrideBlocked: false,
        },
        scheduleTrustEvidence: {
          selectionReceiptCount: 0,
          selectorReceiptAuditStatus: 'missing',
        },
      },
      t2RhythmScheduleCandidateNetworkEvaluation: {
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        status: 'phase1_readonly_evaluation_ready',
        candidateId: 'runtime-t2-network-candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        canEnterC1913Phase1Selection: true,
        conflictSummary: {
          conflictCodes: [],
          priorityOverrideBlocked: false,
        },
        scheduleTrustEvidence: {
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          selectionReceiptCount: 0,
          selectorReceiptAuditStatus: 'missing',
        },
      },
    }))

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    const runtimeT2Evidence = result.targetFeasibility
      ?.accelerationProposal
      ?.calculationBasis
      .runtimeContext
      ?.t2RhythmScheduleEvidence as Record<string, any> | undefined
    const assembly = runtimeT2Evidence?.durationInputAssembly

    expect(runtimeT2Evidence).toEqual(expect.objectContaining({
      source: 'schedule_acceleration_runtime_duration_input_assembly',
    }))
    expect(assembly).toEqual(expect.objectContaining({
      inputChannels: expect.objectContaining({
        t2RhythmScheduleCandidatePackage: expect.objectContaining({
          source: 'project_metadata',
          status: 'ready',
          tier: 'T2',
        }),
        t2RhythmScheduleCandidateNetworkEvaluation: expect.objectContaining({
          source: 'project_metadata',
          status: 'ready',
          tier: 'T2',
        }),
      }),
      assemblyGate: expect.objectContaining({
        status: 'candidate_conflict',
        canWriteTaskDependencies: false,
        canWritePlanDates: false,
        conflictCodes: expect.arrayContaining([
          't2_standard_library_live_replay_trust_gate_missing',
        ]),
      }),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
    expect(runtimeT2Evidence?.writesTaskDependencies).toBe(false)
    expect(runtimeT2Evidence?.writesPlanDates).toBe(false)
    expect(runtimeT2Evidence?.writesCriticalPathFacts).toBe(false)
    expect(assembly?.mutationBoundary?.writesRuntimePublications).toBe(false)
    expect(result.targetFeasibility?.accelerationProposal?.mode).toBe('preview_only')
  })

  it('uses the committed project construction organization scenario before recomputing from hydrated wizard facts', async () => {
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => ({
      ...input,
      projectGenerationFacts: {
        businessType: 'residential',
        methodVariantCodes: ['pile', 'vertical_only', 'no_horizontal_strut'],
        buildingCount: 3,
        basementLevelCount: 2,
        scopeOrganizationFacts: {
          buildingObjectCount: 3,
          sharedBasementObjectCount: 1,
          sharedBasementServiceTargetCount: 3,
          organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
        },
      },
      constructionOrganizationScenario: {
        source: 'construction_organization_scenario_selector',
        sourceVersion: 'committed-snapshot-test',
        recommendedScenarioIds: ['excavation_before_pile'],
        recommendedPlanOption: {
          optionId: 'committed-excavation-before-pile',
          source: 'construction_organization_plan_option',
          selectedScenarioIds: ['excavation_before_pile'],
          combinedScore: 0.91,
          confidence: 'high',
          evaluation: {
            recoveryFactorHint: 1.09,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          },
        },
        planOptions: [],
        scenarioRecommendations: {
          accelerationRecovery: {
            useCase: 'accelerationRecovery',
            optionId: 'committed-excavation-before-pile',
            selectedScenarioIds: ['excavation_before_pile'],
            recommendationBasis: ['project_metadata_committed_snapshot'],
            confidence: 'high',
            actionability: 'actionable',
            recoveryFactorHint: 1.09,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
          },
        },
        confidence: 'high',
        frontendInputRequired: false,
        boundaryPolicy: {
          directSeedMutation: false,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
          virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write',
        },
        candidates: [],
        factBasis: {},
      },
    }))

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
    })

    expect(result.targetFeasibility?.accelerationProposal?.calculationBasis.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      sourceVersion: 'committed-snapshot-test',
      recommendedScenarioIds: ['excavation_before_pile'],
      recommendedPlanOption: expect.objectContaining({
        optionId: 'committed-excavation-before-pile',
      }),
      scenarioRecommendations: expect.objectContaining({
        accelerationRecovery: expect.objectContaining({
          recommendationBasis: ['project_metadata_committed_snapshot'],
        }),
      }),
    }))
  })

  it('records v1.4.22.5 runtime consumer evidence for critical-path and construction-organization artifacts consumed by runtime acceleration', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordScheduleAccelerationRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      runtimeEntryRef: 'scheduleAccelerationRuntimeService:evaluateRuntimeScheduleAcceleration',
      observedAt: '2026-06-15T08:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v6'],
        },
        {
          assetKey: 'construction_organization_plan_network' as any,
          publicationKey: 'construction_org_plan_network_runtime:project-1',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:construction-org-plan-network:project-1'],
          observationContext: { businessType: 'general_civil', optionId: 'option-ready' },
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v6',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v6'],
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 2,
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
        'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
        'scheduleAccelerationRuntimeService',
        'schedule_acceleration_runtime',
      ],
      [
        'construction_organization_plan_network',
        'construction_org_plan_network_runtime:project-1',
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
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v6'],
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v6',
          publicationStatus: 'published',
          sourceEvidenceRefs: ['runtime_publication:dependency-rule:dependency-v6'],
        },
      ],
    })

    expect(result.targetFeasibility?.scenario).toBe('runtime_delay_recovery')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls').map((call) => call.params[0])).toEqual([
      'projectRemainingDurationForecastService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'dependency_rule_candidate',
        'duration_learning_runtime:dependency_rule_candidate:dependency-v6',
        'scheduleAccelerationService',
        'schedule_acceleration',
      ],
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
        'scheduleAccelerationRuntimeService',
        'schedule_acceleration_runtime',
      ],
    ])
  })

  it('records read-only duration input assembly evidence refs when E5 runtime consumes T2 assembly evidence', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => ({
      ...input,
      t2RhythmScheduleCandidatePackage: {
        source: 't2_division_rhythm_schedule_candidate_package',
        status: 'schedulable_candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      },
      t2RhythmScheduleCandidateNetworkEvaluation: {
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        status: 'phase1_readonly_evaluation_ready',
        candidateId: 'runtime-t2-network-candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        canEnterC1913Phase1Selection: true,
        conflictSummary: { conflictCodes: [], priorityOverrideBlocked: false },
        scheduleTrustEvidence: {
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          selectionReceiptCount: 0,
          selectorReceiptAuditStatus: 'missing',
        },
      },
    }))

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T08:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'critical_path_rule_candidate',
          publicationKey: 'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
          publicationStatus: 'runtime_published',
          sourceEvidenceRefs: ['runtime_publication:critical-path-rule:critical-v6'],
        },
      ],
    })

    const runtimeCalls = callsForTable(calls, 'runtime_consumer_runtime_calls')
    const observations = callsForTable(calls, 'runtime_consumer_observations')
    expect(runtimeCalls.map((call) => call.params[0])).toEqual([
      'projectRemainingDurationForecastService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(observations.map((call) => call.params.slice(0, 4))).toEqual([
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
        'projectRemainingDurationForecastService',
        'remaining_duration_forecast',
      ],
      [
        'critical_path_rule_candidate',
        'duration_learning_runtime:critical_path_rule_candidate:critical-v6',
        'scheduleAccelerationRuntimeService',
        'schedule_acceleration_runtime',
      ],
    ])
    const runtimeCall = runtimeCalls.find((call) => call.params[0] === 'scheduleAccelerationRuntimeService')
    expect(runtimeCall?.params[4]).toEqual(expect.arrayContaining([
      'schedule_acceleration_runtime:project-1',
      'duration_input_assembly:project-1:schedule_acceleration',
    ]))
    const runtimeObservation = observations.find((call) => call.params[2] === 'scheduleAccelerationRuntimeService')
    expect(runtimeObservation?.params[5]).toEqual(expect.objectContaining({
      projectId: 'project-1',
      runtimeConsumer: 'scheduleAccelerationRuntimeService',
    }))
    expect(runtimeObservation?.params[6]).toEqual(expect.arrayContaining([
      'schedule_acceleration_runtime:project-1',
      'duration_input_assembly:project-1:schedule_acceleration',
    ]))
    expect(runtimeObservation?.params[7]).toBe(false)
    expect(runtimeObservation?.params[8]).toBe(false)
  })

  it('records read-only duration input assembly runtime call without fabricating artifact observations', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    mocks.hydrateDurationAlgorithmInput.mockImplementation(async (input) => ({
      ...input,
      t2RhythmScheduleCandidatePackage: {
        source: 't2_division_rhythm_schedule_candidate_package',
        status: 'schedulable_candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      },
      t2RhythmScheduleCandidateNetworkEvaluation: {
        source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
        status: 'phase1_readonly_evaluation_ready',
        candidateId: 'runtime-t2-network-candidate',
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        canEnterC1913Phase1Selection: true,
        conflictSummary: { conflictCodes: [], priorityOverrideBlocked: false },
        scheduleTrustEvidence: {
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          selectionReceiptCount: 0,
          selectorReceiptAuditStatus: 'missing',
        },
      },
    }))

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T08:00:00.000Z',
    })

    const runtimeCalls = callsForTable(calls, 'runtime_consumer_runtime_calls')
    expect(runtimeCalls.map((call) => call.params[0])).toEqual(expect.arrayContaining([
      'projectRemainingDurationForecastService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ]))
    expect(runtimeCalls).toHaveLength(3)
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
    const runtimeCall = runtimeCalls.find((call) => call.params[0] === 'scheduleAccelerationRuntimeService')
    expect(runtimeCall?.params[3]).toEqual(expect.objectContaining({
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
    expect(runtimeCall?.params[4]).toEqual(expect.arrayContaining([
      'schedule_acceleration_runtime:project-1',
      'duration_input_assembly:project-1:schedule_acceleration',
    ]))
    expect(runtimeCall?.params[5]).toBe(false)
    expect(runtimeCall?.params[6]).toBe(false)
  })

  it('rejects client-supplied proposal adoption before any decision or outcome write', async () => {
    mocks.executeSQL.mockResolvedValue([])

    await expect(recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      proposal: {
        targetEndDate: '2027-03-31',
        naturalEndDate: '2027-04-30',
        totalRecoverDays: 12,
      },
      outcomeRef: 'forged-client-outcome',
    } as any)).rejects.toMatchObject({
      code: 'ACCELERATION_RECOMMENDATION_ID_REQUIRED',
      statusCode: 400,
    })

    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('keys adoption evidence by immutable recommendation and task-commit identity', () => {
    const first = buildScheduleAccelerationRecommendationKey({
      recommendationId: 'recommendation-1',
      taskCommitRequestId: 'task-commit-1',
    } as any)
    const second = buildScheduleAccelerationRecommendationKey({
      recommendationId: 'recommendation-2',
      taskCommitRequestId: 'task-commit-2',
    } as any)

    expect(first).toBe('schedule_acceleration:recommendation-1:task-commit-1')
    expect(second).toBe('schedule_acceleration:recommendation-2:task-commit-2')
    expect(second).not.toBe(first)
  })

  it('binds the recommendation authority read to recommendation and project identities', async () => {
    const authority = mockAuthoritativeAccelerationAdoption()
    mockSuccessfulAdoptionPersistence()

    await recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:20:00.000Z',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    })

    const recommendationRead = mocks.query.mock.calls
      .map(([sql, params]) => ({ sql: String(sql), params: params as unknown[] }))
      .find((call) => call.sql.includes('FROM public.schedule_acceleration_recommendations'))
    expect(recommendationRead?.sql).toMatch(/WHERE id = \$1\s+AND project_id = \$2/i)
    expect(recommendationRead?.params).toEqual(['recommendation-1', 'project-1'])
  })

  it('persists authoritative recommendation and commit binding in append-only adoption context', async () => {
    const authority = mockAuthoritativeAccelerationAdoption()
    mockSuccessfulAdoptionPersistence()

    await recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:20:00.000Z',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    })

    const actionInsert = mocks.executeSQL.mock.calls
      .map(([sql, params]) => ({ sql: String(sql), params: params as unknown[] }))
      .find((call) => call.sql.includes('INSERT INTO recommendation_actions'))
    expect(actionInsert?.params[2]).toBe('schedule_acceleration:recommendation-1:task-commit-request-1')
    expect(actionInsert?.params[10]).toEqual(expect.objectContaining({
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      operationsHash: authority.operationsHash,
      taskCommitLedgerId: 'commit-ledger-1',
      taskCommitRequestId: 'task-commit-request-1',
    }))
    expect(mocks.executeSQL.mock.calls.some(([sql]) => String(sql).includes('UPDATE recommendation_actions'))).toBe(false)
  })

  it('treats a repeated immutable adoption identity as a read-only replay', async () => {
    const authority = mockAuthoritativeAccelerationAdoption()
    mocks.executeSQL.mockResolvedValueOnce([{
      id: 'existing-action-1',
      adopted_at: '2027-02-15T00:20:00.000Z',
    }])

    const result = await recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:25:00.000Z',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    })

    expect(result).toEqual(expect.objectContaining({
      adopted: true,
      recommendationKey: 'schedule_acceleration:recommendation-1:task-commit-request-1',
      adoptedAt: '2027-02-15T00:20:00.000Z',
    }))
    expect(mocks.executeSQL).toHaveBeenCalledTimes(1)
    expect(mocks.executeSQL.mock.calls.some(([sql]) => /INSERT|UPDATE/i.test(String(sql)))).toBe(false)
  })

  it('uses an atomic no-op insert and exact readback for a concurrent immutable adoption replay', async () => {
    const authority = mockAuthoritativeAccelerationAdoption()
    mocks.executeSQL
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'existing-action-1',
        adopted_at: '2027-02-15T00:20:00.000Z',
      }])

    const result = await recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:25:00.000Z',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    })

    expect(result).toEqual(expect.objectContaining({
      adopted: true,
      adoptedAt: '2027-02-15T00:20:00.000Z',
    }))
    expect(mocks.executeSQL).toHaveBeenCalledTimes(3)
    expect(String(mocks.executeSQL.mock.calls[1]?.[0])).toMatch(
      /ON CONFLICT\s*\(project_id, recommendation_kind, recommendation_key, action_type\)\s*DO NOTHING\s*RETURNING id, adopted_at/i,
    )
    expect(mocks.executeSQL.mock.calls[2]?.[1]).toEqual([
      'project-1',
      'schedule_acceleration',
      'schedule_acceleration:recommendation-1:task-commit-request-1',
      'adopted',
    ])
    expect(mocks.executeSQL.mock.calls.some(([sql]) => String(sql).includes('UPDATE recommendation_actions'))).toBe(false)
  })

  it('fails closed when a no-op adoption insert has no exact conflict readback', async () => {
    const authority = mockAuthoritativeAccelerationAdoption()
    mocks.executeSQL
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await expect(recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      adoptedAt: '2027-02-15T00:25:00.000Z',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    })).rejects.toMatchObject({
      code: 'ACCELERATION_ADOPTION_CONFLICT_READBACK_MISSING',
      statusCode: 409,
    })
  })

  it.each([
    {
      name: 'hash mismatch',
      expectedCode: 'ACCELERATION_RECOMMENDATION_HASH_MISMATCH',
      recommendation: { recommendation_hash: 'different-hash' },
    },
    {
      name: 'expired recommendation',
      expectedCode: 'ACCELERATION_RECOMMENDATION_EXPIRED',
      recommendation: { expires_at: '2000-01-01T00:00:00.000Z' },
    },
    {
      name: 'project mismatch',
      expectedCode: 'ACCELERATION_RECOMMENDATION_PROJECT_MISMATCH',
      recommendation: { project_id: 'project-2' },
    },
    {
      name: 'unsuccessful commit',
      expectedCode: 'ACCELERATION_TASK_COMMIT_NOT_SUCCEEDED',
      commit: { status: 'running' },
    },
    {
      name: 'actor mismatch',
      expectedCode: 'ACCELERATION_TASK_COMMIT_ACTOR_MISMATCH',
      commit: { requested_by: 'user-2' },
    },
    {
      name: 'recommendation binding mismatch',
      expectedCode: 'ACCELERATION_TASK_COMMIT_BINDING_MISMATCH',
      commit: { recommendation_id: 'recommendation-2' },
    },
    {
      name: 'operations hash mismatch',
      expectedCode: 'ACCELERATION_TASK_COMMIT_OPERATIONS_MISMATCH',
      commit: { operations_hash: 'different-operations-hash' },
    },
    {
      name: 'unavailable typed production-day fact',
      expectedCode: 'ACCELERATION_RECOMMENDATION_FACTS_UNAVAILABLE',
      recommendation: {
        proposal: buildAuthoritativeAccelerationProposal({
          totalRecover: {
            ...buildAvailableDurationMetric(12, 'construction_production_day'),
            value: null,
            availability: 'unavailable',
            unavailableReason: 'construction_calendar_identity_missing',
          },
        }),
      },
    },
  ])('rejects $name before any adoption, outcome, or runtime evidence mutation', async ({
    expectedCode,
    recommendation,
    commit,
  }) => {
    const authority = mockAuthoritativeAccelerationAdoption({ recommendation, commit })

    await expect(recordScheduleAccelerationRecommendationAdoption({
      projectId: 'project-1',
      adoptedBy: 'user-1',
      recommendationId: 'recommendation-1',
      recommendationHash: authority.recommendationHash,
      taskCommitRequestId: 'task-commit-request-1',
    } as any)).rejects.toMatchObject({
      code: expectedCode,
      statusCode: expect.any(Number),
    })

    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('records a reasoned call-only trace when no published artifact or assembly evidence exists', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    await evaluateRuntimeScheduleAcceleration({
      projectId: 'project-1',
      targetEndDate: '2026-06-25',
      asOfDate: '2026-06-10',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeConsumerObservedAt: '2026-06-15T08:00:00.000Z',
    })

    const runtimeCalls = callsForTable(calls, 'runtime_consumer_runtime_calls')
    expect(runtimeCalls.map((call) => call.params[0])).toEqual([
      'projectRemainingDurationForecastService',
      'scheduleAccelerationService',
      'scheduleAccelerationRuntimeService',
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
    const runtimeCall = runtimeCalls.find((call) => call.params[0] === 'scheduleAccelerationRuntimeService')
    expect(runtimeCall?.params[3]).toEqual(expect.objectContaining({
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
    expect(runtimeCall?.params[4]).toEqual(['schedule_acceleration_runtime:project-1'])
  })
})
