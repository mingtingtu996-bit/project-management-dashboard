import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    tasks: [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-04',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        is_critical: false,
      },
    ],
    task_dependencies: [
      {
        id: 'dep-task-c-task-a',
        project_id: 'project-1',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ],
    task_critical_overrides: [],
  }
  const updates: Array<{ sql: string; params: any[] }> = []

  const executeSQL = vi.fn(async (query: string, params: any[] = []) => {
    const sql = query.trim().toLowerCase()

    if (sql.startsWith('select') && sql.includes('from tasks')) {
      const projectId = params[0]
      return tables.tasks.filter((row) => row.project_id === projectId).map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from task_critical_overrides')) {
      const projectId = params[0]
      return tables.task_critical_overrides
        .filter((row) => row.project_id === projectId)
        .map((row) => ({ ...row }))
    }

    if (sql.startsWith('select') && sql.includes('from task_dependencies')) {
      const projectId = params[0]
      const taskIds = new Set(Array.isArray(params[1]) ? params[1] : [])
      return tables.task_dependencies
        .filter((row) => row.project_id === projectId)
        .filter((row) => taskIds.size === 0 || taskIds.has(row.task_id))
        .filter((row) => String(row.status ?? 'active') === 'active')
        .filter((row) => row.required_for_start !== false)
        .map((row) => ({ ...row }))
    }

    if (sql.startsWith('delete from task_critical_overrides') && sql.includes('where id = ? and project_id = ?')) {
      const [overrideId, projectId] = params
      tables.task_critical_overrides = tables.task_critical_overrides.filter(
        (row) => !(row.id === overrideId && row.project_id === projectId),
      )
      return []
    }

    if (sql.startsWith('delete from task_critical_overrides') && sql.includes('where project_id = ? and task_id = ? and mode = ?')) {
      const [projectId, taskId, mode] = params
      tables.task_critical_overrides = tables.task_critical_overrides.filter(
        (row) => !(row.project_id === projectId && row.task_id === taskId && row.mode === mode),
      )
      return []
    }

    if (sql.startsWith('insert into task_critical_overrides')) {
      const [id, projectId, taskId, mode, anchorType, leftTaskId, rightTaskId, reason, createdBy, createdAt, updatedAt] = params
      tables.task_critical_overrides.push({
        id,
        project_id: projectId,
        task_id: taskId,
        mode,
        anchor_type: anchorType,
        left_task_id: leftTaskId,
        right_task_id: rightTaskId,
        reason,
        created_by: createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return []
    }

    if (/^update\s+tasks\s+set/.test(sql)) {
      updates.push({ sql: query, params })
      const [isCritical, totalFloatDays, freeFloatDays, criticalityWeight, _updatedAt, taskId, projectId] = params
      const row = tables.tasks.find((task) => task.id === taskId && task.project_id === projectId)
      if (row) {
        row.is_critical = isCritical
        row.total_float_days = totalFloatDays
        row.free_float_days = freeFloatDays
        row.criticality_weight = criticalityWeight
      }
      return []
    }

    return []
  })

  const rawQuery = vi.fn(async (_query: string, _params: any[] = []) => ({ rows: [] as Row[] }))

  return {
    tables,
    updates,
    executeSQL,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    recordDurationAccuracyPrediction: vi.fn(),
    recordDurationAccuracyBacktest: vi.fn(),
    backtestEarliestPendingDurationAccuracyPrediction: vi.fn(),
    listCurrentTaskDurationForecasts: vi.fn(),
    resolveConstructionCalendarContext: vi.fn(),
    rawQuery,
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../services/durationAlgorithmAccuracyService.js', () => ({
  recordDurationAccuracyPrediction: mocks.recordDurationAccuracyPrediction,
  recordDurationAccuracyBacktest: mocks.recordDurationAccuracyBacktest,
  backtestEarliestPendingDurationAccuracyPrediction: mocks.backtestEarliestPendingDurationAccuracyPrediction,
}))

vi.mock('../services/taskDurationForecastService.js', () => ({
  listCurrentTaskDurationForecasts: mocks.listCurrentTaskDurationForecasts,
}))

vi.mock('../services/constructionCalendar.js', async () => {
  const actual = await vi.importActual<typeof import('../services/constructionCalendar.js')>('../services/constructionCalendar.js')
  return {
    ...actual,
    resolveConstructionCalendarContext: mocks.resolveConstructionCalendarContext,
  }
})

const {
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  evaluateCriticalPathRuleCandidateLiveLearningEvidence,
  getProjectCriticalPathSnapshot,
  listCriticalPathOverrides,
  recalculateProjectCriticalPath,
} = await import('../services/projectCriticalPathService.js')

describe('project critical path service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        is_critical: false,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-04',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
        is_critical: false,
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-c-task-a',
        project_id: 'project-1',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]
    mocks.tables.task_critical_overrides = []
    mocks.updates.length = 0
    mocks.recordDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.recordDurationAccuracyBacktest.mockResolvedValue(null)
    mocks.backtestEarliestPendingDurationAccuracyPrediction.mockResolvedValue(null)
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([])
    mocks.resolveConstructionCalendarContext.mockResolvedValue({ basis: 'calendar_day', windows: [] })
  })

  it('recomputes critical tasks from CPM without reading legacy task flags', async () => {
    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.projectId).toBe('project-1')
    expect(result.criticalTaskIds).toEqual(['task-b'])
    expect(result.projectDuration).toBe(8)
    expect(result.snapshot.autoTaskIds).toEqual(['task-b'])
  })

  it('requires prediction, outcome, publication, lineage, and release gates before critical path rules are live-learning ready', () => {
    const decision = evaluateCriticalPathRuleCandidateLiveLearningEvidence({
      criticalPathSnapshot: {
        projectId: 'project-1',
        autoTaskIds: ['task-b'],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: {
          id: 'project-1-auto-critical-chain',
          source: 'auto',
          taskIds: ['task-b'],
          totalDurationDays: 8,
          displayLabel: 'A',
        },
        alternateChains: [],
        displayTaskIds: ['task-b'],
        watchedTaskIds: [],
        edges: [],
        tasks: [{
          taskId: 'task-b',
          title: 'B',
          floatDays: 0,
          durationDays: 8,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
        }],
        projectDurationDays: 8,
        calculatedAt: '2026-06-14T00:00:00.000Z',
        calculationStatus: 'fresh',
        networkLineage: {
          criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
          taskNetworkInputHash: 'sha256:task-network',
          dependencyInputHash: 'sha256:dependency-network',
          criticalPathInputHash: 'sha256:critical-path-input',
          criticalSetHash: 'sha256:critical-set',
          dependencyRuleVersion: 'task_dependencies:sha256:rules',
          baselineVersionIds: [],
          baselineItemIds: [],
          baselineVersionSource: 'not_linked',
        },
      },
      criticalPathOutcomeEventRecorded: true,
      approvedCriticalPathRuleCandidateRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      criticalPathRulePublicationWriterReady: true,
      criticalPathRuleLineageRecorded: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision).toEqual({
      status: 'critical_path_rule_candidate_live_learning_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['global', 'industry', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        criticalPathProjectionEvidencePresent: true,
        approvedCriticalPathRuleCandidateRecorded: true,
        criticalPathRulePublicationWriterReady: true,
        criticalPathRuleLineageRecorded: true,
        criticalPathFactsRemainLocked: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
        criticalTaskCount: 1,
        projectedFloatTaskCount: 1,
      },
      missingReasons: [],
    })
  })

  it('keeps critical path rule learning not ready when prediction, outcome, scope, or release evidence is missing', () => {
    const decision = evaluateCriticalPathRuleCandidateLiveLearningEvidence({
      criticalPathSnapshot: {
        projectId: 'project-empty',
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
        calculationStatus: 'empty_after_failure',
      },
      criticalPathOutcomeEventRecorded: false,
      approvedCriticalPathRuleCandidateRecorded: false,
      enabledLearningScopes: ['company'],
      runtimeConsumerUsesPublishedArtifact: false,
      criticalPathRulePublicationWriterReady: false,
      criticalPathRuleLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('critical_path_rule_candidate_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      criticalPathProjectionEvidencePresent: false,
      approvedCriticalPathRuleCandidateRecorded: false,
      criticalPathRulePublicationWriterReady: false,
      criticalPathRuleLineageRecorded: false,
      criticalPathFactsRemainLocked: true,
      enabledLearningScopes: ['company'],
      criticalTaskCount: 0,
      projectedFloatTaskCount: 0,
    }))
    expect(decision.missingReasons).toEqual([
      'critical_path_prediction_snapshot_required',
      'critical_path_actual_outcome_required',
      'approved_critical_path_rule_candidate_required',
      'critical_path_rule_publication_writer_required',
      'critical_path_rule_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ])
  })

  it('records CPM project-duration prediction snapshots for accuracy backtesting', async () => {
    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.projectDuration).toBe(8)
    expect(result.snapshot.networkLineage).toEqual(expect.objectContaining({
      criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
      taskNetworkInputHash: expect.stringMatching(/^sha256:/),
      dependencyInputHash: expect.stringMatching(/^sha256:/),
      criticalPathInputHash: expect.stringMatching(/^sha256:/),
      criticalSetHash: expect.stringMatching(/^sha256:/),
      dependencyRuleVersion: expect.stringMatching(/^task_dependencies:sha256:/),
      baselineVersionSource: 'not_linked',
    }))
    expect(mocks.recordDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      engineCode: 'critical_path_cpm',
      outputKind: 'critical_path_project_duration',
      projectId: 'project-1',
      predictedDurationDays: 8,
      predictionBasis: 'critical_path_runtime_snapshot',
      networkLineage: expect.objectContaining({
        criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
        taskNetworkInputHash: expect.stringMatching(/^sha256:/),
        dependencyInputHash: expect.stringMatching(/^sha256:/),
        criticalPathInputHash: expect.stringMatching(/^sha256:/),
        criticalSetHash: expect.stringMatching(/^sha256:/),
        dependencyRuleVersion: expect.stringMatching(/^task_dependencies:sha256:/),
        baselineVersionSource: 'not_linked',
      }),
      predictionContext: expect.objectContaining({
        autoTaskIds: ['task-b'],
        taskCount: 3,
        networkLineage: expect.objectContaining({
          criticalSetHash: expect.stringMatching(/^sha256:/),
        }),
      }),
    }))
  })

  it('closes the earliest pending CPM prediction instead of the current recalculation key when the project is complete', async () => {
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.end_date,
    }))

    await recalculateProjectCriticalPath('project-1')

    expect(mocks.recordDurationAccuracyBacktest).not.toHaveBeenCalled()
    expect(mocks.backtestEarliestPendingDurationAccuracyPrediction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      engineCode: 'critical_path_cpm',
      actualStartDate: '2026-04-01',
      actualFinishDate: '2026-04-08',
      actualDurationDays: 8,
      actualContext: expect.objectContaining({
        source: 'completed_project_task_span',
        durationBasis: 'project_actual_span',
        skippedCurrentDedupeKey: expect.stringContaining(':critical_path_cpm'),
      }),
    }))
  })

  it('records completed critical-path replay as a plan-network outcome without mutating facts or runtime artifacts', async () => {
    mocks.tables.tasks = mocks.tables.tasks.map((row) => ({
      ...row,
      status: 'completed',
      progress: 100,
      actual_start_date: row.start_date,
      actual_end_date: row.end_date,
    }))

    const result = await recalculateProjectCriticalPath('project-1')

    expect(result.projectDuration).toBe(8)
    const outcomeInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )

    expect(outcomeInsert).toBeTruthy()
    expect(String(outcomeInsert?.[0]).toLowerCase()).toContain('on conflict (id) do update')
    expect(String(outcomeInsert?.[0]).toLowerCase()).not.toContain('insert into public.task_critical_overrides')
    expect(String(outcomeInsert?.[0]).toLowerCase()).not.toContain('update public.task_critical_overrides')
    expect(String(outcomeInsert?.[0]).toLowerCase()).not.toContain('insert into public.tasks')
    expect(String(outcomeInsert?.[0]).toLowerCase()).not.toContain('update public.tasks')
    expect(outcomeInsert?.[1]).toEqual([
      expect.stringMatching(/^critical-path-cpm:project-1:sha256:/),
      'critical_path_rule_candidate',
      'accepted',
      expect.stringMatching(/^critical_path_cpm:project-1:sha256:/),
      'project',
      null,
      'project-1',
      null,
      expect.objectContaining({
        source: 'project_critical_path_cpm',
        algorithm_version: 'critical_path_cpm_v1',
        prediction_duration_days: 8,
        actual_duration_days: 8,
        duration_error_days: 0,
        outcome_tolerance_days: 2,
        critical_task_count: 1,
        projected_float_task_count: 1,
        writes_runtime_directly: false,
        writes_fact_directly: false,
      }),
      false,
      false,
    ])
  })

  it('projects live CPM criticality and float fields back to task rows after recalculation', async () => {
    await recalculateProjectCriticalPath('project-1')

    expect(mocks.tables.tasks.find((row) => row.id === 'task-a')).toEqual(expect.objectContaining({
      is_critical: false,
      total_float_days: 2,
      free_float_days: 0,
      criticality_weight: 1.2,
    }))
    expect(mocks.tables.tasks.find((row) => row.id === 'task-b')).toEqual(expect.objectContaining({
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
    }))
    expect(mocks.tables.tasks.find((row) => row.id === 'task-c')).toEqual(expect.objectContaining({
      is_critical: false,
      total_float_days: 2,
      free_float_days: 2,
      criticality_weight: 1.2,
    }))
    expect(mocks.updates).toHaveLength(3)
  })

  it('uses E2 remaining-duration forecasts for in-progress CPM task nodes', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-running',
        project_id: 'project-runtime',
        title: 'Running structure work',
        start_date: '2026-06-01',
        end_date: '2026-06-10',
        planned_end_date: '2026-06-10',
        status: 'in_progress',
        progress: 70,
        actual_start_date: '2026-06-01',
      },
      {
        id: 'task-successor',
        project_id: 'project-runtime',
        title: 'Successor work',
        start_date: '2026-06-11',
        end_date: '2026-06-15',
        planned_end_date: '2026-06-15',
        status: 'todo',
        progress: 0,
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-successor-running',
        project_id: 'project-runtime',
        task_id: 'task-successor',
        dependency_task_id: 'task-running',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'task-running',
        remainingDurationDays: 2,
        forecastFinishDate: '2026-06-12',
      },
    ])

    const result = await recalculateProjectCriticalPath('project-runtime')

    expect(mocks.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(
      ['task-running', 'task-successor'],
      expect.any(Object),
    )
    expect(result.projectDuration).toBe(7)
    expect(result.snapshot.tasks.find((task) => task.taskId === 'task-running')?.durationDays).toBe(2)
  })

  it('flags high-variance near-critical chains from E2 probability duration windows', async () => {
    mocks.tables.tasks = [
      {
        id: 'main-critical',
        project_id: 'project-variance',
        title: 'Main critical chain',
        start_date: '2026-06-01',
        end_date: '2026-06-10',
        planned_end_date: '2026-06-10',
        status: 'in_progress',
        progress: 50,
        actual_start_date: '2026-06-01',
      },
      {
        id: 'near-critical-variable',
        project_id: 'project-variance',
        title: 'Near critical high variance work',
        start_date: '2026-06-01',
        end_date: '2026-06-09',
        planned_end_date: '2026-06-09',
        status: 'in_progress',
        progress: 50,
        actual_start_date: '2026-06-01',
      },
    ]
    mocks.tables.task_dependencies = []
    mocks.listCurrentTaskDurationForecasts.mockResolvedValue([
      {
        taskId: 'main-critical',
        remainingDurationDays: 10,
        probabilityDuration: {
          p50RemainingDays: 10,
          p80RemainingDays: 11,
          standardDeviationDays: 1,
          confidenceBandWidthDays: 1,
        },
      },
      {
        taskId: 'near-critical-variable',
        remainingDurationDays: 9,
        probabilityDuration: {
          p50RemainingDays: 9,
          p80RemainingDays: 16,
          standardDeviationDays: 4,
          confidenceBandWidthDays: 7,
        },
      },
    ])

    const snapshot = await getProjectCriticalPathSnapshot('project-variance')

    const nearCriticalTask = snapshot.tasks.find((task) => task.taskId === 'near-critical-variable') as any
    expect(nearCriticalTask).toEqual(expect.objectContaining({
      isAutoCritical: false,
      isHighVarianceNearCritical: true,
      p80DurationDays: 16,
      standardDeviationDays: 4,
    }))
    expect(snapshot.alternateChains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'auto',
        taskIds: ['near-critical-variable'],
        totalDurationDays: 9,
        p80DurationDays: 16,
        isHighVarianceNearCritical: true,
      }),
    ]))
  })

  it('uses construction production days for planned CPM task durations', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValue({
      basis: 'official_construction_calendar_seed',
      windows: [
        {
          startDate: '2026-02-03',
          endDate: '2026-02-04',
          windowType: 'official_holiday',
          shutdown: true,
        },
      ],
    })
    mocks.tables.tasks = [
      {
        id: 'task-calendar',
        project_id: 'project-1',
        title: 'Calendar-aware task',
        start_date: '2026-02-01',
        end_date: '2026-02-05',
        planned_end_date: '2026-02-05',
        is_critical: true,
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.tasks.find((task) => task.taskId === 'task-calendar')?.durationDays).toBe(3)
    expect(snapshot.projectDurationDays).toBe(3)
    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
    }))
  })

  it('uses elapsed inclusive duration for overlapped auto critical chains instead of serially summing task durations', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-overlap',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_end_date: '2026-04-05',
      },
      {
        id: 'task-c',
        project_id: 'project-overlap',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
      {
        id: 'task-b',
        project_id: 'project-overlap',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-07',
        planned_end_date: '2026-04-07',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-c-task-a',
        project_id: 'project-overlap',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'SS',
        lag_days: 2,
        required_for_start: true,
        status: 'active',
      },
    ]

    const result = await recalculateProjectCriticalPath('project-overlap')

    expect(result.projectDuration).toBe(8)
    expect(result.snapshot.primaryChain?.taskIds).toEqual(['task-a', 'task-c'])
    expect(result.snapshot.primaryChain?.totalDurationDays).toBe(8)
    expect(result.snapshot.projectDurationDays).toBe(8)
  })

  it('keeps create, delete, and refresh chained to override rows only', async () => {
    const initialSnapshot = await getProjectCriticalPathSnapshot('project-1')
    expect(initialSnapshot.manualAttentionTaskIds).toEqual([])
    expect(initialSnapshot.displayTaskIds).toEqual(['task-b'])
    expect(initialSnapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)

    const created = await createCriticalPathOverride('project-1', {
      task_id: 'task-a',
      mode: 'manual_attention',
      reason: '手动关注',
      created_by: 'user-1',
    })

    const refreshedAfterCreate = await recalculateProjectCriticalPath('project-1')
    expect(refreshedAfterCreate.snapshot.manualAttentionTaskIds).toEqual(['task-a'])
    expect(refreshedAfterCreate.snapshot.watchedTaskIds).toEqual(['task-a'])
    expect(refreshedAfterCreate.snapshot.displayTaskIds).toEqual(['task-b'])
    expect(refreshedAfterCreate.snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)

    await deleteCriticalPathOverride('project-1', created.id)

    const refreshedAfterDelete = await recalculateProjectCriticalPath('project-1')
    expect(refreshedAfterDelete.snapshot.manualAttentionTaskIds).toEqual([])
    expect(refreshedAfterDelete.snapshot.displayTaskIds).toEqual(['task-b'])
    expect(refreshedAfterDelete.snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)
  })

  it('builds a unified snapshot from auto and manual override rows', async () => {
    await createCriticalPathOverride('project-1', {
      task_id: 'task-a',
      mode: 'manual_attention',
      reason: '手动关注',
      created_by: 'user-1',
    })

    await createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      anchor_type: 'after',
      left_task_id: 'task-a',
      reason: '插在 A 后面',
      created_by: 'user-1',
    })

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.projectId).toBe('project-1')
    expect(snapshot.autoTaskIds).toEqual(['task-b'])
    expect(snapshot.manualAttentionTaskIds).toContain('task-a')
    expect(snapshot.manualInsertedTaskIds).toEqual(['task-c'])
    expect(snapshot.primaryChain).not.toBeNull()
    expect(snapshot.watchedTaskIds).toEqual(['task-a'])
    expect(snapshot.displayTaskIds).toEqual(['task-b', 'task-c'])
    expect(snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)
    expect(snapshot.edges.some((edge) => edge.source === 'manual_link')).toBe(true)

    const overrides = await listCriticalPathOverrides('project-1')
    expect(overrides).toHaveLength(2)
    expect(overrides.map((override) => override.mode)).toEqual(['manual_attention', 'manual_insert'])
  })

  it('returns an empty failure snapshot when CPM fails before any successful cache exists', async () => {
    mocks.tables.tasks = [
      {
        id: 'cycle-a',
        project_id: 'project-empty-failure',
        title: 'Cycle A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        is_critical: false,
      },
      {
        id: 'cycle-b',
        project_id: 'project-empty-failure',
        title: 'Cycle B',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        is_critical: false,
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-cycle-a-cycle-b',
        project_id: 'project-empty-failure',
        task_id: 'cycle-a',
        dependency_task_id: 'cycle-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-cycle-b-cycle-a',
        project_id: 'project-empty-failure',
        task_id: 'cycle-b',
        dependency_task_id: 'cycle-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-empty-failure')

    expect(snapshot.calculationStatus).toBe('empty_after_failure')
    expect(snapshot.displayTaskIds).toEqual([])
    expect(snapshot.tasks).toEqual([])
    expect(snapshot.projectDurationDays).toBe(0)
    expect(snapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('falls back to the last successful snapshot when a later recalculation fails', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-cache-failure',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        is_critical: true,
      },
      {
        id: 'task-b',
        project_id: 'project-cache-failure',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
        is_critical: false,
      },
    ]

    const successSnapshot = await getProjectCriticalPathSnapshot('project-cache-failure')
    expect(successSnapshot.displayTaskIds).toEqual(['task-b'])
    expect(successSnapshot.calculatedAt).toBeTruthy()
    expect(successSnapshot.calculationStatus).toBe('fresh')
    expect(successSnapshot.lastSuccessfulCalculatedAt).toBe(successSnapshot.calculatedAt)

    mocks.tables.tasks = [
      {
        id: 'cycle-a',
        project_id: 'project-cache-failure',
        title: 'Cycle A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        is_critical: false,
      },
      {
        id: 'cycle-b',
        project_id: 'project-cache-failure',
        title: 'Cycle B',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        is_critical: false,
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-cycle-a-cycle-b',
        project_id: 'project-cache-failure',
        task_id: 'cycle-a',
        dependency_task_id: 'cycle-b',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-cycle-b-cycle-a',
        project_id: 'project-cache-failure',
        task_id: 'cycle-b',
        dependency_task_id: 'cycle-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const failedSnapshot = await getProjectCriticalPathSnapshot('project-cache-failure')

    expect(failedSnapshot.calculationStatus).toBe('cached_after_failure')
    expect(failedSnapshot.displayTaskIds).toEqual(successSnapshot.displayTaskIds)
    expect(failedSnapshot.calculatedAt).toBe(successSnapshot.calculatedAt)
    expect(failedSnapshot.lastSuccessfulCalculatedAt).toBe(successSnapshot.calculatedAt)
    expect(failedSnapshot.calculationFailureMessage).toContain('CRITICAL_PATH_CYCLE_DETECTED')
  })

  it('rejects manual insert overrides without any anchor', async () => {
    await expect(createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      reason: 'missing anchors',
    })).rejects.toMatchObject({
      code: 'MANUAL_INSERT_REQUIRES_ANCHOR',
      statusCode: 422,
    })
  })

  it('rejects manual insert overrides without anchor type before hitting the database', async () => {
    await expect(createCriticalPathOverride('project-1', {
      task_id: 'task-c',
      mode: 'manual_insert',
      left_task_id: 'task-a',
      reason: 'missing anchor type',
    })).rejects.toMatchObject({
      code: 'MANUAL_INSERT_REQUIRES_ANCHOR_TYPE',
      statusCode: 422,
    })
  })

  it('prefers the chain with more level-one milestones when durations are tied', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
        is_milestone: true,
        milestone_level: 1,
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-01',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-c-task-a',
        project_id: 'project-1',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-a', 'task-c'])
    expect(snapshot.alternateChains[0]?.taskIds).toEqual(['task-b'])
    expect(snapshot.autoTaskIds).toEqual(['task-a', 'task-c', 'task-b'])
  })

  it('ranks auto parallel chains before manual inserts and breaks ties by latest finish date', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-a',
        project_id: 'project-1',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
      },
      {
        id: 'task-c',
        project_id: 'project-1',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-06',
        planned_end_date: '2026-04-06',
      },
      {
        id: 'task-b',
        project_id: 'project-1',
        title: 'B',
        start_date: '2026-04-03',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
      {
        id: 'task-d',
        project_id: 'project-1',
        title: 'D',
        start_date: '2026-04-04',
        end_date: '2026-04-04',
        planned_end_date: '2026-04-04',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-task-c-task-a',
        project_id: 'project-1',
        task_id: 'task-c',
        dependency_task_id: 'task-a',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'active',
      },
    ]

    await createCriticalPathOverride('project-1', {
      task_id: 'task-d',
      mode: 'manual_insert',
      anchor_type: 'after',
      left_task_id: 'task-b',
      reason: '插在 B 后面',
      created_by: 'user-1',
    })

    const snapshot = await getProjectCriticalPathSnapshot('project-1')

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-b'])
    expect(snapshot.alternateChains.map((chain) => ({ source: chain.source, taskIds: chain.taskIds }))).toEqual([
      { source: 'auto', taskIds: ['task-a', 'task-c'] },
      { source: 'manual_insert', taskIds: ['task-b', 'task-d'] },
    ])
  })

  it('supports typed dependencies with lag and ignores legacy task dependency cache', async () => {
    mocks.tables.tasks = [
      {
        id: 'legacy-critical',
        project_id: 'project-typed',
        title: 'Legacy cached critical flag',
        start_date: '2026-04-01',
        end_date: '2026-04-01',
        planned_end_date: '2026-04-01',
        is_critical: true,
      },
      {
        id: 'task-a',
        project_id: 'project-typed',
        title: 'A',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_end_date: '2026-04-05',
        dependencies: ['legacy-critical'],
      },
      {
        id: 'task-b',
        project_id: 'project-typed',
        title: 'B',
        start_date: '2026-04-03',
        end_date: '2026-04-05',
        planned_end_date: '2026-04-05',
      },
      {
        id: 'task-c',
        project_id: 'project-typed',
        title: 'C',
        start_date: '2026-04-03',
        end_date: '2026-04-08',
        planned_end_date: '2026-04-08',
      },
      {
        id: 'task-d',
        project_id: 'project-typed',
        title: 'D',
        start_date: '2026-04-01',
        end_date: '2026-04-02',
        planned_end_date: '2026-04-02',
      },
    ]
    mocks.tables.task_dependencies = [
      {
        id: 'dep-b-a-ss',
        project_id: 'project-typed',
        task_id: 'task-b',
        dependency_task_id: 'task-a',
        dependency_type: 'SS',
        lag_days: 2,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-c-b-ff',
        project_id: 'project-typed',
        task_id: 'task-c',
        dependency_task_id: 'task-b',
        dependency_type: 'FF',
        lag_days: 3,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-d-c-sf',
        project_id: 'project-typed',
        task_id: 'task-d',
        dependency_task_id: 'task-c',
        dependency_type: 'SF',
        lag_days: 8,
        required_for_start: true,
        status: 'active',
      },
      {
        id: 'dep-legacy-a-inactive',
        project_id: 'project-typed',
        task_id: 'task-a',
        dependency_task_id: 'legacy-critical',
        dependency_type: 'FS',
        lag_days: 0,
        required_for_start: true,
        status: 'inactive',
      },
    ]

    const snapshot = await getProjectCriticalPathSnapshot('project-typed')

    expect(snapshot.displayTaskIds).toEqual(['task-a', 'task-b', 'task-c', 'task-d'])
    expect(snapshot.displayTaskIds).not.toContain('legacy-critical')
    expect(snapshot.projectDurationDays).toBe(10)
    expect(snapshot.edges.filter((edge) => edge.source === 'dependency')).toEqual([
      expect.objectContaining({ fromTaskId: 'task-a', toTaskId: 'task-b', dependencyType: 'SS', lagDays: 2 }),
      expect.objectContaining({ fromTaskId: 'task-b', toTaskId: 'task-c', dependencyType: 'FF', lagDays: 3 }),
      expect.objectContaining({ fromTaskId: 'task-c', toTaskId: 'task-d', dependencyType: 'SF', lagDays: 8 }),
    ])
  })

  it('adds resource constraint edges so low-capacity same-resource work is not treated as unlimited parallel work', async () => {
    mocks.tables.tasks = [
      {
        id: 'pour-a',
        project_id: 'project-resource',
        title: 'Concrete pour zone A',
        standard_work_code: 'cast_in_place_concrete',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        metadata: {
          resourceProfile: {
            resourceClass: 'concrete_pour',
            parallelCapacity: 'low',
          },
        },
      },
      {
        id: 'pour-b',
        project_id: 'project-resource',
        title: 'Concrete pour zone B',
        standard_work_code: 'cast_in_place_concrete',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-05',
        metadata: {
          resourceProfile: {
            resourceClass: 'concrete_pour',
            parallelCapacity: 'low',
          },
        },
      },
    ]
    mocks.tables.task_dependencies = []

    const snapshot = await getProjectCriticalPathSnapshot('project-resource')

    expect(snapshot.projectDurationDays).toBe(10)
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromTaskId: 'pour-a',
        toTaskId: 'pour-b',
        source: 'resource_constraint',
        dependencyType: 'FS',
        lagDays: 0,
      }),
    ]))
  })
})
